/**
 * Showcase Benchmark — Phase 011b
 * ================================
 * Offline benchmark demonstrating batch settlement scaling.
 * No live Ergo node required in default mode.
 *
 * Usage:
 *   npm run showcase:benchmark
 *   npm run showcase:benchmark -- --out ../evidence/benchmarks/artifacts/<report.md>
 */

import blakejs from 'blakejs';
import {
  packClaimCore,
  buildBatchDupExtension,
  buildBatchUnlockExtension,
  BATCH_UNLOCK_MAX_CLAIMS,
} from '../aggregate-settlement-builder.js';
import {
  buildSpvTrackerGetProof,
  type SpvTrackerHistoryEntry,
} from '../spv-tracker.js';
import { insertLockRecordsBatch } from '../avl-bridge.js';
import { encodeCollByteRegister, encodeIntRegister } from '../ergo-helpers.js';
import {
  commandResultSection,
  markdownTableEscape,
  parseShowcaseOutputArgs,
  type ShowcaseOutputArgs,
  writeShowcaseReport,
} from '../showcase-evidence-report.js';

const SIDECHAIN_ID = Buffer.alloc(32, 0x11).toString('hex');
const BATCH_SIZES = [1, 2, 5, 10];
const PAYOUT = 10_000_000n;
const ANCHOR_H = 500_000;
const RECIP = '0008cd' + '02' + 'a'.repeat(64);

function b256(d: Buffer): Buffer { return Buffer.from(blakejs.blake2b(d, undefined, 32)); }

function genClaims(n: number, seed: string) {
  const BURN_D = Buffer.from('E2S_BURN_V1', 'ascii');
  const SPV_D = Buffer.from('E2S_SPV_V1', 'ascii');
  const rt = Buffer.from(RECIP, 'hex');
  const ab = Buffer.alloc(8); ab.writeBigUInt64BE(PAYOUT);
  const out: Array<{ burnId: string; tKey: string; tVal: string; scH: number; scHH: string; evRoot: string }> = [];
  for (let i = 0; i < n; i++) {
    const bid = b256(Buffer.from(`${seed}-burn-${i}`));
    const evr = b256(Buffer.concat([BURN_D, bid, rt, ab]));
    const scH = 1000 + i;
    const scHH = b256(Buffer.from(`${seed}-hdr-${i}`));
    const sid = Buffer.from(SIDECHAIN_ID, 'hex');
    const hb = Buffer.alloc(8); hb.writeBigUInt64BE(BigInt(scH));
    const tk = b256(Buffer.concat([SPV_D, sid, hb, scHH]));
    const ah = Buffer.alloc(4); ah.writeUInt32BE(ANCHOR_H);
    const tv = Buffer.concat([evr, ah]);
    out.push({ burnId: bid.toString('hex'), tKey: tk.toString('hex'), tVal: tv.toString('hex'), scH, scHH: scHH.toString('hex'), evRoot: evr.toString('hex') });
  }
  return out;
}

interface BResult {
  batch: number; ms: number; tProof: number; dLookup: number; dInsert: number;
  cores: number; vars: number; ins: number; outs: number; notes: string;
}

function bench(n: number): BResult {
  const claims = genClaims(n, `bench-${n}`);
  const t0 = performance.now();

  const hist: SpvTrackerHistoryEntry[] = claims.map(c => ({ key: c.tKey, value: c.tVal }));
  const tProofs: string[] = [];
  for (const c of claims) {
    const p = buildSpvTrackerGetProof(hist, {
      sidechainIdHex: SIDECHAIN_ID, sidechainHeight: c.scH, sidechainHeaderHashHex: c.scHH,
    });
    tProofs.push(p.getProofHex);
  }

  const bids = claims.map(c => c.burnId);
  const dp = insertLockRecordsBatch([], bids);

  let coreBytes = 0;
  if (n > 1) {
    const cores = claims.map(c => packClaimCore(c.tKey, c.burnId, PAYOUT, RECIP, 0));
    coreBytes = cores.reduce((s, c) => s + c.length, 0);
    buildBatchDupExtension(bids, dp.lookup_proofs_hex, dp.insert_proof_hex, encodeCollByteRegister, encodeIntRegister);
    buildBatchUnlockExtension(cores, tProofs, dp.lookup_proofs_hex, dp.insert_proof_hex, encodeCollByteRegister, encodeIntRegister);
  }

  const ms = performance.now() - t0;
  const avgTP = tProofs.reduce((s, p) => s + p.length / 2, 0) / n;
  const avgDL = dp.lookup_proofs_hex.reduce((s, p) => s + p.length / 2, 0) / n;
  const dI = dp.insert_proof_hex.length / 2;
  const vars = n === 1 ? 15 : 4 + (2 + 2 * n) + (2 + 3 * n);
  const outs = n === 1 ? 4 : 2 + n + 1;
  const notes: string[] = [];
  if (n >= BATCH_UNLOCK_MAX_CLAIMS) notes.push(`at unlock cap (${BATCH_UNLOCK_MAX_CLAIMS})`);
  if (n === 1) notes.push('single-claim V1 path');

  return {
    batch: n, ms: Math.round(ms * 10) / 10, tProof: Math.round(avgTP),
    dLookup: Math.round(avgDL), dInsert: dI, cores: coreBytes,
    vars, ins: 3, outs, notes: notes.join('; ') || '—',
  };
}

