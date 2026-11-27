# External Security Audit Package — Ergo ↔ Frontier Sidechain Bridge (V1.2)

This document is a self-contained handoff for independent external security auditors reviewing the **Ergo ↔ Frontier EVM Sidechain Bridge** before mainnet deployment.

---

## 1. Audited Artifact Manifest (Deterministic LF-Normalized SHA-256)

Verify exact parity against live repository files anytime via `cd v1 && npm run audit:verify` (enforced in CI):

| File | Lines | SHA-256 (LF-normalized) |
|---|---:|---|
| `v1/contracts/BridgeDepositLock.es` | 205 | `ed38e6b5d2e638478455348c062f98633e423406f856813adfc38d59532261ed` |
| `v1/contracts/BridgeReserve.es` | 353 | `1bb42da5d8f49bd2adc73eb95d682c1981765ad6ae6dd9c92d45171a3548b50f` |
| `v1/contracts/BridgeDup.es` | 534 | `64ad19ce86e676ad678e375988d97a0a6a72c7400c8161564951dee888fc6017` |
| `v1/contracts/BridgeTracker.es` | 379 | `81c6502b97ac8717b4eb2eac3fb1385d7ecacb3905fb51031749b13bdfd4cac5` |
| `v1/contracts/BridgeTrackerStark.es` | 264 | `1aad201b52b9492cc4bc3be70b707d5ad2d2b68e42cc69e1b693bd19c0c9bbda` |
| `v1/solidity/SERG.sol` | 48 | `2fe881f15d354dd4c497a2e5b61b95a2856b829b2541f5675448da5b0002a569` |
| `v1/solidity/ErgoBridge.sol` | 338 | `82d67fc8a70b56ca68f33a4b820f5b559a78022a2551d3855674a584ebe38163` |
| `v1/solidity/BridgeCommitteeTimelock.sol` | 315 | `e170baf0a47c04121b56c130b77b292f225922c602f7df0e9455507ff16d48a6` |
| `v1/solidity/compiled/build-manifest.json` | 193 | `d7e68e1e9c27284a2a96552ae4fc4641140a64d5e47060b99549b8b75e8e7cda` |
| `v1/jvm/BridgeJvmTool.java` | 356 | `e7502e8bc3573fce4a3b2b1bd62442f4f8206edecfbefbbf6f80f6f6a8bfc3be` |

### Additional Critical Off-Chain Review Surface
- **Multi-Host Committee Ceremony & Anti-Blind-Signing**: `v1/src/crypto/ceremony-server.ts`, `v1/src/crypto/ceremony-client.ts`, `v1/src/crypto/signer.ts`, `v1/src/crypto/x509.ts`
- **Core Codecs, AVL Prover & Tx Builders**: `v1/src/core/codecs.ts`, `v1/src/core/avl.ts`, `v1/src/core/contracts.ts`, `v1/src/core/tx-builders.ts`, `wasm-avl/src/lib.rs`
- **Relayer Daemon & Cold State Reconstruction**: `v1/src/relayer/daemon.ts`, `v1/src/state/db.ts`, `v1/src/clients/evm-client.ts`, `v1/src/clients/ergo-node.ts`
- **Web Console, Prometheus Metrics & CLI**: `v1/src/web/server.ts`, `v1/web/app.js`, `v1/src/ops/metrics.ts`, `v1/src/cli.ts`

---

## 2. Formal Security Invariants Catalog

