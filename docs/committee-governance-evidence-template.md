# Committee Governance Evidence Template

Use this template for Gate 6 committee governance and key-rotation drill
evidence. It is a claims-control artifact. This is not proof that production governance is complete.
Gate 6 must keep unqualified or mainnet production-ready claims blocked; testnet
production-candidate support uses its own controlled field.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

## Drill Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA. For testnet
production-candidate support, it must match the final clean-checkout Run
Classification `Git commit`.
Do not duplicate classification or publication rule fields; each required field
must have one canonical row.

| Field | Value |
|---|---|
| Drill name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / patched devnet / testnet / staging |
| Broadcast mode | disabled / dry-run / enabled |
| Governance model | single signer / Phase 010a atLeast multisig / Phase 010b governance |
| Committee threshold | |
| Committee member count | |
| Reviewer | |
| Date | |

`Release level = production deployment candidate` requires `Environment =
testnet`.

For Gate 6 `Checked` rows and testnet production-candidate evaluation,
`release:gate` consumes the structured Drill Classification returned by
`governance:validate`; a narrative PASS or target-only result is not enough. It
requires a 7-40 character Git commit matching the final clean-checkout Run
Classification `Git commit`, `Environment = testnet`,
`Broadcast mode = disabled` or `dry-run`, a governance
model identifying committee or multisig governance, threshold at least 2,
member count at least 3, threshold lower than member count, non-empty
`Reviewer`, and ISO `Date`.

The committee threshold and member count must be positive integers. Gate 6
evidence requires an actual committee with threshold at least 2, member count at least 3,
and threshold lower than member count so the member-loss drill is meaningful.
Gate 6 governance evidence may use broadcast mode `disabled` or `dry-run`.
Missing or enabled broadcast mode is blocked before governance evidence can
pass; live broadcast rehearsals belong in the live lifecycle evidence path.
Linked scope, command, rotation, positive-check, and negative-check rows must use
completed governance evidence markers: an `artifact://...` URI or a
non-template evidence link. Command rows must also include command-specific
output with `PASS exit code 0` or equivalent zero-exit command-output wording
inside the linked artifact or evidence note. A bare `command output: PASS` note
is not completed governance evidence. Template links and bare validator command names
alone are resolution targets, not completed governance evidence. Row-named
non-concrete artifact targets such as `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are also not
completed committee governance evidence.
Linked scope, command, rotation, positive-check, and negative-check rows must
also use distinct completed evidence targets. One shared governance artifact or
log cannot close multiple row-specific checks across those row families.
Required release-note updates and Required checklist updates must also use
distinct completed Gate 6 governance evidence targets. A combined
publication-update artifact that carries both markers cannot close both fields.
Linked scope, rotation, and positive-check row evidence must also be internally
non-contradictory: completed evidence cannot carry `FAIL`, `BLOCKED`, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.
Negative-check rows may describe the expected `rejected`, `blocked`, `refused`,
or `failed` outcome, but they still fail closed when the evidence reports a
validator, command, status, result, or outcome failure marker, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.

## Scope

Record exactly which authority surface is being changed or rehearsed.
The `MainChainLock emergency escape path` target authority must remain
`unchanged` and must not be committee-gated; its current authority must preserve
permissionless-after-timeout semantics only while the source remains
pre-commit and refundable. Once MCL v3 consumes the source into the committed
vault, this escape path no longer exists. It is not a Gate 5 remedy. The
immutable legacy v1 `MCU Phase 2 path` must be recorded as quarantined. The
source replacement requires transitional committee authorization only as P0
containment while Gate 5 / Phase 011 builds cryptographic burn verification.

| Surface | Current authority | Target authority | Evidence | Status |
|---|---|---|---|---|
| SideChainState successor authorization | | | | pending / linked / blocker |
| DUP authorization | | | | pending / linked / blocker |
| Aggregate DUP authorization | | | | pending / linked / blocker |
| Batch DUP authorization | | | | pending / linked / blocker |
| MainChainLock normal path | | | | pending / linked / blocker |
| MainChainLock emergency escape path | permissionless after timeout | unchanged | | pending / linked / blocker |
| SPVTracker ingest authorization | | | | pending / linked / blocker |
| MCU Phase 2 path | legacy v1 permissionless Phase 2 path quarantined | transitional atLeast committee containment pending Gate 5 / Phase 011 | | pending / linked / blocker |

## Required Commands

Run from `ergo-sidechain-bridge/relayer` unless stated otherwise.

```powershell
npm run contracts:check
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

