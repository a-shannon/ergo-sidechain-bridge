import { AddressType } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { createHash } from 'crypto';

import { parseStrictJson, sha256CanonicalJson } from './strict-json.js';

export const LEGACY_MCU_CUTOVER_MANIFEST_SCHEMA = 'ergo.bridge.legacy-mcu-manifest.v1' as const;
export const LEGACY_MCU_CUTOVER_MANIFEST_KIND = 'legacy-mcu-address-script-manifest' as const;
export const LEGACY_MCU_CUTOVER_MANIFEST_DIGEST_DOMAIN =
  'ERGO-BRIDGE-LEGACY-MCU-CUTOVER-MANIFEST-V1' as const;
export const LEGACY_MCU_CUTOVER_MIN_ANCHOR_DEPTH = 10;
export const LEGACY_MCU_CUTOVER_MAX_ANCHOR_AGE_BLOCKS = 720;
export const LEGACY_MCU_NODE_NETWORKS = [
  'mainnet',
  'testnet',
  'local',
  'development',
  'devnet',
] as const;

export type LegacyMcuNodeNetwork = typeof LEGACY_MCU_NODE_NETWORKS[number];

export interface LegacyMcuCutoverManifestV1 {
  schemaVersion: typeof LEGACY_MCU_CUTOVER_MANIFEST_SCHEMA;
  kind: typeof LEGACY_MCU_CUTOVER_MANIFEST_KIND;
  manifestId: string;
  network: {
    id: string;
    nodeInfoNetwork: LegacyMcuNodeNetwork;
    addressNetworkPrefix: 0 | 16;
    p2sAddressHeader: 3 | 19;
    anchorHeader: {
      height: number;
      idHex: string;
      minimumDepth: number;
      maximumAgeBlocks: number;
    };
  };
  coverage: {
    mode: 'complete_historical_v1_mcu_address_script_set';
    declaredEntryCount: number;
    cutoff: {
      event: 'legacy_mcu_creation_disabled';
      sourceRevision: string;
    };
    basis: Array<{
      reference: string;
      sha256Hex: string;
    }>;
  };
  entries: Array<{
    ordinal: number;
    scriptRole: 'legacy-mcu-v1';
    address: string;
    addressHeader: 3 | 19;
    ergoTreeHex: string;
    ergoTreeSha256Hex: string;
  }>;
}

export function parseLegacyMcuCutoverManifestSource(
  source: string,
): LegacyMcuCutoverManifestV1 {
  return validateLegacyMcuCutoverManifest(parseStrictJson(source, 'legacy MCU cutover manifest'));
}

