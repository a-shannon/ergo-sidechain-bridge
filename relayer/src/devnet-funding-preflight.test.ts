import { spawnSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import {
  classifyFunding,
  classifyDeployReadiness,
  classifyNodeOffline,
  classifySignerMissing,
  sumPureErgBalance,
  formatErg,
  formatFundingReport,
  DEVNET_MIN_FUNDING_NANOERG,
  DEVNET_COMFORTABLE_FUNDING_NANOERG,
} from './devnet-funding-preflight.js';

describe('classifyFunding', () => {
  it('returns PASS when balance >= comfortable', () => {
    const r = classifyFunding(DEVNET_COMFORTABLE_FUNDING_NANOERG);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('comfortable');
  });

  it('returns PASS when balance >= minimum but < comfortable', () => {
    const r = classifyFunding(DEVNET_MIN_FUNDING_NANOERG);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('minimum');
  });

  it('returns WARN when balance < minimum', () => {
    const r = classifyFunding(10_000_000n);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('below');
  });

  it('returns WARN for zero balance', () => {
    const r = classifyFunding(0n);
    expect(r.status).toBe('WARN');
  });
});

describe('classifyNodeOffline', () => {
  it('returns WARN with offline message', () => {
    const r = classifyNodeOffline('http://127.0.0.1:9051');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('offline');
  });
});

describe('classifySignerMissing', () => {
  it('returns WARN for missing signer', () => {
    const r = classifySignerMissing('WALLET_MNEMONIC not set');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('WALLET_MNEMONIC');
  });
});

describe('sumPureErgBalance', () => {
  it('sums only boxes without tokens', () => {
    const boxes = [
      { value: '10000000' },
      { value: '20000000', assets: [{ tokenId: 'abc', amount: 1 }] },
      { value: 5000000n },
    ];
    // token box (20M) is excluded
    expect(sumPureErgBalance(boxes)).toBe(15_000_000n);
  });

  it('counts boxes with empty assets array', () => {
    const boxes = [
      { value: '10000000', assets: [] },
      { value: '5000000' },
    ];
    expect(sumPureErgBalance(boxes)).toBe(15_000_000n);
  });

  it('returns 0n for empty array', () => {
    expect(sumPureErgBalance([])).toBe(0n);
  });

  it('returns 0n when all boxes have tokens', () => {
    const boxes = [
      { value: '50000000', assets: [{ tokenId: 'x', amount: 1 }] },
    ];
    expect(sumPureErgBalance(boxes)).toBe(0n);
  });
});

describe('formatErg', () => {
  it('formats whole ERG correctly', () => {
    expect(formatErg(1_000_000_000n)).toBe('1.0');
  });

  it('formats fractional ERG correctly', () => {
    expect(formatErg(150_000_000n)).toBe('0.15');
  });

  it('formats zero correctly', () => {
    expect(formatErg(0n)).toBe('0.0');
  });

  it('formats small amounts correctly', () => {
    expect(formatErg(1_100_000n)).toBe('0.0011');
  });
});

describe('formatFundingReport', () => {
  it('produces ASCII-only output', () => {
    const r = classifyFunding(100_000_000n);
    const report = formatFundingReport(r, '3WwDummyAddress', 'http://127.0.0.1:9051');
    for (const ch of report) {
      expect(ch.charCodeAt(0)).toBeLessThan(128);
    }
  });

  it('includes address and node URL when provided', () => {
    const r = classifyFunding(500_000_000n);
    const report = formatFundingReport(r, 'myAddr', 'http://localhost:9051');
    expect(report).toContain('myAddr');
    expect(report).toContain('localhost:9051');
  });
});

describe('classifyDeployReadiness', () => {
  it('returns PASS when P2PK >= 0.5 ERG', () => {
    const r = classifyDeployReadiness(500_000_000n, 0n);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('Ready to deploy');
  });

  it('returns PASS with large P2PK even if reward is 0', () => {
    const r = classifyDeployReadiness(1_000_000_000n, 0n);
    expect(r.status).toBe('PASS');
  });

  it('returns WARN when P2PK < 0.5 ERG but reward exists', () => {
    const r = classifyDeployReadiness(100_000_000n, 5_000_000_000n);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('consolidate-rewards');
  });

  it('returns WARN when P2PK is 0 and reward is high', () => {
    const r = classifyDeployReadiness(0n, 67_500_000_000n);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('consolidate-rewards');
  });

  it('returns WARN when both P2PK and reward are 0', () => {
    const r = classifyDeployReadiness(0n, 0n);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('no controlled funds');
  });

  it('does not return PASS for P2PK between min and comfortable', () => {
    // 0.15 ERG is above DEVNET_MIN but below DEVNET_COMFORTABLE
    // With the new logic, this should be WARN (not PASS)
    const r = classifyDeployReadiness(150_000_000n, 1_000_000_000n);
    expect(r.status).toBe('WARN');
  });

  it('uses ASCII-only strings in detail', () => {
    const cases = [
      classifyDeployReadiness(0n, 0n),
      classifyDeployReadiness(0n, 1_000_000_000n),
      classifyDeployReadiness(500_000_000n, 0n),
    ];
    for (const r of cases) {
      for (const ch of r.detail) {
        expect(ch.charCodeAt(0)).toBeLessThan(128);
      }
    }
  });
});

describe('devnet funding preflight CLI', () => {
  it('does not read mnemonic material in default mode', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      WALLET_MNEMONIC: 'not a valid mnemonic phrase for this test',
      PATCHED_ERGO_NODE_URL: 'http://127.0.0.1:9051',
    };

    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/devnet-funding-preflight.ts',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('secret material inspection disabled by default');
    expect(result.stdout).toContain('--address <relayer-address>');
    expect(result.stdout).toContain('--include-secret-material');
    expect(result.stdout).not.toContain('Funding preflight error');
    expect(result.stdout).not.toContain('not a valid mnemonic');
  });

  it('prints no-secret address mode in help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/devnet-funding-preflight.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:devnet:funding');
    expect(result.stdout).toContain('--address <relayer-address>');
    expect(result.stdout).toContain('--include-secret-material');
    expect(result.stdout).toContain('Default mode does not read WALLET_MNEMONIC values');
  });
});
