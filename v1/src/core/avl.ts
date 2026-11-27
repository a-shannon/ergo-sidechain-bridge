import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, hexToBytes } from './codecs.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPkgPath = path.resolve(__dirname, '../../../wasm-avl/pkg/bridge_avl.js');

interface BridgeAvlWasm {
  empty_digest(): string;
  bridge_generate_proofs(historyKeysJson: string, newTxIdHex: string): string;
  pooled_reserve_empty_digest(): string;
  pooled_reserve_insert(historyJson: string, keyHex: string, valueHex: string): string;
  pooled_reserve_get_proof(historyJson: string, keyHex: string): string;
  pooled_reserve_verify_insert(
    currentDigestHex: string,
    keyHex: string,
    valueHex: string,
    insertProofHex: string,
  ): string;
  tracker_application_v2_empty_digest(): string;
  tracker_application_v2_insert(historyJson: string, keyHex: string, valueHex: string): string;
  tracker_application_v2_get_proof(historyJson: string, keyHex: string): string;
  tracker_application_v2_verify_insert(
    currentDigestHex: string,
    keyHex: string,
    valueHex: string,
    insertProofHex: string,
  ): string;
}

const wasm = require(wasmPkgPath) as BridgeAvlWasm;

export interface AvlEntry {
  key: string;
  value: string;
}

export interface DupProofResult {
  lookupProofHex: string;
  insertProofHex: string;
  newDigestHex: string;
}

export interface InsertProofResult {
  insertProofHex: string;
  newDigestHex: string;
}

export interface MembershipProofResult {
  getProofHex: string;
  digestHex: string;
}

// ============================================================================
// DUP AVL Tree (32-byte key -> 1-byte 0x01 value, insert-only)
// ============================================================================

export function dupEmptyDigestHex(): string {
  return wasm.empty_digest();
}

export function dupGenerateProofs(historyBurnIdsHex: string[], newBurnIdHex: string): DupProofResult {
  const raw = JSON.parse(
    wasm.bridge_generate_proofs(JSON.stringify(historyBurnIdsHex), newBurnIdHex),
  ) as {
    lookup_proof_hex: string;
    insert_proof_hex: string;
    new_digest_hex: string;
  };
  return {
    lookupProofHex: raw.lookup_proof_hex,
    insertProofHex: raw.insert_proof_hex,
    newDigestHex: raw.new_digest_hex,
  };
}

// ============================================================================
// Reserve Deposit AVL Tree (32-byte key -> 32-byte commitment, insert-only)
// ============================================================================

export function reserveEmptyDigestHex(): string {
  return wasm.pooled_reserve_empty_digest();
}

export function reserveInsertProof(
  history: AvlEntry[],
  newKeyHex: string,
  newValueHex: string,
): InsertProofResult {
  const raw = JSON.parse(
    wasm.pooled_reserve_insert(JSON.stringify(history), newKeyHex, newValueHex),
  ) as {
    insert_proof_hex: string;
    new_digest_hex: string;
  };
  return {
    insertProofHex: raw.insert_proof_hex,
    newDigestHex: raw.new_digest_hex,
  };
}

export function reserveGetProof(history: AvlEntry[], lookupKeyHex: string): MembershipProofResult {
  const raw = JSON.parse(
    wasm.pooled_reserve_get_proof(JSON.stringify(history), lookupKeyHex),
  ) as {
    get_proof_hex?: string;
    lookup_proof_hex?: string;
    digest_hex: string;
  };
  return {
    getProofHex: raw.get_proof_hex ?? raw.lookup_proof_hex ?? '',
    digestHex: raw.digest_hex,
  };
}

export function reserveVerifyInsert(
  currentDigestHex: string,
  keyHex: string,
  valueHex: string,
  insertProofHex: string,
): string {
  const raw = JSON.parse(
    wasm.pooled_reserve_verify_insert(currentDigestHex, keyHex, valueHex, insertProofHex),
  ) as { new_digest_hex: string };
  return raw.new_digest_hex;
}

// ============================================================================
// Unified Tracker AVL Tree (32-byte key -> 370-byte value, insert-only)
// ============================================================================

export function trackerEmptyDigestHex(): string {
  return wasm.tracker_application_v2_empty_digest();
}

export function trackerInsertProof(
  history: AvlEntry[],
  newKeyHex: string,
  newValueHex: string,
): InsertProofResult {
  const raw = JSON.parse(
    wasm.tracker_application_v2_insert(JSON.stringify(history), newKeyHex, newValueHex),
  ) as {
    insert_proof_hex: string;
    new_digest_hex: string;
  };
  return {
    insertProofHex: raw.insert_proof_hex,
    newDigestHex: raw.new_digest_hex,
  };
}

export function trackerGetProof(history: AvlEntry[], lookupKeyHex: string): MembershipProofResult {
  const raw = JSON.parse(
    wasm.tracker_application_v2_get_proof(JSON.stringify(history), lookupKeyHex),
  ) as {
    get_proof_hex?: string;
    lookup_proof_hex?: string;
    digest_hex: string;
  };
  return {
    getProofHex: raw.get_proof_hex ?? raw.lookup_proof_hex ?? '',
    digestHex: raw.digest_hex,
  };
}

export function trackerVerifyInsert(
  currentDigestHex: string,
  keyHex: string,
  valueHex: string,
  insertProofHex: string,
): string {
  const raw = JSON.parse(
    wasm.tracker_application_v2_verify_insert(currentDigestHex, keyHex, valueHex, insertProofHex),
  ) as { new_digest_hex: string };
  return raw.new_digest_hex;
}

// ============================================================================
// Sigma Constant Encoding Helpers (for EIP-12 / Node register serialization)
// ============================================================================

