import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocked = vi.hoisted(() => ({
  loader: vi.fn(),
  process: vi.fn(),
  root: vi.fn(),
}));

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  () => ({
    runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1:
      mocked.root,
  }),
);
vi.mock(
  './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js',
  () => ({ loadCanonicalBootstrapRequestBoundToSha256: mocked.loader }),
);
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-genesis-setup-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetGenesisSetupWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-genesis-setup-worker-v1.js';

describe('isolated devnet genesis setup execution command V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.loader.mockReturnValue(Object.freeze({
      build: Object.freeze({ source: 'canonical-request' }),
      lifecycle: Object.freeze({ source: 'canonical-request' }),
    }));
    mocked.root.mockResolvedValue({ receipt: executionReceipt() });
    mocked.process.mockResolvedValue({
      pid: 1234,
      exitCode: 0,
      stdout: `${canonicalJson(executionReceipt())}\n`,
      stderr: '',
    });
  });

  it('maps the canonical request only into the static execution root', async () => {
    const requestPath = resolve(tmpdir(), 'fed6lab-request.json');
    const expectedRequestSha256Hex = 'f'.repeat(64);
    const receipt =
      await runSubstrateFederatedIsolatedDevnetGenesisSetupWorkerFromArgumentsV1([
        '--request',
        requestPath,
        '--expected-request-sha256',
        expectedRequestSha256Hex,
      ]);

    expect(receipt).toEqual(executionReceipt());
    expect(mocked.loader).toHaveBeenCalledWith(
      requestPath,
      resolve(process.cwd(), '..'),
      resolve(process.cwd(), '..', '..'),
      expectedRequestSha256Hex,
    );
    expect(mocked.root).toHaveBeenCalledTimes(1);
    expect(mocked.root).toHaveBeenCalledWith(mocked.loader.mock.results[0]?.value);
  });

  it('runs one bounded worker and publishes only the validated receipt', async () => {
    await withFixture(async fixture => {
      const originalNodeOptions = process.env.NODE_OPTIONS;
      const originalUnsafe = process.env.E2S_UNSAFE_TEST_VALUE;
      process.env.NODE_OPTIONS = '--inspect';
      process.env.E2S_UNSAFE_TEST_VALUE = 'must-not-cross';
      try {
        const result =
          await runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--output',
            fixture.outputPath,
          ]);
        expect(result).toEqual({
          status: 'isolated_genesis_setup_execution_receipt_published',
          receiptDigestHex: commandReceipt(
            fixture.requestSha256Hex,
          ).receiptDigestHex,
        });
        expect(readFileSync(fixture.outputPath, 'utf8'))
          .toBe(`${canonicalJson(commandReceipt(
            fixture.requestSha256Hex,
          ))}\n`);

        const processInput = mocked.process.mock.calls[0]?.[0];
        expect(processInput).toMatchObject({
          executablePath: process.execPath,
          cwd: process.cwd(),
          timeoutMs: 90 * 60_000,
          terminationGraceMs: 30_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 64 * 1024,
          label: 'isolated genesis setup execution worker',
        });
        expect(processInput.args).toEqual([
          'node_modules/tsx/dist/cli.mjs',
          expect.stringMatching(
            /run-substrate-federated-isolated-devnet-genesis-setup-worker-v1\.ts$/u,
          ),
          '--request',
          fixture.requestPath,
          '--expected-request-sha256',
          fixture.requestSha256Hex,
        ]);
        expect(processInput.env.NODE_OPTIONS).toBeUndefined();
        expect(processInput.env.E2S_UNSAFE_TEST_VALUE).toBeUndefined();
      } finally {
        restoreEnvironment('NODE_OPTIONS', originalNodeOptions);
        restoreEnvironment('E2S_UNSAFE_TEST_VALUE', originalUnsafe);
      }
    });
  });

  it('rejects occupied, in-worktree, and linked output paths before launch', async () => {
    await withFixture(async fixture => {
      writeFileSync(fixture.outputPath, 'occupied\n', 'utf8');
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('must not already exist');

      const inWorktreeOutput = resolve(
        process.cwd(),
        `.e2s-genesis-setup-test-${process.pid}.json`,
      );
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          inWorktreeOutput,
        ]),
      ).rejects.toThrow('must remain outside the worktree');

      const realParent = join(fixture.root, 'real-output-parent');
      const linkedParent = join(fixture.root, 'linked-output-parent');
      mkdirSync(realParent);
      symlinkSync(realParent, linkedParent, 'junction');
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          join(linkedParent, 'receipt.json'),
        ]),
      ).rejects.toThrow('must be one regular directory');
      expect(mocked.process).not.toHaveBeenCalled();
    });
  });

  it('rejects worker diagnostics and noncanonical output before publication', async () => {
    await withFixture(async fixture => {
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(executionReceipt())}\n`,
        stderr: 'unexpected diagnostic\n',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('emitted diagnostics');
      expect(() => readFileSync(fixture.outputPath, 'utf8')).toThrow();

      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${JSON.stringify(executionReceipt(), null, 2)}\n`,
        stderr: '',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('must be canonical JSON plus one LF');
      expect(() => readFileSync(fixture.outputPath, 'utf8')).toThrow();
    });
  });

  it('rejects authority, target, and transaction drift before publication', async () => {
    await withFixture(async fixture => {
      const variants = [
        mutateReceipt(receipt => {
          receipt.boundaries.publicNetworkUsed = true;
        }),
        mutateReceipt(receipt => {
          receipt.lifecycle.executionTargetIdentityDigestHex = '7'.repeat(64);
        }),
        mutateReceipt(receipt => {
          receipt.transactions[1]!.expectedTxId =
            receipt.transactions[0]!.expectedTxId;
        }),
        mutateReceipt(receipt => {
          receipt.transactions[2]!.role = 'tracker';
        }),
        mutateReceipt(receipt => {
          receipt.transactions[0]!.confirmationHeight = 100;
        }),
        mutateReceipt(receipt => {
          receipt.transactions[1]!.confirmationHeight =
            receipt.transactions[0]!.confirmationHeight;
        }),
        mutateReceipt(receipt => {
          receipt.transactions[2]!.confirmationHeight =
            receipt.transactions[1]!.confirmationHeight - 1;
        }),
      ];
      for (const variant of variants) {
        mocked.process.mockResolvedValueOnce({
          pid: 1234,
          exitCode: 0,
          stdout: `${canonicalJson(variant)}\n`,
          stderr: '',
        });
        await expect(
          runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--output',
            fixture.outputPath,
          ]),
        ).rejects.toThrow();
        expect(() => readFileSync(fixture.outputPath, 'utf8')).toThrow();
      }
    });
  });

  it('rejects malformed arguments before loading or launching anything', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupWorkerFromArgumentsV1([]),
    ).rejects.toThrow('worker arguments are invalid');
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1([
        '--request',
        'only-one-value',
      ]),
    ).rejects.toThrow('arguments are invalid');
    expect(mocked.loader).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('keeps execution distinct from no-submit and statically scoped', () => {
    const launcher = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-genesis-setup-v1.ts',
      import.meta.url,
    ), 'utf8');
    const worker = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-genesis-setup-worker-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(launcher).not.toMatch(/dotenv|ergo-client|state-tracker|node-wallet/iu);
    expect(launcher).not.toContain(
      'runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
    );
    expect(worker).not.toMatch(/dotenv|ergo-client|state-tracker|node-wallet/iu);
    expect(worker.match(
      /runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1/gu,
    )).toHaveLength(2);
    expect(launcher).toContain(
      "process.stderr.write('isolated genesis setup execution failed\\n')",
    );
    expect(worker).toContain(
      "process.stderr.write('isolated genesis setup worker failed\\n')",
    );

    const packageJson = JSON.parse(readFileSync(
      resolve(process.cwd(), 'package.json'),
      'utf8',
    )) as { scripts: Record<string, string> };
    expect(
      packageJson.scripts['federated:isolated:genesis-setup:execute-local'],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-genesis-setup-v1.ts',
    );
    expect(packageJson.scripts['federated:isolated:bootstrap:no-submit'])
      .toBe(
        'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.ts',
      );
  });
});

async function withFixture(
  operation: (fixture: Readonly<{
    root: string;
    requestPath: string;
    requestSha256Hex: string;
    outputPath: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-genesis-setup-command-'));
  try {
    const requestPath = join(root, 'request.json');
    const requestBytes = Buffer.from('{}\n', 'utf8');
    writeFileSync(requestPath, requestBytes);
    await operation({
      root,
      requestPath,
      requestSha256Hex: createHash('sha256')
        .update(requestBytes)
        .digest('hex'),
      outputPath: join(root, 'receipt.json'),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function commandReceipt(commandRequestSha256Hex: string) {
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-setup-command-receipt.v1',
    version: 1,
    status: 'request_bound_local_genesis_setup_execution_completed',
    commandRequestSha256Hex,
    executionReceipt: executionReceipt(),
    checks: {
      exactRequestBytesBoundAcrossParentAndWorker: true,
      executionReceiptValidatedBeforePublication: true,
      createOnlyPublicationUsed: true,
    },
    boundaries: {
      hostileSameUserProcessAttestationEstablished: false,
      independentExecutionAttestationEstablished: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_COMMAND_RECEIPT_V1',
    ),
  };
}

function executionReceipt() {
  const build = buildReceipt();
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-setup-execution-root.v1',
    version: 1,
    status: 'three_local_setup_transactions_canonically_confirmed',
    staticExecutionManifestDigestHex:
      '429dda22a5e5e3c0b62a03bb3c8bd3eacb7339e6603bcf58f6d07ffbbb79adc5',
    build,
    process: {
      schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
      version: 1,
      primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052',
      primaryMiningDuringAction: true,
      witnessReadOnlyDuringAction: true,
      buildIdentityDigestHex: build.buildIdentityDigestHex,
      executableIdentityDigestHex: '4'.repeat(64),
      processBindingDigestHex: '5'.repeat(64),
      executionTargetIdentityDigestHex: '6'.repeat(64),
      initialSnapshot: {
        network: 'devnet',
        fullHeight: 100,
        indexedHeight: 100,
        headerIdHex: 'a'.repeat(64),
      },
      finalSnapshot: {
        network: 'devnet',
        fullHeight: 140,
        indexedHeight: 140,
        headerIdHex: 'b'.repeat(64),
      },
    },
    lifecycle: {
      federationProfileIdHex: 'c'.repeat(64),
      sourceAttestationKeySetDigestHex: 'd'.repeat(64),
      ergoAdmissionKeySetDigestHex: 'e'.repeat(64),
      packetReceiptDigestHex: 'f'.repeat(64),
      setupCheckReceiptDigestHex: '0'.repeat(64),
      setupRequestDigestHex: '1'.repeat(64),
      executionTargetIdentityDigestHex: '6'.repeat(64),
    },
    transactions: [
      transaction(0, 'tracker', '1', 110),
      transaction(1, 'duplicatePrevention', '2', 120),
      transaction(2, 'pooledReserve', '3', 130),
    ],
    checks: {
      exactLockedPatchedNodeBuiltBeforeSignerCreation: true,
      staticExecutionModulesBound: true,
      replacementPortAccepted: false,
      exactCheckedCandidatesConsumedOnce: true,
      exactCanonicalRoleOrderEnforced: true,
      durableReservationPrecededTransport: true,
      predecessorConfirmationPrecededSuccessorAuthorization: true,
      allConfirmedAttemptsRevalidatedBeforeTeardown: true,
      temporaryJournalRemovedAfterResolution: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      localSetupTargetNodeAcceptanceEstablished: true,
      localSetupSubmissionExecuted: true,
      localSetupBroadcastExecuted: true,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      processLossRecoveryEstablished: false,
      sourceConsensusIndependentlyAuthenticated: false,
      ergoConsensusIndependentlyAuthenticated: false,
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
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1',
    ),
  };
}

function buildReceipt() {
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
    checks: Object.fromEntries([
      'exactTrackedRuntimeLockConsumed',
      'exactConsensusSourceLockConsumed',
      'exactPatchedSourceValidatedBeforeBuild',
      'exactPatchedSourceRevalidatedAfterBuild',
      'completeJavaDistributionValidatedBeforeAndAfterBuild',
      'pinnedGitExecutableValidatedBeforeAndAfterBuild',
      'pinnedSbtLauncherValidatedBeforeAndAfterBuild',
      'reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild',
      'fixedJavaArgumentsLaunchedWithoutShell',
      'inheritedBuildEnvironmentMinimized',
      'preexistingAssemblyCandidatesRejected',
      'assemblyPathChainLinkFree',
      'buildProcessTimeBound',
      'buildProcessTreeTerminationBounded',
      'singleFreshAssemblySelected',
    ].map(key => [key, true])),
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
  const { buildIdentityDigestHex: _placeholder, ...identity } = build;
  build.buildIdentityDigestHex = sha256CanonicalJson(
    identity,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1',
  );
  return build;
}

function transaction(
  ordinal: number,
  role: string,
  idSeed: string,
  confirmationHeight: number,
) {
  return {
    ordinal,
    role,
    expectedTxId: idSeed.repeat(64),
    transportStatus: 'accepted',
    durableAttemptDigestHex: '4'.repeat(64),
    journalDigestHex: '5'.repeat(64),
    confirmationDigestHex: '6'.repeat(64),
    confirmationHeight,
    confirmationHeaderIdHex: '7'.repeat(64),
  };
}

type MutableExecutionReceipt = ReturnType<typeof executionReceipt> & {
  boundaries: { publicNetworkUsed: boolean };
  lifecycle: { executionTargetIdentityDigestHex: string };
  transactions: Array<{
    confirmationHeight: number;
    expectedTxId: string;
    role: string;
  }>;
};

function mutateReceipt(
  mutate: (receipt: MutableExecutionReceipt) => void,
) {
  const receipt = structuredClone(executionReceipt()) as MutableExecutionReceipt;
  mutate(receipt);
  const { receiptDigestHex: _discarded, ...body } = receipt;
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1',
    ),
  };
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
