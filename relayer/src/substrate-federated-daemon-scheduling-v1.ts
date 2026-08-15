/**
 * Non-authorizing FED-4 daemon scheduling composition.
 *
 * Every active pass recollects FED-1/FED-2/FED-3 producer inputs and
 * rebuilds the exact same-process FED-4A1 candidate set. Scheduling records
 * are write-only observations: they cannot restore candidate provenance or
 * authorize checking, signing, submission, broadcast, minting, or payout.
 */

import type {
  AuthenticatedSettlementCandidateRevalidationView,
} from './relayer-core/authenticated-settlement-candidate-reconciliation.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  consumeSubstrateFederatedMintReservationProducerV1,
  recollectSubstrateFederatedMintReservationProducerV1,
  type SubstrateFederatedMintReservationProducerV1Result,
} from './substrate-federated-mint-reservation-producer-v1.js';
import {
  consumeSubstrateFederatedCheckpointTrackerProducerV1,
  recollectSubstrateFederatedCheckpointTrackerProducerV1,
  type SubstrateFederatedCheckpointTrackerProducerV1Result,
} from './substrate-federated-checkpoint-tracker-producer-v1.js';
import {
  consumeSubstrateFederatedSettlementPredecessorProducerV1,
  getSubstrateFederatedSettlementPredecessorPacketBindingV1,
  recollectSubstrateFederatedSettlementPredecessorProducerV1,
  type SubstrateFederatedSettlementPredecessorProducerV1Result,
} from './substrate-federated-settlement-predecessor-producer-v1.js';
import {
  runSubstrateFederatedCandidateIntegrationV1,
  type SubstrateFederatedCandidateIntegrationV1Result,
  type SubstrateFederatedCandidateIntegrationV1Deps,
} from './apps/bridge-daemon/substrate-federated-candidate-integration-v1.js';
import {
  buildSubstrateFederatedDaemonCandidatesV1,
  type BuildSubstrateFederatedDaemonCandidatesV1Input,
  type SubstrateFederatedBurnDaemonCandidateV1,
  type SubstrateFederatedDaemonCandidatesV1,
  type SubstrateFederatedMintDaemonCandidateV1,
} from './substrate-federated-daemon-candidates-v1.js';
import {
  assertSubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';

export const SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1_SCHEMA =
  'e2s.substrate-federated-daemon-scheduling-profile.v1' as const;
export const SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-daemon-scheduling-observation.v1' as const;
export const SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_V1_SCHEMA =
  'e2s.substrate-federated-daemon-scheduling.v1' as const;
export const SUBSTRATE_FEDERATED_DAEMON_SOURCE_REVALIDATION_V1_SCHEMA =
  'e2s.substrate-federated-daemon-source-revalidation.v1' as const;
const CURRENT_INPUT_REVALIDATION_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_CURRENT_INPUT_REVALIDATION_V1';
const SOURCE_GENERATION_REVALIDATION_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_SOURCE_GENERATION_REVALIDATION_V1';
const SOURCE_REVALIDATION_RECEIPT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_SOURCE_REVALIDATION_RECEIPT_V1';
const SOURCE_REVALIDATION_OBSERVATION_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_SOURCE_REVALIDATION_OBSERVATION_V1';
const SCHEDULING_FAILURE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_FAILURE_V1';

export type SubstrateFederatedDaemonSchedulingFailureStageV1 =
  | 'cycle_validation'
  | 'producer_collection'
  | 'candidate_reconstruction'
  | 'candidate_reconciliation'
  | 'source_generation_revalidation'
  | 'final_candidate_reconciliation'
  | 'observation_construction'
  | 'observation_record';

export class SubstrateFederatedDaemonSchedulingFailureV1 extends Error {
  readonly failureDigestHex: string;

  constructor(
    readonly stage: SubstrateFederatedDaemonSchedulingFailureStageV1,
    cause: unknown,
  ) {
    const causeName = cause instanceof Error ? cause.name : typeof cause;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`federated daemon scheduling ${stage} failed: ${causeMessage}`);
    this.name = 'SubstrateFederatedDaemonSchedulingFailureV1';
    this.failureDigestHex = sha256CanonicalJson({
      stage,
      causeName,
      causeMessage,
    }, SCHEDULING_FAILURE_DOMAIN);
  }
}

type FederatedIntegrationDeps<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> = SubstrateFederatedCandidateIntegrationV1Deps<
  SubstrateFederatedMintDaemonCandidateV1,
  SubstrateFederatedBurnDaemonCandidateV1,
  Revalidation
>;

