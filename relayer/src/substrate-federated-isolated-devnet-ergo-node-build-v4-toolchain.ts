import { createHash } from 'node:crypto';
import {
  closeSync, fstatSync, lstatSync, openSync, readdirSync, readSync,
  type BigIntStats,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

const MAX_JAVA_FILES = 10_000;
const MAX_JAVA_DIRECTORIES = 4_096;
const MAX_JAVA_DEPTH = 64;
const MAX_JAVA_FILE_BYTES = 536_870_912;
const MAX_JAVA_TOTAL_BYTES = 2_147_483_648;
const MAX_SBT_JAR_BYTES = 16_777_216;
const MAX_IDENTITY_FRAME_BYTES = 16_777_216;

export interface V4PinnedToolchainInput {
  readonly javaExecutablePath: string;
  readonly sbtLauncherJarPath: string;
  readonly lock: Readonly<Pick<V4NodeBuildLock,
    'javaHomeSha256' | 'sbtLauncherJarSha256'>>;
}

export interface V4PinnedToolchainCapture {
  readonly javaHomeRoot: string;
  readonly javaExecutablePath: string;
  readonly sbtLauncherJarPath: string;
  readonly javaHomeSha256Hex: string;
  readonly javaExecutableSha256Hex: string;
  readonly sbtLauncherJarSha256Hex: string;
  readonly javaFileCount: number;
  readonly javaDirectoryCount: number;
  readonly javaBytes: number;
  readonly identityFrameSha256Hex: string;
}

function fail(reason: string): never {
  throw new Error('V4 pinned Java toolchain: ' + reason);
}

function sha256(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function directoryIdentity(stat: BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.nlink}`;
}

function fileIdentity(stat: BigIntStats): string {
  return `${directoryIdentity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

function directDirectory(path: string): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('linked or non-directory path');
  return stat;
}

function ancestorIdentities(path: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  let cursor = path;
  for (;;) {
    result.set(cursor, directoryIdentity(directDirectory(cursor)));
    const parent = dirname(cursor);
    if (parent === cursor) return result;
    cursor = parent;
  }
}

function assertAncestorsSame(before: ReadonlyMap<string, string>): void {
  for (const [path, identity] of before) {
    if (directoryIdentity(directDirectory(path)) !== identity) {
      fail('tool ancestor changed during capture');
    }
  }
}

function safeName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..'
    && !/[\\/:<>|"?*\u0000-\u001f\u007f]/u.test(name)
    && !/[. ]$/u.test(name)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name);
}

function stableFile(path: string, maxBytes: number): Readonly<{
  size: number; sha256Hex: string; identity: string;
}> {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(maxBytes)) {
    fail('tool file is indirect, empty or exceeds its byte cap');
  }
  const expectedSize = Number(before.size);
  const hash = createHash('sha256');
  const chunk = Buffer.allocUnsafe(1_048_576);
  const handle = openSync(path, 'r');
  let size = 0;
  try {
    if (!sameFile(before, fstatSync(handle, { bigint: true }))) {
      fail('tool file changed before read');
    }
    while (size < expectedSize) {
      const count = readSync(handle, chunk, 0, Math.min(chunk.length, expectedSize - size), null);
      if (count <= 0) fail('tool file ended before its pinned size');
      hash.update(chunk.subarray(0, count));
      size += count;
    }
    if (readSync(handle, chunk, 0, 1, null) !== 0
        || !sameFile(before, fstatSync(handle, { bigint: true }))) {
      fail('tool file changed during read');
    }
  } finally {
    closeSync(handle);
  }
  if (size !== expectedSize || !sameFile(before, lstatSync(path, { bigint: true }))) {
    fail('tool file changed after read');
  }
  return Object.freeze({ size, sha256Hex: hash.digest('hex'), identity: fileIdentity(before) });
}

function canonicalPath(path: string, label: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)
      || /[\u0000-\u001f\u007f]/u.test(path)) fail(label + ' is not absolute');
  return resolve(path);
}

