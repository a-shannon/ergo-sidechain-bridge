# Completed Gate 5 Commitment Sidechain ID Evidence - 2026-06-28 - 7de11aac

This artifact records row-level local commitment-format evidence for the Gate 5
`sidechainId` field. It records only the fixed-width sidechain identity binding
currently used by the local proof-core vector and validation report.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment sidechain ID evidence |
| Git commit | 7de11aac |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-28 |

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
| Commitment field | sidechainId |
| sidechainId | 1111111111111111111111111111111111111111111111111111111111111111 |
| Encoding | fixed-width 32-byte hex |
| Leaf binding | `sidechainIdHex` is included in the canonical burn leaf hash |
| Burn ID binding | `sidechainIdHex` participates in derived sidechain event identity validation |
| Negative case | `wrong-sidechain-id` rejected with `burnId must equal derived sidechain event identity` |
| Proof-vector status | PASS |
| Local proof-core boundary | true |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
| On-chain proof acceptance | false |
| Sidechain finality authority | false |
| Testnet production-candidate support | false |
| Production-ready support | false |
| Mainnet support | false |
| Transaction broadcast | false |
| Signing material used | false |
| Runtime database state used | false |
| Private deployment state used | false |
