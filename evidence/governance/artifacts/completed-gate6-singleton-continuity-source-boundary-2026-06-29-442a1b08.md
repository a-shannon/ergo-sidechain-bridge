# Gate 6 Singleton Continuity Source-Boundary Evidence - 2026-06-29 - 442a1b08

This artifact records public source-boundary evidence for the Gate 6 singleton
continuity prerequisite that can be checked from repository contract sources
without reading deployment state or private runtime state.

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
| Evidence kind | completed Gate 6 singleton continuity source-boundary evidence |
| Git commit inspected | 442a1b08 |
| Contract source scope | `contracts/SideChainState.es`; `contracts/DoubleUnlockPrevention.es`; `contracts/DoubleUnlockPreventionAggregate.es`; `contracts/DoubleUnlockPreventionAggregateBatch.es`; `contracts/SPVTracker.es` |
| Prior scope evidence | `artifact://governance/artifacts/completed-gate6-signer-gated-scope-source-boundary-2026-06-27-8ccf894a.md` |
| Runtime execution | none |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Observed Public Invariant

| Surface | Singleton continuity observation | Source |
|---|---|---|
| SideChainState | The successor preserves the singleton NFT identifier, proposition bytes, authorization metadata register `R9`, and value. | `contracts/SideChainState.es` |
| DUP | The successor preserves the singleton NFT identifier, proposition bytes, authorization metadata register `R6`, and value. | `contracts/DoubleUnlockPrevention.es` |
| Aggregate DUP | The successor preserves the singleton NFT identifier and amount, proposition bytes, authorization metadata register `R6`, and value. | `contracts/DoubleUnlockPreventionAggregate.es` |
| Batch DUP | The successor preserves the singleton NFT identifier and amount, proposition bytes, authorization metadata register `R6`, and value. | `contracts/DoubleUnlockPreventionAggregateBatch.es` |
| SPVTracker | The successor preserves the Tracker NFT identifier and amount, proposition bytes, committee authorization register `R6`, and value. | `contracts/SPVTracker.es` |

## Gate 6 Evidence Use

| Field | Value |
|---|---|
| Rotation row | Preserve singleton continuity |
| Evidence result | The Gate 6 singleton NFT, script, value, and register continuity prerequisite is recorded at the public source boundary. |
| Runtime boundary | This artifact does not prove deployed singleton identity, concrete network reconciliation, or actual key rotation. Those checks remain separate Gate 6 evidence. |
| Remaining required evidence | Real Gate 6 committee governance closure still requires concrete old and new committee identifiers, signer behavior checks, deployment-state reconciliation, rollback evidence, publication updates, external review, and reviewer approvals before any governance-ready claim. |
