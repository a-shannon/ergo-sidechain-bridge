import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  decodeSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type {
  SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1_SCHEMA =
  'e2s.substrate-federated-tracker-compiler-request.v1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1_SCHEMA =
  'e2s.substrate-federated-tracker-compiler-fixture-validation.v1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH =
  'contracts/SPVTrackerSubstrateFederatedV1.es' as const;
export const SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_SHA256_HEX =
  '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1';
const FIXTURE_VALIDATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1';
const PINNED_FIXTURE_IDENTITY_CANONICAL_SHA256_HEX =
  '4dbc257777e47b8214fa5eab9258748d84d464a1efaed1782ea1277d9b3d7857';
const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g;
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

export interface SubstrateFederatedTrackerApplicationBindingV1 {
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
}

export interface BuildSubstrateFederatedTrackerCompilerRequestV1Input {
  readonly template: Readonly<{
    readonly relativePath: string;
    readonly source: string;
  }>;
  readonly trackerGenesisInputBoxIdHex: string;
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly application: Readonly<SubstrateFederatedTrackerApplicationBindingV1>;
}

export interface SubstrateFederatedTrackerCompilerRequestV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly requestDigestHex: string;
  readonly sigmaStateCommit:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT;
  readonly compiler: Readonly<{
    readonly scriptVersion: 3;
    readonly treeVersion: 0;
  }>;
  readonly template: Readonly<{
    readonly relativePath:
      typeof SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH;
    readonly templateSourceSha256Hex:
      typeof SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_SHA256_HEX;
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

export interface ValidatedSubstrateFederatedTrackerCompilerFixtureV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1_SCHEMA;
  readonly version: 1;
  readonly validationDigestHex: string;
  readonly compilerRequestDigestHex: string;
  readonly contract:
    Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly checks: Readonly<{
    readonly sameProcessCompilerRequestVerified: true;
    readonly exactPinnedFixtureIdentityMatched: true;
    readonly exactTemplateAndResolvedSourceMatched: true;
    readonly exactTrackerGenesisIdentityMatched: true;
    readonly exactApplicationAndFederationProfileMatched: true;
    readonly propositionMetadataSelfConsistent: true;
    readonly jvmCompilationReplayedByThisValidation: false;
    readonly callerAuthorityClaimsAccepted: false;
  }>;
  readonly boundaries: SubstrateFederatedTrackerCompilerRequestV1['boundaries'];
}

export function buildSubstrateFederatedTrackerCompilerRequestV1(
  input: BuildSubstrateFederatedTrackerCompilerRequestV1Input,
): Readonly<SubstrateFederatedTrackerCompilerRequestV1> {
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
  if (input.template.relativePath !== SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH) {
    throw new Error('federated tracker template path is not canonical');
  }
  if (typeof input.template.source !== 'string' || input.template.source.length === 0) {
    throw new Error('federated tracker template source must be nonempty');
  }
  if (input.template.source.includes('\r')) {
    throw new Error('federated tracker template source must be LF-only');
  }
  const templateSha256Hex = sha256Hex(Buffer.from(input.template.source, 'utf8'));
  if (templateSha256Hex !== SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_SHA256_HEX) {
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
    schema: SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1_SCHEMA,
    version: 1 as const,
    sigmaStateCommit:
      VALIDITY_APPLICATION_POOLED_RESERVE_SIGMASTATE_COMMIT,
    compiler: {
      scriptVersion: 3 as const,
      treeVersion: 0 as const,
    },
    template: {
      relativePath: SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH,
      templateSourceSha256Hex:
        SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_SHA256_HEX,
      resolvedSourceSha256Hex: sha256Hex(Buffer.from(resolvedSource, 'utf8')),
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

export function resolveSubstrateFederatedTrackerCompilerSourceV1(
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
): string {
  const source = requestSources.get(request);
  if (source === undefined) {
    throw new Error('federated tracker compiler request lacks same-process provenance');
  }
  return source;
}

export function validatePinnedSubstrateFederatedTrackerCompilerFixtureV1(
  input: Readonly<{
    readonly request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
    readonly contractIdentity: unknown;
  }>,
): Readonly<ValidatedSubstrateFederatedTrackerCompilerFixtureV1> {
  assertExactKeys(input, [
    'request',
    'contractIdentity',
  ], 'pinned federated tracker fixture validation');
  if (requestSources.get(input.request) === undefined) {
    throw new Error('federated tracker compiler request lacks same-process provenance');
  }
  const contract = normalizeContractIdentity(input.contractIdentity, input.request);
  if (
    sha256Hex(Buffer.from(canonicalJson(contract), 'utf8'))
      !== PINNED_FIXTURE_IDENTITY_CANONICAL_SHA256_HEX
  ) {
    throw new Error('federated tracker contract identity is not the pinned fixture');
  }
  const binding = {
    schema:
      SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1_SCHEMA,
    version: 1 as const,
    compilerRequestDigestHex: input.request.requestDigestHex,
    contract,
    checks: {
      sameProcessCompilerRequestVerified: true as const,
      exactPinnedFixtureIdentityMatched: true as const,
      exactTemplateAndResolvedSourceMatched: true as const,
      exactTrackerGenesisIdentityMatched: true as const,
      exactApplicationAndFederationProfileMatched: true as const,
      propositionMetadataSelfConsistent: true as const,
      jvmCompilationReplayedByThisValidation: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
    boundaries: falseBoundaries(),
  };
  return deepFreeze({
    ...binding,
    validationDigestHex: sha256CanonicalJson(
      binding,
      FIXTURE_VALIDATION_DIGEST_DOMAIN,
    ),
  });
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
  if (value === null || typeof value !== 'object') {
    throw new Error('federated tracker checkpoint profile must be an object');
  }
  const decoded = decodeSubstrateFederatedCheckpointProfileV1(
    value.encodedProfileHex,
  );
  if (canonicalJson(value) !== canonicalJson(decoded)) {
    throw new Error('federated tracker checkpoint profile is not canonical');
  }
  positiveSignedLong(decoded.federationEpoch, 'federation epoch');
  positiveSignedLong(
    decoded.maxAdmissionValidityBlocks,
    'maximum validity blocks',
  );
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
      value.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime-code digest',
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      value.bridgeRuntimeCodeBytes,
      'bridge runtime-code bytes',
    ),
    tokenRuntimeCodeSha256Hex: nonzeroHex(
      value.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime-code digest',
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      value.tokenRuntimeCodeBytes,
      'token runtime-code bytes',
    ),
    sourceRuntimeCodeSha256Hex: nonzeroHex(
      value.sourceRuntimeCodeSha256Hex,
      32,
      'source runtime-code digest',
    ),
    sourceRuntimeCodeBytes: positiveUint32(
      value.sourceRuntimeCodeBytes,
      'source runtime-code bytes',
    ),
    runtimeProfileIdHex: nonzeroHex(value.runtimeProfileIdHex, 32, 'runtime profile ID'),
    settlementProfileIdHex: nonzeroHex(
      value.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
  });
}

function normalizeContractIdentity(
  value: unknown,
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
): Readonly<SubstrateFederatedTrackerContractV1Identity> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('federated tracker compiler identity must be an object');
  }
  const identity = value as Record<string, unknown>;
  assertExactKeys(identity, [
    'schema',
    'version',
    'sigmaStateCommit',
    'templateSourceSha256Hex',
    'resolvedSourceSha256Hex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionHex',
    'contractIdHex',
    'trackerNftIdHex',
    'application',
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'sourceAttestationThreshold',
    'ergoAdmissionKeySetDigestHex',
    'ergoAdmissionThreshold',
    'ergoAdmissionPublicKeysHex',
    'federationEpoch',
    'maxAdmissionValidityBlocks',
    'sourceSignaturesVerifiedOnChain',
    'jvmReductionAccepted',
    'profileActivated',
    'signingPerformed',
    'submissionPerformed',
    'broadcastPerformed',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
  ], 'federated tracker compiler identity');
  if (
    identity.schema !== 'e2s.substrate-federated-v1-tracker-contract'
    || identity.version !== 1
    || identity.sigmaStateCommit !== request.sigmaStateCommit
    || identity.templateSourceSha256Hex
      !== request.template.templateSourceSha256Hex
    || identity.resolvedSourceSha256Hex
      !== request.template.resolvedSourceSha256Hex
    || identity.trackerNftIdHex !== request.trackerNftIdHex
  ) {
    throw new Error('federated tracker compiler identity request binding drifted');
  }
  if (canonicalJson(identity.application) !== canonicalJson(request.application)) {
    throw new Error('federated tracker compiler application binding drifted');
  }
  const profile = request.profile;
  if (
    identity.federationProfileIdHex !== profile.profileIdHex
    || identity.sourceAttestationKeySetDigestHex
      !== profile.sourceAttestationKeySetDigestHex
    || identity.sourceAttestationThreshold !== profile.sourceAttestationThreshold
    || identity.ergoAdmissionKeySetDigestHex
      !== profile.ergoAdmissionKeySetDigestHex
    || identity.ergoAdmissionThreshold !== profile.ergoAdmissionThreshold
    || canonicalJson(identity.ergoAdmissionPublicKeysHex)
      !== canonicalJson(profile.ergoAdmissionPublicKeysHex)
    || identity.federationEpoch !== profile.federationEpoch
    || identity.maxAdmissionValidityBlocks
      !== profile.maxAdmissionValidityBlocks
  ) {
    throw new Error('federated tracker compiler federation profile drifted');
  }
  if ([
    'sourceSignaturesVerifiedOnChain',
    'jvmReductionAccepted',
    'profileActivated',
    'signingPerformed',
    'submissionPerformed',
    'broadcastPerformed',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
  ].some(key => identity[key] !== false)) {
    throw new Error('federated tracker compiler identity makes an authority claim');
  }
  const propositionHex = variableHex(
    identity.propositionHex,
    'federated tracker proposition',
  );
  const propositionBytes = positiveInteger(
    identity.propositionBytes,
    'federated tracker proposition bytes',
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  if (
    proposition.length !== propositionBytes
    || identity.propositionSha256Hex
      !== sha256Hex(proposition)
    || identity.contractIdHex !== blake2b256Hex(proposition)
  ) {
    throw new Error('federated tracker proposition identity drifted');
  }
  return deepFreeze(structuredClone(
    identity as unknown as SubstrateFederatedTrackerContractV1Identity,
  ));
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
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])
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

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be nonempty lowercase bytes`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function positiveUint32(value: unknown, label: string): number {
  const parsed = positiveInteger(value, label);
  if (parsed > 0xffff_ffff) {
    throw new Error(`${label} exceeds uint32`);
  }
  return parsed;
}

function uintHex(value: number, bytes: number): string {
  if (BigInt(value) >= 1n << BigInt(bytes * 8)) {
    throw new Error(`federated tracker integer exceeds ${bytes} bytes`);
  }
  return value.toString(16).padStart(bytes * 2, '0');
}

function uint64Hex(value: string): string {
  const parsed = BigInt(positiveSignedLong(value, 'federation epoch'));
  return parsed.toString(16).padStart(16, '0');
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

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
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
