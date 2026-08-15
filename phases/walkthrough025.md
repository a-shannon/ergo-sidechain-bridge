# Walkthrough 025 — Historical Live Batch Aggregate Settlement Demo

> **Status**: Historical runbook, superseded. It records the former demo target
> but must not be used to initiate a new settlement. New legacy V1 signing,
> authorization, submission, and broadcast routes are physically absent.
> Historical on-chain contracts and already-submitted transaction recovery are
> not removed by that relayer boundary.

> **ContextExtension signing gate (2026-05):** Default-mode WASM-signed V1/batch settlement is blocked by the 4-Var ContextExtension safety guard. This is pending upstream sigma-rust/JVM canonical ContextExtension serialization conformance — not a permanent ErgoScript limit. Patched local devnet execution requires `PATCHED_STACK_MODE=true` and `npm run demo:readiness` showing "Live settlement signing" = PASS.

---

## 1. Purpose

Preserve the design and operational history of the former 2+ claim batch demo.
The offline batch builder and non-broadcast `prepare*` / `check*` surfaces remain
useful diagnostics, but this document no longer defines an executable live
settlement path. A future live path requires a reviewed, separately versioned
external-fee profile, on-chain authority cutover, global replay lineage, and
exact target-node acceptance.

---

## 2. Preconditions

### 2.1 Infrastructure

| Component | Required state |
|---|---|
| Ergo testnet node | Running at `localhost:9052`, synced, API key `hello` |
| Substrate/Frontier node | Running at `localhost:9945` (use `start-substrate.bat`) |
| WASM AVL crate | Built (`cd wasm-avl && wasm-pack build --target nodejs`) |
| Node.js 20+ | Installed |

### 2.2 Deployed contracts

| Contract | Status | Notes |
|---|---|---|
| SideChainState | ✅ Deployed | NFT `818d0c...c627b` |
| DoubleUnlockPrevention (legacy) | ✅ Deployed | NFT `b25482e...a6115` |
| SPVTracker | ✅ Deployed | NFT `199b27...fb803b` |
| DUP Aggregate (single-claim) | ✅ Deployed | NFT `0e8c72...b84ca5` |
| MainChainAggregateUnlock (single) | ✅ Deployed | At aggregate unlock address |
| DUP Aggregate Batch | ✅ Deployed + UTXO verified | NFT `68ccbc...aaeb11`, box `73daab...354b86` (unspent), TX `49e272...4f755b`. R4=counter(0), R5=AVL digest, R6=relayerPK. ErgoTree matches. |
| MainChainAggregateUnlockBatch | ✅ Deployed + UTXO verified | Compiled with real NFT IDs; liquidity box `4e36b0...920160` (unspent, 0.1 ERG), TX `7b9d51...0a74ec`. ErgoTree matches. |

### 2.3 Funding

| Requirement | How to check |
|---|---|
| Relayer wallet has ≥ 0.5 ERG | `npm run status` shows relayer balance |
| MCL (MainChainLock) has ≥ 0.1 ERG locked | Check `byErgoTree` for MCL boxes |
| Batch unlock address has funded box | Historical inventory only; no new funding is permitted for this route |
| EVM relayer (Alith) has sERG balance | `npm run status` shows EVM balance |

### 2.4 Pending claims

The former demo required at least two unprocessed PegOut events. This is a
historical prerequisite, not an instruction to create new burns for the retired
route.

```powershell
# Historical commands intentionally removed.
```

Do not recreate those events for V1 settlement.

---

## 3. Historical Batch Deployment State

The former demo used dedicated batch DUP and unlock instances recorded in local
deployment state. The deployment/funding entrypoint is removed. Those fields and
their on-chain boxes are historical inventory only; they must not be recreated,
refunded, or treated as an active settlement route.

---

## 3.5 Historical Preflight Record

The former preflight sequence checked its deployed boxes and sidechain
contracts. It is retained only to explain old evidence and is not a current
readiness sequence.

### 3.5.1 Ergo-side historical diagnostic

```powershell
# The former package entrypoint is intentionally absent.
```

The source-level checker remains historical diagnostic code and cannot establish
funds authority or Gate 3 readiness.

### 3.5.2 Sidechain-side preflight

```powershell
npm run demo:sidechain:preflight
```

Historically validated Frontier RPC reachability and deployed contract code.
Ephemeral sidechain state does not justify redeploying or reactivating V1.

### 3.5.3 Combined readiness check

```powershell
npm run demo:readiness
```

Runs both Ergo + sidechain checks in one pass, then prints the recommended next-action sequence. Exit code 0 = ready (or warnings only), exit code 1 = critical failure.

### 3.5.4 Current Safe Sequence

Run readiness and status commands only as read-only diagnostics. Do not create
burns for this route, deploy V1 contracts, enable former aggregate flags, or
start a live settlement attempt. The next executable sequence belongs to the
separately versioned external-fee profile after its authority cutover is
reviewed and activated.

---

## 4. Current Command Boundary

The daemon may detect burns and prepare authenticated V2 candidates, but it
holds every burn that would otherwise require the retired legacy route. It does
not build, sign, authorize, submit, or broadcast a new legacy aggregate payout.

The standalone aggregate script exposes only:

