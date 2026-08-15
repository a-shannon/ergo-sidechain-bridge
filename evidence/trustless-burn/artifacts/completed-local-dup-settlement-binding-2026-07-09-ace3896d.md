# Completed Local DUP Settlement Binding - 2026-07-09 - ace3896d

This artifact records local source-boundary DUP replay binding for the same
non-mainnet Gate 5 trustless-burn instance bound by the current instance
refresh packet. It links the proof-derived burn identifier to the duplicate
prevention key carried by the unsigned settlement shape.

It is local offline source-boundary evidence only. It does not prove on-chain
DUP insertion, on-chain proof acceptance, sidechain finality, mined anchoring,
live SPV relay operation, settlement readiness, transaction check, signing,
submit, broadcast, release-gate PASS, testnet production-candidate status,
production readiness, or mainnet readiness.

## Source Evidence

| Source | Target |
|---|---|
| Instance binding | artifact://trustless-burn/gate5-trustless-burn-instance-binding-2026-07-09-ace3896d.md |
| Instance refresh | artifact://trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-09-ace3896d.md |
| Positive proof acceptance | artifact://trustless-burn/artifacts/completed-local-positive-proof-acceptance-2026-07-09-ace3896d.md |
| Unsigned transaction evidence | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json |
| Unsigned transaction validation | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md |
| Local settlement binding | artifact://trustless-burn/artifacts/completed-local-settlement-tx-binding-2026-07-06-a6b1c444.md |
| Proof-vector validation | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md |
| Proof-vector report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json |

## Bound Local DUP Facts

| Field | Value |
|---|---|
| DUP settlement binding result | linked |
| Binding field | duplicatePreventionKeyHex |
| Burn ID | burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Duplicate prevention key | duplicatePreventionKeyHex 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Burn-to-DUP equality | duplicatePreventionKeyHex equals burnId |
| Settlement identity source | trustless-burn-leaf |
| Settlement identity binding | unsigned settlement claim carries duplicatePreventionKeyHex in settlementIdentity |
| Bridge event root | bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Recipient binding | recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 |
| Amount binding | amountNanoErg 2000000 |
| Sidechain transaction hash | sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666 |
| Sidechain block hash | sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222 |
| Sidechain log index | sidechainLogIndex 8 |
| Unsigned claim count | claimCount 1 |
| Settlement shape | inputCount=3, outputCount=4, contextExtensionKeyCountsCsv=0,3,4 |
| Context extension guard | pass |
| Guard effective threshold | effectiveThreshold 4 |
| Guard offender count | offenderCount 0 |
| Signing permitted by guard | false |
| Broadcast permitted by guard | false |

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Unsigned settlement shape matched | yes |
| Local DUP replay binding recorded | yes |
| On-chain DUP insertion claimed | no |
| Transaction check performed | no |
| Expected transaction ID claimed | no |
| Transaction signing performed or authorized | no |
| Transaction submit or broadcast performed or authorized | no |
| Settlement reconciliation performed | no |
| On-chain proof acceptance claimed | no |
| Sidechain finality claimed | no |
| Mined Ergo anchor claimed | no |
| Gate 5 trustless-burn evidence claimed complete | no |
| Release gate PASS claimed | no |
| Testnet production-candidate claim support | no |
| Production-ready claim support | no |
| Mainnet-grade evidence linked | no |
