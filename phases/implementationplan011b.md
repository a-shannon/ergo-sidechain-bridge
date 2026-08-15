# Phase 011b - Showcase & Parallelization Demo

> **Date**: 2026-05-09
> **Status**: Ready for execution
> **Audience**: EVM/Substrate developers evaluating Ergo as a sidechain settlement layer.

## Objective

Turn the bridge PoC into a developer-facing showcase that makes an EVM team think:

> "I can keep my Solidity/Substrate app layer, and this repository gives me the Ergo settlement machinery."

This phase is not about production throughput or expensive infrastructure. It is about clear, repeatable demonstrations of:

- batch settlement
- eUTXO parallelization
- AVL proof objects
- subblock-ready UX assumptions
- open-source packaging for EVM teams

Roadmap boundary: Phase 011b is developer evidence and bounded fallback/demo
work. It should not become the production trustless architecture. The
production trust path is Phase 011 / Gate 5 burn proof acceptance; the
long-term high-throughput path may be STARK aggregate settlement if EIP-45
native verification lands.

## Non-Goals

- Do not claim Base-level performance.
- Do not claim the bridge is fully trustless before Phase 011.
- Do not add production validator/sequencer infrastructure.
- Do not reset or use the node wallet.
- Do not stage `.env`, SQLite, deployed local state, or private keys.
- Do not treat AVL sharded lanes as the final high-throughput architecture if native STARK verification becomes available soon.

## Strategic Future Track: STARK / EIP-45 Aggregate Settlement

> **Status**: Deferred from Phase 011b execution, but important enough to preserve in the roadmap.

The current AVL / ErgoScript batch path is the working path today. It demonstrates the concrete eUTXO settlement model:

- batch exits,
- AVL replay protection,
- explicit liquidity boxes,
- context-extension proof passing,
- future sharded DUP/liquidity lanes.

Its current per-lane cap is around 10 exits per settlement transaction because the unlock contract verifies each exit inline and the ErgoTree approaches the practical contract-size ceiling. Ergo output fanout is not the limiting factor.

If native STARK verification / EIP-45 becomes available in the near term, the preferred long-term high-throughput design should likely shift toward a STARK aggregate settlement engine:

- one public STARK proof validates a large batch of exits,
- privacy remains optional rather than mandatory,
- the proof checks burn inclusion/finality, no replay, replay-root update, and payout-list correctness,
- Ergo's large output fanout can then be used directly for many payout outputs,
- the bridge validity layer gains a stronger post-quantum-friendly story.

This means Phase 011b should still complete the live AVL batch demo and the minimal 2-lane spike, but should avoid overbuilding lane complexity beyond what is needed to demonstrate eUTXO parallelism. Stop after lane-local DUP/liquidity routing and clear benchmark evidence are demonstrated. The lanes path remains the current working fallback and showcase; STARK / EIP-45 is the next-generation scale path if protocol support lands quickly.

## Deliverables

### 1. Developer Walkthrough

Create a developer-facing walkthrough:

`docs/sidechain-on-ergo-in-one-afternoon.md`

It should be written for Solidity/Substrate developers and avoid assuming ErgoScript background.

Required sections:

1. What you already know from EVM.
2. What Ergo adds.
3. Local prerequisites.
4. Start Ergo node and Frontier sidechain.
5. Deploy Ergo + EVM contracts.
6. Peg-in: ERG to sERG.
7. Peg-out: sERG to ERG.
8. Batch settlement.
9. Inspect the proof objects.
10. Troubleshooting.

Every Ergo concept should be translated:

| Ergo concept | EVM-facing translation |
|--------------|------------------------|
| box | explicit state cell |
| register | typed storage slot |
| DataInput | authenticated read-only state |
| context extension | proof calldata |
| AVL digest | committed map root |
| singleton NFT | state-machine identity |

### 2. Benchmark Script

Add:

`relayer/src/scripts/showcase-benchmark.ts`

The script should run without submitting live funds by default. Prefer local builders and existing spike/eval helpers. If live mode is added, it must require an explicit flag.

Minimum output:

| Metric | Required |
|--------|----------|
| batch size | 1 / 2 / 5 / 10 |
| proof sizes | tracker proof, DUP lookup proof, DUP insert proof |
| TX shape | input count, output count, context var count |
| build time | ms |
| eval time | if local sigma-rust evaluation is available |
| notes | bottleneck / limit |

The script should make the batch benefit obvious:

- single claim = simple baseline
- batch 10 = amortized settlement
- two-lane simulated plan = eUTXO parallelism story

### 3. Proof Object Inspector

Add:

`relayer/src/scripts/inspect-proof-objects.ts`

It should print a readable description of:

- DUP key
- tracker key
- event root
- anchor height bytes
- AVL digest
- lookup proof length
- insert proof length
- packed claim core layout

This is for EVM developers who understand calldata and Merkle proofs but not Ergo context extensions.

### 4. Sharded Settlement Design Note

Add:

`docs/sharded-settlement-lanes.md`

Required content:

- Why singleton boxes bottleneck.
- How batching helps.
- Why batching alone is not enough.
- Proposed lane formulas:
  - `dupShard = blake2b(burnId) % N`
  - `liquidityLane = amount bucket / operator / asset`
- Invariants per lane.
- Failure modes:
  - duplicate burn across wrong shard
  - liquidity fragmentation
  - unfair batch selection
  - reorg and pending-state recovery
- Minimal next spike:
  - two DUP shards
  - two liquidity boxes
  - prove DUP/liquidity inputs can be lane-local
  - explicitly report the current global SPVTracker as the remaining serialization point
  - identify the follow-up required for fully disjoint settlement: pre-ingested tracker DataInput mode or tracker sharding

### 5. README Entry Points

Update `README.md` so the first-time EVM developer path is visible:

- `docs/evm-developer-showcase.md`
- `docs/sidechain-on-ergo-in-one-afternoon.md`
- `docs/sharded-settlement-lanes.md`
- benchmark command
- proof inspector command

### 6. Package Scripts

Add package scripts in `relayer/package.json`:

```json
"showcase:benchmark": "tsx src/scripts/showcase-benchmark.ts",
"showcase:proofs": "tsx src/scripts/inspect-proof-objects.ts"
```

If the scripts require a running node, document that. Prefer an offline/default mode.

## Verification

Run:

```powershell
cd "<workspace>\ergo-sidechain-bridge\relayer"
npm.cmd run contracts:check
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run
npm.cmd run showcase:benchmark
npm.cmd run showcase:proofs
```

Acceptance criteria:

- TypeScript clean.
- Existing tests still pass.
- Showcase scripts run in offline/default mode.
- Docs explain benefits without making release-readiness or full-trustlessness claims.
- No local secrets or SQLite files staged.

## Review Checklist

- Does an EVM developer understand what remains familiar?
- Does the doc explain what Ergo adds without jargon-first phrasing?
- Does the benchmark demonstrate batching and parallel lanes clearly?
- Does the proof inspector explain context-extension data like calldata/proof data?
- Are limitations stated honestly?
- Are all scripts safe by default?
