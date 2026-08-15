import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authorityMocks = vi.hoisted(() => ({
  reviewedProfile: undefined as unknown,
  policyReport: undefined as unknown,
  verifyReviewed: vi.fn(),
  assertReviewed: vi.fn(),
  validatePolicy: vi.fn(),
  assertPolicy: vi.fn(),
  runContained: vi.fn(),
}));

vi.mock('./independently-attested-native-verifier-profile.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./independently-attested-native-verifier-profile.js')
  >();
  return {
    ...actual,
    verifyReviewedIndependentlyAttestedNativeVerifierProfile:
      authorityMocks.verifyReviewed,
    assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance:
      authorityMocks.assertReviewed,
  };
});

vi.mock('./native-peg-in-verifier-execution-policy.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-peg-in-verifier-execution-policy.js')
  >();
  return {
    ...actual,
    validateNativePegInVerifierExecutionPolicyAgainstProfile:
      authorityMocks.validatePolicy,
    assertNativePegInVerifierExecutionPolicyValidationProvenance:
      authorityMocks.assertPolicy,
  };
});

vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./native-contained-process.js')>();
  return {
    ...actual,
    runNativeContainedProcess: authorityMocks.runContained,
  };
});

import {
  assertNativePegInVerifierExecutionAuthorityProvenance,
  assertNativePegInVerifierExecutionAuthorityResultProvenance,
  createNativePegInVerifierExecutionAuthority,
  loadNativePegInVerifierExecutionAuthorityFromEnvironment,
  NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV,
  NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
  parseNativePegInVerifierExecutionAuthorityPackage,
} from './native-peg-in-verifier-execution-authority.js';
import {
  deriveNativePegInVerifierExecutionPolicySha256,
} from './native-peg-in-verifier-execution-policy.js';
import {
  createAuthorityBoundNativeFinalizedPegInStateVerifier,
} from './native-finalized-peg-in-state.js';
import {
  createAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import {
  createNativePegInVerifierAttestationExecutionFixture,
  type NativePegInVerifierAttestationExecutionFixture,
} from './native-peg-in-verifier-attestation-fixture.test-helper.js';
import { deriveNativeVerifierAuthorityProfileDigestHex } from './native-verifier-execution-authority.js';

let fixture: NativePegInVerifierAttestationExecutionFixture;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-12T12:00:00.000Z'));
  fixture = createNativePegInVerifierAttestationExecutionFixture();
  const reviewedProfile = structuredClone(fixture.profile);
  reviewedProfile.boundary.reviewedTrustRootsLoaded = true;
  authorityMocks.reviewedProfile = reviewedProfile;
  authorityMocks.policyReport = {
    executionPolicySha256:
      deriveNativePegInVerifierExecutionPolicySha256(fixture.policy),
    boundary: {
      reviewedTrustRootsLoaded: true,
    },
  };
  authorityMocks.verifyReviewed.mockImplementation(() => authorityMocks.reviewedProfile);
  authorityMocks.validatePolicy.mockImplementation(() => authorityMocks.policyReport);
  authorityMocks.runContained.mockResolvedValue(containedResult(Buffer.from('verified-output')));
});

