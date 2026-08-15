# Walkthrough 001c â€” Relayer TypeScript Scaffold

> TypeScript relayer project: ErgoClient, StateTracker (SQLite), config system.
> 130 npm packages installed, smoke test passed.

---

## Project Structure

```
relayer/
â”œâ”€â”€ package.json
â”œâ”€â”€ tsconfig.json
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ config.ts           # Static + dynamic config
â”‚   â”œâ”€â”€ ergo-client.ts      # Ergo node API wrapper
â”‚   â”œâ”€â”€ state-tracker.ts    # SQLite persistence (WAL mode)
â”‚   â”œâ”€â”€ index.ts            # Entry point + connectivity check
â”‚   â””â”€â”€ scripts/
â”‚       â”œâ”€â”€ compile-contracts.ts
â”‚       â””â”€â”€ deploy.ts
â””â”€â”€ bridge-state.sqlite     # Created at runtime
```

---

## 1. config.ts â€” Configuration Module

Static config for node URLs + protocol params. Dynamic config loaded from `deployed_state.json` after contract deployment.

```typescript
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ERGO_CONFIG = {
  nodeUrl: process.env.ERGO_NODE_URL ?? 'http://localhost:9052',
  apiKey: process.env.ERGO_API_KEY ?? 'hello',
  explorerUrl: 'https://api-testnet.ergoplatform.com',
  walletPassword: process.env.ERGO_WALLET_PASS ?? 'ergotestnet123',
} as const;

export const SUBSTRATE_CONFIG = {
  wsUrl: process.env.SUBSTRATE_WS_URL ?? 'ws://localhost:9944',
  evmRpcUrl: process.env.SUBSTRATE_EVM_URL ?? 'http://localhost:9933',
  relayerPrivateKey: process.env.EVM_PRIVATE_KEY
    ?? '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
} as const;

export const PROTOCOL_PARAMS = {
  confirmationDepth: 50,
  pollingIntervalMs: 5_000,
  minLockAmountNanoErg: 10_000_000n,   // 0.01 ERG
  minBoxValueNanoErg: 2_000_000n,       // storage rent safe
  minerFeeNanoErg: 1_100_000n,
} as const;

export interface DeployedState {
  network: string;
  deployedAt: string;
  sideChainState: { nftId: string; boxId: string; address: string; ergoTreeHex: string };
  doubleUnlockPrevention: { nftId: string; boxId: string; address: string; ergoTreeHex: string };
  mainChainLock: { address: string; ergoTreeHex: string };
  mainChainUnlock: { address: string; ergoTreeHex: string };
  relayer: { address: string; publicKey: string };
  solidity?: { sergAddress: string; bridgeAddress: string };
}

let _deployedState: DeployedState | null = null;

export function loadDeployedState(): DeployedState {
  if (_deployedState) return _deployedState;
  const stateFile = resolve(__dirname, '../../contracts/deployed_state.json');
  if (!existsSync(stateFile)) {
    throw new Error(`deployed_state.json not found. Run 'npm run deploy' first.`);
  }
  const raw = readFileSync(stateFile, 'utf-8');
  _deployedState = JSON.parse(raw) as DeployedState;
  console.log(`âœ… Loaded deployed state (network: ${_deployedState.network})`);
  return _deployedState;
}
```

---

## 2. ergo-client.ts â€” Ergo Node API Client

Key methods: box queries, contract compilation, TX signing.

```typescript
import axios, { AxiosInstance } from 'axios';
import { ERGO_CONFIG } from './config.js';

export class ErgoClient {
  private client: AxiosInstance;

  constructor(nodeUrl?: string) {
    this.client = axios.create({
      baseURL: nodeUrl ?? ERGO_CONFIG.nodeUrl,
      headers: { 'api_key': ERGO_CONFIG.apiKey, 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }

  async getInfo(): Promise<{ fullHeight: number; network: string }> {
    const { data } = await this.client.get('/info');
    return data;
  }

  async unlockWallet(password: string = ERGO_CONFIG.walletPassword): Promise<void> {
    try {
      await this.client.post('/wallet/unlock', { pass: password });
      console.log('ðŸ”“ Wallet unlocked');
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.detail?.includes('already')) {
        console.log('ðŸ”“ Wallet already unlocked');
        return;
      }
      throw err;
    }
  }

  async getWalletAddresses(): Promise<string[]> {
    const { data } = await this.client.get('/wallet/addresses');
    return data;
  }

  async getBoxesByTokenId(tokenId: string): Promise<any[]> {
    const { data } = await this.client.get(`/blockchain/box/unspent/byTokenId/${tokenId}`);
    return data;
  }

  async findSingletonBox(nftId: string): Promise<any> {
    const boxes = await this.getBoxesByTokenId(nftId);
    if (boxes.length === 0) throw new Error(`Singleton NFT ${nftId} not found`);
    if (boxes.length > 1) throw new Error(`Multiple boxes with NFT ${nftId} â€” broken invariant!`);
    return boxes[0];
  }

  async compileContract(source: string, treeVersion: number = 0):
    Promise<{ address: string; ergoTreeHex: string }> {
    const { data } = await this.client.post('/script/p2sAddress', { source, treeVersion });
    const address = data.address;
    try {
      const { data: treeData } = await this.client.get(`/utils/addressToRaw/${address}`);
      const ergoTreeHex = typeof treeData === 'string'
        ? treeData : treeData.raw ?? treeData.hex ?? JSON.stringify(treeData);
      return { address, ergoTreeHex };
    } catch {
      return { address, ergoTreeHex: '' };
    }
  }

  // CRITICAL: Must wrap in {tx: ...} â€” see ergo-node-api-reference skill
  async signTransaction(unsignedTx: any): Promise<any> {
    const { data } = await this.client.post('/wallet/transaction/sign', { tx: unsignedTx });
    return data;
  }

  async submitTransaction(signedTx: any): Promise<string> {
    const { data } = await this.client.post('/transactions', signedTx);
    return data;
  }

  async signAndSubmit(unsignedTx: any): Promise<string> {
    const signed = await this.signTransaction(unsignedTx);
    return this.submitTransaction(signed);
  }

  async walletSend(requests: any[], fee: number = 1_100_000): Promise<string> {
    const { data } = await this.client.post('/wallet/transaction/send', { requests, fee, inputsRaw: [] });
    return data;
  }
}
```

