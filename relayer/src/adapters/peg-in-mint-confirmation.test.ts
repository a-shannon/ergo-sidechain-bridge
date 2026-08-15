import { describe, expect, it, vi } from 'vitest';

import {
  createPegInMintAcceptedSubmission,
  observeFrontierPegInMintTransportConfirmation,
  type FrontierMintConfirmationProvider,
} from './peg-in-mint-confirmation.js';
import { PEG_IN_MINT_CONFIRMATIONS } from '../relayer-core/peg-in-mint-transport-lifecycle.js';

const TRANSACTION_HASH = `0x${'ab'.repeat(32)}`;
const CONFIRMATION_BLOCK_HASH = `0x${'88'.repeat(32)}`;

function provider(overrides: Partial<Readonly<{
  receipt: Awaited<ReturnType<FrontierMintConfirmationProvider['getTransactionReceipt']>>;
  currentBlockNumber: number;
  canonicalBlock: Awaited<ReturnType<FrontierMintConfirmationProvider['getBlock']>>;
}>> = {}): FrontierMintConfirmationProvider {
  return {
    getTransactionReceipt: vi.fn(async () =>
      Object.prototype.hasOwnProperty.call(overrides, 'receipt')
        ? overrides.receipt ?? null
        : {
            hash: TRANSACTION_HASH,
            status: 1,
            blockNumber: 102,
            blockHash: CONFIRMATION_BLOCK_HASH,
          }),
    getBlockNumber: vi.fn(async () => overrides.currentBlockNumber ?? 104),
    getBlock: vi.fn(async () =>
      Object.prototype.hasOwnProperty.call(overrides, 'canonicalBlock')
        ? overrides.canonicalBlock ?? null
        : { hash: CONFIRMATION_BLOCK_HASH }),
  };
}

describe('Frontier historical peg-in mint confirmation', () => {
  it('reconstructs exact confirmation only from the reserved canonical receipt', async () => {
    const source = provider();

    await expect(observeFrontierPegInMintTransportConfirmation(
      source,
      TRANSACTION_HASH,
    )).resolves.toMatchObject({
      status: 'confirmed',
      submission: {
        status: 'accepted',
        transactionHashHex: TRANSACTION_HASH.slice(2),
        confirmationBlockNumber: 102,
        confirmationBlockHashHex: CONFIRMATION_BLOCK_HASH,
        confirmationCount: PEG_IN_MINT_CONFIRMATIONS,
        responseDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    });
    expect(source.getTransactionReceipt).toHaveBeenCalledWith(TRANSACTION_HASH);
    expect(source.getBlock).toHaveBeenCalledWith(102);
  });

  it('reports an absent reserved transaction without consulting chain height', async () => {
    const source = provider({ receipt: null });

    await expect(observeFrontierPegInMintTransportConfirmation(
      source,
      TRANSACTION_HASH,
    )).resolves.toEqual({ status: 'absent' });
    expect(source.getBlockNumber).not.toHaveBeenCalled();
    expect(source.getBlock).not.toHaveBeenCalled();
  });

  it('holds a canonical reserved receipt below the confirmation policy', async () => {
    await expect(observeFrontierPegInMintTransportConfirmation(
      provider({ currentBlockNumber: 103 }),
      TRANSACTION_HASH,
    )).resolves.toEqual({
      status: 'pending',
      transactionHashHex: TRANSACTION_HASH.slice(2),
      confirmationBlockNumber: 102,
      confirmationBlockHashHex: CONFIRMATION_BLOCK_HASH.slice(2),
      confirmationCount: 2,
    });
  });

  it.each([
    ['another transaction hash', { hash: `0x${'99'.repeat(32)}`, status: 1 }],
    ['a failed receipt', { hash: TRANSACTION_HASH, status: 0 }],
  ])('rejects %s', async (_label, receiptOverride) => {
    const source = provider({
      receipt: {
        hash: receiptOverride.hash,
        status: receiptOverride.status,
        blockNumber: 102,
        blockHash: CONFIRMATION_BLOCK_HASH,
      },
    });

    await expect(observeFrontierPegInMintTransportConfirmation(
      source,
      TRANSACTION_HASH,
    )).rejects.toThrow('does not prove the accepted transaction');
  });

  it('rejects a reserved receipt removed from current block history', async () => {
    await expect(observeFrontierPegInMintTransportConfirmation(
      provider({ canonicalBlock: { hash: `0x${'99'.repeat(32)}` } }),
      TRANSACTION_HASH,
    )).rejects.toThrow('not on the current sidechain history');
  });

  it.each([
    ['unsafe current height', Number.MAX_SAFE_INTEGER + 1, 102, /heights are invalid/u],
    ['negative receipt height', 104, -1, /heights are invalid/u],
    ['receipt above current tip', 101, 102, /depth is invalid/u],
  ])('rejects %s', async (_label, currentBlockNumber, receiptBlockNumber, expected) => {
    const source = provider({
      currentBlockNumber,
      receipt: {
        hash: TRANSACTION_HASH,
        status: 1,
        blockNumber: receiptBlockNumber,
        blockHash: CONFIRMATION_BLOCK_HASH,
      },
    });

    await expect(observeFrontierPegInMintTransportConfirmation(
      source,
      TRANSACTION_HASH,
    )).rejects.toThrow(expected);
  });

  it('canonicalizes the accepted historical submission and binds its response digest', () => {
    const accepted = createPegInMintAcceptedSubmission({
      transactionHashHex: TRANSACTION_HASH.toUpperCase(),
      confirmationBlockNumber: 102,
      confirmationBlockHashHex: CONFIRMATION_BLOCK_HASH.slice(2).toUpperCase(),
    });
    const repeated = createPegInMintAcceptedSubmission({
      transactionHashHex: TRANSACTION_HASH,
      confirmationBlockNumber: 102,
      confirmationBlockHashHex: CONFIRMATION_BLOCK_HASH,
    });

    expect(accepted).toEqual(repeated);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(() => createPegInMintAcceptedSubmission({
      transactionHashHex: TRANSACTION_HASH,
      confirmationBlockNumber: -1,
      confirmationBlockHashHex: CONFIRMATION_BLOCK_HASH,
    })).toThrow('nonnegative safe integer');
  });
});
