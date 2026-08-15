import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  OPERATOR_HEALTH_PROJECTION_SCHEMA,
  type OperatorHealthProjection,
  type OperatorHealthReason,
} from './operator-health-projection.js';
import {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  OPERATOR_ALERT_DELIVERY_STATE_SCHEMA,
  OPERATOR_ALERT_PROFILE_ID,
  assertSupportedOperatorAlertProfile,
  deriveOperatorAlertId,
  normalizeNonnegativeSafeInteger,
  normalizeOperatorAlertDeliveryState,
  normalizeOperatorAlertReasons,
  type OperatorAlertDeliveryFailureCode,
  type OperatorAlertDeliveryState,
  type OperatorAlertDeliveryStatePort,
  type OperatorAlertDeliveryStatus,
  type OperatorAlertProfileV1,
  type OperatorAlertTransition,
} from './operator-alert-delivery-state.js';

export {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  OPERATOR_ALERT_DELIVERY_STATE_SCHEMA,
  OPERATOR_ALERT_PROFILE_ID,
  OPERATOR_ALERT_PROFILE_SCHEMA,
  assertSupportedOperatorAlertProfile,
  normalizeOperatorAlertDeliveryState,
  type OperatorAlertDeliveryFailureCode,
  type OperatorAlertDeliveryState,
  type OperatorAlertDeliveryStatePort,
  type OperatorAlertDeliveryStateRead,
  type OperatorAlertDeliveryStatus,
  type OperatorAlertProfileV1,
  type OperatorAlertTransition,
} from './operator-alert-delivery-state.js';

export const OPERATOR_ALERT_EVENT_SCHEMA =
  'e2s.operator-alert-event.v1' as const;
export const OPERATOR_RECOVERY_ACTION_SCHEMA =
  'e2s.operator-recovery-action.v1' as const;

export const OPERATOR_ALERT_EVENT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-event:v1' as const;

const OPERATOR_ALERT_CONDITION_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-condition:v1';

export type OperatorRecoveryActionId =
  | 'restore-local-delivery-state'
  | 'inspect-storage-and-liquidity'
  | 'classify-operator-incident'
  | 'reconcile-source-history'
  | 'triage-settlement';

