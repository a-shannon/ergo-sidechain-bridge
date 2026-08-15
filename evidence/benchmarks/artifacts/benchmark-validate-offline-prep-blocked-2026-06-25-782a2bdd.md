# Benchmark Validate Offline Prep Blocker Report - 2026-06-25 - 782a2bdd

This report records the current validator result for the refreshed offline
benchmark prerequisite packet.

It is not completed Gate 7 benchmark evidence. It does not support production
throughput, live batch settlement, full parallel L1 settlement, mainnet cost or
capacity claims, testnet production-candidate claims, or production-ready
claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run benchmark:validate -- ../evidence/benchmarks/offline-showcase-prep-2026-06-25-782a2bdd.md` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Validated target | `../evidence/benchmarks/offline-showcase-prep-2026-06-25-782a2bdd.md` |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 70 |
| Stack trace emitted | no |
| Local path emitted | no |

## Missing Evidence Groups

The validator fails closed with structured blocker output. The offline prep
packet is intentionally not shaped as completed benchmark evidence, so these
missing groups are expected:

| Evidence group | Validator status |
|---|---|
| Benchmark Classification | missing completed Gate 7 classification fields |
| Required Commands | missing the required command table and six linked command rows |
| Metric Table | missing single-claim, batch, sharded-lanes, and live-batch rows |
| Sharded Lane Evidence | missing the five required sharded-lane statement rows |
| Bottleneck Register | missing the seven required bottleneck rows |
| Claims Boundary | missing the exact required allowed and blocked claim arrays |
| Publication Decision | missing required release-support, claim-boundary, and update fields |
| Reviewer Sign-Off | missing Benchmark owner, Security reviewer, and Operator reviewer rows |

## Boundary

The offline showcase outputs remain useful benchmark prerequisites, but they
cannot close Gate 7 until they are promoted into a completed benchmark evidence
document with command-specific output evidence, scenario-specific metric rows,
sharded-lane statements, bottleneck rows, publication-update evidence, and
reviewer sign-off.

The live batch settlement row remains blocked until separate live-capable
evidence links explicit user approval, scoped broadcast enablement, post-enable
readiness, broadcast policy, live settlement signing, network reconfirmation,
submitted transaction identity, and confirmation or reconciliation evidence.
