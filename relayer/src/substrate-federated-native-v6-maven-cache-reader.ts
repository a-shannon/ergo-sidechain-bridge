import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync,
  readdirSync, realpathSync, type BigIntStats,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { parseStrictJson } from './strict-json.js';

const REPORT_NAME = 'maven-public-cache-reattest-01.json';
const ENTRY_NAME = 'maven-public-cache-reattest-entry-01.json';
const CHILD_NAME = 'maven-public-cache-reattest-child-01.json';
const TERMINAL_NAME = 'maven-public-cache-reattest-terminal-01.json';
const OWNER_SHA256 = 'e2817b133f9f4817f71675bbd425cde8ffa66607afe3010d893d6d008777edf9';
const ATTESTOR_SHA256 = 'a24a57d6c9e5b05a7dba1b5adb7a790a1ff6be38d64e6716f88e57d9bd1d2ae4';
const FILE_COUNT = 12_341;
const DIRECTORY_COUNT = 2_267;
const BYTE_COUNT = 1_095_267_211;
const DIRECTORY_SHA256 = 'bba23576b6b5ce18ba29e6f8ada1b93527a7669bd29cc9768769862a6e5fe056';
const MEMBERSHIP_SHA256 = '857087b354ce8e6086a95f0bf8353107bcd1199dd2efe5d4966a80ae31bbdd03';
const AGGREGATE_SHA256 = '1589db441eb484bced7f97afd688480c2928bab8f28b4f485dde2ce327c29880';
const MAX_REPORT_BYTES = 2_500_000;
const MAX_FILE_BYTES = 268_435_456;
const SUFFIX_COUNTS = Object.freeze({
  '.checked': 2_519, '.computed': 2_265, '.pom': 1_369,
  '.pom__md5': 1_369, '.pom__sha1': 1_369,
  '.jar': 1_148, '.jar__md5': 1_148, '.jar__sha1': 1_148,
  '.xml': 2, '.xml__md5': 2, '.xml__sha1': 2,
});
const LOCK_SHA256 = Object.freeze({
  'package-lock.json': '362649c5f11096f2ce5511057fafb93352bd21934098c3e81d6f8644d894b557',
  'build-manifest.json': '312eb0fee01f3ca8ae4da4bc84dafcb5fee381b691143c44ec9f27f6a0199c43',
  'consensus-source-lock.json': '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
});

export interface V6MavenCacheExpected {
  readonly namespaceRoot: string;
  readonly sourceRoot: string;
  readonly mirrorRoot: string;
  readonly reportPath: string;
  readonly terminalSha256Hex: string;
  readonly ownerSha256Hex: string;
  readonly attestorSha256Hex: string;
  readonly lockSha256: Readonly<Record<string, string>>;
  readonly directoryCount: number;
  readonly fileCount: number;
  readonly byteCount: number;
  readonly directorySha256Hex: string;
  readonly membershipSha256Hex: string;
  readonly aggregateSha256Hex: string;
  readonly suffixCounts: Readonly<Record<string, number>>;
}

export interface V6MavenCacheTexts {
  readonly entryText: string;
  readonly childText: string;
  readonly terminalText: string | undefined;
  readonly reportText: string;
}

export interface V6MavenCacheParsed {
  readonly reportSha256Hex: string;
  readonly terminalSha256Hex: string;
  /** Win32 FileID reported by the owner; its same-provider verification is external. */
  readonly attestationPhysicalIdentity: string;
  readonly mirrorRootIdentity: string;
  readonly sourceRootIdentity: string;
  readonly files: readonly Readonly<{ path: string; size: number; sha256Hex: string }>[];
  readonly sourceOnly: true;
  readonly gitHeadBound: false;
  readonly campaignAdmitted: false;
}

export interface V6MavenCacheReadInput {
  readonly namespaceRoot: string;
  readonly sourceRoot: string;
  readonly mirrorRoot: string;
  readonly expectedTerminalSha256Hex: string;
}

export interface V6MavenDirectTree {
  readonly rootIdentity: string;
  readonly directories: readonly string[];
  readonly files: readonly Readonly<{ path: string; size: number; sha256Hex: string }>[];
  readonly bytes: number;
  readonly directorySha256Hex: string;
  readonly fileMembershipSha256Hex: string;
  readonly metadataSha256Hex: string;
  readonly membership: string;
  readonly identities: ReadonlyMap<string, string>;
}

