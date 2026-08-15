/**
 * Showcase Finality - Phase 011b
 * ==============================
 * Offline model for subblock-ready bridge monitoring.
 *
 * This script deliberately separates fast UX signals from economic finality.
 * It does not call a live Ergo node and it does not assume a subblock API is
 * available in the current prototype.
 *
 * Usage:
 *   npm run showcase:finality
 *   npm run showcase:finality -- --out ../evidence/benchmarks/artifacts/<report.md>
 */

import {
  assertLifecycleSignalsMonotonic,
  classifySettlementLifecycle,
  type SettlementLifecycleSignals,
} from '../settlement-lifecycle.js';
import {
  commandResultSection,
  markdownTableEscape,
  parseShowcaseOutputArgs,
  type ShowcaseOutputArgs,
  writeShowcaseReport,
} from '../showcase-evidence-report.js';

type Step = {
  label: string;
  atMs: number;
  evmAnalogy: string;
  userMeaning: string;
  securityMeaning: string;
};

const SUBBLOCK_TARGET_MS = 2_000;
const ORDERING_BLOCK_MS = 120_000;
const FINALITY_DEPTH = 10;
const SINGLE_BUILD_MS = 1_500;
const BATCH_WINDOW_MS = 10_000;
const BATCH_BUILD_MS = 2_000;

function fmt(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
}

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

function buildTimeline(mode: 'single' | 'batch'): Step[] {
  const batchDelay = mode === 'batch' ? BATCH_WINDOW_MS : 0;
  const buildMs = mode === 'batch' ? BATCH_BUILD_MS : SINGLE_BUILD_MS;
  const submitted = batchDelay + buildMs + 700;
  const mempool = submitted + 400;
  const fast = Math.ceil(mempool / SUBBLOCK_TARGET_MS) * SUBBLOCK_TARGET_MS;
  const ordering = Math.ceil(fast / ORDERING_BLOCK_MS) * ORDERING_BLOCK_MS;
  const final = ordering + FINALITY_DEPTH * ORDERING_BLOCK_MS;

  const first: Step[] = [
    {
      label: mode === 'batch' ? 'batch_window_open' : 'burn_observed',
      atMs: 0,
      evmAnalogy: 'event indexed',
      userMeaning: mode === 'batch' ? 'Burns start entering a batch' : 'Burn event was detected',
      securityMeaning: 'Sidechain event is observed, not settled',
    },
  ];

  if (mode === 'batch') {
    first.push({
      label: 'batch_window_closed',
      atMs: BATCH_WINDOW_MS,
      evmAnalogy: 'batch cut',
      userMeaning: 'Claims are grouped for one L1 settlement',
      securityMeaning: 'Batch content is selected, not settled',
    });
  }

  return [
    ...first,
    {
      label: 'proof_ready',
      atMs: batchDelay + buildMs,
      evmAnalogy: 'calldata/proofs built',
      userMeaning: 'Bridge has the proof objects needed to settle',
      securityMeaning: 'Local proof generation succeeded',
    },
    {
      label: 'submitted',
      atMs: submitted,
      evmAnalogy: 'tx sent',
      userMeaning: 'Ergo settlement transaction was broadcast',
      securityMeaning: 'Candidate transaction exists',
    },
    {
      label: 'mempool_seen',
      atMs: mempool,
      evmAnalogy: 'mempool accepted',
      userMeaning: 'Ergo node accepted the candidate transaction',
      securityMeaning: 'Still not canonical',
    },
    {
      label: 'fast_inclusion_seen',
      atMs: fast,
      evmAnalogy: 'preconfirmation',
      userMeaning: 'Fast feedback signal, useful for UI',
      securityMeaning: 'Not economic finality',
    },
    {
      label: 'ordering_confirmed',
      atMs: ordering,
      evmAnalogy: 'block included',
      userMeaning: 'Transaction is in an ordering block',
      securityMeaning: 'Canonical inclusion point',
    },
    {
      label: 'finalized',
      atMs: final,
      evmAnalogy: 'finalized checkpoint',
      userMeaning: 'Bridge finality depth reached',
      securityMeaning: `${FINALITY_DEPTH} ordering blocks after inclusion`,
    },
  ];
}

function toSignals(steps: Step[]): SettlementLifecycleSignals {
  const byLabel = new Map(steps.map((s) => [s.label, s.atMs]));
  return {
    burnObservedMs: byLabel.get('burn_observed') ?? byLabel.get('batch_window_open'),
    proofReadyMs: byLabel.get('proof_ready'),
    settlementSubmittedMs: byLabel.get('submitted'),
    mempoolAcceptedMs: byLabel.get('mempool_seen'),
    fastInclusionSeenMs: byLabel.get('fast_inclusion_seen'),
    orderingBlockIncludedMs: byLabel.get('ordering_confirmed'),
    economicFinalityMs: byLabel.get('finalized'),
  };
}

