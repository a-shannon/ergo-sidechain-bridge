import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtime: vi.fn(), process: vi.fn(), frontier: vi.fn(), protoc: vi.fn(),
  capture: vi.fn(), legacyLock: vi.fn(), legacyJvm: vi.fn(),
}));
vi.mock('./authenticated-v2-runtime-bundle.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), validatePinnedFederatedCampaignParentRuntime: mocks.runtime,
}));
vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), runBoundedProcess: mocks.process,
}));
vi.mock('./substrate-federated-authority-safe-devnet-build-environment-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1: vi.fn(),
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1: mocks.frontier,
}));
vi.mock('./substrate-federated-authority-safe-devnet-protoc-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1: mocks.protoc,
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1: mocks.legacyLock,
}));
vi.mock('./substrate-federated-tracker-jvm-compiler-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertPinnedFederatedJvmCompilerRuntimeV1: mocks.legacyJvm,
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js',
  async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(),
    captureV4PinnedToolchain: mocks.capture }));
// Keep the real bounded direct-file reader and exact V6 canonical lock check.
// Only physical tool bytes use a tiny fixture instead of the installed Git/JDK.
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js',
  async importOriginal => {
    const real = await importOriginal<typeof import(
      './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js')>();
    return { ...real, inspectSelectedV6NodeBuildLock(input: Parameters<
      typeof real.inspectSelectedV6NodeBuildLock>[0]) {
      const selected = real.inspectSelectedV6NodeBuildLock(input);
      return { ...selected, lock: { ...selected.lock,
        gitExecutableSha256: hash(Buffer.from('git.exe\n')) } };
    } };
  });

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { V4_GENERATED_OUTPUT_ROOTS }
  from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import { V6_NODE_BUILD_LOCK_CANONICAL_TEXT, V6_NODE_BUILD_LOCK_RELATIVE_PATH }
  from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import type { V6ErgoRuntimeBuildInput }
  from './substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1 as loadV1,
  loadSubstrateFederatedNativeTwoCycleInvocationV2 as loadV2,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1 as environmentV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV2 as environmentV2,
  type SubstrateFederatedNativeTwoCycleInvocationV2Config,
} from './substrate-federated-native-two-cycle-invocation-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(ROOT), 'diagnostics', 'invocation-v2'));
const homes = ['b0', 'preTarget', 'beforeResolverJob', 'afterResolverJob',
  'beforeUpdateJob', 'afterUpdateJob', 'beforeAssemblyJob', 'afterAssemblyJob'] as const;
const bridgeLocks = ['solidity/package-lock.json', 'solidity/compiled/build-manifest.json',
  'sources/consensus-source-lock.json'] as const;
const helperStateKeys = ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'] as const;
let suite: string | undefined;
let serial = 0;
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
afterAll(() => {
  if (!suite) return;
  if (dirname(suite).toLowerCase() !== realpathSync.native(TEST_ROOT).toLowerCase()
      || !basename(suite).startsWith('case-')) throw new Error('unsafe invocation fixture quarantine');
  const quarantine = join(parse(suite).root, 'A EFFACER');
  mkdirSync(quarantine, { recursive: true });
  if (!lstatSync(quarantine).isDirectory() || lstatSync(quarantine).isSymbolicLink()
      || !lstatSync(suite).isDirectory() || lstatSync(suite).isSymbolicLink()) {
    throw new Error('indirect invocation fixture quarantine');
  }
  const retained = join(quarantine, 'bridge-invocation-v2-' + basename(suite));
  if (existsSync(retained)) throw new Error('invocation fixture quarantine occupied');
  renameSync(suite, retained);
  expect(existsSync(suite)).toBe(false);
  expect(existsSync(retained)).toBe(true);
});
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

function fixture() {
  mkdirSync(TEST_ROOT, { recursive: true });
  suite ??= realpathSync.native(mkdtempSync(join(TEST_ROOT, 'case-')));
  const root = join(suite, String(++serial));
  const directory = (name: string) => {
    const path = join(root, name); mkdirSync(path, { recursive: true }); return path;
  };
  const file = (name: string) => {
    const path = join(root, name); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${name.split('/').at(-1)}\n`); return path;
  };
  const bridgeRoot = directory('bridge'); directory('bridge/.git');
  for (const path of bridgeLocks) {
    mkdirSync(dirname(join(bridgeRoot, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(bridgeRoot, path));
  }
  writeFileSync(join(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH), V6_NODE_BUILD_LOCK_CANONICAL_TEXT);
  const cap = { maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912 };
  const namespace = directory('namespace');
  const build: V6ErgoRuntimeBuildInput = {
    bridgeRoot, sourcePath: directory('sources/source'),
    gitExecutablePath: file('tools/git.exe'), lockSelection: 'v6-current',
    mirrorRoot: directory('mirror'), bootRoot: directory('namespace/boot'),
    leveldbRoot: directory('namespace/gitlab-leveldb-file-repo-01'),
    leveldbReceiptPath: file('namespace/gitlab-leveldb-file-repo-01.json'),
    mavenNamespaceRoot: namespace, v6MavenSourceRoot: directory('maven-source'),
    caps: { total: { ...cap }, roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS
      .map(name => [name, { ...cap }])) as V6ErgoRuntimeBuildInput['caps']['roots'] },
    maxMembershipBytes: 16_777_216,
    gitHomes: Object.fromEntries(homes.map(name => [name, join(directory('git-homes'), name)])) as
      unknown as V6ErgoRuntimeBuildInput['gitHomes'],
    resultPath: join(directory('result'), 'v6-process-owned-build-result.json'),
    javaExecutablePath: file('tools/jdk/bin/java.exe'),
    sbtLauncherJarPath: file('tools/sbt-launch.jar'), systemRoot: directory('windows'),
  };
  const config: SubstrateFederatedNativeTwoCycleInvocationV2Config = {
    schema: 'e2s.substrate-federated-native-two-cycle-invocation.v2', version: 2,
    profile: 'synthetic-loopback-two-cycle', expectedBridgeCommit: '1'.repeat(40), bridgeRoot,
    frontierSourcePath: directory('frontier'), frontierBuildParentDirectory: directory('frontier-builds'),
    frontierCargoHomeDirectory: directory('cargo-home'),
    frontierCargoExecutablePath: file('tools/cargo.exe'),
    frontierRustcExecutablePath: file('tools/rustc.exe'),
    frontierGitExecutablePath: build.gitExecutablePath,
    frontierProtocExecutablePath: file('tools/protoc.exe'), ergoBuild: build,
    outputParentDirectory: directory('attempts'), attemptName: 'fresh-two-cycle',
  };
  const configPath = join(root, 'config.json');
  const write = (value: unknown = config) => writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`);
  write();
  return { root, config, configPath, write };
}

function mockEnvironment(config: SubstrateFederatedNativeTwoCycleInvocationV2Config) {
  if (process.platform === 'win32') {
    for (const key of helperStateKeys) {
      const directory = join(dirname(config.bridgeRoot), 'helper-state', key);
      mkdirSync(directory, { recursive: true });
      vi.stubEnv(key, realpathSync.native(directory));
    }
  }
  mocks.runtime.mockReturnValue({ gitExecutablePath: config.ergoBuild.gitExecutablePath,
    nodeVersion: 'fixture', nodeExecutableSha256: 'a'.repeat(64),
    relayerPackageLockSha256: 'b'.repeat(64), parentRuntimePackagesValidated: true,
    loaderInvocationValidated: true, gitVersion: '2.54.0.windows.1',
    gitExecutableSha256: hash(Buffer.from('git.exe\n')) });
  mocks.process.mockImplementation(async ({ args }: { args: string[] }) => ({
    stdout: args.includes('HEAD^{tree}') ? `${'2'.repeat(40)}\n`
      : args.includes('HEAD') ? `${config.expectedBridgeCommit}\n` : '',
    stderr: '', exitCode: 0,
  }));
  mocks.frontier.mockResolvedValue({ fixture: 'frontier' });
  mocks.protoc.mockReturnValue({ executablePath: config.frontierProtocExecutablePath,
    platformKey: 'win32-x64', version: 'fixture', sha256Hex: 'c'.repeat(64) });
  mocks.capture.mockReturnValue({ javaHomeSha256Hex: 'd'.repeat(64),
    javaExecutableSha256Hex: 'e'.repeat(64), sbtLauncherJarSha256Hex: 'f'.repeat(64),
    identityFrameSha256Hex: '0'.repeat(64) });
}

