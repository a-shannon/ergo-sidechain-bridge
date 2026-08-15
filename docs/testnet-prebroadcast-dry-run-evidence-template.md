# Testnet Pre-Broadcast Dry-Run Evidence Template

Use this template to capture unsigned legacy V1 shape diagnostics or preserve
an immutable pre-quarantine Ergo testnet package. It cannot open a current live
broadcast window. It does not close Gate 3. It does not authorize transaction broadcast
and is not valid as `Fresh testnet lifecycle | pass` evidence.

Do not paste `.env` contents, seed phrases, signing secret material, API
secrets, local user paths, raw diagnostic files, or private wallet data.

## Scope Statement

- Evidence package name:
- Date:
- Operator:
- Reviewer:
- Git commit:
- Environment: testnet
- Ergo node network: testnet
- Sidechain network:
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Gate 3 closure claimed: no
- Testnet production-candidate claim allowed: no
- Mainnet production-ready claim allowed: no

`Ergo node network` must positively identify testnet and must not include
negated or mixed-network wording such as `not testnet`, `not on testnet`, `not
using testnet`, `not connected to testnet`, `no testnet`, `without testnet`,
`mainnet`, `main network`, `main chain`, or `mainchain`.

`Sidechain network` must identify `patched-devnet`, `testnet`, or an explicit
non-mainnet sidechain network. It must not be blank, generic, mainnet, mixed
with mainnet, or negated testnet wording such as `not testnet` or `not connected
to testnet`. This field documents dry-run scope only; it does not authorize
broadcast, close Gate 3, or change any claim-control field from `no`.

## Required Command Artifacts

Record command names, pass/fail status, and artifact targets. Link completed
logs or evidence files; do not paste secret-bearing command output.

```bash
cd relayer
npm run check
npm run wasm:test
npm run demo:readiness
npm run status
```

- `npm run check` artifact:
- `npm run wasm:test` artifact:
- `npm run demo:readiness` artifact:
- `npm run status` artifact:
- ContextExtension guard result: artifact/log that identifies the
  ContextExtension guard, sigma-rust/JVM conformance coverage, and fail-closed
  behavior:
- Broadcast policy result: must prove broadcast is disabled or refused, for
  example `Broadcast policy: broadcast disabled` or
  `BRIDGE_BROADCAST_ENABLED=false`; it must not include contradictory enabled
  or approved broadcast markers such as `BRIDGE_BROADCAST_ENABLED=true`,
  `broadcast enabled`, or live approval language:
- Clean deployment state evidence: clean deployment state,
  deployment-state hash=<32-byte hex>, contract IDs=<32-byte hex>,
  singleton inventory=<32-byte hex>:
- Current Ergo height: <height> artifact://...
- Current sidechain height: <height> artifact://...

Stop if any command fails unexpectedly, if the ContextExtension guard is not
fail-closed, or if readiness indicates live settlement signing is unsafe.

## Dry-Run Settlement Shape

This section has two allowed uses: current unsigned legacy V1 diagnostics, or
read-only inspection of an immutable pre-quarantine V1 record. Current
`prepare*` output is no-check, no-sign, no-authority, no-submit, and
no-broadcast evidence only. It cannot fill the historical Expected transaction
ID or `/transactions/check` rows in this template.

Any retained aggregate check JSON belongs to an exact pre-quarantine legacy V1
transaction and is immutable historical provenance. The read-only helper below
may inspect such an existing file, but it must not be used to refresh evidence,
renew approvals, or support a new lifecycle claim:

```bash
cd relayer
npm run prebroadcast:from-json -- ../evidence/testnet-prebroadcast/<aggregate-check>.json --link-target <aggregate-check>.json
```

`Current Ergo height` and `Current sidechain height` must start with
non-negative integers and include completed node/RPC height artifact markers or
non-template evidence links. `Sidechain block height` must not exceed
`Current sidechain height`; `Ergo anchor height` must not exceed
`Current Ergo height`.
The retired E2E execution commands and retired aggregate check, signing,
authorization, submission, and transport commands are physically absent. Do
not cite their historical spellings in a current package. Historical
`confirm*` commands remain only for an exact transaction proven submitted
before quarantine and must also be absent from pre-broadcast artifacts. Current
`prepare*` commands expose unsigned shape diagnostics only. Advancing a new
package requires a separately versioned, reviewed, and activated external-fee
profile plus profile-specific target-node acceptance tooling; no such command
is provided by this template.
The completed package is scanned as a whole; do not hide live
broadcast-capable commands, `BRIDGE_BROADCAST_ENABLED=true`, enabled broadcast
markers, live approval markers, submit attempts, mempool observations, runtime
mutations, or staged runtime files in notes, sign-off text, or lifecycle
guidance.
Dry-run, command-artifact, and reviewer sign-off rows must also stay free of
positive live-action markers such as `BRIDGE_BROADCAST_ENABLED=true`, live
broadcast approval, submitted commands, mempool observation, confirmed-history
mutation, or staged runtime files.

