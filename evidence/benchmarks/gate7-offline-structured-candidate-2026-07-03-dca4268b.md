# Gate 7 Offline Structured Benchmark Candidate - 2026-07-03 - dca4268b

This packet refreshes the current offline benchmark and lane-planning outputs
into the Gate 7 benchmark evidence shape at current HEAD.

This is not completed Gate 7 benchmark evidence. It does not support mainnet
production readiness, production throughput, live batch settlement, trustless
burn completion, testnet production-candidate claims, or full parallel L1
settlement claims.

Current validation blocker report:

- artifact://benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-dca4268b.md

Boundary: Transaction broadcast, submit, deploy, or state mutation performed: no.

## Benchmark Classification

| Field | Value |
|---|---|
| Benchmark name | Gate 7 offline benchmark structure candidate |
| Git commit | dca4268b |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | transitional trusted burn path |
| Machine profile | Windows local benchmark runner using offline deterministic public inputs |
| Node version | v24.14.0 |
| Rust version | rustc 1.96.0 |
| wasm-pack version | 0.14.0 |
| Reviewer | A. Shannon |
| Date | 2026-07-03 |
| Metric rows source | ../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md |

## Required Commands

| Command | Expected result | Evidence | Status |
|---|---|---|---|
| npm run showcase:benchmark | PASS exit code 0 | artifact://benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run showcase:benchmark command output PASS exit code 0 | linked |
| npm run showcase:lanes | PASS exit code 0 | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run showcase:lanes command output PASS exit code 0 | linked |
| npm run showcase:proofs | PASS exit code 0 | artifact://benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run showcase:proofs command output PASS exit code 0 | linked |
| npm run showcase:finality | PASS exit code 0 | artifact://benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run showcase:finality command output PASS exit code 0 | linked |
| npm run check | PASS exit code 0 | artifact://benchmarks/artifacts/npm-run-check-pass-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run check command output PASS exit code 0 | linked |
| npm run wasm:test | PASS exit code 0 | artifact://benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-dca4268b.md completed benchmark command output evidence; npm run wasm:test command output PASS exit code 0 | linked |

## Metric Table

| Scenario | Evidence command or log | Sample count | Build time | Proof size | Transaction size | Cost-relevant counts | Throughput | Latency | Status |
|---|---|---:|---|---|---|---|---|---|---|
| Single-claim settlement baseline | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md completed benchmark metric evidence; single-claim settlement baseline; sample count 3; cost counts inputs=3 outputs=4 vars=15 batch=1 | 3 | 1.3 ms | tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B | 2744 bytes | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the offline single-claim model | 1.3 ms offline build latency | linked |
| Batch settlement | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md completed benchmark metric evidence; batch settlement; sample count 3; cost counts inputs=3 outputs=13 vars=58 batch=10 | 3 | 1.6 ms | tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B | 13893 bytes | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model | 1.6 ms offline build latency | linked |
| Sharded lanes planner | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md completed benchmark metric evidence; sharded lanes planner; sample count 3; cost counts inputs=6 outputs=16 vars=66 batch=10 | 3 | 3.1 ms | max lane tracker proof 228 B, max lane DUP lookup 67 B, max lane DUP insert 69 B, max lane claim cores 654 B, lane claim split 4 + 6 | 9073 bytes | inputs=6 outputs=16 vars=66 batch=10 | 10 planned settlements across 2 lanes in the offline sharded planner | 3.1 ms offline sharded planning and lane transaction-shape build latency | linked |
| Live batch settlement | Live batch settlement evidence requires explicit live approval, scoped broadcast enablement, submit, confirmation, and reconciliation evidence |  |  |  |  |  |  |  | blocker |

## Sharded Lane Evidence

| Statement | Required evidence | Status |
|---|---|---|
| DUP inputs are lane-local | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; DUP inputs are lane-local and disjoint | linked |
| Liquidity inputs are lane-local | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; liquidity inputs are lane-local and disjoint | linked |
| SPVTracker remains a shared input today | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; SPVTracker remains a shared input today | linked |
| Full parallel L1 settlement is not claimed | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; full parallel L1 settlement is not claimed while SPVTracker remains shared | linked |
| Tracker overlap mitigation is identified | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; tracker-overlap mitigation requires pre-ingested tracker entries or tracker sharding | linked |

