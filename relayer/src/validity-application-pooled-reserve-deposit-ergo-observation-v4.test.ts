import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  MINER_FEE,
} from './ergo-encoding.js';
import {
  computeErgoBlockTransactionsRoot,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  compileValidityApplicationPooledReserveInstanceV4,
  createPinnedValidityApplicationPooledReserveCompilerV4,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  buildValidityApplicationPooledReserveProvisioningV4,
  type ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';
import {
  buildValidityApplicationPooledReserveDepositTransitionV4,
  type ValidityApplicationPooledReserveDepositTransitionV4Packet,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_ADAPTER_REGISTRY_V4,
  assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate,
  assertValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate,
  createValidityApplicationPooledReserveDepositErgoSourcePairV4,
  observeValidityApplicationPooledReserveDepositOnErgoV4,
  revalidateValidityApplicationPooledReserveDepositBeforeMintV4,
} from './validity-application-pooled-reserve-deposit-ergo-observation-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_STATUS,
  assertValidityApplicationPooledReserveMintAdmissionV4Candidate,
  buildValidityApplicationPooledReserveMintAdmissionV4,
} from './validity-application-pooled-reserve-mint-admission-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_STATUS,
  assertValidityApplicationPooledReserveMintReservationV4Request,
  buildValidityApplicationPooledReserveMintReservationV4,
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATES = Object.freeze({
  tracker: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerPooledReserveBurnV4.es',
  ), 'utf8'),
  duplicatePrevention: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionPooledReserveV4.es',
  ), 'utf8'),
  sourceLock: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockPooledReserveV4.es',
  ), 'utf8'),
  pooledReserve: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainPooledReserveValidityApplicationV4.es',
  ), 'utf8'),
});
const COMPILER_BATCH_JSON = readFileSync(resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-compiler-v4.json',
), 'utf8');
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const DEPOSITOR_TREE = `0008cd02${'77'.repeat(32)}`;
const SOURCE_AMOUNT = '40000000';
const REQUIRED_SUCCESSOR_DEPTH = 10;
const INCLUSION_HEIGHT = 200;
const TIP_HEIGHT = INCLUSION_HEIGHT + REQUIRED_SUCCESSOR_DEPTH;
const SIDECHAIN_FINALITY_POLICY:
  ValidityApplicationPooledReserveSidechainFinalityPolicyV1 = {
    proofSystemIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
    approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
    programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
    verifierProfileIdHex:
      `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
  };
const ERGO_DEPOSIT_FINALITY_POLICY:
  ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 = {
    version: 1,
    requiredSuccessorDepth: REQUIRED_SUCCESSOR_DEPTH,
    blockIdentityAndAncestryRequired: true,
    divergentRpcAction: 'hold',
    reorgAction: 'invalidate',
  };
const SOURCE_COMMITMENT_POLICY:
  ValidityApplicationPooledReserveSourceCommitmentPolicyV1 = {
    version: 1,
    refundDelayBlocks:
      VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
    pooledReserveInputIndex: 0,
    sourceLockInputIndex: 1,
    externalFeeInputIndex: 2,
    pooledReserveOutputIndex: 0,
    externalFeeOutputIndex: 1,
    sourceLockMustBeConsumed: true,
    externalFeeMustBeValueNeutral: true,
  };
const DEPOSIT_STATE_POLICY:
  ValidityApplicationPooledReserveDepositStatePolicyV1 = {
    version: 1,
    keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
    valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    operationFlags: VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    keySource: 'source-lock-box-id',
    valueHash: 'blake2b256',
    commitmentDomain: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };

interface FixtureHeader {
  id: string;
  parentId: string;
  height: number;
  version: number;
  adProofsRoot: string;
  stateRoot: string;
  transactionsRoot: string;
  timestamp: number;
  nBits: number;
  extensionHash: string;
  powSolutions: {
    pk: string;
    w: string;
    n: string;
    d: string;
  };
  votes: string;
}

interface FixtureNodeState {
  network: string;
  indexedHeight: number;
  headers: Map<string, FixtureHeader>;
  bestHeaderId: string;
  blocks: Map<string, Record<string, any>>;
  transactions: Map<string, Record<string, any>>;
  reserveBoxes: Record<string, any>[];
  sourceBoxes: Record<string, any>[];
  utxos: Map<string, Record<string, any>>;
  requests: string[];
  onRequest?: (requestKey: string) => void;
}

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let provisioning:
  Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
let transition:
  Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
let primaryState: FixtureNodeState;
let witnessState: FixtureNodeState;
let primaryServer: Server;
let witnessServer: Server;
let primaryOrigin: string;
let witnessOrigin: string;
let fixtureHeadersByHeight: ReadonlyMap<number, Readonly<FixtureHeader>>;

beforeAll(async () => {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'pooled-reserve Ergo observation genesis fixture');
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = funding.outputs;
  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256(TEMPLATES.tracker)}`,
    settlementVaultTemplateSha256Hex: `0x${sha256(TEMPLATES.pooledReserve)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256(TEMPLATES.duplicatePrevention)}`,
    sidechainFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        SIDECHAIN_FINALITY_POLICY,
      ),
    ergoDepositFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ERGO_DEPOSIT_FINALITY_POLICY,
      ),
    proofSystemIdHex: SIDECHAIN_FINALITY_POLICY.proofSystemIdHex,
    proofProfileIdHex: SIDECHAIN_FINALITY_POLICY.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        SOURCE_COMMITMENT_POLICY,
      ),
    depositCommitmentStatePolicyIdHex:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        DEPOSIT_STATE_POLICY,
      ),
    profileRevision: '1',
    activationHeight: '0',
  };
  const lineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics,
  });
  compiled = await compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: {
      sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
      sourceRuntimeCodeBytes: 8192,
      bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
      bridgeRuntimeCodeBytes: 4096,
      tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
      tokenRuntimeCodeBytes: 2048,
      maxPendingBlocks: 20,
    },
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      COMPILER_BATCH_JSON,
    ),
  });
  provisioning = await buildValidityApplicationPooledReserveProvisioningV4({
    compiledInstance: compiled,
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    values: {
      trackerNanoErg: '2000000',
      duplicatePreventionNanoErg: '2000000',
      pooledReserveNanoErg: '2000000',
    },
    fees: {
      trackerIssuanceNanoErg: MINER_FEE,
      duplicatePreventionIssuanceNanoErg: MINER_FEE,
      pooledReserveIssuanceNanoErg: MINER_FEE,
    },
    creationHeights: {
      trackerIssuance: 112,
      duplicatePreventionIssuance: 112,
      pooledReserveIssuance: 112,
    },
  });
  transition = await buildValidityApplicationPooledReserveDepositTransitionV4({
    compiledInstance: compiled,
    provisioning,
    sourceFundingBox: provisioning.transactions.trackerIssuance.outputs[1],
    sourceIntent: sourceIntent(),
    depositorErgoTreeHex: DEPOSITOR_TREE,
    fees: {
      sourceLockCreationNanoErg: MINER_FEE,
      reserveTransitionNanoErg: MINER_FEE,
    },
    creationHeights: {
      sourceLockCreation: 113,
      reserveTransition: 114,
    },
  });
  fixtureHeadersByHeight = buildFixtureHeaderChain();

  primaryServer = createFixtureServer(() => primaryState);
  witnessServer = createFixtureServer(() => witnessState);
  primaryOrigin = await listen(primaryServer);
  witnessOrigin = await listen(witnessServer);
});

