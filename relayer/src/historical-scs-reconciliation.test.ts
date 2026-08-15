import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  reconcileHistoricalScsAttempts,
  type HistoricalScsAttempt,
  type HistoricalScsReconciliationPorts,
} from './historical-scs-reconciliation.js';

const TX_ID = '11'.repeat(32);
const SOURCE_BOX_ID = '12'.repeat(32);
const HEADER_ID = '13'.repeat(32);

function attempt(
  status: HistoricalScsAttempt['status'],
): HistoricalScsAttempt {
  return Object.freeze({
    expectedTxId: TX_ID,
    sourceBoxId: SOURCE_BOX_ID,
    attemptedAtHeight: 100,
    status,
  });
}

describe('historical SCS reconciliation', () => {
  let current: HistoricalScsAttempt;
  let transactionReads: unknown[];
  let ports: HistoricalScsReconciliationPorts;
  const confirm = vi.fn();
  const abandon = vi.fn();
  const log = vi.fn();
  const isSingletonInMempool = vi.fn();
  const getSourceBox = vi.fn();
  const getTransaction = vi.fn();
  const observeInclusion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    current = attempt('accepted');
    transactionReads = [null, null];
    isSingletonInMempool.mockResolvedValue(false);
    getSourceBox.mockResolvedValue(null);
    getTransaction.mockImplementation(
      async () => transactionReads.shift() ?? null,
    );
    observeInclusion.mockResolvedValue({
      confirmations: 10,
      inclusionHeight: 101,
      headerId: HEADER_ID,
    });
    ports = {
      activeAttempts: () => current.status === 'abandoned' ? [] : [current],
      reconcilableAttempts: () => [current],
      getAttempt: () => current,
      getTransaction,
      observeInclusion,
      isSingletonInMempool,
      getSourceBox,
      confirm,
      abandon,
      log,
    };
  });

  it.each(['accepted', 'ambiguous'] as const)(
    'keeps a recent absent %s attempt pending without mutation',
    async status => {
      current = attempt(status);

      await expect(reconcileHistoricalScsAttempts({
        currentHeight: 110,
        finalConfirmations: 10,
        ports,
      })).resolves.toEqual({ reconciliationPending: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(abandon).not.toHaveBeenCalled();
      expect(isSingletonInMempool).not.toHaveBeenCalled();
    },
  );

  it('keeps an old absent attempt pending when the destructive re-read fails', async () => {
    getTransaction
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('RPC unavailable'));

    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 111,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(abandon).not.toHaveBeenCalled();
    expect(isSingletonInMempool).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('RPC unavailable'),
    );
  });

  it('keeps an old absent attempt pending while the singleton is in mempool', async () => {
    isSingletonInMempool.mockResolvedValue(true);

    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 111,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: true });

    expect(abandon).not.toHaveBeenCalled();
    expect(getSourceBox).not.toHaveBeenCalled();
  });

  it('holds an old absent attempt when its source spend is unresolved', async () => {
    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 111,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: true });

    expect(abandon).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('retaining a fail-closed reconciliation hold'),
    );
  });

  it('abandons an old absent attempt only when the exact source is restored', async () => {
    getSourceBox.mockResolvedValue({ boxId: SOURCE_BOX_ID });

    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 111,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: false });

    expect(abandon).toHaveBeenCalledWith(
      TX_ID,
      'exact transaction absent after ten blocks and source singleton remains unspent',
    );
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining(
        'historical attempt abandoned and active SCS mutation remains retired',
      ),
    );
  });

  it('confirms a delayed exact transaction even after local abandonment', async () => {
    current = attempt('abandoned');
    transactionReads = [{ id: TX_ID }];

    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 120,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: false });

    expect(confirm).toHaveBeenCalledWith({
      expectedTxId: TX_ID,
      confirmationHeight: 101,
      confirmationHeaderId: HEADER_ID,
    });
    expect(abandon).not.toHaveBeenCalled();
  });

  it('keeps a shallow inclusion pending', async () => {
    transactionReads = [{ id: TX_ID }];
    observeInclusion.mockResolvedValue({
      confirmations: 9,
      inclusionHeight: 101,
      headerId: HEADER_ID,
    });
    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 120,
      finalConfirmations: 10,
      ports,
    })).resolves.toEqual({ reconciliationPending: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects multiple active attempts before observing transactions', async () => {
    await expect(reconcileHistoricalScsAttempts({
      currentHeight: 120,
      finalConfirmations: 10,
      ports: {
        ...ports,
        activeAttempts: () => [current, current],
      },
    })).rejects.toThrow(/multiple active SCS operational attempts/);
    expect(getTransaction).not.toHaveBeenCalled();
  });
});
