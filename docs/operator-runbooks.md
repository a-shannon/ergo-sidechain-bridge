# Operator Runbooks

These runbooks define the minimum operator procedures for staging or internal
evaluation. They are intentionally conservative: if a stop condition is hit,
pause and investigate before signing or broadcasting more transactions.

The bridge is not production-ready just because these procedures exist. They
are part of the institutional-readiness gate defined in
`docs/ultimate-bridge-roadmap.md`. Mainnet production-ready claims remain
forbidden; a future production-candidate claim must be testnet-scoped and
backed by completed lifecycle, recovery, signer conformance, security review,
governance/key-rotation, benchmark, and final CI evidence plus checked
publication blockers.

## Global Rules

- The current observation-only bridge daemon does not load an Ergo signer or
  mnemonic and refuses startup when `BRIDGE_BROADCAST_ENABLED=true`. Commands
  that require signing or broadcast are separate, explicitly invoked utilities
  and must retain their own reviewed capability boundary.
- Do not put the relayer mnemonic in the Ergo node wallet.
- Keep `BRIDGE_BROADCAST_ENABLED=false` or unset during dry runs.
- Set `BRIDGE_BROADCAST_ENABLED=true` only for an independently reviewed,
  activated, non-legacy profile and only in the process meant to broadcast,
  after all profile-specific preflights are green. No current aggregate payout
  profile satisfies that boundary.
- Run `npm run check` from `relayer/` before any release candidate.
- Run `npm run demo:readiness` before daemon startup.
- Run `npm run status` before and after every high-risk operation.
- Do not manually edit SQLite unless the relevant recovery procedure says so
  and the change is reviewed.
- Do not stage runtime state files, `.env`, SQLite, deployed devnet state, or
  diagnostic directories.

## Runbook 0: Config-Free Recovery Rehearsal

Purpose: exercise the current relayer recovery boundaries without chain RPC,
operator keys, persistent runtime state, submission, broadcast, or funds
authority.

Command:

```bash
cd relayer
npm run operator:drill:recovery
```

The structured report must contain the exact seven registered cases, matching
expected and observed outcomes, reached-stage counters, and zero values for the
four explicitly trapped funds-authority, funds-release, transport-start, and
aggregate-submission-reservation calls. Network, private-runtime-state,
environment, deployment-state, checker, signer, authorization, submission,
broadcast, and hold-clearing capabilities are separately reported as not wired
by the drill composition; source checks constrain the drill root and its
incident-only modules. The cases use real ephemeral SQLite close/reopen and
database-deletion boundaries and reconstruct a fresh process-provenant
two-source report after reopen. They cover durable-state reopen, loss of a
lifecycle-bearing database, an already recovery-required copied state against a
strictly later snapshot, deterministic RPC disagreement, exact out-of-order
source/mint/candidate/confirmation rejections, post-mint source restoration,
burn reorg, aggregate pre-finality rollback, and an injected
incident-persistence port failure followed by reopen and retry. Clean-database
copy location binding remains covered by the separate StateTracker negative
matrix.

Stop conditions:

- The report is not `PASS`, the seven-case order changes, or either report
  digest is absent.
- Any trapped capability counter is nonzero.
- The drill requests network configuration, private runtime state, signing,
  submission, broadcast, funds authority, or hold clearing.
- A recovery case mutates authority after a rejected or failed persistence
  transition.

This is a deterministic local rehearsal over fixture chain observations and
self-created ephemeral SQLite state. It does not read or mutate a private
runtime database, rewrite continuity state, or prove a child-process restart.
A PASS does not clear a hold, restore an execution reservation, authorize
signing or transport, establish independent RPC operation, prove live-chain
recovery, close Gate 5, or support trustless or production-readiness claims.

## Runbook 1: Dry-Run Readiness Gate

Purpose: verify that the environment is safe to operate without broadcasting.

Prerequisites:

- Ergo node reachable.
- Sidechain RPC reachable.
- `relayer/.env` configured locally but not printed or committed.
- `BRIDGE_BROADCAST_ENABLED=false` or unset.

Commands:

```bash
cd relayer
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

Pass criteria:

- TypeScript, relayer tests, and WASM AVL tests pass.
- Readiness output has no `FAIL` except an intentional broadcast-disabled gate
  during dry run.
- Legacy aggregate readiness is `WARN`: the relayer exposes no new legacy V1
  signing or transport route, regardless of approval or runtime configuration.
- `npm run status` loads deployment state and does not report broken singleton
  invariants.

Stop conditions:

- Any check fails unexpectedly.
- Readiness reports live settlement signing as unsafe.
- Status shows missing singleton boxes, stale deployment state, or unresolved
  failed events.

## Runbook 1A: Legacy V1 Diagnostics And Historical Evidence

Purpose: produce unsigned legacy V1 shape diagnostics or inspect an immutable
pre-quarantine evidence package. This runbook cannot lead to a new V1 signing,
node-check, approval, submission, or transport action. Legacy V1 funds the miner
fee from protected backing while only the net payout is burned, so every new
value-release capability for that profile is physically absent.

This runbook is non-broadcast only. It does not close Gate 3 or Gate 5, does
not authorize `Fresh testnet lifecycle | pass`, and does not support any
production-ready or testnet production-candidate claim.

Prerequisites:

- The operator has completed Runbook 1.
- Target Ergo node and sidechain RPC are testnet targets.
- `BRIDGE_BROADCAST_ENABLED=false` or unset in every shell.
- Approved environment variables are exported by the invoking shell; the
  aggregate settlement script does not auto-load `relayer/.env`.
- No current legacy V1 live broadcast window exists.

Commands:

```bash
cd relayer
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

Evidence capture:

- Fill [Testnet Pre-Broadcast Dry-Run Evidence Template](testnet-prebroadcast-dry-run-evidence-template.md).
- Link completed command artifacts for clean checkout, WASM tests, readiness,
  status, ContextExtension guard, broadcast policy, and clean deployment state.
- Link current Ergo and sidechain height artifacts. The current height fields
  must start with numeric values and point to completed node/RPC evidence.
- Link unsigned preparation artifacts for peg-in, peg-out burn TX ID,
  sidechain block hash, bridge event root, and transaction shape. These
  artifacts do not contain a signature, node-check result, or settlement
  authority and cannot satisfy Gate 3.
- A completed signed-check artifact created before V1 retirement may be parsed
  only as historical provenance. Preserve its original bytes and fields; do
  not regenerate it, update its timestamp, or promote it into a current
  pre-broadcast package.
- Confirm the dry-run sidechain block height does not exceed the current
  sidechain height, and the Ergo anchor height does not exceed the current Ergo
  height.
- Record new daemon approval preparation as
  `N/A - daemon submit not planned`. Version 2 approval files and their check
  fields remain parseable only for exact historical evidence reconstruction;
  they cannot authorize a new V1 transaction.
- Current aggregate diagnostic command surfaces are
  `npm run settle:aggregate -- prepare <sidechainTxHash>`,
  `npm run settle:aggregate -- prepare-batch <sidechainTxHash> <sidechainTxHash> [...]`,
  `npm run settle:aggregate -- prepare-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>`,
  or `npm run settle:aggregate -- prepare-anchored <sidechainTxHash> <ergoAnchorHeight>`.
  They construct unsigned transaction shapes only. They do not sign, call
  `/transactions/check`, write new signed-check evidence, authorize settlement,
  submit, confirm, or reconcile.
- The `npm run settle:aggregate -- prepare*` commands open the local
  SQLite state tracker in read-only mode and print `StateTracker mode: read-only`.
  Complete any import/setup step before running them; a missing database or a
  missing read-only mode line is an evidence failure.
- For unsigned diagnostics or immutable historical-package review, run
  `npm run prebroadcast:validate -- <completed-evidence.md>` and
  `npm run prebroadcast:doctor -- <completed-evidence.md> --json-out ../evidence/live-rehearsals/<prebroadcast-doctor>.json`.
  The doctor is read-only and summarizes linked aggregate JSON evidence and
  remaining structural issues. A passing doctor report does not authorize
  signing, node-check, submit, confirmation, reconciliation, or Gate 3 closure.
- Do not reconstruct or draft a new legacy V1 approval. The approval generator
  is physically absent. Retain an existing approval file only as immutable
  provenance for an exact transaction proven to have been submitted before
  quarantine; the historical parser may validate that original record but
  cannot renew its window or authorize any current action.
- When validating an archived package, run
  `npm run rehearsal:preflight -- --prebroadcast <completed-evidence.md> --approvals <aggregate-approvals-v2.json> --json-out ../evidence/live-rehearsals/<rehearsal-preflight>.json`
  without opening a scoped live shell. The preflight is read-only and blocks unless the
  approvals file matches the package runtime context, deployment-state hash,
  package mode, exact burn hash or ordered burn set, and Expected transaction
  ID. A passing preflight does not authorize broadcast.
- For archived comparison only, create a read-only testnet-window preparation
  packet with
  `npm run rehearsal:testnet-window-prep -- --prebroadcast <completed-evidence.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out ../evidence/live-rehearsals/<testnet-window-prep>.md --json-out ../evidence/live-rehearsals/<testnet-window-prep>.json`.
  The packet re-checks the matched approval binding, records current heights,
  requires broadcast disabled, requires positive testnet/non-mainnet network
  scope, verifies the current heights are not below the prebroadcast package
  Ergo anchor and sidechain block heights, and compares the current
  `deployed_state.json` hash with the preflight/approval hash. The structured
  JSON must expose `targetBindings`, `networkScope`, `heightBoundary`, and
  `gateBoundary`; every gate-boundary flag must remain false, including
  broadcast authorization, submit, confirmation, reconciliation, Gate 3
  closure, production-ready claims, and testnet production-candidate claims.
  This packet is archived-package comparison evidence only. It does not open a
  live window, authorize broadcast, close Gate 3, or support production-ready
  or testnet production-candidate claims.
