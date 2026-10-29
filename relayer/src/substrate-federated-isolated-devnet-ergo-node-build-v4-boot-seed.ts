import { createHash } from 'node:crypto';
import {
  constants, copyFileSync, lstatSync, mkdirSync, type BigIntStats,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import {
  rootsOverlap, scanV4DirectDependencyTree, type V4DependencyFile,
  type V4DependencyTree,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

const MAX_BOOT_ENTRIES = 92;
const MAX_BOOT_MEMBERSHIP_BYTES = 65_536;

export interface V4BootSeedInput {
  readonly sourceRoot: string;
  readonly bootRoot: string;
  readonly destinationRoot: string;
  readonly capturedBoot: Readonly<V4DependencyTree>;
  readonly lock: Readonly<Pick<V4NodeBuildLock,
    'isolatedSbtStateDirectory' | 'ownedBootJarCount'
    | 'ownedBootJarBytes' | 'ownedBootDirectoryCount'
    | 'ownedBootJarFrameSha256'>>;
}

export interface V4BootSeedResult {
  readonly destinationRoot: string;
  readonly fileCount: number;
  readonly bytes: number;
  readonly frameSha256Hex: string;
}

function fail(reason: string): never {
  throw new Error('V4 isolated SBT boot seed: ' + reason);
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
    && a.birthtimeNs === b.birthtimeNs;
}

function frame(files: readonly Readonly<V4DependencyFile>[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(Buffer.from(file.path, 'utf8')).update(Buffer.from([0]))
      .update(String(file.size)).update(Buffer.from([0]))
      .update(file.sha256Hex).update('\n');
  }
  return hash.digest('hex');
}

function sameFiles(
  a: Readonly<V4DependencyTree>, b: Readonly<V4DependencyTree>,
): boolean {
  return a.bytes === b.bytes && a.membership === b.membership
    && a.directorySha256Hex === b.directorySha256Hex
    && a.fileMembershipSha256Hex === b.fileMembershipSha256Hex
    && a.directories.length === b.directories.length
    && a.files.length === b.files.length
    && a.directories.every((path, index) => path === b.directories[index])
    && a.files.every((file, index) => file.path === b.files[index]?.path
      && file.size === b.files[index]?.size
      && file.sha256Hex === b.files[index]?.sha256Hex);
}

function sameSource(
  captured: Readonly<V4DependencyTree>, current: Readonly<V4DependencyTree>,
): boolean {
  if (!sameFiles(captured, current)
      || captured.rootIdentity !== current.rootIdentity
      || captured.metadataSha256Hex !== current.metadataSha256Hex
      || captured.identities.size !== current.identities.size) return false;
  for (const [path, identity] of captured.identities) {
    if (current.identities.get(path) !== identity) return false;
  }
  return true;
}

function assertDirectExistingDirectory(path: string): void {
  let cursor = path;
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('ancestor is linked or not a directory');
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function assertAbsent(path: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('destination already exists');
}

function assertInput(input: Readonly<V4BootSeedInput>): void {
  const { sourceRoot, bootRoot, destinationRoot, lock } = input;
  if (![sourceRoot, bootRoot, destinationRoot].every(path =>
    typeof path === 'string' && isAbsolute(path) && resolve(path) === path)
      || rootsOverlap(sourceRoot, bootRoot)
      || rootsOverlap(bootRoot, destinationRoot)
      || lock.isolatedSbtStateDirectory !== 'target/bridge-sbt-state-v4'
      || destinationRoot.toLowerCase()
        !== resolve(sourceRoot, lock.isolatedSbtStateDirectory, 'sbt-boot').toLowerCase()
      || !destinationRoot.toLowerCase().startsWith(sourceRoot.toLowerCase() + sep)
      || !Number.isSafeInteger(lock.ownedBootJarCount)
      || lock.ownedBootJarCount <= 0 || lock.ownedBootJarCount > MAX_BOOT_ENTRIES
      || !Number.isSafeInteger(lock.ownedBootJarBytes)
      || lock.ownedBootJarBytes <= 0 || lock.ownedBootJarBytes > 268_435_456
      || !Number.isSafeInteger(lock.ownedBootDirectoryCount)
      || lock.ownedBootDirectoryCount < 0
      || lock.ownedBootDirectoryCount + lock.ownedBootJarCount > MAX_BOOT_ENTRIES
      || !/^[0-9a-f]{64}$/u.test(lock.ownedBootJarFrameSha256)) {
    fail('paths or pinned boot lock differ');
  }
  assertDirectExistingDirectory(dirname(destinationRoot));
  assertAbsent(destinationRoot);
}

// This is a create-only copy after the pristine source capture. A failed copy is
// an attempt-local hold: the caller must preserve its partial state and never retry.
// This function does not run SBT or establish a resolver or assembly result.
export function seedV4IsolatedSbtBoot(
  input: Readonly<V4BootSeedInput>,
): Readonly<V4BootSeedResult> {
  assertInput(input);
  const before = scanV4DirectDependencyTree(
    input.bootRoot, MAX_BOOT_ENTRIES,
    input.lock.ownedBootJarBytes, MAX_BOOT_MEMBERSHIP_BYTES,
  );
  if (!sameSource(input.capturedBoot, before)
      || before.files.length !== input.lock.ownedBootJarCount
      || before.directories.length !== input.lock.ownedBootDirectoryCount
      || before.bytes !== input.lock.ownedBootJarBytes
      || before.files.some(file => !file.path.endsWith('.jar'))
      || frame(before.files) !== input.lock.ownedBootJarFrameSha256) {
    fail('captured boot source or pinned JAR frame differs');
  }
  mkdirSync(input.destinationRoot);
  assertDirectExistingDirectory(input.destinationRoot);
  for (const directory of before.directories) {
    const path = resolve(input.destinationRoot, ...directory.split('/'));
    assertDirectExistingDirectory(dirname(path));
    assertAbsent(path);
    mkdirSync(path);
    assertDirectExistingDirectory(path);
  }
  for (const file of before.files) {
    const source = resolve(input.bootRoot, ...file.path.split('/'));
    const target = resolve(input.destinationRoot, ...file.path.split('/'));
    assertDirectExistingDirectory(dirname(target));
    assertAbsent(target);
    const sourceBefore = lstatSync(source, { bigint: true });
    if (!sourceBefore.isFile() || sourceBefore.isSymbolicLink()
        || sourceBefore.nlink !== 1n || sourceBefore.size !== BigInt(file.size)) {
      fail('boot source file changed before copy');
    }
    copyFileSync(source, target, constants.COPYFILE_EXCL);
    const sourceAfter = lstatSync(source, { bigint: true });
    const targetAfter = lstatSync(target, { bigint: true });
    if (!same(sourceBefore, sourceAfter) || !targetAfter.isFile()
        || targetAfter.isSymbolicLink() || targetAfter.nlink !== 1n
        || targetAfter.size !== BigInt(file.size)) {
      fail('boot source or copy identity changed');
    }
  }
  const destination = scanV4DirectDependencyTree(
    input.destinationRoot, MAX_BOOT_ENTRIES,
    input.lock.ownedBootJarBytes, MAX_BOOT_MEMBERSHIP_BYTES,
  );
  if (!sameFiles(before, destination)
      || frame(destination.files) !== input.lock.ownedBootJarFrameSha256) {
    fail('isolated boot bytes or membership differ');
  }
  const sourceAfter = scanV4DirectDependencyTree(
    input.bootRoot, MAX_BOOT_ENTRIES,
    input.lock.ownedBootJarBytes, MAX_BOOT_MEMBERSHIP_BYTES,
  );
  if (!sameSource(before, sourceAfter)) fail('original boot evidence changed');
  return Object.freeze({
    destinationRoot: input.destinationRoot,
    fileCount: destination.files.length,
    bytes: destination.bytes,
    frameSha256Hex: frame(destination.files),
  });
}
