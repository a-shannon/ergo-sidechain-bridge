/**
 * Tests for the sharded lanes spike.
 *
 * Acceptance criteria from phase011b-sharded-lanes-handoff.md:
 * P1: 10 claims route deterministically to 2 shards, covering both shards
 * P2: Two lane plans have disjoint DUP box IDs
 * P3: Two lane plans have disjoint liquidity box IDs
 * P4: Pairwise overlap between any two plans is SPVTracker only
 * P5: Same burn ID always maps to same shard (deterministic)
 * P6, P7, P8: Each plan has 3 planner inputs (tracker + dup + unlock)
 * P9: estimatedOutputCount matches claims.length + 3
 * N1: 0 claims → error
 * N2: Invalid burn ID hex → error
 */

import { describe, it, expect } from 'vitest';
import { assignDupShard, assignLiquidityLane, DEFAULT_LIQUIDITY_THRESHOLD_NANO_ERG } from './shard-router.js';
import {
  buildShardedPlans,
  analyzeOverlap,
  type BuildShardedPlansInput,
} from './sharded-plan-builder.js';
import type { AggregateSettlementClaim } from './aggregate-settlement-builder.js';
import {
  assertContextExtensionSafe,
  ContextExtensionDivergenceError,
  MAX_SAFE_CONTEXT_EXTENSION_VARS,
} from './context-extension-guard.js';

// ─── Fixtures ──────────────────────────────────────────────────────

/** 10 deterministic fake burn TX IDs (64 hex chars each) */
const BURN_IDS: string[] = Array.from({ length: 10 }, (_, i) =>
  Buffer.from(
    Uint8Array.from({ length: 32 }, (_, j) => (i * 37 + j * 13) & 0xff),
  ).toString('hex'),
);

// Pre-verify fixture covers both shards (fail-fast if not)
const BURN_ID_SHARDS = BURN_IDS.map((id) => assignDupShard(id, 2));
if (new Set(BURN_ID_SHARDS).size !== 2) {
  throw new Error(
    'BURN_IDS fixture does not cover both shards — adjust seed. ' +
    `Distribution: ${JSON.stringify(BURN_ID_SHARDS)}`,
  );
}

const TRACKER_BOX_ID = 'aaaa'.repeat(16); // 64 hex chars
const DUP_LANE_0_BOX = 'bb00'.repeat(16);
const DUP_LANE_1_BOX = 'bb11'.repeat(16);
const LIQ_LANE_0_BOX = 'cc00'.repeat(16);
const LIQ_LANE_1_BOX = 'cc11'.repeat(16);

function makeClaim(burnId: string, amountNanoErg: bigint): {
  claim: AggregateSettlementClaim;
  burnTxIdHex: string;
  payoutNanoErg: bigint;
} {
  return {
    claim: {
      pegOut: {
        user: '0x' + 'ab'.repeat(20),
        amount: amountNanoErg,
        ergoRecipientAddress: '3Wy' + 'x'.repeat(48),
        sidechainTxHash: '0x' + burnId,
        sidechainBlockNumber: 100,
      },
      trackerIdentity: {
        sidechainIdHex: '11'.repeat(32),
        sidechainHeaderHashHex: 'ff'.repeat(32),
        sidechainHeight: 100,
      },
    },
    burnTxIdHex: burnId,
    payoutNanoErg: amountNanoErg,
  };
}

function makeDefaultInput(): BuildShardedPlansInput {
  // All amounts uniform — amount does not affect routing in the minimal spike
  const claims = BURN_IDS.map((id) => makeClaim(id, 10_000_000_000n));
  return {
    claims,
    shardCount: 2,
    shardBoxIds: new Map([
      [0, DUP_LANE_0_BOX],
      [1, DUP_LANE_1_BOX],
    ]),
    laneBoxIds: new Map([
      [0, LIQ_LANE_0_BOX],
      [1, LIQ_LANE_1_BOX],
    ]),
    trackerBoxId: TRACKER_BOX_ID,
  };
}

// ─── Shard Router Tests ────────────────────────────────────────────

describe('assignDupShard', () => {
  it('P1: routes 10 claims deterministically to both shards', () => {
    const assignments = BURN_IDS.map((id) => assignDupShard(id, 2));
    // Every assignment is 0 or 1
    expect(assignments.every((a) => a === 0 || a === 1)).toBe(true);
    // Must cover both shards
    const unique = new Set(assignments);
    expect(unique.size).toBe(2);
  });

  it('P5: same burn ID always maps to the same shard', () => {
    const id = BURN_IDS[0];
    const first = assignDupShard(id, 2);
    for (let i = 0; i < 100; i++) {
      expect(assignDupShard(id, 2)).toBe(first);
    }
  });

  it('handles 0x-prefixed burn IDs', () => {
    const id = BURN_IDS[0];
    expect(assignDupShard('0x' + id, 2)).toBe(assignDupShard(id, 2));
  });

  it('N2: rejects invalid burn ID hex (short)', () => {
    expect(() => assignDupShard('abcdef', 2)).toThrow(/expected 64 hex chars/);
  });

  it('N2: rejects invalid burn ID hex (non-hex chars)', () => {
    expect(() => assignDupShard('zz' + '00'.repeat(31), 2)).toThrow(
      /expected 64 hex chars/,
    );
  });

  it('rejects non-positive shard count', () => {
    expect(() => assignDupShard(BURN_IDS[0], 0)).toThrow(/positive integer/);
    expect(() => assignDupShard(BURN_IDS[0], -1)).toThrow(/positive integer/);
    expect(() => assignDupShard(BURN_IDS[0], 1.5)).toThrow(/positive integer/);
  });
});

describe('assignLiquidityLane (future policy layer)', () => {
  it('routes small amounts to lane 0', () => {
    expect(assignLiquidityLane(10_000_000_000n)).toBe(0);
    expect(assignLiquidityLane(DEFAULT_LIQUIDITY_THRESHOLD_NANO_ERG)).toBe(0);
  });

  it('routes large amounts to lane 1', () => {
    expect(assignLiquidityLane(DEFAULT_LIQUIDITY_THRESHOLD_NANO_ERG + 1n)).toBe(1);
    expect(assignLiquidityLane(100_000_000_000n)).toBe(1);
  });

  it('respects custom threshold', () => {
    expect(assignLiquidityLane(5n, 10n)).toBe(0);
    expect(assignLiquidityLane(11n, 10n)).toBe(1);
  });
});

// ─── Sharded Plan Builder Tests ────────────────────────────────────

