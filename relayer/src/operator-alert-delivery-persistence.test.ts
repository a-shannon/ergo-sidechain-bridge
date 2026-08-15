import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { runBridgeDaemonOperatorAlerts } from './apps/bridge-daemon/operator-alerts.js';
import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthProjectionInput,
} from './relayer-core/operator-health-projection.js';
import type { OperatorAlertEvent } from './relayer-core/operator-alert-delivery.js';
import { StateTracker } from './state-tracker.js';

const NOW = 3_000_000;
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-operator-alert-'));
  directories.push(directory);
  return join(directory, 'state.sqlite');
}

function healthInput(nowMs = NOW): OperatorHealthProjectionInput {
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
    solvency: { state: 'clear', observedAtMs: nowMs - 2_000 },
    commitment: {
      configured: true,
      ready: true,
      observedAtMs: nowMs - 2_000,
      observedErgoHeight: 1_000,
      currentErgoHeight: 1_001,
    },
    finality: {
      observedAtMs: nowMs - 2_000,
      finalizedSidechainHeight: 500,
      currentSidechainHeight: 501,
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

describe('operator alert delivery persistence', () => {
  it('deduplicates a delivered alert across a real SQLite restart', () => {
    const dbPath = createDbPath();
    const projection = projectOperatorHealth(healthInput());
    const events: OperatorAlertEvent[] = [];
    const first = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: first,
      nowMs: NOW,
      writeLocalAlert: event => {
        events.push(event);
      },
    })).toBe('delivered');
    const firstState = first.getOperatorAlertDeliveryState(
      'bridge-daemon-health-v1',
    );
    expect(firstState).toMatchObject({
      deliveryStatus: 'delivered',
      attemptCount: 1,
    });
    first.close();

    const reopened = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 1_000)),
      state: reopened,
      nowMs: NOW + 1_000,
      writeLocalAlert: event => {
        events.push(event);
      },
    })).toBe('deduplicated');
    expect(events).toHaveLength(1);
    expect(reopened.getOperatorAlertDeliveryState(
      'bridge-daemon-health-v1',
    )?.alertIdHex).toBe(firstState?.alertIdHex);
    expect(reopened.compareAndSetOperatorAlertDeliveryState({
      expectedRevision: (firstState?.revision ?? 1) - 1,
      next: firstState!,
    })).toBe(false);
    expect(() => reopened.compareAndSetOperatorAlertDeliveryState({
      expectedRevision: firstState!.revision,
      next: firstState!,
    })).toThrow('operator alert state revision is not monotonic');
    reopened.close();
  });

  it('retries the same alert after restart without persisting raw failures', () => {
    const dbPath = createDbPath();
    const projection = projectOperatorHealth(healthInput());
    const first = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: first,
      nowMs: NOW,
      writeLocalAlert: () => {
        throw new Error('injected local sink failure');
      },
    })).toBe('retry_scheduled');
    const pending = first.getOperatorAlertDeliveryState(
      'bridge-daemon-health-v1',
    );
    expect(JSON.stringify(pending)).not.toMatch(/endpoint|exception|stack|error/i);
    first.close();

    const events: OperatorAlertEvent[] = [];
    const reopened = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection: projectOperatorHealth(healthInput(NOW + 30_000)),
      state: reopened,
      nowMs: NOW + 30_000,
      writeLocalAlert: event => {
        events.push(event);
      },
    })).toBe('delivered');
    expect(events[0].alertIdHex).toBe(pending?.alertIdHex);
    expect(reopened.getOperatorAlertDeliveryState(
      'bridge-daemon-health-v1',
    )).toMatchObject({
      deliveryStatus: 'delivered',
      attemptCount: 2,
    });
    reopened.close();
  });

  it('opens a new occurrence after database loss without restoring authority', () => {
    const dbPath = createDbPath();
    const projection = projectOperatorHealth(healthInput());
    const firstEvents: OperatorAlertEvent[] = [];
    const first = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: first,
      nowMs: NOW,
      writeLocalAlert: event => {
        firstEvents.push(event);
      },
    })).toBe('delivered');
    const firstGeneration = first.getOperatorAlertDeliveryCacheGenerationHex();
    first.close();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });

    const reconstructedEvents: OperatorAlertEvent[] = [];
    const reconstructed = new StateTracker(dbPath);
    const reconstructedGeneration =
      reconstructed.getOperatorAlertDeliveryCacheGenerationHex();
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: reconstructed,
      nowMs: NOW,
      writeLocalAlert: event => {
        reconstructedEvents.push(event);
      },
    })).toBe('delivered');
    expect(reconstructedEvents[0].conditionDigestHex).toBe(
      firstEvents[0].conditionDigestHex,
    );
    expect(reconstructedGeneration).not.toBe(firstGeneration);
    expect(reconstructedEvents[0].alertIdHex).not.toBe(firstEvents[0].alertIdHex);
    expect(reconstructedEvents[0].openedAtMs).toBe(NOW);
    expect(Object.values(reconstructedEvents[0].capabilities)).not.toContain(true);
    reconstructed.close();
  });

  it('fails closed when persisted delivery metadata is corrupt', () => {
    const dbPath = createDbPath();
    const projection = projectOperatorHealth(healthInput());
    const first = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: first,
      nowMs: NOW,
      writeLocalAlert: () => {},
    })).toBe('delivered');
    first.close();

    const raw = new Database(dbPath);
    raw.prepare(`
      UPDATE operator_alert_delivery_state SET alert_id_hex = ?
    `).run('a'.repeat(64));
    raw.close();

    let deliveries = 0;
    const reopened = new StateTracker(dbPath);
    expect(runBridgeDaemonOperatorAlerts({
      projection,
      state: reopened,
      nowMs: NOW + 1_000,
      writeLocalAlert: () => {
        deliveries += 1;
      },
    })).toBe('persistence_unavailable');
    expect(deliveries).toBe(0);
    reopened.close();
  });
});