- Optionally bundle the non-broadcast preparation artifacts with
  `npm run rehearsal:offline-gate -- --prebroadcast <prebroadcast-doctor.json> --preflight <rehearsal-preflight.json> --window-prep <testnet-window-prep.json> --fresh-checkpoint <fresh-testnet-checkpoint.json> --json-out ../evidence/live-rehearsals/<offline-gate>.json`.
  The offline gate reads only completed artifacts and blocks if any required
  stage is missing, not PASS-equivalent, broadcast-enabled, or mainnet-scoped.
  The window-prep JSON must be the structured report from
  `rehearsal:testnet-window-prep`; targetless or prose-only reports are
  blocked, and the gate rejects any missing `targetBindings`, unsafe
  `networkScope`, stale or mismatched `heightBoundary`, or escalated
  `gateBoundary`.
  When a fresh checkpoint is supplied, it must remain `CREATED` /
  `publication blocker`, keep every broadcast/lifecycle boundary false, and
  match the preflight package's Expected transaction ID, burn set,
  deployed-state hash, sidechain block heights and hashes, Ergo anchor heights,
  and bridge event roots. Its `checkpoint.currentErgoHeight` and
  `checkpoint.currentSidechainHeight` must also be greater than or equal to the
  window-prep `heightBoundary.currentErgoHeight` and
  `heightBoundary.currentSidechainHeight`, and it must declare
  `checkpoint.ergoNodeNetwork` / `checkpoint.sidechainNetwork` values that
  match the window-prep
  `networkScope`.
  It is a final offline consistency check for the historical package; it does
  not authorize broadcast or create a current live-preflight handoff.
  If this offline gate is retained, preserve its completed JSON report and
  concrete source bindings as historical provenance. `release:gate` ignores
  this report; neither a structured report nor a textual PASS note can satisfy
  Gate 3.
  The fresh checkpoint JSON must also preserve `checkpoint.heightEvidence` and
  `sourceBindings.heightEvidence`: observed heights must match the checkpoint
  current heights, `broadcastEnabled` must be false, live mode must cite
  read-only `/info` and `getBlockNumber` with concrete read-only
  `ergoNodeUrl` and `sidechainRpcUrl` endpoint bindings, and provided-json mode
  must cite a concrete non-template height evidence JSON target. Provided
  height-evidence and singleton-checkpoint JSON targets named `template-*`,
  `example-*`, `sample-*`, `generic-*`, `placeholder-*`, `todo-*`, or `tbd-*`
  are placeholders, not fresh checkpoint source provenance.
- Optionally create a read-only preparation bundle that captures the exact
  package bindings, planned preparation commands, current heights, deployment
  state hash, required fresh checkpoint artifact, and optional recovery row
  fragments:
  `npm run rehearsal:prep-bundle -- --prebroadcast <completed-evidence.md> --approvals <aggregate-approvals-v2.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --fresh-checkpoint-artifact <fresh-testnet-checkpoint.json> [--height-evidence-artifact <height-evidence.json>] [--failed-broadcast <failed-broadcast-row.md>] [--reorg-recovery <reorg-stale-singleton-row.md>] --out ../evidence/live-rehearsals/<prep-bundle>.md --json-out ../evidence/live-rehearsals/<prep-bundle>.json`.
  The JSON report exposes `gateBoundary`, `artifactTargets`,
  `preparedCommands`, `nextHandoff`, `stageStatuses`, and `recoveryRows` so reviewers can
  verify the claim and broadcast boundary without parsing Markdown. Every
  prepared command is explicitly marked as non-broadcast, bound to the same
  artifact targets, and the window-prep command must carry the current
  deployed-state hash matching the prepared package. The generated
  `rehearsal:fresh-testnet-check` prepared command must bind the prepared
  package aggregate evidence, the fresh checkpoint JSON target, testnet /
  non-mainnet network scope, and either read-only `--auto-heights` mode or the
  concrete `--height-evidence-artifact` target as
  `--height-evidence <height-evidence.json>` with matching current heights.
  `nextHandoff` must identify the external-fee profile activation prerequisites,
  retain the legacy V1 quarantine status, carry no live execution targets, and
  keep `broadcastCommand` and `reportAuthorizesBroadcast` false. The current
  `npm run rehearsal:live-preflight` command is a historical diagnostic that
  always returns `BLOCKED`; approval or configuration cannot promote it into
  submit, confirmation, reconciliation, Gate 3 closure, or claim authority. If
  retained with completed rehearsal history, keep its JSON target concrete and
  immutable. It remains historical provenance and is ignored by the current
  Gate 3 validator.
  Secret-bearing or runtime-state target paths must be rejected or redacted in
  that report. The bundle reuses the preflight, window-prep, and draft checks
  and remains preparation evidence only. `--fresh-checkpoint-artifact` is required. The generated offline-gate
  command must carry it forward as `--fresh-checkpoint`; the bundle must verify
  `sourceBindings.freshCheckpoint` and `sourceBindings.offlineGate` against the
  same historical fresh-checkpoint and offline-gate artifact targets; the
  bundle must also verify
  the same offline-gate checkpoint boundary: `CREATED` / `publication blocker`, all
  broadcast/lifecycle boundaries false, and exact match to Expected transaction
  ID, burn set, sidechain heights and hashes, Ergo anchor heights, and bridge
  event roots, with checkpoint current heights not below the window-prep
  current heights and checkpoint network labels matching the window-prep
  network scope. Otherwise the prep bundle is blocked. The bundle still does not
  validate that checkpoint as live lifecycle evidence, authorize broadcast,
  perform submit or confirmation, replace a future activated external-fee
  live-preflight, or close Gate 3.
- For an immutable pre-quarantine package, optionally reconstruct its archived
  non-broadcast checkpoint from the original aggregate `/transactions/check`
  JSON report:
  `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence <aggregate-check.json> --auto-heights --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out ../evidence/live-rehearsals/<fresh-testnet-checkpoint>.md --json-out ../evidence/live-rehearsals/<fresh-testnet-checkpoint>.json`.
  Use explicit heights only with a concrete height evidence JSON target:
  `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence <aggregate-check.json> --height-evidence <height-evidence.json> --current-ergo-height <height> --current-sidechain-height <height> --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out ../evidence/live-rehearsals/<fresh-testnet-checkpoint>.md --json-out ../evidence/live-rehearsals/<fresh-testnet-checkpoint>.json`.
  The provided height evidence JSON must be non-template, non-runtime,
  non-secret material and its observed Ergo and sidechain heights must match
  the explicit height arguments. Targets named `template-*`, `example-*`,
  `sample-*`, `generic-*`, `placeholder-*`, `todo-*`, or `tbd-*` are refused
  as placeholder height evidence.
  If the singleton observation has already been exported as concrete JSON, add
  `--singleton-checkpoint <singleton-checkpoint.json>` while keeping the
  `--current-deployed-state-hash <64hex>` binding; that mode validates the
  supplied checkpoint against the sanitized hash and does not read local
  `deployed_state.json`. Omitting `--singleton-checkpoint` collects singleton
  observations from the local deployment state.
  This checkpoint must keep `Fresh testnet lifecycle` as `publication blocker`;
  it never marks the lifecycle `pass`, authorizes broadcast, or creates a
  current submit, confirmation, reconciliation, or live-preflight path. It is
  historical provenance only and cannot become Gate 3 closure evidence.
  `--auto-heights` reads the current Ergo `/info` height and sidechain
  `getBlockNumber` height only and records
  `sourceBindings.heightEvidence.mode = live-read-only-sources`; the command
  refuses to run if `BRIDGE_BROADCAST_ENABLED=true`. Live singleton collection
  uses an `ErgoClient` read-only/no-auth node client without an `api_key` header
  and only reads `/info`, singleton boxes, mempool/unconfirmed transactions, and
  confirmed transaction lookup for the Expected transaction ID. The singleton
  checkpoint JSON must bind to the declared deployed-state hash, include
  `observedAt` as an ISO UTC timestamp for the
  read-only node observation, prove the Expected transaction ID is absent from
  both mempool and confirmed chain, and that observation must be no older than 15 minutes.
  Fresh Ergo testnet lifecycle evidence must also include a read-only
  observation of extension fields `0x04` and `0x0401` at each aggregate
  `ergoAnchorHeight`, with `bridgeEventRootHex` present. The generated
  structured checkpoint report must carry explicit `sourceBindings` provenance:
  height evidence must identify live read-only `/info` plus `getBlockNumber`
  collection with concrete read-only `ergoNodeUrl` and `sidechainRpcUrl`
  endpoint bindings or a concrete provided JSON target, singleton observations
  must identify live read-only node collection with a concrete read-only
  `ergoNodeUrl` binding or a concrete provided JSON target, and anchor
  observations must identify `live-read-only-node` with a concrete read-only
  `ergoNodeUrl` binding.
- For archived comparison only, an operator may render the historical
  non-broadcast rehearsal draft with
  `npm run rehearsal:draft -- --prebroadcast <completed-evidence.md> --approvals <aggregate-approvals-v2.json> --out ../evidence/live-rehearsals/<draft-live-rehearsal>.md --json-out ../evidence/live-rehearsals/<draft-live-rehearsal>.json`.
  The draft is read-only historical output. Its `targetBindings` and
  `plannedCommands` describe the archived package and must keep
  `reportAuthorizesExecution: false`. No generated draft is a current
  live-preflight, approval, submit, confirmation, reconciliation, or Gate 3
  handoff.
