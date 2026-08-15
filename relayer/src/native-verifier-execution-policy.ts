import { createHash } from 'crypto';

import {
  assertNativeVerifierAttestationValidationReportProvenance,
  canonicalE2sJson,
  type NativeVerifierAttestationValidationReport,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA,
} from './native-finalized-bridge-checkpoint.js';
import {
  RPC_FINALITY_INSPECTION_REQUEST_SCHEMA,
  RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
  RPC_HEADER_ENCODING_REQUEST_SCHEMA,
  RPC_HEADER_ENCODING_RESULT_SCHEMA,
  RPC_WARP_INSPECTION_REQUEST_SCHEMA,
  RPC_WARP_INSPECTION_RESULT_SCHEMA,
} from './native-substrate-rpc-proof-codec.js';

export const NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA =
  'e2s.native-verifier-execution-policy.v1';
export const NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA =
  'e2s.native-runtime-dependency-manifest.v1';
export const NATIVE_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA =
  'e2s.native-verifier-execution-policy-validation-report.v1';

const CANONICALIZATION = 'e2s-canonical-json-v1';
const POLICY_DOMAIN = Buffer.from(
  'E2S_NATIVE_VERIFIER_EXECUTION_POLICY_V1\0',
  'utf8',
);
const DEPENDENCY_MANIFEST_DOMAIN = Buffer.from(
  'E2S_NATIVE_RUNTIME_DEPENDENCY_MANIFEST_V1\0',
  'utf8',
);
const FIXED_LIMITS: NativeVerifierExecutionLimits = {
  timeoutMs: 30_000,
  requestLimitBytes: 33_554_432,
  stdoutLimitBytes: 16_777_216,
  stderrLimitBytes: 65_536,
};
const MAX_RUNTIME_SYSTEM_DLLS = 128;
const VALIDATION_PROVENANCE = new WeakMap<object, object>();

export type NativeVerifierTargetRole =
  | 'bridge-checkpoint-verifier'
  | 'bridge-rpc-proof-codec'
  | 'bridge-peg-in-runtime-identity-v2-verifier';

export interface NativeVerifierExecutionLimits {
  timeoutMs: number;
  requestLimitBytes: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
}

export interface NativeVerifierLiteralArgvTemplateEntry {
  kind: 'literal';
  value: string;
}

export interface NativeVerifierParameterArgvTemplateEntry {
  kind: 'parameter';
  name: 'trustedAnchorDigestHex';
  format: 'lowercase-0x-sha256';
}

export type NativeVerifierArgvTemplateEntry =
  | NativeVerifierLiteralArgvTemplateEntry
  | NativeVerifierParameterArgvTemplateEntry;

export interface NativeVerifierInvocationPolicy {
  operation:
    | 'verify-checkpoint'
    | 'encode-headers'
    | 'inspect-warp-proof'
    | 'inspect-finality-proof';
  argvTemplate: NativeVerifierArgvTemplateEntry[];
  requestSchema: string;
  resultSchema: string;
}

export interface NativeVerifierExecutionTarget<Role extends NativeVerifierTargetRole> {
  role: Role;
  artifactSha256: string;
  artifactSizeBytes: number;
  runtimeDependencyManifestSha256: string;
  invocations: NativeVerifierInvocationPolicy[];
  limits: NativeVerifierExecutionLimits;
}

