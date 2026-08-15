import { AddressType } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { createHash } from 'crypto';

import {
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import { parseStrictJson, sha256CanonicalJson } from './strict-json.js';

export const PEG_IN_ROUTE_MANIFEST_SCHEMA = 'ergo.bridge.peg-in-route-manifest.v1' as const;
export const PEG_IN_ROUTE_MANIFEST_KIND = 'committed-vault-route-manifest' as const;
export const PEG_IN_ROUTE_MANIFEST_DIGEST_DOMAIN =
  'ERGO-BRIDGE-PEG-IN-ROUTE-MANIFEST-V1' as const;
export const PEG_IN_ROUTE_MIN_COMMIT_CONFIRMATIONS = 10;
export const PEG_IN_ROUTE_MIN_ANCHOR_DEPTH = 10;
export const PEG_IN_ROUTE_MAX_ANCHOR_AGE_BLOCKS = 720;
export const PEG_IN_ROUTE_NODE_NETWORKS = [
  'mainnet',
  'testnet',
  'local',
  'development',
  'devnet',
] as const;

export type PegInRouteNodeNetwork = typeof PEG_IN_ROUTE_NODE_NETWORKS[number];

export interface PegInRouteScriptBinding {
  address: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
}

export interface PegInRouteManifestV1 {
  schemaVersion: typeof PEG_IN_ROUTE_MANIFEST_SCHEMA;
  kind: typeof PEG_IN_ROUTE_MANIFEST_KIND;
  manifestId: string;
  network: {
    id: string;
    nodeInfoNetwork: PegInRouteNodeNetwork;
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
    mode: 'complete_active_and_historical_main-chain-lock_route_set';
    declaredLegacyCount: number;
    cutoff: {
      event: 'committed_vault_v3_route_declared';
      sourceRevision: string;
    };
    basis: Array<{
      reference: string;
      sha256Hex: string;
    }>;
  };
  route: {
    profile: 'committed-vault-v3';
    commitConfirmations: number;
    committee: {
      publicKeysHex: string[];
      threshold: number;
    };
    mainChainLock: PegInRouteScriptBinding & {
      scriptRole: 'refundable-deposit-staging';
      source: {
        reference: 'contracts/MainChainLock.es';
        templateSha256Hex: string;
        resolvedSha256Hex: string;
      };
    };
    settlementVault: PegInRouteScriptBinding & {
      scriptRole: 'configured-settlement-vault';
      profileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility';
      source: {
        reference: 'contracts/MainChainAggregateUnlockTrustless.es';
        templateSha256Hex: string;
        resolvedSha256Hex: string;
        trackerNftIdHex: string;
        duplicatePreventionNftIdHex: string;
      };
    };
  };
  legacyMainChainLocks: Array<PegInRouteScriptBinding & {
    ordinal: number;
    scriptRole: 'legacy-refundable-deposit-staging';
    version: string;
  }>;
}

export function parsePegInRouteManifestSource(source: string): PegInRouteManifestV1 {
  return validatePegInRouteManifest(parseStrictJson(source, 'peg-in route manifest'));
}

export function validatePegInRouteManifest(value: unknown): PegInRouteManifestV1 {
  const root = exactObject(value, [
    'schemaVersion',
    'kind',
    'manifestId',
    'network',
    'coverage',
    'route',
    'legacyMainChainLocks',
  ], 'peg-in route manifest');
  literal(root.schemaVersion, PEG_IN_ROUTE_MANIFEST_SCHEMA, 'manifest schemaVersion');
  literal(root.kind, PEG_IN_ROUTE_MANIFEST_KIND, 'manifest kind');
  const manifestId = slug(root.manifestId, 'manifestId');

  const networkRaw = exactObject(root.network, [
    'id',
    'nodeInfoNetwork',
    'addressNetworkPrefix',
    'p2sAddressHeader',
    'anchorHeader',
  ], 'manifest network');
  const nodeInfoNetwork = oneOfString(
    networkRaw.nodeInfoNetwork,
    PEG_IN_ROUTE_NODE_NETWORKS,
    'network.nodeInfoNetwork',
  );
  const networkId = slug(networkRaw.id, 'network.id');
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
  const expectedPrefix = nodeInfoNetwork === 'mainnet' ? 0 : 16;
  if (addressNetworkPrefix !== expectedPrefix) {
    throw new Error('network address prefix must be 0 for mainnet and 16 otherwise');
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
  if (minimumDepth < PEG_IN_ROUTE_MIN_ANCHOR_DEPTH) {
    throw new Error(
      `network.anchorHeader.minimumDepth must be at least ${PEG_IN_ROUTE_MIN_ANCHOR_DEPTH}`,
    );
  }
  if (maximumAgeBlocks > PEG_IN_ROUTE_MAX_ANCHOR_AGE_BLOCKS) {
    throw new Error('network.anchorHeader.maximumAgeBlocks exceeds the V1 freshness bound');
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

  const coverageRaw = exactObject(
    root.coverage,
    ['mode', 'declaredLegacyCount', 'cutoff', 'basis'],
    'manifest coverage',
  );
  literal(
    coverageRaw.mode,
    'complete_active_and_historical_main-chain-lock_route_set',
    'coverage.mode',
  );
  const declaredLegacyCount = nonnegativeSafeInteger(
    coverageRaw.declaredLegacyCount,
    'coverage.declaredLegacyCount',
  );
  const cutoffRaw = exactObject(
    coverageRaw.cutoff,
    ['event', 'sourceRevision'],
    'coverage.cutoff',
  );
  literal(
    cutoffRaw.event,
    'committed_vault_v3_route_declared',
    'coverage.cutoff.event',
  );
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

  const routeRaw = exactObject(
    root.route,
    ['profile', 'commitConfirmations', 'committee', 'mainChainLock', 'settlementVault'],
    'manifest route',
  );
  literal(routeRaw.profile, 'committed-vault-v3', 'route.profile');
  const commitConfirmations = positiveSafeInteger(
    routeRaw.commitConfirmations,
    'route.commitConfirmations',
  );
  if (commitConfirmations < PEG_IN_ROUTE_MIN_COMMIT_CONFIRMATIONS) {
    throw new Error(
      `route.commitConfirmations must be at least ${PEG_IN_ROUTE_MIN_COMMIT_CONFIRMATIONS}`,
    );
  }
  const committeeRaw = exactObject(
    routeRaw.committee,
    ['publicKeysHex', 'threshold'],
    'route.committee',
  );
  const publicKeysRaw = arrayValue(committeeRaw.publicKeysHex, 'route.committee.publicKeysHex');
  const publicKeysHex = publicKeysRaw.map((key, index) =>
    fixedLowerHex(key, 33, `route.committee.publicKeysHex[${index}]`));
  const threshold = positiveSafeInteger(committeeRaw.threshold, 'route.committee.threshold');
  const committee = createCommitteeConfig(publicKeysHex, String(threshold));
  if (
    committee.threshold !== String(threshold)
    || JSON.stringify(committee.pubKeyHexes) !== JSON.stringify(publicKeysHex)
  ) {
    throw new Error('route.committee must use canonical ordered keys and threshold');
  }

  const mainChainLockRaw = exactObject(routeRaw.mainChainLock, [
    'scriptRole',
    'address',
    'ergoTreeHex',
    'ergoTreeSha256Hex',
    'source',
  ], 'route.mainChainLock');
  literal(
    mainChainLockRaw.scriptRole,
    'refundable-deposit-staging',
    'route.mainChainLock.scriptRole',
  );
  const mainChainLock = validateScriptBinding(
    mainChainLockRaw,
    addressNetworkPrefix,
    'route.mainChainLock',
  );
  const sourceRaw = exactObject(
    mainChainLockRaw.source,
    ['reference', 'templateSha256Hex', 'resolvedSha256Hex'],
    'route.mainChainLock.source',
  );
  literal(
    sourceRaw.reference,
    'contracts/MainChainLock.es',
    'route.mainChainLock.source.reference',
  );
  const sourceBinding = {
    reference: 'contracts/MainChainLock.es' as const,
    templateSha256Hex: fixedLowerHex(
      sourceRaw.templateSha256Hex,
      32,
      'route.mainChainLock.source.templateSha256Hex',
    ),
    resolvedSha256Hex: fixedLowerHex(
      sourceRaw.resolvedSha256Hex,
      32,
      'route.mainChainLock.source.resolvedSha256Hex',
    ),
  };

  const settlementVaultRaw = exactObject(routeRaw.settlementVault, [
    'scriptRole',
    'profileId',
    'address',
    'ergoTreeHex',
    'ergoTreeSha256Hex',
    'source',
  ], 'route.settlementVault');
  literal(
    settlementVaultRaw.scriptRole,
    'configured-settlement-vault',
    'route.settlementVault.scriptRole',
  );
  literal(
    settlementVaultRaw.profileId,
    'main-chain-aggregate-unlock-trustless-v1-compatibility',
    'route.settlementVault.profileId',
  );
  const settlementVault = validateScriptBinding(
    settlementVaultRaw,
    addressNetworkPrefix,
    'route.settlementVault',
  );
  const settlementVaultSourceRaw = exactObject(
    settlementVaultRaw.source,
    [
      'reference',
      'templateSha256Hex',
      'resolvedSha256Hex',
      'trackerNftIdHex',
      'duplicatePreventionNftIdHex',
    ],
    'route.settlementVault.source',
  );
  literal(
    settlementVaultSourceRaw.reference,
    'contracts/MainChainAggregateUnlockTrustless.es',
    'route.settlementVault.source.reference',
  );
  const trackerNftIdHex = fixedLowerHex(
    settlementVaultSourceRaw.trackerNftIdHex,
    32,
    'route.settlementVault.source.trackerNftIdHex',
  );
  const duplicatePreventionNftIdHex = fixedLowerHex(
    settlementVaultSourceRaw.duplicatePreventionNftIdHex,
    32,
    'route.settlementVault.source.duplicatePreventionNftIdHex',
  );
  if (trackerNftIdHex === duplicatePreventionNftIdHex) {
    throw new Error('settlement-vault tracker and duplicate-prevention NFT IDs must differ');
  }
  const settlementVaultSource = {
    reference: 'contracts/MainChainAggregateUnlockTrustless.es' as const,
    templateSha256Hex: fixedLowerHex(
      settlementVaultSourceRaw.templateSha256Hex,
      32,
      'route.settlementVault.source.templateSha256Hex',
    ),
    resolvedSha256Hex: fixedLowerHex(
      settlementVaultSourceRaw.resolvedSha256Hex,
      32,
      'route.settlementVault.source.resolvedSha256Hex',
    ),
    trackerNftIdHex,
    duplicatePreventionNftIdHex,
  };

  const legacyRaw = arrayValue(root.legacyMainChainLocks, 'legacyMainChainLocks');
  if (legacyRaw.length !== declaredLegacyCount) {
    throw new Error('coverage.declaredLegacyCount must equal legacyMainChainLocks length');
  }
  const legacyMainChainLocks = legacyRaw.map((item, index) => {
    const raw = exactObject(item, [
      'ordinal',
      'scriptRole',
      'version',
      'address',
      'ergoTreeHex',
      'ergoTreeSha256Hex',
    ], `legacyMainChainLocks[${index}]`);
    const ordinal = nonnegativeSafeInteger(raw.ordinal, `legacyMainChainLocks[${index}].ordinal`);
    if (ordinal !== index) {
      throw new Error(`legacyMainChainLocks[${index}].ordinal must equal ${index}`);
    }
    literal(
      raw.scriptRole,
      'legacy-refundable-deposit-staging',
      `legacyMainChainLocks[${index}].scriptRole`,
    );
    const version = slug(raw.version, `legacyMainChainLocks[${index}].version`);
    return {
      ordinal,
      scriptRole: 'legacy-refundable-deposit-staging' as const,
      version,
      ...validateScriptBinding(raw, addressNetworkPrefix, `legacyMainChainLocks[${index}]`),
    };
  });
  assertSortedUnique(
    legacyMainChainLocks.map(entry => entry.address),
    'legacy MainChainLock addresses',
  );
  assertUnique(
    legacyMainChainLocks.map(entry => entry.ergoTreeHex),
    'legacy MainChainLock ErgoTrees',
  );

  const allAddresses = [
    mainChainLock.address,
    settlementVault.address,
    ...legacyMainChainLocks.map(entry => entry.address),
  ];
  const allTrees = [
    mainChainLock.ergoTreeHex,
    settlementVault.ergoTreeHex,
    ...legacyMainChainLocks.map(entry => entry.ergoTreeHex),
  ];
  assertUnique(allAddresses, 'route script addresses');
  assertUnique(allTrees, 'route script ErgoTrees');

  return deepFreeze({
    schemaVersion: PEG_IN_ROUTE_MANIFEST_SCHEMA,
    kind: PEG_IN_ROUTE_MANIFEST_KIND,
    manifestId,
    network: {
      id: networkId,
      nodeInfoNetwork,
      addressNetworkPrefix,
      p2sAddressHeader,
      anchorHeader,
    },
    coverage: {
      mode: 'complete_active_and_historical_main-chain-lock_route_set',
      declaredLegacyCount,
      cutoff: {
        event: 'committed_vault_v3_route_declared',
        sourceRevision,
      },
      basis,
    },
    route: {
      profile: 'committed-vault-v3',
      commitConfirmations,
      committee: { publicKeysHex, threshold },
      mainChainLock: {
        scriptRole: 'refundable-deposit-staging',
        ...mainChainLock,
        source: sourceBinding,
      },
      settlementVault: {
        scriptRole: 'configured-settlement-vault',
        profileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility',
        ...settlementVault,
        source: settlementVaultSource,
      },
    },
    legacyMainChainLocks,
  });
}

export function pegInRouteManifestDigestHex(manifest: PegInRouteManifestV1): string {
  return sha256CanonicalJson(manifest, PEG_IN_ROUTE_MANIFEST_DIGEST_DOMAIN);
}

export function resolvePegInRouteMainChainLockSource(
  manifestValue: PegInRouteManifestV1,
  templateSource: string,
): string {
  const manifest = validatePegInRouteManifest(manifestValue);
  if (typeof templateSource !== 'string' || templateSource.length === 0) {
    throw new Error('MainChainLock template source must not be empty');
  }
  if (sha256Utf8(templateSource) !== manifest.route.mainChainLock.source.templateSha256Hex) {
    throw new Error('MainChainLock template SHA-256 does not match the manifest');
  }
  requireOccurrence(templateSource, 'COMMITTEE_SIGMAPROP_PLACEHOLDERS', 1, 'MainChainLock template');
  requireOccurrence(templateSource, 'COMMITTEE_THRESHOLD_PLACEHOLDER', 1, 'MainChainLock template');
  requireOccurrence(
    templateSource,
    'SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER',
    1,
    'MainChainLock template',
  );
  const committee = createCommitteeConfig(
    manifest.route.committee.publicKeysHex,
    String(manifest.route.committee.threshold),
  );
  const resolved = injectCommitteePlaceholders(templateSource, committee).replaceAll(
    'SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER',
    manifest.route.settlementVault.ergoTreeHex,
  );
  if (/\b(?:COMMITTEE_[A-Z0-9_]+|SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER)\b/.test(resolved)) {
    throw new Error('resolved MainChainLock source still contains a compile-time placeholder');
  }
  if (sha256Utf8(resolved) !== manifest.route.mainChainLock.source.resolvedSha256Hex) {
    throw new Error('resolved MainChainLock source SHA-256 does not match the manifest');
  }
  return resolved;
}

export function resolvePegInRouteSettlementVaultSource(
  manifestValue: PegInRouteManifestV1,
  templateSource: string,
): string {
  const manifest = validatePegInRouteManifest(manifestValue);
  if (typeof templateSource !== 'string' || templateSource.length === 0) {
    throw new Error('settlement-vault template source must not be empty');
  }
  const binding = manifest.route.settlementVault.source;
  if (sha256Utf8(templateSource) !== binding.templateSha256Hex) {
    throw new Error('settlement-vault template SHA-256 does not match the manifest');
  }
  requireOccurrence(
    templateSource,
    'TRACKER_NFT_ID_PLACEHOLDER',
    1,
    'settlement-vault template',
  );
  requireOccurrence(
    templateSource,
    'DUP_NFT_ID_PLACEHOLDER',
    1,
    'settlement-vault template',
  );
  const resolved = templateSource
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', binding.trackerNftIdHex)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', binding.duplicatePreventionNftIdHex);
  if (/\b[A-Z0-9_]+_PLACEHOLDER\b/.test(resolved)) {
    throw new Error('resolved settlement-vault source still contains a compile-time placeholder');
  }
  if (sha256Utf8(resolved) !== binding.resolvedSha256Hex) {
    throw new Error('resolved settlement-vault source SHA-256 does not match the manifest');
  }
  return resolved;
}

export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateScriptBinding(
  value: Record<string, unknown>,
  networkPrefix: 0 | 16,
  label: string,
): PegInRouteScriptBinding {
  const address = base58Address(value.address, `${label}.address`);
  const ergoTreeHex = variableLowerHex(value.ergoTreeHex, `${label}.ergoTreeHex`);
  const ergoTreeSha256Hex = fixedLowerHex(
    value.ergoTreeSha256Hex,
    32,
    `${label}.ergoTreeSha256Hex`,
  );
  if (sha256HexBytes(ergoTreeHex) !== ergoTreeSha256Hex) {
    throw new Error(`${label}.ergoTreeSha256Hex does not match ergoTreeHex`);
  }
  let decoded: ErgoAddress;
  try {
    decoded = ErgoAddress.fromBase58(address);
  } catch {
    throw new Error(`${label}.address must be a valid Ergo address`);
  }
  if (Number(decoded.network) !== networkPrefix) {
    throw new Error(`${label}.address network does not match the manifest`);
  }
  if (Number(decoded.type) !== AddressType.P2S) {
    throw new Error(`${label}.address must be P2S`);
  }
  if (decoded.ergoTree.toLowerCase() !== ergoTreeHex) {
    throw new Error(`${label}.address does not encode ergoTreeHex`);
  }
  return { address, ergoTreeHex, ergoTreeSha256Hex };
}

function requireOccurrence(
  source: string,
  token: string,
  expected: number,
  label: string,
): void {
  const count = source.split(token).length - 1;
  if (count !== expected) {
    throw new Error(`${label} must contain ${expected} occurrence of ${token}`);
  }
}

function sha256HexBytes(hexValue: string): string {
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

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return value;
}

function variableLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 2
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase even-length hex`);
  }
  return value;
}

function oneOfString<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T[number];
}

function oneOfInteger<T extends readonly number[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (!Number.isSafeInteger(value) || !allowed.includes(Number(value) as T[number])) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return Number(value) as T[number];
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function assertSortedUnique(values: string[], label: string): void {
  const sorted = [...values].sort();
  if (JSON.stringify(values) !== JSON.stringify(sorted)) {
    throw new Error(`${label} must be sorted lexicographically`);
  }
  assertUnique(values, label);
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
