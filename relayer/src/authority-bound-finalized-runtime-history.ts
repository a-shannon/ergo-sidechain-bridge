import { createHash } from 'node:crypto';

import {
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance,
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance,
  type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';
import {
  createAuthorityBoundParentStateRuntimeLineage,
  type AuthorityBoundRuntimeStateCandidateInput,
} from './authority-bound-parent-state-runtime-lineage.js';
import {
  collectNativeFinalizedPegInRuntimeIdentityV2Candidate,
  type CollectedNativePegInRuntimeIdentityV2Candidate,
} from './native-checkpoint-proof-collector.js';
import type { NativeFinalizedBridgeCheckpointRequest } from './native-finalized-bridge-checkpoint.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import type { NativeSubstrateRpcProofCodec } from './native-substrate-rpc-proof-codec.js';
import {
  assertPegInRuntimeRecordMatchesProfileGenerationV1,
  decodePegInRuntimeProfileV1ScaleHex,
  decodePegInRuntimeRecordV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  normalizePegInRuntimeIdentityStatementV2,
  type PegInRuntimeCodeIdentityV2,
  type PegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';
import type { ReadOnlySubstrateFinalityRpc } from './substrate-finality-provider.js';

export const AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA =
  'e2s.authority-bound-finalized-runtime-history-expectation-candidate.v2' as const;
export const AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATUS =
  'BOUND_QUARANTINED_COMPLETE_INTERVAL_EXPECTATION_CANDIDATE' as const;
export const COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA =
  'e2s.collected-authority-bound-finalized-runtime-history-expectation-candidate.v2' as const;
export const MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES = 257;
export const MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_COLLECTION_BYTES =
  64 * 1024 * 1024;
export const MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_COLLECTION_MS =
  30 * 60_000;

const HISTORY_DIGEST_DOMAIN = Buffer.from(
  'E2S_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_V2\0',
  'utf8',
);
const UINT64_MAX = (1n << 64n) - 1n;
const DEFAULT_STATE_COLLECTION_MS = 2 * 60_000;
const MAX_STATE_COLLECTION_MS = 10 * 60_000;
const DEFAULT_AGGREGATE_COLLECTION_MS = 10 * 60_000;

declare const FINALIZED_RUNTIME_HISTORY_BRAND: unique symbol;
declare const COLLECTED_FINALIZED_RUNTIME_HISTORY_BRAND: unique symbol;

export interface AuthorityBoundFinalizedRuntimeHistoryState {
  readonly nativeBlockHashHex: string;
  readonly parentHashHex: string;
  readonly nativeHeight: string;
  readonly stateRootHex: string;
  readonly requestDigestHex: string;
  readonly quarantinedChildOutputSha256Hex: string;
  readonly quarantinedChildOutputSizeBytes: string;
  readonly expectedRuntimeCode: PegInRuntimeCodeIdentityV2;
  readonly runtimeEnvironmentUpdatedDigestPresent: boolean;
  readonly recordExpectation:
    | {
      readonly outcome: 'NON_MEMBERSHIP';
      readonly profileScaleSha256Hex: string;
      readonly profileRevision: string;
      readonly profileActivationHeight: string;
    }
    | {
      readonly outcome: 'MEMBERSHIP';
      readonly recordScaleSha256Hex: string;
      readonly transactionHashHex: string;
      readonly eventIndex: number;
      readonly profileRevision: string;
      readonly profileActivationHeight: string;
    };
}

export interface AuthorityBoundFinalizedRuntimeTransition {
  readonly runtimeCodeChangeBlockHashHex: string;
  readonly runtimeCodeChangeBlockHeight: string;
  readonly activeFromBlockEntryHeight: string;
  readonly previousExpectedRuntimeCode: PegInRuntimeCodeIdentityV2;
  readonly nextExpectedRuntimeCode: PegInRuntimeCodeIdentityV2;
  readonly runtimeEnvironmentUpdatedDigestPresent: true;
  readonly revertsToPreviouslyObservedRuntime: boolean;
}

export interface AuthorityBoundRuntimeEnvironmentUpdateMarker {
  readonly blockHashHex: string;
  readonly blockHeight: string;
  readonly expectedRuntimeCodeDigestChanged: boolean;
}

export interface AuthorityBoundFinalizedRuntimeHistoryPayload {
  readonly schema: typeof AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA;
  readonly status: typeof AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATUS;
  readonly historyDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly sidechainIdHex: string;
  readonly ergoBoxIdHex: string;
  readonly interval: AuthorityBoundFinalizedRuntimeHistoryInterval;
  readonly startCheckpointHashHex: string;
  readonly startCheckpointHeight: string;
  readonly executionNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly executionBlockHeight: string;
  readonly stateCount: number;
  readonly states: readonly AuthorityBoundFinalizedRuntimeHistoryState[];
  readonly transitions: readonly AuthorityBoundFinalizedRuntimeTransition[];
  readonly runtimeEnvironmentUpdateMarkers:
    readonly AuthorityBoundRuntimeEnvironmentUpdateMarker[];
  readonly expectedProducerRuntime: PegInRuntimeCodeIdentityV2;
  readonly parentExecutionLineageDigestHex: string;
  readonly changeAndRevertExpectationObserved: boolean;
  readonly boundary: {
    readonly checkpointToExecutionStateCoverageCompleteInCandidate: true;
    readonly everyHeightConsecutiveAndDirectlyLinked: true;
    readonly everyExpectedCodeChangeMarkedInHeader: true;
    readonly changeAndRevertExpectationClassified: true;
    readonly nativeAndExecutionBlockIdentitiesSeparated: true;
    readonly executionBlockHashMappedToNativeState: false;
    readonly childOutputContentExposed: false;
    readonly childProofClaimsAccepted: false;
    readonly stableCollectionSnapshotVerified: false;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofsVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly runtimeInvariantReviewsVerified: false;
    readonly checkpointPredatesDepositEligibilityVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly cutoverPolicyVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export type AuthorityBoundFinalizedRuntimeHistory =
  AuthorityBoundFinalizedRuntimeHistoryPayload & {
    readonly [FINALIZED_RUNTIME_HISTORY_BRAND]: true;
  };

export interface AuthorityBoundFinalizedRuntimeHistoryInterval {
  readonly semantics: 'inclusive-post-state';
  readonly startCheckpointHashHex: string;
  readonly startCheckpointHeight: string;
  readonly executionNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly executionBlockHeight: string;
}

export interface CollectAuthorityBoundFinalizedRuntimeHistoryStatePlan {
  readonly expectedHeight: string;
  readonly targetNativeBlockHashHex: string;
  readonly statement: PegInRuntimeIdentityStatementV2;
  readonly evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
}

export interface CollectAuthorityBoundFinalizedRuntimeHistoryInput {
  readonly rpc: ReadOnlySubstrateFinalityRpc;
  readonly codec: NativeSubstrateRpcProofCodec;
  readonly trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  readonly trustedAnchorDigestHex: string;
  readonly interval: AuthorityBoundFinalizedRuntimeHistoryInterval;
  readonly statePlan:
    readonly CollectAuthorityBoundFinalizedRuntimeHistoryStatePlan[];
  readonly deadlineMs?: number;
  readonly rpcConcurrency?: number;
  readonly maxAttempts?: number;
  readonly aggregateDeadlineMs?: number;
  readonly maxAggregateCollectionBytes?: number;
}

export interface AuthorityBoundFinalizedRuntimeHistoryCollectionSummary {
  readonly targetNativeBlockHashHex: string;
  readonly targetNativeHeight: string;
  readonly requestDigestHex: string;
  readonly collectionBytes: number;
  readonly quarantinedChildOutputSha256Hex: string;
}

export interface CollectedAuthorityBoundFinalizedRuntimeHistoryPayload {
  readonly schema:
    typeof COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA;
  readonly collectionSummaries:
    readonly AuthorityBoundFinalizedRuntimeHistoryCollectionSummary[];
  readonly aggregateCollectionBytes: number;
  readonly history: AuthorityBoundFinalizedRuntimeHistory;
}

export type CollectedAuthorityBoundFinalizedRuntimeHistory =
  CollectedAuthorityBoundFinalizedRuntimeHistoryPayload & {
    readonly [COLLECTED_FINALIZED_RUNTIME_HISTORY_BRAND]: true;
  };

const AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES = new WeakSet<object>();
const COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES =
  new WeakSet<object>();

export function createAuthorityBoundFinalizedRuntimeHistory(
  input: {
    readonly interval: AuthorityBoundFinalizedRuntimeHistoryInterval;
    readonly states: readonly AuthorityBoundRuntimeStateCandidateInput[];
  },
): AuthorityBoundFinalizedRuntimeHistory {
  const interval = normalizeHistoryInterval(input?.interval);
  const callerStates = input?.states;
  if (
    !Array.isArray(callerStates)
    || callerStates.length < 2
    || callerStates.length
      > MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES
  ) {
    throw new Error(
      `finalized runtime history requires 2 to ${MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES} states`,
    );
  }

  const stateInputs = Object.freeze([...callerStates]);
  const normalizedStates = stateInputs.map(state =>
    normalizeHistoryStateInput(state));
  const first = normalizedStates[0];
  const final = normalizedStates.at(-1)!;
  const trustAnchor = first.request.trustAnchor;
  if (
    first.header.nativeBlockHashHex !== trustAnchor.checkpointHashHex
    || BigInt(first.header.nativeHeight)
      !== BigInt(trustAnchor.checkpointNumber)
    || first.header.nativeBlockHashHex
      !== interval.startCheckpointHashHex
    || first.header.nativeHeight
      !== interval.startCheckpointHeight
  ) {
    throw new Error(
      'finalized runtime history must start at the exact reviewed trust checkpoint',
    );
  }
  if (
    final.header.nativeBlockHashHex !== interval.executionNativeBlockHashHex
    || final.header.nativeHeight !== interval.executionBlockHeight
    || BigInt(interval.executionBlockHeight)
      - BigInt(interval.startCheckpointHeight) + 1n
      !== BigInt(normalizedStates.length)
  ) {
    throw new Error(
      'finalized runtime history states do not exactly cover the explicit interval',
    );
  }
  if (first.header.runtimeEnvironmentUpdatedDigestPresent) {
    throw new Error(
      'finalized runtime history start state cannot classify a RuntimeEnvironmentUpdated marker without its parent',
    );
  }

  const expectedDeposit = first.request.statement.ergoBoxIdHex;
  const expectedTrustAnchorDigest =
    first.candidate.trustAnchorDigestHex;
  const states: AuthorityBoundFinalizedRuntimeHistoryState[] = [];
  const transitions: AuthorityBoundFinalizedRuntimeTransition[] = [];
  const runtimeEnvironmentUpdateMarkers:
    AuthorityBoundRuntimeEnvironmentUpdateMarker[] = [];
  const seenRuntimeDigests = new Set<string>();
  const runtimeIdentityByDigest =
    new Map<string, PegInRuntimeCodeIdentityV2>();
  let changeAndRevertExpectationObserved = false;

  for (const [index, state] of normalizedStates.entries()) {
    assertSameTrustAnchor(trustAnchor, state.request.trustAnchor);
    if (state.request.statement.ergoBoxIdHex !== expectedDeposit) {
      throw new Error(
        'finalized runtime history states bind different Ergo deposits',
      );
    }
    if (
      state.candidate.trustAnchorDigestHex
        !== expectedTrustAnchorDigest
    ) {
      throw new Error(
        'finalized runtime history candidates bind different trust anchors',
      );
    }
    if (
      state.header.nativeBlockHashHex
        !== state.request.targetNativeBlockHashHex
    ) {
      throw new Error(
        'finalized runtime history request header hash binding changed',
      );
    }
    const runtimeCode = state.request.statement.runtimeCode;
    const existingRuntimeIdentity = runtimeIdentityByDigest.get(
      runtimeCode.artifactSha256Hex,
    );
    if (existingRuntimeIdentity) {
      sameRuntimeIdentity(existingRuntimeIdentity, runtimeCode);
    } else {
      runtimeIdentityByDigest.set(
        runtimeCode.artifactSha256Hex,
        runtimeCode,
      );
    }

    const previous = normalizedStates[index - 1];
    if (previous) {
      if (
        state.header.parentHashHex
          !== previous.header.nativeBlockHashHex
      ) {
        throw new Error(
          'finalized runtime history contains a non-descendant state',
        );
      }
      if (
        BigInt(state.header.nativeHeight)
          !== BigInt(previous.header.nativeHeight) + 1n
      ) {
        throw new Error(
          'finalized runtime history contains an omitted or duplicate height',
        );
      }
      const changed =
        !sameRuntimeIdentity(
          previous.request.statement.runtimeCode,
          state.request.statement.runtimeCode,
        );
      if (
        changed
        && !state.header.runtimeEnvironmentUpdatedDigestPresent
      ) {
        throw new Error(
          'finalized runtime history code change lacks a RuntimeEnvironmentUpdated digest marker',
        );
      }
      if (state.header.runtimeEnvironmentUpdatedDigestPresent) {
        runtimeEnvironmentUpdateMarkers.push({
          blockHashHex: state.header.nativeBlockHashHex,
          blockHeight: state.header.nativeHeight,
          expectedRuntimeCodeDigestChanged: changed,
        });
      }
      if (changed) {
        const activeFrom = BigInt(state.header.nativeHeight) + 1n;
        if (activeFrom > UINT64_MAX) {
          throw new Error(
            'finalized runtime transition activation height exceeds uint64',
          );
        }
        const nextDigest =
          state.request.statement.runtimeCode.artifactSha256Hex;
        const revertsToPreviouslyObservedRuntime =
          seenRuntimeDigests.has(nextDigest);
        if (revertsToPreviouslyObservedRuntime) {
          changeAndRevertExpectationObserved = true;
        }
        transitions.push({
          runtimeCodeChangeBlockHashHex:
            state.header.nativeBlockHashHex,
          runtimeCodeChangeBlockHeight: state.header.nativeHeight,
          activeFromBlockEntryHeight: activeFrom.toString(),
          previousExpectedRuntimeCode:
            previous.request.statement.runtimeCode,
          nextExpectedRuntimeCode:
            state.request.statement.runtimeCode,
          runtimeEnvironmentUpdatedDigestPresent: true,
          revertsToPreviouslyObservedRuntime,
        });
      }
    }

    seenRuntimeDigests.add(
      state.request.statement.runtimeCode.artifactSha256Hex,
    );
    states.push(toHistoryState(
      state,
      index === normalizedStates.length - 1,
      interval.executionBlockHashHex,
    ));
  }

  const parentExecutionLineage =
    createAuthorityBoundParentStateRuntimeLineage({
      parent: normalizedStateAsCandidateInput(
        normalizedStates[normalizedStates.length - 2],
      ),
      execution: normalizedStateAsCandidateInput(
        normalizedStates[normalizedStates.length - 1],
      ),
    });
  const body = {
    trustAnchorDigestHex: expectedTrustAnchorDigest,
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: expectedDeposit,
    interval,
    startCheckpointHashHex: first.header.nativeBlockHashHex,
    startCheckpointHeight: first.header.nativeHeight,
    executionNativeBlockHashHex: final.header.nativeBlockHashHex,
    executionBlockHashHex: interval.executionBlockHashHex,
    executionBlockHeight: final.header.nativeHeight,
    stateCount: states.length,
    states,
    transitions,
    runtimeEnvironmentUpdateMarkers,
    expectedProducerRuntime:
      parentExecutionLineage.expectedProducerRuntime,
    parentExecutionLineageDigestHex:
      parentExecutionLineage.lineageDigestHex,
    changeAndRevertExpectationObserved,
  };
  const boundary = {
    checkpointToExecutionStateCoverageCompleteInCandidate: true as const,
    everyHeightConsecutiveAndDirectlyLinked: true as const,
    everyExpectedCodeChangeMarkedInHeader: true as const,
    changeAndRevertExpectationClassified: true as const,
    nativeAndExecutionBlockIdentitiesSeparated: true as const,
    executionBlockHashMappedToNativeState: false as const,
    childOutputContentExposed: false as const,
    childProofClaimsAccepted: false as const,
    stableCollectionSnapshotVerified: false as const,
    launcherInstallationActivationCampaignCompleted: false as const,
    sidechainFinalityVerified: false as const,
    runtimeCodeStateProofsVerified: false as const,
    runtimeUpgradeHistoryVerified: false as const,
    runtimeInvariantReviewsVerified: false as const,
    checkpointPredatesDepositEligibilityVerified: false as const,
    historicalMintAbsenceVerified: false as const,
    cutoverPolicyVerified: false as const,
    committedVaultTransitionVerified: false as const,
    mintAuthorized: false as const,
    transactionMutationEnabled: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  };
  const history = deepFreeze({
    schema: AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA,
    status: AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATUS,
    historyDigestHex: sha256Digest(body),
    ...body,
    boundary,
  }) as unknown as AuthorityBoundFinalizedRuntimeHistory;
  AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES.add(history);
  return history;
}

export async function collectAuthorityBoundFinalizedRuntimeHistory(
  input: CollectAuthorityBoundFinalizedRuntimeHistoryInput,
): Promise<CollectedAuthorityBoundFinalizedRuntimeHistory> {
  const snapshot = snapshotCollectionInput(input);
  const aggregateDeadline =
    Date.now() + snapshot.aggregateDeadlineMs;

  const collections: CollectedNativePegInRuntimeIdentityV2Candidate[] = [];
  const collectionSummaries:
    AuthorityBoundFinalizedRuntimeHistoryCollectionSummary[] = [];
  let aggregateCollectionBytes = 0;
  for (const state of snapshot.statePlan) {
    const stateDeadlineMs = Math.min(
      snapshot.deadlineMs,
      remainingAggregateAcceptanceMs(aggregateDeadline),
    );
    const collection =
      await collectNativeFinalizedPegInRuntimeIdentityV2Candidate({
        rpc: snapshot.rpc,
        codec: snapshot.codec,
        trustAnchor: snapshot.trustAnchor,
        trustedAnchorDigestHex: snapshot.trustedAnchorDigestHex,
        targetNativeBlockHashHex: state.targetNativeBlockHashHex,
        statement: state.statement,
        evaluator: state.evaluator,
        deadlineMs: stateDeadlineMs,
        rpcConcurrency: snapshot.rpcConcurrency,
        maxAttempts: snapshot.maxAttempts,
      });
    assertAggregateAcceptanceDeadline(aggregateDeadline);
    const collectionBytes = Buffer.byteLength(
      JSON.stringify(collection),
      'utf8',
    );
    aggregateCollectionBytes += collectionBytes;
    if (
      aggregateCollectionBytes
        > snapshot.maxAggregateCollectionBytes
    ) {
      throw new Error(
        'finalized runtime history aggregate collection exceeds its byte budget',
      );
    }
    const header =
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        collection.collection.request.targetHeaderScaleHex,
      );
    if (
      header.nativeHeight !== state.expectedHeight
      || header.nativeBlockHashHex !== state.targetNativeBlockHashHex
    ) {
      throw new Error(
        'finalized runtime history collected native identity differs from the snapshotted state plan',
      );
    }
    collections.push(collection);
    collectionSummaries.push({
      targetNativeBlockHashHex: header.nativeBlockHashHex,
      targetNativeHeight: header.nativeHeight,
      requestDigestHex:
        deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
          collection.collection.request,
        ),
      collectionBytes,
      quarantinedChildOutputSha256Hex:
        collection.candidate.quarantinedChildOutput.sha256Hex,
    });
  }
  const history = createAuthorityBoundFinalizedRuntimeHistory({
    interval: snapshot.interval,
    states: collections.map((collection, index) => ({
      request: collection.collection.request,
      evaluator: snapshot.statePlan[index].evaluator,
      candidate: collection.candidate,
    })),
  });
  assertAggregateAcceptanceDeadline(aggregateDeadline);
  const collected = deepFreeze({
    schema:
      COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_SCHEMA,
    collectionSummaries,
    aggregateCollectionBytes,
    history,
  }) as unknown as CollectedAuthorityBoundFinalizedRuntimeHistory;
  assertAggregateAcceptanceDeadline(aggregateDeadline);
  COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES.add(collected);
  return collected;
}

export function assertAuthorityBoundFinalizedRuntimeHistoryProvenance(
  value: unknown,
): asserts value is AuthorityBoundFinalizedRuntimeHistory {
  if (
    !value
    || typeof value !== 'object'
    || !AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES.has(value)
  ) {
    throw new Error(
      'authority-bound finalized runtime history provenance is missing',
    );
  }
}

export function assertCollectedAuthorityBoundFinalizedRuntimeHistoryProvenance(
  value: unknown,
): asserts value is CollectedAuthorityBoundFinalizedRuntimeHistory {
  if (
    !value
    || typeof value !== 'object'
    || !COLLECTED_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORIES.has(value)
  ) {
    throw new Error(
      'collected authority-bound finalized runtime history provenance is missing',
    );
  }
}

function snapshotCollectionInput(
  input: CollectAuthorityBoundFinalizedRuntimeHistoryInput,
) {
  const interval = normalizeHistoryInterval(input?.interval);
  const trustAnchor = Object.freeze({
    sidechainIdHex: fixedPrefixedHex(
      input?.trustAnchor?.sidechainIdHex,
      32,
      'finalized runtime history sidechain ID',
    ),
    checkpointHashHex: fixedPrefixedHex(
      input?.trustAnchor?.checkpointHashHex,
      32,
      'finalized runtime history checkpoint hash',
    ),
    checkpointNumber: canonicalUint64(
      input?.trustAnchor?.checkpointNumber,
      'finalized runtime history checkpoint number',
    ),
    grandpaSetId: canonicalUint64(
      input?.trustAnchor?.grandpaSetId,
      'finalized runtime history GRANDPA set ID',
    ),
    authorityListScaleHex: variablePrefixedHex(
      input?.trustAnchor?.authorityListScaleHex,
      'finalized runtime history authority list',
    ),
  });
  if (
    interval.startCheckpointHashHex !== trustAnchor.checkpointHashHex
    || interval.startCheckpointHeight !== trustAnchor.checkpointNumber
  ) {
    throw new Error(
      'finalized runtime history interval does not start at the reviewed trust checkpoint',
    );
  }
  if (
    !Array.isArray(input?.statePlan)
    || input.statePlan.length < 2
    || input.statePlan.length
      > MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES
  ) {
    throw new Error(
      `finalized runtime history state plan requires 2 to ${MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES} entries`,
    );
  }
  const intervalStateCount =
    BigInt(interval.executionBlockHeight)
    - BigInt(interval.startCheckpointHeight)
    + 1n;
  if (intervalStateCount !== BigInt(input.statePlan.length)) {
    throw new Error(
      'finalized runtime history state plan does not exactly cover the explicit interval',
    );
  }

  let expectedDeposit: string | null = null;
  const statePlan = input.statePlan.map((state, index) => {
    assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
      state?.evaluator,
    );
    const expectedHeight = canonicalUint64(
      state?.expectedHeight,
      `finalized runtime history state plan height ${index}`,
    );
    const intervalHeight =
      BigInt(interval.startCheckpointHeight) + BigInt(index);
    if (BigInt(expectedHeight) !== intervalHeight) {
      throw new Error(
        'finalized runtime history state plan contains an omitted, duplicate, or reordered height',
      );
    }
    const targetNativeBlockHashHex = fixedPrefixedHex(
      state?.targetNativeBlockHashHex,
      32,
      `finalized runtime history state plan block hash ${index}`,
    );
    const statement = normalizePegInRuntimeIdentityStatementV2(
      state?.statement,
      trustAnchor.sidechainIdHex,
    );
    assertStatementEvaluatorBinding(statement, state.evaluator);
    const isFinal = index === input.statePlan.length - 1;
    if (
      (!isFinal && statement.record.outcome !== 'nonMembership')
      || (isFinal && statement.record.outcome !== 'membership')
    ) {
      throw new Error(
        'finalized runtime history state plan must use pre-execution non-membership and final membership',
      );
    }
    if (
      expectedDeposit !== null
      && statement.ergoBoxIdHex !== expectedDeposit
    ) {
      throw new Error(
        'finalized runtime history state plan binds different Ergo deposits',
      );
    }
    expectedDeposit ??= statement.ergoBoxIdHex;
    return Object.freeze({
      expectedHeight,
      targetNativeBlockHashHex,
      statement,
      evaluator: state.evaluator,
    });
  });
  if (
    statePlan[0].targetNativeBlockHashHex
      !== interval.startCheckpointHashHex
    || statePlan.at(-1)!.targetNativeBlockHashHex
      !== interval.executionNativeBlockHashHex
  ) {
    throw new Error(
      'finalized runtime history state plan endpoint hashes differ from the explicit interval',
    );
  }
  const finalStatement = statePlan.at(-1)!.statement;
  const parentStatement = statePlan.at(-2)!.statement;
  if (
    finalStatement.record.outcome !== 'membership'
    || parentStatement.record.outcome !== 'nonMembership'
    || !('expectedProfileScaleHex' in parentStatement)
  ) {
    throw new Error(
      'finalized runtime history state plan lacks the exact parent/execution record pair',
    );
  }
  const finalRecord = decodePegInRuntimeRecordV1ScaleHex(
    finalStatement.record.expectedRecordScaleHex,
  );
  const parentProfile = decodePegInRuntimeProfileV1ScaleHex(
    parentStatement.expectedProfileScaleHex,
  );
  assertPegInRuntimeRecordMatchesProfileGenerationV1(
    finalRecord,
    parentProfile,
  );
  if (
    finalRecord.sidechainIdHex !== trustAnchor.sidechainIdHex
    || finalRecord.ergoBoxIdHex !== expectedDeposit
    || finalRecord.executionBlockHashHex
      !== interval.executionBlockHashHex
    || BigInt(finalRecord.sidechainHeight)
      !== BigInt(interval.executionBlockHeight)
  ) {
    throw new Error(
      'finalized runtime history state plan record does not bind the explicit execution endpoint',
    );
  }

  return Object.freeze({
    rpc: input.rpc,
    codec: input.codec,
    trustAnchor,
    trustedAnchorDigestHex: fixedPrefixedHex(
      input?.trustedAnchorDigestHex,
      32,
      'finalized runtime history trusted anchor digest',
    ),
    interval,
    statePlan: Object.freeze(statePlan),
    deadlineMs: boundedPositiveInteger(
      input?.deadlineMs ?? DEFAULT_STATE_COLLECTION_MS,
      MAX_STATE_COLLECTION_MS,
      'finalized runtime history per-state collection deadline',
    ),
    rpcConcurrency: input.rpcConcurrency,
    maxAttempts: input.maxAttempts,
    aggregateDeadlineMs: boundedPositiveInteger(
      input?.aggregateDeadlineMs ?? DEFAULT_AGGREGATE_COLLECTION_MS,
      MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_COLLECTION_MS,
      'finalized runtime history aggregate deadline',
    ),
    maxAggregateCollectionBytes: boundedPositiveInteger(
      input?.maxAggregateCollectionBytes
        ?? MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_COLLECTION_BYTES,
      MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_COLLECTION_BYTES,
      'finalized runtime history aggregate collection byte budget',
    ),
  });
}

function normalizeHistoryInterval(
  value: unknown,
): AuthorityBoundFinalizedRuntimeHistoryInterval {
  const record = exactRecord(value, [
    'executionBlockHashHex',
    'executionBlockHeight',
    'executionNativeBlockHashHex',
    'semantics',
    'startCheckpointHashHex',
    'startCheckpointHeight',
  ], 'finalized runtime history interval');
  if (record.semantics !== 'inclusive-post-state') {
    throw new Error(
      'finalized runtime history interval semantics must be inclusive-post-state',
    );
  }
  const startCheckpointHeight = canonicalUint64(
    record.startCheckpointHeight,
    'finalized runtime history interval start height',
  );
  const executionBlockHeight = canonicalUint64(
    record.executionBlockHeight,
    'finalized runtime history interval execution height',
  );
  if (
    BigInt(executionBlockHeight) <= BigInt(startCheckpointHeight)
    || BigInt(executionBlockHeight)
      - BigInt(startCheckpointHeight) + 1n
      > BigInt(MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES)
  ) {
    throw new Error(
      `finalized runtime history interval must contain 2 to ${MAX_AUTHORITY_BOUND_FINALIZED_RUNTIME_HISTORY_STATES} states`,
    );
  }
  return Object.freeze({
    semantics: 'inclusive-post-state' as const,
    startCheckpointHashHex: fixedPrefixedHex(
      record.startCheckpointHashHex,
      32,
      'finalized runtime history interval start hash',
    ),
    startCheckpointHeight,
    executionNativeBlockHashHex: fixedPrefixedHex(
      record.executionNativeBlockHashHex,
      32,
      'finalized runtime history interval native execution hash',
    ),
    executionBlockHashHex: fixedPrefixedHex(
      record.executionBlockHashHex,
      32,
      'finalized runtime history interval EVM execution hash',
    ),
    executionBlockHeight,
  });
}

function remainingAggregateAcceptanceMs(deadline: number): number {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new Error(
      'finalized runtime history aggregate collection deadline exceeded',
    );
  }
  return remainingMs;
}

