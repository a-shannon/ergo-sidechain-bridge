import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorityBoundFinalizedRuntimeHistory,
} from './authority-bound-finalized-runtime-history.js';
import type {
  PegInRuntimeInvariantReviewReportV1,
  ReviewedPegInRuntimeInvariantProfileV1,
} from './peg-in-runtime-invariant-profile-v1.js';
import type {
  PegInRuntimeCodeIdentityV2,
} from './peg-in-runtime-identity-v2.js';

const provenance = vi.hoisted(() => ({
  histories: new WeakSet<object>(),
  validatedProfiles: new WeakSet<object>(),
  reviewedProfiles: new WeakSet<object>(),
}));

vi.mock('./authority-bound-finalized-runtime-history.js', async () => {
  const actual = await vi.importActual<
    typeof import('./authority-bound-finalized-runtime-history.js')
  >('./authority-bound-finalized-runtime-history.js');
  return {
    ...actual,
    assertAuthorityBoundFinalizedRuntimeHistoryProvenance(value: unknown) {
      if (
        !value
        || typeof value !== 'object'
        || !provenance.histories.has(value)
      ) {
        throw new Error(
          'authority-bound finalized runtime history provenance is missing',
        );
      }
    },
  };
});

vi.mock('./peg-in-runtime-invariant-profile-v1.js', async () => {
  const actual = await vi.importActual<
    typeof import('./peg-in-runtime-invariant-profile-v1.js')
  >('./peg-in-runtime-invariant-profile-v1.js');
  return {
    ...actual,
    assertPegInRuntimeInvariantReviewValidationProvenanceV1(value: unknown) {
      if (
        !value
        || typeof value !== 'object'
        || !provenance.validatedProfiles.has(value)
      ) {
        throw new Error(
          'peg-in runtime invariant review validation provenance is missing',
        );
      }
    },
    assertReviewedPegInRuntimeInvariantProfileProvenanceV1(value: unknown) {
      if (
        !value
        || typeof value !== 'object'
        || !provenance.reviewedProfiles.has(value)
      ) {
        throw new Error(
          'reviewed peg-in runtime invariant profile provenance is missing',
        );
      }
    },
  };
});

import {
  assertAuthorityBoundFinalizedRuntimeInvariantReviewCandidateProvenance,
  assertAuthorityBoundFinalizedRuntimeInvariantReviewProvenance,
  createAuthorityBoundFinalizedRuntimeInvariantReview,
  createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate,
} from './authority-bound-finalized-runtime-invariant-review.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

describe('authority-bound finalized runtime invariant review', () => {
  it('binds A -> B -> A history to one exact review per distinct runtime', () => {
    const runtimeA = runtime('11', 'a1');
    const runtimeB = runtime('22', 'b1');
    const history = reviewedHistory(
      [
        ['100', runtimeA],
        ['101', runtimeB],
        ['102', runtimeA],
      ],
      runtimeB,
    );
    const profileA = reviewedProfile(runtimeA, 'a');
    const profileB = reviewedProfile(runtimeB, 'b');

    const candidate =
      createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA, profileB],
    });

    expect(candidate).toMatchObject({
      schema:
        'e2s.authority-bound-finalized-runtime-invariant-review-candidate.v2',
      status: 'BOUND_QUARANTINED_RUNTIME_INVARIANT_REVIEW_CANDIDATE',
      historyDigestHex: history.historyDigestHex,
      distinctRuntimeCount: 2,
      executionProducerRuntimeArtifactSha256Hex:
        runtimeB.artifactSha256Hex,
      everyProfileUsesCanonicalSourceOwnedReviewerRoots: false,
      boundary: {
        everyDistinctRuntimeExpectationBoundExactlyOnce: true,
        executionProducerRuntimeBound: true,
        changeAndRevertRangesPreserved: true,
        nativeAndExecutionBlockIdentitiesSeparated: true,
        executionBlockHashMappedToNativeState: false,
        nativePostExecutionRecordSeparatedFromEvmReplayGuard: true,
        directTokenMintEntrypointRequiredInEveryProfile: true,
        sourceReviewDoesNotProveDeployedState: true,
        runtimeUpgradeHistoryVerified: false,
        runtimeInvariantReviewsAcceptedForMint: false,
        deployedTokenOwnershipVerified: false,
        wholeBlockCallbackRollbackVerified: false,
        reproducibleSolidityBuildClosureVerified: false,
        historicalMintAbsenceVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        admissionEligible: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(candidate.interval).toEqual(history.interval);
    expect(candidate.interval.executionNativeBlockHashHex).not.toBe(
      candidate.interval.executionBlockHashHex,
    );
    expect(candidate.bindings).toHaveLength(2);
    expect(candidate.bindings[0]).toMatchObject({
      runtime: runtimeA,
      postStateObservationCount: 2,
      reentryCount: 1,
      isExecutionProducerRuntime: false,
      postStateRanges: [
        {
          fromPostStateHeight: '100',
          toPostStateHeight: '100',
          stateCount: 1,
        },
        {
          fromPostStateHeight: '102',
          toPostStateHeight: '102',
          stateCount: 1,
        },
      ],
    });
    expect(candidate.bindings[1]).toMatchObject({
      runtime: runtimeB,
      postStateObservationCount: 1,
      reentryCount: 0,
      isExecutionProducerRuntime: true,
      postStateRanges: [{
        fromPostStateHeight: '101',
        toPostStateHeight: '101',
        stateCount: 1,
      }],
    });
    expect(candidate.candidateDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.bindings)).toBe(true);
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeInvariantReviewCandidateProvenance(
        candidate,
      ),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeInvariantReviewProvenance(candidate),
    ).toThrow(/provenance is missing/i);
  });

  it('preserves contiguous ranges and canonical source-owned reviewer status', () => {
    const runtimeA = runtime('31', 'c1');
    const runtimeB = runtime('32', 'c2');
    const history = reviewedHistory(
      [
        ['200', runtimeA],
        ['201', runtimeA],
        ['202', runtimeB],
        ['203', runtimeB],
      ],
      runtimeB,
    );
    const candidate = createAuthorityBoundFinalizedRuntimeInvariantReview({
      history,
      profiles: [
        reviewedProfile(runtimeA, 'c', true, true),
        reviewedProfile(runtimeB, 'd', true, true),
      ],
    });

    expect(candidate.everyProfileUsesCanonicalSourceOwnedReviewerRoots)
      .toBe(true);
    expect(candidate.bindings[0]!.postStateRanges).toEqual([{
      fromPostStateHeight: '200',
      toPostStateHeight: '201',
      stateCount: 2,
    }]);
    expect(candidate.bindings[1]!.postStateRanges).toEqual([{
      fromPostStateHeight: '202',
      toPostStateHeight: '203',
      stateCount: 2,
    }]);
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeInvariantReviewProvenance(candidate),
    ).not.toThrow();
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeInvariantReviewCandidateProvenance(
        candidate,
      ),
    ).toThrow(/candidate provenance is missing/i);
  });

  it('does not promote supplied-policy validation into canonical provenance', () => {
    const runtimeA = runtime('33', 'c3');
    const history = reviewedHistory([['210', runtimeA]], runtimeA);
    const profile = reviewedProfile(runtimeA, 'synthetic');

    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReview({
      history,
      profiles: [
        profile as unknown as ReviewedPegInRuntimeInvariantProfileV1,
      ],
    })).toThrow(/reviewed.*provenance is missing/i);
  });

  it('snapshots caller-owned references before provenance validation', () => {
    const runtimeA = runtime('34', 'c4');
    const history = reviewedHistory([['220', runtimeA]], runtimeA);
    const canonical = reviewedProfile(runtimeA, 'canonical', true, true);
    const synthetic = reviewedProfile(runtimeA, 'synthetic-swap');
    let canonicalHistoryReads = 0;
    let canonicalProfileReads = 0;
    const canonicalInput = {
      get history() {
        canonicalHistoryReads += 1;
        return history;
      },
      get profiles() {
        canonicalProfileReads += 1;
        return canonicalProfileReads === 1
          ? [canonical]
          : [synthetic];
      },
    } as unknown as Parameters<
      typeof createAuthorityBoundFinalizedRuntimeInvariantReview
    >[0];

    const review =
      createAuthorityBoundFinalizedRuntimeInvariantReview(canonicalInput);
    expect(review.bindings[0]!.reviewId).toBe(canonical.reviewId);
    expect(canonicalHistoryReads).toBe(1);
    expect(canonicalProfileReads).toBe(1);

    const firstCandidate = reviewedProfile(runtimeA, 'candidate-first');
    const swappedCandidate = reviewedProfile(runtimeA, 'candidate-swapped');
    let candidateProfileReads = 0;
    const candidateInput = {
      history,
      get profiles() {
        candidateProfileReads += 1;
        return candidateProfileReads === 1
          ? [firstCandidate]
          : [swappedCandidate];
      },
    };
    const candidate =
      createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate(
        candidateInput,
      );
    expect(candidate.bindings[0]!.reviewId).toBe(firstCandidate.reviewId);
    expect(candidateProfileReads).toBe(1);
  });

  it('rejects missing, extra, and duplicate runtime profiles', () => {
    const runtimeA = runtime('41', 'd1');
    const runtimeB = runtime('42', 'd2');
    const runtimeC = runtime('43', 'd3');
    const history = reviewedHistory(
      [['300', runtimeA], ['301', runtimeB]],
      runtimeA,
    );
    const profileA = reviewedProfile(runtimeA, 'e');
    const profileB = reviewedProfile(runtimeB, 'f');
    const profileC = reviewedProfile(runtimeC, 'g');

    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA],
    })).toThrow(/exactly cover every distinct runtime expectation/i);
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA, profileB, profileC],
    })).toThrow(/exactly cover every distinct runtime expectation/i);
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA, profileB, reviewedProfile(runtimeA, 'h')],
    })).toThrow(/must not duplicate a runtime artifact/i);
  });

  it('rejects runtime size and build-attestation identity drift', () => {
    const runtimeA = runtime('51', 'e1');
    const history = reviewedHistory(
      [['400', runtimeA], ['401', runtimeA]],
      runtimeA,
    );
    for (const mutation of [
      { artifactSizeBytes: '999' },
      { buildAttestationId: 'different-build' },
      { buildAttestationSha256Hex: hex('ff') },
    ]) {
      const profile = reviewedProfile(runtimeA, `drift-${Object.keys(mutation)[0]}`);
      Object.assign(profile.runtime, mutation);
      expect(() =>
        createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
        history,
        profiles: [profile],
      })).toThrow(/does not match the exact runtime\/build identity/i);
    }
  });

  it('rejects mixed reviewer policies and reused review identities', () => {
    const runtimeA = runtime('61', 'f1');
    const runtimeB = runtime('62', 'f2');
    const history = reviewedHistory(
      [['500', runtimeA], ['501', runtimeB]],
      runtimeA,
    );
    const profileA = reviewedProfile(runtimeA, 'i');
    const profileB = reviewedProfile(runtimeB, 'j') as any;
    profileB.reviewerPolicyDigestHex = hex('ab');
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA, profileB],
    })).toThrow(/one reviewer policy digest/i);

    const reused = reviewedProfile(runtimeB, 'k') as any;
    reused.reviewId = profileA.reviewId;
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [profileA, reused],
    })).toThrow(/unique packet and review identities/i);
  });

  it('rejects an execution producer runtime outside the expectation interval', () => {
    const runtimeA = runtime('71', 'a7');
    const runtimeB = runtime('72', 'b7');
    const history = reviewedHistory(
      [['600', runtimeA], ['601', runtimeA]],
      runtimeB,
    );
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [reviewedProfile(runtimeA, 'l')],
    })).toThrow(/producer runtime is outside/i);
  });

  it('rejects cloned or unprovenanced histories and profiles', () => {
    const runtimeA = runtime('81', 'a8');
    const history = reviewedHistory(
      [['700', runtimeA], ['701', runtimeA]],
      runtimeA,
    );
    const profile = reviewedProfile(runtimeA, 'm');
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history: structuredClone(history),
      profiles: [profile],
    })).toThrow(/history provenance is missing/i);
    expect(() => createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [structuredClone(profile)],
    })).toThrow(/review validation provenance is missing/i);
  });

  it('rejects cloned output provenance and does not import lifecycle consumers', () => {
    const runtimeA = runtime('91', 'a9');
    const history = reviewedHistory(
      [['800', runtimeA], ['801', runtimeA]],
      runtimeA,
    );
    const candidate =
      createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate({
      history,
      profiles: [reviewedProfile(runtimeA, 'n')],
    });
    expect(() =>
      assertAuthorityBoundFinalizedRuntimeInvariantReviewProvenance(
        structuredClone(candidate),
      ),
    ).toThrow(/provenance is missing/i);

    const source = readFileSync(
      resolve(
        MODULE_DIRECTORY,
        'authority-bound-finalized-runtime-invariant-review.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/relayer-daemon|reconciliation/i);
  });
});

