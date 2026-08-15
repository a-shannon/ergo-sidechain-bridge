import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalLongRegister,
  encodeCollByteRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  verifyPooledReserveCommitmentInsert,
} from './avl-bridge.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  decodePegInSourceIntentV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
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
  assertValidityApplicationPooledReserveDepositTransitionV4Packet,
  buildValidityApplicationPooledReserveDepositTransitionV4,
  type BuildValidityApplicationPooledReserveDepositTransitionV4Input,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  assertValidityApplicationPooledReserveSourceRefundV4Packet,
  buildValidityApplicationPooledReserveSourceRefundV4,
  type BuildValidityApplicationPooledReserveSourceRefundV4Input,
} from './validity-application-pooled-reserve-source-refund-v4.js';
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
    commitmentDomain: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let provisioning:
  Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>;
let sourceFunding: Eip12Box;

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
  }, 'pooled-reserve deposit-transition genesis fixture');
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
  sourceFunding = provisioning.transactions.trackerIssuance.outputs[1];
});

describe('validity application pooled-reserve deposit transition V4', () => {
  it('builds one deterministic atomic source-lock-to-reserve transition', async () => {
    const first = await buildValidityApplicationPooledReserveDepositTransitionV4(
      buildInput(),
    );
    const second = await buildValidityApplicationPooledReserveDepositTransitionV4(
      buildInput(),
    );

    expect(second).toEqual(first);
    expect(first.transactions.sourceLockCreation.eip12Tx.inputs)
      .toEqual([expect.objectContaining({
        boxId: sourceFunding.boxId,
        extension: {},
      })]);
    expect(first.transactions.sourceLockCreation.eip12Tx.dataInputs).toEqual([]);
    expect(first.transactions.sourceLockCreation.outputs).toHaveLength(4);
    expect(first.boxes.sourceLock).toMatchObject({
      value: SOURCE_AMOUNT,
      ergoTree: compiled.contracts.sourceLock.receipt.propositionHex,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(
          first.sourceIntentHex.slice(2),
          'hex',
        )),
        R5: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 113,
    });
    expect(first.boxes.transitionFeeFunding).toMatchObject({
      value: String(MINER_FEE),
      ergoTree: sourceFunding.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 113,
    });

    const transition = first.transactions.reserveTransition;
    expect(transition.eip12Tx.dataInputs).toEqual([]);
    expect(transition.eip12Tx.inputs.map(input => input.boxId)).toEqual([
      provisioning.boxes.pooledReserve.boxId,
      first.boxes.sourceLock.boxId,
      first.boxes.transitionFeeFunding.boxId,
    ]);
    expect(transition.eip12Tx.inputs.map(input => Object.keys(input.extension)))
      .toEqual([['0'], [], []]);
    expect(transition.outputs).toHaveLength(2);
    expect(first.boxes.reserveSuccessor).toMatchObject({
      value: '42000000',
      ergoTree: compiled.contracts.pooledReserve.receipt.propositionHex,
      assets: [{
        tokenId: compiled.genesis.settlementVaultNftIdHex.slice(2),
        amount: '1',
      }],
      creationHeight: 114,
    });
    expect(
      decodeCanonicalLongRegister(
        first.boxes.reserveSuccessor.additionalRegisters.R6,
      ),
    ).toBe(40_000_000n);
    expect(
      BigInt(first.boxes.reserveSuccessor.value)
        - decodeCanonicalLongRegister(
          first.boxes.reserveSuccessor.additionalRegisters.R6,
        ),
    ).toBe(BigInt(provisioning.pooledReserveGenesisSeedNanoErg));
    expect(transition.outputs[1]).toMatchObject({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 114,
    });

    expect(verifyPooledReserveCommitmentInsert(
      first.predecessorReserveDigestHex,
      first.boxes.sourceLock.boxId,
      first.depositCommitmentHex,
      first.depositInsertProofHex,
    )).toBe(first.successorReserveDigestHex);
    expect(decodeAvlTreeRegisterDigest(
      first.boxes.reserveSuccessor.additionalRegisters.R5,
    )).toBe(first.successorReserveDigestHex);
    expect(Object.values(first.invariants).every(Boolean)).toBe(true);
    expect(first.boundaries.sourceLockCreationConstructed).toBe(true);
    expect(first.boundaries.reserveTransitionConstructed).toBe(true);
    expect(Object.entries(first.boundaries)
      .filter(([key]) =>
        !['sourceLockCreationConstructed', 'reserveTransitionConstructed']
          .includes(key)
      )
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transactions.reserveTransition.eip12Tx.inputs))
      .toBe(true);
    expect(() => {
      (first.boxes.reserveSuccessor as { value: string }).value = '1';
    }).toThrow(TypeError);
    expect(() =>
      assertValidityApplicationPooledReserveDepositTransitionV4Packet(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveDepositTransitionV4Packet(
        structuredClone(first),
      )
    ).toThrow(/built in this process/);
  });

  it('appends a second distinct deposit to the same reserve lineage', async () => {
    const first = await buildValidityApplicationPooledReserveDepositTransitionV4(
      buildInput(),
    );
    const secondFunding = first.transactions.sourceLockCreation.outputs[2];
    const second = await buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      sourceFundingBox: secondFunding,
      sourceIntent: {
        ...sourceIntent(),
        amountNanoErg: '20000000',
        recipientAddressHex: `0x${'88'.repeat(20)}`,
      },
      reserveState: {
        reservePredecessor: first.boxes.reserveSuccessor,
        depositHistory: [{
          sourceLockBoxIdHex: first.boxes.sourceLock.boxId,
          depositCommitmentHex: first.depositCommitmentHex,
        }],
      },
      creationHeights: {
        sourceLockCreation: 115,
        reserveTransition: 116,
      },
    });

    expect(second.reserveState).toEqual({
      predecessorDepositCount: 1,
      successorDepositCount: 2,
      predecessorLiabilityNanoErg: SOURCE_AMOUNT,
      successorLiabilityNanoErg: '60000000',
      protectedReserveSeedNanoErg:
        provisioning.pooledReserveGenesisSeedNanoErg,
    });
    expect(second.predecessorReserveDigestHex)
      .toBe(first.successorReserveDigestHex);
    expect(second.boxes.reservePredecessor.boxId)
      .toBe(first.boxes.reserveSuccessor.boxId);
    expect(second.transactions.reserveTransition.eip12Tx.inputs[0].boxId)
      .toBe(first.boxes.reserveSuccessor.boxId);
    expect(second.transactions.reserveTransition.eip12Tx.inputs[1].boxId)
      .toBe(second.boxes.sourceLock.boxId);
    expect(decodeCanonicalLongRegister(
      second.boxes.reserveSuccessor.additionalRegisters.R6,
    )).toBe(60_000_000n);
    expect(
      BigInt(second.boxes.reserveSuccessor.value)
      - decodeCanonicalLongRegister(
        second.boxes.reserveSuccessor.additionalRegisters.R6,
      ),
    ).toBe(BigInt(provisioning.pooledReserveGenesisSeedNanoErg));
    expect(verifyPooledReserveCommitmentInsert(
      first.successorReserveDigestHex,
      second.boxes.sourceLock.boxId,
      second.depositCommitmentHex,
      second.depositInsertProofHex,
    )).toBe(second.successorReserveDigestHex);
  });

  it('rejects an incomplete, duplicate, or mismatched predecessor history', async () => {
    const first = await buildValidityApplicationPooledReserveDepositTransitionV4(
      buildInput(),
    );
    const secondInput = {
      ...buildInput(),
      sourceFundingBox: first.transactions.sourceLockCreation.outputs[2],
      sourceIntent: {
        ...sourceIntent(),
        amountNanoErg: '20000000',
      },
      reserveState: {
        reservePredecessor: first.boxes.reserveSuccessor,
        depositHistory: [{
          sourceLockBoxIdHex: first.boxes.sourceLock.boxId,
          depositCommitmentHex: first.depositCommitmentHex,
        }],
      },
      creationHeights: {
        sourceLockCreation: 115,
        reserveTransition: 116,
      },
    } satisfies BuildValidityApplicationPooledReserveDepositTransitionV4Input;

    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...secondInput,
      reserveState: {
        ...secondInput.reserveState,
        depositHistory: [],
      },
    })).rejects.toThrow(/empty.*exact reviewed genesis/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...secondInput,
      reserveState: {
        ...secondInput.reserveState,
        depositHistory: [
          secondInput.reserveState.depositHistory[0],
          secondInput.reserveState.depositHistory[0],
        ],
      },
    })).rejects.toThrow(/duplicate keys/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...secondInput,
      reserveState: {
        ...secondInput.reserveState,
        depositHistory: [{
          ...secondInput.reserveState.depositHistory[0],
          depositCommitmentHex: 'ff'.repeat(32),
        }],
      },
    })).rejects.toThrow();
  });

  it('snapshots branded dependencies and rejects their structured clones', async () => {
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      compiledInstance: structuredClone(compiled),
    })).rejects.toThrow(/same-process reviewed lineage candidate/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      provisioning: structuredClone(provisioning),
    })).rejects.toThrow(/built in this process/);

    const canonical = buildInput();
    let compiledReads = 0;
    let provisioningReads = 0;
    const input = { ...canonical } as Record<string, unknown>;
    Object.defineProperty(input, 'compiledInstance', {
      enumerable: true,
      get() {
        compiledReads += 1;
        return compiledReads === 1 ? compiled : structuredClone(compiled);
      },
    });
    Object.defineProperty(input, 'provisioning', {
      enumerable: true,
      get() {
        provisioningReads += 1;
        return provisioningReads === 1
          ? provisioning
          : structuredClone(provisioning);
      },
    });
    await buildValidityApplicationPooledReserveDepositTransitionV4(
      input as unknown as BuildValidityApplicationPooledReserveDepositTransitionV4Input,
    );
    expect(compiledReads).toBe(1);
    expect(provisioningReads).toBe(1);
  });

  it.each([
    ['source network', 'sourceNetworkIdHex', `0x${'91'.repeat(32)}`],
    ['sidechain', 'sidechainIdHex', `0x${'92'.repeat(32)}`],
    ['bridge address', 'bridgeAddressHex', `0x${'93'.repeat(20)}`],
    ['token address', 'tokenAddressHex', `0x${'94'.repeat(20)}`],
    ['settlement profile', 'settlementProfileIdHex', `0x${'95'.repeat(32)}`],
    ['pooled-reserve profile', 'admissionProfileIdHex', `0x${'96'.repeat(32)}`],
    ['source asset', 'sourceAssetIdHex', `0x${'97'.repeat(32)}`],
  ])('rejects source-intent %s drift', async (_label, field, value) => {
    const input = buildInput();
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        [field]: value,
      },
    })).rejects.toThrow(/source intent .* does not match/);
  });

  it('rejects malformed source intent, depositor tree, and funding authority', async () => {
    const input = buildInput();
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '999999',
      },
    })).rejects.toThrow(/at least 1000000|minimum box/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        recipientAddressHex: `0x${'00'.repeat(20)}`,
      },
    })).rejects.toThrow(/recipient.*must not be (the )?zero/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        unexpectedAuthority: true,
      } as PegInSourceIntentV2,
    })).rejects.toThrow(/unknown or missing fields/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      depositorErgoTreeHex: 'ff',
    })).rejects.toThrow(/valid ErgoTree|canonically serialized/);

    const tokenFunding = await materializeFundingVariant({
      assets: [{ tokenId: sourceFunding.boxId, amount: '1' }],
      additionalRegisters: {},
    });
    const registerFunding = await materializeFundingVariant({
      assets: [],
      additionalRegisters: { R4: `0e20${'ab'.repeat(32)}` },
    });
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceFundingBox: tokenFunding,
    })).rejects.toThrow(/pure ERG/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceFundingBox: registerFunding,
    })).rejects.toThrow(/pure ERG/);
  });

  it('rejects underfunding, dust, unsafe fees, timeout, and shape drift', async () => {
    const input = buildInput();
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '95000000',
      },
    })).rejects.toThrow(/underfunded/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '94000000',
      },
    })).rejects.toThrow(/change.*minimum box/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      fees: {
        sourceLockCreationNanoErg: 1.5,
      },
    })).rejects.toThrow(/exact integer/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      fees: {
        reserveTransitionNanoErg: Number.MAX_SAFE_INTEGER + 1,
      },
    })).rejects.toThrow(/exact integer/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      creationHeights: {
        ...input.creationHeights,
        reserveTransition:
          input.creationHeights.sourceLockCreation
          + VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
      },
    })).rejects.toThrow(/at or after the source refund timeout/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      creationHeights: {
        ...input.creationHeights,
        sourceLockCreation: sourceFunding.creationHeight - 1,
      },
    })).rejects.toThrow(/predates its funding input/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      configuredReserveId: compiled.genesis.settlementVaultNftIdHex,
    } as BuildValidityApplicationPooledReserveDepositTransitionV4Input))
      .rejects.toThrow(/unknown or missing fields/);
    const {
      creationHeights: _missingCreationHeights,
      ...missing
    } = buildInput();
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4(
      missing as BuildValidityApplicationPooledReserveDepositTransitionV4Input,
    )).rejects.toThrow(/unknown or missing fields/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...input,
      fees: null,
    } as unknown as BuildValidityApplicationPooledReserveDepositTransitionV4Input))
      .rejects.toThrow(/fees must be an object/);
  });

  it('reserves signed-Int headroom for the complete refund timeout', async () => {
    const latestSafeSourceHeight =
      0x7fff_ffff
      - VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS;
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      creationHeights: {
        sourceLockCreation: latestSafeSourceHeight,
        reserveTransition: latestSafeSourceHeight,
      },
    })).resolves.toMatchObject({
      boxes: {
        sourceLock: { creationHeight: latestSafeSourceHeight },
      },
    });
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      creationHeights: {
        sourceLockCreation: latestSafeSourceHeight + 1,
        reserveTransition: latestSafeSourceHeight + 1,
      },
    })).rejects.toThrow(/cannot preserve the refund timeout/);
  });
});

