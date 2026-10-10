import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  collectHistory: vi.fn(),
}));

vi.mock(
  '../substrate-federated-authority-safe-devnet-acceptance-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('../substrate-federated-authority-safe-devnet-acceptance-v1.js')
    >(),
    acceptSubstrateFederatedAuthoritySafeDevnetV1: mocks.accept,
  }),
);

vi.mock(
  '../substrate-federated-authority-safe-devnet-history-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('../substrate-federated-authority-safe-devnet-history-v1.js')
    >(),
    collectSubstrateFederatedAuthoritySafeDevnetHistoryV1:
      mocks.collectHistory,
  }),
);

import { main } from './accept-substrate-federated-authority-safe-devnet-v1.js';

const temporaryDirectories: string[] = [];
const ARTIFACTS = Object.freeze({
  acceptanceReport: Buffer.from('{"status":"accepted"}\n'),
  reportedFinalizedBlocksManifest: Buffer.from('{"blocks":[]}'),
  runtimeHistoryManifest: Buffer.from('{"states":[]}'),
  applicationHistoryManifest: Buffer.from('{"states":[]}'),
});
const RECEIPT = Object.freeze({
  schema: 'e2s.substrate-federated-authority-safe-devnet-history.v1',
  historyDigestHex: '11'.repeat(32),
});

describe('authority-safe devnet acceptance CLI history mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.accept.mockResolvedValue({ status: 'accepted' });
    mocks.collectHistory.mockResolvedValue({
      acceptance: Object.freeze({ status: 'accepted' }),
      receipt: RECEIPT,
      artifacts: ARTIFACTS,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves acceptance-only behavior without the history output option', async () => {
    const fixture = fixturePaths();

    await main(argumentsFor(fixture));

    expect(mocks.accept).toHaveBeenCalledOnce();
    expect(mocks.collectHistory).not.toHaveBeenCalled();
  });

  it('atomically publishes the acceptance, three manifests, and receipt outside the worktree', async () => {
    const fixture = fixturePaths();

    await main(argumentsFor(fixture, fixture.output));

    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.collectHistory).toHaveBeenCalledOnce();
    expect(readFileSync(
      join(fixture.output, 'acceptance.v1.json'),
    )).toEqual(ARTIFACTS.acceptanceReport);
    expect(readFileSync(
      join(fixture.output, 'reported-finalized-blocks.v1.json'),
    )).toEqual(ARTIFACTS.reportedFinalizedBlocksManifest);
    expect(readFileSync(
      join(fixture.output, 'runtime-history.v1.json'),
    )).toEqual(ARTIFACTS.runtimeHistoryManifest);
    expect(readFileSync(
      join(fixture.output, 'application-history.v1.json'),
    )).toEqual(ARTIFACTS.applicationHistoryManifest);
    expect(JSON.parse(readFileSync(
      join(fixture.output, 'history-receipt.v1.json'),
      'utf8',
    ))).toEqual(RECEIPT);

    await expect(
      main(argumentsFor(fixture, fixture.output)),
    ).rejects.toThrow(/must not already exist/);
    expect(mocks.collectHistory).toHaveBeenCalledOnce();
  });

  it('rejects a history output directory inside the Git worktree before collection', async () => {
    const fixture = fixturePaths();
    const outputInsideWorktree = join(
      process.cwd(),
      '..',
      'fed6g1d-history-output',
    );

    await expect(
      main(argumentsFor(fixture, outputInsideWorktree)),
    ).rejects.toThrow(/must remain outside the repository/);
    expect(mocks.collectHistory).not.toHaveBeenCalled();
  });

  it('requires an output target when the history operation is selected', async () => {
    const fixture = fixturePaths();

    await expect(main([
      ...argumentsFor(fixture),
      '--operation', 'history',
    ])).rejects.toThrow(/is required for the history operation/);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.collectHistory).not.toHaveBeenCalled();
  });

  it('does not publish the final directory when bundle construction fails', async () => {
    const fixture = fixturePaths();
    mocks.collectHistory.mockResolvedValueOnce({
      acceptance: Object.freeze({ status: 'accepted' }),
      receipt: RECEIPT,
      artifacts: {
        ...ARTIFACTS,
        runtimeHistoryManifest: undefined,
      },
    });

    await expect(
      main(argumentsFor(fixture, fixture.output)),
    ).rejects.toThrow();
    expect(existsSync(fixture.output)).toBe(false);
    expect(readdirSync(fixture.root)).toEqual(['base-spec.json']);
  });
});

function fixturePaths() {
  const root = mkdtempSync(join(tmpdir(), 'fed6g1d-history-cli-'));
  temporaryDirectories.push(root);
  const baseSpec = join(root, 'base-spec.json');
  const output = join(root, 'output');
  writeFileSync(baseSpec, '{"name":"fixture"}');
  return { root, baseSpec, output };
}

function argumentsFor(
  fixture: Readonly<{ baseSpec: string }>,
  output?: string,
): string[] {
  const args = [
    '--frontier-source', 'C:\\source',
    '--cargo', 'C:\\tools\\cargo.exe',
    '--rustc', 'C:\\tools\\rustc.exe',
    '--git', 'C:\\tools\\git.exe',
    '--base-spec', fixture.baseSpec,
    '--expected-chain-id', '42',
    '--bridge-address', `0x${'06'.repeat(20)}`,
    '--token-address', `0x${'07'.repeat(20)}`,
    '--bridge-owner-address', `0x${'08'.repeat(20)}`,
    '--expected-base-spec-sha256', '09'.repeat(32),
    '--expected-frontier-commit', '0a'.repeat(20),
    '--expected-frontier-patch-sha256', '0b'.repeat(32),
    '--expected-runtime-code-sha256', '0c'.repeat(32),
    '--expected-sudo-address', `0x${'0d'.repeat(20)}`,
    '--expected-frontier-binary-version', 'fixture-node 1.0.0',
    '--primary-rpc', 'http://127.0.0.1:9955',
    '--witness-rpc', 'http://127.0.0.1:9956',
    '--primary-p2p-port', '30355',
    '--witness-p2p-port', '30356',
    '--primary-prometheus-port', '9615',
    '--witness-prometheus-port', '9616',
    '--expected-genesis-hash', `0x${'0e'.repeat(32)}`,
    '--expected-node-name', 'Fixture Node',
    '--expected-node-version', '1.0.0',
    '--signed-owner-mint-transaction', '0x01',
  ];
  if (output !== undefined) {
    args.push(
      '--operation', 'history',
      '--history-output-directory', output,
    );
  }
  return args;
}