function reviewedHistory(
  states: readonly (readonly [string, PegInRuntimeCodeIdentityV2])[],
  expectedProducerRuntime: PegInRuntimeCodeIdentityV2,
): AuthorityBoundFinalizedRuntimeHistory {
  const history = {
    schema:
      'e2s.authority-bound-finalized-runtime-history-expectation-candidate.v2',
    status: 'BOUND_QUARANTINED_COMPLETE_INTERVAL_EXPECTATION_CANDIDATE',
    historyDigestHex: hex('01'),
    trustAnchorDigestHex: hex('02'),
    sidechainIdHex: hex('03'),
    ergoBoxIdHex: hex('04'),
    interval: {
      semantics: 'inclusive-post-state',
      startCheckpointHashHex: hex('05'),
      startCheckpointHeight: states[0]![0],
      executionNativeBlockHashHex: hex('07'),
      executionBlockHashHex: hex('06'),
      executionBlockHeight: states.at(-1)![0],
    },
    states: states.map(([nativeHeight, expectedRuntimeCode], index) => ({
      nativeHeight,
      nativeBlockHashHex: hex((10 + index).toString(16).padStart(2, '0')),
      expectedRuntimeCode,
    })),
    expectedProducerRuntime,
  } as unknown as AuthorityBoundFinalizedRuntimeHistory;
  provenance.histories.add(history);
  return history;
}

