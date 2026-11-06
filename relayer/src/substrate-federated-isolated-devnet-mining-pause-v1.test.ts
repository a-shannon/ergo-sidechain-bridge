import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetPausedMiningIndexedSnapshotV1 as assertIndexed,
  pauseSubstrateFederatedIsolatedDevnetOwnedMiningSubmissionV1 as pauseOwned,
  revalidateSubstrateFederatedIsolatedDevnetMiningPauseObservationV1 as revalidateOwned,
  captureSubstrateFederatedIsolatedDevnetCheckpointMiningPolicyV1 as capturePolicy,
  deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1 as deriveTip,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

function fixture() {
  return {
    watermark: { height: 21, headerId: 'ab'.repeat(32) },
    primarySnapshot: { network: 'devnet' as const, fullHeight: 22, indexedHeight: 22, headerIdHex: 'cd'.repeat(32) },
    witnessSnapshot: { network: 'devnet' as const, fullHeight: 22, indexedHeight: 22, headerIdHex: 'cd'.repeat(32) },
    primaryHeaderIdsAtWatermark: ['ab'.repeat(32)],
    witnessHeaderIdsAtWatermark: ['ab'.repeat(32)],
  };
}

describe('owned mining pause indexed watermark', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts an indexed common descendant with exact watermark ancestry on both nodes', () => {
    expect(() => assertIndexed(fixture())).not.toThrow();
  });

  it('rejects a consistent old tip at H-1, then accepts H with exact ancestry', () => {
    const value = fixture();
    for (const snapshot of [value.primarySnapshot, value.witnessSnapshot]) {
      snapshot.fullHeight = 20;
      snapshot.indexedHeight = 20;
      snapshot.headerIdHex = 'ef'.repeat(32);
    }
    expect(() => assertIndexed(value)).toThrow(/has not reached/);
    for (const snapshot of [value.primarySnapshot, value.witnessSnapshot]) {
      snapshot.fullHeight = 21;
      snapshot.indexedHeight = 21;
      snapshot.headerIdHex = value.watermark.headerId;
    }
    expect(() => assertIndexed(value)).not.toThrow();
  });

  it('rejects a tip at H whose ID contradicts the singular watermark ancestry', () => {
    const value = fixture();
    for (const snapshot of [value.primarySnapshot, value.witnessSnapshot]) {
      snapshot.fullHeight = snapshot.indexedHeight = value.watermark.height;
    }
    expect(() => assertIndexed(value)).toThrow(/contradicts/);
  });

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'rejects %s index lag independently', key => {
      const value = fixture();
      value[key].indexedHeight = 21;
      expect(() => assertIndexed(value)).toThrow(/has not reached/);
    },
  );

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'rejects %s index ahead independently', key => {
      const value = fixture();
      value[key].indexedHeight = 23;
      expect(() => assertIndexed(value)).toThrow(/has not reached/);
    },
  );

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'rejects %s height identity drift independently', key => {
      const value = fixture();
      value[key].fullHeight = value[key].indexedHeight = 23;
      expect(() => assertIndexed(value)).toThrow(/do not share/);
    },
  );

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'rejects %s header identity drift independently', key => {
      const value = fixture();
      value[key].headerIdHex = 'ee'.repeat(32);
      expect(() => assertIndexed(value)).toThrow(/do not share/);
    },
  );

  it.each(['primarySnapshot', 'witnessSnapshot'] as const)(
    'rejects %s network drift independently', key => {
      const value = fixture();
      Object.assign(value[key], { network: 'testnet' });
      expect(() => assertIndexed(value)).toThrow(/has not reached/);
    },
  );

  it.each([null, { height: 0, headerId: 'ab'.repeat(32) },
    { height: 21.5, headerId: 'ab'.repeat(32) },
    { height: 2_147_483_648, headerId: 'ab'.repeat(32) },
    { height: 21, headerId: 'AB'.repeat(32) },
    { height: 21, headerId: 'ab'.repeat(31) }])(
    'rejects absent or malformed applied watermark %#', watermark => {
      expect(() => assertIndexed({ ...fixture(), watermark })).toThrow(/watermark/);
    },
  );

  it.each(['primaryHeaderIdsAtWatermark', 'witnessHeaderIdsAtWatermark'] as const)(
    'rejects %s missing ancestry independently', key => {
      const value = fixture();
      value[key] = [];
      expect(() => assertIndexed(value)).toThrow(/not canonical/);
    },
  );

  it.each(['primaryHeaderIdsAtWatermark', 'witnessHeaderIdsAtWatermark'] as const)(
    'rejects %s alternative ancestry independently', key => {
      const value = fixture();
      value[key] = ['ee'.repeat(32)];
      expect(() => assertIndexed(value)).toThrow(/not canonical/);
    },
  );

  it.each(['primaryHeaderIdsAtWatermark', 'witnessHeaderIdsAtWatermark'] as const)(
    'rejects %s ambiguous ancestry independently', key => {
      const value = fixture();
      value[key] = ['ab'.repeat(32), 'ee'.repeat(32)];
      expect(() => assertIndexed(value)).toThrow(/not canonical/);
    },
  );

  it.each([9, -1, 22.5, NaN, Infinity, 2_147_483_648])(
    'rejects invalid common indexed height %s', fullHeight => {
      const value = fixture();
      for (const snapshot of [value.primarySnapshot, value.witnessSnapshot]) {
        snapshot.fullHeight = snapshot.indexedHeight = fullHeight;
      }
      expect(() => assertIndexed(value)).toThrow(/has not reached/);
    },
  );

  it('does not treat copied target or receipt fields as process authority', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not run'));
    const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052', primaryMining: true as const, witnessReadOnly: true as const });
    await expect(pauseOwned(target)).rejects.toThrow(/not owned/);
    const observation = Object.freeze({ pauseReceipt: Object.freeze({
      schema: 'e2s.owned-mining-submission-pause.v1' as const,
      operationId: '11'.repeat(32), submissionPaused: true as const,
      maximumBlockHeight: null, latestAppliedBlock: null,
    }), snapshot: fixture().primarySnapshot });
    await expect(revalidateOwned(target, observation)).rejects.toThrow(/not owned/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('immutable checkpoint mining ceiling', () => {
  it('keeps the omitted policy legacy result and freezes a captured ceiling', () => {
    expect(deriveTip(11)).toBe(12);
    const policy = { minimumTipHeight: 151, maximumBlockHeight: 162 };
    const captured = capturePolicy(policy);
    policy.minimumTipHeight = 180;
    policy.maximumBlockHeight = 181;
    expect(captured).toEqual({ minimumTipHeight: 151, maximumBlockHeight: 162 });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(deriveTip(150, captured.minimumTipHeight, captured.maximumBlockHeight)).toBe(151);
  });

  it('accepts E-2 and rejects a prior or minimum requirement beyond it', () => {
    expect(deriveTip(161, 162, 162)).toBe(162);
    expect(() => deriveTip(162, undefined, 162)).toThrow(/exceeds/);
    expect(() => deriveTip(150, 163, 162)).toThrow(/exceeds/);
  });

  it.each([-0, -1, 162.5, NaN, Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'refuses malformed ceiling %s before use', maximumBlockHeight => {
      expect(() => capturePolicy({ maximumBlockHeight })).toThrow(/policy/);
      expect(() => deriveTip(150, undefined, maximumBlockHeight)).toThrow(/maximum block/);
    },
  );

  it.each([undefined, null, '162', true])('refuses present non-number ceiling %s', maximumBlockHeight => {
    expect(() => capturePolicy({ maximumBlockHeight } as never)).toThrow(/policy/);
  });

  it('refuses accessors without executing them', () => {
    let effects = 0;
    const policy = Object.defineProperty({}, 'maximumBlockHeight', {
      enumerable: true, get() { effects += 1; return 162; },
    });
    expect(() => capturePolicy(policy)).toThrow(/policy/);
    expect(effects).toBe(0);
  });

  it('refuses a proxy or inherited ceiling without inspecting it', () => {
    let effects = 0;
    const proxy = new Proxy({}, { getPrototypeOf() { effects += 1; return Object.prototype; },
      ownKeys() { effects += 1; return []; } });
    expect(() => capturePolicy(proxy)).toThrow(/policy/);
    expect(effects).toBe(0);
    expect(() => capturePolicy(Object.create({ maximumBlockHeight: 162 }))).toThrow(/policy/);
  });

  it('refuses extra, symbolic and non-enumerable policy keys', () => {
    for (const policy of [{ maximumBlockHeight: 162, extra: true },
      { maximumBlockHeight: 162, [Symbol('extra')]: true },
      Object.defineProperty({}, 'maximumBlockHeight', { value: 162 })]) {
      expect(() => capturePolicy(policy)).toThrow(/policy/);
    }
  });
});
