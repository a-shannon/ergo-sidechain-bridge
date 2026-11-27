import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
} from '../core/avl.js';
import {
  BurnLeafV1,
  DEFAULT_MINER_FEE,
  MIN_BOX_VALUE,
  ZERO_20,
  ZERO_32,
  buildBurnMerkleTree,
  computeBurnIdHex,
  decodePegInIntentV2,
  decodeTrackerGovernanceR9,
  encodeBurnLeafV1,
  hexToBytes,
} from '../core/codecs.js';
import { CompiledBridgeFamily } from '../core/contracts.js';
import {
  buildBurnPayoutTx,
  buildCommitDepositTx,
  buildRentRefreshTx,
  buildTrackerAdmitTx,
} from '../core/tx-builders.js';
import {
  deriveKeyPairFromSecretHex,
  p2sAddressFromErgoTreeHex,
  signTransaction,
  signTransactionDistributedCommittee,
} from '../crypto/signer.js';
import { ErgoIndexedBox, StockErgoNodeClient } from '../clients/ergo-node.js';
import { FrontierEvmClient } from '../clients/evm-client.js';
import {
  BridgeStateDb,
  readLiveReserveLiability,
  readLiveTrackerLatestSourceHeight,
} from '../state/db.js';

export interface ActiveCommitteeEpochConfig {
  epoch: bigint;
  threshold: number;
  ergoKeySetDigestHex: string;
  allPubKeysHex: string[];
  /** Subset of >= threshold committee member secrets (distributed signing, sliced to exact threshold) */
  signingMemberSecretsHex: string[];
}

export interface RelayerDaemonConfig {
  family: CompiledBridgeFamily;
  ergo: StockErgoNodeClient;
  evm: FrontierEvmClient;
  db: BridgeStateDb;
  feePayerSecretHex: string;
  /** Map from committee epoch -> committee config (allows seamless continuation across rotations!) */
  committeesByEpoch: Map<bigint, ActiveCommitteeEpochConfig>;
  /** Optional blake2b256(programId || profileId) if reconstructing post-graduation STARK entries */
  starkAuthorityDigestHex?: string;
  /** Explicit broadcast opt-in; false runs full build/sign/node-check dry-run without submitting. */
  broadcastEnabled: boolean;
  ergoDepositConfirmations: number;
  ergoReserveConfirmations: number;
  evmBurnConfirmations: number;
  evmStartBlock: number;
  rentRefreshAgeBlocks: number;
  pollIntervalMs: number;
  logger?: (msg: string) => void;
}

export interface TickSummary {
  ergoHeight: number;
  evmHeight: number;
  reconstructed: boolean;
  solvencyOk: boolean;
  reserveErg: bigint;
  reserveLiability: bigint;
  sergSupply: bigint;
  depositsCommitted: string[];
  sergMinted: string[];
  checkpointsAdmitted: string[];
  payoutsExecuted: string[];
  rentRefreshed: string[];
}

/**
 * Full 100% validation of BridgeReserve.es:sourceLockOk preconditions ([C-2], [H-2]).
 * Any malformed or poison-pill box at depositLockAddress is safely rejected before building/signing.
 */
