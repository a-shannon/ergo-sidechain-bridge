# Gate 7 Benchmark Blocker Map - 2026-06-25 - 8fdaf29d

This packet converts the current offline benchmark status into the
validator-required section layout. It is not completed Gate 7 benchmark
evidence and does not support live settlement, production throughput, testnet
production-candidate, mainnet, or full parallel L1 settlement claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, or live transaction evidence was read or used for
this packet.

Current validation blocker report:

- artifact://benchmarks/artifacts/benchmark-validate-gate7-blocker-map-blocked-2026-06-25-8fdaf29d.md

## Benchmark Classification

| Field | Value |
|---|---|
| Benchmark name | Gate 7 offline benchmark blocker map |
| Git commit | 8fdaf29d |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | transitional trusted burn path |
| Machine profile | Local Windows offline benchmark evidence runner |
| Node version | v24.14.0 |
| Rust version | rustc 1.96.0 |
| wasm-pack version | 0.14.0 |
| Reviewer | A. Shannon |
| Date | 2026-06-25 |

## Required Commands

| Command | Expected result | Evidence | Status |
|---|---|---|---|
| npm run showcase:benchmark | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-benchmark-output-2026-06-25-782a2bdd.md; npm run showcase:benchmark command output PASS exit code 0; offline batch benchmark output | linked |
| npm run showcase:lanes | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; sharded lanes planner output | linked |
| npm run showcase:proofs | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-proofs-output-2026-06-25-782a2bdd.md; npm run showcase:proofs command output PASS exit code 0; proof-size output | linked |
| npm run showcase:finality | PASS / exit code 0 | artifact://benchmarks/artifacts/offline-showcase-finality-output-2026-06-25-782a2bdd.md; npm run showcase:finality command output PASS exit code 0; finality timing output | linked |
| npm run check | PASS / exit code 0 | artifact://benchmarks/artifacts/npm-run-check-pass-2026-06-25-8fdaf29d.md; npm run check command output PASS exit code 0; 90 test files and 6,635 tests passed | linked |
| npm run wasm:test | PASS / exit code 0 | artifact://benchmarks/artifacts/npm-run-wasm-test-pass-2026-06-25-8fdaf29d.md; npm run wasm:test command output PASS exit code 0; 13 WASM tests passed | linked |

## Metric Table

| Scenario | Evidence command or log | Sample count | Build time | Proof size | Transaction size | Cost-relevant counts | Throughput | Latency | Status |
|---|---|---|---|---|---|---|---|---|---|
| Single-claim settlement baseline | artifact://benchmarks/artifacts/offline-showcase-three-run-measurements-2026-06-25-5b2e9c15.md records Sample count 3 and single-claim baseline cost counts, but serialized transaction size and latency evidence are not captured | 3 | 2.7 ms mean build time | tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B | not captured | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the offline single-claim model | not captured | blocker |
| Batch settlement | artifact://benchmarks/artifacts/offline-showcase-three-run-measurements-2026-06-25-5b2e9c15.md records Sample count 3 and batch settlement cost counts, but serialized transaction size and latency evidence are not captured | 3 | 1.2 ms mean build time for batch 10 | tracker proof 225 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B | not captured | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model | not captured | blocker |
| Sharded lanes planner | artifact://benchmarks/artifacts/offline-showcase-three-run-measurements-2026-06-25-5b2e9c15.md records Sample count 3 and two-lane planner counts, but transaction size and latency evidence are not captured | 3 | not captured | not captured | not captured | lane 0 inputs=3 outputs=7 vars=1 batch=4; lane 1 inputs=3 outputs=9 vars=1 batch=6 | 10 planned claims across 2 lanes in the offline planner | not captured | blocker |
| Live batch settlement | live batch settlement submit, confirmation, Expected transaction ID, scoped broadcast approval, and reconciliation evidence have not been captured | | | | | | | | blocker |

## Sharded Lane Evidence

| Statement | Required evidence | Status |
|---|---|---|
| DUP inputs are lane-local | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; lane-local DUP inputs are reported for both lanes | linked |
| Liquidity inputs are lane-local | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; lane-local liquidity inputs are reported for both lanes | linked |
| SPVTracker remains a shared input today | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; SPVTracker remains the shared input today | linked |
| Full parallel L1 settlement is not claimed | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; full parallel L1 settlement is not claimed while SPVTracker remains shared | linked |
| Tracker overlap mitigation is identified | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; tracker overlap mitigation requires pre-ingested tracker entries or tracker sharding | linked |

