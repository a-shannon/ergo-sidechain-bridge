import type {
  ErgoReadQuorumFailureCode,
  ErgoReadQuorumState,
} from './ergo-read-quorum-supervisor.js';
import type {
  ErgoSignerAvailability,
} from './ergo-signer-availability.js';

export const OPERATOR_HEALTH_POLICY_SCHEMA =
  'e2s.operator-health-policy.v1' as const;
export const OPERATOR_HEALTH_PROJECTION_SCHEMA =
  'e2s.operator-health-projection.v3' as const;

export type OperatorHealthOverallStatus = 'healthy' | 'degraded' | 'held';
export type OperatorHealthSignalStatus =
  | OperatorHealthOverallStatus
  | 'unavailable';
export type OperatorHealthSignerStatus =
  | Extract<OperatorHealthSignalStatus, 'healthy' | 'held'>
  | 'not_applicable';
export type OperatorSolvencyObservationState =
  | 'not_observed'
  | 'clear'
  | 'deficit'
  | 'unavailable';
export type OperatorHealthSignerAvailability =
  | ErgoSignerAvailability
  | 'not_configured';

export type OperatorHealthReason =
  | 'persistence_unavailable'
  | 'operator_clock_rollback'
  | 'signer_unavailable'
  | 'read_quorum_held'
  | 'read_quorum_stale'
  | 'funds_release_held'
  | 'solvency_deficit'
  | 'solvency_unavailable'
  | 'solvency_stale'
  | 'commitment_unavailable'
  | 'commitment_stale'
  | 'commitment_lagging'
  | 'finality_unavailable'
  | 'finality_stale'
  | 'finality_lagging'
  | 'reorg_reconciliation_pending'
  | 'reorg_quarantine_present'
  | 'settlement_stalled';

export interface OperatorHealthPolicyV1 {
  readonly schema: typeof OPERATOR_HEALTH_POLICY_SCHEMA;
  readonly readQuorumMaxAgeMs: number;
  readonly commitmentMaxAgeMs: number;
  readonly commitmentMaxLagBlocks: number;
  readonly finalityMaxAgeMs: number;
  readonly finalityMaxLagBlocks: number;
  readonly solvencyMaxAgeMs: number;
  readonly stalledSettlementAgeMs: number;
}

export interface OperatorHealthPersistenceSnapshot {
  readonly status: 'available';
  readonly solvencyDeficitIncidentPresent: boolean;
  readonly reorgQuarantineConditionCount: number;
  readonly activeSettlementAttemptCount: number;
  readonly oldestActiveSettlementUpdatedAtMs: number | null;
}

export type OperatorHealthPersistenceInput =
  | OperatorHealthPersistenceSnapshot
  | Readonly<{ status: 'unavailable' }>;

export interface OperatorHealthProjectionInput {
  readonly observedAtMs: number;
  readonly policy: OperatorHealthPolicyV1;
  readonly signer: Readonly<{
    availability: OperatorHealthSignerAvailability;
  }>;
  readonly readQuorum: Readonly<{
    state: ErgoReadQuorumState;
    fundsReleaseHeld: boolean;
    consecutiveFailures: number;
    lastFailureCode: ErgoReadQuorumFailureCode | null;
    lastAcceptedAtMs: number | null;
  }>;
  readonly fundsRelease: Readonly<{
    processHoldOpen: boolean;
    durableHoldOpen: boolean;
    incidentCount: number;
    continuityStatus: 'established' | 'recovery_required';
    externalContinuityWitnessCurrent: boolean;
    retainedExecutionAuthority: boolean;
  }>;
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
  readonly reorg: Readonly<{
    reconciliationPending: boolean;
  }>;
  readonly persistence: OperatorHealthPersistenceInput;
}

export interface OperatorHealthProjection {
  readonly schema: typeof OPERATOR_HEALTH_PROJECTION_SCHEMA;
  readonly observedAtMs: number;
  readonly overall: OperatorHealthOverallStatus;
  readonly reasons: readonly OperatorHealthReason[];
  readonly signals: Readonly<{
    signer: Readonly<{
      status: OperatorHealthSignerStatus;
      availability: OperatorHealthSignerAvailability;
    }>;
    readQuorum: Readonly<{
      status: OperatorHealthSignalStatus;
      state: ErgoReadQuorumState;
      ageMs: number | null;
      consecutiveFailures: number;
      lastFailureCode: ErgoReadQuorumFailureCode | null;
    }>;
    fundsRelease: Readonly<{
      status: OperatorHealthSignalStatus;
      processHoldOpen: boolean;
      durableHoldOpen: boolean;
      incidentCount: number;
      continuityStatus: 'established' | 'recovery_required';
      externalContinuityWitnessCurrent: boolean;
      retainedExecutionAuthority: boolean;
    }>;
    solvency: Readonly<{
      status: OperatorHealthSignalStatus;
      observationState: OperatorSolvencyObservationState;
      ageMs: number | null;
      durableDeficitIncidentPresent: boolean | null;
    }>;
    commitment: Readonly<{
      status: OperatorHealthSignalStatus;
      configured: boolean;
      ready: boolean;
      ageMs: number | null;
      observedErgoHeight: number | null;
      currentErgoHeight: number | null;
      lagBlocks: number | null;
    }>;
    finality: Readonly<{
      status: OperatorHealthSignalStatus;
      ageMs: number | null;
      finalizedSidechainHeight: number | null;
      currentSidechainHeight: number | null;
      lagBlocks: number | null;
    }>;
    reorg: Readonly<{
      status: OperatorHealthSignalStatus;
      reconciliationPending: boolean;
      quarantineConditionCount: number | null;
    }>;
    settlement: Readonly<{
      status: OperatorHealthSignalStatus;
      activeAttemptCount: number | null;
      oldestActiveAgeMs: number | null;
      stalled: boolean | null;
    }>;
    persistence: Readonly<{
      status: 'available' | 'unavailable';
    }>;
  }>;
  readonly capabilities: Readonly<{
    mutation: false;
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
}

const REASON_ORDER: readonly OperatorHealthReason[] = Object.freeze([
  'persistence_unavailable',
  'operator_clock_rollback',
  'signer_unavailable',
  'read_quorum_held',
  'read_quorum_stale',
  'funds_release_held',
  'solvency_deficit',
  'solvency_unavailable',
  'solvency_stale',
  'commitment_unavailable',
  'commitment_stale',
  'commitment_lagging',
  'finality_unavailable',
  'finality_stale',
  'finality_lagging',
  'reorg_reconciliation_pending',
  'reorg_quarantine_present',
  'settlement_stalled',
]);

const HELD_REASONS = new Set<OperatorHealthReason>([
  'persistence_unavailable',
  'operator_clock_rollback',
  'signer_unavailable',
  'read_quorum_held',
  'read_quorum_stale',
  'funds_release_held',
  'solvency_deficit',
  'reorg_reconciliation_pending',
  'reorg_quarantine_present',
]);

function normalizeNonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizePositiveSafeInteger(value: unknown, label: string): number {
  const normalized = normalizeNonnegativeSafeInteger(value, label);
  if (normalized === 0) {
    throw new Error(`${label} must be positive`);
  }
  return normalized;
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be boolean`);
  }
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is unsupported`);
  }
}

function observationAge(
  observedAtMs: number | null,
  nowMs: number,
  label: string,
): Readonly<{ ageMs: number | null; clockRollback: boolean }> {
  if (observedAtMs === null) {
    return Object.freeze({ ageMs: null, clockRollback: false });
  }
  const observedAt = normalizeNonnegativeSafeInteger(observedAtMs, label);
  if (observedAt > nowMs) {
    return Object.freeze({ ageMs: null, clockRollback: true });
  }
  return Object.freeze({ ageMs: nowMs - observedAt, clockRollback: false });
}

function deeplyFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deeplyFreeze(child);
    }
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

