import blakejs from 'blakejs';

import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX,
  derivePegInRuntimeRecordKeyV1Hex,
  type PegInRuntimeRecordIdentityV1,
} from './peg-in-runtime-state.js';

export const PEG_IN_CAUSAL_CURRENT_PROFILE_STORAGE_KEY_V2_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0a429af194416082f5009fdf71f22761e';
export const PEG_IN_CAUSAL_ENFORCEMENT_STORAGE_KEY_V2_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0a913a559be365cacd68b07ebf9b92d3a';
export const PEG_IN_CAUSAL_PENDING_KEYS_STORAGE_KEY_V2_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0bf2797ef7e92a829f098f3755f51fdb5';
export const PEG_IN_CAUSAL_PENDING_MAP_PREFIX_V2_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0cb7e16ec59f388e7c3727538de64dbb1';
export const PEG_IN_CAUSAL_CONSUMED_MAP_PREFIX_V3_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0a1375383e5f54fecb825bc58227ef78a';
export const MAX_PEG_IN_CAUSAL_PENDING_KEYS_V2 = 256;
export const MAX_PEG_IN_CAUSAL_PENDING_KEYS_SCALE_BYTES_V2 =
  2 + MAX_PEG_IN_CAUSAL_PENDING_KEYS_V2 * 32;

export interface PegInCausalRuntimeStorageKeysV2 {
  readonly recordKeyHex: string;
  readonly currentPegInProfileStorageKeyHex: string;
  readonly currentCausalProfileStorageKeyHex: string;
  readonly causalEnforcementStorageKeyHex: string;
  readonly pendingKeysStorageKeyHex: string;
  readonly pendingAdmissionStorageKeyHex: string;
  readonly processedRecordStorageKeyHex: string;
  readonly consumedAdmissionStorageKeyHex: string;
}

/** Derive the exact pinned `BridgeCommitment` causal-state keys for one V1 replay identity. */
export function derivePegInCausalRuntimeStorageKeysV2(
  identity: PegInRuntimeRecordIdentityV1,
): PegInCausalRuntimeStorageKeysV2 {
  return derivePegInCausalRuntimeStorageKeysFromRecordKeyV2(
    derivePegInRuntimeRecordKeyV1Hex(identity),
  );
}

export function derivePegInCausalRuntimeStorageKeysFromRecordKeyV2(
  recordKeyHex: string,
): PegInCausalRuntimeStorageKeysV2 {
  const recordKey = fixedHexBytes(recordKeyHex, 32, 'causal peg-in record key');
  const normalizedRecordKeyHex = `0x${recordKey.toString('hex')}`;
  return Object.freeze({
    recordKeyHex: normalizedRecordKeyHex,
    currentPegInProfileStorageKeyHex: PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
    currentCausalProfileStorageKeyHex:
      PEG_IN_CAUSAL_CURRENT_PROFILE_STORAGE_KEY_V2_HEX,
    causalEnforcementStorageKeyHex:
      PEG_IN_CAUSAL_ENFORCEMENT_STORAGE_KEY_V2_HEX,
    pendingKeysStorageKeyHex: PEG_IN_CAUSAL_PENDING_KEYS_STORAGE_KEY_V2_HEX,
    pendingAdmissionStorageKeyHex: deriveBlake2_128ConcatMapKey(
      PEG_IN_CAUSAL_PENDING_MAP_PREFIX_V2_HEX,
      recordKey,
    ),
    processedRecordStorageKeyHex: deriveBlake2_128ConcatMapKey(
      PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX,
      recordKey,
    ),
    consumedAdmissionStorageKeyHex: deriveBlake2_128ConcatMapKey(
      PEG_IN_CAUSAL_CONSUMED_MAP_PREFIX_V3_HEX,
      recordKey,
    ),
  });
}

export function derivePegInCausalPendingAdmissionStorageKeyV2(
  recordKeyHex: string,
): string {
  return deriveBlake2_128ConcatMapKey(
    PEG_IN_CAUSAL_PENDING_MAP_PREFIX_V2_HEX,
    fixedHexBytes(recordKeyHex, 32, 'causal peg-in pending record key'),
  );
}

/** Decode the exact bounded SCALE `BoundedVec<H256>` used by the pinned runtime. */
export function decodePegInCausalPendingRecordKeysScaleV2(
  scaleHex: string,
): readonly string[] {
  if (typeof scaleHex !== 'string' || !/^0x[0-9a-f]+$/.test(scaleHex)) {
    throw new Error('causal peg-in pending-key list must be lowercase 0x-prefixed hex');
  }
  const bytes = Buffer.from(scaleHex.slice(2), 'hex');
  if (bytes.length === 0 || scaleHex.length % 2 !== 0) {
    throw new Error('causal peg-in pending-key list must contain whole SCALE bytes');
  }
  const { value: count, bytesRead } = decodeCanonicalCompactLength(bytes);
  if (count > MAX_PEG_IN_CAUSAL_PENDING_KEYS_V2) {
    throw new Error(
      `causal peg-in pending-key list exceeds ${MAX_PEG_IN_CAUSAL_PENDING_KEYS_V2} entries`,
    );
  }
  const expectedBytes = bytesRead + count * 32;
  if (bytes.length !== expectedBytes) {
    throw new Error('causal peg-in pending-key list has malformed SCALE length');
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const start = bytesRead + index * 32;
    const key = `0x${bytes.subarray(start, start + 32).toString('hex')}`;
    if (/^0x0{64}$/.test(key)) {
      throw new Error('causal peg-in pending-key list contains the zero key');
    }
    if (seen.has(key)) {
      throw new Error('causal peg-in pending-key list contains a duplicate key');
    }
    seen.add(key);
    keys.push(key);
  }
  return Object.freeze(keys);
}

function deriveBlake2_128ConcatMapKey(prefixHex: string, key: Buffer): string {
  const prefix = fixedHexBytes(prefixHex, 32, 'causal peg-in storage-map prefix');
  return `0x${Buffer.concat([
    prefix,
    Buffer.from(blakejs.blake2b(key, undefined, 16)),
    key,
  ]).toString('hex')}`;
}

function decodeCanonicalCompactLength(bytes: Buffer): { value: number; bytesRead: number } {
  const mode = bytes[0] & 0b11;
  if (mode === 0) {
    return { value: bytes[0] >>> 2, bytesRead: 1 };
  }
  if (mode === 1) {
    if (bytes.length < 2) {
      throw new Error('causal peg-in pending-key list has a truncated SCALE length');
    }
    const value = bytes.readUInt16LE(0) >>> 2;
    if (value < 1 << 6) {
      throw new Error('causal peg-in pending-key list has a noncanonical SCALE length');
    }
    return { value, bytesRead: 2 };
  }
  if (mode === 2) {
    if (bytes.length < 4) {
      throw new Error('causal peg-in pending-key list has a truncated SCALE length');
    }
    const value = bytes.readUInt32LE(0) >>> 2;
    if (value < 1 << 14) {
      throw new Error('causal peg-in pending-key list has a noncanonical SCALE length');
    }
    return { value, bytesRead: 4 };
  }
  throw new Error('causal peg-in pending-key list uses an unsupported SCALE length');
}

function fixedHexBytes(value: string, bytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed ${bytes}-byte value`);
  }
  return Buffer.from(value.slice(2), 'hex');
}
