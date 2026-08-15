import {
  digestOperatorAlertEvent,
  normalizeOperatorAlertEvent,
  type OperatorAlertEvent,
} from './operator-alert-delivery.js';
import {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  assertSupportedOperatorAlertProfile,
  normalizeNonnegativeSafeInteger,
  type OperatorAlertProfileV1,
} from './operator-alert-delivery-state.js';

export const OPERATOR_ALERT_EXTERNAL_OUTBOX_ITEM_SCHEMA =
  'e2s.operator-alert-external-outbox-item.v1' as const;

export type OperatorAlertExternalOutboxStatus =
  | 'pending'
  | 'delivering'
  | 'retry_wait'
  | 'delivered';

export type OperatorAlertExternalOutboxFailureCode =
  | 'transport_rejected'
  | 'transport_unavailable'
  | 'transport_malformed'
  | 'transport_threw';

export interface OperatorAlertExternalOutboxItem {
  readonly schema: typeof OPERATOR_ALERT_EXTERNAL_OUTBOX_ITEM_SCHEMA;
  readonly profileId: string;
  readonly profileVersion: 1;
  readonly alertIdHex: string;
  readonly eventDigestHex: string;
  readonly event: OperatorAlertEvent;
  readonly status: OperatorAlertExternalOutboxStatus;
  readonly revision: number;
  readonly attemptCount: number;
  readonly claimedAtMs: number | null;
  readonly leaseExpiresAtMs: number | null;
  readonly nextAttemptAtMs: number | null;
  readonly deliveredAtMs: number | null;
  readonly deliveryReceiptDigestHex: string | null;
  readonly lastFailureCode: OperatorAlertExternalOutboxFailureCode | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export type OperatorAlertExternalOutboxEnqueueResult =
  | Readonly<{ status: 'enqueued'; item: OperatorAlertExternalOutboxItem }>
  | Readonly<{ status: 'deduplicated'; alertIdHex: string }>
  | Readonly<{ status: 'state_conflict' }>
  | Readonly<{ status: 'persistence_unavailable' }>;

export type OperatorAlertExternalOutboxRead =
  | Readonly<{
      status: 'available';
      item: OperatorAlertExternalOutboxItem | null;
    }>
  | Readonly<{ status: 'unavailable' }>;

/**
 * The adapter contract is deliberately narrow. A `deduplicated` enqueue means
 * that the durable item has the exact same alert ID and event digest; any
 * different payload under that ID is a conflict.
 */
export interface OperatorAlertExternalOutboxPort {
  enqueue(item: OperatorAlertExternalOutboxItem):
    | 'stored'
    | 'deduplicated'
    | 'conflict'
    | 'unavailable';
  readNext(nowMs: number): OperatorAlertExternalOutboxRead;
  compareAndSet(input: Readonly<{
    expectedRevision: number;
    next: OperatorAlertExternalOutboxItem;
  }>): 'stored' | 'conflict' | 'unavailable';
}

export type OperatorAlertExternalTransportResult =
  | Readonly<{
      status: 'delivered';
      receiptDigestHex: string;
    }>
  | Readonly<{
      status: 'retryable_failure';
      code: 'transport_rejected' | 'transport_unavailable';
    }>;

export interface OperatorAlertExternalTransport {
  deliver(input: Readonly<{
    alertIdHex: string;
    idempotencyKey: string;
    eventDigestHex: string;
    event: OperatorAlertEvent;
  }>): Promise<unknown> | unknown;
}

export type OperatorAlertExternalOutboxWorkerOutcome =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'deduplicated'; alertIdHex: string }>
  | Readonly<{ status: 'in_flight'; alertIdHex: string }>
  | Readonly<{ status: 'retry_wait'; alertIdHex: string }>
  | Readonly<{ status: 'delivered'; alertIdHex: string }>
  | Readonly<{
      status: 'retry_scheduled';
      alertIdHex: string;
      code: OperatorAlertExternalOutboxFailureCode;
    }>
  | Readonly<{ status: 'state_conflict' }>
  | Readonly<{ status: 'persistence_unavailable' }>;

