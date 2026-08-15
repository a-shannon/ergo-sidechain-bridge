import {
  createAggregateSettlementRecoveryErgoAdapter,
  type AggregateSettlementErgoWitness,
} from '../../adapters/aggregate-settlement-recovery-ergo.js';
import {
  createAggregateSettlementRecoveryJournalAdapter,
  type AggregateSettlementRecoveryStateTracker,
} from '../../adapters/aggregate-settlement-recovery-journal.js';
import type {
  AggregateSettlementErgoObservationClient,
  MatchingAggregateSettlementErgoObservationConsensus,
  StableAggregateSettlementErgoObservation,
} from '../../adapters/aggregate-settlement-ergo-observation.js';
import {
  recoverAggregateSettlementLifecycle,
  type AggregateSettlementRecoveryResult,
} from '../../relayer-core/aggregate-settlement-recovery.js';

export interface AggregateSettlementRecoveryApplicationDeps {
  state: AggregateSettlementRecoveryStateTracker;
  ergo: AggregateSettlementErgoObservationClient;
  witness?: AggregateSettlementErgoWitness;
  log?: (
    level: 'info' | 'warn',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export async function runAggregateSettlementRecovery(
  deps: AggregateSettlementRecoveryApplicationDeps,
): Promise<AggregateSettlementRecoveryResult> {
  return recoverAggregateSettlementLifecycle<
    StableAggregateSettlementErgoObservation,
    MatchingAggregateSettlementErgoObservationConsensus
  >({
    observations: createAggregateSettlementRecoveryErgoAdapter({
      ergo: deps.ergo,
      witness: deps.witness,
    }),
    journal: createAggregateSettlementRecoveryJournalAdapter(deps.state),
    log: deps.log,
  });
}