function fail(message: string): never {
  throw new Error('V6 public Maven cache: ' + message);
}
function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}
function ordinal(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}
function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}
function rootsOverlap(left: string, right: string): boolean {
  const a = resolve(left).toLowerCase();
  const b = resolve(right).toLowerCase();
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}
function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(label + ' fields differ');
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
      || actual.some((key, index) => key !== expected[index])) {
    fail(label + ' fields differ');
  }
  return value as Record<string, unknown>;
}
function decimal(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(label + ' decimal differs');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(label + ' decimal exceeds safe range');
  return parsed;
}
function identityShape(value: unknown, parts: number, label: string): string {
  if (typeof value !== 'string'
      || value.split(':').length !== parts
      || value.split(':').some(part => !/^(?:0|[1-9][0-9]*)$/u.test(part))) {
    fail(label + ' identity shape differs');
  }
  return value;
}
function safeRelative(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.includes('\\')
    && value.split('/').every(piece => piece.length > 0 && piece !== '.' && piece !== '..'
      && /^[\x21-\x7e]+$/u.test(piece) && !/[<>:"|?*\\/]/u.test(piece)
      && !/[. ]$/u.test(piece)
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(piece));
}
function strictText(text: string | undefined, label: string, maxBytes: number): Record<string, unknown> {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') <= 0
      || Buffer.byteLength(text, 'utf8') > maxBytes || text.charCodeAt(0) === 0xfeff
      || text.includes('\r') || !text.endsWith('\n')) {
    fail(label + ' encoding or size differs');
  }
  const parsed = parseStrictJson(text, label);
  if (JSON.stringify(parsed) + '\n' !== text) fail(label + ' producer JSON differs');
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(label + ' must be an object');
  }
  return parsed as Record<string, unknown>;
}
/** Keeps a UTF-8 BOM visible so all four new records can reject it explicitly. */
export function decodeV6RecordBytes(bytes: Uint8Array, label: string): string {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) fail(label + ' BOM differs');
  return text;
}
function identity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size,
    stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
}
function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return identity(left) === identity(right);
}
function directDirectory(path: string): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || !samePath(realpathSync.native(path), path)) fail('directory is indirect');
  return stat;
}
function directAncestors(path: string): void {
  for (let cursor = path;; cursor = dirname(cursor)) {
    directDirectory(cursor);
    if (dirname(cursor) === cursor) return;
  }
}
function snapshotAncestors(path: string): ReadonlyMap<string, string> {
  const snapshots = new Map<string, string>();
  for (let cursor = path;; cursor = dirname(cursor)) {
    snapshots.set(cursor, identity(directDirectory(cursor)));
    if (dirname(cursor) === cursor) return snapshots;
  }
}
function assertAncestors(snapshots: ReadonlyMap<string, string>): void {
  for (const [path, pin] of snapshots) {
    if (identity(directDirectory(path)) !== pin) fail('mirror ancestor changed');
  }
}
export function assertV6DirectRecordShape(
  stat: Readonly<{ isFile(): boolean; isSymbolicLink(): boolean; nlink: bigint }>,
): void {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) {
    fail('record is indirect or multiply linked');
  }
}
function readDirectRecord(path: string, maximumBytes: number): Buffer {
  directAncestors(dirname(path));
  const before = lstatSync(path, { bigint: true });
  assertV6DirectRecordShape(before);
  if (before.size <= 0n || before.size > BigInt(maximumBytes)
      || !samePath(realpathSync.native(path), path)) fail('record size or path differs');
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameStat(before, opened)) fail('record changed before read');
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) fail('record shortened during read');
      offset += count;
    }
    const trailing = Buffer.alloc(1);
    if (readSync(descriptor, trailing, 0, 1, bytes.length) !== 0
        || !sameStat(opened, fstatSync(descriptor, { bigint: true }))
        || !sameStat(opened, lstatSync(path, { bigint: true }))) {
      fail('record changed during read');
    }
    directAncestors(dirname(path));
    return bytes;
  } finally { closeSync(descriptor); }
}
function fileFrame(files: readonly Readonly<{ path: string; size: number; sha256Hex: string }>[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(Buffer.from(file.path, 'utf8')).update(Buffer.from([0]))
      .update(String(file.size)).update(Buffer.from([0]))
      .update(file.sha256Hex).update('\n');
  }
  return hash.digest('hex');
}
function nameHash(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(Buffer.from(path, 'utf8')).update(Buffer.from([0]));
  return hash.digest('hex');
}
function streamMirrorFile(path: string, cap: number): Readonly<{
  size: number; sha256Hex: string; stat: BigIntStats;
}> {
  if (cap < 0 || cap > MAX_FILE_BYTES) fail('mirror file cap differs');
  const before = lstatSync(path, { bigint: true });
  assertV6DirectRecordShape(before);
  if (before.size > BigInt(cap) || !samePath(realpathSync.native(path), path)) {
    fail('mirror file size or path differs');
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let size = 0;
  try {
    if (!sameStat(before, fstatSync(descriptor, { bigint: true }))) {
      fail('mirror file changed before read');
    }
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(65_536);
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      size += count;
      if (size > cap || size > Number(before.size)) fail('mirror file grew during read');
      hash.update(chunk.subarray(0, count));
    }
    if (!sameStat(before, fstatSync(descriptor, { bigint: true }))) {
      fail('mirror file changed during read');
    }
    if (size !== Number(before.size) || !sameStat(before, lstatSync(path, { bigint: true }))) {
      fail('mirror file path changed after read');
    }
    return Object.freeze({ size, sha256Hex: hash.digest('hex'), stat: before });
  } finally { closeSync(descriptor); }
}
/** One content pass through the selected direct public cache; no old receipt is opened. */
export function scanV6DirectMavenTree(
  root: string, maxEntries: number, maxBytes: number, maxMembershipBytes: number,
): V6MavenDirectTree {
  if (!isAbsolute(root) || resolve(root) !== root || maxEntries <= 0 || maxEntries > 20_000
      || maxBytes <= 0 || maxBytes > 1_200_000_000
      || maxMembershipBytes <= 0 || maxMembershipBytes > 4_194_304) {
    fail('mirror root or caps differ');
  }
  const ancestors = snapshotAncestors(root);
  const directories: string[] = [];
  const files: Array<Readonly<{ path: string; size: number; sha256Hex: string }>> = [];
  const rows: Array<readonly [string, string]> = [];
  const identities = new Map<string, string>();
  const membership: string[] = [];
  const folded = new Set<string>();
  let bytes = 0;
  const visit = (absolute: string, relative: string, depth: number): void => {
    if (depth > 64) fail('mirror depth cap exceeded');
    const before = directDirectory(absolute);
    identities.set(relative, identity(before));
    rows.push([relative, ['d', relative, before.dev, before.ino, before.nlink,
      before.size, before.mtimeNs, before.ctimeNs, before.birthtimeNs].join('\0')]);
    if (relative) directories.push(relative);
    if (directories.length + files.length > maxEntries) fail('mirror entry cap exceeded');
    for (const name of readdirSync(absolute).sort(ordinal)) {
      const child = relative ? relative + '/' + name : name;
      if (!safeRelative(child) || folded.has(child.toLowerCase())) {
        fail('mirror path or case collision');
      }
      folded.add(child.toLowerCase());
      const selected = resolve(absolute, name);
      if (!selected.toLowerCase().startsWith((root + sep).toLowerCase())) {
        fail('mirror path escapes root');
      }
      const stat = lstatSync(selected, { bigint: true });
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        membership.push('D\t' + child + '\n');
        visit(selected, child, depth + 1);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        const file = streamMirrorFile(selected, Math.min(MAX_FILE_BYTES, maxBytes - bytes));
        if (!sameStat(stat, file.stat)) fail('mirror file changed before open');
        files.push(Object.freeze({ path: child, size: file.size, sha256Hex: file.sha256Hex }));
        identities.set(child, identity(file.stat));
        rows.push([child, ['f', child, file.stat.dev, file.stat.ino, file.stat.nlink,
          file.stat.size, file.stat.mtimeNs, file.stat.ctimeNs, file.stat.birthtimeNs].join('\0')]);
        membership.push('F\t' + child + '\n');
        bytes += file.size;
      } else fail('mirror entry is indirect or unsupported');
      if (directories.length + files.length > maxEntries || bytes > maxBytes) {
        fail('mirror count or byte cap exceeded');
      }
    }
    if (!sameStat(before, directDirectory(absolute))) fail('mirror directory changed');
  };
  visit(root, '', 0);
  assertAncestors(ancestors);
  directories.sort(ordinal);
  files.sort((a, b) => ordinal(a.path, b.path));
  rows.sort((a, b) => ordinal(a[0], b[0]));
  const fullMembership = membership.sort(ordinal).join('');
  if (Buffer.byteLength(fullMembership, 'utf8') > maxMembershipBytes) {
    fail('mirror membership cap exceeded');
  }
  return Object.freeze({
    rootIdentity: ancestors.get(root)!,
    directories: Object.freeze(directories),
    files: Object.freeze(files), bytes,
    directorySha256Hex: nameHash(directories),
    fileMembershipSha256Hex: nameHash(files.map(file => file.path)),
    metadataSha256Hex: sha256(rows.map(row => row[1]).join('\n') + '\n'),
    membership: fullMembership, identities,
  });
}
/** Parses the producer records. This result has no Git, build, or campaign authority. */
export function parseV6MavenCacheRecordsNonAuthorizing(
  texts: Readonly<V6MavenCacheTexts>, expected: Readonly<V6MavenCacheExpected>,
): V6MavenCacheParsed {
  if (!hex(expected.terminalSha256Hex) || !hex(expected.ownerSha256Hex)
      || !hex(expected.attestorSha256Hex) || !isAbsolute(expected.namespaceRoot)
      || !isAbsolute(expected.mirrorRoot) || !isAbsolute(expected.sourceRoot)
      || !samePath(expected.reportPath, resolve(expected.namespaceRoot, REPORT_NAME))
      || samePath(expected.reportPath, expected.mirrorRoot + '.json')
      || rootsOverlap(expected.namespaceRoot, expected.mirrorRoot)
      || rootsOverlap(expected.namespaceRoot, expected.sourceRoot)
      || rootsOverlap(expected.sourceRoot, expected.mirrorRoot)) {
    fail('selected paths or pins differ');
  }
  const terminal = strictText(texts.terminalText, 'terminal', 4_096);
  if (sha256(Buffer.from(texts.terminalText!, 'utf8')) !== expected.terminalSha256Hex) {
    fail('selected terminal digest differs');
  }
  exact(terminal, ['schema', 'entrySha256Hex', 'childIdentitySha256Hex',
    'attestationSha256Hex', 'attestationBytes', 'attestationPhysicalIdentity',
    'jobOwnerExitCode', 'jobClosedByPinnedOwner', 'sourceOnly', 'oldReceiptRead',
    'gitHeadBound', 'independentMirrorRecaptureComplete', 'campaignAdmitted',
    'externalAcceptanceEstablished'], 'terminal');
  if (terminal.schema !== 'bridge-v6-public-maven-reattest-owner-terminal-v1'
      || terminal.jobOwnerExitCode !== 0 || terminal.jobClosedByPinnedOwner !== true
      || terminal.sourceOnly !== true || terminal.oldReceiptRead !== false
      || terminal.gitHeadBound !== false
      || terminal.independentMirrorRecaptureComplete !== false
      || terminal.campaignAdmitted !== false || terminal.externalAcceptanceEstablished !== false
      || !hex(terminal.entrySha256Hex) || !hex(terminal.childIdentitySha256Hex)
      || !hex(terminal.attestationSha256Hex)
      || typeof terminal.attestationBytes !== 'number'
      || !Number.isSafeInteger(terminal.attestationBytes)
      || terminal.attestationBytes <= 0 || terminal.attestationBytes > MAX_REPORT_BYTES) {
    fail('terminal claims differ');
  }
  const attestationPhysicalIdentity =
    identityShape(terminal.attestationPhysicalIdentity, 4, 'terminal FileID');
  const entry = strictText(texts.entryText, 'entry', 2_048);
  const child = strictText(texts.childText, 'child', 2_048);
  const report = strictText(texts.reportText, 'attestation', MAX_REPORT_BYTES);
  if (sha256(Buffer.from(texts.entryText, 'utf8')) !== terminal.entrySha256Hex
      || sha256(Buffer.from(texts.childText, 'utf8')) !== terminal.childIdentitySha256Hex
      || sha256(Buffer.from(texts.reportText, 'utf8')) !== terminal.attestationSha256Hex
      || Buffer.byteLength(texts.reportText, 'utf8') !== terminal.attestationBytes) {
    fail('owner record lineage differs');
  }
  exact(entry, ['schema', 'ownerSourceSha256Hex', 'attestorSourceSha256Hex',
    'reportName', 'sourceOnly', 'campaignAdmitted'], 'entry');
  if (entry.schema !== 'bridge-v6-public-maven-reattest-owner-entry-v1'
      || entry.ownerSourceSha256Hex !== expected.ownerSha256Hex
      || entry.attestorSourceSha256Hex !== expected.attestorSha256Hex
      || entry.reportName !== REPORT_NAME || entry.sourceOnly !== true
      || entry.campaignAdmitted !== false) fail('entry claims differ');
  exact(child, ['schema', 'entrySha256Hex', 'processName', 'processId',
    'creationDateUtc', 'sameProvider', 'campaignAdmitted'], 'child');
  if (child.schema !== 'bridge-v6-public-maven-reattest-child-identity-v1'
      || child.entrySha256Hex !== terminal.entrySha256Hex
      || child.processName !== 'powershell.exe'
      || typeof child.processId !== 'number' || !Number.isSafeInteger(child.processId)
      || child.processId <= 0
      || typeof child.creationDateUtc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/u.test(child.creationDateUtc)
      || child.sameProvider !== 'Win32_Process' || child.campaignAdmitted !== false) {
    fail('child identity claims differ');
  }
  exact(report, ['schema', 'sourceRoot', 'mirrorRoot', 'sourceRootIdentity',
    'mirrorRootIdentity', 'directoryCount', 'directorySha256', 'fileCount',
    'fileMembershipSha256', 'byteCount', 'suffixCounts', 'aggregateSha256',
    'files', 'currentBridgeLockSha256', 'sourceStableBeforeAfter',
    'mirrorStableBeforeAfter', 'sourceMirrorBytesEqual', 'reusedPublicCacheData',
    'oldReceiptRead', 'resolverExecuted', 'campaignAdmitted',
    'externalAcceptanceEstablished'], 'attestation');
  if (report.schema !== 'bridge-v6-public-maven-cache-reattest-v1'
      || typeof report.sourceRoot !== 'string'
      || !samePath(report.sourceRoot, expected.sourceRoot)
      || typeof report.mirrorRoot !== 'string'
      || !samePath(report.mirrorRoot, expected.mirrorRoot)
      || report.sourceStableBeforeAfter !== true || report.mirrorStableBeforeAfter !== true
      || report.sourceMirrorBytesEqual !== true || report.reusedPublicCacheData !== true
      || report.oldReceiptRead !== false || report.resolverExecuted !== false
      || report.campaignAdmitted !== false || report.externalAcceptanceEstablished !== false
      || report.directoryCount !== expected.directoryCount
      || report.fileCount !== expected.fileCount
      || decimal(report.byteCount, 'attestation bytes') !== expected.byteCount
      || report.directorySha256 !== expected.directorySha256Hex
      || report.fileMembershipSha256 !== expected.membershipSha256Hex
      || report.aggregateSha256 !== expected.aggregateSha256Hex) {
    fail('attestation claims or geometry differ');
  }
  const sourceRootIdentity = identityShape(report.sourceRootIdentity, 8, 'source root');
  const mirrorRootIdentity = identityShape(report.mirrorRootIdentity, 8, 'mirror root');
  const locks = exact(report.currentBridgeLockSha256,
    Object.keys(expected.lockSha256), 'current Bridge locks');
  for (const [name, digest] of Object.entries(expected.lockSha256)) {
    if (!hex(digest) || locks[name] !== digest) fail('current Bridge lock differs');
  }
  const suffix = exact(report.suffixCounts, Object.keys(expected.suffixCounts), 'suffix counts');
  for (const [name, count] of Object.entries(expected.suffixCounts)) {
    if (!Number.isSafeInteger(count) || count < 0 || suffix[name] !== count) {
      fail('suffix count differs');
    }
  }
  if (!Array.isArray(report.files) || report.files.length !== expected.fileCount) {
    fail('attestation file count differs');
  }
  const rows: Array<Readonly<{ path: string; size: number; sha256Hex: string }>> = [];
  const folded = new Set<string>();
  const actualSuffix = Object.fromEntries(Object.keys(expected.suffixCounts)
    .map(name => [name, 0])) as Record<string, number>;
  let prior = '';
  let total = 0;
  const membership = createHash('sha256');
  for (const value of report.files) {
    const row = exact(value, ['path', 'size', 'sha256'], 'attestation file');
    if (typeof row.path !== 'string' || !safeRelative(row.path)
        || (prior && ordinal(prior, row.path) >= 0)
        || folded.has(row.path.toLowerCase()) || !hex(row.sha256)) {
      fail('attestation file path or digest differs');
    }
    const size = decimal(row.size, 'attestation file size');
    if (size > MAX_FILE_BYTES) fail('attestation file exceeds cap');
    const selected = Object.keys(expected.suffixCounts).find(
      name => (row.path as string).endsWith(name));
    if (!selected) fail('attestation file suffix differs');
    actualSuffix[selected] = (actualSuffix[selected] ?? 0) + 1;
    membership.update(Buffer.from(row.path, 'utf8')).update(Buffer.from([0]));
    rows.push(Object.freeze({ path: row.path, size, sha256Hex: row.sha256 }));
    total += size;
    if (total > expected.byteCount) fail('attestation byte cap exceeded');
    prior = row.path;
    folded.add(row.path.toLowerCase());
  }
  if (total !== expected.byteCount
      || membership.digest('hex') !== expected.membershipSha256Hex
      || fileFrame(rows) !== expected.aggregateSha256Hex) {
    fail('attestation file aggregate differs');
  }
  for (const [name, count] of Object.entries(expected.suffixCounts)) {
    if (actualSuffix[name] !== count) fail('attestation suffix aggregate differs');
  }
  return Object.freeze({
    reportSha256Hex: terminal.attestationSha256Hex,
    terminalSha256Hex: expected.terminalSha256Hex,
    attestationPhysicalIdentity,
    mirrorRootIdentity, sourceRootIdentity,
    files: Object.freeze(rows),
    sourceOnly: true as const, gitHeadBound: false as const,
    campaignAdmitted: false as const,
  });
}