// V3's locked Java-home framing is sorted POSIX-relative `path:sha256` rows,
// joined with LF and no terminal LF. This pass additionally pins direct entry
// identities and bounds the complete scan. It does not execute any tool.
export function captureV4PinnedToolchain(
  input: Readonly<V4PinnedToolchainInput>,
): Readonly<V4PinnedToolchainCapture> {
  if (process.platform !== 'win32' || !input?.lock
      || !/^[0-9a-f]{64}$/u.test(input.lock.javaHomeSha256)
      || !/^[0-9a-f]{64}$/u.test(input.lock.sbtLauncherJarSha256)) {
    fail('Windows platform or exact tool lock differs');
  }
  const javaExecutablePath = canonicalPath(input.javaExecutablePath, 'Java executable');
  const sbtLauncherJarPath = canonicalPath(input.sbtLauncherJarPath, 'SBT launcher');
  const javaBin = dirname(javaExecutablePath);
  const javaHomeRoot = dirname(javaBin);
  if (basename(javaExecutablePath).toLowerCase() !== 'java.exe'
      || basename(javaBin).toLowerCase() !== 'bin'
      || basename(sbtLauncherJarPath).toLowerCase() !== 'sbt-launch-1.12.11.jar'
      || sbtLauncherJarPath.toLowerCase().startsWith(javaHomeRoot.toLowerCase() + sep)) {
    fail('tool path placement differs');
  }
  const javaAncestors = ancestorIdentities(javaHomeRoot);
  const sbtAncestors = ancestorIdentities(dirname(sbtLauncherJarPath));
  const fileRows: string[] = [];
  const identityRows: string[] = [];
  const foldedPaths = new Set<string>();
  let javaFileCount = 0;
  let javaDirectoryCount = 0;
  let javaBytes = 0;
  let javaExecutableSha256Hex: string | undefined;

  function walk(directory: string, relativeDirectory: string, depth: number): void {
    if (depth > MAX_JAVA_DEPTH) fail('Java home exceeds its depth cap');
    const before = directDirectory(directory);
    javaDirectoryCount++;
    if (javaDirectoryCount > MAX_JAVA_DIRECTORIES) fail('Java home exceeds its directory cap');
    identityRows.push('d\0' + relativeDirectory + '\0' + directoryIdentity(before));
    const names = readdirSync(directory).sort();
    for (const name of names) {
      if (!safeName(name)) fail('Java home entry name is unsafe');
      const relativePath = relativeDirectory ? relativeDirectory + '/' + name : name;
      if (relativePath.length > 1_024 || foldedPaths.has(relativePath.toLowerCase())) {
        fail('Java home path is too long or case-ambiguous');
      }
      foldedPaths.add(relativePath.toLowerCase());
      const path = resolve(directory, name);
      if (lstatSync(path, { bigint: true }).isDirectory()) {
        walk(path, relativePath, depth + 1);
      } else {
        javaFileCount++;
        if (javaFileCount > MAX_JAVA_FILES) fail('Java home exceeds its file cap');
        const file = stableFile(path, MAX_JAVA_FILE_BYTES);
        javaBytes += file.size;
        if (!Number.isSafeInteger(javaBytes) || javaBytes > MAX_JAVA_TOTAL_BYTES) {
          fail('Java home exceeds its total byte cap');
        }
        fileRows.push(relativePath + ':' + file.sha256Hex);
        identityRows.push('f\0' + relativePath + '\0' + file.identity + '\0' + file.sha256Hex);
        if (relativePath === 'bin/java.exe') javaExecutableSha256Hex = file.sha256Hex;
      }
    }
    const afterNames = readdirSync(directory).sort();
    if (names.length !== afterNames.length
        || names.some((name, index) => name !== afterNames[index])
        || directoryIdentity(before) !== directoryIdentity(directDirectory(directory))) {
      fail('Java home directory changed during scan');
    }
  }

  walk(javaHomeRoot, '', 0);
  if (!javaFileCount || !javaExecutableSha256Hex
      || sha256(fileRows.sort().join('\n')) !== input.lock.javaHomeSha256) {
    fail('complete Java home differs from the V4 lock');
  }
  const sbt = stableFile(sbtLauncherJarPath, MAX_SBT_JAR_BYTES);
  if (sbt.sha256Hex !== input.lock.sbtLauncherJarSha256) {
    fail('SBT launcher differs from the V4 lock');
  }
  assertAncestorsSame(javaAncestors);
  assertAncestorsSame(sbtAncestors);
  identityRows.push('j\0' + sbtLauncherJarPath + '\0' + sbt.identity + '\0' + sbt.sha256Hex);
  for (const [path, identity] of [...javaAncestors, ...sbtAncestors]) {
    identityRows.push('a\0' + path + '\0' + identity);
  }
  const identityFrame = identityRows.sort().join('\n');
  if (Buffer.byteLength(identityFrame, 'utf8') > MAX_IDENTITY_FRAME_BYTES) {
    fail('tool identity frame exceeds its byte cap');
  }
  return Object.freeze({
    javaHomeRoot, javaExecutablePath, sbtLauncherJarPath,
    javaHomeSha256Hex: input.lock.javaHomeSha256,
    javaExecutableSha256Hex,
    sbtLauncherJarSha256Hex: sbt.sha256Hex,
    javaFileCount, javaDirectoryCount, javaBytes,
    identityFrameSha256Hex: sha256(identityFrame),
  });
}

export function assertSameV4PinnedToolchain(
  before: Readonly<V4PinnedToolchainCapture>,
  after: Readonly<V4PinnedToolchainCapture>,
): void {
  if (!before || !after
      || Object.keys(before).sort().join('\0') !== Object.keys(after).sort().join('\0')
      || (Object.keys(before) as (keyof V4PinnedToolchainCapture)[])
        .some(key => before[key] !== after[key])) {
    fail('Java or SBT toolchain changed across the Job');
  }
}
