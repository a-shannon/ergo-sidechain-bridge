import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  decodeCanonicalLongRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
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
  assertValidityApplicationPooledReserveBurnSettlementV4Packet,
  buildValidityApplicationPooledReserveBurnSettlementV4,
  decodeValidityApplicationPooledReserveTrackerValueV4,
  deriveValidityApplicationPooledReserveTrackerKeyV4Hex,
  encodeValidityApplicationPooledReserveTrackerValueV4Hex,
  getValidityApplicationPooledReserveTrackerDigestV4Hex,
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V4_DOMAIN,
  type BuildValidityApplicationPooledReserveBurnSettlementV4Input,
  type ValidityApplicationPooledReserveTrackerHistoryEntryV4,
  type ValidityApplicationPooledReserveTrackerValueV4Input,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
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
const RECIPIENT_TREE = `0008cd02${'88'.repeat(32)}`;
const SOURCE_AMOUNT = '40000000';
const BURN_AMOUNT = '10000000';
const SIDECHAIN_HEIGHT = '77';
const ANCHOR_HEIGHT = 120;
const CURRENT_HEIGHT = 130;
const RUNTIME_BINDING = {
  sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
  sourceRuntimeCodeBytes: 8192,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const;
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
    requiredSuccessorDepth: 10,
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
    commitmentDomain:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let provisioning:
  Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
let depositTransition:
  Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
let trackerDataInput: Eip12Box;
let feeFundingInput: Eip12Box;
let trackerHistory:
  readonly ValidityApplicationPooledReserveTrackerHistoryEntryV4[];
let burnLeaves: readonly TrustlessBurnLeafInput[];
let claim: BuildValidityApplicationPooledReserveBurnSettlementV4Input['claim'];
let trackerValueInput: ValidityApplicationPooledReserveTrackerValueV4Input;

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
  }, 'pooled-reserve burn-settlement genesis fixture');
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
    settlementVaultTemplateSha256Hex:
      `0x${sha256(TEMPLATES.pooledReserve)}`,
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
    runtimeBinding: RUNTIME_BINDING,
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
  depositTransition =
    await buildValidityApplicationPooledReserveDepositTransitionV4({
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

  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const sidechainBlockHashHex = `0x${'ab'.repeat(32)}`;
  burnLeaves = [0, 1, 2].map(index => {
    const sidechainTxHashHex =
      `0x${String(index + 1).padStart(2, '0').repeat(32)}`;
    return {
      sidechainIdHex: profile.sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: profile.sidechainIdHex,
        sidechainTxHashHex,
        eventIndex: index,
      }),
      sidechainTxHashHex,
      eventIndex: index,
      recipientErgoTreeHashHex: blake2b256Hex(
        Buffer.from(RECIPIENT_TREE, 'hex'),
      ),
      amountNanoErg: index === 1 ? BURN_AMOUNT : '1000000',
      assetIdHex: `0x${'00'.repeat(32)}`,
    };
  });
  const proof = buildTrustlessBurnInclusionProof(
    [...burnLeaves],
    burnLeaves[1].burnIdHex,
  );
  claim = {
    trackerIdentity: {
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: sidechainBlockHashHex,
    },
    burnLeaf: burnLeaves[1],
    leafIndex: proof.leafIndex,
    leafCount: proof.leafCount,
    burnProof: proof.proof,
    recipientErgoTreeHex: RECIPIENT_TREE,
  };
  trackerValueInput = {
    bridgeEventRootHex: proof.bridgeEventRootHex,
    checkpointCommitmentHex: `0x${'bc'.repeat(32)}`,
    anchorHeaderIdHex: `0x${'cd'.repeat(32)}`,
    anchorHeaderHeight: ANCHOR_HEIGHT,
    sidechainConsensusBlockHashHex: `0x${'de'.repeat(32)}`,
    burnLeafCount: proof.leafCount,
    applicationBindingDigestHex: compiled.application.burnBindingDigestHex,
    settlementProfileIdHex: profile.settlementProfileIdHex,
    pooledReserveProfileIdHex: compiled.lineageProfileIdHex,
    applicationPayloadDigestHex: `0x${'ef'.repeat(32)}`,
    programIdHex: compiled.application.programIdHex,
    verifierProfileIdHex: compiled.application.verifierProfileIdHex,
  };
  trackerHistory = [{
    key: deriveValidityApplicationPooledReserveTrackerKeyV4Hex({
      sidechainIdHex: profile.sidechainIdHex,
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: sidechainBlockHashHex,
    }),
    value: encodeValidityApplicationPooledReserveTrackerValueV4Hex(
      trackerValueInput,
    ),
  }];
  trackerDataInput = await buildTrackerBox(trackerHistory, SIDECHAIN_HEIGHT);
  feeFundingInput = await buildExactFeeBox();
});