describe('buildShardedPlans', () => {
  it('produces exactly 2 plans for 2-shard routing (P2, P3)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    expect(plans).toHaveLength(2);
  });

  it('lane 0 uses DUP0 + liquidity0, lane 1 uses DUP1 + liquidity1', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    const lane0 = plans.find((p) => p.settlementLane === 0);
    const lane1 = plans.find((p) => p.settlementLane === 1);
    expect(lane0).toBeDefined();
    expect(lane1).toBeDefined();

    expect(lane0!.dupBoxId).toBe(DUP_LANE_0_BOX);
    expect(lane0!.unlockBoxId).toBe(LIQ_LANE_0_BOX);
    expect(lane1!.dupBoxId).toBe(DUP_LANE_1_BOX);
    expect(lane1!.unlockBoxId).toBe(LIQ_LANE_1_BOX);
  });

  it('DUP inputs are pairwise disjoint (P2)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    const dupIds = plans.map((p) => p.dupBoxId);
    expect(new Set(dupIds).size).toBe(dupIds.length);
  });

  it('liquidity inputs are pairwise disjoint (P3)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    const liqIds = plans.map((p) => p.unlockBoxId);
    expect(new Set(liqIds).size).toBe(liqIds.length);
  });

  it('pairwise overlap between lane 0 and lane 1 is SPVTracker only (P4)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    expect(plans).toHaveLength(2);
    const overlap = analyzeOverlap(plans);
    expect(overlap.pairwiseSharedInputs).toEqual([TRACKER_BOX_ID]);
    expect(overlap.dupInputsDisjoint).toBe(true);
    expect(overlap.liquidityInputsDisjoint).toBe(true);
  });

  it('each plan has exactly 3 planner inputs: tracker + dup + unlock (P6, P7, P8)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    for (const plan of plans) {
      expect(plan.inputBoxIds).toHaveLength(3);
      expect(plan.inputBoxIds[0]).toBe(TRACKER_BOX_ID);
      expect(plan.inputBoxIds).toContain(plan.dupBoxId);
      expect(plan.inputBoxIds).toContain(plan.unlockBoxId);
    }
  });

  it('estimatedOutputCount matches claims.length + 3 (P9)', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    for (const plan of plans) {
      // Assert the builder computed this correctly:
      // tracker' + dup' + N payouts + fee = claims.length + 3
      expect(plan.estimatedOutputCount).toBe(plan.claims.length + 3);
      expect(plan.estimatedOutputCount).toBeGreaterThanOrEqual(4); // minimum 1 claim
    }
  });

  it('total claims across all plans equals input claims', () => {
    const input = makeDefaultInput();
    const plans = buildShardedPlans(input);
    const totalClaims = plans.reduce((sum, p) => sum + p.claims.length, 0);
    expect(totalClaims).toBe(input.claims.length);
  });

  it('routing is deterministic across multiple calls', () => {
    const input = makeDefaultInput();
    const plans1 = buildShardedPlans(input);
    const plans2 = buildShardedPlans(input);
    expect(plans1.map((p) => p.laneId)).toEqual(plans2.map((p) => p.laneId));
    for (let i = 0; i < plans1.length; i++) {
      expect(plans1[i].claims.map((c) => c.burnTxIdHex)).toEqual(
        plans2[i].claims.map((c) => c.burnTxIdHex),
      );
    }
  });

  it('N1: throws on empty claims', () => {
    const input = makeDefaultInput();
    input.claims = [];
    expect(() => buildShardedPlans(input)).toThrow(/empty/);
  });

  it('throws when lane box ID is missing (DUP)', () => {
    const input = makeDefaultInput();
    input.shardBoxIds.delete(1);
    expect(() => buildShardedPlans(input)).toThrow(/Missing DUP shard/);
  });

  it('throws when lane box ID is missing (liquidity)', () => {
    const input = makeDefaultInput();
    input.laneBoxIds.delete(1);
    expect(() => buildShardedPlans(input)).toThrow(/Missing liquidity/);
  });

  it('rejects duplicate DUP box IDs across active lanes', () => {
    const input = makeDefaultInput();
    input.shardBoxIds.set(1, DUP_LANE_0_BOX);
    expect(() => buildShardedPlans(input)).toThrow(/Duplicate DUP shard box/);
  });

  it('rejects duplicate liquidity box IDs across active lanes', () => {
    const input = makeDefaultInput();
    input.laneBoxIds.set(1, LIQ_LANE_0_BOX);
    expect(() => buildShardedPlans(input)).toThrow(/Duplicate liquidity box/);
  });
});

// ─── Overlap Analysis Tests ────────────────────────────────────────

