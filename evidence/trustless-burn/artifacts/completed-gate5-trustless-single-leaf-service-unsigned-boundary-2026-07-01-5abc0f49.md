# Completed Gate 5 Trustless Single-Leaf Service Unsigned Boundary Evidence - 2026-07-01 - base 5abc0f49

This artifact records a local Gate 5 prerequisite: the aggregate settlement
service can prepare a candidate-only V2 trustless single-leaf unsigned
transaction while preserving the no-sign/no-submit/no-broadcast boundary.

`relayer/src/aggregate-settlement-service.ts` exposes
`prepareTrustlessSingleLeafUnsignedTx`. The method reuses the trustless
settlement candidate planner, selects the SPV tracker singleton, aggregate DUP
singleton, and V2 trustless unlock liquidity box, verifies local AVL digest
bindings, assembles the unsigned transaction with
`buildTrustlessSingleLeafAggregateSettlementTx`, and returns a default
context-extension guard report.

This is source-boundary evidence only. The service method does not call
`/transactions/check`, does not derive or approve an expected transaction ID,
does not sign, does not submit, does not broadcast, does not update settlement
state, and does not close Gate 5. Under the default context-extension policy,
the V2 9-var unlock input is reported as blocked pending serialization
conformance evidence.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless single-leaf service unsigned boundary evidence |
| Base commit | 5abc0f49 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, source-boundary only |
| Reviewer | A. Shannon |
| Date | 2026-07-01 |

## Source Evidence

| Source | Binding |
|---|---|
| `relayer/src/aggregate-settlement-service.ts` | Adds service-level V2 unsigned preparation and default context-extension guard reporting. |
| `relayer/src/aggregate-settlement-tx.ts` | Provides the candidate-only unsigned V2 single-leaf transaction builder. |
| `relayer/src/aggregate-settlement-builder.ts` | Provides the trustless single-leaf extension and trustless candidate plan validation. |
| `relayer/src/context-extension-guard.ts` | Provides the default 4-var guard used for the service report. |
| `relayer/src/aggregate-settlement-service.test.ts` | Verifies unsigned preparation, box selection, V2 output shape, guard blocker, and no signer call. |
| `docs/trustless-burn-verification-plan.md` | Records the service-level no-check/no-sign/no-submit/no-broadcast boundary. |
| `docs/contract-relayer-api-reference.md` | Documents the service API surface and guardrail. |

## Command Evidence

| Field | Value |
|---|---|
| Command | `npm test -- --run src/aggregate-settlement-service.test.ts -t "V2 trustless single-leaf unsigned tx" --cache=false` |
| Runtime | Node 24 pinned local runtime |
| Result | PASS |
| Exit code | 0 |
| Test files | 1 passed |
| Tests | 1 passed |
| Skipped tests | 37 skipped by focused filter |
| Broadcast, submit, deploy, or state mutation | no |

## Boundary Findings

| Finding | Evidence |
|---|---|
| The service can assemble a V2 trustless single-leaf unsigned candidate from source boxes. | `aggregate-settlement-service.test.ts` verifies tracker, aggregate DUP, V2 unlock box selection, and unsigned transaction shape. |
| The method returns the default context-extension guard blocker. | The focused test verifies `status = blocked`, `effectiveThreshold = 4`, and `INPUTS(2)` with 9 Vars. |
| The signer path remains out of scope. | The focused test installs a signer that throws if called and the method completes without invoking it. |
| The evidence remains candidate-only. | The returned trustless candidate evidence preserves `gate5Closure = no`, `prebroadcastEvidence = no`, `settlementReadiness = no`, and production/testnet claim boundaries. |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Trustless burn verification implemented | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open = 0 | no |
| `/transactions/check` proof | no |
| Expected transaction ID binding | no |
| Signing/check/submission path wired | no |
| Transaction broadcast | no |
| Settlement readiness | no |
| Live or non-mainnet rehearsal | no |
| Independent review | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
