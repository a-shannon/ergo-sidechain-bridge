import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance,
  deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256,
  validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations,
  validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations,
  type NativePegInRuntimeIdentityV2ExecutionPolicy,
} from './native-peg-in-runtime-identity-v2-execution-policy.js';
import {
  createNativePegInRuntimeIdentityV2ExecutionPolicyFixture,
  type NativePegInRuntimeIdentityV2ExecutionPolicyFixture,
} from './native-peg-in-runtime-identity-v2-execution-policy-fixture.test-helper.js';
import type {
  NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';

let fixture: NativePegInRuntimeIdentityV2ExecutionPolicyFixture;

beforeEach(() => {
  fixture = createNativePegInRuntimeIdentityV2ExecutionPolicyFixture();
});

afterEach(() => {
  fixture.dispose();
});

describe('native peg-in runtime identity V2 execution policy', () => {
  it('joins the exact runtime build, native verifier, manifest, and signed policy', () => {
    const policySha256 =
      deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(fixture.policy);
    expect(fixture.nativePacket.statement.executionPolicySha256)
      .toBe(policySha256);
    expect(fixture.nativeVerifier.executionPolicySha256).toBe(policySha256);
    expect(fixture.report.executionPolicySha256).toBe(policySha256);
    expect(fixture.report.runtimeBuild).toEqual({
      profileId: fixture.runtimeBuild.profileId,
      attestationId: fixture.runtimeBuild.attestationId,
      packetSha256Hex:
        fixture.runtimeBuild.attestation.packetSha256Hex,
      artifactSha256: fixture.runtimeBuild.artifact.sha256,
      artifactSizeBytes: fixture.runtimeBuild.artifact.sizeBytes,
    });
    expect(fixture.report.nativeVerifier).toEqual({
      profileId: fixture.nativeVerifier.profileId,
      attestationId: fixture.nativeVerifier.attestationId,
      artifactSha256: fixture.nativeVerifier.artifact.sha256,
      artifactSizeBytes: fixture.nativeVerifier.artifact.sizeBytes,
      runtimeDependencyManifestSha256:
        fixture.policy.nativeVerifier.runtimeDependencyManifestSha256,
    });
    expect(fixture.report.boundary).toEqual({
      relativeToSuppliedAttestations: true,
      runtimeReviewedTrustRootsLoaded: false,
      nativeVerifierReviewedTrustRootsLoaded: false,
      exactRuntimeBuildBindingMatched: true,
      exactNativeVerifierBindingMatched: true,
      attestorFamiliesDisjoint: true,
      runtimeDependencyManifestMatched: true,
      executionCapabilityIssued: false,
      targetRuntimeBuildIdentityVerified: false,
      runtimeCodeIdentityVerified: false,
      runtimeUpgradeHistoryVerified: false,
      cutoverPolicyVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    });
  });

  it('requires the exact attestation objects that produced the validation report', () => {
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
        runtimeBuild: fixture.runtimeBuild,
        nativeVerifier: fixture.nativeVerifier,
        report: fixture.report,
      })).not.toThrow();

    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
        runtimeBuild: fixture.runtimeBuild,
        nativeVerifier: fixture.nativeVerifier,
        report: structuredClone(fixture.report),
      })).toThrow(/provenance/i);
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
        runtimeBuild: structuredClone(fixture.runtimeBuild),
        nativeVerifier: fixture.nativeVerifier,
        report: fixture.report,
      })).toThrow(/provenance/i);
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
        runtimeBuild: fixture.runtimeBuild,
        nativeVerifier: structuredClone(fixture.nativeVerifier),
        report: fixture.report,
      })).toThrow(/provenance/i);
  });

  it('rejects runtime packet, artifact, identity, and attestor-policy drift', () => {
    const mutations: Array<(
      policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
    ) => void> = [
      policy => { policy.runtimeBuild.profileId = 'other-runtime-profile'; },
      policy => { policy.runtimeBuild.attestationId = 'other-attestation'; },
      policy => { policy.runtimeBuild.packetSha256Hex = `0x${'7'.repeat(64)}`; },
      policy => { policy.runtimeBuild.attestorPolicyDigestHex = '7'.repeat(64); },
      policy => { policy.runtimeBuild.builderKeyIdHex = '7'.repeat(64); },
      policy => {
        policy.runtimeBuild.builderOrganizationId = 'other-runtime-builder';
      },
      policy => { policy.runtimeBuild.reviewerKeyIdHex = '7'.repeat(64); },
      policy => {
        policy.runtimeBuild.reviewerOrganizationId = 'other-runtime-reviewer';
      },
      policy => { policy.runtimeBuild.artifactSha256 = '7'.repeat(64); },
      policy => { policy.runtimeBuild.artifactSizeBytes += 1; },
    ];
    for (const mutate of mutations) {
      const policy = structuredClone(fixture.policy);
      mutate(policy);
      expect(() => validate(policy)).toThrow(/runtime build attestation/i);
    }
  });

  it('rejects native verifier core, artifact, identity, and dependency drift', () => {
    const mutations: Array<(
      policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
    ) => void> = [
      policy => { policy.nativeVerifier.profileId = 'other-native-profile'; },
      policy => { policy.nativeVerifier.attestationId = 'other-attestation'; },
      policy => {
        policy.nativeVerifier.attestationCoreDigestHex = '7'.repeat(64);
      },
      policy => {
        policy.nativeVerifier.attestorPolicyDigestHex = '7'.repeat(64);
      },
      policy => { policy.nativeVerifier.builderKeyIdHex = '7'.repeat(64); },
      policy => {
        policy.nativeVerifier.builderOrganizationId = 'other-native-builder';
      },
      policy => { policy.nativeVerifier.reviewerKeyIdHex = '7'.repeat(64); },
      policy => {
        policy.nativeVerifier.reviewerOrganizationId =
          'other-native-reviewer';
      },
      policy => {
        policy.nativeVerifier.buildDependencyManifestSha256 = '7'.repeat(64);
      },
      policy => { policy.nativeVerifier.artifactSha256 = '7'.repeat(64); },
      policy => { policy.nativeVerifier.artifactSizeBytes += 1; },
    ];
    for (const mutate of mutations) {
      const policy = structuredClone(fixture.policy);
      mutate(policy);
      expect(() => validate(policy)).toThrow(/native verifier attestation/i);
    }
  });

  it('rejects runtime and native attestor key or organization reuse', () => {
    for (const kind of ['key', 'organization'] as const) {
      const runtimeBuild = structuredClone(fixture.runtimeBuild);
      const nativeVerifier = structuredClone(fixture.nativeVerifier);
      const policy = structuredClone(fixture.policy);
      if (kind === 'key') {
        nativeVerifier.attestation.builderKeyIdHex =
          runtimeBuild.attestation.reviewerKeyIdHex;
        policy.nativeVerifier.builderKeyIdHex =
          runtimeBuild.attestation.reviewerKeyIdHex;
      } else {
        nativeVerifier.attestation.reviewerOrganizationId =
          runtimeBuild.attestation.builderOrganizationId;
        policy.nativeVerifier.reviewerOrganizationId =
          runtimeBuild.attestation.builderOrganizationId;
      }
      expect(() =>
        validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations({
          runtimeBuild,
          nativeVerifier,
          policy,
          runtimeDependencyManifest: fixture.runtimeDependencyManifest,
          evaluatedAt: '2026-07-17T13:00:00.000Z',
        }),
      ).toThrow(/disjoint keys and organizations/i);
    }
  });

  it('rejects runtime manifest content, role, artifact, and digest drift', () => {
    const manifestMutations: Array<(
      manifest: NativeRuntimeDependencyManifest<
        'bridge-peg-in-runtime-identity-v2-verifier'
      >,
    ) => void> = [
      manifest => { manifest.artifactSha256 = '7'.repeat(64); },
      manifest => { manifest.artifactSizeBytes += 1; },
      manifest => { manifest.systemDlls = ['advapi32.dll', 'kernel32.dll']; },
      manifest => { manifest.systemDlls = ['kernel32.dll', 'advapi32.dll']; },
      manifest => { manifest.systemDlls = ['kernel32.dll', 'kernel32.dll']; },
      manifest => { manifest.systemDlls = ['KERNEL32.dll']; },
      manifest => { manifest.delayLoadedDlls = ['kernel32.dll']; },
      manifest => { manifest.nonSystemDependencies = ['helper.dll']; },
      manifest => { manifest.sidecars = ['helper.exe']; },
      manifest => {
        manifest.dynamicLibraryLoadingReviewedAbsent = false as true;
      },
      manifest => {
        manifest.boundaries.loadedModuleClosureEnforced = true as false;
      },
    ];
    for (const mutate of manifestMutations) {
      const manifest = structuredClone(fixture.runtimeDependencyManifest);
      mutate(manifest);
      expect(() => validate(fixture.policy, manifest)).toThrow();
    }

    const role = structuredClone(fixture.runtimeDependencyManifest);
    role.role = 'bridge-checkpoint-verifier' as never;
    expect(() => validate(fixture.policy, role)).toThrow(/role/i);

    const digest = structuredClone(fixture.policy);
    digest.nativeVerifier.runtimeDependencyManifestSha256 = '7'.repeat(64);
    expect(() => validate(digest)).toThrow(/manifest/i);
  });

  it('rejects argv, operation, request schema, and result schema drift', () => {
    const mutations: Array<(
      policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
    ) => void> = [
      policy => {
        policy.invocation.operation = 'verify-peg-in-state' as never;
      },
      policy => { policy.invocation.argvTemplate.reverse(); },
      policy => {
        policy.invocation.argvTemplate[0] = {
          kind: 'literal',
          value: '--anchor' as never,
        };
      },
      policy => {
        policy.invocation.argvTemplate[1] = {
          kind: 'parameter',
          name: 'trustedAnchorDigestHex',
          format: 'lowercase-0x-sha256' as never,
        };
      },
      policy => { policy.invocation.requestSchema = 'wrong' as never; },
      policy => { policy.invocation.resultSchema = 'wrong' as never; },
    ];
    for (const mutate of mutations) {
      const policy = structuredClone(fixture.policy);
      mutate(policy);
      expect(() => validate(policy)).toThrow(/operation|argv|schema|semantics/i);
    }
  });

  it('rejects every fixed execution limit and environment drift', () => {
    for (const field of [
      'timeoutMs',
      'requestLimitBytes',
      'stdoutLimitBytes',
      'stderrLimitBytes',
    ] as const) {
      const policy = structuredClone(fixture.policy);
      policy.invocation.limits[field] += 1;
      expect(() => validate(policy), field).toThrow(/semantics/i);
    }
    const environmentMutations: Array<(
      policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
    ) => void> = [
      policy => { policy.environment.variables.reverse(); },
      policy => { policy.environment.pathInherited = true as false; },
      policy => { policy.environment.libraryPathInherited = true as false; },
      policy => { policy.environment.temp = 'inherited' as never; },
    ];
    for (const mutate of environmentMutations) {
      const policy = structuredClone(fixture.policy);
      mutate(policy);
      expect(() => validate(policy)).toThrow();
    }
  });

  it('enforces activation, exclusive expiry, nonempty validity, and positive epochs', () => {
    expect(() => validate(
      fixture.policy,
      fixture.runtimeDependencyManifest,
      '2026-07-17T12:29:59.999Z',
    )).toThrow(/not yet valid/i);
    expect(() => validate(
      fixture.policy,
      fixture.runtimeDependencyManifest,
      '2026-12-31T00:00:00.000Z',
    )).toThrow(/expired/i);

    const reversed = structuredClone(fixture.policy);
    reversed.validity.expiresAt = reversed.validity.notBefore;
    expect(() => validate(reversed)).toThrow(/validity is empty/i);

    const zeroEpoch = structuredClone(fixture.policy);
    zeroEpoch.validity.policyEpoch = 0;
    expect(() => validate(zeroEpoch)).toThrow(/policy epoch/i);
  });

  it('rejects unknown fields at policy, invocation, and manifest boundaries', () => {
    const policyUnknown = structuredClone(fixture.policy) as unknown as
      Record<string, unknown>;
    policyUnknown.allowExecution = false;
    expect(() => validate(
      policyUnknown as unknown as NativePegInRuntimeIdentityV2ExecutionPolicy,
    )).toThrow(/required fields/i);

    const invocationUnknown = structuredClone(fixture.policy);
    (invocationUnknown.invocation as unknown as Record<string, unknown>)
      .shell = false;
    expect(() => validate(invocationUnknown)).toThrow(/required fields/i);

    const manifestUnknown = structuredClone(fixture.runtimeDependencyManifest);
    (manifestUnknown as unknown as Record<string, unknown>).searchPath = [];
    expect(() => validate(fixture.policy, manifestUnknown))
      .toThrow(/required fields/i);
  });

  it('rejects every relaxed safety boundary or premature authority claim', () => {
    const falseBoundaries = [
      'launcherAtomicBootstrapProven',
      'loadedModuleClosureEnforced',
      'runtimeUpgradeHistoryVerified',
      'cutoverPolicyVerified',
      'targetRuntimeBuildIdentityVerified',
      'runtimeCodeIdentityVerified',
      'historicalMintAbsenceVerified',
      'committedVaultTransitionVerified',
      'mintAuthorityGranted',
      'settlementAuthorityGranted',
      'gate5Closed',
      'productionReady',
    ] as const;
    for (const field of falseBoundaries) {
      const policy = structuredClone(fixture.policy);
      policy.boundaries[field] = true as never;
      expect(() => validate(policy), field).toThrow(/boundary/i);
    }
    for (const field of [
      'runtimeAndVerifierAttestationsRemainSeparate',
      'attestorFamiliesDisjoint',
      'targetStateCodeIsNotHistoricalProducerCode',
    ] as const) {
      const policy = structuredClone(fixture.policy);
      policy.boundaries[field] = false as never;
      expect(() => validate(policy), field).toThrow(/boundary|limitation/i);
    }
  });

  it('does not accept supplied structural reports as provenance-bearing joins', () => {
    const structuralReport =
      validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations({
        runtimeBuild: fixture.runtimeBuild,
        nativeVerifier: fixture.nativeVerifier,
        policy: fixture.policy,
        runtimeDependencyManifest: fixture.runtimeDependencyManifest,
        evaluatedAt: '2026-07-17T13:00:00.000Z',
      });
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
        runtimeBuild: fixture.runtimeBuild,
        nativeVerifier: fixture.nativeVerifier,
        report: structuralReport,
      })).toThrow(/provenance/i);

    expect(() =>
      validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations({
        runtimeBuild: structuredClone(fixture.runtimeBuild),
        nativeVerifier: fixture.nativeVerifier,
        policy: fixture.policy,
        runtimeDependencyManifest: fixture.runtimeDependencyManifest,
        evaluatedAt: '2026-07-17T13:00:00.000Z',
      })).toThrow(/provenance/i);
  });
});

function validate(
  policy = fixture.policy,
  runtimeDependencyManifest = fixture.runtimeDependencyManifest,
  evaluatedAt = '2026-07-17T13:00:00.000Z',
) {
  return validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstSuppliedAttestations({
    runtimeBuild: fixture.runtimeBuild,
    nativeVerifier: fixture.nativeVerifier,
    policy,
    runtimeDependencyManifest,
    evaluatedAt,
  });
}
