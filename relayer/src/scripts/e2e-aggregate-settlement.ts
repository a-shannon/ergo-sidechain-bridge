/**
 * End-to-end aggregate peg-out settlement runner.
 *
 * Historical diagnostic flow: inspect the anchor, prepare an unsigned
 * diagnostic, and reconcile an already-submitted transaction after confirmation.
 *
 * Commands:
 *   npm run e2e:aggregate -- anchor-env <sidechainTxHash>
 *   npm run e2e:aggregate -- anchor-check <sidechainTxHash> [ergoAnchorHeight]
 *   npm run e2e:aggregate -- prepare <sidechainTxHash>
 *   npm run e2e:aggregate -- confirm <sidechainTxHash> <settlementTxId> <ergoAnchorHeight>
 *
 * Environment must be supplied by the shell. This runner does not load .env.
 * No command in this runner signs, checks, submits, or broadcasts a new V1 payout.
 */

import { ethers } from 'ethers';
import { deriveAnchoredTrackerIngest } from '../aggregate-anchor.js';
import {
  AggregateSettlementService,
  type PreparedAggregateSettlement,
  type SidechainBurnVerificationStatus,
  resolveAggregateRecipientErgoTree,
} from '../aggregate-settlement-service.js';
import { deriveAggregateBurnEventRoot } from '../aggregate-settlement-tx.js';
import {
  loadDeployedState,
  PROTOCOL_PARAMS,
  SUBSTRATE_CONFIG,
  type DeployedState,
} from '../config.js';
import { ErgoClient } from '../ergo-client.js';
import { verifyPegOutBurnReceipt } from '../peg-out-burn-verifier.js';
import type { ParsedPegOut } from '../sidechain-client.js';
import type { SpvTrackerEntry } from '../spv-tracker.js';
import { toSpvTrackerHistoryEntry } from '../spv-tracker.js';
import { StateTracker } from '../state-tracker.js';

const ANCHOR_MIN_CONFIRMATIONS = Number(
  process.env.E2E_AGGREGATE_ANCHOR_MIN_CONFIRMATIONS
  ?? PROTOCOL_PARAMS.aggregateAnchorMinConfirmations,
);
const ANCHOR_LOOKBACK_BLOCKS = Number(
  process.env.E2E_AGGREGATE_ANCHOR_LOOKBACK_BLOCKS
  ?? PROTOCOL_PARAMS.aggregateAnchorLookbackBlocks,
);
const WAIT_TIMEOUT_MS = Number(process.env.E2E_AGGREGATE_TIMEOUT_MS ?? '900000');
const WAIT_POLL_MS = Number(process.env.E2E_AGGREGATE_POLL_MS ?? '15000');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function usage(): never {
  console.error([
    'Usage:',
    '  npm run e2e:aggregate -- anchor-env <sidechainTxHash>',
    '  npm run e2e:aggregate -- anchor-check <sidechainTxHash> [ergoAnchorHeight]',
    '  npm run e2e:aggregate -- prepare <sidechainTxHash>',
    '  npm run e2e:aggregate -- confirm <sidechainTxHash> <settlementTxId> <ergoAnchorHeight>  [historical reconciliation only]',
    '',
    'Environment: set required variables in the shell; this runner does not load .env.',
  ].join('\n'));
  process.exit(1);
}

const supportedNonSubmissionCommands = new Set([
  'anchor-env',
  'anchor-check',
  'prepare',
  'confirm',
]);

function rowValue(row: any, snake: string, camel: string): any {
  return row?.[snake] ?? row?.[camel];
}

function pegOutFromRow(row: any): ParsedPegOut {
  const sidechainTxHash = rowValue(row, 'sidechain_burn_tx_hash', 'sidechainBurnTxHash');
  const ergoRecipientAddress = rowValue(row, 'ergo_recipient_address', 'ergoRecipientAddress');
  const amountRaw = rowValue(row, 'amount_nanoerg', 'amountNanoErg');
  const heightRaw = rowValue(row, 'sidechain_burn_height', 'sidechainBurnHeight');
  if (!sidechainTxHash || !ergoRecipientAddress || amountRaw === undefined || heightRaw === undefined) {
    throw new Error('peg_out_events row is missing required fields');
  }

  return {
    user: row.user ?? '',
    sidechainTxHash,
    ergoRecipientAddress,
    amount: BigInt(amountRaw),
    sidechainBlockNumber: Number(heightRaw),
    sidechainBlockHash: rowValue(row, 'sidechain_block_hash', 'sidechainBlockHash') ?? undefined,
    sidechainLogIndex: rowValue(row, 'sidechain_log_index', 'sidechainLogIndex') ?? undefined,
  };
}

function findPegOut(state: StateTracker, txHash: string): ParsedPegOut {
  const candidates = txHash.startsWith('0x')
    ? [txHash, txHash.slice(2)]
    : [txHash, `0x${txHash}`];

  for (const candidate of candidates) {
    const row = state.getPegOutByTxHash(candidate);
    if (row) return pegOutFromRow(row);
  }

  throw new Error(`PegOut ${txHash} not found in SQLite peg_out_events`);
}

async function tryDeriveAnchor(
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
  anchorHeight: number,
): Promise<SpvTrackerEntry | null> {
  try {
    return await deriveAnchorAtHeight(ergo, provider, pegOut, anchorHeight);
  } catch {
    return null;
  }
}

async function deriveAnchorAtHeight(
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
  anchorHeight: number,
): Promise<SpvTrackerEntry> {
  return deriveAnchoredTrackerIngest({
    pegOut,
    sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
    ergoAnchorHeight: anchorHeight,
    deps: {
      addressToTree: address => ergo.addressToTree(address),
      getSidechainExtensionFieldsAtHeight: height => ergo.getSidechainExtensionFieldsAtHeight(height),
      getSidechainBlockHash: async (blockNumber) => {
        const block = await provider.getBlock(blockNumber);
        if (!block?.hash) throw new Error(`cannot resolve sidechain block ${blockNumber}`);
        return block.hash;
      },
    },
  });
}

async function printAnchorEnv(ergo: ErgoClient, pegOut: ParsedPegOut): Promise<void> {
  const recipientErgoTree = await resolveAggregateRecipientErgoTree(
    pegOut.ergoRecipientAddress,
    address => ergo.addressToTree(address),
  );
  const bridgeEventRootHex = deriveAggregateBurnEventRoot(
    pegOut.sidechainTxHash,
    recipientErgoTree,
    BigInt(pegOut.amount),
  );

  console.log('Patched Ergo miner extension env for this aggregate burn:');
  console.log(`  burnTx:      ${pegOut.sidechainTxHash}`);
  console.log(`  sidechainH:  ${pegOut.sidechainBlockNumber}`);
  console.log(`  amount:      ${pegOut.amount}`);
  console.log(`  recipient:   ${pegOut.ergoRecipientAddress}`);
  console.log(`  eventRoot:   ${bridgeEventRootHex}`);
  console.log();
  console.log(`ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:${bridgeEventRootHex}`);
}

function printTrackerIngest(entry: SpvTrackerEntry): void {
  const historyEntry = toSpvTrackerHistoryEntry(entry);
  console.log('Aggregate anchor check passed');
  console.log(`  sidechainId:          ${entry.sidechainIdHex}`);
  console.log(`  sidechainHeight:      ${entry.sidechainHeight.toString()}`);
  console.log(`  sidechainHeaderHash:  ${entry.sidechainHeaderHashHex}`);
  console.log(`  bridgeEventRoot:      ${entry.bridgeEventRootHex}`);
  console.log(`  ergoAnchorHeight:     ${entry.ergoAnchorHeight}`);
  console.log(`  trackerKey:           ${historyEntry.key}`);
  console.log(`  trackerValue:         ${historyEntry.value}`);
}

