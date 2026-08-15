# Ultimate Bridge Roadmap

This roadmap turns the ultimate objective into executable engineering gates.
It supersedes any short-term plan that treats the bridge as publishable merely
because a local patched-devnet flow passed.

The bridge is not public-release ready until every required gate below is green.
Work can proceed in parallel, but publication cannot skip gates.

Day-to-day execution is governed by the outcome-based
[Bridge Execution Plan](../phases/bridge-execution-plan.md). This roadmap defines
release gates; it must not be used to choose evidence work ahead of the active
implementation package.

## Release Philosophy

The project advances in three levels:

1. **Validated PoC**: the bridge works in controlled local/testnet conditions.
2. **Institutional reference**: a serious external team can reproduce, audit,
   operate, and adapt the bridge from the repository alone.
3. **Testnet production candidate**: trust assumptions, operator controls,
   monitoring, governance, performance, and audits are strong enough for
   high-value testnet operation.

The current branch is moving from level 1 toward level 2. It is not level 3.
Mainnet production-ready claims are forbidden. Future production-candidate
wording must be explicitly testnet-scoped, for example `testnet
production-candidate` or `production-grade testnet`, and must be backed by the
completed release evidence package with checked publication blockers.
`production deployment candidate` is a release-level classification, not public
claim wording; public claims must use the controlled `testnet
production-candidate` or `production-grade testnet` wording after evidence is
complete.

## Current Blocking Facts

- The active peg-in flow mints sERG before consuming the refundable MCL box.
  After 10,000 Ergo blocks, the depositor can recover ERG while retaining the
  minted sERG. The deposit must transition into a confirmed non-refundable
  settlement vault before mint.
- The legacy MCU remains permissionlessly spendable from stale SCS height or
  elapsed Ergo time after a sidechain burn reorg. Local `burn_reverted` state
  cannot prevent a third-party box spend; the path must fail closed or remain
  committee-authorized until Gate 5 proof acceptance exists.
- Patched-devnet aggregate settlement has passed `/transactions/check`.
- Default production/testnet settlement signing remains guarded because
  upstream sigma-rust/JVM ContextExtension serialization conformance is not yet
  released.
- The bridge still has transitional trusted-oracle assumptions until the
  SPV/merged-mining commitment path is complete.
- Exchange-grade publication requires runbooks, threat model refresh,
  adversarial testing, benchmarks, and independent review.

## Track 0 -- Reproducibility And Hygiene

**Goal:** a clean checkout can validate the code without private machine state.

Required gates:

- `npm ci` works from `ergo-sidechain-bridge/relayer`.
- WASM AVL builds from tracked sources and published dependencies.
- Rust WASM tests pass.
- TypeScript builds.
- Relayer test suite passes.
- CI runs the same checks.
- No local SQLite, deployment state, devnet runtime files, diagnostic scripts,
  signing secrets, or personal paths are required or staged.

Done when:

- CI is green on a fresh clone.
- A contributor can run one documented command to execute the full local gate.

Current status:

- Mostly implemented on `codex/bridge-prod-readiness`.
- Publication hygiene now has a test gate for local identity markers, local
  diagnostic-secret markers, and required `.gitignore` exclusions.
- Publication hygiene now rejects unqualified public readiness or absolute
  security claims in README/docs while the release gates remain incomplete.
- Publication hygiene now checks README/docs `npm run ...` references against
  `relayer/package.json` so operator-facing commands cannot silently go stale.
- Publication hygiene also verifies that `tsx` entrypoints referenced by
  `relayer/package.json` exist in the checkout.
- Publication hygiene verifies internal README/docs Markdown links so release
  evidence references cannot silently point to missing files.
- GitHub Actions now runs the clean-checkout relayer gate with `npm ci`,
  `npm run check`, and `npm run wasm:test`; the workflow contents are covered by
  the publication hygiene test.
- Clean-checkout CI evidence now has a dedicated capture template in
  `docs/clean-checkout-evidence-template.md` and an executable validator, so
  Gate 1 cannot be closed by a narrative CI note without linked command,
  workflow, hygiene-scan, and `Release gate structural issues = 0` evidence.
- The clean-checkout validator now requires exact expected results for
  install/check, release-gate, hygiene-scan, and worktree-status command rows,
  command-specific output evidence for every command row, plus
  publication-blocking impact text for staged runtime state, local path/secret
  markers, and `Release gate structural issues = 0`.
- Clean-checkout reproducibility decisions now require linked evidence to cite
  the checked signal, so generic CI review logs cannot satisfy lockfile,
  WASM/AVL, TypeScript, relayer-test, Rust WASM, runtime-state, secret-scan, or
  release-gate structural checks.
- Clean-checkout reviewer sign-off notes now require concrete CI or
  reproducibility outcomes tied to workflow configuration, install/build/test
  commands, WASM/wasm-pack, `Release gate structural issues = 0`, hygiene scans,
  runtime state, worktree status, final branch commit identity, or
  reproducibility; generic clean-checkout review notes cannot pass.
- Clean-checkout CI reviewer sign-off now must match the `Reviewer` identity in
  Run Classification, so a different approver cannot close Gate 1 after the
  final-branch reviewer is named.
- Clean-checkout sign-off dates now must use ISO calendar dates, and the CI
  reviewer sign-off date is not before run classification Date, preventing a
  pre-run approval from closing Gate 1.
- Clean-checkout reviewer decision summaries now must mention release support,
  clean checkout CI green, production-ready claim handling, testnet
  production-candidate claim handling, and release gate structural issues, so a
  generic clean-checkout approval cannot close Gate 1.
- Gate 1 release-gate binding now applies the shared reviewer decision summary
  claim-boundary check to clean-checkout publication decisions, so a reviewer
  summary that blocks testnet production-candidate wording cannot contradict a
  structured `Testnet production-candidate claim allowed = yes`.
- Gate 1 clean-checkout reviewer rows now apply claim and CI boundary checks to
  reviewer notes, so an actionable note that approves production-ready/mainnet
  wording, failed CI, or non-zero structural issues cannot close Gate 1.
- Gate 1 clean-checkout reviewer notes now also fail closed on failed validator
  or command markers, so `clean checkout CI green` cannot mask `ERROR`,
  non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.
- Clean-checkout production deployment candidate support now requires
  `Testnet production-candidate claim allowed = yes`, while
  `Production-ready claim allowed` remains `no`; Gate 1 clean-checkout evidence
  cannot imply mainnet production readiness.

## Track 1 -- Signer And Broadcast Safety

**Goal:** the bridge cannot accidentally sign or broadcast in a known unsafe
mode.

Required gates:

- Production code never calls node-wallet signing endpoints.
- Production and deployment code never imports or instantiates Fleet Prover for
  bridge settlement signing; `ergo-lib-wasm-nodejs` remains the canonical local
  WASM signer.
- ContextExtension guard remains fail-closed until upstream signer consensus is
  available.
- Daemon startup/preflight reports live settlement readiness before any
  settlement loop can run.
- Broadcast paths are explicit and covered by tests.
- Diagnostic-only signing tools are ignored, documented, and impossible to
  confuse with production paths.

Done when:

- Starting the daemon in unsafe live-settlement conditions fails early with a
  clear operator message.
- Tests prove the guarded and patched-loopback paths cannot be confused.

Current status:

- Guard exists; daemon startup now fails closed when enabled live settlement paths
  exceed the active ContextExtension signing threshold.
- Broadcast is now opt-in: signer submission and daemon startup both refuse to
  continue unless `BRIDGE_BROADCAST_ENABLED=true`.
- Signer error logging now redacts local user paths and common secret field
  shapes before printing messages or stack snippets.

## Track 2 -- Full Lifecycle Validation

**Goal:** every bridge lifecycle can be reproduced from clean state.

Required gates:

- Fresh local devnet full cycle: peg-in, peg-out, anchor, aggregate settlement
  check, settlement submit, confirmation, reconciliation.
- Fresh Ergo testnet full cycle with clean deployment state.
- Failure-mode tests: stale SQLite row, reorged burn, missing anchor, duplicate
  burn, insufficient liquidity, stale singleton boxes, storage-rent warning.
- Recovery path tests: retry, rollback, manual repair, no phantom AVL history
  after failed broadcast.

Done when:

- The full lifecycle runbook can be executed by an external operator from
  documented prerequisites.
- Every state transition has a confirmation/reconciliation check.

Current status:

- Historical V1 patched-devnet `/transactions/check` evidence remains useful
  for compatibility analysis, but the V1 signing, check, authorization,
  submission, deployment, and positive post-submit producers are retired. The
  next executable lifecycle must use the separately versioned external-fee
  profile and a reviewed on-chain authority cutover.
- SQLite peg-out mutation helpers now fail loudly on missing rows instead of
  silently masking state-tracker inconsistencies.
- Settlement confirmation tests now prove wrong-recipient and partial-batch
  confirmations do not commit DUP keys or mark claims unlocked.
- SQLite/AVL backup-restore evidence now has a dedicated capture template in
  `docs/backup-restore-evidence-template.md`; the local state-tracker test
  proves restored SQLite preserves peg-out status, DUP AVL history, SPV tracker
  history, persisted anchors, and pending DUP heartbeats, while live rehearsal
  evidence remains pending.
- Backup-restore snapshots now have a read-only operator command,
  `npm run backup:snapshot`, which produces local SQLite status counts, DUP/SPV
  history counts, rebuilt AVL digests, persisted anchors, pending DUP
  heartbeats, and runtime hygiene hints without replacing on-chain singleton
  comparison evidence.
- Local backup-restore snapshot comparisons now have `npm run backup:compare`,
  so pre-backup and restored JSON artifacts can be compared as a separate
  machine-readable stop/pass signal before Gate 3 evidence is linked.
- Backup-restore snapshots now carry explicit `schemaVersion` metadata, and
  `backup:compare` blocks missing or unsupported snapshot schema versions, so
  stale or hand-trimmed JSON cannot silently close recovery evidence.
- Backup-restore comparison artifacts now record their own `schemaVersion` and
  both input `snapshotSchemaVersions`, and completed backup-restore evidence
  must cite that validation in the comparison command row.
- Backup-restore snapshot validation now requires every required `evidenceRows`
  entry to be present and to match the measured `stateConsistencyValues`, so
  hand-edited JSON cannot preserve nice-looking state values while removing or
  changing the measurement rows.
- Backup-restore restore-target classification now treats live, runtime,
  production, and relayer-database targets as requiring completed reviewer
  approval plus rollback evidence even when the target is also labeled isolated.
- Backup-restore evidence now requires an isolated or reviewed restore target,
  so a direct live SQLite restore cannot pass Gate 3 as release evidence without
  linked review.
- Rehearsal validation now requires chain-state identifiers in dry-run,
  submit/confirmation, reconciliation, and rollback sections to use structured
  evidence markers, so raw TX/box IDs or "not needed" notes cannot close Gate 3.
- Settlement reconciliation now refuses to mutate DUP history, SPV tracker
  history, or peg-out status unless SQLite records the same submitted tx ID for
  the expected `aggregate_submitted` or `batch_submitted` status, preventing a
  correct-looking but unapproved confirmation transaction from closing state.
- Historical aggregate settlement approval controls bind exact transaction IDs,
  source observations, runtime context, and ordered burn sets, but they no
  longer grant funds authority. The legacy V1 transaction deducts the miner fee
  from protected backing while only the net payout is burned, so the daemon,
  operator CLIs, shared service, signer/authorization adapters, and transport
  expose no new V1 signing, node-check, authorization, submission, or transport.
  Unsigned preparation remains diagnostic and confirmation/recovery remains
  available only for historical transactions.
  Re-enablement requires a reviewed and activated, separately versioned
  external-fee profile plus permanent legacy-route retirement.
- Live rehearsal reviewer sign-off now blocks `pass` classifications when
  publication blockers, follow-up tests, or follow-up runbook changes remain
  open; those fields must be `none`, `no`, or `0` before Gate 3 evidence can
  pass.
- Live rehearsal reviewer sign-off now must match the `Reviewer` identity in
  Session Metadata, so a different reviewer cannot close Gate 3 evidence after
  the session reviewer is named.
- Live rehearsal evidence now requires structured publication evidence before
  Gate 3 can pass: release notes updated, Pending Evidence Register updated,
  completed Gate 3 rehearsal release-note update evidence, completed Gate 3
  checklist update evidence, and no production-ready claim from the rehearsal
  alone.
- Gate 3 release-gate rows now preserve the rehearsal non-production claim
  markers, `Production-ready claim allowed by this rehearsal: no` and
  `Testnet production-candidate claim allowed by this rehearsal: no`, so local
  devnet, testnet, failed-broadcast, and reorg recovery evidence cannot close
  while dropping the validator's claim boundary.
- Fresh testnet non-broadcast checkpoint creation now requires explicit
  observation source provenance: height evidence must name live read-only
  `/info` plus `getBlockNumber` collection with concrete read-only
  `ergoNodeUrl` and `sidechainRpcUrl` endpoint bindings or a concrete provided
  JSON target, singleton observations must name live read-only node collection
  with a concrete read-only `ergoNodeUrl` binding or a concrete provided JSON
  target, and anchor observations must name `live-read-only-node` with a
  concrete read-only `ergoNodeUrl` binding, so in-memory observations cannot
  silently become release-supporting evidence.
- Backup-restore publication evidence now also preserves
  `Testnet production-candidate claim allowed by this drill: no`; a recovery
  drill can support operator recovery evidence, but it cannot by itself
  authorize production-ready, testnet production-candidate, or production-grade
  testnet claims.
- Live recovery rehearsal rows now require outcome-specific failed-broadcast
  and reorg evidence: no phantom DUP/AVL history after failed broadcast, plus
  reorged-burn/stale-singleton detection and recovery or recoverability.
- Release-note validation now requires dedicated Gate 3 recovery evidence rows
  for failed-broadcast phantom AVL recovery and reorged-burn/stale-singleton
  recovery, so those drills cannot be hidden behind generic lifecycle evidence.
- Release-note allowed-claim validation now blocks failed-broadcast,
  phantom-DUP/AVL, reorged-burn, or stale-singleton wording unless the matching
  Gate 3 recovery evidence row is linked with completed evidence, so recovery
  claims cannot bypass their dedicated drill evidence through the claims table.
- Gate 3 live-rehearsal lifecycle rows now reject internally contradictory
  passing evidence artifacts, so completed/PASS row evidence cannot be paired
  with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
  non-zero `structural issues` when closing checked lifecycle rows or evaluating
  testnet production-candidate claims.
- Gate 3 assembly-report JSON validation now applies the same fail-closed
  contradiction check to Markdown provenance, so post-submit included/completed
  assembly markers cannot be paired with failing command, validation, or
  structural-issue output.

## Track 3 -- Trust Minimization

**Goal:** remove trusted-oracle assumptions and make burn verification
cryptographic.

Required gates:

- Phase 008: sidechain consensus becomes verifiable enough for bridge use.
- Phase 009: sidechain commitments are embedded in Ergo extension sections with
  a stable commitment format.
- Phase 011: SPV relay verifies sidechain headers/commitments on Ergo.
- Burn events are committed with a proof format that avoids EVM receipt/Keccak
  incompatibility with ErgoScript.
- MCU Phase 2 no longer relies on trusted SCS oracle assumptions.

Done when:

- A burn can be verified from sidechain commitment data without trusting the
  relayer's off-chain interpretation.
- The remaining trust model is limited to explicit committee/governance risks.

Current status:

- Not complete. This is a core blocker for testnet production-grade claims.
- The proof target is now captured in
  `docs/trustless-burn-verification-plan.md`, including the required
  sidechain commitment, SPV relay, burn inclusion proof format, negative tests,
  and publication rules. The document is a blocker definition, not completed
  evidence.
- Trustless burn evidence now has a dedicated capture template in
  `docs/trustless-burn-verification-evidence-template.md` and an executable
  validator. The Gate 5 blocker remains open until completed evidence links the
  sidechain commitment, SPV relay, burn inclusion proof, DUP binding, negative
  tests, and independent review.
- Trustless burn evidence validation now rejects vague proof-binding rows:
  `commitmentPrefix` must identify the `0x04xx` extension keyspace,
  `hashFunction` must identify Blake2b-compatible hashing, and the recipient,
  amount, inclusion path, DUP key, and settlement payout bindings must be
  field-specific.
- Trustless burn commitment and burn-proof evidence now require concrete
  32-byte hex identifiers plus numeric heights, amounts, and event indices for
  sidechain commitments and proved burns, so narrative-only Gate 5 rows cannot
  stand in for cryptographic values.
- Trustless burn linked rows now require completed component, commitment,
  burn-proof, negative-test, or release-checklist update evidence; template
  links, bare validator command names, and validation-target-only row cells
  cannot close the Gate 5 trustless burn blocker.
- Gate 5 publication-update rows now require completed Gate 5 checklist update
  evidence and completed Gate 5 release-note update evidence, keeping the
  Pending Evidence Register aligned with the trustless-burn validator.
- Trustless burn evidence publication decisions now reject unqualified
  production-ready claims and require `Testnet production-candidate claim
  allowed = yes` before Gate 5 can support a production deployment candidate
  package.
- Gate 5 release-gate resolution now preserves exact publication decision
  facts: `Trustless burn verification implemented = yes`,
  `Production-ready claim allowed = no`,
  `Testnet production-candidate claim allowed = yes`,
  `Transitional trusted burn path disabled = yes`,
  `Critical/high findings open = 0`, and `Release notes updated = yes`.
- Gate 5 trustless-burn evidence now requires explicit positive proof acceptance evidence
  before negative-test evidence can close the gate; the
  accepted artifact must cite burn proof execution, inclusion or membership,
  DUP duplicate-prevention binding, and settlement payout binding.
- Gate 5 positive proof acceptance evidence now also must identify the concrete
  accepted burn ID, `bridgeEventRoot` commitment, settlement transaction
  binding, recipient binding, and amount binding, preventing narrative
  acceptance logs from closing the trustless-burn path.
- Gate 5 positive proof acceptance evidence now must match the instance values
  declared in the commitment and burn-proof tables: `bridgeEventRoot`,
  `burnId`, `recipientErgoTreeHash`, and `amountNanoErg`. A proof acceptance
  artifact for a different burn instance cannot close the trustless-burn path.
