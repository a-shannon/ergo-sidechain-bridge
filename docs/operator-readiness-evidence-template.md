# Operator Readiness Evidence Template

Use this template for Gate 6 operator readiness evidence. It is for completed
evidence only: do not replace the tables with narrative prose.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

Validate a completed copy before linking it as Gate 6 evidence:

```powershell
cd relayer
npm run operator:validate -- ../evidence/operators/<completed-operator-readiness-evidence>.md
```

For testnet production-candidate release evaluation, `release:gate` must also
consume the same completed evidence target:

```powershell
cd relayer
npm run release:gate -- --operator-readiness-evidence ../evidence/operators/<completed-operator-readiness-evidence>.md
```

The Gate 6 operator row must link the completed operator readiness evidence and
a distinct `npm run operator:validate` output target that names the same
operator readiness validation target.

The blank template is expected to fail validation. Operator readiness evidence
passes only when every runbook, required command, recovery drill, operational
decision, publication decision, and reviewer sign-off is structured and linked.
`release:gate -- --operator-readiness-evidence ...` consumes the structured
runbook, command, drill, decision, reviewer rows, and publication-decision
update fields returned by
`operator:validate`; a PASS summary, target, classification, and publication
decision without those rows cannot close Gate 6. The same completed validator
input is required before marking the Gate 6 operator readiness row as
`Checked`.
`release:gate` also re-checks the row payloads: linked runbook rows must carry
completed runbook evidence plus stop-condition and verification-command checks;
linked command rows must expose bounded command purpose text and identify the
matching command output; linked drill rows must include actionable recovery
outcomes; linked decision rows must carry decision-specific evidence and
actionable stop conditions; and reviewer rows must keep the Runbook operator
identity and actionable operator-readiness notes.
Rows marked `linked` must include completed runbook, command, drill, or decision
evidence through a non-template evidence link or an `artifact://...` marker
where the section requires a target. Linked command rows must also include
command-specific output with `PASS exit code 0` or equivalent zero-exit
command-output wording. Template links and validator command names alone are resolution targets, not completed evidence. Row-named
non-concrete artifact targets such as `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are also not
completed operator readiness evidence.
Linked runbook, command, drill, and decision rows must also use distinct
completed evidence targets. One shared operator artifact or log cannot close
multiple row-specific checks across those row families.
Linked runbook, drill, and operational-decision row evidence must also be
internally non-contradictory. Evidence may describe an expected operator stop,
block, refusal, recovery, incident, or escalation outcome, but it still fails
closed when it reports a validator, command, status, result, or outcome failure
marker, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`.
Standalone `validated target`, `validated input`, `operator validate target`,
or `operator readiness validation target` links bind the validator input and
output provenance only; they cannot close runbook, command, drill, decision,
release-note, or checklist evidence rows by themselves.
Targetless command-output notes such as
`npm run operator:validate command output: PASS` are operator context, not
completed runbook, drill, or decision evidence.
Required release-note and checklist updates must link completed
operator-readiness publication-update evidence; template links and validator
command names alone are not completed Gate 6 operator evidence. Those
publication-update fields must use distinct completed operator-readiness
evidence targets; one combined artifact cannot close both fields. They also
fail closed when they mix pass-like validation or command notes with `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues`.

## Readiness Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA. For testnet
production-candidate support, it must match the final clean-checkout Run
Classification `Git commit`.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Readiness name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / clean checkout / patched devnet / testnet / staging |
| Broadcast mode | disabled / dry-run |
| Operator type | maintainer / external operator / exchange operations reviewer |
| Reviewer | |
| Date | |

`Release level = production deployment candidate` requires `Environment =
testnet`.
Missing or enabled broadcast mode is blocked before Gate 6 operator readiness
evidence can pass.
`release:gate -- --operator-readiness-evidence <completed-operator-readiness-evidence.md>`
consumes this structured Readiness Classification. Testnet
production-candidate support and Gate 6 `Checked` rows require a 7-40 character
`Git commit` matching the final clean-checkout Run Classification `Git commit`,
`Environment = testnet`, `Broadcast mode` of `disabled` or `dry-run`,
`Operator type = external operator` or `exchange operations reviewer`,
non-empty `Reviewer`, ISO `Date`, and matching Runbook operator sign-off that
does not predate the classification date.

## Runbook Coverage

