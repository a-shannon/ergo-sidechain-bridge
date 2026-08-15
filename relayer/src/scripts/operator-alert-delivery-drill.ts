import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBridgeDaemonOperatorAlerts } from '../apps/bridge-daemon/operator-alerts.js';
import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthProjection,
  type OperatorHealthProjectionInput,
} from '../relayer-core/operator-health-projection.js';
import type {
  OperatorAlertDeliveryCycleOutcome,
  OperatorAlertEvent,
} from '../relayer-core/operator-alert-delivery.js';
import { StateTracker } from '../state-tracker.js';

export const OPERATOR_ALERT_DELIVERY_DRILL_SCHEMA =
  'e2s.operator-alert-delivery-drill.v1' as const;

export const OPERATOR_ALERT_DELIVERY_DRILL_ABSENT_CAPABILITIES = Object.freeze([
  'live-network',
  'environment-read',
  'private-runtime-database-read',
  'deployment-state-read',
  'checker',
  'signer',
  'hold-clear',
  'execution-reservation',
  'submission',
  'broadcast',
  'funds-authority',
] as const);

const BASE_TIME_MS = 4_000_000;

type DrillStageId =
  | 'J01_STALE_ALERT_CREATED'
  | 'J02_STALE_ALERT_DEDUPLICATED'
  | 'J03_STALE_ALERT_RECOVERED'
  | 'J04_DELIVERY_FAILURE_RETAINED'
  | 'J05_RETRY_DEFERRED'
  | 'J06_RESTART_RETRY_DELIVERED'
  | 'J07_RESTART_RECOVERY_DELIVERED';

export interface OperatorAlertDeliveryDrillStage {
  readonly id: DrillStageId;
  readonly outcome: OperatorAlertDeliveryCycleOutcome;
  readonly deliveryCallCount: number;
  readonly latestTransition: OperatorAlertEvent['transition'] | null;
  readonly latestReasons: readonly string[];
}

export interface OperatorAlertDeliveryDrillReport {
  readonly schema: typeof OPERATOR_ALERT_DELIVERY_DRILL_SCHEMA;
  readonly result: 'PASS';
  readonly profileId: 'bridge-daemon-health-v1';
  readonly stageCount: 7;
  readonly ephemeralDatabaseUsed: true;
  readonly restartExercised: true;
  readonly networkConfigured: false;
  readonly privateRuntimeDatabaseRead: false;
  readonly externalDeliveryConfigured: false;
  readonly authority: Readonly<{
    mutation: false;
    holdClear: false;
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
  readonly absentCapabilities:
    typeof OPERATOR_ALERT_DELIVERY_DRILL_ABSENT_CAPABILITIES;
  readonly stages: readonly OperatorAlertDeliveryDrillStage[];
}

const NO_AUTHORITY = Object.freeze({
  mutation: false,
  holdClear: false,
  checking: false,
  signing: false,
  authorization: false,
  submission: false,
  broadcast: false,
  fundsAuthority: false,
} as const);

function healthInput(
  nowMs: number,
  mode: 'healthy' | 'finality_stale' | 'signer_unavailable',
): OperatorHealthProjectionInput {
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
    signer: {
      availability: mode === 'signer_unavailable'
        ? 'unavailable'
        : 'available',
    },
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
      observedAtMs: mode === 'finality_stale'
        ? nowMs - 20_001
        : nowMs - 2_000,
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

function projection(
  nowMs: number,
  mode: 'healthy' | 'finality_stale' | 'signer_unavailable',
): OperatorHealthProjection {
  return projectOperatorHealth(healthInput(nowMs, mode));
}

function stage(
  id: DrillStageId,
  outcome: OperatorAlertDeliveryCycleOutcome,
  events: readonly OperatorAlertEvent[],
): OperatorAlertDeliveryDrillStage {
  const latest = events.at(-1) ?? null;
  return Object.freeze({
    id,
    outcome,
    deliveryCallCount: events.length,
    latestTransition: latest?.transition ?? null,
    latestReasons: Object.freeze([...(latest?.reasons ?? [])]),
  });
}

export function runOperatorAlertDeliveryDrill(): OperatorAlertDeliveryDrillReport {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-alert-drill-'));
  const dbPath = join(directory, 'state.sqlite');
  const events: OperatorAlertEvent[] = [];
  const stages: OperatorAlertDeliveryDrillStage[] = [];
  let failNextDelivery = false;
  let state: StateTracker | null = new StateTracker(dbPath);
  const writeLocalAlert = (event: OperatorAlertEvent): void => {
    events.push(event);
    if (failNextDelivery) {
      failNextDelivery = false;
      throw new Error('injected local sink failure');
    }
  };
  const run = (
    nowMs: number,
    mode: 'healthy' | 'finality_stale' | 'signer_unavailable',
  ): OperatorAlertDeliveryCycleOutcome => {
    if (state === null) throw new Error('operator alert drill state is closed');
    return runBridgeDaemonOperatorAlerts({
      projection: projection(nowMs, mode),
      state,
      writeLocalAlert,
      nowMs,
    });
  };

  try {
    stages.push(stage(
      'J01_STALE_ALERT_CREATED',
      run(BASE_TIME_MS, 'finality_stale'),
      events,
    ));
    stages.push(stage(
      'J02_STALE_ALERT_DEDUPLICATED',
      run(BASE_TIME_MS + 1_000, 'finality_stale'),
      events,
    ));
    stages.push(stage(
      'J03_STALE_ALERT_RECOVERED',
      run(BASE_TIME_MS + 2_000, 'healthy'),
      events,
    ));
    failNextDelivery = true;
    stages.push(stage(
      'J04_DELIVERY_FAILURE_RETAINED',
      run(BASE_TIME_MS + 3_000, 'signer_unavailable'),
      events,
    ));
    stages.push(stage(
      'J05_RETRY_DEFERRED',
      run(BASE_TIME_MS + 32_999, 'signer_unavailable'),
      events,
    ));
    state.close();
    state = null;
    state = new StateTracker(dbPath);
    stages.push(stage(
      'J06_RESTART_RETRY_DELIVERED',
      run(BASE_TIME_MS + 33_000, 'signer_unavailable'),
      events,
    ));
    stages.push(stage(
      'J07_RESTART_RECOVERY_DELIVERED',
      run(BASE_TIME_MS + 34_000, 'healthy'),
      events,
    ));

    const expected = [
      'delivered',
      'deduplicated',
      'delivered',
      'retry_scheduled',
      'retry_wait',
      'delivered',
      'delivered',
    ];
    if (stages.some((entry, index) => entry.outcome !== expected[index])) {
      throw new Error('operator alert delivery drill outcome matrix failed');
    }
    if (events.length !== 5) {
      throw new Error('operator alert delivery drill call count failed');
    }
    if (events.some(event => Object.values(event.capabilities).some(Boolean))) {
      throw new Error('operator alert delivery drill exposed authority');
    }
    return Object.freeze({
      schema: OPERATOR_ALERT_DELIVERY_DRILL_SCHEMA,
      result: 'PASS',
      profileId: 'bridge-daemon-health-v1',
      stageCount: 7,
      ephemeralDatabaseUsed: true,
      restartExercised: true,
      networkConfigured: false,
      privateRuntimeDatabaseRead: false,
      externalDeliveryConfigured: false,
      authority: NO_AUTHORITY,
      absentCapabilities: OPERATOR_ALERT_DELIVERY_DRILL_ABSENT_CAPABILITIES,
      stages: Object.freeze(stages),
    });
  } finally {
    state?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (scriptPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(runOperatorAlertDeliveryDrill(), null, 2)}\n`);
}
