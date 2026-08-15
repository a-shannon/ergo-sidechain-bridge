import {
  createOperatorHealthPersistenceAdapter,
  type OperatorHealthPersistenceStateSource,
} from '../../adapters/operator-health-state.js';
import type {
  ErgoReadQuorumSnapshot,
} from '../../relayer-core/ergo-read-quorum-supervisor.js';
import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthPolicyV1,
  type OperatorHealthProjection,
  type OperatorHealthSignerAvailability,
  type OperatorSolvencyObservationState,
} from '../../relayer-core/operator-health-projection.js';

export interface BridgeDaemonOperatorHealthCircuitState {
  readonly open: boolean;
  readonly incidentCount: number;
  readonly continuityStatus: 'established' | 'recovery_required';
  readonly externalContinuityWitnessCurrent: boolean;
  readonly retainedExecutionAuthority: boolean;
}

export interface BridgeDaemonOperatorHealthInput {
  readonly observedAtMs: number;
  readonly policy: OperatorHealthPolicyV1;
  readonly state: OperatorHealthPersistenceStateSource;
  readonly signerAvailability: OperatorHealthSignerAvailability;
  readonly readQuorumSnapshot: ErgoReadQuorumSnapshot;
  readonly processFundsReleaseHoldOpen: boolean;
  readonly circuitBreaker: BridgeDaemonOperatorHealthCircuitState;
  readonly solvency: Readonly<{
    state: OperatorSolvencyObservationState;
    observedAtMs: number | null;
  }>;
  readonly commitment: Readonly<{
    configured: boolean;
    ready: boolean;
    observedAtMs: number | null;
    observedErgoHeight: number | null;
    currentErgoHeight: number | null;
  }>;
  readonly finality: Readonly<{
    observedAtMs: number | null;
    finalizedSidechainHeight: number | null;
    currentSidechainHeight: number | null;
  }>;
  readonly pegInReorgReconciliationPending: boolean;
}

function multiplySafe(value: number, factor: number, label: string): number {
  const result = value * factor;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error(`${label} exceeds the safe operator-health range`);
  }
  return result;
}

export function createBridgeDaemonOperatorHealthPolicy(input: Readonly<{
  pollingIntervalMs: number;
  ergoReadQuorumMaxAgeMs: number;
  commitmentMaxLagBlocks: number;
  finalityMaxLagBlocks: number;
}>): OperatorHealthPolicyV1 {
  const readQuorumWindow = multiplySafe(
    input.ergoReadQuorumMaxAgeMs,
    2,
    'operator-health read-quorum window',
  );
  const fastCycleWindow = multiplySafe(
    input.pollingIntervalMs,
    4,
    'operator-health fast-cycle window',
  );
  const solvencyCycleWindow = multiplySafe(
    input.pollingIntervalMs,
    60,
    'operator-health solvency-cycle window',
  );
  const stalledSettlementWindow = multiplySafe(
    input.pollingIntervalMs,
    120,
    'operator-health stalled-settlement window',
  );
  return createOperatorHealthPolicyV1({
    readQuorumMaxAgeMs: input.ergoReadQuorumMaxAgeMs,
    commitmentMaxAgeMs: Math.max(readQuorumWindow, fastCycleWindow),
    commitmentMaxLagBlocks: input.commitmentMaxLagBlocks,
    finalityMaxAgeMs: Math.max(readQuorumWindow, fastCycleWindow),
    finalityMaxLagBlocks: input.finalityMaxLagBlocks,
    solvencyMaxAgeMs: Math.max(readQuorumWindow, solvencyCycleWindow),
    stalledSettlementAgeMs: Math.max(900_000, stalledSettlementWindow),
  });
}

export function buildBridgeDaemonOperatorHealth(
  input: BridgeDaemonOperatorHealthInput,
): OperatorHealthProjection {
  const persistence =
    createOperatorHealthPersistenceAdapter(input.state).read();
  const accepted = input.readQuorumSnapshot.lastAcceptedObservation;
  return projectOperatorHealth({
    observedAtMs: input.observedAtMs,
    policy: input.policy,
    signer: {
      availability: input.signerAvailability,
    },
    readQuorum: {
      state: input.readQuorumSnapshot.state,
      fundsReleaseHeld: input.readQuorumSnapshot.fundsReleaseHeld,
      consecutiveFailures: input.readQuorumSnapshot.consecutiveFailures,
      lastFailureCode: input.readQuorumSnapshot.lastFailureCode,
      lastAcceptedAtMs: accepted?.completedAtMs ?? null,
    },
    fundsRelease: {
      processHoldOpen: input.processFundsReleaseHoldOpen,
      durableHoldOpen: input.circuitBreaker.open,
      incidentCount: input.circuitBreaker.incidentCount,
      continuityStatus: input.circuitBreaker.continuityStatus,
      externalContinuityWitnessCurrent:
        input.circuitBreaker.externalContinuityWitnessCurrent,
      retainedExecutionAuthority:
        input.circuitBreaker.retainedExecutionAuthority,
    },
    solvency: input.solvency,
    commitment: input.commitment,
    finality: input.finality,
    reorg: {
      reconciliationPending: input.pegInReorgReconciliationPending,
    },
    persistence,
  });
}

export function operatorHealthStateFingerprint(
  projection: OperatorHealthProjection,
): string {
  return JSON.stringify({
    schema: projection.schema,
    overall: projection.overall,
    reasons: projection.reasons,
    signer: projection.signals.signer,
    readQuorum: {
      status: projection.signals.readQuorum.status,
      state: projection.signals.readQuorum.state,
      consecutiveFailures:
        projection.signals.readQuorum.consecutiveFailures,
      lastFailureCode: projection.signals.readQuorum.lastFailureCode,
    },
    fundsRelease: projection.signals.fundsRelease,
    solvency: {
      status: projection.signals.solvency.status,
      observationState: projection.signals.solvency.observationState,
      durableDeficitIncidentPresent:
        projection.signals.solvency.durableDeficitIncidentPresent,
    },
    commitment: {
      status: projection.signals.commitment.status,
      configured: projection.signals.commitment.configured,
      ready: projection.signals.commitment.ready,
    },
    finality: {
      status: projection.signals.finality.status,
    },
    reorg: projection.signals.reorg,
    settlement: {
      status: projection.signals.settlement.status,
      activeAttemptCount:
        projection.signals.settlement.activeAttemptCount,
      stalled: projection.signals.settlement.stalled,
    },
    persistence: projection.signals.persistence,
  });
}
