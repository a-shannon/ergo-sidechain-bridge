# Walkthrough 024 - Prototype Showcase Roadmap

> **Date**: 2026-05-09
> **Scope**: Strategic roadmap update after Spike 11 and batch daemon wiring.

## Goal

The bridge prototype should demonstrate that external EVM/Substrate teams can deploy sidechains that settle on Ergo while gaining advantages that are difficult to reproduce cleanly elsewhere.

This is not a production throughput target. The goal is to make the architecture, proof objects, contract patterns, and developer workflow concrete enough that teams familiar with Solidity/Substrate can see the path without first becoming ErgoScript/eUTXO experts.

Primary audience:

- Solidity application developers
- Substrate/Frontier runtime teams
- rollup / appchain / sidechain infrastructure teams
- bridge engineers who already understand Merkle roots, receipts, events, and settlement delays

The docs and demos should assume they are comfortable with EVM concepts but new to Ergo. Every Ergo-specific concept should be translated into an EVM mental model first, then shown in code.

## Core Message

Ergo can act as a proof-friendly settlement layer for sovereign sidechains:

- Substrate/Frontier keeps the application layer familiar to EVM developers.
- Ergo L1 holds liquidity, replay-protection state, tracker roots, and settlement contracts.
- eUTXO boxes make settlement state explicit and shardable.
- AVL proofs make large off-chain sets verifiable by compact on-chain checks.
- DataInputs and context extensions let contracts read authenticated state and proofs without storing everything in boxes.
- Subblocks can improve inclusion/failure feedback while ordering blocks remain the economic finality layer.

The developer-facing version:

> Keep your Solidity/Substrate application layer. Use Ergo as the settlement and proof layer. The open-source kit handles the eUTXO, AVL, singleton NFT, and transaction-building details for you.

## Advantages To Demonstrate

| Advantage | Why it matters | Prototype evidence |
|-----------|----------------|--------------------|
| EVM compatibility at the app layer | EVM teams can port existing Solidity applications to the sidechain | Frontier sidechain + ErgoBridge.sol |
| ErgoScript packaged behind patterns | EVM teams should not need to hand-author low-level ErgoScript for every integration | Contracts, builders, compile scripts, and walkthroughs |
| Batch settlement | L1 settlement can amortize many sidechain exits into one Ergo transaction | Spike 11 offline diagnostics; the unsafe legacy live transport is retired |
| eUTXO parallelization | Independent boxes can be processed independently instead of one global account bottleneck | Bounded sharded DUP/liquidity demo after the Gate 5 path |
| AVL proof-native state | Replay protection and SPV tracker state can scale as authenticated sets | DUP AVL, SPVTracker AVL, WASM prover |
| Subblock-ready UX | Users can receive fast feedback before conservative finality | Future subblock-aware monitoring and benchmark demo |
| Trust roadmap | Prototype can start with committee signing while the critical path moves to SPV relay / burn proofs once sidechain commitments are verifiable | Phase 010a plus Phases 008/009 feed Phase 011 |

## EVM Developer Messaging

The docs must make Ergo concepts feel familiar:

| EVM mental model | Ergo/eUTXO concept | Message |
|------------------|--------------------|---------|
| Contract storage | Box registers | Critical settlement state is explicit and inspectable |
| Contract identity | Singleton NFT | The state machine identity follows a token, not just an address |
| Calldata | Context extension | Proof data is passed per transaction, not permanently stored |
| Static call / read-only state | DataInput | Read authenticated state without consuming it |
| Mapping / Merkle root | AVL digest | Commit large off-chain sets and prove one fact on demand |
| Replay-protection mapping | DUP AVL tree | Mark burn IDs as spent with compact proofs |
| Batched withdrawals | Batch unlock TX | Pay many exits while updating replay protection once |
| Sharded contracts | Sharded boxes | Parallel settlement lanes are a first-class design path |

The "wow" moment is not that Ergo looks like EVM. It is that EVM teams can keep their app layer while outsourcing hard settlement-state machinery to an Ergo-native pattern library.

Developer packaging status:

- [`docs/evm-integration-checklist.md`](../docs/evm-integration-checklist.md) lists what an EVM/Substrate team should copy, configure, avoid changing first, and verify.
- The checklist also includes a glossary and state-flow diagram so teams can map Ergo boxes, registers, singleton NFTs, AVL roots, and context extensions back to concepts they already know.

## Honest Non-Goals

This prototype does not claim:

- Base-level liquidity.
- Base-level infra maturity.
- Full trustless SPV verification today.
- Production sequencer/validator throughput.
- Zero operational assumptions.

