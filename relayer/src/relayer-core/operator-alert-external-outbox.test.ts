import { describe, expect, it } from 'vitest';

import {
  createPendingOperatorAlertExternalOutboxItem,
  digestOperatorAlertExternalOutboxEvent,
  enqueueOperatorAlertExternalOutboxEvent,
  normalizeOperatorAlertExternalOutboxItem,
  runOperatorAlertExternalOutboxWorkerCycle,
  type OperatorAlertExternalOutboxItem,
  type OperatorAlertExternalOutboxPort,
} from './operator-alert-external-outbox.js';
import type { OperatorAlertEvent } from './operator-alert-delivery.js';
import { BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1 } from './operator-alert-delivery-state.js';

const NOW = 2_000_000;
const ID = 'a'.repeat(64);
const CONDITION = 'b'.repeat(64);
const RECEIPT = 'c'.repeat(64);

function event(): OperatorAlertEvent {
  const alert: OperatorAlertEvent = {
    schema: 'e2s.operator-alert-event.v1',
    profileId: BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1.profileId,
    profileVersion: 1,
    alertIdHex: ID,
    openedAtMs: NOW,
    transition: 'raised',
    conditionDigestHex: CONDITION,
    previousAlertIdHex: null,
    overall: 'held',
    reasons: Object.freeze(['funds_release_held'] as const),
    recoveryActions: Object.freeze([Object.freeze({
      schema: 'e2s.operator-recovery-action.v1' as const,
      actionId: 'classify-operator-incident',
      runbookReference: 'docs/operator-runbooks.md#runbook-10-incident-response',
      capabilities: Object.freeze({
        mutation: false,
        holdClear: false,
        checking: false,
        signing: false,
        authorization: false,
        submission: false,
        broadcast: false,
        fundsAuthority: false,
      }),
    })]),
    capabilities: Object.freeze({
      mutation: false,
      holdClear: false,
      checking: false,
      signing: false,
      authorization: false,
      submission: false,
      broadcast: false,
      fundsAuthority: false,
    }),
  };
  return Object.freeze(alert);
}

function memoryOutbox(): OperatorAlertExternalOutboxPort & {
  current(): OperatorAlertExternalOutboxItem | null;
  nextEnqueue: 'stored' | 'deduplicated' | 'conflict' | 'unavailable';
  nextCas: 'stored' | 'conflict' | 'unavailable';
} {
  let current: OperatorAlertExternalOutboxItem | null = null;
  const port = {
    nextEnqueue: 'stored' as const,
    nextCas: 'stored' as const,
    enqueue(item: OperatorAlertExternalOutboxItem) {
      const result = port.nextEnqueue;
      port.nextEnqueue = 'stored';
      if (result !== 'stored') return result;
      if (current !== null) {
        return current.alertIdHex === item.alertIdHex
          && current.eventDigestHex === item.eventDigestHex ? 'deduplicated' : 'conflict';
      }
      current = item;
      return 'stored';
    },
    readNext: () => Object.freeze({ status: 'available' as const, item: current }),
    compareAndSet({ expectedRevision, next }: Readonly<{
      expectedRevision: number;
      next: OperatorAlertExternalOutboxItem;
    }>) {
      const result = port.nextCas;
      port.nextCas = 'stored';
      if (result !== 'stored') return result;
      if (current?.revision !== expectedRevision) return 'conflict';
      current = next;
      return 'stored';
    },
    current: () => current,
  };
  return port;
}

function enqueue(port: ReturnType<typeof memoryOutbox>): OperatorAlertExternalOutboxItem {
  const result = enqueueOperatorAlertExternalOutboxEvent({ event: event(), outbox: port });
  expect(result.status).toBe('enqueued');
  return port.current()!;
}

