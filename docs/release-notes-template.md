# Release Notes Template

Use this template for every internal or public bridge release candidate. It is a
claims-control document: do not replace the tables with narrative prose.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

Validate completed release notes before attaching them to any release evidence:

```powershell
cd relayer
npm run release-notes:validate -- ../evidence/releases/<completed-release-notes>.md
npm run threat-model:validate -- ../docs/security-evidence-matrix.md
npm run release:gate -- --release-notes ../evidence/releases/<completed-release-notes>.md --threat-model-evidence ../docs/security-evidence-matrix.md
```

The blank template is expected to fail validation. Completed release notes pass
only when release classification, required evidence rows, trust assumptions,
publication blockers, disallowed-claim checks, operator impact, and sign-offs
are structured, linked, and kept under the canonical table headers below.
For testnet production-candidate claim evaluation, `release:gate` consumes the
structured release classification, required-evidence, trust-assumption,
publication-blocker, allowed-claim, operator-impact, and sign-off rows returned
by `release-notes:validate`. The validated `Release level` must match the
`Release Decision` `Proposed release level`; a PASS summary, target, or
validated document for another release level cannot authorize release-note
publication evidence. The release-note classification must expose a non-empty
`Release name`, valid `Decision`, non-empty `Decision owner`, and ISO
`Decision date`; an approved `Release Decision` requires release notes whose
classification `Decision` is `proposed`, not `blocked` or `rejected`. The
Maintainer sign-off must match that owner and no sign-off date may predate that
decision date. The release-note classification `Git commit` must also match the
clean-checkout Run Classification `Git commit`, so release notes from another
checkout cannot support the publication decision.
The release gate requires every controlled claim-boundary row from the
Disallowed Claims Check to be represented in the structured `claimRows`; a
single generic claim row cannot authorize release-note publication evidence.
The structured rows must also carry concrete row-specific payloads: completed
evidence-class artifacts with publication effects, assumption-specific evidence
and release impacts, blocker-specific checked resolution evidence, claim-specific
evidence links with bounded allowed wording, actionable operator actions and
stop conditions, and actionable sign-off notes. Generic cells such as `PASS`,
`reviewed`, or `approved` do not close release-note publication evidence.
`release-notes validation target` or `release-notes validate target` links are
validator provenance only; they cannot close required evidence, trust-assumption,
publication-blocker, or allowed-claim rows unless a separate completed
row-specific artifact is also linked.
Operator actions and stop conditions must stay claim-bounded when consumed by
`release:gate`: they must not introduce absolute security wording, mainnet
production wording, or unqualified production-ready/go-live wording.
Sign-off notes must stay claim-bounded: they must not approve production-ready
or mainnet-scoped production wording, use unqualified go-live/general
availability/generally available wording, or introduce absolute security wording.
Release-note row payloads are fail-closed: a completed artifact or row-specific
payload cannot also carry contradictory validator or command failure markers
such as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`.
Row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are also
placeholders, not completed release-note evidence or completed release-note
document artifacts.
Do not duplicate release classification fields or required rows in any
release-note table; one required evidence class, assumption, blocker, operator
area, or sign-off role must have one canonical row and one status.

## Release Classification

Choose exactly one release level and keep every claim consistent with it.
Release name must not include absolute security wording. For non-production
releases, it must not include production, production-candidate,
production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet,
trustless, deployment-ready, release-ready, market-ready, launch-ready,
go-live, general availability, generally available, GA-ready, production launch, exchange-ready,
exchange-grade, institutional-grade, institutional-ready, enterprise-grade,
enterprise-ready, or ready-for-production wording.
Decision date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.

| Field | Value |
|---|---|
| Release name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Decision | proposed / blocked / rejected |
| Decision owner | |
| Decision date | |

`Decision` must remain `blocked` while any publication blocker row is not
`Checked` and is not explicitly scoped out for the release level being
evaluated. When `release:gate` evaluates an approved public-release or testnet
production-candidate decision, completed release notes must carry
`Decision = proposed`; `blocked` or `rejected` release-note classifications
cannot support that approval even when the validator summary says PASS.

## Scope Statement

Required wording for non-production releases:

> This release is not a production-ready bridge claim. It is published only at
> the release level stated above, with the blockers and trust assumptions listed
> in these notes.

If the release is a production deployment candidate, replace the paragraph only
after every production-required gate in [Institutional Release Checklist](release-checklist.md)
is checked and linked to evidence.
Production deployment candidate scope text must still be explicitly
testnet-scoped. It must not include forbidden mainnet-scoped wording: mainnet,
main-net, main net, main network, or main chain paired with
forbidden production-ready, production-candidate, go-live, general
availability, generally available, or production launch wording; forbidden unqualified
production-ready wording; abbreviated prod-ready / prod-candidate / prod-grade
wording; go-live / general availability / generally available / production launch wording; or
unqualified production-readiness wording; use controlled `testnet
production-candidate` wording or controlled `production-grade testnet` wording
only when every required evidence row and blocker is linked.
The same completed-evidence rule applies when the `Release name`, this scope
statement, or an Allowed Claims row uses controlled testnet production-candidate
or production-grade testnet wording.
For non-production releases, do not add production, production-candidate,
production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet,
trustless, deployment-ready, release-ready, market-ready, launch-ready,
go-live, general availability, generally available, GA-ready, production launch, exchange-ready,
exchange-grade, institutional-grade, institutional-ready, enterprise-grade,
enterprise-ready, or ready-for-production wording to the scope statement.
The same claim boundary applies to Trust Assumptions, Operator Impact, and
Sign-Off notes: mainnet-scoped production-candidate, go-live, general
availability, generally available, or production-launch wording is forbidden, and unqualified
go-live, general availability, or generally available wording cannot support a release claim.

## Required Evidence

| Evidence class | Status | Link or artifact | Publication effect |
|---|---|---|---|
| Clean checkout CI | pending / linked / blocker | | |
| Local devnet lifecycle rehearsal | pending / linked / blocker | | |
| Testnet lifecycle rehearsal | pending / linked / blocker | | |
| Failed broadcast phantom AVL recovery drill evidence | pending / linked / blocker | | |
| Reorged burn and stale singleton recovery drill evidence | pending / linked / blocker | | |
| ContextExtension signer resolution or guard | pending / linked / blocker | | |
| Signer dependency conformance or fail-closed release decision evidence | pending / linked / blocker | | |
| Broadcast gate evidence | pending / linked / blocker | | |
| SQLite/AVL backup-restore evidence | pending / linked / blocker | | |
| Operator readiness evidence | pending / linked / blocker | | |
| Committee governance and key-rotation evidence | pending / linked / blocker | | |
| Threat model and evidence matrix | pending / linked / blocker | | |
| Dependency risk review evidence | pending / linked / blocker | | |
| Independent security review | pending / linked / blocker | | |
| Trustless burn verification evidence | pending / linked / blocker | | |
| Single, batch, and sharded benchmark evidence | pending / linked / blocker | | |
| External integration package review | pending / linked / blocker | | |
| Technical addendum architecture manual | pending / linked / blocker | | |

When release notes are consumed by `release:gate`, completed evidence targets
in Required Evidence, Trust Assumptions, checked Publication Blockers, and
Allowed Claims are treated as separate publication obligations. Do not reuse
one completed artifact target to close multiple rows.

The `Clean checkout CI` Required Evidence row marked `linked` must mention
`ci:validate` command output with `exit code 0`; a generic CI artifact name is
not enough for Gate 1 release notes.
When Gate 1 clean-checkout evidence supports a production deployment candidate,
its release-note and checklist publication-update evidence must include exact
`Release supported = production deployment candidate` and exact
`Testnet production-candidate claim allowed = yes`.

The `Technical addendum architecture manual` Required Evidence row marked
`linked` must mention `addendum:validate` command output with `exit code 0`,
`Release gate status = pass`, `release:gate PASS` output with zero structural
issues, `Production-ready claim allowed = no`,
`Mainnet deployment claim allowed = no`, and
`Testnet production-candidate claim allowed = yes-after-release-gate-pass`; a
generic architecture manual artifact name is not enough for Gate 2 release
notes.

The `SQLite/AVL backup-restore evidence` Required Evidence row marked `linked`
must mention `backup:validate` command output with `exit code 0`; a generic
backup-restore artifact name is not enough for recovery release notes.

The `ContextExtension signer resolution or guard` Required Evidence row marked
`linked` must mention a fail-closed ContextExtension signer guard or an
upstream signer resolution boundary; a generic signer artifact name is not
enough for signer-boundary release notes.

The `Signer dependency conformance or fail-closed release decision evidence`
Required Evidence row marked `linked` must mention either positive upstream
signer conformance evidence or a fail-closed signer release decision boundary
with `Production-ready claim allowed = no`.

The `Broadcast gate evidence` Required Evidence row marked `linked` must
mention `demo:readiness` broadcast policy command output with `exit code 0`; a
generic broadcast artifact name is not enough for broadcast-gate release notes.

A copied Gate 4 signer dependency blocker marked `Checked` requires
`release:gate` to consume the actual `--dependency-review-evidence` target and
structured `dependency:validate` command, scope, triage, upgrade, and reviewer
rows. A PASS summary, target, or signer publication decision alone cannot
support the copied release-note evidence row.

The `Dependency risk review evidence` Required Evidence row marked `linked`
must also mention `dependency:validate` command output with `exit code 0`,
`Production-ready claim allowed = no`, and
`Critical/high vulnerabilities open = 0`; a generic dependency-risk artifact
name is not enough for Gate 4 release notes.
Gate 4 dependency release-note and checklist publication-update evidence must
also include exact `Release supported = institutional reference`, exact
`Testnet production-candidate claim allowed = no`, exact
`Critical/high vulnerabilities open = 0`, and exact
`Upstream signer blocker resolved = no` while the upstream signer blocker
remains fail-closed.

A copied Gate 4 independent security review blocker marked `Checked` requires
`release:gate` to consume the actual `--security-review-evidence` target and
structured `security:validate` scope, evidence-package, finding, negative-check,
and reviewer rows. A PASS summary, target, classification, or final decision
alone cannot support the copied release-note evidence row.

The `Independent security review` Required Evidence row marked `linked` must
also mention `security:validate` command output with `exit code 0`,
`Final decision = approve`, `Critical/high findings open = 0`,
`Publication blockers = 0`, and `Production-ready claim allowed = no`; a
generic security-review artifact name is not enough for Gate 4 release notes.
Gate 4 release-note and checklist publication-update evidence fields must
include exact `Accepted risks reflected in release notes = yes`; when testnet
candidate claims are allowed, they must also include exact
`Testnet production-candidate claim allowed = yes`; when the security review
release-support field is exact `Release supported = production deployment
candidate`, they must also include exact
`Release supported = production deployment candidate`. For production-candidate
Gate 4 publication updates, they must also include exact
`Critical/high findings open = 0` and `Publication blockers = 0`.

A copied Gate 5 trustless burn blocker marked `Checked` requires
`release:gate` to consume the actual `--trustless-burn-evidence` target and
structured `trustless:validate` proof, negative-case, publication-decision, and
reviewer rows. A PASS summary, target, classification, or final decision alone
cannot support the copied release-note evidence row.

The `Trustless burn verification evidence` Required Evidence row marked
`linked` must also mention `trustless:validate` command output with
`exit code 0`, `Trustless burn verification implemented = yes`,
`Transitional trusted burn path disabled = yes`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`, and
`Critical/high findings open = 0`; a generic trustless-burn artifact name is
not enough for Gate 5 release notes.
Gate 5 release-note and checklist publication-update evidence fields must
include exact `Trustless burn verification implemented = yes`; when the Gate 5
release level is `production deployment candidate`, they must also include
exact `Release supported = production deployment candidate`; when testnet
candidate claims are allowed, they must also include exact
`Testnet production-candidate claim allowed = yes`; when critical/high
findings are closed, they must also include exact
`Critical/high findings open = 0`.
For a blocked Gate 5 trustless-burn boundary where trustless burn verification
is not implemented and testnet production-candidate support is not allowed, the
Gate 5 release-note and checklist update evidence fields must include exact
`Production-ready claim allowed = no` and exact
`Testnet production-candidate claim allowed = no`. Do not state trustless burn
implementation, transitional-path closure, critical/high finding closure, or
testnet production-candidate support unless the evidence also uses the matching
exact closure bindings above.

