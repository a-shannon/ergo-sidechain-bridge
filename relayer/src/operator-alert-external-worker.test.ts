import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Ed25519OperatorAlertAcknowledgementVerifier,
} from './adapters/operator-alert-acknowledgement-verifier.js';
import {
  SqliteOperatorAlertAcknowledgementState,
} from './adapters/operator-alert-acknowledgement-state.js';
import {
  SqliteOperatorAlertExternalOutbox,
} from './adapters/operator-alert-external-outbox.js';
import { runBridgeDaemonOperatorAlerts } from './apps/bridge-daemon/operator-alerts.js';
import {
  recordOperatorAlertAcknowledgement,
  runOperatorAlertExternalWorker,
} from './apps/operator-alert-worker/operator-alert-worker.js';
import {
  OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
  canonicalOperatorAlertAcknowledgementBytes,
  type OperatorAlertAcknowledgement,
} from './relayer-core/operator-alert-acknowledgement.js';
import {
  digestOperatorAlertEvent,
  type OperatorAlertEvent,
} from './relayer-core/operator-alert-delivery.js';
import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthProjectionInput,
} from './relayer-core/operator-health-projection.js';
import { StateTracker } from './state-tracker.js';

const NOW = 4_000_000;
const RECEIPT = 'ab'.repeat(32);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), 'bridge-alert-worker-'));
  directories.push(value);
  return value;
}

function healthInput(nowMs: number): OperatorHealthProjectionInput {
  return {
    observedAtMs: nowMs,
    policy: createOperatorHealthPolicyV1({
      readQuorumMaxAgeMs: 10_000,
      commitmentMaxAgeMs: 20_000,
      commitmentMaxLagBlocks: 5,
      finalityMaxAgeMs: 20_000,
      finalityMaxLagBlocks: 10,
      solvencyMaxAgeMs: 120_000,
      stalledSettlementAgeMs: 900_000,
    }),
    signer: { availability: 'unavailable' },
    readQuorum: {
      state: 'closed',
      fundsReleaseHeld: false,
      consecutiveFailures: 0,
      lastFailureCode: null,
      lastAcceptedAtMs: nowMs - 1_000,
    },
    fundsRelease: {
      processHoldOpen: false,
      durableHoldOpen: false,
      incidentCount: 0,
      continuityStatus: 'established',
      externalContinuityWitnessCurrent: true,
      retainedExecutionAuthority: false,
    },
    solvency: { state: 'clear', observedAtMs: nowMs - 1_000 },
    commitment: {
      configured: true,
      ready: true,
      observedAtMs: nowMs - 1_000,
      observedErgoHeight: 100,
      currentErgoHeight: 100,
    },
    finality: {
      observedAtMs: nowMs - 1_000,
      finalizedSidechainHeight: 100,
      currentSidechainHeight: 100,
    },
    reorg: { reconciliationPending: false },
    persistence: {
      status: 'available',
      solvencyDeficitIncidentPresent: false,
      reorgQuarantineConditionCount: 0,
      activeSettlementAttemptCount: 0,
      oldestActiveSettlementUpdatedAtMs: null,
    },
  };
}

function enqueueAlert(input: Readonly<{
  statePath: string;
  outbox: SqliteOperatorAlertExternalOutbox;
  nowMs: number;
}>): OperatorAlertEvent {
  const state = new StateTracker(input.statePath);
  let event: OperatorAlertEvent | undefined;
  const outcome = runBridgeDaemonOperatorAlerts({
    projection: projectOperatorHealth(healthInput(input.nowMs)),
    state,
    externalOutbox: input.outbox,
    nowMs: input.nowMs,
    writeLocalAlert(value) {
      event = value;
    },
  });
  state.close();
  expect(outcome).toBe('delivered');
  expect(event).toBeDefined();
  return event!;
}

