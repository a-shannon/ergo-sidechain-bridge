import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from 'crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

export const NATIVE_VERIFIER_ATTESTATION_STATEMENT_SCHEMA =
  'e2s.native-verifier-attestation-statement.v2';
export const NATIVE_VERIFIER_ATTESTOR_LOCK_KIND =
  'bridge-native-verifier-attestor-lock';
export const NATIVE_VERIFIER_ATTESTOR_LOCK_SCHEMA_VERSION = 1;
export const NATIVE_VERIFIER_ATTESTATION_VALIDATION_REPORT_SCHEMA =
  'e2s.native-verifier-attestation-validation-report.v2';

const CANONICALIZATION = 'e2s-canonical-json-v1';
const SIGNATURE_ALGORITHM = 'ed25519';
const ATTESTATION_DOMAIN = Buffer.from(
  'E2S_NATIVE_VERIFIER_BINARY_ATTESTATION_V2\0',
  'utf8',
);
const ATTESTATION_CORE_DOMAIN = Buffer.from(
  'E2S_NATIVE_VERIFIER_ATTESTATION_CORE_V2\0',
  'utf8',
);
const EXPECTED_CARGO_ARGUMENTS = [
  'build',
  '--locked',
  '--offline',
  '--frozen',
  '--release',
  '-p',
  'bridge-checkpoint-verifier',
  '--bins',
] as const;
const REVIEWED_PROFILE_RESULTS = new WeakSet<object>();
const ATTESTATION_VALIDATION_RESULTS = new WeakSet<object>();
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANONICAL_BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const CANONICAL_ATTESTOR_LOCK_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'sources',
  'native-verifier-attestor-lock.json',
);

export interface NativeVerifierAttestorKey {
  role: 'builder' | 'independent-reviewer';
  organizationId: string;
  keyIdHex: string;
  publicKeySpkiDerHex: string;
}

export interface NativeVerifierAttestorProfile {
  profileId: string;
  status: 'active' | 'revoked';
  validFrom: string;
  validUntil: string;
  builder: NativeVerifierAttestorKey & { role: 'builder' };
  reviewer: NativeVerifierAttestorKey & { role: 'independent-reviewer' };
  forbiddenAuthorityKeyIds: string[];
}

export interface NativeVerifierAttestorLock {
  schemaVersion: 1;
  kind: typeof NATIVE_VERIFIER_ATTESTOR_LOCK_KIND;
  canonicalization: typeof CANONICALIZATION;
  signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  profiles: NativeVerifierAttestorProfile[];
  boundaries: {
    runtimeProfilesCannotAddTrustRoots: true;
    cryptographyDoesNotProveOrganizationalIndependence: true;
    provisioningIntegrationRequiredForAdmission: true;
    trackerAttestorSeparationRequired: true;
  };
}

export interface NativeVerifierAttestationStatement {
  schema: typeof NATIVE_VERIFIER_ATTESTATION_STATEMENT_SCHEMA;
  profileId: string;
  attestationId: string;
  canonicalization: typeof CANONICALIZATION;
  signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  timestamps: {
    builtAt: string;
    reviewedAt: string;
  };
  source: {
    consensusSourceLockSha256: string;
    frontierCommit: string;
    frontierPatchSha256: string;
    cargoLockGitBlobId: string;
    verifierSourceManifestSha256: string;
  };
  dependencies: {
    mode: 'vendored-content-addressed';
    manifestSha256: string;
    crateCount: number;
    cargoLocked: true;
    cargoOffline: true;
    cargoFrozen: true;
    sharedMutableCacheUsed: false;
  };
  tools: {
    completeClosureManifestSha256: string;
    toolCount: number;
    includesCompilerDriver: true;
    includesLinker: true;
    includesWindowsSdk: true;
    includesInvokedHelpers: true;
  };
  build: {
    platform: 'win32-x64';
    rustTarget: 'x86_64-pc-windows-msvc';
    profile: 'release';
    cargoArguments: string[];
    workingTreeIdentitySha256: string;
    environmentAllowlistSha256: string;
    freshEmptyTarget: true;
    preexistingOutputsRejected: true;
    sourceValidatedBeforeAndAfter: true;
  };
  containment: {
    mechanism: 'windows-job-object-kill-on-close';
    evidenceSha256: string;
    killOnClose: true;
    descendantsContained: true;
    inheritedHandlesContained: true;
    timeoutTerminationTested: true;
    outputLimitTerminationTested: true;
  };
  artifacts: {
    verifier: {
      role: 'bridge-checkpoint-verifier';
      sha256: string;
      sizeBytes: number;
    };
    codec: {
      role: 'bridge-rpc-proof-codec';
      sha256: string;
      sizeBytes: number;
    };
  };
  executionPolicySha256: string;
  conformance: {
    nativeCheckpointVectorSha256: string;
    frontierBurnVectorSha256: string;
    outputManifestSha256: string;
    status: 'PASS';
  };
  actors: {
    builderKeyIdHex: string;
    builderOrganizationId: string;
    reviewerKeyIdHex: string;
    reviewerOrganizationId: string;
  };
  boundaries: {
    externalBuildPerformed: true;
    independentReproductionPerformed: true;
    completeBuildToolClosureAttested: true;
    dependencyClosureAttested: true;
    osProcessContainmentAttested: true;
    provisioningIntegrated: false;
    trackerAttestorSeparated: false;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    committeeBypassPrevented: false;
    admissionEligible: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativeVerifierAttestationPacket {
  statement: NativeVerifierAttestationStatement;
  statementDigestHex: string;
  signatures: {
    builder: {
      keyIdHex: string;
      signatureHex: string;
    };
    reviewer: {
      keyIdHex: string;
      signatureHex: string;
    };
  };
}

export interface NativeVerifierAttestationValidationReport {
  schema: typeof NATIVE_VERIFIER_ATTESTATION_VALIDATION_REPORT_SCHEMA;
  profileId: string;
  attestationId: string;
  attestation: {
    statementDigestHex: string;
    statementCoreDigestHex: string;
    policyDigestHex: string;
    builderKeyIdHex: string;
    reviewerKeyIdHex: string;
    builderSignatureVerified: true;
    reviewerSignatureVerified: true;
    actorKeysDisjoint: true;
    organizationsDeclaredDisjoint: true;
  };
  timestamps: NativeVerifierAttestationStatement['timestamps'];
  dependencies: NativeVerifierAttestationStatement['dependencies'];
  executionPolicySha256: string;
  source: NativeVerifierAttestationStatement['source'];
  artifacts: NativeVerifierAttestationStatement['artifacts'];
  boundary: {
    relativeToSuppliedPolicy: true;
    reviewedTrustRootsLoaded: boolean;
    executionCapabilityIssued: false;
    exactBinaryBytesMatched: true;
    completeBuildToolClosureAttested: true;
    dependencyClosureAttested: true;
    osProcessContainmentAttested: true;
    organizationalIndependenceCryptographicallyProven: false;
    provisioningIntegrated: false;
    trackerAttestorSeparated: false;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    committeeBypassPrevented: false;
    admissionEligible: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export function validateNativeVerifierAttestationAgainstPolicy(input: {
  bridgeRoot: string;
  attestorLock: NativeVerifierAttestorLock;
  packet: NativeVerifierAttestationPacket;
  verifierExecutablePath: string;
  codecExecutablePath: string;
  evaluatedAt?: string;
}): NativeVerifierAttestationValidationReport {
  return validateNativeVerifierAttestationInternal({
    ...input,
    reviewedTrustRootsLoaded: false,
  });
}

declare const REVIEWED_INDEPENDENT_ATTESTATION_BRAND: unique symbol;
export type ReviewedIndependentlyAttestedNativeVerifierProfile =
  NativeVerifierAttestationValidationReport & {
    readonly [REVIEWED_INDEPENDENT_ATTESTATION_BRAND]: true;
  };

export function loadReviewedNativeVerifierAttestorLock(): NativeVerifierAttestorLock {
  const lockPath = guardedPath(CANONICAL_BRIDGE_ROOT, CANONICAL_ATTESTOR_LOCK_PATH);
  return validateNativeVerifierAttestorLock(JSON.parse(readFileSync(lockPath, 'utf8')) as unknown);
}

export function validateNativeVerifierAttestorLock(value: unknown): NativeVerifierAttestorLock {
  return normalizeAttestorLock(value);
}

export function deriveNativeVerifierAttestorPolicyDigestHex(value: unknown): string {
  const lock = validateNativeVerifierAttestorLock(value);
  return sha256(Buffer.from(canonicalJson(lock), 'utf8'));
}

export function verifyReviewedIndependentlyAttestedNativeVerifierProfile(input: {
  packet: NativeVerifierAttestationPacket;
  verifierExecutablePath: string;
  codecExecutablePath: string;
}): ReviewedIndependentlyAttestedNativeVerifierProfile {
  const profile = validateNativeVerifierAttestationInternal({
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    attestorLock: loadReviewedNativeVerifierAttestorLock(),
    packet: input.packet,
    verifierExecutablePath: input.verifierExecutablePath,
    codecExecutablePath: input.codecExecutablePath,
    evaluatedAt: new Date().toISOString(),
    reviewedTrustRootsLoaded: true,
  });
  REVIEWED_PROFILE_RESULTS.add(profile);
  return profile as ReviewedIndependentlyAttestedNativeVerifierProfile;
}

export function assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance(
  profile: unknown,
): asserts profile is ReviewedIndependentlyAttestedNativeVerifierProfile {
  if (!profile || typeof profile !== 'object' || !REVIEWED_PROFILE_RESULTS.has(profile)) {
    throw new Error('reviewed independently attested native verifier profile provenance is missing');
  }
}

export function assertNativeVerifierAttestationValidationReportProvenance(
  profile: unknown,
): asserts profile is NativeVerifierAttestationValidationReport {
  if (!profile || typeof profile !== 'object' || !ATTESTATION_VALIDATION_RESULTS.has(profile)) {
    throw new Error('native verifier attestation validation report provenance is missing');
  }
}

function validateNativeVerifierAttestationInternal(input: {
  bridgeRoot: string;
  attestorLock: NativeVerifierAttestorLock;
  packet: NativeVerifierAttestationPacket;
  verifierExecutablePath: string;
  codecExecutablePath: string;
  evaluatedAt?: string;
  reviewedTrustRootsLoaded: boolean;
}): NativeVerifierAttestationValidationReport {
  const bridgeRoot = realpathSync(requireAbsolutePath(input.bridgeRoot, 'bridge root'));
  const attestorLock = validateNativeVerifierAttestorLock(input.attestorLock);
  const policyDigestHex = sha256(Buffer.from(canonicalJson(attestorLock), 'utf8'));
  const packet = normalizeAttestationPacket(input.packet);
  const statement = packet.statement;
  const message = canonicalNativeVerifierAttestationMessage(statement);
  const statementDigestHex = sha256(message);
  const statementCoreDigestHex = deriveNativeVerifierAttestationCoreDigestHex(statement);
  if (packet.statementDigestHex !== statementDigestHex) {
    throw new Error('native verifier attestation statement digest does not match canonical content');
  }

  const attestorProfile = attestorLock.profiles.find(profile =>
    profile.profileId === statement.profileId && profile.status === 'active');
  if (!attestorProfile) {
    throw new Error('native verifier attestation has no active attestor profile in the reviewed policy');
  }
  assertAttestorSeparation(attestorProfile);
  assertStatementActors(statement, packet, attestorProfile);
  assertAttestorValidity(statement, attestorProfile, input.evaluatedAt ?? new Date().toISOString());

  const builderPublicKey = verifiedAttestorPublicKey(attestorProfile.builder);
  const reviewerPublicKey = verifiedAttestorPublicKey(attestorProfile.reviewer);
  if (!verifySignature(
    null,
    message,
    builderPublicKey,
    Buffer.from(packet.signatures.builder.signatureHex, 'hex'),
  )) {
    throw new Error('native verifier builder signature is invalid');
  }
  if (!verifySignature(
    null,
    message,
    reviewerPublicKey,
    Buffer.from(packet.signatures.reviewer.signatureHex, 'hex'),
  )) {
    throw new Error('native verifier independent reviewer signature is invalid');
  }

  assertCanonicalSourceBinding(bridgeRoot, statement.source);
  assertDependencyClosure(statement.dependencies);
  assertToolClosure(statement.tools);
  assertBuildIsolation(statement.build);
  assertProcessContainment(statement.containment);
  assertConformanceInputs(bridgeRoot, statement.conformance);
  assertFailClosedBoundaries(statement.boundaries);

  const verifier = verifiedArtifact(
    input.verifierExecutablePath,
    statement.artifacts.verifier,
    'verifier',
  );
  const codec = verifiedArtifact(
    input.codecExecutablePath,
    statement.artifacts.codec,
    'codec',
  );
  if (samePath(verifier.path, codec.path)) {
    throw new Error('native verifier and RPC codec must be distinct artifacts');
  }

  const profile = deepFreeze({
    schema: NATIVE_VERIFIER_ATTESTATION_VALIDATION_REPORT_SCHEMA,
    profileId: statement.profileId,
    attestationId: statement.attestationId,
    attestation: {
      statementDigestHex,
      statementCoreDigestHex,
      policyDigestHex,
      builderKeyIdHex: statement.actors.builderKeyIdHex,
      reviewerKeyIdHex: statement.actors.reviewerKeyIdHex,
      builderSignatureVerified: true as const,
      reviewerSignatureVerified: true as const,
      actorKeysDisjoint: true as const,
      organizationsDeclaredDisjoint: true as const,
    },
    timestamps: statement.timestamps,
    dependencies: statement.dependencies,
    executionPolicySha256: statement.executionPolicySha256,
    source: statement.source,
    artifacts: statement.artifacts,
    boundary: {
      relativeToSuppliedPolicy: true as const,
      reviewedTrustRootsLoaded: input.reviewedTrustRootsLoaded,
      executionCapabilityIssued: false as const,
      exactBinaryBytesMatched: true as const,
      completeBuildToolClosureAttested: true as const,
      dependencyClosureAttested: true as const,
      osProcessContainmentAttested: true as const,
      organizationalIndependenceCryptographicallyProven: false as const,
      provisioningIntegrated: false as const,
      trackerAttestorSeparated: false as const,
      ergoExtensionAnchorVerified: false as const,
      onChainAcceptanceVerified: false as const,
      committeeBypassPrevented: false as const,
      admissionEligible: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  }) as NativeVerifierAttestationValidationReport;
  ATTESTATION_VALIDATION_RESULTS.add(profile);
  return profile;
}

export function canonicalNativeVerifierAttestationMessage(
  statement: NativeVerifierAttestationStatement,
): Buffer {
  return Buffer.concat([
    ATTESTATION_DOMAIN,
    Buffer.from(canonicalJson(statement), 'utf8'),
  ]);
}

export function deriveNativeVerifierAttestationCoreDigestHex(
  statement: NativeVerifierAttestationStatement,
): string {
  const {
    executionPolicySha256: _executionPolicySha256,
    ...core
  } = statement;
  return sha256(Buffer.concat([
    ATTESTATION_CORE_DOMAIN,
    Buffer.from(canonicalE2sJson(core), 'utf8'),
  ]));
}

export function deriveNativeVerifierSourceManifestSha256(value: unknown): string {
  const lock = asRecord(value, 'consensus source lock');
  const frontier = asRecord(lock.frontier, 'consensus source lock frontier');
  if (!Array.isArray(frontier.files) || frontier.files.length === 0) {
    throw new Error('consensus source lock frontier files must be a non-empty array');
  }
  const files = frontier.files.map((entry, index) => {
    const record = asRecord(entry, `consensus source lock frontier files[${index}]`);
    return {
      path: nonEmptyString(record.path, `consensus source lock frontier files[${index}].path`),
      status: nonEmptyString(record.status, `consensus source lock frontier files[${index}].status`),
      baseBlob: record.baseBlob === undefined
        ? null
        : fixedHex(record.baseBlob, 20, `consensus source lock frontier files[${index}].baseBlob`),
      patchedBlob: fixedHex(
        record.patchedBlob,
        20,
        `consensus source lock frontier files[${index}].patchedBlob`,
      ),
    };
  });
  return sha256(Buffer.from(canonicalJson({
    commit: fixedHex(frontier.commit, 20, 'consensus source lock Frontier commit'),
    cargoLockBlob: fixedHex(frontier.cargoLockBlob, 20, 'consensus source lock Cargo.lock blob'),
    rustToolchainBlob: fixedHex(
      frontier.rustToolchainBlob,
      20,
      'consensus source lock rust toolchain blob',
    ),
    patchSha256: fixedHex(frontier.patchSha256, 32, 'consensus source lock Frontier patch'),
    files,
  }), 'utf8'));
}

function normalizeAttestorLock(value: unknown): NativeVerifierAttestorLock {
  assertExactKeys(value, [
    'schemaVersion',
    'kind',
    'canonicalization',
    'signatureAlgorithm',
    'profiles',
    'boundaries',
  ], 'native verifier attestor lock');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== NATIVE_VERIFIER_ATTESTOR_LOCK_SCHEMA_VERSION
    || record.kind !== NATIVE_VERIFIER_ATTESTOR_LOCK_KIND
    || record.canonicalization !== CANONICALIZATION
    || record.signatureAlgorithm !== SIGNATURE_ALGORITHM) {
    throw new Error('native verifier attestor lock identity is unsupported');
  }
  if (!Array.isArray(record.profiles)) {
    throw new Error('native verifier attestor lock profiles must be an array');
  }
  const profileIds = new Set<string>();
  const profiles = record.profiles.map((profile, index) => {
    const normalized = normalizeAttestorProfile(profile, index);
    if (profileIds.has(normalized.profileId)) {
      throw new Error('native verifier attestor lock profile IDs must be unique');
    }
    profileIds.add(normalized.profileId);
    assertAttestorSeparation(normalized);
    verifiedAttestorPublicKey(normalized.builder);
    verifiedAttestorPublicKey(normalized.reviewer);
    return normalized;
  });
  assertExactKeys(record.boundaries, [
    'runtimeProfilesCannotAddTrustRoots',
    'cryptographyDoesNotProveOrganizationalIndependence',
    'provisioningIntegrationRequiredForAdmission',
    'trackerAttestorSeparationRequired',
  ], 'native verifier attestor lock boundaries');
  const boundaries = record.boundaries as Record<string, unknown>;
  if (
    boundaries.runtimeProfilesCannotAddTrustRoots !== true
    || boundaries.cryptographyDoesNotProveOrganizationalIndependence !== true
    || boundaries.provisioningIntegrationRequiredForAdmission !== true
    || boundaries.trackerAttestorSeparationRequired !== true
  ) {
    throw new Error('native verifier attestor lock boundaries must remain fail-closed');
  }
  return deepFreeze({
    schemaVersion: 1,
    kind: NATIVE_VERIFIER_ATTESTOR_LOCK_KIND,
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    profiles,
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true,
      cryptographyDoesNotProveOrganizationalIndependence: true,
      provisioningIntegrationRequiredForAdmission: true,
      trackerAttestorSeparationRequired: true,
    },
  });
}

function normalizeAttestorProfile(value: unknown, index: number): NativeVerifierAttestorProfile {
  const label = `native verifier attestor profiles[${index}]`;
  assertExactKeys(value, [
    'profileId',
    'status',
    'validFrom',
    'validUntil',
    'builder',
    'reviewer',
    'forbiddenAuthorityKeyIds',
  ], label);
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== 'active' && status !== 'revoked') {
    throw new Error(`${label}.status must be active or revoked`);
  }
  if (!Array.isArray(record.forbiddenAuthorityKeyIds)) {
    throw new Error(`${label}.forbiddenAuthorityKeyIds must be an array`);
  }
  const forbiddenAuthorityKeyIds = record.forbiddenAuthorityKeyIds.map((entry, authorityIndex) =>
    fixedHex(entry, 32, `${label}.forbiddenAuthorityKeyIds[${authorityIndex}]`));
  if (new Set(forbiddenAuthorityKeyIds).size !== forbiddenAuthorityKeyIds.length) {
    throw new Error(`${label}.forbiddenAuthorityKeyIds must not contain duplicates`);
  }
  const builder = normalizeAttestorKey(record.builder, 'builder', `${label}.builder`);
  const reviewer = normalizeAttestorKey(
    record.reviewer,
    'independent-reviewer',
    `${label}.reviewer`,
  );
  const validFrom = isoTimestamp(record.validFrom, `${label}.validFrom`);
  const validUntil = isoTimestamp(record.validUntil, `${label}.validUntil`);
  if (Date.parse(validFrom) >= Date.parse(validUntil)) {
    throw new Error(`${label} validity window must have validFrom before validUntil`);
  }
  return {
    profileId: identifier(record.profileId, `${label}.profileId`),
    status,
    validFrom,
    validUntil,
    builder,
    reviewer,
    forbiddenAuthorityKeyIds,
  };
}

function normalizeAttestorKey<Role extends NativeVerifierAttestorKey['role']>(
  value: unknown,
  role: Role,
  label: string,
): NativeVerifierAttestorKey & { role: Role } {
  assertExactKeys(value, [
    'role',
    'organizationId',
    'keyIdHex',
    'publicKeySpkiDerHex',
  ], label);
  const record = value as Record<string, unknown>;
  if (record.role !== role) throw new Error(`${label}.role must be ${role}`);
  return {
    role,
    organizationId: identifier(record.organizationId, `${label}.organizationId`),
    keyIdHex: fixedHex(record.keyIdHex, 32, `${label}.keyIdHex`),
    publicKeySpkiDerHex: variableHex(
      record.publicKeySpkiDerHex,
      `${label}.publicKeySpkiDerHex`,
      1_024,
    ),
  };
}

function normalizeAttestationPacket(value: unknown): NativeVerifierAttestationPacket {
  assertExactKeys(value, ['statement', 'statementDigestHex', 'signatures'], 'native verifier attestation packet');
  const record = value as Record<string, unknown>;
  assertExactKeys(record.signatures, ['builder', 'reviewer'], 'native verifier attestation signatures');
  const signatures = record.signatures as Record<string, unknown>;
  return {
    statement: normalizeStatement(record.statement),
    statementDigestHex: fixedHex(
      record.statementDigestHex,
      32,
      'native verifier attestation statement digest',
    ),
    signatures: {
      builder: normalizeDetachedSignature(signatures.builder, 'builder'),
      reviewer: normalizeDetachedSignature(signatures.reviewer, 'reviewer'),
    },
  };
}

function normalizeDetachedSignature(value: unknown, label: string): {
  keyIdHex: string;
  signatureHex: string;
} {
  assertExactKeys(value, ['keyIdHex', 'signatureHex'], `native verifier ${label} signature`);
  const record = value as Record<string, unknown>;
  return {
    keyIdHex: fixedHex(record.keyIdHex, 32, `native verifier ${label} key ID`),
    signatureHex: fixedHex(record.signatureHex, 64, `native verifier ${label} signature`),
  };
}

function normalizeStatement(value: unknown): NativeVerifierAttestationStatement {
  assertExactKeys(value, [
    'schema',
    'profileId',
    'attestationId',
    'canonicalization',
    'signatureAlgorithm',
    'timestamps',
    'source',
    'dependencies',
    'tools',
    'build',
    'containment',
    'artifacts',
    'executionPolicySha256',
    'conformance',
    'actors',
    'boundaries',
  ], 'native verifier attestation statement');
  const record = value as Record<string, unknown>;
  if (record.schema !== NATIVE_VERIFIER_ATTESTATION_STATEMENT_SCHEMA) {
    throw new Error('native verifier attestation statement schema is unsupported');
  }
  if (
    record.canonicalization !== CANONICALIZATION
    || record.signatureAlgorithm !== SIGNATURE_ALGORITHM
  ) {
    throw new Error('native verifier attestation statement identity is unsupported');
  }
  return {
    schema: NATIVE_VERIFIER_ATTESTATION_STATEMENT_SCHEMA,
    profileId: identifier(record.profileId, 'native verifier attestation profileId'),
    attestationId: identifier(record.attestationId, 'native verifier attestation attestationId'),
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    timestamps: normalizeTimestamps(record.timestamps),
    source: normalizeSource(record.source),
    dependencies: normalizeDependencies(record.dependencies),
    tools: normalizeTools(record.tools),
    build: normalizeBuild(record.build),
    containment: normalizeContainment(record.containment),
    artifacts: normalizeArtifacts(record.artifacts),
    executionPolicySha256: fixedHex(
      record.executionPolicySha256,
      32,
      'native verifier execution policy digest',
    ),
    conformance: normalizeConformance(record.conformance),
    actors: normalizeActors(record.actors),
    boundaries: normalizeBoundaries(record.boundaries),
  };
}

function normalizeTimestamps(value: unknown): NativeVerifierAttestationStatement['timestamps'] {
  assertExactKeys(value, ['builtAt', 'reviewedAt'], 'native verifier attestation timestamps');
  const record = value as Record<string, unknown>;
  return {
    builtAt: isoTimestamp(record.builtAt, 'native verifier build timestamp'),
    reviewedAt: isoTimestamp(record.reviewedAt, 'native verifier review timestamp'),
  };
}

function normalizeSource(value: unknown): NativeVerifierAttestationStatement['source'] {
  assertExactKeys(value, [
    'consensusSourceLockSha256',
    'frontierCommit',
    'frontierPatchSha256',
    'cargoLockGitBlobId',
    'verifierSourceManifestSha256',
  ], 'native verifier attestation source');
  const record = value as Record<string, unknown>;
  return {
    consensusSourceLockSha256: fixedHex(record.consensusSourceLockSha256, 32, 'consensus source lock digest'),
    frontierCommit: fixedHex(record.frontierCommit, 20, 'Frontier commit'),
    frontierPatchSha256: fixedHex(record.frontierPatchSha256, 32, 'Frontier patch digest'),
    cargoLockGitBlobId: fixedHex(record.cargoLockGitBlobId, 20, 'Cargo.lock Git blob ID'),
    verifierSourceManifestSha256: fixedHex(
      record.verifierSourceManifestSha256,
      32,
      'native verifier source manifest digest',
    ),
  };
}

function normalizeDependencies(value: unknown): NativeVerifierAttestationStatement['dependencies'] {
  assertExactKeys(value, [
    'mode',
    'manifestSha256',
    'crateCount',
    'cargoLocked',
    'cargoOffline',
    'cargoFrozen',
    'sharedMutableCacheUsed',
  ], 'native verifier dependency closure');
  const record = value as Record<string, unknown>;
  return {
    mode: record.mode as 'vendored-content-addressed',
    manifestSha256: fixedHex(record.manifestSha256, 32, 'dependency closure manifest digest'),
    crateCount: positiveSafeInteger(record.crateCount, 'dependency closure crate count'),
    cargoLocked: record.cargoLocked as true,
    cargoOffline: record.cargoOffline as true,
    cargoFrozen: record.cargoFrozen as true,
    sharedMutableCacheUsed: record.sharedMutableCacheUsed as false,
  };
}

function normalizeTools(value: unknown): NativeVerifierAttestationStatement['tools'] {
  assertExactKeys(value, [
    'completeClosureManifestSha256',
    'toolCount',
    'includesCompilerDriver',
    'includesLinker',
    'includesWindowsSdk',
    'includesInvokedHelpers',
  ], 'native verifier build-tool closure');
  const record = value as Record<string, unknown>;
  return {
    completeClosureManifestSha256: fixedHex(
      record.completeClosureManifestSha256,
      32,
      'complete build-tool closure manifest digest',
    ),
    toolCount: positiveSafeInteger(record.toolCount, 'complete build-tool closure tool count'),
    includesCompilerDriver: record.includesCompilerDriver as true,
    includesLinker: record.includesLinker as true,
    includesWindowsSdk: record.includesWindowsSdk as true,
    includesInvokedHelpers: record.includesInvokedHelpers as true,
  };
}

function normalizeBuild(value: unknown): NativeVerifierAttestationStatement['build'] {
  assertExactKeys(value, [
    'platform',
    'rustTarget',
    'profile',
    'cargoArguments',
    'workingTreeIdentitySha256',
    'environmentAllowlistSha256',
    'freshEmptyTarget',
    'preexistingOutputsRejected',
    'sourceValidatedBeforeAndAfter',
  ], 'native verifier attested build');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.cargoArguments)
    || record.cargoArguments.some(argument => typeof argument !== 'string')) {
    throw new Error('native verifier attested build cargoArguments must be strings');
  }
  return {
    platform: record.platform as 'win32-x64',
    rustTarget: record.rustTarget as 'x86_64-pc-windows-msvc',
    profile: record.profile as 'release',
    cargoArguments: [...record.cargoArguments] as string[],
    workingTreeIdentitySha256: fixedHex(
      record.workingTreeIdentitySha256,
      32,
      'native verifier working-tree identity',
    ),
    environmentAllowlistSha256: fixedHex(
      record.environmentAllowlistSha256,
      32,
      'native verifier environment allowlist',
    ),
    freshEmptyTarget: record.freshEmptyTarget as true,
    preexistingOutputsRejected: record.preexistingOutputsRejected as true,
    sourceValidatedBeforeAndAfter: record.sourceValidatedBeforeAndAfter as true,
  };
}

function normalizeContainment(value: unknown): NativeVerifierAttestationStatement['containment'] {
  assertExactKeys(value, [
    'mechanism',
    'evidenceSha256',
    'killOnClose',
    'descendantsContained',
    'inheritedHandlesContained',
    'timeoutTerminationTested',
    'outputLimitTerminationTested',
  ], 'native verifier process containment');
  const record = value as Record<string, unknown>;
  return {
    mechanism: record.mechanism as 'windows-job-object-kill-on-close',
    evidenceSha256: fixedHex(record.evidenceSha256, 32, 'process containment evidence digest'),
    killOnClose: record.killOnClose as true,
    descendantsContained: record.descendantsContained as true,
    inheritedHandlesContained: record.inheritedHandlesContained as true,
    timeoutTerminationTested: record.timeoutTerminationTested as true,
    outputLimitTerminationTested: record.outputLimitTerminationTested as true,
  };
}

function normalizeArtifacts(value: unknown): NativeVerifierAttestationStatement['artifacts'] {
  assertExactKeys(value, ['verifier', 'codec'], 'native verifier artifacts');
  const record = value as Record<string, unknown>;
  return {
    verifier: normalizeArtifact(record.verifier, 'bridge-checkpoint-verifier', 'verifier'),
    codec: normalizeArtifact(record.codec, 'bridge-rpc-proof-codec', 'codec'),
  };
}

function normalizeArtifact<Role extends 'bridge-checkpoint-verifier' | 'bridge-rpc-proof-codec'>(
  value: unknown,
  expectedRole: Role,
  label: string,
): {
  role: Role;
  sha256: string;
  sizeBytes: number;
} {
  assertExactKeys(value, ['role', 'sha256', 'sizeBytes'], `native ${label} artifact`);
  const record = value as Record<string, unknown>;
  if (record.role !== expectedRole) {
    throw new Error('native verifier artifact roles must identify verifier and RPC codec exactly');
  }
  return {
    role: expectedRole,
    sha256: fixedHex(record.sha256, 32, `native ${label} artifact digest`),
    sizeBytes: positiveSafeInteger(record.sizeBytes, `native ${label} artifact size`),
  };
}

function normalizeConformance(value: unknown): NativeVerifierAttestationStatement['conformance'] {
  assertExactKeys(value, [
    'nativeCheckpointVectorSha256',
    'frontierBurnVectorSha256',
    'outputManifestSha256',
    'status',
  ], 'native verifier conformance');
  const record = value as Record<string, unknown>;
  if (record.status !== 'PASS') throw new Error('native verifier conformance status must be PASS');
  return {
    nativeCheckpointVectorSha256: fixedHex(
      record.nativeCheckpointVectorSha256,
      32,
      'native checkpoint vector digest',
    ),
    frontierBurnVectorSha256: fixedHex(
      record.frontierBurnVectorSha256,
      32,
      'Frontier burn vector digest',
    ),
    outputManifestSha256: fixedHex(
      record.outputManifestSha256,
      32,
      'native conformance output manifest digest',
    ),
    status: 'PASS',
  };
}

function normalizeActors(value: unknown): NativeVerifierAttestationStatement['actors'] {
  assertExactKeys(value, [
    'builderKeyIdHex',
    'builderOrganizationId',
    'reviewerKeyIdHex',
    'reviewerOrganizationId',
  ], 'native verifier attestation actors');
  const record = value as Record<string, unknown>;
  return {
    builderKeyIdHex: fixedHex(record.builderKeyIdHex, 32, 'builder key ID'),
    builderOrganizationId: identifier(record.builderOrganizationId, 'builder organization ID'),
    reviewerKeyIdHex: fixedHex(record.reviewerKeyIdHex, 32, 'reviewer key ID'),
    reviewerOrganizationId: identifier(record.reviewerOrganizationId, 'reviewer organization ID'),
  };
}

function normalizeBoundaries(value: unknown): NativeVerifierAttestationStatement['boundaries'] {
  const keys = [
    'externalBuildPerformed',
    'independentReproductionPerformed',
    'completeBuildToolClosureAttested',
    'dependencyClosureAttested',
    'osProcessContainmentAttested',
    'provisioningIntegrated',
    'trackerAttestorSeparated',
    'ergoExtensionAnchorVerified',
    'onChainAcceptanceVerified',
    'committeeBypassPrevented',
    'admissionEligible',
    'gate5Closed',
    'productionReady',
  ];
  assertExactKeys(value, keys, 'native verifier attestation boundaries');
  const record = value as Record<string, unknown>;
  return record as unknown as NativeVerifierAttestationStatement['boundaries'];
}

function assertAttestorSeparation(profile: NativeVerifierAttestorProfile): void {
  if (profile.builder.keyIdHex === profile.reviewer.keyIdHex) {
    throw new Error('native verifier builder and reviewer must use distinct signing keys');
  }
  if (profile.builder.organizationId === profile.reviewer.organizationId) {
    throw new Error('native verifier builder and reviewer must declare distinct organizations');
  }
  for (const keyId of [profile.builder.keyIdHex, profile.reviewer.keyIdHex]) {
    if (profile.forbiddenAuthorityKeyIds.includes(keyId)) {
      throw new Error('native verifier attestor key reuses a forbidden authority key');
    }
  }
}

function assertStatementActors(
  statement: NativeVerifierAttestationStatement,
  packet: NativeVerifierAttestationPacket,
  profile: NativeVerifierAttestorProfile,
): void {
  if (statement.actors.builderKeyIdHex !== profile.builder.keyIdHex) {
    throw new Error('native verifier builder key is not approved by the reviewed policy');
  }
  if (statement.actors.reviewerKeyIdHex !== profile.reviewer.keyIdHex) {
    throw new Error('native verifier reviewer key is not approved by the reviewed policy');
  }
  if (
    statement.actors.builderOrganizationId !== profile.builder.organizationId
    || statement.actors.reviewerOrganizationId !== profile.reviewer.organizationId
  ) {
    throw new Error('native verifier actor organizations do not match the reviewed policy');
  }
  if (
    packet.signatures.builder.keyIdHex !== statement.actors.builderKeyIdHex
    || packet.signatures.reviewer.keyIdHex !== statement.actors.reviewerKeyIdHex
  ) {
    throw new Error('native verifier detached signature key IDs do not match the signed statement');
  }
}

function assertAttestorValidity(
  statement: NativeVerifierAttestationStatement,
  profile: NativeVerifierAttestorProfile,
  evaluatedAtValue: string,
): void {
  const evaluatedAt = Date.parse(isoTimestamp(evaluatedAtValue, 'attestation evaluation timestamp'));
  const validFrom = Date.parse(profile.validFrom);
  const validUntil = Date.parse(profile.validUntil);
  const builtAt = Date.parse(statement.timestamps.builtAt);
  const reviewedAt = Date.parse(statement.timestamps.reviewedAt);
  if (validFrom >= validUntil || builtAt < validFrom || reviewedAt >= validUntil) {
    throw new Error('native verifier attestation timestamps fall outside the reviewed key validity window');
  }
  if (builtAt > reviewedAt || reviewedAt > evaluatedAt) {
    throw new Error('native verifier attestation timestamps are not causally ordered');
  }
  if (evaluatedAt < validFrom || evaluatedAt >= validUntil) {
    throw new Error('native verifier attestor profile is outside its current validity window');
  }
}

function verifiedAttestorPublicKey(attestor: NativeVerifierAttestorKey): KeyObject {
  const der = Buffer.from(attestor.publicKeySpkiDerHex, 'hex');
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw new Error(`native verifier ${attestor.role} public key is not valid SPKI DER`);
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error(`native verifier ${attestor.role} public key must be Ed25519`);
  }
  const canonicalDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  if (!der.equals(canonicalDer)) {
    throw new Error(`native verifier ${attestor.role} public key must use canonical SPKI DER`);
  }
  if (sha256(canonicalDer) !== attestor.keyIdHex) {
    throw new Error(`native verifier ${attestor.role} public key does not match its key ID`);
  }
  return publicKey;
}