- Gate 5 trustless-burn evidence now requires a Local Proof Vector JSON block
  validated through the compatibility entry point
  `relayer/src/trustless-burn-proof.ts`, backed by the canonical
  `profiles/substrate-grandpa-v1` implementation; the local vector
  checks `bridgeEventRoot`, inclusion proof, DUP key, recipient, amount, and
  asset binding, while leaving Gate 5 open until sidechain finality,
  on-chain proof acceptance, and review evidence are linked.
- Gate 5 trustless-burn evidence now must link a structured
  `Proof-vector validation report` JSON target generated by
  `npm run trustless:proof-vector:validate -- <vector.json> --json-out <report.json>`.
  `npm run trustless:validate` consumes that report and fails closed if the
  report is missing, non-PASS, not read-only, not local proof-core-only,
  broadcast- or claim-enabling, contains multiple proof-vector results, omits
  the structured result label/message, empty errors array, `gate5Claim=false`
  and `contractsChanged=false` markers, or explicit local proof-core-only,
  no-closure, no-settlement-readiness, no-broadcast-authorization, and
  no-production-claim boundary text, or is not bound to the embedded Local Proof
  Vector, including the canonical `leafHashHex`.
- Release-gate trustless-burn validation now consumes that Local Proof Vector
  from `--trustless-burn-evidence` and re-binds its `bridgeEventRootHex`, leaf
  identity, DUP key, recipient, amount, event index, and local proof-core
  negative cases to the structured commitment and burn-proof rows. A Gate 5
  PASS wrapper can no longer omit the checked proof vector while supporting
  checked evidence or testnet production-candidate evaluation.
- Gate 5 local proof vectors now include structured fail-closed negative cases
  validated by `relayer/src/trustless-burn-proof-vector.ts`, covering wrong
  sidechain ID, burn ID, event index, recipient, amount, DUP key,
  `bridgeEventRoot`, and malformed inclusion path before the vector can pass.
- Gate 5 negative-test rows that rely on the local proof core now must cite the
  matching Local Proof Vector `negativeCase` name and observed proof-core
  rejection string, preventing row-level negative evidence from drifting away
  from the checked local vector.
- Trustless burn negative-test evidence now requires fail-closed expected
  results (`rejected`, `blocked`, `refused`, or `failed`) so malformed, stale,
  reorged, duplicate, or trusted-oracle fallback cases cannot close Gate 5 as
  generic review notes.
- Trustless burn negative-test evidence now must identify the rejected burn
  proof fact in the linked artifact, so a generic rejected-test log cannot
  satisfy wrong sidechain ID, recipient, amount, duplicate burn, reorg, stale
  SPV tracker digest, wrong anchor height, malformed inclusion path, or
  trusted-oracle fallback cases.
- Trustless burn reviewer sign-off notes now require concrete proof outcomes
  tied to the trustless burn proof, burn inclusion, sidechain commitment,
  extension keyspace, Blake2b hashing, SPV/finality, DUP duplicate prevention,
  settlement binding, reorg handling, recipient/amount binding, Ergo anchors,
  or trusted-oracle fallback rejection; generic Gate 5 review notes cannot pass.
- Trustless burn protocol reviewer sign-off now must match the `Reviewer`
  identity in Evidence Classification, so a different approver cannot close
  Gate 5 after the protocol reviewer is named.
- Trustless burn protocol reviewer sign-off dates now must use ISO calendar
  dates and cannot be before Evidence Classification `Date`, so pre-evidence
  approvals cannot close Gate 5.
- Release-note allowed-claim validation now blocks trusted-burn-verification,
  trusted-oracle-burn, and oracle-fallback completion wording unless the
  trustless burn evidence row is linked with completed evidence, so wording that
  implies the transitional burn trust assumption is solved cannot bypass Gate 5.
- `release:gate` now requires trustless burn evidence to expose classified
  `Broadcast mode = disabled` or `dry-run`, so a PASS result without explicit
  non-broadcast provenance cannot support testnet production-candidate claims.
- Gate 5 release-gate rows now also bind trustless burn Evidence
  Classification provenance: production-candidate support requires a concrete
  Git commit, testnet environment, trustless proof path, reviewer identity,
  ISO classification date, and matching Protocol reviewer sign-off.
- Gate 5 release-gate rows now bind the structured row payloads returned by
  `trustless:validate`: component-specific trustless properties, completed
  component/commitment/burn-proof evidence, distinct completed evidence targets
  across linked component/commitment/burn-proof/positive/negative rows,
  field-specific commitment encodings and burn-proof bindings, positive proof
  evidence bound to commitment and burn rows, negative-test-specific rejection
  evidence with concrete rejected identifiers, and actionable reviewer notes are
  required. Generic `PASS`, `reviewed`, `approved`,
  `trustless burn validation target`, or a single shared proof artifact cannot
  close Gate 5.
- Gate 5 trustless-burn reviewer rows now apply claim/protocol-boundary checks
  to reviewer notes, so an actionable note that approves production-ready
  wording, mainnet-scoped release wording, transitional trusted-burn-path use,
  or trusted-oracle fallback acceptance cannot close Gate 5.
- Gate 5 trustless-burn validation now rejects internally contradictory row
  payloads, so component, commitment, burn-proof, positive-proof,
  negative-test, publication-update, or reviewer evidence cannot pair completed
  or accepted proof evidence with `FAIL`, `BLOCKED`, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`.

## Track 4 -- Committee, Governance, And Key Operations

**Goal:** replace single-operator trust with auditable operational control.

Required gates:

- On-chain multisig guards for signer-gated contracts are deployed and tested.
- Committee membership and threshold are documented.
- Key rotation and member replacement are implemented.
- Emergency pause/escape paths are documented and tested.
- Governance actions have runbooks and safety checks.

Done when:

- A committee can operate the bridge without sharing a single signing secret.
- Key compromise, member loss, and rotation scenarios have tested procedures.

Current status:

- Phase 010a is in progress; governance is not complete.
- Governance and key-rotation drill evidence now has a dedicated capture
  template in `docs/committee-governance-evidence-template.md`. It separates
  Phase 010a `atLeast()` evaluation from Phase 010b governance and keeps
  production-ready claims blocked until rotation, member-loss, and incident
  drills are linked.
- Committee governance evidence now has an executable validator, so the Gate 6
  blocker cannot be closed unless scope rows, command artifacts, rotation
  checks, negative checks, and reviewer sign-offs are linked.
- `release:gate` now consumes completed committee governance evidence through
  `--governance-evidence` for testnet production-candidate claim evaluation;
  the validated target must match the linked completed committee governance
  evidence and a distinct `npm run governance:validate` output target, so
  checklist prose alone cannot authorize Gate 6 governance support.
- Committee governance linked rows now require completed scope, command,
  rotation, or negative-check evidence; template links and bare validator
  command names cannot close the Gate 6 governance/key-rotation blocker.
- Committee governance command rows now require command-specific output
  evidence, so a single shared governance artifact cannot close the
  `contracts:check`, `check`, WASM test, readiness, status, or committee guard
  evaluation rows.
- Gate 6 governance command output evidence must now be internally positive:
  `PASS`, `passed`, `success`, or `exit code 0` cannot close a command row
  when the same evidence reports `FAIL`, `BLOCKED`, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`.
- Gate 6 committee governance release-gate evaluation now re-checks structured
  row payloads: completed scope evidence, command-specific output,
  step-specific rotation facts, disjoint old/new public key or hash identifiers,
  threshold-specific positive signer evidence from the declared new committee,
  rejected-signer identifiers for signer negative checks, actionable stop
  conditions, and actionable reviewer notes. Row names and `linked` statuses
  alone cannot close the committee governance blocker.
- Gate 6 committee governance row evidence now fails closed on contradictory
  validator or command failure markers in linked scope, rotation, positive, and
  negative rows. Negative checks may state expected rejection/blocking outcomes,
  but they cannot use failed validator, command, status, result, outcome,
  non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`
  evidence to close the governance blocker.
- Gate 6 committee governance release-gate evaluation now also rejects reused
  completed row evidence targets across linked scope, command, rotation,
  positive, and negative rows, so one shared governance artifact or log cannot
  close multiple key-rotation checks.
- Gate 6 committee governance reviewer rows now apply claim/governance-boundary
  checks to reviewer notes, so an actionable note that approves
  production-ready wording, mainnet-scoped release wording, open governance
  blockers, or single-signer governance cannot close Gate 6.
- Gate 6 committee governance reviewer notes now also fail closed on failed
  validator or command markers, so governance-readiness approval cannot coexist
  with `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Gate 6 committee governance release-gate evaluation now also binds the
  structured Drill Classification provenance: Git commit, testnet environment,
  disabled or dry-run broadcast mode, committee/multisig governance model,
  threshold/member count policy, reviewer identity, and ISO date. A PASS
  classification without those fields cannot support testnet-scoped
  production-candidate wording.
- Gate 6 committee governance release-gate evaluation now also binds
  publication-update fields returned by `governance:validate`: completed
  Gate 6 governance release-note/checklist update evidence must be concrete
  and internally non-contradictory before governance-ready testnet candidate
  claims can be evaluated.
- Committee governance evidence now rejects single-signer-shaped threshold
  policies; Gate 6 requires threshold at least 2, member count at least 3, and
  threshold lower than member count for member-loss tolerance.
- Committee governance evidence now requires explicit `Broadcast mode =
  disabled` or `dry-run`; missing or enabled broadcast mode is blocked for Gate
  6 governance/key-rotation evidence, while live broadcast rehearsals remain in
  the lifecycle evidence path.
- Committee governance key-identity evidence now requires concrete public
  key/hash identifiers: at least one old-authority identifier and enough new
  committee identifiers to match the declared member count.
- Committee governance key-rotation evidence now requires old and new
  committee public key/hash identifiers to be disjoint, so a relabeled old
  authority cannot satisfy the Gate 6 rotation proof.
- Committee governance negative checks now require fail-closed expected results
  (`rejected`, `blocked`, `refused`, or `failed`) so signer, threshold,
  singleton, broadcast, and network hazards cannot be closed as generic review.
- Old-signer and non-committee-signer negative checks now require concrete
  public key/hash identifiers for the rejected signer, so generic rejected
  mutation logs cannot close Gate 6 signer-rotation evidence.
- Committee governance rotation evidence now requires step-specific facts, so
  generic review artifacts cannot close key identity, threshold, member-loss,
  contract compilation, signer behavior, singleton continuity, deployment-state,
  or rollback evidence.
- Committee governance evidence now requires positive new-committee operation
  evidence before negative checks can close the gate; the accepted artifacts
  must prove new committee signer-gated mutation and member-loss threshold
  operation.
- Committee governance positive checks now also require threshold-specific
  public key/hash identifiers in the accepted operation evidence, so generic
  "committee accepted" logs cannot close the new-committee or member-loss path.
- Committee governance positive checks now require declared new-committee positive signer identifiers,
  so a non-committee key cannot satisfy the threshold quorum in positive evidence.
- Committee governance evidence now requires structured publication-rule rows:
  release notes updated, zero open governance blockers, completed Gate 6
  governance release-note evidence, completed checklist evidence, production-ready
  claims blocked, and testnet production-candidate claims only at production
  deployment candidate level.
- Committee governance publication rules now reject unqualified production-ready
  claims and require `Testnet production-candidate claim allowed = yes` before
  Gate 6 can support a production deployment candidate package.
- Gate 6 release-gate resolution now requires committee threshold policy,
  reviewer decision summary, and completed governance checklist-update evidence,
  keeping the Pending Evidence Register aligned with the governance validator.
- Gate 6 release-gate resolution now preserves the exact governance publication
  facts `Governance-ready claim allowed = yes`,
  `Production-ready claim allowed = no`,
  `Testnet production-candidate claim allowed = yes`,
  `Open governance blockers = 0`, and `Release notes updated = yes`, so copied
  blocker rows cannot pass with generic governance-ready wording.
- Committee governance reviewer decision summaries now must mention release
  support, governance-ready claim handling, production-ready claim handling,
  testnet production-candidate claim handling, and open governance blocker
  handling, so a generic governance approval cannot close the key-rotation
  blocker.
- Committee governance release-gate rows now also apply the shared reviewer
  decision summary claim-boundary checks, so a contradictory testnet
  production-candidate reviewer summary cannot bypass the `governance:validate`
  publication decision.
- Committee governance rotation stop conditions now require actionable stop,
  block, fail, pause, rollback, incident, refusal, halt, disable, or escalation
  wording, so a key-rotation drill cannot pass with non-operational notes.
- Committee governance reviewer sign-off notes now require concrete
  governance-readiness outcomes tied to rotation, threshold, member-loss,
  signer behavior, negative checks, singleton continuity, deployment-state,
  rollback, broadcast controls, or Gate 6 review; generic notes cannot approve
  the governance/key-rotation blocker.
- Committee governance release-gate rows now apply the same fail-closed marker
  policy to reviewer notes, so approval rows cannot hide failed validator or
  command output or non-zero structural issues.
- Committee governance owner sign-off now must match the `Reviewer` identity in
  Drill Classification, so a different approver cannot close Gate 6 after the
  governance owner is named.
- Committee governance owner sign-off dates now must use ISO calendar dates
  and cannot be before Drill Classification `Date`, so pre-drill approvals
  cannot close Gate 6 governance evidence.
- Release-note validation now requires a dedicated
  `Committee governance and key-rotation evidence` row, so Gate 6 governance
  cannot be represented only as a copied blocker or generic trust assumption.
- Release-note allowed-claim validation now blocks committee governance,
  key-rotation, threshold, or multisig wording unless the committee governance
  evidence row is linked with completed evidence, so Gate 6 claims cannot
  bypass the governance/key-rotation blocker through the claims table.

## Track 5 -- eUTXO Parallel Settlement And Performance

**Goal:** demonstrate that Ergo settlement scales through independent boxes and
proof-friendly state.

Required gates:

- Single settlement remains the simple correctness baseline.
- Batch settlement is benchmarked for size, cost, proof time, and build time.
- Sharded DUP and liquidity lanes are implemented or simulated with executable
  tests.
- Lane routing cannot weaken duplicate prevention.
- Monitoring exposes throughput, latency, queue depth, failed proofs, and
  settlement finality.

Done when:

- Claims about eUTXO parallelism are backed by scripts, benchmarks, and docs.
- The bottlenecks are explicit: tracker, DUP lanes, liquidity lanes, node
  mempool, signer, and Ergo transaction size.

Current status:

- Batch path exists; offline sharded lane planner and lane-isolation tests now
  exist. Live sharded settlement, tracker decoupling/sharding, and
  performance benchmarks remain future work.
- Benchmark evidence now has a dedicated capture template in
  `docs/performance-benchmark-evidence-template.md`. It separates offline
  showcase output from live benchmark evidence and blocks throughput, latency,
  or scaling claims until the measured artifacts are linked.
- Benchmark evidence validation now requires linked sharded-lane rows and every
  bottleneck current-evidence row to include a command, local link, or
  `artifact://` marker, so Gate 7 cannot pass on narrative-only scaling or
  bottleneck claims.
- Benchmark evidence validation now requires linked metric, sharded-lane, and
  bottleneck current-evidence rows to include completed benchmark outputs,
  non-template evidence links, or artifact markers; template links and bare
  validator command names cannot close Gate 7 scaling evidence.
- Benchmark sharded-lane evidence now requires each linked artifact to identify
  the lane claim it closes, so a generic benchmark review log cannot satisfy
  DUP-local, liquidity-local, shared-SPVTracker, full-parallel claim-boundary,
  or tracker-overlap mitigation evidence.
- Benchmark bottleneck rows now require concrete scaling-limit focus in the
  impact or next-action cells, so generic bottleneck notes cannot close
  ContextExtension, batch unlock, DUP proof, SPV tracker, liquidity, transaction
  size, or node readiness limits.
- The `Live batch settlement` metric row now requires live submit/confirm or
  `npm run e2e:aggregate` evidence; offline showcase benchmark output cannot
  close the live benchmark gate.
- The same live batch row now requires a concrete 32-byte transaction ID or
  reconciliation digest, so an artifact filename containing `txid` cannot close
  Gate 7 without instance-specific transaction identity.
- Benchmark evidence validation now locks the Claims Boundary allowed and
  blocked claim lists, so deleting production, trustless, full-parallel, or
  mainnet limitations cannot make Gate 7 evidence appear more permissive.
- Benchmark evidence validation now requires structured publication decision
  rows: scaling claims allowed, release notes updated, zero open benchmark
  blockers, completed Gate 7 benchmark release-note update evidence, completed
  checklist evidence, production deployment candidate support only with
  testnet production-candidate claim evidence, and production throughput claims
  only with production deployment candidate support plus mainnet-grade evidence.
- Gate 7 benchmark release-gate rows now preserve the testnet production
  candidate benchmark publication facts exactly: `Scaling claims allowed = yes`,
  `Production-ready claim allowed = no`,
  `Testnet production-candidate claim allowed = yes`,
  `Production throughput claim allowed = no`,
  `Mainnet-grade evidence linked = no`, `Open benchmark blockers = 0`, and
  `Release notes updated = yes`, so benchmark evidence
  cannot silently authorize production throughput or production-ready claims.
- Gate 7 release-gate and security-matrix rows now preserve the live batch
  evidence, sharded-lane evidence, production-ready benchmark claim boundary,
  reviewer decision summary, and completed checklist update requirements, so
  generic benchmark artifacts cannot close scaling evidence or imply
  claim-bearing testnet capacity.
- `release:gate` now consumes completed benchmark evidence through
  `--benchmark-evidence` for testnet production-candidate claim evaluation; the
  validated target must match the linked completed benchmark evidence and a
  distinct `npm run benchmark:validate` output target, so checklist prose alone
  cannot authorize Gate 7 benchmark support.
- Gate 7 benchmark release-gate evaluation now also binds structured Benchmark
  Classification provenance: Git commit, testnet environment, trustless burn
  proof path, machine/toolchain metadata, reviewer identity, and ISO date. A
  PASS benchmark validation without those fields cannot support
  testnet-scoped production-candidate wording.
