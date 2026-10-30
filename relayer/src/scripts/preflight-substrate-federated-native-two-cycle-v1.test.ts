import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadInvocation: vi.fn(),
  validateEnvironment: vi.fn(),
  assertBuildOutputReady: vi.fn(),
  loadInvocationV2: vi.fn(),
  validateEnvironmentV2: vi.fn(),
  assertBuildOutputReadyV6: vi.fn(),
  fullBuildInputsReadyV6: vi.fn(),
  buildV6: vi.fn(),
}));

vi.mock(
  '../substrate-federated-native-two-cycle-invocation-v1.js',
  () => ({
    loadSubstrateFederatedNativeTwoCycleInvocationV1: mocks.loadInvocation,
    validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1:
      mocks.validateEnvironment,
    loadSubstrateFederatedNativeTwoCycleInvocationV2: mocks.loadInvocationV2,
    validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV2:
      mocks.validateEnvironmentV2,
  }),
);

vi.mock(
  '../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js',
  () => ({
    assertV6ErgoRuntimeBuildOutputReady: mocks.assertBuildOutputReadyV6,
    assertV6ErgoRuntimeBuildInputsReady: mocks.fullBuildInputsReadyV6,
    buildSubstrateFederatedIsolatedDevnetErgoNodeV6ForExecution: mocks.buildV6,
  }),
);

vi.mock(
  '../substrate-federated-isolated-devnet-ergo-node-build-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1:
      mocks.assertBuildOutputReady,
  }),
);

import {
  preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1,
  preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2,
  SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA,
  type SubstrateFederatedNativeTwoCyclePreflightV1Dependencies,
  type SubstrateFederatedNativeTwoCyclePreflightV2Dependencies,
} from './preflight-substrate-federated-native-two-cycle-v1.js';

const invocation = Object.freeze({
  config: Object.freeze({
    bridgeRoot: 'synthetic-bridge-root',
    ergoSourcePath: 'synthetic-ergo-source',
  }),
}) as unknown as ReturnType<
  SubstrateFederatedNativeTwoCyclePreflightV1Dependencies['loadInvocation']
>;
const environment = Object.freeze({
  repository: Object.freeze({
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    clean: true as const,
  }),
  toolIdentityDigestHex: 'c'.repeat(64),
}) as unknown as Awaited<ReturnType<
  SubstrateFederatedNativeTwoCyclePreflightV1Dependencies['validateEnvironment']