A copied Gate 6 committee governance blocker marked `Checked` requires
`release:gate` to consume the actual `--governance-evidence` target and
structured `governance:validate` scope, command, rotation, positive-check,
negative-check, and reviewer rows. A PASS summary, target, classification, or
governance publication decision alone cannot support the copied release-note
evidence row.

The `Committee governance and key-rotation evidence` Required Evidence row
marked `linked` must also mention command-specific governance command output
with `exit code 0`, `Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Governance-ready claim allowed = yes`, and
`Open governance blockers = 0`; a generic governance artifact name is not
enough for Gate 6 release notes, and `yes/no` placeholders do not satisfy these
claim-allowance fields.
When the governance-ready claim is allowed, the release-note and checklist
update evidence fields must also include exact
`Governance-ready claim allowed = yes`.
When open governance blockers are closed, those update evidence fields must
also include exact `Open governance blockers = 0`.
When the governance release-support field is exact
`Release supported = production deployment candidate`, those update evidence
fields must also include exact
`Release supported = production deployment candidate`. When the governance
testnet-candidate field is exact
`Testnet production-candidate claim allowed = yes`, those update evidence
fields must also include exact
`Testnet production-candidate claim allowed = yes`.
For a blocked Gate 6 governance boundary where testnet production-candidate
support is not allowed, the Gate 6 release-note and checklist update evidence
fields must include exact `Production-ready claim allowed = no` and exact
`Testnet production-candidate claim allowed = no`. Do not state governance-ready
claim closure or open governance blocker closure unless the evidence also uses
exact `Governance-ready claim allowed = yes` and exact
`Open governance blockers = 0`.

A copied Gate 6 operator readiness blocker marked `Checked` requires
`release:gate` to consume the actual `--operator-readiness-evidence` target and
structured `operator:validate` runbook, command, drill, decision, and reviewer
rows. A PASS summary, target, classification, or operator publication decision
alone cannot support the copied release-note evidence row.

The `Operator readiness evidence` Required Evidence row marked `linked` must
also mention command-specific operator command output with `exit code 0`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Operator-ready claim allowed = yes`, and `Critical incidents open = 0`; a
generic operator-readiness artifact name is not enough for Gate 6 release notes,
and `yes/no` placeholders do not satisfy these claim-allowance fields.
When production deployment candidate support is allowed, the release-note and
checklist update evidence fields must also include exact
`Release supported = production deployment candidate`. When those operator and
testnet claims are allowed, the release-note and checklist update evidence
fields must also include exact `Operator-ready claim allowed = yes` and exact
`Testnet production-candidate claim allowed = yes`.

The `Threat model and evidence matrix` Required Evidence row marked `linked`
requires `release:gate` to consume the actual `--threat-model-evidence` target
validated by `npm run threat-model:validate`. The gate consumes structured
security evidence matrix rows and requires the linked validation target to match
the canonical matrix artifact; a PASS summary, target, or narrative risk note
alone cannot support threat-model, evidence-matrix, risk-class, attack-chain, or
mitigation wording. The linked row must also mention `threat-model:validate`
command output with `exit code 0`; a generic matrix link is not enough.

A copied Gate 7 benchmark blocker marked `Checked` requires `release:gate` to
consume the actual `--benchmark-evidence` target and structured
`benchmark:validate` metric, sharded-lane, bottleneck, and reviewer rows. A
PASS summary, target, classification, or benchmark publication decision alone
cannot support the copied release-note evidence row.
The `Single, batch, and sharded benchmark evidence` Required Evidence row
marked `linked` must also mention command-specific benchmark command output
with `exit code 0`, `Scaling claims allowed = yes`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Production throughput claim allowed = no`,
`Mainnet-grade evidence linked = no`, and `Open benchmark blockers = 0`; a
generic benchmark artifact name is not enough for Gate 7 release notes.
When the Gate 7 release-support field is exact
`Release supported = production deployment candidate`, scaling claims are
allowed, the testnet-candidate field is exact
`Testnet production-candidate claim allowed = yes`, or production throughput
claims are blocked, the Gate 7 release-note and checklist update evidence
fields must also include exact
`Release supported = production deployment candidate`, exact
`Scaling claims allowed = yes`, exact
`Testnet production-candidate claim allowed = yes`, and exact
`Production throughput claim allowed = no` as applicable.
For an institutional-reference Gate 7 benchmark boundary where testnet
production-candidate support is not allowed, the Gate 7 release-note and
checklist update evidence fields must instead include exact
`Release supported = institutional reference`, exact
`Scaling claims allowed = yes`, exact
`Production-ready claim allowed = no`, exact
`Testnet production-candidate claim allowed = no`, exact
`Production throughput claim allowed = no`, and exact
`Mainnet-grade evidence linked = no`. Do not state benchmark blocker closure
unless the evidence also uses exact `Open benchmark blockers = 0`.

Rows marked `linked` must include a completed evidence link, command-output
target, or `artifact://...` marker. Template links, targetless command-output
notes, and validator command names alone are resolution targets or narrative
status notes, not completed evidence; row-named non-concrete artifact targets
such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`sample-evidence-*`, and `example-evidence-*` remain placeholders even when
they include the row name. Rows that remain `pending` or `blocker` must keep a
publication effect.
Publication effects must not introduce absolute security wording.
Any non-empty evidence cell must identify the evidence class it supports:
clean checkout CI, local devnet, testnet, failed broadcast phantom AVL recovery,
reorged burn or stale singleton recovery, ContextExtension signer guard,
signer dependency conformance or fail-closed release decision, broadcast gate,
SQLite/AVL backup-restore, operator readiness, committee governance/key
rotation, threat model, dependency risk, independent security review, trustless
burn, benchmark evidence, external integration package review, or technical
addendum architecture manual evidence.
A Testnet lifecycle rehearsal row marked `linked` must also cite `Ergo node
network testnet` and `Sidechain network` as `patched-devnet`, `testnet`, or
an explicit non-mainnet sidechain network, with no negated or mixed network
wording such as `not testnet`, `not on testnet`, `not on the testnet`, `not
using testnet`, `not connected to testnet`, `no testnet`, `without testnet`,
`without the testnet`, `mainnet`, `main network`, `main chain`, or
`mainchain`; a generic testnet artifact name is not enough for release notes
that support testnet production-candidate or production-grade testnet wording.
For a production deployment candidate, the linked Testnet lifecycle rehearsal
row must include a completed non-template live rehearsal artifact, the completed live rehearsal target,
distinct `rehearsal:validate` transcript artifact containing
`npm run rehearsal:validate` PASS output or `exit code 0`, and a
`validated target` binding to the completed live rehearsal artifact. The
transcript must include confirmation policy met PASS, `confirmationsRequired=<n>`,
`confirmationsObserved=<n>`, observed confirmation count greater than or equal
to required confirmation count, submitted transaction ID, and completed finality
evidence. The validation output artifact must be distinct from the completed live rehearsal target.
Release-note validation treats lifecycle PASS snippets as fail-closed evidence:
a `PASS`, `exit code 0`, or zero-issues phrase in the same excerpt as `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` does not satisfy confirmation/finality, readiness, policy,
or signing evidence.
The row must also link a distinct `rehearsal:live-preflight` PASS transcript
whose Expected transaction ID matches the submitted transaction ID and whose
`live preflight target` binding names the same completed live rehearsal target.
The row must also link a distinct `rehearsal:post-submit:observe` PASS
transcript/report whose submitted or Expected transaction ID matches the
validated live rehearsal and which records the output shape: SPV tracker
successor output `OUTPUTS(0)`, Aggregate DUP successor output `OUTPUTS(1)`,
positional recipient payout binding, and final canonical miner fee output.
The same row must link the completed structured `post-submit-observe.json`
report emitted with `--json-out`; Markdown-only post-submit evidence is not
enough for Gate 3 closure.
An External integration package review row marked `linked` must also mention a
fresh reviewer, `Private maintainer context used = no`, fresh checkout command
output with `exit code 0`, fresh checkout commit identity matching the Release Classification `Git commit`,
`integration:validate` command output with `exit code 0`,
`Public institutional-reference release allowed = yes`,
`Production-ready claim allowed = no`,
and either exact `Testnet production-candidate claim allowed = no` or exact
`Testnet production-candidate claim allowed = yes`; a generic external
integration artifact name is not enough for Gate 8 release notes. When Gate 8
allows testnet production-candidate claims, release-note and checklist
publication-update fields must include exact
`Testnet production-candidate claim allowed = yes`. The copied Gate 8 blocker must
preserve per-command fresh or clean checkout context evidence, per-command
fresh checkout command output evidence, and per-command fresh checkout commit identity,
not only successful command output. External integration,
institutional-reference, public-release,
publication-ready, or safe-to-publish wording also requires the copied Gate 8
Publication Blocker row to be `Checked`; a linked Required Evidence row alone is
not enough. A checked Gate 8 blocker also requires `release:gate` to consume the
actual `--integration-evidence` target and structured `integration:validate`
rows; a PASS summary or publication decision cannot substitute for the rows.
For a production deployment candidate, the Technical addendum architecture
manual row must link completed architecture manual evidence with the Gate 2
claim-boundary fields above, and the copied Gate 2 blocker must bind that
evidence to `npm run addendum:validate` PASS output and the
`release:gate -- --technical-addendum-evidence` target.

For a production deployment candidate, every required evidence row must be
`linked`.

Required references:

- [Institutional Release Checklist](release-checklist.md)
- [Clean Checkout Evidence Template](clean-checkout-evidence-template.md)
- [Security Evidence Matrix](security-evidence-matrix.md)
- [Dependency Review Evidence Template](dependency-review-evidence-template.md)
- [Aggregate Settlement Threat Model Refresh](aggregate-settlement-threat-model.md)
- [Operator Runbooks](operator-runbooks.md)
- [Operator Readiness Evidence Template](operator-readiness-evidence-template.md)
- [Live Rehearsal Evidence Template](live-rehearsal-template.md)
- [Backup Restore Evidence Template](backup-restore-evidence-template.md)
- [Independent Security Review Evidence Template](independent-security-review-evidence-template.md)
- [Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md)
- [Performance Benchmark Evidence Template](performance-benchmark-evidence-template.md)
- [Committee Governance Evidence Template](committee-governance-evidence-template.md)
- [External Integration Review Template](external-integration-review-template.md)
- [Testnet Production-Candidate Architecture Manual Template](testnet-production-candidate-architecture-manual-template.md)
- [Contract And Relayer API Reference](contract-relayer-api-reference.md)

## Trust Assumptions

| Assumption | Current status | Evidence | Release impact |
|---|---|---|---|
| Trusted-oracle burn interpretation | | | |
| ContextExtension signer consensus | | | |
| Committee/governance and key rotation | | | |
| Explicit broadcast opt-in | | | |
| Local SQLite/AVL recovery | | | |
| External security review | | | |

Evidence cells must use a structured marker. Narrative text without a link,
command, or artifact marker is not sufficient.
Evidence cells must also be completed evidence: a non-template evidence link,
command-output target, or an `artifact://...` marker. Template links,
targetless command-output notes, and validator command names alone are
resolution targets or narrative status notes, not completed evidence.
Evidence cells must identify the trust assumption they support: trusted-oracle
burn interpretation, ContextExtension signer consensus, committee/governance
key rotation, explicit broadcast opt-in, local SQLite/AVL recovery, or external
security review.
Current status and release impact must not introduce absolute security wording.
For non-production releases, they must not introduce production,
production-candidate, production-grade, prod-ready, prod-candidate,
prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready,
market-ready, launch-ready, go-live, general availability, generally available, GA-ready,
production launch, exchange-ready, exchange-grade, institutional-grade,
institutional-ready, enterprise-grade, enterprise-ready, or
ready-for-production wording.

## Publication Blockers

Copy every unresolved row from the Pending Evidence Register in
[Institutional Release Checklist](release-checklist.md). Do not summarize or
hide blockers in prose. For non-production releases, `npm run
release-notes:validate` also requires every required blocker row from the
checklist to remain present in this table.
Do not duplicate blocker rows; one checklist blocker must have one canonical
release-note row and one status.
Unresolved required blocker rows must use the same unresolved status
(`Pending evidence` or `Open blocker`) as the Pending Evidence Register until
they are marked `Checked`.
For `validated PoC` releases, clean checkout CI and fresh local devnet
lifecycle blockers must remain in scope until marked `Checked`.
For `institutional reference` releases, only the trustless burn, committee
governance/key-rotation, and benchmark/scaling blockers may be scoped out.
Public-release, signer-dependency, institutional-readiness, and
external-integration blockers must remain in scope until marked `Checked`.

If a copied blocker is marked `Checked`, the required resolution must include a
completed evidence link, command-output target, or artifact marker to the
evidence that resolved it. Template links, targetless command-output notes, and
validator command names alone are resolution targets or narrative status notes,
not completed evidence.
If a custom blocker is marked `Checked`, the required resolution must include
structured resolution evidence in the same segment, such as validator output,
release-notes blocker review with `Publication blocker resolved = yes`, or
reviewer decision evidence with `Reviewer decision = approve` and
`Publication blocker resolved = yes`; a target-only artifact is not enough.
If a copied blocker is marked `Checked`, the corresponding Required Evidence
row must also be `linked`; blocker status and evidence status cannot diverge.
Every publication blocker row, including custom blocker rows, must keep a
structured resolution target even while it is still `Pending evidence` or
`Open blocker`; narrative text such as `Complete proof path` is not enough.
Required resolution text must not introduce absolute security wording.
Every required blocker row must also preserve the row-specific resolution terms
from the Pending Evidence Register. A generic artifact link is not enough if it
does not name the required evidence class, validator command, and gate-specific
facts that unblock the release.
For a production deployment candidate, every required blocker row must remain
present, be marked `Checked`, include resolving evidence, and use `Scoped out?`
`no`.

| Gate | Blocker | Status | Required resolution | Scoped out? |
|---|---|---|---|---|
| | | | | yes / no |

## Allowed Claims

List only claims backed by linked evidence.
Claim evidence links must use completed evidence links, command-output targets,
or `artifact://...` markers; template links, targetless command-output notes,
and validator command names alone are resolution targets or narrative status
notes, not completed evidence.
Claim evidence links must identify the allowed claim. Generic review artifacts
are not enough.
Claim evidence links must not negate the allowed claim; an artifact or note that
identifies a claim only as missing, blocked, forbidden, disallowed, unresolved,
or not supported is blocker evidence, not allowed-claim evidence.
Allowed wording must not include absolute security claims such as risk-free,
no vulnerabilities, no exploits, security guarantees, funds are safe,
lossless bridge, no fund loss, or cannot lose funds. The same restriction
applies to the scope statement.
Unqualified `production-ready` or production-readiness wording is never allowed
in claims. The only production-candidate wording this template can evaluate is
explicitly scoped to testnet, such as `testnet production-candidate` or
`production-grade testnet`.
When an Allowed Claims row is a controlled testnet production claim, its
Allowed wording cell must itself use `testnet production-candidate` or
`production-grade testnet`; evidence links or internal claim labels are not public wording.
`production deployment candidate` is a release-level classification only; do
not use it as Allowed Claims wording or public release-name/scope wording.
Forbidden mainnet-scoped claims include mainnet, main-net, main net, main
network, or main chain paired with forbidden production-ready,
production-candidate, go-live, general availability, generally available, or production launch
wording.
Testnet production-candidate claims require linked final CI, local devnet,
testnet lifecycle, recovery-drill, backup-restore, ContextExtension signer
guard, broadcast gate, upstream signer conformance, operator readiness,
governance/key-rotation, threat model, dependency risk, independent security
review, trustless burn verification, benchmark, external integration evidence,
and checked publication blockers.
Testnet lifecycle wording, including fresh testnet, Ergo testnet, testnet
rehearsal, testnet-scoped submit/confirmation/reconciliation, and full
lifecycle wording, requires the Testnet lifecycle rehearsal row to link a
completed live rehearsal target plus `npm run rehearsal:validate` PASS output
bound to that completed rehearsal target. The linked row must also cite `Ergo
node network testnet` and `Sidechain network` as `patched-devnet`, `testnet`, or
an explicit non-mainnet sidechain network. A generic completed artifact marked
`linked` is not enough for a testnet lifecycle claim.
The signer dependency evidence for any testnet production-candidate or
production-grade testnet claim must affirmatively state
`Upstream signer blocker resolved = yes` and positive upstream signer release,
JVM/node conformance, golden-vector, or live `/transactions/check` evidence.
Negative upstream signer conformance wording such as missing, unavailable,
unverified, not validated, not yet validated, not yet verified, not fully validated,
partially validated, not verified, not linked, absent, or unresolved is blocker
evidence, even when the row is otherwise marked `linked`.
Throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence
in the Required Evidence table.
External integration, institutional-reference, public-release,
publication-ready, or safe-to-publish wording requires both linked Gate 8
Required Evidence and the copied Gate 8 Publication Blocker row to be `Checked`.

| Claim | Evidence link | Allowed wording |
|---|---|---|
| | | |

## Disallowed Claims Check

All rows must be checked before release notes are attached to any publication.

