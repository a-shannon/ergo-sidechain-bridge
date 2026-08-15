# Gate 6 MCU Phase 2 SCS Boundary Evidence - 2026-06-27 - b046f5e3

This artifact records public source-boundary evidence for the Gate 6
MCU Phase 2 scope row and the negative-check row
"MCU references stale SCS NFT after SCS redeploy".

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
| Evidence kind | completed MCU Phase 2 source-boundary evidence |
| Git commit inspected | b046f5e3 |
| Contract source | `contracts/MainChainUnlock.es` |
| Integration reference | `docs/contract-relayer-api-reference.md` |
| Runtime execution | none |
| Contract compilation | not completed; `npm run contracts:check` was not used as completed evidence |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, signing, or state mutation performed | no |

## Observed Public Invariant

| Check | Observation | Source |
|---|---|---|
| Normal Phase 2 authority | MainChainUnlock comments state that after sufficient SideChainState confirmations anyone can spend the MCU box to deliver ERG to the recipient. | `contracts/MainChainUnlock.es` |
| SCS DataInput binding | Normal Phase 2 reads SideChainState as `CONTEXT.dataInputs(0)` and requires the DataInput token at index 0 to equal the compile-time `sideChainStateNftId`. | `contracts/MainChainUnlock.es` |
| Compile-time SCS NFT binding | MainChainUnlock defines `sideChainStateNftId = fromBase16("SCS_NFT_ID_PLACEHOLDER")`, so the SCS NFT identity is compiled into the contract source after placeholder replacement. | `contracts/MainChainUnlock.es`, `relayer/src/scripts/deploy.ts` |
| Confirmation condition | Normal Phase 2 also requires SideChainState height to be at least the burn height plus the confirmation depth, alongside recipient and amount checks. | `contracts/MainChainUnlock.es` |
| Reviewer-facing contract note | The integration reference says this path is permissionless after sidechain confirmation, and that the SCS NFT placeholder must be recompiled after SCS redeploy. | `docs/contract-relayer-api-reference.md` |

## Gate 6 Negative Evidence

| Field | Value |
|---|---|
| Negative-check row | MCU references stale SCS NFT after SCS redeploy |
| Expected result | blocked |
| Evidence result | MCU stale SCS NFT after redeploy rejection is recorded at the source boundary: normal Phase 2 requires `stateBox.tokens(0)._1` to equal the compile-time `sideChainStateNftId`, and SCS redeploy changes the NFT that must be compiled into a refreshed MCU. |
| Scope row | MCU Phase 2 path |
| Current authority | permissionless PoC Phase 2 path |
| Target authority | unchanged until Phase 011 |
| Claim boundary | This source-boundary artifact is preparation evidence only and does not replace a completed Gate 6 drill, contract compilation evidence, key-rotation evidence, external review, or release-gate PASS evidence. |
