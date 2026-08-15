import { describe, expect, it } from 'vitest';

import { deriveAnchoredTrackerIngest, findStableAnchorHeight, validatePersistedAnchor } from './aggregate-anchor.js';
import { deriveAggregateBurnEventRoot } from './aggregate-settlement-tx.js';
import type { ErgoExtensionField } from './ergo-client.js';
import type { ParsedPegOut } from './sidechain-client.js';

const sidechainIdHex = '11'.repeat(32);
const recipientTreeHex = '0008cd02' + '44'.repeat(32);

function pegOut(overrides: Partial<ParsedPegOut> = {}): ParsedPegOut {
  return {
    user: '0x0000000000000000000000000000000000000001',
    amount: 1_000_000n,
    ergoRecipientAddress: recipientTreeHex,
    sidechainTxHash: '55'.repeat(32),
    sidechainBlockNumber: 1234,
    ...overrides,
  };
}

describe('aggregate anchor derivation', () => {
  it('derives SPV tracker ingest fields from a verified 0x0401 anchor', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    const entry = await deriveAnchoredTrackerIngest({
      pegOut: burn,
      sidechainIdHex,
      ergoAnchorHeight: 330000,
      deps: {
        addressToTree: async () => { throw new Error('raw tree should not call addressToTree'); },
        getSidechainBlockHash: async (height) => {
          expect(height).toBe(1234);
          return '0x' + '22'.repeat(32);
        },
        getSidechainExtensionFieldsAtHeight: async (height) => {
          expect(height).toBe(330000);
          return [{ key: '0401', value: eventRoot, height, headerId: 'aa'.repeat(32) }];
        },
      },
    });

    expect(entry).toMatchObject({
      sidechainIdHex,
      sidechainHeight: 1234n,
      sidechainHeaderHashHex: '22'.repeat(32),
      bridgeEventRootHex: eventRoot,
      ergoAnchorHeight: 330000,
    });
  });

  it('rejects anchors whose 0x0401 value does not match the peg-out root', async () => {
    await expect(deriveAnchoredTrackerIngest({
      pegOut: pegOut(),
      sidechainIdHex,
      ergoAnchorHeight: 330001,
      deps: {
        addressToTree: async () => recipientTreeHex,
        getSidechainBlockHash: async () => '22'.repeat(32),
        getSidechainExtensionFieldsAtHeight: async (height) => [
          { key: '0401', value: '99'.repeat(32), height, headerId: 'aa'.repeat(32) },
        ],
      },
    })).rejects.toThrow(/no 0x0401 field matching bridgeEventRoot/);
  });

  it('rejects unsafe Ergo anchor heights before reading providers', async () => {
    await expect(deriveAnchoredTrackerIngest({
      pegOut: pegOut(),
      sidechainIdHex,
      ergoAnchorHeight: Number.MAX_SAFE_INTEGER + 1,
      deps: {
        addressToTree: async () => { throw new Error('addressToTree should not be called'); },
        getSidechainBlockHash: async () => { throw new Error('getSidechainBlockHash should not be called'); },
        getSidechainExtensionFieldsAtHeight: async () => {
          throw new Error('getSidechainExtensionFieldsAtHeight should not be called');
        },
      },
    })).rejects.toThrow(/ergoAnchorHeight must be a non-negative safe integer/);
  });

  it('resolves address recipients before deriving the event root', async () => {
    const burn = pegOut({ ergoRecipientAddress: '9fakeAddress' });
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    const entry = await deriveAnchoredTrackerIngest({
      pegOut: burn,
      sidechainIdHex,
      ergoAnchorHeight: 330002,
      deps: {
        addressToTree: async (address) => {
          expect(address).toBe('9fakeAddress');
          return recipientTreeHex;
        },
        getSidechainBlockHash: async () => '33'.repeat(32),
        getSidechainExtensionFieldsAtHeight: async (height) => [
          { key: '0401', value: eventRoot, height, headerId: 'aa'.repeat(32) },
        ],
      },
    });

    expect(entry.bridgeEventRootHex).toBe(eventRoot);
    expect(entry.sidechainHeaderHashHex).toBe('33'.repeat(32));
  });
});

