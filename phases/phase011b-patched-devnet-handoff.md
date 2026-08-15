# Phase 011b — Patched Devnet E2E Handoff

**Date:** 2026-05-09
**Status:** Historical and superseded; not executable
**Prerequisite:** `walkthrough026.md` documents the testnet anchor blocker

> This handoff records the former V1 demo path. New legacy V1 signing,
> authorization, submission, and broadcast routes are physically absent.
> Commands below that formerly triggered or submitted settlement must not be
> run. Phase 011b remains bounded showcase evidence, not a live funds path.

---

## Goal

Complete a controlled end-to-end batch aggregate settlement on a **patched Ergo devnet node** that injects `0x0401` extension fields into mined blocks. This proves the full pipeline works when the anchor prerequisite is met.

The patched devnet requires a **two-phase bootstrap**: Phase 1 starts the node with a dummy `0401` value to allow contract deployment and burn triggering, then Phase 2 explicitly resumes the same isolated session with the real bridge event root for settlement. Fresh sessions are the launcher default; continuity requires the same named `-DataDir` plus `-ResumeExistingDataDir`.

---

## Prerequisites

| Item | Path / Command | Notes |
|---|---|---|
| Patched Ergo source | `../ergo-source` | Must contain `CandidateGenerator` patch for extension field injection |
| SBT | `sbt` / `sbt.bat` on PATH | Scala build tool for compiling patched node |
| Java 17+ | System PATH | No `java.xml.bind` option needed |
| Frontier sidechain | `start-substrate.bat` | Ephemeral `--dev --tmp` mode |
| Launcher script | `scripts/run-patched-ergo-devnet.ps1` | Starts patched node on `127.0.0.1:9051` |

---

## Execution Steps

### Step 1 — Start Frontier sidechain

```powershell
# From repo root
.\start-substrate.bat
```

Wait for block production to begin.

### Step 2 — Historical owner-mint deployment (removed)

The former `deploy:sidechain` package command and `deploy-sidechain.ts` script
have been removed. They deployed an owner-authorized mint contract that did not
authenticate an Ergo fact. This historical handoff must not be used to create a
new bridge deployment.

### Step 3 -- Point relayer at patched devnet

```powershell
# Both env vars required -- they control different code paths:
#   ERGO_NODE     -> ergo-helpers.ts (deploy scripts, e2e scripts)
#   ERGO_NODE_URL -> config.ts -> ErgoClient (daemon, preflights)
$env:ERGO_NODE = "http://127.0.0.1:9051"
$env:ERGO_NODE_URL = "http://127.0.0.1:9051"
$env:ERGO_API_KEY = "hello"
```

> **WARNING:** This is a **different chain** from stock testnet (`:9052`).
> Existing testnet deployed boxes (DUP, MCL, MCU, SPVTracker) do **not** exist on devnet.
> All Ergo-side contracts must be redeployed fresh.
> Runtime state (`deployed_state.json`, `bridge-state.sqlite`) from this run is NOT commit-worthy.

### Step 4 -- Start patched devnet with DUMMY extension (Phase 1)

```powershell
cd scripts
.\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:0000000000000000000000000000000000000000000000000000000000000000" -MiningTarget "<compressed-mining-pubkey-hex>" -DataDir "node1-phase011b-<session-id>"
```

The dummy value allows the node to come online for contract deployment.
Record the exact named `-DataDir`; the launcher confines it to the dedicated temporary runtime root.

### Steps 5-6 -- Historical deployment boundary

The former patched-devnet deployment sequence is retired. The aggregate
deployment/funding entrypoint no longer exists, and deploying the EVM contracts
alone cannot create mint or payout authority. Do not continue this handoff into
a new deployment or settlement attempt.

### Step 7 -- Historical burn creation step (removed)

The former E2E trigger command was broadcast-capable and is no longer exposed
by this runner. This archived handoff must not be used to create a deposit,
mint, burn, or runtime mutation. Later diagnostic steps require an already
recorded non-production burn observation.

