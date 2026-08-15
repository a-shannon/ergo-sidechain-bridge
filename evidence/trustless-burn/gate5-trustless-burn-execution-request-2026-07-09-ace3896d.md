# Gate 5 Trustless Burn Execution Request

This request converts the current Gate 5 trustless-burn prerequisite map and operator packet into the next concrete operator evidence captures.
It is planning output only and does not inspect private runtime state, read secrets, query nodes, authorize signing or transaction checks, submit, broadcast, close Gate 5, or support release claims.

## Summary

| Field | Value |
| --- | --- |
| Status | TRUSTLESS_BURN_EXECUTION_REQUEST_READY |
| Source commit | ace3896d |
| Prerequisite map | ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-09-ace3896d.md |
| Operator packet | ../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-09-ace3896d.md |
| Candidate target | ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md |
| Prerequisite map result | BLOCKED |
| Prerequisite map structural issues | 19 |
| Operator packet result | BLOCKED |
| Operator packet structural issues | 19 |

## Operator Requests

| Phase | Operator action | Evidence to return | Stop condition |
| --- | --- | --- | --- |
| 1. Bind one non-mainnet trustless-burn instance | Select exactly one non-mainnet burn instance and record sidechainId, sidechain transaction hash, sidechain block hash, event index, bridgeEventRoot, Ergo anchor height, burnId, duplicate-prevention key, recipient binding, amount, asset, proof-vector target, and candidate target. | Gate 5 instance binding packet with all identifiers, source evidence targets, selected network, reviewer-visible timestamp, and explicit no-mainnet/no-claim/no-broadcast scope. | Stop if the instance is generic, targetless, mainnet-scoped, missing any identifier, not bound to the current candidate target, or relies on private deployment/runtime material. |
| 2. Refresh local proof-vector, candidate, and unsigned evidence | Produce or refresh guarded local proof-vector validation, trustless candidate validation, and compact unsigned transaction validation for the selected instance without running /transactions/check. | Proof-vector JSON and validation report, candidate JSON and validation report, unsigned transaction JSON and trustless:unsigned-tx:validate report with contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no. | Stop on single-leaf proof evidence, empty proof nodes, failed negative cases, unsafe JSON targets, transaction-check fields, expected-tx-id fields, signing fields, submit fields, or Gate 5 closure wording. |
| 3. Capture public anchor, tracker, and finality observations | Run the approved read-only observation captures against sanitized public inputs for the same bridgeEventRoot and anchor height, then bind sidechain finality/tracker history to that identity. | Sanitized public extension-observation JSON, trustless:anchor-observe LINKED report, sanitized SPV tracker observation JSON, trustless:spv-tracker-observe LINKED report, and sidechain finality evidence for the same commitment. | Stop if inputs contain private node config, runtime DB paths, deployment-state dumps, missing 0x04xx anchor data, mismatched roots/heights, unlinked tracker values, or local-only finality claims. |
| 4. Reconcile observations and settlement binding | Run observation reconciliation and assemble proof that the anchor, SPV tracker, proof-vector, burn proof, DUP key, recipient, amount, and settlement outputs all bind to the same instance. | trustless:observation-reconcile report plus settlement-binding packet proving exact burnId-to-DUP insertion, payout recipient and amount preservation, and non-broadcast settlement shape. | Stop on bridgeEventRoot drift, sidechain header drift, Ergo anchor drift, DUP key mismatch, payout mismatch, missing successor boxes, local mutation, signing, submit, reconcile mutation, or broadcast wording. |
| 5. Complete proof acceptance and Gate 5 evidence validation | Link positive proof acceptance and negative rejection evidence, then assemble completed Gate 5 trustless-burn evidence and run trustless:validate on the completed Markdown target. | Completed trustless burn evidence Markdown, trustless:validate output, accepted proof evidence, malformed/stale/unfinalized rejection evidence, and distinct completed targets for component, commitment, proof, positive, negative, and publication-update rows. | Stop if validation is not PASS, structural issues remain, evidence targets are reused, validation output is used as row evidence, negative cases are targetless, or publication rows are not distinct completed evidence. |
| 6. Collect review and publication-boundary evidence | Collect protocol, security, and operator reviewer sign-offs after completed evidence exists, and update release-note/checklist evidence only with bounded testnet-production-candidate wording. | Independent review evidence, protocol/security/operator approvals with concrete trustless-burn outcome notes, Critical/high findings open = 0, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, and completed checklist/release-note update targets. | Stop if review predates evidence, reviewer notes approve mainnet or production-ready wording, trusted fallback wording remains, critical/high findings are non-numeric or non-zero, or release-gate PASS is not real. |

## Evidence Targets To Produce

- ../evidence/trustless-burn/<gate5-trustless-burn-instance-binding.md>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-proof-vector-validation.json>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-candidate-validation.md>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-unsigned-tx-validation.md>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-anchor-observe-report.json>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-spv-tracker-observe-report.json>
- ../evidence/trustless-burn/artifacts/<gate5-trustless-observation-reconcile-report.json>
- ../evidence/trustless-burn/<gate5-trustless-proof-acceptance-and-dup-binding.md>
- ../evidence/trustless-burn/<completed-gate5-trustless-burn-evidence.md>
- ../evidence/trustless-burn/artifacts/<trustless-validate-completed-gate5.md>
- ../evidence/security/<gate5-independent-trustless-burn-review.md>
- ../evidence/release/<completed-gate5-checklist-update-evidence.md>
- ../evidence/release/<completed-gate5-release-note-update-evidence.md>

## Do Not Provide

- Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, seed phrases, raw runtime databases, private deployment-state files, or node data directories.
- Do not provide local absolute paths, raw node config, raw SQLite state, raw deployment-state dumps, or screenshots containing private endpoints or credentials.
- Do not approve signing, transaction check, submit, broadcast, deployment, reconciliation, public release, mainnet activity, or production-ready claims through this request.

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Prerequisite map reused | yes |
| Operator packet reused | yes |
| Concrete operator execution request produced | yes |
| Secret or environment file read | no |
| Wallet recovery material or private key read | no |
| Node config secret read | no |
| Runtime database opened by request command | no |
| Private deployment state opened by request command | no |
| Node or RPC request performed by request command | no |
| Transaction signing/check/submit/broadcast/reconciliation/deployment performed | no |
| Gate 5 trustless-burn evidence claimed complete | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Mainnet-grade evidence linked | no |
| Testnet production-candidate claim authorized by request | no |
