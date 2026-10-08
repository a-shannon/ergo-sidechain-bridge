import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadInvocation: vi.fn(),
  validateEnvironment: vi.fn(),
  assertBuildOutputReady: vi.fn(),
}));

vi.mock(
  '../substrate-federated-native-two-cycle-invocation-v1.js',
  () => ({
    loadSubstrateFederatedNativeTwoCycleInvocationV1: mocks.loadInvocation,
    validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1:
      mocks.validateEnvironment,
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
  SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA,
  type SubstrateFederatedNativeTwoCyclePreflightV1Dependencies,
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

beforeEach(() => {
  mocks.loadInvocation.mockReset().mockReturnValue(invocation);
  mocks.validateEnvironment.mockReset().mockResolvedValue(environment);
  mocks.assertBuildOutputReady.mockReset().mockReturnValue(undefined);
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

function dependencies(): SubstrateFederatedNativeTwoCyclePreflightV1Dependencies {
  return {
    loadInvocation: mocks.loadInvocation,
    validateEnvironment: mocks.validateEnvironment,
    assertBuildOutputReady: mocks.assertBuildOutputReady,
  } as unknown as SubstrateFederatedNativeTwoCyclePreflightV1Dependencies;
}
