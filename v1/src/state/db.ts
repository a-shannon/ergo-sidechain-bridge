import Database from 'better-sqlite3';
import {
  AvlEntry,
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
  decodeSigmaIntHex,
  decodeSigmaLongHex,
  dupEmptyDigestHex,
  dupGenerateProofs,
  reserveEmptyDigestHex,
  reserveInsertProof,
  trackerEmptyDigestHex,
  trackerInsertProof,
} from '../core/avl.js';
import {
  AUTH_MODE_EIP0045_STARK,
  AUTH_MODE_FEDERATED,
  STARK_PAYLOAD_LENGTH,
  ZERO_32_HEX,
  blake2b256Hex,
  bytesToHex,
  computeDepositCommitmentHex,
  computeFederatedStatementIdHex,
  computeTrackerKeyHex,
  decodePegInIntentV2,
  decodeTrackerGovernanceR9,
  encodeTrackerValueV1,
  readU32be,
  readU64be,
} from '../core/codecs.js';
import { CompiledBridgeFamily } from '../core/contracts.js';
import { ErgoIndexedBox, StockErgoNodeClient } from '../clients/ergo-node.js';
import { EvmPegOutLog } from '../clients/evm-client.js';

export interface ReserveDepositRow {
  seq: number;
  sourceBoxId: string;
  commitmentHex: string;
  evmRecipient: string;
  amountNanoErg: bigint;
  commitTxId: string;
  commitHeight: number;
  mintTxHash: string | null;
}

export interface TrackerEntryRow {
  seq: number;
  trackerKeyHex: string;
  trackerValueHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnCount: number;
  admissionHeight: number;
  admitTxId: string;
}

export interface DupBurnRow {
  seq: number;
  burnIdHex: string;
  payoutTxId: string;
  payoutHeight: number;
}

export interface StoredEvmBurnRow {
  burnIdHex: string;
  blockNumber: number;
  blockHashHex: string;
  txHashHex: string;
  logIndex: number;
  leafIndex: number;
  leafCount: number;
  recipientErgoTreeHex: string;
  amountNanoErg: bigint;
}

export interface ReconstructionReport {
  reserveEntries: number;
  reserveDigestHex: string;
  reserveDigestMatched: boolean;
  trackerEntries: number;
  trackerDigestHex: string;
  trackerDigestMatched: boolean;
  dupEntries: number;
  dupDigestHex: string;
  dupDigestMatched: boolean;
  activeTrackerEpoch: bigint;
  /** Exact live singleton tip boxes matching the reconstructed AVL digests ([M-3]) */
  liveReserveBox: ErgoIndexedBox;
  liveDupBox: ErgoIndexedBox;
  liveTrackerBox: ErgoIndexedBox;
}

