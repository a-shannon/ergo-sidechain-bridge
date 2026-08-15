# Completed Gate 5 Inclusion Path Binding Evidence - 2026-07-06 - 39bfec72

This artifact captures the local proof-core prerequisite for the Gate 5
`inclusionPath` binding. It records the structured proof node used by the
recipient-tree local proof-vector validation report and the fail-closed
malformed inclusion-path negative case. It does not prove mined Ergo extension
anchoring, sidechain finality, live SPV tracker operation, on-chain proof
acceptance, DUP settlement insertion, testnet production-candidate readiness,
production readiness, mainnet readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 inclusion path binding evidence |
| Git commit | 39bfec72 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-07-06 |

## Source Evidence

| Source | Binding |
|---|---|
| Proof-vector validation evidence | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-06-39bfec72.md |
| Proof-vector validation report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-06-fecc11eb.json |
| Malformed-inclusion-path negative evidence | artifact://trustless-burn/artifacts/completed-gate5-negative-malformed-inclusion-path-2026-06-26-174d4cfb.md |
| Command evidence | `npm run trustless:proof-vector:validate -- test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json --json-out <report.json>` |
| Command result | PASS / exit code 0 |
| Review mode | local offline read-only |
| Signing material used | no |
| Transaction broadcast | no |
| Runtime database state used | no |
| Private deployment state used | no |

## Burn Proof Binding

| Field | Value |
|---|---|
| Binding field | `inclusionPath` |
| bridgeEventRoot | `701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9` |
| proofNodeCount | `1` |
| proof[0].side | `left` |
| proof[0].hashHex | `2c109937d8c0b176a74f5df14a900158a469c03ee963296be38fd9f704781c66` |
| Source path | `reports[0].proof[0]` |
| Binding rule | burn inclusion proof resolves to bridgeEventRoot in local proof-core validation |
| Negative-case binding | `malformed-inclusion-path` rejected with `burn inclusion proof must resolve to bridgeEventRoot` |
| Local proof-core boundary | true |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Mined Ergo extension anchoring | no |
| Sidechain finality authority | no |
| On-chain proof acceptance | no |
| DUP settlement insertion | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
