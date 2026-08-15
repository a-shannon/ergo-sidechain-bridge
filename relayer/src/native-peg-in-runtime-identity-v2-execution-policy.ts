import { createHash } from 'crypto';

import {
  canonicalE2sJson,
} from './independently-attested-native-verifier-profile.js';
import {
  assertNativePegInRuntimeIdentityV2AttestationValidationProvenance,
  type NativePegInRuntimeIdentityV2AttestationValidationReport,
} from './native-peg-in-runtime-identity-v2-verifier-attestation.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  deriveNativeRuntimeDependencyManifestSha256,
  type NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';
import {
  assertPegInRuntimeBuildAttestationValidationProvenance,
  type PegInRuntimeBuildAttestationValidationReport,
} from './peg-in-runtime-build-attestation.js';

export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA =
  'e2s.native-peg-in-runtime-identity-v2-execution-policy.v1' as const;
export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_REPORT_SCHEMA =
  'e2s.native-peg-in-runtime-identity-v2-execution-policy-validation-report.v1' as const;

const CANONICALIZATION = 'e2s-canonical-json-v1' as const;
const RUNTIME_IDENTITY_V2_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-runtime-identity-request.v2' as const;
const RUNTIME_IDENTITY_V2_RESULT_SCHEMA =
  'e2s.native-finalized-peg-in-runtime-identity-verification.v2' as const;
const POLICY_DOMAIN = Buffer.from(
  'E2S_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_V1\0',
  'utf8',
);
const MAX_RUNTIME_SYSTEM_DLLS = 128;

export interface NativePegInRuntimeIdentityV2ExecutionLimits {
  timeoutMs: number;
  requestLimitBytes: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
}

const FIXED_LIMITS: NativePegInRuntimeIdentityV2ExecutionLimits =
  Object.freeze({
    timeoutMs: 30_000,
    requestLimitBytes: 32 * 1024 * 1024,
    stdoutLimitBytes: 16 * 1024 * 1024,
    stderrLimitBytes: 64 * 1024,
  });

