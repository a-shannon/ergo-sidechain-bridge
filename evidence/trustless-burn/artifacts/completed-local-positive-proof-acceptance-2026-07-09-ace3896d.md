# Completed Local Positive Proof Acceptance - 2026-07-09 - ace3896d

This artifact records local positive proof-core acceptance for the same
non-mainnet Gate 5 trustless-burn instance bound by the current instance
refresh packet.

It is local offline source-boundary evidence only. It does not prove on-chain
Ergo contract acceptance, sidechain finality, mined anchoring, live SPV relay
operation, DUP insertion on-chain, settlement readiness, signing, submit,
broadcast, release-gate PASS, testnet production-candidate status, production
readiness, or mainnet readiness.

## Source Evidence

| Source | Target |
|---|---|
| Instance binding | artifact://trustless-burn/gate5-trustless-burn-instance-binding-2026-07-09-ace3896d.md |
| Instance refresh | artifact://trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-09-ace3896d.md |
| Proof-vector validation | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md |
| Proof-vector report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json |
| Unsigned transaction evidence | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json |
| Unsigned transaction validation | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md |
| Local settlement binding | artifact://trustless-burn/artifacts/completed-local-settlement-tx-binding-2026-07-06-a6b1c444.md |

## Accepted Local Proof-Core Facts

| Field | Value |
|---|---|
| Positive proof result | accepted |
| Burn proof acceptance | local proof-core burn proof accepted with PASS / exit code 0 |
| Inclusion proof acceptance | local inclusion proof resolves to bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Burn ID | burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Duplicate prevention binding | duplicatePreventionKey 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f equals burnId |
| Settlement transaction binding | settlement transaction binding carries the accepted burn proof into the unsigned settlement shape |
| Settlement payout binding | payout recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 and amountNanoErg 2000000 match the accepted burn proof |
| Sidechain transaction hash | sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666 |
| Sidechain block hash | sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222 |
| Event index | eventIndex 8 |
| Context extension guard | pass |

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Local proof-core acceptance recorded | yes |
| Unsigned settlement shape matched | yes |
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
