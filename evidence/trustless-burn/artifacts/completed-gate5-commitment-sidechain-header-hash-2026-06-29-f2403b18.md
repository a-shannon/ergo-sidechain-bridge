# Completed Gate 5 Commitment Sidechain Header Hash Evidence - 2026-06-29 - f2403b18

This artifact records row-level local commitment-format evidence for the Gate 5
`sidechainHeaderHash` field. It records only the fixed-width sidechain block
hash carried by the local proof-core burn leaf and completed proof-vector
report.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment sidechain header hash evidence |
| Git commit | f2403b18 |
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
| Commitment field | sidechainHeaderHash |
| sidechainHeaderHash | 2222222222222222222222222222222222222222222222222222222222222222 |
| Encoding | fixed-width 32-byte hex |
| Leaf binding | `sidechainBlockHashHex` is encoded in the canonical burn leaf before leaf hashing |
| Leaf hash binding | canonical burn leaf resolves to `leafHashHex` 31c300fa370b8c9ff01a722eea2f590130fc2c5008249d861234a30d2df4ea6f |
| Commitment root binding | leaf hash plus ordered proof nodes resolves to `bridgeEventRootHex` 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| Proof-vector status | PASS |
| Local proof-core boundary | true |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
| Sidechain finality authority | false |
| Authenticated sidechain header history | false |
| On-chain proof acceptance | false |
| Mined Ergo anchor binding | false |
| DUP settlement insertion | false |
| Testnet production-candidate support | false |
| Production-ready support | false |
| Mainnet support | false |
| Transaction broadcast | false |
| Signing material used | false |
| Runtime database state used | false |
| Private deployment state used | false |
