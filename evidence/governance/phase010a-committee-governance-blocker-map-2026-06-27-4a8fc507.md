# Phase 010a Committee Governance Blocker Map - 2026-06-27 - 4a8fc507

This packet refreshes the Gate 6 committee governance blocker map at current
HEAD. It records safe public-boundary command output for demo readiness,
bridge status, and the Phase 010a committee guard spike, source-boundary MCU
Phase 2 evidence, signer-gated scope source-boundary evidence, threshold-policy
source-boundary evidence, current-head relayer check command evidence, and
current-head `npm run contracts:check` command evidence.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, testnet production-candidate, production-ready, mainnet,
deployment, key-rotation, signing, settlement, or broadcast claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this packet.

Current validation blocker report:

- artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-4a8fc507.md

## Drill Classification

| Field | Value |
|---|---|
| Drill name | Phase 010a committee guard blocker map |
| Git commit | 4a8fc507 |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Governance model | Phase 010a atLeast multisig |
| Committee threshold | 2 |
| Committee member count | 3 |
| Reviewer | A. Shannon |
| Date | 2026-06-27 |

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
| MCU Phase 2 path | permissionless PoC Phase 2 path | unchanged until Phase 011 | artifact://governance/artifacts/completed-gate6-mcu-phase2-scs-boundary-2026-06-27-b046f5e3.md; completed MCU Phase 2 source-boundary evidence records MainChainUnlock normal Phase 2 remains permissionless when the SCS DataInput carries the compile-time SCS NFT and confirmation depth; SCS redeploy changes the NFT that must be compiled into a refreshed MCU. | linked |

## Required Commands

| Command | Evidence | Status |
|---|---|---|
| npm run contracts:check | artifact://governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md; npm run contracts:check command output PASS exit code 0; check-only contract compilation; 8/8 contracts compiled; no files written | linked |
| npm run check | artifact://governance/artifacts/npm-run-check-pass-2026-06-27-069b2fe1.md; npm run check command output PASS exit code 0; 97 test files passed; 6683 tests passed | linked |
| npm run wasm:test | artifact://governance/artifacts/npm-run-wasm-test-pass-2026-06-27-069b2fe1.md; npm run wasm:test command output PASS exit code 0; 13 WASM tests passed | linked |
| npm run demo:readiness | artifact://governance/artifacts/npm-run-demo-readiness-public-boundary-2026-06-27-533277c2.md; npm run demo:readiness command output exit code 0; result BOUNDARY_ONLY; runtime database opened no; deployment state opened no; dotenv loaded no; RPC request performed no; transaction broadcast, submit, deploy, signing, reconcile, or state mutation performed no | linked |
| npm run status | artifact://governance/artifacts/npm-run-status-public-boundary-2026-06-27-533277c2.md; npm run status command output exit code 0; result BOUNDARY_ONLY; runtime database opened no; deployment state opened no; dotenv loaded no; transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed no | linked |
| spike010a-committee-guard-eval.ts | artifact://governance/artifacts/phase010a-committee-guard-public-boundary-2026-06-27-533277c2.md; spike010a-committee-guard-eval.ts command output exit code 0; result BOUNDARY_ONLY; node endpoint not used; node request no; contract compilation no; committee key generation no; signing no; transaction broadcast, submit, deploy, or state mutation performed no | linked |

## Rotation Plan