>>;
const configPath = 'synthetic-config.json';
const v2Root = resolve('synthetic-native-preflight-v2');
const v2Path = (name: string) => resolve(v2Root, name);
type LoadedV2 = ReturnType<SubstrateFederatedNativeTwoCyclePreflightV2Dependencies['loadInvocation']>;
const v2Cap = Object.freeze({ maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912 });
const ergoBuildV2: LoadedV2['config']['ergoBuild'] = Object.freeze({
  bridgeRoot: v2Path('bridge'), sourcePath: v2Path('sources/ergo'),
  gitExecutablePath: v2Path('tools/git.exe'), lockSelection: 'v6-current',
  mirrorRoot: v2Path('mirror'), bootRoot: v2Path('namespace/boot'),
  leveldbRoot: v2Path('namespace/gitlab-leveldb-file-repo-01'),
  leveldbReceiptPath: v2Path('namespace/gitlab-leveldb-file-repo-01.json'),
  mavenNamespaceRoot: v2Path('namespace'), v6MavenSourceRoot: v2Path('maven-source'),
  resultPath: v2Path('result/v6-process-owned-build-result.json'),
  javaExecutablePath: v2Path('tools/jdk/bin/java.exe'),
  sbtLauncherJarPath: v2Path('tools/sbt-launch.jar'), systemRoot: v2Path('windows'),
  gitHomes: Object.freeze({
    b0: v2Path('homes/b0'), preTarget: v2Path('homes/preTarget'),
    beforeResolverJob: v2Path('homes/beforeResolverJob'), afterResolverJob: v2Path('homes/afterResolverJob'),
    beforeUpdateJob: v2Path('homes/beforeUpdateJob'), afterUpdateJob: v2Path('homes/afterUpdateJob'),
    beforeAssemblyJob: v2Path('homes/beforeAssemblyJob'), afterAssemblyJob: v2Path('homes/afterAssemblyJob'),
  }),
  caps: Object.freeze({ total: v2Cap, roots: Object.freeze({
    target: v2Cap, 'project/target': v2Cap, 'project/project/target': v2Cap,
    'ergo-core/target': v2Cap, 'ergo-wallet/target': v2Cap, 'avldb/target': v2Cap,
  }) }),
  maxMembershipBytes: 16_777_216,
});
const configV2: LoadedV2['config'] = Object.freeze({
  schema: 'e2s.substrate-federated-native-two-cycle-invocation.v2', version: 2,
  profile: 'synthetic-loopback-two-cycle', expectedBridgeCommit: 'a'.repeat(40),
  bridgeRoot: ergoBuildV2.bridgeRoot, ergoBuild: ergoBuildV2,
  frontierSourcePath: v2Path('frontier'), frontierBuildParentDirectory: v2Path('frontier-builds'),
  frontierCargoHomeDirectory: v2Path('cargo-home'), frontierCargoExecutablePath: v2Path('tools/cargo.exe'),
  frontierRustcExecutablePath: v2Path('tools/rustc.exe'), frontierGitExecutablePath: ergoBuildV2.gitExecutablePath,
  frontierProtocExecutablePath: v2Path('tools/protoc.exe'),
  outputParentDirectory: v2Path('attempts'), attemptName: 'unentered-attempt',
});
const invocationV2: LoadedV2 = Object.freeze({
  config: configV2, configBytes: Buffer.from(JSON.stringify(configV2) + '\n'),
  configSha256Hex: 'd'.repeat(64), configCanonicalPath: v2Path('invocation.json'),
  worktreeRoot: configV2.bridgeRoot, attemptPath: v2Path('attempts/unentered-attempt'),
  pathIdentityDigestHex: 'e'.repeat(64), rootInput: Object.freeze({
    ergoBuild: ergoBuildV2, frontierBuild: Object.freeze({
      bridgeRoot: configV2.bridgeRoot, frontierSourcePath: configV2.frontierSourcePath,
      buildParentDirectory: configV2.frontierBuildParentDirectory,
      cargoHomeDirectory: configV2.frontierCargoHomeDirectory,
      cargoExecutablePath: configV2.frontierCargoExecutablePath,
      rustcExecutablePath: configV2.frontierRustcExecutablePath,
      gitExecutablePath: configV2.frontierGitExecutablePath,
      protocExecutablePath: configV2.frontierProtocExecutablePath,
    }),
  }),
});
const environmentV2 = Object.freeze({ ...environment, toolIdentityDigestHex: 'f'.repeat(64) });

