# Gate 5 Local Settlement Transaction Binding Evidence

This artifact records a local source-boundary settlement transaction binding for
the current compact trustless unsigned transaction evidence. It links the
unsigned transaction settlement identity to the same burn proof instance used by
the Gate 5 SPV-linked candidate.

This artifact does not authorize public claims, release claims, settlement
readiness, transaction checks, expected transaction IDs, signing, submit,
broadcast, DUP insertion, on-chain proof acceptance, testnet
production-candidate status, production-ready status, or mainnet readiness.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, node RPC state, or live
transaction evidence was read or used.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 local settlement transaction binding |
| Git commit | a6b1c444 |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path |
| Reviewer | A. Shannon |
| Date | 2026-07-06 |

## Source Evidence

| Source | Target |
|---|---|
| Unsigned transaction evidence | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-06-0dc0abc1.json |
| Unsigned transaction validation report | artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-06-0dc0abc1.md |
| Instance binding report | artifact://trustless-burn/gate5-trustless-burn-instance-binding-2026-07-06-0dc0abc1.md |
| Instance refresh report | artifact://trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-06-0dc0abc1.md |
| Proof-vector report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-06-fecc11eb.json |
| Recipient tree binding | artifact://trustless-burn/artifacts/completed-gate5-recipient-ergo-tree-hash-binding-2026-07-06-39bfec72.md |
| Inclusion path binding | artifact://trustless-burn/artifacts/completed-gate5-inclusion-path-binding-2026-07-06-39bfec72.md |

## Settlement Binding

| Field | Value |
|---|---|
| Binding field | settlementTxBinding |
| Unsigned transaction claim count | 1 |
| Settlement transaction binding | settlement identity is sourced from the trustless burn leaf and binds the proof instance into the unsigned settlement shape |
| Settlement payout binding | recipientErgoTreeHash and amountNanoErg are carried in settlementIdentity and match the proof-vector burn leaf |
| Duplicate prevention binding | duplicatePreventionKeyHex equals derivedBurnIdHex |
| Burn ID | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Duplicate prevention key | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Bridge event root | 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Recipient ErgoTree hash | dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 |
| Amount nanoERG | 2000000 |
| Asset ID | 0000000000000000000000000000000000000000000000000000000000000000 |
| Sidechain transaction hash | 6666666666666666666666666666666666666666666666666666666666666666 |
| Sidechain block hash | 2222222222222222222222222222222222222222222222222222222222222222 |
| Event index | 8 |
| Settlement shape | inputCount=3, outputCount=4, contextExtensionKeyCountsCsv=0,3,4 |
| Context extension guard | pass |

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Unsigned transaction evidence validated | yes |
| Gate 5 trustless burn closure claimed | no |
| Pre-broadcast evidence claimed | no |
| Transaction-check evidence claimed | no |
| Expected transaction ID evidence claimed | no |
| Signed transaction evidence claimed | no |
| DUP insertion evidence claimed | no |
| On-chain proof acceptance claimed | no |
| Settlement readiness claimed | no |
| Testnet production-candidate claim support | no |
| Production-ready claim support | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, reconcile, or state mutation performed | no |