For non-destructive Phase 010a local evaluation, also record whether the
committee guard evaluation script was run and where its output is stored. Do
not paste secret key material from that output.

```powershell
node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts --out ..\evidence\governance\artifacts\<phase010a-committee-guard-evaluation-report.md>
```

The `--out` report records either PASS output or a sanitized BLOCKED result
when the node compiler/header endpoint is unavailable. A BLOCKED report is
operator-facing prerequisite evidence only; it is not completed Gate 6 command
evidence and does not authorize governance-ready claims.

If any command is skipped, record it as a blocker or explicitly out of scope for
the release level.
Each linked command row must identify the checked governance command output. A
single shared governance artifact is not enough unless the row evidence also
names that command or script.
Governance command output evidence must be internally positive: a row that
mentions `PASS`, `passed`, `success`, or `exit code 0` while also reporting
`FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues` is rejected by `npm run governance:validate` and
`release:gate`.

Validate a completed copy before linking it as Gate 6 evidence:

```powershell
cd relayer
npm run governance:validate -- ../evidence/governance/<completed-committee-governance-evidence>.md --report-out ../evidence/governance/artifacts/<committee-governance-validation-report.md>
```

The blank template is expected to fail validation. Gate 6 evidence passes only
when required scope rows, command evidence, rotation plan rows, positive checks,
negative checks, and reviewer sign-off rows are complete and linked.
When `--report-out` is provided, the generated report records the validated
target, PASS/BLOCKED result, issue groups, structural issue examples, and
read-only boundary. It does not authorize public claims, key rotation,
deployment, governance mutation, or transaction broadcast.
For testnet production-candidate claim evaluation, `release:gate` must consume
the same completed evidence target directly and consume the structured scope,
command, rotation, positive, negative, reviewer rows, and publication-decision
update fields returned by
`governance:validate`. A PASS summary, target, classification, and publication
decision without those rows cannot close Gate 6. `release:gate` also re-checks
the structured row payloads: completed governance scope evidence, command-
specific output evidence, step-specific rotation evidence, disjoint old/new
public key or hash identifiers, threshold-specific positive signer evidence
from the declared new committee, bounded positive expected-result text,
fail-closed negative expected-result text, rejected-signer identifiers for
signer negative checks, completed Gate 6 governance release-note/checklist update evidence,
actionable stop conditions, and actionable reviewer notes. Row names and
`linked` statuses alone cannot close Gate 6. The same completed validator
input is required before marking the Gate 6 committee governance row as
`Checked`:

```powershell
npm run release:gate -- --governance-evidence ../evidence/governance/<completed-committee-governance-evidence>.md
```

The Gate 6 checklist row must link the completed committee governance evidence
target and a distinct `npm run governance:validate` output target. The validator
output must bind back to the same completed evidence target with
`governance validation target` or an equivalent validated-target phrase.
That binding is validator provenance only: row evidence for scope, command,
rotation, positive, negative, release-note, or checklist fields must link
completed governance artifacts separately, not reuse `governance validation
target`, `committee governance validation target`, `governance validate target`,
`validated target`, or `validated input` text as the evidence itself.