afterAll(async () => {
  await Promise.all([close(primaryServer), close(witnessServer)]);
});

beforeEach(() => {
  primaryState = fixtureNodeState();
  witnessState = fixtureNodeState();
});

describe('validity application pooled-reserve concrete Ergo observation V4', () => {
  it('uses the static adapter and produces a fresh non-authorizing rerun', async () => {
    const sources = sourcePair();
    const observed = await observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: sources,
    });
    assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate(
      observed,
    );

    expect(observed.adapter).toEqual({
      registrySchema:
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_ADAPTER_REGISTRY_V4.schema,
      adapterId:
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_ADAPTER_REGISTRY_V4
          .adapters[0].adapterId,
      staticRegistrationMatched: true,
      readOnlyCapabilitiesOnly: true,
    });
    expect(observed.finality.finality).toMatchObject({
      inclusionHeight: INCLUSION_HEIGHT,
      requiredSuccessorDepth: REQUIRED_SUCCESSOR_DEPTH,
      targetHeight: TIP_HEIGHT,
      currentCanonicalTipHeight: TIP_HEIGHT,
    });
    expect(observed.transactionCommitments).toEqual({
      primary: {
        sourceId: sources.primary.sourceId,
        verification: expect.objectContaining({
          headerIdHex: headerId(INCLUSION_HEIGHT),
          height: INCLUSION_HEIGHT,
          blockVersion: 2,
          transactionsRootHex:
            fixtureHeadersByHeight.get(INCLUSION_HEIGHT)!.transactionsRoot,
          transactionIdHex:
            transition.transactions.reserveTransition.txId,
          transactionIndex: 1,
          transactionCount: 2,
          headerIdMatchedCanonicalBytes: true,
          transactionsRootMatchedCanonicalHeaderBytes: true,
          transactionRootMatched: true,
        }),
      },
      witness: {
        sourceId: sources.witness.sourceId,
        verification: expect.objectContaining({
          headerIdHex: headerId(INCLUSION_HEIGHT),
          transactionIdHex:
            transition.transactions.reserveTransition.txId,
          headerIdMatchedCanonicalBytes: true,
          transactionsRootMatchedCanonicalHeaderBytes: true,
          transactionRootMatched: true,
        }),
      },
    });
    expect(observed.boundaries).toMatchObject({
      transactionObservedInClaimedBlockByBothSources: true,
      blockTransactionCommitmentCryptographicallyVerified: true,
      depositOnlyReserveLineageReconstructedFromCurrentTip: true,
      historicalLineageTransactionFinalityIndependentlyEstablished: false,
      localPersistenceConsulted: false,
      immediatePreMintRevalidationRequired: true,
      immediatePreMintRevalidationCompleted: false,
      independentNodeControlEstablished: false,
      localMintEligibilityConditionMet: false,
      mintAuthorized: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });

    const revalidated =
      await revalidateValidityApplicationPooledReserveDepositBeforeMintV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sources,
        priorObservation: observed,
      });
    assertValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate(
      revalidated,
    );
    expect(revalidated.invariants).toEqual({
      sameStaticSourcePairReused: true,
      sameTransitionAndMintIdentity: true,
      sameBlockTransactionCommitments: true,
      inclusionAndFinalityTargetUnchanged: true,
      canonicalTipDidNotMoveBackward: true,
      completeObservationRerun: true,
    });
    expect(revalidated.boundaries).toMatchObject({
      freshObservationRerunCompleted: true,
      atomicMintAdmissionHandoffEstablished: false,
      localMintEligibilityConditionMet: false,
      mintAuthorized: false,
      localPersistenceConsulted: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });

    const requests = [...primaryState.requests, ...witnessState.requests];
    expect(requests).toContain(
      `GET /blocks/${headerId(INCLUSION_HEIGHT)}`,
    );
    expect(requests.some(request =>
      /\/wallet\/|POST \/transactions(?:$|\?)/.test(request)
    )).toBe(false);
  });

  it('rejects non-distinct origins and source-administration identities', () => {
    expect(() => createValidityApplicationPooledReserveDepositErgoSourcePairV4({
      ...sourcePairInput(),
      witnessNodeUrl: primaryOrigin,
    })).toThrow(/distinct Ergo node origins/);
    expect(() => createValidityApplicationPooledReserveDepositErgoSourcePairV4({
      ...sourcePairInput(),
      witnessNodeIdentityDigestHex: 'a1'.repeat(32),
    })).toThrow(/distinct node identities/);
    expect(() => createValidityApplicationPooledReserveDepositErgoSourcePairV4({
      ...sourcePairInput(),
      witnessAdministrationIdentityDigestHex: 'b1'.repeat(32),
    })).toThrow(/distinct administration identities/);
    expect(() => createValidityApplicationPooledReserveDepositErgoSourcePairV4({
      ...sourcePairInput(),
      environment: 'mainnet',
    })).toThrow(/explicitly non-mainnet/);
  });

  it('fails closed when the transaction is absent from its claimed block or ancestry drifts', async () => {
    const missingFromBlock = sourcePair();
    witnessState.blocks.get(headerId(INCLUSION_HEIGHT))!
      .blockTransactions.transactions = [];
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: missingFromBlock,
    })).rejects.toThrow(/transaction list|expected Ergo transaction/);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    witnessState.blocks.get(headerId(INCLUSION_HEIGHT))!.header.parentId =
      'f2'.repeat(32);
    const inconsistentBlockHeader = sourcePair();
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: inconsistentBlockHeader,
    })).rejects.toThrow(/claimed ID does not match canonical header bytes/);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    witnessState.headers.get(headerId(TIP_HEIGHT))!.parentId = 'f1'.repeat(32);
    const driftedAncestry = sourcePair();
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: driftedAncestry,
    })).rejects.toThrow(/header ancestry|header.*unavailable/);
  });

  it.each([
    [
      'header transaction root',
      (state: FixtureNodeState) => {
        state.blocks.get(headerId(INCLUSION_HEIGHT))!.header.transactionsRoot =
          'f1'.repeat(32);
      },
      /claimed ID does not match canonical header bytes/,
    ],
    [
      'transaction-section header ID',
      (state: FixtureNodeState) => {
        state.blocks.get(headerId(INCLUSION_HEIGHT))!
          .blockTransactions.headerId = 'f2'.repeat(32);
      },
      /transaction.*header ID does not match/i,
    ],
    [
      'transaction-section block version',
      (state: FixtureNodeState) => {
        state.blocks.get(headerId(INCLUSION_HEIGHT))!
          .blockTransactions.blockVersion = 1;
      },
      /versions disagree/,
    ],
    [
      'target witness bytes',
      (state: FixtureNodeState) => {
        const transactions = state.blocks.get(headerId(INCLUSION_HEIGHT))!
          .blockTransactions.transactions;
        transactions[1].inputs[0].spendingProof.proofBytes = '00';
      },
      /signed bytes disagree/,
    ],
    [
      'duplicate target transaction',
      (state: FixtureNodeState) => {
        const transactions = state.blocks.get(headerId(INCLUSION_HEIGHT))!
          .blockTransactions.transactions;
        transactions.push(structuredClone(transactions[1]));
      },
      /exactly once/,
    ],
    [
      'non-target transaction bytes',
      (state: FixtureNodeState) => {
        const transactions = state.blocks.get(headerId(INCLUSION_HEIGHT))!
          .blockTransactions.transactions;
        transactions[0].inputs[0].spendingProof.proofBytes = '00';
      },
      /transactions root/,
    ],
  ])('fails closed when %s drift', async (_label, mutate, expected) => {
    mutate(witnessState);
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: sourcePair(),
    })).rejects.toThrow(expected);
  });

  it('rejects a self-consistent replacement transaction list and root under the claimed header ID', async () => {
    const block = witnessState.blocks.get(headerId(INCLUSION_HEIGHT))!;
    const transactions = block.blockTransactions.transactions;
    transactions[0].inputs[0].spendingProof.proofBytes = '00';
    block.header.transactionsRoot = fixtureTransactionsRoot(
      block.header.version,
      transactions,
    );

    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: sourcePair(),
    })).rejects.toThrow(/claimed ID does not match canonical header bytes/);
  });

  it('fails closed on restored inputs, a missing reserve tip, and incomplete deposit history', async () => {
    const restoredSource = sourcePair();
    witnessState.utxos.set(
      transition.boxes.sourceLock.boxId,
      structuredClone(transition.boxes.sourceLock),
    );
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: restoredSource,
    })).rejects.toThrow(/source lock.*unspent/);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    witnessState.utxos.delete(transition.boxes.reserveSuccessor.boxId);
    const missingReserve = sourcePair();
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: missingReserve,
    })).rejects.toThrow(/reserve tip.*canonical UTXO/);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    witnessState.sourceBoxes = [];
    const missingHistory = sourcePair();
    await expect(observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: missingHistory,
    })).rejects.toThrow(/source-lock history|deposit source/);
  });

  it('invalidates a prior observation when complete revalidation sees restored collateral', async () => {
    const sources = sourcePair();
    const prior = await observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: compiled,
      depositTransition: transition,
      sourcePair: sources,
    });
    for (const state of [primaryState, witnessState]) {
      state.utxos.set(
        transition.boxes.reservePredecessor.boxId,
        structuredClone(transition.boxes.reservePredecessor),
      );
    }

    await expect(
      revalidateValidityApplicationPooledReserveDepositBeforeMintV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sources,
        priorObservation: prior,
      }),
    ).rejects.toThrow(/reserve predecessor.*unspent/);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    await expect(
      revalidateValidityApplicationPooledReserveDepositBeforeMintV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sourcePair(),
        priorObservation: prior,
      }),
    ).rejects.toThrow(/same statically registered source pair/);
  });
});