// ─── findStableAnchorHeight tests ────────────────────────────────

describe('findStableAnchorHeight', () => {
  function makeFieldsForHeights(
    eventRoot: string,
    matchingHeights: Set<number>,
  ): (height: number) => Promise<ErgoExtensionField[]> {
    return async (height: number) => {
      if (matchingHeights.has(height)) {
        return [{ key: '0401', value: eventRoot, height, headerId: 'aa'.repeat(32) }];
      }
      return [];
    };
  }

  function baseDeps(eventRoot: string, matchingHeights: Set<number>) {
    return {
      addressToTree: async () => { throw new Error('should use raw tree'); },
      getSidechainBlockHash: async () => '22'.repeat(32),
      getSidechainExtensionFieldsAtHeight: makeFieldsForHeights(eventRoot, matchingHeights),
    };
  }

  it('returns the FIRST (lowest) matching block when multiple blocks contain the same root', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    // Blocks 100, 101, 102, 103, 104 all contain the matching root
    const matchingHeights = new Set([100, 101, 102, 103, 104]);

    const height = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 104,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    expect(height).toBe(100); // first (lowest) wins
  });

  it('returns deterministic results across repeated calls even as maxHeight grows', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    // Simulate devnet: blocks 100+ all have the same root
    const matchingHeights = new Set(
      Array.from({ length: 200 }, (_, i) => 100 + i),
    );

    // First call with window [100, 150]
    const height1 = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 150,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    // Second call with expanded window [100, 200] (new blocks mined)
    const height2 = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 200,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    // Third call with even larger window [100, 299]
    const height3 = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 299,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    // All three calls must return the same anchor height
    expect(height1).toBe(100);
    expect(height2).toBe(100);
    expect(height3).toBe(100);
  });

  it('returns null when no block in the window contains the matching root', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    // Root appears at height 200, but window is [100, 150]
    const matchingHeights = new Set([200]);

    const height = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 150,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    expect(height).toBeNull();
  });

  it('handles a single matching block in the window', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    const matchingHeights = new Set([125]);

    const height = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 150,
      deps: baseDeps(eventRoot, matchingHeights),
    });

    expect(height).toBe(125);
  });

  it('ignores blocks that throw when reading extension fields', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    let callCount = 0;
    const height = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100,
      maxHeight: 104,
      deps: {
        addressToTree: async () => { throw new Error('should use raw tree'); },
        getSidechainBlockHash: async () => '22'.repeat(32),
        getSidechainExtensionFieldsAtHeight: async (h: number) => {
          callCount++;
          if (h < 103) throw new Error('node RPC error');
          return [{ key: '0401', value: eventRoot, height: h, headerId: 'aa'.repeat(32) }];
        },
      },
    });

    expect(height).toBe(103); // first non-throwing match
    expect(callCount).toBe(4); // scanned 100-103; stopped at first match
  });

  it('returns null when minHeight > maxHeight', async () => {
    const burn = pegOut();

    const height = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 200,
      maxHeight: 100,
      deps: baseDeps('ff'.repeat(32), new Set()),
    });

    expect(height).toBeNull();
  });

  it('rejects unsafe scan bounds before reading providers', async () => {
    const burn = pegOut();

    await expect(findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 100.5,
      maxHeight: 200,
      deps: {
        addressToTree: async () => { throw new Error('addressToTree should not be called'); },
        getSidechainBlockHash: async () => { throw new Error('getSidechainBlockHash should not be called'); },
        getSidechainExtensionFieldsAtHeight: async () => {
          throw new Error('getSidechainExtensionFieldsAtHeight should not be called');
        },
      },
    })).rejects.toThrow(/minHeight must be a non-negative safe integer/);
  });

  it('REGRESSION: returns different anchor when minHeight slides past the original anchor', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    // Root appears at blocks 100, 200, 300
    const matchingHeights = new Set([100, 200, 300]);

    // First call with window [50, 250]: finds block 100
    const height1 = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 50,
      maxHeight: 250,
      deps: baseDeps(eventRoot, matchingHeights),
    });
    expect(height1).toBe(100);

    // Window slides forward: [150, 350]. Block 100 is no longer in the window.
    // Without persistence, the anchor jumps to 200 -- THIS IS THE BUG.
    const height2 = await findStableAnchorHeight({
      pegOut: burn,
      sidechainIdHex,
      minHeight: 150,
      maxHeight: 350,
      deps: baseDeps(eventRoot, matchingHeights),
    });
    expect(height2).toBe(200); // Different from height1!

    // This proves that without external persistence, the anchor is NOT stable
    // across lookback window advancement. The daemon must persist the first
    // resolved anchor height in peg_out_events.ergo_anchor_height.
    expect(height1).not.toBe(height2);
  });
});

