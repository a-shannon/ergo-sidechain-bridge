import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock(
  '../substrate-federated-authority-safe-devnet-build-pins-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('../substrate-federated-authority-safe-devnet-build-pins-v1.js')
    >(),
    refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1: mocks.refresh,
  }),
);

import { main } from
  './refresh-substrate-federated-authority-safe-devnet-build-pins-v1.js';

const temporaryDirectories: string[] = [];
const BASE_SPEC = Buffer.from('{"name":"dev"}', 'utf8');
const REPORT = Object.freeze({
  schema: 'e2s.substrate-federated-authority-safe-devnet-build-pins.v1',
  version: 1,
  status: 'same_toolchain_frontier_build_pins_reproduced',
  boundaries: { gate5Closed: false },
  reportDigestHex: '11'.repeat(32),
});

describe('authority-safe devnet build-pin refresh CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.refresh.mockResolvedValue({
      baseSpecBytes: BASE_SPEC,
      report: REPORT,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('publishes the exact base spec and report to one create-only external directory', async () => {
    const fixture = fixturePaths();

    await main(argumentsFor(fixture));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(readdirSync(fixture.output).sort()).toEqual([
      'build-pins.v1.json',
      'frontier-base-spec.json',
    ]);
    expect(readFileSync(join(fixture.output, 'frontier-base-spec.json')))
      .toEqual(BASE_SPEC);
    expect(JSON.parse(readFileSync(
      join(fixture.output, 'build-pins.v1.json'),
      'utf8',
    ))).toEqual(REPORT);

    await expect(main(argumentsFor(fixture))).rejects.toThrow(
      /must not already exist/,
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('rejects an output directory inside the Git worktree before building', async () => {
    const fixture = fixturePaths();
    const insideWorktree = join(process.cwd(), 'build-pin-output');

    await expect(main([
      ...argumentsFor(fixture).slice(0, -2),
      '--output-directory', insideWorktree,
    ])).rejects.toThrow(/outside the Git worktree/);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('publishes nothing when the build-pin producer fails', async () => {
    const fixture = fixturePaths();
    mocks.refresh.mockRejectedValueOnce(new Error('second build differs'));

    await expect(main(argumentsFor(fixture))).rejects.toThrow(
      /second build differs/,
    );
    expect(existsSync(fixture.output)).toBe(false);
    expect(readdirSync(fixture.root)).toEqual([]);
  });

  it('does not replace an output directory created after the initial preflight', async () => {
    const fixture = fixturePaths();
    const sentinel = join(fixture.output, 'foreign.txt');
    mocks.refresh.mockImplementationOnce(async () => {
      mkdirSync(fixture.output);
      writeFileSync(sentinel, 'foreign');
      return { baseSpecBytes: BASE_SPEC, report: REPORT };
    });

    await expect(main(argumentsFor(fixture))).rejects.toThrow(
      /must not already exist/,
    );
    expect(readFileSync(sentinel, 'utf8')).toBe('foreign');
    expect(readdirSync(fixture.output)).toEqual(['foreign.txt']);
  });

  it('requires absolute input and output paths', async () => {
    const fixture = fixturePaths();

    await expect(main([
      ...argumentsFor(fixture).slice(0, -2),
      '--output-directory', 'relative-output',
    ])).rejects.toThrow(/absolute path/);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

function fixturePaths() {
  const root = mkdtempSync(join(tmpdir(), 'fed-build-pins-cli-'));
  temporaryDirectories.push(root);
  return { root, output: join(root, 'output') };
}

function argumentsFor(fixture: Readonly<{ output: string }>): string[] {
  const root = tmpdir();
  return [
    '--frontier-source', join(root, 'frontier-source'),
    '--cargo', join(root, 'tools', 'cargo.exe'),
    '--rustc', join(root, 'tools', 'rustc.exe'),
    '--git', join(root, 'tools', 'git.exe'),
    '--expected-frontier-commit', '01'.repeat(20),
    '--expected-frontier-patch-sha256', '02'.repeat(32),
    '--expected-frontier-binary-version', 'fixture-node 1.0.0',
    '--temporary-root', join(root, 'builds'),
    '--shared-cargo-home', join(root, 'cargo-home'),
    '--output-directory', fixture.output,
  ];
}
