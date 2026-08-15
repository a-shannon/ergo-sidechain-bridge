# Gate 3 Recovery Drill Prerequisite Map - 2026-07-02 - d0429db9

This packet maps the remaining Gate 3 recovery-drill rows to the exact
read-only observation, validation, row-assembly, rehearsal assembly, and
release-gate binding steps.

It is not completed recovery-drill evidence. It does not close Gate 3, prove
recovery was executed, authorize repair, authorize live submit, authorize
broadcast, or support production-ready, mainnet, or testnet
production-candidate claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, or live transaction evidence was read or used for
this packet.

The current `rehearsal:recovery-observe` command requires an explicit
operator-provided `--state-db` target for read-only state observation. It does
not open a default runtime database when `--state-db` is omitted, and completed
recovery-observe JSON must bind `sourceBindings.state.targetClass` to
`operator-provided-state-db`.

## Recovery Drill Scope

| Drill | Current status | Required runtime observation | Required completed targets |
|---|---|---|---|
| Failed broadcast / phantom AVL evidence | Pending evidence | Read-only node/state observation proving the Expected transaction ID is absent from confirmed chain and mempool, the aggregate attempt is pending/submitted/abandoned consistently, the peg-out burn is bound, and no DUP AVL key was inserted | completed recovery-observe JSON, recovery-observe validation transcript, completed recovery row, completed live rehearsal evidence, rehearsal validation transcript |
| Reorged burn / stale singleton evidence | Pending evidence | Read-only node/state observation proving a recoverable stale singleton candidate, singleton inventory key presence before recovery, peg-out burn binding, pending AVL key, and stale phase1 box ID | completed recovery-observe JSON, recovery-observe validation transcript, completed recovery row, completed live rehearsal evidence, rehearsal validation transcript |

## Required Command Sequence

Capture the failed-broadcast observation:

```bash
npm run rehearsal:recovery-observe -- --kind failed-broadcast-phantom-avl --expected-tx-id <expected-transaction-id-64hex> --peg-out-burn-tx-id <peg-out-burn-tx-id-64hex> --node-url <read-only-testnet-node-url> --state-db <operator-read-only-state-db> --json-out ../evidence/live-rehearsals/<failed-broadcast-observe.json>
```

Validate the failed-broadcast observation:

```bash
npm run rehearsal:recovery-observe:validate -- --kind failed-broadcast-phantom-avl ../evidence/live-rehearsals/<failed-broadcast-observe.json>
```

Create the failed-broadcast rehearsal row:

```bash
npm run rehearsal:recovery-drill -- --kind failed-broadcast-phantom-avl --evidence-artifact artifact://live-rehearsal/<failed-broadcast-row.md> --validation-artifact artifact://live-rehearsal/<rehearsal-validate.log> --observation-artifact artifact://live-rehearsal/<failed-broadcast-observe.json> --observation-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --expected-tx-id <expected-transaction-id-64hex> --peg-out-burn-tx-id <peg-out-burn-tx-id-64hex> --out ../evidence/live-rehearsals/<failed-broadcast-row.md> --json-out ../evidence/live-rehearsals/<failed-broadcast-row-report.json>
```

Capture the reorg/stale-singleton observation:

```bash
npm run rehearsal:recovery-observe -- --kind reorged-burn-stale-singleton --peg-out-burn-tx-id <peg-out-burn-tx-id-64hex> --singleton-inventory-id <singleton-inventory-id-64hex> --node-url <read-only-testnet-node-url> --state-db <operator-read-only-state-db> --json-out ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json>
```

Validate the reorg/stale-singleton observation:

```bash
npm run rehearsal:recovery-observe:validate -- --kind reorged-burn-stale-singleton ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json>
```

Create the reorg/stale-singleton rehearsal row:

```bash
npm run rehearsal:recovery-drill -- --kind reorged-burn-stale-singleton --evidence-artifact artifact://live-rehearsal/<reorg-stale-singleton-row.md> --validation-artifact artifact://live-rehearsal/<rehearsal-validate.log> --observation-artifact artifact://live-rehearsal/<reorg-stale-singleton-observe.json> --observation-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json> --peg-out-burn-tx-id <peg-out-burn-tx-id-64hex> --singleton-inventory-id <singleton-inventory-id-64hex> --out ../evidence/live-rehearsals/<reorg-stale-singleton-row.md> --json-out ../evidence/live-rehearsals/<reorg-stale-singleton-row-report.json>
```

Assemble the completed live rehearsal candidate with both recovery rows:

```bash
npm run rehearsal:assemble -- --draft ../evidence/live-rehearsals/<draft-live-rehearsal.md> --live-preflight ../evidence/live-rehearsals/<live-preflight.json> --fresh-checkpoint ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --failed-broadcast ../evidence/live-rehearsals/<failed-broadcast-row.md> --reorg-recovery ../evidence/live-rehearsals/<reorg-stale-singleton-row.md> --post-submit ../evidence/live-rehearsals/<post-submit-observe.json> --out ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.md> --json-out ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.json>
```

Validate the completed live rehearsal with both recovery-observe reports:

```bash
npm run rehearsal:validate -- --transcript artifact://live-rehearsal/<rehearsal-validate.log> --assembly-report-json ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.json> --live-preflight-json ../evidence/live-rehearsals/<live-preflight.json> --post-submit-observe-json ../evidence/live-rehearsals/<post-submit-observe.json> --prep-bundle-json ../evidence/live-rehearsals/<prep-bundle.json> --preflight-json ../evidence/live-rehearsals/<rehearsal-preflight.json> --window-prep-json ../evidence/live-rehearsals/<window-prep.json> --fresh-checkpoint-json ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --aggregate-prebroadcast-json ../evidence/testnet-prebroadcast/<aggregate-check.json> --recovery-observe-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json> --report-out ../evidence/rehearsal/artifacts/<rehearsal-validation-report.md> ../evidence/live-rehearsals/<completed-live-rehearsal.md>
```

Bind the same completed live rehearsal and recovery-observe reports to the
release gate:

```bash
npm run release:gate -- --live-rehearsal-evidence ../evidence/live-rehearsals/<completed-live-rehearsal.md> --assembly-report-json ../evidence/live-rehearsals/<assembled-live-rehearsal-candidate.json> --live-preflight-json ../evidence/live-rehearsals/<live-preflight.json> --post-submit-observe-json ../evidence/live-rehearsals/<post-submit-observe.json> --prep-bundle-json ../evidence/live-rehearsals/<prep-bundle.json> --preflight-json ../evidence/live-rehearsals/<rehearsal-preflight.json> --window-prep-json ../evidence/live-rehearsals/<window-prep.json> --fresh-checkpoint-json ../evidence/live-rehearsals/<fresh-testnet-checkpoint.json> --aggregate-prebroadcast-json ../evidence/testnet-prebroadcast/<aggregate-check.json> --recovery-observe-json ../evidence/live-rehearsals/<failed-broadcast-observe.json> --recovery-observe-json ../evidence/live-rehearsals/<reorg-stale-singleton-observe.json>
```

## Observation Boundary Checklist

| Boundary | Required value |
|---|---|
| observationBoundary.readOnlyObservationOnly | true |
| observationBoundary.nodeQueryPerformed | true |
| observationBoundary.stateReadPerformed | true |
| observationBoundary.signingPerformed | false |
| observationBoundary.broadcastAuthorized | false |
| observationBoundary.liveSubmitPerformed | false |
| observationBoundary.confirmationObserved | false |
| observationBoundary.nodeMutationPerformed | false |
| observationBoundary.repairPerformed | false |
| observationBoundary.stateMutationPerformed | false |
| observationBoundary.reconciliationPerformed | false |
| observationBoundary.gate3ClosureAllowed | false |
| observationBoundary.productionReadyClaimAllowed | false |
| observationBoundary.testnetProductionCandidateClaimAllowed | false |

## Source Binding Checklist

| Source | Required binding |
|---|---|
| Node source | `sourceBindings.node.sourceType = live-read-only-node`; read-only true; no auth header; node height and network match node observation; no URL, local path, runtime file, or secret material serialized |
| State source | `sourceBindings.state.sourceType = read-only-state-tracker`; read-only true; runtimePathSerialized false; target class is `operator-provided-state-db`; no default state database fallback; no local path, runtime file, or secret material serialized |

## Current Blockers

| Blocker | Status |
|---|---|
| Failed-broadcast recovery-observe JSON | not captured |
| Failed-broadcast recovery-observe validation transcript | not captured |
| Failed-broadcast recovery row artifact | not captured |
| Reorg/stale-singleton recovery-observe JSON | not captured |
| Reorg/stale-singleton recovery-observe validation transcript | not captured |
| Reorg/stale-singleton recovery row artifact | not captured |
| Completed live rehearsal evidence containing both recovery rows | not captured |
| Distinct rehearsal validation transcript | not captured |
| Release-gate run binding both recovery-observe JSON targets | not captured |
