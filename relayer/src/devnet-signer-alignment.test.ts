import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  parseMinerRewardDelay,
  hasTestMnemonicField,
  parseDevnetConfig,
  checkSignerAlignment,
  classifyAlignment,
  classifyMiningTargetAlignment,
  classifyConfigMissing,
  formatConfigPathForReport,
  formatIdentifierForReport,
  formatAlignmentReport,
  type FullAlignmentResult,
} from './devnet-signer-alignment.js';

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

describe('parseMinerRewardDelay', () => {
  it('extracts minerRewardDelay = 1', () => {
    const conf = `
      chain {
        monetary {
          minerRewardDelay = 1
        }
      }
    `;
    expect(parseMinerRewardDelay(conf)).toBe(1);
  });

  it('extracts minerRewardDelay = 720', () => {
    expect(parseMinerRewardDelay('minerRewardDelay = 720')).toBe(720);
  });

  it('returns null when field is missing', () => {
    expect(parseMinerRewardDelay('some other config')).toBeNull();
  });
});

describe('hasTestMnemonicField', () => {
  it('detects testMnemonic field', () => {
    const conf = 'testMnemonic = "word1 word2 word3"';
    expect(hasTestMnemonicField(conf)).toBe(true);
  });

  it('returns false when missing', () => {
    expect(hasTestMnemonicField('wallet { }')).toBe(false);
  });
});