beforeEach(() => {
  mocks.loadInvocation.mockReset().mockReturnValue(invocation);
  mocks.validateEnvironment.mockReset().mockResolvedValue(environment);
  mocks.assertBuildOutputReady.mockReset().mockReturnValue(undefined);
  mocks.loadInvocationV2.mockReset().mockReturnValue(invocationV2);
  mocks.validateEnvironmentV2.mockReset().mockResolvedValue(environmentV2);
  mocks.assertBuildOutputReadyV6.mockReset().mockReturnValue(undefined);
  mocks.fullBuildInputsReadyV6.mockReset();
  mocks.buildV6.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('native two-cycle operator preflight V1', () => {
  it('runs only the configured three stages in order and returns a bounded non-authorizing report', async () => {
    const order: string[] = [];
    mocks.loadInvocation.mockImplementation(path => {
      order.push('load');
      expect(path).toBe(configPath);
      return invocation;
    });
    mocks.validateEnvironment.mockImplementation(async value => {
      order.push('environment');
      expect(value).toBe(invocation);
      return environment;
    });
    mocks.assertBuildOutputReady.mockImplementation((bridgeRoot, ergoSourcePath) => {
      order.push('build-output');
      expect(bridgeRoot).toBe('synthetic-bridge-root');
      expect(ergoSourcePath).toBe('synthetic-ergo-source');
    });
    const phases: string[] = [];

    const report = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
      ['--config', configPath],
      dependencies(),
      phase => phases.push(phase),
    );

    expect(order).toEqual(['load', 'environment', 'build-output']);
    expect(phases).toEqual([
      'arguments',
      'invocation config',
      'environment',
      'Ergo node build output',
    ]);
    expect(report).toEqual({
      schema: SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA,
      version: 1,
      status: 'local-preflight-passed',
      bridgeCommit: 'a'.repeat(40),
      bridgeTree: 'b'.repeat(40),
      toolIdentityDigestHex: 'c'.repeat(64),
      executionAuthorized: false,
      campaignStarted: false,
      wasmBuildStarted: false,
      attemptDirectoryCreated: false,
      nodeStarted: false,
      custodyEstablished: false,
      signingAuthorized: false,
      transportStarted: false,
      fullErgoBaselineEstablished: false,
      emptyFrontierOutputEstablished: false,
      processPortsValidated: false,
      custodyAndFeesReady: false,
      finalShellReady: false,
      admissionReviewed: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/synthetic-|[A-Z]:\\|\\\\/);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it('uses the default module dependencies in the same three-stage order', async () => {
    const order: string[] = [];
    mocks.loadInvocation.mockImplementation(path => {
      order.push('load');
      expect(path).toBe(configPath);
      return invocation;
    });
    mocks.validateEnvironment.mockImplementation(async value => {
      order.push('environment');
      expect(value).toBe(invocation);
      return environment;
    });
    mocks.assertBuildOutputReady.mockImplementation((bridgeRoot, ergoSourcePath) => {
      order.push('build-output');
      expect(bridgeRoot).toBe('synthetic-bridge-root');
      expect(ergoSourcePath).toBe('synthetic-ergo-source');
    });

    const report = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
      ['--config', configPath],
    );

    expect(order).toEqual(['load', 'environment', 'build-output']);
    expect(mocks.loadInvocation).toHaveBeenCalledTimes(1);
    expect(mocks.validateEnvironment).toHaveBeenCalledTimes(1);
    expect(mocks.assertBuildOutputReady).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({
      schema: SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA,
      version: 1,
      status: 'local-preflight-passed',
      bridgeCommit: 'a'.repeat(40),
      bridgeTree: 'b'.repeat(40),
      toolIdentityDigestHex: 'c'.repeat(64),
      executionAuthorized: false,
      campaignStarted: false,
      wasmBuildStarted: false,
      attemptDirectoryCreated: false,
      nodeStarted: false,
      custodyEstablished: false,
      signingAuthorized: false,
      transportStarted: false,
      fullErgoBaselineEstablished: false,
      emptyFrontierOutputEstablished: false,
      processPortsValidated: false,
      custodyAndFeesReady: false,
      finalShellReady: false,
      admissionReviewed: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/synthetic-|[A-Z]:\\|\\\\/);
  });

  it('rejects missing, duplicate, unknown, and extra arguments before loading config', async () => {
    for (const argv of [
      [],
      ['--config'],
      ['--config', configPath, '--config', 'other.json'],
      ['--unknown', configPath],
      ['--config', configPath, 'extra'],
      ['--config', '--unknown'],
    ]) {
      await expect(
        preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(argv, dependencies()),
      ).rejects.toThrow('expected exactly --config <path>');
    }
    expect(mocks.loadInvocation).not.toHaveBeenCalled();
    expect(mocks.validateEnvironment).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
  });

  it('preserves the exact config-loader thrown value and stops', async () => {
    const failure = Object.freeze({ marker: 'config-loader-failure' });
    mocks.loadInvocation.mockImplementation(() => {
      throw failure;
    });

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
        ['--config', configPath],
        dependencies(),
      ),
    ).rejects.toBe(failure);
    expect(mocks.validateEnvironment).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
  });

  it('preserves the exact environment-validator thrown value and stops', async () => {
    const failure = Object.freeze({ marker: 'environment-validation-failure' });
    mocks.validateEnvironment.mockRejectedValue(failure);

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
        ['--config', configPath],
        dependencies(),
      ),
    ).rejects.toBe(failure);
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
  });

  it('preserves the exact build-output-validator thrown value', async () => {
    const failure = Object.freeze({ marker: 'build-output-validation-failure' });
    mocks.assertBuildOutputReady.mockImplementation(() => {
      throw failure;
    });

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
        ['--config', configPath],
        dependencies(),
      ),
    ).rejects.toBe(failure);
  });

  it('preserves a default config-loader failure without calling later stages', async () => {
    const failure = Object.freeze({ marker: 'default-config-loader-failure' });
    mocks.loadInvocation.mockImplementation(() => {
      throw failure;
    });

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1([
        '--config',
        configPath,
      ]),
    ).rejects.toBe(failure);
    expect(mocks.validateEnvironment).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
  });

  it('preserves a default environment failure without calling build-output validation', async () => {
    const failure = Object.freeze({ marker: 'default-environment-failure' });
    mocks.validateEnvironment.mockRejectedValue(failure);

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1([
        '--config',
        configPath,
      ]),
    ).rejects.toBe(failure);
    expect(mocks.loadInvocation).toHaveBeenCalledTimes(1);
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
  });

  it('preserves a default build-output failure after both earlier stages pass', async () => {
    const failure = Object.freeze({ marker: 'default-build-output-failure' });
    mocks.assertBuildOutputReady.mockImplementation(() => {
      throw failure;
    });

    await expect(
      preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1([
        '--config',
        configPath,
      ]),
    ).rejects.toBe(failure);
    expect(mocks.loadInvocation).toHaveBeenCalledTimes(1);
    expect(mocks.validateEnvironment).toHaveBeenCalledTimes(1);
  });

  it('keeps the module import graph limited to approved validators and path utilities', () => {
    const sourcePath = fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const importedModules = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);

    expect(importedModules.sort()).toEqual([
      '../substrate-federated-isolated-devnet-ergo-node-build-v1.js',
      '../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js',
      '../substrate-federated-native-two-cycle-invocation-v1.js',
      'node:path',
      'node:url',
    ].sort());
    expect(importedModules).not.toContain('./run-substrate-federated-native-two-cycle-v1.js');
    expect(importedModules).not.toContain('../authenticated-v2-runtime-bundle.js');
    expect(importedModules).not.toContain('./build-wasm-avl.js');
    expect(source).not.toMatch(
      /buildWasmAvl|writeNewFile|createAttemptDirectory|runBoundedProcess|spawnSync|sign(?:ing)?\s*\(/i,
    );
  });
});

