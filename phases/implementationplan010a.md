# Phase 010a — Non-Throwaway Hardening + Committee Multisig

> **Date**: 2026-05-06
> **Status**: In progress
> **Direction**: Validated with Codex — non-throwaway work only

The active package, completion criteria, and continuation behavior are governed
by [Bridge Execution Plan](bridge-execution-plan.md). This file supplies Phase
010a design detail and must not advance package status independently.

## Background

Phase 010a focuses exclusively on **non-throwaway** work. Two newly confirmed
fail-open timeout paths must be contained before the Phase 011 proof path can be
treated as the only active safety priority. The real trustless peg-out fix
(Ergo-verifiable burn inclusion and sidechain finality) remains Phase 011.

### Superseded Decision: Preserve Permissionless MCU

The earlier plan preserved permissionless MCU spends to avoid throwaway work.
That decision is unsafe. A monotonic SCS height and a 10,000-block Ergo timeout
cannot prove that a sidechain burn remains canonical. After a burn reorg, a
third party can spend the MCU even when the daemon has marked the local row
`burn_reverted`.

Do not build a permanent committee-governed replacement for Phase 011. Do add
the smallest transitional containment needed to remove every permissionless
fail-open payout path: either keep the MCU fail-closed, or require committee
authorization after fresh burn revalidation and return timed-out liquidity to
the settlement vault rather than the beneficiary.

## Scope Boundary After Roadmap Re-Audit

Phase 010a remains the minimum non-throwaway hardening slice:

- Keep the current prototype safer while Phase 011 burn-proof work is developed.
- Preserve compile/eval coverage for committee `atLeast()` guards.
- Keep node-wallet signing out of production paths.
- Do not expand this phase into full governance/key-rotation unless a concrete
  release validator row is being closed.
- Do not preserve a permissionless legacy MCU payout merely because Phase 011
  will replace it. Minimal fail-closed or committee-authorized containment is a
  P0 safety requirement, not governance expansion.

The live-settlement blocker remains the ContextExtension WASM/JVM
serialization divergence for larger proof-bearing transactions. Do not bypass
the guard, do not use node-wallet signing as a production workaround, and do not
introduce JVM-order or var-packing workarounds without a formal decision. The
next useful actions are upstream conformance/repro work, reducing the proof
context shape where it preserves the real proof, or moving heavier proof logic
into the future STARK aggregate path.

### What IS non-throwaway

Every item below survives any future MCU change (NiPoPoW, STARK, optimistic, etc.).

---

## Proposed Changes

### 0. Close the Two Fail-Open Timeout Paths

**Peg-in bug**: `processPegIns()` mints sERG from an unspent refundable MCL box.
The MCL timeout can therefore return the same ERG after mint. The consolidation
sweeper is only a scaffold and cannot close this race.

**Required state machine**:

1. Detect a refundable MCL deposit.
2. Spend that exact box into a dedicated non-refundable settlement vault.
3. Wait for the consume transaction to reach the declared Ergo confirmation
   policy and verify that the original MCL box is absent.
4. Mint sERG idempotently using the original box ID plus the confirmed consume
   transaction identity.
5. On consume failure or reorg before finality, do not mint. On mint failure,
   retry from the confirmed committed state.

**Peg-out bug**: `MainChainUnlock.es` permits third-party payout based on stale
SCS height or elapsed Ergo time even after the relayer detects that the burn was
reverted. SQLite status cannot constrain an on-chain spend.

**Required containment**: until Phase 011 proof acceptance is live, remove
permissionless beneficiary timeout payout and prevent any legacy MCU spend from
using SCS height or Ergo age as proof that a burn remains canonical. Fail closed
or require committee authorization after fresh burn revalidation. Any timeout
recovery must return funds to the settlement vault, not to the beneficiary.

**Status**: Open, critical. No live-funds or production-candidate use is allowed.

---

### 1. `atLeast()` Multisig on SCS, DUP, Aggregate DUP, MCL

These contracts were already signer-gated (`proveDlog(relayerPk)` / register `SigmaProp`). Converting to `atLeast(m, Coll(pk1..pkN))` is additive to the existing authorization model.

**MCU boundary**: full governance remains out of scope, but the P0 containment
above supersedes the earlier permissionless PoC decision.

**Files**: `SideChainState.es`, `DoubleUnlockPrevention.es`, `DoubleUnlockPreventionAggregate.es`, `MainChainLock.es`
- Replace `proveDlog(decodePoint(SELF.R6))` with `atLeast(m, Coll(pk1..pkN))`
- Requires contract redeployment (new NFTs for SCS and DUP)
- Committee PKs stored in a register or hardcoded at compile-time