/** Compares one physical mirror scan with the parsed public report; no Git authority follows. */
export function assertV6MavenCacheTreeNonAuthorizing(
  parsed: Readonly<V6MavenCacheParsed>, tree: Readonly<V6MavenDirectTree>,
  expected: Readonly<V6MavenCacheExpected>,
): void {
  if (tree.rootIdentity !== parsed.mirrorRootIdentity
      || tree.directories.length !== expected.directoryCount
      || tree.files.length !== expected.fileCount || tree.bytes !== expected.byteCount
      || tree.directorySha256Hex !== expected.directorySha256Hex
      || tree.fileMembershipSha256Hex !== expected.membershipSha256Hex
      || tree.files.length !== parsed.files.length
      || fileFrame(tree.files) !== expected.aggregateSha256Hex) {
    fail('physical mirror geometry differs');
  }
  for (let index = 0; index < tree.files.length; index++) {
    const actual = tree.files[index]!;
    const recorded = parsed.files[index]!;
    if (actual.path !== recorded.path || actual.size !== recorded.size
        || actual.sha256Hex !== recorded.sha256Hex) fail('physical mirror file differs');
  }
}

function assertMirrorMetadataStable(root: string, tree: Readonly<V6MavenDirectTree>): void {
  directAncestors(root);
  const seen = new Set<string>();
  const folded = new Set<string>();
  const visit = (absolute: string, relative: string): void => {
    const stat = lstatSync(absolute, { bigint: true });
    const pin = tree.identities.get(relative);
    if (pin === undefined || identity(stat) !== pin || stat.isSymbolicLink()) {
      fail('mirror member identity changed');
    }
    seen.add(relative);
    if (stat.isDirectory()) {
      if (!samePath(realpathSync.native(absolute), absolute)) fail('mirror directory indirect');
      for (const name of readdirSync(absolute).sort(ordinal)) {
        const child = relative ? relative + '/' + name : name;
        if (!safeRelative(child) || folded.has(child.toLowerCase())) {
          fail('mirror membership changed');
        }
        folded.add(child.toLowerCase());
        visit(resolve(absolute, name), child);
      }
      if (identity(directDirectory(absolute)) !== pin) {
        fail('mirror directory changed after children');
      }
    } else {
      assertV6DirectRecordShape(stat);
    }
  };
  visit(root, '');
  if (seen.size !== tree.identities.size) fail('mirror member removed');
  directAncestors(root);
}

