import { createHash } from 'node:crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it, vi } from 'vitest';

const parentProvenance = vi.hoisted(() => ({
  mintTransition: vi.fn(),
  contractStateLineage: vi.fn(),
}));

vi.mock(
  './native-finalized-peg-in-frontier-mint-transition-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./native-finalized-peg-in-frontier-mint-transition-v1.js')
    >(),
    assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance:
      parentProvenance.mintTransition,
  }),
);
vi.mock('./frontier-contract-state-deployment-lineage-join.js', async importOriginal => ({
  ...await importOriginal<
    typeof import('./frontier-contract-state-deployment-lineage-join.js')
  >(),
  assertFrontierContractStateDeploymentLineageJoinCandidateProvenance:
    parentProvenance.contractStateLineage,
}));

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import { encodeCollByteRegister, encodeLongRegister } from './ergo-encoding.js';
import {
  buildFrontierMintTransitionDeploymentLineageJoinCandidate,
} from './frontier-mint-transition-deployment-lineage-join.js';
import {
  buildFrontierMintTransitionDeploymentLineageJoinV2Candidate,
} from './frontier-mint-transition-deployment-lineage-join-v2.js';
import {
  PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA,
  assertPegInCommittedVaultMintEligibilityV1CandidateProvenance,
  buildPegInCommittedVaultMintEligibilityV1Candidate,
} from './peg-in-committed-vault-mint-eligibility-v1.js';
import { derivePegInFrontierContractStateStorageKeysV1 } from './peg-in-frontier-contract-state-v1.js';
import type {
  AssessPegInRouteObservationInput,
  PegInRouteObservationSource,
} from './peg-in-route-observation.js';
import {
  pegInRouteManifestDigestHex,
  sha256Utf8,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';
import {
  reconstructPegInRouteFromDistinctSources,
} from './peg-in-route-reconstruction.js';
import {
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';

const ACTIVE_TREE = `1008cd02${'11'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'22'.repeat(32)}`;
const DEPOSITOR_TREE = `1008cd02${'33'.repeat(32)}`;
const ACTIVE_ADDRESS = ErgoAddress.fromErgoTree(ACTIVE_TREE, Network.Testnet).toString();
const VAULT_ADDRESS = ErgoAddress.fromErgoTree(VAULT_TREE, Network.Testnet).toString();
const DEPOSIT_ID = '41'.repeat(32);
const DEPOSIT_TX_ID = '42'.repeat(32);
const COMMIT_TX_ID = '43'.repeat(32);
const VAULT_BOX_ID = '44'.repeat(32);
const TIP_ID = '45'.repeat(32);
const COMMIT_BLOCK_ID = '46'.repeat(32);
const TARGET_H160 = '47'.repeat(20);
const SIDECHAIN_ID = `0x${'48'.repeat(32)}`;
const BRIDGE_ADDRESS = `0x${'49'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'4a'.repeat(20)}`;
const OWNER_ADDRESS = `0x${'4b'.repeat(20)}`;
const EVENT_NATIVE = `0x${'4c'.repeat(32)}`;
const EVENT_STATE = `0x${'4d'.repeat(32)}`;
const EXECUTION_BLOCK = `0x${'4e'.repeat(32)}`;
const MINT_TRANSACTION = `0x${'4f'.repeat(32)}`;
const TRUST_ANCHOR = `0x${'51'.repeat(32)}`;
const PARENT_NATIVE = `0x${'52'.repeat(32)}`;
const AMOUNT = 10_000_000n;
const OBSERVED_AT = '2026-07-18T12:00:00.000Z';
const NATIVE_PROCESSED_STORAGE_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: `0x${DEPOSIT_ID}`,
});
const EVM_PROCESSED_STORAGE_KEY = derivePegInFrontierContractStateStorageKeysV1({
  bridgeAddressHex: BRIDGE_ADDRESS,
  tokenAddressHex: TOKEN_ADDRESS,
  ergoBoxIdHex: `0x${DEPOSIT_ID}`,
}).processedPegInStorageKeyHex;

const MCL_TEMPLATE = [
  '{',
  '  val vault = fromBase16("SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")',
  '  val committee = Coll(COMMITTEE_SIGMAPROP_PLACEHOLDERS)',
  '  atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
  '}',
].join('\n');
const VAULT_TEMPLATE = [
  '{',
  '  val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")',
  '  val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER")',
  '  sigmaProp(tracker != dup)',
  '}',
].join('\n');
const TRACKER_NFT_ID = '53'.repeat(32);
const DUP_NFT_ID = '54'.repeat(32);

