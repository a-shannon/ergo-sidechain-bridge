import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, type BigIntStats } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import { runBoundedProcess } from './bounded-process-runner.js';

const MAX_FILES = 1_024;
const MAX_DIRECTORIES = 2_048;
const MAX_FILE_BYTES = 33_554_432;
const MAX_TOTAL_BYTES = 268_435_456;
const MAX_MEMBERSHIP_BYTES = 1_048_576;
const POWERSHELL_SHA256 = '60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f';
const INSPECTOR_SHA256 = '44d6e33b5e02d1d2a4c0f9e516ff8f1ed839001d41127dbd3de89a38d9931842';
const JOB_RUNNER_SHA256 = '47a08af66ef3134fefeee392e5578be9295e5171dca83c8861822d7e464ff627';

export interface V4PhysicalTreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: string;
  readonly objectId: string;
}
export interface V4PhysicalDeclaration {
  readonly path: string;
  readonly status: 'modified' | 'added';
  readonly patchedBlob: string;
}
export interface V4PhysicalPlan {
  readonly files: ReadonlyMap<string, string>;
  readonly directories: ReadonlySet<string>;
  readonly children: ReadonlyMap<string, ReadonlySet<string>>;
}
export interface V4PhysicalPlanSnapshot {
  readonly canonical: string;
  readonly sha256Hex: string;
}
export interface V4PhysicalObservation {
  readonly physicalSourceDigestHex: string;
  readonly physicalSourceFileCount: number;
  readonly physicalSourceDirectoryCount: number;
  readonly physicalSourceTotalBytes: number;
}

export interface V4PhysicalPass extends V4PhysicalObservation {
  readonly membership: string;
  readonly identities: ReadonlyMap<string, BigIntStats>;
}
export interface V4PhysicalMetadata {
  readonly fullMembership: string;
  readonly sourceMembership: string;
}
interface PinnedSupport { readonly bytes: Buffer; readonly stat: BigIntStats }

function fail(message: string): never { throw new Error('V4 physical source: ' + message); }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function gitBlob(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function pathSafe(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && !/[\u0000-\u001f\u007f:]/u.test(path)
    && path.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..'
      && !/[. ]$/u.test(segment)
      && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment));
}
function childrenAt(map: Map<string, Set<string>>, directory: string): Set<string> {
  const existing = map.get(directory);
  if (existing) return existing;
  const created = new Set<string>();
  map.set(directory, created);
  return created;
}

// The Git parser deliberately permits synthetic link fixtures. This consumer rejects them:
// the pinned V4 source tree contains only regular blobs.
export function buildV4PhysicalPlan(
  head: ReadonlyMap<string, Readonly<V4PhysicalTreeEntry>>,
  declared: readonly Readonly<V4PhysicalDeclaration>[],
): V4PhysicalPlan {
  if (head.size !== 734 || declared.length !== 9) fail('HEAD or declaration count differs');
  const files = new Map<string, string>();
  const declarations = new Map(declared.map(file => [file.path, file] as const));
  if (declarations.size !== declared.length) fail('duplicate declaration');
  let added = 0;
  for (const [path, entry] of head) {
    if (!pathSafe(path) || path.toLowerCase() === '.git'
        || path.toLowerCase().startsWith('.git/')) fail('unsafe HEAD path');
    if (entry.path !== path || entry.type !== 'blob'
        || (entry.mode !== '100644' && entry.mode !== '100755')
        || !/^[0-9a-f]{40}$/u.test(entry.objectId)) fail('unsupported HEAD entry');
    files.set(path, entry.objectId);
  }
  for (const file of declared) {
    if (!pathSafe(file.path) || !/^[0-9a-f]{40}$/u.test(file.patchedBlob)) {
      fail('unsafe declaration');
    }
    if (file.status === 'modified') {
      if (!files.has(file.path)) fail('modified path is absent from HEAD');
    } else if (file.status === 'added') {
      if (files.has(file.path)) fail('added path exists in HEAD');
      added++;
    } else fail('unsupported declaration');
    files.set(file.path, file.patchedBlob);
  }
  if (added !== 3 || files.size !== 737 || files.size > MAX_FILES) {
    fail('expected working file count differs');
  }
  const directories = new Set<string>(['']);
  const children = new Map<string, Set<string>>();
  const folded = new Map<string, string>();
  const assertUnique = (path: string): void => {
    const key = path.toLowerCase();
    const previous = folded.get(key);
    if (previous !== undefined && previous !== path) fail('case-colliding working paths');
    folded.set(key, path);
  };
  for (const path of files.keys()) {
    assertUnique(path);
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      const directory = segments.slice(0, i).join('/');
      assertUnique(directory);
      if (files.has(directory)) fail('file/directory prefix conflict');
      directories.add(directory);
    }
  }
  if (directories.size > MAX_DIRECTORIES) fail('directory count exceeds limit');
  for (const path of [...files.keys(), ...directories].filter(path => path.length > 0)) {
    const index = path.lastIndexOf('/');
    const parent = index < 0 ? '' : path.slice(0, index);
    childrenAt(children, parent).add(index < 0 ? path : path.slice(index + 1));
  }
  for (const directory of directories) childrenAt(children, directory);
  if (children.get('')!.has('.git')) fail('Git metadata conflicts with source tree');
  return { files, directories, children };
}

