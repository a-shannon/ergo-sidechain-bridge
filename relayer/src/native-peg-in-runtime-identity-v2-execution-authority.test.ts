import { createHash } from 'crypto';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const authorityMocks = vi.hoisted(() => ({
  runtimeBuild: undefined as unknown,
  nativeVerifier: undefined as unknown,
  policyReport: undefined as unknown,
  verifyRuntimeBuild: vi.fn(),
  assertRuntimeBuild: vi.fn(),
  verifyNativeVerifier: vi.fn(),
  assertNativeVerifier: vi.fn(),
  validatePolicy: vi.fn(),
  assertPolicy: vi.fn(),
  runContained: vi.fn(),
}));

vi.mock('./peg-in-runtime-build-attestation.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./peg-in-runtime-build-attestation.js')
  >();
  return {
    ...actual,
    verifyReviewedPegInRuntimeBuildAttestation:
      authorityMocks.verifyRuntimeBuild,
    assertReviewedPegInRuntimeBuildAttestationProvenance:
      authorityMocks.assertRuntimeBuild,
  };
});

vi.mock(
  './native-peg-in-runtime-identity-v2-verifier-attestation.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-peg-in-runtime-identity-v2-verifier-attestation.js'
      )
    >();
    return {
      ...actual,
      verifyReviewedNativePegInRuntimeIdentityV2Attestation:
        authorityMocks.verifyNativeVerifier,
      assertReviewedNativePegInRuntimeIdentityV2AttestationProvenance:
        authorityMocks.assertNativeVerifier,
    };
  },
);

vi.mock(
  './native-peg-in-runtime-identity-v2-execution-policy.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-peg-in-runtime-identity-v2-execution-policy.js'
      )
    >();
    return {
      ...actual,
      validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations:
        authorityMocks.validatePolicy,
      assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance:
        authorityMocks.assertPolicy,
    };
  },
);

vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-contained-process.js')
  >();
  return {
    ...actual,
    runNativeContainedProcess: authorityMocks.runContained,
  };
});

import {
  NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_ENV,
  NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance,
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance,
  createNativePegInRuntimeIdentityV2ExecutionAuthority,
  loadNativePegInRuntimeIdentityV2ExecutionAuthorityFromEnvironment,
  parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage,
} from './native-peg-in-runtime-identity-v2-execution-authority.js';
import {
  deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256,
} from './native-peg-in-runtime-identity-v2-execution-policy.js';
import {
  createNativePegInRuntimeIdentityV2ExecutionPolicyFixture,
  type NativePegInRuntimeIdentityV2ExecutionPolicyFixture,
} from './native-peg-in-runtime-identity-v2-execution-policy-fixture.test-helper.js';

let fixture: NativePegInRuntimeIdentityV2ExecutionPolicyFixture;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-17T13:00:00.000Z'));
  fixture = createNativePegInRuntimeIdentityV2ExecutionPolicyFixture();
  const runtimeBuild = structuredClone(fixture.runtimeBuild);
  runtimeBuild.boundary.reviewedTrustRootsLoaded = true;
  const nativeVerifier = structuredClone(fixture.nativeVerifier);
  nativeVerifier.boundary.reviewedTrustRootsLoaded = true;
  const policyReport = {
    executionPolicySha256:
      deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(
        fixture.policy,
      ),
    boundary: {
      runtimeReviewedTrustRootsLoaded: true,
      nativeVerifierReviewedTrustRootsLoaded: true,
    },
  };
  authorityMocks.runtimeBuild = runtimeBuild;
  authorityMocks.nativeVerifier = nativeVerifier;
  authorityMocks.policyReport = policyReport;
  authorityMocks.verifyRuntimeBuild.mockImplementation(() => runtimeBuild);
  authorityMocks.verifyNativeVerifier.mockImplementation(() => nativeVerifier);
  authorityMocks.validatePolicy.mockClear();
  authorityMocks.validatePolicy.mockImplementation(() => policyReport);
  authorityMocks.runContained.mockResolvedValue(
    containedResult(Buffer.from('verified-runtime-identity-v2-output')),
  );
});

afterEach(() => {
  fixture.dispose();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('native runtime identity V2 execution authority', () => {
  it('revalidates both source-owned attestation families around one contained proof launch', async () => {
    const authority = createAuthority();
    const requestBytes = Buffer.from('runtime-identity-v2-proof-request');
    const trustedAnchorDigestHex = `0x${'ab'.repeat(32)}`;
    const result = await authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex,
      requestBytes,
    });

    expect(authorityMocks.verifyRuntimeBuild).toHaveBeenCalledTimes(3);
    expect(authorityMocks.verifyNativeVerifier).toHaveBeenCalledTimes(3);
    expect(authorityMocks.validatePolicy).toHaveBeenCalledTimes(3);
    expect(authorityMocks.runContained).toHaveBeenCalledWith({
      launcherPath: fixture.launcherPath,
      launcherSha256Hex:
        `0x${fixture.policy.nativeVerifier.launcher.sha256}`,
      targetPath: fixture.nativeVerifierExecutablePath,
      targetSha256Hex:
        `0x${fixture.policy.nativeVerifier.artifactSha256}`,
      targetArgs: [
        '--trusted-anchor-digest',
        trustedAnchorDigestHex,
      ],
      policyNotBeforeUnixMs: Date.parse(fixture.policy.validity.notBefore),
      policyExpiresAtUnixMs: Date.parse(fixture.policy.validity.expiresAt),
      timeoutMs: fixture.policy.invocation.limits.timeoutMs,
      requestLimitBytes: fixture.policy.invocation.limits.requestLimitBytes,
      stdoutLimitBytes: fixture.policy.invocation.limits.stdoutLimitBytes,
      stderrLimitBytes: fixture.policy.invocation.limits.stderrLimitBytes,
      requestBytes,
      authority: {
        profileDigestHex: jointProfileDigest(fixture.policy),
        policyDigestHex:
          `0x${deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(
            fixture.policy,
          )}`,
        policyEpoch: fixture.policy.validity.policyEpoch,
        recordVersion: 'v2',
        allowedSystemDlls:
          fixture.runtimeDependencyManifest.systemDlls,
      },
    });
    expect(result.boundary).toEqual({
      sourceOwnedRuntimeBuildAttestorLockReloaded: true,
      sourceOwnedNativeVerifierAttestorLockReloaded: true,
      sourceOwnedAttestorLocksRevalidatedAfterExecution: true,
      reviewedTrustRootsRequired: true,
      exactJointPolicyValidatedAfterReload: true,
      exactJointPolicyRevalidatedAfterExecution: true,
      brokerAuthorityModeRequested: true,
      containedProofExecutionOnly: true,
      directProcessAllowed: false,
      runtimeBuildAttestationVerified: true,
      nativeVerifierAttestationVerified: true,
      immutableLauncherInstallationRequired: true,
      authorityRecordV2Required: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
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
    expect(result.jointAuthorityProfileDigestHex).toBe(
      authority.declaration.jointAuthorityProfileDigestHex,
    );
    assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance(
      authority,
    );
    assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance({
      authority,
      result,
    });
  });

  it('fails closed if either source-owned trust registry disappears before or during execution', async () => {
    const authority = createAuthority();
    authorityMocks.verifyRuntimeBuild.mockImplementation(() => {
      throw new Error('runtime build attestor lock has no active profile');
    });
    await expect(authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/no active profile/i);
    expect(authorityMocks.runContained).not.toHaveBeenCalled();

    authorityMocks.verifyRuntimeBuild.mockImplementation(
      () => authorityMocks.runtimeBuild,
    );
    const second = createAuthority();
    authorityMocks.runContained.mockImplementationOnce(async () => {
      authorityMocks.verifyNativeVerifier.mockImplementation(() => {
        throw new Error('native V2 attestor lock has no active profile');
      });
      return containedResult(Buffer.from('untrusted-output'));
    });
    await expect(second.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/no active profile/i);
  });

  it('rejects malformed operations, anchor digests, and weakened broker boundaries', async () => {
    const authority = createAuthority();
    await expect(authority.execute({
      operation: 'verify-peg-in-state' as 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/operation is unsupported/i);
    await expect(authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'AB'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/lowercase.*32-byte digest/i);

    authorityMocks.runContained.mockResolvedValue({
      ...containedResult(Buffer.from('output')),
      boundary: {
        ...containedResult(Buffer.from('output')).boundary,
        executionAdmissionGranted: true,
      },
    });
    await expect(authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/broker boundary is invalid/i);
  });

  it.each([
    ['generic contained-process result without V2 authority binding', {
      brokerSelfImageBoundToAuthorityRecordV2: false,
    }],
    ['contained-process result that claims a completed launcher campaign', {
      launcherInstallationActivationCampaignCompleted: true,
    }],
  ])('rejects a %s', async (_label, boundaryOverrides) => {
    const authority = createAuthority();
    authorityMocks.runContained.mockResolvedValue({
      ...containedResult(Buffer.from('output')),
      boundary: {
        ...containedResult(Buffer.from('output')).boundary,
        ...boundaryOverrides,
      },
    });

    await expect(authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/broker boundary is invalid/i);
  });

  it('snapshots packets, policy, and stdout and rejects forged provenance', async () => {
    const runtimeBuildPacket = structuredClone(fixture.runtimeBuildPacket);
    const nativeVerifierPacket = structuredClone(fixture.nativePacket);
    const policy = structuredClone(fixture.policy);
    const authority =
      createNativePegInRuntimeIdentityV2ExecutionAuthority({
        runtimeBuildPacket,
        nativeVerifierPacket,
        executionPolicy: policy,
        runtimeDependencyManifest: fixture.runtimeDependencyManifest,
        launcherPath: fixture.launcherPath,
        runtimeCodePath: fixture.runtimeCodePath,
        verifierExecutablePath: fixture.nativeVerifierExecutablePath,
      });
    runtimeBuildPacket.statement.profileId = 'mutated-runtime-profile';
    nativeVerifierPacket.statement.profileId = 'mutated-native-profile';
    policy.validity.policyEpoch = 99;
    const result = await authority.execute({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    });
    const callerBytes = result.stdout;
    callerBytes.fill(0);

    expect(result.stdout).toEqual(
      Buffer.from('verified-runtime-identity-v2-output'),
    );
    expect(
      authorityMocks.verifyRuntimeBuild.mock.calls[0][0]
        .packet.statement.profileId,
    ).toBe(fixture.runtimeBuildPacket.statement.profileId);
    expect(
      authorityMocks.verifyNativeVerifier.mock.calls[0][0]
        .packet.statement.profileId,
    ).toBe(fixture.nativePacket.statement.profileId);
    expect(
      authorityMocks.runContained.mock.calls[0][0].authority.policyEpoch,
    ).toBe(1);
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance({
        execute: vi.fn(),
      }),
    ).toThrow(/provenance/i);
    expect(() =>
      assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance({
        authority,
        result: { stdout: Buffer.from('forged') },
      }),
    ).toThrow(/provenance/i);
  });

  it('loads only an exact package and refuses runtime trust-root overrides', () => {
    expect(
      loadNativePegInRuntimeIdentityV2ExecutionAuthorityFromEnvironment({}),
    ).toBeNull();
    const packageValue = {
      schema:
        NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
      runtimeBuildPacket: fixture.runtimeBuildPacket,
      nativeVerifierPacket: fixture.nativePacket,
      executionPolicy: fixture.policy,
      runtimeDependencyManifest: fixture.runtimeDependencyManifest,
      launcherPath: fixture.launcherPath,
      runtimeCodePath: fixture.runtimeCodePath,
      verifierExecutablePath: fixture.nativeVerifierExecutablePath,
    };
    expect(
      parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage(
        packageValue,
      ),
    ).toEqual(packageValue);
    const loaded =
      loadNativePegInRuntimeIdentityV2ExecutionAuthorityFromEnvironment({
        [NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_ENV]:
          JSON.stringify(packageValue),
      });
    assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance(loaded);
    expect(() =>
      parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage({
        ...packageValue,
        runtimeBuildAttestorLock: { profiles: [] },
      }),
    ).toThrow(/unexpected field/i);
    expect(() =>
      parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage({
        ...packageValue,
        launcherPath: 'C:\\trusted\\bridge-contained-launcher.exe',
      }),
    ).toThrow(/digest-addressed v2 installation suffix/i);
    expect(() =>
      parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage({
        ...packageValue,
        launcherPath: windowsTestPath(
          'C',
          'Program Files',
          'E2SBridge',
          'NativeExecution',
          'v2',
          'Images',
          '8'.repeat(64),
          'bridge-contained-launcher.exe',
        ),
      }),
    ).toThrow(/digest-addressed v2 installation suffix/i);
  });
});

function windowsTestPath(drive: string, ...segments: string[]): string {
  const separator = String.fromCharCode(92);
  return `${drive}:${separator}${segments.join(separator)}`;
}

function createAuthority() {
  return createNativePegInRuntimeIdentityV2ExecutionAuthority({
    runtimeBuildPacket: fixture.runtimeBuildPacket,
    nativeVerifierPacket: fixture.nativePacket,
    executionPolicy: fixture.policy,
    runtimeDependencyManifest: fixture.runtimeDependencyManifest,
    launcherPath: fixture.launcherPath,
    runtimeCodePath: fixture.runtimeCodePath,
    verifierExecutablePath: fixture.nativeVerifierExecutablePath,
  });
}

function jointProfileDigest(
  policy: NativePegInRuntimeIdentityV2ExecutionPolicyFixture['policy'],
): string {
  const authorityFields = [
    policy.runtimeBuild.profileId,
    policy.runtimeBuild.attestorPolicyDigestHex,
    policy.runtimeBuild.builderKeyIdHex,
    policy.runtimeBuild.builderOrganizationId,
    policy.runtimeBuild.reviewerKeyIdHex,
    policy.runtimeBuild.reviewerOrganizationId,
    policy.nativeVerifier.profileId,
    policy.nativeVerifier.attestorPolicyDigestHex,
    policy.nativeVerifier.builderKeyIdHex,
    policy.nativeVerifier.builderOrganizationId,
    policy.nativeVerifier.reviewerKeyIdHex,
    policy.nativeVerifier.reviewerOrganizationId,
  ];
  return `0x${createHash('sha256')
    .update(
      `E2S_RUNTIME_IDENTITY_V2_JOINT_AUTHORITY_V2\0${authorityFields.join('\0')}`,
      'utf8',
    )
    .digest('hex')}`;
}

function containedResult(stdout: Buffer) {
  return {
    stdout,
    boundary: {
      trustedLauncherInstallationRequired: true as const,
      launcherDigestMatchedBeforeAndAfter: true as const,
      brokerSelfImageBoundToAuthorityRecordV2: true as const,
      launcherInstallationActivationCampaignCompleted: false as const,
      launcherAtomicBootstrapProven: false as const,
      targetAtomicityDelegatedToBroker: true as const,
      targetAtomicityObservedByTypeScript: false as const,
      executionAdmissionGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
}
