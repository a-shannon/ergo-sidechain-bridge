/**
 * Aggregate settlement operator script.
 *
 * Usage:
 *   npm run settle:aggregate -- prepare <sidechainTxHash>
 *   npm run settle:aggregate -- prepare-batch <sidechainTxHash> <sidechainTxHash> [...]
 *   npm run settle:aggregate -- confirm <sidechainTxHash> <settlementTxId>
 *   npm run settle:aggregate -- confirm-batch <settlementTxId> <sidechainTxHash> <sidechainTxHash> [...]
 *   npm run settle:aggregate -- prepare-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>
 *   npm run settle:aggregate -- confirm-with-ingest <sidechainTxHash> <settlementTxId> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>
 *   npm run settle:aggregate -- prepare-anchored <sidechainTxHash> <ergoAnchorHeight>
 *   npm run settle:aggregate -- confirm-anchored <sidechainTxHash> <settlementTxId> <ergoAnchorHeight>
 *
 * Prepare commands construct unsigned diagnostics only. New legacy V1 signing,
 * node checking, authorization, submission, and transport are absent because
 * that profile funds its miner fee from protected backing. Run confirm only for
 * a previously submitted historical transaction after it is canonical.
 * All commands accept --state-db <relative.sqlite>; it defaults to
 * ./bridge-state.sqlite for backwards-compatible operator runs.
 * All commands accept --deployed-state-json <relative.json> for an explicit
 * sanitized deployment-state input; omitting it preserves the default
 * contracts/deployed_state.json loader.
 * The script does not auto-load .env files; provide approved environment
 * variables through the invoking shell.
 */

import { ethers } from 'ethers';
import { deriveAnchoredTrackerIngest as deriveAnchoredTrackerIngestCore } from '../aggregate-anchor.js';
import { AggregateSettlementService } from '../aggregate-settlement-service.js';
import type { SidechainBurnVerificationStatus } from '../aggregate-settlement-service.js';
import { loadDeployedState, SUBSTRATE_CONFIG } from '../config.js';
import type { DeployedState } from '../config.js';
import { ErgoClient } from '../ergo-client.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { verifyPegOutBurnReceipt } from '../peg-out-burn-verifier.js';
import { resolveStateDbPath } from '../post-submit-observe-paths.js';
import type { ParsedPegOut } from '../sidechain-client.js';
import type { SpvTrackerEntry } from '../spv-tracker.js';
import { StateTracker } from '../state-tracker.js';

const READ_ONLY_AGGREGATE_COMMANDS = new Set([
  'prepare',
  'prepare-batch',
  'prepare-with-ingest',
  'prepare-anchored',
]);

const SUPPORTED_AGGREGATE_COMMANDS = new Set([
  ...READ_ONLY_AGGREGATE_COMMANDS,
  'confirm',
  'confirm-batch',
  'confirm-with-ingest',
  'confirm-anchored',
]);

interface AggregateSettlementCliOptions {
  args: string[];
  stateDbPath: string;
  deployedStateJsonPath?: string;
}

function isReadOnlyAggregateCommand(command: string): boolean {
  return READ_ONLY_AGGREGATE_COMMANDS.has(command);
}

function usage(): never {
  console.error([
    'Usage:',
    '  npm run settle:aggregate -- prepare <sidechainTxHash>',
    '  npm run settle:aggregate -- prepare-batch <sidechainTxHash> <sidechainTxHash> [...]',
    '  npm run settle:aggregate -- confirm <sidechainTxHash> <settlementTxId>',
    '  npm run settle:aggregate -- confirm-batch <settlementTxId> <sidechainTxHash> <sidechainTxHash> [...]',
    '  npm run settle:aggregate -- prepare-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>',
    '  npm run settle:aggregate -- confirm-with-ingest <sidechainTxHash> <settlementTxId> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>',
    '  npm run settle:aggregate -- prepare-anchored <sidechainTxHash> <ergoAnchorHeight>',
    '  npm run settle:aggregate -- confirm-anchored <sidechainTxHash> <settlementTxId> <ergoAnchorHeight>',
    '',
    'Options:',
    '  --state-db <relative.sqlite>   Operator-provided state DB, default ./bridge-state.sqlite',
    '  --deployed-state-json <relative.json>   Operator-provided sanitized deployment JSON, default contracts/deployed_state.json',
  ].join('\n'));
  process.exit(1);
}

function parseCliOptions(rawArgs: string[]): AggregateSettlementCliOptions {
  const args: string[] = [];
  let stateDbPath = './bridge-state.sqlite';
  let stateDbProvided = false;
  let deployedStateJsonPath: string | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--state-db') {
      if (stateDbProvided) {
        throw new Error('--state-db may only be provided once');
      }
      const value = rawArgs[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--state-db requires a path');
      }
      stateDbPath = value;
      stateDbProvided = true;
      index += 1;
      continue;
    }
    if (arg === '--deployed-state-json') {
      if (deployedStateJsonPath) {
        throw new Error('--deployed-state-json may only be provided once');
      }
      const value = rawArgs[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--deployed-state-json requires a path');
      }
      deployedStateJsonPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    }
    args.push(arg);
  }

  return {
    args,
    stateDbPath,
    deployedStateJsonPath,
  };
}

function resolveAggregateSettlementStateDbPath(target: string): { path?: string; errors: string[] } {
  const resolved = resolveStateDbPath(target);
  if (resolved.errors.length > 0) {
    return { errors: resolved.errors.map(error => `aggregate settlement: ${error}`) };
  }
  return resolved;
}

function loadAggregateSettlementDeployedState(options: AggregateSettlementCliOptions): DeployedState {
  if (!options.deployedStateJsonPath) {
    return loadDeployedState();
  }
  const read = readEvidenceJsonTarget(options.deployedStateJsonPath, '--deployed-state-json');
  if (read.errors.length > 0) {
    throw new Error(read.errors.map(error => `aggregate settlement deployed state: ${error}`).join('\n'));
  }
  const deployed = read.json as DeployedState;
  console.log(`[OK] Loaded explicit deployed state (network: ${deployed.network ?? 'unknown'})`);
  return deployed;
}

function normalizeHexArg(hex: string, expectedBytes: number, label: string): string {
  const clean = hex?.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function rowValue(row: any, snake: string, camel: string): any {
  return row?.[snake] ?? row?.[camel];
}

function toPegOut(row: any): ParsedPegOut {
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
    if (row) return toPegOut(row);
  }

  throw new Error(`PegOut ${txHash} not found in SQLite peg_out_events`);
}

function buildTrackerIngest(
  pegOut: ParsedPegOut,
  sidechainHeaderHashHex: string,
  bridgeEventRootHex: string,
  ergoAnchorHeightRaw: string,
): SpvTrackerEntry {
  const ergoAnchorHeight = Number(ergoAnchorHeightRaw);
  if (!Number.isInteger(ergoAnchorHeight) || ergoAnchorHeight < 0) {
    throw new Error(`ergoAnchorHeight must be a non-negative integer, got ${ergoAnchorHeightRaw}`);
  }

  return {
    sidechainIdHex: normalizeHexArg(SUBSTRATE_CONFIG.spvSidechainIdHex, 32, 'SPV_SIDECHAIN_ID_HEX'),
    sidechainHeight: BigInt(pegOut.sidechainBlockNumber),
    sidechainHeaderHashHex: normalizeHexArg(sidechainHeaderHashHex, 32, 'sidechainHeaderHashHex'),
    bridgeEventRootHex: normalizeHexArg(bridgeEventRootHex, 32, 'bridgeEventRootHex'),
    ergoAnchorHeight,
  };
}

function parseAnchorHeight(raw: string): number {
  const ergoAnchorHeight = Number(raw);
  if (!Number.isInteger(ergoAnchorHeight) || ergoAnchorHeight < 0) {
    throw new Error(`ergoAnchorHeight must be a non-negative integer, got ${raw}`);
  }
  return ergoAnchorHeight;
}