### Step 8 -- Derive bridge event root

```powershell
npm.cmd run e2e:aggregate -- anchor-env <sidechainTxHash>
```

Copy the printed value, e.g.:
```
ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:cb87e59afa376bb7d38e7a0fd6d8f4e03b83286c324597ff1549cd38617f946c
```

### Step 9 -- Stop and restart devnet with REAL extension (Phase 2)

Ctrl+C in the SBT terminal, then restart:

```powershell
.\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:<bridgeEventRootHex>" -MiningTarget "<compressed-mining-pubkey-hex>" -DataDir "node1-phase011b-<session-id>" -ResumeExistingDataDir
```

The explicit resume flag reuses only the named isolated session, so deployed contracts and mining rewards survive. Omitting the flag fails closed instead of silently reusing state.

### Step 10 -- Verify anchor with expected root

```powershell
npm.cmd run demo:anchor:preflight -- <bridgeEventRootHex>
# Or: npm.cmd run demo:anchor:preflight -- 0401:<bridgeEventRootHex>
npm.cmd run demo:sidechain:preflight
```

The anchor diagnostic may still validate an exact historical `0x0401` value,
but `demo:sidechain:preflight` now rejects the historical owner-mint profile
even when its code is present. No combined readiness PASS is expected or
authorized. Both raw hex and full `0401:<hex>` anchor inputs remain parseable
for historical diagnostics only.

### Step 11 -- Prepare an unsigned aggregate diagnostic

```powershell
npm.cmd run e2e:aggregate -- prepare <sidechainTxHash>
```

This builds an unsigned historical V1 transaction shape. It does not sign,
call `/transactions/check`, authorize settlement, or produce current Gate 3 or
Gate 5 evidence. The operator equivalent is
`npm.cmd run settle:aggregate -- prepare-anchored <sidechainTxHash> <ergoAnchorHeight>`.

### Step 12 -- Legacy V1 retirement boundary

No V1 signing, node-check, submission, or broadcast command exists. Do not
recreate the removed route through a signer, node endpoint, manual script, or
transport adapter. A future live path requires an activated external-fee
replacement profile and exact target-node acceptance.

### Step 13 -- Historical confirmation only

```powershell
npm.cmd run e2e:aggregate -- confirm <sidechainTxHash> <historicalSettlementTxId> <ergoAnchorHeight>
```

Use this only to reconcile an exact transaction already submitted before V1
retirement. It cannot create or transport a replacement payout.

---

## Automation Tools

Seven helper scripts streamline the devnet e2e:

```powershell
# Pre-run safety: inspect runtime files, print backup/restore commands
npm.cmd run demo:devnet:safety

# Signer alignment: verify relayer signer matches devnet mining address
npm.cmd run demo:devnet:signer

# Session env check: no-secret env readiness by default
npm.cmd run demo:devnet:env

# Signer/mining alignment requires explicit local devnet secret-material access
npm.cmd run demo:devnet:env -- --include-secret-material

# Combined go/no-go: checks all prerequisites, env, network, backups, funding, signer alignment
npm.cmd run demo:patched-devnet:go-no-go

# Check relayer ERG balance on patched devnet
npm.cmd run demo:devnet:funding

# Check local prerequisites (ergo-source, sbt, java, env vars, node status)
npm.cmd run demo:patched-devnet:readiness

# Print the full ordered command plan with exact env vars and warnings
npm.cmd run demo:patched-devnet:plan
```

### Shell-Scoped Devnet Session

**Primary (automated):** Source the auto env script that reads `testMnemonic`
from the patched devnet config. Does not print or commit the mnemonic. Use this
only in a local devnet operator shell where reading devnet-only secret material
is explicitly intended.

```powershell
. .\relayer\scripts\devnet-auto-env-from-node1.ps1
npm.cmd run demo:devnet:env -- --include-secret-material
npm.cmd run demo:devnet:signer
npm.cmd run demo:devnet:funding
npm.cmd run demo:patched-devnet:go-no-go
```

**Manual fallback:** Set `WALLET_MNEMONIC` via SecureString, then source template:

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

**After every session**, clean up env vars:

```powershell
. .\relayer\scripts\clear-devnet-session-env.ps1
```

Rules:
- Auto env is devnet-only. Do not use for testnet or mainnet.
- `.local.ps1` is gitignored and must not be committed.
- No `.env` file is needed.
- No node-wallet signing.
- Never use a testnet or mainnet mnemonic in devnet session files.
- Always clear env vars after devnet session.

Recommended pre-run sequence:

```powershell
npm.cmd run demo:devnet:safety        # create backups first
npm.cmd run demo:devnet:signer        # verify signer/mining alignment
npm.cmd run demo:devnet:env           # no-secret env readiness
npm.cmd run demo:devnet:env -- --include-secret-material  # local devnet signer/mining alignment
npm.cmd run demo:devnet:funding       # check relayer balance
npm.cmd run demo:patched-devnet:go-no-go  # all-in-one gate
npm.cmd run demo:patched-devnet:plan   # review command ordering
```

### Funding Requirements

Estimated minimum for a complete e2e run: **0.15 ERG** (150M nanoERG).
Comfortable level for retries/exploration: **0.5 ERG** (500M nanoERG).

Breakdown:
- 4 singleton deployments (SCS, DUP, SPVTracker, AggDUP): ~24.4M nanoERG
- Aggregate deployments (batch singleton + liquidity): ~17.2M nanoERG
- MainChainLock seed for peg-in trigger: ~23.3M nanoERG
- Settlement fee boxes + change dust + margin: ~35M nanoERG

### Genesis Funding (Devnet Only)

Use a devnet-only local signer mnemonic. If using the patched node1 devnet
config, ensure the mining payout/funding path credits the same local signer
address. For node1, `minerRewardDelay` is configured as 1 block, so mining
rewards become spendable almost immediately.

Do not use node-wallet signing or node wallet API in this workflow.
The relayer uses ergo-lib-wasm-nodejs (fleet-signer.ts) for all signing.

> **ContextExtension signing gate (2026-05):** If the ContextExtension safety guard rejects a settlement TX, do not proceed. Upstream sigma-rust/JVM canonical serialization conformance is pending for default mode. In patched local mode, `PATCHED_STACK_MODE=true` must be active and `npm run demo:readiness` must show "Live settlement signing" = PASS before Step 11.

> Backups must exist before devnet deployment.
> `go-no-go` is read-only — it never mutates files or network state.

> `deployed_state.json` is intentionally overwritten during devnet deployment and must not be committed.
> `bridge-state.sqlite` is runtime-only daemon state and must not be staged after a devnet run.

---

## Warnings

> **⚠️ Network isolation:** Do not confuse stock testnet `:9052` with patched devnet `:9051`. They are separate chains with separate UTXO sets.

> **⚠️ Deployment state:** `deployed_state.json` will be overwritten by devnet deployment. Do not commit this unless you intend to switch the canonical deployment target.

> **⚠️ SQLite state:** `bridge-state.sqlite` will contain devnet-specific peg-out rows. Do not stage.

> **WARNING:** The launcher creates a fresh random session by default. Resume only the exact named Phase 1 directory with `-ResumeExistingDataDir`; never substitute a legacy or unrelated node directory.

---

## Expected Outcome

After Phase 2 restart, the settlement pipeline should:
1. Detect the real `0x0401` anchor field (matching the bridge event root)
2. Derive the SPV tracker ingest entry
3. Build the aggregate settlement TX (same-TX tracker ingest + payout)
4. Submit to the patched devnet
5. Confirm and reconcile SQLite state

This validates the full pipeline: burn -> anchor -> restart -> settle -> confirm.
