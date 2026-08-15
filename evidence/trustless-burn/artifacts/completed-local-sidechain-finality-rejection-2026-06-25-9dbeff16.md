# Completed Local Sidechain Finality Rejection Evidence - 2026-06-25 - 9dbeff16

This artifact records local peg-out burn receipt-depth rejection before
trustless burn leaf construction.

It is not completed Gate 5 trustless-burn evidence. It does not prove
Ergo-verifiable sidechain consensus, extension-section anchoring, SPV tracker
currentness, on-chain proof acceptance, settlement acceptance, production
readiness, testnet production-candidate readiness, mainnet readiness, or
broadcast authorization.

No wallet recovery material, signing credential material, deployment state,
private runtime database state, or live transaction evidence was read or used.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Completed local sidechain finality rejection evidence |
| Git commit | 9dbeff16 |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path |
| Reviewer | A. Shannon |
| Date | 2026-06-25 |

## Command Evidence

| Command | Result | Evidence boundary |
|---|---|---|
| `npm test -- --run src/peg-out-burn-verifier.test.ts` | PASS; 1 test file; 13 tests passed; exit code 0 | Local verifier tests only; no node, wallet, broadcast, settlement, or runtime database access |

## Rejected Case Evidence

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Unfinalized sidechain block | rejected | `verifyPegOutBurnReceipt` rejects receipt `1111111111111111111111111111111111111111111111111111111111111111:7` / trustless burn ID `0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76` when receipt block `1234`, current sidechain height `1235`, and required confirmations `10` produce `2` sidechain confirmations with error `burn receipt has 2 sidechain confirmation(s), requires 10` | completed local prerequisite |
| Incomplete finality policy | rejected | `extractVerifiedPegOutBurnsFromReceipt` rejects a supplied current sidechain height without required confirmations and rejects required confirmations without a current sidechain height | completed local prerequisite |
| Incoherent finality policy | rejected | `extractVerifiedPegOutBurnsFromReceipt` rejects zero required confirmations and rejects a current sidechain height below the burn receipt block number | completed local prerequisite |

## Gate 5 Boundary

This artifact covers only a local receipt-depth guard for evidence preparation.
It moves the unfinalized-sidechain-block blocker from "not captured locally" to
"local prerequisite captured, still blocked for Gate 5 finality authority".

Gate 5 remains blocked until separate evidence proves an Ergo-verifiable
sidechain header or finality rule, authenticated commitment history, reorged
commitment rejection, extension-section anchor binding, on-chain burn proof
acceptance, DUP settlement insertion, and independent review.