function assertHex32(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
}

function normalizePositiveSafeInteger(value: unknown, label: string): number {
  const normalized = normalizeNonnegativeSafeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function increment(value: number, label: string): number {
  const result = value + 1;
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} exceeds safe range`);
  }
  return result;
}

function normalizeOptionalTime(value: unknown, label: string): number | null {
  return value === null ? null : normalizeNonnegativeSafeInteger(value, label);
}

export function normalizeOperatorAlertExternalOutboxEvent(
  value: OperatorAlertEvent,
): OperatorAlertEvent {
  return normalizeOperatorAlertEvent(value);
}

export function digestOperatorAlertExternalOutboxEvent(
  value: OperatorAlertEvent,
): string {
  return digestOperatorAlertEvent(value);
}

export function createPendingOperatorAlertExternalOutboxItem(input: Readonly<{
  event: OperatorAlertEvent;
  profile?: OperatorAlertProfileV1;
}>): OperatorAlertExternalOutboxItem {
  const profile = input.profile ?? BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1;
  assertSupportedOperatorAlertProfile(profile);
  const event = normalizeOperatorAlertExternalOutboxEvent(input.event);
  if (
    event.profileId !== profile.profileId
    || event.profileVersion !== profile.version
  ) {
    throw new Error('operator alert event does not match the outbox profile');
  }
  return Object.freeze({
    schema: OPERATOR_ALERT_EXTERNAL_OUTBOX_ITEM_SCHEMA,
    profileId: profile.profileId,
    profileVersion: profile.version,
    alertIdHex: event.alertIdHex,
    eventDigestHex: digestOperatorAlertExternalOutboxEvent(event),
    event,
    status: 'pending',
    revision: 1,
    attemptCount: 0,
    claimedAtMs: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    deliveryReceiptDigestHex: null,
    lastFailureCode: null,
    createdAtMs: event.openedAtMs,
    updatedAtMs: event.openedAtMs,
  });
}

export function normalizeOperatorAlertExternalOutboxItem(
  value: OperatorAlertExternalOutboxItem,
  profile: OperatorAlertProfileV1 = BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
): OperatorAlertExternalOutboxItem {
  assertSupportedOperatorAlertProfile(profile);
  if (
    value === null
    || typeof value !== 'object'
    || value.schema !== OPERATOR_ALERT_EXTERNAL_OUTBOX_ITEM_SCHEMA
    || value.profileId !== profile.profileId
    || value.profileVersion !== profile.version
  ) {
    throw new Error('unsupported operator alert external outbox item');
  }
  const event = normalizeOperatorAlertExternalOutboxEvent(value.event);
  if (
    event.profileId !== profile.profileId
    || event.profileVersion !== profile.version
    || value.alertIdHex !== event.alertIdHex
  ) {
    throw new Error('operator alert external outbox identity does not match event');
  }
  assertHex32(value.alertIdHex, 'operator alert external outbox id');
  assertHex32(value.eventDigestHex, 'operator alert external outbox event digest');
  if (value.eventDigestHex !== digestOperatorAlertExternalOutboxEvent(event)) {
    throw new Error('operator alert external outbox event digest does not match event');
  }
  const revision = normalizePositiveSafeInteger(
    value.revision,
    'operator alert external outbox revision',
  );
  const attemptCount = normalizeNonnegativeSafeInteger(
    value.attemptCount,
    'operator alert external outbox attempt count',
  );
  if (revision < attemptCount + 1) {
    throw new Error('operator alert external outbox revision regresses attempts');
  }
  const createdAtMs = normalizeNonnegativeSafeInteger(
    value.createdAtMs,
    'operator alert external outbox creation time',
  );
  const updatedAtMs = normalizeNonnegativeSafeInteger(
    value.updatedAtMs,
    'operator alert external outbox update time',
  );
  if (createdAtMs !== event.openedAtMs || updatedAtMs < createdAtMs) {
    throw new Error('operator alert external outbox timing does not match event');
  }
  if (!['pending', 'delivering', 'retry_wait', 'delivered'].includes(value.status)) {
    throw new Error('unsupported operator alert external outbox status');
  }
  const claimedAtMs = normalizeOptionalTime(
    value.claimedAtMs,
    'operator alert external outbox claim time',
  );
  const leaseExpiresAtMs = normalizeOptionalTime(
    value.leaseExpiresAtMs,
    'operator alert external outbox lease expiry',
  );
  const nextAttemptAtMs = normalizeOptionalTime(
    value.nextAttemptAtMs,
    'operator alert external outbox retry time',
  );
  const deliveredAtMs = normalizeOptionalTime(
    value.deliveredAtMs,
    'operator alert external outbox delivery time',
  );
  const receiptDigestHex = value.deliveryReceiptDigestHex;
  if (receiptDigestHex !== null) {
    assertHex32(receiptDigestHex, 'operator alert external delivery receipt digest');
  }
  const failure = value.lastFailureCode;
  if (
    failure !== null
    && ![
      'transport_rejected',
      'transport_unavailable',
      'transport_malformed',
      'transport_threw',
    ].includes(failure)
  ) {
    throw new Error('unsupported operator alert external outbox failure code');
  }
  if (value.status === 'pending') {
    if (
      revision !== 1
      || attemptCount !== 0
      || claimedAtMs !== null
      || leaseExpiresAtMs !== null
      || nextAttemptAtMs !== null
      || deliveredAtMs !== null
      || receiptDigestHex !== null
      || failure !== null
      || updatedAtMs !== createdAtMs
    ) {
      throw new Error('pending operator alert external outbox item has delivery metadata');
    }
  } else if (value.status === 'delivering') {
    if (
      attemptCount === 0
      || claimedAtMs === null
      || claimedAtMs !== updatedAtMs
      || leaseExpiresAtMs === null
      || leaseExpiresAtMs !== claimedAtMs + profile.attemptLeaseMs
      || nextAttemptAtMs !== null
      || deliveredAtMs !== null
      || receiptDigestHex !== null
      || failure !== null
    ) {
      throw new Error('delivering operator alert external outbox item has invalid lease');
    }
  } else if (value.status === 'retry_wait') {
    if (
      attemptCount === 0
      || claimedAtMs !== null
      || leaseExpiresAtMs !== null
      || nextAttemptAtMs === null
      || nextAttemptAtMs !== updatedAtMs + profile.retryDelayMs
      || deliveredAtMs !== null
      || receiptDigestHex !== null
      || failure === null
    ) {
      throw new Error('retrying operator alert external outbox item has invalid retry');
    }
  } else if (
    attemptCount === 0
    || claimedAtMs !== null
    || leaseExpiresAtMs !== null
    || nextAttemptAtMs !== null
    || deliveredAtMs === null
    || deliveredAtMs !== updatedAtMs
    || receiptDigestHex === null
    || failure !== null
  ) {
    throw new Error('delivered operator alert external outbox item has invalid receipt');
  }
  return Object.freeze({
    schema: value.schema,
    profileId: value.profileId,
    profileVersion: value.profileVersion,
    alertIdHex: value.alertIdHex,
    eventDigestHex: value.eventDigestHex,
    event,
    status: value.status,
    revision,
    attemptCount,
    claimedAtMs,
    leaseExpiresAtMs,
    nextAttemptAtMs,
    deliveredAtMs,
    deliveryReceiptDigestHex: receiptDigestHex,
    lastFailureCode: failure,
    createdAtMs,
    updatedAtMs,
  });
}

export function enqueueOperatorAlertExternalOutboxEvent(input: Readonly<{
  event: OperatorAlertEvent;
  outbox: OperatorAlertExternalOutboxPort;
  profile?: OperatorAlertProfileV1;
}>): OperatorAlertExternalOutboxEnqueueResult {
  const item = createPendingOperatorAlertExternalOutboxItem(input);
  const stored = input.outbox.enqueue(item);
  if (stored === 'stored') return Object.freeze({ status: 'enqueued', item });
  if (stored === 'deduplicated') {
    return Object.freeze({ status: 'deduplicated', alertIdHex: item.alertIdHex });
  }
  if (stored === 'conflict') return Object.freeze({ status: 'state_conflict' });
  return Object.freeze({ status: 'persistence_unavailable' });
}

function isEligible(item: OperatorAlertExternalOutboxItem, nowMs: number): boolean {
  if (item.status === 'pending') return true;
  if (item.status === 'retry_wait') return item.nextAttemptAtMs !== null && nowMs >= item.nextAttemptAtMs;
  return item.status === 'delivering'
    && item.leaseExpiresAtMs !== null
    && nowMs >= item.leaseExpiresAtMs;
}

function claim(input: Readonly<{
  item: OperatorAlertExternalOutboxItem;
  nowMs: number;
  profile: OperatorAlertProfileV1;
}>): OperatorAlertExternalOutboxItem {
  const leaseExpiresAtMs = input.nowMs + input.profile.attemptLeaseMs;
  if (!Number.isSafeInteger(leaseExpiresAtMs)) {
    throw new Error('operator alert external outbox lease expiry exceeds safe range');
  }
  return normalizeOperatorAlertExternalOutboxItem(Object.freeze({
    ...input.item,
    status: 'delivering' as const,
    revision: increment(input.item.revision, 'operator alert external outbox revision'),
    attemptCount: increment(input.item.attemptCount, 'operator alert external outbox attempt count'),
    claimedAtMs: input.nowMs,
    leaseExpiresAtMs,
    nextAttemptAtMs: null,
    deliveredAtMs: null,
    deliveryReceiptDigestHex: null,
    lastFailureCode: null,
    updatedAtMs: input.nowMs,
  }), input.profile);
}

function retry(input: Readonly<{
  item: OperatorAlertExternalOutboxItem;
  nowMs: number;
  profile: OperatorAlertProfileV1;
  code: OperatorAlertExternalOutboxFailureCode;
}>): OperatorAlertExternalOutboxItem {
  const nextAttemptAtMs = input.nowMs + input.profile.retryDelayMs;
  if (!Number.isSafeInteger(nextAttemptAtMs)) {
    throw new Error('operator alert external outbox retry time exceeds safe range');
  }
  return normalizeOperatorAlertExternalOutboxItem(Object.freeze({
    ...input.item,
    status: 'retry_wait' as const,
    revision: increment(input.item.revision, 'operator alert external outbox revision'),
    claimedAtMs: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs,
    deliveredAtMs: null,
    deliveryReceiptDigestHex: null,
    lastFailureCode: input.code,
    updatedAtMs: input.nowMs,
  }), input.profile);
}

function delivered(input: Readonly<{
  item: OperatorAlertExternalOutboxItem;
  nowMs: number;
  profile: OperatorAlertProfileV1;
  receiptDigestHex: string;
}>): OperatorAlertExternalOutboxItem {
  assertHex32(input.receiptDigestHex, 'operator alert external delivery receipt digest');
  return normalizeOperatorAlertExternalOutboxItem(Object.freeze({
    ...input.item,
    status: 'delivered' as const,
    revision: increment(input.item.revision, 'operator alert external outbox revision'),
    claimedAtMs: null,
    leaseExpiresAtMs: null,
    nextAttemptAtMs: null,
    deliveredAtMs: input.nowMs,
    deliveryReceiptDigestHex: input.receiptDigestHex,
    lastFailureCode: null,
    updatedAtMs: input.nowMs,
  }), input.profile);
}

function normalizeTransportResult(
  value: unknown,
): OperatorAlertExternalTransportResult | null {
  if (value === null || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (
    result.status === 'delivered'
    && Object.keys(result).sort().join(',') === 'receiptDigestHex,status'
  ) {
    try {
      assertHex32(result.receiptDigestHex, 'operator alert external delivery receipt digest');
      return Object.freeze({
        status: 'delivered',
        receiptDigestHex: result.receiptDigestHex,
      });
    } catch {
      return null;
    }
  }
  if (
    result.status === 'retryable_failure'
    && Object.keys(result).sort().join(',') === 'code,status'
    && (result.code === 'transport_rejected' || result.code === 'transport_unavailable')
  ) {
    return Object.freeze({ status: 'retryable_failure', code: result.code });
  }
  return null;
}

export async function runOperatorAlertExternalOutboxWorkerCycle(input: Readonly<{
  outbox: OperatorAlertExternalOutboxPort;
  transport: OperatorAlertExternalTransport;
  nowMs: number;
  profile?: OperatorAlertProfileV1;
}>): Promise<OperatorAlertExternalOutboxWorkerOutcome> {
  const profile = input.profile ?? BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1;
  assertSupportedOperatorAlertProfile(profile);
  const nowMs = normalizeNonnegativeSafeInteger(
    input.nowMs,
    'operator alert external outbox worker time',
  );
  const read = input.outbox.readNext(nowMs);
  if (read.status === 'unavailable') {
    return Object.freeze({ status: 'persistence_unavailable' });
  }
  if (read.item === null) return Object.freeze({ status: 'idle' });
  const item = normalizeOperatorAlertExternalOutboxItem(read.item, profile);
  if (item.status === 'delivered') {
    return Object.freeze({ status: 'deduplicated', alertIdHex: item.alertIdHex });
  }
  if (item.status === 'delivering' && item.leaseExpiresAtMs !== null && nowMs < item.leaseExpiresAtMs) {
    return Object.freeze({ status: 'in_flight', alertIdHex: item.alertIdHex });
  }
  if (item.status === 'retry_wait' && item.nextAttemptAtMs !== null && nowMs < item.nextAttemptAtMs) {
    return Object.freeze({ status: 'retry_wait', alertIdHex: item.alertIdHex });
  }
  if (!isEligible(item, nowMs)) {
    throw new Error('operator alert external outbox port returned an ineligible item');
  }
  const claimed = claim({ item, nowMs, profile });
  const claimedResult = input.outbox.compareAndSet({
    expectedRevision: item.revision,
    next: claimed,
  });
  if (claimedResult === 'unavailable') {
    return Object.freeze({ status: 'persistence_unavailable' });
  }
  if (claimedResult === 'conflict') return Object.freeze({ status: 'state_conflict' });

  let result: OperatorAlertExternalTransportResult | null;
  let thrown = false;
  try {
    result = normalizeTransportResult(await input.transport.deliver(Object.freeze({
      alertIdHex: claimed.alertIdHex,
      idempotencyKey: claimed.alertIdHex,
      eventDigestHex: claimed.eventDigestHex,
      event: claimed.event,
    })));
  } catch {
    result = null;
    thrown = true;
  }
  const next = result?.status === 'delivered'
    ? delivered({
      item: claimed,
      nowMs,
      profile,
      receiptDigestHex: result.receiptDigestHex,
    })
    : retry({
      item: claimed,
      nowMs,
      profile,
      code: thrown
        ? 'transport_threw'
        : result === null ? 'transport_malformed' : result.code,
    });
  const stored = input.outbox.compareAndSet({
    expectedRevision: claimed.revision,
    next,
  });
  if (stored === 'unavailable') {
    return Object.freeze({ status: 'persistence_unavailable' });
  }
  if (stored === 'conflict') return Object.freeze({ status: 'state_conflict' });
  if (next.status === 'delivered') {
    return Object.freeze({ status: 'delivered', alertIdHex: next.alertIdHex });
  }
  return Object.freeze({
    status: 'retry_scheduled',
    alertIdHex: next.alertIdHex,
    code: next.lastFailureCode!,
  });
}