export interface OperatorRecoveryActionReference {
  readonly schema: typeof OPERATOR_RECOVERY_ACTION_SCHEMA;
  readonly actionId: OperatorRecoveryActionId;
  readonly runbookReference: string;
  readonly capabilities: Readonly<{
    mutation: false;
    holdClear: false;
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
}

const NO_ACTION_CAPABILITIES = Object.freeze({
  mutation: false,
  holdClear: false,
  checking: false,
  signing: false,
  authorization: false,
  submission: false,
  broadcast: false,
  fundsAuthority: false,
} as const);

const RECOVERY_ACTIONS = Object.freeze({
  'restore-local-delivery-state': Object.freeze({
    schema: OPERATOR_RECOVERY_ACTION_SCHEMA,
    actionId: 'restore-local-delivery-state',
    runbookReference:
      'docs/operator-runbooks.md#runbook-12-sqlite-and-avl-backup-restore',
    capabilities: NO_ACTION_CAPABILITIES,
  }),
  'classify-operator-incident': Object.freeze({
    schema: OPERATOR_RECOVERY_ACTION_SCHEMA,
    actionId: 'classify-operator-incident',
    runbookReference:
      'docs/operator-runbooks.md#runbook-10-incident-response',
    capabilities: NO_ACTION_CAPABILITIES,
  }),
  'inspect-storage-and-liquidity': Object.freeze({
    schema: OPERATOR_RECOVERY_ACTION_SCHEMA,
    actionId: 'inspect-storage-and-liquidity',
    runbookReference:
      'docs/operator-runbooks.md#runbook-9-storage-rent-and-liquidity-maintenance',
    capabilities: NO_ACTION_CAPABILITIES,
  }),
  'reconcile-source-history': Object.freeze({
    schema: OPERATOR_RECOVERY_ACTION_SCHEMA,
    actionId: 'reconcile-source-history',
    runbookReference:
      'docs/operator-runbooks.md#runbook-6-reorg-recovery',
    capabilities: NO_ACTION_CAPABILITIES,
  }),
  'triage-settlement': Object.freeze({
    schema: OPERATOR_RECOVERY_ACTION_SCHEMA,
    actionId: 'triage-settlement',
    runbookReference:
      'docs/operator-runbooks.md#runbook-5-settlement-failure-triage',
    capabilities: NO_ACTION_CAPABILITIES,
  }),
} as const satisfies Readonly<Record<
  OperatorRecoveryActionId,
  OperatorRecoveryActionReference
>>);

const ACTIONS_BY_REASON = Object.freeze({
  persistence_unavailable: Object.freeze([
    'restore-local-delivery-state',
    'classify-operator-incident',
  ]),
  operator_clock_rollback: Object.freeze(['classify-operator-incident']),
  signer_unavailable: Object.freeze([
    'triage-settlement',
    'classify-operator-incident',
  ]),
  read_quorum_held: Object.freeze([
    'classify-operator-incident',
    'reconcile-source-history',
  ]),
  read_quorum_stale: Object.freeze([
    'classify-operator-incident',
    'reconcile-source-history',
  ]),
  funds_release_held: Object.freeze(['classify-operator-incident']),
  solvency_deficit: Object.freeze([
    'inspect-storage-and-liquidity',
    'classify-operator-incident',
  ]),
  solvency_unavailable: Object.freeze(['classify-operator-incident']),
  solvency_stale: Object.freeze(['classify-operator-incident']),
  commitment_unavailable: Object.freeze([
    'triage-settlement',
    'classify-operator-incident',
  ]),
  commitment_stale: Object.freeze([
    'triage-settlement',
    'reconcile-source-history',
  ]),
  commitment_lagging: Object.freeze(['triage-settlement']),
  finality_unavailable: Object.freeze([
    'triage-settlement',
    'classify-operator-incident',
  ]),
  finality_stale: Object.freeze([
    'reconcile-source-history',
    'classify-operator-incident',
  ]),
  finality_lagging: Object.freeze(['triage-settlement']),
  reorg_reconciliation_pending: Object.freeze(['reconcile-source-history']),
  reorg_quarantine_present: Object.freeze([
    'reconcile-source-history',
    'classify-operator-incident',
  ]),
  settlement_stalled: Object.freeze([
    'triage-settlement',
    'classify-operator-incident',
  ]),
} as const satisfies Readonly<Record<
  OperatorHealthReason,
  readonly OperatorRecoveryActionId[]
>>);

export interface OperatorAlertEvent {
  readonly schema: typeof OPERATOR_ALERT_EVENT_SCHEMA;
  readonly profileId: typeof OPERATOR_ALERT_PROFILE_ID;
  readonly profileVersion: 1;
  readonly alertIdHex: string;
  readonly openedAtMs: number;
  readonly transition: OperatorAlertTransition;
  readonly conditionDigestHex: string;
  readonly previousAlertIdHex: string | null;
  readonly overall: OperatorHealthProjection['overall'];
  readonly reasons: readonly OperatorHealthReason[];
  readonly recoveryActions: readonly OperatorRecoveryActionReference[];
  readonly capabilities: Readonly<{
    mutation: false;
    holdClear: false;
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
}

export type OperatorAlertDeliveryResult =
  | Readonly<{ status: 'delivered' }>
  | Readonly<{
      status: 'retryable_failure';
      code: OperatorAlertDeliveryFailureCode;
    }>;

export interface OperatorAlertDeliveryPort {
  deliver(event: OperatorAlertEvent): OperatorAlertDeliveryResult;
}

export function normalizeOperatorAlertEvent(
  value: unknown,
): Readonly<OperatorAlertEvent> {
  const record = exactObject(value, [
    'schema',
    'profileId',
    'profileVersion',
    'alertIdHex',
    'openedAtMs',
    'transition',
    'conditionDigestHex',
    'previousAlertIdHex',
    'overall',
    'reasons',
    'recoveryActions',
    'capabilities',
  ], 'operator alert event');
  if (
    record.schema !== OPERATOR_ALERT_EVENT_SCHEMA
    || record.profileId !== OPERATOR_ALERT_PROFILE_ID
    || record.profileVersion !== 1
  ) {
    throw new Error('unsupported operator alert event');
  }
  const alertIdHex = canonicalHex32(record.alertIdHex, 'operator alert id');
  const conditionDigestHex = canonicalHex32(
    record.conditionDigestHex,
    'operator alert condition digest',
  );
  const previousAlertIdHex = record.previousAlertIdHex === null
    ? null
    : canonicalHex32(record.previousAlertIdHex, 'previous operator alert id');
  const openedAtMs = normalizeNonnegativeSafeInteger(
    record.openedAtMs,
    'operator alert open time',
  );
  if (!['raised', 'updated', 'recovered'].includes(String(record.transition))) {
    throw new Error('unsupported operator alert transition');
  }
  const transition = record.transition as OperatorAlertTransition;
  if (!['healthy', 'degraded', 'held'].includes(String(record.overall))) {
    throw new Error('unsupported operator alert status');
  }
  const overall = record.overall as OperatorHealthProjection['overall'];
  const reasons = normalizeOperatorAlertReasons(
    record.reasons as readonly OperatorHealthReason[],
  );
  const active = reasons.length > 0;
  if (
    (overall === 'healthy') !== !active
    || (transition === 'recovered') !== !active
    || (transition !== 'raised' && previousAlertIdHex === null)
  ) {
    throw new Error('operator alert event transition and health state disagree');
  }
  const expectedActions = recoveryActionsForReasons(reasons);
  if (!Array.isArray(record.recoveryActions)) {
    throw new Error('operator alert recovery actions must be an array');
  }
  const actualActions = record.recoveryActions.map((action, index) => {
    const actionRecord = exactObject(action, [
      'schema',
      'actionId',
      'runbookReference',
      'capabilities',
    ], `operator recovery action ${index}`);
    if (typeof actionRecord.actionId !== 'string') {
      throw new Error('operator recovery action id must be a string');
    }
    assertAllFalseCapabilities(
      actionRecord.capabilities,
      `operator recovery action ${index}`,
    );
    const expected = resolveOperatorRecoveryAction(actionRecord.actionId);
    if (canonicalJson(actionRecord) !== canonicalJson(expected)) {
      throw new Error('operator recovery action differs from the reviewed catalogue');
    }
    return expected;
  });
  if (canonicalJson(actualActions) !== canonicalJson(expectedActions)) {
    throw new Error('operator alert recovery actions do not match its reasons');
  }
  assertAllFalseCapabilities(record.capabilities, 'operator alert event');
  return Object.freeze({
    schema: OPERATOR_ALERT_EVENT_SCHEMA,
    profileId: OPERATOR_ALERT_PROFILE_ID,
    profileVersion: 1,
    alertIdHex,
    openedAtMs,
    transition,
    conditionDigestHex,
    previousAlertIdHex,
    overall,
    reasons,
    recoveryActions: expectedActions,
    capabilities: NO_ACTION_CAPABILITIES,
  });
}

export function digestOperatorAlertEvent(value: unknown): string {
  return sha256CanonicalJson(
    normalizeOperatorAlertEvent(value),
    OPERATOR_ALERT_EVENT_DIGEST_DOMAIN,
  );
}

export type OperatorAlertDeliveryCycleOutcome =
  | 'idle'
  | 'deduplicated'
  | 'in_flight'
  | 'retry_wait'
  | 'delivered'
  | 'retry_scheduled'
  | 'persistence_unavailable'
  | 'state_conflict';

function assertFalseCapabilities(
  value: unknown,
  label: string,
): void {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${label} capabilities must be an object`);
  }
  const record = value as Record<string, unknown>;
  const keys = [
    'mutation',
    'checking',
    'signing',
    'authorization',
    'submission',
    'broadcast',
    'fundsAuthority',
  ];
  const actualKeys = Object.keys(record).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} capabilities must use the exact reviewed fields`);
  }
  for (const key of keys) {
    if (record[key] !== false) {
      throw new Error(`${label} capability ${key} must be false`);
    }
  }
}

