import { describe, expect, it } from 'vitest';

import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthProjectionInput,
} from './operator-health-projection.js';
import {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  resolveOperatorRecoveryAction,
  runOperatorAlertDeliveryCycle,
  type OperatorAlertDeliveryPort,
  type OperatorAlertDeliveryState,
  type OperatorAlertDeliveryStatePort,
  type OperatorAlertEvent,
  type OperatorAlertProfileV1,
} from './operator-alert-delivery.js';

const NOW = 2_000_000;
const CACHE_GENERATION = 'c'.repeat(64);

function healthyInput(nowMs = NOW): OperatorHealthProjectionInput {
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
    signer: { availability: 'available' },
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
      currentErgoHeight: 1_002,
    },
    finality: {
      observedAtMs: nowMs - 3_000,
      finalizedSidechainHeight: 500,
      currentSidechainHeight: 503,
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

function memoryStatePort(): OperatorAlertDeliveryStatePort & {
  current(): OperatorAlertDeliveryState | null;
} {
  let state: OperatorAlertDeliveryState | null = null;
  return {
    read: () => ({
      status: 'available',
      cacheGenerationHex: CACHE_GENERATION,
      state,
    }),
    compareAndSet: ({ expectedRevision, next }) => {
      if ((state?.revision ?? null) !== expectedRevision) return 'conflict';
      state = next;
      return 'stored';
    },
    current: () => state,
  };
}

function collectingDelivery(
  events: OperatorAlertEvent[],
  results: ReturnType<OperatorAlertDeliveryPort['deliver']>[] = [],
): OperatorAlertDeliveryPort {
  return {
    deliver(event) {
      events.push(event);
      return results.shift() ?? { status: 'delivered' };
    },
  };
}

describe('operator alert delivery state machine', () => {
  it('creates, deduplicates, updates, and recovers deterministic alerts', () => {
    const state = memoryStatePort();
    const events: OperatorAlertEvent[] = [];
    const delivery = collectingDelivery(events);
    const healthy = projectOperatorHealth(healthyInput());

    expect(runOperatorAlertDeliveryCycle({
      projection: healthy,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('idle');

    const unavailableSigner = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    expect(runOperatorAlertDeliveryCycle({
      projection: unavailableSigner,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('delivered');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transition: 'raised',
      reasons: ['signer_unavailable'],
    });
    expect(events[0].recoveryActions.map(action => action.actionId)).toEqual([
      'triage-settlement',
      'classify-operator-incident',
    ]);
    expect(Object.values(events[0].capabilities)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);

    const sameStableStateLater = projectOperatorHealth({
      ...healthyInput(NOW + 5_000),
      signer: { availability: 'unavailable' },
    });
    expect(runOperatorAlertDeliveryCycle({
      projection: sameStableStateLater,
      state,
      delivery,
      nowMs: NOW + 5_000,
    })).toBe('deduplicated');
    expect(events).toHaveLength(1);

    const changedHold = projectOperatorHealth({
      ...healthyInput(NOW + 6_000),
      signer: { availability: 'unavailable' },
      fundsRelease: {
        ...healthyInput(NOW + 6_000).fundsRelease,
        processHoldOpen: true,
      },
    });
    expect(runOperatorAlertDeliveryCycle({
      projection: changedHold,
      state,
      delivery,
      nowMs: NOW + 6_000,
    })).toBe('delivered');
    expect(events[1].transition).toBe('updated');
    expect(events[1].previousAlertIdHex).toBe(events[0].alertIdHex);

    const recovered = projectOperatorHealth(healthyInput(NOW + 7_000));
    expect(runOperatorAlertDeliveryCycle({
      projection: recovered,
      state,
      delivery,
      nowMs: NOW + 7_000,
    })).toBe('delivered');
    expect(events[2]).toMatchObject({
      transition: 'recovered',
      reasons: [],
      recoveryActions: [],
    });
  });

  it('persists retry metadata and reclaims only after the retry deadline', () => {
    const state = memoryStatePort();
    const events: OperatorAlertEvent[] = [];
    const delivery = collectingDelivery(events, [
      { status: 'retryable_failure', code: 'delivery_unavailable' },
      { status: 'delivered' },
    ]);
    const input = healthyInput();
    const stale = projectOperatorHealth({
      ...input,
      finality: {
        ...input.finality,
        observedAtMs: NOW - 20_001,
      },
    });

    expect(runOperatorAlertDeliveryCycle({
      projection: stale,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('retry_scheduled');
    expect(state.current()).toMatchObject({
      deliveryStatus: 'retry_wait',
      attemptCount: 1,
      lastFailureCode: 'delivery_unavailable',
      nextAttemptAtMs: NOW + 30_000,
    });
    expect(runOperatorAlertDeliveryCycle({
      projection: stale,
      state,
      delivery,
      nowMs: NOW + 29_999,
    })).toBe('retry_wait');
    expect(events).toHaveLength(1);
    expect(runOperatorAlertDeliveryCycle({
      projection: stale,
      state,
      delivery,
      nowMs: NOW + 30_000,
    })).toBe('delivered');
    expect(events).toHaveLength(2);
    expect(events[1].alertIdHex).toBe(events[0].alertIdHex);
    expect(state.current()).toMatchObject({
      deliveryStatus: 'delivered',
      attemptCount: 2,
      deliveredAtMs: NOW + 30_000,
    });
  });

  it('delivers a failed incident before a later recovery', () => {
    const state = memoryStatePort();
    const events: OperatorAlertEvent[] = [];
    const delivery = collectingDelivery(events, [
      { status: 'retryable_failure', code: 'delivery_unavailable' },
      { status: 'delivered' },
      { status: 'delivered' },
    ]);
    const active = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    const recovered = projectOperatorHealth(healthyInput(NOW + 1_000));

    expect(runOperatorAlertDeliveryCycle({
      projection: active,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('retry_scheduled');
    expect(runOperatorAlertDeliveryCycle({
      projection: recovered,
      state,
      delivery,
      nowMs: NOW + 1_000,
    })).toBe('retry_wait');
    expect(events).toHaveLength(1);

    expect(runOperatorAlertDeliveryCycle({
      projection: recovered,
      state,
      delivery,
      nowMs: NOW + 30_000,
    })).toBe('delivered');
    expect(events[1]).toMatchObject({
      alertIdHex: events[0].alertIdHex,
      transition: 'raised',
      reasons: ['signer_unavailable'],
    });
    expect(runOperatorAlertDeliveryCycle({
      projection: recovered,
      state,
      delivery,
      nowMs: NOW + 30_001,
    })).toBe('delivered');
    expect(events[2]).toMatchObject({
      transition: 'recovered',
      reasons: [],
      previousAlertIdHex: events[1].alertIdHex,
    });
  });

  it('does not overtake an in-flight alert with a recovered state', () => {
    const state = memoryStatePort();
    const events: OperatorAlertEvent[] = [];
    const active = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    const recovered = projectOperatorHealth(healthyInput(NOW + 1));
    let nestedOutcome: string | null = null;
    const delivery: OperatorAlertDeliveryPort = {
      deliver(event) {
        events.push(event);
        if (events.length === 1) {
          nestedOutcome = runOperatorAlertDeliveryCycle({
            projection: recovered,
            state,
            delivery,
            nowMs: NOW + 1,
          });
        }
        return { status: 'delivered' };
      },
    };

    expect(runOperatorAlertDeliveryCycle({
      projection: active,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('delivered');
    expect(nestedOutcome).toBe('in_flight');
    expect(events.map(event => event.transition)).toEqual(['raised']);
    expect(runOperatorAlertDeliveryCycle({
      projection: recovered,
      state,
      delivery,
      nowMs: NOW + 2,
    })).toBe('delivered');
    expect(events.map(event => event.transition)).toEqual([
      'raised',
      'recovered',
    ]);
  });

  it('uses at-least-once identity when a lease expires before final CAS', () => {
    const state = memoryStatePort();
    const projection = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    const events: OperatorAlertEvent[] = [];
    let nestedOutcome: string | null = null;
    const delivery: OperatorAlertDeliveryPort = {
      deliver(event) {
        events.push(event);
        if (events.length === 1) {
          nestedOutcome = runOperatorAlertDeliveryCycle({
            projection,
            state,
            delivery,
            nowMs: NOW + 15_000,
          });
        }
        return { status: 'delivered' };
      },
    };

    expect(runOperatorAlertDeliveryCycle({
      projection,
      state,
      delivery,
      nowMs: NOW,
    })).toBe('state_conflict');
    expect(nestedOutcome).toBe('delivered');
    expect(events).toHaveLength(2);
    expect(events[1].alertIdHex).toBe(events[0].alertIdHex);
    expect(state.current()).toMatchObject({
      deliveryStatus: 'delivered',
      attemptCount: 2,
    });
  });

  it('fails closed on unavailable persistence and thrown delivery', () => {
    const projection = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    let deliveries = 0;
    expect(runOperatorAlertDeliveryCycle({
      projection,
      state: {
        read: () => ({ status: 'unavailable' }),
        compareAndSet: () => 'unavailable',
      },
      delivery: {
        deliver: () => {
          deliveries += 1;
          return { status: 'delivered' };
        },
      },
      nowMs: NOW,
    })).toBe('persistence_unavailable');
    expect(deliveries).toBe(0);

    const state = memoryStatePort();
    expect(runOperatorAlertDeliveryCycle({
      projection,
      state,
      delivery: {
        deliver: () => {
          throw new Error('private transport detail');
        },
      },
      nowMs: NOW,
    })).toBe('retry_scheduled');
    expect(state.current()).toMatchObject({
      deliveryStatus: 'retry_wait',
      lastFailureCode: 'unexpected_failure',
    });
    expect(JSON.stringify(state.current())).not.toContain('private transport detail');

    const malformedResultState = memoryStatePort();
    expect(runOperatorAlertDeliveryCycle({
      projection,
      state: malformedResultState,
      delivery: {
        deliver: () => ({ status: 'accepted' }) as unknown as {
          status: 'delivered';
        },
      },
      nowMs: NOW,
    })).toBe('retry_scheduled');
    expect(malformedResultState.current()).toMatchObject({
      lastFailureCode: 'unexpected_failure',
    });
  });

  it('rejects unknown profiles, actions, and authorizing projections', () => {
    expect(() => resolveOperatorRecoveryAction('execute-recovery')).toThrow(
      'unsupported operator recovery action',
    );
    const projection = projectOperatorHealth({
      ...healthyInput(),
      signer: { availability: 'unavailable' },
    });
    expect(() => runOperatorAlertDeliveryCycle({
      projection,
      profile: {
        ...BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
        profileId: 'unknown-profile',
      } as unknown as OperatorAlertProfileV1,
      state: memoryStatePort(),
      delivery: collectingDelivery([]),
      nowMs: NOW,
    })).toThrow('unsupported operator alert profile');
    expect(() => runOperatorAlertDeliveryCycle({
      projection: {
        ...projection,
        capabilities: {
          ...projection.capabilities,
          fundsAuthority: true,
        },
      } as unknown as typeof projection,
      state: memoryStatePort(),
      delivery: collectingDelivery([]),
      nowMs: NOW,
    })).toThrow('capability fundsAuthority must be false');
    expect(() => runOperatorAlertDeliveryCycle({
      projection: {
        ...projection,
        capabilities: {
          ...projection.capabilities,
          holdClear: true,
        },
      } as unknown as typeof projection,
      state: memoryStatePort(),
      delivery: collectingDelivery([]),
      nowMs: NOW,
    })).toThrow('capabilities must use the exact reviewed fields');
  });
});
