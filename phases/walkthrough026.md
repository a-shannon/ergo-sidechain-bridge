# Walkthrough 026 — Live Batch Demo Attempt (Blocked on 0x0401 Anchor)

**Date:** 2026-05-09
**Status:** Attempted — blocked on missing `0x0401` extension anchor
**Prerequisite commits:** `ffc1d8a`, `704d33f`, `6892923`

> **Current status:** Historical and superseded. This file preserves an old
> experiment; it is not an execution runbook. New legacy V1 signing,
> authorization, submission, and broadcast routes are physically absent.
> Commands below that formerly initiated settlement must not be run. Offline
> diagnostics and exact historical reconciliation remain.

---

## 1. Result Matrix

| Step | Result | Detail |
|---|---|---|
| Ergo batch preflight | ✅ PASS | height=334191, DUP + unlock live |
| Frontier sidechain | ✅ PASS | Started via `start-substrate.bat --dev --tmp`, block=49 |
| EVM deploy | ✅ PASS | SERG + ErgoBridge redeployed to ephemeral `--tmp` node |
| Peg-in mint | ✅ PASS | Daemon minted 3× 0.05 sERG from prior MCL locks |
| Peg-out burn 1 | ✅ `0xb22efe…f7c9` | 0.02 sERG burned, block 46, net 0.015 ERG |
| Peg-out burn 2 | ✅ `0x0e7fb5…95d1` | 0.02 sERG burned, block 49, net 0.015 ERG |
| Batch settlement | ❌ BLOCKED | Daemon loops: `waiting for confirmed 0x0401 anchor` |
| TX result | — | No batch settlement TX produced |

---

## 2. Blocker Analysis: Missing `0x0401` Extension Anchor

### What happens

The aggregate settlement pipeline (both single-claim and batch) requires a **confirmed Ergo block extension field** with key prefix `04` (specifically `0401`) containing the sidechain block hash and bridge event root. The daemon function `findAnchoredTrackerIngest()` scans the last `AGGREGATE_ANCHOR_LOOKBACK_BLOCKS` (default 720) confirmed Ergo blocks looking for this field.

### Why it's missing

The stock Ergo testnet node does **not** inject `0x0401` extension fields. This is a merged-mining feature that requires a **patched Ergo node** that reads `ERGO_SIDECHAIN_EXTENSION_FIELDS` from its environment and includes the field in mined blocks.

### Config parameters

| Parameter | Default | Env var |
|---|---|---|
| Min confirmations | 10 | `AGGREGATE_ANCHOR_MIN_CONFIRMATIONS` |
| Lookback window | 720 blocks | `AGGREGATE_ANCHOR_LOOKBACK_BLOCKS` |

---

## 3. Resolution Path: Patched Ergo Devnet Node

A patched Ergo node and launcher already exist locally:

### 3.1 Prerequisites

- `ergo-source/` at `../ergo-source` — patched node with `CandidateGenerator` extension field injection
- `sbt` available on `PATH`, or pass an explicit `-SbtPath <sbt-bat>` to the launcher
- Java 17+ (no `java.xml.bind` option)

### 3.2 Get the bridge event root

```powershell
cd relayer
npm run e2e:aggregate -- anchor-env <sidechainTxHash>
```

This prints:
```
ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<bridgeEventRootHex>
```

### 3.3 Start patched devnet miner

```powershell
cd scripts
.\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:<bridgeEventRootHex>" -MiningTarget "<compressed-mining-pubkey-hex>"
```

The patched node:
- Mines on devnet with extension field injection
- Listens on `127.0.0.1:9051` (separate from stock testnet at `:9052`)
- Injects `0x0401` into every mined block

### 3.4 Environment boundary: testnet vs patched devnet

The live attempt in §1 ran against the **stock Ergo testnet** node at `:9052`. The patched devnet launcher starts a **separate devnet** node at `127.0.0.1:9051`.

These are different networks:
- **Testnet** has the deployed contracts (DUP, MCL, MCU, SPVTracker) and the MCL lock boxes that funded the peg-in mints.
- **Patched devnet** is a fresh chain with no deployed state. All Ergo-side contracts and singleton NFTs must be redeployed on devnet before the e2e runner can submit settlement.

Therefore the patched devnet resolution path is a **controlled e2e completion on a clean chain**, not a direct continuation of the testnet attempt. To complete the demo on testnet directly, a patched testnet miner would need to produce `0x0401` anchors — this requires either a modified testnet mining pool or running a patched node as a solo miner on testnet.

When using the patched devnet, point the relayer at it:
```powershell
$env:ERGO_NODE = "http://127.0.0.1:9051"
```

### 3.5 Historical settlement boundary

The former daemon path continued from anchor discovery into signing and
transport. That path is retired and must not be reconstructed: legacy V1
charges the Ergo miner fee to protected backing while burning only the net
sidechain amount.

### 3.6 Retired manual runner

No executable V1 settlement command remains. The current runner stops at
unsigned preparation and retains confirmation only for exact historical
transactions. Live completion requires the separately versioned external-fee
replacement profile.

---

## 4. Anchor Preflight Script

Implemented as `npm run demo:anchor:preflight`:

```powershell
cd relayer
npm.cmd run demo:anchor:preflight
```

The script:
1. Connects to the Ergo node and reads current height
2. Scans recent blocks (up to `AGGREGATE_ANCHOR_LOOKBACK_BLOCKS`, default 720) for `0x0401` extension fields
3. Reports anchor count, newest height, value preview, and age in blocks
4. Classifies readiness:
   - **PASS**: anchor exists with age ≥ `AGGREGATE_ANCHOR_MIN_CONFIRMATIONS` (default 10)
   - **WARN**: anchor exists but too young
   - **FAIL**: no anchor found in scan window

**Expected behavior:**
- On **stock testnet**: FAIL (no miner injects `0x0401`)
- On **patched devnet**: PASS after enough blocks mined with extension injection

Historically, this connected the retired batch-deployment diagnostic to the
anchor dependency. It does not restore a live V1 settlement route.

### 4.1. Patched Devnet Automation

Three additional scripts prepare the controlled devnet e2e:

```powershell
# Check local prerequisites (ergo-source, sbt, java, env vars, node connectivity)
npm.cmd run demo:patched-devnet:readiness

# Print the full ordered command plan with exact env vars and warnings
npm.cmd run demo:patched-devnet:plan

# Pre-run safety: inspect runtime files, print backup/restore commands
npm.cmd run demo:devnet:safety
```

**Env var inconsistency note:**
- `ERGO_NODE` - used by `ergo-helpers.ts` (deploy scripts, e2e scripts, legacy `nget`/`npost`)
- `ERGO_NODE_URL` - used by `config.ts` -> `ErgoClient` (daemon, preflights)
- **Both must be set** when pointing at the patched devnet to avoid half the system talking to stock testnet.

**Runtime state policy:**
- `deployed_state.json` is intentionally overwritten during devnet deployment. Do not commit.
- `bridge-state.sqlite` is runtime-only daemon state. Do not stage after a devnet run.

---

## 5. Safety Notes

- No node wallet signing used
- No secrets printed or touched
- `relayer/bridge-state.sqlite` modified by daemon runtime — **not staged**
- `contracts/deployed_state.json` only changed `sidechainDeployedAt` timestamp (ephemeral EVM redeploy) — **not staged**
- Frontier sidechain started with `--tmp` (ephemeral state, no persistence)