export function createOperatorHealthPolicyV1(input: Readonly<{
  readQuorumMaxAgeMs: number;
  commitmentMaxAgeMs: number;
  commitmentMaxLagBlocks: number;
  finalityMaxAgeMs: number;
  finalityMaxLagBlocks: number;
  solvencyMaxAgeMs: number;
  stalledSettlementAgeMs: number;
}>): OperatorHealthPolicyV1 {
  return Object.freeze({
    schema: OPERATOR_HEALTH_POLICY_SCHEMA,
    readQuorumMaxAgeMs: normalizePositiveSafeInteger(
      input.readQuorumMaxAgeMs,
      'operator-health read-quorum maximum age',
    ),
    commitmentMaxAgeMs: normalizePositiveSafeInteger(
      input.commitmentMaxAgeMs,
      'operator-health commitment maximum age',
    ),
    commitmentMaxLagBlocks: normalizeNonnegativeSafeInteger(
      input.commitmentMaxLagBlocks,
      'operator-health commitment maximum lag',
    ),
    finalityMaxAgeMs: normalizePositiveSafeInteger(
      input.finalityMaxAgeMs,
      'operator-health finality maximum age',
    ),
    finalityMaxLagBlocks: normalizeNonnegativeSafeInteger(
      input.finalityMaxLagBlocks,
      'operator-health finality maximum lag',
    ),
    solvencyMaxAgeMs: normalizePositiveSafeInteger(
      input.solvencyMaxAgeMs,
      'operator-health solvency maximum age',
    ),
    stalledSettlementAgeMs: normalizePositiveSafeInteger(
      input.stalledSettlementAgeMs,
      'operator-health stalled-settlement age',
    ),
  });
}

