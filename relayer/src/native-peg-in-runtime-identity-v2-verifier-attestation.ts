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
  loadReviewedNativeVerifierAttestorLock,
  validateNativeVerifierAttestorLock,
  type NativeVerifierAttestorKey,
  type NativeVerifierAttestorLock,
  type NativeVerifierAttestorProfile,
} from './independently-attested-native-verifier-profile.js';
import { readBoundedStableArtifact } from './bounded-artifact-read.js';

export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_STATEMENT_SCHEMA =
  'e2s.native-peg-in-runtime-identity-v2-attestation-statement.v1' as const;
export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_REPORT_SCHEMA =
  'e2s.native-peg-in-runtime-identity-v2-attestation-validation-report.v1' as const;
export const MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES =
  64 * 1024 * 1024;

const CANONICALIZATION = 'e2s-canonical-json-v1' as const;
const SIGNATURE_ALGORITHM = 'ed25519' as const;
const ATTESTATION_DOMAIN = Buffer.from(
  'E2S_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_V1\0',
  'utf8',
);
const ATTESTATION_CORE_DOMAIN = Buffer.from(
  'E2S_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_CORE_V1\0',
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
  '--bin',
  'bridge-peg-in-runtime-identity-v2-verifier',
] as const;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANONICAL_BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const REVIEWED_REPORTS = new WeakSet<object>();
const VALIDATION_REPORTS = new WeakSet<object>();

