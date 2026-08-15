# Completed Gate 5 Commitment Prefix Evidence - 2026-06-29 - de7d0473

This artifact records row-level local commitment-format evidence for the Gate 5
`commitmentPrefix` field. It records only the offline extension-key shape for
the `0x0401` sidechain commitment under the `0x04xx` extension keyspace.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment prefix evidence |
| Git commit | de7d0473 |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, extension-shape prerequisite only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Value |
|---|---|
| Extension boundary source | `relayer/src/scripts/spikes/spike6-extension-injection-viability.ts` |
| Extension boundary artifact | artifact://trustless-burn/artifacts/gate5-extension-boundary-public-boundary-2026-06-26-9d5927a1.md |
| Command | `npm run trustless:extension-boundary -- --public-boundary --out <report.md>` |
| Review mode | local offline read-only review; no live state, signing, submit, deploy, or broadcast |

## Commitment Field Binding

| Field | Value |
|---|---|
| Commitment field | commitmentPrefix |
| Commitment prefix | 0x0401 |
| Extension keyspace | 0x04xx |
| Key encoding | 2-byte extension key |
| Value size | 32 bytes |
| Shape check | 0x0401 extension field satisfies key length, value length, uniqueness, and extension-size constraints |
| Merkle check | 0x0401 participates in a Scorex-compatible extension Merkle root |
| Boundary result | BOUNDARY_ONLY |
| Local proof-core boundary | true |

## Boundary

| Boundary | Value |
|---|---|
| Gate 5 release closure | false |
| Mined Ergo anchor binding | false |
| Node patch requirement resolved | false |
| SPV relay or tracker evidence completed | false |
| On-chain proof acceptance | false |
| Sidechain finality authority | false |
| DUP settlement insertion | false |
| Testnet production-candidate support | false |
| Production-ready support | false |
| Mainnet support | false |
| Transaction broadcast | false |
| Signing material used | false |
| Runtime database state used | false |
| Private deployment state used | false |