---

### 2. DUP Heartbeat: Pending/Confirmed State Machine

**Bug**: `touchDUPSingleton()` calls `this.state.insertAvlKey(heartbeatKeyHex)` immediately (line 1191 of `relayer-daemon.ts`). If the TX fails or is evicted from mempool, local AVL tree diverges from on-chain state → all future Phase 1 TXs brick.

**Fix**:
1. Generate AVL proofs from current history
2. Submit heartbeat TX
3. Store `pendingHeartbeatKey` in `pending_dup_heartbeats` (NOT in committed AVL history yet)
4. On next cycle: verify TX confirmed → commit key to SQLite
5. On failure/reorg: discard pending key (same pattern as Chain β defense)

**Status**: Done. Heartbeat AVL keys are recorded in `pending_dup_heartbeats` and committed to `avl_tree_history` only after the heartbeat TX is confirmed on-chain.

---

### 3. ErgoBridge.sol Recipient Validation

**Bug**: `pegOut()` accepts `ergoRecipientPubKey.length >= 36` — any 36+ bytes pass. The relayer then rejects non-P2PK trees, so the user's sERG is burned but ERG is never released.

**Fix** in `ErgoBridge.sol` lines 147-149: Tighten validation to:
- 33-byte compressed pubkey (`02/03` prefix)
- 36-byte P2PK ErgoTree (`0x0008cd` + 33 bytes)

**Status**: Done in current worktree. `ErgoBridge.sol` now rejects all other lengths and validates both the outer P2PK ErgoTree prefix and inner compressed pubkey prefix. Solidity compilation passes.

---

### 4. Neutralize index.ts

**Problem**: Obsolete v0.5 entrypoint missing all Phase 006 hardening.

**Fix**: Replace with deprecation stub redirecting to `npm run daemon`. Update `package.json`: `"main"` → `"dist/relayer-daemon.js"`.

**Status**: Done. `src/index.ts` is now a fail-fast deprecation stub and `package.json` points `main` at `dist/relayer-daemon.js`.

---

### 5. AVL Commit Timing Hardening

**Bug**: `insertAvlKey(pendingAvlKey)` runs before `buildPhase2()` / MCU matching lookup. If Phase 1 TX fails or is reorged, the AVL key is already committed to local state, diverging from on-chain truth.

**Fix**: Move `insertAvlKey()` AFTER explicit proof that MCU matching is confirmed on-chain (UTXO lookup, not mempool). Same deferred-commit pattern as DUP heartbeat (item 2).

**Status**: Done in current daemon flow. Phase 1 stores `pendingAvlKey`; `processPhase2Unlocks()` commits it only after the MCU output is visible in the confirmed UTXO set.

---

### 6. Deploy Scripts — Local Signing + Committee Injection

Historical implementation target for deploying SCS/DUP/MCL with `atLeast()` guards.

**Current source status**: The generic `deploy.ts` path and the direct `redeploy-scs.ts` / `redeploy-dup.ts` helpers have been retired from source and are guarded against reintroduction. They must not be restored as a shortcut for a future V5 authority/profile cutover. A new reviewed profile-specific provisioner is required; no deploy or redeploy action is authorized by this plan.

---

## Current Source Alignment (2026-07-10)

This update describes current source and non-authorizing observation tooling.
It does not activate a deployment, provide live evidence, close Gate 5, or mark
WP-01 complete beyond source/tooling implementation.

| Item | Status | Notes |
|------|--------|-------|
| 0a. Consume refundable MCL before mint | Source and manifest-bound route observation tooling complete; activation decision open | MCL v3 consumes the full pure-ERG source into the canonical V2 vault using a separate fee input; vault `R4`-`R7` bind source ID, H160, amount, and depositor tree. The durable flow is `detected -> consume_submitted -> consume_confirmed -> minting -> minted`. Mint preconditions re-read canonical commit transaction/block, exact vault output, source absence, and vault unspent state. The expected commit txId, incidents, and reconciliation cursor survive restart. Legacy refundable boxes are never auto-minted; minted-plus-refundable legacy state and commit loss from `minting` onward open the circuit. A strict manifest now binds the exact MCL source/profile, active route, vault and historical MCL set; a bounded two-origin observer classifies complete MCL/vault history and accepts only exact committed-vault transitions. It grants no mint, activation, cutover, signing, submission, or broadcast authority. Unsafe tracked seed/refund helpers are disabled. Independent manifest review, authenticated deployment activation, and real observations remain open. |
| 0b. Legacy reorg-payout containment | Source and manifest-bound observation tooling complete; authenticated cutover decision open | New legacy MCU creation/spend is disabled. The replacement source requires committee `atLeast()` and has no beneficiary timeout. The daemon uses the exact burn verifier only to classify immutable V1 rows and never spends them. `inventory:legacy-mcu` remains diagnostic; `cutover:legacy-mcu-assess` binds an explicit historical address/ErgoTree manifest and expected digest to a coherent network tuple, a bounded checkpoint depth/age window, synchronized indexes, two distinct-origin stable observations, complete pagination, exact observation agreement, and zero-UTXO checks. The tool cannot authenticate review, prove independent source operation or canonical consensus, or authorize cutover. Committee authorization is transitional containment, not finality proof; Gate 5 and the authenticated cutover decision remain open. |

