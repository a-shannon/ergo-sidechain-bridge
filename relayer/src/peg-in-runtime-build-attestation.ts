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
} from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  canonicalE2sJson,
  deriveNativeVerifierSourceManifestSha256,
} from './independently-attested-native-verifier-profile.js';
import { readBoundedStableArtifact } from './bounded-artifact-read.js';
import {
  MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES,
} from './peg-in-runtime-identity-v2.js';

export const PEG_IN_RUNTIME_BUILD_ATTESTATION_STATEMENT_SCHEMA =
  'e2s.peg-in-runtime-build-attestation-statement.v1' as const;
export const PEG_IN_RUNTIME_BUILD_ATTESTATION_REPORT_SCHEMA =
  'e2s.peg-in-runtime-build-attestation-validation-report.v1' as const;
export const PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_KIND =
  'bridge-peg-in-runtime-build-attestor-lock' as const;
export const PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_SCHEMA_VERSION = 1;

const CANONICALIZATION = 'e2s-canonical-json-v1' as const;
const SIGNATURE_ALGORITHM = 'ed25519' as const;
const ATTESTATION_DOMAIN = Buffer.from(
  'E2S_PEG_IN_RUNTIME_BUILD_ATTESTATION_V1\0',
  'utf8',
);
const PACKET_DOMAIN = Buffer.from(
  'E2S_PEG_IN_RUNTIME_BUILD_ATTESTATION_PACKET_V1\0',
  'utf8',
);
const EXPECTED_RUNTIME_CARGO_ARGUMENTS = [
  'build',
  '--locked',
  '--offline',
  '--frozen',
  '--release',
  '-p',
  'frontier-template-node',
] as const;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANONICAL_BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const CANONICAL_ATTESTOR_LOCK_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'sources',
  'peg-in-runtime-build-attestor-lock.json',
);
const REVIEWED_REPORTS = new WeakSet<object>();
const VALIDATION_REPORTS = new WeakSet<object>();

export interface PegInRuntimeBuildAttestorKey {
  role: 'builder' | 'independent-reviewer';
  organizationId: string;
  keyIdHex: string;
  publicKeySpkiDerHex: string;
}

export interface PegInRuntimeBuildAttestorProfile {
  profileId: string;
  status: 'active' | 'revoked';
  validFrom: string;
  validUntil: string;
  builder: PegInRuntimeBuildAttestorKey & { role: 'builder' };
  reviewer: PegInRuntimeBuildAttestorKey & { role: 'independent-reviewer' };
  forbiddenAuthorityKeyIds: string[];
}

export interface PegInRuntimeBuildAttestorLock {
  schemaVersion: 1;
  kind: typeof PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_KIND;
  canonicalization: typeof CANONICALIZATION;
  signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  profiles: PegInRuntimeBuildAttestorProfile[];
  boundaries: {
    runtimeProfilesCannotAddTrustRoots: true;
    cryptographyDoesNotProveOrganizationalIndependence: true;
    runtimeUpgradeHistoryRequiredForHistoricalAbsence: true;
    cutoverPolicyRequiredForMintAuthority: true;
  };
}

export interface PegInRuntimeBuildAttestationStatement {
  schema: typeof PEG_IN_RUNTIME_BUILD_ATTESTATION_STATEMENT_SCHEMA;
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
    runtimeManifestGitBlobId: string;
    completeSourceManifestSha256: string;
    runtimeSourceManifestSha256: string;
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
    includesRustc: true;
    includesCargo: true;
    includesLinker: true;
    includesWasmOptimizer: true;
    includesInvokedHelpers: true;
  };
  build: {
    platform: 'win32-x64';
    wasmRustTarget: 'wasm32-unknown-unknown';
    profile: 'release';
    cargoArguments: string[];
    workingTreeIdentitySha256: string;
    environmentAllowlistSha256: string;
    freshEmptyTarget: true;
    preexistingOutputsRejected: true;
    sourceValidatedBeforeAndAfter: true;
  };
  artifact: {
    role: 'frontier-template-runtime-compact-wasm';
    sha256: string;
    sizeBytes: number;
  };
  conformance: {
    pegInRuntimeIdentityVectorSha256: string;
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
    runtimeCodeArtifactReviewed: true;
    nativeVerifierAttestedSeparately: true;
    runtimeUpgradeHistoryVerified: false;
    cutoverPolicyVerified: false;
    historicalMintAbsenceVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    admissionEligible: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface PegInRuntimeBuildAttestationPacket {
  statement: PegInRuntimeBuildAttestationStatement;
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

export interface PegInRuntimeBuildAttestationValidationReport {
  schema: typeof PEG_IN_RUNTIME_BUILD_ATTESTATION_REPORT_SCHEMA;
  profileId: string;
  attestationId: string;
  attestation: {
    packetSha256Hex: string;
    statementDigestHex: string;
    policyDigestHex: string;
    builderKeyIdHex: string;
    builderOrganizationId: string;
    reviewerKeyIdHex: string;
    reviewerOrganizationId: string;
    builderSignatureVerified: true;
    reviewerSignatureVerified: true;
    actorKeysDisjoint: true;
    organizationsDeclaredDisjoint: true;
  };
  timestamps: PegInRuntimeBuildAttestationStatement['timestamps'];
  source: PegInRuntimeBuildAttestationStatement['source'];
  dependencies: PegInRuntimeBuildAttestationStatement['dependencies'];
  artifact: PegInRuntimeBuildAttestationStatement['artifact'];
  boundary: {
    relativeToSuppliedPolicy: true;
    reviewedTrustRootsLoaded: boolean;
    exactRuntimeCodeBytesMatched: true;
    completeBuildToolClosureAttested: true;
    dependencyClosureAttested: true;
    organizationalIndependenceCryptographicallyProven: false;
    executionCapabilityIssued: false;
    nativeVerifierAttestedSeparately: true;
    runtimeUpgradeHistoryVerified: false;
    cutoverPolicyVerified: false;
    historicalMintAbsenceVerified: false;
    targetRuntimeBuildIdentityVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    admissionEligible: false;
    gate5Closed: false;
    productionReady: false;
  };
}

declare const REVIEWED_RUNTIME_BUILD_ATTESTATION_BRAND: unique symbol;
export type ReviewedPegInRuntimeBuildAttestation =
  PegInRuntimeBuildAttestationValidationReport & {
    readonly [REVIEWED_RUNTIME_BUILD_ATTESTATION_BRAND]: true;
  };

export function loadReviewedPegInRuntimeBuildAttestorLock():
PegInRuntimeBuildAttestorLock {
  const path = guardedPath(CANONICAL_BRIDGE_ROOT, CANONICAL_ATTESTOR_LOCK_PATH);
  return validatePegInRuntimeBuildAttestorLock(
    JSON.parse(readFileSync(path, 'utf8')) as unknown,
  );
}

export function validatePegInRuntimeBuildAttestorLock(
  value: unknown,
): PegInRuntimeBuildAttestorLock {
  return normalizeAttestorLock(value);
}

export function derivePegInRuntimeBuildAttestorPolicyDigestHex(
  value: unknown,
): string {
  return sha256(
    Buffer.from(canonicalE2sJson(normalizeAttestorLock(value)), 'utf8'),
  );
}

export function validatePegInRuntimeBuildAttestationAgainstPolicy(input: {
  bridgeRoot: string;
  attestorLock: PegInRuntimeBuildAttestorLock;
  packet: PegInRuntimeBuildAttestationPacket;
  runtimeCodePath: string;
  evaluatedAt?: string;
}): PegInRuntimeBuildAttestationValidationReport {
  return validateAttestation({
    ...input,
    reviewedTrustRootsLoaded: false,
  });
}

export function verifyReviewedPegInRuntimeBuildAttestation(input: {
  packet: PegInRuntimeBuildAttestationPacket;
  runtimeCodePath: string;
  evaluatedAt?: string;
}): ReviewedPegInRuntimeBuildAttestation {
  const report = validateAttestation({
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    attestorLock: loadReviewedPegInRuntimeBuildAttestorLock(),
    packet: input.packet,
    runtimeCodePath: input.runtimeCodePath,
    evaluatedAt: input.evaluatedAt,
    reviewedTrustRootsLoaded: true,
  }) as ReviewedPegInRuntimeBuildAttestation;
  REVIEWED_REPORTS.add(report);
  return report;
}

export function assertReviewedPegInRuntimeBuildAttestationProvenance(
  report: unknown,
): asserts report is ReviewedPegInRuntimeBuildAttestation {
  if (!report || typeof report !== 'object' || !REVIEWED_REPORTS.has(report)) {
    throw new Error(
      'reviewed peg-in runtime build attestation provenance is missing',
    );
  }
}

export function assertPegInRuntimeBuildAttestationValidationProvenance(
  report: unknown,
): asserts report is PegInRuntimeBuildAttestationValidationReport {
  if (
    !report
    || typeof report !== 'object'
    || !VALIDATION_REPORTS.has(report)
  ) {
    throw new Error(
      'peg-in runtime build attestation validation provenance is missing',
    );
  }
}

export function canonicalPegInRuntimeBuildAttestationMessage(
  statement: PegInRuntimeBuildAttestationStatement,
): Buffer {
  return Buffer.concat([
    ATTESTATION_DOMAIN,
    Buffer.from(canonicalE2sJson(normalizeStatement(statement)), 'utf8'),
  ]);
}

export function derivePegInRuntimeBuildAttestationPacketSha256Hex(
  packet: PegInRuntimeBuildAttestationPacket,
): string {
  return `0x${sha256(Buffer.concat([
    PACKET_DOMAIN,
    Buffer.from(canonicalE2sJson(normalizePacket(packet)), 'utf8'),
  ]))}`;
}

export function derivePegInRuntimeSourceManifestSha256(value: unknown): string {
  const lock = asRecord(value, 'consensus source lock');
  const frontier = asRecord(lock.frontier, 'consensus source lock Frontier');
  if (!Array.isArray(frontier.files)) {
    throw new Error('consensus source lock Frontier files must be an array');
  }
  const files = frontier.files
    .map((entry, index) => {
      const file = asRecord(
        entry,
        `consensus source lock Frontier files[${index}]`,
      );
      return {
        path: nonEmptyString(
          file.path,
          `consensus source lock Frontier files[${index}].path`,
        ),
        status: nonEmptyString(
          file.status,
          `consensus source lock Frontier files[${index}].status`,
        ),
        baseBlob: file.baseBlob === undefined
          ? null
          : fixedHex(
            file.baseBlob,
            20,
            `consensus source lock Frontier files[${index}].baseBlob`,
          ),
        patchedBlob: fixedHex(
          file.patchedBlob,
          20,
          `consensus source lock Frontier files[${index}].patchedBlob`,
        ),
      };
    })
    .filter(file =>
      file.path === 'Cargo.lock'
      || file.path === 'Cargo.toml'
      || file.path.startsWith('frame/ethereum/')
      || file.path.startsWith('template/runtime/'))
    .sort((left, right) => ordinalCompare(left.path, right.path));
  if (files.length === 0) {
    throw new Error('consensus source lock has no runtime source files');
  }
  return sha256(Buffer.from(canonicalE2sJson({
    commit: fixedHex(frontier.commit, 20, 'Frontier commit'),
    cargoLockBlob: fixedHex(
      frontier.cargoLockBlob,
      20,
      'Cargo.lock Git blob',
    ),
    runtimeManifestBlob: fixedHex(
      frontier.runtimeManifestBlob,
      20,
      'runtime manifest Git blob',
    ),
    patchSha256: fixedHex(
      frontier.patchSha256,
      32,
      'Frontier patch digest',
    ),
    files,
  }), 'utf8'));
}

function validateAttestation(input: {
  bridgeRoot: string;
  attestorLock: PegInRuntimeBuildAttestorLock;
  packet: PegInRuntimeBuildAttestationPacket;
  runtimeCodePath: string;
  evaluatedAt?: string;
  reviewedTrustRootsLoaded: boolean;
}): PegInRuntimeBuildAttestationValidationReport {
  const bridgeRoot = realpathSync(
    requireAbsolutePath(input.bridgeRoot, 'bridge root'),
  );
  const attestorLock = normalizeAttestorLock(input.attestorLock);
  const packet = normalizePacket(input.packet);
  const statement = packet.statement;
  const message = canonicalPegInRuntimeBuildAttestationMessage(statement);
  const statementDigestHex = sha256(message);
  if (packet.statementDigestHex !== statementDigestHex) {
    throw new Error(
      'peg-in runtime build statement digest does not match canonical content',
    );
  }

  const profile = attestorLock.profiles.find(candidate =>
    candidate.profileId === statement.profileId
    && candidate.status === 'active');
  if (!profile) {
    throw new Error(
      'peg-in runtime build attestation has no active profile in the reviewed policy',
    );
  }
  assertAttestorSeparation(profile);
  assertStatementActors(statement, packet, profile);
  assertAttestorValidity(
    statement,
    profile,
    input.evaluatedAt ?? new Date().toISOString(),
  );
  verifyAttestorSignature(
    profile.builder,
    packet.signatures.builder.signatureHex,
    message,
    'builder',
  );
  verifyAttestorSignature(
    profile.reviewer,
    packet.signatures.reviewer.signatureHex,
    message,
    'independent reviewer',
  );

  assertCanonicalSourceBinding(bridgeRoot, statement.source);
  assertDependencyClosure(statement.dependencies);
  assertToolClosure(statement.tools);
  assertBuildIsolation(statement.build);
  assertConformance(bridgeRoot, statement.conformance);
  assertFailClosedBoundaries(statement.boundaries);
  verifiedRuntimeArtifact(input.runtimeCodePath, statement.artifact);

  const report = deepFreeze({
    schema: PEG_IN_RUNTIME_BUILD_ATTESTATION_REPORT_SCHEMA,
    profileId: statement.profileId,
    attestationId: statement.attestationId,
    attestation: {
      packetSha256Hex:
        derivePegInRuntimeBuildAttestationPacketSha256Hex(packet),
      statementDigestHex,
      policyDigestHex: sha256(
        Buffer.from(canonicalE2sJson(attestorLock), 'utf8'),
      ),
      builderKeyIdHex: statement.actors.builderKeyIdHex,
      builderOrganizationId: statement.actors.builderOrganizationId,
      reviewerKeyIdHex: statement.actors.reviewerKeyIdHex,
      reviewerOrganizationId: statement.actors.reviewerOrganizationId,
      builderSignatureVerified: true as const,
      reviewerSignatureVerified: true as const,
      actorKeysDisjoint: true as const,
      organizationsDeclaredDisjoint: true as const,
    },
    timestamps: statement.timestamps,
    source: statement.source,
    dependencies: statement.dependencies,
    artifact: statement.artifact,
    boundary: {
      relativeToSuppliedPolicy: true as const,
      reviewedTrustRootsLoaded: input.reviewedTrustRootsLoaded,
      exactRuntimeCodeBytesMatched: true as const,
      completeBuildToolClosureAttested: true as const,
      dependencyClosureAttested: true as const,
      organizationalIndependenceCryptographicallyProven: false as const,
      executionCapabilityIssued: false as const,
      nativeVerifierAttestedSeparately: true as const,
      runtimeUpgradeHistoryVerified: false as const,
      cutoverPolicyVerified: false as const,
      historicalMintAbsenceVerified: false as const,
      targetRuntimeBuildIdentityVerified: false as const,
      runtimeCodeIdentityVerified: false as const,
      committedVaultTransitionVerified: false as const,
      mintAuthorityGranted: false as const,
      admissionEligible: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  }) as PegInRuntimeBuildAttestationValidationReport;
  VALIDATION_REPORTS.add(report);
  return report;
}

function normalizeAttestorLock(value: unknown): PegInRuntimeBuildAttestorLock {
  const record = exactRecord(value, [
    'boundaries',
    'canonicalization',
    'kind',
    'profiles',
    'schemaVersion',
    'signatureAlgorithm',
  ], 'peg-in runtime build attestor lock');
  if (
    record.schemaVersion !== PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_SCHEMA_VERSION
    || record.kind !== PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_KIND
    || record.canonicalization !== CANONICALIZATION
    || record.signatureAlgorithm !== SIGNATURE_ALGORITHM
  ) {
    throw new Error('peg-in runtime build attestor lock identity is unsupported');
  }
  if (!Array.isArray(record.profiles)) {
    throw new Error('peg-in runtime build attestor profiles must be an array');
  }
  const profiles = record.profiles.map((profile, index) =>
    normalizeAttestorProfile(profile, index));
  const profileIds = new Set<string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.profileId)) {
      throw new Error('peg-in runtime build attestor profile IDs must be unique');
    }
    profileIds.add(profile.profileId);
  }
  const boundaries = exactRecord(record.boundaries, [
    'cryptographyDoesNotProveOrganizationalIndependence',
    'cutoverPolicyRequiredForMintAuthority',
    'runtimeProfilesCannotAddTrustRoots',
    'runtimeUpgradeHistoryRequiredForHistoricalAbsence',
  ], 'peg-in runtime build attestor lock boundaries');
  if (
    boundaries.runtimeProfilesCannotAddTrustRoots !== true
    || boundaries.cryptographyDoesNotProveOrganizationalIndependence !== true
    || boundaries.runtimeUpgradeHistoryRequiredForHistoricalAbsence !== true
    || boundaries.cutoverPolicyRequiredForMintAuthority !== true
  ) {
    throw new Error(
      'peg-in runtime build attestor lock must preserve fail-closed boundaries',
    );
  }
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: PEG_IN_RUNTIME_BUILD_ATTESTOR_LOCK_KIND,
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    profiles,
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true as const,
      cryptographyDoesNotProveOrganizationalIndependence: true as const,
      runtimeUpgradeHistoryRequiredForHistoricalAbsence: true as const,
      cutoverPolicyRequiredForMintAuthority: true as const,
    },
  });
}

function normalizeAttestorProfile(
  value: unknown,
  index: number,
): PegInRuntimeBuildAttestorProfile {
  const record = exactRecord(value, [
    'builder',
    'forbiddenAuthorityKeyIds',
    'profileId',
    'reviewer',
    'status',
    'validFrom',
    'validUntil',
  ], `peg-in runtime build attestor profiles[${index}]`);
  if (record.status !== 'active' && record.status !== 'revoked') {
    throw new Error('peg-in runtime build attestor profile status is unsupported');
  }
  if (!Array.isArray(record.forbiddenAuthorityKeyIds)) {
    throw new Error(
      'peg-in runtime build forbidden authority key IDs must be an array',
    );
  }
  const profile: PegInRuntimeBuildAttestorProfile = {
    profileId: identifier(record.profileId, 'runtime build profile ID'),
    status: record.status,
    validFrom: isoTimestamp(record.validFrom, 'runtime build profile validFrom'),
    validUntil: isoTimestamp(
      record.validUntil,
      'runtime build profile validUntil',
    ),
    builder: normalizeAttestorKey(record.builder, 'builder'),
    reviewer: normalizeAttestorKey(record.reviewer, 'independent-reviewer'),
    forbiddenAuthorityKeyIds: record.forbiddenAuthorityKeyIds.map(
      (keyId, keyIndex) => fixedHex(
        keyId,
        32,
        `runtime build forbidden authority key IDs[${keyIndex}]`,
      ),
    ),
  };
  if (Date.parse(profile.validFrom) >= Date.parse(profile.validUntil)) {
    throw new Error('peg-in runtime build attestor validity window is invalid');
  }
  return profile;
}