async function deriveAnchoredTrackerIngestFromRuntime(
  pegOut: ParsedPegOut,
  ergo: ErgoClient,
  ergoAnchorHeightRaw: string,
): Promise<SpvTrackerEntry> {
  const ergoAnchorHeight = parseAnchorHeight(ergoAnchorHeightRaw);
  const provider = new ethers.JsonRpcProvider(SUBSTRATE_CONFIG.evmRpcUrl);
  return await deriveAnchoredTrackerIngestCore({
    pegOut,
    sidechainIdHex: normalizeHexArg(SUBSTRATE_CONFIG.spvSidechainIdHex, 32, 'SPV_SIDECHAIN_ID_HEX'),
    ergoAnchorHeight,
    deps: {
      addressToTree: address => ergo.addressToTree(address),
      getSidechainExtensionFieldsAtHeight: height => ergo.getSidechainExtensionFieldsAtHeight(height),
      getSidechainBlockHash: async (blockNumber) => {
        const sidechainBlock = await provider.getBlock(blockNumber);
        if (!sidechainBlock?.hash) {
          throw new Error(`cannot resolve sidechain block ${blockNumber}`);
        }
        return sidechainBlock.hash;
      },
    },
  });
}

async function verifySidechainBurnFromCli(
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

function resolveBatchClaims(
  state: StateTracker,
  txHashes: string[],
  commandLabel = 'prepare-batch',
  options: { requireTrackerIdentity?: boolean } = {},
): Array<{ pegOut: ParsedPegOut; trackerIdentity?: SpvTrackerEntry; burnTxHash: string }> {
  const requireTrackerIdentity = options.requireTrackerIdentity ?? true;
  if (txHashes.length < 2) {
    throw new Error(`${commandLabel} requires at least two sidechain burn transaction hashes`);
  }
  const normalizedBurns = txHashes.map((txHash, index) =>
    normalizeHexArg(txHash, 32, `${commandLabel} burnTxHash[${index}]`),
  );
  if (new Set(normalizedBurns).size !== normalizedBurns.length) {
    throw new Error(`${commandLabel} burn transaction hashes must not contain duplicates`);
  }

  return normalizedBurns.map((burnTxHash) => {
    const pegOut = findPegOut(state, burnTxHash);
    const trackerIdentity = state.getSpvTrackerIdentityByHeight(
      pegOut.sidechainBlockNumber,
      SUBSTRATE_CONFIG.spvSidechainIdHex,
    );
    if (requireTrackerIdentity && !trackerIdentity) {
      throw new Error(
        `${commandLabel} requires an SPV tracker identity for burn ${burnTxHash} at sidechain height ${pegOut.sidechainBlockNumber}`,
      );
    }
    return { pegOut, trackerIdentity: trackerIdentity ?? undefined, burnTxHash };
  });
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  if (!command) usage();
  if (!SUPPORTED_AGGREGATE_COMMANDS.has(command)) usage();
  const options = parseCliOptions(rawArgs);
  const { args } = options;
  const txHash = args[0];
  if (!txHash) usage();
  const stateDbTarget = resolveAggregateSettlementStateDbPath(options.stateDbPath);
  if (stateDbTarget.errors.length > 0) {
    throw new Error(stateDbTarget.errors.join('\n'));
  }
  const deployed = loadAggregateSettlementDeployedState(options);

  const state = new StateTracker(stateDbTarget.path!, {
    readOnly: isReadOnlyAggregateCommand(command),
  });
  try {
    if (isReadOnlyAggregateCommand(command)) {
      console.log('StateTracker mode: read-only');
    }
    const ergo = new ErgoClient();
    const sidechainProvider = new ethers.JsonRpcProvider(SUBSTRATE_CONFIG.evmRpcUrl);
    const service = new AggregateSettlementService({
      ergo,
      state,
      deployed,
      sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
      verifySidechainBurn: pegOut => verifySidechainBurnFromCli(sidechainProvider, deployed, pegOut),
    });

    if (command === 'prepare-batch') {
      const batchClaims = resolveBatchClaims(state, args);
      const prepared = await service.prepareBatchClaims({
        claims: batchClaims.map(claim => ({
          pegOut: claim.pegOut,
          trackerIdentity: claim.trackerIdentity!,
        })),
      });
      console.log('Unsigned batch aggregate settlement prepared');
      console.log(`  claimCount: ${prepared.claimCount}`);
      console.log(`  burnTxSet:  ${batchClaims.map(claim => claim.burnTxHash).join(',')}`);
      console.log(`  eventRoots: ${batchClaims.map(claim => claim.trackerIdentity!.bridgeEventRootHex).join(',')}`);
      console.log(`  inputs:     ${prepared.eip12Tx.inputs.length}`);
      console.log(`  outputs:    ${prepared.eip12Tx.outputs.length}`);
      console.log('  signed:     no');
      return;
    }

    if (command === 'confirm-batch') {
      const [settlementTxIdRaw, ...burnTxHashes] = args;
      if (!settlementTxIdRaw) usage();
      const settlementTxId = normalizeHexArg(settlementTxIdRaw, 32, 'settlementTxId');
      const batchClaims = resolveBatchClaims(state, burnTxHashes, command, {
        requireTrackerIdentity: false,
      });
      const confirmed = await service.confirmBatchSettlement(
        batchClaims.map(claim => claim.pegOut),
        settlementTxId,
      );
      if (!confirmed) {
        throw new Error(`batch settlement TX ${settlementTxId} is not canonical yet`);
      }
      console.log(`Batch aggregate settlement confirmed: ${settlementTxId}`);
      console.log(`  claimCount: ${batchClaims.length}`);
      console.log(`  burnTxSet:  ${batchClaims.map(claim => claim.burnTxHash).join(',')}`);
      return;
    }

    const pegOut = findPegOut(state, txHash);

    if (command === 'prepare') {
      const prepared = await service.prepareSingleClaimNoIngestFromPegOut({ pegOut });
      console.log('Aggregate settlement prepared');
      console.log(`  burnTx:        ${pegOut.sidechainTxHash}`);
      console.log(`  sidechainH:    ${pegOut.sidechainBlockNumber}`);
      console.log(`  trackerBox:    ${prepared.trackerBox.boxId}`);
      console.log(`  aggregateDUP:  ${prepared.aggregateDupBox.boxId}`);
      console.log(`  unlockBox:     ${prepared.unlockBox.boxId}`);
      console.log(`  payout:        ${pegOut.amount.toString()} nanoERG`);
      console.log(`  inputs:        ${prepared.eip12Tx.inputs.length}`);
      console.log(`  outputs:       ${prepared.eip12Tx.outputs.length}`);
      return;
    }

    if (command === 'prepare-with-ingest') {
      const [, sidechainHeaderHashHex, bridgeEventRootHex, ergoAnchorHeight] = args;
      if (!sidechainHeaderHashHex || !bridgeEventRootHex || !ergoAnchorHeight) usage();
      const trackerIngest = buildTrackerIngest(
        pegOut,
        sidechainHeaderHashHex,
        bridgeEventRootHex,
        ergoAnchorHeight,
      );
      const prepared = await service.prepareSingleClaim({
        pegOut,
        trackerIdentity: trackerIngest,
        trackerIngest,
      });
      console.log('Aggregate same-TX ingest settlement prepared');
      console.log(`  burnTx:        ${pegOut.sidechainTxHash}`);
      console.log(`  sidechainH:    ${pegOut.sidechainBlockNumber}`);
      console.log(`  trackerTree:   ${prepared.plan.claims[0].trackerTree}`);
      console.log(`  trackerBox:    ${prepared.trackerBox.boxId}`);
      console.log(`  aggregateDUP:  ${prepared.aggregateDupBox.boxId}`);
      console.log(`  unlockBox:     ${prepared.unlockBox.boxId}`);
      console.log(`  payout:        ${pegOut.amount.toString()} nanoERG`);
      console.log(`  inputs:        ${prepared.eip12Tx.inputs.length}`);
      console.log(`  outputs:       ${prepared.eip12Tx.outputs.length}`);
      return;
    }

    if (command === 'prepare-anchored') {
      const [, ergoAnchorHeight] = args;
      if (!ergoAnchorHeight) usage();
      const trackerIngest = await deriveAnchoredTrackerIngestFromRuntime(pegOut, ergo, ergoAnchorHeight);
      const prepared = await service.prepareSingleClaim({
        pegOut,
        trackerIdentity: trackerIngest,
        trackerIngest,
      });
      console.log('Aggregate anchored same-TX ingest settlement prepared');
      console.log(`  burnTx:        ${pegOut.sidechainTxHash}`);
      console.log(`  sidechainH:    ${pegOut.sidechainBlockNumber}`);
      console.log(`  sidechainHash: ${trackerIngest.sidechainHeaderHashHex}`);
      console.log(`  eventRoot:     ${trackerIngest.bridgeEventRootHex}`);
      console.log(`  ergoAnchorH:   ${trackerIngest.ergoAnchorHeight}`);
      console.log(`  trackerTree:   ${prepared.plan.claims[0].trackerTree}`);
      console.log(`  trackerBox:    ${prepared.trackerBox.boxId}`);
      console.log(`  aggregateDUP:  ${prepared.aggregateDupBox.boxId}`);
      console.log(`  unlockBox:     ${prepared.unlockBox.boxId}`);
      console.log(`  payout:        ${pegOut.amount.toString()} nanoERG`);
      console.log(`  inputs:        ${prepared.eip12Tx.inputs.length}`);
      console.log(`  outputs:       ${prepared.eip12Tx.outputs.length}`);
      return;
    }

    if (command === 'confirm') {
      const settlementTxId = args[1];
      if (!settlementTxId) usage();
      const confirmed = await service.confirmSingleClaimSettlement(pegOut, settlementTxId!);
      if (!confirmed) {
        throw new Error(`settlement TX ${settlementTxId} is not canonical yet`);
      }
      console.log(`Aggregate settlement confirmed: ${settlementTxId}`);
      return;
    }

    if (command === 'confirm-with-ingest') {
      const [, settlementTxId, sidechainHeaderHashHex, bridgeEventRootHex, ergoAnchorHeight] = args;
      if (!settlementTxId || !sidechainHeaderHashHex || !bridgeEventRootHex || !ergoAnchorHeight) usage();
      const trackerIngest = buildTrackerIngest(
        pegOut,
        sidechainHeaderHashHex,
        bridgeEventRootHex,
        ergoAnchorHeight,
      );
      const confirmed = await service.confirmSingleClaimSettlement(pegOut, settlementTxId, trackerIngest);
      if (!confirmed) {
        throw new Error(`settlement TX ${settlementTxId} is not canonical yet`);
      }
      console.log(`Aggregate same-TX ingest settlement confirmed: ${settlementTxId}`);
      return;
    }

    if (command === 'confirm-anchored') {
      const [, settlementTxId, ergoAnchorHeight] = args;
      if (!settlementTxId || !ergoAnchorHeight) usage();
      const trackerIngest = await deriveAnchoredTrackerIngestFromRuntime(pegOut, ergo, ergoAnchorHeight);
      const confirmed = await service.confirmSingleClaimSettlement(pegOut, settlementTxId, trackerIngest);
      if (!confirmed) {
        throw new Error(`settlement TX ${settlementTxId} is not canonical yet`);
      }
      console.log(`Aggregate anchored settlement confirmed: ${settlementTxId}`);
      return;
    }

    usage();
  } finally {
    state.close();
  }
}

main().catch((err: any) => {
  console.error(`Aggregate settlement script failed: ${err.message || err}`);
  process.exit(1);
});
