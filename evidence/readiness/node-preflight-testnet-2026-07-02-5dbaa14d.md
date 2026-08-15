# Bridge Readiness Node Preflight Report

This report checks whether the configured non-mainnet Ergo node can support bridge readiness evidence collection.
It does not close release evidence, authorize claims, deploy, sign, submit, or broadcast transactions.

## Command Result

| Field | Value |
|---|---|
| Command | npm run readiness:node-preflight -- --node-url http://213.239.193.208:9052 --out <report.md> --json-out <report.json> |
| Result | PASS |
| Exit code | 0 |
| Node endpoint | http://213.239.193.208:9052 |
| Reason | Ergo node readiness preflight completed on testnet height 425406. |
| Network | testnet |
| Height | 425406 |

## Endpoint Checks

| Check | Result | Detail |
|---|---|---|
| Node info endpoint reachable | PASS | network=testnet height=425406 |
| Latest header endpoint reachable | PASS | headers=1 |
| Script compile endpoint reachable | PASS | compiled deterministic sigmaProp(true) probe without auth headers |

## Boundary

| Boundary | Value |
|---|---|
| Ergo node request attempted | yes |
| Node info endpoint reachable | yes |
| Node network identified as non-mainnet | yes |
| Header endpoint reachable | yes |
| Script compile endpoint reachable | yes |
| ERGO_API_KEY read | no |
| Auth header sent | no |
| Node wallet used | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Private key material serialized | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |

This is prerequisite output only. It proves the local node prerequisite is available for later evidence commands, not that any release gate row is complete.