describe('validity application pooled-reserve mint admission V4', () => {
  it('joins an internal fresh rerun to one deterministic non-authorizing mint binding', async () => {
    const sources = sourcePair();
    const candidate =
      await buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sources,
      });
    assertValidityApplicationPooledReserveMintAdmissionV4Candidate(candidate);

    expect(candidate.status).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_ADMISSION_V4_STATUS,
    );
    expect(candidate.source).toMatchObject({
      sourceIntentHex: transition.sourceIntentHex,
      sourceLockBoxIdHex: transition.boxes.sourceLock.boxId,
      reserveTransitionTransactionIdHex:
        transition.transactions.reserveTransition.txId,
      depositCommitmentHex: transition.depositCommitmentHex,
      successorReserveBoxIdHex: transition.boxes.reserveSuccessor.boxId,
      successorReserveDigestHex: transition.successorReserveDigestHex,
    });
    expect(candidate.destination).toEqual({
      sidechainIdHex: `0x${'22'.repeat(32)}`,
      bridgeAddressHex: `0x${'33'.repeat(20)}`,
      tokenAddressHex: `0x${'44'.repeat(20)}`,
      recipientAddressHex: `0x${'66'.repeat(20)}`,
      settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    });
    expect(candidate.asset).toEqual({
      sourceAsset: 'ERG',
      sourceAssetIdHex: `0x${'00'.repeat(32)}`,
      amountUnit: 'nanoERG',
      amountNanoErg: SOURCE_AMOUNT,
    });
    expect(candidate.observation.blockTransactionCommitments).toMatchObject({
      primary: {
        sourceId: sources.primary.sourceId,
        verification: {
          headerIdHex: headerId(INCLUSION_HEIGHT),
          transactionsRootHex:
            fixtureHeadersByHeight.get(INCLUSION_HEIGHT)!.transactionsRoot,
          transactionIdHex:
            transition.transactions.reserveTransition.txId,
          headerIdMatchedCanonicalBytes: true,
          transactionsRootMatchedCanonicalHeaderBytes: true,
          transactionRootMatched: true,
        },
      },
      witness: {
        sourceId: sources.witness.sourceId,
        verification: {
          headerIdHex: headerId(INCLUSION_HEIGHT),
          transactionIdHex:
            transition.transactions.reserveTransition.txId,
          headerIdMatchedCanonicalBytes: true,
          transactionsRootMatchedCanonicalHeaderBytes: true,
          transactionRootMatched: true,
        },
      },
    });
    expect(candidate.checks).toEqual({
      sameProcessCandidateProvenanceVerified: true,
      exactCanonicalSourceIntentDecoded: true,
      explicitVersionedProfileBound: true,
      exactSourceLockAndReserveTransitionBound: true,
      exactDepositCommitmentRetainedInObservedDualSourceReserveView: true,
      exactAssetAmountAndRecipientBound: true,
      stableMintIdentityBound: true,
      completeObservationAndFreshRevalidationCompleted: true,
      callerSuppliedObservationOrRevalidationAccepted: false,
      localPersistenceConsulted: false,
      localNonAuthorizingMintEligibilityConditionMet: true,
    });
    expect(candidate.authority).toMatchObject({
      blockTransactionCommitmentCryptographicallyVerified: true,
      ergoConsensusAuthenticated: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(Object.entries(candidate.authority)
      .filter(([key]) =>
        key !== 'blockTransactionCommitmentCryptographicallyVerified'
      )
      .every(([, value]) => !value)).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.source)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveMintAdmissionV4Candidate(
        structuredClone(candidate),
      )
    ).toThrow(/not built in this process/);

    const observationRequestCount =
      primaryState.requests.length + witnessState.requests.length;
    const reservationRequest =
      buildValidityApplicationPooledReserveMintReservationV4({
        admissionCandidate: candidate,
      });
    assertValidityApplicationPooledReserveMintReservationV4Request(
      reservationRequest,
    );
    expect(reservationRequest.status).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_STATUS,
    );
    expect(reservationRequest.reservationKeyHex).toBe(
      `0x${candidate.mint.mintIdentityHex}`,
    );
    expect(reservationRequest.statement).toMatchObject({
      lineageProfileIdHex: candidate.lineageProfileIdHex,
      sourceIntentHex: candidate.source.sourceIntentHex,
      sourceIntentIdHex: candidate.source.sourceIntentIdHex,
      sourceLockBoxIdHex: `0x${candidate.source.sourceLockBoxIdHex}`,
      reserveTransitionTransactionIdHex:
        `0x${candidate.source.reserveTransitionTransactionIdHex}`,
      depositCommitmentHex:
        `0x${candidate.source.depositCommitmentHex}`,
      successorReserveBoxIdHex:
        `0x${candidate.source.successorReserveBoxIdHex}`,
      successorReserveDigestHex:
        `0x${candidate.source.successorReserveDigestHex}`,
      successorReserveLiabilityNanoErg:
        candidate.source.successorReserveLiabilityNanoErg,
    });
    expect(
      decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        reservationRequest.statementHex,
      ),
    ).toEqual(reservationRequest.statement);
    expect(reservationRequest.provenance).toEqual({
      admissionCandidateDigestHex: candidate.candidateDigestHex,
      sameProcessAdmissionCandidateVerified: true,
      callerSuppliedProofAccepted: false,
      localPersistenceConsulted: false,
    });
    expect(
      Object.values(reservationRequest.authority).every(value => !value),
    ).toBe(true);
    expect(
      primaryState.requests.length + witnessState.requests.length,
    ).toBe(observationRequestCount);
    expect(() =>
      buildValidityApplicationPooledReserveMintReservationV4({
        admissionCandidate: structuredClone(candidate),
      }),
    ).toThrow(/not built in this process/);
    expect(() =>
      buildValidityApplicationPooledReserveMintReservationV4({
        admissionCandidate: candidate,
        proof: 'caller-supplied',
      } as never),
    ).toThrow(/must contain exactly/);
    expect(() =>
      assertValidityApplicationPooledReserveMintReservationV4Request(
        structuredClone(reservationRequest),
      ),
    ).toThrow(/not built in this process/);

    const requests = [...primaryState.requests, ...witnessState.requests];
    expect(requests.filter(request =>
      request === `GET /blocks/${headerId(INCLUSION_HEIGHT)}`
    )).toHaveLength(8);
    expect(requests.some(request =>
      /\/wallet\/|POST \/transactions(?:$|\?)/.test(request)
    )).toBe(false);

    primaryState = fixtureNodeState();
    witnessState = fixtureNodeState();
    const repeated =
      await buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sources,
      });
    expect(repeated.candidateDigestHex).toBe(candidate.candidateDigestHex);
    expect(repeated.mint.mintIdentityHex).toBe(
      candidate.mint.mintIdentityHex,
    );
  });

  it('rejects caller-supplied evidence and binding overrides before any read', async () => {
    const sources = sourcePair();
    for (const extra of [
      { priorObservation: {} },
      { revalidation: {} },
      { amountNanoErg: '1' },
      { recipientAddressHex: `0x${'ff'.repeat(20)}` },
    ]) {
      await expect(
        buildValidityApplicationPooledReserveMintAdmissionV4({
          compiledInstance: compiled,
          depositTransition: transition,
          sourcePair: sources,
          ...extra,
        } as never),
      ).rejects.toThrow(/must contain exactly/);
    }

    const accessorInput = {
      compiledInstance: compiled,
      depositTransition: transition,
    } as Record<string, unknown>;
    Object.defineProperty(accessorInput, 'sourcePair', {
      enumerable: true,
      get: () => sources,
    });
    await expect(
      buildValidityApplicationPooledReserveMintAdmissionV4(
        accessorInput as never,
      ),
    ).rejects.toThrow(/own enumerable data properties/);
    expect(primaryState.requests).toEqual([]);
    expect(witnessState.requests).toEqual([]);
  });

  it('rejects cloned compiled, transition, and source-pair candidates', async () => {
    const sources = sourcePair();
    await expect(
      buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: structuredClone(compiled),
        depositTransition: transition,
        sourcePair: sources,
      }),
    ).rejects.toThrow(/same-process reviewed lineage candidate/);
    await expect(
      buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: compiled,
        depositTransition: structuredClone(transition),
        sourcePair: sources,
      }),
    ).rejects.toThrow(/built in this process/);
    await expect(
      buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: structuredClone(sources),
      }),
    ).rejects.toThrow(/source pair was not statically built in this process/);
    expect(primaryState.requests).toEqual([]);
    expect(witnessState.requests).toEqual([]);
  });

  it('fails closed when refundable collateral is restored before the internal rerun', async () => {
    const sources = sourcePair();
    let primaryInfoReads = 0;
    primaryState.onRequest = requestKey => {
      if (
        requestKey === 'GET /info'
        && (primaryInfoReads += 1) === 5
      ) {
        for (const state of [primaryState, witnessState]) {
          state.utxos.set(
            transition.boxes.sourceLock.boxId,
            structuredClone(transition.boxes.sourceLock),
          );
        }
      }
    };

    await expect(
      buildValidityApplicationPooledReserveMintAdmissionV4({
        compiledInstance: compiled,
        depositTransition: transition,
        sourcePair: sources,
      }),
    ).rejects.toThrow(/source lock is still unspent/);
  });
});

