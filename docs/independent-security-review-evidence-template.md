# Independent Security Review Evidence Template

Use this template for Gate 4 independent security review evidence. It is the
report shape that must be completed by an external reviewer before an
institutional-reference or production-candidate release can claim independent
security review coverage.

This is not a production-ready claim. A completed report can still block
publication if it finds unresolved critical/high issues, unsupported release
claims, or missing live evidence.

Do not paste `.env` contents, seed phrases, signing secret material, API
secrets, local user paths, SQLite files, WAL files, diagnostic dumps, or private
deployment state.

## Review Classification

Date must use `YYYY-MM-DD`.
Reviewed commit must use a 7-40 character Git commit SHA.
Review period must use `YYYY-MM-DD to YYYY-MM-DD` and the start date must not
be after the end date. The review period end date must not be after `Date`.
Reviewer organization type must be `external audit firm`,
`independent security researcher`, or `exchange security team`.
Reviewer organization must identify a concrete external security reviewer
organization or affiliation. Generic placeholders such as `external security
team`, `external audit firm`, `independent security researcher`, `TBD`, or
`reviewer organization` do not satisfy Gate 4.
`Release level = production deployment candidate` requires `Environment =
testnet`; independent review evidence from local offline, patched devnet, or
staging can support lower release levels only.
Internal or maintainer-led review cannot close the independent security review
blocker.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Review name | |
| Reviewed commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / patched devnet / staging / testnet |
| Reviewer organization | |
| Reviewer organization type | external audit firm / independent security researcher / exchange security team |
| Lead reviewer | |
| Reviewer independence | independent external |
| Review period | |
| Final decision | approve / block |
| Date | |

## Required Scope Coverage