function encodeVlqUint(value: number): Uint8Array {
  const out: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v & 0x7f);
  return new Uint8Array(out);
}

function encodeZigZagInt(value: number): Uint8Array {
  const zz = ((value << 1) ^ (value >> 31)) >>> 0;
  return encodeVlqUint(zz);
}

function encodeZigZagLong(value: bigint): Uint8Array {
  const zz = (value << 1n) ^ (value >> 63n);
  const unsigned = BigInt.asUintN(64, zz);
  const out: number[] = [];
  let v = unsigned;
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v & 0x7fn));
  return new Uint8Array(out);
}

/** Sigma SColl(SByte) constant hex: 0x0e || vlq(len) || bytes */
export function sigmaCollByteHex(bytes: Uint8Array): string {
  const len = encodeVlqUint(bytes.length);
  const out = new Uint8Array(1 + len.length + bytes.length);
  out[0] = 0x0e;
  out.set(len, 1);
  out.set(bytes, 1 + len.length);
  return bytesToHex(out);
}

function decodeVlqUint(bytes: Uint8Array, startOffset: number): { value: number; nextOffset: number } {
  let value = 0;
  let shift = 0;
  let offset = startOffset;
  let terminated = false;
  while (offset < bytes.length) {
    if (shift > 28) {
      throw new Error('VLQ uint32 overflow');
    }
    const b = bytes[offset++];
    if (shift === 28 && b > 0x0f) {
      throw new Error('VLQ uint32 overflow');
    }
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      terminated = true;
      break;
    }
    shift += 7;
  }
  if (!terminated) {
    throw new Error('Unterminated VLQ integer');
  }
  return { value: value >>> 0, nextOffset: offset };
}

/** Decode Sigma SColl(SByte) constant hex back to raw bytes. */
export function decodeSigmaCollByteHex(sigmaHex: string): Uint8Array {
  const bytes = hexToBytes(sigmaHex);
  if (bytes.length < 2 || bytes[0] !== 0x0e) {
    throw new Error(`Expected SColl(SByte) prefix 0x0e, got 0x${bytes[0]?.toString(16)}`);
  }
  const { value: len, nextOffset } = decodeVlqUint(bytes, 1);
  if (nextOffset + len !== bytes.length) {
    throw new Error(`SColl(SByte) length mismatch: expected ${len}, got ${bytes.length - nextOffset}`);
  }
  return bytes.slice(nextOffset);
}

/** Sigma SInt constant hex: 0x04 || zigzag-vlq(value) */
export function sigmaIntHex(value: number): string {
  const enc = encodeZigZagInt(value);
  const out = new Uint8Array(1 + enc.length);
  out[0] = 0x04;
  out.set(enc, 1);
  return bytesToHex(out);
}

export function decodeSigmaIntHex(sigmaHex: string): number {
  const bytes = hexToBytes(sigmaHex);
  if (bytes.length < 2 || bytes[0] !== 0x04) {
    throw new Error('Expected SInt prefix 0x04');
  }
  const { value: v, nextOffset } = decodeVlqUint(bytes, 1);
  if (nextOffset !== bytes.length) {
    throw new Error('Trailing bytes after SInt VLQ payload');
  }
  return (v >>> 1) ^ -(v & 1);
}

/** Sigma SLong constant hex: 0x05 || zigzag-vlq(value) */
export function sigmaLongHex(value: bigint): string {
  const enc = encodeZigZagLong(value);
  const out = new Uint8Array(1 + enc.length);
  out[0] = 0x05;
  out.set(enc, 1);
  return bytesToHex(out);
}

export function decodeSigmaLongHex(sigmaHex: string): bigint {
  const bytes = hexToBytes(sigmaHex);
  if (bytes.length < 2 || bytes[0] !== 0x05) {
    throw new Error('Expected SLong prefix 0x05');
  }
  let v = 0n;
  let shift = 0n;
  let offset = 1;
  let terminated = false;
  while (offset < bytes.length) {
    if (shift > 63n) {
      throw new Error('VLQ uint64 overflow');
    }
    const b = bytes[offset++];
    if (shift === 63n && b > 0x01) {
      throw new Error('VLQ uint64 overflow');
    }
    v |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      terminated = true;
      break;
    }
    shift += 7n;
  }
  if (!terminated || offset !== bytes.length) {
    throw new Error('Invalid or unterminated SLong VLQ encoding');
  }
  return (v >> 1n) ^ -(v & 1n);
}

/**
 * Sigma SAvlTree constant hex (insert-only, keyLength=32, fixed valueLength):
 *   0x64 || digest(33) || flags(0x01) || vlq(32) || 0x01 || vlq(valueLength)
 */
export function sigmaAvlTreeHex(digestHex: string, valueLength: number): string {
  const digest = hexToBytes(digestHex, 33);
  const keyLen = encodeVlqUint(32);
  const valLen = encodeVlqUint(valueLength);
  const out = new Uint8Array(1 + 33 + 1 + keyLen.length + 1 + valLen.length);
  let pos = 0;
  out[pos++] = 0x64;
  out.set(digest, pos);
  pos += 33;
  out[pos++] = 0x01; // insert-only
  out.set(keyLen, pos);
  pos += keyLen.length;
  out[pos++] = 0x01; // Some(valueLength)
  out.set(valLen, pos);
  return bytesToHex(out);
}

export function decodeSigmaAvlTreeDigestHex(sigmaHex: string): string {
  const bytes = hexToBytes(sigmaHex);
  if (bytes.length < 36 || bytes[0] !== 0x64) {
    throw new Error(`Expected SAvlTree prefix 0x64`);
  }
  return bytesToHex(bytes.slice(1, 34));
}