describe('validity application pooled-reserve source refund V4', () => {
  it('builds the exact deterministic full-value refund at the timeout', async () => {
    const transition =
      await buildValidityApplicationPooledReserveDepositTransitionV4(
        buildInput(),
      );
    const input = refundInput(transition);
    const first =
      await buildValidityApplicationPooledReserveSourceRefundV4(input);
    const second =
      await buildValidityApplicationPooledReserveSourceRefundV4(input);

    expect(second).toEqual(first);
    expect(first.source).toEqual({
      sourceLockBoxIdHex: transition.boxes.sourceLock.boxId,
      sourceCreationHeight: 113,
      refundTimeoutHeight:
        113 + VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
      amountNanoErg: SOURCE_AMOUNT,
      depositorErgoTreeHex: DEPOSITOR_TREE,
    });
    expect(first.transaction.eip12Tx.inputs.map(candidate => ({
      boxId: candidate.boxId,
      extension: candidate.extension,
    }))).toEqual([
      { boxId: transition.boxes.sourceLock.boxId, extension: {} },
      {
        boxId: transition.boxes.transitionFeeFunding.boxId,
        extension: {},
      },
    ]);
    expect(first.transaction.eip12Tx.dataInputs).toEqual([]);
    expect(first.transaction.outputs).toHaveLength(2);
    expect(first.boxes.depositorRefund).toEqual(
      first.transaction.outputs[0],
    );
    expect(first.boxes.depositorRefund).toMatchObject({
      value: SOURCE_AMOUNT,
      ergoTree: DEPOSITOR_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(
          transition.boxes.sourceLock.boxId,
          'hex',
        )),
      },
      creationHeight: input.creationHeight,
    });
    expect(first.boxes.minerFee).toMatchObject({
      value: transition.boxes.transitionFeeFunding.value,
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
    expect(
      BigInt(first.boxes.sourceLock.value)
      + BigInt(first.boxes.externalFeeFunding.value),
    ).toBe(
      first.transaction.outputs.reduce(
        (total, output) => total + BigInt(output.value),
        0n,
      ),
    );
    expect(Object.values(first.invariants).every(Boolean)).toBe(true);
    expect(first.boundaries.refundTransactionConstructed).toBe(true);
    expect(Object.entries(first.boundaries)
      .filter(([key]) => key !== 'refundTransactionConstructed')
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveSourceRefundV4Packet(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveSourceRefundV4Packet(
        structuredClone(first),
      )
    ).toThrow(/built in this process/);
  });

  it('makes commit and refund candidate heights exactly disjoint', async () => {
    const transition =
      await buildValidityApplicationPooledReserveDepositTransitionV4(
        buildInput(),
      );
    const timeoutHeight =
      transition.boxes.sourceLock.creationHeight
      + VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS;

    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...refundInput(transition),
      creationHeight: timeoutHeight - 1,
    })).rejects.toThrow(/before timeout height/);
    await expect(buildValidityApplicationPooledReserveDepositTransitionV4({
      ...buildInput(),
      creationHeights: {
        sourceLockCreation: transition.boxes.sourceLock.creationHeight,
        reserveTransition: timeoutHeight,
      },
    })).rejects.toThrow(/at or after the source refund timeout/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...refundInput(transition),
      creationHeight: timeoutHeight,
    })).resolves.toMatchObject({
      source: { refundTimeoutHeight: timeoutHeight },
    });
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...refundInput(transition),
      creationHeight: timeoutHeight + 1,
    })).resolves.toMatchObject({
      transaction: {
        outputs: [
          expect.objectContaining({ creationHeight: timeoutHeight + 1 }),
          expect.objectContaining({ creationHeight: timeoutHeight + 1 }),
        ],
      },
    });
  });

  it('rejects noncanonical source identity, intent, value, and registers', async () => {
    const transition =
      await buildValidityApplicationPooledReserveDepositTransitionV4(
        buildInput(),
      );
    const input = refundInput(transition);
    const source = transition.boxes.sourceLock;

    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      compiledInstance: structuredClone(compiled),
    })).rejects.toThrow(/same-process reviewed lineage candidate/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        ergoTree: GENESIS_TREE,
      }),
    })).rejects.toThrow(/ErgoTree does not match/);
    const wrongAmountIntent = encodePegInSourceIntentV2Hex({
      ...decodePegInSourceIntentV2Hex(transition.sourceIntentHex),
      amountNanoErg: String(BigInt(source.value) - 1n),
    });
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        additionalRegisters: {
          ...source.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.from(
            wrongAmountIntent.slice(2),
            'hex',
          )),
        },
      }),
    })).rejects.toThrow(/value must equal/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        assets: [{ tokenId: source.boxId, amount: '1' }],
      }),
    })).rejects.toThrow(/canonical pure ERG/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        additionalRegisters: {
          ...source.additionalRegisters,
          R6: encodeCollByteRegister(Buffer.from([1])),
        },
      }),
    })).rejects.toThrow(/exact R4\/R5 registers/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        additionalRegisters: {
          R4: source.additionalRegisters.R4,
        },
      }),
    })).rejects.toThrow(/exact R4\/R5 registers/);

    const driftedIntent = encodePegInSourceIntentV2Hex({
      ...decodePegInSourceIntentV2Hex(transition.sourceIntentHex),
      tokenAddressHex: `0x${'99'.repeat(20)}`,
    });
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        additionalRegisters: {
          ...source.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.from(
            driftedIntent.slice(2),
            'hex',
          )),
        },
      }),
    })).rejects.toThrow(/token address does not match/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      sourceLockBox: await materializeBoxVariant(source, {
        additionalRegisters: {
          ...source.additionalRegisters,
          R5: encodeCollByteRegister(Buffer.from('ff', 'hex')),
        },
      }),
    })).rejects.toThrow(/valid ErgoTree/);
  });

  it('rejects fee aliasing, fee authority drift, and input-shape drift', async () => {
    const transition =
      await buildValidityApplicationPooledReserveDepositTransitionV4(
        buildInput(),
      );
    const input = refundInput(transition);
    const fee = transition.boxes.transitionFeeFunding;

    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      externalFeeFundingBox: transition.boxes.sourceLock,
    })).rejects.toThrow(/must be distinct/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      externalFeeFundingBox: await materializeBoxVariant(fee, {
        assets: [{ tokenId: fee.boxId, amount: '1' }],
      }),
    })).rejects.toThrow(/pure ERG/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      externalFeeFundingBox: await materializeBoxVariant(fee, {
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from([1])),
        },
      }),
    })).rejects.toThrow(/pure ERG/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      externalFeeFundingBox:
        await materializePureErgBoxWithValue(fee, '999999'),
    })).rejects.toThrow(/at least 1000000/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      externalFeeFundingBox:
        await materializePureErgBoxWithValue(fee, '2100001'),
    })).rejects.toThrow(/exceeds the reviewed miner-fee bound/);
    await expect(buildValidityApplicationPooledReserveSourceRefundV4({
      ...input,
      unexpectedAuthority: true,
    } as BuildValidityApplicationPooledReserveSourceRefundV4Input))
      .rejects.toThrow(/unknown or missing fields/);
    const {
      creationHeight: _missingCreationHeight,
      ...missing
    } = input;
    await expect(buildValidityApplicationPooledReserveSourceRefundV4(
      missing as BuildValidityApplicationPooledReserveSourceRefundV4Input,
    )).rejects.toThrow(/unknown or missing fields/);
  });
});

