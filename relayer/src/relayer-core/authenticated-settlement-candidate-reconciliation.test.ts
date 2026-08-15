import { describe, expect, it } from 'vitest';

import {
  reconcileAuthenticatedSettlementCandidates,
  type AuthenticatedSettlementCandidateReconciliationPorts,
  type AuthenticatedSettlementCandidateReconciliationView,
  type AuthenticatedSettlementCandidateRevalidationView,
} from './authenticated-settlement-candidate-reconciliation.js';

interface TestCandidate
  extends AuthenticatedSettlementCandidateReconciliationView {
  sidechainId: string;
}

interface TestPegOut {
  burnId: string;
}

interface TestRevalidation
  extends AuthenticatedSettlementCandidateRevalidationView {
  candidateId: string;
}

function candidate(
  candidateId: string,
  overrides: Partial<TestCandidate> = {},
): TestCandidate {
  return {
    candidateId,
    burnId: `burn-${candidateId}`,
    sidechainId: 'sidechain-a',
    anchorHeaderHeight: 100,
    anchorHeaderId: '11'.repeat(32),
    trackerBoxId: `tracker-${candidateId}`,
    dupInputBoxId: `dup-${candidateId}`,
    vaultBoxId: `vault-${candidateId}`,
    ...overrides,
  };
}

function revalidation(candidateId: string): TestRevalidation {
  return {
    candidateId,
    expectedTxId: candidateId.padEnd(64, '0').slice(0, 64),
    revalidationDigestHex: candidateId.padEnd(64, '1').slice(0, 64),
  };
}

function emptyPorts(
  events: string[],
): AuthenticatedSettlementCandidateReconciliationPorts<
  TestCandidate,
  TestPegOut,
  TestRevalidation
> {
  return {
    journal: {
      listActiveCandidates: () => {
        events.push('list');
        return [];
      },
      findPegOutByBurnId: () => {
        throw new Error('empty journal must not read a peg-out');
      },
      invalidateCandidate: () => {
        throw new Error('empty journal must not invalidate');
      },
      markBurnRevertedAndInvalidateCandidates: () => {
        throw new Error('empty journal must not mutate burn state');
      },
    },
    observations: {
      observeBurn: async () => {
        throw new Error('empty journal must not observe a burn');
      },
      observeErgoInputs: async () => {
        throw new Error('empty journal must not observe Ergo');
      },
    },
    revalidator: {
      recollect: async () => {
        throw new Error('empty journal must not recollect');
      },
    },
    revalidations: new Map(),
  };
}

