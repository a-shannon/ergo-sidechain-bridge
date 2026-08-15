import { describe, expect, it } from 'vitest';

import {
  assertLifecycleSignalsMonotonic,
  classifySettlementLifecycle,
} from './settlement-lifecycle.js';

describe('settlement lifecycle classification', () => {
  it('starts as unseen without signals', () => {
    expect(classifySettlementLifecycle({})).toEqual({
      status: 'unseen',
      latestMs: null,
      hasFastSignal: false,
      isCanonicallyIncluded: false,
      isEconomicallyFinal: false,
    });
  });

  it('separates fast inclusion from canonical inclusion', () => {
    const status = classifySettlementLifecycle({
      burnObservedMs: 0,
      proofReadyMs: 1_000,
      settlementSubmittedMs: 2_000,
      mempoolAcceptedMs: 2_500,
      fastInclusionSeenMs: 4_000,
    });

    expect(status.status).toBe('fast_inclusion_seen');
    expect(status.hasFastSignal).toBe(true);
    expect(status.isCanonicallyIncluded).toBe(false);
    expect(status.isEconomicallyFinal).toBe(false);
  });

  it('marks ordering confirmation without economic finality', () => {
    const status = classifySettlementLifecycle({
      burnObservedMs: 0,
      proofReadyMs: 1_000,
      settlementSubmittedMs: 2_000,
      mempoolAcceptedMs: 2_500,
      fastInclusionSeenMs: 4_000,
      orderingBlockIncludedMs: 120_000,
    });

    expect(status.status).toBe('ordering_confirmed');
    expect(status.hasFastSignal).toBe(true);
    expect(status.isCanonicallyIncluded).toBe(true);
    expect(status.isEconomicallyFinal).toBe(false);
  });

  it('marks finalized only after economic finality signal', () => {
    const status = classifySettlementLifecycle({
      burnObservedMs: 0,
      proofReadyMs: 1_000,
      settlementSubmittedMs: 2_000,
      mempoolAcceptedMs: 2_500,
      fastInclusionSeenMs: 4_000,
      orderingBlockIncludedMs: 120_000,
      economicFinalityMs: 1_320_000,
    });

    expect(status.status).toBe('finalized');
    expect(status.latestMs).toBe(1_320_000);
    expect(status.isEconomicallyFinal).toBe(true);
  });

  it('accepts monotonic signals', () => {
    expect(() => assertLifecycleSignalsMonotonic({
      burnObservedMs: 0,
      proofReadyMs: 1_000,
      settlementSubmittedMs: 2_000,
      mempoolAcceptedMs: 2_500,
      fastInclusionSeenMs: 4_000,
      orderingBlockIncludedMs: 120_000,
      economicFinalityMs: 1_320_000,
    })).not.toThrow();
  });

  it('rejects negative timestamps', () => {
    expect(() => assertLifecycleSignalsMonotonic({ burnObservedMs: -1 }))
      .toThrow(/finite non-negative/);
  });

  it('rejects non-monotonic signals', () => {
    expect(() => assertLifecycleSignalsMonotonic({
      burnObservedMs: 0,
      proofReadyMs: 2_000,
      settlementSubmittedMs: 1_000,
    })).toThrow(/earlier than/);
  });
});