export type SubstrateFederatedDaemonSchedulingProfileV1<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> = Readonly<{
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1_SCHEMA;
  readonly version: 1;
  readonly profileIdHex: string;
  readonly collectFreshProducerInputs: () => Promise<
    Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>
  >;
  readonly state: FederatedIntegrationDeps<Revalidation>['state'];
  readonly ergo: FederatedIntegrationDeps<Revalidation>['ergo'];
  readonly observeBurn: FederatedIntegrationDeps<Revalidation>['observeBurn'];
  readonly recollect: FederatedIntegrationDeps<Revalidation>['recollect'];
  readonly log?: FederatedIntegrationDeps<Revalidation>['log'];
}>;

export type SubstrateFederatedDaemonFreshProducerInputsV1 = Readonly<
  Omit<
    BuildSubstrateFederatedDaemonCandidatesV1Input,
    | 'mintReservationStatement'
    | 'checkpointProfile'
    | 'checkpointStatement'
  > & {
    readonly mint:
      Readonly<SubstrateFederatedMintReservationProducerV1Result>;
    readonly checkpoint:
      Readonly<SubstrateFederatedCheckpointTrackerProducerV1Result>;
    readonly settlementPredecessors:
      Readonly<SubstrateFederatedSettlementPredecessorProducerV1Result>;
  }
>;

export interface SubstrateFederatedDaemonSchedulingCycleV1 {
  readonly ergoHeight: number;
  readonly ergoHeaderIdHex: string;
  readonly sidechainFinalizedNativeHeight: number;
  readonly sidechainFinalizedNativeBlockHashHex: string;
  readonly pegOutObservationComplete: true;
}

interface FalseSchedulingAuthorityBoundary {
  readonly localRecordAuthoritative: false;
  readonly candidateSnapshotRestorable: false;
  readonly checkPassed: false;
  readonly mintAuthorized: false;
  readonly trackerAdmissionAuthorized: false;
  readonly payoutAuthorized: false;
  readonly signingAuthorized: false;
  readonly submissionAuthorized: false;
  readonly broadcastAuthorized: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
  readonly trustlessStatusEstablished: false;
  readonly productionReadinessEstablished: false;
}

export interface SubstrateFederatedDaemonSchedulingObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'scheduled_non_authorizing';
  readonly profileIdHex: string;
  readonly familyIdHex: string;
  readonly mintCandidateId: string;
  readonly burnCandidateId: string;
  readonly settlementTransactionIdHex: string;
  readonly settlementTransactionDigestHex: string;
  readonly checkpointProfileIdHex: string;
  readonly checkpointStatementIdHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerInputDigestHex: string;
  readonly mintObservationDigestHex: string;
  readonly burnRevalidationDigestHex: string;
  readonly sourceGenerationRevalidationDigestHex: string;
  readonly settlementPredecessorLastUseObservationDigestHex: string;
  readonly currentInputRevalidationDigestHex: string;
  readonly cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>;
  readonly reconciliation: {
    readonly activeCandidates: 1;
    readonly refreshedRevalidations: 1;
    readonly retainedRevalidations: 0;
    readonly deferredCandidates: 0;
    readonly invalidatedCandidates: 0;
    readonly revertedBurns: 0;
  };
  readonly boundary: Readonly<FalseSchedulingAuthorityBoundary> & {
    readonly producerInputsCollectedFresh: true;
    readonly mintProducerProvenanceVerified: true;
    readonly mintProducerCycleBlockMatched: true;
    readonly checkpointProducerProvenanceVerified: true;
    readonly checkpointProducerFinalizedHeadMatched: true;
    readonly checkpointProducerErgoTipMatched: true;
    readonly checkpointProducerSettlementTrackerMatched: true;
    readonly settlementPredecessorProducerProvenanceVerified: true;
    readonly settlementPredecessorProducerErgoTipMatched: true;
    readonly settlementPredecessorProducerPacketMatched: true;
    readonly mintProducerReobservedAtLastUse: true;
    readonly checkpointProducerReobservedAtLastUse: true;
    readonly settlementPredecessorsReobservedAtLastUse: true;
    readonly sourceGenerationStableAtLastUse: true;
    readonly burnReconciledAfterSourceReobservation: true;
    readonly candidatesRebuiltInCurrentProcess: true;
    readonly runLocalRevalidationCacheUsed: true;
    readonly completePegOutObservationRequired: true;
  };
}