function assertAggregateAcceptanceDeadline(deadline: number): void {
  remainingAggregateAcceptanceMs(deadline);
}

function normalizeHistoryStateInput(
  input: AuthorityBoundRuntimeStateCandidateInput,
) {
  const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
    input?.request,
  );
  const requestDigestHex =
    deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(request);
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
    evaluator: input?.evaluator,
    candidate: input?.candidate,
    expectedRequestDigestHex: requestDigestHex,
  });
  return {
    request,
    requestDigestHex,
    evaluator: input.evaluator,
    candidate: input.candidate,
    header:
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        request.targetHeaderScaleHex,
      ),
  };
}

function normalizedStateAsCandidateInput(
  state: ReturnType<typeof normalizeHistoryStateInput>,
): AuthorityBoundRuntimeStateCandidateInput {
  return {
    request: state.request,
    evaluator: state.evaluator,
    candidate: state.candidate,
  };
}

function toHistoryState(
  state: ReturnType<typeof normalizeHistoryStateInput>,
  isFinal: boolean,
  expectedExecutionBlockHashHex: string,
): AuthorityBoundFinalizedRuntimeHistoryState {
  const statement = state.request.statement;
  let recordExpectation:
    AuthorityBoundFinalizedRuntimeHistoryState['recordExpectation'];
  if (isFinal) {
    if (
      statement.record.outcome !== 'membership'
      || !('expectedRecordScaleHex' in statement.record)
    ) {
      throw new Error(
        'finalized runtime history execution state requires record membership',
      );
    }
    const record = decodePegInRuntimeRecordV1ScaleHex(
      statement.record.expectedRecordScaleHex,
    );
    if (
      record.sidechainIdHex !== state.request.trustAnchor.sidechainIdHex
      || record.ergoBoxIdHex !== statement.ergoBoxIdHex
      || record.executionBlockHashHex
        !== expectedExecutionBlockHashHex
      || BigInt(record.sidechainHeight)
        !== BigInt(state.header.nativeHeight)
    ) {
      throw new Error(
        'finalized runtime history record does not bind the exact execution state',
      );
    }
    recordExpectation = {
      outcome: 'MEMBERSHIP',
      recordScaleSha256Hex:
        sha256ScaleHex(statement.record.expectedRecordScaleHex),
      transactionHashHex: String(record.transactionHashHex),
      eventIndex: record.eventIndex,
      profileRevision: String(record.profileRevision),
      profileActivationHeight:
        String(record.profileActivationHeight),
    };
  } else {
    if (
      statement.record.outcome !== 'nonMembership'
      || !('expectedProfileScaleHex' in statement)
    ) {
      throw new Error(
        'finalized runtime history pre-execution states require record non-membership',
      );
    }
    const profile = decodePegInRuntimeProfileV1ScaleHex(
      statement.expectedProfileScaleHex,
    );
    if (profile.sidechainIdHex !== state.request.trustAnchor.sidechainIdHex) {
      throw new Error(
        'finalized runtime history profile binds a different sidechain',
      );
    }
    recordExpectation = {
      outcome: 'NON_MEMBERSHIP',
      profileScaleSha256Hex:
        sha256ScaleHex(statement.expectedProfileScaleHex),
      profileRevision: String(profile.profileRevision),
      profileActivationHeight: String(profile.activationHeight),
    };
  }
  return {
    nativeBlockHashHex: state.header.nativeBlockHashHex,
    parentHashHex: state.header.parentHashHex,
    nativeHeight: state.header.nativeHeight,
    stateRootHex: state.header.stateRootHex,
    requestDigestHex: state.requestDigestHex,
    quarantinedChildOutputSha256Hex:
      state.candidate.quarantinedChildOutput.sha256Hex,
    quarantinedChildOutputSizeBytes:
      state.candidate.quarantinedChildOutput.sizeBytes,
    expectedRuntimeCode: statement.runtimeCode,
    runtimeEnvironmentUpdatedDigestPresent:
      state.header.runtimeEnvironmentUpdatedDigestPresent,
    recordExpectation,
  };
}

