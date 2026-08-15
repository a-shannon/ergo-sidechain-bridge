import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  decodeBridgeCausalApplicationBindingV2,
} from './bridge-validity-application-statement-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN,
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance,
  buildPooledReserveMintReservationRuntimeProfileV4Candidate,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
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
const TEMPLATES = Object.freeze({
  tracker: readFileSync(TEMPLATE_PATHS.tracker, 'utf8'),
  duplicatePrevention:
    readFileSync(TEMPLATE_PATHS.duplicatePrevention, 'utf8'),
  sourceLock: readFileSync(TEMPLATE_PATHS.sourceLock, 'utf8'),
  pooledReserve: readFileSync(TEMPLATE_PATHS.pooledReserve, 'utf8'),
});
const PINNED_COMPILER_BATCH_JSON = readFileSync(
  resolve(
    BRIDGE_ROOT,
    'relayer',
    'test-vectors',
    'validity-application-pooled-reserve-compiler-v4.json',
  ),
  'utf8',
);
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
const BASE_PROFILE: PooledReserveMintReservationRuntimeProfileV4 = {
  formatVersion: 4,
  lineageProfileIdHex: `0x${'10'.repeat(32)}`,
  sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
  sidechainIdHex: `0x${'22'.repeat(32)}`,
  bridgeAddressHex: `0x${'33'.repeat(20)}`,
  tokenAddressHex: `0x${'44'.repeat(20)}`,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 0x0102_0304,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 0x0506_0708,
  settlementProfileIdHex: `0x${'55'.repeat(32)}`,
  ergoDepositFinalityPolicyIdHex: `0x${'66'.repeat(32)}`,
  sourceProofSystemIdHex: `0x${'77'.repeat(32)}`,
  sourceProofProfileIdHex: `0x${'88'.repeat(32)}`,
  activationHeight: '72623859790382856',
  maxPendingBlocks: 0x0a0b_0c0d,
};

