import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const authorityMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));

vi.mock(
  './native-peg-in-runtime-identity-v2-execution-authority.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-peg-in-runtime-identity-v2-execution-authority.js'
      )
    >();
    return {
      ...actual,
      assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance:
        authorityMocks.assertAuthority,
      assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance:
        authorityMocks.assertResult,
    };
  },
);

import {
  AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA,
  AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_STATUS,
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance,
  createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import type {
  NativePegInRuntimeIdentityV2ExecutionAuthority,
  NativePegInRuntimeIdentityV2ExecutionAuthorityResult,
} from './native-peg-in-runtime-identity-v2-execution-authority.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/native-finalized-peg-in-runtime-identity-v2.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  trustedAnchorDigestHex: string;
  membership: { request: unknown; expected: unknown };
};

let request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
  vector.membership.request,
);

beforeEach(() => {
  request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
    vector.membership.request,
  );
  vi.clearAllMocks();
});

describe('authority-bound native runtime identity V2 candidate evaluation', () => {
  it('quarantines structurally bound child output without claiming proof or execution identity', async () => {
    const authority = fakeAuthority();
    const evaluator =
      createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator(
        authority,
      );
    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request,
    });

    expect(candidate.schema).toBe(
      AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA,
    );
    expect(candidate.status).toBe(
      AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_STATUS,
    );
    const childOutputBytes = Buffer.from(
      JSON.stringify(vector.membership.expected),
      'utf8',
    );
    expect(candidate.quarantinedChildOutput).toEqual({
      sha256Hex: createHash('sha256')
        .update(childOutputBytes)
        .digest('hex'),
      sizeBytes: String(childOutputBytes.length),
      contentExposed: false,
      proofClaimsAccepted: false,
    });
    expect(findTruePaths(candidate.quarantinedChildOutput)).toEqual([]);
    expect(candidate.runtimeBuild).toEqual({
      profileId: 'frontier-runtime-build-v1',
      attestationId: request.statement.runtimeCode.buildAttestationId,
      packetSha256Hex:
        request.statement.runtimeCode.buildAttestationSha256Hex,
      runtimeCodeSha256Hex:
        request.statement.runtimeCode.artifactSha256Hex,
      runtimeCodeSizeBytes:
        request.statement.runtimeCode.artifactSizeBytes,
      attestationVerified: true,
    });
    expect(candidate.boundary).toEqual({
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeBuildAttestationVerified: true,
      nativeVerifierAttestationVerified: true,
      immutableLauncherInstallationRequired: true,
      authorityRecordV2Required: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      targetRuntimeBuildEvidenceMatched: false,
      targetRuntimeBuildIdentityVerified: false,
      targetStateCodeIsHistoricalProducerCode: false,
      runtimeUpgradeHistoryVerified: false,
      cutoverPolicyVerified: false,
      runtimeCodeIdentityVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(authority.execute).toHaveBeenCalledWith({
      operation: 'verify-peg-in-runtime-identity-v2',
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.boundary)).toBe(true);
    expect(() =>
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
        evaluator,
        candidate,
        expectedRequestDigestHex:
          deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
            request,
          ),
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
        evaluator,
        candidate: structuredClone(candidate),
        expectedRequestDigestHex:
          deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
            request,
          ),
      }),
    ).toThrow(/provenance/i);
  });

  it.each([
    ['runtime digest', (candidate: typeof request) => {
      (candidate.statement.runtimeCode as { artifactSha256Hex: string })
        .artifactSha256Hex = `0x${'ab'.repeat(32)}`;
    }],
    ['runtime size', (candidate: typeof request) => {
      (candidate.statement.runtimeCode as { artifactSizeBytes: string })
        .artifactSizeBytes = '1';
    }],
    ['attestation ID', (candidate: typeof request) => {
      (candidate.statement.runtimeCode as { buildAttestationId: string })
        .buildAttestationId = 'other-build';
    }],
    ['attestation packet digest', (candidate: typeof request) => {
      (candidate.statement.runtimeCode as {
        buildAttestationSha256Hex: string;
      }).buildAttestationSha256Hex = `0x${'bc'.repeat(32)}`;
    }],
  ])('rejects request %s drift before native execution', async (_label, mutate) => {
    const authority = fakeAuthority();
    const evaluator =
      createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator(
        authority,
      );
    const candidate = structuredClone(request);
    mutate(candidate);
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: candidate,
    })).rejects.toThrow(/reviewed runtime build attestation/i);
    expect(authority.execute).not.toHaveBeenCalled();
  });

  it('rejects an execution result that drifts from the authority declaration', async () => {
    const authority = fakeAuthority({
      nativeVerifierAttestationId: 'other-native-attestation',
    });
    const evaluator =
      createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator(
        authority,
      );
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request,
    })).rejects.toThrow(/declaration/i);
  });

  it.each([
    ['launcher atomicity', {
      launcherAtomicBootstrapProven: true,
    }],
    ['launcher activation campaign', {
      launcherInstallationActivationCampaignCompleted: true,
    }],
    ['target runtime identity', {
      targetRuntimeBuildIdentityVerified: true,
    }],
  ])('rejects a result that promotes the %s boundary', async (
    _label,
    boundaryOverrides,
  ) => {
    const authority = fakeAuthority({}, boundaryOverrides);
    const evaluator =
      createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator(
        authority,
      );
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request,
    })).rejects.toThrow(/fail-closed boundary/i);
  });

  it('keeps the target-build result outside daemon and reconciliation authority', () => {
    for (const sourceName of [
      'relayer-daemon.ts',
      'peg-in-runtime-reconciliation.ts',
    ]) {
      const source = readFileSync(
        new URL(`./${sourceName}`, import.meta.url),
        'utf8',
      );
      expect(source).not.toContain(
        'collectNativeFinalizedPegInRuntimeIdentityV2Candidate',
      );
      expect(source).not.toContain(
        'createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator',
      );
      expect(source).not.toContain(
        'targetRuntimeBuildIdentityVerified',
      );
      expect(source).not.toContain(
        'targetRuntimeBuildEvidenceMatched',
      );
    }
  });
});

