# Phase 001 â€” Scaffold & Contract Deployment

> **Goal**: Deploy the 5 ErgoScript contracts to Ergo Testnet, scaffold the relayer project, and establish the project structure for all subsequent phases.

---

## 1. Overview

This phase sets the foundation. We deploy the on-chain contracts that will hold locked ERG and track sidechain state, scaffold the TypeScript relayer project, and ensure the testnet node is operational.

**No off-chain logic runs yet** â€” this phase is purely about getting the contracts on-chain and the project skeleton ready.

### Deliverables

1. âœ… All 5 ErgoScript contracts compiled and deployed to Ergo Testnet
2. âœ… SideChainState box created with initial empty state (height=0, empty digests)
3. âœ… DoubleUnlockPrevention box created with empty AVL+ tree
4. âœ… Relayer TypeScript project scaffolded (Fleet SDK + ethers.js)
5. âœ… Project structure created for all subprojects
6. âœ… Testnet wallet funded and operational

---

## 2. Prerequisites

### 2.1 Ergo Testnet Node

- [ ] Verify Ergo testnet node is running and synced
- [ ] Wallet unlocked with sufficient tERG (request from faucet if needed)
- [ ] API accessible at `http://localhost:9052` (testnet default)
- [ ] Node version â‰¥ 5.0.x (v6 preferred for future EIP-0050 compatibility)

> **Skill reference**: See `/ergo-testnet-node` workflow for startup/troubleshooting.

### 2.2 Development Environment

- [ ] Node.js â‰¥ 20 LTS
- [ ] Rust toolchain (rustup) + wasm-pack
- [ ] TypeScript 5.x
- [ ] Python 3.10+ (for `ergo_avltree` fallback)

---

## 3. Project Structure Creation

### 3.1 Directory Layout

```
ergo-sidechain-bridge/
â”œâ”€â”€ README.md                          # âœ… Created
â”œâ”€â”€ phases/
â”‚   â”œâ”€â”€ phase-index.md                 # âœ… Created
â”‚   â””â”€â”€ implementationplan001.md       # âœ… This file
â”œâ”€â”€ contracts/
â”‚   â”œâ”€â”€ SideChainState.es              # ErgoScript: sidechain state singleton
â”‚   â”œâ”€â”€ MainChainLock.es               # ErgoScript: ERG lock for peg-in
â”‚   â”œâ”€â”€ MainChainUnlock.es             # ErgoScript: two-phase ERG unlock for peg-out
â”‚   â”œâ”€â”€ SideChainUnlock.es             # ErgoScript: sERG release on sidechain (adapted)
â”‚   â”œâ”€â”€ DoubleUnlockPrevention.es      # ErgoScript: AVL+ replay protection
â”‚   â””â”€â”€ compiled_contracts.json        # Compiled ErgoTree hex + addresses
â”œâ”€â”€ relayer/
â”‚   â”œâ”€â”€ package.json
â”‚   â”œâ”€â”€ tsconfig.json
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ config.ts                  # Addresses, NFT IDs, contract hashes
â”‚   â”‚   â”œâ”€â”€ ergo-client.ts             # Ergo node API wrapper (Fleet SDK)
â”‚   â”‚   â”œâ”€â”€ substrate-client.ts        # Substrate/EVM client wrapper (ethers.js)
â”‚   â”‚   â”œâ”€â”€ state-tracker.ts           # SQLite state persistence
â”‚   â”‚   â”œâ”€â”€ peg-in.ts                  # Peg-In flow (Phase 004)
â”‚   â”‚   â”œâ”€â”€ peg-out.ts                 # Peg-Out flow (Phase 005)
â”‚   â”‚   â””â”€â”€ index.ts                   # Main entry point
â”‚   â””â”€â”€ wasm-pkg/                      # WASM packages (Phase 003)
â”œâ”€â”€ wasm-avl/
â”‚   â”œâ”€â”€ Cargo.toml                     # Bridge-adapted AVL+ crate
â”‚   â””â”€â”€ src/lib.rs                     # Phase 003
â”œâ”€â”€ solidity/
â”‚   â”œâ”€â”€ SERG.sol                       # sERG ERC-20 token
â”‚   â””â”€â”€ ErgoBridge.sol                 # Bridge relay contract
â”œâ”€â”€ substrate-node/                    # Phase 002
â””â”€â”€ docs/
    â””â”€â”€ addendum.md                    # Phase 007
```