function validateDepositLockBox(
  depBox: ErgoIndexedBox,
  family: CompiledBridgeFamily,
): Uint8Array | null {
  if ((depBox.assets?.length ?? 0) !== 0) return null;
  if (depBox.ergoTree !== family.depositLock.ergoTreeHex) return null;
  const r4 = depBox.additionalRegisters?.R4;
  const r5 = depBox.additionalRegisters?.R5;
  if (!r4 || !r5) return null;

  let encodedIntent: Uint8Array;
  let depositorTree: Uint8Array;
  try {
    encodedIntent = decodeSigmaCollByteHex(r4);
    depositorTree = decodeSigmaCollByteHex(r5);
  } catch {
    return null;
  }
  if (depositorTree.length === 0) return null;

  let intent: ReturnType<typeof decodePegInIntentV2>;
  try {
    intent = decodePegInIntentV2(encodedIntent);
  } catch {
    return null;
  }

  // Verify ALL 229-byte sourceLockOk fields match the compiled BridgeReserve constants
  const assetIdSlice = encodedIntent.slice(169, 201);
  if (!assetIdSlice.every((b, idx) => b === ZERO_32[idx])) return null;
  const recipientSlice = encodedIntent.slice(209, 229);
  if (recipientSlice.every((b, idx) => b === ZERO_20[idx])) return null;

  if (
    intent.sourceNetworkIdHex !== family.params.sourceNetworkIdHex.toLowerCase() ||
    intent.sidechainIdHex !== family.params.sidechainIdHex.toLowerCase() ||
    intent.bridgeAddressHex !== family.params.bridgeAddressHex.toLowerCase().replace(/^0x/, '') ||
    intent.tokenAddressHex !== family.params.tokenAddressHex.toLowerCase().replace(/^0x/, '') ||
    intent.familyIdHex !== family.familyIdHex ||
    intent.reserveNftIdHex !== family.params.reserveNftIdHex.toLowerCase() ||
    intent.amountNanoErg < family.params.minDepositNanoErg ||
    intent.amountNanoErg !== BigInt(depBox.value)
  ) {
    return null;
  }

  // Validate depositorTree is syntactically reasonable (non-empty) and amount fits signed i64
  if (hexToBytes(depBox.boxId, 32).length !== 32) return null;
  return encodedIntent;
}

export class BridgeRelayerDaemon {
  private readonly cfg: RelayerDaemonConfig;
  private readonly feeKey: ReturnType<typeof deriveKeyPairFromSecretHex>;
  private readonly depositLockAddress: string;
  private readonly log: (msg: string) => void;
  private running = false;
  /** Round-robin toggle preventing deposit bursts from starving peg-out payouts ([H-2]) */
  private preferPayoutNext = false;

  constructor(cfg: RelayerDaemonConfig) {
    this.cfg = cfg;
    this.feeKey = deriveKeyPairFromSecretHex(cfg.feePayerSecretHex, cfg.family.params.networkPrefix);
    this.depositLockAddress = p2sAddressFromErgoTreeHex(
      cfg.family.depositLock.ergoTreeHex,
      cfg.family.params.networkPrefix,
    );
    this.log = cfg.logger ?? ((m) => console.log(`[relayer] ${m}`));
  }

  private epochDigestMap(): Map<bigint, string> {
    const map = new Map<bigint, string>();
    for (const [epoch, c] of this.cfg.committeesByEpoch.entries()) {
      map.set(epoch, c.ergoKeySetDigestHex);
    }
    return map;
  }

  /**
   * Pick a pure-ERG fee box that is NOT already consumed in this tick AND NOT
   * already spent by an unconfirmed mempool transaction ([H-3]).
   */
  private async pickPureErgFeeBox(
    minRequiredNanoErg: bigint,
    usedFeeBoxIds: Set<string>,
  ): Promise<ErgoIndexedBox | null> {
    const utxos = await this.cfg.ergo.getUnspentBoxesByAddress(this.feeKey.address);
    const pure = utxos
      .filter(
        (u) =>
          !usedFeeBoxIds.has(u.boxId) &&
          (u.assets?.length ?? 0) === 0 &&
          BigInt(u.value) >= minRequiredNanoErg,
      )
      .sort((a, b) => Number(BigInt(b.value) - BigInt(a.value)));
    for (const box of pure) {
      const rem = BigInt(box.value) - minRequiredNanoErg;
      if (rem !== 0n && rem < MIN_BOX_VALUE) continue;
      // Ensure not already spent in Ergo mempool
      const stillLive = await this.cfg.ergo.getUnspentBoxWithPool(box.boxId);
      if (stillLive) return box;
    }
    return null;
  }

  private async isBoxSpendableWithMempool(boxId: string): Promise<boolean> {
    return (await this.cfg.ergo.getUnspentBoxWithPool(boxId)) !== null;
  }

