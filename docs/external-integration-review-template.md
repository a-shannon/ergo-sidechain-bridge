# External Integration Review Template

Use this template for Gate 8 external integration package evidence. It checks
whether an exchange-grade or ecosystem engineering team can evaluate the bridge
from the repository without private maintainer context.

This is not a production-ready claim and it is not a security audit.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

## Review Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification fields; each required field must have one
canonical row.

| Field | Value |
|---|---|
| Review name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Reviewer type | maintainer / independent engineer / exchange integration engineer |
| Reviewer organization | |
| Lead reviewer | |
| Environment used | clean checkout / local offline / patched devnet / testnet |
| Broadcast mode | disabled / dry-run |
| Private maintainer context used | yes / no |
| Date | |

`maintainer` reviewer type is allowed only for internal draft review. Gate 8
release evidence passes only with `independent engineer` or
`exchange integration engineer` reviewer type.
The completed evidence must identify a concrete external reviewer organization or affiliation.
Generic placeholders such as `external`, `independent`, `TBD`, or `reviewer organization`
do not satisfy Gate 8.
If `Release level` is `production deployment candidate`, `Environment used`
must be `testnet`; patched-devnet, local-offline, and clean-checkout reviews
can support only lower release classifications.
The `Integration reviewer` sign-off name must match the `Lead reviewer` value
in Review Classification; a different approver cannot close Gate 8 after the
lead reviewer is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Review Classification `Date`. External integration evidence
cannot be closed with a reviewer approval that predates the review
classification.
Gate 8 evidence passes only when `Private maintainer context used` is `no`; any
use of private maintainer context keeps the package review blocked.
Gate 8 evidence passes only when `Broadcast mode` is `disabled` or `dry-run`;
missing or enabled broadcast mode is out of scope for an external integration
package review and cannot close the public integration gate.

## Required Entry Points

Each row must link to a local document and record whether a fresh reviewer could
follow it without private context.

Rows marked `linked` in Required Entry Points, Integration Decision Record, or
Negative Review Checks must use completed integration evidence markers and targets: an
`artifact://...` URI or a non-template evidence link. Template links, bare
validator command names, and bare PASS notes such as
`npm run integration:validate command output: PASS` are resolution targets, not completed integration evidence. Required
Entry Points must include completed entry-point review evidence beyond the
entrypoint document link; linking only the README, roadmap, checklist, or
runbook does not prove a fresh reviewer followed it without private context.
The completed entry-point review evidence must identify entry-point review and
no private maintainer context; a non-concrete artifact marker is not enough.
Row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are treated as
placeholders, not completed external integration evidence.
Validator-target phrases such as `integration validation target`, `external
integration validation target`, `integration validate target`, `validated
target`, or `validated input` bind the validator to its completed review input;
they do not prove entry-point review, fresh-checkout output, integration
decision, negative-review correction, release-note, or checklist row evidence.
Linked entry-point, integration-decision, and negative-review evidence must also
be internally non-contradictory. Evidence may describe expected integration
blockers or corrected misreads, but it still fails closed when it reports a
validator, command, status, result, or outcome failure marker, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.

| Entry point | Required check | Evidence | Status |
|---|---|---|---|
| README | Starts with status, blockers, and safe next steps | [README](../README.md) | pending / linked / blocker |
| Objective | Explains quality bar and publication gates | [Ultimate Bridge Objective](ultimate-bridge-objective.md) | pending / linked / blocker |
| Roadmap | Shows tracks, blockers, and current level | [Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md) | pending / linked / blocker |
| Release checklist | Lists gates and pending evidence | [Institutional Release Checklist](release-checklist.md) | pending / linked / blocker |
| Contract/API reference | Maps contract registers, Var slots, transaction shapes, relayer entrypoints, and integration invariants | [Contract And Relayer API Reference](contract-relayer-api-reference.md) | pending / linked / blocker |
| Integration checklist | Lists configuration decisions and stop conditions | [EVM Sidechain Integration Checklist](evm-integration-checklist.md) | pending / linked / blocker |
| Developer walkthrough | Can be followed from a fresh checkout | [Sidechain on Ergo in One Afternoon](sidechain-on-ergo-in-one-afternoon.md) | pending / linked / blocker |
| Showcase | Explains proof objects, batching, lanes, and finality | [EVM Developer Showcase](evm-developer-showcase.md) | pending / linked / blocker |
| Runbooks | Cover deploy, monitor, pause, recover, rotate, rollback | [Operator Runbooks](operator-runbooks.md) | pending / linked / blocker |

