import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  collectOfflineBenchmarkMetricRows,
  formatOfflineBenchmarkMetricReport,
} from './scripts/showcase-metric-rows.js';

describe('offline benchmark metric rows showcase', () => {
  it('collects size and latency evidence for single and batch settlement rows', () => {
    const report = collectOfflineBenchmarkMetricRows();

    expect(report.single.sampleCount).toBe(3);
    expect(report.single.transactionShapeBytes).toBeGreaterThan(0);
    expect(report.single.meanBuildTimeMs).toBeGreaterThanOrEqual(0);
    expect(report.single.costRelevantCounts).toContain('inputs=3 outputs=4 vars=15 batch=1');
    expect(report.single.proofSize).toContain('tracker proof');
    expect(report.single.latency).toContain('offline build latency');

    expect(report.batch.sampleCount).toBe(3);
    expect(report.batch.transactionShapeBytes).toBeGreaterThan(report.single.transactionShapeBytes);
    expect(report.batch.meanBuildTimeMs).toBeGreaterThanOrEqual(0);
    expect(report.batch.costRelevantCounts).toContain('inputs=3 outputs=13 vars=58 batch=10');
    expect(report.batch.proofSize).toContain('claim cores 1090 B');
    expect(report.batch.throughput).toContain('10 settlements per Ergo block');

    expect(report.sharded.sampleCount).toBe(3);
    expect(report.sharded.transactionShapeBytes).toBeGreaterThan(0);
    expect(report.sharded.meanBuildTimeMs).toBeGreaterThanOrEqual(0);
    expect(report.sharded.costRelevantCounts).toContain('inputs=6 outputs=16 vars=66 batch=10');
    expect(report.sharded.proofSize).toContain('max lane claim cores');
    expect(report.sharded.proofSize).toContain('lane claim split 4 + 6');
    expect(report.sharded.throughput).toContain('10 planned settlements across 2 lanes');
  });

  it('prints the release-evidence boundary without importing runtime state loaders', () => {
    const output = formatOfflineBenchmarkMetricReport(collectOfflineBenchmarkMetricRows());
    expect(output).toContain('Bridge Offline Benchmark Metric Rows');
    expect(output).toContain('Unsigned EIP-12 JSON transaction shape');
    expect(output).toContain('no node calls');
    expect(output).toContain('no signing');
    expect(output).toContain('no broadcast');
    expect(output).toContain('does not support production throughput');

    const source = readFileSync(new URL('./scripts/showcase-metric-rows.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('dotenv/config');
    expect(source).not.toContain('loadDeployedState');
    expect(source).not.toContain('bridge-state.sqlite');
    expect(source).not.toContain('Database(');
    expect(source).not.toContain('readFileSync(');
  });

  it('writes completed metric-row evidence to a repository target', () => {
    const tmpDir = mkdtempSync(join(process.cwd(), '.tmp-showcase-metric-rows-'));
    const target = `${basename(tmpDir)}/metric-rows.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/showcase-metric-rows.ts',
          '--out',
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const report = readFileSync(join(process.cwd(), target), 'utf8');
      expect(report).toContain('# Completed Offline Benchmark Metric Rows');
      expect(report).toContain('| Command | npm run showcase:metric-rows -- --out <report.md> |');
      expect(report).toContain('| Result | PASS |');
      expect(report).toContain('| Node calls | none |');
      expect(report).toContain('| Runtime database opened | no |');
      expect(report).toContain('| Deployment state opened | no |');
      expect(report).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
      expect(report).toContain('| Single-claim settlement baseline | 3 |');
      expect(report).toContain('| Batch settlement | 3 |');
      expect(report).toContain('| Sharded lanes planner | 3 |');
      expect(report).toContain('inputs=3 outputs=4 vars=15 batch=1');
      expect(report).toContain('inputs=3 outputs=13 vars=58 batch=10');
      expect(report).toContain('inputs=6 outputs=16 vars=66 batch=10');
      expect(report).toContain('does not authorize production throughput');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
