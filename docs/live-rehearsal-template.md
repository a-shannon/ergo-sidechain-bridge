# Live Rehearsal Evidence Template

Use this template for every local-devnet, staging, or testnet bridge rehearsal.
It is an evidence-capture format, not a claim of production readiness.
A fresh checkpoint is mandatory for marking the Fresh Ergo testnet lifecycle row
`Checked` / `pass`, but checkpoint presence alone is not sufficient. Gate 3
requires an activated external-fee settlement profile, its separately versioned
live-preflight, submit, confirmation, reconciliation, validation PASS, and
no-claim publication evidence.

The current legacy V1 relayer cannot produce that lifecycle: its new signing,
authorization, submission, and broadcast surfaces are physically absent. Keep
Gate 3 pending until a reviewed replacement profile has on-chain authority,
external-fee conservation, replay-lineage binding, and exact target-node
acceptance. Historical evidence cannot be promoted into that authority.

Do not paste `.env` contents, seed phrases, signing secret material, API
secrets, local user paths, or raw diagnostic files. Redact account identifiers unless the exact
identifier is required to verify public chain state.

## Rehearsal Assembly Evidence

For `Fresh testnet lifecycle | pass`, this section must prove the completed
rehearsal was assembled from the approved external-fee live-preflight and
post-submit fragments. Its Expected transaction ID must match the Dry-Run
Settlement Evidence Expected transaction ID.

- Assembly status:
- Draft source target:
- Live-preflight source target:
- Live-preflight artifact:
- Live-preflight Expected transaction ID:
- Post-submit fragment:
- Post-submit source target:
- Fresh checkpoint:
- Fresh checkpoint source target:
- Fresh checkpoint lifecycle status:
- Fresh checkpoint Expected transaction ID:
- Fresh checkpoint deployed-state hash:
- Fresh checkpoint singleton freshness:
- Fresh checkpoint boundary:
- Post-submit observe output-shape evidence:
- Post-submit observe output shape cites submitted transaction ID:
- Post-submit observe output shape binds OUTPUTS(0) SPV tracker successor:
- Post-submit observe output shape binds OUTPUTS(1) aggregate DUP successor:
- Post-submit observe output shape binds OUTPUTS(2+i) recipient payouts in burn order:
- Post-submit observe output shape binds final canonical miner fee output:
- Post-submit observe settlementOutputs.outputCount:
- Post-submit observe settlementOutputs.boxIds:
- Recovery row fragments:
- Failed-broadcast source target:
- Reorg-recovery source target:
- Offline assembly scope:

`Live-preflight artifact`, `/transactions/check` result, and daemon approval
check evidence must carry internally positive PASS evidence. A copied PASS
excerpt that also reports `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues` is rejected by
`npm run rehearsal:validate`.

## Session Metadata

Date fields must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Rehearsal evidence can only pass when broadcast mode starts and ends
`disabled`. A deliberate live broadcast window belongs in the Broadcast
Enablement Evidence section, not in the final session state.

- Date:
- Operator:
- Reviewer:
- Environment: local devnet / staging / testnet
- Git commit:
- Release level being evaluated: validated PoC / institutional reference /
  production deployment candidate
- Ergo node network:
- Sidechain network:
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Settlement profile ID:
- Profile activation status:
- Evidence purpose:
- Activation evidence target:
- Activation ID:

Historical evidence may omit these five profile fields or bind
`legacy-aggregate-v1`, `QUARANTINED`, `historical-diagnostics`, and `none` for
both activation fields. It remains parseable provenance but cannot close either
Gate 3 lifecycle row. Gate 3 closure requires the separately versioned
`authenticated-external-fee-v1` profile, `ACTIVATED`,
`gate3-lifecycle-closure`, and an exact activation evidence target and
recomputed activation ID consumed by `release:gate`. These labels are claim
bindings only; they do not replace target-node acceptance, on-chain funds
authority, legacy-route retirement, or cross-profile replay-lineage evidence.

`production deployment candidate` may be used only when `Environment: testnet`.
Local-devnet and staging rehearsals must use `validated PoC` or
`institutional reference` and cannot be cited as production-deployment-candidate
scope evidence.

## Lifecycle Gate Classification

Complete this table before adding any narrative notes. Narrative notes are supplementary only.
A rehearsal cannot satisfy Gate 3 unless every applicable row below has a
status, an evidence artifact, and a blocking note when the status is not
`pass`.
Do not duplicate lifecycle rows; each release gate must have one canonical
status row.
Lifecycle status dependencies are enforced. `Fresh local devnet lifecycle` or
`Fresh testnet lifecycle` can be `pass` only when peg-in, peg-out burn, anchor,
settlement check, settlement submit, confirmation, and reconciliation rows also
pass. Settlement check requires peg-out burn and anchor evidence; settlement
submit requires settlement check; confirmation requires submit; reconciliation
requires confirmation.
`Fresh local devnet lifecycle` can be `pass` only when Session Metadata uses
`Environment: local devnet` and Preflight Evidence links clean deployment
state evidence that names a concrete 32-byte deployment-state hash or digest,
concrete 32-byte contract ID, and concrete 32-byte singleton inventory identifier.
`Fresh testnet lifecycle` can be `pass` only when Preflight Evidence links
clean deployment state evidence that names a concrete 32-byte deployment-state
hash or digest, concrete 32-byte contract ID, and concrete 32-byte singleton inventory identifier.
It also requires `Environment: testnet` and
`Ergo node network` to positively identify testnet in Session Metadata.
`Sidechain network` must identify `patched-devnet`, `testnet`, or an
explicit non-mainnet sidechain network.
Sidechain network values must not contain `mainnet`, `main network`,
`main chain`, `mainchain`, or negated testnet wording.
Negated or mixed network wording such as `not testnet`, `not a testnet`,
`not on testnet`, `not on the testnet`, `not using testnet`,
`not connected to testnet`, `no testnet`, `without testnet`, `without the
testnet`, `mainnet`, `main network`, `main chain`, or `mainchain` cannot close
Fresh testnet lifecycle evidence.
Blocking notes for `fail`, `inconclusive`, `publication blocker`, or
`not applicable` rows must explain the blocker, failure, pending evidence,
mismatch, incident, scope, or deferred environment. Required next evidence for
non-passing rows must state the rerun, capture, link, validation, runbook,
incident, confirmation, reconciliation, or restore action. Generic notes such as `reviewed`, `later`, or `see checklist` are not enough.

