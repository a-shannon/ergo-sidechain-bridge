# Completed Gate 5 Trustless Single-Leaf Contract Source-Boundary Evidence - 2026-07-01 - a3daf814

This artifact captures a local source-boundary prerequisite for Gate 5. It
records the first V2 aggregate settlement contract surface for bridge-native
trustless burn leaves and the boundaries that still block release evidence.

`contracts/MainChainAggregateUnlockTrustless.es` verifies the single-leaf
trustless burn case where the SPV tracker `bridgeEventRoot` is the canonical
leaf hash for one encoded bridge-native burn leaf. The contract source binds
the SPV tracker key to the leaf sidechain ID, sidechain height, and sidechain
block hash, then binds the canonical burn ID derivation, recipient ErgoTree
hash, amount, ERG asset lane, payout output, and DUP insertion to the same
leaf.

This is not completed Gate 5 trustless-burn evidence. It does not prove
generalized Merkle inclusion proof verification, deployed V2 transaction
assembly, mined Ergo extension anchoring, Ergo-verifiable sidechain finality
authority, live SPV relay operation, live/non-mainnet rehearsal, independent
review, release support, testnet production-candidate readiness, production
readiness, mainnet readiness, or broadcast authorization.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless single-leaf contract source-boundary evidence |
| Git commit | a3daf814 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, source-boundary only |
| Reviewer | A. Shannon |
| Date | 2026-07-01 |

## Source Evidence

| Source | Binding |
|---|---|
| `contracts/MainChainAggregateUnlockTrustless.es` | Adds the single-leaf bridge-native burn-leaf aggregate payout guard and keeps transaction shape explicit. |
| `relayer/src/scripts/compile-contracts.ts` | Adds the trustless contract source to the compile-check list and uses check-only NFT placeholders without deployment-state reads in `--check` mode. |
| `relayer/src/contract-invariants.test.ts` | Verifies the trustless contract source binds encoded leaf, SPV tracker key derivation, canonical burn ID derivation, recipient hash, amount, asset lane, event root, DUP key, and payout output. |
| `docs/trustless-burn-verification-plan.md` | Records that this is a source-boundary prerequisite and not completed Gate 5 evidence. |

## Boundary Findings

| Finding | Evidence |
|---|---|
| Single-leaf bridge-native burn leaf can be expressed directly in ErgoScript source. | `MainChainAggregateUnlockTrustless.es` computes `blake2b256("E2S_TRUSTLESS_BURN_LEAF_V1" ++ encodedLeaf)` and compares it to the tracker event root. |
| The tracker key is leaf-bound. | `MainChainAggregateUnlockTrustless.es` derives `E2S_SPV_V1` from the leaf sidechain ID, sidechain height bytes, and sidechain block hash, then requires that value to match the supplied tracker key. |
| DUP insertion uses the canonical bridge-native burn ID, not the legacy sidechain burn transaction hash. | `MainChainAggregateUnlockTrustless.es` derives `E2S_TRUSTLESS_BURN_ID_V1` from sidechain ID, sidechain transaction hash, and event index, then inserts the same `burnId` into DUP. |
| Payout binding is leaf-bound. | `MainChainAggregateUnlockTrustless.es` requires recipient hash, amount bytes, ERG asset ID, and payout output to match the encoded leaf. |
| Gate 5 remains blocked. | General Merkle inclusion proof verification, V2 transaction assembly, deployment, live/non-mainnet rehearsal, publication updates, and independent review are still open. |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Trustless burn verification implemented | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open = 0 | no |
| Generalized Merkle inclusion proof verification | no |
| V2 transaction assembly wired | no |
| Mined Ergo extension anchoring | no |
| Ergo-verifiable sidechain finality authority | no |
| Live SPV relay operation | no |
| Live or non-mainnet rehearsal | no |
| Independent review | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