function findTruePaths(
  value: unknown,
  path = '$',
): string[] {
  if (value === true) {
    return [path];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findTruePaths(entry, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    findTruePaths(entry, `${path}.${key}`));
}

function fakeAuthority(
  resultOverrides: Partial<
    NativePegInRuntimeIdentityV2ExecutionAuthorityResult
  > = {},
  boundaryOverrides: Record<string, boolean> = {},
): NativePegInRuntimeIdentityV2ExecutionAuthority & {
  execute: ReturnType<typeof vi.fn>;
} {
  const runtimeCode = request.statement.runtimeCode;
  const executionPolicySha256 = 'cd'.repeat(32);
  const declaration = {
    runtimeBuildProfileId: 'frontier-runtime-build-v1',
    runtimeBuildAttestationId: runtimeCode.buildAttestationId,
    runtimeBuildPacketSha256Hex: runtimeCode.buildAttestationSha256Hex,
    nativeVerifierProfileId: 'native-runtime-identity-v2-win32-x64-v1',
    nativeVerifierAttestationId: 'native-v2-review-01',
    jointAuthorityProfileDigestHex: `0x${'ac'.repeat(32)}`,
    policyId: 'native-runtime-identity-v2-policy-01',
    executionPolicySha256,
    policyEpoch: 1,
    launcherPath: 'C:\\trusted\\bridge-contained-launcher.exe',
    runtimeCodePath: 'C:\\trusted\\frontier-runtime.compact.wasm',
    verifierExecutablePath:
      'C:\\trusted\\bridge-runtime-identity-v2-verifier.exe',
    runtimeCodeSha256Hex: runtimeCode.artifactSha256Hex,
    runtimeCodeSizeBytes: Number(runtimeCode.artifactSizeBytes),
    verifierExecutableSha256Hex: `0x${'ef'.repeat(32)}`,
  };
  const execute = vi.fn(async () => ({
    stdout: Buffer.from(JSON.stringify(vector.membership.expected), 'utf8'),
    runtimeBuildProfileId: declaration.runtimeBuildProfileId,
    runtimeBuildAttestationId: declaration.runtimeBuildAttestationId,
    runtimeBuildPacketSha256Hex:
      declaration.runtimeBuildPacketSha256Hex,
    nativeVerifierProfileId: declaration.nativeVerifierProfileId,
    nativeVerifierAttestationId:
      declaration.nativeVerifierAttestationId,
    jointAuthorityProfileDigestHex:
      declaration.jointAuthorityProfileDigestHex,
    policyId: declaration.policyId,
    executionPolicySha256,
    policyEpoch: 1,
    operation: 'verify-peg-in-runtime-identity-v2' as const,
    boundary: {
      sourceOwnedRuntimeBuildAttestorLockReloaded: true as const,
      sourceOwnedNativeVerifierAttestorLockReloaded: true as const,
      sourceOwnedAttestorLocksRevalidatedAfterExecution: true as const,
      reviewedTrustRootsRequired: true as const,
      exactJointPolicyValidatedAfterReload: true as const,
      exactJointPolicyRevalidatedAfterExecution: true as const,
      brokerAuthorityModeRequested: true as const,
      containedProofExecutionOnly: true as const,
      directProcessAllowed: false as const,
      runtimeBuildAttestationVerified: true as const,
      nativeVerifierAttestationVerified: true as const,
      immutableLauncherInstallationRequired: true as const,
      authorityRecordV2Required: true as const,
      launcherInstallationActivationCampaignCompleted: false as const,
      launcherAtomicBootstrapProven: false as const,
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
      ...boundaryOverrides,
    },
    ...resultOverrides,
  } as NativePegInRuntimeIdentityV2ExecutionAuthorityResult));
  return {
    declaration,
    execute,
  };
}