- Gate 7 release-gate evaluation now re-checks the structured
  `Live batch settlement` metric row: it must expose classified
  `Broadcast mode = enabled`, completed live-batch evidence, user explicit live
  broadcast approval bound to the Expected transaction ID, scoped
  `BRIDGE_BROADCAST_ENABLED=true` evidence, readiness/policy/signing PASS
  evidence, network reconfirmation, and concrete transaction identity before
  benchmark PASS output can support testnet production-candidate claims.
- Gate 7 benchmark validation now evaluates contradictory live-readiness markers
  on both sides of the PASS token, so `PASS exit code 0 ... 1 structural issue`
  cannot satisfy readiness, broadcast-policy, or live-settlement signing facts.
- Gate 7 benchmark validation now also evaluates contradictory failure markers
  in linked command, metric, sharded-lane, and bottleneck row evidence, so a
  completed benchmark target paired with `FAIL`, `BLOCKED`, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues` cannot close
  the row.
- Gate 7 benchmark release-gate evaluation now also binds publication-update
  fields returned by `benchmark:validate`: completed Gate 7 benchmark
  release-note/checklist update evidence must be concrete and internally
  non-contradictory before scaling evidence can support testnet production
  candidate evaluation.
- Gate 7 benchmark release-gate evaluation now also rejects reused completed
  row evidence targets across linked command, metric, sharded-lane, and
  bottleneck rows, so one shared benchmark artifact or log cannot close multiple
  command outputs, measurements, lane statements, or scaling-limit checks.
- Benchmark reviewer decision summaries now must mention release support,
  measured single/batch/sharded evidence, production-ready benchmark claim
  handling, testnet production-candidate claim handling, and production
  throughput claim handling, so a generic scaling approval cannot close Gate 7.
- Benchmark release-gate rows now apply shared reviewer decision summary
  claim-boundary checks plus production throughput blocking, so contradictory
  testnet production-candidate wording or implicit throughput approval cannot
  bypass the `benchmark:validate` publication decision.
- Benchmark reviewer sign-off notes now require concrete benchmark outcomes
  tied to numeric measurements, throughput, latency, proof size, transaction
  size, sharded lanes, bottlenecks, scaling limits, ContextExtension, DUP,
  SPVTracker, liquidity, mempool/signing readiness, live batch settlement, or
  the claims boundary; generic scoped-review notes cannot pass.
- Benchmark reviewer sign-off notes now also apply claim-boundary checks, so an
  actionable note that approves production-ready wording, mainnet
  production wording, or production throughput wording cannot close Gate 7.
- Benchmark reviewer sign-off notes now also fail closed on validator or
  command failure markers, so a concrete metric or bottleneck approval cannot
  coexist with `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`; claim-boundary wording that keeps production throughput
  blocked remains valid.
- Benchmark owner sign-off now must match the `Reviewer` identity in Benchmark
  Classification, so a different approver cannot close Gate 7 after the
  benchmark owner is named.
- Benchmark owner sign-off dates now must use ISO calendar dates and cannot be
  before Benchmark Classification `Date`, so pre-benchmark approvals cannot
  close Gate 7 scaling evidence.
- Benchmark evidence classification now requires benchmark-runner and toolchain
  metadata, so single/batch/sharded metrics cannot support scaling claims
  without machine profile, Node, Rust, and wasm-pack versions.
- Benchmark metric rows now require a sample count of at least 3 and
  scenario-specific evidence for the measured single-claim baseline, batch
  settlement, sharded lanes planner, or live batch row, so Gate 7 scaling
  evidence cannot be closed by one-off numeric measurements or generic
  benchmark review artifacts.
- Benchmark metric rows now also require positive measured values and positive
  `inputs=`, `outputs=`, `vars=`, and `batch=` counts, so zero-valued benchmark
  placeholders cannot satisfy Gate 7 merely by matching numeric/unit syntax.
- Benchmark metric cost counts now require exactly one positive value per
  `inputs=`, `outputs=`, `vars=`, and `batch=` key, so duplicate or
  contradictory benchmark count fields cannot support scaling claims.

## Track 6 -- Security Program

**Goal:** make "zero known critical/high risk" an evidence-backed state.

Required gates:

- Threat model and attack-chain registry are current.
- Every critical contract invariant has positive and negative tests.
- Reorg, replay, duplicate, stale proof, stale anchor, and malicious relayer
  cases are covered.
- Dependency risks are documented, especially sigma-rust, ergo-lib-wasm-nodejs,
  Fleet SDK, and AVL proof generation.
- Independent review is performed before publication.

Done when:

- All known critical/high findings are closed or explicitly blocked from
  publication.
- Review artifacts are linked from the release checklist.

Current status:

- Aggregate settlement threat model refresh exists in
  `docs/aggregate-settlement-threat-model.md`; independent review and live
  rehearsal evidence are still required.
- Dependency risks now have an explicit register in
  `docs/dependency-risk-register.md`, covering signer, transaction assembly,
  AVL proof generation, SQLite state, EVM event parsing, and reproducibility
  toolchains.
- Dependency review and vulnerability triage now have a dedicated capture
  template in `docs/dependency-review-evidence-template.md` and an executable
  validator. This keeps dependency-release evidence separate from the static
  risk register and prevents narrative-only triage from closing Gate 4.
- Dependency review validation now requires every linked vulnerability triage
  finding to state zero/no-open/resolved critical-high findings; unresolved
  critical/high dependency findings must stay blockers instead of being hidden
  behind a generic review note.
- Linked dependency-review triage now also rejects contradictory positive
  critical/high finding counts, so a `no open critical/high` phrase cannot hide
  `1 high` or similar blocker evidence in the same findings cell.
- Dependency scope evidence now requires linked artifacts to identify the
  reviewed dependency or toolchain, so generic dependency review notes cannot
  satisfy signer, Fleet SDK, AVL, SQLite, EVM, wasm-pack/Rust, or lockfile rows.
- Dependency reviewer sign-off notes now require concrete dependency-risk
  outcomes tied to sigma-rust, ergo-lib-wasm-nodejs, ContextExtension
  serialization, Fleet SDK, AVL, SQLite, EVM event parsing, lockfiles,
  vulnerability triage, upstream signer resolution, fail-closed guards, or
  toolchain pinning; generic dependency review notes cannot pass.
- Dependency reviewer sign-off now must match the `Reviewer` identity in the
  Review Classification table, so a different approver cannot close the signer
  dependency blocker after the dependency reviewer is named.
- Dependency-review sign-off dates now must use ISO calendar dates, and the
  dependency reviewer sign-off date is not before review classification Date,
  preventing pre-review approvals from closing the signer dependency blocker.
- Dependency reviewer decision summaries now must mention release support,
  upstream signer blocker handling, production-ready claim handling, testnet
  production-candidate claim handling, and critical/high vulnerabilities, so a
  generic or partial dependency-risk approval cannot close Gate 4.
- Dependency reviewer rows now apply claim/signer-boundary checks to reviewer
  notes, so an actionable note that approves production-ready wording,
  mainnet-scoped release wording, an unresolved upstream signer blocker, open
  critical/high vulnerabilities, or fail-closed signer blocker candidate support
  cannot close Gate 4.
- Dependency reviewer sign-off notes now also fail closed on failed validator
  or command markers, so a concrete dependency-risk approval cannot coexist with
  `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`; fail-closed signer-boundary wording remains valid only
  when it keeps claims blocked.
- Publication hygiene tests now validate dependency-risk row structure,
  allowed statuses, and locally resolvable dependency source paths.
- Release evidence now has a dedicated checklist in
  `docs/release-checklist.md`; pending evidence remains explicit instead of
  being hidden in narrative docs.
- Clean-checkout evidence rows marked `linked` now require completed command or
  workflow output, non-template evidence links, or artifact markers, so Gate 1
  cannot be closed by template links or bare validator command names.
- Clean-checkout required checklist updates now use the same completed-evidence
  rule, so a template link or `npm run ci:validate` alone cannot close Gate 1.
- Gate 1 release-gate binding now consumes the clean-checkout
  publication-decision update fields returned by `ci:validate`; completed Gate
  1 release-note and checklist update evidence is required rather than inferred
  from `Release notes updated = yes`.
- `release:gate` now consumes completed clean-checkout evidence through
  `--clean-checkout-evidence` for testnet production-candidate claim
  evaluation; the validated target must match the linked completed
  clean-checkout evidence and a distinct `npm run ci:validate` output target,
  so checklist prose alone cannot authorize Gate 1 support.
- `release:gate` now treats duplicate singleton evidence flags as structural
  issues, preserving `--recovery-observe-json` as the repeated flag for
  distinct recovery observation reports.
- Repeated recovery-observe JSON inputs now must be distinct by both recovery
  kind and target, so one passing observation cannot mask a second failed
  report for the same drill.
- `release:gate` now rejects reused completed validation targets across
  evidence families, including repeated recovery-observe reports, so one
  Markdown or JSON artifact cannot satisfy multiple validators by carrying a
  broad PASS-shaped target.
- `release:gate` also rejects reused validator output/log/transcript targets
  across checked evidence families and the Release Decision release-notes
  artifact, including repeated outputs inside a single checked row, so a single
  command transcript cannot stand in for multiple command-specific validator
  runs.
- `release:gate` also requires the actual `ci:validate` result to expose the
  clean-checkout Run Classification fields, including the final branch, Git
  commit, toolchain versions, reviewer, ISO date, and
  `Release level = production deployment candidate`; structured rows without
  this classification cannot support testnet production-candidate wording.
- Clean-checkout workflow evidence now requires the final branch commit row to
  name the exact Run Classification branch and Git commit, preventing generic
  CI artifacts from closing Gate 1 on the wrong branch or commit.
- Clean-checkout workflow evidence now also requires workflow fact-specific
  proof for the tracked workflow file, Node version, relayer lockfile cache key,
  Rust target, wasm-pack version, install-before-test order, and CI test steps.
- Gate 1 release-gate rows now bind the structured row payloads returned by
  `ci:validate`: command-specific completed clean-checkout output evidence,
  workflow-specific CI facts, completed reproducibility evidence with
  decision-specific publication impact, distinct completed evidence targets
  across linked command/workflow/decision rows, and actionable reviewer notes
  are required. Generic `PASS`, `reviewed`, `approved`, or a single shared row
  artifact cannot close Gate 1.
- Gate 1 pass-like command evidence must now be internally positive: `PASS`,
  `passed`, `ok`, or `exit code 0` cannot close a clean-checkout command row
  when the same evidence reports `FAIL`, `BLOCKED`, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`.
