import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, parse, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  environment: vi.fn(),
  load: vi.fn(),
  process: vi.fn(),
  project: vi.fn(),
  root: vi.fn(),
  runtime: vi.fn(),
  wasmBuild: vi.fn(),
  wasmPackageMatches: vi.fn(),
}));

vi.mock('../authenticated-v2-runtime-bundle.js', () => ({
  validatePinnedFederatedCampaignParentRuntime: mocked.runtime,
}));
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));
vi.mock('../substrate-federated-native-two-cycle-invocation-v1.js', () => ({
  loadSubstrateFederatedNativeTwoCycleInvocationV1: mocked.load,
  projectSubstrateFederatedNativeTwoCycleResultV1: mocked.project,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1:
    mocked.environment,
}));
vi.mock('./build-wasm-avl.js', () => ({
  buildWasmAvlPackageV2: mocked.wasmBuild,
}));
vi.mock('../substrate-federated-native-wasm-avl-package-v1.js', () => ({
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1: mocked.wasmPackageMatches,
}));
vi.mock(
  '../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js',
  () => ({ runSubstrateFederatedGenesisTargetRootV1: mocked.root }),
);

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1 } from '../relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 } from '../substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV1 } from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 } from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 } from '../substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 } from '../substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 } from '../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerCycleStepV1, parseNativeTwoCycleParentCycleStepV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1,
  tagSubstrateFederatedTrackerV2BuildFailurePhaseV1,
  parseNativeTwoCycleParentTrackerContextV1,
  SUBSTRATE_FEDERATED_TRACKER_V2_STATEMENT_FAILURE_CHECKS_V1,
  tagSubstrateFederatedTrackerV2StatementFailureCheckV1,
  parseNativeTwoCycleParentTrackerStatementV1 }
  from '../substrate-federated-tracker-context-failure-v1.js';
import { SUBSTRATE_FEDERATED_NATIVE_SOURCE_LOCK_FAILURE_STAGES_V1,
  tagSubstrateFederatedNativeSourceLockFailureStageV1,
  parseNativeTwoCycleParentSourceLockStageV1 }
  from '../substrate-federated-native-source-lock-failure-v1.js';
import { SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1,
  tagSubstrateFederatedNativeCommittedReserveFailureStageV1,
  parseNativeTwoCycleParentCommittedReserveStageV1 }
  from '../substrate-federated-native-committed-reserve-failure-v1.js';
import { tagNativeCommittedReserveRevalidationOriginV1,
  parseNativeTwoCycleParentCommittedReserveRevalidationV1 }
  from '../substrate-federated-native-committed-reserve-revalidation-v1.js';
import { tagNativeCommittedReserveConfirmationOriginV1,
  parseNativeTwoCycleParentCommittedReserveConfirmationV1 }
  from '../substrate-federated-native-committed-reserve-confirmation-v1.js';
import { tagNativeGenesisSetupFailureStageV1 }
  from '../substrate-federated-native-genesis-setup-stage-v1.js';
import { parseNativeTwoCycleParentSetupStageV1 }
  from '../substrate-federated-native-two-cycle-setup-stage-diagnostic-v1.js';
import { ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1,
  tagIsolatedErgoNodeCompletionFailureReasonV1,
  tagIsolatedErgoNodePostCallbackStageV1 }
  from '../substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { parseNativeTwoCycleParentOwnerStageV1,
  parseNativeTwoCycleParentOwnerStageV2 }
  from '../substrate-federated-native-two-cycle-owner-stage-diagnostic-v1.js';
import { beginNativeTwoCycleCallbackTimingV1, tagNativeTwoCycleCallbackTimingFailureV1,
  parseNativeTwoCycleParentCallbackTimingV1 }
  from '../substrate-federated-native-two-cycle-callback-timing-v1.js';
import { createNativeTwoCycleWorkerRecoveryLocatorV1,
  parseNativeTwoCycleParentRecoveryLocatorV1 }
  from '../substrate-federated-native-two-cycle-recovery-locator-v1.js';
import {
  runSubstrateFederatedNativeTwoCycleFromArguments,
} from './run-substrate-federated-native-two-cycle-v1.js';
import {
  runSubstrateFederatedNativeTwoCycleWorkerFromArguments,
} from './run-substrate-federated-native-two-cycle-worker-v1.js';

