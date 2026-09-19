import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  ergoLock: vi.fn(),
  frontier: vi.fn(),
  process: vi.fn(),
  protoc: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock('./authenticated-v2-source-tree-conformance.js', () => ({
  validatePinnedAuthenticatedV2ParentRuntime: mocked.runtime,
}));
vi.mock('./pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));
vi.mock('./substrate-federated-authority-safe-devnet-build-environment-v1.js', () => ({
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1: mocked.frontier,
}));
vi.mock('./substrate-federated-authority-safe-devnet-protoc-v1.js', () => ({
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1: mocked.protoc,
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1: mocked.ergoLock,
}));

import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
} from './substrate-federated-native-two-cycle-invocation-v1.js';

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
const temporaryRoots: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('native two-cycle invocation environment V1', () => {
  it('validates the exact clean repository and complete pinned tool closure', async () => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);

    const environment =
      await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
        invocation,
      );

    expect(environment.repository).toEqual({
      commit: COMMIT,
      tree: TREE,
      clean: true,
    });
    expect(environment.runtime).toBe(fixture.runtime);
    expect(environment.toolIdentityDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(mocked.process).toHaveBeenCalledTimes(3);
    expect(mocked.process.mock.calls.every(call => (
      call[0].executablePath === fixture.config.frontierGitExecutablePath
      && call[0].cwd === fixture.config.bridgeRoot
    ))).toBe(true);
    expect(mocked.process.mock.calls.map(call => call[0].args)).toEqual([
      ['-C', fixture.config.bridgeRoot, 'rev-parse', '--verify', 'HEAD'],
      ['-C', fixture.config.bridgeRoot, 'rev-parse', '--verify', 'HEAD^{tree}'],
      ['-C', fixture.config.bridgeRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
    ]);
    expect(mocked.frontier).toHaveBeenCalledWith({
      bridgeRoot: fixture.config.bridgeRoot,
      cargoExecutablePath: fixture.config.frontierCargoExecutablePath,
      rustcExecutablePath: fixture.config.frontierRustcExecutablePath,
      gitExecutablePath: fixture.config.frontierGitExecutablePath,
      cwd: fixture.config.frontierSourcePath,
    });
    expect(mocked.protoc).toHaveBeenCalledWith({
      bridgeRoot: fixture.config.bridgeRoot,
      cwd: fixture.config.frontierSourcePath,
    });
    expect(mocked.ergoLock).toHaveBeenCalledWith(fixture.config.bridgeRoot);
  });

  it('rejects config-byte drift before invoking any inspector', async () => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);
    writeFileSync(fixture.configPath, `${canonicalJson({
      ...fixture.config,
      attemptName: 'changed-attempt',
    })}\n`, 'utf8');

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toThrow(/config changed/iu);
    expect(mocked.runtime).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects config path drift after asynchronous repository inspection', async () => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);
    mocked.process.mockImplementation(async input => {
      const result = gitResult(input.args);
      if (input.args.at(-1) === 'HEAD') {
        rmSync(fixture.configPath);
        mkdirSync(fixture.configPath);
      }
      return result;
    });

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toThrow(/config|regular file/iu);
    expect(mocked.process).toHaveBeenCalled();
  });

  it.each([
    ['Frontier', 'frontierGitExecutablePath'],
    ['Ergo', 'ergoGitExecutablePath'],
  ] as const)('rejects a %s Git path different from the pinned runtime', async (
    _label,
    key,
  ) => {
    const fixture = environmentFixture();
    const otherGit = file(fixture.otherGitDirectory, 'git.exe', 'other git\n');
    writeConfig(fixture.configPath, { ...fixture.config, [key]: otherGit });
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toThrow(/Git paths differ/iu);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong HEAD', () => processSequence('3'.repeat(40), TREE, '')],
    ['malformed tree', () => processSequence(COMMIT, 'not-a-tree', '')],
    ['dirty checkout', () => processSequence(COMMIT, TREE, '?? retained.tmp\0')],
  ] as const)('rejects %s from the pinned Git repository inspection', async (
    _label,
    processImplementation,
  ) => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);
    mocked.process.mockImplementation(processImplementation());

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toThrow();
    expect(mocked.frontier).not.toHaveBeenCalled();
  });

  it.each([
    ['parent runtime', 'runtime'],
    ['Frontier toolchain', 'frontier'],
    ['Protobuf compiler', 'protoc'],
    ['Ergo build lock', 'ergoLock'],
  ] as const)('keeps %s inspector rejection fail-closed', async (_label, owner) => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);
    const failure = new Error(`${owner} rejected`);
    if (owner === 'frontier') mocked.frontier.mockRejectedValueOnce(failure);
    else mocked[owner].mockImplementation(() => { throw failure; });

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toBe(failure);
  });

  it('rejects a substituted Protobuf executable identity', async () => {
    const fixture = environmentFixture();
    const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    configurePassingInspectors(fixture);
    mocked.protoc.mockReturnValue({
      ...fixture.protoc,
      executablePath: fixture.config.frontierCargoExecutablePath,
    });

    await expect(
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
    ).rejects.toThrow(/Protobuf compiler path differs/iu);
    expect(mocked.ergoLock).not.toHaveBeenCalled();
  });

  it.each(['gitExecutableSha256Hex', 'sbtLauncherJarSha256Hex', 'javaHomeSha256Hex'] as const)(
    'rejects a mismatched Ergo lock %s',
    async field => {
      const fixture = environmentFixture();
      const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
        fixture.configPath,
      );
      configurePassingInspectors(fixture);
      mocked.ergoLock.mockReturnValue({
        ...fixture.ergoLock,
        [field]: 'f'.repeat(64),
      });

      await expect(
        validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(invocation),
      ).rejects.toThrow(/Ergo build tools differ/iu);
    },
  );
});

function environmentFixture() {
  const root = mkdtempSync(join(tmpdir(), 'e2s-native-environment-'));
  temporaryRoots.push(root);
  const configDirectory = directory(root, 'config-input');
  const bridgeRoot = directory(root, 'bridge-repository');
  directory(bridgeRoot, '.git');
  const frontierSourcePath = directory(root, 'frontier-source');
  const frontierBuildParentDirectory = directory(root, 'frontier-build-parent');
  const frontierCargoHomeDirectory = directory(root, 'frontier-cargo-home');
  const ergoSourcePath = directory(root, 'ergo-source');
  const outputParentDirectory = directory(root, 'output-parent');
  const gitDirectory = directory(root, 'git-tool');
  const otherGitDirectory = directory(root, 'other-git-tool');
  const cargoDirectory = directory(root, 'cargo-tool');
  const rustcDirectory = directory(root, 'rustc-tool');
  const protocDirectory = directory(root, 'protoc-tool');
  const sbtDirectory = directory(root, 'sbt-tool');
  const javaHome = directory(root, 'java-home');
  const javaBin = directory(javaHome, 'bin');
  const gitExecutablePath = file(gitDirectory, 'git.exe', 'pinned git\n');
  const ergoSbtLauncherJarPath = file(
    sbtDirectory,
    'sbt-launch.jar',
    'pinned sbt\n',
  );
  const ergoJavaExecutablePath = file(javaBin, 'java.exe', 'pinned java\n');
  file(javaHome, 'release', 'JAVA_VERSION=21\n');
  const config = Object.freeze({
    schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1' as const,
    version: 1 as const,
    profile: 'synthetic-loopback-two-cycle' as const,
    expectedBridgeCommit: COMMIT,
    bridgeRoot,
    frontierSourcePath,
    frontierBuildParentDirectory,
    frontierCargoHomeDirectory,
    frontierCargoExecutablePath: file(cargoDirectory, 'cargo.exe', 'cargo\n'),
    frontierRustcExecutablePath: file(rustcDirectory, 'rustc.exe', 'rustc\n'),
    frontierGitExecutablePath: gitExecutablePath,
    frontierProtocExecutablePath: file(protocDirectory, 'protoc.exe', 'protoc\n'),
    ergoSourcePath,
    ergoGitExecutablePath: gitExecutablePath,
    ergoJavaExecutablePath,
    ergoSbtLauncherJarPath,
    outputParentDirectory,
    attemptName: 'fresh-environment-attempt',
  });
  const configPath = join(configDirectory, 'invocation.json');
  writeConfig(configPath, config);
  const runtime = Object.freeze({
    nodeVersion: '24.14.0',
    nodeExecutableSha256: '3'.repeat(64),
    gitVersion: '2.54.0.windows.1',
    gitExecutableSha256: sha256File(gitExecutablePath),
    gitExecutablePath,
    relayerPackageLockSha256: '4'.repeat(64),
    parentRuntimePackagesValidated: true as const,
    loaderInvocationValidated: true as const,
    gitEnvironmentSanitized: true as const,
  });
  const protoc = Object.freeze({
    executablePath: config.frontierProtocExecutablePath,
    platformKey: `${process.platform}-${process.arch}`,
    version: 'libprotoc 29.3',
    sha256Hex: sha256File(config.frontierProtocExecutablePath),
  });
  const ergoLock = Object.freeze({
    schemaVersion: 1 as const,
    kind: 'substrate-federated-isolated-devnet-node-build-lock',
    platform: 'win32-x64',
    consensusSourceLockSha256Hex: '5'.repeat(64),
    ergoNodeBaseCommit: '6'.repeat(40),
    ergoPatchSha256Hex: '7'.repeat(64),
    gitVersion: runtime.gitVersion,
    gitExecutableSha256Hex: sha256File(gitExecutablePath),
    javaHomeSha256Hex: hashDirectoryFiles(javaHome),
    sbtLauncherJarSha256Hex: sha256File(ergoSbtLauncherJarPath),
    projectSbtVersion: '1.11.1',
    javaSystemProperties: Object.freeze([
      '-Dsbt.offline=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.override.build.repos=false',
      '-Djava.net.useSystemProxies=false',
    ]),
    coursierMode: 'offline' as const,
    sbtLauncherRepositoriesFileName: 'repositories',
    sbtLauncherRepositoriesFileTemplate:
      '[repositories]\n  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n'
      + '  bridge-empty-offline: {{EMPTY_REPOSITORY_URI}}, bootOnly\n',
    sbtLauncherEmptyRepositoryDirectoryName:
      'sbt-launcher-empty-repository',
    hostSbtBootDirectoryRelativeToUserProfile: '.sbt/boot',
    hostCoursierCacheDirectoryRelativeToLocalAppData: 'Coursier/cache/v1',
    hostMavenCentralCacheDirectoryRelativeToCoursierCache:
      'https/repo1.maven.org/maven2',
    isolatedSbtStateDirectory: 'target/bridge-sbt-state-v1',
    buildProcessRunner: 'reviewed-windows-job-object-v1' as const,
    windowsJobProcessRunnerSha256Hex: 'a'.repeat(64),
    buildTimeoutMs: 900_000,
    buildTerminationGraceMs: 10_000,
    buildMaxOutputBytes: 33_554_432,
  });
  return Object.freeze({
    root,
    config,
    configPath,
    javaHome,
    otherGitDirectory,
    runtime,
    protoc,
    ergoLock,
  });
}