async function checkAnchorOnly(
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
  anchorHeight?: number,
): Promise<SpvTrackerEntry> {
  const trackerIngest = anchorHeight === undefined
    ? await waitForAnchor(ergo, provider, pegOut)
    : await deriveAnchorAtHeight(ergo, provider, pegOut, anchorHeight);

  printTrackerIngest(trackerIngest);
  return trackerIngest;
}

async function scanConfirmedAnchors(
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
): Promise<SpvTrackerEntry | null> {
  const ergoHeight = await ergo.getCurrentHeight();
  const maxAnchorHeight = ergoHeight - ANCHOR_MIN_CONFIRMATIONS;
  if (maxAnchorHeight < 0) return null;

  const minAnchorHeight = Math.max(0, maxAnchorHeight - ANCHOR_LOOKBACK_BLOCKS + 1);
  // Schema B is first-anchor-wins: if the same tracker key appears in multiple
  // confirmed anchors, use the oldest canonical anchor in the scan window.
  for (let height = minAnchorHeight; height <= maxAnchorHeight; height++) {
    const entry = await tryDeriveAnchor(ergo, provider, pegOut, height);
    if (entry) return entry;
  }

  return null;
}

async function waitForAnchor(
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
): Promise<SpvTrackerEntry> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const anchor = await scanConfirmedAnchors(ergo, provider, pegOut);
    if (anchor) {
      console.log(`Found confirmed 0x0401 anchor at Ergo height ${anchor.ergoAnchorHeight}`);
      console.log(`  sidechainHeaderHash: ${anchor.sidechainHeaderHashHex}`);
      console.log(`  bridgeEventRoot:     ${anchor.bridgeEventRootHex}`);
      return anchor;
    }

    console.log(
      `Waiting for confirmed 0x0401 anchor ` +
      `(minConf=${ANCHOR_MIN_CONFIRMATIONS}, lookback=${ANCHOR_LOOKBACK_BLOCKS})...`,
    );
    await sleep(WAIT_POLL_MS);
  }

  throw new Error(`timed out waiting for confirmed 0x0401 anchor for ${pegOut.sidechainTxHash}`);
}

async function verifySidechainBurnForE2e(
  provider: ethers.JsonRpcProvider,
  deployed: DeployedState,
  pegOut: ParsedPegOut,
): Promise<SidechainBurnVerificationStatus> {
  const bridgeAddress = deployed.solidity?.bridgeAddress;
  if (!bridgeAddress) {
    console.error('sidechain burn verification unavailable: deployed bridge address missing');
    return 'unknown';
  }

  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(pegOut.sidechainTxHash);
  } catch (err: any) {
    console.error(`sidechain burn verification unavailable: ${err?.message ?? String(err)}`);
    return 'unknown';
  }

  const result = verifyPegOutBurnReceipt({
    pegOut,
    receipt,
    bridgeAddress,
    sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
  });
  if (result.ok) return 'confirmed';

  for (const error of result.errors) {
    console.error(`sidechain burn verification issue: ${error}`);
  }
  return result.reverted ? 'reverted' : 'unknown';
}

function makeService(
  ergo: ErgoClient,
  state: StateTracker,
  provider: ethers.JsonRpcProvider,
): AggregateSettlementService {
  const deployed = loadDeployedState();
  return new AggregateSettlementService({
    ergo,
    state,
    deployed,
    sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
    verifySidechainBurn: pegOut => verifySidechainBurnForE2e(provider, deployed, pegOut),
  });
}