- Gate 1 clean-checkout command evidence now treats `npm run release:gate` as
  the only expected blocked command row, and only when the evidence also proves
  `0 structural issues`; failed validator markers, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues` remain
  blockers.
- Gate 1 linked workflow and reproducibility-decision rows now fail closed when
  completed row evidence is mixed with failed validator/command markers,
  `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`, so stale CI or decision output cannot mask a failed
  clean-checkout signal.
- Gate 1 publication-update fields now use the same fail-closed contradiction
  check, so a pass-like release-note or checklist update note cannot close Gate
  1 when it also reports failure, blocked validation, or non-zero structural
  issues.
- Release-note allowed-claim validation now blocks clean-checkout, green-CI,
  final-branch, or workflow-run wording unless the Clean checkout CI evidence
  row is linked with completed evidence, so Gate 1 reproducibility claims
  cannot bypass final-branch CI evidence through the claims table.
- Clean-checkout reproducibility decision evidence now must identify the
  checked CI or hygiene signal, preventing generic review artifacts from
  satisfying distinct Gate 1 decisions.
- Release gate validation also requires the expected blocker rows to remain in
  the Pending Evidence Register, so a publication blocker cannot disappear
  without a linked `Checked` resolution.
- Required blocker rows now must keep a publication-blocker effect and a
  structured resolution target, so they cannot be downgraded to advisory notes
  or vague remediation text.
- Required blocker rows now also preserve row-specific evidence terms, so a
  generic completed artifact cannot close a pending evidence row for the wrong
  lifecycle, review, governance, benchmark, or integration obligation.
- Checked publication-blocker rows now require completed evidence links,
  command-output targets, or artifact markers; template links, targetless
  command-output notes, and validator command names alone remain resolution
  targets or narrative status notes rather than evidence.
- Release notes validation now mirrors that blocker set for non-production
  release notes, preventing a release note from omitting checklist blockers
  that still constrain publication claims.
- Release notes copied blockers now mirror the completed-evidence rule for
  `Checked` rows, so template links and validator command names alone cannot
  make a release note look resolved.
- Release notes required-evidence rows marked `linked` now require completed
  evidence markers, so templates and bare validator command names cannot satisfy
  evidence linkage.
- Release notes required-evidence cells now must identify the evidence class
  they support, so generic release review artifacts cannot close CI, devnet,
  testnet, ContextExtension, broadcast, recovery, operator, threat-model,
  dependency, security-review, trustless-burn, or benchmark rows.
- Release notes trust-assumption and allowed-claim evidence now use the same
  completed-evidence rule, so template links and validator command names alone
  cannot justify release assumptions or claims.
- Release notes allowed-claim evidence now must identify the allowed claim, so
  a generic release review artifact cannot authorize claim wording.
- Release notes trust-assumption evidence now must identify the assumption it
  supports, so a generic release review artifact cannot satisfy trusted-oracle,
  ContextExtension, governance, broadcast opt-in, SQLite/AVL recovery, or
  external-review assumptions.
- Release notes operator-impact rows now require actionable operator actions
  and stop conditions, so generic `reviewed`/`ok` notes cannot stand in for
  runbook, command, monitoring, backup, or incident instructions.
- Release notes operator-impact rows now must also cite the operator area they
  cover, so a generic runbook action cannot satisfy deployment, broadcast,
  backup-restore, monitoring, and incident-response impacts at once.
- Release notes sign-off dates now require `YYYY-MM-DD`, so approval rows
  carry auditable calendar dates rather than narrative timestamps.
- Release-note sign-off dates now must be on or after the Release
  Classification `Decision date`, so stale approvals cannot be reused to close
  a later release decision.
- Release notes decision dates now use the same ISO calendar validation, so
  release classification cannot rely on ambiguous narrative timestamps.
- Evidence validators now share ISO calendar date validation across dated
  classification sections, so release artefacts cannot pass with narrative or
  impossible dates.
- Live rehearsal evidence now also validates session/reviewer dates and
  submission timestamps, so lifecycle proofs cannot pass with ambiguous
  calendar or broadcast-time evidence.
- Live rehearsal reviewer sign-off dates now must be on or after the session
  date, so a pre-signed reviewer approval cannot close Gate 3 lifecycle
  evidence.
- Live rehearsal submit/confirmation evidence now validates numeric mempool
  height, confirmation height, and confirmation count relationships, preventing
  narrative or backwards confirmation evidence from closing Gate 3.
- Live rehearsal preflight and dry-run evidence now validates chain heights,
  transaction-shape counts, and per-input ContextExtension key counts as
  structured numeric values.
- Live rehearsal dry-run transaction-shape counts now require positive claim,
  input, and output counts, so an empty transaction shape cannot close Gate 3.
- Live rehearsal dry-run heights now must not exceed the current preflight
  Ergo and sidechain heights, preventing future-height rehearsal evidence from
  closing Gate 3.
- Live rehearsal submit evidence now requires an explicit 32-byte transaction
  ID matching the dry-run expected transaction ID, preventing a different
  broadcast from closing Gate 3.
- Live rehearsal confirmation evidence now requires concrete 32-byte box IDs
  for settlement outputs, DUP/SPV successors, and payout outputs, so artifact
  links alone cannot close Gate 3.
- Live rehearsal submit/confirmation evidence now requires a positive `feeNanoErg`
  miner fee amount, so a fee artifact without measured fee data cannot close
  Gate 3.
- Live rehearsal pre-broadcast lifecycle artifacts now must cite the dry-run
  identifiers they close: peg-out burn TX ID, sidechain block hash, and expected
  transaction ID.
- The former V1 rehearsal preflight, live-window, offline-gate, aggregate
  prebroadcast, and prep-bundle reports remain immutable historical
  diagnostics. They are not Gate 3 inputs, cannot authorize transport or
  broadcast, and cannot support release or production-candidate claims.
- Fresh testnet checkpoint capture now uses read-only clients for bounded live
  reads only: Ergo `/info`, sidechain `getBlockNumber`, singleton boxes, and
  mempool/unconfirmed transactions. It records concrete read-only endpoint
  provenance in `sourceBindings.heightEvidence`, `sourceBindings.singletonCheckpoint`,
  and `sourceBindings.anchorObservations`, never sends an `api_key` header for
  Ergo node reads, cannot submit transactions, and the release gate now rejects
  source-binding operation lists that add signing, submission, broadcast,
  mutation, repair, or reconciliation markers beside read-only evidence.
- Live rehearsal assembly can now carry an optional fresh checkpoint artifact
  forward with `--fresh-checkpoint <fresh-testnet-checkpoint.json>`, but only as
  offline non-broadcast evidence. The assembler keeps the checkpoint
  `CREATED` / `publication blocker`, requires every broadcast/lifecycle
  boundary to remain false, binds it to the draft/live-preflight Expected
  transaction ID, burn set, deployed-state hash, sidechain block heights and
  hashes, Ergo anchor heights, and bridge event roots, and blocks mismatches. It
  cannot close Gate 3, authorize broadcast, replace a future activated
  external-fee live-preflight, submit, confirmation, or reconciliation
  evidence, or support production-ready/testnet production-candidate claims.
- Fresh Ergo testnet lifecycle release-gate evidence now requires a separately
  implemented `rehearsal:external-fee-live-preflight` transcript/report bound to
  `authenticated-external-fee-v1`, `ACTIVATED`,
  `gate3-lifecycle-closure`, and the exact activation evidence target. It must
  also bind external miner-fee funding, application-bound finality, global DUP
  cutover lineage, legacy-route retirement, exact target-node acceptance, the
  approved burn set, and the same Expected/submitted transaction ID. The current
  legacy command always returns `BLOCKED` and cannot provide those authorities.
- Release-note validation applies the same fail-closed semantics to lifecycle
  evidence copied into public notes, so a stale `rehearsal:validate` or legacy
  live-preflight PASS excerpt cannot mask the quarantine or replace the activated
  profile binding.
- Confirmation/finality binding now uses the same fail-closed PASS semantics:
  `confirmation policy met` must be internally positive and still carry
  `confirmationsRequired`, `confirmationsObserved`, submitted transaction ID,
  and completed finality evidence.
- Post-submit observe JSON now preserves the live-preflight provenance binding
  with `runtimeBroadcastEnabled: false`, so downstream assembly/release checks
  keep the neutral-shell proof even when validating the post-submit artifact as
  the required machine-readable lifecycle input.
- Release-gate post-submit observe validation now consumes the structured
  `observation` output shape as well: submitted/Expected transaction binding,
  burn order, ordered settlement output box IDs, SPV tracker successor at
  `OUTPUTS(0)`, aggregate DUP successor at `OUTPUTS(1)`, recipient payouts at
  `OUTPUTS(2+i)`, optional aggregate unlock change, and final miner fee output.
  A post-submit PASS wrapper can no longer omit the actual observed output
  topology while still supporting Gate 3 or testnet production-candidate
  evaluation.
- `rehearsal:validate` consumes current assembly, activated external-fee
  live-preflight, post-submit, fresh-checkpoint, and recovery artifacts. Legacy
  V1 preparation reports may be retained as provenance but are ignored for the
  deciding lifecycle status.
- `rehearsal:validate -- --assembly-report-json` now runs the canonical
  `rehearsal:assemble` JSON validator over the linked report before accepting
  assembly provenance. A report that has status/target bindings but omits
  structured `rehearsalValidation`, validated Markdown provenance,
  post-submit-included lines, assembled validation PASS, or the
  fresh-checkpoint publication-blocker boundary remains blocked.
- Live rehearsal submit and confirmation lifecycle artifacts now must cite the
  submitted transaction ID, so generic lifecycle artifacts cannot close Gate 3
  without binding back to the broadcast transaction.
- Live rehearsal dry-run evidence now requires explicit 32-byte hex values for
  peg-out burn TX ID, sidechain block hash, and bridge event root, so artifact
  links alone cannot stand in for SPV-critical identifiers.
- Backup-restore evidence now requires restored DUP and SPV rebuilt digests to
  use the 33-byte AVL digest format used by the settlement code.
- Evidence validators now require Git commit fields to be 7-40 character SHA
  values, so branch names or narrative references cannot stand in for a
  reproducible source revision.
- Completed-evidence validators now share an evidence hygiene guard that blocks
  local Windows/POSIX absolute paths, local file URLs, local workspace
  identifiers, secret dlog references, key material block markers,
  credential-bearing URLs or evidence links, Authorization/Cookie/API-key
  credential headers, runtime database, deployment-state, or diagnostic dump
  artifacts, and mnemonic, signing-key, seed, API-key, password, client-secret,
  generic secret, JWT, generic token, cloud access-key, webhook-url,
  session-token, or access-token assignments, including quoted JSON/YAML
  credential keys.
- Evidence validator scripts now route input paths through a shared Markdown
  target guard before reading files, blocking repository-escape traversal,
  symlink/junction escape, local absolute paths, local file URLs, URI targets,
  environment, secret-bearing, and runtime-state paths at the CLI boundary, and
  reporting sanitized target labels rather than raw local paths.
- Release notes validation also requires required blocker rows to keep
  structured resolution targets while pending/open, so vague remediation prose
  cannot make release notes look more complete than the checklist.
- Release notes validation rejects duplicate publication-blocker rows, so a
  copied checklist blocker cannot carry conflicting release-note statuses.
- Release notes validation now requires any `Checked` publication blocker to
  have the corresponding Required Evidence row marked `linked`, so checklist
  blocker status cannot diverge from the release evidence inventory.
- Release notes validation also rejects duplicate required rows in required
  evidence, trust assumptions, operator impact, and sign-off tables, so release
  evidence cannot hide conflicting statuses behind repeated rows.
- Release notes validation rejects duplicate release classification fields, so
  a repeated commit, release level, decision, owner, or date row cannot override
  the canonical publication metadata.
- Evidence validators now share duplicate required-field validation across
  classification and publication-decision tables, so completed Gate 1-8
  evidence cannot hide conflicting commits, release levels, claim decisions, or
  reviewer metadata behind repeated `Field | Value` rows.
- Evidence validators now reject duplicate required rows across backup-restore,
  benchmark, clean-checkout, committee governance, dependency review, external
  integration, operator readiness, security review, and trustless-burn evidence,
  so repeated rows cannot mask conflicting statuses in gate-specific reports.
- Release gate validation now rejects duplicate pending-evidence blocker rows,
  so the checklist cannot present conflicting statuses for the same required
  blocker.
- Release gate validation now also parses the structured release decision
  table and rejects decisions that understate unresolved publication blockers,
  claim public release while blockers remain, or approve a release before
  release notes are validated or linked.
- Release gate validation now also enforces the canonical Release Decision
  `Field | Value` table header, so checklist decision evidence cannot drift
  into an ambiguous schema while preserving valid-looking field rows.
- Release gate decision validation also blocks production-ready claims below a
  `production deployment candidate` release level and blocks public-release
  flags before final approval.
- Release gate decision validation now requires `Release notes status = linked`
  before `Public release allowed = yes`, so a validated-but-unattached release
  note cannot satisfy the publication decision.
- Release gate decision validation now binds the validated release-note
  classification `Release level` to the Release Decision `Proposed release
  level`, so a validated release-note document for another release level cannot
  authorize publication.
- Release gate decision validation now binds the release-note classification
  `Git commit` to the clean-checkout Run Classification `Git commit`, so a
  validated release-note document from another checkout cannot authorize
  publication.
- Release gate decision validation now also requires a completed `Release notes
  artifact` when release notes are linked, so a bare `linked` status cannot
  substitute for the actual release-notes evidence.
- Release gate decision validation now requires linked release notes to cite
  `npm run release-notes:validate` output evidence, so a generic artifact marker
  cannot authorize public release.
- Release gate decision validation now separates the completed release-notes
  document artifact from validator output evidence, so a validation log alone
  cannot authorize public release.
- Release gate decision validation now requires `release-notes:validate` output
  to identify the completed release-notes document target, so a validation log
  from another file cannot authorize public release.
- Release gate decision validation now requires the validator output evidence
  target to be distinct from the completed release-notes document, so one
  artifact cannot satisfy both publication evidence roles.
- Release gate decision validation now requires the completed-document target
  binding to appear inside the `release-notes:validate` output evidence, so a
  separate reviewer note cannot stand in for validator output.
- Release gate decision validation now requires validator output to cite the
  same normalized completed-document target, so a different artifact with the
  same basename cannot satisfy release-note attachment.
- Release gate decision validation now ignores completed-document targets that
  appear only inside validator output, so a validation log cannot stand in for
  the standalone release-notes document artifact.
- Release gate decision validation now counts validator-output artifact targets
  only before the validated-target binding, so a later log link cannot hide
  that the command output reused the completed release-notes document.
- Release gate decision validation now requires `release-notes:validate` output
  evidence to cite a validation log, transcript, CI run, or workflow artifact,
  so a generic evidence artifact cannot authorize public release notes.
- Release gate decision validation now re-checks positive allowed-claim
  evidence links from structured release-note `claimRows`, so an internal
  `PASS` validation payload cannot authorize a claim with evidence that says
  the same claim is missing, blocked, forbidden, disallowed, unresolved, or not
  supported.
- Release gate decision validation now rejects bare `run` artifact targets for
  release-notes validator output evidence, so a generic run capture cannot
  stand in for a validation log, transcript, CI run, or workflow artifact.
- Release gate decision validation now requires the completed release-notes
  document target to be Markdown, so a ZIP or generic artifact named
  `completed-release-notes` cannot stand in for the validator input document.
- Release gate decision validation now rejects completed release-notes template
  targets, so Markdown templates remain resolution targets rather than
  completed document evidence.
- Release gate decision validation now requires an affirmative completed
  release-notes filename marker, so `not-completed` or `uncompleted` targets
  cannot satisfy the completed-document artifact requirement.
- Release-note allowed-claim validation now treats space-separated
  production-ready wording, ready-for-production phrasing, mainnet readiness,
  production-grade, abbreviated prod-ready/prod-candidate/prod-grade wording,
  bank-grade, market-ready, launch-ready, go-live, general availability,
  generally available, GA-ready, production launch, exchange-ready, exchange-grade,
  institutional-grade, institutional-ready, enterprise-grade, and
  enterprise-ready wording as production-candidate claims, so cosmetic wording
  changes cannot bypass the production gate.
- Release-note mainnet claim validation now treats mainnet, main network, or
  main chain paired with forbidden production-ready, production-candidate,
  go-live, general availability, generally available, or production launch wording
  as forbidden mainnet claims, so launch vocabulary cannot bypass the testnet-only claim
  boundary.
- Clean-checkout evidence in the security matrix now preserves
  `Production-ready claim allowed = no`, matching the Gate 1 validator and
  release-gate row so reproducibility evidence cannot imply production
  readiness by itself.
- Publication hygiene tests now verify every release checklist gate has
  checklist items, an Evidence block, and an explicit evidence marker.
- Release gate decision validation now requires `Checked` publication blockers
  to cite a completed evidence target, so targetless command-output notes cannot
  replace linked artifacts or Markdown evidence.
- Security evidence now has a matrix in `docs/security-evidence-matrix.md`
  linking local claims to executable tests and missing publication evidence.
- Independent review readiness now has a dedicated scope document in
  `docs/independent-security-review-scope.md`; this prepares the review package
  but does not satisfy the external review gate.
- Independent review evidence now has a dedicated report template in
  `docs/independent-security-review-evidence-template.md` and an executable
  validator, so Gate 4 cannot be closed by narrative review notes alone.
- Security review evidence validation now requires an approving final decision,
  approving reviewer sign-offs, zero critical/high findings, and linked release
  artifact updates before Gate 4 evidence can pass.
- Security review evidence validation now requires question-specific evidence
  for every negative review check, so a generic negative-review artifact cannot
  close node-wallet signing, ContextExtension, broadcast, phantom-DUP,
  batch-payout, singleton-digest, trusted-burn, or operator-recovery questions.
- Security review publication decisions now cannot support a higher release
  level than the level actually audited in Review Classification, so an
  institutional-reference review cannot authorize a production deployment
  candidate release-level evaluation.
- Clean-checkout, dependency-review, and operator-readiness publication
  decisions now also cap `Release supported` at their classified release level,
  preventing lower-scope evidence from supporting a higher release decision.
- Dependency-review, committee-governance, operator-readiness, and benchmark
  publication decisions now require `Environment = testnet` before
  `Release supported = production deployment candidate` can pass, keeping
  production-candidate support explicitly testnet-scoped instead of inferred
  from broader claim wording.
- Completed Gate 1, dependency-review, and operator-readiness evidence now
  also blocks `Release supported = none`, so a structurally complete artifact
  cannot close a gate while explicitly supporting no release level.
- The independent security review template now documents the existing
  `Release supported = none` blocker, keeping Gate 4 instructions aligned with
  the executable validator.
- Gate 1, dependency-review, trustless-burn, and operator-readiness evidence now
  require completed release-note update evidence instead of accepting a bare
  `Release notes updated = yes` assertion.
- The release checklist and security evidence matrix now surface those
  release-note evidence requirements for Gate 1, dependency review, Gate 5,
  Gate 4 review, and operator readiness, so external reviewers can reconcile
  validator requirements with release blockers without reading source code.
- The release gate now enforces release-note evidence terms on the Gate 1,
  Gate 4, and Gate 5 Pending Evidence Register rows, preventing a checked row
  from omitting release-note evidence required by the underlying validators.
- `release:gate` now consumes completed operator-readiness evidence through
  `--operator-readiness-evidence`, so Gate 6 operator claims require the actual
  `operator:validate` result, matching completed evidence target, and
  candidate-grade testnet publication fields instead of checklist prose alone.
- Backup-restore evidence now validates measured state value formats: status
  count maps, numeric row/history counts, hex rebuilt digests, numeric anchor
  heights, singleton digest classification, and runtime artifact hygiene cannot
  be replaced by narrative placeholders.
- Committee governance negative checks now require evidence to cite the rejected
  governance fact for old signer, non-committee signer, threshold, stale SCS
  NFT, emergency escape, broadcast-readiness, and wrong-network cases.
- Benchmark evidence now requires every linked metric row to include numeric
  `inputs=`, `outputs=`, `vars=`, and `batch=` cost-relevant counts, so scaling
  claims cannot be based on partial transaction-shape evidence.
- Benchmark sharded-lane evidence now requires lane-claim-focused artifact
  names or links, preventing generic review logs from closing distinct DUP,
  liquidity, SPVTracker, full-parallel boundary, or tracker-overlap rows.
- Trustless burn negative-test evidence now requires each linked artifact to
  cite the specific rejected burn proof fact, preventing generic rejection logs
  from satisfying distinct Gate 5 negative cases.
- Gate 5 trustless-burn evidence now requires explicit rejection evidence for
  unfinalized sidechain blocks, so SPV/finality integration cannot be closed by
  reorg-only or stale-tracker negative tests.
- External integration negative-review evidence now requires each linked
  artifact to cite the corrected misread category, preventing generic checklist
  links from satisfying distinct Gate 8 reviewer corrections.
- Security review linked evidence now requires completed review outputs,
  non-template evidence links, or artifact markers across scope coverage,
  evidence-package, finding-disposition, negative-check, and publication-update
  fields.
- Security review evidence-package reviewer notes now require concrete
  verification, acceptance, pass/fail, blocker, match, or reconciliation
  outcomes, so generic `reviewed` notes cannot close required evidence rows.
- Independent security review reviewer rows now apply claim/security-boundary
  checks to reviewer notes, so an actionable note that approves
  production-ready wording, mainnet-scoped release wording, open critical/high
  findings, open publication blockers, or accepted risks missing release
  artifacts cannot close Gate 4.
- Independent security review reviewer notes now also fail closed on failed
  validator or command markers, so security-review approval cannot coexist with
  `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Security review evidence-package artifacts now must identify the specific
  required item they close, so generic audit package links cannot satisfy
  distinct CI, devnet/testnet, failed-broadcast, backup-restore, batch
  settlement, or release-note evidence rows.
- Security review scope coverage now requires an area-specific risk-focus
  entry, so `covered`/`linked` scope rows cannot be closed by generic review
  notes.
- Security review finding disposition now treats non-zero publication blockers
  as hard blockers, and Gate 4 release rows must preserve
  `Publication blockers = 0` even when critical/high findings are closed.
- Security review finding disposition counts now require structured numeric,
  zero, none, or no values, so narrative `reviewed` notes cannot stand in for
  finding counts or open critical/high status.
- Independent security review negative-check answers now fail closed: unsafe
  path questions must explicitly answer no/cannot/rejected/blocked, while the
  operator SQLite-loss recovery question must explicitly answer yes/recoverable
  without private maintainer context.
- Independent security review final sign-off notes now require concrete Gate 4
  outcomes tied to scope coverage, evidence packages, critical/high findings,
  finding closure, publication blockers, negative checks, signer/broadcast
  controls, DUP/AVL/SPV behavior, trustless burn boundaries, operator recovery,
  dependency risk, release notes, or checklist updates; generic report review
  notes cannot pass.
- Independent security review lead-reviewer sign-off now must match the
  `Lead reviewer` identity in the Review Classification table, so a different
  approver cannot close Gate 4 after the external reviewer is named.
- Independent security review lead-reviewer sign-off dates now must use ISO
  calendar dates and cannot be before the review classification `Date`, so a
  pre-review approval cannot close Gate 4.
- Independent security review classification now requires a structured external
  reviewer organization type, so internal or maintainer-led review cannot close
  Gate 4 by filling only free-text reviewer fields.
- Independent security review classification now also requires a concrete
  external security reviewer organization or affiliation, so placeholders such
  as `external security team` or `TBD` cannot close Gate 4.
- Independent security review classification now also validates the review
  period as an ordered ISO date range, so stale or narrative review windows
  cannot close Gate 4.
- Independent security review classification also requires the review period
  to end no later than the review `Date`, preventing pre-signed or future-ended
  review windows from closing Gate 4.
- Independent security review publication decisions now require
  accepted-risk checklist updates, accepted-risk release-note updates, and a reviewer
  decision summary that names release support, production-ready claim handling,
  testnet production-candidate claim handling, critical/high findings, and
  accepted risks before Gate 4 can close.
- Independent security review release-gate rows now preserve
  `Final decision = approve`, `Critical/high findings open = 0`, and
  `Accepted risks reflected in release notes = yes`, so narrative review
  summaries cannot close Gate 4 without the approval facts required by the
  executable review template.
- Independent security review release-gate rows now also bind the structured
  row payloads returned by `security:validate`: completed area-specific scope
  evidence with risk-focus notes, item-specific evidence-package artifacts,
  completed finding closure evidence, expected negative-check answers,
  question-specific negative-check evidence, lead reviewer identity binding,
  and actionable reviewer notes are required, so generic `PASS`, `reviewed`,
  `approved`, or contradictory pass/failure row payloads cannot close Gate 4.
- Independent security review release-gate rows now apply the same fail-closed
  marker policy to reviewer notes, so approval rows cannot hide failed
  validator/command output or non-zero structural issues.
- Independent security review release-gate rows now also bind the structured
  Review Classification returned by `security:validate`: production-candidate
  support requires testnet scope, reviewed commit, concrete external reviewer
  organization, allowed organization type, independent external reviewer
  status, ISO review period/date, final approval, and reviewer sign-off
  identity/date consistency.
- Independent security review release-gate rows now also bind publication-update
  fields returned by `security:validate`: completed Gate 4 accepted-risk
  checklist and release-note update evidence must be concrete and internally
  non-contradictory, so a final publication decision or release-action sentence
  cannot close Gate 4 by itself.
