# Current-HEAD Offline Benchmark Refresh - 2026-06-26 - 018443c3

This artifact records a current-HEAD refresh of the offline benchmark showcase
commands.

It is not completed Gate 7 benchmark evidence. It does not support production
throughput, mainnet capacity, live settlement, trustless burn completion,
testnet production-candidate, production-ready, or full parallel L1 settlement
claims.

## Command Results

| Command | Result | Exit code | Boundary |
|---|---|---:|---|
| npm run showcase:benchmark | PASS | 0 | Offline deterministic public inputs; no live node required |
| npm run showcase:lanes | PASS | 0 | Offline synthetic box IDs; no node calls |
| npm run showcase:proofs | PASS | 0 | Offline proof-object inspection |
| npm run showcase:finality | PASS | 0 | Offline illustrative timing model; no node calls |
| npm run showcase:metric-rows | PASS | 0 | Local offline; no node calls, signing, broadcast, local DB, runtime-state, or deployment-state reads |

## Metric Rows

| Scenario | Sample count | Mean build time | Proof size | Unsigned transaction shape | Cost-relevant counts | Throughput statement | Latency statement |
|---|---:|---|---|---|---|---|---|
| Single-claim settlement baseline | 3 | 1.3 ms | tracker proof 137 B; DUP lookup 67 B; DUP insert 67 B | 2744 bytes | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the offline single-claim model | 1.3 ms offline build latency |
| Batch settlement | 3 | 1.3 ms | tracker proof 222 B; DUP lookup 67 B; DUP insert 70 B; claim cores 1090 B | 13893 bytes | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model | 1.3 ms offline build latency |
| Sharded lanes planner | 3 | 1.9 ms | max lane tracker proof 228 B; max lane DUP lookup 67 B; max lane DUP insert 69 B; max lane claim cores 654 B; lane claim split 4 + 6 | 9073 bytes | inputs=6 outputs=16 vars=66 batch=10 | 10 planned settlements across 2 lanes in the offline sharded planner | 1.9 ms offline sharded planning and lane transaction-shape build latency |

## Sharded Lane Output

| Field | Value |
|---|---|
| Shard count | 2 |
| Claim count | 10 |
| Lane 0 claims | 4 |
| Lane 1 claims | 6 |
| Shared inputs | SPVTracker only |
| DUP inputs disjoint | yes |
| Liquidity inputs disjoint | yes |
| Full parallel L1 settlement claimed | no |

## Proof Object Output

| Object | Size | Purpose |
|---|---:|---|
| Tracker key | 32 B | Sidechain block ID |
| Tracker value | 36 B | Event root plus anchor |
| Tracker get proof | 137 B | Membership proof |
| DUP lookup proof | 67 B | Non-membership proof |
| DUP insert proof | 67 B | State transition proof |
| AVL digest | 33 B | Committed tree root |
| Claim core | 109 B | Packed claim struct |
| Event root | 32 B | Burn commitment hash |

## Finality Model Output

| Scenario | Fast signal | Ordering block | Economic finality | Boundary |
|---|---:|---:|---:|---|
| Single-claim settlement timeline | 4 s | 2 m | 22 m | Offline model; no node calls |
| Batch settlement timeline | 14 s | 2 m | 22 m | Offline model; no node calls |

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Dotenv loaded | no |
| Ergo node or sidechain RPC request performed | no |
| Signing performed | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Live batch settlement evidence completed | no |
| Gate 7 benchmark evidence completed | no |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
