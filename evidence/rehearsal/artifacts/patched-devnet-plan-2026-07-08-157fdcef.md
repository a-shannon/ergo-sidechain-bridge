======================================================================
  Patched Devnet E2E Settlement - Command Plan
======================================================================

This plan prints exact commands for a controlled patched-devnet e2e.
Do NOT execute these commands blindly. Review each step.
Target patched node: http://127.0.0.1:9051

"Bridge root" = the ergo-sidechain-bridge directory.

----------------------------------------------------------------------
  ENV VAR WARNING

  Two separate env vars control Ergo node URL:
    ERGO_NODE     - used by ergo-helpers.ts (deploy, e2e scripts)
    ERGO_NODE_URL - used by config.ts -> ErgoClient (daemon, preflight)

  You MUST set BOTH to the patched devnet URL for a full e2e.
----------------------------------------------------------------------

----------------------------------------------------------------------
  TWO-PHASE BOOTSTRAP

  The patched devnet injects a fixed 0x0401 value into every mined block.
  But the real bridge event root depends on the sidechain burn TX,
  which requires an online Ergo node with deployed contracts.

  Phase 1: Start with dummy 0401, deploy contracts, trigger burns.
  Phase 2: Restart with real 0401, wait for confirmations, settle.

  The patched devnet preserves /tmp/ergo/node1/data across restarts.
  Deployed contracts and mining rewards survive the restart.
----------------------------------------------------------------------

======================================================================
  PHASE 1 -- Bootstrap (dummy 0401)
======================================================================

======================================================================
  Step 1 - Start Frontier sidechain (ephemeral)
======================================================================
  > # From bridge root:
  > .\start-substrate.bat

  WARN: Uses --dev --tmp. State does not persist between runs.
  WARN: Wait for block production to begin before continuing.

======================================================================
  Step 2 - Set env vars for patched devnet
======================================================================
  > $env:ERGO_NODE = "http://127.0.0.1:9051"
  > $env:ERGO_NODE_URL = "http://127.0.0.1:9051"
  > $env:ERGO_API_KEY = "<operator-local-devnet-api-key-not-for-evidence>"
  > $env:PATCHED_STACK_MODE = "true"
  > $env:E2E_AGGREGATE_SIGNING_ENABLED = "true"
  > $env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS = "1"
  > $env:AGGREGATE_ANCHOR_LOOKBACK_BLOCKS = "100"
  > $env:AGGREGATE_BATCH_ENABLED = "true"

  WARN: ERGO_NODE is for deploy scripts (ergo-helpers.ts).
  WARN: ERGO_NODE_URL is for daemon/preflight (config.ts -> ErgoClient).
  WARN: Both MUST be set to the same loopback origin -- guard validates both.
  WARN: Keep ERGO_API_KEY scoped to the private operator shell and do not serialize its value into evidence.
  WARN: PATCHED_STACK_MODE=true raises the ContextExtension guard to 128.
  WARN: E2E_AGGREGATE_SIGNING_ENABLED=true permits local WASM signing for trigger/check/submit/run in this scoped shell only.
  WARN: It does not authorize broadcast; submit and trigger remain separately gated.
  WARN:   Guard requires both URLs to be loopback and same origin.
  WARN:   Will THROW at startup if either URL is remote, missing, or mismatched.
  WARN:   Only valid on a local devnet node built from sigmastate-interpreter #1122.
  WARN: Lowered confirmations for fast devnet iteration.

======================================================================
  Step 3 - Start patched Ergo devnet with DUMMY extension
======================================================================
  > # From bridge root (separate terminal):
  > .\scripts\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:0000000000000000000000000000000000000000000000000000000000000000"

  WARN: Starts patched node on http://127.0.0.1:9051 (default devnet port).
  WARN: Uses a dummy 0401 value (64 zero hex) -- this is intentional.
  WARN: The real bridge event root will be injected after trigger in Phase 2.
  WARN: Wait for the node to start mining (SBT + JVM warmup 1-2 min).

======================================================================
  Step 3.5 - Validate frozen TX byte conformance (GATE)
======================================================================
  > # All commands assume cwd = bridge root (ergo-sidechain-bridge).
  >
  > # 1. sigma-rust extractor (output: _frozen_sigma_rust_bytes.hex):
  > Push-Location relayer/.devnet-diagnostics/tx-bytes-extractor
  > cargo run -- ../_frozen_unsigned_tx.json ../_frozen_sigma_rust_bytes.hex
  > Pop-Location
  >
  > # 2. Patched JVM extractor (output: _frozen_jvm_bytes.hex):
  > # First update jvm-bytes-extractor/build.sbt: "sigma-state" % "6.0.3-SNAPSHOT"
  > Push-Location relayer/.devnet-diagnostics/jvm-bytes-extractor
  > sbt "run ../_frozen_unsigned_tx.json ../_frozen_jvm_bytes.hex"
  > Pop-Location
  >
  > # 3. Compare (defaults to _frozen_jvm_bytes.hex + _frozen_sigma_rust_bytes.hex):
  > npx tsx relayer/.devnet-diagnostics/validate-patched-stack.ts

  WARN: Push-Location / Pop-Location ensures each block returns to bridge root.
  WARN: Both extractors MUST produce identical bytesToSign hex and TX ID.
  WARN: If they differ: STOP. The patched JVM does not match sigma-rust.
  WARN: This uses frozen diagnostics only -- NOT live boxes.
  WARN: Do NOT skip this gate.

======================================================================
  Step 4 - Fund relayer wallet on devnet
======================================================================
  > # Funding is automatic if WALLET_MNEMONIC matches the testMnemonic.
  > # Safe default checks do not read mnemonic or node config material:
  > npm.cmd run demo:devnet:signer
  > npm.cmd run demo:devnet:funding
  >
  > # Public address balance check without secret material:
  > npm.cmd run demo:devnet:funding -- --address <relayer-address>
  >
  > # Operator-local secret-material checks, only in a scoped private shell:
  > npm.cmd run demo:devnet:signer -- --include-secret-material
  > npm.cmd run demo:devnet:funding -- --include-secret-material
  >
  > # Convert redacted signer/funding outputs into guarded Gate 3 summary artifacts:
  > npm.cmd run rehearsal:local-devnet-signer-funding-summary -- --source-commit <current-commit> --execution-request ../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-08-157fdcef.md --signer-output ../evidence/live-rehearsals/<redacted-signer-output.md> --funding-output ../evidence/live-rehearsals/<redacted-funding-output.md> --signer-command "npm run demo:devnet:signer -- --include-secret-material" --funding-command "npm run demo:devnet:funding -- --address <relayer-address>" --secret-material-scope "scoped private local operator shell; no values serialized" --out ../evidence/live-rehearsals/<local-devnet-signer-funding-summary.md> --json-out ../evidence/live-rehearsals/<local-devnet-signer-funding-summary.json>

  WARN: The relayer wallet address is derived from WALLET_MNEMONIC.
  WARN: Devnet has a separate UTXO set - testnet funds are not available.
  WARN: If signer alignment is PASS, mining rewards fund the relayer directly.
  WARN: Default signer/funding commands now return no-secret blocked summaries unless an address or explicit local opt-in is provided.
  WARN: The Gate 3 summary command consumes only redacted Markdown outputs and must not receive secret values, raw node config, runtime databases, or deployment state.
  WARN: Do not use node-wallet signing in this workflow.

======================================================================
  Step 5 - Deploy Ergo-side contracts on patched devnet
======================================================================
  > cd relayer
  > npm.cmd run deploy
  > npm.cmd run deploy:aggregate
  > npm.cmd run deploy:aggregate -- --batch

  WARN: Deploys SCS/DUP/MCL/MCU + SPVTracker + batch variants.
  WARN: Overwrites contracts/deployed_state.json (do NOT commit).
  WARN: All deployed boxes are devnet-local.

======================================================================
  Step 6 - Deploy EVM contracts to Frontier
======================================================================
  > npm.cmd run deploy:sidechain

  WARN: Deploys BridgeVault.sol + sERGToken.sol on the ephemeral sidechain.
  WARN: Writes EVM addresses to contracts/deployed_state.json (do NOT commit).

======================================================================
  Step 7 - Create peg-out burns on sidechain