- Independent security review release-gate rows now reject
  validation-target-only row evidence: `security review validation target`,
  `independent security review validation target`, `security validate target`,
  `validated target`, and `validated input` links bind validator provenance, but
  cannot close scope, evidence-package, finding, negative-check, or
  publication-update evidence rows by themselves.
- Independent security review release-gate rows now also reject reused
  completed row evidence targets across linked scope, evidence-package,
  finding, and negative-check rows, so one shared security-review artifact or
  log cannot close multiple row-specific checks.
- Independent security review release-gate rows now also apply the shared
  reviewer decision summary claim-boundary checks, so testnet
  production-candidate wording requires explicit reviewer handling in the
  validated security review summary.
- Independent security review publication decisions now reject unqualified
  production-ready claims even for production deployment candidate reviews, and
  can support that level only through `Testnet production-candidate claim
  allowed = yes` with `Production-ready claim allowed = no`.
- Gate 4 release-gate rows now preserve required scope coverage, required
  evidence package, finding disposition, negative review checks, critical/high
  finding status, publication blockers, final decision, and dependency-risk
  review requirements, so a scope-only security report cannot close the
  independent-review blocker.
- Release-note allowed-claim validation now blocks security review, audit,
  finding-disposition, or critical/high wording unless the independent security
  review evidence row is linked with completed evidence, so Gate 4 review
  claims cannot bypass the independent-review blocker through the claims table.
- Evidence validators now fail closed on blocking reviewer sign-offs across
  release notes, live rehearsals, clean checkout, backup-restore, dependency,
  governance, benchmark, trustless burn, and external integration evidence.
- Trustless burn reviewer decision summaries now must mention release support,
  trustless burn verification implementation, production-ready claim handling,
  testnet production-candidate claim handling, transitional trusted burn path
  handling, and critical/high findings, so a generic trustless-burn review note
  cannot close Gate 5.
- Trustless burn release-gate rows now also apply the shared reviewer decision
  summary claim-boundary checks, so a contradictory testnet production-candidate
  reviewer summary cannot bypass the `trustless:validate` publication decision.
- Dependency review evidence now requires the signer dependency upgrade
  decision to state either upstream release/conformance validation or an
  explicit fail-closed guard/blocker rationale; a generic pinning note cannot
  close the sigma-rust signer risk.
- Dependency review release actions now distinguish complete upstream signer
  resolution from fail-closed operation: upstream requires JVM/node conformance
  evidence, while fail-closed evidence must keep production-ready claims blocked.
- Dependency review upstream signer resolution now also requires a concrete
  upstream release identifier plus positive JVM golden-vector or live
  `/transactions/check` evidence, so generic "release validated" wording cannot
  close the signer blocker.
- Testnet pre-broadcast dry-run evidence now requires `/transactions/check PASS`
  and daemon approval check evidence to be internally positive; stale PASS text
  contradicted by `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
  `errors`, or non-zero `structural issues` cannot satisfy Gate 3 preparation.
- Dependency review signer resolution now requires the signer dependency
  decision's `Required evidence` cell to link completed upstream release and
  JVM/node conformance evidence; release-action text alone remains narrative
  and cannot support testnet production-candidate wording.
- Dependency review release-gate rows now bind the structured row payloads
  returned by `dependency:validate`: internally positive command-specific
  completed output evidence, dependency-specific source/risk/evidence payloads,
  completed triage evidence with explicit zero critical/high findings,
  completed upgrade evidence with decision-specific release actions, and
  actionable dependency-risk reviewer notes are required, so generic `PASS`,
  `reviewed`, `approved`, or contradictory command-output rows cannot close
  Gate 4.
- Dependency review release-gate rows now also bind the structured Review
  Classification returned by `dependency:validate`: production-candidate
  support requires `Release level = production deployment candidate`,
  `Environment = testnet`, `Lockfiles reviewed = yes`, a concrete Git commit,
  reviewer identity, and ISO date; reviewer sign-off identity/date must match
  those classification fields.
- Dependency review release-gate rows now also bind the publication-decision
  update evidence returned by `dependency:validate`: completed
  dependency-review release-note and checklist update targets are required, and
  those fields fail closed if completed evidence is mixed with `FAIL`,
  `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Dependency review release-gate rows now reject validation-target-only row
  evidence: `dependency review validation target`, `dependency validate
  target`, `validated target`, and `validated input` links bind validator
  provenance, but cannot close command, dependency-scope, triage, upgrade, or
  publication-update evidence rows by themselves.
- Dependency review release-gate rows now also reject reused completed row
  evidence targets across linked command, dependency-scope, triage, and upgrade
  rows, so one shared dependency-review artifact or log cannot close multiple
  row-specific checks.
- Dependency review release-gate rows now also apply the shared reviewer
  decision summary claim-boundary checks, so testnet production-candidate
  wording requires explicit reviewer handling in the validated dependency
  summary.
- Dependency review publication decisions now also block
  `Release supported = production deployment candidate` unless
  `Upstream signer blocker resolved = yes` and
  `Testnet production-candidate claim allowed = yes`, so fail-closed signer
  evidence cannot support a production deployment candidate release.
- Gate 4 signer dependency rows now preserve the current fail-closed
  institutional-reference publication facts exactly:
  `Release supported = institutional reference`,
  `Production-ready claim allowed = no`,
  `Testnet production-candidate claim allowed = no`,
  `Critical/high vulnerabilities open = 0`,
  `Upstream signer blocker resolved = no`, and
  `Release notes updated = yes`, so dependency evidence cannot silently
  move production-ready claim handling out of the blocked state while upstream
  signer conformance remains unresolved.
- Dependency review evidence in the security matrix now preserves the completed
  checklist-update evidence requirement alongside release-note update evidence,
  keeping the signer blocker aligned with the release gate.
- Dependency review fail-closed signer evidence now must cite completed
  ContextExtension guard evidence as part of the release action, so a generic
  fail-closed note cannot close the sigma-rust signer blocker.
- Gate 4 signer dependency rows now preserve no positive critical/high finding counts in linked triage.
- Release-note validation now requires a dedicated signer dependency
  conformance or fail-closed release-decision evidence row, so Gate 4 signer
  risk cannot be closed by generic ContextExtension or dependency-risk notes.
- Release-note allowed-claim validation now blocks ContextExtension signer
  guard, fail-closed guard, and signer-resolution wording unless the
  ContextExtension signer guard row is linked with completed evidence, so local
  guard claims cannot bypass the dedicated ContextExtension evidence row.
- Release-note allowed-claim validation now blocks signer dependency,
  ContextExtension, sigma-rust, upstream signer, or serializer wording unless
  the signer dependency evidence row is linked with completed evidence, so Gate
  4 signer-risk claims cannot bypass the upstream/fail-closed blocker through
  the claims table.
- Release-note allowed-claim validation now blocks broadcast, broadcast-gate,
  broadcast-opt-in, transaction-broadcast, and sign-and-submit wording unless
  the broadcast gate evidence row is linked with completed evidence, so
  broadcast-surface claims cannot bypass the explicit opt-in/broadcast safety
  gate.
- Release-note allowed-claim validation now blocks dependency-risk,
  dependency-register, toolchain, lockfile, supply-chain, and
  vulnerability-triage wording unless the dependency risk review evidence row is
  linked with completed evidence, so general dependency claims cannot bypass the
  Gate 4 dependency-risk review.
- Dependency review linked rows now require completed command, dependency
  scope, vulnerability triage, upgrade, or checklist-update evidence; template
  links and bare validator command names cannot close Gate 4 dependency
  evidence.
- Dependency review dependency-scope evidence now must cite the reviewed
  dependency/toolchain, preventing generic dependency artifacts from satisfying
  distinct Gate 4 scope rows.
- Dependency scope risks now have dependency-specific focus requirements, so
  generic `reviewed`/`tested` notes cannot close signer, Fleet SDK, AVL, SQLite,
  EVM, WASM toolchain, or npm lockfile dependency review rows.
- Release-note allowed-claim validation now blocks threat-model,
  evidence-matrix, risk-class, attack-chain, and mitigation wording unless the
  threat model and evidence matrix row is linked with completed evidence, so
  risk coverage claims cannot bypass the canonical threat-model evidence.
- `release:gate` now also requires linked threat-model/evidence-matrix release
  notes to be backed by `npm run threat-model:validate` and
  `--threat-model-evidence`, consuming structured security evidence matrix rows
  instead of accepting a PASS summary or narrative risk note.
- Release checklist and release-notes validators now require every `Checked`
  publication blocker to carry a link, command, or artifact marker for the
  resolving evidence.
- Production deployment candidate release notes now require every required
  evidence row to be linked and every required publication blocker to remain
  visible as `Checked` with resolving evidence.
- Publication hygiene tests now verify that the evidence matrix stays linked to
  existing test files and keeps conservative non-audit/non-production wording.
- Publication hygiene tests now validate the evidence matrix table structure,
  allowed statuses, and local evidence paths.
- Publication hygiene tests now require the evidence matrix to cover the main
  threat-model risk areas: ContextExtension, broadcast, mempool `HEIGHT`,
  duplicate prevention, batch reconciliation, anchors, singletons, phantom
  burns, and operational recovery.
- Publication hygiene tests now lock the aggregate settlement threat model to
  its required high-risk finding set, including the mempool `HEIGHT` exactness
  liveness trap.
- Contract invariant tests now guard against exact `HEIGHT` equality in
  ErgoScript, verify the SideChainState mempool-safe timestamp pattern, and
  lock mutable singleton successor continuity for script, NFT, value, and
  authorization metadata.
- Unlock contract invariant tests now lock normal, aggregate, batched, and
  emergency payouts to the recipient and amount encoded in the claim data.
- WASM AVL tests now prove the batch insert proof is not the last sequential
  single-key proof and is not concatenated sequential single-key proofs.

## Track 7 -- Operator Runbooks And Incident Response

**Goal:** an external team can operate the bridge without private hand-holding.

Required gates:

- Deploy runbook.
- Upgrade/migration runbook.
- Pause and resume runbook.
- Settlement failure runbook.
- Reorg recovery runbook.
- Key rotation runbook.
- Storage-rent maintenance runbook.
- Monitoring and alerting runbook.
- Rollback plan for each high-risk operation.

Done when:

- A new operator can execute a staging deployment from docs alone.
- Every runbook has stop conditions and verification commands.

Current status:

- `docs/operator-runbooks.md` now contains eleven minimum operator runbooks,
  plus a dedicated SQLite/AVL backup and restore runbook. They still need live
  staging rehearsal and incident-specific refinements before publication.
- Publication hygiene tests now enforce that every numbered runbook has explicit
  stop conditions, at least one runnable verification command block, and the
  expected runbook heading set.
- The release checklist now mirrors the full runbook set, and publication
  hygiene tests keep Gate 6 aligned with those operator procedures.
- Operator readiness evidence now has a structured template and executable
  validator, so Gate 6 can require linked runbook coverage, command output,
  incident drills, operational decisions, and reviewer sign-off before any
  operator-ready release claim.
- Operator readiness evidence validation now requires linked operational
  decisions to include actionable stop conditions, so Gate 6 cannot pass on
  narrative acceptance notes without explicit stop, block, fail, disable,
  pause, incident, do-not, or refuse criteria.
- Operator readiness evidence validation now also requires linked runbook
  coverage to mention both stop-condition and verification-command checks, and
  linked incident drills to state actionable recovery outcomes instead of
  generic review notes.
- Operator readiness runbook coverage now requires linked evidence to identify
  the covered runbook, so a generic operator review artifact cannot satisfy
  dry-run, deployment, broadcast, daemon, triage, reorg, pause/resume,
  key-rotation, storage/liquidity, incident, monitoring, or SQLite/AVL restore
  coverage rows.
- Operator readiness rows marked `linked` now require completed runbook,
  command, drill, or decision evidence; template links and bare validator
  command names alone cannot close Gate 6 operator-readiness evidence.
- Operator readiness command rows now require command-specific output evidence,
  and operational decision rows now require decision-specific evidence, so a
  generic operator review artifact cannot satisfy command execution, runbook
  discovery, stop-condition execution, monitoring, incident escalation, backup
  restore, governance rotation, or broadcast opt-in decisions.
- Gate 6 operator command output evidence must now be internally positive:
  `PASS`, `passed`, `success`, or `exit code 0` cannot close a command row
  when the same evidence reports `FAIL`, `BLOCKED`, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`.
- Operator readiness required checklist updates now use the same
  completed-evidence rule, so a template link or `npm run operator:validate`
  alone cannot close Gate 6.
- Operator readiness publication decisions now reject production-ready claims
  unconditionally; mainnet production-ready claims remain forbidden even when
  the evidence supports an operator-ready testnet candidate.
- Operator readiness publication decisions now reject production deployment
  candidate support unless the evidence also allows the operator-ready claim
  and the separate testnet production-candidate claim, so Gate 6 cannot mark a
  testnet candidate path as supported while withholding operator-ready approval.
- Operator readiness reviewer decision summaries now must mention release
  support, operator-ready claim handling, production-ready claim handling,
  testnet production-candidate claim handling, and critical incidents, so a
  generic operator approval cannot bound Gate 6 publication claims.
- Operator readiness release-gate rows now also apply the shared reviewer
  decision summary claim-boundary checks, so a contradictory testnet
  production-candidate reviewer summary cannot bypass the `operator:validate`
  publication decision.
- Gate 6 operator-readiness release-gate rows now preserve
  `Critical incidents open = 0`, so operator-readiness evidence cannot close
  while leaving open critical incidents ambiguous.
- Operator readiness reviewer sign-off notes now require a concrete
  operator-readiness outcome tied to evidence, runbooks, commands, drills,
  decisions, stop conditions, release, or Gate 6 review; generic `reviewed`
  notes cannot approve Gate 6.
- Operator readiness runbook-operator sign-off now must match the `Reviewer`
  identity in Readiness Classification, so a different approver cannot close
  Gate 6 operator-readiness evidence after the runbook operator is named.
- Operator readiness runbook-operator sign-off dates now must use ISO calendar
  dates and cannot be before Readiness Classification `Date`, so pre-readiness
  approvals cannot close Gate 6 operator-readiness evidence.
- Gate 6 release-gate evaluation now requires operator readiness evidence to
  expose classified `Broadcast mode = disabled` or `dry-run`, so missing
  broadcast-mode provenance cannot support operator-ready testnet candidate
  claims.
- Gate 6 operator-readiness release-gate evaluation now also binds structured
  Readiness Classification provenance: production-candidate support requires
  a concrete Git commit, testnet environment, external/exchange operator type,
  reviewer identity, ISO classification date, and matching Runbook operator
  sign-off.
- Gate 6 operator-readiness evidence is now a canonical Pending Evidence
  Register blocker requiring linked runbook coverage, command output, recovery
  drills, operational decisions, command-specific and decision-specific
  evidence, actionable stop conditions, release support, reviewer summary, and
  completed operator-readiness release-note/checklist update evidence.
- Gate 6 operator-readiness release-gate evaluation now re-checks structured
  row payloads from `operator:validate`, so row names plus `linked` statuses
  cannot close operator readiness without completed runbook targets,
  command-specific output, actionable recovery outcomes, decision-specific
  evidence, actionable stop conditions, Runbook operator identity binding, and
  actionable reviewer notes.
- Gate 6 operator-readiness linked runbook, drill, and operational-decision
  evidence now fails closed on failed validator or command markers, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`, while still
  allowing expected operator stop/block/recovery outcomes in the row-specific
  outcome and stop-condition fields.
- Gate 6 operator-readiness row evidence now treats `operator readiness
  validation target`, `operator validate target`, `validated target`, and
  `validated input` links as validator provenance only, so those bindings
  cannot stand in for completed runbook, command, drill, decision,
  release-note, or checklist evidence.
- Gate 6 operator-readiness release-gate evaluation now also rejects reused
  completed row evidence targets across linked runbook, command, drill, and
  decision rows, so one shared operator artifact or log cannot close multiple
  runbook/recovery checks.
- Gate 6 operator-readiness reviewer rows now apply claim/operator-boundary
  checks to reviewer notes, so an actionable note that approves
  production-ready wording, mainnet-scoped release wording, open critical
  incidents, or non-opt-in broadcast enablement cannot close Gate 6.
