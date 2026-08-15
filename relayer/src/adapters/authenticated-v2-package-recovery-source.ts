import type {
  AuthenticatedV2PreparedCandidateRecoveryDraft,
  AuthenticatedV2PreparedCandidateSourceObservationPort,
  AuthenticatedV2RecoverySidechainConsensusView,
} from '../relayer-core/authenticated-v2-prepared-candidate-recovery.js';

export interface AuthenticatedV2PackageRecoverySourceAdapterDeps<
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
> {
  observe(draft: Draft): Promise<Consensus>;
}

export function createAuthenticatedV2PackageRecoverySourceAdapter<
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
>(
  deps: AuthenticatedV2PackageRecoverySourceAdapterDeps<Draft, Consensus>,
): AuthenticatedV2PreparedCandidateSourceObservationPort<Draft, Consensus> {
  return Object.freeze({
    observe: (draft: Draft) => deps.observe(draft),
  });
}
