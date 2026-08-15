import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { buildPackage, validatePackage } = vi.hoisted(() => ({
  buildPackage: vi.fn(),
  validatePackage: vi.fn(),
}));

vi.mock('../authenticated-v2-unsigned-settlement-package.js', () => ({
  buildAuthenticatedV2UnsignedSettlementPackage: buildPackage,
  validateAuthenticatedV2UnsignedSettlementPackage: validatePackage,
}));

import {
  parseAuthenticatedV2UnsignedSettlementPackageArgs,
  runAuthenticatedV2UnsignedSettlementPackageCli,
} from './build-authenticated-v2-unsigned-settlement-package.js';

const bridgeRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const cleanup: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  buildPackage.mockReset();
  validatePackage.mockReset();
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe('authenticated V2 unsigned settlement package CLI', () => {
  it('parses the three explicit file arguments without defaults', () => {
    expect(parseAuthenticatedV2UnsignedSettlementPackageArgs([
      '--readiness', 'readiness.json',
      '--companion', 'companion.json',
      '--out', 'package.json',
    ])).toEqual({
      readiness: 'readiness.json',
      companion: 'companion.json',
      out: 'package.json',
      help: false,
      errors: [],
    });
  });

  it('rejects missing, duplicate, and unknown arguments', () => {
    const parsed = parseAuthenticatedV2UnsignedSettlementPackageArgs([
      '--readiness', 'a.json',
      '--readiness', 'b.json',
      '--wat', 'x',
    ]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      '--readiness may be provided only once',
      'unknown option: --wat',
      'unknown option: x',
      '--companion is required',
      '--out is required',
    ]));
  });

  it('shows help without opening input files', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runAuthenticatedV2UnsignedSettlementPackageCli(['--help']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('offline construction artifact'));
    expect(buildPackage).not.toHaveBeenCalled();
  });

  it('writes one validated create-only repository-local package', async () => {
    const dir = mkdtempSync(join(bridgeRoot, '.tmp-wp06-unsigned-package-'));
    cleanup.push(dir);
    const inputDir = join(dir, 'inputs');
    mkdirSync(inputDir);
    writeFileSync(join(inputDir, 'readiness.json'), '{"kind":"readiness"}\n');
    writeFileSync(join(inputDir, 'companion.json'), '{"kind":"companion"}\n');
    const pkg = {
      packageDigestHex: '11'.repeat(32),
      transaction: {
        unsignedTransactionIdHex: '22'.repeat(32),
        contextExtensionGuard: { status: 'pass' },
      },
    };
    buildPackage.mockResolvedValue(pkg);
    validatePackage.mockResolvedValue(pkg);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const argv = [
      '--readiness', relativeToBridge(join(inputDir, 'readiness.json')),
      '--companion', relativeToBridge(join(inputDir, 'companion.json')),
      '--out', relativeToBridge(join(dir, 'package.json')),
    ];
    await runAuthenticatedV2UnsignedSettlementPackageCli(argv, {
      cwd: bridgeRoot,
      bridgeRoot,
    });
    expect(buildPackage).toHaveBeenCalledWith({
      readinessReport: { kind: 'readiness' },
      companion: { kind: 'companion' },
    });
    expect(validatePackage).toHaveBeenCalledWith(pkg);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual(pkg);

    await expect(runAuthenticatedV2UnsignedSettlementPackageCli(argv, {
      cwd: bridgeRoot,
      bridgeRoot,
    })).rejects.toThrow(/new file/i);
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
  });

  it('rejects repository escapes and malformed JSON before construction', async () => {
    const dir = mkdtempSync(join(bridgeRoot, '.tmp-wp06-unsigned-package-'));
    cleanup.push(dir);
    writeFileSync(join(dir, 'bad.json'), '{');
    writeFileSync(join(dir, 'companion.json'), '{}');
    const base = [
      '--readiness', relativeToBridge(join(dir, 'bad.json')),
      '--companion', relativeToBridge(join(dir, 'companion.json')),
      '--out', relativeToBridge(join(dir, 'package.json')),
    ];
    await expect(runAuthenticatedV2UnsignedSettlementPackageCli(base, {
      cwd: bridgeRoot,
      bridgeRoot,
    })).rejects.toThrow(/valid JSON/i);
    await expect(runAuthenticatedV2UnsignedSettlementPackageCli([
      '--readiness', '..\\outside.json',
      '--companion', relativeToBridge(join(dir, 'companion.json')),
      '--out', relativeToBridge(join(dir, 'package.json')),
    ], {
      cwd: bridgeRoot,
      bridgeRoot,
    })).rejects.toThrow(/inside the bridge repository/i);
    expect(buildPackage).not.toHaveBeenCalled();
  });

  it('rejects top-level and nested duplicate JSON keys before construction', async () => {
    const dir = mkdtempSync(join(bridgeRoot, '.tmp-wp06-unsigned-package-'));
    cleanup.push(dir);
    const readiness = join(dir, 'readiness.json');
    const companion = join(dir, 'companion.json');
    writeFileSync(readiness, '{"kind":"first","kind":"second"}');
    writeFileSync(companion, '{}');
    const args = (out: string) => [
      '--readiness', relativeToBridge(readiness),
      '--companion', relativeToBridge(companion),
      '--out', relativeToBridge(join(dir, out)),
    ];
    await expect(runAuthenticatedV2UnsignedSettlementPackageCli(
      args('top-level-package.json'),
      { cwd: bridgeRoot, bridgeRoot },
    )).rejects.toThrow(/duplicate JSON object key: kind/i);

    writeFileSync(readiness, '{}');
    writeFileSync(
      companion,
      '{"targetBurn":{"eventIndex":1,"event\\u0049ndex":2}}',
    );
    await expect(runAuthenticatedV2UnsignedSettlementPackageCli(
      args('nested-package.json'),
      { cwd: bridgeRoot, bridgeRoot },
    )).rejects.toThrow(/duplicate JSON object key: eventIndex/i);
    expect(buildPackage).not.toHaveBeenCalled();
  });
});

function relativeToBridge(path: string): string {
  return path.slice(bridgeRoot.length + 1);
}
