import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import type { ErgoExtensionField } from './ergo-client.js';
import {
  buildAnchorScanResult,
  classifyExpectedRootRequirement,
  classifyAnchorStatus,
  computeScanWindow,
  filterAnchorFields,
  normalizeExtensionKey,
  normalizeExtensionValue,
  parseAnchorPreflightArgs,
  parseExpectedRoot,
} from './anchor-preflight.js';

// --- normalizeExtensionKey ---

describe('normalizeExtensionKey', () => {
  it('passes through lowercase 4-char key', () => {
    expect(normalizeExtensionKey('0401')).toBe('0401');
  });

  it('strips 0x prefix', () => {
    expect(normalizeExtensionKey('0x0401')).toBe('0401');
  });

  it('lowercases uppercase keys', () => {
    expect(normalizeExtensionKey('0401')).toBe('0401');
    expect(normalizeExtensionKey('0x0401')).toBe('0401');
    expect(normalizeExtensionKey('0X0401')).toBe('0401');
  });

  it('lowercases mixed case', () => {
    expect(normalizeExtensionKey('0A0B')).toBe('0a0b');
  });
});

// --- normalizeExtensionValue ---

describe('normalizeExtensionValue', () => {
  it('passes through lowercase hex', () => {
    expect(normalizeExtensionValue('abcdef')).toBe('abcdef');
  });

  it('strips 0x prefix', () => {
    expect(normalizeExtensionValue('0xabcdef')).toBe('abcdef');
  });

  it('lowercases uppercase hex', () => {
    expect(normalizeExtensionValue('ABCDEF')).toBe('abcdef');
  });

  it('handles 0X prefix', () => {
    expect(normalizeExtensionValue('0XABC')).toBe('abc');
  });
});

// --- parseExpectedRoot ---

describe('parseExpectedRoot', () => {
  const ROOT64 = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

  it('accepts raw 64-char hex', () => {
    const r = parseExpectedRoot(ROOT64);
    expect(r.root).toBe(ROOT64);
    expect(r.error).toBeUndefined();
  });

  it('accepts 0x-prefixed 64-char hex', () => {
    const r = parseExpectedRoot('0x' + ROOT64);
    expect(r.root).toBe(ROOT64);
    expect(r.error).toBeUndefined();
  });

  it('accepts 0401:<hex> extension pair', () => {
    const r = parseExpectedRoot('0401:' + ROOT64);
    expect(r.root).toBe(ROOT64);
    expect(r.error).toBeUndefined();
  });

  it('accepts 0x0401:<hex> extension pair', () => {
    const r = parseExpectedRoot('0x0401:' + ROOT64);
    expect(r.root).toBe(ROOT64);
    expect(r.error).toBeUndefined();
  });

  it('accepts uppercase hex', () => {
    const r = parseExpectedRoot(ROOT64.toUpperCase());
    expect(r.root).toBe(ROOT64);
  });

  it('accepts 0401:<UPPERCASE>', () => {
    const r = parseExpectedRoot('0401:' + ROOT64.toUpperCase());
    expect(r.root).toBe(ROOT64);
  });

  it('trims whitespace', () => {
    const r = parseExpectedRoot('  ' + ROOT64 + '  ');
    expect(r.root).toBe(ROOT64);
  });

  it('rejects empty input', () => {
    const r = parseExpectedRoot('');
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('empty');
  });

  it('rejects too-short hex', () => {
    const r = parseExpectedRoot('aabb');
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('32-byte hex');
  });

  it('rejects too-long hex', () => {
    const r = parseExpectedRoot(ROOT64 + 'ff');
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('32-byte hex');
  });

  it('rejects non-hex characters', () => {
    const r = parseExpectedRoot('zz'.repeat(32));
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('32-byte hex');
  });

  it('rejects wrong key prefix', () => {
    const r = parseExpectedRoot('0402:' + ROOT64);
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('not 0401');
  });

  it('rejects 0401 with too-short value', () => {
    const r = parseExpectedRoot('0401:aabb');
    expect(r.root).toBeUndefined();
    expect(r.error).toContain('32-byte hex');
  });

  it('error messages are ASCII-only', () => {
    const r = parseExpectedRoot('bad');
    // eslint-disable-next-line no-control-regex
    expect(r.error).toMatch(/^[\x00-\x7F]*$/);
  });
});

// --- parseAnchorPreflightArgs ---

