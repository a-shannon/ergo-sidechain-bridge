import { describe, expect, it } from 'vitest';

import {
  FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX,
  PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  normalizePegInFrontierEventStatementV1,
} from './peg-in-frontier-event-v1.js';

describe('peg-in Frontier event statement V1', () => {
  it('pins the exact storage keys and Solidity event topic', () => {
    expect(SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX).toBe(
      '0x2013754dd003840aea66b349f8241e25b1ef0b108928f2a3c149728bbd19fb48',
    );
    expect(SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX).toBe(
      '0x2013754dd003840aea66b349f8241e2582fbce236236c63b34351052f96f6751',
    );
    expect(FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX).toBe(
      '0x9cf2608a8ad4df58c716bc474940e99c2d1eb8f79aba81081974b0039d8b46d0',
    );
  });

  it('normalizes and freezes the exact statement', () => {
    const normalized = normalizePegInFrontierEventStatementV1(statement());
    expect(normalized).toEqual(statement());
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it.each([
    ['schema', (value: Record<string, unknown>) => {
      value.schema = 'e2s.peg-in-frontier-event-statement.v2';
    }, /schema/i],
    ['receipts key', (value: Record<string, unknown>) => {
      value.currentReceiptsStorageKeyHex = `0x${'00'.repeat(32)}`;
    }, /CurrentReceipts storage key/i],
    ['statuses key', (value: Record<string, unknown>) => {
      value.currentTransactionStatusesStorageKeyHex = `0x${'00'.repeat(32)}`;
    }, /CurrentTransactionStatuses storage key/i],
    ['unknown field', (value: Record<string, unknown>) => {
      value.verified = true;
    }, /unexpected field/i],
  ] as const)('rejects %s drift', (_label, mutate, message) => {
    const candidate = structuredClone(statement()) as Record<string, unknown>;
    mutate(candidate);
    expect(() => normalizePegInFrontierEventStatementV1(candidate)).toThrow(message);
  });
});

function statement() {
  return {
    schema: PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
    currentReceiptsStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    currentTransactionStatusesStorageKeyHex:
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  };
}
