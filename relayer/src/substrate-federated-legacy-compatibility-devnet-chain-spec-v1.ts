import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';

import {
  assertDeploymentIdentityArtifactProfileProvenance,
  loadTrackedDeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import {
  assertNoDuplicateJsonKeys,
  parseStrictJson,
} from './strict-json.js';

export const SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_SCHEMA =
  'e2s.substrate-federated-legacy-compatibility-devnet-chain-spec.v1' as const;

const SPEC_NAME = 'Bridge Legacy Compatibility Target';
const SPEC_ID = 'bridge_legacy_compatibility';
const PROTOCOL_ID = 'bridge-legacy-compat';
export const SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_NAME =
  SPEC_NAME;
export const SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_ID =
  SPEC_ID;
export const SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_PROTOCOL_ID =
  PROTOCOL_ID;
const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;
const BRIDGE_STORAGE_LAYOUT_PATH =
  'solidity/compiled/ErgoBridge.storage-layout.json';
const TOKEN_STORAGE_LAYOUT_PATH =
  'solidity/compiled/SERG.storage-layout.json';
const RAW_JSON_NUMBER = Symbol('raw-json-number');

interface RawJsonNumber {
  readonly [RAW_JSON_NUMBER]: true;
  readonly source: string;
}

export interface BuildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Input {
  readonly bridgeRoot: string;
  readonly baseSpecBytes: Uint8Array;
  readonly expectedChainId: bigint;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly bridgeOwnerAddress: string;
}

export interface SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Report {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'isolated_legacy_owner_mint_compatibility_spec';
  readonly baseSpecSha256Hex: string;
  readonly chainSpecSha256Hex: string;
  readonly chainSpecBytes: number;
  readonly chain: Readonly<{
    readonly name: typeof SPEC_NAME;
    readonly id: typeof SPEC_ID;
    readonly protocolId: typeof PROTOCOL_ID;
    readonly chainType: 'Development';
    readonly chainId: string;
  }>;
  readonly application: Readonly<{
    readonly bridgeAddress: string;
    readonly tokenAddress: string;
    readonly bridgeOwnerAddress: string;
    readonly tokenOwnerAddress: string;
    readonly bridgeRuntimeByteLength: number;
    readonly bridgeRuntimeBytecodeSha256Hex: string;
    readonly tokenRuntimeByteLength: number;
    readonly tokenRuntimeBytecodeSha256Hex: string;
    readonly artifactProfileDigestHex: string;
    readonly buildManifestSha256Hex: string;
  }>;
  readonly checks: Readonly<{
    readonly trackedSolidityBuildClosureVerified: true;
    readonly trackedStorageLayoutsVerified: true;
    readonly bridgeTokenBindingInitialized: true;
    readonly tokenOwnerBindingInitialized: true;
    readonly bridgeOwnerInitialized: true;
    readonly applicationRuntimeCodeEmbeddedAtGenesis: true;
    readonly historicalOwnerMintRuntimeEmbedded: true;
    readonly emptyApplicationStateInitialized: true;
    readonly noBootnodesEmbedded: true;
    readonly telemetryDisabled: true;
  }>;
  readonly boundaries: Readonly<{
    readonly isolatedDevelopmentTargetOnly: true;
    readonly legacyOwnerMintAuthorityPresent: true;
    readonly federatedLaunchEligible: false;
    readonly federatedMintAuthorityEstablished: false;
    readonly sourceHistoryAuthenticated: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoHistoryAuthenticated: false;
    readonly launchStatementProduced: false;
    readonly sourceAttestationProduced: false;
    readonly transactionConstructed: false;
    readonly transactionSigned: false;
    readonly transactionSubmitted: false;
    readonly transactionBroadcast: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Result {
  readonly chainSpecBytes: Uint8Array;
  readonly report: Readonly<
    SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Report
  >;
}

export function buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1(
  input: Readonly<
    BuildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Input
  >,
): Readonly<SubstrateFederatedLegacyCompatibilityDevnetChainSpecV1Result> {
  const bridgeRoot = resolve(nonemptyString(input.bridgeRoot, 'bridge root'));
  const baseSpecBytes = boundedBytes(
    input.baseSpecBytes,
    'base Frontier chain spec',
  );
  const expectedChainId = positiveChainId(input.expectedChainId);
  if (expectedChainId === 1n) {
    throw new Error('isolated compatibility chain spec refuses chain ID 1');
  }
  const bridgeAddress = evmAddress(input.bridgeAddress, 'bridge address');
  const tokenAddress = evmAddress(input.tokenAddress, 'token address');
  const bridgeOwnerAddress = evmAddress(
    input.bridgeOwnerAddress,
    'bridge owner address',
  );
  if (bridgeAddress === tokenAddress) {
    throw new Error('bridge and token addresses must be distinct');
  }

  const artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(
    bridgeRoot,
  );
  assertDeploymentIdentityArtifactProfileProvenance(artifactProfile);
  assertTrackedStorageLayouts(bridgeRoot);

  const baseSpec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(baseSpecBytes, 'base Frontier chain spec'),
      'base Frontier chain spec',
    ),
    'base Frontier chain spec',
  );
  const genesis = childRecord(baseSpec, 'genesis', 'base Frontier chain spec');
  const runtimeGenesis = childRecord(
    genesis,
    'runtimeGenesis',
    'base Frontier genesis',
  );
  const patch = childRecord(runtimeGenesis, 'patch', 'base runtime genesis');
  const evmChainId = childRecord(patch, 'evmChainId', 'base runtime patch');
  const baseChainId = positiveChainId(
    rawJsonUnsignedInteger(evmChainId.chainId, 'base EVM chain ID'),
  );
  if (baseChainId !== expectedChainId) {
    throw new Error('base Frontier chain ID differs from the explicit target');
  }
  if (baseSpec.chainType !== 'Development') {
    throw new Error('isolated compatibility target requires Development chain type');
  }
  const bootNodes = baseSpec.bootNodes;
  if (!Array.isArray(bootNodes) || bootNodes.length !== 0) {
    throw new Error('isolated compatibility base spec must contain no bootnodes');
  }
  if (baseSpec.telemetryEndpoints !== null) {
    throw new Error('isolated compatibility base spec must disable telemetry');
  }
  const evm = childRecord(patch, 'evm', 'base runtime patch');
  const accounts = childRecord(evm, 'accounts', 'base EVM genesis');
  assertAddressIsUnoccupied(accounts, bridgeAddress, 'bridge');
  assertAddressIsUnoccupied(accounts, tokenAddress, 'token');

  const bridgeStorage = {
    [storageSlot(0)]: addressWord(bridgeOwnerAddress),
    [storageSlot(3)]: addressWord(tokenAddress),
  };
  const tokenStorage = {
    [storageSlot(3)]: shortStringWord('Sidechain ERG'),
    [storageSlot(4)]: shortStringWord('sERG'),
    [storageSlot(5)]: addressWord(bridgeAddress),
  };
  accounts[bridgeAddress] = {
    balance: '0x0',
    code: runtimeBytes(artifactProfile.bridge.runtimeBytecodeHex),
    nonce: '0x1',
    storage: bridgeStorage,
  };
  accounts[tokenAddress] = {
    balance: '0x0',
    code: runtimeBytes(artifactProfile.token.runtimeBytecodeHex),
    nonce: '0x1',
    storage: tokenStorage,
  };
  evm.accounts = sortedRecord(accounts);
  baseSpec.name = SPEC_NAME;
  baseSpec.id = SPEC_ID;
  baseSpec.protocolId = PROTOCOL_ID;

  const chainSpecBytes = Buffer.from(
    stringifyJsonPreservingNumbers(baseSpec),
    'utf8',
  );
  const report = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_LEGACY_COMPATIBILITY_DEVNET_CHAIN_SPEC_V1_SCHEMA,
    version: 1 as const,
    status: 'isolated_legacy_owner_mint_compatibility_spec' as const,
    baseSpecSha256Hex: sha256(baseSpecBytes),
    chainSpecSha256Hex: sha256(chainSpecBytes),
    chainSpecBytes: chainSpecBytes.length,
    chain: Object.freeze({
      name: SPEC_NAME,
      id: SPEC_ID,
      protocolId: PROTOCOL_ID,
      chainType: 'Development' as const,
      chainId: expectedChainId.toString(),
    }),
    application: Object.freeze({
      bridgeAddress,
      tokenAddress,
      bridgeOwnerAddress,
      tokenOwnerAddress: bridgeAddress,
      bridgeRuntimeByteLength:
        artifactProfile.bridge.runtimeByteLength,
      bridgeRuntimeBytecodeSha256Hex:
        artifactProfile.bridge.runtimeBytecodeSha256Hex,
      tokenRuntimeByteLength: artifactProfile.token.runtimeByteLength,
      tokenRuntimeBytecodeSha256Hex:
        artifactProfile.token.runtimeBytecodeSha256Hex,
      artifactProfileDigestHex: artifactProfile.profileDigestHex,
      buildManifestSha256Hex: artifactProfile.buildManifestSha256Hex,
    }),
    checks: Object.freeze({
      trackedSolidityBuildClosureVerified: true as const,
      trackedStorageLayoutsVerified: true as const,
      bridgeTokenBindingInitialized: true as const,
      tokenOwnerBindingInitialized: true as const,
      bridgeOwnerInitialized: true as const,
      applicationRuntimeCodeEmbeddedAtGenesis: true as const,
      historicalOwnerMintRuntimeEmbedded: true as const,
      emptyApplicationStateInitialized: true as const,
      noBootnodesEmbedded: true as const,
      telemetryDisabled: true as const,
    }),
    boundaries: Object.freeze({
      isolatedDevelopmentTargetOnly: true as const,
      legacyOwnerMintAuthorityPresent: true as const,
      federatedLaunchEligible: false as const,
      federatedMintAuthorityEstablished: false as const,
      sourceHistoryAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoHistoryAuthenticated: false as const,
      launchStatementProduced: false as const,
      sourceAttestationProduced: false as const,
      transactionConstructed: false as const,
      transactionSigned: false as const,
      transactionSubmitted: false as const,
      transactionBroadcast: false as const,
      profileActivated: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  return Object.freeze({
    chainSpecBytes: Uint8Array.from(chainSpecBytes),
    report,
  });
}

export function assertTrackedStorageLayouts(bridgeRoot: string): void {
  const bridge = readLayout(bridgeRoot, BRIDGE_STORAGE_LAYOUT_PATH);
  const token = readLayout(bridgeRoot, TOKEN_STORAGE_LAYOUT_PATH);
  assertLayoutEntries(bridge, [
    ['_owner', '0', 0, 't_address'],
    ['sergToken', '3', 0, 't_address'],
    ['paused', '3', 20, 't_bool'],
  ], 'ErgoBridge');
  assertLayoutEntries(token, [
    ['_name', '3', 0, 't_string_storage'],
    ['_symbol', '4', 0, 't_string_storage'],
    ['_owner', '5', 0, 't_address'],
  ], 'SERG');
}

function readLayout(bridgeRoot: string, relativePath: string): unknown {
  const bytes = readFileSync(resolve(bridgeRoot, relativePath));
  return parseStrictJson(bytes.toString('utf8'), relativePath);
}

function assertLayoutEntries(
  raw: unknown,
  expected: readonly (readonly [string, string, number, string])[],
  label: string,
): void {
  const layout = record(raw, `${label} storage layout`);
  if (!Array.isArray(layout.storage)) {
    throw new Error(`${label} storage layout entries are missing`);
  }
  for (const [name, slot, offset, type] of expected) {
    const matches = layout.storage.filter(entry => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return false;
      }
      const value = entry as Record<string, unknown>;
      return value.label === name
        && value.slot === slot
        && value.offset === offset
        && value.type === type;
    });
    if (matches.length !== 1) {
      throw new Error(`${label} ${name} storage identity drifted`);
    }
  }
}

function assertAddressIsUnoccupied(
  accounts: Readonly<Record<string, unknown>>,
  address: string,
  label: string,
): void {
  const collisions = Object.keys(accounts).filter(
    key => key.toLowerCase() === address,
  );
  if (collisions.length !== 0) {
    throw new Error(`${label} address is already occupied in the base spec`);
  }
}

function runtimeBytes(hex: string): number[] {
  if (!/^0x[0-9a-f]+$/.test(hex) || (hex.length - 2) % 2 !== 0) {
    throw new Error('tracked runtime bytecode is not canonical lowercase hex');
  }
  return Array.from(Buffer.from(hex.slice(2), 'hex'));
}

function shortStringWord(value: string): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length === 0 || bytes.length > 31) {
    throw new Error('genesis short string is outside Solidity inline storage');
  }
  return `0x${bytes.toString('hex').padEnd(62, '0')}${(bytes.length * 2)
    .toString(16)
    .padStart(2, '0')}`;
}