function assertCanonicalSourceBinding(
  bridgeRoot: string,
  source: NativeVerifierAttestationStatement['source'],
): void {
  const lockPath = guardedPath(bridgeRoot, resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'));
  const raw = readFileSync(lockPath);
  if (sha256(raw) !== source.consensusSourceLockSha256) {
    throw new Error('native verifier source does not match the canonical consensus source lock');
  }
  const lock = JSON.parse(raw.toString('utf8')) as unknown;
  const record = asRecord(lock, 'consensus source lock');
  const frontier = asRecord(record.frontier, 'consensus source lock Frontier');
  const canonicalPatchSha256 = fixedHex(
    frontier.patchSha256,
    32,
    'canonical Frontier patch',
  );
  const patchPathValue = nonEmptyString(frontier.patchPath, 'canonical Frontier patch path');
  if (isAbsolute(patchPathValue) || patchPathValue.split(/[\\/]/).includes('..')) {
    throw new Error('canonical Frontier patch path must remain relative to the bridge root');
  }
  const patchPath = guardedPath(bridgeRoot, resolve(bridgeRoot, patchPathValue));
  if (sha256(readFileSync(patchPath)) !== canonicalPatchSha256) {
    throw new Error('canonical Frontier patch bytes do not match the consensus source lock');
  }
  if (fixedHex(frontier.commit, 20, 'canonical Frontier commit') !== source.frontierCommit) {
    throw new Error('native verifier Frontier commit does not match the canonical source lock');
  }
  if (canonicalPatchSha256 !== source.frontierPatchSha256) {
    throw new Error('native verifier Frontier patch does not match the canonical source lock');
  }
  if (fixedHex(frontier.cargoLockBlob, 20, 'canonical Cargo.lock blob') !== source.cargoLockGitBlobId) {
    throw new Error('native verifier Cargo.lock blob does not match the canonical source lock');
  }
  if (deriveNativeVerifierSourceManifestSha256(lock) !== source.verifierSourceManifestSha256) {
    throw new Error('native verifier source manifest does not match the canonical source lock');
  }
}

function assertDependencyClosure(value: NativeVerifierAttestationStatement['dependencies']): void {
  if (
    value.mode !== 'vendored-content-addressed'
    || value.cargoLocked !== true
    || value.cargoOffline !== true
    || value.cargoFrozen !== true
    || value.sharedMutableCacheUsed !== false
  ) {
    throw new Error('native verifier dependency closure is incomplete or mutable');
  }
}

function assertToolClosure(value: NativeVerifierAttestationStatement['tools']): void {
  if (
    value.includesCompilerDriver !== true
    || value.includesLinker !== true
    || value.includesWindowsSdk !== true
    || value.includesInvokedHelpers !== true
  ) {
    throw new Error('native verifier complete build-tool closure is incomplete');
  }
}

function assertBuildIsolation(value: NativeVerifierAttestationStatement['build']): void {
  if (
    value.platform !== 'win32-x64'
    || value.rustTarget !== 'x86_64-pc-windows-msvc'
    || value.profile !== 'release'
  ) {
    throw new Error('native verifier attested build platform/profile is unsupported');
  }
  if (canonicalJson(value.cargoArguments) !== canonicalJson(EXPECTED_CARGO_ARGUMENTS)) {
    throw new Error('native verifier attested build Cargo arguments are not the reviewed command');
  }
  if (
    value.freshEmptyTarget !== true
    || value.preexistingOutputsRejected !== true
    || value.sourceValidatedBeforeAndAfter !== true
  ) {
    throw new Error('native verifier build isolation is incomplete');
  }
}

function assertProcessContainment(value: NativeVerifierAttestationStatement['containment']): void {
  if (value.mechanism !== 'windows-job-object-kill-on-close') {
    throw new Error('native verifier process containment mechanism is unsupported');
  }
  if (
    value.killOnClose !== true
    || value.descendantsContained !== true
    || value.inheritedHandlesContained !== true
    || value.timeoutTerminationTested !== true
    || value.outputLimitTerminationTested !== true
  ) {
    throw new Error('native verifier process containment evidence is incomplete');
  }
}

function assertConformanceInputs(
  bridgeRoot: string,
  value: NativeVerifierAttestationStatement['conformance'],
): void {
  const nativeVector = guardedPath(
    bridgeRoot,
    resolve(bridgeRoot, 'relayer', 'test-vectors', 'native-finalized-bridge-checkpoint-v2.json'),
  );
  const frontierVector = guardedPath(
    bridgeRoot,
    resolve(bridgeRoot, 'relayer', 'test-vectors', 'frontier-bridge-event-root-v1.json'),
  );
  if (sha256(readFileSync(nativeVector)) !== value.nativeCheckpointVectorSha256) {
    throw new Error('native checkpoint conformance vector digest does not match the reviewed input');
  }
  if (sha256(readFileSync(frontierVector)) !== value.frontierBurnVectorSha256) {
    throw new Error('Frontier burn conformance vector digest does not match the reviewed input');
  }
}

function assertFailClosedBoundaries(value: NativeVerifierAttestationStatement['boundaries']): void {
  if (
    value.externalBuildPerformed !== true
    || value.independentReproductionPerformed !== true
    || value.completeBuildToolClosureAttested !== true
    || value.dependencyClosureAttested !== true
    || value.osProcessContainmentAttested !== true
  ) {
    throw new Error('native verifier attestation boundary omits required external evidence');
  }
  if (
    value.provisioningIntegrated !== false
    || value.trackerAttestorSeparated !== false
    || value.ergoExtensionAnchorVerified !== false
    || value.onChainAcceptanceVerified !== false
    || value.committeeBypassPrevented !== false
    || value.admissionEligible !== false
    || value.gate5Closed !== false
    || value.productionReady !== false
  ) {
    throw new Error('native verifier attestation makes a premature admission or readiness claim');
  }
}

function verifiedArtifact(
  pathValue: string,
  expected: { sha256: string; sizeBytes: number },
  label: string,
): { path: string; sha256: string } {
  const suppliedPath = requireAbsolutePath(pathValue, `native ${label} artifact path`);
  const linkStatus = lstatSync(suppliedPath);
  if (linkStatus.isSymbolicLink()) {
    throw new Error(`native ${label} artifact path must not be a symbolic link`);
  }
  const path = realpathSync(suppliedPath);
  const status = statSync(path);
  if (!status.isFile()) throw new Error(`native ${label} artifact must be a regular file`);
  if (status.size !== expected.sizeBytes) {
    throw new Error(`native ${label} artifact size does not match the attestation`);
  }
  const digest = sha256(readFileSync(path));
  if (digest !== expected.sha256) {
    throw new Error(`native ${label} artifact digest does not match the attestation`);
  }
  return { path, sha256: digest };
}

function guardedPath(root: string, candidate: string): string {
  const resolved = realpathSync(candidate);
  const pathFromRoot = relative(root, resolved);
  if (pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))) {
    return resolved;
  }
  throw new Error('native verifier canonical input escaped the bridge root');
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return value;
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(value)) {
    throw new Error(`${label} must be a lowercase stable identifier`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${label} must use canonical UTC ISO-8601 form`);
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (typeof clean !== 'string' || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function variableHex(value: unknown, label: string, maxBytes: number): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (
    typeof clean !== 'string'
    || clean.length === 0
    || clean.length % 2 !== 0
    || clean.length > maxBytes * 2
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty hex no larger than ${maxBytes} bytes`);
  }
  return clean.toLowerCase();
}

function assertExactKeys(value: unknown, expected: string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalE2sJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('native verifier attestation canonical JSON permits only safe integers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalE2sJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => {
        if (record[key] === undefined) {
          throw new Error('native verifier attestation canonical JSON forbids undefined values');
        }
        return `${JSON.stringify(key)}:${canonicalE2sJson(record[key])}`;
      })
      .join(',')}}`;
  }
  throw new Error(`native verifier attestation canonical JSON cannot encode ${typeof value}`);
}

const canonicalJson = canonicalE2sJson;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