======================================================================
  > npm.cmd run e2e:aggregate -- trigger

  WARN: Trigger is broadcast-capable and remains blocked unless BRIDGE_BROADCAST_ENABLED=true is set in a scoped shell after explicit approval.
  WARN: Seeds sERG via MainChainLock (requires Ergo node + deployed contracts).
  WARN: Burns via pegOut() on sidechain.
  WARN: Records PegOut events in SQLite.
  WARN: Note the sidechainTxHash for the next step.

======================================================================
  Step 8 - Derive anchor extension field value
======================================================================
  > npm.cmd run e2e:aggregate -- anchor-env <sidechainTxHash>

  WARN: Prints: ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<bridgeEventRootHex>
  WARN: Copy the <bridgeEventRootHex> (or full 0401:<hex>) for Phase 2.
  WARN: Requires Frontier sidechain to be running (reads EVM receipt).

======================================================================
  PHASE 2 -- Restart with real 0401 and settle
======================================================================

======================================================================
  Step 9 - Stop patched Ergo devnet
======================================================================
  > # Ctrl+C in the SBT terminal running the patched node.

  WARN: The data dir /tmp/ergo/node1/data is preserved.
  WARN: Deployed contracts and mining rewards survive the restart.

======================================================================
  Step 10 - Restart patched Ergo devnet with REAL extension
======================================================================
  > # From bridge root (separate terminal):
  > .\scripts\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:<bridgeEventRootHex>"

  WARN: Now injecting the real bridge event root into every mined block.
  WARN: Wait for 2+ blocks to be mined before running anchor preflight.

======================================================================
  Step 11 - Run readiness checks
======================================================================
  > npm.cmd run demo:devnet:safety
  > npm.cmd run demo:sidechain:preflight
  > npm.cmd run demo:patched-devnet:readiness
  > npm.cmd run demo:batch:preflight
  > npm.cmd run demo:anchor:preflight -- <bridgeEventRootHex>
  > # Or: npm.cmd run demo:anchor:preflight -- 0401:<bridgeEventRootHex>
  > npm.cmd run demo:readiness

  WARN: demo:anchor:preflight must be root-bound with raw hex or full 0401:<hex> pair for readiness.
  WARN: A bare anchor scan requires --allow-generic-anchor-scan, is diagnostic only, and exits non-zero for readiness.
  WARN: demo:batch:preflight should show PASS for deployed boxes.
  WARN: demo:sidechain:preflight verifies Frontier is still online.

======================================================================
  Step 12 - Build and check aggregate settlement (CHECK ONLY)
======================================================================
  > # Build fresh TX from live devnet boxes, WASM-sign, send to /transactions/check:
  > npm.cmd run e2e:aggregate -- check <sidechainTxHash>

  WARN: Builds a FRESH TX from live devnet boxes (not frozen fixtures).
  WARN: WASM-signs with PATCHED_STACK_MODE=true (guard at 128).
  WARN: Sends signed TX to /transactions/check on the patched local node.
  WARN: /transactions/check validates without broadcasting.
  WARN: DO NOT proceed to Step 13 unless /transactions/check returns success.

======================================================================
  Step 13 - Submit aggregate settlement (REQUIRES EXPLICIT APPROVAL)
======================================================================
  > # WARNING: DO NOT EXECUTE without explicit operator approval.
  > # This broadcasts the TX to the patched devnet mempool.
  > npm.cmd run e2e:aggregate -- submit <sidechainTxHash> <expectedTxId-from-check>

  WARN: Waits for the matching 0x0401 anchor, builds and submits settlement TX.
  WARN: Prints the settlementTxId and ergoAnchorHeight on success.
  WARN: This step requires SEPARATE explicit approval from the operator.

======================================================================
  Step 14 - Confirm settlement
======================================================================
  > npm.cmd run e2e:aggregate -- confirm <sidechainTxHash> <settlementTxId> <ergoAnchorHeight>

  WARN: Reconciles SQLite state with on-chain settlement.
  WARN: bridge-state.sqlite will contain devnet-specific data - do NOT commit.

======================================================================
  Plan complete. Review each step before executing.
======================================================================

Post-run cleanup:
  - Do NOT commit contracts/deployed_state.json (devnet deployment)
  - Do NOT commit relayer/bridge-state.sqlite (devnet runtime state)
  - To restore testnet config: unset ERGO_NODE, unset ERGO_NODE_URL
  - Run: . .\relayer\scripts\clear-devnet-session-env.ps1
