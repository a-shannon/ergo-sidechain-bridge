import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';
import blakejs from 'blakejs';

import {
  getPooledReserveCommitmentProof,
} from './avl-bridge.js';
import {
  decodeAvlTreeRegisterDigest,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
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
  assertValidityApplicationPooledReserveDepositFinalityV4Candidate,
  buildValidityApplicationPooledReserveDepositFinalityV4,
  VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
  type ValidityApplicationPooledReserveDepositFinalityViewV4,
  type ValidityApplicationPooledReserveDepositObservationPortV4,
  type ValidityApplicationPooledReserveDepositObservationQueryV4,
} from './validity-application-pooled-reserve-deposit-finality-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
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

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let provisioning:
  Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
let transition:
  Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
let descendantTransition:
  Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;

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
  }, 'pooled-reserve deposit-finality genesis fixture');
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
  descendantTransition =
    await buildValidityApplicationPooledReserveDepositTransitionV4({
      compiledInstance: compiled,
      provisioning,
      sourceFundingBox:
        transition.transactions.sourceLockCreation.outputs[2],
      sourceIntent: {
        ...sourceIntent(),
        amountNanoErg: '20000000',
        recipientAddressHex: `0x${'88'.repeat(20)}`,
      },
      depositorErgoTreeHex: DEPOSITOR_TREE,
      reserveState: {
        reservePredecessor: transition.boxes.reserveSuccessor,
        depositHistory: [{
          sourceLockBoxIdHex: transition.boxes.sourceLock.boxId,
          depositCommitmentHex: transition.depositCommitmentHex,
        }],
      },
      fees: {
        sourceLockCreationNanoErg: MINER_FEE,
        reserveTransitionNanoErg: MINER_FEE,
      },
      creationHeights: {
        sourceLockCreation: 115,
        reserveTransition: 116,
      },
    });
});

