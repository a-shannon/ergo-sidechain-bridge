import { createECDH, createHash } from 'crypto';

import blakejs from 'blakejs';
import { describe, expect, it, vi } from 'vitest';

import { getDupTreeDigest } from './avl-bridge.js';
import {
  AggregateSettlementService,
  AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS,
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance,
  prepareAuthenticatedSettlementUnsignedTxPure,
} from './aggregate-settlement-service.js';
import {
  AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
  AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS,
  buildAuthenticatedV2UnsignedSettlementPackage,
  createAuthenticatedV2UnsignedSettlementCompanion,
  validateAuthenticatedV2UnsignedSettlementCompanion,
  validateAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-unsigned-settlement-package.js';
import {
  assertPackageBoundAuthenticatedSettlementProvenance,
  assertJournaledUnsignedSettlementPackageDigest,
  bindAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-settlement-package-binding.js';
import { AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA } from './authenticated-spv-tracker-dual-observation.js';
import { AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES } from './authenticated-spv-tracker-reconstruction.js';
import { AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA } from './authenticated-v2-stateful-check-readiness.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  decodeCanonicalDlogSigmaPropRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';

const SIDECHAIN_ID = '11'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const EXECUTION_BLOCK_HASH = '22'.repeat(32);
const SIDECHAIN_TX_HASH = '33'.repeat(32);
const EVENT_INDEX = 7;
const AMOUNT = 1_000_000;
const RECIPIENT_TREE = `0008cd02${'44'.repeat(32)}`;
const TRACKER_NFT = '51'.repeat(32);
const DUP_NFT = '52'.repeat(32);
const TRACKER_TREE = `1008cd02${'53'.repeat(32)}`;
const DUP_TREE = `1008cd02${'54'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'55'.repeat(32)}`;
const STABLE_HEIGHT = 330_020;
const ANCHOR_HEIGHT = 330_000;
const OBSERVED_AT = '2026-07-14T14:00:00.000Z';
const TRACKER_AUTHORITY = sigmaProp(1);
const DUP_AUTHORITY = sigmaProp(2);
// The authenticated digest commits to insertion order; it is not a sorted-set digest.
const DUP_HISTORY = ['02'.repeat(32), '01'.repeat(32)];
const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

function sigmaProp(privateKeyByte: number): string {
  const ecdh = createECDH('secp256k1');
  const key = Buffer.alloc(32);
  key[31] = privateKeyByte;
  ecdh.setPrivateKey(key);
  return encodeSigmaPropRegister(ecdh.getPublicKey(undefined, 'compressed').toString('hex'));
}

function materializeBox(input: {
  transactionId: string;
  index: number;
  creationHeight: number;
  value: number;
  ergoTree: string;
  assets: Array<{ tokenId: string; amount: number }>;
  additionalRegisters: Record<string, string>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(TEST_WASM.I64.from_str(String(input.value)));
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(value, contract, input.creationHeight);
  try {
    for (const asset of input.assets) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(asset.tokenId),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str(String(asset.amount))),
      );
    }
    for (const [name, encoded] of Object.entries(input.additionalRegisters)) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(input.transactionId);
    const box = TEST_WASM.ErgoBox.from_box_candidate(candidate, transactionId, input.index);
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

async function observation(box: any) {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    const sigmaSerializedHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    return {
      box: {
        boxIdHex: box.boxId,
        transactionIdHex: box.transactionId,
        outputIndex: box.index,
        creationHeight: box.creationHeight,
        valueNanoErg: Number(box.value),
        ergoTreeHex: box.ergoTree,
        assets: box.assets.map((asset: any) => ({
          tokenIdHex: asset.tokenId,
          amount: String(asset.amount),
        })),
        additionalRegisters: structuredClone(box.additionalRegisters),
      },
      sigmaSerializedHex,
      sigmaSerializedSha256Hex: sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')),
    };
  } finally {
    parsed.free?.();
  }
}

async function fixture() {
  const burnLeaves = [
    {
      sidechainIdHex: SIDECHAIN_ID,
      sidechainBlockHashHex: EXECUTION_BLOCK_HASH,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: SIDECHAIN_ID,
        sidechainTxHashHex: SIDECHAIN_TX_HASH,
        eventIndex: EVENT_INDEX,
      }),
      sidechainTxHashHex: SIDECHAIN_TX_HASH,
      eventIndex: EVENT_INDEX,
      recipientErgoTreeHashHex: blake2b256Hex(Buffer.from(RECIPIENT_TREE, 'hex')),
      amountNanoErg: AMOUNT,
    },
    {
      sidechainIdHex: SIDECHAIN_ID,
      sidechainBlockHashHex: EXECUTION_BLOCK_HASH,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: SIDECHAIN_ID,
        sidechainTxHashHex: '66'.repeat(32),
        eventIndex: 8,
      }),
      sidechainTxHashHex: '66'.repeat(32),
      eventIndex: 8,
      recipientErgoTreeHashHex: '67'.repeat(32),
      amountNanoErg: 2_000_000,
    },
  ];
  const proof = buildTrustlessBurnInclusionProof(burnLeaves, burnLeaves[0].burnIdHex);
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: SIDECHAIN_HEIGHT,
    sidechainConsensusBlockHashHex: '21'.repeat(32),
    executionBlockHashHex: EXECUTION_BLOCK_HASH,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    burnLeafCount: burnLeaves.length,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '23'.repeat(32),
    finalityProofHashHex: '24'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '25'.repeat(32),
    finalityHorizonHeight: SIDECHAIN_HEIGHT,
    finalityHorizonHashHex: '26'.repeat(32),
  });
  const finalityProof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '27'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('wp-06-t10-offline-package', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(finalityProof);
  const trackerValue = encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: proof.bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '68'.repeat(32),
    anchorHeaderHeight: ANCHOR_HEIGHT,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
  const trackerKey = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH,
  });
  const trackerHistory = [{ key: trackerKey, value: trackerValue }];
  const trackerBox = materializeBox({
    transactionId: '71'.repeat(32),
    index: 0,
    creationHeight: ANCHOR_HEIGHT,
    value: 2_000_000,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(getAuthenticatedSpvTrackerDigest(trackerHistory)),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID, 'hex')),
      R7: encodeLongRegister(SIDECHAIN_HEIGHT),
      R8: encodeIntRegister(ANCHOR_HEIGHT + 1),
      R9: TRACKER_AUTHORITY,
    },
  });
  const dupDigest = getDupTreeDigest(DUP_HISTORY);
  const dupBox = materializeBox({
    transactionId: '72'.repeat(32),
    index: 1,
    creationHeight: ANCHOR_HEIGHT,
    value: 2_000_000,
    ergoTree: DUP_TREE,
    assets: [{ tokenId: DUP_NFT, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(2),
      R5: encodeAvlTreeRegister(Buffer.from(dupDigest, 'hex'), 0x0b, 1),
      R6: DUP_AUTHORITY,
    },
  });
  const vaultBox = materializeBox({
    transactionId: '73'.repeat(32),
    index: 2,
    creationHeight: ANCHOR_HEIGHT,
    value: AMOUNT + MINER_FEE + 1_000_000,
    ergoTree: VAULT_TREE,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from('74'.repeat(32), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('75'.repeat(20), 'hex')),
      R6: encodeLongRegister(AMOUNT),
      R7: encodeCollByteRegister(Buffer.from(RECIPIENT_TREE, 'hex')),
    },
  });
  const trackerInput = await observation(trackerBox);
  const duplicatePrevention = await observation(dupBox);
  const vault = await observation(vaultBox);
  const entry = {
    keyHex: trackerKey,
    valueHex: trackerValue,
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: SIDECHAIN_HEIGHT.toString(),
    executionBlockHashHex: EXECUTION_BLOCK_HASH,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '68'.repeat(32),
    anchorHeaderHeight: ANCHOR_HEIGHT,
    finality: {
      proofSystemId: 1,
      statementDigestHex: commitment.statementDigestHex,
      programIdHex: commitment.statement.programIdHex,
      verifierProfileIdHex: commitment.verifierProfileIdHex,
      proofPayloadDigestHex: commitment.payloadDigestHex,
      proofDigestHex: commitment.proofDigestHex,
    },
  };
  const trackerWithoutDigest = {
    schema: AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA,
    status: 'AGREED',
    observedAt: OBSERVED_AT,
    environment: 'testnet',
    sources: {
      primary: { role: 'primary', endpointOrigin: 'http://127.0.0.1:9053', network: 'testnet' },
      witness: { role: 'witness', endpointOrigin: 'http://127.0.0.1:9054', network: 'testnet' },
    },
    tracker: {
      nftIdHex: TRACKER_NFT,
      genesisBoxIdHex: trackerBox.boxId,
      finalityAttestorSigmaPropRegisterHex: TRACKER_AUTHORITY,
      ergoTreeSha256Hex: sha256Hex(Buffer.from(TRACKER_TREE, 'hex')),
      ergoTreeBytes: TRACKER_TREE.length / 2,
      sidechainIdHex: SIDECHAIN_ID,
      tipBoxIdHex: trackerBox.boxId,
      tipDigestHex: getAuthenticatedSpvTrackerDigest(trackerHistory),
      observationDigestHex: '76'.repeat(32),
      observedTip: {
        idHex: '77'.repeat(32),
        parentIdHex: '78'.repeat(32),
        height: STABLE_HEIGHT,
        extensionRootHex: '79'.repeat(32),
      },
    },
    entries: [entry],
    agreement: {
      distinctOrigins: true,
      sameNonMainnetNetwork: true,
      completeObservationIdentityMatched: true,
      exactLineageAndSnapshotMatched: true,
      exactRollingAvlReplayCompleted: true,
      sameUnspentTipObservedOnBothSources: true,
    },
    boundary: {
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      transactionCheckPerformed: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      reportDigestAuthenticatesSource: false,
      observationDigestRecomputedFromReport: false,
      proofPayloadVerifiedByErgo: false,
      grandpaFinalityVerifiedByErgo: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      productionReady: false,
    },
    authorization: { build: false, check: false, sign: false, submit: false, broadcast: false, deploy: false },
  };
  const trackerObservation = withDigest(trackerWithoutDigest, 'reportDigestHex');
  const reportWithoutDigest = {
    schema: AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
    status: 'AGREED',
    observedAt: OBSERVED_AT,
    request: {
      environment: 'testnet',
      primaryNodeOrigin: 'http://127.0.0.1:9053',
      witnessNodeOrigin: 'http://127.0.0.1:9054',
      trackerNftIdHex: TRACKER_NFT,
      trackerGenesisBoxIdHex: trackerBox.boxId,
      trackerErgoTreeHex: TRACKER_TREE,
      sidechainIdHex: SIDECHAIN_ID,
      duplicatePreventionBoxIdHex: dupBox.boxId,
      duplicatePreventionNftIdHex: DUP_NFT,
      duplicatePreventionErgoTreeHex: DUP_TREE,
      vaultBoxIdHex: vaultBox.boxId,
      vaultErgoTreeHex: VAULT_TREE,
      burnIdHex: burnLeaves[0].burnIdHex,
      payoutAmountNanoErg: AMOUNT,
      minerFeeNanoErg: MINER_FEE,
      minimumRequiredVaultValueNanoErg: AMOUNT + MINER_FEE,
    },
    trackerObservation,
    stableSnapshot: {
      indexedHeight: STABLE_HEIGHT,
      fullHeight: STABLE_HEIGHT,
      bestHeader: trackerWithoutDigest.tracker.observedTip,
    },
    trackerInput,
    duplicatePrevention: {
      ...duplicatePrevention,
      counter: '2',
      avl: {
        registerHex: dupBox.additionalRegisters.R5,
        digestHex: dupDigest,
        flags: Number.parseInt(dupBox.additionalRegisters.R5.slice(68, 70), 16),
        insertEnabled: true,
        keyLength: 32,
        valueLength: 1,
      },
      authority: {
        registerHex: DUP_AUTHORITY,
        publicKeyHex: decodeCanonicalDlogSigmaPropRegister(DUP_AUTHORITY, 'DUP authority'),
      },
    },
    vault: {
      ...vault,
      depositIdHex: '74'.repeat(32),
      targetEvmAddressHex: '75'.repeat(20),
      amountNanoErg: String(AMOUNT),
      provenanceHex: RECIPIENT_TREE,
    },
    agreement: {
      distinctOrigins: true,
      sameExplicitNonMainnetNetwork: true,
      completeTrackerReconstructionMatched: true,
      currentUnspentTrackerTipMatched: true,
      exactNormalizedInputsMatched: true,
      exactCanonicalInputBytesMatched: true,
      inputCreationHeightsWithinSnapshot: true,
      stableSnapshotAcrossExtraUtxoReads: true,
      trackerDupAndVaultBoxIdsDistinct: true,
    },
    boundary: {
      credentialFreeGetOnlyNodeRequests: true,
      configurationRead: false,
      environmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      transactionConstructed: false,
      transactionCheckPerformed: false,
      transactionSigned: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      deploymentPerformed: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      reportDigestAuthenticatesSources: false,
      settlementCandidateValidated: false,
      grandpaOrStarkVerifiedByErgo: false,
      r9RemainsFinalityAuthority: true,
      gate5Closed: false,
      productionReady: false,
    },
    authorization: { build: false, check: false, sign: false, submit: false, broadcast: false, deploy: false },
  };
  const report = withDigest(reportWithoutDigest, 'reportDigestHex');
  const companion = createAuthenticatedV2UnsignedSettlementCompanion({
    creationHeight: STABLE_HEIGHT,
    targetBurn: {
      sidechainTxHashHex: SIDECHAIN_TX_HASH,
      sidechainHeight: SIDECHAIN_HEIGHT.toString(),
      executionBlockHashHex: EXECUTION_BLOCK_HASH,
      eventIndex: EVENT_INDEX,
      recipientErgoTreeHex: RECIPIENT_TREE,
      inclusion: {
        leafIndex: proof.leafIndex,
        leafCount: proof.leafCount,
        proof: proof.proof,
      },
    },
    dupHistoryKeys: DUP_HISTORY,
  });
  return {
    report,
    companion,
    trackerBox,
    dupBox,
    vaultBox,
    trackerHistory,
    proof,
  };
}

