import type {
  AuthenticatedSettlementCandidateJournalPort,
  AuthenticatedSettlementCandidateReconciliationView,
} from '../relayer-core/authenticated-settlement-candidate-reconciliation.js';

export interface AuthenticatedSettlementCandidatePegOut {
  user: string;
  amount: bigint;
  ergoRecipientAddress: string;
  sidechainTxHash: string;
  sidechainBlockNumber: number;
  sidechainBlockHash?: string;
  sidechainLogIndex?: number;
}

export interface AuthenticatedSettlementCandidateStateTracker<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
> {
  getActiveAuthenticatedSettlementCandidates(): readonly Candidate[];
  getPegOutByBurnId(burnId: string): unknown;
  invalidateAuthenticatedSettlementCandidate(
    candidateId: string,
    reason: string,
  ): unknown;
  markPegOutBurnRevertedAndInvalidateCandidates(
    lookup: { burnId: string },
    reason: string,
  ): unknown;
}

export function parseAuthenticatedSettlementCandidatePegOutRow(
  value: unknown,
): AuthenticatedSettlementCandidatePegOut {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('authenticated settlement candidate peg-out row is invalid');
  }
  const row = value as Record<string, unknown>;
  const rawAmount = row.amount_nanoerg ?? row.amountNanoErg ?? row.amount;
  const amount = requiredPositiveBigInt(rawAmount, 'nanoERG amount');
  return Object.freeze({
    sidechainTxHash: requiredHex32(
      row.sidechain_burn_tx_hash ?? row.sidechainBurnTxHash,
      'sidechain burn transaction hash',
    ),
    ergoRecipientAddress: requiredString(
      row.ergo_recipient_address ?? row.ergoRecipientAddress,
      'Ergo recipient address',
    ),
    amount,
    user: optionalString(row.user, 'sidechain user'),
    sidechainBlockNumber: requiredNonNegativeSafeInteger(
      row.sidechain_burn_height ?? row.sidechainBurnHeight,
      'sidechain burn height',
    ),
    ...optionalHex32(
      row.sidechain_block_hash ?? row.sidechainBlockHash,
      'sidechainBlockHash',
    ),
    ...optionalNonNegativeSafeInteger(
      row.sidechain_log_index ?? row.sidechainLogIndex,
      'sidechainLogIndex',
    ),
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  return value;
}

function requiredHex32(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const hex = text.startsWith('0x') ? text.slice(2) : text;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  return text;
}

function requiredPositiveBigInt(
  value: unknown,
  label: string,
): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  return parsed;
}

function requiredNonNegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`authenticated settlement candidate ${label} is invalid`);
  }
  return value;
}

export function createAuthenticatedSettlementCandidateJournalAdapter<
  Candidate extends AuthenticatedSettlementCandidateReconciliationView,
>(
  state: AuthenticatedSettlementCandidateStateTracker<Candidate>,
): AuthenticatedSettlementCandidateJournalPort<
  Candidate,
  AuthenticatedSettlementCandidatePegOut
> {
  return Object.freeze({
    listActiveCandidates: () =>
      state.getActiveAuthenticatedSettlementCandidates().map(candidate =>
        Object.freeze({ ...candidate }) as Candidate),
    findPegOutByBurnId: (burnId: string) => {
      const row = state.getPegOutByBurnId(burnId);
      return row === null || row === undefined
        ? null
        : parseAuthenticatedSettlementCandidatePegOutRow(row);
    },
    invalidateCandidate: (candidateId: string, reason: string) => {
      state.invalidateAuthenticatedSettlementCandidate(candidateId, reason);
    },
    markBurnRevertedAndInvalidateCandidates: (burnId: string, reason: string) => {
      state.markPegOutBurnRevertedAndInvalidateCandidates({ burnId }, reason);
    },
  });
}

function optionalHex32(
  value: unknown,
  key: 'sidechainBlockHash',
): Partial<Pick<AuthenticatedSettlementCandidatePegOut, typeof key>> {
  if (value === undefined || value === null) return {};
  return { [key]: requiredHex32(value, 'sidechain block hash') };
}

function optionalNonNegativeSafeInteger(
  value: unknown,
  key: 'sidechainLogIndex',
): Partial<Pick<AuthenticatedSettlementCandidatePegOut, typeof key>> {
  if (value === undefined || value === null) return {};
  return {
    [key]: requiredNonNegativeSafeInteger(value, 'sidechain log index'),
  };
}