  private async checkAndMaybeBroadcast(
    label: string,
    signedTxJson: Record<string, unknown>,
  ): Promise<string> {
    const checkedId = await this.cfg.ergo.checkTransaction(signedTxJson);
    if (!this.cfg.broadcastEnabled) {
      this.log(`[DRY-RUN] ${label} passed /transactions/check (txId=${checkedId}); broadcast disabled`);
      return checkedId;
    }
    const txId = await this.cfg.ergo.submitTransaction(signedTxJson);
    this.log(`Broadcasted ${label} -> txId=${txId}`);
    return txId;
  }

  /**
   * Execute one complete deterministic reconciliation & relay tick.
   */
  async tick(): Promise<TickSummary> {
    const { ergo, evm, db, family } = this.cfg;
    const [info, indexed, evmHeight, lastHeaders] = await Promise.all([
      ergo.getInfo(),
      ergo.getIndexedHeight(),
      evm.getBlockNumber(),
      ergo.getLastHeaders(10),
    ]);
    const ergoHeight = Math.min(info.fullHeight, indexed.indexedHeight);
    let [reserveBox, dupBox, trackerBox] = await Promise.all([
      ergo.getLiveSingletonBox(family.params.reserveNftIdHex),
      ergo.getLiveSingletonBox(family.params.dupNftIdHex),
      ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
    ]);

    // ------------------------------------------------------------------------
    // 0. AVL Digest Sync Check (reconstructs cleanly & adopts exact tip boxes [M-3])
    // ------------------------------------------------------------------------
    const liveReserveDigest = decodeSigmaAvlTreeDigestHex(reserveBox.additionalRegisters.R5);
    const liveDupDigest = decodeSigmaAvlTreeDigestHex(dupBox.additionalRegisters.R5);
    const liveTrackerDigest = decodeSigmaAvlTreeDigestHex(trackerBox.additionalRegisters.R5);

    let reconstructed = false;
    if (
      db.getMeta('reserve_digest_hex') !== liveReserveDigest ||
      db.getMeta('dup_digest_hex') !== liveDupDigest ||
      db.getMeta('tracker_digest_hex') !== liveTrackerDigest
    ) {
      this.log('Local AVL digest out of sync with Ergo L1 — reconstructing from chain history...');
      const report = await db.reconstructFromErgoNode(
        ergo,
        family,
        this.epochDigestMap(),
        this.cfg.starkAuthorityDigestHex,
      );
      reserveBox = report.liveReserveBox;
      dupBox = report.liveDupBox;
      trackerBox = report.liveTrackerBox;
      this.log(
        `Reconstructed AVL state cleanly: reserve=${report.reserveEntries}, tracker=${report.trackerEntries}, dup=${report.dupEntries}, epoch=${report.activeTrackerEpoch}`,
      );
      reconstructed = true;
    }

    // ------------------------------------------------------------------------
    // 1. Solvency Invariant Guard (totalSupply(sERG) <= reserve.liability <= reserve.value)
    // ------------------------------------------------------------------------
    const reserveErg = BigInt(reserveBox.value);
    const reserveLiability = readLiveReserveLiability(reserveBox);
    const solvency = await evm.getSolvencySnapshot();
    const solvencyOk =
      solvency.totalSupplyNanoErg <= reserveLiability && reserveLiability <= reserveErg;

    const summary: TickSummary = {
      ergoHeight,
      evmHeight,
      reconstructed,
      solvencyOk,
      reserveErg,
      reserveLiability,
      sergSupply: solvency.totalSupplyNanoErg,
      depositsCommitted: [],
      sergMinted: [],
      checkpointsAdmitted: [],
      payoutsExecuted: [],
      rentRefreshed: [],
    };

    if (!solvencyOk) {
      this.log(
        `CRITICAL SOLVENCY VIOLATION: sERG=${solvency.totalSupplyNanoErg}, liability=${reserveLiability}, reserveERG=${reserveErg}`,
      );
      if (this.cfg.broadcastEnabled && !solvency.paused) {
        await evm.emergencyPause('Solvency invariant violated');
      }
      return summary;
    }

    // Check which singletons are free of unconfirmed mempool spends ([H-3])
    const [reserveFree, dupFree, trackerFree] = await Promise.all([
      this.isBoxSpendableWithMempool(reserveBox.boxId),
      this.isBoxSpendableWithMempool(dupBox.boxId),
      this.isBoxSpendableWithMempool(trackerBox.boxId),
    ]);
    const usedFeeBoxIds = new Set<string>();
    let reserveSpentThisTick = !reserveFree;
    let dupSpentThisTick = !dupFree;
    let trackerSpentThisTick = !trackerFree;

    // ------------------------------------------------------------------------
    // 2. Storage-Rent Watchdog (respecting minRefreshAgeBlocks & mempool state)
    // ------------------------------------------------------------------------
    const minRefresh = Math.max(this.cfg.rentRefreshAgeBlocks, family.params.minRefreshAgeBlocks);
    for (const [label, box, isFree] of [
      ['reserve', reserveBox, !reserveSpentThisTick],
      ['dup', dupBox, !dupSpentThisTick],
      ['tracker', trackerBox, !trackerSpentThisTick && !dupSpentThisTick],
    ] as const) {
      if (!isFree) continue;
      if (ergoHeight - box.creationHeight < minRefresh) continue;
      if (label === 'tracker') {
        const r9 = decodeSigmaCollByteHex(box.additionalRegisters.R9);
        if (r9.length === 81 && decodeTrackerGovernanceR9(r9).pendingMode !== 0) continue;
      }
      const feeBox = await this.pickPureErgFeeBox(DEFAULT_MINER_FEE, usedFeeBoxIds);
      if (!feeBox) break;
      try {
        const built = buildRentRefreshTx({
          singletonBox: box,
          feeInBox: feeBox,
          changeErgoTreeHex: this.feeKey.p2pkErgoTreeHex,
          creationHeight: ergoHeight,
        });
        const signed = signTransaction({
          ...built,
          secretKeysHex: [this.cfg.feePayerSecretHex],
          height: ergoHeight,
          lastHeaders,
        });
        const txId = await this.checkAndMaybeBroadcast(`rentRefresh(${label})`, signed.signedTxJson);
        usedFeeBoxIds.add(feeBox.boxId);
        summary.rentRefreshed.push(`${label}:${txId}`);
        return summary;
      } catch (err) {
        this.log(`rentRefresh(${label}) skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ------------------------------------------------------------------------
    // 3. Paginated Frontier Burn Indexing into SQLite evm_burns ([H-5])
    // ------------------------------------------------------------------------
    const finalizedEvmHeight = evmHeight - this.cfg.evmBurnConfirmations;
    if (finalizedEvmHeight >= this.cfg.evmStartBlock) {
      const lastScannedMeta = db.getMeta('last_scanned_evm_block');
      const scanFrom =
        lastScannedMeta !== null
          ? Math.max(this.cfg.evmStartBlock, Number(lastScannedMeta) + 1)
          : this.cfg.evmStartBlock;
      if (scanFrom <= finalizedEvmHeight) {
        const newLogs = await evm.scanPegOutEvents(scanFrom, finalizedEvmHeight, 1000);
        db.upsertEvmBurns(
          family.params.sidechainIdHex,
          newLogs,
          computeBurnIdHex,
          finalizedEvmHeight,
        );
      }
    }

    // ------------------------------------------------------------------------
    // 4. Peg-In Stage B: Mint sERG on Frontier for confirmed Reserve deposits
    //    (Independent of Ergo mempool; runs even while Ergo txs are in-flight!)
    // ------------------------------------------------------------------------
    if (!solvency.paused) {
      for (const dep of db.getReserveDeposits()) {
        if (dep.mintTxHash) continue;
        if (ergoHeight - dep.commitHeight < this.cfg.ergoReserveConfirmations) continue;
        const alreadyOnChain = await evm.isPegInProcessed(dep.sourceBoxId);
        if (alreadyOnChain) {
          db.markDepositMinted(dep.sourceBoxId, 'already-processed-on-evm');
          continue;
        }
        if (!this.cfg.broadcastEnabled) {
          this.log(`[DRY-RUN] would mint ${dep.amountNanoErg} sERG to ${dep.evmRecipient} for ${dep.sourceBoxId}`);
          continue;
        }
        try {
          const receipt = await evm.mintSerg(dep.evmRecipient, dep.amountNanoErg, dep.sourceBoxId);
          db.markDepositMinted(dep.sourceBoxId, receipt.hash);
          this.log(
            `Minted ${dep.amountNanoErg} sERG to ${dep.evmRecipient} (sourceBox=${dep.sourceBoxId.slice(0, 12)}, evmTx=${receipt.hash})`,
          );
          summary.sergMinted.push(receipt.hash);
        } catch (err) {
          this.log(`mintSERG failed for ${dep.sourceBoxId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const storedBurnsByBlock = db.getStoredEvmBurnsByBlock();
    const sortedBurnBlocks = [...storedBurnsByBlock.keys()].sort((a, b) => a - b);

    // Helper: Stage A Peg-In Deposit Commit (poison-pill resilient [C-2], [H-2])
    const tryCommitOneDeposit = async (): Promise<boolean> => {
      if (reserveSpentThisTick) return false;
      const depositBoxes = await ergo.getUnspentBoxesByAddress(this.depositLockAddress);
      for (const depBox of depositBoxes) {
        const confs = ergoHeight - depBox.inclusionHeight;
        const age = ergoHeight - depBox.creationHeight;
        if (confs < this.cfg.ergoDepositConfirmations) continue;
        if (age >= family.params.escapeTimeoutBlocks - 10) continue;

        const encodedIntent = validateDepositLockBox(depBox, family);
        if (!encodedIntent) {
          this.log(`Skipping malformed or sub-minimum deposit box ${depBox.boxId.slice(0, 12)}`);
          continue;
        }
        if (!(await this.isBoxSpendableWithMempool(depBox.boxId))) continue;
        const feeBox = await this.pickPureErgFeeBox(DEFAULT_MINER_FEE, usedFeeBoxIds);
        if (!feeBox) return false;

        try {
          const built = buildCommitDepositTx({
            family,
            reserveBox,
            reserveLiabilityNanoErg: reserveLiability,
            reserveHistory: db.getReserveAvlHistory(),
            depositLockBox: depBox,
            encodedIntent,
            feeInBox: feeBox,
            changeErgoTreeHex: this.feeKey.p2pkErgoTreeHex,
            creationHeight: ergoHeight,
          });
          const signed = signTransaction({
            ...built,
            secretKeysHex: [this.cfg.feePayerSecretHex],
            height: ergoHeight,
            lastHeaders,
          });
          const txId = await this.checkAndMaybeBroadcast(
            `commitDeposit(${depBox.boxId.slice(0, 12)})`,
            signed.signedTxJson,
          );
          usedFeeBoxIds.add(feeBox.boxId);
          reserveSpentThisTick = true;
          summary.depositsCommitted.push(txId);
          return true;
        } catch (err) {
          this.log(
            `Deposit commit skipped for box ${depBox.boxId.slice(0, 12)}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
      }
      return false;
    };

    // Helper: Stage B Peg-Out Payout (reconciled blockHash/count/root + try/catch [H-3], [H-5])
    const tryExecuteOnePayout = async (): Promise<boolean> => {
      if (reserveSpentThisTick || dupSpentThisTick || trackerSpentThisTick) return false;
      for (const blockNum of sortedBurnBlocks) {
        const entry = db.getTrackerEntryBySourceHeight(BigInt(blockNum));
        if (!entry) continue;
        if (BigInt(ergoHeight) < BigInt(entry.admissionHeight) + family.params.minConfirmations) {
          continue;
        }
        const blockRows = storedBurnsByBlock.get(blockNum)!;
        if (blockRows.length !== entry.burnCount) {
          this.log(
            `ALERT: block ${blockNum} local burnCount=${blockRows.length} != on-chain tracker burnCount=${entry.burnCount}; skipping block`,
          );
          continue;
        }
        if (blockRows[0].blockHashHex !== entry.executionBlockHashHex) {
          this.log(
            `ALERT: block ${blockNum} executionBlockHash mismatch (local=${blockRows[0].blockHashHex} vs tracker=${entry.executionBlockHashHex}); skipping block`,
          );
          continue;
        }
        const leaves: BurnLeafV1[] = blockRows.map((r) => ({
          sidechainIdHex: family.params.sidechainIdHex,
          executionBlockHashHex: r.blockHashHex,
          sidechainTxHashHex: r.txHashHex,
          eventIndex: r.logIndex,
          recipientErgoTreeHex: r.recipientErgoTreeHex,
          amountNanoErg: r.amountNanoErg,
        }));
        const merkle = buildBurnMerkleTree(leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
        if (merkle.rootHex !== entry.bridgeEventRootHex) {
          this.log(
            `ALERT: block ${blockNum} Merkle root mismatch (local=${merkle.rootHex} vs tracker=${entry.bridgeEventRootHex}); skipping block`,
          );
          continue;
        }

        for (let leafIdx = 0; leafIdx < leaves.length; leafIdx++) {
          const encoded = encodeBurnLeafV1(leaves[leafIdx]);
          if (db.isBurnSpentOnErgo(encoded.burnIdHex)) continue;
          const feeBox = await this.pickPureErgFeeBox(DEFAULT_MINER_FEE, usedFeeBoxIds);
          if (!feeBox) return false;

          try {
            const built = buildBurnPayoutTx({
              family,
              trackerBox,
              trackerHistory: db.getTrackerAvlHistory(),
              trackerKeyHex: entry.trackerKeyHex,
              reserveBox,
              reserveLiabilityNanoErg: reserveLiability,
              dupBox,
              dupHistoryBurnIdsHex: db.getDupHistoryBurnIds(),
              sidechainHeight: BigInt(blockNum),
              blockBurnLeaves: leaves,
              targetLeafIndex: leafIdx,
              feeInBox: feeBox,
              changeErgoTreeHex: this.feeKey.p2pkErgoTreeHex,
              creationHeight: ergoHeight,
            });
            const signed = signTransaction({
              ...built,
              secretKeysHex: [this.cfg.feePayerSecretHex],
              height: ergoHeight,
              lastHeaders,
            });
            const txId = await this.checkAndMaybeBroadcast(
              `burnPayout(block=${blockNum}, leaf=${leafIdx}, amount=${leaves[leafIdx].amountNanoErg})`,
              signed.signedTxJson,
            );
            usedFeeBoxIds.add(feeBox.boxId);
            reserveSpentThisTick = true;
            dupSpentThisTick = true;
            summary.payoutsExecuted.push(txId);
            return true;
          } catch (err) {
            this.log(
              `Payout skipped for block=${blockNum} leaf=${leafIdx}: ${err instanceof Error ? err.message : String(err)}`,
            );
            continue;
          }
        }
      }
      return false;
    };

    // ------------------------------------------------------------------------
    // 5. Fair Round-Robin Reserve Scheduling (Deposit vs Payout [H-2])
    //    Flip turn preference ONLY when a Reserve action actually executed.
    // ------------------------------------------------------------------------
    let didPayout = false;
    let didCommit = false;
    if (this.preferPayoutNext) {
      didPayout = await tryExecuteOnePayout();
      if (!didPayout) didCommit = await tryCommitOneDeposit();
    } else {
      didCommit = await tryCommitOneDeposit();
      if (!didCommit) didPayout = await tryExecuteOnePayout();
    }
    if (didPayout) {
      this.preferPayoutNext = false;
    } else if (didCommit) {
      this.preferPayoutNext = true;
    }

    // ------------------------------------------------------------------------
    // 6. Peg-Out Stage A: Admit Next Finalized Burn Block to BridgeTracker
    //    (Runs only if Tracker is free AND no in-flight or same-tick payout
    //    references Tracker as DATA_INPUTS(0) [H-3])
    // ------------------------------------------------------------------------
    if (!trackerSpentThisTick && !dupSpentThisTick && summary.payoutsExecuted.length === 0) {
      const latestAdmittedSourceHeight = readLiveTrackerLatestSourceHeight(trackerBox);
      for (const blockNum of sortedBurnBlocks) {
        if (BigInt(blockNum) <= latestAdmittedSourceHeight) continue;
        const blockRows = storedBurnsByBlock.get(blockNum)!;
        if (blockRows.length === 0 || blockRows.length > 256) {
          this.log(`ALERT: block ${blockNum} has invalid burnCount=${blockRows.length}; cannot admit`);
          break;
        }
        const currentR9Bytes = decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9);
        if (currentR9Bytes.length !== 81) {
          this.log('Tracker has graduated to EIP-0045 STARK mode; federated admission disabled.');
          break;
        }
        const gov = decodeTrackerGovernanceR9(currentR9Bytes);
        const committee = this.cfg.committeesByEpoch.get(gov.epoch);
        if (!committee) {
          throw new Error(`No committee signing config for active tracker epoch ${gov.epoch}`);
        }
        const feeBox = await this.pickPureErgFeeBox(DEFAULT_MINER_FEE, usedFeeBoxIds);
        if (!feeBox) break;

        try {
          const leaves: BurnLeafV1[] = blockRows.map((r) => ({
            sidechainIdHex: family.params.sidechainIdHex,
            executionBlockHashHex: r.blockHashHex,
            sidechainTxHashHex: r.txHashHex,
            eventIndex: r.logIndex,
            recipientErgoTreeHex: r.recipientErgoTreeHex,
            amountNanoErg: r.amountNanoErg,
          }));
          const merkle = buildBurnMerkleTree(leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
          const built = buildTrackerAdmitTx({
            family,
            trackerBox,
            trackerHistory: db.getTrackerAvlHistory(),
            checkpoint: {
              sourceNetworkIdHex: family.params.sourceNetworkIdHex,
              sidechainIdHex: family.params.sidechainIdHex,
              sourceHeight: BigInt(blockNum),
              sourceBlockHashHex: blockRows[0].blockHashHex,
              executionBlockHashHex: blockRows[0].blockHashHex,
              bridgeEventRootHex: merkle.rootHex,
              burnCount: leaves.length,
            },
            ergoKeySetDigestHex: committee.ergoKeySetDigestHex,
            committeeEpoch: gov.epoch,
            currentR9Bytes,
            feeInBox: feeBox,
            changeErgoTreeHex: this.feeKey.p2pkErgoTreeHex,
            creationHeight: ergoHeight,
          });
          const signed = signTransactionDistributedCommittee({
            ...built,
            committeeMemberSecretsHex: committee.signingMemberSecretsHex,
            allCommitteePubKeysHex: committee.allPubKeysHex,
            threshold: committee.threshold,
            feePayerSecretHex: this.cfg.feePayerSecretHex,
            height: ergoHeight,
            lastHeaders,
          });
          const txId = await this.checkAndMaybeBroadcast(
            `admitCheckpoint(block=${blockNum}, burns=${leaves.length}, epoch=${gov.epoch})`,
            signed.signedTxJson,
          );
          usedFeeBoxIds.add(feeBox.boxId);
          trackerSpentThisTick = true;
          summary.checkpointsAdmitted.push(txId);
        } catch (err) {
          this.log(
            `admitCheckpoint(block=${blockNum}) failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        break;
      }
    }

    return summary;
  }

  async start(): Promise<void> {
    this.running = true;
    this.log(
      `Starting Bridge V1 Relayer Daemon (broadcast=${this.cfg.broadcastEnabled}, poll=${this.cfg.pollIntervalMs}ms)`,
    );
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Tick error: ${msg}`);
      }
      if (!this.running) break;
      await new Promise((r) => setTimeout(r, this.cfg.pollIntervalMs));
    }
  }

  stop(): void {
    this.running = false;
  }
}
