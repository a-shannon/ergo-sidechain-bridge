# Institutional Release Checklist

This checklist is the publication gate for the Ergo sidechain bridge reference
stack. It is intentionally stricter than a normal prototype checklist. Do not
publish, market, or present the bridge as mainnet production-ready from this
repository. Even when every required item is green, this checklist can only
authorize the stated release level: validated PoC, institutional reference, or
production deployment candidate when explicitly scoped to testnet evidence.

The current goal is an institutional reference PoC, not a production-ready
claim. Any incomplete item below must remain visible in release notes. Mainnet
production-ready claims are forbidden in this repository. The strongest future
claim this gate can evaluate is testnet-scoped wording such as `testnet
production-candidate` or `production-grade testnet`, and only after the
testnet lifecycle, recovery, signer conformance, security review, governance,
benchmark, and final CI evidence are linked and the corresponding publication
blockers are checked.
`production deployment candidate` is an internal release level, not allowed
public claim wording. Public claims must use `testnet production-candidate` or
`production-grade testnet` after the required evidence is complete.

## Current Roadmap Priority

Gate 5 is the cryptographic trustlessness blocker for Chain zeta / Phantom
Burn. It must prove extension anchoring, sidechain finality, burn inclusion,
payout binding, DUP replay binding, stale-anchor/reorg rejection, and on-chain
proof acceptance before any trustless wording is allowed.

Gate 6 rows are operator-readiness and release-evidence rows. They matter for
reviewed release claims and key-rotation safety, but they do not by themselves
make sidechain burns cryptographically verifiable on Ergo. Work on Gate 6 only
when closing a concrete validator row; otherwise the strategic priority remains
Phase 011 / Gate 5.

## Status Vocabulary

Use these terms consistently in this checklist and in release notes:

- Checked: the item has linked evidence for the release level being evaluated.
  In the Pending Evidence Register, a row marked `Checked` must include a
  completed evidence link, command-output target, or artifact marker in the
  `Required resolution` cell. Template links are resolution targets, not
  completed evidence, and targetless command-output notes are narrative status
  notes rather than completed evidence.
- Completed evidence must pass the evidence hygiene guard: no local
  Windows/POSIX absolute paths, local file URLs, local workspace identifiers,
  secret dlog references, key material block markers, credential-bearing URLs
  or evidence links, runtime database, deployment-state, or diagnostic dump
  artifacts, Authorization/Cookie/API-key credential headers, mnemonic,
  signing-key, seed, API-key, password, client-secret, generic secret, JWT,
  generic token, cloud access-key, webhook-url, session-token, or access-token
  assignments, including quoted JSON/YAML credential keys.
- Evidence validator scripts must refuse repository-escape traversal,
  symlink/junction escape, local absolute paths, local file URLs, URI targets,
  non-Markdown targets, and known environment, secret-bearing, or runtime-state
  paths before reading input.
- Evidence validator scripts must report sanitized target labels instead of
  echoing raw local paths back to logs.
- Pending evidence: implementation or documentation may exist, but the required
  live, CI, benchmark, or review artifact is not linked yet.
- Open blocker: required capability, external dependency, or review is not
  complete.
- Publication blocker: the release level being evaluated cannot be proposed
  until the row is resolved or explicitly scoped out of a lower release level.
  Production deployment candidates cannot scope out required blocker rows.
  Any unresolved publication-blocker row must include a structured resolution
  target: a link, command, or artifact marker.

## Gate 0: Scope And Claims

- [ ] Release notes state whether the release is a validated PoC,
      institutional reference, or production deployment candidate.
- [ ] Release notes explicitly state remaining trusted-oracle, committee, and
      upstream signer assumptions.
- [ ] Completed release notes pass `npm run release-notes:validate`.
- [ ] Completed release notes preserve the canonical table headers in
      [Release Notes Template](release-notes-template.md), including the
      Sign-Off `Notes` column.
- [ ] Release-note `Maintainer` sign-off matches the `Decision owner` in
      Release Classification.
- [ ] Release-note sign-off dates are on or after the Release Classification
      `Decision date`.
- [ ] Approved public-release or testnet production-candidate decisions consume
      release notes whose Release Classification `Decision` is `proposed`.
- [ ] Release-note sign-off notes preserve claim boundaries: no
      production-ready or mainnet-scoped claim approval, no unqualified
      go-live/general availability/generally available wording, and no absolute
      security wording.
- [ ] Any release-note publication blocker marked `Checked` has the
      corresponding Required Evidence row marked `linked`.
- [ ] Any custom release-note publication blocker marked `Checked` includes
      structured resolution evidence, such as validator output, release-notes
      blocker review with `Publication blocker resolved = yes`, or reviewer
      decision evidence with `Reviewer decision = approve` and
      `Publication blocker resolved = yes`; a target-only artifact is not enough.
- [ ] No document claims absolute security or final production readiness without
      independent review evidence.
- [ ] Forbidden mainnet-scoped claim wording is absent from release claims:
      Mainnet, main-net, main net, main network, or main chain paired with
      forbidden production-ready, production-candidate, go-live, general
      availability, or production launch wording.
- [ ] Production deployment candidate scope text is explicitly testnet-scoped
      and contains no forbidden mainnet-scoped wording: mainnet, main-net,
      main net, main network, or main chain paired with forbidden
      production-ready, production-candidate, go-live, general availability,
      generally available, or production launch wording; forbidden unqualified
      production-ready wording; abbreviated prod-ready / prod-candidate /
      prod-grade wording; go-live / general availability / generally available /
      production launch wording; enterprise-ready / enterprise-grade wording; or
      unqualified production-readiness wording.
- [ ] Any testnet production-candidate or production-grade testnet wording in
      the release name, scope statement, or Allowed Claims table is limited to
      controlled release-note claims backed by completed evidence for testnet
      lifecycle citing `Ergo node network testnet` with no negated or mixed
      network wording, recovery drill, upstream signer conformance, independent
      security review, governance/key rotation, benchmarks, and final
      clean-checkout CI, with the corresponding
      publication blockers checked.

Evidence:

- [Release Notes Template](release-notes-template.md)
- [Ultimate Bridge Objective](ultimate-bridge-objective.md)
- [Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md)
- `relayer/src/release-notes-evidence.test.ts`

## Gate 1: Clean Checkout Reproducibility

- [ ] `npm ci` works from `relayer/`.
- [ ] WASM AVL builds from tracked sources.
- [ ] `npm run check` passes.
- [ ] `npm run wasm:test` passes.
- [ ] Command-specific clean-checkout output evidence is linked for every
      required command row.
- [ ] Pass-like clean-checkout command evidence is internally positive: `PASS`,
      `passed`, `ok`, or `exit code 0` cannot appear in the same row as
      `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
      non-zero `structural issues`.
- [ ] The `npm run release:gate` clean-checkout command row is blocked only in
      the expected `0 structural issues` state; `FAIL`, `ERROR`, non-zero
      `exit code`, non-zero `errors`, or non-zero `structural issues` remain
      blockers even if the row also cites a completed clean-checkout artifact.
- [ ] Linked clean-checkout workflow and reproducibility-decision evidence is
      internally non-contradictory: completed row artifacts cannot be mixed with
      failed validator/command markers, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues`.
- [ ] GitHub Actions runs the same clean-checkout gate.
- [ ] Final branch commit identity is linked and matches the clean-checkout
      evidence `Branch` and `Git commit` fields.
- [ ] CI reviewer sign-off matches the clean-checkout evidence `Reviewer`
      field.
- [ ] CI reviewer sign-off date is not before run classification Date.
- [ ] CI reviewer decision summary mentions release support with exact
      `Release supported = production deployment candidate`, clean checkout CI
      green, production-ready claim handling with exact
      `Production-ready claim allowed = no`, testnet production-candidate claim
      handling, exact `Testnet production-candidate claim allowed = yes` when
      that field is `yes`, and exact `Release gate structural issues = 0`,
      and matches the structured claim fields.
- [ ] Clean-checkout reviewer notes preserve claim and CI boundaries: no
      production-ready/mainnet claim approval, failed CI approval, or non-zero
      structural issues approval.
- [ ] Completed clean-checkout CI evidence passes `npm run ci:validate`.
- [ ] The completed clean-checkout evidence target and the
      `npm run ci:validate` output are linked as distinct artifacts, and the
      validation segment names the same clean checkout validation target.
- [ ] Clean-checkout row evidence is linked outside validator target bindings:
      `clean checkout validation target`, `ci validate target`,
      `validated target`, and `validated input` are validator provenance only
      and cannot close command, workflow, reproducibility-decision,
      release-note, or checklist evidence rows.
- [ ] A Gate 1 row marked `Checked` is evaluated with
      `release:gate -- --clean-checkout-evidence <completed-clean-checkout-evidence>.md`;
      checklist prose or a `ci:validate PASS` note cannot replace the actual
      validator input.
- [ ] The actual clean-checkout validation exposes the Run Classification
      fields consumed by `release:gate`: `Evidence name`, `Git commit`,
      `Branch`, `Release level = production deployment candidate`, `CI
      provider`, `Workflow`, `Node version`, `Rust target`, `wasm-pack
      version`, `Reviewer`, and ISO `Date`.
- [ ] Completed Gate 1 release-note update evidence is linked in the
      clean-checkout evidence.
- [ ] Completed Gate 1 checklist update evidence is linked in the
      clean-checkout evidence.
- [ ] Gate 1 release-note and checklist update evidence uses distinct
      completed targets; one combined publication-update artifact cannot close
      both fields.
- [ ] Gate 1 publication-update evidence includes exact
      `Release supported = production deployment candidate` when Gate 1
      supports a production deployment candidate, exact
      `Production-ready claim allowed = no` when production-ready claims are
      blocked, and exact
      `Testnet production-candidate claim allowed = yes` when that field is
      `yes`.
- [ ] Gate 1 publication-update evidence is internally positive: update fields
      that mix pass-like notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero
      `exit code`, non-zero `errors`, or non-zero `structural issues` cannot
      close Gate 1.
- [ ] Gate 1 reviewer notes are internally non-contradictory: actionable
      clean-checkout approval notes cannot also report failed validator or
      command markers, `ERROR`, non-zero `exit code`, non-zero `errors`, or
      non-zero `structural issues`.
- [ ] No `.env`, SQLite, deployment-state, diagnostic, local path, or secret
      artifact is staged.

Evidence:

- `.github/workflows/relayer-checks.yml`
- [Clean Checkout Evidence Template](clean-checkout-evidence-template.md)
- `npm run ci:validate`
- `relayer/src/publication-hygiene.test.ts`
- `relayer/src/clean-checkout-evidence.test.ts`

## Gate 2: Signing And Broadcast Safety

- [ ] Production code never uses node-wallet signing endpoints or Fleet Prover
      imports/instantiations; settlement signing remains local WASM through
      `ergo-lib-wasm-nodejs`.
- [ ] ContextExtension guard is fail-closed in default production/testnet mode.
- [ ] Broadcast requires explicit `BRIDGE_BROADCAST_ENABLED=true`.
- [ ] Startup preflights fail before sidechain processing when settlement
      signing or broadcast configuration is unsafe.
- [ ] Technical addendum Manual Classification records a non-empty manual name,
      a 7-40 character `Git commit` matching the final clean-checkout Run
      Classification `Git commit`, `Environment = testnet`, controlled testnet
      `Claim wording`, non-empty `Architecture owner`, non-empty `Reviewer`,
      and ISO `Date` before Gate 2 architecture-manual evidence can support
      testnet production-candidate wording.
- [ ] Technical addendum Architecture owner sign-off matches Manual
      Classification `Architecture owner`, Security reviewer sign-off matches
      Manual Classification `Reviewer`, and reviewer sign-off dates are not
      before Manual Classification `Date`.
- [ ] Technical addendum reviewer notes preserve claim, signer, and broadcast
      boundaries: no production-ready/mainnet deployment approval,
      node-wallet production signing approval, or unscoped broadcast approval.
- [ ] Technical addendum reviewer decision summary mentions release support with
      exact `Release supported = production deployment candidate`,
      architecture manual evidence, production-ready claim handling, and testnet
      production-candidate claim handling.
- [ ] Technical addendum gate-map and architecture-decision row evidence uses
      distinct completed targets across linked or passed rows; one shared
      architecture-manual artifact cannot close multiple Gate 2 facts.
- [ ] Dry-run and live-mode runbooks explain how to enable and disable
      broadcast.
- [ ] Completed rehearsal evidence records broadcast disabled at both session
      start and session end.
- [ ] Completed broadcast enablement evidence names the same reviewer recorded
      in Session Metadata, states explicit live broadcast approval, and cites
      the dry-run `Expected transaction ID` before any live settlement
      submission evidence can pass.
- [ ] Completed broadcast enablement evidence also records user explicit live
      broadcast approval for the live broadcast window and cites the same
      dry-run `Expected transaction ID`; reviewer approval alone cannot
      authorize a broadcast.
- [ ] Completed broadcast scoped-shell evidence includes
      `BRIDGE_BROADCAST_ENABLED=true`, a completed evidence marker, the intended
      shell, and limited-scope wording before any live settlement submission
      evidence can pass.
- [ ] Completed post-enable readiness evidence includes completed
      `npm run demo:readiness` output with `PASS` before any live settlement
      submission evidence can pass.
- [ ] Completed broadcast policy and live settlement readiness `PASS` rows
      include completed `npm run demo:readiness` output evidence citing the
      `Broadcast policy` and `Live settlement signing` check lines before any
      live settlement submission evidence can pass.
- [ ] Historical daemon approval readiness evidence remains bound to
      `Live settlement startup gate`, runtime approval context binding, node URLs, sidechain
      network, and `deployedStateHash`, but cannot authorize or evidence a new
      legacy aggregate submit. A replacement profile must define and validate
      its own readiness and authority bindings.
- [ ] Completed broadcast network reconfirmation evidence cites `Node URL` with
      an `http://` or `https://` URL and names both Session Metadata
      `Ergo node network` and `Sidechain network` before any live settlement
      submission evidence can pass.
- [ ] Completed live submit/confirmation evidence records a positive
      miner `feeNanoErg` amount before any fresh lifecycle row can close.
- [ ] Completed live submit/confirmation lifecycle rows cite the submitted
      transaction ID before any fresh lifecycle row can close.
- [ ] Completed pre-broadcast lifecycle rows cite the dry-run identifiers they
      close: peg-in event ID or TX ID, peg-out burn TX ID, sidechain block
      hash, bridge event root, Ergo anchor height, and expected transaction ID.
- [ ] Completed pre-broadcast packages include current Ergo and sidechain
      height evidence targets, and dry-run anchor/block heights do not exceed
      those current heights.
- [ ] Completed pre-broadcast non-broadcast attestations cite durable evidence
      targets for disabled broadcast state, no live approval, no submit, no
      mempool observation, no DUP/SPV local mutation, and no staged runtime
      files.
- [ ] Completed pre-broadcast evidence targets are concrete: `generic-*`,
      `placeholder-*`, `todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`,
      `testdata-*`, `sample-evidence-*`, and `example-evidence-*` artifact or
      Markdown targets cannot close command, dry-run settlement, or
      non-broadcast attestation evidence.
- [ ] Completed pre-broadcast command, dry-run settlement, and non-broadcast
      attestation evidence appears before any `prebroadcast validation target`,
      `validated target`, or `validated input` binding; validation-target-only
      bindings are validator provenance, not completed evidence.
- [ ] Completed pre-broadcast packages include a distinct
      `npm run prebroadcast:doctor` transcript/report after
      `npm run prebroadcast:validate`, summarizing linked aggregate JSON and
      remaining structural issues; this report is preparation evidence only
      and cannot replace live submit, confirmation, or reconciliation.
      `/transactions/check PASS` evidence and daemon approval check evidence
      must be internally positive and fail closed on contradictory `FAIL`,
      `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues` markers.
- [ ] Archived legacy V1 preflight reports, when retained for provenance, are
      explicitly non-authoritative and cannot satisfy Gate 3, authorize
      broadcast, or replace the separately versioned external-fee live
      preflight.
- [ ] Archived legacy V1 testnet live-window preparation packets generated by
      `npm run rehearsal:testnet-window-prep` are distinct artifacts that cite
      the same prebroadcast package and approvals file, current Ergo and
      sidechain heights, `Ergo node network testnet`, a patched-devnet/testnet
      or explicit non-mainnet sidechain network, broadcast disabled state, the
      same Expected transaction ID, the ordered burn set, and a current
      `deployed_state.json` hash matching the preflight/approval hash. The
      current heights must be greater than or equal to the prebroadcast package
      Ergo anchor and sidechain block heights. Their structured JSON must
      include `targetBindings`, `networkScope`, `heightBoundary`, and
      `gateBoundary`; every gate-boundary flag must remain false, including
      broadcast authorization, submit, confirmation, reconciliation, Gate 3
      closure, production-ready claims, and testnet production-candidate
      claims. These packets are preparation evidence only; they cannot
      authorize broadcast, close Gate 3, replace live
      submit/confirmation/reconciliation evidence, or support
      production-ready/testnet production-candidate claims.
- [ ] Archived legacy V1 offline bundle gates generated by
      `npm run rehearsal:offline-gate` read only completed preparation
      artifacts and block unless prebroadcast doctor/validation evidence,
      rehearsal preflight evidence, and testnet window-prep evidence are all
      present, PASS-equivalent, non-broadcast, and non-mainnet-scoped. These
      gates must bind prebroadcast doctor linked JSON summaries to the
      rehearsal preflight Expected transaction ID and command. The
      window-prep JSON must be structured with `targetBindings`,
      `networkScope`, `heightBoundary`, and an all-false `gateBoundary`; the
      gate must block prose-only, targetless, stale-height, mismatched
      deployed-state, or escalated-boundary window-prep artifacts.
      `--fresh-checkpoint <fresh-testnet-checkpoint.json>` is required and must remain
      `CREATED` / `publication blocker`, keep every broadcast/lifecycle boundary
      false, and match the preflight package's Expected transaction ID, burn
      set, deployed-state hash, sidechain block heights and hashes, Ergo anchor
      heights, and bridge event roots. Its `checkpoint.currentErgoHeight` and
      `checkpoint.currentSidechainHeight` must not be below the window-prep
      `heightBoundary.currentErgoHeight` and
      `heightBoundary.currentSidechainHeight`, and it must declare
      `checkpoint.ergoNodeNetwork` / `checkpoint.sidechainNetwork` values that
      match the window-prep `networkScope`. The checkpoint JSON must include
      `checkpoint.heightEvidence` and `sourceBindings.heightEvidence` proving
      read-only `/info` plus `getBlockNumber` height provenance with concrete
      read-only `ergoNodeUrl` and `sidechainRpcUrl` endpoint bindings, or a
      concrete non-template provided height evidence JSON target whose observed
      heights match the checkpoint current heights. `template-*`, `example-*`,
      `sample-*`, `generic-*`, `placeholder-*`, `todo-*`, or `tbd-*`
      provided JSON targets are placeholders, not height evidence. These gates cannot authorize broadcast or replace
      a future activated external-fee live-preflight. When an offline-gate JSON is linked from a
      an archival record, the report should expose `targetBindings.offlineGate`
      for the completed offline-gate JSON and concrete `sourceBindings` for the
      prebroadcast, rehearsal-preflight, window-prep, and fresh-checkpoint JSON
      inputs. These reports are ignored by `release:gate` and cannot satisfy
      Gate 3.
- [ ] Archived legacy V1 testnet preparation bundles generated by
      `npm run rehearsal:prep-bundle` are read-only preparation evidence. They
      must bind the matched prebroadcast package, approvals, current heights,
      current deployment-state hash, non-mainnet network scope, required
      fresh checkpoint artifact, optional height evidence artifact, and optional recovery row fragments. Their
      JSON report must include `gateBoundary`, `artifactTargets`,
      `preparedCommands`, `nextHandoff`, `stageStatuses`, and `recoveryRows` without
      serializing secret-bearing or runtime-state targets. When linked from
      archival evidence as `Prep-bundle JSON report`, the linked target should
      be concrete, not `generic-*`, `placeholder-*`, `todo-*`, or `tbd-*`.
      The archived validator must block any prep-bundle JSON whose gate boundary is not
      all false, whose required stage statuses are not `GO`/`CREATED`/`LINKED`,
      whose artifact targets are placeholder, secret, or runtime material, or
      whose prepared commands are not explicitly non-broadcast and bound to the
      same report artifact targets. `artifactTargets.prebroadcast` and
      `artifactTargets.approvals` must be concrete and distinct, and all
      prep-bundle artifact targets for prebroadcast, approvals, doctor,
      preflight, window-prep, offline-gate, and fresh-checkpoint must remain
      distinct. Its `sourceBindings.offlineGate.inputs`
      must bind `prebroadcast` to `artifactTargets.doctor`,
      `rehearsalPreflight` to `artifactTargets.preflight`, `windowPrep` to
      `artifactTargets.windowPrep`, and `freshCheckpoint` to
      `artifactTargets.freshCheckpoint`, so a PASS wrapper cannot silently
      validate a different offline-gate input set. The offline-gate report's
      `sourceBindings.prebroadcast.target` must match the prep-bundle
      `sourceBindings.offlineGate.inputs.prebroadcast`.
      The `nextHandoff` block must identify
      `external-fee-profile-activation-prerequisites`, remain in
      `blocked-live-settlement`, carry the standard legacy V1 quarantine
      status, and keep `broadcastCommand` and `reportAuthorizesBroadcast`
      false. It must not carry live execution target bindings.
      Every prepared command must be explicitly non-broadcast, and the
      `rehearsal:testnet-window-prep` prepared command must include the
      current deployed-state hash matching the prepared package
      `deployedStateHash`, safe current heights, `--ergo-node-network testnet`,
      and a patched-devnet/testnet/non-mainnet sidechain scope. The
      `rehearsal:fresh-testnet-check` prepared command must bind the prepared
      package aggregate evidence target, the fresh checkpoint JSON target,
      testnet / non-mainnet network scope, and either read-only
      `--auto-heights` mode or the concrete `--height-evidence-artifact` target
      as `--height-evidence <height-evidence.json>` with matching current
      heights. The
      quarantine status cannot become an execution command after reviewer or
      user approval. The report cannot authorize broadcast, submit, confirm,
      replace a future activated external-fee live-preflight, close
      Gate 3, count a fresh checkpoint as live lifecycle evidence, or
      support production-ready/testnet production-candidate claims. The bundle
      must verify the same offline-gate
      checkpoint boundary: `CREATED` / `publication blocker`, all
      broadcast/lifecycle boundaries false, and exact match to Expected
      transaction ID, burn set, deployed-state hash, sidechain heights and
      hashes, Ergo anchor heights, and bridge event roots, with checkpoint
      current heights not below the window-prep current heights and checkpoint
      network labels matching the window-prep network scope; otherwise the prep
      bundle is blocked.
- [ ] Archived legacy V1 fresh testnet non-broadcast checkpoints generated by
      `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence <aggregate-check.json> --auto-heights --current-deployed-state-hash <64hex> --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> --out <fresh-testnet-checkpoint.md> --json-out <fresh-testnet-checkpoint.json>`
      or by explicit height mode with
      `--height-evidence <height-evidence.json> --current-ergo-height <height> --current-sidechain-height <height>`
      and, when using an exported singleton observation, with
      `--singleton-checkpoint <singleton-checkpoint.json> --current-deployed-state-hash <64hex>`
      so the command binds the sanitized deployment hash without reading local
      `deployed_state.json`,
      must preserve `Fresh testnet lifecycle` as `publication blocker`, prove
      `/transactions/check` PASS, `broadcast = no`, current heights greater
      than or equal to aggregate evidence heights, bridge event roots, and
      non-mainnet network scope, refuse `BRIDGE_BROADCAST_ENABLED=true`, use
      read-only `/info` and sidechain `getBlockNumber` height evidence whose
      observed heights match the checkpoint current heights, use `ErgoClient`
      read-only/no-auth live node observations without an `api_key` header for
      `/info`, singleton boxes, mempool absence, and confirmed-chain absence,
      bind singleton observations to the declared deployed-state hash and, for
      live singleton collection, the current `deployed_state.json` singleton set,
      include singleton checkpoint `observedAt` as an ISO
      UTC timestamp no older than 15 minutes,
      include a read-only observation of extension fields `0x04` and `0x0401`
      at each aggregate `ergoAnchorHeight` with `bridgeEventRootHex` present,
      include explicit `sourceBindings` provenance for height evidence,
      singleton observations, and anchor observations, require height source
      bindings to identify either live read-only `/info` plus `getBlockNumber`
      collection with concrete read-only `ergoNodeUrl` and `sidechainRpcUrl`
      endpoint bindings or a concrete provided JSON target, require singleton
      source bindings to identify either live read-only node collection with a
      concrete read-only `ergoNodeUrl` binding or a concrete provided JSON
      target, reject provided height-evidence or singleton-checkpoint JSON
      targets named `template-*`, `example-*`, `sample-*`, `generic-*`,
      `placeholder-*`, `todo-*`, or `tbd-*`, require anchor source bindings to identify `live-read-only-node`
      with a concrete read-only `ergoNodeUrl` binding, reject source-binding
      operation lists that mix read-only collection with signing, submission,
      broadcast, mutation, repair, or reconciliation markers,
      and cannot replace live submit, confirmation, reconciliation, or a future
      activated external-fee live-preflight.
- [ ] Optional live rehearsal drafts generated by `npm run rehearsal:draft`
      must emit structured JSON with `targetBindings` and `plannedCommands`,
      bind the selected pre-broadcast package and approvals file, classify
      non-broadcast checks, the physical absence of new legacy V1 execution, replacement-profile
      activation prerequisites, post-submit observation, assembly, and final validation commands,
      and keep every `plannedCommands[*].reportAuthorizesExecution` value
      false. They must keep submit, confirmation, reconciliation, recovery, and
      backup-restore rows as publication blockers, and cannot authorize
      broadcast or any production-ready/testnet production-candidate claim.
- [ ] New legacy V1 live settlement remains physically absent even when historical
      approval and live-preflight evidence validates. Approval, configuration,
      and `BRIDGE_BROADCAST_ENABLED=true` cannot recreate funds authority. Any future live
      settlement requires a reviewed, separately versioned external-fee profile,
      exact target-node acceptance, an on-chain funds-authority transition,
      legacy route and vault retirement, and cross-profile replay-lineage evidence.
- [ ] The current `npm run rehearsal:live-preflight` output is retained only as
      legacy V1 historical diagnostics. It must be `BLOCKED` and bind
      `legacy-aggregate-v1`, `QUARANTINED`, `historical-diagnostics`, and
      `Activation evidence target = none`. Neither approval, configuration,
      copied `GO/PASS` text, nor `BRIDGE_BROADCAST_ENABLED=true` may promote it
      into signing, submission, broadcast, post-submit, or Gate 3 authority.
- [ ] Positive Gate 3 lifecycle evidence requires a separately implemented
      `rehearsal:external-fee-live-preflight` producer and validator.
      Its structured report must bind `authenticated-external-fee-v1`,
      `ACTIVATED`, `gate3-lifecycle-closure`, the exact completed activation
      evidence target, the same Expected transaction ID and approved burn set,
      external miner-fee funding, application-bound source finality, global DUP
      cutover lineage, legacy-route retirement, and exact target-node
      acceptance. The command does not exist in the current runtime and must
      not be simulated with a renamed legacy transcript.
- [ ] Confirmation/finality evidence uses internally positive
      `confirmation policy met` PASS facts with `confirmationsRequired`,
      `confirmationsObserved`, submitted transaction ID, and completed finality
      evidence. A stale PASS in the same excerpt as `FAIL`, `BLOCKED`,
      `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues` does not satisfy release-gate or release-note
      finality binding.
