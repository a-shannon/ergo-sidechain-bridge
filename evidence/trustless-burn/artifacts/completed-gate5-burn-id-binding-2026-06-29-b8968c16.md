# Completed Gate 5 Burn ID Binding Evidence - 2026-06-29 - b8968c16

This artifact captures the local proof-core prerequisite for the Gate 5
`burnId` binding. It records the exact burn identifier consumed by the
completed local proof-vector validation report. It does not prove sidechain
finality, live SPV tracker operation, on-chain proof acceptance, DUP settlement
insertion, testnet production-candidate readiness, production readiness,
mainnet readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 burn ID binding evidence |
| Git commit | b8968c16 |
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
| Binding field | `burnId` |
| burnId | `548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f` |
| Source path | `reports[0].leaf.burnIdHex` |
| Negative-case binding | `wrong-burn-id` rejected with `burnId must equal derived sidechain event identity` |
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
