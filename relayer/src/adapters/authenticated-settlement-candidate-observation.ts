import type {
  AuthenticatedSettlementCandidateBurnStatus,
  AuthenticatedSettlementCandidateObservationPort,
  AuthenticatedSettlementCandidateReconciliationView,
  AuthenticatedSettlementCandidateRevalidationPort,
  AuthenticatedSettlementCandidateRevalidationView,
} from '../relayer-core/authenticated-settlement-candidate-reconciliation.js';

export interface AuthenticatedSettlementCandidateErgoClient {
  getBlockHeaderHash(height: number): Promise<string>;
  getBoxByIdOrNull(boxId: string): Promise<unknown>;
}

export interface AuthenticatedSettlementCandidateObservationAdapterDeps<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  ergo: AuthenticatedSettlementCandidateErgoClient;
  observeBurn(pegOut: PegOut): Promise<AuthenticatedSettlementCandidateBurnStatus>;
  recollect(
    candidate: Candidate,
    pegOut: PegOut,
  ): Promise<Revalidation | null>;
}

export interface AuthenticatedSettlementCandidateExternalPorts<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  observations: AuthenticatedSettlementCandidateObservationPort<Candidate, PegOut>;
  revalidator: AuthenticatedSettlementCandidateRevalidationPort<
    Candidate,
    PegOut,
    Revalidation
  >;
}

export function createAuthenticatedSettlementCandidateObservationAdapter<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  deps: AuthenticatedSettlementCandidateObservationAdapterDeps<
    Candidate,
    PegOut,
    Revalidation
  >,
): AuthenticatedSettlementCandidateExternalPorts<Candidate, PegOut, Revalidation> {
  return Object.freeze({
    observations: Object.freeze({
      observeBurn: (pegOut: PegOut) => deps.observeBurn(pegOut),
      observeErgoInputs: async (candidate: Candidate) => {
        const [anchorHeaderId, trackerBox, dupBox, vaultBox] = await Promise.all([
          deps.ergo.getBlockHeaderHash(candidate.anchorHeaderHeight),
          deps.ergo.getBoxByIdOrNull(candidate.trackerBoxId),
          deps.ergo.getBoxByIdOrNull(candidate.dupInputBoxId),
          deps.ergo.getBoxByIdOrNull(candidate.vaultBoxId),
        ]);
        return Object.freeze({
          anchorHeaderId,
          trackerBoxPresent: Boolean(trackerBox),
          dupBoxPresent: Boolean(dupBox),
          vaultBoxPresent: Boolean(vaultBox),
        });
      },
    }),
    revalidator: Object.freeze({
      recollect: (candidate: Candidate, pegOut: PegOut) =>
        deps.recollect(candidate, pegOut),
    }),
  });
}