describe('analyzeOverlap', () => {
  it('single plan has no overlap', () => {
    // Route only claims that go to shard 0
    const shard0Id = BURN_IDS.find((id) => assignDupShard(id, 2) === 0)!;
    const plans = buildShardedPlans({
      ...makeDefaultInput(),
      claims: [makeClaim(shard0Id, 10_000_000_000n)],
    });
    expect(plans).toHaveLength(1);
    const overlap = analyzeOverlap(plans);
    expect(overlap.dupInputsDisjoint).toBe(true);
    expect(overlap.liquidityInputsDisjoint).toBe(true);
    expect(overlap.pairwiseSharedInputs).toEqual([]);
  });

  it('two-plan overlap is exactly SPVTracker', () => {
    const plans = buildShardedPlans(makeDefaultInput());
    expect(plans).toHaveLength(2);
    const overlap = analyzeOverlap(plans);
    expect(overlap.pairwiseSharedInputs).toEqual([TRACKER_BOX_ID]);
    expect(overlap.dupInputsDisjoint).toBe(true);
    expect(overlap.liquidityInputsDisjoint).toBe(true);
  });
});

// ─── Var Count Classification (formula-only, no real TX signing) ───

/**
 * These tests classify each settlement input's Var count against the
 * context extension guard threshold using mock extension maps.
 *
 * They verify formulas and guard classification only — no real
 * transactions are built, signed, or validated.
 *
 * Purpose:
 * - Before upstream fix: documents which paths are blocked and why.
 * - After upstream fix: guard threshold can be raised or removed, and
 *   these tests confirm the Var counts haven't regressed.
 */

