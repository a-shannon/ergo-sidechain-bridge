# Sharded Settlement Lanes — Design Note

> **Status**: Design proposal for the next scaling step after batch settlement.
> **Audience**: Bridge engineers and eUTXO protocol designers.

---

## 1. The Singleton Bottleneck

Today, the bridge has three critical singleton boxes:

| Box | Purpose | Contention |
|---|---|---|
| **SPVTracker** | Anchored sidechain block entries | 1 update per TX |
| **DUP** | Replay-protection AVL tree | 1 insert per TX (batch: up to 20) |
| **MCL / Unlock** | Liquidity vault | 1 spend per TX |

Every settlement TX must consume and recreate these singletons. Two settlement TXs cannot run in parallel because they compete for the same UTXO inputs.

**In EVM terms**: imagine a single global `mapping(bytes32 => bool)` that every withdrawal must write to. All withdrawals are serialized through that one contract.

---

## 2. How Batching Helps

Batch settlement (Spike 11) amortizes the singleton bottleneck:

| Metric | Single claim | Batch 10 |
|---|---|---|
| DUP TX updates | 1 | 1 (with 10 keys) |
| Unlock TX spends | 1 | 1 (with 10 payouts) |
| L1 transactions | 1 per user | 1 per batch |
| Throughput | ~1 settlement/block | ~10 settlements/block |

But batching alone has limits:

- **Hard cap**: 10 claims per unlock TX (4KB box limit for claim cores in context extensions).
- **Serialization**: Even at batch 10, only one same-TX aggregate settlement can advance the global tracker/DUP path at a time because those singleton inputs are consumed atomically.
- **Latency**: Accumulating a full batch adds delay for the first arrival.

---

## 3. Why Batching Alone Is Not Enough

At 10 claims per batch and ~2 minutes per Ergo block, the bridge can process ~5 settlements per minute. That is fine for a testnet PoC but inadequate for:

- Multiple concurrent sidechain operators.
- High-frequency asset bridging.
- Multi-asset bridges (each asset has its own withdrawal flow).

To go further, we need **independent lanes** — multiple DUP shards and liquidity boxes that can be consumed independently. Full L1 parallelism also requires the tracker update to be decoupled, pre-ingested, or sharded because the current same-TX path still consumes the global SPVTracker singleton.

---

## 4. DUP Shard Formula

### Design

Split the single DUP AVL tree into `N` independent shards:

```
dupShard = blake2b256(burnTxId) % N
```

Each shard is an independent box with:
- Its own singleton NFT (`DUP_SHARD_0_NFT`, `DUP_SHARD_1_NFT`, ...) minted into the box.
- Its own AVL+ tree and digest (R5).
- Its own counter (R4) and committee key (R6).
- The same `DoubleUnlockPreventionAggregateBatch.es` compiled ErgoTree (assuming the same committee config). The DUP contract does NOT hardcode its own NFT ID — it preserves `SELF.tokens(0)`. Shard identity comes from which NFT was minted into the box.

### Why blake2b?

- Deterministic: given a `burnTxId`, any observer computes the same shard.
- Uniform: blake2b output is uniformly distributed modulo N for practical key sets.
- No coordination: the relayer does not need to "assign" shards — the hash decides.

### Contract change

The DUP batch contract can be reused for each shard with the same compiled ErgoTree (given the same committee). Each shard is distinguished by its minted singleton NFT, not by a compile-time constant in the DUP contract.

However, shard membership must still be enforced by the settlement path. Deterministic off-chain routing is not a security boundary. The **unlock contract** (not the DUP contract) must verify that `burnTxId` belongs to the DUP shard being updated. The per-lane compile-time NFT limitation applies to `MainChainAggregateUnlockBatch.es`, which hardcodes `DUP_NFT_ID_PLACEHOLDER`.

### Hardcoded DUP NFT limitation

The current `MainChainAggregateUnlockBatch.es` hardcodes one `DUP_NFT_ID_PLACEHOLDER` at compile time. A single deployed batch unlock contract can only authenticate one specific DUP shard NFT.

The minimal spike proves input disjointness at the **planner level** only. A live sharded settlement requires either:

1. **One `MainChainAggregateUnlockBatch` deployment per lane**, each compiled with that lane's DUP NFT ID, or
2. **A new sharded unlock contract** that accepts a fixed set of shard NFTs and verifies the routed shard on-chain.

