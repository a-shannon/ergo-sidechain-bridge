import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync,
  readFileSync, type BigIntStats,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { BoundedProcessExitError, runBoundedProcess } from './bounded-process-runner.js';
import { withPinnedV4BoundedChildTools, type V4PhysicalPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import {
  V4_GENERATED_OUTPUT_ROOTS, V4_GENERATED_OUTPUT_SCAFFOLD, validateV4PostBuildObservations,
  validateV4ResolverStageObservations,
  type V4GeneratedOutputRoot, type V4PostBuildCaps, type V4PostBuildEntry,
  type V4PostBuildObservationValidation, type V4ResolverStageObservationValidation,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

const INSPECTOR_SHA256 = 'f6d3eb3a128da2c5eb8872461a124c519e3874e9aca7f1ab999cc83b0b9f8a89';
const V5_INSPECTOR_SHA256 =
  'd1118c06eba6fea84d3850d99d8ea4353182cd2c46ba367d2432c0156e84e2ac';
const MAX_SOURCE_FILES = 1_024;
const MAX_SOURCE_DIRECTORIES = 2_048;
const MAX_SOURCE_FILE_BYTES = 33_554_432;
const MAX_SOURCE_TOTAL_BYTES = 268_435_456;
// Safety ceilings for the inspector transport, not a build-file allowance.
const MAX_INSPECTED_ENTRIES = 100_000;
const MAX_MEMBERSHIP_BYTES = 16_777_216;
const MAX_DEPTH = 64;

export interface V4PostBuildPhysicalCapture {
  readonly rootIdentity: string;
  readonly gitRootIdentity: string;
  readonly entries: readonly Readonly<V4PostBuildEntry>[];
  readonly membership: string;
}
export interface V4PostBuildCaptureInput {
  readonly sourceRoot: string;
  readonly plan: Readonly<V4PhysicalPlan>;
  readonly caps: Readonly<V4PostBuildCaps>;
  readonly phase: 'before' | 'resolver' | 'after';
  readonly maxMembershipBytes: number;
  readonly inspectorSelection?: 'v4' | 'v5-source59-after-assembly';
}

export type V4PostBuildCaptureFailureCode =
  | 'INSPECTOR_INPUT' | 'INSPECTOR_REPARSE' | 'INSPECTOR_KIND'
  | 'INSPECTOR_ENTRY_CAP' | 'INSPECTOR_MEMBERSHIP_CAP'
  | 'INSPECTOR_DEPTH' | 'INSPECTOR_NAME' | 'INSPECTOR_GIT'
  | 'INSPECTOR_OTHER' | 'INSPECTOR_AMBIGUOUS' | 'INSPECTOR_DRIFT'
  | 'INSPECTOR_OUTPUT' | 'INSPECTOR_OUTPUT_BASE64' | 'INSPECTOR_OUTPUT_BYTES'
  | 'INSPECTOR_OUTPUT_UTF8' | 'INSPECTOR_OUTPUT_FRAMING'
  | 'INSPECTOR_OUTPUT_COUNT' | 'INSPECTOR_OUTPUT_ROW'
  | 'INSPECTOR_OUTPUT_ORDER' | 'INSPECTOR_OUTPUT_PATH'
  | 'INSPECTOR_OUTPUT_CASE' | 'INSPECTOR_OUTPUT_GIT'
  | 'INSPECTOR_OUTPUT_PARENT' | 'INSPECTOR_MISMATCH'
  | 'NODE_ENTRY_CAP' | 'NODE_ROOT_FILES' | 'NODE_ROOT_DIRECTORIES'
  | 'NODE_ROOT_BYTES' | 'NODE_TOTAL_FILES' | 'NODE_TOTAL_DIRECTORIES'
  | 'NODE_TOTAL_BYTES' | 'NODE_MEMBERSHIP_CAP'
  | 'NODE_FILE_DRIFT' | 'REPARSE' | 'SOURCE_DRIFT' | 'OTHER';

export class V4PostBuildCaptureFailure extends Error {
  #constructed = true;
  readonly code: V4PostBuildCaptureFailureCode;
  constructor(reason: string, code: V4PostBuildCaptureFailureCode) {
    super('V4 post-build physical capture: ' + reason);
    this.name = 'V4PostBuildCaptureFailure';
    this.code = code;
  }
  static isConstructed(value: unknown): value is V4PostBuildCaptureFailure {
    if (value === null || (typeof value !== 'object'
        && typeof value !== 'function')) return false;
    try { return #constructed in value; } catch { return false; }
  }
}
function fail(reason: string, code: V4PostBuildCaptureFailureCode = 'OTHER'): never {
  throw new V4PostBuildCaptureFailure(reason, code);
}
const V5_INSPECTOR_CODES = new Set([
  'INPUT', 'REPARSE', 'KIND', 'ENTRY_CAP', 'MEMBERSHIP_CAP',
  'DEPTH', 'NAME', 'GIT', 'OTHER',
]);
/** Exact fixed-code classification only; raw stderr is never returned. */
export function classifyV5Source59InspectorExit(
  error: unknown,
): V4PostBuildCaptureFailureCode {
  if (!(error instanceof BoundedProcessExitError)
      || error.exitCode !== 198 || error.stdout !== '') return 'INSPECTOR_AMBIGUOUS';
  const match = /^V5_SOURCE59_POSTBUILD_([A-Z_]+)\n$/u.exec(error.stderr);
  if (!match || !V5_INSPECTOR_CODES.has(match[1]!)) return 'INSPECTOR_AMBIGUOUS';
  return ('INSPECTOR_' + match[1]) as V4PostBuildCaptureFailureCode;
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function directDirectory(path: string): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('directory is indirect', 'REPARSE');
  return stat;
}
// SBT may create children beneath a pinned source directory. The directory's mtime and
// ctime are therefore deliberately excluded; complete child membership is checked separately.
function directoryIdentity(stat: BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.nlink}`;
}
function fileSame(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function safeName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..'
    && !/[\\/:\u0000-\u001f\u007f]/u.test(name) && !/[. ]$/u.test(name)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name);
}
function safePath(path: string): boolean {
  return path.length > 0 && path.split('/').every(safeName);
}
function rootOf(path: string): V4GeneratedOutputRoot | undefined {
  if (path === V4_GENERATED_OUTPUT_SCAFFOLD) return 'project/project/target';
  return V4_GENERATED_OUTPUT_ROOTS.find(root => path === root || path.startsWith(root + '/'));
}
function assertCap(cap: Readonly<{ maxFiles: number; maxDirectories: number; maxBytes: number }>): void {
  if (!cap || !Number.isSafeInteger(cap.maxFiles) || cap.maxFiles < 0
      || !Number.isSafeInteger(cap.maxDirectories) || cap.maxDirectories < 0
      || !Number.isSafeInteger(cap.maxBytes) || cap.maxBytes < 0) fail('invalid explicit output cap');
}

/** Pure cap boundary; a code names the first exceeded selected limit. */
export function assertV4GeneratedCaptureCaps(
  local: Readonly<{ files: number; directories: number; bytes: number }>,
  total: Readonly<{ files: number; directories: number; bytes: number }>,
  rootCap: Readonly<{ maxFiles: number; maxDirectories: number; maxBytes: number }>,
  totalCap: Readonly<{ maxFiles: number; maxDirectories: number; maxBytes: number }>,
): void {
  if (![local.files, local.directories, local.bytes,
    total.files, total.directories, total.bytes].every(Number.isSafeInteger)) {
    fail('generated output count is unsafe');
  }
  if (local.files > rootCap.maxFiles) fail('generated output exceeds caller cap', 'NODE_ROOT_FILES');
  if (local.directories > rootCap.maxDirectories) {
    fail('generated output exceeds caller cap', 'NODE_ROOT_DIRECTORIES');
  }
  if (local.bytes > rootCap.maxBytes) fail('generated output exceeds caller cap', 'NODE_ROOT_BYTES');
  if (total.files > totalCap.maxFiles) fail('generated output exceeds caller cap', 'NODE_TOTAL_FILES');
  if (total.directories > totalCap.maxDirectories) {
    fail('generated output exceeds caller cap', 'NODE_TOTAL_DIRECTORIES');
  }
  if (total.bytes > totalCap.maxBytes) fail('generated output exceeds caller cap', 'NODE_TOTAL_BYTES');
}
function captureBounds(input: Readonly<V4PostBuildCaptureInput>): number {
  if (input?.inspectorSelection !== undefined
      && input.inspectorSelection !== 'v4'
      && input.inspectorSelection !== 'v5-source59-after-assembly') {
    fail('unknown explicit inspector selection');
  }
  if (input?.inspectorSelection === 'v5-source59-after-assembly'
      && input.phase !== 'after') fail('V5 inspector requires after-assembly capture');
  if (!input || !isAbsolute(input.sourceRoot) || resolve(input.sourceRoot) !== input.sourceRoot
      || (input.phase !== 'before' && input.phase !== 'resolver' && input.phase !== 'after')
      || !Number.isSafeInteger(input.maxMembershipBytes) || input.maxMembershipBytes <= 0
      || input.maxMembershipBytes > MAX_MEMBERSHIP_BYTES
      || input.plan.files.size !== 737 || !input.plan.directories.has('')
      || input.plan.directories.size > MAX_SOURCE_DIRECTORIES) fail('source plan or transport bounds differ');
  if (!input.caps?.roots || Object.keys(input.caps.roots).sort().join('\0')
      !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) fail('exactly six output root caps required');
  assertCap(input.caps.total);
  for (const root of V4_GENERATED_OUTPUT_ROOTS) assertCap(input.caps.roots[root]);
  for (const path of [...input.plan.files.keys(), ...input.plan.directories]) {
    if (path && (!safePath(path) || rootOf(path))) fail('source plan overlaps output or contains unsafe path');
  }
  const maxEntries = input.plan.files.size + input.plan.directories.size - 1
    + input.caps.total.maxFiles + input.caps.total.maxDirectories + 1;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0
      || maxEntries > MAX_INSPECTED_ENTRIES) fail('explicit entry cap exceeds inspection ceiling');
  return maxEntries;
}
function ancestorIdentities(root: string): ReadonlyArray<readonly [string, string]> {
  const result: Array<readonly [string, string]> = [];
  let cursor = root;
  for (;;) {
    result.push([cursor, directoryIdentity(directDirectory(cursor))]);
    const parent = dirname(cursor);
    if (parent === cursor) return result;
    cursor = parent;
  }
}
function assertAncestorsSame(baseline: ReadonlyArray<readonly [string, string]>): void {
  for (const [path, identity] of baseline) {
    if (directoryIdentity(directDirectory(path)) !== identity) {
      fail('source ancestor identity changed', 'SOURCE_DRIFT');
    }
  }
}
function streamFile(path: string, maxBytes: number, gitBlob: boolean,
  overflowCode: V4PostBuildCaptureFailureCode): Readonly<{
  identity: string; bytes: number; sha256Hex: string; gitBlobSha1Hex?: string;
}> {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    fail('file exceeds cap or is indirect', 'REPARSE');
  }
  if (before.size < 0n || before.size > BigInt(maxBytes)) {
    fail('file exceeds cap or is indirect', overflowCode);
  }
  const driftCode = gitBlob ? 'SOURCE_DRIFT' : 'NODE_FILE_DRIFT';
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const sha = createHash('sha256');
  const blob = gitBlob ? createHash('sha1').update(`blob ${before.size}\0`) : undefined;
  let length = 0;
  try {
    if (!fileSame(before, fstatSync(fd, { bigint: true }))) {
      fail('file changed before read', driftCode);
    }
    const chunk = Buffer.allocUnsafe(65_536);
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      length += count;
      if (length > maxBytes) fail('file read exceeds cap', overflowCode);
      if (length > Number(before.size)) fail('file read exceeds cap', driftCode);
      const slice = chunk.subarray(0, count);
      sha.update(slice);
      blob?.update(slice);
    }
    if (!fileSame(before, fstatSync(fd, { bigint: true }))) {
      fail('file changed during read', driftCode);
    }
  } finally { closeSync(fd); }
  if (length !== Number(before.size) || !fileSame(before, lstatSync(path, { bigint: true }))) {
    fail('file changed after read', driftCode);
  }
  return Object.freeze({
    identity: `${before.dev}:${before.ino}:${before.mode}:${before.nlink}:${before.size}:${before.mtimeNs}:${before.ctimeNs}`,
    bytes: length, sha256Hex: sha.digest('hex'),
    ...(blob ? { gitBlobSha1Hex: blob.digest('hex') } : {}),
  });
}

// This direct scan is intentionally separate from the independent Windows reparse pass.
// Neither a successful scan nor a pair of scans grants build, Job, cache, or runtime authority.
export function scanV4PostBuildDirectTree(input: Readonly<V4PostBuildCaptureInput>): V4PostBuildPhysicalCapture {
  const maxEntries = captureBounds(input);
  const ancestors = ancestorIdentities(input.sourceRoot);
  const entries: V4PostBuildEntry[] = [];
  const lines: string[] = [];
  const seen = new Set<string>();
  const generated = new Map<V4GeneratedOutputRoot, { files: number; directories: number; bytes: number }>();
  for (const root of V4_GENERATED_OUTPUT_ROOTS) generated.set(root, { files: 0, directories: 0, bytes: 0 });
  const total = { files: 0, directories: 0, bytes: 0 };
  let sourceFiles = 0;
  let sourceDirectories = 0;
  let sourceBytes = 0;
  let gitIdentity = '';
  const insert = (entry: V4PostBuildEntry): void => {
    const folded = entry.path.toLowerCase();
    if (seen.has(folded)) fail('case-colliding physical path');
    seen.add(folded);
    entries.push(Object.freeze(entry));
    lines.push(`${entry.kind === 'directory' ? 'D' : 'F'}\t${entry.path}\n`);
    if (entries.length + 1 > maxEntries) {
      fail('physical entry count exceeds caller cap', 'NODE_ENTRY_CAP');
    }
    const root = rootOf(entry.path);
    if (!root) return;
    const local = generated.get(root)!;
    if (entry.kind === 'directory') { local.directories++; total.directories++; }
    else { local.files++; total.files++; local.bytes += entry.bytes!; total.bytes += entry.bytes!; }
    assertV4GeneratedCaptureCaps(local, total, input.caps.roots[root], input.caps.total);
  };
  const walk = (relative: string, depth: number): void => {
    if (depth > MAX_DEPTH) fail('physical depth exceeds limit');
    const absolute = relative ? resolve(input.sourceRoot, ...relative.split('/')) : input.sourceRoot;
    if (relative && !absolute.startsWith(input.sourceRoot + sep)) fail('physical path escapes source root');
    const before = directDirectory(absolute);
    if (relative) {
      if (!rootOf(relative)) {
        if (!input.plan.directories.has(relative)) fail('unplanned source directory');
        sourceDirectories++;
        if (sourceDirectories > MAX_SOURCE_DIRECTORIES) fail('source directory count exceeds limit');
      } else if (input.phase === 'before') fail('generated output preexists');
      insert({ path: relative, kind: 'directory', identity: directoryIdentity(before),
        reparsePoint: false });
    } else sourceDirectories++;
    const names = readdirSync(absolute);
    const folded = new Set<string>();
    for (const name of names) {
      if (!safeName(name)) fail('unsafe physical name');
      const key = name.toLowerCase();
      if (folded.has(key)) fail('case-colliding directory children');
      folded.add(key);
    }
    for (const name of names.sort()) {
      const child = relative ? `${relative}/${name}` : name;
      const path = resolve(absolute, name);
      if (!relative && name.toLowerCase() === '.git') {
        if (name !== '.git' || gitIdentity) fail('Git root differs');
        gitIdentity = directoryIdentity(directDirectory(path));
        lines.push('D\t.git\n');
        if (entries.length + 1 > maxEntries) fail('Git root exceeds caller cap');
        continue;
      }
      const root = rootOf(child);
      if (root && input.phase === 'before') fail('generated output preexists');
      if (!root && !input.plan.files.has(child) && !input.plan.directories.has(child)) {
        fail('physical path outside source and six output roots');
      }
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) fail('physical path is a reparse link', 'REPARSE');
      if (root && child === root && !stat.isDirectory()) {
        fail('generated output root is not a directory');
      }
      if (child === V4_GENERATED_OUTPUT_SCAFFOLD && !stat.isDirectory()) {
        fail('generated scaffold is not a directory');
      }
      if (stat.isDirectory()) {
        if (!root && !input.plan.directories.has(child)) fail('source file became a directory');
        walk(child, depth + 1);
      } else if (stat.isFile()) {
        if (!root && !input.plan.files.has(child)) fail('source directory became a file');
        const rootRemaining = root
          ? input.caps.roots[root].maxBytes - generated.get(root)!.bytes
          : MAX_SOURCE_FILE_BYTES;
        const totalRemaining = root
          ? input.caps.total.maxBytes - total.bytes
          : MAX_SOURCE_TOTAL_BYTES - sourceBytes;
        const remaining = Math.min(rootRemaining, totalRemaining);
        const overflowCode: V4PostBuildCaptureFailureCode = root
          ? (rootRemaining <= totalRemaining ? 'NODE_ROOT_BYTES' : 'NODE_TOTAL_BYTES')
          : 'SOURCE_DRIFT';
        if (remaining < 0) fail('physical byte cap exhausted', overflowCode);
        const observed = streamFile(path, remaining, !root, overflowCode);
        if (!root) {
          if (observed.gitBlobSha1Hex !== input.plan.files.get(child)) {
            fail('physical source Git blob differs', 'SOURCE_DRIFT');
          }
          sourceFiles++;
          sourceBytes += observed.bytes;
          if (sourceFiles > MAX_SOURCE_FILES || sourceBytes > MAX_SOURCE_TOTAL_BYTES) {
            fail('physical source exceeds limit', 'SOURCE_DRIFT');
          }
        }
        insert({ path: child, kind: 'file', identity: observed.identity,
          reparsePoint: false, nlink: 1, bytes: observed.bytes,
          sha256Hex: observed.sha256Hex,
          ...(root ? {} : { gitBlobSha1Hex: observed.gitBlobSha1Hex }),
        });
      } else fail('unsupported physical entry');
    }
    if (directoryIdentity(directDirectory(absolute)) !== directoryIdentity(before)) {
      fail('directory identity changed during scan', 'SOURCE_DRIFT');
    }
  };
  walk('', 0);
  if (!gitIdentity || sourceFiles !== input.plan.files.size
      || sourceDirectories !== input.plan.directories.size) {
    fail('source or Git count differs', 'SOURCE_DRIFT');
  }
  if (input.phase === 'after') {
    for (const root of V4_GENERATED_OUTPUT_ROOTS) {
      if (!entries.some(entry => entry.path === root && entry.kind === 'directory')) {
        fail('generated output root absent');
      }
    }
  }
  if (input.phase === 'resolver'
      && entries.some(entry => entry.path === V4_GENERATED_OUTPUT_SCAFFOLD)
      && !entries.some(entry => entry.path === 'project/project/target'
        && entry.kind === 'directory')) fail('generated scaffold lacks target root');
  assertAncestorsSame(ancestors);
  const membership = lines.sort().join('');
  if (Buffer.byteLength(membership, 'utf8') > input.maxMembershipBytes) {
    fail('Node membership exceeds caller cap', 'NODE_MEMBERSHIP_CAP');
  }
  return Object.freeze({ rootIdentity: ancestors[0]![1], gitRootIdentity: gitIdentity,
    entries: Object.freeze(entries), membership });
}

function readPinnedInspector(path: string, expectedSha = INSPECTOR_SHA256):
  Readonly<{ bytes: Buffer; stat: BigIntStats }> {
  const ancestors = ancestorIdentities(dirname(path));
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > 65_536n) fail('inspector is not direct and bounded');
  const bytes = readFileSync(path);
  if (!fileSame(before, lstatSync(path, { bigint: true }))
      || bytes.length !== Number(before.size) || sha256(bytes) !== expectedSha) {
    fail('inspector pin differs', 'INSPECTOR_DRIFT');
  }
  assertAncestorsSame(ancestors);
  return { bytes, stat: before };
}
function samePinnedInspector(a: Readonly<{ bytes: Buffer; stat: BigIntStats }>,
  b: Readonly<{ bytes: Buffer; stat: BigIntStats }>): boolean {
  return fileSame(a.stat, b.stat) && a.bytes.equals(b.bytes);
}
const V5_INSPECTOR_OUTPUT_CODES = new Set<V4PostBuildCaptureFailureCode>([
  'INSPECTOR_OUTPUT_BASE64', 'INSPECTOR_OUTPUT_BYTES', 'INSPECTOR_OUTPUT_UTF8',
  'INSPECTOR_OUTPUT_FRAMING', 'INSPECTOR_OUTPUT_COUNT', 'INSPECTOR_OUTPUT_ROW',
  'INSPECTOR_OUTPUT_ORDER', 'INSPECTOR_OUTPUT_PATH', 'INSPECTOR_OUTPUT_CASE',
  'INSPECTOR_OUTPUT_GIT', 'INSPECTOR_OUTPUT_PARENT',
]);
function decodeInspectorUtf8(bytes: Uint8Array, versioned: boolean): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) {
    if (versioned) fail('inspector UTF-8 differs', 'INSPECTOR_OUTPUT_UTF8');
    throw error;
  }
}

export function parseV4PostBuildInspectorOutput(
  encoded: string, maxEntries: number, maxMembershipBytes: number,
  inspectorSelection?: V4PostBuildCaptureInput['inspectorSelection'],
): string {
  const versioned = inspectorSelection === 'v5-source59-after-assembly';
  const refuse = (reason: string, code: V4PostBuildCaptureFailureCode): never =>
    fail(reason, versioned ? code : 'OTHER');
  if (!encoded || encoded.length % 4 !== 0) {
    refuse('inspector output is not canonical base64', 'INSPECTOR_OUTPUT_BASE64');
  }
  const maxEncoded = 4 * Math.ceil(maxMembershipBytes / 3);
  if (!Number.isSafeInteger(maxEncoded) || encoded.length > maxEncoded) {
    refuse('inspector output exceeds cap or differs', 'INSPECTOR_OUTPUT_BYTES');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bodyEnd = encoded.length - padding;
  for (let index = 0; index < encoded.length; index++) {
    const character = encoded.charCodeAt(index);
    if (index < bodyEnd
        ? !((character >= 65 && character <= 90)
          || (character >= 97 && character <= 122)
          || (character >= 48 && character <= 57)
          || character === 43 || character === 47)
        : character !== 61) {
      refuse('inspector output is not canonical base64', 'INSPECTOR_OUTPUT_BASE64');
    }
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length > maxMembershipBytes) {
    refuse('inspector output exceeds cap or differs', 'INSPECTOR_OUTPUT_BYTES');
  }
  const text = decodeInspectorUtf8(bytes, versioned);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    refuse('inspector encoding differs', 'INSPECTOR_OUTPUT_FRAMING');
  }
  const rows = text.slice(0, -1).split('\n');
  if (rows.length === 0 || rows.length > maxEntries) {
    refuse('inspector entry count differs', 'INSPECTOR_OUTPUT_COUNT');
  }
  let previous = '';
  let git = 0;
  const directories = new Set<string>();
  const folded = new Set<string>();
  for (const row of rows) {
    if (!/^[DF]\t/u.test(row)) {
      refuse('inspector record order differs', 'INSPECTOR_OUTPUT_ROW');
    }
    if (previous && previous >= row) {
      refuse('inspector record order differs', 'INSPECTOR_OUTPUT_ORDER');
    }
    previous = row;
    const path = row.slice(2);
    if (!safePath(path)) refuse('inspector path is unsafe', 'INSPECTOR_OUTPUT_PATH');
    const key = path.toLowerCase();
    if (folded.has(key)) refuse('inspector path case-collides', 'INSPECTOR_OUTPUT_CASE');
    folded.add(key);
    if (path === '.git') {
      if (row[0] !== 'D') refuse('Git root kind differs', 'INSPECTOR_OUTPUT_GIT');
      git++;
    } else if (key === '.git' || key.startsWith('.git/')) {
      refuse('Git path is not opaque', 'INSPECTOR_OUTPUT_GIT');
    }
    if (row[0] === 'D') directories.add(path);
  }
  if (git !== 1) refuse('Git root is absent', 'INSPECTOR_OUTPUT_GIT');
  for (const row of rows) {
    const path = row.slice(2);
    const slash = path.lastIndexOf('/');
    if (slash >= 0 && !directories.has(path.slice(0, slash))) {
      refuse('inspector parent is absent', 'INSPECTOR_OUTPUT_PARENT');
    }
  }
  return text;
}

async function inspectMembership(input: Readonly<V4PostBuildCaptureInput>, maxEntries: number): Promise<string> {
  if (process.platform !== 'win32') fail('Windows reparse inspection is required');
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) fail('SystemRoot is unavailable');
  const versioned = input.inspectorSelection === 'v5-source59-after-assembly';
  const inspector = resolve(import.meta.dirname, 'scripts', versioned
    ? 'inspect-v5-source59-postbuild-membership.ps1'
    : 'inspect-v4-postbuild-membership.ps1');
  const inspectorSha = versioned ? V5_INSPECTOR_SHA256 : INSPECTOR_SHA256;
  const before = readPinnedInspector(inspector, inspectorSha);
  const maxEncoded = 4 * Math.ceil(input.maxMembershipBytes / 3);
  if (!Number.isSafeInteger(maxEncoded + 16_384)) fail('inspector output cap overflow');
  try {
    return await withPinnedV4BoundedChildTools(async () => {
      const result = await runBoundedProcess({
        executablePath: resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', inspector, '-Root', input.sourceRoot,
          '-MaxEntries', String(maxEntries), '-MaxMembershipBytes', String(input.maxMembershipBytes)],
        cwd: resolve(systemRoot, 'System32'),
        env: { SystemRoot: systemRoot, WINDIR: systemRoot, Path: resolve(systemRoot, 'System32') },
        timeoutMs: 30_000,
        maxOutputBytes: maxEncoded + 16_384,
        maxStdoutBytes: maxEncoded,
        maxStderrBytes: 16_384,
        terminationGraceMs: 10_000,
        label: 'V4 post-build reparse and membership inspection',
      });
      if (result.exitCode !== 0 || result.stderrBytes.length !== 0) {
        fail('inspector failed', versioned ? 'INSPECTOR_AMBIGUOUS' : 'OTHER');
      }
      const encoded = decodeInspectorUtf8(result.stdoutBytes, versioned);
      try {
        return parseV4PostBuildInspectorOutput(encoded,
          maxEntries, input.maxMembershipBytes, input.inspectorSelection);
      } catch (error) {
        if (versioned) {
          if (V4PostBuildCaptureFailure.isConstructed(error)
              && V5_INSPECTOR_OUTPUT_CODES.has(error.code)) throw error;
          fail('versioned inspector output differs', 'INSPECTOR_OUTPUT');
        }
        throw error;
      }
    });
  } catch (error) {
    if (versioned && !(error instanceof V4PostBuildCaptureFailure)) {
      fail('versioned inspector refused', classifyV5Source59InspectorExit(error));
    }
    throw error;
  } finally {
    if (!samePinnedInspector(before, readPinnedInspector(inspector, inspectorSha))) {
      fail('inspector changed', 'INSPECTOR_DRIFT');
    }
  }
}

export async function captureV4PostBuildPhysicalTree(
  input: Readonly<V4PostBuildCaptureInput>,
): Promise<V4PostBuildPhysicalCapture> {
  const maxEntries = captureBounds(input);
  const before = await inspectMembership(input, maxEntries);
  const captured = scanV4PostBuildDirectTree(input);
  if (captured.membership !== before) {
    fail('initial inspector and Node membership differ', 'INSPECTOR_MISMATCH');
  }
  const after = await inspectMembership(input, maxEntries);
  if (after !== before || after !== captured.membership) {
    fail('final inspector and Node membership differ', 'INSPECTOR_MISMATCH');
  }
  return captured;
}

// A pair of completed physical captures still does not establish a successful SBT Job,
// a fresh Java executable pin, cache closure, or process-owned two-cycle authority.
export function validateV4PhysicalPostBuildPair(input: Readonly<{
  before: Readonly<V4PostBuildPhysicalCapture>;
  after: Readonly<V4PostBuildPhysicalCapture>;
  plan: Readonly<V4PhysicalPlan>;
  expectedSourceDigestHex: string;
  caps: Readonly<V4PostBuildCaps>;
  lock: Readonly<Pick<V4NodeBuildLock,
    'assemblyDirectory' | 'assemblyNamePattern' | 'minimumAssemblyBytes'>>;
}>): V4PostBuildObservationValidation {
  if (input.before.rootIdentity !== input.after.rootIdentity
      || input.before.gitRootIdentity !== input.after.gitRootIdentity) {
    fail('source or Git root identity changed between captures');
  }
  return validateV4PostBuildObservations({
    before: input.before.entries, after: input.after.entries, plan: input.plan,
    expectedSourceDigestHex: input.expectedSourceDigestHex,
    caps: input.caps, lock: input.lock,
  });
}

// Resolver output is an intermediate physical state. The original pristine `before`
// capture remains the only `before` input for final assembly validation.
export function validateV4PhysicalResolverStagePair(input: Readonly<{
  before: Readonly<V4PostBuildPhysicalCapture>;
  resolver: Readonly<V4PostBuildPhysicalCapture>;
  plan: Readonly<V4PhysicalPlan>;
  expectedSourceDigestHex: string;
  caps: Readonly<V4PostBuildCaps>;
  lock: Readonly<Pick<V4NodeBuildLock,
    'assemblyDirectory' | 'assemblyNamePattern' | 'minimumAssemblyBytes'>>;
}>): V4ResolverStageObservationValidation {
  if (input.before.rootIdentity !== input.resolver.rootIdentity
      || input.before.gitRootIdentity !== input.resolver.gitRootIdentity) {
    fail('source or Git root identity changed between captures');
  }
  return validateV4ResolverStageObservations({
    before: input.before.entries, resolver: input.resolver.entries,
    plan: input.plan, expectedSourceDigestHex: input.expectedSourceDigestHex,
    caps: input.caps, lock: input.lock,
  });
}
