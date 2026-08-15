import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  OPERATOR_ALERT_DELIVERY_DRILL_ABSENT_CAPABILITIES,
  runOperatorAlertDeliveryDrill,
} from './scripts/operator-alert-delivery-drill.js';

describe('operator alert delivery drill', () => {
  it('covers creation, deduplication, failure, retry, restart, and recovery', () => {
    const report = runOperatorAlertDeliveryDrill();

    expect(report).toMatchObject({
      schema: 'e2s.operator-alert-delivery-drill.v1',
      result: 'PASS',
      profileId: 'bridge-daemon-health-v1',
      stageCount: 7,
      ephemeralDatabaseUsed: true,
      restartExercised: true,
      networkConfigured: false,
      privateRuntimeDatabaseRead: false,
      externalDeliveryConfigured: false,
    });
    expect(report.stages.map(stage => stage.outcome)).toEqual([
      'delivered',
      'deduplicated',
      'delivered',
      'retry_scheduled',
      'retry_wait',
      'delivered',
      'delivered',
    ]);
    expect(report.stages[0]).toMatchObject({
      latestTransition: 'raised',
      latestReasons: ['finality_stale'],
    });
    expect(report.stages[2]).toMatchObject({
      latestTransition: 'recovered',
      latestReasons: [],
    });
    expect(report.stages[5].deliveryCallCount).toBe(4);
    expect(report.stages[6]).toMatchObject({
      deliveryCallCount: 5,
      latestTransition: 'recovered',
    });
    expect(Object.values(report.authority)).not.toContain(true);
    expect(report.absentCapabilities).toBe(
      OPERATOR_ALERT_DELIVERY_DRILL_ABSENT_CAPABILITIES,
    );
  });

  it('keeps the drill composition config-free and outside live capabilities', () => {
    const source = readFileSync(
      new URL('./scripts/operator-alert-delivery-drill.ts', import.meta.url),
      'utf8',
    );
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);

    expect(imports).toEqual([
      'node:fs',
      'node:os',
      'node:path',
      'node:url',
      '../apps/bridge-daemon/operator-alerts.js',
      '../relayer-core/operator-health-projection.js',
      '../relayer-core/operator-alert-delivery.js',
      '../state-tracker.js',
    ]);
    expect(source).not.toContain('process.env');
    expect(source).not.toMatch(/ErgoClient|SidechainClient|loadDeployedState/);
    expect(source).not.toMatch(/Wallet|sign_transaction|submitTransaction/);
  });
});