// --- validatePersistedAnchor tests -----------------------------------------

describe('validatePersistedAnchor', () => {
  it('returns "invalid" for unsafe persisted anchor heights before reading providers', async () => {
    const burn = pegOut();

    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: Number.MAX_SAFE_INTEGER + 1,
      deps: {
        addressToTree: async () => { throw new Error('addressToTree should not be called'); },
        getSidechainExtensionFieldsAtHeight: async () => {
          throw new Error('getSidechainExtensionFieldsAtHeight should not be called');
        },
      },
    });

    expect(result).toBe('invalid');
  });

  it('returns "unavailable" when getSidechainExtensionFieldsAtHeight throws (RPC failure)', async () => {
    const burn = pegOut();

    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: 50000,
      deps: {
        addressToTree: async () => { throw new Error('raw tree'); },
        getSidechainExtensionFieldsAtHeight: async () => {
          throw new Error('Ergo node read timeout');
        },
      },
    });

    // Transient failure -- anchor must NOT be cleared
    expect(result).toBe('unavailable');
  });

  it('returns "unavailable" when addressToTree throws (dependency failure)', async () => {
    const burn = pegOut({ ergoRecipientAddress: '9fakeAddr' });

    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: 50000,
      deps: {
        addressToTree: async () => { throw new Error('node unreachable'); },
        getSidechainExtensionFieldsAtHeight: async () => {
          throw new Error('should not be called');
        },
      },
    });

    // addressToTree failure is transient -- anchor preserved
    expect(result).toBe('unavailable');
  });

  it('returns "valid" when extension fields are read and root is present', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: 50000,
      deps: {
        addressToTree: async () => { throw new Error('raw tree'); },
        getSidechainExtensionFieldsAtHeight: async (height) => {
          expect(height).toBe(50000);
          return [{ key: '0401', value: eventRoot, height, headerId: 'aa'.repeat(32) }];
        },
      },
    });

    expect(result).toBe('valid');
  });

  it('returns "invalid" ONLY when extension fields are read successfully and root is absent', async () => {
    const burn = pegOut();

    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: 50000,
      deps: {
        addressToTree: async () => { throw new Error('raw tree'); },
        getSidechainExtensionFieldsAtHeight: async (height) => {
          // Fields read successfully -- but no matching root
          return [{ key: '0401', value: '99'.repeat(32), height, headerId: 'bb'.repeat(32) }];
        },
      },
    });

    // Root is positively absent -- THIS is the only case where clearing is safe
    expect(result).toBe('invalid');
  });

  it('does NOT involve getSidechainBlockHash at all', async () => {
    const burn = pegOut();
    const eventRoot = deriveAggregateBurnEventRoot(
      burn.sidechainTxHash,
      recipientTreeHex,
      burn.amount,
    );

    // validatePersistedAnchor deps type does not include getSidechainBlockHash.
    // A sidechain provider failure should never influence anchor validation.
    const result = await validatePersistedAnchor({
      pegOut: burn,
      ergoAnchorHeight: 50000,
      deps: {
        addressToTree: async () => { throw new Error('raw tree'); },
        getSidechainExtensionFieldsAtHeight: async (height) => [
          { key: '0401', value: eventRoot, height, headerId: 'aa'.repeat(32) },
        ],
      },
    });

    expect(result).toBe('valid');
  });
});
