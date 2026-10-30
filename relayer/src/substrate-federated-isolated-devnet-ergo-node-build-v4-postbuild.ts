import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type BigIntStats } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { selectV4AssemblyCandidate } from './substrate-federated-isolated-devnet-ergo-node-build-v4-assembly.js';
import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import type { V4PhysicalPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

export const V4_GENERATED_OUTPUT_ROOTS = [
  'target', 'project/target', 'project/project/target',
  'ergo-core/target', 'ergo-wallet/target', 'avldb/target',
] as const;
export type V4GeneratedOutputRoot = typeof V4_GENERATED_OUTPUT_ROOTS[number];
export const V4_GENERATED_OUTPUT_SCAFFOLD = 'project/project' as const;

// These are *caller observations*, not filesystem attestations. The future Job owner must
// capture each complete physical tree with direct, stable, single-link reads on both sides.
export interface V4PostBuildEntry {
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink' | 'other';
  readonly identity: string;
  readonly reparsePoint: boolean;
  readonly nlink?: number;
  readonly bytes?: number;
  readonly sha256Hex?: string;
  readonly gitBlobSha1Hex?: string;
}
export interface V4PostBuildCap {
  readonly maxFiles: number;
  readonly maxDirectories: number;
  readonly maxBytes: number;
}
export interface V4PostBuildCaps {
  readonly roots: Readonly<Record<V4GeneratedOutputRoot, Readonly<V4PostBuildCap>>>;
  readonly total: Readonly<V4PostBuildCap>;
}
export interface V4OutputCount {
  readonly files: number;
  readonly directories: number;
  readonly bytes: number;
}
export interface V4PostBuildObservationValidation {
  readonly sourceDigestHex: string;
  readonly generated: Readonly<Record<V4GeneratedOutputRoot, V4OutputCount>>;
  readonly total: V4OutputCount;
  readonly assembly: Readonly<{ path: string; bytes: number; sha256Hex: string }>;
}
export type V4ResolverStageObservationValidation = Readonly<Pick<
  V4PostBuildObservationValidation, 'sourceDigestHex' | 'generated' | 'total'>>;

function fail(reason: string): never { throw new Error('V4 post-build observation: ' + reason); }
function hex(value: string | undefined, digits: number): boolean {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${digits}}$`, 'u').test(value);
}
function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && !/[\u0000-\u001f\u007f:]/u.test(path)
    && path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'
      && !/[. ]$/u.test(part)
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)
      && part.toLowerCase() !== '.git');
}
function rootOf(path: string): V4GeneratedOutputRoot | undefined {
  if (path === V4_GENERATED_OUTPUT_SCAFFOLD) return 'project/project/target';
  return V4_GENERATED_OUTPUT_ROOTS.find(root => path === root || path.startsWith(root + '/'));
}
function cap(value: Readonly<V4PostBuildCap> | undefined): asserts value is Readonly<V4PostBuildCap> {
  if (!value || !Number.isSafeInteger(value.maxFiles) || value.maxFiles < 0
      || !Number.isSafeInteger(value.maxDirectories) || value.maxDirectories < 0
      || !Number.isSafeInteger(value.maxBytes) || value.maxBytes < 0) fail('explicit finite caps required');
}
function underCap(count: V4OutputCount, limit: Readonly<V4PostBuildCap>): void {
  if (count.files > limit.maxFiles || count.directories > limit.maxDirectories
      || count.bytes > limit.maxBytes) fail('generated output exceeds caller cap');
}
function increment(current: V4OutputCount, entry: Readonly<V4PostBuildEntry>): V4OutputCount {
  const next = entry.kind === 'file'
    ? { files: current.files + 1, directories: current.directories, bytes: current.bytes + entry.bytes! }
    : { files: current.files, directories: current.directories + 1, bytes: current.bytes };
  if (!Number.isSafeInteger(next.files) || !Number.isSafeInteger(next.directories)
      || !Number.isSafeInteger(next.bytes)) fail('generated output count overflow');
  return next;
}
function index(entries: readonly Readonly<V4PostBuildEntry>[]): Map<string, Readonly<V4PostBuildEntry>> {
  if (!Array.isArray(entries)) fail('observation entries absent');
  const byPath = new Map<string, Readonly<V4PostBuildEntry>>();
  const folded = new Set<string>();
  for (const entry of entries) {
    if (!entry || !safePath(entry.path) || typeof entry.identity !== 'string'
        || entry.identity.length === 0 || /[\u0000-\u001f\u007f]/u.test(entry.identity)
        || entry.reparsePoint !== false
        || (entry.kind !== 'file' && entry.kind !== 'directory')) fail('unsafe observed entry');
    const key = entry.path.toLowerCase();
    if (folded.has(key)) fail('duplicate or case-colliding observed entry');
    folded.add(key);
    if (entry.kind === 'file') {
      if (entry.path === V4_GENERATED_OUTPUT_SCAFFOLD) fail('generated scaffold is not a directory');
      if (entry.nlink !== 1 || !Number.isSafeInteger(entry.bytes) || entry.bytes! < 0
          || !hex(entry.sha256Hex, 64)) fail('file lacks bounded single-link content observation');
    } else if (entry.bytes !== undefined || entry.sha256Hex !== undefined
               || entry.gitBlobSha1Hex !== undefined || entry.nlink !== undefined) {
      fail('directory carries file fields');
    }
    byPath.set(entry.path, entry);
  }
  for (const entry of entries) {
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    if (parent && byPath.get(parent)?.kind !== 'directory') fail('observed parent is missing or not a directory');
  }
  return byPath;
}
function sourceDigest(
  observed: ReadonlyMap<string, Readonly<V4PostBuildEntry>>,
  plan: Readonly<V4PhysicalPlan>,
  expectedDigest: string,
): string {
  const records: string[] = [];
  for (const [path, blob] of plan.files) {
    const entry = observed.get(path);
    if (!entry || entry.kind !== 'file' || entry.gitBlobSha1Hex !== blob) fail('pinned source file differs');
    records.push(`F\0${path}\0${entry.bytes}\0${entry.sha256Hex}\n`);
  }
  for (const path of plan.directories) {
    if (!path) continue;
    if (observed.get(path)?.kind !== 'directory') fail('pinned source directory differs');
    records.push(`D\0${path}\n`);
  }
  const digest = createHash('sha256').update(records.sort().join('')).digest('hex');
  if (digest !== expectedDigest) fail('pinned physical source digest differs');
  return digest;
}

// Partition and compare two externally captured complete observations. This does not attest
// that a Job ran, that a snapshot was physically obtained, or that a raised cap is authorized.
export function validateV4PostBuildObservations(input: Readonly<{
  before: readonly Readonly<V4PostBuildEntry>[];
  after: readonly Readonly<V4PostBuildEntry>[];
  plan: Readonly<V4PhysicalPlan>;
  expectedSourceDigestHex: string;
  caps: Readonly<V4PostBuildCaps>;
  lock: Readonly<Pick<V4NodeBuildLock,
    'assemblyDirectory' | 'assemblyNamePattern' | 'minimumAssemblyBytes'>>;
}>): V4PostBuildObservationValidation {
  if (!hex(input.expectedSourceDigestHex, 64)
      || input.lock.assemblyDirectory !== 'target/scala-2.12') fail('source or assembly lock differs');
  const roots = input.caps?.roots;
  if (!roots || Object.keys(roots).sort().join('\0') !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) {
    fail('exactly six explicit root caps required');
  }
  cap(input.caps.total);
  for (const root of V4_GENERATED_OUTPUT_ROOTS) cap(roots[root]);
  const sourceEntries = input.plan.files.size + input.plan.directories.size - 1;
  const maxAfterEntries = sourceEntries + input.caps.total.maxFiles
    + input.caps.total.maxDirectories;
  if (!Number.isSafeInteger(sourceEntries) || sourceEntries < 0
      || !Number.isSafeInteger(maxAfterEntries) || input.before.length !== sourceEntries
      || input.after.length > maxAfterEntries) {
    fail('pre-build source entry count differs or observation entry count exceeds caps');
  }
  const before = index(input.before);
  const after = index(input.after);
  for (const path of [...input.plan.files.keys(), ...input.plan.directories]) {
    if (path && rootOf(path)) fail('generated root overlaps pinned source');
  }
  for (const path of before.keys()) {
    if (rootOf(path)) fail('generated output preexists');
    if (!input.plan.files.has(path) && !input.plan.directories.has(path)) fail('unplanned pre-build source path');
  }
  const digest = sourceDigest(before, input.plan, input.expectedSourceDigestHex);
  sourceDigest(after, input.plan, input.expectedSourceDigestHex);
  for (const [path, oldEntry] of before) {
    const current = after.get(path);
    if (!current || current.kind !== oldEntry.kind || current.identity !== oldEntry.identity
        || current.bytes !== oldEntry.bytes || current.sha256Hex !== oldEntry.sha256Hex
        || current.gitBlobSha1Hex !== oldEntry.gitBlobSha1Hex) {
      fail('pinned source identity or content changed');
    }
  }
  const generated = {} as Record<V4GeneratedOutputRoot, V4OutputCount>;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) {
    if (after.get(root)?.kind !== 'directory') fail('generated output root absent');
    generated[root] = { files: 0, directories: 0, bytes: 0 };
  }
  let total: V4OutputCount = { files: 0, directories: 0, bytes: 0 };
  for (const [path, entry] of after) {
    const root = rootOf(path);
    if (root) {
      if (entry.gitBlobSha1Hex !== undefined) fail('generated file masquerades as pinned source');
      generated[root] = increment(generated[root], entry);
      total = increment(total, entry);
      underCap(generated[root], roots[root]);
      underCap(total, input.caps.total);
    } else if (!input.plan.files.has(path) && !input.plan.directories.has(path)) {
      fail('unplanned post-build path outside six generated roots');
    }
  }
  if (after.get(input.lock.assemblyDirectory)?.kind !== 'directory') fail('assembly directory absent');
  const prefix = input.lock.assemblyDirectory + '/';
  const children = [...after.values()].filter(entry => entry.path.startsWith(prefix)
    && !entry.path.slice(prefix.length).includes('/'));
  const selected = selectV4AssemblyCandidate(children.map(entry => ({
    name: entry.path.slice(prefix.length), kind: entry.kind, bytes: entry.bytes ?? 0,
    nlink: entry.nlink ?? 0,
  })), input.lock);
  const assemblyPath = prefix + selected.name;
  const assembly = after.get(assemblyPath)!;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) Object.freeze(generated[root]);
  return Object.freeze({ sourceDigestHex: digest, generated: Object.freeze(generated),
    total: Object.freeze(total), assembly: Object.freeze({
      path: assemblyPath, bytes: selected.bytes, sha256Hex: assembly.sha256Hex!,
    }) });
}

// Resolver-stage output may contain a proper subset of the six generated roots.
// This compares it with the original pristine capture; it does not attest a Job.
export function validateV4ResolverStageObservations(input: Readonly<{
  before: readonly Readonly<V4PostBuildEntry>[];
  resolver: readonly Readonly<V4PostBuildEntry>[];
  plan: Readonly<V4PhysicalPlan>;
  expectedSourceDigestHex: string;
  caps: Readonly<V4PostBuildCaps>;
  lock: Readonly<Pick<V4NodeBuildLock,
    'assemblyDirectory' | 'assemblyNamePattern' | 'minimumAssemblyBytes'>>;
}>): V4ResolverStageObservationValidation {
  if (!hex(input.expectedSourceDigestHex, 64)
      || input.lock.assemblyDirectory !== 'target/scala-2.12'
      || input.lock.assemblyNamePattern !== '^ergo-.*\\.jar$'
      || input.lock.minimumAssemblyBytes !== 33554432) fail('source or assembly lock differs');
  const roots = input.caps?.roots;
  if (!roots || Object.keys(roots).sort().join('\0') !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) {
    fail('exactly six explicit root caps required');
  }
  cap(input.caps.total);
  for (const root of V4_GENERATED_OUTPUT_ROOTS) cap(roots[root]);
  const sourceEntries = input.plan.files.size + input.plan.directories.size - 1;
  const maxResolverEntries = sourceEntries + input.caps.total.maxFiles
    + input.caps.total.maxDirectories;
  if (!Number.isSafeInteger(sourceEntries) || sourceEntries < 0
      || !Number.isSafeInteger(maxResolverEntries) || input.before.length !== sourceEntries
      || input.resolver.length > maxResolverEntries) {
    fail('pre-build source entry count differs or observation entry count exceeds caps');
  }
  const before = index(input.before);
  const resolver = index(input.resolver);
  for (const path of [...input.plan.files.keys(), ...input.plan.directories]) {
    if (path && rootOf(path)) fail('generated root overlaps pinned source');
  }
  for (const path of before.keys()) {
    if (rootOf(path)) fail('generated output preexists');
    if (!input.plan.files.has(path) && !input.plan.directories.has(path)) {
      fail('unplanned pre-build source path');
    }
  }
  const digest = sourceDigest(before, input.plan, input.expectedSourceDigestHex);
  sourceDigest(resolver, input.plan, input.expectedSourceDigestHex);
  for (const [path, oldEntry] of before) {
    const current = resolver.get(path);
    if (!current || current.kind !== oldEntry.kind || current.identity !== oldEntry.identity
        || current.bytes !== oldEntry.bytes || current.sha256Hex !== oldEntry.sha256Hex
        || current.gitBlobSha1Hex !== oldEntry.gitBlobSha1Hex) {
      fail('pinned source identity or content changed');
    }
  }
  const generated = {} as Record<V4GeneratedOutputRoot, V4OutputCount>;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) {
    const observed = resolver.get(root);
    if (observed && observed.kind !== 'directory') fail('generated output root is not a directory');
    generated[root] = { files: 0, directories: 0, bytes: 0 };
  }
  if (resolver.has(V4_GENERATED_OUTPUT_SCAFFOLD)
      && resolver.get('project/project/target')?.kind !== 'directory') {
    fail('generated scaffold lacks target root');
  }
  let total: V4OutputCount = { files: 0, directories: 0, bytes: 0 };
  const prefix = input.lock.assemblyDirectory + '/';
  for (const [path, entry] of resolver) {
    const root = rootOf(path);
    if (root) {
      if (entry.gitBlobSha1Hex !== undefined) fail('generated file masquerades as pinned source');
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')
          && /^ergo-.*\.jar$/u.test(path.slice(prefix.length))) {
        fail('assembly-name artifact preexists before assembly Job');
      }
      generated[root] = increment(generated[root], entry);
      total = increment(total, entry);
      underCap(generated[root], roots[root]);
      underCap(total, input.caps.total);
    } else if (!input.plan.files.has(path) && !input.plan.directories.has(path)) {
      fail('unplanned resolver path outside six generated roots');
    }
  }
  for (const root of V4_GENERATED_OUTPUT_ROOTS) Object.freeze(generated[root]);
  return Object.freeze({ sourceDigestHex: digest, generated: Object.freeze(generated),
    total: Object.freeze(total) });
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

// A bounded direct read of the selected JAR only. Full-tree direct/reparse/stability capture
// remains the future builder's responsibility; this function cannot attest its provenance.
export function hashV4SelectedAssembly(
  sourceRoot: string,
  assembly: Readonly<V4PostBuildObservationValidation['assembly']>,
  maxAssemblyBytes: number,
): string {
  if (!isAbsolute(sourceRoot) || resolve(sourceRoot) !== sourceRoot
      || !safePath(assembly.path) || !assembly.path.startsWith('target/scala-2.12/')
      || assembly.path.slice('target/scala-2.12/'.length).includes('/')
      || !Number.isSafeInteger(maxAssemblyBytes) || maxAssemblyBytes < assembly.bytes
      || !Number.isSafeInteger(assembly.bytes) || assembly.bytes < 0
      || !hex(assembly.sha256Hex, 64)) fail('assembly read parameters differ');
  const path = resolve(sourceRoot, ...assembly.path.split('/'));
  if (!path.startsWith(sourceRoot + sep)) fail('assembly escapes root');
  const parents: Array<readonly [string, BigIntStats]> = [];
  let cursor = dirname(path);
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('linked assembly ancestor');
    parents.push([cursor, stat]);
    const next = dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size !== BigInt(assembly.bytes)) fail('assembly is not stable direct single-link file');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('assembly changed before read');
    const chunk = Buffer.allocUnsafe(65536);
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      bytes += count;
      if (bytes > maxAssemblyBytes || bytes > assembly.bytes) fail('assembly read exceeds cap');
      hash.update(chunk.subarray(0, count));
    }
    if (!same(before, fstatSync(fd, { bigint: true }))) fail('assembly changed during read');
  } finally { closeSync(fd); }
  if (bytes !== assembly.bytes || !same(before, lstatSync(path, { bigint: true }))) {
    fail('assembly changed after read');
  }
  for (const [parent, initial] of parents) {
    if (!same(initial, lstatSync(parent, { bigint: true }))) fail('assembly ancestor changed');
  }
  const digest = hash.digest('hex');
  if (digest !== assembly.sha256Hex) fail('assembly content digest differs');
  return digest;
}
