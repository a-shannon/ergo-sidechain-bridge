/**
 * Sharded Plan Builder — offline TX plan splitter for parallel eUTXO settlement.
 *
 * Takes a list of claims with routing metadata and builds independent
 * settlement plans per lane. Each plan has its own DUP shard AND its own
 * liquidity box, sharing only the global SPVTracker.
 *
 * Routing model (minimal spike):
 *   settlementLane = assignDupShard(burnTxId, shardCount)
 *   dupShard       = settlementLane
 *   liquidityLane  = settlementLane
 *
 * This guarantees exactly N independent plans (1 per shard), where pairwise
 * overlap is SPVTracker only. Amount-bucketed liquidity routing is documented
 * as a future policy layer but is NOT used in this spike — it would create
 * composite plans (shard × bucket) that share either the DUP or the liquidity
 * input, breaking the "only SPVTracker shared" independence claim.
 *
 * IMPORTANT — Hardcoded DUP NFT limitation:
 * This spike proves input disjointness at the PLANNER level only.
 * The current MainChainAggregateUnlockBatch.es hardcodes one DUP_NFT_ID.
 * A live sharded settlement requires either:
 *   1. One MainChainAggregateUnlockBatch deployment per lane (each compiled
 *      with that lane's DUP NFT ID), or
 *   2. A new sharded unlock contract that accepts a set of shard NFTs and
 *      verifies the routed shard on-chain.
 *
 * No production daemon changes, no live deployment.
 */

import { assignDupShard } from './shard-router.js';
import type { AggregateSettlementClaim } from './aggregate-settlement-builder.js';

/** A claim annotated with its settlement lane assignment */
export interface RoutedClaim {
  claim: AggregateSettlementClaim;
  burnTxIdHex: string;
  payoutNanoErg: bigint;
  /** Settlement lane = DUP shard = liquidity lane */
  settlementLane: number;
}

/** A settlement plan for one lane (one TX) */
export interface ShardedSettlementPlan {
  /** Lane identifier */
  laneId: string;
  /** Settlement lane index (= DUP shard = liquidity lane) */
  settlementLane: number;
  /** Claims assigned to this lane */
  claims: RoutedClaim[];
  /** SPVTracker box ID (shared across all plans) */
  trackerBoxId: string;
  /** DUP singleton box ID (lane-specific) */
  dupBoxId: string;
  /** Liquidity box ID (lane-specific) */
  unlockBoxId: string;
  /** All input box IDs for this plan's TX */
  inputBoxIds: string[];
  /** Estimated output count: tracker' + dup' + N payouts + fee */
  estimatedOutputCount: number;
}

/** Pairwise overlap analysis result */
export interface OverlapAnalysis {
  /** Box IDs shared across every pair of plans */
  pairwiseSharedInputs: string[];
  /** Whether DUP inputs are pairwise disjoint across all plans */
  dupInputsDisjoint: boolean;
  /** Whether liquidity inputs are pairwise disjoint across all plans */
  liquidityInputsDisjoint: boolean;
}

export interface BuildShardedPlansInput {
  /** All claims to route */
  claims: Array<{
    claim: AggregateSettlementClaim;
    burnTxIdHex: string;
    payoutNanoErg: bigint;
  }>;
  /** Number of settlement lanes (= number of DUP shards = number of liquidity pools) */
  shardCount: number;
  /** DUP singleton box ID per lane */
  shardBoxIds: Map<number, string>;
  /** Liquidity box ID per lane (must have the same keys as shardBoxIds) */
  laneBoxIds: Map<number, string>;
  /** Global SPVTracker box ID */
  trackerBoxId: string;
}

/**
 * Route claims to lanes and build independent settlement plans.
 *
 * Each lane gets its own DUP box and its own liquidity box.
 * Only the SPVTracker is shared across plans.
 *
 * @throws if claims is empty
 * @throws if a lane box ID is missing from the maps
 * @throws if two active lanes share the same DUP or liquidity box ID
 */
