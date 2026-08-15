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

vi.mock('./native-verifier-execution-policy.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-verifier-execution-policy.js')
  >();
  return {
    ...actual,
    validateNativeVerifierExecutionPolicyAgainstProfile:
      authorityMocks.validatePolicy,
    assertNativeVerifierExecutionPolicyValidationProvenance:
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
  assertNativeVerifierExecutionAuthorityProvenance,
  assertNativeVerifierExecutionAuthorityResultProvenance,
  createNativeVerifierExecutionAuthority,
  deriveNativeVerifierAuthorityProfileDigestHex,
  loadNativeVerifierExecutionAuthorityFromEnvironment,
  NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV,
  NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
  parseNativeVerifierExecutionAuthorityPackage,
} from './native-verifier-execution-authority.js';
import {
  deriveNativeVerifierExecutionPolicySha256,
} from './native-verifier-execution-policy.js';
import {
  createNativeVerifierAttestationExecutionFixture,
  type NativeVerifierAttestationExecutionFixture,
} from './native-verifier-attestation-fixture.test-helper.js';

let fixture: NativeVerifierAttestationExecutionFixture;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-12T12:00:00.000Z'));
  fixture = createNativeVerifierAttestationExecutionFixture();
  const reviewedProfile = structuredClone(fixture.profile);
  reviewedProfile.boundary.reviewedTrustRootsLoaded = true;
  authorityMocks.reviewedProfile = reviewedProfile;
  authorityMocks.policyReport = {
    executionPolicySha256: deriveNativeVerifierExecutionPolicySha256(fixture.policy),
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

describe('native verifier execution authority', () => {
  it('reloads reviewed roots and revalidates the signed policy before every broker launch', async () => {
    const authority = createAuthority();
    const verifier = await authority.execute({
      operation: 'verify-checkpoint',
      trustedAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      requestBytes: Buffer.from('checkpoint-request'),
    });
    const codec = await authority.execute({
      operation: 'encode-headers',
      requestBytes: Buffer.from('codec-request'),
    });

    expect(authorityMocks.verifyReviewed).toHaveBeenCalledTimes(5);
    expect(authorityMocks.validatePolicy).toHaveBeenCalledTimes(5);
    expect(authorityMocks.validatePolicy.mock.calls.map(call => call[0].evaluatedAt))
      .toEqual([
        '2026-07-12T12:00:00.000Z',
        '2026-07-12T12:00:00.000Z',
        '2026-07-12T12:00:00.000Z',
        '2026-07-12T12:00:00.000Z',
        '2026-07-12T12:00:00.000Z',
      ]);
    expect(authorityMocks.runContained).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetPath: fixture.verifierPath,
      targetArgs: ['--trusted-anchor-digest', `0x${'ab'.repeat(32)}`],
      authority: {
        profileDigestHex: deriveNativeVerifierAuthorityProfileDigestHex(
          fixture.policy.profileId,
        ),
        policyDigestHex: `0x${deriveNativeVerifierExecutionPolicySha256(fixture.policy)}`,
        policyEpoch: 1,
        allowedSystemDlls: ['kernel32.dll'],
      },
    }));
    expect(authorityMocks.runContained).toHaveBeenNthCalledWith(2, expect.objectContaining({
      targetPath: fixture.codecPath,
      targetArgs: ['--encode-headers'],
    }));
    expect(verifier.boundary).toEqual({
      sourceOwnedAttestorLockReloaded: true,
      sourceOwnedAttestorLockRevalidatedAfterExecution: true,
      reviewedTrustRootsRequired: true,
      exactPolicyValidatedAfterReload: true,
      exactPolicyRevalidatedAfterExecution: true,
      brokerAuthorityModeRequested: true,
      directProcessAllowed: false,
      executionAdmissionGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(codec.operation).toBe('encode-headers');
    expect(authority.declaration.policyEpoch).toBe(1);
    assertNativeVerifierExecutionAuthorityProvenance(authority);
    assertNativeVerifierExecutionAuthorityResultProvenance({
      authority,
      result: verifier,
    });
  });

  it('fails closed when a supplied-root report is returned instead of reviewed provenance', () => {
    authorityMocks.reviewedProfile = fixture.profile;
    expect(() => createAuthority()).toThrow(/source-reviewed trust roots/i);
    expect(authorityMocks.validatePolicy).not.toHaveBeenCalled();
    expect(authorityMocks.runContained).not.toHaveBeenCalled();
  });

  it('observes source-lock revocation after authority construction and before the next launch', async () => {
    const authority = createAuthority();
    await authority.execute({
      operation: 'inspect-warp-proof',
      requestBytes: Buffer.from('first'),
    });
    authorityMocks.verifyReviewed.mockImplementation(() => {
      throw new Error('native verifier attestation has no active attestor profile');
    });

    await expect(authority.execute({
      operation: 'inspect-warp-proof',
      requestBytes: Buffer.from('second'),
    })).rejects.toThrow(/no active attestor profile/i);
    expect(authorityMocks.runContained).toHaveBeenCalledTimes(1);
  });

  it('rejects broker output when the source lock is revoked during execution', async () => {
    const authority = createAuthority();
    authorityMocks.runContained.mockImplementationOnce(async () => {
      authorityMocks.verifyReviewed.mockImplementation(() => {
        throw new Error('native verifier attestation has no active attestor profile');
      });
      return containedResult(Buffer.from('untrusted-after-revocation'));
    });

    await expect(authority.execute({
      operation: 'inspect-finality-proof',
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/no active attestor profile/i);
    expect(authorityMocks.runContained).toHaveBeenCalledTimes(1);
  });

  it('returns stdout snapshots that cannot mutate the branded authority result', async () => {
    const authority = createAuthority();
    const result = await authority.execute({
      operation: 'encode-headers',
      requestBytes: Buffer.from('request'),
    });

    const callerBytes = result.stdout;
    callerBytes.fill(0);
    expect(result.stdout).toEqual(Buffer.from('verified-output'));
    assertNativeVerifierExecutionAuthorityResultProvenance({ authority, result });
  });

  it('captures packet and policy bytes at construction rather than accepting later mutation', async () => {
    const packet = structuredClone(fixture.packet);
    const policy = structuredClone(fixture.policy);
    const authority = createNativeVerifierExecutionAuthority({
      packet,
      executionPolicy: policy,
      runtimeDependencyManifests: fixture.manifests,
      launcherPath: fixture.launcherPath,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
    });
    packet.statement.profileId = 'mutated-profile';
    policy.validity.policyEpoch = 999;

    await authority.execute({
      operation: 'encode-headers',
      requestBytes: Buffer.from('request'),
    });
    expect(authorityMocks.verifyReviewed.mock.calls[0][0].packet.statement.profileId)
      .toBe(fixture.packet.statement.profileId);
    expect(authorityMocks.runContained.mock.calls[0][0].authority.policyEpoch).toBe(1);
  });

  it('rejects unsupported operations, malformed anchor digests, and weakened broker boundaries', async () => {
    const authority = createAuthority();
    await expect(authority.execute({
      operation: 'verify-checkpoint',
      trustedAnchorDigestHex: `0x${'AB'.repeat(32)}`,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/lowercase.*32-byte digest/i);
    await expect(authority.execute({
      operation: 'unknown' as 'encode-headers',
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/operation is unsupported/i);

    authorityMocks.runContained.mockResolvedValue({
      ...containedResult(Buffer.from('output')),
      boundary: {
        ...containedResult(Buffer.from('output')).boundary,
        executionAdmissionGranted: true,
      },
    });
    await expect(authority.execute({
      operation: 'encode-headers',
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
      operation: 'encode-headers',
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow(/broker boundary is invalid/i);
  });

  it('does not accept forged authority objects or results as process provenance', () => {
    expect(() => assertNativeVerifierExecutionAuthorityProvenance({
      execute: vi.fn(),
    })).toThrow(/authority provenance is missing/i);
    const authority = createAuthority();
    expect(() => assertNativeVerifierExecutionAuthorityResultProvenance({
      authority,
      result: { stdout: Buffer.from('forged') },
    })).toThrow(/result provenance is missing/i);
  });

  it('loads only an exact public execution package and no runtime trust-root override', () => {
    expect(loadNativeVerifierExecutionAuthorityFromEnvironment({})).toBeNull();
    const packageValue = {
      schema: NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
      packet: fixture.packet,
      executionPolicy: fixture.policy,
      runtimeDependencyManifests: fixture.manifests,
      launcherPath: fixture.launcherPath,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
    };
    expect(parseNativeVerifierExecutionAuthorityPackage(packageValue))
      .toEqual(packageValue);
    const loaded = loadNativeVerifierExecutionAuthorityFromEnvironment({
      [NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV]: JSON.stringify(packageValue),
    });
    assertNativeVerifierExecutionAuthorityProvenance(loaded);
    expect(() => parseNativeVerifierExecutionAuthorityPackage({
      ...packageValue,
      attestorLock: { profiles: [] },
    })).toThrow(/unexpected field/i);
    expect(() => loadNativeVerifierExecutionAuthorityFromEnvironment({
      [NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV]: '{not-json}',
    })).toThrow(/not valid JSON/i);
  });
});

function createAuthority() {
  return createNativeVerifierExecutionAuthority({
    packet: fixture.packet,
    executionPolicy: fixture.policy,
    runtimeDependencyManifests: fixture.manifests,
    launcherPath: fixture.launcherPath,
    verifierExecutablePath: fixture.verifierPath,
    codecExecutablePath: fixture.codecPath,
  });
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
