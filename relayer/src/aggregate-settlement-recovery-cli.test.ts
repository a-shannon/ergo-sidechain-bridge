import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import { formatRecoveryScanRow, parseRecoveryCliArgs } from './aggregate-settlement-recovery-cli.js';

describe('aggregate settlement recovery CLI', () => {
  it('parses scan as the default read-only observation command', () => {
    expect(parseRecoveryCliArgs(['scan'])).toEqual({
      command: 'scan',
      stateDbPath: './bridge-state.sqlite',
      json: false,
    });
  });

  it('parses explicit scan and apply options', () => {
    expect(parseRecoveryCliArgs(['scan', '--state-db', 'custom.sqlite', '--json'])).toEqual({
      command: 'scan',
      stateDbPath: 'custom.sqlite',
      json: true,
    });
    expect(parseRecoveryCliArgs(['apply', '--json'])).toEqual({
      command: 'apply',
      stateDbPath: './bridge-state.sqlite',
      json: true,
    });
  });

  it('parses explicit abandon command options', () => {
    const expectedTxId = 'aa'.repeat(32);

    expect(parseRecoveryCliArgs(['abandon', expectedTxId, '--state-db', 'custom.sqlite', '--json'])).toEqual({
      command: 'abandon',
      expectedTxId,
      stateDbPath: 'custom.sqlite',
      json: true,
    });
  });

  it('rejects missing command and malformed options', () => {
    expect(() => parseRecoveryCliArgs([])).toThrow(/Usage:/);
    expect(() => parseRecoveryCliArgs(['apply', '--state-db'])).toThrow(/requires a path/);
    expect(() => parseRecoveryCliArgs(['scan', '--unknown'])).toThrow(/unknown option/);
    expect(() => parseRecoveryCliArgs(['abandon'])).toThrow(/requires an expected transaction id/);
  });

  it('blocks unsafe CLI state database targets before opening local files', () => {
    const stateDbTarget = '../operator/private-key.sqlite';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/aggregate-settlement-recovery.ts',
        'scan',
        '--state-db',
        stateDbTarget,
        '--json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'aggregate settlement recovery: --state-db <blocked state-db target> must not target secret-bearing material',
    );
    expect(result.stderr).not.toContain(stateDbTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('fails closed when recovery commands target a missing database', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/aggregate-settlement-recovery.ts',
        'apply',
        '--state-db',
        'missing-recovery-state.sqlite',
        '--json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'aggregate settlement recovery: --state-db must reference an existing SQLite database',
    );
    expect(result.stderr).not.toContain('missing-recovery-state.sqlite');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('formats scan rows with explicit observation status and finality depth', () => {
    const expectedTxId = 'aa'.repeat(32);
    const inclusionHeaderId = 'dd'.repeat(32);
    const tipHeaderId = 'ee'.repeat(32);

    expect(formatRecoveryScanRow({
      mode: 'batch',
      status: 'submitted',
      expectedTxId,
      submittedTxId: expectedTxId,
      lookupTxId: expectedTxId,
      burnTxHashes: ['bb'.repeat(32), 'cc'.repeat(32)],
      confirmedChain: true,
      mempool: false,
      canonical: true,
      unconfirmed: false,
      observationStatus: 'confirmed_pre_finality',
      confirmations: 9,
      requiredConfirmations: 10,
      inclusionHeight: 100,
      inclusionHeaderId,
      observedTipHeight: 108,
      observedTipHeaderId: tipHeaderId,
    })).toBe(
      `submitted batch expected=${expectedTxId} observation=confirmed_pre_finality confirmations=9/10 inclusion=100@${inclusionHeaderId} tip=108@${tipHeaderId} mempool=no burns=${'bb'.repeat(32)},${'cc'.repeat(32)}`,
    );
  });
});
