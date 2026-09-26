import { createHash } from 'node:crypto';

import {
  decodeSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type {
  SubstrateFederatedTrackerApplicationBindingV1,
} from './substrate-federated-tracker-compiler-v1.js';

export const SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2_SCHEMA =
  'e2s.substrate-federated-tracker-compiler-request.v2' as const;
export const SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH =
  'contracts/SPVTrackerSubstrateFederatedV2.es' as const;
export const SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX =
  '110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2';
const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/;
const PLACEHOLDERS = Object.freeze([
  'FEDERATED_TRACKER_NFT_ID_PLACEHOLDER',
  'FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER',
  'FEDERATED_SIDECHAIN_ID_PLACEHOLDER',
  'FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER',
  'FEDERATED_TOKEN_ADDRESS_PLACEHOLDER',
  'FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER',
  'FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER',
  'FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER',
  'FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER',
  'FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER',
  'FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER',
  'FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER',
  'FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
  'FEDERATED_PROFILE_ID_PLACEHOLDER',
  'FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER',
  'FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER',
  'FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER',
  'FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER',
  'FEDERATED_EPOCH_PLACEHOLDER',
  'FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER',
  'FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS',
  'FEDERATED_ERGO_THRESHOLD_PLACEHOLDER',
] as const);
const requestSources = new WeakMap<object, string>();

export interface BuildSubstrateFederatedTrackerCompilerRequestV2Input {
  readonly template: Readonly<{
    readonly relativePath: string;
    readonly source: string;
  }>;
  readonly trackerGenesisInputBoxIdHex: string;
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly application: Readonly<SubstrateFederatedTrackerApplicationBindingV1>;
}

export interface SubstrateFederatedTrackerCompilerRequestV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2_SCHEMA;
  readonly version: 2;
  readonly anchorSelector: 'absolute-ergo-header-height';
  readonly requestDigestHex: string;
  readonly compiler: Readonly<{
    readonly scriptVersion: 3;
    readonly treeVersion: 0;
  }>;
  readonly template: Readonly<{
    readonly relativePath:
      typeof SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH;
    readonly templateSourceSha256Hex:
      typeof SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX;
    readonly resolvedSourceSha256Hex: string;
  }>;
  readonly trackerNftIdHex: string;
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly application: Readonly<SubstrateFederatedTrackerApplicationBindingV1>;
  readonly boundaries: Readonly<{
    readonly profileActivated: false;
    readonly targetGenesisBoxObserved: false;
    readonly targetNetworkIdentityAuthenticated: false;
    readonly jvmCompilationReplayed: false;
    readonly compilerReceiptAuthenticated: false;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export function buildSubstrateFederatedTrackerCompilerRequestV2(
  input: BuildSubstrateFederatedTrackerCompilerRequestV2Input,
): Readonly<SubstrateFederatedTrackerCompilerRequestV2> {
  assertExactKeys(input, [
    'template',
    'trackerGenesisInputBoxIdHex',
    'profile',
    'application',
  ], 'federated tracker compiler request input');
  assertExactKeys(input.template, [
    'relativePath',
    'source',
  ], 'federated tracker template');
  if (input.template.relativePath !== SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH) {
    throw new Error('federated tracker template path is not canonical');
  }
  if (typeof input.template.source !== 'string' || input.template.source.length === 0) {
    throw new Error('federated tracker template source must be nonempty');
  }
  if (input.template.source.includes('\r')) {
    throw new Error('federated tracker template source must be LF-only');
  }
  const templateSha256Hex = sha256Hex(input.template.source);
  if (templateSha256Hex !== SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX) {
    throw new Error(`federated tracker template SHA-256 mismatch: ${templateSha256Hex}`);
  }

  const profile = normalizeProfile(input.profile);
  const trackerNftIdHex = nonzeroHex(
    input.trackerGenesisInputBoxIdHex,
    32,
    'federated tracker genesis input box ID',
  );
  const application = normalizeApplication(input.application);
  const resolvedSource = resolveTemplate(
    input.template.source,
    trackerNftIdHex,
    profile,
    application,
  );
  const binding = {
    schema: SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2_SCHEMA,
    version: 2 as const,
    anchorSelector: 'absolute-ergo-header-height' as const,
    compiler: {
      scriptVersion: 3 as const,
      treeVersion: 0 as const,
    },
    template: {
      relativePath: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH,
      templateSourceSha256Hex:
        SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX,
      resolvedSourceSha256Hex: sha256Hex(resolvedSource),
    },
    trackerNftIdHex,
    profile,
    application,
    boundaries: falseBoundaries(),
  };
  const request = deepFreeze({
    ...binding,
    requestDigestHex: sha256CanonicalJson(binding, REQUEST_DIGEST_DOMAIN),
  });
  requestSources.set(request, resolvedSource);
  return request;
}

export function resolveSubstrateFederatedTrackerCompilerSourceV2(
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV2>,
): string {
  const source = requestSources.get(request);
  if (source === undefined) {
    throw new Error('federated tracker compiler request lacks same-process provenance');
  }
  return source;
}

function resolveTemplate(
  template: string,
  trackerNftIdHex: string,
  profile: Readonly<SubstrateFederatedCheckpointProfileV1>,
  application: Readonly<SubstrateFederatedTrackerApplicationBindingV1>,
): string {
  const ergoSigmaProps = profile.ergoAdmissionPublicKeysHex.map(key =>
    `proveDlog(decodePoint(fromBase16("${key}")))`
  ).join(',\n    ');
  const replacements = new Map<string, string>([
    ['FEDERATED_TRACKER_NFT_ID_PLACEHOLDER', trackerNftIdHex],
    ['FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER', application.sourceNetworkIdHex],
    ['FEDERATED_SIDECHAIN_ID_PLACEHOLDER', application.sidechainIdHex],
    ['FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER', application.bridgeAddressHex],
    ['FEDERATED_TOKEN_ADDRESS_PLACEHOLDER', application.tokenAddressHex],
    ['FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER', application.bridgeRuntimeCodeSha256Hex],
    ['FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER', uintHex(application.bridgeRuntimeCodeBytes, 4)],
    ['FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER', application.tokenRuntimeCodeSha256Hex],
    ['FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER', uintHex(application.tokenRuntimeCodeBytes, 4)],
    ['FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER', application.sourceRuntimeCodeSha256Hex],
    ['FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER', uintHex(application.sourceRuntimeCodeBytes, 4)],
    ['FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER', application.runtimeProfileIdHex],
    ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', application.settlementProfileIdHex],
    ['FEDERATED_PROFILE_ID_PLACEHOLDER', profile.profileIdHex],
    ['FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER', profile.sourceAttestationKeySetDigestHex],
    ['FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER', uintHex(profile.sourceAttestationThreshold, 2)],
    ['FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER', profile.ergoAdmissionKeySetDigestHex],
    ['FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER', uintHex(profile.ergoAdmissionThreshold, 2)],
    ['FEDERATED_EPOCH_PLACEHOLDER', uint64Hex(profile.federationEpoch)],
    [
      'FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER',
      `${positiveSignedLong(profile.maxAdmissionValidityBlocks, 'maximum validity blocks')}L`,
    ],
    ['FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS', ergoSigmaProps],
    ['FEDERATED_ERGO_THRESHOLD_PLACEHOLDER', String(profile.ergoAdmissionThreshold)],
  ]);
  if (
    replacements.size !== PLACEHOLDERS.length
    || PLACEHOLDERS.some(placeholder => !replacements.has(placeholder))
  ) {
    throw new Error('federated tracker placeholder replacement set is incomplete');
  }
  let resolved = template;
  for (const placeholder of PLACEHOLDERS) {
    const first = resolved.indexOf(placeholder);
    if (first < 0 || first !== resolved.lastIndexOf(placeholder)) {
      throw new Error(`federated tracker placeholder count is not one: ${placeholder}`);
    }
    resolved = resolved.replace(placeholder, replacements.get(placeholder)!);
  }
  if (PLACEHOLDER_PATTERN.test(resolved)) {
    throw new Error('federated tracker source retains an unresolved placeholder');
  }
  return resolved;
}

function normalizeProfile(
  value: Readonly<SubstrateFederatedCheckpointProfileV1>,
): Readonly<SubstrateFederatedCheckpointProfileV1> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('federated tracker checkpoint profile must be an object');
  }
  const decoded = decodeSubstrateFederatedCheckpointProfileV1(value.encodedProfileHex);
  assertExactKeys(value, Object.keys(decoded), 'federated tracker checkpoint profile');
  if (canonicalJson(value) !== canonicalJson(decoded)) {
    throw new Error('federated tracker checkpoint profile is not canonical');
  }
  positiveSignedLong(decoded.federationEpoch, 'federation epoch');
  positiveSignedLong(decoded.maxAdmissionValidityBlocks, 'maximum validity blocks');
  return deepFreeze(structuredClone(decoded));
}