export function validateLegacyMcuCutoverManifest(
  value: unknown,
): LegacyMcuCutoverManifestV1 {
  const root = exactObject(value, [
    'schemaVersion',
    'kind',
    'manifestId',
    'network',
    'coverage',
    'entries',
  ], 'legacy MCU cutover manifest');
  literal(root.schemaVersion, LEGACY_MCU_CUTOVER_MANIFEST_SCHEMA, 'manifest schemaVersion');
  literal(root.kind, LEGACY_MCU_CUTOVER_MANIFEST_KIND, 'manifest kind');
  const manifestId = slug(root.manifestId, 'manifestId');

  const networkRaw = exactObject(root.network, [
    'id',
    'nodeInfoNetwork',
    'addressNetworkPrefix',
    'p2sAddressHeader',
    'anchorHeader',
  ], 'manifest network');
  const networkId = slug(networkRaw.id, 'network.id');
  const nodeInfoNetwork = oneOfString(
    networkRaw.nodeInfoNetwork,
    LEGACY_MCU_NODE_NETWORKS,
    'network.nodeInfoNetwork',
  );
  if (networkId !== `ergo-${nodeInfoNetwork}`) {
    throw new Error('network.id must equal ergo-<nodeInfoNetwork>');
  }
  const addressNetworkPrefix = oneOfInteger(
    networkRaw.addressNetworkPrefix,
    [0, 16] as const,
    'network.addressNetworkPrefix',
  );
  const p2sAddressHeader = oneOfInteger(
    networkRaw.p2sAddressHeader,
    [3, 19] as const,
    'network.p2sAddressHeader',
  );
  if (p2sAddressHeader !== addressNetworkPrefix + AddressType.P2S) {
    throw new Error('network.p2sAddressHeader must equal addressNetworkPrefix + P2S type');
  }
  const expectedNetworkPrefix = nodeInfoNetwork === 'mainnet' ? 0 : 16;
  if (addressNetworkPrefix !== expectedNetworkPrefix) {
    throw new Error(
      'network address prefix must be 0 for mainnet and 16 for non-mainnet networks',
    );
  }
  const anchorRaw = exactObject(
    networkRaw.anchorHeader,
    ['height', 'idHex', 'minimumDepth', 'maximumAgeBlocks'],
    'network.anchorHeader',
  );
  const minimumDepth = positiveSafeInteger(
    anchorRaw.minimumDepth,
    'network.anchorHeader.minimumDepth',
  );
  const maximumAgeBlocks = positiveSafeInteger(
    anchorRaw.maximumAgeBlocks,
    'network.anchorHeader.maximumAgeBlocks',
  );
  if (minimumDepth < LEGACY_MCU_CUTOVER_MIN_ANCHOR_DEPTH) {
    throw new Error(
      `network.anchorHeader.minimumDepth must be at least ${LEGACY_MCU_CUTOVER_MIN_ANCHOR_DEPTH}`,
    );
  }
  if (maximumAgeBlocks > LEGACY_MCU_CUTOVER_MAX_ANCHOR_AGE_BLOCKS) {
    throw new Error(
      'network.anchorHeader.maximumAgeBlocks exceeds the V1 freshness bound',
    );
  }
  if (maximumAgeBlocks < minimumDepth) {
    throw new Error('network.anchorHeader.maximumAgeBlocks must be at least minimumDepth');
  }
  const anchorHeader = {
    height: nonnegativeSafeInteger(anchorRaw.height, 'network.anchorHeader.height'),
    idHex: fixedLowerHex(anchorRaw.idHex, 32, 'network.anchorHeader.idHex'),
    minimumDepth,
    maximumAgeBlocks,
  };

  const coverageRaw = exactObject(root.coverage, [
    'mode',
    'declaredEntryCount',
    'cutoff',
    'basis',
  ], 'manifest coverage');
  literal(
    coverageRaw.mode,
    'complete_historical_v1_mcu_address_script_set',
    'coverage.mode',
  );
  const declaredEntryCount = positiveSafeInteger(
    coverageRaw.declaredEntryCount,
    'coverage.declaredEntryCount',
  );
  const cutoffRaw = exactObject(
    coverageRaw.cutoff,
    ['event', 'sourceRevision'],
    'coverage.cutoff',
  );
  literal(cutoffRaw.event, 'legacy_mcu_creation_disabled', 'coverage.cutoff.event');
  const sourceRevision = fixedLowerHex(
    cutoffRaw.sourceRevision,
    20,
    'coverage.cutoff.sourceRevision',
  );
  const basisRaw = arrayValue(coverageRaw.basis, 'coverage.basis');
  if (basisRaw.length === 0) throw new Error('coverage.basis must not be empty');
  const basis = basisRaw.map((item, index) => {
    const raw = exactObject(item, ['reference', 'sha256Hex'], `coverage.basis[${index}]`);
    return {
      reference: boundedText(raw.reference, 1, 512, `coverage.basis[${index}].reference`),
      sha256Hex: fixedLowerHex(raw.sha256Hex, 32, `coverage.basis[${index}].sha256Hex`),
    };
  });
  assertSortedUnique(basis.map(item => item.reference), 'coverage.basis references');

  const entriesRaw = arrayValue(root.entries, 'manifest entries');
  if (entriesRaw.length !== declaredEntryCount) {
    throw new Error('coverage.declaredEntryCount must equal manifest entries length');
  }
  const entries = entriesRaw.map((item, index) => {
    const raw = exactObject(item, [
      'ordinal',
      'scriptRole',
      'address',
      'addressHeader',
      'ergoTreeHex',
      'ergoTreeSha256Hex',
    ], `entries[${index}]`);
    const ordinal = nonnegativeSafeInteger(raw.ordinal, `entries[${index}].ordinal`);
    if (ordinal !== index) throw new Error(`entries[${index}].ordinal must equal ${index}`);
    literal(raw.scriptRole, 'legacy-mcu-v1', `entries[${index}].scriptRole`);
    const address = base58Address(raw.address, `entries[${index}].address`);
    const addressHeader = oneOfInteger(
      raw.addressHeader,
      [3, 19] as const,
      `entries[${index}].addressHeader`,
    );
    if (addressHeader !== p2sAddressHeader) {
      throw new Error(`entries[${index}].addressHeader must match network.p2sAddressHeader`);
    }
    const ergoTreeHex = variableLowerHex(raw.ergoTreeHex, `entries[${index}].ergoTreeHex`);
    const ergoTreeSha256Hex = fixedLowerHex(
      raw.ergoTreeSha256Hex,
      32,
      `entries[${index}].ergoTreeSha256Hex`,
    );
    if (sha256CanonicalBytes(ergoTreeHex) !== ergoTreeSha256Hex) {
      throw new Error(`entries[${index}].ergoTreeSha256Hex does not match ergoTreeHex`);
    }
    let decoded: ErgoAddress;
    try {
      decoded = ErgoAddress.fromBase58(address);
    } catch {
      throw new Error(`entries[${index}].address must be a valid Ergo address`);
    }
    if (Number(decoded.network) !== addressNetworkPrefix) {
      throw new Error(`entries[${index}].address network does not match the manifest`);
    }
    if (Number(decoded.type) !== AddressType.P2S) {
      throw new Error(`entries[${index}].address must be P2S`);
    }
    if (decoded.ergoTree.toLowerCase() !== ergoTreeHex) {
      throw new Error(`entries[${index}].address does not encode ergoTreeHex`);
    }
    return {
      ordinal,
      scriptRole: 'legacy-mcu-v1' as const,
      address,
      addressHeader,
      ergoTreeHex,
      ergoTreeSha256Hex,
    };
  });
  assertSortedUnique(entries.map(entry => entry.address), 'manifest entry addresses');
  assertUnique(entries.map(entry => entry.ergoTreeHex), 'manifest entry ErgoTrees');

  return deepFreeze({
    schemaVersion: LEGACY_MCU_CUTOVER_MANIFEST_SCHEMA,
    kind: LEGACY_MCU_CUTOVER_MANIFEST_KIND,
    manifestId,
    network: {
      id: networkId,
      nodeInfoNetwork,
      addressNetworkPrefix,
      p2sAddressHeader,
      anchorHeader,
    },
    coverage: {
      mode: 'complete_historical_v1_mcu_address_script_set',
      declaredEntryCount,
      cutoff: {
        event: 'legacy_mcu_creation_disabled',
        sourceRevision,
      },
      basis,
    },
    entries,
  });
}

