# Completed Gate 5 Local Negative Row Evidence - Wrong Ergo Anchor Height - 2026-06-26 - 247a84b1

This artifact records row-level local anchor-validation evidence for the Gate 5
negative-test row "Wrong Ergo anchor height". It does not close Gate 5,
authorize settlement, authorize broadcast, or support production-ready, mainnet,
or testnet production-candidate claims.

No wallet recovery material, signing credential material, deployment state,
private runtime database state, or live transaction evidence was read or used.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 local negative wrong Ergo anchor height evidence |
| Git commit | 247a84b1 |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local anchor validation only |
| Reviewer | A. Shannon |
| Date | 2026-06-26 |

## Command Evidence

| Command | Result | Evidence boundary |
|---|---|---|
| `npm test -- --run src/aggregate-anchor.test.ts -t "root is absent"` | PASS; 1 test file; 1 test passed; 17 skipped; exit code 0 | Local anchor-validation test only; no node, wallet, broadcast, settlement, or runtime database access |

## Row Binding

| Field | Value |
|---|---|
| Negative-test row | Wrong Ergo anchor height |
| Expected result | rejected |
| Rejected bridgeEventRoot | c4740365cf82fb50b350d1ace62a48b411539643cf7f343b2ce2c1f71e2e23ca |
| Rejected burn transaction hash | 5555555555555555555555555555555555555555555555555555555555555555 |
| Wrong Ergo anchor height | 50000 |
| Observed anchor-validation result | invalid |
| Observed validator condition | extension fields were read successfully, but the expected 0x0401 bridgeEventRoot was absent at the persisted Ergo anchor height |

## Boundary

| Boundary | Value |
|---|---|
| Local anchor-validation evidence only | true |
| Gate 5 closure | false |
| Settlement readiness | false |
| Broadcast authorization | false |
| Production claim support | false |
| Testnet production-candidate claim support | false |
