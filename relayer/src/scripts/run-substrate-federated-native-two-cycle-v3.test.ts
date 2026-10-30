import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadV1: vi.fn(), environmentV1: vi.fn(), environmentV2: vi.fn(),
  readyV1: vi.fn(), readyV6: vi.fn(), wasm: vi.fn(), wasmMatches: vi.fn(),
  runtime: vi.fn(), process: vi.fn(),
}));
vi.mock('../substrate-federated-native-two-cycle-invocation-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  loadSubstrateFederatedNativeTwoCycleInvocationV1: mocks.loadV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1: mocks.environmentV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV2: mocks.environmentV2,
}));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1: mocks.readyV1,
}));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), assertV6ErgoRuntimeBuildInputsReady: mocks.readyV6,
}));
vi.mock('./build-wasm-avl.js', () => ({ buildWasmAvlPackageV2: mocks.wasm }));
vi.mock('../substrate-federated-native-wasm-avl-package-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1: mocks.wasmMatches,
}));
vi.mock('../authenticated-v2-runtime-bundle.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), validatePinnedFederatedCampaignParentRuntime: mocks.runtime,
}));
vi.mock('../pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), runBoundedProcess: mocks.process,
}));

import { V4_GENERATED_OUTPUT_ROOTS }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import { loadSubstrateFederatedNativeTwoCycleInvocationV2,
  type SubstrateFederatedNativeTwoCycleInvocationV2Config }
  from '../substrate-federated-native-two-cycle-invocation-v1.js';
import type { V6ErgoRuntimeBuildInput }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js';
import { runSubstrateFederatedNativeTwoCycleFromArgumentsV2 as runV2,
  runSubstrateFederatedNativeTwoCycleFromArgumentsV3 as runV3 }
  from './run-substrate-federated-native-two-cycle-v2.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(ROOT), 'diagnostics', 'caller-v3'));