function addressWord(value: string): string {
  return `0x${'0'.repeat(24)}${value.slice(2)}`;
}

function storageSlot(value: number): string {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function sortedRecord(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0),
  );
}

function boundedBytes(value: Uint8Array, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be bytes`);
  }
  if (value.byteLength === 0 || value.byteLength > MAX_BASE_SPEC_BYTES) {
    throw new Error(`${label} size is outside the bounded limit`);
  }
  return Uint8Array.from(value);
}

function evmAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 20-byte hex`);
  }
  if (/^0x0{40}$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function positiveChainId(value: bigint): bigint {
  if (typeof value !== 'bigint' || value <= 0n) {
    throw new Error('expected chain ID must be a positive bigint');
  }
  return value;
}

function rawJsonUnsignedInteger(value: unknown, label: string): bigint {
  if (!isRawJsonNumber(value) || !/^(?:0|[1-9][0-9]*)$/.test(value.source)) {
    throw new Error(`${label} must be a nonnegative JSON integer`);
  }
  return BigInt(value.source);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function childRecord(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Record<string, unknown> {
  return record(parent[key], `${label} ${key}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function strictUtf8(value: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label} must be canonical UTF-8`);
  }
}

export function parseStrictJsonPreservingNumbers(
  source: string,
  label: string,
): unknown {
  try {
    assertNoDuplicateJsonKeys(source);
    const validationParse = JSON.parse(source) as unknown;
    const marker = unusedNumberMarker(source, validationParse);
    const transformed = quoteJsonNumbers(source, marker);
    return JSON.parse(transformed, (_key, value: unknown) => {
      if (typeof value !== 'string' || !value.startsWith(marker)) return value;
      const numberSource = value.slice(marker.length);
      if (!JSON_NUMBER_PATTERN.test(numberSource)) {
        throw new Error('preserved JSON number marker is malformed');
      }
      return Object.freeze({
        [RAW_JSON_NUMBER]: true as const,
        source: numberSource,
      });
    }) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(
      `${label} must contain strict valid JSON without duplicate keys: ${detail}`,
    );
  }
}

const JSON_NUMBER_PATTERN =
  /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

function unusedNumberMarker(source: string, parsed: unknown): string {
  const digest = sha256(Buffer.from(source, 'utf8'));
  let marker = `__FED6G_RAW_JSON_NUMBER_${digest}__`;
  while (containsStringWithPrefix(parsed, marker)) marker += '_';
  return marker;
}

function containsStringWithPrefix(value: unknown, prefix: string): boolean {
  if (typeof value === 'string') return value.startsWith(prefix);
  if (Array.isArray(value)) {
    return value.some(item => containsStringWithPrefix(item, prefix));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(item =>
      containsStringWithPrefix(item, prefix),
    );
  }
  return false;
}

function quoteJsonNumbers(source: string, marker: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (inString) {
      output += character;
      index += 1;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      index += 1;
      continue;
    }
    if (character === '-' || /[0-9]/.test(character)) {
      const match = source.slice(index).match(
        /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/,
      );
      if (match) {
        output += JSON.stringify(`${marker}${match[0]}`);
        index += match[0].length;
        continue;
      }
    }
    output += character;
    index += 1;
  }
  return output;
}

export function stringifyJsonPreservingNumbers(value: unknown): string {
  if (isRawJsonNumber(value)) return value.source;
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('generated chain spec contains an unsafe numeric value');
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stringifyJsonPreservingNumbers(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('generated chain spec contains a non-plain object');
    }
    return `{${Object.entries(value)
      .map(([key, item]) =>
        `${JSON.stringify(key)}:${stringifyJsonPreservingNumbers(item)}`,
      )
      .join(',')}}`;
  }
  throw new Error('generated chain spec contains an unsupported JSON value');
}

function isRawJsonNumber(value: unknown): value is RawJsonNumber {
  return value !== null
    && typeof value === 'object'
    && (value as Partial<RawJsonNumber>)[RAW_JSON_NUMBER] === true
    && typeof (value as Partial<RawJsonNumber>).source === 'string';
}
