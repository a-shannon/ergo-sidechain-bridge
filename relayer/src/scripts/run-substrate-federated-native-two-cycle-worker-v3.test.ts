import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';

const mocks = vi.hoisted(() => ({
  loadV1: vi.fn(), environmentV1: vi.fn(), environmentV2: vi.fn(),
  readyV6: vi.fn(), wasmMatches: vi.fn(), rootV1: vi.fn(), rootV2: vi.fn(),
}));
vi.mock('../substrate-federated-native-two-cycle-invocation-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  loadSubstrateFederatedNativeTwoCycleInvocationV1: mocks.loadV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1: mocks.environmentV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV2: mocks.environmentV2,
}));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), assertV6ErgoRuntimeBuildInputsReady: mocks.readyV6,
}));
vi.mock('../substrate-federated-native-wasm-avl-package-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1: mocks.wasmMatches,
}));
vi.mock('../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js', () => ({
  runSubstrateFederatedGenesisTargetRootV1: mocks.rootV1,
  runSubstrateFederatedGenesisTargetRootV2: mocks.rootV2,
}));

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import { V4_GENERATED_OUTPUT_ROOTS }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import { loadSubstrateFederatedNativeTwoCycleInvocationV2,
  type SubstrateFederatedNativeTwoCycleInvocationV2Config }
  from '../substrate-federated-native-two-cycle-invocation-v1.js';
import type { V6ErgoRuntimeBuildInput }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js';
import { extendedRootResult } from '../test-support/substrate-federated-native-two-cycle-root-result.js';
import { runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV2 as runV2,
  runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV3 as runV3 }
  from './run-substrate-federated-native-two-cycle-worker-v2.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(ROOT), 'diagnostics', 'worker-v3'));
let suite: string | undefined;
let serial = 0;
beforeEach(() => { vi.resetAllMocks(); mocks.rootV2.mockResolvedValue(extendedRootResult()); });
afterAll(() => {
  if (!suite) return;
  const quarantine = resolve(parse(suite).root, 'A EFFACER');
  const destination = join(quarantine, 'bridge-worker-v3-' + basename(suite));
  if (!existsSync(quarantine)) mkdirSync(quarantine);
  if (!lstatSync(quarantine).isDirectory() || lstatSync(quarantine).isSymbolicLink()
      || existsSync(destination) || !lstatSync(suite).isDirectory() || lstatSync(suite).isSymbolicLink()) {
    throw new Error('fixture quarantine boundary differs');
  }
  renameSync(suite, destination);
  if (existsSync(suite) || !lstatSync(destination).isDirectory()) throw new Error('fixture quarantine move failed');
});

