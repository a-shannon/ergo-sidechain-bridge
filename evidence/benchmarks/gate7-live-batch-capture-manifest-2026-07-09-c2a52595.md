# Gate 7 Live Benchmark Capture Manifest - c2a52595

This manifest converts the current Gate 7 benchmark blockers into the
next live-batch capture sequence for operators and reviewers.

It is not completed benchmark evidence. It does not authorize live
settlement, transaction signing, submit, broadcast, deployment, publication,
release support, production throughput, production-ready wording, or
mainnet-grade claims.

## Command

`npm run benchmark:live-capture-manifest -- --source-commit c2a52595 --prerequisite-map ../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md --review-packet ../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md --readiness-request ../evidence/readiness/readiness-operator-request-current-lanes-2026-07-09-c2a52595.md --out ../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-c2a52595.md`

## Current Inputs

| Input | Current target | Capture status |
| --- | --- | --- |
| Source commit | `c2a52595` | reference only |
| Gate 7 candidate | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-05f25f0e.md | source evidence candidate |
| Gate 7 prerequisite map | ../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md | BLOCKED with 6 structural issues |
| Gate 7 review packet | ../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md | 1 live issue, 3 reviewer approval issues, 2 publication-boundary issues |
| Current readiness operator request | ../evidence/readiness/readiness-operator-request-current-lanes-2026-07-09-c2a52595.md | remaining operator inputs |

## Capture Sequence

| Phase | Command or artifact to produce | Required concrete binding | Stop condition |
| --- | --- | --- | --- |
| 1. Bind live-batch identity inputs | Operator-selected non-mainnet network, Gate 7 candidate, batch window, ordered burn set, and read-only state/deployed-state input targets | Network, candidate target, batch window, ordered burn set, sourceBindings.state target class, sourceBindings.deployedState target class, and no submit/broadcast scope | Block if identity inputs are generic, targetless, private runtime defaults, secret-bearing, mainnet-scoped, or authorize broader live operation. |
| 2. Non-broadcast aggregate check JSON | npm run settle:aggregate -- check-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight> --state-db <operator-read-only-state-db> --deployed-state-json <sanitized-deployed-state-json> --evidence-json ../evidence/testnet-prebroadcast/<gate7-live-batch-aggregate-check.json> | sourceBindings.state, sourceBindings.deployedState, /transactions/check PASS, Expected transaction ID, ordered burn set, settlement shape, and broadcast: no | Block if a default runtime DB, unsanitized deployment state, missing /transactions/check, or submit/broadcast path is used. |
| 3. Explicit live approval scope | User approval artifact collected after the non-broadcast aggregate check, scoped to the derived Expected transaction ID, one non-mainnet network, one Gate 7 candidate, one batch window, and one ordered burn set | Expected transaction ID from the aggregate check JSON, network, candidate target, batch window, ordered burn set, approver, approval timestamp, expiry, and live-run purpose | Block if approval predates the aggregate check, is generic, targetless, not bound to the derived Expected transaction ID, or authorizes broader live operation. |
| 4. Completed prebroadcast package | npm run prebroadcast:assemble -- --aggregate-json <gate7-live-batch-aggregate-check.json> ... --out ../evidence/testnet-prebroadcast/<completed-gate7-live-batch-prebroadcast.md> | Current heights, clean deployment-state digest, contract IDs, singleton inventory, ContextExtension guard, broadcast policy, non-broadcast evidence, explicit approval target, and Expected transaction ID | Block if any target is placeholder, secret-bearing, private runtime material, or missing command-specific evidence. |
| 5. Prebroadcast validation and doctor | npm run prebroadcast:validate -- <completed-gate7-live-batch-prebroadcast.md> and npm run prebroadcast:doctor -- <completed-gate7-live-batch-prebroadcast.md> --json-out ../evidence/benchmarks/artifacts/<gate7-live-batch-prebroadcast-doctor.json> | Validator output and doctor JSON both match the completed prebroadcast package and report zero structural issues | Block on non-zero structural issues, target drift, placeholder targets, or local/private target leakage. |
| 6. Readiness, policy, and signer checks | npm run demo:readiness; npm run demo:batch:preflight; live settlement signing PASS artifact; broadcast policy PASS artifact | Scoped BRIDGE_BROADCAST_ENABLED=true evidence, readiness PASS, broadcast policy PASS, live settlement signing PASS, and network reconfirmation bound to Expected transaction ID | Block if readiness is only a prior dry run, broadcast enablement is unscoped, signing uses Fleet/node prover for register-derived propositions, or network identity drifts. |
| 7. Live submit and observation | Approval-gated only: npm run settle:aggregate -- submit-batch <expectedTxId> <burn-a> <burn-b> [...] | Submitted transaction ID equals Expected transaction ID; submission artifact, mempool or node observation, confirmation height, confirmation count, finality evidence, and ordered burn set all match | Do not run without explicit approval and a scoped live shell. Block if submitted ID differs from Expected transaction ID. |
| 8. Post-submit reconciliation | npm run rehearsal:post-submit:observe -- --expected-tx-id <expectedTxId> --submitted-tx-id <submittedTxId> ... --live-preflight-report <live-preflight.json> --out <post-submit-observe.md> --json-out <post-submit-observe.json> | Confirmation, finality, settlement output boxes, DUP successor, SPV tracker successor, recipient payout boxes, fee, and failed-event queue status match the same Expected transaction ID | Block if reconciliation changes transaction identity, omits successor boxes, omits finality evidence, or reports manual repair without recovery evidence. |
| 9. Completed benchmark evidence update | Update the Gate 7 benchmark evidence from blocker to linked live batch settlement, then run npm run benchmark:validate -- <completed-benchmark-evidence.md> | Live batch row status linked; Open benchmark blockers = 0; reviewer decision summary says Open benchmark blockers = 0; production-ready and production-throughput claims remain no | Block if benchmark validation is BLOCKED, if reviewer approvals are missing, or if production/mainnet/throughput claims are broadened. |

## Acceptance Criteria Before Gate 7 Closure

| Criterion | Required value |
| --- | --- |
| Explicit live approval bound to Expected transaction ID | required before live submit |
| Aggregate check JSON records /transactions/check PASS and broadcast: no | yes |
| Completed prebroadcast package validates and doctor reports zero structural issues | yes |
| Readiness, broadcast policy, live settlement signing, and network reconfirmation are linked | yes |
| Submitted transaction ID equals Expected transaction ID | yes |
| Confirmation, finality, and reconciliation evidence bind the same Expected transaction ID | yes |
| Benchmark owner, security reviewer, and operator reviewer approve after live evidence | yes |
| Open benchmark blockers | 0 |
| Testnet production-candidate claim allowed | yes |
| Production-ready claim allowed | no |
| Production throughput claim allowed | no |
| Mainnet-grade evidence linked | no |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Concrete next capture order defined | yes |
| Derived from Gate 7 prerequisite map | yes |
| Derived from Gate 7 review packet | yes |
| Runtime database opened | no |
| Private deployment state opened | no |
| Secret or environment file read | no |
| Node or RPC request performed | no |
| Live transaction signing performed | no |
| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |
| Completed Gate 7 benchmark evidence claimed | no |
| Gate 7 closure claimed | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Production throughput claim allowed | no |
| Mainnet-grade evidence linked | no |