function printTable(rs: BResult[]) {
  console.log('\n' + '═'.repeat(96));
  console.log('  Ergo Sidechain Bridge — Batch Settlement Benchmark (OFFLINE)');
  console.log('═'.repeat(96));
  const hdr = '  Batch  Build ms  Tracker   DUP       DUP       Claim     Ctx   In  Out  Notes';
  const hd2 = '  Size            Proof(B)  Lookup(B) Insert(B) Cores(B)  Vars';
  console.log(hdr);
  console.log(hd2);
  console.log('  ' + '─'.repeat(92));
  for (const r of rs) {
    const row = [
      String(r.batch).padEnd(7),
      String(r.ms).padEnd(10),
      (r.tProof + 'B').padEnd(10),
      (r.dLookup + 'B').padEnd(10),
      (r.dInsert + 'B').padEnd(10),
      (r.cores > 0 ? r.cores + 'B' : '—').padEnd(10),
      String(r.vars).padEnd(6),
      String(r.ins).padEnd(4),
      String(r.outs).padEnd(5),
      r.notes,
    ];
    console.log('  ' + row.join(''));
  }
  console.log('═'.repeat(96));
}

function printLaneStory(rs: BResult[]) {
  const b10 = rs.find(r => r.batch === 10);
  if (!b10) return;
  console.log('\n  Two-Lane Parallel Settlement (simulated):');
  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │ Current: 1 batch of 10 → 10 settlements / block        │');
  console.log('  │ With 2 DUP shards + 2 liquidity lanes:                  │');
  console.log('  │   Shard 0: INPUTS(tracker, dup0, lane0) → payouts       │');
  console.log('  │   Shard 1: INPUTS(tracker, dup1, lane1) → payouts       │');
  console.log('  │   → DUP/liquidity work is lane-local                    │');
  console.log('  │ Shard formula: blake2b256(burnTxId) % N                  │');
  console.log('  │ Remaining shared input today: SPVTracker                 │');
  console.log('  │ Full 2× L1 parallelism needs pre-ingest or tracker lanes │');
  console.log('  └──────────────────────────────────────────────────────────┘');
}

function printBottlenecks() {
  console.log('\n  Bottleneck Analysis:');
  console.log('  ┌────────────────────────┬────────────┬───────────────────────┐');
  console.log('  │ Bottleneck             │ Limit      │ Mitigation            │');
  console.log('  ├────────────────────────┼────────────┼───────────────────────┤');
  console.log('  │ Unlock claim cores     │ 10 / TX    │ 4KB box ctx limit     │');
  console.log('  │ DUP batch keys         │ 20 / TX    │ Contract Var slots    │');
  console.log('  │ Context ext / input    │ >4 Vars    │ Upstream fix pending   │');
  console.log('  │ Singleton contention   │ tracker    │ Pre-ingest or shard    │');
  console.log('  │ JIT cost budget        │ ~120K      │ AVL ops dominate      │');
  console.log('  │ TX size                │ 96KB       │ Proofs grow w/ batch  │');
  console.log('  └────────────────────────┴────────────┴───────────────────────┘');
}

function benchmarkRow(r: BResult): string {
  const notes = r.notes.includes('single-claim') || r.notes.includes('unlock cap') ? r.notes : '-';
  return [
    String(r.batch),
    `${r.ms} ms`,
    `${r.tProof} B`,
    `${r.dLookup} B`,
    `${r.dInsert} B`,
    r.cores > 0 ? `${r.cores} B` : '-',
    String(r.vars),
    String(r.ins),
    String(r.outs),
    notes,
  ].map(markdownTableEscape).join(' | ');
}

function formatBenchmarkEvidenceReport(results: BResult[], args: ShowcaseOutputArgs): string {
  return [
    '# Completed Offline Showcase Benchmark Output',
    '',
    'This report records deterministic offline benchmark command output evidence.',
    'It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.',
    '',
    ...commandResultSection('npm run showcase:benchmark', args),
    '',
    '## Batch Settlement Benchmark',
    '',
    '| Batch size | Build time | Tracker proof | DUP lookup | DUP insert | Claim cores | Context vars | Inputs | Outputs | Notes |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...results.map(result => `| ${benchmarkRow(result)} |`),
    '',
    '## Boundary',
    '',
    '- This is offline benchmark evidence only.',
    '- This is not signed live Ergo transaction-size evidence.',
    '- This is not live benchmark evidence.',
    '- This does not authorize production throughput, mainnet capacity, live settlement, trustless burn completion, or full parallel L1 settlement claims.',
  ].join('\n');
}

function main() {
  const args = parseShowcaseOutputArgs(
    process.argv.slice(2),
    'npm run showcase:benchmark',
    'Builds deterministic offline batch-settlement benchmark output.',
  );
  console.log('Ergo Sidechain Bridge — Showcase Benchmark');
  console.log('Mode: OFFLINE (no live node required)\n');
  const results: BResult[] = [];
  for (const n of BATCH_SIZES) {
    console.log(`  Running batch size ${n}...`);
    results.push(bench(n));
  }
  printTable(results);
  printLaneStory(results);
  printBottlenecks();
  const s = results[0], b = results[results.length - 1];
  if (s && b) {
    const r = (b.dInsert / s.dInsert).toFixed(1);
    console.log(`\n  Batch 10 vs single: ${r}x DUP insert size, ${b.batch}x settlements`);
    console.log(`  Net efficiency: ~${(b.batch / parseFloat(r)).toFixed(1)}x\n`);
  }
  if (args.out) writeShowcaseReport(args.out, formatBenchmarkEvidenceReport(results, args));
}

main();