> **Key lesson from prior art**: `/wallet/transaction/sign` MUST use `{tx: unsignedTx}` wrapper, NOT bare `unsignedTx`. This is documented in our `ergo-node-api-reference` skill.

---

## 3. state-tracker.ts â€” SQLite Persistence

Event-sourced state tracking with WAL mode. Follows production patterns: COALESCE for partial updates, rebuild-on-demand for AVL tree history.

```typescript
import Database from 'better-sqlite3';

export type PegInStatus = 'detected' | 'confirmed' | 'minting' | 'minted' | 'failed';
export type PegOutStatus = 'detected' | 'confirmed' | 'phase1_created' | 'phase2_unlocked' | 'failed';

export class StateTracker {
  private db: Database.Database;

  constructor(dbPath: string = './bridge-state.sqlite') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS peg_in_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ergo_lock_box_id TEXT UNIQUE NOT NULL,
        target_evm_address TEXT NOT NULL,
        amount_nanoerg INTEGER NOT NULL,
        ergo_lock_height INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'detected',
        sidechain_mint_tx_hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS avl_tree_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hex TEXT UNIQUE NOT NULL,
        value_hex TEXT NOT NULL DEFAULT '01',
        inserted_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        latest_ergo_height INTEGER NOT NULL DEFAULT 0,
        latest_sidechain_height INTEGER NOT NULL DEFAULT 0,
        state_box_id TEXT,
        prevention_box_id TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO sync_state (id) VALUES (1);
    `);
  }

  // --- Peg-In ---
  insertPegIn(boxId: string, targetEvm: string, amount: bigint, height: number): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO peg_in_events
        (ergo_lock_box_id, target_evm_address, amount_nanoerg, ergo_lock_height)
      VALUES (?, ?, ?, ?)
    `).run(boxId, targetEvm, Number(amount), height);
  }

  updatePegInStatus(boxId: string, status: PegInStatus, mintTxHash?: string): void {
    this.db.prepare(`
      UPDATE peg_in_events
      SET status = ?, sidechain_mint_tx_hash = COALESCE(?, sidechain_mint_tx_hash),
          updated_at = datetime('now')
      WHERE ergo_lock_box_id = ?
    `).run(status, mintTxHash ?? null, boxId);
  }

  getPendingPegIns(): any[] {
    return this.db.prepare(`
      SELECT * FROM peg_in_events WHERE status IN ('detected', 'confirmed')
      ORDER BY ergo_lock_height ASC
    `).all();
  }

  // --- AVL Tree History (Rebuild-on-Demand pattern) ---
  insertAvlKey(keyHex: string, valueHex: string = '01'): void {
    this.db.prepare(`INSERT OR IGNORE INTO avl_tree_history (key_hex, value_hex) VALUES (?, ?)`
    ).run(keyHex, valueHex);
  }

  getAllAvlKeys(): string[] {
    return (this.db.prepare(`SELECT key_hex FROM avl_tree_history ORDER BY id ASC`).all() as any[])
      .map(r => r.key_hex);
  }

  // --- Sync State ---
  getSyncState(): { latestErgoHeight: number; latestSidechainHeight: number } {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as any;
    return { latestErgoHeight: row.latest_ergo_height, latestSidechainHeight: row.latest_sidechain_height };
  }

  close(): void { this.db.close(); }
}
```

> **Pattern from production**: The `avl_tree_history` table stores all inserted keys in order. The WASM AVL crate rebuilds the tree from this history each time (`rebuild_and_insert_batch`). This is the "Rebuild-on-Demand" pattern â€” no persistent WASM state, crash-safe by design.

---

## 4. index.ts â€” Entry Point

Validates connectivity to the Ergo node and prints next steps.

```typescript
import { ErgoClient } from './ergo-client.js';
import { StateTracker } from './state-tracker.js';
import { ERGO_CONFIG } from './config.js';

async function main() {
  console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  console.log('  Ergo-Substrate Sidechain Bridge â€” Relayer v0.1  ');
  console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n');

  const ergo = new ErgoClient();
  const state = new StateTracker();

  try {
    const info = await ergo.getInfo();
    console.log(`ðŸŸ¢ Ergo node:       ${ERGO_CONFIG.nodeUrl}`);
    console.log(`   Height:          ${info.fullHeight}`);
    console.log(`   Network:         ${info.network ?? 'testnet'}`);
  } catch {
    console.error(`âŒ Cannot connect to Ergo node at ${ERGO_CONFIG.nodeUrl}`);
    process.exit(1);
  }

  await ergo.unlockWallet();
  const addresses = await ergo.getWalletAddresses();
  console.log(`ðŸ”‘ Relayer address: ${addresses[0]}`);

  const syncState = state.getSyncState();
  console.log(`ðŸ“Š Last synced Ergo height: ${syncState.latestErgoHeight}`);
  console.log(`ðŸ“Š Last synced SC height:   ${syncState.latestSidechainHeight}`);

  console.log('\nâœ… Phase 001 scaffold validation passed');
  state.close();
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
```