// A readonly Map/Set type does not prevent mutation across the builder's awaits.
// Keep an independent string copy of the entire allowlist, including child sets.
export function snapshotV4PhysicalPlan(plan: Readonly<V4PhysicalPlan>): V4PhysicalPlanSnapshot {
  if (!(plan.files instanceof Map) || !(plan.directories instanceof Set)
      || !(plan.children instanceof Map) || plan.files.size !== 737) {
    fail('physical plan collections or file count differ');
  }
  const files = [...plan.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const derivedDirectories = new Set<string>(['']);
  const folded = new Map<string, string>();
  const unique = (path: string): void => {
    const prior = folded.get(path.toLowerCase());
    if (prior !== undefined && prior !== path) fail('case-colliding physical plan path');
    folded.set(path.toLowerCase(), path);
  };
  for (const [path, blob] of files) {
    if (typeof path !== 'string' || !pathSafe(path) || path.toLowerCase() === '.git'
        || path.toLowerCase().startsWith('.git/')
        || typeof blob !== 'string' || !/^[0-9a-f]{40}$/u.test(blob)) {
      fail('physical plan file differs');
    }
    unique(path);
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/');
      if (plan.files.has(directory)) fail('physical plan file/directory prefix conflict');
      unique(directory);
      derivedDirectories.add(directory);
    }
  }
  const directories = [...derivedDirectories].sort();
  if (plan.directories.size !== directories.length
      || directories.some(path => !plan.directories.has(path))) {
    fail('physical plan directory membership differs');
  }
  const expectedChildren = new Map<string, Set<string>>(
    directories.map(path => [path, new Set<string>()]));
  for (const path of [...files.map(([name]) => name), ...directories.filter(Boolean)]) {
    const separator = path.lastIndexOf('/');
    const parent = separator < 0 ? '' : path.slice(0, separator);
    expectedChildren.get(parent)!.add(path.slice(separator + 1));
  }
  if (plan.children.size !== expectedChildren.size) fail('physical plan child map differs');
  const children = directories.map(directory => {
    const actual = plan.children.get(directory);
    const expected = expectedChildren.get(directory)!;
    if (!(actual instanceof Set) || actual.size !== expected.size
        || [...expected].some(name => !actual.has(name))) {
      fail('physical plan children differ');
    }
    return [directory, [...expected].sort()] as const;
  });
  const canonical = JSON.stringify({ files, directories, children }) + '\n';
  return Object.freeze({ canonical,
    sha256Hex: createHash('sha256').update(canonical, 'utf8').digest('hex') });
}

export function assertSameV4PhysicalPlanSnapshot(
  baseline: Readonly<V4PhysicalPlanSnapshot>, plan: Readonly<V4PhysicalPlan>,
): void {
  if (typeof baseline.canonical !== 'string' || typeof baseline.sha256Hex !== 'string'
      || createHash('sha256').update(baseline.canonical, 'utf8').digest('hex')
        !== baseline.sha256Hex) fail('physical plan snapshot differs');
  const current = snapshotV4PhysicalPlan(plan);
  if (current.canonical !== baseline.canonical || current.sha256Hex !== baseline.sha256Hex) {
    fail('physical plan changed after snapshot');
  }
}