export interface NativePegInRuntimeIdentityV2ExecutionPolicy {
  schema: typeof NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA;
  policyId: string;
  canonicalization: typeof CANONICALIZATION;
  validity: {
    notBefore: string;
    expiresAt: string;
    policyEpoch: number;
  };
  runtimeBuild: {
    profileId: string;
    attestationId: string;
    packetSha256Hex: string;
    attestorPolicyDigestHex: string;
    builderKeyIdHex: string;
    builderOrganizationId: string;
    reviewerKeyIdHex: string;
    reviewerOrganizationId: string;
    artifactSha256: string;
    artifactSizeBytes: number;
  };
  nativeVerifier: {
    profileId: string;
    attestationId: string;
    attestationCoreDigestHex: string;
    attestorPolicyDigestHex: string;
    builderKeyIdHex: string;
    builderOrganizationId: string;
    reviewerKeyIdHex: string;
    reviewerOrganizationId: string;
    buildDependencyManifestSha256: string;
    launcher: {
      sha256: string;
      sizeBytes: number;
      sourceManifestSha256: string;
    };
    artifactSha256: string;
    artifactSizeBytes: number;
    runtimeDependencyManifestSha256: string;
  };
  environment: {
    variables: Array<'SystemRoot' | 'TEMP' | 'TMP'>;
    temp: 'staged-directory';
    workingDirectory: 'staged-directory';
    pathInherited: false;
    libraryPathInherited: false;
  };
  invocation: {
    operation: 'verify-peg-in-runtime-identity-v2';
    argvTemplate: [
      { kind: 'literal'; value: '--trusted-anchor-digest' },
      {
        kind: 'parameter';
        name: 'trustedAnchorDigestHex';
        format: 'lowercase-0x-blake2b256';
      },
    ];
    requestSchema:
      typeof RUNTIME_IDENTITY_V2_REQUEST_SCHEMA;
    resultSchema:
      typeof RUNTIME_IDENTITY_V2_RESULT_SCHEMA;
    limits: NativePegInRuntimeIdentityV2ExecutionLimits;
  };
  boundaries: {
    runtimeAndVerifierAttestationsRemainSeparate: true;
    attestorFamiliesDisjoint: true;
    targetStateCodeIsNotHistoricalProducerCode: true;
    launcherAtomicBootstrapProven: false;
    loadedModuleClosureEnforced: false;
    runtimeUpgradeHistoryVerified: false;
    cutoverPolicyVerified: false;
    targetRuntimeBuildIdentityVerified: false;
    runtimeCodeIdentityVerified: false;
    historicalMintAbsenceVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport {
  schema:
    typeof NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_REPORT_SCHEMA;
  policyId: string;
  executionPolicySha256: string;
  validity: NativePegInRuntimeIdentityV2ExecutionPolicy['validity'];
  runtimeBuild: {
    profileId: string;
    attestationId: string;
    packetSha256Hex: string;
    artifactSha256: string;
    artifactSizeBytes: number;
  };
  nativeVerifier: {
    profileId: string;
    attestationId: string;
    artifactSha256: string;
    artifactSizeBytes: number;
    runtimeDependencyManifestSha256: string;
  };
  boundary: {
    relativeToSuppliedAttestations: true;
    runtimeReviewedTrustRootsLoaded: boolean;
    nativeVerifierReviewedTrustRootsLoaded: boolean;
    exactRuntimeBuildBindingMatched: true;
    exactNativeVerifierBindingMatched: true;
    attestorFamiliesDisjoint: true;
    runtimeDependencyManifestMatched: true;
    executionCapabilityIssued: false;
    targetRuntimeBuildIdentityVerified: false;
    runtimeCodeIdentityVerified: false;
    runtimeUpgradeHistoryVerified: false;
    cutoverPolicyVerified: false;
    historicalMintAbsenceVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

const VALIDATION_PROVENANCE = new WeakMap<object, {
  runtimeBuild: object;
  nativeVerifier: object;
}>();

export function deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(
  policy: unknown,
): string {
  return createHash('sha256')
    .update(Buffer.concat([
      POLICY_DOMAIN,
      Buffer.from(canonicalE2sJson(normalizePolicy(policy)), 'utf8'),
    ]))
    .digest('hex');
}

export function validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations(
  input: {
    runtimeBuild: PegInRuntimeBuildAttestationValidationReport;
    nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport;
    policy: NativePegInRuntimeIdentityV2ExecutionPolicy;
    runtimeDependencyManifest:
      NativeRuntimeDependencyManifest<
        'bridge-peg-in-runtime-identity-v2-verifier'
      >;
    evaluatedAt: string;
  },
): NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport {
  assertPegInRuntimeBuildAttestationValidationProvenance(input.runtimeBuild);
  assertNativePegInRuntimeIdentityV2AttestationValidationProvenance(
    input.nativeVerifier,
  );
  const report =
    validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations(
      input,
    );
  VALIDATION_PROVENANCE.set(report, {
    runtimeBuild: input.runtimeBuild,
    nativeVerifier: input.nativeVerifier,
  });
  return report;
}

/** Structural conformance only. Supplied reports may lack reviewed provenance. */
export function validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations(
  input: {
    runtimeBuild: PegInRuntimeBuildAttestationValidationReport;
    nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport;
    policy: NativePegInRuntimeIdentityV2ExecutionPolicy;
    runtimeDependencyManifest:
      NativeRuntimeDependencyManifest<
        'bridge-peg-in-runtime-identity-v2-verifier'
      >;
    evaluatedAt: string;
  },
): NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport {
  const runtimeBuild = normalizeRuntimeBuildReport(input.runtimeBuild);
  const nativeVerifier = normalizeNativeVerifierReport(input.nativeVerifier);
  const policy = normalizePolicy(input.policy);
  const manifest = normalizeManifest(input.runtimeDependencyManifest);
  const evaluatedAt = isoTimestamp(
    input.evaluatedAt,
    'runtime identity V2 execution policy evaluation timestamp',
  );

  assertValidity(policy, evaluatedAt);
  assertExactExecutionSemantics(policy);
  assertAttestorFamiliesDisjoint(runtimeBuild, nativeVerifier);
  assertRuntimeBuildBinding(runtimeBuild, policy);
  assertNativeVerifierBinding(nativeVerifier, policy);
  assertRuntimeDependencyManifest(nativeVerifier, policy, manifest);

  const executionPolicySha256 =
    deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(policy);
  if (executionPolicySha256 !== nativeVerifier.executionPolicySha256) {
    throw new Error(
      'runtime identity V2 execution policy digest does not match the native verifier attestation',
    );
  }

  return deepFreeze({
    schema:
      NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_REPORT_SCHEMA,
    policyId: policy.policyId,
    executionPolicySha256,
    validity: policy.validity,
    runtimeBuild: {
      profileId: runtimeBuild.profileId,
      attestationId: runtimeBuild.attestationId,
      packetSha256Hex: runtimeBuild.packetSha256Hex,
      artifactSha256: runtimeBuild.artifactSha256,
      artifactSizeBytes: runtimeBuild.artifactSizeBytes,
    },
    nativeVerifier: {
      profileId: nativeVerifier.profileId,
      attestationId: nativeVerifier.attestationId,
      artifactSha256: nativeVerifier.artifactSha256,
      artifactSizeBytes: nativeVerifier.artifactSizeBytes,
      runtimeDependencyManifestSha256:
        policy.nativeVerifier.runtimeDependencyManifestSha256,
    },
    boundary: {
      relativeToSuppliedAttestations: true as const,
      runtimeReviewedTrustRootsLoaded:
        runtimeBuild.reviewedTrustRootsLoaded,
      nativeVerifierReviewedTrustRootsLoaded:
        nativeVerifier.reviewedTrustRootsLoaded,
      exactRuntimeBuildBindingMatched: true as const,
      exactNativeVerifierBindingMatched: true as const,
      attestorFamiliesDisjoint: true as const,
      runtimeDependencyManifestMatched: true as const,
      executionCapabilityIssued: false as const,
      targetRuntimeBuildIdentityVerified: false as const,
      runtimeCodeIdentityVerified: false as const,
      runtimeUpgradeHistoryVerified: false as const,
      cutoverPolicyVerified: false as const,
      historicalMintAbsenceVerified: false as const,
      committedVaultTransitionVerified: false as const,
      mintAuthorityGranted: false as const,
      settlementAuthorityGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  });
}

export function assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance(
  input: {
    runtimeBuild: PegInRuntimeBuildAttestationValidationReport;
    nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport;
    report: unknown;
  },
): asserts input is {
  runtimeBuild: PegInRuntimeBuildAttestationValidationReport;
  nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport;
  report: NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport;
} {
  if (!input.report || typeof input.report !== 'object') {
    throw new Error(
      'runtime identity V2 execution policy validation provenance is missing',
    );
  }
  const provenance = VALIDATION_PROVENANCE.get(input.report);
  if (
    provenance?.runtimeBuild !== input.runtimeBuild
    || provenance.nativeVerifier !== input.nativeVerifier
  ) {
    throw new Error(
      'runtime identity V2 execution policy validation provenance is missing',
    );
  }
}

function normalizePolicy(
  value: unknown,
): NativePegInRuntimeIdentityV2ExecutionPolicy {
  const record = exactRecord(value, [
    'boundaries',
    'canonicalization',
    'environment',
    'invocation',
    'nativeVerifier',
    'policyId',
    'runtimeBuild',
    'schema',
    'validity',
  ], 'runtime identity V2 execution policy');
  requireLiteral(
    record.schema,
    NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA,
    'runtime identity V2 execution policy schema',
  );
  requireLiteral(
    record.canonicalization,
    CANONICALIZATION,
    'runtime identity V2 execution policy canonicalization',
  );
  const validity = exactRecord(
    record.validity,
    ['expiresAt', 'notBefore', 'policyEpoch'],
    'runtime identity V2 execution policy validity',
  );
  const runtimeBuild = exactRecord(record.runtimeBuild, [
    'artifactSha256',
    'artifactSizeBytes',
    'attestationId',
    'attestorPolicyDigestHex',
    'builderKeyIdHex',
    'builderOrganizationId',
    'packetSha256Hex',
    'profileId',
    'reviewerKeyIdHex',
    'reviewerOrganizationId',
  ], 'runtime identity V2 execution policy runtime build');
  const nativeVerifier = exactRecord(record.nativeVerifier, [
    'artifactSha256',
    'artifactSizeBytes',
    'attestationCoreDigestHex',
    'attestationId',
    'attestorPolicyDigestHex',
    'buildDependencyManifestSha256',
    'builderKeyIdHex',
    'builderOrganizationId',
    'launcher',
    'profileId',
    'reviewerKeyIdHex',
    'reviewerOrganizationId',
    'runtimeDependencyManifestSha256',
  ], 'runtime identity V2 execution policy native verifier');
  const launcher = exactRecord(nativeVerifier.launcher, [
    'sha256',
    'sizeBytes',
    'sourceManifestSha256',
  ], 'runtime identity V2 execution policy launcher');
  const environment = exactRecord(record.environment, [
    'libraryPathInherited',
    'pathInherited',
    'temp',
    'variables',
    'workingDirectory',
  ], 'runtime identity V2 execution policy environment');
  const invocation = exactRecord(record.invocation, [
    'argvTemplate',
    'limits',
    'operation',
    'requestSchema',
    'resultSchema',
  ], 'runtime identity V2 execution policy invocation');
  if (!Array.isArray(invocation.argvTemplate)) {
    throw new Error(
      'runtime identity V2 execution policy argv template must be an array',
    );
  }
  const limits = exactRecord(invocation.limits, [
    'requestLimitBytes',
    'stderrLimitBytes',
    'stdoutLimitBytes',
    'timeoutMs',
  ], 'runtime identity V2 execution policy limits');
  const boundaries = exactRecord(record.boundaries, [
    'committedVaultTransitionVerified',
    'cutoverPolicyVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'launcherAtomicBootstrapProven',
    'loadedModuleClosureEnforced',
    'mintAuthorityGranted',
    'productionReady',
    'attestorFamiliesDisjoint',
    'runtimeAndVerifierAttestationsRemainSeparate',
    'runtimeCodeIdentityVerified',
    'runtimeUpgradeHistoryVerified',
    'settlementAuthorityGranted',
    'targetRuntimeBuildIdentityVerified',
    'targetStateCodeIsNotHistoricalProducerCode',
  ], 'runtime identity V2 execution policy boundaries');

  return deepFreeze({
    schema: NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA,
    policyId: identifier(record.policyId, 'runtime identity V2 policy ID'),
    canonicalization: CANONICALIZATION,
    validity: {
      notBefore: isoTimestamp(validity.notBefore, 'policy not-before timestamp'),
      expiresAt: isoTimestamp(validity.expiresAt, 'policy expiry timestamp'),
      policyEpoch: positiveSafeInteger(validity.policyEpoch, 'policy epoch'),
    },
    runtimeBuild: {
      profileId: identifier(runtimeBuild.profileId, 'runtime build profile ID'),
      attestationId: identifier(
        runtimeBuild.attestationId,
        'runtime build attestation ID',
      ),
      packetSha256Hex: prefixedSha256(
        runtimeBuild.packetSha256Hex,
        'runtime build packet digest',
      ),
      attestorPolicyDigestHex: sha256Hex(
        runtimeBuild.attestorPolicyDigestHex,
        'runtime build attestor policy digest',
      ),
      builderKeyIdHex: sha256Hex(
        runtimeBuild.builderKeyIdHex,
        'runtime build builder key ID',
      ),
      builderOrganizationId: identifier(
        runtimeBuild.builderOrganizationId,
        'runtime build builder organization ID',
      ),
      reviewerKeyIdHex: sha256Hex(
        runtimeBuild.reviewerKeyIdHex,
        'runtime build reviewer key ID',
      ),
      reviewerOrganizationId: identifier(
        runtimeBuild.reviewerOrganizationId,
        'runtime build reviewer organization ID',
      ),
      artifactSha256: sha256Hex(
        runtimeBuild.artifactSha256,
        'runtime build artifact digest',
      ),
      artifactSizeBytes: positiveSafeInteger(
        runtimeBuild.artifactSizeBytes,
        'runtime build artifact size',
      ),
    },
    nativeVerifier: {
      profileId: identifier(
        nativeVerifier.profileId,
        'native V2 verifier profile ID',
      ),
      attestationId: identifier(
        nativeVerifier.attestationId,
        'native V2 verifier attestation ID',
      ),
      attestationCoreDigestHex: sha256Hex(
        nativeVerifier.attestationCoreDigestHex,
        'native V2 verifier attestation core digest',
      ),
      attestorPolicyDigestHex: sha256Hex(
        nativeVerifier.attestorPolicyDigestHex,
        'native V2 verifier attestor policy digest',
      ),
      builderKeyIdHex: sha256Hex(
        nativeVerifier.builderKeyIdHex,
        'native V2 verifier builder key ID',
      ),
      builderOrganizationId: identifier(
        nativeVerifier.builderOrganizationId,
        'native V2 verifier builder organization ID',
      ),
      reviewerKeyIdHex: sha256Hex(
        nativeVerifier.reviewerKeyIdHex,
        'native V2 verifier reviewer key ID',
      ),
      reviewerOrganizationId: identifier(
        nativeVerifier.reviewerOrganizationId,
        'native V2 verifier reviewer organization ID',
      ),
      buildDependencyManifestSha256: sha256Hex(
        nativeVerifier.buildDependencyManifestSha256,
        'native V2 verifier build dependency digest',
      ),
      launcher: {
        sha256: sha256Hex(launcher.sha256, 'contained launcher digest'),
        sizeBytes: positiveSafeInteger(
          launcher.sizeBytes,
          'contained launcher size',
        ),
        sourceManifestSha256: sha256Hex(
          launcher.sourceManifestSha256,
          'contained launcher source manifest digest',
        ),
      },
      artifactSha256: sha256Hex(
        nativeVerifier.artifactSha256,
        'native V2 verifier artifact digest',
      ),
      artifactSizeBytes: positiveSafeInteger(
        nativeVerifier.artifactSizeBytes,
        'native V2 verifier artifact size',
      ),
      runtimeDependencyManifestSha256: sha256Hex(
        nativeVerifier.runtimeDependencyManifestSha256,
        'native V2 verifier runtime dependency manifest digest',
      ),
    },
    environment: {
      variables: exactEnvironmentVariables(environment.variables),
      temp: literal(
        environment.temp,
        'staged-directory',
        'runtime identity V2 execution policy temp mode',
      ),
      workingDirectory: literal(
        environment.workingDirectory,
        'staged-directory',
        'runtime identity V2 execution policy working directory',
      ),
      pathInherited: falseValue(
        environment.pathInherited,
        'runtime identity V2 PATH inheritance',
      ),
      libraryPathInherited: falseValue(
        environment.libraryPathInherited,
        'runtime identity V2 library-path inheritance',
      ),
    },
    invocation: {
      operation: literal(
        invocation.operation,
        'verify-peg-in-runtime-identity-v2',
        'runtime identity V2 operation',
      ),
      argvTemplate: invocation.argvTemplate.map(normalizeArgvEntry) as
        NativePegInRuntimeIdentityV2ExecutionPolicy['invocation']['argvTemplate'],
      requestSchema: literal(
        invocation.requestSchema,
        RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
        'runtime identity V2 request schema',
      ),
      resultSchema: literal(
        invocation.resultSchema,
        RUNTIME_IDENTITY_V2_RESULT_SCHEMA,
        'runtime identity V2 result schema',
      ),
      limits: {
        timeoutMs: positiveSafeInteger(limits.timeoutMs, 'timeout limit'),
        requestLimitBytes: positiveSafeInteger(
          limits.requestLimitBytes,
          'request byte limit',
        ),
        stdoutLimitBytes: positiveSafeInteger(
          limits.stdoutLimitBytes,
          'stdout byte limit',
        ),
        stderrLimitBytes: positiveSafeInteger(
          limits.stderrLimitBytes,
          'stderr byte limit',
        ),
      },
    },
    boundaries: {
      runtimeAndVerifierAttestationsRemainSeparate: trueValue(
        boundaries.runtimeAndVerifierAttestationsRemainSeparate,
        'attestation separation boundary',
      ),
      attestorFamiliesDisjoint: trueValue(
        boundaries.attestorFamiliesDisjoint,
        'attestor-family separation boundary',
      ),
      targetStateCodeIsNotHistoricalProducerCode: trueValue(
        boundaries.targetStateCodeIsNotHistoricalProducerCode,
        'target-state runtime limitation',
      ),
      launcherAtomicBootstrapProven: falseValue(
        boundaries.launcherAtomicBootstrapProven,
        'launcher atomic bootstrap boundary',
      ),
      loadedModuleClosureEnforced: falseValue(
        boundaries.loadedModuleClosureEnforced,
        'loaded module closure boundary',
      ),
      runtimeUpgradeHistoryVerified: falseValue(
        boundaries.runtimeUpgradeHistoryVerified,
        'runtime upgrade history boundary',
      ),
      cutoverPolicyVerified: falseValue(
        boundaries.cutoverPolicyVerified,
        'runtime cutover policy boundary',
      ),
      targetRuntimeBuildIdentityVerified: falseValue(
        boundaries.targetRuntimeBuildIdentityVerified,
        'target runtime build identity boundary',
      ),
      runtimeCodeIdentityVerified: falseValue(
        boundaries.runtimeCodeIdentityVerified,
        'runtime code identity boundary',
      ),
      historicalMintAbsenceVerified: falseValue(
        boundaries.historicalMintAbsenceVerified,
        'historical mint absence boundary',
      ),
      committedVaultTransitionVerified: falseValue(
        boundaries.committedVaultTransitionVerified,
        'committed vault boundary',
      ),
      mintAuthorityGranted: falseValue(
        boundaries.mintAuthorityGranted,
        'mint authority boundary',
      ),
      settlementAuthorityGranted: falseValue(
        boundaries.settlementAuthorityGranted,
        'settlement authority boundary',
      ),
      gate5Closed: falseValue(
        boundaries.gate5Closed,
        'Gate 5 boundary',
      ),
      productionReady: falseValue(
        boundaries.productionReady,
        'production readiness boundary',
      ),
    },
  });
}

function normalizeRuntimeBuildReport(
  report: PegInRuntimeBuildAttestationValidationReport,
) {
  if (!report || typeof report !== 'object') {
    throw new Error('runtime build attestation report must be an object');
  }
  return {
    profileId: identifier(report.profileId, 'runtime build profile ID'),
    attestationId: identifier(
      report.attestationId,
      'runtime build attestation ID',
    ),
    packetSha256Hex: prefixedSha256(
      report.attestation?.packetSha256Hex,
      'runtime build packet digest',
    ),
    policyDigestHex: sha256Hex(
      report.attestation?.policyDigestHex,
      'runtime build attestor policy digest',
    ),
    builderKeyIdHex: sha256Hex(
      report.attestation?.builderKeyIdHex,
      'runtime build builder key ID',
    ),
    builderOrganizationId: identifier(
      report.attestation?.builderOrganizationId,
      'runtime build builder organization ID',
    ),
    reviewerKeyIdHex: sha256Hex(
      report.attestation?.reviewerKeyIdHex,
      'runtime build reviewer key ID',
    ),
    reviewerOrganizationId: identifier(
      report.attestation?.reviewerOrganizationId,
      'runtime build reviewer organization ID',
    ),
    artifactSha256: sha256Hex(
      report.artifact?.sha256,
      'runtime build artifact digest',
    ),
    artifactSizeBytes: positiveSafeInteger(
      report.artifact?.sizeBytes,
      'runtime build artifact size',
    ),
    reviewedTrustRootsLoaded:
      booleanValue(
        report.boundary?.reviewedTrustRootsLoaded,
        'runtime build reviewed trust-root boundary',
      ),
  };
}

function normalizeNativeVerifierReport(
  report: NativePegInRuntimeIdentityV2AttestationValidationReport,
) {
  if (!report || typeof report !== 'object') {
    throw new Error('native V2 verifier attestation report must be an object');
  }
  return {
    profileId: identifier(report.profileId, 'native V2 verifier profile ID'),
    attestationId: identifier(
      report.attestationId,
      'native V2 verifier attestation ID',
    ),
    attestationCoreDigestHex: sha256Hex(
      report.attestation?.statementCoreDigestHex,
      'native V2 verifier attestation core digest',
    ),
    attestorPolicyDigestHex: sha256Hex(
      report.attestation?.policyDigestHex,
      'native V2 verifier attestor policy digest',
    ),
    builderKeyIdHex: sha256Hex(
      report.attestation?.builderKeyIdHex,
      'native V2 verifier builder key ID',
    ),
    builderOrganizationId: identifier(
      report.attestation?.builderOrganizationId,
      'native V2 verifier builder organization ID',
    ),
    reviewerKeyIdHex: sha256Hex(
      report.attestation?.reviewerKeyIdHex,
      'native V2 verifier reviewer key ID',
    ),
    reviewerOrganizationId: identifier(
      report.attestation?.reviewerOrganizationId,
      'native V2 verifier reviewer organization ID',
    ),
    buildDependencyManifestSha256: sha256Hex(
      report.dependencies?.manifestSha256,
      'native V2 verifier build dependency digest',
    ),
    artifactSha256: sha256Hex(
      report.artifact?.sha256,
      'native V2 verifier artifact digest',
    ),
    artifactSizeBytes: positiveSafeInteger(
      report.artifact?.sizeBytes,
      'native V2 verifier artifact size',
    ),
    executionPolicySha256: sha256Hex(
      report.executionPolicySha256,
      'native V2 verifier execution policy digest',
    ),
    reviewedTrustRootsLoaded:
      booleanValue(
        report.boundary?.reviewedTrustRootsLoaded,
        'native V2 verifier reviewed trust-root boundary',
      ),
  };
}

function normalizeManifest(
  value: NativeRuntimeDependencyManifest<
    'bridge-peg-in-runtime-identity-v2-verifier'
  >,
): NativeRuntimeDependencyManifest<
  'bridge-peg-in-runtime-identity-v2-verifier'
> {
  const record = exactRecord(value, [
    'artifactSha256',
    'artifactSizeBytes',
    'boundaries',
    'delayLoadedDlls',
    'dynamicLibraryLoadingReviewedAbsent',
    'nonSystemDependencies',
    'platform',
    'role',
    'schema',
    'sidecars',
    'systemDlls',
  ], 'native V2 verifier runtime dependency manifest');
  requireLiteral(
    record.schema,
    NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    'native V2 verifier runtime dependency manifest schema',
  );
  requireLiteral(
    record.role,
    'bridge-peg-in-runtime-identity-v2-verifier',
    'native V2 verifier runtime dependency role',
  );
  if (!Array.isArray(record.systemDlls)) {
    throw new Error('native V2 verifier runtime system DLLs must be an array');
  }
  if (record.systemDlls.length > MAX_RUNTIME_SYSTEM_DLLS) {
    throw new Error(
      `native V2 verifier runtime system DLLs exceed ${MAX_RUNTIME_SYSTEM_DLLS} entries`,
    );
  }
  const boundaries = exactRecord(record.boundaries, [
    'dynamicLoadsCryptographicallyExcluded',
    'loadedModuleClosureEnforced',
  ], 'native V2 verifier runtime dependency boundaries');
  const delayLoadedDlls = stringArray(
    record.delayLoadedDlls,
    'native V2 verifier delay-loaded DLLs',
  );
  const nonSystemDependencies = stringArray(
    record.nonSystemDependencies,
    'native V2 verifier non-system dependencies',
  );
  const sidecars = stringArray(
    record.sidecars,
    'native V2 verifier sidecars',
  );
  if (!isSortedUniqueLowercaseDllList(
    record.systemDlls as unknown[],
  )) {
    throw new Error(
      'native V2 verifier system DLLs must be sorted unique lowercase DLL names',
    );
  }
  if (
    delayLoadedDlls.length !== 0
    || nonSystemDependencies.length !== 0
    || sidecars.length !== 0
  ) {
    throw new Error(
      'native V2 verifier runtime dependency manifest contains unsupported dependencies or sidecars',
    );
  }
  return deepFreeze({
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role: 'bridge-peg-in-runtime-identity-v2-verifier',
    artifactSha256: sha256Hex(
      record.artifactSha256,
      'native V2 verifier runtime artifact digest',
    ),
    artifactSizeBytes: positiveSafeInteger(
      record.artifactSizeBytes,
      'native V2 verifier runtime artifact size',
    ),
    platform: literal(
      record.platform,
      'win32-x64',
      'native V2 verifier runtime platform',
    ),
    systemDlls: record.systemDlls.map((entry, index) =>
      nonEmptyString(entry, `native V2 verifier system DLL ${index}`)),
    delayLoadedDlls,
    nonSystemDependencies,
    sidecars,
    dynamicLibraryLoadingReviewedAbsent: trueValue(
      record.dynamicLibraryLoadingReviewedAbsent,
      'native V2 verifier dynamic-library review boundary',
    ),
    boundaries: {
      loadedModuleClosureEnforced: falseValue(
        boundaries.loadedModuleClosureEnforced,
        'native V2 verifier loaded-module closure boundary',
      ),
      dynamicLoadsCryptographicallyExcluded: falseValue(
        boundaries.dynamicLoadsCryptographicallyExcluded,
        'native V2 verifier dynamic-load exclusion boundary',
      ),
    },
  });
}

function assertValidity(
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
  evaluatedAt: string,
): void {
  const notBefore = Date.parse(policy.validity.notBefore);
  const expiresAt = Date.parse(policy.validity.expiresAt);
  const evaluated = Date.parse(evaluatedAt);
  if (notBefore >= expiresAt) {
    throw new Error('runtime identity V2 execution policy validity is empty');
  }
  if (evaluated < notBefore) {
    throw new Error('runtime identity V2 execution policy is not yet valid');
  }
  if (evaluated >= expiresAt) {
    throw new Error('runtime identity V2 execution policy is expired');
  }
}

function assertRuntimeBuildBinding(
  runtimeBuild: ReturnType<typeof normalizeRuntimeBuildReport>,
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
): void {
  if (
    policy.runtimeBuild.profileId !== runtimeBuild.profileId
    || policy.runtimeBuild.attestationId !== runtimeBuild.attestationId
    || policy.runtimeBuild.packetSha256Hex !== runtimeBuild.packetSha256Hex
    || policy.runtimeBuild.attestorPolicyDigestHex
      !== runtimeBuild.policyDigestHex
    || policy.runtimeBuild.builderKeyIdHex
      !== runtimeBuild.builderKeyIdHex
    || policy.runtimeBuild.builderOrganizationId
      !== runtimeBuild.builderOrganizationId
    || policy.runtimeBuild.reviewerKeyIdHex
      !== runtimeBuild.reviewerKeyIdHex
    || policy.runtimeBuild.reviewerOrganizationId
      !== runtimeBuild.reviewerOrganizationId
    || policy.runtimeBuild.artifactSha256 !== runtimeBuild.artifactSha256
    || policy.runtimeBuild.artifactSizeBytes
      !== runtimeBuild.artifactSizeBytes
  ) {
    throw new Error(
      'runtime identity V2 execution policy does not match the exact runtime build attestation',
    );
  }
}

function assertNativeVerifierBinding(
  nativeVerifier: ReturnType<typeof normalizeNativeVerifierReport>,
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
): void {
  if (
    policy.nativeVerifier.profileId !== nativeVerifier.profileId
    || policy.nativeVerifier.attestationId !== nativeVerifier.attestationId
    || policy.nativeVerifier.attestationCoreDigestHex
      !== nativeVerifier.attestationCoreDigestHex
    || policy.nativeVerifier.attestorPolicyDigestHex
      !== nativeVerifier.attestorPolicyDigestHex
    || policy.nativeVerifier.builderKeyIdHex
      !== nativeVerifier.builderKeyIdHex
    || policy.nativeVerifier.builderOrganizationId
      !== nativeVerifier.builderOrganizationId
    || policy.nativeVerifier.reviewerKeyIdHex
      !== nativeVerifier.reviewerKeyIdHex
    || policy.nativeVerifier.reviewerOrganizationId
      !== nativeVerifier.reviewerOrganizationId
    || policy.nativeVerifier.buildDependencyManifestSha256
      !== nativeVerifier.buildDependencyManifestSha256
    || policy.nativeVerifier.artifactSha256
      !== nativeVerifier.artifactSha256
    || policy.nativeVerifier.artifactSizeBytes
      !== nativeVerifier.artifactSizeBytes
  ) {
    throw new Error(
      'runtime identity V2 execution policy does not match the exact native verifier attestation',
    );
  }
}

function assertAttestorFamiliesDisjoint(
  runtimeBuild: ReturnType<typeof normalizeRuntimeBuildReport>,
  nativeVerifier: ReturnType<typeof normalizeNativeVerifierReport>,
): void {
  const runtimeKeys = new Set([
    runtimeBuild.builderKeyIdHex,
    runtimeBuild.reviewerKeyIdHex,
  ]);
  const runtimeOrganizations = new Set([
    runtimeBuild.builderOrganizationId,
    runtimeBuild.reviewerOrganizationId,
  ]);
  if (
    runtimeKeys.has(nativeVerifier.builderKeyIdHex)
    || runtimeKeys.has(nativeVerifier.reviewerKeyIdHex)
    || runtimeOrganizations.has(nativeVerifier.builderOrganizationId)
    || runtimeOrganizations.has(nativeVerifier.reviewerOrganizationId)
  ) {
    throw new Error(
      'runtime build and native verifier attestor families must use disjoint keys and organizations',
    );
  }
}

function isSortedUniqueLowercaseDllList(values: unknown[]): boolean {
  return values.every((value, index) =>
    typeof value === 'string'
    && /^[a-z0-9._-]+\.dll$/.test(value)
    && (index === 0 || (values[index - 1] as string) < value));
}

function assertRuntimeDependencyManifest(
  nativeVerifier: ReturnType<typeof normalizeNativeVerifierReport>,
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
  manifest: NativeRuntimeDependencyManifest<
    'bridge-peg-in-runtime-identity-v2-verifier'
  >,
): void {
  if (
    manifest.artifactSha256 !== nativeVerifier.artifactSha256
    || manifest.artifactSizeBytes !== nativeVerifier.artifactSizeBytes
    || deriveNativeRuntimeDependencyManifestSha256(manifest)
      !== policy.nativeVerifier.runtimeDependencyManifestSha256
  ) {
    throw new Error(
      'native V2 verifier runtime dependency manifest does not match the attested executable',
    );
  }
}

function assertExactExecutionSemantics(
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
): void {
  const expectedArgv = [
    { kind: 'literal', value: '--trusted-anchor-digest' },
    {
      kind: 'parameter',
      name: 'trustedAnchorDigestHex',
      format: 'lowercase-0x-blake2b256',
    },
  ];
  if (
    canonicalE2sJson(policy.environment)
      !== canonicalE2sJson({
        variables: ['SystemRoot', 'TEMP', 'TMP'],
        temp: 'staged-directory',
        workingDirectory: 'staged-directory',
        pathInherited: false,
        libraryPathInherited: false,
      })
    || canonicalE2sJson(policy.invocation.argvTemplate)
      !== canonicalE2sJson(expectedArgv)
    || canonicalE2sJson(policy.invocation.limits)
      !== canonicalE2sJson(FIXED_LIMITS)
  ) {
    throw new Error(
      'runtime identity V2 execution policy semantics are not exact',
    );
  }
}

function normalizeArgvEntry(
  value: unknown,
  index: number,
): NativePegInRuntimeIdentityV2ExecutionPolicy['invocation']['argvTemplate'][number] {
  const record = asRecord(
    value,
    `runtime identity V2 argv template ${index}`,
  );
  if (record.kind === 'literal') {
    exactKeys(
      record,
      ['kind', 'value'],
      `runtime identity V2 argv literal ${index}`,
    );
    return {
      kind: 'literal',
      value: nonEmptyString(
        record.value,
        `runtime identity V2 argv literal ${index}`,
      ),
    } as NativePegInRuntimeIdentityV2ExecutionPolicy[
      'invocation'
    ]['argvTemplate'][number];
  }
  if (record.kind === 'parameter') {
    exactKeys(
      record,
      ['format', 'kind', 'name'],
      `runtime identity V2 argv parameter ${index}`,
    );
    return {
      kind: 'parameter',
      name: nonEmptyString(
        record.name,
        `runtime identity V2 argv parameter name ${index}`,
      ),
      format: nonEmptyString(
        record.format,
        `runtime identity V2 argv parameter format ${index}`,
      ),
    } as NativePegInRuntimeIdentityV2ExecutionPolicy[
      'invocation'
    ]['argvTemplate'][number];
  }
  throw new Error(`runtime identity V2 argv template ${index} is unsupported`);
}

function exactEnvironmentVariables(
  value: unknown,
): Array<'SystemRoot' | 'TEMP' | 'TMP'> {
  if (!Array.isArray(value)) {
    throw new Error('runtime identity V2 environment variables must be an array');
  }
  const expected = ['SystemRoot', 'TEMP', 'TMP'];
  if (
    value.length !== expected.length
    || value.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(
      'runtime identity V2 environment variables are not exact',
    );
  }
  return ['SystemRoot', 'TEMP', 'TMP'];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) =>
    nonEmptyString(entry, `${label}[${index}]`));
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = asRecord(value, label);
  exactKeys(record, expectedKeys, label);
  return record;
}

function exactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must have exactly the required fields`);
  }
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

function identifier(value: unknown, label: string): string {
  const normalized = nonEmptyString(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new Error(`${label} is not a canonical identifier`);
  }
  return normalized;
}

function nonEmptyString(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.trim() === ''
    || value.includes('\0')
  ) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function isoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function sha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function prefixedSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed SHA-256 digest`);
  }
  return value;
}

function literal<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be exactly ${expected}`);
  }
  return expected;
}

function requireLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is T {
  literal(value, expected, label);
}

function trueValue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must remain true`);
  return true;
}

function falseValue(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
