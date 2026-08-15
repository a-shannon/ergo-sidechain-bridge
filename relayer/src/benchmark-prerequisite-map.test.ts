import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import { validateBenchmarkEvidence } from './benchmark-evidence.js';
import { buildBenchmarkValidationReport } from './benchmark-evidence-report.js';
import {
  buildBenchmarkLiveReviewPacket,
  formatBenchmarkLiveReviewPacketMarkdown,
} from './benchmark-live-review-packet.js';
import {
  defaultBenchmarkOfflineCandidateArtifacts,
  formatGate7OfflineStructuredCandidate,
  type OfflineBenchmarkMetricSnapshot,
} from './benchmark-offline-candidate.js';
import {
  buildBenchmarkPrerequisiteMap,
  formatBenchmarkPrerequisiteMapMarkdown,
} from './benchmark-prerequisite-map.js';

const metrics: OfflineBenchmarkMetricSnapshot = {
  single: {
    scenario: 'Single-claim settlement baseline',
    sampleCount: 3,
    meanBuildTimeMs: 1.2,
    proofSize: 'tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B',
    transactionShapeBytes: 2744,
    costRelevantCounts: 'inputs=3 outputs=4 vars=15 batch=1',
    throughput: '1 settlement per Ergo block in the offline single-claim model',
    latency: '1.2 ms offline build latency',
  },
  batch: {
    scenario: 'Batch settlement',
    sampleCount: 3,
    meanBuildTimeMs: 1.4,
    proofSize: 'tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B',
    transactionShapeBytes: 13893,
    costRelevantCounts: 'inputs=3 outputs=13 vars=58 batch=10',
    throughput: '10 settlements per Ergo block in the offline batch model',
    latency: '1.4 ms offline build latency',
  },
  sharded: {
    scenario: 'Sharded lanes planner',
    sampleCount: 3,
    meanBuildTimeMs: 1.8,
    proofSize:
      'max lane tracker proof 228 B, max lane DUP lookup 67 B, max lane DUP insert 69 B, max lane claim cores 654 B, lane claim split 4 + 6',
    transactionShapeBytes: 9073,
    costRelevantCounts: 'inputs=6 outputs=16 vars=66 batch=10',
    throughput: '10 planned settlements across 2 lanes in the offline sharded planner',
    latency: '1.8 ms offline sharded planning and lane transaction-shape build latency',
  },
};

function offlineCandidate(commit = 'abcdef1'): string {
  return formatGate7OfflineStructuredCandidate({
    gitCommit: commit,
    date: '2026-07-02',
    nodeVersion: 'v24.14.0',
    rustVersion: 'rustc 1.96.0',
    wasmPackVersion: '0.14.0',
    artifacts: defaultBenchmarkOfflineCandidateArtifacts(`2026-07-02-${commit}`),
    metrics,
  });
}

describe('Gate 7 benchmark prerequisite map', () => {
  it('maps live-batch benchmark blockers to exact operator prerequisites', () => {
    const validation = validateBenchmarkEvidence(offlineCandidate());
    const validationReport = buildBenchmarkValidationReport({
      command: 'npm run benchmark:validate -- ../evidence/benchmarks/candidate.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/benchmarks/candidate.md',
      validation,
    });
    const map = buildBenchmarkPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/benchmarks/candidate.md',
      validatorReportTarget: '../evidence/benchmarks/artifacts/report.md',
      command: 'npm run benchmark:prerequisite-map -- --candidate ../evidence/benchmarks/candidate.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });
    const markdown = formatBenchmarkPrerequisiteMapMarkdown(map);

    expect(map.structuralIssues).toBe(6);
    expect(markdown).toContain('# Gate 7 Live Batch Benchmark Prerequisite Map - abcdef1');
    expect(markdown).toContain('Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass');
    expect(markdown).toContain('explicit live broadcast approval bound to Expected transaction ID');
    expect(markdown).toContain('Open benchmark blockers = 0');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('formats a live benchmark review packet without authorizing broadcast', () => {
    const validation = validateBenchmarkEvidence(offlineCandidate());
    const validationReport = buildBenchmarkValidationReport({
      command: 'npm run benchmark:validate -- ../evidence/benchmarks/candidate.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/benchmarks/candidate.md',
      validation,
    });
    const prerequisiteMap = buildBenchmarkPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/benchmarks/candidate.md',
      validatorReportTarget: '../evidence/benchmarks/artifacts/report.md',
      command: 'npm run benchmark:prerequisite-map -- --candidate ../evidence/benchmarks/candidate.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });
    const packet = buildBenchmarkLiveReviewPacket({
      prerequisiteMap,
      prerequisiteMapTarget: '../evidence/benchmarks/gate7-live-batch-prerequisite-map.md',
      command: 'npm run benchmark:prerequisite-map -- --candidate ../evidence/benchmarks/candidate.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md> --review-packet-out <packet.md>',
    });
    const markdown = formatBenchmarkLiveReviewPacketMarkdown(packet);

    expect(markdown).toContain('# Gate 7 Live Benchmark Review Packet - abcdef1');
    expect(markdown).toContain('Scaling claims allowed = yes');
    expect(markdown).toContain('Production-ready claim allowed = no');
    expect(markdown).toContain('Testnet production-candidate claim allowed = yes');
    expect(markdown).toContain('Production throughput claim allowed = no');
    expect(markdown).toContain('Open benchmark blockers = 0');
    expect(markdown).toContain('| Live broadcast approval granted by this packet | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a validation report, prerequisite map, and live review packet', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-benchmark-prerequisite-map-'));
    try {
      const target = join(basename(dir), 'candidate.md');
      const reportOut = join(basename(dir), 'validator-report.md');
      const mapOut = join(basename(dir), 'prerequisite-map.md');
      const reviewPacketOut = join(basename(dir), 'review-packet.md');
      writeFileSync(join(process.cwd(), target), offlineCandidate(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/benchmark-prerequisite-map.ts',
          '--candidate',
          target,
          '--validator-commit',
          'abcdef1',
          '--validator-report-out',
          reportOut,
          '--out',
          mapOut,
          '--review-packet-out',
          reviewPacketOut,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Benchmark validation report written');
      expect(result.stdout).toContain('Benchmark prerequisite map written');
      expect(result.stdout).toContain('Benchmark live review packet written');

      const report = readFileSync(join(process.cwd(), reportOut), 'utf8');
      const map = readFileSync(join(process.cwd(), mapOut), 'utf8');
      const reviewPacket = readFileSync(join(process.cwd(), reviewPacketOut), 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(map).toContain('# Gate 7 Live Batch Benchmark Prerequisite Map - abcdef1');
      expect(map).toContain('| Live batch evidence prerequisites linked | no |');
      expect(reviewPacket).toContain('# Gate 7 Live Benchmark Review Packet - abcdef1');
      expect(reviewPacket).toContain('| Live broadcast approval granted by this packet | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
