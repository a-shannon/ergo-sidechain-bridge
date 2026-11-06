import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync, realpathSync, type BigIntStats,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { runBoundedProcess } from './bounded-process-runner.js';
import { parseStrictJson } from './strict-json.js';
import {
  inspectSelectedV4OrV5BuildLock,
  type V4OrV5BuildLock, type V4OrV5BuildLockSelection,
} from './substrate-federated-isolated-devnet-ergo-node-build-v5-source59-lock.js';
import { inspectSelectedV6OrLegacyBuildLock } from
  './substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js';
import {
  V6_NODE_BUILD_LOCK_RELATIVE_PATH, V6_NODE_BUILD_LOCK_SHA256_HEX,
  type V6CurrentNodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import {
  inspectV6PublicMavenCache, type V6MavenCacheParsed,
} from './substrate-federated-native-v6-maven-cache-reader.js';
import { withPinnedV4BoundedChildTools } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

const INSPECTOR_SHA256 = 'c15c77ed038fadc150c91b11a01f34e8490dc5a3bbd246b6875ea6b811b07363';
const RECEIPT_MAX_BYTES = 2_500_000;
const MIRROR_MAX_ENTRIES = 14_608;
const MIRROR_MAX_MEMBERSHIP_BYTES = 2_500_000;
const BOOT_MAX_ENTRIES = 92;
const BOOT_MAX_MEMBERSHIP_BYTES = 65_536;
const LEVELDB_RECEIPT_MAX_BYTES = 4096;
const LEVELDB_MAX_ENTRIES = 6;
const LEVELDB_MAX_MEMBERSHIP_BYTES = 2048;
const MAX_FILE_BYTES = 268_435_456;
const LEVELDB_REPOSITORY_URL = 'https://gitlab.com/api/v4/projects/61211221/packages/maven';
const LEVELDB_COORDINATE = 'org.ethereum:leveldbjni-all:1.18.3';
const LEVELDB_DIRECTORY_PATHS = Object.freeze([
  'org', 'org/ethereum', 'org/ethereum/leveldbjni-all',
  'org/ethereum/leveldbjni-all/1.18.3',
]);
const LEVELDB_FILE_PATHS = Object.freeze([
  'org/ethereum/leveldbjni-all/1.18.3/leveldbjni-all-1.18.3.jar',
  'org/ethereum/leveldbjni-all/1.18.3/leveldbjni-all-1.18.3.pom',
]);
const SUFFIX_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  '.checked': 2519, '.computed': 2265, '.pom': 1369,
  '.pom__md5': 1369, '.pom__sha1': 1369,
  '.jar': 1148, '.jar__md5': 1148, '.jar__sha1': 1148,
  '.xml': 2, '.xml__md5': 2, '.xml__sha1': 2,
});

export interface V4DependencyExpected {
  readonly receiptSha256Hex: string;
  readonly mirrorMetadataSha256Hex: string;
  readonly mirrorAggregateSha256Hex: string;
  readonly mirrorDirectoryCount: number;
  readonly mirrorFileCount: number;
  readonly mirrorBytes: number;
  readonly bootJarFrameSha256Hex: string;
  readonly bootJarCount: number;
  readonly bootJarBytes: number;
  readonly bootDirectoryCount: number;
}
export interface V4LeveldbExpected {
  readonly receiptSha256Hex: string;
  readonly aggregateSha256Hex: string;
  readonly directoryCount: number;
  readonly fileCount: number;
  readonly bytes: number;
  readonly coordinate: string;
}
export interface V4DependencyFile {
  readonly path: string;
  readonly size: number;
  readonly sha256Hex: string;
}
export interface V4DependencyTree {
  readonly rootIdentity: string;
  readonly directories: readonly string[];
  readonly files: readonly V4DependencyFile[];
  readonly bytes: number;
  readonly directorySha256Hex: string;
  readonly fileMembershipSha256Hex: string;
  readonly metadataSha256Hex: string;
  readonly membership: string;
  readonly identities: ReadonlyMap<string, string>;
}
export interface V4DependencyCapture {
  readonly lockSha256Hex: string;
  readonly mirrorReceiptSha256Hex: string;
  readonly leveldbReceiptSha256Hex: string;
  readonly mirror: Readonly<V4DependencyTree>;
  readonly boot: Readonly<V4DependencyTree>;
  readonly leveldb: Readonly<V4DependencyTree>;
  readonly bootJarFrameSha256Hex: string;
  readonly leveldbAggregateSha256Hex: string;
}
export interface V4DependencyCaptureInput {
  readonly bridgeRoot: string;
  readonly lockSelection?: V4OrV5BuildLockSelection;
  readonly mirrorRoot: string;
  readonly mirrorReceiptPath: string;
  readonly bootRoot: string;
  readonly leveldbRoot: string;
  readonly leveldbReceiptPath: string;
}
export interface V6DependencyCaptureInput extends
  Omit<V4DependencyCaptureInput, 'lockSelection' | 'mirrorReceiptPath'> {
  readonly lockSelection: 'v6-current';
  readonly mavenNamespaceRoot: string;
  readonly v6MavenSourceRoot: string;
}
export interface V6DependencyCapture extends V4DependencyCapture {
  readonly sourceOnly: true;
  readonly campaignAdmitted: false;
  readonly mavenTerminalSha256Hex: string;
  readonly leveldbTerminalSha256Hex: string;
}
export interface V6DependencyPaths {
  readonly namespaceRoot: string;
  readonly mirrorRoot: string;
  readonly bootRoot: string;
  readonly leveldbRoot: string;
  readonly leveldbReceiptPath: string;
  readonly leveldbTerminalPath: string;
  readonly mavenSourceRoot: string;
  readonly mavenReportPath: string;
  readonly mavenTerminalPath: string;
}
interface MirrorReceipt {
  readonly directorySha256: string;
  readonly fileMembershipSha256: string;
  readonly files: readonly V4DependencyFile[];
}
interface LeveldbReceipt {
  readonly files: readonly V4DependencyFile[];
}

