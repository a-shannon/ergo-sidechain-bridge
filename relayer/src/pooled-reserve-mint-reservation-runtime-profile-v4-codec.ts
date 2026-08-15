import blakejs from 'blakejs';

import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';

export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION =
  4 as const;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES =
  349 as const;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN =
  'E2S_POOLED_RESERVE_MINT_RESERVATION_PROFILE_V4' as const;

const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export interface PooledReserveMintReservationRuntimeProfileV4 {
  readonly formatVersion:
    typeof POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION;
  readonly lineageProfileIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly settlementProfileIdHex: string;
  readonly ergoDepositFinalityPolicyIdHex: string;
  readonly sourceProofSystemIdHex: string;
  readonly sourceProofProfileIdHex: string;
  readonly activationHeight: string;
  readonly maxPendingBlocks: number;
}

export interface DerivePooledReserveMintReservationRuntimeProfileV4Input {
  readonly encodedLineageProfileHex: string;
  readonly lineageProfileIdHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly maxPendingBlocks: number;
}

export function encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
  value: PooledReserveMintReservationRuntimeProfileV4,
): string {
  const profile = normalizeProfile(value);
  const bytes = Buffer.concat([
    Buffer.from([profile.formatVersion]),
    fixedHexBytes(profile.lineageProfileIdHex, 32),
    fixedHexBytes(profile.sourceNetworkIdHex, 32),
    fixedHexBytes(profile.sidechainIdHex, 32),
    fixedHexBytes(profile.bridgeAddressHex, 20),
    fixedHexBytes(profile.tokenAddressHex, 20),
    fixedHexBytes(profile.bridgeRuntimeCodeSha256Hex, 32),
    uint32Le(profile.bridgeRuntimeCodeBytes),
    fixedHexBytes(profile.tokenRuntimeCodeSha256Hex, 32),
    uint32Le(profile.tokenRuntimeCodeBytes),
    fixedHexBytes(profile.settlementProfileIdHex, 32),
    fixedHexBytes(profile.ergoDepositFinalityPolicyIdHex, 32),
    fixedHexBytes(profile.sourceProofSystemIdHex, 32),
    fixedHexBytes(profile.sourceProofProfileIdHex, 32),
    uint64Le(profile.activationHeight),
    uint32Le(profile.maxPendingBlocks),
  ]);
  if (
    bytes.length
    !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES
  ) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile V4 internal length mismatch',
    );
  }
  return `0x${bytes.toString('hex')}`;
}

export function decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
  value: string,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  const bytes = fixedWireBytes(
    value,
    POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
    'pooled-reserve mint-reservation runtime profile V4',
  );
  const profile = normalizeProfile({
    formatVersion:
      bytes[0] as typeof
        POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
    lineageProfileIdHex: sliceHex(bytes, 1, 33),
    sourceNetworkIdHex: sliceHex(bytes, 33, 65),
    sidechainIdHex: sliceHex(bytes, 65, 97),
    bridgeAddressHex: sliceHex(bytes, 97, 117),
    tokenAddressHex: sliceHex(bytes, 117, 137),
    bridgeRuntimeCodeSha256Hex: sliceHex(bytes, 137, 169),
    bridgeRuntimeCodeBytes: bytes.readUInt32LE(169),
    tokenRuntimeCodeSha256Hex: sliceHex(bytes, 173, 205),
    tokenRuntimeCodeBytes: bytes.readUInt32LE(205),
    settlementProfileIdHex: sliceHex(bytes, 209, 241),
    ergoDepositFinalityPolicyIdHex: sliceHex(bytes, 241, 273),
    sourceProofSystemIdHex: sliceHex(bytes, 273, 305),
    sourceProofProfileIdHex: sliceHex(bytes, 305, 337),
    activationHeight: bytes.readBigUInt64LE(337).toString(),
    maxPendingBlocks: bytes.readUInt32LE(345),
  });
  if (
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(profile)
    !== value
  ) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile V4 bytes are not canonical',
    );
  }
  return profile;
}

export function derivePooledReserveMintReservationRuntimeProfileV4IdHex(
  value: PooledReserveMintReservationRuntimeProfileV4 | string,
): string {
  const encoded = typeof value === 'string'
    ? value
    : encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(value);
  const profile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(encoded);
  const canonical =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(profile);
  return blake2b256Hex(Buffer.concat([
    Buffer.from(
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN,
      'ascii',
    ),
    Buffer.from(canonical.slice(2), 'hex'),
  ]));
}

