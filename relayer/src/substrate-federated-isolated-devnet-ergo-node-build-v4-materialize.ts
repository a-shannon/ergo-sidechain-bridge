import { createHash } from 'node:crypto';
import {
  closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, writeSync, type BigIntStats,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  seedV4IsolatedSbtBoot, type V4BootSeedResult,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-boot-seed.js';
import type { V4DependencyTree } from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import type { V6OrLegacyBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js';
import {
  planV4ResolverRuntime, type V4ResolverRuntimeInput,
  type V4ResolverRuntimePlan,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-resolver-runtime.js';

export interface V4ResolverMaterializeInput extends V4ResolverRuntimeInput {
  readonly lock: Readonly<V6OrLegacyBuildLock>;
  readonly capturedBoot: Readonly<V4DependencyTree>;
}

export interface V4ResolverMaterialization {
  readonly plan: Readonly<V4ResolverRuntimePlan>;
  readonly bootSeed: Readonly<V4BootSeedResult>;
  readonly repositoriesSha256Hex: string;
}

function fail(reason: string): never {
  throw new Error('V4 resolver state materialization: ' + reason);
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function directDirectory(path: string): void {
  let cursor = path;
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('linked or non-directory ancestor');
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function absent(path: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('destination already exists');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeNewRepositories(path: string, bytes: Buffer): Readonly<{
  sha256Hex: string;
  identity: BigIntStats;
}> {
  absent(path);
  const handle = openSync(path, 'wx');
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(handle, bytes, offset, bytes.length - offset);
      if (written <= 0) fail('repositories write did not advance');
      offset += written;
    }
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size !== BigInt(bytes.length)) fail('repositories file identity differs');
  const observed = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || !observed.equals(bytes)) {
    fail('repositories file changed after create-only write');
  }
  return Object.freeze({ sha256Hex: sha256(observed), identity: after });
}

// Creates only this attempt's isolated SBT state after a pristine B0 capture.
// A partial failure consumes the attempt; callers must preserve it and never retry.
// This does not run Java or establish effective resolvers, assembly or admission.
export function materializeV4ResolverState(
  input: Readonly<V4ResolverMaterializeInput>,
): Readonly<V4ResolverMaterialization> {
  const plan = planV4ResolverRuntime(input);
  const sourceRoot = resolve(input.sourceRoot);
  const targetRoot = resolve(sourceRoot, 'target');
  if (plan.paths.stateRoot.toLowerCase()
        !== resolve(targetRoot, 'bridge-sbt-state-v4').toLowerCase()
      || plan.paths.sbtBootRoot.toLowerCase()
        !== resolve(plan.paths.stateRoot, 'sbt-boot').toLowerCase()) {
    fail('isolated state path differs');
  }
  directDirectory(sourceRoot);
  absent(targetRoot);
  const repositoryBytes = Buffer.from(plan.repositoriesText, 'utf8');
  if (repositoryBytes.length === 0 || repositoryBytes.length > 16_384
      || !plan.repositoriesText.endsWith('\n')
      || plan.repositoriesText.includes('\r')
      || /https?:\/\//iu.test(plan.repositoriesText)) {
    fail('repositories text differs');
  }
  const emptyDirectories = [
    plan.paths.emptyRepositoryRoot, plan.paths.appDataRoot,
    plan.paths.localAppDataRoot, plan.paths.homeRoot, plan.paths.tempRoot,
    plan.paths.coursierCacheRoot, plan.paths.coursierConfigRoot,
    plan.paths.sbtGlobalRoot, plan.paths.sbtLocalCacheRoot,
    plan.paths.ivyRoot, plan.paths.powershellCacheRoot,
  ];
  if (new Set(emptyDirectories.map(path => path.toLowerCase())).size !== 11
      || emptyDirectories.some(path => dirname(path) !== plan.paths.stateRoot
        || resolve(path) !== path)) {
    fail('isolated state directory plan differs');
  }
  absent(plan.paths.scalaCliConfigFile);

  mkdirSync(targetRoot);
  directDirectory(targetRoot);
  mkdirSync(plan.paths.stateRoot);
  directDirectory(plan.paths.stateRoot);
  for (const path of emptyDirectories) {
    absent(path);
    mkdirSync(path);
    directDirectory(path);
  }
  const repositories = writeNewRepositories(
    plan.paths.repositoriesFile, repositoryBytes,
  );
  const bootSeed = seedV4IsolatedSbtBoot({
    sourceRoot, bootRoot: resolve(input.bootSourceRoot),
    destinationRoot: plan.paths.sbtBootRoot,
    capturedBoot: input.capturedBoot, lock: input.lock,
  });
  const expectedNames = [
    ...emptyDirectories.map(path => path.slice(plan.paths.stateRoot.length + 1)),
    'repositories', 'sbt-boot',
  ].sort();
  directDirectory(plan.paths.sbtBootRoot);
  for (const path of emptyDirectories) directDirectory(path);
  if (readdirSync(targetRoot).join('\0') !== 'bridge-sbt-state-v4'
      || readdirSync(plan.paths.stateRoot).sort().join('\0')
        !== expectedNames.join('\0')
      || emptyDirectories.some(path => readdirSync(path).length !== 0)) {
    fail('isolated state membership differs');
  }
  const repositoriesBeforeFinalRead = lstatSync(plan.paths.repositoriesFile, { bigint: true });
  if (!same(repositories.identity, repositoriesBeforeFinalRead)
      || !repositoriesBeforeFinalRead.isFile()
      || repositoriesBeforeFinalRead.isSymbolicLink()
      || repositoriesBeforeFinalRead.nlink !== 1n) {
    fail('repositories identity changed during boot seed');
  }
  const finalRepositories = readFileSync(plan.paths.repositoriesFile);
  const repositoriesAfterFinalRead = lstatSync(plan.paths.repositoriesFile, { bigint: true });
  if (!same(repositories.identity, repositoriesAfterFinalRead)
      || !finalRepositories.equals(repositoryBytes)
      || sha256(finalRepositories) !== repositories.sha256Hex) {
    fail('repositories bytes changed during boot seed');
  }
  absent(plan.paths.scalaCliConfigFile);
  directDirectory(plan.paths.stateRoot);
  return Object.freeze({ plan, bootSeed, repositoriesSha256Hex: repositories.sha256Hex });
}