export interface SubstrateFederatedDaemonSourceRevalidationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DAEMON_SOURCE_REVALIDATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'current_non_authorizing';
  readonly profileIdHex: string;
  readonly familyIdHex: string;
  readonly mintCandidateId: string;
  readonly burnCandidateId: string;
  readonly settlementTransactionIdHex: string;
  readonly settlementTransactionDigestHex: string;
  readonly checkpointProfileIdHex: string;
  readonly checkpointStatementIdHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerInputDigestHex: string;
  readonly schedulingObservationDigestHex: string;
  readonly sourceGenerationRevalidationDigestHex: string;
  readonly settlementPredecessorObservationDigestHex: string;
  readonly burnRevalidationDigestHex: string;
  readonly currentInputRevalidationDigestHex: string;
  readonly receiptDigestHex: string;
  readonly boundary: Readonly<FalseSchedulingAuthorityBoundary> & {
    readonly originalProducerPortsReused: true;
    readonly sourceGenerationStable: true;
    readonly burnReconciledBeforeProducerReads: true;
    readonly burnReconciledAfterProducerReads: true;
    readonly trackerAdmissionReplayed: true;
    readonly settlementPacketProvenanceVerified: true;
  };
}

type SchedulingRevalidationContext = Readonly<{
  profile: SubstrateFederatedDaemonSchedulingProfileV1<
    AuthenticatedSettlementCandidateRevalidationView
  >;
  candidates: Readonly<SubstrateFederatedDaemonCandidatesV1>;
  producerInputs: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>;
}>;

const SCHEDULING_REVALIDATION_CONTEXTS = new WeakMap<
  object,
  SchedulingRevalidationContext
>();
const SOURCE_REVALIDATION_RECEIPTS = new WeakSet<object>();

export type SubstrateFederatedDaemonSchedulingV1Result =
  | Readonly<{
      readonly schema: typeof SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_V1_SCHEMA;
      readonly version: 1;
      readonly status: 'inactive';
      readonly boundary: Readonly<FalseSchedulingAuthorityBoundary>;
    }>
  | Readonly<{
      readonly schema: typeof SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_V1_SCHEMA;
      readonly version: 1;
      readonly status: 'scheduled_non_authorizing';
      readonly observation:
        Readonly<SubstrateFederatedDaemonSchedulingObservationV1>;
      readonly boundary: Readonly<FalseSchedulingAuthorityBoundary>;
    }>;

export interface RunSubstrateFederatedDaemonSchedulingV1Input<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  readonly profile:
    SubstrateFederatedDaemonSchedulingProfileV1<Revalidation> | null;
  readonly cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>;
  readonly record: (
    observation: Readonly<SubstrateFederatedDaemonSchedulingObservationV1>,
  ) => void | Promise<void>;
}

/**
 * Runtime activation is source-controlled and intentionally absent. A future
 * activation must replace this constant with one statically constructed,
 * reviewed profile; environment or database state cannot register one.
 */
export const ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1:
  SubstrateFederatedDaemonSchedulingProfileV1<
    AuthenticatedSettlementCandidateRevalidationView
  > | null = null;

