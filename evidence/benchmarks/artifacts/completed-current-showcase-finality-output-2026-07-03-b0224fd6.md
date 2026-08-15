# Completed Offline Finality Output

This report records deterministic offline finality-model command output evidence.
It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.

## Command Result

| Field | Value |
|---|---|
| Command | npm run showcase:finality -- --out <report.md> |
| Result | PASS |
| Exit code | 0 |
| Node calls | none |
| Signing | none |
| Broadcast | none |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

## Finality Model Output

| Scenario | Fast signal | Ordering block | Economic finality | Boundary |
|---|---:|---:|---:|---|
| Single-claim settlement timeline | 4s | 2m | 22m | Offline model; no node calls |
| Batch settlement timeline | 14s | 2m | 22m | Offline model; no node calls |

## Boundary

- Fast inclusion can drive progress bars, alerts, and operator UX.
- Ordering-block confirmation is the first canonical L1 inclusion point.
- Economic finality remains K ordering blocks deep for settlement accounting.
- This is not live benchmark evidence.
- This does not authorize live settlement claims, production throughput, mainnet capacity, trustless burn completion, or full parallel L1 settlement claims.
