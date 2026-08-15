# Completed Gate 5 Commitment Sidechain Height Evidence - 2026-06-29 - bf0626ae

This artifact captures the local commitment-format prerequisite for the
`sidechainHeight` field used by the Gate 5 trustless burn blocker map. It does
not prove Ergo-verifiable sidechain finality, live SPV tracker operation,
mined Ergo anchoring, on-chain proof acceptance, settlement readiness, testnet
production-candidate readiness, production readiness, mainnet readiness, or
broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment sidechain height evidence |
| Git commit | bf0626ae |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, SPV tracker identity prerequisite only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Binding |
|---|---|
| SPV tracker identity source | `relayer/src/spv-tracker.ts` |
| SPV tracker boundary source | `relayer/src/scripts/trustless-spv-tracker-boundary.ts` |
| SPV tracker boundary artifact | artifact://trustless-burn/artifacts/gate5-spv-tracker-boundary-public-boundary-2026-06-26-9d5927a1.md |
| Command evidence | `npm run trustless:spv-tracker-boundary -- --public-boundary --out <report.md>` |
| Command result | `BOUNDARY_ONLY` |
| Review mode | local offline read-only |
| Signing material used | no |
| Transaction broadcast | no |
| Runtime database state used | no |
| Private deployment state used | no |

## Commitment Field Binding

| Field | Value |
|---|---|
| Commitment field | `sidechainHeight` |
| Encoded value | `12345` |
| Encoding class | non-negative integer, u64 big-endian |
| SPV tracker key binding | `blake2b256("E2S_SPV_V1" || sidechainId || sidechainHeight_8BE || sidechainHeaderHash)` |
| Boundary result | `BOUNDARY_ONLY` |
| Local proof-core boundary | true |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Ergo-verifiable sidechain finality authority | no |
| Mined Ergo anchor binding | no |
| Live SPV tracker operation | no |
| Authenticated commitment history | no |
| On-chain proof acceptance | no |
| DUP settlement insertion | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
| Signing material used | no |
| Runtime database state used | no |
| Private deployment state used | no |
