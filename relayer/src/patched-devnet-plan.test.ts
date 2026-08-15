import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

describe('patched devnet command plan', () => {
  it('routes redacted signer and funding outputs through the Gate 3 summary without deployment', () => {
    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/scripts/patched-devnet-plan.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
    expect(result.stdout).toContain('npm.cmd run rehearsal:local-devnet-signer-funding-summary');
    expect(result.stdout).toContain('--signer-output ../evidence/live-rehearsals/<redacted-signer-output.md>');
    expect(result.stdout).toContain('--funding-output ../evidence/live-rehearsals/<redacted-funding-output.md>');
    expect(result.stdout).toContain(
      '--execution-request ../evidence/rehearsal/gate3-local-devnet-execution-request.md',
    );
    expect(result.stdout).toContain('--secret-material-scope "scoped private local operator shell; no values serialized"');
    expect(result.stdout).toContain('$env:ERGO_API_KEY = "<operator-local-devnet-api-key-not-for-evidence>"');
    expect(result.stdout).toContain('do not serialize its value into evidence');
    expect(result.stdout).toContain('Legacy V1 signing, node checking, submission, and broadcast are retired.');
    expect(result.stdout).toContain('npm.cmd run e2e:aggregate -- prepare <sidechainTxHash>');
    expect(result.stdout).not.toContain('E2E_AGGREGATE_SIGNING_ENABLED');
    expect(result.stdout).not.toContain('npm.cmd run e2e:aggregate -- trigger');
    expect(result.stdout).not.toContain('npm.cmd run e2e:aggregate -- check');
    expect(result.stdout).not.toContain('npm.cmd run e2e:aggregate -- submit');
    expect(result.stdout).not.toContain('924beb2c');
    expect(result.stdout).not.toContain('$env:ERGO_API_KEY = "hello"');
    expect(result.stdout.split(/\r?\n/).filter(line => /[ \t]$/.test(line))).toEqual([]);

    const signerCheck = result.stdout.indexOf('npm.cmd run demo:devnet:signer -- --include-secret-material');
    const summary = result.stdout.indexOf('npm.cmd run rehearsal:local-devnet-signer-funding-summary');
    expect(signerCheck).toBeGreaterThanOrEqual(0);
    expect(summary).toBeGreaterThan(signerCheck);
    expect(result.stdout).not.toContain('npm.cmd run deploy');
  });

  it('writes guarded Markdown and JSON plan artifacts without executing the plan', () => {
    const parentDir = join(process.cwd(), '..', 'evidence', 'rehearsal');
    mkdirSync(parentDir, { recursive: true });
    const dir = mkdtempSync(join(parentDir, 'tmp-patched-devnet-plan-'));
    const targetDir = `../evidence/rehearsal/${basename(dir)}`;
    const out = `${targetDir}/patched-devnet-plan.md`;
    const jsonOut = `${targetDir}/patched-devnet-plan.json`;
    const executionRequest = '../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-08-test.md';
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/patched-devnet-plan.ts',
          '--execution-request',
          executionRequest,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('Patched Devnet V1 Diagnostic - Command Plan');
      expect(result.stdout).toContain('- patched devnet plan JSON report written:');
      expect(existsSync(join(dir, 'patched-devnet-plan.md'))).toBe(true);
      expect(existsSync(join(dir, 'patched-devnet-plan.json'))).toBe(true);

      const markdown = readFileSync(join(dir, 'patched-devnet-plan.md'), 'utf8');
      const report = JSON.parse(readFileSync(join(dir, 'patched-devnet-plan.json'), 'utf8'));
      expect(markdown).toContain('npm.cmd run rehearsal:local-devnet-signer-funding-summary');
      expect(markdown).toContain(`--execution-request ${executionRequest}`);
      expect(report.status).toBe('PATCHED_DEVNET_PLAN_READY');
      expect(report.command).toContain('--execution-request <gate3-request.md>');
      expect(report.boundary['Plan output only']).toBe('yes');
      expect(report.boundary['Secret or environment file read']).toBe('no');
      expect(report.boundary['Runtime database opened']).toBe('no');
      expect(report.boundary['Transaction signing performed']).toBe('no');
      expect(report.boundary['Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed']).toBe('no');
      expect(JSON.stringify(report)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
