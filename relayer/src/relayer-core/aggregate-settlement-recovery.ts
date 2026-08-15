export type AggregateSettlementRecoveryMode =
  | 'single'
  | 'single-with-ingest'
  | 'batch';

export type AggregateSettlementRecoveryObservationStatus =
  | 'absent'
  | 'mempool'
  | 'confirmed_pre_finality'
  | 'confirmed_final';

export interface AggregateSettlementRecoveryAttemptView {
  mode: AggregateSettlementRecoveryMode;
  status: 'pending' | 'submitted' | 'confirmed' | 'abandoned';
  expectedTxId: string;
  submittedTxId: string | null;
  burnTxHashes: readonly string[];
  lifecycleVersion: number;
  recoveryBindingStatus: 'legacy_unbound' | 'policy_v1';
  recoveryPolicyVersion: number | null;
  recoveryRequiredConfirmations: number | null;
  ergoObservation: {
    status: AggregateSettlementRecoveryObservationStatus;
  } | null;
  recoveryQuarantine: object | null;
}

export type AggregateSettlementRecoverableAttemptView =
  Omit<AggregateSettlementRecoveryAttemptView, 'status'>
  & { status: 'pending' | 'submitted' };

export type AggregateSettlementConfirmedAttemptView =
  Omit<AggregateSettlementRecoveryAttemptView, 'status'>
  & { status: 'confirmed' };

export interface AggregateSettlementRecoveryPolicyV1 {
  version: 1;
  requiredConfirmations: number;
}

export interface AggregateSettlementRecoveryObservationView {
  record: {
    status: AggregateSettlementRecoveryObservationStatus;
  };
}

export interface AggregateSettlementRecoveryObservationResult<
  Observation extends AggregateSettlementRecoveryObservationView,
  Consensus extends object,
> {
  observation: Observation;
  consensus: Consensus | null;
}

export interface AggregateSettlementRecoveryObservationPort<
  Observation extends AggregateSettlementRecoveryObservationView,
  Consensus extends object,
> {
  observe(input: {
    transactionId: string;
    policy: AggregateSettlementRecoveryPolicyV1;
  }): Promise<AggregateSettlementRecoveryObservationResult<Observation, Consensus>>;
}

export interface AggregateSettlementRecoveryMutationResult {
  applied: boolean;
  restoredBurns: number;
  skippedBurns: number;
  missingPegOuts: number;
  rolledBackBurns: number;
  rolledBackPreFinality: boolean;
}

export interface AggregateSettlementRecoveryJournalPort<
  Observation extends AggregateSettlementRecoveryObservationView,
  Consensus extends object,
> {
  listRecoverableAttempts(): readonly AggregateSettlementRecoverableAttemptView[];
  applyRecoverableObservation(input: {
    expectedTxId: string;
    expectedLifecycleVersion: number;
    expectedStatus: 'pending' | 'submitted';
    expectedSubmittedTxId: string | null;
    mode: AggregateSettlementRecoveryMode;
    burnTxHashes: readonly string[];
    observation: Observation;
    consensus: Consensus | null;
  }): AggregateSettlementRecoveryMutationResult;
  listConfirmedAttempts(): readonly AggregateSettlementConfirmedAttemptView[];
  quarantineConfirmedAbsence(input: {
    expectedTxId: string;
    expectedLifecycleVersion: number;
    observation: Observation;
    consensus: Consensus;
  }): boolean;
}

export interface AggregateSettlementRecoveryResult {
  restoredBurns: number;
  deferredAttempts: number;
  missingPegOuts: number;
  skippedBurns: number;
  rolledBackAttempts: number;
  rolledBackBurns: number;
  quarantinedConfirmedAttempts: number;
}

export interface AggregateSettlementRecoveryPorts<
  Observation extends AggregateSettlementRecoveryObservationView,
  Consensus extends object,
> {
  observations: AggregateSettlementRecoveryObservationPort<Observation, Consensus>;
  journal: AggregateSettlementRecoveryJournalPort<Observation, Consensus>;
  log?: (
    level: 'info' | 'warn',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export function getAggregateSettlementRecoveryPolicy(
  attempt: AggregateSettlementRecoveryAttemptView,
): AggregateSettlementRecoveryPolicyV1 | null {
  if (
    attempt.recoveryBindingStatus !== 'policy_v1'
    || attempt.recoveryPolicyVersion !== 1
    || attempt.recoveryRequiredConfirmations === null
  ) {
    return null;
  }
  return {
    version: 1,
    requiredConfirmations: attempt.recoveryRequiredConfirmations,
  };
}

export function normalizeAggregateSettlementRecoveryTxId(txId: string): string {
  const clean = txId.startsWith('0x') ? txId.slice(2) : txId;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`aggregate settlement transaction ID must be 32-byte hex: ${txId}`);
  }
  return clean.toLowerCase();
}

export async function recoverAggregateSettlementLifecycle<
  Observation extends AggregateSettlementRecoveryObservationView,
  Consensus extends object,
