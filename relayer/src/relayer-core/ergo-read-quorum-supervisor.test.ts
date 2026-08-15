import { describe, expect, it } from 'vitest';

import {
  ERGO_READ_QUORUM_OBSERVATION_SCHEMA,
  ErgoReadQuorumSupervisor,
  type ErgoReadQuorumObservation,
} from './ergo-read-quorum-supervisor.js';

const hex = (byte: string): string => byte.repeat(32);

function observation(patch: Partial<ErgoReadQuorumObservation> = {}): ErgoReadQuorumObservation {
  return {
    schema: ERGO_READ_QUORUM_OBSERVATION_SCHEMA,
    sourceIdsHex: [hex('01'), hex('02')],
    tipHeight: 42,
    tipHeaderIdHex: hex('03'),
    observationDigestHex: hex('04'),
    startedAtMs: 10,
    completedAtMs: 20,
    ...patch,
  };
}

describe('ErgoReadQuorumSupervisor', () => {
  it('starts open and holds all read cycles', () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });

    expect(supervisor.getReadCycleDecision(0)).toMatchObject({
      decision: 'hold_read_cycle',
      tip: null,
      snapshot: {
        state: 'open',
        fundsReleaseHeld: true,
        consecutiveFailures: 0,
        lastFailureCode: 'not_configured',
      },
    });
  });

  it('closes only for a current, matching two-source observation', () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const token = supervisor.beginProbe(10);

    expect(supervisor.recordSuccess(token, observation(), 20)).toBe('accepted');
    const decision = supervisor.getReadCycleDecision(20);
    expect(decision).toEqual({
      decision: 'allow_read_cycle',
      tip: {
        height: 42,
        headerIdHex: hex('03'),
        observationDigestHex: hex('04'),
      },
      snapshot: expect.objectContaining({
        state: 'closed',
        fundsReleaseHeld: false,
        consecutiveFailures: 0,
        lastFailureCode: null,
      }),
    });
    expect(supervisor.isReadCycleDecisionCurrent(decision, 20)).toBe(true);
    supervisor.beginProbe(21);
    expect(supervisor.isReadCycleDecisionCurrent(decision, 21)).toBe(false);
  });

  it('rejects a superseded completion without mutating the newer probe', () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const first = supervisor.beginProbe(10);
    const second = supervisor.beginProbe(11);

    expect(supervisor.recordSuccess(first, observation(), 20)).toBe('stale');
    expect(supervisor.getSnapshot(20)).toMatchObject({
      state: 'half_open',
      activeGeneration: second.generation,
      fundsReleaseHeld: true,
    });

    expect(supervisor.recordSuccess(second, observation({
      startedAtMs: 11,
    }), 20)).toBe('accepted');
    expect(supervisor.getReadCycleDecision(20).decision).toBe('allow_read_cycle');
  });

  it('opens when a successful probe exceeds its duration or freshness bounds', () => {
    const durationLimited = new ErgoReadQuorumSupervisor({ maxAgeMs: 10 });
    const durationToken = durationLimited.beginProbe(0);
    expect(durationLimited.recordSuccess(durationToken, observation({
      startedAtMs: 0,
      completedAtMs: 11,
    }), 11)).toBe('accepted');
    expect(durationLimited.getSnapshot(11)).toMatchObject({
      state: 'open',
      lastFailureCode: 'probe_stale',
      fundsReleaseHeld: true,
    });

    const ageLimited = new ErgoReadQuorumSupervisor({ maxAgeMs: 10 });
    const ageToken = ageLimited.beginProbe(10);
    ageLimited.recordSuccess(ageToken, observation(), 20);
    const ageDecision = ageLimited.getReadCycleDecision(20);
    expect(ageLimited.isReadCycleDecisionCurrent(ageDecision, 31)).toBe(false);
    expect(ageLimited.getReadCycleDecision(31)).toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: {
        state: 'open',
        lastFailureCode: 'probe_stale',
      },
    });

    const clockRollback = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const rollbackToken = clockRollback.beginProbe(10);
    clockRollback.recordSuccess(rollbackToken, observation(), 20);
    expect(clockRollback.getReadCycleDecision(19)).toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: {
        state: 'open',
        lastFailureCode: 'probe_stale',
      },
    });

    const predated = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const predatedToken = predated.beginProbe(11);
    predated.recordSuccess(predatedToken, observation({
      startedAtMs: 10,
      completedAtMs: 20,
    }), 20);
    expect(predated.getReadCycleDecision(20)).toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: {
        state: 'open',
        lastFailureCode: 'probe_stale',
      },
    });
  });

  it('offers a read-only snapshot that cannot expire accepted authority', () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 10 });
    const token = supervisor.beginProbe(10);
    expect(supervisor.recordSuccess(token, observation(), 20)).toBe('accepted');

    expect(supervisor.peekSnapshot()).toMatchObject({
      state: 'closed',
      fundsReleaseHeld: false,
      consecutiveFailures: 0,
    });
    expect(supervisor.peekSnapshot()).toMatchObject({
      state: 'closed',
      fundsReleaseHeld: false,
      consecutiveFailures: 0,
    });
    expect(supervisor.getSnapshot(31)).toMatchObject({
      state: 'open',
      fundsReleaseHeld: true,
      lastFailureCode: 'probe_stale',
      consecutiveFailures: 1,
    });
  });

  it('fails closed on a malformed observation and on explicit source failures', () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const malformedToken = supervisor.beginProbe(10);
    supervisor.recordSuccess(malformedToken, observation({
      sourceIdsHex: [hex('01'), hex('01')],
    }), 20);
    expect(supervisor.getSnapshot(20)).toMatchObject({
      state: 'open',
      lastFailureCode: 'invalid_response',
      consecutiveFailures: 1,
    });

    const unavailableToken = supervisor.beginProbe(21);
    expect(supervisor.recordFailure(unavailableToken, 'source_unavailable', 22)).toBe('accepted');
    expect(supervisor.getSnapshot(22)).toMatchObject({
      state: 'open',
      lastFailureCode: 'source_unavailable',
      consecutiveFailures: 2,
    });
  });
});
