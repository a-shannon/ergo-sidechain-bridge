# Offline Benchmark Three-Run Prep - 2026-06-25 - 5b2e9c15

This packet records repeated offline benchmark prerequisites for Gate 7.

It is not completed Gate 7 benchmark evidence. It does not support mainnet
production readiness, production throughput, live settlement, or full parallel
L1 settlement claims.

## Run Classification

| Field | Value |
|---|---|
| Evidence scope | offline benchmark prerequisite |
| Git commit | 5b2e9c15 |
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

| Command | Runs | Result | Evidence |
|---|---:|---|---|
| npm run showcase:benchmark | 3 | PASS / exit code 0 for each run | artifact://benchmarks/artifacts/offline-showcase-three-run-measurements-2026-06-25-5b2e9c15.md |
| npm run showcase:lanes | 3 | PASS / exit code 0 for each run | artifact://benchmarks/artifacts/offline-showcase-three-run-measurements-2026-06-25-5b2e9c15.md |

## Evidence Advanced

This prep packet advances the offline metric prerequisite that linked benchmark
metric rows must have at least three completed measurements. The linked
measurement artifact records:

- Sample count 3 for batch sizes 1, 2, 5, and 10.
- Sample count 3 for the two-lane sharded planner output.
- Stable tracker proof, DUP lookup proof, DUP insert proof, claim-core, input,
  output, context-variable, and batch counts for the offline batch model.
- Stable lane-local DUP and liquidity inputs, with SPVTracker still shared.

## Still Out Of Scope

The following Gate 7 requirements remain outside this offline prep packet:

- Serialized transaction-size evidence for live settlement transactions.
- JIT/evaluation cost evidence from a live-capable environment.
- Live batch settlement evidence.
- User explicit live broadcast approval bound to an expected transaction ID.
- Scoped `BRIDGE_BROADCAST_ENABLED=true` evidence.
- Post-enable readiness, broadcast policy, and live settlement signing PASS
  evidence.
- Broadcast network reconfirmation and submitted transaction identity matching
  the expected transaction ID.
- Completed Gate 7 release-note update evidence.
- Completed Gate 7 checklist update evidence.
- Benchmark reviewer sign-off.
- `npm run benchmark:validate` PASS for completed benchmark evidence.
- `release:gate -- --benchmark-evidence <completed-benchmark-evidence>` with
  zero structural issues for the same completed target.

Current validation blocker report:

- artifact://benchmarks/artifacts/benchmark-validate-three-run-prep-blocked-2026-06-25-5b2e9c15.md

## Claim Boundary

Allowed by this offline prep packet:

- Single-claim settlement remains the correctness baseline.
- Batch settlement amortizes DUP and unlock work in the offline model.
- DUP and liquidity inputs can be planned as lane-local state.
- SPVTracker remains a shared input today.

Not allowed by this offline prep packet:

- Production throughput.
- Base-level or exchange-scale throughput.
- Live batch settlement.
- Full parallel L1 settlement while SPVTracker remains shared.
- Trustless burn verification while this packet is scoped to the transitional
  trusted burn path.
- Mainnet cost, latency, or capacity claims.
