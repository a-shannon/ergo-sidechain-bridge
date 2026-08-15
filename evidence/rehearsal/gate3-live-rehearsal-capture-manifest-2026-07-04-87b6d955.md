# Gate 3 Live Rehearsal Capture Manifest - 87b6d955

This manifest converts the current Gate 3 rehearsal blockers into the next
capture sequence for operators and reviewers.

It is not completed lifecycle, recovery, approval, submit, confirmation, or
reconciliation evidence. It does not authorize deployment, signing, settlement,
live submit, transaction broadcast, publication, release support, or any
production-ready or testnet production-candidate claim.

## Current Inputs

| Input | Current target | Capture status |
| --- | --- | --- |
| Source commit | `87b6d955` | reference only |
| Gate 3 prerequisite map | [gate3-rehearsal-prerequisite-map-2026-07-03-7875f3fb.md](gate3-rehearsal-prerequisite-map-2026-07-03-7875f3fb.md) | BLOCKED with 65 structural issues |
| Gate 3 operator packet | [gate3-rehearsal-operator-packet-2026-07-03-7875f3fb.md](gate3-rehearsal-operator-packet-2026-07-03-7875f3fb.md) | planning only |
| Live rehearsal template | [live-rehearsal-template.md](../../docs/live-rehearsal-template.md) | template only |
| Operator runbook | [operator-runbooks.md](../../docs/operator-runbooks.md) | command route reference |
| Current readiness operator request | [readiness-operator-request-current-lanes-2026-07-04-3b68c4ae.md](../readiness/readiness-operator-request-current-lanes-2026-07-04-3b68c4ae.md) | remaining runtime inputs |

## Capture Sequence