describe('fixed V2 invocation selection', () => {
  it.skipIf(process.platform !== 'win32')('forwards only explicit helper state and fixed Git controls', async () => {
    const f = fixture(); mockEnvironment(f.config);
    for (const key of ['HOME', 'USERPROFILE', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL',
      'GIT_DIR', 'NODE_OPTIONS', 'PSModulePath']) vi.stubEnv(key, 'untrusted-parent-value');
    vi.stubEnv('TMP', process.env.TEMP);
    await environmentV2(loadV2(f.configPath));
    const environments = mocks.process.mock.calls.map(([input]) => input.env);
    expect(environments).toHaveLength(3);
    expect(new Set(environments).size).toBe(1);
    for (const environment of environments) expect(environment).toEqual({
      PATH: dirname(f.config.ergoBuild.gitExecutablePath),
      SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
      WINDIR: process.env.WINDIR,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0',
      ...Object.fromEntries(helperStateKeys.map(key => [key, process.env[key]])),
    });
    expect(mocks.process.mock.calls.map(([input]) => input.args.slice(2))).toEqual([
      ['rev-parse', '--verify', 'HEAD'], ['rev-parse', '--verify', 'HEAD^{tree}'],
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    ]);
  });

  it.skipIf(process.platform !== 'win32').each(helperStateKeys.flatMap(key =>
    ['absent', 'empty', 'relative', 'nul', 'remote', 'missing', 'file', 'junction',
      'ancestor-junction', 'checkout', 'checkout-ancestor'].map(fault => [key, fault] as const)))
  ('rejects helper %s %s before any Git child or later tool inspection', async (key, fault) => {
    const f = fixture(); mockEnvironment(f.config); const loaded = loadV2(f.configPath);
    let value: string | undefined;
    if (fault === 'empty') value = '';
    else if (fault === 'relative') value = 'relative-helper-state';
    else if (fault === 'nul') value = `${process.env[key]}\0`;
    else if (fault === 'remote') value = '//untrusted/share/helper-state';
    else if (fault === 'missing') value = join(f.root, 'missing-state');
    else if (fault === 'file') {
      value = join(f.root, 'state-file'); writeFileSync(value, 'not a directory');
    } else if (fault === 'junction' || fault === 'ancestor-junction') {
      const target = join(f.root, 'state-target'); mkdirSync(target);
      const alias = join(f.root, 'state-alias'); symlinkSync(target, alias, 'junction');
      if (fault === 'ancestor-junction') {
        mkdirSync(join(target, 'child')); value = join(alias, 'child');
      } else value = alias;
    } else if (fault === 'checkout') value = loaded.worktreeRoot;
    else if (fault === 'checkout-ancestor') value = dirname(loaded.worktreeRoot);
    const nativeEnvironment = process.env;
    const environmentDescriptor = Object.getOwnPropertyDescriptor(process, 'env');
    if (!environmentDescriptor) throw new Error('process.env descriptor is unavailable');
    try {
      if (fault === 'nul') {
        const plainEnvironment: NodeJS.ProcessEnv = { ...nativeEnvironment };
        for (const alias of [...helperStateKeys, 'SystemDrive', 'SYSTEMDRIVE',
          'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATH', 'Path']) {
          const inherited = nativeEnvironment[alias];
          if (inherited !== undefined) plainEnvironment[alias] = inherited;
        }
        for (const required of [...helperStateKeys, 'SystemDrive', 'SystemRoot', 'PATH']) {
          expect(plainEnvironment[required]).toBe(nativeEnvironment[required]);
          expect(plainEnvironment[required]).toBeTypeOf('string');
          expect(plainEnvironment[required]).not.toBe('');
        }
        plainEnvironment[key] = value;
        Object.defineProperty(process, 'env', {
          ...environmentDescriptor, value: plainEnvironment,
        });
        expect(process.env[key]).toBe(value);
        expect(process.env[key]).toContain('\0');
      } else vi.stubEnv(key, value);
      if (fault === 'nul') {
        await expect(environmentV2(loaded)).rejects.toThrow(new RegExp(
          '^Git helper ' + key + ' must be one local absolute non-sensitive path$', 'u'));
      } else await expect(environmentV2(loaded)).rejects.toThrow();
      expect(mocks.process).not.toHaveBeenCalled();
      expect(mocks.frontier).not.toHaveBeenCalled();
      expect(mocks.protoc).not.toHaveBeenCalled(); expect(mocks.capture).not.toHaveBeenCalled();
    } finally {
      if (fault === 'nul') {
        Object.defineProperty(process, 'env', environmentDescriptor);
        expect(process.env).toBe(nativeEnvironment);
      }
    }
  });

  it.skipIf(process.platform === 'win32')('keeps the non-Windows Git environment unchanged', async () => {
    const f = fixture(); mockEnvironment(f.config);
    for (const key of helperStateKeys) vi.stubEnv(key, 'not-a-directory');
    await environmentV2(loadV2(f.configPath));
    expect(mocks.process.mock.calls[0]![0].env).toEqual({
      PATH: dirname(f.config.ergoBuild.gitExecutablePath),
      SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    });
  });

  it.each(['dirty-cache', 'stderr'])('retains fail-closed Git %s rejection', async fault => {
    const f = fixture(); mockEnvironment(f.config);
    mocks.process.mockImplementation(async ({ args }: { args: string[] }) => ({
      stdout: args.includes('HEAD^{tree}') ? `${'2'.repeat(40)}\n`
        : args.includes('HEAD') ? `${f.config.expectedBridgeCommit}\n`
          : '?? relayer/Microsoft/Windows/PowerShell/ModuleAnalysisCache\0',
      stderr: fault === 'stderr' ? 'unexpected Git diagnostic' : '', exitCode: 0,
    }));
    await expect(environmentV2(loadV2(f.configPath))).rejects.toThrow(
      fault === 'stderr' ? /emitted diagnostics/ : /no tracked or untracked changes/);
    expect(mocks.frontier).not.toHaveBeenCalled(); expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('preserves original readable bytes and projects exactly the nested V6 build', () => {
    const f = fixture(); const bytes = readFileSync(f.configPath); const loaded = loadV2(f.configPath);
    expect(Buffer.from(loaded.configBytes)).toEqual(bytes);
    expect(readFileSync(f.configPath)).toEqual(bytes);
    expect(loaded.configSha256Hex).toBe(hash(bytes));
    expect(loaded.config).toEqual(f.config);
    expect(loaded.rootInput.ergoBuild).toEqual(f.config.ergoBuild);
    expect(loaded.config).not.toHaveProperty('ergoSourcePath');
    expect(loaded.rootInput.ergoBuild).not.toHaveProperty('worktreeRoot');
    expect(existsSync(loaded.attemptPath)).toBe(false);
  });

  it('keeps V1 and V2 entry points mutually exclusive', () => {
    const f = fixture(); expect(() => loadV1(f.configPath)).toThrow();
    const { ergoBuild, ...common } = f.config;
    const legacy = { ...common, schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1',
      version: 1, ergoSourcePath: ergoBuild.sourcePath, ergoGitExecutablePath: ergoBuild.gitExecutablePath,
      ergoJavaExecutablePath: ergoBuild.javaExecutablePath, ergoSbtLauncherJarPath: ergoBuild.sbtLauncherJarPath };
    f.write(legacy); expect(() => loadV2(f.configPath)).toThrow();
    expect(loadV1(f.configPath).rootInput.ergoBuild.worktreeRoot).toBe(f.config.bridgeRoot);
    f.write({ ...f.config, schema: legacy.schema }); expect(() => loadV2(f.configPath)).toThrow(/identity/);
    f.write({ ...f.config, version: 1 }); expect(() => loadV2(f.configPath)).toThrow(/identity/);
  });

  it.each(['ergoSourcePath', 'ergoGitExecutablePath', 'ergoJavaExecutablePath', 'ergoSbtLauncherJarPath',
    'extra'])('rejects extra top-level selection %s', key => {
    const f = fixture(); f.write({ ...f.config, [key]: 'legacy' });
    expect(() => loadV2(f.configPath)).toThrow(/fields differ/);
  });

  it.each(['lockSelection', 'sourcePath', 'caps', 'gitHomes', 'maxMembershipBytes'])
    ('rejects missing nested field %s', key => {
      const f = fixture(); const build = { ...f.config.ergoBuild } as Record<string, unknown>;
      delete build[key]; f.write({ ...f.config, ergoBuild: build });
      expect(() => loadV2(f.configPath)).toThrow(/fields differ/);
    });

  it.each(['v1', 'v4', 'v5', 'v6', 'caller-selected'])('rejects lock selection %s', lockSelection => {
    const f = fixture(); f.write({ ...f.config, ergoBuild: { ...f.config.ergoBuild, lockSelection } });
    expect(() => loadV2(f.configPath)).toThrow(/selection/);
  });

  it('rejects nested extras, duplicate nested keys and a different nested bridge root', () => {
    const f = fixture(); f.write({ ...f.config, ergoBuild: { ...f.config.ergoBuild, extra: true } });
    expect(() => loadV2(f.configPath)).toThrow(/fields differ/);
    f.write(); writeFileSync(f.configPath, readFileSync(f.configPath, 'utf8')
      .replace('"lockSelection": "v6-current"', '"lockSelection": "v6-current", "lockSelection": "v6-current"'));
    expect(() => loadV2(f.configPath)).toThrow(/duplicate/i);
    f.write({ ...f.config, ergoBuild: { ...f.config.ergoBuild, bridgeRoot: join(f.root, 'other-bridge') } });
    expect(() => loadV2(f.configPath)).toThrow(/nested Ergo build bridge root/);
  });

  it('rejects nested accessors before reading them', () => {
    const f = fixture(); const getter = vi.fn(() => 'v6-current');
    const input = { ...f.config.ergoBuild };
    Object.defineProperty(input, 'lockSelection', { enumerable: true, get: getter });
    const realParse = JSON.parse;
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((text: string, reviver?) => {
      const parsed = realParse(text, reviver);
      return parsed && typeof parsed === 'object' && parsed.schema === f.config.schema
        ? { ...parsed, ergoBuild: input } : parsed;
    });
    try { expect(() => loadV2(f.configPath)).toThrow(/fields differ/); }
    finally { spy.mockRestore(); }
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(['resultPath', 'gitHome', 'frontierBuild', 'outputParent', 'sourceParent', 'frontierSource'])
    ('rejects V6 overlap at %s', selected => {
      const f = fixture(); const attempt = join(f.config.outputParentDirectory, f.config.attemptName);
      const config = selected === 'resultPath' ? { ...f.config, ergoBuild: {
        ...f.config.ergoBuild, resultPath: join(attempt, 'v6-process-owned-build-result.json'),
      } } : selected === 'gitHome' ? { ...f.config, ergoBuild: { ...f.config.ergoBuild,
        gitHomes: { ...f.config.ergoBuild.gitHomes, b0: join(attempt, 'b0') },
      } } : selected === 'sourceParent' ? { ...f.config, ergoBuild: { ...f.config.ergoBuild,
        resultPath: join(dirname(f.config.ergoBuild.sourcePath), 'v6-process-owned-build-result.json'),
      } } : selected === 'frontierSource' ? { ...f.config, ergoBuild: { ...f.config.ergoBuild,
        gitHomes: { ...f.config.ergoBuild.gitHomes, b0: join(f.config.frontierSourcePath, 'b0') },
      } } : selected === 'frontierBuild'
        ? { ...f.config, frontierBuildParentDirectory: f.config.ergoBuild.mavenNamespaceRoot }
        : { ...f.config, outputParentDirectory: f.config.ergoBuild.mavenNamespaceRoot };
      f.write(config); expect(() => loadV2(f.configPath)).toThrow(/overlap/);
    });

  it('binds all nested paths, caps and membership in the V2 path domain', () => {
    const f = fixture(); const original = loadV2(f.configPath);
    expect(original.pathIdentityDigestHex).toBe(sha256CanonicalJson({
      bridgeRoot: f.config.bridgeRoot, worktreeRoot: f.config.bridgeRoot,
      frontierSourcePath: f.config.frontierSourcePath,
      frontierBuildParentDirectory: f.config.frontierBuildParentDirectory,
      frontierCargoHomeDirectory: f.config.frontierCargoHomeDirectory,
      frontierCargoExecutablePath: f.config.frontierCargoExecutablePath,
      frontierRustcExecutablePath: f.config.frontierRustcExecutablePath,
      frontierGitExecutablePath: f.config.frontierGitExecutablePath,
      frontierProtocExecutablePath: f.config.frontierProtocExecutablePath,
      ergoBuild: original.config.ergoBuild, outputParentDirectory: f.config.outputParentDirectory,
      attemptPath: original.attemptPath,
    }, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PATH_IDENTITY_V2'));
    for (const build of [
      { ...f.config.ergoBuild, maxMembershipBytes: 16_777_215 },
      { ...f.config.ergoBuild, caps: { ...f.config.ergoBuild.caps,
        total: { ...f.config.ergoBuild.caps.total, maxBytes: 536_870_911 },
        roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(key => [key,
          { ...f.config.ergoBuild.caps.roots[key], maxBytes: 536_870_911 }])) } },
      { ...f.config.ergoBuild, resultPath: join(f.root, 'other-result', 'v6-process-owned-build-result.json') },
      { ...f.config.ergoBuild, gitHomes: { ...f.config.ergoBuild.gitHomes, b0: join(f.root, 'other-home') } },
    ]) {
      f.write({ ...f.config, ergoBuild: build });
      expect(loadV2(f.configPath).pathIdentityDigestHex).not.toBe(original.pathIdentityDigestHex);
    }
  });

  it('reloads only original captured V2 bytes and accepts legitimate generated outputs', async () => {
    const f = fixture(); const original = loadV2(f.configPath);
    mkdirSync(original.attemptPath); const captured = join(original.attemptPath, 'config.json');
    writeFileSync(captured, original.configBytes);
    mkdirSync(join(f.config.ergoBuild.sourcePath, 'target'));
    for (const home of Object.values(f.config.ergoBuild.gitHomes)) mkdirSync(home);
    writeFileSync(f.config.ergoBuild.resultPath, '{}\n');
    const reloaded = loadV2(captured, original.attemptPath); mockEnvironment(f.config);
    expect(reloaded.configSha256Hex).toBe(original.configSha256Hex);
    expect(reloaded.pathIdentityDigestHex).toBe(original.pathIdentityDigestHex);
    await expect(environmentV2(reloaded)).resolves.toHaveProperty('toolIdentityDigestHex');
    writeFileSync(captured, `${readFileSync(captured, 'utf8')} `);
    await expect(environmentV2(reloaded)).rejects.toThrow(/config changed/);
  });

  it.each(bridgeLocks)('uses real current V6 lock pins and rejects changed %s', async path => {
    const f = fixture(); mockEnvironment(f.config); const loaded = loadV2(f.configPath);
    writeFileSync(join(f.config.bridgeRoot, path), '{}\n');
    await expect(environmentV2(loaded)).rejects.toThrow(/V6 current bridge lock differs/);
    expect(mocks.legacyLock).not.toHaveBeenCalled(); expect(mocks.legacyJvm).not.toHaveBeenCalled();
  });

  it('binds selected V6 input and current tool captures in a separate tool domain', async () => {
    const f = fixture(); mockEnvironment(f.config);
    const first = await environmentV2(loadV2(f.configPath));
    f.write({ ...f.config, ergoBuild: { ...f.config.ergoBuild, maxMembershipBytes: 16_777_215 } });
    const changedInput = await environmentV2(loadV2(f.configPath));
    expect(changedInput.toolIdentityDigestHex).not.toBe(first.toolIdentityDigestHex);
    mocks.capture.mockReturnValue({ ...mocks.capture.mock.results[0]!.value,
      identityFrameSha256Hex: '1'.repeat(64) });
    expect((await environmentV2(loadV2(f.configPath))).toolIdentityDigestHex)
      .not.toBe(changedInput.toolIdentityDigestHex);
    expect(mocks.legacyLock).not.toHaveBeenCalled(); expect(mocks.legacyJvm).not.toHaveBeenCalled();
  });

  it('rejects source path type changes and mutation of the captured bytes before tool checks', async () => {
    const f = fixture(); const loaded = loadV2(f.configPath);
    loaded.configBytes[0] ^= 1;
    await expect(environmentV2(loaded)).rejects.toThrow(/config changed/);
    expect(mocks.runtime).not.toHaveBeenCalled();
    const other = fixture(); const next = loadV2(other.configPath);
    const retainedSource = join(other.root, 'retained-source-directory');
    expect(existsSync(retainedSource)).toBe(false);
    renameSync(other.config.ergoBuild.sourcePath, retainedSource);
    expect(lstatSync(retainedSource).isDirectory()).toBe(true);
    writeFileSync(other.config.ergoBuild.sourcePath, 'not a source directory');
    await expect(environmentV2(next)).rejects.toThrow(/directory/);
    expect(mocks.runtime).not.toHaveBeenCalled();
  });

  it('rejects a dangling output junction rather than treating it as fresh absence', async () => {
    const f = fixture(); const loaded = loadV2(f.configPath);
    const target = join(f.root, 'junction-target'); mkdirSync(target);
    symlinkSync(target, f.config.ergoBuild.gitHomes.b0, process.platform === 'win32' ? 'junction' : 'dir');
    const retainedTarget = join(f.root, 'retained-junction-target');
    expect(existsSync(retainedTarget)).toBe(false);
    renameSync(target, retainedTarget);
    expect(existsSync(target)).toBe(false);
    expect(lstatSync(retainedTarget).isDirectory()).toBe(true);
    await expect(environmentV2(loaded)).rejects.toThrow(/symbolic link or junction/);
    expect(mocks.runtime).not.toHaveBeenCalled();
  });

  it('rejects changed current V6 lock and wrong environment entry point', async () => {
    const f = fixture(); mockEnvironment(f.config); const loaded = loadV2(f.configPath);
    await expect(environmentV1(loaded as unknown as Parameters<typeof environmentV1>[0]))
      .rejects.toThrow(/version differs/);
    writeFileSync(join(f.config.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH), '{}\n');
    await expect(environmentV2(loaded)).rejects.toThrow(/selected lock bytes differ/);
  });
});