---

## 4. Contract Implementation

### 4.1 SideChainState.es

The canonical sidechain state box on Ergo L1. Holds the latest sidechain block header commitment.

**Register Layout:**

| Register | Type | Content | Initial Value |
|----------|------|---------|---------------|
| R4 | `Long` | Sidechain block height | `0` |
| R5 | `Coll[Byte]` | Transaction digest T_h | `0x00...00` (32 zeros) |
| R6 | `Coll[Byte]` | UTXO set digest U_h | `0x00...00` (32 zeros) |
| R7 | `Coll[Byte]` | Chain digest C_h (AVL+ root) | Empty AVL digest |
| R8 | `Int` | Ergo mainchain HEIGHT at last update | `0` |

**Token**: `tokens(0)` = Singleton NFT (minted during deployment)

**Spending condition (Phase 1 â€” relayer mode):**

```scala
{
  // Phase 1: Single relayer authorization
  val relayerPk = PK("RELAYER_TESTNET_ADDRESS")
  
  // State must advance
  val successor = OUTPUTS(0)
  val heightAdvances = successor.R4[Long].get > SELF.R4[Long].get
  val preserveNFT = successor.tokens(0) == SELF.tokens(0)
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val stampHeight = successor.R8[Int].get == HEIGHT
  val oneUpdatePerBlock = HEIGHT > SELF.R8[Int].get
  
  sigmaProp(
    relayerPk &&
    heightAdvances &&
    preserveNFT &&
    preserveContract &&
    stampHeight &&
    oneUpdatePerBlock
  )
}
```

> **Note**: In Phase 008 (merged mining), `relayerPk` will be replaced by `proveDlog(CONTEXT.preHeader.minerPk)`.

### 4.2 DoubleUnlockPrevention.es

AVL+ tree tracking spent sidechain burn TX IDs. Prevents double-claiming on peg-out.

**Register Layout:**

| Register | Type | Content | Initial Value |
|----------|------|---------|---------------|
| R4 | `Long` | Operation counter | `0` |
| R5 | `AvlTree` | Spent TX IDs (AVL+ tree digest) | Empty AVL digest |

**Token**: `tokens(0)` = Singleton NFT

```scala
{
  val relayerPk = PK("RELAYER_TESTNET_ADDRESS")
  
  val spentIdsTree = SELF.R5[AvlTree].get
  val proof = getVar[Coll[Byte]](0).get
  val newTxId = getVar[Coll[Byte]](1).get
  
  // Verify this TX ID has NOT been spent
  val notSpent = spentIdsTree.get(newTxId, proof).isEmpty
  
  // Insert into the tree (key=txId, value=0x01)
  val toInsert = Coll((newTxId, Coll[Byte](1)))
  val insertProof = getVar[Coll[Byte]](2).get
  val modifiedTree = spentIdsTree.insert(toInsert, insertProof).get
  
  // Verify successor preserves updated tree
  val successor = OUTPUTS(0)
  val validUpdate = successor.R5[AvlTree].get.digest == modifiedTree.digest
  val preserveNFT = successor.tokens(0) == SELF.tokens(0)
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  
  sigmaProp(
    relayerPk &&
    notSpent &&
    validUpdate &&
    preserveNFT &&
    preserveContract &&
    counterAdvances
  )
}
```