Every row must link evidence that an operator followed the runbook, hit no stop
condition, and captured the required verification commands.
Rows marked `linked` must state both the stop-condition checks and the
verification-command checks performed by the operator in the evidence cell
itself, not only in the `Required check` column.
The evidence cell must identify the covered runbook: dry-run readiness,
deployment/migration, broadcast enablement, daemon startup, settlement failure
triage, reorg recovery, pause/resume, key rotation, storage-rent/liquidity
maintenance, incident response, monitoring/alerting, or SQLite/AVL backup
restore.
Linked evidence must not pair the completed runbook target with failed
validator or command output.

| Runbook | Required check | Evidence | Status |
|---|---|---|---|
| Dry-run readiness | | | pending / linked / blocker |
| Deployment and migration | | | pending / linked / blocker |
| Broadcast enablement | | | pending / linked / blocker |
| Daemon startup | | | pending / linked / blocker |
| Settlement failure triage | | | pending / linked / blocker |
| Reorg recovery | | | pending / linked / blocker |
| Pause and resume | | | pending / linked / blocker |
| Key rotation | | | pending / linked / blocker |
| Storage-rent and liquidity maintenance | | | pending / linked / blocker |
| Incident response | | | pending / linked / blocker |
| Monitoring and alerting | | | pending / linked / blocker |
| SQLite and AVL backup restore | | | pending / linked / blocker |

## Required Commands

The `Purpose` cell is structured evidence. It must describe the bounded operator
reason for the command, not release approval or broadcast authorization. Do not
use mainnet, production-ready, release/publication approval, broadcast approval,
broadcast enabled, or `BRIDGE_BROADCAST_ENABLED=true` wording in this column.
Rows marked `linked` must include a non-template evidence link or an
`artifact://...` marker for the completed command output.
Each command row must identify the matching command output; a single shared
operator command artifact is not enough unless the row evidence also names that
command.
Targetless command-output text such as `npm run check command output: PASS`
does not close a Required Commands row. A linked command row must include an
`artifact://...` target or a non-template markdown link to the completed command
evidence.
Operator command output evidence must be internally positive: a row that
mentions `PASS`, `passed`, `success`, or `exit code 0` while also reporting
`FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues` is rejected by `npm run operator:validate` and
`release:gate`.

| Command | Purpose | Evidence | Status |
|---|---|---|---|
| npm run status | operator status snapshot / service health | | pending / linked / blocker |
| npm run demo:readiness | dry-run readiness / signing / broadcast-policy check | | pending / linked / blocker |
| npm run release:gate | release-gate blocked-with-zero-structural-issues check | | pending / linked / blocker |
| npm run backup:validate | SQLite/AVL backup restore validation | | pending / linked / blocker |
| npm run governance:validate | committee governance / key-rotation validation | | pending / linked / blocker |
| npm run check | build, typecheck, and test verification | | pending / linked / blocker |
| npm run wasm:test | WASM/Rust AVL proof test verification | | pending / linked / blocker |
| git status --short | Git hygiene / worktree status / runtime artifact check | | pending / linked / blocker |

## Incident And Recovery Drills

Rows marked `linked` must state an actionable recovery outcome. Use explicit
operator outcomes such as stop, block, fail, disable, pause, incident, recover,
reconcile, restore, confirm, or escalate; generic review notes are not enough.
Those expected outcomes are allowed in the outcome column, but the evidence
cell must not use failed validator or command output as completed drill proof.

| Drill | Expected outcome | Evidence | Status |
|---|---|---|---|
| Broadcast disabled by default | | | pending / linked / blocker |
| Daemon refuses unsafe live settlement | | | pending / linked / blocker |
| Failed settlement triage | | | pending / linked / blocker |
| Reorg recovery | | | pending / linked / blocker |
| Pause and resume | | | pending / linked / blocker |
| SQLite and AVL backup restore | | | pending / linked / blocker |
| Storage-rent and liquidity alert | | | pending / linked / blocker |
| Incident response record | | | pending / linked / blocker |
| Key rotation and member loss | | | pending / linked / blocker |

## Operational Decisions

Rows marked `linked` must include an actionable stop condition. Use explicit
operator verbs such as stop, block, fail, disable, pause, incident, do not, or
refuse; narrative acceptance notes are not enough.
The required evidence cell must identify the decision category it supports:
runbook discovery, executable stop conditions, monitoring signals, incident
escalation, backup restore evidence, governance rotation evidence, or broadcast
opt-in evidence.
The required evidence cell must remain free of failed validator or command
markers, non-zero counters, and non-zero structural issue counts.