## Fresh Checkout Commands

Run from `ergo-sidechain-bridge/relayer` unless stated otherwise.

```powershell
npm ci
npm run check
npm run wasm:test
npm run showcase
```

If any command is skipped, record it as a blocker or explicitly out of scope for
the release level. Do not infer external readiness from a skipped command.
Completed Gate 8 evidence for these fresh-checkout commands must include an
`artifact://...` marker or a non-template evidence link that targets the
captured command output/log. Text that only says command output was captured,
even with `exit code 0`, is not enough without a concrete evidence target. Each
command row must be `linked`, identify the matching command output, and include
explicit `exit code 0` output; a single shared fresh-checkout artifact is not
enough unless the row evidence also names that command and its zero-exit status.
The success evidence must be internally positive: a row that mentions `PASS`,
`success`, or `exit code 0` while also reporting `FAIL`, `BLOCKED`, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues` is
rejected by `npm run integration:validate`.
Each linked command row must explicitly identify fresh checkout or clean
checkout context; successful command output from an unspecified working copy
does not close Gate 8.
Each linked command row must also identify the fresh checkout Git commit, and
that commit must match the `Git commit` value in Review Classification. A
fresh-checkout transcript from the wrong revision cannot close Gate 8.
For Gate 8 `Checked` rows and testnet production-candidate evaluation, the
Review Classification `Git commit` must also match the final clean-checkout Run
Classification `Git commit` consumed by `release:gate`.

| Command | Evidence | Status |
|---|---|---|
| npm ci | | pending / linked / blocker |
| npm run check | | pending / linked / blocker |
| npm run wasm:test | | pending / linked / blocker |
| npm run showcase | | pending / linked / blocker |

Validate a completed copy before linking it as Gate 8 evidence:

```powershell
cd relayer
npm run integration:validate -- ../evidence/integration/<completed-external-integration-review>.md
```

The blank template is expected to fail validation. Gate 8 evidence passes only
when required entry points, integration decisions, negative review checks, and
reviewer sign-off rows are complete and linked.
For Gate 8 `Checked` rows and testnet production-candidate claim evaluation,
`release:gate` must consume the same completed review target directly and consume the structured
entry-point, fresh-checkout, decision, negative-review, reviewer rows, and
publication-rule update fields returned by `integration:validate`. A PASS
summary, target, classification, and publication decision, or row-named
non-concrete artifact target without those rows and update fields cannot close Gate 8:
`release:gate` also re-checks the structured row payloads. Linked rows must
carry completed entry-point review targets beyond document links, successful
per-command fresh-checkout output with commit identity, decision-specific
evidence, negative-review correction evidence, and actionable reviewer outcome
notes. Linked entry-point, decision, and negative-review row evidence fails
closed on failed validator or command markers and non-zero counters, while
expected integration blockers and corrected misreads belong in the row answer or
correction fields. Required release-note/checklist update fields must carry
completed Gate 8 integration publication-update evidence and must not mix
PASS-like notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues`. Row names and `linked` statuses alone
cannot close Gate 8. Linked entry-point, fresh-checkout, decision, and
negative-review rows must also use distinct completed evidence targets across
row groups; one shared artifact cannot close multiple external integration
facts.

```powershell
npm run release:gate -- --integration-evidence ../evidence/integration/<completed-external-integration-review>.md
```

The Gate 8 checklist row must link the completed external integration evidence
target and a distinct `npm run integration:validate` output target. The
validator output must bind back to the same completed review target with
`integration validation target` or an equivalent validated-target phrase.
That binding is validator provenance only; each structured row still needs its
own completed evidence target outside the validation-target phrase.
`release:gate` consumes the validator's structured Review Classification and
requires `Reviewer organization` to identify a concrete external organization
or affiliation. A PASS wrapper with `external`, `independent`, `TBD`, or an
omitted reviewer organization cannot close Gate 8 or support testnet
production-candidate release evidence.

