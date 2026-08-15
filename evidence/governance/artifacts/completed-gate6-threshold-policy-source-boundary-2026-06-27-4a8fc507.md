# Gate 6 Threshold Policy Source-Boundary Evidence - 2026-06-27 - 4a8fc507

This artifact records public source-boundary evidence for the Gate 6 threshold
policy prerequisite that can be checked without reading deployment state,
private runtime state, wallet material, or signing material.

It is not completed Gate 6 committee governance evidence. It does not close
Gate 6, authorize key rotation, authorize deployment, authorize signing,
authorize settlement, authorize transaction broadcast, or support
governance-ready, testnet production-candidate, production-ready, or mainnet
wording.

No deployment-state file, runtime database, wallet material, mnemonic, private
key, dotenv file, node state, live transaction, or private operator record was
read or used.

## Source Boundary

| Field | Value |
|---|---|
| Evidence kind | completed Gate 6 threshold-policy source-boundary evidence |
| Git commit inspected | 4a8fc507 |
| Governance model inspected | Phase 010a atLeast multisig |
| m/n threshold policy | 2/3 |
| Quorum | 2 committee members |
| Committee member count | 3 |
| Member-loss tolerance | 1 unavailable member still leaves quorum 2-of-3 |
| Lost-key tolerance | 1 unavailable key still leaves quorum 2-of-3 |
| Runtime execution | none |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Threshold Boundary

| Check | Observation |
|---|---|
| Threshold minimum | Threshold 2 is greater than one signer and blocks single-signer authority for the Phase 010a committee model. |
| Threshold below committee size | Threshold 2 is lower than member count 3, so one member/key can be unavailable while quorum remains possible. |
| Threshold claim limit | This source-boundary evidence records the policy arithmetic only; it does not prove signer behavior, key possession, key rotation, singleton continuity, deployment-state reconciliation, rollback, or external review. |
| Broadcast boundary | The evidence was produced without node requests, signing, deployment, state mutation, or transaction broadcast. |

## Gate 6 Evidence Use

| Field | Value |
|---|---|
| Rotation row | Validate threshold policy |
| Evidence result | The Gate 6 threshold-policy prerequisite is recorded for the Phase 010a 2-of-3 committee model. |
| Remaining required evidence | Real Gate 6 committee governance closure still requires concrete old and new committee identifiers, member-loss simulation, old/new signer behavior checks, singleton continuity checks, deployment-state reconciliation, rollback evidence, publication updates, external review, and reviewer approvals before any governance-ready claim. |
