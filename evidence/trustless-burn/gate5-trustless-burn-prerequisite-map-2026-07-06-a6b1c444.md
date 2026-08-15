# Gate 5 Trustless Burn Prerequisite Map - a6b1c444

This packet records the current Gate 5 trustless-burn validator result for
the selected blocker map and converts the remaining blockers into operator
evidence prerequisites.

It is not completed Gate 5 trustless-burn evidence. It does not support
trustless-burn-complete, settlement-readiness, testnet production-candidate,
production-ready, mainnet, deployment, signing, reconciliation, or broadcast
claims.

No wallet recovery material, signing credential material, private deployment
state, local runtime state, private database state, or live transaction evidence
was read or used for this packet.

## Validation Snapshot

| Field | Value |
| --- | --- |
| Validator commit | a6b1c444 |
| Candidate target | ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-06-fecc11eb.md |
| Validator report | ../evidence/trustless-burn/trustless-validate-gate5-spv-linked-blocked-2026-07-06-a6b1c444.md |
| Command | `npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-06-fecc11eb.md --validator-commit a6b1c444 --validator-report-out <report.md> --out <map.md>` |
| Working directory | ergo-sidechain-bridge/relayer |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 19 |
| Stack trace emitted | no |
| Local path emitted | no |

## Exact Remaining Validator Issues

| Issue | Evidence prerequisite |
| --- | --- |
| Publication Decision: Trustless burn verification implemented must be yes before Gate 5 evidence can pass | Completed trustless-burn implementation evidence after the proof path is wired through an Ergo-verifiable finality, anchoring, proof-acceptance, and DUP settlement path. |
| Publication Decision: transitional trusted burn path must be disabled before Gate 5 evidence can pass | Evidence that the transitional trusted burn path is disabled or blocked for the release scope after trustless proof settlement is implemented and reviewed. |
| Publication Decision: critical/high findings open must be 0 before Gate 5 evidence can pass | Independent security/protocol review evidence proving no critical or high trustless-burn findings remain open. |
| Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0 | Independent security/protocol review evidence proving no critical or high trustless-burn findings remain open. |
| Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings | Evidence that the transitional trusted burn path is disabled or blocked for the release scope after trustless proof settlement is implemented and reviewed. |
| Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes | Completed trustless-burn implementation evidence after the proof path is wired through an Ergo-verifiable finality, anchoring, proof-acceptance, and DUP settlement path. |
| Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes | Evidence that the transitional trusted burn path is disabled or blocked for the release scope after trustless proof settlement is implemented and reviewed. |
| Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0 | Independent security/protocol review evidence proving no critical or high trustless-burn findings remain open. |
| Publication Decision: Reviewer decision summary must not leave critical/high findings open | Independent security/protocol review evidence proving no critical or high trustless-burn findings remain open. |
| Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed | Evidence that the transitional trusted burn path is disabled or blocked for the release scope after trustless proof settlement is implemented and reviewed. |
| Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass | Sanitized public extension-observation JSON plus completed `npm run trustless:anchor-observe` JSON report binding the Gate 5 bridgeEventRoot to the non-mainnet `0x04xx` anchor window. |
| Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass | Ergo-verifiable sidechain header or finality evidence proving the burn commitment cannot rely on local receipt-depth text alone. |
| Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass | On-chain or equivalent non-mainnet proof-acceptance evidence that included burns are accepted and malformed or stale proofs are rejected. |
| Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass | Evidence that the proved burn ID is the exact DUP key inserted by settlement and that payout recipient/amount bindings survive settlement assembly. |
| Required Components: Independent review: status must be linked before Gate 5 evidence can pass | Independent protocol/security/operator review evidence for finality, anchoring, proof format, DUP binding, fallback disablement, and claim boundaries. |
| Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass | Positive proof-acceptance evidence for a valid burn proof against the anchored commitment and selected DUP settlement binding. |
| Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass | Protocol reviewer approval after component evidence, proof acceptance, and publication-boundary fields are complete. |
| Reviewer Sign-Off: Security reviewer: decision must be approve before Gate 5 evidence can pass | Security reviewer approval after independent review, fallback disablement, critical/high closure, and no-broadcast boundaries are complete. |
| Reviewer Sign-Off: Operator reviewer: decision must be approve before Gate 5 evidence can pass | Operator reviewer approval after non-mainnet drill evidence, fallback behavior, recovery boundaries, and no-broadcast rules are complete. |

## Anchor Observation Input Request

The sanitized public extension-observation JSON for `trustless:anchor-observe`
must contain only public read-only extension data:

| Field | Required binding |
| --- | --- |
| `bridgeEventRoot` input | The 32-byte bridge event root from the Gate 5 proof-path packet, passed as `<64hex>` or `0401:<64hex>`. |
| `observations.heights[].height` | Non-negative Ergo anchor heights in the non-mainnet scan window. |
| `observations.heights[].fields[].key` | The `0401` extension key, or another explicit `0x04xx` Gate 5 key when the evidence explains the key choice. |
| `observations.heights[].fields[].value` | A 32-byte public bridge event root value observed at that height. |
| `observations.heights[].fields[].headerId` | Optional public 32-byte header ID for provenance when available. |
| `minHeight` / `maxHeight` | The exact non-mainnet scan window used by `trustless:anchor-observe`. |
| `observedAt` | ISO UTC observation time recorded by the completed JSON report. |

The anchor observation report must remain `LINKED`, read-only,
public-observation-input only, and no-claiming. A linked anchor observation
report is prerequisite evidence only; it does not complete sidechain finality,
SPV tracker history, burn inclusion, proof acceptance, DUP settlement binding,
Gate 5 closure, release-gate PASS, or publication claims.

## SPV Tracker Observation Input Request

The sanitized public observation JSON for `trustless:spv-tracker-observe` must
contain:

| Field | Required binding |
| --- | --- |
| `trackerDigestHex` | 33-byte public SPV tracker AVL digest for the observed tracker history. |
| `expectedEntry.sidechainIdHex` | 32-byte sidechain ID matching the Gate 5 Commitment Format row. |
| `expectedEntry.sidechainHeight` | Non-negative sidechain height matching the Gate 5 Commitment Format row. |
| `expectedEntry.sidechainHeaderHashHex` | 32-byte sidechain header hash matching the Gate 5 Commitment Format row. |
| `expectedEntry.bridgeEventRootHex` | 32-byte bridge event root matching the Gate 5 Commitment Format row. |
| `expectedEntry.ergoAnchorHeight` | Non-negative Ergo anchor height matching the Gate 5 Commitment Format row. |
| `history` | Public tracker history entries with 32-byte keys and 36-byte values sufficient for `trustless:spv-tracker-observe` to rebuild the digest and get-proof. |
| `trackerBox` | Optional sanitized tracker box ID and NFT ID; no private deployment-state file dump is allowed. |

The observation report must remain `LINKED`, read-only, public-observation-input
only, and no-claiming. A linked SPV tracker observation report is prerequisite
evidence only; it does not complete burn inclusion, proof acceptance, DUP
settlement binding, Gate 5 closure, release-gate PASS, or publication claims.

## Next Evidence Sequence

| Step | Status under current authorization | Required output |
| --- | --- | --- |
| Reconfirm current Gate 5 blocker map | complete | Validator report above: BLOCKED with 19 structural issue(s). |
| Capture non-mainnet extension anchoring evidence | blocked until approved node-backed/non-mainnet run exists | Sanitized public extension-observation JSON plus completed `npm run trustless:anchor-observe` JSON report for the selected bridge event root and non-mainnet height window. |
| Capture sidechain finality and SPV tracker evidence | blocked until approved non-mainnet finality/tracker target exists | Evidence binding sidechain headers, finality, commitment history, and tracker updates, including a linked `trustless:spv-tracker-observe` report for the SPV tracker path. |
| Capture proof acceptance and DUP settlement binding evidence | blocked until proof path and settlement drill are available | Positive burn proof acceptance plus DUP insertion, payout recipient, and amount binding evidence. |
| Complete independent Gate 5 review | reviewer/external dependency | Independent review evidence with critical/high findings closure and exact publication-boundary fields. |
| Move publication fields to closure values | blocked until implementation, component, proof-acceptance, settlement, and review evidence exist | Exact `Trustless burn verification implemented = yes`, `Transitional trusted burn path disabled = yes`, and `Critical/high findings open = 0` bindings only after blocker closure. |
| Approve Gate 5 reviewer sign-offs | blocked until blocker closure is evidenced | Protocol, security, and operator approvals with concrete trustless-burn outcome notes. |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Trustless burn validator completed | yes |
| Anchor observation request prepared | yes |
| SPV tracker observation request prepared | no |
| Proof acceptance prerequisites linked | no |
| Publication closure prerequisites linked | no |
| Reviewer approval prerequisites linked | no |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Gate 5 trustless-burn closure claimed | no |
| Settlement readiness claimed | no |
| Runtime database or deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |
