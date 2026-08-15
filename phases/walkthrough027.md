# Walkthrough 027 — Patched Devnet Go/No-Go Audit + E2E Attempt

Date: 2026-05-09
HEAD: `559a789` (start) -> commits below

> **Current status:** Historical and superseded. This audit records former V1
> command surfaces; it is not a current execution sequence. New legacy V1
> signing, authorization, submission, and broadcast routes are physically
> absent. Commands such as `trigger`, `run`, and `submit` below must not be used.

---

## 1. Objective

Turn the documented patched-devnet runbook into an operator-grade execution flow:
- Combined go/no-go preflight
- Real local backups of runtime state
- Audited e2e command ordering
- Attempt the controlled e2e if prerequisites are met

---

## 2. E2E Command Ordering Audit

Inspected:
- `relayer/src/scripts/e2e-aggregate-settlement.ts`
- the former `relayer/src/scripts/deploy-sidechain.ts`, now removed
- `relayer/src/scripts/deploy.ts`
- the former aggregate deployment entrypoint, now removed
- `start-substrate.bat`
- `scripts/run-patched-ergo-devnet.ps1`

### Audit Findings

| Question | Answer |
|---|---|
| Did the former trigger route require Ergo contracts deployed? | **Yes.** `seedSergIfNeeded()` read the deployed MainChainLock tree. |
| Does it require patched Ergo devnet running? | **Yes.** `seedSergIfNeeded()` calls `ergo.getCurrentHeight()` and `ergo.getUnspentBoxesByAddress()`. |
| Does it seed sERG itself? | **Yes.** Creates a `MainChainLock` TX on Ergo, then calls `bridge.mintSERG()` on EVM. Self-contained. |
| What does `anchor-env` need? | A `sidechainTxHash` from a prior `trigger` run (stored in SQLite `peg_out_events`). |
| Which step first requires patched Ergo node? | **Step 3** (`trigger`), because `seedSergIfNeeded` talks to Ergo L1. |
| Which historical step first mutated `deployed_state.json`? | **Step 2** (the removed `deploy:sidechain` route), which wrote `solidity.sergAddress`/`bridgeAddress`. |
| Which step first mutates SQLite? | **Step 3** (`trigger`), which calls `state.insertPegOut()`. |

### Ordering Verdict

The historical ordering analysis remains useful for understanding dependencies,
but it no longer defines an executable sequence. The owner-mint trigger,
aggregate deployment, signing, checking, authorization, submission, and
broadcast surfaces have been retired. A new operator order must be specified
only for the separately versioned external-fee profile after authority cutover.

---

## 3. Tooling Added

### 3.1 `.devnet-backups/` gitignore

Added `.devnet-backups/` to `.gitignore` to prevent accidental staging.

### 3.2 Real backups created

```
.devnet-backups/deployed_state.2026-05-09T20-02-17.json.bak  (26985 bytes)
.devnet-backups/bridge-state.2026-05-09T20-02-17.sqlite.bak  (45056 bytes)
```

### 3.3 Go/No-Go script

`relayer/src/scripts/patched-devnet-go-no-go.ts` — combined checklist with
pure helpers extracted to `relayer/src/patched-devnet-go-no-go.ts`:

- Mandatory: ergo-source, devnet launcher, substrate starter, frontier binary, all npm scripts
- Env: ERGO_NODE/ERGO_NODE_URL alignment via patched-devnet-env.ts
- Network: patched Ergo node + Frontier RPC (WARN if offline)
- State: actual git dirty detection for runtime files
- Backups: .devnet-backups/ contains both backup files

Historical three-tier verdict:
- `NO-GO` (exit 1): mandatory prerequisites were missing
- `LOCAL PREREQS OK -- EXECUTION NOT READY` (exit 0): files existed but live checks warned
- the former `READY FOR CONTROLLED DEVNET EXECUTION` result is superseded and
  never authorizes the retired owner-mint or aggregate-payout paths

```
npm.cmd run demo:patched-devnet:go-no-go
```

Result: **LOCAL PREREQS OK -- EXECUTION NOT READY** — all mandatory items PASS,
live-execution blocked by offline devnet, unset env vars, and dirty runtime files.

---

## 4. Controlled E2E Attempt

### 4.1 Go/No-Go Result

```
  [PASS] ergo-source
  [PASS] run-patched-ergo-devnet.ps1
  [PASS] start-substrate.bat
  [PASS] frontier-template-node.exe
  [PASS] all 8 required npm scripts
  [WARN] Ergo node env vars: neither set
  [WARN] Patched Ergo devnet: offline
  [PASS] Frontier sidechain: online, block=2383
  [WARN] contracts/deployed_state.json (dirty?): has uncommitted changes
  [WARN] relayer/bridge-state.sqlite (dirty?): has uncommitted changes
  [PASS] Devnet backups: both present

  RESULT: LOCAL PREREQS OK -- EXECUTION NOT READY
```

### 4.2 Blocker: Patched Ergo Devnet Not Running

The controlled e2e requires the patched Ergo devnet to be running. Starting it
requires:

1. Building ergo-source with SBT (multi-minute, JVM-heavy)
2. Running `scripts/run-patched-ergo-devnet.ps1` with correct extension fields
3. Waiting for the devnet to reach a mining-ready state
4. Funding the relayer wallet on the devnet chain

These are interactive, long-running steps that cannot be safely automated in a
single session. The devnet is not currently running.

### 4.3 Archived Decision

The live attempt was not executed. The former follow-up sequence is retired,
not deferred: no current operator may turn this walkthrough into an owner-mint
or aggregate-payout run. The retained output records prerequisite diagnostics
only and authorizes no deployment, signing, submission, broadcast, or funds.

---

## 5. Funding Investigation

### 5.1 Devnet Config Analysis

The patched devnet launcher (`run-patched-ergo-devnet.ps1`) includes:
- Config chain: `application.conf` -> `devnet.conf` -> `node1/application.conf`
- `node1/application.conf` defines a pre-configured mining wallet with 5 keys
- `mining = true`, `offlineGeneration = true`, `minerRewardDelay = 1`
- REST API at `127.0.0.1:9051` with `apiKeyHash = null` (no auth)
- Mining rewards become spendable after 1 block (node1 config)

### 5.2 Funding Requirement Estimate

| Operation | nanoERG | ERG |
|---|---|---|
| 4 singleton boxes (SCS, DUP, SPVTracker, AggDUP) @ 5M | 20M | 0.020 |
| 4 deployment miner fees @ 1.1M | 4.4M | 0.0044 |
| Batch singleton + fee | 6.1M | 0.0061 |
| Liquidity box + fee | 11.1M | 0.0111 |
| MainChainLock seed (2 burns @ 10M + fees) | 23.3M | 0.0233 |
| Settlement fee box | 2.2M | 0.0022 |
| Change dust + retry margin | 33M | 0.033 |
| **Total estimate** | **100.1M** | **0.1001** |
| **Minimum (with margin)** | **150M** | **0.15** |
| **Comfortable level** | **500M** | **0.5** |

### 5.3 Genesis Pre-Funding Path

Use a devnet-only local signer mnemonic. If using the patched node1 devnet
config, ensure the mining payout/funding path credits the same local signer
address. For node1, `minerRewardDelay` is configured as 1 block, so mining
rewards become spendable almost immediately.

Do not use node-wallet signing or node wallet API in this workflow.
The relayer always signs via ergo-lib-wasm-nodejs (fleet-signer.ts).

### 5.4 Funding Preflight Script

```
npm.cmd run demo:devnet:funding
```

Reports relayer balance vs minimum/comfortable thresholds. Integrated into
`demo:patched-devnet:go-no-go` (skips check when node offline).

### 5.5 Signer Alignment Preflight

```
npm.cmd run demo:devnet:signer
```

Verifies the relayer local signer (`WALLET_MNEMONIC`) derives the same P2PK
address that receives mining rewards on the patched devnet. Reads the
`node1/application.conf` to detect whether a test mining wallet exists and
derives the mining address for comparison. Never prints or returns the mnemonic.

Integrated into `demo:patched-devnet:go-no-go` as a live-execution check.

Prefer shell-scoped env for `WALLET_MNEMONIC` during devnet sessions rather
than storing it in `.env`, unless the operator explicitly accepts local risk.

---

## 6. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `vitest` | **237/237** |
| `contracts:check` | PASS |
| `showcase` | PASS 4/4 |
| `demo:devnet:safety` | PASS |
| `demo:devnet:signer` | WARN (WALLET_MNEMONIC not set) |
| `demo:devnet:env` | 0 PASS, 6 WARN (no env vars set in bare shell) |
| `demo:devnet:funding` | WARN (WALLET_MNEMONIC not set) |
| `demo:patched-devnet:go-no-go` | LOCAL PREREQS OK (6 live-execution warnings) |
| `demo:patched-devnet:readiness` | PASS (2 warnings) |
| `demo:patched-devnet:plan` | PASS (ASCII-only) |

Runtime files not staged. Backups present and gitignored.

---

## 7. Files Changed

| File | Action |
|---|---|
| `.gitignore` | Added `.devnet-backups/`, `relayer/scripts/*.local.ps1` |
| `relayer/scripts/devnet-session-env.template.ps1` | NEW -- shell-scoped env template (no secrets) |
| `relayer/src/devnet-funding-preflight.ts` | NEW -- pure helpers (funding thresholds, ERG formatting, classification) |
| `relayer/src/devnet-funding-preflight.test.ts` | NEW -- 16 tests for funding helpers |
| `relayer/src/scripts/devnet-funding-preflight.ts` | NEW -- CLI funding preflight |
| `relayer/src/devnet-signer-alignment.ts` | NEW -- pure helpers (config parsing, address derivation, alignment) |
| `relayer/src/devnet-signer-alignment.test.ts` | NEW -- 16 tests for alignment helpers |
| `relayer/src/scripts/devnet-signer-alignment.ts` | NEW -- CLI signer alignment preflight |
| `relayer/src/devnet-session-env.ts` | NEW -- pure helpers (URL alignment, batch config, signer checks) |
| `relayer/src/devnet-session-env.test.ts` | NEW -- 25 tests for env check helpers |
| `relayer/src/scripts/devnet-session-env-check.ts` | NEW -- CLI session env checker |
| `relayer/src/patched-devnet-go-no-go.ts` | NEW -- pure helpers (verdict, runtime file, report) |
| `relayer/src/patched-devnet-go-no-go.test.ts` | NEW -- 12 tests for verdict and formatting |
| `relayer/scripts/clear-devnet-session-env.ps1` | NEW -- cleanup script to remove all session env vars |
| `relayer/package.json` | Added `demo:devnet:funding`, `demo:devnet:signer`, `demo:devnet:env`, `demo:patched-devnet:go-no-go` |
| `phases/phase011b-patched-devnet-handoff.md` | Added funding, signer, env, shell-scoped session, and cleanup sections |
| `phases/phase-index.md` | Added entries |
| `phases/walkthrough027.md` | This document |

---

## 8. Current Follow-Up

Do not resume this runbook. The next implementation work belongs to the V4
authority-switch package: define distinct V4 statement/proof domains, bind the
reviewed commitment producer, contain Root/Sudo authority, and prove complete
historical deployment and replay lineage. A new execution runbook may be
written only after that profile is reviewed and activated; this document must
remain historical.
