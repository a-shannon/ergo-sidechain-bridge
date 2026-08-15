import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedSettlementCandidateReconciliationView,
} from '../../relayer-core/authenticated-settlement-candidate-reconciliation.js';
import type {
  AuthenticatedSettlementCandidateStateTracker,
} from '../../adapters/authenticated-settlement-candidate-journal.js';
import {
  runAuthenticatedSettlementCandidateReconciliation,
} from './authenticated-settlement-candidate-reconciliation.js';

interface TestCandidate
  extends AuthenticatedSettlementCandidateReconciliationView {
  sidechainId: string;
}

const CANDIDATE: TestCandidate = {
  candidateId: 'candidate-a',
  burnId: 'burn-a',
  sidechainId: 'sidechain-a',
  anchorHeaderHeight: 100,
  anchorHeaderId: '11'.repeat(32),
  trackerBoxId: 'tracker-a',
  dupInputBoxId: 'dup-a',
  vaultBoxId: 'vault-a',
};
const TX_HASH = `0x${'aa'.repeat(32)}`;
const BLOCK_HASH = `0x${'bb'.repeat(32)}`;

function emptyState(): AuthenticatedSettlementCandidateStateTracker<TestCandidate> {
  return {
    getActiveAuthenticatedSettlementCandidates: () => [],
    getPegOutByBurnId: () => {
      throw new Error('empty journal must not read peg-outs');
    },
    invalidateAuthenticatedSettlementCandidate: () => {
      throw new Error('empty journal must not invalidate');
    },
    markPegOutBurnRevertedAndInvalidateCandidates: () => {
      throw new Error('empty journal must not classify burns');
    },
  };
}

describe('bridge-daemon authenticated candidate reconciliation composition', () => {
  it('does not touch external observations after complete journal loss', async () => {
    let externalCalls = 0;

    await expect(runAuthenticatedSettlementCandidateReconciliation({
      state: emptyState(),
      ergo: {
        getBlockHeaderHash: async () => {
          externalCalls++;
          return '11'.repeat(32);
        },
        getBoxByIdOrNull: async () => {
          externalCalls++;
          return {};
        },
      },
      revalidations: new Map(),
      observeBurn: async () => {
        externalCalls++;
        return 'confirmed';
      },
      recollect: async () => {
        externalCalls++;
        return {
          expectedTxId: '22'.repeat(32),
          revalidationDigestHex: '33'.repeat(32),
        };
      },
    })).resolves.toEqual({
      activeCandidates: 0,
      prunedRevalidations: 0,
      retainedRevalidations: 0,
      refreshedRevalidations: 0,
      deferredCandidates: 0,
      invalidatedCandidates: 0,
      revertedBurns: 0,
    });
    expect(externalCalls).toBe(0);
  });

  it('reconstructs one exact process-local revalidation through fixed adapters', async () => {
    const cache = new Map();
    const state: AuthenticatedSettlementCandidateStateTracker<TestCandidate> = {
      getActiveAuthenticatedSettlementCandidates: () => [CANDIDATE],
      getPegOutByBurnId: burnId => burnId === CANDIDATE.burnId
        ? {
          sidechainBurnTxHash: TX_HASH,
          ergoRecipientAddress: '9recipient',
          amountNanoErg: 10n,
          sidechainBurnHeight: 90,
          sidechainBlockHash: BLOCK_HASH,
          sidechainLogIndex: 2,
          user: '0xuser',
        }
        : undefined,
      invalidateAuthenticatedSettlementCandidate: () => {
        throw new Error('current candidate must not be invalidated');
      },
      markPegOutBurnRevertedAndInvalidateCandidates: () => {
        throw new Error('confirmed burn must not be reverted');
      },
    };

    const result = await runAuthenticatedSettlementCandidateReconciliation({
      state,
      ergo: {
        getBlockHeaderHash: async () => `0x${CANDIDATE.anchorHeaderId}`,
        getBoxByIdOrNull: async () => ({ present: true }),
      },
      revalidations: cache,
      observeBurn: async pegOut => {
        expect(pegOut.sidechainTxHash).toBe(TX_HASH);
        return 'confirmed';
      },
      recollect: async (candidate, pegOut) => {
        expect(candidate).toMatchObject(CANDIDATE);
        expect(pegOut).toMatchObject({
          amount: 10n,
          sidechainBlockNumber: 90,
          sidechainLogIndex: 2,
        });
        return {
          expectedTxId: '22'.repeat(32),
          revalidationDigestHex: '33'.repeat(32),
        };
      },
    });

    expect(result).toMatchObject({
      activeCandidates: 1,
      refreshedRevalidations: 1,
      deferredCandidates: 0,
      invalidatedCandidates: 0,
    });
    expect(cache.get(CANDIDATE.candidateId)).toEqual({
      expectedTxId: '22'.repeat(32),
      revalidationDigestHex: '33'.repeat(32),
    });
  });
});