- Gate 6 operator-readiness reviewer notes now also fail closed on failed
  validator or command markers, so operator-readiness approval cannot coexist
  with `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Gate 6 operator-readiness release-gate evaluation now also binds
  publication-update fields returned by `operator:validate`: completed
  operator-readiness release-note/checklist update evidence must be concrete
  and internally non-contradictory before operator-ready testnet candidate
  claims can be evaluated.
- Release-note allowed-claim validation now blocks operator readiness, runbook,
  incident, monitoring, or operability wording unless the operator readiness
  evidence row is linked with completed evidence, so Gate 6 operator claims
  cannot bypass the runbook/recovery evidence blocker through the claims table.
- Publication hygiene tests now lock the incident-response runbook to required
  classes: duplicate/DUP ambiguity, signer/broadcast anomaly, node mismatch,
  reorg ambiguity, anchor/SPV mismatch, singleton invariant break,
  liquidity/rent break, and dependency/serializer regression.
- Publication hygiene tests now lock the monitoring runbook to required bridge
  health signals: daemon liveness, broadcast policy, signer/ContextExtension,
  DUP reconciliation, SPV/anchor health, singleton integrity, liquidity/rent,
  and dependency/clean-checkout drift.
- State-tracker tests now prove a restored SQLite backup preserves peg-out
  lifecycle rows, persisted anchor height, DUP history, SPV tracker history,
  pending DUP heartbeat records, and rebuildable DUP/SPV AVL digests.
- Backup-restore evidence validation now requires every linked state
  consistency row to match its pre-backup value exactly; mismatches must remain
  blockers and route through incident response.
- Linked backup-restore state consistency rows now require state-specific
  evidence markers, so generic restore artifacts cannot close peg-out,
  reconciliation, DUP/SPV history, digest, anchor, heartbeat, singleton, or
  runtime hygiene comparisons.
- Linked backup-restore stop conditions now require both a proof marker and an
  actionable stop/block/incident/runbook resolution, so a restore drill cannot
  pass on an unevidenced "checked and not hit" note.
- Linked backup-restore stop conditions now also require condition-specific
  evidence for daemon/WAL state, DUP/SPV digest mismatch, pending settlement
  paid-recipient risk, runtime backup artifacts in git status, or manual SQLite
  edits before chain-state classification.
- Backup-restore reconstructibility boundaries now require boundary-specific
  evidence, so generic restore artifacts cannot close local-state,
  WAL/SHM, AVL reconstruction, incident, or secret-hygiene claims.
- Backup-restore rows marked `linked` now require completed command-output,
  state, boundary, or stop-condition evidence targets; template links,
  targetless command-output notes, and bare validator command names alone
  cannot close Gate 3 recovery evidence.
- Linked backup-restore command rows now require command-specific evidence
  signals, so generic restore artifacts cannot close daemon/broadcast,
  SQLite/WAL backup, isolated restore, DUP/SPV rebuild, comparison, or git
  hygiene steps.
- Backup-restore git hygiene evidence now must cite completed
  `git status --short` output, completed `git diff --check` output, and a
  no-staged-runtime-artifacts result, so generic git hygiene artifacts cannot
  close Gate 3 recovery evidence.
- The release gate now requires the backup-restore Pending Evidence Register
  row to mention command-specific and state-specific consistency evidence,
  keeping the executable blocker aligned with the backup-restore validator.
- Release notes now preserve row-specific blocker resolution terms from the
  Pending Evidence Register, so public notes cannot reduce checklist blockers
  to generic artifact links.
- Release notes required-evidence rows now require evidence-class-focused
  artifact names or links, preventing generic release review artifacts from
  closing distinct CI, lifecycle, signer, broadcast, recovery, operator,
  dependency, review, trustless-burn, or benchmark evidence rows.
- Release notes trust-assumption evidence now requires assumption-specific
  artifact names or links, preventing generic release review artifacts from
  closing distinct trusted-oracle, ContextExtension, governance, broadcast,
  SQLite/AVL recovery, or external-review assumptions.
- Release notes allowed-claim evidence now requires claim-focused artifact
  names or links, preventing generic release review artifacts from authorizing
  publication wording.
- Release notes operator-impact rows now require area-focused action or stop
  wording, preventing generic release runbook notes from closing distinct
  deployment, broadcast, backup-restore, monitoring, or incident impacts.
- Release-note reviewer sign-offs now require concrete claim-control notes,
  preventing bare `approve` rows from closing claims, blocker, evidence,
  trust-assumption, operator-impact, scope, production, gate, or publication
  review.
- Release-note reviewer sign-offs now also require role-specific review scope,
  so maintainer, security, and operator approvals cannot all use the same
  generic approval note.
- Release-note validation now enforces canonical table headers, including the
  Sign-Off `Notes` column, so a copied release artifact cannot drop structured
  claim-control rationale while keeping otherwise valid rows.
- Release-note maintainer sign-off now must match the `Decision owner` identity
  in Release Classification, so a different approver cannot close the
  release-note decision after the fact.
- Release-note decisions now remain blocked while any non-scoped publication
  blocker is unresolved, preventing a proposed release from coexisting with
  still-open public-release blockers.
- Backup-restore reviewer sign-off notes now require concrete recovery outcomes
  tied to backup, restore, SQLite/WAL/SHM handling, AVL/DUP/SPV rebuilds, state
  consistency, reconstructibility, stop conditions, incident response, runtime
  artifact hygiene, or Gate 3 review; generic restore review notes cannot pass.
- Backup-restore reviewer sign-off notes now also fail closed on contradictory
  validator or command failure markers, so an actionable recovery approval
  cannot coexist with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
  non-zero `errors`, or non-zero `structural issues`.
- Live rehearsal evidence now has a structured template in
  `docs/live-rehearsal-template.md` so local-devnet, staging, and testnet runs
  capture comparable preflight, dry-run, broadcast, confirmation, reconciliation,
  rollback, and reviewer sign-off data.
- The rehearsal evidence validator now rejects blank operational evidence
  sections, so a lifecycle table cannot pass without filled preflight, dry-run,
  broadcast, confirmation, reconciliation, rollback, and sign-off fields.
- Live rehearsal lifecycle statuses now enforce pass dependencies, so fresh
  devnet/testnet lifecycle rows cannot pass unless peg-in, peg-out burn, anchor,
  settlement check, submit, confirmation, and reconciliation rows also pass.
- Fresh local-devnet lifecycle evidence now requires Session Metadata to
  identify `Environment: local devnet` before the Gate 3 local-devnet row can
  pass.
- Fresh testnet lifecycle evidence now requires Session Metadata to identify
  `Environment: testnet` and Ergo node network testnet, plus clean deployment
  state evidence with a concrete 32-byte deployment-state hash or digest,
  concrete 32-byte contract ID, and concrete 32-byte singleton inventory
  identifier before the Gate 3 testnet row can pass.
- Fresh testnet lifecycle evidence artifacts now must cite the same peg-out burn
  TX ID, sidechain block hash, Expected transaction ID, and submitted
  transaction ID captured in the rehearsal sections, so a generic testnet
  lifecycle marker cannot close Gate 3.
- Fresh testnet confirmation evidence now must record the required confirmation
  count, `Confirmation policy met: yes`, and observed confirmation count
  greater than or equal to the required confirmation count, with completed
  finality evidence linked from the confirmation policy field before a Gate 3
  testnet lifecycle pass can close.
- Live rehearsal lifecycle rows and required operational evidence fields now
  require completed rehearsal outputs, non-template evidence links, or artifact
  markers; template links and bare validator command names cannot close Gate 3
  lifecycle evidence.
- Live rehearsal lifecycle evidence artifacts now must identify the lifecycle
  row they close, so a generic rehearsal review log cannot satisfy distinct
  peg-in, peg-out burn, anchor, settlement check, submit, confirmation,
  reconciliation, failed-broadcast, reorg, or backup-restore rows.
- Live rehearsal non-passing rows now require actionable blocking notes and
  next-evidence actions, so generic `reviewed`, `later`, or `see checklist`
  notes cannot hide Gate 3 failures, inconclusive runs, publication blockers, or
  scoped-out evidence.
- Live rehearsal evidence now rejects duplicate lifecycle rows and duplicate
  required list fields, so a rehearsal cannot carry conflicting Gate 3 statuses
  or operational facts for the same required item.
- Release-note allowed-claim validation now blocks local devnet, testnet,
  peg-in, peg-out, submit, confirmation, and reconciliation wording unless the
  matching lifecycle evidence row is linked with completed evidence, so Gate 3
  lifecycle claims cannot bypass live rehearsal evidence through the claims
  table.
- The rehearsal evidence validator now rejects ambiguous critical outcome
  values, requiring explicit `yes`, `pass`/`PASS`, `confirmed`/`settled`, and
  `yes`/`no` decisions for lifecycle safety, readiness, reconciliation,
  rollback, manual-repair, and regression-update fields.
- The rehearsal evidence validator now requires broadcast mode to be disabled
  at both session start and session end; live broadcast windows must be captured
  in the explicit Broadcast Enablement Evidence section.
- Broadcast enablement evidence now requires `Reviewer approval recorded` to
  name the Session Metadata reviewer, state explicit live broadcast approval,
  and cite the dry-run Expected transaction ID, so a generic broadcast-approval artifact
  cannot authorize a live settlement submission.
- Broadcast enablement evidence now also requires separate `User approval
  recorded` evidence that states explicit user approval for the live broadcast
  window and cites the dry-run Expected transaction ID, so reviewer approval or
  readiness PASS output cannot authorize a broadcast by itself.
- Broadcast enablement evidence now requires the
  `BRIDGE_BROADCAST_ENABLED=true` scoped-shell row to include completed
  evidence, cite `BRIDGE_BROADCAST_ENABLED=true`, contain `yes`, name the
  intended shell, and state limited scope, so a bare `yes` cannot authorize a
  live settlement submission.
- Post-enable readiness command evidence now must cite completed
  `npm run demo:readiness` output with `PASS`, so a generic readiness artifact
  cannot close the live broadcast gate.
- Broadcast policy and live settlement readiness `PASS` rows now require
  completed `npm run demo:readiness` output that cites the `Broadcast policy`
  and `Live settlement signing` check lines, so a bare `PASS` or generic
  artifact cannot close the live broadcast gate.
- Broadcast enablement evidence now requires `Node URL and network
  re-confirmed` to cite a concrete `Node URL` and name the Session Metadata
  Ergo node network and Sidechain network, so a generic network artifact cannot
  close the live-submit gate.
- Gate 3 live rehearsal Pending Evidence Register rows now preserve broadcast
  disabled start/end and cleanup evidence, so a live lifecycle, failed
  broadcast, or reorg recovery blocker cannot close while broadcast state is
  only implied by the template.
- Live rehearsal reconciliation evidence now must cite submitted successor and burn values
  from the same run: submitted transaction ID, submitted DUP successor box ID,
  submitted SPV tracker successor box ID, peg-out burn TX ID, and recipient
  payout box ID.
- Gate 3 recovery evidence now binds to rehearsal identifiers:
  failed-broadcast evidence now must cite Expected transaction ID and peg-out
  burn TX ID, while stale-singleton evidence now must cite singleton inventory identifier
  alongside the reorged burn TX ID.
- Gate 3 recovery row closure now requires a separate structured recovery
  observation artifact from the read-only `rehearsal:recovery-observe` helper,
  validated by `rehearsal:recovery-observe:validate`, so failed-broadcast and
  reorg/stale-singleton rows cannot pass on narrative drill notes without
  node/state observation boundaries, `sourceBindings` provenance for the live
  read-only node and read-only state tracker, no serialized runtime database
  path, and `recovery-observe JSON validation PASS`.
  The recovery observation JSON validator now also requires the PASS `message`
  to be internally positive and rejects stale PASS text that is contradicted by
  `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
  non-zero `structural issues`.
  The recovery row assembly helper now reads the same local JSON through
  `--observation-json` and fails before writing row evidence if that structured
  observation does not validate.
- Backup-restore evidence now requires non-isolated reviewed restore targets to
  link completed reviewer approval evidence and rollback plan evidence, so a
  runtime database restore cannot pass on the word `reviewed` alone.
- Backup-restore release-gate resolution now must mention stop-condition
  classifications and reviewer sign-off, keeping the Pending Evidence Register
  aligned with the executable recovery template.
- `release:gate` now accepts `--backup-restore-evidence` and reads the actual
  completed backup-restore Markdown artifact through the structured validator,
  so Gate 3 backup-restore closure and testnet production-candidate claims
  cannot rely on a targetless `backup:validate PASS` note, a standalone `.md`
  link, or a completed Markdown target that appears only inside the
  `backup:validate` command output.
- Backup-restore release-gate binding now re-checks structured row payloads for
  command-specific output, measured state evidence, boundary evidence,
  condition-specific stop resolutions, completed Gate 3 publication update
  targets, and concrete reviewer outcome notes, so generic `PASS`, `approved`,
  `reviewed`, or `completed-pass` payloads cannot stand in for the rows.
- Backup-restore release-gate binding now also requires distinct completed
  evidence targets across linked command, state, boundary, stop-condition, and
  publication-update rows, so one artifact cannot close multiple Gate 3
  backup-restore obligations.
- Backup-restore reviewer rows now apply claim/recovery-boundary checks to
  reviewer notes, so an actionable note that approves production-ready/mainnet
  wording, testnet production-candidate wording by the drill, an unreviewed
  live/runtime restore target, or staged runtime backup artifacts cannot close
  Gate 3 backup-restore evidence.
- Backup-restore reviewer rows now also reuse the backup-restore
  contradictory-evidence marker check, so a reviewer note that approves a
  concrete recovery outcome while reporting failed validation, `ERROR`, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues` cannot close
  Gate 3.
- Backup-restore release-gate binding now also re-checks the structured Drill
  Classification provenance: drill name, Git commit, testnet environment,
  disabled or dry-run broadcast mode, source-state scope, isolated or reviewed
  restore target, reviewer identity, and ISO date. A backup-restore `PASS`
  object without that classification cannot support testnet-scoped release
  evaluation.
- Legacy V1 rehearsal JSON inputs are no longer release-gate authorities.
  Structured parsers may still inspect immutable historical artifacts, but
  `release:gate` does not accept preflight, window-prep, aggregate-prebroadcast,
  offline-gate, or prep-bundle JSON flags. Gate 3 instead requires the activated
  external-fee profile and its current assembly, live-preflight, checkpoint,
  post-submit, recovery, and target-node acceptance evidence.
- `release:gate` now accepts `--live-rehearsal-evidence` and reads the actual
  completed Live Rehearsal Evidence Markdown through `rehearsal:validate`, so
  Gate 3 Fresh Ergo testnet lifecycle closure and testnet production-candidate
  claims cannot rely on checklist prose or a bare `rehearsal:validate PASS`
  note without a linked completed rehearsal target, distinct validation output
  target, and passing `Fresh testnet lifecycle` row.
- Live rehearsal release-gate binding now requires passing lifecycle rows to
  carry gate-specific completed evidence artifacts, so a generic completed
  lifecycle artifact cannot stand in for Fresh local devnet, Fresh testnet,
  peg-in, peg-out, anchor, settlement, recovery, or backup lifecycle rows.
- Live rehearsal lifecycle rows now reject validation-target-only pass
  evidence: `rehearsal validation target`, `rehearsal validate target`,
  `validated target`, and `validated input` bind validator provenance, but
  each passing row still needs separate completed lifecycle evidence before the
  validation command or target binding.
- Live rehearsal Markdown validation now rejects copied live-preflight,
  `/transactions/check`, and daemon approval PASS excerpts when the same text
  also reports `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
  `errors`, or non-zero `structural issues`.
- Rehearsal assembly report binding now requires the embedded
  `rehearsalValidation` object to expose the structured lifecycle rows, so an
  assembly JSON with only `status: PASS` and empty errors cannot stand in for
  the validator's row output.
- Testnet production-candidate Release Decision evaluation now reuses the Gate
  3 lifecycle JSON identity invariant: aggregate prebroadcast,
  fresh-checkpoint, live-preflight, post-submit observe, and assembly-report
  validations must share one Expected transaction ID, and the post-submit plus
  assembly submitted transaction IDs must match that Expected transaction ID;
  aggregate prebroadcast claim burn hashes must also match the live-preflight
  approval burn set.
- Gate 1 clean-checkout validation now rejects row-named non-concrete artifact
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in command, workflow,
  reproducibility-decision, and publication-update rows, so final-branch
  evidence cannot be closed by a placeholder path that only mirrors the row
  name.
- Gate 1 clean-checkout validation now rejects validation-target-only row
  evidence: `clean checkout validation target`, `ci validate target`,
  `validated target`, and `validated input` bind validator provenance only and
  cannot close command, workflow, reproducibility-decision, release-note, or
  checklist rows.
- Gate 1 clean-checkout validation now rejects contradictory workflow,
  reproducibility-decision, and release-gate command evidence markers. The
  expected `npm run release:gate` command may remain `BLOCKED` only when paired
  with `0 structural issues`; non-zero structural issues, non-zero errors,
  `FAIL`, `ERROR`, or non-zero `exit code` still block the row.
- Gate 4 independent security review binding now rejects row-named
  non-concrete artifact targets such as `generic-*`, `placeholder-*`,
  `todo-*`, `tbd-*`, `sample-evidence-*`, and `example-evidence-*` in
  structured scope, evidence-package, finding, negative-check, and
  publication-update rows, so matching a row label inside a placeholder
  artifact path cannot stand in for concrete completed review evidence.
- Gate 4 dependency review validation now rejects row-named non-concrete
  artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in command, dependency-scope,
  triage, upgrade, and publication-update rows, so signer/dependency evidence
  cannot be closed by a placeholder path that merely embeds the row label.
- Gate 4 dependency review validation now fail-closes linked dependency-scope,
  vulnerability-triage, and upgrade evidence when completed row evidence is
  mixed with failed validator/command markers, `ERROR`, non-zero `exit code`,
  non-zero `errors`, or non-zero `structural issues`, so a stale PASS or
  linked artifact cannot mask a failed dependency row.
- Gate 5 trustless-burn validation now rejects row-named non-concrete artifact
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in component, commitment,
  burn-proof, positive, negative, and publication-update rows, so protocol
  evidence cannot be closed by a placeholder path that only mirrors the row
  name.
- Gate 6 committee-governance validation now rejects row-named non-concrete
  artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in scope, command, rotation,
  positive-check, negative-check, and publication-update rows, so key-rotation
  evidence cannot be closed by a placeholder path that only mirrors the row
  name.
- Gate 6 committee-governance validation now rejects validation-target-only row
  evidence: `governance validation target`, `committee governance validation
  target`, `governance validate target`, `validated target`, and `validated
  input` bind validator provenance only and cannot close scope, command,
  rotation, positive-check, negative-check, release-note, or checklist rows.
- Gate 6 operator-readiness validation now rejects row-named non-concrete
  artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in runbook, command, drill,
  decision, and publication-update rows, so operational readiness cannot be
  closed by a placeholder path that only mirrors the row name.
- Gate 7 benchmark validation now rejects row-named non-concrete artifact
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in metric, sharded-lane,
  bottleneck, and publication-update rows, so scaling evidence cannot be
  closed by a placeholder path that only mirrors the row name.
- Gate 7 benchmark validation now rejects validation-target-only row evidence:
  `benchmark validation target`, `benchmark validate target`, `validated target`,
  and `validated input` bind validator provenance only and cannot close metric,
  sharded-lane, bottleneck, live-batch, release-note, or checklist rows.
- Gate 7 benchmark validation now also applies fail-closed failure-marker
  checks to reviewer notes when they report failed validation or command
  evidence, while still allowing notes that explicitly block production
  throughput claims.
- Gate 8 external-integration validation now rejects row-named non-concrete
  artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in entry-point, fresh-checkout,
  decision, negative-review, and publication-update rows, so integration review
  evidence cannot be closed by a placeholder path that only mirrors the row
  name.
- Gate 8 external-integration validation now rejects validation-target-only row
  evidence: `integration validation target`, `external integration validation
  target`, `integration validate target`, `validated target`, and `validated
  input` bind validator provenance only and cannot close entry-point,
  fresh-checkout, decision, negative-review, release-note, or checklist rows.
