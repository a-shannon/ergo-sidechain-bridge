import blakejs from 'blakejs';

import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';

export const POOLED_RESERVE_MINT_RESERVATION_CURRENT_PROFILE_STORAGE_KEY_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde';
export const POOLED_RESERVE_MINT_RESERVATION_ENFORCEMENT_STORAGE_KEY_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1';
export const POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_STORAGE_KEY_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0d0a83d0ef50207e59763b1f4ec459bc1';
export const POOLED_RESERVE_MINT_RESERVATION_PENDING_MAP_PREFIX_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0d8f4208c25ae580c0bdd2d1089d53f9e';
export const POOLED_RESERVE_MINT_RESERVATION_CONSUMED_MAP_PREFIX_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0fa7fa03df57ece9195ed3bfdb842c694';
export const POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_MAP_PREFIX_V4_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad06ae5f8068f72eca31ae646d9e8176f61';

export const MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4 = 256;
export const MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_SCALE_BYTES_V4 =
  2 + MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4 * 32;

export interface PooledReserveMintReservationRuntimeStorageKeysV4 {
  readonly reservationKeyHex: string;
  readonly runtimeCodeStorageKeyHex:
    typeof SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX;
  readonly currentProfileStorageKeyHex: string;
  readonly enforcementStorageKeyHex: string;
  readonly pendingKeysStorageKeyHex: string;
  readonly pendingReservationStorageKeyHex: string;
  readonly consumedReservationStorageKeyHex: string;
  readonly invalidatedReservationStorageKeyHex: string;
}

export interface PooledReserveMintReservationPendingV4 {
  readonly profileIdHex: string;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly mintIdentityHex: string;
  readonly sourceStatementBytesDigestHex: string;
  readonly sourceProofSystemIdHex: string;
  readonly sourceProofProfileIdHex: string;
  readonly sourceProofIssuedAtNativeHeight: string | number | bigint;
  readonly sourceProofRequestDigestHex: string;
  readonly sourceProofResultIdHex: string;
  readonly sourceProofDigestHex: string;
  readonly reservedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

/** Encode supplied pending-record fields only; no proof, finality or mint authority. */
export function encodePooledReserveMintReservationPendingV4ScaleHex(
  input: Readonly<PooledReserveMintReservationPendingV4>,
): string {
  const hashFields = [
    'profileIdHex', 'statementIdHex', 'mintIdentityHex',
    'sourceStatementBytesDigestHex', 'sourceProofSystemIdHex',
    'sourceProofProfileIdHex', 'sourceProofRequestDigestHex',
    'sourceProofResultIdHex', 'sourceProofDigestHex',
  ] as const;
  const fields = [
    ...hashFields, 'statementHex', 'sourceProofIssuedAtNativeHeight',
    'reservedAtNativeHeight', 'expiresAtNativeHeight',
  ] as const;
  if (
    input === null || typeof input !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new Error('pending reservation requires an exact own-data record');
  }
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).length !== fields.length
    || fields.some(field => {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, field)?.value;
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })
  ) {
    throw new Error('pending reservation requires exact enumerable own-data fields');
  }
  const hashes = hashFields.map(field => {
    const bytes = fixedHexBytes(descriptors[field].value, 32, field);
    if (bytes.every(byte => byte === 0)) {
      throw new Error(`${field} must not be zero`);
    }
    return bytes;
  });
  const statement = fixedHexBytes(descriptors.statementHex.value, 603, 'statementHex');
  const issued = pendingReservationHeightV4(
    descriptors.sourceProofIssuedAtNativeHeight.value, 'sourceProofIssuedAtNativeHeight',
  );
  const reserved = pendingReservationHeightV4(
    descriptors.reservedAtNativeHeight.value, 'reservedAtNativeHeight',
  );
  const expires = pendingReservationHeightV4(
    descriptors.expiresAtNativeHeight.value, 'expiresAtNativeHeight',
  );
  if (issued > reserved || reserved >= expires) {
    throw new Error('pending reservation requires issue <= reserved < expiry');
  }
  const issueBytes = Buffer.alloc(8);
  issueBytes.writeBigUInt64LE(issued);
  const reservationWindow = Buffer.alloc(16);
  reservationWindow.writeBigUInt64LE(reserved, 0);
  reservationWindow.writeBigUInt64LE(expires, 8);
  // SCALE struct: version, profile, compact(603), statement, hashes and LE heights.
  return `0x${Buffer.concat([
    Buffer.from([4]), hashes[0], Buffer.from([0x6d, 0x09]), statement,
    ...hashes.slice(1, 6), issueBytes, ...hashes.slice(6), reservationWindow,
  ]).toString('hex')}`;
}

function pendingReservationHeightV4(value: unknown, label: string): bigint {
  if (
    (typeof value !== 'bigint' && typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'number' && (!Number.isSafeInteger(value) || Object.is(value, -0)))
    || (typeof value === 'string' && (value.length > 20 || !/^(?:0|[1-9][0-9]*)$/.test(value)))
  ) {
    throw new Error(`${label} must be a canonical uint64`);
  }
  const height = BigInt(value);
  if (height < 0n || height > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a canonical uint64`);
  }
  return height;
}

/** Derive the exact source-locked V4 state surface for one mint identity. */
export function derivePooledReserveMintReservationRuntimeStorageKeysV4(
  reservationKeyHex: string,
): Readonly<PooledReserveMintReservationRuntimeStorageKeysV4> {
  const key = fixedHexBytes(
    reservationKeyHex,
    32,
    'pooled-reserve mint-reservation key',
  );
  const normalizedKeyHex = `0x${key.toString('hex')}`;
  return Object.freeze({
    reservationKeyHex: normalizedKeyHex,
    runtimeCodeStorageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    currentProfileStorageKeyHex:
      POOLED_RESERVE_MINT_RESERVATION_CURRENT_PROFILE_STORAGE_KEY_V4_HEX,
    enforcementStorageKeyHex:
      POOLED_RESERVE_MINT_RESERVATION_ENFORCEMENT_STORAGE_KEY_V4_HEX,
    pendingKeysStorageKeyHex:
      POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_STORAGE_KEY_V4_HEX,
    pendingReservationStorageKeyHex: deriveBlake2_128ConcatMapKey(
      POOLED_RESERVE_MINT_RESERVATION_PENDING_MAP_PREFIX_V4_HEX,
      key,
    ),
    consumedReservationStorageKeyHex: deriveBlake2_128ConcatMapKey(
      POOLED_RESERVE_MINT_RESERVATION_CONSUMED_MAP_PREFIX_V4_HEX,
      key,
    ),
    invalidatedReservationStorageKeyHex: deriveBlake2_128ConcatMapKey(
      POOLED_RESERVE_MINT_RESERVATION_INVALIDATED_MAP_PREFIX_V4_HEX,
      key,
    ),
  });
}

/**
 * Decode the exact SCALE `BoundedVec<H256, 256>` and enforce the runtime's
 * canonical strictly increasing index invariant.
 */
export function decodePooledReserveMintReservationPendingKeysScaleV4(
  scaleHex: string,
): readonly string[] {
  if (typeof scaleHex !== 'string' || !/^0x[0-9a-f]+$/.test(scaleHex)) {
    throw new Error(
      'pooled-reserve mint-reservation pending index must be lowercase 0x-prefixed hex',
    );
  }
  if (scaleHex.length % 2 !== 0) {
    throw new Error(
      'pooled-reserve mint-reservation pending index must contain whole SCALE bytes',
    );
  }
  const bytes = Buffer.from(scaleHex.slice(2), 'hex');
  if (bytes.length === 0) {
    throw new Error(
      'pooled-reserve mint-reservation pending index must contain a SCALE length',
    );
  }
  const { value: count, bytesRead } = decodeCanonicalCompactLength(bytes);
  if (count > MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4) {
    throw new Error(
      `pooled-reserve mint-reservation pending index exceeds ${MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_V4} entries`,
    );
  }
  if (bytes.length !== bytesRead + count * 32) {
    throw new Error(
      'pooled-reserve mint-reservation pending index has malformed SCALE length',
    );
  }

  const keys: string[] = [];
  let previous: Buffer | undefined;
  for (let index = 0; index < count; index += 1) {
    const offset = bytesRead + index * 32;
    const key = bytes.subarray(offset, offset + 32);
    if (key.every(byte => byte === 0)) {
      throw new Error(
        'pooled-reserve mint-reservation pending index contains the zero key',
      );
    }
    if (previous !== undefined && Buffer.compare(previous, key) >= 0) {
      throw new Error(
        'pooled-reserve mint-reservation pending index is not strictly increasing',
      );
    }
    keys.push(`0x${key.toString('hex')}`);
    previous = key;
  }
  return Object.freeze(keys);
}

function deriveBlake2_128ConcatMapKey(prefixHex: string, key: Buffer): string {
  const prefix = fixedHexBytes(
    prefixHex,
    32,
    'pooled-reserve mint-reservation storage-map prefix',
  );
  return `0x${Buffer.concat([
    prefix,
    Buffer.from(blakejs.blake2b(key, undefined, 16)),
    key,
  ]).toString('hex')}`;
}

function decodeCanonicalCompactLength(
  bytes: Buffer,
): { value: number; bytesRead: number } {
  const mode = bytes[0] & 0b11;
  if (mode === 0) {
    return { value: bytes[0] >>> 2, bytesRead: 1 };
  }
  if (mode === 1) {
    if (bytes.length < 2) {
      throw new Error(
        'pooled-reserve mint-reservation pending index has a truncated SCALE length',
      );
    }
    const value = bytes.readUInt16LE(0) >>> 2;
    if (value < 1 << 6) {
      throw new Error(
        'pooled-reserve mint-reservation pending index has a noncanonical SCALE length',
      );
    }
    return { value, bytesRead: 2 };
  }
  if (mode === 2) {
    if (bytes.length < 4) {
      throw new Error(
        'pooled-reserve mint-reservation pending index has a truncated SCALE length',
      );
    }
    const value = bytes.readUInt32LE(0) >>> 2;
    if (value < 1 << 14) {
      throw new Error(
        'pooled-reserve mint-reservation pending index has a noncanonical SCALE length',
      );
    }
    return { value, bytesRead: 4 };
  }
  throw new Error(
    'pooled-reserve mint-reservation pending index uses an unsupported SCALE length',
  );
}

function fixedHexBytes(value: string, bytes: number, label: string): Buffer {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(
      `${label} must be a lowercase 0x-prefixed ${bytes}-byte value`,
    );
  }
  return Buffer.from(value.slice(2), 'hex');
}