| Step | Required evidence | Status | Stop condition |
|---|---|---|---|
| Identify old committee public keys | old public keys or hashes only; old authority identifiers have not been captured | blocker | Stop if the previous signer or old committee identity is unknown |
| Identify new committee public keys | new public keys or hashes only; new 2-of-3 committee identifiers have not been captured | blocker | Stop if the target committee cannot be independently checked |
| Validate threshold policy | artifact://governance/artifacts/completed-gate6-threshold-policy-source-boundary-2026-06-27-4a8fc507.md; completed Gate 6 threshold-policy source-boundary evidence records target m/n threshold policy 2/3, quorum 2, member-loss tolerance 1, lost-key tolerance 1, threshold lower than committee member count, and no broadcast | linked | Stop if the threshold is weaker than approved policy |
| Simulate member loss or lost-key tolerance | member-loss tolerance drill has not been run | blocker | Stop if the committee cannot operate after expected member loss |
| Compile affected contracts | artifact://governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md; npm run contracts:check command output PASS exit code 0; check-only contract compilation output compiled 8/8 affected contracts and wrote no files | linked | Stop if placeholder injection or contract compilation fails |
| Evaluate old and new signer behavior | old and new signer guard behavior has not been evaluated in a node-backed non-broadcast drill | blocker | Stop if an old signer can still mutate signer-gated state |
| Preserve singleton continuity | singleton NFT, script, value, and register checks have not been captured | blocker | Stop if a singleton NFT is lost, duplicated, stale, or mismatched |
| Reconcile deployment state | deployment-state, network, and singleton reconciliation was not read or captured | blocker | Stop if network or singleton identity mismatch remains |
| Verify rollback plan | rollback and previous-authority recovery evidence has not been captured | blocker | Stop if rollback requires unreviewed local state edits |

## Positive Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| New committee executes signer-gated mutation after rotation | accepted | new-committee signer-gated mutation evidence has not been captured | blocker |
| Threshold member-loss tolerance still executes signer-gated mutation | validated | member-loss tolerance threshold and signer-gated mutation evidence has not been captured | blocker |

## Negative Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Old single signer attempts signer-gated mutation after rotation | rejected | old signer rejection evidence has not been captured | blocker |
| Non-committee signer attempts signer-gated mutation | rejected | non-committee signer rejection evidence has not been captured | blocker |
| Committee threshold below policy | rejected | below-policy threshold rejection evidence has not been captured | blocker |
| MCU references stale SCS NFT after SCS redeploy | blocked | artifact://governance/artifacts/completed-gate6-mcu-phase2-scs-boundary-2026-06-27-b046f5e3.md; completed MCU stale SCS NFT after redeploy negative-check evidence records stale SCS NFT rejection at the MainChainUnlock source boundary: normal Phase 2 requires `stateBox.tokens(0)._1` to equal the compile-time `sideChainStateNftId`, and SCS redeploy changes the NFT that must be compiled into a refreshed MCU. | linked |
| MCL emergency escape path is accidentally committee-gated | blocked | artifact://governance/artifacts/completed-gate6-mcl-emergency-escape-boundary-2026-06-26-88845fd9.md; MCL emergency escape committee-gated path blocked by completed source-boundary evidence; timeout refund branch remains separate from committeeSpend and keeps depositor recovery unchanged. | linked |
| Broadcast is enabled before readiness review | blocked | artifact://governance/artifacts/completed-gate6-negative-broadcast-before-readiness-review-2026-06-26-293351bd.md; broadcast enablement before readiness review rejected; no broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed; public-boundary output recorded for npm run demo:readiness, npm run status, and spike010a-committee-guard-eval.ts. | linked |
| Deployment state points to the wrong network | blocked | deployment-state wrong-network negative evidence has not been captured because deployment-state records were not read | blocker |

## Publication Rules

| Field | Value |
|---|---|
| Release supported | none |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Governance-ready claim allowed | no |
| Open governance blockers | 2 |
| Release notes updated | yes |
| Required release-note updates | artifact://governance/artifacts/completed-gate-6-governance-release-note-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance release-note update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required checklist updates | artifact://governance/artifacts/completed-gate-6-governance-checklist-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance checklist update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| External review evidence | completed Gate 6 governance external review evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | release support remains Release supported = none; governance-ready claim handling: Governance-ready claim allowed = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling remains incomplete with Open governance blockers = 2 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Governance owner | A. Shannon | block | 2026-06-27 | Validate Gate 6 evidence with committee identities, threshold drill, signer checks, publication updates, and external review before any governance-ready claim |
| Security reviewer | unassigned | block | 2026-06-27 | Validate committee signer negative checks, singleton continuity, and no-broadcast boundaries before any authority-transition claim |
| Operator reviewer | unassigned | block | 2026-06-27 | Validate operator command evidence, status evidence, rollback plan, and network reconciliation before any key-rotation claim |
