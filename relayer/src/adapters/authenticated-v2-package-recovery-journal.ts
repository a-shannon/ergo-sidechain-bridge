import type {
  AuthenticatedV2PreparedCandidateRecoveryAdmission,
  AuthenticatedV2PreparedCandidateRecoveryJournalPort,
  RecoveredAuthenticatedV2PreparedCandidateView,
} from '../relayer-core/authenticated-v2-prepared-candidate-recovery.js';

export interface AuthenticatedV2PackageRecoveryState<
  Admission extends AuthenticatedV2PreparedCandidateRecoveryAdmission,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
> {
  recordRecoveredAuthenticatedSettlementCandidate(
    admission: Admission,
  ): Recovered;
}

export function createAuthenticatedV2PackageRecoveryJournalAdapter<
  Admission extends AuthenticatedV2PreparedCandidateRecoveryAdmission,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
>(
  state: AuthenticatedV2PackageRecoveryState<Admission, Recovered>,
): AuthenticatedV2PreparedCandidateRecoveryJournalPort<Admission, Recovered> {
  return Object.freeze({
    record: (admission: Admission) =>
      state.recordRecoveredAuthenticatedSettlementCandidate(admission),
  });
}