describe('parseDevnetConfig', () => {
  it('parses both fields from realistic config', () => {
    const conf = `
ergo {
  chain {
    monetary {
      minerRewardDelay = 1
    }
  }
  wallet {
    testMnemonic = "fake words here"
    testKeysQty = 5
  }
}`;
    const result = parseDevnetConfig(conf);
    expect(result.hasTestMnemonic).toBe(true);
    expect(result.minerRewardDelay).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mining target alignment (the primary check)
// ---------------------------------------------------------------------------

describe('classifyMiningTargetAlignment', () => {
  it('PASS when mining target matches Fleet signer', () => {
    const r = classifyMiningTargetAlignment('3WwFleet', '3WwFleet');
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('matches Fleet signer');
  });

  it('WARN when mining target differs from Fleet signer', () => {
    const r = classifyMiningTargetAlignment('3WwFleet', '3WwOther');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('differs');
  });

  it('WARN when Fleet signer is null', () => {
    const r = classifyMiningTargetAlignment(null, '3WwTarget');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('WALLET_MNEMONIC');
  });

  it('WARN when mining target is null', () => {
    const r = classifyMiningTargetAlignment('3WwFleet', null);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('DEVNET_MINING_TARGET not set');
    expect(r.detail).toContain('BIP-44');
  });
});

// ---------------------------------------------------------------------------
// Legacy alignment classification (config-only)
// ---------------------------------------------------------------------------

describe('classifyAlignment', () => {
  it('PASS when addresses match (notes BIP-44 warning)', () => {
    const r = classifyAlignment('3WwAddr1', '3WwAddr1');
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('match');
    expect(r.detail).toContain('miningPubKeyHex');
  });

  it('WARN when addresses differ', () => {
    const r = classifyAlignment('3WwAddr1', '3WwAddr2');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('differ');
  });

  it('WARN when relayer address missing', () => {
    const r = classifyAlignment(null, '3WwAddr2');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('WALLET_MNEMONIC');
  });

  it('WARN when mining address missing', () => {
    const r = classifyAlignment('3WwAddr1', null);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('testMnemonic');
  });

  it('WARN when both missing', () => {
    const r = classifyAlignment(null, null);
    expect(r.status).toBe('WARN');
  });
});

describe('classifyConfigMissing', () => {
  it('returns WARN with sanitized path', () => {
    const r = classifyConfigMissing('/some/path/application.conf');
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('.../path/application.conf');
    expect(r.detail).not.toContain('/some/path');
  });
});

describe('formatConfigPathForReport', () => {
  it('redacts absolute Windows user paths', () => {
    const syntheticWindowsPath = [
      'Z:',
      'redacted-home',
      'workspace',
      'ergo-source',
      'src',
      'main',
      'resources',
      'node1',
      'application.conf',
    ].join('\\');
    const formatted = formatConfigPathForReport(syntheticWindowsPath);
    expect(formatted).toBe('.../node1/application.conf');
    expect(formatted).not.toContain('redacted-home');
  });

  it('keeps simple relative file names readable', () => {
    expect(formatConfigPathForReport('application.conf')).toBe('application.conf');
  });
});

describe('formatIdentifierForReport', () => {
  it('redacts long addresses and pubkeys in report output', () => {
    const longId = '3Ww' + 'A'.repeat(48) + 'Tail99';
    const formatted = formatIdentifierForReport(longId);
    expect(formatted).toBe('3WwAAAAA...Tail99');
    expect(formatted).not.toContain('A'.repeat(20));
  });

  it('keeps short synthetic labels readable in tests', () => {
    expect(formatIdentifierForReport('3WwFleet')).toBe('3WwFleet');
  });
});

describe('checkSignerAlignment', () => {
  it('still evaluates mining target alignment when node config is missing', async () => {
    const result = await checkSignerAlignment(
      null,
      '/missing/application.conf',
      null,
      16,
      '02'.repeat(33),
      '3WwTarget',
    );

    expect(result.configExists).toBe(false);
    expect(result.alignment.status).toBe('WARN');
    expect(result.alignment.detail).toContain('config not found');
    expect(result.miningTargetAlignment).not.toBeNull();
    expect(result.miningTargetAlignment?.status).toBe('WARN');
    expect(result.miningTargetAlignment?.detail).toContain('WALLET_MNEMONIC');
  });
});

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

describe('formatAlignmentReport', () => {
  const baseResult: FullAlignmentResult = {
    alignment: { status: 'PASS', label: 'Devnet signer alignment (config-only)', detail: 'match' },
    miningTargetAlignment: { status: 'PASS', label: 'Devnet mining target', detail: 'mining target matches Fleet signer: 3WwFleet' },
    configExists: true,
    configPath: '/some/path',
    hasTestMnemonic: true,
    minerRewardDelay: 1,
    miningAddress: '3WwMining',
    relayerAddress: '3WwFleet',
    miningTarget: '3WwFleet',
  };

  it('produces ASCII-only output', () => {
    const report = formatAlignmentReport(baseResult);
    for (const ch of report) {
      expect(ch.charCodeAt(0)).toBeLessThan(128);
    }
  });

  it('does not expose raw local config paths', () => {
    const syntheticWindowsPath = [
      'Z:',
      'redacted-home',
      'workspace',
      'ergo-source',
      'src',
      'main',
      'resources',
      'node1',
      'application.conf',
    ].join('\\');
    const result: FullAlignmentResult = {
      ...baseResult,
      configPath: syntheticWindowsPath,
    };
    const report = formatAlignmentReport(result);
    expect(report).toContain('Config: .../node1/application.conf');
    expect(report).not.toContain('redacted-home');
  });

  it('does not contain any mnemonic words', () => {
    const report = formatAlignmentReport(baseResult);
    const dangerousWords = ['drill', 'grab', 'fiber', 'curtain', 'grace', 'pudding',
      'thank', 'cruise', 'elder', 'picnic', 'eight', 'ozone'];
    for (const word of dangerousWords) {
      expect(report.toLowerCase()).not.toContain(word);
    }
  });

  it('includes mining target in output', () => {
    const report = formatAlignmentReport(baseResult);
    expect(report).toContain('3WwFleet');
    expect(report).toContain('Mining target');
  });

  it('redacts long signer identifiers in output', () => {
    const longAddress = '3Ww' + 'B'.repeat(48) + 'Last77';
    const result: FullAlignmentResult = {
      ...baseResult,
      relayerAddress: longAddress,
      miningTarget: longAddress,
      miningAddress: longAddress,
      miningTargetAlignment: {
        status: 'PASS',
        label: 'Devnet mining target',
        detail: `mining target matches Fleet signer: ${formatIdentifierForReport(longAddress)}`,
      },
      alignment: {
        status: 'PASS',
        label: 'Devnet signer alignment (config-only)',
        detail: `Fleet-derived addresses match: ${formatIdentifierForReport(longAddress)}`,
      },
    };

    const report = formatAlignmentReport(result);
    expect(report).toContain('3WwBBBBB...Last77');
    expect(report).not.toContain('B'.repeat(20));
  });

  it('includes node-wallet signing prohibition', () => {
    const report = formatAlignmentReport(baseResult);
    expect(report).toContain('Do not use node-wallet signing');
  });

  it('shows INFO when miningTargetAlignment is null', () => {
    const result: FullAlignmentResult = {
      ...baseResult,
      miningTargetAlignment: null,
      miningTarget: null,
    };
    const report = formatAlignmentReport(result);
    expect(report).toContain('DEVNET_MINING_TARGET not set');
  });
});

describe('devnet signer alignment CLI', () => {
  it('does not read node config or mnemonic material in default mode', () => {
    const trapDir = mkdtempSync(join(process.cwd(), 'tmp-devnet-signer-trap-'));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATCHED_DEVNET_NODE_CONFIG: trapDir,
      WALLET_MNEMONIC: 'not a valid mnemonic phrase for this test',
      DEVNET_MINING_TARGET: '02'.repeat(33),
    };

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/devnet-signer-alignment.ts',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('not inspected -- secret material inspection disabled');
      expect(result.stdout).toContain('--include-secret-material');
      expect(result.stdout).not.toContain('not a valid mnemonic');
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
        'src/scripts/devnet-signer-alignment.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:devnet:signer');
    expect(result.stdout).toContain('--include-secret-material');
    expect(result.stdout).toContain('Default mode does not read WALLET_MNEMONIC values');
  });
});
