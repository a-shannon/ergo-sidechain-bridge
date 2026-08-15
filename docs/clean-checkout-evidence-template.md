# Clean Checkout Evidence Template

Use this template for Gate 1 clean-checkout CI evidence. It is a claims-control
artifact for reproducibility, not a production-ready claim.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, npm tokens, or private deployment state.

## Run Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Evidence name | |
| Git commit | |
| Branch | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| CI provider | GitHub Actions / local clean checkout / external CI |
| Workflow | |
| Node version | |
| Rust target | |
| wasm-pack version | |
| Reviewer | |
| Date | |

## Required Commands

Run from a clean checkout unless the command states otherwise. Record only log
artifact locations or links, not raw secret-bearing output.

```powershell
cd ergo-sidechain-bridge\relayer
npm ci
npm run check
npm run wasm:test
npm run release:gate
cd ..\..
git diff --check -- ergo-sidechain-bridge
# Run the repository-approved local identity and secret marker scan from publication hygiene.
git status --short
```

Validate a completed copy before linking it as Gate 1 evidence:

```powershell
cd relayer
npm run ci:validate -- ../evidence/ci/<completed-clean-checkout-evidence>.md
```

The blank template is expected to fail validation. Gate 1 evidence passes only
when command evidence, workflow evidence, reproducibility decisions,
publication decision fields, and reviewer sign-offs are complete and linked.
Before a top-level testnet production-candidate claim, run
`release:gate -- --clean-checkout-evidence <completed-clean-checkout-evidence.md>`
so the release gate reads the actual completed clean-checkout evidence and
consumes the structured command, workflow, reproducibility-decision, reviewer
rows, Run Classification fields, and publication-decision update fields
returned by `ci:validate`. A PASS summary, target, publication decision, or row
payload without the validated Run Classification cannot close Gate 1. The gate
also checks that
linked rows carry command-specific completed clean-checkout output evidence,
workflow-specific CI facts, completed reproducibility evidence with
decision-specific publication impact, and actionable clean-checkout reviewer
notes that preserve CI and claim boundaries. Generic row payloads such as
`PASS`, `reviewed`, or `approved` remain blocked, and row-named non-concrete artifact targets
such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`,
`fake-*`, `stub-*`, `testdata-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed command, workflow,
reproducibility, or publication-update evidence. The
Gate 1 checklist row must link completed clean-checkout evidence plus a distinct
`npm run ci:validate` output artifact that names the same clean checkout
validation target. The Gate 1 row should use the explicit phrase
`completed clean checkout evidence` and the exact phrase
`clean checkout validation target` for release-gate target binding.
`clean checkout validation target`, `ci validate target`, `validated target`,
and `validated input` bindings are validator provenance only; they cannot close
command, workflow, reproducibility-decision, release-note, or checklist rows.
Linked command rows must use exact expected-result language: `pass`, `passed`,
or `ok` for install/build/check commands; `blocked with 0 structural issues`
for `npm run release:gate` while blockers remain; `no matches` for the
secret/local path scan; and `clean/no output` for `git status --short`.
Rows marked `linked` in Required Commands, CI Workflow Evidence, and
Reproducibility Decisions must include a completed `artifact://...` marker or a
non-template evidence link. Targetless command-output text, template links, and
bare validator command names are resolution targets, not completed evidence.
Each linked command row must identify the checked command output.
The release gate also rejects reused completed evidence targets across linked
Required Commands, CI Workflow Evidence, and Reproducibility Decisions rows; a
single shared command log, workflow note, or decision artifact cannot stand in
for multiple row-specific checks. A single shared clean-checkout artifact is not enough
for multiple structured row checks.
Pass-like command rows must also be internally positive: a row that mentions
`PASS`, `passed`, `ok`, or `exit code 0` while also reporting `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` is rejected by `npm run ci:validate` and `release:gate`.
The `npm run release:gate` command row is the only expected blocked command
while evidence blockers remain: it may say `blocked with 0 structural issues`,
but any release-gate command evidence that reports `FAIL`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` remains a
blocker. Linked workflow and reproducibility-decision rows use the same
fail-closed evidence rule, so a completed workflow artifact or decision note
cannot be mixed with failed validator/command output, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues`.
The `Final branch commit is identified` workflow row must name the
exact `Branch` and `Git commit` values from Run Classification.
Linked workflow rows must also name the checked workflow fact: the tracked
`.github/workflows/relayer-checks.yml` file, exact Node version, relayer
`package-lock.json` cache key, exact Rust target, exact wasm-pack version,
`npm ci` running before tests, and the `npm run check` / `npm run wasm:test`
CI steps.
Required release-note and checklist updates must use completed Gate 1 update
evidence markers: a completed `artifact://...` marker or non-template evidence
link. Template links, validator command names alone, and targetless command-output notes are not completed Gate 1 publication-update evidence.
When Gate 1 supports `Release supported = production deployment candidate`,
sets `Production-ready claim allowed = no`, or supports
`Testnet production-candidate claim allowed = yes`, both publication-update
fields must include those exact bindings.
The release-note and checklist update fields must cite distinct completed Gate
1 evidence targets; one combined publication-update artifact cannot close both
fields.
Generic release-note or checklist artifacts do not prove Gate 1 publication
updates unless they identify the completed Gate 1 evidence kind, and row-named
non-concrete targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`, `testdata-*`,
`sample-evidence-*`, and `example-evidence-*` remain placeholders even when
they do.
Gate 1 publication-update fields must also be internally positive: a field that
mentions `PASS`, `passed`, `ok`, or `exit code 0` while also reporting `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` is rejected by `npm run ci:validate` and `release:gate`.
Production deployment candidate support must be explicitly testnet-scoped:
`Testnet production-candidate claim allowed` must be `yes`, and
`Production-ready claim allowed` must still be `no`. A testnet
production-candidate claim cannot be set to `yes` unless `Release supported`
is `production deployment candidate`.
Rows proving no runtime state or local path/secret marker is staged must state
that publication/release is blocked if the condition is false. The release-gate
decision must mention 0 structural issues.
The `Required evidence` cell for each reproducibility decision must identify
the checked signal: lockfile/npm ci, WASM AVL tracked-source build, TypeScript
build, relayer tests, Rust WASM tests, runtime-state/worktree hygiene,
local-path or secret-marker scan, or release-gate structural issue output.
Decision evidence marked `linked` must also stay internally positive for that
decision; stale validator output that says `FAILED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` cannot be
paired with the completed decision row.

| Command | Expected result | Evidence | Status |
|---|---|---|---|
| npm ci | pass | | pending / linked / blocker |
| npm run check | pass | | pending / linked / blocker |
| npm run wasm:test | pass | | pending / linked / blocker |
| npm run release:gate | blocked with 0 structural issues until all blockers are resolved | | pending / linked / blocker |
| git diff --check -- ergo-sidechain-bridge | pass | | pending / linked / blocker |
| secret/local path diff scan | no matches | | pending / linked / blocker |
| git status --short | clean/no output | | pending / linked / blocker |

## CI Workflow Evidence

| Requirement | Workflow evidence | Status |
|---|---|---|
| Workflow file is tracked | `.github/workflows/relayer-checks.yml` plus CI run link | pending / linked / blocker |
| Node.js version is pinned | workflow step evidence naming the exact `Node version` | pending / linked / blocker |
| npm cache uses relayer lockfile | workflow step evidence naming relayer `package-lock.json` cache key | pending / linked / blocker |
| Rust wasm target is installed | workflow step evidence naming the exact `Rust target` | pending / linked / blocker |
| wasm-pack version is pinned | workflow step evidence naming the exact `wasm-pack version` | pending / linked / blocker |
| npm ci runs before tests | workflow step evidence proving `npm ci` runs before test/build steps | pending / linked / blocker |
| npm run check runs in CI | workflow step evidence naming `npm run check` | pending / linked / blocker |
| npm run wasm:test runs in CI | workflow step evidence naming `npm run wasm:test` | pending / linked / blocker |
| Final branch commit is identified | branch name and Git commit SHA link or artifact | pending / linked / blocker |

## Reproducibility Decisions

| Decision | Required evidence | Publication impact | Status |
|---|---|---|---|
| Lockfile install is reproducible | `npm ci` log | Public release blocked if not linked | pending / linked / blocker |
| WASM AVL builds from tracked source | `npm run check` and WASM build log | Public release blocked if not linked | pending / linked / blocker |
| TypeScript build is reproducible | `npm run check` log | Public release blocked if not linked | pending / linked / blocker |
| Relayer tests pass | vitest summary | Public release blocked if not linked | pending / linked / blocker |
| Rust WASM tests pass | `npm run wasm:test` log | Public release blocked if not linked | pending / linked / blocker |
| No local runtime state is staged | `git status --short` and ignore scan | Public release blocked if runtime state is staged | pending / linked / blocker |
| No local path or secret marker is staged | secret/local path diff scan | Public release blocked if local path or secret marker is staged | pending / linked / blocker |
| Release gate has zero structural issues | `npm run release:gate` output | Public release blocked unless release gate has 0 structural issues | pending / linked / blocker |

## Publication Decision

| Field | Value |
|---|---|
| Clean checkout CI green | yes / no |
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Release gate structural issues | |
| Release notes updated | yes / no |
| Required release-note updates | |
| Required checklist updates | |
| Reviewer decision summary | |

`Release supported` must not be `none` in completed Gate 1 evidence, and must
not exceed the `Release level` in Run Classification. Clean-checkout evidence
for a lower release level cannot be used to support a higher release decision.
`Production-ready claim allowed` must be `no`: Gate 1 can prove clean checkout
reproducibility, but it cannot authorize production-ready claims even when the
run classification is `production deployment candidate`.
`Testnet production-candidate claim allowed` is the only Gate 1 field that can
support a testnet-scoped production-candidate claim. It may be `yes` only when
`Release supported` is `production deployment candidate`; production deployment
candidate support is blocked unless this field is explicitly `yes`. This field
does not authorize mainnet production-ready claims.
`Release gate structural issues` must be the numeric value `0`; textual
equivalents such as `none`, `no`, or `n/a` do not close Gate 1. Release
checklist and release notes rows close Gate 1 only when they preserve the exact
evidence term `Release gate structural issues = 0`; textual zero-like terms or
numeric shorthand without `= 0` do not close Gate 1 publication-update
evidence.
`Required release-note updates` must link completed Gate 1 release-note update
evidence. `Required checklist updates` must link completed Gate 1 checklist
update evidence. Template links, validator command names, and generic
release-note or checklist artifacts alone are not completed Gate 1
publication-update evidence.
When Gate 1 sets `Production-ready claim allowed = no`, both
publication-update fields must include the exact
`Production-ready claim allowed = no` binding.
The two publication-update fields must use distinct completed Gate 1 evidence
targets; a reused target is treated as incomplete publication evidence by
`npm run ci:validate` and `release:gate`.
These publication-update fields fail closed if they mix a pass-like statement
with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`.
`Reviewer decision summary` must mention release support, clean checkout CI green,
production-ready claim handling, testnet production-candidate claim handling,
and the numeric `release gate structural issues: 0` evidence term. Textual
zero-like summaries such as `none`, `no`, or `resolved` do not close this
reviewer binding. The summary must also match the structured claim fields; a
generic note such as `clean checkout evidence reviewed` or a summary that blocks
testnet production-candidate wording while
`Testnet production-candidate claim allowed = yes` is not enough.
Testnet production-candidate claim handling must use exact
`Testnet production-candidate claim allowed = no` when the publication field is
`no`, or exact `Testnet production-candidate claim allowed = yes` when the
publication field is `yes`.
For production deployment candidate support, the summary must use exact
`Release supported = production deployment candidate`.
When `Release level = production deployment candidate`, the Publication
Decision must use exact `Release supported = production deployment candidate`.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `CI reviewer` sign-off name must match the `Reviewer` value in the Run
Classification table; a different approver cannot close Gate 1 clean-checkout
evidence.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Run Classification `Date`. Gate 1 evidence cannot be closed
with a reviewer approval that predates the run it claims to approve.
Reviewer notes must state a concrete clean-checkout outcome tied to CI,
workflow configuration, `npm ci`, lockfile reproducibility, WASM/wasm-pack,
TypeScript or relayer tests, Rust WASM tests, release-gate structural issues,
`git diff --check`, secret/local path scans, runtime state, worktree status,
final branch commit identity, or reproducibility. Generic notes such as
`reviewed clean checkout evidence` are not enough.
Reviewer notes must also preserve Gate 1 claim and CI boundaries: they must not
approve production-ready or mainnet production wording, failed/red CI, or
non-zero release-gate structural issues.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable clean-checkout outcome with failed validator or command markers,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero `structural
issues`. Claim-boundary wording such as production-ready claims being blocked
remains allowed only when it keeps unsupported claims blocked and does not mask
a failed CI, validator, or command result.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| CI reviewer | | approve / block | | |
| Security reviewer | | approve / block | | |
| Maintainer | | approve / block | | |