export function derivePooledReserveMintReservationRuntimeProfileV4(
  input: DerivePooledReserveMintReservationRuntimeProfileV4Input,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  assertExactDataObject(input, [
    'encodedLineageProfileHex',
    'lineageProfileIdHex',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
    'maxPendingBlocks',
  ], 'pooled-reserve runtime-profile derivation input');
  const lineage = decodePegInPooledReserveLineageProfileV4Hex(
    input.encodedLineageProfileHex,
  );
  const lineageProfileIdHex =
    derivePegInPooledReserveLineageProfileV4IdHex(lineage);
  if (lineageProfileIdHex !== fixedPrefixedHex(
    input.lineageProfileIdHex,
    32,
    'lineage profile ID',
  )) {
    throw new Error('pooled-reserve runtime profile lineage identity is inconsistent');
  }
  return normalizeProfile({
    formatVersion:
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
    lineageProfileIdHex,
    sourceNetworkIdHex: lineage.sourceNetworkIdHex,
    sidechainIdHex: lineage.sidechainIdHex,
    bridgeAddressHex: lineage.bridgeAddressHex,
    tokenAddressHex: lineage.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: fixedPrefixedHex(
      input.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime code SHA-256',
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      input.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
    ),
    tokenRuntimeCodeSha256Hex: fixedPrefixedHex(
      input.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime code SHA-256',
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      input.tokenRuntimeCodeBytes,
      'token runtime code bytes',
    ),
    settlementProfileIdHex: lineage.settlementProfileIdHex,
    ergoDepositFinalityPolicyIdHex:
      lineage.ergoDepositFinalityPolicyIdHex,
    sourceProofSystemIdHex: lineage.proofSystemIdHex,
    sourceProofProfileIdHex: lineage.proofProfileIdHex,
    activationHeight: canonicalUint64(
      lineage.activationHeight,
      'lineage activation height',
    ),
    maxPendingBlocks: positiveUint32(
      input.maxPendingBlocks,
      'maximum pending blocks',
    ),
  });
}

function normalizeProfile(
  value: unknown,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  const profile = assertExactDataObject(
    value,
    [
      'formatVersion',
      'lineageProfileIdHex',
      'sourceNetworkIdHex',
      'sidechainIdHex',
      'bridgeAddressHex',
      'tokenAddressHex',
      'bridgeRuntimeCodeSha256Hex',
      'bridgeRuntimeCodeBytes',
      'tokenRuntimeCodeSha256Hex',
      'tokenRuntimeCodeBytes',
      'settlementProfileIdHex',
      'ergoDepositFinalityPolicyIdHex',
      'sourceProofSystemIdHex',
      'sourceProofProfileIdHex',
      'activationHeight',
      'maxPendingBlocks',
    ],
    'pooled-reserve mint-reservation runtime profile V4',
  );
  if (
    profile.formatVersion
      !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION
  ) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile version is unsupported',
    );
  }
  const normalized = {
    formatVersion:
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
    lineageProfileIdHex:
      fixedPrefixedHex(profile.lineageProfileIdHex, 32, 'lineage profile ID', true),
    sourceNetworkIdHex:
      fixedPrefixedHex(profile.sourceNetworkIdHex, 32, 'source-network ID', true),
    sidechainIdHex:
      fixedPrefixedHex(profile.sidechainIdHex, 32, 'sidechain ID', true),
    bridgeAddressHex:
      fixedPrefixedHex(profile.bridgeAddressHex, 20, 'bridge address', true),
    tokenAddressHex:
      fixedPrefixedHex(profile.tokenAddressHex, 20, 'token address', true),
    bridgeRuntimeCodeSha256Hex: fixedPrefixedHex(
      profile.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime code digest',
      true,
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      profile.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
    ),
    tokenRuntimeCodeSha256Hex: fixedPrefixedHex(
      profile.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime code digest',
      true,
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      profile.tokenRuntimeCodeBytes,
      'token runtime code bytes',
    ),
    settlementProfileIdHex: fixedPrefixedHex(
      profile.settlementProfileIdHex,
      32,
      'settlement profile ID',
      true,
    ),
    ergoDepositFinalityPolicyIdHex: fixedPrefixedHex(
      profile.ergoDepositFinalityPolicyIdHex,
      32,
      'Ergo deposit finality-policy ID',
      true,
    ),
    sourceProofSystemIdHex: fixedPrefixedHex(
      profile.sourceProofSystemIdHex,
      32,
      'source-proof system ID',
      true,
    ),
    sourceProofProfileIdHex: fixedPrefixedHex(
      profile.sourceProofProfileIdHex,
      32,
      'source-proof profile ID',
      true,
    ),
    activationHeight: canonicalUint64(
      profile.activationHeight,
      'activation height',
    ),
    maxPendingBlocks: positiveUint32(
      profile.maxPendingBlocks,
      'maximum pending blocks',
    ),
  } as const;
  if (normalized.bridgeAddressHex === normalized.tokenAddressHex) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile aliases bridge and token addresses',
    );
  }
  return deepFreeze(normalized);
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length
    || actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expectedKeys.join(', ')}`);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
  return value as Record<string, unknown>;
}

function fixedWireBytes(value: unknown, bytes: number, label: string): Buffer {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase SCALE bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function fixedPrefixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be a lowercase 0x-prefixed ${bytes}-byte value`);
  }
  if (nonZero && /^0x0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function fixedHexBytes(value: string, bytes: number): Buffer {
  return Buffer.from(fixedPrefixedHex(value, bytes, 'profile field').slice(2), 'hex');
}

function positiveUint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > UINT32_MAX
  ) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint64 decimal string`);
  }
  if (BigInt(value) > UINT64_MAX) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function uint32Le(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function uint64Le(value: string): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function sliceHex(bytes: Buffer, start: number, end: number): string {
  return `0x${bytes.subarray(start, end).toString('hex')}`;
}

function blake2b256Hex(value: Uint8Array): string {
  return `0x${Buffer.from(
    blakejs.blake2b(value, undefined, 32),
  ).toString('hex')}`;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