export class BridgeStateDb {
  public readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reserve_deposits (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        source_box_id TEXT NOT NULL UNIQUE,
        commitment_hex TEXT NOT NULL,
        evm_recipient TEXT NOT NULL,
        amount_nano_erg TEXT NOT NULL,
        commit_tx_id TEXT NOT NULL,
        commit_height INTEGER NOT NULL,
        mint_tx_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS tracker_entries (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tracker_key_hex TEXT NOT NULL UNIQUE,
        tracker_value_hex TEXT NOT NULL,
        source_height TEXT NOT NULL UNIQUE,
        source_block_hash_hex TEXT NOT NULL,
        execution_block_hash_hex TEXT NOT NULL,
        bridge_event_root_hex TEXT NOT NULL,
        burn_count INTEGER NOT NULL,
        admission_height INTEGER NOT NULL,
        admit_tx_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dup_burns (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        burn_id_hex TEXT NOT NULL UNIQUE,
        payout_tx_id TEXT NOT NULL,
        payout_height INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evm_burns (
        burn_id_hex TEXT PRIMARY KEY,
        block_number INTEGER NOT NULL,
        block_hash_hex TEXT NOT NULL,
        tx_hash_hex TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        leaf_index INTEGER NOT NULL,
        leaf_count INTEGER NOT NULL,
        recipient_ergo_tree_hex TEXT NOT NULL,
        amount_nano_erg TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evm_burns_block ON evm_burns(block_number, log_index);
    `);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, value);
  }

  /**
   * Persist scanned finalized Frontier PegOut events atomically with cursor update ([H-5]).
   */
  upsertEvmBurns(
    sidechainIdHex: string,
    logs: EvmPegOutLog[],
    computeBurnId: (sidechainId: string, txHash: string, logIndex: number) => string,
    scannedThroughBlock: number,
  ): void {
    const byBlock = new Map<number, EvmPegOutLog[]>();
    for (const l of logs) {
      const list = byBlock.get(l.blockNumber) ?? [];
      list.push(l);
      byBlock.set(l.blockNumber, list);
    }
    const txWrite = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO evm_burns(
          burn_id_hex, block_number, block_hash_hex, tx_hash_hex,
          log_index, leaf_index, leaf_count, recipient_ergo_tree_hex, amount_nano_erg
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(burn_id_hex) DO UPDATE SET
          block_hash_hex=excluded.block_hash_hex,
          leaf_index=excluded.leaf_index,
          leaf_count=excluded.leaf_count,
          recipient_ergo_tree_hex=excluded.recipient_ergo_tree_hex,
          amount_nano_erg=excluded.amount_nano_erg
      `);
      for (const [blockNum, blockLogs] of byBlock.entries()) {
        blockLogs.sort((a, b) => a.logIndex - b.logIndex);
        for (let i = 0; i < blockLogs.length; i++) {
          const l = blockLogs[i];
          const burnIdHex = computeBurnId(sidechainIdHex, l.txHash, l.logIndex);
          stmt.run(
            burnIdHex,
            blockNum,
            l.blockHash,
            l.txHash,
            l.logIndex,
            i,
            blockLogs.length,
            l.recipientErgoTreeHex,
            l.netAmountNanoErg.toString(),
          );
        }
      }
      this.setMeta('last_scanned_evm_block', String(scannedThroughBlock));
    });
    txWrite();
  }

  getStoredEvmBurnsByBlock(): Map<number, StoredEvmBurnRow[]> {
    const rows = this.db
      .prepare('SELECT * FROM evm_burns ORDER BY block_number ASC, log_index ASC')
      .all() as Array<{
      burn_id_hex: string;
      block_number: number;
      block_hash_hex: string;
      tx_hash_hex: string;
      log_index: number;
      leaf_index: number;
      leaf_count: number;
      recipient_ergo_tree_hex: string;
      amount_nano_erg: string;
    }>;
    const byBlock = new Map<number, StoredEvmBurnRow[]>();
    for (const r of rows) {
      const list = byBlock.get(r.block_number) ?? [];
      list.push({
        burnIdHex: r.burn_id_hex,
        blockNumber: r.block_number,
        blockHashHex: r.block_hash_hex,
        txHashHex: r.tx_hash_hex,
        logIndex: r.log_index,
        leafIndex: r.leaf_index,
        leafCount: r.leaf_count,
        recipientErgoTreeHex: r.recipient_ergo_tree_hex,
        amountNanoErg: BigInt(r.amount_nano_erg),
      });
      byBlock.set(r.block_number, list);
    }
    return byBlock;
  }

  getReserveAvlHistory(): AvlEntry[] {
    const rows = this.db
      .prepare('SELECT source_box_id, commitment_hex FROM reserve_deposits ORDER BY seq ASC')
      .all() as Array<{ source_box_id: string; commitment_hex: string }>;
    return rows.map((r) => ({ key: r.source_box_id, value: r.commitment_hex }));
  }

  getReserveDeposits(): ReserveDepositRow[] {
    const rows = this.db
      .prepare('SELECT * FROM reserve_deposits ORDER BY seq ASC')
      .all() as Array<{
      seq: number;
      source_box_id: string;
      commitment_hex: string;
      evm_recipient: string;
      amount_nano_erg: string;
      commit_tx_id: string;
      commit_height: number;
      mint_tx_hash: string | null;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      sourceBoxId: r.source_box_id,
      commitmentHex: r.commitment_hex,
      evmRecipient: r.evm_recipient,
      amountNanoErg: BigInt(r.amount_nano_erg),
      commitTxId: r.commit_tx_id,
      commitHeight: r.commit_height,
      mintTxHash: r.mint_tx_hash,
    }));
  }

  markDepositMinted(sourceBoxId: string, mintTxHash: string): void {
    this.db
      .prepare('UPDATE reserve_deposits SET mint_tx_hash = ? WHERE source_box_id = ?')
      .run(mintTxHash, sourceBoxId);
  }

  getTrackerAvlHistory(): AvlEntry[] {
    const rows = this.db
      .prepare('SELECT tracker_key_hex, tracker_value_hex FROM tracker_entries ORDER BY seq ASC')
      .all() as Array<{ tracker_key_hex: string; tracker_value_hex: string }>;
    return rows.map((r) => ({ key: r.tracker_key_hex, value: r.tracker_value_hex }));
  }

  getTrackerEntries(): TrackerEntryRow[] {
    const rows = this.db
      .prepare('SELECT * FROM tracker_entries ORDER BY seq ASC')
      .all() as Array<{
      seq: number;
      tracker_key_hex: string;
      tracker_value_hex: string;
      source_height: string;
      source_block_hash_hex: string;
      execution_block_hash_hex: string;
      bridge_event_root_hex: string;
      burn_count: number;
      admission_height: number;
      admit_tx_id: string;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      trackerKeyHex: r.tracker_key_hex,
      trackerValueHex: r.tracker_value_hex,
      sourceHeight: BigInt(r.source_height),
      sourceBlockHashHex: r.source_block_hash_hex,
      executionBlockHashHex: r.execution_block_hash_hex,
      bridgeEventRootHex: r.bridge_event_root_hex,
      burnCount: r.burn_count,
      admissionHeight: r.admission_height,
      admitTxId: r.admit_tx_id,
    }));
  }

  getTrackerEntryBySourceHeight(sourceHeight: bigint): TrackerEntryRow | null {
    const r = this.db
      .prepare('SELECT * FROM tracker_entries WHERE source_height = ?')
      .get(sourceHeight.toString()) as
      | {
          seq: number;
          tracker_key_hex: string;
          tracker_value_hex: string;
          source_height: string;
          source_block_hash_hex: string;
          execution_block_hash_hex: string;
          bridge_event_root_hex: string;
          burn_count: number;
          admission_height: number;
          admit_tx_id: string;
        }
      | undefined;
    if (!r) return null;
    return {
      seq: r.seq,
      trackerKeyHex: r.tracker_key_hex,
      trackerValueHex: r.tracker_value_hex,
      sourceHeight: BigInt(r.source_height),
      sourceBlockHashHex: r.source_block_hash_hex,
      executionBlockHashHex: r.execution_block_hash_hex,
      bridgeEventRootHex: r.bridge_event_root_hex,
      burnCount: r.burn_count,
      admissionHeight: r.admission_height,
      admitTxId: r.admit_tx_id,
    };
  }

  getDupHistoryBurnIds(): string[] {
    const rows = this.db
      .prepare('SELECT burn_id_hex FROM dup_burns ORDER BY seq ASC')
      .all() as Array<{ burn_id_hex: string }>;
    return rows.map((r) => r.burn_id_hex);
  }

  isBurnSpentOnErgo(burnIdHex: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM dup_burns WHERE burn_id_hex = ?')
      .get(burnIdHex);
    return Boolean(row);
  }

  /**
   * 100% Stateless On-Chain Reconstruction across Federated rotations AND
   * post-EIP-0045 STARK graduation ([H-6], [M-3]).
   *
   * Returns exact live singleton tip boxes so callers never mix stale tip boxes
   * with freshly reconstructed AVL digests.
   */
  async reconstructFromErgoNode(
    ergo: StockErgoNodeClient,
    family: CompiledBridgeFamily,
    epochKeySetDigests: Map<bigint, string>,
    starkAuthorityDigestHex?: string,
  ): Promise<ReconstructionReport> {
    const [reserveChain, trackerChain, dupChain] = await Promise.all([
      walkSingletonChain(ergo, family.params.reserveNftIdHex, family.reserve.ergoTreeHex),
      walkSingletonChain(ergo, family.params.trackerNftIdHex, null),
      walkSingletonChain(ergo, family.params.dupNftIdHex, family.dup.ergoTreeHex),
    ]);

    // 1. Replay Reserve deposit commits
    const reserveRows: Array<{
      sourceBoxId: string;
      commitmentHex: string;
      evmRecipient: string;
      amountNanoErg: bigint;
      commitTxId: string;
      commitHeight: number;
    }> = [];
    let reserveDigest = reserveEmptyDigestHex();
    const reserveHistory: AvlEntry[] = [];

    for (let i = 0; i < reserveChain.length - 1; i++) {
      const cur = reserveChain[i];
      const next = reserveChain[i + 1];
      const curDigest = decodeSigmaAvlTreeDigestHex(cur.additionalRegisters.R5);
      const nextDigest = decodeSigmaAvlTreeDigestHex(next.additionalRegisters.R5);
      if (curDigest === nextDigest) continue;

      const tx = await ergo.getTransactionById(next.transactionId);
      if (tx.inputs.length !== 3 || tx.dataInputs.length !== 0) {
        throw new Error(`Unexpected reserve AVL-modifying tx shape: ${tx.id}`);
      }
      const depositBox = await ergo.getBoxById(tx.inputs[1].boxId);
      const encodedIntent = decodeSigmaCollByteHex(depositBox.additionalRegisters.R4);
      const intent = decodePegInIntentV2(encodedIntent);
      const commitmentHex = computeDepositCommitmentHex(
        family.familyIdHex,
        depositBox.boxId,
        encodedIntent,
      );
      const res = reserveInsertProof(reserveHistory, depositBox.boxId, commitmentHex);
      if (res.newDigestHex !== nextDigest) {
        throw new Error(
          `Reserve AVL reconstruction mismatch at tx ${tx.id}: expected ${nextDigest}, got ${res.newDigestHex}`,
        );
      }
      reserveHistory.push({ key: depositBox.boxId, value: commitmentHex });
      reserveDigest = res.newDigestHex;
      reserveRows.push({
        sourceBoxId: depositBox.boxId,
        commitmentHex,
        evmRecipient: intent.evmRecipientHex,
        amountNanoErg: intent.amountNanoErg,
        commitTxId: tx.id,
        commitHeight: tx.inclusionHeight,
      });
    }
    const liveReserveBox = reserveChain[reserveChain.length - 1];
    const liveReserveDigest = decodeSigmaAvlTreeDigestHex(liveReserveBox.additionalRegisters.R5);

    // 2. Replay Tracker checkpoint admissions (Federated 81B R9 AND EIP-0045 STARK 32B R9 [H-6])
    const trackerRows: Array<{
      trackerKeyHex: string;
      trackerValueHex: string;
      sourceHeight: bigint;
      sourceBlockHashHex: string;
      executionBlockHashHex: string;
      bridgeEventRootHex: string;
      burnCount: number;
      admissionHeight: number;
      admitTxId: string;
    }> = [];
    let trackerDigest = trackerEmptyDigestHex();
    const trackerHistory: AvlEntry[] = [];

    for (let i = 0; i < trackerChain.length - 1; i++) {
      const cur = trackerChain[i];
      const next = trackerChain[i + 1];
      const curDigest = decodeSigmaAvlTreeDigestHex(cur.additionalRegisters.R5);
      const nextDigest = decodeSigmaAvlTreeDigestHex(next.additionalRegisters.R5);
      if (curDigest === nextDigest) continue;

      const tx = await ergo.getTransactionById(next.transactionId);
      const curR9Raw = decodeSigmaCollByteHex(cur.additionalRegisters.R9);
      const admissionHeight = next.creationHeight;

      let sourceNetworkIdHex: string;
      let sidechainIdHex: string;
      let sourceHeight: bigint;
      let sourceBlockHashHex: string;
      let executionBlockHashHex: string;
      let bridgeEventRootHex: string;
      let burnCount: number;
      let trackerValueHex: string;

      if (curR9Raw.length === 81) {
        // Federated V1 tracker admission (Var(0) = 174B action)
        const ext0 = tx.inputs[0]?.spendingProof?.extension?.['0'];
        if (!ext0) {
          throw new Error(`Federated tracker AVL-modifying tx ${tx.id} missing Var(0)`);
        }
        const action = decodeSigmaCollByteHex(ext0);
        if (action.length !== 174 || action[0] !== 1) {
          throw new Error(`Unsupported tracker AVL action length=${action.length} in tx ${tx.id}`);
        }
        sourceNetworkIdHex = bytesToHex(action.slice(2, 34));
        sidechainIdHex = bytesToHex(action.slice(34, 66));
        sourceHeight = readU64be(action, 66);
        sourceBlockHashHex = bytesToHex(action.slice(74, 106));
        executionBlockHashHex = bytesToHex(action.slice(106, 138));
        bridgeEventRootHex = bytesToHex(action.slice(138, 170));
        burnCount = readU32be(action, 170);

        const govR9 = decodeTrackerGovernanceR9(curR9Raw);
        const keySetDigest = epochKeySetDigests.get(govR9.epoch);
        if (!keySetDigest) {
          throw new Error(
            `Unknown committee keySetDigest for epoch ${govR9.epoch} while reconstructing tx ${tx.id}`,
          );
        }
        const statementIdHex = computeFederatedStatementIdHex(action);
        trackerValueHex = bytesToHex(
          encodeTrackerValueV1({
            authMode: AUTH_MODE_FEDERATED,
            familyIdHex: family.familyIdHex,
            sidechainIdHex,
            sourceHeight,
            sourceBlockHashHex,
            executionBlockHashHex,
            bridgeEventRootHex,
            burnCount,
            statementIdHex,
            admissionHeight: BigInt(admissionHeight),
            authorityEpoch: govR9.epoch,
            authorityDigestHex: keySetDigest,
            trustAnchorDigestHex: ZERO_32_HEX,
            sourceNetworkIdHex,
          }),
        );
      } else if (curR9Raw.length === 32) {
        // Post-graduation EIP-0045 STARK tracker admission (Var(1) = 300B BridgeStarkPayloadV1)
        const ext1 = tx.inputs[0]?.spendingProof?.extension?.['1'];
        if (!ext1) {
          throw new Error(`STARK tracker AVL-modifying tx ${tx.id} missing Var(1) payload`);
        }
        const payload = decodeSigmaCollByteHex(ext1);
        if (payload.length !== STARK_PAYLOAD_LENGTH) {
          throw new Error(
            `Expected ${STARK_PAYLOAD_LENGTH}-byte BridgeStarkPayloadV1 in tx ${tx.id}, got ${payload.length}`,
          );
        }
        if (!starkAuthorityDigestHex) {
          throw new Error(
            `STARK checkpoint in tx ${tx.id} requires starkAuthorityDigestHex (blake2b256(programId || profileId)) for reconstruction`,
          );
        }
        sourceNetworkIdHex = bytesToHex(payload.slice(96, 128));
        sidechainIdHex = bytesToHex(payload.slice(128, 160));
        sourceHeight = readU64be(payload, 160);
        sourceBlockHashHex = bytesToHex(payload.slice(168, 200));
        executionBlockHashHex = bytesToHex(payload.slice(200, 232));
        bridgeEventRootHex = bytesToHex(payload.slice(232, 264));
        burnCount = readU32be(payload, 264);
        const trustAnchorDigestHex = bytesToHex(curR9Raw);
        const statementIdHex = blake2b256Hex(payload);

        trackerValueHex = bytesToHex(
          encodeTrackerValueV1({
            authMode: AUTH_MODE_EIP0045_STARK,
            familyIdHex: family.familyIdHex,
            sidechainIdHex,
            sourceHeight,
            sourceBlockHashHex,
            executionBlockHashHex,
            bridgeEventRootHex,
            burnCount,
            statementIdHex,
            admissionHeight: BigInt(admissionHeight),
            authorityEpoch: 0n,
            authorityDigestHex: starkAuthorityDigestHex,
            trustAnchorDigestHex,
            sourceNetworkIdHex,
          }),
        );
      } else {
        throw new Error(`Unsupported tracker R9 byte length ${curR9Raw.length} at tx ${tx.id}`);
      }

      const trackerKeyHex = computeTrackerKeyHex({
        sourceNetworkIdHex,
        sidechainIdHex,
        sourceHeight,
        sourceBlockHashHex,
        executionBlockHashHex,
      });
      const res = trackerInsertProof(trackerHistory, trackerKeyHex, trackerValueHex);
      if (res.newDigestHex !== nextDigest) {
        throw new Error(
          `Tracker AVL reconstruction mismatch at tx ${tx.id}: expected ${nextDigest}, got ${res.newDigestHex}`,
        );
      }
      trackerHistory.push({ key: trackerKeyHex, value: trackerValueHex });
      trackerDigest = res.newDigestHex;
      trackerRows.push({
        trackerKeyHex,
        trackerValueHex,
        sourceHeight,
        sourceBlockHashHex,
        executionBlockHashHex,
        bridgeEventRootHex,
        burnCount,
        admissionHeight,
        admitTxId: tx.id,
      });
    }
    const liveTrackerBox = trackerChain[trackerChain.length - 1];
    const liveTrackerDigest = decodeSigmaAvlTreeDigestHex(liveTrackerBox.additionalRegisters.R5);
    const liveTrackerR9Raw = decodeSigmaCollByteHex(liveTrackerBox.additionalRegisters.R9);
    const activeTrackerEpoch =
      liveTrackerR9Raw.length === 81 ? decodeTrackerGovernanceR9(liveTrackerR9Raw).epoch : 0n;

    // 3. Replay DUP burn spends
    const dupRows: Array<{ burnIdHex: string; payoutTxId: string; payoutHeight: number }> = [];
    let dupDigest = dupEmptyDigestHex();
    const dupHistory: string[] = [];

    for (let i = 0; i < dupChain.length - 1; i++) {
      const cur = dupChain[i];
      const next = dupChain[i + 1];
      const curDigest = decodeSigmaAvlTreeDigestHex(cur.additionalRegisters.R5);
      const nextDigest = decodeSigmaAvlTreeDigestHex(next.additionalRegisters.R5);
      if (curDigest === nextDigest) continue;

      const tx = await ergo.getTransactionById(next.transactionId);
      const ext2 = tx.inputs[1]?.spendingProof?.extension?.['2'];
      if (!ext2) {
        throw new Error(`DUP AVL-modifying tx ${tx.id} missing Var(2) burn leaf`);
      }
      const encodedLeaf = decodeSigmaCollByteHex(ext2);
      if (encodedLeaf.length !== 205) {
        throw new Error(`Invalid burn leaf length ${encodedLeaf.length} in tx ${tx.id}`);
      }
      const burnIdHex = bytesToHex(encodedLeaf.slice(65, 97));
      const res = dupGenerateProofs(dupHistory, burnIdHex);
      if (res.newDigestHex !== nextDigest) {
        throw new Error(
          `DUP AVL reconstruction mismatch at tx ${tx.id}: expected ${nextDigest}, got ${res.newDigestHex}`,
        );
      }
      dupHistory.push(burnIdHex);
      dupDigest = res.newDigestHex;
      dupRows.push({
        burnIdHex,
        payoutTxId: tx.id,
        payoutHeight: tx.inclusionHeight,
      });
    }
    const liveDupBox = dupChain[dupChain.length - 1];
    const liveDupDigest = decodeSigmaAvlTreeDigestHex(liveDupBox.additionalRegisters.R5);

    const reserveDigestMatched = reserveDigest === liveReserveDigest;
    const trackerDigestMatched = trackerDigest === liveTrackerDigest;
    const dupDigestMatched = dupDigest === liveDupDigest;
    if (!reserveDigestMatched || !trackerDigestMatched || !dupDigestMatched) {
      throw new Error(
        `On-chain AVL digest verification failed: reserve=${reserveDigestMatched}, tracker=${trackerDigestMatched}, dup=${dupDigestMatched}`,
      );
    }

    const txWrite = this.db.transaction(() => {
      const existingMints = new Map<string, string>();
      for (const row of this.db
        .prepare(
          'SELECT source_box_id, mint_tx_hash FROM reserve_deposits WHERE mint_tx_hash IS NOT NULL',
        )
        .all() as Array<{ source_box_id: string; mint_tx_hash: string }>) {
        existingMints.set(row.source_box_id, row.mint_tx_hash);
      }

      this.db.exec('DELETE FROM reserve_deposits; DELETE FROM tracker_entries; DELETE FROM dup_burns;');

      const insRes = this.db.prepare(`
        INSERT INTO reserve_deposits(source_box_id, commitment_hex, evm_recipient, amount_nano_erg, commit_tx_id, commit_height, mint_tx_hash)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of reserveRows) {
        insRes.run(
          r.sourceBoxId,
          r.commitmentHex,
          r.evmRecipient,
          r.amountNanoErg.toString(),
          r.commitTxId,
          r.commitHeight,
          existingMints.get(r.sourceBoxId) ?? null,
        );
      }

      const insTrk = this.db.prepare(`
        INSERT INTO tracker_entries(tracker_key_hex, tracker_value_hex, source_height, source_block_hash_hex, execution_block_hash_hex, bridge_event_root_hex, burn_count, admission_height, admit_tx_id)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const t of trackerRows) {
        insTrk.run(
          t.trackerKeyHex,
          t.trackerValueHex,
          t.sourceHeight.toString(),
          t.sourceBlockHashHex,
          t.executionBlockHashHex,
          t.bridgeEventRootHex,
          t.burnCount,
          t.admissionHeight,
          t.admitTxId,
        );
      }

      const insDup = this.db.prepare(`
        INSERT INTO dup_burns(burn_id_hex, payout_tx_id, payout_height)
        VALUES(?, ?, ?)
      `);
      for (const d of dupRows) {
        insDup.run(d.burnIdHex, d.payoutTxId, d.payoutHeight);
      }

      this.setMeta('reserve_digest_hex', reserveDigest);
      this.setMeta('tracker_digest_hex', trackerDigest);
      this.setMeta('dup_digest_hex', dupDigest);
      this.setMeta('active_tracker_epoch', activeTrackerEpoch.toString());
    });
    txWrite();

    return {
      reserveEntries: reserveRows.length,
      reserveDigestHex: reserveDigest,
      reserveDigestMatched,
      trackerEntries: trackerRows.length,
      trackerDigestHex: trackerDigest,
      trackerDigestMatched,
      dupEntries: dupRows.length,
      dupDigestHex: dupDigest,
      dupDigestMatched,
      activeTrackerEpoch,
      liveReserveBox,
      liveDupBox,
      liveTrackerBox,
    };
  }
}