export interface NativeVerifierExecutionPolicy {
  schema: typeof NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA;
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
  targets: {
    verifier: NativeVerifierExecutionTarget<'bridge-checkpoint-verifier'>;
    codec: NativeVerifierExecutionTarget<'bridge-rpc-proof-codec'>;
  };
  boundaries: {
    launcherAtomicBootstrapProven: false;
    loadedModuleClosureEnforced: false;
    executionAdmissionGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativeRuntimeDependencyManifest<
  Role extends NativeVerifierTargetRole = NativeVerifierTargetRole,
> {
  schema: typeof NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA;
  role: Role;
  artifactSha256: string;
  artifactSizeBytes: number;
  platform: 'win32-x64';
  systemDlls: string[];
  delayLoadedDlls: string[];
  nonSystemDependencies: string[];
  sidecars: string[];
  dynamicLibraryLoadingReviewedAbsent: true;
  boundaries: {
    loadedModuleClosureEnforced: false;
    dynamicLoadsCryptographicallyExcluded: false;
  };
}

export interface NativeRuntimeDependencyManifests {
  verifier: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>;
  codec: NativeRuntimeDependencyManifest<'bridge-rpc-proof-codec'>;
}

export interface NativeVerifierExecutionPolicyValidationReport {
  schema: typeof NATIVE_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA;
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  runtimeDependencyManifestSha256: {
    verifier: string;
    codec: string;
  };
  validity: NativeVerifierExecutionPolicy['validity'];
  boundary: {
    relativeToSuppliedProfile: true;
    reviewedTrustRootsLoaded: boolean;
    executionCapabilityIssued: false;
    exactPolicyDigestMatched: true;
    exactArtifactBindingsMatched: true;
    runtimeDependencyManifestsMatched: true;
    loadedModuleClosureEnforced: false;
    executionAdmissionGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export function deriveNativeVerifierExecutionPolicySha256(policy: unknown): string {
  const normalized = normalizeExecutionPolicy(policy);
  return sha256(Buffer.concat([
    POLICY_DOMAIN,
    Buffer.from(canonicalE2sJson(normalized), 'utf8'),
  ]));
}

export function deriveNativeRuntimeDependencyManifestSha256(manifest: unknown): string {
  const normalized = normalizeRuntimeDependencyManifest(manifest, 'runtime dependency manifest');
  return sha256(Buffer.concat([
    DEPENDENCY_MANIFEST_DOMAIN,
    Buffer.from(canonicalE2sJson(normalized), 'utf8'),
  ]));
}

export function validateNativeVerifierExecutionPolicyAgainstProfile(input: {
  profile: NativeVerifierAttestationValidationReport;
  policy: NativeVerifierExecutionPolicy;
  runtimeDependencyManifests: NativeRuntimeDependencyManifests;
  evaluatedAt: string;
}): NativeVerifierExecutionPolicyValidationReport {
  assertNativeVerifierAttestationValidationReportProvenance(input.profile);
  return validateNativeVerifierExecutionPolicyAgainstSuppliedProfile(input);
}

/** Structural conformance only. The supplied profile may not have attestation provenance. */
export function validateNativeVerifierExecutionPolicyAgainstSuppliedProfile(input: {
  profile: NativeVerifierAttestationValidationReport;
  policy: NativeVerifierExecutionPolicy;
  runtimeDependencyManifests: NativeRuntimeDependencyManifests;
  evaluatedAt: string;
}): NativeVerifierExecutionPolicyValidationReport {
  const profile = normalizeProfileBoundary(input.profile);
  const policy = normalizeExecutionPolicy(input.policy);
  const manifests = normalizeRuntimeDependencyManifests(input.runtimeDependencyManifests);
  const evaluatedAt = isoTimestamp(input.evaluatedAt, 'execution policy evaluation timestamp');

  assertPolicyIdentityAndValidity(profile, policy, evaluatedAt);
  assertPolicyBindings(profile, policy);
  assertExactExecutionSemantics(policy);
  assertRuntimeDependencyManifest(
    manifests.verifier,
    policy.targets.verifier,
    profile.artifacts.verifier,
    'verifier',
  );
  assertRuntimeDependencyManifest(
    manifests.codec,
    policy.targets.codec,
    profile.artifacts.codec,
    'codec',
  );

  const executionPolicySha256 = deriveNativeVerifierExecutionPolicySha256(policy);
  if (executionPolicySha256 !== profile.executionPolicySha256) {
    throw new Error('native verifier execution policy digest does not match the attested profile');
  }

  const report = deepFreeze({
    schema: NATIVE_VERIFIER_EXECUTION_POLICY_VALIDATION_REPORT_SCHEMA,
    profileId: profile.profileId,
    attestationId: profile.attestationId,
    policyId: policy.policyId,
    executionPolicySha256,
    runtimeDependencyManifestSha256: {
      verifier: policy.targets.verifier.runtimeDependencyManifestSha256,
      codec: policy.targets.codec.runtimeDependencyManifestSha256,
    },
    validity: policy.validity,
    boundary: {
      relativeToSuppliedProfile: true as const,
      reviewedTrustRootsLoaded: profile.reviewedTrustRootsLoaded,
      executionCapabilityIssued: false as const,
      exactPolicyDigestMatched: true as const,
      exactArtifactBindingsMatched: true as const,
      runtimeDependencyManifestsMatched: true as const,
      loadedModuleClosureEnforced: false as const,
      executionAdmissionGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  }) as NativeVerifierExecutionPolicyValidationReport;
  VALIDATION_PROVENANCE.set(report, input.profile);
  return report;
}

export function assertNativeVerifierExecutionPolicyValidationProvenance(input: {
  profile: NativeVerifierAttestationValidationReport;
  report: unknown;
}): asserts input is {
  profile: NativeVerifierAttestationValidationReport;
  report: NativeVerifierExecutionPolicyValidationReport;
} {
  if (
    !input.report
    || typeof input.report !== 'object'
    || VALIDATION_PROVENANCE.get(input.report) !== input.profile
  ) {
    throw new Error(
      'native verifier execution policy validation provenance is missing for the supplied profile',
    );
  }
}

function normalizeExecutionPolicy(value: unknown): NativeVerifierExecutionPolicy {
  const record = exactRecord(value, [
    'schema',
    'profileId',
    'attestationId',
    'policyId',
    'canonicalization',
    'validity',
    'bindings',
    'environment',
    'targets',
    'boundaries',
  ], 'native verifier execution policy');
  if (record.schema !== NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA) {
    throw new Error('native verifier execution policy schema is unsupported');
  }
  if (record.canonicalization !== CANONICALIZATION) {
    throw new Error('native verifier execution policy canonicalization is unsupported');
  }
  const validity = exactRecord(
    record.validity,
    ['notBefore', 'expiresAt', 'policyEpoch'],
    'native verifier execution policy validity',
  );
  const bindings = exactRecord(
    record.bindings,
    ['attestationCoreDigestHex', 'buildDependencyManifestSha256', 'launcher'],
    'native verifier execution policy bindings',
  );
  const launcher = exactRecord(
    bindings.launcher,
    ['sha256', 'sizeBytes', 'sourceManifestSha256'],
    'native verifier execution policy launcher binding',
  );
  const environment = exactRecord(record.environment, [
    'variables',
    'temp',
    'workingDirectory',
    'pathInherited',
    'libraryPathInherited',
  ], 'native verifier execution policy environment');
  if (!Array.isArray(environment.variables)) {
    throw new Error('native verifier execution policy environment variables must be an array');
  }
  const targets = exactRecord(
    record.targets,
    ['verifier', 'codec'],
    'native verifier execution policy targets',
  );
  const boundaries = exactRecord(record.boundaries, [
    'launcherAtomicBootstrapProven',
    'loadedModuleClosureEnforced',
    'executionAdmissionGranted',
    'gate5Closed',
    'productionReady',
  ], 'native verifier execution policy boundaries');
  return {
    schema: NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
    profileId: identifier(record.profileId, 'native verifier execution policy profile ID'),
    attestationId: identifier(
      record.attestationId,
      'native verifier execution policy attestation ID',
    ),
    policyId: identifier(record.policyId, 'native verifier execution policy ID'),
    canonicalization: CANONICALIZATION,
    validity: {
      notBefore: isoTimestamp(validity.notBefore, 'execution policy notBefore'),
      expiresAt: isoTimestamp(validity.expiresAt, 'execution policy expiresAt'),
      policyEpoch: safeInteger(validity.policyEpoch, 'execution policy policyEpoch'),
    },
    bindings: {
      attestationCoreDigestHex: sha256Hex(
        bindings.attestationCoreDigestHex,
        'execution policy attestation core digest',
      ),
      buildDependencyManifestSha256: sha256Hex(
        bindings.buildDependencyManifestSha256,
        'execution policy build dependency manifest digest',
      ),
      launcher: {
        sha256: sha256Hex(launcher.sha256, 'execution policy launcher digest'),
        sizeBytes: positiveSafeInteger(launcher.sizeBytes, 'execution policy launcher size'),
        sourceManifestSha256: sha256Hex(
          launcher.sourceManifestSha256,
          'execution policy launcher source manifest digest',
        ),
      },
    },
    environment: {
      variables: environment.variables.map((entry, index) =>
        nonEmptyString(entry, `execution policy environment variable ${index}`)) as Array<
          'SystemRoot' | 'TEMP' | 'TMP'
        >,
      temp: nonEmptyString(environment.temp, 'execution policy temp mode') as 'staged-directory',
      workingDirectory: nonEmptyString(
        environment.workingDirectory,
        'execution policy working directory mode',
      ) as 'staged-directory',
      pathInherited: booleanValue(
        environment.pathInherited,
        'execution policy pathInherited',
      ) as false,
      libraryPathInherited: booleanValue(
        environment.libraryPathInherited,
        'execution policy libraryPathInherited',
      ) as false,
    },
    targets: {
      verifier: normalizeExecutionTarget(
        targets.verifier,
        'native verifier execution policy verifier target',
      ) as NativeVerifierExecutionTarget<'bridge-checkpoint-verifier'>,
      codec: normalizeExecutionTarget(
        targets.codec,
        'native verifier execution policy codec target',
      ) as NativeVerifierExecutionTarget<'bridge-rpc-proof-codec'>,
    },
    boundaries: {
      launcherAtomicBootstrapProven: booleanValue(
        boundaries.launcherAtomicBootstrapProven,
        'execution policy launcherAtomicBootstrapProven',
      ) as false,
      loadedModuleClosureEnforced: booleanValue(
        boundaries.loadedModuleClosureEnforced,
        'execution policy loadedModuleClosureEnforced',
      ) as false,
      executionAdmissionGranted: booleanValue(
        boundaries.executionAdmissionGranted,
        'execution policy executionAdmissionGranted',
      ) as false,
      gate5Closed: booleanValue(boundaries.gate5Closed, 'execution policy gate5Closed') as false,
      productionReady: booleanValue(
        boundaries.productionReady,
        'execution policy productionReady',
      ) as false,
    },
  };
}

function normalizeExecutionTarget(
  value: unknown,
  label: string,
): NativeVerifierExecutionTarget<NativeVerifierTargetRole> {
  const record = exactRecord(value, [
    'role',
    'artifactSha256',
    'artifactSizeBytes',
    'runtimeDependencyManifestSha256',
    'invocations',
    'limits',
  ], label);
  if (!Array.isArray(record.invocations)) throw new Error(`${label} invocations must be an array`);
  const limits = exactRecord(record.limits, [
    'timeoutMs',
    'requestLimitBytes',
    'stdoutLimitBytes',
    'stderrLimitBytes',
  ], `${label} limits`);
  return {
    role: targetRole(record.role, `${label} role`),
    artifactSha256: sha256Hex(record.artifactSha256, `${label} artifact digest`),
    artifactSizeBytes: positiveSafeInteger(record.artifactSizeBytes, `${label} artifact size`),
    runtimeDependencyManifestSha256: sha256Hex(
      record.runtimeDependencyManifestSha256,
      `${label} runtime dependency manifest digest`,
    ),
    invocations: record.invocations.map((invocation, index) =>
      normalizeInvocation(invocation, `${label} invocation ${index}`)),
    limits: {
      timeoutMs: positiveSafeInteger(limits.timeoutMs, `${label} timeout limit`),
      requestLimitBytes: positiveSafeInteger(
        limits.requestLimitBytes,
        `${label} request limit`,
      ),
      stdoutLimitBytes: positiveSafeInteger(limits.stdoutLimitBytes, `${label} stdout limit`),
      stderrLimitBytes: positiveSafeInteger(limits.stderrLimitBytes, `${label} stderr limit`),
    },
  };
}

function normalizeInvocation(value: unknown, label: string): NativeVerifierInvocationPolicy {
  const record = exactRecord(
    value,
    ['operation', 'argvTemplate', 'requestSchema', 'resultSchema'],
    label,
  );
  if (!Array.isArray(record.argvTemplate)) throw new Error(`${label} argv template must be an array`);
  return {
    operation: nonEmptyString(record.operation, `${label} operation`) as
      NativeVerifierInvocationPolicy['operation'],
    argvTemplate: record.argvTemplate.map((entry, index) => {
      const argv = asRecord(entry, `${label} argv template ${index}`);
      if (argv.kind === 'literal') {
        exactKeys(argv, ['kind', 'value'], `${label} argv template ${index}`);
        return {
          kind: 'literal' as const,
          value: nonEmptyString(argv.value, `${label} argv literal ${index}`),
        };
      }
      if (argv.kind === 'parameter') {
        exactKeys(argv, ['kind', 'name', 'format'], `${label} argv template ${index}`);
        return {
          kind: 'parameter' as const,
          name: nonEmptyString(argv.name, `${label} argv parameter name ${index}`) as
            'trustedAnchorDigestHex',
          format: nonEmptyString(argv.format, `${label} argv parameter format ${index}`) as
            'lowercase-0x-sha256',
        };
      }
      throw new Error(`${label} argv template ${index} kind is unsupported`);
    }),
    requestSchema: nonEmptyString(record.requestSchema, `${label} request schema`),
    resultSchema: nonEmptyString(record.resultSchema, `${label} result schema`),
  };
}

function normalizeRuntimeDependencyManifests(value: unknown): NativeRuntimeDependencyManifests {
  const record = exactRecord(
    value,
    ['verifier', 'codec'],
    'native runtime dependency manifests',
  );
  return {
    verifier: normalizeRuntimeDependencyManifest(
      record.verifier,
      'verifier runtime dependency manifest',
    ) as NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>,
    codec: normalizeRuntimeDependencyManifest(
      record.codec,
      'codec runtime dependency manifest',
    ) as NativeRuntimeDependencyManifest<'bridge-rpc-proof-codec'>,
  };
}

function normalizeRuntimeDependencyManifest(
  value: unknown,
  label: string,
): NativeRuntimeDependencyManifest {
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
  ], label);
  if (record.schema !== NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA) {
    throw new Error(`${label} schema is unsupported`);
  }
  const boundaries = exactRecord(record.boundaries, [
    'loadedModuleClosureEnforced',
    'dynamicLoadsCryptographicallyExcluded',
  ], `${label} boundaries`);
  const systemDlls = stringArray(record.systemDlls, `${label} systemDlls`);
  if (systemDlls.length > MAX_RUNTIME_SYSTEM_DLLS) {
    throw new Error(`${label} systemDlls exceeds ${MAX_RUNTIME_SYSTEM_DLLS} entries`);
  }
  return {
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role: targetRole(record.role, `${label} role`),
    artifactSha256: sha256Hex(record.artifactSha256, `${label} artifact digest`),
    artifactSizeBytes: positiveSafeInteger(record.artifactSizeBytes, `${label} artifact size`),
    platform: nonEmptyString(record.platform, `${label} platform`) as 'win32-x64',
    systemDlls,
    delayLoadedDlls: stringArray(record.delayLoadedDlls, `${label} delayLoadedDlls`),
    nonSystemDependencies: stringArray(
      record.nonSystemDependencies,
      `${label} nonSystemDependencies`,
    ),
    sidecars: stringArray(record.sidecars, `${label} sidecars`),
    dynamicLibraryLoadingReviewedAbsent: booleanValue(
      record.dynamicLibraryLoadingReviewedAbsent,
      `${label} dynamicLibraryLoadingReviewedAbsent`,
    ) as true,
    boundaries: {
      loadedModuleClosureEnforced: booleanValue(
        boundaries.loadedModuleClosureEnforced,
        `${label} loadedModuleClosureEnforced`,
      ) as false,
      dynamicLoadsCryptographicallyExcluded: booleanValue(
        boundaries.dynamicLoadsCryptographicallyExcluded,
        `${label} dynamicLoadsCryptographicallyExcluded`,
      ) as false,
    },
  };
}

function normalizeProfileBoundary(profile: NativeVerifierAttestationValidationReport): {
  profileId: string;
  attestationId: string;
  statementCoreDigestHex: string;
  reviewedAt: string;
  buildDependencyManifestSha256: string;
  executionPolicySha256: string;
  artifacts: NativeVerifierAttestationValidationReport['artifacts'];
  reviewedTrustRootsLoaded: boolean;
} {
  if (!profile || typeof profile !== 'object') {
    throw new Error('native verifier attestation profile must be an object');
  }
  if (
    profile.boundary?.relativeToSuppliedPolicy !== true
    || profile.boundary.executionCapabilityIssued !== false
    || profile.boundary.admissionEligible !== false
    || profile.boundary.gate5Closed !== false
    || profile.boundary.productionReady !== false
  ) {
    throw new Error('native verifier attestation profile boundary is not fail-closed');
  }
  if (typeof profile.boundary.reviewedTrustRootsLoaded !== 'boolean') {
    throw new Error('native verifier attestation profile trust-root boundary must be boolean');
  }
  return {
    profileId: identifier(profile.profileId, 'attestation profile ID'),
    attestationId: identifier(profile.attestationId, 'attestation ID'),
    statementCoreDigestHex: sha256Hex(
      profile.attestation?.statementCoreDigestHex,
      'attestation statement core digest',
    ),
    reviewedAt: isoTimestamp(profile.timestamps?.reviewedAt, 'attestation reviewedAt'),
    buildDependencyManifestSha256: sha256Hex(
      profile.dependencies?.manifestSha256,
      'attested build dependency manifest digest',
    ),
    executionPolicySha256: sha256Hex(
      profile.executionPolicySha256,
      'attested execution policy digest',
    ),
    artifacts: {
      verifier: normalizeProfileArtifact(
        profile.artifacts?.verifier,
        'bridge-checkpoint-verifier',
        'attested verifier artifact',
      ),
      codec: normalizeProfileArtifact(
        profile.artifacts?.codec,
        'bridge-rpc-proof-codec',
        'attested codec artifact',
      ),
    },
    reviewedTrustRootsLoaded: profile.boundary.reviewedTrustRootsLoaded,
  };
}

function normalizeProfileArtifact<Role extends NativeVerifierTargetRole>(
  artifact: unknown,
  expectedRole: Role,
  label: string,
): { role: Role; sha256: string; sizeBytes: number } {
  const record = asRecord(artifact, label);
  if (record.role !== expectedRole) throw new Error(`${label} role does not match ${expectedRole}`);
  return {
    role: expectedRole,
    sha256: sha256Hex(record.sha256, `${label} digest`),
    sizeBytes: positiveSafeInteger(record.sizeBytes, `${label} size`),
  };
}

function assertPolicyIdentityAndValidity(
  profile: ReturnType<typeof normalizeProfileBoundary>,
  policy: NativeVerifierExecutionPolicy,
  evaluatedAt: string,
): void {
  if (policy.profileId !== profile.profileId) {
    throw new Error('native verifier execution policy profile ID does not match the attestation');
  }
  if (policy.attestationId !== profile.attestationId) {
    throw new Error('native verifier execution policy attestation ID does not match the profile');
  }
  const notBefore = Date.parse(policy.validity.notBefore);
  const expiresAt = Date.parse(policy.validity.expiresAt);
  const reviewedAt = Date.parse(profile.reviewedAt);
  const evaluated = Date.parse(evaluatedAt);
  if (policy.validity.policyEpoch <= 0) {
    throw new Error('native verifier execution policy policyEpoch must be positive');
  }
  if (notBefore >= expiresAt) {
    throw new Error('native verifier execution policy validity must have notBefore before expiresAt');
  }
  if (notBefore < reviewedAt) {
    throw new Error('native verifier execution policy notBefore must not precede attestation reviewedAt');
  }
  if (evaluated < notBefore) throw new Error('native verifier execution policy is not active yet');
  if (evaluated >= expiresAt) throw new Error('native verifier execution policy is expired');
}

function assertPolicyBindings(
  profile: ReturnType<typeof normalizeProfileBoundary>,
  policy: NativeVerifierExecutionPolicy,
): void {
  if (policy.bindings.attestationCoreDigestHex !== profile.statementCoreDigestHex) {
    throw new Error('execution policy attestation core digest does not match the profile');
  }
  if (
    policy.bindings.buildDependencyManifestSha256
    !== profile.buildDependencyManifestSha256
  ) {
    throw new Error('execution policy build dependency manifest digest does not match the profile');
  }
  for (const key of ['verifier', 'codec'] as const) {
    const target = policy.targets[key];
    const artifact = profile.artifacts[key];
    if (target.role !== artifact.role) {
      throw new Error(`execution policy ${key} role does not match the attested artifact`);
    }
    if (
      target.artifactSha256 !== artifact.sha256
      || target.artifactSizeBytes !== artifact.sizeBytes
    ) {
      throw new Error(`execution policy ${key} artifact does not match the attested bytes`);
    }
  }
}

function assertExactExecutionSemantics(policy: NativeVerifierExecutionPolicy): void {
  const expectedVerifier: NativeVerifierInvocationPolicy[] = [{
    operation: 'verify-checkpoint',
    argvTemplate: [
      { kind: 'literal', value: '--trusted-anchor-digest' },
      {
        kind: 'parameter',
        name: 'trustedAnchorDigestHex',
        format: 'lowercase-0x-sha256',
      },
    ],
    requestSchema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    resultSchema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA,
  }];
  const expectedCodec: NativeVerifierInvocationPolicy[] = [
    {
      operation: 'encode-headers',
      argvTemplate: [{ kind: 'literal', value: '--encode-headers' }],
      requestSchema: RPC_HEADER_ENCODING_REQUEST_SCHEMA,
      resultSchema: RPC_HEADER_ENCODING_RESULT_SCHEMA,
    },
    {
      operation: 'inspect-warp-proof',
      argvTemplate: [{ kind: 'literal', value: '--inspect-warp-proof' }],
      requestSchema: RPC_WARP_INSPECTION_REQUEST_SCHEMA,
      resultSchema: RPC_WARP_INSPECTION_RESULT_SCHEMA,
    },
    {
      operation: 'inspect-finality-proof',
      argvTemplate: [{ kind: 'literal', value: '--inspect-finality-proof' }],
      requestSchema: RPC_FINALITY_INSPECTION_REQUEST_SCHEMA,
      resultSchema: RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
    },
  ];
  if (canonicalE2sJson(policy.targets.verifier.invocations) !== canonicalE2sJson(expectedVerifier)) {
    throw new Error('native verifier execution policy verifier invocation is not exact');
  }
  if (canonicalE2sJson(policy.targets.codec.invocations) !== canonicalE2sJson(expectedCodec)) {
    throw new Error('native verifier execution policy codec invocations are not exact or ordered');
  }
  for (const [label, target] of Object.entries(policy.targets)) {
    if (canonicalE2sJson(target.limits) !== canonicalE2sJson(FIXED_LIMITS)) {
      throw new Error(`native verifier execution policy ${label} limits are not exact`);
    }
  }
  const expectedEnvironment: NativeVerifierExecutionPolicy['environment'] = {
    variables: ['SystemRoot', 'TEMP', 'TMP'],
    temp: 'staged-directory',
    workingDirectory: 'staged-directory',
    pathInherited: false,
    libraryPathInherited: false,
  };
  if (canonicalE2sJson(policy.environment) !== canonicalE2sJson(expectedEnvironment)) {
    throw new Error('native verifier execution policy environment is not exact');
  }
  if (
    policy.boundaries.launcherAtomicBootstrapProven !== false
    || policy.boundaries.loadedModuleClosureEnforced !== false
    || policy.boundaries.executionAdmissionGranted !== false
    || policy.boundaries.gate5Closed !== false
    || policy.boundaries.productionReady !== false
  ) {
    throw new Error('native verifier execution policy boundaries must remain fail-closed');
  }
}

function assertRuntimeDependencyManifest(
  manifest: NativeRuntimeDependencyManifest,
  target: NativeVerifierExecutionTarget<NativeVerifierTargetRole>,
  artifact: { role: NativeVerifierTargetRole; sha256: string; sizeBytes: number },
  label: string,
): void {
  if (
    manifest.role !== target.role
    || manifest.role !== artifact.role
    || manifest.artifactSha256 !== target.artifactSha256
    || manifest.artifactSha256 !== artifact.sha256
    || manifest.artifactSizeBytes !== target.artifactSizeBytes
    || manifest.artifactSizeBytes !== artifact.sizeBytes
  ) {
    throw new Error(`native ${label} runtime dependency manifest artifact binding is invalid`);
  }
  if (manifest.platform !== 'win32-x64') {
    throw new Error(`native ${label} runtime dependency manifest platform must be win32-x64`);
  }
  const manifestDigest = deriveNativeRuntimeDependencyManifestSha256(manifest);
  if (manifestDigest !== target.runtimeDependencyManifestSha256) {
    throw new Error(`native ${label} runtime dependency manifest digest does not match the policy`);
  }
  if (!isSortedUniqueLowercaseDllList(manifest.systemDlls)) {
    throw new Error(`native ${label} runtime dependency manifest systemDlls must be sorted unique lowercase DLL names`);
  }
  if (
    manifest.delayLoadedDlls.length !== 0
    || manifest.nonSystemDependencies.length !== 0
    || manifest.sidecars.length !== 0
  ) {
    throw new Error(`native ${label} runtime dependency manifest contains unsupported dependencies or sidecars`);
  }
  if (
    manifest.dynamicLibraryLoadingReviewedAbsent !== true
    || manifest.boundaries.loadedModuleClosureEnforced !== false
    || manifest.boundaries.dynamicLoadsCryptographicallyExcluded !== false
  ) {
    throw new Error(`native ${label} runtime dependency manifest closure boundaries are invalid`);
  }
}

function isSortedUniqueLowercaseDllList(values: string[]): boolean {
  return values.every((value, index) =>
    /^[a-z0-9._-]+\.dll$/.test(value)
    && (index === 0 || values[index - 1] < value));
}

function exactRecord(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
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

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => nonEmptyString(entry, `${label}[${index}]`));
}

function targetRole(value: unknown, label: string): NativeVerifierTargetRole {
  if (
    value !== 'bridge-checkpoint-verifier'
    && value !== 'bridge-rpc-proof-codec'
    && value !== 'bridge-peg-in-runtime-identity-v2-verifier'
  ) {
    throw new Error(`${label} is unsupported`);
  }
  return value;
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
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  if (new Date(value).toISOString() !== value) {
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

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function sha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed 32-byte hex`);
  }
  return value;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
