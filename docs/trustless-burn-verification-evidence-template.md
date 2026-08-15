# Trustless Burn Verification Evidence Template

Use this template for Gate 5 trustless burn verification evidence. It is a
claims-control artifact. This is not proof that production readiness is complete.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

## Evidence Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Evidence name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / patched devnet / testnet / staging |
| Broadcast mode | disabled / dry-run |
| Trust path | transitional trusted burn path / trustless burn proof path |
| Reviewer | |
| Date | |

`Release level = production deployment candidate` requires `Environment =
testnet`.
For release-gate claim evaluation, classified `Broadcast mode` must be
`disabled` or `dry-run`; missing or enabled broadcast mode is blocked.
`release:gate -- --trustless-burn-evidence <completed-trustless-burn-evidence.md>`
consumes this structured Evidence Classification. Testnet production-candidate
support requires a 7-40 character `Git commit`, `Environment = testnet`,
`Trust path = trustless burn proof path`, `Broadcast mode` of `disabled` or
`dry-run`, non-empty `Reviewer`, ISO `Date`, and matching Protocol reviewer
sign-off that does not predate the classification date. For Gate 5 `Checked`
rows and testnet production-candidate support, `release:gate` also requires
this `Git commit` to match the final clean-checkout Run Classification
`Git commit`.

## Required Components