| Command | Evidence | Status |
|---|---|---|
| npm run contracts:check | | pending / linked / blocker |
| npm run check | | pending / linked / blocker |
| npm run wasm:test | | pending / linked / blocker |
| npm run demo:readiness | | pending / linked / blocker |
| npm run status | | pending / linked / blocker |
| spike010a-committee-guard-eval.ts | | pending / linked / blocker |

## Rotation Plan

The `Required evidence` cell must name the step-specific governance fact being
checked. Generic notes such as `reviewed` or `tested` are not enough for
public-key identity, threshold policy, member-loss, contract compilation,
signer behavior, singleton continuity, deployment-state reconciliation, or
rollback evidence.
Key-identity rows must include concrete public key or hash identifiers, never
private material: at least one old-authority identifier and at least the
declared committee member count for the new committee.
The new committee identifiers must be disjoint from the old committee
identifiers; a reused old-authority public key or hash does not prove rotation.
The `Stop condition` cell must be actionable. It must tell the operator to
stop, block, fail, pause, rollback, open an incident, refuse, halt, disable, or
escalate when the condition is hit; generic notes such as `reviewed later` are
not enough.
The `Compile affected contracts` row must cite `npm run contracts:check` or
concrete contract compilation output. Placeholder-only validation text does
not prove affected contracts were checked.
The `Reconcile deployment state` row must link a sanitized reconciliation
packet, not a raw deployment-state file or private dump. The packet must name
the network name or chain id, sidechain id, SCS NFT id, singleton box ids or
hashes, governance contract hashes, old and new committee public key or hash
identifiers, and the command evidence target used for the check. Validate the
sanitized packet with
`npm run governance:reconcile:validate -- --reconciliation-json <packet.json> --out <report.md> --json-out <report.json>`.
For local shape checks only, `npm run governance:reconcile:local-packets`
can generate sanitized public sample packets before an operator-provided
non-mainnet deployment-state reconciliation target exists. Those packets do not
replace operator reconciliation evidence and cannot close Gate 6.
After both the sanitized reconciliation report and wrong-network negative
report are linked, `npm run governance:reconcile:handoff` can compose them into
an operator handoff packet for these two rows. The handoff remains a
prerequisite binder; it does not replace completed committee governance
evidence, reviewer sign-off, or Gate 6 closure.

| Step | Required evidence | Status | Stop condition |
|---|---|---|---|
| Identify old committee public keys | Old committee public keys or hashes only; no private material | pending / linked / blocker | Stop if unknown signer still controls funds |
| Identify new committee public keys | New committee public keys or hashes only; no private material | pending / linked / blocker | Stop if threshold cannot be independently checked |
| Validate threshold policy | `m/n` threshold, quorum rationale, lost-key tolerance | pending / linked / blocker | Stop if threshold is weaker than approved policy |
| Simulate member loss or lost-key tolerance | Member-loss drill or threshold safety artifact | pending / linked / blocker | Stop if committee cannot operate after expected member loss |
| Compile affected contracts | `npm run contracts:check` output | pending / linked / blocker | Stop if placeholder injection or compile fails |
| Evaluate old and new signer behavior | Positive and negative old/new signer behavior evidence | pending / linked / blocker | Stop if old signer still mutates signer-gated state |
| Preserve singleton continuity | NFT, script, value, and register checks | pending / linked / blocker | Stop if singleton NFT is lost, duplicated, or stale |
| Reconcile deployment state | Reviewed deployment-state diff or migration notes | pending / linked / blocker | Stop if network or singleton identity mismatch remains |
| Verify rollback plan | Previous authority and state recovery path | pending / linked / blocker | Stop if rollback would require unreviewed SQLite edits |

## Positive Checks

