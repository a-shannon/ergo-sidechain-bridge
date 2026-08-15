export const PEG_IN_MINT_TRANSPORT_SCHEMA =
  'e2s.peg-in-mint-transport.v1' as const;
export const PEG_IN_MINT_FEE_POLICY_ID =
  'e2s.frontier-peg-in-mint-fee-policy.v1' as const;
export const PEG_IN_MINT_CONFIRMATIONS = 3;

export type PegInMintAcceptedSubmission = Readonly<{
  status: 'accepted';
  transactionHashHex: string;
  responseDigestHex: string;
  confirmationBlockNumber: number;
  confirmationBlockHashHex: string;
  confirmationCount: typeof PEG_IN_MINT_CONFIRMATIONS;
}>;

export type PegInMintTransportConfirmationObservation =
  | Readonly<{ status: 'absent' }>
  | Readonly<{
      status: 'pending';
      transactionHashHex: string;
      confirmationBlockNumber: number;
      confirmationBlockHashHex: string;
      confirmationCount: number;
    }>
  | Readonly<{
      status: 'confirmed';
      submission: PegInMintAcceptedSubmission;
    }>;

export type PegInMintTransportRejectionReason =
  | 'source_revalidation_failed'
  | 'target_revalidation_failed';

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical ${bytes}-byte hex`);
  }
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be canonical ${bytes}-byte hex`);
  }
  return normalized;
}

function blockNumber(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

export function normalizePegInMintAcceptedSubmission(
  expectedTransactionHashHex: string,
  value: PegInMintAcceptedSubmission,
): PegInMintAcceptedSubmission {
  const expectedHashHex = fixedHex(
    expectedTransactionHashHex,
    32,
    'reserved peg-in mint transaction hash',
  );
  const transactionHashHex = fixedHex(
    value.transactionHashHex,
    32,
    'peg-in mint transaction hash',
  );
  if (transactionHashHex !== expectedHashHex) {
    throw new Error(
      'peg-in mint confirmation is outside the historical reservation',
    );
  }
  if (value.confirmationCount !== PEG_IN_MINT_CONFIRMATIONS) {
    throw new Error(
      'peg-in mint confirmation uses the wrong confirmation policy',
    );
  }
  return Object.freeze({
    status: 'accepted',
    transactionHashHex,
    responseDigestHex: fixedHex(
      value.responseDigestHex,
      32,
      'peg-in mint response digest',
    ),
    confirmationBlockNumber: blockNumber(
      value.confirmationBlockNumber,
      'peg-in mint confirmation block number',
    ),
    confirmationBlockHashHex: fixedHex(
      value.confirmationBlockHashHex,
      32,
      'peg-in mint confirmation block hash',
    ),
    confirmationCount: PEG_IN_MINT_CONFIRMATIONS,
  });
}