describe('pooled-reserve mint-reservation runtime profile V4', () => {
  it('round-trips the exact 349-byte Frontier SCALE/LE profile and domain ID', () => {
    const encoded =
      encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(BASE_PROFILE);
    const bytes = Buffer.from(encoded.slice(2), 'hex');
    const expected = expectedProfileScaleHex(BASE_PROFILE);
    const expectedId = `0x${Buffer.from(blakejs.blake2b(
      Buffer.concat([
        Buffer.from(
          POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN,
          'ascii',
        ),
        bytes,
      ]),
      undefined,
      32,
    )).toString('hex')}`;

    expect(bytes).toHaveLength(
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
    );
    expect(encoded).toBe(expected);
    expect(bytes.readUInt32LE(169)).toBe(BASE_PROFILE.bridgeRuntimeCodeBytes);
    expect(bytes.readUInt32LE(205)).toBe(BASE_PROFILE.tokenRuntimeCodeBytes);
    expect(bytes.readBigUInt64LE(337).toString())
      .toBe(BASE_PROFILE.activationHeight);
    expect(bytes.readUInt32LE(345)).toBe(BASE_PROFILE.maxPendingBlocks);
    expect(
      decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(encoded),
    ).toEqual(BASE_PROFILE);
    expect(
      derivePooledReserveMintReservationRuntimeProfileV4IdHex(encoded),
    ).toBe(expectedId);
    expect(
      derivePooledReserveMintReservationRuntimeProfileV4IdHex(BASE_PROFILE),
    ).toBe(expectedId);
  });

  it('rejects malformed length, version, zero and aliased fields', () => {
    const encoded =
      encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(BASE_PROFILE);
    expect(() =>
      decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
        encoded.slice(0, -2),
      ),
    ).toThrow(/exactly 349/i);
    expect(() => encodeProfile({ formatVersion: 3 as 4 }))
      .toThrow(/version is unsupported/i);
    for (const field of [
      'lineageProfileIdHex',
      'sourceNetworkIdHex',
      'sidechainIdHex',
      'bridgeRuntimeCodeSha256Hex',
      'tokenRuntimeCodeSha256Hex',
      'settlementProfileIdHex',
      'ergoDepositFinalityPolicyIdHex',
      'sourceProofSystemIdHex',
      'sourceProofProfileIdHex',
    ] as const) {
      expect(() => encodeProfile({ [field]: `0x${'00'.repeat(32)}` }), field)
        .toThrow(/must not be zero/i);
    }
    expect(() => encodeProfile({
      tokenAddressHex: BASE_PROFILE.bridgeAddressHex,
    })).toThrow(/aliases bridge and token/i);
  });

  it('rejects invalid code sizes, activation heights and pending windows', () => {
    for (const [field, value] of [
      ['bridgeRuntimeCodeBytes', 0],
      ['bridgeRuntimeCodeBytes', 0x1_0000_0000],
      ['bridgeRuntimeCodeBytes', 1.5],
      ['tokenRuntimeCodeBytes', 0],
      ['tokenRuntimeCodeBytes', 0x1_0000_0000],
      ['maxPendingBlocks', 0],
      ['maxPendingBlocks', 0x1_0000_0000],
    ] as const) {
      expect(() => encodeProfile({ [field]: value }), `${field}=${value}`)
        .toThrow(/positive uint32/i);
    }
    expect(() => encodeProfile({ activationHeight: '01' }))
      .toThrow(/canonical uint64/i);
    expect(() => encodeProfile({
      activationHeight: '18446744073709551616',
    })).toThrow(/exceeds uint64/i);
  });

  it('builds one process-owned non-authorizing profile from the compiled instance', async () => {
    const compiled = await compiledInstance();
    const candidate =
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: compiled,
        maxPendingBlocks: 20,
      });
    const lineage = decodePegInPooledReserveLineageProfileV4Hex(
      compiled.encodedLineageProfileHex,
    );
    const application = decodeBridgeCausalApplicationBindingV2(
      compiled.application.bindingHex,
    );

    expect(candidate.profile).toMatchObject({
      lineageProfileIdHex: compiled.lineageProfileIdHex,
      sourceNetworkIdHex: lineage.sourceNetworkIdHex,
      sidechainIdHex: lineage.sidechainIdHex,
      bridgeAddressHex: lineage.bridgeAddressHex,
      tokenAddressHex: lineage.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex:
        `0x${application.bridgeRuntimeCodeSha256Hex}`,
      bridgeRuntimeCodeBytes: application.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        `0x${application.tokenRuntimeCodeSha256Hex}`,
      tokenRuntimeCodeBytes: application.tokenRuntimeCodeBytes,
      settlementProfileIdHex: lineage.settlementProfileIdHex,
      ergoDepositFinalityPolicyIdHex:
        lineage.ergoDepositFinalityPolicyIdHex,
      sourceProofSystemIdHex: lineage.proofSystemIdHex,
      sourceProofProfileIdHex: lineage.proofProfileIdHex,
      activationHeight: String(lineage.activationHeight),
      maxPendingBlocks: 20,
    });
    expect(candidate.compiledBinding.contractIds).toEqual({
      tracker: compiled.contracts.tracker.receipt.contractIdHex,
      duplicatePrevention:
        compiled.contracts.duplicatePrevention.receipt.contractIdHex,
      sourceLock: compiled.contracts.sourceLock.receipt.contractIdHex,
      pooledReserve: compiled.contracts.pooledReserve.receipt.contractIdHex,
    });
    expect(Object.values(candidate.authority).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.profile)).toBe(true);
    expect(() =>
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
        candidate,
      ),
    ).not.toThrow();
  });

  it('rejects compiled binding and activation drift before clone provenance', async () => {
    const candidate =
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: await compiledInstance(),
        maxPendingBlocks: 20,
      });
    const bindingDrift = structuredClone(candidate) as any;
    bindingDrift.compiledBinding.applicationBindingDigestHex =
      '00'.repeat(32);
    expect(() =>
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
        bindingDrift,
      ),
    ).toThrow(/compiled application binding is inconsistent/i);

    const activationDrift = structuredClone(candidate) as any;
    activationDrift.profile.activationHeight = '1';
    activationDrift.profileScaleHex =
      encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
        activationDrift.profile,
      );
    activationDrift.profileIdHex =
      derivePooledReserveMintReservationRuntimeProfileV4IdHex(
        activationDrift.profileScaleHex,
      );
    expect(() =>
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
        activationDrift,
      ),
    ).toThrow(/differs from the pre-compilation binding/i);
  });

  it('rejects spread or structured-clone provenance and invalid pending input', async () => {
    const compiled = await compiledInstance();
    const candidate =
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: compiled,
        maxPendingBlocks: 20,
      });
    expect(() =>
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance({
        ...candidate,
      }),
    ).toThrow(/not built in this process/i);
    expect(() =>
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
        structuredClone(candidate),
      ),
    ).toThrow(/not built in this process/i);
    expect(() =>
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: structuredClone(compiled) as typeof compiled,
        maxPendingBlocks: 20,
      }),
    ).toThrow(/same-process reviewed lineage candidate/i);
    expect(() =>
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: compiled,
        maxPendingBlocks: 0,
      }),
    ).toThrow(/maximum pending blocks must be a positive uint32/i);
  });
});

