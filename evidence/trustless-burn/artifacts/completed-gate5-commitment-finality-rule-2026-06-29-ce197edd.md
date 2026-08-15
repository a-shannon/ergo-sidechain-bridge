# Completed Gate 5 Commitment Finality Rule Evidence - 2026-06-29 - ce197edd

This artifact captures the local evidence-preparation prerequisite for the
Gate 5 `finalityRule` commitment field. It records the receipt-depth rule that
the relayer applies before constructing a trustless burn leaf.

It is not completed Gate 5 trustless-burn evidence. It does not prove
Ergo-verifiable sidechain consensus, extension-section anchoring, authenticated
commitment history, on-chain proof acceptance, DUP settlement insertion,
testnet production-candidate readiness, production readiness, mainnet
readiness, or broadcast authorization.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this artifact.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 commitment finality rule evidence |
| Git commit | ce197edd |
| Release level | institutional reference prerequisite |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local receipt-depth guard only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Binding |
|---|---|
| Local sidechain finality rejection evidence | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md |
| Finality addendum | artifact://trustless-burn/gate5-sidechain-finality-addendum-2026-06-25-9dbeff16.md |
| Command evidence | `npm test -- --run src/peg-out-burn-verifier.test.ts` |
| Command result | PASS / 1 test file / 13 tests / exit code 0 |
| Review mode | local offline read-only |
| Signing material used | no |
| Transaction broadcast | no |
| Runtime database state used | no |
| Private deployment state used | no |

## Commitment Binding

| Field | Value |
|---|---|
| Binding field | `finalityRule` |
| Rule type | local sidechain receipt-depth guard |
| requiredConfirmations | `10` |
| Rejected receipt | `1111111111111111111111111111111111111111111111111111111111111111:7` |
| Rejected burn ID | `0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76` |
| Receipt block | `1234` |
| Current sidechain height | `1235` |
| Observed confirmations | `2` |
| Observed rejection | `burn receipt has 2 sidechain confirmation(s), requires 10` |
| Local evidence boundary | finality prerequisite only |

## Claim Boundary

| Claim | Supported |
|---|---|
| Gate 5 release closure | no |
| Ergo-verifiable sidechain finality authority | no |
| Mined Ergo extension anchoring | no |
| Authenticated commitment history | no |
| On-chain proof acceptance | no |
| DUP settlement insertion | no |
| Testnet production-candidate support | no |
| Production-ready support | no |
| Mainnet support | no |
| Transaction broadcast | no |
