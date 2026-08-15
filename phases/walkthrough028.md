# Walkthrough 028 -- Patched Devnet Execution Checklist

Phase: 011b
Date: 2026-05-09
HEAD at creation: `8ead32f`
Updated: `c24533f` (fix details), current commit (two-phase bootstrap fix)

> **Current status:** Historical and superseded. This checklist cannot initiate
> a new settlement: legacy V1 signing, authorization, submission, and broadcast
> routes are physically absent. Preserve the steps as experiment history only;
> do not run former `trigger`, `run`, or `submit` commands.

---

## 0. Prerequisites Confirmed

Before reaching this checklist, the following were verified:

| Prerequisite | Status |
|---|---|
| `ergo-source` directory | PASS |
| `run-patched-ergo-devnet.ps1` | PASS |
| `start-substrate.bat` | PASS |
| `frontier-template-node.exe` | PASS |
| All deploy/e2e scripts | PASS |
| Backups in `.devnet-backups/` | PASS |
| Frontier sidechain | Online at `127.0.0.1:9945` (verified by `demo:sidechain:preflight`) |
| Patched Ergo devnet | Offline (not yet started) |
| `contracts/deployed_state.json` | Dirty (uncommitted -- expected) |
| `relayer/bridge-state.sqlite` | Dirty (uncommitted -- expected) |
| WALLET_MNEMONIC | Not set (expected at this stage) |

---

## 1. Two-Phase Bootstrap Model

The patched devnet injects a fixed `0x0401` extension value into every mined block.
But the correct bridge event root depends on the sidechain burn TX, which requires
an online Ergo node with deployed contracts.

**Phase 1**: Start patched devnet with dummy `0401` (64 zero hex), deploy contracts,
trigger sidechain burns, derive the real bridge event root.

**Phase 2**: Explicitly resume the same isolated patched-devnet session with the
real `0401:<bridgeEventRootHex>`. The launcher is fresh-by-default; continuity
requires the same named `-DataDir` and `-ResumeExistingDataDir`.

---

## 2. Patched Devnet Launch Reference

The launch script is `scripts/run-patched-ergo-devnet.ps1`.

Config merge order (last wins):
1. `application.conf` (stock Ergo defaults)
2. `devnet.conf` (devnet overrides -- networkType=devnet, addressPrefix=16, blockInterval=100ms)
3. `node1/application.conf` (our overrides -- minerRewardDelay=1, port 9051, testMnemonic)
4. Per-session merged config under the dedicated temporary runtime root

