# Completed Gate 5 Settlement Transaction Binding Evidence - 2026-06-29 - ce197edd

This artifact captures the local proof-core prerequisite for the Gate 5
`settlementTxBinding` row. It records that the settlement payout identity used
by the proof-core evidence is bound to the proved burn recipient and amount
before duplicate-prevention insertion.

It is not completed Gate 5 trustless-burn evidence. It does not prove
sidechain finality, mined Ergo anchoring, on-chain proof acceptance, DUP
settlement insertion, accepted settlement transaction construction, testnet
production-candidate readiness, production readiness, mainnet readiness, or
broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 settlement transaction binding evidence |
| Git commit | ce197edd |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Binding |
|---|---|
| Recipient binding evidence | artifact://trustless-burn/artifacts/completed-gate5-recipient-ergo-tree-hash-binding-2026-06-29-8bb23dcb.md |
| Amount binding evidence | artifact://trustless-burn/artifacts/completed-gate5-amount-nanoerg-binding-2026-06-29-8bb23dcb.md |
| Duplicate-prevention key binding evidence | artifact://trustless-burn/artifacts/completed-gate5-duplicate-prevention-key-binding-2026-06-29-b8968c16.md |
| Inclusion path binding evidence | artifact://trustless-burn/artifacts/completed-gate5-inclusion-path-binding-2026-06-29-8bb23dcb.md |
| Proof-vector validation evidence | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md |
| Proof-vector validation report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Wrong-recipient negative evidence | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-recipient-2026-06-26-174d4cfb.md |
| Wrong-amount negative evidence | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-amount-2026-06-26-174d4cfb.md |
| Reused-burn-ID negative evidence | artifact://trustless-burn/artifacts/completed-gate5-negative-reused-burn-id-2026-06-26-174d4cfb.md |
| Command evidence | `npm run trustless:proof-vector:validate -- test-vectors/trustless-burn-proof-v1-multi-leaf.json --json-out <report.json>` |
| Command result | PASS / exit code 0 |
| Review mode | local offline read-only |
| Signing material used | no |
| Transaction broadcast | no |
| Runtime database state used | no |
| Private deployment state used | no |

## Burn Proof Binding

| Field | Value |
|---|---|
| Binding field | `settlementTxBinding` |
| burnId | `548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f` |
| duplicatePreventionKey | `548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f` |
| bridgeEventRoot | `1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb` |
| recipientErgoTreeHash | `8888888888888888888888888888888888888888888888888888888888888888` |
| amountNanoErg | `2000000` |
| Settlement payout binding | settlement payout recipient and amount are checked against the proved `recipientErgoTreeHash` and `amountNanoErg` before duplicate-prevention identity is accepted |
| Negative-case binding | `wrong-recipient`, `wrong-amount`, and `wrong-duplicate-prevention-key` reject mismatched settlement payout or DUP identity inputs |
| Local proof-core boundary | true |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Sidechain finality authority | no |
| Mined Ergo extension anchoring | no |
| On-chain proof acceptance | no |
| Accepted settlement transaction construction | no |
| DUP settlement insertion | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