describe('authenticated settlement candidate reconciliation core', () => {
  it('treats an empty journal and empty restart cache as a no-op', async () => {
    const events: string[] = [];

    await expect(
      reconcileAuthenticatedSettlementCandidates(emptyPorts(events)),
    ).resolves.toEqual({
      activeCandidates: 0,
      prunedRevalidations: 0,
      retainedRevalidations: 0,
      refreshedRevalidations: 0,
      deferredCandidates: 0,
      invalidatedCandidates: 0,
      revertedBurns: 0,
    });
    expect(events).toEqual(['list']);
  });

  it('replays restart, reorg, stale-input, outage, and cache branches fail-closed', async () => {
    const candidates = [
      candidate('missing'),
      candidate('reverted'),
      candidate('unknown'),
      candidate('ergo-error'),
      candidate('cached'),
      candidate('deferred'),
      candidate('recollect-error'),
      candidate('refreshed'),
    ];
    const pegOuts = new Map(
      candidates
        .filter(entry => entry.candidateId !== 'missing')
        .map(entry => [entry.burnId, { burnId: entry.burnId }]),
    );
    const cache = new Map<string, TestRevalidation>([
      ['orphan', revalidation('orphan')],
      ['reverted', revalidation('reverted')],
      ['unknown', revalidation('unknown')],
      ['ergo-error', revalidation('ergo-error')],
      ['cached', revalidation('cached')],
    ]);
    const invalidations: Array<[string, string]> = [];
    const revertedBurns: Array<[string, string]> = [];
    const recollected: string[] = [];
    const logs: string[] = [];

    const result = await reconcileAuthenticatedSettlementCandidates({
      journal: {
        listActiveCandidates: () => candidates,
        findPegOutByBurnId: burnId => pegOuts.get(burnId) ?? null,
        invalidateCandidate: (candidateId, reason) => {
          invalidations.push([candidateId, reason]);
        },
        markBurnRevertedAndInvalidateCandidates: (burnId, reason) => {
          revertedBurns.push([burnId, reason]);
        },
      },
      observations: {
        observeBurn: async pegOut => {
          const candidateId = pegOut.burnId.slice('burn-'.length);
          if (candidateId === 'reverted') return 'reverted';
          if (candidateId === 'unknown') return 'unknown';
          return 'confirmed';
        },
        observeErgoInputs: async entry => {
          if (entry.candidateId === 'ergo-error') {
            throw new Error('Ergo RPC unavailable');
          }
          return {
            anchorHeaderId: `0x${entry.anchorHeaderId.toUpperCase()}`,
            trackerBoxPresent: true,
            dupBoxPresent: true,
            vaultBoxPresent: true,
          };
        },
      },
      revalidator: {
        recollect: async entry => {
          recollected.push(entry.candidateId);
          if (entry.candidateId === 'deferred') return null;
          if (entry.candidateId === 'recollect-error') {
            throw new Error('proof recollection unavailable');
          }
          return revalidation(entry.candidateId);
        },
      },
      revalidations: cache,
      log: (_level, message) => logs.push(message),
    });

    expect(result).toEqual({
      activeCandidates: 8,
      prunedRevalidations: 1,
      retainedRevalidations: 1,
      refreshedRevalidations: 1,
      deferredCandidates: 4,
      invalidatedCandidates: 1,
      revertedBurns: 1,
    });
    expect(invalidations).toEqual([
      ['missing', 'persisted peg-out row is unavailable'],
    ]);
    expect(revertedBurns).toEqual([
      [
        'burn-reverted',
        'candidate burn no longer matches the required source observation',
      ],
    ]);
    expect(recollected).toEqual([
      'deferred',
      'recollect-error',
      'refreshed',
    ]);
    expect([...cache.keys()].sort()).toEqual(['cached', 'refreshed']);
    expect(logs).toContain(
      'Authenticated settlement candidate reconciliation unavailable',
    );
    expect(logs).toContain(
      'Authenticated settlement candidate restart revalidation remains fail-closed',
    );
    expect(logs).toContain(
      'Revalidated exact authenticated settlement candidate after restart',
    );
  });

  it('propagates unexpected burn observation failures before later work', async () => {
    const candidates = [candidate('first'), candidate('later')];
    const events: string[] = [];

    await expect(reconcileAuthenticatedSettlementCandidates({
      journal: {
        listActiveCandidates: () => candidates,
        findPegOutByBurnId: burnId => ({ burnId }),
        invalidateCandidate: () => events.push('invalidate'),
        markBurnRevertedAndInvalidateCandidates: () => events.push('revert'),
      },
      observations: {
        observeBurn: async pegOut => {
          const candidateId = pegOut.burnId.slice('burn-'.length);
          events.push(`burn:${candidateId}`);
          if (candidateId === 'first') {
            throw new Error('unexpected burn verifier failure');
          }
          return 'confirmed';
        },
        observeErgoInputs: async entry => {
          events.push(`ergo:${entry.candidateId}`);
          return {
            anchorHeaderId: entry.anchorHeaderId,
            trackerBoxPresent: true,
            dupBoxPresent: true,
            vaultBoxPresent: true,
          };
        },
      },
      revalidator: {
        recollect: async entry => {
          events.push(`recollect:${entry.candidateId}`);
          return revalidation(entry.candidateId);
        },
      },
      revalidations: new Map(),
    })).rejects.toThrow(/unexpected burn verifier failure/);
    expect(events).toEqual(['burn:first']);
  });

  it('rejects an out-of-domain burn status before Ergo observation', async () => {
    let ergoObserved = false;

    await expect(reconcileAuthenticatedSettlementCandidates({
      journal: {
        listActiveCandidates: () => [candidate('unsupported')],
        findPegOutByBurnId: burnId => ({ burnId }),
        invalidateCandidate: () => undefined,
        markBurnRevertedAndInvalidateCandidates: () => undefined,
      },
      observations: {
        observeBurn: async () => 'accepted' as never,
        observeErgoInputs: async entry => {
          ergoObserved = true;
          return {
            anchorHeaderId: entry.anchorHeaderId,
            trackerBoxPresent: true,
            dupBoxPresent: true,
            vaultBoxPresent: true,
          };
        },
      },
      revalidator: {
        recollect: async entry => revalidation(entry.candidateId),
      },
      revalidations: new Map(),
    })).rejects.toThrow(/burn status is unsupported: accepted/);
    expect(ergoObserved).toBe(false);
  });

  it.each([
    {
      label: 'replaced anchor',
      observation: { anchorHeaderId: '22'.repeat(32) },
      reason: 'Ergo anchor header left the canonical chain',
    },
    {
      label: 'missing tracker',
      observation: { trackerBoxPresent: false },
      reason: 'authenticated tracker data input is spent or missing',
    },
    {
      label: 'missing DUP',
      observation: { dupBoxPresent: false },
      reason: 'authenticated DUP input is spent or missing',
    },
    {
      label: 'missing vault',
      observation: { vaultBoxPresent: false },
      reason: 'settlement vault input is spent or missing',
    },
  ])('isolates $label invalidation', async ({ observation, reason }) => {
    const entry = candidate('stale');
    const invalidations: Array<[string, string]> = [];

    const result = await reconcileAuthenticatedSettlementCandidates({
      journal: {
        listActiveCandidates: () => [entry],
        findPegOutByBurnId: burnId => ({ burnId }),
        invalidateCandidate: (candidateId, invalidationReason) => {
          invalidations.push([candidateId, invalidationReason]);
        },
        markBurnRevertedAndInvalidateCandidates: () => undefined,
      },
      observations: {
        observeBurn: async () => 'confirmed',
        observeErgoInputs: async () => ({
          anchorHeaderId: entry.anchorHeaderId,
          trackerBoxPresent: true,
          dupBoxPresent: true,
          vaultBoxPresent: true,
          ...observation,
        }),
      },
      revalidator: {
        recollect: async () => {
          throw new Error('stale candidate must not be recollected');
        },
      },
      revalidations: new Map(),
    });

    expect(result).toMatchObject({
      invalidatedCandidates: 1,
      refreshedRevalidations: 0,
    });
    expect(invalidations).toEqual([['stale', reason]]);
  });
});
