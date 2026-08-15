import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildBenchmarkLiveExecutionRequestCommand,
  buildBenchmarkLiveExecutionRequestReport,
  formatBenchmarkLiveExecutionRequestMarkdown,
  validateBenchmarkLiveCaptureManifestForExecution,
  validateBenchmarkLiveExecutionRequestReportJson,
} from './benchmark-live-execution-request.js';

describe('Gate 7 live benchmark execution request', () => {
  it('turns the capture manifest into a bounded operator execution request', () => {
    const report = buildBenchmarkLiveExecutionRequestReport({
      sourceCommit: 'abcdef1',
      captureManifestTarget: '../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-06-abcdef1.md',
      captureManifestMarkdown: captureManifestMarkdown(),
      command: buildBenchmarkLiveExecutionRequestCommand({
        sourceCommit: 'abcdef1',
        captureManifest: '../evidence/benchmarks/manifest.md',
        out: '../evidence/benchmarks/request.md',
        jsonOut: '../evidence/benchmarks/artifacts/request.json',
      }),
    });
    const markdown = formatBenchmarkLiveExecutionRequestMarkdown(report);

    expect(report.status).toBe('LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.candidateTarget).toBe('../evidence/benchmarks/candidate.md');
    expect(report.captureManifestPrerequisiteResult).toBe('BLOCKED with 6 structural issues');
    expect(report.captureManifestStructuralIssues).toBe(6);
    expect(report.reviewPacketStatus).toBe('1 live issue, 3 reviewer approval issues, 2 publication-boundary issues');
    expect(report.readinessRequestTarget).toBe('../evidence/readiness/request.md');
    expect(report.operatorRequests).toHaveLength(7);
    expect(report.operatorRequests[0].phase).toBe('1. Bind live-batch identity inputs');
    expect(report.operatorRequests[1].phase).toBe('2. Produce unsigned legacy shape diagnostics');
    expect(report.operatorRequests[2].phase).toBe('3. Record the legacy settlement quarantine');
    expect(report.evidenceTargetsToProduce[0]).toBe('../evidence/benchmarks/artifacts/<gate7-live-batch-identity-packet.md>');
    expect(report.evidenceTargetsToProduce).toContain('../evidence/benchmarks/artifacts/<gate7-legacy-v1-unsigned-shape.json>');
    expect(report.evidenceTargetsToProduce.indexOf('../evidence/benchmarks/artifacts/<gate7-legacy-v1-unsigned-shape.json>')).toBeLessThan(
      report.evidenceTargetsToProduce.indexOf('../evidence/benchmarks/artifacts/<gate7-legacy-v1-quarantine.md>'),
    );
    expect(report.forbiddenInputs).toContain(
      'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.',
    );
    expect(report.boundary['Secret or environment file read']).toBe('no');
    expect(report.boundary['Runtime database opened by request command']).toBe('no');
    expect(report.boundary['Private deployment state opened by request command']).toBe('no');
    expect(report.boundary['Live transaction signing performed']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed']).toBe('no');
    expect(validateBenchmarkLiveExecutionRequestReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Gate 7 Live Benchmark Execution Request - BLOCKED');
    expect(markdown).toContain('| Capture manifest structural issues | 6 |');
    expect(markdown).toContain('Bind live-batch identity inputs');
    expect(markdown).toContain('without signing, node checking, Expected transaction ID generation');
    expect(markdown).toContain('Define replacement-profile target-node acceptance');
    expect(markdown).toContain('Do not provide .env values');
    expect(markdown).toContain('Live execution blocked');
    expect(markdown).not.toContain('npm run settle:aggregate -- submit');
    expect(markdown).not.toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects reports that flip secret, runtime-state, signing, or broadcast boundaries', () => {
    const report = buildBenchmarkLiveExecutionRequestReport({
      sourceCommit: 'abcdef1',
      captureManifestTarget: '../evidence/benchmarks/manifest.md',
      captureManifestMarkdown: captureManifestMarkdown(),
      command: 'npm run benchmark:live-execution-request -- --source-commit abcdef1',
    });

    const errors = validateBenchmarkLiveExecutionRequestReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Secret or environment file read': 'yes',
        'Runtime database opened by request command': 'yes',
        'Private deployment state opened by request command': 'yes',
        'Live transaction signing performed': 'yes',
        'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'yes',
      },
    });

    expect(errors).toContain('--live-benchmark-request-json report.boundary.Secret or environment file read must be no');
    expect(errors).toContain('--live-benchmark-request-json report.boundary.Runtime database opened by request command must be no');
    expect(errors).toContain('--live-benchmark-request-json report.boundary.Private deployment state opened by request command must be no');
    expect(errors).toContain('--live-benchmark-request-json report.boundary.Live transaction signing performed must be no');
    expect(errors).toContain(
      '--live-benchmark-request-json report.boundary.Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed must be no',
    );
  });

  it('rejects stale manifest or report instructions that re-enable legacy V1 submission', () => {
    const staleManifest = captureManifestMarkdown().replace(
      'BLOCKED: no legacy V1 submit command is emitted',
      'npm run settle:aggregate -- submit-batch <expectedTxId> <burn-a> <burn-b>',
    );
    expect(validateBenchmarkLiveCaptureManifestForExecution(staleManifest)).toContain(
      '--capture-manifest must not contain a legacy V1 submit command or broadcast-enable instruction',
    );

    const report = buildBenchmarkLiveExecutionRequestReport({
      sourceCommit: 'abcdef1',
      captureManifestTarget: '../evidence/benchmarks/manifest.md',
      captureManifestMarkdown: captureManifestMarkdown(),
      command: 'npm run benchmark:live-execution-request -- --source-commit abcdef1',
    });
    const tampered = {
      ...report,
      operatorRequests: report.operatorRequests.map((request, index) => index === 0
        ? { ...request, operatorAction: 'Set BRIDGE_BROADCAST_ENABLED=true and submit' }
        : request),
    };
    expect(validateBenchmarkLiveExecutionRequestReportJson(tampered)).toContain(
      '--live-benchmark-request-json report must not contain a legacy V1 submit command or broadcast-enable instruction',
    );
  });

  it('writes guarded Markdown and JSON output from an existing capture manifest', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-live-benchmark-request-'));
    try {
      const captureManifest = join(basename(dir), 'capture-manifest.md');
      const out = join(basename(dir), 'request.md');
      const jsonOut = join(basename(dir), 'request.json');
      writeFileSync(join(process.cwd(), captureManifest), captureManifestMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/benchmark-live-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 7 Live Benchmark Execution Request - BLOCKED');
      expect(result.stdout).toContain('- blocked benchmark execution request JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(process.cwd(), out))).toBe(true);
      expect(existsSync(join(process.cwd(), jsonOut))).toBe(true);
      const written = JSON.parse(readFileSync(join(process.cwd(), jsonOut), 'utf8'));
      expect(written.status).toBe('LIVE_BENCHMARK_EXECUTION_REQUEST_BLOCKED');
      expect(written.exitCode).toBe(1);
      expect(written.captureManifestStructuralIssues).toBe(6);
      expect(written.boundary['Secret or environment file read']).toBe('no');
      expect(written.boundary['Live transaction signing performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the capture manifest is not a Gate 7 live benchmark manifest', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-live-benchmark-request-invalid-'));
    try {
      const captureManifest = join(basename(dir), 'capture-manifest.md');
      writeFileSync(join(process.cwd(), captureManifest), '# Other Manifest\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/benchmark-live-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--capture-manifest must be a Gate 7 Live Benchmark Capture Manifest');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function captureManifestMarkdown(): string {
  return [
    '# Gate 7 Live Benchmark Capture Manifest - abcdef1',
    '',
    '## Current Inputs',
    '',
    '| Input | Current target | Capture status |',
    '| --- | --- | --- |',
    '| Source commit | `abcdef1` | reference only |',
    '| Gate 7 candidate | ../evidence/benchmarks/candidate.md | source evidence candidate |',
    '| Gate 7 prerequisite map | ../evidence/benchmarks/map.md | BLOCKED with 6 structural issues |',
    '| Gate 7 review packet | ../evidence/benchmarks/review.md | 1 live issue, 3 reviewer approval issues, 2 publication-boundary issues |',
    '| Current readiness operator request | ../evidence/readiness/request.md | remaining operator inputs |',
    '',
    '## Capture Sequence',
    '',
    '| Phase | Command or artifact to produce | Required concrete binding | Stop condition |',
    '| --- | --- | --- | --- |',
    '| 1. Bind live-batch identity inputs | identity packet | network and ordered burn set | Block if targetless |',
    '| 2. Unsigned legacy shape diagnostic | npm run settle:aggregate -- prepare-batch | no-check, no-sign, no-authority | Block on authority claim |',
    '| 3. Record the settlement-profile blocker | quarantine artifact | legacy V1 route disabled | approval cannot lift quarantine |',
    '| 4. Replacement-profile target-node acceptance | blocked pending activation | exact chain state and source finality | stop while open |',
    '| 7. Live submit blocked | BLOCKED: no legacy V1 submit command is emitted | corrected profile required | stop unconditionally |',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Planning output only | yes |',
    '| Secret or environment file read | no |',
    '| Runtime database opened | no |',
    '| Private deployment state opened | no |',
    '| Live transaction signing performed | no |',
    '| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |',
  ].join('\n');
}

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