function sourcePair() {
  return createValidityApplicationPooledReserveDepositErgoSourcePairV4(
    sourcePairInput(),
  );
}

function sourcePairInput() {
  return {
    environment: 'testnet',
    primaryNodeUrl: primaryOrigin,
    primaryNodeIdentityDigestHex: 'a1'.repeat(32),
    primaryAdministrationIdentityDigestHex: 'b1'.repeat(32),
    witnessNodeUrl: witnessOrigin,
    witnessNodeIdentityDigestHex: 'a2'.repeat(32),
    witnessAdministrationIdentityDigestHex: 'b2'.repeat(32),
  } as const;
}

function fixtureNodeState(): FixtureNodeState {
  const reserveTransaction = signedTransaction(
    transition.transactions.reserveTransition,
    INCLUSION_HEIGHT,
    headerId(INCLUSION_HEIGHT),
  );
  const reserveIssuance = signedTransaction(
    provisioning.transactions.pooledReserveIssuance,
  );
  const sourceLockCreation = signedTransaction(
    transition.transactions.sourceLockCreation,
  );
  const reserveInput = reserveTransaction.inputs[0];
  const sourceInput = reserveTransaction.inputs[1];
  const reserveRoot = {
    ...structuredClone(provisioning.boxes.pooledReserve),
    inclusionHeight: 190,
    spentTransactionId: transition.transactions.reserveTransition.txId,
    spendingProof: structuredClone(reserveInput.spendingProof),
  };
  const reserveTip = {
    ...structuredClone(transition.boxes.reserveSuccessor),
    inclusionHeight: INCLUSION_HEIGHT,
    spentTransactionId: null,
    spendingProof: null,
  };
  const sourceBox = {
    ...structuredClone(transition.boxes.sourceLock),
    inclusionHeight: 191,
    spentTransactionId: transition.transactions.reserveTransition.txId,
    spendingProof: structuredClone(sourceInput.spendingProof),
  };
  const headers = new Map<string, FixtureHeader>(
    [...fixtureHeadersByHeight.values()].map(header => [
      header.id,
      structuredClone(header),
    ]),
  );
  const inclusionHeader = headers.get(headerId(INCLUSION_HEIGHT))!;
  const blockTransactions = [
    structuredClone(sourceLockCreation),
    structuredClone(reserveTransaction),
  ];
  return {
    network: 'testnet',
    indexedHeight: TIP_HEIGHT,
    headers,
    bestHeaderId: headerId(TIP_HEIGHT),
    blocks: new Map([[
      inclusionHeader.id,
      {
        header: structuredClone(inclusionHeader),
        blockTransactions: {
          headerId: inclusionHeader.id,
          blockVersion: inclusionHeader.version,
          transactions: blockTransactions,
        },
      },
    ]]),
    transactions: new Map([
      [reserveTransaction.id, reserveTransaction],
      [reserveIssuance.id, reserveIssuance],
      [sourceLockCreation.id, sourceLockCreation],
    ]),
    reserveBoxes: [reserveRoot, reserveTip],
    sourceBoxes: [sourceBox],
    utxos: new Map([[
      transition.boxes.reserveSuccessor.boxId,
      structuredClone(transition.boxes.reserveSuccessor),
    ]]),
    requests: [],
  };
}