## Integration Decision Record

The reviewer must be able to answer these without asking maintainers.
Decision answers must state the actual safety boundary listed in the table;
generic answers such as `documented`, `reviewed`, or `see checklist` are not
enough for linked Gate 8 evidence.
The evidence cell must identify the decision category it supports: trust model,
signer path, broadcast enablement, trusted-oracle burn, sidechain commitment,
duplicate-burn rejection, batch boundary, contract/relayer assumptions, scaling
claim blockers, or recovery.
The evidence cell must not use failed validator or command output as completed
decision evidence.

| Decision | Required answer | Evidence | Status |
|---|---|---|---|
| Which trust model applies today? | Single signer / committee / trustless proof path | | pending / linked / blocker |
| Which signer path is allowed? | Local WASM signer; node-wallet signing is not production path | | pending / linked / blocker |
| How is broadcast enabled? | `BRIDGE_BROADCAST_ENABLED=true` only after readiness | | pending / linked / blocker |
| Which path is still trusted-oracle? | Burn interpretation until Phase 011 evidence is linked | | pending / linked / blocker |
| Which sidechain commitment format is expected? | `0x04xx` roadmap and current patched-devnet limit | | pending / linked / blocker |
| How are duplicate burns rejected? | DUP AVL proof and confirmation-time reconciliation | | pending / linked / blocker |
| How are batches bounded? | Claim-core, context-extension, and unlock cap limits | | pending / linked / blocker |
| Which contract and relayer assumptions are stable? | Contract/API reference maps registers, Var slots, transaction shapes, and integration invariants | | pending / linked / blocker |
| What blocks scaling claims? | Missing completed benchmark evidence and live sharded settlement | | pending / linked / blocker |
| How is recovery performed? | Runbooks plus SQLite/AVL restore evidence | | pending / linked / blocker |

## Negative Review Checks

The package is not externally ready if a fresh reviewer can reasonably conclude
any of the following:
Every row must link to the document or artifact that forced the correction.
The correction must state the actual safety boundary. Generic text such as
`corrected by release checklist` is not enough for a linked row.
The mainnet-readiness correction must explicitly state that mainnet
production-ready/readiness claims remain forbidden or out of scope, and that
only testnet production-candidate or production-grade testnet claims can be
evaluated with complete evidence.
The evidence cell must identify the corrected misread category: production
readiness blocker, mainnet-readiness gate, node-wallet signing, explicit
broadcast opt-in, trustless-burn boundary, FROST deferral, sharded-lane
settlement limit, or live benchmark evidence.
Expected blockers or corrections are allowed in the correction column, but the
evidence cell must not use failed validator or command output as completed
negative-review proof.

| Misread | Expected correction | Evidence | Status |
|---|---|---|---|
| The bridge is production-ready today | Blocked by release checklist and pending evidence. | | pending / linked / blocker |
| Testnet or patched-devnet success implies mainnet readiness | Mainnet production-ready/readiness claims remain forbidden/out of scope; only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence. | | pending / linked / blocker |
| Node-wallet signing is acceptable for production | Production path uses local WASM signing and blocks node-wallet signing. | | pending / linked / blocker |
| Broadcast can happen implicitly | Broadcast requires explicit opt-in and readiness review. | | pending / linked / blocker |
| Current burn verification is trustless | Trustless burn verification remains Phase 011 evidence. | | pending / linked / blocker |
| FROST is the current committee implementation | Phase 010a uses `atLeast()`; FROST is deferred to Phase 015. | | pending / linked / blocker |
| Sharded lanes already prove full L1 parallel settlement | SPVTracker remains a shared input until pre-ingest or tracker sharding. | | pending / linked / blocker |
| Offline showcase output is live benchmark evidence | Live lifecycle and benchmark evidence must be linked separately. | | pending / linked / blocker |

## Publication Rules

This table is executable guard input. Do not replace it with prose. Gate 8
passes only when public institutional-reference release handling, production
claim handling, testnet production-candidate claim handling, release notes,
checklist updates, and reviewer decision summary are structured and linked to
completed evidence.

