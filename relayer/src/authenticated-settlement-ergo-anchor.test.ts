import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  assertAuthenticatedSettlementStableErgoViewProvenance,
  assertCanonicalAuthenticatedSettlementErgoAnchor,
  observeAuthenticatedSettlementStableErgoView,
} from './authenticated-settlement-ergo-anchor.js';

const anchorId = 'ab'.repeat(32);
const candidate = {
  anchorHeaderHeight: 100,
  anchorHeaderId: anchorId,
  creationHeight: 110,
};
const trackerBoxId = '11'.repeat(32);
const dupBoxId = '22'.repeat(32);
const vaultBoxId = '33'.repeat(32);
const tipHeaderId = 'ef'.repeat(32);
const replacementTipHeaderId = 'cd'.repeat(32);

function box(boxId: string, value = 2_000_000) {
  return {
    boxId,
    value,
    ergoTree: '10010100d17300',
    assets: [],
    additionalRegisters: {},
    creationHeight: 90,
    transactionId: '44'.repeat(32),
    index: 0,
  };
}

const prepared = {
  trackerBox: box(trackerBoxId),
  authenticatedDupBox: box(dupBoxId),
  unlockBox: box(vaultBoxId),
  eip12Tx: {},
};
const stableCandidate = {
  ...candidate,
  candidateId: '55'.repeat(32),
  trackerBoxId,
  dupInputBoxId: dupBoxId,
  vaultBoxId,
  unsignedTxDigest: createHash('sha256').update('{}').digest('hex'),
};

function ergo(currentHeight = 120, currentAnchorId = anchorId) {
  return {
    getCurrentHeight: vi.fn(async () => currentHeight),
    getBlockHeaderHash: vi.fn(async () => currentAnchorId),
  };
}

function stableErgo(input: {
  heights?: number[];
  currentAnchorId?: string;
  tipHeaderIds?: string[];
  boxes?: Map<string, ReturnType<typeof box>>;
} = {}) {
  const heights = [...(input.heights ?? [120, 120])];
  const tipHeaderIds = [...(input.tipHeaderIds ?? [tipHeaderId, tipHeaderId])];
  const boxes = input.boxes ?? new Map([
    [trackerBoxId, prepared.trackerBox],
    [dupBoxId, prepared.authenticatedDupBox],
    [vaultBoxId, prepared.unlockBox],
  ]);
  return {
    getCurrentHeight: vi.fn(async () => heights.shift() ?? 120),
    getBlockHeaderHash: vi.fn(async (height: number) =>
      height === candidate.anchorHeaderHeight
        ? (input.currentAnchorId ?? anchorId)
        : (tipHeaderIds.shift() ?? tipHeaderId)),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => boxes.get(boxId) ?? null),
  };
}

describe('authenticated settlement live Ergo anchor', () => {
  it('accepts the exact canonical anchor at sufficient live depth', async () => {
    await expect(assertCanonicalAuthenticatedSettlementErgoAnchor(
      ergo(),
      candidate,
      10,
    )).resolves.toBeUndefined();
  });

  it('rejects a stale anchor header independently of depth', async () => {
    await expect(assertCanonicalAuthenticatedSettlementErgoAnchor(
      ergo(120, 'cd'.repeat(32)),
      candidate,
      10,
    )).rejects.toThrow(/no longer on the canonical chain/i);
  });

  it('rejects rollback below the journaled creation height', async () => {
    await expect(assertCanonicalAuthenticatedSettlementErgoAnchor(
      ergo(109),
      candidate,
      5,
    )).rejects.toThrow(/precedes.*creation height/i);
  });

  it('rejects insufficient current anchor depth and invalid thresholds', async () => {
    await expect(assertCanonicalAuthenticatedSettlementErgoAnchor(
      ergo(109),
      { ...candidate, creationHeight: 105 },
      10,
    )).rejects.toThrow(/required confirmation depth/i);
    await expect(assertCanonicalAuthenticatedSettlementErgoAnchor(
      ergo(),
      candidate,
      0,
    )).rejects.toThrow(/confirmations must be positive/i);
  });

  it('binds the exact anchor and three checked inputs under one stable Ergo view', async () => {
    const view = await observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo() as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    });

    expect(view).toEqual(expect.objectContaining({
      candidateId: stableCandidate.candidateId,
      observedTipHeight: 120,
      observedTipHeaderIdHex: tipHeaderId,
      anchorHeaderIdHex: anchorId,
      trackerBoxIdHex: trackerBoxId,
      duplicatePreventionBoxIdHex: dupBoxId,
      vaultBoxIdHex: vaultBoxId,
    }));
    expect(() => assertAuthenticatedSettlementStableErgoViewProvenance(view))
      .not.toThrow();
    expect(() => assertAuthenticatedSettlementStableErgoViewProvenance(
      structuredClone(view),
    )).toThrow(/provenance is missing/i);
  });

  it('rejects a moving tip, stale anchor, missing input, or changed input content', async () => {
    await expect(observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo({ heights: [120, 121] }) as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    })).rejects.toThrow(/canonical view changed/i);

    await expect(observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo({
        tipHeaderIds: [tipHeaderId, replacementTipHeaderId],
      }) as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    })).rejects.toThrow(/canonical view changed/i);

    await expect(observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo({ currentAnchorId: 'cd'.repeat(32) }) as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    })).rejects.toThrow(/no longer on the canonical chain/i);

    const missingInput = new Map([
      [trackerBoxId, prepared.trackerBox],
      [vaultBoxId, prepared.unlockBox],
    ]);
    await expect(observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo({ boxes: missingInput }) as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    })).rejects.toThrow(/input is spent or unavailable/i);

    const changedInput = new Map([
      [trackerBoxId, prepared.trackerBox],
      [dupBoxId, prepared.authenticatedDupBox],
      [vaultBoxId, box(vaultBoxId, 2_000_001)],
    ]);
    await expect(observeAuthenticatedSettlementStableErgoView({
      ergo: stableErgo({ boxes: changedInput }) as any,
      candidate: stableCandidate as any,
      prepared: prepared as any,
      minimumConfirmations: 10,
    })).rejects.toThrow(/input content does not match/i);
  });
});
