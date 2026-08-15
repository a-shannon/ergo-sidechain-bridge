# Completed Gate 5 Trustless Single-Leaf Context-Extension Source-Boundary Evidence - 2026-07-01 - base 6a74a291

This artifact captures a local source-boundary prerequisite for Gate 5. It
records the relayer-side ContextExtension helper for the V2 single-leaf
trustless aggregate unlock contract and the boundaries that still block release
evidence.

`relayer/src/aggregate-settlement-builder.ts` exposes
`buildTrustlessSingleLeafAggregateUnlockExtension` for planned aggregate
settlement claims whose settlement identity is `trustless-burn-leaf`. The
helper builds the nine ContextExtension variables expected by
`contracts/MainChainAggregateUnlockTrustless.es`: tracker key, tracker proof,
canonical 205-byte trustless burn leaf, burnId/DUP key, recipient ErgoTree,
DUP lookup proof, DUP insert proof, tracker tree selector, and sidechain height
bytes.

The helper recomputes the canonical burn leaf and rejects source-boundary drift
before encoding. It requires the planned `bridgeEventRootHex` to equal the
single-leaf `leafHashHex`, requires the recipient ErgoTree hash and amount to
match the planned payout, requires a bounded sidechain log index, and keeps the
asset lane limited to ERG. Multi-leaf burn commitments remain outside this
single-leaf helper until a generalized inclusion-proof contract path exists.

This is not completed Gate 5 trustless-burn evidence. It does not prove
generalized Merkle inclusion proof verification, deployed V2 transaction
assembly, mined Ergo extension anchoring, Ergo-verifiable sidechain finality
authority, live SPV relay operation, live/non-mainnet rehearsal, independent
review, release support, testnet production-candidate readiness, production
readiness, mainnet readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, environment files, or live
transaction evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless single-leaf ContextExtension source-boundary evidence |
| Base commit | 6a74a291 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, source-boundary only |
| Reviewer | A. Shannon |
| Date | 2026-07-01 |

## Source Evidence

| Source | Binding |
|---|---|
| `contracts/MainChainAggregateUnlockTrustless.es` | Defines the V2 single-leaf trustless aggregate unlock ContextExtension layout and on-chain field bindings. |
| `relayer/src/aggregate-settlement-builder.ts` | Adds `buildTrustlessSingleLeafAggregateUnlockExtension` and fail-closed checks for source, root, recipient, amount, sidechain index, and asset lane. |
| `relayer/src/aggregate-settlement-builder.test.ts` | Verifies successful V2 single-leaf ContextExtension encoding and rejects root drift, recipient drift, amount drift, and non-ERG asset lanes before encoding. |
| `docs/trustless-burn-verification-plan.md` | Records that this helper is a source-boundary prerequisite and does not close Gate 5. |
| `docs/contract-relayer-api-reference.md` | Documents the relayer interface and guardrails for the V2 single-leaf ContextExtension helper. |

## Command Evidence

| Field | Value |
|---|---|
| Command | `npm test -- --run src/aggregate-settlement-builder.test.ts --cache=false` |
| Runtime | Node 24 pinned local runtime |
| Result | PASS |
| Exit code | 0 |
| Test files | 1 passed |
| Tests | 15 passed |
| Broadcast, submit, deploy, or state mutation | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Environment file read | no |

## Boundary Findings

| Finding | Evidence |
|---|---|
| The relayer can encode the V2 single-leaf ContextExtension for a planned trustless claim. | `aggregate-settlement-builder.test.ts` verifies slots `Var(0)..Var(8)` for a single-leaf commitment. |
| Multi-leaf or root-drift commitments are not silently treated as single-leaf settlements. | `buildTrustlessSingleLeafAggregateUnlockExtension` requires `bridgeEventRootHex == leafHashHex`. |
| Recipient, amount, and asset lane drift fail before extension encoding. | `aggregate-settlement-builder.test.ts` verifies rejection before returning an extension map. |
| V2 transaction assembly remains blocked. | This helper only returns a ContextExtension map and does not assemble, sign, check, submit, or broadcast transactions. |
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