function signedAcknowledgement(input: Readonly<{
  event: OperatorAlertEvent;
  receiptDigestHex: string;
  keyIdHex: string;
  privateKey: KeyObject;
  acknowledgedAtMs: number;
  nonceHex: string;
}>): OperatorAlertAcknowledgement {
  const unsigned = {
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
    version: 1,
    domain: OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
    alertIdHex: input.event.alertIdHex,
    deliveryReceiptDigestHex: input.receiptDigestHex,
    keyIdHex: input.keyIdHex,
    acknowledgedAtMs: input.acknowledgedAtMs,
    nonceHex: input.nonceHex,
    signatureHex: '00'.repeat(64),
  } as const satisfies OperatorAlertAcknowledgement;
  return Object.freeze({
    ...unsigned,
    signatureHex: sign(
      null,
      canonicalOperatorAlertAcknowledgementBytes(unsigned),
      input.privateKey,
    ).toString('hex'),
  });
}

describe('external operator alert worker', () => {
  it('persists before local logging and delivers once after restart', async () => {
    const root = directory();
    const outboxPath = join(root, 'outbox.sqlite');
    const first = new SqliteOperatorAlertExternalOutbox(outboxPath);
    const event = enqueueAlert({
      statePath: join(root, 'state.sqlite'),
      outbox: first,
      nowMs: NOW,
    });
    expect(first.get(event.alertIdHex)).toMatchObject({
      status: 'pending',
      attemptCount: 0,
    });
    first.close();

    const calls: unknown[] = [];
    const reopened = new SqliteOperatorAlertExternalOutbox(outboxPath);
    expect(await runOperatorAlertExternalWorker({
      outbox: reopened,
      nowMs: NOW + 1,
      transport: {
        deliver(input) {
          calls.push(input);
          return { status: 'delivered', receiptDigestHex: RECEIPT };
        },
      },
    })).toEqual({ status: 'delivered', alertIdHex: event.alertIdHex });
    expect(calls).toEqual([expect.objectContaining({
      alertIdHex: event.alertIdHex,
      idempotencyKey: event.alertIdHex,
    })]);
    expect(reopened.get(event.alertIdHex)).toMatchObject({
      status: 'delivered',
      attemptCount: 1,
      deliveryReceiptDigestHex: RECEIPT,
    });
    expect(await runOperatorAlertExternalWorker({
      outbox: reopened,
      nowMs: NOW + 2,
      transport: { deliver: () => { throw new Error('must not run'); } },
    })).toEqual({ status: 'idle' });
    reopened.close();
  });

  it('retains the outbox event when local logging fails and deduplicates its retry', () => {
    const root = directory();
    const statePath = join(root, 'state.sqlite');
    const outbox = new SqliteOperatorAlertExternalOutbox(
      join(root, 'outbox.sqlite'),
    );
    const firstState = new StateTracker(statePath);
    let event: OperatorAlertEvent | undefined;
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW)),
      state: firstState,
      externalOutbox: outbox,
      nowMs: NOW,
      writeLocalAlert(value) {
        event = value;
        throw new Error('local log unavailable');
      },
    })).toBe('retry_scheduled');
    firstState.close();
    expect(outbox.get(event!.alertIdHex)).toMatchObject({ status: 'pending' });

    const reopenedState = new StateTracker(statePath);
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 30_001)),
      state: reopenedState,
      externalOutbox: outbox,
      nowMs: NOW + 30_001,
      writeLocalAlert(value) {
        expect(value.alertIdHex).toBe(event!.alertIdHex);
      },
    })).toBe('delivered');
    reopenedState.close();
    expect(outbox.get(event!.alertIdHex)).toMatchObject({
      status: 'pending',
      revision: 1,
    });
    outbox.close();
  });

  it('rebuilds the retained current alert after isolated outbox loss', () => {
    const root = directory();
    const statePath = join(root, 'state.sqlite');
    const outboxPath = join(root, 'outbox.sqlite');
    const first = new SqliteOperatorAlertExternalOutbox(outboxPath);
    const event = enqueueAlert({ statePath, outbox: first, nowMs: NOW });
    first.close();
    rmSync(outboxPath, { force: true });
    rmSync(`${outboxPath}-shm`, { force: true });
    rmSync(`${outboxPath}-wal`, { force: true });

    const rebuilt = new SqliteOperatorAlertExternalOutbox(outboxPath);
    const state = new StateTracker(statePath);
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 1)),
      state,
      externalOutbox: rebuilt,
      nowMs: NOW + 1,
      writeLocalAlert() {
        throw new Error('already locally delivered');
      },
    })).toBe('deduplicated');
    state.close();
    expect(rebuilt.get(event.alertIdHex)).toMatchObject({
      status: 'pending',
      eventDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    rebuilt.close();
  });

  it('retries through SQLite without changing the alert identity', async () => {
    const root = directory();
    const outboxPath = join(root, 'outbox.sqlite');
    const first = new SqliteOperatorAlertExternalOutbox(outboxPath);
    const event = enqueueAlert({
      statePath: join(root, 'state.sqlite'),
      outbox: first,
      nowMs: NOW,
    });
    expect(await runOperatorAlertExternalWorker({
      outbox: first,
      nowMs: NOW + 1,
      transport: {
        deliver: () => ({
          status: 'retryable_failure',
          code: 'transport_unavailable',
        }),
      },
    })).toMatchObject({
      status: 'retry_scheduled',
      alertIdHex: event.alertIdHex,
    });
    first.close();

    const reopened = new SqliteOperatorAlertExternalOutbox(outboxPath);
    expect(await runOperatorAlertExternalWorker({
      outbox: reopened,
      nowMs: NOW + 29_999,
      transport: { deliver: () => { throw new Error('must not run'); } },
    })).toEqual({ status: 'retry_wait', alertIdHex: event.alertIdHex });
    expect(await runOperatorAlertExternalWorker({
      outbox: reopened,
      nowMs: NOW + 30_001,
      transport: {
        deliver: input => {
          expect(input.idempotencyKey).toBe(event.alertIdHex);
          return { status: 'delivered', receiptDigestHex: RECEIPT };
        },
      },
    })).toMatchObject({ status: 'delivered', alertIdHex: event.alertIdHex });
    expect(reopened.get(event.alertIdHex)?.attemptCount).toBe(2);
    reopened.close();
  });

  it('does not deliver a later dependent alert while the oldest retry waits', async () => {
    const root = directory();
    const statePath = join(root, 'state.sqlite');
    const outbox = new SqliteOperatorAlertExternalOutbox(
      join(root, 'outbox.sqlite'),
    );
    const raised = enqueueAlert({ statePath, outbox, nowMs: NOW });
    const state = new StateTracker(statePath);
    let recovered: OperatorAlertEvent | undefined;
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth({
        ...healthInput(NOW),
        signer: { availability: 'available' },
      }),
      state,
      externalOutbox: outbox,
      nowMs: NOW,
      writeLocalAlert(value) {
        recovered = value;
      },
    })).toBe('delivered');
    state.close();
    expect(recovered?.previousAlertIdHex).toBe(raised.alertIdHex);

    expect(await runOperatorAlertExternalWorker({
      outbox,
      nowMs: NOW + 2,
      transport: {
        deliver: () => ({
          status: 'retryable_failure',
          code: 'transport_unavailable',
        }),
      },
    })).toMatchObject({ status: 'retry_scheduled', alertIdHex: raised.alertIdHex });
    let calls = 0;
    expect(await runOperatorAlertExternalWorker({
      outbox,
      nowMs: NOW + 3,
      transport: { deliver: () => { calls += 1; } },
    })).toEqual({ status: 'retry_wait', alertIdHex: raised.alertIdHex });
    expect(calls).toBe(0);

    const deliveredIds: string[] = [];
    for (const nowMs of [NOW + 30_002, NOW + 30_003]) {
      expect(await runOperatorAlertExternalWorker({
        outbox,
        nowMs,
        transport: {
          deliver(input) {
            deliveredIds.push(input.alertIdHex);
            return { status: 'delivered', receiptDigestHex: RECEIPT };
          },
        },
      })).toMatchObject({ status: 'delivered' });
    }
    expect(deliveredIds).toEqual([raised.alertIdHex, recovered!.alertIdHex]);
    outbox.close();
  });

  it('rejects immutable event mutation at the SQLite CAS boundary', () => {
    const root = directory();
    const outbox = new SqliteOperatorAlertExternalOutbox(
      join(root, 'outbox.sqlite'),
    );
    const event = enqueueAlert({
      statePath: join(root, 'state.sqlite'),
      outbox,
      nowMs: NOW,
    });
    const current = outbox.get(event.alertIdHex)!;
    const mutatedEvent = Object.freeze({
      ...current.event,
      openedAtMs: current.event.openedAtMs + 1,
    });
    const claimedAtMs = NOW + 10;
    expect(outbox.compareAndSet({
      expectedRevision: current.revision,
      next: Object.freeze({
        ...current,
        event: mutatedEvent,
        eventDigestHex: digestOperatorAlertEvent(mutatedEvent),
        status: 'delivering' as const,
        revision: current.revision + 1,
        attemptCount: 1,
        claimedAtMs,
        leaseExpiresAtMs: claimedAtMs + 15_000,
        createdAtMs: mutatedEvent.openedAtMs,
        updatedAtMs: claimedAtMs,
      }),
    })).toBe('conflict');
    expect(outbox.get(event.alertIdHex)).toEqual(current);
    outbox.close();
  });

  it('keeps local alert transitions visible through prolonged outbox failure', () => {
    const root = directory();
    const statePath = join(root, 'state.sqlite');
    const outbox = new SqliteOperatorAlertExternalOutbox(
      join(root, 'outbox.sqlite'),
    );
    const raised = enqueueAlert({ statePath, outbox, nowMs: NOW });
    const unavailableOutbox = {
      enqueue: () => 'unavailable' as const,
      readNext: () => Object.freeze({ status: 'unavailable' as const }),
      compareAndSet: () => 'unavailable' as const,
    };
    const state = new StateTracker(statePath);
    const logged: OperatorAlertEvent[] = [];
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth({
        ...healthInput(NOW + 1),
        signer: { availability: 'available' },
      }),
      state,
      externalOutbox: unavailableOutbox,
      nowMs: NOW + 1,
      writeLocalAlert(value) {
        logged.push(value);
      },
    })).toBe('persistence_unavailable');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      transition: 'recovered',
      previousAlertIdHex: raised.alertIdHex,
    });
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 2)),
      state,
      externalOutbox: unavailableOutbox,
      nowMs: NOW + 2,
      writeLocalAlert(value) {
        logged.push(value);
      },
    })).toBe('persistence_unavailable');
    expect(logged).toHaveLength(2);
    expect(logged[1]).toMatchObject({
      transition: 'raised',
      previousAlertIdHex: logged[0].alertIdHex,
    });
    state.close();

    const reopened = new StateTracker(statePath);
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 3)),
      state: reopened,
      externalOutbox: outbox,
      nowMs: NOW + 3,
      writeLocalAlert() {
        throw new Error('current local alert is already delivered');
      },
    })).toBe('deduplicated');
    reopened.close();
    expect(outbox.get(logged[0].alertIdHex)).toBeNull();
    expect(outbox.get(logged[1].alertIdHex)).toMatchObject({ status: 'pending' });
    outbox.close();
  });

  it('fails closed on canonical item corruption before transport', async () => {
    const root = directory();
    const outboxPath = join(root, 'outbox.sqlite');
    const first = new SqliteOperatorAlertExternalOutbox(outboxPath);
    enqueueAlert({
      statePath: join(root, 'state.sqlite'),
      outbox: first,
      nowMs: NOW,
    });
    first.close();
    const raw = new Database(outboxPath);
    raw.prepare(`
      UPDATE operator_alert_external_outbox SET item_json = ?
    `).run('{"schema":"corrupt"}');
    raw.close();

    let calls = 0;
    const reopened = new SqliteOperatorAlertExternalOutbox(outboxPath);
    expect(await runOperatorAlertExternalWorker({
      outbox: reopened,
      nowMs: NOW + 1,
      transport: { deliver: () => { calls += 1; } },
    })).toEqual({ status: 'persistence_unavailable' });
    expect(calls).toBe(0);
    reopened.close();
  });

  it('stores a signed acknowledgement as non-authorizing audit metadata', async () => {
    const root = directory();
    const outbox = new SqliteOperatorAlertExternalOutbox(
      join(root, 'outbox.sqlite'),
    );
    const acknowledgementState = new SqliteOperatorAlertAcknowledgementState(
      join(root, 'outbox.sqlite'),
      outbox,
    );
    const event = enqueueAlert({
      statePath: join(root, 'state.sqlite'),
      outbox,
      nowMs: NOW,
    });
    await runOperatorAlertExternalWorker({
      outbox,
      nowMs: NOW + 1,
      transport: {
        deliver: () => ({ status: 'delivered', receiptDigestHex: RECEIPT }),
      },
    });

    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
    const keyIdHex = createHash('sha256').update(publicKeyDer).digest('hex');
    const verifier = new Ed25519OperatorAlertAcknowledgementVerifier({
      schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
      version: 1,
      keys: [{
        keyIdHex,
        publicKeySpkiDerHex: publicKeyDer.toString('hex'),
      }],
    });
    const acknowledgement = signedAcknowledgement({
      event,
      receiptDigestHex: RECEIPT,
      keyIdHex,
      privateKey,
      acknowledgedAtMs: NOW + 2,
      nonceHex: 'cd'.repeat(32),
    });
    expect(recordOperatorAlertAcknowledgement({
      acknowledgement,
      verifier,
      store: acknowledgementState,
      verifiedAtMs: NOW + 3,
    })).toBe('stored');
    expect(recordOperatorAlertAcknowledgement({
      acknowledgement,
      verifier,
      store: acknowledgementState,
      verifiedAtMs: NOW + 3,
    })).toBe('deduplicated');
    const record = acknowledgementState.getAcknowledgement(event.alertIdHex);
    expect(record).toMatchObject({
      alertIdHex: event.alertIdHex,
      deliveryReceiptDigestHex: RECEIPT,
      keyIdHex,
      auditMetadataOnly: true,
    });
    expect(JSON.stringify(record)).not.toMatch(
      /private|signature|authorization|endpoint/i,
    );
    acknowledgementState.close();
    outbox.close();
  });

  it('rejects acknowledgement nonce replay across distinct delivered alerts', async () => {
    const root = directory();
    const outboxPath = join(root, 'outbox.sqlite');
    const outbox = new SqliteOperatorAlertExternalOutbox(outboxPath);
    const firstEvent = enqueueAlert({
      statePath: join(root, 'first-state.sqlite'),
      outbox,
      nowMs: NOW,
    });
    const secondEvent = enqueueAlert({
      statePath: join(root, 'second-state.sqlite'),
      outbox,
      nowMs: NOW + 1,
    });
    for (const nowMs of [NOW + 2, NOW + 3]) {
      expect(await runOperatorAlertExternalWorker({
        outbox,
        nowMs,
        transport: {
          deliver: () => ({ status: 'delivered', receiptDigestHex: RECEIPT }),
        },
      })).toMatchObject({ status: 'delivered' });
    }

    const acknowledgementState = new SqliteOperatorAlertAcknowledgementState(
      outboxPath,
      outbox,
    );
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
    const keyIdHex = createHash('sha256').update(publicKeyDer).digest('hex');
    const verifier = new Ed25519OperatorAlertAcknowledgementVerifier({
      schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
      version: 1,
      keys: [{
        keyIdHex,
        publicKeySpkiDerHex: publicKeyDer.toString('hex'),
      }],
    });
    const nonceHex = 'ef'.repeat(32);
    const first = signedAcknowledgement({
      event: firstEvent,
      receiptDigestHex: RECEIPT,
      keyIdHex,
      privateKey,
      acknowledgedAtMs: NOW + 4,
      nonceHex,
    });
    const second = signedAcknowledgement({
      event: secondEvent,
      receiptDigestHex: RECEIPT,
      keyIdHex,
      privateKey,
      acknowledgedAtMs: NOW + 5,
      nonceHex,
    });
    expect(recordOperatorAlertAcknowledgement({
      acknowledgement: first,
      verifier,
      store: acknowledgementState,
      verifiedAtMs: NOW + 6,
    })).toBe('stored');
    expect(recordOperatorAlertAcknowledgement({
      acknowledgement: second,
      verifier,
      store: acknowledgementState,
      verifiedAtMs: NOW + 7,
    })).toBe('conflict');
    expect(acknowledgementState.getAcknowledgement(secondEvent.alertIdHex))
      .toBeNull();
    acknowledgementState.close();
    outbox.close();
  });
});
