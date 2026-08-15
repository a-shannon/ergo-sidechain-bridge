# Walkthrough 023 — Spike 11: Multi-Claim Batch Settlement

> **Commit**: `76a5f44`
> **Date**: 2026-05-08

## Summary

Spike 11 validates batched aggregate settlement with multiple peg-out payouts in a single Ergo transaction.

## New Contracts

| Contract | Max | ErgoTree |
|----------|-----|----------|
| `MainChainAggregateUnlockBatch.es` | 10 claims | 3611 bytes (4KB box limit is the bottleneck) |
| `DoubleUnlockPreventionAggregateBatch.es` | 20 burn IDs | 2106 bytes |

TX shape:
```
INPUTS(0): SPVTracker singleton
INPUTS(1): DUP batch singleton
INPUTS(2): single batch unlock liquidity box (all N claims in context extension)
OUTPUTS(0): SPVTracker successor
OUTPUTS(1): DUP successor
OUTPUTS(2..N+1): N payout boxes
OUTPUTS(N+2): change (optional)
OUTPUTS(last): miner fee
```

## Contract Security Hardening

All three singleton contracts now use guarded `.tokens.size > 0` checks:
- `SPVTracker.es` — **ErgoTree hash changed**
- `DoubleUnlockPreventionAggregateBatch.es`
- `MainChainAggregateUnlockBatch.es`

Missing-NFT attacks now produce `Script reduced to false` instead of `Evaluation error` (OOB crash).

## Builder / Test Artifacts

- `aggregate-settlement-builder.ts`: `packClaimCore()` (109-byte packed claim format), `buildBatchDupExtension()`, `buildBatchUnlockExtension()`
- `compile-contracts.ts`: dummy NFT injection gated behind `CHECK_ONLY`; production reads `doubleUnlockPreventionAggregateBatch.nftId`
- `spike11-multi-claim.test.ts`: 13 unit tests for packing, layout, and validation guards

## Verification Gates

| Gate | Result |
|------|--------|
| `contracts:check` | 8/8 compile |
| `tsc --noEmit` | 0 errors |
| `vitest run` | 57/57 pass (12 files) |
| Live spike | 9/9 pass (batch 2/5/10 + 6 negative tests) |

## Negative Test Classification

| Test | Rejection |
|------|-----------|
| N1 wrong amount | `Script reduced to false` |
| N2 wrong recipient | `Script reduced to false` |
| N3 wrong DUP digest | `Script reduced to false` |
| N4 missing tracker NFT | `Script reduced to false` |
| N5 missing DUP NFT | `Script reduced to false` |
| N6 duplicate burnId | `proof-gen rejected (unreachable)` |

## Follow-Up Status

- Batch settlement was promoted to the daemon settlement path behind `AGGREGATE_BATCH_ENABLED` in commit `4aabf42`.
  This is not production-ready or testnet production-candidate evidence until Gate 3 live testnet submit,
  confirmation, and reconciliation evidence is complete.
- Batch ordering and error classification were hardened in commit `901cd42`.
- Single-claim aggregate settlement remains as fallback.
- Phase 011b should package the prototype as an external showcase: subblock-ready monitoring, benchmarked batching, and eUTXO parallel settlement lanes.