function configurePassingInspectors(
  fixture: ReturnType<typeof environmentFixture>,
): void {
  mocked.runtime.mockReturnValue(fixture.runtime);
  mocked.frontier.mockResolvedValue(Object.freeze({
    platformKey: `${process.platform}-${process.arch}`,
    rustTarget: 'x86_64-pc-windows-msvc',
    cargo: Object.freeze({ version: 'cargo 1.86.0', sha256: '8'.repeat(64) }),
    rustc: Object.freeze({ version: 'rustc 1.86.0', sha256: '9'.repeat(64) }),
    git: Object.freeze({
      version: fixture.runtime.gitVersion,
      sha256: fixture.runtime.gitExecutableSha256,
    }),
  }));
  mocked.protoc.mockReturnValue(fixture.protoc);
  mocked.ergoLock.mockReturnValue(fixture.ergoLock);
  mocked.process.mockImplementation(async input => gitResult(input.args));
}

function processSequence(commit: string, tree: string, status: string) {
  return async (input: { args: readonly string[] }) => {
    const operation = input.args.slice(2);
    const stdout = operation[0] === 'rev-parse' && operation.at(-1) === 'HEAD'
      ? `${commit}\n`
      : operation[0] === 'rev-parse'
        ? `${tree}\n`
        : status;
    return processResult(stdout);
  };
}

function gitResult(args: readonly string[]) {
  const operation = args.slice(2);
  const stdout = operation[0] === 'status'
    ? ''
    : operation.at(-1) === 'HEAD'
      ? `${COMMIT}\n`
      : `${TREE}\n`;
  return processResult(stdout);
}

function processResult(stdout: string) {
  return Object.freeze({
    pid: 1234,
    exitCode: 0 as const,
    stdoutBytes: Buffer.from(stdout, 'utf8'),
    stderrBytes: Buffer.alloc(0),
    stdout,
    stderr: '',
  });
}

function directory(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path);
  return path;
}

function file(root: string, name: string, contents: string): string {
  const path = join(root, name);
  writeFileSync(path, contents, 'utf8');
  return path;
}

function writeConfig(path: string, value: unknown): void {
  writeFileSync(path, `${canonicalJson(value)}\n`, 'utf8');
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashDirectoryFiles(root: string): string {
  const files: string[] = [];
  const visit = (cursor: string): void => {
    for (const entry of readdirSync(cursor, { withFileTypes: true })) {
      const path = resolve(cursor, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  const rows = files
    .map(path => `${relative(root, path).replace(/\\/gu, '/')}:${sha256File(path)}`)
    .sort();
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}