This is documented as a prerequisite for live sharded settlement, not a blocker for the offline planning spike.

---

## 5. Liquidity Lane Strategies

### Strategy A: Amount-bucketed lanes

```
liquidityLane = amountBucket(pegOutAmount)
```

| Lane | Range | Use case |
|---|---|---|
| Lane 0 | < 10 ERG | Small withdrawals |
| Lane 1 | 10–100 ERG | Medium withdrawals |
| Lane 2 | > 100 ERG | Large withdrawals |

**Pro**: prevents small withdrawals from blocking large ones.
**Con**: fragmented liquidity — Lane 2 might be empty while Lane 0 overflows.

### Strategy B: Operator-assigned lanes

```
liquidityLane = operatorId
```

Each relayer operator manages its own liquidity box. Operators can specialize in different assets or amounts.

**Pro**: clean isolation, natural multi-operator support.
**Con**: requires operator coordination for rebalancing.

### Strategy C: Round-robin lanes

```
liquidityLane = sequenceNumber % K
```

Simplest option. The relayer cycles through `K` liquidity boxes.

**Pro**: zero fragmentation risk.
**Con**: requires a global sequence counter, which reintroduces some coordination.

### Implemented first spike: Lockstep lanes by burn hash

The minimal spike uses **lockstep lane assignment** — a single formula drives both DUP and liquidity routing:

```
settlementLane = blake2b256(burnTxId) % N
dupShard       = settlementLane
liquidityLane  = settlementLane
```

- Lane 0 = DUP shard 0 + liquidity box 0
- Lane 1 = DUP shard 1 + liquidity box 1

This guarantees that any two lane plans are pairwise independent (only the global SPVTracker is shared). It proves clean lane isolation without composite routing.

### Future policy options

Composite routing (e.g. `shard × amountBucket`) creates plans that can share either the DUP or the liquidity input. These require a more sophisticated overlap model:

- **Amount-bucketed lanes** (Strategy A): useful for isolating small vs large payouts, but fragments liquidity.
- **Operator-assigned lanes** (Strategy B): natural for multi-operator bridges.
- **Round-robin lanes** (Strategy C): simplest, but requires a coordination counter.
- **Multi-asset lanes**: each asset type gets its own lane.

None of these are implemented in the first spike.

---

## 6. Invariants

### Global invariants (must hold across all shards and lanes)

1. **No burn ID is ever processed twice.** Each burn ID maps to exactly one DUP shard via the hash formula, and the on-chain settlement path must reject claims routed to the wrong shard. Without that on-chain shard check, a malicious relayer could submit the same burn ID to a different shard.

2. **Total locked ≥ total unlocked.** Across all liquidity lanes, the sum of locked ERG must always be ≥ the sum of unlocked ERG. Each lane tracks its own balance independently.

3. **Tracker consistency.** The current SPVTracker singleton remains global. If a settlement TX also updates the tracker, the tracker is still a serialization point. Parallel DUP/liquidity lanes become full parallel settlement lanes only after tracker ingest is decoupled from payout, pre-ingested as read-only state, or sharded.

### Per-shard invariants

4. **DUP shard isolation.** A settlement TX for shard `i` only touches `DUP_SHARD_i`. It must not consume or reference `DUP_SHARD_j` for any `j ≠ i`.

5. **Liquidity lane isolation.** A settlement TX for lane `k` only spends liquidity from lane `k`.

---

## 7. Failure Modes

### 7.1 Duplicate burn across wrong shard

**Scenario**: A malicious relayer submits the same `burnTxId` to shard 1 instead of shard 0.

**Defense**: The unlock contract must verify that `blake2b256(burnTxId) % N == shardIndex` on-chain. This is a single `blake2b256` call + integer modulo. If the check fails, the script reduces to `false`.

**Implementation sketch**: Add a compile-time `SHARD_INDEX` constant to the contract and verify the hash prefix modulo `N`. The exact byte-to-integer decode must be validated in an ErgoScript spike before promotion:
```ergoscript
// Pseudo-code: validate exact byte decode before implementation.
val shardBytes = blake2b256(burnTxId).slice(0, 4)
val shardIndex = bytesToInt(shardBytes) % N
sigmaProp(shardIndex == SHARD_INDEX)
```

### 7.2 Liquidity fragmentation

**Scenario**: Lane 0 has 1000 ERG, Lane 1 has 0 ERG. A large withdrawal for Lane 1 cannot be processed.