describe('validity application pooled-reserve deposit finality V4', () => {
  it('derives a deterministic non-authorizing mint candidate from two stable views', async () => {
    const seenQueries:
      Readonly<ValidityApplicationPooledReserveDepositObservationQueryV4>[] = [];
    const first = await buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => canonicalView(), seenQueries),
      makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView(), seenQueries),
    );
    const second = await buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => canonicalView()),
      makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView()),
    );

    expect(second).toEqual(first);
    expect(first.mintIdentityHex).toBe(expectedMintIdentityHex());
    expect(first.ergoDepositFinalityPolicyIdHex)
      .toBe(compiled.ergoDepositFinalityPolicy.policyIdHex);
    expect(first.finality).toMatchObject({
      inclusionHeight: 200,
      requiredSuccessorDepth: REQUIRED_SUCCESSOR_DEPTH,
      targetHeight: 210,
      currentCanonicalTipHeight: 210,
    });
    expect(Object.values(first.observations).every(value =>
      Array.isArray(value) || value === true
    )).toBe(true);
    expect(first.boundaries.finalityObservationCandidateConstructed).toBe(true);
    expect(first.boundaries.localMintEligibilityConditionMet).toBe(false);
    expect(first.boundaries.transactionToBlockInclusionEstablished).toBe(false);
    expect(first.boundaries.immediatePreMintRevalidationRequired).toBe(true);
    expect(first.boundaries.immediatePreMintRevalidationCompleted).toBe(false);
    expect(first.boundaries.localPersistenceConsulted).toBe(false);
    expect(Object.entries(first.boundaries)
      .filter(([key]) => ![
        'finalityObservationCandidateConstructed',
        'immediatePreMintRevalidationRequired',
      ].includes(key))
      .every(([, value]) => value === false)).toBe(true);
    expect(seenQueries).toHaveLength(4);
    expect(seenQueries.every(query => Object.isFrozen(query))).toBe(true);
    expect(seenQueries[0]).toEqual({
      transitionTxIdHex: transition.transactions.reserveTransition.txId,
      sourceLockBoxIdHex: transition.boxes.sourceLock.boxId,
      reservePredecessorBoxIdHex: transition.boxes.reservePredecessor.boxId,
      reserveSuccessorBoxIdHex: transition.boxes.reserveSuccessor.boxId,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.finality)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveDepositFinalityV4Candidate(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveDepositFinalityV4Candidate(
        structuredClone(first),
      )
    ).toThrow(/not built in this process/);
  });

  it('retains the first deposit through a later canonical reserve descendant', async () => {
    const view = canonicalView(200, descendantTransition.boxes.reserveSuccessor);
    const candidate = await buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => view),
      makePort('rpc-b', 'https://rpc-b.invalid', () => view),
    );

    expect(candidate.sourceLockBoxIdHex).toBe(transition.boxes.sourceLock.boxId);
    expect(candidate.observations
      .canonicalReserveDescendantPresentAndDepositRetained).toBe(true);
    expect(candidate.boundaries.localMintEligibilityConditionMet).toBe(false);
  });

  it('binds the required-depth target to a deeper current tip by direct ancestry', async () => {
    const view = canonicalView(
      200,
      descendantTransition.boxes.reserveSuccessor,
      2,
    );
    const candidate = await buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => view),
      makePort('rpc-b', 'https://rpc-b.invalid', () => view),
    );

    expect(candidate.finality).toMatchObject({
      targetHeight: 210,
      currentCanonicalTipHeight: 212,
    });
  });

  it('rejects cloned same-shape authority dependencies', async () => {
    const sources = stableSources();
    await expect(buildValidityApplicationPooledReserveDepositFinalityV4({
      compiledInstance: structuredClone(compiled),
      depositTransition: transition,
      observationSources: sources,
    })).rejects.toThrow(/same-process reviewed lineage candidate/);
    await expect(buildValidityApplicationPooledReserveDepositFinalityV4({
      compiledInstance: compiled,
      depositTransition: structuredClone(transition),
      observationSources: sources,
    })).rejects.toThrow(/not built in this process/);
  });

  it('rejects transaction, ancestry, depth, and UTXO drift independently', async () => {
    const cases: Array<[
      string,
      (view: MutableView) => void | Promise<void>,
      RegExp,
    ]> = [
      ['reordered inputs', view => {
        [view.transaction.eip12Tx.inputs[0], view.transaction.eip12Tx.inputs[1]]
          = [view.transaction.eip12Tx.inputs[1], view.transaction.eip12Tx.inputs[0]];
      }, /transaction/],
      ['duplicate input', view => {
        view.transaction.eip12Tx.inputs.push(
          structuredClone(view.transaction.eip12Tx.inputs[0]),
        );
      }, /transaction/],
      ['data input', view => {
        view.transaction.eip12Tx.dataInputs.push(
          structuredClone(transition.boxes.sourceLock),
        );
      }, /transaction/],
      ['extra output', view => {
        view.transaction.outputs.push(
          structuredClone(view.transaction.outputs[0]),
        );
      }, /transaction/],
      ['wrong inclusion', view => {
        view.inclusion.headerIdHex = hexId('wrong-inclusion');
      }, /does not start at inclusion/],
      ['broken ancestry', view => {
        view.canonicalHeaders[2].parentHeaderIdHex = hexId('wrong-parent');
      }, /ancestry is not direct/],
      ['stale target', view => {
        view.canonicalTarget.headerIdHex = hexId('stale-target');
      }, /canonical finality target/],
      ['insufficient depth', view => {
        view.canonicalHeaders = view.canonicalHeaders.slice(
          0,
          REQUIRED_SUCCESSOR_DEPTH,
        );
        const last = view.canonicalHeaders.at(-1)!;
        view.currentTip = {
          height: last.height,
          headerIdHex: last.headerIdHex,
        };
      }, /insufficient successor depth/],
      ['source still unspent', view => {
        view.reserveState.sourceLock =
          structuredClone(transition.boxes.sourceLock);
      }, /source lock unspent/],
      ['predecessor still unspent', view => {
        view.reserveState.reservePredecessor =
          structuredClone(transition.boxes.reservePredecessor);
      }, /reserve predecessor unspent/],
      ['reserve descendant absent', view => {
        view.reserveState.canonicalReserveTip = null;
      }, /does not report a canonical reserve descendant/],
      ['reserve descendant mutated', async view => {
        view.reserveState.canonicalReserveTip!.value =
          String(BigInt(view.reserveState.canonicalReserveTip!.value) + 1n);
        await rematerializeReserveTip(view);
      }, /canonical reserve tip/],
      ['wrong reserve NFT', async view => {
        view.reserveState.canonicalReserveTip!.assets[0].tokenId =
          'ff'.repeat(32);
        await rematerializeReserveTip(view);
      }, /singleton NFT/],
      ['wrong reserve proposition', async view => {
        view.reserveState.canonicalReserveTip!.ergoTree = DEPOSITOR_TREE;
        await rematerializeReserveTip(view);
      }, /pooled-reserve contract/],
      ['wrong reserve profile', async view => {
        view.reserveState.canonicalReserveTip!.additionalRegisters.R4 =
          encodeCollByteRegister(Buffer.from('ff'.repeat(32), 'hex'));
        await rematerializeReserveTip(view);
      }, /lineage profile/],
      ['wrong reserve AVL flags', async view => {
        const digest = decodeAvlTreeRegisterDigest(
          view.reserveState.canonicalReserveTip!.additionalRegisters.R5,
        );
        view.reserveState.canonicalReserveTip!.additionalRegisters.R5 =
          encodeAvlTreeRegister(Buffer.from(digest, 'hex'), 0, 32);
        await rematerializeReserveTip(view);
      }, /AVL shape/],
      ['wrong reserve AVL value length', async view => {
        const digest = decodeAvlTreeRegisterDigest(
          view.reserveState.canonicalReserveTip!.additionalRegisters.R5,
        );
        view.reserveState.canonicalReserveTip!.additionalRegisters.R5 =
          encodeAvlTreeRegister(Buffer.from(digest, 'hex'), 1, 31);
        await rematerializeReserveTip(view);
      }, /AVL shape/],
      ['reserve liability exceeds value', async view => {
        view.reserveState.canonicalReserveTip!.additionalRegisters.R6 =
          encodeLongRegister(
            BigInt(view.reserveState.canonicalReserveTip!.value) + 1n,
          );
        await rematerializeReserveTip(view);
      }, /liability exceeds/],
      ['coordinated free-seed drift', async view => {
        const tip = view.reserveState.canonicalReserveTip!;
        tip.value = String(BigInt(tip.value) + 1n);
        tip.additionalRegisters.R6 = encodeLongRegister(
          BigInt(transition.reserveState.successorLiabilityNanoErg) + 2n,
        );
        await rematerializeReserveTip(view);
      }, /free-reserve seed/],
      ['wrong membership proof', view => {
        view.reserveState.depositMembershipProofHex = '00';
      }, /membership/],
    ];

    for (const [label, mutate, expected] of cases) {
      const view = canonicalView() as MutableView;
      await mutate(view);
      await expect(buildCandidate(
        makePort(`rpc-a-${label}`, `https://a-${label}.invalid`, () => view),
        makePort(`rpc-b-${label}`, `https://b-${label}.invalid`, () => view),
      ), label).rejects.toThrow(expected);
    }
  });

  it('rejects a required-depth target from a fork disconnected from a deeper tip', async () => {
    const view = canonicalView(
      200,
      transition.boxes.reserveSuccessor,
      2,
    ) as MutableView;
    const staleTargetIdHex = hexId('stale-target-on-fork-a');
    view.canonicalHeaders[REQUIRED_SUCCESSOR_DEPTH].headerIdHex =
      staleTargetIdHex;
    view.canonicalTarget.headerIdHex = staleTargetIdHex;

    await expect(buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => view),
      makePort('rpc-b', 'https://rpc-b.invalid', () => view),
    )).rejects.toThrow(/ancestry is not direct/);
  });

  it('holds on unstable views, RPC disagreement, or duplicate source identity', async () => {
    const changed = canonicalView() as MutableView;
    changed.currentTip.headerIdHex = hexId('different-tip');
    changed.canonicalHeaders.at(-1)!.headerIdHex =
      changed.currentTip.headerIdHex;
    changed.canonicalTarget.headerIdHex = changed.currentTip.headerIdHex;
    const unstableViews = [canonicalView(), changed];
    await expect(buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', call =>
        unstableViews[Math.min(call, 1)]
      ),
      makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView()),
    )).rejects.toThrow(/changed during read/);

    const disagreement = canonicalView(201);
    await expect(buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => canonicalView()),
      makePort('rpc-b', 'https://rpc-b.invalid', () => disagreement),
    )).rejects.toThrow(/disagree/);

    await expect(buildCandidate(
      makePort('same', 'https://rpc-a.invalid', () => canonicalView()),
      makePort('same', 'https://rpc-b.invalid', () => canonicalView()),
    )).rejects.toThrow(/IDs must be distinct/);
    await expect(buildCandidate(
      makePort('rpc-a', 'https://same.invalid', () => canonicalView()),
      makePort('rpc-b', 'https://same.invalid', () => canonicalView()),
    )).rejects.toThrow(/origins must be distinct/);
  });

  it('rejects unknown fields, unsafe numbers, accessors, and capability substitution', async () => {
    const unknown = canonicalView() as MutableView & { verified?: boolean };
    unknown.verified = true;
    await expect(buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => unknown),
      makePort('rpc-b', 'https://rpc-b.invalid', () => unknown),
    )).rejects.toThrow(/unknown, aliased, or missing fields/);

    const unsafe = canonicalView() as MutableView;
    unsafe.currentTip.height = Number.MAX_SAFE_INTEGER + 1;
    await expect(buildCandidate(
      makePort('rpc-a', 'https://rpc-a.invalid', () => unsafe),
      makePort('rpc-b', 'https://rpc-b.invalid', () => unsafe),
    )).rejects.toThrow(/safe integer/);

    let getterCalls = 0;
    const accessorPort = {
      origin: 'https://accessor.invalid',
      readCanonicalDepositView: async () => canonicalView(),
    } as Record<string, unknown>;
    Object.defineProperty(accessorPort, 'sourceId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'accessor';
      },
    });
    await expect(buildValidityApplicationPooledReserveDepositFinalityV4({
      compiledInstance: compiled,
      depositTransition: transition,
      observationSources: [
        accessorPort as unknown as
          ValidityApplicationPooledReserveDepositObservationPortV4,
        makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView()),
      ],
    })).rejects.toThrow(/data properties/);
    expect(getterCalls).toBe(0);

    const mutable = makePort(
      'rpc-a',
      'https://rpc-a.invalid',
      () => canonicalView(),
    ) as MutableObservationPort;
    const original = mutable.readCanonicalDepositView;
    let calls = 0;
    mutable.readCanonicalDepositView = async query => {
      calls += 1;
      if (calls === 1) {
        mutable.readCanonicalDepositView = async () => {
          throw new Error('substituted method must not run');
        };
      }
      return original(query);
    };
    await expect(buildCandidate(
      mutable,
      makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView()),
    )).rejects.toThrow(/capability or identity changed/);
  });
});

