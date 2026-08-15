# Gate 7 Live Benchmark Execution Request

This request converts the current Gate 7 live benchmark capture manifest into the next operator inputs needed for one bounded live-batch benchmark run.
It is planning output only and does not inspect private runtime state, read secrets, authorize signing, submit, broadcast, close Gate 7, or support release claims.

## Summary

| Field | Value |
| --- | --- |
| Status | LIVE_BENCHMARK_EXECUTION_REQUEST_READY |
| Source commit | 0187ff51 |
| Capture manifest | ../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-07-0187ff51.md |
| Gate 7 candidate | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-05-dc64fb20.md |
| Capture manifest prerequisite result | BLOCKED with 6 structural issues |
| Capture manifest structural issues | 6 |
| Review packet status | 1 live issue, 3 reviewer approval issues, 2 publication-boundary issues |
| Readiness operator request | ../evidence/readiness/readiness-operator-request-current-lanes-2026-07-06-1bda5de6.md |

## Operator Requests

| Phase | Operator action | Evidence to return | Stop condition |
| --- | --- | --- | --- |
| 1. Bind live-batch identity and approval | Choose one non-mainnet network, one Gate 7 candidate, one ordered burn set, one batch window, and one Expected transaction ID; collect explicit approval scoped only to that identity. | Approval artifact with Expected transaction ID, network, candidate target, ordered burn set, batch window, approver, timestamp, expiry, and statement that no broader live operation is approved. | Stop if approval is generic, targetless, missing the Expected transaction ID, not time-scoped, or grants broader signing/broadcast permission. |
| 2. Produce non-broadcast aggregate and prebroadcast evidence | Run the aggregate check in non-broadcast mode using operator-local state inputs, then assemble the completed prebroadcast package without sharing secrets or raw runtime state. | Aggregate check JSON, completed prebroadcast Markdown, sanitized deployment-state digest, singleton inventory, ordered burn set, /transactions/check PASS, Expected transaction ID, and broadcast: no. | Stop if the command uses default private runtime DBs, unsanitized deployment state, missing check output, or any submit/broadcast path. |
| 3. Validate readiness, policy, and signing prerequisites | Validate the prebroadcast package and provide readiness, broadcast-policy, signing, and network reconfirmation evidence bound to the same Expected transaction ID. | prebroadcast:validate PASS, prebroadcast:doctor JSON with zero structural issues, readiness PASS, broadcast policy PASS, live settlement signing PASS, and network reconfirmation artifact. | Stop on non-zero structural issues, target drift, placeholder targets, unscoped BRIDGE_BROADCAST_ENABLED=true, signer mismatch, or network identity drift. |
| 4. Approval-gated live submit and observation | Only after explicit approval, run the single scoped live submit and record submission plus observation evidence for the same Expected transaction ID. | Submitted transaction ID, mempool or node observation, confirmation height, confirmation count, finality evidence, ordered burn set, and proof that submitted ID equals Expected transaction ID. | Do not run without explicit approval. Stop if submitted transaction ID differs from Expected transaction ID or if any mainnet target is selected. |
| 5. Reconcile and complete benchmark evidence | Run post-submit reconciliation, update the Gate 7 benchmark evidence, then collect reviewer sign-offs after the linked live evidence exists. | Post-submit observe Markdown and JSON, finality/reconciliation evidence, completed benchmark evidence, benchmark:validate output, and benchmark owner/security/operator reviewer decisions. | Stop if reconciliation omits successor boxes or finality, benchmark validation remains BLOCKED, reviewers approve before evidence exists, or production/mainnet/throughput claims broaden. |

## Evidence Targets To Produce

- ../evidence/approvals/<gate7-live-batch-explicit-approval.md>
- ../evidence/testnet-prebroadcast/<gate7-live-batch-aggregate-check.json>
- ../evidence/testnet-prebroadcast/<completed-gate7-live-batch-prebroadcast.md>
- ../evidence/benchmarks/artifacts/<gate7-live-batch-prebroadcast-validate.md>
- ../evidence/benchmarks/artifacts/<gate7-live-batch-prebroadcast-doctor.json>
- ../evidence/benchmarks/artifacts/<gate7-readiness-policy-signing-pass.md>
- ../evidence/benchmarks/artifacts/<gate7-live-batch-submit-observation.md>
- ../evidence/rehearsal/<gate7-post-submit-observe.md>
- ../evidence/rehearsal/artifacts/<gate7-post-submit-observe.json>
- ../evidence/benchmarks/<completed-gate7-performance-benchmark-evidence.md>
- ../evidence/benchmarks/artifacts/<benchmark-validate-completed-gate7.md>

## Do Not Provide

- Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.
- Do not provide raw runtime databases, private bridge-state SQLite files, deployment-state dumps, or node data directories.
- Do not approve signing, submit, broadcast, deployment, publication, PR, mainnet activity, or production throughput claims through this request.

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Capture manifest reused | yes |
| Concrete operator execution request produced | yes |
| Secret or environment file read | no |
| Wallet recovery material or private key read | no |
| Node config secret read | no |
| Runtime database opened by request command | no |
| Private deployment state opened by request command | no |
| Node or RPC request performed by request command | no |
| Live transaction signing performed | no |
| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |
| Gate 7 benchmark evidence claimed complete | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Production throughput claim allowed | no |
| Mainnet-grade evidence linked | no |
