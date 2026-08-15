import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('aggregate e2e runner safety', () => {
  const source = readFileSync(join(process.cwd(), 'src/scripts/e2e-aggregate-settlement.ts'), 'utf8');

  it('does not load dotenv before patched-devnet evidence commands', () => {
    expect(source).not.toContain("import 'dotenv/config'");
    expect(source).not.toContain('dotenv/config');
    expect(source).toContain('Environment must be supplied by the shell');
    expect(source).toContain('this runner does not load .env');
  });

  it('allowlists only diagnostics and historical confirmation before opening state or RPC clients', () => {
    expect(source).toContain("'anchor-env'");
    expect(source).toContain("'anchor-check'");
    expect(source).toContain("'prepare'");
    expect(source).toContain("'confirm'");

    const main = source.indexOf('async function main(): Promise<void>');
    const allowlist = source.indexOf('if (!supportedNonSubmissionCommands.has(command)) usage();', main);
    const stateOpen = source.indexOf('const state = new StateTracker(', main);
    const ergoClient = source.indexOf('const ergo = new ErgoClient()', main);

    expect(main).toBeGreaterThanOrEqual(0);
    expect(allowlist).toBeGreaterThan(main);
    expect(allowlist).toBeLessThan(stateOpen);
    expect(allowlist).toBeLessThan(ergoClient);
  });

  for (const command of ['trigger', 'check', 'submit', 'run', 'import-pegout']) {
    it(`rejects removed ${command} command before runtime composition`, () => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'src/scripts/e2e-aggregate-settlement.ts', command],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            Path: process.env.Path,
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            BRIDGE_BROADCAST_ENABLED: 'true',
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage:');
      expect(result.stderr).not.toContain('Aggregate E2E complete');
    });
  }

  it('keeps every new V1 diagnostic unsigned and away from the node checker', () => {
    expect(source).toContain(
      'No command in this runner signs, checks, submits, or broadcasts a new V1 payout.',
    );
    expect(source).not.toContain("if (command === 'check')");
    expect(source).not.toContain('signAndCheck(');
    expect(source).not.toContain('/fleet-signer.js');
    expect(source).not.toContain('/transactions/check');
    expect(source).not.toContain('E2E_AGGREGATE_SIGNING_ENABLED');
    expect(source).not.toContain('signAndSubmit(');
    expect(source).not.toContain('submitExplicitAggregate');
    expect(source).not.toContain('assertE2eBroadcastAllowed');
  });

  it('retains confirmation only for an already-submitted historical transaction', () => {
    const confirmBranch = source.indexOf("if (command === 'confirm')");
    expect(confirmBranch).toBeGreaterThanOrEqual(0);
    expect(source.slice(confirmBranch)).toContain('waitForSettlementConfirmation(');
    expect(source).toContain('[historical reconciliation only]');
  });
});