export async function runSubstrateFederatedDaemonSchedulingV1<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  input: RunSubstrateFederatedDaemonSchedulingV1Input<Revalidation>,
): Promise<Readonly<SubstrateFederatedDaemonSchedulingV1Result>> {
  const boundary = falseSchedulingAuthorityBoundary();
  if (input.profile === null) {
    return deepFreeze({
      schema: SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_V1_SCHEMA,
      version: 1 as const,
      status: 'inactive' as const,
      boundary,
    });
  }
  const profile = input.profile;

  runSchedulingStage('cycle_validation', () => {
    assertCycle(input.cycle);
    assertProfile(profile as SubstrateFederatedDaemonSchedulingProfileV1<
      AuthenticatedSettlementCandidateRevalidationView
    >);
  });
  const producerInputs = await runSchedulingStageAsync(
    'producer_collection',
    async () => {
      const collected = await profile.collectFreshProducerInputs();
      assertFreshProducerInputs(collected, input.cycle);
      return collected;
    },
  );
  const candidates = runSchedulingStage('candidate_reconstruction', () =>
    buildSubstrateFederatedDaemonCandidatesV1({
      mintReservationStatement:
        producerInputs.mint.mintReservationStatement,
      checkpointProfile: producerInputs.checkpoint.checkpointProfile,
      checkpointStatement: producerInputs.checkpoint.checkpointStatement,
      familyIdentity: producerInputs.familyIdentity,
      settlementPacket: producerInputs.settlementPacket,
    }));
  await runSchedulingStageAsync(
    'candidate_reconciliation',
    () => reconcileCurrentCandidate(candidates, producerInputs, profile),
  );
  const lastUseProducerInputs = await runSchedulingStageAsync(
    'source_generation_revalidation',
    async () => {
      const [mint, checkpoint, settlementPredecessors] = await Promise.all([
        recollectSubstrateFederatedMintReservationProducerV1(
          producerInputs.mint,
        ),
        recollectSubstrateFederatedCheckpointTrackerProducerV1(
          producerInputs.checkpoint,
        ),
        recollectSubstrateFederatedSettlementPredecessorProducerV1(
          producerInputs.settlementPredecessors,
        ),
      ]);
      const recollected = {
        mint,
        checkpoint,
        settlementPredecessors,
        familyIdentity: producerInputs.familyIdentity,
        settlementPacket: producerInputs.settlementPacket,
      };
      assertFreshProducerInputs(recollected, input.cycle);
      assertSameProducerGeneration(producerInputs, recollected);
      return recollected;
    },
  );
  const { integration, revalidation } = await runSchedulingStageAsync(
    'final_candidate_reconciliation',
    () => reconcileCurrentCandidate(candidates, producerInputs, profile),
  );
  const burnRevalidationDigestHex = fixedHex(
    revalidation.revalidationDigestHex,
    'burn revalidation digest',
  );
  const settlementPredecessorLastUseObservationDigestHex = fixedHex(
    lastUseProducerInputs.settlementPredecessors.predecessorState
      .stateObservationDigestHex,
    'last-use settlement predecessor observation digest',
  );
  const sourceGenerationRevalidationDigestHex =
    producerGenerationDigest(lastUseProducerInputs);
  const currentInputRevalidationDigestHex = sha256CanonicalJson({
    burnCandidateId: candidates.burn.candidateId,
    settlementTransactionIdHex: candidates.burn.settlementTransactionIdHex,
    burnRevalidationDigestHex,
    sourceGenerationRevalidationDigestHex,
    settlementPredecessorLastUseObservationDigestHex,
  }, CURRENT_INPUT_REVALIDATION_DOMAIN);

  const observation = runSchedulingStage('observation_construction', () =>
    deepFreeze({
      schema: SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_OBSERVATION_V1_SCHEMA,
      version: 1 as const,
      status: 'scheduled_non_authorizing' as const,
      profileIdHex: fixedHex(profile.profileIdHex, 'scheduling profile ID'),
      familyIdHex: candidates.sharedProfile.familyIdHex,
      mintCandidateId: integration.mintCandidateId,
      burnCandidateId: integration.burnCandidateId,
      settlementTransactionIdHex:
        candidates.burn.settlementTransactionIdHex,
      settlementTransactionDigestHex:
        candidates.burn.settlementTransactionDigestHex,
      checkpointProfileIdHex: candidates.burn.checkpointProfileIdHex,
      checkpointStatementIdHex: candidates.burn.checkpointStatementIdHex,
      trackerKeyHex: candidates.burn.trackerKeyHex,
      trackerValueHex: candidates.burn.trackerValueHex,
      trackerInputDigestHex: candidates.burn.trackerInputDigestHex,
      mintObservationDigestHex: integration.mintObservationDigestHex,
      burnRevalidationDigestHex,
      sourceGenerationRevalidationDigestHex,
      settlementPredecessorLastUseObservationDigestHex,
      currentInputRevalidationDigestHex,
      cycle: {
        ergoHeight: input.cycle.ergoHeight,
        ergoHeaderIdHex: fixedHex(
          input.cycle.ergoHeaderIdHex,
          'cycle Ergo header ID',
        ),
        sidechainFinalizedNativeHeight:
          input.cycle.sidechainFinalizedNativeHeight,
        sidechainFinalizedNativeBlockHashHex: fixedHex(
          input.cycle.sidechainFinalizedNativeBlockHashHex,
          'cycle finalized sidechain native block hash',
        ),
        pegOutObservationComplete: true as const,
      },
      reconciliation: {
        activeCandidates: 1 as const,
        refreshedRevalidations: 1 as const,
        retainedRevalidations: 0 as const,
        deferredCandidates: 0 as const,
        invalidatedCandidates: 0 as const,
        revertedBurns: 0 as const,
      },
      boundary: {
        ...boundary,
        producerInputsCollectedFresh: true as const,
        mintProducerProvenanceVerified: true as const,
        mintProducerCycleBlockMatched: true as const,
        checkpointProducerProvenanceVerified: true as const,
        checkpointProducerFinalizedHeadMatched: true as const,
        checkpointProducerErgoTipMatched: true as const,
        checkpointProducerSettlementTrackerMatched: true as const,
        settlementPredecessorProducerProvenanceVerified: true as const,
        settlementPredecessorProducerErgoTipMatched: true as const,
        settlementPredecessorProducerPacketMatched: true as const,
        mintProducerReobservedAtLastUse: true as const,
        checkpointProducerReobservedAtLastUse: true as const,
        settlementPredecessorsReobservedAtLastUse: true as const,
        sourceGenerationStableAtLastUse: true as const,
        burnReconciledAfterSourceReobservation: true as const,
        candidatesRebuiltInCurrentProcess: true as const,
        runLocalRevalidationCacheUsed: true as const,
        completePegOutObservationRequired: true as const,
      },
    }));
  await runSchedulingStageAsync('observation_record', async () => {
    await input.record(observation);
  });
  SCHEDULING_REVALIDATION_CONTEXTS.set(observation, Object.freeze({
    profile: profile as SubstrateFederatedDaemonSchedulingProfileV1<
      AuthenticatedSettlementCandidateRevalidationView
    >,
    candidates,
    producerInputs: lastUseProducerInputs,
  }));
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_V1_SCHEMA,
    version: 1 as const,
    status: 'scheduled_non_authorizing' as const,
    observation,
    boundary,
  });
}

