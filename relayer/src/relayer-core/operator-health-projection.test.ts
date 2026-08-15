import { describe, expect, it } from 'vitest';

import {
  createOperatorHealthPolicyV1,
  projectOperatorHealth,
  type OperatorHealthProjectionInput,
} from './operator-health-projection.js';

const NOW = 2_000_000;

function healthyInput(): OperatorHealthProjectionInput {
  return {
    observedAtMs: NOW,
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
      availability: 'available',
    },
    readQuorum: {
      state: 'closed',
      fundsReleaseHeld: false,
      consecutiveFailures: 0,
      lastFailureCode: null,
      lastAcceptedAtMs: NOW - 1_000,
    },
    fundsRelease: {
      processHoldOpen: false,
      durableHoldOpen: false,
      incidentCount: 0,
      continuityStatus: 'established',
      externalContinuityWitnessCurrent: true,
      retainedExecutionAuthority: false,
    },
    solvency: {
      state: 'clear',
      observedAtMs: NOW - 20_000,
    },
    commitment: {
      configured: true,
      ready: true,
      observedAtMs: NOW - 2_000,
      observedErgoHeight: 1_000,
      currentErgoHeight: 1_002,
    },
    finality: {
      observedAtMs: NOW - 3_000,
      finalizedSidechainHeight: 500,
      currentSidechainHeight: 503,
    },
    reorg: {
      reconciliationPending: false,
    },
    persistence: {
      status: 'available',
      solvencyDeficitIncidentPresent: false,
      reorgQuarantineConditionCount: 0,
      activeSettlementAttemptCount: 1,
      oldestActiveSettlementUpdatedAtMs: NOW - 60_000,
    },
  };
}

describe('operator health projection', () => {
  it('projects one deeply frozen, non-authorizing healthy view', () => {
    const projection = projectOperatorHealth(healthyInput());

    expect(projection.overall).toBe('healthy');
    expect(projection.reasons).toEqual([]);
    expect(projection.signals.commitment).toMatchObject({
      ageMs: 2_000,
      lagBlocks: 2,
    });
    expect(projection.signals.finality).toMatchObject({
      ageMs: 3_000,
      lagBlocks: 3,
    });
    expect(projection.signals.settlement).toMatchObject({
      activeAttemptCount: 1,
      oldestActiveAgeMs: 60_000,
      stalled: false,
    });
    expect(Object.values(projection.capabilities)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.signals)).toBe(true);
    expect(Object.isFrozen(projection.signals.commitment)).toBe(true);
    expect(Object.isFrozen(projection.reasons)).toBe(true);
  });

  it('holds on unavailable signer state without exposing signer material', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      signer: {
        availability: 'unavailable',
      },
    });

    expect(projection.schema).toBe('e2s.operator-health-projection.v3');
    expect(projection.overall).toBe('held');
    expect(projection.reasons).toEqual(['signer_unavailable']);
    expect(projection.signals.signer).toEqual({
      status: 'held',
      availability: 'unavailable',
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /address|publicKey|privateKey|mnemonic|origin|endpoint/i,
    );
  });

  it('reports an intentionally absent signer without inventing a failure', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      signer: {
        availability: 'not_configured',
      },
    });

    expect(projection.overall).toBe('healthy');
    expect(projection.reasons).not.toContain('signer_unavailable');
    expect(projection.signals.signer).toEqual({
      status: 'not_applicable',
      availability: 'not_configured',
    });
    expect(projection.capabilities.signing).toBe(false);
  });

  it('holds on deciding safety conditions and orders reasons deterministically', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      readQuorum: {
        ...input.readQuorum,
        state: 'open',
        fundsReleaseHeld: true,
        consecutiveFailures: 2,
        lastFailureCode: 'source_disagreement',
      },
      fundsRelease: {
        ...input.fundsRelease,
        durableHoldOpen: true,
        incidentCount: 1,
      },
      solvency: {
        state: 'deficit',
        observedAtMs: NOW - 1_000,
      },
      reorg: {
        reconciliationPending: true,
      },
      persistence: {
        status: 'available',
        solvencyDeficitIncidentPresent: true,
        reorgQuarantineConditionCount: 2,
        activeSettlementAttemptCount: 0,
        oldestActiveSettlementUpdatedAtMs: null,
      },
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toEqual([
      'read_quorum_held',
      'funds_release_held',
      'solvency_deficit',
      'reorg_reconciliation_pending',
      'reorg_quarantine_present',
    ]);
    expect(projection.signals.reorg.status).toBe('held');
  });

  it('degrades for stale observations and stalled settlement without inventing authority', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      solvency: {
        state: 'clear',
        observedAtMs: NOW - 120_001,
      },
      commitment: {
        ...input.commitment,
        observedAtMs: NOW - 20_001,
      },
      finality: {
        ...input.finality,
        observedAtMs: NOW - 20_001,
      },
      persistence: {
        status: 'available',
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 0,
        activeSettlementAttemptCount: 2,
        oldestActiveSettlementUpdatedAtMs: NOW - 900_001,
      },
    });

    expect(projection.overall).toBe('degraded');
    expect(projection.reasons).toEqual([
      'solvency_stale',
      'commitment_stale',
      'finality_stale',
      'settlement_stalled',
    ]);
  });

  it('degrades fresh observations whose producer progress exceeds policy', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      commitment: {
        ...input.commitment,
        observedErgoHeight: 996,
        currentErgoHeight: 1_002,
      },
      finality: {
        ...input.finality,
        finalizedSidechainHeight: 492,
        currentSidechainHeight: 503,
      },
    });

    expect(projection.overall).toBe('degraded');
    expect(projection.reasons).toEqual([
      'commitment_lagging',
      'finality_lagging',
    ]);
    expect(projection.signals.commitment).toMatchObject({
      status: 'degraded',
      lagBlocks: 6,
    });
    expect(projection.signals.finality).toMatchObject({
      status: 'degraded',
      lagBlocks: 11,
    });
  });

  it('fails the public status closed when persistence is unavailable', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      persistence: { status: 'unavailable' },
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toEqual([
      'persistence_unavailable',
      'solvency_unavailable',
    ]);
    expect(projection.signals.persistence.status).toBe('unavailable');
    expect(projection.signals.reorg.status).toBe('unavailable');
    expect(projection.signals.settlement).toMatchObject({
      status: 'unavailable',
      activeAttemptCount: null,
      oldestActiveAgeMs: null,
      stalled: null,
    });
  });

  it('represents clock rollback as held instead of a negative age', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      finality: {
        observedAtMs: NOW + 1,
        finalizedSidechainHeight: 500,
        currentSidechainHeight: 503,
      },
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toContain('operator_clock_rollback');
    expect(projection.signals.finality).toMatchObject({
      status: 'held',
      ageMs: null,
    });
  });

  it('holds on clock rollback even when another signal is unavailable', () => {
    const input = healthyInput();
    const projection = projectOperatorHealth({
      ...input,
      solvency: {
        state: 'unavailable',
        observedAtMs: NOW + 1,
      },
      commitment: {
        configured: true,
        ready: false,
        observedAtMs: NOW + 1,
        observedErgoHeight: 1_000,
        currentErgoHeight: 1_002,
      },
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toEqual([
      'operator_clock_rollback',
      'solvency_unavailable',
    ]);
    expect(projection.signals.solvency.status).toBe('held');
    expect(projection.signals.commitment.status).toBe('held');
  });

  it('rejects contradictory or unsafe numeric state', () => {
    const input = healthyInput();
    expect(() => projectOperatorHealth({
      ...input,
      signer: {
        availability: 'unknown' as any,
      },
    })).toThrow(/signer availability is unsupported/i);

    expect(() => projectOperatorHealth({
      ...input,
      readQuorum: {
        ...input.readQuorum,
        fundsReleaseHeld: true,
      },
    })).toThrow(/state and hold disagree/i);

    expect(() => projectOperatorHealth({
      ...input,
      persistence: {
        status: 'available',
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 0,
        activeSettlementAttemptCount: 1,
        oldestActiveSettlementUpdatedAtMs: null,
      },
    })).toThrow(/count and oldest timestamp disagree/i);

    expect(() => projectOperatorHealth({
      ...input,
      commitment: {
        ...input.commitment,
        observedErgoHeight: Number.MAX_SAFE_INTEGER + 1,
      },
    })).toThrow(/safe integer/i);

    expect(() => projectOperatorHealth({
      ...input,
      solvency: {
        state: 'unknown' as any,
        observedAtMs: NOW - 1,
      },
    })).toThrow(/solvency state is unsupported/i);

    expect(() => projectOperatorHealth({
      ...input,
      commitment: {
        ...input.commitment,
        ready: 'yes' as any,
      },
    })).toThrow(/commitment ready state must be boolean/i);
  });
});
