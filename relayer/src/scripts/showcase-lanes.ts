/**
 * Showcase Lanes - Phase 011b
 * ===========================
 * Offline demonstration of the next scaling step after batch settlement.
 *
 * This script uses the real shard-router and sharded-plan-builder modules
 * (no duplicated routing logic). It creates synthetic burn IDs and box IDs
 * to demonstrate that DUP/liquidity inputs are lane-local while SPVTracker
 * is the only shared input.
 *
 * Usage:
 *   npm run showcase:lanes
 *   npm run showcase:lanes -- --out ../evidence/benchmarks/artifacts/<report.md>
 */

import { blake2b } from '@noble/hashes/blake2b';
import { assignDupShard } from '../shard-router.js';
import { buildShardedPlans, analyzeOverlap, type ShardedSettlementPlan } from '../sharded-plan-builder.js';
import type { AggregateSettlementClaim } from '../aggregate-settlement-builder.js';
import {
  commandResultSection,
  markdownTableEscape,
  parseShowcaseOutputArgs,
  type ShowcaseOutputArgs,
  writeShowcaseReport,
} from '../showcase-evidence-report.js';

const SHARDS = 2;
const CLAIMS = 10;

// ─── Synthetic data generators ───────────────────────────────────────

function blake2b256Hex(input: string): string {
  return Buffer.from(blake2b(Buffer.from(input, 'utf8'), { dkLen: 32 })).toString('hex');
}

function short(hex: string): string {
  return `${hex.slice(0, 10)}...${hex.slice(-6)}`;
}

function makeBurnId(index: number): string {
  return blake2b256Hex(`showcase-lane-burn-${index}`);
}

function makeBoxId(label: string): string {
  return blake2b256Hex(label);
}