Allowed status values: pass / fail / inconclusive / not applicable /
publication blocker.

Evidence artifacts must be completed durable targets: an `artifact://...` URI
or a non-template evidence link. Targetless command-output text, template links,
and bare validator command names alone are resolution targets, not completed
evidence. Narrative text is not enough to satisfy the validator. Row-named
`generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `fixture-*`, `mock-*`,
`dummy-*`, `fake-*`, `stub-*`, `testdata-*`, `sample-evidence-*`, or
`example-evidence-*` artifact targets are placeholders even when the path
mirrors the lifecycle row name.
`rehearsal validation target`, `rehearsal validate target`,
`validated target`, and `validated input` links identify validator provenance
only. A passing lifecycle row must cite separate completed row evidence before
any `npm run rehearsal:validate` command output or validation-target binding.
Rows marked `pass` must also be internally positive: the evidence artifact
cannot pair completed or PASS wording with `FAIL`, `BLOCKED`, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.
Each evidence artifact must identify the lifecycle row it closes: local devnet,
testnet, peg-in, peg-out burn, anchor, settlement check, settlement submit,
confirmation, reconciliation, failed-broadcast/phantom-AVL,
reorged-burn/stale-singleton, or backup-restore/reconstructibility evidence.
`Fresh testnet lifecycle` evidence artifacts must cite `Ergo node network
testnet`, positively identify testnet, and must not contain negated or mixed
network wording such as `not testnet`, `not a testnet`, `not on testnet`,
`not on the testnet`, `not using testnet`, `not connected to testnet`, `no
testnet`, `without testnet`, `without the testnet`, `mainnet`, `main network`,
`main chain`, or `mainchain`.
When `Fresh testnet lifecycle` is `pass`, its evidence artifact must also cite
the peg-in event ID or TX ID, peg-out burn TX ID, sidechain block hash, bridge
event root, Expected transaction ID, and submitted transaction ID from the same
rehearsal run. `Peg-in evidence` must cite the peg-in event ID or TX ID,
`Peg-out burn evidence` must cite the peg-out burn TX ID, `Anchor evidence`
must cite the sidechain block hash, bridge event root, and Ergo anchor height,
and `Settlement check evidence` must cite the expected transaction ID from the
dry-run section.
Composite lifecycle rows must preserve every sub-proof in their evidence
artifact. `Failed broadcast / phantom AVL evidence` must cite failed broadcast
handling, phantom-AVL prevention, that no phantom DUP/AVL history was inserted,
failed-broadcast evidence cites Expected transaction ID, failed-broadcast evidence cites peg-out burn TX ID, and structured recovery observation PASS
evidence with an observation artifact validated by
`npm run rehearsal:recovery-observe:validate` and
`recovery-observe JSON validation PASS` bound to the same observation artifact.
The observation JSON `message` must be an internally positive PASS result; stale
or mixed PASS text beside `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues` does not satisfy validation.
The recovery drill evidence, validation, and observation artifacts must be
completed distinct targets; row-named non-concrete targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`,
`fake-*`, `stub-*`, `testdata-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders, not completed recovery drill evidence.
The completed observation JSON target must appear in the observation evidence
itself, such as the `--json-out` target or completed observation artifact; a
validator target alone is not sufficient.
The structured observation JSON must include `sourceBindings` for a
`live-read-only-node` source and a read-only state-tracker source, with runtime
database paths explicitly not serialized. `release:gate -- --recovery-observe-json`
reads the same structured JSON directly and requires the observation boundary,
source bindings, `pegOutBurnTxId`, and failed-broadcast `expectedTxId`.
`Reorged burn / stale singleton evidence` must cite reorged-burn and
stale-singleton detection plus recovery or recoverability evidence,
reorged-burn evidence cites peg-out burn TX ID,
stale-singleton evidence cites singleton inventory identifier, and structured recovery observation PASS
evidence with an observation artifact validated by
`npm run rehearsal:recovery-observe:validate` and
`recovery-observe JSON validation PASS` bound to the same observation artifact;
the observation JSON `message` must be internally positive and fail closed on
contradictory failure or non-zero issue markers;
the completed observation JSON target must appear in the observation evidence
itself, not only as the validator target;
the same `sourceBindings` and no-runtime-path serialization requirements apply;
`release:gate -- --recovery-observe-json` also requires the reorg/stale-singleton
`singletonInventoryId` from that structured JSON;
and
`Backup-restore or reconstructibility evidence` must cite a completed Backup
Restore Evidence Template copy validated with `npm run backup:validate`.

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
| Fresh local devnet lifecycle | | | | |
| Fresh testnet lifecycle | | | | |
| Peg-in evidence | | | | |
| Peg-out burn evidence | | | | |
| Anchor evidence | | | | |
| Settlement check evidence | | | | |
| Settlement submit evidence | | | | |
| Confirmation evidence | | | | |
| Reconciliation evidence | | | | |
| Failed broadcast / phantom AVL evidence | | | | |
| Reorged burn / stale singleton evidence | | | | |
| Backup-restore or reconstructibility evidence | | | | |

Validate a completed copy before linking it as Gate 3 evidence:

```bash
cd relayer
npm run rehearsal:validate -- --transcript artifact://live-rehearsal/rehearsal-validate.log --assembly-report-json ../evidence/live-rehearsals/<assembly-report.json> --live-preflight-json ../evidence/live-rehearsals/<external-fee-live-preflight.json> --post-submit-observe-json ../evidence/live-rehearsals/<post-submit-observe.json> --fresh-checkpoint-json ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --recovery-observe-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json> --report-out ../evidence/rehearsal/artifacts/<rehearsal-validation-report.md> ../evidence/live-rehearsals/<completed-live-rehearsal.md>
```

The `--report-out` target records the validated target, PASS/BLOCKED result,
issue groups, example blockers, and read-only/no-claim boundary. A BLOCKED
report is prerequisite evidence only; it does not close Gate 3, authorize live
submit, deployment, broadcast, publication, or public claims.

Bind the completed local and testnet rehearsal copies to the release gate before
using them for Gate 3 or testnet production-candidate release evidence:

```bash
cd relayer
npm run release:gate -- --local-live-rehearsal-evidence ../evidence/live-rehearsals/<completed-local-live-rehearsal.md> --live-rehearsal-evidence ../evidence/live-rehearsals/<completed-testnet-live-rehearsal.md> --local-settlement-profile-activation-json ../evidence/activation/<completed-local-settlement-profile-activation.json> --settlement-profile-activation-json ../evidence/activation/<completed-testnet-settlement-profile-activation.json> --assembly-report-json ../evidence/live-rehearsals/<assembly-report.json> --live-preflight-json ../evidence/live-rehearsals/<external-fee-live-preflight.json> --fresh-checkpoint-json ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --post-submit-observe-json ../evidence/live-rehearsals/<post-submit-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json>
```

The release gate must read the completed local live rehearsal Markdown through
`--local-live-rehearsal-evidence`, match that target to the Fresh local devnet
lifecycle row, and see structured validator rows with
`Fresh local devnet lifecycle` status `pass`. It also consumes the validator's
structured Session Metadata, Publication Evidence, and Reviewer Sign-Off fields;
`status: PASS` plus lifecycle rows alone is not sufficient. For testnet production-candidate evidence it must
also read the completed testnet live rehearsal Markdown through
`--live-rehearsal-evidence`, match that target to the Fresh Ergo testnet
lifecycle row, and see a `Fresh testnet lifecycle` row with status `pass`.
Each settlement-profile activation report names four separate repository JSON
artifacts: target-node acceptance, funds-authority transition, legacy-route
retirement, and cross-profile replay lineage. The release-gate CLI reads and
role-validates those structured producer outputs, recomputes their evidence
IDs and the enclosing activation ID, and requires their profile, environment,
network identities, and Git commit to match both the rehearsal and the clean
checkout candidate whose own validation passes. Reviewer approval cannot
predate the activation report. Labels, booleans, or a recomputable PASS wrapper
alone are not activation evidence.

The registered authority evidence roles and producer IDs are:

- `targetNodeAcceptance` / `e2s.gate3-target-node-acceptance.v1`: exact
  profile transaction accepted, target node accepted, no submission performed,
  and this evidence does not grant funds authority. It binds the unsigned
  transaction ID, node response digest/version, exact `/transactions/check`
  endpoint and height, and contract-profile digest.
- `fundsAuthorityTransition` / `e2s.gate3-funds-authority-transition.v1`:
  mint and payout authority transitioned, with legacy mint and payout
  authorities disabled. It binds the activation transaction and block IDs,
  activated contract-profile digest, and exact mint and payout authority
  identity digests.
- `legacyRouteRetirement` / `e2s.gate3-legacy-route-retirement.v1`: daemon,
  CLI, programmatic, and legacy on-chain funds routes retired. It binds the
  retirement registry, legacy route inventory, replacement profile digest,
  and retired-route count.
- `crossProfileReplayLineage` /
  `e2s.gate3-cross-profile-replay-lineage.v1`: every funded legacy profile
  covered, replay set imported or frozen, old replay routes frozen, and
  cross-profile duplicate rejected. It binds source and activated replay
  digests, the lineage manifest, replacement profile digest, and covered burn
  count. All four roles must agree on one replacement contract-profile digest.

Passing rows must carry gate-specific completed evidence artifacts; a generic
completed artifact, row-named non-concrete artifact target, checklist note, one passing row, or bare
`rehearsal:validate PASS` string is not enough. A passing lifecycle row is also
rejected when its evidence artifact mixes completed/PASS wording with
`FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`.
For local live rehearsal evidence, structured Session Metadata must identify
`Environment: local devnet` and positive local non-mainnet networks. For testnet live rehearsal evidence, it must
identify `Environment: testnet`, positive Ergo testnet scope, and an allowed
patched-devnet, testnet, or explicit non-mainnet sidechain scope. In both
cases broadcast start/end fields must be `disabled`, Reviewer Sign-Off must be
`pass` with no open blockers or follow-up items, and Publication Evidence must
keep production-ready and testnet production-candidate claim fields `no`.
Archived legacy V1 offline-gate, aggregate-prebroadcast, rehearsal-preflight,
testnet-window-prep, and prep-bundle JSON reports may be retained as historical
provenance. They are ignored by `release:gate` and cannot close Gate 3,
authorize broadcast, or substitute for an activated external-fee profile and
completed live lifecycle evidence.

For claim-bearing testnet release evidence, record both the completed live rehearsal target
and a distinct `rehearsal:validate` transcript artifact containing
`npm run rehearsal:validate` PASS output. The transcript must include a
validator output artifact before the `validated target` binding, the
`validated target` binding to the completed rehearsal copy, confirmation policy
met PASS, `confirmationsRequired=<n>`, `confirmationsObserved=<n>`, observed
confirmation count greater than or equal to required confirmation count,
submitted transaction ID, and completed finality evidence. The
validation output artifact must be distinct from the completed live rehearsal target.
When the completed copy includes future activated external-fee live-preflight,
post-submit observation, fresh-checkpoint, assembly, or recovery-drill evidence,
the validator command must supply the corresponding structured JSON targets
with `--live-preflight-json`, `--post-submit-observe-json`,
`--fresh-checkpoint-json`, `--assembly-report-json`, and repeated
`--recovery-observe-json` inputs. Each supplied target must be concrete,
completed, non-template evidence. `--live-preflight-json` is the canonical
post-submit join key: the validator checks the observation binding and approved
burn hashes against the supplied external-fee preflight report.
The current `rehearsal:live-preflight` command is a legacy V1 quarantine
diagnostic. It may reconstruct and compare historical approval/check evidence,
but it always reports `BLOCKED` with this exact settlement binding:

- `Settlement profile ID = legacy-aggregate-v1`
- `Profile activation status = QUARANTINED`
- `Evidence purpose = historical-diagnostics`
- `Activation evidence target = none`

It exposes no signing, submission, broadcast, or Gate 3 authority. Run it only
from a neutral shell where `BRIDGE_BROADCAST_ENABLED` is false or unset:

```bash
cd relayer
npm run rehearsal:live-preflight -- --rehearsal ../evidence/live-rehearsals/<historical-rehearsal>.md --approvals ../evidence/testnet-prebroadcast/<historical-aggregate-approvals-v2>.json --transcript artifact://live-rehearsal/legacy-v1-live-preflight.log
```

No live testnet submit window is authorized by the current command. Gate 3 must
reject its JSON report and any copied legacy `GO` or `PASS` transcript.

A future `rehearsal:external-fee-live-preflight` command and separately
versioned JSON validator must be implemented before this section can carry
positive Gate 3 evidence. That future report must bind
`authenticated-external-fee-v1`, `ACTIVATED`,
`gate3-lifecycle-closure`, the exact completed activation evidence target, the
same Expected transaction ID and burn set, external miner-fee funding,
application-bound source finality, global DUP cutover lineage, legacy-route
retirement, and exact target-node acceptance. A profile label or textual PASS
line cannot substitute for those authorities. The current
`release:gate -- --live-preflight-json` path remains fail-closed for the legacy
schema until the replacement producer and validator exist.

The blank template is expected to fail validation. Only a completed rehearsal
copy with allowed statuses, evidence artifacts, and blocking notes for
non-passing rows can be linked as release evidence. The validator also requires
completed session metadata, named operational evidence fields, and reviewer
sign-off before the rehearsal can count as structured Gate 3 evidence.
For a testnet dry-run captured before explicit broadcast approval, use the
[Testnet Pre-Broadcast Dry-Run Evidence Template](testnet-prebroadcast-dry-run-evidence-template.md)
as the preparation artifact. The live rehearsal should reference the validated
pre-broadcast package and a distinct `prebroadcast:doctor` transcript/report.
Archived legacy V1 `rehearsal:preflight` and
`rehearsal:testnet-window-prep` reports may be attached as non-authoritative
provenance only. A historical window-prep packet should cite
the same Expected transaction ID, ordered burn set, positive testnet/non-mainnet
network scope, current heights, broadcast-disabled state, and matching current
`deployed_state.json` hash. Its current heights must be greater than or equal
to the prebroadcast package Ergo anchor and sidechain block heights, so stale
node state cannot prepare a live testnet window. The JSON report must carry
`targetBindings`, `networkScope`, `heightBoundary`, and an all-false
`gateBoundary`, including no broadcast authorization, no submit, no
confirmation, no reconciliation, no Gate 3 closure, and no production-ready or
testnet production-candidate claim authorization. That packet is not an input substitute for
the future activated external-fee live-preflight; the live rehearsal still needs the required
Session Metadata, Preflight Evidence, Dry-Run Settlement Evidence, Broadcast
Enablement Evidence, submit, confirmation, and reconciliation sections. Keep
`Fresh testnet lifecycle`, `Settlement submit evidence`, `Confirmation
evidence`, and `Reconciliation evidence` as `publication blocker`; that package
is not valid as `Fresh testnet lifecycle | pass` evidence.
Archived legacy V1 `rehearsal:offline-gate`,
`rehearsal:prep-bundle`, `rehearsal:preflight`, and
`rehearsal:testnet-window-prep` commands remain available only for exact
historical-package reconstruction. Their reports must remain non-broadcast and
may be reviewed as provenance, but they are ignored by `release:gate` and are
not valid as `Fresh testnet lifecycle | pass` evidence. A future executable
live-preflight must use the separately versioned external-fee settlement profile
and bind its activation, target-node acceptance, funds-authority transition,
legacy-route retirement, and cross-profile replay lineage.
vectors must match the aggregate claim order. `rehearsal:validate` and
`release:gate` both validate these same reports against the prep-bundle artifact
targets and offline-gate input bindings. A `PASS` object that only cites a
target is not enough.
Operators may also run `npm run rehearsal:fresh-testnet-check` against a
completed aggregate `/transactions/check` JSON report to produce a fresh testnet
non-broadcast checkpoint. That checkpoint must keep `Fresh testnet lifecycle` as
`publication blocker`; it is not valid as lifecycle `pass` evidence and cannot
replace live submit, confirmation, reconciliation, or the future activated
external-fee live-preflight.
Use `--auto-heights` when the operator wants the command to capture the current
Ergo `/info` height and sidechain `getBlockNumber` height read-only. The command
must refuse `BRIDGE_BROADCAST_ENABLED=true`. If explicit height arguments are
used instead, the command must also be given
`--height-evidence <height-evidence.json>`; that JSON target must be concrete,
non-template, non-runtime, and non-secret material, and its observed heights
must match `--current-ergo-height` and `--current-sidechain-height`. If the
operator supplies `--singleton-checkpoint <singleton-checkpoint.json>`, the
command also requires `--current-deployed-state-hash <64hex>` and does not read
local `deployed_state.json`; otherwise live singleton collection reads the local
deployment state to know the singleton set. When the command collects live
singleton observations, it uses an `ErgoClient` read-only/no-auth node client
without an `api_key` header and only reads `/info`, singleton boxes,
mempool/unconfirmed transactions, and confirmed transaction lookup for the
Expected transaction ID. The singleton checkpoint JSON must bind to the declared
deployed-state hash, include `observedAt` as an ISO UTC timestamp
for the read-only node observation, prove the Expected transaction ID is absent
from both mempool and confirmed chain, and that observation must be no older than 15 minutes.
Fresh Ergo testnet lifecycle evidence must also include a read-only observation
of extension fields `0x04` and `0x0401` at each aggregate `ergoAnchorHeight`,
with `bridgeEventRootHex` present. The structured checkpoint report must include
explicit `sourceBindings` provenance for height evidence, singleton
observations, and anchor observations; height source bindings must identify
live read-only `/info` plus `getBlockNumber` collection or a concrete provided
JSON target, singleton source bindings must identify the live read-only node
collection or a concrete provided JSON target, and anchor source bindings must
identify `live-read-only-node` before the checkpoint can be created. Live
source-binding `operations` lists must stay observational: signing, submission,
broadcast, state mutation, repair, and reconciliation markers are contradictory
even when the report also says `CREATED` or `PASS`.
Provided height-evidence and singleton-checkpoint JSON targets named
`template-*`, `example-*`, `sample-*`, `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`, or `testdata-*`
are placeholders, not fresh checkpoint source provenance.
Do not run a live submit from the current repository. The retained
`rehearsal:live-preflight` command emits only a blocked legacy V1 diagnostic,
and `release:gate` rejects that schema for Gate 3 consumption.

After a separate external-fee producer and validator are implemented, the
future `rehearsal:external-fee-live-preflight` report must include the activated
settlement-profile binding, `runtimeBroadcastEnabled: false`, concrete
`targetBindings`, an all-false `preSubmitBoundary`, and a structured burn and
transaction identity binding. It must reject any rehearsal that already marks
`Fresh testnet lifecycle`, `Settlement submit evidence`, `Confirmation
evidence`, or `Reconciliation evidence` as `pass`, or that grants a production
or testnet-production-candidate claim before the complete lifecycle closes.
Do not duplicate required list fields in metadata, operational evidence, or
reviewer sign-off sections; repeated keys make the evidence ambiguous and fail
validation.
Critical outcome fields must use exact, non-ambiguous values: `yes` for
confirmed safety checks, `pass`/`PASS` for transaction/readiness checks,
`confirmed` or `settled` for reconciliation status, and `yes`/`no` for manual
repair and regression-update decisions.
Chain-state identifiers in dry-run, submit/confirmation, reconciliation, and
rollback sections must link to durable evidence targets. Raw text such as `txid`,
`box id`, or `not needed` is not enough for a passing Gate 3 rehearsal.
Template links, bare command names, and targetless command-output notes are not
enough for pass evidence or required operational evidence fields; link
completed artifact files or non-template evidence records.

For the `Backup-restore or reconstructibility evidence` row, link a completed
[Backup Restore Evidence Template](backup-restore-evidence-template.md) copy
that passes `npm run backup:validate`.

## Preflight Evidence

Record command names, pass/fail status, and log artifact location. Do not paste
secret-bearing output.
`Current Ergo height` and `Current sidechain height` must start with
non-negative integers and include completed node/RPC height artifact markers or
non-template evidence links.
`Broadcast policy result` must identify broadcast policy output and prove that
broadcast is disabled or refused before any live broadcast window. It must not
include contradictory enabled or approved broadcast markers such as
`BRIDGE_BROADCAST_ENABLED=true`, `broadcast enabled`, or live approval language.

```bash
cd relayer
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