function encodeProfile(
  overrides: Partial<PooledReserveMintReservationRuntimeProfileV4>,
): string {
  return encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
    ...BASE_PROFILE,
    ...overrides,
  });
}

function expectedProfileScaleHex(
  profile: PooledReserveMintReservationRuntimeProfileV4,
): string {
  const bridgeBytes = Buffer.alloc(4);
  bridgeBytes.writeUInt32LE(profile.bridgeRuntimeCodeBytes);
  const tokenBytes = Buffer.alloc(4);
  tokenBytes.writeUInt32LE(profile.tokenRuntimeCodeBytes);
  const activation = Buffer.alloc(8);
  activation.writeBigUInt64LE(BigInt(profile.activationHeight));
  const pending = Buffer.alloc(4);
  pending.writeUInt32LE(profile.maxPendingBlocks);
  return `0x${Buffer.concat([
    Buffer.from([profile.formatVersion]),
    hexBytes(profile.lineageProfileIdHex),
    hexBytes(profile.sourceNetworkIdHex),
    hexBytes(profile.sidechainIdHex),
    hexBytes(profile.bridgeAddressHex),
    hexBytes(profile.tokenAddressHex),
    hexBytes(profile.bridgeRuntimeCodeSha256Hex),
    bridgeBytes,
    hexBytes(profile.tokenRuntimeCodeSha256Hex),
    tokenBytes,
    hexBytes(profile.settlementProfileIdHex),
    hexBytes(profile.ergoDepositFinalityPolicyIdHex),
    hexBytes(profile.sourceProofSystemIdHex),
    hexBytes(profile.sourceProofProfileIdHex),
    activation,
    pending,
  ]).toString('hex')}`;
}

let compiledPromise: ReturnType<typeof buildCompiledInstance> | undefined;

function compiledInstance(): ReturnType<typeof buildCompiledInstance> {
  compiledPromise ??= buildCompiledInstance();
  return compiledPromise;
}

async function buildCompiledInstance() {
  const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox] = await genesisInputs();
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
  return compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      PINNED_COMPILER_BATCH_JSON,
    ),
  });
}

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

async function genesisInputs(): Promise<
  readonly [Eip12Box, Eip12Box, Eip12Box]
> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: `0008cd02${'11'.repeat(32)}`,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'pooled-reserve runtime-profile V4 genesis fixture');
  return [funding.outputs[0], funding.outputs[1], funding.outputs[2]];
}

function hexBytes(value: string): Buffer {
  return Buffer.from(value.startsWith('0x') ? value.slice(2) : value, 'hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
