import { createHash } from 'crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalE2sJson,
  type NativeVerifierAttestationValidationReport,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
  assertNativeVerifierExecutionPolicyValidationProvenance,
  deriveNativeRuntimeDependencyManifestSha256,
  deriveNativeVerifierExecutionPolicySha256,
  validateNativeVerifierExecutionPolicyAgainstProfile,
  validateNativeVerifierExecutionPolicyAgainstSuppliedProfile,
  type NativeRuntimeDependencyManifest,
  type NativeVerifierExecutionPolicy,
} from './native-verifier-execution-policy.js';

const HEX = {
  statement: '11'.repeat(32),
  dependency: '22'.repeat(32),
  launcher: '33'.repeat(32),
  launcherSource: '44'.repeat(32),
  verifier: '55'.repeat(32),
  codec: '66'.repeat(32),
} as const;

describe('native verifier execution policy', () => {
  it('validates the exact unified policy and returns a deeply frozen fail-closed report', () => {
    const fixture = validFixture();
    const report = validate(fixture);

    expect(report).toEqual({
      schema: 'e2s.native-verifier-execution-policy-validation-report.v1',
      profileId: fixture.profile.profileId,
      attestationId: fixture.profile.attestationId,
      policyId: fixture.policy.policyId,
      executionPolicySha256: fixture.profile.executionPolicySha256,
      runtimeDependencyManifestSha256: {
        verifier: fixture.policy.targets.verifier.runtimeDependencyManifestSha256,
        codec: fixture.policy.targets.codec.runtimeDependencyManifestSha256,
      },
      validity: fixture.policy.validity,
      boundary: {
        relativeToSuppliedProfile: true,
        reviewedTrustRootsLoaded: true,
        executionCapabilityIssued: false,
        exactPolicyDigestMatched: true,
        exactArtifactBindingsMatched: true,
        runtimeDependencyManifestsMatched: true,
        loadedModuleClosureEnforced: false,
        executionAdmissionGranted: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.validity)).toBe(true);
    expect(Object.isFrozen(report.boundary)).toBe(true);
    expect(Object.isFrozen(report.runtimeDependencyManifestSha256)).toBe(true);
    expect(() => {
      (report.boundary as { productionReady: boolean }).productionReady = true;
    }).toThrow();
    expect(() => assertNativeVerifierExecutionPolicyValidationProvenance({
      profile: fixture.profile,
      report,
    })).not.toThrow();
  });

  it('exports the fixed schemas', () => {
    expect(NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA)
      .toBe('e2s.native-verifier-execution-policy.v1');
    expect(NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA)
      .toBe('e2s.native-runtime-dependency-manifest.v1');
  });

  it('rejects a structurally valid but unproven attestation profile on the trusted route', () => {
    const fixture = validFixture();
    expect(() => validateNativeVerifierExecutionPolicyAgainstProfile({
      profile: fixture.profile,
      policy: fixture.policy,
      runtimeDependencyManifests: fixture.manifests,
      evaluatedAt: '2026-07-12T13:00:00.000Z',
    })).toThrow(/attestation validation report provenance/i);
  });

  it('rejects every policy identity and cross-binding drift', () => {
    const mutations: Array<[string, (fixture: Fixture) => void]> = [
      ['profile ID', fixture => { fixture.policy.profileId = 'other-profile'; }],
      ['attestation ID', fixture => { fixture.policy.attestationId = 'other-attestation'; }],
      ['statement digest', fixture => {
        fixture.policy.bindings.attestationCoreDigestHex = '77'.repeat(32);
      }],
      ['build dependency digest', fixture => {
        fixture.policy.bindings.buildDependencyManifestSha256 = '77'.repeat(32);
      }],
      ['launcher digest', fixture => { fixture.policy.bindings.launcher.sha256 = '77'.repeat(32); }],
      ['launcher size', fixture => { fixture.policy.bindings.launcher.sizeBytes += 1; }],
      ['launcher source manifest', fixture => {
        fixture.policy.bindings.launcher.sourceManifestSha256 = '77'.repeat(32);
      }],
      ['verifier artifact digest', fixture => {
        fixture.policy.targets.verifier.artifactSha256 = '77'.repeat(32);
      }],
      ['verifier artifact size', fixture => {
        fixture.policy.targets.verifier.artifactSizeBytes += 1;
      }],
      ['codec artifact digest', fixture => {
        fixture.policy.targets.codec.artifactSha256 = '77'.repeat(32);
      }],
      ['codec artifact size', fixture => {
        fixture.policy.targets.codec.artifactSizeBytes += 1;
      }],
      ['verifier manifest reference', fixture => {
        fixture.policy.targets.verifier.runtimeDependencyManifestSha256 = '77'.repeat(32);
      }],
      ['codec manifest reference', fixture => {
        fixture.policy.targets.codec.runtimeDependencyManifestSha256 = '77'.repeat(32);
      }],
      ['profile execution-policy digest', fixture => {
        fixture.profile.executionPolicySha256 = '77'.repeat(32);
      }],
    ];

    for (const [label, mutate] of mutations) {
      const fixture = validFixture();
      mutate(fixture);
      expect(() => validate(fixture), label).toThrow();
    }
  });

  it('rejects runtime-manifest digest and artifact cross-binding drift', () => {
    const mutations: Array<[string, (fixture: Fixture) => void]> = [
      ['manifest content digest', fixture => {
        fixture.manifests.verifier.systemDlls = ['advapi32.dll', 'kernel32.dll'];
      }],
      ['manifest role', fixture => {
        fixture.manifests.verifier.role = 'bridge-rpc-proof-codec' as never;
      }],
      ['manifest artifact digest', fixture => {
        fixture.manifests.verifier.artifactSha256 = '77'.repeat(32);
      }],
      ['manifest artifact size', fixture => {
        fixture.manifests.verifier.artifactSizeBytes += 1;
      }],
      ['manifest platform', fixture => {
        fixture.manifests.verifier.platform = 'linux-x64' as never;
      }],
    ];

    for (const [label, mutate] of mutations) {
      const fixture = validFixture();
      mutate(fixture);
      expect(() => validate(fixture), label).toThrow();
    }
  });

  it('enforces policy time ordering, activation, exclusive expiry, and positive epochs', () => {
    const future = validFixture();
    expect(() => validate(future, '2026-07-12T12:59:59.999Z')).toThrow(/not active/i);

    const exactExpiry = validFixture();
    expect(() => validate(exactExpiry, '2026-07-13T13:00:00.000Z')).toThrow(/expired/i);

    const expired = validFixture();
    expect(() => validate(expired, '2026-07-14T00:00:00.000Z')).toThrow(/expired/i);

    const beforeReview = validFixture();
    beforeReview.policy.validity.notBefore = '2026-07-12T11:59:59.999Z';
    resignPolicy(beforeReview);
    expect(() => validate(beforeReview)).toThrow(/reviewedAt/i);

    const reversed = validFixture();
    reversed.policy.validity.expiresAt = reversed.policy.validity.notBefore;
    resignPolicy(reversed);
    expect(() => validate(reversed)).toThrow(/validity/i);

    const zeroEpoch = validFixture();
    zeroEpoch.policy.validity.policyEpoch = 0;
    resignPolicy(zeroEpoch);
    expect(() => validate(zeroEpoch)).toThrow(/policyEpoch/i);
  });

  it('rejects unknown fields at policy and runtime-manifest boundaries', () => {
    const policyUnknown = validFixture();
    (policyUnknown.policy as unknown as Record<string, unknown>).unknown = true;
    expect(() => validate(policyUnknown)).toThrow(/exactly|unknown/i);

    const nestedUnknown = validFixture();
    (nestedUnknown.policy.environment as unknown as Record<string, unknown>).PATH = true;
    expect(() => validate(nestedUnknown)).toThrow(/exactly|unknown/i);

    const manifestUnknown = validFixture();
    (manifestUnknown.manifests.codec as unknown as Record<string, unknown>).searchPath = [];
    expect(() => validate(manifestUnknown)).toThrow(/exactly|unknown/i);
  });

  it('rejects wrong, reordered, or missing operations and argv templates', () => {
    const mutations: Array<[string, (policy: NativeVerifierExecutionPolicy) => void]> = [
      ['wrong verifier operation', policy => {
        policy.targets.verifier.invocations[0].operation = 'inspect-checkpoint' as never;
      }],
      ['missing verifier operation', policy => { policy.targets.verifier.invocations = []; }],
      ['reordered codec operations', policy => {
        policy.targets.codec.invocations.reverse();
      }],
      ['missing codec operation', policy => { policy.targets.codec.invocations.pop(); }],
      ['wrong verifier argv literal', policy => {
        policy.targets.verifier.invocations[0].argvTemplate[0] = {
          kind: 'literal',
          value: '--anchor',
        };
      }],
      ['reordered verifier argv', policy => {
        policy.targets.verifier.invocations[0].argvTemplate.reverse();
      }],
      ['missing verifier argv', policy => {
        policy.targets.verifier.invocations[0].argvTemplate.pop();
      }],
      ['wrong verifier parameter format', policy => {
        policy.targets.verifier.invocations[0].argvTemplate[1] = {
          kind: 'parameter',
          name: 'trustedAnchorDigestHex',
          format: 'uppercase-sha256' as never,
        };
      }],
      ['nonliteral codec argv', policy => {
        policy.targets.codec.invocations[0].argvTemplate[0] = {
          kind: 'parameter',
          name: 'mode' as never,
          format: 'lowercase-0x-sha256',
        };
      }],
      ['missing codec argv', policy => {
        policy.targets.codec.invocations[0].argvTemplate = [];
      }],
      ['wrong request schema', policy => {
        policy.targets.codec.invocations[1].requestSchema = 'wrong';
      }],
      ['wrong result schema', policy => {
        policy.targets.verifier.invocations[0].resultSchema = 'wrong';
      }],
    ];

    for (const [label, mutate] of mutations) {
      const fixture = validFixture();
      mutate(fixture.policy);
      resignPolicy(fixture);
      expect(() => validate(fixture), label).toThrow(/invocation|operation|argv|schema/i);
    }
  });

  it('rejects target limit drift', () => {
    for (const field of ['timeoutMs', 'requestLimitBytes', 'stdoutLimitBytes', 'stderrLimitBytes'] as const) {
      const fixture = validFixture();
      fixture.policy.targets.verifier.limits[field] += 1;
      resignPolicy(fixture);
      expect(() => validate(fixture), field).toThrow(/limit/i);
    }
  });

  it('rejects environment drift', () => {
    const mutations: Array<(environment: NativeVerifierExecutionPolicy['environment']) => void> = [
      environment => { environment.variables = ['TEMP', 'SystemRoot', 'TMP']; },
      environment => { environment.variables.push('PATH' as never); },
      environment => { environment.temp = 'inherited' as never; },
      environment => { environment.workingDirectory = 'launcher-directory' as never; },
      environment => { environment.pathInherited = true as never; },
      environment => { environment.libraryPathInherited = true as never; },
    ];
    for (const mutate of mutations) {
      const fixture = validFixture();
      mutate(fixture.policy.environment);
      resignPolicy(fixture);
      expect(() => validate(fixture)).toThrow(/environment/i);
    }
  });

  it('rejects runtime dependency manifest closure drift', () => {
    const mutations: Array<[string, (manifest: NativeRuntimeDependencyManifest) => void]> = [
      ['unsorted', manifest => { manifest.systemDlls = ['kernel32.dll', 'advapi32.dll']; }],
      ['duplicate', manifest => { manifest.systemDlls = ['kernel32.dll', 'kernel32.dll']; }],
      ['uppercase', manifest => { manifest.systemDlls = ['KERNEL32.dll']; }],
      ['sidecars', manifest => { manifest.sidecars = ['helper.exe']; }],
      ['delay loaded DLLs', manifest => { manifest.delayLoadedDlls = ['user32.dll']; }],
      ['non-system dependencies', manifest => {
        manifest.nonSystemDependencies = ['vendor.dll'];
      }],
      ['dynamic loading review', manifest => {
        manifest.dynamicLibraryLoadingReviewedAbsent = false as never;
      }],
      ['module closure claim', manifest => {
        manifest.boundaries.loadedModuleClosureEnforced = true as never;
      }],
      ['dynamic exclusion claim', manifest => {
        manifest.boundaries.dynamicLoadsCryptographicallyExcluded = true as never;
      }],
    ];

    for (const [label, mutate] of mutations) {
      const fixture = validFixture();
      mutate(fixture.manifests.verifier);
      fixture.policy.targets.verifier.runtimeDependencyManifestSha256 =
        deriveNativeRuntimeDependencyManifestSha256(fixture.manifests.verifier);
      resignPolicy(fixture);
      expect(() => validate(fixture), label).toThrow(/manifest|systemDlls|closure|dynamic/i);
    }
  });

  it('rejects oversized runtime DLL allowlists before policy hashing', () => {
    const fixture = validFixture();
    fixture.manifests.verifier.systemDlls = Array.from(
      { length: 129 },
      (_, index) => `library-${index.toString().padStart(3, '0')}.dll`,
    );
    expect(() => deriveNativeRuntimeDependencyManifestSha256(
      fixture.manifests.verifier,
    )).toThrow(/systemDlls exceeds 128 entries/);
  });

  it('rejects policy boundary drift', () => {
    for (const field of [
      'launcherAtomicBootstrapProven',
      'loadedModuleClosureEnforced',
      'executionAdmissionGranted',
      'gate5Closed',
      'productionReady',
    ] as const) {
      const fixture = validFixture();
      fixture.policy.boundaries[field] = true as never;
      resignPolicy(fixture);
      expect(() => validate(fixture), field).toThrow(/boundar/i);
    }
  });

  it('rejects forged reports and reports proven against another profile', () => {
    const fixture = validFixture();
    const report = validate(fixture);
    const forged = structuredClone(report);
    expect(() => assertNativeVerifierExecutionPolicyValidationProvenance({
      profile: fixture.profile,
      report: forged,
    })).toThrow(/provenance/i);

    const otherProfile = structuredClone(fixture.profile);
    expect(() => assertNativeVerifierExecutionPolicyValidationProvenance({
      profile: otherProfile,
      report,
    })).toThrow(/provenance/i);
  });

  it('derives stable canonical digests regardless of object key insertion order', () => {
    const fixture = validFixture();
    const reorderedPolicy = reverseObjectKeys(fixture.policy);
    const reorderedManifest = reverseObjectKeys(fixture.manifests.verifier);

    expect(deriveNativeVerifierExecutionPolicySha256(reorderedPolicy))
      .toBe(deriveNativeVerifierExecutionPolicySha256(fixture.policy));
    expect(deriveNativeRuntimeDependencyManifestSha256(reorderedManifest))
      .toBe(deriveNativeRuntimeDependencyManifestSha256(fixture.manifests.verifier));
  });

  it('derives the exact domain-separated canonical SHA-256 digests', () => {
    const fixture = validFixture();
    expect(deriveNativeVerifierExecutionPolicySha256(fixture.policy)).toBe(
      domainSeparatedSha256(
        'E2S_NATIVE_VERIFIER_EXECUTION_POLICY_V1\0',
        fixture.policy,
      ),
    );
    expect(deriveNativeRuntimeDependencyManifestSha256(fixture.manifests.verifier)).toBe(
      domainSeparatedSha256(
        'E2S_NATIVE_RUNTIME_DEPENDENCY_MANIFEST_V1\0',
        fixture.manifests.verifier,
      ),
    );
  });
});

type ProfileV2 = NativeVerifierAttestationValidationReport & {
  timestamps: { builtAt: string; reviewedAt: string };
  dependencies: {
    mode: 'vendored-content-addressed';
    manifestSha256: string;
    crateCount: number;
    cargoLocked: true;
    cargoOffline: true;
    cargoFrozen: true;
    sharedMutableCacheUsed: false;
  };
  executionPolicySha256: string;
};

interface Fixture {
  profile: ProfileV2;
  policy: NativeVerifierExecutionPolicy;
  manifests: {
    verifier: NativeRuntimeDependencyManifest & { role: 'bridge-checkpoint-verifier' };
    codec: NativeRuntimeDependencyManifest & { role: 'bridge-rpc-proof-codec' };
  };
}

function validFixture(): Fixture {
  const manifests = {
    verifier: runtimeManifest('bridge-checkpoint-verifier', HEX.verifier, 12_345),
    codec: runtimeManifest('bridge-rpc-proof-codec', HEX.codec, 23_456),
  };
  const policy: NativeVerifierExecutionPolicy = {
    schema: NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
    profileId: 'institutional-win32-x64-v1',
    attestationId: 'build-2026-07-12-review-01',
    policyId: 'native-verifier-execution-2026-07-12-01',
    canonicalization: 'e2s-canonical-json-v1',
    validity: {
      notBefore: '2026-07-12T13:00:00.000Z',
      expiresAt: '2026-07-13T13:00:00.000Z',
      policyEpoch: 1,
    },
    bindings: {
      attestationCoreDigestHex: HEX.statement,
      buildDependencyManifestSha256: HEX.dependency,
      launcher: {
        sha256: HEX.launcher,
        sizeBytes: 34_567,
        sourceManifestSha256: HEX.launcherSource,
      },
    },
    environment: {
      variables: ['SystemRoot', 'TEMP', 'TMP'],
      temp: 'staged-directory',
      workingDirectory: 'staged-directory',
      pathInherited: false,
      libraryPathInherited: false,
    },
    targets: {
      verifier: {
        role: 'bridge-checkpoint-verifier',
        artifactSha256: HEX.verifier,
        artifactSizeBytes: 12_345,
        runtimeDependencyManifestSha256:
          deriveNativeRuntimeDependencyManifestSha256(manifests.verifier),
        invocations: [{
          operation: 'verify-checkpoint',
          argvTemplate: [
            { kind: 'literal', value: '--trusted-anchor-digest' },
            {
              kind: 'parameter',
              name: 'trustedAnchorDigestHex',
              format: 'lowercase-0x-sha256',
            },
          ],
          requestSchema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
          resultSchema: 'e2s.native-finalized-bridge-checkpoint-verification.v2',
        }],
        limits: fixedLimits(),
      },
      codec: {
        role: 'bridge-rpc-proof-codec',
        artifactSha256: HEX.codec,
        artifactSizeBytes: 23_456,
        runtimeDependencyManifestSha256:
          deriveNativeRuntimeDependencyManifestSha256(manifests.codec),
        invocations: [
          literalInvocation(
            'encode-headers',
            '--encode-headers',
            'e2s.substrate-rpc-header-encoding-request.v1',
            'e2s.substrate-rpc-header-encoding-result.v1',
          ),
          literalInvocation(
            'inspect-warp-proof',
            '--inspect-warp-proof',
            'e2s.substrate-rpc-warp-inspection-request.v2',
            'e2s.substrate-rpc-warp-inspection-result.v2',
          ),
          literalInvocation(
            'inspect-finality-proof',
            '--inspect-finality-proof',
            'e2s.substrate-rpc-finality-inspection-request.v1',
            'e2s.substrate-rpc-finality-inspection-result.v1',
          ),
        ],
        limits: fixedLimits(),
      },
    },
    boundaries: {
      launcherAtomicBootstrapProven: false,
      loadedModuleClosureEnforced: false,
      executionAdmissionGranted: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  const profile = {
    schema: 'e2s.native-verifier-attestation-validation-report.v2',
    profileId: policy.profileId,
    attestationId: policy.attestationId,
    attestation: {
      statementDigestHex: HEX.statement,
      statementCoreDigestHex: HEX.statement,
      policyDigestHex: '77'.repeat(32),
      builderKeyIdHex: '88'.repeat(32),
      reviewerKeyIdHex: '99'.repeat(32),
      builderSignatureVerified: true,
      reviewerSignatureVerified: true,
      actorKeysDisjoint: true,
      organizationsDeclaredDisjoint: true,
    },
    timestamps: {
      builtAt: '2026-07-12T10:00:00.000Z',
      reviewedAt: '2026-07-12T12:00:00.000Z',
    },
    dependencies: {
      mode: 'vendored-content-addressed',
      manifestSha256: HEX.dependency,
      crateCount: 42,
      cargoLocked: true,
      cargoOffline: true,
      cargoFrozen: true,
      sharedMutableCacheUsed: false,
    },
    source: {
      consensusSourceLockSha256: 'aa'.repeat(32),
      frontierCommit: 'bb'.repeat(20),
      frontierPatchSha256: 'cc'.repeat(32),
      cargoLockGitBlobId: 'dd'.repeat(20),
      verifierSourceManifestSha256: 'ee'.repeat(32),
    },
    artifacts: {
      verifier: {
        role: 'bridge-checkpoint-verifier',
        sha256: HEX.verifier,
        sizeBytes: 12_345,
      },
      codec: {
        role: 'bridge-rpc-proof-codec',
        sha256: HEX.codec,
        sizeBytes: 23_456,
      },
    },
    executionPolicySha256: deriveNativeVerifierExecutionPolicySha256(policy),
    boundary: {
      relativeToSuppliedPolicy: true,
      reviewedTrustRootsLoaded: true,
      executionCapabilityIssued: false,
      exactBinaryBytesMatched: true,
      completeBuildToolClosureAttested: true,
      dependencyClosureAttested: true,
      osProcessContainmentAttested: true,
      organizationalIndependenceCryptographicallyProven: false,
      provisioningIntegrated: false,
      trackerAttestorSeparated: false,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      committeeBypassPrevented: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  } as unknown as ProfileV2;
  return { profile, policy, manifests };
}

function runtimeManifest<Role extends NativeRuntimeDependencyManifest['role']>(
  role: Role,
  artifactSha256: string,
  artifactSizeBytes: number,
): NativeRuntimeDependencyManifest & { role: Role } {
  return {
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role,
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
  } as NativeRuntimeDependencyManifest & { role: Role };
}

function fixedLimits(): NativeVerifierExecutionPolicy['targets']['verifier']['limits'] {
  return {
    timeoutMs: 30_000,
    requestLimitBytes: 33_554_432,
    stdoutLimitBytes: 16_777_216,
    stderrLimitBytes: 65_536,
  };
}

function literalInvocation(
  operation: 'encode-headers' | 'inspect-warp-proof' | 'inspect-finality-proof',
  value: string,
  requestSchema: string,
  resultSchema: string,
) {
  return {
    operation,
    argvTemplate: [{ kind: 'literal' as const, value }],
    requestSchema,
    resultSchema,
  };
}

function validate(
  fixture: Fixture,
  evaluatedAt = '2026-07-12T13:00:00.000Z',
) {
  return validateNativeVerifierExecutionPolicyAgainstSuppliedProfile({
    profile: fixture.profile,
    policy: fixture.policy,
    runtimeDependencyManifests: fixture.manifests,
    evaluatedAt,
  });
}

function resignPolicy(fixture: Fixture): void {
  fixture.profile.executionPolicySha256 =
    deriveNativeVerifierExecutionPolicySha256(fixture.policy);
}

function reverseObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseObjectKeys) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  ) as T;
}

function domainSeparatedSha256(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from(canonicalE2sJson(value), 'utf8'))
    .digest('hex');
}
