# Completed Gate 5 Amount NanoERG Binding Evidence - 2026-06-29 - 8bb23dcb

This artifact captures the local proof-core prerequisite for the Gate 5
`amountNanoErg` binding. It records the exact positive nanoERG amount present
in the completed local proof-vector validation report and the fail-closed
wrong-amount negative case. It does not prove sidechain finality, live SPV
tracker operation, on-chain proof acceptance, DUP settlement insertion, testnet
production-candidate readiness, production readiness, mainnet readiness, or
broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 amount nanoERG binding evidence |
| Git commit | 8bb23dcb |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Binding |
|---|---|
| Proof-vector validation evidence | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md |
| Proof-vector validation report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Wrong-amount negative evidence | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-amount-2026-06-26-174d4cfb.md |
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
| Binding field | `amountNanoErg` |
| amountNanoErg | `2000000` |
| Source path | `reports[0].leaf.amountNanoErg` and `reports[0].amountNanoErg` |
| Negative-case binding | `wrong-amount` rejected with `settlement amount must equal proved amountNanoErg` |
| Local proof-core boundary | true |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Sidechain finality authority | no |
| On-chain proof acceptance | no |
| DUP settlement insertion | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
