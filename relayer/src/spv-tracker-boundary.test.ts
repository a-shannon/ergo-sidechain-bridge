import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

describe('SPV tracker public boundary evidence', () => {
  it('exposes the public-boundary command through npm scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(pkg.scripts['trustless:spv-tracker-boundary']).toBe(
      'tsx src/scripts/trustless-spv-tracker-boundary.ts',
    );
  });

  it('keeps the script independent from runtime state and secret-bearing inputs', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/scripts/trustless-spv-tracker-boundary.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/dotenv|better-sqlite3|axios|ErgoClient|deployed_state|bridge-state\.sqlite/i);
    expect(source).toContain('resolveEvidenceOutputPath');
    expect(source).toContain("'wx'");
  });

  it('emits a bounded SPV tracker public-boundary report without local runtime state', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-spv-tracker-boundary.ts',
        '--public-boundary',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('# Gate 5 SPV Tracker Public Boundary Report');
    expect(result.stdout).toContain('| Command | npm run trustless:spv-tracker-boundary -- --public-boundary |');
    expect(result.stdout).toContain('| Result | BOUNDARY_ONLY |');
    expect(result.stdout).toContain('| SPV tracker key/value/proof shape checked | yes |');
    expect(result.stdout).toContain('| Runtime database opened | no |');
    expect(result.stdout).toContain('| Deployment state opened | no |');
    expect(result.stdout).toContain('| Secret or environment file read | no |');
    expect(result.stdout).toContain('| Node, RPC, or explorer request performed | no |');
    expect(result.stdout).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    expect(result.stdout).toContain('| Gate 5 closure allowed | no |');
    expect(result.stdout).toContain('| SPV relay or tracker evidence completed | no |');
    expect(result.stdout).toContain('Tracker value decodes to bridgeEventRoot and Ergo anchor height');
    expect(result.stdout).not.toContain('bridge-state.sqlite');
    expect(result.stdout).not.toContain('deployed_state');
    expect(result.stdout).not.toContain('ergo-source');
  });

  it('writes the public-boundary report to a repository evidence target', () => {
    const tmpDir = mkdtempSync(join(process.cwd(), '.tmp-spv-tracker-boundary-'));
    const target = `${basename(tmpDir)}/boundary-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-spv-tracker-boundary.ts',
          '--public-boundary',
          '--out',
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      const report = readFileSync(join(process.cwd(), target), 'utf8');
      expect(report).toContain('# Gate 5 SPV Tracker Public Boundary Report');
      expect(report).toContain('| Result | BOUNDARY_ONLY |');
      expect(report).toContain('This is prerequisite evidence only.');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