describe('Var count classification (formula-only, no signing)', () => {
  // Helper: build a mock input with a specific number of context extension Vars
  function mockInputWithVars(count: number): { extension: Record<string, string> } {
    const ext: Record<string, string> = {};
    for (let i = 0; i < count; i++) ext[String(i)] = '0e00';
    return { extension: ext };
  }

  describe('V1 single-claim path — expected Var counts', () => {
    it('tracker (0 Vars, no ingest): allowed by guard', () => {
      const inputs = [mockInputWithVars(0)]; // tracker with no ingest
      expect(() => assertContextExtensionSafe(inputs, 'v1-tracker-no-ingest')).not.toThrow();
    });

    it('tracker (4 Vars, with ingest): allowed by guard', () => {
      const inputs = [mockInputWithVars(4)]; // tracker with ingest
      expect(() => assertContextExtensionSafe(inputs, 'v1-tracker-with-ingest')).not.toThrow();
    });

    it('DUP (3 Vars): allowed by guard', () => {
      const inputs = [mockInputWithVars(3)];
      expect(() => assertContextExtensionSafe(inputs, 'v1-dup')).not.toThrow();
    });

    it('unlock (8 Vars): BLOCKED by guard', () => {
      const inputs = [mockInputWithVars(8)]; // V1 unlock: 8 Vars
      expect(() => assertContextExtensionSafe(inputs, 'v1-unlock')).toThrow(
        ContextExtensionDivergenceError,
      );
    });

    it('V1 aggregate TX shape [tracker=0, DUP=3, unlock=8]: BLOCKED at input[2]', () => {
      const inputs = [
        mockInputWithVars(0),  // input[0]: tracker (no ingest)
        mockInputWithVars(3),  // input[1]: DUP
        mockInputWithVars(8),  // input[2]: unlock (8 Vars)
      ];
      try {
        assertContextExtensionSafe(inputs, 'v1-aggregate');
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as ContextExtensionDivergenceError;
        expect(e.offenders).toHaveLength(1);
        expect(e.offenders[0]).toMatchObject({ inputIndex: 2, varCount: 8 });
      }
    });
  });

  describe('batch settlement path — expected Var count formulas', () => {
    // Batch DUP formula: 2 + 2N (Var0=count, Var1=insertProof, Vars 2..1+N=keys, Vars 22..21+N=lookupProofs)
    // Batch unlock formula: 2 + 3N (Var0=count, Var1=dupInsertProof, Vars 2..1+N=claimCore, 12..11+N=trackerProof, 22..21+N=dupLookupProof)

    const batchDupVars = (n: number) => 2 + 2 * n;
    const batchUnlockVars = (n: number) => 2 + 3 * n;

    it('batch DUP formula: 2 + 2N', () => {
      expect(batchDupVars(1)).toBe(4);
      expect(batchDupVars(2)).toBe(6);
      expect(batchDupVars(5)).toBe(12);
      expect(batchDupVars(10)).toBe(22);
    });

    it('batch unlock formula: 2 + 3N', () => {
      expect(batchUnlockVars(1)).toBe(5);
      expect(batchUnlockVars(2)).toBe(8);
      expect(batchUnlockVars(5)).toBe(17);
      expect(batchUnlockVars(10)).toBe(32);
    });

    it('N=1 batch: DUP (4 Vars) allowed, unlock (5 Vars) BLOCKED', () => {
      const dupInput = mockInputWithVars(batchDupVars(1)); // 4 Vars
      const unlockInput = mockInputWithVars(batchUnlockVars(1)); // 5 Vars

      expect(() => assertContextExtensionSafe([dupInput], 'batch-N1-dup')).not.toThrow();
      expect(() => assertContextExtensionSafe([unlockInput], 'batch-N1-unlock')).toThrow(
        ContextExtensionDivergenceError,
      );
    });

    it('N=2 batch TX shape: BLOCKED at both DUP and unlock', () => {
      const inputs = [
        mockInputWithVars(0),                   // tracker (no ingest)
        mockInputWithVars(batchDupVars(2)),      // DUP: 6 Vars
        mockInputWithVars(batchUnlockVars(2)),   // unlock: 8 Vars
      ];
      try {
        assertContextExtensionSafe(inputs, 'batch-N2');
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as ContextExtensionDivergenceError;
        expect(e.offenders).toHaveLength(2);
        expect(e.offenders[0]).toMatchObject({ inputIndex: 1, varCount: 6 });
        expect(e.offenders[1]).toMatchObject({ inputIndex: 2, varCount: 8 });
      }
    });

    it('N=10 batch TX shape: BLOCKED at both DUP (22) and unlock (32)', () => {
      const inputs = [
        mockInputWithVars(4),                    // tracker (with ingest)
        mockInputWithVars(batchDupVars(10)),      // DUP: 22 Vars
        mockInputWithVars(batchUnlockVars(10)),   // unlock: 32 Vars
      ];
      try {
        assertContextExtensionSafe(inputs, 'batch-N10');
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as ContextExtensionDivergenceError;
        expect(e.offenders).toHaveLength(2);
        expect(e.offenders[0]).toMatchObject({ inputIndex: 1, varCount: 22 });
        expect(e.offenders[1]).toMatchObject({ inputIndex: 2, varCount: 32 });
      }
    });
  });

  describe('sharded lane Var count classification', () => {
    it('each lane plan inherits the batch Var count formulas', () => {
      // Each lane produces a TX with the same batch shape.
      // Since batch N≥2 is always blocked, sharded lanes are also blocked.
      const plans = buildShardedPlans(makeDefaultInput());
      for (const plan of plans) {
        const n = plan.claims.length;
        // Verify the formulas produce Var counts > threshold for N≥2
        if (n >= 2) {
          expect(2 + 2 * n).toBeGreaterThan(MAX_SAFE_CONTEXT_EXTENSION_VARS);
          expect(2 + 3 * n).toBeGreaterThan(MAX_SAFE_CONTEXT_EXTENSION_VARS);
        }
      }
    });

    it('1-claim lane formula: DUP (4 Vars) passes threshold, unlock (5 Vars) exceeds', () => {
      // Even a single-claim batch lane produces 5 Vars on unlock
      const dupVars = 2 + 2 * 1;   // 4
      const unlockVars = 2 + 3 * 1; // 5
      expect(dupVars).toBe(MAX_SAFE_CONTEXT_EXTENSION_VARS);
      expect(unlockVars).toBeGreaterThan(MAX_SAFE_CONTEXT_EXTENSION_VARS);
    });
  });
});
