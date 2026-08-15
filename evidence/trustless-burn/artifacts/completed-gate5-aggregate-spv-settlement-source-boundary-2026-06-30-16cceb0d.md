# Completed Gate 5 Aggregate SPV Settlement Source-Boundary Evidence - 2026-06-30 - 16cceb0d

This artifact captures a local source-boundary prerequisite for Gate 5. It
records what the current aggregate SPV settlement implementation proves today
and, equally, what it does not prove.

The current V1 aggregate settlement path verifies an SPV tracker lookup, DUP
update, finality guard, legacy single-event event-root preimage, and payout
recipient/amount binding for aggregate settlement. It does not yet verify the
bridge-native trustless burn leaf in the on-chain aggregate contracts. The
trustless-burn candidate path is explicitly candidate-only until V2 settlement
contracts verify bridge-native burn leaves.

This is not completed Gate 5 trustless-burn evidence. It does not prove mined
Ergo extension anchoring, Ergo-verifiable sidechain finality authority, live SPV
relay operation, on-chain trustless burn proof acceptance, DUP insertion for a
bridge-native trustless burn leaf, release support, testnet production-candidate
readiness, production readiness, mainnet readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, environment files, or live
transaction evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 aggregate SPV settlement source-boundary evidence |
| Git commit | 16cceb0d |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, source-boundary only |
| Reviewer | A. Shannon |
| Date | 2026-06-30 |

## Source Evidence

| Source | Binding |
|---|---|
| `contracts/SPVTracker.es` | Stores accepted sidechain commitments as AVL key/value entries and supports no-ingest aggregate settlement while preserving the tracker digest and latest sidechain height. |
| `contracts/DoubleUnlockPreventionAggregate.es` | Inserts the same 32-byte burn transaction identifier into the aggregate DUP successor at `OUTPUTS(1)`, because `OUTPUTS(0)` is reserved for the SPV tracker successor. |
| `contracts/MainChainAggregateUnlock.es` | Verifies tracker NFT, aggregate DUP NFT, tracker membership proof, 10-block anchor finality guard, V1 event-root preimage, DUP insert proof, and `OUTPUTS(2)` recipient/amount payout binding. |
| `relayer/src/aggregate-settlement-builder.ts` | Marks trustless-burn-leaf settlement identities as `candidate-only-trustless-v2-required` and emits a warning that V2 contracts are still required. |
| `relayer/src/aggregate-settlement-tx.ts` | Rejects aggregate transaction assembly unless the plan is `legacy-aggregate-v1`. |
| `relayer/src/aggregate-settlement-service.ts` | Produces read-only trustless settlement candidate evidence only when the plan is `candidate-only-trustless-v2-required`. |
| `relayer/src/aggregate-settlement-tx.test.ts` | Verifies the legacy aggregate root remains distinct from the trustless burn `bridgeEventRoot`, rejects candidate-only trustless plans before legacy TX assembly, and verifies no-ingest and same-TX ingest aggregate payout transaction shapes. |
| `relayer/src/aggregate-settlement-evidence.test.ts` | Verifies read-only trustless candidate evidence boundaries, contract compatibility, duplicate-prevention derivation, and rejection of approval, submit, broadcast, or transaction-check readiness fields. |

## Command Evidence

| Field | Value |
|---|---|
| Command | `npm test -- --run src/aggregate-settlement-tx.test.ts src/aggregate-settlement-evidence.test.ts --cache=false` |
| Runtime | Node 24 pinned local runtime |
| Result | PASS |
| Exit code | 0 |
| Test files | 2 passed |
| Tests | 37 passed |
| Broadcast, submit, deploy, or state mutation | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Environment file read | no |

## Boundary Findings

| Finding | Evidence |
|---|---|
| Current aggregate SPV settlement binds tracker lookup, finality, DUP update, and payout fields for V1 aggregate settlement. | `MainChainAggregateUnlock.es`, `SPVTracker.es`, `DoubleUnlockPreventionAggregate.es`, `aggregate-settlement-tx.test.ts` |
| Current aggregate transaction assembly is not bridge-native trustless burn proof acceptance. | `aggregate-settlement-tx.ts` rejects non-`legacy-aggregate-v1` plans. |
| Trustless burn candidate evidence remains read-only and candidate-only. | `aggregate-settlement-service.ts` and `aggregate-settlement-evidence.test.ts` require `candidate-only-trustless-v2-required` and all claim boundaries set to `no`. |
| V2 contract work remains required before this can support Gate 5 closure. | `aggregate-settlement-builder.ts` warning: trustless settlement identity is candidate-only until aggregate settlement contracts verify bridge-native burn leaves. |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Trustless burn verification implemented | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open = 0 | no |
| Mined Ergo extension anchoring | no |
| Ergo-verifiable sidechain finality authority | no |
| Live SPV relay operation | no |
| On-chain trustless burn proof acceptance | no |
| DUP settlement insertion for bridge-native trustless burn leaf | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