afterEach(() => {
  fixture.dispose();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('native peg-in verifier execution authority', () => {
  it('reloads reviewed roots and validates the exact peg-in policy around every launch', async () => {
    const authority = createAuthority();
    const requestBytes = Buffer.from('peg-in-proof-request');
    const trustedAnchorDigestHex = `0x${'ab'.repeat(32)}`;
    const result = await authority.execute({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex,
      requestBytes,
    });

    expect(authorityMocks.verifyReviewed).toHaveBeenCalledTimes(3);
    expect(authorityMocks.validatePolicy).toHaveBeenCalledTimes(3);
    expect(authorityMocks.runContained).toHaveBeenCalledWith({
      launcherPath: fixture.launcherPath,
      launcherSha256Hex: `0x${fixture.policy.bindings.launcher.sha256}`,
      targetPath: fixture.verifierPath,
      targetSha256Hex: `0x${fixture.policy.verifier.artifactSha256}`,
      targetArgs: [
        '--verify-peg-in-state',
        '--trusted-anchor-digest',
        trustedAnchorDigestHex,
      ],
      policyNotBeforeUnixMs: Date.parse(fixture.policy.validity.notBefore),
      policyExpiresAtUnixMs: Date.parse(fixture.policy.validity.expiresAt),
      timeoutMs: fixture.policy.verifier.limits.timeoutMs,
      requestLimitBytes: fixture.policy.verifier.limits.requestLimitBytes,
      stdoutLimitBytes: fixture.policy.verifier.limits.stdoutLimitBytes,
      stderrLimitBytes: fixture.policy.verifier.limits.stderrLimitBytes,
      requestBytes,
      authority: {
        profileDigestHex: deriveNativeVerifierAuthorityProfileDigestHex(
          fixture.policy.profileId,
        ),
        policyDigestHex:
          `0x${deriveNativePegInVerifierExecutionPolicySha256(fixture.policy)}`,
        policyEpoch: fixture.policy.validity.policyEpoch,
        allowedSystemDlls: fixture.manifests.verifier.systemDlls,
      },
    });
    expect(result.boundary).toEqual({
      sourceOwnedAttestorLockReloaded: true,
      sourceOwnedAttestorLockRevalidatedAfterExecution: true,
      reviewedTrustRootsRequired: true,
      exactPegInPolicyValidatedAfterReload: true,
      exactPegInPolicyRevalidatedAfterExecution: true,
      brokerAuthorityModeRequested: true,
      directProcessAllowed: false,
      pegInConformanceAttested: false,
      runtimeCodeIdentityVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    });
    assertNativePegInVerifierExecutionAuthorityProvenance(authority);
    assertNativePegInVerifierExecutionAuthorityResultProvenance({ authority, result });
  });

  it('routes the V4 reservation-state operation through the same contained authority', async () => {
    fixture.dispose();
    fixture = createNativePegInVerifierAttestationExecutionFixture(
      'verify-pooled-reserve-mint-reservation-state-v4',
    );
    configureAuthorityMocks();
    const authority = createAuthority();
    const requestBytes = Buffer.from('pooled-reserve-state-proof-request');
    const trustedAnchorDigestHex = `0x${'ac'.repeat(32)}`;
    const result = await authority.execute({
      operation: 'verify-pooled-reserve-mint-reservation-state-v4',
      trustedAnchorDigestHex,
      requestBytes,
    });

    expect(authorityMocks.runContained).toHaveBeenCalledWith(
      expect.objectContaining({
        targetArgs: [
          '--verify-pooled-reserve-mint-reservation-state-v4',
          '--trusted-anchor-digest',
          trustedAnchorDigestHex,
        ],
        requestBytes,
      }),
    );
    expect(result.operation).toBe(
      'verify-pooled-reserve-mint-reservation-state-v4',
    );
    assertNativePegInVerifierExecutionAuthorityResultProvenance({
      authority,
      result,
    });

    authorityMocks.runContained.mockClear();
    await expect(authority.execute({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex,
      requestBytes,
    })).rejects.toThrow(/not authorized by the exact execution policy/i);
    expect(authorityMocks.runContained).not.toHaveBeenCalled();
  });

  it('binds wrapper provenance to the exact operation authorized by policy', () => {
    const v1Authority = createAuthority();
    expect(v1Authority.declaration.operation).toBe('verify-peg-in-state');
    expect(() =>
      createAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier(
        v1Authority,
      ),
    ).toThrow(/does not authorize the exact operation/i);

    fixture.dispose();
    fixture = createNativePegInVerifierAttestationExecutionFixture(
      'verify-pooled-reserve-mint-reservation-state-v4',
    );
    configureAuthorityMocks();
    const v4Authority = createAuthority();
    expect(v4Authority.declaration.operation).toBe(
      'verify-pooled-reserve-mint-reservation-state-v4',
    );
    expect(() =>
      createAuthorityBoundNativeFinalizedPegInStateVerifier(v4Authority)
    ).toThrow(/does not authorize the exact operation/i);
  });

  it('fails closed on source-lock loss before or during execution', async () => {
    const authority = createAuthority();
    authorityMocks.verifyReviewed.mockImplementation(() => {
      throw new Error('native verifier attestation has no active attestor profile');
    });
    await expect(authority.execute({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/no active attestor profile/i);
    expect(authorityMocks.runContained).not.toHaveBeenCalled();

    authorityMocks.verifyReviewed.mockImplementation(() => authorityMocks.reviewedProfile);
    const second = createAuthority();
    authorityMocks.runContained.mockImplementationOnce(async () => {
      authorityMocks.verifyReviewed.mockImplementation(() => {
        throw new Error('native verifier attestation has no active attestor profile');
      });
      return containedResult(Buffer.from('untrusted-output'));
    });
    await expect(second.execute({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/no active attestor profile/i);
  });

  it('rejects malformed operations, anchor digests, and weakened broker boundaries', async () => {
    const authority = createAuthority();
    await expect(authority.execute({
      operation: 'verify-checkpoint' as 'verify-peg-in-state',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/operation is unsupported/i);
    await expect(authority.execute({
      operation: 'verify-pooled-reserve-mint-reservation-state-v4',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/not authorized by the exact execution policy/i);
    await expect(authority.execute({
      operation: 'verify-peg-in-state',
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
      operation: 'verify-peg-in-state',
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
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/broker boundary is invalid/i);
  });

  it('snapshots inputs and stdout and rejects forged provenance', async () => {
    const packet = structuredClone(fixture.packet);
    const policy = structuredClone(fixture.policy);
    const authority = createNativePegInVerifierExecutionAuthority({
      packet,
      executionPolicy: policy,
      runtimeDependencyManifest: fixture.manifests.verifier,
      launcherPath: fixture.launcherPath,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
    });
    packet.statement.profileId = 'mutated-profile';
    policy.validity.policyEpoch = 99;
    const result = await authority.execute({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    });
    const callerBytes = result.stdout;
    callerBytes.fill(0);

    expect(result.stdout).toEqual(Buffer.from('verified-output'));
    expect(authorityMocks.verifyReviewed.mock.calls[0][0].packet.statement.profileId)
      .toBe(fixture.packet.statement.profileId);
    expect(authorityMocks.runContained.mock.calls[0][0].authority.policyEpoch).toBe(1);
    expect(() => assertNativePegInVerifierExecutionAuthorityProvenance({
      execute: vi.fn(),
    })).toThrow(/provenance/i);
    expect(() => assertNativePegInVerifierExecutionAuthorityResultProvenance({
      authority,
      result: { stdout: Buffer.from('forged') },
    })).toThrow(/provenance/i);
  });

  it('loads only an exact peg-in authority package without runtime trust-root overrides', () => {
    expect(loadNativePegInVerifierExecutionAuthorityFromEnvironment({})).toBeNull();
    const packageValue = {
      schema: NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
      packet: fixture.packet,
      executionPolicy: fixture.policy,
      runtimeDependencyManifest: fixture.manifests.verifier,
      launcherPath: fixture.launcherPath,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
    };
    expect(parseNativePegInVerifierExecutionAuthorityPackage(packageValue))
      .toEqual(packageValue);
    const loaded = loadNativePegInVerifierExecutionAuthorityFromEnvironment({
      [NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV]:
        JSON.stringify(packageValue),
    });
    assertNativePegInVerifierExecutionAuthorityProvenance(loaded);
    expect(() => parseNativePegInVerifierExecutionAuthorityPackage({
      ...packageValue,
      attestorLock: { profiles: [] },
    })).toThrow(/unexpected field/i);
  });
});

function createAuthority() {
  return createNativePegInVerifierExecutionAuthority({
    packet: fixture.packet,
    executionPolicy: fixture.policy,
    runtimeDependencyManifest: fixture.manifests.verifier,
    launcherPath: fixture.launcherPath,
    verifierExecutablePath: fixture.verifierPath,
    codecExecutablePath: fixture.codecPath,
  });
}

function configureAuthorityMocks(): void {
  const reviewedProfile = structuredClone(fixture.profile);
  reviewedProfile.boundary.reviewedTrustRootsLoaded = true;
  authorityMocks.reviewedProfile = reviewedProfile;
  authorityMocks.policyReport = {
    executionPolicySha256:
      deriveNativePegInVerifierExecutionPolicySha256(fixture.policy),
    boundary: {
      reviewedTrustRootsLoaded: true,
    },
  };
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
