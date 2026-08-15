# Benchmark Validate Offline Structured Candidate Blocker Report - 2026-06-25 - ca56646f

This report records the validator result for the current Gate 7 offline
structured benchmark candidate.

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
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 11 |
| Stack trace emitted | no |
| Local path emitted | no |

## Remaining Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Live batch settlement | 1 | Live batch evidence is still absent and cannot be inferred from offline outputs |
| Publication decision | 7 | Release-note/checklist update evidence, zero open benchmark blockers, and blocker closure are not complete |
| Reviewer sign-off | 3 | Benchmark owner, security reviewer, and operator reviewer approvals are not complete |

## Evidence Now Structured

The candidate now links row-specific offline evidence for:

- Required benchmark commands.
- Single-claim settlement baseline metrics.
- Batch settlement metrics.
- Sharded-lane planner metrics.
- Lane-local DUP evidence.
- Lane-local liquidity evidence.
- Shared SPVTracker evidence.
- Full-parallel L1 claim boundary evidence.
- Tracker-overlap mitigation evidence.
- Bottleneck rows for ContextExtension vars, claim-core size, DUP insert proof
  size, SPVTracker contention, liquidity fragmentation, Ergo transaction size,
  and node readiness boundaries.

## Boundary

The remaining validator issues are expected blockers. This candidate advances
offline evidence structure only. Gate 7 remains open until live batch evidence,
publication-update evidence, zero open benchmark blockers, and reviewer
approvals are available.