async function prepareAnchoredSettlement(
  state: StateTracker,
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
): Promise<{ trackerIngest: SpvTrackerEntry; prepared: PreparedAggregateSettlement }> {
  const trackerIngest = await waitForAnchor(ergo, provider, pegOut);
  const service = makeService(ergo, state, provider);
  const prepared = await service.prepareSingleClaim({
    pegOut,
    trackerIdentity: trackerIngest,
    trackerIngest,
  });

  console.log('Aggregate anchored settlement prepared');
  console.log(`  burnTx:      ${pegOut.sidechainTxHash}`);
  console.log(`  trackerTree: ${prepared.plan.claims[0].trackerTree}`);
  console.log(`  trackerBox:  ${prepared.trackerBox.boxId}`);
  console.log(`  dupBox:      ${prepared.aggregateDupBox.boxId}`);
  console.log(`  unlockBox:   ${prepared.unlockBox.boxId}`);
  console.log(`  outputs:     ${prepared.eip12Tx.outputs.length}`);
  return { trackerIngest, prepared };
}

async function prepareAnchored(
  state: StateTracker,
  ergo: ErgoClient,
  provider: ethers.JsonRpcProvider,
  pegOut: ParsedPegOut,
): Promise<SpvTrackerEntry> {
  const { trackerIngest } = await prepareAnchoredSettlement(state, ergo, provider, pegOut);
  return trackerIngest;
}

async function waitForSettlementConfirmation(
  service: AggregateSettlementService,
  pegOut: ParsedPegOut,
  settlementTxId: string,
  trackerIngest: SpvTrackerEntry,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await service.confirmSingleClaimSettlement(pegOut, settlementTxId, trackerIngest)) {
      console.log(`Aggregate settlement confirmed and reconciled: ${settlementTxId}`);
      return;
    }
    console.log(`Waiting for Ergo confirmation of aggregate settlement ${settlementTxId}...`);
    await sleep(WAIT_POLL_MS);
  }

  throw new Error(`timed out waiting for aggregate settlement confirmation ${settlementTxId}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  if (!supportedNonSubmissionCommands.has(command)) usage();

  const state = new StateTracker('./bridge-state.sqlite', { readOnly: command !== 'confirm' });
  try {
    const ergo = new ErgoClient();
    const provider = new ethers.JsonRpcProvider(SUBSTRATE_CONFIG.evmRpcUrl);

    if (command === 'prepare') {
      const txHash = args[0];
      if (!txHash) usage();
      await prepareAnchored(state, ergo, provider, findPegOut(state, txHash));
      return;
    }

    if (command === 'anchor-env') {
      const txHash = args[0];
      if (!txHash) usage();
      await printAnchorEnv(ergo, findPegOut(state, txHash));
      return;
    }

    if (command === 'anchor-check') {
      const [txHash, anchorHeightRaw] = args;
      if (!txHash) usage();
      const anchorHeight = anchorHeightRaw === undefined ? undefined : Number(anchorHeightRaw);
      if (anchorHeightRaw !== undefined && !Number.isInteger(anchorHeight)) {
        throw new Error(`invalid ergoAnchorHeight: ${anchorHeightRaw}`);
      }
      await checkAnchorOnly(ergo, provider, findPegOut(state, txHash), anchorHeight);
      return;
    }

    if (command === 'confirm') {
      const [txHash, settlementTxId, anchorHeightRaw] = args;
      if (!txHash || !settlementTxId || !anchorHeightRaw) usage();
      const pegOut = findPegOut(state, txHash);
      const trackerIngest = await tryDeriveAnchor(
        ergo,
        provider,
        pegOut,
        Number(anchorHeightRaw),
      );
      if (!trackerIngest) throw new Error(`cannot re-derive anchor at Ergo height ${anchorHeightRaw}`);
      await waitForSettlementConfirmation(
        makeService(ergo, state, provider),
        pegOut,
        settlementTxId,
        trackerIngest,
      );
      return;
    }

    usage();
  } finally {
    state.close();
  }
}

main().catch((err: any) => {
  console.error(`Aggregate E2E failed: ${err.message || err}`);
  process.exit(1);
});