A governance/key-rotation drill must prove that the new committee can operate
the signer-gated path before it relies on negative checks. Rows marked `linked`
must use accepted, approved, passed, validated, verified, or succeeded expected
results. The evidence cell must identify the new committee signer-gated mutation
and the member-loss or lost-key threshold/quorum path that still executes a
signer-gated mutation. Each linked positive-check row must include at least the
committee-threshold number of concrete public key/hash identifiers for the
signers that executed the successful operation. Positive checks must include
declared new-committee positive signer identifiers from the `Identify new committee public keys` row,
so non-committee keys cannot satisfy the threshold.

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| New committee executes signer-gated mutation after rotation | accepted | | pending / linked / blocker |
| Threshold member-loss tolerance still executes signer-gated mutation | validated | | pending / linked / blocker |

## Negative Checks

A governance/key-rotation drill is incomplete unless these cases are checked:
Rows marked `linked` must use fail-closed expected results: `rejected`,
`blocked`, `refused`, or `failed`. Generic wording such as `reviewed` is not
enough for signer, threshold, singleton, broadcast, or network negative checks.
The evidence cell must identify the rejected governance fact: old signer,
non-committee signer, below-policy threshold, stale SCS NFT, MCL emergency
escape gating, broadcast readiness, or deployment-state network mismatch.
Old-signer and non-committee-signer negative rows must include a concrete public
key or hash identifier for the rejected signer.
Expected rejection wording is allowed in these rows, but validation or command
failure markers are not completed negative-check proof.
The `Deployment state points to the wrong network` row must link sanitized
negative evidence that names the deployment-state target, expected network,
observed mismatched network, and the stop condition. Do not include raw private
deployment-state content, local paths, keys, `.env` values, runtime DB rows, or
material that enables signing, key rotation, deploy, submit, state mutation, or
broadcast. Validate the sanitized wrong-network packet with
`npm run governance:reconcile:validate -- --reconciliation-json <wrong-network-packet.json> --out <report.md> --json-out <report.json>`.

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Old single signer attempts signer-gated mutation after rotation | rejected | | pending / linked / blocker |
| Non-committee signer attempts signer-gated mutation | rejected | | pending / linked / blocker |
| Committee threshold below policy | rejected by review before deployment | | pending / linked / blocker |
| MCU references stale SCS NFT after SCS redeploy | blocked before release | | pending / linked / blocker |
| MCL emergency escape path is accidentally committee-gated | blocked before release | | pending / linked / blocker |
| Broadcast is enabled before readiness review | blocked by operator procedure | | pending / linked / blocker |
| Deployment state points to the wrong network | blocked by operator procedure | | pending / linked / blocker |

## Publication Rules

- Until this template is completed with linked evidence, committee governance and key rotation remain open blockers for production-ready claims.
- Gate 6 must not authorize unqualified or mainnet production-ready claims.
- Gate 6 emergency authority applies only to a pre-commit refundable MCL source;
  it cannot authorize minting, repair a post-mint reorg, or close Gate 5.
- Phase 010a `atLeast()` evaluation is not the same as Phase 010b governance.
- Do not claim FROST is active; FROST remains deferred to Phase 015 unless a
  later release links completed implementation evidence.
- Do not claim a committee can operate without a single signing secret until a
  tested rotation/member-loss drill is linked.
- Public release notes must copy unresolved governance/key-rotation blockers
  from [Institutional Release Checklist](release-checklist.md).

