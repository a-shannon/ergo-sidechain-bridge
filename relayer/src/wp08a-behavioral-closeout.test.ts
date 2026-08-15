import { describe, expect, it } from 'vitest';

import {
  createMatchingAggregateSettlementErgoObservationSources,
  type AggregateSettlementErgoObservationClient,
} from './adapters/aggregate-settlement-ergo-observation.js';
import type {
  AggregateSettlementRecoveryStateTracker,
} from './adapters/aggregate-settlement-recovery-journal.js';
import type {
  AuthenticatedSettlementCandidateStateTracker,
} from './adapters/authenticated-settlement-candidate-journal.js';
import type {
  AuthenticatedV2PackageRecoveryState,
} from './adapters/authenticated-v2-package-recovery-journal.js';
import {
  runAggregateSettlementRecovery,
} from './apps/bridge-daemon/aggregate-settlement-recovery.js';
import {
  runAuthenticatedSettlementCandidateReconciliation,
} from './apps/bridge-daemon/authenticated-settlement-candidate-reconciliation.js';
import {
  runAuthenticatedV2PackageRecovery,
} from './apps/bridge-daemon/authenticated-v2-package-recovery.js';
import {
  createAuthenticatedSettlementRestartCompatibilityDeps,
  reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility,
} from './authenticated-settlement-reserved-execution-compatibility.js';
import type {
  AggregateSettlementRecoveryAttemptView,
  AggregateSettlementRecoveryMutationResult,
} from './relayer-core/aggregate-settlement-recovery.js';
import type {
  AuthenticatedSettlementCandidateReconciliationView,
} from './relayer-core/authenticated-settlement-candidate-reconciliation.js';
import type {
  AuthenticatedV2PreparedCandidateRecoveryAdmission,
  AuthenticatedV2PreparedCandidateRecoveryDraft,
  AuthenticatedV2RecoverySidechainConsensusView,
  RecoveredAuthenticatedV2PreparedCandidateView,
} from './relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import type {
  AuthenticatedSettlementSubmissionAttempt,
  StateTracker,
} from './state-tracker.js';

const hex = (byte: string) => byte.repeat(32);

const TX_ID = hex('11');
const BURN_ID = hex('12');
const TIP_ID = hex('13');

function absentErgoClient(mempool = false): AggregateSettlementErgoObservationClient {
  return {
    getCurrentHeight: async () => 120,
    getBlockHeaderHash: async () => TIP_ID,
    getTransaction: async () => null,
    hasUnconfirmedTransaction: async () => mempool,
  };
}

function matchingErgoSources(input: { primaryMempool?: boolean; witnessMempool?: boolean } = {}) {
  return createMatchingAggregateSettlementErgoObservationSources({
    primaryErgo: absentErgoClient(input.primaryMempool ?? false),
    primaryNodeUrl: 'http://127.0.0.1:9052',
    primaryNodeIdentityDigestHex: hex('21'),
    primaryAdministrationIdentityDigestHex: hex('22'),
    witnessErgo: absentErgoClient(input.witnessMempool ?? false),
    witnessNodeUrl: 'http://127.0.0.1:9152',
    witnessNodeIdentityDigestHex: hex('23'),
    witnessAdministrationIdentityDigestHex: hex('24'),
  });
}

function recoveryAttempt(
  status: 'submitted' | 'confirmed',
): AggregateSettlementRecoveryAttemptView {
  return {
    mode: 'single',
    status,
    expectedTxId: TX_ID,
    submittedTxId: TX_ID,
    burnTxHashes: [BURN_ID],
    lifecycleVersion: 3,
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: 10,
    ergoObservation: { status: 'confirmed_pre_finality' },
    recoveryQuarantine: null,
  };
}

function appliedRollback(): AggregateSettlementRecoveryMutationResult {
  return {
    applied: true,
    restoredBurns: 0,
    skippedBurns: 0,
    missingPegOuts: 0,
    rolledBackBurns: 1,
    rolledBackPreFinality: true,
  };
}

const CANDIDATE = Object.freeze({
  candidateId: hex('31'),
  burnId: hex('32'),
  anchorHeaderHeight: 100,
  anchorHeaderId: hex('33'),
  trackerBoxId: hex('34'),
  dupInputBoxId: hex('35'),
  vaultBoxId: hex('36'),
}) satisfies AuthenticatedSettlementCandidateReconciliationView;