type MutableView = {
  -readonly [K in keyof ValidityApplicationPooledReserveDepositFinalityViewV4]:
    ValidityApplicationPooledReserveDepositFinalityViewV4[K] extends
      readonly (infer Item)[]
      ? Array<{ -readonly [P in keyof Item]: Item[P] }>
      : ValidityApplicationPooledReserveDepositFinalityViewV4[K] extends object
        ? {
            -readonly [P in keyof
              ValidityApplicationPooledReserveDepositFinalityViewV4[K]]:
                ValidityApplicationPooledReserveDepositFinalityViewV4[K][P]
          }
        : ValidityApplicationPooledReserveDepositFinalityViewV4[K];
};

type MutableObservationPort = {
  sourceId: string;
  origin: string;
  readCanonicalDepositView: (
    query: Readonly<
      ValidityApplicationPooledReserveDepositObservationQueryV4
    >,
  ) => Promise<unknown>;
};

function buildCandidate(
  first: ValidityApplicationPooledReserveDepositObservationPortV4,
  second: ValidityApplicationPooledReserveDepositObservationPortV4,
) {
  return buildValidityApplicationPooledReserveDepositFinalityV4({
    compiledInstance: compiled,
    depositTransition: transition,
    observationSources: [first, second],
  });
}

function stableSources(): readonly [
  ValidityApplicationPooledReserveDepositObservationPortV4,
  ValidityApplicationPooledReserveDepositObservationPortV4,
] {
  return [
    makePort('rpc-a', 'https://rpc-a.invalid', () => canonicalView()),
    makePort('rpc-b', 'https://rpc-b.invalid', () => canonicalView()),
  ];
}