> **CRITICAL (Batch Proof Mandate)**: If the relayer processes multiple peg-outs in a single TX, the `insertProof` MUST be a single unified batch proof generated ONCE after ALL insertions. See our Scorex AVL+ Batch Proof KI.

### 4.3 MainChainLock.es

Users send ERG to this contract to initiate a peg-in. The relayer watches for new boxes at this address.

```scala
{
  // Anyone can lock ERG here for peg-in
  // R4: Coll[Byte] â€” Target EVM H160 address (20 bytes)
  // R5: Long â€” Amount to mint on sidechain (in wei-equivalent)
  
  val targetAddress = SELF.R4[Coll[Byte]].get
  val amount = SELF.R5[Long].get
  
  // Only the relayer can spend this (to process the peg-in)
  val relayerPk = PK("RELAYER_TESTNET_ADDRESS")
  
  sigmaProp(relayerPk)
}
```

### 4.4 MainChainUnlock.es

Two-phase unlock for peg-out. Phase 1: verify sidechain burn proof. Phase 2: after confirmations, release ERG.

```scala
{
  val relayerPk = PK("RELAYER_TESTNET_ADDRESS")
  
  // R4: Coll[Byte] â€” Sidechain burn TX ID
  // R5: Long â€” Amount to unlock
  // R6: Coll[Byte] â€” Recipient Ergo address (ErgoTree)
  // R7: Int â€” Creation height (for confirmation counting)
  
  val burnTxId = SELF.R4[Coll[Byte]].get
  val unlockAmount = SELF.R5[Long].get
  val recipientTree = SELF.R6[Coll[Byte]].get
  
  // Phase 2: After 50 sidechain confirmations (tracked by SideChainState height)
  // The relayer builds the TX that sends unlockAmount to recipientTree
  
  sigmaProp(relayerPk)
}
```

> **Note**: The 50-confirmation check will be enforced by the relayer logic off-chain in Phase 1. In Phase 008+, it will move on-chain via SideChainState DataInput verification.

### 4.5 SideChainUnlock.es (Adapted)