export function legacyMcuCutoverManifestDigestHex(
  manifest: LegacyMcuCutoverManifestV1,
): string {
  return sha256CanonicalJson(manifest, LEGACY_MCU_CUTOVER_MANIFEST_DIGEST_DOMAIN);
}

function sha256CanonicalBytes(hexValue: string): string {
  return createHash('sha256').update(Buffer.from(hexValue, 'hex')).digest('hex');
}

function exactObject(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields must be exactly ${expected.join(', ')}`);
  }
  return record;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function literal<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must equal ${expected}`);
  return expected;
}

function slug(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a lowercase identifier`);
  }
  return value;
}

function boundedText(value: unknown, min: number, max: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < min
    || value.length > max
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} must contain ${min}-${max} printable characters`);
  }
  return value;
}

function base58Address(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > 256
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical base58 string`);
  }
  return value;
}

function variableLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 2
    || value.length > 16_384
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hex`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = nonnegativeSafeInteger(value, label);
  if (parsed === 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function oneOfInteger<T extends readonly number[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (!Number.isSafeInteger(value) || !allowed.includes(Number(value))) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return Number(value) as T[number];
}

function oneOfString<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T[number];
}

function assertSortedUnique(values: string[], label: string): void {
  assertUnique(values, label);
  if (JSON.stringify(values) !== JSON.stringify([...values].sort())) {
    throw new Error(`${label} must be lexically sorted`);
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