function fixture() {
  mkdirSync(TEST_ROOT, { recursive: true });
  suite ??= realpathSync.native(mkdtempSync(join(TEST_ROOT, 'source-fixture-')));
  const root = join(suite, String(++serial));
  const directory = (name: string) => {
    const path = join(root, name); mkdirSync(path, { recursive: true }); return path;
  };
  const file = (name: string) => {
    const path = join(root, name); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name + '\n'); return path;
  };
  const bridgeRoot = directory('bridge'); directory('bridge/.git');
  const namespace = directory('namespace');
  const cap = { maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912 };
  const homes = ['b0', 'preTarget', 'beforeResolverJob', 'afterResolverJob',
    'beforeUpdateJob', 'afterUpdateJob', 'beforeAssemblyJob', 'afterAssemblyJob'];
  const build: V6ErgoRuntimeBuildInput = {
    bridgeRoot, sourcePath: directory('sources/source'), gitExecutablePath: file('tools/git.exe'),
    lockSelection: 'v6-current', mirrorRoot: directory('mirror'), bootRoot: directory('namespace/boot'),
    leveldbRoot: directory('namespace/gitlab-leveldb-file-repo-01'),
    leveldbReceiptPath: file('namespace/gitlab-leveldb-file-repo-01.json'),
    mavenNamespaceRoot: namespace, v6MavenSourceRoot: directory('maven-source'),
    caps: { total: { ...cap }, roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(key =>
      [key, { ...cap }])) as V6ErgoRuntimeBuildInput['caps']['roots'] }, maxMembershipBytes: 16_777_216,
    gitHomes: Object.fromEntries(homes.map(name => [name, join(directory('git-homes'), name)])) as
      unknown as V6ErgoRuntimeBuildInput['gitHomes'],
    resultPath: join(directory('result'), 'v6-process-owned-build-result.json'),
    javaExecutablePath: file('tools/jdk/bin/java.exe'), sbtLauncherJarPath: file('tools/sbt-launch.jar'),
    systemRoot: directory('windows'),
  };
  const config: SubstrateFederatedNativeTwoCycleInvocationV2Config = {
    schema: 'e2s.substrate-federated-native-two-cycle-invocation.v2', version: 2,
    profile: 'synthetic-loopback-two-cycle', expectedBridgeCommit: '1'.repeat(40), bridgeRoot,
    frontierSourcePath: directory('frontier'), frontierBuildParentDirectory: directory('frontier-builds'),
    frontierCargoHomeDirectory: directory('cargo-home'), frontierCargoExecutablePath: file('tools/cargo.exe'),
    frontierRustcExecutablePath: file('tools/rustc.exe'), frontierGitExecutablePath: build.gitExecutablePath,
    frontierProtocExecutablePath: file('tools/protoc.exe'), ergoBuild: build,
    outputParentDirectory: directory('attempts'), attemptName: 'fresh-attempt',
  };
  const initialPath = join(root, 'invocation.json');
  const bytes = Buffer.from(JSON.stringify(config, null, 2) + '\n'); writeFileSync(initialPath, bytes);
  const initial = loadSubstrateFederatedNativeTwoCycleInvocationV2(initialPath);
  mkdirSync(initial.attemptPath); const configPath = join(initial.attemptPath, 'config.json');
  writeFileSync(configPath, bytes);
  const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV2(configPath, initial.attemptPath);
  const environment = { repository: { commit: config.expectedBridgeCommit, tree: '4'.repeat(40), clean: true },
    runtime: { nodeExecutableSha256: '5'.repeat(64), relayerPackageLockSha256: '6'.repeat(64),
      gitExecutableSha256: '7'.repeat(64) }, toolIdentityDigestHex: '8'.repeat(64) };
  mocks.environmentV2.mockResolvedValue(environment);
  const start = { schema: 'e2s.substrate-federated-native-two-cycle-start.v1', version: 1,
    status: 'two_cycle_invocation_started', configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: config.expectedBridgeCommit, expectedBridgeTree: environment.repository.tree,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex, toolIdentityDigestHex: environment.toolIdentityDigestHex };
  writeFileSync(join(loaded.attemptPath, 'start.json'), canonicalJson(start) + '\n');
  const wasm = {
    sourceSha256Hex: 'a'.repeat(64), packageSha256Hex: 'b'.repeat(64), wasmPackVersion: 'wasm-pack 0.14.0',
    wasmPackExecutableSha256Hex: '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8',
    wasmBindgenVersion: 'wasm-bindgen 0.2.120',
    wasmBindgenExecutableSha256Hex: '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
    rustcVersion: 'rustc 1.97.1 (8bab26f4f 2026-07-14)',
    rustcExecutableSha256Hex: 'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55',
    cargoVersion: 'cargo 1.97.1 (c980f4866 2026-06-30)',
    cargoExecutableSha256Hex: 'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b',
  };
  writeFileSync(join(loaded.attemptPath, 'wasm-avl-package.json'), canonicalJson({
    schema: 'e2s.substrate-federated-native-two-cycle-wasm-avl-package.v2', version: 1,
    status: 'source-and-tool-bound-package-built', bridgeCommit: config.expectedBridgeCommit,
    bridgeTree: environment.repository.tree, build: wasm,
  }) + '\n');
  const argv = ['--config', configPath, '--expected-config-sha256', loaded.configSha256Hex,
    '--expected-wasm-avl-package-sha256', wasm.packageSha256Hex, '--attempt', loaded.attemptPath];
  return { root, config, configPath, loaded, environment, argv, start };
}

function noClaim(f: ReturnType<typeof fixture>) {
  expect(existsSync(join(f.loaded.attemptPath, 'worker-start.json'))).toBe(false);
  expect(existsSync(join(f.loaded.attemptPath, 'worker-result.json'))).toBe(false);
  expect(existsSync(join(f.loaded.attemptPath, 'worker-failure.json'))).toBe(false);
  expect(mocks.rootV2).not.toHaveBeenCalled(); expect(mocks.rootV1).not.toHaveBeenCalled();
}

