# Performance Benchmark Evidence Template

Use this template for Gate 7 benchmark evidence. It is a claims-control
artifact, not a production throughput claim.

Do not paste `.env` contents, seed phrases, signing secret material, local user
paths, SQLite files, diagnostic dumps, or private deployment state.

## Benchmark Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification or publication decision fields; each required
field must have one canonical row.

| Field | Value |
|---|---|
| Benchmark name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / patched devnet / testnet / staging |
| Broadcast mode | disabled / dry-run / enabled |
| Trust path | transitional trusted burn path / trustless burn proof path |
| Machine profile | |
| Node version | |
| Rust version | |
| wasm-pack version | |
| Reviewer | |
| Date | |

Testnet-scoped production-candidate support requires `Environment = testnet`.
`Release level = production deployment candidate` requires `Environment =
testnet` and `Trust path = trustless burn proof path`; transitional trusted
burn path benchmark evidence cannot support that release level.
For release-gate claim evaluation, linked `Live batch settlement` evidence must
use classified `Broadcast mode` value `enabled`, and the live-batch metric row must
carry the explicit approval and broadcast-boundary evidence listed below.
Non-live benchmark claims must remain scoped to their measured non-broadcast
evidence.

Machine profile and toolchain fields must identify the benchmark runner and
versions used for the run. Benchmark metrics without this reproducibility
metadata cannot support scaling claims.

## Required Commands

Run from `ergo-sidechain-bridge/relayer` unless stated otherwise.

| Command | Expected result | Evidence | Status |
|---|---|---|---|
| npm run showcase:benchmark | PASS / exit code 0 | | pending |
| npm run showcase:lanes | PASS / exit code 0 | | pending |
| npm run showcase:proofs | PASS / exit code 0 | | pending |
| npm run showcase:finality | PASS / exit code 0 | | pending |
| npm run check | PASS / exit code 0 | | pending |
| npm run wasm:test | PASS / exit code 0 | | pending |

If any command is skipped, record it as a blocker or explicitly out of scope for
the release level. Do not infer throughput, latency, or scaling claims from a
skipped command.

Assemble a current offline benchmark candidate after collecting local benchmark
command-output evidence:

```powershell
cd relayer
npm run benchmark:offline-candidate -- --current --metric-rows ../evidence/benchmarks/artifacts/<completed-current-offline-metric-rows>.md --out ../evidence/benchmarks/<gate7-offline-structured-candidate>.md
```

`--current` fills the Git commit, UTC date, Node version, Rust version,
wasm-pack version, and artifact suffix from the local checkout and toolchain.
It does not query nodes, read runtime databases, read deployment state, sign,
submit, deploy, publish, or broadcast transactions. The generated candidate
keeps live batch settlement, publication closure, and reviewer approvals
blocked until real evidence exists.

Validate a completed copy before linking it as Gate 7 evidence:

```powershell
cd relayer
npm run benchmark:validate -- ../evidence/benchmarks/<completed-benchmark-evidence>.md --report-out ../evidence/benchmarks/artifacts/<benchmark-validation-report.md>
```

Use `--report-out` when recording validator provenance for Gate 7. The report
records a PASS or BLOCKED validator result and grouped missing-evidence counts;
it is validation provenance only and does not authorize public claims,
publication, deployment, or transaction broadcast.