describe('committed-vault PegIn mint eligibility integration', () => {
  it('joins genuinely branded Ergo-route and T20C candidates deterministically', async () => {
    const first = await candidate();
    const second = await candidate();

    expect(first.deposit).toMatchObject({
      sourceBoxIdHex: DEPOSIT_ID,
      amountNanoErg: AMOUNT.toString(),
      recipientAddressHex: `0x${TARGET_H160}`,
    });
    expect(first.commitment).toMatchObject({
      spendingTransactionIdHex: COMMIT_TX_ID,
      confirmations: 11,
      vaultBoxIdHex: VAULT_BOX_ID,
      sourceRefundPathAbsentAtSnapshot: true,
      vaultSuccessorUnspentAtSnapshot: true,
    });
    expect(first.mintIdentity.nativeProcessedRecordStorageKeyHex)
      .toBe(NATIVE_PROCESSED_STORAGE_KEY);
    expect(first.candidateDigestHex).toBe(second.candidateDigestHex);
    expect(() => assertPegInCommittedVaultMintEligibilityV1CandidateProvenance(first))
      .not.toThrow();
  });

  it('rejects cloned route and T20C inputs even when their fields are unchanged', async () => {
    const route = await reconstructPegInRouteFromDistinctSources(routeInput());
    const mint = mintTransition();

    expect(() => buildPegInCommittedVaultMintEligibilityV1Candidate({
      profile: eligibilityProfile(),
      ergoRoute: structuredClone(route),
      mintTransition: mint,
    })).toThrow(/route reconstruction provenance is missing/i);
    expect(() => buildPegInCommittedVaultMintEligibilityV1Candidate({
      profile: eligibilityProfile(),
      ergoRoute: route,
      mintTransition: structuredClone(mint),
    })).toThrow(/join provenance is missing/i);
  });

  it('preserves the V1 candidate digest and rejects runtime-record projection drift', () => {
    const input = mintTransitionInput();
    const v1 = buildFrontierMintTransitionDeploymentLineageJoinCandidate(input);
    const v2 = buildFrontierMintTransitionDeploymentLineageJoinV2Candidate(input);
    expect(v2.v1CandidateDigestHex).toBe(v1.candidateDigestHex);

    const drifted = structuredClone(mintTransitionInput()) as any;
    drifted.mintTransitionCandidate.contractStateVerification
      .eventVerification.executionIdentity.record.recipientHex = OWNER_ADDRESS;
    expect(() => buildFrontierMintTransitionDeploymentLineageJoinV2Candidate(drifted))
      .toThrow(/runtime record differs/i);
  });
});

async function candidate() {
  return buildPegInCommittedVaultMintEligibilityV1Candidate({
    profile: eligibilityProfile(),
    ergoRoute: await reconstructPegInRouteFromDistinctSources(routeInput()),
    mintTransition: mintTransition(),
  });
}

function eligibilityProfile() {
  const value = routeManifest();
  return {
    schema: PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA,
    profileId: 'ergo-testnet-frontier-v1',
    routeManifestSha256Hex: pegInRouteManifestDigestHex(value),
    ergoNetworkId: 'ergo-testnet',
    routeProfile: 'committed-vault-v3' as const,
    settlementVaultProfileId:
      'main-chain-aggregate-unlock-trustless-v1-compatibility' as const,
    sidechainIdHex: SIDECHAIN_ID,
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    sourceAsset: 'ERG' as const,
    sourceAssetIdHex: `0x${'00'.repeat(32)}` as const,
    amountUnit: 'nanoERG' as const,
  };
}

function routeInput(): AssessPegInRouteObservationInput {
  const value = routeManifest();
  return {
    manifest: value,
    expectedManifestSha256Hex: pegInRouteManifestDigestHex(value),
    mainChainLockTemplateSource: MCL_TEMPLATE,
    settlementVaultTemplateSource: VAULT_TEMPLATE,
    primarySource: new StableRouteSource('http://127.0.0.1:9053'),
    witnessSource: new StableRouteSource('http://127.0.0.1:19053'),
    generatedAt: OBSERVED_AT,
  };
}

