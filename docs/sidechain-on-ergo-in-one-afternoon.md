# Sidechain on Ergo in One Afternoon

> **Audience**: Solidity / Substrate / rollup developers.
> You know EVM. You know Merkle roots. You know bridge settlement delays.
> This guide maps every Ergo concept to something you already understand.

> **Current status:** Architecture walkthrough and offline reference only. The
> former owner-mint and legacy aggregate payout routes are retired. This guide
> does not provide a deployable or live-settlement sequence.

---

## 1. What You Already Know from EVM

If you have built apps on Ethereum, Polygon, Arbitrum, Base, or any Frontier chain, the **sidechain** side of this bridge is entirely familiar:

- **Solidity contracts** — `ErgoBridge.sol` manages minting and burning the wrapped asset.
- **ERC-20 token** — `SERG.sol` is a standard ERC-20 representing bridged ERG on the sidechain.
- **MetaMask-compatible RPC** — the Substrate/Frontier node exposes the same `eth_*` JSON-RPC you use everywhere.
- **EVM events** — `PegOut(address user, uint256 amount, string ergoRecipient)` triggers a withdrawal.
- **Standard indexing** — ethers.js event filters, block polling, receipt parsing.

Nothing changes on the app layer. You can port an existing Solidity dApp onto this sidechain with no modifications.

---

## 2. What Ergo Adds

The settlement layer — the part that holds real liquidity and enforces withdrawal integrity — runs on Ergo L1. Here is the concept translation:

| EVM concept | Ergo equivalent | Why it matters |
|---|---|---|
| Contract storage slot | **Box register** (R4–R9) | State is explicit: each box is a typed cell with a known transition rule. You can inspect it with a simple API call. |
| Contract address identity | **Singleton NFT** | The state-machine identity is a token inside the box, not just an address. Move the NFT → move the identity. |
| Calldata | **Context extension** (Var) | Proof data is passed per transaction — not permanently stored on-chain. Keeps boxes small, proofs ephemeral. |
| `staticcall` / read-only state | **DataInput** | A transaction can read authenticated state from another box without consuming it. |
| Mapping root / Merkle root | **AVL digest** | Commit large off-chain sets on-chain, then prove individual membership/non-membership with compact proofs. |
| Replay-protection mapping | **DUP AVL tree** | The `DoubleUnlockPrevention` singleton tracks burn IDs using an AVL+ tree. Insert + non-membership proof in one TX. |
| Batched withdrawals | **Batch unlock TX** | One Ergo transaction pays multiple sidechain exits while updating replay protection once. |
| Sharded contracts | **Sharded boxes** | Scale by splitting state across independent boxes that can be consumed in parallel. No global mutable lock. |

### The "wow" moment

> Keep your Solidity app layer. The scary eUTXO parts — contract compilation, proof generation, transaction assembly, signing — are pre-packaged in this repository.

---

## 3. Local Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Ergo testnet node | 6.0.3+ | `localhost:9052`, API key `hello` |
| Node.js | 20+ | For the TypeScript relayer |
| Rust + wasm-pack | stable | To build the AVL+ WASM crate |
| Substrate/Frontier node | Required locally | `substrate-node/` binary or `FRONTIER_TEMPLATE_NODE_PATH` pointing at a local build |

---

## 4. Start Ergo Node and Frontier Sidechain

### Ergo testnet node

```bash
# Use your existing testnet node config (application.conf with testnet = true)
java -jar ergo-6.0.3.jar --testnet -c application.conf
```

Wait for sync. Confirm with:

```bash
curl http://localhost:9052/info
```

### Substrate/Frontier sidechain

```powershell
# From project root
.\start-substrate.bat
# Or manually:
.\substrate-node\frontier-template-node.exe --dev --tmp --rpc-port 9945 --rpc-cors all
```

`.\start-substrate.bat` reads `FRONTIER_TEMPLATE_NODE_PATH` when the Frontier
binary lives outside `.\substrate-node\frontier-template-node.exe`.

---

## 5. Build And Inspect The Reference Stack

```bash
cd relayer && npm ci

# 1. Compile and verify ErgoScript contracts
npm run contracts:check

# 2. Run offline readiness diagnostics
npm run demo:readiness
```

The former aggregate deployment/funding entrypoint is removed. The retained
generic deployment script cannot create the retired SPV tracker, aggregate DUP,
or aggregate unlock V1 route. A separately versioned external-fee profile needs
its own reviewed activation and runbook before any deployment is supported.

---

## 6. Peg-In: ERG → sERG

**Target protocol**:

1. Observe a canonical Ergo deposit.
2. Consume it in a confirmed transaction that creates the exact
   non-refundable vault successor.
3. Authenticate the canonical Ergo fact at the sidechain mint authority.
4. Mint once under a domain-bound, idempotent mint identity.

The former owner-authorized mint entrypoint is retired. Observation, local
journal state, or a configured RPC response cannot authorize minting.

**EVM mental model**: Deposit ETH into a bridge contract → receive wrapped token on L2.

`refundable deposit -> confirmed consumption -> non-refundable vault -> authenticated mint`

---

## 7. Peg-Out: sERG → ERG

**Target protocol**:

1. Prove a burn from the exact reviewed bridge/token application under the
   source-chain finality rule.
2. Bind recipient, raw amount, asset, sidechain ID, burn ID, checkpoint, and
   proof profile.
3. Atomically insert the burn ID into the global DUP lineage and release only
   the corresponding reserve liability.
4. Fund the Ergo miner fee externally so protected backing decreases by exactly
   the burned amount.

The former two-phase and aggregate V1 payout routes are historical only. No new
legacy transaction can be signed, checked, authorized, submitted, or broadcast.

**EVM mental model**: Burn wrapped token → wait for finality → claim on L1.