The blank template is expected to fail validation. Gate 7 evidence passes only
when required command rows, metric rows, sharded-lane statements, bottlenecks,
reviewer sign-off rows, the claims boundary, and the structured publication decision
are complete and linked.
Before a top-level testnet production-candidate claim, run
`release:gate -- --benchmark-evidence <completed-benchmark-evidence.md>` so the
release gate reads the actual completed benchmark evidence. The Gate 7
checklist row must link completed benchmark evidence plus a distinct
`npm run benchmark:validate` output artifact that names the same benchmark validation target.
Any Gate 7 benchmark row marked `Checked` requires that actual
`--benchmark-evidence` input, even if the overall release gate remains blocked.
The release gate consumes the structured Benchmark Classification, command,
metric, sharded-lane, bottleneck, claims-boundary, reviewer rows, and
publication-decision update fields returned by `benchmark:validate`; a PASS
summary, target, classification, and publication decision without those rows,
the claims-boundary arrays, and update fields cannot close Gate 7. The required command rows, metric rows, sharded-lane statements, bottlenecks, and reviewer
sign-off rows must stay complete and linked. Gate 7 also checks that linked
command rows carry command-specific completed benchmark output evidence, metric rows carry scenario-specific completed benchmark evidence and positive
measurements, sharded-lane rows carry statement-specific completed evidence,
bottleneck rows carry bottleneck-specific completed evidence with impact and
next action, and reviewer notes state concrete benchmark outcomes. Generic row
payloads such as `PASS`, `reviewed`, or `approved` remain blocked.
Linked metric, sharded-lane, and bottleneck rows must also use distinct
completed evidence targets. One shared benchmark artifact or log cannot close
multiple row-specific measurements, lane statements, or bottleneck checks.
Required release-note updates and Required checklist updates must also use
distinct completed Gate 7 benchmark evidence targets. A combined
publication-update artifact that carries both markers cannot close both fields.
Those linked row evidence cells are fail-closed: a completed target cannot
close Gate 7 when the same metric, sharded-lane, or bottleneck evidence cell
also reports `FAIL`, `BLOCKED`, `ERROR`, a non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues`.
For the required `Live batch settlement` metric row, `benchmark:validate` and
`release:gate` also re-check that the structured row is compatible with the classification:
`Broadcast mode = enabled`, a completed live-batch evidence target, submit,
confirmation, and transaction identity evidence, user explicit live broadcast
approval bound to the Expected transaction ID, scoped
`BRIDGE_BROADCAST_ENABLED=true` evidence, post-enable `npm run demo:readiness`
PASS evidence, Broadcast policy PASS evidence, Live settlement signing PASS
evidence, and broadcast network reconfirmation evidence. These live-readiness
PASS facts must be internally positive: a stale PASS with nearby `FAIL`,
`BLOCKED`, `ERROR`, a non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` before or after the PASS marker does not satisfy the
validator or release gate. The benchmark row's submitted transaction identity
must match its Expected transaction ID; when `release:gate` also receives the
actual `--live-preflight-json` and `--post-submit-observe-json` reports, the
same transaction identity must match those structured lifecycle JSON validations.
The live batch operator handoff must collect three distinct packet groups:
live-batch transaction identity and reconciliation evidence; live-readiness
evidence binding user explicit live broadcast approval, scoped
`BRIDGE_BROADCAST_ENABLED=true`, readiness, policy, signing, and network
reconfirmation outputs; and metric-boundary evidence with positive units for
throughput, latency, build time, proof size, transaction size, inputs, outputs,
context-extension Vars, and batch size. Those packets must not approve
production throughput or mainnet-grade benchmark claims.
Linked metric rows must include positive numeric measurements with units, a
sample count of at least 3, and scenario-specific evidence that identifies the
measured single-claim settlement baseline, batch settlement, sharded lanes planner,
or live batch settlement row. This sample count of at least 3 requirement is
enforced before any Gate 7 scaling claim can pass. The
`Live batch settlement` row can be linked only
when the classification uses a live-capable environment and broadcast mode is
`enabled`. It must also cite user explicit live broadcast approval evidence
bound to the Expected transaction ID, scoped `BRIDGE_BROADCAST_ENABLED=true` evidence,
post-enable `npm run demo:readiness` PASS evidence, Broadcast policy
PASS evidence, Live settlement signing PASS evidence, and broadcast network
reconfirmation evidence. The readiness, policy, and signing PASS snippets must
not carry contradictory failure markers in the same evidence excerpt.
Linked sharded-lane rows and bottleneck current-evidence rows must link a real
completed evidence target, either an `artifact://...` URI or a
non-template Markdown evidence link. `Live batch settlement` must link live
submit, confirmation, transaction identity or reconciliation evidence, or
`npm run e2e:aggregate` evidence captured in a linked artifact; offline showcase output
is not enough for that row. The linked evidence must include at
least one concrete 32-byte
transaction ID or reconciliation digest. The validator also requires the Claims
Boundary to preserve the allowed and not-allowed claim lists; deleting a
blocked scaling, trustless, or mainnet claim is a structural failure.
Linked metric rows, sharded-lane rows, and bottleneck current-evidence rows must
use completed benchmark evidence markers and targets: an `artifact://...` URI or a
non-template evidence link. Template links, bare validator command names, and
targetless command-output notes such as
`npm run benchmark:validate command output: PASS` are not completed benchmark evidence.
`benchmark validation target`, `benchmark validate target`, `validated target`,
and `validated input` bindings identify validator provenance only; they cannot
close metric, sharded-lane, bottleneck, live-batch, release-note, or checklist
evidence rows.
Row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are also not
completed benchmark evidence.
For Gate 7 `Checked` rows and testnet production-candidate evaluation,
`release:gate` also requires the structured Benchmark Classification to expose
a 7-40 character Git commit matching the final clean-checkout Run
Classification `Git commit`, `Environment = testnet`,
`Trust path = trustless burn proof path`,
reproducible machine/toolchain metadata, non-empty `Reviewer`, ISO `Date`, and
Benchmark owner sign-off matching that reviewer without predating that date.

## Metric Table

| Scenario | Evidence command or log | Sample count | Build time | Proof size | Transaction size | Cost-relevant counts | Throughput | Latency | Status |
|---|---|---|---|---|---|---|---|---|---|
| Single-claim settlement baseline | | | | | | | | | pending / linked / blocker |
| Batch settlement | | | | | | | | | pending / linked / blocker |
| Sharded lanes planner | | | | | | | | | pending / linked / blocker |
| Live batch settlement | | | | | | | | | pending / linked / blocker |

Required metric definitions:

- Build time: local proof or transaction build time, with machine class noted.
- Sample count: number of completed measurements included in the reported row;
  linked rows must include at least 3 samples.
- Proof size: AVL/SPV/DUP proof byte counts used by the settlement path.
- Transaction size: serialized Ergo transaction size when available; otherwise
  mark as pending.
- Cost-relevant counts: inputs, outputs, context-extension Vars, batch size,
  and JIT/eval cost when available.
  Linked metric rows must include exactly one positive numeric `inputs=`,
  `outputs=`, `vars=`, and `batch=` count before scaling claims can use the
  row; duplicate or conflicting count keys are blockers.
- Throughput: settlements per Ergo block or per minute, with the finality model
  stated.
- Latency: time from burn observation to settlement confirmation, separated
  into queueing, anchor, submit, confirmation, and reconciliation.
  Positive numeric values and units are required for linked metric rows;
  narrative placeholders such as `scoped only` or zero-valued measurements do
  not satisfy the validator.

## Sharded Lane Evidence

Record whether the run proves each statement:
Rows marked `linked` must include a reproducible command inside a non-template
evidence link or `artifact://...` marker in the `Required evidence` cell. Mention
the reproducible command inside that linked evidence or next to the target; do
not close a row with only pasted PASS/output text.
The `Required evidence` cell must also identify the sharded-lane claim it
closes: lane-local DUP inputs, lane-local liquidity inputs, shared SPVTracker
input, full-parallel L1 claim boundary, or tracker-overlap mitigation.
It must not mix a completed evidence target with contradictory failure markers
such as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`.

| Statement | Required evidence | Status |
|---|---|---|
| DUP inputs are lane-local | `npm run showcase:lanes` output or linked test log | pending / linked / blocker |
| Liquidity inputs are lane-local | `npm run showcase:lanes` output or linked test log | pending / linked / blocker |
| SPVTracker remains a shared input today | `showcase:lanes` overlap report | pending / linked / blocker |
| Full parallel L1 settlement is not claimed | Reviewer check against release notes | pending / linked / blocker |
| Tracker overlap mitigation is identified | pre-ingest, tracker sharding, or sequenced tracker update | pending / linked / blocker |

## Bottleneck Register

Every `Current evidence` cell must include a command inside a non-template
evidence link or `artifact://...` marker before Gate 7 evidence can pass. A
command-output note without a target is operator context, not completed evidence.
The same cell must remain internally positive; completed bottleneck evidence is
blocked if it also reports `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues`.
Each `Impact` or `Required next action` cell must name the concrete scaling
limit being tracked; generic entries such as `scoped impact` or `keep blocker
visible` are not enough.

| Bottleneck | Current evidence | Impact | Required next action |
|---|---|---|---|
| ContextExtension var count | | | |
| Batch unlock claim-core size | | | |
| DUP insert proof size | | | |
| SPV tracker contention | | | |
| Liquidity lane fragmentation | | | |
| Ergo transaction size limit | | | |
| Node mempool or signing readiness | | | |

## Claims Boundary

`benchmark:validate` exposes this section as structured allowed and blocked
claim arrays. `release:gate -- --benchmark-evidence` requires those arrays to
contain every required allowed and blocked claim before Gate 7 can support
testnet production-candidate evaluation.

Allowed only with linked evidence:

- Single-claim settlement remains the correctness baseline.
- Batch settlement amortizes DUP and unlock work for the measured batch size.
- Sharded lanes demonstrate lane-local DUP and liquidity planning.
- Subblock-aware UX separates fast inclusion from ordering-block finality.

Not allowed until separately proven:

- Production throughput.
- Base-level or exchange-scale throughput.
- Full parallel L1 settlement while SPVTracker remains a shared input.
- Trustless burn verification while the transitional trusted burn path is in
  use.
- Mainnet cost, latency, or capacity claims without mainnet-grade evidence.

## Publication Decision

