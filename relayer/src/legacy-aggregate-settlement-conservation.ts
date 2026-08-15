export const LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE =
  'Legacy aggregate settlement submission is disabled because the V1 transaction ' +
  'subtracts the miner fee from protected Ergo backing while only the net payout is ' +
  'burned on the sidechain, creating a deterministic miner-fee-sized deficit. New ' +
  'submission requires a reviewed and activated, separately versioned external-fee ' +
  'settlement profile plus retirement of the legacy route.';

export function rejectLegacyAggregateSettlementSubmission(): void {
  throw new Error(LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE);
}
