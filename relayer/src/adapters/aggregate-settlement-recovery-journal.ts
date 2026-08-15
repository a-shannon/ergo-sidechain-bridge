import type {
  AggregateSettlementConfirmedAttemptView,
  AggregateSettlementRecoverableAttemptView,
  AggregateSettlementRecoveryAttemptView,
  AggregateSettlementRecoveryJournalPort,
  AggregateSettlementRecoveryMutationResult,
} from '../relayer-core/aggregate-settlement-recovery.js';
import type {
  MatchingAggregateSettlementErgoObservationConsensus,
  StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';

type RecoveryJournalPort = AggregateSettlementRecoveryJournalPort<
  StableAggregateSettlementErgoObservation,
  MatchingAggregateSettlementErgoObservationConsensus
>;

type ApplyRecoveryObservationInput =
  Parameters<RecoveryJournalPort['applyRecoverableObservation']>[0];
type QuarantineConfirmedAbsenceInput =
  Parameters<RecoveryJournalPort['quarantineConfirmedAbsence']>[0];

export interface AggregateSettlementRecoveryStateTracker {
  getRecoverableAggregateSettlementAttempts():
    readonly AggregateSettlementRecoveryAttemptView[];
  applyAggregateSettlementRecoveryObservation(
    input: Omit<ApplyRecoveryObservationInput, 'burnTxHashes'> & {
      burnTxHashes: string[];
    },
  ): AggregateSettlementRecoveryMutationResult;
  getConfirmedAggregateSettlementAttempts():
    readonly AggregateSettlementRecoveryAttemptView[];
  recordConfirmedAggregateSettlementReorgObservation(
    input: QuarantineConfirmedAbsenceInput,
  ): boolean;
}

function asRecoverableAttempt(
  attempt: AggregateSettlementRecoveryAttemptView,
): AggregateSettlementRecoverableAttemptView {
  if (attempt.status !== 'pending' && attempt.status !== 'submitted') {
    throw new Error(
      `aggregate settlement recovery journal returned non-recoverable status: ${attempt.status}`,
    );
  }
  return attempt as AggregateSettlementRecoverableAttemptView;
}

function asConfirmedAttempt(
  attempt: AggregateSettlementRecoveryAttemptView,
): AggregateSettlementConfirmedAttemptView {
  if (attempt.status !== 'confirmed') {
    throw new Error(
      `aggregate settlement recovery journal returned non-confirmed status: ${attempt.status}`,
    );
  }
  return attempt as AggregateSettlementConfirmedAttemptView;
}

export function createAggregateSettlementRecoveryJournalAdapter(
  state: AggregateSettlementRecoveryStateTracker,
): RecoveryJournalPort {
  return Object.freeze({
    listRecoverableAttempts: () =>
      state.getRecoverableAggregateSettlementAttempts().map(asRecoverableAttempt),
    applyRecoverableObservation: (input: ApplyRecoveryObservationInput) =>
      state.applyAggregateSettlementRecoveryObservation({
        ...input,
        burnTxHashes: [...input.burnTxHashes],
      }),
    listConfirmedAttempts: () =>
      state.getConfirmedAggregateSettlementAttempts().map(asConfirmedAttempt),
    quarantineConfirmedAbsence: (input: QuarantineConfirmedAbsenceInput) =>
      state.recordConfirmedAggregateSettlementReorgObservation(input),
  });
}