function assertAllFalseCapabilities(value: unknown, label: string): void {
  const record = exactObject(value, [
    'mutation',
    'holdClear',
    'checking',
    'signing',
    'authorization',
    'submission',
    'broadcast',
    'fundsAuthority',
  ], `${label} capabilities`);
  for (const [key, capability] of Object.entries(record)) {
    if (capability !== false) {
      throw new Error(`${label} capability ${key} must be false`);
    }
  }
}

function exactObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  const expected = [...fields].sort();
  const actual = Object.keys(record).sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} must use the exact reviewed fields`);
  }
  return record;
}

function canonicalHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
  return value;
}

export function resolveOperatorRecoveryAction(
  actionId: string,
): OperatorRecoveryActionReference {
  if (!Object.hasOwn(RECOVERY_ACTIONS, actionId)) {
    throw new Error('unsupported operator recovery action');
  }
  return RECOVERY_ACTIONS[actionId as OperatorRecoveryActionId];
}

function recoveryActionsForReasons(
  reasons: readonly OperatorHealthReason[],
): readonly OperatorRecoveryActionReference[] {
  const actionIds: OperatorRecoveryActionId[] = [];
  for (const reason of reasons) {
    for (const actionId of ACTIONS_BY_REASON[reason]) {
      if (!actionIds.includes(actionId)) actionIds.push(actionId);
    }
  }
  return Object.freeze(actionIds.map(resolveOperatorRecoveryAction));
}

function operatorAlertConditionMaterial(
  projection: OperatorHealthProjection,
  profile: OperatorAlertProfileV1,
): Readonly<{
  active: boolean;
  overall: OperatorHealthProjection['overall'];
  reasons: readonly OperatorHealthReason[];
  conditionDigestHex: string;
}> {
  assertSupportedOperatorAlertProfile(profile);
  if (projection.schema !== OPERATOR_HEALTH_PROJECTION_SCHEMA) {
    throw new Error('unsupported operator health projection');
  }
  if (!['healthy', 'degraded', 'held'].includes(projection.overall)) {
    throw new Error('unsupported operator health status');
  }
  assertFalseCapabilities(projection.capabilities, 'operator health');
  const reasons = normalizeOperatorAlertReasons(projection.reasons);
  const active = reasons.length > 0;
  if ((projection.overall === 'healthy') !== !active) {
    throw new Error('operator health status and reasons disagree');
  }

  const stableState = {
    profile: {
      schema: profile.schema,
      profileId: profile.profileId,
      version: profile.version,
      recoveryActionCatalogVersion: profile.recoveryActionCatalogVersion,
    },
    healthSchema: projection.schema,
    overall: projection.overall,
    reasons,
    signals: {
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
    },
  };
  return Object.freeze({
    active,
    overall: projection.overall,
    reasons,
    conditionDigestHex: sha256CanonicalJson(
      stableState,
      OPERATOR_ALERT_CONDITION_DIGEST_DOMAIN,
    ),
  });
}

function createPendingState(input: Readonly<{
  profile: OperatorAlertProfileV1;
  revision: number;
  transition: OperatorAlertTransition;
  conditionActive: boolean;
  conditionDigestHex: string;
  cacheGenerationHex: string;
  overall: OperatorHealthProjection['overall'];
  reasons: readonly OperatorHealthReason[];
  previousAlertIdHex: string | null;
  nowMs: number;
}>): OperatorAlertDeliveryState {
  const openedAtMs = normalizeNonnegativeSafeInteger(
    input.nowMs,
    'operator alert open time',
  );
  const reasons = normalizeOperatorAlertReasons(input.reasons);
  const alertIdHex = deriveOperatorAlertId({
    ...input,
    openedAtMs,
    reasons,
  });
  return Object.freeze({
    schema: OPERATOR_ALERT_DELIVERY_STATE_SCHEMA,
    profileId: input.profile.profileId,
    profileVersion: input.profile.version,
    revision: input.revision,
    alertIdHex,
    conditionDigestHex: input.conditionDigestHex,
    cacheGenerationHex: input.cacheGenerationHex,
    openedAtMs,
    transition: input.transition,
    conditionActive: input.conditionActive,
    overall: input.overall,
    reasons,
    previousAlertIdHex: input.previousAlertIdHex,
    deliveryStatus: 'pending',
    attemptCount: 0,
    claimedAtMs: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    lastFailureCode: null,
    updatedAtMs: openedAtMs,
  });
}

function incrementSafeInteger(value: number, label: string): number {
  const next = value + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`${label} exceeds safe range`);
  }
  return next;
}

function reconcileOperatorAlertState(input: Readonly<{
  projection: OperatorHealthProjection;
  profile: OperatorAlertProfileV1;
  current: OperatorAlertDeliveryState | null;
  cacheGenerationHex: string;
  nowMs: number;
}>): OperatorAlertDeliveryState | null {
  const condition = operatorAlertConditionMaterial(
    input.projection,
    input.profile,
  );
  const nowMs = normalizeNonnegativeSafeInteger(input.nowMs, 'operator alert time');
  if (input.current === null) {
    if (!condition.active) return null;
    return createPendingState({
      profile: input.profile,
      revision: 1,
      transition: 'raised',
      conditionActive: true,
      conditionDigestHex: condition.conditionDigestHex,
      cacheGenerationHex: input.cacheGenerationHex,
      overall: condition.overall,
      reasons: condition.reasons,
      previousAlertIdHex: null,
      nowMs,
    });
  }
  const current = normalizeOperatorAlertDeliveryState(
    input.current,
    input.profile,
  );
  if (current.cacheGenerationHex !== input.cacheGenerationHex) {
    throw new Error('operator alert state belongs to another cache generation');
  }
  if (current.conditionDigestHex === condition.conditionDigestHex) {
    return current;
  }
  if (current.deliveryStatus !== 'delivered') {
    return current;
  }
  if (!condition.active && !current.conditionActive) {
    return current;
  }
  return createPendingState({
    profile: input.profile,
    revision: incrementSafeInteger(
      current.revision,
      'operator alert state revision',
    ),
    transition: condition.active
      ? current.conditionActive ? 'updated' : 'raised'
      : 'recovered',
    conditionActive: condition.active,
    conditionDigestHex: condition.conditionDigestHex,
    cacheGenerationHex: input.cacheGenerationHex,
    overall: condition.overall,
    reasons: condition.reasons,
    previousAlertIdHex: current.alertIdHex,
    nowMs,
  });
}

function claimOperatorAlertAttempt(input: Readonly<{
  state: OperatorAlertDeliveryState;
  profile: OperatorAlertProfileV1;
  nowMs: number;
}>): OperatorAlertDeliveryState | null {
  const state = normalizeOperatorAlertDeliveryState(input.state, input.profile);
  const nowMs = normalizeNonnegativeSafeInteger(input.nowMs, 'operator alert time');
  if (state.deliveryStatus === 'delivered') return null;
  if (
    state.deliveryStatus === 'retry_wait'
    && state.nextAttemptAtMs !== null
    && nowMs < state.nextAttemptAtMs
  ) {
    return null;
  }
  if (
    state.deliveryStatus === 'delivering'
    && state.leaseExpiresAtMs !== null
    && nowMs < state.leaseExpiresAtMs
  ) {
    return null;
  }
  const leaseExpiresAtMs = nowMs + input.profile.attemptLeaseMs;
  if (!Number.isSafeInteger(leaseExpiresAtMs)) {
    throw new Error('operator alert lease expiry exceeds safe range');
  }
  return Object.freeze({
    ...state,
    revision: incrementSafeInteger(
      state.revision,
      'operator alert state revision',
    ),
    deliveryStatus: 'delivering',
    attemptCount: incrementSafeInteger(
      state.attemptCount,
      'operator alert attempt count',
    ),
    claimedAtMs: nowMs,
    leaseExpiresAtMs,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    lastFailureCode: null,
    updatedAtMs: nowMs,
  });
}

function finishOperatorAlertAttempt(input: Readonly<{
  state: OperatorAlertDeliveryState;
  profile: OperatorAlertProfileV1;
  nowMs: number;
  result: OperatorAlertDeliveryResult;
}>): OperatorAlertDeliveryState {
  const state = normalizeOperatorAlertDeliveryState(input.state, input.profile);
  const nowMs = normalizeNonnegativeSafeInteger(input.nowMs, 'operator alert time');
  if (state.deliveryStatus !== 'delivering') {
    throw new Error('operator alert attempt is not claimed');
  }
  if (input.result.status === 'delivered') {
    return Object.freeze({
      ...state,
      revision: incrementSafeInteger(
        state.revision,
        'operator alert state revision',
      ),
      deliveryStatus: 'delivered',
      claimedAtMs: null,
      leaseExpiresAtMs: null,
      nextAttemptAtMs: null,
      deliveredAtMs: nowMs,
      lastFailureCode: null,
      updatedAtMs: nowMs,
    });
  }
  if (
    input.result.status !== 'retryable_failure'
    || ![
      'delivery_rejected',
      'delivery_unavailable',
      'unexpected_failure',
    ].includes(input.result.code)
  ) {
    throw new Error('unsupported operator alert delivery result');
  }
  const nextAttemptAtMs = nowMs + input.profile.retryDelayMs;
  if (!Number.isSafeInteger(nextAttemptAtMs)) {
    throw new Error('operator alert retry time exceeds safe range');
  }
  return Object.freeze({
    ...state,
    revision: incrementSafeInteger(
      state.revision,
      'operator alert state revision',
    ),
    deliveryStatus: 'retry_wait',
    claimedAtMs: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs,
    deliveredAtMs: null,
    lastFailureCode: input.result.code,
    updatedAtMs: nowMs,
  });
}

export function operatorAlertEventForState(
  state: OperatorAlertDeliveryState,
  profile: OperatorAlertProfileV1,
): OperatorAlertEvent {
  const normalized = normalizeOperatorAlertDeliveryState(state, profile);
  return Object.freeze({
    schema: OPERATOR_ALERT_EVENT_SCHEMA,
    profileId: profile.profileId,
    profileVersion: profile.version,
    alertIdHex: normalized.alertIdHex,
    openedAtMs: normalized.openedAtMs,
    transition: normalized.transition,
    conditionDigestHex: normalized.conditionDigestHex,
    previousAlertIdHex: normalized.previousAlertIdHex,
    overall: normalized.overall,
    reasons: normalized.reasons,
    recoveryActions: recoveryActionsForReasons(normalized.reasons),
    capabilities: NO_ACTION_CAPABILITIES,
  });
}

export function runOperatorAlertDeliveryCycle(input: Readonly<{
  projection: OperatorHealthProjection;
  profile?: OperatorAlertProfileV1;
  state: OperatorAlertDeliveryStatePort;
  delivery: OperatorAlertDeliveryPort;
  nowMs: number;
}>): OperatorAlertDeliveryCycleOutcome {
  const profile = input.profile ?? BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1;
  assertSupportedOperatorAlertProfile(profile);
  const nowMs = normalizeNonnegativeSafeInteger(input.nowMs, 'operator alert time');
  const read = input.state.read(profile.profileId);
  if (read.status === 'unavailable') return 'persistence_unavailable';
  const current = read.state === null
    ? null
    : normalizeOperatorAlertDeliveryState(read.state, profile);
  const reconciled = reconcileOperatorAlertState({
    projection: input.projection,
    profile,
    current,
    cacheGenerationHex: read.cacheGenerationHex,
    nowMs,
  });
  if (reconciled === null) return 'idle';

  let stored = current;
  if (current === null || reconciled.revision !== current.revision) {
    const result = input.state.compareAndSet({
      expectedRevision: current?.revision ?? null,
      next: reconciled,
    });
    if (result === 'unavailable') return 'persistence_unavailable';
    if (result === 'conflict') return 'state_conflict';
    stored = reconciled;
  }
  if (stored === null) return 'idle';
  if (stored.deliveryStatus === 'delivered') return 'deduplicated';
  if (
    stored.deliveryStatus === 'retry_wait'
    && stored.nextAttemptAtMs !== null
    && nowMs < stored.nextAttemptAtMs
  ) {
    return 'retry_wait';
  }
  if (
    stored.deliveryStatus === 'delivering'
    && stored.leaseExpiresAtMs !== null
    && nowMs < stored.leaseExpiresAtMs
  ) {
    return 'in_flight';
  }

  const claimed = claimOperatorAlertAttempt({ state: stored, profile, nowMs });
  if (claimed === null) return 'deduplicated';
  const claimResult = input.state.compareAndSet({
    expectedRevision: stored.revision,
    next: claimed,
  });
  if (claimResult === 'unavailable') return 'persistence_unavailable';
  if (claimResult === 'conflict') return 'state_conflict';

  const event = operatorAlertEventForState(claimed, profile);
  let deliveryResult: OperatorAlertDeliveryResult;
  try {
    const result = input.delivery.deliver(event);
    if (result.status === 'delivered') {
      deliveryResult = Object.freeze({ status: 'delivered' });
    } else if (
      result.status === 'retryable_failure'
      && [
        'delivery_rejected',
        'delivery_unavailable',
        'unexpected_failure',
      ].includes(result.code)
    ) {
      deliveryResult = Object.freeze({
        status: 'retryable_failure',
        code: result.code,
      });
    } else {
      deliveryResult = Object.freeze({
        status: 'retryable_failure',
        code: 'unexpected_failure',
      });
    }
  } catch {
    deliveryResult = Object.freeze({
      status: 'retryable_failure',
      code: 'unexpected_failure',
    });
  }
  const finished = finishOperatorAlertAttempt({
    state: claimed,
    profile,
    nowMs,
    result: deliveryResult,
  });
  const finishResult = input.state.compareAndSet({
    expectedRevision: claimed.revision,
    next: finished,
  });
  if (finishResult !== 'stored') {
    return finishResult === 'unavailable'
      ? 'persistence_unavailable'
      : 'state_conflict';
  }
  return deliveryResult.status === 'delivered'
    ? 'delivered'
    : 'retry_scheduled';
}