function makePort(
  sourceId: string,
  origin: string,
  view: (call: number) => unknown,
  seenQueries: Readonly<
    ValidityApplicationPooledReserveDepositObservationQueryV4
  >[] = [],
): ValidityApplicationPooledReserveDepositObservationPortV4 {
  let calls = 0;
  return {
    sourceId,
    origin,
    readCanonicalDepositView: async query => {
      seenQueries.push(query);
      return structuredClone(view(calls++));
    },
  };
}

function canonicalView(
  inclusionHeight = 200,
  reserveTip: Eip12Box = transition.boxes.reserveSuccessor,
  tipExtraDepth = 0,
): ValidityApplicationPooledReserveDepositFinalityViewV4 {
  const canonicalHeaders = [];
  let parentHeaderIdHex = hexId(`parent-${inclusionHeight}`);
  for (
    let height = inclusionHeight;
    height <= inclusionHeight + REQUIRED_SUCCESSOR_DEPTH + tipExtraDepth;
    height += 1
  ) {
    const headerIdHex = hexId(`header-${height}`);
    canonicalHeaders.push({
      height,
      headerIdHex,
      parentHeaderIdHex,
    });
    parentHeaderIdHex = headerIdHex;
  }
  const tip = canonicalHeaders.at(-1)!;
  const target = canonicalHeaders[REQUIRED_SUCCESSOR_DEPTH];
  const history = [{
    key: transition.boxes.sourceLock.boxId,
    value: transition.depositCommitmentHex,
  }];
  if (reserveTip.boxId === descendantTransition.boxes.reserveSuccessor.boxId) {
    history.push({
      key: descendantTransition.boxes.sourceLock.boxId,
      value: descendantTransition.depositCommitmentHex,
    });
  }
  const membership = getPooledReserveCommitmentProof(
    history,
    transition.boxes.sourceLock.boxId,
  );
  return {
    transaction: structuredClone(
      transition.transactions.reserveTransition,
    ),
    inclusion: {
      height: inclusionHeight,
      headerIdHex: canonicalHeaders[0].headerIdHex,
    },
    canonicalHeaders,
    canonicalTarget: {
      height: target.height,
      headerIdHex: target.headerIdHex,
    },
    currentTip: {
      height: tip.height,
      headerIdHex: tip.headerIdHex,
    },
    reserveState: {
      sourceLock: null,
      reservePredecessor: null,
      canonicalReserveTip: structuredClone(reserveTip),
      depositMembershipProofHex: membership.get_proof_hex,
    },
  };
}