const temporaryRoots: string[] = [];
const bridgeRoot = resolve(import.meta.dirname, '..', '..', '..');
const WORKER_WASM_PACKAGE_EVIDENCE_FIELDS: readonly {
  readonly name: string;
  readonly path: readonly string[];
  readonly replacement?: string;
}[] = [
  { name: 'schema', path: ['schema'] },
  { name: 'version', path: ['version'] },
  { name: 'status', path: ['status'] },
  { name: 'bridgeCommit', path: ['bridgeCommit'] },
  { name: 'bridgeTree', path: ['bridgeTree'] },
  { name: 'source digest', path: ['build', 'sourceSha256Hex'] },
  { name: 'package digest', path: ['build', 'packageSha256Hex'] },
  { name: 'wasm-pack version', path: ['build', 'wasmPackVersion'] },
  {
    name: 'wasm-pack hash', path: ['build', 'wasmPackExecutableSha256Hex'],
    replacement: '0'.repeat(64),
  },
  { name: 'wasm-bindgen version', path: ['build', 'wasmBindgenVersion'] },
  {
    name: 'wasm-bindgen hash', path: ['build', 'wasmBindgenExecutableSha256Hex'],
    replacement: '0'.repeat(64),
  },
  { name: 'rustc version', path: ['build', 'rustcVersion'] },
  {
    name: 'rustc hash', path: ['build', 'rustcExecutableSha256Hex'],
    replacement: '0'.repeat(64),
  },
  { name: 'Cargo version', path: ['build', 'cargoVersion'] },
  {
    name: 'Cargo hash', path: ['build', 'cargoExecutableSha256Hex'],
    replacement: '0'.repeat(64),
  },
];
const PARENT_WORKER_WASM_CHECK_FIELDS = [
  { name: 'schema', path: ['schema'] },
  { name: 'version', path: ['version'] },
  { name: 'status', path: ['status'] },
  { name: 'bridgeCommit', path: ['bridgeCommit'] },
  { name: 'bridgeTree', path: ['bridgeTree'] },
  { name: 'source digest', path: ['sourceSha256Hex'] },
  { name: 'package digest', path: ['packageSha256Hex'] },
  { name: 'pre-import identity', path: ['checks', 'matchedBeforeImport'] },
  { name: 'post-import identity', path: ['checks', 'matchedAfterImport'] },
  { name: 'post-root identity', path: ['checks', 'matchedAfterRoot'] },
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocked.wasmBuild.mockReturnValue(wasmPackageIdentity());
  mocked.wasmPackageMatches.mockImplementation(() => undefined);
  mocked.environment.mockResolvedValue(environment());
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('native two-cycle parent and worker V1', () => {
  it('records start, launches one bounded worker, and publishes only after clean exit', async () => {
    vi.stubEnv('JAVA_HOME', 'unreviewed-parent-java-home');
    vi.stubEnv('CARGO_HOME', 'unreviewed-parent-cargo-home');
    const fixture = commandFixture();
    const result = projectedResult();
    configureParent(fixture, result);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    mocked.process.mockImplementationOnce(async input => {
      mkdirSync(
        join(
          fixture.loaded.config.ergoSourcePath,
          'target',
          'bridge-sbt-state-v1',
        ),
        { recursive: true },
      );
      const assemblyDirectory = join(
        fixture.loaded.config.ergoSourcePath,
        'target',
        'scala-2.12',
      );
      mkdirSync(assemblyDirectory, { recursive: true });
      writeFileSync(join(assemblyDirectory, 'ergo-built.jar'), 'fresh assembly');
      writeWorkerTransport(fixture, result);
      entered();
      await blocked;
      return cleanProcessResult(input);
    });

    const running = runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ]);
    await started;
    expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    release();
    const published = await running;

    expect(published.status).toBe('two_cycle_terminal_receipt_published');
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(true);
    const terminal = JSON.parse(readFileSync(join(fixture.attemptPath, 'result.json'), 'utf8'));
    const workerRecoveryText = readFileSync(
      join(fixture.attemptPath, 'worker-recovery-locator-v1.json'), 'utf8');
    const parentRecovery = parseNativeTwoCycleParentRecoveryLocatorV1(
      readFileSync(join(fixture.attemptPath, 'recovery-locator-v1.json'), 'utf8'),
      { configSha256Hex: fixture.loaded.configSha256Hex,
        bridgeCommit: environment().repository.commit,
        bridgeTree: environment().repository.tree,
        pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
        toolIdentityDigestHex: environment().toolIdentityDigestHex,
        rootResultDigestHex: result.rootResultDigestHex },
      terminal.receiptDigestHex, workerRecoveryText,
    );
    expect(parentRecovery.locator).toMatchObject({
      buildDirectoryName: 'bridge-fed-genesis-ABC123',
      directoryName: 'two-cycle-recovery-ABC123',
    });
    expect(Object.keys(terminal).sort()).toEqual([
      'schema', 'version', 'status', 'configSha256Hex', 'bridgeCommit',
      'bridgeTree', 'pathIdentityDigestHex', 'toolIdentityDigestHex', 'result',
      'checks', 'boundaries', 'receiptDigestHex',
    ].sort());
    expect(existsSync(join(fixture.attemptPath, 'wasm-avl-package.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'worker-wasm-avl-package.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(false);
    expect(mocked.environment).toHaveBeenCalledTimes(3);
    expect(mocked.wasmBuild).toHaveBeenCalledOnce();
    expect(mocked.wasmPackageMatches).toHaveBeenCalledTimes(2);
    expect(mocked.process).toHaveBeenCalledOnce();
    const processInput = mocked.process.mock.calls[0]?.[0];
    const canonicalAttemptPath = realpathSync.native(fixture.attemptPath);
    expect(processInput.executablePath).toBe(process.execPath);
    expect(processInput.args).toEqual([
      ...process.execArgv,
      expect.stringMatching(/run-substrate-federated-native-two-cycle-worker-v1\.ts$/u),
      '--config',
      join(canonicalAttemptPath, 'config.json'),
      '--expected-config-sha256',
      fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256',
      wasmPackageIdentity().packageSha256Hex,
      '--attempt',
      canonicalAttemptPath,
    ]);
    expect(processInput.env.NODE_OPTIONS).toBeUndefined();
    expect(processInput.env.NODE_PATH).toBeUndefined();
    expect(processInput.env.JAVA_HOME)
      .toBe(dirname(dirname(fixture.loaded.config.ergoJavaExecutablePath)));
    expect(processInput.env.CARGO_HOME).toBe(fixture.loaded.config.frontierCargoHomeDirectory);
    expect(processInput.env.SystemDrive)
      .toBe(parse(processInput.env.SystemRoot).root.replace(/[\\/]+$/u, ''));
    expect(processInput.env.PATH.split(delimiter)[0])
      .toBe(dirname(environment().runtime.gitExecutablePath));
    expect(processInput.env.Path).toBeUndefined();
  });

  it('does not launch when the fresh attempt cannot be created', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mkdirSync(fixture.attemptPath);
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it.each(['missing worker locator', 'tampered worker locator',
    'missing capture manifest', 'changed capture manifest', 'occupied parent locator'] as const)(
    'withholds terminal success for %s', async fault => {
      const fixture = commandFixture();
      const result = projectedResult();
      configureParent(fixture, result);
      mocked.process.mockImplementationOnce(async input => {
        writeWorkerTransport(fixture, result);
        const workerPath = join(fixture.attemptPath, 'worker-recovery-locator-v1.json');
        if (fault === 'missing worker locator') rmSync(workerPath);
        if (fault === 'tampered worker locator') {
          writeFileSync(workerPath, readFileSync(workerPath, 'utf8').replace(
            'bridge-fed-genesis-ABC123', 'bridge-fed-genesis-ABC124'));
        }
        if (fault === 'missing capture manifest' || fault === 'changed capture manifest') {
          const manifestPath = join(fixture.loaded.config.frontierBuildParentDirectory,
            'bridge-fed-genesis-ABC123', 'target', 'two-cycle-recovery-ABC123',
            'manifest.json');
          if (fault === 'missing capture manifest') rmSync(manifestPath);
          else writeFileSync(manifestPath, 'changed manifest bytes\n');
        }
        if (fault === 'occupied parent locator') {
          writeFileSync(join(fixture.attemptPath, 'recovery-locator-v1.json'),
            'retained parent locator bytes');
        }
        return cleanProcessResult(input);
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toThrow();
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(true);
      if (fault === 'occupied parent locator') {
        expect(readFileSync(join(fixture.attemptPath, 'recovery-locator-v1.json'), 'utf8'))
          .toBe('retained parent locator bytes');
      }
    });

  it.each([
    'missing compiler dependency root',
    'tampered direct compiler JAR',
  ] as const)(
    'rejects %s before the WASM build or create-only attempt',
    async condition => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const failure = new Error(`${condition} rejected by invocation environment`);
      mocked.environment.mockRejectedValueOnce(failure);

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(failure);

      expect(mocked.environment).toHaveBeenCalledOnce();
      expect(mocked.wasmBuild).not.toHaveBeenCalled();
      expect(mocked.wasmPackageMatches).not.toHaveBeenCalled();
      expect(existsSync(fixture.attemptPath)).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(false);
      expect(mocked.process).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    },
  );

  it('rejects compiler runtime drift after WASM build before attempt creation or worker launch', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const failure = new Error('tampered direct compiler JAR after WASM build');
    mocked.environment
      .mockResolvedValueOnce(environment())
      .mockRejectedValueOnce(failure);

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(failure);

    expect(mocked.environment).toHaveBeenCalledTimes(2);
    expect(mocked.wasmBuild).toHaveBeenCalledOnce();
    expect(mocked.wasmPackageMatches).toHaveBeenCalledOnce();
    expect(existsSync(fixture.attemptPath)).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(false);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('fails closed if source or tool build evidence changes during worker execution', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mocked.process.mockImplementationOnce(async input => {
      const evidencePath = join(fixture.attemptPath, 'wasm-avl-package.json');
      const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
        build: { rustcExecutableSha256Hex: string };
      };
      evidence.build.rustcExecutableSha256Hex = 'f'.repeat(64);
      writeFileSync(evidencePath, `${canonicalJson(evidence)}\n`, 'utf8');
      writeWorkerTransport(fixture, projectedResult());
      return cleanProcessResult(input);
    });

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/build evidence changed/iu);

    expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it.each(PARENT_WORKER_WASM_CHECK_FIELDS)(
    'parent rejects a tampered worker WASM check field: $name',
    async ({ path: fieldPath }) => {
      const fixture = commandFixture();
      const result = projectedResult();
      configureParent(fixture, result);
      mocked.process.mockImplementationOnce(async input => {
        writeWorkerTransport(fixture, result);
        const checkPath = join(fixture.attemptPath, 'worker-wasm-avl-package.json');
        const check = JSON.parse(readFileSync(checkPath, 'utf8')) as Record<string, unknown>;
        mutateJsonPath(check, fieldPath);
        writeCanonicalJson(checkPath, check);
        return cleanProcessResult(input);
      });

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toThrow();
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    },
  );

  it('rejects a failed source-locked WASM build before attempt creation', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mocked.wasmBuild.mockImplementationOnce(() => {
      throw new Error('generated WASM AVL package build failed');
    });

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/generated WASM AVL package/iu);

    expect(mocked.wasmBuild).toHaveBeenCalledWith(
      fixture.loaded.config.bridgeRoot,
      { quiet: true },
    );
    expect(mocked.environment).toHaveBeenCalledOnce();
    expect(existsSync(fixture.attemptPath)).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(false);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('rejects a pre-existing matching Ergo assembly before creating an attempt', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const assemblyDirectory = join(
      fixture.loaded.config.ergoSourcePath,
      'target',
      'scala-2.12',
    );
    mkdirSync(assemblyDirectory, { recursive: true });
    writeFileSync(join(assemblyDirectory, 'ergo-stale.jar'), 'stale assembly');

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/assembly-free output directory/iu);

    expect(existsSync(fixture.attemptPath)).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(false);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('rejects pre-existing isolated SBT state before creating an attempt', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mkdirSync(
      join(
        fixture.loaded.config.ergoSourcePath,
        'target',
        'bridge-sbt-state-v1',
      ),
      { recursive: true },
    );

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/sbt state directory must not pre-exist/iu);

    expect(existsSync(fixture.attemptPath)).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'start.json'))).toBe(false);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('does not launch when the create-only start record cannot be written', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mocked.load
      .mockImplementationOnce(() => fixture.loaded)
      .mockImplementationOnce(() => {
        mkdirSync(join(fixture.attemptPath, 'start.json'));
        return fixture.loaded;
      });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow();
    expect(mocked.process).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it.each([
    'bridge HEAD differs',
    'bridge checkout is dirty',
    'tool identity changed',
    'parent runtime differs',
    'captured config changed',
  ])('fails closed before launch when %s', async message => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mocked.environment.mockRejectedValueOnce(new Error(message));
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(message);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(existsSync(fixture.attemptPath)).toBe(false);
  });

  it('preserves the primary worker failure when the postcheck also fails', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const primary = new Error('root execution failed');
    mocked.process.mockRejectedValueOnce(primary);
    mocked.environment
      .mockResolvedValueOnce(environment())
      .mockResolvedValueOnce(environment())
      .mockRejectedValueOnce(new Error('postcheck identity failed'));
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);
    expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);

    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow();
    expect(mocked.process).toHaveBeenCalledTimes(1);
  });

  it('records contained timeout classification without claiming cleanup', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const primary = new Error('native two-cycle worker timed out after contained process tree termination');
    mocked.process.mockImplementationOnce(async () => {
      mkdirSync(
        join(
          fixture.loaded.config.ergoSourcePath,
          'target',
          'bridge-sbt-state-v1',
        ),
        { recursive: true },
      );
      const assemblyDirectory = join(
        fixture.loaded.config.ergoSourcePath,
        'target',
        'scala-2.12',
      );
      mkdirSync(assemblyDirectory, { recursive: true });
      writeFileSync(join(assemblyDirectory, 'ergo-built.jar'), 'fresh assembly');
      throw primary;
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);
    const failure = JSON.parse(readFileSync(
      join(fixture.attemptPath, 'failure.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(failure.failureClass).toBe('contained_process_failure');
    expect((failure.checks as Record<string, unknown>).postFailureIdentityCheckPassed)
      .toBe(true);
    expect((failure.boundaries as Record<string, unknown>).rootCleanupEstablishedByTimeout)
      .toBe(false);
  });

  it('binds a worker source-phase diagnostic to the unchanged terminal failure receipt', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const primary = createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      'source target Frontier build', new Error('private build failure detail'),
    );
    mocked.root.mockRejectedValueOnce(primary);
    mocked.process.mockImplementationOnce(async input => {
      await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(-8));
      throw new Error('worker unexpectedly completed');
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);
    const failure = JSON.parse(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'));
    expect(Object.keys(failure).sort()).toEqual([
      'boundaries', 'checks', 'configSha256Hex', 'expectedBridgeCommit',
      'failureClass', 'receiptDigestHex', 'schema', 'status', 'version',
    ]);
    expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
      .toBe(expectedTerminalFailure(fixture));
    const worker = JSON.parse(readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8'));
    const sidecarText = readFileSync(join(fixture.attemptPath, 'failure-diagnostic.json'), 'utf8');
    expect(JSON.parse(sidecarText)).toMatchObject({
      failureReceiptDigestHex: failure.receiptDigestHex,
      workerFailureReceiptDigestHex: worker.receiptDigestHex,
      stage: 'root-or-cleanup', sourceFailurePhase: 'source target Frontier build',
      rootCleanupEstablished: false, rawCausePublished: false,
    });
    expect(sidecarText).not.toContain('private');
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    expect(mocked.root).toHaveBeenCalledOnce();
  });

  it('binds a root phase companion to the existing failure receipts without changing them', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
      new Error('private Ergo build detail'), 'ergo-build',
    );
    mocked.root.mockRejectedValueOnce(primary);
    mocked.process.mockImplementationOnce(async input => {
      await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(-8));
      throw new Error('worker unexpectedly completed');
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);
    expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
      .toBe(expectedTerminalFailure(fixture));
    const failure = JSON.parse(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'));
    const workerFailureText = readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8');
    const workerRootText = readFileSync(join(fixture.attemptPath, 'worker-root-phase.json'), 'utf8');
    const parentRootText = readFileSync(join(fixture.attemptPath, 'failure-root-phase.json'), 'utf8');
    const parentRoot = JSON.parse(parentRootText);
    expect(parentRoot).toMatchObject({
      failureReceiptDigestHex: failure.receiptDigestHex,
      workerFailureReceiptDigestHex: JSON.parse(workerFailureText).receiptDigestHex,
      workerRootPhaseReceiptDigestHex: JSON.parse(workerRootText).receiptDigestHex,
      primaryPhase: 'ergo-build', cleanupErrorCount: 0,
      rootCleanupEstablished: false, rawCausePublished: false,
    });
    expect(workerRootText + parentRootText).not.toContain('private Ergo build detail');
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it('binds V2 startup detail through worker and parent without changing V1 or terminal bytes', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
      new Error('private Ergo startup detail'), 'node-start', 'ergo node primary readiness',
    );
    mocked.root.mockRejectedValueOnce(primary);
    mocked.process.mockImplementationOnce(async input => {
      await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(-8));
      throw new Error('worker unexpectedly completed');
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);

    const failureText = readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8');
    expect(failureText).toBe(expectedTerminalFailure(fixture));
    const failure = JSON.parse(failureText);
    const workerFailure = JSON.parse(readFileSync(
      join(fixture.attemptPath, 'worker-failure.json'), 'utf8',
    ));
    const workerRootV1Text = readFileSync(join(fixture.attemptPath, 'worker-root-phase.json'), 'utf8');
    const parentRootV1Text = readFileSync(join(fixture.attemptPath, 'failure-root-phase.json'), 'utf8');
    const workerRootV2Text = readFileSync(join(fixture.attemptPath, 'worker-root-phase-v2.json'), 'utf8');
    const parentRootV2Text = readFileSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'), 'utf8');
    const parentRootV2 = JSON.parse(parentRootV2Text);
    expect(parentRootV2).toMatchObject({
      failureReceiptDigestHex: failure.receiptDigestHex,
      workerFailureReceiptDigestHex: workerFailure.receiptDigestHex,
      workerRootPhaseV2ReceiptDigestHex: JSON.parse(workerRootV2Text).receiptDigestHex,
      primaryPhase: 'node-start', cleanupErrorCount: 0,
      ergoNodeStartupPhase: 'ergo node primary readiness',
      rootCleanupEstablished: false, rawCausePublished: false,
    });
    expect(JSON.parse(workerRootV1Text)).not.toHaveProperty('ergoNodeStartupPhase');
    expect(JSON.parse(parentRootV1Text)).not.toHaveProperty('ergoNodeStartupPhase');
    expect(workerRootV1Text + parentRootV1Text + workerRootV2Text + parentRootV2Text)
      .not.toContain('private Ergo startup detail');
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it.each(['missing', 'invalid', 'foreign', 'occupied'] as const)(
    'preserves V1 and terminal receipts when worker V2 root detail is %s', async fault => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = new Error('private worker startup failure');
      mocked.process.mockImplementationOnce(async () => {
        const workerFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
          failureBindings(fixture), 'root-or-cleanup', primary,
        );
        writeFileSync(join(fixture.attemptPath, 'worker-failure.json'),
          `${canonicalJson(workerFailure)}\n`);
        const workerRootV1 = createNativeTwoCycleWorkerRootPhaseV1(
          failureBindings(fixture),
          { primaryPhase: 'node-start', cleanupErrorCount: 0 },
        );
        writeFileSync(join(fixture.attemptPath, 'worker-root-phase.json'),
          `${canonicalJson(workerRootV1)}\n`);
        if (fault !== 'missing') {
          const workerRootV2 = createNativeTwoCycleWorkerRootPhaseV2(
            fault === 'foreign'
              ? { ...failureBindings(fixture), configSha256Hex: '9'.repeat(64) }
              : failureBindings(fixture),
            { primaryPhase: 'node-start', cleanupErrorCount: 0,
              ergoNodeStartupPhase: 'ergo node primary readiness' },
          );
          writeFileSync(join(fixture.attemptPath, 'worker-root-phase-v2.json'),
            fault === 'invalid' ? '{}\n' : `${canonicalJson(workerRootV2)}\n`);
        }
        if (fault === 'occupied') {
          writeFileSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'), 'retained V2 bytes');
        }
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
        .toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'failure-root-phase.json'))).toBe(true);
      if (fault === 'occupied') {
        expect(readFileSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'), 'utf8'))
          .toBe('retained V2 bytes');
      } else {
        expect(existsSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'))).toBe(false);
      }
    },
  );

  it.each(['missing', 'invalid', 'foreign', 'occupied'] as const)(
    'preserves existing failure receipts when worker root companion is %s', async fault => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = new Error('worker execution failed');
      mocked.process.mockImplementationOnce(async () => {
        const workerFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
          failureBindings(fixture), 'root-or-cleanup', primary,
        );
        writeFileSync(join(fixture.attemptPath, 'worker-failure.json'),
          `${canonicalJson(workerFailure)}\n`);
        if (fault !== 'missing') {
          const workerRoot = createNativeTwoCycleWorkerRootPhaseV1(
            fault === 'foreign'
              ? { ...failureBindings(fixture), configSha256Hex: '9'.repeat(64) }
              : failureBindings(fixture),
            { primaryPhase: 'ergo-build', cleanupErrorCount: 0 },
          );
          writeFileSync(join(fixture.attemptPath, 'worker-root-phase.json'),
            fault === 'invalid' ? '{}\n' : `${canonicalJson(workerRoot)}\n`);
        }
        if (fault === 'occupied') {
          writeFileSync(join(fixture.attemptPath, 'failure-root-phase.json'), 'retained bytes');
        }
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
        .toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'failure-diagnostic.json'))).toBe(true);
      if (fault === 'occupied') {
        expect(readFileSync(join(fixture.attemptPath, 'failure-root-phase.json'), 'utf8'))
          .toBe('retained bytes');
      } else {
        expect(existsSync(join(fixture.attemptPath, 'failure-root-phase.json'))).toBe(false);
      }
    },
  );

  it.each(['missing', 'malformed', 'foreign', 'digest', 'oversized'] as const)(
    'preserves identical terminal failure bytes with a %s diagnostic', async fault => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = new Error('worker execution failed');
      mocked.process.mockImplementationOnce(async () => {
        const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1({
          ...failureBindings(fixture),
          ...(fault === 'foreign' ? { configSha256Hex: '9'.repeat(64) } : {}),
        }, 'root-or-cleanup', primary);
        const text = fault === 'malformed' ? '{}\n'
          : fault === 'oversized' ? 'x'.repeat(16 * 1024 + 1)
          : `${canonicalJson(fault === 'digest'
            ? { ...diagnostic, receiptDigestHex: '0'.repeat(64) } : diagnostic)}\n`;
        if (fault !== 'missing') writeFileSync(join(fixture.attemptPath, 'worker-failure.json'), text);
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
        .toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'failure-diagnostic.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    },
  );

  it.each(['failure.json', 'failure-diagnostic.json'] as const)(
    'preserves the primary error and existing bytes when %s cannot be published', async occupied => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = new Error('worker execution failed');
      mocked.process.mockImplementationOnce(async () => {
        const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1(
          failureBindings(fixture), 'root-or-cleanup', primary,
        );
        writeFileSync(join(fixture.attemptPath, 'worker-failure.json'), `${canonicalJson(diagnostic)}\n`);
        writeFileSync(join(fixture.attemptPath, occupied), 'retained bytes');
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, occupied), 'utf8')).toBe('retained bytes');
      if (occupied === 'failure.json') {
        expect(existsSync(join(fixture.attemptPath, 'failure-diagnostic.json'))).toBe(false);
      } else {
        expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
          .toBe(expectedTerminalFailure(fixture));
      }
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    },
  );

  it('rejects contradictory worker success and failure artifacts', async () => {
    const fixture = commandFixture();
    const result = projectedResult();
    configureParent(fixture, result);
    mocked.process.mockImplementationOnce(async input => {
      writeWorkerTransport(fixture, result);
      writeFileSync(join(fixture.attemptPath, 'worker-failure.json'), '{}\n');
      return cleanProcessResult(input);
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/contradictory failure evidence/iu);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(true);
  });

  it.each(['worker-root-phase.json', 'worker-root-phase-v2.json', 'worker-cycle-step.json',
    'worker-tracker-context.json', 'worker-tracker-statement.json', 'failure-tracker-statement.json',
    'worker-setup-stage.json', 'worker-owner-stage.json',
    'worker-owner-stage-v2.json', 'worker-source-lock-stage.json',
    'worker-committed-reserve-stage.json', 'failure-committed-reserve-stage.json',
    'worker-committed-reserve-revalidation.json', 'failure-committed-reserve-revalidation.json',
    'worker-committed-reserve-confirmation.json', 'failure-committed-reserve-confirmation.json',
    'worker-callback-timing-v1.json', 'failure-callback-timing-v1.json'] as const)(
    'rejects a worker root phase companion %s alongside a success transport', async artifact => {
    const fixture = commandFixture();
    const result = projectedResult();
    configureParent(fixture, result);
    mocked.process.mockImplementationOnce(async input => {
      writeWorkerTransport(fixture, result);
      writeFileSync(join(fixture.attemptPath, artifact), '{}\n');
      return cleanProcessResult(input);
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/contradictory failure evidence/iu);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it('withholds success when repository identity drifts after worker exit', async () => {
    const fixture = commandFixture();
    configureParent(fixture, projectedResult());
    mocked.environment
      .mockResolvedValueOnce(environment())
      .mockResolvedValueOnce({
        ...environment(),
        repository: { commit: '2'.repeat(40), tree: '4'.repeat(40), clean: true },
      });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toThrow(/identities differ|identity changed/iu);
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
  });

  it('worker rechecks before and after one root call, then writes one transport', async () => {
    const fixture = workerFixture();
    const recoveryEvidence = writeRecoveryManifestFixture(fixture);
    const order: string[] = [];
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockImplementation(async () => {
      order.push('validate');
      return environment();
    });
    mocked.root.mockImplementation(async () => {
      order.push('root');
      order.push('cleanup-complete');
      return { root: 'result', recoveryEvidence };
    });
    mocked.project.mockImplementation(value => {
      order.push('project');
      expect(value).toEqual({ root: 'result', recoveryEvidence });
      return projectedResult();
    });

    await runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ]);

    expect(mocked.root).toHaveBeenCalledOnce();
    expect(mocked.root).toHaveBeenCalledWith(fixture.loaded.rootInput);
    expect(order).toEqual([
      'validate', 'root', 'cleanup-complete', 'project', 'validate',
    ]);
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'worker-recovery-locator-v1.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(false);
  });

  it('withholds root execution when package bytes change after module import', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    mocked.wasmPackageMatches
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw new Error('package digest changed after import'); });

    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/package digest changed/iu);

    expect(mocked.wasmPackageMatches).toHaveBeenCalledTimes(2);
    expect(mocked.root).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(true);
  });

  it('withholds successful transport when package bytes change after root cleanup', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    mocked.root.mockResolvedValue({ root: 'result' });
    mocked.project.mockReturnValue(projectedResult());
    mocked.wasmPackageMatches
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw new Error('package digest changed after root'); });

    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/package digest changed/iu);

    expect(mocked.root).toHaveBeenCalledOnce();
    expect(mocked.wasmPackageMatches).toHaveBeenCalledTimes(3);
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'worker-wasm-avl-package.json'))).toBe(false);
  });

  it.each(['pre-root', 'root-or-cleanup', 'projection', 'post-root-identity'] as const)(
    'worker retains the bounded %s failure stage without its raw cause', async stage => {
      const fixture = workerFixture();
      mocked.load.mockReturnValue(fixture.loaded);
      mocked.environment.mockResolvedValue(environment());
      mocked.root.mockResolvedValue({ root: 'result' });
      mocked.project.mockReturnValue(projectedResult());
      const primary = new AggregateError([
        new Error('private execution detail'), new Error('private cleanup detail'),
      ], 'private aggregate detail');
      if (stage === 'pre-root') mocked.environment.mockRejectedValueOnce(primary);
      if (stage === 'root-or-cleanup') mocked.root.mockRejectedValueOnce(primary);
      if (stage === 'projection') mocked.project.mockImplementationOnce(() => { throw primary; });
      if (stage === 'post-root-identity') mocked.environment
        .mockResolvedValueOnce(environment()).mockRejectedValueOnce(primary);

      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
        '--config', fixture.configPath, '--expected-config-sha256',
        fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
        '--attempt', fixture.attemptPath,
      ])).rejects.toBe(primary);
      const text = readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8');
      expect(JSON.parse(text)).toMatchObject({
        stage, configSha256Hex: fixture.loaded.configSha256Hex,
        expectedBridgeCommit: fixture.loaded.config.expectedBridgeCommit,
        pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
        rootCleanupEstablished: false, rawCausePublished: false, sourceFailurePhase: null,
      });
      expect(text).not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'worker-root-phase.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
      expect(mocked.root).toHaveBeenCalledTimes(stage === 'pre-root' ? 0 : 1);
    },
  );

  it.each(['cycle-1', 'cycle-2'] as const)(
    'carries the actual worker %s failure through the terminal parent consumer', async cycle => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private cause'), cycle);
      tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'tracker-check');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      const failureText = readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8');
      expect(failureText).toBe(expectedTerminalFailure(fixture));
      const companion = parseNativeTwoCycleParentCycleStepV1(
        readFileSync(join(fixture.attemptPath, 'failure-cycle-step.json'), 'utf8'),
        failureBindings(fixture), JSON.parse(failureText).receiptDigestHex,
        readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8'),
        readFileSync(join(fixture.attemptPath, 'worker-root-phase-v2.json'), 'utf8'),
        readFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'), 'utf8'));
      expect(companion).toMatchObject({ cycle, step: 'tracker-check',
        rootCleanupEstablished: false, operationCompletionEstablished: false, rawCausePublished: false });
      expect(mocked.root).toHaveBeenCalledOnce();
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-start.json'))).toBe(true);
    });

  it('carries a real worker setup operation tag through exact terminal ancestry', async () => {
    const fixture = commandFixture(); configureParent(fixture, projectedResult());
    const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private cause'), 'cycle-1');
    tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'setup-check');
    tagNativeGenesisSetupFailureStageV1(primary, 'tracker-node-check');
    mocked.root.mockRejectedValueOnce(primary);
    mocked.process.mockImplementationOnce(async input => {
      await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
      throw new Error('unexpected worker success');
    });
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath])).rejects.toBe(primary);
    const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
    expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
    const companion = parseNativeTwoCycleParentSetupStageV1(read('failure-setup-stage.json'),
      failureBindings(fixture), JSON.parse(read('failure.json')).receiptDigestHex,
      read('worker-failure.json'), read('worker-root-phase-v2.json'), read('worker-cycle-step.json'),
      read('worker-setup-stage.json'));
    expect(companion).toMatchObject({ cycle: 'cycle-1', step: 'setup-check', setupStage: 'tracker-node-check',
      operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
    expect(read('worker-setup-stage.json') + read('failure-setup-stage.json')).not.toContain('private');
    expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    expect(existsSync(join(fixture.attemptPath, 'worker-start.json'))).toBe(true);
  });

  it.each(ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1)(
    'carries a live %s owner tag through exact failure ancestry', async ownerStage => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagIsolatedErgoNodePostCallbackStageV1(new Error('private owner cause'), ownerStage);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const companion = parseNativeTwoCycleParentOwnerStageV1(read('failure-owner-stage.json'),
        failureBindings(fixture), JSON.parse(read('failure.json')).receiptDigestHex,
        read('worker-failure.json'), read('worker-root-phase-v2.json'), read('worker-cycle-step.json'),
        read('worker-owner-stage.json'));
      expect(companion).toMatchObject({ cycle: 'cycle-1', step: 'cycle-summary', ownerStage,
        ownerOperation: 'withMiningActiveExecutionTarget', operationCompletionEstablished: false,
        rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('worker-owner-stage.json') + read('failure-owner-stage.json')).not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-owner-stage-v2.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'failure-owner-stage-v2.json'))).toBe(false);
    });

  it.each(['valid', 'missing trace', 'occupied worker', 'occupied parent', 'tampered worker',
    'occupied owner V2', 'tampered parent owner V2', 'cleanup aggregate'] as const)(
    'callback timing worker parent join preserves failure for %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagIsolatedErgoNodeCompletionFailureReasonV1(
        tagIsolatedErgoNodePostCallbackStageV1(new Error('private timing failure'), 'completion-check'),
        'budget-exceeded');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      let now = 123_456;
      const recorder = beginNativeTwoCycleCallbackTimingV1(() => now);
      now += 1234; recorder.record('target-entry'); now += 200; recorder.record('cycle-summary');
      const trace = recorder.finish();
      if (fault !== 'missing trace') tagNativeTwoCycleCallbackTimingFailureV1(primary, trace);
      const thrown = fault === 'cleanup aggregate'
        ? new AggregateError([primary, new Error('cleanup')], 'failed cleanup') : primary;
      mocked.root.mockRejectedValueOnce(thrown);
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker' || fault === 'occupied owner V2') {
          writeFileSync(join(fixture.attemptPath, fault === 'occupied worker'
            ? 'worker-callback-timing-v1.json' : 'worker-owner-stage-v2.json'), 'retained bytes');
        }
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(thrown);
          if (fault === 'tampered worker') {
            const path = join(fixture.attemptPath, 'worker-callback-timing-v1.json');
            const worker = JSON.parse(readFileSync(path, 'utf8'));
            writeFileSync(path, `${canonicalJson({ ...worker, receiptDigestHex: '9'.repeat(64) })}\n`);
          }
          if (fault === 'occupied parent' || fault === 'tampered parent owner V2') {
            writeFileSync(join(fixture.attemptPath, fault === 'occupied parent'
              ? 'failure-callback-timing-v1.json' : 'failure-owner-stage-v2.json'), 'retained bytes');
          }
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(thrown);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      if (fault !== 'cleanup aggregate') expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'failure-cycle-step.json'))).toBe(true);
      if (fault === 'valid') {
        const parent = parseNativeTwoCycleParentCallbackTimingV1(read('failure-callback-timing-v1.json'),
          failureBindings(fixture), JSON.parse(read('failure.json')).receiptDigestHex, {
            workerFailureText: read('worker-failure.json'), workerRootPhaseV2Text: read('worker-root-phase-v2.json'),
            workerCycleStepText: read('worker-cycle-step.json'), workerOwnerStageText: read('worker-owner-stage.json'),
            workerOwnerStageV2Text: read('worker-owner-stage-v2.json'),
          }, read('worker-callback-timing-v1.json'), read('failure-owner-stage.json'), read('failure-owner-stage-v2.json'));
        expect(parent.trace).toEqual(trace);
        expect(parent).toMatchObject({ operationCompletionEstablished: false,
          rootCleanupEstablished: false, rawCausePublished: false, performanceCauseEstablished: false });
        expect(read('failure-callback-timing-v1.json')).not.toMatch(/private|123456/u);
      } else if (fault === 'occupied parent') expect(read('failure-callback-timing-v1.json')).toBe('retained bytes');
      else expect(existsSync(join(fixture.attemptPath, 'failure-callback-timing-v1.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-callback-timing-v1.json')).toBe('retained bytes');
      if (fault === 'missing trace' || fault === 'occupied owner V2' || fault === 'cleanup aggregate') {
        expect(existsSync(join(fixture.attemptPath, 'worker-callback-timing-v1.json'))).toBe(false);
      }
    });

  it.each(['invalid-timing', 'budget-exceeded'] as const)(
    'attests %s only through the exact owner completion failure lineage', async reason => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagIsolatedErgoNodeCompletionFailureReasonV1(
        tagIsolatedErgoNodePostCallbackStageV1(new Error('private owner cause'),
          'completion-check'), reason);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      const parent = parseNativeTwoCycleParentOwnerStageV2(
        read('failure-owner-stage-v2.json'), failureBindings(fixture),
        JSON.parse(read('failure.json')).receiptDigestHex,
        read('worker-failure.json'), read('worker-root-phase-v2.json'),
        read('worker-cycle-step.json'), read('worker-owner-stage.json'),
        read('worker-owner-stage-v2.json'), read('failure-owner-stage.json'));
      expect(parent).toMatchObject({ completionFailureReason: reason,
        ownerStage: 'completion-check', operationCompletionEstablished: false,
        rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      expect(read('worker-owner-stage-v2.json') + read('failure-owner-stage-v2.json'))
        .not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['occupied worker V2', 'tampered worker V2', 'occupied parent V2',
    'tampered parent V1'] as const)(
    'retains older failure receipts when completion reason has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagIsolatedErgoNodeCompletionFailureReasonV1(
        tagIsolatedErgoNodePostCallbackStageV1(new Error('private owner cause'),
          'completion-check'), 'budget-exceeded');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker V2') {
          writeFileSync(join(fixture.attemptPath, 'worker-owner-stage-v2.json'),
            'retained worker V2 bytes');
        }
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          if (fault === 'tampered worker V2') {
            const path = join(fixture.attemptPath, 'worker-owner-stage-v2.json');
            const worker = JSON.parse(readFileSync(path, 'utf8'));
            writeFileSync(path, `${canonicalJson({ ...worker,
              receiptDigestHex: '9'.repeat(64) })}\n`);
          }
          if (fault === 'occupied parent V2') {
            writeFileSync(join(fixture.attemptPath, 'failure-owner-stage-v2.json'),
              'retained parent V2 bytes');
          }
          if (fault === 'tampered parent V1') {
            const path = join(fixture.attemptPath, 'failure-owner-stage.json');
            // The parent V1 file is emitted later, so occupy its create-only path.
            writeFileSync(path, 'retained parent V1 bytes');
          }
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'worker-owner-stage.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'failure-cycle-step.json'))).toBe(true);
      if (fault === 'occupied worker V2') {
        expect(read('worker-owner-stage-v2.json')).toBe('retained worker V2 bytes');
      }
      if (fault === 'occupied parent V2') {
        expect(read('failure-owner-stage-v2.json')).toBe('retained parent V2 bytes');
      } else expect(existsSync(join(fixture.attemptPath, 'failure-owner-stage-v2.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    (['active-guard', 'confirmation-observation'] as const).map(origin => ({ kind, origin }))))(
    'joins the $kind $origin confirmation detail with exact legacy public ancestry', async ({ kind, origin }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('synthetic private confirmation cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'confirmation', kind);
      const category = origin === 'active-guard' ? null : 'pending_at_deadline';
      tagNativeCommittedReserveConfirmationOriginV1(primary, origin, category);
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath]))
        .rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const failure = JSON.parse(read('failure.json'));
      const companion = parseNativeTwoCycleParentCommittedReserveConfirmationV1(
        read('failure-committed-reserve-confirmation.json'), failureBindings(fixture), failure.receiptDigestHex, {
          workerFailureText: read('worker-failure.json'),
          workerRootPhaseV2Text: read('worker-root-phase-v2.json'),
          workerCycleStepText: read('worker-cycle-step.json'),
          workerCommittedReserveStageText: read('worker-committed-reserve-stage.json'),
          parentCycleStepText: read('failure-cycle-step.json'),
          parentCommittedReserveStageText: read('failure-committed-reserve-stage.json'),
          workerConfirmationText: read('worker-committed-reserve-confirmation.json'),
        });
      expect(companion).toMatchObject({ cycle: 'cycle-1', step: 'committed-reserve',
        committedReserveStage: 'confirmation', committedReserveKind: kind,
        confirmationOrigin: origin, confirmationCategory: category,
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('worker-committed-reserve-confirmation.json') + read('failure-committed-reserve-confirmation.json'))
        .not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing detail', 'conflicting detail', 'missing worker', 'invalid worker',
    'occupied worker', 'worker directory', 'occupied parent', 'parent directory'] as const)(
    'preserves failure and old receipts when confirmation has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('synthetic private confirmation cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'confirmation', 'continuation');
      if (fault !== 'missing detail') tagNativeCommittedReserveConfirmationOriginV1(primary, 'active-guard');
      if (fault === 'conflicting detail') tagNativeCommittedReserveConfirmationOriginV1(primary,
        'confirmation-observation', 'pending_at_deadline');
      mocked.root.mockRejectedValueOnce(primary);
      const workerPath = join(fixture.attemptPath, 'worker-committed-reserve-confirmation.json');
      const parentPath = join(fixture.attemptPath, 'failure-committed-reserve-confirmation.json');
      let retained: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker') writeFileSync(workerPath, 'retained worker confirmation');
        if (fault === 'worker directory') mkdirSync(workerPath);
        try { await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config'))); }
        catch (cause) {
          const names = ['worker-failure.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json', 'worker-committed-reserve-stage.json'];
          retained = Object.fromEntries(names.map(name => [name, readFileSync(join(fixture.attemptPath, name), 'utf8')]));
          if (fault === 'missing worker') rmSync(workerPath);
          if (fault === 'invalid worker') writeFileSync(workerPath, '{}\n');
          if (fault === 'occupied parent') writeFileSync(parentPath, 'retained parent confirmation');
          if (fault === 'parent directory') mkdirSync(parentPath);
          throw cause;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath]))
        .rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      for (const [name, bytes] of Object.entries(retained)) expect(read(name)).toBe(bytes);
      expect(existsSync(join(fixture.attemptPath, 'failure-committed-reserve-stage.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-committed-reserve-confirmation.json')).toBe('retained worker confirmation');
      if (fault === 'occupied parent') expect(read('failure-committed-reserve-confirmation.json')).toBe('retained parent confirmation');
      else if (fault === 'parent directory') expect(existsSync(parentPath)).toBe(true);
      else expect(existsSync(parentPath)).toBe(false);
    });

  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle =>
    SUBSTRATE_FEDERATED_TRACKER_V2_BUILD_FAILURE_PHASES_V1.map(phase => ({ cycle, phase }))))(
    'carries the actual worker $cycle tracker-context $phase through the parent', async ({ cycle, phase }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagSubstrateFederatedTrackerV2BuildFailurePhaseV1(new Error('private tracker cause'), phase);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, cycle);
      tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'tracker-context');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const failure = JSON.parse(read('failure.json'));
      const text = read('failure-tracker-context.json');
      const detail = parseNativeTwoCycleParentTrackerContextV1(text,
        failureBindings(fixture), failure.receiptDigestHex, read('worker-failure.json'),
        read('worker-root-phase-v2.json'), read('worker-cycle-step.json'),
        read('worker-tracker-context.json'), read('failure-cycle-step.json'));
      expect(detail).toMatchObject({ cycle, step: 'tracker-context', trackerContextPhase: phase,
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(detail.parentCycleStepReceiptDigestHex)
        .toBe(JSON.parse(read('failure-cycle-step.json')).receiptDigestHex);
      expect(text).not.toContain('private');
      expect(mocked.root).toHaveBeenCalledTimes(1);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle =>
    SUBSTRATE_FEDERATED_TRACKER_V2_STATEMENT_FAILURE_CHECKS_V1.map(check => ({ cycle, check }))))(
    'carries the real catch path with synthetic $cycle statement $check', async ({ cycle, check }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagSubstrateFederatedTrackerV2BuildFailurePhaseV1(new Error('private tracker cause'), 'statement');
      tagSubstrateFederatedTrackerV2StatementFailureCheckV1(primary, check);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, cycle);
      tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'tracker-context');
      const failureValue = new AggregateError([primary, tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(new Error(), 'cleanup')]);
      mocked.root.mockRejectedValueOnce(failureValue);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath]))
        .rejects.toBe(failureValue);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const terminal = JSON.parse(read('failure.json'));
      const detail = parseNativeTwoCycleParentTrackerStatementV1(read('failure-tracker-statement.json'),
        failureBindings(fixture), terminal.receiptDigestHex, read('worker-failure.json'), read('worker-root-phase-v2.json'),
        read('worker-cycle-step.json'), read('worker-tracker-context.json'), read('failure-cycle-step.json'),
        read('worker-tracker-statement.json'), read('failure-tracker-context.json'));
      expect(detail).toMatchObject({ cycle, statementCheck: check, trackerContextPhase: 'statement',
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('failure-tracker-statement.json')).not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing check', 'conflicting check', 'occupied worker', 'directory worker', 'occupied worker context',
    'tampered worker', 'foreign worker', 'changed worker context', 'occupied parent', 'occupied parent context'] as const)(
    'preserves older receipts and primary when statement detail has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagSubstrateFederatedTrackerV2BuildFailurePhaseV1(new Error('private tracker cause'), 'statement');
      if (fault !== 'missing check') tagSubstrateFederatedTrackerV2StatementFailureCheckV1(primary, 'decode');
      if (fault === 'conflicting check') tagSubstrateFederatedTrackerV2StatementFailureCheckV1(primary, 'profile');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'tracker-context');
      mocked.root.mockRejectedValueOnce(primary);
      let preserved: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async input => {
        const path = join(fixture.attemptPath, 'worker-tracker-statement.json');
        if (fault === 'occupied worker') writeFileSync(path, 'retained worker statement bytes');
        if (fault === 'directory worker') mkdirSync(path);
        if (fault === 'occupied worker context') writeFileSync(join(fixture.attemptPath, 'worker-tracker-context.json'), 'retained worker context bytes');
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
          if (fault === 'tampered worker' || fault === 'foreign worker') {
            const detail = JSON.parse(read('worker-tracker-statement.json'));
            const { receiptDigestHex: ignored, ...body } = { ...detail,
              [fault === 'foreign worker' ? 'configSha256Hex' : 'workerTrackerContextReceiptDigestHex']: '9'.repeat(64) };
            void ignored;
            writeFileSync(path, `${canonicalJson({ ...body, receiptDigestHex: sha256CanonicalJson(body,
              'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_TRACKER_STATEMENT_V1') })}\n`);
          }
          if (fault === 'changed worker context') {
            const detail = JSON.parse(read('worker-tracker-context.json'));
            const { receiptDigestHex: ignored, ...body } = { ...detail, trackerContextPhase: 'membership' }; void ignored;
            writeFileSync(join(fixture.attemptPath, 'worker-tracker-context.json'), `${canonicalJson({ ...body,
              receiptDigestHex: sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_TRACKER_CONTEXT_V1') })}\n`);
          }
          if (fault === 'occupied parent') writeFileSync(join(fixture.attemptPath, 'failure-tracker-statement.json'), 'retained parent statement bytes');
          if (fault === 'occupied parent context') writeFileSync(join(fixture.attemptPath, 'failure-tracker-context.json'), 'retained parent context bytes');
          preserved = Object.fromEntries(['worker-failure.json', 'worker-root-phase.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json', 'worker-tracker-context.json'].map(name => [name, read(name)]));
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath])).rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      for (const [name, bytes] of Object.entries(preserved)) expect(read(name)).toBe(bytes);
      for (const name of ['failure-diagnostic.json', 'failure-root-phase.json', 'failure-root-phase-v2.json', 'failure-cycle-step.json']) {
        expect(existsSync(join(fixture.attemptPath, name))).toBe(true);
      }
      if (fault === 'occupied parent') expect(read('failure-tracker-statement.json')).toBe('retained parent statement bytes');
      else expect(existsSync(join(fixture.attemptPath, 'failure-tracker-statement.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-tracker-statement.json')).toBe('retained worker statement bytes');
      if (fault === 'occupied worker context') expect(existsSync(join(fixture.attemptPath, 'worker-tracker-statement.json'))).toBe(false);
      if (fault === 'occupied parent context') expect(read('failure-tracker-context.json')).toBe('retained parent context bytes');
      else if (fault !== 'occupied worker context') expect(existsSync(join(fixture.attemptPath, 'failure-tracker-context.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing tag', 'wrong step', 'occupied worker', 'directory worker',
    'tampered worker', 'foreign worker', 'changed step ancestor', 'occupied parent'] as const)(
    'preserves the primary and older receipts when tracker context detail has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private tracker cause');
      if (fault !== 'missing tag') tagSubstrateFederatedTrackerV2BuildFailurePhaseV1(primary, 'membership');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', fault === 'wrong step' ? 'tracker-check' : 'tracker-context');
      mocked.root.mockRejectedValueOnce(primary);
      let preserved: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async input => {
        const path = join(fixture.attemptPath, 'worker-tracker-context.json');
        if (fault === 'occupied worker') writeFileSync(path, 'retained worker tracker bytes');
        if (fault === 'directory worker') mkdirSync(path);
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
          if (fault === 'tampered worker' || fault === 'foreign worker') {
            const detail = JSON.parse(read('worker-tracker-context.json'));
            writeFileSync(path, `${canonicalJson({ ...detail,
              [fault === 'foreign worker' ? 'configSha256Hex' : 'receiptDigestHex']: '9'.repeat(64) })}\n`);
          }
          if (fault === 'changed step ancestor') {
            writeFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'), `${canonicalJson(
              createNativeTwoCycleWorkerCycleStepV1(failureBindings(fixture), read('worker-failure.json'),
                read('worker-root-phase-v2.json'), { cycle: 'cycle-1', step: 'tracker-check' }))}\n`);
          }
          if (fault === 'occupied parent') {
            writeFileSync(join(fixture.attemptPath, 'failure-tracker-context.json'), 'retained parent tracker bytes');
          }
          preserved = Object.fromEntries(['worker-failure.json', 'worker-root-phase.json',
            'worker-root-phase-v2.json', 'worker-cycle-step.json']
            .map(name => [name, read(name)]));
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
        .toBe(expectedTerminalFailure(fixture));
      for (const [name, bytes] of Object.entries(preserved)) {
        expect(readFileSync(join(fixture.attemptPath, name), 'utf8')).toBe(bytes);
      }
      for (const name of ['failure-diagnostic.json', 'failure-root-phase.json',
        'failure-root-phase-v2.json', 'failure-cycle-step.json']) {
        expect(existsSync(join(fixture.attemptPath, name))).toBe(true);
      }
      if (fault === 'occupied parent') {
        expect(readFileSync(join(fixture.attemptPath, 'failure-tracker-context.json'), 'utf8'))
          .toBe('retained parent tracker bytes');
      } else expect(existsSync(join(fixture.attemptPath, 'failure-tracker-context.json'))).toBe(false);
      if (fault === 'occupied worker') expect(readFileSync(join(fixture.attemptPath, 'worker-tracker-context.json'), 'utf8'))
        .toBe('retained worker tracker bytes');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    (['callback-observation-guard', 'revalidator-call'] as const).map(origin => ({ kind, origin }))))(
    'joins the $kind $origin revalidation origin through exact legacy and new parent ancestry', async ({ kind, origin }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('synthetic private revalidation cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'operational-revalidate', kind);
      tagNativeCommittedReserveRevalidationOriginV1(primary, origin);
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath]))
        .rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const failure = JSON.parse(read('failure.json'));
      const companion = parseNativeTwoCycleParentCommittedReserveRevalidationV1(
        read('failure-committed-reserve-revalidation.json'), failureBindings(fixture), failure.receiptDigestHex, {
          workerFailureText: read('worker-failure.json'),
          workerRootPhaseV2Text: read('worker-root-phase-v2.json'),
          workerCycleStepText: read('worker-cycle-step.json'),
          workerCommittedReserveStageText: read('worker-committed-reserve-stage.json'),
          parentCycleStepText: read('failure-cycle-step.json'),
          parentCommittedReserveStageText: read('failure-committed-reserve-stage.json'),
          workerRevalidationText: read('worker-committed-reserve-revalidation.json'),
        });
      expect(companion).toMatchObject({ cycle: 'cycle-1', step: 'committed-reserve',
        committedReserveStage: 'operational-revalidate', committedReserveKind: kind,
        revalidationOrigin: origin, operationCompletionEstablished: false,
        rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('worker-committed-reserve-revalidation.json') + read('failure-committed-reserve-revalidation.json'))
        .not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing origin', 'conflicting origins', 'missing worker', 'invalid worker',
    'occupied worker', 'worker directory', 'occupied parent', 'parent directory'] as const)(
    'preserves terminal and legacy evidence when revalidation origin has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('synthetic private revalidation cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'operational-revalidate', 'continuation');
      if (fault !== 'missing origin') tagNativeCommittedReserveRevalidationOriginV1(primary, 'revalidator-call');
      if (fault === 'conflicting origins') tagNativeCommittedReserveRevalidationOriginV1(primary, 'callback-observation-guard');
      mocked.root.mockRejectedValueOnce(primary);
      const workerPath = join(fixture.attemptPath, 'worker-committed-reserve-revalidation.json');
      const parentPath = join(fixture.attemptPath, 'failure-committed-reserve-revalidation.json');
      let retained: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker') writeFileSync(workerPath, 'retained worker origin');
        if (fault === 'worker directory') mkdirSync(workerPath);
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (cause) {
          expect(cause).toBe(primary);
          const names = ['worker-failure.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json', 'worker-committed-reserve-stage.json'];
          retained = Object.fromEntries(names.map(name => [name,
            readFileSync(join(fixture.attemptPath, name), 'utf8')]));
          if (fault === 'missing worker') rmSync(workerPath);
          if (fault === 'invalid worker') writeFileSync(workerPath, '{}\n');
          if (fault === 'occupied parent') writeFileSync(parentPath, 'retained parent origin');
          if (fault === 'parent directory') mkdirSync(parentPath);
          throw cause;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath]))
        .rejects.toBe(primary);
      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      for (const [name, bytes] of Object.entries(retained)) expect(read(name)).toBe(bytes);
      expect(existsSync(join(fixture.attemptPath, 'failure-committed-reserve-stage.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-committed-reserve-revalidation.json')).toBe('retained worker origin');
      if (fault === 'occupied parent') expect(read('failure-committed-reserve-revalidation.json')).toBe('retained parent origin');
      else if (fault === 'parent directory') expect(existsSync(parentPath)).toBe(true);
      else expect(existsSync(parentPath)).toBe(false);
    });

  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle =>
    SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1.flatMap(committedReserveStage =>
      (['genesis', 'continuation'] as const).map(committedReserveKind => ({ cycle, committedReserveStage, committedReserveKind }))))) (
    'carries the worker $cycle committed-reserve $committedReserveKind $committedReserveStage through exact parent ancestry',
    async ({ cycle, committedReserveStage, committedReserveKind }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private committed-reserve cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, cycle);
      tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'committed-reserve');
      tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, committedReserveStage, committedReserveKind);
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);

      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const failure = JSON.parse(read('failure.json'));
      const companion = parseNativeTwoCycleParentCommittedReserveStageV1(
        read('failure-committed-reserve-stage.json'), failureBindings(fixture), failure.receiptDigestHex,
        read('worker-failure.json'), read('worker-root-phase-v2.json'),
        read('worker-cycle-step.json'), read('worker-committed-reserve-stage.json'),
        read('failure-cycle-step.json'));
      expect(companion).toMatchObject({ cycle, step: 'committed-reserve', committedReserveStage, committedReserveKind,
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('worker-committed-reserve-stage.json') + read('failure-committed-reserve-stage.json'))
        .not.toContain('private');
      expect(mocked.root).toHaveBeenCalledOnce();
      expect(mocked.process).toHaveBeenCalledOnce();
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing tag', 'missing kind', 'conflicting kind', 'wrong step', 'conflicting tags', 'occupied worker', 'worker directory',
    'invalid JSON', 'invalid claims', 'invalid kind', 'foreign identity', 'bad digest', 'changed ancestry',
    'occupied parent', 'parent directory'] as const)(
    'preserves the primary and older receipts when committed-reserve stage evidence has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private committed-reserve cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1',
        fault === 'wrong step' ? 'tracker-check' : 'committed-reserve');
      if (fault !== 'missing tag' && fault !== 'worker directory') {
        tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'ingress',
          fault === 'missing kind' ? undefined : 'genesis');
      }
      if (fault === 'conflicting tags') {
        tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'confirmation');
      }
      if (fault === 'conflicting kind') {
        tagSubstrateFederatedNativeCommittedReserveFailureStageV1(primary, 'ingress', 'continuation');
      }
      mocked.root.mockRejectedValueOnce(primary);
      let workerReceipts: Record<string, string> = {};
      const workerStagePath = join(fixture.attemptPath, 'worker-committed-reserve-stage.json');
      const parentStagePath = join(fixture.attemptPath, 'failure-committed-reserve-stage.json');
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker') writeFileSync(workerStagePath, 'retained worker committed-reserve bytes');
        if (fault === 'worker directory') mkdirSync(workerStagePath);
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
          if (fault === 'invalid JSON') writeFileSync(workerStagePath, '{}\n');
          if (fault === 'invalid claims' || fault === 'invalid kind' || fault === 'foreign identity' || fault === 'bad digest') {
            const detail = JSON.parse(read('worker-committed-reserve-stage.json'));
            if (fault === 'invalid claims') detail.operationCompletionEstablished = true;
            if (fault === 'invalid kind') detail.committedReserveKind = 'unknown';
            if (fault === 'foreign identity') detail.configSha256Hex = '9'.repeat(64);
            if (fault === 'bad digest') detail.receiptDigestHex = '9'.repeat(64);
            writeFileSync(workerStagePath, `${canonicalJson(detail)}\n`);
          }
          if (fault === 'changed ancestry') {
            writeFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'), `${canonicalJson(
              createNativeTwoCycleWorkerCycleStepV1(failureBindings(fixture),
                read('worker-failure.json'), read('worker-root-phase-v2.json'),
                { cycle: 'cycle-1', step: 'tracker-check' }))}\n`);
          }
          if (fault === 'occupied parent') writeFileSync(parentStagePath, 'retained parent committed-reserve bytes');
          if (fault === 'parent directory') mkdirSync(parentStagePath);
          workerReceipts = Object.fromEntries(['worker-failure.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json'].map(name => [name, read(name)]));
          throw error;
        }
      });

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);

      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      expect(read('failure-diagnostic.json')).not.toContain('private');
      for (const [name, bytes] of Object.entries(workerReceipts)) expect(read(name)).toBe(bytes);
      expect(mocked.root).toHaveBeenCalledOnce();
      expect(mocked.process).toHaveBeenCalledOnce();
      expect(JSON.parse(read('failure-cycle-step.json')).step)
        .toBe(fault === 'wrong step' || fault === 'changed ancestry' ? 'tracker-check' : 'committed-reserve');
      expect(existsSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-committed-reserve-stage.json'))
        .toBe('retained worker committed-reserve bytes');
      else if (fault === 'worker directory') expect(existsSync(workerStagePath)).toBe(true);
      if (fault === 'occupied parent') expect(read('failure-committed-reserve-stage.json'))
        .toBe('retained parent committed-reserve bytes');
      else if (fault === 'parent directory') expect(existsSync(parentStagePath)).toBe(true);
      else expect(existsSync(parentStagePath)).toBe(false);
    });


  it.each((['cycle-1', 'cycle-2'] as const).flatMap(cycle =>
    SUBSTRATE_FEDERATED_NATIVE_SOURCE_LOCK_FAILURE_STAGES_V1.flatMap(sourceLockStage =>
      (['genesis', 'continuation'] as const).map(sourceLockKind => ({ cycle, sourceLockStage, sourceLockKind }))))) (
    'carries the worker $cycle source-lock $sourceLockKind $sourceLockStage through exact parent ancestry',
    async ({ cycle, sourceLockStage, sourceLockKind }) => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private source-lock cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, cycle);
      tagNativeTwoCycleCycleStepFailureV1(primary, cycle, 'source-lock');
      tagSubstrateFederatedNativeSourceLockFailureStageV1(primary, sourceLockStage, sourceLockKind);
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
          input.args.slice(input.args.indexOf('--config')));
        throw new Error('unexpected worker success');
      });

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);

      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      const failure = JSON.parse(read('failure.json'));
      const companion = parseNativeTwoCycleParentSourceLockStageV1(
        read('failure-source-lock-stage.json'), failureBindings(fixture), failure.receiptDigestHex,
        read('worker-failure.json'), read('worker-root-phase-v2.json'),
        read('worker-cycle-step.json'), read('worker-source-lock-stage.json'),
        read('failure-cycle-step.json'));
      expect(companion).toMatchObject({ cycle, step: 'source-lock', sourceLockStage, sourceLockKind,
        operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
      expect(read('worker-source-lock-stage.json') + read('failure-source-lock-stage.json'))
        .not.toContain('private');
      expect(mocked.root).toHaveBeenCalledOnce();
      expect(mocked.process).toHaveBeenCalledOnce();
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing tag', 'missing kind', 'conflicting kind', 'wrong step', 'conflicting tags', 'occupied worker', 'worker directory',
    'invalid JSON', 'invalid claims', 'invalid kind', 'foreign identity', 'bad digest', 'changed ancestry',
    'occupied parent', 'parent directory'] as const)(
    'preserves the primary and older receipts when source-lock stage evidence has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private source-lock cause');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1',
        fault === 'wrong step' ? 'tracker-check' : 'source-lock');
      if (fault !== 'missing tag' && fault !== 'worker directory') {
        tagSubstrateFederatedNativeSourceLockFailureStageV1(primary, 'ingress',
          fault === 'missing kind' ? undefined : 'genesis');
      }
      if (fault === 'conflicting tags') {
        tagSubstrateFederatedNativeSourceLockFailureStageV1(primary, 'confirmation');
      }
      if (fault === 'conflicting kind') {
        tagSubstrateFederatedNativeSourceLockFailureStageV1(primary, 'ingress', 'continuation');
      }
      mocked.root.mockRejectedValueOnce(primary);
      let workerReceipts: Record<string, string> = {};
      const workerStagePath = join(fixture.attemptPath, 'worker-source-lock-stage.json');
      const parentStagePath = join(fixture.attemptPath, 'failure-source-lock-stage.json');
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker') writeFileSync(workerStagePath, 'retained worker source-lock bytes');
        if (fault === 'worker directory') mkdirSync(workerStagePath);
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
          if (fault === 'invalid JSON') writeFileSync(workerStagePath, '{}\n');
          if (fault === 'invalid claims' || fault === 'invalid kind' || fault === 'foreign identity' || fault === 'bad digest') {
            const detail = JSON.parse(read('worker-source-lock-stage.json'));
            if (fault === 'invalid claims') detail.operationCompletionEstablished = true;
            if (fault === 'invalid kind') detail.sourceLockKind = 'unknown';
            if (fault === 'foreign identity') detail.configSha256Hex = '9'.repeat(64);
            if (fault === 'bad digest') detail.receiptDigestHex = '9'.repeat(64);
            writeFileSync(workerStagePath, `${canonicalJson(detail)}\n`);
          }
          if (fault === 'changed ancestry') {
            writeFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'), `${canonicalJson(
              createNativeTwoCycleWorkerCycleStepV1(failureBindings(fixture),
                read('worker-failure.json'), read('worker-root-phase-v2.json'),
                { cycle: 'cycle-1', step: 'tracker-check' }))}\n`);
          }
          if (fault === 'occupied parent') writeFileSync(parentStagePath, 'retained parent source-lock bytes');
          if (fault === 'parent directory') mkdirSync(parentStagePath);
          workerReceipts = Object.fromEntries(['worker-failure.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json'].map(name => [name, read(name)]));
          throw error;
        }
      });

      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);

      const read = (name: string) => readFileSync(join(fixture.attemptPath, name), 'utf8');
      expect(read('failure.json')).toBe(expectedTerminalFailure(fixture));
      expect(read('failure-diagnostic.json')).not.toContain('private');
      for (const [name, bytes] of Object.entries(workerReceipts)) expect(read(name)).toBe(bytes);
      expect(mocked.root).toHaveBeenCalledOnce();
      expect(mocked.process).toHaveBeenCalledOnce();
      expect(JSON.parse(read('failure-cycle-step.json')).step)
        .toBe(fault === 'wrong step' || fault === 'changed ancestry' ? 'tracker-check' : 'source-lock');
      expect(existsSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
      if (fault === 'occupied worker') expect(read('worker-source-lock-stage.json'))
        .toBe('retained worker source-lock bytes');
      else if (fault === 'worker directory') expect(existsSync(workerStagePath)).toBe(true);
      if (fault === 'occupied parent') expect(read('failure-source-lock-stage.json'))
        .toBe('retained parent source-lock bytes');
      else if (fault === 'parent directory') expect(existsSync(parentStagePath)).toBe(true);
      else expect(existsSync(parentStagePath)).toBe(false);
    });

  it.each(['missing tag', 'occupied worker', 'tampered worker', 'occupied parent'] as const)(
    'preserves terminal and older failure companions when owner detail has %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = new Error('private owner cause');
      if (fault !== 'missing tag') tagIsolatedErgoNodePostCallbackStageV1(primary, 'completion-check');
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'cycle-summary');
      mocked.root.mockRejectedValueOnce(primary);
      mocked.process.mockImplementationOnce(async input => {
        if (fault === 'occupied worker') {
          writeFileSync(join(fixture.attemptPath, 'worker-owner-stage.json'), 'retained worker bytes');
        }
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
            input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const workerPath = join(fixture.attemptPath, 'worker-owner-stage.json');
          if (fault === 'tampered worker') {
            const worker = JSON.parse(readFileSync(workerPath, 'utf8'));
            writeFileSync(workerPath, `${canonicalJson({ ...worker, receiptDigestHex: '9'.repeat(64) })}\n`);
          }
          if (fault === 'occupied parent') {
            writeFileSync(join(fixture.attemptPath, 'failure-owner-stage.json'), 'retained parent bytes');
          }
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8'))
        .toBe(expectedTerminalFailure(fixture));
      for (const name of ['worker-failure.json', 'worker-root-phase-v2.json',
        'worker-cycle-step.json', 'failure-cycle-step.json']) {
        expect(existsSync(join(fixture.attemptPath, name))).toBe(true);
      }
      if (fault === 'occupied parent') {
        expect(readFileSync(join(fixture.attemptPath, 'failure-owner-stage.json'), 'utf8'))
          .toBe('retained parent bytes');
      } else expect(existsSync(join(fixture.attemptPath, 'failure-owner-stage.json'))).toBe(false);
      if (fault === 'occupied worker') {
        expect(readFileSync(join(fixture.attemptPath, 'worker-owner-stage.json'), 'utf8'))
          .toBe('retained worker bytes');
      }
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['missing', 'invalid', 'foreign', 'digest', 'directory', 'occupied', 'changed step ancestor'] as const)(
    'retains terminal and older companions when setup stage is %s', async fault => {
      const fixture = commandFixture(); configureParent(fixture, projectedResult());
      const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private setup'), 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'setup-check');
      if (fault !== 'missing' && fault !== 'directory') tagNativeGenesisSetupFailureStageV1(primary, 'wasm-signing');
      mocked.root.mockRejectedValueOnce(primary);
      let preserved: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async input => {
        try {
          await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(input.args.indexOf('--config')));
          throw new Error('unexpected worker success');
        } catch (error) {
          expect(error).toBe(primary);
          const name = join(fixture.attemptPath, 'worker-setup-stage.json');
          if (fault === 'directory') mkdirSync(name);
          else if (fault === 'invalid') writeFileSync(name, '{}\n');
          else if (fault === 'foreign' || fault === 'digest') {
            const stage = JSON.parse(readFileSync(name, 'utf8'));
            writeFileSync(name, `${canonicalJson({ ...stage,
              [fault === 'foreign' ? 'configSha256Hex' : 'receiptDigestHex']: '9'.repeat(64) })}\n`);
          } else if (fault === 'changed step ancestor') {
            const read = (n: string) => readFileSync(join(fixture.attemptPath, n), 'utf8');
            writeFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'), `${canonicalJson(
              createNativeTwoCycleWorkerCycleStepV1(failureBindings(fixture), read('worker-failure.json'),
                read('worker-root-phase-v2.json'), { cycle: 'cycle-1', step: 'tracker-check' }))}\n`);
          } else if (fault === 'occupied') writeFileSync(join(fixture.attemptPath, 'failure-setup-stage.json'), 'retained setup bytes');
          preserved = Object.fromEntries(['worker-failure.json', 'worker-root-phase.json', 'worker-root-phase-v2.json',
            'worker-cycle-step.json'].map(n => [n, readFileSync(join(fixture.attemptPath, n), 'utf8')]));
          throw error;
        }
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments(['--config', fixture.configSourcePath])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8')).toBe(expectedTerminalFailure(fixture));
      for (const [name, bytes] of Object.entries(preserved)) expect(readFileSync(join(fixture.attemptPath, name), 'utf8')).toBe(bytes);
      for (const name of ['failure-diagnostic.json', 'failure-root-phase.json', 'failure-root-phase-v2.json', 'failure-cycle-step.json']) {
        expect(existsSync(join(fixture.attemptPath, name))).toBe(true);
      }
      if (fault === 'occupied') expect(readFileSync(join(fixture.attemptPath, 'failure-setup-stage.json'), 'utf8')).toBe('retained setup bytes');
      else expect(existsSync(join(fixture.attemptPath, 'failure-setup-stage.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['worker-setup-stage.json', 'worker-cycle-step.json', 'worker-root-phase-v2.json', 'worker-failure.json'] as const)(
    'keeps original worker error and consumed claim when setup ancestry %s is occupied', async artifact => {
      const fixture = workerFixture(); mocked.load.mockReturnValue(fixture.loaded);
      mocked.environment.mockResolvedValue(environment());
      const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private'), 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'setup-check');
      tagNativeGenesisSetupFailureStageV1(primary, 'request-construction'); mocked.root.mockRejectedValueOnce(primary);
      writeFileSync(join(fixture.attemptPath, artifact), 'retained bytes');
      const args = ['--config', fixture.configPath, '--expected-config-sha256', fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex, '--attempt', fixture.attemptPath];
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(args)).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, artifact), 'utf8')).toBe('retained bytes');
      if (artifact !== 'worker-setup-stage.json') expect(existsSync(join(fixture.attemptPath, 'worker-setup-stage.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-start.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(args)).rejects.toThrow();
      expect(mocked.root).toHaveBeenCalledOnce();
    });

  it.each(['missing', 'invalid', 'foreign', 'digest', 'directory', 'occupied'] as const)(
    'preserves terminal and V2 failure bytes when cycle-step companion is %s', async fault => {
      const fixture = commandFixture();
      configureParent(fixture, projectedResult());
      const primary = new Error('private failed operation');
      mocked.process.mockImplementationOnce(async () => {
        const bindings = failureBindings(fixture);
        const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', primary);
        const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
          { primaryPhase: 'cycle-1', cleanupErrorCount: 0, ergoNodeStartupPhase: null });
        const failureText = `${canonicalJson(failure)}\n`; const rootText = `${canonicalJson(root)}\n`;
        writeFileSync(join(fixture.attemptPath, 'worker-failure.json'), failureText);
        writeFileSync(join(fixture.attemptPath, 'worker-root-phase-v2.json'), rootText);
        if (fault === 'directory') mkdirSync(join(fixture.attemptPath, 'worker-cycle-step.json'));
        else if (fault !== 'missing') {
          const worker = createNativeTwoCycleWorkerCycleStepV1(bindings, failureText, rootText,
            { cycle: 'cycle-1', step: 'setup-check' });
          writeFileSync(join(fixture.attemptPath, 'worker-cycle-step.json'),
            fault === 'invalid' ? '{}\n' : `${canonicalJson(fault === 'foreign'
              ? { ...worker, configSha256Hex: '9'.repeat(64) } : fault === 'digest'
                ? { ...worker, receiptDigestHex: '9'.repeat(64) } : worker)}\n`);
        }
        if (fault === 'occupied') writeFileSync(join(fixture.attemptPath, 'failure-cycle-step.json'), 'retained step bytes');
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
        '--config', fixture.configSourcePath,
      ])).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, 'failure.json'), 'utf8')).toBe(expectedTerminalFailure(fixture));
      expect(existsSync(join(fixture.attemptPath, 'failure-root-phase-v2.json'))).toBe(true);
      if (fault === 'occupied') expect(readFileSync(join(fixture.attemptPath, 'failure-cycle-step.json'), 'utf8'))
        .toBe('retained step bytes');
      else expect(existsSync(join(fixture.attemptPath, 'failure-cycle-step.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'result.json'))).toBe(false);
    });

  it.each(['worker-cycle-step.json', 'worker-root-phase-v2.json', 'worker-failure.json'] as const)(
    'worker keeps primary error and one-shot claim when %s is occupied', async artifact => {
      const fixture = workerFixture(); mocked.load.mockReturnValue(fixture.loaded);
      mocked.environment.mockResolvedValue(environment());
      const primary = tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(new Error('private'), 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'setup-check');
      mocked.root.mockRejectedValueOnce(primary);
      writeFileSync(join(fixture.attemptPath, artifact), 'retained bytes');
      const args = ['--config', fixture.configPath, '--expected-config-sha256', fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex, '--attempt', fixture.attemptPath];
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(args)).rejects.toBe(primary);
      expect(readFileSync(join(fixture.attemptPath, artifact), 'utf8')).toBe('retained bytes');
      if (artifact !== 'worker-cycle-step.json') expect(existsSync(join(fixture.attemptPath, 'worker-cycle-step.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-start.json'))).toBe(true);
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(args)).rejects.toThrow();
      expect(mocked.root).toHaveBeenCalledOnce();
    });

  it('worker records transport publication failure without claiming cleanup', async () => {
    const fixture = workerFixture();
    const recoveryEvidence = writeRecoveryManifestFixture(fixture);
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    mocked.root.mockResolvedValue({ root: 'result', recoveryEvidence });
    mocked.project.mockReturnValue(projectedResult());
    mkdirSync(join(fixture.attemptPath, 'worker-result.json'));
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow();
    const diagnostic = JSON.parse(readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8'));
    expect(diagnostic.stage).toBe('transport-publication');
    expect(diagnostic.rootCleanupEstablished).toBe(false);
  });

  it.each(['missing root recovery pointer', 'occupied worker recovery locator'] as const)(
    'worker withholds success for %s', async fault => {
      const fixture = workerFixture();
      const recoveryEvidence = writeRecoveryManifestFixture(fixture);
      mocked.load.mockReturnValue(fixture.loaded);
      mocked.environment.mockResolvedValue(environment());
      mocked.root.mockResolvedValue(fault === 'missing root recovery pointer'
        ? { root: 'result' } : { root: 'result', recoveryEvidence });
      mocked.project.mockReturnValue(projectedResult());
      const workerPath = join(fixture.attemptPath, 'worker-recovery-locator-v1.json');
      if (fault === 'occupied worker recovery locator') {
        writeFileSync(workerPath, 'retained worker locator bytes');
      }
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
        '--config', fixture.configPath,
        '--expected-config-sha256', fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
        '--attempt', fixture.attemptPath,
      ])).rejects.toThrow();
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(true);
      if (fault === 'occupied worker recovery locator') {
        expect(readFileSync(workerPath, 'utf8')).toBe('retained worker locator bytes');
      }
    });

  it('worker preserves the primary failure and existing diagnostic bytes on a write collision', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    const primary = new Error('root failure');
    mocked.root.mockRejectedValue(primary);
    const path = join(fixture.attemptPath, 'worker-failure.json');
    writeFileSync(path, 'retained diagnostic bytes');
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toBe(primary);
    expect(readFileSync(path, 'utf8')).toBe('retained diagnostic bytes');
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
  });

  it('worker rejects config drift and never retries a failed root', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue({
      ...fixture.loaded,
      configSha256Hex: '9'.repeat(64),
    });
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/config digest differs/iu);
    expect(mocked.root).not.toHaveBeenCalled();

    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    const primary = new Error('synthetic root failure');
    mocked.root.mockRejectedValue(primary);
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toBe(primary);
    expect(mocked.root).toHaveBeenCalledOnce();
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/exist/iu);
    expect(mocked.root).toHaveBeenCalledOnce();
  });

  it('worker withholds transport when a post-root tool identity drifts', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment
      .mockResolvedValueOnce(environment())
      .mockResolvedValueOnce({
        ...environment(),
        toolIdentityDigestHex: '9'.repeat(64),
      });
    mocked.root.mockResolvedValue({ root: 'result' });
    mocked.project.mockReturnValue(projectedResult());
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/identities changed/iu);
    expect(mocked.root).toHaveBeenCalledOnce();
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
  });

  it.each(WORKER_WASM_PACKAGE_EVIDENCE_FIELDS)(
    'worker rejects a tampered source package evidence field: $name',
    async ({ path: fieldPath, replacement }) => {
      const fixture = workerFixture();
      mocked.load.mockReturnValue(fixture.loaded);
      const evidencePath = join(fixture.attemptPath, 'wasm-avl-package.json');
      const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as Record<string, unknown>;
      mutateJsonPath(evidence, fieldPath, replacement);
      writeCanonicalJson(evidencePath, evidence);

      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
        '--config', fixture.configPath,
        '--expected-config-sha256', fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
        '--attempt', fixture.attemptPath,
      ])).rejects.toThrow();

      expect(mocked.root).not.toHaveBeenCalled();
      expect(mocked.environment).not.toHaveBeenCalled();
      expect(existsSync(join(fixture.attemptPath, 'worker-start.json'))).toBe(false);
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
    },
  );

  it('consumes the worker entry even when environment validation fails', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockRejectedValueOnce(new Error('preflight failed'));
    const argv = ['--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath];
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(argv))
      .rejects.toThrow('preflight failed');
    mocked.environment.mockResolvedValue(environment());
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments(argv))
      .rejects.toThrow(/exist/iu);
    expect(mocked.environment).toHaveBeenCalledOnce();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it.each(['result.json', 'failure.json'])(
    'refuses a worker attempt with %s before validation', async terminal => {
      const fixture = workerFixture();
      mocked.load.mockReturnValue(fixture.loaded);
      writeFileSync(join(fixture.attemptPath, terminal), '{}\n');
      await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
        '--config', fixture.configPath, '--expected-config-sha256',
        fixture.loaded.configSha256Hex,
        '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
        '--attempt', fixture.attemptPath,
      ])).rejects.toThrow(/terminal artifact/iu);
      expect(mocked.environment).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    },
  );

  it('refuses parent start from another captured config', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    const path = join(fixture.attemptPath, 'start.json');
    const start = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    writeFileSync(path, canonicalJson({ ...start, configSha256Hex: '0'.repeat(64) }));
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex,
      '--expected-wasm-avl-package-sha256', wasmPackageIdentity().packageSha256Hex,
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/parent start differs/iu);
    expect(mocked.environment).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(false);
  });
});

function commandFixture() {
  const root = mkdtempSync(join(tmpdir(), 'e2s-two-cycle-command-'));
  temporaryRoots.push(root);
  const ergoSourcePath = join(root, 'ergo-source');
  mkdirSync(ergoSourcePath);
  const outputParentDirectory = join(root, 'attempts');
  mkdirSync(outputParentDirectory);
  const configSourcePath = join(root, 'invocation.json');
  const configBytes = Buffer.from('{}\n', 'utf8');
  writeFileSync(configSourcePath, configBytes);
  const attemptPath = join(outputParentDirectory, 'fresh-attempt');
  const loaded = loadedInvocation(
    configSourcePath,
    configBytes,
    outputParentDirectory,
    attemptPath,
    ergoSourcePath,
  );
  return { root, outputParentDirectory, configSourcePath, attemptPath, loaded };
}

function workerFixture() {
  const root = mkdtempSync(join(tmpdir(), 'e2s-two-cycle-worker-'));
  temporaryRoots.push(root);
  const ergoSourcePath = join(root, 'ergo-source');
  mkdirSync(ergoSourcePath);
  const outputParentDirectory = join(root, 'attempts');
  mkdirSync(outputParentDirectory);
  const attemptPath = join(outputParentDirectory, 'fresh-attempt');
  mkdirSync(attemptPath);
  const configPath = join(attemptPath, 'config.json');
  const configBytes = Buffer.from('{}\n', 'utf8');
  writeFileSync(configPath, configBytes);
  const loaded = loadedInvocation(
    configPath,
    configBytes,
    outputParentDirectory,
    attemptPath,
    ergoSourcePath,
  );
  writeFileSync(join(attemptPath, 'start.json'), canonicalJson({
    schema: 'e2s.substrate-federated-native-two-cycle-start.v1', version: 1,
    status: 'two_cycle_invocation_started', configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: loaded.config.expectedBridgeCommit,
    expectedBridgeTree: environment().repository.tree,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex,
    toolIdentityDigestHex: environment().toolIdentityDigestHex,
  }));
  writeWasmPackageEvidence(attemptPath, environment().repository.commit, environment().repository.tree);
  return { root, configPath, attemptPath, loaded };
}

function loadedInvocation(
  configPath: string,
  configBytes: Buffer,
  outputParentDirectory: string,
  attemptPath: string,
  ergoSourcePath: string,
) {
  return Object.freeze({
    config: Object.freeze({
      schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1',
      version: 1,
      profile: 'synthetic-loopback-two-cycle',
      expectedBridgeCommit: '1'.repeat(40),
      bridgeRoot,
      frontierBuildParentDirectory: join(outputParentDirectory, 'frontier-builds'),
      ergoSourcePath,
      ergoJavaExecutablePath: join(outputParentDirectory, 'jdk', 'bin', 'java.exe'),
      frontierCargoHomeDirectory: join(outputParentDirectory, 'cargo-home'),
      outputParentDirectory,
      attemptName: 'fresh-attempt',
    }),
    configBytes,
    configSha256Hex: '2'.repeat(64),
    configCanonicalPath: configPath,
    worktreeRoot: bridgeRoot,
    attemptPath,
    pathIdentityDigestHex: '3'.repeat(64),
    rootInput: Object.freeze({
      frontierBuild: Object.freeze({ source: 'frontier' }),
      ergoBuild: Object.freeze({ source: 'ergo', ergoSourcePath }),
    }),
  });
}

function configureParent(
  fixture: ReturnType<typeof commandFixture>,
  result: ReturnType<typeof projectedResult>,
): void {
  mocked.load.mockReturnValue(fixture.loaded);
  mocked.environment.mockResolvedValue(environment());
  mocked.runtime.mockReturnValue(environment().runtime);
  mocked.process.mockImplementation(async input => {
    writeWorkerTransport(fixture, result);
    return cleanProcessResult(input);
  });
}

function failureBindings(fixture: ReturnType<typeof commandFixture>) {
  return {
    configSha256Hex: fixture.loaded.configSha256Hex,
    expectedBridgeCommit: fixture.loaded.config.expectedBridgeCommit,
    pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
  };
}

function expectedTerminalFailure(fixture: ReturnType<typeof commandFixture>): string {
  const body = {
    schema: 'e2s.substrate-federated-native-two-cycle-failure.v1', version: 1,
    status: 'two_cycle_invocation_failed',
    configSha256Hex: fixture.loaded.configSha256Hex,
    expectedBridgeCommit: fixture.loaded.config.expectedBridgeCommit,
    failureClass: 'execution_failure',
    checks: { startRecordPresent: true, automaticRetryOrResumeEnabled: false, postFailureIdentityCheckPassed: true },
    boundaries: { rootCleanupEstablishedByTimeout: false, startWithoutThisTerminalWouldBeAmbiguous: true, rawCausePublished: false },
  };
  return `${canonicalJson({ ...body, receiptDigestHex: sha256CanonicalJson(
    body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1',
  ) })}\n`;
}

function environment() {
  return Object.freeze({
    repository: Object.freeze({
      commit: '1'.repeat(40),
      tree: '4'.repeat(40),
      clean: true as const,
    }),
    runtime: Object.freeze({
      nodeVersion: '24.14.0',
      nodeExecutableSha256: '5'.repeat(64),
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256: '6'.repeat(64),
      gitExecutablePath: 'D:\\tools\\git.exe',
      relayerPackageLockSha256: '7'.repeat(64),
      parentRuntimePackagesValidated: true as const,
      loaderInvocationValidated: true as const,
      gitEnvironmentSanitized: true as const,
    }),
    toolIdentityDigestHex: '8'.repeat(64),
  });
}

function projectedResult() {
  const projectedCycle = (seed: string) => ({
    pegIn: {
      sourceLockTransactionIdHex: seed.repeat(32),
      reserveTransitionTransactionIdHex: next(seed, 1).repeat(32),
      sourceLockBoxIdHex: next(seed, 2).repeat(32),
      reserveSuccessorBoxIdHex: next(seed, 3).repeat(32),
      mintIdentityHex: `0x${next(seed, 4).repeat(32)}`,
      sourceProofReceiptDigestHex: next(seed, 5).repeat(32),
    },
    mintIdentityHex: `0x${next(seed, 4).repeat(32)}`,
    sourceProofReceiptDigestHex: next(seed, 5).repeat(32),
    amountNanoErg: '20000000',
    burnGrossAmountNanoErg: '15000000',
    burnNetAmountNanoErg: '10000000',
    trackerTransactionIdHex: next(seed, 6).repeat(32),
    payoutTransactionIdHex: next(seed, 7).repeat(32),
    payoutAmountNanoErg: '10000000',
  });
  const body = {
    schema: 'e2s.substrate-federated-native-two-cycle-result.v1',
    version: 1,
    status: 'two_cycle_local_synthetic_execution_completed',
    rootResultDigestHex: '9'.repeat(64),
    genesis: {
      nativeGenesisHashHex: `0x${'10'.repeat(32)}`,
      typedGenesisSha256Hex: '11'.repeat(32),
      rawSpecSha256Hex: '12'.repeat(32),
      runtimeProfileIdHex: '13'.repeat(32),
      familyIdHex: '14'.repeat(32),
      sourceProofProfileIdHex: '15'.repeat(32),
      nodeSha256Hex: '16'.repeat(32),
      wasmSha256Hex: '17'.repeat(32),
      operatorAddressHex: `0x${'18'.repeat(20)}`,
      storageKeysChecked: 6,
    },
    issuance: {
      inputBoxIds: ['21', '22', '23'].map(seed => seed.repeat(32)),
      transactionIds: ['31', '32', '33'].map(seed => seed.repeat(32)),
      confirmationHeights: [100, 101, 102],
    },
    firstCycle: projectedCycle('40'),
    secondCycle: projectedCycle('60'),
    checks: {
      completedCycles: 2,
      nativeAndErgoCleanupCompletedBeforeReturn: true,
      cycleIdentitiesDistinct: true,
      createOnlyWorkerTransportRequired: true,
    },
    boundaries: {
      fixedSyntheticLoopbackProfile: true,
      trustedHostAndCachesRequired: true,
      independentlyReproducibleBuildEstablished: false,
      independentOperatorCustodyEstablished: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      releaseReadinessEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1',
    ),
  });
}

function next(seed: string, increment: number): string {
  return (Number.parseInt(seed, 16) + increment).toString(16).padStart(2, '0');
}

function writeWorkerTransport(
  fixture: ReturnType<typeof commandFixture>,
  result: ReturnType<typeof projectedResult>,
): void {
  const transport = {
    schema: 'e2s.substrate-federated-native-two-cycle-worker-transport.v1',
    version: 1,
    status: 'root_completed_and_cleaned',
    configSha256Hex: fixture.loaded.configSha256Hex,
    bridgeCommit: environment().repository.commit,
    bridgeTree: environment().repository.tree,
    pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
    toolIdentityDigestHex: environment().toolIdentityDigestHex,
    result,
  };
  const locator = writeRecoveryManifestFixture(fixture);
  const workerRecovery = createNativeTwoCycleWorkerRecoveryLocatorV1(locator, {
    configSha256Hex: fixture.loaded.configSha256Hex,
    bridgeCommit: environment().repository.commit,
    bridgeTree: environment().repository.tree,
    pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
    toolIdentityDigestHex: environment().toolIdentityDigestHex,
    rootResultDigestHex: result.rootResultDigestHex,
  });
  writeFileSync(join(fixture.attemptPath, 'worker-recovery-locator-v1.json'),
    `${canonicalJson(workerRecovery)}\n`, 'utf8');
  writeFileSync(
    join(fixture.attemptPath, 'worker-result.json'),
    `${canonicalJson(transport)}\n`,
    'utf8',
  );
  writeFileSync(
    join(fixture.attemptPath, 'worker-wasm-avl-package.json'),
    `${canonicalJson({
      schema: 'e2s.substrate-federated-native-two-cycle-worker-wasm-avl-package.v1',
      version: 1,
      status: 'package_identity_revalidated',
      bridgeCommit: environment().repository.commit,
      bridgeTree: environment().repository.tree,
      sourceSha256Hex: wasmPackageIdentity().sourceSha256Hex,
      packageSha256Hex: wasmPackageIdentity().packageSha256Hex,
      checks: {
        matchedBeforeImport: true,
        matchedAfterImport: true,
        matchedAfterRoot: true,
      },
    })}\n`,
    'utf8',
  );
}

function writeRecoveryManifestFixture(fixture: ReturnType<typeof commandFixture>
  | ReturnType<typeof workerFixture>) {
  const buildDirectoryName = 'bridge-fed-genesis-ABC123';
  const directoryName = 'two-cycle-recovery-ABC123';
  const directory = join(fixture.loaded.config.frontierBuildParentDirectory,
    buildDirectoryName, 'target', directoryName);
  mkdirSync(directory, { recursive: true });
  const bytes = Buffer.from('{"schema":"synthetic-recovery-manifest"}\n', 'utf8');
  writeFileSync(join(directory, 'manifest.json'), bytes);
  return Object.freeze({ buildDirectoryName, directoryName,
    manifestSha256Hex: createHash('sha256').update(bytes).digest('hex') });
}

function wasmPackageIdentity() {
  return Object.freeze({
    sourceSha256Hex: 'a'.repeat(64),
    packageSha256Hex: 'b'.repeat(64),
    wasmPackVersion: 'wasm-pack 0.14.0',
    wasmPackExecutableSha256Hex: '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8',
    wasmBindgenVersion: 'wasm-bindgen 0.2.120',
    wasmBindgenExecutableSha256Hex: '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
    rustcVersion: 'rustc 1.97.1 (8bab26f4f 2026-07-14)',
    rustcExecutableSha256Hex: 'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55',
    cargoVersion: 'cargo 1.97.1 (c980f4866 2026-06-30)',
    cargoExecutableSha256Hex: 'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b',
  });
}

function writeWasmPackageEvidence(
  attemptPath: string,
  bridgeCommit: string,
  bridgeTree: string,
): void {
  writeFileSync(
    join(attemptPath, 'wasm-avl-package.json'),
    `${canonicalJson({
      schema: 'e2s.substrate-federated-native-two-cycle-wasm-avl-package.v2',
      version: 1,
      status: 'source-and-tool-bound-package-built',
      bridgeCommit,
      bridgeTree,
      build: wasmPackageIdentity(),
    })}\n`,
    'utf8',
  );
}

function mutateJsonPath(
  record: Record<string, unknown>,
  fieldPath: readonly string[],
  replacement?: string,
): void {
  if (fieldPath.length === 0) throw new Error('test mutation path is empty');
  let current = record;
  for (const field of fieldPath.slice(0, -1)) {
    const nested = current[field];
    if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) {
      throw new Error('test mutation path does not resolve to an object');
    }
    current = nested as Record<string, unknown>;
  }
  const key = fieldPath.at(-1)!;
  const original = current[key];
  if (replacement !== undefined) current[key] = replacement;
  else if (typeof original === 'string') current[key] = `${original}-tampered`;
  else if (typeof original === 'number') current[key] = original + 1;
  else if (typeof original === 'boolean') current[key] = !original;
  else throw new Error('test mutation field has an unsupported value');
}

function writeCanonicalJson(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, `${canonicalJson(value)}\n`, 'utf8');
}

function cleanProcessResult(input: { maxStdoutBytes: number }) {
  return {
    pid: 1234,
    exitCode: 0 as const,
    stdoutBytes: Buffer.alloc(0),
    stderrBytes: Buffer.alloc(0),
    stdout: '',
    stderr: '',
    maximum: input.maxStdoutBytes,
  };
}
