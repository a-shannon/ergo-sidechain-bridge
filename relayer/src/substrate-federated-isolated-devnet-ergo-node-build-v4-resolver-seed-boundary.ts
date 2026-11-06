import { createHash } from 'node:crypto';
import { win32 } from 'node:path';

import type { V4PostBuildPhysicalCapture } from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import type { V4DependencyTree } from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import type { V4ResolverMaterialization } from './substrate-federated-isolated-devnet-ergo-node-build-v4-materialize.js';

const STATE_ROOT = 'target/bridge-sbt-state-v4';
const BOOT_ROOT = STATE_ROOT + '/sbt-boot';
const REPOSITORIES = STATE_ROOT + '/repositories';
const EMPTY_STATE_DIRECTORY_KEYS = [
  'emptyRepositoryRoot', 'appDataRoot', 'localAppDataRoot', 'homeRoot',
  'tempRoot', 'coursierCacheRoot', 'coursierConfigRoot', 'sbtGlobalRoot',
  'sbtLocalCacheRoot', 'ivyRoot', 'powershellCacheRoot',
] as const;

export interface V4ResolverSeedEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256Hex: string;
  readonly identity: string;
}

export interface V4ResolverSeedBoundary {
  readonly repositories: Readonly<V4ResolverSeedEntry>;
  readonly boot: readonly Readonly<V4ResolverSeedEntry>[];
}

export interface V4ResolverSeedBoundaryInput {
  readonly sourceRoot: string;
  readonly capture: Readonly<V4PostBuildPhysicalCapture>;
  readonly materialization: Readonly<V4ResolverMaterialization>;
  readonly capturedBoot: Readonly<V4DependencyTree>;
  // Before the Job the seeded boot directory has exact membership. SBT may
  // create additional output beneath it, but may not modify a seeded JAR.
  readonly phase: 'before-job' | 'after-job';
}

function fail(reason: string): never {
  throw new Error('V4 resolver seed boundary: ' + reason);
}

function relativePath(sourceRoot: string, path: string): string {
  if (typeof sourceRoot !== 'string' || typeof path !== 'string'
      || !win32.isAbsolute(sourceRoot) || !win32.isAbsolute(path)) {
    fail('source or state path is not absolute');
  }
  const relative = win32.relative(win32.resolve(sourceRoot), win32.resolve(path));
  if (!relative || relative.startsWith('..') || win32.isAbsolute(relative)) {
    fail('state path escapes source');
  }
  return relative.replace(/\\/gu, '/');
}

function exactFile(
  entries: ReadonlyMap<string, V4PostBuildPhysicalCapture['entries'][number]>,
  path: string, bytes: number, sha256Hex: string,
): Readonly<V4ResolverSeedEntry> {
  const entry = entries.get(path);
  if (!entry || entry.kind !== 'file' || entry.reparsePoint
      || entry.nlink !== 1 || entry.bytes !== bytes
      || entry.sha256Hex !== sha256Hex
      || typeof entry.identity !== 'string' || !entry.identity) {
    fail('seeded file differs: ' + path);
  }
  return Object.freeze({ path, bytes, sha256Hex, identity: entry.identity });
}

function bootFrame(files: Readonly<V4DependencyTree>['files']): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(Buffer.from(file.path, 'utf8')).update(Buffer.from([0]))
      .update(String(file.size)).update(Buffer.from([0]))
      .update(file.sha256Hex).update('\n');
  }
  return hash.digest('hex');
}