function printTimeline(title: string, steps: Step[]): void {
  const signals = toSignals(steps);
  assertLifecycleSignalsMonotonic(signals);
  const classification = classifySettlementLifecycle(signals);

  console.log(`\n${title}`);
  console.log('-'.repeat(136));
  console.log(
    `${pad('Time', 10)} ${pad('Status', 24)} ${pad('EVM analogy', 24)} ${pad('User meaning', 46)} Security meaning`,
  );
  console.log('-'.repeat(136));
  for (const step of steps) {
    console.log(
      `${pad(fmt(step.atMs), 10)} ${pad(step.label, 24)} ${pad(step.evmAnalogy, 24)} ${pad(step.userMeaning, 46)} ${step.securityMeaning}`,
    );
  }
  console.log(`Current terminal status: ${classification.status}`);
}

function printPolicy(): void {
  console.log('\nMonitoring policy');
  console.log('-'.repeat(136));
  console.log('  Fast inclusion can drive progress bars, alerts, and operator UX.');
  console.log('  Ordering-block confirmation is the first canonical L1 inclusion point.');
  console.log('  Economic finality remains K ordering blocks deep for settlement accounting.');
  console.log('  The prototype should expose both clocks instead of collapsing them into one "confirmed" state.');
}

function printMetrics(): void {
  const metrics = [
    'burnObservedMs',
    'proofReadyMs',
    'settlementSubmittedMs',
    'mempoolAcceptedMs',
    'fastInclusionSeenMs',
    'orderingBlockIncludedMs',
    'economicFinalityMs',
  ];
  console.log('\nSuggested metrics');
  console.log('-'.repeat(136));
  for (const metric of metrics) console.log(`  ${metric}`);
}

function finalityRow(label: string, steps: Step[]): string {
  const byLabel = new Map(steps.map((step) => [step.label, step.atMs]));
  return [
    label,
    fmt(byLabel.get('fast_inclusion_seen') ?? 0),
    fmt(byLabel.get('ordering_confirmed') ?? 0),
    fmt(byLabel.get('finalized') ?? 0),
    'Offline model; no node calls',
  ].map(markdownTableEscape).join(' | ');
}

function formatFinalityEvidenceReport(
  singleSteps: Step[],
  batchSteps: Step[],
  args: ShowcaseOutputArgs,
): string {
  return [
    '# Completed Offline Finality Output',
    '',
    'This report records deterministic offline finality-model command output evidence.',
    'It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.',
    '',
    ...commandResultSection('npm run showcase:finality', args),
    '',
    '## Finality Model Output',
    '',
    '| Scenario | Fast signal | Ordering block | Economic finality | Boundary |',
    '|---|---:|---:|---:|---|',
    `| ${finalityRow('Single-claim settlement timeline', singleSteps)} |`,
    `| ${finalityRow('Batch settlement timeline', batchSteps)} |`,
    '',
    '## Boundary',
    '',
    '- Fast inclusion can drive progress bars, alerts, and operator UX.',
    '- Ordering-block confirmation is the first canonical L1 inclusion point.',
    '- Economic finality remains K ordering blocks deep for settlement accounting.',
    '- This is not live benchmark evidence.',
    '- This does not authorize live settlement claims, production throughput, mainnet capacity, trustless burn completion, or full parallel L1 settlement claims.',
  ].join('\n');
}

function main(): void {
  const args = parseShowcaseOutputArgs(
    process.argv.slice(2),
    'npm run showcase:finality',
    'Builds deterministic offline subblock-ready finality model output.',
  );
  const singleSteps = buildTimeline('single');
  const batchSteps = buildTimeline('batch');

  console.log('Ergo Sidechain Bridge - Subblock-Ready Finality Showcase');
  console.log('Mode: OFFLINE (illustrative timing model, no node calls)');
  console.log(`Assumptions: ${fmt(SUBBLOCK_TARGET_MS)} fast signal target, ${fmt(ORDERING_BLOCK_MS)} ordering block, K=${FINALITY_DEPTH}`);

  printTimeline('Single-claim settlement timeline', singleSteps);
  printTimeline('Batch settlement timeline', batchSteps);
  printPolicy();
  printMetrics();

  console.log('\nTakeaway');
  console.log('  Subblocks improve responsiveness. They do not remove the need for finality depth.');
  console.log('  This distinction is what EVM teams already know as pending vs included vs finalized.');
  if (args.out) writeShowcaseReport(args.out, formatFinalityEvidenceReport(singleSteps, batchSteps, args));
}

main();