function fail(message: string): never { throw new Error('V4 build dependency capture: ' + message); }
function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function ordinal(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs
    && a.ctimeNs === b.ctimeNs && a.birthtimeNs === b.birthtimeNs;
}
function identity(s: BigIntStats): string {
  return [s.dev, s.ino, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs, s.birthtimeNs].join(':');
}
function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}
export function rootsOverlap(a: string, b: string): boolean {
  const first = resolve(a).toLowerCase();
  const second = resolve(b).toLowerCase();
  const firstPrefix = first.endsWith(sep) ? first : first + sep;
  const secondPrefix = second.endsWith(sep) ? second : second + sep;
  return first === second || first.startsWith(secondPrefix) || second.startsWith(firstPrefix);
}
function directDirectory(path: string): BigIntStats {
  const s = lstatSync(path, { bigint: true });
  if (!s.isDirectory() || s.isSymbolicLink() || !samePath(realpathSync.native(path), path)) {
    fail('directory is indirect');
  }
  return s;
}
function directAncestors(path: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  let cursor = path;
  for (;;) {
    result.set(cursor, identity(directDirectory(cursor)));
    const parent = dirname(cursor);
    if (parent === cursor) return result;
    cursor = parent;
  }
}
function assertAncestors(before: ReadonlyMap<string, string>): void {
  for (const [path, pin] of before) {
    if (identity(directDirectory(path)) !== pin) fail('ancestor identity changed');
  }
}
function safeRelative(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(piece => piece.length > 0 && piece !== '.' && piece !== '..'
      && /^[\x21-\x7e]+$/u.test(piece) && !/[<>:"|?*\\/]/u.test(piece)
      && !/[. ]$/u.test(piece)
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(piece));
}
function exactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    fail(label + ' field set differs');
  }
  return value as Record<string, unknown>;
}
function decimal(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail('decimal differs');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail('decimal exceeds safe range');
  return number;
}
function hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}
function nameHash(paths: readonly string[]): string {
  const h = createHash('sha256');
  for (const path of paths) h.update(Buffer.from(path, 'utf8')).update(Buffer.from([0]));
  return h.digest('hex');
}
function fileFrame(files: readonly V4DependencyFile[]): string {
  const h = createHash('sha256');
  for (const file of files) {
    h.update(Buffer.from(file.path, 'utf8')).update(Buffer.from([0]))
      .update(String(file.size)).update(Buffer.from([0]))
      .update(file.sha256Hex).update('\n');
  }
  return h.digest('hex');
}
export function expectedV4BuildDependencies(lock: Readonly<V4OrV5BuildLock>): V4DependencyExpected {
  return Object.freeze({
    receiptSha256Hex: lock.ownedMavenMirrorReceiptSha256,
    mirrorMetadataSha256Hex: lock.ownedMavenMirrorMetadataSha256,
    mirrorAggregateSha256Hex: lock.ownedMavenMirrorAggregateSha256,
    mirrorDirectoryCount: lock.ownedMavenMirrorDirectoryCount,
    mirrorFileCount: lock.ownedMavenMirrorFileCount,
    mirrorBytes: lock.ownedMavenMirrorBytes,
    bootJarFrameSha256Hex: lock.ownedBootJarFrameSha256,
    bootJarCount: lock.ownedBootJarCount,
    bootJarBytes: lock.ownedBootJarBytes,
    bootDirectoryCount: lock.ownedBootDirectoryCount,
  });
}
export function expectedV4LeveldbDependency(lock: Readonly<V4OrV5BuildLock>): V4LeveldbExpected {
  return Object.freeze({
    receiptSha256Hex: lock.ownedGitlabLeveldbReceiptSha256,
    aggregateSha256Hex: lock.ownedGitlabLeveldbAggregateSha256,
    directoryCount: lock.ownedGitlabLeveldbDirectoryCount,
    fileCount: lock.ownedGitlabLeveldbFileCount,
    bytes: lock.ownedGitlabLeveldbBytes,
    coordinate: lock.ownedGitlabLeveldbCoordinate,
  });
}
export function parseV4MirrorReceipt(
  bytes: Buffer, mirrorRoot: string, expected: Readonly<V4DependencyExpected>,
  suffixCounts: Readonly<Record<string, number>> = SUFFIX_COUNTS,
): MirrorReceipt {
  if (bytes.length <= 0 || bytes.length > RECEIPT_MAX_BYTES
      || sha256(bytes) !== expected.receiptSha256Hex) fail('mirror receipt pin differs');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    fail('mirror receipt encoding differs');
  }
  const parsed = parseStrictJson(text, 'V4 Maven mirror receipt');
  if (JSON.stringify(parsed) + '\n' !== text) fail('mirror receipt is not compact producer JSON');
  const receipt = exactKeys(parsed, [
    'schema', 'sourceRoot', 'mirrorRoot', 'directoryCount', 'directorySha256',
    'fileCount', 'fileMembershipSha256', 'byteCount', 'suffixCounts',
    'aggregateSha256', 'files', 'sourceStableBeforeAfter', 'mirrorRecaptured',
    'sourceOnlyPreparation', 'resolverOrCompilerExecuted',
  ], 'mirror receipt');
  if (receipt.schema !== 'r7-maven-file-repo-mirror-v1'
      || typeof receipt.sourceRoot !== 'string' || !isAbsolute(receipt.sourceRoot)
      || typeof receipt.mirrorRoot !== 'string' || !samePath(receipt.mirrorRoot, mirrorRoot)
      || receipt.directoryCount !== expected.mirrorDirectoryCount
      || !hex(receipt.directorySha256)
      || receipt.fileCount !== expected.mirrorFileCount
      || !hex(receipt.fileMembershipSha256)
      || decimal(receipt.byteCount) !== expected.mirrorBytes
      || receipt.aggregateSha256 !== expected.mirrorAggregateSha256Hex
      || receipt.sourceStableBeforeAfter !== true || receipt.mirrorRecaptured !== true
      || receipt.sourceOnlyPreparation !== true || receipt.resolverOrCompilerExecuted !== false
      || !Array.isArray(receipt.files) || receipt.files.length !== expected.mirrorFileCount) {
    fail('mirror receipt claims or counts differ');
  }
  const suffix = exactKeys(receipt.suffixCounts, Object.keys(suffixCounts), 'suffix counts');
  for (const [name, count] of Object.entries(suffixCounts)) {
    if (suffix[name] !== count) fail('suffix count differs');
  }
  const files: V4DependencyFile[] = [];
  const actualSuffix = Object.fromEntries(Object.keys(suffixCounts).map(name => [name, 0])) as Record<string, number>;
  let total = 0;
  let prior = '';
  const folded = new Set<string>();
  for (const entry of receipt.files) {
    const row = exactKeys(entry, ['path', 'size', 'sha256'], 'mirror file');
    const path = row.path;
    const digest = row.sha256;
    if (typeof path !== 'string' || !safeRelative(path)
        || (prior && ordinal(prior, path) >= 0) || folded.has(path.toLowerCase())
        || !hex(digest)) fail('mirror receipt path, order or digest differs');
    const size = decimal(row.size);
    if (size > MAX_FILE_BYTES) fail('mirror receipt file exceeds cap');
    const selected = Object.keys(suffixCounts).find(name => path.endsWith(name));
    if (!selected) fail('mirror receipt file suffix differs');
    actualSuffix[selected]!++;
    folded.add(path.toLowerCase());
    prior = path;
    total += size;
    if (!Number.isSafeInteger(total) || total > expected.mirrorBytes) fail('mirror receipt bytes exceed cap');
    files.push(Object.freeze({ path, size, sha256Hex: digest }));
  }
  if (total !== expected.mirrorBytes || fileFrame(files) !== expected.mirrorAggregateSha256Hex) {
    fail('mirror receipt aggregate differs');
  }
  for (const [name, count] of Object.entries(suffixCounts)) {
    if (actualSuffix[name] !== count) fail('mirror receipt suffix membership differs');
  }
  return Object.freeze({
    directorySha256: receipt.directorySha256 as string,
    fileMembershipSha256: receipt.fileMembershipSha256 as string,
    files: Object.freeze(files),
  });
}

