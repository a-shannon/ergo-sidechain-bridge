import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, type BigIntStats } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const V4_NODE_BUILD_LOCK_RELATIVE_PATH =
  'sources/substrate-federated-isolated-devnet-node-build-lock-v4.json';
export const V4_NODE_BUILD_LOCK_SHA256_HEX =
  'a79c7c8ff32bd3be5bf8c067b9420b1c0db9d5c7d4f2e1c51611801547ecd2aa';

export interface V4NodeBuildLock {
  readonly schemaVersion: 4;
  readonly kind: 'substrate-federated-isolated-devnet-node-build-lock-v4';
  readonly platform: 'win32-x64';
  readonly trustedHostModel: 'exclusive-same-user-process';
  readonly consensusSourceLockSha256: string;
  readonly ergoNodeBaseCommit: string;
  readonly ergoPatchSha256: string;
  readonly buildSbtBaseBlob: string;
  readonly buildSbtOverlayBlob: string;
  readonly buildSbtOverlayBytes: 13660;
  readonly buildSbtOverlaySha256: string;
  readonly gitVersion: '2.54.0.windows.1';
  readonly gitExecutableSha256: string;
  readonly javaMajorVersion: 17;
  readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
  readonly javaHomeSha256: string;
  readonly sbtLauncherJarSha256: string;
  readonly projectSbtVersion: '1.11.1';
  readonly javaSystemProperties: readonly [
    '-Dsbt.offline=true',
    '-Dsbt.server.autostart=false',
    '-Dsbt.override.build.repos=true',
    '-Djava.net.useSystemProxies=false',
  ];
  readonly coursierMode: 'offline';
  readonly sbtLauncherRepositoriesFileName: 'repositories';
  readonly sbtLauncherRepositoriesFileTemplate: string;
  readonly sbtLauncherEmptyRepositoryDirectoryName: 'sbt-launcher-empty-repository';
  readonly ownedMavenMirrorReceiptSha256: string;
  readonly ownedMavenMirrorMetadataSha256: string;
  readonly ownedMavenMirrorAggregateSha256: string;
  readonly ownedMavenMirrorDirectoryCount: 2267;
  readonly ownedMavenMirrorFileCount: 12341;
  readonly ownedMavenMirrorBytes: 1095267211;
  readonly ownedBootJarFrameSha256: string;
  readonly ownedBootJarCount: 87;
  readonly ownedBootJarBytes: 75917085;
  readonly ownedBootDirectoryCount: 5;
  readonly isolatedSbtStateDirectory: 'target/bridge-sbt-state-v4';
  readonly buildArguments: readonly ['assembly'];
  readonly buildProcessRunner: 'reviewed-windows-job-object-v1';
  readonly windowsJobProcessRunnerSha256: string;
  readonly buildTimeoutMs: 900000;
  readonly buildTerminationGraceMs: 10000;
  readonly buildMaxOutputBytes: 33554432;
  readonly assemblyDirectory: 'target/scala-2.12';
  readonly assemblyNamePattern: '^ergo-.*\\.jar$';
  readonly minimumAssemblyBytes: 33554432;
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function assertDirectParents(path: string): void {
  let cursor = dirname(path);
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('V4 build lock has a linked or non-directory ancestor');
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
}

export function inspectV4NodeBuildLock(bridgeRoot: string): Readonly<{
  lock: Readonly<V4NodeBuildLock>;
  sha256Hex: typeof V4_NODE_BUILD_LOCK_SHA256_HEX;
}> {
  const path = resolve(bridgeRoot, V4_NODE_BUILD_LOCK_RELATIVE_PATH);
  assertDirectParents(path);
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > 4096n) {
    throw new Error('V4 build lock is not a bounded direct single-link file');
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || bytes.length !== Number(before.size)
      || createHash('sha256').update(bytes).digest('hex') !== V4_NODE_BUILD_LOCK_SHA256_HEX) {
    throw new Error('V4 build lock bytes or identity differ');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    throw new Error('V4 build lock encoding differs');
  }
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || (value as Record<string, unknown>).schemaVersion !== 4
      || (value as Record<string, unknown>).kind
        !== 'substrate-federated-isolated-devnet-node-build-lock-v4') {
    throw new Error('V4 build lock identity differs');
  }
  freezeDeep(value);
  return Object.freeze({
    lock: value as V4NodeBuildLock,
    sha256Hex: V4_NODE_BUILD_LOCK_SHA256_HEX,
  });
}