function routeManifest(): PegInRouteManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
    kind: 'committed-vault-route-manifest',
    manifestId: 'ergo-testnet-frontier-v1',
    network: {
      id: 'ergo-testnet',
      nodeInfoNetwork: 'testnet',
      addressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      anchorHeader: {
        height: 91,
        idHex: TIP_ID,
        minimumDepth: 10,
        maximumAgeBlocks: 720,
      },
    },
    coverage: {
      mode: 'complete_active_and_historical_main-chain-lock_route_set',
      declaredLegacyCount: 0,
      cutoff: {
        event: 'committed_vault_v3_route_declared',
        sourceRevision: '55'.repeat(20),
      },
      basis: [{
        reference: 'repository://docs/reviewed-peg-in-route.md',
        sha256Hex: '56'.repeat(32),
      }],
    },
    route: {
      profile: 'committed-vault-v3',
      commitConfirmations: 10,
      committee: {
        publicKeysHex: [...CHECK_ONLY_COMMITTEE_PUBKEY_HEXES],
        threshold: 2,
      },
      mainChainLock: {
        scriptRole: 'refundable-deposit-staging',
        address: ACTIVE_ADDRESS,
        ergoTreeHex: ACTIVE_TREE,
        ergoTreeSha256Hex: sha256HexBytes(ACTIVE_TREE),
        source: {
          reference: 'contracts/MainChainLock.es',
          templateSha256Hex: sha256Utf8(MCL_TEMPLATE),
          resolvedSha256Hex: sha256Utf8(resolvedMclSource()),
        },
      },
      settlementVault: {
        scriptRole: 'configured-settlement-vault',
        profileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility',
        address: VAULT_ADDRESS,
        ergoTreeHex: VAULT_TREE,
        ergoTreeSha256Hex: sha256HexBytes(VAULT_TREE),
        source: {
          reference: 'contracts/MainChainAggregateUnlockTrustless.es',
          templateSha256Hex: sha256Utf8(VAULT_TEMPLATE),
          resolvedSha256Hex: sha256Utf8(resolvedVaultSource()),
          trackerNftIdHex: TRACKER_NFT_ID,
          duplicatePreventionNftIdHex: DUP_NFT_ID,
        },
      },
    },
    legacyMainChainLocks: [],
  };
}

class StableRouteSource implements PegInRouteObservationSource {
  constructor(readonly observationSourceId: string) {}

  async getInfo(): Promise<unknown> {
    return { network: 'testnet', fullHeight: 100 };
  }

  async getIndexedHeight(): Promise<unknown> {
    return { indexedHeight: 100, fullHeight: 100 };
  }

  async getBestHeader(): Promise<unknown> {
    return { height: 100, id: TIP_ID };
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    if (height === 91) return [TIP_ID];
    if (height === 90) return [COMMIT_BLOCK_ID];
    return [];
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return [depositBox()];
    if (address === VAULT_ADDRESS) return [vaultBox()];
    throw new Error(`unexpected address ${address}`);
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return [];
    if (address === VAULT_ADDRESS) return [vaultBox()];
    throw new Error(`unexpected address ${address}`);
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    if (txId !== COMMIT_TX_ID) return null;
    const output = vaultBox() as Record<string, unknown>;
    delete output.spentTransactionId;
    return {
      id: COMMIT_TX_ID,
      inclusionHeight: 90,
      headerId: COMMIT_BLOCK_ID,
      inputs: [{ boxId: DEPOSIT_ID }],
      outputs: [output],
    };
  }

  async compileP2sAddress(source: string): Promise<string> {
    if (source === resolvedMclSource()) return ACTIVE_ADDRESS;
    if (source === resolvedVaultSource()) return VAULT_ADDRESS;
    throw new Error('unexpected source template');
  }
}

function depositBox(): unknown {
  return {
    boxId: DEPOSIT_ID,
    transactionId: DEPOSIT_TX_ID,
    index: 0,
    creationHeight: 80,
    value: AMOUNT.toString(),
    ergoTree: ACTIVE_TREE,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
      R5: encodeLongRegister(AMOUNT),
      R6: encodeCollByteRegister(Buffer.from(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES[0], 'hex')),
      R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
    },
    spentTransactionId: COMMIT_TX_ID,
  };
}

function vaultBox(): unknown {
  return {
    boxId: VAULT_BOX_ID,
    transactionId: COMMIT_TX_ID,
    index: 0,
    creationHeight: 90,
    value: AMOUNT.toString(),
    ergoTree: VAULT_TREE,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(DEPOSIT_ID, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
      R6: encodeLongRegister(AMOUNT),
      R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
    },
    spentTransactionId: null,
  };
}

function mintTransition() {
  return buildFrontierMintTransitionDeploymentLineageJoinV2Candidate(
    mintTransitionInput(),
  );
}