export function projectOperatorHealth(
  input: OperatorHealthProjectionInput,
): OperatorHealthProjection {
  const nowMs = normalizeNonnegativeSafeInteger(
    input.observedAtMs,
    'operator-health observation time',
  );
  if (input.policy.schema !== OPERATOR_HEALTH_POLICY_SCHEMA) {
    throw new Error('unsupported operator-health policy');
  }
  const policy = createOperatorHealthPolicyV1(input.policy);
  const reasons = new Set<OperatorHealthReason>();

  assertEnum(
    input.signer.availability,
    ['available', 'unavailable', 'not_configured'],
    'operator-health signer availability',
  );
  const signerStatus = input.signer.availability === 'available'
    ? 'healthy'
    : input.signer.availability === 'unavailable'
      ? 'held'
      : 'not_applicable';
  if (input.signer.availability === 'unavailable') {
    reasons.add('signer_unavailable');
  }

  assertEnum(
    input.readQuorum.state,
    ['open', 'half_open', 'closed'],
    'operator-health read-quorum state',
  );
  assertBoolean(
    input.readQuorum.fundsReleaseHeld,
    'operator-health read-quorum hold state',
  );
  if (input.readQuorum.lastFailureCode !== null) {
    assertEnum(
      input.readQuorum.lastFailureCode,
      [
        'not_configured',
        'source_unavailable',
        'invalid_response',
        'source_unstable',
        'source_disagreement',
        'probe_stale',
        'unexpected_failure',
      ],
      'operator-health read-quorum failure code',
    );
  }
  assertBoolean(
    input.fundsRelease.processHoldOpen,
    'operator-health process hold state',
  );
  assertBoolean(
    input.fundsRelease.durableHoldOpen,
    'operator-health durable hold state',
  );
  assertEnum(
    input.fundsRelease.continuityStatus,
    ['established', 'recovery_required'],
    'operator-health continuity status',
  );
  assertBoolean(
    input.fundsRelease.externalContinuityWitnessCurrent,
    'operator-health continuity witness state',
  );
  assertBoolean(
    input.fundsRelease.retainedExecutionAuthority,
    'operator-health retained execution authority state',
  );
  assertEnum(
    input.solvency.state,
    ['not_observed', 'clear', 'deficit', 'unavailable'],
    'operator-health solvency state',
  );
  assertBoolean(
    input.commitment.configured,
    'operator-health commitment configured state',
  );
  assertBoolean(input.commitment.ready, 'operator-health commitment ready state');
  assertBoolean(
    input.reorg.reconciliationPending,
    'operator-health reorg reconciliation state',
  );
  assertEnum(
    input.persistence.status,
    ['available', 'unavailable'],
    'operator-health persistence state',
  );
  if (input.persistence.status === 'available') {
    assertBoolean(
      input.persistence.solvencyDeficitIncidentPresent,
      'operator-health persisted solvency incident state',
    );
  }

  const readQuorumFailures = normalizeNonnegativeSafeInteger(
    input.readQuorum.consecutiveFailures,
    'operator-health read-quorum failure count',
  );
  const readQuorumAge = observationAge(
    input.readQuorum.lastAcceptedAtMs,
    nowMs,
    'operator-health read-quorum observation time',
  );
  if (readQuorumAge.clockRollback) reasons.add('operator_clock_rollback');
  if (
    (input.readQuorum.state === 'closed') === input.readQuorum.fundsReleaseHeld
  ) {
    throw new Error('operator-health read-quorum state and hold disagree');
  }
  let readQuorumStatus: OperatorHealthSignalStatus = 'healthy';
  if (input.readQuorum.state !== 'closed') {
    readQuorumStatus = 'held';
    reasons.add('read_quorum_held');
  } else if (
    readQuorumAge.clockRollback
    || readQuorumAge.ageMs === null
    || readQuorumAge.ageMs > policy.readQuorumMaxAgeMs
  ) {
    readQuorumStatus = 'held';
    reasons.add(
      readQuorumAge.clockRollback
        ? 'operator_clock_rollback'
        : 'read_quorum_stale',
    );
  }

  const incidentCount = normalizeNonnegativeSafeInteger(
    input.fundsRelease.incidentCount,
    'operator-health funds-release incident count',
  );
  const fundsReleaseHeld =
    input.fundsRelease.processHoldOpen
    || input.fundsRelease.durableHoldOpen
    || incidentCount > 0
    || input.fundsRelease.continuityStatus === 'recovery_required'
    || !input.fundsRelease.externalContinuityWitnessCurrent
    || input.fundsRelease.retainedExecutionAuthority;
  if (fundsReleaseHeld) reasons.add('funds_release_held');

  const persistenceAvailable = input.persistence.status === 'available';
  if (!persistenceAvailable) reasons.add('persistence_unavailable');

  let durableDeficitIncidentPresent: boolean | null = null;
  let quarantineConditionCount: number | null = null;
  let activeSettlementAttemptCount: number | null = null;
  let oldestActiveSettlementUpdatedAtMs: number | null = null;
  if (input.persistence.status === 'available') {
    durableDeficitIncidentPresent =
      input.persistence.solvencyDeficitIncidentPresent;
    quarantineConditionCount = normalizeNonnegativeSafeInteger(
      input.persistence.reorgQuarantineConditionCount,
      'operator-health reorg quarantine condition count',
    );
    activeSettlementAttemptCount = normalizeNonnegativeSafeInteger(
      input.persistence.activeSettlementAttemptCount,
      'operator-health active settlement attempt count',
    );
    oldestActiveSettlementUpdatedAtMs =
      input.persistence.oldestActiveSettlementUpdatedAtMs;
    if (
      (activeSettlementAttemptCount === 0)
      !== (oldestActiveSettlementUpdatedAtMs === null)
    ) {
      throw new Error(
        'operator-health active settlement count and oldest timestamp disagree',
      );
    }
  }

  const solvencyAge = observationAge(
    input.solvency.observedAtMs,
    nowMs,
    'operator-health solvency observation time',
  );
  if (solvencyAge.clockRollback) reasons.add('operator_clock_rollback');
  if (
    (input.solvency.state === 'not_observed')
    !== (input.solvency.observedAtMs === null)
  ) {
    throw new Error('operator-health solvency state and observation time disagree');
  }
  let solvencyStatus: OperatorHealthSignalStatus = 'healthy';
  if (solvencyAge.clockRollback) {
    solvencyStatus = 'held';
  }
  if (
    input.solvency.state === 'deficit'
    || durableDeficitIncidentPresent === true
  ) {
    solvencyStatus = 'held';
    reasons.add('solvency_deficit');
  } else if (
    !persistenceAvailable
    || input.solvency.state === 'not_observed'
    || input.solvency.state === 'unavailable'
  ) {
    if (!solvencyAge.clockRollback) {
      solvencyStatus = persistenceAvailable ? 'degraded' : 'unavailable';
    }
    reasons.add('solvency_unavailable');
  } else if (
    !solvencyAge.clockRollback
    && (
      solvencyAge.ageMs === null
      || solvencyAge.ageMs > policy.solvencyMaxAgeMs
    )
  ) {
    solvencyStatus = 'degraded';
    reasons.add('solvency_stale');
  }

  if (
    !input.commitment.configured
    && (
      input.commitment.ready
      || input.commitment.observedAtMs !== null
      || input.commitment.observedErgoHeight !== null
    )
  ) {
    throw new Error('unconfigured operator-health commitment has observed state');
  }
  if (
    input.commitment.ready
    && (
      input.commitment.observedAtMs === null
      || input.commitment.observedErgoHeight === null
      || input.commitment.currentErgoHeight === null
    )
  ) {
    throw new Error('ready operator-health commitment lacks an exact observation');
  }
  const commitmentObservedHeight = input.commitment.observedErgoHeight === null
    ? null
    : normalizeNonnegativeSafeInteger(
      input.commitment.observedErgoHeight,
      'operator-health commitment Ergo height',
    );
  const commitmentCurrentHeight = input.commitment.currentErgoHeight === null
    ? null
    : normalizeNonnegativeSafeInteger(
      input.commitment.currentErgoHeight,
      'operator-health current Ergo height',
    );
  if (
    commitmentObservedHeight !== null
    && commitmentCurrentHeight !== null
    && commitmentObservedHeight > commitmentCurrentHeight
  ) {
    throw new Error('operator-health commitment height exceeds current Ergo height');
  }
  const commitmentAge = observationAge(
    input.commitment.observedAtMs,
    nowMs,
    'operator-health commitment observation time',
  );
  if (commitmentAge.clockRollback) reasons.add('operator_clock_rollback');
  const commitmentLagBlocks =
    commitmentObservedHeight === null || commitmentCurrentHeight === null
      ? null
      : commitmentCurrentHeight - commitmentObservedHeight;
  let commitmentStatus: OperatorHealthSignalStatus = 'healthy';
  if (commitmentAge.clockRollback) {
    commitmentStatus = 'held';
  } else if (!input.commitment.configured || !input.commitment.ready) {
    commitmentStatus = 'degraded';
    reasons.add('commitment_unavailable');
  } else if (
    commitmentAge.ageMs === null
    || commitmentAge.ageMs > policy.commitmentMaxAgeMs
  ) {
    commitmentStatus = 'degraded';
    reasons.add('commitment_stale');
  } else if (
    commitmentLagBlocks !== null
    && commitmentLagBlocks > policy.commitmentMaxLagBlocks
  ) {
    commitmentStatus = 'degraded';
    reasons.add('commitment_lagging');
  }

  const finalityFields = [
    input.finality.observedAtMs,
    input.finality.finalizedSidechainHeight,
    input.finality.currentSidechainHeight,
  ];
  const finalityPresent = finalityFields.every(value => value !== null);
  if (!finalityPresent && finalityFields.some(value => value !== null)) {
    throw new Error('operator-health finality observation is incomplete');
  }
  const finalizedSidechainHeight =
    input.finality.finalizedSidechainHeight === null
      ? null
      : normalizeNonnegativeSafeInteger(
        input.finality.finalizedSidechainHeight,
        'operator-health finalized sidechain height',
      );
  const currentSidechainHeight = input.finality.currentSidechainHeight === null
    ? null
    : normalizeNonnegativeSafeInteger(
      input.finality.currentSidechainHeight,
      'operator-health current sidechain height',
    );
  if (
    finalizedSidechainHeight !== null
    && currentSidechainHeight !== null
    && finalizedSidechainHeight > currentSidechainHeight
  ) {
    throw new Error(
      'operator-health finalized height exceeds current sidechain height',
    );
  }
  const finalityAge = observationAge(
    input.finality.observedAtMs,
    nowMs,
    'operator-health finality observation time',
  );
  if (finalityAge.clockRollback) reasons.add('operator_clock_rollback');
  const finalityLagBlocks =
    finalizedSidechainHeight === null || currentSidechainHeight === null
      ? null
      : currentSidechainHeight - finalizedSidechainHeight;
  let finalityStatus: OperatorHealthSignalStatus = 'healthy';
  if (finalityAge.clockRollback) {
    finalityStatus = 'held';
  } else if (!finalityPresent) {
    finalityStatus = 'degraded';
    reasons.add('finality_unavailable');
  } else if (
    finalityAge.ageMs === null
    || finalityAge.ageMs > policy.finalityMaxAgeMs
  ) {
    finalityStatus = 'degraded';
    reasons.add('finality_stale');
  } else if (
    finalityLagBlocks !== null
    && finalityLagBlocks > policy.finalityMaxLagBlocks
  ) {
    finalityStatus = 'degraded';
    reasons.add('finality_lagging');
  }

  let reorgStatus: OperatorHealthSignalStatus = 'healthy';
  if (!persistenceAvailable) {
    reorgStatus = 'unavailable';
  }
  if (input.reorg.reconciliationPending) {
    reorgStatus = 'held';
    reasons.add('reorg_reconciliation_pending');
  }
  if (quarantineConditionCount !== null && quarantineConditionCount > 0) {
    reorgStatus = 'held';
    reasons.add('reorg_quarantine_present');
  }

  let oldestActiveAgeMs: number | null = null;
  let settlementStalled: boolean | null = null;
  let settlementStatus: OperatorHealthSignalStatus = persistenceAvailable
    ? 'healthy'
    : 'unavailable';
  if (persistenceAvailable && oldestActiveSettlementUpdatedAtMs !== null) {
    const oldest = observationAge(
      oldestActiveSettlementUpdatedAtMs,
      nowMs,
      'operator-health oldest active settlement update',
    );
    if (oldest.clockRollback) {
      settlementStatus = 'held';
      reasons.add('operator_clock_rollback');
    } else {
      oldestActiveAgeMs = oldest.ageMs;
      settlementStalled =
        oldestActiveAgeMs !== null
        && oldestActiveAgeMs > policy.stalledSettlementAgeMs;
      if (settlementStalled) {
        settlementStatus = 'degraded';
        reasons.add('settlement_stalled');
      }
    }
  } else if (persistenceAvailable) {
    settlementStalled = false;
  }

  const orderedReasons = REASON_ORDER.filter(reason => reasons.has(reason));
  const overall: OperatorHealthOverallStatus = orderedReasons.some(reason =>
    HELD_REASONS.has(reason)
  )
    ? 'held'
    : orderedReasons.length > 0
      ? 'degraded'
      : 'healthy';

  return deeplyFreeze({
    schema: OPERATOR_HEALTH_PROJECTION_SCHEMA,
    observedAtMs: nowMs,
    overall,
    reasons: orderedReasons,
    signals: {
      signer: {
        status: signerStatus,
        availability: input.signer.availability,
      },
      readQuorum: {
        status: readQuorumStatus,
        state: input.readQuorum.state,
        ageMs: readQuorumAge.ageMs,
        consecutiveFailures: readQuorumFailures,
        lastFailureCode: input.readQuorum.lastFailureCode,
      },
      fundsRelease: {
        status: fundsReleaseHeld ? 'held' : 'healthy',
        processHoldOpen: input.fundsRelease.processHoldOpen,
        durableHoldOpen: input.fundsRelease.durableHoldOpen,
        incidentCount,
        continuityStatus: input.fundsRelease.continuityStatus,
        externalContinuityWitnessCurrent:
          input.fundsRelease.externalContinuityWitnessCurrent,
        retainedExecutionAuthority:
          input.fundsRelease.retainedExecutionAuthority,
      },
      solvency: {
        status: solvencyStatus,
        observationState: input.solvency.state,
        ageMs: solvencyAge.ageMs,
        durableDeficitIncidentPresent,
      },
      commitment: {
        status: commitmentStatus,
        configured: input.commitment.configured,
        ready: input.commitment.ready,
        ageMs: commitmentAge.ageMs,
        observedErgoHeight: commitmentObservedHeight,
        currentErgoHeight: commitmentCurrentHeight,
        lagBlocks:
          commitmentLagBlocks,
      },
      finality: {
        status: finalityStatus,
        ageMs: finalityAge.ageMs,
        finalizedSidechainHeight,
        currentSidechainHeight,
        lagBlocks:
          finalityLagBlocks,
      },
      reorg: {
        status: reorgStatus,
        reconciliationPending: input.reorg.reconciliationPending,
        quarantineConditionCount,
      },
      settlement: {
        status: settlementStatus,
        activeAttemptCount: activeSettlementAttemptCount,
        oldestActiveAgeMs,
        stalled: settlementStalled,
      },
      persistence: {
        status: persistenceAvailable ? 'available' : 'unavailable',
      },
    },
    capabilities: {
      mutation: false,
      checking: false,
      signing: false,
      authorization: false,
      submission: false,
      broadcast: false,
      fundsAuthority: false,
    },
  });
}
