# Phase 010a Committee Guard Prep - 2026-06-25 - 6b2e4ff1

This packet records the current non-broadcast prerequisite status for Gate 6
committee governance and key-rotation evidence.

It is not completed Gate 6 committee governance evidence. It does not support
mainnet production readiness, testnet production-candidate readiness,
governance-ready claims, or completed key-rotation claims.

## Run Classification

| Field | Value |
|---|---|
| Evidence scope | committee governance prerequisite |
| Git commit | 6b2e4ff1 |
| Release level supported | institutional reference prerequisite only |
| Environment | local offline with missing local node |
| Broadcast mode | disabled |
| Governance model | Phase 010a atLeast multisig prerequisite |
| Committee threshold | not evaluated in this prep packet |
| Committee member count | not evaluated in this prep packet |
| Node version | v24.14.0 |
| npm version | 11.16.0 |
| Date | 2026-06-25 |

## Command Status

| Command | Result | Evidence | Gate 6 status |
|---|---|---|---|
| node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts | BLOCKED / exit code 1 | artifact://governance/artifacts/phase010a-committee-guard-node-unavailable-2026-06-25-6b2e4ff1.md | prerequisite blocker |
| npm run contracts:check | not run | requires deployed contract state review before evidence capture | blocker |
| npm run demo:readiness | not run | requires deployed contract state review before evidence capture | blocker |
| npm run status | not run | requires runtime database and deployed contract state review before evidence capture | blocker |
| npm run check | not linked as Gate 6 evidence in this packet | full repository verification belongs to commit verification, not this incomplete Gate 6 target | pending |
| npm run wasm:test | not linked as Gate 6 evidence in this packet | full repository verification belongs to commit verification, not this incomplete Gate 6 target | pending |

## What The Attempt Proves

The Phase 010a spike script was selected because its source states that it does
not use secret wallet material, does not use the node wallet, and does not
broadcast transactions. Its intended scope is contract compilation plus
synthetic transaction signing and rejection checks for SCS, DUP, Aggregate DUP,
and MCL.

The attempted run did not reach that evaluation boundary because the local Ergo
node endpoint was unavailable. No committee threshold, key rotation,
member-loss tolerance, old-signer rejection, deployment-state reconciliation,
or completed reviewer decision was observed.

## Claim Boundary

Allowed by this prep packet:

- Gate 6 has a precise local-node availability blocker for the Phase 010a
  non-broadcast guard evaluation.
- The current safe command route for Phase 010a guard-shape evaluation is known.
- Commands that touch deployed contract state or runtime database state remain
  separated from this no-secrets evidence capture.

Not allowed by this prep packet:

- Governance-ready claims.
- Production-ready claims.
- Testnet production-candidate claims.
- Completed committee/key-rotation evidence.
- A claim that an actual 2-of-3 or larger committee has operated the bridge.
- A claim that old keys, non-committee keys, or below-policy thresholds were
  rejected by a completed Gate 6 drill.
- A claim that deployment-state reconciliation, release-note updates,
  checklist updates, or external review evidence is complete.

## Remaining Gate 6 Blockers

Gate 6 remains blocked until a completed committee governance evidence document
links command-specific completed evidence for each required command and passes
`npm run governance:validate`.

Known blockers for completed Gate 6 evidence:

- Start or configure a non-secret local or testnet Ergo node endpoint for the
  non-broadcast Phase 010a spike.
- Rerun the Phase 010a spike and capture PASS exit code 0 command output.
- Capture actual 2-of-3 or stronger committee identifiers with old/new key
  separation and no secret signing material.
- Prove positive new-committee signer-gated mutation behavior.
- Prove threshold member-loss tolerance.
- Prove old-signer, non-committee, and below-policy threshold rejection.
- Capture contract compilation evidence under an approved deployed-state review
  procedure.
- Capture demo readiness and bridge status evidence without exposing runtime
  databases or restricted contract-state records.
- Link completed Gate 6 release-note update evidence.
- Link completed Gate 6 checklist update evidence.
- Link completed Gate 6 external review evidence.
- Record reviewer approvals with governance-specific notes.
- Run `npm run governance:validate` on the completed Gate 6 evidence target.
- Run `release:gate -- --governance-evidence <completed-target>` with zero
  structural issues for the same completed target.