The point is stronger and narrower: prove that Ergo offers differentiated settlement primitives for sidechains, and package them so a Substrate/EVM team can reuse the design.

## Phase 011b - Showcase & Parallelization Demo

Add a dedicated follow-up phase before mainnet planning.

Canonical developer-facing document:

- [`docs/evm-developer-showcase.md`](../docs/evm-developer-showcase.md)

### 1. Subblock-Ready Monitoring

Build the relayer and dashboard assumptions around two layers of confirmation:

- Fast UX signal: subblock inclusion/failure when available.
- Economic finality: ordering-block depth for high-value settlement.

Deliverables:

- Config names that distinguish fast inclusion from finality depth.
- Metrics for first-seen, subblock-seen, ordering-block-confirmed, and final.
- Documentation explaining that subblocks improve responsiveness, not finality assumptions.

Status:

- [`docs/subblock-ready-finality-model.md`](../docs/subblock-ready-finality-model.md) defines the developer-facing model.
- `npm run showcase:finality` prints an offline timeline that separates pending, fast inclusion, ordering confirmation, and economic finality.
- The current script is intentionally illustrative; it does not depend on a live subblock API.

### 2. Parallelization Benchmarks

Benchmark and document:

- Single-claim aggregate settlement.
- Batch settlement with 2/5/10 claims.
- Multiple independent liquidity boxes.
- Proposed sharded DUP lanes.

Deliverables:

- A repeatable benchmark script.
- A table with latency, proof sizes, TX size, eval time, and max safe batch assumptions.
- A clear statement of bottlenecks: contract size, JIT cost, singleton contention, liquidity fragmentation.

### 3. Sharded Settlement Design

Design the next scaling step without overbuilding it:

- `DUP shard = blake2b(burnId) % N`
- `liquidity lane = amount bucket / asset / operator`
- optional tracker lanes for future high-throughput setups

Deliverables:

- Design note with invariants.
- One spike for 2 DUP shards and 2 liquidity boxes.
- Proof that DUP and liquidity inputs can be lane-local.
- Explicit note that the current same-TX path still shares SPVTracker; full L1 parallel settlement requires pre-ingested tracker entries, read-only tracker usage, or tracker sharding.

### 4. Developer-Facing Walkthrough

Create a "Sidechain on Ergo in one afternoon" walkthrough:

1. Start local Ergo node and Substrate/Frontier sidechain.
2. Deploy bridge contracts.
3. Lock ERG on Ergo.
4. Mint sERG on EVM.
5. Burn sERG on EVM.
6. Batch-settle ERG unlock on Ergo.
7. Inspect the Ergo contracts and proof objects.

The walkthrough should explain the Ergo-specific parts in EVM terms:

- box = explicit state cell
- DataInput = read-only authenticated state
- AVL digest = committed map root
- context extension = proof calldata
- singleton NFT = state-machine identity

The walkthrough must feel like a kit:

- one setup path
- one deploy path
- one peg-in path
- one peg-out path
- one batch settlement path
- one "inspect the proof/state" path
- one troubleshooting section for node, funding, and proof generation

Avoid writing it like an ErgoScript tutorial. It should say: "Here is the machinery we provide; here is the small surface you need to understand to operate or adapt it."

### 5. Demo Narrative

The final demo should compare three flows:

| Flow | What it proves |
|------|----------------|
| Single claim | Basic bridge correctness |
| Batch 10 claims | Amortized settlement |
| Parallel lanes | eUTXO scaling story |

### 6. Open-Source Packaging

Phase 011b should leave behind reusable assets, not just prose:

- a minimal `.env.example` for the showcase path
- a deterministic local demo script
- a benchmark script for single vs batch settlement
- a proof-object inspector script
- a finality model script for fast UX vs economic finality
- a glossary for EVM teams
- diagrams for box state transitions
- a "what to copy into your own sidechain" checklist

## Recommended Next Order

1. Finish only the Phase 010a minimum non-throwaway hardening needed to keep the prototype safe.
2. Advance Phase 008/009 sidechain consensus and `0x04` extension commitment prerequisites.
3. Advance Phase 011 / Gate 5 trustless burn verification: SPV relay, `bridge_event_root` / `burn_root`, on-chain proof acceptance, DUP binding, and stale-anchor/reorg rejection.
4. Keep Phase 011b showcase docs current with the trustless-burn direction, but do not expand them ahead of Gate 5 work.
5. Run the live batch demo only as bounded developer evidence.
6. Add sharded DUP/liquidity lanes only as a minimal fallback/demo spike.

This keeps the prototype strategically useful: the showcase demonstrates the current system, while the critical work proves Ergo can settle sidechain exits from cryptographic evidence.