export function parseV4LeveldbReceipt(
  bytes: Buffer, expected: Readonly<V4LeveldbExpected>,
): LeveldbReceipt {
  if (bytes.length <= 0 || bytes.length > LEVELDB_RECEIPT_MAX_BYTES
      || sha256(bytes) !== expected.receiptSha256Hex) fail('LevelDB receipt pin differs');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    fail('LevelDB receipt encoding differs');
  }
  const parsed = parseStrictJson(text, 'V4 LevelDB file repository receipt');
  if (JSON.stringify(parsed) + '\n' !== text) fail('LevelDB receipt is not compact producer JSON');
  const receipt = exactKeys(parsed, [
    'aggregateSha256Hex', 'buildExecuted', 'byteCount', 'campaignAdmitted',
    'coordinate', 'directoryCount', 'externalAcceptanceEstablished', 'fileCount',
    'files', 'providedDependencyResolutionEstablished', 'resolverExecuted', 'schema',
    'sourceCacheChecksumSidecarsMatched', 'sourceRepositoryUrl',
    'sourceStableBeforeAfter', 'targetDirectSingleLinkRecaptured',
  ], 'LevelDB receipt');
  const coordinate = exactKeys(receipt.coordinate,
    ['groupId', 'artifactId', 'version'], 'LevelDB coordinate');
  if (receipt.schema !== 'v4-gitlab-leveldb-artifact-overlay-v1'
      || expected.coordinate !== LEVELDB_COORDINATE
      || coordinate.groupId !== 'org.ethereum'
      || coordinate.artifactId !== 'leveldbjni-all'
      || coordinate.version !== '1.18.3'
      || receipt.sourceRepositoryUrl !== LEVELDB_REPOSITORY_URL
      || receipt.directoryCount !== expected.directoryCount
      || receipt.fileCount !== expected.fileCount
      || typeof receipt.byteCount !== 'number' || !Number.isSafeInteger(receipt.byteCount)
      || receipt.byteCount !== expected.bytes
      || receipt.aggregateSha256Hex !== expected.aggregateSha256Hex
      || receipt.sourceCacheChecksumSidecarsMatched !== true
      || receipt.sourceStableBeforeAfter !== true
      || receipt.targetDirectSingleLinkRecaptured !== true
      || receipt.buildExecuted !== false || receipt.resolverExecuted !== false
      || receipt.campaignAdmitted !== false || receipt.externalAcceptanceEstablished !== false
      || receipt.providedDependencyResolutionEstablished !== false
      || !Array.isArray(receipt.files) || receipt.files.length !== 2) {
    fail('LevelDB receipt identity, counts or claims differ');
  }
  const files: V4DependencyFile[] = [];
  let total = 0;
  for (let index = 0; index < LEVELDB_FILE_PATHS.length; index++) {
    const row = exactKeys(receipt.files[index],
      ['bytes', 'md5Hex', 'path', 'sha1Hex', 'sha256Hex'], 'LevelDB file');
    if (row.path !== LEVELDB_FILE_PATHS[index]
        || typeof row.bytes !== 'number' || !Number.isSafeInteger(row.bytes)
        || row.bytes <= 0 || row.bytes > MAX_FILE_BYTES
        || typeof row.md5Hex !== 'string' || !/^[0-9a-f]{32}$/u.test(row.md5Hex)
        || typeof row.sha1Hex !== 'string' || !/^[0-9a-f]{40}$/u.test(row.sha1Hex)
        || !hex(row.sha256Hex)) fail('LevelDB file path, size or digest differs');
    total += row.bytes;
    files.push(Object.freeze({ path: row.path, size: row.bytes, sha256Hex: row.sha256Hex }));
  }
  if (total !== expected.bytes || fileFrame(files) !== expected.aggregateSha256Hex) {
    fail('LevelDB receipt aggregate differs');
  }
  return Object.freeze({ files: Object.freeze(files) });
}

function pinnedFile(path: string, maxBytes: number, expectedSha: string): Readonly<{ bytes: Buffer; stat: BigIntStats }> {
  const ancestors = directAncestors(dirname(path));
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(maxBytes)) fail('pinned file is indirect or unbounded');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes: Buffer;
  try {
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('pinned file open identity changed');
    bytes = readFileSync(fd);
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('pinned file read identity changed');
  } finally { closeSync(fd); }
  if (bytes.length !== Number(before.size) || !same(before, lstatSync(path, { bigint: true }))
      || sha256(bytes) !== expectedSha) fail('pinned file bytes changed');
  assertAncestors(ancestors);
  return { bytes, stat: before };
}
function streamFile(path: string, cap: number): Readonly<{ size: number; sha256Hex: string; stat: BigIntStats }> {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 0n || before.size > BigInt(cap)
      || !samePath(realpathSync.native(path), path)) fail('dependency file is indirect or too large');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const h = createHash('sha256');
  let size = 0;
  try {
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('dependency file open identity changed');
    const chunk = Buffer.allocUnsafe(65_536);
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      size += count;
      if (size > cap || size > Number(before.size)) fail('dependency file grew during read');
      h.update(chunk.subarray(0, count));
    }
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('dependency file changed during read');
  } finally { closeSync(fd); }
  if (size !== Number(before.size) || !same(before, lstatSync(path, { bigint: true }))) {
    fail('dependency file path changed after read');
  }
  return { size, sha256Hex: h.digest('hex'), stat: before };
}
export function scanV4DirectDependencyTree(
  root: string, maxEntries: number, maxBytes: number, maxMembershipBytes: number,
): V4DependencyTree {
  if (!isAbsolute(root) || resolve(root) !== root || maxEntries <= 0 || maxEntries > 20_000
      || maxBytes <= 0 || maxBytes > 1_200_000_000
      || maxMembershipBytes <= 0 || maxMembershipBytes > 4_194_304) {
    fail('tree root or caps differ');
  }
  const ancestors = directAncestors(root);
  const directories: string[] = [];
  const files: V4DependencyFile[] = [];
  const rows: Array<readonly [string, string]> = [];
  const identities = new Map<string, string>();
  const membership: string[] = [];
  const folded = new Set<string>();
  let bytes = 0;
  const visit = (absolute: string, relative: string, depth: number): void => {
    if (depth > 64) fail('dependency tree depth exceeded');
    const before = directDirectory(absolute);
    identities.set(relative, identity(before));
    rows.push([relative, ['d', relative, before.dev, before.ino, before.nlink,
      before.size, before.mtimeNs, before.ctimeNs, before.birthtimeNs].join('\0')]);
    if (relative) directories.push(relative);
    if (directories.length + files.length > maxEntries) fail('dependency entry cap exceeded');
    const names = readdirSync(absolute);
    for (const name of names.sort(ordinal)) {
      const child = relative ? relative + '/' + name : name;
      if (!safeRelative(child) || folded.has(child.toLowerCase())) fail('unsafe or case-colliding dependency path');
      folded.add(child.toLowerCase());
      const path = resolve(absolute, name);
      if (!path.startsWith(root + sep)) fail('dependency path escapes root');
      const stat = lstatSync(path, { bigint: true });
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        membership.push('D\t' + child + '\n');
        visit(path, child, depth + 1);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        const file = streamFile(path, Math.min(MAX_FILE_BYTES, maxBytes - bytes));
        if (!same(stat, file.stat)) fail('dependency file changed before open');
        files.push(Object.freeze({ path: child, size: file.size, sha256Hex: file.sha256Hex }));
        identities.set(child, identity(file.stat));
        rows.push([child, ['f', child, file.stat.dev, file.stat.ino, file.stat.nlink,
          file.stat.size, file.stat.mtimeNs, file.stat.ctimeNs, file.stat.birthtimeNs].join('\0')]);
        membership.push('F\t' + child + '\n');
        bytes += file.size;
      } else fail('unsupported dependency entry');
      if (directories.length + files.length > maxEntries || bytes > maxBytes) {
        fail('dependency count or byte cap exceeded');
      }
    }
    if (!same(before, directDirectory(absolute))) fail('dependency directory changed during scan');
  };
  visit(root, '', 0);
  assertAncestors(ancestors);
  files.sort((a, b) => ordinal(a.path, b.path));
  directories.sort(ordinal);
  rows.sort((a, b) => ordinal(a[0], b[0]));
  const fullMembership = membership.sort(ordinal).join('');
  if (Buffer.byteLength(fullMembership, 'utf8') > maxMembershipBytes) {
    fail('dependency membership byte cap exceeded');
  }
  return Object.freeze({
    rootIdentity: ancestors.get(root)!, directories: Object.freeze(directories),
    files: Object.freeze(files), bytes,
    directorySha256Hex: nameHash(directories),
    fileMembershipSha256Hex: nameHash(files.map(file => file.path)),
    metadataSha256Hex: sha256(rows.map(row => row[1]).join('\n') + '\n'),
    membership: fullMembership, identities,
  });
}
export function validateV4DependencyTrees(
  mirror: Readonly<V4DependencyTree>, boot: Readonly<V4DependencyTree>,
  receipt: Readonly<MirrorReceipt>, expected: Readonly<V4DependencyExpected>,
): string {
  if (mirror.directories.length !== expected.mirrorDirectoryCount
      || mirror.files.length !== expected.mirrorFileCount || mirror.bytes !== expected.mirrorBytes
      || mirror.directorySha256Hex !== receipt.directorySha256
      || mirror.fileMembershipSha256Hex !== receipt.fileMembershipSha256
      || mirror.metadataSha256Hex !== expected.mirrorMetadataSha256Hex
      || mirror.files.length !== receipt.files.length) fail('mirror physical closure differs');
  for (let i = 0; i < receipt.files.length; i++) {
    const actual = mirror.files[i]!;
    const pinned = receipt.files[i]!;
    if (actual.path !== pinned.path || actual.size !== pinned.size
        || actual.sha256Hex !== pinned.sha256Hex) fail('mirror file content differs from receipt');
  }
  if (fileFrame(mirror.files) !== expected.mirrorAggregateSha256Hex) {
    fail('mirror aggregate differs');
  }
  if (boot.directories.length !== expected.bootDirectoryCount
      || boot.files.length !== expected.bootJarCount || boot.bytes !== expected.bootJarBytes) {
    fail('boot has an extra, absent or differently sized entry');
  }
  const mirrorJar = new Map<string, number>();
  for (const file of mirror.files.filter(file => file.path.endsWith('.jar'))) {
    const key = file.size + ':' + file.sha256Hex;
    mirrorJar.set(key, (mirrorJar.get(key) ?? 0) + 1);
  }
  for (const file of boot.files) {
    const key = file.size + ':' + file.sha256Hex;
    if (!file.path.endsWith('.jar') || mirrorJar.get(key) !== 1) {
      fail('boot JAR lacks a unique pinned mirror match');
    }
  }
  const frame = fileFrame(boot.files);
  if (frame !== expected.bootJarFrameSha256Hex) fail('boot JAR frame differs');
  return frame;
}
export function validateV4LeveldbTree(
  tree: Readonly<V4DependencyTree>, receipt: Readonly<LeveldbReceipt>,
  expected: Readonly<V4LeveldbExpected>,
): string {
  if (tree.directories.length !== expected.directoryCount
      || tree.files.length !== expected.fileCount || tree.bytes !== expected.bytes
      || tree.directories.length !== LEVELDB_DIRECTORY_PATHS.length
      || tree.files.length !== LEVELDB_FILE_PATHS.length
      || tree.directorySha256Hex !== nameHash(LEVELDB_DIRECTORY_PATHS)
      || tree.fileMembershipSha256Hex !== nameHash(LEVELDB_FILE_PATHS)
      || tree.directories.some((path, index) => path !== LEVELDB_DIRECTORY_PATHS[index])
      || receipt.files.length !== tree.files.length) {
    fail('LevelDB physical closure differs');
  }
  for (let index = 0; index < receipt.files.length; index++) {
    const actual = tree.files[index]!;
    const pinned = receipt.files[index]!;
    if (actual.path !== LEVELDB_FILE_PATHS[index]
        || actual.path !== pinned.path || actual.size !== pinned.size
        || actual.sha256Hex !== pinned.sha256Hex) {
      fail('LevelDB POM or JAR differs from receipt');
    }
  }
  const frame = fileFrame(tree.files);
  if (frame !== expected.aggregateSha256Hex) fail('LevelDB physical aggregate differs');
  return frame;
}
export function parseV4DependencyInspectorOutput(
  encoded: string, maxEntries: number, maxMembershipBytes: number,
): string {
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    fail('inspector base64 differs');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length > maxMembershipBytes) {
    fail('inspector output exceeds cap or is noncanonical');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text || text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    fail('inspector encoding differs');
  }
  const rows = text.slice(0, -1).split('\n');
  if (rows.length === 0 || rows.length > maxEntries) fail('inspector count differs');
  let previous = '';
  const dirs = new Set<string>();
  const folded = new Set<string>();
  for (const row of rows) {
    if (!/^[DF]\t/u.test(row) || (previous && previous >= row)) fail('inspector order or kind differs');
    previous = row;
    const path = row.slice(2);
    if (!safeRelative(path) || folded.has(path.toLowerCase())) fail('inspector path differs');
    folded.add(path.toLowerCase());
    if (row[0] === 'D') dirs.add(path);
  }
  for (const row of rows) {
    const path = row.slice(2);
    const slash = path.lastIndexOf('/');
    if (slash >= 0 && !dirs.has(path.slice(0, slash))) fail('inspector parent absent');
  }
  return text;
}
async function inspectMembership(root: string, maxEntries: number, maxBytes: number): Promise<string> {
  if (process.platform !== 'win32') fail('Windows reparse inspection required');
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) fail('SystemRoot unavailable');
  const inspector = resolve(import.meta.dirname, 'scripts', 'inspect-v4-build-input-membership.ps1');
  const before = pinnedFile(inspector, 65_536, INSPECTOR_SHA256);
  try {
    return await withPinnedV4BoundedChildTools(async () => {
      const maxEncoded = 4 * Math.ceil(maxBytes / 3);
      const result = await runBoundedProcess({
        executablePath: resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', inspector, '-Root', root, '-MaxEntries', String(maxEntries),
          '-MaxMembershipBytes', String(maxBytes)],
        cwd: resolve(systemRoot, 'System32'),
        env: { SystemRoot: systemRoot, WINDIR: systemRoot, Path: resolve(systemRoot, 'System32') },
        timeoutMs: 30_000, maxOutputBytes: maxEncoded + 16_384,
        maxStdoutBytes: maxEncoded, maxStderrBytes: 16_384, terminationGraceMs: 10_000,
        label: 'V4 Maven or boot input membership inspection',
      });
      if (result.exitCode !== 0 || result.stderrBytes.length !== 0) fail('inspector Job failed');
      const encoded = new TextDecoder('utf-8', { fatal: true }).decode(result.stdoutBytes);
      return parseV4DependencyInspectorOutput(encoded, maxEntries, maxBytes);
    });
  } finally {
    const after = pinnedFile(inspector, 65_536, INSPECTOR_SHA256);
    if (!same(before.stat, after.stat) || !before.bytes.equals(after.bytes)) fail('inspector changed');
  }
}
function assertStableTree(root: string, tree: Readonly<V4DependencyTree>): void {
  const ancestors = directAncestors(root);
  if (ancestors.get(root) !== tree.rootIdentity
      || tree.identities.size !== tree.directories.length + tree.files.length + 1) {
    fail('dependency root identity changed');
  }
  for (const [relative, pin] of tree.identities) {
    const path = relative ? resolve(root, ...relative.split('/')) : root;
    const stat = lstatSync(path, { bigint: true });
    if (identity(stat) !== pin || stat.isSymbolicLink()) fail('dependency entry identity changed');
  }
  assertAncestors(ancestors);
}
export async function captureV4BuildDependencies(
  input: Readonly<V4DependencyCaptureInput>,
): Promise<V4DependencyCapture> {
  if (input.lockSelection !== undefined && input.lockSelection !== 'v4'
      && input.lockSelection !== 'v5-source59') {
    fail('legacy dependency lock selection differs');
  }
  if (typeof input.leveldbRoot !== 'string' || typeof input.leveldbReceiptPath !== 'string') {
    fail('LevelDB dependency input absent');
  }
  const mirrorRoot = resolve(input.mirrorRoot);
  const bootRoot = resolve(input.bootRoot);
  const leveldbRoot = resolve(input.leveldbRoot);
  const receiptPath = resolve(input.mirrorReceiptPath);
  const leveldbReceiptPath = resolve(input.leveldbReceiptPath);
  if (!isAbsolute(input.bridgeRoot) || !isAbsolute(input.mirrorRoot)
      || !isAbsolute(input.bootRoot) || !isAbsolute(input.mirrorReceiptPath)
      || !isAbsolute(input.leveldbRoot) || !isAbsolute(input.leveldbReceiptPath)
      || !samePath(receiptPath, mirrorRoot + '.json')
      || !samePath(leveldbReceiptPath, leveldbRoot + '.json')
      || rootsOverlap(mirrorRoot, bootRoot) || rootsOverlap(mirrorRoot, leveldbRoot)
      || rootsOverlap(bootRoot, leveldbRoot)) {
    fail('dependency input roots overlap or receipt location differs');
  }
  const { lock, sha256Hex } = inspectSelectedV4OrV5BuildLock(
    input.bridgeRoot, input.lockSelection);
  const expected = expectedV4BuildDependencies(lock);
  const leveldbExpected = expectedV4LeveldbDependency(lock);
  const leveldbReceiptBefore = pinnedFile(leveldbReceiptPath, LEVELDB_RECEIPT_MAX_BYTES,
    leveldbExpected.receiptSha256Hex);
  const leveldbReceipt = parseV4LeveldbReceipt(leveldbReceiptBefore.bytes, leveldbExpected);
  const beforeLeveldb = await inspectMembership(leveldbRoot, LEVELDB_MAX_ENTRIES,
    LEVELDB_MAX_MEMBERSHIP_BYTES);
  const leveldb = scanV4DirectDependencyTree(leveldbRoot, LEVELDB_MAX_ENTRIES,
    leveldbExpected.bytes, LEVELDB_MAX_MEMBERSHIP_BYTES);
  if (leveldb.membership !== beforeLeveldb) fail('LevelDB inspector and Node membership differ');
  const afterLeveldb = await inspectMembership(leveldbRoot, LEVELDB_MAX_ENTRIES,
    LEVELDB_MAX_MEMBERSHIP_BYTES);
  if (afterLeveldb !== beforeLeveldb) fail('LevelDB membership changed');
  const leveldbFrame = validateV4LeveldbTree(leveldb, leveldbReceipt, leveldbExpected);
  const receiptBefore = pinnedFile(receiptPath, RECEIPT_MAX_BYTES, expected.receiptSha256Hex);
  const receipt = parseV4MirrorReceipt(receiptBefore.bytes, mirrorRoot, expected);
  const beforeMirror = await inspectMembership(mirrorRoot, MIRROR_MAX_ENTRIES, MIRROR_MAX_MEMBERSHIP_BYTES);
  const mirror = scanV4DirectDependencyTree(mirrorRoot, MIRROR_MAX_ENTRIES,
    expected.mirrorBytes, MIRROR_MAX_MEMBERSHIP_BYTES);
  if (mirror.membership !== beforeMirror) fail('mirror inspector and Node membership differ');
  const afterMirror = await inspectMembership(mirrorRoot, MIRROR_MAX_ENTRIES, MIRROR_MAX_MEMBERSHIP_BYTES);
  if (afterMirror !== beforeMirror) fail('mirror membership changed');
  const beforeBoot = await inspectMembership(bootRoot, BOOT_MAX_ENTRIES, BOOT_MAX_MEMBERSHIP_BYTES);
  const boot = scanV4DirectDependencyTree(bootRoot, BOOT_MAX_ENTRIES,
    expected.bootJarBytes, BOOT_MAX_MEMBERSHIP_BYTES);
  if (boot.membership !== beforeBoot) fail('boot inspector and Node membership differ');
  const afterBoot = await inspectMembership(bootRoot, BOOT_MAX_ENTRIES, BOOT_MAX_MEMBERSHIP_BYTES);
  if (afterBoot !== beforeBoot) fail('boot membership changed');
  const frame = validateV4DependencyTrees(mirror, boot, receipt, expected);
  assertStableTree(leveldbRoot, leveldb);
  assertStableTree(mirrorRoot, mirror);
  assertStableTree(bootRoot, boot);
  const leveldbReceiptAfter = pinnedFile(leveldbReceiptPath, LEVELDB_RECEIPT_MAX_BYTES,
    leveldbExpected.receiptSha256Hex);
  if (!same(leveldbReceiptBefore.stat, leveldbReceiptAfter.stat)
      || !leveldbReceiptBefore.bytes.equals(leveldbReceiptAfter.bytes)) fail('LevelDB receipt changed');
  const receiptAfter = pinnedFile(receiptPath, RECEIPT_MAX_BYTES, expected.receiptSha256Hex);
  if (!same(receiptBefore.stat, receiptAfter.stat)
      || !receiptBefore.bytes.equals(receiptAfter.bytes)) fail('mirror receipt changed');
  const finalLock = inspectSelectedV4OrV5BuildLock(
    input.bridgeRoot, input.lockSelection);
  if (finalLock.sha256Hex !== sha256Hex
      || JSON.stringify(expectedV4BuildDependencies(finalLock.lock)) !== JSON.stringify(expected)
      || JSON.stringify(expectedV4LeveldbDependency(finalLock.lock)) !== JSON.stringify(leveldbExpected)) {
    fail('build lock changed during dependency capture');
  }
  return Object.freeze({ lockSha256Hex: sha256Hex,
    mirrorReceiptSha256Hex: expected.receiptSha256Hex,
    leveldbReceiptSha256Hex: leveldbExpected.receiptSha256Hex,
    mirror, boot, leveldb, bootJarFrameSha256Hex: frame,
    leveldbAggregateSha256Hex: leveldbFrame });
}

/** Pure path boundary for the NEW records; it does not read or authorize data. */
export function selectV6DependencyPathsNonAuthorizing(
  input: Readonly<V6DependencyCaptureInput>,
): V6DependencyPaths {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('\0') !== [
        'bootRoot', 'bridgeRoot', 'leveldbReceiptPath', 'leveldbRoot',
        'lockSelection', 'mavenNamespaceRoot', 'mirrorRoot', 'v6MavenSourceRoot',
      ].sort().join('\0') || input.lockSelection !== 'v6-current') {
    fail('V6 selection fields differ');
  }
  for (const value of [input.bridgeRoot, input.mavenNamespaceRoot,
    input.v6MavenSourceRoot, input.mirrorRoot, input.bootRoot,
    input.leveldbRoot, input.leveldbReceiptPath]) {
    if (typeof value !== 'string' || !isAbsolute(value)) {
      fail('V6 dependency path is not absolute');
    }
  }
  const namespaceRoot = resolve(input.mavenNamespaceRoot);
  const mirrorRoot = resolve(input.mirrorRoot);
  const bootRoot = resolve(input.bootRoot);
  const leveldbRoot = resolve(input.leveldbRoot);
  const leveldbReceiptPath = resolve(input.leveldbReceiptPath);
  const mavenSourceRoot = resolve(input.v6MavenSourceRoot);
  if (!samePath(dirname(leveldbRoot), namespaceRoot)
      || !samePath(leveldbRoot, resolve(namespaceRoot, 'gitlab-leveldb-file-repo-01'))
      || !samePath(leveldbReceiptPath, leveldbRoot + '.json')
      || rootsOverlap(mirrorRoot, namespaceRoot)
      || rootsOverlap(mirrorRoot, bootRoot)
      || rootsOverlap(mirrorRoot, leveldbRoot)
      || rootsOverlap(bootRoot, leveldbRoot)
      || rootsOverlap(mavenSourceRoot, namespaceRoot)
      || rootsOverlap(mavenSourceRoot, mirrorRoot)
      || rootsOverlap(mavenSourceRoot, bootRoot)
      || rootsOverlap(mavenSourceRoot, leveldbRoot)
      || rootsOverlap(input.bridgeRoot, namespaceRoot)
      || rootsOverlap(input.bridgeRoot, mirrorRoot)
      || rootsOverlap(input.bridgeRoot, bootRoot)
      || rootsOverlap(input.bridgeRoot, leveldbRoot)
      || rootsOverlap(input.bridgeRoot, mavenSourceRoot)) {
    fail('V6 dependency roots or selected LevelDB receipt differ');
  }
  return Object.freeze({
    namespaceRoot, mirrorRoot, bootRoot, leveldbRoot,
    leveldbReceiptPath, mavenSourceRoot,
    leveldbTerminalPath: resolve(namespaceRoot, 'gitlab-leveldb-owner-terminal-01.json'),
    mavenReportPath: resolve(namespaceRoot, 'maven-public-cache-reattest-01.json'),
    mavenTerminalPath: resolve(namespaceRoot, 'maven-public-cache-reattest-terminal-01.json'),
  });
}

function parseV6LeveldbOwnerTerminal(
  bytes: Buffer, lock: Readonly<V6CurrentNodeBuildLock>,
): Readonly<{ receiptBytes: number }> {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    fail('V6 LevelDB terminal encoding differs');
  }
  const value = parseStrictJson(text, 'V6 LevelDB owner terminal');
  if (JSON.stringify(value) + '\n' !== text) fail('V6 LevelDB terminal JSON differs');
  const terminal = exactKeys(value, [
    'schema', 'ownerSourceSha256Hex', 'producerSourceSha256Hex',
    'jobRunnerSha256Hex', 'receiptSha256Hex', 'receiptBytes',
    'jobOwnerExitCode', 'jobClosedByPinnedOwner', 'sourceOnly',
    'resolverExecuted', 'buildExecuted', 'campaignAdmitted',
    'externalAcceptanceEstablished',
  ], 'V6 LevelDB owner terminal');
  if (terminal.schema !== 'bridge-v6-leveldb-overlay-owner-terminal-v1'
      || terminal.ownerSourceSha256Hex
        !== 'b14e794d933f414afb36f7fa8110c56b94690d67ccaaf157509991c870f56cd2'
      || terminal.producerSourceSha256Hex
        !== '8abb46bf96316fb5aaa0584e0dc7ede93f548f8a291ae741b661ed31921e0985'
      || terminal.jobRunnerSha256Hex !== lock.windowsJobProcessRunnerSha256
      || terminal.receiptSha256Hex !== lock.ownedGitlabLeveldbReceiptSha256
      || typeof terminal.receiptBytes !== 'number'
      || !Number.isSafeInteger(terminal.receiptBytes)
      || terminal.receiptBytes <= 0 || terminal.receiptBytes > LEVELDB_RECEIPT_MAX_BYTES
      || terminal.jobOwnerExitCode !== 0 || terminal.jobClosedByPinnedOwner !== true
      || terminal.sourceOnly !== true || terminal.resolverExecuted !== false
      || terminal.buildExecuted !== false || terminal.campaignAdmitted !== false
      || terminal.externalAcceptanceEstablished !== false) {
    fail('V6 LevelDB owner claims or lineage differ');
  }
  return Object.freeze({ receiptBytes: terminal.receiptBytes });
}

