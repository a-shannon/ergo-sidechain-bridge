import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SHA256_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION,
  VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  compileValidityApplicationPooledReserveInstanceV4,
  createPinnedValidityApplicationPooledReserveCompilerV4,
  deriveValidityApplicationPooledReserveProofProfileIdV1Hex,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type CompileValidityApplicationPooledReserveInstanceV4Input,
  type ValidityApplicationPooledReserveCompilerBatchV1,
  type ValidityApplicationPooledReserveCompilerV4,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATE_PATHS = {
  tracker: resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerPooledReserveBurnV4.es',
  ),
  duplicatePrevention: resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionPooledReserveV4.es',
  ),
  sourceLock: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockPooledReserveV4.es',
  ),
  pooledReserve: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainPooledReserveValidityApplicationV4.es',
  ),
} as const;
const PINNED_COMPILER_BATCH_JSON = readFileSync(
  resolve(
    BRIDGE_ROOT,
    'relayer',
    'test-vectors',
    'validity-application-pooled-reserve-compiler-v4.json',
  ),
  'utf8',
);
const TEMPLATES = Object.freeze({
  tracker: readFileSync(TEMPLATE_PATHS.tracker, 'utf8'),
  duplicatePrevention:
    readFileSync(TEMPLATE_PATHS.duplicatePrevention, 'utf8'),
  sourceLock: readFileSync(TEMPLATE_PATHS.sourceLock, 'utf8'),
  pooledReserve: readFileSync(TEMPLATE_PATHS.pooledReserve, 'utf8'),
});
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
const EXPECTED_TRACKER_GENESIS_BOX_ID =
  '00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9';
const EXPECTED_DUP_GENESIS_BOX_ID =
  '667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538';
const EXPECTED_RESERVE_GENESIS_BOX_ID =
  'b7ca9a5aaac5b702dc9e21d6f3de0f8f7d23e3932d3ac018fd64316071cb21f8';
const EXPECTED_PROFILE_ID =
  '0xf0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9';
const EXPECTED_POLICY_IDS = {
  sidechainFinality:
    '0x1434bf968d02ecdbe5941e637afee08f70deca174a766c274beae8daafd85f48',
  ergoDepositFinality:
    '0x4322c3e83dd656d497b10cb2d5a3eb83c0e542e540b534cadefd113110c75af4',
  sourceCommitment:
    '0x157c3a8aeda847b64d385c5e85816dcc02d39445a0a512a5bfb92f99f19d516f',
  depositState:
    '0x5586b9b3a29465bafded73a3adb2ba94f02390f820ce0f27397c0e520dcc15cc',
} as const;
const EXPECTED_CONTRACT_IDS = {
  tracker:
    'bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594',
  duplicatePrevention:
    'd33011ecf3c8a3eda63d426da103e99728584694452e6347d267c93379bf87b7',
  sourceLock:
    '6ff71fb0c46f1e2d2d20e8f963388a3e9c01c3d2aa891daebbde6f91f3960424',
  pooledReserve:
    '89614a780176b0fdc214cd05fc0b7859d143482ef4bec86af64aa3f780d9a07c',
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
    operationFlags:
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    keySource: 'source-lock-box-id',
    valueHash: 'blake2b256',
    commitmentDomain:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };
const RUNTIME_BINDING = {
  sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
  sourceRuntimeCodeBytes: 8192,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const;

async function genesisInputs(): Promise<
  readonly [Eip12Box, Eip12Box, Eip12Box]
> {
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
  }, 'pooled-reserve V4 instance genesis fixture');
  return [funding.outputs[0], funding.outputs[1], funding.outputs[2]];
}

async function deriveCandidate(
  overrides: Partial<PegInPooledReserveLineageProfileV4Semantics> = {},
) {
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = await genesisInputs();
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
    ...overrides,
  };
  return derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics,
  });
}

async function compileCandidate(
  overrides: Partial<
    Omit<CompileValidityApplicationPooledReserveInstanceV4Input,
      'lineageCandidate'>
  > = {},
  candidatePromise = deriveCandidate(),
) {
  return compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: await candidatePromise,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      PINNED_COMPILER_BATCH_JSON,
    ),
    ...overrides,
  });
}

