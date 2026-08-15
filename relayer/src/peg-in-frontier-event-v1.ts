export const PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA =
  'e2s.peg-in-frontier-event-statement.v1' as const;
export const SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX =
  '0x2013754dd003840aea66b349f8241e25b1ef0b108928f2a3c149728bbd19fb48' as const;
export const SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX =
  '0x2013754dd003840aea66b349f8241e2582fbce236236c63b34351052f96f6751' as const;
export const FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX =
  '0x9cf2608a8ad4df58c716bc474940e99c2d1eb8f79aba81081974b0039d8b46d0' as const;

export interface PegInFrontierEventStatementV1 {
  readonly schema: typeof PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA;
  readonly currentReceiptsStorageKeyHex:
    typeof SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX;
  readonly currentTransactionStatusesStorageKeyHex:
    typeof SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX;
}

/**
 * Normalize the exact receipt/status storage identities for the Frontier event profile.
 *
 * This validates statement identities only. It performs no RPC, proof verification, lifecycle
 * mutation, mint selection, signing, submission, or broadcast.
 */
export function normalizePegInFrontierEventStatementV1(
  value: unknown,
): PegInFrontierEventStatementV1 {
  const statement = exactRecord(
    value,
    [
      'currentReceiptsStorageKeyHex',
      'currentTransactionStatusesStorageKeyHex',
      'schema',
    ],
    'peg-in Frontier event statement V1',
  );
  requireLiteral(
    statement.schema,
    PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
    'peg-in Frontier event statement V1 schema',
  );
  requireLiteral(
    statement.currentReceiptsStorageKeyHex,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    'Ethereum CurrentReceipts storage key',
  );
  requireLiteral(
    statement.currentTransactionStatusesStorageKeyHex,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    'Ethereum CurrentTransactionStatuses storage key',
  );

  return Object.freeze({
    schema: PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
    currentReceiptsStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    currentTransactionStatusesStorageKeyHex:
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  });
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}
