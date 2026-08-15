# Gate 5 Trustless Burn Operator Packet - 395b71b6

This packet turns the current Gate 5 trustless-burn prerequisite map into
operator capture inputs and review questions. It is not completed protocol
evidence and does not authorize settlement, reconciliation, signing,
deployment, public release, or broadcast claims.

## Source Snapshot

| Field | Value |
| --- | --- |
| Validator commit | 395b71b6 |
| Candidate target | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md |
| Prerequisite map | ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-395b71b6.md |
| Command | `npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md --validator-commit 395b71b6 --validator-report-out <report.md> --out <map.md> --operator-packet-out <packet.md>` |
| Current result | BLOCKED |
| Structural issues | 22 |
| Anchoring issues | 1 |
| Tracker/finality issues | 2 |
| Proof acceptance issues | 3 |
| Reviewer approval issues | 6 |
| Publication-boundary issues | 10 |

## Capture Inputs

| Area | Operator must capture | Evidence to link |
| --- | --- | --- |
| Proof-path identity | Sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path. | Completed proof-path packet, proof-vector validation JSON report, and burn-proof rows that all bind the same identifiers. |
| Compact unsigned candidate | Completed trustless:unsigned-tx JSON evidence and trustless:unsigned-tx:validate report for the deterministic single-leaf candidate, including contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no. | Unsigned transaction source-boundary evidence before any signed node-backed /transactions/check packet; this remains no-check, no-sign, no-submit, and no-broadcast prerequisite evidence. |
| Aggregate prebroadcast packet | Completed npm run settle:aggregate -- check-with-ingest JSON evidence produced after explicit non-mainnet local-signing/check approval with --state-db <operator-read-only-state-db.sqlite>, --deployed-state-json <sanitized-deployed-state.json>, and --evidence-json <completed-aggregate-prebroadcast-evidence.json>. | Aggregate prebroadcast JSON proving sourceBindings.state targetClass = operator-provided-state-db, sourceBindings.deployedState targetClass = operator-provided-deployed-state-json, runtimePathSerialized = false, defaultFallbackUsed = false, defaultLoaderUsed = false, /transactions/check PASS, Expected transaction ID, claim rows, settlement shape, and no submit, reconciliation, deployment, or broadcast approval. |
| Extension anchoring | Sanitized public extension-observation JSON and a completed trustless:anchor-observe JSON report for the selected non-mainnet height window. | Anchor observation report with LINKED status, 0x04xx key, bridgeEventRoot, anchor height, public source provenance, and no-claim boundary. |
| SPV tracker and finality | Sanitized public tracker history, expected sidechain entry, tracker digest, proof digest, and finality binding for the same bridgeEventRoot and anchor height. | SPV tracker observation report plus observation reconciliation report matching anchor, tracker, proof-vector, and settlement-binding evidence. |
| Proof acceptance and DUP settlement | Positive proof acceptance and settlement assembly evidence proving the accepted burn ID is the DUP key and recipient/amount bindings survive payout assembly. | Accepted burn proof evidence, DUP insert binding, payout recipient and amount binding, and negative rejection evidence for malformed or stale cases. |
| Independent review | Protocol, security, and operator review outcomes after finality, anchoring, proof format, DUP binding, fallback disablement, and no-broadcast boundaries are concrete. | Independent review evidence plus reviewer sign-off rows with dates not before Evidence Classification Date. |
| Publication boundary | Release-note and checklist updates that keep production-ready/mainnet claims blocked while allowing only bounded testnet production-candidate support after Gate 5 closure. | Publication decision rows and reviewer decision summary with exact release-support, implementation, fallback-disablement, and critical/high closure bindings. |

## Decision Questions

| Question | Approving answer | Blocked answer |
| --- | --- | --- |
| Can the next packet be a signed node-backed transaction check? | Yes, only after the compact unsigned candidate has PASS validation and there is explicit approval for a scoped non-mainnet local-signing plus /transactions/check run, with no submit, deploy, reconcile, or broadcast. | No, if only source-boundary code or candidate proof-vector evidence exists, if local-signing/check approval is absent, or if the unsigned evidence lacks PASS validation and no-check/no-sign/no-submit boundaries. |
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
| Link compact unsigned candidate validation before requesting signed node-backed /transactions/check evidence. | trustless:unsigned-tx:validate PASS with contextExtensionGuard = pass and no-check/no-sign/no-submit boundaries; executing the check still requires explicit non-mainnet local-signing/check approval. |
| Link aggregate prebroadcast JSON before treating node-backed check output as Gate 5 settlement-binding evidence. | settle:aggregate -- check-with-ingest evidence JSON with sourceBindings.state, sourceBindings.deployedState, operator-provided state/deployed-state target classes, /transactions/check PASS, Expected transaction ID, and no submit/reconcile/deploy/broadcast boundary escalation. |
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
