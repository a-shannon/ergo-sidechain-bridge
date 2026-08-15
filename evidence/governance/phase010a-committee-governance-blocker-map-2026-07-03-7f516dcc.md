# Phase 010a Committee Governance Blocker Map - 2026-07-03 - 7f516dcc

This packet refreshes the Gate 6 committee governance blocker map at commit
7f516dcc. It records current safe command output for the relayer check suite,
the WASM AVL crate tests, demo-readiness public-boundary output, bridge-status
public-boundary output, and the Phase 010a committee guard public-boundary
output. It keeps the existing source-boundary, non-broadcast, signer-behavior,
local reconciliation, and wrong-network evidence bindings, while leaving
external review, publication-rule closure, and reviewer approvals as blockers.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, testnet production-candidate, production-ready, mainnet,
deployment, key-rotation, signing, settlement, or broadcast claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this packet.

Current validation blocker report:

- artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-03-7f516dcc.md

## Drill Classification

| Field | Value |
|---|---|
| Drill name | Phase 010a committee guard blocker map |
| Git commit | 7f516dcc |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Governance model | Phase 010a atLeast multisig |
| Committee threshold | 2 |
| Committee member count | 3 |
| Reviewer | A. Shannon |
| Date | 2026-07-03 |

## Scope

| Surface | Current authority | Target authority | Evidence | Status |
|---|---|---|---|---|
| SideChainState successor authorization | public source template atLeast committee guard | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records SideChainState atLeast committee guard, R9 authorization metadata preservation, singleton preservation, contract preservation, value preservation, and no broadcast | linked |
| DUP authorization | public source template atLeast committee guard | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records DUP atLeast committee guard, R6 authorization metadata preservation, singleton preservation, contract preservation, value preservation, and no broadcast | linked |
| Aggregate DUP authorization | public source template atLeast committee guard | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records aggregate DUP atLeast committee guard, OUTPUTS(1) successor binding, R6 authorization metadata preservation, singleton preservation, contract preservation, value preservation, and no broadcast | linked |
| Batch DUP authorization | public source template atLeast committee guard | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records batch DUP atLeast committee guard, batched burn TX ID checks, OUTPUTS(1) successor binding, R6 authorization metadata preservation, singleton preservation, contract preservation, value preservation, and no broadcast | linked |
| MainChainLock normal path | public source template atLeast committee guard | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records MainChainLock normal path committeeSpend equals atLeast committee guard while the emergency escape path remains separately covered, and no broadcast | linked |
| MainChainLock emergency escape path | permissionless after timeout | unchanged permissionless after timeout | artifact://governance/artifacts/completed-gate6-mcl-emergency-escape-boundary-2026-06-26-88845fd9.md; completed MCL emergency escape source-boundary evidence records that the timeout refund branch remains separate from committeeSpend and keeps the target authority unchanged. | linked |
| SPVTracker ingest authorization | public source template R6 SigmaProp committee guard | Phase 010a multisig SigmaProp target authority | artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md; completed Gate 6 signer-gated scope source-boundary evidence records SPVTracker SELF.R6 SigmaProp authorization, successor R6 preservation, tracker update gate, and no broadcast | linked |
| MCU Phase 2 path | immutable legacy v1 permissionless UTXOs remain on their original script; new legacy MCU creation and spend are disabled and existing boxes are quarantined | transitional committee containment for new MCU source only, pending replacement by Phase 011 / Gate 5 on-chain burn-proof acceptance | artifact://governance/artifacts/completed-gate6-mcu-phase2-scs-boundary-2026-06-27-b046f5e3.md records the immutable legacy v1 permissionless source boundary; the current MainChainUnlock source and focused committee-guard evaluation add transitional committee containment without changing legacy UTXOs, deploying, signing, submitting, or broadcasting | linked |

## Required Commands

