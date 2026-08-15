# Gate 6 Signer-Gated Scope Source-Boundary Evidence - 2026-06-27 - 8ccf894a

This artifact records public source-boundary evidence for the Gate 6 signer-gated
scope rows that can be checked from repository contract sources without reading
deployment state or private runtime state.

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
| Evidence kind | completed Gate 6 signer-gated scope source-boundary evidence |
| Git commit inspected | 8ccf894a |
| Contract source scope | `contracts/SideChainState.es`; `contracts/DoubleUnlockPrevention.es`; `contracts/DoubleUnlockPreventionAggregate.es`; `contracts/DoubleUnlockPreventionAggregateBatch.es`; `contracts/MainChainLock.es`; `contracts/SPVTracker.es` |
| Contract source change check | `git diff --quiet 306f898d..HEAD -- ergo-sidechain-bridge/contracts` returned no contract-source diff |
| Prior compile evidence | `artifact://governance/artifacts/npm-run-contracts-check-pass-2026-06-27-306f898d.md` recorded `npm run contracts:check` PASS exit code 0 for the unchanged contract sources |
| Runtime execution | none |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Observed Public Invariant

| Surface | Observation | Source |
|---|---|---|
| SideChainState successor authorization | The public source builds `committeeOk` with `atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)`, requires the successor to preserve the singleton NFT, proposition bytes, value, and `R9[SigmaProp]` authorization metadata, and gates the state update with `&& committeeOk`. | `contracts/SideChainState.es` |
| DUP authorization | The public source builds `committeeOk` with `atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)`, requires the successor to preserve the singleton NFT, proposition bytes, value, and `R6[SigmaProp]` authorization metadata, and gates the AVL insert update with `&& committeeOk`. | `contracts/DoubleUnlockPrevention.es` |
| Aggregate DUP authorization | The aggregate public source uses the same `atLeast` committee guard and authorization metadata preservation while binding the aggregate DUP successor at `OUTPUTS(1)`. | `contracts/DoubleUnlockPreventionAggregate.es` |
| Batch DUP authorization | The batched aggregate public source uses the same `atLeast` committee guard and authorization metadata preservation while validating batched burn TX ID insertions. | `contracts/DoubleUnlockPreventionAggregateBatch.es` |
| MainChainLock normal path | The public source defines the normal path as `committeeSpend = committeeOk`, with `committeeOk` built from `atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)`. The emergency path remains separately covered by prior source-boundary evidence. | `contracts/MainChainLock.es` |
| SPVTracker ingest authorization | The public source reads `SELF.R6[SigmaProp]` as the committee authorization proposition, requires the successor to preserve that proposition, and gates tracker updates with `&& committeePk`. | `contracts/SPVTracker.es` |

## Gate 6 Scope Evidence

| Field | Value |
|---|---|
| Scope rows | SideChainState successor authorization; DUP authorization; Aggregate DUP authorization; Batch DUP authorization; MainChainLock normal path; SPVTracker ingest authorization |
| Evidence result | The signer-gated scope source boundary is recorded for the current public contract templates. |
| Current authority boundary | Source-level committee guard shape is visible in the public contract templates; deployed authority identity is outside this source-boundary artifact. |
| Target authority boundary | Real authority transition still requires concrete committee identifiers, key-rotation drill evidence, signer behavior evidence, singleton continuity evidence, network reconciliation, rollback evidence, external review, and reviewer approvals before any governance-ready claim. |
| Claim boundary | This source-boundary artifact is preparation evidence only and does not replace a completed Gate 6 drill, live deployment evidence, key-rotation evidence, external review, or release-gate PASS evidence. |
