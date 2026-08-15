# Completed Gate 5 Local Negative Row Evidence - Reused Burn ID - 2026-06-26 - 174d4cfb

This artifact records row-level local proof-core evidence for the Gate 5
negative-test row "Reused burn ID". It does not close Gate 5, authorize
settlement, authorize broadcast, or support production-ready, mainnet, or
testnet production-candidate claims.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 local negative reused burn ID evidence |
| Git commit | 174d4cfb |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-26 |

## Source Evidence

| Source | Value |
|---|---|
| Proof-vector validation artifact | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md |
| Proof-vector JSON report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-25-a5462960.json |
| Proof-vector command | npm run trustless:proof-vector:validate |

## Row Binding

| Field | Value |
|---|---|
| Negative-test row | Reused burn ID |
| Expected result | rejected |
| Rejected burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Local Proof Vector negativeCase | wrong-burn-id |
| Observed proof-core error | burnId must equal derived sidechain event identity |
| Local Proof Vector negativeCase | wrong-event-index |
| Observed proof-core error | burnId must equal derived sidechain event identity |
| Local Proof Vector negativeCase | wrong-duplicate-prevention-key |
| Observed proof-core error | duplicatePreventionKey must equal burnId |

## Boundary

| Boundary | Value |
|---|---|
| Local proof-core evidence only | true |
| Gate 5 closure | false |
| Settlement readiness | false |
| Broadcast authorization | false |
| Production claim support | false |
| Testnet production-candidate claim support | false |