function actualPath(root: string, relative: string): string {
  const path = relative ? resolve(root, ...relative.split('/')) : root;
  if (path !== root && !path.startsWith(root + sep)) fail('path escapes source root');
  return path;
}
function directDirectory(path: string): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('directory is indirect');
  return stat;
}
function directFile(path: string): { bytes: Buffer; stat: BigIntStats } {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 0n || before.size > BigInt(MAX_FILE_BYTES)) fail('file is not bounded direct single-link');
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || bytes.length !== Number(before.size)) fail('file changed during read');
  return { bytes, stat: before };
}
function sorted(names: Iterable<string>): string[] {
  // Match StringComparer.Ordinal in the bounded .NET metadata pass.
  return [...names].sort();
}

// One complete, content-bearing pass. Its directory child check rejects ignored files and empty
// extra directories as well as additions that Git status intentionally cannot see.
export function scanV4PhysicalSourcePass(root: string, plan: Readonly<V4PhysicalPlan>): V4PhysicalPass {
  if (!isAbsolute(root) || root !== resolve(root)) fail('canonical absolute source root is required');
  const identities = new Map<string, BigIntStats>();
  const membership: string[] = [];
  const records: string[] = [];
  let totalBytes = 0;
  let fileCount = 0;
  let directoryCount = 0;
  const walk = (relative: string, depth: number): void => {
    if (depth > 64) fail('source depth exceeds limit');
    const path = actualPath(root, relative);
    const before = directDirectory(path);
    identities.set('D:' + relative, before);
    directoryCount++;
    if (directoryCount > MAX_DIRECTORIES) fail('directory count exceeds limit');
    if (relative) {
      membership.push('D\t' + relative + '\n');
      records.push('D\0' + relative + '\n');
    }
    const names = readdirSync(path);
    const expected = plan.children.get(relative);
    if (!expected) fail('unplanned directory');
    const actual = names.filter(name => relative !== '' || name !== '.git');
    if (relative === '') {
      if (names.filter(name => name === '.git').length !== 1) fail('Git metadata root is absent');
      const git = directDirectory(resolve(root, '.git'));
      identities.set('G:.git', git);
    }
    const actualFolded = new Set<string>();
    for (const name of actual) {
      if (!pathSafe(name) || name.includes('/')) fail('unsafe physical name');
      const key = name.toLowerCase();
      if (actualFolded.has(key)) fail('case-colliding physical names');
      actualFolded.add(key);
    }
    if (actual.length !== expected.size || actual.some(name => !expected.has(name))) {
      fail('physical directory membership differs: ' + (relative || '.'));
    }
    for (const name of sorted(actual)) {
      const child = relative ? relative + '/' + name : name;
      if (plan.directories.has(child)) {
        walk(child, depth + 1);
      } else {
        const expectedBlob = plan.files.get(child);
        if (!expectedBlob) fail('unplanned physical file');
        const observed = directFile(actualPath(root, child));
        if (gitBlob(observed.bytes) !== expectedBlob) fail('physical Git blob differs: ' + child);
        identities.set('F:' + child, observed.stat);
        membership.push('F\t' + child + '\n');
        records.push('F\0' + child + '\0' + observed.bytes.length + '\0'
          + sha256(observed.bytes) + '\n');
        totalBytes += observed.bytes.length;
        fileCount++;
        if (fileCount > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) fail('physical source size exceeds limit');
      }
    }
    if (!same(before, directDirectory(path))) fail('directory changed during scan');
  };
  walk('', 0);
  if (fileCount !== plan.files.size || directoryCount !== plan.directories.size) {
    fail('physical source count differs');
  }
  const membershipText = sorted(membership).join('');
  if (Buffer.byteLength(membershipText) > MAX_MEMBERSHIP_BYTES) fail('membership output exceeds limit');
  return {
    physicalSourceDigestHex: sha256(Buffer.from(sorted(records).join(''), 'utf8')),
    physicalSourceFileCount: fileCount,
    physicalSourceDirectoryCount: directoryCount,
    physicalSourceTotalBytes: totalBytes,
    membership: membershipText,
    identities,
  };
}

