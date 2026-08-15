# Offline Showcase Three-Run Measurements - 2026-06-25 - 5b2e9c15

This artifact records repeated offline benchmark and sharded-lane showcase
measurements at commit `5b2e9c15`.

Scope:

- Environment: local offline.
- Broadcast mode: disabled.
- Node calls: none.
- Live transaction submit: none.

## Command Set

| Command | Runs | Result |
|---|---:|---|
| `npm run showcase:benchmark` | 3 | PASS / exit code 0 for each run |
| `npm run showcase:lanes` | 3 | PASS / exit code 0 for each run |

## Batch Settlement Measurements

The benchmark command reports offline build time, tracker proof size, DUP proof
sizes, claim-core size, context variable count, input count, and output count.

Sample count: 3 runs.

| Batch size | Run 1 build time | Run 2 build time | Run 3 build time | Mean build time | Tracker proof | DUP lookup | DUP insert | Claim cores | Cost-relevant counts | Throughput model |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 3.1 ms | 2.3 ms | 2.7 ms | 2.7 ms | 137 B | 67 B | 67 B | n/a | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the single-claim model |
| 2 | 0.7 ms | 0.6 ms | 0.5 ms | 0.6 ms | 171 B | 67 B | 68 B | 218 B | inputs=3 outputs=5 vars=18 batch=2 | 2 settlements per Ergo block in the offline batch model |
| 5 | 0.8 ms | 0.5 ms | 0.5 ms | 0.6 ms | 191 B | 67 B | 68 B | 545 B | inputs=3 outputs=8 vars=33 batch=5 | 5 settlements per Ergo block in the offline batch model |
| 10 | 1.5 ms | 0.9 ms | 1.1 ms | 1.2 ms | 225 B | 67 B | 70 B | 1090 B | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model |

Command-reported scaling note for every run:

- Batch 10 vs single: 1.0x DUP insert size, 10x settlements.
- Net efficiency: approximately 10.0x in the offline model.

## Sharded-Lane Planner Measurements

The lane showcase command uses synthetic burn IDs and box IDs with no node
calls. It routes ten claims across two lanes using the real shard-router and
sharded-plan-builder modules.

Sample count: 3 runs.

| Run | Lane count | Total claims | Lane 0 claims | Lane 1 claims | Lane 0 outputs | Lane 1 outputs | DUP inputs | Liquidity inputs | Shared input |
|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 2 | 10 | 4 | 6 | 7 | 9 | disjoint lane-local | disjoint lane-local | SPVTracker |
| 2 | 2 | 10 | 4 | 6 | 7 | 9 | disjoint lane-local | disjoint lane-local | SPVTracker |
| 3 | 2 | 10 | 4 | 6 | 7 | 9 | disjoint lane-local | disjoint lane-local | SPVTracker |

Lane planner cost-relevant counts:

- Lane 0: inputs=3 outputs=7 vars=1 batch=4.
- Lane 1: inputs=3 outputs=9 vars=1 batch=6.

Planner conclusion reported by the command:

- DUP inputs are lane-local.
- Liquidity inputs are lane-local.
- SPVTracker remains shared today.
- Full parallel settlement still needs pre-ingested tracker entries or tracker
  sharding.

## Boundary

This artifact supports repeated offline measurement of batch settlement shape
and sharded-lane planning. It does not authorize production throughput, mainnet
capacity, live batch settlement, trustless burn completion, or full parallel L1
settlement claims.
