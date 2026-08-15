import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

describe('extension injection public boundary', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/scripts/spikes/spike6-extension-injection-viability.ts'),
    'utf8',
  );

  it('keeps public-boundary mode before local ergo-source inspection', () => {
    const boundaryCheck = source.indexOf('if (args.publicBoundary)');
    const sourceInspection = source.indexOf('const ergoRoot = findErgoSourceRoot()');

    expect(boundaryCheck).toBeGreaterThan(-1);
    expect(sourceInspection).toBeGreaterThan(boundaryCheck);
  });

  it('emits a bounded 0x0401 public-boundary report without local source checkout', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/spikes/spike6-extension-injection-viability.ts',
        '--public-boundary',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('# Gate 5 0x04 Extension Public Boundary Report');
    expect(result.stdout).toContain('| Result | BOUNDARY_ONLY |');
    expect(result.stdout).toContain('| Command | npm run trustless:extension-boundary -- --public-boundary |');
    expect(result.stdout).toContain('| Local Ergo source checkout read | no |');
    expect(result.stdout).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    expect(result.stdout).toContain('| Gate 5 closure allowed | no |');
    expect(result.stdout).toContain('| Node patch requirement resolved | no |');
    expect(result.stdout).toContain('0x0401 participates in Scorex-compatible extension Merkle root');
    expect(result.stdout).not.toContain('ergo-source not found');
    expect(result.stdout).not.toContain('ergo-source:');
  });

  it('writes the public-boundary report to a repository evidence target', () => {
    const tmpDir = mkdtempSync(join(process.cwd(), '.tmp-extension-boundary-'));
    const target = `${basename(tmpDir)}/boundary-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/spikes/spike6-extension-injection-viability.ts',
          '--public-boundary',
          '--out',
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      const report = readFileSync(join(process.cwd(), target), 'utf8');
      expect(report).toContain('# Gate 5 0x04 Extension Public Boundary Report');
      expect(report).toContain('| Result | BOUNDARY_ONLY |');
      expect(report).toContain('This is prerequisite evidence only.');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
