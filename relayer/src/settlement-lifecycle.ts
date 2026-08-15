export type SettlementLifecycleStatus =
  | 'unseen'
  | 'burn_observed'
  | 'proof_ready'
  | 'submitted'
  | 'mempool_seen'
  | 'fast_inclusion_seen'
  | 'ordering_confirmed'
  | 'finalized';

export interface SettlementLifecycleSignals {
  burnObservedMs?: number;
  proofReadyMs?: number;
  settlementSubmittedMs?: number;
  mempoolAcceptedMs?: number;
  fastInclusionSeenMs?: number;
  orderingBlockIncludedMs?: number;
  economicFinalityMs?: number;
}

export interface SettlementLifecycleClassification {
  status: SettlementLifecycleStatus;
  latestMs: number | null;
  hasFastSignal: boolean;
  isCanonicallyIncluded: boolean;
  isEconomicallyFinal: boolean;
}

type StatusStep = {
  status: SettlementLifecycleStatus;
  field?: keyof SettlementLifecycleSignals;
};

export const SETTLEMENT_LIFECYCLE_STEPS: readonly StatusStep[] = [
  { status: 'unseen' },
  { status: 'burn_observed', field: 'burnObservedMs' },
  { status: 'proof_ready', field: 'proofReadyMs' },
  { status: 'submitted', field: 'settlementSubmittedMs' },
  { status: 'mempool_seen', field: 'mempoolAcceptedMs' },
  { status: 'fast_inclusion_seen', field: 'fastInclusionSeenMs' },
  { status: 'ordering_confirmed', field: 'orderingBlockIncludedMs' },
  { status: 'finalized', field: 'economicFinalityMs' },
] as const;

export function classifySettlementLifecycle(
  signals: SettlementLifecycleSignals,
): SettlementLifecycleClassification {
  let status: SettlementLifecycleStatus = 'unseen';
  let latestMs: number | null = null;

  for (const step of SETTLEMENT_LIFECYCLE_STEPS) {
    if (!step.field) continue;
    const value = signals[step.field];
    if (typeof value === 'number') {
      status = step.status;
      latestMs = value;
    }
  }

  return {
    status,
    latestMs,
    hasFastSignal: typeof signals.fastInclusionSeenMs === 'number',
    isCanonicallyIncluded: typeof signals.orderingBlockIncludedMs === 'number',
    isEconomicallyFinal: typeof signals.economicFinalityMs === 'number',
  };
}

export function assertLifecycleSignalsMonotonic(signals: SettlementLifecycleSignals): void {
  let previousField: keyof SettlementLifecycleSignals | null = null;
  let previousValue: number | null = null;

  for (const step of SETTLEMENT_LIFECYCLE_STEPS) {
    if (!step.field) continue;
    const value = signals[step.field];
    if (typeof value !== 'number') continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${step.field} must be a finite non-negative timestamp`);
    }
    if (previousValue !== null && value < previousValue) {
      throw new Error(`${step.field} (${value}) is earlier than ${previousField} (${previousValue})`);
    }
    previousField = step.field;
    previousValue = value;
  }
}

