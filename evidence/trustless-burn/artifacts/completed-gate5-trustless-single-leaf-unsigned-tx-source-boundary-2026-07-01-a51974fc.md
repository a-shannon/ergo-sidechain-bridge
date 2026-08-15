# Completed Gate 5 Trustless Single-Leaf Unsigned TX Source-Boundary Evidence - 2026-07-01 - base a51974fc

This artifact records a local Gate 5 prerequisite: the relayer can assemble the
candidate-only unsigned transaction shape for the V2 single-leaf trustless
aggregate unlock contract.

`relayer/src/aggregate-settlement-tx.ts` exposes
`buildTrustlessSingleLeafAggregateSettlementTx`. The builder accepts only
`candidate-only-trustless-v2-required` aggregate settlement plans, requires the
V2 `mainChainAggregateUnlockTrustless` deployment handle, preserves the SPV
tracker and aggregate DUP successor output order, pays the recipient from the
trustless unlock box, returns optional change to the V2 trustless unlock tree,
and uses `buildTrustlessSingleLeafAggregateUnlockExtension` for the nine-slot
unlock input extension expected by `contracts/MainChainAggregateUnlockTrustless.es`.

This is unsigned source-boundary evidence only. The default context-extension
guard still rejects the 9-var trustless unlock input until patched-stack
serialization conformance evidence exists. The builder does not check, sign,
approve, submit, broadcast, deploy, mutate runtime state, or close Gate 5.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless single-leaf unsigned TX source-boundary evidence |
| Base commit | a51974fc |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, source-boundary only |
| Reviewer | A. Shannon |
| Date | 2026-07-01 |

## Source Evidence

| Source | Binding |
|---|---|
| `contracts/MainChainAggregateUnlockTrustless.es` | Defines the V2 single-leaf trustless aggregate unlock input/output and ContextExtension layout. |
| `relayer/src/aggregate-settlement-builder.ts` | Builds the nine-slot V2 trustless unlock extension and rejects leaf/root/recipient/amount/asset drift. |
| `relayer/src/aggregate-settlement-tx.ts` | Adds unsigned V2 single-leaf transaction assembly for candidate-only trustless plans. |
| `relayer/src/config.ts` | Adds the optional `mainChainAggregateUnlockTrustless` deployment handle type used by the unsigned builder. |
| `relayer/src/aggregate-settlement-tx.test.ts` | Verifies successful unsigned V2 single-leaf transaction assembly and legacy-plan rejection. |
| `relayer/src/context-extension-guard.test.ts` | Verifies the default guard rejects the V2 9-var unlock input. |
| `docs/trustless-burn-verification-plan.md` | Records the unsigned assembly boundary and remaining Gate 5 blockers. |
| `docs/contract-relayer-api-reference.md` | Documents the relayer API surface and no-check/no-submit/no-broadcast boundary. |

## Command Evidence

| Field | Value |
|---|---|
| Command | `npm test -- --run src/aggregate-settlement-tx.test.ts src/context-extension-guard.test.ts -t "V2 trustless" --cache=false` |
| Runtime | Node 24 pinned local runtime |
| Result | PASS |
| Exit code | 0 |
| Test files | 2 passed |
| Tests | 3 passed |
| Skipped tests | 72 skipped by focused filter |
| Broadcast, submit, deploy, or state mutation | no |

## Boundary Findings

| Finding | Evidence |
|---|---|
| Candidate-only V2 trustless plans can be assembled into an unsigned transaction shape. | `aggregate-settlement-tx.test.ts` verifies three inputs, tracker/DUP/payout/change/fee outputs, and balanced nanoERG value. |
| Legacy aggregate plans cannot use the V2 trustless builder. | `aggregate-settlement-tx.test.ts` rejects `legacy-aggregate-v1` plans before box data is consumed. |
| The V2 unlock input remains blocked by the default context-extension guard. | `context-extension-guard.test.ts` verifies `INPUTS(2)` has 9 Vars and `assertContextExtensionSafe` rejects it. |
| Gate 5 remains blocked. | Generalized Merkle inclusion proof verification, finality/anchor evidence, on-chain acceptance, live/non-mainnet rehearsal, publication updates, and independent review remain open. |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Trustless burn verification implemented | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open = 0 | no |
| Generalized Merkle inclusion proof verification | no |
| Signing/check/submission path wired | no |
| Mined Ergo extension anchoring | no |
| Ergo-verifiable sidechain finality authority | no |
| Live SPV relay operation | no |
| Live or non-mainnet rehearsal | no |
| Independent review | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