describe('fixed V3 worker before claim and after root', () => {
  it.each([[], ['--invocation-v2'], ['--config', 'x'], ['--unknown', 'x']].map(argv => [argv] as const))
    ('rejects invalid fixed arguments %j before all authority', async argv => {
      await expect(runV3(argv)).rejects.toThrow(/arguments/);
      expect(mocks.environmentV2).not.toHaveBeenCalled(); expect(mocks.readyV6).not.toHaveBeenCalled();
    });

  it('uses the real V2 loader to reject a legacy schema before claim', async () => {
    const f = fixture(); writeFileSync(f.configPath, JSON.stringify({ ...f.config, version: 1 }));
    await expect(runV3(f.argv)).rejects.toThrow(/identity/); noClaim(f);
    expect(mocks.environmentV2).not.toHaveBeenCalled(); expect(mocks.loadV1).not.toHaveBeenCalled();
  });

  it('rejects a different captured config digest before environment or claim', async () => {
    const f = fixture(); const argv = [...f.argv]; argv[3] = '0'.repeat(64);
    await expect(runV3(argv)).rejects.toThrow(/config digest differs/); noClaim(f);
    expect(mocks.environmentV2).not.toHaveBeenCalled();
  });

  it('rejects stale current locks before worker claim', async () => {
    const f = fixture(); const failure = new Error('V6 current bridge lock differs');
    mocks.environmentV2.mockRejectedValueOnce(failure);
    await expect(runV3(f.argv)).rejects.toBe(failure); noClaim(f);
    expect(mocks.readyV6).not.toHaveBeenCalled();
  });

  it('rejects occupied V6 outputs before worker claim', async () => {
    const f = fixture(); const failure = new Error('fresh V6 output is occupied');
    mocks.readyV6.mockImplementation(() => { throw failure; });
    await expect(runV3(f.argv)).rejects.toBe(failure); noClaim(f);
  });

  it.each(['tree', 'tools'])('rejects parent %s mismatch before worker claim', async changed => {
    const f = fixture(); mocks.environmentV2.mockResolvedValue({ ...f.environment,
      ...(changed === 'tree' ? { repository: { ...f.environment.repository, tree: '9'.repeat(40) } }
        : { toolIdentityDigestHex: '9'.repeat(64) }) });
    await expect(runV3(f.argv)).rejects.toThrow(/environment differs from parent/); noClaim(f);
  });

  it('rejects changed physical WASM before worker claim', async () => {
    const f = fixture(); const failure = new Error('WASM package changed');
    mocks.wasmMatches.mockImplementationOnce(() => { throw failure; });
    await expect(runV3(f.argv)).rejects.toBe(failure); noClaim(f);
  });

  it('uses only RootV2 and accepts legitimate outputs during immutable post-root validation', async () => {
    const f = fixture(); mocks.rootV2.mockImplementation(async (input, observe) => {
      expect(existsSync(join(f.loaded.attemptPath, 'worker-start.json'))).toBe(true);
      expect(input.ergoBuild).toEqual(f.config.ergoBuild); expect(observe).toBeTypeOf('function');
      mkdirSync(join(f.config.ergoBuild.sourcePath, 'target'));
      writeFileSync(f.config.ergoBuild.resultPath, 'generated result\n');
      return extendedRootResult();
    });
    mocks.environmentV2.mockImplementation(async () => {
      if (mocks.rootV2.mock.calls.length) expect(existsSync(f.config.ergoBuild.resultPath)).toBe(true);
      return f.environment;
    });
    await expect(runV3(f.argv)).resolves.toBeUndefined();
    expect(mocks.readyV6).toHaveBeenCalledOnce(); expect(mocks.environmentV2).toHaveBeenCalledTimes(2);
    expect(mocks.readyV6).toHaveBeenCalledWith(f.loaded.config.ergoBuild, 'worker-before-claim');
    expect(mocks.rootV2).toHaveBeenCalledOnce(); expect(mocks.rootV1).not.toHaveBeenCalled();
    expect(mocks.loadV1).not.toHaveBeenCalled(); expect(mocks.environmentV1).not.toHaveBeenCalled();
    const transport = JSON.parse(readFileSync(join(f.loaded.attemptPath, 'worker-result.json'), 'utf8'));
    expect(transport.schema).toBe('e2s.substrate-federated-native-two-cycle-worker-transport.v1');
    expect(transport.configSha256Hex).toBe(f.loaded.configSha256Hex);
    expect(transport.result.schema).toBe('e2s.substrate-federated-native-two-cycle-result.v1');
  });

  it('rejects changed immutable pins after root while retaining the consumed worker claim', async () => {
    const f = fixture(); const failure = new Error('V6 current lock changed after root');
    mocks.environmentV2.mockResolvedValueOnce(f.environment).mockRejectedValueOnce(failure);
    await expect(runV3(f.argv)).rejects.toBe(failure);
    expect(mocks.rootV2).toHaveBeenCalledOnce(); expect(mocks.readyV6).toHaveBeenCalledOnce();
    expect(existsSync(join(f.loaded.attemptPath, 'worker-start.json'))).toBe(true);
    expect(existsSync(join(f.loaded.attemptPath, 'worker-result.json'))).toBe(false);
    const diagnostic = JSON.parse(readFileSync(join(f.loaded.attemptPath, 'worker-failure.json'), 'utf8'));
    expect(diagnostic.stage).toBe('post-root-identity');
  });

  it('retains a failed RootV2 claim without retrying through RootV1', async () => {
    const f = fixture(); const failure = new Error('synthetic V6 root failure');
    mocks.rootV2.mockRejectedValueOnce(failure);
    await expect(runV3(f.argv)).rejects.toBe(failure);
    expect(mocks.rootV2).toHaveBeenCalledOnce(); expect(mocks.rootV1).not.toHaveBeenCalled();
    expect(mocks.loadV1).not.toHaveBeenCalled(); expect(mocks.environmentV1).not.toHaveBeenCalled();
    expect(existsSync(join(f.loaded.attemptPath, 'worker-start.json'))).toBe(true);
    expect(existsSync(join(f.loaded.attemptPath, 'worker-result.json'))).toBe(false);
  });

  it('preserves the legacy V2 claim before its V1 environment check', async () => {
    const f = fixture(); const failure = new Error('legacy environment failure');
    const real = await vi.importActual<typeof import(
      '../substrate-federated-native-two-cycle-invocation-v1.js')>(
      '../substrate-federated-native-two-cycle-invocation-v1.js');
    const { ergoBuild, ...common } = f.config;
    writeFileSync(f.configPath, JSON.stringify({ ...common,
      schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1', version: 1,
      ergoSourcePath: ergoBuild.sourcePath, ergoGitExecutablePath: ergoBuild.gitExecutablePath,
      ergoJavaExecutablePath: ergoBuild.javaExecutablePath, ergoSbtLauncherJarPath: ergoBuild.sbtLauncherJarPath,
    }) + '\n');
    const legacy = real.loadSubstrateFederatedNativeTwoCycleInvocationV1(f.configPath, f.loaded.attemptPath);
    writeFileSync(join(f.loaded.attemptPath, 'start.json'), canonicalJson({ ...f.start,
      configSha256Hex: legacy.configSha256Hex, pathIdentityDigestHex: legacy.pathIdentityDigestHex,
    }) + '\n');
    const argv = [...f.argv]; argv[3] = legacy.configSha256Hex;
    mocks.loadV1.mockReturnValue(legacy); mocks.environmentV1.mockRejectedValueOnce(failure);
    await expect(runV2(argv)).rejects.toBe(failure);
    expect(existsSync(join(f.loaded.attemptPath, 'worker-start.json'))).toBe(true);
    expect(mocks.environmentV2).not.toHaveBeenCalled(); expect(mocks.readyV6).not.toHaveBeenCalled();
  });

  it('binds the V3 root import to exactly one unaliased named export from the canonical module', () => {
    const text = readFileSync(new URL('./run-substrate-federated-native-two-cycle-worker-v2.ts', import.meta.url), 'utf8');
    const source = ts.createSourceFile('worker.ts', text, ts.ScriptTarget.ES2022, true);
    const selected: ts.VariableDeclaration[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)
          && node.name.elements.some(entry => entry.name.getText(source) === 'runSubstrateFederatedGenesisTargetRootV2')) {
        selected.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source); expect(selected).toHaveLength(1);
    const declaration = selected[0]!; const binding = declaration.name as ts.ObjectBindingPattern;
    expect(binding.elements).toHaveLength(1); expect(binding.elements[0]!.propertyName).toBeUndefined();
    const initializer = declaration.initializer!;
    expect(ts.isAwaitExpression(initializer)).toBe(true);
    const expression = (initializer as ts.AwaitExpression).expression as ts.CallExpression;
    expect(expression.expression.kind).toBe(ts.SyntaxKind.ImportKeyword);
    expect(expression.arguments).toHaveLength(1);
    expect(ts.isStringLiteral(expression.arguments[0]!)).toBe(true);
    expect((expression.arguments[0]! as ts.StringLiteral).text)
      .toBe('../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js');
    expect(text).toContain("argv[0] === '--invocation-v2'");
    expect(text).toContain('runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV3(argv.slice(1))');
  });
});
