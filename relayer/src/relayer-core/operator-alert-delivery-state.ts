import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import type {
  OperatorHealthOverallStatus,
  OperatorHealthReason,
} from './operator-health-projection.js';

export const OPERATOR_ALERT_PROFILE_SCHEMA =
  'e2s.operator-alert-profile.v1' as const;
export const OPERATOR_ALERT_PROFILE_ID =
  'bridge-daemon-health-v1' as const;
export const OPERATOR_ALERT_DELIVERY_STATE_SCHEMA =
  'e2s.operator-alert-delivery-state.v1' as const;

const OPERATOR_ALERT_ID_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-id:v1';

const HEALTH_REASONS = Object.freeze([
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
] as const satisfies readonly OperatorHealthReason[]);

export interface OperatorAlertProfileV1 {
  readonly schema: typeof OPERATOR_ALERT_PROFILE_SCHEMA;
  readonly profileId: typeof OPERATOR_ALERT_PROFILE_ID;
  readonly version: 1;
  readonly retryDelayMs: number;
  readonly attemptLeaseMs: number;
  readonly recoveryActionCatalogVersion: 1;
}

export const BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1: OperatorAlertProfileV1 =
  Object.freeze({
    schema: OPERATOR_ALERT_PROFILE_SCHEMA,
    profileId: OPERATOR_ALERT_PROFILE_ID,
    version: 1,
    retryDelayMs: 30_000,
    attemptLeaseMs: 15_000,
    recoveryActionCatalogVersion: 1,
  });

export type OperatorAlertTransition = 'raised' | 'updated' | 'recovered';
export type OperatorAlertDeliveryStatus =
  | 'pending'
  | 'delivering'
  | 'retry_wait'
  | 'delivered';
export type OperatorAlertDeliveryFailureCode =
  | 'delivery_rejected'
  | 'delivery_unavailable'
  | 'unexpected_failure';

export interface OperatorAlertDeliveryState {
  readonly schema: typeof OPERATOR_ALERT_DELIVERY_STATE_SCHEMA;
  readonly profileId: typeof OPERATOR_ALERT_PROFILE_ID;
  readonly profileVersion: 1;
  readonly revision: number;
  readonly alertIdHex: string;
  readonly conditionDigestHex: string;
  readonly cacheGenerationHex: string;
  readonly openedAtMs: number;
  readonly transition: OperatorAlertTransition;
  readonly conditionActive: boolean;
  readonly overall: OperatorHealthOverallStatus;
  readonly reasons: readonly OperatorHealthReason[];
  readonly previousAlertIdHex: string | null;
  readonly deliveryStatus: OperatorAlertDeliveryStatus;
  readonly attemptCount: number;
  readonly claimedAtMs: number | null;
  readonly leaseExpiresAtMs: number | null;
  readonly nextAttemptAtMs: number | null;
  readonly deliveredAtMs: number | null;
  readonly lastFailureCode: OperatorAlertDeliveryFailureCode | null;
  readonly updatedAtMs: number;
}

export type OperatorAlertDeliveryStateRead =
  | Readonly<{
      status: 'available';
      cacheGenerationHex: string;
      state: OperatorAlertDeliveryState | null;
    }>
  | Readonly<{ status: 'unavailable' }>;

export interface OperatorAlertDeliveryStatePort {
  read(profileId: string): OperatorAlertDeliveryStateRead;
  compareAndSet(input: Readonly<{
    expectedRevision: number | null;
    next: OperatorAlertDeliveryState;
  }>): 'stored' | 'conflict' | 'unavailable';
}