### 2.1 Ergo L1 Invariants (`INV-L1-*`)
- **`INV-L1-01` (Solvency & Buffer Preservation)**: For every `BridgeReserve` transition, `successor.R6 >= 0`, `successor.value >= successor.R6`, and the ERG buffer `value - R6` is strictly preserved across `deposit` and `payout` (never skimmable; `rentRefresh` allows monotonic top-up only).
- **`INV-L1-02` (Exact Deposit Accounting)**: On `commitToReserve`, `BridgeReserve` value and `R6` liability both increase by exact `depositBox.value`, `sourceBoxId -> depositCommitment` is inserted into insert-only `R5` AVL+ tree, and fee change cannot masquerade as `BridgeDepositLock` or `BridgeReserve`.
- **`INV-L1-03` (Guaranteed User Escape Refund)**: Once `HEIGHT >= depositBox.creationHeight + escapeTimeout`, anyone can refund exact `depositBox.value` to `SELF.R5` with output `R4 == SELF.id` (binding against double-satisfaction), even if `R4` intent bytes are malformed.
- **`INV-L1-04` (Commit / Refund Mutual Exclusion)**: `commitToReserve` is valid strictly for `HEIGHT < creationHeight + escapeTimeout`; `refund` is valid strictly for `HEIGHT >= creationHeight + escapeTimeout`.
- **`INV-L1-05` (Burn Nullification / Anti-Double-Spend)**: `BridgeDup` maintains an insert-only AVL+ set (`R5`) keyed by canonical `burnId = blake2b256(encodedBurnLeafV1)`. Spending a `burnId` atomically inserts it into `BridgeDup.R5` in the same transaction as `BridgeReserve` ERG payout; replays fail consensus.
- **`INV-L1-06` (Confirmation Window Enforcement)**: `BridgeDup` enforces `HEIGHT - admissionHeight >= minConfirmations` on the checkpoint authenticated in `DATA_INPUTS(0)`.
- **`INV-L1-07` (Merkle & Recipient Binding)**: `BridgeDup` verifies odd-width Blake2b Merkle inclusion (`1..=256` leaves) against the 370-byte tracker entry's `bridgeEventRoot` and enforces `blake2b256(OUTPUTS(2).propositionBytes) == leaf.recipientErgoTreeHash` and `OUTPUTS(2).value == leaf.amountNanoErg`.
- **`INV-L1-08` (EIP-0045 Tracker Seam Integrity)**: `BridgeDup` authenticates `DATA_INPUTS(0)` strictly by `trackerNftId` + `R4 == familyId` + `R6 == sidechainId` + unified 370-byte AVL value (`authMode ∈ {1, 2}`), enabling seamless timelocked graduation from `BridgeTracker.es` to `BridgeTrackerStark.es` without touching `BridgeReserve` or `BridgeDup`.
- **`INV-L1-09` (Federated Quorum & Monotonicity)**: `BridgeTracker.es` requires `atLeast(t, n)` committee signature (no `0x0401`, SigmaState 6.0.2 verified), strictly monotonic `sourceHeight > R7`, and bounded `admissionHeight ∈ [HEIGHT - maxAdmissionLag, HEIGHT]`.
- **`INV-L1-10` (Timelocked Governance & No Silent Overwrite)**: `proposeUpgrade` requires `pendingMode == 0` (cannot silently overwrite an active proposal), locks `activatesAt = proposeHeight + upgradeTimelockBlocks`, and `executeUpgrade` is permissionless once `HEIGHT >= activatesAt` while moving `trackerNftId` strictly to `pendingTargetScriptHash`.
- **`INV-L1-11` (Singleton Lineage & Register Hygiene)**: All 3 singletons (`reserveNftId`, `dupNftId`, `trackerNftId`) are uniquely preserved across every branch with zero extra unauthorized registers (preventing state-bloat attacks).
- **`INV-L1-12` (Storage Rent Liveness)**: All 3 singletons expose permissionless `rentRefresh` once `HEIGHT - creationHeight >= minRefreshAgeBlocks`, preserving exact state/NFTs while allowing ERG top-up.

### 2.2 Frontier EVM Invariants (`INV-EVM-*`)
- **`INV-EVM-01` (Exact Supply Conservation)**: `SERG.totalSupply() == totalMinted - totalNetBurned` at all times.
- **`INV-EVM-02` (No Unbacked Minting / Chain α Defense)**: `ErgoBridge.withdrawFees()` transfers escrowed sERG fees rather than minting; `SERG.totalSupply()` never changes during fee withdrawal.
- **`INV-EVM-03` (Fee Escrow Parity)**: `ErgoBridge.bridgeSERGBalance() >= ErgoBridge.accumulatedFees()` at all times.
- **`INV-EVM-04` (Anti-Amnesia Deduplication)**: `processedPegIns[ergoBoxId]` permanently rejects duplicate mints for any `bytes32` box ID.
- **`INV-EVM-05` (On-Curve `secp256k1` Recipient Check)**: `ErgoBridge.pegOut()` validates 33-byte SEC1 pubkeys / 36-byte P2PK ErgoTrees and checks quadratic residuosity `y^2 ≡ x^3 + 7 (mod P)` via EVM precompile `0x05` (`bigModExp`) before burning sERG.
- **`INV-EVM-06` (Per-Block Merkle Cap Alignment)**: `ErgoBridge.pegOut()` caps burns at `MAX_PEGOUTS_PER_BLOCK = 256`, matching L1 `BridgeDup.es` Merkle depth bounds.
- **`INV-EVM-07` (Non-Renounceable Ownership)**: `renounceOwnership()` unconditionally reverts on both `SERG.sol` and `ErgoBridge.sol`; public `SERG.burn()` is omitted.
- **`INV-EVM-08` (Strict Role Separation in Timelock)**: `BridgeCommitteeTimelock.relayMintSERG` and `relayUpdateErgoState` are restricted strictly to `onlyMintOperator` (never callable by 1-of-n individual committee members).
- **`INV-EVM-09` (Timelock Delay, Grace Expiry & Quorum Cancel)**: Privileged admin actions require `threshold`-of-`n` confirmations + `block.timestamp >= readyAt`, expire past `readyAt + 7 days`, and require `threshold` confirmations to cancel post-quorum.
- **`INV-EVM-10` (Zero-Delay Emergency Brake)**: Any committee member or `mintOperator` can invoke `emergencyPause` immediately; `unpause` always requires `t`-of-`n` timelocked approval.

