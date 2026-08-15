import { createHash } from 'node:crypto';

import {
  assertAuthorityBoundFinalizedRuntimeHistoryProvenance,
  type AuthorityBoundFinalizedRuntimeHistory,
} from './authority-bound-finalized-runtime-history.js';
import {
  canonicalE2sJson,
} from './independently-attested-native-verifier-profile.js';
import {
  assertPegInRuntimeInvariantReviewValidationProvenanceV1,
  assertReviewedPegInRuntimeInvariantProfileProvenanceV1,
  derivePegInRuntimeInvariantSourceBindingDigestHexV1,
  type PegInRuntimeInvariantReviewReportV1,
  type ReviewedPegInRuntimeInvariantProfileV1,
} from './peg-in-runtime-invariant-profile-v1.js';
import type {
  PegInRuntimeCodeIdentityV2,
} from './peg-in-runtime-identity-v2.js';

export const AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_SCHEMA =
  'e2s.authority-bound-finalized-runtime-invariant-review-candidate.v2' as const;
export const AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_STATUS =
  'BOUND_QUARANTINED_RUNTIME_INVARIANT_REVIEW_CANDIDATE' as const;

const CANDIDATE_DIGEST_DOMAIN = Buffer.from(
  'E2S_AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_V2\0',
  'utf8',
);

declare const FINALIZED_RUNTIME_INVARIANT_REVIEW_BRAND: unique symbol;
declare const FINALIZED_RUNTIME_INVARIANT_REVIEW_CANDIDATE_BRAND:
  unique symbol;

export interface AuthorityBoundFinalizedRuntimeInvariantRange {
  readonly fromPostStateHeight: string;
  readonly toPostStateHeight: string;
  readonly stateCount: number;
}

export interface AuthorityBoundFinalizedRuntimeInvariantBinding {
  readonly runtime: PegInRuntimeCodeIdentityV2;
  readonly profileId: string;
  readonly reviewId: string;
  readonly reviewPacketSha256Hex: string;
  readonly reviewStatementDigestHex: string;
  readonly reviewerPolicyDigestHex: string;
  readonly sourceBindingDigestHex: string;
  readonly reviewerKeyIdHex: string;
  readonly reviewerOrganizationId: string;
  readonly canonicalSourceOwnedReviewerRootsLoaded: boolean;
  readonly postStateRanges:
    readonly AuthorityBoundFinalizedRuntimeInvariantRange[];
  readonly postStateObservationCount: number;
  readonly reentryCount: number;
  readonly isExecutionProducerRuntime: boolean;
}