/**
 * Recollect the exact scheduled work through its original process-owned ports.
 * A serialized or cloned scheduling observation has no access to this path.
 */
export async function revalidateSubstrateFederatedDaemonSchedulingObservationV1(
  observation: Readonly<SubstrateFederatedDaemonSchedulingObservationV1>,
): Promise<Readonly<SubstrateFederatedDaemonSourceRevalidationV1>> {
  const context = SCHEDULING_REVALIDATION_CONTEXTS.get(observation);
  if (context === undefined) {
    throw new Error(
      'federated scheduling observation provenance is missing for source revalidation',
    );
  }

  await reconcileCurrentCandidate(
    context.candidates,
    context.producerInputs,
    context.profile,
  );
  const [mint, checkpoint, settlementPredecessors] = await Promise.all([
    recollectSubstrateFederatedMintReservationProducerV1(
      context.producerInputs.mint,
    ),
    recollectSubstrateFederatedCheckpointTrackerProducerV1(
      context.producerInputs.checkpoint,
    ),
    recollectSubstrateFederatedSettlementPredecessorProducerV1(
      context.producerInputs.settlementPredecessors,
    ),
  ]);
  const producerInputs = {
    mint,
    checkpoint,
    settlementPredecessors,
    familyIdentity: context.producerInputs.familyIdentity,
    settlementPacket: context.producerInputs.settlementPacket,
  };
  assertFreshProducerInputs(producerInputs, observation.cycle);
  assertSameProducerGeneration(context.producerInputs, producerInputs);
  const { integration, revalidation } = await reconcileCurrentCandidate(
    context.candidates,
    producerInputs,
    context.profile,
  );
  assertSubstrateFederatedBurnSettlementV1Packet(
    producerInputs.settlementPacket,
  );
  const trackerValue = producerInputs.settlementPacket.tracker.decodedValue;
  const replayedTrackerAdmission = buildSubstrateFederatedTrackerAdmissionV1({
    profile: producerInputs.checkpoint.checkpointProfile,
    encodedStatementHex:
      producerInputs.checkpoint.checkpointStatement.encodedStatementHex,
    currentErgoHeight: observation.cycle.ergoHeight,
    anchorHeaderIdHex: trackerValue.anchorHeaderIdHex,
    anchorHeaderHeight: trackerValue.anchorHeaderHeight,
  });
  assertHexEqual(
    replayedTrackerAdmission.trackerKeyHex,
    context.candidates.burn.trackerKeyHex,
    'source revalidation tracker-admission key',
  );
  if (
    replayedTrackerAdmission.trackerValueHex
      !== context.candidates.burn.trackerValueHex
  ) {
    throw new Error(
      'source revalidation tracker-admission value differs from the scheduled candidate',
    );
  }

  const sourceGenerationRevalidationDigestHex =
    producerGenerationDigest(producerInputs);
  const settlementPredecessorObservationDigestHex = fixedHex(
    producerInputs.settlementPredecessors.predecessorState
      .stateObservationDigestHex,
    'source revalidation settlement predecessor observation digest',
  );
  const burnRevalidationDigestHex = fixedHex(
    revalidation.revalidationDigestHex,
    'source revalidation burn digest',
  );
  const currentInputRevalidationDigestHex = sha256CanonicalJson({
    burnCandidateId: context.candidates.burn.candidateId,
    settlementTransactionIdHex:
      context.candidates.burn.settlementTransactionIdHex,
    burnRevalidationDigestHex,
    sourceGenerationRevalidationDigestHex,
    settlementPredecessorLastUseObservationDigestHex:
      settlementPredecessorObservationDigestHex,
  }, CURRENT_INPUT_REVALIDATION_DOMAIN);

  assertHexEqual(
    integration.mintCandidateId,
    observation.mintCandidateId,
    'source revalidation mint candidate ID',
  );
  assertHexEqual(
    integration.burnCandidateId,
    observation.burnCandidateId,
    'source revalidation burn candidate ID',
  );
  assertHexEqual(
    context.candidates.burn.settlementTransactionIdHex,
    observation.settlementTransactionIdHex,
    'source revalidation settlement transaction ID',
  );
  assertHexEqual(
    integration.mintObservationDigestHex,
    observation.mintObservationDigestHex,
    'source revalidation mint observation digest',
  );
  assertHexEqual(
    sourceGenerationRevalidationDigestHex,
    observation.sourceGenerationRevalidationDigestHex,
    'source revalidation producer generation digest',
  );
  assertHexEqual(
    settlementPredecessorObservationDigestHex,
    observation.settlementPredecessorLastUseObservationDigestHex,
    'source revalidation settlement predecessor digest',
  );
  assertHexEqual(
    burnRevalidationDigestHex,
    observation.burnRevalidationDigestHex,
    'source revalidation burn digest',
  );
  assertHexEqual(
    currentInputRevalidationDigestHex,
    observation.currentInputRevalidationDigestHex,
    'source revalidation current-input digest',
  );

  const schedulingObservationDigestHex = sha256CanonicalJson(
    observation,
    SOURCE_REVALIDATION_OBSERVATION_DOMAIN,
  );
  const receiptBinding = {
    profileIdHex: observation.profileIdHex,
    familyIdHex: observation.familyIdHex,
    mintCandidateId: observation.mintCandidateId,
    burnCandidateId: observation.burnCandidateId,
    settlementTransactionIdHex: observation.settlementTransactionIdHex,
    settlementTransactionDigestHex:
      context.candidates.burn.settlementTransactionDigestHex,
    checkpointProfileIdHex:
      context.candidates.burn.checkpointProfileIdHex,
    checkpointStatementIdHex:
      context.candidates.burn.checkpointStatementIdHex,
    trackerKeyHex: context.candidates.burn.trackerKeyHex,
    trackerValueHex: context.candidates.burn.trackerValueHex,
    trackerInputDigestHex: context.candidates.burn.trackerInputDigestHex,
    schedulingObservationDigestHex,
    sourceGenerationRevalidationDigestHex,
    settlementPredecessorObservationDigestHex,
    burnRevalidationDigestHex,
    currentInputRevalidationDigestHex,
  };
  const receipt = deepFreeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_SOURCE_REVALIDATION_V1_SCHEMA,
    version: 1 as const,
    status: 'current_non_authorizing' as const,
    ...receiptBinding,
    receiptDigestHex: sha256CanonicalJson(
      receiptBinding,
      SOURCE_REVALIDATION_RECEIPT_DOMAIN,
    ),
    boundary: {
      ...falseSchedulingAuthorityBoundary(),
      originalProducerPortsReused: true as const,
      sourceGenerationStable: true as const,
      burnReconciledBeforeProducerReads: true as const,
      burnReconciledAfterProducerReads: true as const,
      trackerAdmissionReplayed: true as const,
      settlementPacketProvenanceVerified: true as const,
    },
  });
  SOURCE_REVALIDATION_RECEIPTS.add(receipt);
  SCHEDULING_REVALIDATION_CONTEXTS.set(observation, Object.freeze({
    ...context,
    producerInputs,
  }));
  return receipt;
}