- Archived live-preflight and post-submit reports may be parsed only to explain
  an exact transaction proven submitted before quarantine. The historical
  `approvalBinding` remains provenance for the original command, transaction,
  burn set, and ordered batch `bridgeEventRootHexes` only. Its approval window
  cannot be renewed, and its command, Expected transaction ID, or PASS line
  cannot authorize current execution.
- Retired E2E execution and aggregate signing, node-check, authorization,
  submission, and transport commands are absent. Do not reproduce their command
  strings in current artifacts. Historical `confirm*` and recovery commands
  remain available only for the exact transaction they reconcile.
- Current diagnostic artifacts must not cite deployment, test-roundtrip,
  signing, submission, confirmation, or broadcast commands.
- Record non-broadcast attestation: broadcast disabled at start and end, no
  submit command attempted, no mempool transaction observed, and no local
  DUP/SPV confirmed-history mutation. Every non-broadcast attestation row must
  cite a completed evidence target or non-template evidence link.

Historical lifecycle linkage:

The remaining helper schemas in this section are retained only to verify an
already completed pre-quarantine record. They are not operator instructions and
must not be used to create, refresh, or authorize a current V1 lifecycle.

- Keep `Fresh testnet lifecycle`, `Settlement submit evidence`,
  `Confirmation evidence`, and `Reconciliation evidence` as
  `publication blocker` for every current package.
- Historical `pass` values describe only the original archived transaction and
  cannot support a current release claim.
- Required next evidence must come from the separately versioned external-fee
  replacement profile after review, activation, and target-node acceptance.
- For an already completed pre-quarantine rehearsal, preserve the exact target
  and a distinct `rehearsal:validate` transcript artifact containing
  `npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log> --assembly-report-json <assembly-report.json> --live-preflight-json <external-fee-live-preflight.json> --post-submit-observe-json <post-submit-observe.json> --fresh-checkpoint-json <fresh-testnet-checkpoint.json> --recovery-observe-json <failed-broadcast-observe.json> --recovery-observe-json <reorg-stale-singleton-observe.json> <completed-live-rehearsal.md>`
  and the `npm run rehearsal:validate` PASS output. The transcript must include the validator output artifact before
  the `validated target` binding, a `validated target` binding to the completed
  rehearsal target, confirmation policy met PASS, `confirmationsRequired=<n>`,
  `confirmationsObserved=<n>`, observed confirmation count greater than or
  equal to required confirmation count, submitted transaction ID, and completed
  finality evidence.
  Each top-level JSON target supplied to the validator and later to
  `release:gate` must be a concrete completed evidence target, not a matching
  `generic-*`, `placeholder-*`, `todo-*`, or `tbd-*` JSON name.
  `--live-preflight-json` is the canonical join key for
  `--post-submit-observe-json`: the validator checks
  `observation.livePreflightBinding.target` and approved burn hashes against
  that supplied live-preflight JSON, while still requiring the completed
  rehearsal markdown binding to agree. `release:gate` consumes the same
  structured post-submit JSON for historical compatibility review and rejects
  reduced summaries that omit the live-preflight binding, approved burn set,
  confirmation/finality artifact, or read-only/no-broadcast/no-claim boundary
  summary.
  The validation output artifact must be distinct from the completed live rehearsal target.
- An immutable pre-quarantine rehearsal package may retain its original
  `rehearsal:live-preflight` transcript/report as historical provenance. It
  cannot satisfy current Gate 3, even when it binds to the same Expected and
  submitted transaction ID.
- For a transaction proven broadcast and independently confirmed before
  quarantine, the historical evidence assembler can reproduce the original
  submit, confirmation, and reconciliation section with
  `npm run rehearsal:post-submit -- --expected-tx-id <expectedTxId> --submitted-tx-id <submittedTxId> --burn-tx-id <burnTxId> [--burn-tx-id <burnTxId> ...] --submission-artifact <artifact://.../submit.log> --confirmation-artifact <artifact://.../confirmation.log> --finality-evidence-artifact <artifact://.../finality.log> --reconciliation-artifact <artifact://.../reconciliation.log> --submission-timestamp <YYYY-MM-DDTHH:mm:ssZ> --first-observed-mempool-height <n> --confirmation-height <n> --confirmation-count <n> --confirmations-required <n> --settlement-output-box-id <boxId> [--settlement-output-box-id <boxId> ...] --dup-successor-box-id <boxId> --spv-tracker-successor-box-id <boxId> --recipient-payout-box-id <boxId> [--recipient-payout-box-id <boxId> ...] --fee-nanoerg <positive-int> --peg-out-status <confirmed|settled> --failed-event-queue <status> --manual-repair-performed <yes|no> --live-preflight-report <live-preflight.json>`.
  The `--finality-evidence-artifact` target must be a completed, distinct
  artifact that proves the required confirmation policy reached finality; it
  cannot reuse submit, confirmation, or reconciliation evidence.
  The `--live-preflight-report` input remains required to inspect the historical
  binding, but the current validator rejects the legacy V1 schema with the
  standard quarantine error. Consequently the current post-submit helper cannot
  create new post-submit evidence from that profile. A future external-fee
  post-submit producer must use a separately versioned report bound to the
  activated settlement profile. The helper also rejects
  non-concrete `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-*`, and
  `example-*` targets for submit, confirmation, finality, reconciliation, and
  the live-preflight report.
  Each `--burn-tx-id` value must be unique; duplicate burn IDs are blocked
  because batch evidence must not count the same burn twice.
  Burn IDs and recipient payout box IDs must align one-to-one. The
  `--settlement-output-box-id` values must be passed in observed transaction
  output order: `OUTPUTS(0)` SPV tracker successor, `OUTPUTS(1)` aggregate DUP
  successor, `OUTPUTS(2+i)` recipient payouts in burn order, then the final
  miner fee output. This ordered vector is emitted as
  `settlementOutputs.outputCount` and `settlementOutputs.boxIds` in structured
  post-submit observe JSON. The structured `livePreflightBinding` must also
  carry `approvedBurnTxHashes` matching both the observe `burnOrder` and the
  validated live-preflight `approvalBinding.burnTxHashes`.
  This helper is Markdown-only evidence assembly. It does not submit, confirm,
  query, reconcile, approve, or authorize any transaction.
- For an archived package with its original distinct live-preflight
  transcript/report, the historical assembler invocation remains inspectable as
  `npm run rehearsal:assemble -- --draft <draft-live-rehearsal.md> --live-preflight <live-preflight.log-or-md-or-json> [--fresh-checkpoint <fresh-testnet-checkpoint.json>] [--failed-broadcast <failed-broadcast-row.md>] [--reorg-recovery <reorg-stale-singleton-row.md>] [--post-submit <post-submit-observe.json>] --out ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.md> --json-out ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.json>`.
  The assembler reads only local Markdown/text/JSON evidence and still validates
  target hygiene and cross-artifact identities, but both legacy text PASS
  transcripts and legacy JSON reports now end in the standard quarantine error.
  It emits no new assembled Markdown or positive assembly report for legacy V1.
  Existing immutable assembly artifacts remain historical provenance only and
  cannot close current Gate 3. The assembler does not approve, submit, confirm,
  reconcile, query nodes, or authorize broadcast.
  If `--fresh-checkpoint` is supplied, the assembler must preserve the same
  fresh-checkpoint boundary used by `rehearsal:offline-gate`: the checkpoint
  remains `CREATED` / `publication blocker`, every broadcast/lifecycle boundary
  stays false, and the checkpoint must match the draft/live-preflight Expected
  transaction ID, burn set, deployed-state hash, sidechain block heights and
  hashes, Ergo anchor heights, and bridge event roots. A mismatch blocks
  assembly; the checkpoint cannot close Gate 3, authorize broadcast, replace a
  future activated external-fee live-preflight, submit, confirmation, or
  reconciliation evidence, or support production-ready/testnet
  production-candidate claims.
- For a settlement proven confirmed and reconciled before quarantine,
  `npm run rehearsal:post-submit:observe` can collect the same section from
  read-only node and SQLite observations. By default, it binds the SPV tracker
  and aggregate DUP NFT IDs from `deployed_state.json`; explicit NFT ID
  overrides are for reviewed migrations or fixtures only. For batch settlements,
  pass `--burn-tx-id` in the submitted batch order; the observer verifies
  `OUTPUTS(0)` as the SPV tracker successor, `OUTPUTS(1)` as the aggregate DUP
  successor, `OUTPUTS(2+i)` as each recipient payout, and the final output as
  the canonical miner fee. If the settlement includes an aggregate unlock change
  output before the fee, pass `--aggregate-unlock-ergo-tree-hex <hex>` so the
  change output is bound too. The CLI also requires
  `--finality-evidence-artifact <artifact://.../finality.log>` as a completed,
  distinct finality target before it writes the post-submit companion evidence.
  The CLI requires `--live-preflight-report <live-preflight.json>`
  to bind the observation to the approved live-preflight report before writing
  the post-submit Markdown companion and structured JSON report. Use `--json-out <post-submit-observe.json>` to
  retain the machine-readable observation report: transaction binding, burn
  order, full ordered settlement output vector, fixed successor and payout
  positions, final miner fee position, confirmation policy, live-preflight
  provenance binding matching the validated `--live-preflight-json` target,
  including `runtimeBroadcastEnabled = false`, and read-only/no-claim
  boundaries. Gate 3 closure must
  assemble this structured JSON report via `--post-submit <post-submit-observe.json>`;
  Markdown output is companion human-readable evidence only. The structured JSON
  report must bind concrete live-preflight and finality provenance; `generic-*`,
  `placeholder-*`, `todo-*`, `tbd-*`, `sample-*`, and `example-*` targets are
  placeholders, not completed post-submit observe provenance.