- Gate 8 external-integration linked entry-point, decision, and negative-review
  evidence now fails closed on failed validator or command markers, non-zero
  `exit code`, non-zero `errors`, or non-zero `structural issues`, while still
  allowing expected integration blockers and corrected misreads in the
  row-specific answer/correction fields.
- Gate 2 technical-addendum validation now rejects row-named non-concrete
  artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in gate-map,
  architecture-decision, and publication-update rows, so the architecture manual
  cannot be closed by a placeholder path that only mirrors the row name.
- Gate 3 live-rehearsal validation now rejects row-named non-concrete artifact
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in structured lifecycle rows,
  so local-devnet or testnet lifecycle closure cannot be claimed through a
  placeholder path that only mirrors the row name.
- Gate 3 release-gate JSON provenance rejects non-concrete JSON targets such
  as `generic-*`, `placeholder-*`, `todo-*`, and `tbd-*` across top-level
  `--assembly-report-json`, `--fresh-checkpoint-json`, `--live-preflight-json`,
  `--post-submit-observe-json`, and `--recovery-observe-json` bindings, plus
  live-preflight approvals. Fresh-checkpoint
  provided height-evidence and singleton-checkpoint JSON sources also reject
  `template-*`, `example-*`, `sample-*`, `generic-*`, `placeholder-*`,
  `todo-*`, and `tbd-*`, so a correctly named `.json` placeholder cannot stand
  in for a completed read-only evidence artifact.
- `rehearsal:live-preflight` and `rehearsal:assemble` now reject both structured
  and text-form legacy V1 PASS evidence with the standard quarantine error after
  retaining target and binding diagnostics. `release:gate` additionally requires
  the separately versioned activated external-fee profile, so renamed legacy
  reports or placeholder targets cannot become Gate 3 authority.
- `rehearsal:post-submit` now rejects non-concrete submit, confirmation,
  finality, reconciliation, and live-preflight report targets such as
  `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-*`, and
  `example-*`, so post-submit evidence cannot be assembled from row-named
  placeholder artifacts.
- `rehearsal:post-submit` also rejects the legacy V1 live-preflight schema, so a
  stale or internally consistent historical PASS cannot create new post-submit
  evidence after quarantine.
- Post-submit observe JSON validation now rejects row-named non-concrete
  `livePreflightBinding.target` and `finalityEvidenceArtifact` provenance
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-*`,
  and `example-*`, so structured post-submit evidence cannot pass on
  placeholder live-preflight or finality bindings.
- Release-gate now re-checks the same post-submit observe output-shape binding
  from `--post-submit-observe-json`, including ordered successor and payout
  positions against `settlementOutputs.boxIds`, so a mocked validation result
  cannot provide only live-preflight, confirmation, and boundary summaries.
- `rehearsal:recovery-drill` now rejects non-concrete recovery row evidence,
  validation, and observation artifact targets such as `generic-*`,
  `placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
  `example-evidence-*`, so failed-broadcast and reorg/stale-singleton recovery
  rows cannot be assembled from row-named placeholder artifacts.
- Gate 3 backup-restore validation now rejects row-named non-concrete artifact
  targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
  `sample-evidence-*`, and `example-evidence-*` in command, state, boundary,
  stop-condition, publication-update, restore-target approval, and snapshot
  provenance evidence, so placeholder recovery artifacts cannot close the
  reconstructibility drill. Backup-restore rows also fail closed when concrete
  artifacts carry pass-like command or validation notes alongside `FAIL`,
  `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Gate 3 backup-restore reviewer notes are now included in the same
  fail-closed marker policy, so completed reviewer approval text cannot mask a
  failed backup-restore validator or non-zero structural issue signal.
- Gate 3 backup-restore rows now also reject validation-target-only evidence:
  `backup-restore validation target`, `backup validate target`, `validated
  target`, and `validated input` links bind validator provenance, but command,
  state, boundary, stop-condition, publication-update, restore-target approval,
  and snapshot-provenance rows still need separate completed row evidence.
- Release-gate Markdown evidence target binding now rejects non-concrete
  completed document targets such as `generic-*`, `placeholder-*`, `todo-*`,
  `tbd-*`, `sample-evidence-*`, and `example-evidence-*` for clean-checkout,
  backup-restore, dependency, security, trustless-burn, governance, operator,
  benchmark, integration, technical-addendum, and live-rehearsal evidence, so a
  validator PASS transcript cannot close a gate by binding to the same
  placeholder Markdown document named as completed evidence.
- Release-gate validator-output binding now also requires concrete validation
  log, transcript, CI, or workflow artifact targets for Markdown-backed gates,
  so a dependency/security/trustless/governance/operator/benchmark/integration,
  technical-addendum, release-notes, backup-restore, clean-checkout, or
  live-rehearsal PASS line recorded under `generic-*`, `placeholder-*`,
  `todo-*`, `tbd-*`, `sample-evidence-*`, or `example-evidence-*` cannot stand
  in for the validator transcript.
- Release-gate validator-output parsing also treats contradictory output as
  failing evidence: a segment that carries `FAIL`, `BLOCKED`, `ERROR`,
  non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`
  cannot be rescued by an older `PASS` or `exit code 0` note in the same
  transcript segment.
- Phase 007 gated architecture manual evidence now has
  `docs/testnet-production-candidate-architecture-manual-template.md` and
  `npm run addendum:validate`, so the technical addendum can be reviewed as a
  structured, testnet-only, non-mainnet claim artifact. Passing
  `npm run addendum:validate` does not authorize public wording unless
  `npm run release:gate -- --technical-addendum-evidence` also consumes the
  completed addendum evidence and the full release gate passes with completed
  evidence.
- Gate 2 release-gate binding now requires the completed technical-addendum
  document target to appear as completed evidence outside the validator output
  segment, so a validation-only target binding cannot stand in for the manual
  artifact.
- Gate 2 technical-addendum validation now also rejects validation-target-only
  row evidence: `technical addendum validation target`, `addendum validate
  target`, `addendum validation target`, `validated target`, and `validated
  input` bind validator provenance only and cannot close gate-map,
  architecture-decision, release-note, or checklist update rows.
- Gate 2 release-gate binding now also validates the structured row payloads
  returned by `addendum:validate`: gate-specific evidence, completed artifact
  evidence, bounded claim boundaries, decision-specific positions, completed
  decision evidence, and actionable reviewer notes are required. Generic `PASS`,
  `reviewed`, or `approved` row payloads cannot close Gate 2, and concrete row
  artifacts fail closed when they carry pass-like command or validation notes
  alongside `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
  `errors`, or non-zero `structural issues`.
- Gate 2 release-gate binding now rejects reused completed evidence targets
  across linked or passed gate-map rows and linked architecture-decision rows,
  so one shared architecture-manual artifact cannot close multiple Gate 2
  facts.
- Gate 2 technical-addendum decision evidence now also requires concrete
  `release:gate PASS` output with zero structural issues for the decision that
  gates testnet production-candidate wording, so a decision artifact or
  `addendum:validate PASS` transcript cannot stand in for the executable gate
  result.
- Gate 2 technical-addendum reviewer rows now apply claim, signer, and
  broadcast-boundary checks to internally non-contradictory technical addendum
  reviewer notes, so an actionable note that approves production-ready wording,
  mainnet deployment wording, node-wallet as the production signing path,
  unscoped broadcast enablement, or failed validator/command markers cannot
  close the technical-addendum row.
- Gate 2 release-gate binding now also requires the validated reviewer
  decision summary to mention both release support and architecture manual
  evidence plus production-ready and testnet production-candidate claim
  handling, so a bare reviewer approval cannot support controlled testnet
  architecture wording.
- Gate 2 release-gate binding now also consumes full Manual Classification
  provenance from `addendum:validate`: manual name, Git commit, testnet
  environment, controlled claim wording, Architecture owner, Reviewer, and ISO
  Date. Architecture owner and Security reviewer sign-offs must match those
  classified identities and cannot predate the classification date.
- Gate 2 release-gate binding now consumes Phase 007 publication-update fields
  returned by `addendum:validate`: completed release-note/checklist update
  evidence is required and fails closed if a PASS-like update note is paired
  with failure or structural-issue markers.
- Gate 2 technical-addendum validation and release-gate binding now require
  `Manual use status = candidate claim support` before the addendum can support
  testnet production-candidate wording; draft or internal-reference manuals
  remain valid intermediate states but cannot carry that claim.
- Gate 7 benchmark validation now requires production deployment candidate
  benchmarks to classify `Trust path = trustless burn proof path`; transitional
  trusted-burn benchmark evidence can remain institutional-reference evidence
  but cannot support testnet production-candidate wording.
- Gate 7 release-gate binding now validates the structured benchmark row
  payloads returned by `benchmark:validate`: scenario-specific completed metric
  evidence, positive measurements, statement-specific sharded-lane evidence,
  bottleneck-specific completed evidence with impact and next action, and
  actionable reviewer notes are required. Generic `PASS`, `reviewed`,
  `approved`, or pass-like rows that also report failure markers cannot close
  benchmark evidence.
- Prep-bundle JSON validation now also checks prepared command argument
  bindings against the same `artifactTargets` and requires the generated
  `rehearsal:testnet-window-prep` command to carry safe current heights, the
  current deployed-state hash matching the prepared package `deployedStateHash`,
  `--ergo-node-network testnet`, and a patched-devnet/testnet/non-mainnet
  sidechain scope. It also requires the generated
  `rehearsal:fresh-testnet-check` command to bind the prepared package aggregate
  evidence target, the fresh checkpoint JSON target, testnet/non-mainnet scope,
  and either `--auto-heights` or the concrete height evidence JSON target from
  `--height-evidence-artifact`. A structurally valid prep-bundle can no longer
  swap in a benign-looking but wrong preparation command.
- Prep-bundle release-gate validation now checks the offline-gate prepared
  command inputs themselves: `prebroadcast`, `rehearsalPreflight`,
  `windowPrep`, and `freshCheckpoint` must match the prep-bundle doctor,
  preflight, window-prep, and fresh-checkpoint artifact targets respectively.
  A validator wrapper cannot pass by exposing only the offline-gate target while
  omitting or drifting the JSON inputs consumed by that offline-gate report.
- Fresh-checkpoint release-gate validation now consumes the structured
  `checkpoint` and `boundary` objects from the actual
  `--fresh-checkpoint-json` report. Gate 3 and testnet production-candidate
  evaluation require publication-blocker lifecycle status, matching Expected
  transaction ID, fresh singleton age, non-broadcast height evidence, anchor
  observations bound to expected bridge event roots, and false broadcast,
  reconciliation, Gate 3 closure, and claim-escalation boundaries. A PASS plus
  target/source-binding wrapper cannot stand in for that provenance.
- Historical offline-gate reports retain their structured stages and lines for
  audit reconstruction only. Their PASS status and bindings are ignored by the
  current release decision.
- Backup-restore evidence now has its own Publication Evidence section, so a
  recovery drill cannot close Gate 3 without completed backup-restore
  release-note and checklist update evidence.
- Backup-restore release-gate resolution now preserves
  `Production-ready claim allowed by this drill: no`, matching the validator rule
  that recovery evidence alone cannot authorize production-ready claims.
- Backup-restore singleton comparison rows now require separate DUP singleton
  and SPV tracker singleton digest comparison or incident-classification rows,
  each with a concrete 32-byte singleton ID or 33-byte digest match. A generic
  singleton "matched" statement cannot close Gate 3 recovery evidence.
- Backup-restore restore-operator sign-off now must match the `Reviewer`
  identity in Drill Classification, so a different approver cannot close Gate
  3 backup-restore evidence after the restore operator is named.
- Backup-restore sign-off dates now must use ISO calendar dates, and the
  restore operator sign-off date is not before drill classification Date,
  preventing pre-drill approvals from closing Gate 3 recovery evidence.
- Release-note allowed-claim validation now blocks backup, restore, SQLite/WAL,
  local-state, reconstructibility, or AVL/DUP/SPV rebuild wording unless the
  backup-restore evidence row is linked with completed evidence, so Gate 3
  recovery claims cannot bypass the backup-restore drill through the claims
  table.
- Trustless burn release-gate resolution now requires concrete 32-byte
  commitment/burn identifiers, numeric heights and indices,
  positive `amountNanoErg` burn amount, instance-specific negative proof
  evidence with concrete 32-byte rejected proof or burn identifiers, and
  explicit unfinalized sidechain block rejection before Gate 5 can be closed.
- Benchmark evidence validation now rejects linked metric rows without numeric
  measurements and units, and it prevents the `Live batch settlement` scenario
  from being linked from an offline or non-broadcast run.

## Track 8 -- External Integration Package

**Goal:** an exchange-grade team can evaluate why Ergo is the right settlement
layer and how to adapt the kit.

Required gates:

- Architecture manual.
- Integration checklist.
- Sidechain setup walkthrough.
- Contract and relayer API reference.
- Performance benchmark report.
- Trust model and limitations page.
- Security review index.
- Migration guide from local devnet to testnet candidate evidence.

Done when:

- The repository explains both the technical advantage and the operational
  obligations without overselling.

Current status:

- Developer-facing docs exist; they need alignment with the ultimate objective
  and the remaining blockers.
- The contract and relayer integration surface now has a dedicated reference in
  `docs/contract-relayer-api-reference.md`, covering registers, Var slots,
  transaction shapes, command entrypoints, and invariants that external teams
  must not change first.
- External integration readiness now has a dedicated review template in
  `docs/external-integration-review-template.md`. It blocks public
  institutional-reference release until a fresh reviewer can follow the README,
  walkthrough, integration checklist, runbooks, and release blockers without
  private maintainer context.
- External integration evidence validation now requires every negative-review
  correction to be linked and marked `linked`, so Gate 8 cannot pass on
  narrative-only corrections to common misreads about production readiness,
  signer safety, trustless burn status, FROST, sharding, or benchmark evidence.
- Trustless burn required-component rows now require component-specific
  properties, so generic `reviewed`/`tested` notes cannot close sidechain
  commitment, anchoring, finality, SPV, burn tree, inclusion, DUP, reorg, or
  independent-review claims.
- Negative-review corrections now must state the actual safety boundary for
  each misread, so generic references such as "corrected by release checklist"
  cannot pass Gate 8.
- Gate 8 integration decision answers now require decision-specific safety
  boundaries, so generic `documented`, `reviewed`, or `see checklist` answers
  cannot close trust-model, signer, broadcast, burn, batch, scaling, or recovery
  questions.
- Gate 8 integration decision evidence now must identify the supported decision
  category, so a generic release-checklist link cannot satisfy trust-model,
  signer-path, broadcast, trusted-oracle burn, sidechain-commitment,
  duplicate-burn, batch-boundary, contract/relayer assumption, scaling, or
  recovery evidence.
- Gate 8 external integration evidence now rejects maintainer self-review as a
  passing reviewer type; completed release evidence must come from an
  independent engineer or exchange integration engineer.
- Gate 8 classification now requires a concrete reviewer organization or
  affiliation and `Private maintainer context used = no`; generic placeholders
  such as `external` or `TBD` cannot close the external package review.
- Gate 8 integration-reviewer sign-off now must match the `Lead reviewer`
  identity in Review Classification, so a different approver cannot close the
  external integration package review after the lead reviewer is named.
- Gate 8 integration-reviewer sign-off dates now must use ISO calendar dates
  and cannot be before Review Classification `Date`, so pre-review approvals
  cannot close external integration evidence.
- Gate 8 fresh-checkout evidence now requires `npm ci`, `npm run check`,
  `npm run wasm:test`, and `npm run showcase` plus per-command completed
  command output/log evidence, so an external review cannot pass on a command
  list or a single shared artifact alone.
- Gate 8 fresh-checkout command rows now require successful completion or
  `exit code 0`, so captured output from a failed fresh checkout cannot satisfy
  the external integration package review.
- Gate 8 external integration linked rows now require completed entry-point,
  decision, or correction evidence; template links and bare validator command
  names cannot close the external integration package blocker.
- Gate 8 required entry-point rows now require completed entry-point review
  evidence beyond the entrypoint document link, so merely linking README,
  roadmap, checklist, or runbooks cannot prove an external reviewer followed
  them without private context.
- Gate 8 negative-review evidence now must identify the corrected misread
  category in the linked artifact, so a generic integration checklist link
  cannot satisfy production-readiness, mainnet, node-wallet signing, broadcast,
  trustless-burn, FROST, sharded-lane, or benchmark-evidence corrections.
- Gate 8 reviewer sign-off notes now require concrete external-integration
  outcomes tied to the integration package, fresh checkout, entry points,
  decision record, negative-review corrections, private maintainer context,
  release blockers, trust model, signer/broadcast policy, trusted-oracle and
  trustless burn boundaries, FROST, sharding/SPVTracker, benchmark evidence,
  runbooks, or operator-ready claims; generic integration review notes cannot
  pass.
- Gate 8 publication rules are now executable guard input: public
  institutional-reference release decision, production-ready claim handling,
  `Private maintainer context used = no`, release-note update evidence, and
  checklist update evidence must be structured before the external integration
  package blocker can close.
- Gate 8 release-gate rows now preserve required entry points, integration
  decision record, negative review checks, reviewer decision summary, and
  `Private maintainer context used = no` plus
  `Production-ready claim allowed = no`, so a generic external-review artifact
  cannot close the public institutional-reference blocker or imply production
  readiness.
- Gate 8 release-gate evaluation now re-checks structured row payloads:
  completed entry-point review evidence beyond document links, successful
  per-command fresh-checkout output with commit identity, decision-specific
  evidence, negative-review correction evidence, and actionable reviewer
  outcome notes. Row names and `linked` statuses alone cannot close the
  external integration blocker.
- Gate 8 release-gate evaluation now rejects reused completed evidence targets
  across linked entry-point, fresh-checkout, decision, and negative-review row
  groups, so one shared artifact cannot close multiple external integration
  facts.
- Gate 8 release-gate and release-note blockers now also preserve per-command
  fresh or clean checkout context evidence, so successful command output from an
  unspecified working copy cannot close the external integration blocker.
- Gate 8 fresh-checkout command rows now require per-command fresh checkout
  commit identity matching Review Classification `Git commit`, so a transcript
  from the wrong revision cannot close the external integration blocker.
- Gate 8 fresh-checkout command output must now be internally positive:
  `PASS`, `success`, or `exit code 0` cannot close the row when the same
  evidence also reports `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
  non-zero `errors`, or non-zero `structural issues`.
