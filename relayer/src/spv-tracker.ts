/**
 * SPV Tracker helpers for Phase 011a Schema B.
 *
 * Tracker key:
 *   blake2b256("E2S_SPV_V1" || sidechainId || sidechainHeight_8BE || sidechainHeaderHash)
 *
 * Tracker value:
 *   bridge_event_root(32) || ergoAnchorHeight_4BE(4)
 */

import blakejs from 'blakejs';
import {
  tracker_empty_digest,
  tracker_get_proof,
  tracker_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import { encodeAvlTreeRegister } from './ergo-encoding.js';

export const SPV_TRACKER_DOMAIN = 'E2S_SPV_V1';
export const SPV_TRACKER_KEY_LENGTH = 32;
export const SPV_TRACKER_VALUE_LENGTH = 36;
export const SPV_TRACKER_FLAGS = 0x07; // insert + update + remove; supports federated correction

export interface SpvTrackerIdentity {
  sidechainIdHex: string;
  sidechainHeight: number | bigint;
  sidechainHeaderHashHex: string;
}

export interface SpvTrackerEntry extends SpvTrackerIdentity {
  bridgeEventRootHex: string;
  ergoAnchorHeight: number;
}

export interface SpvTrackerHistoryEntry {
  key: string;
  value: string;
}

export interface SpvTrackerInsertProof {
  keyHex: string;
  valueHex: string;
  insertProofHex: string;
  newDigestHex: string;
}

export interface SpvTrackerGetProof {
  keyHex: string;
  valueHex: string;
  getProofHex: string;
  digestHex: string;
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function u64be(value: number | bigint): Buffer {
  const n = BigInt(value);
  if (n < 0n || n > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`sidechainHeight out of u64 range: ${value}`);
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(n);
  return out;
}

function u32be(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`ergoAnchorHeight out of u32 range: ${value}`);
  }
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

export function deriveSpvTrackerKey(identity: SpvTrackerIdentity): string {
  const sidechainId = Buffer.from(normalizeHex(identity.sidechainIdHex, 32, 'sidechainId'), 'hex');
  const sidechainHeaderHash = Buffer.from(
    normalizeHex(identity.sidechainHeaderHashHex, 32, 'sidechainHeaderHash'),
    'hex',
  );

  return blake2b256(Buffer.concat([
    Buffer.from(SPV_TRACKER_DOMAIN, 'ascii'),
    sidechainId,
    u64be(identity.sidechainHeight),
    sidechainHeaderHash,
  ])).toString('hex');
}

export function encodeSpvTrackerValue(entry: Pick<SpvTrackerEntry, 'bridgeEventRootHex' | 'ergoAnchorHeight'>): string {
  const eventRoot = Buffer.from(normalizeHex(entry.bridgeEventRootHex, 32, 'bridgeEventRoot'), 'hex');
  return Buffer.concat([eventRoot, u32be(entry.ergoAnchorHeight)]).toString('hex');
}

export function decodeSpvTrackerValue(valueHex: string): { bridgeEventRootHex: string; ergoAnchorHeight: number } {
  const clean = normalizeHex(valueHex, SPV_TRACKER_VALUE_LENGTH, 'tracker value');
  const buf = Buffer.from(clean, 'hex');
  return {
    bridgeEventRootHex: buf.subarray(0, 32).toString('hex'),
    ergoAnchorHeight: buf.readUInt32BE(32),
  };
}

export function toSpvTrackerHistoryEntry(entry: SpvTrackerEntry): SpvTrackerHistoryEntry {
  return {
    key: deriveSpvTrackerKey(entry),
    value: encodeSpvTrackerValue(entry),
  };
}

export function getEmptySpvTrackerDigest(): string {
  return tracker_empty_digest();
}

export function getSpvTrackerDigest(history: SpvTrackerHistoryEntry[]): string {
  if (history.length === 0) {
    return getEmptySpvTrackerDigest();
  }

  const result = JSON.parse(tracker_get_proof(JSON.stringify(history), history[0].key));
  return result.digest_hex;
}

export function encodeSpvTrackerAvlRegister(digestHex: string): string {
  return encodeAvlTreeRegister(Buffer.from(normalizeHex(digestHex, 33, 'tracker digest'), 'hex'), SPV_TRACKER_FLAGS, SPV_TRACKER_VALUE_LENGTH);
}

export function buildSpvTrackerInsertProof(
  history: SpvTrackerHistoryEntry[],
  entry: SpvTrackerEntry,
): SpvTrackerInsertProof {
  const keyHex = deriveSpvTrackerKey(entry);
  const valueHex = encodeSpvTrackerValue(entry);
  const result = JSON.parse(tracker_insert(JSON.stringify(history), keyHex, valueHex));
  return {
    keyHex,
    valueHex,
    insertProofHex: result.insert_proof_hex,
    newDigestHex: result.new_digest_hex,
  };
}

export function buildSpvTrackerGetProof(
  history: SpvTrackerHistoryEntry[],
  identity: SpvTrackerIdentity,
): SpvTrackerGetProof {
  const keyHex = deriveSpvTrackerKey(identity);
  const result = JSON.parse(tracker_get_proof(JSON.stringify(history), keyHex));
  return {
    keyHex,
    valueHex: result.value_hex,
    getProofHex: result.get_proof_hex,
    digestHex: result.digest_hex,
  };
}
