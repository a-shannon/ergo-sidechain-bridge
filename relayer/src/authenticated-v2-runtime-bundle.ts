import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  resolveAuthenticatedV2CompilerRuntimeProjectInputs,
  validateAuthenticatedV2CompilerRuntimeBundle,
  type AuthenticatedV2CompilerRuntimeBuildInputs,
} from './authenticated-v2-source-tree-conformance.js';

export const AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PROFILE =
  'e2s.authenticated-v2-runtime-bundle-build.v1';
export const AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA =
  'e2s.authenticated-v2-runtime-bundle-build-lock.v2';
export const AUTHENTICATED_V2_SBT_LAUNCHER_URL =
  'https://repo.maven.apache.org/maven2/org/scala-sbt/sbt-launch/1.11.1/sbt-launch-1.11.1.jar';
export const AUTHENTICATED_V2_SBT_LAUNCHER_SHA256 =
  'cae65d97be8b60537ef45d3b9316acbba57eb9d55ee3052af2b5260cbaca5d05';
export const AUTHENTICATED_V2_SBT_LAUNCHER_SIZE = 3_847_513;

const FORBIDDEN_CHILD_ENVIRONMENT = [
  'CLASSPATH',
  'COURSIER_CREDENTIALS',
  'JAVA_OPTS',
  'JAVA_TOOL_OPTIONS',
  'JDK_JAVA_OPTIONS',
  'SBT_CREDENTIALS',
  'SBT_OPTS',
  '_JAVA_OPTIONS',
] as const;

const CURRENT_PARENT_RUNTIME_PACKAGES = [
  'relayer/node_modules/tsx',
  'relayer/node_modules/esbuild',
  'relayer/node_modules/@esbuild/win32-x64',
] as const;

const FORBIDDEN_PARENT_ENVIRONMENT = [
  'NODE_COMPILE_CACHE',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'TSX_TSCONFIG_PATH',
] as const;

interface RuntimeBundleBuildParentPackageLock {
  path: string;
  sha256: string;
}

export interface AuthenticatedV2RuntimeBundleBuildParentLock {
  schema: typeof AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA;
  platform: 'win32-x64';
  nodeVersion: '24.18.1';
  nodeExecutableSha256: string;
  relayerPackageLockSha256: string;
  parentRuntimePackages: RuntimeBundleBuildParentPackageLock[];
  forbiddenParentEnvironmentOverrides: string[];
}

export interface AuthenticatedV2RuntimeBundleBuildPlan {
  javaExecutable: string;
  launcherPath: string;
  cwd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  isolatedDirectories: string[];
}

export interface PrepareAuthenticatedV2RuntimeBundleResult {
  profile: typeof AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PROFILE;
  runtimeBundleSha256: string;
  isolatedBuild: true;
}

interface PrepareAuthenticatedV2RuntimeBundleDependencies {
  resolveBuildInputs: (
    bridgeRoot: string,
  ) => AuthenticatedV2CompilerRuntimeBuildInputs;
  createScratchRoot: () => string;
  createDirectory: (directory: string) => void;
  fetchLauncher: () => Promise<Buffer>;
  validateLauncher: (bytes: Buffer) => void;
  writeLauncher: (path: string, bytes: Buffer) => void;
  readLauncher: (path: string) => Buffer;
  runSbt: (
    executable: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
    },
  ) => SpawnSyncReturns<Buffer>;
  validateRuntimeBundle: (
    bridgeRoot: string,
  ) => Pick<AuthenticatedV2CompilerRuntimeBuildInputs, 'runtimeBundlePath' | 'runtimeBundleSha256'>;
  removeScratchRoot: (directory: string) => void;
}

const DEFAULT_DEPENDENCIES: PrepareAuthenticatedV2RuntimeBundleDependencies = {
  resolveBuildInputs: bridgeRoot => {
    validateAuthenticatedV2RuntimeBundleBuildParent(bridgeRoot);
    return resolveAuthenticatedV2CompilerRuntimeProjectInputs(bridgeRoot);
  },
  createScratchRoot: () => mkdtempSync(path.join(tmpdir(), 'bridge-authenticated-v2-sbt-')),
  createDirectory: directory => mkdirSync(directory, { recursive: true }),
  fetchLauncher: fetchPinnedSbtLauncher,
  validateLauncher: validatePinnedSbtLauncherBytes,
  writeLauncher: (target, bytes) => writeFileSync(target, bytes, {
    flag: 'wx',
    mode: 0o600,
  }),
  readLauncher: target => readFileSync(target),
  runSbt: runSbtProcess,
  validateRuntimeBundle: validateAuthenticatedV2CompilerRuntimeBundle,
  removeScratchRoot: directory => rmSync(directory, { recursive: true, force: true }),
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} contains unsupported fields`);
  }
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex`);
  }
  return value;
}