function pegOutRow() {
  return {
    user: '0xuser',
    amountNanoErg: '1000000',
    ergoRecipientAddress: '9recipient',
    sidechainBurnTxHash: CANDIDATE.burnId,
    sidechainBurnHeight: 90,
    sidechainBlockHash: hex('37'),
    sidechainLogIndex: 1,
  };
}

function recoveryDraft(): AuthenticatedV2PreparedCandidateRecoveryDraft {
  return {
    candidate: {
      schemaVersion: 2,
      candidateId: hex('41'),
      burnId: hex('42'),
      burnTxHash: hex('43'),
      sidechainId: hex('44'),
      sidechainHeight: 15n,
      sidechainBlockHash: hex('45'),
      sidechainLogIndex: 1,
      trackerKey: hex('46'),
      trackerValue: hex('47'),
      trackerBoxId: hex('48'),
      anchorHeaderId: hex('49'),
      anchorHeaderHeight: 80,
      dupInputBoxId: hex('4a'),
      dupInputDigest: '4b'.repeat(33),
      vaultBoxId: hex('4c'),
      unsignedTxDigest: hex('4d'),
      creationHeight: 90,
      observedSidechainTip: 25n,
      observedErgoTip: 90,
    },
    pegOut: {
      user: '0xuser',
      amount: 1_000_000n,
      ergoRecipientAddress: `0008cd02${'4e'.repeat(32)}`,
      sidechainTxHash: hex('43'),
      sidechainBlockNumber: 15,
      sidechainBlockHash: hex('45'),
      sidechainLogIndex: 1,
    },
    cacheRecovery: {
      schema: 'e2s.authenticated-v2-cache-recovery.v1',
      observedTip: {
        idHex: hex('4f'),
        parentIdHex: hex('50'),
        height: 90,
        extensionRootHex: hex('51'),
      },
      reconstructionDigests: {
        tracker: hex('52'),
        duplicatePrevention: hex('53'),
        vault: hex('54'),
      },
      currentInputs: {
        trackerBoxIdHex: hex('48'),
        duplicatePreventionBoxIdHex: hex('4a'),
        vaultBoxIdsHex: [hex('4c')],
      },
    },
    packageDigestHex: hex('55'),
    expectedTxId: hex('56'),
    cacheRecoveryDigestHex: hex('57'),
  };
}

function mismatchedConsensus(
  draft: AuthenticatedV2PreparedCandidateRecoveryDraft,
): AuthenticatedV2RecoverySidechainConsensusView {
  return {
    view: {
      candidateId: draft.candidate.candidateId,
      burnIdHex: draft.candidate.burnId,
      sidechainIdHex: draft.candidate.sidechainId,
      sidechainTxHashHex: draft.candidate.burnTxHash,
      sidechainHeight: draft.candidate.sidechainHeight,
      executionBlockHashHex: draft.candidate.sidechainBlockHash,
      eventIndex: draft.candidate.sidechainLogIndex,
      amountNanoErg: draft.pegOut.amount,
      recipientErgoTreeHex: draft.pegOut.ergoRecipientAddress,
      observedTipHeight: draft.candidate.observedSidechainTip + 1n,
      observedTipHashHex: hex('58'),
      confirmations: 11n,
      requiredConfirmations: 10n,
    },
    sourceCount: 2,
    consensusDigestHex: hex('59'),
  };
}

function durableAttempt(): AuthenticatedSettlementSubmissionAttempt {
  return {
    schema: 'e2s.authenticated-settlement-transport-attempt.v1',
    lifecycleVersion: 1,
    executionReservationDigestHex: hex('61'),
    transportReservationDigestHex: hex('62'),
    durableAttemptDigestHex: hex('63'),
    candidateId: hex('64'),
    expectedTxId: hex('65'),
    unsignedTxDigestHex: hex('66'),
    unsignedPackageDigestHex: hex('67'),
    payoutDigestHex: hex('68'),
    trackerBoxId: hex('69'),
    duplicatePreventionBoxId: hex('6a'),
    signedTransactionDigestHex: hex('6b'),
    preSubmitRevalidationDigestHex: hex('6c'),
    broadcastAuthorizationDigestHex: hex('6d'),
    status: 'submitted',
    submissionAttempted: true,
    submissionDisposition: 'accepted',
    submittedTxId: hex('65'),
    responseDigestHex: hex('6e'),
    ergoObservation: null,
    ergoObservationSourceCount: 0,
    ergoObservationConsensusDigestHex: null,
    quarantineReason: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    submissionFinalizedAt: '2026-07-29T00:00:01.000Z',
    confirmedAt: null,
    updatedAt: '2026-07-29T00:00:01.000Z',
  };
}

