import type { ErgoExtensionField } from './ergo-client.js';
import type { SpvTrackerEntry, SpvTrackerIdentity } from './spv-tracker.js';

export const SIDECHAIN_EXTENSION_PREFIX = '04';
export const DEFAULT_SIDECHAIN_EXTENSION_KEY = '0401';

export interface SidechainAnchorField {
  key: string;
  bridgeEventRootHex: string;
  ergoAnchorHeight: number;
  headerId: string;
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

function normalizeAnchorHeight(height: number): number {
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error(`anchor height must be a non-negative integer, got ${height}`);
  }
  return height;
}

function normalizeExtensionKeyForFilter(key: string): string | undefined {
  try {
    return normalizeHex(key, 2, 'extension key');
  } catch {
    return undefined;
  }
}

export function normalizeSidechainAnchorField(
  field: ErgoExtensionField,
  expectedKey: string = DEFAULT_SIDECHAIN_EXTENSION_KEY,
): SidechainAnchorField {
  const key = normalizeHex(field.key, 2, 'extension key');
  const normalizedExpectedKey = normalizeHex(expectedKey, 2, 'expected extension key');
  if (!key.startsWith(SIDECHAIN_EXTENSION_PREFIX)) {
    throw new Error(`extension key must be in 0x04xx sidechain keyspace, got ${key}`);
  }
  if (key !== normalizedExpectedKey) {
    throw new Error(`unexpected sidechain extension key ${key}, expected ${normalizedExpectedKey}`);
  }

  return {
    key,
    bridgeEventRootHex: normalizeHex(field.value, 32, 'extension value'),
    ergoAnchorHeight: normalizeAnchorHeight(field.height),
    headerId: normalizeHex(field.headerId, 32, 'header ID'),
  };
}

export function findSidechainAnchorFields(
  fields: ErgoExtensionField[],
  expectedKey: string = DEFAULT_SIDECHAIN_EXTENSION_KEY,
): SidechainAnchorField[] {
  const normalizedExpectedKey = normalizeHex(expectedKey, 2, 'expected extension key');

  return fields
    .filter(field => normalizeExtensionKeyForFilter(field.key) === normalizedExpectedKey)
    .map(field => normalizeSidechainAnchorField(field, normalizedExpectedKey));
}

export function buildSpvTrackerEntryFromAnchor(
  anchor: SidechainAnchorField,
  identity: SpvTrackerIdentity,
): SpvTrackerEntry {
  return {
    ...identity,
    bridgeEventRootHex: anchor.bridgeEventRootHex,
    ergoAnchorHeight: anchor.ergoAnchorHeight,
  };
}
