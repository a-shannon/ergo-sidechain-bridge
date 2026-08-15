# Claude Handoff - Phase 011b Showcase & Parallelization Demo

You are implementing Phase 011b in `ergo-sidechain-bridge`.

## Context

The bridge already has:

- full round-trip peg-in / peg-out
- aggregate settlement
- multi-claim batch settlement
- historical offline batch path; new legacy daemon signing and transport are retired
- local WASM signing
- AVL proof generation
- EVM/Frontier sidechain app layer

Recent commits:

- `76a5f44` - Spike 11 multi-claim aggregate settlement
- `4aabf42` - batch aggregate settlement daemon path
- `901cd42` - deterministic batch ordering and error classification

The next goal is not deeper protocol research. The next goal is to make this prototype impressive and understandable to EVM/Substrate developers.

## Read First

Read:

1. `phases/phase-index.md`
2. `phases/walkthrough024.md`
3. `docs/evm-developer-showcase.md`
4. `phases/implementationplan011b.md`
5. `relayer/src/aggregate-settlement-builder.ts`
6. `relayer/src/aggregate-settlement-tx.ts`
7. Historical `relayer/src/scripts/spikes/spike11-multi-claim-aggregate.ts`
   result; the broadcast-capable source is intentionally absent from the
   current checkout and remains recoverable only from Git history.
8. `relayer/package.json`

Do not read or print `.env`.

## Hard Rules

- Do not reset or use the node mnemonic.
- Do not use `/wallet/transaction/sign`.
- Do not stage `.env`, SQLite, deployed local state, node data, mnemonics, or private keys.
- Default scripts must be safe/offline when possible.
- Live modes must require explicit flags.
- Do not claim full trustlessness before Phase 011.
- Do not claim Base-level performance.

## Task

Implement Phase 011b deliverables:

### 1. Developer walkthrough

Create:

`docs/sidechain-on-ergo-in-one-afternoon.md`

Audience: Solidity/Substrate developers.

Must explain:

- what stays familiar from EVM
- what Ergo adds
- peg-in
- peg-out
- batch settlement
- proof object inspection
- troubleshooting

Translate Ergo concepts into EVM mental models:

- box = explicit state cell
- register = typed storage slot
- DataInput = authenticated read-only state
- context extension = proof calldata
- AVL digest = committed map root
- singleton NFT = state-machine identity

### 2. Benchmark script

Create:

`relayer/src/scripts/showcase-benchmark.ts`

Default mode must be offline/safe. It should use existing builders/proof helpers where possible and print a readable benchmark table for:

- batch size 1
- batch size 2
- batch size 5
- batch size 10
- simulated two-lane settlement story if feasible without live boxes

Minimum metrics:

- proof sizes
- context var count
- input/output count
- build/proof time in ms
- bottleneck notes

Add package script:

`"showcase:benchmark": "tsx src/scripts/showcase-benchmark.ts"`

### 3. Proof inspector

Create:

`relayer/src/scripts/inspect-proof-objects.ts`

Default mode must be offline/safe. It should print a readable explanation of the proof objects used by the bridge:

- DUP key
- tracker key
- event root
- anchor height bytes
- AVL digest
- proof lengths
- packed claim core layout
- mapping to "calldata/proof data" for EVM developers

Add package script:

`"showcase:proofs": "tsx src/scripts/inspect-proof-objects.ts"`

### 4. Sharded lanes design note

Create:

`docs/sharded-settlement-lanes.md`

Must cover:

- singleton bottlenecks
- batching
- why batching alone is not enough
- DUP shard formula: `blake2b(burnId) % N`
- liquidity lane strategies
- invariants
- failure modes
- minimal next spike with two DUP shards and two liquidity boxes
- important caveat: the current same-TX aggregate path still consumes the global SPVTracker, so DUP/liquidity lanes demonstrate lane-local state but not full parallel L1 settlement until tracker ingest is decoupled, pre-ingested as read-only state, or sharded

### 5. README wiring

Update `README.md` to link:

- `docs/evm-developer-showcase.md`
- `docs/sidechain-on-ergo-in-one-afternoon.md`
- `docs/sharded-settlement-lanes.md`

Also add commands:

```powershell
cd relayer
npm run showcase:benchmark
npm run showcase:proofs
```

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

Report:

- changed files
- command results
- any scripts that require a live node
- confirmation that no SQLite/secret/deployed local files are staged

## Commit Guidance

Do not commit until reviewed.

Safe staging should include only docs/scripts/package updates created for Phase 011b. Do not stage `relayer/bridge-state.sqlite`.