## Historical Execution Status (2026-05-08)

| Item | Status | Notes |
|------|--------|-------|
| 0a. Consume refundable MCL before mint | Open, critical | Mint currently precedes any confirmed Ergo consume transition. |
| 0b. Remove fail-open legacy MCU payout | Historical open finding; source contained and non-authorizing observation tooling implemented by WP-02 | Neither SCS height nor Ergo timeout proves that the burn remains canonical. The reviewed historical manifest, authenticated cutover decision, and real zero-UTXO network observations remain open. |
| 1. `atLeast()` multisig on SCS/DUP/Aggregate DUP/MCL | Implemented, compile + tx-eval verified | SCS, DUP, Aggregate DUP, and MCL use compile-time committee `atLeast()` guards. The current permissionless MCL timeout remains unsafe until item 0a is implemented. `spike010a-committee-guard-eval.ts` confirms a non-committee signer is rejected on the guarded paths. |
| 2. DUP heartbeat pending/confirmed state machine | Done | Pending heartbeat table plus confirmed-chain commit path. |
| 3. ErgoBridge.sol recipient validation | Done | Current Solidity source is strict and compiles. |
| 4. Neutralize `index.ts` | Done | Legacy entrypoint now fails fast; package main redirects to daemon build. |
| 5. AVL commit timing hardening | Done | Phase 1 AVL commit is deferred until MCU UTXO confirmation. |
| 6. Deploy scripts | Legacy SCS/DUP paths retired | The generic deploy path and direct redeploy helpers are absent and guarded against reintroduction. Future V5 provisioning requires an explicit profile-specific design rather than restoring them. |

---

## Remaining Work

| Item | Status | Blocker / Next step |
|------|--------|---------------------|
| Peg-in committed-vault deployment activation and live evidence | P0 | Source and non-authorizing route-observation tooling exist. Independently review the complete route manifest, run the observer against approved distinct non-mainnet origins, then make a separate authenticated activation decision. A passing report alone cannot activate routing or authorize mint. |
| Legacy reorg-payout containment cutover | P0 | First bind a reviewed public manifest to the expected network and complete historical v1 address/script set, then run the read-only inventory for that exact set. The current explicit-address report is diagnostic only. Any scope mismatch, query failure, malformed box, reverted/unverifiable burn, or remaining UTXO blocks cutover; no automatic migration or spend is allowed. |
| Profile-specific deployment/cutover path | Pending | Contracts compile, but no irreversible deployment was performed in this pass. Design a reviewed V5 provisioner and explicit singleton-lineage cutover before any authorized non-mainnet execution. Do not restore the retired SCS/DUP deployment helpers. |
| Transaction-level atLeast evaluation | Done | `spike010a-committee-guard-eval.ts` performs non-destructive local WASM signing/evaluation for SCS, DUP, Aggregate DUP, MCL, and transitional MCU. MCU tests reject stale SCS, wrong recipient, timeout-only payout, insufficient quorum, old signer, and non-committee signer. |
| Experimental spike scripts using node wallet signing | Complete | Spike evaluation scripts now use local WASM signing; the remaining node-wallet signing endpoints are limited to the explicit diagnostic script `verify-avl-state.ts`. |

## Verification Plan

### Automated Tests
```bash
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run
node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts
```

### Manual Verification
- Do not restore or execute a legacy deploy path; define the exact profile, target network, singleton lineage, and authorization in a new reviewed provisioner.
- Compile every applicable `atLeast()` contract variant after placeholder injection; run the non-destructive committee guard evaluation before any explicitly approved non-mainnet deployment.
- Do not use node wallet signing; any future settlement deployment path must use the bridge's reviewed WASM signing boundary.
- Do not stage SQLite, `.env`, or local-only spike funding helpers.