Stop conditions:

- Any shell has broadcast enabled.
- Any live submit command is proposed or attempted.
- A new or refreshed legacy V1 `/transactions/check` result is proposed.
- ContextExtension guard output does not identify the guard, sigma-rust/JVM
  conformance coverage, and fail-closed behavior.
- Prepared transaction shape or singleton state differs from the evidence.
- An operator tries to treat the dry-run package as a completed Gate 3 lifecycle
  run.

## Runbook 1A.1: Peg-In Route Observation

Purpose: classify the complete manifest-declared committed-vault-v3 peg-in
route without consulting deployment state or granting funds authority.

Prerequisites:

- An independently reviewed route manifest binds the exact network anchor,
  checked-in and resolved MCL and settlement-vault sources, ordered committee,
  tracker/DUP NFT identities, active MCL, settlement vault, historical MCL set,
  and minimum confirmation policy.
- The expected manifest digest is supplied out of band.
- Two explicit credential-free node root origins expose synchronized extra
  indexes and complete address history.
- The output report path does not already exist.

Command from `relayer/`:

```bash
npm run pegin:route-observe -- \
  --manifest <reviewed-route-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --main-chain-lock-source ../contracts/MainChainLock.es \
  --settlement-vault-source ../contracts/MainChainAggregateUnlockTrustless.es \
  --primary-node-url <explicit-root-origin> \
  --witness-node-url <distinct-root-origin> \
  --json-out <new-report.json>
```

The report condition is met only when both stable origins agree on the exact
compiled MCL, complete active MCL/vault history, at least one exact confirmed
MCL-to-vault transition, all spent-deposit classifications, and zero current
UTXOs at every declared legacy MCL route. A refundable active v3 deposit is a
valid observation state; an unresolved spend, incomplete query, stale anchor,
source mismatch, origin disagreement, or current legacy MCL UTXO blocks.

This command is read-only except for deterministic P2S compilation and writing
the new report. It does not load runtime SQLite or deployment state and cannot
check, sign, submit, broadcast, route deposits, authorize mint, authenticate
manifest review, or activate a cutover. Origin agreement is not proof of
independent operation or canonical consensus. See
[Peg-In Route Observation V1](peg-in-route-observation.md).

Stop conditions:

- The manifest or expected digest has not received independent review.
- Either origin requires credentials, redirects, a proxy, or an embedded path.
- The command reports any blocked classification.
- A passing report is proposed as mint, deployment, cutover, Gate 5, trustless,
  or production-readiness authority.

## Runbook 1A.2: Peg-In Runtime Reconciliation Hold

Purpose: recollect the complete joined Ergo/Frontier peg-in view before daemon
lifecycle selection and append only defer/quarantine holds to existing rows.

Required runtime configuration:

- `PEG_IN_RUNTIME_RECONCILIATION_ENABLED=true`;
- `PEG_IN_RUNTIME_ROUTE_MANIFEST_PATH` and
  `PEG_IN_RUNTIME_ROUTE_MANIFEST_SHA256`;
- `PEG_IN_RUNTIME_MAIN_CHAIN_LOCK_SOURCE_PATH` and
  `PEG_IN_RUNTIME_SETTLEMENT_VAULT_SOURCE_PATH`;
- `PEG_IN_RUNTIME_ERGO_PRIMARY_NODE_URL` and a distinct
  `PEG_IN_RUNTIME_ERGO_WITNESS_NODE_URL`;
- `PEG_IN_RUNTIME_FRONTIER_PRIMARY_RPC_URL` and a distinct
  `PEG_IN_RUNTIME_FRONTIER_WITNESS_RPC_URL`;
- `PEG_IN_RUNTIME_SIDECHAIN_ID_HEX`, `PEG_IN_RUNTIME_EVM_CHAIN_ID`,
  `PEG_IN_RUNTIME_BRIDGE_ADDRESS`, `PEG_IN_RUNTIME_DEPLOYMENT_BLOCK`,
  `PEG_IN_RUNTIME_REQUIRED_CONFIRMATIONS`, and
  `PEG_IN_RUNTIME_MAX_EVENTS`;
- optionally `PEG_IN_RUNTIME_MAX_LIFECYCLE_ROWS` from 1 through 1,000; the
  default is 50.

The route manifest, digest, source files, origins, profile, and active daemon
deployment are one reviewed configuration unit. The manifest must match the
active MCL/vault and Ergo commit-confirmation policy; the profile must match the
operational sidechain ID and primary Frontier RPC plus the deployment-recorded
EVM chain ID, bridge H160, bridge deployment block, and Frontier confirmation
policy. Deployment records that do not retain `evmChainId` and
`bridgeDeploymentBlock` cannot activate this pass. Do not infer missing fields, reuse one origin under two labels, or
substitute EVM depth for GRANDPA finality.

Current behavior is intentionally fail-closed. The pass runs after deposit
discovery and before the first `getPendingPegIns()` call. It records one
deterministic bounded page of exact lifecycle/cache CAS holds and reports
remaining rows for later ticks. A changed joined generation revisits existing
holds and appends a newer observation without deleting the prior one. The pass always returns
`lifecycleSelectionAuthorized=false`. The daemon therefore cannot submit a
commit transaction, promote, retry, mint, or clear a hold through this path.

Stop conditions:

- `BRIDGE_BROADCAST_ENABLED` is not false or unset.
- The manifest/profile unit has not received independent review.
- Either source pair is not explicitly distinct.
- The bounded pass reports disagreement, stale lifecycle/cache CAS, deployment
  mismatch, or any recollection error.
- An operator proposes a manual hold deletion or treats a successful pass as
  native finality, mint authorization, Gate 5 closure, or production evidence.

## Runbook 1B: Trustless Settlement Candidate Evidence

Purpose: generate and validate a read-only evidence record for the candidate
trustless settlement identity path. This runbook is not a settlement dry run and
does not produce transaction-check, approval, submit, confirmation, or
reconciliation evidence.

This command exists only to prove the candidate identity wiring from local
SQLite state to a `trustless-settlement-candidate` JSON record. It is
candidate-only until aggregate settlement V2 contracts verify bridge-native
trustless burn leaves on-chain.

Prerequisites:

- A local SQLite state database already contains the peg-out burn row and the
  matching SPV tracker row.
- The peg-out row includes `sidechain_log_index`; the command uses it with the
  sidechain ID and burn transaction hash to verify the derived trustless burnId.
- Prefer an evidence-ready local proof-vector JSON target validated by
  `npm run trustless:proof-vector:validate`; the command can derive
  `recipientErgoTreeHashHex`, `amountNanoErg`, `bridgeEventRootHex`, asset ID,
  sidechain ID, burn transaction hash, and duplicate-prevention key from it.
- If a proof-vector target is not used, `recipientErgoTreeHashHex`,
  `amountNanoErg`, `bridgeEventRootHex`, sidechain ID, burn transaction hash,
  and the derived duplicate-prevention key are available from the trustless burn
  proof package under review.
- `BRIDGE_BROADCAST_ENABLED=false` or unset. This command does not need any
  broadcast setting, node URL, wallet, approval file, or signer configuration.

Command:

```bash
cd relayer
npm run trustless:candidate -- \
  --state-db bridge-state.sqlite \
  --proof-vector test-vectors/<trustless-burn-proof-vector.json> \
  --out ../evidence/trustless-candidates/<candidate.json>

# Explicit-field fallback when no proof-vector target is available:
npm run trustless:candidate -- \
  --state-db bridge-state.sqlite \
  --burn-tx <64hex> \
  --duplicate-prevention-key <derived-trustless-burn-id-64hex> \
  --bridge-event-root <64hex> \
  --recipient-ergo-tree-hash <64hex> \
  --amount-nanoerg <positive-uint64-decimal> \
  --sidechain-id-hex <64hex> \
  --out ../evidence/trustless-candidates/<candidate.json>

npm run trustless:candidate:validate -- ../evidence/trustless-candidates/<candidate.json>
```

Pass criteria:

- Output states `StateTracker mode: read-only`, `evidenceKind:
  trustless-settlement-candidate`, `broadcast: no`, and
  `contractCompatibility: candidate-only-trustless-v2-required`.
- The JSON validates with `npm run trustless:candidate:validate`.
- The JSON includes `trustlessBurnDerivation` with `sidechainIdHex`,
  `sidechainLogIndex`, and `derivedBurnIdHex`; the validator recalculates the
  burnId from those fields plus `legacySidechainTxHash`.
- The JSON includes `boundary` fields proving `gate5Closure`,
  `prebroadcastEvidence`, `settlementReadiness`,
  `testnetProductionCandidateClaim`, and `productionReadyClaim` are all `no`.
- The JSON has no `transactionCheck`, `expectedTxId`, `approval`, `command`,
  `/transactions/check`, pre-broadcast, submit, or confirmation fields.
- The duplicate-prevention key matches the trustless burnId derived from
  `sidechainIdHex`, `burnTxHash`, and the persisted `sidechain_log_index`.
- If `--proof-vector` is used, the proof vector is evidence-ready
  (`leafCount >= 2` and non-empty structured inclusion proof nodes) and remains
  the single source for proof fields.
- If `--proof-vector` is used, the JSON includes
  `sourceBindings.proofVector` with the proof-vector target, target burnId,
  bridge event root, leaf hash, leaf count, proof-node count, and local
  proof-core candidate-only boundary fields.
- The output path is a relative JSON path inside the bridge repository and is
  not a runtime database, `.env`, wallet, key, mnemonic, or secret path.

Stop conditions:

- The peg-out row is missing, lacks `sidechain_log_index`, or the SPV tracker
  identity for the burn height is missing.
- `amountNanoErg` does not match the persisted peg-out amount.
- The duplicate-prevention key equals the legacy burn transaction hash or does
  not match the derived trustless burnId.
- An operator tries to feed this candidate JSON to a new approval generator,
  historical rehearsal approval parser, or any retired aggregate submission
  path.
- Any wording treats this candidate evidence as production-ready, ready for a
  mainnet claim, transaction-ready, or sufficient for a testnet
  production-candidate claim by itself.

## Runbook 2: Deployment And Migration

Purpose: deploy or migrate bridge contracts without accidentally using the wrong
node, signer, or runtime state.

Prerequisites:

- Clean checkout checks pass: `npm run check` and `npm run wasm:test`.
- Target Ergo node URL, network, and signer address are reviewed.
- Target sidechain RPC is reviewed.
- Existing `contracts/deployed_state.json` is backed up if this is a migration.
- Broadcast is disabled until the final preflight has been reviewed.

Dry-run checks:

```bash
cd relayer
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

Legacy MCU cutover precondition:

1. Keep `inventory:legacy-mcu -- --address ...` diagnostic-only.
2. Independently review the complete historical V1 address/ErgoTree manifest
   and record the expected canonical SHA-256 of that reviewed content outside
   the manifest.
3. Run the dedicated read-only assessment before any migration or activation:

```text
npm run cutover:legacy-mcu-assess -- --manifest <manifest.json> --expected-manifest-sha256 <64-lowercase-hex> --primary-node-url <explicit-origin> --witness-node-url <distinct-origin> --json-out <new-assessment.json>
```

The non-authorizing observation classification is
`observation_condition_met_under_explicit_manifest`. Both origins must expose
synchronized address indexes, the exact same stable tip, and the manifest-bound
checkpoint inside its depth/age window. Any manifest, digest, origin, network,
checkpoint, index, pagination, box-shape, script, duplicate-ID, or any remaining
UTXO blocker keeps the legacy path quarantined. Origin inequality does not prove
independent operation. Never use this report as a cutover stop/go decision. A
separate authenticated approval must bind the manifest review and operationally
independent sources before cutover can be considered. The report does not
authorize a deployment, migration, signature, submission, or broadcast. See
[Legacy MCU Cutover Manifest V1](legacy-mcu-cutover-manifest.md).

Current deployment boundary:

- The dedicated legacy aggregate V1 deployment/funding entrypoint is removed.
- The retained generic Ergo deployment script cannot create or fund
  `SPVTracker`, aggregate DUP, or aggregate unlock V1 instances. Existing
  deployment-state fields for those contracts are immutable historical data.
- No current runbook authorizes enabling broadcast for legacy V1 or replacing
  its historical singleton lineage.
- Deploying only the EVM contracts does not create mint or payout authority.
- A live deployment procedure may be added only for a separately versioned
  external-fee profile after on-chain authority cutover, global DUP lineage,
  target-node acceptance, and independent review are complete.

Until that profile exists, `npm run check`, `npm run wasm:test`,
`npm run demo:readiness`, and `npm run status` are diagnostics only. Any
network, singleton, signer, or deployment-state mismatch keeps the route
quarantined.

Stop conditions:

- Any current command is claimed to deploy or fund legacy aggregate V1.
- Historical singleton or deployment-state identity is incomplete or disputed.
- A proposed replacement lacks external fee funding, global replay lineage,
  exact target-node acceptance, or independent review.
- Broadcast enablement is proposed before the replacement profile has a
  dedicated activation runbook.

There is no supported retry or redeployment path for legacy aggregate V1.

## Runbook 3: Broadcast Enablement

Purpose: describe the generic broadcast boundary for one controlled operator
session. It cannot authorize legacy V1 aggregate settlement: every new legacy
daemon, CLI, programmatic signing, authorization, submission, and broadcast
route is physically absent because V1 funds the miner fee from protected
backing.

Current status:

- There is no current aggregate payout profile eligible for broadcast.
- Runbook 1A provides no approval or Expected transaction ID that can be
  promoted into a live session.
- Do not set `BRIDGE_BROADCAST_ENABLED=true` for legacy V1.
- A future procedure may be written only after a separately versioned
  external-fee profile is independently reviewed, activated, accepted by the
  target node, and bound to permanent retirement of every legacy value route.

Current verification:

```bash
cd relayer
npm run demo:readiness
```

On Windows PowerShell:

```powershell
cd relayer
npm run demo:readiness
```

Pass criteria:

- Broadcast remains disabled.
- Legacy aggregate readiness remains `WARN`; enabling historical compatibility
  cannot recreate a new signing or transport path.
- No current command can sign, authorize, submit, or transport a legacy V1
  payout.
- Unsigned `prepare*` commands remain diagnostic only; legacy signed-check
  commands are absent.
- `confirm*` and recovery commands may reconcile an exact historical
  transaction already submitted before this quarantine; they cannot create,
  sign, authorize, or transport a replacement.
- A future live settlement path must use a reviewed and activated, separately
  versioned external-fee profile with legacy-route retirement. Existing
  Expected transaction IDs and approval files cannot be promoted into that
  authority.

Stop conditions:

- Broadcast policy is still `FAIL`.
- ContextExtension signing guard is `FAIL`.
- Any command or configuration is claimed to restore new legacy V1 signing,
  authorization, submission, or broadcast; those surfaces are absent.
- Node, signer, or deployment state does not match the intended environment.

Rollback:

```bash
unset BRIDGE_BROADCAST_ENABLED
npm run demo:readiness # expected to report broadcast disabled after rollback
```

PowerShell:

```powershell
Remove-Item Env:BRIDGE_BROADCAST_ENABLED
npm run demo:readiness # expected to report broadcast disabled after rollback
```

Record the post-rollback readiness output in the live rehearsal evidence. A
rehearsal cannot pass unless broadcast is disabled at both session start and
session end. A non-zero readiness exit caused by disabled broadcast is expected
at this point; any signer, node, singleton, or network mismatch is still a stop
condition.
Before using the rehearsal as claim-bearing evidence, record a distinct
`rehearsal:validate` transcript artifact containing
`npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log> --assembly-report-json <assembly-report.json> --live-preflight-json <external-fee-live-preflight.json> --post-submit-observe-json <post-submit-observe.json> --fresh-checkpoint-json <fresh-testnet-checkpoint.json> --recovery-observe-json <failed-broadcast-observe.json> --recovery-observe-json <reorg-stale-singleton-observe.json> <completed-live-rehearsal.md>`
and the `npm run rehearsal:validate` PASS output, the validator output artifact before the `validated target`
binding, and a `validated target` binding to the completed live rehearsal target.
Archived offline-gate JSON may be retained with the rehearsal history, but the
claim-bearing `release:gate` run ignores it. Historical reports should still
bind their own target and expose concrete `sourceBindings` for each upstream offline
input artifact.
The transcript must include confirmation policy met PASS,
`confirmationsRequired=<n>`, `confirmationsObserved=<n>`, observed confirmation
count greater than or equal to required confirmation count, submitted
transaction ID, and completed finality evidence.
The validation output artifact must be distinct from the completed live rehearsal target.

## Runbook 4: Daemon Startup

Purpose: start the daemon only after startup gates pass.

Prerequisites:

- Dry-run readiness complete.
- Broadcast enabled only if this is an intentional live session.
- `AGGREGATE_SETTLEMENT_ENABLED=true` enables only historical
  confirmation/recovery compatibility and fail-closed burn holding. It does not
  enable new legacy V1 signing, authorization, submission, or broadcast.
- No unresolved stop condition from `npm run status`.

Approval file shape:

```json
{
  "version": 2,
  "createdAt": "2026-05-17T00:00:00Z",
  "environment": "testnet",
  "ergoNodeNetwork": "testnet",
  "ergoNodeUrl": "http://127.0.0.1:9052",
  "sidechainNetwork": "patched-devnet",
  "sidechainRpcUrl": "http://127.0.0.1:9945",
  "sidechainWsUrl": "ws://127.0.0.1:9945",
  "deployedStateHash": "<32-byte-hex-canonical-deployed-state-hash>",
  "approvals": [
    {
      "mode": "single",
      "burnTxHash": "<32-byte-hex-burn>",
      "expectedTxId": "<32-byte-hex-expected-tx-id>",
      "approvedAt": "2026-05-17T00:00:00Z",
      "expiresAt": "2026-05-17T01:00:00Z",
      "evidence": "artifact://approvals/check-and-approval-evidence.json",
      "checkCommand": "<archived removed V1 check command>",
      "checkEvidence": "artifact://approvals/transactions-check-output.log",
      "checkEvidenceJson": "aggregate-check-single.json"
    },
    {
      "mode": "single-with-ingest",
      "burnTxHash": "<32-byte-hex-burn>",
      "expectedTxId": "<32-byte-hex-expected-tx-id>",
      "approvedAt": "2026-05-17T00:00:00Z",
      "expiresAt": "2026-05-17T01:00:00Z",
      "evidence": "artifact://approvals/check-and-approval-evidence.json",
      "checkCommand": "<archived removed V1 check-with-ingest command>",
      "checkEvidence": "artifact://approvals/transactions-check-with-ingest-output.log",
      "checkEvidenceJson": "aggregate-check-with-ingest.json"
    },
    {
      "mode": "batch",
      "burnTxHashes": ["<32-byte-hex-burn-a>", "<32-byte-hex-burn-b>"],
      "expectedTxId": "<32-byte-hex-expected-tx-id>",
      "approvedAt": "2026-05-17T00:00:00Z",
      "expiresAt": "2026-05-17T01:00:00Z",
      "evidence": "artifact://approvals/check-and-approval-evidence.json",
      "checkCommand": "<archived removed V1 check-batch command>",
      "checkEvidence": "artifact://approvals/batch-transactions-check-output.log",
      "checkEvidenceJson": "aggregate-check-batch.json"
    }
  ]
}
```

This approval schema is retained for historical compatibility only; it cannot
authorize a new V1 submission. No approval generator exists. The placeholders
above stand for immutable command strings already recorded in old evidence and
are not executable instructions. Batch `burnTxHashes`
are order-sensitive because payout ordering affects the
transaction ID. Do not reuse a batch approval for a reordered or partial batch,
and do not treat a batch or single-claim `check` as submit authority.
An archived approval file must be non-empty and preserve its original
non-mainnet network, node, deployment-state hash, burn ordering, check evidence,
and approval window metadata. Expired, template, targetless,
broadcast-capable, context-mismatched, or mainnet-scoped files remain invalid
historical evidence. They are never daemon startup inputs or current authority.

Commands:

```bash
cd relayer
npm run daemon
```

Expected startup behavior:

- The daemon prints `Broadcast policy`.
- The standalone readiness report classifies legacy settlement as `WARN`.
- The daemon cannot compose a new legacy settlement transport regardless of
  configuration or historical approval evidence.

Stop conditions:

- Any runtime surface unexpectedly exposes new legacy signing or transport.
- Daemon reports missing singleton NFTs.
- Daemon detects reorg recovery actions that require operator review.

Verification:

```bash
npm run status
```

## Runbook 5: Settlement Failure Triage

Purpose: classify failed or stuck peg-out processing before retrying.

Inputs to inspect:

- `npm run status` output.
- Burn transaction hash.
- Peg-out status in SQLite via existing status tooling.
- Ergo node mempool and transaction lookup.
- Sidechain burn receipt existence.

Commands:

```bash
cd relayer
npm run status
npm run retry -- --peg-out
npm run settle:aggregate:recover -- scan --json
```

Aggregate settlement journal recovery:

Use this only for journaled aggregate settlement attempts. This is local
recovery triage; it does not authorize broadcast, does not close release gates,
and does not support any mainnet or production-ready claim.

When a recovery witness URL is configured, the daemon and recovery command
also require four 32-byte identity digests:
`ERGO_AGGREGATE_SETTLEMENT_PRIMARY_IDENTITY_DIGEST`,
`ERGO_AGGREGATE_SETTLEMENT_PRIMARY_ADMINISTRATION_DIGEST`,
`ERGO_AGGREGATE_SETTLEMENT_WITNESS_IDENTITY_DIGEST`, and
`ERGO_AGGREGATE_SETTLEMENT_WITNESS_ADMINISTRATION_DIGEST`. The primary and
witness node identities must differ, and their administration identities must
differ. These are reviewed configuration pins; they prevent endpoint aliases
from being counted as two declared sources, but do not cryptographically prove
physical independence or globally canonical consensus.

1. Stop the daemon, keep `BRIDGE_BROADCAST_ENABLED=false` or unset, and
   preserve the Expected transaction ID, submitted transaction ID if present,
   burn hashes, current heights, and command logs.
2. Run `npm run status`, then
   `npm run settle:aggregate:recover -- scan --json`.
3. If `scan` reports `confirmedChain=true`, run
   `npm run settle:aggregate:recover -- apply --json`, then rerun
   `npm run status`. Continue only with canonical confirmation and
   reconciliation evidence. In plain scan output this appears as
   `confirmed=yes`.
4. If `scan` reports `confirmedChain=false` and `mempool=true`, do not abandon,
   retry, or edit SQLite. Wait for the mempool outcome and rescan.
5. If `scan` reports `confirmedChain=false` and `mempool=false`, first confirm
   node RPC health, no recipient payout, no committed DUP/AVL key, no settlement
   successor output, and no sidechain burn reorg ambiguity. In plain scan output
   this appears as `confirmed=no` and `mempool=no`. Only then run
   `npm run settle:aggregate:recover -- abandon <expectedTxId> --json`. The first
   matching two-source absence only records evidence and returns
   `outcome=evidence_recorded`. Wait at least the bound recovery confirmation window,
   rescan, and run the same `abandon` command again. The second call retires a
   submitted attempt or an ambiguous pending transport reservation only when
   both sources still identify the first observation tip as canonical and
   returns `outcome=retired`. If the retirement committed but the command lost
   its response, the retry returns `outcome=already_retired` without another
   network observation. Follow either terminal outcome with `npm run status`.
6. After `outcome=retired` or `outcome=already_retired`, do not rebuild, sign,
   check, or resubmit a V1 payout. Keep the burn held and continue only through
   a separately versioned, activated external-fee replacement profile.

Use retry only when:

- The burn still exists on the sidechain.
- No DUP key was committed for a failed settlement.
- No successful settlement transaction already paid the recipient.
- The failure was a transient node, liquidity, or mempool issue.
- Aggregate recovery `scan` restored the exact already-submitted historical
  attempt with `apply`; absence retirement does not authorize a replacement V1
  transaction.

Do not retry when:

- The burn was reorged out.
- A DUP key is already committed and the payout is confirmed.
- The settlement transaction is ambiguous and needs manual reconciliation.
- A pending transport reservation has not yet returned `outcome=retired` or
  `outcome=already_retired` after
  the two-observation canonical-descendant absence procedure.
- Aggregate recovery `abandon` refuses because the transaction is confirmed,
  present in mempool, already represented in AVL history, mismatched to the
  submitted transaction ID, missing a peg-out row, or part of an incompatible
  batch state.
- The failure indicates malformed proof, stale AVL digest, or wrong deployment
  state.

Stop conditions:

- Chain canonicality cannot be proven from available node RPCs.
- The same burn may already have produced a recipient payout.
- DUP state, SPV tracker state, and settlement output state disagree.
- Retry would require manual SQLite edits before chain-state classification is
  complete.
- Any operator proposes running `abandon` without a `scan` row showing
  `confirmed=no` and `mempool=no`.

Verification after retry:

- `npm run status` shows forward progress.
- No duplicate payout exists for the same burn hash.
- If a settlement transaction confirmed, local state records the DUP key only
  after confirmation/reconciliation.

## Runbook 6: Reorg Recovery

Purpose: recover from Ergo or sidechain reorgs without creating phantom AVL
history or duplicate payouts.

Automatic defenses already present:

- Sidechain burn revalidation before Phase 2.
- Startup reconciliation for reorged Phase 1 artifacts.
- Persisted anchor validation that clears only on positive absence of the
  expected root.
- DUP key purge/reset helpers for reorged Phase 1 transactions.

Operator procedure:

```bash
cd relayer
npm run status
```

If a sidechain burn was reorged out:

- Do not retry the peg-out.
- Confirm the burn receipt is absent.
- Keep or mark the event in a non-paying terminal state.

If an Ergo settlement or Phase 1 transaction was reorged out:

- Confirm the transaction is no longer canonical.
- Confirm the output box is not present in UTXO set.
- Let daemon reconciliation purge phantom local artifacts.
- Re-run `npm run status`.

Offline evidence row assembly:

- After the failed-broadcast drill has a completed `rehearsal:validate`
  transcript, capture a read-only node/SQLite observation with
  `npm run rehearsal:recovery-observe -- --kind failed-broadcast-phantom-avl --expected-tx-id <64hex> --peg-out-burn-tx-id <64hex> [--node-url <http://...>] [--state-db <bridge-state.sqlite>] --json-out ../evidence/live-rehearsals/<failed-broadcast-observe>.json`.
  Validate the structured JSON before using it as row evidence:
  `npm run rehearsal:recovery-observe:validate -- --kind failed-broadcast-phantom-avl ../evidence/live-rehearsals/<failed-broadcast-observe>.json`.
  Then assemble the lifecycle row with
  `npm run rehearsal:recovery-drill -- --kind failed-broadcast-phantom-avl --evidence-artifact <artifact://.../failed-broadcast-phantom-avl.md> --validation-artifact <artifact://.../rehearsal-validate.log> --observation-artifact <artifact://.../failed-broadcast-observe.json> --observation-json ../evidence/live-rehearsals/<failed-broadcast-observe>.json --expected-tx-id <64hex> --peg-out-burn-tx-id <64hex> --out ../evidence/live-rehearsals/<failed-broadcast-row>.md --json-out ../evidence/live-rehearsals/<failed-broadcast-row>.json`.
  The validation artifact must identify rehearsal validation evidence, not a
  generic review note. The observation artifact must be the structured
  read-only recovery observation report. The row must bind
  `recovery-observe JSON validation PASS` to that completed observation
  artifact, not to a prose note. The JSON report must include `sourceBindings`
  for the live read-only node and the read-only state tracker, and must state
  that the runtime database path was not serialized. `release:gate` consumes
  the same structured JSON and rejects reduced summaries that omit the
  observation boundary, source bindings, `pegOutBurnTxId`, or failed-broadcast
  `expectedTxId`.
- After the reorg/stale-singleton drill has a completed validation or test
  artifact, capture a read-only observation with
  `npm run rehearsal:recovery-observe -- --kind reorged-burn-stale-singleton --peg-out-burn-tx-id <64hex> --singleton-inventory-id <64hex> [--node-url <http://...>] [--state-db <bridge-state.sqlite>] --json-out ../evidence/live-rehearsals/<reorg-stale-singleton-observe>.json`.
  Validate the structured JSON before using it as row evidence:
  `npm run rehearsal:recovery-observe:validate -- --kind reorged-burn-stale-singleton ../evidence/live-rehearsals/<reorg-stale-singleton-observe>.json`.
  Then assemble the lifecycle row with
  `npm run rehearsal:recovery-drill -- --kind reorged-burn-stale-singleton --evidence-artifact <artifact://.../reorg-stale-singleton.md> --validation-artifact <artifact://.../rehearsal-validate-or-test.log> --observation-artifact <artifact://.../reorg-stale-singleton-observe.json> --observation-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe>.json --peg-out-burn-tx-id <64hex> --singleton-inventory-id <64hex> --out ../evidence/live-rehearsals/<reorg-stale-singleton-row>.md --json-out ../evidence/live-rehearsals/<reorg-stale-singleton-row>.json`.
  The validation artifact must identify rehearsal validation or test evidence,
  not a generic review note. The observation artifact must show structured
  recovery observation PASS evidence. The row must bind
  `recovery-observe JSON validation PASS` to that completed observation
  artifact. The JSON report must include `sourceBindings` for the live
  read-only node and the read-only state tracker, and must state that the
  runtime database path was not serialized. `release:gate` consumes the same
  structured JSON and rejects reduced summaries that omit the observation
  boundary, source bindings, `pegOutBurnTxId`, or reorg/stale-singleton
  `singletonInventoryId`.
- This helper only assembles offline evidence rows. It does not run the drill,
  mutate SQLite/AVL state, authorize broadcast, or close Gate 3 by itself. The
  observation helper reads the Ergo node and SQLite state only through read-only
  clients, and it does not sign, submit, repair, reconcile, or mutate state.
  The row-assembly JSON report exposes `recoveryBoundary` so reviewers can verify
  that signing, node query, live submit, confirmation, reconciliation, broadcast
  authorization, Gate 3 closure, and production/testnet production-candidate
  claim fields all remain false. The observation JSON report exposes
  `observationBoundary`, where node/state reads may be true but signing,
  broadcast, submit, repair, state mutation, reconciliation, Gate 3 closure, and
  claim escalation must all remain false.
  Recovery row evidence, validation, and observation artifact targets must be
  concrete and distinct: `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` are placeholders, not completed
  recovery drill targets.

Stop conditions:

- Node RPC is unavailable, so canonicality cannot be proven.
- Local state and chain state disagree after reconciliation.
- Any recipient payout may have occurred while DUP key state is unclear.

## Runbook 7: Pause And Resume

Purpose: stop new bridge actions without corrupting state.

Soft pause:

- Stop the daemon process.
- Leave broadcast disabled for any follow-up inspection.
- Keep nodes running if they are needed for chain-state queries.

Resume:

```bash
cd relayer
npm run check
npm run demo:readiness
npm run status
npm run daemon
```

Stop conditions:

- Readiness gates changed since pause.
- Reorg reconciliation reports unresolved changes.
- Failed events require manual review before retry.

## Runbook 8: Key Rotation

Current status: full committee/key-rotation operations are not governance-ready
and cannot support any testnet production-candidate claim until the governance
track and the global release gate are complete.

Evidence template:

- [Committee Governance Evidence Template](committee-governance-evidence-template.md)
- Validate a completed evidence copy with `npm run governance:validate` before
  treating the drill as release evidence.

Minimum staging procedure:

- Treat any signer replacement as a deployment/migration event.
- Recompile contracts that encode signer or singleton assumptions.
- Redeploy affected singleton contracts.
- Verify singleton NFT preservation or migration plan.
- Re-run full dry-run readiness and lifecycle tests.

Verification:

```bash
cd relayer
npm run check
npm run demo:readiness
npm run status
```

Stop conditions:

- Any contract has a stale committee register.
- MCU references an SCS NFT ID from an older deployment.
- The old signer can still mutate signer-gated state unexpectedly.

## Runbook 9: Storage-Rent And Liquidity Maintenance

Purpose: keep bridge boxes spendable and liquidity boxes available.

Checks:

```bash
cd relayer
npm run status
```

Operator checks:

- Singleton boxes maintain minimum value for storage rent.
- Unlock contracts have pure-ERG boxes sufficient for expected payouts.
- Liquidity boxes do not carry unrelated tokens.
- Miner fee assumptions are still valid for the target network.

Stop conditions:

- A singleton box is below rent-safe value.
- Liquidity is fragmented into boxes too small for expected payouts.
- Unlock boxes contain assets that settlement builders intentionally ignore.

## Runbook 10: Incident Response

Trigger this runbook for any suspected duplicate payout, stuck settlement,
unexpected signer behavior, node mismatch, reorg ambiguity, or invariant break.

Immediate actions:

1. Stop the daemon.
2. Disable broadcast in all shells.
3. Preserve logs and command output.
4. Record current chain heights and relevant transaction IDs.
5. Run read-only status/preflight commands only.

Read-only commands:

```bash
cd relayer
npm run status
npm run demo:readiness
npm run backup:snapshot -- ./bridge-state.sqlite
```

Classification checklist:

- Duplicate payout or DUP ambiguity: confirm whether a recipient payout,
  committed DUP key, or ambiguous settlement transaction already exists.
- Signer or broadcast policy anomaly: confirm signer address, node target,
  ContextExtension guard status, and broadcast enablement before any retry.
- Node or network mismatch: confirm Ergo node URL, network, deployed state, and
  sidechain RPC all point to the intended environment.
- Ergo or sidechain reorg ambiguity: prove canonicality before mutating local
  state, retrying, or marking a burn terminal.
- Anchor or SPV tracker mismatch: compare the persisted anchor, extension root,
  tracker AVL digest, and sidechain block hash before clearing state.
- Singleton invariant break: classify every affected singleton NFT, script,
  register, value, and output box before redeploying.
- Liquidity or storage-rent break: verify unlock-box value, token cleanliness,
  miner-fee assumptions, and rent-safe singleton values.
- Dependency or serializer regression: stop publication work and rerun clean
  checkout checks, `npm run wasm:test`, and node conformance validation before
  signing or broadcasting again.

Do not:

- Retry failed events until classification is complete.
- Edit SQLite before canonical chain state is known.
- Redeploy contracts as a first response.
- Move funds unless the emergency procedure has been reviewed.

Stop conditions:

- Any canonical chain-state query is unavailable.
- A duplicate payout, signer compromise, or singleton invariant break is
  suspected but not classified.
- Required logs or transaction IDs cannot be preserved.
- Operators disagree on whether broadcast is fully disabled.

Exit criteria:

- Root cause is documented.
- Chain state and local state are reconciled.
- A regression test or runbook update is added for the incident class.
- Broadcast remains disabled until checks are green again.

## Runbook 11: Monitoring And Alerting

Purpose: detect unsafe bridge conditions before they require manual incident
response.

Minimum polling commands:

```bash
cd relayer
npm run status
npm run demo:readiness
```

Alert classes:

- Daemon liveness: daemon process stopped, restart loop, or startup gate exits.
- Broadcast policy: live process has unexpected `BRIDGE_BROADCAST_ENABLED`
  state for the intended operating mode.
- Signer and ContextExtension guard: signer target, network, or
  ContextExtension threshold becomes unsafe.
- DUP and settlement reconciliation: failed events, ambiguous settlements,
  duplicate-payout risk, or confirmation-time reconciliation gaps.
- SPV tracker and anchor health: persisted anchor mismatch, missing extension
  root, stale sidechain height, or unexpected tracker AVL digest.
- Singleton integrity: missing singleton NFT, script mismatch, register drift,
  value below minimum policy, or stale deployment state.
- Liquidity and storage rent: insufficient pure-ERG unlock liquidity,
  fragmented liquidity boxes, unrelated tokens, or rent-unsafe singleton boxes.
- Dependency and clean-checkout drift: CI failure, `npm run check` failure,
  `npm run wasm:test` failure, or dependency update without review.

### Static Operator-Health Action Catalogue

The alert-delivery layer exposes only the following reviewed references. Each
entry is keyed by an exact `OperatorHealthReason`; the reference is inert and
has no callback, shell command, approval, or capability attached to it. Looking
up an entry cannot clear a hold, acknowledge an incident, rewrite lifecycle
state, invoke a checker or signer, reserve transport, submit, or broadcast.
Operators must re-establish the prerequisites and stop conditions in the linked
runbook before taking any action.

| `OperatorHealthReason` | Reviewed diagnostic route |
|---|---|
| `persistence_unavailable` | [Runbook 12](#runbook-12-sqlite-and-avl-backup-restore), then [Runbook 10](#runbook-10-incident-response) if availability or state integrity is unclear |
| `operator_clock_rollback` | [Runbook 10](#runbook-10-incident-response); preserve timestamps and keep broadcast disabled while classifying the clock discontinuity |
| `signer_unavailable` | [Runbook 5](#runbook-5-settlement-failure-triage), escalating to [Runbook 10](#runbook-10-incident-response) for unexpected signer behavior |
| `read_quorum_held` | [Runbook 10](#runbook-10-incident-response), with [Runbook 6](#runbook-6-reorg-recovery) when the disagreement may be reorg-related |
| `read_quorum_stale` | [Runbook 10](#runbook-10-incident-response), with [Runbook 6](#runbook-6-reorg-recovery) before treating chain state as current |
| `funds_release_held` | [Runbook 10](#runbook-10-incident-response); the alert path cannot release the hold |
| `solvency_deficit` | [Runbook 9](#runbook-9-storage-rent-and-liquidity-maintenance), then [Runbook 10](#runbook-10-incident-response) before any funds movement |
| `solvency_unavailable` | [Runbook 10](#runbook-10-incident-response); do not infer solvency from a missing observation |
| `solvency_stale` | [Runbook 10](#runbook-10-incident-response); obtain a current read-only observation before classification |
| `commitment_unavailable` | [Runbook 5](#runbook-5-settlement-failure-triage), escalating to [Runbook 10](#runbook-10-incident-response) when commitment identity is uncertain |
| `commitment_stale` | [Runbook 5](#runbook-5-settlement-failure-triage), with [Runbook 6](#runbook-6-reorg-recovery) when canonicality may have changed |
| `commitment_lagging` | [Runbook 5](#runbook-5-settlement-failure-triage); keep settlement non-authorizing until current commitment evidence exists |
| `finality_unavailable` | [Runbook 5](#runbook-5-settlement-failure-triage), then [Runbook 10](#runbook-10-incident-response) if source finality cannot be classified |
| `finality_stale` | [Runbook 6](#runbook-6-reorg-recovery), escalating to [Runbook 10](#runbook-10-incident-response) if canonicality remains ambiguous |
| `finality_lagging` | [Runbook 5](#runbook-5-settlement-failure-triage); do not substitute confirmation age or alert delivery for finality evidence |
| `reorg_reconciliation_pending` | [Runbook 6](#runbook-6-reorg-recovery); do not retry or clear state while reconciliation is pending |
| `reorg_quarantine_present` | [Runbook 6](#runbook-6-reorg-recovery), then [Runbook 10](#runbook-10-incident-response) before any manual state change |
| `settlement_stalled` | [Runbook 5](#runbook-5-settlement-failure-triage), escalating to [Runbook 10](#runbook-10-incident-response) when the outcome is ambiguous |

The config-free local drill for this mapping and delivery lifecycle is:

```bash
cd relayer
npm run operator:drill:alerts
```

It covers stable condition identity, distinct occurrence identity, ordered
incident-before-recovery delivery, deduplication, injected delivery failure,
retry, SQLite close/reopen, and stale/recovered health transitions. The daemon
enqueues the immutable alert and writes its local structured-log sink. The
separately invoked `operator:alerts:worker` performs bounded external delivery,
and `operator:alerts:acknowledge` verifies one exact signed acknowledgement.
This drill does not establish delivery to a reviewed real target, credential or
key custody, real operator acknowledgement, or live recovery evidence.

Stop conditions:

- Any alert class is red and cannot be explained by planned maintenance.
- Status and readiness outputs disagree on singleton, signer, or broadcast
  safety.
- Monitoring cannot query the Ergo node, sidechain RPC, or local state.
- A metric indicates possible recipient overpayment, duplicate settlement, or
  chain-state ambiguity.

Escalation:

- Disable broadcast before any retry or manual state change.
- Move to Runbook 10 when an alert is confirmed or cannot be classified from
  read-only commands.
- Preserve command output and chain heights for the incident record.

## Runbook 12: SQLite And AVL Backup Restore

Purpose: preserve and restore local lifecycle state without losing the DUP AVL
history, SPV tracker history, persisted anchors, or pending reconciliation rows
needed for proof generation.

Use this runbook before patched-devnet rehearsals, before deployment-state
migrations, and after any host or disk incident that may have affected
`relayer/bridge-state.sqlite`.

Prerequisites:

- Stop the daemon.
- Disable broadcast in all shells.
- Run read-only status checks before taking a backup.
- Confirm no operator is manually editing SQLite.
- Keep `.env`, mnemonics, and signing secret material out of the backup archive.

Pre-backup verification:

```bash
cd relayer
npm run status
npm run demo:readiness
```

PowerShell backup commands:

```powershell
New-Item -ItemType Directory -Force ".runtime-backups" | Out-Null
Copy-Item -LiteralPath "relayer/bridge-state.sqlite" -Destination ".runtime-backups/bridge-state.sqlite.bak" -Force
Copy-Item -LiteralPath "relayer/bridge-state.sqlite-wal" -Destination ".runtime-backups/bridge-state.sqlite-wal.bak" -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath "relayer/bridge-state.sqlite-shm" -Destination ".runtime-backups/bridge-state.sqlite-shm.bak" -Force -ErrorAction SilentlyContinue
```

Restore procedure:

1. Stop the daemon again and keep broadcast disabled.
2. Preserve the suspect runtime files under a separate timestamped name.
3. Restore into an isolated database first, or document reviewer approval
   before touching live runtime files.
4. Restore the `.sqlite`, `.sqlite-wal`, and `.sqlite-shm` files as a matched
   set when WAL files exist in the backup.
5. Run status checks before restarting any daemon.
6. Compare restored DUP and SPV history counts with the pre-backup record.
7. If an on-chain singleton digest disagrees with rebuilt local history, move
   to Runbook 10 and classify the mismatch before retrying or editing SQLite.

PowerShell restore commands:

For evidence drills, replace the destination paths below with isolated restore
paths unless reviewer approval for a runtime restore is linked.

```powershell
Copy-Item -LiteralPath ".runtime-backups/bridge-state.sqlite.bak" -Destination "relayer/bridge-state.sqlite" -Force
Copy-Item -LiteralPath ".runtime-backups/bridge-state.sqlite-wal.bak" -Destination "relayer/bridge-state.sqlite-wal" -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath ".runtime-backups/bridge-state.sqlite-shm.bak" -Destination "relayer/bridge-state.sqlite-shm" -Force -ErrorAction SilentlyContinue
```

Post-restore verification:

```bash
cd relayer
npm run status
npm run demo:readiness
npm run backup:snapshot -- ./bridge-state.sqlite
npm run backup:compare -- ../evidence/recovery/pre-backup-snapshot.json ../evidence/recovery/restored-snapshot.json
npm run wasm:test
git diff --check
git status --short
```

Evidence capture:

- Fill [Backup Restore Evidence Template](backup-restore-evidence-template.md)
  with command artifacts, state comparisons, stop-condition classifications,
  and reviewer sign-off.
- For every State Consistency Checks row, make the linked artifact or note name
  the exact signal measured: peg-out status counts, pending reconciliation
  rows, DUP/SPV history counts, rebuilt digests, persisted anchor heights,
  pending DUP heartbeats, singleton comparison or incident classification, and
  runtime artifact hygiene.
- Use `npm run backup:snapshot -- <sqlite-path>` before backup and after
  isolated restore to produce the local SQLite values for the evidence table.
  Treat it as local-only evidence; it does not replace comparison against
  current on-chain singleton boxes or incident classification.
- Use `npm run backup:compare -- <pre-snapshot.json> <restored-snapshot.json>`
  to produce the local snapshot comparison artifact. Any blocked comparison row
  is a stop condition before daemon restart. The Required Commands evidence row
  for `Compare pre-backup and restored state` must link completed
  `npm run backup:compare` output. The two snapshot targets must be distinct
  JSON artifacts, and the restored snapshot `generatedAt` timestamp must be
  after the pre-backup snapshot `generatedAt` timestamp; comparing the same
  snapshot target or cloned snapshot timestamp on both sides is blocked even
  when all local state rows match.
- Keep comparison snapshots under an evidence path such as
  `../evidence/recovery/`. The comparator rejects `.runtime-backups/` and
  `.devnet-backups/` snapshot targets because those directories are local
  runtime backup surfaces, not release evidence locations.
- The comparison also rejects forged or hand-trimmed snapshot JSON that lacks
  `backup:snapshot` metadata (`schemaVersion`, `databaseLabel`, `evidenceRows`,
  and `notes`), measured snapshot value formats, or required `evidenceRows`
  entries that do not match their measured `stateConsistencyValues`.
- The comparison output records its own `schemaVersion` plus the
  `snapshotSchemaVersions` observed on both inputs; cite this in the comparison
  command evidence before linking Gate 3 backup-restore evidence.
- Local SQLite State Consistency Checks rows must link the completed
  `npm run backup:compare` local snapshot comparison output. Keep singleton
  digest comparisons and runtime artifact hygiene on separate evidence, because
  they are not proven by local snapshot comparison alone.
- DUP singleton and SPV tracker singleton comparison rows must be separate.
  Each must include a concrete 32-byte singleton ID or 33-byte digest match, or
  an incident classification. A narrative statement such as "singleton digest
  matched" is not enough.
- The `Git hygiene scan` evidence row must link completed `git status --short`
  output, completed `git diff --check` output, and a no-staged-runtime-artifacts
  result; a generic git hygiene artifact does not close the row.
- Validate the completed copy before linking it as release evidence:

```bash
cd relayer
npm run backup:validate -- ../evidence/recovery/<completed-backup-restore-evidence>.md
```

Acceptance criteria:

- `npm run status` opens the restored database without migration errors.
- Peg-out status counts match the pre-backup evidence.
- DUP history count and SPV tracker history count match the pre-backup
  evidence.
- State comparison evidence identifies the specific restored signal; generic
  restore artifacts cannot close the row.
- Rebuilt DUP and SPV tracker digest evidence uses 33-byte AVL hex digests.
- Rebuilt local DUP and SPV tracker digests are each compared against their
  current singleton boxes, or each mismatch is classified as an incident before
  restart.
- Restore target is isolated, or completed reviewer approval evidence and
  rollback plan evidence for the runtime target are linked in the Backup
  Restore Evidence Template.
- Live, runtime, production, or relayer-database targets require completed
  reviewer approval and rollback evidence even when they are described as
  isolated restore targets.
- No `.env`, SQLite backup, WAL file, or diagnostic artifact is staged.

Stop conditions:

- The backup was taken while the daemon was running and the WAL files were not
  copied as a matched set.
- The restored database opens but local DUP or SPV history does not match the
  on-chain singleton digests.
- A pending settlement may already have paid the recipient.
- Any operator proposes editing SQLite before chain-state classification is
  complete.
- `git status --short` shows runtime backup files staged or ready to stage.
