import { describe, expect, it } from 'vitest';

import {
  recoverAggregateSettlementLifecycle,
  type AggregateSettlementConfirmedAttemptView,
  type AggregateSettlementRecoverableAttemptView,
  type AggregateSettlementRecoveryJournalPort,
  type AggregateSettlementRecoveryMutationResult,
  type AggregateSettlementRecoveryObservationPort,
  type AggregateSettlementRecoveryObservationView,
} from './aggregate-settlement-recovery.js';

const TX_A = '11'.repeat(32);
const TX_B = '22'.repeat(32);
const TX_C = '33'.repeat(32);
const TX_D = '44'.repeat(32);
const BURN_A = 'a1'.repeat(32);
const BURN_B = 'b2'.repeat(32);

interface TestObservation extends AggregateSettlementRecoveryObservationView {
  record: {
    status:
      | 'absent'
      | 'mempool'
      | 'confirmed_pre_finality'
      | 'confirmed_final';
  };
}

interface TestConsensus {
  digestHex: string;
}

function recoverable(
  overrides: Partial<AggregateSettlementRecoverableAttemptView> = {},
): AggregateSettlementRecoverableAttemptView {
  return {
    mode: 'single',
    status: 'pending',
    expectedTxId: TX_A,
    submittedTxId: null,
    burnTxHashes: [BURN_A],
    lifecycleVersion: 0,
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: 10,
    ergoObservation: null,
    recoveryQuarantine: null,
    ...overrides,
  };
}

function confirmed(
  overrides: Partial<AggregateSettlementConfirmedAttemptView> = {},
): AggregateSettlementConfirmedAttemptView {
  return {
    ...recoverable(),
    status: 'confirmed',
    submittedTxId: TX_A,
    ergoObservation: { status: 'confirmed_final' },
    ...overrides,
  };
}

function observed(
  status: TestObservation['record']['status'],
  consensus: TestConsensus | null = null,
): { observation: TestObservation; consensus: TestConsensus | null } {
  return {
    observation: { record: { status } },
    consensus,
  };
}

function mutation(
  overrides: Partial<AggregateSettlementRecoveryMutationResult> = {},
): AggregateSettlementRecoveryMutationResult {
  return {
    applied: true,
    restoredBurns: 0,
    skippedBurns: 0,
    missingPegOuts: 0,
    rolledBackBurns: 0,
    rolledBackPreFinality: false,
    ...overrides,
  };
}

function testPorts(input: {
  recoverableAttempts?: readonly AggregateSettlementRecoverableAttemptView[];
  confirmedAttempts?: readonly AggregateSettlementConfirmedAttemptView[];
  observe?: AggregateSettlementRecoveryObservationPort<
    TestObservation,
    TestConsensus
  >['observe'];
  apply?: AggregateSettlementRecoveryJournalPort<
    TestObservation,
    TestConsensus
  >['applyRecoverableObservation'];
  quarantine?: AggregateSettlementRecoveryJournalPort<
    TestObservation,
    TestConsensus
  >['quarantineConfirmedAbsence'];
  events?: string[];
}) {
  const events = input.events ?? [];
  return {
    observations: {
      observe: input.observe ?? (async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        return observed('mempool');
      }),
    },
    journal: {
      listRecoverableAttempts: () => {
        events.push('list:recoverable');
        return input.recoverableAttempts ?? [];
      },
      applyRecoverableObservation: input.apply ?? (entry => {
        events.push(`apply:${entry.expectedTxId}`);
        return mutation();
      }),
      listConfirmedAttempts: () => {
        events.push('list:confirmed');
        return input.confirmedAttempts ?? [];
      },
      quarantineConfirmedAbsence: input.quarantine ?? (entry => {
        events.push(`quarantine:${entry.expectedTxId}`);
        return true;
      }),
    },
  };
}

