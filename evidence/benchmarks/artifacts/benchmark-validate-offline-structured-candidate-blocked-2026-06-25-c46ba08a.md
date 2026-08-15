# Benchmark Validate Offline Structured Candidate Blocker Report - 2026-06-25 - c46ba08a

This report records the current validator result for the Gate 7 offline
structured benchmark candidate after the release checklist was linked to the
current Gate 5, Gate 6, and Gate 7 prerequisite packets.

It is not completed Gate 7 benchmark evidence. It does not support production
throughput, live batch settlement, full parallel L1 settlement, mainnet cost or
capacity claims, testnet production-candidate claims, or production-ready
claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run benchmark:validate -- ../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-25-ca56646f.md` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Validated target | `../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-25-ca56646f.md` |
| Validator commit | c46ba08a |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 11 |
| Stack trace emitted | no |
| Local path emitted | no |

## Exact Remaining Validator Issues

| Issue | Evidence prerequisite |
|---|---|
| Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass | Completed live batch settlement evidence with explicit live approval, scoped broadcast enablement, submitted transaction ID, confirmation, and reconciliation evidence. |
| Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass | Gate 7 publication decision can only change after live batch evidence and blocker closure are linked. |
| Publication Decision: Release notes updated must be yes before benchmark evidence can pass | Completed Gate 7 benchmark release-note update evidence after blocker closure. |
| Publication Decision: Reviewer decision summary: open benchmark blockers must be 0 | Reviewer decision summary must preserve `Open benchmark blockers = 0` only after blocker closure. |
| Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence | Distinct completed Gate 7 benchmark release-note update evidence target. |
| Publication Decision: Required release-note updates must include a link, command, or artifact marker | Release-note update evidence must cite a concrete completed artifact target. |
| Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence | Distinct completed Gate 7 benchmark checklist update evidence target. |
| Publication Decision: Required checklist updates must include a link, command, or artifact marker | Checklist update evidence must cite a concrete completed artifact target. |
| Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass | Benchmark owner approval after live batch evidence and publication updates are complete. |
| Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass | Security approval after live batch evidence, broadcast boundary evidence, and throughput claim boundaries are complete. |
| Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass | Operator approval after live settlement signing, confirmation, reconciliation, and rollback boundaries are complete. |

## Current Meaning

The offline benchmark candidate remains structurally useful for benchmark
commands, single-claim metrics, batch metrics, sharded-lane planning,
bottleneck rows, and claim-boundary rows. The current blocker set confirms that
Gate 7 cannot close without the live batch evidence sequence and publication
update evidence.

## Next Evidence Action

Do not edit the benchmark publication decision to approve Gate 7 until the live
batch settlement sequence has explicit approval and completed evidence for:

- live readiness and broadcast-boundary checks;
- scoped broadcast enablement;
- submitted transaction ID;
- confirmation and finality evidence;
- reconciliation evidence;
- distinct Gate 7 release-note and checklist update evidence.