Every row must be linked before Gate 5 evidence can pass. If the current release
still uses the transitional trusted burn path, leave the row as `blocker` and do
not claim trustless burn verification.
The `Required property` cell must name the component-specific trustless property;
generic notes such as `reviewed` or `tested` are not enough.
Linked component, commitment, burn-proof, positive-test, negative-test,
release-checklist update, and release-note update rows must use completed trustless burn evidence markers:
a completed `artifact://...` URI or a completed non-template evidence link.
Linked component, commitment, burn-proof, positive-test, and negative-test rows
must use distinct completed evidence targets; one shared proof artifact cannot
stand in for multiple trustless proof facts, either across sections or inside a
single evidence table.
Command output can be included inside the linked artifact or evidence note, but
a bare `command output: PASS` note is not completed trustless burn evidence.
Template links, bare validator command names, and
`trustless burn validation target` / `validated target` row cells are resolution
or validator bindings, not completed trustless burn evidence. Row-named
non-concrete artifact targets such as `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`, `testdata-*`,
`sample-evidence-*`, and `example-evidence-*` are placeholders even when the
path mirrors the component, field, proof, test, or Gate 5 publication-update
row name.
Trustless burn row payloads are fail-closed: a component property, commitment
encoding, burn binding, proof evidence, negative-test evidence, publication
update, or reviewer note cannot pair completed or accepted evidence with
contradictory validator or command failure markers such as `FAIL`, `BLOCKED`,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`.
When `Ergo extension-section anchoring` is marked `linked`, its Evidence cell
must include `Anchor observation report: <completed-report.json>` from
`npm run trustless:anchor-observe -- --json-out <completed-report.json>`.
`npm run trustless:validate` consumes that JSON report and requires it to be
`LINKED`, read-only, non-broadcast, non-claiming, bound to `0x0401`, and matched
to the `bridgeEventRoot` and `ergoAnchorHeight` in the Commitment Format rows.
When `SPV relay contract or tracker` is marked `linked`, its Evidence cell must
include `SPV tracker observation report: <completed-report.json>` from
`npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json>`.
`npm run trustless:validate` consumes that JSON report and requires it to be
`LINKED`, read-only, non-broadcast, non-claiming, bound to the Commitment Format
rows, matched to the recomputed tracker key, value, and digest, and backed by a
`sidechainFinality` object whose block height matches `expectedEntry.sidechainHeight`
and whose observed confirmations meet the required finality depth. A linked SPV
tracker observation report is prerequisite evidence only; it does not close Gate
5 without burn inclusion, on-chain proof acceptance, completed
`trustless:validate` evidence, and reviewer sign-off.

| Component | Required property | Evidence | Status |
|---|---|---|---|
| Sidechain commitment format | Stable, versioned, sidechain-specific commitment format | | pending / linked / blocker |
| Ergo extension-section anchoring | Commitment embedded under collision-safe `0x04xx` extension keys | | pending / linked / blocker |
| Sidechain header/finality verifier | Ergo-verifiable sidechain header or finality rule | | pending / linked / blocker |
| SPV relay contract or tracker | SPV relay with authenticated commitment history on Ergo | | pending / linked / blocker |
| Burn commitment tree | ErgoScript-friendly burn tree using Blake2b-compatible hashing | | pending / linked / blocker |
| Burn inclusion proof | On-chain proof accepts only included burn events | | pending / linked / blocker |
| DUP settlement binding | Proved burn ID is the exact DUP key inserted by settlement | | pending / linked / blocker |
| Reorg handling | Reorged sidechain commitments cannot release ERG | | pending / linked / blocker |
| Independent review | Independent consensus, commitment, proof format, and operator recovery review | | pending / linked / blocker |

## Commitment Format

Record the exact commitment fields and evidence that independent code can
reproduce the encoded digest.
Gate 5 validation requires `commitmentPrefix` to identify the `0x04xx`
extension keyspace and `hashFunction` to identify Blake2b-compatible hashing.
It also requires `sidechainId`, `sidechainHeaderHash`, and `bridgeEventRoot`
to each include exactly one 32-byte hex value, and `sidechainHeight` and
`ergoAnchorHeight` to be non-negative integers.

| Field | Value or encoding | Evidence | Status |
|---|---|---|---|
| sidechainId | | | pending / linked / blocker |
| sidechainHeight | | | pending / linked / blocker |
| sidechainHeaderHash | | | pending / linked / blocker |
| bridgeEventRoot | | | pending / linked / blocker |
| ergoAnchorHeight | | | pending / linked / blocker |
| commitmentPrefix | | | pending / linked / blocker |
| hashFunction | | | pending / linked / blocker |
| finalityRule | | | pending / linked / blocker |

## Burn Proof Binding

Record how every settlement field is cryptographically tied to the proved burn.
The proof must not rely on off-chain trusted interpretation of EVM logs.
Gate 5 validation requires field-specific binding text for recipient, amount,
inclusion path, DUP duplicate-prevention key, and settlement payout fields.
It also requires `burnId`, `recipientErgoTreeHash`, `sidechainTxHash`,
`sidechainBlockHash`, and `duplicatePreventionKey` to each include exactly one
32-byte hex value. `amountNanoErg` must include exactly one positive nanoERG
amount, while `eventIndex` must include exactly one non-negative integer.

| Field | Binding rule | Evidence | Status |
|---|---|---|---|
| burnId | | | pending / linked / blocker |
| recipientErgoTreeHash | | | pending / linked / blocker |
| amountNanoErg | | | pending / linked / blocker |
| sidechainTxHash | | | pending / linked / blocker |
| sidechainBlockHash | | | pending / linked / blocker |
| eventIndex | | | pending / linked / blocker |
| inclusionPath | | | pending / linked / blocker |
| duplicatePreventionKey | | | pending / linked / blocker |
| settlementTxBinding | | | pending / linked / blocker |

## Local Proof Vector

A completed Gate 5 evidence copy must include a fenced `json` block containing
the exact local proof vector used for the positive instance. The validator
recomputes this object with `relayer/src/trustless-burn-proof.ts` and checks
the local `leaf`, `bridgeEventRootHex`, `proof`, `duplicatePreventionKeyHex`,
`recipientErgoTreeHashHex`, `amountNanoErg`, and optional `assetIdHex`.
The operator handoff must collect a proof-path packet naming the sidechain
commitment, `bridgeEventRoot`, burn ID, burn amount, recipient ErgoTree hash,
sidechain transaction and block hashes, event index, duplicate-prevention key,
and a non-empty inclusion path. It must also link the completed
`npm run trustless:proof-vector:validate` JSON report target and the matching
embedded multi-leaf proof vector with required fail-closed negative cases.
The embedded JSON must not include extra top-level or nested authority/metadata
fields; Gate 5 claim boundaries belong in Publication Decision and reviewer
rows, not inside the local proof-core vector.
The `proof` array must include at least one structured inclusion proof node;
each node must expose `side` (`left` or `right`) and a 32-byte sibling
`hashHex` only. Proof arrays must not contain scalar, null, empty override,
other non-object entries, or extra proof-step fields; the same proof-node shape applies to any
`negativeCases[].settlementBinding.proof` override when provided.
`relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json` is the local
non-claiming fixture for a reproducible non-empty proof path; the single-leaf
`trustless-burn-proof-v1.json` remains valid proof-core coverage but cannot
close completed Gate 5 evidence by itself.
Use `npm run trustless:proof-vector:validate -- <vector.json> --json-out <report.json>`
to produce the read-only local proof-vector validation transcript and structured
JSON report for the selected multi-leaf vector. A PASS from that command is still
local proof-core evidence only; it does not prove sidechain consensus/finality,
on-chain Ergo contract acceptance, or Gate 5 closure.
A completed evidence copy must include `Proof-vector validation report:
<completed-report.json>` before the fenced JSON block. `npm run trustless:validate`
consumes that report and requires it to be `PASS`, local proof-core only,
read-only, non-broadcast, non-claiming, to contain exactly one proof-vector
result with non-empty `label` and `message` fields plus an explicit empty
`errors` array, to state `gate5Claim=false`, `contractsChanged=false`, local
proof-core-only scope, no Gate 5 closure, no settlement readiness, no broadcast
authorization, and no production claim support, to keep the exact report schema
emitted by the CLI, and to be bound to the embedded proof vector, including the
canonical `leafHashHex`.
The Proof-vector validation report target is a completed JSON evidence target
and a validator binding for the embedded vector. It must not be reused as
completed component, commitment, burn-proof, positive, negative, checklist, or
release-note evidence.
The local proof vector must match the Commitment Format and Burn Proof Binding
rows: `sidechainId`, `bridgeEventRoot`, `burnId`, `recipientErgoTreeHash`,
`amountNanoErg`, `sidechainTxHash`, `sidechainBlockHash`, `eventIndex`, and
`duplicatePreventionKey` cannot diverge.
Checked local proof vectors must also include exactly the structured fail-closed
`negativeCases` for wrong sidechain ID, wrong burn ID, wrong event index, wrong
recipient, wrong amount, wrong duplicate-prevention key, wrong
`bridgeEventRoot`, and malformed inclusion path. Each negative case must replay
through the local proof core and list exactly the required proof-core rejection
error for its case name; errors from one negative case must not be reused to
close a different row, no additional proof-core errors may be observed for that
local negative case, and unknown negative-case names are blockers. The
wrong `bridgeEventRoot` case must provide a `bridgeEventRootHex` override that
differs from the positive root and must not satisfy the case by overriding
`negativeCases[].settlementBinding.proof`; malformed proof-path coverage belongs
only in the separate malformed inclusion path case. The
malformed inclusion path case must provide a
`negativeCases[].settlementBinding.proof` override that differs from the
positive proof path and must not satisfy the case by overriding
`bridgeEventRootHex`; wrong-root coverage belongs only in the separate wrong
`bridgeEventRoot` negative case. Ordinary field-mismatch negative cases must
not include `bridgeEventRootHex` or `proof` overrides; root and proof-path
coverage belongs only to the two dedicated cases. These local negative cases do
not replace the separate Gate 5 contract, SPV/finality,
reorg, and independent-review evidence rows.
Wrong sidechain ID, wrong burn ID, and wrong event index cases must provide a
`negativeCases[].leaf` override scoped to `sidechainIdHex`, `burnIdHex`, and
`eventIndex` respectively; every other leaf field must match the positive leaf,
and non-identity negative cases must not include a leaf override.
The local proof-vector validator must reject unexpected top-level or nested
fields before a CLI proof-vector report can be cited as evidence.

This is local non-broadcast proof-core validation. It does not prove sidechain consensus or finality,
does not prove an on-chain Ergo contract accepted the proof, and is not completed Gate 5 evidence by itself.

Place the completed vector below as a fenced `json` block.

Proof-vector validation report:

## Positive Proof Acceptance

A completed Gate 5 evidence package must prove that at least one valid burn
proof is accepted before it proves malformed cases are rejected.
Rows marked `linked` must use an accepted, approved, passed, validated, or
verified expected result. The evidence cell must identify accepted burn proof execution,
inclusion or membership proof, DUP duplicate-prevention binding,
settlement payout binding, the accepted burn ID, settlement transaction binding,
recipient binding, amount binding, and a concrete `bridgeEventRoot` commitment
value from the Commitment Format section.
The acceptance-boundary evidence must keep local proof-core scope explicit:
positive proof acceptance and reviewer notes must not claim Gate 5 closure,
settlement readiness, broadcast authorization, or production claim support from
local proof-core evidence alone.
The linked positive proof artifact must use the same instance values recorded in
this template: `bridgeEventRoot` from Commitment Format plus `burnId`,
`recipientErgoTreeHash`, and `amountNanoErg` from Burn Proof Binding, and it
must reconcile with the Local Proof Vector. A proof acceptance artifact with a
different root, burn ID, recipient, or amount is a Gate 5 blocker even if it
says the proof was accepted.
If local contract-equivalent acceptance evidence is linked, include
`Contract-equivalent acceptance report: <completed-report.json>` in the positive
row. The validator consumes that JSON report and requires PASS, zero structural
issues, matching commitment and burn fields, rejected local negative predicate
cases, and the no-VM/no-chain/no-broadcast/no-claim boundaries emitted by
`npm run trustless:contract-acceptance`. This local predicate report is
prerequisite evidence only; it still does not replace real ErgoScript VM
execution, mined 0x04 anchoring, on-chain proof acceptance, DUP insertion, or
independent review.

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Valid burn proof acceptance | accepted | | pending / linked / blocker |

## Negative Tests

A completed Gate 5 evidence package must include positive proof acceptance and
the following rejection cases.

Rows marked `linked` must use fail-closed expected results: `rejected`,
`blocked`, `refused`, or `failed`. Generic wording such as `reviewed` is not
enough for malformed proof, stale tracker, reorg, duplicate, or trusted-oracle
fallback cases.
The evidence cell must also identify the rejected burn proof fact: wrong
sidechain ID, wrong recipient, wrong amount, reused burn ID, reorged sidechain
block, unfinalized sidechain block, stale SPV tracker digest, wrong Ergo anchor
height, malformed inclusion path, or trusted-oracle fallback.
Every linked negative-test row must also include at least one concrete 32-byte
rejected proof or burn identifier, so category-only rejection notes cannot close
Gate 5.
Rows backed by the Local Proof Vector proof core must cite the exact structured
negative case name and observed proof-core rejection string. This binding is
required for `Wrong sidechain ID` -> `negativeCase wrong-sidechain-id`, `Wrong
recipient` -> `negativeCase wrong-recipient`, `Wrong amount` -> `negativeCase
wrong-amount`, and `Malformed inclusion path` -> `negativeCase
malformed-inclusion-path`. Broader reorg, finality, SPV, anchor, DUP replay, and
trusted-oracle fallback rows still require their own linked evidence and are not
closed by these local cases alone.

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Wrong sidechain ID | rejected | | pending / linked / blocker |
| Wrong recipient | rejected | | pending / linked / blocker |
| Wrong amount | rejected | | pending / linked / blocker |
| Reused burn ID | rejected | | pending / linked / blocker |
| Reorged sidechain block | rejected | | pending / linked / blocker |
| Unfinalized sidechain block | rejected | | pending / linked / blocker |
| Stale SPV tracker digest | rejected | | pending / linked / blocker |
| Wrong Ergo anchor height | rejected | | pending / linked / blocker |
| Malformed inclusion path | rejected | | pending / linked / blocker |
| Trusted-oracle fallback presented as trustless | rejected by review | | pending / linked / blocker |

## Publication Decision

Validate a completed copy before linking it as Gate 5 evidence:

```powershell
cd relayer
npm run trustless:validate -- ../evidence/trustless-burn/<completed-trustless-burn-evidence>.md --report-out ../evidence/trustless-burn/artifacts/<trustless-burn-validation-report.md>
```

The blank template is expected to fail validation. Gate 5 evidence passes only
when required components, commitment fields, burn proof binding, positive proof
acceptance, a Local Proof Vector, negative tests, publication decision fields,
and reviewer sign-offs are complete and linked.
Use `--report-out` when recording validator provenance for Gate 5. The report
must record the checked target, PASS/BLOCKED result, issue groups, structural
issue examples, and no-claim/no-settlement/no-broadcast boundary.
`release:gate -- --trustless-burn-evidence <completed-trustless-burn-evidence.md>`
consumes the structured rows and Local Proof Vector returned by this validator.
A target link, PASS summary, classification row, or publication decision alone
cannot close Gate 5 unless the validator output also exposes linked component,
commitment, burn-proof, positive, negative, and reviewer rows plus the checked
Local Proof Vector. The gate also checks that those rows carry
component-specific trustless properties, completed component, commitment,
burn-proof, positive, and negative proof evidence, field-specific commitment
encodings and burn-proof bindings, Local Proof Vector bindings for
`bridgeEventRootHex`, leaf identity, DUP key, recipient, amount, event index,
and proof-core negative cases, negative-test-specific rejection evidence with
concrete rejected identifiers, and actionable trustless-burn reviewer notes.
Generic row payloads such as `PASS`, `reviewed`, or `approved`
remain blocked, and row-named non-concrete artifact targets cannot stand in for
completed component, commitment, burn-proof, positive, negative, or
publication-update evidence. Row-level `trustless burn validation target`
bindings are rejected even when they point at the same completed document; the
row must cite the completed proof artifact itself. The gate also rejects reused
completed evidence targets across linked component, commitment, burn-proof,
positive, and negative rows. The same rule applies before marking the Gate 5
`Trustless burn verification path` row as `Checked`; checklist text cannot
substitute for the completed validator input.
The publication decision must also use distinct completed Gate 5 checklist and
release-note update evidence targets; one combined publication-update artifact
cannot close both fields.
Trustless burn implementation closure in the reviewer decision summary must use
exact `Trustless burn verification implemented = yes`; prose-only wording does
not close Gate 5 implementation evidence.
Critical/high finding closure in the publication decision and reviewer decision
summary must use exact `Critical/high findings open = 0`; textual equivalents
such as `none`, `no`, or `n/a`, and numeric shorthand without `= 0`, do not
close Gate 5 findings.

| Field | Value |
|---|---|
| Trustless burn verification implemented | yes / no |
| Release supported | validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Transitional trusted burn path disabled | yes / no |
| Critical/high findings open | |
| Release notes updated | yes / no |
| Required release checklist updates | |
| Required release-note updates | |
| Reviewer decision summary | |

`Required release checklist updates` must link completed Gate 5 checklist update evidence.
`Required release-note updates` must link completed Gate 5 release-note update evidence.
These fields must use distinct completed evidence targets.
When `Trustless burn verification implemented = yes`, both publication-update
fields must include exact `Trustless burn verification implemented = yes`.
When `Release level = production deployment candidate`, both
the publication decision and publication-update fields must include exact
`Release supported = production deployment candidate`.
When `Production-ready claim allowed = no`, both publication-update fields must
include exact `Production-ready claim allowed = no`.
When `Testnet production-candidate claim allowed = yes`, both publication-update
fields must include exact `Testnet production-candidate claim allowed = yes`.
When `Transitional trusted burn path disabled = yes`, both publication-update
fields must include exact `Transitional trusted burn path disabled = yes`.
When `Critical/high findings open = 0`, both publication-update fields must
include exact `Critical/high findings open = 0`.
Reviewer decision summaries that close the transitional trusted burn path
boundary must use exact `Transitional trusted burn path disabled = yes`;
prose-only terms such as `disabled`, `blocked`, or `not allowed` do not close
that boundary.
Reviewer decision summaries and publication-update fields that mention trustless
burn implementation closure must use exact `Trustless burn verification implemented = yes`;
prose-only implementation terms are not accepted.
Reviewer decision summaries and publication-update fields must use exact
numeric `Critical/high findings open = 0` for critical/high finding closure;
textual zero-like terms or numeric shorthand without `= 0` are not accepted.
Template links and validator command names alone are not completed Gate 5 publication-update evidence.
`Production-ready claim allowed` must stay `no`: Gate 5 does not authorize
mainnet or unqualified production-ready claims.
Production deployment candidate evidence requires `Testnet production-candidate claim allowed = yes`
and `Production-ready claim allowed = no`; evidence that does not allow the
testnet production-candidate claim cannot support that release level.
`Testnet production-candidate claim allowed = yes` is valid only when `Release level`
is `production deployment candidate`.
`Reviewer decision summary` must include release support and mention
trustless burn verification implementation, production-ready claim handling, testnet
production-candidate claim handling, transitional trusted burn path handling,
and critical/high findings; a generic note such as `trustless burn proof path
reviewed` is not enough. Production deployment candidate support must use exact
`Release supported = production deployment candidate`. Production-ready claim
handling must use exact `Production-ready claim allowed = no`. Testnet
production-candidate claim handling must use exact
`Testnet production-candidate claim allowed = no` when the publication field is
`no`, or exact `Testnet production-candidate claim allowed = yes` when the
publication field is `yes`. Transitional trusted burn path closure in this summary must use exact
`Transitional trusted burn path disabled = yes`, and
critical/high finding closure must use exact `Critical/high findings open = 0`;
textual equivalents such as `none`, `no`, `closed`, `resolved`, or `mitigated`
do not close Gate 5 reviewer decision.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Protocol reviewer` sign-off name must match the `Reviewer` value in the
Evidence Classification table; a different approver cannot close Gate 5 after
the protocol reviewer is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Evidence Classification `Date`. Trustless burn evidence
cannot be closed with a reviewer approval that predates the evidence
classification.
Reviewer notes must state a concrete trustless-burn outcome tied to the
trustless burn proof, burn inclusion, sidechain commitment, commitment format,
extension-section keyspace, `0x04xx`, Blake2b hashing, SPV/finality,
DUP duplicate prevention, settlement binding, reorg handling, recipient or
amount binding, Ergo anchor, or trusted-oracle fallback rejection. Generic notes
such as `reviewed Gate 5 evidence` are not enough.
Reviewer notes must also keep the same claim and protocol boundary as the
publication rules: they cannot approve production-ready wording, mainnet-scoped
release wording, transitional trusted-burn-path use, or trusted-oracle fallback
acceptance.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Protocol reviewer | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
