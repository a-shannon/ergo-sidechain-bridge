import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync,
  realpathSync, type BigIntStats,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { canonicalJson, parseStrictJson } from './strict-json.js';
import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

export const V6_NODE_BUILD_LOCK_FILE_NAME =
  'substrate-federated-isolated-devnet-node-build-lock-v6-current.json';
export const V6_NODE_BUILD_LOCK_RELATIVE_PATH =
  'sources/' + V6_NODE_BUILD_LOCK_FILE_NAME;
const MAX_LOCK_BYTES = 4_096;

export type V6CurrentNodeBuildLock = Readonly<
  Omit<V4NodeBuildLock, 'schemaVersion' | 'kind' | 'buildSbtOverlayBytes'> & {
    readonly schemaVersion: 6;
    readonly kind: 'substrate-federated-isolated-devnet-node-build-lock-v6-current';
    readonly buildSbtOverlayBytes: 20_585;
    readonly currentBridgeLockSha256: Readonly<{
      readonly 'package-lock.json': string;
      readonly 'build-manifest.json': string;
      readonly 'consensus-source-lock.json': string;
    }>;
    readonly v6MavenTerminalSha256: string;
    readonly v6MavenDirectorySha256: string;
    readonly v6MavenMembershipSha256: string;
    readonly v6LeveldbTerminalSha256: string;
    readonly approvedOutputCaps: Readonly<{
      readonly maxFiles: 50_000;
      readonly maxDirectories: 4_096;
      readonly maxBytes: 536_870_912;
    }>;
    readonly resolverJob: Readonly<{
      readonly timeoutMs: 300_000;
      readonly maxOutputBytes: 4_194_304;
      readonly maxStderrBytes: 16_384;
      readonly terminationGraceMs: 10_000;
    }>;
    readonly updateJob: Readonly<{
      readonly timeoutMs: 120_000;
      readonly maxOutputBytes: 33_554_432;
      readonly maxStderrBytes: 16_384;
      readonly terminationGraceMs: 10_000;
    }>;
    readonly sourceOnly: true;
    readonly resolverExecuted: false;
    readonly buildExecuted: false;
    readonly campaignAdmitted: false;
    readonly externalAcceptanceEstablished: false;
  }
>;

// This fixes lock *declarations*. Physical Maven, LevelDB and boot inputs
// require separate current capture; parsing this file grants no build authority.
const EXPECTED_LOCK = {
  schemaVersion: 6,
  kind: 'substrate-federated-isolated-devnet-node-build-lock-v6-current',
  platform: 'win32-x64',
  trustedHostModel: 'exclusive-same-user-process',
  consensusSourceLockSha256: '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
  ergoNodeBaseCommit: '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1',
  ergoPatchSha256: '08fb00b4c94f7db54228b6312bea58af430f13825e2b231821da3ef26e4796c3',
  buildSbtBaseBlob: '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d',
  buildSbtOverlayBlob: '23f9dbe303639b4e42cb85b9c4ef220b0a8aff78',
  buildSbtOverlayBytes: 20_585,
  buildSbtOverlaySha256: 'a0e138c7f4379b1c42e004d4e776a81e24f4b7757d09ceeb7488bc3951a4db03',
  gitVersion: '2.54.0.windows.1',
  gitExecutableSha256: '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5',
  javaMajorVersion: 17,
  javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS',
  javaHomeSha256: '43ddaddbc9c892eebb9017eaadd292a0198a3262941f061de61ab03db283dd7e',
  sbtLauncherJarSha256: 'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16',
  projectSbtVersion: '1.11.1',
  javaSystemProperties: [
    '-Dsbt.offline=true', '-Dsbt.server.autostart=false',
    '-Dsbt.override.build.repos=true', '-Djava.net.useSystemProxies=false',
  ],
  coursierMode: 'offline',
  sbtLauncherRepositoriesFileName: 'repositories',
  sbtLauncherRepositoriesFileTemplate: '[repositories]\n'
    + '  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n'
    + '  bridge-gitlab-leveldb-local: {{GITLAB_LEVELDB_FILE_URI}}\n'
    + '  bridge-empty-offline: {{EMPTY_REPOSITORY_URI}}, bootOnly\n',
  sbtLauncherEmptyRepositoryDirectoryName: 'sbt-launcher-empty-repository',
  ownedMavenMirrorReceiptSha256: '27ff67d2da5b0dd35a7a4f401f9d8bd1d386ff15d8fc80ba4c2decbbc5527f31',
  ownedMavenMirrorMetadataSha256: '863f729f28617af3ffc3254ae4784635145dfd00b0c8f9d2cecf60ae8ec1da7c',
  ownedMavenMirrorAggregateSha256: '1589db441eb484bced7f97afd688480c2928bab8f28b4f485dde2ce327c29880',
  ownedMavenMirrorDirectoryCount: 2_267,
  ownedMavenMirrorFileCount: 12_341,
  ownedMavenMirrorBytes: 1_095_267_211,
  ownedGitlabLeveldbReceiptSha256: 'cac8595aa48baad43eb7c6529fa8dd29e0dd7c551d4ade3ffa1e0137f31703b7',
  ownedGitlabLeveldbAggregateSha256: '82e96b8a1ea14dc4c3fcd5a5da2fdb208ed0932df2851dd6dd29d98883e8358e',
  ownedGitlabLeveldbDirectoryCount: 4,
  ownedGitlabLeveldbFileCount: 2,
  ownedGitlabLeveldbBytes: 1_295_843,
  ownedGitlabLeveldbCoordinate: 'org.ethereum:leveldbjni-all:1.18.3',
  ownedBootJarFrameSha256: 'fbde0a0e4ffafee2767afa9ab1b18d0253ff3b87cc700469e2273bb90a604628',
  ownedBootJarCount: 87,
  ownedBootJarBytes: 75_917_085,
  ownedBootDirectoryCount: 5,
  isolatedSbtStateDirectory: 'target/bridge-sbt-state-v4',
  buildArguments: ['assembly'],
  buildProcessRunner: 'reviewed-windows-job-object-v1',
  windowsJobProcessRunnerSha256: '47a08af66ef3134fefeee392e5578be9295e5171dca83c8861822d7e464ff627',
  buildTimeoutMs: 900_000,
  buildTerminationGraceMs: 10_000,
  buildMaxOutputBytes: 33_554_432,
  assemblyDirectory: 'target/scala-2.12',
  assemblyNamePattern: '^ergo-.*\\.jar$',
  minimumAssemblyBytes: 33_554_432,
  currentBridgeLockSha256: {
    'package-lock.json': '362649c5f11096f2ce5511057fafb93352bd21934098c3e81d6f8644d894b557',
    'build-manifest.json': '312eb0fee01f3ca8ae4da4bc84dafcb5fee381b691143c44ec9f27f6a0199c43',
    'consensus-source-lock.json': '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
  },
  v6MavenTerminalSha256: 'a8ffed525d593d7d4bc9002fe0d251612930e5960311169b6603e66f36fd40ea',
  v6MavenDirectorySha256: 'bba23576b6b5ce18ba29e6f8ada1b93527a7669bd29cc9768769862a6e5fe056',
  v6MavenMembershipSha256: '857087b354ce8e6086a95f0bf8353107bcd1199dd2efe5d4966a80ae31bbdd03',
  v6LeveldbTerminalSha256: '218d544350e9d0aa3372cc871cd5ea1811832a3879f484e11b09c2a2403370f2',
  approvedOutputCaps: { maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912 },
  resolverJob: {
    timeoutMs: 300_000, maxOutputBytes: 4_194_304,
    maxStderrBytes: 16_384, terminationGraceMs: 10_000,
  },
  updateJob: {
    timeoutMs: 120_000, maxOutputBytes: 33_554_432,
    maxStderrBytes: 16_384, terminationGraceMs: 10_000,
  },
  sourceOnly: true, resolverExecuted: false, buildExecuted: false,
  campaignAdmitted: false, externalAcceptanceEstablished: false,
} as const satisfies V6CurrentNodeBuildLock;

function fail(reason: string): never {
  throw new Error('V6 selected node build lock: ' + reason);
}
function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
}
freezeDeep(EXPECTED_LOCK);

export const V6_NODE_BUILD_LOCK_CANONICAL_TEXT = canonicalJson(EXPECTED_LOCK) + '\n';
export const V6_NODE_BUILD_LOCK_SHA256_HEX = sha256(V6_NODE_BUILD_LOCK_CANONICAL_TEXT);

function strictText(bytes: Uint8Array): string {
  if (bytes.length === 0 || bytes.length > MAX_LOCK_BYTES) fail('lock size differs');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    fail('lock encoding differs');
  }
  return text;
}

/** Structure-only check for isolated negatives; it grants no file or build authority. */
export function assertV6SelectedLockStructureNonAuthorizing(bytes: Uint8Array): void {
  const text = strictText(bytes);
  const parsed = parseStrictJson(text, 'V6 selected node build lock');
  if (canonicalJson(parsed) + '\n' !== text
      || canonicalJson(parsed) !== canonicalJson(EXPECTED_LOCK)) {
    fail('canonical fields, types or selected pins differ');
  }
}

function statIdentity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size,
    stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
}
function directAncestors(path: string): void {
  for (let cursor = path;; cursor = dirname(cursor)) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) {
      fail('linked or non-directory ancestor');
    }
    if (dirname(cursor) === cursor) return;
  }
}

function readDirectLock(path: string): Buffer {
  directAncestors(dirname(path));
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(MAX_LOCK_BYTES)
      || realpathSync.native(path).toLowerCase() !== path.toLowerCase()) {
    fail('lock is not a bounded direct single-link file');
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (statIdentity(before) !== statIdentity(opened)) fail('lock changed before read');
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) fail('lock shortened during read');
      offset += count;
    }
    const trailing = Buffer.alloc(1);
    if (readSync(descriptor, trailing, 0, 1, bytes.length) !== 0
        || statIdentity(opened) !== statIdentity(fstatSync(descriptor, { bigint: true }))
        || statIdentity(opened) !== statIdentity(lstatSync(path, { bigint: true }))) {
      fail('lock changed during read');
    }
    directAncestors(dirname(path));
    return bytes;
  } finally { closeSync(descriptor); }
}

export interface V6SelectedBuildLockInput {
  readonly path: string;
  readonly expectedSha256Hex: string;
}

/** Selects only this fixed source-only V6 lock; the caller cannot widen it by SHA. */
export function inspectSelectedV6NodeBuildLock(
  input: Readonly<V6SelectedBuildLockInput>,
): Readonly<{
  path: string; lock: Readonly<V6CurrentNodeBuildLock>; sha256Hex: string;
  sourceOnly: true; campaignAdmitted: false;
}> {
  if (typeof input.path !== 'string' || !isAbsolute(input.path)
      || basename(input.path) !== V6_NODE_BUILD_LOCK_FILE_NAME
      || input.expectedSha256Hex !== V6_NODE_BUILD_LOCK_SHA256_HEX) {
    fail('selected path or caller digest differs');
  }
  const path = resolve(input.path);
  const bytes = readDirectLock(path);
  if (sha256(bytes) !== V6_NODE_BUILD_LOCK_SHA256_HEX) fail('selected lock bytes differ');
  assertV6SelectedLockStructureNonAuthorizing(bytes);
  return Object.freeze({
    path, lock: EXPECTED_LOCK, sha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    sourceOnly: true as const, campaignAdmitted: false as const,
  });
}