export function assertSubstrateFederatedDaemonSourceRevalidationV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedDaemonSourceRevalidationV1> {
  if (
    value === null
    || typeof value !== 'object'
    || !SOURCE_REVALIDATION_RECEIPTS.has(value)
  ) {
    throw new Error(
      'federated daemon source-revalidation provenance is missing',
    );
  }
}

async function reconcileCurrentCandidate<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  candidates: Readonly<SubstrateFederatedDaemonCandidatesV1>,
  producerInputs: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>,
  profile: SubstrateFederatedDaemonSchedulingProfileV1<Revalidation>,
): Promise<Readonly<{
  integration: Readonly<SubstrateFederatedCandidateIntegrationV1Result>;
  revalidation: Revalidation;
}>> {
  const revalidations = new Map<string, Revalidation>();
  const integration = await runSubstrateFederatedCandidateIntegrationV1({
    prepareFresh: async () => candidates,
    observeMint: async () => producerInputs.mint.mintObservation,
    state: profile.state,
    ergo: profile.ergo,
    revalidations,
    observeBurn: profile.observeBurn,
    recollect: profile.recollect,
    ...(profile.log === undefined ? {} : { log: profile.log }),
  });
  const reconciliation = integration.burnReconciliation;
  if (
    reconciliation.activeCandidates !== 1
    || reconciliation.prunedRevalidations !== 0
    || reconciliation.refreshedRevalidations !== 1
    || reconciliation.retainedRevalidations !== 0
    || reconciliation.deferredCandidates !== 0
    || reconciliation.invalidatedCandidates !== 0
    || reconciliation.revertedBurns !== 0
  ) {
    throw new Error(
      'federated daemon scheduling requires one freshly revalidated burn candidate',
    );
  }
  const revalidation = revalidations.get(candidates.burn.candidateId);
  if (revalidation === undefined) {
    throw new Error(
      'federated daemon scheduling revalidation was not retained in the run-local cache',
    );
  }
  assertHexEqual(
    revalidation.expectedTxId,
    candidates.burn.settlementTransactionIdHex,
    'federated daemon scheduling transaction ID',
  );
  return Object.freeze({ integration, revalidation });
}