| Command | Evidence | Status |
|---|---|---|
| npm run contracts:check | artifact://governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md; npm run contracts:check command output PASS exit code 0; check-only contract compilation; 8/8 contracts compiled; no files written | linked |
| npm run check | artifact://governance/artifacts/npm-run-check-pass-2026-07-03-7f516dcc.md; npm run check command output PASS exit code 0; 117 test files passed; 6882 tests passed | linked |
| npm run wasm:test | artifact://governance/artifacts/npm-run-wasm-test-pass-2026-07-03-7f516dcc.md; npm run wasm:test command output PASS exit code 0; 13 WASM tests passed | linked |
| npm run demo:readiness | artifact://governance/artifacts/npm-run-demo-readiness-public-boundary-2026-07-03-7f516dcc.md; npm run demo:readiness command output exit code 0; result BOUNDARY_ONLY; runtime database opened no; deployment state opened no; dotenv loaded no; RPC request performed no; transaction broadcast, submit, deploy, signing, reconcile, or state mutation performed no | linked |
| npm run status | artifact://governance/artifacts/npm-run-status-public-boundary-2026-07-03-7f516dcc.md; npm run status command output exit code 0; result BOUNDARY_ONLY; runtime database opened no; deployment state opened no; dotenv loaded no; transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed no | linked |
| spike010a-committee-guard-eval.ts | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; spike010a-committee-guard-eval.ts command output PASS exit code 0; node-backed testnet height 355287; contracts compiled; committee threshold signer quorum evaluated yes; member-loss tolerance evaluated yes; below-threshold rejection evaluated yes; old single signer rejection evaluated yes; non-committee rejection evaluated yes; transaction broadcast, submit, deploy, or state mutation performed no; current public-boundary prerequisite output artifact://governance/artifacts/phase010a-committee-guard-public-boundary-2026-07-03-7f516dcc.md confirms no node credential, node request, key generation, signing, key rotation authorization, submit, deploy, broadcast, or state mutation in the current refresh | linked |

## Rotation Plan

| Step | Required evidence | Status | Stop condition |
|---|---|---|---|
| Identify old committee public keys | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; old public key/hash identifier captured for the source-boundary previous authority: old single signer 02759c8f961953ef1c294198b7d6edee2c99b71b7c6a028b109558b513ca9df290; deployment-state reconciliation still separate | linked | Stop if the previous signer or old committee identity is unknown |
| Identify new committee public keys | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; new public key/hash identifiers captured for the source-boundary 2-of-3 committee: new committee member 1 039afa1f00610cd4789e2fb86f43d0b3738456a2bf5b8d5e353d645b8f86997148; new committee member 2 020f770d2aaabebde1b605c50e316411ae2c0df8a688b0f1a53d67f07ce4130e1f; new committee member 3 02a1f16e9759100e893f8594f8ed895fed584b4dcbb7569b42fa678f0fa5276881; deployment-state reconciliation still separate | linked | Stop if the target committee cannot be independently checked |
| Validate threshold policy | artifact://governance/artifacts/completed-gate6-threshold-policy-source-boundary-2026-06-27-4a8fc507.md; completed Gate 6 threshold-policy source-boundary evidence records target m/n threshold policy 2/3, quorum 2, member-loss tolerance 1, lost-key tolerance 1, threshold lower than committee member count, and no broadcast | linked | Stop if the threshold is weaker than approved policy |
| Simulate member loss or lost-key tolerance | artifact://governance/artifacts/completed-gate6-member-loss-threshold-safety-source-boundary-2026-06-29-442a1b08.md; completed Gate 6 member-loss threshold safety source-boundary evidence records m/n threshold policy 2/3, quorum 2, member-loss tolerance 1, lost-key tolerance 1, threshold lower than committee member count, and no broadcast | linked | Stop if the committee cannot operate after expected member loss |
| Compile affected contracts | artifact://governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md; npm run contracts:check command output PASS exit code 0; check-only contract compilation output compiled 8/8 affected contracts and wrote no files | linked | Stop if placeholder injection or contract compilation fails |
| Evaluate old and new signer behavior | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; node-backed non-broadcast drill evaluated old and new signer guard behavior; new 2-of-3 committee quorum accepted signer-gated mutation; old single signer rejected after rotation; transaction broadcast, submit, deploy, or state mutation performed no | linked | Stop if an old signer can still mutate signer-gated state |
| Preserve singleton continuity | artifact://governance/artifacts/completed-gate6-singleton-continuity-source-boundary-2026-06-29-442a1b08.md; completed Gate 6 singleton continuity source-boundary evidence records singleton NFT, propositionBytes script, value, R6/R9 register authorization metadata preservation, and no broadcast | linked | Stop if a singleton NFT is lost, duplicated, stale, or mismatched |
| Reconcile deployment state | artifact://governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-02-6ef319cd.json; artifact://governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-02-9c433c72.md; deployment-state network singleton reconciliation; npm run governance:reconcile:validate sanitized command output PASS exit code 0; expected network testnet; observed network testnet; old authority identifier count 1; new committee threshold 2/3; rollback binding linked; private deployment state opened no; transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed no | linked | Stop if network, singleton, authority, or rollback binding mismatches |
| Verify rollback plan | artifact://governance/artifacts/completed-gate6-rollback-plan-source-boundary-2026-06-30-1b9b3763.md; rollback previous-authority recovery path recorded as source-boundary prerequisite evidence; deployment-state reconciliation, reviewer approval, key rotation, signing, and broadcast remain out of scope | linked | Stop if rollback requires unreviewed local state edits |