describe('validity application pooled-reserve burn settlement V4', () => {
  it('encodes the exact versioned V4 tracker key and 370-byte value', () => {
    const encoded = encodeValidityApplicationPooledReserveTrackerValueV4Hex(
      trackerValueInput,
    );
    const decoded = decodeValidityApplicationPooledReserveTrackerValueV4(
      encoded,
    );

    expect(Buffer.from(encoded, 'hex')).toHaveLength(370);
    expect(trackerHistory[0].key)
      .toBe('b86fff95fcd2b039a2dccc8686518a79c00bb93c7feefcd58619deea517ad08f');
    expect(Buffer.from(encoded, 'hex').subarray(
      0,
      Buffer.byteLength(
        VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V4_DOMAIN,
        'ascii',
      ),
    ).toString('ascii')).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V4_DOMAIN,
    );
    expect(decoded).toEqual(expect.objectContaining({
      version: 4,
      hashAlgorithmId: 1,
      sourceFinalityProfileId: 1,
      flags: 0,
      bridgeEventRootHex: trackerValueInput.bridgeEventRootHex.replace(
        /^0x/,
        '',
      ),
      pooledReserveProfileIdHex: compiled.lineageProfileIdHex.replace(
        /^0x/,
        '',
      ),
    }));
    const discriminatorOffset = 38 * 2;
    const discriminatorMutations = [
      [0, '03', /version/i],
      [1, '02', /hash algorithm/i],
      [2, '02', /finality profile/i],
      [3, '01', /flags/i],
    ] as const;
    for (const [index, replacement, error] of discriminatorMutations) {
      const offset = discriminatorOffset + (index * 2);
      expect(() => decodeValidityApplicationPooledReserveTrackerValueV4(
        `${encoded.slice(0, offset)}${replacement}${encoded.slice(offset + 2)}`,
      )).toThrow(error);
    }
  });

  it('builds one deterministic unsigned V4 burn settlement packet', async () => {
    const first =
      await buildValidityApplicationPooledReserveBurnSettlementV4(buildInput());
    const second =
      await buildValidityApplicationPooledReserveBurnSettlementV4(buildInput());

    expect(second).toEqual(first);
    assertValidityApplicationPooledReserveBurnSettlementV4Packet(first);
    expect(first.transaction.eip12Tx.inputs.map(input => input.boxId)).toEqual([
      depositTransition.boxes.reserveSuccessor.boxId,
      provisioning.boxes.duplicatePrevention.boxId,
      feeFundingInput.boxId,
    ]);
    expect(first.transaction.eip12Tx.dataInputs).toEqual([trackerDataInput]);
    expect(first.transaction.outputs).toHaveLength(4);
    expect(first.transaction.eip12Tx.inputs[0].extension).toEqual(
      first.contextExtension,
    );
    expect(first.transaction.eip12Tx.inputs[1].extension).toEqual(
      first.contextExtension,
    );
    expect(first.transaction.eip12Tx.inputs[2].extension).toEqual({});
    expect(Object.keys(first.contextExtension)).toEqual(['0', '1', '2', '3']);
    expect(first.boxes.reserveSuccessor.value).toBe('32000000');
    expect(decodeCanonicalLongRegister(
      first.boxes.reserveSuccessor.additionalRegisters.R6,
    )).toBe(30000000n);
    expect(first.boxes.duplicatePreventionSuccessor.value)
      .toBe(provisioning.boxes.duplicatePrevention.value);
    expect(first.boxes.payout).toMatchObject({
      value: BURN_AMOUNT,
      ergoTree: RECIPIENT_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: CURRENT_HEIGHT,
    });
    expect(first.burn.duplicatePreventionKeyHex)
      .toBe(first.burn.leaf.burnIdHex);
    expect(first.invariants).toEqual({
      exactV4TrackerEntryProved: true,
      canonicalBurnInclusionProved: true,
      payoutBoundToBurnLeaf: true,
      reserveValueAndLiabilityReducedTogether: true,
      duplicatePreventionInsertedOnce: true,
      externalFeeIsValueNeutral: true,
      deterministicUnsignedTransactionConstructed: true,
    });
    expect(first.boundaries).toEqual(expect.objectContaining({
      burnSettlementTransactionConstructed: true,
      trackerAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    }));
  });

  it('uses the reviewed miner fee when the optional fee is omitted', async () => {
    const { feeNanoErg: _omitted, ...input } = buildInput();
    const packet =
      await buildValidityApplicationPooledReserveBurnSettlementV4(input);

    expect(packet.transaction.outputs[3].value).toBe(String(MINER_FEE));
  });

  it('accepts the canonical native-ERG leaf when assetId is omitted', async () => {
    const { assetIdHex: _omitted, ...burnLeaf } = claim.burnLeaf;
    const packet =
      await buildValidityApplicationPooledReserveBurnSettlementV4({
        ...buildInput(),
        claim: { ...claim, burnLeaf },
      });

    expect(packet.burn.leaf.assetIdHex).toBe('00'.repeat(32));
  });

  it('rejects a tracker root that does not authenticate the burn', async () => {
    const changed = {
      ...trackerValueInput,
      bridgeEventRootHex: `0x${'f1'.repeat(32)}`,
    };
    const state = await trackerStateFor(changed);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      trackerState: state,
    })).rejects.toThrow(/burn inclusion|bridgeEventRoot/i);
  });

  it('rejects a shallow or future Ergo anchor', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      currentErgoHeight: ANCHOR_HEIGHT + 9,
      creationHeight: ANCHOR_HEIGHT + 9,
    })).rejects.toThrow(/confirmations/i);
    const state = await trackerStateFor({
      ...trackerValueInput,
      anchorHeaderHeight: CURRENT_HEIGHT + 1,
    });
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      trackerState: state,
    })).rejects.toThrow(/future/i);
  });

  it('rejects a tracker value outside the compiled V4 application profile', async () => {
    const state = await trackerStateFor({
      ...trackerValueInput,
      applicationBindingDigestHex: compiled.application.bindingDigestHex,
    });
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      trackerState: state,
    })).rejects.toThrow(/burn application binding/i);
  });

  it('rejects every compiled tracker profile identity independently', async () => {
    const mutations: Array<[
      string,
      Partial<ValidityApplicationPooledReserveTrackerValueV4Input>,
    ]> = [
      ['settlement profile', {
        settlementProfileIdHex: `0x${'a1'.repeat(32)}`,
      }],
      ['pooled-reserve profile', {
        pooledReserveProfileIdHex: `0x${'a2'.repeat(32)}`,
      }],
      ['program', {
        programIdHex: `0x${'a3'.repeat(32)}`,
      }],
      ['verifier profile', {
        verifierProfileIdHex: `0x${'a4'.repeat(32)}`,
      }],
    ];
    for (const [label, mutation] of mutations) {
      const state = await trackerStateFor({
        ...trackerValueInput,
        ...mutation,
      });
      await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
        ...buildInput(),
        trackerState: state,
      }), label).rejects.toThrow(new RegExp(label, 'i'));
    }
  });

  it('rejects leaf sidechain, block, recipient, amount, and asset drift', async () => {
    const mutations: Array<[string, TrustlessBurnLeafInput]> = [
      ['sidechain', {
        ...claim.burnLeaf,
        sidechainIdHex: `0x${'f3'.repeat(32)}`,
      }],
      ['execution block', {
        ...claim.burnLeaf,
        sidechainBlockHashHex: `0x${'f4'.repeat(32)}`,
      }],
      ['recipient', {
        ...claim.burnLeaf,
        recipientErgoTreeHashHex: `0x${'f5'.repeat(32)}`,
      }],
      ['amount', {
        ...claim.burnLeaf,
        amountNanoErg: '9999999',
      }],
      ['asset', {
        ...claim.burnLeaf,
        assetIdHex: `0x${'f6'.repeat(32)}`,
      }],
    ];
    for (const [label, burnLeaf] of mutations) {
      await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
        ...buildInput(),
        claim: { ...claim, burnLeaf },
      }), label).rejects.toThrow();
    }
  });

  it('rejects payout recipient substitution after burn inclusion succeeds', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      claim: {
        ...claim,
        recipientErgoTreeHex: DEPOSITOR_TREE,
      },
    })).rejects.toThrow(/payout binding|recipient/i);
  });

  it('rejects malformed Merkle coordinates and proof bytes', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      claim: {
        ...claim,
        leafCount: claim.leafCount + 1,
      },
    })).rejects.toThrow(/leafCount|burn inclusion/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      claim: {
        ...claim,
        burnProof: claim.burnProof.map((step, index) => index === 0
          ? { ...step, hashHex: 'f7'.repeat(32) }
          : step),
      },
    })).rejects.toThrow(/burn inclusion|bridgeEventRoot/i);
  });

  it('rejects replayed burn IDs and a divergent DUP history digest', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: provisioning.boxes.duplicatePrevention,
        historyKeys: [claim.burnLeaf.burnIdHex],
      },
    })).rejects.toThrow(/already present|replay/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      duplicatePreventionState: {
        predecessor: provisioning.boxes.duplicatePrevention,
        historyKeys: ['f8'.repeat(32)],
      },
    })).rejects.toThrow(/digest/i);
  });

  it('rejects reserve profile drift and insufficient reserve liability', async () => {
    const wrongProfile = await rebox(
      depositTransition.boxes.reserveSuccessor,
      {
        additionalRegisters: {
          ...depositTransition.boxes.reserveSuccessor.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.from('f9'.repeat(32), 'hex')),
        },
      },
      'wrong pooled-reserve profile fixture',
    );
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      reserveState: { predecessor: wrongProfile },
    })).rejects.toThrow(/profile/i);

    const insufficientLiability = await rebox(
      depositTransition.boxes.reserveSuccessor,
      {
        additionalRegisters: {
          ...depositTransition.boxes.reserveSuccessor.additionalRegisters,
          R6: encodeLongRegister(BigInt(BURN_AMOUNT) - 1n),
        },
      },
      'insufficient pooled-reserve liability fixture',
    );
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      reserveState: { predecessor: insufficientLiability },
    })).rejects.toThrow(/liability/i);
  });

  it('rejects an invalid reserve tree, fee source, or successor height', async () => {
    const wrongTree = await rebox(
      depositTransition.boxes.reserveSuccessor,
      { ergoTree: GENESIS_TREE },
      'wrong pooled-reserve tree fixture',
    );
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      reserveState: { predecessor: wrongTree },
    })).rejects.toThrow(/ErgoTree|contract/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      feeNanoErg: BigInt(MINER_FEE) + 1n,
    })).rejects.toThrow(/fee funding|fee/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      creationHeight: CURRENT_HEIGHT - 101,
    })).rejects.toThrow(/creation height/i);
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      creationHeight: CURRENT_HEIGHT + 1,
    })).rejects.toThrow(/creation height/i);
  });

  it('rejects a sub-minimum payout and any future observed input box', async () => {
    const subMinimumLeaves = burnLeaves.map((leaf, index) => index === 1
      ? { ...leaf, amountNanoErg: '999999' }
      : leaf);
    const proof = buildTrustlessBurnInclusionProof(
      subMinimumLeaves,
      subMinimumLeaves[1].burnIdHex,
    );
    const subMinimumClaim = {
      ...claim,
      burnLeaf: subMinimumLeaves[1],
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
      burnProof: proof.proof,
    };
    const subMinimumTracker = await trackerStateFor({
      ...trackerValueInput,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      burnLeafCount: proof.leafCount,
    });
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      trackerState: subMinimumTracker,
      claim: subMinimumClaim,
    })).rejects.toThrow(/minimum box|minimum payout/i);

    const futureFeeInput = await rebox(
      feeFundingInput,
      { creationHeight: CURRENT_HEIGHT + 1 },
      'future fee input fixture',
    );
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      feeFundingInput: futureFeeInput,
    })).rejects.toThrow(/future|creation height/i);
  });

  it('rejects unknown authority-bearing fields instead of ignoring them', async () => {
    await expect(buildValidityApplicationPooledReserveBurnSettlementV4({
      ...buildInput(),
      verified: true,
    } as BuildValidityApplicationPooledReserveBurnSettlementV4Input))
      .rejects.toThrow(/unknown or missing fields/i);
  });

  it('snapshots mutable inputs before async box normalization and freezes output', async () => {
    const input = buildInput();
    const building =
      buildValidityApplicationPooledReserveBurnSettlementV4(input);
    const mutable = input as any;
    mutable.claim.recipientErgoTreeHex = DEPOSITOR_TREE;
    mutable.currentErgoHeight = CURRENT_HEIGHT + 100;
    mutable.trackerState.history[0].value = '00'.repeat(370);

    const packet = await building;
    expect(packet.boxes.payout.ergoTree).toBe(RECIPIENT_TREE);
    expect(packet.boxes.payout.creationHeight).toBe(CURRENT_HEIGHT);
    expect(packet.tracker.valueHex).toBe(trackerHistory[0].value);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.transaction)).toBe(true);
    expect(Object.isFrozen(packet.contextExtension)).toBe(true);
  });

  it('rejects forged packet objects outside the process-owned builder', () => {
    expect(() =>
      assertValidityApplicationPooledReserveBurnSettlementV4Packet({
        schema: 'e2s.validity-application-pooled-reserve-burn-settlement.v4',
        version: 4,
      }),
    ).toThrow(/not built in this process/i);
  });
});

