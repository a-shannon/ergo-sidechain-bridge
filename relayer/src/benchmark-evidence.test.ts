import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_BENCHMARK_ALLOWED_CLAIMS,
  REQUIRED_BENCHMARK_BLOCKED_CLAIMS,
  REQUIRED_BENCHMARK_COMMANDS,
  parseCommandRows,
  parseMetricRows,
  validateBenchmarkEvidence,
} from './benchmark-evidence.js';
import {
  buildBenchmarkValidationReport,
  formatBenchmarkValidationReportMarkdown,
} from './benchmark-evidence-report.js';

const LIVE_BATCH_TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DIFFERENT_LIVE_BATCH_TX_ID = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const LIVE_BATCH_EVIDENCE =
  `artifact://benchmark/live-batch-settlement-submit-confirm-reconciliation-txid.log; txId ${LIVE_BATCH_TX_ID}; ` +
  `user explicit live broadcast approval artifact://benchmark/live-batch-user-approval.md Expected transaction ID ${LIVE_BATCH_TX_ID}; ` +
  'scoped BRIDGE_BROADCAST_ENABLED=true evidence artifact://benchmark/live-batch-scoped-broadcast.log; ' +
  'post-enable readiness npm run demo:readiness PASS artifact://benchmark/live-batch-demo-readiness.log; ' +
  'Broadcast policy PASS artifact://benchmark/live-batch-broadcast-policy.log; ' +
  'Live settlement signing PASS artifact://benchmark/live-batch-live-settlement-signing.log; ' +
  'broadcast network reconfirmation artifact://benchmark/live-batch-network-reconfirmation.log';
const LIVE_BATCH_EVIDENCE_WITHOUT_APPROVAL =
  `artifact://benchmark/live-batch-settlement-submit-confirm-reconciliation-txid.log; txId ${LIVE_BATCH_TX_ID}`;

const linkedMetricRows = [
  '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 batch=1 | 1 settlement/min | 2 blocks | linked |',
  '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 batch=8 | 1 settlement/min | 2 blocks | linked |',
  '| Sharded lanes planner | artifact://benchmark/sharded-lanes-planner.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 batch=8 | 1 settlement/min | 2 blocks | linked |',
  `| Live batch settlement | ${LIVE_BATCH_EVIDENCE}; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 batch=8 | 1 settlement/min | 2 blocks | linked |`,
].join('\n');

const pendingMetricRows = [
  'Single-claim settlement baseline',
  'Batch settlement',
  'Sharded lanes planner',
  'Live batch settlement',
].map(scenario => `| ${scenario} | | | | | | | | | pending |`).join('\n');

const linkedCommandRows = REQUIRED_BENCHMARK_COMMANDS
  .map(command =>
    `| ${command} | PASS exit code 0 | artifact://benchmark/${slug(command)}-output.log; ${command} command output PASS exit code 0 | linked |`,
  )
  .join('\n');

const shardedLaneRows = [
  'DUP inputs are lane-local',
  'Liquidity inputs are lane-local',
  'SPVTracker remains a shared input today',
  'Full parallel L1 settlement is not claimed',
  'Tracker overlap mitigation is identified',
].map(statement => `| ${statement} | artifact://benchmark/${slug(statement)}.log | linked |`).join('\n');

const bottleneckRows = [
  ['ContextExtension var count', 'ContextExtension Vars limit batch width', 'measure ContextExtension Var count before scaling claim'],
  ['Batch unlock claim-core size', 'batch unlock claim-core size limits output count', 'benchmark batch unlock claim-core size'],
  ['DUP insert proof size', 'DUP AVL insert-proof size limits batch growth', 'measure DUP AVL proof-size growth'],
  ['SPV tracker contention', 'SPV tracker remains shared-input contention', 'evaluate SPV tracker contention mitigation'],
  ['Liquidity lane fragmentation', 'liquidity lane fragmentation affects lane capacity', 'measure liquidity lane fragmentation'],
  ['Ergo transaction size limit', 'Ergo transaction size-limit constrains batch payload', 'measure Ergo transaction byte-limit margin'],
  ['Node mempool or signing readiness', 'node mempool signing readiness limits live throughput', 'run node mempool signing readiness drill'],
].map(([bottleneck, impact, nextAction]) =>
  `| ${bottleneck} | artifact://benchmark/${slug(bottleneck)}.log | ${impact} | ${nextAction} |`,
).join('\n');

const reviewerRows = [
  ['Benchmark owner', 'benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured'],
  ['Security reviewer', 'benchmark bottleneck confirmed: ContextExtension var count remains bounded'],
  ['Operator reviewer', 'benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked'],
].map(([role, notes]) => `| ${role} | reviewer-a | approve | 2026-05-14 | ${notes} |`).join('\n');

const claimsBoundary = `
Allowed only with linked evidence:

- Single-claim settlement remains the correctness baseline.
- Batch settlement amortizes DUP and unlock work for the measured batch size.
- Sharded lanes demonstrate lane-local DUP and liquidity planning.
- Subblock-aware UX separates fast inclusion from ordering-block finality.

Not allowed until separately proven:

- Production throughput.
- Base-level or exchange-scale throughput.
- Full parallel L1 settlement while SPVTracker remains a shared input.
- Trustless burn verification while the transitional trusted burn path is in
  use.
- Mainnet cost, latency, or capacity claims without mainnet-grade evidence.
`;