## Positive Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| New committee executes signer-gated mutation after rotation | accepted | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; new committee signer-gated mutation accepted by threshold signers 039afa1f00610cd4789e2fb86f43d0b3738456a2bf5b8d5e353d645b8f86997148 020f770d2aaabebde1b605c50e316411ae2c0df8a688b0f1a53d67f07ce4130e1f; transaction broadcast, submit, deploy, or state mutation performed no | linked |
| Threshold member-loss tolerance still executes signer-gated mutation | validated | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; member-loss tolerance threshold quorum signer-gated mutation validated by 039afa1f00610cd4789e2fb86f43d0b3738456a2bf5b8d5e353d645b8f86997148 02a1f16e9759100e893f8594f8ed895fed584b4dcbb7569b42fa678f0fa5276881; transaction broadcast, submit, deploy, or state mutation performed no | linked |

## Negative Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Old single signer attempts signer-gated mutation after rotation | rejected | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; old signer 02759c8f961953ef1c294198b7d6edee2c99b71b7c6a028b109558b513ca9df290 rejected for signer-gated mutation after rotation; transaction broadcast, submit, deploy, or state mutation performed no | linked |
| Non-committee signer attempts signer-gated mutation | rejected | artifact://governance/artifacts/phase010a-committee-guard-node-backed-old-signer-2026-06-29-18cfa41d.md; non-committee signer 03ea41cba462303dc55c9e337558755799d33cfafc7a682e992e9385af6d97fb57 rejected for signer-gated mutation; transaction broadcast, submit, deploy, or state mutation performed no | linked |
| Committee threshold below policy | rejected | artifact://governance/artifacts/completed-gate6-below-policy-threshold-rejection-2026-06-29-01618d02.md; completed Gate 6 below-policy threshold rejection evidence records Committee threshold below policy rejected, committee threshold 1 below minimum 2, policy validation performed before node request, Ergo node request no, node API credential read no, ephemeral committee key generated no, signing no, transaction broadcast, submit, deploy, or state mutation performed no | linked |
| MCU references stale SCS NFT after SCS redeploy | blocked | artifact://governance/artifacts/completed-gate6-mcu-phase2-scs-boundary-2026-06-27-b046f5e3.md; completed MCU stale SCS NFT after redeploy negative-check evidence records stale SCS NFT rejection at the MainChainUnlock source boundary: normal Phase 2 requires `stateBox.tokens(0)._1` to equal the compile-time `sideChainStateNftId`, and SCS redeploy changes the NFT that must be compiled into a refreshed MCU. | linked |
| MCL emergency escape path is accidentally committee-gated | blocked | artifact://governance/artifacts/completed-gate6-mcl-emergency-escape-boundary-2026-06-26-88845fd9.md; MCL emergency escape committee-gated path blocked by completed source-boundary evidence; timeout refund branch remains separate from committeeSpend and keeps depositor recovery unchanged. | linked |
| Broadcast is enabled before readiness review | blocked | artifact://governance/artifacts/completed-gate6-negative-broadcast-before-readiness-review-2026-06-26-293351bd.md; broadcast enablement before readiness review rejected; no broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed; public-boundary output recorded for npm run demo:readiness, npm run status, and spike010a-committee-guard-eval.ts. | linked |
| Deployment state points to the wrong network | blocked | artifact://governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-02-6ef319cd.json; artifact://governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-02-9c433c72.md; deployment-state wrong-network rejection; npm run governance:reconcile:validate sanitized command output PASS exit code 0; expected network testnet; observed network patched-devnet; network binding matched false; governance rotation blocked because deployment-state network mismatch; private deployment state opened no; transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed no | linked |

## Publication Rules

| Field | Value |
|---|---|
| Release supported | none |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Governance-ready claim allowed | no |
| Open governance blockers | 4 |
| Release notes updated | yes |
| Required release-note updates | artifact://governance/artifacts/completed-gate-6-governance-release-note-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance release-note update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required checklist updates | artifact://governance/artifacts/completed-gate-6-governance-checklist-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance checklist update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| External review evidence | completed Gate 6 governance external review evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | release support remains Release supported = none; governance-ready claim handling: Governance-ready claim allowed = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling remains incomplete with Open governance blockers = 4 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Governance owner | A. Shannon | block | 2026-07-03 | Validate Gate 6 evidence with committee identities, threshold drill, signer checks, publication updates, and external review before any governance-ready claim |
| Security reviewer | unassigned | block | 2026-07-03 | Validate committee signer negative checks, singleton continuity, no-broadcast boundaries, and external review before any authority-transition claim |
| Operator reviewer | unassigned | block | 2026-07-03 | Validate operator command evidence, status evidence, rollback plan, network reconciliation, and external review before any key-rotation claim |