| Field | Value |
|---|---|
| Public institutional-reference release allowed | yes / no |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Private maintainer context used | yes / no |
| Release notes updated | yes / no |
| Required release-note updates | completed Gate 8 integration release-note update evidence: |
| Required checklist updates | completed Gate 8 checklist update evidence: |
| Reviewer decision summary | |

- Production deployment candidate evidence must include the exact field
  `Release supported = production deployment candidate` in both required
  release-note and checklist update targets, and in the reviewer decision
  summary.
- `Reviewer decision summary` must use the exact field
  `Public institutional-reference release allowed = yes`, block
  production-ready claims with exact
  `Production-ready claim allowed = no`, and explicitly bind testnet
  production-candidate wording to the publication field: allow it when
  `Testnet production-candidate claim allowed = yes`, and block it when the
  field is `no`. Prose approval such as
  `public institutional-reference release handling: allowed`, generic approval,
  or a contradictory testnet claim note is not enough.
- Until this review template is completed, Gate 8 remains pending evidence for
  public institutional-reference release.
- Public institutional-reference release allowed must be `yes` before Gate 8
  evidence can pass, and the review classification must be at least
  `institutional reference`.
- Production-ready claim allowed must be `no`: Gate 8 can support public
  institutional-reference release handling, but an external integration review
  cannot authorize production-ready claims even when the review classification
  is `production deployment candidate`.
- `Testnet production-candidate claim allowed` must be `yes` only when the
  review classification is `production deployment candidate` and `Environment
  used` is `testnet`; otherwise it must remain `no`.
- A `production deployment candidate` classification remains testnet-scoped,
  non-production-ready, and broadcast-disabled or dry-run. It does not widen
  Gate 8 beyond public institutional-reference release handling.
- `Private maintainer context used` must match the review classification and
  must be `no`.
- `Release notes updated` must be `yes`; required release-note and checklist
  update rows must include completed evidence markers, not template links or
  bare validator command names.
- Required release-note and checklist update rows must include the exact field
  `Private maintainer context used = no`; prose-only terms such as
  `no private maintainer context`, `without private context`, or `unused`, and
  rows that omit the field, do not close that boundary.
- Required release-note and checklist update rows must include the exact field
  `Public institutional-reference release allowed = yes`; prose-only approval
  terms and update rows that omit the field do not close that boundary.
- Required release-note and checklist update rows must include the exact field
  `Production-ready claim allowed = no` when production-ready claims are
  blocked; prose-only denial terms and update rows that omit the field do not
  close that boundary.
- Required release-note and checklist update rows must include the exact field
  `Testnet production-candidate claim allowed = no` when the publication field
  is `no`, or exact `Testnet production-candidate claim allowed = yes` when the
  publication field is `yes`; prose-only allowed or denied wording does not
  close that boundary.
- Required release-note and checklist update rows must use distinct completed
  Gate 8 integration evidence targets. A combined publication-update artifact
  that carries both markers cannot close both fields.
- Required release-note and checklist update rows must not reuse `integration
  validation target`, `external integration validation target`, `integration
  validate target`, `validated target`, or `validated input` as the completed
  publication-update evidence.
- Do not present the repo as operator-ready for an external team unless the
  reviewer can reproduce the fresh-checkout commands and trace every blocker.
- Do not remove publication blockers from README, release notes, or checklist
  until linked evidence replaces the blocker.
- Any public integration guide must keep trust assumptions, broadcast policy,
  signer limitations, and live lifecycle blockers visible.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
Reviewer notes must state a concrete external-integration outcome tied to the
integration package, fresh checkout, entry points, decision record, negative
review/misread corrections, private maintainer context, release blockers, trust
model, signer path, broadcast policy, trusted-oracle/trustless burn boundary,
FROST, sharded lanes/SPVTracker, benchmark evidence, runbooks, or operator-ready
claims. Generic notes such as `reviewed without private context` are not enough.
Reviewer notes must also keep the same claim boundary as the publication rules:
they cannot approve production-ready wording, mainnet production wording, or any
other broader release claim outside the controlled testnet production-candidate
field.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable external-integration outcome with failed validator or command
markers, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`. Expected blocker or misread-correction wording is
allowed only when it keeps unsupported claims blocked; it cannot mask a failed
integration validator or fresh-checkout command.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Integration reviewer | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
