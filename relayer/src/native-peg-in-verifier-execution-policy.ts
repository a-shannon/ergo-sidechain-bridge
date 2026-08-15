import { createHash } from 'crypto';

import {
  assertNativeVerifierAttestationValidationReportProvenance,
  canonicalE2sJson,
  type NativeVerifierAttestationValidationReport,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  deriveNativeRuntimeDependencyManifestSha256,
  type NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';

export const NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA =
  'e2s.native-peg-in-verifier-execution-policy.v1';
export const NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA =
  'e2s.native-peg-in-verifier-execution-policy-validation-report.v1';
const PEG_IN_REQUEST_SCHEMA = 'e2s.native-finalized-peg-in-state-request.v1' as const;
const PEG_IN_RESULT_SCHEMA = 'e2s.native-finalized-peg-in-state-verification.v1' as const;
const POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA =
  'e2s.native-finalized-pooled-reserve-mint-reservation-state-request.v4' as const;
const POOLED_RESERVE_MINT_RESERVATION_STATE_V4_RESULT_SCHEMA =
  'e2s.native-finalized-pooled-reserve-mint-reservation-state-verification.v4' as const;

const CANONICALIZATION = 'e2s-canonical-json-v1' as const;
const POLICY_DOMAIN = Buffer.from(
  'E2S_NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_V1\0',
  'utf8',
);
export interface NativePegInVerifierExecutionLimits {
  timeoutMs: number;
  requestLimitBytes: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
}
const FIXED_LIMITS: NativePegInVerifierExecutionLimits = Object.freeze({
  timeoutMs: 30_000,
  requestLimitBytes: 32 * 1024 * 1024,
  stdoutLimitBytes: 16 * 1024 * 1024,
  stderrLimitBytes: 64 * 1024,
});
const MAX_RUNTIME_SYSTEM_DLLS = 128;
const VALIDATION_PROVENANCE = new WeakMap<object, object>();

export type NativePegInVerifierExecutionPolicyOperation =
  | 'verify-peg-in-state'
  | 'verify-pooled-reserve-mint-reservation-state-v4';

export type NativePegInVerifierExecutionPolicyInvocation =
  | {
    operation: 'verify-peg-in-state';
    argvTemplate: [
      { kind: 'literal'; value: '--verify-peg-in-state' },
      { kind: 'literal'; value: '--trusted-anchor-digest' },
      {
        kind: 'parameter';
        name: 'trustedAnchorDigestHex';
        format: 'lowercase-0x-blake2b256';
      },
    ];
    requestSchema: typeof PEG_IN_REQUEST_SCHEMA;
    resultSchema: typeof PEG_IN_RESULT_SCHEMA;
  }
  | {
    operation: 'verify-pooled-reserve-mint-reservation-state-v4';
    argvTemplate: [
      {
        kind: 'literal';
        value: '--verify-pooled-reserve-mint-reservation-state-v4';
      },
      { kind: 'literal'; value: '--trusted-anchor-digest' },
      {
        kind: 'parameter';
        name: 'trustedAnchorDigestHex';
        format: 'lowercase-0x-blake2b256';
      },
    ];
    requestSchema:
      typeof POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA;
    resultSchema:
      typeof POOLED_RESERVE_MINT_RESERVATION_STATE_V4_RESULT_SCHEMA;
  };

export interface NativePegInVerifierExecutionPolicy {
  schema: typeof NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA;
  profileId: string;
  attestationId: string;
  policyId: string;
  canonicalization: typeof CANONICALIZATION;
  validity: {
    notBefore: string;
    expiresAt: string;
    policyEpoch: number;
  };
  bindings: {
    attestationCoreDigestHex: string;
    buildDependencyManifestSha256: string;
    launcher: {
      sha256: string;
      sizeBytes: number;
      sourceManifestSha256: string;
    };
  };
  environment: {
    variables: Array<'SystemRoot' | 'TEMP' | 'TMP'>;
    temp: 'staged-directory';
    workingDirectory: 'staged-directory';
    pathInherited: false;
    libraryPathInherited: false;
  };
  verifier: {
    role: 'bridge-checkpoint-verifier';
    artifactSha256: string;
    artifactSizeBytes: number;
    runtimeDependencyManifestSha256: string;
    invocation: NativePegInVerifierExecutionPolicyInvocation;
    limits: NativePegInVerifierExecutionLimits;
  };
  boundaries: {
    launcherAtomicBootstrapProven: false;
    loadedModuleClosureEnforced: false;
    pegInConformanceAttested: false;
    runtimeCodeIdentityVerified: false;
    mintAuthorityGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativePegInVerifierExecutionPolicyValidationReport {
  schema: typeof NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA;
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  runtimeDependencyManifestSha256: string;
  validity: NativePegInVerifierExecutionPolicy['validity'];
  boundary: {
    relativeToSuppliedProfile: true;
    reviewedTrustRootsLoaded: boolean;
    exactPolicyDigestMatched: true;
    exactArtifactBindingMatched: true;
    runtimeDependencyManifestMatched: true;
    executionCapabilityIssued: false;
    pegInConformanceAttested: false;
    runtimeCodeIdentityVerified: false;
    mintAuthorityGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export function deriveNativePegInVerifierExecutionPolicySha256(policy: unknown): string {
  const normalized = normalizePolicy(policy);
  return createHash('sha256')
    .update(Buffer.concat([
      POLICY_DOMAIN,
      Buffer.from(canonicalE2sJson(normalized), 'utf8'),
    ]))
    .digest('hex');
}

export function validateNativePegInVerifierExecutionPolicyAgainstProfile(input: {
  profile: NativeVerifierAttestationValidationReport;
  policy: NativePegInVerifierExecutionPolicy;
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>;
  evaluatedAt: string;
}): NativePegInVerifierExecutionPolicyValidationReport {
  assertNativeVerifierAttestationValidationReportProvenance(input.profile);
  return validateNativePegInVerifierExecutionPolicyAgainstSuppliedProfile(input);
}

/** Structural conformance only. The supplied profile may not have attestation provenance. */
export function validateNativePegInVerifierExecutionPolicyAgainstSuppliedProfile(input: {
  profile: NativeVerifierAttestationValidationReport;
  policy: NativePegInVerifierExecutionPolicy;
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>;
  evaluatedAt: string;
}): NativePegInVerifierExecutionPolicyValidationReport {
  const profile = normalizeProfile(input.profile);
  const policy = normalizePolicy(input.policy);
  const manifest = normalizeManifest(input.runtimeDependencyManifest);
  const evaluatedAt = isoTimestamp(input.evaluatedAt, 'peg-in execution policy evaluation timestamp');

  assertIdentityAndValidity(profile, policy, evaluatedAt);
  assertBindings(profile, policy);
  assertExactExecutionSemantics(policy);
  assertRuntimeDependencyManifest(profile, policy, manifest);

  const executionPolicySha256 = deriveNativePegInVerifierExecutionPolicySha256(policy);
  if (executionPolicySha256 !== profile.executionPolicySha256) {
    throw new Error('native peg-in execution policy digest does not match the attested profile');
  }

  const report = deepFreeze({
    schema: NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA,
    profileId: profile.profileId,
    attestationId: profile.attestationId,
    policyId: policy.policyId,
    executionPolicySha256,
    runtimeDependencyManifestSha256: policy.verifier.runtimeDependencyManifestSha256,
    validity: policy.validity,
    boundary: {
      relativeToSuppliedProfile: true as const,
      reviewedTrustRootsLoaded: profile.reviewedTrustRootsLoaded,
      exactPolicyDigestMatched: true as const,
      exactArtifactBindingMatched: true as const,
      runtimeDependencyManifestMatched: true as const,
      executionCapabilityIssued: false as const,
      pegInConformanceAttested: false as const,
      runtimeCodeIdentityVerified: false as const,
      mintAuthorityGranted: false as const,
      settlementAuthorityGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  }) as NativePegInVerifierExecutionPolicyValidationReport;
  VALIDATION_PROVENANCE.set(report, input.profile);
  return report;
}

export function assertNativePegInVerifierExecutionPolicyValidationProvenance(input: {
  profile: NativeVerifierAttestationValidationReport;
  report: unknown;
}): asserts input is {
  profile: NativeVerifierAttestationValidationReport;
  report: NativePegInVerifierExecutionPolicyValidationReport;
} {
  if (
    !input.report
    || typeof input.report !== 'object'
    || VALIDATION_PROVENANCE.get(input.report) !== input.profile
  ) {
    throw new Error(
      'native peg-in execution policy validation provenance is missing for the supplied profile',
    );
  }
}

function normalizePolicy(value: unknown): NativePegInVerifierExecutionPolicy {
  const record = exactRecord(value, [
    'schema',
    'profileId',
    'attestationId',
    'policyId',
    'canonicalization',
    'validity',
    'bindings',
    'environment',
    'verifier',
    'boundaries',
  ], 'native peg-in verifier execution policy');
  if (record.schema !== NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA) {
    throw new Error('native peg-in verifier execution policy schema is unsupported');
  }
  if (record.canonicalization !== CANONICALIZATION) {
    throw new Error('native peg-in verifier execution policy canonicalization is unsupported');
  }
  const validity = exactRecord(
    record.validity,
    ['notBefore', 'expiresAt', 'policyEpoch'],
    'native peg-in verifier execution policy validity',
  );
  const bindings = exactRecord(
    record.bindings,
    ['attestationCoreDigestHex', 'buildDependencyManifestSha256', 'launcher'],
    'native peg-in verifier execution policy bindings',
  );
  const launcher = exactRecord(
    bindings.launcher,
    ['sha256', 'sizeBytes', 'sourceManifestSha256'],
    'native peg-in verifier execution policy launcher binding',
  );
  const environment = exactRecord(record.environment, [
    'variables',
    'temp',
    'workingDirectory',
    'pathInherited',
    'libraryPathInherited',
  ], 'native peg-in verifier execution policy environment');
  if (!Array.isArray(environment.variables)) {
    throw new Error('native peg-in verifier execution policy variables must be an array');
  }
  const verifier = exactRecord(record.verifier, [
    'role',
    'artifactSha256',
    'artifactSizeBytes',
    'runtimeDependencyManifestSha256',
    'invocation',
    'limits',
  ], 'native peg-in verifier execution policy verifier');
  const invocation = exactRecord(verifier.invocation, [
    'operation',
    'argvTemplate',
    'requestSchema',
    'resultSchema',
  ], 'native peg-in verifier execution policy invocation');
  if (!Array.isArray(invocation.argvTemplate)) {
    throw new Error('native peg-in verifier execution policy argv template must be an array');
  }
  const limits = exactRecord(verifier.limits, [
    'timeoutMs',
    'requestLimitBytes',
    'stdoutLimitBytes',
    'stderrLimitBytes',
  ], 'native peg-in verifier execution policy limits');
  const boundaries = exactRecord(record.boundaries, [
    'launcherAtomicBootstrapProven',
    'loadedModuleClosureEnforced',
    'pegInConformanceAttested',
    'runtimeCodeIdentityVerified',
    'mintAuthorityGranted',
    'settlementAuthorityGranted',
    'gate5Closed',
    'productionReady',
  ], 'native peg-in verifier execution policy boundaries');

  return {
    schema: NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA,
    profileId: identifier(record.profileId, 'native peg-in execution policy profile ID'),
    attestationId: identifier(
      record.attestationId,
      'native peg-in execution policy attestation ID',
    ),
    policyId: identifier(record.policyId, 'native peg-in execution policy ID'),
    canonicalization: CANONICALIZATION,
    validity: {
      notBefore: isoTimestamp(validity.notBefore, 'native peg-in policy notBefore'),
      expiresAt: isoTimestamp(validity.expiresAt, 'native peg-in policy expiresAt'),
      policyEpoch: safeInteger(validity.policyEpoch, 'native peg-in policy epoch'),
    },
    bindings: {
      attestationCoreDigestHex: sha256Hex(
        bindings.attestationCoreDigestHex,
        'native peg-in policy attestation core digest',
      ),
      buildDependencyManifestSha256: sha256Hex(
        bindings.buildDependencyManifestSha256,
        'native peg-in policy build dependency manifest digest',
      ),
      launcher: {
        sha256: sha256Hex(launcher.sha256, 'native peg-in policy launcher digest'),
        sizeBytes: positiveSafeInteger(
          launcher.sizeBytes,
          'native peg-in policy launcher size',
        ),
        sourceManifestSha256: sha256Hex(
          launcher.sourceManifestSha256,
          'native peg-in policy launcher source manifest digest',
        ),
      },
    },
    environment: {
      variables: environment.variables.map((entry, index) =>
        nonEmptyString(entry, `native peg-in policy environment variable ${index}`)) as Array<
          'SystemRoot' | 'TEMP' | 'TMP'
        >,
      temp: nonEmptyString(environment.temp, 'native peg-in policy temp mode') as
        'staged-directory',
      workingDirectory: nonEmptyString(
        environment.workingDirectory,
        'native peg-in policy working directory mode',
      ) as 'staged-directory',
      pathInherited: falseValue(
        environment.pathInherited,
        'native peg-in policy pathInherited',
      ),
      libraryPathInherited: falseValue(
        environment.libraryPathInherited,
        'native peg-in policy libraryPathInherited',
      ),
    },
    verifier: {
      role: nonEmptyString(verifier.role, 'native peg-in policy verifier role') as
        'bridge-checkpoint-verifier',
      artifactSha256: sha256Hex(
        verifier.artifactSha256,
        'native peg-in policy verifier digest',
      ),
      artifactSizeBytes: positiveSafeInteger(
        verifier.artifactSizeBytes,
        'native peg-in policy verifier size',
      ),
      runtimeDependencyManifestSha256: sha256Hex(
        verifier.runtimeDependencyManifestSha256,
        'native peg-in policy runtime dependency manifest digest',
      ),
      invocation: {
        operation: executionPolicyOperation(invocation.operation),
        argvTemplate: invocation.argvTemplate.map((entry, index) =>
          normalizeArgvEntry(entry, index)) as NativePegInVerifierExecutionPolicy[
            'verifier'
          ]['invocation']['argvTemplate'],
        requestSchema: nonEmptyString(
          invocation.requestSchema,
          'native peg-in policy request schema',
        ),
        resultSchema: nonEmptyString(
          invocation.resultSchema,
          'native peg-in policy result schema',
        ),
      } as NativePegInVerifierExecutionPolicyInvocation,
      limits: {
        timeoutMs: positiveSafeInteger(limits.timeoutMs, 'native peg-in policy timeout limit'),
        requestLimitBytes: positiveSafeInteger(
          limits.requestLimitBytes,
          'native peg-in policy request limit',
        ),
        stdoutLimitBytes: positiveSafeInteger(
          limits.stdoutLimitBytes,
          'native peg-in policy stdout limit',
        ),
        stderrLimitBytes: positiveSafeInteger(
          limits.stderrLimitBytes,
          'native peg-in policy stderr limit',
        ),
      },
    },
    boundaries: {
      launcherAtomicBootstrapProven: falseValue(
        boundaries.launcherAtomicBootstrapProven,
        'native peg-in policy launcherAtomicBootstrapProven',
      ),
      loadedModuleClosureEnforced: falseValue(
        boundaries.loadedModuleClosureEnforced,
        'native peg-in policy loadedModuleClosureEnforced',
      ),
      pegInConformanceAttested: falseValue(
        boundaries.pegInConformanceAttested,
        'native peg-in policy pegInConformanceAttested',
      ),
      runtimeCodeIdentityVerified: falseValue(
        boundaries.runtimeCodeIdentityVerified,
        'native peg-in policy runtimeCodeIdentityVerified',
      ),
      mintAuthorityGranted: falseValue(
        boundaries.mintAuthorityGranted,
        'native peg-in policy mintAuthorityGranted',
      ),
      settlementAuthorityGranted: falseValue(
        boundaries.settlementAuthorityGranted,
        'native peg-in policy settlementAuthorityGranted',
      ),
      gate5Closed: falseValue(boundaries.gate5Closed, 'native peg-in policy gate5Closed'),
      productionReady: falseValue(
        boundaries.productionReady,
        'native peg-in policy productionReady',
      ),
    },
  };
}

function normalizeArgvEntry(
  value: unknown,
  index: number,
): NativePegInVerifierExecutionPolicy['verifier']['invocation']['argvTemplate'][number] {
  const record = asRecord(value, `native peg-in policy argv template ${index}`);
  if (record.kind === 'literal') {
    exactKeys(record, ['kind', 'value'], `native peg-in policy argv template ${index}`);
    return {
      kind: 'literal',
      value: nonEmptyString(record.value, `native peg-in policy argv literal ${index}`),
    } as NativePegInVerifierExecutionPolicy[
      'verifier'
    ]['invocation']['argvTemplate'][number];
  }
  if (record.kind === 'parameter') {
    exactKeys(record, ['kind', 'name', 'format'], `native peg-in policy argv template ${index}`);
    return {
      kind: 'parameter',
      name: nonEmptyString(record.name, 'native peg-in policy argv parameter name'),
      format: nonEmptyString(record.format, 'native peg-in policy argv parameter format'),
    } as NativePegInVerifierExecutionPolicy[
      'verifier'
    ]['invocation']['argvTemplate'][number];
  }
  throw new Error(`native peg-in policy argv template ${index} kind is unsupported`);
}

function executionPolicyOperation(
  value: unknown,
): NativePegInVerifierExecutionPolicyOperation {
  if (
    value !== 'verify-peg-in-state'
    && value !== 'verify-pooled-reserve-mint-reservation-state-v4'
  ) {
    throw new Error('native peg-in policy operation is unsupported');
  }
  return value;
}

function normalizeManifest(
  value: unknown,
): NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'> {
  const record = exactRecord(value, [
    'schema',
    'role',
    'artifactSha256',
    'artifactSizeBytes',
    'platform',
    'systemDlls',
    'delayLoadedDlls',
    'nonSystemDependencies',
    'sidecars',
    'dynamicLibraryLoadingReviewedAbsent',
    'boundaries',
  ], 'native peg-in verifier runtime dependency manifest');
  if (record.schema !== NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA) {
    throw new Error('native peg-in verifier runtime dependency manifest schema is unsupported');
  }
  const boundaries = exactRecord(record.boundaries, [
    'loadedModuleClosureEnforced',
    'dynamicLoadsCryptographicallyExcluded',
  ], 'native peg-in verifier runtime dependency manifest boundaries');
  return {
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role: nonEmptyString(record.role, 'native peg-in verifier runtime role') as
      'bridge-checkpoint-verifier',
    artifactSha256: sha256Hex(
      record.artifactSha256,
      'native peg-in verifier runtime artifact digest',
    ),
    artifactSizeBytes: positiveSafeInteger(
      record.artifactSizeBytes,
      'native peg-in verifier runtime artifact size',
    ),
    platform: nonEmptyString(record.platform, 'native peg-in verifier runtime platform') as
      'win32-x64',
    systemDlls: stringArray(record.systemDlls, 'native peg-in verifier runtime systemDlls'),
    delayLoadedDlls: stringArray(
      record.delayLoadedDlls,
      'native peg-in verifier runtime delayLoadedDlls',
    ),
    nonSystemDependencies: stringArray(
      record.nonSystemDependencies,
      'native peg-in verifier runtime nonSystemDependencies',
    ),
    sidecars: stringArray(record.sidecars, 'native peg-in verifier runtime sidecars'),
    dynamicLibraryLoadingReviewedAbsent: trueValue(
      record.dynamicLibraryLoadingReviewedAbsent,
      'native peg-in verifier runtime dynamicLibraryLoadingReviewedAbsent',
    ),
    boundaries: {
      loadedModuleClosureEnforced: falseValue(
        boundaries.loadedModuleClosureEnforced,
        'native peg-in verifier runtime loadedModuleClosureEnforced',
      ),
      dynamicLoadsCryptographicallyExcluded: falseValue(
        boundaries.dynamicLoadsCryptographicallyExcluded,
        'native peg-in verifier runtime dynamicLoadsCryptographicallyExcluded',
      ),
    },
  };
}

function normalizeProfile(profile: NativeVerifierAttestationValidationReport) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('native peg-in attestation profile must be an object');
  }
  if (
    profile.boundary?.relativeToSuppliedPolicy !== true
    || profile.boundary.executionCapabilityIssued !== false
    || profile.boundary.admissionEligible !== false
    || profile.boundary.gate5Closed !== false
    || profile.boundary.productionReady !== false
  ) {
    throw new Error('native peg-in attestation profile boundary is not fail-closed');
  }
  if (typeof profile.boundary.reviewedTrustRootsLoaded !== 'boolean') {
    throw new Error('native peg-in attestation profile trust-root boundary must be boolean');
  }
  const artifact = asRecord(profile.artifacts?.verifier, 'attested peg-in verifier artifact');
  if (artifact.role !== 'bridge-checkpoint-verifier') {
    throw new Error('attested peg-in verifier artifact role is unsupported');
  }
  return {
    profileId: identifier(profile.profileId, 'native peg-in attestation profile ID'),
    attestationId: identifier(profile.attestationId, 'native peg-in attestation ID'),
    statementCoreDigestHex: sha256Hex(
      profile.attestation?.statementCoreDigestHex,
      'native peg-in attestation statement core digest',
    ),
    reviewedAt: isoTimestamp(profile.timestamps?.reviewedAt, 'native peg-in reviewedAt'),
    buildDependencyManifestSha256: sha256Hex(
      profile.dependencies?.manifestSha256,
      'native peg-in build dependency manifest digest',
    ),
    executionPolicySha256: sha256Hex(
      profile.executionPolicySha256,
      'native peg-in attested execution policy digest',
    ),
    verifier: {
      role: artifact.role,
      sha256: sha256Hex(artifact.sha256, 'attested peg-in verifier digest'),
      sizeBytes: positiveSafeInteger(artifact.sizeBytes, 'attested peg-in verifier size'),
    },
    reviewedTrustRootsLoaded: profile.boundary.reviewedTrustRootsLoaded,
  };
}

function assertIdentityAndValidity(
  profile: ReturnType<typeof normalizeProfile>,
  policy: NativePegInVerifierExecutionPolicy,
  evaluatedAt: string,
): void {
  if (policy.profileId !== profile.profileId) {
    throw new Error('native peg-in execution policy profile ID does not match the attestation');
  }
  if (policy.attestationId !== profile.attestationId) {
    throw new Error('native peg-in execution policy attestation ID does not match the profile');
  }
  const notBefore = Date.parse(policy.validity.notBefore);
  const expiresAt = Date.parse(policy.validity.expiresAt);
  const reviewedAt = Date.parse(profile.reviewedAt);
  const evaluated = Date.parse(evaluatedAt);
  if (policy.validity.policyEpoch <= 0) {
    throw new Error('native peg-in execution policy epoch must be positive');
  }
  if (notBefore >= expiresAt) {
    throw new Error('native peg-in execution policy validity window is invalid');
  }
  if (notBefore < reviewedAt) {
    throw new Error('native peg-in execution policy notBefore precedes reviewedAt');
  }
  if (evaluated < notBefore) throw new Error('native peg-in execution policy is not active yet');
  if (evaluated >= expiresAt) throw new Error('native peg-in execution policy is expired');
}

function assertBindings(
  profile: ReturnType<typeof normalizeProfile>,
  policy: NativePegInVerifierExecutionPolicy,
): void {
  if (policy.bindings.attestationCoreDigestHex !== profile.statementCoreDigestHex) {
    throw new Error('native peg-in policy attestation core digest does not match the profile');
  }
  if (
    policy.bindings.buildDependencyManifestSha256
    !== profile.buildDependencyManifestSha256
  ) {
    throw new Error('native peg-in policy dependency digest does not match the profile');
  }
  if (
    policy.verifier.role !== profile.verifier.role
    || policy.verifier.artifactSha256 !== profile.verifier.sha256
    || policy.verifier.artifactSizeBytes !== profile.verifier.sizeBytes
  ) {
    throw new Error('native peg-in policy verifier artifact does not match the attested bytes');
  }
}

function assertExactExecutionSemantics(policy: NativePegInVerifierExecutionPolicy): void {
  const expectedInvocation = expectedExecutionPolicyInvocation(
    policy.verifier.invocation.operation,
  );
  if (canonicalE2sJson(policy.verifier.invocation) !== canonicalE2sJson(expectedInvocation)) {
    throw new Error('native peg-in verifier invocation is not exact');
  }
  if (canonicalE2sJson(policy.verifier.limits) !== canonicalE2sJson(FIXED_LIMITS)) {
    throw new Error('native peg-in verifier limits are not exact');
  }
  const expectedEnvironment: NativePegInVerifierExecutionPolicy['environment'] = {
    variables: ['SystemRoot', 'TEMP', 'TMP'],
    temp: 'staged-directory',
    workingDirectory: 'staged-directory',
    pathInherited: false,
    libraryPathInherited: false,
  };
  if (canonicalE2sJson(policy.environment) !== canonicalE2sJson(expectedEnvironment)) {
    throw new Error('native peg-in verifier environment is not exact');
  }
}

function expectedExecutionPolicyInvocation(
  operation: NativePegInVerifierExecutionPolicyOperation,
): NativePegInVerifierExecutionPolicyInvocation {
  if (operation === 'verify-peg-in-state') {
    return {
      operation,
      argvTemplate: [
        { kind: 'literal', value: '--verify-peg-in-state' },
        { kind: 'literal', value: '--trusted-anchor-digest' },
        {
          kind: 'parameter',
          name: 'trustedAnchorDigestHex',
          format: 'lowercase-0x-blake2b256',
        },
      ],
      requestSchema: PEG_IN_REQUEST_SCHEMA,
      resultSchema: PEG_IN_RESULT_SCHEMA,
    };
  }
  return {
    operation,
    argvTemplate: [
      {
        kind: 'literal',
        value: '--verify-pooled-reserve-mint-reservation-state-v4',
      },
      { kind: 'literal', value: '--trusted-anchor-digest' },
      {
        kind: 'parameter',
        name: 'trustedAnchorDigestHex',
        format: 'lowercase-0x-blake2b256',
      },
    ],
    requestSchema: POOLED_RESERVE_MINT_RESERVATION_STATE_V4_REQUEST_SCHEMA,
    resultSchema: POOLED_RESERVE_MINT_RESERVATION_STATE_V4_RESULT_SCHEMA,
  };
}

function assertRuntimeDependencyManifest(
  profile: ReturnType<typeof normalizeProfile>,
  policy: NativePegInVerifierExecutionPolicy,
  manifest: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>,
): void {
  if (
    manifest.role !== 'bridge-checkpoint-verifier'
    || manifest.role !== profile.verifier.role
    || manifest.artifactSha256 !== policy.verifier.artifactSha256
    || manifest.artifactSha256 !== profile.verifier.sha256
    || manifest.artifactSizeBytes !== policy.verifier.artifactSizeBytes
    || manifest.artifactSizeBytes !== profile.verifier.sizeBytes
  ) {
    throw new Error('native peg-in runtime manifest artifact binding is invalid');
  }
  if (manifest.platform !== 'win32-x64') {
    throw new Error('native peg-in runtime manifest platform must be win32-x64');
  }
  if (
    manifest.systemDlls.length === 0
    || manifest.systemDlls.length > MAX_RUNTIME_SYSTEM_DLLS
    || !manifest.systemDlls.every((value, index) =>
      /^[a-z0-9._-]+\.dll$/.test(value)
      && (index === 0 || manifest.systemDlls[index - 1] < value))
  ) {
    throw new Error('native peg-in runtime system DLLs must be sorted unique lowercase names');
  }
  if (
    manifest.delayLoadedDlls.length !== 0
    || manifest.nonSystemDependencies.length !== 0
    || manifest.sidecars.length !== 0
    || manifest.dynamicLibraryLoadingReviewedAbsent !== true
    || manifest.boundaries.loadedModuleClosureEnforced !== false
    || manifest.boundaries.dynamicLoadsCryptographicallyExcluded !== false
  ) {
    throw new Error('native peg-in runtime manifest closure boundary is invalid');
  }
  if (
    deriveNativeRuntimeDependencyManifestSha256(manifest)
    !== policy.verifier.runtimeDependencyManifestSha256
  ) {
    throw new Error('native peg-in runtime manifest digest does not match the policy');
  }
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = asRecord(value, label);
  exactKeys(record, expected, label);
  return record;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
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

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(value)) {
    throw new Error(`${label} must be a lowercase stable identifier`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must use canonical UTC ISO-8601 form`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return Number(value);
}

function sha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed 32-byte hex`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => nonEmptyString(entry, `${label}[${index}]`));
}

function falseValue(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function trueValue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must be true`);
  return true;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