describe('parseAnchorPreflightArgs', () => {
  const ROOT64 = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

  it('takes the expected root from the first positional argument', () => {
    const r = parseAnchorPreflightArgs([ROOT64]);
    expect(r.rawExpectedRoot).toBe(ROOT64);
    expect(r.allowGenericAnchorScan).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it('falls back to EXPECTED_BRIDGE_EVENT_ROOT_HEX', () => {
    const r = parseAnchorPreflightArgs([], { EXPECTED_BRIDGE_EVENT_ROOT_HEX: ` ${ROOT64} ` });
    expect(r.rawExpectedRoot).toBe(ROOT64);
    expect(r.allowGenericAnchorScan).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it('lets the CLI expected root override the env expected root', () => {
    const cliRoot = '11'.repeat(32);
    const envRoot = '22'.repeat(32);
    const r = parseAnchorPreflightArgs([cliRoot], { EXPECTED_BRIDGE_EVENT_ROOT_HEX: envRoot });
    expect(r.rawExpectedRoot).toBe(cliRoot);
  });

  it('parses explicit generic diagnostic mode from CLI flag', () => {
    const r = parseAnchorPreflightArgs(['--allow-generic-anchor-scan']);
    expect(r.rawExpectedRoot).toBeUndefined();
    expect(r.allowGenericAnchorScan).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('parses an evidence output report path', () => {
    const out = '../evidence/readiness/anchor-preflight.md';
    const r = parseAnchorPreflightArgs(['--allow-generic-anchor-scan', '--out', out]);
    expect(r.rawExpectedRoot).toBeUndefined();
    expect(r.allowGenericAnchorScan).toBe(true);
    expect(r.out).toBe(out);
    expect(r.errors).toEqual([]);
  });

  it('keeps the expected root when parsing an evidence output report path', () => {
    const out = '../evidence/readiness/anchor-preflight.md';
    const r = parseAnchorPreflightArgs([ROOT64, '--out', out]);
    expect(r.rawExpectedRoot).toBe(ROOT64);
    expect(r.out).toBe(out);
    expect(r.errors).toEqual([]);
  });

  it('parses a guarded JSON output report path', () => {
    const jsonOut = '../evidence/readiness/anchor-preflight.json';
    const r = parseAnchorPreflightArgs(['--allow-generic-anchor-scan', '--json-out', jsonOut]);
    expect(r.jsonOut).toBe(jsonOut);
    expect(r.errors).toEqual([]);
  });

  it('parses a guarded observation JSON output path', () => {
    const observationsOut = '../evidence/readiness/anchor-observations.json';
    const r = parseAnchorPreflightArgs([
      ROOT64,
      '--observations-out',
      observationsOut,
    ]);
    expect(r.rawExpectedRoot).toBe(ROOT64);
    expect(r.observationsOut).toBe(observationsOut);
    expect(r.errors).toEqual([]);
  });

  it('parses explicit node endpoint and scan bounds for reproducible evidence capture', () => {
    const r = parseAnchorPreflightArgs([
      '--allow-generic-anchor-scan',
      '--node-url',
      'http://127.0.0.1:9052',
      '--lookback-blocks',
      '144',
      '--max-scan-blocks',
      '12',
      '--min-confirmations',
      '6',
    ]);

    expect(r.nodeUrl).toBe('http://127.0.0.1:9052');
    expect(r.lookbackBlocks).toBe(144);
    expect(r.maxScanBlocks).toBe(12);
    expect(r.minConfirmations).toBe(6);
    expect(r.errors).toEqual([]);
  });

  it('rejects non-positive anchor scan bounds before opening a node', () => {
    const r = parseAnchorPreflightArgs([
      '--allow-generic-anchor-scan',
      '--lookback-blocks',
      '0',
      '--max-scan-blocks',
      '-1',
      '--min-confirmations',
      '1.5',
    ]);

    expect(r.errors).toEqual([
      '--lookback-blocks requires a positive integer',
      '--max-scan-blocks requires a positive integer',
      '--min-confirmations requires a positive integer',
    ]);
  });

  it('parses explicit generic diagnostic mode from env', () => {
    const r = parseAnchorPreflightArgs([], { ANCHOR_PREFLIGHT_ALLOW_GENERIC: '1' });
    expect(r.allowGenericAnchorScan).toBe(true);
  });

  it('rejects unknown options', () => {
    const r = parseAnchorPreflightArgs(['--unknown']);
    expect(r.errors).toEqual(['unknown anchor preflight option: --unknown']);
  });

  it('rejects --out without a value', () => {
    const r = parseAnchorPreflightArgs(['--out']);
    expect(r.errors).toEqual(['--out requires a value']);
  });

  it('rejects --json-out without a value', () => {
    const r = parseAnchorPreflightArgs(['--json-out']);
    expect(r.errors).toEqual(['--json-out requires a value']);
  });

  it('rejects --observations-out without a value', () => {
    const r = parseAnchorPreflightArgs(['--observations-out']);
    expect(r.errors).toEqual(['--observations-out requires a value']);
  });

  it('rejects multiple positional roots', () => {
    const r = parseAnchorPreflightArgs(['11'.repeat(32), '22'.repeat(32)]);
    expect(r.errors).toEqual([
      'anchor preflight accepts at most one expected bridgeEventRootHex argument',
    ]);
  });
});

describe('anchor preflight CLI JSON output', () => {
  it('writes guarded JSON output before opening a node when expected root is missing', () => {
    const jsonOut = `../evidence/readiness/tmp-anchor-preflight-output-${process.pid}-${Date.now()}.json`;
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/anchor-preflight.ts',
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('bridgeEventRootHex is required');
      expect(result.stdout).toContain('- anchor preflight JSON report written: ../evidence/readiness/');
      expect(result.stderr).toBe('');
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('FAIL');
      expect(written.exitCode).toBe(1);
      expect(written.expectedRoot.mode).toBe('missing-required-root');
      expect(written.boundary['Ergo node request attempted']).toBe('no');
      expect(written.boundary['Transaction broadcast, submit, deploy, or state mutation performed']).toBe('no');
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(jsonOutPath, { force: true });
    }
  });
});

// --- classifyExpectedRootRequirement ---

describe('classifyExpectedRootRequirement', () => {
  const ROOT64 = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

  it('passes root-bound scans when bridgeEventRootHex is provided', () => {
    const r = classifyExpectedRootRequirement(ROOT64, false);
    expect(r.status).toBe('PASS');
    expect(r.mode).toBe('root-bound');
    expect(r.message).toContain('bridgeEventRootHex');
  });

  it('fails missing expected root by default', () => {
    const r = classifyExpectedRootRequirement(undefined, false);
    expect(r.status).toBe('FAIL');
    expect(r.mode).toBe('missing-required-root');
    expect(r.message).toContain('bridgeEventRootHex is required');
  });

  it('only warns for explicit generic diagnostic scans', () => {
    const r = classifyExpectedRootRequirement(undefined, true);
    expect(r.status).toBe('WARN');
    expect(r.mode).toBe('generic-diagnostic');
    expect(r.message).toContain('diagnostic only');
    expect(r.message).toContain('cannot satisfy readiness evidence');
  });

  it('messages are ASCII-only', () => {
    const results = [
      classifyExpectedRootRequirement(ROOT64, false),
      classifyExpectedRootRequirement(undefined, false),
      classifyExpectedRootRequirement(undefined, true),
    ];
    for (const r of results) {
      // eslint-disable-next-line no-control-regex
      expect(r.message).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});

// --- filterAnchorFields ---

describe('filterAnchorFields', () => {
  const fields: ErgoExtensionField[] = [
    { key: '0100', value: 'aaa', height: 100, headerId: 'h1' },
    { key: '0401', value: 'bbb', height: 200, headerId: 'h2' },
    { key: '0402', value: 'ccc', height: 300, headerId: 'h3' },
    { key: '0401', value: 'ddd', height: 400, headerId: 'h4' },
  ];

  it('returns only fields matching the target key', () => {
    const result = filterAnchorFields(fields, '0401');
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('bbb');
    expect(result[1].value).toBe('ddd');
  });

  it('returns empty array when no matches', () => {
    expect(filterAnchorFields(fields, '0403')).toHaveLength(0);
  });

  it('handles 0x-prefixed target key', () => {
    expect(filterAnchorFields(fields, '0x0401')).toHaveLength(2);
  });
});

// --- buildAnchorScanResult ---

describe('buildAnchorScanResult', () => {
  it('returns zero count and null anchors when empty', () => {
    const result = buildAnchorScanResult([]);
    expect(result.anchorCount).toBe(0);
    expect(result.newestAnchor).toBeNull();
    expect(result.oldestAnchor).toBeNull();
  });

  it('identifies newest and oldest anchors', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'aa'.repeat(32), height: 300, headerId: 'h3' },
      { key: '0401', value: 'bb'.repeat(32), height: 100, headerId: 'h1' },
      { key: '0401', value: 'cc'.repeat(32), height: 200, headerId: 'h2' },
    ];
    const result = buildAnchorScanResult(fields);
    expect(result.anchorCount).toBe(3);
    expect(result.oldestAnchor!.height).toBe(100);
    expect(result.newestAnchor!.height).toBe(300);
    expect(result.anchors).toHaveLength(3);
    // Sorted ascending
    expect(result.anchors[0].height).toBe(100);
    expect(result.anchors[2].height).toBe(300);
  });

  it('ignores non-0401 fields', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0100', value: 'xx', height: 50, headerId: 'h0' },
      { key: '0401', value: 'aa'.repeat(32), height: 100, headerId: 'h1' },
    ];
    const result = buildAnchorScanResult(fields);
    expect(result.anchorCount).toBe(1);
  });
});

// --- classifyAnchorStatus (generic mode, no expected root) ---

describe('classifyAnchorStatus', () => {
  it('returns FAIL when no anchors found', () => {
    const scan = buildAnchorScanResult([]);
    const result = classifyAnchorStatus(scan, 1000, 10);
    expect(result.status).toBe('FAIL');
    expect(result.newestAnchorAge).toBeNull();
  });

  it('returns WARN when anchor is too young', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'aa'.repeat(32), height: 995, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10);
    expect(result.status).toBe('WARN');
    expect(result.newestAnchorAge).toBe(5);
  });

  it('returns PASS when anchor has enough confirmations', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'aa'.repeat(32), height: 990, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10);
    expect(result.status).toBe('PASS');
    expect(result.newestAnchorAge).toBe(10);
  });

  it('returns PASS when anchor age exceeds min confirmations', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'aa'.repeat(32), height: 900, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10);
    expect(result.status).toBe('PASS');
    expect(result.newestAnchorAge).toBe(100);
  });

  it('uses newest anchor for classification when multiple exist', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'aa'.repeat(32), height: 900, headerId: 'h1' },
      { key: '0401', value: 'bb'.repeat(32), height: 998, headerId: 'h2' },
    ];
    const scan = buildAnchorScanResult(fields);
    // Newest anchor is at 998, age = 1000 - 998 = 2 < 10
    const result = classifyAnchorStatus(scan, 1000, 10);
    expect(result.status).toBe('WARN');
    expect(result.newestAnchorAge).toBe(2);
  });
});