/** Reads only the four NEW V6 records and scans the selected public mirror once. */
export function inspectV6PublicMavenCache(
  input: Readonly<V6MavenCacheReadInput>,
): V6MavenCacheParsed {
  if (typeof input.namespaceRoot !== 'string' || typeof input.mirrorRoot !== 'string'
      || typeof input.sourceRoot !== 'string' || !isAbsolute(input.namespaceRoot)
      || !isAbsolute(input.mirrorRoot) || !isAbsolute(input.sourceRoot)
      || !hex(input.expectedTerminalSha256Hex)) fail('selection input differs');
  const namespaceRoot = resolve(input.namespaceRoot);
  const mirrorRoot = resolve(input.mirrorRoot);
  const sourceRoot = resolve(input.sourceRoot);
  if (rootsOverlap(namespaceRoot, mirrorRoot)
      || rootsOverlap(namespaceRoot, sourceRoot)
      || rootsOverlap(sourceRoot, mirrorRoot)) fail('selected roots overlap');
  directAncestors(namespaceRoot);
  const terminalPath = resolve(namespaceRoot, TERMINAL_NAME);
  const entryPath = resolve(namespaceRoot, ENTRY_NAME);
  const childPath = resolve(namespaceRoot, CHILD_NAME);
  const reportPath = resolve(namespaceRoot, REPORT_NAME);
  if (samePath(reportPath, mirrorRoot + '.json')) fail('historical sibling receipt is excluded');
  // A missing terminal stops before the entry or a partial report is opened.
  const terminalBytes = readDirectRecord(terminalPath, 4_096);
  if (sha256(terminalBytes) !== input.expectedTerminalSha256Hex) {
    fail('selected terminal digest differs');
  }
  const texts: V6MavenCacheTexts = {
    terminalText: decodeV6RecordBytes(terminalBytes, 'terminal'),
    entryText: decodeV6RecordBytes(readDirectRecord(entryPath, 2_048), 'entry'),
    childText: decodeV6RecordBytes(readDirectRecord(childPath, 2_048), 'child'),
    reportText: decodeV6RecordBytes(readDirectRecord(reportPath, MAX_REPORT_BYTES), 'attestation'),
  };
  const expected: V6MavenCacheExpected = {
    namespaceRoot, sourceRoot, mirrorRoot, reportPath,
    terminalSha256Hex: input.expectedTerminalSha256Hex,
    ownerSha256Hex: OWNER_SHA256, attestorSha256Hex: ATTESTOR_SHA256,
    lockSha256: LOCK_SHA256, directoryCount: DIRECTORY_COUNT,
    fileCount: FILE_COUNT, byteCount: BYTE_COUNT,
    directorySha256Hex: DIRECTORY_SHA256,
    membershipSha256Hex: MEMBERSHIP_SHA256,
    aggregateSha256Hex: AGGREGATE_SHA256, suffixCounts: SUFFIX_COUNTS,
  };
  const parsed = parseV6MavenCacheRecordsNonAuthorizing(texts, expected);
  const tree = scanV6DirectMavenTree(mirrorRoot, 14_608, BYTE_COUNT, MAX_REPORT_BYTES);
  assertV6MavenCacheTreeNonAuthorizing(parsed, tree, expected);
  assertMirrorMetadataStable(mirrorRoot, tree);
  return parsed;
}