describe('operator alert external outbox', () => {
  it('creates an immutable exact digest-bound pending item', () => {
    const item = createPendingOperatorAlertExternalOutboxItem({ event: event() });
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.event)).toBe(true);
    expect(item.alertIdHex).toBe(ID);
    expect(item.eventDigestHex).toBe(digestOperatorAlertExternalOutboxEvent(event()));
    expect(item.status).toBe('pending');
    expect(item.revision).toBe(1);
  });

  it('makes enqueue idempotent only for the exact alert and digest', () => {
    const port = memoryOutbox();
    expect(enqueueOperatorAlertExternalOutboxEvent({ event: event(), outbox: port }).status).toBe('enqueued');
    expect(enqueueOperatorAlertExternalOutboxEvent({ event: event(), outbox: port })).toEqual({
      status: 'deduplicated', alertIdHex: ID,
    });
    port.nextEnqueue = 'conflict';
    expect(enqueueOperatorAlertExternalOutboxEvent({ event: event(), outbox: port })).toEqual({ status: 'state_conflict' });
    port.nextEnqueue = 'unavailable';
    expect(enqueueOperatorAlertExternalOutboxEvent({ event: event(), outbox: port })).toEqual({ status: 'persistence_unavailable' });
  });

  it('claims before transport and delivers with the fixed alert idempotency key', async () => {
    const port = memoryOutbox();
    enqueue(port);
    const calls: unknown[] = [];
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port,
      nowMs: NOW,
      transport: { deliver(input) { calls.push(input); return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'delivered', alertIdHex: ID });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ alertIdHex: ID });
    expect(port.current()).toMatchObject({
      status: 'delivered', revision: 3, attemptCount: 1, deliveryReceiptDigestHex: RECEIPT,
    });
  });

  it('does not transport while a claim lease is active and retries after expiry', async () => {
    const port = memoryOutbox();
    enqueue(port);
    let deliveries = 0;
    port.nextCas = 'conflict';
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW,
      transport: { deliver() { deliveries += 1; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'state_conflict' });
    expect(deliveries).toBe(0);

    const pending = port.current()!;
    const claimed = normalizeOperatorAlertExternalOutboxItem({
      ...pending, status: 'delivering', revision: 2, attemptCount: 1,
      claimedAtMs: NOW, leaseExpiresAtMs: NOW + 15_000, updatedAtMs: NOW,
    });
    port.compareAndSet({ expectedRevision: pending.revision, next: claimed });
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW + 1,
      transport: { deliver() { deliveries += 1; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'in_flight', alertIdHex: ID });
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW + 15_000,
      transport: { deliver() { deliveries += 1; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'delivered', alertIdHex: ID });
    expect(deliveries).toBe(1);
    expect(port.current()).toMatchObject({ attemptCount: 2, status: 'delivered' });
  });

  it('schedules bounded retries for rejected, malformed, and thrown transport results', async () => {
    const cases = [
      [{ status: 'retryable_failure', code: 'transport_rejected' }, 'transport_rejected'],
      [{ status: 'delivered', receiptDigestHex: 'not-a-digest' }, 'transport_malformed'],
      [new Error('not persisted'), 'transport_threw'],
    ] as const;
    for (const [result, code] of cases) {
      const port = memoryOutbox();
      enqueue(port);
      const outcome = await runOperatorAlertExternalOutboxWorkerCycle({
        outbox: port,
        nowMs: NOW,
        transport: { deliver() { if (result instanceof Error) throw result; return result; } },
      });
      expect(outcome).toEqual({ status: 'retry_scheduled', alertIdHex: ID, code });
      expect(port.current()).toMatchObject({
        status: 'retry_wait', lastFailureCode: code, nextAttemptAtMs: NOW + 30_000,
      });
    }
  });

  it('does not retry before retry timing and retries with the same alert id after a crash boundary', async () => {
    const port = memoryOutbox();
    enqueue(port);
    await runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW,
      transport: { deliver() { return { status: 'retryable_failure', code: 'transport_unavailable' }; } },
    });
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW + 1,
      transport: { deliver() { throw new Error('must not transport'); } },
    })).resolves.toEqual({ status: 'retry_wait', alertIdHex: ID });
    let seen = '';
    await runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port, nowMs: NOW + 30_000,
      transport: { deliver(input) { seen = input.alertIdHex; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    });
    expect(seen).toBe(ID);
  });

  it('fails closed on completion persistence conflicts or unavailability after transport', async () => {
    for (const result of ['conflict', 'unavailable'] as const) {
      const port = memoryOutbox();
      enqueue(port);
      let calls = 0;
      const original = port.compareAndSet.bind(port);
      let count = 0;
      port.compareAndSet = input => {
        count += 1;
        if (count === 2) return result;
        return original(input);
      };
      await expect(runOperatorAlertExternalOutboxWorkerCycle({
        outbox: port, nowMs: NOW,
        transport: { deliver() { calls += 1; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
      })).resolves.toEqual({ status: result === 'conflict' ? 'state_conflict' : 'persistence_unavailable' });
      expect(calls).toBe(1);
      expect(port.current()!.status).toBe('delivering');
    }
  });

  it('retries a crash-after-delivery with the same fixed idempotency key', async () => {
    const port = memoryOutbox();
    enqueue(port);
    const original = port.compareAndSet.bind(port);
    let calls = 0;
    let casCount = 0;
    port.compareAndSet = input => {
      casCount += 1;
      if (casCount === 2) return 'unavailable';
      return original(input);
    };
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port,
      nowMs: NOW,
      transport: { deliver() { calls += 1; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'persistence_unavailable' });
    let retriedId = '';
    await expect(runOperatorAlertExternalOutboxWorkerCycle({
      outbox: port,
      nowMs: NOW + 15_000,
      transport: { deliver(input) { calls += 1; retriedId = input.alertIdHex; return { status: 'delivered', receiptDigestHex: RECEIPT }; } },
    })).resolves.toEqual({ status: 'delivered', alertIdHex: ID });
    expect(calls).toBe(2);
    expect(retriedId).toBe(ID);
  });

  it('fails closed when the outbox cannot be read', async () => {
    const outcome = await runOperatorAlertExternalOutboxWorkerCycle({
      outbox: Object.freeze({
        enqueue: () => 'unavailable' as const,
        readNext: () => Object.freeze({ status: 'unavailable' as const }),
        compareAndSet: () => 'unavailable' as const,
      }),
      nowMs: NOW,
      transport: { deliver() { throw new Error('must not transport'); } },
    });
    expect(outcome).toEqual({ status: 'persistence_unavailable' });
  });

  it('rejects wrong event digest, receipt digest, timing, and revision', () => {
    const item = createPendingOperatorAlertExternalOutboxItem({ event: event() });
    expect(() => normalizeOperatorAlertExternalOutboxItem({ ...item, eventDigestHex: 'd'.repeat(64) })).toThrow(/digest/);
    expect(() => normalizeOperatorAlertExternalOutboxItem({
      ...item, status: 'delivered', revision: 2, attemptCount: 1,
      deliveredAtMs: NOW, deliveryReceiptDigestHex: 'bad', updatedAtMs: NOW,
    })).toThrow(/receipt/);
    expect(() => normalizeOperatorAlertExternalOutboxItem({ ...item, updatedAtMs: NOW + 1 })).toThrow(/metadata/);
    expect(() => normalizeOperatorAlertExternalOutboxItem({ ...item, revision: 2 })).toThrow(/metadata/);
    expect(() => normalizeOperatorAlertExternalOutboxItem({
      ...item, status: 'delivering', revision: 1, attemptCount: 1,
      claimedAtMs: NOW, leaseExpiresAtMs: NOW + 15_000, updatedAtMs: NOW,
    })).toThrow(/regresses/);
  });
});