export function validateAuthenticatedV2RuntimeBundleBuildParentLock(
  value: unknown,
): AuthenticatedV2RuntimeBundleBuildParentLock {
  const record = requireRecord(value, 'runtime-bundle build parent lock');
  assertExactKeys(record, [
    'schema',
    'platform',
    'nodeVersion',
    'nodeExecutableSha256',
    'relayerPackageLockSha256',
    'parentRuntimePackages',
    'forbiddenParentEnvironmentOverrides',
  ], 'runtime-bundle build parent lock');
  if (record.schema !== AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA) {
    throw new Error('runtime-bundle build parent lock schema is unsupported');
  }
  if (record.platform !== 'win32-x64') {
    throw new Error('runtime-bundle build parent lock platform is unsupported');
  }
  if (record.nodeVersion !== '24.18.1') {
    throw new Error('runtime-bundle build parent lock Node version is unsupported');
  }
  if (
    !Array.isArray(record.parentRuntimePackages)
    || record.parentRuntimePackages.length !== CURRENT_PARENT_RUNTIME_PACKAGES.length
  ) {
    throw new Error('runtime-bundle build parent package set is incomplete');
  }
  const parentRuntimePackages = record.parentRuntimePackages.map((entry, index) => {
    const packageRecord = requireRecord(entry, `runtime-bundle parent package ${index}`);
    assertExactKeys(
      packageRecord,
      ['path', 'sha256'],
      `runtime-bundle parent package ${index}`,
    );
    if (packageRecord.path !== CURRENT_PARENT_RUNTIME_PACKAGES[index]) {
      throw new Error('runtime-bundle build parent package path is unsupported');
    }
    return Object.freeze({
      path: CURRENT_PARENT_RUNTIME_PACKAGES[index],
      sha256: requireSha256(
        packageRecord.sha256,
        `runtime-bundle parent package ${index}`,
      ),
    });
  });
  if (
    !Array.isArray(record.forbiddenParentEnvironmentOverrides)
    || record.forbiddenParentEnvironmentOverrides.length !== FORBIDDEN_PARENT_ENVIRONMENT.length
    || record.forbiddenParentEnvironmentOverrides.some((entry, index) => (
      entry !== FORBIDDEN_PARENT_ENVIRONMENT[index]
    ))
  ) {
    throw new Error('runtime-bundle forbidden parent environment set is unsupported');
  }
  return Object.freeze({
    schema: AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA,
    platform: 'win32-x64',
    nodeVersion: '24.18.1',
    nodeExecutableSha256: requireSha256(
      record.nodeExecutableSha256,
      'runtime-bundle parent Node executable',
    ),
    relayerPackageLockSha256: requireSha256(
      record.relayerPackageLockSha256,
      'runtime-bundle parent package lock',
    ),
    parentRuntimePackages,
    forbiddenParentEnvironmentOverrides: [...FORBIDDEN_PARENT_ENVIRONMENT],
  });
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function hashAuthenticatedV2RuntimeBundlePackageLock(bytes: Buffer): string {
  const normalized = Buffer.allocUnsafe(bytes.length);
  let writeOffset = 0;
  for (let readOffset = 0; readOffset < bytes.length; readOffset += 1) {
    const value = bytes[readOffset]!;
    if (value === 0x0d) {
      if (bytes[readOffset + 1] !== 0x0a) {
        throw new Error('runtime-bundle parent package lock contains an unsupported carriage return');
      }
      continue;
    }
    normalized[writeOffset] = value;
    writeOffset += 1;
  }
  return createHash('sha256').update(normalized.subarray(0, writeOffset)).digest('hex');
}

function listRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const candidate = path.resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('runtime-bundle parent package must not contain symbolic links');
    }
    if (entry.isDirectory()) files.push(...listRegularFiles(root, candidate));
    else if (entry.isFile()) files.push(candidate);
    else throw new Error('runtime-bundle parent package contains an unsupported entry');
  }
  return files;
}

function hashDirectoryFiles(root: string): string {
  const records = listRegularFiles(root)
    .map(file => `${path.relative(root, file).replace(/\\/g, '/')}:${sha256File(file)}`)
    .sort();
  if (records.length === 0) throw new Error('runtime-bundle parent package is empty');
  return createHash('sha256').update(records.join('\n'), 'utf8').digest('hex');
}