function normalizeApplication(
  value: Readonly<SubstrateFederatedTrackerApplicationBindingV1>,
): Readonly<SubstrateFederatedTrackerApplicationBindingV1> {
  assertExactKeys(value, [
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
    'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes',
    'runtimeProfileIdHex',
    'settlementProfileIdHex',
  ], 'federated tracker application binding');
  return deepFreeze({
    sourceNetworkIdHex: nonzeroHex(value.sourceNetworkIdHex, 32, 'source network ID'),
    sidechainIdHex: nonzeroHex(value.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex: nonzeroHex(value.bridgeAddressHex, 20, 'bridge address'),
    tokenAddressHex: nonzeroHex(value.tokenAddressHex, 20, 'token address'),
    bridgeRuntimeCodeSha256Hex: nonzeroHex(
      value.bridgeRuntimeCodeSha256Hex, 32, 'bridge runtime-code digest',
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      value.bridgeRuntimeCodeBytes, 'bridge runtime-code bytes',
    ),
    tokenRuntimeCodeSha256Hex: nonzeroHex(
      value.tokenRuntimeCodeSha256Hex, 32, 'token runtime-code digest',
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      value.tokenRuntimeCodeBytes, 'token runtime-code bytes',
    ),
    sourceRuntimeCodeSha256Hex: nonzeroHex(
      value.sourceRuntimeCodeSha256Hex, 32, 'source runtime-code digest',
    ),
    sourceRuntimeCodeBytes: positiveUint32(
      value.sourceRuntimeCodeBytes, 'source runtime-code bytes',
    ),
    runtimeProfileIdHex: nonzeroHex(value.runtimeProfileIdHex, 32, 'runtime profile ID'),
    settlementProfileIdHex: nonzeroHex(
      value.settlementProfileIdHex, 32, 'settlement profile ID',
    ),
  });
}

function falseBoundaries() {
  return deepFreeze({
    profileActivated: false as const,
    targetGenesisBoxObserved: false as const,
    targetNetworkIdentityAuthenticated: false as const,
    jvmCompilationReplayed: false as const,
    compilerReceiptAuthenticated: false as const,
    nodeCheckPerformed: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
  });
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== expected.length
    || actual.some(key => typeof key !== 'string' || !expected.includes(key))
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function nonzeroHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
    || /^0+$/.test(value)
  ) {
    throw new Error(`${label} must be ${bytes} nonzero lowercase bytes`);
  }
  return value;
}

function positiveUint32(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  if (value > 0xffff_ffff) {
    throw new Error(`${label} exceeds uint32`);
  }
  return value;
}

function uintHex(value: number, bytes: number): string {
  if (BigInt(value) >= 1n << BigInt(bytes * 8)) {
    throw new Error(`federated tracker integer exceeds ${bytes} bytes`);
  }
  return value.toString(16).padStart(bytes * 2, '0');
}

function uint64Hex(value: string): string {
  return BigInt(positiveSignedLong(value, 'federation epoch'))
    .toString(16).padStart(16, '0');
}

function positiveSignedLong(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds positive Ergo Long`);
  }
  return parsed.toString();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child, seen);
    }
    Object.freeze(value);
  }
  return value;
}
