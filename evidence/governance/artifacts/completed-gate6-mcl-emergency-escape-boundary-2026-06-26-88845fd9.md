# Gate 6 MCL Emergency Escape Boundary Evidence - 2026-06-26 - 88845fd9

This artifact records public source-boundary evidence for the Gate 6
MainChainLock emergency escape scope row and the negative-check row
"MCL emergency escape path is accidentally committee-gated".

It is not completed Gate 6 committee governance evidence. It does not close
Gate 6, authorize key rotation, authorize deployment, authorize signing,
authorize settlement, authorize transaction broadcast, or support governance
ready, testnet production-candidate, production-ready, or mainnet wording.

No deployment-state file, runtime database, wallet material, mnemonic, private
key, dotenv file, node state, live transaction, or private operator record was
read or used.

## Source Boundary

| Field | Value |
|---|---|
| Evidence kind | completed MCL emergency escape source-boundary evidence |
| Git commit inspected | 88845fd9 |
| Contract source | `contracts/MainChainLock.es` |
| Integration reference | `docs/contract-relayer-api-reference.md` |
| Runtime execution | none |
| Contract compilation | not completed; `npm run contracts:check` could not connect to the local Ergo node at `localhost:9052` |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Observed Public Invariant

| Check | Observation | Source |
|---|---|---|
| Normal path | `committeeSpend` is the committee-authorized branch. | `contracts/MainChainLock.es` |
| Emergency path | `emergencyEscape` depends on elapsed timeout, depositor output, and returned amount. | `contracts/MainChainLock.es` |
| Branch combination | The contract combines normal spend and emergency refund as `committeeSpend || sigmaProp(emergencyEscape)`. | `contracts/MainChainLock.es` |
| Reviewer-facing contract note | The integration reference says the normal path is committee spend and the emergency path spends after timeout to the depositor output. | `docs/contract-relayer-api-reference.md` |

## Gate 6 Negative Evidence

| Field | Value |
|---|---|
| Negative-check row | MCL emergency escape path is accidentally committee-gated |
| Expected result | blocked |
| Evidence result | MCL emergency escape committee-gated path blocked by the public source boundary: the timeout refund branch is separate from `committeeSpend` and returns funds to the depositor output. |
| Scope row | MainChainLock emergency escape path |
| Current authority | permissionless after timeout |
| Target authority | unchanged permissionless after timeout |
| Claim boundary | This source-boundary artifact is preparation evidence only and does not replace a completed Gate 6 drill, contract compilation evidence, key-rotation evidence, external review, or release-gate PASS evidence. |