| Phase | Command or artifact to produce | Required concrete binding | Stop condition |
| --- | --- | --- | --- |
| 1. Aggregate prebroadcast JSON | `npm run settle:aggregate -- check-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight> --state-db <operator-read-only-state-db> --deployed-state-json <sanitized-deployed-state-json> --evidence-json ../evidence/testnet-prebroadcast/<aggregate-check.json>` | `sourceBindings.state`, `sourceBindings.deployedState`, `/transactions/check PASS`, Expected transaction ID, burn order, settlement shape, `broadcast: no` | Block if a default runtime DB, unsanitized deployment state, missing `/transactions/check`, or submit/broadcast path is used. |
| 2. Completed prebroadcast Markdown | `npm run prebroadcast:assemble -- --aggregate-json <aggregate-check.json> ... --out ../evidence/testnet-prebroadcast/<completed-prebroadcast.md>` | Session metadata, clean deployment-state digest, contract IDs, singleton inventory, current heights, ContextExtension guard, broadcast policy, peg-in ID, non-broadcast evidence | Block if any target is placeholder, targetless, secret-bearing, private runtime material, or missing row-specific evidence. |
| 3. Prebroadcast validation and doctor | `npm run prebroadcast:validate -- <completed-prebroadcast.md>` and `npm run prebroadcast:doctor -- <completed-prebroadcast.md> --json-out ../evidence/live-rehearsals/<prebroadcast-doctor.json>` | Distinct validation output plus structured doctor JSON matching the completed prebroadcast package | Block on non-zero exit code, non-zero structural issues, or target drift from the aggregate JSON. |
| 4. Approvals v2 JSON | `npm run approvals:draft -- --aggregate-json <aggregate-check.json> --check-evidence-json <aggregate-check.json> ... --out ../evidence/testnet-prebroadcast/<aggregate-approvals-v2.json>` | Non-broadcast approval scope, Expected transaction ID, mode, ordered burn set, check command, check evidence, non-mainnet network context, expiry | Block if the approval authorizes broadcast, omits completed approval evidence target, or drifts from aggregate JSON identity. |
| 5. Rehearsal preflight JSON | `npm run rehearsal:preflight -- --prebroadcast <completed-prebroadcast.md> --approvals <aggregate-approvals-v2.json> --json-out ../evidence/live-rehearsals/<rehearsal-preflight.json>` | Approval binding, package mode, Expected transaction ID, ordered burn set, deployment-state hash, no-broadcast lines | Block if approvals, package mode, burn order, or deployment hash do not match. |
| 6. Testnet window prep JSON | `npm run rehearsal:testnet-window-prep -- --prebroadcast <completed-prebroadcast.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out ../evidence/live-rehearsals/<testnet-window-prep.md> --json-out ../evidence/live-rehearsals/<testnet-window-prep.json>` | Current heights, same Expected transaction ID, same burn order, non-mainnet scope, all-false gate boundary | Block if current heights are below prebroadcast anchors or any gate boundary flag becomes true. |
| 7. Fresh checkpoint JSON | `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence <aggregate-check.json> --auto-heights --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out ../evidence/live-rehearsals/<fresh-testnet-checkpoint.md> --json-out ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json>` | Fresh read-only checkpoint, aggregate JSON binding, current heights, no-broadcast boundary, no Gate 3 closure | Block if node/source provenance is missing, checkpoint identity drifts, or any closure/broadcast flag is true. |
| 8. Offline rehearsal gate JSON | `npm run rehearsal:offline-gate -- --prebroadcast <prebroadcast-doctor.json> --preflight <rehearsal-preflight.json> --window-prep <testnet-window-prep.json> --fresh-checkpoint <fresh-testnet-checkpoint.json> --json-out ../evidence/live-rehearsals/<offline-gate.json>` | All offline stages PASS-equivalent, concrete source bindings for doctor, preflight, window-prep, and fresh checkpoint | Block if any source target is placeholder, reused ambiguously, or mismatched. |
| 9. Prep bundle Markdown and JSON | `npm run rehearsal:prep-bundle -- --prebroadcast <completed-prebroadcast.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --fresh-checkpoint-artifact <fresh-testnet-checkpoint.json> --out ../evidence/live-rehearsals/<prep-bundle.md> --json-out ../evidence/live-rehearsals/<prep-bundle.json>` | Prepared commands, artifact targets, all-false gate boundary, offline-gate source binding, approval-gated live-preflight handoff | Block if any prepared command is broadcast-capable or if artifact targets drift from prior JSON. |
| 10. Live preflight | Approval-gated only: `npm run rehearsal:live-preflight -- --rehearsal <completed-or-live-window-rehearsal.md> --approvals <aggregate-approvals-v2.json> --transcript <artifact://.../live-preflight.log> --json-out ../evidence/live-rehearsals/<live-preflight.json>` | Explicit reviewer and user live broadcast approval, same Expected transaction ID, same burn set, runtime broadcast disabled during preflight | Do not run without explicit live approval evidence. This command validates the handoff; it still cannot broadcast. |

## Acceptance Criteria Before Any Live Submit

| Criterion | Required value |
| --- | --- |
| Aggregate JSON exists and validates | yes |
| Completed prebroadcast Markdown exists and validates | yes |
| Approvals v2 JSON exists and matches aggregate JSON | yes |
| Rehearsal preflight JSON exists and matches approvals | yes |
| Testnet window prep JSON exists with all-false gate boundary | yes |
| Fresh checkpoint JSON exists and matches aggregate identity | yes |
| Offline gate JSON PASS-equivalent for all offline stages | yes |
| Prep bundle JSON exists and points to the same source artifacts | yes |
| Explicit reviewer and user live approval bound to Expected transaction ID | required before live preflight and submit |
| Transaction submit, confirmation, and reconciliation evidence | not captured by this manifest |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Concrete next capture order defined | yes |
| Runtime database opened | no |
| Private deployment state opened | no |
| Secret or environment file read | no |
| Live transaction signing performed | no |
| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |
| Completed Gate 3 lifecycle evidence claimed | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
