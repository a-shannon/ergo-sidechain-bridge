# Phase 011b — Sharded Settlement Lanes Spike Handoff

> **For**: Next coding session
> **Scope**: Minimal 2-lane spike, NOT production sharding

---

## 1. Objective

Prove that claims routed to different settlement lanes can be assembled into **independent TX plans** that share zero inputs except the global SPVTracker.

This is an offline planning exercise. Live testnet execution is optional and should be separately approved.

This spike is a **current-path eUTXO scaling demo**, not the final word on high-throughput bridge settlement. If native STARK verification / EIP-45 becomes available soon, the long-term design should likely shift toward one public aggregate validity proof for many exits, followed by Ergo's large output fanout. Keep this 2-lane spike intentionally minimal: prove lane-local DUP/liquidity routing, then stop.

---

## 2. Scope

### 2.1 Routing model (lockstep lanes)

The minimal spike uses **lockstep lane assignment**: each claim's settlement lane is determined entirely by its burn TX ID hash. The same lane index drives both DUP shard selection and liquidity box selection:

```typescript
// Minimal spike: one formula, one lane index
settlementLane = blake2b256(burnTxId).readUInt32BE(0) % 2
dupShard       = settlementLane
liquidityLane  = settlementLane
```

This means:
- **Lane 0** = DUP shard 0 + liquidity box 0
- **Lane 1** = DUP shard 1 + liquidity box 1
- Any two lane plans are pairwise independent (only SPVTracker shared)

> **Future policy layers** (not used in this spike):
> - Amount-bucketed liquidity lanes (small vs large payouts)
> - Operator-assigned lanes
> - Multi-asset lanes
>
> These create composite `shard × bucket` routing that can share either
> the DUP or the liquidity box across plans, breaking the clean
> independence guarantee. They require a more complex overlap model.

### 2.2 Components

| Component | Count | Identity |
|---|---|---|
| DUP shard 0 | 1 box | `DUP_SHARD_0_NFT` |
| DUP shard 1 | 1 box | `DUP_SHARD_1_NFT` |
| Liquidity lane 0 | 1 box | `UNLOCK_LANE_0` (lockstep with DUP shard 0) |
| Liquidity lane 1 | 1 box | `UNLOCK_LANE_1` (lockstep with DUP shard 1) |
| SPVTracker | 1 (existing, global) | `TRACKER_NFT` |

### 2.3 Contract changes

**None for the spike.**

> **Important limitation**: The current `MainChainAggregateUnlockBatch.es` hardcodes
> one `DUP_NFT_ID_PLACEHOLDER`. A single deployed batch unlock contract can only
> authenticate one specific DUP shard NFT.
>
> This spike proves input disjointness at the **planner level** only.
> A live sharded settlement requires either:
> 1. One `MainChainAggregateUnlockBatch` deployment per lane, each compiled
>    with that lane's DUP NFT ID, or
> 2. A new sharded unlock contract that accepts a fixed set of shard NFTs
>    and verifies the routed shard on-chain.
>
> This is NOT implemented in this spike and is documented as a prerequisite
> for live sharded settlement.

---

## 3. Implementation Steps

### Step 1: Shard router module

Create `relayer/src/shard-router.ts`:

```typescript
export function assignDupShard(burnTxIdHex: string, shardCount: number): number {
  const hash = blake2b256(Buffer.from(burnTxIdHex, 'hex'));
  return hash.readUInt32BE(0) % shardCount;
}

// Future policy layer — not wired into buildShardedPlans():
export function assignLiquidityLane(payoutNanoErg: bigint): number {
  return payoutNanoErg <= 50_000_000_000n ? 0 : 1;
}
```

### Step 2: Parallel plan builder

Create `relayer/src/sharded-plan-builder.ts`:

```typescript
export interface ShardedSettlementPlan {
  settlementLane: number;  // = dupShard = liquidityLane
  claims: RoutedClaim[];
  trackerBoxId: string;    // shared across all plans
  dupBoxId: string;         // lane-specific
  unlockBoxId: string;      // lane-specific
  inputBoxIds: string[];
}

export function buildShardedPlans(input: BuildShardedPlansInput): ShardedSettlementPlan[]
```

### Step 3: Offline test suite

Create `relayer/src/shard-router.test.ts`:

| Test | Description |
|---|---|
| P1 | 10 claims route deterministically to both shards |
| P2 | Two lane plans have disjoint DUP box IDs |
| P3 | Two lane plans have disjoint liquidity box IDs |
| P4 | Pairwise overlap is SPVTracker only |
| P5 | Same burn ID always maps to same shard (deterministic) |
| N1 | 0 claims → error |
| N2 | Invalid burn ID hex → error |

### Step 4: Planner shape validation

Add to test suite:

| Test | Description |
|---|---|
| P6, P7, P8 | Each plan has exactly 3 planner inputs (tracker + dup + unlock) |
| P9 | Expected planner output count = N + 3 (tracker' + dup' + payouts + fee) |

> Note: P6–P9 validate planner-level shape expectations, not actual EIP-12
> transaction construction. Full TX assembly tests belong in a future
> integration phase.

### Step 5: Optional — live/eval spike

If separately approved:
1. Deploy 2 DUP shard boxes with separate NFTs
2. Deploy 2 liquidity lane boxes
3. Deploy 2 separate `MainChainAggregateUnlockBatch` instances (one per lane, each compiled with its lane's DUP NFT ID)
4. Route 4 test claims (2 per shard)
5. Build and sign both TXs
6. Submit sequentially (tracker serialization point)

---

## 4. Remaining Serialization Point

The current SPVTracker is **global**. Both shard settlement TXs must consume and recreate it. This means:

- Two sharded settlements in the same block require sequential submission (second TX uses the tracker successor from the first).
- Full parallel settlement (independent blocks) requires **tracker sharding** — a separate future phase.

This is expected and should be documented, not hidden.

---

## 5. Acceptance Criteria

| Criterion | Type |
|---|---|
| `shard-router.ts` passes P1–P5, N1–N2 | Offline test |
| `sharded-plan-builder.ts` passes P6–P9 (planner shape) | Planner test |
| `vitest run` still passes all existing tests | Regression |
| `tsc --noEmit` clean | Type check |
| Two plans printed side by side with `Overlap: tracker only` | Console output |
| Serialization point explicitly documented | Doc review |
| Hardcoded DUP NFT limitation documented | Doc review |
| No production daemon sharding without separate approval | Process |

---

## 6. Files to Read Before Starting

| File | Why |
|---|---|
| `docs/sharded-settlement-lanes.md` | Full design note with invariants and failure modes |
| `relayer/src/aggregate-settlement-builder.ts` | Current batch planning logic to extend |
| `relayer/src/aggregate-settlement-tx.ts` | TX assembly — same contract, different NFT |
| `relayer/src/scripts/showcase-lanes.ts` | Existing offline lane demo for reference |
| `phases/walkthrough025.md` | Live batch demo runbook (for context) |

---

## 7. Out of Scope

- Tracker sharding
- Production daemon routing changes
- Rebalancing between lanes
- Multi-asset bridges
- Operator-assigned lanes
- STARK / EIP-45 aggregate settlement design
- Privacy or Midday-style private exits
- LP economics
- Amount-bucketed composite lane routing (future policy layer)