export interface AuthorityBoundFinalizedRuntimeInvariantReviewPayload {
  readonly schema:
    typeof AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_SCHEMA;
  readonly status:
    typeof AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_STATUS;
  readonly candidateDigestHex: string;
  readonly historyDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly sidechainIdHex: string;
  readonly ergoBoxIdHex: string;
  readonly interval: AuthorityBoundFinalizedRuntimeHistory['interval'];
  readonly distinctRuntimeCount: number;
  readonly reviewerPolicyDigestHex: string;
  readonly bindings:
    readonly AuthorityBoundFinalizedRuntimeInvariantBinding[];
  readonly executionProducerRuntimeArtifactSha256Hex: string;
  readonly everyProfileUsesCanonicalSourceOwnedReviewerRoots: boolean;
  readonly boundary: {
    readonly everyDistinctRuntimeExpectationBoundExactlyOnce: true;
    readonly executionProducerRuntimeBound: true;
    readonly changeAndRevertRangesPreserved: true;
    readonly nativeAndExecutionBlockIdentitiesSeparated: true;
    readonly executionBlockHashMappedToNativeState: false;
    readonly reviewPacketsValidatedRelativeToOnePolicy: true;
    readonly nativePostExecutionRecordSeparatedFromEvmReplayGuard: true;
    readonly directTokenMintEntrypointRequiredInEveryProfile: true;
    readonly sourceReviewDoesNotProveDeployedState: true;
    readonly childProofClaimsAccepted: false;
    readonly stableCollectionSnapshotVerified: false;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofsVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly runtimeInvariantReviewsAcceptedForMint: false;
    readonly deployedBridgeCodeVerified: false;
    readonly deployedTokenCodeVerified: false;
    readonly deployedTokenOwnershipVerified: false;
    readonly completeHistoricalTokenOwnershipVerified: false;
    readonly wholeBlockCallbackRollbackVerified: false;
    readonly reproducibleSolidityBuildClosureVerified: false;
    readonly checkpointPredatesDepositEligibilityVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly cutoverPolicyVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly admissionEligible: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export type AuthorityBoundFinalizedRuntimeInvariantReview =
  AuthorityBoundFinalizedRuntimeInvariantReviewPayload & {
    readonly [FINALIZED_RUNTIME_INVARIANT_REVIEW_BRAND]: true;
  };

export type AuthorityBoundFinalizedRuntimeInvariantReviewCandidate =
  AuthorityBoundFinalizedRuntimeInvariantReviewPayload & {
    readonly [FINALIZED_RUNTIME_INVARIANT_REVIEW_CANDIDATE_BRAND]: true;
  };

const FINALIZED_RUNTIME_INVARIANT_REVIEWS = new WeakSet<object>();
const FINALIZED_RUNTIME_INVARIANT_REVIEW_CANDIDATES =
  new WeakSet<object>();

interface RuntimeInvariantReviewInput {
  readonly history: AuthorityBoundFinalizedRuntimeHistory;
  readonly profiles: readonly PegInRuntimeInvariantReviewReportV1[];
}

/**
 * Bind the complete T15 expectation interval to one validated semantic-review
 * packet per distinct runtime identity under an explicitly supplied policy.
 * This synthetic path has distinct provenance from source-owned canonical
 * review and remains a quarantined candidate.
 */
export function createAuthorityBoundFinalizedRuntimeInvariantReviewCandidate(
  input: RuntimeInvariantReviewInput,
): AuthorityBoundFinalizedRuntimeInvariantReviewCandidate {
  const snapshot = snapshotRuntimeInvariantReviewInput(
    input,
    'validated profiles',
  );
  assertAuthorityBoundFinalizedRuntimeHistoryProvenance(snapshot.history);
  for (const profile of snapshot.profiles) {
    assertPegInRuntimeInvariantReviewValidationProvenanceV1(profile);
  }
  const candidate = composeRuntimeInvariantReview(
    snapshot,
  ) as AuthorityBoundFinalizedRuntimeInvariantReviewCandidate;
  FINALIZED_RUNTIME_INVARIANT_REVIEW_CANDIDATES.add(candidate);
  return candidate;
}

/**
 * Compose only profiles validated through the canonical source-owned reviewer
 * registry. The result remains non-authorizing until every other T16 boundary
 * is closed, but supplied-policy fixtures cannot obtain this provenance.
 */
export function createAuthorityBoundFinalizedRuntimeInvariantReview(input: {
  readonly history: AuthorityBoundFinalizedRuntimeHistory;
  readonly profiles: readonly ReviewedPegInRuntimeInvariantProfileV1[];
}): AuthorityBoundFinalizedRuntimeInvariantReview {
  const snapshot = snapshotRuntimeInvariantReviewInput(
    input,
    'canonical reviewed profiles',
  );
  assertAuthorityBoundFinalizedRuntimeHistoryProvenance(snapshot.history);
  for (const profile of snapshot.profiles) {
    assertReviewedPegInRuntimeInvariantProfileProvenanceV1(profile);
  }
  const review = composeRuntimeInvariantReview(
    snapshot,
  ) as AuthorityBoundFinalizedRuntimeInvariantReview;
  if (!review.everyProfileUsesCanonicalSourceOwnedReviewerRoots) {
    throw new Error(
      'finalized runtime invariant review requires canonical source-owned reviewer roots',
    );
  }
  FINALIZED_RUNTIME_INVARIANT_REVIEWS.add(review);
  return review;
}

function snapshotRuntimeInvariantReviewInput(
  input: RuntimeInvariantReviewInput,
  profileLabel: string,
): RuntimeInvariantReviewInput {
  if (!input || typeof input !== 'object') {
    throw new Error('finalized runtime invariant review input is missing');
  }
  const history = input.history;
  const callerProfiles = input.profiles;
  if (!Array.isArray(callerProfiles) || callerProfiles.length === 0) {
    throw new Error(
      `finalized runtime invariant review requires ${profileLabel}`,
    );
  }
  const profiles = Object.freeze([...callerProfiles]);
  return Object.freeze({ history, profiles });
}

function composeRuntimeInvariantReview(
  input: RuntimeInvariantReviewInput,
): AuthorityBoundFinalizedRuntimeInvariantReviewPayload {
  const expected = deriveExpectedRuntimeRanges(input.history);
  const supplied = new Map<string, PegInRuntimeInvariantReviewReportV1>();
  const reviewPacketDigests = new Set<string>();
  const reviewIds = new Set<string>();
  for (const profile of input.profiles) {
    const runtimeDigest = profile.runtime.artifactSha256Hex;
    if (supplied.has(runtimeDigest)) {
      throw new Error(
        'finalized runtime invariant profiles must not duplicate a runtime artifact',
      );
    }
    if (
      reviewPacketDigests.has(profile.reviewPacketSha256Hex)
      || reviewIds.has(profile.reviewId)
    ) {
      throw new Error(
        'finalized runtime invariant reviews must use unique packet and review identities',
      );
    }
    supplied.set(runtimeDigest, profile);
    reviewPacketDigests.add(profile.reviewPacketSha256Hex);
    reviewIds.add(profile.reviewId);
  }
  if (
    supplied.size !== expected.size
    || [...expected.keys()].some(digest => !supplied.has(digest))
    || [...supplied.keys()].some(digest => !expected.has(digest))
  ) {
    throw new Error(
      'finalized runtime invariant profiles must exactly cover every distinct runtime expectation',
    );
  }

  const reviewerPolicyDigests = new Set(
    input.profiles.map(profile => profile.reviewerPolicyDigestHex),
  );
  if (reviewerPolicyDigests.size !== 1) {
    throw new Error(
      'finalized runtime invariant profiles must bind one reviewer policy digest',
    );
  }
  const reviewerPolicyDigestHex = [...reviewerPolicyDigests][0]!;
  const producerDigest =
    input.history.expectedProducerRuntime.artifactSha256Hex;
  if (!expected.has(producerDigest)) {
    throw new Error(
      'finalized runtime invariant history producer runtime is outside the reviewed expectation set',
    );
  }

  const bindings = [...expected.values()]
    .sort((left, right) => left.firstStateIndex - right.firstStateIndex)
    .map(entry => {
      const profile = supplied.get(entry.runtime.artifactSha256Hex)!;
      assertProfileRuntimeIdentity(entry.runtime, profile.runtime);
      assertFailClosedProfileBoundary(profile);
      return deepFreeze({
        runtime: entry.runtime,
        profileId: profile.profileId,
        reviewId: profile.reviewId,
        reviewPacketSha256Hex: profile.reviewPacketSha256Hex,
        reviewStatementDigestHex: profile.statementDigestHex,
        reviewerPolicyDigestHex: profile.reviewerPolicyDigestHex,
        sourceBindingDigestHex:
          derivePegInRuntimeInvariantSourceBindingDigestHexV1(profile.source),
        reviewerKeyIdHex: profile.reviewer.keyIdHex,
        reviewerOrganizationId: profile.reviewer.organizationId,
        canonicalSourceOwnedReviewerRootsLoaded:
          profile.boundary.canonicalSourceOwnedReviewerRootsLoaded,
        postStateRanges: entry.ranges,
        postStateObservationCount: entry.observationCount,
        reentryCount: Math.max(0, entry.ranges.length - 1),
        isExecutionProducerRuntime:
          entry.runtime.artifactSha256Hex === producerDigest,
      });
    });
  if (bindings.filter(binding => binding.isExecutionProducerRuntime).length !== 1) {
    throw new Error(
      'finalized runtime invariant review must bind one execution producer runtime',
    );
  }

  const everyProfileUsesCanonicalSourceOwnedReviewerRoots = bindings.every(
    binding => binding.canonicalSourceOwnedReviewerRootsLoaded,
  );
  const core = {
    schema: AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_SCHEMA,
    status: AUTHORITY_BOUND_FINALIZED_RUNTIME_INVARIANT_REVIEW_STATUS,
    historyDigestHex: input.history.historyDigestHex,
    trustAnchorDigestHex: input.history.trustAnchorDigestHex,
    sidechainIdHex: input.history.sidechainIdHex,
    ergoBoxIdHex: input.history.ergoBoxIdHex,
    interval: input.history.interval,
    distinctRuntimeCount: bindings.length,
    reviewerPolicyDigestHex,
    bindings,
    executionProducerRuntimeArtifactSha256Hex: producerDigest,
    everyProfileUsesCanonicalSourceOwnedReviewerRoots,
    boundary: {
      everyDistinctRuntimeExpectationBoundExactlyOnce: true,
      executionProducerRuntimeBound: true,
      changeAndRevertRangesPreserved: true,
      nativeAndExecutionBlockIdentitiesSeparated: true,
      executionBlockHashMappedToNativeState: false,
      reviewPacketsValidatedRelativeToOnePolicy: true,
      nativePostExecutionRecordSeparatedFromEvmReplayGuard: true,
      directTokenMintEntrypointRequiredInEveryProfile: true,
      sourceReviewDoesNotProveDeployedState: true,
      childProofClaimsAccepted: false,
      stableCollectionSnapshotVerified: false,
      launcherInstallationActivationCampaignCompleted: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofsVerified: false,
      runtimeUpgradeHistoryVerified: false,
      runtimeInvariantReviewsAcceptedForMint: false,
      deployedBridgeCodeVerified: false,
      deployedTokenCodeVerified: false,
      deployedTokenOwnershipVerified: false,
      completeHistoricalTokenOwnershipVerified: false,
      wholeBlockCallbackRollbackVerified: false,
      reproducibleSolidityBuildClosureVerified: false,
      checkpointPredatesDepositEligibilityVerified: false,
      historicalMintAbsenceVerified: false,
      cutoverPolicyVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  } as const;
  return deepFreeze({
    ...core,
    candidateDigestHex: deriveCandidateDigestHex(core),
  });
}

export function assertAuthorityBoundFinalizedRuntimeInvariantReviewProvenance(
  value: unknown,
): asserts value is AuthorityBoundFinalizedRuntimeInvariantReview {
  if (
    !value
    || typeof value !== 'object'
    || !FINALIZED_RUNTIME_INVARIANT_REVIEWS.has(value)
  ) {
    throw new Error(
      'authority-bound finalized runtime invariant review provenance is missing',
    );
  }
}

export function assertAuthorityBoundFinalizedRuntimeInvariantReviewCandidateProvenance(
  value: unknown,
): asserts value is AuthorityBoundFinalizedRuntimeInvariantReviewCandidate {
  if (
    !value
    || typeof value !== 'object'
    || !FINALIZED_RUNTIME_INVARIANT_REVIEW_CANDIDATES.has(value)
  ) {
    throw new Error(
      'authority-bound finalized runtime invariant review candidate provenance is missing',
    );
  }
}

interface ExpectedRuntimeEntry {
  readonly runtime: PegInRuntimeCodeIdentityV2;
  readonly firstStateIndex: number;
  readonly ranges: readonly AuthorityBoundFinalizedRuntimeInvariantRange[];
  readonly observationCount: number;
}

function deriveExpectedRuntimeRanges(
  history: AuthorityBoundFinalizedRuntimeHistory,
): Map<string, ExpectedRuntimeEntry> {
  const mutable = new Map<string, {
    runtime: PegInRuntimeCodeIdentityV2;
    firstStateIndex: number;
    ranges: Array<{
      fromPostStateHeight: string;
      toPostStateHeight: string;
      stateCount: number;
    }>;
    observationCount: number;
  }>();
  let activeDigest: string | undefined;
  for (const [index, state] of history.states.entries()) {
    const runtime = state.expectedRuntimeCode;
    const digest = runtime.artifactSha256Hex;
    const existing = mutable.get(digest);
    if (existing) {
      assertSameRuntimeIdentity(existing.runtime, runtime);
    } else {
      mutable.set(digest, {
        runtime,
        firstStateIndex: index,
        ranges: [],
        observationCount: 0,
      });
    }
    const entry = mutable.get(digest)!;
    entry.observationCount += 1;
    if (activeDigest === digest) {
      const range = entry.ranges.at(-1)!;
      range.toPostStateHeight = state.nativeHeight;
      range.stateCount += 1;
    } else {
      entry.ranges.push({
        fromPostStateHeight: state.nativeHeight,
        toPostStateHeight: state.nativeHeight,
        stateCount: 1,
      });
      activeDigest = digest;
    }
  }
  const producer = history.expectedProducerRuntime;
  const producerEntry = mutable.get(producer.artifactSha256Hex);
  if (producerEntry) {
    assertSameRuntimeIdentity(producerEntry.runtime, producer);
  }
  return new Map([...mutable.entries()].map(([digest, entry]) => [
    digest,
    deepFreeze({
      runtime: entry.runtime,
      firstStateIndex: entry.firstStateIndex,
      ranges: entry.ranges,
      observationCount: entry.observationCount,
    }),
  ]));
}

function assertSameRuntimeIdentity(
  expected: PegInRuntimeCodeIdentityV2,
  actual: PegInRuntimeCodeIdentityV2,
): void {
  if (
    expected.storageKeyHex !== actual.storageKeyHex
    || expected.artifactSha256Hex !== actual.artifactSha256Hex
    || expected.artifactSizeBytes !== actual.artifactSizeBytes
    || expected.buildAttestationId !== actual.buildAttestationId
    || expected.buildAttestationSha256Hex
      !== actual.buildAttestationSha256Hex
  ) {
    throw new Error(
      'finalized runtime invariant profile does not match the exact runtime/build identity',
    );
  }
}

function assertProfileRuntimeIdentity(
  expected: PegInRuntimeCodeIdentityV2,
  actual: PegInRuntimeInvariantReviewReportV1['runtime'],
): void {
  if (
    expected.artifactSha256Hex !== actual.artifactSha256Hex
    || expected.artifactSizeBytes !== actual.artifactSizeBytes
    || expected.buildAttestationId !== actual.buildAttestationId
    || expected.buildAttestationSha256Hex
      !== actual.buildAttestationSha256Hex
  ) {
    throw new Error(
      'finalized runtime invariant profile does not match the exact runtime/build identity',
    );
  }
}

function assertFailClosedProfileBoundary(
  profile: PegInRuntimeInvariantReviewReportV1,
): void {
  if (
    profile.semanticBindings.nativeRecordIsPostExecutionEvidence !== true
    || profile.semanticBindings
      .evmReplayWritePrecedesExternalTokenMint !== true
    || profile.semanticBindings
      .failedMintRollsBackEvmReplayWriteAndEvent !== true
    || profile.semanticBindings.directTokenMintEntrypointEnumerated !== true
    || profile.semanticBindings
      .ownershipMutationEntrypointsEnumerated !== true
    || profile.semanticBindings
      .deployedTokenOwnershipRemainsExternalEvidence !== true
    || profile.semanticBindings.eventAloneDoesNotProveTokenMint !== true
    || profile.semanticBindings
      .wholeBlockCallbackRollbackRemainsExternalEvidence !== true
    || profile.semanticBindings
      .reproducibleSolidityBuildClosureRemainsExternalEvidence !== true
    || profile.boundary.relativeToSuppliedPolicy !== true
    || profile.boundary.exactSourceBindingApprovedByPolicy !== true
    || profile.boundary
      .currentRepositorySourceBytesVerifiedByThisValidator !== false
    || profile.boundary.reviewerSignatureVerified !== true
    || profile.boundary
      .organizationalIndependenceCryptographicallyProven !== false
    || profile.boundary.deployedBridgeCodeVerified !== false
    || profile.boundary.deployedTokenCodeVerified !== false
    || profile.boundary.deployedTokenOwnershipVerified !== false
    || profile.boundary.completeHistoricalTokenOwnershipVerified !== false
    || profile.boundary.wholeBlockCallbackRollbackVerified !== false
    || profile.boundary.reproducibleSolidityBuildClosureVerified !== false
    || profile.boundary.sidechainFinalityVerified !== false
    || profile.boundary.runtimeCodeStateProofVerified !== false
    || profile.boundary.runtimeUpgradeHistoryVerified !== false
    || profile.boundary.historicalMintAbsenceVerified !== false
    || profile.boundary.committedVaultTransitionVerified !== false
    || profile.boundary.mintAuthorized !== false
    || profile.boundary.admissionEligible !== false
    || profile.boundary.gate5Closed !== false
    || profile.boundary.productionReady !== false
  ) {
    throw new Error(
      'finalized runtime invariant profile makes a premature authority claim',
    );
  }
}

function deriveCandidateDigestHex(value: unknown): string {
  return `0x${createHash('sha256')
    .update(CANDIDATE_DIGEST_DOMAIN)
    .update(Buffer.from(canonicalE2sJson(value), 'utf8'))
    .digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
