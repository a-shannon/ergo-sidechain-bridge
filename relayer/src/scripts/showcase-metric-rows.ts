/**
 * Offline benchmark metric-row evidence.
 *
 * Builds deterministic unsigned settlement transaction shapes from in-memory
 * proof plans. It performs no node calls, signing, broadcast, local DB access,
 * deployment-state reads, or file reads.
 */

import blakejs from 'blakejs';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildAggregateSettlementPlan,
  buildBatchSettlementPlan,
  type AggregateSettlementClaim,
} from '../aggregate-settlement-builder.js';
import {
  buildBatchAggregateSettlementTx,
  buildSingleClaimAggregateSettlementTx,
  deriveAggregateBurnEventRoot,
  type AggregateSettlementUnsignedTx,
  type BoxLike,
} from '../aggregate-settlement-tx.js';
import { getEmptyDigest } from '../avl-bridge.js';
import type { DeployedState } from '../config.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
} from '../ergo-helpers.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerAvlRegister,
  encodeSpvTrackerValue,
  getEmptySpvTrackerDigest,
  type SpvTrackerHistoryEntry,
} from '../spv-tracker.js';
import {
  buildShardedPlans,
  type ShardedSettlementPlan,
} from '../sharded-plan-builder.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';

const SAMPLE_COUNT = 3;
const BATCH_SIZE = 10;
const SHARDED_CLAIM_COUNT = 10;
const SHARDED_LANE_COUNT = 2;
const SIDECHAIN_ID_HEX = '11'.repeat(32);
const RECIPIENT_ERGO_TREE_HEX = '0008cd' + '02' + 'a'.repeat(64);
const PAYOUT_NANOERG = 10_000_000n;
const MINER_FEE_NANOERG = 1_100_000n;
const ANCHOR_HEIGHT = 500_000;
const CREATION_HEIGHT = 500_000;
const DUP_FLAGS = 0x0b;

const TRACKER_TREE_HEX = '1001';
const DUP_TREE_HEX = '1002';
const UNLOCK_TREE_HEX = '1003';
const BATCH_DUP_TREE_HEX = '1012';
const BATCH_UNLOCK_TREE_HEX = '1013';
const TRACKER_NFT_ID = 'aa'.repeat(32);
const SINGLE_DUP_NFT_ID = 'bb'.repeat(32);
const BATCH_DUP_NFT_ID = 'cc'.repeat(32);

type SingleDeployed = Pick<
  DeployedState,
  'spvTracker' | 'doubleUnlockPreventionAggregate' | 'mainChainAggregateUnlock'
>;

type BatchDeployed = Pick<
  DeployedState,
  'spvTracker' | 'doubleUnlockPreventionAggregateBatch' | 'mainChainAggregateUnlockBatch'
>;

interface GeneratedClaim {
  claim: AggregateSettlementClaim;
  historyEntry: SpvTrackerHistoryEntry;
}

interface LaneTransactionShape {
  lane: ShardedSettlementPlan;
  plan: ReturnType<typeof buildBatchSettlementPlan>;
  tx: AggregateSettlementUnsignedTx;
}

export interface OfflineBenchmarkMetric {
  scenario: 'Single-claim settlement baseline' | 'Batch settlement' | 'Sharded lanes planner';
  sampleCount: number;
  buildTimeRunsMs: number[];
  meanBuildTimeMs: number;
  proofSize: string;
  transactionShapeBytes: number;
  costRelevantCounts: string;
  throughput: string;
  latency: string;
}

export interface OfflineBenchmarkMetricReport {
  single: OfflineBenchmarkMetric;
  batch: OfflineBenchmarkMetric;
  sharded: OfflineBenchmarkMetric;
}

interface CliArgs {
  out?: string;
}

function b256Hex(label: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(label, 'utf8'), undefined, 32)).toString('hex');
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number {
  return roundMs(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function txShapeBytes(tx: AggregateSettlementUnsignedTx): number {
  return Buffer.byteLength(JSON.stringify(tx), 'utf8');
}

function contextVarCapacity(batchSize: number): number {
  return batchSize === 1 ? 15 : 4 + (2 + 2 * batchSize) + (2 + 3 * batchSize);
}

function makeClaim(index: number): GeneratedClaim {
  const burnTxIdHex = b256Hex(`metric-burn-${index}`);
  return makeGeneratedClaim(burnTxIdHex, `metric-header-${index}`, 1000 + index);
}

function makeShardedClaim(index: number): GeneratedClaim {
  const burnTxIdHex = b256Hex(`showcase-lane-burn-${index}`);
  return makeGeneratedClaim(burnTxIdHex, `metric-sharded-header-${index}`, 2000 + index);
}

function makeGeneratedClaim(
  burnTxIdHex: string,
  headerLabel: string,
  sidechainHeight: number,
): GeneratedClaim {
  const sidechainHeaderHashHex = b256Hex(headerLabel);
  const bridgeEventRootHex = deriveAggregateBurnEventRoot(
    burnTxIdHex,
    RECIPIENT_ERGO_TREE_HEX,
    PAYOUT_NANOERG,
  );
  const trackerIdentity = {
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight,
    sidechainHeaderHashHex,
  };

  return {
    claim: {
      pegOut: {
        user: '0x0000000000000000000000000000000000000000',
        amount: PAYOUT_NANOERG,
        ergoRecipientAddress: RECIPIENT_ERGO_TREE_HEX,
        sidechainTxHash: burnTxIdHex,
        sidechainBlockNumber: sidechainHeight,
      },
      trackerIdentity,
    },
    historyEntry: {
      key: deriveSpvTrackerKey(trackerIdentity),
      value: encodeSpvTrackerValue({ bridgeEventRootHex, ergoAnchorHeight: ANCHOR_HEIGHT }),
    },
  };
}

function singletonBox(label: string, ergoTree: string, nftId: string, value: bigint): BoxLike {
  return {
    boxId: b256Hex(`${label}-box`),
    value,
    ergoTree,
    assets: [{ tokenId: nftId, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(0),
      R5: label === 'tracker'
        ? encodeSpvTrackerAvlRegister(getEmptySpvTrackerDigest())
        : encodeAvlTreeRegister(Buffer.from(getEmptyDigest(), 'hex'), DUP_FLAGS, 1),
      R6: encodeCollByteRegister(Buffer.from('02' + 'b'.repeat(64), 'hex')),
      R7: encodeLongRegister(1000),
    },
    creationHeight: CREATION_HEIGHT,
  };
}

function unlockBox(label: string, ergoTree: string, value: bigint): BoxLike {
  return {
    boxId: b256Hex(`${label}-box`),
    value,
    ergoTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: CREATION_HEIGHT,
  };
}

const singleDeployed: SingleDeployed = {
  spvTracker: {
    nftId: TRACKER_NFT_ID,
    boxId: b256Hex('single-deployed-tracker-box'),
    address: 'offline-tracker',
    ergoTreeHex: TRACKER_TREE_HEX,
  },
  doubleUnlockPreventionAggregate: {
    nftId: SINGLE_DUP_NFT_ID,
    boxId: b256Hex('single-deployed-dup-box'),
    address: 'offline-dup',
    ergoTreeHex: DUP_TREE_HEX,
  },
  mainChainAggregateUnlock: {
    address: 'offline-unlock',
    ergoTreeHex: UNLOCK_TREE_HEX,
  },
};

const batchDeployed: BatchDeployed = {
  spvTracker: singleDeployed.spvTracker,
  doubleUnlockPreventionAggregateBatch: {
    nftId: BATCH_DUP_NFT_ID,
    boxId: b256Hex('batch-deployed-dup-box'),
    address: 'offline-batch-dup',
    ergoTreeHex: BATCH_DUP_TREE_HEX,
  },
  mainChainAggregateUnlockBatch: {
    address: 'offline-batch-unlock',
    ergoTreeHex: BATCH_UNLOCK_TREE_HEX,
  },
};

function laneDupNftId(lane: number): string {
  return b256Hex(`sharded-lane-${lane}-dup-nft`);
}

function laneBatchDeployed(lane: number): BatchDeployed {
  return {
    spvTracker: singleDeployed.spvTracker,
    doubleUnlockPreventionAggregateBatch: {
      nftId: laneDupNftId(lane),
      boxId: b256Hex(`sharded-lane-${lane}-deployed-dup-box`),
      address: `offline-lane-${lane}-dup`,
      ergoTreeHex: BATCH_DUP_TREE_HEX,
    },
    mainChainAggregateUnlockBatch: {
      address: `offline-lane-${lane}-unlock`,
      ergoTreeHex: BATCH_UNLOCK_TREE_HEX,
    },
  };
}

function measureSingleRun(): { elapsedMs: number; tx: AggregateSettlementUnsignedTx; proofSize: string } {
  const generated = [makeClaim(0)];
  const startedAt = performance.now();
  const plan = buildAggregateSettlementPlan({
    spvHistory: generated.map(entry => entry.historyEntry),
    dupHistoryKeys: [],
    claims: generated.map(entry => entry.claim),
  });
  const tx = buildSingleClaimAggregateSettlementTx({
    deployed: singleDeployed,
    plan,
    trackerBox: singletonBox('tracker', TRACKER_TREE_HEX, TRACKER_NFT_ID, 1_000_000n),
    aggregateDupBox: singletonBox(
      'single-dup',
      DUP_TREE_HEX,
      SINGLE_DUP_NFT_ID,
      1_000_000n,
    ),
    unlockBox: unlockBox('single-unlock', UNLOCK_TREE_HEX, 11_100_000n),
    recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
    creationHeight: CREATION_HEIGHT,
  });
  const elapsedMs = performance.now() - startedAt;
  const claim = plan.claims[0];
  return {
    elapsedMs,
    tx,
    proofSize: [
      `tracker proof ${claim.trackerProofHex.length / 2} B`,
      `DUP lookup ${claim.dupLookupProofHex.length / 2} B`,
      `DUP insert ${plan.dupProofs.insert_proof_hex.length / 2} B`,
    ].join(', '),
  };
}

function measureBatchRun(): { elapsedMs: number; tx: AggregateSettlementUnsignedTx; proofSize: string } {
  const generated = Array.from({ length: BATCH_SIZE }, (_, index) => makeClaim(index));
  const startedAt = performance.now();
  const plan = buildBatchSettlementPlan({
    spvHistory: generated.map(entry => entry.historyEntry),
    dupHistoryKeys: [],
    claims: generated.map(entry => entry.claim),
    recipientErgoTreeHexes: generated.map(() => RECIPIENT_ERGO_TREE_HEX),
  });
  const tx = buildBatchAggregateSettlementTx({
    deployed: batchDeployed,
    plan,
    trackerBox: singletonBox('tracker', TRACKER_TREE_HEX, TRACKER_NFT_ID, 1_000_000n),
    aggregateDupBox: singletonBox(
      'batch-dup',
      BATCH_DUP_TREE_HEX,
      BATCH_DUP_NFT_ID,
      1_000_000n,
    ),
    unlockBox: unlockBox('batch-unlock', BATCH_UNLOCK_TREE_HEX, 101_100_000n),
    creationHeight: CREATION_HEIGHT,
  });
  const elapsedMs = performance.now() - startedAt;
  const avgTrackerProofBytes = Math.round(
    plan.claims.reduce((sum, claim) => sum + claim.trackerProofHex.length / 2, 0) / plan.claims.length,
  );
  const avgDupLookupBytes = Math.round(
    plan.claims.reduce((sum, claim) => sum + claim.dupLookupProofHex.length / 2, 0) / plan.claims.length,
  );

  return {
    elapsedMs,
    tx,
    proofSize: [
      `tracker proof ${avgTrackerProofBytes} B`,
      `DUP lookup ${avgDupLookupBytes} B`,
      `DUP insert ${plan.dupProofs.insert_proof_hex.length / 2} B`,
      `claim cores ${plan.claimCores.reduce((sum, core) => sum + core.length, 0)} B`,
    ].join(', '),
  };
}

function measureShardedRun(): {
  elapsedMs: number;
  lanes: LaneTransactionShape[];
  proofSize: string;
  transactionShapeBytes: number;
  costRelevantCounts: string;
} {
  const generated = Array.from({ length: SHARDED_CLAIM_COUNT }, (_, index) => makeShardedClaim(index));
  const startedAt = performance.now();
  const lanePlans = buildShardedPlans({
    claims: generated.map(entry => ({
      claim: entry.claim,
      burnTxIdHex: entry.claim.pegOut.sidechainTxHash,
      payoutNanoErg: PAYOUT_NANOERG,
    })),
    shardCount: SHARDED_LANE_COUNT,
    shardBoxIds: new Map(
      Array.from({ length: SHARDED_LANE_COUNT }, (_, lane) => [
        lane,
        b256Hex(`sharded-lane-${lane}-dup-box`),
      ]),
    ),
    laneBoxIds: new Map(
      Array.from({ length: SHARDED_LANE_COUNT }, (_, lane) => [
        lane,
        b256Hex(`sharded-lane-${lane}-liquidity-box`),
      ]),
    ),
    trackerBoxId: b256Hex('sharded-global-tracker-box'),
  });

  const lanes = lanePlans.map((lane): LaneTransactionShape => {
    const plan = buildBatchSettlementPlan({
      spvHistory: generated.map(entry => entry.historyEntry),
      dupHistoryKeys: [],
      claims: lane.claims.map(entry => entry.claim),
      recipientErgoTreeHexes: lane.claims.map(() => RECIPIENT_ERGO_TREE_HEX),
    });
    const tx = buildBatchAggregateSettlementTx({
      deployed: laneBatchDeployed(lane.settlementLane),
      plan,
      trackerBox: singletonBox('tracker', TRACKER_TREE_HEX, TRACKER_NFT_ID, 1_000_000n),
      aggregateDupBox: singletonBox(
        `sharded-lane-${lane.settlementLane}-dup`,
        BATCH_DUP_TREE_HEX,
        laneDupNftId(lane.settlementLane),
        1_000_000n,
      ),
      unlockBox: unlockBox(
        `sharded-lane-${lane.settlementLane}-unlock`,
        BATCH_UNLOCK_TREE_HEX,
        BigInt(lane.claims.length) * PAYOUT_NANOERG + MINER_FEE_NANOERG,
      ),
      creationHeight: CREATION_HEIGHT,
    });
    return { lane, plan, tx };
  });

  const elapsedMs = performance.now() - startedAt;
  const maxTrackerProofBytes = Math.max(
    ...lanes.map(lane => Math.round(
      lane.plan.claims.reduce((sum, claim) => sum + claim.trackerProofHex.length / 2, 0) /
        lane.plan.claims.length,
    )),
  );
  const maxDupLookupBytes = Math.max(
    ...lanes.map(lane => Math.round(
      lane.plan.claims.reduce((sum, claim) => sum + claim.dupLookupProofHex.length / 2, 0) /
        lane.plan.claims.length,
    )),
  );
  const maxDupInsertBytes = Math.max(...lanes.map(lane => lane.plan.dupProofs.insert_proof_hex.length / 2));
  const maxClaimCoreBytes = Math.max(
    ...lanes.map(lane => lane.plan.claimCores.reduce((sum, core) => sum + core.length, 0)),
  );
  const transactionShapeBytes = Math.max(...lanes.map(lane => txShapeBytes(lane.tx)));
  const sortedLanes = [...lanes].sort((a, b) => a.lane.settlementLane - b.lane.settlementLane);
  const totalInputs = sortedLanes.reduce((sum, lane) => sum + lane.tx.inputs.length, 0);
  const totalOutputs = sortedLanes.reduce((sum, lane) => sum + lane.tx.outputs.length, 0);
  const totalVars = sortedLanes.reduce((sum, lane) => sum + contextVarCapacity(lane.lane.claims.length), 0);
  const totalClaims = sortedLanes.reduce((sum, lane) => sum + lane.lane.claims.length, 0);
  const laneClaimSplit = sortedLanes.map(lane => String(lane.lane.claims.length)).join(' + ');

  return {
    elapsedMs,
    lanes,
    proofSize: [
      `max lane tracker proof ${maxTrackerProofBytes} B`,
      `max lane DUP lookup ${maxDupLookupBytes} B`,
      `max lane DUP insert ${maxDupInsertBytes} B`,
      `max lane claim cores ${maxClaimCoreBytes} B`,
      `lane claim split ${laneClaimSplit}`,
    ].join(', '),
    transactionShapeBytes,
    costRelevantCounts: `inputs=${totalInputs} outputs=${totalOutputs} vars=${totalVars} batch=${totalClaims}`,
  };
}

function collectMetric(
  scenario: OfflineBenchmarkMetric['scenario'],
  batchSize: number,
  run: () => { elapsedMs: number; tx: AggregateSettlementUnsignedTx; proofSize: string },
): OfflineBenchmarkMetric {
  const results = Array.from({ length: SAMPLE_COUNT }, () => run());
  const buildTimeRunsMs = results.map(result => roundMs(result.elapsedMs));
  const representative = results[results.length - 1];
  const settlementLabel = batchSize === 1 ? 'settlement' : 'settlements';
  const throughputLabel = batchSize === 1 ? 'single-claim' : 'batch';

  return {
    scenario,
    sampleCount: SAMPLE_COUNT,
    buildTimeRunsMs,
    meanBuildTimeMs: mean(buildTimeRunsMs),
    proofSize: representative.proofSize,
    transactionShapeBytes: txShapeBytes(representative.tx),
    costRelevantCounts: `inputs=3 outputs=${representative.tx.outputs.length} vars=${contextVarCapacity(batchSize)} batch=${batchSize}`,
    throughput: `${batchSize} ${settlementLabel} per Ergo block in the offline ${throughputLabel} model`,
    latency: `${mean(buildTimeRunsMs)} ms offline build latency`,
  };
}

function collectShardedMetric(): OfflineBenchmarkMetric {
  const results = Array.from({ length: SAMPLE_COUNT }, () => measureShardedRun());
  const buildTimeRunsMs = results.map(result => roundMs(result.elapsedMs));
  const representative = results[results.length - 1];

  return {
    scenario: 'Sharded lanes planner',
    sampleCount: SAMPLE_COUNT,
    buildTimeRunsMs,
    meanBuildTimeMs: mean(buildTimeRunsMs),
    proofSize: representative.proofSize,
    transactionShapeBytes: representative.transactionShapeBytes,
    costRelevantCounts: representative.costRelevantCounts,
    throughput: `${SHARDED_CLAIM_COUNT} planned settlements across ${representative.lanes.length} lanes in the offline sharded planner`,
    latency: `${mean(buildTimeRunsMs)} ms offline sharded planning and lane transaction-shape build latency`,
  };
}

export function collectOfflineBenchmarkMetricRows(): OfflineBenchmarkMetricReport {
  return {
    single: collectMetric('Single-claim settlement baseline', 1, measureSingleRun),
    batch: collectMetric('Batch settlement', BATCH_SIZE, measureBatchRun),
    sharded: collectShardedMetric(),
  };
}

function formatMetric(metric: OfflineBenchmarkMetric): string {
  return [
    `${metric.scenario}`,
    `Sample count: ${metric.sampleCount}`,
    `Build time runs: ${metric.buildTimeRunsMs.map(value => `${value} ms`).join(', ')}`,
    `Mean build time: ${metric.meanBuildTimeMs} ms`,
    `Proof size: ${metric.proofSize}`,
    `Unsigned EIP-12 JSON transaction shape: ${metric.transactionShapeBytes} bytes`,
    `Cost-relevant counts: ${metric.costRelevantCounts}`,
    `Throughput: ${metric.throughput}`,
    `Latency: ${metric.latency}`,
  ].join('\n');
}

export function formatOfflineBenchmarkMetricReport(report: OfflineBenchmarkMetricReport): string {
  return [
    'Bridge Offline Benchmark Metric Rows',
    'Scope: local offline; no node calls; no signing; no broadcast; no local DB, runtime-state, or deployment-state reads.',
    `Sample count: ${SAMPLE_COUNT}`,
    '',
    formatMetric(report.single),
    '',
    formatMetric(report.batch),
    '',
    formatMetric(report.sharded),
    '',
    'Boundary: transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from deterministic public offline inputs.',
    'Boundary: sharded planner values are per-lane unsigned transaction-shape candidates with SPVTracker still shared.',
    'Boundary: this report does not support production throughput, mainnet capacity, live settlement, trustless burn completion, or full parallel L1 settlement claims.',
  ].join('\n');
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: npm run showcase:metric-rows -- [--out <report.md>]',
        '',
        'Builds deterministic offline benchmark metric rows.',
        '--out writes a completed Markdown evidence report inside the bridge repository.',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a report path');
      args.out = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function commandLabel(args: CliArgs): string {
  return args.out
    ? 'npm run showcase:metric-rows -- --out <report.md>'
    : 'npm run showcase:metric-rows';
}

function markdownTableEscape(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function metricRow(metric: OfflineBenchmarkMetric): string {
  return [
    metric.scenario,
    String(metric.sampleCount),
    metric.buildTimeRunsMs.map(value => `${value} ms`).join(', '),
    `${metric.meanBuildTimeMs} ms`,
    metric.proofSize,
    `${metric.transactionShapeBytes} bytes`,
    metric.costRelevantCounts,
    metric.throughput,
    metric.latency,
  ].map(markdownTableEscape).join(' | ');
}

export function formatCompletedOfflineBenchmarkMetricRowsReport(
  report: OfflineBenchmarkMetricReport,
  args: CliArgs = {},
): string {
  return [
    '# Completed Offline Benchmark Metric Rows',
    '',
    'This report records deterministic offline benchmark metric-row evidence.',
    'It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${commandLabel(args)} |`,
    '| Result | PASS |',
    '| Exit code | 0 |',
    '| Node calls | none |',
    '| Signing | none |',
    '| Broadcast | none |',
    '| Runtime database opened | no |',
    '| Deployment state opened | no |',
    '| Secret or environment file read | no |',
    '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
    '',
    '## Normalized Output Summary',
    '',
    '| Scenario | Sample count | Build time runs | Mean build time | Proof size | Unsigned EIP-12 JSON transaction shape | Cost-relevant counts | Throughput | Latency |',
    '|---|---:|---|---:|---|---:|---|---|---|',
    `| ${metricRow(report.single)} |`,
    `| ${metricRow(report.batch)} |`,
    `| ${metricRow(report.sharded)} |`,
    '',
    '## Boundary',
    '',
    '- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from deterministic public offline inputs.',
    '- Sharded planner values are per-lane unsigned transaction-shape candidates with SPVTracker still shared.',
    '- This is not signed live Ergo transaction-size evidence.',
    '- This is not live benchmark evidence.',
    '- This does not authorize production throughput, mainnet capacity, live settlement, trustless burn completion, or full parallel L1 settlement claims.',
    '',
  ].join('\n');
}

function writeCompletedReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const report = collectOfflineBenchmarkMetricRows();
  const output = args.out
    ? formatCompletedOfflineBenchmarkMetricRowsReport(report, args)
    : formatOfflineBenchmarkMetricReport(report);

  console.log(output);
  writeCompletedReport(args.out, output);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