export function normalizeNonnegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizePositiveSafeInteger(value: unknown, label: string): number {
  const normalized = normalizeNonnegativeSafeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function normalizeOptionalTime(value: unknown, label: string): number | null {
  return value === null ? null : normalizeNonnegativeSafeInteger(value, label);
}

function assertHex32(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
}

export function normalizeOperatorAlertCacheGenerationHex(
  value: unknown,
): string {
  assertHex32(value, 'operator alert cache generation');
  return value;
}

export function assertSupportedOperatorAlertProfile(
  profile: OperatorAlertProfileV1,
): void {
  if (
    profile.schema !== OPERATOR_ALERT_PROFILE_SCHEMA
    || profile.profileId !== OPERATOR_ALERT_PROFILE_ID
    || profile.version !== 1
    || profile.recoveryActionCatalogVersion !== 1
    || profile.retryDelayMs !==
      BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1.retryDelayMs
    || profile.attemptLeaseMs !==
      BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1.attemptLeaseMs
  ) {
    throw new Error('unsupported operator alert profile');
  }
}

export function normalizeOperatorAlertReasons(
  reasons: readonly OperatorHealthReason[],
): readonly OperatorHealthReason[] {
  if (!Array.isArray(reasons)) {
    throw new Error('operator alert health reasons must be an array');
  }
  const seen = new Set<OperatorHealthReason>();
  let lastIndex = -1;
  for (const reason of reasons) {
    const index = HEALTH_REASONS.indexOf(reason);
    if (index < 0 || seen.has(reason) || index <= lastIndex) {
      throw new Error('operator alert health reasons are unsupported or unordered');
    }
    seen.add(reason);
    lastIndex = index;
  }
  return Object.freeze([...reasons]);
}

export function deriveOperatorAlertId(input: Readonly<{
  profile: OperatorAlertProfileV1;
  transition: OperatorAlertTransition;
  conditionDigestHex: string;
  cacheGenerationHex: string;
  openedAtMs: number;
  overall: OperatorHealthOverallStatus;
  reasons: readonly OperatorHealthReason[];
  previousAlertIdHex: string | null;
}>): string {
  return sha256CanonicalJson({
    profileId: input.profile.profileId,
    profileVersion: input.profile.version,
    transition: input.transition,
    conditionDigestHex: input.conditionDigestHex,
    cacheGenerationHex: input.cacheGenerationHex,
    openedAtMs: input.openedAtMs,
    overall: input.overall,
    reasons: input.reasons,
    previousAlertIdHex: input.previousAlertIdHex,
  }, OPERATOR_ALERT_ID_DOMAIN);
}

export function normalizeOperatorAlertDeliveryState(
  value: OperatorAlertDeliveryState,
  profile: OperatorAlertProfileV1 = BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
): OperatorAlertDeliveryState {
  assertSupportedOperatorAlertProfile(profile);
  if (
    value.schema !== OPERATOR_ALERT_DELIVERY_STATE_SCHEMA
    || value.profileId !== profile.profileId
    || value.profileVersion !== profile.version
  ) {
    throw new Error('unsupported operator alert delivery state');
  }
  const revision = normalizePositiveSafeInteger(
    value.revision,
    'operator alert state revision',
  );
  const attemptCount = normalizeNonnegativeSafeInteger(
    value.attemptCount,
    'operator alert attempt count',
  );
  const openedAtMs = normalizeNonnegativeSafeInteger(
    value.openedAtMs,
    'operator alert open time',
  );
  const updatedAtMs = normalizeNonnegativeSafeInteger(
    value.updatedAtMs,
    'operator alert state update time',
  );
  if (updatedAtMs < openedAtMs) {
    throw new Error('operator alert update precedes its occurrence');
  }
  assertHex32(value.alertIdHex, 'operator alert id');
  assertHex32(value.conditionDigestHex, 'operator alert condition digest');
  assertHex32(value.cacheGenerationHex, 'operator alert cache generation');
  if (value.previousAlertIdHex !== null) {
    assertHex32(value.previousAlertIdHex, 'previous operator alert id');
  }
  if (!['raised', 'updated', 'recovered'].includes(value.transition)) {
    throw new Error('unsupported operator alert transition');
  }
  if (typeof value.conditionActive !== 'boolean') {
    throw new Error('operator alert condition state must be boolean');
  }
  if (!['healthy', 'degraded', 'held'].includes(value.overall)) {
    throw new Error('unsupported operator alert status');
  }
  const reasons = normalizeOperatorAlertReasons(value.reasons);
  const reasonsActive = reasons.length > 0;
  if (
    value.conditionActive !== reasonsActive
    || (value.overall === 'healthy') !== !reasonsActive
    || value.conditionActive === (value.transition === 'recovered')
  ) {
    throw new Error('operator alert transition, status, and reasons disagree');
  }
  if (value.transition !== 'raised' && value.previousAlertIdHex === null) {
    throw new Error('operator alert transition and predecessor disagree');
  }
  if (!['pending', 'delivering', 'retry_wait', 'delivered'].includes(
    value.deliveryStatus,
  )) {
    throw new Error('unsupported operator alert delivery status');
  }
  if (
    value.lastFailureCode !== null
    && ![
      'delivery_rejected',
      'delivery_unavailable',
      'unexpected_failure',
    ].includes(value.lastFailureCode)
  ) {
    throw new Error('unsupported operator alert failure code');
  }
  const claimedAtMs = normalizeOptionalTime(
    value.claimedAtMs,
    'operator alert claim time',
  );
  const leaseExpiresAtMs = normalizeOptionalTime(
    value.leaseExpiresAtMs,
    'operator alert lease expiry',
  );
  const nextAttemptAtMs = normalizeOptionalTime(
    value.nextAttemptAtMs,
    'operator alert next attempt time',
  );
  const deliveredAtMs = normalizeOptionalTime(
    value.deliveredAtMs,
    'operator alert delivery time',
  );
  if (value.deliveryStatus === 'pending') {
    if (
      attemptCount !== 0
      || claimedAtMs !== null
      || leaseExpiresAtMs !== null
      || nextAttemptAtMs !== null
      || deliveredAtMs !== null
      || value.lastFailureCode !== null
    ) {
      throw new Error('pending operator alert has delivery metadata');
    }
  } else if (value.deliveryStatus === 'delivering') {
    if (
      attemptCount === 0
      || claimedAtMs === null
      || claimedAtMs < openedAtMs
      || leaseExpiresAtMs === null
      || leaseExpiresAtMs <= claimedAtMs
      || nextAttemptAtMs !== null
      || deliveredAtMs !== null
      || value.lastFailureCode !== null
    ) {
      throw new Error('delivering operator alert has invalid lease metadata');
    }
  } else if (value.deliveryStatus === 'retry_wait') {
    if (
      attemptCount === 0
      || claimedAtMs !== null
      || leaseExpiresAtMs !== null
      || nextAttemptAtMs === null
      || nextAttemptAtMs <= updatedAtMs
      || deliveredAtMs !== null
      || value.lastFailureCode === null
    ) {
      throw new Error('retrying operator alert has invalid retry metadata');
    }
  } else if (
    attemptCount === 0
    || claimedAtMs !== null
    || leaseExpiresAtMs !== null
    || nextAttemptAtMs !== null
    || deliveredAtMs === null
    || deliveredAtMs < openedAtMs
    || value.lastFailureCode !== null
  ) {
    throw new Error('delivered operator alert has invalid delivery metadata');
  }

  const expectedAlertId = deriveOperatorAlertId({
    profile,
    transition: value.transition,
    conditionDigestHex: value.conditionDigestHex,
    cacheGenerationHex: value.cacheGenerationHex,
    openedAtMs,
    overall: value.overall,
    reasons,
    previousAlertIdHex: value.previousAlertIdHex,
  });
  if (value.alertIdHex !== expectedAlertId) {
    throw new Error('operator alert id does not match its state');
  }
  return Object.freeze({
    ...value,
    revision,
    openedAtMs,
    reasons,
    attemptCount,
    claimedAtMs,
    leaseExpiresAtMs,
    nextAttemptAtMs,
    deliveredAtMs,
    updatedAtMs,
  });
}