- unsigned `prepare*` diagnostics only;
- `confirm*` reconciliation for an exact transaction that was already
  submitted historically.

The former `tryBatchSettlement()` daemon route and all `submit*` commands are
absent. Configuration and historical approval evidence cannot restore them.

---

## 5. Historical Status Transitions

| Stage | SQLite status | Ergo state |
|---|---|---|
| Burn detected | `pending` | No new legacy value release |
| Batch window open | `batch_pending` | Historical behavior only |
| Batch TX submitted | `settlement_submitted` | Historical attempts only |
| TX confirmed | `phase2_unlocked` | Historical reconciliation only |

---

## 6. How to Verify on Ergo

### 6.1 Tracker successor

```powershell
# Find the current SPVTracker box by NFT
curl "http://localhost:9052/blockchain/box/byTokenId/199b273cf16a3832fa297b21bfdaf15b5bfcde33fbe58f9a437aaf5034fb803b"
```

- R5 should contain the updated tracker AVL digest
- The box should carry the tracker NFT

### 6.2 DUP successor (batch)

```powershell
# Find the batch DUP singleton by its NFT ID
curl "http://localhost:9052/blockchain/box/byTokenId/68ccbc08c3ca5034f49384607b8b38ee6f161edffee5a0a1d3eb234af3aaeb11"
```

- R5 should contain the updated DUP AVL digest (with newly inserted burn IDs)
- R4 counter should have incremented

### 6.3 Payout outputs

```powershell
# Check the settlement TX outputs
curl "http://localhost:9052/blockchain/transaction/byId/<settlementTxId>"
```

Expected output layout:
- `OUTPUTS[0]` — SPVTracker successor (carries tracker NFT)
- `OUTPUTS[1]` — Batch DUP successor (carries batch DUP NFT)
- `OUTPUTS[2..N+1]` — Payout outputs (one per claim, to recipient ErgoTrees)
- `OUTPUTS[N+2]` — Change/fee

### 6.4 DB statuses

```powershell
npm run status
# Should show all batch claims as "phase2_unlocked"
```

---

## 7. Failure Modes

| Failure | Symptom | Resolution |
|---|---|---|
| Missing batch contracts | `deployed.doubleUnlockPreventionAggregateBatch is required` | Expected for a fresh environment; keep V1 quarantined |
| Underfunded unlock box | `no aggregate unlock liquidity box covers N nanoERG` | Keep V1 quarantined; do not fund the retired route |
| < 2 pending claims | Historical runner selected another V1 shape | Keep V1 quarantined; do not create burns for this route |
| RPC/node offline | `ECONNREFUSED` on `localhost:9052` | Start Ergo node |
| Duplicate burn ID | `Script reduced to false` (DUP non-membership fails) | Already processed — check DB |
| AVL digest mismatch | `AVL digest mismatch: on-chain X, rebuilt local Y` | Re-scan DUP singleton, clear stale history |
| WASM local signing failure (`fleet-signer.ts`) | `prover` error | Historical only; do not restore the retired signing path |

---

## 8. Safety

- The historical route used local WASM signing and did not use node-wallet
  signing.
- Current code permits unsigned diagnostics and exact recovery of transactions
  submitted before retirement only.
- No configuration, signer material, approval file, or historical state may
  restore signing, submission, or broadcast.

---

## 9. Known Blockers (as of 2026-05-09)

1. **Historical batch contracts**: the 2026-05-09 demo deployment remains an
   inventory fact only. Its deployment command is removed and its boxes are not
   eligible for new value release.
2. **Sidechain state**: The former Frontier demo used ephemeral `--tmp`
   state. That fact does not authorize redeployment for the retired route.
3. **Anchor data**: Historical V1 relied on tracker entries anchored through
   `0x0401`; this does not make its fee equation or funds authority safe.
4. **Pending sidechain burns**: No new burns should be created for the retired
   route.
5. **Historical daemon env flag**: `AGGREGATE_BATCH_ENABLED=true` selected the former batch demo shape. It no longer enables signing, submission, or broadcast and must not be used as a live-settlement instruction.
6. **Liquidity depth**: Recorded batch liquidity is historical inventory only.
   Do not add funds or use it for a new payout.
7. **ContextExtension signing divergence (2026-05)**: WASM (`ergo-lib-wasm-nodejs 0.28`) and JVM (`sigmastate-interpreter 6.0.2`) produce different `bytesToSign` for inputs with >4 context extension Vars. The safety guard in `context-extension-guard.ts` blocks default-mode settlement paths. Patched local devnet mode (`PATCHED_STACK_MODE=true`) is allowed only for loopback validation after readiness PASS. This is pending upstream canonical serialization — not a permanent ErgoScript limit. Do not claim ≤4 Vars is a spec guarantee; do not implement JVM HashMap-order production workarounds.

---

## 10. API Notes

- `/utxo/byId/<boxId>` — returns the box only if it is a **current unspent UTXO**. This is the authoritative check.
- `/blockchain/box/byTokenId/<tokenId>` — returns a **paginated response** `{ items: [...] }`, not a bare array. The `spentTransactionId` field distinguishes spent from unspent. If PowerShell treats the result as a single object rather than an array, access via `$r.items`.
