import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { describe, it, expect } from 'vitest';
import {
  checkNodeUrlAlignment,
  checkBatchEnabled,
  checkBatchMaxClaims,
  checkMinConfirmations,
  checkSecretMaterialInspection,
  checkSignerPresence,
  checkSignerMatch,
  formatEnvCheckReport,
  type EnvCheckResult,
} from './devnet-session-env.js';

// ---------------------------------------------------------------------------
// Node URL alignment
// ---------------------------------------------------------------------------

describe('checkNodeUrlAlignment', () => {
  it('PASS when all three are set and equal', () => {
    const r = checkNodeUrlAlignment('http://127.0.0.1:9051', 'http://127.0.0.1:9051', 'http://127.0.0.1:9051');
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('aligned');
  });

  it('PASS ignores trailing slash differences', () => {
    const r = checkNodeUrlAlignment('http://127.0.0.1:9051/', 'http://127.0.0.1:9051', 'http://127.0.0.1:9051/');
    expect(r.status).toBe('PASS');
  });

  it('WARN when mismatched', () => {
    const r = checkNodeUrlAlignment('http://127.0.0.1:9051', 'http://127.0.0.1:9052', 'http://127.0.0.1:9051');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('mismatched');
  });

  it('WARN when none set', () => {
    const r = checkNodeUrlAlignment(undefined, undefined, undefined);
    expect(r.status).toBe('WARN');
  });

  it('WARN when some missing but rest aligned', () => {
    const r = checkNodeUrlAlignment('http://127.0.0.1:9051', undefined, 'http://127.0.0.1:9051');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('ERGO_NODE_URL');
  });
});

// ---------------------------------------------------------------------------
// Batch config
// ---------------------------------------------------------------------------

describe('checkBatchEnabled', () => {
  it('PASS when true', () => {
    expect(checkBatchEnabled('true').status).toBe('PASS');
  });

  it('WARN when not set', () => {
    expect(checkBatchEnabled(undefined).status).toBe('WARN');
  });

  it('WARN when false', () => {
    expect(checkBatchEnabled('false').status).toBe('WARN');
  });
});

describe('checkBatchMaxClaims', () => {
  it('PASS when <= 10', () => {
    expect(checkBatchMaxClaims('10').status).toBe('PASS');
  });

  it('WARN when > 10', () => {
    const r = checkBatchMaxClaims('15');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('exceeds');
  });

  it('WARN when not set', () => {
    expect(checkBatchMaxClaims(undefined).status).toBe('WARN');
  });

  it('WARN when invalid', () => {
    expect(checkBatchMaxClaims('abc').status).toBe('WARN');
  });
});

// ---------------------------------------------------------------------------
// Confirmations
// ---------------------------------------------------------------------------

describe('checkMinConfirmations', () => {
  it('PASS when small for devnet', () => {
    expect(checkMinConfirmations('1').status).toBe('PASS');
  });

  it('WARN when high', () => {
    const r = checkMinConfirmations('20');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('high');
  });

  it('WARN when not set', () => {
    expect(checkMinConfirmations(undefined).status).toBe('WARN');
  });
});

// ---------------------------------------------------------------------------
// Signer presence
// ---------------------------------------------------------------------------

describe('checkSecretMaterialInspection', () => {
  it('WARNs that secret material inspection is skipped by default', () => {
    const r = checkSecretMaterialInspection(false);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('disabled by default');
    expect(r.detail).toContain('no mnemonic env values or node config files are read');
  });

  it('WARNs when explicitly enabled for local devnet only', () => {
    const r = checkSecretMaterialInspection(true);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('--include-secret-material');
    expect(r.detail).toContain('local devnet only');
  });
});

describe('checkSignerPresence', () => {
  it('PASS when set', () => {
    const r = checkSignerPresence(true);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('not shown');
  });

  it('WARN when missing', () => {
    expect(checkSignerPresence(false).status).toBe('WARN');
  });
});

// ---------------------------------------------------------------------------
// Signer/mining match
// ---------------------------------------------------------------------------

describe('checkSignerMatch', () => {
  it('PASS when addresses match', () => {
    const r = checkSignerMatch('3WwAddr', '3WwAddr');
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('match');
  });

  it('WARN when mismatch', () => {
    const r = checkSignerMatch('3WwAddr1', '3WwAddr2');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('mismatch');
  });

  it('WARN when relayer address missing', () => {
    expect(checkSignerMatch(null, '3WwAddr').status).toBe('WARN');
  });

  it('WARN when mining address missing', () => {
    expect(checkSignerMatch('3WwAddr', null).status).toBe('WARN');
  });
});

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

describe('formatEnvCheckReport', () => {
  it('produces ASCII-only output', () => {
    const results: EnvCheckResult[] = [
      { status: 'PASS', label: 'Test', detail: 'ok' },
      { status: 'WARN', label: 'Test2', detail: 'not ok' },
    ];
    const report = formatEnvCheckReport(results);
    for (const ch of report) {
      expect(ch.charCodeAt(0)).toBeLessThan(128);
    }
  });

  it('does not contain mnemonic words', () => {
    const results: EnvCheckResult[] = [
      { status: 'PASS', label: 'WALLET_MNEMONIC', detail: 'set (value not shown)' },
    ];
    const report = formatEnvCheckReport(results);
    const dangerousWords = ['drill', 'grab', 'fiber', 'curtain', 'grace', 'pudding',
      'thank', 'cruise', 'elder', 'picnic', 'eight', 'ozone'];
    for (const word of dangerousWords) {
      expect(report.toLowerCase()).not.toContain(word);
    }
  });

  it('shows ALL CHECKS PASS when no warnings', () => {
    const results: EnvCheckResult[] = [
      { status: 'PASS', label: 'A', detail: 'ok' },
    ];
    const report = formatEnvCheckReport(results);
    expect(report).toContain('ALL CHECKS PASS');
  });

  it('shows WARN count when warnings present', () => {
    const results: EnvCheckResult[] = [
      { status: 'PASS', label: 'A', detail: 'ok' },
      { status: 'WARN', label: 'B', detail: 'not ok' },
    ];
    const report = formatEnvCheckReport(results);
    expect(report).toContain('1 PASS, 1 WARN');
  });
});

describe('devnet session env CLI', () => {
  it('does not read node config or mnemonic material in default mode', () => {
    const trapDir = mkdtempSync(join(process.cwd(), 'tmp-devnet-env-trap-'));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATCHED_DEVNET_NODE_CONFIG: trapDir,
      ERGO_NODE: 'http://127.0.0.1:9051',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
      PATCHED_ERGO_NODE_URL: 'http://127.0.0.1:9051',
      AGGREGATE_BATCH_ENABLED: 'true',
      AGGREGATE_BATCH_MAX_CLAIMS: '10',
      AGGREGATE_ANCHOR_MIN_CONFIRMATIONS: '1',
    };
    delete env.WALLET_MNEMONIC;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/devnet-session-env-check.ts',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Secret material inspection: disabled by default');
      expect(result.stdout).toContain('Signer/mining alignment: not inspected');
      expect(result.stdout).not.toContain(trapDir);
      expect(result.stdout).not.toContain(basename(trapDir));
    } finally {
      rmSync(trapDir, { recursive: true, force: true });
    }
  });

  it('prints the explicit secret-material flag in help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/devnet-session-env-check.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:devnet:env');
    expect(result.stdout).toContain('--include-secret-material');
    expect(result.stdout).toContain('Default mode does not read WALLET_MNEMONIC values');
  });
});
