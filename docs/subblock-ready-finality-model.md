# Subblock-Ready Finality Model

This note explains how the bridge prototype should talk about upcoming Ergo subblocks without overstating the security model.

For EVM and Substrate teams, the key mental model is:

- Subblocks can provide a fast inclusion or failure signal.
- Ordering blocks still define canonical ordering and economic finality.
- The bridge should expose both clocks, just like many EVM systems distinguish "seen in mempool", "included", and "finalized".

## Why This Matters

Today, a bridge demo often feels slow because the safest UX waits for conservative L1 finality. With subblocks, the user interface can become much more responsive:

1. The sidechain burn is observed.
2. The relayer builds the Ergo settlement transaction.
3. The transaction is accepted into the mempool.
4. A fast inclusion signal appears when subblocks are available.
5. An ordering block confirms canonical inclusion.
6. A configured ordering-block depth confirms economic finality.

Only steps 5 and 6 should be used for high-value finality. Step 4 is a UX accelerator, not a security shortcut.

## EVM Analogy

| EVM-style state | Ergo-side state | Meaning |
| --- | --- | --- |
| Transaction prepared | Settlement TX built | The bridge has enough proof data to settle |
| Mempool seen | Ergo mempool accepted | The node accepts the transaction candidate |
| Soft inclusion / preconfirmation | Subblock inclusion signal | Fast feedback that inclusion is likely |
| Block included | Ordering block included | Canonical L1 ordering point |
| Finalized checkpoint | K ordering blocks deep | Economic finality for settlement |

The important difference is that Ergo's eUTXO model lets the bridge also report exactly which settlement boxes are involved: tracker singleton, DUP shard, unlock liquidity lane, and payout outputs.

## Metrics To Expose

The relayer and dashboard should use separate names for responsiveness and finality:

| Metric | Description |
| --- | --- |
| `burnObservedMs` | Sidechain burn event first seen by the relayer |
| `proofReadyMs` | SPV tracker proof and DUP proof material available |
| `settlementSubmittedMs` | Ergo settlement transaction submitted |
| `mempoolAcceptedMs` | Ergo node accepted the transaction into mempool |
| `fastInclusionSeenMs` | Subblock inclusion signal, when available |
| `orderingBlockIncludedMs` | Canonical Ergo ordering block includes the transaction |
| `economicFinalityMs` | Configured finality depth reached |

This naming avoids the common mistake of calling fast inclusion "final".

## Prototype Policy

For this prototype:

- Fast inclusion can unlock UI progress, notifications, and operator monitoring.
- Fast inclusion must not release high-value accounting guarantees by itself.
- Settlement status should remain anchored to ordering-block depth.
- The demo can show a 2-second fast-feedback lane while still displaying the slower finality lane.

## Where This Fits In The Bridge

Current batch settlement already provides the hard part:

- many exits per transaction,
- explicit replay-protection state,
- AVL proofs instead of unbounded storage scans,
- eUTXO boxes that can become settlement lanes.

Subblock-aware monitoring is the UX layer on top. It does not require a new contract design. It requires the relayer and dashboard to track more precise lifecycle states.

## Recommended Status Labels

Use these labels in operator UI and logs:

| Status | User-facing meaning | Security meaning |
| --- | --- | --- |
| `proof_ready` | The bridge can settle this burn | Off-chain proof material is ready |
| `submitted` | Settlement transaction has been sent | Candidate transaction exists |
| `mempool_seen` | Ergo node accepted it | Still not canonical |
| `fast_inclusion_seen` | Fast confirmation signal received | Useful for UX only |
| `ordering_confirmed` | Included in an Ergo ordering block | Canonical inclusion |
| `finalized` | Finality depth reached | Safe for high-value settlement accounting |

## Non-Goals

This document does not claim:

- subblocks replace finality depth,
- the current prototype already has a live subblock API integration,
- the bridge is fully trustless before the SPV relay roadmap lands,
- the demo has Base-level infrastructure or liquidity.

The claim is narrower and stronger: the prototype is structured so that fast-feedback monitoring can be added without weakening settlement correctness.