Gate 6 governance evidence also requires structured publication-rule fields:
`Release notes updated` must be `yes`, open governance blockers must use the
exact numeric `Open governance blockers = 0` value, and `Production-ready claim
allowed` must be `no`. Textual equivalents such as `none` do not close Gate 6
committee governance. When `Open governance blockers = 0`, both
publication-update fields and `External review evidence` must include exact
numeric `Open governance blockers = 0`; textual zero-like terms such as
`none`, `no`, `zero`, or `resolved`, and numeric shorthand without `= 0`, are
not accepted.
When `Governance-ready claim allowed = yes`, both publication-update fields
must use exact `Governance-ready claim allowed = yes`; prose-only terms such as
`allowed`, `approved`, or `supported` do not close that boundary.
When `Production-ready claim allowed = no`, both publication-update fields and
`External review evidence` must also use exact
`Production-ready claim allowed = no`; omission alone does not close that
boundary.
When `Release supported = production deployment candidate`, both
publication-update fields and `External review evidence` must also use exact
`Release supported = production deployment candidate`. When
`Testnet production-candidate claim allowed = yes`, both publication-update
fields and `External review evidence` must also use exact
`Testnet production-candidate claim allowed = yes`.
`Required release-note updates` must link completed Gate 6 governance release-note update evidence; `Required checklist updates` must link completed Gate 6 governance checklist update evidence; `External review evidence` must link completed Gate 6 governance external review evidence and include exact `Governance-ready claim allowed = yes` when that claim is allowed, plus exact `Production-ready claim allowed = no` when production-ready claims are blocked. The two publication-update fields must use distinct completed targets; one combined artifact cannot close both fields.
Production deployment candidate support requires `Testnet production-candidate claim allowed = yes`
and `Production-ready claim allowed = no`. `Release supported = production
deployment candidate` also requires `Environment = testnet` in Drill
Classification and is only allowed as a testnet production-candidate claim.
That testnet claim field must be `no` unless `Release supported` is
`production deployment candidate`. It never authorizes setting the
production-ready claim field to `yes`.
Template links and validator command names alone are not completed publication
evidence.
Validator-target phrases such as `governance validation target`, `committee
governance validation target`, `governance validate target`, `validated target`,
or `validated input` bind the validator to its input; they do not prove
completed Gate 6 release-note or checklist update evidence.
Generic release-note or checklist artifacts do not prove Gate 6 governance
publication updates unless they identify the completed Gate 6 evidence kind.
Publication-update fields are fail-closed when they mix pass-like validation or
command notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues`.
`Reviewer decision summary` must include release support,
governance-ready claim handling, production-ready claim handling,
testnet production-candidate claim handling, and open governance blocker
handling. It must close blockers by stating
`open governance blocker handling: Open governance blockers = 0`; textual
zero-like summaries such as `none`, `no`, or `resolved`, and numeric shorthand without exact `Open governance blockers = 0`,
do not close this reviewer binding. A generic note such as `governance release
blockers resolved` is not enough. If the publication rules allow production
deployment candidate support, this summary must use exact
`Release supported = production deployment candidate`.
Testnet production-candidate claim handling must use exact
`Testnet production-candidate claim allowed = no` when the publication field is
`no`, or exact `Testnet production-candidate claim allowed = yes` when the
publication field is `yes`, rather than prose-only approval, blocking, or
contradictory wording.
When `Release level = production deployment candidate`, the Publication Rules
must use exact `Release supported = production deployment candidate`.

| Field | Value |
|---|---|
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Governance-ready claim allowed | yes / no |
| Open governance blockers | |
| Release notes updated | yes / no |
| Required release-note updates | |
| Required checklist updates | |
| External review evidence | |
| Reviewer decision summary | |

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Governance owner` sign-off name must match the `Reviewer` value in the
Drill Classification table; a different approver cannot close Gate 6 after the
governance owner is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Drill Classification `Date`. Committee governance evidence
cannot be closed with a reviewer approval that predates the drill
classification.
Reviewer notes must state a concrete governance-readiness outcome tied to
governance, rotation, committee threshold, member-loss, signer behavior,
negative checks, singleton continuity, deployment-state reconciliation,
rollback, broadcast controls, or Gate 6 review. Generic notes such as
`reviewed governance drill` are not enough.
Reviewer notes must also keep the same governance and claim boundary as the
publication rules: they cannot approve production-ready wording,
mainnet-scoped release wording, open governance blockers, or single-signer
fallback governance.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable governance-readiness outcome with failed validator or command
markers, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`. Expected stop/blocker wording is allowed only
when it keeps unsupported claims blocked; it cannot mask a failed governance
validator or command.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Governance owner | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