`finalized burn proof + exact payout binding + DUP insert + external fee -> ERG payout`

---

## 8. Batch Settlement

Instead of settling one withdrawal at a time, the batch path bundles multiple exits into a single Ergo transaction:

| Property | Single claim | Batch (10 claims) |
|---|---|---|
| Ergo TXs | 1 per withdrawal | 1 for up to 10 |
| DUP updates | 1 insert proof | 1 batched insert, N lookups |
| L1 cost | Full TX per user | Amortized across batch |
| Parallelism | Singleton bottleneck | Shardable with multiple DUP/liquidity boxes |

The legacy batch design remains available for offline inspection and benchmark work. It:

1. Builds a `BatchSettlementPlan` with packed claim cores (109 bytes each).
2. Generates AVL proofs for all burn IDs in a single WASM call.
3. Assembles the batch TX: `SPVTracker + DUP + UnlockBatch → payouts + fee`.
4. Demonstrates how single-claim and batch shapes differ.

> **Current boundary:** New legacy V1 daemon, CLI, programmatic signing,
> authorization, submission, and broadcast paths are physically absent because
> V1 deducts its miner fee from protected backing. Use `npm run showcase` for
> offline demonstration. A live path requires the reviewed external-fee
> replacement profile and on-chain authority cutover.

### Run the benchmark

```powershell
cd relayer
npm run showcase:benchmark
```

---

## 9. Inspect the Proof Objects

For EVM developers used to thinking in terms of calldata and Merkle proofs, the Ergo context extensions are the equivalent data channel. Run:

```powershell
cd relayer
npm run showcase:proofs
```

This prints a human-readable breakdown of every proof object used by the bridge:

| Object | EVM analogy | Size | Purpose |
|---|---|---|---|
| Tracker key | Indexed event key | 32 bytes | blake2b hash identifying a sidechain block entry |
| Tracker value | Event payload | 36 bytes | bridge event root (32B) + Ergo anchor height (4B) |
| DUP lookup proof | Merkle non-membership proof | Variable | Proves a burn ID has NOT been processed |
| DUP insert proof | Merkle insert proof | Variable | Proves the burn ID was inserted into the replay set |
| Claim core | Packed calldata struct | 109 bytes | `trackerKey(32) \|\| burnTxId(32) \|\| amount(8) \|\| recipientTree(36) \|\| selector(1)` |
| AVL digest | State/storage root | 33 bytes | Committed tree root (32B digest + 1B height) |

---

## 10. Troubleshooting

### Node not syncing

```bash
curl http://localhost:9052/info
# Check fullHeight and headersHeight — they should be close
```

### Wallet has no funds

Use the [Ergo testnet faucet](https://testnet.ergofaucet.org/) to get test ERG.

### "Script reduced to false"

This means the ErgoScript contract rejected the transaction. Common causes:

- **Wrong AVL proof**: The DUP lookup proof does not match the current tree digest. Re-scan the DUP singleton box.
- **Burn ID already spent**: The DUP tree already contains this TX hash. This is the anti-replay protection working correctly.
- **Height mismatch**: `HEIGHT <= SELF.R8` failed because the creation height stamp is in the future. Use `<= HEIGHT` patterns.
- **Missing NFT**: The successor output does not carry the singleton NFT. Check `OUTPUTS(0).tokens(0)._1 == SELF.tokens(0)._1`.

### Sidechain RPC not responding

```powershell
curl http://localhost:9945 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Phase 2 stuck at "waiting for confirmation"

Check `SideChainState.R4` (latest known sidechain height). It must be ≥ `burnHeight + 50`. The SCS oracle updates automatically every ~10 sidechain blocks when the daemon is running.

---

## Glossary

| Term | Definition |
|---|---|
| **eUTXO** | Extended UTXO model — each "box" is a self-contained state cell with typed registers and spending conditions. |
| **Box** | An Ergo UTXO. Contains value (nanoERG), tokens, registers R4–R9, and an ErgoTree (spending script). |
| **ErgoTree** | Compiled spending condition — analogous to EVM bytecode but for functional guard scripts. |
| **Singleton NFT** | A token minted exactly once (from the genesis box ID). Used to authenticate state-machine identity. |
| **Context extension** | Per-input key-value data passed at transaction time. Not stored on-chain. Think of it as `msg.data` / calldata. |
| **DataInput** | A box referenced by a transaction for reading only. The box is not consumed. Like a `staticcall`. |
| **AVL+ tree** | An authenticated dictionary stored as a compact digest on-chain. Full tree lives off-chain; proofs are generated on demand. |
| **DUP** | DoubleUnlockPrevention — the anti-replay singleton that tracks which burn TX IDs have been processed. |
| **SCS** | SideChainState — the oracle singleton that records the latest known sidechain block height on Ergo. |
| **MCL** | MainChainLock — the deposit vault contract. ERG goes in here during peg-in. |
| **MCU** | MainChainUnlock — the time-locked withdrawal contract. ERG exits here during peg-out Phase 2. |
| **SPVTracker** | The on-chain tracker for anchored sidechain block entries and bridge event roots. |

---

## What This Prototype Does NOT Claim

- ❌ Base-level liquidity or tooling maturity.
- ❌ Fully trustless bridge (SPV relay is Phase 011; today uses committee signing).
- ❌ Production-grade sequencer throughput.
- ❌ Zero operational assumptions.

## What It Does Demonstrate

- ✅ EVM app layer stays familiar.
- ✅ Ergo settlement state is explicit and auditable.
- ✅ Batch settlement amortizes L1 costs.
- ✅ eUTXO boxes enable parallel settlement lanes.
- ✅ AVL proofs keep on-chain state compact.
- ✅ Architecture is structured for a committee → proof-based trust upgrade.
