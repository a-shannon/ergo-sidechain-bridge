import { describe, expect, it } from 'vitest';

import {
  PEG_IN_MINT_CONFIRMATIONS,
  PEG_IN_MINT_FEE_POLICY_ID,
  PEG_IN_MINT_TRANSPORT_SCHEMA,
  normalizePegInMintAcceptedSubmission,
} from './peg-in-mint-transport-lifecycle.js';

const TRANSACTION_HASH = '11'.repeat(32);
const BLOCK_HASH = '22'.repeat(32);
const RESPONSE_DIGEST = '33'.repeat(32);

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    status: 'accepted' as const,
    transactionHashHex: TRANSACTION_HASH,
    responseDigestHex: RESPONSE_DIGEST,
    confirmationBlockNumber: 100,
    confirmationBlockHashHex: BLOCK_HASH,
    confirmationCount: PEG_IN_MINT_CONFIRMATIONS,
    ...overrides,
  } as any;
}

describe('historical peg-in mint transport records', () => {
  it('keeps the persisted schema and fee-policy identities stable', () => {
    expect(PEG_IN_MINT_TRANSPORT_SCHEMA).toBe(
      'e2s.peg-in-mint-transport.v1',
    );
    expect(PEG_IN_MINT_FEE_POLICY_ID).toBe(
      'e2s.frontier-peg-in-mint-fee-policy.v1',
    );
  });

  it('normalizes an exact historical confirmation', () => {
    const normalized = normalizePegInMintAcceptedSubmission(
      `0x${TRANSACTION_HASH.toUpperCase()}`,
      accepted({
        transactionHashHex: TRANSACTION_HASH.toUpperCase(),
        confirmationBlockHashHex: `0x${BLOCK_HASH.toUpperCase()}`,
      }),
    );

    expect(normalized).toEqual({
      status: 'accepted',
      transactionHashHex: TRANSACTION_HASH,
      responseDigestHex: RESPONSE_DIGEST,
      confirmationBlockNumber: 100,
      confirmationBlockHashHex: BLOCK_HASH,
      confirmationCount: PEG_IN_MINT_CONFIRMATIONS,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it.each([
    [
      'another transaction',
      TRANSACTION_HASH,
      accepted({ transactionHashHex: '44'.repeat(32) }),
      /outside the historical reservation/u,
    ],
    [
      'another confirmation policy',
      TRANSACTION_HASH,
      accepted({ confirmationCount: 2 }),
      /wrong confirmation policy/u,
    ],
    [
      'an invalid response digest',
      TRANSACTION_HASH,
      accepted({ responseDigestHex: 'ff' }),
      /response digest/u,
    ],
    [
      'a negative confirmation height',
      TRANSACTION_HASH,
      accepted({ confirmationBlockNumber: -1 }),
      /non-negative safe integer/u,
    ],
  ])('rejects %s', (_label, expectedHash, submission, expected) => {
    expect(() => normalizePegInMintAcceptedSubmission(
      expectedHash,
      submission,
    )).toThrow(expected);
  });
});