// --- classifyAnchorStatus with expected root ---

describe('classifyAnchorStatus with expectedRoot', () => {
  const EXPECTED_ROOT = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

  it('returns PASS when anchor matches expected root', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: EXPECTED_ROOT, height: 980, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    expect(result.status).toBe('PASS');
    expect(result.newestAnchorAge).toBe(20);
  });

  it('returns PASS with 0x-prefixed expected root', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: EXPECTED_ROOT, height: 980, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, '0x' + EXPECTED_ROOT);
    expect(result.status).toBe('PASS');
  });

  it('returns PASS with uppercase expected root matching lowercase anchor', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: EXPECTED_ROOT, height: 980, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT.toUpperCase());
    expect(result.status).toBe('PASS');
  });

  it('returns FAIL when anchors exist but none match expected root', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'ff'.repeat(32), height: 980, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('none match expected root');
    expect(result.newestAnchorAge).toBe(20);
  });

  it('returns WARN when matching anchor is too young', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: EXPECTED_ROOT, height: 998, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    expect(result.status).toBe('WARN');
    expect(result.newestAnchorAge).toBe(2);
  });

  it('ignores non-matching anchors and uses newest matching one', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'ff'.repeat(32), height: 999, headerId: 'h1' },
      { key: '0401', value: EXPECTED_ROOT, height: 980, headerId: 'h2' },
      { key: '0401', value: EXPECTED_ROOT, height: 990, headerId: 'h3' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    expect(result.status).toBe('PASS');
    expect(result.newestAnchorAge).toBe(10);
  });

  it('returns FAIL with no anchors and expected root', () => {
    const scan = buildAnchorScanResult([]);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('no 0x0401');
  });

  it('message is ASCII-only', () => {
    const fields: ErgoExtensionField[] = [
      { key: '0401', value: 'ff'.repeat(32), height: 980, headerId: 'h1' },
    ];
    const scan = buildAnchorScanResult(fields);
    const result = classifyAnchorStatus(scan, 1000, 10, EXPECTED_ROOT);
    // No non-ASCII characters
    // eslint-disable-next-line no-control-regex
    expect(result.message).toMatch(/^[\x00-\x7F]*$/);
  });
});

// --- computeScanWindow ---

describe('computeScanWindow', () => {
  it('computes normal window', () => {
    const { minHeight, maxHeight } = computeScanWindow(1000, 100);
    expect(minHeight).toBe(901);
    expect(maxHeight).toBe(1000);
  });

  it('clamps minHeight to 0', () => {
    const { minHeight, maxHeight } = computeScanWindow(50, 200);
    expect(minHeight).toBe(0);
    expect(maxHeight).toBe(50);
  });

  it('handles lookback of 1', () => {
    const { minHeight, maxHeight } = computeScanWindow(500, 1);
    expect(minHeight).toBe(500);
    expect(maxHeight).toBe(500);
  });
});