async function walkSingletonChain(
  ergo: StockErgoNodeClient,
  tokenIdHex: string,
  expectedErgoTreeHex: string | null,
): Promise<ErgoIndexedBox[]> {
  const allBoxes = await ergo.getAllBoxesByTokenId(tokenIdHex);
  const protocolBoxes = allBoxes.filter((b) => {
    const r5 = b.additionalRegisters?.R5;
    if (!r5 || !r5.startsWith('64')) return false;
    if (expectedErgoTreeHex && b.ergoTree !== expectedErgoTreeHex) return false;
    return true;
  });
  if (protocolBoxes.length === 0) {
    throw new Error(`No deployed protocol singleton boxes found for token ${tokenIdHex}`);
  }
  const byTxId = new Map<string, ErgoIndexedBox>();
  for (const b of protocolBoxes) {
    byTxId.set(b.transactionId, b);
  }
  const spentTxIds = new Set(
    protocolBoxes.map((b) => b.spentTransactionId).filter((s): s is string => Boolean(s)),
  );
  const genesisCandidates = protocolBoxes.filter((b) => !spentTxIds.has(b.transactionId));
  if (genesisCandidates.length !== 1) {
    throw new Error(
      `Expected 1 genesis protocol singleton for ${tokenIdHex}, found ${genesisCandidates.length}`,
    );
  }
  const chain: ErgoIndexedBox[] = [];
  let cur: ErgoIndexedBox | undefined = genesisCandidates[0];
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.boxId)) {
      throw new Error(`Cycle detected while walking singleton chain ${tokenIdHex}`);
    }
    seen.add(cur.boxId);
    chain.push(cur);
    if (!cur.spentTransactionId) break;
    cur = byTxId.get(cur.spentTransactionId);
  }
  if (chain[chain.length - 1].spentTransactionId !== null) {
    throw new Error(`Singleton chain ${tokenIdHex} ended on a spent box`);
  }
  return chain;
}

export function readLiveReserveLiability(reserveBox: ErgoIndexedBox): bigint {
  return decodeSigmaLongHex(reserveBox.additionalRegisters.R6);
}

export function readLiveTrackerLatestSourceHeight(trackerBox: ErgoIndexedBox): bigint {
  return decodeSigmaLongHex(trackerBox.additionalRegisters.R7);
}

export function readLiveTrackerLastAdmissionHeight(trackerBox: ErgoIndexedBox): number {
  return decodeSigmaIntHex(trackerBox.additionalRegisters.R8);
}