async function rematerializeReserveTip(view: MutableView): Promise<void> {
  const candidate = view.reserveState.canonicalReserveTip;
  if (candidate === null) {
    throw new Error('reserve tip fixture is absent');
  }
  const loaded = await import('ergo-lib-wasm-nodejs');
  const wasm: any = loaded.default ?? loaded;
  const builder = new wasm.ErgoBoxCandidateBuilder(
    wasm.BoxValue.from_i64(wasm.I64.from_str(candidate.value)),
    wasm.Contract.new(wasm.ErgoTree.from_base16_bytes(candidate.ergoTree)),
    candidate.creationHeight,
  );
  for (const asset of candidate.assets) {
    builder.add_token(
      wasm.TokenId.from_str(asset.tokenId),
      wasm.TokenAmount.from_i64(wasm.I64.from_str(asset.amount)),
    );
  }
  for (const [register, value] of Object.entries(
    candidate.additionalRegisters,
  )) {
    builder.set_register_value(
      Number(register.slice(1)),
      wasm.Constant.decode_from_base16(value),
    );
  }
  view.reserveState.canonicalReserveTip = wasm.ErgoBox.from_box_candidate(
    builder.build(),
    wasm.TxId.from_str(candidate.transactionId),
    candidate.index,
  ).to_js_eip12() as Eip12Box;
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

function expectedMintIdentityHex(): string {
  const payload = Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
      'ascii',
    ),
    Buffer.from(compiled.lineageProfileIdHex.slice(2), 'hex'),
    Buffer.from(transition.boxes.sourceLock.boxId, 'hex'),
    Buffer.from(transition.depositCommitmentHex, 'hex'),
  ]);
  return Buffer.from(blakejs.blake2b(payload, undefined, 32)).toString('hex');
}

function hexId(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
