# Offline Benchmark Evidence Prep - 2026-06-25 - 782a2bdd

This packet records non-broadcast benchmark prerequisites for Gate 7.

It is not completed Gate 7 benchmark evidence. It does not support mainnet
production readiness, production throughput, live settlement, or full parallel
L1 settlement claims.

## Run Classification

| Field | Value |
|---|---|
| Evidence scope | offline benchmark prerequisite |
| Git commit | 782a2bdd |
| Release level supported | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | transitional trusted burn path |
| Node version | v24.14.0 |
| npm version | 11.16.0 |
| Rust version | rustc 1.96.0 |
| wasm-pack version | 0.14.0 |
| Date | 2026-06-25 |

## Completed Offline Commands

| Command | Result | Evidence |
|---|---|---|
| npm run showcase:benchmark | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-benchmark-output-2026-06-25-782a2bdd.md |
| npm run showcase:lanes | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md |
| npm run showcase:proofs | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-proofs-output-2026-06-25-782a2bdd.md |
| npm run showcase:finality | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-finality-output-2026-06-25-782a2bdd.md |

## Observed Offline Results

The offline benchmark command measured batch sizes 1, 2, 5, and 10.
The batch-10 path remained at the unlock cap and reported 10 settlements per
batch in the offline model.

Key observed values from the single command run:

| Scenario | Build time | Tracker proof | DUP lookup | DUP insert | Claim cores | Vars | Inputs | Outputs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Batch size 1 | 2.2 ms | 137 B | 67 B | 67 B | n/a | 15 | 3 | 4 |
| Batch size 2 | 0.6 ms | 171 B | 67 B | 68 B | 218 B | 18 | 3 | 5 |
| Batch size 5 | 0.7 ms | 191 B | 67 B | 68 B | 545 B | 33 | 3 | 8 |
| Batch size 10 | 1.1 ms | 225 B | 67 B | 70 B | 1090 B | 58 | 3 | 13 |

## Claim Boundary

Allowed by this offline prep packet:

- Single-claim settlement remains the correctness baseline.
- Batch settlement amortizes DUP and unlock work in the offline model.
- DUP and liquidity inputs can be planned as lane-local state.
- SPVTracker remains a shared input today.
- Subblock-aware UX must remain separated from ordering-block finality.

Not allowed by this offline prep packet:

- Production throughput.
- Base-level or exchange-scale throughput.
- Live batch settlement.
- Full parallel L1 settlement while SPVTracker remains shared.
- Trustless burn verification while this packet is scoped to the transitional
  trusted burn path.
- Mainnet cost, latency, or capacity claims.

## Remaining Gate 7 Blockers

Gate 7 remains blocked until a completed benchmark evidence document links
validated benchmark output and release-gate output for the same target.

Current validation blocker report:

- artifact://benchmarks/artifacts/benchmark-validate-offline-prep-blocked-2026-06-25-782a2bdd.md

Known blockers for completed Gate 7 evidence:

- At least three completed measurements per linked metric row.
- Serialized transaction-size and cost-relevant counts for each linked metric
  row.
- Live batch settlement evidence from a live-capable environment.
- User explicit live broadcast approval bound to an expected transaction ID.
- Scoped `BRIDGE_BROADCAST_ENABLED=true` evidence.
- Post-enable readiness, broadcast policy, and live settlement signing PASS
  evidence.
- Broadcast network reconfirmation and submitted transaction identity matching
  the expected transaction ID.
- Completed Gate 7 release-note update evidence.
- Completed Gate 7 checklist update evidence.
- `npm run benchmark:validate` PASS for the completed benchmark evidence.
- `release:gate -- --benchmark-evidence <completed-benchmark-evidence>` with
  zero structural issues for the same completed target.
