# Completed Gate 5 Sidechain Commitment Format Component Evidence - 2026-06-27 - e9b25a8c

This artifact records row-level local component evidence for the Gate 5
sidechain commitment format. It records only the stable, versioned,
sidechain-specific commitment encoding currently implemented by
`relayer/src/trustless-burn-proof.ts`.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 sidechain commitment format component evidence |
| Git commit | e9b25a8c |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-27 |

## Source Evidence

| Source | Value |
|---|---|
| Proof-core source | `relayer/src/trustless-burn-proof.ts` |
| Proof-vector validation artifact | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md |
| Proof-vector JSON report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Public test vector | `relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json` |
| Review mode | local offline read-only review; no live state, signing, submit, deploy, or broadcast |

## Component Binding

| Field | Value |
|---|---|
| Component row | Sidechain commitment format |
| Required property | Stable, versioned, sidechain-specific commitment format |
| Component result | completed Gate 5 sidechain commitment format component evidence |
| Leaf version byte | 1 |
| Leaf domain | E2S_TRUSTLESS_BURN_LEAF_V1 |
| Node domain | E2S_TRUSTLESS_BURN_NODE_V1 |
| Burn ID domain | E2S_TRUSTLESS_BURN_ID_V1 |
| Sidechain identity binding | `sidechainIdHex` is a fixed-width 32-byte input to leaf encoding and burn-ID derivation |
| Header commitment binding | `sidechainBlockHashHex` is a fixed-width 32-byte leaf input |
| Event-root binding | `bridgeEventRootHex` is the Blake2b-compatible Merkle root checked by local proof-core validation |
| Event identity binding | `burnIdHex` must equal the Blake2b-derived sidechain event identity over `sidechainIdHex`, `sidechainTxHashHex`, and `eventIndex` |
| Payout binding | `recipientErgoTreeHashHex`, `amountNanoErg`, and `assetIdHex` are encoded in the burn leaf |
| Settlement binding | `duplicatePreventionKeyHex` must equal the proved `burnIdHex` |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
| Testnet production-candidate support | false |
| Production-ready support | false |
| Mainnet support | false |
| Transaction broadcast | false |
| Signing material used | false |
| Runtime database state used | false |
| Private deployment state used | false |