- Gate 8 fresh-checkout command output must include explicit `exit code 0`;
  generic success wording without the zero-exit result cannot close an external
  integration command row.
- The release gate enforces the same explicit `exit code 0` requirement when it
  consumes structured external integration validation output directly; a
  validator PASS summary cannot mask generic success-only fresh-checkout rows.
- Gate 8 external integration evidence now requires
  `Production-ready claim allowed = no`; an external integration review can
  support public institutional-reference readiness, but cannot authorize
  production-ready claims even when classified as a production deployment
  candidate.
- Gate 8 production deployment candidate classifications now must be
  testnet-scoped: `Environment used` must be `testnet`, so patched-devnet,
  local-offline, or clean-checkout package reviews cannot support that release
  classification.
- Gate 8 mainnet-readiness corrections now must state that mainnet
  production-ready/readiness claims remain forbidden or out of scope, and that
  only testnet production-candidate or production-grade testnet claims can be
  evaluated with complete evidence.
- Gate 8 external integration evidence now requires explicit broadcast mode
  `disabled` or `dry-run`; missing or enabled broadcast mode is blocked for
  public package review evidence and must remain covered by separate live
  rehearsal gates.
- `release:gate` now consumes completed external integration review evidence
  through `--integration-evidence` for testnet production-candidate claim
  evaluation; the validated target must match the linked completed external
  integration evidence and a distinct `npm run integration:validate` output
  target, so checklist prose alone cannot authorize Gate 8 package-review
  support.
- `release:gate` now also consumes the structured Gate 8 Review Classification
  reviewer organization. The value must identify a concrete external
  organization or affiliation; generic values such as `external`,
  `independent`, `TBD`, or `reviewer organization` cannot close the external
  integration blocker or support testnet production-candidate wording.
- `release:gate` now consumes the Gate 8 Review Classification `Git commit`
  and `Date`; fresh-checkout rows must match that commit, and reviewer sign-off
  dates cannot predate the classification, so a PASS object without provenance
  fields cannot close the external integration blocker.
- `release:gate` now consumes Gate 8 external integration publication-update
  fields from `integration:validate`; completed release-note/checklist update
  evidence is required and update fields are fail-closed when PASS-like notes
  are paired with failure or structural-issue markers.
- Gate 8 external integration reviewer summaries now apply shared reviewer
  decision summary claim-boundary checks for testnet production-candidate
  wording, so a contradictory reviewer summary cannot bypass the
  `integration:validate` publication decision.
- Gate 8 external integration reviewer rows now apply claim-boundary checks to
  reviewer notes as well as the reviewer decision summary, so an actionable
  reviewer note that approves production-ready or mainnet production wording
  cannot close the external integration blocker.
- Gate 8 external integration reviewer notes now also fail closed on failed
  validator or command markers, so package-review approval cannot coexist with
  `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
  `structural issues`.
- Gate 8 external integration publication decisions now bind the
  `Testnet production-candidate claim allowed` field in both directions:
  institutional-reference reviews must keep it `no`, testnet-scoped production
  deployment candidate reviews must set it `yes`, and the reviewer summary must
  match that yes/no boundary.
- Release-note validation now requires an `External integration package review`
  evidence row, so Gate 8 cannot exist only as a copied blocker while the
  release evidence table omits the external reviewer package.
- Release-note validation now requires linked Gate 8 Required Evidence rows to
  cite fresh reviewer, `Private maintainer context used = no`, and fresh
  checkout commit identity matching Release Classification `Git commit`, so a
  generic external integration artifact cannot unlock public-release wording.
- Release-note allowed-claim validation now blocks external integration,
  fresh-checkout, institutional-reference, public-release, publication-ready, or
  private-maintainer-context wording unless the external integration evidence
  row is linked with completed evidence, so Gate 8 claims cannot bypass the
  reviewer-package blocker through the claims table.
- Release-note allowed-claim validation now requires external integration,
  institutional-reference, public-release, publication-ready, or safe-to-publish
  wording to have both linked Gate 8 Required Evidence and the copied Gate 8
  Publication Blocker row marked `Checked`, so a linked evidence row alone
  cannot make the release notes publishable.
- Release-note allowed-claim validation now blocks throughput, latency, TPS, or
  scaling wording unless the benchmark evidence row is linked with completed
  evidence, so benchmark claims cannot bypass Gate 7 through the claims table.
- Release-note allowed-claim validation now blocks trustless burn, SPV, burn
  inclusion, or sidechain commitment wording unless the trustless burn evidence
  row is linked with completed evidence, so Gate 5 claims cannot bypass the
  trustless verification blocker through the claims table.
- Release-note validation now requires every disallowed-claim checklist guard
  row from the template to be checked, so a release note cannot omit or leave
  unchecked a specific evidence-linked claim boundary while still passing the
  structural validator.
- Release-note validation now also keeps unresolved required blocker row status
  aligned with the Pending Evidence Register, so `Open blocker` rows cannot be
  softened to `Pending evidence`, and pending rows cannot be escalated or
  reshaped outside the canonical checklist inventory.
- Release-note validation now restricts `institutional reference` scope-outs to
  the explicit trustless-burn, committee-governance/key-rotation, and
  benchmark/scaling blockers, preventing public-release, signer-dependency,
  institutional-readiness, or external-integration blockers from being hidden
  behind `Scoped out? yes`.
- Release-note validation now also requires `validated PoC` releases to keep
  clean-checkout CI and fresh local-devnet lifecycle blockers in scope until
  checked, so the lowest release level cannot bypass the minimum reproducible
  PoC evidence.
- The disallowed-claim guard list is now exported from the release-note
  validator and reused by release-note fixtures and publication hygiene tests,
  keeping the template and validator on one canonical guard inventory.
- The required-evidence class list is now exported from the release-note
  validator and reused by release-note fixtures and publication hygiene tests,
  so the template must include every canonical evidence row exactly once.
- Release-note trust assumptions, operator impact areas, and sign-off roles now
  use exported validator inventories in fixtures and publication hygiene tests,
  keeping the remaining template tables aligned with validator requirements.
- Publication hygiene now cross-checks the Pending Evidence Register against
  the release-gate required blocker inventory, including canonical gate,
  unresolved status, duplicate rows, and row-specific resolution terms.
- Publication hygiene now runs the release-note validator against the blank
  release-notes template and requires it to remain blocked, so the template
  cannot accidentally become a publishable release artifact.
- Publication hygiene now runs each institutional evidence template through its
  concrete validator and requires the blank template to remain blocked, so
  template scaffolds cannot silently satisfy evidence gates.
- Publication hygiene now evaluates the real release checklist with the
  release-gate engine and requires the current document to remain blocked with
  14/14 unresolved publication blockers and zero structural issues.
- Release-note claim validation now forbids mainnet, main network, or main
  chain production-ready / production-candidate claims, blocks unqualified
  production-ready wording even for production deployment candidates, and
  allows only controlled testnet production-candidate wording
  when testnet lifecycle, recovery, signer conformance, independent security
  review, governance/key-rotation, benchmark, and final CI evidence are linked
  and the matching publication blockers are checked; linked testnet lifecycle
  release-note evidence must cite `Ergo node network testnet` without negated
  or mixed network wording such as `not testnet`, `not on the testnet`,
  `not using testnet`, `not connected to testnet`, `without the testnet`,
  `mainnet`, `main chain`, or `mainchain`, so a generic or mixed-network
  testnet artifact name cannot support the controlled testnet claim. The same
  controlled-claim prerequisite check applies to the release name, scope
  statement, and Allowed Claims table, preventing scope-level wording from
  bypassing upstream signer conformance evidence.
- The release gate now applies the shared evidence-hygiene guard to checklist
  Required resolution cells, preventing local paths, file URLs, credentialed
  links, runtime databases, deployment-state files, and diagnostic dumps from
  satisfying publication blockers.
- The release gate now rejects `Checked` publication blockers whose only
  completed-evidence marker is a targetless command-output note, keeping
  narrative status notes from satisfying required evidence rows.
- Release notes validation now rejects targetless command-output notes for
  linked required evidence, trust assumption evidence, allowed-claim evidence,
  and `Checked` copied publication blockers, so completed release notes cannot
  close blockers without a reusable evidence target.
- Signer surface isolation now also rejects Fleet Prover imports or
  instantiations outside explicit diagnostics, and the deploy script no longer
  carries a vestigial Prover import or Fleet-signing operator message.
- The release gate now evidence-hygiene scans `Release notes artifact`, so
  linked release notes cannot rely on local paths, file URLs, runtime databases,
  credentialed links, or secret markers for publication approval.
- The release gate now requires `Release notes artifact` to include
  release-notes validator output evidence, so generic completed-artifact markers
  cannot bypass release-note validation.
- The release gate now requires `Release notes artifact` to identify a completed
  release-notes document separately from validator output, so validation-only
  evidence cannot bypass release-note attachment.
- The release gate now binds release-notes validator output to the completed
  document target, so validator logs for a different file cannot satisfy
  public-release evidence.
- The release gate now rejects release-notes evidence that reuses the completed
  document artifact as the validator output artifact, preserving the required
  two-piece evidence structure for public release.
- The release gate now rejects release-notes evidence where the validated target
  is stated outside the validator output evidence, preserving the audit trail
  from command output to completed document.
- The release gate now rejects validator target bindings that only share the
  completed document basename, preserving exact artifact-to-validator binding.
- The release gate now rejects validator-target-only completed documents, so
  completed release notes must be attached as standalone evidence outside the
  validator output segment.
- The release gate now rejects release-notes validator output reuse even when a
  later binding note cites a distinct log, preserving the command-output target
  as the auditable validation artifact.
- The release gate now rejects generic validator-output artifact targets for
  release notes; the cited output target must be visibly validation, log,
  transcript, CI-run, or workflow evidence.
- The release gate now rejects bare `run` artifact targets for release-note
  validator output, keeping generic run captures out of public-release evidence.
- The release gate now requires release-note validator output evidence to
  identify a positive validation result such as `PASS`, `exit code 0`, or
  `no structural issues`, so a validation log target alone cannot close
  release-note validation evidence.
- The release gate now rejects non-Markdown completed release-notes document
  artifacts for publication approval, keeping the release decision aligned with
  the Markdown release-notes validator.
- The release gate now rejects completed release-notes document artifacts ending
  in `-template.md`, keeping release-note templates out of public-release
  evidence.
- The release gate now rejects negated completed release-notes filenames such as
  `not-completed-release-notes.md` and `uncompleted-release-notes.md`, keeping
  non-completed artifacts from satisfying public-release evidence.
- The release gate now blocks `Testnet production-candidate claims allowed =
  yes` unless `Release notes artifact` contains completed production deployment
  candidate release notes evidence that must explicitly identify production
  deployment candidate release notes.
- The release gate now accepts `--release-notes <completed-release-notes.md>`
  and requires actual release-note validation input before
  `Testnet production-candidate claims allowed = yes` can pass, so a textual
  `release-notes:validate PASS` note in the checklist cannot authorize the
  claim without validating the linked Markdown document.
- `Public release allowed = yes` also requires actual release-note validation input
  before it can pass; `release:gate` consumes the structured release-note
  classification plus validator rows for required evidence, trust assumptions,
  publication blockers, allowed claims, operator impact, and sign-off. The
  validated release-note `Release level` must match the Release Decision
  `Proposed release level`; a textual `release-notes:validate PASS` note, target
  binding, or document for another release level cannot authorize public
  institutional-reference publication.
- Release-note validation binding in `release:gate` now also consumes Release
  Classification provenance: Release name, Decision, Decision owner, Decision
  date, and Git commit. Maintainer sign-off must match the Decision owner,
  sign-off dates cannot predate the Decision date, and the release-note Git
  commit must continue to match clean-checkout classification.
- Release-note validation binding now requires row-specific payloads in
  `release:gate`: completed evidence-class artifacts with publication effects,
  assumption evidence and release impacts, blocker resolution evidence, bounded
  allowed wording, actionable operator actions and stop conditions, and
  actionable sign-off notes. Generic `PASS`, `reviewed`, or `approved` row
  payloads cannot authorize release-note publication evidence.
- Release-note validation now ignores `release-notes validation target` and
  `release-notes validate target` links when deciding whether structured
  required-evidence, trust-assumption, checked publication-blocker, and
  allowed-claim rows carry completed row-specific artifacts.
- Release-note sign-off rows now apply claim-boundary checks to sign-off notes,
  so an actionable maintainer, security, or operator note that approves
  production-ready or mainnet-scoped claim wording cannot close release-note
  publication evidence.
- Release-note structured rows now reject internally contradictory validator or
  command failure markers, so a completed row-specific payload cannot pair
  `PASS` or `exit code 0` with `FAIL`, `BLOCKED`, `ERROR`, non-zero `errors`,
  or non-zero `structural issues` and still authorize publication evidence.
- `release:gate` now rejects duplicate required structured row names and
  reviewer/sign-off roles across Markdown-backed validator outputs, so a later
  PASS row cannot mask an earlier contradictory evidence row.
- Markdown-backed `release:gate` target binding now rejects bare validation
  target segments as completed evidence: the completed document must be linked
  as standalone evidence outside `validated target` / validation-target binding
  text, then bound by a distinct validator output artifact.
- Release-note validation and release-gate publication checks now reject
  row-named non-concrete artifact targets such as `generic-*`,
  `placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
  `example-evidence-*` in linked release-note rows and completed
  release-note document artifacts, so matching a row label inside a placeholder
  path cannot stand in for completed release-note evidence.
- The release gate now rejects negated production deployment candidate
  release-note evidence, so wording such as `not production deployment
  candidate release notes` cannot authorize testnet production-candidate
  claims.
- `backup:compare` now blocks backup-restore evidence that compares the same
  snapshot target or cloned snapshot timestamp on both sides, so Gate 3
  recovery evidence must use distinct pre-backup and restored JSON artifacts
  with the restored snapshot generated after the pre-backup snapshot before
  local rows can be linked.
- `backup:validate` now also rejects generic `backup:compare` command-row
  evidence unless the row cites the distinct pre-backup/restored JSON artifacts
  and restored-after-pre-backup `generatedAt` ordering.
- `backup:compare` now rejects forged or hand-trimmed snapshot JSON missing
  `backup:snapshot` schema metadata (`databaseLabel`, `evidenceRows`, and
  `notes`), measured snapshot value formats, or `evidenceRows` matching the
  measured state values, so narrative or hand-edited values cannot pass local
  restore comparison.
- Backup-restore State Consistency evidence now must cite the measured
  pre-backup/restored value copied into each linked row, so a generic
  `backup:compare` artifact cannot close Gate 3 for a different measured state.
- `release:gate` now rejects reused backup-restore row targets across linked
  command, state, boundary, stop-condition, and publication-update rows, keeping
  each Gate 3 recovery obligation tied to its own completed evidence artifact.
- `release:gate` now rejects reused release-note row targets across Required
  Evidence, Trust Assumptions, checked Publication Blockers, and Allowed Claims,
  keeping publication evidence from collapsing multiple release-note obligations
  onto one artifact.
- `release:gate` now requires prep-bundle prebroadcast and approvals artifact
  targets to be concrete and distinct, and rejects reused concrete targets
  across the prep-bundle artifact target set.
- `release:gate` now binds offline-gate `sourceBindings.prebroadcast.target`
  back to the prep-bundle offline-gate prebroadcast input, preventing the
  offline gate from validating a different prebroadcast packet.
- `release:gate` now rejects post-submit observe JSON where the nested
  `observation.livePreflightBinding` drifts from the root live-preflight
  provenance binding, preventing contradictory structured observation payloads.
- `release:gate` now binds rehearsal preflight and window-prep package vectors
  back to aggregate prebroadcast claim order: burn hashes, sidechain header
  hashes, bridge event roots, Ergo anchor heights, and sidechain block heights
  cannot drift when those fields are present in the aggregate validator output.

## Publication Decision Matrix

| Gate | Required for public PR | Required for testnet production-candidate / production-grade testnet claim |
|------|------------------------|---------------------------------------|
| Clean checkout CI | yes | yes |
| Patched-devnet validation | yes | yes |
| Testnet clean-state validation | yes | yes |
| Upstream ContextExtension release or documented fail-closed guard | yes | yes, but testnet production-candidate / production-grade testnet claims require a released upstream signer fix with JVM/node conformance; fail-closed guard alone remains institutional-reference only |
| Trustless burn verification | no, if clearly marked incomplete | yes |
| Committee/governance runbooks | partial | yes |
| Sharded lane benchmarks | partial | yes |
| Independent security review | no, if internal only | yes |
| Operator incident runbooks | partial | yes |

## Immediate Next Steps

Follow the active work package in
[Bridge Execution Plan](../phases/bridge-execution-plan.md). The ordered summary
below is descriptive; the execution plan owns status and package transitions.

1. Implement the P0 peg-in transition: consume the refundable MCL deposit into
   a confirmed non-refundable settlement vault before idempotent mint.
2. Remove fail-open legacy MCU payout based only on stale SCS height or Ergo
   timeout; add burn-reorg and timeout rejection tests.
3. Add full ErgoScript VM evaluation for the V2 proof-bound settlement with
   non-empty SPVTracker and DUP AVL proofs.
4. In parallel, specify the minimal Substrate `bridge_event_root` producer and
   cross-language golden vectors, followed by authenticated `0x04` admission
   and a real sidechain finality rule.
5. Resume devnet, operator, benchmark, governance, and dated evidence work only
   after the corresponding implementation state changes. Track upstream
   sigma-rust and EIP-0045 work without making either a prerequisite for P0 or
   the bridge-native commitment path.

This roadmap is intentionally strict. If a task does not move one of these
tracks toward a green gate, it is secondary.