function buildFixtureHeaderChain(): ReadonlyMap<
  number,
  Readonly<FixtureHeader>
> {
  const reserveTransaction = signedTransaction(
    transition.transactions.reserveTransition,
  );
  const sourceLockCreation = signedTransaction(
    transition.transactions.sourceLockCreation,
  );
  const inclusionTransactionsRoot = fixtureTransactionsRoot(2, [
    sourceLockCreation,
    reserveTransaction,
  ]);
  const headers = new Map<number, Readonly<FixtureHeader>>();
  let parentId = hexId(`header-${INCLUSION_HEIGHT - 1}`);
  for (let height = INCLUSION_HEIGHT; height <= TIP_HEIGHT; height += 1) {
    const headerWithoutId: Omit<FixtureHeader, 'id'> = {
      parentId,
      height,
      version: 2,
      adProofsRoot: hexId(`ad-proofs-${height}`),
      stateRoot: `00${hexId(`state-${height}`)}`,
      transactionsRoot: height === INCLUSION_HEIGHT
        ? inclusionTransactionsRoot
        : hexId(`transactions-${height}`),
      timestamp: 1_720_000_000_000 + height,
      nBits: 117_440_511,
      extensionHash: hexId(`extension-${height}`),
      powSolutions: {
        pk:
          '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        w:
          '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        n: height.toString(16).padStart(16, '0'),
        d: '0',
      },
      votes: '000000',
    };
    const header = Object.freeze({
      id: fixtureHeaderId(headerWithoutId),
      ...headerWithoutId,
    });
    headers.set(height, header);
    parentId = header.id;
  }
  return headers;
}

function signedTransaction(
  transaction: MaterializedUnsignedTransaction,
  inclusionHeight?: number,
  blockId?: string,
): Record<string, any> {
  return {
    id: transaction.txId,
    inputs: transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      spendingProof: {
        proofBytes: '',
        extension: structuredClone(input.extension),
      },
    })),
    dataInputs: transaction.eip12Tx.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: structuredClone(transaction.outputs),
    ...(inclusionHeight === undefined ? {} : { inclusionHeight }),
    ...(blockId === undefined ? {} : { blockId }),
  };
}

function fixtureTransactionsRoot(
  blockVersion: number,
  transactions: readonly Record<string, any>[],
): string {
  return computeErgoBlockTransactionsRoot({
    blockVersion,
    transactions: transactions.map(transaction => ({
      transactionId: Buffer.from(transaction.id, 'hex'),
      spendingProofs: transaction.inputs.map((input: Record<string, any>) => {
        const proofBytes = String(input.spendingProof.proofBytes);
        return Buffer.from(
          proofBytes.startsWith('0x') ? proofBytes.slice(2) : proofBytes,
          'hex',
        );
      }),
    })),
  }).toString('hex');
}

function fixtureHeaderId(
  header: Omit<FixtureHeader, 'id'>,
): string {
  const nBits = Buffer.alloc(4);
  nBits.writeUInt32BE(header.nBits);
  const fields = [
    Buffer.from([header.version]),
    Buffer.from(header.parentId, 'hex'),
    Buffer.from(header.adProofsRoot, 'hex'),
    Buffer.from(header.transactionsRoot, 'hex'),
    Buffer.from(header.stateRoot, 'hex'),
    unsignedVlq(header.timestamp),
    Buffer.from(header.extensionHash, 'hex'),
    nBits,
    unsignedVlq(header.height),
    Buffer.from(header.votes, 'hex'),
  ];
  if (header.version > 1) {
    fields.push(Buffer.from([0]));
  }
  fields.push(
    Buffer.from(header.powSolutions.pk, 'hex'),
    Buffer.from(header.powSolutions.n, 'hex'),
  );
  return Buffer.from(
    blakejs.blake2b(Buffer.concat(fields), undefined, 32),
  ).toString('hex');
}