describe('native two-cycle explicit V2 invocation preflight', () => {
  it('passes the exact nested 17-field input to synchronous metadata readiness in the same phase order', async () => {
    const order: string[] = []; const phases: string[] = [];
    mocks.loadInvocationV2.mockImplementation(path => {
      order.push('load-v2'); expect(path).toBe(configPath); return invocationV2;
    });
    mocks.validateEnvironmentV2.mockImplementation(async loaded => {
      order.push('environment-v2'); expect(loaded).toBe(invocationV2); return environmentV2;
    });
    mocks.assertBuildOutputReadyV6.mockImplementation(input => {
      order.push('metadata-v6'); expect(input).toBe(ergoBuildV2);
    });
    const report = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2(
      ['--config', configPath], dependenciesV2(), phase => phases.push(phase));
    expect(order).toEqual(['load-v2', 'environment-v2', 'metadata-v6']);
    expect(phases).toEqual(['arguments', 'invocation config', 'environment', 'Ergo node build output']);
    expect(Object.keys(ergoBuildV2).sort()).toEqual([
      'bridgeRoot', 'sourcePath', 'gitExecutablePath', 'lockSelection', 'mirrorRoot', 'bootRoot',
      'leveldbRoot', 'leveldbReceiptPath', 'mavenNamespaceRoot', 'v6MavenSourceRoot',
      'resultPath', 'javaExecutablePath', 'sbtLauncherJarPath', 'systemRoot',
      'gitHomes', 'caps', 'maxMembershipBytes',
    ].sort());
    expect(invocationV2.config).not.toHaveProperty('ergoSourcePath');
    expect(report.toolIdentityDigestHex).toBe(environmentV2.toolIdentityDigestHex);
    expect(mocks.loadInvocation).not.toHaveBeenCalled();
    expect(mocks.validateEnvironment).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
    expect(mocks.fullBuildInputsReadyV6).not.toHaveBeenCalled();
    expect(mocks.buildV6).not.toHaveBeenCalled();
  });

  it('uses default V2 dependencies while preserving the exact V1 wire format and fourteen false claims', async () => {
    const legacy = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(['--config', configPath]);
    const report = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2(['--config', configPath]);
    const expected = { ...legacy, toolIdentityDigestHex: environmentV2.toolIdentityDigestHex };
    expect(report).toEqual(expected);
    expect(JSON.stringify(report)).toBe(JSON.stringify(expected));
    expect(Object.keys(report)).toHaveLength(20);
    expect(Object.values(report).filter(value => value === false)).toHaveLength(14);
    expect(Object.isFrozen(report)).toBe(true);
    expect(mocks.loadInvocationV2).toHaveBeenCalledOnce();
    expect(mocks.validateEnvironmentV2).toHaveBeenCalledWith(invocationV2);
    expect(mocks.assertBuildOutputReadyV6).toHaveBeenCalledWith(ergoBuildV2);
    expect(mocks.fullBuildInputsReadyV6).not.toHaveBeenCalled();
    expect(mocks.buildV6).not.toHaveBeenCalled();
  });

  it.each(['config', 'environment', 'metadata'] as const)('preserves an exact %s refusal and stops at its phase', async selected => {
    const failure = Object.freeze({ selected }); const phases: string[] = [];
    if (selected === 'config') mocks.loadInvocationV2.mockImplementation(() => { throw failure; });
    if (selected === 'environment') mocks.validateEnvironmentV2.mockRejectedValue(failure);
    if (selected === 'metadata') mocks.assertBuildOutputReadyV6.mockImplementation(() => { throw failure; });
    await expect(preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2(
      ['--config', configPath], undefined, phase => phases.push(phase))).rejects.toBe(failure);
    const stopped = selected === 'config' ? 2 : selected === 'environment' ? 3 : 4;
    expect(phases).toEqual(['arguments', 'invocation config', 'environment', 'Ergo node build output'].slice(0, stopped));
    if (selected === 'config') expect(mocks.validateEnvironmentV2).not.toHaveBeenCalled();
    if (selected !== 'metadata') expect(mocks.assertBuildOutputReadyV6).not.toHaveBeenCalled();
    expect(mocks.fullBuildInputsReadyV6).not.toHaveBeenCalled();
    expect(mocks.buildV6).not.toHaveBeenCalled();
  });

  it.each([1, 2] as const)('does not fall back after the version-%s loader refuses a cross-schema config', async version => {
    const failure = Object.freeze({ marker: 'cross-schema-config-refusal', version });
    const loader = version === 1 ? mocks.loadInvocation : mocks.loadInvocationV2;
    loader.mockImplementation(() => { throw failure; });
    const selected = version === 1 ? preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1
      : preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2;
    await expect(selected(['--config', configPath])).rejects.toBe(failure);
    expect(version === 1 ? mocks.loadInvocationV2 : mocks.loadInvocation).not.toHaveBeenCalled();
    expect(mocks.validateEnvironment).not.toHaveBeenCalled();
    expect(mocks.validateEnvironmentV2).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReady).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReadyV6).not.toHaveBeenCalled();
  });

  it.each([
    [], ['--config'], ['--unknown', configPath], ['--config', '--invocation-v2'],
    ['--invocation-v2', '--config', configPath],
    ['--config', configPath, '--invocation-v2'],
    ['--invocation-v2', '--invocation-v2', '--config', configPath],
  ].map(argv => [argv] as const))('rejects unknown or repeated selector arguments %j before dependencies', async argv => {
    const phases: string[] = [];
    await expect(preflightSubstrateFederatedNativeTwoCycleFromArgumentsV2(
      argv, undefined, phase => phases.push(phase))).rejects.toThrow('expected exactly --config <path>');
    expect(phases).toEqual(['arguments']);
    expect(mocks.loadInvocationV2).not.toHaveBeenCalled();
    expect(mocks.validateEnvironmentV2).not.toHaveBeenCalled();
    expect(mocks.assertBuildOutputReadyV6).not.toHaveBeenCalled();
    expect(mocks.fullBuildInputsReadyV6).not.toHaveBeenCalled();
    expect(mocks.buildV6).not.toHaveBeenCalled();
  });

  it('selects V2 only through the leading CLI flag and imports no producer capability', () => {
    const sourcePath = fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.ts');
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain("argv[0] === '--invocation-v2'");
    expect(source).toContain('argv.slice(1), V2_DEPENDENCIES, observePhase');
    expect(source).toContain('argv, DEFAULT_DEPENDENCIES, observePhase');
    expect(source).not.toContain("argv.includes('--invocation-v2')");
    expect(source).not.toMatch(/assertV6ErgoRuntimeBuildInputsReady|buildWasmAvl|writeNewFile|createAttemptDirectory|runBoundedProcess|spawnSync|runSubstrateFederatedGenesisTargetRoot/);
    expect(source).toContain('dependencies.assertBuildOutputReady(invocation.config.ergoBuild)');
  });
});

function dependencies(): SubstrateFederatedNativeTwoCyclePreflightV1Dependencies {
  return {
    loadInvocation: mocks.loadInvocation,
    validateEnvironment: mocks.validateEnvironment,
    assertBuildOutputReady: mocks.assertBuildOutputReady,
  } as unknown as SubstrateFederatedNativeTwoCyclePreflightV1Dependencies;
}

function dependenciesV2(): SubstrateFederatedNativeTwoCyclePreflightV2Dependencies {
  return {
    loadInvocation: mocks.loadInvocationV2,
    validateEnvironment: mocks.validateEnvironmentV2,
    assertBuildOutputReady: mocks.assertBuildOutputReadyV6,
  };
}