### 2.3 Off-Chain Ceremony & Web Ops Invariants (`INV-OPS-*`)
- **`INV-OPS-01` (Key Isolation)**: Coordinator holds zero committee private keys; each `signer-node` holds strictly its own single secret.
- **`INV-OPS-02` (Zero Wire Secret Leakage)**: `cmtWithSecret` / `"secret"` fields are rejected fail-closed at every serialization boundary.
- **`INV-OPS-03` (Single-Use Schnorr Nonces)**: Round-1 private commitments are consumed and purged from RAM before Round-2 signing; session replay fails closed with `409 Conflict`.
- **`INV-OPS-04` (Independent Checkpoint Verification)**: Each `signer-node` independently queries its own Frontier RPC for finality, block hash, per-log `blockHash`, and recomputed burn Merkle root (`createFrontierCheckpointVerifier`), failing closed if absent.
- **`INV-OPS-05` (Default-Disabled Automated Governance)**: `signer-node` disables `proposeUpgrade` and `cancelUpgrade` by default.
- **`INV-OPS-06` (Transport & Replay Defense)**: HMAC-SHA256 + clock-skew check (re-checked after body transfer) + bounded anti-replay nonce cache + mutual TLS (`x509.ts` / `requireClientCert: true`) + separate loopback-only `--health-port`.
- **`INV-OPS-07` (Cold L1 State Reconstructibility)**: Deleting the SQLite database loses zero protocol state; `reconstruct` rebuilds all 3 AVL+ trees from Ergo L1 history with exact digest parity.
- **`INV-OPS-08` (Hardened Web Console)**: Strict CSP (`script-src 'self'`), anti-DNS-rebinding `Host` + same-origin `Origin` enforcement even on `0.0.0.0` Docker binds, exact `BigInt` decimal parsing, fail-closed `503` deposit builder, tri-state solvency telemetry (`OK` / `ALERT` / `EVM_UNVERIFIED`).
- **`INV-OPS-09` (Continuous Observability)**: Prometheus `/metrics` and `v1/ops/prometheus-alerts.yml` surface solvency violations, storage-rent age, indexer lag, pending upgrades, and signer rejection spikes.

---

## 3. Compiled ErgoScript Budget (Stock Ergo 6.0.3 / SigmaState 6.0.2 JVM)

| Contract | Compiled Size | Max Limit | Per-Tx Cost Cap |
|---|---:|---:|---:|
| `BridgeDepositLock.es` | `1,506 B` | `4,095 B` | `<= 1,000,000` |
| `BridgeReserve.es` | `2,587 B` | `4,095 B` | `<= 1,000,000` |
| `BridgeDup.es` | `3,770 B` | `4,095 B` | `<= 1,000,000` |
| `BridgeTracker.es` | `2,526 B` | `4,095 B` | `<= 1,000,000` |
| `BridgeTrackerStark.es` | `1,668 B` | `4,095 B` | preactivation EIP-0045 |

---

## 4. Reproducible Verification Suite (For Auditors)

```bash
# 1. Verify exact audit manifest SHA-256 parity
cd v1 && npm run audit:verify

# 2. Verify deterministic 3-contract Solidity build closure (solc 0.8.35)
cd v1/solidity && npm ci && node compile.js check

# 3. Run Foundry stateless fuzzing (256 runs/test) + stateful invariant campaign (64x32)
cd v1/solidity && forge test -vv

# 4. Build WASM AVL prover, fetch SigmaState 6.0.2 JARs, and run all 5 Vitest suites
#    (full lifecycle, 24 surgical ErgoScript mutations, HTTP + mTLS ceremony, Web/Metrics, codecs/DB)
cd v1 && npm ci && npm run build && npm test

# 5. (Optional with Frontier binary) Live Frontier EVM 80-step stateful fuzzing & timelock test
cd v1 && FRONTIER_BIN=/path/to/frontier-template-node npm run test:timelock-frontier
cd v1 && FRONTIER_BIN=/path/to/frontier-template-node npm run fuzz:evm-frontier

# 6. Verify live Public Ergo Testnet deployment boxes directly
cd v1 && npm run status:testnet
```