function normalizeAttestorKey<Role extends PegInRuntimeBuildAttestorKey['role']>(
  value: unknown,
  expectedRole: Role,
): PegInRuntimeBuildAttestorKey & { role: Role } {
  const record = exactRecord(value, [
    'keyIdHex',
    'organizationId',
    'publicKeySpkiDerHex',
    'role',
  ], `peg-in runtime build ${expectedRole} key`);
  if (record.role !== expectedRole) {
    throw new Error(`peg-in runtime build key role must be ${expectedRole}`);
  }
  return {
    role: expectedRole,
    organizationId: identifier(
      record.organizationId,
      `${expectedRole} organization ID`,
    ),
    keyIdHex: fixedHex(record.keyIdHex, 32, `${expectedRole} key ID`),
    publicKeySpkiDerHex: variableHex(
      record.publicKeySpkiDerHex,
      `${expectedRole} public key`,
      1024,
    ),
  };
}

function normalizePacket(
  value: unknown,
): PegInRuntimeBuildAttestationPacket {
  const record = exactRecord(value, [
    'signatures',
    'statement',
    'statementDigestHex',
  ], 'peg-in runtime build attestation packet');
  const signatures = exactRecord(
    record.signatures,
    ['builder', 'reviewer'],
    'peg-in runtime build signatures',
  );
  return {
    statement: normalizeStatement(record.statement),
    statementDigestHex: fixedHex(
      record.statementDigestHex,
      32,
      'peg-in runtime build statement digest',
    ),
    signatures: {
      builder: normalizeSignature(signatures.builder, 'builder'),
      reviewer: normalizeSignature(signatures.reviewer, 'reviewer'),
    },
  };
}

function normalizeSignature(
  value: unknown,
  label: string,
): { keyIdHex: string; signatureHex: string } {
  const record = exactRecord(
    value,
    ['keyIdHex', 'signatureHex'],
    `peg-in runtime build ${label} signature`,
  );
  return {
    keyIdHex: fixedHex(record.keyIdHex, 32, `${label} key ID`),
    signatureHex: fixedHex(record.signatureHex, 64, `${label} signature`),
  };
}

function normalizeStatement(
  value: unknown,
): PegInRuntimeBuildAttestationStatement {
  const record = exactRecord(value, [
    'actors',
    'artifact',
    'attestationId',
    'boundaries',
    'build',
    'canonicalization',
    'conformance',
    'dependencies',
    'profileId',
    'schema',
    'signatureAlgorithm',
    'source',
    'timestamps',
    'tools',
  ], 'peg-in runtime build attestation statement');
  if (
    record.schema !== PEG_IN_RUNTIME_BUILD_ATTESTATION_STATEMENT_SCHEMA
    || record.canonicalization !== CANONICALIZATION
    || record.signatureAlgorithm !== SIGNATURE_ALGORITHM
  ) {
    throw new Error(
      'peg-in runtime build attestation statement identity is unsupported',
    );
  }
  return {
    schema: PEG_IN_RUNTIME_BUILD_ATTESTATION_STATEMENT_SCHEMA,
    profileId: identifier(record.profileId, 'runtime build profile ID'),
    attestationId: identifier(record.attestationId, 'runtime build attestation ID'),
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    timestamps: normalizeTimestamps(record.timestamps),
    source: normalizeSource(record.source),
    dependencies: normalizeDependencies(record.dependencies),
    tools: normalizeTools(record.tools),
    build: normalizeBuild(record.build),
    artifact: normalizeArtifact(record.artifact),
    conformance: normalizeConformance(record.conformance),
    actors: normalizeActors(record.actors),
    boundaries: normalizeBoundaries(record.boundaries),
  };
}

function normalizeTimestamps(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['timestamps'] {
  const record = exactRecord(
    value,
    ['builtAt', 'reviewedAt'],
    'peg-in runtime build timestamps',
  );
  return {
    builtAt: isoTimestamp(record.builtAt, 'runtime builtAt'),
    reviewedAt: isoTimestamp(record.reviewedAt, 'runtime reviewedAt'),
  };
}

function normalizeSource(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['source'] {
  const record = exactRecord(value, [
    'cargoLockGitBlobId',
    'completeSourceManifestSha256',
    'consensusSourceLockSha256',
    'frontierCommit',
    'frontierPatchSha256',
    'runtimeManifestGitBlobId',
    'runtimeSourceManifestSha256',
  ], 'peg-in runtime build source');
  return {
    consensusSourceLockSha256: fixedHex(
      record.consensusSourceLockSha256,
      32,
      'consensus source lock digest',
    ),
    frontierCommit: fixedHex(record.frontierCommit, 20, 'Frontier commit'),
    frontierPatchSha256: fixedHex(
      record.frontierPatchSha256,
      32,
      'Frontier patch digest',
    ),
    cargoLockGitBlobId: fixedHex(
      record.cargoLockGitBlobId,
      20,
      'Cargo.lock Git blob',
    ),
    runtimeManifestGitBlobId: fixedHex(
      record.runtimeManifestGitBlobId,
      20,
      'runtime manifest Git blob',
    ),
    completeSourceManifestSha256: fixedHex(
      record.completeSourceManifestSha256,
      32,
      'complete source manifest digest',
    ),
    runtimeSourceManifestSha256: fixedHex(
      record.runtimeSourceManifestSha256,
      32,
      'runtime source manifest digest',
    ),
  };
}

function normalizeDependencies(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['dependencies'] {
  const record = exactRecord(value, [
    'cargoFrozen',
    'cargoLocked',
    'cargoOffline',
    'crateCount',
    'manifestSha256',
    'mode',
    'sharedMutableCacheUsed',
  ], 'peg-in runtime build dependencies');
  return {
    mode: record.mode as 'vendored-content-addressed',
    manifestSha256: fixedHex(
      record.manifestSha256,
      32,
      'runtime dependency manifest digest',
    ),
    crateCount: positiveSafeInteger(
      record.crateCount,
      'runtime dependency crate count',
    ),
    cargoLocked: record.cargoLocked as true,
    cargoOffline: record.cargoOffline as true,
    cargoFrozen: record.cargoFrozen as true,
    sharedMutableCacheUsed: record.sharedMutableCacheUsed as false,
  };
}

function normalizeTools(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['tools'] {
  const record = exactRecord(value, [
    'completeClosureManifestSha256',
    'includesCargo',
    'includesInvokedHelpers',
    'includesLinker',
    'includesRustc',
    'includesWasmOptimizer',
    'toolCount',
  ], 'peg-in runtime build tools');
  return {
    completeClosureManifestSha256: fixedHex(
      record.completeClosureManifestSha256,
      32,
      'runtime build-tool closure digest',
    ),
    toolCount: positiveSafeInteger(record.toolCount, 'runtime build tool count'),
    includesRustc: record.includesRustc as true,
    includesCargo: record.includesCargo as true,
    includesLinker: record.includesLinker as true,
    includesWasmOptimizer: record.includesWasmOptimizer as true,
    includesInvokedHelpers: record.includesInvokedHelpers as true,
  };
}

function normalizeBuild(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['build'] {
  const record = exactRecord(value, [
    'cargoArguments',
    'environmentAllowlistSha256',
    'freshEmptyTarget',
    'platform',
    'preexistingOutputsRejected',
    'profile',
    'sourceValidatedBeforeAndAfter',
    'wasmRustTarget',
    'workingTreeIdentitySha256',
  ], 'peg-in runtime build');
  return {
    platform: record.platform as 'win32-x64',
    wasmRustTarget: record.wasmRustTarget as 'wasm32-unknown-unknown',
    profile: record.profile as 'release',
    cargoArguments: stringArray(
      record.cargoArguments,
      'runtime Cargo arguments',
    ),
    workingTreeIdentitySha256: fixedHex(
      record.workingTreeIdentitySha256,
      32,
      'runtime build working-tree identity',
    ),
    environmentAllowlistSha256: fixedHex(
      record.environmentAllowlistSha256,
      32,
      'runtime build environment allowlist',
    ),
    freshEmptyTarget: record.freshEmptyTarget as true,
    preexistingOutputsRejected: record.preexistingOutputsRejected as true,
    sourceValidatedBeforeAndAfter:
      record.sourceValidatedBeforeAndAfter as true,
  };
}

function normalizeArtifact(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['artifact'] {
  const record = exactRecord(
    value,
    ['role', 'sha256', 'sizeBytes'],
    'peg-in runtime code artifact',
  );
  if (record.role !== 'frontier-template-runtime-compact-wasm') {
    throw new Error('peg-in runtime code artifact role is unsupported');
  }
  return {
    role: 'frontier-template-runtime-compact-wasm',
    sha256: fixedHex(record.sha256, 32, 'runtime code artifact digest'),
    sizeBytes: positiveSafeInteger(record.sizeBytes, 'runtime code artifact size'),
  };
}

function normalizeConformance(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['conformance'] {
  const record = exactRecord(value, [
    'outputManifestSha256',
    'pegInRuntimeIdentityVectorSha256',
    'status',
  ], 'peg-in runtime build conformance');
  if (record.status !== 'PASS') {
    throw new Error('peg-in runtime build conformance status must be PASS');
  }
  return {
    pegInRuntimeIdentityVectorSha256: fixedHex(
      record.pegInRuntimeIdentityVectorSha256,
      32,
      'peg-in runtime identity vector digest',
    ),
    outputManifestSha256: fixedHex(
      record.outputManifestSha256,
      32,
      'runtime build conformance output manifest digest',
    ),
    status: 'PASS',
  };
}

function normalizeActors(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['actors'] {
  const record = exactRecord(value, [
    'builderKeyIdHex',
    'builderOrganizationId',
    'reviewerKeyIdHex',
    'reviewerOrganizationId',
  ], 'peg-in runtime build actors');
  return {
    builderKeyIdHex: fixedHex(record.builderKeyIdHex, 32, 'builder key ID'),
    builderOrganizationId: identifier(
      record.builderOrganizationId,
      'builder organization ID',
    ),
    reviewerKeyIdHex: fixedHex(record.reviewerKeyIdHex, 32, 'reviewer key ID'),
    reviewerOrganizationId: identifier(
      record.reviewerOrganizationId,
      'reviewer organization ID',
    ),
  };
}

function normalizeBoundaries(
  value: unknown,
): PegInRuntimeBuildAttestationStatement['boundaries'] {
  return exactRecord(value, [
    'admissionEligible',
    'committedVaultTransitionVerified',
    'completeBuildToolClosureAttested',
    'cutoverPolicyVerified',
    'dependencyClosureAttested',
    'externalBuildPerformed',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'independentReproductionPerformed',
    'mintAuthorityGranted',
    'nativeVerifierAttestedSeparately',
    'productionReady',
    'runtimeCodeArtifactReviewed',
    'runtimeUpgradeHistoryVerified',
  ], 'peg-in runtime build boundaries') as unknown as
  PegInRuntimeBuildAttestationStatement['boundaries'];
}

function assertAttestorSeparation(
  profile: PegInRuntimeBuildAttestorProfile,
): void {
  if (profile.builder.keyIdHex === profile.reviewer.keyIdHex) {
    throw new Error(
      'peg-in runtime build builder and reviewer must use distinct keys',
    );
  }
  if (profile.builder.organizationId === profile.reviewer.organizationId) {
    throw new Error(
      'peg-in runtime build builder and reviewer must declare distinct organizations',
    );
  }
  for (const actor of [profile.builder, profile.reviewer]) {
    if (profile.forbiddenAuthorityKeyIds.includes(actor.keyIdHex)) {
      throw new Error(
        'peg-in runtime build attestors must be separate from bridge authorities',
      );
    }
  }
}

function assertStatementActors(
  statement: PegInRuntimeBuildAttestationStatement,
  packet: PegInRuntimeBuildAttestationPacket,
  profile: PegInRuntimeBuildAttestorProfile,
): void {
  if (
    statement.actors.builderKeyIdHex !== profile.builder.keyIdHex
    || statement.actors.builderOrganizationId !== profile.builder.organizationId
    || statement.actors.reviewerKeyIdHex !== profile.reviewer.keyIdHex
    || statement.actors.reviewerOrganizationId
      !== profile.reviewer.organizationId
    || packet.signatures.builder.keyIdHex !== profile.builder.keyIdHex
    || packet.signatures.reviewer.keyIdHex !== profile.reviewer.keyIdHex
  ) {
    throw new Error(
      'peg-in runtime build attestation actors do not match the reviewed profile',
    );
  }
}

function assertAttestorValidity(
  statement: PegInRuntimeBuildAttestationStatement,
  profile: PegInRuntimeBuildAttestorProfile,
  evaluatedAtInput: string,
): void {
  const evaluatedAt = isoTimestamp(
    evaluatedAtInput,
    'runtime build evaluation timestamp',
  );
  const builtAt = Date.parse(statement.timestamps.builtAt);
  const reviewedAt = Date.parse(statement.timestamps.reviewedAt);
  if (builtAt > reviewedAt) {
    throw new Error('peg-in runtime build review predates the build');
  }
  if (Date.parse(evaluatedAt) < reviewedAt) {
    throw new Error(
      'peg-in runtime build attestation review is not yet effective',
    );
  }
  if (
    builtAt < Date.parse(profile.validFrom)
    || reviewedAt > Date.parse(profile.validUntil)
    || Date.parse(evaluatedAt) < Date.parse(profile.validFrom)
    || Date.parse(evaluatedAt) > Date.parse(profile.validUntil)
  ) {
    throw new Error(
      'peg-in runtime build attestation is outside the profile validity window',
    );
  }
}

function verifyAttestorSignature(
  attestor: PegInRuntimeBuildAttestorKey,
  signatureHex: string,
  message: Buffer,
  label: string,
): void {
  const publicKey = verifiedAttestorPublicKey(attestor);
  if (!verifySignature(
    null,
    message,
    publicKey,
    Buffer.from(signatureHex, 'hex'),
  )) {
    throw new Error(`peg-in runtime build ${label} signature is invalid`);
  }
}

function verifiedAttestorPublicKey(
  attestor: PegInRuntimeBuildAttestorKey,
): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: Buffer.from(attestor.publicKeySpkiDerHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new Error('peg-in runtime build attestor public key is invalid', {
      cause: error,
    });
  }
  const der = key.export({ type: 'spki', format: 'der' });
  if (sha256(der) !== attestor.keyIdHex) {
    throw new Error(
      'peg-in runtime build attestor key ID does not match its public key',
    );
  }
  return key;
}

function assertCanonicalSourceBinding(
  bridgeRoot: string,
  source: PegInRuntimeBuildAttestationStatement['source'],
): void {
  const path = guardedPath(
    bridgeRoot,
    resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
  );
  const bytes = readFileSync(path);
  if (sha256(bytes) !== source.consensusSourceLockSha256) {
    throw new Error(
      'peg-in runtime build source lock digest does not match canonical bytes',
    );
  }
  const lock = JSON.parse(bytes.toString('utf8')) as unknown;
  const frontier = asRecord(
    asRecord(lock, 'consensus source lock').frontier,
    'consensus source lock Frontier',
  );
  if (
    fixedHex(frontier.commit, 20, 'Frontier commit') !== source.frontierCommit
    || fixedHex(frontier.patchSha256, 32, 'Frontier patch digest')
      !== source.frontierPatchSha256
    || fixedHex(frontier.cargoLockBlob, 20, 'Cargo.lock Git blob')
      !== source.cargoLockGitBlobId
    || fixedHex(frontier.runtimeManifestBlob, 20, 'runtime manifest Git blob')
      !== source.runtimeManifestGitBlobId
    || deriveNativeVerifierSourceManifestSha256(lock)
      !== source.completeSourceManifestSha256
    || derivePegInRuntimeSourceManifestSha256(lock)
      !== source.runtimeSourceManifestSha256
  ) {
    throw new Error(
      'peg-in runtime build source identity does not match the canonical lock',
    );
  }
}

function assertDependencyClosure(
  dependencies: PegInRuntimeBuildAttestationStatement['dependencies'],
): void {
  if (
    dependencies.mode !== 'vendored-content-addressed'
    || dependencies.cargoLocked !== true
    || dependencies.cargoOffline !== true
    || dependencies.cargoFrozen !== true
    || dependencies.sharedMutableCacheUsed !== false
  ) {
    throw new Error(
      'peg-in runtime build dependency closure is not fail-closed',
    );
  }
}

function assertToolClosure(
  tools: PegInRuntimeBuildAttestationStatement['tools'],
): void {
  if (
    tools.includesRustc !== true
    || tools.includesCargo !== true
    || tools.includesLinker !== true
    || tools.includesWasmOptimizer !== true
    || tools.includesInvokedHelpers !== true
  ) {
    throw new Error('peg-in runtime build tool closure is incomplete');
  }
}

function assertBuildIsolation(
  build: PegInRuntimeBuildAttestationStatement['build'],
): void {
  if (
    build.platform !== 'win32-x64'
    || build.wasmRustTarget !== 'wasm32-unknown-unknown'
    || build.profile !== 'release'
    || !sameStringArray(build.cargoArguments, EXPECTED_RUNTIME_CARGO_ARGUMENTS)
    || build.freshEmptyTarget !== true
    || build.preexistingOutputsRejected !== true
    || build.sourceValidatedBeforeAndAfter !== true
  ) {
    throw new Error(
      'peg-in runtime build isolation or command identity is unsupported',
    );
  }
}

function assertConformance(
  bridgeRoot: string,
  conformance: PegInRuntimeBuildAttestationStatement['conformance'],
): void {
  const path = guardedPath(
    bridgeRoot,
    resolve(
      bridgeRoot,
      'relayer',
      'test-vectors',
      'native-finalized-peg-in-runtime-identity-v2.json',
    ),
  );
  if (
    sha256(readFileSync(path))
    !== conformance.pegInRuntimeIdentityVectorSha256
  ) {
    throw new Error(
      'peg-in runtime build conformance vector digest does not match canonical bytes',
    );
  }
}

function assertFailClosedBoundaries(
  boundaries: PegInRuntimeBuildAttestationStatement['boundaries'],
): void {
  if (
    boundaries.externalBuildPerformed !== true
    || boundaries.independentReproductionPerformed !== true
    || boundaries.completeBuildToolClosureAttested !== true
    || boundaries.dependencyClosureAttested !== true
    || boundaries.runtimeCodeArtifactReviewed !== true
    || boundaries.nativeVerifierAttestedSeparately !== true
    || boundaries.runtimeUpgradeHistoryVerified !== false
    || boundaries.cutoverPolicyVerified !== false
    || boundaries.historicalMintAbsenceVerified !== false
    || boundaries.committedVaultTransitionVerified !== false
    || boundaries.mintAuthorityGranted !== false
    || boundaries.admissionEligible !== false
    || boundaries.gate5Closed !== false
    || boundaries.productionReady !== false
  ) {
    throw new Error(
      'peg-in runtime build attestation makes a premature authority or readiness claim',
    );
  }
}

function verifiedRuntimeArtifact(
  pathValue: string,
  expected: PegInRuntimeBuildAttestationStatement['artifact'],
): void {
  const suppliedPath = requireAbsolutePath(
    pathValue,
    'peg-in runtime code artifact path',
  );
  const linkStatus = lstatSync(suppliedPath);
  if (linkStatus.isSymbolicLink()) {
    throw new Error(
      'peg-in runtime code artifact path must not be a symbolic link',
    );
  }
  const path = realpathSync(suppliedPath);
  const bytes = readBoundedStableArtifact({
    path,
    maxBytes: MAX_PEG_IN_RUNTIME_ARTIFACT_SIZE_BYTES,
    label: 'peg-in runtime code artifact',
  });
  if (bytes.length !== expected.sizeBytes) {
    throw new Error(
      'peg-in runtime code artifact size does not match the attestation',
    );
  }
  if (sha256(bytes) !== expected.sha256) {
    throw new Error(
      'peg-in runtime code artifact digest does not match the attestation',
    );
  }
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = asRecord(value, label);
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  return record;
}

function asRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string, maxBytes: number): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || value.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be bounded lowercase hex`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value)
  ) {
    throw new Error(`${label} must be a portable lowercase stable identifier`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
  ) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  if (new Date(value).toISOString() !== value) {
    throw new Error(`${label} must use canonical UTC ISO-8601 form`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) =>
    nonEmptyString(entry, `${label}[${index}]`));
}

function sameStringArray(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function guardedPath(root: string, candidate: string): string {
  const resolved = realpathSync(candidate);
  const fromRoot = relative(root, resolved);
  if (
    fromRoot === ''
    || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
  ) {
    return resolved;
  }
  throw new Error('peg-in runtime build canonical input escaped the bridge root');
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
  ) {
    throw new Error(`${label} must be an absolute path`);
  }
  return value;
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