function runSchedulingStage<T>(
  stage: SubstrateFederatedDaemonSchedulingFailureStageV1,
  operation: () => T,
): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof SubstrateFederatedDaemonSchedulingFailureV1) {
      throw error;
    }
    throw new SubstrateFederatedDaemonSchedulingFailureV1(stage, error);
  }
}

async function runSchedulingStageAsync<T>(
  stage: SubstrateFederatedDaemonSchedulingFailureStageV1,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SubstrateFederatedDaemonSchedulingFailureV1) {
      throw error;
    }
    throw new SubstrateFederatedDaemonSchedulingFailureV1(stage, error);
  }
}

function assertProfile(
  profile: SubstrateFederatedDaemonSchedulingProfileV1<
    AuthenticatedSettlementCandidateRevalidationView
  >,
): void {
  if (
    profile.schema !== SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1_SCHEMA
    || profile.version !== 1
    || !Object.isFrozen(profile)
  ) {
    throw new Error(
      'federated daemon scheduling profile must be one frozen static V1 profile',
    );
  }
  assertExactKeys(profile, [
    'schema',
    'version',
    'profileIdHex',
    'collectFreshProducerInputs',
    'state',
    'ergo',
    'observeBurn',
    'recollect',
  ], 'federated daemon scheduling profile', ['log']);
  fixedHex(profile.profileIdHex, 'scheduling profile ID');
}

function assertFreshProducerInputs(
  inputs: SubstrateFederatedDaemonFreshProducerInputsV1,
  cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>,
): void {
  assertExactKeys(inputs, [
    'mint',
    'checkpoint',
    'settlementPredecessors',
    'familyIdentity',
    'settlementPacket',
  ], 'federated daemon fresh producer input');
  consumeSubstrateFederatedMintReservationProducerV1(inputs.mint);
  consumeSubstrateFederatedCheckpointTrackerProducerV1(inputs.checkpoint);
  consumeSubstrateFederatedSettlementPredecessorProducerV1(
    inputs.settlementPredecessors,
  );
  if (
    inputs.mint.finalizedSourceState.targetNativeHeight
      !== String(cycle.sidechainFinalizedNativeHeight)
    || inputs.mint.finalizedSourceState.targetNativeBlockHashHex
      !== normalizeHex(cycle.sidechainFinalizedNativeBlockHashHex)
  ) {
    throw new Error(
      'federated mint-reservation producer block differs from the scheduling cycle',
    );
  }
  if (
    inputs.checkpoint.finalizedSourceState.reportedFinalizedHeadHeight
      !== String(cycle.sidechainFinalizedNativeHeight)
    || inputs.checkpoint.finalizedSourceState.reportedFinalizedHeadHashHex
      !== normalizeHex(cycle.sidechainFinalizedNativeBlockHashHex)
  ) {
    throw new Error(
      'federated checkpoint producer finalized head differs from the scheduling cycle',
    );
  }
  if (
    inputs.checkpoint.ergoTrackerState.observedErgoTipHeight
      !== cycle.ergoHeight
    || inputs.checkpoint.ergoTrackerState.observedErgoTipIdHex
      !== normalizeHex(cycle.ergoHeaderIdHex)
  ) {
    throw new Error(
      'federated checkpoint producer Ergo tip differs from the scheduling cycle',
    );
  }
  const tracker = inputs.checkpoint.ergoTrackerState;
  const packet = inputs.settlementPacket;
  if (
    tracker.trackerBoxIdHex !== packet.boxes.trackerDataInput.boxId
    || tracker.trackerDigestHex !== packet.tracker.inputDigestHex
    || tracker.trackerEntryKeyHex !== packet.tracker.keyHex
    || tracker.trackerEntryValueHex !== packet.tracker.valueHex
  ) {
    throw new Error(
      'federated checkpoint producer tracker differs from the settlement packet',
    );
  }
  assertSettlementPredecessorsMatchCycleAndPacket(
    inputs.settlementPredecessors,
    packet,
    cycle,
  );
}

