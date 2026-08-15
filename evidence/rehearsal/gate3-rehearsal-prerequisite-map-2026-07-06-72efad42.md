# Gate 3 Rehearsal Prerequisite Map - 72efad42

This packet records the current Gate 3 rehearsal validator result for the
selected live rehearsal candidate and converts the remaining blockers into
operator evidence prerequisites.

It is not completed Gate 3 lifecycle or recovery-drill evidence. It does not
support live submit, confirmation, reconciliation, production-ready, mainnet,
testnet production-candidate, deployment, signing, settlement, or broadcast claims.

No wallet recovery material, signing credential material, private deployment
state, local runtime state, private database state, or live transaction evidence
was read or used for this packet.

## Validation Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 72efad42 |
| Candidate target | ../docs/live-rehearsal-template.md |
| Validator report | ../evidence/rehearsal/artifacts/rehearsal-validate-live-rehearsal-template-blocked-2026-07-06-72efad42.md |
| Command | `npm run rehearsal:prerequisite-map -- --candidate ../docs/live-rehearsal-template.md --validator-commit 72efad42 --validator-report-out <report.md> --out <map.md>` |
| Working directory | ergo-sidechain-bridge/relayer |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 65 |
| Stack trace emitted | no |
| Local path emitted | no |

## Exact Remaining Validator Issues

| Issue | Evidence prerequisite |
| --- | --- |
| Rehearsal Evidence: evidence hygiene must not contain runtime database, deployment-state, or diagnostic dump artifacts | Replace placeholders and unsafe evidence markers with concrete completed artifacts; do not link environment files, private deployment records, runtime databases, local paths, diagnostic dumps, or secret-bearing targets. |
| Session Metadata: Date is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Operator is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Reviewer is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Environment is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Git commit is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Release level being evaluated is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Ergo node network is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Session Metadata: Sidechain network is required | Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields. |
| Reviewer Sign-Off: Classification is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Reviewer Sign-Off: Publication blockers discovered is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Reviewer Sign-Off: Follow-up tests required is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Reviewer Sign-Off: Follow-up runbook changes required is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Reviewer Sign-Off: Reviewer is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Reviewer Sign-Off: Date is required | Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists. |
| Preflight Evidence: Clean-checkout checks passed is required | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Broadcast policy result is required | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Deployed singleton status is required | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Liquidity status is required | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: ContextExtension guard result must include a link, command, or artifact marker | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Current Ergo height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Current sidechain height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Dry-Run Settlement Evidence: Peg-in event ID or TX ID is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Peg-out burn TX ID is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Sidechain block height is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Sidechain block hash is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Bridge event root is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Ergo anchor height is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Aggregate claim count is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Input count is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Output count is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: ContextExtension key counts per input is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: `/transactions/check` result is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Expected transaction ID is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Dry-Run Settlement Evidence: Daemon approval evidence is required | Capture dry-run settlement evidence with Expected transaction ID, peg-out burn binding, aggregate prebroadcast/check output, approvals v2, `/transactions/check` PASS output, and non-mainnet node/network bindings. |
| Rollback And Cleanup: Broadcast disabled in all shells is required | Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified. |
| Rollback And Cleanup: Runtime state files preserved but not staged is required | Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified. |
| Rollback And Cleanup: Logs archived is required | Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified. |
| Rollback And Cleanup: Incident or regression issue opened if needed is required | Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified. |
| Rollback And Cleanup: Regression test or runbook update needed is required | Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified. |
| Publication Evidence: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: production claim wording is not allowed in Gate 3 publication evidence; claim fields must remain no | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Release notes updated is required | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Pending Evidence Register updated is required | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required release-note updates must use exact Production-ready claim allowed by this rehearsal: no | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required release-note updates must use exact Testnet production-candidate claim allowed by this rehearsal: no | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required checklist updates must use exact Production-ready claim allowed by this rehearsal: no | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Publication Evidence: Required checklist updates must use exact Testnet production-candidate claim allowed by this rehearsal: no | Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings. |
| Preflight Evidence: Current Ergo height must be a non-negative integer | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Preflight Evidence: Current sidechain height must be a non-negative integer | Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output. |
| Fresh local devnet lifecycle: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Fresh testnet lifecycle: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Peg-in evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Peg-out burn evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Anchor evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Settlement check evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows. |
| Settlement submit evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Only after explicit live-run approval, link concrete settlement-submit evidence with submitted transaction ID matching the approved Expected transaction ID and preserved broadcast-scope evidence. |
| Confirmation evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Only after explicit live-run approval, link submitted transaction ID, required/observed confirmation counts, finality evidence, and confirmation-policy PASS output matching the Expected transaction ID. |
| Reconciliation evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Link post-submit reconciliation evidence for submitted DUP successor, SPV tracker successor, recipient payout box, successor values, and peg-out burn TX ID. |
| Failed broadcast / phantom AVL evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Capture failed-broadcast/phantom-AVL read-only recovery-observe JSON, validate it with `npm run rehearsal:recovery-observe:validate`, and assemble the recovery row without repair, state mutation, submit, or broadcast authorization. |
| Reorged burn / stale singleton evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Capture reorged-burn/stale-singleton read-only recovery-observe JSON, validate it with `npm run rehearsal:recovery-observe:validate`, and assemble the recovery row with singleton inventory and burn bindings. |
| Backup-restore or reconstructibility evidence: status must be one of pass, fail, inconclusive, not applicable, publication blocker | Link completed backup-restore or reconstructibility evidence, or keep the row as a publication blocker with the next required recovery evidence clearly stated. |

## Next Evidence Sequence

| Step | Status under current authorization | Required output |
| --- | --- | --- |
| Reconfirm current rehearsal candidate | complete | Validator report above: BLOCKED with 65 structural issue(s). |
| Complete session metadata, preflight, and clean deployment evidence | operator evidence required | Completed Session Metadata, clean deployment-state evidence, deployment digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM coverage, and broadcast-disabled boundaries. |
| Capture lifecycle and dry-run settlement evidence | operator evidence required | Peg-in, peg-out burn, anchor, settlement-check, Expected transaction ID, aggregate prebroadcast/check evidence, approval evidence, and non-mainnet network bindings. |
| Bind required rehearsal JSON reports | complete | Linked rehearsal JSON reports are concrete and validator-accepted. |
| Submit, confirm, and reconcile only after explicit live approval | blocked until explicit live-run approval and completed runtime evidence exist | Submitted transaction ID, confirmation/finality evidence, submitted DUP and SPV tracker successor boxes, recipient payout box, and burn-bound reconciliation evidence that match the approved Expected transaction ID. |
| Capture recovery drill observations | blocked until read-only node/state observation targets exist | Completed failed-broadcast/phantom-AVL and reorged-burn/stale-singleton recovery-observe JSON reports, validation transcripts, and assembled recovery rows with no repair, mutation, submit, or broadcast authorization. |
| Complete publication updates and reviewer sign-off | blocked until evidence closure is available | Release-note and checklist update evidence, exact `Production-ready claim allowed by this rehearsal: no`, exact `Testnet production-candidate claim allowed by this rehearsal: no`, and reviewer sign-off with dates not before Session Metadata Date. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Rehearsal validator completed | yes |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Gate 3 lifecycle closure claimed | no |
| Completed local devnet lifecycle claimed | no |
| Completed testnet lifecycle claimed | no |
| Recovery drill closure claimed | no |
| Live execution approval granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |
