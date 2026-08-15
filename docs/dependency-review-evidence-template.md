# Dependency Review Evidence Template

Use this template for dependency review and vulnerability triage evidence on a
release candidate. It is a claims-control artifact, not an audit report.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, npm tokens, or private deployment state.

## Review Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Review name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | clean checkout / local offline / CI / staging / testnet |
| Lockfiles reviewed | yes / no |
| Reviewer | |
| Date | |

`Release level = production deployment candidate` requires `Environment =
testnet`; mainnet production-ready claims remain forbidden.

## Required Commands

Run from a clean checkout. If a network-backed advisory command cannot run in
the environment, record it as a blocker instead of replacing it with prose.

```powershell
cd relayer
npm ci
npm run check
npm run wasm:test
npm audit --omit=dev
cd ..\wasm-avl
cargo tree --locked
```

Validate a completed copy before linking it as dependency review evidence:

```powershell
cd relayer
npm run dependency:validate -- ../evidence/dependencies/<completed-dependency-review-evidence>.md
```

The blank template is expected to fail validation. Dependency review evidence
passes only when command evidence, dependency scope, vulnerability triage,
upgrade/pinning decisions, publication decision fields, and reviewer sign-offs
are complete and linked.
`release:gate -- --dependency-review-evidence <completed-dependency-review-evidence.md>`
consumes the structured Review Classification, rows, and publication-decision
fields returned by this validator. For testnet production-candidate support,
the Review Classification must expose `Release level = production deployment
candidate`, `Environment = testnet`, `Lockfiles reviewed = yes`, a 7-40
character `Git commit`, reviewer identity, and ISO `Date`; dependency reviewer
sign-off must match that reviewer and must not predate that date. For Gate 4
`Checked` rows and testnet production-candidate support, `release:gate` also
requires this `Git commit` to match the final clean-checkout Run Classification
`Git commit`. A target link, PASS summary, publication decision, or signer
upgrade note alone cannot close the Gate 4 signer blocker unless the validator
output also exposes linked command, scope, triage, upgrade, reviewer rows, and
completed dependency-review
release-note/checklist update evidence. The gate also checks that those rows
carry internally positive command-specific completed output evidence,
dependency-specific source, risk, and evidence payloads, completed triage
evidence with explicit zero critical/high findings, completed upgrade evidence
with decision-specific release actions, and actionable dependency-risk reviewer
notes that keep signer, vulnerability, and claim boundaries. Generic row
payloads such as `PASS`, `reviewed`, or `approved`, and row-named non-concrete
artifact targets, remain blocked. The same completed validator input is
required before marking the Gate 4 signer dependency row as `Checked`;
row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are treated as
placeholders, not completed dependency review evidence.
The completed dependency review document target itself must be concrete as
well: a validator PASS bound to `generic-completed-*.md`,
`placeholder-completed-*.md`, `todo-completed-*.md`, or `tbd-completed-*.md`
does not satisfy the release gate.
The distinct `dependency:validate` transcript or log target must also be
concrete. A PASS line recorded under `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`, `testdata-*`,
`sample-evidence-*`, or `example-evidence-*` is not completed
validator-output evidence. A validator-output segment is also not positive if
it carries `FAIL`, `BLOCKED`, `ERROR`, a non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues` alongside an older `PASS` note.
Linked Dependency Scope, Vulnerability Triage, and Upgrade And Pinning Decision
evidence cells are fail-closed under the same rule: completed artifact markers,
linked status, or positive review text cannot appear in the same cell as
failed validator/command markers, `ERROR`, non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues`.

Rows marked `linked` in Required Commands, Dependency Scope, Vulnerability
Triage, Upgrade And Pinning Decision, Required release-note updates, or
Required checklist updates must use
completed dependency review evidence markers and targets: an `artifact://...`
URI or a non-template evidence link. Command output/log context, including PASS
notes, is acceptable only when it is recorded inside or next to a real evidence
target. Template links, bare validator command names, and targetless notes such
as `npm run dependency:validate command output: PASS`, as well as row-named
non-concrete artifact targets, are resolution targets. Those targets are not completed dependency review evidence.
Rows that cite only `dependency review validation target`,
`dependency validate target`, `validated target`, or `validated input` are
validator input/output bindings, not completed command, dependency-scope,
triage, upgrade, release-note, or checklist evidence, even when the link points
at the same completed document or artifact.
Linked Required Commands, Dependency Scope, Vulnerability Triage, and Upgrade
And Pinning Decision rows must also use distinct completed evidence targets.
One shared dependency-review artifact or log cannot close multiple row-specific
checks across command, scope, triage, or upgrade rows.
Required release-note updates and Required checklist updates must also use
distinct completed dependency review evidence targets. A combined
publication-update artifact that carries both markers cannot close both fields.
Each linked Required Commands row must identify the exact command output it
closes. A single shared dependency-review artifact is not enough unless the row
evidence also names that command or uses a command-specific artifact slug. The
same row must include positive command-output evidence such as `PASS`, `passed`,
`success`, `ok`, or `exit code 0`; a row that also reports `FAIL`, `BLOCKED`,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` remains blocked.

| Command | Evidence | Status |
|---|---|---|
| npm ci | | pending / linked / blocker |
| npm run check | | pending / linked / blocker |
| npm run wasm:test | | pending / linked / blocker |
| npm audit --omit=dev | | pending / linked / blocker |
| cargo tree --locked | | pending / linked / blocker |

## Dependency Scope

Every row below must be reviewed for the exact release branch and lockfiles.
The `Reviewed risk` cell must stay dependency-specific: generic wording such as
`reviewed`, `tested`, or `critical risk reviewed` is not enough. It must name
the relevant signer/ContextExtension, transaction assembly, wallet fallback,
AVL proof/JVM, SQLite recovery, EVM event, WASM toolchain, or npm lockfile risk
for that row.
The `Evidence` cell must identify the reviewed dependency or toolchain:
ergo-lib-wasm-nodejs, sigma-rust ContextExtension serializer, Fleet SDK core,
common or wallet packages, ergo_avltree_rust, better-sqlite3, ethers,
blakejs, wasm-pack/Rust toolchain, or the Node.js/npm lockfile.
Rows marked `linked` must not mix that completed dependency evidence with
failed validator/command markers, `ERROR`, non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues`.

| Dependency | Source | Reviewed risk | Evidence | Status |
|---|---|---|---|---|
| ergo-lib-wasm-nodejs | `relayer/package.json`, `relayer/package-lock.json` | sigma-rust signer consensus and ContextExtension serialization | | pending / linked / blocker |
| sigma-rust ContextExtension serializer | transitive signer implementation | signed bytes and TX ID consensus | | pending / linked / blocker |
| @fleet-sdk/core | `relayer/package.json`, `relayer/package-lock.json` | transaction assembly API drift | | pending / linked / blocker |
| @fleet-sdk/common | `relayer/package.json`, `relayer/package-lock.json` | shared transaction/address helpers | | pending / linked / blocker |
| @fleet-sdk/wallet | `relayer/package.json`, `relayer/package-lock.json` | wallet helper fallback risk | | pending / linked / blocker |
| ergo_avltree_rust | `wasm-avl/Cargo.toml`, `wasm-avl/Cargo.lock` | AVL proof compatibility with JVM Scorex verifier | | pending / linked / blocker |
| better-sqlite3 | `relayer/package.json`, `relayer/package-lock.json` | native SQLite state and recovery risk | | pending / linked / blocker |
| blakejs | `relayer/package.json`, `relayer/package-lock.json` | Blake2b commitment hashing and proof-root consistency risk | | pending / linked / blocker |
| ethers | `relayer/package.json`, `relayer/package-lock.json` | EVM event and receipt interpretation risk | | pending / linked / blocker |
| wasm-pack and Rust toolchain | clean-checkout toolchain | reproducible WASM AVL build | | pending / linked / blocker |
| Node.js / npm lockfile | `relayer/package-lock.json` | reproducible TypeScript dependency install | | pending / linked / blocker |

## Vulnerability Triage