describe('WP-08A behavioral closeout through public ports', () => {
  it('replays pre-finality rollback and confirmed reorg quarantine through aggregate recovery composition', async () => {
    const applied: unknown[] = [];
    const quarantined: unknown[] = [];
    const state: AggregateSettlementRecoveryStateTracker = {
      getRecoverableAggregateSettlementAttempts: () => [recoveryAttempt('submitted')],
      applyAggregateSettlementRecoveryObservation: input => {
        applied.push(input);
        return appliedRollback();
      },
      getConfirmedAggregateSettlementAttempts: () => [recoveryAttempt('confirmed')],
      recordConfirmedAggregateSettlementReorgObservation: input => {
        quarantined.push(input);
        return true;
      },
    };
    const sources = matchingErgoSources();

    const result = await runAggregateSettlementRecovery({
      state,
      ergo: sources.primarySource.ergo,
      witness: sources,
    });

    expect(result).toMatchObject({
      rolledBackAttempts: 1,
      rolledBackBurns: 1,
      quarantinedConfirmedAttempts: 1,
      deferredAttempts: 1,
    });
    expect(applied).toHaveLength(1);
    expect(quarantined).toHaveLength(1);
  });

  it('preserves burn-reorg, source-outage, and stale-input outcomes through candidate reconciliation composition', async () => {
    const reorgEvents: string[] = [];
    const reorgResult = await runAuthenticatedSettlementCandidateReconciliation({
      state: {
        getActiveAuthenticatedSettlementCandidates: () => [CANDIDATE],
        getPegOutByBurnId: () => pegOutRow(),
        invalidateAuthenticatedSettlementCandidate: () => reorgEvents.push('invalidate'),
        markPegOutBurnRevertedAndInvalidateCandidates: () => reorgEvents.push('revert'),
      } satisfies AuthenticatedSettlementCandidateStateTracker<typeof CANDIDATE>,
      ergo: {
        getBlockHeaderHash: async () => {
          throw new Error('reverted burn must not inspect Ergo inputs');
        },
        getBoxByIdOrNull: async () => {
          throw new Error('reverted burn must not inspect Ergo inputs');
        },
      },
      revalidations: new Map(),
      observeBurn: async () => 'reverted',
      recollect: async () => {
        throw new Error('reverted burn must not recollect');
      },
    });
    expect(reorgResult).toMatchObject({ revertedBurns: 1, invalidatedCandidates: 0 });
    expect(reorgEvents).toEqual(['revert']);

    const outageEvents: string[] = [];
    const outageResult = await runAuthenticatedSettlementCandidateReconciliation({
      state: {
        getActiveAuthenticatedSettlementCandidates: () => [CANDIDATE],
        getPegOutByBurnId: () => pegOutRow(),
        invalidateAuthenticatedSettlementCandidate: () => outageEvents.push('invalidate'),
        markPegOutBurnRevertedAndInvalidateCandidates: () => outageEvents.push('revert'),
      } satisfies AuthenticatedSettlementCandidateStateTracker<typeof CANDIDATE>,
      ergo: {
        getBlockHeaderHash: async () => {
          throw new Error('source unavailable');
        },
        getBoxByIdOrNull: async () => ({ present: true }),
      },
      revalidations: new Map([[CANDIDATE.candidateId, { expectedTxId: TX_ID, revalidationDigestHex: hex('71') }]]),
      observeBurn: async () => 'confirmed',
      recollect: async () => {
        throw new Error('outage must not recollect');
      },
    });
    expect(outageResult).toMatchObject({ deferredCandidates: 1, invalidatedCandidates: 0 });
    expect(outageEvents).toEqual([]);

    const staleEvents: string[] = [];
    const staleResult = await runAuthenticatedSettlementCandidateReconciliation({
      state: {
        getActiveAuthenticatedSettlementCandidates: () => [CANDIDATE],
        getPegOutByBurnId: () => pegOutRow(),
        invalidateAuthenticatedSettlementCandidate: () => staleEvents.push('invalidate'),
        markPegOutBurnRevertedAndInvalidateCandidates: () => staleEvents.push('revert'),
      } satisfies AuthenticatedSettlementCandidateStateTracker<typeof CANDIDATE>,
      ergo: {
        getBlockHeaderHash: async () => CANDIDATE.anchorHeaderId,
        getBoxByIdOrNull: async boxId => boxId === CANDIDATE.trackerBoxId ? null : { present: true },
      },
      revalidations: new Map(),
      observeBurn: async () => 'confirmed',
      recollect: async () => {
        throw new Error('stale inputs must not recollect');
      },
    });
    expect(staleResult).toMatchObject({ invalidatedCandidates: 1, refreshedRevalidations: 0 });
    expect(staleEvents).toEqual(['invalidate']);
  });

  it('rejects an out-of-order prepared-package view before the public journal adapter writes', async () => {
    const draft = recoveryDraft();
    let writes = 0;
    const state: AuthenticatedV2PackageRecoveryState<
      AuthenticatedV2PreparedCandidateRecoveryAdmission,
      RecoveredAuthenticatedV2PreparedCandidateView
    > = {
      recordRecoveredAuthenticatedSettlementCandidate: () => {
        writes += 1;
        throw new Error('out-of-order consensus must not reach the journal');
      },
    };

    await expect(runAuthenticatedV2PackageRecovery(
      { packageId: 'closed-over-test-package' },
      {
        state,
        reconstruct: async () => draft,
        observe: async value => mismatchedConsensus(value),
      },
    )).rejects.toThrow(/candidate tip does not match.*freshly observed/i);
    expect(writes).toBe(0);
  });

  it('keeps restart disagreement observation-only and restores no submission authority', async () => {
    const attempt = durableAttempt();
    let observationWrites = 0;
    const state = {
      getAuthenticatedSettlementCandidate: () => {
        throw new Error('restart disagreement must not load a candidate');
      },
      getAuthenticatedSettlementExecutionReservation: () => {
        throw new Error('restart disagreement must not load a reservation');
      },
      getPegOutByBurnId: () => {
        throw new Error('restart disagreement must not load a peg-out');
      },
      getAuthenticatedSettlementSubmissionAttempt: () => attempt,
      reserveAuthenticatedSettlementTransportAttempt: () => {
        throw new Error('restart must not reserve transport');
      },
      finalizeAuthenticatedSettlementSubmissionAttempt: () => {
        throw new Error('restart must not finalize submission');
      },
      recordAuthenticatedSettlementSubmissionObservation: () => {
        observationWrites += 1;
        throw new Error('disagreement must not write an observation');
      },
      getObservableAuthenticatedSettlementSubmissionAttempts: () => [attempt],
    } satisfies Pick<
      StateTracker,
      | 'getAuthenticatedSettlementCandidate'
      | 'getAuthenticatedSettlementExecutionReservation'
      | 'getPegOutByBurnId'
      | 'getAuthenticatedSettlementSubmissionAttempt'
      | 'reserveAuthenticatedSettlementTransportAttempt'
      | 'finalizeAuthenticatedSettlementSubmissionAttempt'
      | 'recordAuthenticatedSettlementSubmissionObservation'
      | 'getObservableAuthenticatedSettlementSubmissionAttempts'
    >;

    const outcomes = await reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility(
      createAuthenticatedSettlementRestartCompatibilityDeps({
        state,
        confirmationSources: matchingErgoSources({
          primaryMempool: false,
          witnessMempool: true,
        }),
      }),
    );

    expect(outcomes).toEqual([
      expect.objectContaining({
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        status: 'failed',
        result: null,
        failureCode: 'reconciliation_failed',
      }),
    ]);
    expect(observationWrites).toBe(0);
  });
});
