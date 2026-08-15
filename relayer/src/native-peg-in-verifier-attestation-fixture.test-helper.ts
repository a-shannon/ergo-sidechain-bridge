import {
  deriveNativeVerifierAttestationCoreDigestHex,
  type NativeVerifierAttestationStatement,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA,
  deriveNativePegInVerifierExecutionPolicySha256,
  type NativePegInVerifierExecutionPolicy,
  type NativePegInVerifierExecutionPolicyOperation,
} from './native-peg-in-verifier-execution-policy.js';
import {
  deriveNativeRuntimeDependencyManifestSha256,
  type NativeRuntimeDependencyManifests,
} from './native-verifier-execution-policy.js';
import {
  createNativeVerifierAttestationExecutionFixtureWithPolicy,
  type NativeVerifierAttestationExecutionFixtureWithPolicy,
} from './native-verifier-attestation-fixture.test-helper.js';

export type NativePegInVerifierAttestationExecutionFixture =
  NativeVerifierAttestationExecutionFixtureWithPolicy<
    NativePegInVerifierExecutionPolicy
  >;

export function createNativePegInVerifierAttestationExecutionFixture(
  operation: NativePegInVerifierExecutionPolicyOperation =
    'verify-peg-in-state',
): NativePegInVerifierAttestationExecutionFixture {
  return createNativeVerifierAttestationExecutionFixtureWithPolicy<
    NativePegInVerifierExecutionPolicy
  >({
    createPolicy: (statement, manifests) =>
      pegInExecutionPolicy(statement, manifests, operation),
    derivePolicySha256: deriveNativePegInVerifierExecutionPolicySha256,
  });
}

function pegInExecutionPolicy(
  statement: NativeVerifierAttestationStatement,
  manifests: NativeRuntimeDependencyManifests,
  operation: NativePegInVerifierExecutionPolicyOperation,
): NativePegInVerifierExecutionPolicy {
  return {
    schema: NATIVE_PEG_IN_VERIFIER_EXECUTION_POLICY_SCHEMA,
    profileId: statement.profileId,
    attestationId: statement.attestationId,
    policyId: operation === 'verify-peg-in-state'
      ? 'native-peg-in-verifier-execution-2026-07-12-01'
      : 'native-pooled-reserve-reservation-state-v4-execution-2026-07-28-01',
    canonicalization: 'e2s-canonical-json-v1',
    validity: {
      notBefore: '2026-07-12T11:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      policyEpoch: 1,
    },
    bindings: {
      attestationCoreDigestHex: deriveNativeVerifierAttestationCoreDigestHex(statement),
      buildDependencyManifestSha256: statement.dependencies.manifestSha256,
      launcher: {
        sha256: '9'.repeat(64),
        sizeBytes: 34_567,
        sourceManifestSha256: 'a'.repeat(64),
      },
    },
    environment: {
      variables: ['SystemRoot', 'TEMP', 'TMP'],
      temp: 'staged-directory',
      workingDirectory: 'staged-directory',
      pathInherited: false,
      libraryPathInherited: false,
    },
    verifier: {
      role: 'bridge-checkpoint-verifier',
      artifactSha256: statement.artifacts.verifier.sha256,
      artifactSizeBytes: statement.artifacts.verifier.sizeBytes,
      runtimeDependencyManifestSha256:
        deriveNativeRuntimeDependencyManifestSha256(manifests.verifier),
      invocation: operation === 'verify-peg-in-state'
        ? {
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
          requestSchema: 'e2s.native-finalized-peg-in-state-request.v1',
          resultSchema: 'e2s.native-finalized-peg-in-state-verification.v1',
        }
        : {
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
          requestSchema:
            'e2s.native-finalized-pooled-reserve-mint-reservation-state-request.v4',
          resultSchema:
            'e2s.native-finalized-pooled-reserve-mint-reservation-state-verification.v4',
        },
      limits: {
        timeoutMs: 30_000,
        requestLimitBytes: 32 * 1024 * 1024,
        stdoutLimitBytes: 16 * 1024 * 1024,
        stderrLimitBytes: 64 * 1024,
      },
    },
    boundaries: {
      launcherAtomicBootstrapProven: false,
      loadedModuleClosureEnforced: false,
      pegInConformanceAttested: false,
      runtimeCodeIdentityVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
}
