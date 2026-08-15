import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  reconcileActiveRewardConsolidation,
  reconcileConfirmedRewardConsolidations,
} from './scripts/devnet-consolidate-rewards.js';
import { StateTracker } from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);
const NODE_ORIGIN = 'http://127.0.0.1:9051';
const CHAIN_ANCHOR = hex('30');

function attemptInput(
  expectedTxId: string,
  sourceBoxId: string,
  additionalBoxId: string = hex('13'),
) {
  return {
    operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
    expectedTxId,
    sourceBoxId,
    inputBoxIds: [sourceBoxId, additionalBoxId],
    attemptedAtHeight: 100,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: hex('20'),
    bindingDigestHex: hex('14'),
    signedTransactionDigestHex: hex('15'),
    checkResponseDigestHex: hex('16'),
    revalidationDigestHex: hex('17'),
    authorizationDigestHex: hex('18'),
  };
}

describe('devnet reward consolidation durable journal', () => {
  it('survives restart, blocks replacement, and reconciles the exact transaction', () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-reward-journal-'));
    const dbPath = join(directory, 'reward.sqlite');
    const expectedTxId = hex('11');
    const sourceBoxId = hex('12');
    try {
      const initial = new StateTracker(dbPath);
      try {
        const reserved = initial.reserveErgoOperationalTransactionAttempt(
          attemptInput(expectedTxId, sourceBoxId),
        );
        initial.finalizeErgoOperationalTransactionAttempt({
          expectedTxId,
          durableAttemptDigestHex: reserved.durableAttemptDigestHex,
          disposition: 'ambiguous',
          submittedTxId: null,
          responseDigestHex: null,
        });
      } finally {
        initial.close();
      }

      const restarted = new StateTracker(dbPath);
      try {
        expect(restarted.getActiveErgoOperationalTransactionAttempts(
          DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
        )).toEqual([
          expect.objectContaining({
            expectedTxId,
            sourceBoxId,
            status: 'ambiguous',
            reconciliationIdentityDigestHex: hex('20'),
          }),
        ]);
        expect(() => restarted.reserveErgoOperationalTransactionAttempt(
          attemptInput(hex('21'), hex('22'), hex('23')),
        )).toThrow(/must be reconciled before replacement/i);

        restarted.confirmErgoOperationalTransactionAttempt({
          expectedTxId,
          confirmationHeight: 103,
          confirmationHeaderId: hex('19'),
        });
        expect(restarted.getActiveErgoOperationalTransactionAttempts(
          DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
        )).toEqual([]);
        expect(restarted.getConfirmedErgoOperationalTransactionAttempts(
          DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
        )).toEqual([
          expect.objectContaining({
            expectedTxId,
            status: 'confirmed',
            confirmationHeight: 103,
            confirmationHeaderId: hex('19'),
          }),
        ]);
        expect(() => restarted.reserveErgoOperationalTransactionAttempt(
          attemptInput(hex('31'), hex('32'), hex('13')),
        )).toThrow(/previously journaled reward box/i);
      } finally {
        restarted.close();
      }
    } finally {
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });

  it('rejects restart reconciliation under another durable session identity', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-reward-session-'));
    const dbPath = join(directory, 'reward.sqlite');
    const tracker = new StateTracker(dbPath);
    try {
      tracker.reserveErgoOperationalTransactionAttempt(
        attemptInput(hex('41'), hex('42')),
      );
      const get = vi.fn(async () => {
        throw new Error('node must not be queried after a session mismatch');
      });
      const client = {
        defaults: { baseURL: NODE_ORIGIN },
        get,
      } as unknown as AxiosInstance;
      await expect(reconcileActiveRewardConsolidation(
        tracker,
        client,
        NODE_ORIGIN,
        CHAIN_ANCHOR,
        hex('21'),
      )).rejects.toThrow(/another node\/signer session/i);
      expect(get).not.toHaveBeenCalled();
    } finally {
      tracker.close();
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });

  it('blocks fresh work when a confirmed transaction loses final depth', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-reward-reorg-'));
    const dbPath = join(directory, 'reward.sqlite');
    const expectedTxId = hex('51');
    const tracker = new StateTracker(dbPath);
    try {
      const reserved = tracker.reserveErgoOperationalTransactionAttempt(
        attemptInput(expectedTxId, hex('52')),
      );
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        disposition: 'accepted',
        submittedTxId: expectedTxId,
        responseDigestHex: hex('53'),
      });
      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 103,
        confirmationHeaderId: hex('54'),
      });
      const get = vi.fn(async (path: string) => {
        if (path === '/info') return { data: { fullHeight: 110, network: 'devnet' } };
        if (path === '/blocks/at/1') return { data: [CHAIN_ANCHOR] };
        if (path === `/blockchain/transaction/byId/${expectedTxId}`) {
          return { data: {
            id: expectedTxId,
            numConfirmations: 1,
            inclusionHeight: 110,
            headerId: hex('55'),
          } };
        }
        throw new Error(`unexpected path: ${path}`);
      });
      const client = {
        defaults: { baseURL: NODE_ORIGIN },
        get,
      } as unknown as AxiosInstance;
      await expect(reconcileConfirmedRewardConsolidations(
        tracker,
        client,
        NODE_ORIGIN,
        CHAIN_ANCHOR,
        hex('20'),
      )).rejects.toThrow(/lost final canonical inclusion/i);
      expect(tracker.getErgoOperationalTransactionAttempt(expectedTxId)?.status)
        .toBe('confirmed');
    } finally {
      tracker.close();
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });
});
