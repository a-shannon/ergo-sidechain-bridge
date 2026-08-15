# Completed Gate 5 Commitment Hash Function Evidence - 2026-06-29 - bcc71649

This artifact records row-level local commitment-format evidence for the Gate 5
`hashFunction` field. It records only the Blake2b-compatible hashing used by the
local proof-core burn leaf, burn ID, and commitment-tree construction.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment hash function evidence |
| Git commit | bcc71649 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Value |
|---|---|
| Proof-core source | `relayer/src/trustless-burn-proof.ts` |
| Proof-vector validation artifact | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md |
| Proof-vector JSON report | artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Public test vector | `relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json` |
| Review mode | local offline read-only review; no live state, signing, submit, deploy, or broadcast |

## Commitment Field Binding

| Field | Value |
|---|---|
| Commitment field | hashFunction |
| Hash function | Blake2b-compatible local proof-core hashing |
| Implementation binding | `blakejs.blake2b(data, undefined, 32)` |
| Digest length | 32 bytes |
| Leaf domain | E2S_TRUSTLESS_BURN_LEAF_V1 |
| Node domain | E2S_TRUSTLESS_BURN_NODE_V1 |
| Burn ID domain | E2S_TRUSTLESS_BURN_ID_V1 |
| Leaf hash binding | canonical burn leaf resolves to `leafHashHex` 31c300fa370b8c9ff01a722eea2f590130fc2c5008249d861234a30d2df4ea6f |
| Commitment root binding | leaf hash plus ordered proof nodes resolves to `bridgeEventRootHex` 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| Proof-vector status | PASS |
| Local proof-core boundary | true |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
| Contract-level hash-function proof | false |
| On-chain proof acceptance | false |
| Mined Ergo anchor binding | false |
| Sidechain finality authority | false |
| DUP settlement insertion | false |
| Testnet production-candidate support | false |
| Production-ready support | false |
| Mainnet support | false |
| Transaction broadcast | false |
| Signing material used | false |
| Runtime database state used | false |
| Private deployment state used | false |
