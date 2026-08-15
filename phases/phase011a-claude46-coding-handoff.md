# Phase 011a Claude 4.6 Coding Handoff

## Purpose

This is the recommended handoff point from Codex supervision to Claude 4.6
coding. The bridge is currently stable for single-claim aggregate settlement.
The next large coding milestone is multi-claim aggregate settlement, which has
enough contract, proof, transaction-shape, and daemon surface area to justify a
larger coding agent.

Codex should remain reviewer/supervisor for invariants, ErgoScript shape,
AVL proof consistency, and node-wallet isolation.

## Current Baseline

Recent relevant commits:

- `d2f0dc5` - local signing for spike evaluations
- `b9ee5ba` - node wallet isolation test
- `1d81ad7` - remove node wallet helpers
- `3429561` - committee guards in aggregate eval spikes
- `986e42d` - deploy aggregate committee placeholder injection
- `22e2bfc` - verify aggregate AVL input digests
- `380b5f8` - add contract compile check
- `f6ab798` - validate aggregate settlement confirmation before SQLite reconcile

Verified checks at handoff:

- `npm.cmd run contracts:check` passes and writes no files.
- `node .\node_modules\typescript\bin\tsc --noEmit` passes.
- `node .\node_modules\vitest\vitest.mjs run` passes: 44 tests.

## Non-Negotiable Guardrails

- Do not reset, restore, unlock, or use the Ergo node wallet.
- Do not call node wallet signing endpoints:
  - `/wallet/unlock`
  - `/wallet/addresses`
  - `/wallet/balances`
  - `/wallet/transaction/sign`
  - `/wallet/transaction/generateAndSign`
  - `/wallet/transaction/send`
  - `/wallet/payment/send`
- All Ergo signing must go through local signing, currently
  `relayer/src/fleet-signer.ts` / `ergo-lib-wasm-nodejs`.
- Do not print mnemonics or private keys.
- Do not stage or commit:
  - `relayer/bridge-state.sqlite`
  - `.env`
  - local faucet/funding helpers
  - Midday workspace files
  - `.agent` generated edits unless explicitly requested
- Keep commits scoped. Prefer one feature or invariant per commit.

## Current Architecture

Phase 011a selected pattern:

```text
INPUTS:
  0. SPVTracker singleton
  1. DoubleUnlockPreventionAggregate singleton
  2. MainChainAggregateUnlock liquidity box

OUTPUTS:
  0. SPVTracker successor
  1. DUP successor
  2. payout output(s)
  n. optional unlock change
  n+1. miner fee
```

Current production-facing implementation is single-claim only:

- `contracts/SPVTracker.es`
- `contracts/DoubleUnlockPreventionAggregate.es`
- `contracts/MainChainAggregateUnlock.es`
- `relayer/src/aggregate-settlement-builder.ts`
- `relayer/src/aggregate-settlement-tx.ts`
- `relayer/src/aggregate-settlement-service.ts`
- `relayer/src/scripts/e2e-aggregate-settlement.ts`

Important current limitation:

- `DoubleUnlockPreventionAggregate.es` inserts exactly one burn TX ID.
- `MainChainAggregateUnlock.es` authorizes exactly one payout.
- `aggregate-settlement-builder.ts` already computes batched DUP proofs through
  `insertLockRecordsBatch`, but flags multi-claim plans as requiring a new
  production contract shape.

## Recommended Claude Coding Milestone

Do not jump straight to production multi-claim wiring. First implement:

```text
Spike 11: Multi-Claim Aggregate Settlement Evaluation
```

Goal:

- Validate a real transaction with:
  - SPVTracker input/output
  - batched aggregate DUP input/output
  - aggregate unlock input
  - 2, 5, 10, and ideally 20 payouts
  - one batched DUP insert proof
  - one lookup proof per burn ID
  - one tracker get proof per claim
  - local `ergo-lib-wasm-nodejs` signing

Acceptance:

- Positive multi-claim TX evaluates under sigma-rust.
- Negative tests reject:
  - duplicate burn ID in same batch
  - already-spent burn ID in DUP history
  - wrong payout amount
  - wrong payout recipient
  - wrong tracker tree selector
  - wrong DUP successor digest
  - missing singleton NFT on SPV or DUP successor
- No node wallet endpoint appears outside explicit diagnostics.
- `contracts:check`, `tsc`, and `vitest` remain green.

## Contract Shape Guidance

Spike 4 generated a synthetic contract per batch size. Production cannot rely on
runtime code generation for a singleton script. The safest next experiment is a
fixed-max contract shape, for example `MAX_CLAIMS = 20`.

Recommended experimental contract files:

- `contracts/DoubleUnlockPreventionAggregateBatch.es`
- `contracts/MainChainAggregateUnlockBatch.es`

Recommended context-extension shape for `DoubleUnlockPreventionAggregateBatch.es`:

```text
Var(0): Int        active claim count
Var(1): Coll[Byte] batched AVL insert proof
For i in 0..MAX_CLAIMS-1:
  key_i Var(...)
  lookupProof_i Var(...)
```

The contract should:

- require `1 <= count <= MAX_CLAIMS`
- verify each active key is 32 bytes
- verify each active lookup proof proves non-membership against `SELF.R5`
- construct the exact active `Coll[(Coll[Byte], Coll[Byte])]`
- run one `tree.insert(activeTuples, insertProof)`
- verify `OUTPUTS(1).R5[AvlTree].get.digest == modifiedTree.digest`
- preserve NFT, contract bytes, value, auth metadata, and counter monotonicity
- keep committee `atLeast()` auth

ErgoScript does not have a convenient dynamic list builder. Use explicit
branches if necessary:

```scala
val toInsert =
  if (count == 1) Coll(t0)
  else if (count == 2) Coll(t0, t1)
  ...
  else Coll(t0, ..., t19)
```

Recommended context-extension shape for `MainChainAggregateUnlockBatch.es`:

```text
Var(0): Int active claim count
For i in 0..MAX_CLAIMS-1:
  trackerKey_i
  trackerProof_i
  burnTxId_i
  amountBytes_i
  recipientTree_i
  dupLookupProof_i
  trackerTreeSelector_i
Var(last): Coll[Byte] batched DUP insert proof
```

The payout contract should:

- authenticate SPVTracker and DUP singleton NFTs at INPUTS/OUTPUTS
- verify each active tracker get proof
- decode `anchorHeight` with left padding:
  `byteArrayToLong(Coll(0,0,0,0) ++ anchorBytes)`
- verify finality
- derive and compare `E2S_BURN_V1` event roots
- verify each active payout output, probably `OUTPUTS(2 + i)`
- verify the batched DUP successor digest using the same active burn IDs and
  the same batched insert proof

This duplicates part of the DUP contract verification, but it binds payouts to
the DUP successor digest. The existing single-claim contract already uses this
same redundancy pattern.

## Builder and Service Promotion Plan

After Spike 11 passes:

1. Extend `AggregateSettlementPlan` with a batched DUP extension.
2. Add a new tx builder, e.g.:
   - `buildMultiClaimAggregateSettlementTx`
3. Keep `buildSingleClaimAggregateSettlementTx` unchanged until the batch path
   has its own tests.
4. Add service methods:
   - `prepareBatch`
   - `submitBatch`
   - `confirmBatchSettlement`
5. Confirm reconciliation is conservative:
   - only commit DUP keys after confirmed TX shape is validated
   - only insert SPV tracker entries that were actually ingested by the TX
   - do not update SQLite from mempool-only evidence

## Files To Read First

- `phases/phase011a-spikes-plan.md`
- `contracts/DoubleUnlockPreventionAggregate.es`
- `contracts/MainChainAggregateUnlock.es`
- historical `relayer/src/scripts/spikes/spike4-dup-batched-insert.ts` result
  (the direct broadcast-capable source is intentionally absent from the
  current checkout and remains recoverable only from Git history)
- historical `relayer/src/scripts/spikes/spike10-aggregate-payout-eval.ts`
  result (the broadcast-capable source is intentionally absent from the current
  checkout and remains recoverable only from Git history)
- `relayer/src/aggregate-settlement-builder.ts`
- `relayer/src/aggregate-settlement-tx.ts`
- `relayer/src/aggregate-settlement-service.ts`
- `relayer/src/avl-bridge.ts`
- `relayer/src/ergo-helpers.ts`
- `relayer/src/node-wallet-isolation.test.ts`

## Required Verification Commands

Run from `ergo-sidechain-bridge/relayer`:

```powershell
npm.cmd run contracts:check
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run
```

For any new Spike 11 script, also run it against the local node with local
signing. If the node is down, start it manually outside the repo using the
known local batch file, but do not reset or alter the node wallet mnemonic.

## Supervisor Review Checklist

Codex should review Claude's patch for:

- No node wallet signing endpoint regression.
- No mnemonic/private-key logging.
- Singleton NFT preservation on every SPV/DUP successor.
- Contract output indexes match tx builder output order exactly.
- All AVL digest updates use one unified proof after all inserts.
- No individual insert-proof concatenation.
- Active claim count cannot skip, duplicate, or reorder payouts.
- Payout event-root preimage binds burnTxId, recipient tree, and amount.
- Finality decode uses left-padded 4-byte anchor height.
- SQLite reconciliation happens only after confirmed and shape-validated TX.
- `bridge-state.sqlite` remains unstaged.

## Stop Conditions For Claude

Claude should stop and hand back to Codex review if:

- multi-claim contract size approaches Ergo limits
- batch 10 or batch 20 fails evaluation under sigma-rust
- dynamic `Coll[(key,value)]` construction becomes too large or ambiguous
- the tx shape needs a redeploy/migration of existing singleton NFTs
- any path appears to require node wallet signing

