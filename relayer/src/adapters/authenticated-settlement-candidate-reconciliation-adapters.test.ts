import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedSettlementCandidateReconciliationView,
} from '../relayer-core/authenticated-settlement-candidate-reconciliation.js';
import {
  createAuthenticatedSettlementCandidateJournalAdapter,
  parseAuthenticatedSettlementCandidatePegOutRow,
  type AuthenticatedSettlementCandidateStateTracker,
} from './authenticated-settlement-candidate-journal.js';
import {
  createAuthenticatedSettlementCandidateObservationAdapter,
} from './authenticated-settlement-candidate-observation.js';

interface TestCandidate
  extends AuthenticatedSettlementCandidateReconciliationView {
  sidechainId: string;
}

const TX_HASH = `0x${'aa'.repeat(32)}`;
const BLOCK_HASH = `0x${'bb'.repeat(32)}`;

const CANDIDATE: TestCandidate = {
  candidateId: 'candidate-a',
  burnId: 'burn-a',
  sidechainId: 'sidechain-a',
  anchorHeaderHeight: 120,
  anchorHeaderId: '11'.repeat(32),
  trackerBoxId: 'tracker-a',
  dupInputBoxId: 'dup-a',
  vaultBoxId: 'vault-a',
};

describe('authenticated settlement candidate reconciliation adapters', () => {
  it('exposes exact journal mutations and immutable candidate snapshots', () => {
    const mutations: unknown[] = [];
    const state: AuthenticatedSettlementCandidateStateTracker<TestCandidate> = {
      getActiveAuthenticatedSettlementCandidates: () => [CANDIDATE],
      getPegOutByBurnId: () => ({
        sidechainBurnTxHash: TX_HASH,
        ergoRecipientAddress: '9recipient',
        amountNanoErg: 42n,
        user: '0xuser',
        sidechainBurnHeight: 55,
        sidechainBlockHash: BLOCK_HASH,
        sidechainLogIndex: 3,
      }),
      invalidateAuthenticatedSettlementCandidate: (candidateId, reason) => {
        mutations.push(['invalidate', candidateId, reason]);
      },
      markPegOutBurnRevertedAndInvalidateCandidates: (lookup, reason) => {
        mutations.push(['revert', lookup, reason]);
      },
    };
    const adapter = createAuthenticatedSettlementCandidateJournalAdapter(state);

    expect(Object.keys(adapter).sort()).toEqual([
      'findPegOutByBurnId',
      'invalidateCandidate',
      'listActiveCandidates',
      'markBurnRevertedAndInvalidateCandidates',
    ]);
    const [listed] = adapter.listActiveCandidates();
    expect(listed).toEqual(CANDIDATE);
    expect(listed).not.toBe(CANDIDATE);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(adapter.findPegOutByBurnId('burn-a')).toEqual({
      sidechainTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amount: 42n,
      user: '0xuser',
      sidechainBlockNumber: 55,
      sidechainBlockHash: BLOCK_HASH,
      sidechainLogIndex: 3,
    });
    adapter.invalidateCandidate('candidate-a', 'stale');
    adapter.markBurnRevertedAndInvalidateCandidates('burn-a', 'reorg');
    expect(mutations).toEqual([
      ['invalidate', 'candidate-a', 'stale'],
      ['revert', { burnId: 'burn-a' }, 'reorg'],
    ]);
  });

  it('parses legacy snake-case rows and rejects malformed deciding fields', () => {
    expect(parseAuthenticatedSettlementCandidatePegOutRow({
      sidechain_burn_tx_hash: TX_HASH,
      ergo_recipient_address: '9recipient',
      amount_nanoerg: '9000000000',
      user: null,
      sidechain_burn_height: 77,
      sidechain_block_hash: BLOCK_HASH,
      sidechain_log_index: 4,
    })).toEqual({
      sidechainTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amount: 9_000_000_000n,
      user: '',
      sidechainBlockNumber: 77,
      sidechainBlockHash: BLOCK_HASH,
      sidechainLogIndex: 4,
    });
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      sidechainBurnHeight: 1,
    })).toThrow(/burn transaction hash is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: '0xaaa',
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      sidechainBurnHeight: 1,
    })).toThrow(/burn transaction hash is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: true,
      sidechainBurnHeight: 1,
    })).toThrow(/nanoERG amount is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 0n,
      sidechainBurnHeight: 1,
    })).toThrow(/nanoERG amount is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      user: true,
      sidechainBurnHeight: 1,
    })).toThrow(/sidechain user is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      sidechainBurnHeight: '1',
    })).toThrow(/burn height is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      sidechainBurnHeight: 1,
      sidechainBlockHash: 7,
    })).toThrow(/sidechain block hash is invalid/);
    expect(() => parseAuthenticatedSettlementCandidatePegOutRow({
      sidechainBurnTxHash: TX_HASH,
      ergoRecipientAddress: '9recipient',
      amountNanoErg: 1n,
      sidechainBurnHeight: 1,
      sidechainLogIndex: '2',
    })).toThrow(/sidechain log index is invalid/);
  });

  it('binds the four Ergo reads and external operations without local authority', async () => {
    const reads: string[] = [];
    const burns: string[] = [];
    const recollected: string[] = [];
    const external = createAuthenticatedSettlementCandidateObservationAdapter({
      ergo: {
        getBlockHeaderHash: async height => {
          reads.push(`header:${height}`);
          return '11'.repeat(32);
        },
        getBoxByIdOrNull: async boxId => {
          reads.push(`box:${boxId}`);
          return boxId === CANDIDATE.dupInputBoxId ? null : { boxId };
        },
      },
      observeBurn: async (pegOut: { burnId: string }) => {
        burns.push(pegOut.burnId);
        return 'confirmed';
      },
      recollect: async (candidate, pegOut: { burnId: string }) => {
        recollected.push(`${candidate.candidateId}:${pegOut.burnId}`);
        return {
          expectedTxId: '22'.repeat(32),
          revalidationDigestHex: '33'.repeat(32),
        };
      },
    });

    await expect(external.observations.observeBurn({ burnId: 'burn-a' }))
      .resolves.toBe('confirmed');
    await expect(external.observations.observeErgoInputs(CANDIDATE))
      .resolves.toEqual({
        anchorHeaderId: '11'.repeat(32),
        trackerBoxPresent: true,
        dupBoxPresent: false,
        vaultBoxPresent: true,
      });
    await expect(external.revalidator.recollect(
      CANDIDATE,
      { burnId: 'burn-a' },
    )).resolves.toEqual({
      expectedTxId: '22'.repeat(32),
      revalidationDigestHex: '33'.repeat(32),
    });
    expect(reads).toEqual([
      'header:120',
      'box:tracker-a',
      'box:dup-a',
      'box:vault-a',
    ]);
    expect(burns).toEqual(['burn-a']);
    expect(recollected).toEqual(['candidate-a:burn-a']);
  });
});