describe('relayer-core aggregate settlement recovery ports', () => {
  it('treats an empty journal as a no-op after complete database loss', async () => {
    const events: string[] = [];

    await expect(recoverAggregateSettlementLifecycle(testPorts({ events })))
      .resolves.toEqual({
        restoredBurns: 0,
        deferredAttempts: 0,
        missingPegOuts: 0,
        skippedBurns: 0,
        rolledBackAttempts: 0,
        rolledBackBurns: 0,
        quarantinedConfirmedAttempts: 0,
      });
    expect(events).toEqual(['list:recoverable', 'list:confirmed']);
  });

  it('finishes every recoverable observation before the first mutation', async () => {
    const events: string[] = [];
    const attempts = [
      recoverable({ expectedTxId: TX_A }),
      recoverable({ expectedTxId: TX_B }),
    ];

    await expect(recoverAggregateSettlementLifecycle(testPorts({
      events,
      recoverableAttempts: attempts,
      observe: async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        if (transactionId === TX_B) throw new Error('Ergo sources disagree');
        return observed('mempool');
      },
      apply: entry => {
        events.push(`apply:${entry.expectedTxId}`);
        return mutation();
      },
    }))).rejects.toThrow(/sources disagree/);

    expect(events).toEqual([
      'list:recoverable',
      `observe:${TX_A}`,
      `observe:${TX_B}`,
    ]);
  });

  it('defers legacy policy and stale ordered-burn CAS without inventing authority', async () => {
    const events: string[] = [];
    const logs: string[] = [];
    const legacy = recoverable({
      expectedTxId: TX_A,
      recoveryBindingStatus: 'legacy_unbound',
      recoveryPolicyVersion: null,
      recoveryRequiredConfirmations: null,
    });
    const current = recoverable({
      expectedTxId: `0x${TX_B.toUpperCase()}`,
      submittedTxId: TX_B.toUpperCase(),
      mode: 'batch',
      burnTxHashes: [BURN_B, BURN_A],
      lifecycleVersion: 7,
    });

    const result = await recoverAggregateSettlementLifecycle({
      ...testPorts({
        events,
        recoverableAttempts: [legacy, current],
        observe: async ({ transactionId, policy }) => {
          events.push(`observe:${transactionId}:${policy.requiredConfirmations}`);
          return observed('mempool');
        },
        apply: entry => {
          events.push(`apply:${entry.burnTxHashes.join(',')}`);
          expect(entry).toMatchObject({
            expectedTxId: current.expectedTxId,
            expectedLifecycleVersion: 7,
            expectedStatus: 'pending',
            expectedSubmittedTxId: current.submittedTxId,
            mode: 'batch',
            burnTxHashes: [BURN_B, BURN_A],
          });
          return mutation({ applied: false });
        },
      }),
      log: (_level, message) => logs.push(message),
    });

    expect(result.deferredAttempts).toBe(2);
    expect(events).toEqual([
      'list:recoverable',
      `observe:${TX_B}:10`,
      `apply:${BURN_B},${BURN_A}`,
      'list:confirmed',
    ]);
    expect(logs).toEqual([
      'Legacy aggregate settlement attempt has no versioned Ergo recovery policy',
      'Aggregate settlement recovery reducer rejected stale or incomplete local state',
    ]);
  });

  it('defers a pre-finality disappearance without witness consensus', async () => {
    const events: string[] = [];
    const attempt = recoverable({
      submittedTxId: TX_A,
      status: 'submitted',
      ergoObservation: { status: 'confirmed_pre_finality' },
    });

    const result = await recoverAggregateSettlementLifecycle(testPorts({
      events,
      recoverableAttempts: [attempt],
      observe: async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        return observed('absent');
      },
      apply: entry => {
        events.push(`apply:${entry.expectedTxId}`);
        return mutation();
      },
    }));

    expect(result.deferredAttempts).toBe(1);
    expect(events).toEqual([
      'list:recoverable',
      `observe:${TX_A}`,
      'list:confirmed',
    ]);
  });

  it('passes exact witness evidence to one atomic pre-finality rollback', async () => {
    const events: string[] = [];
    const consensus = { digestHex: 'cc'.repeat(32) };
    const attempt = recoverable({
      mode: 'batch',
      status: 'submitted',
      submittedTxId: TX_A,
      burnTxHashes: [BURN_A, BURN_B],
      lifecycleVersion: 9,
      ergoObservation: { status: 'confirmed_pre_finality' },
    });

    const result = await recoverAggregateSettlementLifecycle(testPorts({
      events,
      recoverableAttempts: [attempt],
      observe: async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        return observed('absent', consensus);
      },
      apply: entry => {
        events.push(`apply:${entry.expectedTxId}`);
        expect(entry.consensus).toBe(consensus);
        expect(entry).toMatchObject({
          expectedLifecycleVersion: 9,
          expectedStatus: 'submitted',
          expectedSubmittedTxId: TX_A,
          mode: 'batch',
          burnTxHashes: [BURN_A, BURN_B],
        });
        return mutation({
          rolledBackBurns: 2,
          rolledBackPreFinality: true,
        });
      },
    }));

    expect(result).toMatchObject({
      deferredAttempts: 1,
      rolledBackAttempts: 1,
      rolledBackBurns: 2,
    });
    expect(events).toEqual([
      'list:recoverable',
      `observe:${TX_A}`,
      `apply:${TX_A}`,
      'list:confirmed',
    ]);
  });

  it('keeps confirmed disappearance fail-closed across replay and stale CAS', async () => {
    const events: string[] = [];
    const consensus = { digestHex: 'dd'.repeat(32) };
    const attempts = [
      confirmed({
        expectedTxId: TX_A,
        submittedTxId: TX_A,
        recoveryQuarantine: { already: true },
      }),
      confirmed({ expectedTxId: TX_B, submittedTxId: TX_B }),
      confirmed({ expectedTxId: TX_C, submittedTxId: TX_C }),
      confirmed({ expectedTxId: TX_D, submittedTxId: TX_D }),
    ];

    const result = await recoverAggregateSettlementLifecycle(testPorts({
      events,
      confirmedAttempts: attempts,
      observe: async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        if (transactionId === TX_B) return observed('absent');
        return observed('absent', consensus);
      },
      quarantine: entry => {
        events.push(`quarantine:${entry.expectedTxId}`);
        expect(entry.consensus).toBe(consensus);
        return entry.expectedTxId === TX_C;
      },
    }));

    expect(result).toMatchObject({
      deferredAttempts: 2,
      quarantinedConfirmedAttempts: 1,
    });
    expect(events).toEqual([
      'list:recoverable',
      'list:confirmed',
      `observe:${TX_B}`,
      `observe:${TX_C}`,
      `quarantine:${TX_C}`,
      `observe:${TX_D}`,
      `quarantine:${TX_D}`,
    ]);
  });

  it('lists confirmed work only after recoverable writes complete', async () => {
    const events: string[] = [];

    const result = await recoverAggregateSettlementLifecycle(testPorts({
      events,
      recoverableAttempts: [recoverable({ expectedTxId: TX_A })],
      confirmedAttempts: [confirmed({ expectedTxId: TX_B, submittedTxId: TX_B })],
      observe: async ({ transactionId }) => {
        events.push(`observe:${transactionId}`);
        return observed('mempool');
      },
      apply: entry => {
        events.push(`apply:${entry.expectedTxId}`);
        return mutation({ restoredBurns: 1 });
      },
    }));

    expect(result.restoredBurns).toBe(1);
    expect(events).toEqual([
      'list:recoverable',
      `observe:${TX_A}`,
      `apply:${TX_A}`,
      'list:confirmed',
      `observe:${TX_B}`,
    ]);
  });
});
