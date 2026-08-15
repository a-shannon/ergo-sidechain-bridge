# Gate 5 Trustless Burn Operator Packet - 1a24c7ae

This packet turns the current Gate 5 trustless-burn prerequisite map into
operator capture inputs and review questions. It is not completed protocol
evidence and does not authorize settlement, reconciliation, signing,
deployment, public release, or broadcast claims.

## Source Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 1a24c7ae |
| Candidate target | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-07-03-1a24c7ae.md |
| Prerequisite map | ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-1a24c7ae.md |
| Command | `npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-07-03-1a24c7ae.md --validator-commit 1a24c7ae --validator-report-out <report.md> --out <map.md> --operator-packet-out <packet.md>` |
| Current result | BLOCKED |
| Structural issues | 21 |
| Anchoring issues | 1 |
| Tracker/finality issues | 1 |
| Proof acceptance issues | 3 |
| Reviewer approval issues | 6 |
| Publication-boundary issues | 10 |

## Capture Inputs

| Area | Operator must capture | Evidence to link |
| --- | --- | --- |
| Proof-path identity | Sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path. | Completed proof-path packet, proof-vector validation JSON report, and burn-proof rows that all bind the same identifiers. |
| Extension anchoring | Sanitized public extension-observation JSON and a completed trustless:anchor-observe JSON report for the selected non-mainnet height window. | Anchor observation report with LINKED status, 0x04xx key, bridgeEventRoot, anchor height, public source provenance, and no-claim boundary. |
| SPV tracker and finality | Sanitized public tracker history, expected sidechain entry, tracker digest, proof digest, and finality binding for the same bridgeEventRoot and anchor height. | SPV tracker observation report plus observation reconciliation report matching anchor, tracker, proof-vector, and settlement-binding evidence. |
| Proof acceptance and DUP settlement | Positive proof acceptance and settlement assembly evidence proving the accepted burn ID is the DUP key and recipient/amount bindings survive payout assembly. | Accepted burn proof evidence, DUP insert binding, payout recipient and amount binding, and negative rejection evidence for malformed or stale cases. |
| Independent review | Protocol, security, and operator review outcomes after finality, anchoring, proof format, DUP binding, fallback disablement, and no-broadcast boundaries are concrete. | Independent review evidence plus reviewer sign-off rows with dates not before Evidence Classification Date. |
| Publication boundary | Release-note and checklist updates that keep production-ready/mainnet claims blocked while allowing only bounded testnet production-candidate support after Gate 5 closure. | Publication decision rows and reviewer decision summary with exact release-support, implementation, fallback-disablement, and critical/high closure bindings. |

## Decision Questions

| Question | Approving answer | Blocked answer |
| --- | --- | --- |
| Can the trustless proof path be treated as implemented? | Yes, only when anchoring, sidechain finality, SPV tracker, burn inclusion, proof acceptance, and DUP settlement binding evidence are all linked and validator-accepted. | No, if the packet only has local proof-vector, candidate settlement, source-boundary, or read-only observation evidence. |
| Can the transitional trusted burn path be disabled for the release scope? | Yes, only after trustless proof settlement is implemented and reviewed, with exact Transitional trusted burn path disabled = yes in publication fields. | No, if trusted fallback, oracle fallback, manual signer fallback, or ambiguous transition wording remains. |
| Can critical/high findings be set to zero? | Yes, only with independent protocol/security review evidence proving no critical or high trustless-burn findings remain open. | No, if findings are pending, prose-only, unreviewed, zero-like, or not tied to the Gate 5 proof path. |
| Can Gate 5 support testnet production-candidate wording? | Yes, only after completed Gate 5 evidence passes validation with Production-ready claim allowed = no and Testnet production-candidate claim allowed = yes. | No, if evidence approves production-ready, mainnet, settlement-readiness, or unqualified production wording. |

## Required Output Bindings

- Trustless burn verification implemented = yes
- Transitional trusted burn path disabled = yes
- Critical/high findings open = 0
- Production-ready claim allowed = no
- Testnet production-candidate claim allowed = yes
- Release supported = production deployment candidate

## Completion Checklist

| Item | Validator dependency |
| --- | --- |
| Link completed anchoring and SPV tracker observation reports for one shared bridgeEventRoot and anchor height. | Required Components: Ergo extension-section anchoring and SPV relay contract or tracker. |
| Link proof acceptance and DUP settlement binding evidence. | Required Components: Burn inclusion proof and DUP settlement binding; Positive Proof Acceptance. |
| Set trustless implementation, fallback-disablement, and critical/high fields to exact closure values only after evidence and review closure. | Publication Decision fields and reviewer decision summary. |
| Record protocol, security, and operator approvals with concrete trustless-burn outcome notes. | Reviewer Sign-Off rows. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Derived from Gate 5 prerequisite map | yes |
| Completed trustless burn evidence claimed | no |
| Evidence row closure claimed | no |
| Gate 5 trustless-burn closure claimed | no |
| Settlement readiness claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |
