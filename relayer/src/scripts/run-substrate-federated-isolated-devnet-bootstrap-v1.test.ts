import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocked = vi.hoisted(() => ({
  failStagingReceiptCleanup: false,
  root: vi.fn(),
  process: vi.fn(),
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    unlinkSync: (...args: Parameters<typeof actual.unlinkSync>) => {
      if (
        mocked.failStagingReceiptCleanup
        && String(args[0]).endsWith('receipt.json')
      ) {
        throw new Error('injected staging receipt cleanup failure');
      }
      return actual.unlinkSync(...args);
    },
  };
});

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.js',
  () => ({
    runSubstrateFederatedIsolatedDevnetBootstrapRootV1: mocked.root,
  }),
);
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-bootstrap-v1.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
  loadCanonicalBootstrapRequestBoundWithProvenanceV1,
  runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
  consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
  projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1,
} from '../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';

describe('isolated devnet tracked no-submit bootstrap command V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.failStagingReceiptCleanup = false;
    mocked.root.mockResolvedValue({ receipt: rootReceipt() });
    mocked.process.mockResolvedValue({
      pid: 1234,
      exitCode: 0,
      stdout: `${canonicalJson(rootReceipt())}\n`,
      stderr: '',
    });
  });

  it('maps one canonical request into the static root without caller-owned capabilities', async () => {
    await withFixture(async fixture => {
      const receipt =
        await runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1([
          '--request',
          fixture.requestPath,
        ]);
      expect(receipt).toEqual(rootReceipt());
      expect(mocked.root).toHaveBeenCalledTimes(1);
      const input = mocked.root.mock.calls[0]?.[0];
      expect(input).toMatchObject({
        build: {
          bridgeRoot: resolve(process.cwd(), '..'),
          worktreeRoot: resolve(process.cwd(), '..', '..'),
          ergoSourcePath: fixture.request.ergoNode.ergoSourcePath,
          gitExecutablePath: fixture.request.toolchain.gitExecutablePath,
          javaExecutablePath: fixture.request.toolchain.javaExecutablePath,
          sbtLauncherJarPath: fixture.request.toolchain.sbtLauncherJarPath,
        },
        lifecycle: {
          sourceHistory: {
            acceptance: {
              expectedChainId: 31337n,
              primaryRpcUrl: 'http://127.0.0.1:9944',
              witnessRpcUrl: 'http://127.0.0.1:9945',
              signedLegacyOwnerMintTransactionHex: '0x01020304',
            },
          },
          relayerArtifacts: {
            bridgeRoot: resolve(process.cwd(), '..'),
            expectedHeadCommitSha1Hex: 'a'.repeat(40),
            destinationDirectory: fixture.artifactDestination,
          },
        },
      });
      expect(Buffer.from(
        input.lifecycle.sourceHistory.acceptance.baseSpecBytes,
      ).toString('utf8')).toBe('{"name":"base"}\n');
      expect(JSON.stringify(receipt)).not.toContain(
        fixture.request.sourceTarget.signedLegacyOwnerMintTransactionHex,
      );
    });
  });

  it('binds execution loading to the exact request bytes validated by the parent', async () => {
    await withFixture(async fixture => {
      const expectedRequestSha256Hex = createHash('sha256')
        .update(readFileSync(fixture.requestPath))
        .digest('hex');
      expect(() => loadCanonicalBootstrapRequestBoundToSha256(
        fixture.requestPath,
        resolve(process.cwd(), '..'),
        resolve(process.cwd(), '..', '..'),
        expectedRequestSha256Hex,
      )).not.toThrow();
      expect(() => loadCanonicalBootstrapRequestBoundToSha256(
        fixture.requestPath,
        resolve(process.cwd(), '..'),
        resolve(process.cwd(), '..', '..'),
        '0'.repeat(64),
      )).toThrow('changed after parent validation');
    });
  });

  it('issues one opaque binding from the exact canonical request bytes', async () => {
    await withFixture(async fixture => {
      const expectedRequestSha256Hex = createHash('sha256')
        .update(readFileSync(fixture.requestPath))
        .digest('hex');
      const loaded = loadCanonicalBootstrapRequestBoundWithProvenanceV1(
        fixture.requestPath,
        resolve(process.cwd(), '..'),
        resolve(process.cwd(), '..', '..'),
        expectedRequestSha256Hex,
      );
      const independentlyLoaded =
        loadCanonicalBootstrapRequestBoundWithProvenanceV1(
          fixture.requestPath,
          resolve(process.cwd(), '..'),
          resolve(process.cwd(), '..', '..'),
          expectedRequestSha256Hex,
        );

      expect(loaded.input.lifecycle.relayerArtifacts.expectedHeadCommitSha1Hex)
        .toBe('a'.repeat(40));
      expect(() =>
        claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          loaded.requestBinding,
          independentlyLoaded.input,
        )
      ).toThrow(/does not match the exact parsed root input/u);
      expect(Object.isFrozen(loaded.input.build)).toBe(true);
      expect(Object.isFrozen(loaded.input.lifecycle)).toBe(true);
      expect(Object.isFrozen(
        loaded.input.lifecycle.sourceHistory.acceptance,
      )).toBe(true);
      expect(Reflect.set(
        loaded.input.lifecycle.sourceHistory.acceptance,
        'expectedChainId',
        999n,
      )).toBe(false);
      expect(() =>
        claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          structuredClone(loaded.requestBinding),
          loaded.input,
        )
      ).toThrow(/lacks fresh process provenance/u);
      const baseSpecBytes =
        loaded.input.lifecycle.sourceHistory.acceptance.baseSpecBytes;
      const originalFirstByte = baseSpecBytes[0]!;
      baseSpecBytes[0] = originalFirstByte ^ 0xff;
      expect(() =>
        claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          loaded.requestBinding,
          loaded.input,
        )
      ).toThrow(/root input changed after validation/u);
      baseSpecBytes[0] = originalFirstByte;
      const campaignBinding =
        claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          loaded.requestBinding,
          loaded.input,
        );
      baseSpecBytes[0] = originalFirstByte ^ 0xff;
      expect(() =>
        projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1(
          campaignBinding,
        )
      ).toThrow(/root input changed after validation/u);
      baseSpecBytes[0] = originalFirstByte;
      expect(
        projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1(
          campaignBinding,
        ),
      ).toBe(expectedRequestSha256Hex);
      expect(() =>
        projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1(
          structuredClone(campaignBinding),
        )
      ).toThrow(/lacks fresh process provenance/u);
      expect(
        consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          campaignBinding,
        ),
      ).toBe(expectedRequestSha256Hex);
      expect(() =>
        consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
          campaignBinding,
        )
      ).toThrow(/lacks fresh process provenance/u);
    });
  });

  it('runs the worker in one bounded allowlisted child and publishes only its receipt', async () => {
    await withFixture(async fixture => {
      const originalNodeOptions = process.env.NODE_OPTIONS;
      const originalUnsafe = process.env.E2S_UNSAFE_TEST_VALUE;
      process.env.NODE_OPTIONS = '--inspect';
      process.env.E2S_UNSAFE_TEST_VALUE = 'must-not-cross';
      try {
        const result =
          await runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--output',
            fixture.outputPath,
          ]);
        expect(result).toEqual({
          status: 'isolated_no_submit_bootstrap_receipt_published',
          receiptDigestHex: rootReceipt().receiptDigestHex,
        });
      } finally {
        restoreEnvironment('NODE_OPTIONS', originalNodeOptions);
        restoreEnvironment('E2S_UNSAFE_TEST_VALUE', originalUnsafe);
      }
      expect(readFileSync(fixture.outputPath, 'utf8'))
        .toBe(`${canonicalJson(rootReceipt())}\n`);
      expect(readdirSync(fixture.root).some(name => (
        name.startsWith('.e2s-bootstrap-receipt-')
      ))).toBe(false);
      expect(mocked.process).toHaveBeenCalledTimes(1);
      const processInput = mocked.process.mock.calls[0]?.[0];
      expect(processInput).toMatchObject({
        executablePath: process.execPath,
        cwd: process.cwd(),
        timeoutMs: 5_400_000,
        terminationGraceMs: 30_000,
        label: 'isolated no-submit bootstrap worker',
      });
      expect(processInput.args).toEqual([
        'node_modules/tsx/dist/cli.mjs',
        expect.stringMatching(
          /run-substrate-federated-isolated-devnet-bootstrap-worker-v1\.ts$/u,
        ),
        '--request',
        fixture.requestPath,
      ]);
      expect(processInput.env.NODE_OPTIONS).toBeUndefined();
      expect(processInput.env.E2S_UNSAFE_TEST_VALUE).toBeUndefined();
      expect(processInput.env).toEqual(expectedBootstrapChildEnvironment());
    });
  });

  it('rejects missing, extra, reordered and duplicate command arguments', async () => {
    await withFixture(async fixture => {
      const valid = [
        '--request',
        fixture.requestPath,
        '--output',
        fixture.outputPath,
      ];
      const variants = [
        valid.slice(0, -1),
        [...valid, '--unexpected'],
        [valid[2]!, valid[3]!, valid[0]!, valid[1]!],
        [valid[0]!, valid[1]!, valid[0]!, valid[3]!],
        [valid[0]!, '--output', valid[2]!, valid[3]!],
      ];
      for (const args of variants) {
        await expect(
          runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1(
            args,
          ),
        ).rejects.toThrow(/arguments are invalid/);
      }
      expect(mocked.process).not.toHaveBeenCalled();
    });
  });

  it('rejects ambiguous or non-canonical request documents before the root', async () => {
    await withFixture(async fixture => {
      const databaseSidecarPath = join(fixture.root, 'state.db-wal');
      writeFileSync(databaseSidecarPath, '{"name":"not-a-spec"}\n', 'utf8');
      const variants = [
        '{"schema":"a","schema":"b"}\n',
        `${JSON.stringify(fixture.request, null, 2)}\n`,
        canonicalDocument({ ...fixture.request, unexpected: true }),
        canonicalDocument({
          ...fixture.request,
          sourceTarget: {
            ...fixture.request.sourceTarget,
            expectedChainId: '031337',
          },
        }),
        canonicalDocument({
          ...fixture.request,
          sourceTarget: {
            ...fixture.request.sourceTarget,
            primaryP2pPort: 0,
          },
        }),
        canonicalDocument({
          ...fixture.request,
          sourceTarget: {
            ...fixture.request.sourceTarget,
            baseSpecPath: databaseSidecarPath,
          },
        }),
      ];
      for (const [index, source] of variants.entries()) {
        const requestPath = join(fixture.root, `invalid-${index}.json`);
        writeFileSync(requestPath, source, 'utf8');
        await expect(
          runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1([
            '--request',
            requestPath,
          ]),
        ).rejects.toThrow();
      }
      expect(mocked.root).not.toHaveBeenCalled();
    });
  });

  it('rejects sensitive, occupied and in-worktree output paths before execution', async () => {
    await withFixture(async fixture => {
      const occupied = join(fixture.root, 'occupied-receipt.json');
      writeFileSync(occupied, '', 'utf8');
      const unsafeOutputs = [
        occupied,
        join(fixture.root, '.env.bootstrap-receipt'),
        join(fixture.root, 'wallet-bootstrap-receipt.json'),
        join(fixture.root, 'bootstrap-receipt.sqlite'),
        join(fixture.root, 'bootstrap-receipt.log'),
        join(fixture.root, 'node.log.1'),
        join(fixture.root, 'state.db-wal'),
        join(fixture.root, 'state.sqlite-shm'),
        join(fixture.root, 'logs', 'bootstrap-receipt.json'),
        resolve(process.cwd(), '..', 'in-worktree-bootstrap-receipt.json'),
      ];
      for (const outputPath of unsafeOutputs) {
        await expect(
          runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--output',
            outputPath,
          ]),
        ).rejects.toThrow();
      }
      expect(mocked.process).not.toHaveBeenCalled();

      const sensitiveRequest = join(fixture.root, '.env.bootstrap-request');
      writeFileSync(sensitiveRequest, canonicalDocument(fixture.request), 'utf8');
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          sensitiveRequest,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow(/non-sensitive path/);
      expect(mocked.process).not.toHaveBeenCalled();

      const sensitiveSourceRequest = {
        ...fixture.request,
        ergoNode: {
          ergoSourcePath: join(fixture.root, 'wallet-source'),
        },
      };
      const sensitiveSourceRequestPath = join(
        fixture.root,
        'sensitive-source-request.json',
      );
      writeFileSync(
        sensitiveSourceRequestPath,
        canonicalDocument(sensitiveSourceRequest),
        'utf8',
      );
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1([
          '--request',
          sensitiveSourceRequestPath,
        ]),
      ).rejects.toThrow(/non-sensitive path/);
      expect(mocked.root).not.toHaveBeenCalled();
    });
  });

  it('rejects a canonical input reached through a junction before reading it', async () => {
    await withFixture(async fixture => {
      const sensitiveDirectory = join(fixture.root, 'credential-store');
      const aliasDirectory = join(fixture.root, 'source-alias');
      mkdirSync(sensitiveDirectory);
      const hiddenBaseSpec = join(sensitiveDirectory, 'base-spec.json');
      writeFileSync(hiddenBaseSpec, '{"name":"hidden"}\n', 'utf8');
      symlinkSync(sensitiveDirectory, aliasDirectory, 'junction');
      const linkedRequest = {
        ...fixture.request,
        sourceTarget: {
          ...fixture.request.sourceTarget,
          baseSpecPath: join(aliasDirectory, 'base-spec.json'),
        },
      };
      const linkedRequestPath = join(fixture.root, 'linked-request.json');
      writeFileSync(
        linkedRequestPath,
        canonicalDocument(linkedRequest),
        'utf8',
      );
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1([
          '--request',
          linkedRequestPath,
        ]),
      ).rejects.toThrow(/link-free non-sensitive file/);
      expect(mocked.root).not.toHaveBeenCalled();
    });
  });

  it('leaves no receipt when the worker fails or returns an authority-widened result', async () => {
    await withFixture(async fixture => {
      mocked.process.mockRejectedValueOnce(new Error('root rejected'));
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow(/root rejected/);
      expect(existsSync(fixture.outputPath)).toBe(false);

      const widened = rootReceipt();
      widened.boundaries.submissionAuthorized = true;
      mocked.process.mockResolvedValueOnce({
        pid: 1235,
        exitCode: 0,
        stdout: `${canonicalJson(widened)}\n`,
        stderr: '',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow(/authority boundaries changed/);
      expect(existsSync(fixture.outputPath)).toBe(false);

      const nestedWidening = rootReceipt();
      nestedWidening.build.boundaries.fundsAuthorityEstablished = true;
      mocked.process.mockResolvedValueOnce({
        pid: 1236,
        exitCode: 0,
        stdout: `${canonicalJson(redigestRootReceipt(nestedWidening))}\n`,
        stderr: '',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow(/build boundaries changed/);
      expect(existsSync(fixture.outputPath)).toBe(false);

      const mismatchedJoin = rootReceipt();
      mismatchedJoin.build.build.artifactSha256Hex = 'f'.repeat(64);
      const {
        buildIdentityDigestHex: _oldBuildIdentity,
        ...changedBuildIdentity
      } = mismatchedJoin.build;
      mismatchedJoin.build.buildIdentityDigestHex = sha256CanonicalJson(
        changedBuildIdentity,
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1',
      );
      mocked.process.mockResolvedValueOnce({
        pid: 1237,
        exitCode: 0,
        stdout: `${canonicalJson(redigestRootReceipt(mismatchedJoin))}\n`,
        stderr: '',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow(/build and process identities differ/);
      expect(existsSync(fixture.outputPath)).toBe(false);
    });
  });

  it('rejects incomplete or diagnostic worker output before publication', async () => {
    await withFixture(async fixture => {
      for (const workerResult of [
        {
          pid: 1237,
          exitCode: 0 as const,
          stdout: '{"schema":',
          stderr: '',
        },
        {
          pid: 1238,
          exitCode: 0 as const,
          stdout: `${canonicalJson(rootReceipt())}\n`,
          stderr: 'unexpected diagnostic\n',
        },
      ]) {
        mocked.process.mockResolvedValueOnce(workerResult);
        await expect(
          runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--output',
            fixture.outputPath,
          ]),
        ).rejects.toThrow();
        expect(existsSync(fixture.outputPath)).toBe(false);
      }
    });
  });

  it('keeps a verified final receipt committed when staging cleanup fails', async () => {
    await withFixture(async fixture => {
      mocked.failStagingReceiptCleanup = true;
      const result =
        await runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]);
      expect(result.status)
        .toBe('isolated_no_submit_bootstrap_receipt_published');
      expect(readFileSync(fixture.outputPath, 'utf8'))
        .toBe(`${canonicalJson(rootReceipt())}\n`);
      expect(readdirSync(fixture.root).some(name => (
        name.startsWith('.e2s-bootstrap-receipt-')
      ))).toBe(true);
    });
  });

  it('emits one stable path-free failure from the tracked command', () => {
    const scriptPath = fileURLToPath(new URL(
      './run-substrate-federated-isolated-devnet-bootstrap-v1.ts',
      import.meta.url,
    ));
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        scriptPath,
        '--output',
        'reordered',
        '--request',
        'reordered',
      ],
      {
        cwd: process.cwd(),
        env: minimalChildEnvironment(),
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('isolated no-submit bootstrap failed\n');
  });

  it('keeps the launcher and worker config-free and outside funds capabilities', () => {
    const launcher = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-bootstrap-v1.ts',
      import.meta.url,
    ), 'utf8');
    const worker = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(launcher).not.toMatch(/dotenv|ergo-client|state-tracker|submitter|broadcaster|node-wallet/iu);
    expect(worker).not.toMatch(/dotenv|ergo-client|state-tracker|submitter|broadcaster|node-wallet/iu);
    expect(launcher).toContain("process.stderr.write('isolated no-submit bootstrap failed\\n')");
    expect(worker).toContain("process.stderr.write('isolated no-submit bootstrap worker failed\\n')");

    const packageJson = JSON.parse(readFileSync(
      resolve(process.cwd(), 'package.json'),
      'utf8',
    )) as { scripts: Record<string, string> };
    expect(packageJson.scripts['federated:isolated:bootstrap:no-submit'])
      .toBe(
        'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.ts',
      );
  });
});

interface Fixture {
  readonly root: string;
  readonly requestPath: string;
  readonly outputPath: string;
  readonly artifactDestination: string;
  readonly request: ReturnType<typeof requestDocument>;
}

async function withFixture(
  operation: (fixture: Readonly<Fixture>) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-bootstrap-command-'));
  try {
    const baseSpecPath = join(root, 'base-spec.json');
    writeFileSync(baseSpecPath, '{"name":"base"}\n', 'utf8');
    const artifactDestination = join(root, 'relayer-artifacts');
    const request = requestDocument(root, baseSpecPath, artifactDestination);
    mkdirSync(request.sourceTarget.frontierSourcePath);
    mkdirSync(request.ergoNode.ergoSourcePath);
    for (const path of Object.values(request.toolchain)) {
      writeFileSync(path, '', 'utf8');
    }
    const requestPath = join(root, 'bootstrap-request.v1.json');
    writeFileSync(requestPath, canonicalDocument(request), 'utf8');
    await operation({
      root,
      requestPath,
      outputPath: join(root, 'bootstrap-receipt.v1.json'),
      artifactDestination,
      request,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function requestDocument(
  root: string,
  baseSpecPath: string,
  artifactDestination: string,
) {
  return {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
    version: 1,
    toolchain: {
      gitExecutablePath: join(root, 'git.exe'),
      cargoExecutablePath: join(root, 'cargo.exe'),
      rustcExecutablePath: join(root, 'rustc.exe'),
      javaExecutablePath: join(root, 'java.exe'),
      sbtLauncherJarPath: join(root, 'sbt-launch.jar'),
      wasmPackExecutablePath: join(root, 'wasm-pack.exe'),
    },
    sourceTarget: {
      frontierSourcePath: join(root, 'frontier-source'),
      baseSpecPath,
      expectedChainId: '31337',
      bridgeAddress: `0x${'1'.repeat(40)}`,
      tokenAddress: `0x${'2'.repeat(40)}`,
      bridgeOwnerAddress: `0x${'3'.repeat(40)}`,
      expectedBaseSpecSha256Hex: '4'.repeat(64),
      expectedFrontierCommit: '5'.repeat(40),
      expectedFrontierPatchSha256Hex: '6'.repeat(64),
      expectedRuntimeCodeSha256Hex: '7'.repeat(64),
      expectedSudoAddress: `5${'8'.repeat(47)}`,
      expectedFrontierBinaryVersion: 'bridge-node 1.0.0',
      primaryRpcUrl: 'http://127.0.0.1:9944',
      witnessRpcUrl: 'http://127.0.0.1:9945',
      primaryP2pPort: 30333,
      witnessP2pPort: 30334,
      primaryPrometheusPort: 9615,
      witnessPrometheusPort: 9616,
      expectedNativeGenesisHashHex: `0x${'9'.repeat(64)}`,
      expectedNodeName: 'bridge-node',
      expectedNodeVersion: '1.0.0',
      signedLegacyOwnerMintTransactionHex: '0x01020304',
    },
    ergoNode: {
      ergoSourcePath: join(root, 'ergo-source'),
    },
    relayer: {
      expectedHeadCommitSha1Hex: 'a'.repeat(40),
      artifactDestinationDirectory: artifactDestination,
    },
  } as const;
}

function rootReceipt() {
  const build = {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1',
    version: 1,
    status: 'exact_locked_patched_node_built',
    source: {
      consensusSourceLockSha256Hex: '1'.repeat(64),
      sourceBaselineDigestHex: '2'.repeat(64),
      ergoNodeBaseCommit: '3'.repeat(40),
      ergoPatchSha256Hex: '4'.repeat(64),
    },
    toolchain: {
      platform: 'win32-x64',
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256Hex: '5'.repeat(64),
      javaMajorVersion: 17,
      javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS',
      javaHomeSha256Hex: '6'.repeat(64),
      javaExecutableSha256Hex: '7'.repeat(64),
      sbtLauncherJarSha256Hex: '8'.repeat(64),
      projectSbtVersion: '1.11.1',
    },
    build: {
      invocation:
        'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly',
      processRunner: 'reviewed-windows-job-object-v1',
      processRunnerSha256Hex: '9'.repeat(64),
      timeoutMs: 900_000,
      terminationGraceMs: 10_000,
      maxOutputBytes: 33_554_432,
      artifactName: 'ergo-node.jar',
      artifactBytes: 123_456,
      artifactSha256Hex: 'a'.repeat(64),
    },
    checks: {
      exactTrackedRuntimeLockConsumed: true,
      exactConsensusSourceLockConsumed: true,
      exactPatchedSourceValidatedBeforeBuild: true,
      exactPatchedSourceRevalidatedAfterBuild: true,
      completeJavaDistributionValidatedBeforeAndAfterBuild: true,
      pinnedGitExecutableValidatedBeforeAndAfterBuild: true,
      pinnedSbtLauncherValidatedBeforeAndAfterBuild: true,
      reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild: true,
      fixedJavaArgumentsLaunchedWithoutShell: true,
      inheritedBuildEnvironmentMinimized: true,
      preexistingAssemblyCandidatesRejected: true,
      assemblyPathChainLinkFree: true,
      buildProcessTimeBound: true,
      buildProcessTreeTerminationBounded: true,
      singleFreshAssemblySelected: true,
    },
    buildIdentityDigestHex: 'b'.repeat(64),
    boundaries: {
      loadedBytesAttestedAgainstHostileSameUserProcess: false,
      dependencyCacheContentAttested: false,
      independentBuildAttestationVerified: false,
      targetNodeAcceptanceEstablished: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  };
  const {
    buildIdentityDigestHex: _placeholderBuildIdentity,
    ...buildIdentity
  } = build;
  build.buildIdentityDigestHex = sha256CanonicalJson(
    buildIdentity,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1',
  );
  const processReceipt = {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    miningStoppedBeforeAction: true,
    buildIdentityDigestHex: build.buildIdentityDigestHex,
    executableIdentityDigestHex: 'c'.repeat(64),
    processBindingDigestHex: 'd'.repeat(64),
    finalSnapshot: {
      network: 'devnet',
      fullHeight: 23,
      indexedHeight: 23,
      headerIdHex: 'e'.repeat(64),
    },
    checks: {
      directJavaAssemblyLaunch: true,
      javaImageAndPinnedFilesRechecked: true,
      isolatedFreshRuntimeStateUsed: true,
      setupSignerSecretNeverExposedToCompositionRoot: true,
      setupSignerMiningCredentialConsumedOnce: true,
      ephemeralPowSecretPassedOnlyViaProcessEnvironment: true,
      ephemeralPowSecretDiscardedBeforeAction: true,
      miningTargetBoundToSessionPublicKey: true,
      miningPhaseStoppedBeforeTargetFreeze: true,
      sameDataDirectoriesResumedNonMining: true,
      managedActionCompletionJoinedBeforeCleanup: true,
      managedActionOverrunRejectedAfterJoin: true,
      unverifiedProcessTerminationFailsStop: true,
      exactNonMiningSnapshotStableAcrossAction: true,
      spawnedProcessListenersExclusivelyLoopbackOwned: true,
      configurationAndArtifactRecheckedAfterAction: true,
    },
  };
  const body = {
    schema: 'e2s.substrate-federated-isolated-devnet-bootstrap-root.v1',
    version: 1,
    status: 'static_owned_node_no_submit_bootstrap_passed',
    staticCallbackManifestDigestHex:
      '5879db9176ef7d3216b513695abbe1d211469584ed65c478bbe2c0db19ed800f',
    build,
    process: {
      receiptDigestHex: sha256CanonicalJson(
        processReceipt,
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROCESS_RECEIPT_V1',
      ),
      receipt: processReceipt,
    },
    lifecycle: {
      federationProfileIdHex: 'f'.repeat(64),
      sourceAttestationKeySetDigestHex: '0'.repeat(64),
      ergoAdmissionKeySetDigestHex: '1'.repeat(64),
      packetReceiptDigestHex: '2'.repeat(64),
      setupCheckReceiptDigestHex: '3'.repeat(64),
    },
    checks: {
      exactLockedPatchedNodeBuiltBeforeSignerCreation: true,
      staticLifecycleFunctionSelected: true,
      staticRuntimePortsBound: true,
      replacementCallbackAccepted: false,
      setupAndPacketSessionsOneShotWrapped: true,
      producerCompletionAwaitedBeforeTeardown: true,
      rootLevelTimeoutRaceAbsent: true,
      exactProcessReceiptNormalizedBeforeDigest: true,
      buildProcessAndLifecycleDigestsJoined: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localCompatibilityExecutionOnly: true,
      transitiveProducerCancellationEstablished: false,
      loadedBytesAttestedAgainstHostileSameUserProcess: false,
      sourceConsensusIndependentlyAuthenticated: false,
      ergoConsensusIndependentlyAuthenticated: false,
      targetNodeAcceptanceEstablished: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      profileActivated: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1',
    ),
  };
}

function redigestRootReceipt(receipt: ReturnType<typeof rootReceipt>) {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1',
    ),
  };
}

function canonicalDocument(value: unknown): string {
  return `${canonicalJson(value)}\n`;
}

function minimalChildEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    'Path',
    'PATH',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'ComSpec',
    'COMSPEC',
    'PATHEXT',
  ]) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function expectedBootstrapChildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    Path: process.env.Path ?? process.env.PATH,
    SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
    ComSpec: process.env.ComSpec ?? process.env.COMSPEC,
  };
  for (const key of [
    'WINDIR',
    'TEMP',
    'TMP',
    'PATHEXT',
    'USERPROFILE',
    'HOME',
    'LOCALAPPDATA',
    'APPDATA',
    'CARGO_HOME',
    'RUSTUP_HOME',
    'JAVA_HOME',
    'LIB',
    'LIBPATH',
    'INCLUDE',
  ]) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) environment[key] = value;
  }
  return environment;
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
