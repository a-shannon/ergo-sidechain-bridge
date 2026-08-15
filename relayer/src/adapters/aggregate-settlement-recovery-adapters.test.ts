import { describe, expect, it } from 'vitest';

import type {
  AggregateSettlementRecoveryAttemptView,
  AggregateSettlementRecoveryMutationResult,
} from '../relayer-core/aggregate-settlement-recovery.js';
import { createAggregateSettlementErgoObservationRecord } from './aggregate-settlement-ergo-finality-policy.js';
import {
  createAggregateSettlementErgoObservationRecord as createLegacyObservationRecord,
} from '../aggregate-settlement-ergo-finality-policy.js';
import {
  observeStableAggregateSettlementErgoTransaction as observeLegacyStableTransaction,
} from '../aggregate-settlement-ergo-observation.js';
import {
  canonicalNodeOrigin as legacyCanonicalNodeOrigin,
} from '../ergo-node-endpoint-alignment.js';
import {
  createAggregateSettlementErgoWitness,
  createAggregateSettlementRecoveryErgoAdapter,
} from './aggregate-settlement-recovery-ergo.js';
import {
  createAggregateSettlementRecoveryJournalAdapter,
  type AggregateSettlementRecoveryStateTracker,
} from './aggregate-settlement-recovery-journal.js';
import type {
  AggregateSettlementErgoObservationClient,
  StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';
import {
  observeStableAggregateSettlementErgoTransaction,
} from './aggregate-settlement-ergo-observation.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';

const TX_ID = '11'.repeat(32);
const TIP_ID = '22'.repeat(32);

function attempt(
  status: AggregateSettlementRecoveryAttemptView['status'],
): AggregateSettlementRecoveryAttemptView {
  return {
    mode: 'single',
    status,
    expectedTxId: TX_ID,
    submittedTxId: null,
    burnTxHashes: ['33'.repeat(32)],
    lifecycleVersion: 4,
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: 10,
    ergoObservation: null,
    recoveryQuarantine: null,
  };
}

function absentObservation(): StableAggregateSettlementErgoObservation {
  return {
    record: createAggregateSettlementErgoObservationRecord({
      policyVersion: 1,
      requiredConfirmations: 10,
      status: 'absent',
      transactionIdHex: TX_ID,
      transactionDigestHex: null,
      inclusionHeight: null,
      inclusionHeaderIdHex: null,
      observedTipHeight: 100,
      observedTipHeaderIdHex: TIP_ID,
      confirmations: 0,
    }),
    transaction: null,
  };
}

function mutationResult(): AggregateSettlementRecoveryMutationResult {
  return {
    applied: true,
    restoredBurns: 0,
    skippedBurns: 0,
    missingPegOuts: 0,
    rolledBackBurns: 0,
    rolledBackPreFinality: false,
  };
}

function absentErgo(reads: { count: number }): AggregateSettlementErgoObservationClient {
  return {
    getCurrentHeight: async () => {
      reads.count += 1;
      return 100;
    },
    getBlockHeaderHash: async () => {
      reads.count += 1;
      return TIP_ID;
    },
    getTransaction: async () => {
      reads.count += 1;
      return null;
    },
    hasUnconfirmedTransaction: async () => {
      reads.count += 1;
      return false;
    },
  };
}

describe('aggregate settlement recovery adapters', () => {
  it('preserves exact runtime identities through the legacy compatibility exports', () => {
    expect(createLegacyObservationRecord).toBe(createAggregateSettlementErgoObservationRecord);
    expect(observeLegacyStableTransaction).toBe(observeStableAggregateSettlementErgoTransaction);
    expect(legacyCanonicalNodeOrigin).toBe(canonicalNodeOrigin);
  });

  it('binds the Ergo observation port to one fixed primary client and witness pair', async () => {
    const primaryReads = { count: 0 };
    const otherReads = { count: 0 };
    const witnessReads = { count: 0 };
    const primary = absentErgo(primaryReads);
    const otherPrimary = absentErgo(otherReads);
    const witness = createAggregateSettlementErgoWitness({
      primaryErgo: primary,
      primaryNodeUrl: 'http://primary.example:9052',
      primaryNodeIdentityDigestHex: '41'.repeat(32),
      primaryAdministrationIdentityDigestHex: '42'.repeat(32),
      witnessErgo: absentErgo(witnessReads),
      witnessNodeUrl: 'http://witness.example:9052',
      witnessNodeIdentityDigestHex: '51'.repeat(32),
      witnessAdministrationIdentityDigestHex: '52'.repeat(32),
    });
    const adapter = createAggregateSettlementRecoveryErgoAdapter({
      ergo: otherPrimary,
      witness,
    });

    await expect(adapter.observe({
      transactionId: TX_ID,
      policy: { version: 1, requiredConfirmations: 10 },
    })).rejects.toThrow(/not bound to the active primary Ergo client/);
    expect(primaryReads.count).toBe(0);
    expect(otherReads.count).toBe(0);
    expect(witnessReads.count).toBe(0);
  });

  it('exposes only the exact recovery journal operations and clones ordered burns', () => {
    const recoverable = attempt('submitted');
    const confirmed = attempt('confirmed');
    let appliedBurns: string[] | undefined;
    const state: AggregateSettlementRecoveryStateTracker = {
      getRecoverableAggregateSettlementAttempts: () => [recoverable],
      applyAggregateSettlementRecoveryObservation: input => {
        appliedBurns = input.burnTxHashes;
        return mutationResult();
      },
      getConfirmedAggregateSettlementAttempts: () => [confirmed],
      recordConfirmedAggregateSettlementReorgObservation: () => true,
    };
    const adapter = createAggregateSettlementRecoveryJournalAdapter(state);
    const observation = absentObservation();
    const inputBurns = recoverable.burnTxHashes;

    expect(Object.keys(adapter).sort()).toEqual([
      'applyRecoverableObservation',
      'listConfirmedAttempts',
      'listRecoverableAttempts',
      'quarantineConfirmedAbsence',
    ]);
    expect(adapter.listRecoverableAttempts()).toEqual([recoverable]);
    expect(adapter.listConfirmedAttempts()).toEqual([confirmed]);
    expect(adapter.applyRecoverableObservation({
      expectedTxId: recoverable.expectedTxId,
      expectedLifecycleVersion: recoverable.lifecycleVersion,
      expectedStatus: 'submitted',
      expectedSubmittedTxId: null,
      mode: recoverable.mode,
      burnTxHashes: inputBurns,
      observation,
      consensus: null,
    })).toEqual(mutationResult());
    expect(appliedBurns).toEqual(inputBurns);
    expect(appliedBurns).not.toBe(inputBurns);
  });

  it('rejects impossible StateTracker list classifications at the adapter boundary', () => {
    const invalidRecoverable = createAggregateSettlementRecoveryJournalAdapter({
      getRecoverableAggregateSettlementAttempts: () => [attempt('confirmed')],
      applyAggregateSettlementRecoveryObservation: () => mutationResult(),
      getConfirmedAggregateSettlementAttempts: () => [],
      recordConfirmedAggregateSettlementReorgObservation: () => true,
    });
    expect(() => invalidRecoverable.listRecoverableAttempts()).toThrow(
      /non-recoverable status: confirmed/,
    );

    const invalidConfirmed = createAggregateSettlementRecoveryJournalAdapter({
      getRecoverableAggregateSettlementAttempts: () => [],
      applyAggregateSettlementRecoveryObservation: () => mutationResult(),
      getConfirmedAggregateSettlementAttempts: () => [attempt('submitted')],
      recordConfirmedAggregateSettlementReorgObservation: () => true,
    });
    expect(() => invalidConfirmed.listConfirmedAttempts()).toThrow(
      /non-confirmed status: submitted/,
    );
  });
});