// Consumes a complete direct physical capture; this function does not read the
// filesystem or establish that Java ran. The owner compares both sides of its Job.
export function selectV4ResolverSeedBoundary(
  input: Readonly<V4ResolverSeedBoundaryInput>,
): Readonly<V4ResolverSeedBoundary> {
  const plan = input.materialization?.plan;
  if (!plan || relativePath(input.sourceRoot, plan.paths.stateRoot) !== STATE_ROOT
      || relativePath(input.sourceRoot, plan.paths.repositoriesFile) !== REPOSITORIES
      || relativePath(input.sourceRoot, plan.paths.sbtBootRoot) !== BOOT_ROOT
      || !Array.isArray(input.capture?.entries)
      || !Array.isArray(input.capturedBoot?.files)
      || !Array.isArray(input.capturedBoot.directories)
      || !['before-job', 'after-job'].includes(input.phase)) {
    fail('state plan or complete physical capture differs');
  }
  const entries = new Map(input.capture.entries.map(entry => [entry.path, entry] as const));
  if (entries.size !== input.capture.entries.length
      || entries.get(STATE_ROOT)?.kind !== 'directory'
      || entries.get(BOOT_ROOT)?.kind !== 'directory') {
    fail('state or boot directory is absent or duplicated');
  }
  const repositoriesBytes = Buffer.from(plan.repositoriesText, 'utf8');
  const repositoriesSha256Hex = createHash('sha256').update(repositoriesBytes).digest('hex');
  if (!repositoriesBytes.length || repositoriesBytes.length > 16_384
      || repositoriesSha256Hex !== input.materialization.repositoriesSha256Hex) {
    fail('materialized repositories text or digest differs');
  }
  const repositories = exactFile(entries, REPOSITORIES,
    repositoriesBytes.length, repositoriesSha256Hex);
  const seed = input.materialization.bootSeed;
  const boot = input.capturedBoot.files.map(file =>
    exactFile(entries, BOOT_ROOT + '/' + file.path, file.size, file.sha256Hex));
  if (seed.destinationRoot.toLowerCase() !== plan.paths.sbtBootRoot.toLowerCase()
      || seed.fileCount !== boot.length
      || seed.bytes !== boot.reduce((sum, file) => sum + file.bytes, 0)
      || seed.frameSha256Hex !== bootFrame(input.capturedBoot.files)) {
    fail('boot seed result differs from captured input');
  }
  if (input.phase === 'before-job') {
    const emptyDirectories = EMPTY_STATE_DIRECTORY_KEYS.map(key =>
      relativePath(input.sourceRoot, plan.paths[key]));
    if (new Set(emptyDirectories).size !== EMPTY_STATE_DIRECTORY_KEYS.length
        || emptyDirectories.some(path => {
          const entry = entries.get(path);
          return !path.startsWith(STATE_ROOT + '/')
            || path.slice(STATE_ROOT.length + 1).includes('/')
            || entry?.kind !== 'directory' || entry.reparsePoint
            || typeof entry.identity !== 'string' || !entry.identity;
        })
        || relativePath(input.sourceRoot, plan.paths.scalaCliConfigFile)
          !== STATE_ROOT + '/scala-cli-config.json') {
      fail('pre-Job isolated state directory plan differs');
    }
    const expected = new Set([
      STATE_ROOT, REPOSITORIES, BOOT_ROOT, ...emptyDirectories,
      ...input.capturedBoot.directories.map(path => BOOT_ROOT + '/' + path),
      ...boot.map(file => file.path),
    ]);
    const observed = [...entries.keys()].filter(path =>
      path === STATE_ROOT || path.startsWith(STATE_ROOT + '/'));
    if (observed.length !== expected.size || observed.some(path => !expected.has(path))) {
      fail('pre-Job isolated state membership differs');
    }
  }
  return Object.freeze({ repositories, boot: Object.freeze(boot) });
}

export function assertSameV4ResolverSeedBoundary(
  before: Readonly<V4ResolverSeedBoundary>, after: Readonly<V4ResolverSeedBoundary>,
): void {
  const same = (a: Readonly<V4ResolverSeedEntry>, b: Readonly<V4ResolverSeedEntry>): boolean =>
    a.path === b.path && a.bytes === b.bytes && a.sha256Hex === b.sha256Hex
      && a.identity === b.identity;
  if (!before || !after || !same(before.repositories, after.repositories)
      || before.boot.length !== after.boot.length
      || before.boot.some((file, index) => !same(file, after.boot[index]!))) {
    fail('repositories or seeded boot JAR changed across the Job');
  }
}