function withDigest<T extends Record<string, any>>(value: T, field: string): T & Record<string, string> {
  return {
    ...structuredClone(value),
    [field]: sha256Hex(Buffer.from(canonicalJson(value), 'utf8')),
  };
}

function redigestCompanion(value: any): any {
  const clone = structuredClone(value);
  delete clone.companionDigestHex;
  return { ...clone, companionDigestHex: sha256Hex(Buffer.from(canonicalJson(clone), 'utf8')) };
}

function redigestPackage(value: any): any {
  const clone = structuredClone(value);
  delete clone.packageDigestHex;
  return { ...clone, packageDigestHex: sha256Hex(Buffer.from(canonicalJson(clone), 'utf8')) };
}

function redigestReport(value: any): any {
  const clone = structuredClone(value);
  delete clone.reportDigestHex;
  return { ...clone, reportDigestHex: sha256Hex(Buffer.from(canonicalJson(clone), 'utf8')) };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

describe('authenticated V2 unsigned settlement package', () => {
  it('builds and revalidates one deterministic end-to-end offline package', async () => {
    const f = await fixture();
    const first = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const second = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });

    expect(second).toEqual(first);
    expect(await validateAuthenticatedV2UnsignedSettlementPackage(first)).toBe(first);
    expect(first.transaction.unsignedTransactionIdHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.transaction.eip12Sha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.packageDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.transaction.eip12.inputs.map(input => input.boxId)).toEqual([
      f.dupBox.boxId,
      f.vaultBox.boxId,
    ]);
    expect(first.transaction.eip12.dataInputs[0].boxId).toBe(f.trackerBox.boxId);
    expect(first.boundary).toEqual(expect.objectContaining({
      transactionConstructed: true,
      transactionCheckPerformed: false,
      transactionSigned: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      deploymentPerformed: false,
      packageDigestAuthenticatesSources: false,
      gate5Closed: false,
      trustlessSettlementClaim: false,
      productionReady: false,
      r9RemainsFinalityAuthority: true,
    }));
  });

  it('keeps service preparation behavior equivalent to the extracted pure core', async () => {
    const f = await fixture();
    const packageResult = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const pure = prepareAuthenticatedSettlementUnsignedTxPure({
      contractIdentities: packageResult.contracts,
      trackerBox: f.trackerBox,
      authenticatedDupBox: f.dupBox,
      unlockBox: f.vaultBox,
      trackerHistory: packageResult.trackerHistory,
      dupHistoryKeys: packageResult.duplicatePrevention.historyKeys,
      pegOut: {
        user: '0x0000000000000000000000000000000000000000',
        amount: BigInt(AMOUNT),
        ergoRecipientAddress: RECIPIENT_TREE,
        sidechainTxHash: SIDECHAIN_TX_HASH,
        sidechainBlockNumber: Number(SIDECHAIN_HEIGHT),
        sidechainBlockHash: EXECUTION_BLOCK_HASH,
        sidechainLogIndex: EVENT_INDEX,
      },
      trackerIdentity: {
        sidechainIdHex: SIDECHAIN_ID,
        sidechainHeight: SIDECHAIN_HEIGHT,
        executionBlockHashHex: EXECUTION_BLOCK_HASH,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: packageResult.targetBurn.burnIdHex,
        bridgeEventRootHex: packageResult.targetBurn.bridgeEventRootHex,
        recipientErgoTreeHashHex: packageResult.targetBurn.recipientErgoTreeHashHex,
        amountNanoErg: AMOUNT,
        assetIdHex: packageResult.targetBurn.assetIdHex,
        trustlessBurnProof: packageResult.targetBurn.inclusion.proof,
      },
      recipientErgoTreeHex: RECIPIENT_TREE,
      creationHeight: STABLE_HEIGHT,
    });
    const signAndSubmit = vi.fn(async () => null);
    const service = new AggregateSettlementService({
      ergo: {
        addressToTree: async () => { throw new Error('raw tree must not resolve through an address'); },
        getCurrentHeight: async () => STABLE_HEIGHT,
        getTransaction: async () => null,
        findSingletonBox: async (tokenId: string) => tokenId === TRACKER_NFT
          ? f.trackerBox
          : f.dupBox,
        getUnspentBoxesByAddress: async () => [f.vaultBox],
      },
      state: {
        getAllAvlKeys: () => { throw new Error('legacy DUP history must not feed authenticated V2'); },
        getAuthenticatedV2DupHistory: () => DUP_HISTORY,
        getAuthenticatedSpvTrackerHistory: () => f.trackerHistory,
      },
      deployed: {
        spvTrackerAuthenticated: {
          nftId: TRACKER_NFT,
          ergoTreeHex: TRACKER_TREE,
          address: 'unused',
        },
        doubleUnlockPreventionAuthenticated: {
          nftId: DUP_NFT,
          ergoTreeHex: DUP_TREE,
          address: 'unused',
        },
        mainChainAggregateUnlockAuthenticated: {
          ergoTreeHex: VAULT_TREE,
          address: 'unused',
        },
      },
      verifySidechainBurn: async () => 'confirmed',
      signAndSubmit,
    } as any);
    const prepareInput = {
      pegOut: pure.plan.claims[0].claim.pegOut as any,
      trackerIdentity: {
        sidechainIdHex: SIDECHAIN_ID,
        sidechainHeight: SIDECHAIN_HEIGHT,
        executionBlockHashHex: EXECUTION_BLOCK_HASH,
      },
      settlementIdentity: pure.plan.claims[0].settlementIdentity,
      creationHeight: STABLE_HEIGHT,
      unlockBoxId: f.vaultBox.boxId,
    };
    const serviceResult = await service.prepareAuthenticatedSettlementUnsignedTx(prepareInput);

    expect(serviceResult).toEqual(pure);
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(pure))
      .toThrow(/provenance is missing/i);
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(serviceResult))
      .not.toThrow();
    const packageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: packageResult,
      expectedPackageDigestHex: packageResult.packageDigestHex,
      expectedTxId: packageResult.transaction.unsignedTransactionIdHex,
      prepared: serviceResult,
    });
    expect(packageBinding).toMatchObject({
      packageDigestHex: packageResult.packageDigestHex,
      readinessReportDigestHex: packageResult.source.readinessReportDigestHex,
      companionDigestHex: packageResult.source.companionDigestHex,
      eip12Sha256Hex: packageResult.transaction.eip12Sha256Hex,
      expectedTxId: packageResult.transaction.unsignedTransactionIdHex,
      prepared: serviceResult,
    });
    expect(() => assertPackageBoundAuthenticatedSettlementProvenance(packageBinding))
      .not.toThrow();
    expect(() => assertPackageBoundAuthenticatedSettlementProvenance(
      structuredClone(packageBinding),
    )).toThrow(/package-bound.*provenance/i);

    await expect(bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: packageResult,
      expectedPackageDigestHex: 'ff'.repeat(32),
      expectedTxId: packageResult.transaction.unsignedTransactionIdHex,
      prepared: serviceResult,
    })).rejects.toThrow(/explicitly expected digest/i);
    await expect(bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: packageResult,
      expectedPackageDigestHex: packageResult.packageDigestHex,
      expectedTxId: 'ff'.repeat(32),
      prepared: serviceResult,
    })).rejects.toThrow(/transaction ID.*revalidated candidate/i);
    await expect(bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: packageResult,
      expectedPackageDigestHex: packageResult.packageDigestHex,
      expectedTxId: packageResult.transaction.unsignedTransactionIdHex,
      prepared: pure as any,
    })).rejects.toThrow(/provenance is missing/i);

    const creationHeightDrift = await service.prepareAuthenticatedSettlementUnsignedTx({
      ...prepareInput,
      creationHeight: STABLE_HEIGHT + 1,
    });
    await expect(bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: packageResult,
      expectedPackageDigestHex: packageResult.packageDigestHex,
      expectedTxId: packageResult.transaction.unsignedTransactionIdHex,
      prepared: creationHeightDrift,
    })).rejects.toThrow(/EIP-12 transaction differs/i);

    const originalOutput = serviceResult.eip12Tx.outputs[0];
    expect(() => {
      (serviceResult.eip12Tx.outputs as any)[0] = {
        ...originalOutput,
        value: (BigInt(originalOutput.value) + 1n).toString(),
      };
    }).toThrow(/read only property/i);
    expect(() => assertPackageBoundAuthenticatedSettlementProvenance(packageBinding))
      .not.toThrow();
    expect(signAndSubmit).not.toHaveBeenCalled();
  });

  it('rejects a conflicting or non-canonical journaled package digest before recheck', () => {
    const expected = 'a1'.repeat(32);
    expect(() => assertJournaledUnsignedSettlementPackageDigest(expected, null))
      .not.toThrow();
    expect(() => assertJournaledUnsignedSettlementPackageDigest(expected, expected))
      .not.toThrow();
    expect(() => assertJournaledUnsignedSettlementPackageDigest(expected, 'a2'.repeat(32)))
      .toThrow(/conflicts with the journaled check/i);
    expect(() => assertJournaledUnsignedSettlementPackageDigest(expected, expected.toUpperCase()))
      .toThrow(/canonical lowercase hex/i);
    expect(() => assertJournaledUnsignedSettlementPackageDigest(expected, ''))
      .toThrow(/must be 32 bytes/i);
  });

  it.each([
    ['invalid burn proof', 'invalid-proof'],
    ['replayed burn', 'replayed-burn'],
    ['insufficient anchor depth', 'insufficient-anchor'],
  ])('rejects %s before any settlement-box read', async (_label, scenario) => {
    const f = await fixture();
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: SIDECHAIN_TX_HASH,
      eventIndex: EVENT_INDEX,
    });
    const settlementIdentity: any = {
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: burnIdHex,
      bridgeEventRootHex: f.proof.bridgeEventRootHex,
      recipientErgoTreeHashHex: blake2b256Hex(Buffer.from(RECIPIENT_TREE, 'hex')),
      amountNanoErg: AMOUNT,
      assetIdHex: '00'.repeat(32),
      trustlessBurnProof: structuredClone(f.proof.proof),
    };
    if (scenario === 'invalid-proof') {
      settlementIdentity.trustlessBurnProof[0].hashHex = 'ab'.repeat(32);
    }
    const findSingletonBox = vi.fn(async () => { throw new Error('must not read singleton boxes'); });
    const getUnspentBoxesByAddress = vi.fn(async () => {
      throw new Error('must not read settlement vaults');
    });
    const service = new AggregateSettlementService({
      ergo: {
        addressToTree: async () => { throw new Error('raw tree must not resolve through an address'); },
        getCurrentHeight: async () => STABLE_HEIGHT,
        getTransaction: async () => null,
        findSingletonBox,
        getUnspentBoxesByAddress,
      },
      state: {
        getAllAvlKeys: () => { throw new Error('legacy DUP history must not feed authenticated V2'); },
        getAuthenticatedV2DupHistory: () => scenario === 'replayed-burn'
          ? [...DUP_HISTORY, burnIdHex]
          : DUP_HISTORY,
        getAuthenticatedSpvTrackerHistory: () => f.trackerHistory,
      },
      deployed: {
        spvTrackerAuthenticated: {
          nftId: TRACKER_NFT,
          ergoTreeHex: TRACKER_TREE,
          address: 'unused',
        },
        doubleUnlockPreventionAuthenticated: {
          nftId: DUP_NFT,
          ergoTreeHex: DUP_TREE,
          address: 'unused',
        },
        mainChainAggregateUnlockAuthenticated: {
          ergoTreeHex: VAULT_TREE,
          address: 'unused',
        },
      },
      verifySidechainBurn: async () => 'confirmed',
    } as any);
    const creationHeight = scenario === 'insufficient-anchor'
      ? ANCHOR_HEIGHT + AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS - 1
      : STABLE_HEIGHT;

    await expect(service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: {
        user: '0x0000000000000000000000000000000000000000',
        amount: BigInt(AMOUNT),
        ergoRecipientAddress: RECIPIENT_TREE,
        sidechainTxHash: SIDECHAIN_TX_HASH,
        sidechainBlockNumber: Number(SIDECHAIN_HEIGHT),
        sidechainBlockHash: EXECUTION_BLOCK_HASH,
        sidechainLogIndex: EVENT_INDEX,
      },
      trackerIdentity: {
        sidechainIdHex: SIDECHAIN_ID,
        sidechainHeight: SIDECHAIN_HEIGHT,
        executionBlockHashHex: EXECUTION_BLOCK_HASH,
      },
      settlementIdentity,
      creationHeight,
    })).rejects.toThrow(
      scenario === 'invalid-proof'
        ? /burn proof/i
        : scenario === 'replayed-burn'
          ? /already present/i
          : /requires .* confirmations/i,
    );
    expect(findSingletonBox).not.toHaveBeenCalled();
    expect(getUnspentBoxesByAddress).not.toHaveBeenCalled();
  });

  it('rejects report tampering before package construction', async () => {
    const f = await fixture();
    const report = structuredClone(f.report);
    report.status = 'OBSERVED';
    await expect(buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: report,
      companion: f.companion,
    })).rejects.toThrow(/status must be AGREED/i);
  });

  it.each([
    ['tracker height', (c: any) => { c.targetBurn.sidechainHeight = '1025'; }, /exactly one reconstructed tracker entry/i],
    ['execution block', (c: any) => { c.targetBurn.executionBlockHashHex = '80'.repeat(32); }, /exactly one reconstructed tracker entry/i],
    ['transaction hash', (c: any) => { c.targetBurn.sidechainTxHashHex = '81'.repeat(32); }, /wrong T9 burn ID/i],
    ['event index', (c: any) => { c.targetBurn.eventIndex += 1; }, /wrong T9 burn ID/i],
    ['recipient tree', (c: any) => { c.targetBurn.recipientErgoTreeHex = `0008cd02${'82'.repeat(32)}`; }, /burn proof is not canonical/i],
    ['proof hash', (c: any) => { c.targetBurn.inclusion.proof[0].hashHex = '83'.repeat(32); }, /burn proof is not canonical/i],
    ['proof index', (c: any) => { c.targetBurn.inclusion.leafIndex = 1; }, /burn proof is not canonical/i],
  ])('rejects wrong target %s without parser-only failure', async (_label, mutate, pattern) => {
    const f = await fixture();
    const companion = structuredClone(f.companion);
    mutate(companion);
    await expect(buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: redigestCompanion(companion),
    })).rejects.toThrow(pattern);
  });

  it('rejects a wrong T9 burn ID independently of companion syntax', async () => {
    const f = await fixture();
    const report = structuredClone(f.report);
    report.request.burnIdHex = '84'.repeat(32);
    await expect(buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: redigestReport(report),
      companion: f.companion,
    })).rejects.toThrow(/wrong T9 burn ID/i);
  });

  it.each([
    ['tracker entry index', (p: any) => { p.targetBurn.trackerEntryIndex = 1; }, /tracker entry index|exactly one tracker history entry/i],
    ['root', (p: any) => { p.targetBurn.bridgeEventRootHex = '85'.repeat(32); }, /burn proof is not canonical|tracker entry/i],
    ['amount', (p: any) => { p.targetBurn.amountNanoErg = '1000001'; }, /burn proof is not canonical/i],
    ['unsafe sidechain height', (p: any) => { p.targetBurn.sidechainHeight = '9007199254740992'; }, /safe-integer boundary/i],
    ['recipient hash', (p: any) => { p.targetBurn.recipientErgoTreeHashHex = '86'.repeat(32); }, /recipient ErgoTree/i],
    ['burn ID', (p: any) => { p.targetBurn.burnIdHex = '87'.repeat(32); }, /burn ID/i],
  ])('rejects package target %s tampering after a valid parse', async (_label, mutate, pattern) => {
    const f = await fixture();
    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const tampered = structuredClone(pkg);
    mutate(tampered);
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(tampered),
    )).rejects.toThrow(pattern);
  });

  it('preserves insertion order and rejects duplicate, missing, and digest-mismatched DUP history', async () => {
    const f = await fixture();
    expect(validateAuthenticatedV2UnsignedSettlementCompanion(f.companion).dupHistoryKeys)
      .toEqual(DUP_HISTORY);

    const duplicate = structuredClone(f.companion);
    duplicate.dupHistoryKeys = [DUP_HISTORY[0], DUP_HISTORY[0]];
    expect(() => validateAuthenticatedV2UnsignedSettlementCompanion(
      redigestCompanion(duplicate),
    )).toThrow(/duplicates/i);

    const missing = structuredClone(f.companion);
    missing.dupHistoryKeys = [DUP_HISTORY[0]];
    await expect(buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: redigestCompanion(missing),
    })).rejects.toThrow(/do not reproduce the observed current DUP R5 digest/i);

    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const mismatched = structuredClone(pkg);
    mismatched.duplicatePrevention.currentDigestHex = '88'.repeat(33);
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(mismatched),
    )).rejects.toThrow(/does not reproduce its current digest/i);
  });

  it('bounds DUP history before parsing individual keys', async () => {
    const f = await fixture();
    const oversizedHistory = Array(
      AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS + 1,
    ).fill('not-hex');
    const companion = structuredClone(f.companion);
    companion.dupHistoryKeys = oversizedHistory;
    expect(() => validateAuthenticatedV2UnsignedSettlementCompanion(
      redigestCompanion(companion),
    )).toThrow(/must not exceed/i);

    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const oversizedPackage = structuredClone(pkg);
    oversizedPackage.duplicatePrevention.historyKeys = oversizedHistory;
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(oversizedPackage),
    )).rejects.toThrow(/must not exceed/i);
  });

  it('applies the chain-reconstruction bound before parsing tracker history', async () => {
    const f = await fixture();
    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const maxEntries = AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES - 1;
    const atBound = structuredClone(pkg);
    atBound.trackerHistory = Array(maxEntries).fill(null);
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(atBound),
    )).rejects.toThrow(/entry 0 must be an object/i);

    const aboveBound = structuredClone(pkg);
    aboveBound.trackerHistory = Array(maxEntries + 1).fill(null);
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(aboveBound),
    )).rejects.toThrow(/must not exceed/i);
  });

  it('rejects creation-height drift and contract/box mismatch', async () => {
    const f = await fixture();
    const height = structuredClone(f.companion);
    height.creationHeight -= 1;
    await expect(buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: redigestCompanion(height),
    })).rejects.toThrow(/equal the T9 stable full\/header height/i);

    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const mismatch = structuredClone(pkg);
    mismatch.contracts.vault.ergoTreeHex = `1008cd02${'89'.repeat(32)}`;
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(mismatch),
    )).rejects.toThrow(/vault ErgoTree does not match deployed contract/i);

    const boxMismatch = structuredClone(pkg);
    boxMismatch.transaction.eip12.inputs[0].ergoTree = `1008cd02${'8a'.repeat(32)}`;
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(boxMismatch),
    )).rejects.toThrow(/DUP box ErgoTree does not match deployed contract/i);
  });

  it.each([
    [
      'canonical vault bytes',
      (p: any) => {
        const bytes = p.canonicalInputBytes.vaultInput;
        const replacement = bytes.sigmaSerializedHex.endsWith('00') ? 'ff' : '00';
        bytes.sigmaSerializedHex = `${bytes.sigmaSerializedHex.slice(0, -2)}${replacement}`;
        bytes.sigmaSerializedSha256Hex = sha256Hex(Buffer.from(bytes.sigmaSerializedHex, 'hex'));
      },
      /does not preserve the exact canonical T9 Sigma bytes/i,
    ],
    [
      'vault context extension',
      (p: any) => {
        const current = p.transaction.eip12.inputs[1].extension['0'];
        const replacement = current.endsWith('00') ? 'ff' : '00';
        p.transaction.eip12.inputs[1].extension['0'] = `${current.slice(0, -2)}${replacement}`;
      },
      /does not match deterministic authenticated V2 preparation/i,
    ],
    [
      'unsigned transaction ID',
      (p: any) => { p.transaction.unsignedTransactionIdHex = '91'.repeat(32); },
      /unsigned transaction ID does not match/i,
    ],
    [
      'tracker finality value',
      (p: any) => {
        const current = p.trackerHistory[0].value;
        p.trackerHistory[0].value = `${current.slice(0, -2)}92`;
      },
      /tracker data input R5 does not match tracker history/i,
    ],
    [
      'tracker NFT identity',
      (p: any) => { p.contracts.tracker.nftId = '93'.repeat(32); },
      /authenticated tracker box.*singleton token/i,
    ],
  ])('rejects isolated %s drift', async (_label, mutate, pattern) => {
    const f = await fixture();
    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    const tampered = structuredClone(pkg);
    mutate(tampered);
    if (_label === 'vault context extension') {
      tampered.transaction.eip12Sha256Hex = sha256Hex(
        Buffer.from(canonicalJson(tampered.transaction.eip12), 'utf8'),
      );
    }
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(tampered),
    )).rejects.toThrow(pattern);
  });

  it('rejects unknown fields, package digest tampering, and authority booleans', async () => {
    const f = await fixture();
    expect(() => validateAuthenticatedV2UnsignedSettlementCompanion({
      ...f.companion,
      schema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
      check: true,
    })).toThrow(/fields do not match the canonical schema/i);

    const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
      readinessReport: f.report,
      companion: f.companion,
    });
    await expect(validateAuthenticatedV2UnsignedSettlementPackage({
      ...pkg,
      extra: false,
    })).rejects.toThrow(/fields do not match the canonical schema/i);

    const digest = structuredClone(pkg);
    digest.packageDigestHex = '90'.repeat(32);
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(digest))
      .rejects.toThrow(/package digest/i);

    const authority: any = structuredClone(pkg);
    authority.boundary.transactionCheckPerformed = true;
    await expect(validateAuthenticatedV2UnsignedSettlementPackage(
      redigestPackage(authority),
    )).rejects.toThrow(/transactionCheckPerformed must be false/i);
  });
});
