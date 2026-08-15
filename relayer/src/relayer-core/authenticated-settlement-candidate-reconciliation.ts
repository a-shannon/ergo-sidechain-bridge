export type AuthenticatedSettlementCandidateBurnStatus =
  | 'confirmed'
  | 'reverted'
  | 'unknown';

export interface AuthenticatedSettlementCandidateReconciliationView {
  candidateId: string;
  burnId: string;
  anchorHeaderHeight: number;
  anchorHeaderId: string;
  trackerBoxId: string;
  dupInputBoxId: string;
  vaultBoxId: string;
}

export interface AuthenticatedSettlementCandidateErgoObservation {
  anchorHeaderId: string;
  trackerBoxPresent: boolean;
  dupBoxPresent: boolean;
  vaultBoxPresent: boolean;
}

export interface AuthenticatedSettlementCandidateRevalidationView {
  expectedTxId: string;
  revalidationDigestHex: string;
}

export interface AuthenticatedSettlementCandidateJournalPort<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
> {
  listActiveCandidates(): readonly Candidate[];
  findPegOutByBurnId(burnId: string): PegOut | null;
  invalidateCandidate(candidateId: string, reason: string): void;
  markBurnRevertedAndInvalidateCandidates(burnId: string, reason: string): void;
}

export interface AuthenticatedSettlementCandidateObservationPort<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
> {
  observeBurn(pegOut: PegOut): Promise<AuthenticatedSettlementCandidateBurnStatus>;
  observeErgoInputs(
    candidate: Candidate,
  ): Promise<AuthenticatedSettlementCandidateErgoObservation>;
}

export interface AuthenticatedSettlementCandidateRevalidationPort<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  recollect(candidate: Candidate, pegOut: PegOut): Promise<Revalidation | null>;
}

export interface AuthenticatedSettlementCandidateRevalidationCache<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  keys(): IterableIterator<string>;
  has(candidateId: string): boolean;
  delete(candidateId: string): boolean;
  set(candidateId: string, revalidation: Revalidation): unknown;
}

export interface AuthenticatedSettlementCandidateReconciliationPorts<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  journal: AuthenticatedSettlementCandidateJournalPort<Candidate, PegOut>;
  observations: AuthenticatedSettlementCandidateObservationPort<Candidate, PegOut>;
  revalidator: AuthenticatedSettlementCandidateRevalidationPort<
    Candidate,
    PegOut,
    Revalidation
  >;
  revalidations: AuthenticatedSettlementCandidateRevalidationCache<Revalidation>;
  log?: (
    level: 'info' | 'warn',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export interface AuthenticatedSettlementCandidateReconciliationResult {
  activeCandidates: number;
  prunedRevalidations: number;
  retainedRevalidations: number;
  refreshedRevalidations: number;
  deferredCandidates: number;
  invalidatedCandidates: number;
  revertedBurns: number;
}

function normalizeHash(value: string): string {
  return (value.startsWith('0x') ? value.slice(2) : value).toLowerCase();
}

function staleInputReasons(
  candidate: AuthenticatedSettlementCandidateReconciliationView,
  observation: AuthenticatedSettlementCandidateErgoObservation,
): string[] {
  const reasons: string[] = [];
  if (normalizeHash(observation.anchorHeaderId) !== candidate.anchorHeaderId) {
    reasons.push('Ergo anchor header left the canonical chain');
  }
  if (!observation.trackerBoxPresent) {
    reasons.push('authenticated tracker data input is spent or missing');
  }
  if (!observation.dupBoxPresent) {
    reasons.push('authenticated DUP input is spent or missing');
  }
  if (!observation.vaultBoxPresent) {
    reasons.push('settlement vault input is spent or missing');
  }
  return reasons;
}

export async function reconcileAuthenticatedSettlementCandidates<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
  PegOut,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  ports: AuthenticatedSettlementCandidateReconciliationPorts<
    Candidate,
    PegOut,
    Revalidation
  >,
): Promise<AuthenticatedSettlementCandidateReconciliationResult> {
  const log = ports.log ?? (() => undefined);
  const candidates = [...ports.journal.listActiveCandidates()];
  const activeCandidateIds = new Set(
    candidates.map(candidate => candidate.candidateId),
  );
  const result: AuthenticatedSettlementCandidateReconciliationResult = {
    activeCandidates: candidates.length,
    prunedRevalidations: 0,
    retainedRevalidations: 0,
    refreshedRevalidations: 0,
    deferredCandidates: 0,
    invalidatedCandidates: 0,
    revertedBurns: 0,
  };

  for (const candidateId of ports.revalidations.keys()) {
    if (!activeCandidateIds.has(candidateId)) {
      ports.revalidations.delete(candidateId);
      result.prunedRevalidations++;
    }
  }

  for (const candidate of candidates) {
    const pegOut = ports.journal.findPegOutByBurnId(candidate.burnId);
    if (pegOut === null) {
      ports.revalidations.delete(candidate.candidateId);
      ports.journal.invalidateCandidate(
        candidate.candidateId,
        'persisted peg-out row is unavailable',
      );
      result.invalidatedCandidates++;
      continue;
    }

    const burnStatus = await ports.observations.observeBurn(pegOut);
    if (burnStatus === 'reverted') {
      ports.revalidations.delete(candidate.candidateId);
      ports.journal.markBurnRevertedAndInvalidateCandidates(
        candidate.burnId,
        'candidate burn no longer matches the required source observation',
      );
      result.revertedBurns++;
      continue;
    }
    if (burnStatus === 'unknown') {
      ports.revalidations.delete(candidate.candidateId);
      result.deferredCandidates++;
      continue;
    }
    if (burnStatus !== 'confirmed') {
      throw new Error(
        `authenticated settlement candidate burn status is unsupported: ${String(burnStatus)}`,
      );
    }

    let ergoObservation: AuthenticatedSettlementCandidateErgoObservation;
    try {
      ergoObservation = await ports.observations.observeErgoInputs(candidate);
    } catch (error: unknown) {
      ports.revalidations.delete(candidate.candidateId);
      result.deferredCandidates++;
      log('warn', 'Authenticated settlement candidate reconciliation unavailable', {
        candidateId: candidate.candidateId,
        error: errorMessage(error),
      });
      continue;
    }

    const staleReasons = staleInputReasons(candidate, ergoObservation);
    if (staleReasons.length > 0) {
      ports.revalidations.delete(candidate.candidateId);
      ports.journal.invalidateCandidate(
        candidate.candidateId,
        staleReasons.join('; '),
      );
      result.invalidatedCandidates++;
      log('warn', 'Invalidated stale authenticated settlement candidate', {
        candidateId: candidate.candidateId,
        reasons: staleReasons,
      });
      continue;
    }

    if (ports.revalidations.has(candidate.candidateId)) {
      result.retainedRevalidations++;
      continue;
    }

    try {
      const revalidated = await ports.revalidator.recollect(candidate, pegOut);
      if (revalidated === null) {
        ports.revalidations.delete(candidate.candidateId);
        result.deferredCandidates++;
        continue;
      }
      ports.revalidations.set(candidate.candidateId, revalidated);
      result.refreshedRevalidations++;
      log('info', 'Revalidated exact authenticated settlement candidate after restart', {
        candidateId: candidate.candidateId,
        expectedTxId: revalidated.expectedTxId,
        revalidationDigest: revalidated.revalidationDigestHex,
      });
    } catch (error: unknown) {
      ports.revalidations.delete(candidate.candidateId);
      result.deferredCandidates++;
      log('warn', 'Authenticated settlement candidate restart revalidation remains fail-closed', {
        candidateId: candidate.candidateId,
        error: errorMessage(error),
      });
    }
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
