import { describe, expect, it } from 'vitest';

import { validateBenchmarkEvidence } from './benchmark-evidence.js';
import {
  defaultBenchmarkOfflineCandidateArtifacts,
  formatGate7OfflineStructuredCandidate,
  parseCompletedOfflineBenchmarkMetricRowsReport,
  type OfflineBenchmarkMetricSnapshot,
} from './benchmark-offline-candidate.js';
import {
  parseBenchmarkOfflineCandidateArgs,
  resolveBenchmarkOfflineCandidateMetadata,
} from './scripts/benchmark-offline-candidate.js';

const metricSnapshot: OfflineBenchmarkMetricSnapshot = {
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

describe('Gate 7 offline benchmark candidate assembly', () => {
  it('can fill benchmark candidate metadata from the current local toolchain', () => {
    const args = parseBenchmarkOfflineCandidateArgs([
      '--current',
      '--out',
      '../evidence/benchmarks/gate7-offline-structured-candidate.md',
    ]);

    const resolved = resolveBenchmarkOfflineCandidateMetadata(args, {
      date: '2026-07-03',
      gitCommit: 'd08996d7',
      nodeVersion: 'v24.14.0',
      rustVersion: 'rustc 1.96.0',
      wasmPackVersion: 'wasm-pack 0.14.0',
    });

    expect(resolved).toEqual({
      artifactSuffix: '2026-07-03-d08996d7',
      date: '2026-07-03',
      gitCommit: 'd08996d7',
      nodeVersion: 'v24.14.0',
      rustVersion: 'rustc 1.96.0',
      wasmPackVersion: 'wasm-pack 0.14.0',
    });
  });

  it('keeps artifact suffix explicit when current metadata capture is not requested', () => {
    const args = parseBenchmarkOfflineCandidateArgs([
      '--git-commit',
      'd08996d7',
      '--date',
      '2026-07-03',
      '--node-version',
      'v24.14.0',
      '--rust-version',
      'rustc 1.96.0',
      '--wasm-pack-version',
      'wasm-pack 0.14.0',
      '--out',
      '../evidence/benchmarks/gate7-offline-structured-candidate.md',
    ]);

    expect(() => resolveBenchmarkOfflineCandidateMetadata(args)).toThrow('--artifact-suffix is required');
  });

  it('parses completed metric-row reports so candidate values match linked evidence', () => {
    const parsed = parseCompletedOfflineBenchmarkMetricRowsReport([
      '# Completed Offline Benchmark Metric Rows',
      '',
      '## Command Result',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Result | PASS |',
      '| Exit code | 0 |',
      '| Runtime database opened | no |',
      '| Deployment state opened | no |',
      '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
      '',
      '## Normalized Output Summary',
      '',
      '| Scenario | Sample count | Build time runs | Mean build time | Proof size | Unsigned EIP-12 JSON transaction shape | Cost-relevant counts | Throughput | Latency |',
      '|---|---:|---|---:|---|---:|---|---|---|',
      '| Single-claim settlement baseline | 3 | 9.9 ms, 9.8 ms, 9.7 ms | 9.8 ms | tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B | 2744 bytes | inputs=3 outputs=4 vars=15 batch=1 | single throughput | 9.8 ms offline build latency |',
      '| Batch settlement | 3 | 8.9 ms, 8.8 ms, 8.7 ms | 8.8 ms | tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B | 13893 bytes | inputs=3 outputs=13 vars=58 batch=10 | batch throughput | 8.8 ms offline build latency |',
      '| Sharded lanes planner | 3 | 7.9 ms, 7.8 ms, 7.7 ms | 7.8 ms | max lane tracker proof 228 B, max lane DUP lookup 67 B, max lane DUP insert 69 B, max lane claim cores 654 B, lane claim split 4 + 6 | 9073 bytes | inputs=6 outputs=16 vars=66 batch=10 | sharded throughput | 7.8 ms offline sharded planning and lane transaction-shape build latency |',
      '',
      '## Boundary',
      '',
      '- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from deterministic public offline inputs.',
      '- This is not live benchmark evidence.',
      '- This does not authorize production throughput, mainnet capacity, live settlement, trustless burn completion, or full parallel L1 settlement claims.',
      '',
    ].join('\n'));

    expect(parsed.single.meanBuildTimeMs).toBe(9.8);
    expect(parsed.single.latency).toBe('9.8 ms offline build latency');
    expect(parsed.batch.meanBuildTimeMs).toBe(8.8);
    expect(parsed.sharded.meanBuildTimeMs).toBe(7.8);

    const markdown = formatGate7OfflineStructuredCandidate({
      gitCommit: '66eac48d',
      date: '2026-06-30',
      nodeVersion: 'v24.14.0',
      rustVersion: 'rustc 1.96.0',
      wasmPackVersion: '0.14.0',
      artifacts: defaultBenchmarkOfflineCandidateArtifacts('2026-06-30-66eac48d'),
      metrics: parsed,
      metricRowsTarget: '../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md',
    });

    expect(markdown).toContain('| Metric rows source | ../evidence/benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md |');
    expect(markdown).toContain('| Single-claim settlement baseline | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md completed benchmark metric evidence; single-claim settlement baseline; sample count 3; cost counts inputs=3 outputs=4 vars=15 batch=1 | 3 | 9.8 ms |');
    expect(markdown).toContain('| Batch settlement | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md completed benchmark metric evidence; batch settlement; sample count 3; cost counts inputs=3 outputs=13 vars=58 batch=10 | 3 | 8.8 ms |');
    expect(markdown).toContain('| Sharded lanes planner | artifact://benchmarks/artifacts/completed-current-offline-metric-rows-2026-06-30-66eac48d.md completed benchmark metric evidence; sharded lanes planner; sample count 3; cost counts inputs=6 outputs=16 vars=66 batch=10 | 3 | 7.8 ms |');
  });

  it('builds a current offline candidate while keeping live and reviewer blockers explicit', () => {
    const markdown = formatGate7OfflineStructuredCandidate({
      gitCommit: 'e8c016a9',
      date: '2026-06-30',
      nodeVersion: 'v24.14.0',
      rustVersion: 'rustc 1.96.0',
      wasmPackVersion: '0.14.0',
      artifacts: defaultBenchmarkOfflineCandidateArtifacts('2026-06-30-e8c016a9'),
      metrics: metricSnapshot,
    });

    const result = validateBenchmarkEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toHaveLength(6);
    expect(result.errors).toContain('Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass');
    expect(result.errors).toContain('Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass');
    expect(result.errors).toContain('Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass');
    expect(result.classification.gitCommit).toBe('e8c016a9');
    expect(result.commandRows).toHaveLength(6);
    expect(result.metricRows).toHaveLength(4);
    expect(result.publicationDecision.openBenchmarkBlockers).toBe('5');
    expect(markdown).toContain('This is not completed Gate 7 benchmark evidence.');
    expect(markdown).toContain('Live batch settlement evidence requires explicit live approval');
    expect(markdown).toContain('Transaction broadcast, submit, deploy, or state mutation performed: no');
  });
});