/** Minimal stub claim for showcase purposes */
function stubClaim(): AggregateSettlementClaim {
  return {
    pegOut: {
      user: '0x0000000000000000000000000000000000000000',
      amount: 1_000_000_000n,
      ergoRecipientAddress: '9fRAWhdDESTiny',
      sidechainTxHash: '0x' + '00'.repeat(32),
      sidechainBlockNumber: 1,
    },
    trackerIdentity: {
      sidechainIdHex: '00'.repeat(32),
      sidechainHeight: 1,
      sidechainHeaderHashHex: '00'.repeat(32),
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────

function laneRow(plan: ShardedSettlementPlan): string {
  return [
    String(plan.settlementLane),
    short(plan.trackerBoxId),
    short(plan.dupBoxId),
    short(plan.unlockBoxId),
    String(plan.claims.length),
    String(plan.estimatedOutputCount),
  ].map(markdownTableEscape).join(' | ');
}

function formatLanesEvidenceReport(
  plans: ShardedSettlementPlan[],
  overlap: ReturnType<typeof analyzeOverlap>,
  expectedTrackerOnly: boolean,
  args: ShowcaseOutputArgs,
): string {
  const claimCount = plans.reduce((total, plan) => total + plan.claims.length, 0);
  return [
    '# Completed Offline Showcase Lanes Output',
    '',
    'This report records deterministic offline sharded-lane command output evidence.',
    'It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.',
    '',
    ...commandResultSection('npm run showcase:lanes', args),
    '',
    '## Sharded Lane Output',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Shard count | ${SHARDS} |`,
    `| Claim count | ${claimCount} |`,
    `| Lane count | ${plans.length} |`,
    `| Shared inputs | ${expectedTrackerOnly ? 'SPVTracker only' : overlap.pairwiseSharedInputs.map(short).join(', ') || 'none'} |`,
    `| DUP inputs disjoint | ${overlap.dupInputsDisjoint ? 'yes' : 'no'} |`,
    `| Liquidity inputs disjoint | ${overlap.liquidityInputsDisjoint ? 'yes' : 'no'} |`,
    '| Full parallel L1 settlement claimed | no |',
    '',
    '## Lane Plans',
    '',
    '| Lane | SPVTracker input | DUP input | Liquidity input | Claims | Estimated outputs |',
    '|---:|---|---|---|---:|---:|',
    ...plans.map(plan => `| ${laneRow(plan)} |`),
    '',
    '## Boundary',
    '',
    '- DUP and liquidity inputs are lane-local in this offline plan.',
    '- SPVTracker remains a shared input today.',
    '- This is not live benchmark evidence.',
    '- This does not authorize full parallel L1 settlement, production throughput, mainnet capacity, live settlement, or trustless burn completion claims.',
  ].join('\n');
}

function main(): void {
  const args = parseShowcaseOutputArgs(
    process.argv.slice(2),
    'npm run showcase:lanes',
    'Builds deterministic offline sharded-lane showcase output.',
  );
  console.log('Ergo Sidechain Bridge - Sharded Lane Showcase');
  console.log('Mode: OFFLINE (synthetic box IDs, no node calls)\n');
  console.log(`Shard rule: blake2b256(burnTxId)[0..4] % ${SHARDS}`);

  // 1. Build claims with synthetic burn IDs
  const trackerBoxId = makeBoxId('global-spv-tracker-box');
  const claims = Array.from({ length: CLAIMS }, (_, i) => ({
    claim: stubClaim(),
    burnTxIdHex: makeBurnId(i),
    payoutNanoErg: 1_000_000_000n,
  }));

  // 2. Build shard/lane box ID maps
  const shardBoxIds = new Map<number, string>();
  const laneBoxIds = new Map<number, string>();
  for (let s = 0; s < SHARDS; s++) {
    shardBoxIds.set(s, makeBoxId(`dup-shard-${s}`));
    laneBoxIds.set(s, makeBoxId(`liquidity-lane-${s}`));
  }

  // 3. Route and build plans using the real modules
  const plans = buildShardedPlans({
    claims,
    shardCount: SHARDS,
    shardBoxIds,
    laneBoxIds,
    trackerBoxId,
  });

  // 4. Print each plan
  for (const plan of plans) {
    printPlan(plan);
  }

  // 5. Overlap analysis using the real analyzeOverlap()
  const overlap = analyzeOverlap(plans);
  const expectedTrackerOnly =
    overlap.pairwiseSharedInputs.length === 1 &&
    overlap.pairwiseSharedInputs[0] === trackerBoxId;

  console.log('\nOverlap analysis');
  console.log(`  Shared inputs: ${overlap.pairwiseSharedInputs.map(short).join(', ') || 'none'}`);
  console.log(`  DUP inputs disjoint: ${overlap.dupInputsDisjoint ? 'yes' : 'no'}`);
  console.log(`  Liquidity inputs disjoint: ${overlap.liquidityInputsDisjoint ? 'yes' : 'no'}`);
  console.log(`  Expected current overlap: ${expectedTrackerOnly ? 'SPVTracker only' : 'unexpected'}`);

  console.log('\nConclusion');
  console.log('  This demonstrates the next eUTXO scaling lever: DUP and liquidity state can become lane-local.');
  console.log('  It does not claim full parallel L1 settlement yet because SPVTracker is still global.');
  console.log('  Full parallel settlement needs pre-ingested tracker entries or tracker sharding.');
  if (args.out) writeShowcaseReport(args.out, formatLanesEvidenceReport(plans, overlap, expectedTrackerOnly, args));
}

function printPlan(plan: ShardedSettlementPlan): void {
  console.log(`\nLane ${plan.settlementLane}`);
  console.log('  Inputs:');
  console.log(`    SPVTracker: ${short(plan.trackerBoxId)} (shared today)`);
  console.log(`    DUP shard:  ${short(plan.dupBoxId)} (lane-local)`);
  console.log(`    Liquidity:  ${short(plan.unlockBoxId)} (lane-local)`);
  console.log(`  Claims: ${plan.claims.length}`);
  for (const rc of plan.claims) {
    console.log(`    burnId ${short(rc.burnTxIdHex)} -> shard ${assignDupShard(rc.burnTxIdHex, SHARDS)}`);
  }
  console.log(`  Payout outputs: ${plan.claims.length}`);
  console.log(`  Estimated output count: ${plan.estimatedOutputCount}`);
}

main();
