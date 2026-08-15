export type HistoricalScsAttemptStatus =
  | 'pending'
  | 'accepted'
  | 'ambiguous'
  | 'confirmed'
  | 'abandoned'
  | 'quarantined';

export interface HistoricalScsAttempt {
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly attemptedAtHeight: number;
  readonly status: HistoricalScsAttemptStatus;
}

export interface HistoricalScsInclusion {
  readonly confirmations: number;
  readonly inclusionHeight: number | null;
  readonly headerId: string | null;
}

export interface HistoricalScsReconciliationPorts {
  readonly activeAttempts: () => readonly HistoricalScsAttempt[];
  readonly reconcilableAttempts: () => readonly HistoricalScsAttempt[];
  readonly getAttempt: (expectedTxId: string) => HistoricalScsAttempt | null;
  readonly getTransaction: (expectedTxId: string) => Promise<unknown | null>;
  readonly observeInclusion: (
    transaction: unknown,
  ) => Promise<HistoricalScsInclusion>;
  readonly isSingletonInMempool: () => Promise<boolean>;
  readonly getSourceBox: (sourceBoxId: string) => Promise<unknown | null>;
  readonly confirm: (input: Readonly<{
    expectedTxId: string;
    confirmationHeight: number;
    confirmationHeaderId: string;
  }>) => void;
  readonly abandon: (expectedTxId: string, reason: string) => void;
  readonly log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export async function reconcileHistoricalScsAttempts(input: Readonly<{
  currentHeight: number;
  finalConfirmations: number;
  ports: HistoricalScsReconciliationPorts;
}>): Promise<Readonly<{ reconciliationPending: boolean }>> {
  const active = input.ports.activeAttempts();
  if (active.length > 1) {
    throw new Error('multiple active SCS operational attempts violate the static profile');
  }

  let reconciliationPending = false;
  const absentAttemptIds: string[] = [];
  for (const snapshot of input.ports.reconcilableAttempts()) {
    const attempt = input.ports.getAttempt(snapshot.expectedTxId);
    if (
      !attempt
      || !['pending', 'accepted', 'ambiguous', 'abandoned'].includes(
        attempt.status,
      )
    ) {
      continue;
    }
    const transaction = await input.ports.getTransaction(attempt.expectedTxId);
    if (transaction) {
      const inclusion = await input.ports.observeInclusion(transaction);
      if (
        inclusion.confirmations < input.finalConfirmations
        || inclusion.inclusionHeight === null
        || inclusion.headerId === null
      ) {
        reconciliationPending = true;
        continue;
      }
      input.ports.confirm({
        expectedTxId: attempt.expectedTxId,
        confirmationHeight: inclusion.inclusionHeight,
        confirmationHeaderId: inclusion.headerId,
      });
      input.ports.log(
        'info',
        `SCS TX ${attempt.expectedTxId.slice(0, 16)}... confirmed`,
      );
      continue;
    }
    absentAttemptIds.push(attempt.expectedTxId);
  }

  for (const expectedTxId of absentAttemptIds) {
    const attempt = input.ports.getAttempt(expectedTxId);
    if (!attempt || attempt.status === 'abandoned') continue;
    if (!['pending', 'accepted', 'ambiguous'].includes(attempt.status)) {
      continue;
    }

    let refreshedTransaction: unknown | null;
    try {
      refreshedTransaction = await input.ports.getTransaction(
        attempt.expectedTxId,
      );
    } catch (error: unknown) {
      reconciliationPending = true;
      const message = error instanceof Error ? error.message : String(error);
      input.ports.log(
        'warn',
        `Cannot revalidate absent SCS TX ${attempt.expectedTxId.slice(0, 16)}...: ${message}`,
      );
      continue;
    }

    if (refreshedTransaction) {
      const inclusion = await input.ports.observeInclusion(
        refreshedTransaction,
      );
      if (
        inclusion.confirmations < input.finalConfirmations
        || inclusion.inclusionHeight === null
        || inclusion.headerId === null
      ) {
        reconciliationPending = true;
        continue;
      }
      input.ports.confirm({
        expectedTxId: attempt.expectedTxId,
        confirmationHeight: inclusion.inclusionHeight,
        confirmationHeaderId: inclusion.headerId,
      });
      input.ports.log(
        'info',
        `SCS TX ${attempt.expectedTxId.slice(0, 16)}... confirmed during destructive revalidation`,
      );
      continue;
    }

    if (input.currentHeight <= attempt.attemptedAtHeight + 10) {
      reconciliationPending = true;
      continue;
    }
    if (await input.ports.isSingletonInMempool()) {
      reconciliationPending = true;
      continue;
    }
    const sourceBox = await input.ports.getSourceBox(attempt.sourceBoxId);
    if (sourceBox) {
      input.ports.abandon(
        attempt.expectedTxId,
        'exact transaction absent after ten blocks and source singleton remains unspent',
      );
      input.ports.log(
        'warn',
        `SCS TX ${attempt.expectedTxId.slice(0, 16)}... absent with its source unspent; historical attempt abandoned and active SCS mutation remains retired`,
      );
    } else {
      reconciliationPending = true;
      input.ports.log(
        'error',
        `SCS TX ${attempt.expectedTxId.slice(0, 16)}... has an unresolved source spend; retaining a fail-closed reconciliation hold`,
      );
    }
  }

  return Object.freeze({ reconciliationPending });
}