Required observations:

- Clean-checkout checks passed:
- ContextExtension guard result: artifact/log that identifies the ContextExtension guard, sigma-rust/JVM conformance coverage, and fail-closed behavior:
- Broadcast policy result:
- Deployed singleton status:
- Clean deployment state evidence: clean deployment state, deployment-state hash=<32-byte hex>, contract IDs=<32-byte hex>, singleton inventory=<32-byte hex>:
- Liquidity status:
- Current Ergo height: <height> artifact://...
- Current sidechain height: <height> artifact://...

Stop immediately if any preflight fails unexpectedly.

## Dry-Run Settlement Evidence

Record the prepared transaction shape before any broadcast-capable run.
`Sidechain block height`, `Ergo anchor height`, `Aggregate claim count`,
`Input count`, and `Output count` must be non-negative integers.
`Sidechain block height` must not exceed `Current sidechain height`;
`Ergo anchor height` must not exceed `Current Ergo height`.
`Aggregate claim count`, `Input count`, and `Output count` must be greater than
`0`.
`ContextExtension key counts per input` must be comma-separated non-negative
integers, with one entry per input.
`Peg-in event ID or TX ID`, `Peg-out burn TX ID`, `Sidechain block hash`, and
`Bridge event root` must each include exactly one 32-byte hex value and a
completed artifact marker.
`/transactions/check` result must include an internally positive `PASS` and a
completed artifact marker or non-template evidence link. Stale or mixed PASS
text beside `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
`errors`, or non-zero `structural issues` is rejected.
`Expected transaction ID` must include exactly one 32-byte hex transaction ID
and a completed artifact marker.
New legacy V1 aggregate daemon and CLI submission workflows are physically
absent. `Daemon approval evidence` may describe a historical transaction only;
it cannot authorize new signing, submission, broadcast, or a Gate 3 lifecycle
claim. A new rehearsal must use a reviewed and activated replacement profile
whose external-fee conservation, on-chain authority transition, replay lineage,
and exact target-node acceptance are bound by that profile's evidence schema.

- Peg-in event ID or TX ID:
- Peg-out burn TX ID:
- Sidechain block height:
- Sidechain block hash:
- Bridge event root:
- Ergo anchor height:
- Aggregate claim count:
- Input count:
- Output count:
- ContextExtension key counts per input:
- `/transactions/check` result:
- Expected transaction ID:
- Daemon approval evidence:

Stop immediately if transaction ID, ContextExtension shape, singleton state, or
AVL digest expectations differ from the prepared evidence.

## Broadcast Enablement Evidence

Complete this section only for a deliberate live broadcast rehearsal.
`Reviewer approval recorded` must name the same reviewer recorded in Session
Metadata, state explicit live broadcast approval, and cite the dry-run
`Expected transaction ID`; a generic approval artifact is not enough to
authorize the live broadcast window. Reviewer approval is a review gate only;
it does not authorize broadcast by itself.
`User approval recorded` must include a completed evidence marker, state user
explicit live broadcast approval, and cite the dry-run `Expected transaction
ID`. A generic approval artifact, reviewer approval, or readiness PASS output
is not enough to authorize the live broadcast window.
Reviewer and user approval evidence must not negate approval with wording such
as `did not grant explicit live broadcast approval`, `approval denied`, or
`approval missing`.
The `BRIDGE_BROADCAST_ENABLED=true` scoped-shell row must include a
completed evidence marker, cite `BRIDGE_BROADCAST_ENABLED=true`, contain
`yes`, name the intended shell, and state the scope is limited; a bare `yes` is
not enough to authorize the live broadcast window.
`Readiness command re-run after enabling broadcast` must include completed
`npm run demo:readiness` output evidence with `PASS`.
`Broadcast policy reports PASS` and `Live settlement readiness reports PASS`
must include completed `npm run demo:readiness` output evidence, respectively
citing the `Broadcast policy` and `Live settlement signing` check lines.
bare `PASS` is not enough, and a generic artifact is not enough to close the
live broadcast gate.
`Node URL and network re-confirmed` must cite a concrete `Node URL` with an
`http://` or `https://` URL and must name the Session Metadata `Ergo node
network` and `Sidechain network` values; a generic network artifact is not
enough before live submission evidence can pass.

- Reviewer approval recorded:
- User approval recorded:
- `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell:
- Readiness command re-run after enabling broadcast:
- Broadcast policy reports `PASS`:
- Live settlement readiness reports `PASS`:
- Node URL and network re-confirmed:

Stop immediately if any other shell/session can broadcast unintentionally.

## Submit And Confirmation Evidence

`Submission timestamp` must use `YYYY-MM-DDTHH:mm:ssZ`.
`First observed mempool height`, `Confirmation height`, and
`Confirmation count` must be non-negative integers. `Confirmation height` must
be greater than or equal to `First observed mempool height`, and
`Confirmation count` must be greater than `0`.
When `Fresh testnet lifecycle` is `pass`, `Required confirmation count` must
be a positive integer, `Confirmation policy met` must be `yes`, and the
observed `Confirmation count` must be greater than or equal to
`Required confirmation count`. The `Confirmation policy met` field must include
a completed artifact marker or non-template evidence link to the finality check
used for the pass decision, include the words `finality evidence`, cite
`confirmationsRequired=<n>`, `confirmationsObserved=<n>`, and cite the
submitted transaction ID.
`Submitted transaction ID` must include exactly one 32-byte hex transaction ID
and must match `Expected transaction ID` from the dry-run section.
The live submit command includes the dry-run Expected transaction ID, and the
signer refuses broadcast if the signed transaction ID differs.
Post-submit peg-out burn TX IDs must be unique; a batch cannot cite the same burn twice.
Peg-out burn TX ID count must match recipient payout box ID count.
`Settlement output box IDs` must include at least one 32-byte hex box ID.
Settlement output box IDs must include DUP successor box ID, SPV tracker successor box ID, and every recipient payout box ID.
`DUP successor box ID`, `SPV tracker successor box ID`, and
`Recipient payout box ID` must each include exactly one 32-byte hex box ID.
For batch settlement evidence, `Recipient payout box IDs` must list every
recipient payout box ID in submitted burn order, while `Recipient payout box ID`
remains the first payout box ID for gate compatibility.
`Miner fee output` must include a completed artifact marker and exactly one
positive `feeNanoErg=<integer>` amount.
The lifecycle classification rows `Settlement submit evidence` and
`Confirmation evidence` must cite the same submitted transaction ID recorded in
this section.
The current repository cannot create the approved live submit described below.
The retained `rehearsal:post-submit`, `rehearsal:post-submit:observe`, and
`rehearsal:assemble` surfaces are historical evidence tooling and fail closed
when given the quarantined legacy V1 preflight. After a future activated
external-fee submit and independent confirmation, the corresponding separately
versioned tooling must require
`--finality-evidence-artifact <artifact://.../finality.log>` as a completed,
distinct finality target, plus `--live-preflight-report <live-preflight.json>`
from the future `rehearsal:external-fee-live-preflight --json-out` run so the helper can
verify the report is bound to the activated profile and same Expected transaction ID, preserves
the false pre-submit boundary, includes the PASS transcript line, and exposes
`approvalBinding.burnTxHashes` matching the submitted burn order. The
helper rejects stale live-preflight PASS transcript lines that share an excerpt
with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`, plus non-concrete `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-*`, and `example-*` submit, confirmation, finality,
reconciliation, and live-preflight report targets. It is Markdown-only evidence assembly; it does
not submit, confirm, query, reconcile, approve, or authorize any transaction.
For settlements that have already been confirmed and reconciled,
`npm run rehearsal:post-submit:observe` can derive these rows from read-only
node and SQLite observations. By default, it binds the SPV tracker and
aggregate DUP NFT IDs from `deployed_state.json`; explicit NFT ID overrides are
for reviewed migrations or fixtures only. For batch settlements, pass
`--burn-tx-id` in the submitted batch order; the observer verifies `OUTPUTS(0)`
as the SPV tracker successor, `OUTPUTS(1)` as the aggregate DUP successor,
`OUTPUTS(2+i)` as each recipient payout, and the final output as the canonical
miner fee. If the settlement has an aggregate unlock change output before the
fee, also pass `--aggregate-unlock-ergo-tree-hex` so the observer can bind that
change output. It requires
`--finality-evidence-artifact <artifact://.../finality.log>` and the same
`--live-preflight-report <live-preflight.json>`
binding before writing the post-submit Markdown companion and structured JSON
report.
The completed post-submit observe Markdown companion must include a PASS output target,
the submitted transaction ID, SPV tracker successor output `OUTPUTS(0)`,
Aggregate DUP successor output `OUTPUTS(1)`, positional recipient payout
binding, and final canonical miner fee output.
Operators must also pass `--json-out <post-submit-observe.json>` for any Gate 3
closure attempt so the observe report preserves structured transaction binding,
burn order, the full ordered `settlementOutputs.boxIds` vector, successor
positions, payout positions, miner fee index, confirmation policy, completed
finality evidence artifact, and
live-preflight provenance binding, including `runtimeBroadcastEnabled: false`,
matching the validated `--live-preflight-json` target, approved burn hashes
matching `burnOrder` and the live-preflight `approvalBinding.burnTxHashes`, and
read-only/no-claim boundaries for CI/release-gate consumers. Markdown output is
companion human-readable evidence only; the structured post-submit observe JSON
report is the required assembly input for completed testnet lifecycle evidence.
The JSON root must also include `sourceBindings.node` and
`sourceBindings.state`: the node binding proves live read-only `/info` plus
transaction lookup provenance with no auth header, concrete read-only node URL,
testnet network, observed height/time, and matching Expected/submitted
transaction IDs; the state binding proves read-only peg-out state lookup,
runtime-path serialization disabled, a bounded state target class, and burn
order matching `observation.burnOrder`.
The validated JSON report must use concrete post-submit observe provenance:
`observation.livePreflightBinding.target` and
`observation.confirmation.finalityEvidenceArtifact` must not be row-named
non-concrete targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`, `testdata-*`,
`sample-*`, or `example-*`.
`release:gate -- --post-submit-observe-json` reads that JSON directly and
rejects production-candidate escalation if the validated report no longer
exposes a root/nested live-preflight binding match, approved burn set,
confirmation/finality artifact, read-only source bindings, read-only/no-broadcast/no-claim boundary
summary, and structured `observation` output shape proving the submitted/Expected transaction binding,
burn order, `settlementOutputs.boxIds`, SPV tracker successor at `OUTPUTS(0)`,
aggregate DUP successor at `OUTPUTS(1)`, recipient payouts at `OUTPUTS(2+i)` in
burn order, optional aggregate unlock change binding, and final miner fee
output.
`rehearsal:validate -- --assembly-report-json` runs the canonical
`rehearsal:assemble` JSON validator before accepting the linked assembly report,
so the report must expose structured `rehearsalValidation`, `targetBindings`,
validated Markdown provenance, post-submit inclusion lines, assembled rehearsal
validation PASS, and the fresh-checkpoint publication-blocker boundary.
For testnet production-candidate decisions, `release:gate` also evaluates the
aggregate prebroadcast, fresh-checkpoint, live-preflight, post-submit observe,
and assembly-report JSON reports as one lifecycle set: every Expected
transaction ID must match, and post-submit/assembly submitted transaction IDs
must match that same Expected transaction ID. Individually passing JSON reports
with divergent transaction identity do not support release escalation. The
preflight and window-prep package rows must also preserve aggregate prebroadcast
claim order for burn hashes and, when present, sidechain header hashes, bridge
event roots, Ergo anchor heights, and sidechain block heights.
Only the future external-fee profile may combine the draft, its distinct
`rehearsal:external-fee-live-preflight` transcript/report, and a structured
post-submit observe report. The current assembler must remain blocked for the
legacy V1 profile. Its historical invocation shape is
`npm run rehearsal:assemble -- --draft <draft-live-rehearsal.md> --live-preflight <live-preflight.log-or-md-or-json> [--fresh-checkpoint <fresh-testnet-checkpoint.json>] [--failed-broadcast <failed-broadcast-row.md>] [--reorg-recovery <reorg-stale-singleton-row.md>] --post-submit <post-submit-observe.json> --out <assembled-live-rehearsal-candidate.md> --json-out <assembled-live-rehearsal-candidate.json>`.
This assembler remains an offline parser. It validates target hygiene,
cross-artifact transaction identity, post-submit observations, recovery rows,
and optional checkpoint inputs, but it injects the standard legacy V1
quarantine error for both text PASS transcripts and structured legacy reports
before rendering output. It therefore emits no new assembled Markdown or
positive assembly report for the legacy profile. Existing immutable assembly
artifacts remain historical provenance only; `release:gate` cannot consume them
as current Gate 3 authority. A future external-fee assembler and report
validator must be separately versioned and profile-bound.
Recovery row fragment evidence must still match the draft Expected transaction
ID and peg-out burn TX ID during diagnostic validation. When
`--fresh-checkpoint` is supplied, the assembler must preserve the same
fresh-checkpoint boundary used by `rehearsal:offline-gate`: the checkpoint
remains `CREATED` / `publication blocker`, every broadcast/lifecycle boundary
stays false, and the checkpoint must match the draft/live-preflight Expected
transaction ID, burn set, deployed-state hash, sidechain block heights and
hashes, Ergo anchor heights, and bridge event roots. A mismatch blocks assembly;
the checkpoint cannot close Gate 3, authorize broadcast, replace
the future activated external-fee live-preflight, submit, confirmation, or reconciliation evidence, or
support production-ready/testnet production-candidate claims.

- Submitted transaction ID:
- Submission timestamp:
- First observed mempool height:
- Confirmation height:
- Confirmation count:
- Required confirmation count:
- Confirmation policy met: yes / no artifact://... finality evidence confirmationsRequired=<n> confirmationsObserved=<n> submitted transaction ID <txId>
- Settlement output box IDs:
- DUP successor box ID:
- SPV tracker successor box ID:
- Recipient payout box ID:
- Recipient payout box IDs:
- Miner fee output: feeNanoErg=<positive integer>

Stop immediately if confirmation is ambiguous, missing, or points to a different
transaction than the prepared evidence.

## Reconciliation Evidence

```bash
cd relayer
npm run status
```

Required observations:

- Peg-out status after reconciliation: confirmed/settled plus submitted transaction ID and completed evidence marker
- DUP history contains only confirmed keys: yes plus submitted DUP successor box ID and completed evidence marker
- SPV tracker digest matches confirmed successor: yes plus submitted SPV tracker successor box ID and completed evidence marker
- No duplicate payout exists for the same burn: yes plus peg-out burn TX ID, recipient payout box ID, recipient payout box IDs for batch evidence, and completed evidence marker
- Failed-event queue:
- Manual repair performed: yes / no

Stop immediately if local SQLite and canonical chain state disagree.
Linked reconciliation evidence must cite submitted successor and burn values
from the same rehearsal: submitted transaction ID, submitted DUP successor box
ID, submitted SPV tracker successor box ID, reconciliation evidence cites peg-out burn TX ID, recipient payout box ID, and recipient payout box IDs for batch evidence. Generic `yes` values are not enough.

## Rollback And Cleanup

- Broadcast disabled in all shells:
- Runtime state files preserved but not staged:
- Logs archived:
- Incident or regression issue opened if needed:
- Regression test or runbook update needed: yes / no

## Publication Evidence

Gate 3 rehearsal evidence must update publication control documents before it
can close a public-release blocker. This section is executable guard input; do
not replace it with prose.

`Release notes updated` and `Pending Evidence Register updated` must be `yes`.
`Production-ready claim allowed by this rehearsal` and
`Testnet production-candidate claim allowed by this rehearsal` must both be
`no`; a rehearsal can support a lifecycle claim, but it cannot by itself
authorize mainnet production-ready language or testnet production-candidate
language.
Publication Evidence free text must not include mainnet go-live,
production-ready, production-candidate, production-grade, exchange-grade, or
similar production claim wording. Keep any claim-control statements in the
dedicated fields above with value `no`.
Required release-note and checklist updates must include completed evidence
markers and targets, not template links, bare validator command names, or
targetless command-output notes. The release-note and checklist update fields
must cite distinct completed evidence targets; one combined publication-update
artifact cannot satisfy both fields. Those fields also fail closed when
completed evidence is mixed with `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues`.

- Release notes updated: yes / no
- Required release-note updates: completed Gate 3 rehearsal release-note update evidence:
- Pending Evidence Register updated: yes / no
- Required checklist updates: completed Gate 3 checklist update evidence:
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no

## Reviewer Sign-Off

The reviewer must classify the run before it can be used as release evidence.
Reviewer classification must be `pass` before rehearsal evidence can pass.
`fail` and `inconclusive` classifications must stay documented until resolved.
Date fields must use `YYYY-MM-DD`.
Reviewer sign-off date must not be before the session date.
The Reviewer Sign-Off `Reviewer` value must match the Reviewer recorded in
Session Metadata; a different reviewer cannot close Gate 3 live rehearsal
evidence after the session reviewer is named.
A `pass` classification requires `Publication blockers discovered`,
`Follow-up tests required`, and `Follow-up runbook changes required` to be
`none`, `no`, or `0`. Open blockers or unresolved follow-ups must keep the
rehearsal blocked.

- Classification: pass / fail / inconclusive
- Publication blockers discovered:
- Follow-up tests required:
- Follow-up runbook changes required:
- Reviewer:
- Date:
