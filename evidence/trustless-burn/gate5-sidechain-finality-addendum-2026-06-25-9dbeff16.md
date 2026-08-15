# Gate 5 Sidechain Finality Addendum - 2026-06-25 - 9dbeff16

This addendum refreshes the current Gate 5 trustless-burn blocker map for the
local unfinalized-sidechain-block rejection case.

It is not completed Gate 5 trustless-burn evidence. It does not support
settlement readiness, testnet production-candidate readiness, production-ready
claims, mainnet claims, broadcast, or completed trustless-burn implementation
claims.

## Updated Local Prerequisite Evidence

| Evidence target | Scope | Gate 5 status |
|---|---|---|
| artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md | Local peg-out burn receipt-depth rejection before trustless burn leaf construction | prerequisite captured; Gate 5 remains blocked |

## Updated Negative-Case Boundary

| Check | Previous blocker state | Current local prerequisite state | Remaining Gate 5 blocker |
|---|---|---|---|
| Unfinalized sidechain block | unfinalized sidechain block rejection evidence had not been captured | Local verifier evidence now records rejection when a burn receipt has `2` sidechain confirmations and requires `10` before leaf construction | Still missing Ergo-verifiable sidechain finality authority, authenticated commitment history, reorg handling, extension-section anchor evidence, and on-chain proof acceptance |

## Reviewer Note

The local verifier now fails closed before constructing a trustless burn leaf
when the caller supplies an incomplete, incoherent, or too-shallow sidechain
receipt finality policy. This reduces one Gate 5 evidence-preparation gap but
does not change the release-gate status: trustless burn verification remains
blocked until finality, anchoring, SPV/tracker, DUP insertion, on-chain
acceptance, and independent-review evidence are complete.
