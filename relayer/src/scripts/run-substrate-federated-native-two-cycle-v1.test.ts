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
import { delimiter, dirname, join, parse } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  environment: vi.fn(),
  load: vi.fn(),
  process: vi.fn(),
  project: vi.fn(),
  root: vi.fn(),
  runtime: vi.fn(),
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
import {
  runSubstrateFederatedNativeTwoCycleFromArguments,
} from './run-substrate-federated-native-two-cycle-v1.js';
import {
  runSubstrateFederatedNativeTwoCycleWorkerFromArguments,
} from './run-substrate-federated-native-two-cycle-worker-v1.js';

const temporaryRoots: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
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
    expect(existsSync(join(fixture.attemptPath, 'failure.json'))).toBe(false);
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
    mocked.process.mockRejectedValueOnce(primary);
    await expect(runSubstrateFederatedNativeTwoCycleFromArguments([
      '--config', fixture.configSourcePath,
    ])).rejects.toBe(primary);
    const failure = JSON.parse(readFileSync(
      join(fixture.attemptPath, 'failure.json'),
      'utf8',
    )) as Record<string, unknown>;
    expect(failure.failureClass).toBe('contained_process_failure');
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
      await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(input.args.slice(-6));
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
    const order: string[] = [];
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockImplementation(async () => {
      order.push('validate');
      return environment();
    });
    mocked.root.mockImplementation(async () => {
      order.push('root');
      order.push('cleanup-complete');
      return { root: 'result' };
    });
    mocked.project.mockImplementation(value => {
      order.push('project');
      expect(value).toEqual({ root: 'result' });
      return projectedResult();
    });

    await runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
      '--attempt', fixture.attemptPath,
    ]);

    expect(mocked.root).toHaveBeenCalledOnce();
    expect(mocked.root).toHaveBeenCalledWith(fixture.loaded.rootInput);
    expect(order).toEqual([
      'validate', 'root', 'cleanup-complete', 'project', 'validate',
    ]);
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(true);
    expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(false);
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
        fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath,
      ])).rejects.toBe(primary);
      const text = readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8');
      expect(JSON.parse(text)).toMatchObject({
        stage, configSha256Hex: fixture.loaded.configSha256Hex,
        expectedBridgeCommit: fixture.loaded.config.expectedBridgeCommit,
        pathIdentityDigestHex: fixture.loaded.pathIdentityDigestHex,
        rootCleanupEstablished: false, rawCausePublished: false, sourceFailurePhase: null,
      });
      expect(text).not.toContain('private');
      expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
      expect(mocked.root).toHaveBeenCalledTimes(stage === 'pre-root' ? 0 : 1);
    },
  );

  it('worker records transport publication failure without claiming cleanup', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockResolvedValue(environment());
    mocked.root.mockResolvedValue({ root: 'result' });
    mocked.project.mockReturnValue(projectedResult());
    mkdirSync(join(fixture.attemptPath, 'worker-result.json'));
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath,
    ])).rejects.toThrow();
    const diagnostic = JSON.parse(readFileSync(join(fixture.attemptPath, 'worker-failure.json'), 'utf8'));
    expect(diagnostic.stage).toBe('transport-publication');
    expect(diagnostic.rootCleanupEstablished).toBe(false);
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
      fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath,
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
      '--attempt', fixture.attemptPath,
    ])).rejects.toBe(primary);
    expect(mocked.root).toHaveBeenCalledOnce();
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
    await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArguments([
      '--config', fixture.configPath,
      '--expected-config-sha256', fixture.loaded.configSha256Hex,
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
      '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/identities changed/iu);
    expect(mocked.root).toHaveBeenCalledOnce();
    expect(existsSync(join(fixture.attemptPath, 'worker-result.json'))).toBe(false);
  });

  it('consumes the worker entry even when environment validation fails', async () => {
    const fixture = workerFixture();
    mocked.load.mockReturnValue(fixture.loaded);
    mocked.environment.mockRejectedValueOnce(new Error('preflight failed'));
    const argv = ['--config', fixture.configPath, '--expected-config-sha256',
      fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath];
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
        fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath,
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
      fixture.loaded.configSha256Hex, '--attempt', fixture.attemptPath,
    ])).rejects.toThrow(/parent start differs/iu);
    expect(mocked.environment).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.attemptPath, 'worker-failure.json'))).toBe(false);
  });
});

function commandFixture() {
  const root = mkdtempSync(join(tmpdir(), 'e2s-two-cycle-command-'));
  temporaryRoots.push(root);
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
  );
  return { root, outputParentDirectory, configSourcePath, attemptPath, loaded };
}

function workerFixture() {
  const root = mkdtempSync(join(tmpdir(), 'e2s-two-cycle-worker-'));
  temporaryRoots.push(root);
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
  );
  writeFileSync(join(attemptPath, 'start.json'), canonicalJson({
    schema: 'e2s.substrate-federated-native-two-cycle-start.v1', version: 1,
    status: 'two_cycle_invocation_started', configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: loaded.config.expectedBridgeCommit,
    expectedBridgeTree: environment().repository.tree,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex,
    toolIdentityDigestHex: environment().toolIdentityDigestHex,
  }));
  return { root, configPath, attemptPath, loaded };
}

function loadedInvocation(
  configPath: string,
  configBytes: Buffer,
  outputParentDirectory: string,
  attemptPath: string,
) {
  return Object.freeze({
    config: Object.freeze({
      schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1',
      version: 1,
      profile: 'synthetic-loopback-two-cycle',
      expectedBridgeCommit: '1'.repeat(40),
      bridgeRoot: 'D:\\bridge',
      ergoJavaExecutablePath: join(outputParentDirectory, 'jdk', 'bin', 'java.exe'),
      frontierCargoHomeDirectory: join(outputParentDirectory, 'cargo-home'),
      outputParentDirectory,
      attemptName: 'fresh-attempt',
    }),
    configBytes,
    configSha256Hex: '2'.repeat(64),
    configCanonicalPath: configPath,
    worktreeRoot: 'D:\\bridge',
    attemptPath,
    pathIdentityDigestHex: '3'.repeat(64),
    rootInput: Object.freeze({
      frontierBuild: Object.freeze({ source: 'frontier' }),
      ergoBuild: Object.freeze({ source: 'ergo' }),
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
  writeFileSync(
    join(fixture.attemptPath, 'worker-result.json'),
    `${canonicalJson(transport)}\n`,
    'utf8',
  );
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
