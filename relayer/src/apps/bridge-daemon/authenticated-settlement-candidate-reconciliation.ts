import {
  createAuthenticatedSettlementCandidateJournalAdapter,
  type AuthenticatedSettlementCandidatePegOut,
  type AuthenticatedSettlementCandidateStateTracker,
} from '../../adapters/authenticated-settlement-candidate-journal.js';
import {
  createAuthenticatedSettlementCandidateObservationAdapter,
  type AuthenticatedSettlementCandidateErgoClient,
} from '../../adapters/authenticated-settlement-candidate-observation.js';
import {
  reconcileAuthenticatedSettlementCandidates,
  type AuthenticatedSettlementCandidateBurnStatus,
  type AuthenticatedSettlementCandidateReconciliationResult,
  type AuthenticatedSettlementCandidateReconciliationView,
  type AuthenticatedSettlementCandidateRevalidationCache,
  type AuthenticatedSettlementCandidateRevalidationView,
} from '../../relayer-core/authenticated-settlement-candidate-reconciliation.js';

export interface AuthenticatedSettlementCandidateReconciliationApplicationDeps<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  state: AuthenticatedSettlementCandidateStateTracker<Candidate>;
  ergo: AuthenticatedSettlementCandidateErgoClient;
  revalidations: AuthenticatedSettlementCandidateRevalidationCache<Revalidation>;
  observeBurn(
    pegOut: AuthenticatedSettlementCandidatePegOut,
  ): Promise<AuthenticatedSettlementCandidateBurnStatus>;
  recollect(
    candidate: Candidate,
    pegOut: AuthenticatedSettlementCandidatePegOut,
  ): Promise<Revalidation | null>;
  log?: (
    level: 'info' | 'warn',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export async function runAuthenticatedSettlementCandidateReconciliation<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  deps: AuthenticatedSettlementCandidateReconciliationApplicationDeps<
    Candidate,
    Revalidation
  >,
): Promise<AuthenticatedSettlementCandidateReconciliationResult> {
  const external = createAuthenticatedSettlementCandidateObservationAdapter({
    ergo: deps.ergo,
    observeBurn: deps.observeBurn,
    recollect: deps.recollect,
  });
  return reconcileAuthenticatedSettlementCandidates({
    journal: createAuthenticatedSettlementCandidateJournalAdapter(deps.state),
    observations: external.observations,
    revalidator: external.revalidator,
    revalidations: deps.revalidations,
    log: deps.log,
  });
}