function benchmarkEvidence(overrides: {
  commandRows?: string;
  metricRows?: string;
  shardedRows?: string;
  bottlenecks?: string;
  claimsBoundary?: string;
  publicationDecision?: string;
  reviewers?: string;
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  trustPath?: string;
} = {}): string {
  return `
# Completed Benchmark Evidence

## Benchmark Classification

| Field | Value |
|---|---|
| Benchmark name | batch evidence rehearsal |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'patched devnet'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'enabled'} |
| Trust path | ${overrides.trustPath ?? 'transitional trusted burn path'} |
| Machine profile | 8 vCPU / 16GB RAM benchmark runner |
| Node version | 24 |
| Rust version | 1.86.0 |
| wasm-pack version | 0.14.0 |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Required Commands

| Command | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.commandRows ?? linkedCommandRows}

## Metric Table

| Scenario | Evidence command or log | Sample count | Build time | Proof size | Transaction size | Cost-relevant counts | Throughput | Latency | Status |
|---|---|---|---|---|---|---|---|---|---|
${overrides.metricRows ?? linkedMetricRows}

## Sharded Lane Evidence

| Statement | Required evidence | Status |
|---|---|---|
${overrides.shardedRows ?? shardedLaneRows}

## Bottleneck Register

| Bottleneck | Current evidence | Impact | Required next action |
|---|---|---|---|
${overrides.bottlenecks ?? bottleneckRows}

## Claims Boundary

${overrides.claimsBoundary ?? claimsBoundary}

## Publication Decision

| Field | Value |
|---|---|
${overrides.publicationDecision ?? publicationDecisionRows()}

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('benchmark evidence validation', () => {
  it('parses required command rows', () => {
    const rows = parseCommandRows(benchmarkEvidence());

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      command: 'npm run showcase:benchmark',
      expectedResult: 'PASS exit code 0',
      status: 'linked',
    });
  });

  it('parses metric rows', () => {
    const rows = parseMetricRows(benchmarkEvidence());

    expect(rows[0]).toMatchObject({
      scenario: 'Single-claim settlement baseline',
      status: 'linked',
      evidenceCommandOrLog:
        'artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1',
      sampleCount: '3',
    });
  });

  it('passes when benchmark evidence is fully structured', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence());

    expect(result.status).toBe('PASS');
    expect(result.commandRows).toHaveLength(6);
    expect(result.metricRows).toHaveLength(4);
    expect(result.publicationDecision).toMatchObject({
      releaseSupported: 'institutional reference',
      scalingClaimsAllowed: 'yes',
    });
    expect(result.claimsBoundary).toEqual({
      allowedClaims: REQUIRED_BENCHMARK_ALLOWED_CLAIMS,
      blockedClaims: REQUIRED_BENCHMARK_BLOCKED_CLAIMS,
    });
    expect(result.classification).toMatchObject({
      benchmarkName: 'batch evidence rehearsal',
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'patched devnet',
      broadcastMode: 'enabled',
      trustPath: 'transitional trusted burn path',
      machineProfile: '8 vCPU / 16GB RAM benchmark runner',
      nodeVersion: '24',
      rustVersion: '1.86.0',
      wasmPackVersion: '0.14.0',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.message).toContain('6 command rows and 4 metric rows');
  });

  it('prints benchmark claim and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-benchmark-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run benchmark:validate');
    expect(result.stdout).toContain('completed Benchmark Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --benchmark-evidence');
    expect(result.stdout).toContain('benchmark validation target');
    expect(result.stdout).toContain('command-specific benchmark command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS does not authorize public claims');
    expect(result.stdout).toContain('Scaling or testnet production-candidate wording requires release:gate PASS');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Scaling claims allowed = yes');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes');
    expect(result.stdout).toContain('Production throughput claim allowed = no');
    expect(result.stdout).toContain('Mainnet-grade evidence linked = no');
    expect(result.stdout).toContain('Open benchmark blockers = 0');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('blocks malformed benchmark evidence instead of throwing parser errors', () => {
    const result = validateBenchmarkEvidence('# Offline Benchmark Evidence Prep\n\n## Completed Offline Commands\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: table not found');
    expect(result.errors).toContain('Metric Table: table not found');
    expect(result.message).toContain('Benchmark evidence BLOCKED');
  });

  it('reports malformed benchmark CLI evidence without leaking stack traces or local paths', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-benchmark-evidence.ts',
        '../evidence/benchmarks/offline-showcase-prep-2026-06-24-4b54dcff.md',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Benchmark evidence BLOCKED');
    expect(result.stdout).toContain('Required Commands: table not found');
    expect(result.stdout).not.toContain('benchmark-evidence.ts');
    expect(result.stdout).not.toContain('Error:');
    const backslash = String.fromCharCode(92);
    const windowsDrivePathPattern = new RegExp(`[A-Za-z]${String.fromCharCode(58)}${backslash}${backslash}`);
    expect(result.stdout).not.toMatch(windowsDrivePathPattern);
  });

  it('writes a sanitized benchmark validation blocker report with issue groups', () => {
    const reportDir = mkdtempSync(join(process.cwd(), '.tmp-benchmark-report-'));
    const reportPath = join(reportDir, 'blocked-report.md');
    const reportTarget = `${reportDir.slice(process.cwd().length + 1).replace(/\\/g, '/')}/blocked-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-benchmark-evidence.ts',
          '../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-25-ca56646f.md',
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Benchmark evidence BLOCKED');
      expect(result.stdout).toContain('Wrote benchmark validation report to --report-out target.');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('# Benchmark Evidence Validation Report');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Exit code | 1 |');
      expect(report).toContain('| Structural issues | 11 |');
      expect(report).toContain(
        '| Validated target | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-25-ca56646f.md |',
      );
      expect(report).toContain('| Live batch settlement | 1 |');
      expect(report).toContain('| Publication decision | 7 |');
      expect(report).toContain('| Reviewer sign-off | 3 |');
      expect(report).toContain('does not authorize public claims, release claims, publishing, deployment, or transaction broadcast');
      expect(report).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
      const windowsHomePrefix = ['C:', 'Users'].join(String.fromCharCode(92));
      expect(report).not.toContain(windowsHomePrefix);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it('redacts spaced Windows paths from benchmark validation reports', () => {
    const separator = String.fromCharCode(92);
    const localTarget = ['C:', 'bridge workstation', 'operator evidence', 'benchmark.md'].join(separator);
    const report = formatBenchmarkValidationReportMarkdown(
      buildBenchmarkValidationReport({
        command: `npm run benchmark:validate -- ${localTarget} --report-out <report.md>`,
        workingDirectory: localTarget,
        validatedTarget: localTarget,
        validation: {
          status: 'BLOCKED',
          message: 'Benchmark evidence BLOCKED: 1 structural issue(s).',
          errors: [`Metric Table: live evidence points at ${localTarget}`],
          commandRows: [],
          metricRows: [],
          shardedLaneRows: [],
          bottleneckRows: [],
          classification: {},
          claimsBoundary: { allowedClaims: [], blockedClaims: [] },
          publicationDecision: {},
          reviewerRows: [],
        },
      }),
    );

    expect(report).toContain('| Working directory | [local-path] |');
    expect(report).toContain('| Validated target | [local-path] |');
    expect(report).toContain('| Command | npm run benchmark:validate -- [local-path] --report-out <report.md> |');
    expect(report).not.toContain('bridge workstation');
    expect(report).not.toContain('operator evidence');
  });

  it('blocks benchmark evidence when required command rows are omitted', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({ commandRows: '' }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm run showcase:benchmark: missing required row');
  });

  it('requires linked command evidence to identify the command output', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'generic benchmark output PASS exit code 0',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must identify npm run showcase:benchmark output',
    );
  });

  it('requires linked command evidence to include explicit exit code 0 output', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        '| npm run showcase:benchmark | PASS exit code 0 | artifact://benchmark/npm-run-showcase-benchmark-output.log; npm run showcase:benchmark command output PASS exit code 0 | linked |',
        '| npm run showcase:benchmark | PASS | artifact://benchmark/npm-run-showcase-benchmark-output.log; npm run showcase:benchmark command output PASS | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: Expected result must include exit code 0',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must include command output with exit code 0',
    );
  });

  it('rejects linked command evidence that keeps exit-code placeholders', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        '| npm run showcase:benchmark | PASS exit code 0 | artifact://benchmark/npm-run-showcase-benchmark-output.log; npm run showcase:benchmark command output PASS exit code 0 | linked |',
        '| npm run showcase:benchmark | PASS exit code 0/1 | artifact://benchmark/npm-run-showcase-benchmark-output.log; npm run showcase:benchmark command output PASS exit code 0/1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: Expected result must include exit code 0',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must include command output with exit code 0',
    );
  });

  it('requires benchmark dates to use ISO calendar format', () => {
    const result = validateBenchmarkEvidence(
      benchmarkEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Benchmark Classification: Date must use YYYY-MM-DD');
  });

  it('requires benchmark Git commits to use commit SHA format', () => {
    const result = validateBenchmarkEvidence(
      benchmarkEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Benchmark Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate benchmark classification fields', () => {
    const result = validateBenchmarkEvidence(
      benchmarkEvidence().replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Benchmark Classification: Git commit: duplicate required field');
  });

  it('requires reproducible benchmark environment metadata', () => {
    const result = validateBenchmarkEvidence(
      benchmarkEvidence()
        .replace('| Machine profile | 8 vCPU / 16GB RAM benchmark runner |\n', '')
        .replace('| Node version | 24 |\n', '')
        .replace('| Rust version | 1.86.0 |\n', '')
        .replace('| wasm-pack version | 0.14.0 |\n', ''),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Benchmark Classification: Machine profile is required');
    expect(result.errors).toContain('Benchmark Classification: Node version is required');
    expect(result.errors).toContain('Benchmark Classification: Rust version is required');
    expect(result.errors).toContain('Benchmark Classification: wasm-pack version is required');
  });

  it('blocks blank metric evidence in the template shape', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({ metricRows: pendingMetricRows }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: status must be linked before Gate 7 evidence can pass',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
    );
  });

  it('blocks linked metric rows without complete measurements', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log | | | | | | | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Metric Table: Batch settlement: missing required row');
    expect(result.errors).toContain('Metric Table: Single-claim settlement baseline: linked status requires Build time');
    expect(result.errors).toContain('Metric Table: Single-claim settlement baseline: linked status requires Latency');
  });

  it('rejects duplicate required benchmark rows', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: `${linkedMetricRows}\n| Batch settlement | artifact://benchmark/batch-second.log | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 | 1 settlement/min | 2 blocks | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Metric Table: Batch settlement: duplicate required row');
  });

  it('requires linked metric rows to include numeric measurements with units', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace('1 settlement/min', 'scoped only').replace('2 blocks', 'scoped only'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Metric Table: Single-claim settlement baseline: Throughput must include a measured numeric value and unit');
    expect(result.errors).toContain('Metric Table: Single-claim settlement baseline: Latency must include a measured numeric value and unit');
  });

  it('rejects zero-valued benchmark measurements and cost counts', () => {
    const zeroMetricRows = linkedMetricRows
      .replace('10ms', '0ms')
      .replace('128 bytes', '0 bytes')
      .replace('1.2KB', '0KB')
      .replace('inputs=3 outputs=3 vars=4 batch=8', 'inputs=0 outputs=0 vars=0 batch=0')
      .replace('1 settlement/min', '0 settlement/min')
      .replace('2 blocks', '0 blocks');

    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: zeroMetricRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Build time must include a positive measured numeric value and unit',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Proof size must include a positive measured numeric value and unit',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Transaction size must include a positive measured numeric value and unit',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: Cost-relevant counts must include positive numeric inputs, outputs, vars, batch count(s)',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Throughput must include a positive measured numeric value and unit',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Latency must include a positive measured numeric value and unit',
    );
  });

  it('allows zero-valued metric components when the measured row still has a positive value', () => {
    const rowsWithZeroComponent = linkedMetricRows.replace('2 blocks', 'queue=0s confirmation=2 blocks');

    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: rowsWithZeroComponent,
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires linked metric rows to include enough benchmark samples', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 |',
          '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | one |',
        )
        .replace(
          '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 |',
          '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 1 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Sample count must be a positive integer',
    );
    expect(result.errors).toContain('Metric Table: Batch settlement: Sample count must be at least 3');
  });

  it('rejects unsafe benchmark sample and cost counts', () => {
    const unsafeCount = String(Number.MAX_SAFE_INTEGER + 2);
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 |',
          `| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | ${unsafeCount} |`,
        )
        .replace(
          'inputs=3 outputs=3 vars=4 batch=8',
          `inputs=${unsafeCount} outputs=3 vars=4 batch=8`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Sample count must be a safe integer',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: Cost-relevant counts must include safe integer numeric inputs count(s)',
    );
  });

  it('requires cost-relevant counts to include inputs outputs vars and batch size', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace('inputs=3 outputs=3 vars=4 batch=8', 'inputs=3 outputs=3 vars=4'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: Cost-relevant counts must include numeric batch count(s)',
    );
  });

  it('rejects duplicate cost-relevant count keys even when one value is positive', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'inputs=3 outputs=3 vars=4 batch=8',
        'inputs=3 inputs=0 outputs=3 vars=4 batch=8',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: Cost-relevant counts must include exactly one positive numeric inputs count',
    );
  });

  it('requires live batch settlement evidence to use a live-capable environment', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      environment: 'local offline',
      broadcastMode: 'disabled',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires patched devnet, testnet, or staging environment',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires enabled broadcast mode',
    );
  });

  it('requires live batch settlement evidence to reference submit or confirm artifacts', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        LIVE_BATCH_EVIDENCE,
        'artifact://benchmark/offline-showcase-output.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires live submit/confirm or e2e aggregate evidence, not offline showcase output',
    );
  });

  it('requires linked metric evidence to identify the measured scenario', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 |',
          '| Single-claim settlement baseline | artifact://benchmark/reviewed.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 |',
        )
        .replace(
          '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 |',
          '| Batch settlement | artifact://benchmark/reviewed.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 |',
        )
        .replace(
          '| Sharded lanes planner | artifact://benchmark/sharded-lanes-planner.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 |',
          '| Sharded lanes planner | artifact://benchmark/reviewed.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must identify single-claim settlement baseline',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: evidence must identify batch settlement',
    );
    expect(result.errors).toContain(
      'Metric Table: Sharded lanes planner: evidence must identify sharded lanes planner',
    );
  });

  it('requires live batch settlement evidence to preserve submit confirmation and tx identity', () => {
    const submitOnly = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        LIVE_BATCH_EVIDENCE,
        'artifact://benchmark/live-batch-settlement-submit.log',
      ),
    }));
    const confirmOnly = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        LIVE_BATCH_EVIDENCE,
        'artifact://benchmark/live-batch-settlement-confirm.log',
      ),
    }));

    expect(submitOnly.status).toBe('BLOCKED');
    expect(submitOnly.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires confirmation evidence',
    );
    expect(submitOnly.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires transaction identity or reconciliation evidence',
    );
    expect(confirmOnly.status).toBe('BLOCKED');
    expect(confirmOnly.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires submit evidence',
    );
    expect(confirmOnly.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires transaction identity or reconciliation evidence',
    );
  });

  it('requires live batch settlement evidence to cite a concrete transaction identifier', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        LIVE_BATCH_EVIDENCE,
        'artifact://benchmark/live-batch-settlement-submit-confirm-reconciliation-txid.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires a concrete 32-byte transaction ID or reconciliation digest',
    );
  });

  it('requires live batch submitted transaction identity to match the Expected transaction ID', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        `txId ${LIVE_BATCH_TX_ID}`,
        `txId ${DIFFERENT_LIVE_BATCH_TX_ID}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: submitted transaction ID must match Expected transaction ID',
    );
  });

  it('requires live batch submitted transaction identity to be present', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(`txId ${LIVE_BATCH_TX_ID}; `, ''),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: submitted transaction ID must match Expected transaction ID',
    );
  });

  it('requires live batch settlement evidence to cite explicit user broadcast approval and live-readiness evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(LIVE_BATCH_EVIDENCE, LIVE_BATCH_EVIDENCE_WITHOUT_APPROVAL),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires user explicit live broadcast approval evidence bound to Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires scoped BRIDGE_BROADCAST_ENABLED=true evidence',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires Expected transaction ID binding',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires post-enable demo:readiness PASS evidence',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires Broadcast policy PASS evidence',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires Live settlement signing PASS evidence',
    );
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires broadcast network reconfirmation evidence',
    );
  });

  it('requires live batch user approval evidence to bind the Expected transaction ID', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        `user explicit live broadcast approval artifact://benchmark/live-batch-user-approval.md Expected transaction ID ${LIVE_BATCH_TX_ID};`,
        `user explicit live broadcast approval artifact://benchmark/live-batch-user-approval.md; ` +
        'approval artifact records reviewer only without transaction binding; ' +
        'release-gate metadata remains separate from the approval artifact and does not bind the reviewed transaction; ' +
        `Expected transaction ID ${LIVE_BATCH_TX_ID};`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires user explicit live broadcast approval evidence bound to Expected transaction ID',
    );
  });

  it('rejects live batch readiness evidence with contradictory failure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'Broadcast policy PASS artifact://benchmark/live-batch-broadcast-policy.log',
        'Broadcast policy FAIL previous PASS artifact://benchmark/live-batch-broadcast-policy.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires Broadcast policy PASS evidence',
    );
  });

  it('rejects live batch readiness evidence when failure markers appear after PASS', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'Broadcast policy PASS artifact://benchmark/live-batch-broadcast-policy.log',
        'Broadcast policy PASS exit code 0 validation completed with 1 structural issue artifact://benchmark/live-batch-broadcast-policy.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires Broadcast policy PASS evidence',
    );
  });

  it('rejects linked benchmark metric evidence with contradictory failure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log FAIL exit code 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects benchmark evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 benchmark validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        `npm run showcase:benchmark command output PASS exit code 0; ${contradictoryEvidence}`,
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        `artifact://benchmark/single-claim-settlement-baseline.log ${contradictoryEvidence}`,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        `artifact://benchmark/dup-inputs-are-lane-local.log ${contradictoryEvidence}`,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        `artifact://benchmark/contextextension-var-count.log ${contradictoryEvidence}`,
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${contradictoryEvidence}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${contradictoryEvidence}`,
      }),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; ${contradictoryEvidence} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory benchmark failure markers',
    );
  });

  it('rejects benchmark evidence with structured failure fields', () => {
    for (const contradictoryEvidence of [
      'command output: PASS exit code 0 {"errors":["benchmark drift"]}',
      'command output: PASS exit code 0 failureTotal: 1',
    ]) {
      const result = validateBenchmarkEvidence(benchmarkEvidence({
        commandRows: linkedCommandRows.replace(
          'npm run showcase:benchmark command output PASS exit code 0',
          `npm run showcase:benchmark command output PASS exit code 0; ${contradictoryEvidence}`,
        ),
        metricRows: linkedMetricRows.replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          `artifact://benchmark/single-claim-settlement-baseline.log ${contradictoryEvidence}`,
        ),
        shardedRows: shardedLaneRows.replace(
          'artifact://benchmark/dup-inputs-are-lane-local.log',
          `artifact://benchmark/dup-inputs-are-lane-local.log ${contradictoryEvidence}`,
        ),
        bottlenecks: bottleneckRows.replace(
          'artifact://benchmark/contextextension-var-count.log',
          `artifact://benchmark/contextextension-var-count.log ${contradictoryEvidence}`,
        ),
        publicationDecision: publicationDecisionRows({
          releaseNoteUpdates:
            `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${contradictoryEvidence}`,
          checklistUpdates:
            `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${contradictoryEvidence}`,
        }),
        reviewers: reviewerRows.replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
          `| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; ${contradictoryEvidence} |`,
        ),
      }));

      expect(result.status, contradictoryEvidence).toBe('BLOCKED');
      expect(result.errors, contradictoryEvidence).toContain(
        'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Publication Decision: Required release-note updates must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Publication Decision: Required checklist updates must not include contradictory benchmark failure markers',
      );
      expect(result.errors, contradictoryEvidence).toContain(
        'Reviewer Sign-Off: Security reviewer: notes must not include contradictory benchmark failure markers',
      );
    }

    const success = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; {"errors":[]} failureTotal: 0',
      ),
    }));

    expect(success.status).toBe('PASS');
  });

  it('rejects linked benchmark evidence with remaining issue markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Remaining issues: unresolved single-claim benchmark blocker',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Remaining issues: unresolved lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Remaining issues: unresolved ContextExtension blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with singular remaining issue markers', () => {
    const remainingIssue = 'command output: PASS exit code 0; Remaining issue: follow-up pending';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        `npm run showcase:benchmark ${remainingIssue}`,
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        `artifact://benchmark/single-claim-settlement-baseline.log ${remainingIssue}`,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        `artifact://benchmark/dup-inputs-are-lane-local.log ${remainingIssue}`,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        `artifact://benchmark/contextextension-var-count.log ${remainingIssue}`,
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; ${remainingIssue}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; ${remainingIssue}`,
      }),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; ${remainingIssue} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with open or known issue markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Open issues: unresolved benchmark command blocker',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Known issues: unresolved single-claim benchmark blocker',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Open issues: unresolved lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Known issues: unresolved ContextExtension blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with separatorless nonzero unresolved issue markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Open issues 1 unresolved',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with outstanding or pending issue markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Outstanding issues: unresolved benchmark command blocker',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Pending issues: unresolved single-claim benchmark blocker',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Outstanding issues: unresolved lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Pending issues: unresolved ContextExtension blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with unresolved or blocking issue labels', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Unresolved issues: benchmark command blocker',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Blocking issues: single-claim benchmark blocker',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Unresolved issues: lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Blocking issues: ContextExtension blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with blocker or follow-up labels', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Open blockers: benchmark command blocker',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Unresolved follow-ups: single-claim benchmark evidence',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Open blockers: lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Unresolved follow-ups: ContextExtension evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark evidence with qualified benchmark blocker labels', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Open benchmark blockers: unresolved benchmark command blocker',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Pending benchmark blockers: unresolved single-claim benchmark blocker',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Open benchmark blockers: unresolved lane-local blocker',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Pending benchmark blockers: unresolved ContextExtension blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('allows linked benchmark evidence with explicit no issue markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Open issues: 0',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Known issues: none',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Open issues: no',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Known issues: n/a',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('allows linked benchmark evidence with explicit remaining closure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; Remaining issues: none',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; Remaining blockers: 0',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; Remaining follow-ups: no',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; Remaining benchmark blockers: 0',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('allows linked benchmark evidence with natural remaining closure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'npm run showcase:benchmark command output PASS exit code 0',
        'npm run showcase:benchmark command output PASS exit code 0; no remaining issues',
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/single-claim-settlement-baseline.log command output: PASS exit code 0; zero remaining blockers',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log command output: PASS exit code 0; without remaining follow-ups',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log command output: PASS exit code 0; no remaining benchmark blockers',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects generic live broadcast approval without user approval wording', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        LIVE_BATCH_EVIDENCE,
        LIVE_BATCH_EVIDENCE.replace('user explicit live broadcast approval', 'explicit live broadcast approval'),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Live batch settlement: linked status requires user explicit live broadcast approval evidence bound to Expected transaction ID',
    );
  });

  it('requires linked sharded lane rows to include evidence markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      shardedRows: shardedLaneRows.replace('artifact://benchmark/dup-inputs-are-lane-local.log', 'lane locality reviewed'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a command, link, or artifact marker',
    );
  });

  it('requires sharded lane evidence to cite the lane claim', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      shardedRows: shardedLaneRows
        .replace(
          '| DUP inputs are lane-local | artifact://benchmark/dup-inputs-are-lane-local.log | linked |',
          '| DUP inputs are lane-local | artifact://benchmark/reviewed.log | linked |',
        )
        .replace(
          '| SPVTracker remains a shared input today | artifact://benchmark/spvtracker-remains-a-shared-input-today.log | linked |',
          '| SPVTracker remains a shared input today | artifact://benchmark/reviewed.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must identify lane-local DUP inputs',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: SPVTracker remains a shared input today: evidence must identify shared SPVTracker input',
    );
  });

  it('rejects linked sharded lane evidence with contradictory failure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local.log ERROR validation failed',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: evidence must not include contradictory benchmark failure markers',
    );
  });

  it('blocks unknown classification values', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production',
      environment: 'mainnet',
      broadcastMode: 'maybe',
      trustPath: 'unknown',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Benchmark Classification: Release level must be one of validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain(
      'Benchmark Classification: Environment must be one of local offline, patched devnet, testnet, staging',
    );
    expect(result.errors).toContain('Benchmark Classification: Broadcast mode must be one of disabled, dry-run, enabled');
    expect(result.errors).toContain(
      'Benchmark Classification: Trust path must be one of transitional trusted burn path, trustless burn proof path',
    );
  });

  it('requires production deployment candidate benchmarks to be testnet-scoped', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Benchmark Classification: production deployment candidate requires Environment testnet',
    );
  });

  it('requires production deployment candidate benchmarks to use the trustless burn proof path', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        reviewerDecisionSummary:
          'release support: production deployment candidate; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: allowed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Benchmark Classification: production deployment candidate requires Trust path trustless burn proof path',
    );
  });

  it('requires bottleneck register details', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      bottlenecks: '| ContextExtension var count | | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Bottleneck Register: Batch unlock claim-core size: missing required row');
    expect(result.errors).toContain('Bottleneck Register: ContextExtension var count: Current evidence is required');
    expect(result.errors).toContain('Bottleneck Register: ContextExtension var count: Required next action is required');
  });

  it('requires bottleneck current evidence markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      bottlenecks: bottleneckRows.replace('artifact://benchmark', 'reviewed bottleneck register'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a command, link, or artifact marker',
    );
  });

  it('rejects bottleneck current evidence with contradictory failure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count.log BLOCKED with errors=2',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not include contradictory benchmark failure markers',
    );
  });

  it('rejects linked benchmark rows that only point to templates or bare validator commands', () => {
    const templateOnlyEvidence =
      '[Performance Benchmark Evidence Template](performance-benchmark-evidence-template.md), `npm run benchmark:validate`';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        templateOnlyEvidence,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        templateOnlyEvidence,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        templateOnlyEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
  });

  it('rejects linked metric rows that only contain targetless command-output notes', () => {
    const targetlessCommandOutput = 'npm run benchmark:validate command output: PASS for batch settlement';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/batch-settlement.log',
        targetlessCommandOutput,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it('rejects metric rows whose evidence cites a different sample count', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 |',
        '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 100 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Evidence command or log must cite Sample count 100',
    );
  });

  it('requires metric sample count evidence to use an explicit sample-count label', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 |',
        '| Single-claim settlement baseline | artifact://benchmark/single-claim-settlement-baseline.log; n 3; cost counts inputs=3; outputs=3; vars=4; batch=1 | 3 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: Evidence command or log must cite Sample count 3',
    );
  });

  it('rejects metric rows whose evidence cites different cost-relevant counts', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 | 10ms | 128 bytes | 1.2KB | inputs=3 outputs=3 vars=4 batch=8 |',
        '| Batch settlement | artifact://benchmark/batch-settlement.log; sample count 3; cost counts inputs=3; outputs=3; vars=4; batch=8 | 3 | 10ms | 128 bytes | 1.2KB | inputs=100 outputs=3 vars=4 batch=8 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: Evidence command or log must cite Cost-relevant counts inputs=100 outputs=3 vars=4 batch=8',
    );
  });

  it('rejects validation-target bindings as linked benchmark row evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/batch-settlement.log',
        '[benchmark validation target](artifact://benchmark/batch-settlement.log) completed benchmark metric evidence for Batch settlement',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        '[benchmark validation target](artifact://benchmark/dup-inputs-are-lane-local.log) completed benchmark sharded-lane evidence for DUP inputs are lane-local',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        '[benchmark validation target](artifact://benchmark/contextextension-var-count.log) completed benchmark bottleneck evidence for ContextExtension var count',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          '[benchmark validation target](artifact://benchmark/gate-7-benchmark-release-notes-update.md) completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          '[benchmark validation target](artifact://benchmark/gate-7-benchmark-checklist-update.md) completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects separator-delimited validation-target bindings as linked benchmark row evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/batch-settlement.log',
        '[benchmark-validation-target](artifact://benchmark/batch-settlement.log) completed benchmark metric evidence for Batch settlement',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it('accepts concrete benchmark evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://benchmark/validation/benchmark-validate-input.md';
    const validationTargetBinding = `benchmark validation target ${validationTarget}`;
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'artifact://benchmark/npm-run-benchmark-validate-output.log; npm run benchmark:validate command output PASS exit code 0',
        `artifact://benchmark/npm-run-benchmark-validate-output.log; npm run benchmark:validate command output PASS exit code 0; ${validationTargetBinding}`,
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/batch-settlement.log',
        `artifact://benchmark/batch-settlement.log; ${validationTargetBinding}`,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        `artifact://benchmark/dup-inputs-are-lane-local.log; ${validationTargetBinding}`,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        `artifact://benchmark/contextextension-var-count.log; ${validationTargetBinding}`,
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/gate-7-benchmark-release-notes-update.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${validationTargetBinding}`,
        checklistUpdates:
          `artifact://benchmark/gate-7-benchmark-checklist-update.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; ${validationTargetBinding}`,
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects targetless artifact markers for benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact:// completed single-claim settlement baseline evidence',
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact:// ',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates: 'artifact:// completed Gate 7 benchmark release-note update evidence',
        checklistUpdates: 'artifact:// completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects row-named generic artifact targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          'artifact://benchmark/generic-single-claim-settlement-baseline.log',
        )
        .replace(
          'artifact://benchmark/batch-settlement.log',
          'artifact://benchmark/generic-batch-settlement.log',
        ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/generic-dup-inputs-are-lane-local.log',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/generic-contextextension-var-count.log',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/generic-completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          'artifact://benchmark/generic-completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects row-named sample benchmark artifact targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          'artifact://benchmark/sample-benchmark-single-claim-settlement-baseline.log',
        )
        .replace(
          'artifact://benchmark/batch-settlement.log',
          'artifact://benchmark/sample-metric-batch-settlement.log',
        ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/sample-sharded-lane-dup-inputs-are-lane-local.log',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/sample-bottleneck-contextextension-var-count.log',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/sample-release-note-update-completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          'artifact://benchmark/sample-checklist-update-completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects non-concrete artifact targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          'artifact://benchmark/placeholder-single-claim-settlement-baseline.log',
        )
        .replace(
          'artifact://benchmark/batch-settlement.log',
          'artifact://benchmark/todo-batch-settlement.log',
        ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/tbd-dup-inputs-are-lane-local.log',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/sample-evidence-contextextension-var-count.log',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/example-evidence-completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          'artifact://benchmark/placeholder-completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects non-concrete Markdown targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows
        .replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          '[placeholder benchmark evidence](docs/placeholder-single-claim-settlement-baseline.log) completed single-claim settlement baseline evidence',
        )
        .replace(
          'artifact://benchmark/batch-settlement.log',
          '[todo benchmark evidence](docs/todo-batch-settlement.log) completed batch settlement evidence',
        ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        '[tbd lane evidence](docs/tbd-dup-inputs-are-lane-local.log) lane-local DUP inputs evidence',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        '[sample bottleneck evidence](docs/sample-evidence-contextextension-var-count.log) measured ContextExtension Var count evidence',
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          '[example release-note evidence](docs/example-evidence-completed-gate-7-benchmark-release-note-update-evidence.md) completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          '[generic checklist evidence](docs/generic-completed-gate-7-benchmark-checklist-update-evidence.md) completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
    );
  });

  it('rejects synthetic artifact targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/synthetic-single-claim-settlement-baseline.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it('rejects synthetic Markdown targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        '[synthetic benchmark evidence](docs/synthetic-single-claim-settlement-baseline.log) completed single-claim settlement baseline evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it('rejects claim-escalating artifact targets for linked benchmark evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        'artifact://benchmark/npm-run-showcase-benchmark-output.log',
        'artifact://benchmark/npm-run-showcase-benchmark-production-throughput-claims-certified-output.log',
      ),
      metricRows: linkedMetricRows
        .replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          'artifact://benchmark/single-claim-settlement-baseline-testnet-production-candidate-approved.log',
        )
        .replace(
          'artifact://benchmark/batch-settlement.log',
          'artifact://benchmark/batch-settlement-exchange-scale-throughput-accredited.log',
        ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        'artifact://benchmark/dup-inputs-are-lane-local-full-parallel-l1-settlement-endorsed.log',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/contextextension-var-count-production-throughput-claims-recommended.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run showcase:benchmark: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
    );
  });

  it.each([
    'artifact://benchmark/fixture-single-claim-settlement-baseline.log',
    'artifact://benchmark/mock-single-claim-settlement-baseline.log',
    'artifact://benchmark/dummy-single-claim-settlement-baseline.log',
    'artifact://benchmark/fake-single-claim-settlement-baseline.log',
    'artifact://benchmark/stub-single-claim-settlement-baseline.log',
    'artifact://benchmark/testdata-single-claim-settlement-baseline.log',
    'artifact://benchmark/simulated-single-claim-settlement-baseline.log',
  ])('rejects fixture-style artifact marker %s for linked benchmark rows', artifactTarget => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        artifactTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it.each([
    '[fixture](artifact://benchmark/fixture-single-claim-settlement-baseline.log)',
    '[mock](artifact://benchmark/mock-single-claim-settlement-baseline.log)',
    '[dummy](artifact://benchmark/dummy-single-claim-settlement-baseline.log)',
    '[fake](artifact://benchmark/fake-single-claim-settlement-baseline.log)',
    '[stub](artifact://benchmark/stub-single-claim-settlement-baseline.log)',
    '[testdata](artifact://benchmark/testdata-single-claim-settlement-baseline.log)',
    '[simulated](artifact://benchmark/simulated-single-claim-settlement-baseline.log)',
  ])('rejects fixture-style Markdown artifact link %s for linked benchmark rows', markdownTarget => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        markdownTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
    );
  });

  it.each([
    {
      variant: 'raw',
      singleMetricTarget: ['', 'tmp', 'single-claim-settlement-baseline.log'].join('/'),
      batchMetricTarget: ['file:', '', '', 'C:', 'tmp', 'batch-settlement.log'].join('/'),
      shardedTarget: ['', '', 'benchmark-share', 'dup-inputs-are-lane-local.log'].join('/'),
      bottleneckTarget: ['', 'home', 'operator', 'contextextension-var-count.log'].join('/'),
      releaseNoteTarget: ['', 'var', 'benchmark', 'completed-gate-7-benchmark-release-note-update-evidence.md'].join('/'),
      checklistTarget: ['file:', '', '', 'C:', 'benchmark', 'completed-gate-7-benchmark-checklist-update-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      singleMetricTarget: '%2Ftmp%2Fsingle-claim-settlement-baseline.log',
      batchMetricTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fbatch-settlement.log',
      shardedTarget: '%2F%2Fbenchmark-share%2Fdup-inputs-are-lane-local.log',
      bottleneckTarget: '%2Fhome%2Foperator%2Fcontextextension-var-count.log',
      releaseNoteTarget: '%2Fvar%2Fbenchmark%2Fcompleted-gate-7-benchmark-release-note-update-evidence.md',
      checklistTarget: 'file%3A%2F%2F%2FC%3A%2Fbenchmark%2Fcompleted-gate-7-benchmark-checklist-update-evidence.md',
    },
    {
      variant: 'embedded encoded',
      singleMetricTarget: 'artifact://benchmark/sourceTarget=%2Ftmp%2Fsingle-claim-settlement-baseline.log',
      batchMetricTarget: 'artifact://benchmark/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fbatch-settlement.log',
      shardedTarget: 'artifact://benchmark/sourceTarget=%2F%2Fbenchmark-share%2Fdup-inputs-are-lane-local.log',
      bottleneckTarget: 'artifact://benchmark/sourceTarget=%2Fhome%2Foperator%2Fcontextextension-var-count.log',
      releaseNoteTarget:
        'artifact://benchmark/sourceTarget=%2Fvar%2Fbenchmark%2Fcompleted-gate-7-benchmark-release-note-update-evidence.md',
      checklistTarget:
        'artifact://benchmark/sourceTarget=file%3A%2F%2F%2FC%3A%2Fbenchmark%2Fcompleted-gate-7-benchmark-checklist-update-evidence.md',
    },
  ])(
    'rejects $variant local-only Markdown targets for linked benchmark evidence',
    ({
      singleMetricTarget,
      batchMetricTarget,
      shardedTarget,
      bottleneckTarget,
      releaseNoteTarget,
      checklistTarget,
    }) => {
      const result = validateBenchmarkEvidence(benchmarkEvidence({
        metricRows: linkedMetricRows
          .replace(
            'artifact://benchmark/single-claim-settlement-baseline.log',
            `[benchmark evidence](${singleMetricTarget}) completed single-claim settlement baseline evidence`,
          )
          .replace(
            'artifact://benchmark/batch-settlement.log',
            `[benchmark evidence](${batchMetricTarget}) completed batch settlement evidence`,
          ),
        shardedRows: shardedLaneRows.replace(
          'artifact://benchmark/dup-inputs-are-lane-local.log',
          `[lane evidence](${shardedTarget}) lane-local DUP inputs evidence`,
        ),
        bottlenecks: bottleneckRows.replace(
          'artifact://benchmark/contextextension-var-count.log',
          `[bottleneck evidence](${bottleneckTarget}) measured ContextExtension Var count evidence`,
        ),
        publicationDecision: publicationDecisionRows({
          releaseNoteUpdates:
            `[release-note evidence](${releaseNoteTarget}) completed Gate 7 benchmark release-note update evidence`,
          checklistUpdates:
            `[checklist evidence](${checklistTarget}) completed Gate 7 benchmark checklist update evidence`,
        }),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Metric Table: Batch settlement: linked status requires a completed artifact target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Sharded Lane Evidence: DUP inputs are lane-local: linked status requires a completed artifact target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Bottleneck Register: ContextExtension var count: Current evidence must include a completed artifact target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence with a completed artifact target or non-template evidence link',
      );
    },
  );

  it('rejects sensitive or runtime Markdown targets for linked benchmark evidence', () => {
    for (const target of [
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateBenchmarkEvidence(benchmarkEvidence({
        metricRows: linkedMetricRows.replace(
          'artifact://benchmark/single-claim-settlement-baseline.log',
          `[benchmark evidence](${target}) completed single-claim settlement baseline evidence`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Metric Table: Single-claim settlement baseline: linked status requires a completed artifact target or non-template evidence link',
      );
    }
  });

  it('accepts concrete benchmark artifact names that mention sample size or template removal', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        'artifact://benchmark/sample-size-analysis-single-claim-settlement-baseline.log',
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        'artifact://benchmark/template-removal-audit-contextextension-var-count.log',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires bottleneck impact or next action to cite the concrete scaling limit', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      bottlenecks: bottleneckRows
        .replace(
          '| ContextExtension var count | artifact://benchmark/contextextension-var-count.log | ContextExtension Vars limit batch width | measure ContextExtension Var count before scaling claim |',
          '| ContextExtension var count | artifact://benchmark/contextextension-var-count.log | scoped impact | keep blocker visible |',
        )
        .replace(
          '| SPV tracker contention | artifact://benchmark/spv-tracker-contention.log | SPV tracker remains shared-input contention | evaluate SPV tracker contention mitigation |',
          '| SPV tracker contention | artifact://benchmark/spv-tracker-contention.log | scoped impact | keep blocker visible |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: impact or next action must mention ContextExtension Var count',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: SPV tracker contention: impact or next action must mention SPV tracker contention or shared input behavior',
    );
  });

  it('requires claims boundary to preserve allowed and blocked scaling claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      claimsBoundary: `
Allowed only with linked evidence:

- Single-claim settlement remains the correctness baseline.

Not allowed until separately proven:

- Production throughput.
`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Claims Boundary: missing allowed claim "Batch settlement amortizes DUP and unlock work for the measured batch size"',
    );
    expect(result.errors).toContain(
      'Claims Boundary: missing blocked claim "Full parallel L1 settlement while SPVTracker remains a shared input"',
    );
  });

  it('requires benchmark publication decision evidence for release notes and checklist updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNotesUpdated: 'no',
        releaseNoteUpdates: '[Performance Benchmark Evidence Template](performance-benchmark-evidence-template.md), `npm run benchmark:validate`',
        checklistUpdates: 'reviewed',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release notes updated must be yes before benchmark evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence with a completed artifact target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a link, command, or artifact marker',
    );
  });

  it('requires benchmark publication evidence to name the Gate 7 update class', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates: 'artifact://benchmark/generic-release-notes-update.md',
        checklistUpdates: 'artifact://benchmark/generic-checklist-update.md',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence',
    );
  });

  it('rejects Gate 7 benchmark publication update evidence kinds hidden inside longer labels', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/gate-7-release-notes.md draft completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no',
        checklistUpdates:
          'artifact://benchmark/gate-7-checklist.md candidate completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 7 benchmark release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 7 benchmark checklist update evidence',
    );
  });

  it('rejects contradictory benchmark publication update evidence', () => {
    const contradictoryEvidence = 'benchmark validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md ${contradictoryEvidence}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md ${contradictoryEvidence}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory benchmark failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory benchmark failure markers',
    );
  });

  it('rejects benchmark publication updates that reuse one completed evidence target', () => {
    const reusedPublicationUpdateTarget =
      'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence-completed-gate-7-benchmark-checklist-update-evidence.md';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `${reusedPublicationUpdateTarget} completed Gate 7 benchmark release-note update evidence`,
        checklistUpdates:
          `${reusedPublicationUpdateTarget} completed Gate 7 benchmark checklist update evidence`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Gate 7 benchmark evidence targets',
    );
  });

  it('rejects benchmark publication updates that approve broader benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; production-ready benchmark claims approved; approved production throughput claims',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; full parallel L1 settlement approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('rejects benchmark publication updates that close production throughput claims with prose-only terms', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; production throughput claims blocked',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; production throughput claim handling forbidden',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production throughput claim allowed = no; prose-only production-throughput closure is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production throughput claim allowed = no; prose-only production-throughput closure is not accepted',
    );
  });

  it('rejects benchmark publication updates that allow scaling claims with prose-only terms', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; scaling claims allowed',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; scaling claim handling approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Scaling claims allowed = yes; prose-only scaling-claim allowance is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Scaling claims allowed = yes; prose-only scaling-claim allowance is not accepted',
    );
  });

  it('requires exact scaling and throughput claim bindings in benchmark publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Scaling claims allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Scaling claims allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production throughput claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production throughput claim allowed = no',
    );
  });

  it('requires exact release support and testnet claim bindings in production-candidate benchmark publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; measured single/batch/sharded evidence linked; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact mainnet-grade evidence denial in benchmark publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no; Open benchmark blockers = 0',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Mainnet-grade evidence linked = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Mainnet-grade evidence linked = no',
    );
  });

  it('requires exact production-ready claim denial in benchmark publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
  });

  it('rejects benchmark publication evidence and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Release supported = production deployment candidate/institutional reference; Scaling claims allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Production throughput claim allowed = no/yes; Mainnet-grade evidence linked = no/yes; Open benchmark blockers = 0/1';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; ${placeholderBindings}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; ${placeholderBindings}`,
        reviewerDecisionSummary:
          'Release supported = production deployment candidate/institutional reference; ' +
          'measured single/batch/sharded evidence linked; ' +
          'Scaling claims allowed = yes/no; Mainnet-grade evidence linked = no/yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no/yes; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; ' +
          'production throughput claim handling: blocked; Production throughput claim allowed = no/yes; ' +
          'open benchmark blocker handling: 0; Open benchmark blockers = 0/1',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Scaling claims allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Scaling claims allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production throughput claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production throughput claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Mainnet-grade evidence linked = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Mainnet-grade evidence linked = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Scaling claims allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Mainnet-grade evidence linked = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production throughput claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Open benchmark blockers = 0',
    );
  });

  it('rejects contradictory exact benchmark decision bindings in publication evidence', () => {
    const contradictoryDecisionBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Scaling claims allowed = yes; Scaling claims allowed = no; ' +
      'Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
      'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
      'Production throughput claim allowed = no; Production throughput claim allowed = yes; ' +
      'Mainnet-grade evidence linked = no; Mainnet-grade evidence linked = yes; ' +
      'Open benchmark blockers = 0; Open benchmark blockers = 1';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; ${contradictoryDecisionBindings}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; ${contradictoryDecisionBindings}`,
        reviewerDecisionSummary:
          `release support: ${contradictoryDecisionBindings}; ` +
          'measured single/batch/sharded evidence linked; ' +
          'production-ready claim handling: Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
          'production throughput claim handling: blocked; Production throughput claim allowed = no; Production throughput claim allowed = yes; ' +
          'open benchmark blocker handling: Open benchmark blockers = 0; Open benchmark blockers = 1',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory benchmark decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory benchmark decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory benchmark decision bindings',
    );
  });

  it('requires exact testnet production-candidate claim allowance in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; measured single/batch/sharded evidence linked; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: allowed after gate pass; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; ' +
          'Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact testnet production-candidate claim denial in benchmark publication updates', () => {
    const contradictoryClaimBinding =
      'Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; ${contradictoryClaimBinding}`,
        checklistUpdates:
          `artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; ${contradictoryClaimBinding}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-ready claim denial in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; measured single/batch/sharded evidence linked; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('accepts exact scaling-claim allowance bindings in publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects benchmark publication updates that approve base-level or exchange-scale throughput claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; base-level throughput claims approved',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; exchange-scale throughput is cleared',
      }),
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; exchange-scale throughput approved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not approve base-level or exchange-scale throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not approve base-level or exchange-scale throughput claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve base-level or exchange-scale throughput claim wording',
    );
  });

  it('rejects benchmark publication updates that approve mainnet production claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; approves mainnet production benchmark deployment wording',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; accepts mainnet production benchmark launch wording',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not contain mainnet production claim wording',
    );
  });

  it('blocks benchmark publication-update evidence that closes blockers with textual zero-like terms', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; open benchmark blockers none',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; benchmark blockers resolved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
  });

  it('blocks benchmark publication-update evidence that closes blockers with numeric shorthand', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; benchmark blocker closure 0',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; benchmark blocker count 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted',
    );
  });

  it('accepts exact benchmark blocker closure bindings in publication updates', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        releaseNoteUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-release-note-update-evidence.md completed Gate 7 benchmark release-note update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0',
        checklistUpdates:
          'artifact://benchmark/completed-gate-7-benchmark-checklist-update-evidence.md completed Gate 7 benchmark checklist update evidence; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires reviewer decision summary to bound measured benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary: 'benchmark scaling claims bounded',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires exact release-supported wording in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires explicit production-ready claim handling in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready benchmark claims reviewed; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires explicit testnet production-candidate claim handling in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claims reviewed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires explicit production throughput claim handling in benchmark reviewer summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claims blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in benchmark summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim allowed: no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in benchmark summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim allowed: no; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('requires production throughput claim handling rather than claim-allowed shorthand in benchmark summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim allowed: no',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: approved; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that approve production throughput benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: allowed',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production throughput claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that close production throughput claim handling with no shorthand', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: no; open benchmark blocker handling: 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production throughput claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('requires exact Production throughput claim allowed binding in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        productionThroughputClaimAllowed: 'no',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production throughput claim allowed = no',
    );
  });

  it('requires exact Scaling claims allowed binding in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        scalingClaimsAllowed: 'yes',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Scaling claims allowed = yes',
    );
  });

  it('requires exact Mainnet-grade evidence linked binding in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        mainnetGradeEvidenceLinked: 'no',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Mainnet-grade evidence linked = no',
    );
  });

  it('blocks reviewer decision summaries with approval terms before production throughput claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; approved production throughput claims',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
  });

  it('allows reviewer decision summaries that approve absence of broader throughput contexts', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'production throughput claim handling: blocked; Production throughput claim allowed = no; ' +
          'open benchmark blocker handling: 0; Open benchmark blockers = 0; ' +
          'absence of production throughput claims approved by reviewer; ' +
          'absence of full parallel L1 settlement approved by reviewer',
      }),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('blocks reviewer decision summaries that approve throughput after an exact denial', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'production throughput claim handling: blocked; Production throughput claim allowed = no, but production throughput claims approved; ' +
          'open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
  });

  it('blocks reviewer decision summaries with active approval verbs before benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; reviewer supports production throughput claims; reviewer allows full parallel L1 settlement',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks benchmark claim approvals after local negations in the same reviewer summary segment', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: not allowed but approved production throughput claims; full parallel L1 settlement is not approved but cleared full parallel L1 settlement',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks reviewer decision summaries with grant-family approval terms around benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; reviewer grants production throughput claims; full parallel L1 settlement granted',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks reviewer decision summaries with copula approval terms around benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; production throughput claims are authorized; full parallel L1 settlement is cleared',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks reviewer decision summaries that certify benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; production throughput claims certified; full parallel L1 settlement certified',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks reviewer decision summaries that endorse benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; production throughput claims endorsed; full parallel L1 settlement recommended; exchange-scale throughput accredited',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve base-level or exchange-scale throughput claim wording',
    );
  });

  it('blocks reviewer decision summaries that approve base-level or exchange-scale throughput claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; exchange-scale throughput approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve base-level or exchange-scale throughput claim wording',
    );
  });

  it('blocks reviewer decision summaries that approve full parallel L1 settlement claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; full parallel L1 settlement approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('blocks benchmark reviewer text with compatibility-normalized full parallel L1 settlement approval wording', () => {
    const fullParallelApproval =
      '\uFF46\uFF55\uFF4C\uFF4C \uFF50\uFF41\uFF52\uFF41\uFF4C\uFF4C\uFF45\uFF4C L1 settlement approved';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: ' +
          'Production-ready claim allowed = no; testnet production-candidate claim handling: ' +
          'Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; ' +
          `Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0; ${fullParallelApproval}`,
      }),
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed |',
        `| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed; ${fullParallelApproval} |`,
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('allows reviewer decision summaries and notes that approve absent broader benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: ' +
          'Production-ready claim allowed = no; testnet production-candidate claim handling: ' +
          'Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; ' +
          'Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0; ' +
          'reviewer approved absence of production throughput claims; ' +
          'reviewer approved absent full parallel L1 settlement; ' +
          'reviewer approved absence of exchange-scale throughput',
      }),
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed; reviewer approved absence of production throughput claims |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed; reviewer approved absence of exchange-scale throughput |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed; reviewer approved absent full parallel L1 settlement |',
      ].join('\n'),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve lack of broader benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: ' +
          'Production-ready claim allowed = no; testnet production-candidate claim handling: ' +
          'Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; ' +
          'Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0; ' +
          'lack of production throughput claims approved by reviewer; ' +
          'reviewer approved lack of full parallel L1 settlement; ' +
          'reviewer approved lacking exchange-scale throughput',
      }),
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed; lack of production throughput claims approved by reviewer |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed; reviewer approved lacking exchange-scale throughput |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed; reviewer approved lack of full parallel L1 settlement |',
      ].join('\n'),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve evidence lacks broader benchmark claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; ' +
          'Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: ' +
          'Production-ready claim allowed = no; testnet production-candidate claim handling: ' +
          'Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; ' +
          'Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0; ' +
          'evidence lacks production throughput claims approved by reviewer; ' +
          'reviewer approved evidence lacks full parallel L1 settlement; ' +
          'reviewer approved evidence lacks exchange-scale throughput',
      }),
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed; evidence lacks production throughput claims approved by reviewer |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed; reviewer approved evidence lacks exchange-scale throughput |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed; reviewer approved evidence lacks full parallel L1 settlement |',
      ].join('\n'),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('blocks reviewer decision summaries that leave benchmark blockers open', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blockers: 1 live-batch blocker accepted',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blockers must be 0',
    );
  });

  it('blocks reviewer decision summaries that close benchmark blockers with textual zero-like terms', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blockers none',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blockers must be 0',
    );
  });

  it('blocks reviewer decision summaries that close benchmark blockers while leaving them pending', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: Open benchmark blockers = 0; open benchmark blockers pending reviewer follow-up',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blockers must be 0',
    );
  });

  it('blocks reviewer decision summaries that close benchmark blockers while reporting a nonzero blocker count', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: Open benchmark blockers = 0; benchmark blocker count 1 unresolved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blockers must be 0',
    );
  });

  it('requires exact open benchmark blocker handling in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blocker handling must be 0',
    );
  });

  it('requires exact Open benchmark blockers binding in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked; open benchmark blocker handling: 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Open benchmark blockers = 0',
    );
  });

  it('accepts exact Open benchmark blockers binding inside reviewer blocker handling', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        reviewerDecisionSummary:
          'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires reviewer decision summaries to close open benchmark blockers explicitly', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: '0',
        reviewerDecisionSummary:
          'release support: institutional reference; measured single/batch/sharded evidence bounds scaling claims; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; production throughput claim handling: blocked',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: open benchmark blocker handling must be 0',
    );
  });

  it('blocks linked benchmark evidence rows that leave benchmark blockers open', () => {
    const openBlocker = 'open benchmark blockers 1 unresolved';
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        `artifact://benchmark/single-claim-settlement-baseline.log; ${openBlocker}`,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        `artifact://benchmark/dup-inputs-are-lane-local.log; ${openBlocker}`,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        `artifact://benchmark/contextextension-var-count.log; ${openBlocker}`,
      ),
      publicationDecision: publicationDecisionRows({
        releaseNoteUpdates:
          `artifact://benchmark/gate-7-benchmark-release-notes-update.md completed Gate 7 benchmark release-note update evidence; ${openBlocker}`,
        checklistUpdates:
          `artifact://benchmark/gate-7-benchmark-checklist-update.md completed Gate 7 benchmark checklist update evidence; ${openBlocker}`,
      }),
      reviewers: reviewerRows.replace(
        'benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured',
        `benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; ${openBlocker}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: required evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not include contradictory benchmark failure markers',
    );
  });

  it.each([
    'Open benchmark blockers = 0/1',
    'open benchmark blocker handling: 0/1',
  ])('blocks linked benchmark evidence rows that keep blocker count placeholder %s', placeholder => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      commandRows: linkedCommandRows.replace(
        '| npm run check | PASS exit code 0 | artifact://benchmark/npm-run-check-output.log; npm run check command output PASS exit code 0 | linked |',
        `| npm run check | PASS exit code 0 | artifact://benchmark/npm-run-check-output.log; npm run check command output PASS exit code 0; ${placeholder} | linked |`,
      ),
      metricRows: linkedMetricRows.replace(
        'artifact://benchmark/single-claim-settlement-baseline.log',
        `artifact://benchmark/single-claim-settlement-baseline.log; ${placeholder}`,
      ),
      shardedRows: shardedLaneRows.replace(
        'artifact://benchmark/dup-inputs-are-lane-local.log',
        `artifact://benchmark/dup-inputs-are-lane-local.log; ${placeholder}`,
      ),
      bottlenecks: bottleneckRows.replace(
        'artifact://benchmark/contextextension-var-count.log',
        `artifact://benchmark/contextextension-var-count.log; ${placeholder}`,
      ),
      reviewers: reviewerRows.replace(
        'benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured',
        `benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; ${placeholder}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Metric Table: Single-claim settlement baseline: evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Sharded Lane Evidence: DUP inputs are lane-local: required evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Bottleneck Register: ContextExtension var count: Current evidence must not leave benchmark blockers open',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not leave benchmark blockers open',
    );
  });

  it('constrains benchmark scaling and production throughput claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'institutional reference',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        scalingClaimsAllowed: 'no',
        productionReadyClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'yes',
        mainnetGradeEvidenceLinked: 'no',
        openBenchmarkBlockers: '1 live-batch blocker',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not exceed Benchmark Classification release level',
    );
    expect(result.errors).toContain(
      'Publication Decision: Scaling claims allowed must be yes before Gate 7 evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden',
    );
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Production throughput claim allowed must be no; Gate 7 benchmark evidence only supports bounded measured scaling claims',
    );
    expect(result.errors).toContain(
      'Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass',
    );
  });

  it('requires open benchmark blockers to be the exact numeric zero', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        openBenchmarkBlockers: 'none',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass',
    );
  });

  it('always blocks mainnet production-ready benchmark claims even with mainnet-grade evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'yes',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden',
    );
  });

  it('blocks production throughput and mainnet-grade benchmark claim fields for testnet candidate evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'yes',
        mainnetGradeEvidenceLinked: 'yes',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production throughput claim allowed must be no; Gate 7 benchmark evidence only supports bounded measured scaling claims',
    );
    expect(result.errors).toContain(
      'Publication Decision: Mainnet-grade evidence linked must be no; Gate 7 evidence must not imply mainnet cost, latency, or capacity support',
    );
  });

  it('blocks testnet production-candidate benchmark evidence when reviewer summary omits exact release support binding', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'no',
        reviewerDecisionSummary:
          'release supported: production deployment candidate; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact institutional-reference release support in reviewer decision summaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'institutional reference',
        reviewerDecisionSummary:
          'release supported: institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; ' +
          'Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('allows testnet production-candidate claims without mainnet production-ready evidence', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'no',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('blocks production deployment candidate support in Publication Decision when environment is not testnet', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'no',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Benchmark Classification Environment = testnet',
    );
  });

  it('blocks production deployment candidate support without exact testnet production-candidate approval', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'yes',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires production-candidate benchmark classifications to carry exact release support', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      trustPath: 'trustless burn proof path',
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'institutional reference',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'no',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'no',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate benchmark requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks testnet production-candidate claims below candidate support', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      publicationDecision: publicationDecisionRows({
        releaseSupported: 'institutional reference',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        productionThroughputClaimAllowed: 'no',
        mainnetGradeEvidenceLinked: 'no',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires production deployment candidate support',
    );
  });

  it('rejects reviewer sign-off notes that approve benchmark production claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows
        .replace(
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; production-ready benchmark claim approved |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; mainnet production release accepted |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; production throughput claims approved |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve production throughput claim wording',
    );
  });

  it('rejects reviewer sign-off notes that approve full parallel L1 settlement claims', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; full parallel L1 settlement approved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('rejects reviewer sign-off notes with approval terms before benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows
        .replace(
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; approved production throughput claims |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; approved benchmark full parallel L1 settlement |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('rejects reviewer sign-off notes with active approval verbs before benchmark claim subjects', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows
        .replace(
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; reviewer supports production throughput claims |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; reviewer allows benchmark full parallel L1 settlement |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not approve production throughput claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('rejects reviewer sign-off notes with grant-family approval terms around benchmark claim subjects', () => {
    const productionThroughputResult = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; reviewer grants production throughput claims',
      ),
    }));

    const fullParallelResult = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; full parallel L1 settlement granted |',
      ].join('\n'),
    }));

    expect(productionThroughputResult.status).toBe('BLOCKED');
    expect(productionThroughputResult.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not approve production throughput claim wording',
    );
    expect(fullParallelResult.status).toBe('BLOCKED');
    expect(fullParallelResult.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('allows reviewer sign-off notes that explicitly deny full parallel L1 settlement grants', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; full parallel L1 settlement not granted; reviewer did not grant benchmark full parallel L1 settlement |',
      ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer sign-off notes that approve absence of broader throughput contexts', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows
        .replace(
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
          '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; absence of production throughput claims approved by reviewer |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; absence of benchmark full parallel L1 settlement approved by reviewer |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('rejects reviewer sign-off notes with copula approval terms around benchmark claim subjects', () => {
    const productionThroughputResult = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured; production throughput claims are authorized',
      ),
    }));

    const fullParallelResult = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: [
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked; full parallel L1 settlement is cleared |',
      ].join('\n'),
    }));

    expect(productionThroughputResult.status).toBe('BLOCKED');
    expect(productionThroughputResult.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: notes must not approve production throughput claim wording',
    );
    expect(fullParallelResult.status).toBe('BLOCKED');
    expect(fullParallelResult.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  });

  it('requires reviewer decisions', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: '| Benchmark owner | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Benchmark owner: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Benchmark owner: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Benchmark owner: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Benchmark owner | reviewer-a | block | 2026-05-14 | benchmark blocker blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass',
    );
  });

  it('rejects generic benchmark reviewer notes that do not cite concrete metrics or claim boundaries', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must cite benchmark metrics, scaling limits, live batch evidence, or the claims boundary',
    );
  });

  it('requires reviewer notes to state concrete benchmark outcomes', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | scoped evidence reviewed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete benchmark outcome',
    );
  });

  it('rejects reviewer notes with contradictory benchmark failure markers', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory benchmark failure markers',
    );
  });

  it('rejects reviewer notes with contradictory exact benchmark decision bindings', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded; Scaling claims allowed = yes; Scaling claims allowed = no |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory benchmark decision bindings',
    );
  });

  it('requires benchmark owner sign-off to match the benchmark classification identity', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Benchmark owner | reviewer-a | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
        '| Benchmark owner | reviewer-b | approve | 2026-05-14 | benchmark metrics confirmed: single-claim settlement baseline and batch settlement measured |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Benchmark owner: name must match Benchmark Classification Reviewer',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | benchmark bottleneck confirmed: ContextExtension var count remains bounded |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the benchmark classification date', () => {
    const result = validateBenchmarkEvidence(benchmarkEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-13 | benchmark claims boundary confirmed: restricted benchmark claim handling remains blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: Date must not be before Benchmark Classification Date',
    );
  });
});

function publicationDecisionRows(overrides: {
  releaseSupported?: string;
  scalingClaimsAllowed?: string;
  productionReadyClaimAllowed?: string;
  testnetProductionCandidateClaimAllowed?: string;
  productionThroughputClaimAllowed?: string;
  mainnetGradeEvidenceLinked?: string;
  openBenchmarkBlockers?: string;
  releaseNotesUpdated?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  reviewerDecisionSummary?: string;
} = {}): string {
  const releaseSupported = overrides.releaseSupported ?? 'institutional reference';
  const scalingClaimsAllowed = overrides.scalingClaimsAllowed ?? 'yes';
  const productionReadyClaimAllowed = overrides.productionReadyClaimAllowed ?? 'no';
  const testnetProductionCandidateClaimAllowed = overrides.testnetProductionCandidateClaimAllowed ?? 'no';
  const productionThroughputClaimAllowed = overrides.productionThroughputClaimAllowed ?? 'no';
  const mainnetGradeEvidenceLinked = overrides.mainnetGradeEvidenceLinked ?? 'no';
  const publicationUpdateBindings = [
    ...(releaseSupported === 'production deployment candidate'
      ? ['Release supported = production deployment candidate']
      : []),
    ...(scalingClaimsAllowed === 'yes' ? ['Scaling claims allowed = yes'] : []),
    ...(productionReadyClaimAllowed === 'no' ? ['Production-ready claim allowed = no'] : []),
    ...(testnetProductionCandidateClaimAllowed === 'yes' || testnetProductionCandidateClaimAllowed === 'no'
      ? [`Testnet production-candidate claim allowed = ${testnetProductionCandidateClaimAllowed}`]
      : []),
    ...(productionThroughputClaimAllowed === 'no' ? ['Production throughput claim allowed = no'] : []),
    ...(mainnetGradeEvidenceLinked === 'no' ? ['Mainnet-grade evidence linked = no'] : []),
  ];
  const defaultReleaseNoteUpdates = [
    'artifact://benchmark/gate-7-benchmark-release-notes-update.md completed Gate 7 benchmark release-note update evidence',
    ...publicationUpdateBindings,
  ].join('; ');
  const defaultChecklistUpdates = [
    'artifact://benchmark/gate-7-benchmark-checklist-update.md completed Gate 7 benchmark checklist update evidence',
    ...publicationUpdateBindings,
  ].join('; ');

  return [
    ['Release supported', releaseSupported],
    ['Scaling claims allowed', scalingClaimsAllowed],
    ['Production-ready claim allowed', productionReadyClaimAllowed],
    ['Testnet production-candidate claim allowed', testnetProductionCandidateClaimAllowed],
    ['Production throughput claim allowed', productionThroughputClaimAllowed],
    ['Mainnet-grade evidence linked', mainnetGradeEvidenceLinked],
    ['Open benchmark blockers', overrides.openBenchmarkBlockers ?? '0'],
    ['Release notes updated', overrides.releaseNotesUpdated ?? 'yes'],
    [
      'Required release-note updates',
      overrides.releaseNoteUpdates ?? defaultReleaseNoteUpdates,
    ],
    [
      'Required checklist updates',
      overrides.checklistUpdates ?? defaultChecklistUpdates,
    ],
    [
      'Reviewer decision summary',
      overrides.reviewerDecisionSummary ??
        'Release supported = institutional reference; measured single/batch/sharded evidence bounds scaling claims; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: 0; Open benchmark blockers = 0',
    ],
  ].map(([field, value]) => `| ${field} | ${value} |`).join('\n');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
