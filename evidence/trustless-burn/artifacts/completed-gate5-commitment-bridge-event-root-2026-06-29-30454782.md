# Completed Gate 5 Commitment Bridge Event Root Evidence - 2026-06-29 - 30454782

This artifact records row-level local commitment-format evidence for the Gate 5
`bridgeEventRoot` field. It records only the local proof-core Merkle root used
by the completed proof-vector report.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment bridge event root evidence |
| Git commit | 30454782 |
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
| Commitment field | bridgeEventRoot |
| bridgeEventRootHex | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| Encoding | fixed-width 32-byte hex |
| Root binding | proof-core burn leaf plus ordered sibling proof resolves to `bridgeEventRootHex` |
| Hash function | Blake2b-compatible local proof-core hashing |
| Proof node count | 1 |
| Negative root case | `wrong-bridge-event-root` rejected with `burn inclusion proof must resolve to bridgeEventRoot` |
| Negative path case | `malformed-inclusion-path` rejected with `burn inclusion proof must resolve to bridgeEventRoot` |
| Proof-vector status | PASS |
| Local proof-core boundary | true |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
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