function assertSameTrustAnchor(
  expected: NativeFinalizedBridgeCheckpointRequest['trustAnchor'],
  actual: NativeFinalizedBridgeCheckpointRequest['trustAnchor'],
): void {
  if (
    expected.sidechainIdHex !== actual.sidechainIdHex
    || expected.checkpointHashHex !== actual.checkpointHashHex
    || expected.checkpointNumber !== actual.checkpointNumber
    || expected.grandpaSetId !== actual.grandpaSetId
    || expected.authorityListScaleHex !== actual.authorityListScaleHex
  ) {
    throw new Error(
      'finalized runtime history states bind different trust anchors',
    );
  }
}

function sameRuntimeIdentity(
  left: PegInRuntimeCodeIdentityV2,
  right: PegInRuntimeCodeIdentityV2,
): boolean {
  const sameDigest =
    left.artifactSha256Hex === right.artifactSha256Hex;
  if (
    sameDigest
    && (
      left.storageKeyHex !== right.storageKeyHex
      || left.artifactSizeBytes !== right.artifactSizeBytes
      || left.buildAttestationId !== right.buildAttestationId
      || left.buildAttestationSha256Hex
        !== right.buildAttestationSha256Hex
    )
  ) {
    throw new Error(
      'one runtime code digest binds conflicting artifact or build-attestation identity',
    );
  }
  return sameDigest;
}

function assertStatementEvaluatorBinding(
  statement: PegInRuntimeIdentityStatementV2,
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
): void {
  const runtime = statement.runtimeCode;
  if (
    runtime.artifactSha256Hex !== evaluator.runtimeCodeSha256Hex
    || runtime.artifactSizeBytes !== evaluator.runtimeCodeSizeBytes
    || runtime.buildAttestationId
      !== evaluator.runtimeBuildAttestationId
    || runtime.buildAttestationSha256Hex
      !== evaluator.runtimeBuildPacketSha256Hex
  ) {
    throw new Error(
      'finalized runtime history state plan runtime does not match its evaluator',
    );
  }
}

function exactRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actualFields = Object.keys(record).sort();
  const sortedExpected = [...expectedFields].sort();
  if (
    actualFields.length !== sortedExpected.length
    || actualFields.some(
      (field, index) => field !== sortedExpected[index],
    )
  ) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  return record;
}

function fixedPrefixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function variablePrefixedHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase bytes`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string`);
  }
  if (BigInt(value) > UINT64_MAX) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function boundedPositiveInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > maximum
  ) {
    throw new Error(`${label} must be between 1 and ${maximum}`);
  }
  return value;
}

function sha256ScaleHex(value: string): string {
  return `0x${createHash('sha256')
    .update(Buffer.from(value.slice(2), 'hex'))
    .digest('hex')}`;
}

function sha256Digest(value: unknown): string {
  return `0x${createHash('sha256')
    .update(HISTORY_DIGEST_DOMAIN)
    .update(Buffer.from(JSON.stringify(value), 'utf8'))
    .digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