function samePinnedFile(
  before: Readonly<{ bytes: Buffer; stat: BigIntStats }>,
  after: Readonly<{ bytes: Buffer; stat: BigIntStats }>, label: string,
): void {
  if (!same(before.stat, after.stat) || !before.bytes.equals(after.bytes)) {
    fail(label + ' changed during V6 dependency capture');
  }
}

/** Source-only V6 capture; old V4/V5 sibling-receipt behavior is separate. */
export async function captureV6BuildDependencies(
  input: Readonly<V6DependencyCaptureInput>,
): Promise<V6DependencyCapture> {
  const paths = selectV6DependencyPathsNonAuthorizing(input);
  const selected = inspectSelectedV6OrLegacyBuildLock(input.bridgeRoot, 'v6-current');
  if (selected.lock.schemaVersion !== 6) fail('V6 selected lock differs');
  const lock = selected.lock as V6CurrentNodeBuildLock;
  const selectedLockPath = resolve(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH);
  const lockBefore = pinnedFile(selectedLockPath, 4096, V6_NODE_BUILD_LOCK_SHA256_HEX);
  const currentBridgePins = [
    ['solidity/package-lock.json', lock.currentBridgeLockSha256['package-lock.json']],
    ['solidity/compiled/build-manifest.json', lock.currentBridgeLockSha256['build-manifest.json']],
    ['sources/consensus-source-lock.json', lock.currentBridgeLockSha256['consensus-source-lock.json']],
  ] as const;
  const bridgeBefore = currentBridgePins.map(([relative, digest]) => pinnedFile(
    resolve(input.bridgeRoot, ...relative.split('/')), 65_536, digest));
  const expected: V4DependencyExpected = Object.freeze({
    receiptSha256Hex: lock.ownedMavenMirrorReceiptSha256,
    mirrorMetadataSha256Hex: lock.ownedMavenMirrorMetadataSha256,
    mirrorAggregateSha256Hex: lock.ownedMavenMirrorAggregateSha256,
    mirrorDirectoryCount: lock.ownedMavenMirrorDirectoryCount,
    mirrorFileCount: lock.ownedMavenMirrorFileCount,
    mirrorBytes: lock.ownedMavenMirrorBytes,
    bootJarFrameSha256Hex: lock.ownedBootJarFrameSha256,
    bootJarCount: lock.ownedBootJarCount,
    bootJarBytes: lock.ownedBootJarBytes,
    bootDirectoryCount: lock.ownedBootDirectoryCount,
  });
  const leveldbExpected: V4LeveldbExpected = Object.freeze({
    receiptSha256Hex: lock.ownedGitlabLeveldbReceiptSha256,
    aggregateSha256Hex: lock.ownedGitlabLeveldbAggregateSha256,
    directoryCount: lock.ownedGitlabLeveldbDirectoryCount,
    fileCount: lock.ownedGitlabLeveldbFileCount,
    bytes: lock.ownedGitlabLeveldbBytes,
    coordinate: lock.ownedGitlabLeveldbCoordinate,
  });
  const mavenTerminalBefore = pinnedFile(paths.mavenTerminalPath, 4096,
    lock.v6MavenTerminalSha256);
  const mavenReportBefore = pinnedFile(paths.mavenReportPath, RECEIPT_MAX_BYTES,
    expected.receiptSha256Hex);
  const leveldbTerminalBefore = pinnedFile(paths.leveldbTerminalPath, 4096,
    lock.v6LeveldbTerminalSha256);
  const selectedLeveldbTerminal = parseV6LeveldbOwnerTerminal(leveldbTerminalBefore.bytes, lock);
  const leveldbReceiptBefore = pinnedFile(paths.leveldbReceiptPath,
    LEVELDB_RECEIPT_MAX_BYTES, leveldbExpected.receiptSha256Hex);
  if (leveldbReceiptBefore.bytes.length !== selectedLeveldbTerminal.receiptBytes) {
    fail('V6 LevelDB terminal and receipt bytes differ');
  }
  const leveldbReceipt = parseV4LeveldbReceipt(leveldbReceiptBefore.bytes, leveldbExpected);
  const parsed: V6MavenCacheParsed = inspectV6PublicMavenCache({
    namespaceRoot: paths.namespaceRoot, sourceRoot: paths.mavenSourceRoot,
    mirrorRoot: paths.mirrorRoot,
    expectedTerminalSha256Hex: lock.v6MavenTerminalSha256,
  });
  if (parsed.reportSha256Hex !== expected.receiptSha256Hex
      || parsed.terminalSha256Hex !== lock.v6MavenTerminalSha256
      || parsed.sourceOnly !== true || parsed.gitHeadBound !== false
      || parsed.campaignAdmitted !== false) {
    fail('V6 Maven record selection differs');
  }
  const beforeLeveldb = await inspectMembership(paths.leveldbRoot, LEVELDB_MAX_ENTRIES,
    LEVELDB_MAX_MEMBERSHIP_BYTES);
  const leveldb = scanV4DirectDependencyTree(paths.leveldbRoot, LEVELDB_MAX_ENTRIES,
    leveldbExpected.bytes, LEVELDB_MAX_MEMBERSHIP_BYTES);
  if (leveldb.membership !== beforeLeveldb
      || await inspectMembership(paths.leveldbRoot, LEVELDB_MAX_ENTRIES,
        LEVELDB_MAX_MEMBERSHIP_BYTES) !== beforeLeveldb) {
    fail('V6 LevelDB membership changed');
  }
  const leveldbFrame = validateV4LeveldbTree(leveldb, leveldbReceipt, leveldbExpected);
  const beforeMirror = await inspectMembership(paths.mirrorRoot, MIRROR_MAX_ENTRIES,
    MIRROR_MAX_MEMBERSHIP_BYTES);
  const mirror = scanV4DirectDependencyTree(paths.mirrorRoot, MIRROR_MAX_ENTRIES,
    expected.mirrorBytes, MIRROR_MAX_MEMBERSHIP_BYTES);
  if (mirror.membership !== beforeMirror
      || await inspectMembership(paths.mirrorRoot, MIRROR_MAX_ENTRIES,
        MIRROR_MAX_MEMBERSHIP_BYTES) !== beforeMirror) {
    fail('V6 Maven membership changed');
  }
  if (mirror.rootIdentity !== parsed.mirrorRootIdentity
      || mirror.directorySha256Hex !== lock.v6MavenDirectorySha256
      || mirror.fileMembershipSha256Hex !== lock.v6MavenMembershipSha256
      || mirror.metadataSha256Hex !== expected.mirrorMetadataSha256Hex
      || mirror.files.length !== parsed.files.length) {
    fail('V6 Maven physical join differs');
  }
  for (let index = 0; index < mirror.files.length; index++) {
    const actual = mirror.files[index]!;
    const recorded = parsed.files[index]!;
    if (actual.path !== recorded.path || actual.size !== recorded.size
        || actual.sha256Hex !== recorded.sha256Hex) {
      fail('V6 Maven physical file differs from selected report');
    }
  }
  const beforeBoot = await inspectMembership(paths.bootRoot, BOOT_MAX_ENTRIES,
    BOOT_MAX_MEMBERSHIP_BYTES);
  const boot = scanV4DirectDependencyTree(paths.bootRoot, BOOT_MAX_ENTRIES,
    expected.bootJarBytes, BOOT_MAX_MEMBERSHIP_BYTES);
  if (boot.membership !== beforeBoot
      || await inspectMembership(paths.bootRoot, BOOT_MAX_ENTRIES,
        BOOT_MAX_MEMBERSHIP_BYTES) !== beforeBoot) {
    fail('V6 boot membership changed');
  }
  const mirrorReceipt: MirrorReceipt = Object.freeze({
    directorySha256: lock.v6MavenDirectorySha256,
    fileMembershipSha256: lock.v6MavenMembershipSha256,
    files: parsed.files,
  });
  const frame = validateV4DependencyTrees(mirror, boot, mirrorReceipt, expected);
  assertStableTree(paths.leveldbRoot, leveldb);
  assertStableTree(paths.mirrorRoot, mirror);
  assertStableTree(paths.bootRoot, boot);
  samePinnedFile(mavenTerminalBefore, pinnedFile(paths.mavenTerminalPath, 4096,
    lock.v6MavenTerminalSha256), 'V6 Maven terminal');
  samePinnedFile(mavenReportBefore, pinnedFile(paths.mavenReportPath, RECEIPT_MAX_BYTES,
    expected.receiptSha256Hex), 'V6 Maven report');
  samePinnedFile(leveldbReceiptBefore, pinnedFile(paths.leveldbReceiptPath,
    LEVELDB_RECEIPT_MAX_BYTES, leveldbExpected.receiptSha256Hex), 'V6 LevelDB receipt');
  samePinnedFile(leveldbTerminalBefore, pinnedFile(paths.leveldbTerminalPath, 4096,
    lock.v6LeveldbTerminalSha256), 'V6 LevelDB terminal');
  samePinnedFile(lockBefore, pinnedFile(selectedLockPath, 4096,
    V6_NODE_BUILD_LOCK_SHA256_HEX), 'V6 selected lock');
  for (let index = 0; index < currentBridgePins.length; index++) {
    const [relative, digest] = currentBridgePins[index]!;
    samePinnedFile(bridgeBefore[index]!, pinnedFile(
      resolve(input.bridgeRoot, ...relative.split('/')), 65_536, digest),
    'current Bridge lock');
  }
  const finalLock = inspectSelectedV6OrLegacyBuildLock(input.bridgeRoot, 'v6-current');
  if (finalLock.sha256Hex !== selected.sha256Hex) {
    fail('V6 selected lock changed during dependency capture');
  }
  return Object.freeze({
    lockSha256Hex: selected.sha256Hex,
    mirrorReceiptSha256Hex: expected.receiptSha256Hex,
    leveldbReceiptSha256Hex: leveldbExpected.receiptSha256Hex,
    mirror, boot, leveldb,
    bootJarFrameSha256Hex: frame,
    leveldbAggregateSha256Hex: leveldbFrame,
    sourceOnly: true as const, campaignAdmitted: false as const,
    mavenTerminalSha256Hex: lock.v6MavenTerminalSha256,
    leveldbTerminalSha256Hex: lock.v6LeveldbTerminalSha256,
  });
}
