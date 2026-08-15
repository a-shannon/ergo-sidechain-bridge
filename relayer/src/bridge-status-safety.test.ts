import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('bridge status safety', () => {
  const source = readFileSync(join(process.cwd(), 'src/scripts/bridge-status.ts'), 'utf8');

  it('keeps public boundary mode before dotenv, runtime database, and deployment-state imports', () => {
    expect(source).not.toContain("import 'dotenv/config'");
    expect(source).not.toContain("import Database from 'better-sqlite3'");
    expect(source).not.toContain("import { ErgoClient }");
    expect(source).not.toContain("import { loadDeployedState");
    expect(source).toContain("await import('dotenv/config')");
    expect(source).toContain("await import('better-sqlite3')");
    expect(source).toContain("await import('../ergo-client.js')");
    expect(source).toContain("await import('../config.js')");

    const boundaryCheck = source.indexOf('if (process.argv.includes(PUBLIC_BOUNDARY_FLAG))');
    expect(boundaryCheck).toBeGreaterThan(-1);

    for (const guardedImport of [
      "await import('dotenv/config')",
      "await import('better-sqlite3')",
      "await import('../ergo-client.js')",
      "await import('../config.js')",
    ]) {
      expect(source.indexOf(guardedImport)).toBeGreaterThan(boundaryCheck);
    }
  });

  it('emits a public boundary report without opening private runtime state', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/bridge-status.ts',
        '--public-boundary',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Bridge Status Public Boundary Report');
    expect(result.stdout).toContain('| Command | npm run status -- --public-boundary |');
    expect(result.stdout).toContain('| Runtime database opened | no |');
    expect(result.stdout).toContain('| Deployment state opened | no |');
    expect(result.stdout).toContain('| Dotenv loaded | no |');
    expect(result.stdout).toContain('| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |');
  });
});
