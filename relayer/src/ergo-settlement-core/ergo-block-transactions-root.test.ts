import { describe, expect, it } from 'vitest';

import {
  computeErgoBlockTransactionsRoot,
  computeErgoTransactionWitnessId,
} from './ergo-block-transactions-root.js';

const TX_A = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const TX_B = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 32));
const TX_C = Buffer.alloc(32, 0xff);
const PROOFS_A = [
  Buffer.from('deadbeef', 'hex'),
  Buffer.from('000102', 'hex'),
];
const PROOFS_B = [
  Buffer.from('aa', 'hex'),
  Buffer.from('bbcc', 'hex'),
];

function transaction(
  transactionId: Uint8Array,
  spendingProofs: readonly Uint8Array[],
) {
  return { transactionId, spendingProofs };
}

describe('Ergo BlockTransactions root', () => {
  it('matches the hard-coded V1 transaction-ID-only golden vector', () => {
    const root = computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [transaction(TX_A, PROOFS_A)],
    });

    expect(root.toString('hex')).toBe(
      'b198f494b6d71f4cab89cc0990441ab40c9a3cd2228c5083ca0ca94588f41f21',
    );
  });

  it('matches the hard-coded V2 witness and root golden vectors', () => {
    expect(computeErgoTransactionWitnessId(PROOFS_A).toString('hex')).toBe(
      'f15552c545e0d9280ae493efbd65840fad1f43c7a1783ff0c3eaebad20912a',
    );

    const root = computeErgoBlockTransactionsRoot({
      blockVersion: 2,
      transactions: [transaction(TX_A, PROOFS_A)],
    });
    expect(root.toString('hex')).toBe(
      'aab70a5ad9b795f68120e7764d45f8f58936d901828a89b2a0079e4416dfe6e1',
    );
  });

  it('matches the hard-coded V1 odd-leaf golden vector', () => {
    const root = computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [
        transaction(TX_A, PROOFS_A),
        transaction(TX_B, PROOFS_B),
        transaction(TX_C, []),
      ],
    });

    expect(root.toString('hex')).toBe(
      '6fd6b7268117829553d6d9deebb673cdc766a8d96e8b0283f1f3ae0743b8fd73',
    );
  });

  it('matches hard-coded V2 vectors with multiple transactions and proofs', () => {
    expect(computeErgoTransactionWitnessId(PROOFS_B).toString('hex')).toBe(
      '93c86db88565f196b427f316efd9603dc6fbf7f0143474565e108529462c1b',
    );
    expect(computeErgoTransactionWitnessId([]).toString('hex')).toBe(
      '5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8',
    );

    const root = computeErgoBlockTransactionsRoot({
      blockVersion: 2,
      transactions: [
        transaction(TX_A, PROOFS_A),
        transaction(TX_B, PROOFS_B),
        transaction(TX_C, []),
      ],
    });
    expect(root.toString('hex')).toBe(
      'de377d053c0b3c5f2232d1b7b6ac82231d547ebf3fa242c0cfd4ea765c9f7910',
    );
  });

  it('isolates transaction, proof, version, and ordering mutations', () => {
    const baseline = {
      blockVersion: 2,
      transactions: [
        transaction(TX_A, PROOFS_A),
        transaction(TX_B, PROOFS_B),
      ],
    } as const;
    const expected = computeErgoBlockTransactionsRoot(baseline);

    const changedTransactionId = Buffer.from(TX_A);
    changedTransactionId[0] ^= 0x01;
    expect(computeErgoBlockTransactionsRoot({
      ...baseline,
      transactions: [
        transaction(changedTransactionId, PROOFS_A),
        baseline.transactions[1],
      ],
    })).not.toEqual(expected);

    const changedProof = Buffer.from(PROOFS_A[0]);
    changedProof[0] ^= 0x01;
    expect(computeErgoBlockTransactionsRoot({
      ...baseline,
      transactions: [
        transaction(TX_A, [changedProof, PROOFS_A[1]]),
        baseline.transactions[1],
      ],
    })).not.toEqual(expected);

    expect(computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: baseline.transactions,
    })).not.toEqual(expected);
    expect(computeErgoBlockTransactionsRoot({
      ...baseline,
      transactions: [...baseline.transactions].reverse(),
    })).not.toEqual(expected);
  });

  it('keeps V1 independent of spending-proof bytes', () => {
    const first = computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [transaction(TX_A, PROOFS_A)],
    });
    const second = computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [transaction(TX_A, [Buffer.from('ff', 'hex')])],
    });

    expect(second).toEqual(first);
  });

  it('rejects invalid versions, empty blocks, IDs, and raw shapes', () => {
    const validTransaction = transaction(TX_A, PROOFS_A);
    for (const blockVersion of [0, -1, 1.5, 128, Number.NaN]) {
      expect(() => computeErgoBlockTransactionsRoot({
        blockVersion,
        transactions: [validTransaction],
      })).toThrow(/block version/);
    }
    expect(() => computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [],
    })).toThrow(/at least one transaction/);
    expect(() => computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [transaction(Buffer.alloc(31), [])],
    })).toThrow(/ID must be 32 bytes/);
    expect(() => computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: 'not-an-array' as unknown as readonly never[],
    })).toThrow(/transactions must be an array/);
    expect(() => computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [{
        transactionId: TX_A,
        spendingProofs: 'not-an-array' as unknown as readonly Uint8Array[],
      }],
    })).toThrow(/spending proofs must be an array/);
    expect(() => computeErgoTransactionWitnessId([
      'not-bytes' as unknown as Uint8Array,
    ])).toThrow(/must be a Uint8Array/);
    expect(() => computeErgoBlockTransactionsRoot({
      blockVersion: 1,
      transactions: [{
        transactionId: TX_A,
        spendingProofs: [],
        extra: true,
      } as unknown as {
        transactionId: Uint8Array;
        spendingProofs: readonly Uint8Array[];
      }],
    })).toThrow(/must contain exactly/);
  });

  it('does not mutate transaction IDs, proofs, arrays, or input objects', () => {
    const transactionId = Buffer.from(TX_A);
    const firstProof = Buffer.from(PROOFS_A[0]);
    const secondProof = Buffer.from(PROOFS_A[1]);
    const proofs = [firstProof, secondProof];
    const transactions = [transaction(transactionId, proofs)];
    const input = { blockVersion: 2, transactions };
    const snapshots = {
      transactionId: Buffer.from(transactionId),
      firstProof: Buffer.from(firstProof),
      secondProof: Buffer.from(secondProof),
      proofs: [...proofs],
      transactions: [...transactions],
      transaction: transactions[0],
    };

    computeErgoBlockTransactionsRoot(input);

    expect(transactionId).toEqual(snapshots.transactionId);
    expect(firstProof).toEqual(snapshots.firstProof);
    expect(secondProof).toEqual(snapshots.secondProof);
    expect(proofs).toEqual(snapshots.proofs);
    expect(transactions).toEqual(snapshots.transactions);
    expect(transactions[0]).toBe(snapshots.transaction);
  });
});
