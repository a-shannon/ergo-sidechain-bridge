# Gate 4 Independent Security Review Prerequisite Map - 93685ded

This packet records the current Gate 4 independent-security-review validator
result and turns the remaining blockers into the next external-review evidence
package.

It is not completed independent security review evidence. It does not support
security-review-complete, accepted-risk closure, testnet production-candidate,
production-ready, mainnet, publication, deployment, signing, reconciliation, or
broadcast claims.

No wallet recovery material, signing credential material, private deployment
state, local runtime state, private database state, or live transaction evidence
was read or used for this packet.

## Validation Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 93685ded |
| Candidate target | ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md |
| Validator report | ../evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-04-93685ded.md |
| Command | `npm run security:prerequisite-map -- --candidate ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md --validator-commit 93685ded --validator-report-out <report.md> --out <map.md>` |
| Working directory | ergo-sidechain-bridge/relayer |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 43 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | External-review prerequisite |
| --- | --- | --- |
| Review classification | 1 | Assign a concrete independent reviewer, review period, testnet scope if production deployment candidate support is requested, and final decision only after review is complete. |
| Publication decision | 2 | Keep release support, accepted-risk, critical/high, publication blocker, release-note, checklist, and claim-boundary fields blocked until review findings and accepted-risk artifacts are complete. |
| Required scope coverage | 14 | Reviewer must cover each required scope area with area-specific evidence and risk-focus notes. |
| Required evidence package | 5 | Reviewer cannot close Gate 4 until missing lifecycle, recovery, batch settlement, release-note, command-output, and prerequisite evidence exists. |
| Finding disposition | 8 | Every finding class, accepted-risk disposition, and publication blocker disposition needs linked completed evidence with exact counts. |
| Required negative review checks | 9 | Reviewer must answer each negative-check question with question-specific evidence and linked rejection coverage. |
| Reviewer sign-off | 4 | Lead reviewer, security owner, maintainer, and operator reviewer approvals remain blocked until evidence, findings, publication updates, and claim boundaries are complete. |

## External Reviewer Packet Inputs

| Packet | Required content |
| --- | --- |
| Classification packet | Review name, reviewed commit, release level, environment, concrete external reviewer organization or affiliation, organization type, lead reviewer, independent-external status, ISO review period, ISO date, and final decision. |
| Scope packet | Area-specific review evidence for ErgoScript contracts, relayer signing, AVL proof generation, settlement reconciliation, sidechain finality and burn validity, operator recovery, and dependency risk. |
| Command-evidence packet | Completed clean-checkout evidence, npm run check output, and npm run wasm:test output reviewed by the external reviewer. |
| Lifecycle packet | Fresh local devnet, fresh testnet, failed-broadcast or phantom-AVL, and batch settlement check/submit/confirm evidence once those runs exist and are in scope. |
| Recovery packet | SQLite/AVL backup-restore evidence plus recovery runbook review proving no private maintainer context is required. |
| Finding packet | Critical, high, medium, low, informational, accepted-risk, and publication-blocker disposition evidence with exact counts and linked closure artifacts. |
| Negative-check packet | Question-specific evidence for node-wallet signing, unsafe ContextExtension shape, broadcast opt-in, phantom DUP, invalid payout, same-recipient collision, stale SPV/DUP singleton digest, trusted-burn versus trustless-verification confusion, and SQLite recovery without private maintainer context. |
| Publication-update packet | Completed Gate 4 accepted-risk checklist and release-note update evidence with exact `Production-ready claim allowed = no`, exact `Critical/high findings open = 0`, exact `Publication blockers = 0`, and accepted-risk reflection only after review closure. |
| Sign-off packet | Lead reviewer, security owner, maintainer, and operator reviewer approvals matching the review classification and not predating the review date. |

## Next Evidence Sequence

| Step | Status under current authorization | Required output |
| --- | --- | --- |
| Reconfirm current Gate 4 blocker map | complete | Validator report above: BLOCKED on 43 independent-review closure issue(s). |
| Assign external reviewer | external dependency | Concrete external reviewer organization or affiliation and lead reviewer for the Review Classification rows. |
| Assemble review evidence package | blocked until missing runtime evidence exists | Current completed CI, dependency, recovery, operator, and checklist evidence plus lifecycle, recovery-observe, batch settlement, Gate 5, Gate 6, Gate 7, and release-note evidence as applicable. |
| Complete scope and negative-check review | external dependency | Area-specific scope evidence and question-specific negative-check evidence with linked artifacts. |
| Record finding and accepted-risk disposition | external dependency | Linked finding-class disposition, accepted-risk disposition, accepted-risk checklist update, and accepted-risk release-note update evidence. |
| Approve review and sign-offs | blocked until review package is complete | Final decision approve plus lead reviewer, security owner, maintainer, and operator reviewer approvals. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Security review validator completed | yes |
| External reviewer assigned | no |
| Evidence row closure claimed | no |
| Accepted-risk closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Gate 4 independent review closure claimed | no |
| Required scope prerequisites linked | no |
| Evidence package prerequisites linked | no |
| Finding disposition prerequisites linked | no |
| Negative-check prerequisites linked | no |
| Reviewer approval prerequisites linked | no |
| Runtime database or deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, reconcile, sign, audit approval, accepted-risk closure, or state mutation performed | no |