## Bottleneck Register

| Bottleneck | Current evidence | Impact | Required next action |
|---|---|---|---|
| ContextExtension var count | artifact://benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:benchmark output PASS exit code 0 | ContextExtension Vars reach 58 at batch=10 and remain a batch-width scaling limit | Measure ContextExtension Var count again in live-capable rehearsal before any wider batch claim |
| Batch unlock claim-core size | artifact://benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:benchmark output PASS exit code 0 | Batch unlock claim-core size reaches 1090 B at batch=10 and limits unlock payload growth | Re-measure batch unlock claim-core size with signed transaction-size evidence |
| DUP insert proof size | artifact://benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:proofs output PASS exit code 0 | DUP AVL insert-proof size is 67 B in the offline proof-object inspection | Measure DUP AVL proof-size growth against larger public proof vectors |
| SPV tracker contention | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:lanes output PASS exit code 0 | SPVTracker remains a shared input and limits full parallel L1 settlement | Validate SPVTracker contention mitigation with pre-ingest or tracker sharding evidence |
| Liquidity lane fragmentation | artifact://benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:lanes output PASS exit code 0 | Liquidity lane fragmentation affects per-lane capacity and payout distribution | Measure liquidity lane fragmentation under more lane counts and payout splits |
| Ergo transaction size limit | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:metric-rows output PASS exit code 0 | Ergo transaction byte-size limit is approached through 13893-byte batch and 9073-byte sharded unsigned shapes | Capture signed Ergo transaction byte-size evidence before wider benchmark claims |
| Node mempool or signing readiness | artifact://benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-dca4268b.md completed benchmark bottleneck evidence; npm run showcase:finality output PASS exit code 0 | Node mempool signing readiness remains outside offline benchmark scope and limits live throughput claims | Run live readiness, broadcast policy, and settlement signing checks only after explicit live approval |

## Claims Boundary

Allowed only with linked evidence:

- Single-claim settlement remains the correctness baseline.
- Batch settlement amortizes DUP and unlock work for the measured batch size.
- Sharded lanes demonstrate lane-local DUP and liquidity planning.
- Subblock-aware UX separates fast inclusion from ordering-block finality.

Not allowed until separately proven:

- Production throughput.
- Base-level or exchange-scale throughput.
- Full parallel L1 settlement while SPVTracker remains a shared input.
- Trustless burn verification while the transitional trusted burn path is in use.
- Mainnet cost, latency, or capacity claims without mainnet-grade evidence.

## Publication Decision

| Field | Value |
|---|---|
| Release supported | institutional reference |
| Scaling claims allowed | yes |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Production throughput claim allowed | no |
| Mainnet-grade evidence linked | no |
| Open benchmark blockers | 5 |
| Release notes updated | yes |
| Required release-note updates | artifact://benchmarks/artifacts/completed-gate-7-benchmark-release-note-update-evidence-2026-06-26-11ebc444.md completed Gate 7 benchmark release-note update evidence; Release supported = institutional reference; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |
| Required checklist updates | artifact://benchmarks/artifacts/completed-gate-7-benchmark-checklist-update-evidence-2026-06-26-11ebc444.md completed Gate 7 benchmark checklist update evidence; Release supported = institutional reference; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |
| Reviewer decision summary | Release supported = institutional reference; measured single/batch/sharded evidence is locally structured; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: Open benchmark blockers = 5 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Benchmark owner | A. Shannon | block | 2026-07-03 | Offline benchmark metrics confirmed for single-claim settlement baseline, batch settlement, and sharded lanes; live batch evidence and publication updates remain required before Gate 7 closure |
| Security reviewer | A. Shannon | block | 2026-07-03 | Benchmark bottlenecks confirmed for ContextExtension var count, DUP insert proof size, SPVTracker contention, transaction size, and node readiness boundaries |
| Operator reviewer | A. Shannon | block | 2026-07-03 | Benchmark claims boundary confirmed: release-scope, throughput, trustless burn, and full parallel L1 settlement claims remain outside this offline candidate |