function buildInput():
BuildValidityApplicationPooledReserveBurnSettlementV4Input {
  return {
    compiledInstance: compiled,
    trackerState: {
      dataInput: structuredClone(trackerDataInput),
      history: structuredClone(trackerHistory),
    },
    reserveState: {
      predecessor: structuredClone(depositTransition.boxes.reserveSuccessor),
    },
    duplicatePreventionState: {
      predecessor: structuredClone(provisioning.boxes.duplicatePrevention),
      historyKeys: [],
    },
    feeFundingInput: structuredClone(feeFundingInput),
    claim: structuredClone(claim),
    currentErgoHeight: CURRENT_HEIGHT,
    creationHeight: CURRENT_HEIGHT,
    feeNanoErg: MINER_FEE,
  };
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

async function trackerStateFor(
  value: ValidityApplicationPooledReserveTrackerValueV4Input,
): Promise<BuildValidityApplicationPooledReserveBurnSettlementV4Input[
  'trackerState'
]> {
  const history = [{
    key: trackerHistory[0].key,
    value: encodeValidityApplicationPooledReserveTrackerValueV4Hex(value),
  }];
  return {
    dataInput: await buildTrackerBox(history, SIDECHAIN_HEIGHT),
    history,
  };
}

async function buildTrackerBox(
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV4[],
  latestSidechainHeight: string,
): Promise<Eip12Box> {
  const predecessor = provisioning.boxes.tracker;
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...predecessor, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: predecessor.value,
      ergoTree: predecessor.ergoTree,
      assets: predecessor.assets,
      additionalRegisters: {
        ...predecessor.additionalRegisters,
        R5: encodeAvlTreeRegister(
          Buffer.from(
            getValidityApplicationPooledReserveTrackerDigestV4Hex(history),
            'hex',
          ),
          0x01,
          370,
        ),
        R7: encodeLongRegister(BigInt(latestSidechainHeight)),
        R8: encodeIntRegister(1),
      },
      creationHeight: 115,
    }],
  }, 'pooled-reserve V4 tracker data-input fixture');
  return transaction.outputs[0];
}

async function buildExactFeeBox(): Promise<Eip12Box> {
  const source =
    provisioning.transactions.duplicatePreventionIssuance.outputs[1];
  const sourceValue = BigInt(source.value);
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...source, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: MINER_FEE,
      ergoTree: source.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 115,
    }, {
      value: sourceValue - BigInt(MINER_FEE),
      ergoTree: source.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 115,
    }],
  }, 'pooled-reserve V4 burn external-fee fixture');
  return transaction.outputs[0];
}

async function rebox(
  box: Eip12Box,
  changes: Partial<Eip12OutputCandidate>,
  label: string,
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...box, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: box.value,
      ergoTree: box.ergoTree,
      assets: box.assets,
      additionalRegisters: box.additionalRegisters,
      creationHeight: box.creationHeight,
      ...changes,
    }],
  }, label);
  return transaction.outputs[0];
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