function pinnedFile(path: string, hash: string, maxBytes: number,
  allowPinnedSystemHardlink = false): PinnedSupport {
  let cursor = dirname(path);
  for (;;) {
    directDirectory(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()
      || (allowPinnedSystemHardlink ? before.nlink < 1n : before.nlink !== 1n)
      || before.size <= 0n || before.size > BigInt(maxBytes)) fail('inspection tool is indirect or unbounded');
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || bytes.length !== Number(before.size) || sha256(bytes) !== hash) {
    fail('inspection tool pin differs');
  }
  return { bytes, stat: before };
}
function samePinned(before: PinnedSupport, after: PinnedSupport): boolean {
  return same(before.stat, after.stat) && before.bytes.equals(after.bytes);
}
export function compareV4PhysicalPasses(first: V4PhysicalPass, second: V4PhysicalPass): void {
  if (first.physicalSourceDigestHex !== second.physicalSourceDigestHex
      || first.physicalSourceFileCount !== second.physicalSourceFileCount
      || first.physicalSourceDirectoryCount !== second.physicalSourceDirectoryCount
      || first.physicalSourceTotalBytes !== second.physicalSourceTotalBytes
      || first.membership !== second.membership
      || first.identities.size !== second.identities.size) fail('source changed between physical passes');
  for (const [path, before] of first.identities) {
    const after = second.identities.get(path);
    if (!after || !same(before, after)) fail('source identity changed between physical passes');
  }
}

function windowsTools(): { systemRoot: string; powershell: string; jobRunner: string } {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) fail('SystemRoot is unavailable');
  return {
    systemRoot,
    powershell: resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    jobRunner: resolve(import.meta.dirname, 'scripts', 'windows-job-process.ps1'),
  };
}

// The bounded runner itself starts a PowerShell Job wrapper. Pin both layers around
// every child, including a child that fails before returning a result.
export async function withPinnedV4BoundedChildTools<T>(
  action: () => Promise<T>,
  git?: Readonly<{ path: string; sha256Hex: string; maxBytes: number }>,
): Promise<T> {
  if (process.platform !== 'win32') fail('Windows process pin is required');
  const { powershell, jobRunner } = windowsTools();
  const pins = [
    { path: powershell, hash: POWERSHELL_SHA256, maxBytes: 1_048_576, system: true },
    { path: jobRunner, hash: JOB_RUNNER_SHA256, maxBytes: 65_536, system: false },
  ];
  if (git) pins.push({ path: git.path, hash: git.sha256Hex, maxBytes: git.maxBytes, system: false });
  const before = pins.map(pin => pinnedFile(pin.path, pin.hash, pin.maxBytes, pin.system));
  try {
    return await action();
  } finally {
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      if (!samePinned(before[i], pinnedFile(pin.path, pin.hash, pin.maxBytes, pin.system))) {
        fail('bounded child tool changed');
      }
    }
  }
}

export function assertSameV4PhysicalMetadata(
  before: Readonly<V4PhysicalMetadata>,
  after: Readonly<V4PhysicalMetadata>,
): void {
  if (before.fullMembership !== after.fullMembership
      || before.sourceMembership !== after.sourceMembership) {
    fail('physical metadata membership changed');
  }
}

function parsePhysicalMetadata(text: string): V4PhysicalMetadata {
  if (!text || !text.endsWith('\n')) fail('reparse inspection membership is not LF terminated');
  const rows = text.slice(0, -1).split('\n');
  if (rows.length > MAX_DIRECTORIES || rows.some(row => row.length === 0)) {
    fail('reparse inspection entry count differs');
  }
  let previous = '';
  let hasGit = false;
  const seen = new Set<string>();
  const directories = new Set<string>();
  const sourceRows: string[] = [];
  for (const row of rows) {
    if (previous && previous >= row) fail('reparse inspection order differs');
    previous = row;
    if (!/^[DF]\t/u.test(row)) fail('reparse inspection record kind differs');
    const kind = row[0];
    const path = row.slice(2);
    if (!pathSafe(path)) fail('reparse inspection path is unsafe');
    const folded = path.toLowerCase();
    if (seen.has(folded)) fail('reparse inspection path collides');
    seen.add(folded);
    if (kind === 'D') directories.add(path);
    if (path === '.git') {
      if (kind !== 'D') fail('Git metadata root is not a directory');
      hasGit = true;
    } else if (folded === '.git' || folded.startsWith('.git/')) {
      if (!path.startsWith('.git/')) fail('Git metadata case differs');
    }
    if (path !== '.git' && !path.startsWith('.git/')) sourceRows.push(row + '\n');
  }
  if (!hasGit) fail('Git metadata root is absent');
  for (const row of rows) {
    const path = row.slice(2);
    const slash = path.lastIndexOf('/');
    if (slash >= 0 && !directories.has(path.slice(0, slash))) {
      fail('reparse inspection parent is absent');
    }
  }
  return { fullMembership: text, sourceMembership: sourceRows.join('') };
}