let suite: string | undefined;
let serial = 0;
const stop = new Error('synthetic worker stop');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.wasm.mockResolvedValue({ sourceSha256Hex: 'a'.repeat(64), packageSha256Hex: 'b'.repeat(64) });
  mocks.process.mockRejectedValue(stop);
});
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(() => {
  if (!suite) return;
  const quarantine = resolve(parse(suite).root, 'A EFFACER');
  const destination = join(quarantine, 'bridge-caller-v3-' + basename(suite));
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
  const configPath = join(root, 'invocation.json');
  const bytes = Buffer.from(JSON.stringify(config, null, 2) + '\n'); writeFileSync(configPath, bytes);
  const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV2(configPath);
  const runtime = { nodeVersion: 'fixture', nodeExecutableSha256: '5'.repeat(64),
    gitVersion: 'fixture', gitExecutableSha256: '6'.repeat(64), gitExecutablePath: build.gitExecutablePath,
    relayerPackageLockSha256: '7'.repeat(64), parentRuntimePackagesValidated: true,
    loaderInvocationValidated: true, gitEnvironmentSanitized: true };
  const environment = { repository: { commit: config.expectedBridgeCommit, tree: '4'.repeat(40), clean: true },
    runtime, toolIdentityDigestHex: '8'.repeat(64) };
  mocks.environmentV2.mockResolvedValue(environment); mocks.runtime.mockReturnValue(runtime);
  vi.stubEnv('SystemRoot', build.systemRoot);
  return { root, config, configPath, bytes, loaded, environment };
}

describe('explicit V3 parent with V2 invocation', () => {
  it.each([[], ['--invocation-v2', '--config', 'x'], ['--config', 'x', '--config', 'y'],
    ['--unknown', 'x'], ['--config', '--invocation-v2']].map(argv => [argv] as const))('rejects invalid fixed arguments %j', async argv => {
    await expect(runV3(argv)).rejects.toThrow(/arguments/);
    expect(mocks.environmentV2).not.toHaveBeenCalled(); expect(mocks.wasm).not.toHaveBeenCalled();
  });

  it('uses the real V2 loader to reject legacy keys before environment, WASM or attempt creation', async () => {
    const f = fixture(); writeFileSync(f.configPath, JSON.stringify({ ...f.config, ergoSourcePath: 'legacy' }));
    await expect(runV3(['--config', f.configPath])).rejects.toThrow(/fields differ/);
    expect(mocks.environmentV2).not.toHaveBeenCalled(); expect(mocks.wasm).not.toHaveBeenCalled();
    expect(existsSync(f.loaded.attemptPath)).toBe(false); expect(mocks.loadV1).not.toHaveBeenCalled();
  });

  it('rejects stale immutable lock validation before readiness, WASM and attempt creation', async () => {
    const f = fixture(); const failure = new Error('V6 current bridge lock differs');
    mocks.environmentV2.mockRejectedValueOnce(failure);
    await expect(runV3(['--config', f.configPath])).rejects.toBe(failure);
    expect(mocks.readyV6).not.toHaveBeenCalled(); expect(mocks.wasm).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled(); expect(existsSync(f.loaded.attemptPath)).toBe(false);
  });

  it.each([1, 2])('checks fresh outputs at boundary %s before attempt creation', async boundary => {
    const f = fixture(); const failure = new Error('occupied V6 output'); let seen = 0;
    mocks.readyV6.mockImplementation(() => { if (++seen === boundary) throw failure; });
    await expect(runV3(['--config', f.configPath])).rejects.toBe(failure);
    expect(mocks.readyV6).toHaveBeenCalledTimes(boundary);
    expect(mocks.wasm).toHaveBeenCalledTimes(boundary - 1);
    expect(mocks.process).not.toHaveBeenCalled(); expect(existsSync(f.loaded.attemptPath)).toBe(false);
  });

  it('rejects an immutable identity change after WASM before the second freshness check', async () => {
    const f = fixture(); mocks.environmentV2.mockResolvedValueOnce(f.environment)
      .mockResolvedValueOnce({ ...f.environment, toolIdentityDigestHex: '9'.repeat(64) });
    await expect(runV3(['--config', f.configPath])).rejects.toThrow(/identity changed/);
    expect(mocks.readyV6).toHaveBeenCalledTimes(1); expect(existsSync(f.loaded.attemptPath)).toBe(false);
  });

  it('captures original V2 bytes, dispatches the fixed worker flag and derives nested Java environment', async () => {
    const f = fixture(); await expect(runV3(['--config', f.configPath])).rejects.toBe(stop);
    expect(readFileSync(join(f.loaded.attemptPath, 'config.json'))).toEqual(f.bytes);
    const captured = loadSubstrateFederatedNativeTwoCycleInvocationV2(
      join(f.loaded.attemptPath, 'config.json'), f.loaded.attemptPath);
    expect(captured.configSha256Hex).toBe(f.loaded.configSha256Hex);
    const launched = mocks.process.mock.calls[0]![0];
    const workerIndex = launched.args.findIndex((arg: string) => arg.endsWith('worker-v2.ts'));
    expect(launched.args[workerIndex + 1]).toBe('--invocation-v2');
    expect(launched.env.JAVA_HOME).toBe(dirname(dirname(f.config.ergoBuild.javaExecutablePath)));
    expect(launched.env.SystemRoot).toBe(f.config.ergoBuild.systemRoot);
    expect(mocks.environmentV2).toHaveBeenCalledTimes(3);
    expect(mocks.readyV6).toHaveBeenCalledTimes(2);
    expect(mocks.readyV6).toHaveBeenNthCalledWith(1, f.loaded.config.ergoBuild, 'parent-before-wasm');
    expect(mocks.readyV6).toHaveBeenNthCalledWith(2, f.loaded.config.ergoBuild, 'parent-before-attempt');
    expect(mocks.loadV1).not.toHaveBeenCalled(); expect(mocks.environmentV1).not.toHaveBeenCalled();
    expect(mocks.readyV1).not.toHaveBeenCalled();
  });

  it('keeps the named legacy V2 route on its fixed V1 loader', async () => {
    const f = fixture(); const failure = new Error('legacy loader selected');
    mocks.loadV1.mockImplementation(() => { throw failure; });
    await expect(runV2(['--config', f.configPath])).rejects.toBe(failure);
    expect(mocks.loadV1).toHaveBeenCalledOnce(); expect(mocks.environmentV2).not.toHaveBeenCalled();
    expect(mocks.readyV6).not.toHaveBeenCalled();
  });

  it('dispatches V3 only through the leading explicit CLI flag', () => {
    const source = readFileSync(new URL('./run-substrate-federated-native-two-cycle-v2.ts', import.meta.url), 'utf8');
    expect(source).toContain("argv[0] === '--invocation-v2'");
    expect(source).toContain('runSubstrateFederatedNativeTwoCycleFromArgumentsV3(argv.slice(1))');
    expect(source).not.toContain("argv.includes('--invocation-v2')");
  });
});
