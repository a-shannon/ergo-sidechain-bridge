import {
  createAuthenticatedV2PackageRecoveryJournalAdapter,
  type AuthenticatedV2PackageRecoveryState,
} from '../../adapters/authenticated-v2-package-recovery-journal.js';
import {
  createAuthenticatedV2PackageRecoveryReconstructionAdapter,
} from '../../adapters/authenticated-v2-package-recovery-reconstruction.js';
import {
  createAuthenticatedV2PackageRecoverySourceAdapter,
} from '../../adapters/authenticated-v2-package-recovery-source.js';
import {
  recoverAuthenticatedV2PreparedCandidateLifecycle,
  type AuthenticatedV2PreparedCandidateRecoveryAdmission,
  type AuthenticatedV2PreparedCandidateRecoveryDraft,
  type AuthenticatedV2PreparedCandidateRecoveryResult,
  type AuthenticatedV2RecoverySidechainConsensusView,
  type RecoveredAuthenticatedV2PreparedCandidateView,
} from '../../relayer-core/authenticated-v2-prepared-candidate-recovery.js';

export interface AuthenticatedV2PackageRecoveryApplicationDeps<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
> {
  state: AuthenticatedV2PackageRecoveryState<
    AuthenticatedV2PreparedCandidateRecoveryAdmission<
      Draft['candidate'],
      Draft['pegOut'],
      Draft['cacheRecovery'],
      Consensus
    >,
    Recovered
  >;
  reconstruct(input: Input): Promise<Draft>;
  observe(draft: Draft): Promise<Consensus>;
}

export async function runAuthenticatedV2PackageRecovery<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
>(
  input: Input,
  deps: AuthenticatedV2PackageRecoveryApplicationDeps<
    Input,
    Draft,
    Consensus,
    Recovered
  >,
): Promise<AuthenticatedV2PreparedCandidateRecoveryResult<Recovered>> {
  const reconstruction =
    createAuthenticatedV2PackageRecoveryReconstructionAdapter({
      reconstruct: deps.reconstruct,
    });
  return recoverAuthenticatedV2PreparedCandidateLifecycle(input, {
    reconstruction: reconstruction.reconstruction,
    sourceObservation: createAuthenticatedV2PackageRecoverySourceAdapter({
      observe: deps.observe,
    }),
    binding: reconstruction.binding,
    journal: createAuthenticatedV2PackageRecoveryJournalAdapter(deps.state),
  });
}
