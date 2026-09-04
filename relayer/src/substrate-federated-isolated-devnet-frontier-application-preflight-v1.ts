import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBridgeRepositoryLayout } from './bridge-repository-layout.js';

const WINDOWS_CLASSIC_SOURCE_PATH_MAX_CHARS = 259;
const WINDOWS_LOCKED_NATIVE_SOURCE_PATH_SUFFIX = path.join(
  'e2s-pinned-local-native-XXXXXX',
  'cargo-home',
  'registry',
  'src',
  'index.crates.io-6f17d22bba15001f',
  'librocksdb-sys-0.11.0+8.1.1',
  'rocksdb',
  'utilities',
  'transactions',
  'lock',
  'range',
  'range_tree',
  'lib',
  'portability',
  'toku_external_pthread.h',
);

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationPreflightV1Input {
  readonly frontierSourceDirectory: string;
  readonly temporaryDirectoryRoot: string;
  readonly cargoDependencyCacheDirectory: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly offline: true;
}

export function preflightSubstrateFederatedIsolatedDevnetFrontierApplicationV1(
  input:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationPreflightV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationPreflightV1Input> {
  const runner = exactRecord(input, [
    'cargoDependencyCacheDirectory',
    'cargoExecutablePath',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'rustcExecutablePath',
    'temporaryDirectoryRoot',
  ], 'Frontier application preflight input');
  if (runner.offline !== true) {
    throw new Error('Frontier application preflight requires offline Cargo');
  }
  const bridgeRoot = resolveBridgeRoot();
  const repositoryRoot = resolveRepositoryRoot(bridgeRoot);
  const temporaryDirectoryRoot = requireDirectory(
    runner.temporaryDirectoryRoot,
    'runner temporary directory root',
  );
  assertWhitespaceFreeRustRemapPath(
    temporaryDirectoryRoot,
    'runner temporary directory root',
  );
  if (isSameOrDescendant(temporaryDirectoryRoot, repositoryRoot)) {
    throw new Error(
      'Frontier application preflight requires an external temporary root',
    );
  }
  const frontierSourceDirectory = requireDirectory(
    runner.frontierSourceDirectory,
    'task-owned Frontier scratch source',
  );
  assertWhitespaceFreeRustRemapPath(
    frontierSourceDirectory,
    'task-owned Frontier scratch source',
  );
  if (isSameOrDescendant(frontierSourceDirectory, repositoryRoot)) {
    throw new Error(
      'Frontier application preflight refuses to mutate the bridge worktree',
    );
  }
  if (!isStrictDescendant(frontierSourceDirectory, temporaryDirectoryRoot)) {
    throw new Error(
      'Frontier application preflight source must be inside its external temporary root',
    );
  }
  const cargoDependencyCacheDirectory = requireDirectory(
    runner.cargoDependencyCacheDirectory,
    'runner Cargo dependency cache',
  );
  if (isSameOrDescendant(cargoDependencyCacheDirectory, repositoryRoot)) {
    throw new Error(
      'Frontier application preflight requires an external Cargo dependency cache',
    );
  }
  assertFrontierNativeBuildHostPreflight(
    temporaryDirectoryRoot,
    cargoDependencyCacheDirectory,
  );
  return Object.freeze({
    frontierSourceDirectory,
    cargoDependencyCacheDirectory,
    temporaryDirectoryRoot,
    cargoExecutablePath: requireRegularFile(
      runner.cargoExecutablePath,
      'Cargo executable',
    ),
    rustcExecutablePath: requireRegularFile(
      runner.rustcExecutablePath,
      'Rust compiler executable',
    ),
    gitExecutablePath: requireRegularFile(
      runner.gitExecutablePath,
      'Git executable',
    ),
    offline: true,
  });
}

function assertFrontierNativeBuildHostPreflight(
  temporaryDirectoryRoot: string,
  cargoDependencyCacheDirectory: string,
): void {
  for (const directory of ['registry', 'git']) {
    const cachePath = path.join(cargoDependencyCacheDirectory, directory);
    if (!existsSync(cachePath)) {
      throw new Error(
        `Frontier offline Cargo dependency cache is missing ${directory}`,
      );
    }
    const cacheStat = lstatSync(cachePath);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) {
      throw new Error(
        `Frontier offline Cargo dependency cache ${directory} must be a regular directory`,
      );
    }
  }
  if (process.platform !== 'win32') return;

  const projectedNativeSourcePath = path.resolve(
    temporaryDirectoryRoot,
    WINDOWS_LOCKED_NATIVE_SOURCE_PATH_SUFFIX,
  );
  if (projectedNativeSourcePath.length > WINDOWS_CLASSIC_SOURCE_PATH_MAX_CHARS) {
    throw new Error(
      'Frontier native build temporary root exceeds the locked MSVC source-path budget',
    );
  }
  for (const key of ['LIB', 'LIBPATH', 'INCLUDE']) {
    if (!process.env[key]?.trim()) {
      throw new Error(
        `Frontier native build requires the Visual Studio ${key} environment`,
      );
    }
  }
}

function assertWhitespaceFreeRustRemapPath(
  value: string,
  label: string,
): void {
  if (/\s/u.test(value)) {
    throw new Error(
      `${label} must be whitespace-free for deterministic WASM Rust flags`,
    );
  }
}

function requireDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const status = lstatSync(resolved);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} must be canonical and non-symlinked`);
  }
  return canonical;
}

function requireRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const status = lstatSync(resolved);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} must be canonical and non-symlinked`);
  }
  return canonical;
}

function resolveBridgeRoot(): string {
  return realpathSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  ));
}

function resolveRepositoryRoot(bridgeRoot: string): string {
  const repositoryRoot = existsSync(path.join(bridgeRoot, '.git'))
    ? bridgeRoot
    : path.dirname(bridgeRoot);
  if (!existsSync(path.join(repositoryRoot, '.git'))) {
    throw new Error('bridge Git repository root is unavailable');
  }
  resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  return realpathSync(repositoryRoot);
}

function isSameOrDescendant(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (
      !relative.startsWith(`..${path.sep}`)
      && relative !== '..'
      && !path.isAbsolute(relative)
    );
}

function isStrictDescendant(candidate: string, root: string): boolean {
  return pathIdentity(candidate) !== pathIdentity(root)
    && isSameOrDescendant(candidate, root);
}

function pathIdentity(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const fields = [...expected].sort();
  if (
    actual.length !== fields.length
    || actual.some((field, index) => field !== fields[index])
    || Object.values(descriptors).some(
      descriptor => !descriptor.enumerable || !('value' in descriptor),
    )
  ) {
    throw new Error(`${label} must contain exactly: ${fields.join(', ')}`);
  }
  return value as Record<string, unknown>;
}