In the original whitepaper, this runs on the sidechain and uses `getVar[AvlTree](125)` (context variable #125 = mainchain UTXO digest). Since our sidechain is Substrate/EVM, this contract is **replaced by the Solidity `ErgoBridge.sol`** contract. We keep the `.es` file for reference only.

---

## 5. Contract Deployment Procedure

### 5.1 Compile Contracts

```bash
# For each .es file, compile via Ergo Node API:
curl -X POST "http://localhost:9052/script/p2sAddress" \
  -H "Content-Type: application/json" \
  -d '{"source": "<ErgoScript source>", "treeVersion": 0}'
```

> **Note**: `treeVersion: 0` for Phase 1 (no EIP-0050 needed). Switch to `treeVersion: 3` only for Phase 008+ if Autolykos verification needs UnsignedBigInt.

### 5.2 Mint Singleton NFTs

Two NFTs needed:
1. **SideChainState NFT** â€” identifies the canonical state box
2. **DoubleUnlockPrevention NFT** â€” identifies the replay prevention box

```bash
# Mint via /wallet/transaction/send with tokens field
curl -X POST "http://localhost:9052/wallet/transaction/send" \
  -H "Content-Type: application/json" \
  -H "api_key: hello" \
  -d '{
    "requests": [{
      "address": "<SideChainState_P2S_address>",
      "value": 2000000,
      "assets": [{"tokenId": "<first_input_box_id>", "amount": 1}],
      "registers": {
        "R4": "0500",
        "R5": "0e20<32_zero_bytes_hex>",
        "R6": "0e20<32_zero_bytes_hex>",
        "R7": "64<empty_avl_digest>0b2000",
        "R8": "0400"
      }
    }],
    "fee": 1100000,
    "inputsRaw": []
  }'
```

### 5.3 Record Deployed State

Save all deployment artifacts to `contracts/deployed_state.json`:

```json
{
  "network": "testnet",
  "deployedAt": "2026-05-XX",
  "sideChainState": {
    "nftId": "<hex>",
    "boxId": "<hex>",
    "address": "<P2S_address>",
    "ergoTreeHex": "<hex>"
  },
  "doubleUnlockPrevention": {
    "nftId": "<hex>",
    "boxId": "<hex>",
    "address": "<P2S_address>",
    "ergoTreeHex": "<hex>"
  },
  "mainChainLock": {
    "address": "<P2S_address>",
    "ergoTreeHex": "<hex>"
  },
  "mainChainUnlock": {
    "address": "<P2S_address>",
    "ergoTreeHex": "<hex>"
  },
  "relayer": {
    "address": "<testnet_wallet_address>",
    "publicKey": "<hex>"
  }
}
```

---

## 6. Relayer Project Scaffold

### 6.1 Initialize TypeScript Project

```bash
cd ergo-sidechain-bridge/relayer
npm init -y
npm install @fleet-sdk/core @fleet-sdk/common axios ethers better-sqlite3
npm install -D typescript tsx @types/node @types/better-sqlite3
npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext \
  --outDir dist --rootDir src --strict --esModuleInterop
```

### 6.2 Config Module (`src/config.ts`)

```typescript
export const CONFIG = {
  // Ergo Testnet
  ergo: {
    nodeUrl: 'http://localhost:9052',
    apiKey: 'hello',
    explorerUrl: 'https://api-testnet.ergoplatform.com',
  },
  
  // Substrate Sidechain (Phase 002)
  substrate: {
    rpcUrl: 'http://localhost:9944',    // Substrate WS
    evmRpcUrl: 'http://localhost:9933', // Frontier JSON-RPC
  },
  
  // Contract addresses (populated after deployment)
  contracts: {
    sideChainStateNftId: '',
    doubleUnlockPreventionNftId: '',
    mainChainLockAddress: '',
    mainChainUnlockAddress: '',
  },
  
  // Relayer wallet
  relayer: {
    address: '',       // Ergo testnet address
    evmPrivateKey: '', // For sidechain EVM operations
  },
  
  // Protocol parameters
  params: {
    confirmationDepth: 50,      // Sidechain confirmations for peg-out
    pollingIntervalMs: 5000,    // Block polling interval
    minLockAmount: 1_000_000n,  // 0.001 ERG minimum
  },
} as const;
```

### 6.3 Ergo Client (`src/ergo-client.ts`)

```typescript
import axios from 'axios';
import { CONFIG } from './config.js';

export class ErgoClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = CONFIG.ergo.nodeUrl;
    this.apiKey = CONFIG.ergo.apiKey;
  }

  async getBoxById(boxId: string): Promise<any> {
    const { data } = await axios.get(
      `${this.baseUrl}/utxo/byId/${boxId}`,
      { headers: { 'api_key': this.apiKey } }
    );
    return data;
  }

  async getBoxesByAddress(address: string): Promise<any[]> {
    const { data } = await axios.get(
      `${this.baseUrl}/blockchain/box/unspent/byAddress/${address}`,
      { headers: { 'api_key': this.apiKey } }
    );
    return data;
  }

  async getBoxByTokenId(tokenId: string): Promise<any> {
    const { data } = await axios.get(
      `${this.baseUrl}/blockchain/box/unspent/byTokenId/${tokenId}`,
      { headers: { 'api_key': this.apiKey } }
    );
    return data[0]; // Singleton NFT â†’ exactly one box
  }

  async signAndSubmit(unsignedTx: any): Promise<string> {
    const { data: signed } = await axios.post(
      `${this.baseUrl}/wallet/transaction/sign`,
      { tx: unsignedTx }, // CRITICAL: {tx: ...} wrapper!
      { headers: { 'api_key': this.apiKey, 'Content-Type': 'application/json' } }
    );
    const { data: txId } = await axios.post(
      `${this.baseUrl}/transactions`,
      signed,
      { headers: { 'Content-Type': 'application/json' } }
    );
    return txId;
  }

  async getCurrentHeight(): Promise<number> {
    const { data } = await axios.get(`${this.baseUrl}/info`);
    return data.fullHeight;
  }
}
```

### 6.4 State Tracker (`src/state-tracker.ts`)

SQLite persistence for the relayer's internal state (inspired by production FSM architecture):

```typescript
import Database from 'better-sqlite3';

export class StateTracker {
  private db: Database.Database;

  constructor(dbPath: string = './bridge-state.sqlite') {
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS peg_in_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ergo_lock_box_id TEXT UNIQUE NOT NULL,
        target_evm_address TEXT NOT NULL,
        amount_nanoerg INTEGER NOT NULL,
        ergo_lock_height INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'detected',
        sidechain_mint_tx_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS peg_out_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sidechain_burn_tx_hash TEXT UNIQUE NOT NULL,
        ergo_recipient_address TEXT NOT NULL,
        amount_nanoerg INTEGER NOT NULL,
        sidechain_burn_height INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'detected',
        phase1_box_id TEXT,
        phase2_unlock_tx_id TEXT,
        avl_proof_hex TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sidechain_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        latest_synced_height INTEGER NOT NULL DEFAULT 0,
        latest_ergo_state_box_id TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO sidechain_state (id, latest_synced_height) VALUES (1, 0);
    `);
  }

  // ... CRUD methods added in Phase 004/005
}
```

---

## 7. Verification Plan

### 7.1 Contract Compilation Checks

- [ ] Each `.es` file compiles without errors via `/script/p2sAddress`
- [ ] Generated addresses are valid Ergo testnet P2S addresses (prefix `3`)
- [ ] ErgoTree hex is reasonable size (< 2 KB each for Phase 1 contracts)

### 7.2 Deployment Checks

- [ ] SideChainState box exists on-chain with correct NFT
- [ ] SideChainState R4=0, R5/R6/R7=empty, R8=0
- [ ] DoubleUnlockPrevention box exists with correct NFT
- [ ] DoubleUnlockPrevention R4=0, R5=empty AVL digest
- [ ] Both boxes have sufficient ERG for storage rent (~0.002 ERG each)

### 7.3 Relayer Scaffold Checks

- [ ] `npm install` completes without errors
- [ ] `npx tsx src/index.ts` starts without crashes
- [ ] ErgoClient can connect to testnet node and read current height
- [ ] StateTracker creates SQLite DB with correct schema

### 7.4 Smoke Test

```bash
# Verify ErgoClient connectivity
npx tsx -e "
import { ErgoClient } from './src/ergo-client.js';
const client = new ErgoClient();
const height = await client.getCurrentHeight();
console.log('Testnet height:', height);
"
```

---

## 8. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Testnet node not synced | Blocks Phase 001 | Follow `/ergo-testnet-node` workflow |
| Insufficient tERG | Cannot deploy | Request from testnet faucet |
| Contract compilation error | Blocks deployment | Start with simplest version (relayerPk only) |
| AVL empty digest mismatch | Blocks DoubleUnlockPrevention | Use `ergo_avltree_rust` `empty_digest()` or Python fallback |

---

## 9. Open Items for Phase 002

After Phase 001 completes, the following items feed into Phase 002 (Substrate Node):

1. Substrate node template selection (Frontier + Aura)
2. `chain_spec.rs` genesis configuration
3. sERG.sol + ErgoBridge.sol deployment to local dev chain
4. MetaMask connectivity test

And Phase 003 (AVL WASM):

1. Fork `reference-avl` â†’ `bridge-avl`
2. Add `rebuild_and_insert_kv_batch()` for key-value pairs
3. Verify empty digest matches Scorex AVL+ verifier on testnet
4. `wasm-pack build --target nodejs` integration