function mintTransitionInput() {
  const requestDigest = `0x${'57'.repeat(32)}`;
  return {
    mintTransitionCandidate: {
      requestDigestHex: `0x${'58'.repeat(32)}`,
      trustAnchorDigestHex: TRUST_ANCHOR,
      parentLink: {
        parentNativeBlockHashHex: PARENT_NATIVE,
        parentNativeHeight: '11',
        parentStateRootHex: `0x${'59'.repeat(32)}`,
        eventNativeBlockHashHex: EVENT_NATIVE,
        eventNativeHeight: '12',
      },
      transition: {
        parentProcessedPegIn: false,
        postProcessedPegIn: true,
        parentTokenTotalSupply: '0',
        postTokenTotalSupply: AMOUNT.toString(),
        tokenTotalSupplyDelta: AMOUNT.toString(),
        parentRecipientBalance: '0',
        postRecipientBalance: AMOUNT.toString(),
        recipientBalanceDelta: AMOUNT.toString(),
        recipientBalanceStorageKeyHex: '0x01',
        parentNativeProcessedRecordStorageKeyHex: NATIVE_PROCESSED_STORAGE_KEY,
        mintTokenAddressHex: TOKEN_ADDRESS,
        mintTransactionHashHex: MINT_TRANSACTION,
        mintTransactionIndex: 0,
        mintTransactionLogIndex: 0,
        mintGlobalEventIndex: 1,
        mintRecipientAddressHex: `0x${TARGET_H160}`,
        mintAmount: AMOUNT.toString(),
      },
      contractStateVerification: {
        requestDigestHex: requestDigest,
        trustAnchorDigestHex: TRUST_ANCHOR,
        contractState: {
          bridgeAddressHex: BRIDGE_ADDRESS,
          tokenAddressHex: TOKEN_ADDRESS,
          bridgeRuntimeCodeSha256Hex: `0x${'5a'.repeat(32)}`,
          bridgeRuntimeCodeBytes: '4104',
          tokenRuntimeCodeSha256Hex: `0x${'5b'.repeat(32)}`,
          tokenRuntimeCodeBytes: '2356',
          bridgeOwnerAddressHex: OWNER_ADDRESS,
          tokenOwnerAddressHex: BRIDGE_ADDRESS,
          bridgeTokenAddressHex: TOKEN_ADDRESS,
          bridgePaused: false,
          processedPegInStorageKeyHex: EVM_PROCESSED_STORAGE_KEY,
          tokenTotalSupply: AMOUNT.toString(),
        },
        eventVerification: {
          executionIdentity: {
            record: {
              sidechainIdHex: SIDECHAIN_ID,
              ergoBoxIdHex: `0x${DEPOSIT_ID}`,
              recipientHex: `0x${TARGET_H160}`,
              amountNanoErg: AMOUNT.toString(),
              transactionHashHex: MINT_TRANSACTION,
              eventIndex: 1,
            },
            target: {
              nativeBlockHashHex: EVENT_NATIVE,
              nativeHeight: '12',
              stateRootHex: EVENT_STATE,
            },
            execution: {
              executionHeight: '12',
              executionBlockHashHex: EXECUTION_BLOCK,
            },
          },
          event: {
            transactionHashHex: MINT_TRANSACTION,
            transactionIndex: 0,
            globalEventIndex: 1,
            recipientHex: `0x${TARGET_H160}`,
            amountNanoErg: AMOUNT.toString(),
            ergoBoxIdHex: `0x${DEPOSIT_ID}`,
          },
        },
      },
    },
    contractStateLineageJoinCandidate: {
      candidateDigestHex: `0x${'5c'.repeat(32)}`,
      contractStateRequestDigestHex: requestDigest,
      trustAnchorDigestHex: TRUST_ANCHOR,
      nativeFinalityStatementDigestHex: `0x${'5d'.repeat(32)}`,
      target: {
        nativeBlockHashHex: EVENT_NATIVE,
        nativeHeight: '12',
        nativeStateRootHex: EVENT_STATE,
        executionHeight: '12',
        executionBlockHashHex: EXECUTION_BLOCK,
      },
      contracts: {
        bridgeAddressHex: BRIDGE_ADDRESS,
        tokenAddressHex: TOKEN_ADDRESS,
        bridgeRuntimeCodeSha256Hex: `0x${'5a'.repeat(32)}`,
        bridgeRuntimeCodeBytes: '4104',
        tokenRuntimeCodeSha256Hex: `0x${'5b'.repeat(32)}`,
        tokenRuntimeCodeBytes: '2356',
        bridgeOwnerAddressHex: OWNER_ADDRESS,
        tokenOwnerAddressHex: BRIDGE_ADDRESS,
        bridgeTokenAddressHex: TOKEN_ADDRESS,
        bridgePaused: false,
        tokenTotalSupply: AMOUNT.toString(),
      },
      pegIn: {
        transactionHashHex: MINT_TRANSACTION,
        transactionIndex: 0,
        globalEventIndex: 1,
        recipientHex: `0x${TARGET_H160}`,
        amountNanoErg: AMOUNT.toString(),
        ergoBoxIdHex: `0x${DEPOSIT_ID}`,
        processedPegIn: true,
      },
    },
  } as never;
}

function resolvedMclSource(): string {
  return injectCommitteePlaceholders(
    MCL_TEMPLATE,
    createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, '2'),
  ).replaceAll('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', VAULT_TREE);
}

function resolvedVaultSource(): string {
  return VAULT_TEMPLATE
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', DUP_NFT_ID);
}

function sha256HexBytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}