export function validateAuthenticatedV2RuntimeBundleBuildParent(
  bridgeRootInput: string,
): AuthenticatedV2RuntimeBundleBuildParentLock {
  const bridgeRoot = realpathSync(bridgeRootInput);
  const relayerRoot = realpathSync(path.resolve(bridgeRoot, 'relayer'));
  const lockPath = realpathSync(path.resolve(
    bridgeRoot,
    'sources',
    'authenticated-v2-runtime-bundle-build-lock-v2.json',
  ));
  const lock = validateAuthenticatedV2RuntimeBundleBuildParentLock(
    JSON.parse(readFileSync(lockPath, 'utf8')) as unknown,
  );
  if (`${process.platform}-${process.arch}` !== lock.platform) {
    throw new Error('runtime-bundle parent platform does not match the lock');
  }
  const forbidden = lock.forbiddenParentEnvironmentOverrides.filter(key => (
    typeof process.env[key] === 'string' && process.env[key]!.length > 0
  ));
  if (forbidden.length > 0) {
    throw new Error('runtime-bundle parent contains a forbidden environment override');
  }
  if (process.version !== `v${lock.nodeVersion}`) {
    throw new Error('runtime-bundle parent Node version does not match the lock');
  }
  const nodeExecutable = realpathSync(process.execPath);
  if (!statSync(nodeExecutable).isFile() || sha256File(nodeExecutable) !== lock.nodeExecutableSha256) {
    throw new Error('runtime-bundle parent Node executable does not match the lock');
  }
  if (
    hashAuthenticatedV2RuntimeBundlePackageLock(
      readFileSync(path.resolve(relayerRoot, 'package-lock.json')),
    )
      !== lock.relayerPackageLockSha256
  ) {
    throw new Error('runtime-bundle parent package lock does not match the lock');
  }
  const nodeModulesRoot = realpathSync(path.resolve(relayerRoot, 'node_modules'));
  const verifiedPackages = new Map<string, string>();
  for (const entry of lock.parentRuntimePackages) {
    const packageRoot = realpathSync(path.resolve(bridgeRoot, entry.path));
    if (
      !isInsidePath(packageRoot, nodeModulesRoot)
      || !statSync(packageRoot).isDirectory()
      || hashDirectoryFiles(packageRoot) !== entry.sha256
    ) {
      throw new Error(`runtime-bundle parent package ${entry.path} does not match the lock`);
    }
    verifiedPackages.set(entry.path, packageRoot);
  }
  const tsxRoot = verifiedPackages.get('relayer/node_modules/tsx');
  if (!tsxRoot) throw new Error('runtime-bundle parent tsx package is unavailable');
  const expectedExecArgv = [
    '--require',
    path.resolve(tsxRoot, 'dist', 'preflight.cjs'),
    '--import',
    pathToFileURL(path.resolve(tsxRoot, 'dist', 'loader.mjs')).href,
  ];
  if (
    process.execArgv.length !== expectedExecArgv.length
    || process.execArgv.some((entry, index) => entry !== expectedExecArgv[index])
  ) {
    throw new Error('runtime-bundle parent tsx invocation does not match the lock');
  }
  return lock;
}