describe('validity application pooled-reserve instance V4', () => {
  it('keeps the V4 proof profile stable and separates the V5 statement family', () => {
    const v4 = deriveValidityApplicationPooledReserveProofProfileIdV1Hex({
      statementVersion: 4,
      programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
      verifierProfileIdHex:
        `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
    });
    const v5 = deriveValidityApplicationPooledReserveProofProfileIdV1Hex({
      statementVersion: 5,
      programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX}`,
      verifierProfileIdHex:
        `0x${POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX}`,
    });

    expect(v4).toBe(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX);
    expect(v5).toMatch(/^0x[0-9a-f]{64}$/);
    expect(v5).not.toBe(v4);
    expect(() => deriveValidityApplicationPooledReserveProofProfileIdV1Hex({
      statementVersion: 4,
      programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX}`,
      verifierProfileIdHex:
        `0x${POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX}`,
      unexpected: true,
    } as never)).toThrow(/must contain exactly/);
  });

  it('compiles the exact four-contract instance in dependency order', async () => {
    const compiled = await compileCandidate();

    expect(compiled.lineageProfileIdHex).toBe(EXPECTED_PROFILE_ID);
    expect(Object.values(compiled.contracts).map(
      contract => contract.receipt.role,
    )).toEqual([
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ]);
    expect(Object.values(compiled.contracts).map(
      contract => contract.receipt.treeVersion,
    )).toEqual([4, 0, 0, 0]);
    expect(compiled.genesis).toEqual({
      trackerInputBoxIdHex: `0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`,
      trackerNftIdHex: `0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`,
      duplicatePreventionInputBoxIdHex: `0x${EXPECTED_DUP_GENESIS_BOX_ID}`,
      duplicatePreventionNftIdHex: `0x${EXPECTED_DUP_GENESIS_BOX_ID}`,
      settlementVaultInputBoxIdHex: `0x${EXPECTED_RESERVE_GENESIS_BOX_ID}`,
      settlementVaultNftIdHex: `0x${EXPECTED_RESERVE_GENESIS_BOX_ID}`,
    });
    expect(compiled.application).toMatchObject({
      bindingDigestHex:
        '0fd55c682617fb643b4ab197aaae45a573fc199f8fadedf82a2e1cd71562c3c2',
      sourceRuntimeCodeSha256Hex: 'dd'.repeat(32),
      sourceRuntimeCodeBytes: 8_192,
      statementContractIdHex: EXPECTED_CONTRACT_IDS.tracker,
    });
    const burnBinding = Buffer.from(compiled.application.burnBindingHex, 'hex');
    expect(burnBinding.subarray(381, 413).toString('hex'))
      .toBe(compiled.application.sourceRuntimeCodeSha256Hex);
    expect(burnBinding.readUInt32BE(413))
      .toBe(compiled.application.sourceRuntimeCodeBytes);
    expect(compiled.contracts.tracker.receipt.contractIdHex)
      .not.toBe(
        'dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd',
      );
    expect(burnBinding.subarray(449, 481).toString('hex'))
      .toBe(EXPECTED_CONTRACT_IDS.tracker);
    expect(compiled.application.burnBindingDigestHex)
      .not.toBe(compiled.application.bindingDigestHex);
    expect(compiled.sidechainFinalityPolicy.policyIdHex)
      .toBe(EXPECTED_POLICY_IDS.sidechainFinality);
    expect(compiled.ergoDepositFinalityPolicy.policyIdHex)
      .toBe(EXPECTED_POLICY_IDS.ergoDepositFinality);
    expect(compiled.sourceCommitmentPolicy.policyIdHex)
      .toBe(EXPECTED_POLICY_IDS.sourceCommitment);
    expect(compiled.depositCommitmentStatePolicy.policyIdHex)
      .toBe(EXPECTED_POLICY_IDS.depositState);
    expect(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX)
      .toBe(
        '0x115d7970045dfc71a0591583bee1bf4e9291a81ccf426dc56d948742836dc0d7',
      );
    expect(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX)
      .toBe(
        '0x31797a6450bcb7121df06dfb16829727401f831c7b6f23fc53ad100630956c67',
      );
    expect(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX)
      .not.toBe(
        '0x36c06f93b9cf9a7f80c59f5bfb8b7790c7f355933cd001fffccc9110f9f95069',
      );
    expect(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX)
      .not.toBe(
        '0x65ca4632abc4db51255e42e83a9aee8a72b19d41921d45824ce847cd696e9537',
      );
    expect(compiled.relations).toEqual({
      trackerContractBoundIntoDuplicatePrevention: true,
      trackerContractBoundIntoPooledReserve: true,
      duplicatePreventionContractBoundIntoPooledReserve: true,
      sourceLockContractBoundIntoPooledReserve: true,
      singletonIdsDerivedFromGenesisInputs: true,
    });
    expect(Object.values(compiled.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.contracts.pooledReserve.receipt)).toBe(true);
    expect(() =>
      assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
        compiled,
      )
    ).not.toThrow();
    expect(() =>
      assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
        structuredClone(compiled),
      )
    ).toThrow(/same-process reviewed lineage candidate/);
  });

  it('is deterministic and consumes only the exact pinned JVM batch', async () => {
    const first = await compileCandidate();
    const second = await compileCandidate();
    const batch =
      JSON.parse(PINNED_COMPILER_BATCH_JSON) as
        ValidityApplicationPooledReserveCompilerBatchV1;

    expect(second).toEqual(first);
    expect(batch).toMatchObject({
      schema: VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SCHEMA,
      version: 1,
      sigmaStateCommit:
        VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
      scalaVersion: VALIDITY_APPLICATION_POOLED_RESERVE_SCALA_VERSION,
      sbtVersion: VALIDITY_APPLICATION_POOLED_RESERVE_SBT_VERSION,
      profileActivated: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
    expect(batch.contracts.map(receipt => receipt.role)).toEqual([
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ]);
    expect(batch.contracts.every(receipt =>
      receipt.schema
        === VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_RECEIPT_V1_SCHEMA
      && receipt.profileActivated === false
      && receipt.nodeCheckPerformed === false
      && receipt.signingAuthorityEstablished === false
      && receipt.submissionAuthorityEstablished === false
      && receipt.broadcastAuthorityEstablished === false
      && receipt.fundsAuthorityEstablished === false
      && receipt.gate5Closed === false
    )).toBe(true);
    expect(sha256(PINNED_COMPILER_BATCH_JSON))
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_COMPILER_BATCH_V1_SHA256_HEX);
    expect(Object.fromEntries(
      Object.entries(first.contracts).map(([role, contract]) => [
        role,
        contract.receipt.contractIdHex,
      ]),
    )).toEqual(EXPECTED_CONTRACT_IDS);
    for (const role of Object.keys(TEMPLATES) as Array<
      keyof typeof TEMPLATES
    >) {
      expect(first.contracts[role].templateSha256Hex)
        .toBe(sha256(TEMPLATES[role]));
    }
  });

  it('rejects decoded candidates and every template drift', async () => {
    const candidate = await deriveCandidate();
    await expect(compileCandidate(
      {},
      Promise.resolve(structuredClone(candidate)),
    )).rejects.toThrow(/same process|validated EIP-12 genesis inputs/);

    for (const role of Object.keys(TEMPLATES) as Array<
      keyof typeof TEMPLATES
    >) {
      await expect(compileCandidate({
        templates: {
          ...TEMPLATES,
          [role]: `${TEMPLATES[role]}\n`,
        },
      }, Promise.resolve(candidate)), role)
        .rejects.toThrow(/lineage profile SHA-256/);
    }
  });

  it('rejects every sidechain and Ergo finality policy substitution', async () => {
    const candidate = await deriveCandidate();
    for (const [field, value] of [
      ['proofSystemIdHex', `0x${'10'.repeat(32)}`],
      ['proofProfileIdHex', `0x${'20'.repeat(32)}`],
      ['approvedTrustAnchorDigestHex', `0x${'30'.repeat(32)}`],
      ['programIdHex', `0x${'40'.repeat(32)}`],
      ['verifierProfileIdHex', `0x${'50'.repeat(32)}`],
    ] as const) {
      await expect(compileCandidate({
        sidechainFinalityPolicy: {
          ...SIDECHAIN_FINALITY_POLICY,
          [field]: value,
        },
      }, Promise.resolve(candidate)), field)
        .rejects.toThrow(/sidechain-finality/);
    }
    for (const policy of [
      { ...ERGO_DEPOSIT_FINALITY_POLICY, version: 2 },
      { ...ERGO_DEPOSIT_FINALITY_POLICY, requiredSuccessorDepth: 11 },
      {
        ...ERGO_DEPOSIT_FINALITY_POLICY,
        blockIdentityAndAncestryRequired: false,
      },
      { ...ERGO_DEPOSIT_FINALITY_POLICY, divergentRpcAction: 'accept' },
      { ...ERGO_DEPOSIT_FINALITY_POLICY, reorgAction: 'ignore' },
    ]) {
      await expect(compileCandidate({
        ergoDepositFinalityPolicy:
          policy as ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
      }, Promise.resolve(candidate)))
        .rejects.toThrow(/Ergo-deposit-finality|fail closed/);
    }
  });

  it('rejects source topology and deposit-state policy substitution', async () => {
    const candidate = await deriveCandidate();
    for (const [field, value] of [
      ['version', 2],
      ['refundDelayBlocks', 9_999],
      ['pooledReserveInputIndex', 1],
      ['sourceLockInputIndex', 0],
      ['externalFeeInputIndex', 1],
      ['pooledReserveOutputIndex', 1],
      ['externalFeeOutputIndex', 0],
      ['sourceLockMustBeConsumed', false],
      ['externalFeeMustBeValueNeutral', false],
    ] as const) {
      await expect(compileCandidate({
        sourceCommitmentPolicy: {
          ...SOURCE_COMMITMENT_POLICY,
          [field]: value,
        } as ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
      }, Promise.resolve(candidate)), field)
        .rejects.toThrow(/source-commitment policy/);
    }
    for (const [field, value] of [
      ['version', 2],
      ['keyLength', 31],
      ['valueLength', 31],
      ['operationFlags', 3],
      ['keySource', 'journal-row-id'],
      ['valueHash', 'sha256'],
      ['commitmentDomain', 'E2S_UNREVIEWED_DEPOSIT'],
    ] as const) {
      await expect(compileCandidate({
        depositCommitmentStatePolicy: {
          ...DEPOSIT_STATE_POLICY,
          [field]: value,
        } as ValidityApplicationPooledReserveDepositStatePolicyV1,
      }, Promise.resolve(candidate)), field)
        .rejects.toThrow(/deposit-state policy/);
    }
  });

  it('rejects arbitrary compilers, runtime drift and pinned-batch mutations', async () => {
    const arbitraryCompiler: ValidityApplicationPooledReserveCompilerV4 =
      async () => {
        throw new Error('arbitrary compiler must not be called');
      };
    await expect(compileCandidate({ compiler: arbitraryCompiler }))
      .rejects.toThrow(/reviewed pinned compiler batch/);
    for (const [field, value] of [
      ['bridgeRuntimeCodeSha256Hex', `0x${'bd'.repeat(32)}`],
      ['bridgeRuntimeCodeBytes', 4097],
      ['tokenRuntimeCodeSha256Hex', `0x${'cd'.repeat(32)}`],
      ['tokenRuntimeCodeBytes', 2049],
    ] as const) {
      await expect(compileCandidate({
        runtimeBinding: {
          ...RUNTIME_BINDING,
          [field]: value,
        },
      }), field).rejects.toThrow(
        /compiler receipt (identity|source drifted)/,
      );
    }

    const authorityMutation = PINNED_COMPILER_BATCH_JSON.replace(
      '"profileActivated": false',
      '"profileActivated": true ',
    );
    expect(() =>
      createPinnedValidityApplicationPooledReserveCompilerV4(
        authorityMutation,
      )
    ).toThrow(/reviewed SHA-256 lock/);
    const reordered = JSON.parse(PINNED_COMPILER_BATCH_JSON) as {
      contracts: unknown[];
    } & Record<string, unknown>;
    reordered.contracts.reverse();
    expect(() =>
      createPinnedValidityApplicationPooledReserveCompilerV4(
        `${JSON.stringify(reordered, null, 2)}\n`,
      )
    ).toThrow(/reviewed SHA-256 lock/);
    expect(() =>
      createPinnedValidityApplicationPooledReserveCompilerV4(
        `${PINNED_COMPILER_BATCH_JSON} `,
      )
    ).toThrow(/reviewed SHA-256 lock/);
  });

  it('rejects unknown fields before any proposition is promoted', async () => {
    const candidate = await deriveCandidate();
    await expect(compileCandidate({
      sidechainFinalityPolicy: {
        ...SIDECHAIN_FINALITY_POLICY,
        locallyVerified: true,
      } as ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
    }, Promise.resolve(candidate)))
      .rejects.toThrow(/must contain exactly/);
    await expect(compileValidityApplicationPooledReserveInstanceV4({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
      ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
      sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
      depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
      compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
        PINNED_COMPILER_BATCH_JSON,
      ),
      localAuthority: true,
    } as CompileValidityApplicationPooledReserveInstanceV4Input))
      .rejects.toThrow(/must contain exactly/);
  });
});

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
