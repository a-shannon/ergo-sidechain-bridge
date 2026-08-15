# Completed Offline Showcase Benchmark Output

This report records deterministic offline benchmark command output evidence.
It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.

## Command Result

| Field | Value |
|---|---|
| Command | npm run showcase:benchmark -- --out <report.md> |
| Result | PASS |
| Exit code | 0 |
| Node calls | none |
| Signing | none |
| Broadcast | none |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

## Batch Settlement Benchmark

| Batch size | Build time | Tracker proof | DUP lookup | DUP insert | Claim cores | Context vars | Inputs | Outputs | Notes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 4 ms | 137 B | 67 B | 67 B | - | 15 | 3 | 4 | single-claim V1 path |
| 2 | 0.5 ms | 171 B | 67 B | 68 B | 218 B | 18 | 3 | 5 | - |
| 5 | 0.6 ms | 191 B | 67 B | 68 B | 545 B | 33 | 3 | 8 | - |
| 10 | 1.4 ms | 225 B | 67 B | 70 B | 1090 B | 58 | 3 | 13 | at unlock cap (10) |

## Boundary

- This is offline benchmark evidence only.
- This is not signed live Ergo transaction-size evidence.
- This is not live benchmark evidence.
- This does not authorize production throughput, mainnet capacity, live settlement, trustless burn completion, or full parallel L1 settlement claims.
