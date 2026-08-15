# Completed Gate 5 Duplicate-Prevention Key Binding Evidence - 2026-06-29 - b8968c16

This artifact captures the local proof-core prerequisite for the Gate 5
`duplicatePreventionKey` binding. It records the exact duplicate-prevention key
consumed by the completed local proof-vector validation report and binds it to
the burn identifier. It does not prove DUP settlement insertion, on-chain proof
acceptance, live SPV tracker operation, testnet production-candidate readiness,
production readiness, mainnet readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 duplicate-prevention key binding evidence |
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
| Binding field | `duplicatePreventionKey` |
| duplicatePreventionKey | `548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f` |
| burnId | `548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f` |
| Source path | `reports[0].duplicatePreventionKeyHex` |
| Negative-case binding | `wrong-duplicate-prevention-key` rejected with `duplicatePreventionKey must equal burnId` |
| Local proof-core boundary | true |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| DUP settlement insertion | no |
| On-chain proof acceptance | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