function unsignedVlq(value: number): Buffer {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(bytes);
}

function createFixtureServer(
  getState: () => FixtureNodeState,
): Server {
  return createServer(async (request, response) => {
    try {
      await handleFixtureRequest(getState(), request, response);
    } catch (error) {
      respond(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function handleFixtureRequest(
  state: FixtureNodeState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET';
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  const requestKey = `${method} ${parsed.pathname}`;
  state.requests.push(requestKey);
  state.onRequest?.(requestKey);
  if (method === 'GET' && parsed.pathname === '/info') {
    respond(response, 200, { network: state.network });
    return;
  }
  if (method === 'GET' && parsed.pathname === '/blockchain/indexedHeight') {
    respond(response, 200, {
      indexedHeight: state.indexedHeight,
      fullHeight: state.indexedHeight,
    });
    return;
  }
  if (method === 'GET' && parsed.pathname === '/blocks/lastHeaders/1') {
    respond(response, 200, [
      structuredClone(state.headers.get(state.bestHeaderId)),
    ]);
    return;
  }
  const tokenMatch = /^\/blockchain\/box\/byTokenId\/([0-9a-f]{64})$/
    .exec(parsed.pathname);
  if (method === 'GET' && tokenMatch) {
    respondPage(response, parsed, state.reserveBoxes);
    return;
  }
  if (method === 'POST' && parsed.pathname === '/blockchain/box/byAddress') {
    await consumeBody(request);
    respondPage(response, parsed, state.sourceBoxes);
    return;
  }
  const transactionMatch =
    /^\/blockchain\/transaction\/byId\/([0-9a-f]{64})$/
      .exec(parsed.pathname);
  if (method === 'GET' && transactionMatch) {
    const transaction = state.transactions.get(transactionMatch[1]);
    respond(
      response,
      transaction === undefined ? 404 : 200,
      transaction ?? { error: 'not found' },
    );
    return;
  }
  const headerMatch = /^\/blocks\/([0-9a-f]{64})\/header$/
    .exec(parsed.pathname);
  if (method === 'GET' && headerMatch) {
    const header = state.headers.get(headerMatch[1]);
    respond(
      response,
      header === undefined ? 404 : 200,
      header ?? { error: 'not found' },
    );
    return;
  }
  const blockMatch = /^\/blocks\/([0-9a-f]{64})$/.exec(parsed.pathname);
  if (method === 'GET' && blockMatch) {
    const block = state.blocks.get(blockMatch[1]);
    respond(
      response,
      block === undefined ? 404 : 200,
      block ?? { error: 'not found' },
    );
    return;
  }
  const utxoMatch = /^\/utxo\/byId\/([0-9a-f]{64})$/.exec(parsed.pathname);
  if (method === 'GET' && utxoMatch) {
    const box = state.utxos.get(utxoMatch[1]);
    respond(
      response,
      box === undefined ? 404 : 200,
      box ?? { error: 'not found' },
    );
    return;
  }
  respond(response, 404, { error: 'not found' });
}

function respondPage(
  response: ServerResponse,
  parsed: URL,
  items: readonly unknown[],
): void {
  const offset = Number(parsed.searchParams.get('offset') ?? 0);
  const limit = Number(parsed.searchParams.get('limit') ?? 16);
  respond(response, 200, {
    items: structuredClone(items.slice(offset, offset + limit)),
    total: items.length,
  });
}

function respond(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': payload.length,
  });
  response.end(payload);
}

async function consumeBody(request: IncomingMessage): Promise<void> {
  for await (const _chunk of request) {
    // Drain the bounded local request body.
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fixture server did not expose a TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
  });
}

function sourceIntent(): PegInSourceIntentV2 {
  return {
    formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    admissionProfileIdHex: compiled.lineageProfileIdHex,
    sourceAssetIdHex: `0x${'00'.repeat(32)}`,
    amountNanoErg: SOURCE_AMOUNT,
    recipientAddressHex: `0x${'66'.repeat(20)}`,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function headerId(height: number): string {
  const header = fixtureHeadersByHeight?.get(height);
  if (header === undefined) {
    throw new Error(`fixture header ${height} is unavailable`);
  }
  return header.id;
}

function hexId(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