## Bottleneck Register

| Bottleneck | Current evidence | Impact | Required next action |
|---|---|---|---|
| ContextExtension var count | artifact://benchmarks/artifacts/offline-showcase-benchmark-output-2026-06-25-782a2bdd.md; npm run showcase:benchmark command output PASS exit code 0; batch 10 reports Vars 58 | ContextExtension Var count is the current visible scaling limit for larger batches | Capture serialized transaction size and validation cost evidence for the ContextExtension Var count limit |
| Batch unlock claim-core size | artifact://benchmarks/artifacts/offline-showcase-benchmark-output-2026-06-25-782a2bdd.md; npm run showcase:benchmark command output PASS exit code 0; batch 10 reports claim cores 1090 B | Batch unlock claim-core size grows with batch settlement size | Capture live-capable batch unlock claim-core size and transaction byte evidence |
| DUP insert proof size | artifact://benchmarks/artifacts/offline-showcase-proofs-output-2026-06-25-782a2bdd.md; npm run showcase:proofs command output PASS exit code 0; DUP insert proof is 67 B in offline proof inspection | DUP and AVL insert proof size affects settlement witness payload size | Capture proof-size evidence against the live settlement transaction shape |
| SPV tracker contention | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; SPVTracker remains a shared input today | SPV tracker contention prevents full parallel L1 settlement while the tracker input is shared | Prove pre-ingested tracker entries or tracker sharding before making full parallel L1 claims |
| Liquidity lane fragmentation | artifact://benchmarks/artifacts/offline-showcase-lanes-output-2026-06-25-782a2bdd.md; npm run showcase:lanes command output PASS exit code 0; liquidity inputs are lane-local in the planner | Liquidity lane fragmentation can reduce per-lane settlement capacity | Capture lane inventory and liquidity fragmentation evidence in a live-capable environment |
| Ergo transaction size limit | artifact://benchmarks/artifacts/offline-showcase-benchmark-output-2026-06-25-782a2bdd.md; npm run showcase:benchmark command output PASS exit code 0; output counts rise to 13 for batch 10 | Ergo transaction size limit remains unmeasured for serialized live-capable transactions | Capture serialized Ergo transaction byte size and limit margin for single, batch, and sharded settlement shapes |
| Node mempool or signing readiness | artifact://benchmarks/artifacts/offline-showcase-finality-output-2026-06-25-782a2bdd.md; npm run showcase:finality command output PASS exit code 0; finality model is offline and no node mempool or signing readiness was exercised | Node mempool, signing readiness, and broadcast policy remain separate live-capable blockers | Capture post-enable demo:readiness, broadcast policy, live settlement signing, and network reconfirmation evidence before linking live batch settlement |

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
- Trustless burn verification while the transitional trusted burn path is in
  use.
- Mainnet cost, latency, or capacity claims without mainnet-grade evidence.

## Publication Decision

| Field | Value |
|---|---|
| Release supported | none |
| Scaling claims allowed | no |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Production throughput claim allowed | no |
| Mainnet-grade evidence linked | no |
| Open benchmark blockers | 6 |
| Release notes updated | no |
| Required release-note updates | completed Gate 7 benchmark release-note update evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |
| Required checklist updates | completed Gate 7 benchmark checklist update evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |
| Reviewer decision summary | release support remains Release supported = none; measured single, batch, and sharded evidence is limited to offline command outputs; production-ready claim handling: Production-ready claim allowed = no; testnet-production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling blocked: Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Scaling claims allowed = no |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Benchmark owner | A. Shannon | block | 2026-06-25 | Measured offline benchmark command outputs, sharded-lane evidence, ContextExtension Vars, DUP proof size, SPVTracker shared-input limit, and transaction-size gaps require live-capable evidence before Gate 7 approval |
| Security reviewer | unassigned | block | 2026-06-25 | Validate live batch settlement evidence, broadcast-boundary evidence, production throughput claim boundary, and serialized transaction-size limits before approval |
| Operator reviewer | unassigned | block | 2026-06-25 | Validate node mempool readiness, live settlement signing readiness, broadcast policy, network reconfirmation, and reconciliation evidence before approval |