export async function captureV4PhysicalMetadata(root: string): Promise<V4PhysicalMetadata> {
  if (process.platform !== 'win32' || !isAbsolute(root) || root !== resolve(root)) {
    fail('Windows canonical absolute root is required');
  }
  const { systemRoot, powershell } = windowsTools();
  const inspector = resolve(import.meta.dirname, 'scripts', 'inspect-v4-physical-source.ps1');
  const inspectorBefore = pinnedFile(inspector, INSPECTOR_SHA256, 65_536);
  try {
    return await withPinnedV4BoundedChildTools(async () => {
      const result = await runBoundedProcess({
      executablePath: powershell,
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', inspector, '-Root', root],
      cwd: resolve(systemRoot, 'System32'),
      env: { SystemRoot: systemRoot, WINDIR: systemRoot,
        Path: resolve(systemRoot, 'System32') },
      timeoutMs: 30_000,
      maxOutputBytes: MAX_MEMBERSHIP_BYTES,
      maxStdoutBytes: MAX_MEMBERSHIP_BYTES,
      maxStderrBytes: 16_384,
      terminationGraceMs: 10_000,
      label: 'V4 physical reparse inspection',
      });
      if (result.exitCode !== 0 || result.stderrBytes.length !== 0) fail('reparse inspection failed');
      const base64 = result.stdoutBytes.toString('ascii');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(base64)) {
        fail('reparse inspection output is not canonical base64');
      }
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.toString('base64') !== base64 || bytes.length > MAX_MEMBERSHIP_BYTES) {
        fail('reparse inspection output is not bounded canonical base64');
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.charCodeAt(0) === 0xfeff || text.includes('\r')) fail('reparse inspection encoding differs');
      return parsePhysicalMetadata(text);
    });
  } finally {
    if (!samePinned(inspectorBefore, pinnedFile(inspector, INSPECTOR_SHA256, 65_536))) {
      fail('reparse inspection tool changed');
    }
  }
}

export async function inspectV4PhysicalSource(
  root: string,
  plan: Readonly<V4PhysicalPlan>,
  baseline: Readonly<V4PhysicalMetadata>,
  betweenPasses: () => Promise<void>,
): Promise<V4PhysicalObservation> {
  const planSnapshot = snapshotV4PhysicalPlan(plan);
  const before = await captureV4PhysicalMetadata(root);
  assertSameV4PhysicalPlanSnapshot(planSnapshot, plan);
  assertSameV4PhysicalMetadata(baseline, before);
  const first = scanV4PhysicalSourcePass(root, plan);
  if (before.sourceMembership !== first.membership) fail('first reparse membership differs');
  const middle = await captureV4PhysicalMetadata(root);
  assertSameV4PhysicalPlanSnapshot(planSnapshot, plan);
  assertSameV4PhysicalMetadata(baseline, middle);
  if (middle.sourceMembership !== first.membership) fail('middle reparse membership differs');
  await betweenPasses();
  assertSameV4PhysicalPlanSnapshot(planSnapshot, plan);
  const second = scanV4PhysicalSourcePass(root, plan);
  if (middle.sourceMembership !== second.membership) fail('second reparse membership differs');
  const after = await captureV4PhysicalMetadata(root);
  assertSameV4PhysicalPlanSnapshot(planSnapshot, plan);
  assertSameV4PhysicalMetadata(baseline, after);
  if (after.sourceMembership !== second.membership) fail('final reparse membership differs');
  compareV4PhysicalPasses(first, second);
  return Object.freeze({ physicalSourceDigestHex: second.physicalSourceDigestHex,
    physicalSourceFileCount: second.physicalSourceFileCount,
    physicalSourceDirectoryCount: second.physicalSourceDirectoryCount,
    physicalSourceTotalBytes: second.physicalSourceTotalBytes });
}
