# Gate 3 Rehearsal Operator Packet - 1dd194a8

This packet turns the current Gate 3 rehearsal prerequisite map into
operator capture inputs and review questions. It is not completed lifecycle
or recovery evidence and does not authorize live submit, signing, settlement,
deployment, public release, or broadcast claims.

## Source Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 1dd194a8 |
| Candidate target | ../docs/live-rehearsal-template.md |
| Prerequisite map | ../evidence/rehearsal/gate3-rehearsal-prerequisite-map-2026-07-09-1dd194a8.md |
| Command | `npm run rehearsal:prerequisite-map -- --candidate ../docs/live-rehearsal-template.md --validator-commit 1dd194a8 --validator-report-out <report.md> --out <map.md> --operator-packet-out <packet.md>` |
| Current result | BLOCKED |
| Structural issues | 65 |
| Local lifecycle issues | 32 |
| Live submit/confirmation issues | 1 |
| Recovery drill issues | 2 |
| Publication-boundary issues | 17 |

## Capture Inputs

| Area | Operator must capture | Evidence to link |
| --- | --- | --- |
| Session and clean deployment | Session metadata, clean deployment-state digest, contract IDs, singleton inventory, node/RPC heights, and broadcast-disabled start/end state. | Completed live rehearsal Markdown plus command-specific preflight artifacts for deployment, height, ContextExtension guard, and broadcast policy output. |
| Dry-run settlement | Peg-in, peg-out burn, anchor, Expected transaction ID, aggregate prebroadcast/check output, approvals, and `/transactions/check` PASS evidence. | Aggregate prebroadcast JSON, approvals v2, check evidence, burn/order bindings, sidechain block hash, bridge event root, and Ergo anchor height. |
| Live submit and finality | Only after explicit approval: submitted transaction ID, confirmation/finality evidence, and matching Expected transaction ID. | Live-preflight JSON, post-submit observe JSON, finality artifact, and completed confirmation evidence with required/observed counts. |
| Reconciliation | Submitted DUP successor, submitted SPV tracker successor, recipient payout box, successor values, and peg-out burn binding. | Post-submit observe JSON plus reconciliation rows in the completed rehearsal Markdown. |
| Recovery drills | Failed-broadcast/phantom-AVL and reorged-burn/stale-singleton read-only observations without repair, mutation, submit, or broadcast. | Recovery-observe JSON reports, validation transcripts, and assembled recovery row artifacts for both recovery kinds. |
| Publication and reviewer boundary | Release-note and checklist updates plus reviewer sign-off that keeps production-ready and testnet production-candidate claims blocked by the rehearsal itself. | Completed Gate 3 publication update targets and reviewer sign-off dated not before Session Metadata Date. |

## Decision Questions

| Question | Approving answer | Blocked answer |
| --- | --- | --- |
| Can the local devnet or testnet lifecycle row move to pass? | Yes, only when all lifecycle rows, concrete evidence artifacts, linked JSON reports, and rehearsal validation transcript are complete and internally consistent. | No, if any row remains publication blocker, uses placeholder evidence, lacks JSON binding, or omits required transaction, anchor, height, submit, confirmation, or reconciliation facts. |
| Can live submit or confirmation be treated as captured? | Yes, only after explicit live-run approval and evidence showing submitted transaction ID, confirmation/finality, and reconciliation match the approved Expected transaction ID. | No, if approval is missing, broadcast scope is ambiguous, transaction IDs drift, or confirmation/finality evidence is incomplete. |
| Can recovery drill rows be accepted? | Yes, only with validated read-only recovery-observe JSON and row artifacts for the required failed-broadcast and stale-singleton cases. | No, if the observation reads a default runtime database, serializes private runtime paths, mutates state, repairs, submits, broadcasts, or omits validator PASS output. |
| Can the rehearsal support public claim escalation? | No. Completed Gate 3 rehearsal evidence can support release-gate evaluation only while preserving production-ready and testnet production-candidate claim denials in this rehearsal packet. | Blocked if the evidence approves production-ready, mainnet, unqualified release, or testnet production-candidate claims from the rehearsal itself. |

## Required Output Bindings

- Broadcast mode at start = disabled
- Broadcast mode at end = disabled
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no
- rehearsal:validate PASS
- validated target = completed live rehearsal Markdown

## Completion Checklist

| Item | Validator dependency |
| --- | --- |
| Link a completed live rehearsal Markdown target and distinct rehearsal validation transcript. | Transcript binding and lifecycle rows. |
| Link all required JSON reports consumed by rehearsal validation. | Linked JSON evidence. |
| Capture submit, confirmation, finality, and reconciliation only after explicit live-run approval. | Submit and confirmation plus reconciliation evidence. |
| Link both recovery-observe JSON reports and assembled recovery rows when recovery rows are checked. | Recovery drill lifecycle rows and recovery-observe JSON validation. |
| Record publication updates and reviewer sign-off with exact claim-boundary denials. | Publication evidence and reviewer sign-off. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Derived from Gate 3 prerequisite map | yes |
| Completed live rehearsal evidence claimed | no |
| Evidence row closure claimed | no |
| Gate 3 lifecycle closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Live execution approval granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |
