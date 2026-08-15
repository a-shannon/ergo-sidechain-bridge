# Gate 6 External Governance Review Packet - 42ab576f

This packet turns the current Gate 6 committee governance prerequisite map into external reviewer inputs and decision questions.
It is not completed committee governance evidence and does not authorize governance-ready, release, deployment, key-rotation, signing, settlement, or broadcast claims.

## Source Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 42ab576f |
| Candidate target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-02-cb31d9f3.md |
| Prerequisite map | ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-42ab576f.md |
| Command | `npm run governance:prerequisite-map -- --candidate ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-02-cb31d9f3.md --validator-commit 42ab576f --validator-report-out <report.md> --out <map.md> --review-packet-out <packet.md>` |
| Current result | BLOCKED |
| Structural issues | 10 |
| External review required | yes |
| Reviewer approval issues | 3 |
| Publication-boundary issues | 6 |

## Review Inputs

| Area | Reviewer must confirm | Evidence to inspect |
| --- | --- | --- |
| Governance model and threshold | Committee or multisig governance is used, threshold is at least 2, member count is at least 3, and threshold is lower than member count. | Completed committee classification plus scope evidence naming old and new committee public key or hash identifiers. |
| Deployment-state reconciliation | Sanitized reconciliation binds network, sidechain id, singleton identity, previous authority, target committee authority, and rollback state. | Completed reconciliation report and command output for npm run governance:reconcile:validate with exit code 0. |
| Wrong-network rejection | A mismatched deployment-state network blocks the rotation path before any key-rotation, deploy, submit, or broadcast step. | Completed wrong-network negative evidence and sanitized governance:reconcile:validate command output with exit code 0. |
| Signer and key-rotation safety | Old and new committee identifiers are disjoint, signer threshold behavior is bounded, rollback or stop conditions are actionable, and no single-signer fallback is approved. | Rotation, positive-check, negative-check, member-loss, singleton continuity, and emergency-boundary evidence rows. |
| No-broadcast boundary | Broadcast mode is disabled or dry-run, and the evidence did not sign, rotate keys, mutate deployment state, deploy, submit, or broadcast. | Command-specific output evidence plus reviewer notes and boundary rows. |
| External review target | Completed external governance/key-rotation review evidence is concrete, distinct from release-note and checklist update evidence, and includes exact claim-boundary bindings. | External review evidence target linked from the Gate 6 publication rules. |

## Decision Questions

| Question | Approving answer | Blocked answer |
| --- | --- | --- |
| Can the external governance/key-rotation review target be accepted? | Yes, with a concrete completed external review evidence target that includes the exact required claim-boundary bindings. | No, if the target is missing, generic, reused as publication-update evidence, or lacks exact claim-boundary bindings. |
| Are all Gate 6 governance blockers closed? | Yes, with exact Open governance blockers = 0 in publication fields and reviewer decision summary. | No, if any blocker remains open or closure is expressed only with prose, shorthand, or zero-like wording. |
| Can the governance-ready claim be allowed for the testnet candidate boundary? | Yes, only with exact Governance-ready claim allowed = yes, Testnet production-candidate claim allowed = yes, and Production-ready claim allowed = no. | No, if the evidence approves mainnet, production-ready, single-signer fallback, or unqualified release wording. |
| Can Gate 6 reviewer sign-offs move to approve? | Yes, after governance owner, security reviewer, and operator reviewer each approve with dates not before the drill classification date. | No, if any reviewer blocks, omits a date, predates the classification, or leaves claim/key-rotation boundaries ambiguous. |

## Required Output Bindings

- Release supported = production deployment candidate
- Governance-ready claim allowed = yes
- Production-ready claim allowed = no
- Testnet production-candidate claim allowed = yes
- Open governance blockers = 0
- Release notes updated = yes

## Completion Checklist

| Item | Validator dependency |
| --- | --- |
| Link completed external governance/key-rotation review evidence. | Publication Rules: External review evidence. |
| Set publication and reviewer-summary fields to exact closure values only after reviewer acceptance. | Publication Rules: release support, governance-ready claim, and open blocker fields. |
| Record governance owner approval after evidence closure. | Reviewer Sign-Off: Governance owner. |
| Record security reviewer approval after signer, singleton, wrong-network, and no-broadcast checks. | Reviewer Sign-Off: Security reviewer. |
| Record operator reviewer approval after drill and rollback evidence review. | Reviewer Sign-Off: Operator reviewer. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Derived from Gate 6 prerequisite map | yes |
| Completed external review evidence claimed | no |
| Evidence row closure claimed | no |
| Gate 6 committee governance closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Governance-ready claim authorized by this packet | no |
| Key rotation authorization granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |
