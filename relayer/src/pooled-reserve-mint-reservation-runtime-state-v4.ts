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