export function buildShardedPlans(input: BuildShardedPlansInput): ShardedSettlementPlan[] {
  if (input.claims.length === 0) {
    throw new Error('buildShardedPlans: claims array is empty');
  }

  // 1. Route each claim: settlementLane = dupShard = liquidityLane
  const routed: RoutedClaim[] = input.claims.map((c) => ({
    claim: c.claim,
    burnTxIdHex: c.burnTxIdHex,
    payoutNanoErg: c.payoutNanoErg,
    settlementLane: assignDupShard(c.burnTxIdHex, input.shardCount),
  }));

  // 2. Group by settlement lane
  const lanes = new Map<number, RoutedClaim[]>();
  for (const r of routed) {
    const existing = lanes.get(r.settlementLane);
    if (existing) {
      existing.push(r);
    } else {
      lanes.set(r.settlementLane, [r]);
    }
  }

  // 3. Build a plan per lane. Active lanes must have distinct eUTXO inputs
  // for both the DUP singleton and liquidity box; otherwise the planner would
  // only discover the unsafe overlap after constructing an unusable schedule.
  const plans: ShardedSettlementPlan[] = [];
  const activeDupBoxIds = new Map<string, number>();
  const activeLiquidityBoxIds = new Map<string, number>();
  const activeLanes = [...lanes.keys()].sort((a, b) => a - b);

  for (const lane of activeLanes) {
    const laneClaims = lanes.get(lane)!;
    const dupBoxId = input.shardBoxIds.get(lane);
    if (!dupBoxId) {
      throw new Error(`Missing DUP shard box for lane ${lane}`);
    }
    const previousDupLane = activeDupBoxIds.get(dupBoxId);
    if (previousDupLane !== undefined) {
      throw new Error(
        `Duplicate DUP shard box ${dupBoxId} for lanes ${previousDupLane} and ${lane}`,
      );
    }
    activeDupBoxIds.set(dupBoxId, lane);

    const unlockBoxId = input.laneBoxIds.get(lane);
    if (!unlockBoxId) {
      throw new Error(`Missing liquidity box for lane ${lane}`);
    }
    const previousLiquidityLane = activeLiquidityBoxIds.get(unlockBoxId);
    if (previousLiquidityLane !== undefined) {
      throw new Error(
        `Duplicate liquidity box ${unlockBoxId} for lanes ${previousLiquidityLane} and ${lane}`,
      );
    }
    activeLiquidityBoxIds.set(unlockBoxId, lane);

    plans.push({
      laneId: `lane${lane}`,
      settlementLane: lane,
      claims: laneClaims,
      trackerBoxId: input.trackerBoxId,
      dupBoxId,
      unlockBoxId,
      inputBoxIds: [input.trackerBoxId, dupBoxId, unlockBoxId],
      estimatedOutputCount: laneClaims.length + 3, // tracker' + dup' + payouts + fee
    });
  }

  return plans;
}

/**
 * Analyze pairwise input overlap between settlement plans.
 *
 * Checks every pair of plans, not just intersection-of-all.
 * Expected result for the minimal spike: only the SPVTracker is shared
 * between any two plans, and both DUP and liquidity are pairwise disjoint.
 */
export function analyzeOverlap(plans: ShardedSettlementPlan[]): OverlapAnalysis {
  if (plans.length < 2) {
    return {
      pairwiseSharedInputs: [],
      dupInputsDisjoint: true,
      liquidityInputsDisjoint: true,
    };
  }

  // Pairwise shared inputs: collect all box IDs that appear in ANY two plans
  const allPairwiseShared = new Set<string>();
  for (let i = 0; i < plans.length; i++) {
    const setI = new Set(plans[i].inputBoxIds);
    for (let j = i + 1; j < plans.length; j++) {
      for (const id of plans[j].inputBoxIds) {
        if (setI.has(id)) allPairwiseShared.add(id);
      }
    }
  }

  // Check DUP pairwise disjointness
  const dupIds = plans.map((p) => p.dupBoxId);
  const dupInputsDisjoint = new Set(dupIds).size === dupIds.length;

  // Check liquidity pairwise disjointness
  const liqIds = plans.map((p) => p.unlockBoxId);
  const liquidityInputsDisjoint = new Set(liqIds).size === liqIds.length;

  return {
    pairwiseSharedInputs: [...allPairwiseShared],
    dupInputsDisjoint,
    liquidityInputsDisjoint,
  };
}