- [ ] The retained legacy `rehearsal:assemble` command is an offline historical
      validator. It injects the standard V1 quarantine error and emits no new
      positive candidate. When inspecting an immutable pre-quarantine candidate,
      the historical invocation
      `npm run rehearsal:assemble -- --draft <draft-live-rehearsal.md> --live-preflight <live-preflight.log-or-md-or-json> [--fresh-checkpoint <fresh-testnet-checkpoint.json>] [--failed-broadcast <failed-broadcast-row.md>] [--reorg-recovery <reorg-stale-singleton-row.md>] [--post-submit <post-submit-observe.json>] --out <assembled-live-rehearsal-candidate.md> --json-out <assembled-live-rehearsal-candidate.json>`
      and its archived Markdown/text artifacts must preserve the
      authorization boundary, reject template or runtime/secret targets, bind
      draft, live-preflight, and post-submit evidence to the same Expected
      transaction ID, validate structured live-preflight JSON `targetBindings`,
      `runtimeBroadcastEnabled: false`, `preSubmitBoundary`, and
      `authorizationEvidence` when JSON is supplied, require non-JSON
      live-preflight transcripts used with post-submit evidence to include the
      `live preflight report written: <live-preflight.json>` line emitted by
      `--json-out`, verify post-submit observe JSON
      `livePreflightBinding.target` matches that completed live-preflight JSON
      report target, verify its nested `observation.livePreflightBinding`
      matches the root binding, verify post-submit `approvedBurnTxHashes`
      against both `burnOrder` and live-preflight `approvalBinding.burnTxHashes`, and
      verify post-submit observe root `sourceBindings.node` and
      `sourceBindings.state` prove live read-only node plus read-only
      state-tracker provenance with `sourceBindings.state.targetClass` set to
      `operator-provided-state-db`, no default state database fallback, no
      deployed-state singleton default lookup, no fixture/mock/dummy/fake/stub/testdata endpoints,
      runtime path serialization, or signing/submission/broadcast/reconciliation
      operations. The post-submit observe command requires explicit
      `--state-db <operator-read-only-state-db>`,
      `--spv-tracker-nft-id <64hex>`, and
      `--aggregate-dup-nft-id <64hex>` inputs, and
      reject live-preflight JSON transcript lines where `PASS` appears beside
      `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
      non-zero `structural issues`,
      preserve read-only/no-broadcast/no-claim observation boundaries, and
      remain historical-only while the supplied live-preflight is the
      quarantined legacy V1 profile,
      only accept recovery row fragments with completed
      `rehearsal:validate` PASS evidence that matches the draft Expected
      transaction ID and peg-out burn TX ID, preserve `Production-ready claim allowed by this
      rehearsal: no` and `Testnet production-candidate claim allowed by this
      rehearsal: no`, print the assembled rehearsal validation status, and
      optionally write a structured assembly JSON report.
      The fresh checkpoint is required to mark the Fresh Ergo testnet lifecycle
      row `Checked`, but it is only one required input; by itself it cannot
      close Gate 3 or support production-ready/testnet production-candidate
      claims. The assembler must preserve the same
      fresh-checkpoint boundary used by `rehearsal:offline-gate`: the checkpoint
      remains `CREATED` / `publication blocker`, every broadcast/lifecycle
      boundary stays false, and the checkpoint must match the draft/live-preflight
      Expected transaction ID, burn set, deployed-state hash, sidechain block
      heights and hashes, Ergo anchor heights, and bridge event roots.
      A missing or mismatched checkpoint blocks assembly; the checkpoint cannot close Gate 3, authorize
      broadcast, replace `rehearsal:live-preflight`, submit, confirmation, or
      reconciliation evidence, or support production-ready/testnet
      production-candidate claims.
      A validation `BLOCKED` candidate cannot close Gate 3, authorize broadcast,
      or support any production-ready/testnet production-candidate claim.

Evidence:

- `relayer/src/context-extension-guard.ts`
- `relayer/src/live-settlement-readiness.ts`
- `relayer/src/broadcast-policy.ts`
- `relayer/src/node-wallet-isolation.test.ts`
- `relayer/src/testnet-rehearsal-preflight.ts`
- `relayer/src/testnet-rehearsal-preflight.test.ts`
- `relayer/src/scripts/testnet-rehearsal-preflight.ts`
- `relayer/src/testnet-window-prep.ts`
- `relayer/src/testnet-window-prep.test.ts`
- `relayer/src/scripts/testnet-window-prep.ts`
- `relayer/src/testnet-fresh-checkpoint.ts`
- `relayer/src/testnet-fresh-checkpoint.test.ts`
- `relayer/src/scripts/testnet-fresh-checkpoint.ts`
- `relayer/src/testnet-offline-rehearsal-gate.ts`
- `relayer/src/testnet-offline-rehearsal-gate.test.ts`
- `relayer/src/scripts/testnet-offline-rehearsal-gate.ts`
- `relayer/src/testnet-rehearsal-live-preflight.ts`
- `relayer/src/testnet-rehearsal-live-preflight.test.ts`
- `relayer/src/scripts/testnet-rehearsal-live-preflight.ts`
- `relayer/src/testnet-rehearsal-draft.ts`
- `relayer/src/testnet-rehearsal-draft.test.ts`
- `relayer/src/scripts/testnet-rehearsal-draft.ts`
- `relayer/src/testnet-rehearsal-assemble.ts`
- `relayer/src/testnet-rehearsal-assemble.test.ts`
- `relayer/src/scripts/testnet-rehearsal-assemble.ts`
- `relayer/src/testnet-recovery-drill-evidence.ts`
- `relayer/src/testnet-recovery-drill-evidence.test.ts`
- `relayer/src/scripts/testnet-recovery-drill-evidence.ts`
- `relayer/src/scripts/testnet-recovery-drill-observe.ts`
- `evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-06-ec29b2ef.md`
- [Operator Runbooks](operator-runbooks.md)

## Gate 3: Lifecycle Validation

- [ ] Fresh local devnet lifecycle succeeds from clean state with Session
      Metadata identifying `Environment: local devnet`: peg-in, peg-out,
      anchor, settlement check, submit, confirmation, reconciliation, and
      clean deployment state evidence naming a concrete 32-byte
      deployment-state hash or digest, concrete 32-byte contract ID, and
      concrete 32-byte singleton inventory identifier, with peg-in evidence
      citing the peg-in event ID or TX ID, peg-out burn evidence citing the
      peg-out burn TX ID, anchor evidence citing the sidechain block hash,
      bridge event root, and Ergo anchor height, settlement check evidence
      citing the expected transaction ID, and settlement submit evidence and
      confirmation evidence both citing the submitted transaction ID.
- [ ] Fresh Ergo testnet lifecycle succeeds with clean deployment state evidence
      naming a concrete 32-byte deployment-state hash or digest, concrete
      32-byte contract ID, and concrete 32-byte singleton inventory identifier,
      and Session Metadata identifies `Environment: testnet` plus Ergo node
      network testnet with no negated, `mainnet`, `main network`,
      `main chain`, or `mainchain` wording, including no `not on testnet`,
      `not on the testnet`, `not using testnet`, `not connected to testnet`,
      `no testnet`, `without testnet`, or `without the testnet`, with peg-in
      evidence citing the peg-in event ID or TX ID, peg-out burn evidence citing
      the peg-out burn TX ID, Fresh testnet lifecycle evidence artifact citing
      `Ergo node network testnet`, Fresh testnet lifecycle artifact cites
      peg-in event ID or TX ID, Fresh testnet lifecycle artifact cites peg-out
      burn TX ID, Fresh testnet lifecycle artifact cites sidechain block hash,
      Fresh testnet lifecycle artifact cites bridge event root, Fresh testnet
      lifecycle artifact cites Expected transaction ID, Fresh testnet lifecycle
      artifact cites submitted transaction ID, positively identifying testnet
      with no negated, `mainnet`, `main network`, `main chain`, or `mainchain`
      wording, including no `not on testnet`, `not on the testnet`,
      `not using testnet`, `not connected to testnet`, `no testnet`,
      `without testnet`, or `without the testnet`, anchor evidence citing the
      sidechain block hash, bridge event root, and Ergo anchor height,
      settlement check evidence citing the expected transaction ID,
      and settlement submit evidence and confirmation evidence both citing the
      submitted transaction ID, with required confirmation count recorded,
      confirmation policy met, confirmation policy met citing
      `confirmationsRequired=<n>`, confirmation policy met citing
      `confirmationsObserved=<n>`, confirmation policy met citing submitted
      transaction ID, and observed confirmation count greater than or equal to
      required confirmation count, where confirmation policy met links completed
      finality evidence. Post-submit peg-out burn TX IDs must be unique so
      batch evidence cannot count the same burn twice. Peg-out burn TX ID count
      must match recipient payout box ID count, and settlement output box IDs
      must include DUP successor box ID, SPV tracker successor box ID, and every
      recipient payout box ID.
- [ ] Each passing Gate 3 lifecycle binds Session Metadata to the exact
      `authenticated-external-fee-v1`, `ACTIVATED`,
      `gate3-lifecycle-closure` tuple, the matching local-devnet or testnet
      activation evidence target, and its recomputed 32-byte activation ID.
      `release:gate` must consume those reports through
      `--local-settlement-profile-activation-json` and
      `--settlement-profile-activation-json`; their environment, exact Ergo and
      sidechain network identities, and Git commit must match the corresponding
      rehearsal and a passing clean-checkout candidate. Reviewer approval must
      not predate the activation report. Each activation report target
      and each of its four distinct authority-evidence JSON targets must be
      non-circular. The CLI must read those role-specific structured producer
      outputs, bind target-node transaction and response identities,
      authority-transition transaction and contract identities, legacy-route
      retirement registries, and cross-profile replay roots, then require one
      replacement contract-profile digest across all four roles. It validates
      their exact authority facts and recomputes their evidence IDs before
      recomputing the activation ID. An omitted profile binding,
      `legacy-aggregate-v1`, an unknown profile, target drift, or a relabelled
      PASS wrapper cannot close Gate 3.
- [ ] Window-prep, prep-bundle, offline-gate, and historical V1 rehearsal
      artifacts remain preparation or diagnostic provenance. They do not prove
      profile activation, target-node acceptance, funds-authority transition,
      legacy-route retirement, or cross-profile replay lineage.
- [ ] Failed broadcast does not insert phantom AVL history.
- [ ] Reorged burns and stale singleton boxes are detected and recoverable.
- [ ] Recovery drill lifecycle rows are assembled from completed validation
      artifacts with `npm run rehearsal:recovery-drill` and linked structured
      observation artifacts produced by `npm run rehearsal:recovery-observe`.
      The structured recovery observation JSON must include `sourceBindings`
      proving a `live-read-only-node` source and a read-only state-tracker
      source with `sourceBindings.state.targetClass` set to
      `operator-provided-state-db` while keeping runtime database paths out of
      the serialized evidence. The observe command requires explicit
      `--state-db <operator-read-only-state-db>` input; omitted `--state-db`
      fails closed before any default runtime database is opened.
      Each observation artifact is separately validated with
      `npm run rehearsal:recovery-observe:validate`, and the row evidence cites
      `recovery-observe JSON validation PASS`; the observation JSON `message`
      must be internally positive, with stale or mixed PASS text beside `FAIL`,
      `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues` rejected. Row assembly supplies the same local JSON as
      `--observation-json` so invalid observation reports cannot produce
      completed recovery rows.
      Failed-broadcast rows cite `npm run rehearsal:validate`, Expected
      transaction ID, peg-out burn TX ID, and structured recovery observation
      PASS evidence. Failed-broadcast validation artifacts must identify
      rehearsal validation evidence. Reorg/stale-singleton rows cite validation
      or test artifact evidence, peg-out burn TX ID, singleton inventory
      identifier, and structured recovery observation PASS evidence, and
      reorg/stale-singleton validation artifacts must identify rehearsal
      validation or test evidence rather than generic review notes. Recovery
      row evidence, validation, and observation artifact targets must be
      concrete and distinct; `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
      `sample-evidence-*`, and `example-evidence-*` are placeholders, not
      completed recovery drill targets.
      The row-assembly JSON reports expose `recoveryBoundary` with signing, node
      query, live submit, confirmation, reconciliation, broadcast
      authorization, Gate 3 closure, and production/testnet
      production-candidate claim fields all false. The row-assembly JSON reports
      keep production/testnet production-candidate claim fields all false. The
      observation JSON reports
      expose `observationBoundary`, where node/state reads may be true but
      signing, broadcast, submit, repair, state mutation, reconciliation, Gate 3
      closure, and claim escalation remain false.
- [ ] Manual repair procedures have been rehearsed and recorded.
- [ ] Completed rehearsal evidence passes `npm run rehearsal:validate` with
      linked structured JSON targets supplied for included external-fee
      live-preflight, post-submit observe, fresh checkpoint, assembly, and
      recovery-observe artifacts;
      the supplied `--live-preflight-json` is the canonical post-submit join key
      for `observation.livePreflightBinding.target` and approved burn hashes;
      a distinct `--report-out` Markdown report records the same validated
      target, result, issue groups, and no-claim/no-broadcast boundary.
      A BLOCKED report records prerequisites only and cannot close Gate 3,
      authorize live submit, deployment, broadcast, publication, or public
      claims.
- [ ] `release:gate` consumes the `rehearsal:validate` structured output, not
      only its PASS summary: lifecycle rows, Session Metadata, Publication
      Evidence, and Reviewer Sign-Off must be exposed by the validator for
      both `--local-live-rehearsal-evidence` and `--live-rehearsal-evidence`.
- [ ] Claim-bearing completed live rehearsal evidence links the completed live rehearsal target,
      distinct `rehearsal:validate` transcript artifact containing
      `npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log> --assembly-report-json <assembly-report.json> --live-preflight-json <external-fee-live-preflight.json> --post-submit-observe-json <post-submit-observe.json> --fresh-checkpoint-json <fresh-testnet-checkpoint.json> --recovery-observe-json <failed-broadcast-observe.json> --recovery-observe-json <reorg-stale-singleton-observe.json> --report-out <rehearsal-validation-report.md> <completed-live-rehearsal.md>`
      PASS output, the validator output artifact before the `validated target`
      binding, `validated target` binding, confirmation policy met PASS,
      `confirmationsRequired=<n>`, `confirmationsObserved=<n>`, observed
      confirmation count greater than or equal to required confirmation count,
      submitted transaction ID, and completed finality evidence;
      the validation output artifact must be distinct from the completed live rehearsal target.
- [ ] Completed rehearsal evidence has coherent lifecycle statuses: fresh
      lifecycle pass requires peg-in, peg-out burn, anchor, settlement check,
      submit, confirmation, and reconciliation rows to pass.
- [ ] Completed rehearsal evidence artifacts identify the lifecycle row they
      close: peg-in, peg-out burn, anchor, submit, confirmation,
      reconciliation, recovery, or backup-restore evidence.
- [ ] Completed Gate 3 rehearsal release-note update evidence is linked in
      live rehearsal evidence.
- [ ] Completed Gate 3 checklist update evidence is linked in live rehearsal
      evidence.
- [ ] Gate 3 rehearsal release-note and checklist update evidence uses
      distinct completed targets; one combined publication-update artifact
      cannot close both obligations.
- [ ] Gate 3 rehearsal publication-update fields fail closed when completed
      evidence is mixed with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [ ] Live rehearsal reviewer sign-off matches the `Reviewer` identity
      recorded in Session Metadata.
- [ ] Live rehearsal reviewer sign-off date is not before session metadata
      Date.
- [ ] Live rehearsal publication evidence states
      production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no` and
      testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`;
      rehearsal alone cannot authorize production-ready or testnet
      production-candidate claims.
- [ ] Completed SQLite/AVL backup-restore evidence passes
      `npm run backup:validate`.
- [ ] `release:gate -- --backup-restore-evidence` consumes the structured
      backup-restore Drill Classification and validation rows for required
      commands, state consistency, reconstructibility boundaries, stop
      conditions, reviewer sign-off, publication evidence, and snapshot
      provenance.
- [ ] Backup-restore Drill Classification carries a drill name, 7-40 character
      Git commit matching final clean-checkout Git commit, `Release level = production deployment candidate`,
      `Environment = testnet`, `Broadcast mode = disabled` or `dry-run`,
      source-state scope, isolated or reviewed restore target, reviewer
      identity, and ISO Date before Gate 3 can support testnet-scoped release
      evaluation.
- [ ] Linked backup-restore rows carry row-specific completed payloads:
      command-specific output, measured pre-backup/restored values,
      boundary-specific reconstructibility evidence, condition-specific stop
      resolutions, completed Gate 3 publication update targets, and concrete
      reviewer outcome notes. Generic `PASS`, `approved`, `reviewed`, or
      `completed-pass` payloads do not close Gate 3.
- [ ] Backup-restore row evidence targets are distinct across linked command,
      state, boundary, stop-condition, and Gate 3 publication-update rows; one
      completed artifact cannot close multiple backup-restore obligations.
- [ ] Backup-restore validation target bindings are provenance only:
      `backup-restore validation target`, `backup validate target`,
      `validated target`, and `validated input` links cannot close command,
      state, boundary, stop-condition, publication-update, restore-target, or
      snapshot-provenance rows without separate completed row evidence.
- [ ] Backup-restore reviewer notes preserve recovery and claim boundaries:
      no production-ready/mainnet claim approval, testnet production-candidate
      approval by this drill, unreviewed live/runtime restore approval, or
      staged runtime backup artifact approval.
- [ ] Backup-restore reviewer notes fail closed on contradictory recovery
      evidence: actionable approval notes cannot also report `FAIL`, `BLOCKED`,
      `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues`.
- [ ] Backup-restore evidence cells fail closed when pass-like command or
      validation notes are mixed with `FAIL`, `BLOCKED`, `ERROR`, non-zero
      `exit code`, non-zero `errors`, or non-zero `structural issues`.
- [ ] The Gate 3 checklist row links the completed backup-restore Markdown
      evidence separately from the `npm run backup:validate` command output;
      a document named only as the validator target does not close the row.
- [ ] Backup-restore state consistency evidence includes separate DUP
      singleton digest comparison or incident classification and SPV tracker
      singleton digest comparison or incident classification rows, each with a
      concrete singleton ID or digest.
