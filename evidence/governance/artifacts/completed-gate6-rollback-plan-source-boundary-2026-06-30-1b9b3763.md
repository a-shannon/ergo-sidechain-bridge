# Gate 6 Rollback Plan Source-Boundary Evidence

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 6 rollback plan source-boundary evidence |
| Git commit | 1b9b3763 |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Governance model | Phase 010a atLeast multisig |
| Reviewer | A. Shannon |
| Date | 2026-06-30 |

## Rollback Plan

| Step | Action | Stop condition |
|---|---|---|
| Snapshot target authority | Record old public authority identifiers and new committee public identifiers before any key-rotation drill | Stop if either old or new public identifiers are unknown |
| Check singleton continuity | Verify singleton NFT, proposition bytes, value policy, and authorization metadata preservation before accepting a rotated candidate | Stop if singleton continuity cannot be proven from public evidence |
| Exercise previous-authority recovery path | Keep the previous-authority recovery path documented until deployment-state reconciliation and reviewer approval are complete | Stop if rollback depends on private runtime state or unreviewed local edits |
| Hold publication boundary | Keep governance-ready, production-ready, deployment, broadcast, and key-rotation claims blocked until release-gate evidence passes | Stop if any artifact attempts to authorize a public claim before release-gate PASS |

## Boundary

| Boundary | Value |
|---|---|
| Deployment state opened | no |
| Runtime database opened | no |
| Private key material read | no |
| Signing performed | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |

This is source-boundary rollback prerequisite evidence only. It is not deployment-state reconciliation, key-rotation completion, reviewer approval, release authorization, or transaction broadcast approval.