Key parameters:
- **REST API**: `127.0.0.1:9051`
- **API key**: `hello` (hash: `324dcf...`)
- **minerRewardDelay**: `1` (overrides devnet.conf's 720)
- **Mining**: internal, offline, 5s polling
- **Data dir**: fresh named descendant of the dedicated temporary runtime root; explicit resume only
- **Extension injection**: via `$env:ERGO_SIDECHAIN_EXTENSION_FIELDS` (mandatory param `-ExtensionFields`)
- **Build**: SBT compiles and runs `org.ergoplatform.ErgoApp` from `ergo-source/`

To stop the node safely: Ctrl+C in the terminal running SBT.

---

## 3. Execution Checklist

### Step 1 -- Set devnet environment

**Primary (automated):** Source the auto env script that reads `testMnemonic`
from the patched devnet config. Does not print the mnemonic.

```powershell
. .\relayer\scripts\devnet-auto-env-from-node1.ps1
```

**Manual fallback:** Set `WALLET_MNEMONIC` via SecureString, then source the template:

```powershell
$secure = Read-Host "Enter devnet-only WALLET_MNEMONIC" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:WALLET_MNEMONIC = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable secure, bstr -ErrorAction SilentlyContinue
}
. .\relayer\scripts\devnet-session-env.template.ps1
```

Both paths set `WALLET_MNEMONIC`, `ERGO_NODE`, `ERGO_NODE_URL`, and all batch/anchor vars.
The auto path is devnet-only. Do not use it for testnet or mainnet.

### Step 2 -- Verify environment

```powershell
npm.cmd run demo:devnet:env
```

Expected: ALL CHECKS PASS (with only WALLET_MNEMONIC-related items as INFO).

### Step 3 -- Verify signer alignment

```powershell
npm.cmd run demo:devnet:signer
```

Expected: PASS -- relayer address matches mining address.

**STOP CONDITION**: If signer mismatch, do not proceed. The relayer WALLET_MNEMONIC
must derive the same address as the patched devnet's testMnemonic mining wallet.

### Step 4 -- Verify Frontier sidechain

```powershell
npm.cmd run demo:sidechain:preflight
```

Expected: PASS -- Frontier online, SERG + ErgoBridge deployed.

**STOP CONDITION**: If Frontier is offline, start it first:
```powershell
.\start-substrate.bat
```

---

### PHASE 1 -- Bootstrap with dummy extension

### Step 5 -- Start patched Ergo devnet with DUMMY extension

Open a **separate terminal** and run:

```powershell
cd <bridge-root>
.\scripts\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:0000000000000000000000000000000000000000000000000000000000000000" -MiningTarget "<compressed-mining-pubkey-hex>" -DataDir "node1-phase011b-<session-id>"
```

Wait for the node to start mining (SBT compile + JVM warmup takes 1-2 minutes).

The dummy `0401` value allows the node to come online so we can deploy contracts
and trigger sidechain burns. The real value will be injected after restart.

**STOP CONDITION**: If the node fails to start, check SBT/Java installation and config paths.

### Step 6 -- Verify funding

```powershell
npm.cmd run demo:devnet:funding
```

Expected: PASS -- relayer balance >= 0.15 ERG from mining rewards.

**STOP CONDITION**: If balance is below 0.15 ERG after 2+ mined blocks,
check minerRewardDelay (should be 1) and signer alignment.

### Steps 7-8 -- Historical deployment boundary

The former Ergo aggregate and EVM deployment sequence is retired. The dedicated
aggregate deployment command no longer exists, and the retained generic deploy
script cannot create or fund the V1 tracker/DUP/unlock route. Do not continue
from this historical checklist into deployment or settlement.

### Step 9 -- Historical burn creation step (removed)

The former E2E trigger command was broadcast-capable and is no longer exposed.
This archived checklist must not create a deposit, mint, burn, or runtime
mutation. Later diagnostic steps require an already recorded non-production
burn observation and its `<sidechainTxHash>`.

### Step 10 -- Derive the real bridge event root

```powershell
npm.cmd run e2e:aggregate -- anchor-env <sidechainTxHash>
```

Prints: `ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<bridgeEventRootHex>`

Save the `<bridgeEventRootHex>` value (or the full `0401:<bridgeEventRootHex>`) for Phase 2.

---

### PHASE 2 -- Restart with real extension and inspect unsigned settlement shape

### Step 11 -- Stop patched Ergo devnet

Ctrl+C in the SBT terminal running the patched node.

Keep the exact Phase 1 `-DataDir` name. Do not point the launcher at a legacy or unrelated node directory.

### Step 12 -- Restart patched Ergo devnet with REAL extension

In the same terminal:

```powershell
.\scripts\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:<bridgeEventRootHex>" -MiningTarget "<compressed-mining-pubkey-hex>" -DataDir "node1-phase011b-<session-id>" -ResumeExistingDataDir
```

Wait for 2+ blocks to be mined with the real extension value.

### Step 13 -- Anchor preflight with expected root

```powershell
npm.cmd run demo:anchor:preflight -- <bridgeEventRootHex>
```

Or pass the full extension pair (both are accepted):

```powershell
npm.cmd run demo:anchor:preflight -- 0401:<bridgeEventRootHex>
```

Verify that the `0x0401` extension field contains the **real** bridge event root.
The preflight normalizes the input, so raw hex, `0x`-prefixed, or `0401:<hex>` all work.

**STOP CONDITION**: If anchor preflight reports FAIL (no matching root),
wait for more blocks to be mined with the real extension.

### Step 14 -- Full go/no-go

```powershell
npm.cmd run demo:patched-devnet:go-no-go
```

Expected: `RESULT: LOCAL PREREQS OK -- VALUE EXECUTION DISABLED; reviewed activated profile required`

**STOP CONDITION**: Do not proceed to value execution. Even an all-green local
preflight cannot activate the retired owner-mint profile. Only the unsigned
diagnostic below remains permitted.

### Step 15 -- Prepare an unsigned aggregate diagnostic

```powershell
npm.cmd run e2e:aggregate -- prepare <sidechainTxHash>
```

This builds an unsigned historical V1 transaction shape. It does not sign,
call `/transactions/check`, authorize settlement, or produce current Gate 3 or
Gate 5 evidence. The operator equivalent is
`npm.cmd run settle:aggregate -- prepare-anchored <sidechainTxHash> <ergoAnchorHeight>`.

### Step 16 -- Legacy V1 retirement boundary

No V1 signing, node-check, submission, or broadcast command exists. Do not
recreate the removed route through a signer, node endpoint, manual script, or
transport adapter. A future live path requires an activated external-fee
replacement profile and exact target-node acceptance.

### Step 17 -- Historical confirmation only

```powershell
npm.cmd run e2e:aggregate -- confirm <sidechainTxHash> <historicalSettlementTxId> <ergoAnchorHeight>
```

Use this only to reconcile an exact transaction already submitted before V1
retirement. It cannot create or transport a replacement payout.

Reconciles SQLite state with on-chain settlement.

### Step 18 -- Record results

After successful completion:
- Note settlement TX IDs
- Note anchor heights
- Note any errors or retries

### Step 19 -- Clean up environment

```powershell
. .\relayer\scripts\clear-devnet-session-env.ps1
```

Stop the patched Ergo node (Ctrl+C in its terminal).

### Step 19 -- Verify clean state

```powershell
git status --short -- contracts/deployed_state.json relayer/bridge-state.sqlite .env relayer/.env
```

Do not stage runtime files. If restoring pre-devnet state:

```powershell
# Restore from backup (check .devnet-backups/ for timestamps)
Copy-Item -LiteralPath ".devnet-backups\deployed_state.<ts>.json.bak" -Destination "contracts/deployed_state.json" -Force
Copy-Item -LiteralPath ".devnet-backups\bridge-state.<ts>.sqlite.bak" -Destination "relayer/bridge-state.sqlite" -Force
```

---

## 4. Stop Conditions Summary

Abort execution immediately if any of these occur:

| Condition | Action |
|---|---|
| Signer alignment mismatch | Fix WALLET_MNEMONIC to match mining address |
| Funding below 0.15 ERG | Wait for more blocks or check minerRewardDelay |
| Patched devnet offline when expected online | Restart node, check SBT/Java |
| Missing `0x0401` in extensions | Check `-ExtensionFields` argument to launch script |
| Anchor preflight: wrong `0x0401` value | Stop, then explicitly resume the same named session with the correct `bridgeEventRootHex` |
| Any node-wallet signing requirement | NEVER use node-wallet signing -- fix the code path |
| Any attempt to stage runtime files | Do not commit `deployed_state.json` or `bridge-state.sqlite` |
| Go/no-go shows FAIL | Resolve the failing check before proceeding |
| Go/no-go shows WARN after env is set | Investigate and resolve before live execution |
| ContextExtension signing guard rejects TX | Do not proceed. For local patched devnet, verify `PATCHED_STACK_MODE=true` and `npm run demo:readiness`; for production/default mode, wait for upstream ContextExtension serialization conformance. |

---

## 5. Safety Rules

- No `.env` file is written or committed.
- `WALLET_MNEMONIC` is set ephemerally in the shell only.
- No node-wallet signing (`/wallet/transaction/sign`) is used.
- Runtime files are never staged or committed.
- Environment is cleaned after every session.
- All preflight scripts are read-only (no state mutation, no DB writes).

---

## 6. Results

_To be filled during execution._

| Metric | Value |
|---|---|
| Settlement TX ID | |
| Anchor height | |
| Blocks mined (Phase 1) | |
| Blocks mined (Phase 2) | |
| Peg-in TX | |
| Peg-out TX | |
| Errors | |
| Duration | |