- [ ] Backup-restore publication evidence states
      production-ready claim handling with exact `Production-ready claim allowed by this drill: no` and
      testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`; recovery
      drill evidence alone cannot authorize production-ready or testnet
      production-candidate claims. Completed backup-restore release-note and
      checklist update evidence must preserve those exact drill claim denials.
- [ ] Backup-restore `Restore operator` sign-off matches the `Reviewer`
      identity declared in Drill Classification.
- [ ] Backup-restore `Restore operator` sign-off date is not before drill
      classification Date.

Evidence:

- [Operator Runbooks](operator-runbooks.md)
- [Live Rehearsal Evidence Template](live-rehearsal-template.md)
- [Backup Restore Evidence Template](backup-restore-evidence-template.md)
- [Gate 3 Rehearsal Validator Blocker Report](../evidence/rehearsal/artifacts/rehearsal-validate-live-rehearsal-template-blocked-2026-07-02-d0429db9.md)
- [Gate 3 Recovery Drill Prerequisite Map](../evidence/rehearsal/gate3-recovery-drill-prerequisite-map-2026-07-02-d0429db9.md)
- [Gate 3 Current Rehearsal Validator Blocker Report 1dd194a8](../evidence/rehearsal/artifacts/rehearsal-validate-live-rehearsal-template-blocked-2026-07-09-1dd194a8.md)
- [Gate 3 Current Rehearsal Prerequisite Map 1dd194a8](../evidence/rehearsal/gate3-rehearsal-prerequisite-map-2026-07-09-1dd194a8.md)
- [Gate 3 Current Rehearsal Operator Packet 1dd194a8](../evidence/rehearsal/gate3-rehearsal-operator-packet-2026-07-09-1dd194a8.md)
- [Gate 3 Current Local/Testnet Rehearsal Capture Manifest f0187202](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-09-f0187202.md)
- [Gate 3 Current Patched-Devnet Plan 157fdcef](../evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-157fdcef.md)
- `evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-157fdcef.json`
- [Gate 3 Current Local Devnet Execution Request f0187202](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-09-f0187202.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-09-f0187202.json`
- [Patched Devnet Current Local-Nodes-Online Prerequisite Diagnostic 3de8887a](../evidence/rehearsal/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-validation-2026-07-07-3de8887a.md`
- [Gate 3 Devnet Signer/Funding No-Secret Defaults 836876b4](../evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-836876b4.md)
- [Gate 3 Prior Local Devnet Execution Request 3de8887a](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-3de8887a.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-3de8887a.json`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest b3aa0620](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-b3aa0620.md)
- [Gate 3 Prior Local Devnet Execution Request b3aa0620](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-b3aa0620.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-b3aa0620.json`
- [Patched Devnet Prior Frontier-Online Prerequisite Diagnostic b3aa0620](../evidence/rehearsal/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-b3aa0620.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-b3aa0620.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-validation-2026-07-07-b3aa0620.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 9eefaf45](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-9eefaf45.md)
- [Gate 3 Prior Local Devnet Execution Request 9eefaf45](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-9eefaf45.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-9eefaf45.json`
- [Patched Devnet Prior Frontier-Binary Prerequisite Diagnostic 9eefaf45](../evidence/rehearsal/patched-devnet-go-no-go-frontier-binary-prereq-2026-07-07-9eefaf45.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-2026-07-07-9eefaf45.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-validation-2026-07-07-9eefaf45.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest a19ae902](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-a19ae902.md)
- [Gate 3 Prior Local Devnet Execution Request a19ae902](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-a19ae902.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-a19ae902.json`
- [Patched Devnet Prior Safe Prerequisite Diagnostic a19ae902](../evidence/rehearsal/patched-devnet-go-no-go-safe-prereq-2026-07-07-a19ae902.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-07-a19ae902.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-validation-2026-07-07-a19ae902.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 6fe37ed7](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-6fe37ed7.md)
- [Gate 3 Prior Local Devnet Execution Request 6fe37ed7](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-6fe37ed7.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-6fe37ed7.json`
- [Patched Devnet Current-HEAD Frontier-Online Diagnostic 6fe37ed7](../evidence/rehearsal/patched-devnet-go-no-go-frontier-online-current-2026-07-07-6fe37ed7.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-current-2026-07-07-6fe37ed7.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-current-validation-2026-07-07-6fe37ed7.md`
- [Patched Devnet Current No-Secret Env And Readiness Preflight 1713760d](../evidence/rehearsal/patched-devnet-no-secret-env-readiness-current-2026-07-07-1713760d.md)
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 312a5ad4](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-312a5ad4.md)
- [Gate 3 Prior Local Devnet Execution Request 312a5ad4](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-312a5ad4.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-312a5ad4.json`
- [Patched Devnet Prior Local Prereqs OK Diagnostic 312a5ad4](../evidence/rehearsal/patched-devnet-go-no-go-local-prereqs-ok-2026-07-07-312a5ad4.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-prereqs-ok-2026-07-07-312a5ad4.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-prereqs-ok-validation-2026-07-07-312a5ad4.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 834e6a7d](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-834e6a7d.md)
- [Gate 3 Prior Local Devnet Execution Request 834e6a7d](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-834e6a7d.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-834e6a7d.json`
- [Patched Devnet Prior Configured-Source Prerequisite Diagnostic 834e6a7d](../evidence/rehearsal/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-source-prereq-validation-2026-07-07-834e6a7d.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 36cb5380](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-36cb5380.md)
- [Gate 3 Prior Local Devnet Execution Request 36cb5380](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-36cb5380.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-36cb5380.json`
- [Patched Devnet Prior Loopback-Bound Prerequisite Diagnostic 36cb5380](../evidence/rehearsal/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-36cb5380.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest f7ee7112](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-f7ee7112.md)
- [Gate 3 Prior Local Devnet Execution Request f7ee7112](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-f7ee7112.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-f7ee7112.json`
- [Patched Devnet Prior Loopback-Bound Prerequisite Diagnostic f7ee7112](../evidence/rehearsal/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-f7ee7112.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-f7ee7112.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-f7ee7112.md`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest 32a4f1a2](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-32a4f1a2.md)
- [Gate 3 Prior Local Devnet Execution Request 32a4f1a2](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-32a4f1a2.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-32a4f1a2.json`
- [Gate 3 Prior Local/Testnet Rehearsal Capture Manifest ec29b2ef](../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-06-ec29b2ef.md)
- [Gate 3 Prior Local Devnet Execution Request d2b538cb](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-d2b538cb.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-d2b538cb.json`
- [Patched Devnet Current-HEAD Loopback-Bound Prerequisite Diagnostic d2b538cb](../evidence/rehearsal/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-d2b538cb.md`
- [Gate 3 Local Devnet Execution Request e50ed468](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-e50ed468.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-e50ed468.json`
- [Gate 3 Local Devnet Execution Request 9223954d](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-9223954d.md)
- `evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-9223954d.json`
- [Gate 3 Local Devnet Execution Request d9dc75d0](../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-06-d9dc75d0.md)
- `evidence/rehearsal/artifacts/gate3-local-devnet-execution-request-2026-07-06-d9dc75d0.json`
- [Patched Devnet Current-HEAD Safe Prerequisite Diagnostic 40182e0f](../evidence/rehearsal/patched-devnet-go-no-go-safe-prereq-2026-07-06-40182e0f.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-06-40182e0f.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-validation-2026-07-06-40182e0f.md`
- [Patched Devnet Current-HEAD Frontier-Configured Prerequisite Diagnostic 9223954d](../evidence/rehearsal/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-07-9223954d.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-07-9223954d.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-validation-2026-07-07-9223954d.md`
- [Patched Devnet Current-HEAD Frontier-Online Prerequisite Diagnostic e50ed468](../evidence/rehearsal/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-validation-2026-07-07-e50ed468.md`
- [Patched Devnet Current-HEAD Frontier-Configured Prerequisite Diagnostic 1dea1a5a](../evidence/rehearsal/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-validation-2026-07-06-1dea1a5a.md`
- [Patched Devnet Source-Configured Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-source-configured-prereq-validation-2026-07-05-53fbe6db.md`
- [Patched Devnet Configured Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-configured-prereq-2026-06-27-a27358f1.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-prereq-2026-06-27-a27358f1.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-prereq-validation-2026-06-27-a27358f1.md`
- [Patched Devnet Explicit CLI Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-explicit-prereq-2026-07-04-0f497e4e.md)
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-explicit-prereq-2026-07-04-0f497e4e.json`
- `evidence/rehearsal/artifacts/patched-devnet-go-no-go-explicit-prereq-validation-2026-07-04-0f497e4e.md`
- `relayer/src/rehearsal-evidence-report.ts`
- `relayer/src/rehearsal-evidence.test.ts`
- `relayer/src/backup-restore-evidence.test.ts`

## Gate 4: Threat Model And Security Review

- [ ] Current threat model covers aggregate settlement, anchor persistence,
      broadcast gates, ContextExtension divergence, AVL proof generation, and
      singletons.
- [ ] Completed threat-model/evidence-matrix evidence passes
      `npm run threat-model:validate`.
- [ ] `release:gate -- --threat-model-evidence` consumes the actual security
      evidence matrix target and structured matrix rows before threat-model,
      evidence-matrix, risk-class, attack-chain, or mitigation wording can
      support release notes or testnet production-candidate evaluation. Those
      matrix rows must preserve each release-gate-bound area's required
      validator command and release-gate evidence flag. A PASS summary, target,
      matrix self-reference, validator command name, or narrative risk note
      alone is not enough.
- [ ] Testnet production-candidate evaluation binds the completed
      threat-model/evidence-matrix artifact to the final clean checkout:
      `release:gate -- --threat-model-evidence` must receive validator output
      with `Matrix Classification` fields for matrix name, Git commit,
      reviewer, and ISO date; the matrix Git commit must match the
      clean-checkout evidence Git commit.
- [ ] Critical and high findings are closed or explicitly blocking publication.
- [ ] Security review publication decision and reviewer decision summary use
      numeric critical/high finding closure: `Critical/high findings open = 0`
      and reviewer-summary critical/high finding closure with exact
      `Critical/high findings open = 0`; textual equivalents such as `none`,
      `no`, `closed`, `resolved`, `mitigated`, or `n/a`, and numeric shorthand
      without `= 0`, do not close Gate 4 findings.
- [ ] Security review accepted-risk publication-update fields use exact
      numeric `Critical/high findings open = 0` and `Publication blockers = 0`
      when they mention finding or blocker closure; textual equivalents such as
      `none`, `no`, `zero`, `closed`, `resolved`, or `mitigated`, and numeric
      shorthand without `= 0`, do not close Gate 4 publication-update evidence.
- [ ] Attack-chain registry is current.
- [ ] Independent review covers required scope coverage, required evidence
      package, finding disposition, required negative review checks, contracts,
      relayer signing, AVL proof generation, sidechain finality assumptions,
      operator recovery, dependency risk, reviewed commit, `Environment =
      testnet`, external reviewer organization type, specific external
      security reviewer organization or affiliation, reviewer independence,
      `Lead reviewer` identity, ISO review period, final decision,
      critical/high findings open,
      publication blockers, accepted-risk checklist updates,
      accepted-risk release-note updates, reviewer decision summary,
      area-specific risk-focus notes, lead reviewer sign-off matching the
      review classification, lead reviewer sign-off date not before review
      classification Date, item-specific evidence-package artifact links, and
      distinct completed Gate 4 accepted-risk checklist/release-note update
      evidence targets. Scope rows that cite finding IDs must bind those IDs
      to linked Finding Disposition closure evidence. A
      row with only a linked status, PASS note, final approval note, or
      accepted-risk release-action sentence does not close this gate.
- [ ] Independent security reviewer decision summary mentions release support
      with exact `Release supported = production deployment candidate`,
      production-ready claim handling with exact
      `Production-ready claim allowed = no`, testnet production-candidate claim
      handling, critical/high finding closure, and accepted-risk release-note
      handling with exact `Accepted risks reflected in release notes = yes`.
- [ ] Independent security reviewer notes keep finding and accepted-risk
      boundaries: no approval of open critical/high findings, open publication
      blockers, or accepted risks missing release artifacts.
- [ ] Independent security reviewer notes are internally non-contradictory:
      actionable security-review approval notes cannot also report failed
      validator or command markers, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [ ] Completed dependency review evidence passes
      `npm run dependency:validate`.
- [ ] Linked dependency-review command, scope, triage, and upgrade rows use
      distinct completed evidence targets; one shared dependency-review
      artifact or log cannot close multiple row-specific checks.
- [ ] Linked dependency-review scope, triage, and upgrade evidence cells are
      internally positive: completed artifact markers, linked status, or
      positive review text must not share a cell with failed validator/command
      markers, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues`.
- [ ] Completed independent security review evidence passes
      `npm run security:validate`.
- [ ] Linked independent-security scope, evidence-package, finding, and
      negative-check rows use distinct completed evidence targets; one shared
      security-review artifact or log cannot close multiple row-specific
      checks.
- [ ] Gate 4 accepted-risk checklist and release-note update evidence uses
      distinct completed targets, and includes exact
      `Production-ready claim allowed = no` when production-ready claims are
      blocked; one combined publication-update artifact name cannot close both
      fields.
- [ ] Completed dependency-review and security-review release-note and checklist
      update evidence is linked in the respective evidence packages.
- [ ] Security Review Classification records
      `Release level = production deployment candidate`,
      `Environment = testnet`, a 7-40 character `Reviewed commit`, concrete
      external reviewer organization, allowed reviewer organization type,
      `Reviewer independence = independent external`, ISO `Review period`, ISO
      `Date`, and `Final decision = approve` before security evidence can
      support testnet production-candidate wording.
- [ ] Security review `Reviewed commit` matches the final clean-checkout Run
      Classification `Git commit` before independent security review evidence
      can support testnet production-candidate evaluation.
- [ ] Dependency Review Classification records
      `Release level = production deployment candidate`,
      `Environment = testnet`, `Lockfiles reviewed = yes`, a 7-40 character
      `Git commit`, reviewer identity, and ISO `Date` before dependency
      evidence can support testnet production-candidate wording.
- [ ] Dependency reviewer sign-off matches the Reviewer identity declared in
      Review Classification.
- [ ] Dependency reviewer sign-off date is not before review classification
      Date.
- [ ] Dependency review `Git commit` matches the final clean-checkout Run
      Classification `Git commit` before signer dependency evidence can support
      testnet production-candidate evaluation.
- [ ] Dependency reviewer decision summary covers release support with exact
      `Release supported = institutional reference`, upstream signer blocker
      handling, production-ready claim handling with exact
      `Production-ready claim allowed = no`, testnet production-candidate claim
      handling, and critical/high vulnerability closure.
- [ ] Dependency reviewer notes keep signer and vulnerability boundaries: no
      approval of unresolved upstream signer blockers, open critical/high
      vulnerabilities, or fail-closed signer blocker candidate support.
- [ ] Dependency reviewer notes are internally non-contradictory: actionable
      dependency-risk approval notes cannot also report failed validator or
      command markers, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues`.
- [ ] Linked dependency-review vulnerability triage has no positive
      critical/high finding counts in any row marked linked.
- [ ] Fail-closed signer dependency publication decision facts state
      `Release supported = institutional reference`,
      `Production-ready claim allowed = no`,
      `Testnet production-candidate claim allowed = no`,
      `Critical/high vulnerabilities open = 0`,
      `Upstream signer blocker resolved = no`, and
      `Release notes updated = yes` while upstream signer conformance remains
      unresolved.
- [ ] Dependency review publication decision uses the exact numeric
      `Critical/high vulnerabilities open = 0` value; textual equivalents such
      as `none`, `no`, or `n/a`, and numeric shorthand without `= 0`, do not
      close Gate 4 dependency evidence.
- [ ] Dependency reviewer decision summary uses exact
      `Critical/high vulnerabilities open = 0` when closing critical/high
      vulnerabilities; textual zero-like terms or numeric shorthand without
      `= 0` do not close the reviewer decision.
- [ ] Dependency reviewer decision summary uses exact
      `Testnet production-candidate claim allowed = no` while signer dependency
      evidence remains fail-closed, or exact
      `Testnet production-candidate claim allowed = yes` only after concrete
      upstream signer resolution.
- [ ] Completed signer dependency evidence either links upstream sigma-rust
      release validation with a concrete release identifier and JVM/node
      conformance evidence or explicitly keeps the fail-closed
      ContextExtension guard/blocker rationale with explicit fail-closed
      guard/blocker release-action evidence and completed ContextExtension
      guard evidence for this release.
- [ ] The dependency review `Signer dependency upgrade decision` row links
      completed upstream signer release and JVM/node conformance evidence in
      `Required evidence`; a release-action summary alone does not close the
      signer blocker, and a completed artifact target without those signer
      release/conformance facts is insufficient.
- [ ] When the signer blocker is resolved through upstream release validation,
      the signer release identifier in `Release action` matches the release
      identifier in `Required evidence`; mismatched signer versions, tags, or
      commits keep the Gate 4 blocker open.
- [ ] Completed dependency-review release-note and checklist update evidence are
      linked through distinct completed targets before signer dependency
      blockers are marked checked.
- [ ] Dependency-review publication-update evidence carries exact
      `Release supported = institutional reference`,
      `Production-ready claim allowed = no`,
      `Testnet production-candidate claim allowed = no`,
      `Critical/high vulnerabilities open = 0`, and
      `Upstream signer blocker resolved = no` while the upstream signer blocker
      remains fail-closed.

Evidence:

- [Security Evidence Matrix](security-evidence-matrix.md)
- [Dependency Risk Register](dependency-risk-register.md)
- [Dependency Review Evidence Template](dependency-review-evidence-template.md)
- [Aggregate Settlement Threat Model Refresh](aggregate-settlement-threat-model.md)
- [Independent Security Review Scope](independent-security-review-scope.md)
- [Independent Security Review Evidence Template](independent-security-review-evidence-template.md)
- `evidence/security/gate4-independent-security-review-blocker-map-2026-06-25-2f0163fd.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-06-26-c74aba93.md`
- `evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-06-26-4ec4f7d1.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-02-2de683fd.md`
- `evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-02-2de683fd.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-03-63bcd192.md`
- `evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-03-63bcd192.md`
- `evidence/security/gate4-independent-security-external-review-packet-2026-07-03-63bcd192.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-03-566916ce.md`
- `evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-03-566916ce.md`
- `evidence/security/gate4-independent-security-external-review-packet-2026-07-03-566916ce.md`
- `evidence/security/gate4-independent-security-review-input-manifest-2026-07-04-39ac28a6.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-04-93685ded.md`
- `evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-04-93685ded.md`
- `evidence/security/gate4-independent-security-external-review-packet-2026-07-04-93685ded.md`
- `evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-09-c6fea203.md`
- `evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md`
- `evidence/security/gate4-independent-security-external-review-packet-2026-07-09-c6fea203.md`
- `evidence/security/gate4-independent-security-review-input-manifest-2026-07-09-c6fea203.md`
- `evidence/security/gate4-independent-security-review-input-manifest-2026-07-09-cc9b0417.md`
- `relayer/src/threat-model-evidence.test.ts`
- `relayer/src/dependency-review-evidence.test.ts`
- `relayer/src/security-review-evidence.test.ts`

## Gate 5: Trust Minimization Path

WP-01 committed-vault controls are present in the current source only: minting
requires a canonical committed-vault transition, while deployment activation and
live evidence remain open. They do not close Gate 5. The V2 vault constrains
value, successor/change, and provenance, but tracker/DUP remain
committee-authorized and sidechain finality is not yet proven.

- [ ] Trusted-oracle assumptions are explicitly documented for the current
      release level.
- [ ] SPV/merged-mining roadmap is linked.
- [ ] Burn verification limitations are visible to integrators.
- [ ] Any committee trust is bounded by governance and key-rotation runbooks.
- [ ] Burn proof binding evidence includes a positive `amountNanoErg`; zero
      amount proofs cannot close Gate 5.
- [ ] Local Proof Vector evidence passes the `trustless-burn-proof.ts` core
      checks for `bridgeEventRoot`, inclusion proof, DUP key, recipient,
      amount, and asset binding, and includes structured fail-closed local
      negative cases for wrong sidechain ID, burn ID, event index, recipient,
      amount, DUP key, `bridgeEventRoot`, and malformed inclusion path.
- [ ] A completed `Proof-vector validation report` JSON target is linked,
      consumed by `npm run trustless:validate`, and matches the embedded Local
      Proof Vector while preserving read-only, local proof-core-only,
      non-broadcast, and non-claiming boundaries.
- [ ] Completed trustless burn verification evidence passes
      `npm run trustless:validate`.
- [ ] Trustless burn publication decision and reviewer decision summary use
      exact numeric critical/high finding closure:
      `Critical/high findings open = 0`;
      textual equivalents such as `none`, `no`, `closed`, `resolved`,
      `mitigated`, or `n/a`, and numeric shorthand without `= 0`, do not
      close Gate 5 findings.
- [ ] Trustless burn Evidence Classification records a 7-40 character
      `Git commit`, `Release level = production deployment candidate`,
      `Environment = testnet`, `Trust path = trustless burn proof path`,
      classified `Broadcast mode` of `disabled` or `dry-run`, non-empty
      `Reviewer`, and ISO `Date` before Gate 5 evidence can support testnet
      production-candidate wording.
- [ ] Trustless burn Evidence Classification `Git commit` matches the final
      clean-checkout Run Classification `Git commit` before Gate 5 evidence can
      support testnet production-candidate evaluation.
- [ ] The trustless burn `Protocol reviewer` sign-off matches the reviewer
      identity declared in Evidence Classification.
- [ ] The trustless burn `Protocol reviewer` sign-off date is not before
      evidence classification Date.
- [ ] Completed Gate 5 release-note update evidence is linked in the trustless
      burn evidence.
- [ ] Completed Gate 5 checklist update evidence is linked in the trustless
      burn evidence.
- [ ] Gate 5 checklist and release-note update evidence uses distinct completed
      targets; one combined publication-update artifact cannot close both
      fields.
- [ ] Gate 5 publication-update fields include exact
      `Release supported = production deployment candidate` when the trustless
      burn evidence `Release level` is `production deployment candidate`.
- [ ] Gate 5 publication-update fields include exact
      `Production-ready claim allowed = no` when production-ready claims are
      blocked.
- [ ] Gate 5 publication-update fields include exact
      `Critical/high findings open = 0` when the trustless burn evidence
      `Critical/high findings open` field is `0`.
- [ ] Gate 5 publication-update fields include exact
      `Transitional trusted burn path disabled = yes` when the trustless burn
      evidence `Transitional trusted burn path disabled` field is `yes`;
      reviewer decision summaries that close this boundary also use exact
      `Transitional trusted burn path disabled = yes`. Prose-only terms such
      as `disabled`, `blocked`, or `not allowed` do not close that boundary.
- [ ] Gate 5 reviewer decision summaries and publication-update fields use
      exact numeric `Critical/high findings open = 0` for critical/high finding
      closure; textual zero-like terms or numeric shorthand without `= 0` do
      not close that boundary.
- [ ] Trustless burn reviewer decision summary mentions release support with
      exact `Release supported = production deployment candidate`, trustless
      burn verification implementation, production-ready claim handling with
      exact `Production-ready claim allowed = no`, testnet
      production-candidate claim handling with exact
      `Testnet production-candidate claim allowed = yes`, transitional trusted
      burn path handling, and critical/high findings, and uses exact
      `Trustless burn verification implemented = yes`, exact
      `Transitional trusted burn path disabled = yes`, and exact
      `Critical/high findings open = 0` when closing those boundaries.

Current Gate 5 publication-update evidence only records the blocked
trustless-burn boundary: `Production-ready claim allowed = no` and
`Testnet production-candidate claim allowed = no`. Gate 5 remains blocked on
completed trustless burn implementation, transitional trusted burn path
disablement, critical/high finding closure, on-chain proof acceptance,
Ergo-verifiable finality, component evidence, and reviewer approvals.
The Gate 5 blocker map at commit `5d075bd9` refreshes the local
proof-vector validation, sidechain commitment-format component evidence,
sidechain ID commitment-format evidence, bridge event root commitment-format
evidence, sidechain header hash commitment-format evidence, hash function
commitment-format evidence, commitment prefix commitment-format evidence, Ergo
anchor height commitment-format evidence, sidechain height commitment-format
evidence, burn ID, sidechain transaction hash, sidechain block hash, event
index, duplicate-prevention key, recipient ErgoTree hash, amount, and
inclusion-path binding evidence, finality-rule prerequisite evidence,
settlement payout-binding prerequisite evidence, local reorg-handling
prerequisite evidence, burn commitment-tree component evidence, 0x0401
extension-shape boundary, SPV tracker key/value/proof-shape boundary evidence,
and trusted-oracle fallback rejection review. Its `trustless:validate` report
remains `BLOCKED` with 22 structural issues and does not close Gate 5 or
support testnet production-candidate wording.
The current Gate 5 prerequisite map at commit `541347da` is produced by
`npm run trustless:prerequisite-map`; it reconciles the SPV-linked candidate
with the current validator, links the current-head blocked
`trustless:validate` transcript, and converts the remaining structural issues
into extension anchoring, sidechain finality, proof acceptance, DUP settlement
binding, independent review, publication-boundary, and reviewer-approval
prerequisites. Its operator packet includes the compact single-leaf unsigned
candidate handoff: `trustless:unsigned-tx:validate` PASS with
`contextExtensionGuard = pass`, while transaction check, expected transaction
ID, signing, submit, and broadcast remain explicitly out of scope for that
source-boundary evidence. The same packet now asks for replacement-profile
target-node acceptance. The compact unsigned V1 candidate is a terminal
diagnostic: legacy V1 signing, `/transactions/check`, evidence capture,
authorization, submission, and transport are physically absent because the V1
payout equation can undercollateralize the bridge by charging miner fees to
protected backing. Node-backed acceptance may be collected only for a
separately versioned, reviewed, and activated external-fee replacement profile
that binds the bridge application, source finality, global DUP cutover lineage,
and exact chain-resident setup/admission state. That future check still requires
explicit non-mainnet local-signing/check approval and cannot imply submit,
reconciliation, deployment, broadcast, Gate 5 closure, or release readiness.
The latest local Gate 5 source-boundary slice has refreshed the instance-bound
proof-vector, candidate, and unsigned evidence for one selected burn identity.
The next useful Gate 5 work is therefore a matching non-mainnet `0x0401` anchor
or explicit absence observation for this same bridge event root, followed by
node-backed/non-mainnet proof acceptance and DUP settlement-binding evidence.
The current Gate 5 execution request at commit `4cb587fc` is
`evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md`,
with structured JSON at
`evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json`.
It converts the current prerequisite map and operator packet into six bounded
operator phases: non-mainnet instance binding, proof-vector/candidate/unsigned
evidence refresh, public anchor/tracker/finality observations, observation and
settlement binding reconciliation, completed proof acceptance plus
`trustless:validate`, and reviewer/publication-boundary collection. It is a
planning request only; it does not read secrets or runtime state, run node/RPC
queries, authorize signing or `/transactions/check`, submit, broadcast, close
Gate 5, or support release claims.
The current Gate 5 instance binding at source commit `4cb587fc` is
`evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.md`,
with structured JSON at
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.json`.
It binds the recipient-tree non-mainnet local offline instance with sidechain ID
`1111111111111111111111111111111111111111111111111111111111111111`,
sidechain transaction hash
`6666666666666666666666666666666666666666666666666666666666666666`,
sidechain block hash
`2222222222222222222222222222222222222222222222222222222222222222`,
event index `8`, bridge event root
`701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9`,
Ergo anchor height `987654`, burn ID / DUP key
`548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f`,
recipient ErgoTree hash
`dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401`,
amount `2000000`, and ERG asset ID
`0000000000000000000000000000000000000000000000000000000000000000`.
It is a prerequisite packet only; it keeps Gate 5 blocked on extension
anchoring, finality, burn proof acceptance, DUP settlement binding,
independent review, and on-chain proof acceptance evidence.
The current Gate 5 proof-vector, unsigned transaction, local
contract-equivalent acceptance, and instance refresh chain uses:
`evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json`,
`evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md`,
`evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md`,
`evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-09-d198839b.json`,
and
`evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-09-d198839b.md`.
It also links local predicate evidence at
`evidence/trustless-burn/artifacts/completed-local-contract-acceptance-2026-07-09-c3612838.json`.
The current Gate 5 instance refresh check at source commit `d198839b` is
`evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-09-d198839b.md`,
with structured JSON at
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-09-d198839b.json`.
It is `TRUSTLESS_BURN_INSTANCE_REFRESH_READY` with 0 structural issues, proving
that the binding, candidate, local proof-vector report, refreshed unsigned
transaction JSON, unsigned transaction validation report, and local
contract-equivalent acceptance JSON all carry the same local offline non-mainnet
burn identity. This clears the stale local source-boundary unsigned evidence
shape while preserving no-VM/no-chain/no-broadcast boundaries, but does not
provide transaction checks, expected transaction IDs, signing, submit,
broadcast, settlement reconciliation, on-chain proof acceptance, Gate 5 closure,
or release claims. The blocked
validation transcript for this refreshed SPV-linked candidate is
`evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-07-faf05c0b.md`;
its blockers are still the real missing Gate 5 evidence, not a local binding
mismatch.
The current-head source-boundary addendum at commit `16cceb0d` records that the
V1 aggregate SPV settlement path verifies tracker lookup, finality, DUP update,
and payout binding, while trustless-burn-leaf settlement identities remain
candidate-only until V2 aggregate contracts verify bridge-native burn leaves.
The current V2 trustless aggregate contract source adds a compact
bridge-native burn-leaf payout guard in
`contracts/MainChainAggregateUnlockTrustless.es` for source-boundary evidence:
the proof bundle now supports zero to fourteen 33-byte burn-proof nodes and
folds them into the tracker `eventRoot`. Gate 5 remains blocked until
on-chain proof-acceptance evidence, signing/check/submission wiring,
deployment, live/non-mainnet rehearsal, publication updates, and independent
review are complete.
The relayer-side V2 proof-bundle encoder accepts multi-node
`trustlessBurnProof` arrays for unsigned source-boundary evidence, and the
local unsigned evidence producer preserves the same no-check, no-sign, and
no-broadcast boundaries for a depth-2 proof bundle. The relayer now rejects
proof bundles deeper than the trustless contract's 14-node cap before encoding
the ContextExtension. This aligns the relayer encoding with the current
ErgoScript acceptance surface, but it does not close Gate 5.
The current-head proof-vector refresh at commit `136ab3f2` validates the
multi-leaf local proof vector and derives candidate-only trustless settlement
evidence with `contractCompatibility = candidate-only-trustless-v2-required`.
This is local proof-core and identity evidence only; it does not close Gate 5,
authorize settlement readiness, or support production-ready, mainnet, or testnet
production-candidate claims.
The current Gate 5 command-specific observation reconciliation at commit
`a21efc0b` binds a fresh read-only testnet anchor preflight to the local SPV
tracker observation packet. The testnet node remained reachable at height
435530, the scan covered heights 434811..435530 with 720 successful extension
reads and 0 read failures, and the SPV tracker report remains `LINKED` for the
expected bridge event root. The anchor observation is still `BLOCKED` because no
matching `0x0401` bridgeEventRoot was observed in that scanned testnet window.
The next non-mainnet packet must produce a mined, observable `0x0401` anchor for
the same bridge event root and bind one shared bridge event root and Ergo anchor
height across `trustless:anchor-observe`, `trustless:spv-tracker-observe`, proof
vector, and settlement-binding evidence before any Gate 5 component row can move
to `linked`.

Evidence:

- [Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md)
- [Trustless Burn Verification Plan](trustless-burn-verification-plan.md)
- [Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md)
- [Committee Governance Evidence Template](committee-governance-evidence-template.md)
- [EVM Sidechain Integration Checklist](evm-integration-checklist.md)
- `relayer/src/trustless-burn-proof.test.ts`
- `relayer/src/trustless-burn-proof-vector.ts`
- `relayer/test-vectors/trustless-burn-proof-v1.json`
- `relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json`
- `npm run trustless:proof-vector:validate -- <vector.json> --json-out <report.json>`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-05-31.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-04-e155b203.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-04-e155b203.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-25-a5462960.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-fb542578.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-fb542578.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-02-90f9d559.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-02-90f9d559.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-04-136ab3f2.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-04-136ab3f2.md`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json`
- `evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/artifacts/completed-gate5-sidechain-commitment-format-2026-06-27-e9b25a8c.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-sidechain-id-2026-06-28-7de11aac.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-bridge-event-root-2026-06-29-30454782.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-sidechain-header-hash-2026-06-29-f2403b18.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-hash-function-2026-06-29-bcc71649.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-prefix-2026-06-29-de7d0473.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-ergo-anchor-height-2026-06-29-2dc77a6d.md`
- `evidence/trustless-burn/artifacts/completed-gate5-commitment-sidechain-height-2026-06-29-bf0626ae.md`
- `evidence/trustless-burn/artifacts/completed-gate5-burn-id-binding-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-sidechain-tx-hash-binding-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-sidechain-block-hash-binding-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-event-index-binding-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-duplicate-prevention-key-binding-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-recipient-ergo-tree-hash-binding-2026-06-29-8bb23dcb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-amount-nanoerg-binding-2026-06-29-8bb23dcb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-inclusion-path-binding-2026-06-29-8bb23dcb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-burn-commitment-tree-2026-06-28-a665e48b.md`
- `evidence/trustless-burn/artifacts/completed-trustless-candidate-public-fixture-validation-2026-06-25-51f88f9c.md`
- `evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-02-90f9d559.json`
- `evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-validation-2026-07-02-90f9d559.md`
- `evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-04-136ab3f2.json`
- `evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-validation-2026-07-04-136ab3f2.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-25-8337cc67.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-26-9d5927a1.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-26-96384d6e.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-27-e9b25a8c.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-28-a665e48b.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-28-7de11aac.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-30454782.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-f2403b18.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-bcc71649.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-de7d0473.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-2dc77a6d.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-bf0626ae.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-8bb23dcb.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-02-152b6136.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-02-93825b1d.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-02-197c4459.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-02-197c4459.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-03-7c09eb2e.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-7c09eb2e.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-03-7c09eb2e.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-03-21f42191.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-21f42191.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-03-21f42191.md`
- `evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-07-03-1a24c7ae.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-03-1a24c7ae.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-1a24c7ae.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-03-1a24c7ae.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-03-6e06a962.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-6e06a962.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-03-6e06a962.md`
- `evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-03-541347da.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-03-541347da.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-541347da.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-03-541347da.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-04-b4995367.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-04-b4995367.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-04-b4995367.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-06-233729a0.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-06-233729a0.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-06-233729a0.md`
- `evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.json`
- `evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json`
- `evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.md`
- `evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.json`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-07-2401733f.md`
- `evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md`
- `evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md`
- `evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md`
- `evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json`
- `evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.md`
- `evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.json`
- `evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.md`
- `evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.json`
- `npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json>`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-09-a21efc0b.md`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-09-a21efc0b.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-09-a21efc0b.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-09-a21efc0b.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-09-a21efc0b.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.json`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-91c3904e.md`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-91c3904e.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-08-91c3904e.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-91c3904e.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-91c3904e.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-91c3904e.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-91c3904e.json`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-13f94ed1.md`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-13f94ed1.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-08-13f94ed1.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-13f94ed1.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-13f94ed1.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-13f94ed1.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-13f94ed1.json`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-426c6cf6.md`
- `evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-426c6cf6.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-08-426c6cf6.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-426c6cf6.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-426c6cf6.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-426c6cf6.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-426c6cf6.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-02-c53f299f.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-02-c53f299f.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-02-c53f299f.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-03-af70f9c8.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-03-af70f9c8.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-03-af70f9c8.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-03-654b8f25.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-03-654b8f25.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-2026-07-02-6953c3b5.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-03-af70f9c8.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-03-af70f9c8.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-04-aa464831.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-aa464831.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-aa464831.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-aa464831.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-aa464831.json`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-04-8e57c5fd.md`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-04-8e57c5fd.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-04-8e57c5fd.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-8e57c5fd.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-8e57c5fd.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-8e57c5fd.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-8e57c5fd.json`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-04-e531e29d.md`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-04-e531e29d.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-04-e531e29d.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-e531e29d.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-e531e29d.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-e531e29d.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-e531e29d.json`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-06-4987caca.md`
- `evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-06-4987caca.json`
- `evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-06-4987caca.json`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-06-4987caca.md`
- `evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-06-4987caca.json`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-4987caca.md`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-4987caca.json`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-06-4987caca.md`
- `evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-06-4987caca.json`
- `evidence/trustless-burn/gate5-sidechain-finality-addendum-2026-06-25-9dbeff16.md`
- `evidence/trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-wrong-sidechain-id-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-wrong-recipient-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-wrong-amount-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-reused-burn-id-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-stale-spv-tracker-digest-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-malformed-inclusion-path-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/completed-gate5-negative-trusted-oracle-fallback-rejection-2026-06-26-96384d6e.md`
- `evidence/trustless-burn/artifacts/completed-gate5-release-note-update-evidence-2026-06-26-b354f254.md`
- `evidence/trustless-burn/artifacts/completed-gate5-checklist-update-evidence-2026-06-26-b354f254.md`
- `npm run trustless:extension-boundary -- --public-boundary --out <report.md>`
- `evidence/trustless-burn/artifacts/gate5-extension-boundary-public-boundary-2026-06-26-65e7c00a.md`
- `evidence/trustless-burn/artifacts/gate5-extension-boundary-public-boundary-2026-06-26-9d5927a1.md`
- `npm run trustless:spv-tracker-boundary -- --public-boundary --out <report.md>`
- `evidence/trustless-burn/artifacts/gate5-spv-tracker-boundary-public-boundary-2026-06-26-1ea135f2.md`
- `evidence/trustless-burn/artifacts/gate5-spv-tracker-boundary-public-boundary-2026-06-26-9d5927a1.md`
- `npm run trustless:spv-tracker:local-observation -- --observed-at <ISO> --out <spv-tracker-observation.json>`
- `npm run trustless:spv-tracker-observe -- --observation-json <spv-tracker-observation.json> --json-out <spv-tracker-observation-report.json>`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-input-2026-07-02-634b78eb.json`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-02-634b78eb.md`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-02-634b78eb.json`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-input-2026-07-03-2a1bb125.json`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-03-2a1bb125.md`
- `evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-03-2a1bb125.json`
- `evidence/trustless-burn/artifacts/completed-gate5-aggregate-spv-settlement-source-boundary-2026-06-30-16cceb0d.md`
- `evidence/trustless-burn/artifacts/completed-gate5-trustless-single-leaf-unsigned-tx-source-boundary-2026-07-01-a51974fc.md`
- `evidence/trustless-burn/artifacts/completed-gate5-trustless-single-leaf-service-unsigned-boundary-2026-07-01-5abc0f49.md`
- `evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-02-6b1d70a2.json`
- `evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-validation-2026-07-02-6b1d70a2.md`
- `evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-03-57d80158.json`
- `evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-validation-2026-07-03-57d80158.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-25-8337cc67.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-575f9dd9.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-174d4cfb.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-b354f254.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-9d5927a1.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-96384d6e.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-27-e9b25a8c.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-28-a665e48b.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-28-7de11aac.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-30454782.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-f2403b18.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-bcc71649.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-de7d0473.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-2dc77a6d.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-bf0626ae.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-b8968c16.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-8bb23dcb.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-29-5d075bd9.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-02-152b6136.md`
- `evidence/trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-07-02-93825b1d.md`
- `npm run trustless:candidate -- --proof-vector <proof-vector.json>`
- `npm run trustless:candidate:validate`
- `npm run trustless:unsigned-tx -- --generated-at <ISO> --out <trustless-single-leaf-unsigned-tx-evidence.json>`
- `npm run trustless:unsigned-tx:validate -- <trustless-single-leaf-unsigned-tx-evidence.json> --report-out <report.md>`
- Proof-vector-derived candidate JSON `sourceBindings.proofVector` provenance
- `relayer/src/trustless-settlement-candidate.ts`
- `relayer/src/aggregate-settlement-candidate-evidence-json.ts`
- `relayer/src/trustless-burn-evidence.test.ts`

## Gate 6: Operator Readiness

Gate 6 authority does not extend the MCL emergency path beyond an unspent,
pre-commit refundable source. It cannot authorize minting, repair a post-mint
commit reorg, or resolve Gate 5 proof/finality blockers.

- [x] Dry-run readiness runbook exists.
- [x] Deploy/migration runbook exists.
- [x] Broadcast enablement runbook exists.
- [x] Daemon startup runbook exists.
- [x] Pause/resume runbook exists.
- [x] Settlement failure runbook exists.
- [x] Reorg recovery runbook exists.
- [x] Key rotation runbook exists.
- [ ] Completed committee governance and key-rotation evidence passes
      `npm run governance:validate`.
- [ ] Committee Governance Drill Classification records a 7-40 character `Git
      commit`, `Release level = production deployment candidate`,
      `Environment = testnet`, `Broadcast mode = disabled` or `dry-run`, a
      governance model identifying committee or multisig governance, threshold
      at least 2, member count at least 3, threshold lower than member count,
      non-empty `Reviewer`, and ISO `Date` before Gate 6 governance evidence
      can support testnet production-candidate wording.
- [ ] Committee Governance Drill Classification `Git commit` matches the final
      clean-checkout Run Classification `Git commit` before Gate 6 governance
      evidence can support testnet production-candidate evaluation.
- [ ] The committee governance `Governance owner` sign-off matches the reviewer
      identity declared in Drill Classification.
- [ ] The committee governance `Governance owner` sign-off date is not before
      drill classification Date.
- [ ] Committee governance evidence records explicit broadcast mode disabled or
      dry-run; missing or enabled broadcast mode is blocked for Gate 6
      governance evidence.
- [ ] Command-specific governance command output evidence is linked for every
      Gate 6 required command row.
- [ ] Committee governance row evidence does not reuse validator provenance as
      row proof: `governance validation target`, `committee governance
      validation target`, `governance validate target`, `validated target`, and
      `validated input` bindings can identify the validator input/output, but
      cannot close scope, command, rotation, positive, negative, release-note,
      or checklist evidence rows by themselves.
- [ ] Linked committee-governance scope, command, rotation, positive, and
      negative rows use distinct completed evidence targets; one shared
      governance artifact or log cannot close multiple row-specific checks.
- [ ] Linked committee-governance positive rows use bounded success expected
      results such as accepted, approved, passed, validated, verified, or
      succeeded, and negative rows use fail-closed expected results such as
      rejected, blocked, refused, or failed.
- [ ] Linked committee-governance scope, rotation, and positive row evidence
      is internally non-contradictory, and negative-check evidence separates
      expected rejection/blocking outcomes from validator or command failure
      markers, non-zero `exit code`, non-zero `errors`, and non-zero
      `structural issues`.
- [ ] Governance command output evidence is internally positive: `PASS`,
      `passed`, `success`, or `exit code 0` cannot appear in the same command
      row as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues`.
- [ ] Committee governance rotation evidence names step-specific rotation facts
      for public-key identity, threshold policy, member-loss, signer behavior,
      singleton continuity, deployment-state reconciliation, and rollback.
- [ ] Committee governance `Compile affected contracts` rotation evidence
      cites `npm run contracts:check` or concrete contract compilation output;
      placeholder-only validation text cannot close the row.
- [ ] Committee governance new-committee public key/hash identifiers are
      disjoint from the old committee identifiers.
- [ ] Local sanitized Gate 6 reconciliation packet producer exists for operator
      input-shape checks, but its local packets do not replace operator-provided
      non-mainnet deployment-state reconciliation evidence.
- [ ] Linked Gate 6 deployment-state reconciliation and wrong-network
      negative evidence cite `npm run governance:reconcile:validate` command
      output with `exit code 0`.
- [ ] Completed Gate 6 governance release-note update evidence is linked in
      the committee governance evidence.
- [ ] Completed Gate 6 governance checklist update evidence is linked in the
      committee governance evidence.
- [ ] Gate 6 governance release-note and checklist update evidence uses
      distinct completed targets; one combined publication-update artifact
      cannot close both fields.
- [ ] Committee governance publication-update evidence is internally positive:
      `PASS`, `passed`, `success`, or `exit code 0` cannot appear in the same
      update field as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [ ] Completed Gate 6 governance external review evidence covers committee
      governance and key-rotation before the Gate 6 blocker is marked checked.
- [ ] Completed Gate 6 governance external review evidence uses a distinct
      completed target from the Gate 6 governance release-note and checklist
      update evidence targets.
- [ ] Completed Gate 6 governance external review evidence includes exact
      `Governance-ready claim allowed = yes`, and when those publication
      fields are set, exact `Release supported = production deployment
      candidate`, exact `Testnet production-candidate claim allowed = yes`,
      and exact `Open governance blockers = 0`.
- [ ] Committee governance publication rules use the exact numeric
      `Open governance blockers = 0` value; textual equivalents such as
      `none`, `no`, `zero`, or `resolved`, and numeric shorthand without
      `= 0`, do not close Gate 6.
- [ ] Committee governance publication-update fields include exact numeric
      `Open governance blockers = 0` when the committee governance
      publication rules set `Open governance blockers = 0`.
- [ ] Committee governance publication-update fields that mention
      governance-ready claim closure use exact
      `Governance-ready claim allowed = yes`; prose-only terms such as
      `allowed`, `approved`, or `supported` do not close Gate 6.
- [ ] Committee governance reviewer decision summary mentions release support,
      governance-ready claim handling, production-ready claim handling with
      exact `Production-ready claim allowed = no`, testnet
      production-candidate claim handling, and open governance blocker handling.
- [ ] Committee governance reviewer decision summary uses exact
      `Release supported = production deployment candidate`,
      `Governance-ready claim allowed = yes`,
      `Testnet production-candidate claim allowed = yes`, and states open
      governance blocker handling with exact `Open governance blockers = 0`
      when closing Gate 6 governance readiness, testnet candidate, and blocker
      claims; numeric shorthand such as `open governance blocker handling: 0`
      without the exact binding does not close the reviewer decision.
- [ ] Committee governance reviewer notes are internally non-contradictory:
      actionable governance-readiness approval notes cannot also report failed
      validator or command markers, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.

Current committee-governance publication-update evidence only records the
blocked governance boundary: `Production-ready claim allowed = no` and
`Testnet production-candidate claim allowed = no`. Gate 6 remains blocked on
external-review, release-support/governance-ready/open-blocker closure, and
reviewer-approval evidence.
The latest Gate 6 blocker map at commit `7f516dcc` records the local
public-boundary rejection of broadcast enablement before readiness review,
source-boundary evidence that the signer-gated scope surfaces use the public
Phase 010a committee guard shape, source-boundary evidence that the
MainChainLock emergency escape path remains separate from committee spend, and
historical source-boundary evidence that MCU Phase 2 was bound only to the
compile-time SCS NFT DataInput. That evidence is superseded by WP-02: new legacy
MCU creation/spend is disabled, immutable v1 boxes require read-only inventory,
and the source replacement adds transitional committee authorization without
claiming Gate 5 closure. It also links threshold-policy source-boundary evidence for the
2-of-3 Phase 010a committee model, member-loss threshold safety
source-boundary evidence, singleton continuity source-boundary evidence, plus
`npm run check`, `npm run wasm:test`,
`npm run demo:readiness -- --public-boundary`,
`npm run status -- --public-boundary`, and
`spike010a-committee-guard-eval.ts --public-boundary` command-output evidence,
while preserving the linked `npm run contracts:check` compilation evidence
from the earlier node-backed Gate 6 slice. It also records completed
below-policy threshold rejection evidence and keeps node-backed signer
behavior, concrete old/new committee identities, and rollback evidence linked.
It also links the sanitized local deployment-state reconciliation and
wrong-network negative handoff, while keeping external review, release
support/governance-ready/open-blocker closure, and reviewer approvals as
blockers. Its current `governance:validate` report refreshed at commit `724876b6`
remains `BLOCKED` with 10 structural issues and does not close Gate 6,
authorize key rotation, or support governance-ready or testnet
production-candidate wording. The current prerequisite map
`evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-08-724876b6.md`
records `Local reconciliation prerequisites linked = yes` and keeps external
review, publication-rule closure, and reviewer approvals as the next Gate 6
evidence sequence. The current external-review packet
`evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-08-724876b6.md`
turns those remaining blockers into reviewer inputs, decision questions, exact
output bindings, and no-authorization boundaries without closing Gate 6.
The local sanitized Gate 6 reconciliation producer is
`npm run governance:reconcile:local-packets -- --observed-at <ISO> --reconciliation-out <packet.json> --wrong-network-out <packet.json>`.
It writes validator-compatible local public reconciliation and wrong-network
negative packet shapes without reading private deployment records, deployment
state, runtime databases, environment files, wallet material, nodes, signing
keys, or broadcast paths. The current `9fd9d7e1` local reconciliation packet
artifacts are
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-04-9fd9d7e1.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-04-9fd9d7e1.md`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-04-9fd9d7e1.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-04-9fd9d7e1.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.md`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.md`,
and
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.json`.
The earlier `924e3205` local reconciliation packet artifacts are
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-03-924e3205.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.md`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-03-924e3205.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-03-924e3205.md`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-03-924e3205.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-03-924e3205.md`,
and
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-03-924e3205.json`.
The earlier baseline `6ef319cd` artifacts are
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-02-6ef319cd.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-02-6ef319cd.md`,
`evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-02-6ef319cd.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-02-6ef319cd.json`,
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-02-6ef319cd.md`,
and
`evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-02-6ef319cd.json`.
These artifacts prove only the public input schema and validator path. They do
not close deployment-state reconciliation, wrong-network evidence, external
review, reviewer approvals, key rotation, governance-ready claims, release
claims, deployment, signing, state mutation, or broadcast.

- [x] Storage-rent/liquidity maintenance runbook exists.
- [x] SQLite/AVL backup and restore runbook exists.
- [x] Incident response runbook exists.
- [x] Monitoring and alerting runbook exists.
- [x] Each runbook has stop conditions and verification commands.
- [x] Completed operator readiness evidence passes `npm run operator:validate`.
- [x] Operator Readiness Classification records a 7-40 character `Git commit`,
      `Release level = production deployment candidate`, `Environment =
      testnet`, classified `Broadcast mode` of `disabled` or `dry-run`,
      `Operator type = external operator` or `exchange operations reviewer`,
      non-empty `Reviewer`, and ISO `Date` before Gate 6 operator evidence can
      support testnet production-candidate wording.
- [x] Operator Readiness Classification `Git commit` matches the final
      clean-checkout Run Classification `Git commit` before Gate 6 operator
      evidence can support testnet production-candidate evaluation.
- [x] The operator-readiness `Runbook operator` sign-off matches the reviewer
      identity declared in Readiness Classification.
- [x] The operator-readiness `Runbook operator` sign-off date is not before
      readiness classification Date.
- [x] Command-specific operator command evidence is linked for every Gate 6
      operator command row.
- [x] Linked operator-readiness runbook, command, drill, and decision rows use
      distinct completed evidence targets; one shared operator artifact or log
      cannot close multiple row-specific checks.
- [x] Linked operator-readiness runbook, drill, and operational-decision
      evidence separates expected operator stop/block/recovery outcomes from
      failed validator or command markers, non-zero `exit code`, non-zero
      `errors`, and non-zero `structural issues`.
- [x] Operator command output evidence is internally positive: `PASS`,
      `passed`, `success`, or `exit code 0` cannot appear in the same command
      row as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues`.
- [x] Decision-specific operational evidence is linked for runbook discovery,
      stop-condition execution, monitoring, incident escalation, backup
      restore, governance rotation, and broadcast opt-in decisions.
- [x] Completed operator-readiness release-note update evidence is linked in
      the operator evidence.
- [x] Completed operator-readiness checklist update evidence is linked in the
      operator evidence.
- [x] Operator-readiness release-note and checklist update evidence uses
      distinct completed targets; one combined publication-update artifact
      cannot close both fields.
- [x] Operator-readiness publication-update evidence is internally positive:
      `PASS`, `passed`, `success`, or `exit code 0` cannot appear in the same
      update field as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [x] Operator-readiness reviewer notes are internally non-contradictory:
      actionable operator-readiness approval notes cannot also report failed
      validator or command markers, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [x] Operator-readiness evidence used for a production deployment candidate
      also states `Operator-ready claim allowed = yes`.
- [x] Operator-readiness reviewer decision summaries under an
      `Operator-ready claim allowed = yes` decision include exact
      `Operator-ready claim allowed = yes`.
- [x] Operator-readiness reviewer decision summaries under a
      `Testnet production-candidate claim allowed = yes` decision include exact
      `Testnet production-candidate claim allowed = yes`.
- [x] Operator-readiness evidence uses the exact numeric
      `Critical incidents open = 0` value; textual equivalents such as `none`
      or numeric shorthand without `= 0` do not close Gate 6.
- [x] Operator-readiness publication-update fields that mention critical
      incident closure also use the exact numeric
      `Critical incidents open = 0` value; textual equivalents such as `none`,
      `no`, `zero`, `closed`, `resolved`, or `mitigated` do not close Gate 6
      publication-update evidence, nor does numeric shorthand without `= 0`.
- [x] Reviewer decision summary covers release support, operator-ready claim
      handling, production-ready claim handling with exact
      `Production-ready claim allowed = no`, testnet production-candidate claim
      handling, and critical incidents.
- [x] Reviewer decision summary uses exact `Critical incidents open = 0`
      when closing Gate 6 critical incidents; textual zero-like terms or
      numeric shorthand without `= 0` do not close the reviewer decision.

Evidence:

- [Operator Runbooks](operator-runbooks.md)
- [Completed Operator Readiness Evidence](../evidence/operators/completed-operator-readiness-2026-06-04-9e3921cb.md)
- [Operator Readiness Validation Evidence](../evidence/operators/artifacts/operator-validate-2026-06-04-9e3921cb.md)
- [Operator Readiness Evidence Template](operator-readiness-evidence-template.md)
- [Live Rehearsal Evidence Template](live-rehearsal-template.md)
- [Committee Governance Evidence Template](committee-governance-evidence-template.md)
- [Phase 010a Committee Governance Blocker Map](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-26-1131a993.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 293351bd](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-26-293351bd.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 88845fd9](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-26-88845fd9.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map b046f5e3](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-b046f5e3.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 069b2fe1](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-069b2fe1.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 533277c2](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-533277c2.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 306f898d](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-306f898d.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 8ccf894a](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-8ccf894a.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map f341ad8c](../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-29-f341ad8c.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map cb31d9f3](../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-02-cb31d9f3.md)
- [Phase 010a Current-HEAD Committee Governance Blocker Map 7f516dcc](../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-03-7f516dcc.md)
- [Phase 010a Current Committee Governance Prerequisite Map e12d2817](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-e12d2817.md)
- [Phase 010a Current Committee Governance Prerequisite Map 48323e35](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-48323e35.md)
- [Phase 010a Current Committee Governance Prerequisite Map bb069632](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-bb069632.md)
- [Phase 010a Current Committee Governance Prerequisite Map 42ab576f](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-42ab576f.md)
- [Phase 010a Current Committee Governance External Review Packet 42ab576f](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-02-42ab576f.md)
- [Phase 010a Current Committee Governance Prerequisite Map 1920db1f](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-03-1920db1f.md)
- [Phase 010a Current Committee Governance External Review Packet 1920db1f](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-03-1920db1f.md)
- [Phase 010a Current Committee Governance Validation Report 1920db1f](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-03-1920db1f.md)
- [Phase 010a Current Committee Governance Prerequisite Map 7f516dcc](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-03-7f516dcc.md)
- [Phase 010a Current Committee Governance External Review Packet 7f516dcc](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-03-7f516dcc.md)
- [Phase 010a Current Committee Governance Validation Report 7f516dcc](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-03-7f516dcc.md)
- [Phase 010a Current Committee Governance Validation Report 924e3205](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-03-924e3205.md)
- [Phase 010a Current Committee Governance Prerequisite Map 60c8a115](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-05-60c8a115.md)
- [Phase 010a Current Committee Governance External Review Packet 60c8a115](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-05-60c8a115.md)
- [Phase 010a Current Committee Governance Validation Report 60c8a115](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-05-60c8a115.md)
- [Phase 010a Current Committee Governance Prerequisite Map 1bda5de6](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-06-1bda5de6.md)
- [Phase 010a Current Committee Governance External Review Packet 1bda5de6](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-06-1bda5de6.md)
- [Phase 010a Current Committee Governance Validation Report 1bda5de6](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-06-1bda5de6.md)
- [Phase 010a Current Committee Governance Prerequisite Map 7fd43daf](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-07-7fd43daf.md)
- [Phase 010a Current Committee Governance External Review Packet 7fd43daf](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-07-7fd43daf.md)
- [Phase 010a Current Committee Governance Validation Report 7fd43daf](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-07-7fd43daf.md)
- [Phase 010a Current Committee Governance Prerequisite Map 724876b6](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-08-724876b6.md)
- [Phase 010a Current Committee Governance External Review Packet 724876b6](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-08-724876b6.md)
- [Phase 010a Current Committee Governance Validation Report 724876b6](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-08-724876b6.md)
- [Phase 010a Committee Guard Structured Blocker Report](../evidence/governance/artifacts/phase010a-committee-guard-blocker-report-2026-06-25-1f1118ca.md)
- [Phase 010a Committee Guard Public Boundary Output](../evidence/governance/artifacts/phase010a-committee-guard-public-boundary-2026-06-26-9c312cb4.md)
- [Phase 010a Current-HEAD Committee Guard Public Boundary Output](../evidence/governance/artifacts/phase010a-committee-guard-public-boundary-2026-06-26-1131a993.md)
- [Phase 010a Current-HEAD Committee Guard Public Boundary Output 533277c2](../evidence/governance/artifacts/phase010a-committee-guard-public-boundary-2026-06-27-533277c2.md)
- [Phase 010a Current-HEAD Committee Guard Public Boundary Output 7f516dcc](../evidence/governance/artifacts/phase010a-committee-guard-public-boundary-2026-07-03-7f516dcc.md)
- [Gate 6 Broadcast Before Readiness Negative Evidence](../evidence/governance/artifacts/completed-gate6-negative-broadcast-before-readiness-review-2026-06-26-293351bd.md)
- [Gate 6 Signer-Gated Scope Source-Boundary Evidence 8ccf894a](../evidence/governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md)
- [Gate 6 Member-Loss Threshold Safety Source-Boundary Evidence](../evidence/governance/artifacts/completed-gate6-member-loss-threshold-safety-source-boundary-2026-06-29-442a1b08.md)
- [Gate 6 Singleton Continuity Source-Boundary Evidence](../evidence/governance/artifacts/completed-gate6-singleton-continuity-source-boundary-2026-06-29-442a1b08.md)
- [Gate 6 MCL Emergency Escape Boundary Evidence](../evidence/governance/artifacts/completed-gate6-mcl-emergency-escape-boundary-2026-06-26-88845fd9.md)
- [Gate 6 MCU Phase 2 SCS Boundary Evidence](../evidence/governance/artifacts/completed-gate6-mcu-phase2-scs-boundary-2026-06-27-b046f5e3.md)
- [Gate 6 npm run contracts:check Command Evidence 306f898d](../evidence/governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md)
- [Gate 6 npm run check Command Evidence 069b2fe1](../evidence/governance/artifacts/npm-run-check-pass-2026-06-27-069b2fe1.md)
- [Gate 6 npm run wasm:test Command Evidence 069b2fe1](../evidence/governance/artifacts/npm-run-wasm-test-pass-2026-06-27-069b2fe1.md)
- [Gate 6 npm run demo:readiness Public Boundary Output 533277c2](../evidence/governance/artifacts/npm-run-demo-readiness-public-boundary-2026-06-27-533277c2.md)
- [Gate 6 npm run status Public Boundary Output 533277c2](../evidence/governance/artifacts/npm-run-status-public-boundary-2026-06-27-533277c2.md)
- [Gate 6 npm run check Command Evidence 7f516dcc](../evidence/governance/artifacts/npm-run-check-pass-2026-07-03-7f516dcc.md)
- [Gate 6 npm run wasm:test Command Evidence 7f516dcc](../evidence/governance/artifacts/npm-run-wasm-test-pass-2026-07-03-7f516dcc.md)
- [Gate 6 npm run demo:readiness Public Boundary Output 7f516dcc](../evidence/governance/artifacts/npm-run-demo-readiness-public-boundary-2026-07-03-7f516dcc.md)
- [Gate 6 npm run status Public Boundary Output 7f516dcc](../evidence/governance/artifacts/npm-run-status-public-boundary-2026-07-03-7f516dcc.md)
- [Gate 6 Local Reconciliation Input 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-03-924e3205.json)
- [Gate 6 Local Reconciliation Report 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.md)
- [Gate 6 Local Reconciliation Report JSON 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.json)
- [Gate 6 Local Wrong-Network Input 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-03-924e3205.json)
- [Gate 6 Local Wrong-Network Report 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-03-924e3205.md)
- [Gate 6 Local Wrong-Network Report JSON 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-03-924e3205.json)
- [Gate 6 Local Reconciliation Handoff 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-03-924e3205.md)
- [Gate 6 Local Reconciliation Handoff JSON 924e3205](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-03-924e3205.json)
- [Gate 6 Local Reconciliation Input 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-04-9fd9d7e1.json)
- [Gate 6 Local Reconciliation Report 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-04-9fd9d7e1.md)
- [Gate 6 Local Reconciliation Report JSON 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-04-9fd9d7e1.json)
- [Gate 6 Local Wrong-Network Input 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-04-9fd9d7e1.json)
- [Gate 6 Local Wrong-Network Report 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.md)
- [Gate 6 Local Wrong-Network Report JSON 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.json)
- [Gate 6 Local Reconciliation Handoff 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.md)
- [Gate 6 Local Reconciliation Handoff JSON 9fd9d7e1](../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.json)
- [Phase 010a Committee Governance Prerequisite Map 924e3205](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-03-924e3205.md)
- [Phase 010a Committee Governance External Review Packet 924e3205](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-03-924e3205.md)
- [Phase 010a Committee Governance Prerequisite Map 60c8a115](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-05-60c8a115.md)
- [Phase 010a Committee Governance External Review Packet 60c8a115](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-05-60c8a115.md)
- [Phase 010a Committee Governance Prerequisite Map 1bda5de6](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-06-1bda5de6.md)
- [Phase 010a Committee Governance External Review Packet 1bda5de6](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-06-1bda5de6.md)
- [Phase 010a Committee Governance Prerequisite Map 7fd43daf](../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-07-7fd43daf.md)
- [Phase 010a Committee Governance External Review Packet 7fd43daf](../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-07-7fd43daf.md)
- [Phase 010a Governance Validation Blocker Report](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-25-867a3173.md)
- [Phase 010a Current Governance Validation Blocker Report](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-6815f77a.md)
- [Gate 6 Current-HEAD Public Boundary Refresh](../evidence/governance/artifacts/gate6-current-head-public-boundary-refresh-2026-06-26-cd96f709.md)
- [Gate 6 Current-HEAD Public Boundary Refresh 1131a993](../evidence/governance/artifacts/gate6-current-head-public-boundary-refresh-2026-06-26-1131a993.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-cd96f709.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 1131a993](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-1131a993.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 293351bd](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-293351bd.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 88845fd9](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-88845fd9.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report b046f5e3](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-b046f5e3.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 069b2fe1](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-069b2fe1.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 533277c2](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-533277c2.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 306f898d](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-306f898d.md)
- [Gate 6 Current-HEAD Governance Validation Blocker Report 8ccf894a](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-27-8ccf894a.md)
- [Gate 6 Current Governance Validation Blocker Report e12d2817](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-02-e12d2817.md)
- [Gate 6 Current Governance Validation Blocker Report 48323e35](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-02-48323e35.md)
- [Gate 6 Current Governance Validation Blocker Report fb143710](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-02-fb143710.md)
- [Gate 6 Current Governance Validation Blocker Report bb069632](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-02-bb069632.md)
- [Gate 6 Current Governance Validation Blocker Report 42ab576f](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-02-42ab576f.md)
- [Gate 6 Governance Release-note Update Evidence](../evidence/governance/artifacts/completed-gate-6-governance-release-note-update-evidence-2026-06-26-cef3eed2.md)
- [Gate 6 Governance Checklist Update Evidence](../evidence/governance/artifacts/completed-gate-6-governance-checklist-update-evidence-2026-06-26-cef3eed2.md)
- [Gate 6 Governance Publication Update Validation Blocker Report](../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-cef3eed2.md)
- [Gate 6 npm run status Public Boundary Output](../evidence/governance/artifacts/npm-run-status-public-boundary-2026-06-26-fc8420be.md)
- [Gate 6 npm run demo:readiness Public Boundary Output](../evidence/governance/artifacts/npm-run-demo-readiness-public-boundary-2026-06-26-0727a9d6.md)
- `relayer/src/operator-readiness-evidence.test.ts`
- `relayer/src/committee-governance-evidence.test.ts`

## Gate 7: Performance And Scaling Evidence

- [ ] Single-claim settlement remains covered as the correctness baseline.
- [ ] Batch settlement benchmark covers build time, proof size, TX size, and
      cost-relevant counts.
- [ ] Linked benchmark metric rows include exactly one positive numeric
      `inputs=`, `outputs=`, `vars=`, and `batch=` cost count per row.
- [ ] Sharded lane planner has executable lane-isolation tests.
- [ ] Scenario-specific single/batch/sharded metric evidence is linked before
      benchmark or scaling claims are marked supported.
- [ ] Each benchmark metric row's evidence command or log cites the same
      sample count declared by that row with an explicit sample-count,
      `samples`, or `runs` label; bare `n` shorthand is not enough.
- [ ] Each benchmark metric row's evidence command or log cites the same
      `inputs=`, `outputs=`, `vars=`, and `batch=` cost counts declared by
      that row.
- [ ] Live batch evidence links submit/confirm or `npm run e2e:aggregate`
      artifacts plus user explicit live broadcast approval evidence bound to
      the Expected transaction ID, scoped BRIDGE_BROADCAST_ENABLED=true
      evidence, post-enable `npm run demo:readiness` PASS evidence, Broadcast
      policy PASS evidence, Live settlement signing PASS evidence, and
      broadcast network reconfirmation evidence before any live settlement
      benchmark claim.
- [ ] Sharded-lane evidence closes each lane claim separately.
- [ ] Throughput and latency claims are tied to reproducible scripts or logs.
- [ ] Remaining bottlenecks are explicitly documented.
- [ ] Completed benchmark evidence passes `npm run benchmark:validate`.
- [ ] The completed benchmark evidence target and the
      `npm run benchmark:validate` output are linked as distinct artifacts, and
      the validation segment names the same benchmark validation target.
- [ ] `release:gate -- --benchmark-evidence` consumes the validator's
      structured claims boundary, including all required allowed and blocked
      benchmark claim arrays; a benchmark `PASS` with classification and
      publication decision only is not enough.
- [ ] Benchmark row evidence is linked outside validator target bindings:
      `benchmark validation target`, `benchmark validate target`,
      `validated target`, and `validated input` are validator provenance only
      and cannot close metric, sharded-lane, bottleneck, live-batch,
      release-note, or checklist evidence rows.
- [ ] Linked benchmark metric, sharded-lane, and bottleneck rows use distinct
      completed evidence targets; one shared benchmark artifact or log cannot
      close multiple row-specific measurements, lane statements, or bottleneck
      checks.
- [ ] Benchmark Classification records a 7-40 character `Git commit`,
      `Environment = testnet`, `Trust path = trustless burn proof path`,
      reproducible machine/toolchain metadata, non-empty `Reviewer`, and ISO
      `Date` before Gate 7 benchmark evidence can support testnet
      production-candidate wording.
- [ ] Benchmark Classification `Git commit` matches the final clean-checkout
      Run Classification `Git commit` before Gate 7 benchmark evidence can
      support testnet production-candidate evaluation.
- [ ] The benchmark `Benchmark owner` sign-off matches the reviewer identity
      declared in Benchmark Classification.
- [ ] The benchmark `Benchmark owner` sign-off date is not before benchmark
      classification Date.
- [ ] Reviewer decision summary includes exact
      `Release supported = production deployment candidate`, measured
      single/batch/sharded evidence, production-ready claim handling with exact
      `Production-ready claim allowed = no`, testnet production-candidate claim
      handling, and production throughput claim handling.
- [ ] Benchmark reviewer notes are internally non-contradictory: actionable
      benchmark approval notes cannot also report failed validator or command
      markers, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
      `structural issues`.
- [ ] Publication decision facts state `Scaling claims allowed = yes`,
      `Production-ready claim allowed = no`,
      `Production throughput claim allowed = no`,
      `Mainnet-grade evidence linked = no`, `Open benchmark blockers = 0`,
      and `Release notes updated = yes` for the current institutional-reference
      benchmark boundary.
- [ ] Benchmark publication decision uses the exact numeric
      `Open benchmark blockers = 0` value; textual equivalents such as `none`
      do not close Gate 7.
- [ ] Benchmark reviewer decision summaries that close open benchmark blocker
      handling state open benchmark blocker handling with exact
      `Open benchmark blockers = 0`; numeric shorthand such as
      `open benchmark blocker handling: 0` without the exact binding does not
      close the reviewer decision.
- [ ] Benchmark publication-update fields use exact numeric
      `Open benchmark blockers = 0` when they mention benchmark blocker
      closure; textual equivalents such as `none`, `no`, `zero`, `closed`,
      `resolved`, or `mitigated`, and numeric shorthand without `= 0`, do not
      close Gate 7 publication-update evidence.
- [ ] Benchmark publication-update fields include exact
      `Scaling claims allowed = yes` when benchmark publication decisions set
      `Scaling claims allowed = yes`; prose-only terms such as `allowed`,
      `approved`, or `supported` do not close Gate 7 publication-update
      evidence.
- [ ] Benchmark reviewer decision summaries under a
      `Scaling claims allowed = yes` decision include exact
      `Scaling claims allowed = yes`.
- [ ] Benchmark reviewer decision summaries under a
      `Mainnet-grade evidence linked = no` decision include exact
      `Mainnet-grade evidence linked = no`.
- [ ] Benchmark publication-update fields include exact
      `Production throughput claim allowed = no` when benchmark publication
      decisions set `Production throughput claim allowed = no`; prose-only
      terms such as `blocked`, `forbidden`, or `not allowed` do not close that
      boundary.
- [ ] Benchmark reviewer decision summaries that close production throughput
      claim handling include exact `Production throughput claim allowed = no`.
- [ ] Testnet production-candidate benchmark support requires
      `Release supported = production deployment candidate`,
      `Environment = testnet`, classified `Broadcast mode = enabled` for the
      linked `Live batch settlement` row, user explicit live broadcast approval
      evidence bound to the Expected transaction ID, scoped
      `BRIDGE_BROADCAST_ENABLED=true` evidence, post-enable readiness/policy/
      signing PASS evidence, broadcast network reconfirmation evidence, a
      submitted live-batch transaction ID matching the Expected transaction ID,
      and `Testnet production-candidate claim allowed = yes`; otherwise
      benchmark evidence remains valid only for narrower institutional-reference
      claims.
- [ ] Live batch readiness, broadcast policy, and signing PASS snippets are
      internally positive; nearby `FAIL`, `BLOCKED`, `ERROR`, non-zero
      `exit code`, non-zero `errors`, or non-zero `structural issues` before
      or after `PASS` keeps Gate 7 benchmark evidence blocked.
- [ ] Completed Gate 7 benchmark release-note update evidence is linked in the
      benchmark evidence.
- [ ] Completed Gate 7 benchmark checklist update evidence is linked in the
      benchmark evidence.
- [ ] Completed Gate 7 benchmark release-note and checklist update evidence
      uses distinct completed targets; one combined publication-update artifact
      cannot close both fields.
- [ ] Benchmark publication-update evidence is internally positive: `PASS`,
      `passed`, `success`, or `exit code 0` cannot appear in the same update
      field as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues`.

Evidence:

- [Performance Benchmark Evidence Template](performance-benchmark-evidence-template.md)
- [Sharded Settlement Lanes](sharded-settlement-lanes.md)
- [Gate 7 Offline Structured Benchmark Candidate](../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-25-ca56646f.md)
- [Gate 7 Current Offline Structured Benchmark Candidate](../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-26-0e3765fa.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate](../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 59086914](../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 66eac48d](../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 86d02ffe](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 5d37c906](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-01-5d37c906.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 860dce7f](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate aa729be2](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate dca4268b](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate bcb15f7a](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate b0224fd6](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 37d1f8f7](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 866ea4f4](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 3b68c4ae](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 0ea48b2d](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate dc64fb20](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 7b62adc8](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 54b10663](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Offline Structured Benchmark Candidate 05f25f0e](../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-05f25f0e.md)
- [Gate 7 Current-HEAD Offline Benchmark Refresh](../evidence/benchmarks/artifacts/current-head-offline-benchmark-refresh-2026-06-26-018443c3.md)
- [Gate 7 Current-HEAD Offline Benchmark Refresh 5d2d8903](../evidence/benchmarks/artifacts/current-head-offline-benchmark-refresh-2026-06-26-5d2d8903.md)
- [Gate 7 Live Batch Prerequisite Map](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-06-25-352ef050.md)
- [Gate 7 Current Live Batch Prerequisite Map 9341b93e](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-9341b93e.md)
- [Gate 7 Current Live Batch Prerequisite Map 860dce7f](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-860dce7f.md)
- [Gate 7 Current Live Batch Prerequisite Map aa729be2](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-aa729be2.md)
- [Gate 7 Current Live Batch Prerequisite Map 0f2c3462](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-0f2c3462.md)
- [Gate 7 Current Live Batch Prerequisite Map dca4268b](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-dca4268b.md)
- [Gate 7 Current Live Batch Prerequisite Map bcb15f7a](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-bcb15f7a.md)
- [Gate 7 Current Live Batch Prerequisite Map b0224fd6](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-b0224fd6.md)
- [Gate 7 Current Live Batch Prerequisite Map 37d1f8f7](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-37d1f8f7.md)
- [Gate 7 Current Live Batch Prerequisite Map 866ea4f4](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-866ea4f4.md)
- [Gate 7 Current Live Batch Prerequisite Map 3b68c4ae](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-04-3b68c4ae.md)
- [Gate 7 Current Live Batch Prerequisite Map 0ea48b2d](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-04-0ea48b2d.md)
- [Gate 7 Current Live Batch Prerequisite Map dc64fb20](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-05-dc64fb20.md)
- [Gate 7 Current Live Batch Prerequisite Map 7b62adc8](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-08-7b62adc8.md)
- [Gate 7 Current Live Batch Prerequisite Map 54b10663](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-08-54b10663.md)
- [Gate 7 Current Live Batch Prerequisite Map 05f25f0e](../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-08-05f25f0e.md)
- [Gate 7 Current Live Benchmark Prerequisite Map e91f591c](../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md)
- [Gate 7 Current Live Benchmark Review Packet 0f2c3462](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-02-0f2c3462.md)
- [Gate 7 Current Live Benchmark Review Packet dca4268b](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-03-dca4268b.md)
- [Gate 7 Current Live Benchmark Review Packet bcb15f7a](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-03-bcb15f7a.md)
- [Gate 7 Current Live Benchmark Review Packet b0224fd6](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-03-b0224fd6.md)
- [Gate 7 Current Live Benchmark Review Packet 37d1f8f7](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-03-37d1f8f7.md)
- [Gate 7 Current Live Benchmark Review Packet 866ea4f4](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-03-866ea4f4.md)
- [Gate 7 Current Live Benchmark Review Packet 3b68c4ae](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-04-3b68c4ae.md)
- [Gate 7 Current Live Benchmark Review Packet 0ea48b2d](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-04-0ea48b2d.md)
- [Gate 7 Current Live Benchmark Review Packet dc64fb20](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-05-dc64fb20.md)
- [Gate 7 Current Live Benchmark Review Packet 7b62adc8](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-08-7b62adc8.md)
- [Gate 7 Current Live Benchmark Review Packet 54b10663](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-08-54b10663.md)
- [Gate 7 Current Live Benchmark Review Packet 05f25f0e](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-08-05f25f0e.md)
- [Gate 7 Current Live Benchmark Review Packet e91f591c](../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md)
- [Gate 7 Current Live Batch Capture Manifest 8091eb2e](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-05-8091eb2e.md)
- [Gate 7 Current Live Batch Capture Manifest 19d8ae4c](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-06-19d8ae4c.md)
- [Gate 7 Current Live Batch Capture Manifest 0187ff51](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-07-0187ff51.md)
- [Gate 7 Current Live Batch Capture Manifest 3f1d70f3](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-07-3f1d70f3.md)
- [Gate 7 Current Live Batch Capture Manifest 7b62adc8](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-08-7b62adc8.md)
- [Gate 7 Current Live Batch Capture Manifest 54b10663](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-08-54b10663.md)
- [Gate 7 Current Live Batch Capture Manifest 05f25f0e](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-08-05f25f0e.md)
- [Gate 7 Current Live Batch Capture Manifest 918f83a2](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-918f83a2.md)
- [Gate 7 Current Live Batch Capture Manifest e91f591c](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-e91f591c.md)
- [Gate 7 Current Live Batch Capture Manifest cc9b0417](../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-cc9b0417.md)
- [Gate 7 Current Live Benchmark Execution Request 5c27607a](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-06-5c27607a.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-06-5c27607a.json`
- [Gate 7 Current Live Benchmark Execution Request 0187ff51](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-07-0187ff51.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-07-0187ff51.json`
- [Gate 7 Current Live Benchmark Execution Request 3f1d70f3](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-07-3f1d70f3.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-07-3f1d70f3.json`
- [Gate 7 Current Live Benchmark Execution Request 7b62adc8](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-08-7b62adc8.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-08-7b62adc8.json`
- [Gate 7 Current Live Benchmark Execution Request 54b10663](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-08-54b10663.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-08-54b10663.json`
- [Gate 7 Current Live Benchmark Execution Request 05f25f0e](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-08-05f25f0e.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-08-05f25f0e.json`
- [Gate 7 Current Live Benchmark Execution Request 918f83a2](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-918f83a2.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-09-918f83a2.json`
- [Gate 7 Current Live Benchmark Execution Request e91f591c](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-e91f591c.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-09-e91f591c.json`
- [Gate 7 Current Live Benchmark Execution Request cc9b0417](../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.md)
- `evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.json`
- [Gate 7 Current Benchmark Validation Report 9341b93e](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-9341b93e.md)
- [Gate 7 Current Benchmark Validation Report 860dce7f](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-860dce7f.md)
- [Gate 7 Current Benchmark Validation Report aa729be2](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-aa729be2.md)
- [Gate 7 Current Benchmark Validation Report 0f2c3462](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-0f2c3462.md)
- [Gate 7 Current Benchmark Validation Report dca4268b](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-dca4268b.md)
- [Gate 7 Current Benchmark Validation Report bcb15f7a](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-bcb15f7a.md)
- [Gate 7 Current Benchmark Validation Report b0224fd6](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-b0224fd6.md)
- [Gate 7 Current Benchmark Validation Report 37d1f8f7](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-37d1f8f7.md)
- [Gate 7 Current Benchmark Validation Report 866ea4f4](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-03-866ea4f4.md)
- [Gate 7 Current Benchmark Validation Report 3b68c4ae](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-04-3b68c4ae.md)
- [Gate 7 Current Benchmark Validation Report 0ea48b2d](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-04-0ea48b2d.md)
- [Gate 7 Current Benchmark Validation Report dc64fb20](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-05-dc64fb20.md)
- [Gate 7 Current Benchmark Validation Report 7b62adc8](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-08-7b62adc8.md)
- [Gate 7 Current Benchmark Validation Report 54b10663](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-08-54b10663.md)
- [Gate 7 Current Benchmark Validation Report 05f25f0e](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-08-05f25f0e.md)
- [Gate 7 Current Benchmark Prerequisite Validation Report e91f591c](../evidence/benchmarks/artifacts/benchmark-validate-gate7-current-prereq-blocked-2026-07-09-e91f591c.md)
- [Gate 7 Current Showcase Benchmark Output](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-06-26-29c80366.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 59086914](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 66eac48d](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 86d02ffe](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 860dce7f](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output aa729be2](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output dca4268b](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output bcb15f7a](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output b0224fd6](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 37d1f8f7](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 866ea4f4](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 3b68c4ae](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 0ea48b2d](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output dc64fb20](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 7b62adc8](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 54b10663](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Showcase Benchmark Output 05f25f0e](../evidence/benchmarks/artifacts/completed-current-showcase-benchmark-output-2026-07-08-05f25f0e.md)
- [Gate 7 Current Showcase Lanes Output](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-06-26-29c80366.md)
- [Gate 7 Current-HEAD Showcase Lanes Output](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 59086914](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 66eac48d](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 86d02ffe](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 860dce7f](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Showcase Lanes Output aa729be2](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Showcase Lanes Output dca4268b](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Showcase Lanes Output bcb15f7a](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Showcase Lanes Output b0224fd6](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 37d1f8f7](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 866ea4f4](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 3b68c4ae](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 0ea48b2d](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Showcase Lanes Output dc64fb20](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 7b62adc8](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 54b10663](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Showcase Lanes Output 05f25f0e](../evidence/benchmarks/artifacts/completed-current-showcase-lanes-output-2026-07-08-05f25f0e.md)
- [Gate 7 Current Showcase Proof Objects Output](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-06-26-29c80366.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 59086914](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 66eac48d](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 86d02ffe](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 860dce7f](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output aa729be2](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output dca4268b](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output bcb15f7a](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output b0224fd6](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 37d1f8f7](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 866ea4f4](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 3b68c4ae](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 0ea48b2d](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output dc64fb20](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 7b62adc8](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 54b10663](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Showcase Proof Objects Output 05f25f0e](../evidence/benchmarks/artifacts/completed-current-showcase-proofs-output-2026-07-08-05f25f0e.md)
- [Gate 7 Current Showcase Finality Output](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-06-26-29c80366.md)
- [Gate 7 Current-HEAD Showcase Finality Output](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Showcase Finality Output 59086914](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Showcase Finality Output 66eac48d](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Showcase Finality Output 86d02ffe](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Showcase Finality Output 860dce7f](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Showcase Finality Output aa729be2](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Showcase Finality Output dca4268b](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Showcase Finality Output bcb15f7a](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Showcase Finality Output b0224fd6](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Showcase Finality Output 37d1f8f7](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Showcase Finality Output 866ea4f4](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Showcase Finality Output 3b68c4ae](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Showcase Finality Output 0ea48b2d](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Showcase Finality Output dc64fb20](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Showcase Finality Output 7b62adc8](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Showcase Finality Output 54b10663](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Showcase Finality Output 05f25f0e](../evidence/benchmarks/artifacts/completed-current-showcase-finality-output-2026-07-08-05f25f0e.md)
- [Gate 7 Current Offline Metric Rows](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-26-91578b45.md)
- [Gate 7 Current-HEAD Offline Metric Rows](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Offline Metric Rows 59086914](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Offline Metric Rows 66eac48d](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Offline Metric Rows 86d02ffe](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Offline Metric Rows 860dce7f](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Offline Metric Rows aa729be2](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Offline Metric Rows dca4268b](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Offline Metric Rows bcb15f7a](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Offline Metric Rows b0224fd6](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Offline Metric Rows 37d1f8f7](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Offline Metric Rows 866ea4f4](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Offline Metric Rows 3b68c4ae](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Offline Metric Rows 0ea48b2d](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Offline Metric Rows dc64fb20](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Offline Metric Rows 7b62adc8](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Offline Metric Rows 54b10663](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Offline Metric Rows 05f25f0e](../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-07-08-05f25f0e.md)
- [Gate 7 Current-HEAD Relayer Check Output](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Relayer Check Output 59086914](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Relayer Check Output 66eac48d](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Relayer Check Output 86d02ffe](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Relayer Check Output 860dce7f](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Relayer Check Output aa729be2](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD Relayer Check Output dca4268b](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD Relayer Check Output bcb15f7a](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD Relayer Check Output b0224fd6](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD Relayer Check Output 37d1f8f7](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD Relayer Check Output 866ea4f4](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD Relayer Check Output 3b68c4ae](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD Relayer Check Output 0ea48b2d](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD Relayer Check Output dc64fb20](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD Relayer Check Output 7b62adc8](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD Relayer Check Output 54b10663](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD Relayer Check Output 05f25f0e](../evidence/benchmarks/artifacts/npm-run-check-pass-2026-07-08-05f25f0e.md)
- [Gate 7 Current-HEAD WASM Test Output](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD WASM Test Output 59086914](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD WASM Test Output 66eac48d](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD WASM Test Output 86d02ffe](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD WASM Test Output 860dce7f](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD WASM Test Output aa729be2](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-02-aa729be2.md)
- [Gate 7 Current-HEAD WASM Test Output dca4268b](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-dca4268b.md)
- [Gate 7 Current-HEAD WASM Test Output bcb15f7a](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-bcb15f7a.md)
- [Gate 7 Current-HEAD WASM Test Output b0224fd6](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-b0224fd6.md)
- [Gate 7 Current-HEAD WASM Test Output 37d1f8f7](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-37d1f8f7.md)
- [Gate 7 Current-HEAD WASM Test Output 866ea4f4](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-03-866ea4f4.md)
- [Gate 7 Current-HEAD WASM Test Output 3b68c4ae](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-04-3b68c4ae.md)
- [Gate 7 Current-HEAD WASM Test Output 0ea48b2d](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-04-0ea48b2d.md)
- [Gate 7 Current-HEAD WASM Test Output dc64fb20](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-05-dc64fb20.md)
- [Gate 7 Current-HEAD WASM Test Output 7b62adc8](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-08-7b62adc8.md)
- [Gate 7 Current-HEAD WASM Test Output 54b10663](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-08-54b10663.md)
- [Gate 7 Current-HEAD WASM Test Output 05f25f0e](../evidence/benchmarks/artifacts/npm-run-wasm-test-pass-2026-07-08-05f25f0e.md)
- [Gate 7 Benchmark Release-note Update Evidence](../evidence/benchmarks/artifacts/completed-gate-7-benchmark-release-note-update-evidence-2026-06-26-11ebc444.md)
- [Gate 7 Benchmark Checklist Update Evidence](../evidence/benchmarks/artifacts/completed-gate-7-benchmark-checklist-update-evidence-2026-06-26-11ebc444.md)
- [Gate 7 Offline Metric Map](../evidence/benchmarks/gate7-benchmark-offline-metric-map-2026-06-25-6d3ffbc1.md)
- [Gate 7 Offline Sharded Metric Map](../evidence/benchmarks/gate7-benchmark-offline-sharded-metric-map-2026-06-25-3a1f8b21.md)
- [Gate 7 Completed Offline Sharded Shape Metrics](../evidence/benchmarks/artifacts/completed-offline-sharded-shape-metrics-output-2026-06-25-3a1f8b21.md)
- [Gate 7 Benchmark Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-25-ca56646f.md)
- [Gate 7 Current Benchmark Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-25-c46ba08a.md)
- [Gate 7 Structured Benchmark Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-26-a3df1055.md)
- [Gate 7 Current Structured Benchmark Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-26-3cc5f991.md)
- [Gate 7 Current Candidate Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-26-0e3765fa.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-26-5d2d8903.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report 59086914](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-27-59086914.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report 66eac48d](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-30-66eac48d.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report 86d02ffe](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-01-86d02ffe.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report 860dce7f](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-860dce7f.md)
- [Gate 7 Current-HEAD Candidate Validation Blocker Report aa729be2](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-07-02-aa729be2.md)
- [Gate 7 Current Publication Update Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-offline-structured-candidate-blocked-2026-06-26-11ebc444.md)
- [Gate 7 Offline Sharded Metric Validation Blocker Report](../evidence/benchmarks/artifacts/benchmark-validate-gate7-offline-sharded-metric-map-blocked-2026-06-25-3a1f8b21.md)
- `relayer/src/shard-router.test.ts`
- `relayer/src/benchmark-evidence.test.ts`
- `npm run benchmark:validate`
- `npm run showcase`

## Gate 8: External Integration Package

- [x] README starts with status and publication blockers.
- [x] Developer walkthrough is accurate for a fresh reader.
- [x] Integration checklist lists required configuration and stop conditions.
- [x] API/contract assumptions are documented.
- [x] Limitations are not hidden behind marketing language.
- [x] Required entry points are linked with completed external-review evidence
      beyond the entrypoint document link; a bare README, roadmap, checklist,
      or runbook link cannot close Gate 8.
- [x] Integration decision record answers the trust, signer, broadcast, burn,
      batch, scaling, and recovery boundaries.
- [x] Integration decision rows link decision-specific evidence for trust
      model, signer path, broadcast, burn, sidechain commitment,
      duplicate-burn rejection, batch boundary, contract/relayer assumptions,
      scaling blockers, and recovery.
- [x] Negative review checks correct production, mainnet, signing, broadcast,
      trustless-burn, FROST, sharding, and benchmark misreads.
- [x] Reviewer organization or affiliation records a concrete external
      organization or affiliation; placeholders such as `external`, `TBD`, or
      `reviewer organization` are not enough, and
      `Private maintainer context used = no`. `release:gate` consumes this
      structured classification field from `integration:validate`; a PASS
      summary with a missing or generic reviewer organization remains blocked.
- [x] Review Classification records explicit broadcast mode disabled or dry-run;
      missing or enabled broadcast mode cannot close Gate 8 package review
      evidence.
- [x] Review Classification records a concrete 7-40 character `Git commit`
      and ISO `Date`; `release:gate` consumes both fields from
      `integration:validate` before accepting fresh-checkout or reviewer rows.
- [x] For Gate 8 `Checked` rows and testnet production-candidate evaluation,
      Review Classification `Git commit` matches the final clean-checkout Run
      Classification `Git commit`.
- [x] Review Classification records a non-empty `Lead reviewer`; `release:gate`
      consumes this field from `integration:validate` before accepting
      reviewer sign-off or testnet production-candidate wording.
- [x] The external integration `Integration reviewer` sign-off matches the
      `Lead reviewer` identity declared in Review Classification.
- [x] The external integration `Integration reviewer` sign-off date is not
      before review classification Date.
- [x] External integration reviewer notes remain claim-bounded: they may approve
      the package review outcome, but must not approve production-ready wording
      or mainnet production wording.
- [x] External integration reviewer notes are internally non-contradictory:
      actionable external-integration approval notes cannot also report failed
      validator or command markers, `BLOCKED`, `ERROR`, non-zero `exit code`,
      non-zero `errors`, or non-zero `structural issues`.
- [x] Per-command fresh checkout command output evidence is linked; each row
      names the command output for `npm ci`, `npm run check`,
      `npm run wasm:test`, and `npm run showcase`, and includes explicit
      `exit code 0` output.
- [x] External integration row evidence does not reuse validator provenance as
      row proof: `integration validation target`, `external integration
      validation target`, `integration validate target`, `validated target`,
      and `validated input` bindings can identify the validator input/output,
      but cannot close entry-point, fresh-checkout, decision, negative-review,
      release-note, or checklist evidence rows by themselves.
- [x] Linked external integration row evidence uses distinct completed evidence
      targets across entry-point, fresh-checkout, decision, and negative-review
      rows; a single shared artifact cannot close multiple Gate 8 facts.
- [x] Linked external integration entry-point, decision, and negative-review
      evidence separates expected integration blockers or corrected misreads
      from failed validator or command markers, non-zero `exit code`, non-zero
      `errors`, and non-zero `structural issues`.
- [x] Fresh checkout command output evidence is internally positive; a row that
      also reports `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero
      `errors`, or non-zero `structural issues` cannot close Gate 8.
- [x] Per-command fresh checkout commit identity is linked and matches the
      Review Classification `Git commit`.
- [x] Completed external integration review passes `npm run integration:validate`.
- [x] Reviewer decision summary covers public institutional-reference release
      handling with exact `Public institutional-reference release allowed = yes`,
      production-ready claim handling with exact
      `Production-ready claim allowed = no`, and testnet
      production-candidate claim handling. It must use exact
      `Testnet production-candidate claim allowed = no` when the publication
      field is `no`, and exact
      `Testnet production-candidate claim allowed = yes` only when the
      publication field is `yes`.
- [x] External integration reviewer decision summary uses exact
      `Public institutional-reference release allowed = yes`; prose approval
      such as `public institutional-reference release handling: allowed` does
      not close Gate 8.
- [x] Publication rules state
      `Public institutional-reference release allowed = yes` before Gate 8 is
      marked checked for a public institutional-reference release.
- [x] Publication rules state `Production-ready claim allowed = no`; Gate 8
      cannot authorize production-ready claims even if the review
      classification is `production deployment candidate`.
- [x] Publication rules state `Testnet production-candidate claim allowed = yes`
      only for `production deployment candidate` evidence with
      `Environment used = testnet`; otherwise the claim remains blocked.
- [x] Completed Gate 8 integration release-note update evidence is linked in
      the external integration review.
- [x] Completed Gate 8 checklist update evidence is linked in the external
      integration review.
- [x] Completed Gate 8 integration release-note and checklist update evidence
      uses distinct completed targets; one combined publication-update artifact
      cannot close both fields.
- [x] Gate 8 release-note and checklist update fields include exact
      `Public institutional-reference release allowed = yes`; omission or
      prose-only approval does not close public institutional-reference release
      handling.
- [x] Gate 8 release-note and checklist update fields include exact
      `Private maintainer context used = no`; omission or prose-only denial
      does not close the private-context boundary.
- [x] Gate 8 publication-update evidence is internally positive; update fields
      that mix PASS-like notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero
      `exit code`, non-zero `errors`, or non-zero `structural issues` cannot
      close the external integration package review.

Evidence:

- [External Integration Review Template](external-integration-review-template.md)
- [Completed External Integration Review Evidence](../evidence/integration/completed-external-integration-review-2026-06-04-9e3921cb.md)
- [External Integration Validation Evidence](../evidence/integration/artifacts/integration-validate-2026-06-04-9e3921cb.md)
- [Contract And Relayer API Reference](contract-relayer-api-reference.md)
- [EVM Sidechain Integration Checklist](evm-integration-checklist.md)
- [Sidechain on Ergo in One Afternoon](sidechain-on-ergo-in-one-afternoon.md)
- [EVM Developer Showcase](evm-developer-showcase.md)
- `relayer/src/external-integration-evidence.test.ts`

## Pending Evidence Register

Every row below is a structured publication blocker until it is replaced by a
linked artifact. Do not replace these rows with narrative prose; add the
artifact link, update the status, and keep the publication effect explicit.
`npm run release:gate` fails if a `Checked` publication-blocker row has no
completed evidence link, command-output target, or artifact marker. Template
links, targetless command-output notes, and validator command names alone are
resolution targets or narrative status notes, not completed evidence. Checked
publication-blocker rows outside the required register must also carry
structured resolution evidence in the same segment, such as validator output,
release-notes blocker review with `Publication blocker resolved = yes`, or
reviewer decision evidence with `Reviewer decision = approve` and
`Publication blocker resolved = yes`; a target-only completed Markdown link or
`artifact://...` target is not enough. It
also applies evidence hygiene checks to every Publication effect and Required
resolution cell, so local paths, local file URLs, credential-bearing links,
runtime databases, deployment-state files, and diagnostic dumps cannot be used
as checklist evidence. It also fails if one of the required blocker rows below is removed,
downgraded from publication blocker, or left without a structured resolution
target. Required blocker rows must be resolved with structured evidence, not
narrative status notes. Each required blocker row must preserve its
row-specific evidence terms; generic artifact links are not enough to mark a
blocker as resolved. Required blocker rows must not be duplicated; one evidence
item must have one canonical status row. While unresolved, each required
blocker row must keep its canonical `Pending evidence` or `Open blocker` status
until completed evidence justifies marking it `Checked`.
For Gate 3 Fresh Ergo testnet lifecycle closure, the post-submit observation
must include a `npm run rehearsal:post-submit:observe` command with
`--state-db <operator-read-only-state-db>`, `--spv-tracker-nft-id <64hex>`,
`--aggregate-dup-nft-id <64hex>`, and
`--json-out <post-submit-observe.json>`, plus a completed structured post-submit observe JSON
report. Markdown post-submit evidence is a companion human-readable fragment;
the structured JSON report is required to prove transaction binding, burn
order, fixed successor/payout output positions, final miner fee binding,
confirmation policy, live-preflight provenance binding matching the validated
`--live-preflight-json` target, including `runtimeBroadcastEnabled: false`, and
read-only/no-claim boundaries. Its state source binding must use
`sourceBindings.state.targetClass = operator-provided-state-db`, with no
default runtime database fallback and no deployed-state singleton default
lookup. The same report must carry
`observation.confirmation.finalityEvidenceArtifact` as a completed distinct
artifact target, and the companion `Confirmation policy met` row must cite that
target as completed finality evidence. The structured report's
`observation.livePreflightBinding.target` and finality evidence artifact must
also be concrete; post-submit submit, confirmation, finality, reconciliation,
live-preflight report, and post-submit observe provenance targets named
`generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-*`, or `example-*`
are placeholders and cannot close Gate 3.
Publication effect and Required resolution cells must not introduce absolute
security wording.

| Gate | Pending evidence or blocker | Status | Publication effect | Required resolution |
|---|---|---|---|---|
| Gate 1 | Green CI on the final branch | Checked | Publication blocker for public release | Link completed [Clean Checkout Evidence Template completed evidence](../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md) as completed clean checkout evidence; `npm run ci:validate` command output log artifact://ci/artifacts/ci-validate.md PASS exit code 0 clean checkout validation target ../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md; command-specific clean-checkout output evidence with internally positive command output for `npm ci` artifact://ci/artifacts/npm-ci.md, `npm run check` artifact://ci/artifacts/npm-run-check.md, `npm run wasm:test` artifact://ci/artifacts/npm-run-wasm-test.md, `Release gate structural issues = 0` artifact://ci/artifacts/release-gate-zero-structural-issues.md, git hygiene artifact://ci/artifacts/git-status.md, CI workflow evidence artifact://ci/artifacts/workflow-file-is-tracked.md, workflow fact-specific evidence artifact://ci/artifacts/node-js-version-is-pinned.md, final branch commit identity artifact://ci/artifacts/final-branch-commit-is-identified.md, distinct completed evidence targets across linked command/workflow/decision rows, CI reviewer sign-off matches run classification, CI reviewer sign-off date is not before run classification Date, `Production-ready claim allowed = no`, `Testnet production-candidate claim allowed = yes`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, clean checkout CI green, production-ready claim handling with exact `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, exact `Release gate structural issues = 0`, internally non-contradictory clean checkout reviewer notes, completed Gate 1 release-note update evidence artifact://ci/artifacts/completed-gate-1-release-note-update-evidence.md, completed Gate 1 checklist update evidence artifact://ci/artifacts/completed-gate-1-checklist-update-evidence.md, distinct completed Gate 1 release-note/checklist update evidence targets, and internally non-contradictory Gate 1 publication-update evidence. |
| Gate 2 | Technical addendum architecture manual | Pending evidence | Publication blocker for controlled testnet architecture claims | Link completed [Testnet Production-Candidate Architecture Manual Template](testnet-production-candidate-architecture-manual-template.md) evidence validated with `npm run addendum:validate`, covering completed technical addendum evidence, technical addendum validation target, structured Manual Classification with non-empty manual name, 7-40 character Git commit matching final clean-checkout Git commit, Release level production deployment candidate, Environment testnet, controlled testnet or production-grade testnet claim wording, structured Claim Boundary fields proving blocked non-testnet claim categories, `Testnet production-candidate wording allowed = yes-after-release-gate-pass`, `Production-grade testnet wording allowed = yes-after-release-gate-pass`, `Release gate required before public claim = yes`, and `Evidence completeness required = yes`, non-empty Architecture owner, non-empty Reviewer, ISO Date, `release:gate`, `Manual use status = candidate claim support`, `Release gate status = pass`, concrete `release:gate PASS` output with Structural issues = 0 in the architecture decision evidence for testnet production-candidate wording, `Production-ready claim allowed = no`, `Mainnet deployment claim allowed = no`, `Testnet production-candidate claim allowed = yes-after-release-gate-pass`, architecture manual evidence, structured gate-map rows with gate-specific evidence, completed artifact evidence, bounded claim boundaries, distinct completed evidence targets across linked or passed gate-map and architecture-decision rows, architecture-decision rows with decision-specific positions and completed evidence, actionable reviewer notes that keep claim, signer, and broadcast boundaries, internally non-contradictory technical addendum reviewer notes, Architecture owner sign-off matching Manual Classification Architecture owner, Security reviewer sign-off matching Manual Classification Reviewer, reviewer sign-off dates not before Manual Classification Date, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, architecture manual evidence, production-ready claim handling, testnet production-candidate claim handling, signer path, ergo-lib-wasm-nodejs, sigma-rust, node-wallet is not the production path, BRIDGE_BROADCAST_ENABLED=true, no transaction broadcast, completed Phase 007 release-note update evidence, completed Phase 007 checklist update evidence, distinct completed Phase 007 release-note/checklist update evidence targets, and internally non-contradictory Phase 007 publication-update evidence. |
| Gate 3 | Fresh local devnet lifecycle run | Pending evidence | Publication blocker for public release | Attach a completed [Live Rehearsal Evidence Template](live-rehearsal-template.md) validated with a distinct `rehearsal:validate` transcript artifact containing `npm run rehearsal:validate` PASS output and a `validated target` binding, covering peg-in, peg-out, anchor, settlement check, submit, confirmation, reconciliation, Session Metadata Environment local devnet, ContextExtension guard result identifies ContextExtension guard, sigma-rust/JVM conformance coverage, fail-closed behavior, clean deployment state evidence, deployment-state hash or digest, contract IDs, singleton inventory, concrete 32-byte deployment-state hash or digest, concrete 32-byte contract ID, concrete 32-byte singleton inventory identifier, Current Ergo height starts with non-negative integer, Current Ergo height includes completed node/RPC height artifact marker or non-template evidence link, Current sidechain height starts with non-negative integer, Current sidechain height includes completed node/RPC height artifact marker or non-template evidence link, reviewer sign-off matches session metadata, reviewer sign-off date is not before session metadata Date, Broadcast mode at start disabled, Broadcast mode at end disabled, Broadcast disabled in all shells, broadcast reviewer approval names Session Metadata Reviewer, explicit live broadcast approval, user explicit live broadcast approval, broadcast reviewer approval cites Expected transaction ID, `BRIDGE_BROADCAST_ENABLED=true` scoped-shell evidence, scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true, intended shell scope is limited, readiness command output evidence, broadcast policy output evidence, Broadcast policy output, live settlement readiness output evidence, Live settlement signing output, `npm run demo:readiness` output evidence, broadcast network reconfirmation cites Node URL, broadcast network reconfirmation names Session Metadata Ergo node network, broadcast network reconfirmation names Session Metadata Sidechain network, peg-in evidence cites peg-in event ID or TX ID, peg-out burn evidence cites peg-out burn TX ID, anchor evidence cites sidechain block hash, anchor evidence cites bridge event root, anchor evidence cites Ergo anchor height, `/transactions/check` PASS output evidence, settlement check evidence cites Expected transaction ID, positive miner feeNanoErg amount, settlement submit evidence cites submitted transaction ID, confirmation evidence cites submitted transaction ID, reconciliation evidence cites submitted successor and burn values, submitted DUP successor box ID, submitted SPV tracker successor box ID, recipient payout box ID, reconciliation evidence cites peg-out burn TX ID, production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`, completed Gate 3 rehearsal release-note update evidence, completed Gate 3 checklist update evidence, and distinct completed Gate 3 rehearsal release-note/checklist update evidence targets. |
| Gate 3 | Fresh Ergo testnet lifecycle run | Pending evidence | Publication blocker for public release | Attach a completed [Live Rehearsal Evidence Template](live-rehearsal-template.md) validated with a distinct `rehearsal:validate` transcript artifact containing `npm run rehearsal:validate` PASS output and a `validated target` binding for testnet with Session Metadata Environment testnet and Rehearsal Assembly Evidence proving structured assembly report JSON target binding, `Assembly status: post-submit evidence included`, completed Draft source target, completed External-fee live-preflight source target, completed Post-submit source target, recovery source targets when recovery rows pass, `External-fee live-preflight artifact` completed PASS output, matching External-fee live-preflight Expected transaction ID, `Post-submit fragment: included`, Post-submit observe JSON report completed structured evidence, and Post-submit External-fee live-preflight JSON binding status GO with runtimeBroadcastEnabled false and pre-submit boundary preserved, Fresh checkpoint source target, Fresh checkpoint sourceBindings prove height evidence source provenance with live read-only `/info` plus `getBlockNumber` and concrete read-only `ergoNodeUrl`/`sidechainRpcUrl` endpoint bindings, or a concrete provided-json target; singleton source provenance with concrete read-only `ergoNodeUrl` binding for live mode or concrete provided-json target when used; and anchor `live-read-only-node` provenance with concrete read-only `ergoNodeUrl` binding, Fresh checkpoint lifecycle status remains publication blocker, Fresh checkpoint Expected transaction ID matches dry-run, Fresh checkpoint deployed-state hash matches clean deployment state, Fresh checkpoint singleton freshness fresh ageSeconds and maxAgeSeconds 900, Fresh checkpoint live anchor observations prove /info-bound observedAt/nodeHeight freshness and 0x0401 bridgeEventRootHex at each Ergo anchor height, Fresh checkpoint boundary does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support release claim escalation, Session Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording, including no `not on testnet`, `not on the testnet`, `not using testnet`, `not connected to testnet`, `no testnet`, `without testnet`, or `without the testnet`, Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network, Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording, ContextExtension guard result identifies ContextExtension guard, sigma-rust/JVM conformance coverage, fail-closed behavior, Fresh testnet lifecycle artifact cites peg-in event ID or TX ID, Fresh testnet lifecycle artifact cites peg-out burn TX ID, Fresh testnet lifecycle artifact cites sidechain block hash, Fresh testnet lifecycle artifact cites bridge event root, Fresh testnet lifecycle artifact cites Expected transaction ID, Fresh testnet lifecycle artifact cites submitted transaction ID, Fresh testnet lifecycle artifact cites singleton checkpoint observedAt ISO UTC, Fresh testnet lifecycle artifact cites singleton checkpoint maxAgeSeconds 900, Fresh testnet lifecycle artifact cites singleton checkpoint ageSeconds, Fresh testnet lifecycle artifact cites singleton checkpoint freshness fresh, Fresh testnet lifecycle evidence artifact citing `Ergo node network testnet`, positively identifying testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording, including no `not on testnet`, `not on the testnet`, `not using testnet`, `not connected to testnet`, `no testnet`, `without testnet`, or `without the testnet`, clean deployment state evidence, deployment-state hash or digest, contract IDs, singleton inventory, concrete 32-byte deployment-state hash or digest, concrete 32-byte contract ID, concrete 32-byte singleton inventory identifier, Current Ergo height starts with non-negative integer, Current Ergo height includes completed node/RPC height artifact marker or non-template evidence link, Current sidechain height starts with non-negative integer, Current sidechain height includes completed node/RPC height artifact marker or non-template evidence link, reviewer sign-off matches session metadata, reviewer sign-off date is not before session metadata Date, Broadcast mode at start disabled, Broadcast mode at end disabled, Broadcast disabled in all shells, broadcast reviewer approval names Session Metadata Reviewer, explicit live broadcast approval, user explicit live broadcast approval, broadcast reviewer approval cites Expected transaction ID, `BRIDGE_BROADCAST_ENABLED=true` scoped-shell evidence, scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true, intended shell scope is limited, readiness command output evidence, broadcast policy output evidence, Broadcast policy output, live settlement readiness output evidence, Live settlement signing output, `npm run demo:readiness` output evidence, broadcast network reconfirmation cites Node URL, broadcast network reconfirmation names Session Metadata Ergo node network, broadcast network reconfirmation names Session Metadata Sidechain network, peg-in evidence cites peg-in event ID or TX ID, peg-out burn evidence cites peg-out burn TX ID, anchor evidence cites sidechain block hash, anchor evidence cites bridge event root, anchor evidence cites Ergo anchor height, within the activated replacement profile, `/transactions/check` PASS output evidence, settlement check evidence cites Expected transaction ID, `rehearsal:external-fee-live-preflight producer`, distinct rehearsal:external-fee-live-preflight transcript/report, rehearsal:external-fee-live-preflight PASS output, external-fee live-preflight JSON report completed structured evidence, external-fee live-preflight input target, external-fee live-preflight approvals file target, external-fee live-preflight target binding names the completed live rehearsal target, `Settlement profile ID = authenticated-external-fee-v1`, `Profile activation status = ACTIVATED`, `Evidence purpose = gate3-lifecycle-closure`, `Legacy V1 transport = quarantined`, `Activation evidence target`, external-fee live-preflight JSON proves `runtimeBroadcastEnabled: false`, same Expected transaction ID, reviewer approval evidence, user explicit live broadcast approval evidence, scoped shell evidence, scoped BRIDGE_BROADCAST_ENABLED=true evidence, post-enable demo:readiness PASS evidence, Broadcast policy PASS evidence, Live settlement signing PASS evidence, broadcast network reconfirmation evidence, Node URL, Ergo node network testnet, Sidechain network non-mainnet, positive miner feeNanoErg amount funded externally, settlement submit evidence cites submitted transaction ID, confirmation evidence cites submitted transaction ID, required confirmation count, confirmation policy met, confirmation policy met cites confirmationsRequired, confirmation policy met cites confirmationsObserved, confirmation policy met cites submitted transaction ID, observed confirmation count greater than or equal to required confirmation count, confirmation policy met links completed finality evidence, `npm run rehearsal:post-submit:observe`, distinct rehearsal:post-submit:observe transcript/report, rehearsal:post-submit:observe PASS output, rehearsal:post-submit:observe --json-out structured report, post-submit observe JSON report completed structured evidence, post-submit live-preflight binding proves external-fee profile and runtimeBroadcastEnabled false, same submitted/Expected transaction ID, approved burn hashes match post-submit burnOrder and live-preflight approvalBinding.burnTxHashes for the external-fee profile, SPV tracker successor output OUTPUTS(0), Aggregate DUP successor output OUTPUTS(1), positional recipient payout binding, canonical miner fee output funded externally, reconciliation evidence cites submitted successor and burn values, submitted DUP successor box ID, submitted SPV tracker successor box ID, recipient payout box ID, reconciliation evidence cites peg-out burn TX ID, production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`, completed Gate 3 rehearsal release-note update evidence, completed Gate 3 checklist update evidence, and distinct completed Gate 3 rehearsal release-note/checklist update evidence targets. |
| Gate 3 | Failed broadcast / phantom AVL recovery drill | Pending evidence | Publication blocker for public release | Link a completed [Live Rehearsal Evidence Template](live-rehearsal-template.md) validated with `npm run rehearsal:validate` and a structured `npm run rehearsal:recovery-observe -- --kind failed-broadcast-phantom-avl --state-db <operator-read-only-state-db> --json-out <failed-broadcast-observe.json>` report proving failed broadcast does not insert phantom DUP or AVL history, failed-broadcast evidence cites Expected transaction ID, failed-broadcast evidence cites peg-out burn TX ID, failed-broadcast evidence includes aggregate settlement attempt bound to Expected transaction ID, failed-broadcast evidence proves aggregate attempt status/submittedTxId consistency where submitted attempts include submittedTxId matching Expected transaction ID and pending or abandoned attempts leave submittedTxId null, failed-broadcast evidence includes peg-out state bound to peg-out burn TX ID, structured recovery observation PASS evidence, completed observation artifact, sourceBindings, live-read-only-node source, read-only state-tracker source, `sourceBindings.state.targetClass = operator-provided-state-db`, no default state database fallback, runtime path not serialized, recovery-observe validation target bound to the completed observation artifact, `npm run rehearsal:recovery-observe:validate`, internally positive `recovery-observe JSON validation PASS`, `observationBoundary` with read-only node/state observation and signing/broadcast/submit/repair/state mutation/reconciliation/Gate 3 closure/claim escalation all false, with reviewer sign-off matches session metadata, reviewer sign-off date is not before session metadata Date, Broadcast mode at start disabled, Broadcast mode at end disabled, Broadcast disabled in all shells, production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`, completed Gate 3 rehearsal release-note update evidence, completed Gate 3 checklist update evidence, and distinct completed Gate 3 rehearsal release-note/checklist update evidence targets. |
| Gate 3 | Reorged burn and stale singleton recovery drill | Pending evidence | Publication blocker for public release | Link a completed [Live Rehearsal Evidence Template](live-rehearsal-template.md) validated with `npm run rehearsal:validate` or test artifact and a structured `npm run rehearsal:recovery-observe -- --kind reorged-burn-stale-singleton --state-db <operator-read-only-state-db> --json-out <reorg-stale-singleton-observe.json>` report proving reorged burns and stale singleton boxes are detected and recoverable, reorged-burn evidence cites peg-out burn TX ID, stale-singleton evidence cites singleton inventory identifier, structured recovery observation PASS evidence, completed observation artifact, sourceBindings, live-read-only-node source, read-only state-tracker source, `sourceBindings.state.targetClass = operator-provided-state-db`, no default state database fallback, runtime path not serialized, recovery-observe validation target bound to the completed observation artifact, `npm run rehearsal:recovery-observe:validate`, internally positive `recovery-observe JSON validation PASS`, `observationBoundary` with read-only node/state observation and signing/broadcast/submit/repair/state mutation/reconciliation/Gate 3 closure/claim escalation all false, with reviewer sign-off matches session metadata, reviewer sign-off date is not before session metadata Date, Broadcast mode at start disabled, Broadcast mode at end disabled, Broadcast disabled in all shells, production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`, completed Gate 3 rehearsal release-note update evidence, completed Gate 3 checklist update evidence, and distinct completed Gate 3 rehearsal release-note/checklist update evidence targets. |
| Gate 3 | Backup-restore or reconstructibility drill | Checked | Publication blocker for release claims | Link completed [Backup Restore Evidence Template-derived evidence](../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md) as completed backup-restore evidence; `npm run backup:validate` command output artifact://recovery/artifacts/backup-validate-2026-05-31-99e98fff.md PASS exit code 0 backup-restore validation target [completed backup-restore evidence](../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md); `release:gate` backup-restore consumption artifact://recovery/artifacts/release-gate-backup-restore-2026-05-31-99e98fff.md; covering SQLite restore, structured Drill Classification with 7-40 character Git commit 99e98fff, `Release level = institutional reference`, `Environment = local offline`, `Broadcast mode = disabled`, source-state scope, isolated restore target, reviewer identity A. Shannon, ISO Date 2026-05-31, command-specific evidence targets, targetless command-output notes cannot close backup-restore evidence, local SQLite snapshots from `npm run backup:snapshot` artifact://recovery/artifacts/pre-backup-snapshot-2026-05-31-99e98fff.json and artifact://recovery/artifacts/restored-snapshot-2026-05-31-99e98fff.json, local snapshot comparison from `npm run backup:compare` artifact://recovery/artifacts/backup-compare-2026-05-31-99e98fff.json, distinct pre-backup and restored JSON artifacts, restored snapshot generated after pre-backup snapshot, backup:snapshot schema metadata including `schemaVersion` and comparison `snapshotSchemaVersions`, measured snapshot value formats, snapshot evidenceRows match measured values, state-specific consistency evidence, state evidence cites measured pre-backup/restored values, distinct completed evidence targets across linked command, state, boundary, stop-condition, and publication-update rows, restore target isolation or reviewer approval, reviewer approval evidence, completed reviewer approval evidence, live or runtime restore target review evidence is fail-closed out of scope for this local offline drill, rollback plan evidence, DUP AVL rebuild, SPV tracker rebuild, anchor preservation, DUP singleton digest comparison or incident classification, SPV tracker singleton digest comparison or incident classification, concrete DUP singleton ID or digest, concrete SPV tracker singleton ID or digest, boundary-specific reconstructibility evidence, boundary-specific reconstructibility checks, stop-condition classifications, condition-specific stop-condition evidence, reviewer sign-off, internally non-contradictory reviewer notes, restore operator sign-off matches drill classification, restore operator sign-off date is not before drill classification Date, production-ready claim handling with exact `Production-ready claim allowed by this drill: no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`, completed Gate 3 backup-restore release-note update evidence artifact://recovery/artifacts/completed-gate-3-backup-restore-release-note-evidence.md, completed Gate 3 backup-restore checklist update evidence artifact://recovery/artifacts/completed-gate-3-backup-restore-checklist-update-evidence.md, distinct completed Gate 3 backup-restore release-note/checklist update evidence targets, each preserving exact `Production-ready claim allowed by this drill: no` and `Testnet production-candidate claim allowed by this drill: no`, backup-restore git hygiene evidence artifact://recovery/artifacts/git-hygiene-scan.md, git hygiene, `git status --short`, `git diff --check`, and no staged runtime artifacts. |
| Gate 4 | Independent security review report | Pending evidence | Publication blocker for public release | Link a completed [Independent Security Review Evidence Template](independent-security-review-evidence-template.md) validated with `npm run security:validate`, covering completed independent security review evidence, security review validation target, required scope coverage, required evidence package, item-specific evidence-package artifact links, finding disposition, required negative review checks, question-specific negative-check evidence, distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows, contracts, relayer signing, AVL proof generation, sidechain finality, operator recovery, dependency risk, external reviewer organization type, specific external security reviewer organization or affiliation, ISO review period, final security decision handling with exact `Final decision = approve`, critical/high finding closure with exact `Critical/high findings open = 0`, publication blocker closure with exact `Publication blockers = 0`, `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, security review Reviewed commit matching final clean-checkout Git commit, production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`, production deployment candidate support requires exact `Environment` value `testnet`, accepted-risk checklist updates, accepted-risk release-note updates, completed Gate 4 accepted-risk checklist update evidence, completed Gate 4 accepted-risk release-note update evidence, distinct completed Gate 4 accepted-risk checklist/release-note update evidence targets, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, production-ready claim handling with exact `Production-ready claim allowed = no`, critical/high findings with exact `Critical/high findings open = 0`, accepted risks, accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`, area-specific risk-focus notes, lead reviewer binding, reviewer notes that keep finding and accepted-risk boundaries, internally non-contradictory security reviewer notes, internally non-contradictory security publication-update evidence, lead reviewer sign-off matches classification, and lead reviewer sign-off date is not before review classification Date. |
| Gate 4 | Signer dependency conformance or fail-closed release decision | Checked | Publication blocker for production-ready claims | Link completed [Dependency Review Evidence Template-derived evidence](../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md) as completed dependency review evidence; `npm run dependency:validate` command output artifact://dependency/artifacts/dependency-validate.md PASS exit code 0 dependency review validation target [completed dependency review evidence](../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md); `release:gate` dependency review consumption artifact://dependency/artifacts/release-gate-dependency-review.md; covering [Dependency Risk Register](dependency-risk-register.md), `ergo-lib-wasm-nodejs`, sigma-rust ContextExtension serializer, upstream signer release validation with concrete upstream release identifier and JVM/node conformance evidence or explicit fail-closed guard/blocker rationale, explicit fail-closed guard/blocker release-action evidence, completed ContextExtension guard evidence, positive JVM golden vectors, live /transactions/check evidence, production-ready claims blocked until upstream signer release is validated, testnet production-candidate claims blocked until upstream signer release is validated, dependency review Git commit 2ba7c3fb, production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`, production deployment candidate support requires exact `Environment` value `testnet`, `Release supported = institutional reference`, `Production-ready claim allowed = no`, `Testnet production-candidate claim allowed = no`, `Critical/high vulnerabilities open = 0`, `Upstream signer blocker resolved = no`, `Release notes updated = yes`, reviewer decision summary, release support with exact `Release supported = institutional reference`, upstream signer blocker handling with exact `Upstream signer blocker resolved = no`, production-ready claim handling with exact `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = no`, critical/high vulnerabilities, critical/high vulnerability closure, vulnerability triage, internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence, no positive critical/high finding counts, dependency reviewer notes that keep signer and vulnerability boundaries, internally non-contradictory dependency reviewer notes, dependency reviewer sign-off matches classification, dependency reviewer sign-off date is not before review classification Date, completed dependency-review release-note update evidence artifact://dependency/artifacts/completed-dependency-review-release-note-evidence.md, completed dependency review checklist update evidence artifact://dependency/artifacts/completed-dependency-review-checklist-update-evidence.md, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, distinct completed dependency-review release-note/checklist update evidence targets, and internally non-contradictory dependency publication-update evidence. |
| Gate 5 | Trustless burn verification path | Open blocker | Publication blocker for production-ready claims | Link completed [Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md) evidence validated with `npm run trustless:validate`, covering completed trustless burn evidence, trustless burn validation target, sidechain commitment, SPV relay, burn inclusion proof, DUP binding, Local Proof Vector evidence validated by `trustless-burn-proof.ts`, linked completed `Proof-vector validation report` JSON target consumed by `npm run trustless:validate`, Proof-vector validation report target is not reused as completed row or publication-update evidence, non-empty structured inclusion proof nodes, structured fail-closed local negative cases in the checked proof vector, local proof-core negative rows citing matching `negativeCase` names and observed proof-core rejection strings, positive proof acceptance evidence, instance-specific positive proof evidence, positive proof instance values match commitment and burn binding rows, `bridgeEventRoot`, broadcast mode disabled or dry-run, trustless burn Git commit matching final clean-checkout Git commit, concrete 32-byte commitment and burn identifiers, numeric heights and indices, positive amountNanoErg burn amount, component-specific trustless properties, distinct completed evidence targets across linked component/commitment/burn-proof/positive/negative rows, completed row evidence that is not a `trustless burn validation target` / `validated target` binding, internally non-contradictory component, commitment, burn-proof, positive-proof, negative-test, publication-update, and reviewer row payloads, negative tests, instance-specific negative proof evidence, concrete 32-byte rejected proof or burn identifiers, unfinalized sidechain block rejection, independent review, reviewer notes that keep claim/protocol boundaries and do not approve trusted fallback wording, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, trustless burn implementation handling with exact `Trustless burn verification implemented = yes`, `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`, critical/high finding closure with exact `Critical/high findings open = 0`, protocol reviewer sign-off matches evidence classification, protocol reviewer sign-off date is not before evidence classification Date, production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`, mandatory transitional-path publication-update binding, publication-update fields must include exact `Trustless burn verification implemented = yes` when trustless burn verification is implemented, publication-update fields must include exact `Release supported = production deployment candidate` when Gate 5 `Release level = production deployment candidate`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet candidate claim is allowed, publication-update fields must include exact `Transitional trusted burn path disabled = yes` when Gate 5 `Transitional trusted burn path disabled = yes`, publication-update fields must include exact `Critical/high findings open = 0` when Gate 5 `Critical/high findings open = 0`, `Release notes updated = yes`, completed Gate 5 release-note update evidence, completed Gate 5 checklist update evidence, and distinct completed Gate 5 checklist/release-note update evidence targets; otherwise keep production claims blocked. The `npm run trustless:candidate` and `npm run trustless:candidate:validate` commands may support candidate identity evidence collection only; they do not replace completed `npm run trustless:validate` protocol evidence or V2 contract verification and cannot close this blocker by themselves. |
| Gate 6 | Committee governance and key-rotation drill | Open blocker | Publication blocker for production-ready claims | Link completed [Committee Governance Evidence Template](committee-governance-evidence-template.md) evidence validated with `npm run governance:validate`, completed committee governance evidence, governance validation target, for governance, key rotation, command-specific governance command evidence with internally positive command output, concrete public key/hash identifiers, disjoint old/new committee identifiers, committee threshold policy, distinct completed evidence targets across linked scope, command, rotation, positive, and negative rows, step-specific rotation evidence, step-specific rotation facts, positive new-committee operation evidence, bounded positive expected results, fail-closed negative expected results, threshold-specific positive signer identifiers, declared new-committee positive signer identifiers, negative signer identifiers, actionable stop conditions, member-loss, incident drills, structured Drill Classification with 7-40 character Git commit matching final clean-checkout Git commit, `Release level = production deployment candidate`, `Environment = testnet`, broadcast mode disabled or dry-run, governance model identifying committee or multisig governance, threshold at least 2, member count at least 3, threshold lower than member count, non-empty reviewer, ISO Date, enabled broadcast mode blocked for Gate 6, production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`, production deployment candidate support requires exact `Environment` value `testnet`, `Production-ready claim allowed = no`, `Testnet production-candidate claim allowed = yes`, `Governance-ready claim allowed = yes`, publication-update fields must include exact `Governance-ready claim allowed = yes` when the governance-ready claim is allowed, publication-update fields and external review evidence must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, publication-update fields and external review evidence must include exact `Open governance blockers = 0` when Gate 6 `Open governance blockers = 0`, `Open governance blockers = 0`, `Release notes updated = yes`, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, governance-ready claim handling with exact `Governance-ready claim allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, open governance blocker handling with exact `Open governance blockers = 0`, single-signer governance not approved in reviewer summary, actionable reviewer notes that keep governance boundaries and do not approve open blockers or single-signer fallback, internally non-contradictory governance reviewer notes, governance owner sign-off matches drill classification, governance owner sign-off date is not before drill classification Date, completed Gate 6 governance release-note update evidence, completed Gate 6 governance checklist update evidence, distinct completed Gate 6 governance release-note/checklist update evidence targets, internally non-contradictory governance publication-update evidence, completed Gate 6 governance external review evidence, external review evidence must include exact `Governance-ready claim allowed = yes` binding, external review evidence must include exact `Release supported = production deployment candidate` binding, external review evidence must include exact `Testnet production-candidate claim allowed = yes` binding, external review evidence must include exact `Open governance blockers = 0` binding, and distinct completed Gate 6 governance external review evidence target from release-note/checklist update evidence targets. |
| Gate 6 | Operator readiness evidence | Checked | Publication blocker for institutional release claims | Link completed [Operator Readiness Evidence Template-derived evidence](../evidence/operators/completed-operator-readiness-2026-06-04-9e3921cb.md) as completed operator readiness evidence; `npm run operator:validate` command output artifact://operators/artifacts/operator-validate-2026-06-04-9e3921cb.md PASS exit code 0 operator readiness validation target [completed operator readiness evidence](../evidence/operators/completed-operator-readiness-2026-06-04-9e3921cb.md); `release:gate -- --operator-readiness-evidence` consumption artifact://operators/artifacts/release-gate-operator-readiness-2026-06-04-9e3921cb.md; covering completed operator readiness evidence, operator readiness validation target, linked runbook coverage, runbook evidence cells state stop-condition and verification-command checks, bounded command-purpose text, command-specific operator command evidence with internally positive command output, recovery drills, operational decisions, decision-specific operational evidence, actionable stop conditions, distinct completed evidence targets across linked runbook, command, drill, and decision rows, completed row evidence that is not an `operator readiness validation target` / `validated target` binding, structured Readiness Classification with 7-40 character Git commit 9e3921cb matching final clean-checkout Git commit, `Release level = production deployment candidate`, `Environment = testnet`, broadcast mode disabled or dry-run, `Operator type = external operator or exchange operations reviewer`, non-empty reviewer A. Shannon, ISO Date 2026-06-04, enabled broadcast mode blocked for Gate 6 operator readiness evidence, `Release supported = production deployment candidate`, production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`, production deployment candidate support requires exact `Environment` value `testnet`, `Production-ready claim allowed = no`, `Testnet production-candidate claim allowed = yes`, `Operator-ready claim allowed = yes`, `Critical incidents open = 0`, `Release notes updated = yes`, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, operator-ready claim handling with exact `Operator-ready claim allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, critical incident closure with exact `Critical incidents open = 0`, critical incidents, actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement, internally non-contradictory operator reviewer notes, runbook operator sign-off matches readiness classification, runbook operator sign-off date is not before readiness classification Date, completed operator-readiness release-note update evidence artifact://operators/artifacts/completed-operator-readiness-release-note-update-evidence-2026-06-04-9e3921cb.md, completed operator-readiness checklist update evidence artifact://operators/artifacts/completed-operator-readiness-checklist-update-evidence-2026-06-04-9e3921cb.md, distinct completed operator-readiness release-note/checklist update evidence targets, and internally non-contradictory operator-readiness publication-update evidence. |
| Gate 7 | Single, batch, and sharded benchmark evidence | Pending evidence | Publication blocker for scaling claims | Link completed [Performance Benchmark Evidence Template](performance-benchmark-evidence-template.md) evidence validated with `npm run benchmark:validate`, completed benchmark evidence, benchmark validation target, command-specific benchmark command output evidence, single settlement, batch settlement, sharded lanes, positive numeric benchmark measurements, positive cost-relevant counts, exactly one positive cost count per key, scenario-specific metric evidence, scenario-specific single/batch/sharded metric evidence, distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows, live batch evidence, user explicit live broadcast approval evidence, Expected transaction ID binding, scoped BRIDGE_BROADCAST_ENABLED=true evidence, post-enable demo:readiness PASS evidence, Broadcast policy PASS evidence, Live settlement signing PASS evidence, broadcast network reconfirmation evidence, concrete 32-byte live batch transaction identifier, submitted live-batch transaction ID matching Expected transaction ID, sharded-lane evidence, statement-specific sharded-lane evidence, structured Benchmark Classification with 7-40 character Git commit matching final clean-checkout Git commit, Benchmark Classification Environment testnet, Trust path trustless burn proof path, benchmark environment metadata, non-empty reviewer, ISO Date, structured benchmark claims boundary arrays with all required allowed and blocked claims, sample counts bound by metric evidence, cost-relevant counts bound by metric evidence, concrete bottleneck scaling limits, bottleneck-specific completed evidence with impact and next action, production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`, production deployment candidate support requires exact `Environment` value `testnet`, linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence, production-ready benchmark claims are always blocked for mainnet, production throughput claims remain blocked for Gate 7 evidence, full parallel L1 settlement not approved while SPVTracker remains shared, `Scaling claims allowed = yes`, `Production-ready claim allowed = no`, `Testnet production-candidate claim allowed = yes`, `Production throughput claim allowed = no`, `Mainnet-grade evidence linked = no`, `Open benchmark blockers = 0`, publication-update fields must include exact `Release supported = production deployment candidate` when the release-support field is exact `Release supported = production deployment candidate`, publication-update fields must include exact `Scaling claims allowed = yes` when scaling claims are allowed, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet-candidate field is exact `Testnet production-candidate claim allowed = yes`, publication-update fields must include exact `Production throughput claim allowed = no` when production throughput claims are blocked, publication-update fields must include exact `Mainnet-grade evidence linked = no` when Gate 7 `Mainnet-grade evidence linked = no`, publication-update fields must include exact `Open benchmark blockers = 0` when Gate 7 `Open benchmark blockers = 0`, `Release notes updated = yes`, reviewer decision summary, release support with exact `Release supported = production deployment candidate`, measured single/batch/sharded evidence, scaling-claim allowance with exact `Scaling claims allowed = yes`, exact `Mainnet-grade evidence linked = no`, production-ready claim handling with exact `Production-ready claim allowed = no`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, production throughput claim handling with exact `Production throughput claim allowed = no`, open benchmark blocker handling with exact `Open benchmark blockers = 0`, actionable benchmark reviewer notes that keep the publication claim boundary and do not approve broader benchmark throughput or full parallel L1 settlement wording, internally non-contradictory benchmark reviewer notes, benchmark owner sign-off matches benchmark classification, benchmark owner sign-off date is not before benchmark classification Date, completed Gate 7 benchmark release-note update evidence, completed Gate 7 benchmark checklist update evidence, distinct completed Gate 7 benchmark release-note/checklist update evidence targets, and internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence. |
| Gate 8 | External integration package review | Checked | Publication blocker for public institutional-reference release | Link completed [External Integration Review Template-derived evidence](../evidence/integration/completed-external-integration-review-2026-06-04-9e3921cb.md) as completed external integration evidence; `npm run integration:validate` command output artifact://integration/artifacts/integration-validate-2026-06-04-9e3921cb.md PASS exit code 0 integration validation target [completed external integration evidence](../evidence/integration/completed-external-integration-review-2026-06-04-9e3921cb.md); `release:gate -- --integration-evidence` consumption artifact://integration/artifacts/release-gate-external-integration-2026-06-04-9e3921cb.md; covering completed external integration evidence, integration validation target, proving a fresh reviewer can follow required entry points, completed entry-point review evidence beyond document links, distinct completed evidence targets across linked entry-point, fresh-checkout, decision, and negative-review rows, integration decision record, bounded required answers, decision-specific evidence, negative review checks, expected correction text, per-command fresh checkout command output evidence, per-command fresh checkout exit code 0 output evidence, per-command fresh or clean checkout context evidence, per-command fresh checkout commit identity, external integration Git commit 9e3921cb matching final clean-checkout Git commit, internally non-contradictory linked entry-point, decision, negative-review, fresh-checkout, and publication-update evidence, docs without private maintainer context, reviewer organization, specific reviewer organization or affiliation Upwind Strategy integration review desk, `Private maintainer context used = no`, broadcast mode disabled or dry-run, enabled broadcast mode blocked for Gate 8, production deployment candidate classification requires Environment used = testnet, public institutional-reference release decision, `Public institutional-reference release allowed = yes`, public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, `Production-ready claim allowed = no`, Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews, blocked or allowed testnet production-candidate claim handling bound to that field with exact `Testnet production-candidate claim allowed = no` or exact `Testnet production-candidate claim allowed = yes`, reviewer decision summary, reviewer notes that do not approve production-ready or mainnet production wording, internally non-contradictory external integration reviewer notes, mainnet release-readiness claims remain forbidden or out of scope, only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence, integration reviewer sign-off matches review classification, integration reviewer sign-off date is not before review classification Date, completed Gate 8 integration release-note update evidence artifact://integration/artifacts/completed-gate-8-integration-release-note-update-evidence-2026-06-04-9e3921cb.md with exact `Private maintainer context used = no`, exact `Public institutional-reference release allowed = yes`, and exact `Production-ready claim allowed = no`, completed Gate 8 checklist update evidence artifact://integration/artifacts/completed-gate-8-integration-checklist-update-evidence-2026-06-04-9e3921cb.md with exact `Private maintainer context used = no`, exact `Public institutional-reference release allowed = yes`, and exact `Production-ready claim allowed = no`, and distinct completed Gate 8 integration release-note/checklist update evidence targets. |

## Remaining Blocker Execution Profile

Planning note outside the Pending Evidence Register. It records execution
dependencies only; blocker statuses and evidence requirements remain unchanged.

Current readiness routing packet is
`evidence/readiness/readiness-handoff-current-lanes-2026-07-09-cc9b0417.md`,
with validation report
`evidence/readiness/readiness-handoff-validation-current-lanes-2026-07-09-cc9b0417.md`
and JSON report
`evidence/readiness/readiness-handoff-current-lanes-2026-07-09-cc9b0417.json`.
A compact operator/reviewer request bundle derived from that validated handoff is
`evidence/readiness/readiness-operator-request-current-lanes-2026-07-09-cc9b0417.md`,
with JSON report
`evidence/readiness/readiness-operator-request-current-lanes-2026-07-09-cc9b0417.json`.
It is coordination output only and does not close evidence rows or authorize
claims, deployment, signing, key rotation, submit, or broadcast.
It carries 0 local evidence requests, 10 node-backed/live evidence requests,
59 reviewer/external requests, 4 lane packets, 69 lane-packet-covered requests,
and 19 concrete operator evidence inputs across Gate 4, Gate 5, Gate 6, and
Gate 7. Gate 4 now appears as a first-class Independent security review packet
with exact `--security-review-evidence` validator and release-gate bindings. The
current Gate 4 reviewer packet is
`evidence/security/gate4-independent-security-external-review-packet-2026-07-09-c6fea203.md`.
The
current local-closure status is `External Or Live Required` with 0 local-only
evidence issues and 0 manual-triage issues, so the next work package is concrete
non-mainnet/live evidence before reviewer/external or claim fields can close.
The Gate 5 packet points to the current trustless-burn prerequisite map and
operator packet at `2401733f`, the execution request at `4cb587fc`, and the
refreshed SPV-linked candidate, compact unsigned transaction, instance binding,
and instance refresh chain at `faf05c0b` as source-boundary inputs only. It
still calls out the required
anchor observation report from
`npm run trustless:anchor-observe`, SPV tracker observation report from
`npm run trustless:spv-tracker-observe`, and node-backed proof acceptance/DUP
evidence before Gate 5 can close. The current Gate 5 observation reconciliation
is `a21efc0b` and remains blocked until a matching non-mainnet `0x0401`
bridgeEventRoot anchor is produced and observed. The Gate 6 packet now
points to the current committee-governance prerequisite map at `57a50625`, and
the Gate 7 packet points to the current live benchmark prerequisite map at
`e91f591c` plus the capture manifest and execution request at `cc9b0417`.
The current Gate 5 execution request is
`evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md`
with JSON
`evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json`.
It reuses the `2401733f` prerequisite map and operator packet and narrows the
next work to one bounded non-mainnet trustless-burn instance, proof/candidate
refresh, public anchor/tracker/finality observations, reconciliation,
proof-acceptance/DUP binding, completed `trustless:validate`, and reviewer
sign-off evidence. It is planning output only and does not authorize signing,
transaction checks, submit, broadcast, Gate 5 closure, release-gate PASS, or
production-ready/mainnet/testnet-production-candidate claims.
The current Gate 5 instance binding is
`evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.md`
with JSON
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.json`.
It binds the recipient-tree SPV-linked candidate to one local offline
non-mainnet burn identity. The matching refresh packet is
`evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.md`
with JSON
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.json`,
and it is `TRUSTLESS_BURN_INSTANCE_REFRESH_READY` with 0 structural issues.
The packet keeps the remaining blockers explicit: extension anchoring,
sidechain finality, burn inclusion proof acceptance, DUP settlement binding,
independent review, and valid positive proof acceptance. It does not authorize
signing, transaction checks, submit, broadcast, Gate 5 closure, release-gate
PASS, or production-ready/mainnet/testnet-production-candidate claims.
The current prerequisite chain is:
`evidence/readiness/readiness-triage-current-lanes-2026-07-09-cc9b0417.md`,
`evidence/readiness/node-preflight-testnet-2026-07-06-233729a0.md`,
`evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-09-a21efc0b.md`,
and `evidence/readiness/runtime-prereqs-current-lanes-2026-07-09-cc9b0417.md`. The node
preflight is `PASS` on testnet, while the root-bound anchor preflight is
`FAIL` because no matching `0x0401` bridgeEventRoot was observed in the scanned
window. This is a routing packet only; it does not close any evidence row or
unlock claim, deployment, signing, key-rotation, submit, or broadcast
boundaries.

Gate 5 anchor observation export at commit `91c3904e` is
`evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-91c3904e.md`,
built from sanitized read-only observations in
`evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-08-91c3904e.json`
and the source preflight
`evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-91c3904e.md`.
It records node height 435368, testnet heights 434649..435368, 720 readable
heights, 0 extension read failures, and `BLOCKED` because no matching `0x0401`
bridgeEventRoot was observed for the expected root. This narrows the next Gate 5
operator action to producing and observing a matching non-mainnet anchor; it
does not close Gate 5 or authorize claims, deployment, signing, submit, or
broadcast.
Gate 5 local SPV tracker observation evidence against baseline `39bfec72` is
`evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.md`,
with JSON report
`evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.json`.
It records a local offline SPV tracker key/value proof for the Gate 5
commitment bindings and `LINKED` observer status without node/RPC requests,
deployment-state access, runtime database access, signing, submit, state
mutation, or broadcast. It does not replace the required non-mainnet tracker
observation, sidechain finality, proof-acceptance, DUP settlement, review, or
Gate 5 closure evidence.
Gate 5 command-specific observation reconciliation for the current anchor/SPV
observation artifacts is
`evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-91c3904e.md`,
with JSON report
`evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-08-91c3904e.json`.
It reuses the anchor and SPV tracker observation JSON reports above through
`npm run trustless:observation-reconcile` and remains `BLOCKED` because the
anchor report is not `LINKED`; a passing packet must provide linked anchor and
SPV tracker reports whose bridge event root and Ergo anchor height are present
and equal across anchor, expected SPV entry, and decoded SPV value. This is a
read-only prerequisite report only and does not close Gate 5 or authorize
claims, signing, submit, state mutation, or broadcast.

Gate 2 technical addendum architecture manual:
Requires completed addendum evidence after a concrete `release:gate PASS`
transcript. This is a final packaging step after the other publication blockers
are closed.

Gate 3 fresh local devnet lifecycle run:
Requires completed local-devnet rehearsal evidence with submit, confirmation,
reconciliation, and `rehearsal:validate` PASS. The execution dependency is a
runnable local Ergo node, sidechain RPC, deployment-state evidence, and explicit
broadcast approval for the scoped shell. The local prerequisite diagnostic can
be captured with
`npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --json-out <report.json>`
before any secret-env inspection, deployment-state inspection, runtime SQLite
inspection, backup-directory inspection, or live execution approval. Remove
`--skip-runtime-state-checks` only for a local operator run where inspecting
deployment-state files, SQLite state, and backup directories is explicitly in
scope. Validate safe prerequisite JSON with
`npm run demo:patched-devnet:go-no-go:validate -- <report.json>`; validation
PASS proves only the diagnostic report boundary and current missing
prerequisites, not Gate 3 closure, live execution approval, broadcast
authorization, or release-claim support.
Current explicit CLI configured safe prerequisite evidence is recorded in
[Patched Devnet Explicit CLI Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-explicit-prereq-2026-07-04-0f497e4e.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-explicit-prereq-2026-07-04-0f497e4e.json`;
the result is `LOCAL_PREREQS_OK`: explicit configured source and Frontier
binary bindings pass, while execution remains blocked until local nodes, scoped
environment values, funding, signer alignment, runtime-state inspection, and
explicit approval are handled.
The default no-configuration safe prerequisite diagnostic at commit `40182e0f`
is
[Patched Devnet Current-HEAD Safe Prerequisite Diagnostic 40182e0f](../evidence/rehearsal/patched-devnet-go-no-go-safe-prereq-2026-07-06-40182e0f.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-06-40182e0f.json`;
the result is `NO-GO` because `../ergo-source` and the configured
`frontier-template-node.exe` are missing. It records local prerequisites only
and does not close Gate 3, authorize live execution, authorize broadcast, or
support release-claim escalation.
The source-only configured safe prerequisite diagnostic at commit `53fbe6db` is
[Patched Devnet Source-Configured Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.json`;
the configured Ergo source passes and the result remains `NO-GO` only because
`frontier-template-node.exe` is missing at the configured default location. It
records local prerequisites only and does not close Gate 3, authorize live
execution, authorize broadcast, or support release-claim escalation.
The prior source-and-Frontier-configured prerequisite diagnostic at commit
`9223954d` is
[Patched Devnet Current-HEAD Frontier-Configured Prerequisite Diagnostic 9223954d](../evidence/rehearsal/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-07-9223954d.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-07-9223954d.json`;
the result is `LOCAL_PREREQS_OK`: the configured Ergo source and configured
Frontier binary pass, the binary reports
`frontier-template-node.exe 0.0.0-75329a2df49`, and execution remains blocked
until the local Frontier sidechain, patched Ergo devnet, scoped environment
values, funding, signer alignment, runtime-state inspection, and explicit
approval are handled. It records local prerequisites only and does not close
Gate 3, authorize live execution, authorize broadcast, or support release-claim
escalation.
The current configured-source prerequisite diagnostic at commit `834e6a7d` is
[Patched Devnet Current-HEAD Configured-Source Prerequisite Diagnostic 834e6a7d](../evidence/rehearsal/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.json`;
the result is `NO-GO`: the configured local Ergo source location is present,
but the default `frontier-template-node.exe` path is still missing, endpoint
environment variables are unset, and both local nodes are offline. Secret
inspection remains disabled and runtime-state inspection remains skipped. It
records local prerequisites only and does not close Gate 3, authorize live
execution, authorize broadcast, or support release-claim escalation.
The prior loopback-bound prerequisite diagnostic at commit `36cb5380` is
[Patched Devnet Current-HEAD Loopback-Bound Prerequisite Diagnostic 36cb5380](../evidence/rehearsal/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.json`;
the result is `NO-GO`: the default `../ergo-source` path and default
`frontier-template-node.exe` path are missing in this local mirror, endpoint
environment variables are unset, and both local nodes are offline. Secret
inspection remains disabled and runtime-state inspection remains skipped. It
records local prerequisites only and does not close Gate 3, authorize live
execution, authorize broadcast, or support release-claim escalation.
The prior loopback-bound prerequisite diagnostic at commit `d2b538cb` is
[Patched Devnet Current-HEAD Loopback-Bound Prerequisite Diagnostic d2b538cb](../evidence/rehearsal/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json`;
it recorded `LOCAL_PREREQS_OK` when configured source, configured Frontier, a
temporary Frontier dev chain, and loopback endpoint bindings were present, but
it did not close Gate 3 or authorize live execution.
The prior Frontier-online prerequisite diagnostic at commit `e50ed468` is
[Patched Devnet Current-HEAD Frontier-Online Prerequisite Diagnostic e50ed468](../evidence/rehearsal/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.json`;
the result is `LOCAL_PREREQS_OK`: the configured Ergo source and Frontier binary
pass, the binary reports `frontier-template-node.exe 0.0.0-75329a2df49`, and
the local temporary Frontier dev chain responds on JSON-RPC. Execution remains
blocked until the patched Ergo devnet, scoped environment values, funding,
signer alignment, runtime-state inspection, and explicit approval are handled.
It records local prerequisites only and does not close Gate 3, authorize live
execution, authorize broadcast, or support release-claim escalation.
The prior source-and-Frontier-configured prerequisite diagnostic at commit
`1dea1a5a` is
[Patched Devnet Current-HEAD Frontier-Configured Prerequisite Diagnostic 1dea1a5a](../evidence/rehearsal/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.json`;
the result is `LOCAL_PREREQS_OK`: the configured Ergo source and configured
Frontier binary pass, the binary reports
`frontier-template-node.exe 0.0.0-75329a2df49`, and execution remains blocked
until the local Frontier sidechain, patched Ergo devnet, scoped environment
values, funding, signer alignment, runtime-state inspection, and explicit
approval are handled. It records local prerequisites only and does not close
Gate 3, authorize live execution, authorize broadcast, or support release-claim
escalation.
The prior source-and-Frontier-configured prerequisite diagnostic at commit
`9fc7c0ad` is
[Patched Devnet Frontier-Configured Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-05-9fc7c0ad.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-05-9fc7c0ad.json`;
the result is `LOCAL_PREREQS_OK`: the configured Ergo source and configured
Frontier binary pass, the binary reports
`frontier-template-node.exe 0.0.0-75329a2df49`, and execution remains blocked
until the local Frontier sidechain, patched Ergo devnet, scoped environment
values, funding, signer alignment, runtime-state inspection, and explicit
approval are handled. It records local prerequisites only and does not close
Gate 3, authorize live execution, authorize broadcast, or support release-claim
escalation.
The prior Frontier-online prerequisite diagnostic at commit `a3f61490` is
[Patched Devnet Frontier-Online Prerequisite Diagnostic](../evidence/rehearsal/patched-devnet-go-no-go-frontier-online-prereq-2026-07-05-a3f61490.md)
with validated JSON output at
`artifact://rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-05-a3f61490.json`;
the result is `LOCAL_PREREQS_OK`: the configured Ergo source and configured
Frontier binary pass, the local temporary Frontier dev chain responds on
JSON-RPC, and execution remains blocked until the patched Ergo devnet, scoped
environment values, funding, signer alignment, runtime-state inspection, and
explicit approval are handled. It records local prerequisites only and does not
close Gate 3, authorize live execution, authorize broadcast, or support
release-claim escalation.
The `start-substrate.bat` launcher now resolves the same default Frontier binary
path checked by the diagnostic and supports `FRONTIER_TEMPLATE_NODE_PATH` for a
local operator-supplied build; this narrows the remaining prerequisite to
starting a controlled local session with the configured binary, not repairing
launcher routing.

Gate 3 fresh Ergo testnet lifecycle run:
Requires completed testnet rehearsal assembly with prebroadcast, fresh
checkpoint, live-preflight, post-submit observe, recovery bindings, and
`rehearsal:validate` PASS. The execution dependency is testnet Ergo node access,
non-mainnet sidechain RPC, current height/singleton provenance, live submit
artifacts, explicit post-submit state DB and singleton NFT inputs, and explicit
broadcast approval. The post-submit observe command requires explicit
`--state-db <operator-read-only-state-db>`, `--spv-tracker-nft-id <64hex>`,
and `--aggregate-dup-nft-id <64hex>` inputs; omitted values fail closed before
any runtime database or deployed-state default lookup.

Gate 3 local/devnet and testnet rehearsal lifecycle:
Requires completed live rehearsal evidence with `rehearsal:validate` PASS and
the matching release-gate JSON bindings before a lifecycle row can move from
pending evidence. The current reproducible prerequisite generator is
`npm run rehearsal:prerequisite-map`; its current map at
`evidence/rehearsal/gate3-rehearsal-prerequisite-map-2026-07-09-1dd194a8.md`
keeps the live rehearsal template `BLOCKED` with 65 structural issues and
turns the remaining session, preflight, lifecycle, settlement, recovery,
publication, and reviewer fields into operator capture steps. The paired
operator packet
`evidence/rehearsal/gate3-rehearsal-operator-packet-2026-07-09-1dd194a8.md`
does not close Gate 3, approve live execution, authorize broadcast, or support
production-ready or testnet production-candidate claims.
The current capture manifest
`evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-09-f0187202.md`
turns that blocked operator packet into a concrete local-devnet and testnet
capture order. It links the current read-only patched-devnet go/no-go JSON and
validation from `3de8887a` as `LOCAL_PREREQS_OK` local-prerequisite evidence:
the configured local Ergo source location, patched-devnet launcher,
`start-substrate.bat`, configured Frontier binary, and required relayer scripts
are present, the Frontier binary reports
`frontier-template-node.exe 0.0.0-75329a2df49`, loopback node environment
bindings are set, the patched Ergo devnet was reachable on
`http://127.0.0.1:9051`, and Frontier was reachable on
`http://127.0.0.1:9945` during capture. Runtime-state inspection was explicitly
skipped, and funding plus signer alignment remain uncaptured. The prior
`b3aa0620` capture remains historical evidence that the configured Frontier
session was online before the patched Ergo devnet session was captured; it is
not the current go/no-go state. The
current
no-secret env/readiness preflight at
`evidence/rehearsal/patched-devnet-no-secret-env-readiness-current-2026-07-07-1713760d.md`
adds an operator-usable pre-start check: loopback node env vars and batch
settings pass without reading `WALLET_MNEMONIC`, node config secrets, runtime
databases, or deployment-state files; the configured source, launcher, sbt, and
Java runtime are present. The current patched-devnet command plan at
`evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-157fdcef.md`
prints the ordered local-devnet runbook without executing node probes, reading
secrets, signing, broadcasting, or claiming Gate 3 closure. The refreshed
local-devnet execution request at
`evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-09-f0187202.md`
binds that plan JSON plus the no-secret signer/funding defaults evidence
`evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-836876b4.md`
before asking for private operator capture. It keeps the next local step as a
private operator capture with runtime-state inspection in scope, a public
`demo:devnet:funding -- --address <relayer-address>` path when safe, explicit
local `--include-secret-material` use only in a scoped private shell, redacted
signer/funding outputs converted with
`npm run rehearsal:local-devnet-signer-funding-summary`, and then a completed
local-devnet rehearsal Markdown target validated with `rehearsal:validate`.
The execution request reads only
guarded evidence targets and does not inspect environment files, wallet
material, node config secrets, runtime databases, or deployment state. The
 testnet path remains aggregate
 prebroadcast JSON, completed prebroadcast Markdown, prebroadcast validation and
 doctor output, approvals v2, rehearsal preflight, testnet window prep, fresh
 checkpoint, offline gate, prep bundle, and then the not-yet-implemented
 external-fee live-preflight only after profile activation plus explicit
 reviewer and user live approval. The legacy V1 quarantine diagnostic is not
 that handoff. The manifest does not mark Gate 3
complete, approve live execution, authorize broadcast, or support
production-ready or testnet production-candidate claims.

Gate 3 failed-broadcast / phantom AVL recovery drill:
Requires completed recovery observation JSON plus `recovery-observe:validate`
PASS linked into rehearsal evidence. The execution dependency is read-only
node/state observation for the failed broadcast attempt and peg-out burn state.
Use the current Gate 3 recovery drill prerequisite map before running the
observe, validate, row-assembly, rehearsal assembly, and release-gate binding
steps. The observe command requires explicit
`--state-db <operator-read-only-state-db>` input and no longer has a default
runtime database fallback.

Gate 3 reorged burn and stale singleton recovery drill:
Requires completed recovery observation JSON plus `recovery-observe:validate`
PASS linked into rehearsal evidence. The execution dependency is read-only
node/state observation for reorged burn state and stale singleton inventory.
Use the current Gate 3 recovery drill prerequisite map before running the
observe, validate, row-assembly, rehearsal assembly, and release-gate binding
steps. The observe command requires explicit
`--state-db <operator-read-only-state-db>` input and no longer has a default
runtime database fallback.

Gate 4 independent security review report:
Requires completed independent security review at `production deployment
candidate` / `testnet` scope with `security:validate` PASS. The execution
dependency is a concrete external reviewer organization or affiliation,
candidate-scope evidence package, accepted-risk release-note artifact, and
accepted-risk checklist artifact. The current Gate 4 blocker map is
`evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md`,
with blocked validation transcript
`evidence/security/artifacts/security-validate-gate4-independent-security-review-blocker-map-blocked-2026-07-09-c6fea203.md`
and current external-review prerequisite map
`evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md`
plus reviewer packet
`evidence/security/gate4-independent-security-external-review-packet-2026-07-09-c6fea203.md`.
The current reviewer input manifest
`evidence/security/gate4-independent-security-review-input-manifest-2026-07-09-cc9b0417.md`
assembles the public review scope references, completed evidence baselines,
Gate 5/Gate 6/Gate 7 packet links, and live/external gaps still blocking
Gate 4. These packets do not mark Gate 4 complete.

Gate 5 trustless burn verification path:
Requires completed trustless burn evidence with `trustless:validate` PASS,
proof-vector report, SPV/finality proof path, independent review, and
publication updates. Local proof-core candidate artifacts do not close this row
by themselves. The current Gate 5 SPV-linked candidate is
`evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md`,
with blocked validation transcript
`evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-07-faf05c0b.md`
and current `2401733f` validator transcript
`evidence/trustless-burn/artifacts/trustless-validate-gate5-spv-linked-blocked-2026-07-07-2401733f.md`,
prerequisite map
`evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md`,
and operator packet
`evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md`;
it records local proof-vector, sidechain commitment-format, sidechain ID,
bridge event root, sidechain header hash, hash function, commitment prefix, Ergo
anchor height, sidechain height, local burn identity, finality-rule, payout-binding,
and duplicate-prevention bindings, local reorg-handling evidence, burn
commitment-tree, public-boundary, negative-case, and trusted-oracle fallback
rejection prerequisites, plus the exact sanitized extension-observation JSON
and `trustless:anchor-observe` report handoff for the anchoring path, which
currently remains blocked because no matching 0x0401 bridge event root was
observed in the scanned testnet window. It also records the exact sanitized SPV
tracker observation JSON and `trustless:spv-tracker-observe` report as linked
local prerequisite evidence for the tracker path. The `2401733f` operator
packet derives its proof-vector baseline from the current `faf05c0b` candidate,
current validator transcript, and
`evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json`
instead of a stale historical proof-vector baseline. A follow-on linked anchor
observation and `npm run trustless:observation-reconcile` report must bind both
observation paths to one shared bridge event root and Ergo anchor height before
completed Gate 5 evidence can pass. These handoffs do not mark Gate 5 complete.
The current instance binding packet is
`evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.md`
with JSON
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-07-4cb587fc.json`.
It makes the next Gate 5 work instance-specific by binding the selected local
offline non-mainnet burn identity to the current execution request and
SPV-linked recipient-tree candidate. The current instance refresh check is
`evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.md`
with JSON
`evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-07-4cb587fc.json`;
it is `TRUSTLESS_BURN_INSTANCE_REFRESH_READY` with 0 structural issues and
confirms that the proof-vector, candidate, binding, compact unsigned
transaction JSON, and unsigned validation report now all match the same
recipient-tree burn instance. The current local source-boundary unsigned
transaction evidence for this instance is
`evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json`
with validation report
`evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md`.
It must still avoid transaction checks, expected transaction IDs, signing,
submit, broadcast, settlement reconciliation, and release claims.
The operator packet also links the older compact single-leaf unsigned candidate
evidence at
`evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-03-57d80158.json`
and validation report at
`evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-validation-2026-07-03-57d80158.md`;
that historical packet remains source-boundary-only and is superseded by the
`faf05c0b` recipient-tree instance for current local Gate 5 routing.
The same operator packet now requires replacement-profile target-node
acceptance before node-backed check output can be treated as settlement-binding
evidence. Legacy V1 cannot produce that packet. The future packet must bind an
activated external-fee profile, application identity, source finality,
conservation, global DUP cutover lineage, exact chain-resident setup/admission
state, exact transaction identity, stateful `/transactions/check` PASS, and no
submit/reconcile/deploy/broadcast boundary escalation.
The current-head source-boundary addendum is
`evidence/trustless-burn/artifacts/completed-gate5-aggregate-spv-settlement-source-boundary-2026-06-30-16cceb0d.md`;
it records the aggregate SPV settlement source/test boundary and keeps
trustless-burn-leaf settlement identities candidate-only until V2 contracts
verify bridge-native burn leaves.
The V2 trustless aggregate source surface is
`contracts/MainChainAggregateUnlockTrustless.es`; it covers the compact
source-boundary bridge-native burn-leaf payout guard with zero to fourteen
burn-proof nodes and is not completed Gate 5 evidence.
The corresponding relayer source-boundary helper is
`relayer/src/aggregate-settlement-builder.ts` function
`buildTrustlessSingleLeafAggregateUnlockExtension`, captured by
`evidence/trustless-burn/artifacts/completed-gate5-trustless-single-leaf-context-extension-source-boundary-2026-07-01-6a74a291.md`;
it encodes the V2 ContextExtension for a planned compact trustless claim and
rejects proof-path drift, recipient drift, amount drift, and non-ERG asset lanes
without assembling, signing, checking, submitting, or broadcasting a V2
settlement transaction.
The corresponding unsigned V2 transaction assembly source-boundary is
`relayer/src/aggregate-settlement-tx.ts` function
`buildTrustlessSingleLeafAggregateSettlementTx`, captured by
`evidence/trustless-burn/artifacts/completed-gate5-trustless-single-leaf-unsigned-tx-source-boundary-2026-07-01-a51974fc.md`;
it assembles the candidate-only compact transaction shape with the compact
4-slot unlock extension and can pass the default context-extension guard for the
source-boundary shape.
The service-level unsigned preparation wrapper is
`relayer/src/aggregate-settlement-service.ts` function
`prepareTrustlessSingleLeafUnsignedTx`, captured by
`evidence/trustless-burn/artifacts/completed-gate5-trustless-single-leaf-service-unsigned-boundary-2026-07-01-5abc0f49.md`;
it selects source boxes and returns a compact unsigned candidate plus
structured `trustless-single-leaf-unsigned-tx` evidence binding selected boxes,
prepared transaction shape, guard status, and explicit no-check/no-sign/no-submit
boundaries without calling `/transactions/check`, deriving an expected
transaction ID, signing, submitting, broadcasting, or marking settlement
readiness.
`npm run trustless:unsigned-tx:validate` validates that unsigned evidence as a
separate read-only source-boundary target, rejects candidate-only identity JSON
and aggregate pre-broadcast JSON as the wrong evidence kind, and keeps
transaction-check, expected-tx-id, signing, submit, and claim authorization
boundaries closed. `--report-out <report.md>` records a durable validator
transcript without converting the unsigned source-boundary JSON into
pre-broadcast, expected-tx-id, signing, settlement, or Gate 5 closure evidence.
The local producer command captured for the compact unsigned evidence refresh is
`npm run trustless:unsigned-tx -- --generated-at 2026-07-03T00:00:00.000Z --out ../evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-03-57d80158.json`;
it exercises the service builder against deterministic public fixtures and
writes structured unsigned evidence with `contextExtensionGuard = pass` that
validates in
`evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-validation-2026-07-03-57d80158.md`
without loading environment files, querying nodes, reading runtime databases or
deployment state, signing, checking, submitting, reconciling, mutating state, or
broadcasting.
Gate 5 remains blocked
until Ergo-verifiable finality authority, authenticated commitment history,
extension-section anchoring, on-chain proof acceptance, DUP settlement
insertion, publication updates, and independent review are complete.

Gate 6 committee governance and key-rotation drill:
Requires completed governance/key-rotation evidence with `governance:validate`
PASS. The execution dependency is testnet or equivalent non-mainnet committee
runtime, rotation facts, threshold signer evidence, and external review
evidence.
The current Gate 6 blocker map is
`evidence/governance/phase010a-committee-governance-blocker-map-2026-07-03-7f516dcc.md`,
with blocked validation transcript
`evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-07-08-724876b6.md`;
it records public-boundary command output, broadcast-before-readiness negative
evidence, MainChainLock emergency escape source-boundary evidence, and MCU
Phase 2 SCS NFT source-boundary evidence, plus linked `npm run check`,
`npm run wasm:test`, and `npm run contracts:check` command-output evidence,
and threshold-policy source-boundary evidence for the 2-of-3 Phase 010a committee model,
member-loss threshold safety source-boundary evidence, and singleton continuity
source-boundary evidence, plus sanitized local deployment-state reconciliation
and wrong-network negative handoff evidence, without marking Gate 6 complete.
The refreshed validator report remains `BLOCKED` with 10 structural issues.
The current external-review packet
`evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-09-57a50625.md`
is the handoff target for external governance/key-rotation review. The
remaining Gate 6 dependency is external review, release
support/governance-ready/open-blocker closure, and reviewer approvals.

Gate 7 single, batch, and sharded benchmark evidence:
Requires completed benchmark evidence with `benchmark:validate` PASS and live
batch settlement evidence where required. The execution dependency is a testnet
benchmark environment, live batch approval/broadcast boundary evidence, and
measurable single/batch/sharded samples.
Current offline metric maps capture unsigned single, batch, and sharded
transaction-shape size and latency evidence only. The current `05f25f0e`
offline candidate validates as `BLOCKED` with 6 structural issues: live batch
settlement evidence, `Open benchmark blockers = 0`, reviewer summary blocker
closure, and three reviewer approvals. Gate 7 remains blocked on
signed/live transaction-size evidence, live batch settlement evidence,
`Open benchmark blockers = 0`, and reviewer approval before any testnet
production-candidate benchmark claim can be supported. Current publication
update evidence only records the institutional-reference offline benchmark
boundary: `Scaling claims allowed = yes`, `Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = no`,
`Production throughput claim allowed = no`, and
`Mainnet-grade evidence linked = no`.
The current live benchmark prerequisite map
`evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md`
and validation report
`evidence/benchmarks/artifacts/benchmark-validate-gate7-current-prereq-blocked-2026-07-09-e91f591c.md`
confirm the same 6 structural blockers against the current validator commit.
The current live benchmark review packet
`evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md`
turns the remaining live-run blockers into explicit approval questions,
transaction-identity checks, metric-boundary inputs, and no-broadcast
boundaries without closing Gate 7.
The current live batch capture manifest
`evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-cc9b0417.md`
orders identity input binding, the non-broadcast aggregate check that derives
the Expected transaction ID, explicit live approval scoped to that derived ID,
prebroadcast package assembly, validation, readiness/policy/signing checks,
approval-gated live submit, and post-submit reconciliation artifacts required
before benchmark evidence can move from the blocked live-run packet toward
completed evidence. It was produced from readiness operator request
`evidence/readiness/readiness-operator-request-current-lanes-2026-07-09-fcd4aa01.md`.
It remains `BLOCKED` with 6 structural issues from the Gate 7 prerequisite map.
The current live benchmark execution request
`evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.md`
with JSON
`evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.json`
turns that manifest into seven no-secret operator requests and exact evidence
targets for identity binding, aggregate check evidence, approval binding,
prebroadcast evidence, readiness/policy/signing checks, approval-gated submit
observation, and post-submit reconciliation. It reads only guarded Markdown
evidence and does not inspect runtime databases, deployment state, environment
files, wallet material, nodes, or RPC endpoints; it does not authorize signing,
submit, broadcast, Gate 7 closure, release-gate PASS, or production-throughput
claims.

## Release Decision

A release may be proposed only when:

1. Every gate above is checked or explicitly listed in the Pending Evidence
   Register with a publication effect.
2. `npm run check` and `npm run wasm:test` are green on a clean checkout.
3. The threat model and runbooks are current.
4. The release notes identify the release level and remaining trust assumptions.
5. No pending evidence row remains for the release level being proposed.

The decision table is executable guard input. It must keep the canonical
`Field | Value` header, match the Pending Evidence Register, and stay
`blocked` while publication blockers remain.

| Field | Value |
|---|---|
| Proposed release level | blocked |
| Final decision | blocked |
| Public release allowed | no |
| Production-ready claims allowed | no |
| Testnet production-candidate claims allowed | no |
| Unresolved publication blockers | 9 |
| Release notes status | not ready |
| Release notes artifact | not linked |

Executable local guard:

```powershell
cd relayer
npm run release:gate
```

Phase 007 technical-addendum/manual evidence is validated separately before it
can support controlled wording review. It is not a substitute for the release
gate and does not authorize broadcast or any mainnet production-ready claim:

```powershell
cd relayer
npm run addendum:validate -- ../evidence/addendum/<completed-technical-addendum-evidence>.md
npm run release:gate -- --technical-addendum-evidence ../evidence/addendum/<completed-technical-addendum-evidence>.md
```

When evaluating `Testnet production-candidate claims allowed = yes`, run the
gate with the completed clean-checkout evidence target, the completed
dependency-review evidence target, the completed
independent security review evidence target, the completed trustless burn
evidence target, the completed release-notes document target, the
completed benchmark evidence target, the completed operator-readiness evidence
target, the completed committee-governance evidence target, the completed external integration evidence target, the completed technical-addendum evidence target, the completed live rehearsal evidence target, the completed assembly report JSON target, the completed live-preflight JSON target, the
completed local-devnet and testnet settlement-profile activation JSON targets,
the completed offline-gate JSON target, the completed prep-bundle JSON target, the completed aggregate prebroadcast JSON target, the completed fresh checkpoint JSON target,
and the completed post-submit observe JSON target, plus the completed
failed-broadcast and reorg recovery-observe JSON targets and the completed
backup-restore evidence target, so the executable guard validates the actual Markdown and JSON artifacts,
not only the checklist's validation transcript text:

```powershell
cd relayer
npm run release:gate -- --clean-checkout-evidence ../evidence/ci/<completed-clean-checkout-evidence>.md --dependency-review-evidence ../evidence/dependencies/<completed-dependency-review-evidence>.md --security-review-evidence ../evidence/security/<completed-independent-security-review>.md --trustless-burn-evidence ../evidence/trustless/<completed-trustless-burn-evidence>.md --benchmark-evidence ../evidence/benchmarks/<completed-benchmark-evidence>.md --governance-evidence ../evidence/governance/<completed-committee-governance-evidence>.md --operator-readiness-evidence ../evidence/operators/<completed-operator-readiness-evidence>.md --integration-evidence ../evidence/integration/<completed-external-integration-review>.md --technical-addendum-evidence ../evidence/addendum/<completed-technical-addendum-evidence>.md --release-notes ../evidence/releases/<completed-release-notes>.md --threat-model-evidence ../docs/security-evidence-matrix.md --local-live-rehearsal-evidence ../evidence/live-rehearsals/<completed-local-live-rehearsal>.md --live-rehearsal-evidence ../evidence/live-rehearsals/<completed-testnet-live-rehearsal>.md --local-settlement-profile-activation-json ../evidence/activation/<completed-local-settlement-profile-activation.json> --settlement-profile-activation-json ../evidence/activation/<completed-testnet-settlement-profile-activation.json> --assembly-report-json ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.json> --live-preflight-json ../evidence/live-rehearsals/<external-fee-live-preflight.json> --fresh-checkpoint-json ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --post-submit-observe-json ../evidence/live-rehearsals/<post-submit-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json> --backup-restore-evidence ../evidence/recovery/<completed-backup-restore-evidence>.md
```

Each singleton evidence flag must be provided at most once. Use repeated
`--recovery-observe-json` flags only for distinct recovery observation reports;
duplicate recovery observation kinds or targets are structural blockers.
Malformed or duplicate CLI evidence flags are counted in the release-gate
structural issue total, not treated as side-channel output outside the verdict.
Completed validation targets, including repeated `--recovery-observe-json`
targets, must also be distinct across release-gate evidence families, so one
Markdown or JSON artifact cannot be reused as the actual input for multiple
validators. Checked evidence families and the Release Decision release-notes
artifact must also cite distinct validation output/log/transcript targets; one
validator output artifact cannot stand in for multiple command-specific
validator runs, including multiple validator commands listed inside the same
checked evidence row.

This command must fail while any row in the Pending Evidence Register remains a
publication blocker, and it must also fail if a `Checked` publication-blocker
row has no completed evidence link, command-output target, or artifact marker.
For testnet production-candidate claims,
`release:gate -- --clean-checkout-evidence` must read the actual completed
Clean Checkout Evidence document and that validated target must match the
linked completed clean-checkout evidence in the Gate 1 row, with a distinct
`npm run ci:validate` output target bound to the same completed document. The
completed clean-checkout validation must expose `Clean checkout CI green = yes`,
`Release supported = production deployment candidate`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Release gate structural issues = 0`, `Release notes updated = yes`, completed
Gate 1 release-note update evidence, and completed Gate 1 checklist update
evidence using distinct completed Gate 1 release-note/checklist update targets,
with both publication-update fields carrying exact
`Release supported = production deployment candidate`,
`Production-ready claim allowed = no`, and
`Testnet production-candidate claim allowed = yes` bindings,
plus structured command, workflow, reproducibility-decision,
reviewer rows, and publication-decision update fields with required rows
linked, command-specific completed clean-checkout output evidence,
workflow-specific CI facts, completed reproducibility evidence with
decision-specific publication impact, and actionable reviewer decisions
approved. Gate 1 reviewer notes and publication-update fields fail closed when
approval or pass-like notes are mixed with failed validator or command markers,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero `structural
issues`. Gate 1 reviewer decision summaries and publication-update fields must
preserve exact `Release gate structural issues = 0`; textual zero-like terms or numeric
shorthand without `= 0` do not close Gate 1 evidence, so checklist prose, a generic row payload,
row-named non-concrete artifact target, a clean-checkout publication decision,
or a bare
`ci:validate PASS` note cannot authorize the claim by itself. A Gate 1 row marked `Checked` requires the same actual
`--clean-checkout-evidence` validation input even outside the testnet
production-candidate release-decision path.
The expected `npm run release:gate` command output may remain `BLOCKED` only
when it also proves `0 structural issues`; linked workflow and
reproducibility-decision rows fail closed if their evidence carries failed
validator/command markers, `ERROR`, non-zero `exit code`, non-zero `errors`,
or non-zero `structural issues`.
For Gate 1, row-named non-concrete artifact targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed command, workflow,
reproducibility-decision, or publication-update evidence.
For testnet production-candidate claims,
`release:gate -- --technical-addendum-evidence` must read the actual completed
Technical Addendum / testnet architecture manual evidence and that validated
target must match the linked completed technical-addendum evidence in the Gate 2
row, with a distinct `npm run addendum:validate` output target bound to the
same completed document. The completed addendum document target must appear as
completed technical-addendum evidence outside the validator output segment; a
validation-only target binding is not enough. `technical addendum validation
target`, `addendum validate target`, `addendum validation target`,
`validated target`, and `validated input` bindings are validator provenance only
and cannot close gate-map, architecture-decision, release-note, or checklist
update evidence rows. The completed addendum validation must expose
structured Manual Classification with a non-empty manual name, 7-40 character
Git commit matching final clean-checkout Git commit,
`Release level = production deployment candidate`,
`Environment = testnet`, controlled testnet `Claim wording`, non-empty
`Architecture owner`, non-empty `Reviewer`, ISO `Date`,
structured Claim Boundary fields proving blocked non-testnet claim categories,
`Testnet production-candidate wording allowed = yes-after-release-gate-pass`,
`Production-grade testnet wording allowed = yes-after-release-gate-pass`,
`Release gate required before public claim = yes`, and
`Evidence completeness required = yes`,
`Release gate status = pass`, `Production-ready claim allowed = no`,
`Mainnet deployment claim allowed = no`,
`Testnet production-candidate claim allowed = yes-after-release-gate-pass`, and
`Release notes updated = yes`, completed Phase 007 release-note/checklist update
evidence using distinct completed Phase 007 release-note/checklist update
targets, plus structured gate-map,
architecture-decision, and reviewer rows with required rows linked or passed,
gate-specific required evidence, completed artifact evidence, bounded claim
boundaries, decision-specific positions, completed decision evidence, and
actionable reviewer decisions approved. The architecture-decision evidence for
`What must pass before testnet production-candidate wording?` must include
concrete `release:gate PASS` output with `Structural issues = 0`, so a decision
artifact or `addendum:validate PASS` transcript cannot stand in for the
executable gate result. The Architecture owner sign-off must
match Manual Classification `Architecture owner`, Security reviewer sign-off
must match Manual Classification `Reviewer`, and reviewer sign-off dates must
not predate Manual Classification `Date`, so checklist prose, a generic row
payload, row-named non-concrete artifact target, or a bare
`addendum:validate PASS` note cannot authorize the claim by
itself. Technical-addendum row evidence and publication-update fields also fail
closed when pass-like command or validation notes are mixed with `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`. Technical-addendum publication-update fields that mention
release-gate pass/status must use exact `Release gate status = pass`;
prose-only release-gate pass wording does not close Gate 2. Publication-update
fields that mention testnet production-candidate claim allowance must use exact
`Testnet production-candidate claim allowed = yes-after-release-gate-pass`;
prose-only testnet production-candidate claim wording does not close Gate 2. A
Gate 2 row marked `Checked` requires the actual
`--technical-addendum-evidence` validation input with those structured claim
fields, rows, and row payloads.
For Gate 2, non-concrete artifact targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed gate-map,
architecture-decision, or publication-update evidence. Gate-map,
architecture-decision, and reviewer rows must also be unique by row name or
reviewer role; duplicate rows are blocked even when the later row has a passing
status.
Linked or passed gate-map rows and linked architecture-decision rows must also
use distinct completed evidence targets across row groups; a reused target
cannot close multiple Gate 2 facts.
Phase 007 release-note and checklist update evidence must also use distinct
completed targets; a reused publication-update target cannot close both fields.
Template links, targetless command-output notes, and validator command names
alone are not completed evidence. Release
gate evidence hygiene also rejects local paths, file URLs, credential-bearing
links, runtime database files, deployment-state files, and diagnostic dumps in
Publication effect and Required resolution cells. Required blocker rows must
remain publication blockers and keep a structured resolution target with
row-specific evidence terms until they are resolved. Generic artifact links are not enough. Duplicate
blocker rows are invalid because they make the publication status ambiguous.
The same uniqueness rule applies to structured validator rows consumed by
`release:gate`: required row names and reviewer/sign-off roles cannot be
duplicated to let a later PASS row mask an earlier contradictory row.
For Markdown-backed validators, the completed document target linked from the
row and bound by the validator output must also be concrete; a matching
`generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, or
`example-evidence-*` completed Markdown target is still a placeholder and
cannot close the gate. A standalone `validated target`, `validated input`, or
`<validator> validation target` segment is not completed document evidence,
even when it names a concrete `completed-*.md` target; the completed document
must be linked as its own evidence outside validation-target binding text and
then bound by a distinct validator output artifact.
Required unresolved rows must also keep their canonical `Pending evidence` or
`Open blocker` status until completed evidence justifies `Checked`. The release
decision table must also keep its canonical `Field | Value` header, match the
unresolved publication-blocker count, and cannot claim a proposed or approved
release while blockers remain.
Production-ready claims remain blocked at the top-level decision:
`Production-ready claims allowed` must remain `no`; this repository can evaluate only the separate
`Testnet production-candidate claims allowed` field. That field can become
`yes` only when the proposed release level is `production deployment
candidate`, all publication blockers are resolved, the final decision is
approved, completed release notes are linked, and `Release notes artifact`
contains completed production deployment candidate release notes evidence that
must explicitly identify production deployment candidate release notes. Public
release cannot be allowed before final approval. Public release also requires
`Release notes status` to be
`linked` and `Release notes artifact` to contain two distinct evidence pieces:
a completed Markdown release-notes document artifact and
`npm run release-notes:validate` output evidence that identifies that completed
document as the validated target;
the completed Markdown document artifact must be standalone evidence outside
the validator output segment;
release-notes template Markdown files remain resolution targets and cannot be
used as completed release-notes document artifacts;
the completed-document filename must use an affirmative `completed` marker,
not `not-completed` or `uncompleted`;
the validator output evidence must cite a distinct validation log, transcript,
CI run, or workflow artifact rather than reusing the completed release-notes
document, a generic evidence artifact, or a bare `run` artifact, and the target
binding must cite the same normalized completed-document target in the validator
output evidence itself, not only the same basename or a separate reviewer note;
the validator output evidence must identify a positive validation result such
as `PASS`, `exit code 0`, `no structural issues`, or equivalent no-issues
wording, so the mere existence of `artifact://release-notes/validate.log` cannot
close the release-note validation row;
for any approved `Release Decision` with linked release notes, including
institutional reference publication even when public-release and
testnet-production-candidate flags remain `no`,
`release:gate -- --release-notes` must read the actual completed Markdown
release-notes document and that
validated target must match the linked completed release-notes document in
`Release notes artifact`, so a textual `release-notes:validate PASS` note alone
cannot authorize publication. The completed release-notes validation must also
expose structured release classification, required-evidence, trust-assumption,
publication-blocker, allowed-claim, operator-impact, and sign-off rows with
required rows linked or checked, concrete evidence-specific row payloads,
publication effects, assumption evidence and release impacts, blocker-specific
resolution evidence, bounded allowed wording, actionable operator actions and
stop conditions, positive allowed-claim evidence links that do not negate the
claim they identify, and actionable sign-off notes approved without
production-ready or mainnet-scoped claim approval; operator actions, stop
conditions, and sign-off notes must also preserve the same claim boundary, so
absolute security wording, mainnet production wording, and unqualified
production-ready/go-live wording cannot be hidden in structured
operator-impact or sign-off rows; the validated
release-note classification `Release level` must match the `Release Decision`
`Proposed release level`; the release-note classification must expose non-empty
Release name, valid Decision, non-empty Decision owner, and ISO Decision date;
an approved `Release Decision` requires release notes with `Decision = proposed`
rather than `blocked` or `rejected`; the Maintainer sign-off must match that
Decision owner; sign-off dates must not predate that Decision date; and the
release-note classification `Git commit` must match the clean-checkout Run
Classification `Git commit`, so a PASS summary, generic row payload, row-named
non-concrete artifact target, release-notes validation-target row link, document
for another release level or checkout, mismatched classification decision, or
mismatched sign-off remains blocked;
release-note linked rows and completed-document artifacts also reject
row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `sample-evidence-*`, and `example-evidence-*`; matching a
row label inside a placeholder path cannot close release-note evidence;
release-note row evidence must link concrete row-specific artifacts separately
from `release-notes validation target` or `release-notes validate target`
provenance, because validator target bindings cannot close required evidence,
trust-assumption, checked publication-blocker, or allowed-claim rows by
themselves;
release-note row evidence targets must also be distinct across Required
Evidence, Trust Assumptions, checked Publication Blockers, and Allowed Claims,
so one completed artifact cannot close multiple publication obligations;
release-note row payloads must also be internally non-contradictory: a concrete
artifact, row-specific payload, or PASS-like validator excerpt cannot also
report `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues`;
all controlled claim-boundary rows from the release-notes Disallowed Claims
Check must be present in the structured `claimRows`; a single generic
allowed-claim row or a duplicate claim row cannot authorize release-note
publication evidence;
for any linked threat-model/evidence-matrix release-note row,
`release:gate -- --threat-model-evidence` must read the actual security
evidence matrix target validated with `npm run threat-model:validate`; the
validated target must match the linked matrix artifact, the validator must
expose `Matrix Classification` fields for matrix name, Git commit, reviewer,
and ISO date, the matrix Git commit must match the final clean-checkout Run
Classification Git commit, and the validator must expose structured matrix rows
for the required risk areas, including each release-gate-bound area's required
validator command and release-gate evidence flag. Each matrix row must cite
concrete repository path evidence; a validator command name, PASS summary,
target string, or narrative risk note cannot stand in for those rows;
for testnet production-candidate claims,
`release:gate -- --dependency-review-evidence` must read the actual completed
Dependency Review Evidence document and that validated target must match the
linked completed dependency-review evidence in the Gate 4 signer row, with a
distinct `npm run dependency:validate` output target bound to the same completed
document. That validator-output target must be concrete; `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` validation logs or transcripts remain placeholders, and
the same validator-output segment must not carry contradictory failure markers
such as `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues` alongside an older `PASS` note. Checklist prose such as `Upstream signer blocker resolved = yes`
cannot authorize the claim by itself. The release gate also consumes the
structured Review Classification, command, dependency scope, vulnerability
triage, upgrade decision, and reviewer rows returned by the validator,
including Review Classification
`Release level`, `Environment`, `Lockfiles reviewed`, `Git commit`, `Reviewer`,
and `Date`, linked row statuses,
internally positive command-specific completed output evidence,
dependency-specific source, risk, and evidence payloads, completed triage
evidence with explicit zero critical/high findings, completed upgrade evidence
with decision-specific release actions, completed ContextExtension guard evidence,
positive JVM golden vectors, concrete upstream signer release and JVM/node
conformance evidence linked from the signer dependency decision's `Required
evidence` field rather than a completed target alone, signer release identifiers
matched between `Release action` and `Required evidence`, fail-closed publication decision values for institutional
reference support, internally non-contradictory linked dependency scope, triage,
upgrade, and publication-update evidence, dependency reviewer identity/date
binding, and actionable reviewer approvals that keep signer and vulnerability
boundaries; a PASS summary, generic row payload, row-named non-concrete artifact
target, or signer publication decision without those fields and rows remains
blocked. A Gate 4
`Signer dependency conformance or fail-closed release decision` row marked
`Checked` requires the same actual `--dependency-review-evidence` validation
input and structured rows even when the overall release remains blocked.
Validation-target-only row evidence is also blocked: `dependency review
validation target`, `dependency validate target`, `validated target`, or
`validated input` links bind the validator input/output artifact and cannot
close the command, dependency-scope, triage, upgrade, release-note, or checklist
evidence rows by themselves.
The dependency-review release-note update and checklist update fields must also
use distinct completed targets; one combined publication-update artifact cannot
close both fields.
When those publication-update fields mention critical/high vulnerability
closure, they must use exact numeric `Critical/high vulnerabilities open = 0`;
textual zero-like terms or numeric shorthand without `= 0` do not close Gate 4
dependency publication-update evidence.
Dependency publication-update fields must also carry exact
`Release supported = institutional reference`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = no`,
`Critical/high vulnerabilities open = 0`, and
`Upstream signer blocker resolved = no` while the signer dependency evidence
remains fail-closed.
The dependency reviewer decision summary must also use exact
`Release supported = institutional reference` for the current fail-closed
institutional-reference boundary, and exact
`Critical/high vulnerabilities open = 0` when it closes critical/high
vulnerabilities; numeric shorthand without `= 0` does not close the reviewer
decision.
For Gate 4 dependency review, row-named non-concrete artifact targets such as
`generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed command,
dependency-scope, triage, upgrade, or publication-update evidence.
Dependency command rows that report `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` alongside a
pass-like output marker remain blocked.
Dependency scope, vulnerability triage, and upgrade decision linked evidence
cells are fail-closed under the same rule: completed artifact markers, linked
status, or positive review text cannot appear beside failed validator/command
markers, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues`.
For testnet production-candidate claims,
`release:gate -- --security-review-evidence` must read the actual completed
Independent Security Review Evidence document and that validated target must
match the linked completed independent security review evidence in the Gate 4
security review row, with a distinct `npm run security:validate` output target
bound to the same completed document, so checklist prose such as
`Final decision = approve` or `Critical/high findings open = 0` cannot
authorize the claim by itself. The release gate also consumes the structured
scope coverage, evidence package, finding disposition, negative-check, and
reviewer rows returned by the validator, including linked row statuses, zero
open critical/high findings and numeric zero publication blockers, completed area-specific
scope evidence with risk-focus notes, item-specific evidence-package artifacts
with actionable reviewer notes, completed finding closure evidence that
references any finding IDs cited by scope rows, expected negative-check
reviewer answers, question-specific negative-check evidence,
distinct completed evidence targets across linked scope, evidence-package,
finding, and negative-check rows, lead reviewer binding, and actionable
reviewer approvals that keep finding, accepted-risk, and claim boundaries; a PASS summary,
generic row payload, row-named non-concrete artifact target, or final publication
decision without those rows remains blocked. A Gate 4
`Independent security review report` row marked `Checked`
requires the same actual `--security-review-evidence` validation input and
structured rows even when the overall release remains blocked.
Validation-target-only row evidence is also blocked: `security review
validation target`, `independent security review validation target`,
`security validate target`, `validated target`, or `validated input` links bind
the validator input/output artifact and cannot close scope, evidence-package,
finding, negative-check, release-note, or checklist evidence rows by themselves.
The Gate 4 blocker row must preserve production-ready claim handling with exact
`Production-ready claim allowed = no`; prose denial such as
`production-ready claim handling: blocked` does not close reviewer decision.
For Gate 4 independent security review, row-named non-concrete artifact
targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`sample-evidence-*`, and `example-evidence-*` are placeholders rather than
completed scope, evidence-package, finding, negative-check, or
accepted-risk publication-update evidence.
Those publication-update fields must identify completed Gate 4 accepted-risk
checklist/release-note update evidence and remain internally non-contradictory
as security publication-update evidence. When accepted risks are reflected in
release notes, both publication-update fields must include exact
`Accepted risks reflected in release notes = yes`; when testnet
production-candidate claims are allowed, both publication-update fields must
include exact `Testnet production-candidate claim allowed = yes`; when
production-ready claims are blocked, both publication-update fields must include
exact `Production-ready claim allowed = no`; when the
security-review release-support field is exact
`Release supported = production deployment candidate`, both publication-update
fields must include exact `Release supported = production deployment
candidate`. Production-candidate Gate 4 publication-update fields must use exact numeric
`Critical/high findings open = 0` and `Publication blockers = 0`; textual
equivalents such as `none`, `no`, `zero`, `closed`, `resolved`, or `mitigated`
and numeric shorthand without `= 0` do not close the publication-update
evidence.
Security review evidence cells that mix pass-like command or validation notes
with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or
non-zero `structural issues` remain blocked even when they also cite concrete
artifacts.
For testnet production-candidate claims,
`release:gate -- --trustless-burn-evidence` must read the actual completed
Trustless Burn Verification Evidence document and that validated target must
match the linked completed trustless burn evidence in the Gate 5 row, with a
distinct `npm run trustless:validate` output target bound to the same completed
document, so checklist prose such as `Trustless burn verification implemented = yes`
or `Transitional trusted burn path disabled = yes` cannot authorize the claim
by itself. The release gate also consumes the structured component,
commitment, burn-proof, Local Proof Vector, positive, negative, and reviewer
rows returned by the validator, including linked row statuses,
component-specific trustless properties, completed component/commitment/burn-proof
evidence, field-specific commitment encodings and burn-proof bindings, a Local
Proof Vector whose `bridgeEventRootHex`, leaf identity, DUP key, recipient,
amount, event index, non-empty structured inclusion proof nodes, and proof-core
negative cases bind to the commitment and burn-proof rows, positive proof
evidence bound to the commitment and burn binding rows, negative-test-specific rejection evidence with concrete rejected
identifiers, and actionable reviewer approvals; a PASS summary, generic row
payload, row-named non-concrete artifact target, or validation-target-only row
payload remains blocked. A publication decision without those rows and Local
Proof Vector binding remains blocked. The release gate also requires classified `Broadcast mode` to be `disabled` or `dry-run`.
For Gate 5, row-named non-concrete artifact targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed component,
commitment, burn-proof, positive, negative, or publication-update evidence.
Linked component, commitment, burn-proof, positive, and negative rows must also
use distinct completed evidence targets; one shared proof artifact cannot close
multiple trustless proof facts.
Gate 5 checklist and release-note publication-update fields must also identify
distinct completed targets; one combined publication-update artifact cannot
close both fields. When trustless burn verification is implemented, both
publication-update fields must include exact
`Trustless burn verification implemented = yes`; when Gate 5 `Release level`
is `production deployment candidate`, both publication-update fields must
include exact `Release supported = production deployment candidate`; when
production-ready claims are blocked, both publication-update fields must include
exact `Production-ready claim allowed = no`; when testnet
production-candidate claims are allowed, both publication-update fields must
include exact `Testnet production-candidate claim allowed = yes`; when
Gate 5 `Transitional trusted burn path disabled = yes`, both
publication-update fields must include exact
`Transitional trusted burn path disabled = yes`; when
critical/high findings are closed, both publication-update fields must include
exact `Critical/high findings open = 0`. Reviewer decision summaries that close
the transitional trusted burn path boundary must use exact
`Transitional trusted burn path disabled = yes`; prose-only terms do not close
Gate 5 evidence. Textual zero-like terms or numeric shorthand without `= 0` do
not close Gate 5 critical/high finding evidence.
A Gate 5
`Trustless burn verification path` row marked `Checked` requires the same
actual `--trustless-burn-evidence` validation input even when the overall
release remains blocked.
`trustless:candidate -- --proof-vector <proof-vector.json>` can derive
candidate identity fields from an evidence-ready local proof-vector target and
records `sourceBindings.proofVector` provenance for that target, target burnId,
bridge event root, leaf hash, leaf count, and proof-node count.
`trustless:candidate:validate` is only candidate JSON evidence; neither can
replace the completed `trustless:validate` protocol evidence;
`trustless:unsigned-tx:validate` is only unsigned transaction source-boundary
JSON validation and cannot replace completed protocol evidence, pre-broadcast
evidence, transaction-check evidence, expected-tx-id evidence, signing
authorization, or settlement readiness;
for testnet production-candidate claims,
`release:gate -- --benchmark-evidence` must read the actual completed
Performance Benchmark Evidence document and that validated target must match
the linked completed benchmark evidence in the Gate 7 row, with a distinct
`npm run benchmark:validate` output target bound to the same completed
document. The completed benchmark validation must expose
`Release level = production deployment candidate`, `Environment = testnet`,
7-40 character Git commit, `Trust path = trustless burn proof path`,
reproducible machine/toolchain metadata, non-empty reviewer, ISO `Date`,
`Release supported = production deployment candidate`,
`Scaling claims allowed = yes`, `Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Production throughput claim allowed = no`,
`Mainnet-grade evidence linked = no`, `Open benchmark blockers = 0`, and
`Release notes updated = yes`, plus completed Gate 7 benchmark release-note
and checklist update evidence using distinct completed targets. Publication-update
fields that mention benchmark blocker closure must use exact numeric
`Open benchmark blockers = 0`; textual equivalents such as `none`, `no`,
`zero`, `closed`, `resolved`, or `mitigated`, and numeric shorthand without
`= 0`, do not close Gate 7 publication-update evidence.
Benchmark reviewer decision summaries that close open benchmark blocker
handling must also include exact `Open benchmark blockers = 0`.
Benchmark reviewer decision summaries that support a production deployment
candidate benchmark release must also include exact
`Release supported = production deployment candidate`.
Publication-update fields must include exact
`Release supported = production deployment candidate` when benchmark
publication decisions set `Release supported = production deployment
candidate`; prose-only support terms do not close Gate 7 publication-update
evidence. Publication-update fields must include exact
`Testnet production-candidate claim allowed = yes` when benchmark publication
decisions set `Testnet production-candidate claim allowed = yes`; prose-only testnet-candidate
terms do not close Gate 7 publication-update evidence.
Publication-update fields must include exact
`Scaling claims allowed = yes` when benchmark publication decisions set
`Scaling claims allowed = yes`; prose-only terms do not close Gate 7
publication-update evidence. Benchmark reviewer decision summaries under a
`Scaling claims allowed = yes` decision must also include exact
`Scaling claims allowed = yes`. Benchmark reviewer decision summaries under a
`Production-ready claim allowed = no` decision must also include exact
`Production-ready claim allowed = no`. Publication-update fields must include
exact `Production-ready claim allowed = no` when benchmark publication
decisions set `Production-ready claim allowed = no`; omission alone does not
close Gate 7 publication-update evidence. Benchmark reviewer decision
summaries under a
`Mainnet-grade evidence linked = no` decision must also include exact
`Mainnet-grade evidence linked = no`. Publication-update fields must include
exact `Mainnet-grade evidence linked = no` when benchmark publication decisions
set `Mainnet-grade evidence linked = no`; omission alone does not close Gate 7
publication-update evidence. Publication-update fields must include
exact `Production throughput claim allowed = no` when benchmark publication
decisions set `Production throughput claim allowed = no`; prose-only terms do
not close Gate 7 publication-update evidence. Benchmark reviewer decision
summaries that close production throughput claim handling must also include
exact `Production throughput claim allowed = no`. The completed benchmark
validation must also include structured
metric, sharded-lane, bottleneck, claims-boundary, and reviewer rows with required rows linked,
scenario-specific completed benchmark evidence, positive measurements,
statement-specific sharded-lane
evidence, bottleneck-specific completed evidence with impact and next action,
and actionable reviewer decisions approved. A linked `Live batch
settlement` row also requires classified `Broadcast mode = enabled` with the
approval and boundary evidence listed above, plus a submitted transaction
identity that matches the benchmark row's Expected transaction ID and also
matches the actual live-preflight Expected transaction ID and post-submit
observed submitted transaction ID when those JSON reports are supplied to
`release:gate`, so checklist prose, a generic row payload, or a bare
`benchmark:validate PASS` note cannot authorize the claim by itself. Benchmark
publication-update fields must be internally
non-contradictory, so release-action sentences cannot replace completed update
evidence; row-named non-concrete artifact or Markdown targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`, and
`example-evidence-*` are not completed benchmark evidence.
Linked metric, sharded-lane, and bottleneck evidence cells also fail closed when
a completed target is paired with `FAIL`, `BLOCKED`, `ERROR`, a non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues`.
A Gate 7 `Single, batch, and sharded benchmark evidence` row marked `Checked`
requires the same actual `--benchmark-evidence` validation input even when the
overall release remains blocked.
for testnet production-candidate claims,
`release:gate -- --governance-evidence` must read the actual completed
Committee Governance Evidence document and that validated target must match the
linked completed committee governance evidence in the Gate 6 committee row,
with a distinct `npm run governance:validate` output target bound to the same
completed document. The completed committee-governance validation must expose
`Release level = production deployment candidate`, `Environment = testnet`,
classified `Broadcast mode` as `disabled` or `dry-run`, a 7-40 character Git
commit, governance model identifying committee or multisig governance,
threshold at least 2, member count at least 3, threshold lower than member
count, non-empty reviewer, ISO `Date`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Governance-ready claim allowed = yes`, `Open governance blockers = 0`, and
`Release notes updated = yes`, plus completed Gate 6 governance release-note
and checklist update evidence, structured scope, command, rotation,
positive-check, negative-check, and reviewer rows with required rows linked and
reviewer decisions approved. Governance publication-update fields must include
exact numeric `Open governance blockers = 0` when Gate 6 governance
`Open governance blockers = 0`; textual equivalents such as `none`, `no`,
`zero`, or `resolved`, and numeric shorthand without `= 0`, do not close Gate
6. Release-note, checklist, and external-review publication evidence that
mentions governance-ready claim closure must use exact
`Governance-ready claim allowed = yes`; prose-only terms such as `allowed`,
`approved`, or `supported` do not close Gate 6. They must also use exact
`Production-ready claim allowed = no` when governance production-ready claims
are blocked. They must also use exact
`Release supported = production deployment candidate` when the governance
release-support field is exact
`Release supported = production deployment candidate`, and exact
`Testnet production-candidate claim allowed = yes` when the governance
testnet-candidate field is exact
`Testnet production-candidate claim allowed = yes`. Those bindings must
also appear in the reviewer decision summary before Gate 6 governance readiness
or blocker closure can support the release decision. Publication updates must
also be internally non-contradictory, so checklist prose, a bare
`governance:validate PASS` note, or a release-action sentence cannot authorize
the claim by itself;
row-named non-concrete artifact or Markdown targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `sample-evidence-*`, and `example-evidence-*` are not
completed committee governance evidence. `governance validation target`,
`committee governance validation target`, `governance validate target`,
`validated target`, and `validated input` links bind validator provenance only;
they cannot close scope, command, rotation, positive-check, negative-check,
release-note, or checklist evidence rows by themselves. A Gate 6
`Committee governance and key-rotation drill` row marked `Checked` requires the
same actual `--governance-evidence` validation input and structured rows even
when the overall release remains blocked;
the `Compile affected contracts` rotation row must cite `npm run
contracts:check` or concrete contract compilation output, not placeholder-only
validation wording; linked scope, rotation, positive, and negative row evidence
also fails closed on
contradictory validator or command failure markers. Negative-check evidence may
state an expected rejected, blocked, refused, or failed governance outcome, but
not a failed validator, command, status, result, or outcome marker;
for testnet production-candidate claims,
`release:gate -- --integration-evidence` must read the actual completed
External Integration Review document and that validated target must match the
linked completed external integration evidence in the Gate 8 row, with a
distinct `npm run integration:validate` output target bound to the same
completed document. The completed external-integration validation must expose
`Release level = production deployment candidate`, `Environment used = testnet`,
classified `Broadcast mode` as `disabled` or `dry-run`,
`Private maintainer context used = no`,
`Public institutional-reference release allowed = yes`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`, and
`Release notes updated = yes`, completed Gate 8 integration release-note and
checklist update evidence using distinct completed targets, plus
structured entry-point, fresh-checkout, integration-decision, negative-review,
and reviewer rows with required rows linked, decision rows exposing bounded
required answers, negative-review rows exposing expected correction text, and
reviewer decisions approved, so checklist prose or a bare
`integration:validate PASS` note cannot authorize the claim by itself. Gate 8
release-note and checklist publication-update fields must use exact
`Private maintainer context used = no`; prose-only denials or omitted bindings
do not close that boundary. Gate 8 release-note and checklist
publication-update fields must also use exact
`Public institutional-reference release allowed = yes`; prose-only approval
terms or omitted bindings do not close that boundary. The reviewer decision summary must use the
same exact `Public institutional-reference release allowed = yes` binding;
the blocker row must preserve public institutional-reference release handling
with exact `Public institutional-reference release allowed = yes`. Prose approval such as
`public institutional-reference release handling: allowed` does not close
reviewer decision. Gate 8 release-note and checklist publication-update fields
must also use exact `Production-ready claim allowed = no` when production-ready
claims are blocked; prose-only denial terms or omitted bindings do not close
that boundary. The blocker row must also preserve production-ready claim
handling with exact `Production-ready claim allowed = no`; prose denial such as
`production-ready claim handling: blocked` does not close reviewer decision.
It must also use exact
`Testnet production-candidate claim allowed = no` when the publication field is
`no`, or exact `Testnet production-candidate claim allowed = yes` when the
publication field is `yes`; when the publication field is `yes`, the
release-note and checklist publication-update fields must carry the same exact
`Testnet production-candidate claim allowed = yes` binding. Prose-only
blocked/allowed wording does not close the testnet production-candidate
decision. Gate 8
publication-update fields are fail-closed when they mix
PASS-like validation notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues`; linked
entry-point, decision, and negative-review evidence also fails closed on failed
validator or command markers and non-zero counters, while expected integration
blockers and corrected misreads remain row facts rather than failed output
evidence. A Gate 8
`External integration package review` row marked
`Checked` requires the same actual `--integration-evidence` validation input
and structured rows even when the overall release remains blocked; row-named
non-concrete artifact targets such as `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `sample-evidence-*`, and `example-evidence-*` are not completed
external integration evidence; entry-point, fresh-checkout, decision,
negative-review, and reviewer rows must be unique by row name or reviewer role
so duplicate rows cannot mask private-context or claim-boundary failures.
Linked entry-point, fresh-checkout, decision, and negative-review row evidence
must also use distinct completed targets across row groups; a reused target
cannot close multiple external integration facts.
`integration validation target`, `external integration validation target`,
`integration validate target`, `validated target`, and `validated input` links
bind validator provenance only; they cannot close entry-point, fresh-checkout,
decision, negative-review, release-note, or checklist evidence rows by
themselves. For testnet production-candidate claims,
`release:gate -- --operator-readiness-evidence` must read the actual completed
Operator Readiness Evidence document and that validated target must match the
linked completed operator-readiness evidence in the Gate 6 operator row, with a
distinct `npm run operator:validate` output target bound to the same completed
document. The completed operator-readiness validation must expose
`Release level = production deployment candidate`, `Environment = testnet`,
classified `Broadcast mode` as `disabled` or `dry-run`,
`Release supported = production deployment candidate`,
`Production-ready claim allowed = no`,
`Testnet production-candidate claim allowed = yes`,
`Operator-ready claim allowed = yes`, `Critical incidents open = 0`, and
`Release notes updated = yes`, plus completed operator-readiness release-note
and checklist update evidence, structured runbook coverage, required command,
incident drill, operational decision, and reviewer rows with required rows
linked and reviewer decisions approved. The reviewer decision summary must also
include exact `Operator-ready claim allowed = yes` when that decision is yes.
It must include exact `Testnet production-candidate claim allowed = yes` when
that decision is yes.
Linked row payloads must also carry
completed runbook targets whose evidence cells state stop-condition and
verification-command checks,
command-specific output, actionable recovery outcomes, decision-specific
evidence, actionable stop conditions, Runbook operator identity binding, and
actionable reviewer notes that keep operator boundaries and do not approve open
incidents or non-opt-in broadcast enablement. The reviewer decision summary
must bind release support with exact
`Release supported = production deployment candidate`, operator-ready claim
handling with exact `Operator-ready claim allowed = yes`,
production-ready claim handling,
testnet production-candidate claim handling with exact
`Testnet production-candidate claim allowed = yes`, and critical incidents with
exact `Critical incidents open = 0` without
contradicting the validated publication decision. Operator publication-update fields must be
internally non-contradictory, so checklist prose, a bare
`operator:validate PASS` note, or a release-action sentence cannot authorize
the claim by itself. When these publication-update fields support production
deployment candidate operator readiness, they must include exact
`Release supported = production deployment candidate`. When these
publication-update fields block production-ready claims, they must include
exact `Production-ready claim allowed = no`. When these publication-update
fields allow operator-ready or testnet production-candidate wording, they must
include exact `Operator-ready claim allowed = yes` and exact
`Testnet production-candidate claim allowed = yes`. When these fields mention critical
incident closure, they must use exact numeric `Critical incidents open = 0`;
textual zero-like terms or numeric shorthand without `= 0` do not close the
operator publication-update evidence.
Standalone `operator readiness validation target`,
`operator validate target`, `validated target`, or `validated input` links bind
validator provenance only and cannot close runbook, command, drill, decision,
release-note, or checklist evidence rows by themselves; row-named non-concrete artifact
or Markdown targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`sample-evidence-*`, and `example-evidence-*` are not completed operator
readiness evidence. A Gate 6
`Operator readiness evidence` row marked `Checked` requires the same actual
`--operator-readiness-evidence` validation input and structured rows even when
the overall release remains blocked;
linked runbook, drill, and operational-decision evidence also fails closed on
failed validator or command markers, non-zero `exit code`, non-zero `errors`,
or non-zero `structural issues`, while still allowing expected operator
stop/block/recovery outcomes in the appropriate row fields;
A Gate 3 `Fresh local devnet lifecycle run` row marked `Checked` requires
`release:gate -- --local-live-rehearsal-evidence` to read the actual completed
local-devnet Live Rehearsal Evidence Markdown and the structured
`npm run rehearsal:validate` lifecycle rows, Session Metadata, Publication
Evidence, and Reviewer Sign-Off fields. The validated target must match the
linked completed local rehearsal document, and the structured rows must include
`Fresh local devnet lifecycle` status `pass`; Session Metadata must identify
`Environment: local devnet`; publication claim fields must remain `no`; and
Reviewer Sign-Off must be `pass` with no open publication blockers or follow-up
items. A generic artifact link, one passing row, validation-target-only row
link, or bare `rehearsal:validate PASS` note cannot close the row;
the same row must also receive an actual
`--local-settlement-profile-activation-json` report whose structured payload
passes validation and matches the rehearsal's exact profile tuple, activation
target, activation ID, environment, Ergo network, sidechain network, and Git
commit, with that commit equal to the clean-checkout candidate;
Markdown-level `Live-preflight artifact`, `/transactions/check` result, and
replacement-profile acceptance evidence PASS snippets must be internally positive and
fail closed on contradictory `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues` markers;
for testnet production-candidate claims,
`release:gate -- --live-rehearsal-evidence` must read the actual completed
Live Rehearsal Evidence Markdown document and that validated target must match
the linked completed live rehearsal target in the Fresh Ergo testnet lifecycle
row, with a distinct `npm run rehearsal:validate` output target bound to the
same completed rehearsal document. The completed live rehearsal validation must
expose all structured lifecycle rows from the validator, including a
`Fresh testnet lifecycle` row with status `pass` and gate-specific completed
evidence artifacts for passing rows, plus structured Session Metadata,
Publication Evidence, and Reviewer Sign-Off fields. Session Metadata must
identify `Environment: testnet`, positive Ergo testnet scope, allowed
non-mainnet sidechain scope, and disabled broadcast start/end state; Publication
Evidence must keep production-ready and testnet production-candidate fields
`no`; Reviewer Sign-Off must be `pass`, match Session Metadata reviewer, and
not predate Session Metadata Date. Checklist prose, a generic completed
artifact, row-named non-concrete artifact target, validation-target-only row
link, a single passing row, or a bare `rehearsal:validate PASS` note cannot
authorize Gate 3 closure or testnet production-candidate claims by itself.
The testnet row must also receive an actual
`--settlement-profile-activation-json` report with the same exact bindings.
Legacy V1 preparation and lifecycle evidence remains parseable historical
provenance but is never an activation report or Gate 3 authority.
Passing lifecycle row artifacts are also fail-closed when completed/PASS
wording appears with `FAIL`, `BLOCKED`, `ERROR`, non-zero `exit code`,
non-zero `errors`, or non-zero `structural issues`;
Gate 3 publication-update fields for completed release-note and checklist
evidence also fail closed on the same contradictory markers;
for testnet production-candidate claims,
all top-level structured JSON validation targets supplied to `release:gate`
for Gate 3 (`--settlement-profile-activation-json`, `--assembly-report-json`,
`--fresh-checkpoint-json`, `--live-preflight-json`,
`--post-submit-observe-json`, and repeated `--recovery-observe-json`) must be
concrete completed evidence targets; matching `generic-*`, `placeholder-*`,
`todo-*`, or `tbd-*` JSON names cannot authorize the claim by themselves;
legacy V1 aggregate-prebroadcast, rehearsal-preflight, testnet-window-prep,
offline-gate, and prep-bundle reports remain optional historical provenance.
They are not accepted as Gate 3 deciding inputs and cannot substitute for the
activated external-fee profile, exact target-node acceptance, on-chain funds
authority transition, or completed live lifecycle evidence;
for testnet production-candidate claims,
`rehearsal:validate -- --assembly-report-json` must run the canonical
`rehearsal:assemble` JSON validator, and
`release:gate -- --assembly-report-json` must also read the actual completed
structured assembly report JSON. That validated target must match the linked
completed assembly report JSON target in the Fresh Ergo testnet lifecycle row,
propagate structured `targetBindings`, `rehearsalValidation`, and validated
Markdown provenance, prove `Assembly status: post-submit evidence included`,
prove `Post-submit fragment: included`, prove assembled rehearsal validation
PASS with empty errors, full structured lifecycle rows, Session Metadata,
Publication Evidence, and Reviewer Sign-Off fields, preserve the
fresh-checkpoint publication-blocker status, require `targetBindings.draft` to
cite a concrete draft Markdown source
target instead of a validation/log/PASS summary, bind the same
Expected/submitted transaction ID, and match the linked live-preflight,
post-submit observe, and fresh-checkpoint JSON validation targets when those
validations are supplied, so a textual `rehearsal:assemble PASS` note and a
`.json` link in the checklist cannot authorize the claim by themselves; a
minimal embedded `rehearsalValidation` object with only `status: PASS` and empty
errors, or with lifecycle rows but without session/publication/reviewer fields,
is also insufficient. Assembly Markdown provenance is fail-closed when
included/completed markers appear beside `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues`;
for testnet production-candidate claims, `release:gate` also checks the
aggregate prebroadcast, fresh-checkpoint, live-preflight, post-submit observe,
and assembly-report JSON validations as one lifecycle set: all Expected
transaction IDs must match, and the post-submit and assembly submitted
transaction IDs must match that Expected transaction ID. The aggregate
prebroadcast claim `burnTxHash` order must also match live-preflight
`approvalBinding.burnTxHashes`, so the approved burn set cannot drift between
prebroadcast checking and the live-preflight approval boundary. A set of
individually passing JSON reports with divergent transaction or burn identity
remains blocked. The same lifecycle identity check also binds preflight and
window-prep package sidechain header hashes, bridge event roots, Ergo anchor
heights, and sidechain block heights back to aggregate prebroadcast claim order
when those claim fields are present;
for testnet production-candidate claims,
`release:gate -- --live-preflight-json` must also read the actual completed
external-fee live-preflight JSON report and that validated target must match the
linked completed external-fee live-preflight JSON target in the Fresh Ergo
testnet lifecycle row, bind `authenticated-external-fee-v1`, `ACTIVATED`,
`gate3-lifecycle-closure`, and the exact validated activation evidence target,
prove `runtimeBroadcastEnabled: false`, prove `targetBindings.rehearsal` binds
to the validated completed rehearsal, prove `targetBindings.approvals` names a
concrete external-fee authorization record, prove the transcript
binding is concrete evidence, prove every `preSubmitBoundary` flag remains
false, prove authorization evidence is linked/matched/emitted, prove
`approvalBinding.expectedTxId` matches the live-preflight Expected transaction
ID, prove `approvalBinding.command`, `approvalBinding.mode`, and
command-specific root/anchor fields are present, and require concrete
non-template JSON approval targets, so a textual legacy
`rehearsal:live-preflight PASS` note, a renamed legacy report, a `.json` link in
the checklist, or a `generic-*`, `placeholder-*`, `todo-*`,
`tbd-*`, `sample-evidence-*`, or `example-evidence-*` target cannot authorize
the claim by themselves;
for testnet production-candidate claims,
`release:gate -- --fresh-checkpoint-json` must also read the actual completed
fresh checkpoint JSON report and that validated target must match the linked
completed fresh checkpoint JSON target in the Fresh Ergo testnet lifecycle row,
with concrete read-only source provenance targets. The validation object must
also expose the structured `checkpoint` and `boundary` objects: lifecycle status
must remain `publication blocker`, Expected transaction ID must match the
dry-run/check result, singleton freshness must be `fresh` with `maxAgeSeconds =
900`, anchor observations must bind each expected bridge event root, height
evidence must remain non-broadcast, and every boundary field that could
authorize broadcast, Gate 3 closure, reconciliation, or claim escalation must
remain false. A textual `rehearsal:fresh-testnet-check PASS` note,
a `.json` link in the checklist, or a `template-*`, `example-*`, `sample-*`,
`generic-*`, `placeholder-*`, `todo-*`, or `tbd-*` JSON source target cannot
authorize the claim by themselves;
for testnet production-candidate claims,
`release:gate -- --post-submit-observe-json` must also read the actual
completed post-submit observe JSON report and that validated target must match
the linked completed post-submit observe JSON target in the Fresh Ergo testnet
lifecycle row. The validated report must expose the structured live-preflight
binding with matching root and `observation.livePreflightBinding` targets,
approved burn set, confirmation/finality artifact, and
read-only/no-broadcast/no-claim boundary summary, and must prove
`sourceBindings.state.targetClass = operator-provided-state-db` with no default
runtime database fallback or deployed-state singleton default lookup. It must also expose the
structured `observation` output shape: submitted/Expected transaction binding,
burn order, `settlementOutputs.boxIds`, SPV tracker successor at `OUTPUTS(0)`,
aggregate DUP successor at `OUTPUTS(1)`, recipient payouts at `OUTPUTS(2+i)` in
burn order, optional aggregate unlock change binding, and final miner fee
output, so a textual `rehearsal:post-submit:observe PASS` note and a `.json`
link in the checklist cannot authorize the claim by themselves;
for testnet production-candidate claims,
each `release:gate -- --recovery-observe-json` target must also read the actual
completed failed-broadcast and reorg recovery-observe JSON reports, validate
their read-only/no-claim `observationBoundary`, prove `sourceBindings.node`
uses live read-only node provenance, prove `sourceBindings.state` uses
read-only state-tracker provenance with target class
`operator-provided-state-db`, no default state database fallback, and no
serialized runtime paths, match the
linked completed observation artifact in the corresponding Gate 3 recovery row
outside the validation command-output segment, and expose the expected recovery
kind plus the required recovery identifiers (`expectedTxId` for
failed-broadcast and `singletonInventoryId` for reorg/stale-singleton), and
prove failed-broadcast aggregate attempt status/submittedTxId consistency
where submitted attempts bind `submittedTxId` to the expected transaction ID
and pending or abandoned attempts leave `submittedTxId` null, so a
validation target or textual `recovery-observe JSON validation PASS` note cannot
stand in for the completed observation JSON by itself. The recovery drill row
assembler also rejects non-concrete evidence, validation, and observation
artifact targets such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`,
`sample-evidence-*`, and `example-evidence-*`;
for testnet production-candidate claims,
`release:gate -- --backup-restore-evidence` must also read the actual completed
backup-restore Markdown evidence, run the structured backup-restore validator,
match the linked completed Gate 3 backup-restore evidence document outside the
validator command output segment, and consume
the validator's Required Commands, State Consistency Checks, Reconstructibility
Boundaries, Stop Conditions, Reviewer Sign-Off, Publication Evidence, and
snapshot provenance fields. Those rows must carry row-specific completed
payloads, including command output, measured state evidence, boundary evidence,
condition-specific stop resolutions, completed Gate 3 publication update
targets, and concrete reviewer outcome notes; generic `PASS`, `approved`,
`reviewed`, or `completed-pass` payloads cannot authorize the claim. Those
completed Gate 3 backup-restore release-note and checklist update targets must
preserve exact `Production-ready claim allowed by this drill: no` and
`Testnet production-candidate claim allowed by this drill: no` wording. Those
rows must cite completed row evidence separately from `backup-restore
validation target`, `backup validate target`, `validated target`, or
`validated input` bindings, which prove validator provenance but do not close
row evidence by themselves. Those
evidence cells and reviewer notes also fail closed when pass-like command,
validation, or approval notes are mixed with `FAIL`, `BLOCKED`, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`. The
backup-restore validator also rejects row-named non-concrete artifact targets
such as `generic-*`, `placeholder-*`, `todo-*`, `tbd-*`, `sample-evidence-*`,
and `example-evidence-*` in command, state, boundary, stop-condition,
publication-update, restore-target approval, and snapshot provenance evidence.
Snapshot provenance must expose distinct
pre-backup and restored JSON targets, a distinct `backup:compare` output
target, restored-after-pre-backup `generatedAt` ordering, `schemaVersion`, and
`snapshotSchemaVersions`, so a textual `backup:validate PASS` note and a `.md`
link that appears only as the validated target cannot authorize the claim by
themselves;
only validator-output targets before the validated-target binding count as
validator output artifacts, and those output artifacts must be concrete, so
later log links in binding notes or `generic-*` / `placeholder-*` validation
logs cannot make a reused or placeholder release-notes document distinct; a
validator-output segment that contains `PASS` but also carries `FAIL`,
`BLOCKED`, `ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` is treated as failing evidence;
`validated` release notes are sufficient for internal approval checks but not
for publication. `Release notes artifact` is evidence-hygiene scanned like
Required resolution cells; do not use local paths, file URLs, runtime databases,
credential-bearing links, or secret markers. A failing result is expected on
this branch until the structured evidence exists.

Until then, keep all publication language conservative.