- [ ] No absolute security claim.
- [ ] No unqualified production-ready or production-readiness claim.
- [ ] No production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production claim unless the wording is the controlled `testnet production-candidate` or `production-grade testnet` public wording and all required testnet evidence gates are linked and checked; this exception does not allow production-ready, mainnet, go-live, general availability, generally available, or production launch wording.
- [ ] No forbidden mainnet-scoped claim: mainnet, main-net, main net, main network, or main chain paired with forbidden production-ready, production-candidate, go-live, general availability, generally available, or production launch wording; production-candidate language is testnet-only.
- [ ] No testnet production-candidate or production-grade testnet claim without linked final CI, local devnet, testnet lifecycle, recovery drills, backup-restore, ContextExtension signer guard, broadcast gate, signer conformance, operator readiness, governance/key-rotation, threat model, dependency risk, independent security review, trustless burn verification, benchmark, external integration evidence, technical addendum architecture manual evidence, and checked publication blockers.
- [ ] No throughput, latency, TPS, tx/s, transaction-per-second, or scaling claim without benchmark evidence.
- [ ] No trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment claim without linked trustless burn evidence.
- [ ] No trusted burn verification, trusted-oracle burn, or oracle-fallback completion claim without linked trustless burn evidence.
- [ ] No ContextExtension signer guard, fail-closed guard, or signer resolution claim without linked ContextExtension signer guard evidence.
- [ ] No signer dependency, ContextExtension, sigma-rust, or upstream signer claim without linked signer dependency evidence.
- [ ] No broadcast, broadcast gate, broadcast opt-in, or transaction broadcast claim without linked broadcast gate evidence.
- [ ] No dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage claim without linked dependency risk review evidence.
- [ ] No threat model, evidence matrix, risk-class, attack-chain, or mitigation claim without linked threat-model/evidence-matrix evidence.
- [ ] No claim that trusted burn verification is solved until the SPV/burn inclusion proof path is linked.
- [ ] No committee governance, key-rotation, threshold, or multisig claim without linked committee governance evidence.
- [ ] No claim that committee governance is complete until key-rotation and incident drills are linked.
- [ ] No operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring claim without linked operator readiness evidence.
- [ ] No external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context claim without linked external integration evidence.
- [ ] No backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild claim without linked backup-restore evidence.
- [ ] No security review, audit, security assessment, penetration-test, finding disposition, or critical/high claim without linked independent security review evidence.
- [ ] No failed broadcast, phantom AVL, or phantom DUP claim without linked failed-broadcast recovery evidence.
- [ ] No reorged burn or stale singleton claim without linked reorg/stale-singleton recovery evidence.
- [ ] No clean checkout, CI, final branch, or workflow claim without linked clean-checkout evidence.
- [ ] No local devnet lifecycle claim without linked local devnet lifecycle evidence.
- [ ] No testnet lifecycle claim without completed live rehearsal evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target and linked `Ergo node network testnet` plus `Sidechain network` scope evidence.
- [ ] No peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation claim without linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target.

## Operator Impact

Operator impact actions must reference a runbook, command, verification,
monitoring, backup, restore, status, preflight, capture, enable/disable, or
incident action. Stop conditions must include explicit stop, block, fail,
disable, pause, incident, mismatch, do-not, or refuse wording; generic `ok` or
`reviewed` notes are not enough.
Each row must also mention the operator area it covers: deployment state,
broadcast enablement, SQLite/AVL backup restore, monitoring/alerting, or
incident response.
Operator actions and stop conditions must not introduce absolute security
wording. For non-production releases, they must not introduce production,
production-candidate, production-grade, prod-ready, prod-candidate,
prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready,
market-ready, launch-ready, go-live, general availability, generally available, GA-ready,
production launch, exchange-ready, exchange-grade, institutional-grade,
institutional-ready, enterprise-grade, enterprise-ready, or
ready-for-production wording.
For production deployment candidate release notes, operator actions and stop
conditions still cannot use mainnet-scoped production wording or unqualified
production-ready/go-live wording; only controlled testnet wording can be
evaluated, and only when the required evidence and blockers are linked.

| Area | Required operator action | Stop condition |
|---|---|---|
| Deployment state | | |
| Broadcast enablement | | |
| SQLite/AVL backup restore | | |
| Monitoring and alerting | | |
| Incident response | | |

## Sign-Off

Every sign-off decision must be `approve` before release notes can pass. A
`block` decision must stay documented until resolved.
Sign-off dates must use `YYYY-MM-DD` so release evidence has an auditable
calendar date rather than a narrative timestamp.
Sign-off dates must not be before the Release Classification `Decision date`.
Do not remove the `Notes` column; release-note validation rejects a sign-off
table that cannot carry role-specific claim-control rationale.
The `Maintainer` sign-off name must match the `Decision owner` in Release
Classification; a different maintainer cannot close the release-note decision.
Sign-off notes must state a concrete release-note claim-control outcome tied to
release notes, claims, blockers, evidence, trust assumptions, operator impact,
scope, production status, gates, or publication.
Sign-off notes must not introduce absolute security wording. For
non-production releases, they must not introduce production,
production-candidate, production-grade, prod-ready, prod-candidate,
prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready,
market-ready, launch-ready, go-live, general availability, generally available, GA-ready,
production launch, exchange-ready, exchange-grade, institutional-grade,
institutional-ready, enterprise-grade, enterprise-ready, or
ready-for-production wording.
For production deployment candidate release notes, sign-off notes still cannot
use mainnet-scoped production wording or unqualified production-ready/go-live
wording; only controlled testnet wording can be evaluated, and only when the
required evidence and blockers are linked.
Each sign-off note must also identify the role-specific review scope:
maintainer release decision/scope/publication/blockers, security claims/trust
assumptions/evidence/blockers, or operator impact/runbooks/readiness/incidents.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Maintainer | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