Each area below must be covered. Do not mark a required area as covered unless
the reviewer checked the implementation and the linked evidence.
The `Risk focus reviewed` cell must name the concrete risk class the reviewer
checked for that area; generic scope notes such as `reviewed` are not enough.
Linked scope, evidence-package, finding-disposition, negative-check, and
release-artifact rows must use completed review evidence markers: an
`artifact://...` URI or a non-template evidence link. Template links,
bare validator command names, and pasted PASS notes such as
`npm run security:validate command output: PASS` are resolution targets, not completed review evidence.
Rows that cite only `security review validation target`,
`independent security review validation target`, `security validate target`,
`validated target`, or `validated input` are validator input/output bindings,
not completed scope, evidence-package, finding, negative-check,
release-note, or checklist evidence, even when the link points at the same
completed document or artifact.
Linked scope, evidence-package, finding-disposition, and negative-check rows
must also use distinct completed evidence targets. One shared security-review
artifact or log cannot close multiple row-specific checks across those row
families.
When a scope row lists finding IDs instead of `none`, every listed ID must be
referenced by linked Finding Disposition closure evidence. A scope row cannot
claim `SR-001` while all finding disposition rows remain zero-only artifacts
that never identify `SR-001`.
Rows that mix a pass-like command or validation note with `FAIL`, `BLOCKED`,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` remain blocked even when they include a concrete evidence
target.

| Area | Coverage | Evidence | Finding IDs | Risk focus reviewed | Status |
|---|---|---|---|---|---|
| ErgoScript contracts | covered / blocker | | | HEIGHT / singleton / payout binding | pending / linked / blocker |
| Relayer signing | covered / blocker | | | node-wallet / ContextExtension / broadcast signing | pending / linked / blocker |
| AVL proof generation | covered / blocker | | | AVL batch proof / non-concatenation | pending / linked / blocker |
| Settlement reconciliation | covered / blocker | | | DUP confirmation / settlement reconciliation / reorg | pending / linked / blocker |
| Sidechain finality and burn validity | covered / blocker | | | finality / burn validity / SPV / trustless boundary | pending / linked / blocker |
| Operator recovery | covered / blocker | | | SQLite backup / restore / reconstructibility / runbook | pending / linked / blocker |
| Dependency risk | covered / blocker | | | sigma-rust / Fleet / lockfile / upgrade risk | pending / linked / blocker |

## Required Evidence Package

Provide links or artifacts for each row. Mark unavailable artifacts as blockers,
not omissions.
Each linked artifact must identify the specific evidence item it closes:
clean-checkout CI, `npm run check`, `npm run wasm:test`, local devnet
rehearsal, testnet rehearsal, failed-broadcast or phantom-AVL drill,
SQLite/AVL backup-restore, batch settlement check/submit/confirm rehearsal, or
release notes draft. Generic security-review artifacts are not enough for
completed Gate 4 evidence-package rows.
Reviewer notes must state a concrete outcome such as verified, accepted,
pass/fail, blocked, matched, or reconciled; generic `reviewed` notes are not enough for completed Gate 4 evidence.

Validate a completed copy before linking it as Gate 4 evidence:

```powershell
cd relayer
npm run security:validate -- ../evidence/security/<completed-independent-security-review>.md --report-out ../evidence/security/artifacts/<security-review-validation-report.md>
```

The blank template is expected to fail validation. Gate 4 evidence passes only
when required scope coverage, evidence package rows, finding dispositions,
negative review checks, publication decision fields, and reviewer sign-off rows
are complete and linked. The final decision and every reviewer sign-off must be
`approve`; a `block` decision remains valid report content, but it cannot close
Gate 4 evidence.
When `--report-out` is provided, the generated report records the validated
target, PASS/BLOCKED result, issue groups, structural issue examples, and
read-only boundary. It does not authorize public claims, accepted-risk closure,
review approval, deployment, or transaction broadcast.
`release:gate -- --security-review-evidence <completed-independent-security-review.md>`
consumes the structured Review Classification returned by this validator. For
testnet production-candidate support, Review Classification must expose
`Release level = production deployment candidate`, `Environment = testnet`, a
7-40 character `Reviewed commit`, concrete external reviewer organization,
allowed reviewer organization type, `Reviewer independence = independent
external`, an ISO `Review period`, ISO `Date`, and `Final decision = approve`.
For Gate 4 `Checked` rows and testnet production-candidate support,
`release:gate` also requires this `Reviewed commit` to match the final
clean-checkout Run Classification `Git commit`. Lead reviewer sign-off must
match the classified lead reviewer and must not predate the Review
Classification `Date`. A target link, PASS summary,
classification row, or publication decision alone cannot close the Gate 4
security blocker unless the validator output also exposes linked scope,
evidence package, finding disposition, negative-check, and reviewer rows. The
gate also checks that those rows carry completed area-specific scope evidence,
item-specific evidence-package artifacts, completed finding closure evidence,
question-specific negative-check evidence, expected reviewer answers, lead
reviewer binding, completed Gate 4 accepted-risk publication-update evidence,
and actionable reviewer notes that keep finding, accepted-risk, and claim
boundaries; generic row payloads such as
`PASS`, `reviewed`, or `approved`, and row-named non-concrete artifact
targets, remain blocked. The same completed validator input is required before
marking the Gate 4 independent security review row as `Checked`;
row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are treated as
placeholders, not completed independent security review evidence.

| Evidence | Status | Link or artifact | Reviewer note |
|---|---|---|---|
| Clean checkout CI run | pending / linked / blocker | | |
| `npm run check` output | pending / linked / blocker | | |
| `npm run wasm:test` output | pending / linked / blocker | | |
| Fresh local devnet rehearsal | pending / linked / blocker | | |
| Fresh testnet rehearsal | pending / linked / blocker | | |
| Failed broadcast / phantom AVL drill | pending / linked / blocker | | |
| SQLite/AVL backup-restore drill | pending / linked / blocker | | |
| Batch settlement check/submit/confirm rehearsal | pending / linked / blocker | | |
| Release notes draft | pending / linked / blocker | | |

## Finding Disposition

All critical/high findings must be closed or publication remains blocked.
Accepted risks must be reflected in release notes and the release checklist.
`Count` values must be `0`, `none`, `no`, or an integer. The `Open critical/high` values must be `0`, `none`, `no`, or `n/a`;
narrative notes such as `reviewed` are not counts.
The `Publication blockers` count must be the exact numeric value `0`; `none`
or `no` do not close Gate 4 publication blockers, and any non-zero
publication blocker means Gate 4 remains blocked even if critical/high findings
are closed. Release checklist and release notes rows close Gate 4 only when
they preserve the exact evidence term `Publication blockers = 0`.
If Required Scope Coverage cites finding IDs, the closure evidence in this
section must reference those IDs explicitly, not just the aggregate finding
class.

| Finding class | Count | Open critical/high | Closure evidence | Status |
|---|---|---|---|---|
| Critical findings | | | | pending / linked / blocker |
| High findings | | | | pending / linked / blocker |
| Medium findings | | | | pending / linked / blocker |
| Low findings | | | | pending / linked / blocker |
| Informational findings | | | | pending / linked / blocker |
| Accepted risks | | | | pending / linked / blocker |
| Publication blockers | | | | pending / linked / blocker |

Every `Open critical/high` cell must use the exact numeric value `0`; textual
equivalents such as `none`, `no`, or `n/a` do not close finding disposition
rows.

## Required Negative Review Checks

The reviewer must explicitly answer each question. Unsafe-path answers must
state `no`, `cannot`, `rejected`, or `blocked`; generic notes such as
`reviewed` are not enough. The operator-recovery question is the exception: it
must state `yes` or `recoverable` without private maintainer context, with
linked runbook or backup-restore evidence. Each linked evidence cell must
identify the reviewed unsafe path or recovery path for that exact question;
generic negative-review artifacts are not enough.

| Question | Reviewer answer | Evidence | Status |
|---|---|---|---|
| Can a production path sign through the Ergo node wallet? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can default production/testnet mode sign an unsafe ContextExtension shape? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can a failed broadcast or reorg insert a phantom DUP key? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can a batch settlement accept a wrong-recipient, low-value, or reused payout? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can a same-recipient batch collision pay fewer outputs than expected? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can stale SPV tracker or DUP history build against the wrong singleton digest? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can trusted burn interpretation be mistaken for trustless verification? | no / cannot / rejected / blocked | | pending / linked / blocker |
| Can an operator recover from SQLite loss without private maintainer context? | yes / recoverable | | pending / linked / blocker |

## Publication Decision

| Field | Value |
|---|---|
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Critical/high findings open | |
| Accepted risks reflected in release notes | yes / no |
| Required release checklist updates | accepted-risk checklist updates: |
| Required release-note updates | accepted-risk release-note updates: |
| Reviewer decision summary | |

The Publication Decision `Critical/high findings open` field must be the exact
numeric value `0`; textual equivalents such as `none`, `no`, or `n/a` do not
close Gate 4 findings.

`Release supported` must not be `none` in completed independent security review
evidence, and must not exceed the `Release level` audited in the Review
Classification table. A completed institutional-reference review cannot support
a production deployment candidate release decision unless the review itself was
scoped and completed at production deployment candidate level.
When `Release level = production deployment candidate`, the Publication
Decision must use exact `Release supported = production deployment candidate`.
Mainnet or unqualified production-ready claims remain forbidden:
`Production-ready claim allowed` must stay `no`. Production deployment
candidate support can only be testnet-scoped, and requires
`Testnet production-candidate claim allowed = yes`; evidence that does not
allow the testnet production-candidate claim cannot support that release level.

The required release checklist and release-note update rows must link an
artifact or non-template evidence document showing that accepted risks and blockers were copied
into the release artifacts. The checklist row must include `accepted-risk
checklist updates` and identify completed Gate 4 checklist update evidence; the
release-note row must include `accepted-risk release-note updates` and identify
completed Gate 4 release-note update evidence. The checklist and release-note
fields must use distinct completed evidence targets; one combined artifact name
cannot close both publication-update checks. These publication-update fields are
fail-closed when they also carry `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit
code`, non-zero `errors`, or non-zero `structural issues`. If these fields
reflect accepted risks in release notes, they must use exact
`Accepted risks reflected in release notes = yes`. When the publication
decision field is exact `Testnet production-candidate claim allowed = yes`,
they must use exact `Testnet production-candidate claim allowed = yes`. When
the publication decision field is exact `Production-ready claim allowed = no`,
they must use exact `Production-ready claim allowed = no`. When
the publication decision field is exact
`Release supported = production deployment candidate`, they must also use exact
`Release supported = production deployment candidate`. In that
release-support case, publication-update fields must use
exact numeric `Critical/high findings open = 0` and `Publication blockers = 0`;
textual zero-like terms such as `none`, `no`, `zero`, `closed`, `resolved`, or
`mitigated`, and shorthand numeric forms without `= 0`, are not accepted.

The reviewer decision summary must mention release support, production-ready
claim handling, testnet production-candidate claim handling, critical/high
findings, and accepted risks. For production deployment candidate support, it
must use exact `Release supported = production deployment candidate`.
Testnet production-candidate claim handling must use exact
`Testnet production-candidate claim allowed = no` when the publication field is
`no`, or exact `Testnet production-candidate claim allowed = yes` when the
publication field is `yes`, rather than prose-only approval, blocking, or
contradictory wording.
Critical/high finding closure in this summary must use exact
`Critical/high findings open = 0`; textual equivalents such as `none`, `no`,
`closed`, `resolved`, or `mitigated`, and numeric shorthand without `= 0`, do
not close Gate 4 reviewer decision. Accepted-risk release-note handling must
use exact `Accepted risks reflected in release notes = yes`; prose-only wording
does not close Gate 4 reviewer decision.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Lead reviewer` sign-off name must match the `Lead reviewer` value in the
Review Classification table; a different approver cannot close the independent
review evidence.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Review Classification `Date`. Independent review evidence
cannot be closed with a reviewer approval that predates the final review
classification.
Reviewer notes must state a concrete security-review outcome tied to Gate 4,
scope coverage, required evidence packages, critical/high findings, finding
closure, publication blockers, negative review checks, node-wallet signing,
ContextExtension, broadcast controls, DUP/AVL/SPV behavior, trustless burn
boundaries, operator recovery, dependency risk, release notes, or checklist
updates. Generic notes such as `reviewed report` are not enough.
Reviewer notes must also preserve the security review boundary: they must not
approve production-ready wording, mainnet-scoped release wording, open
critical/high findings, open publication blockers, or accepted risks missing
release-note/checklist evidence.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable security-review outcome with failed validator or command markers,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`. Accepted-risk and blocker wording is allowed only when it
keeps unsupported claims blocked; it cannot mask a failed security validator or
command.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Lead reviewer | | approve / block | | |
| Security owner | | approve / block | | |
| Maintainer | | approve / block | | |
| Operator reviewer | | approve / block | | |