>(
  ports: AggregateSettlementRecoveryPorts<Observation, Consensus>,
): Promise<AggregateSettlementRecoveryResult> {
  const log = ports.log ?? (() => undefined);
  const result: AggregateSettlementRecoveryResult = {
    restoredBurns: 0,
    deferredAttempts: 0,
    missingPegOuts: 0,
    skippedBurns: 0,
    rolledBackAttempts: 0,
    rolledBackBurns: 0,
    quarantinedConfirmedAttempts: 0,
  };

  const attempts = ports.journal.listRecoverableAttempts();
  const observations: Array<{
    attempt: AggregateSettlementRecoverableAttemptView;
    observation: Observation;
    consensus: Consensus | null;
  }> = [];
  for (const attempt of attempts) {
    const policy = getAggregateSettlementRecoveryPolicy(attempt);
    if (!policy) {
      result.deferredAttempts++;
      log('warn', 'Legacy aggregate settlement attempt has no versioned Ergo recovery policy', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
      });
      continue;
    }
    const expectedTxId = normalizeAggregateSettlementRecoveryTxId(attempt.expectedTxId);
    const submittedTxId = attempt.submittedTxId === null
      ? null
      : normalizeAggregateSettlementRecoveryTxId(attempt.submittedTxId);
    if (submittedTxId !== null && submittedTxId !== expectedTxId) {
      throw new Error(
        `aggregate settlement recovery journal submitted transaction ${submittedTxId} does not match expected ${expectedTxId}`,
      );
    }
    const transactionId = submittedTxId ?? expectedTxId;
    const observed = await ports.observations.observe({ transactionId, policy });
    observations.push({ attempt, ...observed });
  }

  // Finish the read phase before applying any recoverable-attempt mutation.
  for (const observed of observations) {
    const { attempt, observation, consensus } = observed;
    const presence = observation.record.status;
    if (
      presence === 'absent'
      && attempt.ergoObservation?.status === 'confirmed_pre_finality'
      && consensus === null
    ) {
      result.deferredAttempts++;
      log('warn', 'Pre-finality aggregate settlement disappearance needs matching witness RPC observation', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
        burnTxHashes: attempt.burnTxHashes,
      });
      continue;
    }
    const mutation = ports.journal.applyRecoverableObservation({
      expectedTxId: attempt.expectedTxId,
      expectedLifecycleVersion: attempt.lifecycleVersion,
      expectedStatus: attempt.status,
      expectedSubmittedTxId: attempt.submittedTxId,
      mode: attempt.mode,
      burnTxHashes: attempt.burnTxHashes,
      observation,
      consensus,
    });
    result.missingPegOuts += mutation.missingPegOuts;
    result.skippedBurns += mutation.skippedBurns;
    result.restoredBurns += mutation.restoredBurns;
    result.rolledBackBurns += mutation.rolledBackBurns;
    if (mutation.rolledBackPreFinality) result.rolledBackAttempts++;

    if (!mutation.applied) {
      result.deferredAttempts++;
      log('warn', 'Aggregate settlement recovery reducer rejected stale or incomplete local state', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
        burnTxHashes: attempt.burnTxHashes,
        observationStatus: presence,
      });
      continue;
    }
    if (presence === 'absent') {
      result.deferredAttempts++;
      log('warn', 'Aggregate settlement attempt is absent from confirmed chain and mempool; new submission remains held fail-closed', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
        burnTxHashes: attempt.burnTxHashes,
        rolledBackPreFinality: mutation.rolledBackPreFinality,
      });
    }
  }

  const confirmedAttempts = ports.journal.listConfirmedAttempts();
  for (const attempt of confirmedAttempts) {
    if (attempt.recoveryQuarantine !== null) continue;
    const policy = getAggregateSettlementRecoveryPolicy(attempt);
    if (!policy) {
      result.deferredAttempts++;
      log('warn', 'Confirmed aggregate settlement attempt has no versioned Ergo recovery policy', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
      });
      continue;
    }
    const transactionId = normalizeAggregateSettlementRecoveryTxId(
      attempt.submittedTxId ?? attempt.expectedTxId,
    );
    const observed = await ports.observations.observe({ transactionId, policy });
    const presence = observed.observation.record.status;
    if (presence !== 'absent') continue;
    if (observed.consensus === null) {
      result.deferredAttempts++;
      log('warn', 'Confirmed aggregate settlement disappearance needs matching witness RPC observation', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
        burnTxHashes: attempt.burnTxHashes,
      });
      continue;
    }
    const quarantined = ports.journal.quarantineConfirmedAbsence({
      expectedTxId: attempt.expectedTxId,
      expectedLifecycleVersion: attempt.lifecycleVersion,
      observation: observed.observation,
      consensus: observed.consensus,
    });
    if (!quarantined) {
      result.deferredAttempts++;
      log('warn', 'Confirmed aggregate settlement reorg quarantine rejected stale local state', {
        expectedTxId: attempt.expectedTxId,
        mode: attempt.mode,
        burnTxHashes: attempt.burnTxHashes,
      });
      continue;
    }
    result.quarantinedConfirmedAttempts++;
    log('warn', 'Confirmed aggregate settlement is absent from two Ergo sources and was quarantined locally', {
      expectedTxId: attempt.expectedTxId,
      mode: attempt.mode,
      burnTxHashes: attempt.burnTxHashes,
    });
  }

  return result;
}