Gate 7 benchmark evidence must keep scaling claims bounded by the measured
evidence. `Release notes updated` must be `yes`, open benchmark blockers must be
the exact numeric `Open benchmark blockers = 0` value, and `Required
release-note updates` must link completed Gate 7 benchmark release-note update evidence.
Textual equivalents such as `none` do not close Gate 7 benchmark evidence.
Publication-update fields that mention benchmark blocker closure must use exact
numeric `Open benchmark blockers = 0`; textual zero-like terms such as `none`,
`no`, `zero`, `closed`, `resolved`, or `mitigated`, and numeric shorthand
without `= 0`, are not accepted.
When `Release supported = production deployment candidate`, both
publication-update fields must include exact
`Release supported = production deployment candidate`; prose-only support terms
do not close that boundary.
When `Scaling claims allowed = yes`, both publication-update fields must include
exact `Scaling claims allowed = yes`; prose-only terms such as `allowed`,
`approved`, or `supported` do not close that boundary.
When `Production-ready claim allowed = no`, both publication-update fields must
include exact `Production-ready claim allowed = no`; merely omitting
production-ready wording does not close that boundary.
When `Testnet production-candidate claim allowed = yes`, both
publication-update fields must include exact
`Testnet production-candidate claim allowed = yes`; prose-only testnet-candidate
terms do not close that boundary.
When `Production throughput claim allowed = no`, both publication-update fields
must include exact `Production throughput claim allowed = no`; prose-only terms
such as `blocked`, `forbidden`, or `not allowed` do not close that boundary.
When `Mainnet-grade evidence linked = no`, both publication-update fields must
include exact `Mainnet-grade evidence linked = no`; merely omitting
mainnet-grade wording does not close that boundary.
`Required checklist updates` must link completed Gate 7 benchmark checklist update evidence. Those two publication-update fields must use distinct completed targets; one combined artifact cannot close both fields. Publication-update fields are fail-closed when they mix pass-like validation or command notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`. `Release supported = production deployment candidate` requires `Environment = testnet` and `Trust path = trustless burn proof path` in Benchmark Classification and the separate `Testnet production-candidate claim allowed = yes`. Production-ready benchmark claims for mainnet are forbidden, and production throughput claims remain blocked for Gate 7 evidence.
`Reviewer decision summary` must include release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, production throughput claim handling, and open benchmark blocker handling; a generic note such as `benchmark scaling claims bounded` is not enough. For production deployment candidate benchmark support, it must use exact `Release supported = production deployment candidate`. It must close blockers by stating `open benchmark blocker handling: Open benchmark blockers = 0`; textual equivalents such as `none`, `no`, `closed`, `resolved`, or `mitigated`, and numeric shorthand without exact `Open benchmark blockers = 0`, do not close Gate 7 benchmark evidence. Testnet production-candidate claim handling must use exact `Testnet production-candidate claim allowed = no` when the publication field is `no`, or exact `Testnet production-candidate claim allowed = yes` when the publication field is `yes`, rather than prose-only approval, blocking, or contradictory wording. If `Production throughput claim allowed = no`, the summary must explicitly block production throughput claims rather than leaving them implicit.
For the current institutional-reference boundary, the publication decision facts
must be explicit: `Scaling claims allowed = yes`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = no`,
`Production throughput claim allowed = no`,
`Mainnet-grade evidence linked = no`, `Open benchmark blockers = 0`, and
`Release notes updated = yes`. Do not flip any production-ready claim to `yes`.
Do not flip production throughput or mainnet-grade evidence fields to `yes` in
Gate 7 evidence; future mainnet-grade support needs separate evidence and a
separate release decision outside this benchmark gate.
When `Release level = production deployment candidate`, the Publication
Decision must use exact `Release supported = production deployment candidate`.

| Field | Value |
|---|---|
| Release supported | none / validated PoC / institutional reference / production deployment candidate |
| Scaling claims allowed | yes / no |
| Production-ready claim allowed | yes / no |
| Testnet production-candidate claim allowed | yes / no |
| Production throughput claim allowed | yes / no |
| Mainnet-grade evidence linked | yes / no |
| Open benchmark blockers | |
| Release notes updated | yes / no |
| Required release-note updates | |
| Required checklist updates | |
| Reviewer decision summary | |

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Benchmark owner` sign-off name must match the `Reviewer` value in the
Benchmark Classification table; a different approver cannot close Gate 7 after
the benchmark owner is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Benchmark Classification `Date`. Benchmark evidence cannot
be closed with a reviewer approval that predates the benchmark classification.
Reviewer notes must state a concrete benchmark outcome tied to metrics,
numeric measurements and units, throughput, latency, proof size, transaction
size, cost-relevant counts, sharded lanes, bottlenecks, scaling limits,
ContextExtension, DUP, SPVTracker, liquidity, mempool/signing readiness, live
batch settlement, or the claims boundary. Generic notes such as
`scoped evidence reviewed` or `benchmark evidence accepted` are not enough.
Reviewer notes must also keep the same claim boundary as the publication rules:
they cannot approve production-ready wording, mainnet production
wording, production throughput wording, or any broader scaling claim outside the
controlled testnet production-candidate field.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable benchmark outcome with failed validator or command markers, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.
Blocking publication claim wording, for example `production throughput claim
handling remains blocked`, is allowed; reporting a failed benchmark validator or
command in the same approval note is not.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Benchmark owner | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
