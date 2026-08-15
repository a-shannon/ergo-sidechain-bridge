# Completed Gate 5 Local Negative Row Evidence - Reorged Sidechain Block - 2026-06-26 - 247a84b1

This artifact records row-level local verifier evidence for the Gate 5
negative-test row "Reorged sidechain block". It does not close Gate 5,
authorize settlement, authorize broadcast, or support production-ready, mainnet,
or testnet production-candidate claims.

No wallet recovery material, signing credential material, deployment state,
private runtime database state, or live transaction evidence was read or used.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 local negative reorged sidechain block evidence |
| Git commit | 247a84b1 |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local verifier only |
| Reviewer | A. Shannon |
| Date | 2026-06-26 |

## Command Evidence

| Command | Result | Evidence boundary |
|---|---|---|
| `npm test -- --run src/peg-out-burn-verifier.test.ts -t "canonical block hash mismatches"` | PASS; 1 test file; 1 test passed; 12 skipped; exit code 0 | Local verifier test only; no node, wallet, broadcast, settlement, or runtime database access |

## Row Binding

| Field | Value |
|---|---|
| Negative-test row | Reorged sidechain block |
| Expected result | rejected |
| Rejected burnId | 0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76 |
| Rejected receipt transaction hash | 1111111111111111111111111111111111111111111111111111111111111111 |
| Receipt sidechain block hash | 2222222222222222222222222222222222222222222222222222222222222222 |
| Canonical sidechain block hash | 5555555555555555555555555555555555555555555555555555555555555555 |
| Observed verifier error | burn receipt block hash does not match canonical sidechain block |

## Boundary

| Boundary | Value |
|---|---|
| Local verifier evidence only | true |
| Gate 5 closure | false |
| Settlement readiness | false |
| Broadcast authorization | false |
| Production claim support | false |
| Testnet production-candidate claim support | false |
