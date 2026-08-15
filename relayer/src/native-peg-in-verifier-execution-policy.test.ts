import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertNativePegInVerifierExecutionPolicyValidationProvenance,
  deriveNativePegInVerifierExecutionPolicySha256,
  validateNativePegInVerifierExecutionPolicyAgainstProfile,
} from './native-peg-in-verifier-execution-policy.js';
import {
  createNativePegInVerifierAttestationExecutionFixture,
  type NativePegInVerifierAttestationExecutionFixture,
} from './native-peg-in-verifier-attestation-fixture.test-helper.js';

let fixture: NativePegInVerifierAttestationExecutionFixture;

beforeEach(() => {
  fixture = createNativePegInVerifierAttestationExecutionFixture();
});

afterEach(() => {
  fixture.dispose();
});

describe('native peg-in verifier execution policy', () => {
  it('binds one exact proof-only CLI invocation to the independently attested binary', () => {
    const report = validate();

    expect(report.executionPolicySha256).toBe(
      deriveNativePegInVerifierExecutionPolicySha256(fixture.policy),
    );
    expect(report.runtimeDependencyManifestSha256).toBe(
      fixture.policy.verifier.runtimeDependencyManifestSha256,
    );
    expect(fixture.policy.verifier.invocation.argvTemplate).toEqual([
      { kind: 'literal', value: '--verify-peg-in-state' },
      { kind: 'literal', value: '--trusted-anchor-digest' },
      {
        kind: 'parameter',
        name: 'trustedAnchorDigestHex',
        format: 'lowercase-0x-blake2b256',
      },
    ]);
    expect(report.boundary).toEqual({
      relativeToSuppliedProfile: true,
      reviewedTrustRootsLoaded: false,
      exactPolicyDigestMatched: true,
      exactArtifactBindingMatched: true,
      runtimeDependencyManifestMatched: true,
      executionCapabilityIssued: false,
      pegInConformanceAttested: false,
      runtimeCodeIdentityVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(() => assertNativePegInVerifierExecutionPolicyValidationProvenance({
      profile: fixture.profile,
      report,
    })).not.toThrow();
    expect(() => assertNativePegInVerifierExecutionPolicyValidationProvenance({
      profile: fixture.profile,
      report: structuredClone(report),
    })).toThrow(/provenance/i);
  });

  it('binds the V4 reservation-state command as a separate exact policy capability', () => {
    fixture.dispose();
    fixture = createNativePegInVerifierAttestationExecutionFixture(
      'verify-pooled-reserve-mint-reservation-state-v4',
    );

    const report = validate();

    expect(report.executionPolicySha256).toBe(
      deriveNativePegInVerifierExecutionPolicySha256(fixture.policy),
    );
    expect(fixture.policy.verifier.invocation).toEqual({
      operation: 'verify-pooled-reserve-mint-reservation-state-v4',
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
    });

    const wrongCommand = structuredClone(fixture.policy) as unknown as
      Record<string, any>;
    wrongCommand.verifier.invocation.argvTemplate[0].value =
      '--verify-peg-in-state';
    expect(() => validate(wrongCommand)).toThrow(/invocation is not exact/i);

    for (const schemaField of ['requestSchema', 'resultSchema'] as const) {
      const wrongSchema = structuredClone(fixture.policy) as unknown as
        Record<string, any>;
      wrongSchema.verifier.invocation[schemaField] =
        `e2s.other-${schemaField}.v1`;
      expect(() => validate(wrongSchema)).toThrow(/invocation is not exact/i);
    }
  });

  it('rejects policy drift in operation, argv ordering, schemas, limits, and authority claims', () => {
    const mutations: Array<(policy: Record<string, any>) => void> = [
      policy => { policy.verifier.invocation.operation = 'verify-checkpoint'; },
      policy => { policy.verifier.invocation.argvTemplate.reverse(); },
      policy => {
        policy.verifier.invocation.argvTemplate[2].format = 'lowercase-0x-sha256';
      },
      policy => { policy.verifier.invocation.requestSchema = 'e2s.other-request.v1'; },
      policy => { policy.verifier.invocation.resultSchema = 'e2s.other-result.v1'; },
      policy => { policy.verifier.limits.requestLimitBytes += 1; },
      policy => { policy.boundaries.launcherAtomicBootstrapProven = true; },
      policy => { policy.boundaries.loadedModuleClosureEnforced = true; },
      policy => { policy.boundaries.pegInConformanceAttested = true; },
      policy => { policy.boundaries.runtimeCodeIdentityVerified = true; },
      policy => { policy.boundaries.mintAuthorityGranted = true; },
      policy => { policy.boundaries.settlementAuthorityGranted = true; },
      policy => { policy.boundaries.gate5Closed = true; },
      policy => { policy.boundaries.productionReady = true; },
    ];

    for (const mutate of mutations) {
      const policy = structuredClone(fixture.policy) as unknown as Record<string, any>;
      mutate(policy);
      expect(() => validate(policy)).toThrow();
    }
  });

  it('rejects artifact, dependency-manifest, validity, profile, and unknown-field drift', () => {
    const artifact = structuredClone(fixture.policy);
    artifact.verifier.artifactSha256 = 'b'.repeat(64);
    expect(() => validate(artifact)).toThrow(/attested bytes/i);

    const manifest = structuredClone(fixture.manifests.verifier);
    manifest.systemDlls = ['user32.dll'];
    expect(() => validate(fixture.policy, manifest)).toThrow(/digest/i);

    const expired = structuredClone(fixture.policy);
    expired.validity.expiresAt = '2026-07-12T11:59:59.000Z';
    expect(() => validate(expired)).toThrow(/expired/i);

    expect(() => validateNativePegInVerifierExecutionPolicyAgainstProfile({
      profile: structuredClone(fixture.profile),
      policy: fixture.policy,
      runtimeDependencyManifest: fixture.manifests.verifier,
      evaluatedAt: '2026-07-12T12:00:00.000Z',
    })).toThrow(/provenance/i);

    const extra = {
      ...structuredClone(fixture.policy),
      allowMint: false,
    };
    expect(() => validate(extra)).toThrow(/exactly/i);
  });
});

function validate(
  policy: unknown = fixture.policy,
  runtimeDependencyManifest = fixture.manifests.verifier,
) {
  return validateNativePegInVerifierExecutionPolicyAgainstProfile({
    profile: fixture.profile,
    policy: policy as typeof fixture.policy,
    runtimeDependencyManifest,
    evaluatedAt: '2026-07-12T12:00:00.000Z',
  });
}