Record the tool output or manual review artifact. Do not paste credentials,
tokens, or local user paths.
Rows marked `linked` must explicitly state zero, none, no open, closed, or
resolved critical/high findings. Any unresolved critical/high finding must stay
as `blocker`. A linked row must show no positive critical/high finding counts in
the same `Findings` cell; wording such as `no open critical/high; 1 high
remains open` is contradictory blocker evidence, not completed triage.
The linked `Evidence` cell must also stay internally positive; a completed
triage artifact cannot share the cell with failed validator/command markers,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`.

| Triage item | Tool or review method | Findings | Evidence | Status |
|---|---|---|---|---|
| npm production dependencies | `npm audit --omit=dev` plus manual review | | | pending / linked / blocker |
| npm dev and build toolchain | npm audit or pinned-toolchain review | | | pending / linked / blocker |
| Rust dependency tree | `cargo tree --locked` plus advisory review if available | | | pending / linked / blocker |
| Signer consensus dependency | sigma-rust release notes, vectors, and JVM conformance status | | | pending / linked / blocker |
| AVL proof dependency | Scorex/JVM compatibility review and WASM tests | | | pending / linked / blocker |
| SQLite native dependency | backup/restore and native package review | | | pending / linked / blocker |
| EVM event dependency | event parsing and trust-model review | | | pending / linked / blocker |
| Lockfile integrity | clean checkout lockfile diff and install reproducibility | | | pending / linked / blocker |

## Upgrade And Pinning Decision

The signer dependency row must state either upstream release/conformance
validation or an explicit fail-closed guard/blocker rationale. Upstream
resolution must include a concrete release identifier such as a version, tag,
commit, release URL, or artifact link, plus JVM/node evidence such as positive
golden vectors or live `/transactions/check`. A generic `keep pinned` note is
not enough for the sigma-rust signer path.
The `Required evidence` cell for the signer dependency decision must link the
completed upstream signer release and JVM/node conformance evidence. The
validator and release gate do not accept a release-action sentence by itself as
completed signer conformance evidence. A completed artifact target without the
release identifier and positive JVM/node conformance facts is also insufficient.
When upstream resolution is used, the concrete release identifier in
`Release action` must match the concrete release identifier in `Required
evidence`; mismatched signer versions, tags, or commits keep the blocker open.
Negated or qualified-incomplete wording such as missing, unavailable,
unverified, not validated, not yet validated, not yet verified, not fully
validated, or partially validated JVM/node conformance evidence cannot be used
as upstream signer resolution.
For the fail-closed path, the release action must also state that both
production-ready claims and testnet production-candidate claims remain blocked
until upstream signer release and JVM/node conformance evidence are validated.
It must cite completed ContextExtension guard evidence using a non-template
evidence link or `artifact://` evidence marker; command output text is
acceptable only alongside one of those targets. A bare PASS note is not
completed signer-risk evidence, and a generic fail-closed note is not completed signer-risk evidence.
Linked upgrade `Required evidence` cells must also stay internally positive; a
completed dependency artifact cannot share the cell with failed
validator/command markers, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`.

| Decision | Required evidence | Release action | Status |
|---|---|---|---|
| Signer dependency upgrade decision | completed upstream signer release and JVM/node conformance evidence, or completed explicit blocker rationale | | pending / linked / blocker |
| Fleet SDK upgrade decision | API drift and signer-surface review | | pending / linked / blocker |
| AVL dependency upgrade decision | proof compatibility tests and JVM check plan | | pending / linked / blocker |
| SQLite dependency upgrade decision | backup/restore impact review | | pending / linked / blocker |
| EVM dependency upgrade decision | event parsing compatibility review | | pending / linked / blocker |
| Toolchain pinning decision | Node, npm, Rust, wasm-pack version evidence | | pending / linked / blocker |

Every non-signer upgrade row must also identify the dependency-specific
decision in `Release action`: Fleet API drift, AVL/JVM proof compatibility,
SQLite native state/recovery, EVM event parsing, or reproducible toolchain
pinning. Generic `approved` or `reviewed` actions do not close those rows.

## Publication Decision

| Field | Value |
|---|---|
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Critical/high vulnerabilities open | |
| Upstream signer blocker resolved | yes / no |
| Release notes updated | yes / no |
| Required release-note updates | |
| Required checklist updates | |
| Reviewer decision summary | |

`Release supported` must not be `none` in completed dependency review evidence,
and must not exceed the `Release level` in Review Classification. Dependency
review evidence for a lower release level cannot be used to support a higher
release decision.
Mainnet production-ready claims are forbidden and `Production-ready claim
allowed` must remain `no` even after upstream signer resolution. If `Upstream signer blocker resolved` is `yes`, the signer dependency release
action must identify the upstream signer release, a concrete release identifier,
and JVM/node conformance evidence such as positive golden vectors or live
`/transactions/check`.
The signer dependency decision's `Required evidence` cell must also link the
completed upstream release and JVM/node conformance artifact; otherwise the
release action is treated as narrative and the gate remains blocked.
The upstream release identifier cited by that evidence must match the signer
release identifier cited in the release action; cross-linking a different
signer version, tag, or commit is blocked.
Evidence that says JVM/node conformance is missing, unavailable, unverified,
not validated, not yet validated, not yet verified, not fully validated, or
partially validated keeps the signer blocker unresolved.
`Release supported = production deployment candidate` also requires
`Environment = testnet` in Review Classification,
`Upstream signer blocker resolved = yes`, and the separate
`Testnet production-candidate claim allowed = yes`; fail-closed dependency evidence cannot
support a production deployment candidate release.
When `Release level = production deployment candidate`, the Publication
Decision must use exact `Release supported = production deployment candidate`.
`Testnet production-candidate claim allowed = yes` is allowed only with
`Release supported = production deployment candidate` and `Upstream signer
blocker resolved = yes`, backed by concrete upstream signer release and
JVM/node conformance evidence in the signer dependency release action.
A fail-closed guard/blocker rationale only supports `Upstream signer blocker resolved = no`,
`Production-ready claim allowed = no`, and
`Testnet production-candidate claim allowed = no`; once candidate claims are
allowed, the signer row must use resolved-upstream wording, not fail-closed
blocker wording. The fail-closed rationale must explicitly state that production-ready claims remain blocked and testnet production-candidate claims remain blocked. The
fail-closed release action must also cite completed ContextExtension guard
evidence; otherwise the signer blocker remains narrative and incomplete.
`Critical/high vulnerabilities open` must be the numeric value `0`; textual
equivalents such as `none`, `no`, or `n/a`, and numeric shorthand without
`= 0`, do not close dependency review publication evidence.
`Required release-note updates` must link completed release-note update
evidence; template links, validator command names, and targetless PASS notes
alone are not completed dependency review release-note evidence. This field is
fail-closed when the same payload pairs completed evidence with `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`.
`Required checklist updates` must link completed dependency review checklist update evidence
before release checklist blockers can be marked checked.
Generic checklist links do not prove the dependency-risk publication update.
This field has the same fail-closed contradictory-output rule as release-note
update evidence.
Required release-note updates and required checklist updates must use distinct
completed dependency review evidence targets; one combined publication-update
target cannot close both fields.
Publication-update fields that mention critical/high vulnerability closure must
use exact numeric `Critical/high vulnerabilities open = 0`; textual zero-like
terms or numeric shorthand without `= 0` are not accepted.
Publication-update fields must also bind the dependency publication decision
with exact `Release supported = <value>`, exact
`Production-ready claim allowed = no`, exact
`Testnet production-candidate claim allowed = <yes|no>`, exact
`Critical/high vulnerabilities open = 0`, and exact
`Upstream signer blocker resolved = <yes|no>`.
`Reviewer decision summary` must mention release support, upstream signer blocker handling,
production-ready claim handling, testnet production-candidate claim handling, and
critical/high vulnerabilities; a generic note such as `dependency risk reviewed
for institutional reference` is not enough. Critical/high vulnerability closure
in this summary must use the exact numeric `Critical/high vulnerabilities open = 0`;
textual equivalents such as `none`, `no`, `closed`, `resolved`, or
`mitigated`, and numeric shorthand without `= 0`, do not close the reviewer
decision.
For the current fail-closed institutional-reference boundary, the reviewer
decision summary must use exact `Release supported = institutional reference`.
For the current fail-closed institutional-reference boundary, the publication
decision facts must be explicit: `Release supported = institutional reference`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = no`,
`Critical/high vulnerabilities open = 0`,
`Upstream signer blocker resolved = no`, and `Release notes updated = yes`.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Dependency reviewer` sign-off name must match the `Reviewer` value in the
Review Classification table; a different approver cannot close the dependency
review evidence.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Review Classification `Date`. Dependency review evidence
cannot be closed with a reviewer approval that predates the dependency review.
Reviewer notes must state a concrete dependency-risk outcome tied to
sigma-rust, ergo-lib-wasm-nodejs, ContextExtension serialization, Fleet SDK,
AVL proof compatibility, SQLite state/recovery, Blake2b hashing, EVM event
parsing, lockfiles, `npm audit`, `cargo tree`, critical/high vulnerability triage,
upstream signer resolution, fail-closed guards, toolchain pinning, or wasm-pack. Generic notes
such as `reviewed dependency evidence` are not enough.
Reviewer notes must also preserve the dependency review boundary: they must not
approve production-ready wording, mainnet-scoped release wording, unresolved
upstream signer blockers, open critical/high vulnerabilities, or fail-closed
signer blockers as candidate support.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable dependency-risk outcome with failed validator or command markers,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`. Fail-closed signer-boundary wording is allowed only when it
keeps claims blocked; it cannot mask a failed dependency validator or command.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Dependency reviewer | | approve / block | | |
| Security reviewer | | approve / block | | |
| Maintainer | | approve / block | | |
