import blakejs from 'blakejs';

import {
  normalizeEip12Box,
  type Eip12Asset,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION = 3 as const;
export const PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES = 473;
export const PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_DOMAIN =
  'E2S_PEG_IN_CAUSAL_LINEAGE_PROFILE_V3' as const;
export const PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_SCHEMA =
  'ergo-sidechain-bridge/peg-in-causal-lineage-profile-v3' as const;

const UINT64_MAX = (1n << 64n) - 1n;
const validatedCandidates = new WeakSet<object>();
const PROFILE_KEYS = [
  'formatVersion',
  'sourceNetworkIdHex',
  'sidechainIdHex',
  'bridgeAddressHex',
  'tokenAddressHex',
  'settlementProfileIdHex',
  'trackerGenesisInputBoxIdHex',
  'duplicatePreventionGenesisInputBoxIdHex',
  'sourceLockTemplateSha256Hex',
  'validityTrackerTemplateSha256Hex',
  'causalVaultTemplateSha256Hex',
  'duplicatePreventionTemplateSha256Hex',
  'finalityPolicyIdHex',
  'proofSystemIdHex',
  'proofProfileIdHex',
  'sourceCommitmentPolicyIdHex',
  'profileRevision',
  'activationHeight',
] as const;
const SEMANTICS_KEYS = PROFILE_KEYS.filter(key =>
  key !== 'formatVersion'
  && key !== 'trackerGenesisInputBoxIdHex'
  && key !== 'duplicatePreventionGenesisInputBoxIdHex'
);

/**
 * Non-circular identity for one future application settlement instance.
 *
 * The profile binds source/application semantics, singleton issuance inputs,
 * contract templates and proof policies. Compiled proposition identities are
 * deliberately excluded because the propositions embed this profile ID.
 */
export interface PegInCausalLineageProfileV3 {
  readonly formatVersion:
    typeof PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly trackerGenesisInputBoxIdHex: string;
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly sourceLockTemplateSha256Hex: string;
  readonly validityTrackerTemplateSha256Hex: string;
  readonly causalVaultTemplateSha256Hex: string;
  readonly duplicatePreventionTemplateSha256Hex: string;
  readonly finalityPolicyIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly sourceCommitmentPolicyIdHex: string;
  readonly profileRevision: string | number | bigint;
  readonly activationHeight: string | number | bigint;
}

export type PegInCausalLineageProfileV3Semantics = Omit<
  PegInCausalLineageProfileV3,
  | 'formatVersion'
  | 'trackerGenesisInputBoxIdHex'
  | 'duplicatePreventionGenesisInputBoxIdHex'
>;

export interface DerivePegInCausalLineageProfileV3Input {
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly semantics: PegInCausalLineageProfileV3Semantics;
}

export type PegInCausalLineageGenesisInputBox = Readonly<
  Omit<Eip12Box, 'assets' | 'additionalRegisters'> & {
    readonly assets: readonly Readonly<Eip12Asset>[];
    readonly additionalRegisters: Readonly<Record<string, string>>;
  }
>;

export interface PegInCausalLineageProfileV3Candidate {
  readonly schema: typeof PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_SCHEMA;
  readonly profile: Readonly<PegInCausalLineageProfileV3>;
  readonly encodedProfileHex: string;
  readonly profileIdHex: string;
  readonly genesis: {
    readonly tracker: {
      readonly inputBox: PegInCausalLineageGenesisInputBox;
      readonly singletonNftIdHex: string;
      readonly singletonIdEqualsGenesisInputBoxId: true;
    };
    readonly duplicatePrevention: {
      readonly inputBox: PegInCausalLineageGenesisInputBox;
      readonly singletonNftIdHex: string;
      readonly singletonIdEqualsGenesisInputBoxId: true;
    };
  };
  readonly invariants: {
    readonly singletonIdsDerivedFromValidatedGenesisInputs: true;
    readonly compiledContractIdentitiesExcludedFromProfile: true;
    readonly localPersistenceIsNotAuthority: true;
  };
  readonly boundaries: {
    readonly setupTransactionsConstructed: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly singletonLineagesEstablished: false;
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
 * Pure profile codec. Successful encoding does not establish that the
 * singleton IDs came from validated EIP-12 boxes.
 */
export function encodePegInCausalLineageProfileV3Hex(
  profile: PegInCausalLineageProfileV3,
): string {
  const normalized = normalizeProfile(profile);
  const encoded = Buffer.concat([
    Buffer.from([normalized.formatVersion]),
    fixedHexBytes(normalized.sourceNetworkIdHex, 32),
    fixedHexBytes(normalized.sidechainIdHex, 32),
    fixedHexBytes(normalized.bridgeAddressHex, 20),
    fixedHexBytes(normalized.tokenAddressHex, 20),
    fixedHexBytes(normalized.settlementProfileIdHex, 32),
    fixedHexBytes(normalized.trackerGenesisInputBoxIdHex, 32),
    fixedHexBytes(normalized.duplicatePreventionGenesisInputBoxIdHex, 32),
    fixedHexBytes(normalized.sourceLockTemplateSha256Hex, 32),
    fixedHexBytes(normalized.validityTrackerTemplateSha256Hex, 32),
    fixedHexBytes(normalized.causalVaultTemplateSha256Hex, 32),
    fixedHexBytes(normalized.duplicatePreventionTemplateSha256Hex, 32),
    fixedHexBytes(normalized.finalityPolicyIdHex, 32),
    fixedHexBytes(normalized.proofSystemIdHex, 32),
    fixedHexBytes(normalized.proofProfileIdHex, 32),
    fixedHexBytes(normalized.sourceCommitmentPolicyIdHex, 32),
    uint64Be(normalized.profileRevision, 'profile revision', true),
    uint64Be(normalized.activationHeight, 'activation height'),
  ]);
  if (encoded.length !== PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES) {
    throw new Error('peg-in causal lineage profile V3 internal length mismatch');
  }
  return `0x${encoded.toString('hex')}`;
}

export function decodePegInCausalLineageProfileV3Hex(
  value: string,
): Readonly<PegInCausalLineageProfileV3> {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES,
    'peg-in causal lineage profile V3',
  );
  const profile = normalizeProfile({
    formatVersion:
      bytes[0] as typeof PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION,
    sourceNetworkIdHex: sliceHex(bytes, 1, 33),
    sidechainIdHex: sliceHex(bytes, 33, 65),
    bridgeAddressHex: sliceHex(bytes, 65, 85),
    tokenAddressHex: sliceHex(bytes, 85, 105),
    settlementProfileIdHex: sliceHex(bytes, 105, 137),
    trackerGenesisInputBoxIdHex: sliceHex(bytes, 137, 169),
    duplicatePreventionGenesisInputBoxIdHex: sliceHex(bytes, 169, 201),
    sourceLockTemplateSha256Hex: sliceHex(bytes, 201, 233),
    validityTrackerTemplateSha256Hex: sliceHex(bytes, 233, 265),
    causalVaultTemplateSha256Hex: sliceHex(bytes, 265, 297),
    duplicatePreventionTemplateSha256Hex: sliceHex(bytes, 297, 329),
    finalityPolicyIdHex: sliceHex(bytes, 329, 361),
    proofSystemIdHex: sliceHex(bytes, 361, 393),
    proofProfileIdHex: sliceHex(bytes, 393, 425),
    sourceCommitmentPolicyIdHex: sliceHex(bytes, 425, 457),
    profileRevision: bytes.readBigUInt64BE(457).toString(),
    activationHeight: bytes.readBigUInt64BE(465).toString(),
  });
  if (encodePegInCausalLineageProfileV3Hex(profile) !== value) {
    throw new Error('peg-in causal lineage profile V3 bytes are not canonical');
  }
  return profile;
}

export function derivePegInCausalLineageProfileV3IdHex(
  profile: PegInCausalLineageProfileV3,
): string {
  const encoded = Buffer.from(
    encodePegInCausalLineageProfileV3Hex(profile).slice(2),
    'hex',
  );
  return `0x${Buffer.from(blakejs.blake2b(
    Buffer.concat([
      Buffer.from(PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_DOMAIN, 'ascii'),
      encoded,
    ]),
    undefined,
    32,
  )).toString('hex')}`;
}

export async function derivePegInCausalLineageProfileV3(
  input: DerivePegInCausalLineageProfileV3Input,
): Promise<Readonly<PegInCausalLineageProfileV3Candidate>> {
  assertExactKeys(input, [
    'trackerGenesisInputBox',
    'duplicatePreventionGenesisInputBox',
    'semantics',
  ], 'peg-in causal lineage profile V3 derivation input');
  assertExactKeys(
    input.semantics,
    SEMANTICS_KEYS,
    'peg-in causal lineage profile V3 semantics',
  );
  const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox] =
    await Promise.all([
      normalizeGenesisInputBox(
        input.trackerGenesisInputBox,
        'tracker genesis input box',
      ),
      normalizeGenesisInputBox(
        input.duplicatePreventionGenesisInputBox,
        'duplicate-prevention genesis input box',
      ),
    ]);
  if (trackerGenesisInputBox.boxId === duplicatePreventionGenesisInputBox.boxId) {
    throw new Error('tracker and duplicate-prevention genesis inputs must be distinct');
  }

  const profile = normalizeProfile({
    ...input.semantics,
    formatVersion: PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION,
    trackerGenesisInputBoxIdHex: `0x${trackerGenesisInputBox.boxId}`,
    duplicatePreventionGenesisInputBoxIdHex:
      `0x${duplicatePreventionGenesisInputBox.boxId}`,
  });
  const encodedProfileHex = encodePegInCausalLineageProfileV3Hex(profile);
  const profileIdHex = derivePegInCausalLineageProfileV3IdHex(profile);

  const candidate = Object.freeze({
    schema: PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_SCHEMA,
    profile,
    encodedProfileHex,
    profileIdHex,
    genesis: Object.freeze({
      tracker: Object.freeze({
        inputBox: freezeBox(trackerGenesisInputBox),
        singletonNftIdHex: profile.trackerGenesisInputBoxIdHex,
        singletonIdEqualsGenesisInputBoxId: true,
      }),
      duplicatePrevention: Object.freeze({
        inputBox: freezeBox(duplicatePreventionGenesisInputBox),
        singletonNftIdHex:
          profile.duplicatePreventionGenesisInputBoxIdHex,
        singletonIdEqualsGenesisInputBoxId: true,
      }),
    }),
    invariants: Object.freeze({
      singletonIdsDerivedFromValidatedGenesisInputs: true,
      compiledContractIdentitiesExcludedFromProfile: true,
      localPersistenceIsNotAuthority: true,
    }),
    boundaries: Object.freeze({
      setupTransactionsConstructed: false,
      sourceLockConsumptionEstablished: false,
      singletonLineagesEstablished: false,
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
export function assertDerivedPegInCausalLineageProfileV3Candidate(
  value: unknown,
): asserts value is Readonly<PegInCausalLineageProfileV3Candidate> {
  if (
    value === null
    || typeof value !== 'object'
    || !validatedCandidates.has(value)
  ) {
    throw new Error(
      'peg-in causal lineage profile V3 candidate must be derived from complete validated EIP-12 genesis inputs in this process',
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
  profile: PegInCausalLineageProfileV3,
): Readonly<PegInCausalLineageProfileV3> {
  assertExactKeys(profile, PROFILE_KEYS, 'peg-in causal lineage profile V3');
  if (
    profile.formatVersion
    !== PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION
  ) {
    throw new Error(
      `peg-in causal lineage profile format version must be exactly ${
        PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION
      }`,
    );
  }
  const bridgeAddressHex = nonzeroHex(profile.bridgeAddressHex, 20, 'bridge address');
  const tokenAddressHex = nonzeroHex(profile.tokenAddressHex, 20, 'token address');
  if (bridgeAddressHex === tokenAddressHex) {
    throw new Error('bridge and token addresses must not alias');
  }
  const trackerGenesisInputBoxIdHex = nonzeroHex(
    profile.trackerGenesisInputBoxIdHex,
    32,
    'tracker genesis input box ID',
  );
  const duplicatePreventionGenesisInputBoxIdHex = nonzeroHex(
    profile.duplicatePreventionGenesisInputBoxIdHex,
    32,
    'duplicate-prevention genesis input box ID',
  );
  if (trackerGenesisInputBoxIdHex === duplicatePreventionGenesisInputBoxIdHex) {
    throw new Error('tracker and duplicate-prevention genesis inputs must be distinct');
  }
  return Object.freeze({
    formatVersion: PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION,
    sourceNetworkIdHex: nonzeroHex(
      profile.sourceNetworkIdHex,
      32,
      'source network ID',
    ),
    sidechainIdHex: nonzeroHex(profile.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex,
    tokenAddressHex,
    settlementProfileIdHex: nonzeroHex(
      profile.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    trackerGenesisInputBoxIdHex,
    duplicatePreventionGenesisInputBoxIdHex,
    sourceLockTemplateSha256Hex: nonzeroHex(
      profile.sourceLockTemplateSha256Hex,
      32,
      'source-lock template SHA-256',
    ),
    validityTrackerTemplateSha256Hex: nonzeroHex(
      profile.validityTrackerTemplateSha256Hex,
      32,
      'validity tracker template SHA-256',
    ),
    causalVaultTemplateSha256Hex: nonzeroHex(
      profile.causalVaultTemplateSha256Hex,
      32,
      'causal vault template SHA-256',
    ),
    duplicatePreventionTemplateSha256Hex: nonzeroHex(
      profile.duplicatePreventionTemplateSha256Hex,
      32,
      'duplicate-prevention template SHA-256',
    ),
    finalityPolicyIdHex: nonzeroHex(
      profile.finalityPolicyIdHex,
      32,
      'finality policy ID',
    ),
    proofSystemIdHex: nonzeroHex(
      profile.proofSystemIdHex,
      32,
      'proof-system ID',
    ),
    proofProfileIdHex: nonzeroHex(
      profile.proofProfileIdHex,
      32,
      'proof profile ID',
    ),
    sourceCommitmentPolicyIdHex: nonzeroHex(
      profile.sourceCommitmentPolicyIdHex,
      32,
      'source-commitment policy ID',
    ),
    profileRevision: normalizeUint64(
      profile.profileRevision,
      'profile revision',
      true,
    ).toString(),
    activationHeight: normalizeUint64(
      profile.activationHeight,
      'activation height',
    ).toString(),
  });
}

function freezeBox(box: Eip12Box): PegInCausalLineageGenesisInputBox {
  return Object.freeze({
    ...box,
    assets: Object.freeze(box.assets.map(asset => Object.freeze({ ...asset }))),
    additionalRegisters: Object.freeze({ ...box.additionalRegisters }),
  });
}

function fixedHexBytes(value: string, bytes: number): Buffer {
  return Buffer.from(nonzeroHex(value, bytes, 'profile field').slice(2), 'hex');
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

function nonzeroHex(
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
  if (/^0x0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
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

function sliceHex(value: Buffer, start: number, end: number): string {
  return `0x${value.subarray(start, end).toString('hex')}`;
}
