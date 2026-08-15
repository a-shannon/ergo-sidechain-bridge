# Gate 3 Local Devnet Execution Request

This request converts the current Gate 3 capture manifest into the next operator inputs needed for a real local-devnet rehearsal.
It is planning output only and does not inspect private runtime state, read secrets, authorize signing, submit, broadcast, close Gate 3, or support release claims.

## Summary

| Field | Value |
| --- | --- |
| Status | LOCAL_DEVNET_REQUEST_READY |
| Source commit | 9eefaf45 |
| Capture manifest | ../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-9eefaf45.md |
| Capture manifest prerequisite result | BLOCKED with 65 structural issues |
| Capture manifest structural issues | 65 |
| Go/no-go JSON | ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-2026-07-07-9eefaf45.json |
| Go/no-go validation | ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-validation-2026-07-07-9eefaf45.md |
| Go/no-go verdict | LOCAL_PREREQS_OK |
| Go/no-go validation message | PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization |

## Operator Requests

| Phase | Operator action | Evidence to return | Stop condition |
| --- | --- | --- | --- |
| 1. Refresh patched-devnet go/no-go | Rerun demo:patched-devnet:go-no-go for the current machine inputs and keep the JSON plus validation output. The current linked verdict is LOCAL_PREREQS_OK, which is local-prerequisite evidence only. | Updated go/no-go JSON and validation Markdown with PASS validation, no secret dump, no signing, no broadcast, and no Gate 3 closure claim. | Stop if the verdict is NO-GO, if runtime-state inspection is still skipped without an explicit reviewer rationale, or if any endpoint is not loopback/non-mainnet. |
| 2. Start local nodes and scoped shell | Start Frontier and patched Ergo devnet locally, then set ERGO_NODE and ERGO_NODE_URL to the same loopback patched-devnet origin in a scoped shell. | Redacted command transcript showing local node reachability, current Ergo height, current sidechain height, PATCHED_STACK_MODE scope, and broadcast disabled before any submit. | Stop if endpoints are remote, mismatched, unauthenticated data is unavailable, or BRIDGE_BROADCAST_ENABLED is enabled before explicit approval. |
| 3. Prove funding and signer alignment privately | Run the existing funding and signer checks locally, but do not send mnemonics, private keys, API keys, or raw node config values. | PASS/BLOCKED summary with redacted signer/funding status, enough spendable devnet ERG for the rehearsal, and no serialized wallet material. | Stop if signer alignment is unknown, funding is insufficient, or the only proof requires exposing wallet recovery material or node config secrets. |
| 4. Capture completed local-devnet rehearsal | Fill the live rehearsal template for local devnet and validate it with rehearsal:validate plus the concrete JSON bindings requested by the capture manifest. | Completed local-devnet rehearsal Markdown, distinct rehearsal:validate transcript/report, preflight/window/fresh-check/aggregate JSON bindings, and claim denials. | Stop if any row uses placeholders, if validation output is targetless, if JSON targets drift, or if production-ready/testnet production-candidate claims are allowed. |

## Evidence Targets To Produce

- ../evidence/live-rehearsals/<completed-local-devnet-rehearsal.md>
- ../evidence/rehearsal/artifacts/<local-devnet-rehearsal-validation-report.md>
- ../evidence/live-rehearsals/<local-devnet-go-no-go.json>
- ../evidence/live-rehearsals/<local-devnet-preflight.json>
- ../evidence/live-rehearsals/<local-devnet-window-prep.json>
- ../evidence/live-rehearsals/<local-devnet-fresh-checkpoint.json>
- ../evidence/testnet-prebroadcast/<aggregate-check.json>

## Do Not Provide

- Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.
- Do not provide raw runtime databases, private bridge-state SQLite files, deployment-state dumps, or node data directories.
- Do not approve deployment, signing, submit, broadcast, publication, PR, or mainnet activity through this request.

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Capture manifest reused | yes |
| Go/no-go JSON reused | yes |
| Secret or environment file read | no |
| Wallet recovery material or private key read | no |
| Node config secret read | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Live node probe executed by request command | no |
| Transaction signing performed | no |
| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |
| Gate 3 lifecycle evidence claimed complete | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
