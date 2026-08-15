# Gate 6 Member-Loss Threshold Safety Source-Boundary Evidence - 2026-06-29 - 442a1b08

This artifact records public source-boundary evidence for the Gate 6
member-loss and lost-key threshold safety prerequisite. It is a prerequisite
artifact only; it is not a runtime signer drill and it does not replace
positive new-committee operation evidence.

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
| Evidence kind | completed Gate 6 member-loss threshold safety source-boundary evidence |
| Git commit inspected | 442a1b08 |
| Governance model inspected | Phase 010a atLeast multisig |
| m/n threshold policy | 2/3 |
| Quorum | 2 committee members |
| Committee member count | 3 |
| Member-loss tolerance | 1 unavailable member still leaves quorum 2-of-3 |
| Lost-key tolerance | 1 unavailable key still leaves quorum 2-of-3 |
| Runtime execution | none |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Threshold Safety Observation

| Check | Observation |
|---|---|
| Single-signer resistance | Threshold 2 is greater than one signer, so the policy does not authorize a single-signature committee path. |
| Member-loss feasibility | With 3 committee members and quorum 2, one unavailable member still leaves enough members to satisfy the policy. |
| Lost-key feasibility | With 3 committee keys and quorum 2, one unavailable key still leaves enough keys to satisfy the policy. |
| Runtime drill boundary | This artifact does not prove that a concrete new committee controls keys or can sign a mutation after rotation. Those checks remain separate positive signer-behavior evidence. |

## Gate 6 Evidence Use

| Field | Value |
|---|---|
| Rotation row | Simulate member loss or lost-key tolerance |
| Evidence result | The Gate 6 member-loss and lost-key threshold safety prerequisite is recorded for the Phase 010a 2-of-3 committee model. |
| Remaining required evidence | Real Gate 6 committee governance closure still requires concrete old and new committee identifiers, signer behavior checks, singleton continuity checks, deployment-state reconciliation, rollback evidence, publication updates, external review, and reviewer approvals before any governance-ready claim. |
