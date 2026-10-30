import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ environment: vi.fn(), runtime: vi.fn(),
  wasm: vi.fn(), wasmMatches: vi.fn(), preflight: vi.fn(), lock: vi.fn(),
  maven: vi.fn(), process: vi.fn(), worker: vi.fn(), javaCalls: 0 }));
vi.mock('../substrate-federated-native-two-cycle-invocation-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV2: mocks.environment,
}));
vi.mock('../authenticated-v2-runtime-bundle.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  validatePinnedFederatedCampaignParentRuntime: mocks.runtime,
}));
vi.mock('./build-wasm-avl.js', () => ({ buildWasmAvlPackageV2: mocks.wasm }));
vi.mock('../substrate-federated-native-wasm-avl-package-v1.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1: mocks.wasmMatches,
}));
// Only Git/head authority is synthetic. The configured preflight calls the real
// physical source scanner over the independently constructed 737-file plan.
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  inspectV6NodeBuildPreflightWithPlan: mocks.preflight,
}));
// Production-sized record identities become coherent tiny fixture authorities.
// The actual preentry, dependency capture, receipts, file hashes and validators remain.
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), inspectSelectedV6OrLegacyBuildLock: mocks.lock,
}));
vi.mock('../substrate-federated-native-v6-maven-cache-reader.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), inspectV6PublicMavenCache: mocks.maven,
}));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  withPinnedV4BoundedChildTools: async (action: () => Promise<unknown>) => action(),
}));
vi.mock('../bounded-process-runner.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), runBoundedProcess: mocks.process,
}));

import type { BoundedProcessInput } from '../bounded-process-runner.js';
import { buildV4PhysicalPlan, scanV4PhysicalSourcePass, type V4PhysicalDeclaration,
  type V4PhysicalTreeEntry } from '../substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import { scanV4DirectDependencyTree, type V4DependencyFile }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import { V4_GENERATED_OUTPUT_ROOTS }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import { V6_NODE_BUILD_LOCK_CANONICAL_TEXT, V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX, inspectSelectedV6NodeBuildLock }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import type { V6ErgoRuntimeBuildInput }
  from '../substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js';
import { loadSubstrateFederatedNativeTwoCycleInvocationV2,
  type SubstrateFederatedNativeTwoCycleInvocationV2Config }
  from '../substrate-federated-native-two-cycle-invocation-v1.js';
import { runSubstrateFederatedNativeTwoCycleFromArgumentsV3 as runParent }
  from './run-substrate-federated-native-two-cycle-v2.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(ROOT), 'diagnostics', 'native-v3-physical-admission'));
const HOME_KEYS = ['b0', 'preTarget', 'beforeResolverJob', 'afterResolverJob',
  'beforeUpdateJob', 'afterUpdateJob', 'beforeAssemblyJob', 'afterAssemblyJob'] as const;
const STOP = new Error('synthetic fixed worker boundary reached');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const blob = (bytes: Buffer) => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`))
  .update(bytes).digest('hex');
const compact = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n');
const frame = (files: readonly V4DependencyFile[]) => hash(files.map(file =>
  file.path + '\0' + file.size + '\0' + file.sha256Hex + '\n').join(''));
let suite: string | undefined;
let serial = 0;
beforeEach(() => { vi.resetAllMocks(); mocks.javaCalls = 0; });
afterAll(() => {
  if (!suite) return;
  if (dirname(suite).toLowerCase() !== realpathSync.native(TEST_ROOT).toLowerCase()
      || !basename(suite).startsWith('native-v3-physical-')) throw new Error('fixture containment differs');
  const quarantine = join(parse(suite).root, 'A EFFACER');
  mkdirSync(quarantine, { recursive: true });
  if (!lstatSync(quarantine).isDirectory() || lstatSync(quarantine).isSymbolicLink()
      || !lstatSync(suite).isDirectory() || lstatSync(suite).isSymbolicLink()) {
    throw new Error('indirect fixture quarantine');
  }
  const retained = join(quarantine, basename(suite));
  try { lstatSync(retained); throw new Error('fixture quarantine occupied'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  renameSync(suite, retained);
  expect(existsSync(suite)).toBe(false);
  expect(lstatSync(retained).isDirectory()).toBe(true);
});

function fixture() {
  if (process.platform !== 'win32' || process.arch !== 'x64' || !/^d:[\\/]/iu.test(TEST_ROOT)) {
    throw new Error('physical admission fixtures require the selected Windows x64 D root');
  }
  mkdirSync(TEST_ROOT, { recursive: true });
  suite ??= realpathSync.native(mkdtempSync(join(TEST_ROOT, 'native-v3-physical-')));
  const root = join(suite, String(++serial));
  const directory = (name: string) => {
    const path = join(root, name); mkdirSync(path, { recursive: true }); return path;
  };
  const file = (name: string, bytes: string | Buffer = 'fixture\n') => {
    const path = join(root, name); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' }); return path;
  };
  const bridgeRoot = directory('bridge'); directory('bridge/.git');
  for (const path of ['solidity/package-lock.json', 'solidity/compiled/build-manifest.json',
    'sources/consensus-source-lock.json']) {
    const target = join(bridgeRoot, path); mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, path), target);
  }
  writeFileSync(join(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH), V6_NODE_BUILD_LOCK_CANONICAL_TEXT);
  const canonical = inspectSelectedV6NodeBuildLock({
    path: join(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH), expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
  });
  const sourcePath = directory('sources/ergo'); file('sources/ergo/.git/config', '[core]\n');
  const head = new Map<string, V4PhysicalTreeEntry>();
  const declarations: V4PhysicalDeclaration[] = [];
  const contents = new Map<string, Buffer>();
  for (let index = 0; index < 734; index++) {
    const path = `tree/file${String(index).padStart(4, '0')}`;
    const bytes = Buffer.from([index % 256]);
    head.set(path, { path, mode: index < 724 ? '100644' : '100755', type: 'blob', objectId: blob(bytes) });
    contents.set(path, bytes);
  }
  for (let index = 0; index < 6; index++) {
    const path = `tree/file${String(index).padStart(4, '0')}`;
    const bytes = Buffer.from(`patched-${index}`);
    declarations.push({ path, status: 'modified', patchedBlob: blob(bytes) }); contents.set(path, bytes);
  }
  for (let index = 0; index < 3; index++) {
    const path = `tree/add${index}`; const bytes = Buffer.from(`added-${index}`);
    declarations.push({ path, status: 'added', patchedBlob: blob(bytes) }); contents.set(path, bytes);
  }
  for (const [path, bytes] of contents) file('sources/ergo/' + path, bytes);
  const plan = buildV4PhysicalPlan(head, declarations);
  const rawBaseline = scanV4PhysicalSourcePass(sourcePath, plan);
  const goldenMembership = new Map<string, string>([
    [sourcePath.toLowerCase(), ['D\t.git\n', ...rawBaseline.membership.split('\n')
      .filter(Boolean).map(row => row + '\n')].sort().join('')],
  ]);
  const mirrorRoot = directory('mirror'); const namespace = directory('namespace');
  const bootRoot = directory('namespace/boot');
  const leveldbRoot = directory('namespace/gitlab-leveldb-file-repo-01');
  const mavenFile = file('mirror/org/acme/a.jar', 'x');
  const bootFile = file('namespace/boot/scala/a.jar', 'x');
  const leveldbPrefix = 'org/ethereum/leveldbjni-all/1.18.3/leveldbjni-all-1.18.3';
  const leveldbFile = file('namespace/gitlab-leveldb-file-repo-01/' + leveldbPrefix + '.jar', 'j');
  file('namespace/gitlab-leveldb-file-repo-01/' + leveldbPrefix + '.pom', 'p');
  const mirror = scanV4DirectDependencyTree(mirrorRoot, 16, 1024, 4096);
  const boot = scanV4DirectDependencyTree(bootRoot, 16, 1024, 4096);
  const leveldb = scanV4DirectDependencyTree(leveldbRoot, 6, 1024, 2048);
  for (const [path, tree] of [[mirrorRoot, mirror], [bootRoot, boot], [leveldbRoot, leveldb]] as const) {
    goldenMembership.set(path.toLowerCase(), tree.membership);
  }
  const leveldbReceipt = compact({ aggregateSha256Hex: frame(leveldb.files), buildExecuted: false,
    byteCount: leveldb.bytes, campaignAdmitted: false,
    coordinate: { artifactId: 'leveldbjni-all', groupId: 'org.ethereum', version: '1.18.3' },
    directoryCount: leveldb.directories.length, externalAcceptanceEstablished: false,
    fileCount: leveldb.files.length, files: leveldb.files.map(entry => ({ bytes: entry.size,
      md5Hex: '0'.repeat(32), path: entry.path, sha1Hex: '0'.repeat(40), sha256Hex: entry.sha256Hex })),
    providedDependencyResolutionEstablished: false, resolverExecuted: false,
    schema: 'v4-gitlab-leveldb-artifact-overlay-v1', sourceCacheChecksumSidecarsMatched: true,
    sourceRepositoryUrl: 'https://gitlab.com/api/v4/projects/61211221/packages/maven',
    sourceStableBeforeAfter: true, targetDirectSingleLinkRecaptured: true });
  const leveldbReceiptPath = file('namespace/gitlab-leveldb-file-repo-01.json', leveldbReceipt);
  const leveldbTerminal = compact({ schema: 'bridge-v6-leveldb-overlay-owner-terminal-v1',
    ownerSourceSha256Hex: 'b14e794d933f414afb36f7fa8110c56b94690d67ccaaf157509991c870f56cd2',
    producerSourceSha256Hex: '8abb46bf96316fb5aaa0584e0dc7ede93f548f8a291ae741b661ed31921e0985',
    jobRunnerSha256Hex: canonical.lock.windowsJobProcessRunnerSha256,
    receiptSha256Hex: hash(leveldbReceipt), receiptBytes: leveldbReceipt.length,
    jobOwnerExitCode: 0, jobClosedByPinnedOwner: true, sourceOnly: true,
    resolverExecuted: false, buildExecuted: false, campaignAdmitted: false,
    externalAcceptanceEstablished: false });
  file('namespace/gitlab-leveldb-owner-terminal-01.json', leveldbTerminal);
  const mavenReport = compact({ fixture: 'Maven selected record', files: mirror.files });
  const mavenTerminal = compact({ fixture: 'Maven selected terminal', reportSha256Hex: hash(mavenReport) });
  file('namespace/maven-public-cache-reattest-01.json', mavenReport);
  file('namespace/maven-public-cache-reattest-terminal-01.json', mavenTerminal);
  let mirrorMetadata = mirror.metadataSha256Hex;
  const selectedLock = () => ({ ...canonical.lock,
    ownedMavenMirrorReceiptSha256: hash(mavenReport), ownedMavenMirrorMetadataSha256: mirrorMetadata,
    ownedMavenMirrorAggregateSha256: frame(mirror.files), ownedMavenMirrorDirectoryCount: mirror.directories.length,
    ownedMavenMirrorFileCount: mirror.files.length, ownedMavenMirrorBytes: mirror.bytes,
    ownedBootJarFrameSha256: frame(boot.files), ownedBootJarCount: boot.files.length,
    ownedBootJarBytes: boot.bytes, ownedBootDirectoryCount: boot.directories.length,
    ownedGitlabLeveldbReceiptSha256: hash(leveldbReceipt), ownedGitlabLeveldbAggregateSha256: frame(leveldb.files),
    ownedGitlabLeveldbDirectoryCount: leveldb.directories.length,
    ownedGitlabLeveldbFileCount: leveldb.files.length, ownedGitlabLeveldbBytes: leveldb.bytes,
    v6MavenTerminalSha256: hash(mavenTerminal), v6MavenDirectorySha256: mirror.directorySha256Hex,
    v6MavenMembershipSha256: mirror.fileMembershipSha256Hex, v6LeveldbTerminalSha256: hash(leveldbTerminal) });
  mocks.lock.mockImplementation((_bridge: string, selection: string) => {
    expect(selection).toBe('v6-current'); return { lock: selectedLock(), sha256Hex: canonical.sha256Hex };
  });
  mocks.maven.mockReturnValue({ reportSha256Hex: hash(mavenReport), terminalSha256Hex: hash(mavenTerminal),
    mirrorRootIdentity: mirror.rootIdentity, sourceRootIdentity: 'synthetic-source-record',
    attestationPhysicalIdentity: 'synthetic-record', files: mirror.files,
    sourceOnly: true, gitHeadBound: false, campaignAdmitted: false });
  mocks.preflight.mockImplementation(async ({ sourcePath: selectedSource, gitHomePath }: {
    sourcePath: string; gitHomePath: string;
  }) => {
    expect(selectedSource).toBe(sourcePath);
    expect(lstatSync(gitHomePath).isDirectory()).toBe(true);
    const observed = scanV4PhysicalSourcePass(sourcePath, plan);
    expect(observed.physicalSourceDigestHex).toBe(rawBaseline.physicalSourceDigestHex);
    return { observation: { lockSha256Hex: canonical.sha256Hex }, physicalPlan: plan };
  });
  const cap = { maxFiles: 50_000, maxDirectories: 4096, maxBytes: 536_870_912 };
  const homeParent = directory('homes');
  const build: V6ErgoRuntimeBuildInput = {
    bridgeRoot, sourcePath, gitExecutablePath: file('tools/git.exe'), lockSelection: 'v6-current',
    mirrorRoot, bootRoot, leveldbRoot, leveldbReceiptPath, mavenNamespaceRoot: namespace,
    v6MavenSourceRoot: directory('maven-source'),
    caps: { total: { ...cap }, roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(key =>
      [key, { ...cap }])) as V6ErgoRuntimeBuildInput['caps']['roots'] }, maxMembershipBytes: 16_777_216,
    gitHomes: Object.fromEntries(HOME_KEYS.map(key => [key, join(homeParent, key)])) as
      unknown as V6ErgoRuntimeBuildInput['gitHomes'],
    resultPath: join(directory('result'), 'v6-process-owned-build-result.json'),
    javaExecutablePath: file('tools/jdk/bin/java.exe'), sbtLauncherJarPath: file('tools/sbt-launch.jar'),
    systemRoot: process.env.SystemRoot ?? process.env.WINDIR ?? '',
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
  const configPath = file('invocation.json', compact(config));
  const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV2(configPath);
  const runtime = { nodeVersion: 'fixture', nodeExecutableSha256: '5'.repeat(64),
    gitVersion: 'fixture', gitExecutableSha256: '6'.repeat(64), gitExecutablePath: build.gitExecutablePath,
    relayerPackageLockSha256: '7'.repeat(64), parentRuntimePackagesValidated: true,
    loaderInvocationValidated: true, gitEnvironmentSanitized: true };
  const environment = { repository: { commit: config.expectedBridgeCommit, tree: '4'.repeat(40), clean: true },
    runtime, toolIdentityDigestHex: '8'.repeat(64) };
  mocks.environment.mockResolvedValue(environment); mocks.runtime.mockReturnValue(runtime);
  mocks.wasm.mockResolvedValue({ sourceSha256Hex: 'a'.repeat(64), packageSha256Hex: 'b'.repeat(64) });
  mocks.worker.mockRejectedValue(STOP);
  mocks.process.mockImplementation(async (input: BoundedProcessInput) => {
    if (resolve(input.executablePath).toLowerCase() === build.javaExecutablePath.toLowerCase()) {
      mocks.javaCalls++; throw new Error('unexpected Java before parent admission');
    }
    if (input.args.some(arg => arg.endsWith('run-substrate-federated-native-two-cycle-worker-v2.ts'))) {
      return mocks.worker(input);
    }
    const rootIndex = input.args.indexOf('-Root');
    const selectedRoot = rootIndex >= 0 ? input.args[rootIndex + 1] : undefined;
    if (!selectedRoot || !['V4 Maven or boot input membership inspection',
      'V4 post-build reparse and membership inspection'].includes(input.label)) {
      throw new Error('unexpected process outside fixed membership or worker boundary');
    }
    const membership = goldenMembership.get(resolve(selectedRoot).toLowerCase());
    if (!membership) throw new Error('unselected membership root');
    const stdoutBytes = Buffer.from(Buffer.from(membership).toString('base64'));
    return { pid: 123, exitCode: 0 as const, stdoutBytes, stderrBytes: Buffer.alloc(0),
      stdout: stdoutBytes.toString(), stderr: '' };
  });
  const mutate = (which: 'raw' | 'maven' | 'boot' | 'leveldb') => {
    const path = which === 'raw' ? join(sourcePath, 'tree/file0100')
      : which === 'maven' ? mavenFile : which === 'boot' ? bootFile : leveldbFile;
    const original = readFileSync(path);
    writeFileSync(path, Buffer.from(original.map(byte => byte ^ 1)));
    if (which === 'maven') {
      // Refresh only metadata authority so this negative is decided by actual
      // file content against the original frozen report, not merely mtime drift.
      mirrorMetadata = scanV4DirectDependencyTree(mirrorRoot, 16, 1024, 4096).metadataSha256Hex;
    }
  };
  return { config, configPath, loaded, mutate, homeParent };
}

function noEntry(f: ReturnType<typeof fixture>) {
  expect(existsSync(f.loaded.attemptPath)).toBe(false);
  expect(mocks.worker).not.toHaveBeenCalled();
  expect(mocks.javaCalls).toBe(0);
  for (const home of Object.values(f.config.ergoBuild.gitHomes)) expect(existsSync(home)).toBe(false);
}

describe('real V3 parent physical admission before attempt creation', () => {
  it.each([
    ['raw', /physical Git blob differs/],
    ['maven', /V6 Maven physical file differs/],
    ['boot', /boot JAR lacks a unique pinned mirror match/],
    ['leveldb', /LevelDB POM or JAR differs from receipt/],
  ] as const)('rejects changed %s bytes after first full preentry and before attempt', async (which, error) => {
    const f = fixture();
    mocks.wasm.mockImplementationOnce(async () => {
      expect(mocks.preflight).toHaveBeenCalledTimes(1);
      expect(mocks.maven).toHaveBeenCalledTimes(1);
      f.mutate(which);
      return { sourceSha256Hex: 'a'.repeat(64), packageSha256Hex: 'b'.repeat(64) };
    });
    await expect(runParent(['--config', f.configPath])).rejects.toThrow(error);
    expect(mocks.wasm).toHaveBeenCalledOnce();
    expect(mocks.preflight).toHaveBeenCalledTimes(2);
    expect(mocks.maven).toHaveBeenCalledTimes(which === 'raw' ? 1 : 2);
    noEntry(f);
  });

  it('rejects initially corrupted raw bytes before WASM or attempt creation', async () => {
    const f = fixture(); f.mutate('raw');
    await expect(runParent(['--config', f.configPath])).rejects.toThrow(/physical Git blob differs/);
    expect(mocks.wasm).not.toHaveBeenCalled(); expect(mocks.maven).not.toHaveBeenCalled(); noEntry(f);
  });

  it('reaches only the fixed worker boundary after two actual positive captures with distinct homes', async () => {
    const f = fixture(); await expect(runParent(['--config', f.configPath])).rejects.toBe(STOP);
    expect(mocks.preflight).toHaveBeenCalledTimes(2); expect(mocks.maven).toHaveBeenCalledTimes(2);
    const selectedHomes = mocks.preflight.mock.calls.map(call => call[0].gitHomePath);
    expect(selectedHomes).toEqual(['parent-before-wasm', 'parent-before-attempt']
      .map(stage => join(f.homeParent, '.v6-preentry-' + stage)));
    expect(new Set(selectedHomes).size).toBe(2);
    expect(mocks.worker).toHaveBeenCalledOnce(); expect(mocks.javaCalls).toBe(0);
    const launched = mocks.worker.mock.calls[0]![0] as BoundedProcessInput;
    const workerIndex = launched.args.findIndex(arg => arg.endsWith('run-substrate-federated-native-two-cycle-worker-v2.ts'));
    expect(launched.args[workerIndex + 1]).toBe('--invocation-v2');
    for (const home of Object.values(f.config.ergoBuild.gitHomes)) expect(existsSync(home)).toBe(false);
  });

  it.each(['parent-before-wasm', 'parent-before-attempt'] as const)(
    'rejects occupied %s scratch without reusing it or creating actor homes', async stage => {
      const f = fixture(); const occupied = join(f.homeParent, '.v6-preentry-' + stage);
      mkdirSync(occupied); const marker = join(occupied, 'retained'); writeFileSync(marker, 'keep');
      await expect(runParent(['--config', f.configPath])).rejects.toThrow();
      expect(readFileSync(marker, 'utf8')).toBe('keep');
      expect(mocks.preflight).toHaveBeenCalledTimes(stage === 'parent-before-wasm' ? 0 : 1);
      expect(mocks.wasm).toHaveBeenCalledTimes(stage === 'parent-before-wasm' ? 0 : 1);
      noEntry(f);
    });
});
