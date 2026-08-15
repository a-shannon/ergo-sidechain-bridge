import blakejs from 'blakejs';

import {
  normalizeEip12Box,
  type Eip12Asset,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION = 4 as const;
export const PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_DOMAIN =
  'E2S_PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4' as const;
export const PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_SCHEMA =
  'ergo-sidechain-bridge/peg-in-pooled-reserve-lineage-profile-v4' as const;

export const PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX =
  `0x${'00'.repeat(32)}` as const;

const PROFILE_32_BYTE_FIELD_COUNT = 17;
const PROFILE_ADDRESS_BYTES = 2 * 20;
const PROFILE_UINT64_BYTES = 2 * 8;
export const PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES =
  1
  + PROFILE_ADDRESS_BYTES
  + (PROFILE_32_BYTE_FIELD_COUNT * 32)
  + PROFILE_UINT64_BYTES;

const UINT64_MAX = (1n << 64n) - 1n;
const validatedCandidates = new WeakSet<object>();
const PROFILE_KEYS = [
  'formatVersion',
  'sourceNetworkIdHex',
  'sidechainIdHex',
  'bridgeAddressHex',
  'tokenAddressHex',
  'settlementAssetIdHex',
  'settlementProfileIdHex',
  'trackerGenesisInputBoxIdHex',
  'duplicatePreventionGenesisInputBoxIdHex',
  'settlementVaultGenesisInputBoxIdHex',
  'sourceLockTemplateSha256Hex',
  'validityTrackerTemplateSha256Hex',
  'settlementVaultTemplateSha256Hex',
  'duplicatePreventionTemplateSha256Hex',
  'sidechainFinalityPolicyIdHex',
  'ergoDepositFinalityPolicyIdHex',
  'proofSystemIdHex',
  'proofProfileIdHex',
  'sourceCommitmentPolicyIdHex',
  'depositCommitmentStatePolicyIdHex',
  'profileRevision',
  'activationHeight',
] as const;
const SEMANTICS_KEYS = PROFILE_KEYS.filter(key =>
  key !== 'formatVersion'
  && key !== 'settlementAssetIdHex'
  && key !== 'trackerGenesisInputBoxIdHex'
  && key !== 'duplicatePreventionGenesisInputBoxIdHex'
  && key !== 'settlementVaultGenesisInputBoxIdHex'
);

/**
 * Non-circular identity for one pooled-reserve settlement instance.
 *
 * The profile binds source/application semantics, three singleton issuance
 * inputs, contract templates and proof policies. Compiled proposition
 * identities are deliberately excluded because the propositions embed this
 * profile ID.
 */
export interface PegInPooledReserveLineageProfileV4 {
  readonly formatVersion:
    typeof PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementAssetIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly trackerGenesisInputBoxIdHex: string;
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly settlementVaultGenesisInputBoxIdHex: string;
  readonly sourceLockTemplateSha256Hex: string;
  readonly validityTrackerTemplateSha256Hex: string;
  readonly settlementVaultTemplateSha256Hex: string;
  readonly duplicatePreventionTemplateSha256Hex: string;
  readonly sidechainFinalityPolicyIdHex: string;
  readonly ergoDepositFinalityPolicyIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly sourceCommitmentPolicyIdHex: string;
  readonly depositCommitmentStatePolicyIdHex: string;
  readonly profileRevision: string | number | bigint;
  readonly activationHeight: string | number | bigint;
}

export type PegInPooledReserveLineageProfileV4Semantics = Omit<
  PegInPooledReserveLineageProfileV4,
  | 'formatVersion'
  | 'settlementAssetIdHex'
  | 'trackerGenesisInputBoxIdHex'
  | 'duplicatePreventionGenesisInputBoxIdHex'
  | 'settlementVaultGenesisInputBoxIdHex'
>;

export interface DerivePegInPooledReserveLineageProfileV4Input {
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly settlementVaultGenesisInputBox: Eip12Box;
  readonly semantics: PegInPooledReserveLineageProfileV4Semantics;
}

export type PegInPooledReserveLineageGenesisInputBox = Readonly<
  Omit<Eip12Box, 'assets' | 'additionalRegisters'> & {
    readonly assets: readonly Readonly<Eip12Asset>[];
    readonly additionalRegisters: Readonly<Record<string, string>>;
  }
>;

export interface PegInPooledReserveLineageProfileV4Candidate {
  readonly schema: typeof PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_SCHEMA;
  readonly profile: Readonly<PegInPooledReserveLineageProfileV4>;
  readonly encodedProfileHex: string;
  readonly profileIdHex: string;
  readonly genesis: {
    readonly tracker: {
      readonly inputBox: PegInPooledReserveLineageGenesisInputBox;
      readonly singletonNftIdHex: string;
      readonly singletonIdEqualsGenesisInputBoxId: true;
    };
    readonly duplicatePrevention: {
      readonly inputBox: PegInPooledReserveLineageGenesisInputBox;
      readonly singletonNftIdHex: string;
      readonly singletonIdEqualsGenesisInputBoxId: true;
    };
    readonly settlementVault: {
      readonly inputBox: PegInPooledReserveLineageGenesisInputBox;
      readonly singletonNftIdHex: string;
      readonly singletonIdEqualsGenesisInputBoxId: true;
    };
  };
  readonly invariants: {
    readonly singletonIdsDerivedFromValidatedGenesisInputs: true;
    readonly allGenesisInputsDistinct: true;
    readonly canonicalSettlementVaultLineageRequired: true;
    readonly nativeErgSettlementLaneBound: true;
    readonly separateFinalityPoliciesBound: true;
    readonly depositObservationIsNotMintAuthority: true;
    readonly compiledContractIdentitiesExcludedFromProfile: true;
    readonly localPersistenceIsNotAuthority: true;
  };
  readonly boundaries: {
    readonly setupTransactionsConstructed: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly settlementVaultLineageEstablished: false;
    readonly trackerLineageEstablished: false;
    readonly duplicatePreventionLineageEstablished: false;
    readonly depositCommitmentStateEstablished: false;
    readonly mintEligibilityEstablished: false;
    readonly burnSettlementEstablished: false;
    readonly exactTemplatesResolved: false;
    readonly compiledContractIdentitiesEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

/**
 * Pure profile codec. Successful encoding does not establish that singleton
 * identities came from validated EIP-12 boxes or that any lineage exists.
 */
export function encodePegInPooledReserveLineageProfileV4Hex(
  profile: PegInPooledReserveLineageProfileV4,
): string {
  const normalized = normalizeProfile(profile);
  const encoded = Buffer.concat([
    Buffer.from([normalized.formatVersion]),
    fixedHexBytes(normalized.sourceNetworkIdHex, 32),
    fixedHexBytes(normalized.sidechainIdHex, 32),
    fixedHexBytes(normalized.bridgeAddressHex, 20),
    fixedHexBytes(normalized.tokenAddressHex, 20),
    fixedHexBytes(normalized.settlementAssetIdHex, 32, true),
    fixedHexBytes(normalized.settlementProfileIdHex, 32),
    fixedHexBytes(normalized.trackerGenesisInputBoxIdHex, 32),
    fixedHexBytes(normalized.duplicatePreventionGenesisInputBoxIdHex, 32),
    fixedHexBytes(normalized.settlementVaultGenesisInputBoxIdHex, 32),
    fixedHexBytes(normalized.sourceLockTemplateSha256Hex, 32),
    fixedHexBytes(normalized.validityTrackerTemplateSha256Hex, 32),
    fixedHexBytes(normalized.settlementVaultTemplateSha256Hex, 32),
    fixedHexBytes(normalized.duplicatePreventionTemplateSha256Hex, 32),
    fixedHexBytes(normalized.sidechainFinalityPolicyIdHex, 32),
    fixedHexBytes(normalized.ergoDepositFinalityPolicyIdHex, 32),
    fixedHexBytes(normalized.proofSystemIdHex, 32),
    fixedHexBytes(normalized.proofProfileIdHex, 32),
    fixedHexBytes(normalized.sourceCommitmentPolicyIdHex, 32),
    fixedHexBytes(normalized.depositCommitmentStatePolicyIdHex, 32),
    uint64Be(normalized.profileRevision, 'profile revision', true),
    uint64Be(normalized.activationHeight, 'activation height'),
  ]);
  if (encoded.length !== PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES) {
    throw new Error(
      'peg-in pooled-reserve lineage profile V4 internal length mismatch',
    );
  }
  return `0x${encoded.toString('hex')}`;
}

export function decodePegInPooledReserveLineageProfileV4Hex(
  value: string,
): Readonly<PegInPooledReserveLineageProfileV4> {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES,
    'peg-in pooled-reserve lineage profile V4',
  );
  const profile = normalizeProfile({
    formatVersion:
      bytes[0] as typeof PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION,
    sourceNetworkIdHex: sliceHex(bytes, 1, 33),
    sidechainIdHex: sliceHex(bytes, 33, 65),
    bridgeAddressHex: sliceHex(bytes, 65, 85),
    tokenAddressHex: sliceHex(bytes, 85, 105),
    settlementAssetIdHex: sliceHex(bytes, 105, 137),
    settlementProfileIdHex: sliceHex(bytes, 137, 169),
    trackerGenesisInputBoxIdHex: sliceHex(bytes, 169, 201),
    duplicatePreventionGenesisInputBoxIdHex: sliceHex(bytes, 201, 233),
    settlementVaultGenesisInputBoxIdHex: sliceHex(bytes, 233, 265),
    sourceLockTemplateSha256Hex: sliceHex(bytes, 265, 297),
    validityTrackerTemplateSha256Hex: sliceHex(bytes, 297, 329),
    settlementVaultTemplateSha256Hex: sliceHex(bytes, 329, 361),
    duplicatePreventionTemplateSha256Hex: sliceHex(bytes, 361, 393),
    sidechainFinalityPolicyIdHex: sliceHex(bytes, 393, 425),
    ergoDepositFinalityPolicyIdHex: sliceHex(bytes, 425, 457),
    proofSystemIdHex: sliceHex(bytes, 457, 489),
    proofProfileIdHex: sliceHex(bytes, 489, 521),
    sourceCommitmentPolicyIdHex: sliceHex(bytes, 521, 553),
    depositCommitmentStatePolicyIdHex: sliceHex(bytes, 553, 585),
    profileRevision: bytes.readBigUInt64BE(585).toString(),
    activationHeight: bytes.readBigUInt64BE(593).toString(),
  });
  if (encodePegInPooledReserveLineageProfileV4Hex(profile) !== value) {
    throw new Error(
      'peg-in pooled-reserve lineage profile V4 bytes are not canonical',
    );
  }
  return profile;
}

export function derivePegInPooledReserveLineageProfileV4IdHex(
  profile: PegInPooledReserveLineageProfileV4,
): string {
  const encoded = Buffer.from(
    encodePegInPooledReserveLineageProfileV4Hex(profile).slice(2),
    'hex',
  );
  return `0x${Buffer.from(blakejs.blake2b(
    Buffer.concat([
      Buffer.from(PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_DOMAIN, 'ascii'),
      encoded,
    ]),
    undefined,
    32,
  )).toString('hex')}`;
}

export async function derivePegInPooledReserveLineageProfileV4(
  input: DerivePegInPooledReserveLineageProfileV4Input,
): Promise<Readonly<PegInPooledReserveLineageProfileV4Candidate>> {
  const derivationInput = snapshotExactDataObject(input, [
    'trackerGenesisInputBox',
    'duplicatePreventionGenesisInputBox',
    'settlementVaultGenesisInputBox',
    'semantics',
  ], 'peg-in pooled-reserve lineage profile V4 derivation input');
  const semantics = snapshotExactDataObject(
    derivationInput.semantics,
    SEMANTICS_KEYS,
    'peg-in pooled-reserve lineage profile V4 semantics',
  );
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = await Promise.all([
    normalizeGenesisInputBox(
      derivationInput.trackerGenesisInputBox,
      'tracker genesis input box',
    ),
    normalizeGenesisInputBox(
      derivationInput.duplicatePreventionGenesisInputBox,
      'duplicate-prevention genesis input box',
    ),
    normalizeGenesisInputBox(
      derivationInput.settlementVaultGenesisInputBox,
      'settlement-vault genesis input box',
    ),
  ]);
  assertPairwiseDistinctGenesisIds([
    trackerGenesisInputBox.boxId,
    duplicatePreventionGenesisInputBox.boxId,
    settlementVaultGenesisInputBox.boxId,
  ]);

  const profile = normalizeProfile({
    ...semantics,
    formatVersion: PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION,
    settlementAssetIdHex:
      PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
    trackerGenesisInputBoxIdHex: `0x${trackerGenesisInputBox.boxId}`,
    duplicatePreventionGenesisInputBoxIdHex:
      `0x${duplicatePreventionGenesisInputBox.boxId}`,
    settlementVaultGenesisInputBoxIdHex:
      `0x${settlementVaultGenesisInputBox.boxId}`,
  });
  const encodedProfileHex =
    encodePegInPooledReserveLineageProfileV4Hex(profile);
  const profileIdHex =
    derivePegInPooledReserveLineageProfileV4IdHex(profile);

  const candidate = Object.freeze({
    schema: PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_SCHEMA,
    profile,
    encodedProfileHex,
    profileIdHex,
    genesis: Object.freeze({
      tracker: singletonGenesisRole(
        trackerGenesisInputBox,
        profile.trackerGenesisInputBoxIdHex,
      ),
      duplicatePrevention: singletonGenesisRole(
        duplicatePreventionGenesisInputBox,
        profile.duplicatePreventionGenesisInputBoxIdHex,
      ),
      settlementVault: singletonGenesisRole(
        settlementVaultGenesisInputBox,
        profile.settlementVaultGenesisInputBoxIdHex,
      ),
    }),
    invariants: Object.freeze({
      singletonIdsDerivedFromValidatedGenesisInputs: true,
      allGenesisInputsDistinct: true,
      canonicalSettlementVaultLineageRequired: true,
      nativeErgSettlementLaneBound: true,
      separateFinalityPoliciesBound: true,
      depositObservationIsNotMintAuthority: true,
      compiledContractIdentitiesExcludedFromProfile: true,
      localPersistenceIsNotAuthority: true,
    }),
    boundaries: Object.freeze({
      setupTransactionsConstructed: false,
      sourceLockConsumptionEstablished: false,
      settlementVaultLineageEstablished: false,
      trackerLineageEstablished: false,
      duplicatePreventionLineageEstablished: false,
      depositCommitmentStateEstablished: false,
      mintEligibilityEstablished: false,
      burnSettlementEstablished: false,
      exactTemplatesResolved: false,
      compiledContractIdentitiesEstablished: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    }),
  });
  validatedCandidates.add(candidate);
  return candidate;
}

/**
 * Enforces same-process provenance for consumers that require validated
 * genesis inputs. Serialized profiles must be re-derived from their complete
 * EIP-12 boxes before they can cross this boundary.
 */
export function assertDerivedPegInPooledReserveLineageProfileV4Candidate(
  value: unknown,
): asserts value is Readonly<PegInPooledReserveLineageProfileV4Candidate> {
  if (
    value === null
    || typeof value !== 'object'
    || !validatedCandidates.has(value)
  ) {
    throw new Error(
      'peg-in pooled-reserve lineage profile V4 candidate must be derived from complete validated EIP-12 genesis inputs in this process',
    );
  }
}

async function normalizeGenesisInputBox(
  box: Eip12Box,
  label: string,
): Promise<Eip12Box> {
  const normalized = await normalizeEip12Box(box, label);
  if (normalized.assets.length !== 0) {
    throw new Error(`${label} must be pure ERG`);
  }
  if (Object.keys(normalized.additionalRegisters).length !== 0) {
    throw new Error(`${label} must not carry registers`);
  }
  return normalized;
}

function normalizeProfile(
  profile: PegInPooledReserveLineageProfileV4,
): Readonly<PegInPooledReserveLineageProfileV4> {
  const fields = snapshotExactDataObject(
    profile,
    PROFILE_KEYS,
    'peg-in pooled-reserve lineage profile V4',
  );
  if (
    fields.formatVersion
    !== PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION
  ) {
    throw new Error(
      `peg-in pooled-reserve lineage profile format version must be exactly ${
        PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION
      }`,
    );
  }
  const bridgeAddressHex = nonzeroHex(
    fields.bridgeAddressHex,
    20,
    'bridge address',
  );
  const tokenAddressHex = nonzeroHex(
    fields.tokenAddressHex,
    20,
    'token address',
  );
  if (bridgeAddressHex === tokenAddressHex) {
    throw new Error('bridge and token addresses must not alias');
  }
  const settlementAssetIdHex = canonicalHex(
    fields.settlementAssetIdHex,
    32,
    'settlement asset ID',
  );
  if (
    settlementAssetIdHex
    !== PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX
  ) {
    throw new Error(
      'peg-in pooled-reserve lineage profile V4 settlement asset must be native ERG',
    );
  }
  const trackerGenesisInputBoxIdHex = nonzeroHex(
    fields.trackerGenesisInputBoxIdHex,
    32,
    'tracker genesis input box ID',
  );
  const duplicatePreventionGenesisInputBoxIdHex = nonzeroHex(
    fields.duplicatePreventionGenesisInputBoxIdHex,
    32,
    'duplicate-prevention genesis input box ID',
  );
  const settlementVaultGenesisInputBoxIdHex = nonzeroHex(
    fields.settlementVaultGenesisInputBoxIdHex,
    32,
    'settlement-vault genesis input box ID',
  );
  assertPairwiseDistinctGenesisIds([
    trackerGenesisInputBoxIdHex,
    duplicatePreventionGenesisInputBoxIdHex,
    settlementVaultGenesisInputBoxIdHex,
  ]);
  const sidechainFinalityPolicyIdHex = nonzeroHex(
    fields.sidechainFinalityPolicyIdHex,
    32,
    'sidechain finality policy ID',
  );
  const ergoDepositFinalityPolicyIdHex = nonzeroHex(
    fields.ergoDepositFinalityPolicyIdHex,
    32,
    'Ergo deposit finality policy ID',
  );
  if (sidechainFinalityPolicyIdHex === ergoDepositFinalityPolicyIdHex) {
    throw new Error(
      'sidechain and Ergo deposit finality policies must not alias',
    );
  }

  return Object.freeze({
    formatVersion: PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_FORMAT_VERSION,
    sourceNetworkIdHex: nonzeroHex(
      fields.sourceNetworkIdHex,
      32,
      'source network ID',
    ),
    sidechainIdHex: nonzeroHex(fields.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex,
    tokenAddressHex,
    settlementAssetIdHex,
    settlementProfileIdHex: nonzeroHex(
      fields.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    trackerGenesisInputBoxIdHex,
    duplicatePreventionGenesisInputBoxIdHex,
    settlementVaultGenesisInputBoxIdHex,
    sourceLockTemplateSha256Hex: nonzeroHex(
      fields.sourceLockTemplateSha256Hex,
      32,
      'source-lock template SHA-256',
    ),
    validityTrackerTemplateSha256Hex: nonzeroHex(
      fields.validityTrackerTemplateSha256Hex,
      32,
      'validity tracker template SHA-256',
    ),
    settlementVaultTemplateSha256Hex: nonzeroHex(
      fields.settlementVaultTemplateSha256Hex,
      32,
      'settlement-vault template SHA-256',
    ),
    duplicatePreventionTemplateSha256Hex: nonzeroHex(
      fields.duplicatePreventionTemplateSha256Hex,
      32,
      'duplicate-prevention template SHA-256',
    ),
    sidechainFinalityPolicyIdHex,
    ergoDepositFinalityPolicyIdHex,
    proofSystemIdHex: nonzeroHex(
      fields.proofSystemIdHex,
      32,
      'proof-system ID',
    ),
    proofProfileIdHex: nonzeroHex(
      fields.proofProfileIdHex,
      32,
      'proof profile ID',
    ),
    sourceCommitmentPolicyIdHex: nonzeroHex(
      fields.sourceCommitmentPolicyIdHex,
      32,
      'source-commitment policy ID',
    ),
    depositCommitmentStatePolicyIdHex: nonzeroHex(
      fields.depositCommitmentStatePolicyIdHex,
      32,
      'deposit-commitment state policy ID',
    ),
    profileRevision: normalizeUint64(
      fields.profileRevision,
      'profile revision',
      true,
    ).toString(),
    activationHeight: normalizeUint64(
      fields.activationHeight,
      'activation height',
    ).toString(),
  });
}

function singletonGenesisRole(
  inputBox: Eip12Box,
  singletonNftIdHex: string,
) {
  return Object.freeze({
    inputBox: freezeBox(inputBox),
    singletonNftIdHex,
    singletonIdEqualsGenesisInputBoxId: true as const,
  });
}

function freezeBox(
  box: Eip12Box,
): PegInPooledReserveLineageGenesisInputBox {
  return Object.freeze({
    ...box,
    assets: Object.freeze(box.assets.map(asset => Object.freeze({ ...asset }))),
    additionalRegisters: Object.freeze({ ...box.additionalRegisters }),
  });
}

function fixedHexBytes(
  value: string,
  bytes: number,
  allowZero = false,
): Buffer {
  const normalized = allowZero
    ? canonicalHex(value, bytes, 'profile field')
    : nonzeroHex(value, bytes, 'profile field');
  return Buffer.from(normalized.slice(2), 'hex');
}

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new Error(`${label} contains unknown fields`);
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
}

function snapshotExactDataObject<T extends object>(
  value: T,
  expectedKeys: readonly string[],
  label: string,
): Readonly<T> {
  assertExactKeys(value, expectedKeys, label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label} fields must be own data properties`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<T>;
}

function nonzeroHex(
  value: string,
  bytes: number,
  label: string,
): string {
  const normalized = canonicalHex(value, bytes, label);
  if (/^0x0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

function canonicalHex(
  value: string,
  bytes: number,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be exactly ${bytes} hexadecimal bytes`);
  }
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (raw.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`${label} must be exactly ${bytes} hexadecimal bytes`);
  }
  const normalized = `0x${raw.toLowerCase()}`;
  return normalized;
}

function fixedWireBytes(value: string, bytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase 0x-prefixed hexadecimal bytes`);
  }
  if (value.length !== 2 + (bytes * 2)) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function uint64Be(
  value: string | number | bigint,
  label: string,
  positive = false,
): Buffer {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(normalizeUint64(value, label, positive));
  return encoded;
}

function normalizeUint64(
  value: string | number | bigint,
  label: string,
  positive = false,
): bigint {
  let normalized: bigint;
  if (typeof value === 'bigint') {
    normalized = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} number must be a safe integer`);
    }
    normalized = BigInt(value);
  } else if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    normalized = BigInt(value);
  } else {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  if (
    normalized < 0n
    || normalized > UINT64_MAX
    || (positive && normalized === 0n)
  ) {
    throw new Error(`${label} must be a ${positive ? 'positive ' : ''}uint64`);
  }
  return normalized;
}

function assertPairwiseDistinctGenesisIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'tracker, duplicate-prevention and settlement-vault genesis inputs must be pairwise distinct',
    );
  }
}

function sliceHex(value: Buffer, start: number, end: number): string {
  return `0x${value.subarray(start, end).toString('hex')}`;
}