- Peg-in event ID or TX ID: <32-byte hex> plus completed artifact target:
- Peg-out burn TX ID:
- Sidechain block height:
- Sidechain block hash:
- Bridge event root:
- Bridge event roots: for batch evidence, list ordered roots one-to-one with the
  ordered aggregate claims and attach a completed artifact target:
- Ergo anchor height:
- Aggregate claim count:
- Input count:
- Output count:
- ContextExtension key counts per input:
- `/transactions/check` result: `N/A - retired legacy V1 route` for every
  current diagnostic package. An exact historical result may be cited only
  from immutable pre-quarantine evidence and cannot be refreshed or promoted.
- Expected transaction ID: `N/A - unsigned diagnostic` for current output, or
  the exact immutable historical ID for a transaction proven submitted before
  quarantine.
- Daemon approval preparation: `N/A - no current legacy V1 approval path`.
  Historical approval files remain parser inputs only and cannot authorize a
  current action.

For immutable historical evidence, the peg-in event/transaction ID, peg-out
burn TX ID, sidechain block hash, bridge event roots, and Expected transaction
ID must preserve the original distinct identities. Current unsigned diagnostics
must not invent placeholders for unavailable historical fields.

Stop if the prepared transaction ID, ContextExtension shape, singleton state, or
AVL digest differs from the linked dry-run evidence.

## Non-Broadcast Attestation

Each field must start with the required `false`, `unset`, or `no` value and
include a completed artifact target or non-template evidence link.

- `BRIDGE_BROADCAST_ENABLED` state at start: false / unset artifact://...
- `BRIDGE_BROADCAST_ENABLED` state at end: false / unset artifact://...
- Live broadcast approval recorded: no artifact://...
- Submit command attempted: no artifact://...
- Mempool transaction observed: no artifact://...
- Local DUP confirmed-history mutation performed: no artifact://...
- Local SPV/AVL confirmed-history mutation performed: no artifact://...
- Runtime state files staged: no artifact://...

If any answer above differs from the expected value, stop and move the session
to incident classification before linking this package anywhere.
Do not append contradictory enabled/live-action markers to these rows; `no` or
`false` rows that also mention `BRIDGE_BROADCAST_ENABLED=true`, live broadcast
approval, submitted transactions, mempool observation, confirmed-history
mutation, or staged runtime files are invalid.

## Lifecycle Linkage Guidance

- `Fresh testnet lifecycle`: blocked for legacy V1; unsigned diagnostics and
  historical records cannot close it.
- `Settlement submit evidence`: unavailable for a new legacy V1 transaction.
- `Confirmation evidence` and `Reconciliation evidence`: historical only for
  an exact transaction proven submitted before quarantine.
- `Settlement check evidence`: historical only; no current legacy V1
  `/transactions/check` evidence may be generated.

The required next implementation is a separately versioned external-fee
profile with application-bound source finality, global DUP cutover lineage,
chain-resident setup/admission state, target-node acceptance, and permanent
legacy-route retirement. Only that profile can define a future live rehearsal.

## Publication Control

- Release notes updated for this dry-run package: yes / no
- Pending Evidence Register updated for this dry-run package: yes / no
- Gate 3 checklist row closed by this package: no
- Production-ready claim allowed by this package: no
- Testnet production-candidate claim allowed by this package: no

This package can preserve diagnostic or historical provenance, but it cannot
remove the publication blockers for replacement-profile activation, target-node
acceptance, a complete lifecycle, recovery, review, or final CI evidence.
The claim-control fields above must remain dedicated `no` fields and must not
be repeated with `= yes` or `: yes` wording elsewhere in the package.

Validate a completed copy only as unsigned diagnostic or immutable historical
evidence:

```bash
cd relayer
npm run prebroadcast:validate -- ../evidence/testnet-prebroadcast/<completed-testnet-prebroadcast-dry-run-evidence>.md
npm run prebroadcast:doctor -- ../evidence/testnet-prebroadcast/<completed-testnet-prebroadcast-dry-run-evidence>.md --json-out ../evidence/live-rehearsals/<prebroadcast-doctor>.json
```

The blank template is expected to fail validation. A passing validator or
doctor report proves only that the bounded document is internally structured;
it never creates a signing, node-check, approval, submission, transport, or
funds-release capability. Legacy rehearsal helpers may parse immutable archived
artifacts, but they are not a handoff to a current execution window.

## Reviewer Sign-Off

- Classification: pass / fail / inconclusive
- Stop conditions discovered:
- Follow-up replacement-profile rehearsal required: yes
- Follow-up recovery drill required:
- Reviewer:
- Date:

Reviewer must match the Scope Statement reviewer. Date must use `YYYY-MM-DD`
and must not be before the Scope Statement date.