function assertSettlementPredecessorsMatchCycleAndPacket(
  predecessors: Readonly<
    SubstrateFederatedSettlementPredecessorProducerV1Result
  >,
  packet: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1['settlementPacket']>,
  cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>,
): void {
  if (
    predecessors.predecessorState.observedErgoTipHeight !== cycle.ergoHeight
    || predecessors.predecessorState.observedErgoTipIdHex
      !== normalizeHex(cycle.ergoHeaderIdHex)
  ) {
    throw new Error(
      'federated settlement predecessor producer Ergo tip differs from the scheduling cycle',
    );
  }
  if (
    predecessors.settlementPacketBindingDigestHex
      !== getSubstrateFederatedSettlementPredecessorPacketBindingV1(packet)
  ) {
    throw new Error(
      'federated settlement predecessor producer differs from the settlement packet',
    );
  }
}

function assertSameProducerGeneration(
  initial: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>,
  current: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>,
): void {
  if (producerGenerationDigest(initial) !== producerGenerationDigest(current)) {
    throw new Error(
      'federated source generation changed before scheduling record',
    );
  }
}

function producerGenerationDigest(
  inputs: Readonly<SubstrateFederatedDaemonFreshProducerInputsV1>,
): string {
  return sha256CanonicalJson({
    mint: {
      statementIdHex: inputs.mint.mintObservation.statementIdHex,
      observationDigestHex: inputs.mint.mintObservation.observationDigestHex,
      stateObservationDigestHex:
        inputs.mint.finalizedSourceState.stateObservationDigestHex,
      sourceAgreementDigestHex:
        inputs.mint.finalizedSourceState.sourceAgreementDigestHex,
    },
    checkpoint: {
      statementIdHex: inputs.checkpoint.checkpointStatement.statementIdHex,
      sourceStateObservationDigestHex:
        inputs.checkpoint.finalizedSourceState.stateObservationDigestHex,
      sourceAgreementDigestHex:
        inputs.checkpoint.finalizedSourceState.sourceAgreementDigestHex,
      ergoStateObservationDigestHex:
        inputs.checkpoint.ergoTrackerState.stateObservationDigestHex,
      ergoSourceAgreementDigestHex:
        inputs.checkpoint.ergoTrackerState.sourceAgreementDigestHex,
    },
    settlementPredecessors: {
      stateObservationDigestHex:
        inputs.settlementPredecessors.predecessorState
          .stateObservationDigestHex,
      sourceAgreementDigestHex:
        inputs.settlementPredecessors.predecessorState
          .sourceAgreementDigestHex,
    },
  }, SOURCE_GENERATION_REVALIDATION_DOMAIN);
}

function assertCycle(
  cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>,
): void {
  assertExactKeys(cycle, [
    'ergoHeight',
    'ergoHeaderIdHex',
    'sidechainFinalizedNativeHeight',
    'sidechainFinalizedNativeBlockHashHex',
    'pegOutObservationComplete',
  ], 'federated daemon scheduling cycle');
  if (cycle.pegOutObservationComplete !== true) {
    throw new Error(
      'federated daemon scheduling requires one complete peg-out observation pass',
    );
  }
  positiveSafeHeight(cycle.ergoHeight, 'cycle Ergo height');
  positiveSafeHeight(
    cycle.sidechainFinalizedNativeHeight,
    'cycle finalized sidechain native height',
  );
  fixedHex(cycle.ergoHeaderIdHex, 'cycle Ergo header ID');
  fixedHex(
    cycle.sidechainFinalizedNativeBlockHashHex,
    'cycle finalized sidechain native block hash',
  );
}

function positiveSafeHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function falseSchedulingAuthorityBoundary(): FalseSchedulingAuthorityBoundary {
  return Object.freeze({
    localRecordAuthoritative: false as const,
    candidateSnapshotRestorable: false as const,
    checkPassed: false as const,
    mintAuthorized: false as const,
    trackerAdmissionAuthorized: false as const,
    payoutAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function assertHexEqual(actual: string, expected: string, label: string): void {
  if (normalizeHex(actual) !== normalizeHex(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function fixedHex(value: string, label: string): string {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
  }
  return normalized;
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/i, '').toLowerCase();
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  label: string,
  optional: readonly string[] = [],
): void {
  const actual = Object.keys(value).sort();
  const allowed = [...required, ...optional];
  if (
    required.some(key => !actual.includes(key))
    || actual.some(key => !allowed.includes(key))
  ) {
    throw new Error(
      `${label} must contain exactly: ${[...required].sort().join(', ')}`,
    );
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
