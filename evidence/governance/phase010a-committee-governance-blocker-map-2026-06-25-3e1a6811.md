# Phase 010a Committee Governance Blocker Map - 2026-06-25 - 3e1a6811

This packet converts the current Phase 010a governance status into the
validator-required section layout. It is not completed Gate 6 committee
governance evidence and does not support governance-ready, testnet
production-candidate, mainnet, or completed key-rotation claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, or live transaction evidence was read or used for
this packet.

Current validation blocker report:

- artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-6815f77a.md
- artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-cef3eed2.md

## Drill Classification

| Field | Value |
|---|---|
| Drill name | Phase 010a committee guard blocker map |
| Git commit | 3e1a6811 |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Governance model | Phase 010a atLeast multisig |
| Committee threshold | 2 |
| Committee member count | 3 |
| Reviewer | A. Shannon |
| Date | 2026-06-25 |

## Scope

| Surface | Current authority | Target authority | Evidence | Status |
|---|---|---|---|---|
| SideChainState successor authorization | single signer PoC authority | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md shows the non-broadcast guard evaluation did not reach contract compilation | blocker |
| DUP authorization | single signer PoC authority | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md shows the non-broadcast guard evaluation did not reach DUP evaluation | blocker |
| Aggregate DUP authorization | single signer PoC authority | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md shows the non-broadcast guard evaluation did not reach aggregate DUP evaluation | blocker |
| Batch DUP authorization | single signer PoC authority | Phase 010a atLeast multisig target authority | batch DUP authority evidence has not been captured in a completed Gate 6 drill | blocker |
| MainChainLock normal path | single signer PoC authority | Phase 010a atLeast multisig target authority | artifact://governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md shows the non-broadcast guard evaluation did not reach MainChainLock evaluation | blocker |
| MainChainLock emergency escape path | permissionless after timeout | unchanged permissionless after timeout | emergency escape continuity has not been proven by a completed Gate 6 drill | blocker |
| SPVTracker ingest authorization | single signer PoC authority | Phase 010a atLeast multisig target authority | SPVTracker ingest authority evidence has not been captured in a completed Gate 6 drill | blocker |
| MCU Phase 2 path | permissionless PoC Phase 2 path | unchanged until Phase 011 | MCU Phase 2 continuity has not been proven by a completed Gate 6 drill | blocker |

## Required Commands

| Command | Evidence | Status |
|---|---|---|
| npm run contracts:check | artifact://governance/artifacts/contracts-check-safe-mode-node-unavailable-2026-06-25.md records BLOCKED exit code 1 because the local Ergo node endpoint refused the check-only contract compilation prerequisite | blocker |
| npm run check | artifact://governance/artifacts/npm-run-check-pass-2026-06-25-aeb20401.md; npm run check command output PASS exit code 0; 90 test files passed; 6635 tests passed | linked |
| npm run wasm:test | artifact://governance/artifacts/npm-run-wasm-test-pass-2026-06-25-aeb20401.md; npm run wasm:test command output PASS exit code 0; 13 WASM tests passed | linked |
| npm run demo:readiness | demo readiness output has not been captured as Gate 6 command evidence | blocker |
| npm run status | bridge status output has not been captured as Gate 6 command evidence | blocker |
| spike010a-committee-guard-eval.ts | artifact://governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md records BLOCKED exit code 1 because 127.0.0.1:9052 refused the local node connection, with no private key material serialized and no broadcast, submit, deploy, or state mutation performed | blocker |

## Rotation Plan

| Step | Required evidence | Status | Stop condition |
|---|---|---|---|
| Identify old committee public keys | old public keys or hashes only; old authority identifiers have not been captured | blocker | Stop if the previous signer or old committee identity is unknown |
| Identify new committee public keys | new public keys or hashes only; new 2-of-3 committee identifiers have not been captured | blocker | Stop if the target committee cannot be independently checked |
| Validate threshold policy | target m/n threshold policy is 2/3; quorum and lost-key tolerance have not been validated | blocker | Stop if the threshold is weaker than approved policy |
| Simulate member loss or lost-key tolerance | member-loss tolerance drill has not been run | blocker | Stop if the committee cannot operate after expected member loss |
| Compile affected contracts | artifact://governance/artifacts/contracts-check-safe-mode-node-unavailable-2026-06-25.md records that check-only contract compilation is blocked until a local Ergo node is available | blocker | Stop if placeholder injection or contract compilation fails |
| Evaluate old and new signer behavior | old and new signer guard behavior has not been evaluated because the spike blocked before compilation | blocker | Stop if an old signer can still mutate signer-gated state |
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
| MCU references stale SCS NFT after SCS redeploy | blocked | MCU stale SCS NFT after redeploy evidence has not been captured | blocker |
| MCL emergency escape path is accidentally committee-gated | blocked | MCL emergency escape committee-gated negative evidence has not been captured | blocker |
| Broadcast is enabled before readiness review | blocked | broadcast readiness review negative evidence has not been captured | blocker |
| Deployment state points to the wrong network | blocked | deployment-state wrong-network negative evidence has not been captured | blocker |

## Publication Rules

| Field | Value |
|---|---|
| Release supported | none |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Governance-ready claim allowed | no |
| Open governance blockers | 12 |
| Release notes updated | yes |
| Required release-note updates | artifact://governance/artifacts/completed-gate-6-governance-release-note-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance release-note update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required checklist updates | artifact://governance/artifacts/completed-gate-6-governance-checklist-update-evidence-2026-06-26-cef3eed2.md completed Gate 6 governance checklist update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| External review evidence | completed Gate 6 governance external review evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | release support remains Release supported = none; governance-ready claim handling: Governance-ready claim allowed = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling remains incomplete |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Governance owner | A. Shannon | block | 2026-06-25 | Validate Gate 6 evidence with committee identities, threshold drill, signer checks, command evidence, publication updates, and external review |
| Security reviewer | unassigned | block | 2026-06-25 | Validate committee signer negative checks, singleton continuity, and no-broadcast boundaries |
| Operator reviewer | unassigned | block | 2026-06-25 | Validate operator command evidence, status evidence, rollback plan, and network reconciliation |
