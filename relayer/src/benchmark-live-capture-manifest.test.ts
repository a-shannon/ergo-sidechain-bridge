import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildBenchmarkLiveCaptureManifest,
  formatBenchmarkLiveCaptureManifestMarkdown,
} from './benchmark-live-capture-manifest.js';

describe('Gate 7 live benchmark capture manifest', () => {
  it('formats a blocked live-batch sequence without emitting a legacy submit command', () => {
    const manifest = buildBenchmarkLiveCaptureManifest({
      sourceCommit: 'abcdef1',
      prerequisiteMapTarget: '../evidence/benchmarks/map.md',
      prerequisiteMapMarkdown: prerequisiteMapMarkdown(),
      reviewPacketTarget: '../evidence/benchmarks/review.md',
      reviewPacketMarkdown: reviewPacketMarkdown(),
      readinessRequestTarget: '../evidence/readiness/request.md',
      command: 'npm run benchmark:live-capture-manifest -- --source-commit abcdef1 --out <manifest.md>',
    });

    const markdown = formatBenchmarkLiveCaptureManifestMarkdown(manifest);
    expect(markdown).toContain('# Gate 7 Live Benchmark Capture Manifest - abcdef1');
    expect(markdown).toContain('| Gate 7 prerequisite map | ../evidence/benchmarks/map.md | BLOCKED with 6 structural issues |');
    expect(markdown).toContain('Bind live-batch identity inputs');
    expect(markdown).toContain('npm run settle:aggregate -- prepare-batch');
    expect(markdown).toContain('Record the settlement-profile blocker');
    expect(markdown.indexOf('Unsigned legacy shape diagnostic')).toBeLessThan(
      markdown.indexOf('Record the settlement-profile blocker'),
    );
    expect(markdown).toContain('Replacement-profile target-node acceptance');
    expect(markdown).toContain('No current command: define and review a profile-specific package');
    expect(markdown).not.toContain('npm run settle:aggregate -- check-with-ingest');
    expect(markdown).toContain('npm run benchmark:validate -- <completed-benchmark-evidence.md>');
    expect(markdown).toContain('| Concrete next capture order defined | yes |');
    expect(markdown).toContain('| Completed Gate 7 benchmark evidence claimed | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |');
    expect(markdown).toContain('| Legacy V1 submission quarantine | active |');
    expect(markdown).toContain('| Open benchmark blockers | at least 1 |');
    expect(markdown).toContain('| Testnet production-candidate claim allowed | no |');
    expect(markdown).toContain('Live submit blocked');
    expect(markdown).not.toContain('npm run settle:aggregate -- submit');
    expect(markdown).not.toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a guarded capture manifest from existing Gate 7 planning packets', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-benchmark-live-capture-manifest-'));
    try {
      const prerequisiteMap = join(basename(dir), 'map.md');
      const reviewPacket = join(basename(dir), 'review.md');
      const readinessRequest = join(basename(dir), 'readiness-request.md');
      const out = join(basename(dir), 'manifest.md');
      writeFileSync(join(process.cwd(), prerequisiteMap), prerequisiteMapMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), reviewPacket), reviewPacketMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), readinessRequest), '# Readiness Request\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/benchmark-live-capture-manifest.ts',
          '--source-commit',
          'abcdef1',
          '--prerequisite-map',
          prerequisiteMap,
          '--review-packet',
          reviewPacket,
          '--readiness-request',
          readinessRequest,
          '--out',
          out,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Gate 7 blocked benchmark capture manifest written');
      expect(result.stdout).toContain('Prerequisite structural issues: 6');
      const manifest = readFileSync(join(process.cwd(), out), 'utf8');
      expect(manifest).toContain('# Gate 7 Live Benchmark Capture Manifest - abcdef1');
      expect(manifest).toContain('| Current readiness operator request |');
      expect(manifest).toContain('| Secret or environment file read | no |');
      expect(manifest).not.toContain('C:\\');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function prerequisiteMapMarkdown(): string {
  return [
    '# Gate 7 Live Batch Benchmark Prerequisite Map - abcdef1',
    '',
    '## Validation Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Candidate target | ../evidence/benchmarks/candidate.md |',
    '| Result | BLOCKED |',
    '| Structural issues | 6 |',
  ].join('\n');
}

function reviewPacketMarkdown(): string {
  return [
    '# Gate 7 Live Benchmark Review Packet - abcdef1',
    '',
    '## Source Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Current result | BLOCKED |',
    '| Structural issues | 6 |',
    '| Live batch issues | 1 |',
    '| Reviewer approval issues | 3 |',
    '| Publication-boundary issues | 2 |',
  ].join('\n');
}