function runSbtProcess(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  },
): SpawnSyncReturns<Buffer> {
  return spawnSync(executable, args, {
    ...options,
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function fetchPinnedSbtLauncher(): Promise<Buffer> {
  const response = await fetch(AUTHENTICATED_V2_SBT_LAUNCHER_URL, {
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`pinned sbt launcher download failed with HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (
    !Number.isSafeInteger(contentLength)
    || contentLength !== AUTHENTICATED_V2_SBT_LAUNCHER_SIZE
  ) {
    throw new Error('pinned sbt launcher response length does not match the lock');
  }
  return Buffer.from(await response.arrayBuffer());
}

export function validatePinnedSbtLauncherBytes(
  bytes: Buffer,
  expectedSha256 = AUTHENTICATED_V2_SBT_LAUNCHER_SHA256,
  expectedSize = AUTHENTICATED_V2_SBT_LAUNCHER_SIZE,
): void {
  if (
    bytes.length !== expectedSize
    || createHash('sha256').update(bytes).digest('hex') !== expectedSha256
  ) {
    throw new Error('pinned sbt launcher does not match the reviewed bytes');
  }
}

export function buildAuthenticatedV2RuntimeBundlePlan(input: {
  toolRoot: string;
  javaHome: string;
  launcherPath: string;
  scratchRoot: string;
  parentEnvironment: NodeJS.ProcessEnv;
}): AuthenticatedV2RuntimeBundleBuildPlan {
  const toolRoot = path.resolve(input.toolRoot);
  const javaHome = path.resolve(input.javaHome);
  const launcherPath = path.resolve(input.launcherPath);
  const scratchRoot = path.resolve(input.scratchRoot);
  if (isInsidePath(scratchRoot, toolRoot)) {
    throw new Error('isolated sbt state must be outside the compiler project');
  }
  if (!isInsidePath(launcherPath, scratchRoot)) {
    throw new Error('pinned sbt launcher must remain inside isolated scratch state');
  }

  const systemRoot = input.parentEnvironment.SystemRoot
    ?? input.parentEnvironment.SYSTEMROOT;
  if (!systemRoot) throw new Error('SystemRoot is required for isolated sbt execution');

  const home = path.join(scratchRoot, 'home');
  const appData = path.join(scratchRoot, 'appdata');
  const localAppData = path.join(scratchRoot, 'localappdata');
  const temp = path.join(scratchRoot, 'temp');
  const coursierCache = path.join(scratchRoot, 'coursier');
  const sbtGlobal = path.join(scratchRoot, 'sbt-global');
  const sbtBoot = path.join(scratchRoot, 'sbt-boot');
  const sbtCache = path.join(scratchRoot, 'sbt-cache');
  const ivyHome = path.join(scratchRoot, 'ivy');
  const system32 = path.join(systemRoot, 'System32');
  const javaExecutable = path.join(javaHome, 'bin', 'java.exe');

  const env: NodeJS.ProcessEnv = {
    APPDATA: appData,
    CI: 'true',
    COURSIER_CACHE: coursierCache,
    HOME: home,
    JAVA_HOME: javaHome,
    JDK_HOME: javaHome,
    LOCALAPPDATA: localAppData,
    NO_COLOR: '1',
    OS: 'Windows_NT',
    PATH: [
      path.join(javaHome, 'bin'),
      system32,
      systemRoot,
    ].join(path.delimiter),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: systemRoot,
    TEMP: temp,
    TMP: temp,
    USERPROFILE: home,
    WINDIR: systemRoot,
  };
  for (const key of FORBIDDEN_CHILD_ENVIRONMENT) {
    if (env[key] !== undefined) {
      throw new Error('isolated sbt environment contains a forbidden override');
    }
  }

  return {
    javaExecutable,
    launcherPath,
    cwd: toolRoot,
    args: [
      '-Dfile.encoding=UTF-8',
      '-Dsbt.ci=true',
      '-Dsbt.io.virtual=false',
      '-Dsbt.log.noformat=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.supershell=false',
      `-Dsbt.global.base=${sbtGlobal}`,
      `-Dsbt.boot.directory=${sbtBoot}`,
      `-Dsbt.global.localcache=${sbtCache}`,
      `-Dsbt.ivy.home=${ivyHome}`,
      '-jar',
      launcherPath,
      'clean',
      'runtimeBundle',
    ],
    env,
    isolatedDirectories: [
      home,
      appData,
      localAppData,
      temp,
      coursierCache,
      sbtGlobal,
      sbtBoot,
      sbtCache,
      ivyHome,
    ],
  };
}

export async function prepareAuthenticatedV2RuntimeBundle(
  bridgeRootInput: string,
  dependencies: Partial<PrepareAuthenticatedV2RuntimeBundleDependencies> = {},
): Promise<PrepareAuthenticatedV2RuntimeBundleResult> {
  const resolvedDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...dependencies,
  };
  const bridgeRoot = path.resolve(bridgeRootInput);
  const buildInputs = resolvedDependencies.resolveBuildInputs(bridgeRoot);
  const scratchRoot = resolvedDependencies.createScratchRoot();

  try {
    const launcherPath = path.join(scratchRoot, 'sbt-launch-1.11.1.jar');
    const plan = buildAuthenticatedV2RuntimeBundlePlan({
      toolRoot: buildInputs.toolRoot,
      javaHome: buildInputs.javaHome,
      launcherPath,
      scratchRoot,
      parentEnvironment: process.env,
    });
    for (const directory of plan.isolatedDirectories) {
      resolvedDependencies.createDirectory(directory);
    }
    const launcherBytes = await resolvedDependencies.fetchLauncher();
    resolvedDependencies.validateLauncher(launcherBytes);
    resolvedDependencies.writeLauncher(plan.launcherPath, launcherBytes);

    const run = resolvedDependencies.runSbt(plan.javaExecutable, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) {
      throw new Error(`isolated runtime bundle build failed with exit code ${run.status ?? 'unknown'}`);
    }

    resolvedDependencies.validateLauncher(
      resolvedDependencies.readLauncher(plan.launcherPath),
    );
    const validated = resolvedDependencies.validateRuntimeBundle(bridgeRoot);
    if (validated.runtimeBundleSha256 !== buildInputs.runtimeBundleSha256) {
      throw new Error('validated runtime bundle identity changed during construction');
    }
    return {
      profile: AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PROFILE,
      runtimeBundleSha256: validated.runtimeBundleSha256,
      isolatedBuild: true,
    };
  } finally {
    resolvedDependencies.removeScratchRoot(scratchRoot);
  }
}

function isInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