function buildInput(): BuildValidityApplicationPooledReserveDepositTransitionV4Input {
  return {
    compiledInstance: compiled,
    provisioning,
    sourceFundingBox: sourceFunding,
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

async function materializeFundingVariant(
  output: {
    assets: { tokenId: string; amount: string }[];
    additionalRegisters: Record<string, string>;
  },
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...sourceFunding, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: sourceFunding.value,
      ergoTree: sourceFunding.ergoTree,
      ...output,
      creationHeight: 113,
    }],
  }, 'pooled-reserve malformed source-funding fixture');
  return transaction.outputs[0];
}

function refundInput(
  transition: Awaited<
    ReturnType<
      typeof buildValidityApplicationPooledReserveDepositTransitionV4
    >
  >,
): BuildValidityApplicationPooledReserveSourceRefundV4Input {
  return {
    compiledInstance: compiled,
    sourceLockBox: transition.boxes.sourceLock,
    externalFeeFundingBox: transition.boxes.transitionFeeFunding,
    creationHeight:
      transition.boxes.sourceLock.creationHeight
      + VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  };
}

async function materializeBoxVariant(
  box: Eip12Box,
  overrides: {
    value?: string;
    ergoTree?: string;
    assets?: Eip12Box['assets'];
    additionalRegisters?: Eip12Box['additionalRegisters'];
    creationHeight?: number;
  },
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...box, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: overrides.value ?? box.value,
      ergoTree: overrides.ergoTree ?? box.ergoTree,
      assets: overrides.assets ?? box.assets,
      additionalRegisters:
        overrides.additionalRegisters ?? box.additionalRegisters,
      creationHeight: overrides.creationHeight ?? box.creationHeight,
    }],
  }, 'pooled-reserve source-refund malformed box fixture');
  return transaction.outputs[0];
}

async function materializePureErgBoxWithValue(
  template: Eip12Box,
  value: string,
): Promise<Eip12Box> {
  const change = BigInt(BASE_INPUT.value) - BigInt(value);
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      {
        value,
        ergoTree: template.ergoTree,
        assets: [],
        additionalRegisters: {},
        creationHeight: template.creationHeight,
      },
      {
        value: change,
        ergoTree: BASE_INPUT.ergoTree,
        assets: [],
        additionalRegisters: {},
        creationHeight: template.creationHeight,
      },
    ],
  }, 'pooled-reserve source-refund value-bound fixture');
  return transaction.outputs[0];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
