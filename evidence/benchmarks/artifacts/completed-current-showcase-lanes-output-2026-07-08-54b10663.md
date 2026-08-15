# Completed Offline Showcase Lanes Output

This report records deterministic offline sharded-lane command output evidence.
It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.

## Command Result

| Field | Value |
|---|---|
| Command | npm run showcase:lanes -- --out <report.md> |
| Result | PASS |
| Exit code | 0 |
| Node calls | none |
| Signing | none |
| Broadcast | none |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

## Sharded Lane Output

| Field | Value |
|---|---|
| Shard count | 2 |
| Claim count | 10 |
| Lane count | 2 |
| Shared inputs | SPVTracker only |
| DUP inputs disjoint | yes |
| Liquidity inputs disjoint | yes |
| Full parallel L1 settlement claimed | no |

## Lane Plans

| Lane | SPVTracker input | DUP input | Liquidity input | Claims | Estimated outputs |
|---:|---|---|---|---:|---:|
| 0 | b49c247fea...817299 | 9e6317c0b0...90f486 | 2247608919...1af21f | 4 | 7 |
| 1 | b49c247fea...817299 | 06aed90728...699d6d | 62b55540ae...771ef6 | 6 | 9 |

## Boundary

- DUP and liquidity inputs are lane-local in this offline plan.
- SPVTracker remains a shared input today.
- This is not live benchmark evidence.
- This does not authorize full parallel L1 settlement, production throughput, mainnet capacity, live settlement, or trustless burn completion claims.