function reviewedProfile(
  runtimeIdentity: PegInRuntimeCodeIdentityV2,
  suffix: string,
  canonicalRoots: boolean,
  canonicalProvenance: true,
): ReviewedPegInRuntimeInvariantProfileV1;
function reviewedProfile(
  runtimeIdentity: PegInRuntimeCodeIdentityV2,
  suffix: string,
  canonicalRoots?: boolean,
  canonicalProvenance?: false,
): PegInRuntimeInvariantReviewReportV1;
function reviewedProfile(
  runtimeIdentity: PegInRuntimeCodeIdentityV2,
  suffix: string,
  canonicalRoots = false,
  canonicalProvenance = false,
): PegInRuntimeInvariantReviewReportV1 {
  const profile = {
    schema: 'e2s.peg-in-runtime-invariant-review-report.v1',
    status: 'VALIDATED_NON_AUTHORIZING_RUNTIME_INVARIANT_REVIEW',
    profileId: `profile-${suffix}`,
    reviewId: `review-${suffix}`,
    reviewPacketSha256Hex: digestFor(`packet-${suffix}`),
    statementDigestHex: digestFor(`statement-${suffix}`),
    reviewerPolicyDigestHex: hex('99'),
    runtime: {
      artifactSha256Hex: runtimeIdentity.artifactSha256Hex,
      artifactSizeBytes: runtimeIdentity.artifactSizeBytes,
      buildAttestationId: runtimeIdentity.buildAttestationId,
      buildAttestationSha256Hex:
        runtimeIdentity.buildAttestationSha256Hex,
    },
    source: sourceBinding(suffix.charCodeAt(0)),
    reviewer: {
      keyIdHex: digestFor(`reviewer-${suffix}`).slice(2),
      organizationId: `reviewer-org-${suffix}`,
    },
    semanticBindings: {
      nativeRecordIsPostExecutionEvidence: true,
      evmReplayWritePrecedesExternalTokenMint: true,
      failedMintRollsBackEvmReplayWriteAndEvent: true,
      directTokenMintEntrypointEnumerated: true,
      ownershipMutationEntrypointsEnumerated: true,
      deployedTokenOwnershipRemainsExternalEvidence: true,
      eventAloneDoesNotProveTokenMint: true,
      wholeBlockCallbackRollbackRemainsExternalEvidence: true,
      reproducibleSolidityBuildClosureRemainsExternalEvidence: true,
    },
    boundary: {
      relativeToSuppliedPolicy: true,
      canonicalSourceOwnedReviewerRootsLoaded: canonicalRoots,
      exactSourceBindingApprovedByPolicy: true,
      currentRepositorySourceBytesVerifiedByThisValidator: false,
      reviewerSignatureVerified: true,
      organizationalIndependenceCryptographicallyProven: false,
      deployedBridgeCodeVerified: false,
      deployedTokenCodeVerified: false,
      deployedTokenOwnershipVerified: false,
      completeHistoricalTokenOwnershipVerified: false,
      wholeBlockCallbackRollbackVerified: false,
      reproducibleSolidityBuildClosureVerified: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeUpgradeHistoryVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  } as PegInRuntimeInvariantReviewReportV1;
  provenance.validatedProfiles.add(profile);
  if (canonicalProvenance) {
    provenance.reviewedProfiles.add(profile);
  }
  return profile;
}

function runtime(
  artifactByte: string,
  attestationByte: string,
): PegInRuntimeCodeIdentityV2 {
  return {
    storageKeyHex: '0x3a636f6465',
    artifactSha256Hex: hex(artifactByte),
    artifactSizeBytes: '1048576',
    buildAttestationId: `runtime-build-${artifactByte}`,
    buildAttestationSha256Hex: hex(attestationByte),
  };
}

function sourceBinding(seed: number) {
  const byte = (seed % 255).toString(16).padStart(2, '0');
  const next = ((seed + 1) % 255).toString(16).padStart(2, '0');
  return {
    consensusSourceLockSha256Hex: hex(byte),
    frontierCommitHex: next.repeat(20),
    frontierPatchSha256Hex: hex(next),
    runtimeSourceManifestSha256Hex: hex(byte),
    ergoBridgeSourceSha256Hex: hex(next),
    ergoBridgeAbiSha256Hex: hex(byte),
    ergoBridgeBytecodeSha256Hex: hex(next),
    sergSourceSha256Hex: hex(byte),
    sergAbiSha256Hex: hex(next),
    sergBytecodeSha256Hex: hex(byte),
  };
}

function digestFor(value: string): string {
  const bytes = Buffer.from(value, 'utf8');
  let state = 0;
  for (const byte of bytes) state = (state * 31 + byte) & 0xff;
  return hex(state.toString(16).padStart(2, '0'));
}

function hex(byte: string): string {
  return `0x${byte.repeat(32)}`;
}