export interface NativePegInRuntimeIdentityV2AttestationStatement {
  schema:
    typeof NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_STATEMENT_SCHEMA;
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
  artifact: {
    role: 'bridge-peg-in-runtime-identity-v2-verifier';
    sha256: string;
    sizeBytes: number;
  };
  executionPolicySha256: string;
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
    nativeV2VerifierArtifactReviewed: true;
    runtimeBuildAttestedSeparately: true;
    executionCapabilityIssued: false;
    targetRuntimeBuildIdentityVerified: false;
    runtimeCodeIdentityVerified: false;
    historicalMintAbsenceVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativePegInRuntimeIdentityV2AttestationPacket {
  statement: NativePegInRuntimeIdentityV2AttestationStatement;
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

export interface NativePegInRuntimeIdentityV2AttestationValidationReport {
  schema: typeof NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_REPORT_SCHEMA;
  profileId: string;
  attestationId: string;
  attestation: {
    statementDigestHex: string;
    statementCoreDigestHex: string;
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
  timestamps: NativePegInRuntimeIdentityV2AttestationStatement['timestamps'];
  source: NativePegInRuntimeIdentityV2AttestationStatement['source'];
  dependencies:
    NativePegInRuntimeIdentityV2AttestationStatement['dependencies'];
  artifact: NativePegInRuntimeIdentityV2AttestationStatement['artifact'];
  executionPolicySha256: string;
  boundary: {
    relativeToSuppliedPolicy: true;
    reviewedTrustRootsLoaded: boolean;
    exactV2VerifierBytesMatched: true;
    completeBuildToolClosureAttested: true;
    dependencyClosureAttested: true;
    organizationalIndependenceCryptographicallyProven: false;
    executionCapabilityIssued: false;
    runtimeBuildAttestedSeparately: true;
    targetRuntimeBuildIdentityVerified: false;
    runtimeCodeIdentityVerified: false;
    historicalMintAbsenceVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

declare const REVIEWED_NATIVE_V2_ATTESTATION_BRAND: unique symbol;
export type ReviewedNativePegInRuntimeIdentityV2Attestation =
  NativePegInRuntimeIdentityV2AttestationValidationReport & {
    readonly [REVIEWED_NATIVE_V2_ATTESTATION_BRAND]: true;
  };

export function validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy(
  input: {
    bridgeRoot: string;
    attestorLock: NativeVerifierAttestorLock;
    packet: NativePegInRuntimeIdentityV2AttestationPacket;
    verifierExecutablePath: string;
    evaluatedAt?: string;
  },
): NativePegInRuntimeIdentityV2AttestationValidationReport {
  return validateAttestation({
    ...input,
    reviewedTrustRootsLoaded: false,
  });
}

export function verifyReviewedNativePegInRuntimeIdentityV2Attestation(input: {
  packet: NativePegInRuntimeIdentityV2AttestationPacket;
  verifierExecutablePath: string;
  evaluatedAt?: string;
}): ReviewedNativePegInRuntimeIdentityV2Attestation {
  const report = validateAttestation({
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    attestorLock: loadReviewedNativeVerifierAttestorLock(),
    packet: input.packet,
    verifierExecutablePath: input.verifierExecutablePath,
    evaluatedAt: input.evaluatedAt,
    reviewedTrustRootsLoaded: true,
  }) as ReviewedNativePegInRuntimeIdentityV2Attestation;
  REVIEWED_REPORTS.add(report);
  return report;
}

export function assertReviewedNativePegInRuntimeIdentityV2AttestationProvenance(
  report: unknown,
): asserts report is ReviewedNativePegInRuntimeIdentityV2Attestation {
  if (!report || typeof report !== 'object' || !REVIEWED_REPORTS.has(report)) {
    throw new Error(
      'reviewed native peg-in runtime identity V2 attestation provenance is missing',
    );
  }
}

export function assertNativePegInRuntimeIdentityV2AttestationValidationProvenance(
  report: unknown,
): asserts report is NativePegInRuntimeIdentityV2AttestationValidationReport {
  if (
    !report
    || typeof report !== 'object'
    || !VALIDATION_REPORTS.has(report)
  ) {
    throw new Error(
      'native peg-in runtime identity V2 attestation validation provenance is missing',
    );
  }
}

export function canonicalNativePegInRuntimeIdentityV2AttestationMessage(
  statement: NativePegInRuntimeIdentityV2AttestationStatement,
): Buffer {
  return Buffer.concat([
    ATTESTATION_DOMAIN,
    Buffer.from(canonicalE2sJson(normalizeStatement(statement)), 'utf8'),
  ]);
}

export function deriveNativePegInRuntimeIdentityV2AttestationCoreDigestHex(
  statement: NativePegInRuntimeIdentityV2AttestationStatement,
): string {
  const normalized = normalizeStatement(statement);
  const {
    executionPolicySha256: _executionPolicySha256,
    ...core
  } = normalized;
  return sha256(Buffer.concat([
    ATTESTATION_CORE_DOMAIN,
    Buffer.from(canonicalE2sJson(core), 'utf8'),
  ]));
}

function validateAttestation(input: {
  bridgeRoot: string;
  attestorLock: NativeVerifierAttestorLock;
  packet: NativePegInRuntimeIdentityV2AttestationPacket;
  verifierExecutablePath: string;
  evaluatedAt?: string;
  reviewedTrustRootsLoaded: boolean;
}): NativePegInRuntimeIdentityV2AttestationValidationReport {
  const bridgeRoot = realpathSync(
    requireAbsolutePath(input.bridgeRoot, 'bridge root'),
  );
  const attestorLock = validateNativeVerifierAttestorLock(input.attestorLock);
  const packet = normalizePacket(input.packet);
  const statement = packet.statement;
  const message =
    canonicalNativePegInRuntimeIdentityV2AttestationMessage(statement);
  const statementDigestHex = sha256(message);
  if (packet.statementDigestHex !== statementDigestHex) {
    throw new Error(
      'native peg-in runtime identity V2 statement digest does not match canonical content',
    );
  }
  const profile = attestorLock.profiles.find(candidate =>
    candidate.profileId === statement.profileId
    && candidate.status === 'active');
  if (!profile) {
    throw new Error(
      'native peg-in runtime identity V2 attestation has no active profile',
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
  verifiedArtifact(input.verifierExecutablePath, statement.artifact);

  const report = deepFreeze({
    schema: NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_REPORT_SCHEMA,
    profileId: statement.profileId,
    attestationId: statement.attestationId,
    attestation: {
      statementDigestHex,
      statementCoreDigestHex:
        deriveNativePegInRuntimeIdentityV2AttestationCoreDigestHex(statement),
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
    executionPolicySha256: statement.executionPolicySha256,
    boundary: {
      relativeToSuppliedPolicy: true as const,
      reviewedTrustRootsLoaded: input.reviewedTrustRootsLoaded,
      exactV2VerifierBytesMatched: true as const,
      completeBuildToolClosureAttested: true as const,
      dependencyClosureAttested: true as const,
      organizationalIndependenceCryptographicallyProven: false as const,
      executionCapabilityIssued: false as const,
      runtimeBuildAttestedSeparately: true as const,
      targetRuntimeBuildIdentityVerified: false as const,
      runtimeCodeIdentityVerified: false as const,
      historicalMintAbsenceVerified: false as const,
      committedVaultTransitionVerified: false as const,
      mintAuthorityGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  }) as NativePegInRuntimeIdentityV2AttestationValidationReport;
  VALIDATION_REPORTS.add(report);
  return report;
}

function normalizePacket(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationPacket {
  const record = exactRecord(value, [
    'signatures',
    'statement',
    'statementDigestHex',
  ], 'native peg-in runtime identity V2 attestation packet');
  const signatures = exactRecord(
    record.signatures,
    ['builder', 'reviewer'],
    'native peg-in runtime identity V2 signatures',
  );
  return {
    statement: normalizeStatement(record.statement),
    statementDigestHex: fixedHex(
      record.statementDigestHex,
      32,
      'native V2 attestation statement digest',
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
    `native V2 ${label} signature`,
  );
  return {
    keyIdHex: fixedHex(record.keyIdHex, 32, `${label} key ID`),
    signatureHex: fixedHex(record.signatureHex, 64, `${label} signature`),
  };
}

function normalizeStatement(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement {
  const record = exactRecord(value, [
    'actors',
    'artifact',
    'attestationId',
    'boundaries',
    'build',
    'canonicalization',
    'conformance',
    'dependencies',
    'executionPolicySha256',
    'profileId',
    'schema',
    'signatureAlgorithm',
    'source',
    'timestamps',
    'tools',
  ], 'native peg-in runtime identity V2 attestation statement');
  if (
    record.schema
      !== NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_STATEMENT_SCHEMA
    || record.canonicalization !== CANONICALIZATION
    || record.signatureAlgorithm !== SIGNATURE_ALGORITHM
  ) {
    throw new Error(
      'native peg-in runtime identity V2 attestation identity is unsupported',
    );
  }
  return {
    schema: NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_ATTESTATION_STATEMENT_SCHEMA,
    profileId: identifier(record.profileId, 'native V2 profile ID'),
    attestationId: identifier(record.attestationId, 'native V2 attestation ID'),
    canonicalization: CANONICALIZATION,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    timestamps: normalizeTimestamps(record.timestamps),
    source: normalizeSource(record.source),
    dependencies: normalizeDependencies(record.dependencies),
    tools: normalizeTools(record.tools),
    build: normalizeBuild(record.build),
    artifact: normalizeArtifact(record.artifact),
    executionPolicySha256: fixedHex(
      record.executionPolicySha256,
      32,
      'native V2 execution policy digest',
    ),
    conformance: normalizeConformance(record.conformance),
    actors: normalizeActors(record.actors),
    boundaries: normalizeBoundaries(record.boundaries),
  };
}

function normalizeTimestamps(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['timestamps'] {
  const record = exactRecord(
    value,
    ['builtAt', 'reviewedAt'],
    'native V2 attestation timestamps',
  );
  return {
    builtAt: isoTimestamp(record.builtAt, 'native V2 builtAt'),
    reviewedAt: isoTimestamp(record.reviewedAt, 'native V2 reviewedAt'),
  };
}

function normalizeSource(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['source'] {
  const record = exactRecord(value, [
    'cargoLockGitBlobId',
    'consensusSourceLockSha256',
    'frontierCommit',
    'frontierPatchSha256',
    'verifierSourceManifestSha256',
  ], 'native V2 attestation source');
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
    verifierSourceManifestSha256: fixedHex(
      record.verifierSourceManifestSha256,
      32,
      'native verifier source manifest digest',
    ),
  };
}

function normalizeDependencies(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['dependencies'] {
  const record = exactRecord(value, [
    'cargoFrozen',
    'cargoLocked',
    'cargoOffline',
    'crateCount',
    'manifestSha256',
    'mode',
    'sharedMutableCacheUsed',
  ], 'native V2 attestation dependencies');
  return {
    mode: record.mode as 'vendored-content-addressed',
    manifestSha256: fixedHex(
      record.manifestSha256,
      32,
      'native V2 dependency manifest digest',
    ),
    crateCount: positiveSafeInteger(
      record.crateCount,
      'native V2 dependency crate count',
    ),
    cargoLocked: record.cargoLocked as true,
    cargoOffline: record.cargoOffline as true,
    cargoFrozen: record.cargoFrozen as true,
    sharedMutableCacheUsed: record.sharedMutableCacheUsed as false,
  };
}

function normalizeTools(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['tools'] {
  const record = exactRecord(value, [
    'completeClosureManifestSha256',
    'includesCompilerDriver',
    'includesInvokedHelpers',
    'includesLinker',
    'includesWindowsSdk',
    'toolCount',
  ], 'native V2 attestation tools');
  return {
    completeClosureManifestSha256: fixedHex(
      record.completeClosureManifestSha256,
      32,
      'native V2 build-tool closure digest',
    ),
    toolCount: positiveSafeInteger(record.toolCount, 'native V2 tool count'),
    includesCompilerDriver: record.includesCompilerDriver as true,
    includesLinker: record.includesLinker as true,
    includesWindowsSdk: record.includesWindowsSdk as true,
    includesInvokedHelpers: record.includesInvokedHelpers as true,
  };
}

function normalizeBuild(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['build'] {
  const record = exactRecord(value, [
    'cargoArguments',
    'environmentAllowlistSha256',
    'freshEmptyTarget',
    'platform',
    'preexistingOutputsRejected',
    'profile',
    'rustTarget',
    'sourceValidatedBeforeAndAfter',
    'workingTreeIdentitySha256',
  ], 'native V2 attested build');
  return {
    platform: record.platform as 'win32-x64',
    rustTarget: record.rustTarget as 'x86_64-pc-windows-msvc',
    profile: record.profile as 'release',
    cargoArguments: stringArray(record.cargoArguments, 'native V2 Cargo arguments'),
    workingTreeIdentitySha256: fixedHex(
      record.workingTreeIdentitySha256,
      32,
      'native V2 working-tree identity',
    ),
    environmentAllowlistSha256: fixedHex(
      record.environmentAllowlistSha256,
      32,
      'native V2 environment allowlist',
    ),
    freshEmptyTarget: record.freshEmptyTarget as true,
    preexistingOutputsRejected: record.preexistingOutputsRejected as true,
    sourceValidatedBeforeAndAfter:
      record.sourceValidatedBeforeAndAfter as true,
  };
}

function normalizeArtifact(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['artifact'] {
  const record = exactRecord(
    value,
    ['role', 'sha256', 'sizeBytes'],
    'native V2 verifier artifact',
  );
  if (record.role !== 'bridge-peg-in-runtime-identity-v2-verifier') {
    throw new Error('native V2 verifier artifact role is unsupported');
  }
  return {
    role: 'bridge-peg-in-runtime-identity-v2-verifier',
    sha256: fixedHex(record.sha256, 32, 'native V2 verifier digest'),
    sizeBytes: boundedArtifactSize(
      record.sizeBytes,
      'native V2 verifier size',
    ),
  };
}

function normalizeConformance(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['conformance'] {
  const record = exactRecord(value, [
    'outputManifestSha256',
    'pegInRuntimeIdentityVectorSha256',
    'status',
  ], 'native V2 verifier conformance');
  if (record.status !== 'PASS') {
    throw new Error('native V2 verifier conformance status must be PASS');
  }
  return {
    pegInRuntimeIdentityVectorSha256: fixedHex(
      record.pegInRuntimeIdentityVectorSha256,
      32,
      'native V2 vector digest',
    ),
    outputManifestSha256: fixedHex(
      record.outputManifestSha256,
      32,
      'native V2 output manifest digest',
    ),
    status: 'PASS',
  };
}

function normalizeActors(
  value: unknown,
): NativePegInRuntimeIdentityV2AttestationStatement['actors'] {
  const record = exactRecord(value, [
    'builderKeyIdHex',
    'builderOrganizationId',
    'reviewerKeyIdHex',
    'reviewerOrganizationId',
  ], 'native V2 attestation actors');
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
): NativePegInRuntimeIdentityV2AttestationStatement['boundaries'] {
  return exactRecord(value, [
    'committedVaultTransitionVerified',
    'completeBuildToolClosureAttested',
    'dependencyClosureAttested',
    'executionCapabilityIssued',
    'externalBuildPerformed',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'independentReproductionPerformed',
    'mintAuthorityGranted',
    'nativeV2VerifierArtifactReviewed',
    'productionReady',
    'runtimeBuildAttestedSeparately',
    'runtimeCodeIdentityVerified',
    'targetRuntimeBuildIdentityVerified',
  ], 'native V2 attestation boundaries') as unknown as
  NativePegInRuntimeIdentityV2AttestationStatement['boundaries'];
}

function assertAttestorSeparation(profile: NativeVerifierAttestorProfile): void {
  if (profile.builder.keyIdHex === profile.reviewer.keyIdHex) {
    throw new Error('native V2 builder and reviewer must use distinct keys');
  }
  if (profile.builder.organizationId === profile.reviewer.organizationId) {
    throw new Error(
      'native V2 builder and reviewer must declare distinct organizations',
    );
  }
  for (const actor of [profile.builder, profile.reviewer]) {
    if (profile.forbiddenAuthorityKeyIds.includes(actor.keyIdHex)) {
      throw new Error(
        'native V2 attestors must be separate from bridge authorities',
      );
    }
  }
}

function assertStatementActors(
  statement: NativePegInRuntimeIdentityV2AttestationStatement,
  packet: NativePegInRuntimeIdentityV2AttestationPacket,
  profile: NativeVerifierAttestorProfile,
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
      'native V2 attestation actors do not match the reviewed profile',
    );
  }
}

function assertAttestorValidity(
  statement: NativePegInRuntimeIdentityV2AttestationStatement,
  profile: NativeVerifierAttestorProfile,
  evaluatedAtInput: string,
): void {
  const evaluatedAt = isoTimestamp(
    evaluatedAtInput,
    'native V2 evaluation timestamp',
  );
  const builtAt = Date.parse(statement.timestamps.builtAt);
  const reviewedAt = Date.parse(statement.timestamps.reviewedAt);
  if (builtAt > reviewedAt) {
    throw new Error('native V2 review predates the build');
  }
  if (Date.parse(evaluatedAt) < reviewedAt) {
    throw new Error('native V2 attestation review is not yet effective');
  }
  if (
    builtAt < Date.parse(profile.validFrom)
    || reviewedAt > Date.parse(profile.validUntil)
    || Date.parse(evaluatedAt) < Date.parse(profile.validFrom)
    || Date.parse(evaluatedAt) > Date.parse(profile.validUntil)
  ) {
    throw new Error('native V2 attestation is outside the validity window');
  }
}

function verifyAttestorSignature(
  attestor: NativeVerifierAttestorKey,
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
    throw new Error(`native V2 ${label} signature is invalid`);
  }
}

function verifiedAttestorPublicKey(
  attestor: NativeVerifierAttestorKey,
): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: Buffer.from(attestor.publicKeySpkiDerHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new Error('native V2 attestor public key is invalid', { cause: error });
  }
  const der = key.export({ type: 'spki', format: 'der' });
  if (sha256(der) !== attestor.keyIdHex) {
    throw new Error('native V2 attestor key ID does not match its public key');
  }
  return key;
}

function assertCanonicalSourceBinding(
  bridgeRoot: string,
  source: NativePegInRuntimeIdentityV2AttestationStatement['source'],
): void {
  const path = guardedPath(
    bridgeRoot,
    resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
  );
  const bytes = readFileSync(path);
  if (sha256(bytes) !== source.consensusSourceLockSha256) {
    throw new Error('native V2 source lock digest does not match canonical bytes');
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
    || deriveNativeVerifierSourceManifestSha256(lock)
      !== source.verifierSourceManifestSha256
  ) {
    throw new Error('native V2 source identity does not match the canonical lock');
  }
}

function assertDependencyClosure(
  dependencies:
    NativePegInRuntimeIdentityV2AttestationStatement['dependencies'],
): void {
  if (
    dependencies.mode !== 'vendored-content-addressed'
    || dependencies.cargoLocked !== true
    || dependencies.cargoOffline !== true
    || dependencies.cargoFrozen !== true
    || dependencies.sharedMutableCacheUsed !== false
  ) {
    throw new Error('native V2 dependency closure is not fail-closed');
  }
}

function assertToolClosure(
  tools: NativePegInRuntimeIdentityV2AttestationStatement['tools'],
): void {
  if (
    tools.includesCompilerDriver !== true
    || tools.includesLinker !== true
    || tools.includesWindowsSdk !== true
    || tools.includesInvokedHelpers !== true
  ) {
    throw new Error('native V2 build-tool closure is incomplete');
  }
}

function assertBuildIsolation(
  build: NativePegInRuntimeIdentityV2AttestationStatement['build'],
): void {
  if (
    build.platform !== 'win32-x64'
    || build.rustTarget !== 'x86_64-pc-windows-msvc'
    || build.profile !== 'release'
    || !sameStringArray(build.cargoArguments, EXPECTED_CARGO_ARGUMENTS)
    || build.freshEmptyTarget !== true
    || build.preexistingOutputsRejected !== true
    || build.sourceValidatedBeforeAndAfter !== true
  ) {
    throw new Error('native V2 build isolation or command identity is unsupported');
  }
}

function assertConformance(
  bridgeRoot: string,
  conformance:
    NativePegInRuntimeIdentityV2AttestationStatement['conformance'],
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
    throw new Error('native V2 conformance vector does not match canonical bytes');
  }
}

function assertFailClosedBoundaries(
  boundaries:
    NativePegInRuntimeIdentityV2AttestationStatement['boundaries'],
): void {
  if (
    boundaries.externalBuildPerformed !== true
    || boundaries.independentReproductionPerformed !== true
    || boundaries.completeBuildToolClosureAttested !== true
    || boundaries.dependencyClosureAttested !== true
    || boundaries.nativeV2VerifierArtifactReviewed !== true
    || boundaries.runtimeBuildAttestedSeparately !== true
    || boundaries.executionCapabilityIssued !== false
    || boundaries.targetRuntimeBuildIdentityVerified !== false
    || boundaries.runtimeCodeIdentityVerified !== false
    || boundaries.historicalMintAbsenceVerified !== false
    || boundaries.committedVaultTransitionVerified !== false
    || boundaries.mintAuthorityGranted !== false
    || boundaries.gate5Closed !== false
    || boundaries.productionReady !== false
  ) {
    throw new Error(
      'native V2 attestation makes a premature authority or readiness claim',
    );
  }
}

function verifiedArtifact(
  pathValue: string,
  expected: NativePegInRuntimeIdentityV2AttestationStatement['artifact'],
): void {
  const suppliedPath = requireAbsolutePath(
    pathValue,
    'native V2 verifier artifact path',
  );
  const linkStatus = lstatSync(suppliedPath);
  if (linkStatus.isSymbolicLink()) {
    throw new Error('native V2 verifier path must not be a symbolic link');
  }
  const path = realpathSync(suppliedPath);
  const bytes = readBoundedStableArtifact({
    path,
    maxBytes:
      MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES,
    label: 'native V2 verifier artifact',
  });
  if (bytes.length !== expected.sizeBytes) {
    throw new Error('native V2 verifier size does not match the attestation');
  }
  if (sha256(bytes) !== expected.sha256) {
    throw new Error('native V2 verifier digest does not match the attestation');
  }
}

function boundedArtifactSize(value: unknown, label: string): number {
  const size = positiveSafeInteger(value, label);
  if (
    size > MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES
  ) {
    throw new Error(
      `${label} exceeds ${MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES} bytes`,
    );
  }
  return size;
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
  throw new Error('native V2 canonical input escaped the bridge root');
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