| Decision | Required evidence | Stop condition | Status |
|---|---|---|---|
| External operator can find every runbook | | | pending / linked / blocker |
| Stop conditions are executable | | | pending / linked / blocker |
| Monitoring signals are actionable | | | pending / linked / blocker |
| Incident escalation is actionable | | | pending / linked / blocker |
| Backup restore evidence is linked | | | pending / linked / blocker |
| Governance rotation evidence is linked | | | pending / linked / blocker |
| Broadcast enablement remains opt-in | | | pending / linked / blocker |

## Publication Decision

| Field | Value |
|---|---|
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Operator-ready claim allowed | yes / no |
| Critical incidents open | |
| Release notes updated | yes / no |
| Required release-note updates | |
| Required checklist updates | |
| Reviewer decision summary | |

`Release supported` must not be `none` in completed operator-readiness
evidence, and must not exceed the `Release level` in Readiness Classification.
Operator-readiness evidence for a lower release level cannot be used to support
a higher release decision.

Publication remains blocked unless all operator-readiness gates pass.
Mainnet production-ready claims are forbidden and `Production-ready claim
allowed` must remain `no` even for a production deployment candidate.
Operator-ready claims require linked evidence, the exact numeric
`Critical incidents open = 0` value, and updated release notes; textual
equivalents such as `none` or numeric shorthand without `= 0` do not close
Gate 6 operator readiness.
Production deployment candidate support requires `Operator-ready claim allowed = yes`
and the separate `Testnet production-candidate claim allowed = yes`. It also
requires `Environment = testnet` in Readiness Classification;
evidence that does not allow the operator-ready claim cannot support that release level.
When `Release level = production deployment candidate`, the Publication
Decision must use exact `Release supported = production deployment candidate`.
`Required release-note updates` must link completed operator-readiness release-note update evidence.
`Required checklist updates` must link completed operator-readiness checklist update evidence.
When `Release supported = production deployment candidate`, both
publication-update fields must include exact
`Release supported = production deployment candidate`. When
`Operator-ready claim allowed = yes`, both publication-update fields must
include exact `Operator-ready claim allowed = yes`. When
`Production-ready claim allowed = no`, both publication-update fields must
include exact `Production-ready claim allowed = no`. When
`Testnet production-candidate claim allowed = yes`, both publication-update
fields must include exact `Testnet production-candidate claim allowed = yes`.
Those two fields must use distinct completed operator-readiness evidence targets; one combined publication-update target cannot close both fields.
Publication-update fields that mention critical incident closure must use the
exact numeric `Critical incidents open = 0`; textual zero-like terms such as
`none`, `no`, `zero`, `closed`, `resolved`, or `mitigated`, and numeric
shorthand without `= 0`, are not accepted.
Template links and validator command names alone are not completed operator-readiness publication-update evidence.
Links that appear only as `validated target`, `validated input`, `operator validate target`,
or `operator readiness validation target` are validator provenance, not
completed publication-update evidence.
These publication-update fields must stay internally non-contradictory; a
completed artifact marker paired with `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` remains
blocked.
`Reviewer decision summary` must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents; a generic approval note is not enough to bound Gate 6 operator claims. For production deployment candidate support, this summary must use exact `Release supported = production deployment candidate`. Critical incident closure in this summary must use the exact numeric `Critical incidents open = 0`; textual equivalents such as `none`, `no`, `closed`, `resolved`, or `mitigated`, and numeric shorthand without `= 0`, do not close the reviewer decision. Testnet production-candidate claim handling must use exact `Testnet production-candidate claim allowed = no` when the publication field is `no`, or exact `Testnet production-candidate claim allowed = yes` when the publication field is `yes`, rather than prose-only approval, blocking, or contradictory wording.

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Runbook operator` sign-off name must match the `Reviewer` value in the
Readiness Classification table; a different approver cannot close Gate 6
operator-readiness evidence after the runbook operator is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Readiness Classification `Date`. Operator-readiness evidence
cannot be closed with a reviewer approval that predates the readiness
classification.
Reviewer notes must state a concrete operator-readiness outcome tied to one of
the required Operational Decisions or to a specific stop condition.
Generic notes such as `reviewed` or `evidence accepted` are not enough.
Reviewer notes must also preserve the operator and claim boundary: they must not
approve production-ready wording, mainnet-scoped release wording, open critical
incidents, or non-opt-in broadcast enablement.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable operator-readiness outcome with failed validator or command markers,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`. Expected stop/blocker wording is allowed only when it
keeps unsupported claims or incidents blocked; it cannot mask a failed operator
readiness validator or command.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Runbook operator | | approve / block | | |
| Security reviewer | | approve / block | | |
| Release owner | | approve / block | | |
