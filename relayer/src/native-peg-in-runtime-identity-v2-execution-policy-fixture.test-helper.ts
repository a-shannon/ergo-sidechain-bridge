import {
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import {
  NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA,
  deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256,
  validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations,
  type NativePegInRuntimeIdentityV2ExecutionPolicy,
  type NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport,
} from './native-peg-in-runtime-identity-v2-execution-policy.js';
import {
  createNativePegInRuntimeIdentityV2VerifierAttestationFixture,
  type NativePegInRuntimeIdentityV2VerifierAttestationFixture,
} from './native-peg-in-runtime-identity-v2-verifier-attestation-fixture.test-helper.js';
import {
  validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy,
  type NativePegInRuntimeIdentityV2AttestationPacket,
  type NativePegInRuntimeIdentityV2AttestationValidationReport,
} from './native-peg-in-runtime-identity-v2-verifier-attestation.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  deriveNativeRuntimeDependencyManifestSha256,
  type NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';
import {
  createPegInRuntimeBuildAttestationFixture,
  type PegInRuntimeBuildAttestationFixture,
} from './peg-in-runtime-build-attestation-fixture.test-helper.js';
import type {
  PegInRuntimeBuildAttestationPacket,
  PegInRuntimeBuildAttestationValidationReport,
} from './peg-in-runtime-build-attestation.js';

function windowsTestPath(drive: string, ...segments: string[]): string {
  const separator = String.fromCharCode(92);
  return `${drive}:${separator}${segments.join(separator)}`;
}

export interface NativePegInRuntimeIdentityV2ExecutionPolicyFixture {
  runtimeBuild: PegInRuntimeBuildAttestationValidationReport;
  runtimeBuildPacket: PegInRuntimeBuildAttestationPacket;
  runtimeCodePath: string;
  nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport;
  nativePacket: NativePegInRuntimeIdentityV2AttestationPacket;
  nativeVerifierExecutablePath: string;
  launcherPath: string;
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy;
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<
    'bridge-peg-in-runtime-identity-v2-verifier'
  >;
  report: NativePegInRuntimeIdentityV2ExecutionPolicyValidationReport;
  dispose(): void;
}

export function createNativePegInRuntimeIdentityV2ExecutionPolicyFixture():
NativePegInRuntimeIdentityV2ExecutionPolicyFixture {
  const runtimeFixture = createPegInRuntimeBuildAttestationFixture();
  let nativeFixture:
    NativePegInRuntimeIdentityV2VerifierAttestationFixture | undefined;
  try {
    nativeFixture =
      createNativePegInRuntimeIdentityV2VerifierAttestationFixture();
    const runtimeDependencyManifest = runtimeManifest(
      nativeFixture.packet.statement.artifact.sha256,
      nativeFixture.packet.statement.artifact.sizeBytes,
    );
    const policy = executionPolicy(
      runtimeFixture.report,
      nativeFixture.report,
      runtimeDependencyManifest,
    );
    const policySha256 =
      deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(policy);
    const nativeStatement = structuredClone(nativeFixture.packet.statement);
    nativeStatement.executionPolicySha256 = policySha256;
    const nativePacket = nativeFixture.signStatement(nativeStatement);
    const nativeVerifier =
      validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy({
        bridgeRoot: nativeFixture.bridgeRoot,
        attestorLock: nativeFixture.attestorLock,
        packet: nativePacket,
        verifierExecutablePath: nativeFixture.verifierExecutablePath,
        evaluatedAt: '2026-07-17T12:00:00.000Z',
      });
    const report =
      validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations({
        runtimeBuild: runtimeFixture.report,
        nativeVerifier,
        policy,
        runtimeDependencyManifest,
        evaluatedAt: '2026-07-17T13:00:00.000Z',
      });
    return {
      runtimeBuild: runtimeFixture.report,
      runtimeBuildPacket: runtimeFixture.packet,
      runtimeCodePath: runtimeFixture.runtimeCodePath,
      nativeVerifier,
      nativePacket,
      nativeVerifierExecutablePath: nativeFixture.verifierExecutablePath,
      launcherPath: windowsTestPath(
        'C',
        'Program Files',
        'E2SBridge',
        'NativeExecution',
        'v2',
        'Images',
        hash('9'),
        'bridge-contained-launcher.exe',
      ),
      policy,
      runtimeDependencyManifest,
      report,
      dispose: () => {
        nativeFixture?.dispose();
        runtimeFixture.dispose();
      },
    };
  } catch (error) {
    nativeFixture?.dispose();
    runtimeFixture.dispose();
    throw error;
  }
}

function executionPolicy(
  runtimeBuild: PegInRuntimeBuildAttestationValidationReport,
  nativeVerifier: NativePegInRuntimeIdentityV2AttestationValidationReport,
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<
    'bridge-peg-in-runtime-identity-v2-verifier'
  >,
): NativePegInRuntimeIdentityV2ExecutionPolicy {
  return {
    schema: NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_POLICY_SCHEMA,
    policyId: 'native-peg-in-runtime-identity-v2-execution-2026-07-17-01',
    canonicalization: 'e2s-canonical-json-v1',
    validity: {
      notBefore: '2026-07-17T12:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      policyEpoch: 1,
    },
    runtimeBuild: {
      profileId: runtimeBuild.profileId,
      attestationId: runtimeBuild.attestationId,
      packetSha256Hex: runtimeBuild.attestation.packetSha256Hex,
      attestorPolicyDigestHex: runtimeBuild.attestation.policyDigestHex,
      builderKeyIdHex: runtimeBuild.attestation.builderKeyIdHex,
      builderOrganizationId:
        runtimeBuild.attestation.builderOrganizationId,
      reviewerKeyIdHex: runtimeBuild.attestation.reviewerKeyIdHex,
      reviewerOrganizationId:
        runtimeBuild.attestation.reviewerOrganizationId,
      artifactSha256: runtimeBuild.artifact.sha256,
      artifactSizeBytes: runtimeBuild.artifact.sizeBytes,
    },
    nativeVerifier: {
      profileId: nativeVerifier.profileId,
      attestationId: nativeVerifier.attestationId,
      attestationCoreDigestHex:
        nativeVerifier.attestation.statementCoreDigestHex,
      attestorPolicyDigestHex:
        nativeVerifier.attestation.policyDigestHex,
      builderKeyIdHex: nativeVerifier.attestation.builderKeyIdHex,
      builderOrganizationId:
        nativeVerifier.attestation.builderOrganizationId,
      reviewerKeyIdHex: nativeVerifier.attestation.reviewerKeyIdHex,
      reviewerOrganizationId:
        nativeVerifier.attestation.reviewerOrganizationId,
      buildDependencyManifestSha256:
        nativeVerifier.dependencies.manifestSha256,
      launcher: {
        sha256: hash('9'),
        sizeBytes: 34_567,
        sourceManifestSha256: hash('a'),
      },
      artifactSha256: nativeVerifier.artifact.sha256,
      artifactSizeBytes: nativeVerifier.artifact.sizeBytes,
      runtimeDependencyManifestSha256:
        deriveNativeRuntimeDependencyManifestSha256(
          runtimeDependencyManifest,
        ),
    },
    environment: {
      variables: ['SystemRoot', 'TEMP', 'TMP'],
      temp: 'staged-directory',
      workingDirectory: 'staged-directory',
      pathInherited: false,
      libraryPathInherited: false,
    },
    invocation: {
      operation: 'verify-peg-in-runtime-identity-v2',
      argvTemplate: [
        { kind: 'literal', value: '--trusted-anchor-digest' },
        {
          kind: 'parameter',
          name: 'trustedAnchorDigestHex',
          format: 'lowercase-0x-blake2b256',
        },
      ],
      requestSchema:
        NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
      resultSchema:
        NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
      limits: {
        timeoutMs: 30_000,
        requestLimitBytes: 32 * 1024 * 1024,
        stdoutLimitBytes: 16 * 1024 * 1024,
        stderrLimitBytes: 64 * 1024,
      },
    },
    boundaries: {
      runtimeAndVerifierAttestationsRemainSeparate: true,
      attestorFamiliesDisjoint: true,
      targetStateCodeIsNotHistoricalProducerCode: true,
      launcherAtomicBootstrapProven: false,
      loadedModuleClosureEnforced: false,
      runtimeUpgradeHistoryVerified: false,
      cutoverPolicyVerified: false,
      targetRuntimeBuildIdentityVerified: false,
      runtimeCodeIdentityVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
}

function runtimeManifest(
  artifactSha256: string,
  artifactSizeBytes: number,
): NativeRuntimeDependencyManifest<
  'bridge-peg-in-runtime-identity-v2-verifier'
> {
  return {
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role: 'bridge-peg-in-runtime-identity-v2-verifier',
    artifactSha256,
    artifactSizeBytes,
    platform: 'win32-x64',
    systemDlls: ['kernel32.dll'],
    delayLoadedDlls: [],
    nonSystemDependencies: [],
    sidecars: [],
    dynamicLibraryLoadingReviewedAbsent: true,
    boundaries: {
      loadedModuleClosureEnforced: false,
      dynamicLoadsCryptographicallyExcluded: false,
    },
  };
}

function hash(nibble: string): string {
  return nibble.repeat(64);
}