**Mitigation**:
- The relayer monitors lane balances and triggers rebalancing TXs when asymmetry exceeds a threshold.
- Rebalancing is a permissioned TX (requires committee signature) that moves ERG between lanes without touching the DUP tree.

### 7.3 Unfair batch selection

**Scenario**: The relayer always fills shard 0's batch first, starving shard 1.

**Mitigation**:
- Round-robin batch scheduling: alternate between shards on each cycle.
- Or: process all shards independently after the relevant tracker entries have already been ingested. If the TX still consumes the global tracker, shard TXs must be sequenced or the tracker must be sharded.

### 7.4 Reorg and pending-state recovery

**Scenario**: A settlement TX is confirmed, but the Ergo chain reorgs and the DUP box reverts.

**Defense**: Standard re-scan logic — the relayer re-reads the current DUP box ID via `byTokenId` and rebuilds the AVL tree from history. The shard formula is deterministic, so the same burn IDs will land in the same shards after recovery.

---

## 8. Minimal Next Spike: Two DUP Shards, Two Liquidity Boxes

### Goal

Demonstrate that two settlement lanes can be **planned** with disjoint DUP and liquidity boxes, while explicitly identifying the global SPVTracker as the remaining shared input in the current same-TX design.

### Setup

| Component | Count | Identity |
|---|---|---|
| SPVTracker | 1 (global) | `TRACKER_NFT` |
| DUP shard 0 | 1 | `DUP_SHARD_0_NFT` |
| DUP shard 1 | 1 | `DUP_SHARD_1_NFT` |
| Liquidity lane 0 | 1 | `UNLOCK_LANE_0` box |
| Liquidity lane 1 | 1 | `UNLOCK_LANE_1` box |

### Spike procedure

1. Generate 10 test burn IDs covering both shards.
2. Assign each to a settlement lane via `blake2b256(burnId) % 2`.
3. Build `ShardedSettlementPlan` for lane 0 (its assigned burn IDs + DUP shard 0 + liquidity box 0).
4. Build `ShardedSettlementPlan` for lane 1 (its assigned burn IDs + DUP shard 1 + liquidity box 1).
5. Verify that DUP and liquidity inputs are pairwise disjoint across all plan pairs.
6. Reject any active-lane plan where two lanes resolve to the same DUP shard box or the same liquidity box.
7. Report SPVTracker as the only pairwise-shared input.
8. Print both planner shapes side by side with input/output counts.
9. Document the follow-up needed for fully disjoint L1 settlement: pre-ingested tracker DataInput mode or tracker sharding.
10. Document the follow-up needed for live sharded settlement: per-lane unlock contract deployments (one per DUP NFT).

### Expected result

```
Shard 0:  INPUTS(tracker, dup0, lane0)  →  OUTPUTS(tracker', dup0', payouts, fee)
Shard 1:  INPUTS(tracker, dup1, lane1)  →  OUTPUTS(tracker', dup1', payouts, fee)
Overlap:  tracker only (1 shared input — requires sequencing or tracker sharding)
```

The tracker overlap is expected. This proves DUP and liquidity lane independence, not full same-block parallel settlement yet. Full parallel L1 settlement requires either:

- tracker entries ingested before payout so settlement TXs read tracker state instead of consuming it;
- tracker sharding; or
- a sequenced tracker update followed by lane-local payout transactions.

### Offline showcase script

Run:

```powershell
cd relayer
npm run showcase:lanes
```

The script uses synthetic box IDs and no node calls. It demonstrates the lane routing rule, prints the two lane input sets, and reports that DUP/liquidity inputs are disjoint while SPVTracker remains the expected shared input. The planner fails closed if active lanes reuse a DUP shard box or liquidity box.

### Timeline estimate

- Contract changes: small. DUP batch can be reused per shard, but settlement must add an on-chain shard membership check.
- Relayer changes: shard routing logic + parallel plan builder.
- Testing: 2-shard offline evaluation + optional live testnet validation.
- Estimated effort: 1 focused session.

---

## Summary

| Step | What it proves | Status |
|---|---|---|
| Single claim | Basic correctness | ✅ Done |
| Batch 10 | Amortized settlement | ✅ Done (Spike 11) |
| 2 DUP shards + 2 lanes | eUTXO parallelism | Planner + invariant tests |
| N shards + tracker sharding | Full horizontal scaling | Future phase |
