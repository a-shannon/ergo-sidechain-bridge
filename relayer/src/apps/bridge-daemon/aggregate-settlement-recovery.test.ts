import { describe, expect, it } from 'vitest';

import type {
  AggregateSettlementRecoveryAttemptView,
  AggregateSettlementRecoveryMutationResult,
} from '../../relayer-core/aggregate-settlement-recovery.js';
import type {
  AggregateSettlementRecoveryStateTracker,
} from '../../adapters/aggregate-settlement-recovery-journal.js';
import { runAggregateSettlementRecovery } from './aggregate-settlement-recovery.js';

const TX_ID = '11'.repeat(32);
const BURN_ID = '33'.repeat(32);
const TIP_ID = '44'.repeat(32);

function pendingAttempt(): AggregateSettlementRecoveryAttemptView {
  return {
    mode: 'single',
    status: 'pending',
    expectedTxId: TX_ID,
    submittedTxId: null,
    burnTxHashes: [BURN_ID],
    lifecycleVersion: 2,
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: 10,
    ergoObservation: null,
    recoveryQuarantine: null,
  };
}

function appliedMutation(): AggregateSettlementRecoveryMutationResult {
  return {
    applied: true,
    restoredBurns: 0,
    skippedBurns: 0,
    missingPegOuts: 0,
    rolledBackBurns: 0,
    rolledBackPreFinality: false,
  };
}

describe('bridge-daemon aggregate recovery composition', () => {
  it('assembles the fixed Ergo and journal adapters without a funds capability', async () => {
    const attempt = pendingAttempt();
    let appliedInput: Parameters<
      AggregateSettlementRecoveryStateTracker[
        'applyAggregateSettlementRecoveryObservation'
      ]
    >[0] | undefined;
    const state: AggregateSettlementRecoveryStateTracker = {
      getRecoverableAggregateSettlementAttempts: () => [attempt],
      applyAggregateSettlementRecoveryObservation: input => {
        appliedInput = input;
        return appliedMutation();
      },
      getConfirmedAggregateSettlementAttempts: () => [],
      recordConfirmedAggregateSettlementReorgObservation: () => {
        throw new Error('confirmed quarantine must not be invoked');
      },
    };
    const ergo = {
      getCurrentHeight: async () => 100,
      getBlockHeaderHash: async () => TIP_ID,
      getTransaction: async () => null,
      hasUnconfirmedTransaction: async () => false,
    };

    await expect(runAggregateSettlementRecovery({ state, ergo })).resolves.toEqual({
      restoredBurns: 0,
      deferredAttempts: 1,
      missingPegOuts: 0,
      skippedBurns: 0,
      rolledBackAttempts: 0,
      rolledBackBurns: 0,
      quarantinedConfirmedAttempts: 0,
    });
    expect(appliedInput?.observation.record.status).toBe('absent');
    expect(appliedInput).toMatchObject({
      expectedTxId: TX_ID,
      expectedLifecycleVersion: 2,
      expectedStatus: 'pending',
      expectedSubmittedTxId: null,
      mode: 'single',
      consensus: null,
    });
    expect(appliedInput?.burnTxHashes).toEqual([BURN_ID]);
    expect(appliedInput?.burnTxHashes).not.toBe(attempt.burnTxHashes);
  });

  it('does not touch the Ergo adapter after complete journal loss', async () => {
    let ergoReads = 0;
    const result = await runAggregateSettlementRecovery({
      state: {
        getRecoverableAggregateSettlementAttempts: () => [],
        applyAggregateSettlementRecoveryObservation: () => {
          throw new Error('empty journal must not mutate');
        },
        getConfirmedAggregateSettlementAttempts: () => [],
        recordConfirmedAggregateSettlementReorgObservation: () => {
          throw new Error('empty journal must not quarantine');
        },
      },
      ergo: {
        getCurrentHeight: async () => {
          ergoReads += 1;
          return 100;
        },
        getBlockHeaderHash: async () => {
          ergoReads += 1;
          return TIP_ID;
        },
        getTransaction: async () => {
          ergoReads += 1;
          return null;
        },
        hasUnconfirmedTransaction: async () => {
          ergoReads += 1;
          return false;
        },
      },
    });

    expect(result).toEqual({
      restoredBurns: 0,
      deferredAttempts: 0,
      missingPegOuts: 0,
      skippedBurns: 0,
      rolledBackAttempts: 0,
      rolledBackBurns: 0,
      quarantinedConfirmedAttempts: 0,
    });
    expect(ergoReads).toBe(0);
  });
});
