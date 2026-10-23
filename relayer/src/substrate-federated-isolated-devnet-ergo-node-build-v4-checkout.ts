import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, type BigIntStats } from 'node:fs';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';

import {
  runBoundedProcess,
} from './bounded-process-runner.js';
import type { CheckoutObservation } from './consensus-source-baseline.js';
import {
  assertV4ErgoSourceObservation,
  type V4BuildSbtOverlayPin,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-source.js';
import {
  captureV4PhysicalMetadata,
  buildV4PhysicalPlan,
  inspectV4PhysicalSource,
  withPinnedV4BoundedChildTools,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

const EXPECTED_HEAD = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1';
const EXPECTED_TREE = '9f8d571534b21eec660ff21177adf725e50ddf02';
const EXPECTED_BUILD_BASE = '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d';
const EXPECTED_BUILD_PATCH = '7e35f6295070996d5ae0f6fc22f10737e26ee4cd';
const EXPECTED_BUILD_SHA256 = 'd67f4695b35a6ea0e1a3a9db8bcb7caa873551644cdc81c4ea72ec7a482d4935';
const EXPECTED_CONSENSUS_SHA256 = '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6';
const EXPECTED_GIT_SHA256 = '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5';
const MAX_GIT_OUTPUT_BYTES = 1_048_576;
const MAX_RAW_FILE_BYTES = 33_554_432;
const MAX_INDEX_BYTES = 8_388_608;

interface TreeEntry { readonly mode: string; readonly type: string; readonly objectId: string; readonly path: string }
interface IndexEntry { readonly mode: string; readonly objectId: string; readonly stage: string; readonly path: string }
interface DeclaredFile { readonly path: string; readonly status: 'modified' | 'added'; readonly baseBlob?: string; readonly patchedBlob: string }

export interface V4GitSnapshotBytes {
  readonly head: Buffer;
  readonly tree: Buffer;
  readonly fullTree: Buffer;
  readonly buildSbtTreeEntry: Buffer;
  readonly index: Buffer;
  readonly indexFlags: Buffer;
  readonly status: Buffer;
}

export interface V4ParsedGitSnapshot {
  readonly headBuildSbtBlob: string;
  readonly status: string;
  readonly headTreeEntries: ReadonlyMap<string, Readonly<TreeEntry>>;
}

export interface V4RawCheckoutInput {
  readonly sourcePath: string;
  readonly gitHomePath: string;
  readonly gitExecutablePath: string;
  readonly consensusSourceLockBytes: Buffer;
  readonly overlay: Readonly<V4BuildSbtOverlayPin>;
}

export interface V4RawCheckoutObservation {
  readonly checkout: Readonly<CheckoutObservation>;
  readonly headTree: typeof EXPECTED_TREE;
  readonly headBuildSbtBlob: typeof EXPECTED_BUILD_BASE;
  readonly buildSbtBytes: Buffer;
  readonly indexSha256Hex: string;
  readonly sourceIdentityDigestHex: string;
  readonly physicalSourceDigestHex: string;
  readonly physicalSourceFileCount: number;
  readonly physicalSourceDirectoryCount: number;
  readonly physicalSourceTotalBytes: number;
}

function fail(message: string): never { throw new Error('V4 raw checkout: ' + message); }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function gitBlob(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function directParents(path: string): void {
  let cursor = dirname(path);
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('linked or non-directory ancestor');
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}
function directDirectory(path: string): BigIntStats {
  directParents(path);
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Git metadata directory is indirect');
  return stat;
}
function optionalDirectory(path: string): BigIntStats | undefined {
  try { return directDirectory(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
function directFile(path: string, limit: number): { bytes: Buffer; stat: BigIntStats } {
  directParents(path);
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 0n || before.size > BigInt(limit)) fail('file is not bounded direct single-link');
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || bytes.length !== Number(before.size)) fail('file identity changed during read');
  return { bytes, stat: before };
}
function optionalFile(path: string, limit: number): { bytes: Buffer; stat: BigIntStats } | undefined {
  try { return directFile(path, limit); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
function sameOptionalStat(a: BigIntStats | undefined, b: BigIntStats | undefined): boolean {
  return a === undefined ? b === undefined : b !== undefined && same(a, b);
}
function sameOptionalFile(
  a: { bytes: Buffer; stat: BigIntStats } | undefined,
  b: { bytes: Buffer; stat: BigIntStats } | undefined,
): boolean {
  return a === undefined ? b === undefined : b !== undefined
    && same(a.stat, b.stat) && a.bytes.equals(b.bytes);
}
function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && !/[\u0000-\u001f\u007f:]/u.test(path)
    && path.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}
function text(bytes: Buffer): string {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (decoded.charCodeAt(0) === 0xfeff) fail('Git output begins with BOM');
  return decoded;
}
function nulRecords(bytes: Buffer): string[] {
  const value = text(bytes);
  if (value.length === 0) return [];
  if (!value.endsWith('\0')) fail('Git -z output is unterminated');
  const records = value.slice(0, -1).split('\0');
  if (records.some(record => record.length === 0)) fail('Git -z output contains empty record');
  return records;
}
function oneHexLine(bytes: Buffer): string {
  const value = text(bytes);
  if (!/^[0-9a-f]{40}\n$/u.test(value)) fail('Git object output is malformed');
  return value.slice(0, -1);
}
function uniquePaths(paths: readonly string[]): void {
  const seen = new Set<string>();
  for (const path of paths) {
    if (!safePath(path)) fail('unsafe checkout path');
    const folded = path.toLowerCase();
    if (seen.has(folded)) fail('duplicate or case-colliding checkout path');
    seen.add(folded);
  }
}
function parseTree(bytes: Buffer): TreeEntry[] {
  const entries = nulRecords(bytes).map(record => {
    const match = /^(100644|100755|120000) blob ([0-9a-f]{40})\t(.+)$|^(160000) commit ([0-9a-f]{40})\t(.+)$/u.exec(record);
    if (!match) fail('HEAD tree record is malformed');
    return {
      mode: match[1] ?? match[4], type: match[1] ? 'blob' : 'commit',
      objectId: match[2] ?? match[5], path: match[3] ?? match[6],
    };
  });
  uniquePaths(entries.map(entry => entry.path));
  return entries;
}
function parseIndex(bytes: Buffer): IndexEntry[] {
  const entries = nulRecords(bytes).map(record => {
    const match = /^(100644|100755|120000|160000) ([0-9a-f]{40}) ([0-3])\t(.+)$/u.exec(record);
    if (!match) fail('index record is malformed');
    return { mode: match[1], objectId: match[2], stage: match[3], path: match[4] };
  });
  uniquePaths(entries.map(entry => entry.path));
  return entries;
}
function compareIndex(head: readonly TreeEntry[], index: readonly IndexEntry[]): void {
  if (index.some(entry => entry.stage !== '0') || index.length !== head.length) fail('index differs from HEAD');
  const a = head.map(entry => entry.mode + ' ' + entry.objectId + '\t' + entry.path).sort();
  const b = index.map(entry => entry.mode + ' ' + entry.objectId + '\t' + entry.path).sort();
  if (a.some((record, i) => record !== b[i])) fail('index differs from HEAD');
}
function compareIndexFlags(bytes: Buffer, index: readonly IndexEntry[]): void {
  const records = nulRecords(bytes);
  if (records.length !== index.length) fail('index flag list differs');
  const paths = records.map(record => {
    const match = /^H (.+)$/u.exec(record);
    if (!match) fail('index has assume-unchanged, skip-worktree or unsupported flag');
    return match[1];
  });
  uniquePaths(paths);
  const expected = index.map(entry => entry.path).sort();
  if (paths.sort().some((path, i) => path !== expected[i])) fail('index flag paths differ');
}

export function parseV4GitSnapshot(
  output: Readonly<V4GitSnapshotBytes>,
  declared: readonly Readonly<DeclaredFile>[],
): V4ParsedGitSnapshot {
  if (oneHexLine(output.head) !== EXPECTED_HEAD || oneHexLine(output.tree) !== EXPECTED_TREE) {
    fail('HEAD or tree differs from V4 pinned base');
  }
  const head = parseTree(output.fullTree);
  const index = parseIndex(output.index);
  compareIndex(head, index);
  compareIndexFlags(output.indexFlags, index);
  const byPath = new Map(head.map(entry => [entry.path, entry] as const));
  const build = parseTree(output.buildSbtTreeEntry);
  if (build.length !== 1 || build[0].path !== 'build.sbt' || build[0].mode !== '100644'
      || build[0].objectId !== EXPECTED_BUILD_BASE
      || byPath.get('build.sbt')?.objectId !== EXPECTED_BUILD_BASE) {
    fail('HEAD:build.sbt blob differs');
  }
  if (declared.length !== 9) fail('nine declared paths are required');
  uniquePaths(declared.map(file => file.path));
  for (const file of declared) {
    const entry = byPath.get(file.path);
    if (file.status === 'added') {
      if (entry || file.baseBlob !== undefined) fail('added file already exists in HEAD');
    } else if (file.status === 'modified') {
      if (!entry || entry.type !== 'blob' || entry.mode === '120000'
          || entry.objectId !== file.baseBlob) fail('modified file base blob differs');
    } else fail('invalid declared status');
  }
  const observed = nulRecords(output.status).map(record => {
    const match = /^( M|\?\?) (.+)$/u.exec(record);
    if (!match || !safePath(match[2])) fail('working status contains unsupported change');
    return match[1] + ' ' + match[2];
  });
  uniquePaths(observed.map(record => record.slice(3)));
  const expected = declared.map(file => (file.status === 'added' ? '?? ' : ' M ') + file.path).sort();
  if (observed.length !== expected.length || observed.sort().some((record, i) => record !== expected[i])) {
    fail('working status differs from exactly nine declared paths');
  }
  return { headBuildSbtBlob: build[0].objectId, status: expected.join('\n'), headTreeEntries: byPath };
}

function declaredFiles(consensusBytes: Buffer, overlay: Readonly<V4BuildSbtOverlayPin>): DeclaredFile[] {
  if (sha256(consensusBytes) !== EXPECTED_CONSENSUS_SHA256) fail('consensus source lock bytes differ');
  const parsed = JSON.parse(text(consensusBytes)) as { ergoNode?: { files?: unknown } };
  const files = parsed.ergoNode?.files;
  if (!Array.isArray(files) || files.length !== 8) fail('consensus declaration count differs');
  if (overlay.path !== 'build.sbt' || overlay.status !== 'modified'
      || overlay.baseBlob !== EXPECTED_BUILD_BASE || overlay.patchedBlob !== EXPECTED_BUILD_PATCH
      || overlay.bytes !== 13660 || overlay.sha256Hex !== EXPECTED_BUILD_SHA256) {
    fail('V4 overlay differs from pinned bytes');
  }
  const declarations = files.map(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid consensus declaration');
    const file = value as Record<string, unknown>;
    const status = file.status === undefined ? 'modified' : file.status;
    if (typeof file.path !== 'string' || (status !== 'modified' && status !== 'added')
        || typeof file.patchedBlob !== 'string') fail('invalid consensus declaration');
    return { path: file.path, status, baseBlob: file.baseBlob as string | undefined,
      patchedBlob: file.patchedBlob } as DeclaredFile;
  });
  declarations.push({ path: 'build.sbt', status: 'modified', baseBlob: overlay.baseBlob,
    patchedBlob: overlay.patchedBlob });
  uniquePaths(declarations.map(file => file.path));
  return declarations;
}
function gitEnvironment(gitPath: string, gitHomePath: string): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) fail('SystemRoot is unavailable');
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot, Path: dirname(gitPath) + ';' + resolve(systemRoot, 'System32'),
    HOME: gitHomePath, USERPROFILE: gitHomePath, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL',
    GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
  };
}
function sameDirectoryIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
}
function stableNames(path: string): string[] {
  const before = directDirectory(path);
  const names = readdirSync(path).sort();
  if (!same(before, directDirectory(path))) fail('isolated Git HOME directory changed during enumeration');
  return names;
}
function exactNames(path: string, expected: readonly string[]): void {
  const actual = stableNames(path);
  if (actual.length !== expected.length || actual.some((name, i) => name !== expected[i])) {
    fail('isolated Git HOME has unknown entries');
  }
}
function knownGitHomeShape(home: string): void {
  const before = directDirectory(home);
  const rootNames = stableNames(home);
  if (rootNames.length === 0) return;
  exactNames(home, ['AppData']);
  const appData = resolve(home, 'AppData');
  exactNames(appData, ['Local', 'Roaming']);
  exactNames(resolve(appData, 'Roaming'), []);
  const local = resolve(appData, 'Local');
  const localBefore = directDirectory(local);
  if (stableNames(local).length === 0) {
    exactNames(local, []);
    if (!sameDirectoryIdentity(localBefore, directDirectory(local))) {
      fail('isolated Git HOME Local identity changed');
    }
  } else {
    exactNames(local, ['Microsoft']);
    const microsoft = resolve(local, 'Microsoft');
    exactNames(microsoft, ['Windows']);
    const windows = resolve(microsoft, 'Windows');
    exactNames(windows, ['PowerShell']);
    const powershell = resolve(windows, 'PowerShell');
    exactNames(powershell, ['StartupProfileData-NonInteractive']);
    const leaf = resolve(powershell, 'StartupProfileData-NonInteractive');
    directParents(leaf);
    const leafBefore = lstatSync(leaf, { bigint: true });
    if (!leafBefore.isFile() || leafBefore.isSymbolicLink() || leafBefore.nlink !== 1n
        || leafBefore.size <= 0n || leafBefore.size > 16_384n
        || !same(leafBefore, lstatSync(leaf, { bigint: true }))) {
      fail('isolated Git HOME cache metadata differs');
    }
  }
  if (!sameDirectoryIdentity(before, directDirectory(home))) {
    fail('isolated Git HOME identity changed during enumeration');
  }
}

// The Git child may cause its bounded PowerShell Job wrapper to create this
// one known scratch cache. It is outside the physically inventoried checkout.
// Cache contents are never read or used as source or campaign evidence.
export function prepareV4GitHome(sourcePath: string, gitHomePath: string): () => void {
  if (process.platform !== 'win32' || !isAbsolute(sourcePath)
      || typeof gitHomePath !== 'string' || !isAbsolute(gitHomePath)
      || /(^|[\\/])\.\.?([\\/]|$)/u.test(gitHomePath)) {
    fail('Windows absolute canonical Git HOME path is required');
  }
  const source = resolve(sourcePath);
  const home = resolve(gitHomePath);
  const ownedRoot = dirname(source);
  const lowerHome = home.toLowerCase();
  const lowerOwned = ownedRoot.toLowerCase();
  if (parse(home).root.toLowerCase() !== 'd:\\'
      || lowerHome === lowerOwned || lowerHome.startsWith(lowerOwned + sep.toLowerCase())) {
    fail('Git HOME must be on D outside the owned source root');
  }
  const initial = directDirectory(home);
  exactNames(home, []);
  if (!same(initial, directDirectory(home))) fail('initial Git HOME changed');
  return () => {
    if (!sameDirectoryIdentity(initial, directDirectory(home))) fail('isolated Git HOME identity changed');
    knownGitHomeShape(home);
    if (!sameDirectoryIdentity(initial, directDirectory(home))) fail('isolated Git HOME identity changed');
  };
}
function assertConfigNames(bytes: Buffer): void {
  const names = text(bytes).split('\n').filter(Boolean);
  for (const name of names) {
    if (!/^[a-z0-9._-]+$/u.test(name) || /^(?:include|includeif|filter)\./u.test(name)
        || /^remote\.[a-z0-9._-]+\.(?:promisor|partialclonefilter)$/u.test(name)
        || /^(?:core\.(?:worktree|fsmonitor|hookspath|attributesfile|excludesfile|sparsecheckout)|extensions\.(?:worktreeconfig|partialclone))$/u.test(name)) {
      fail('local Git config has unsupported active key');
    }
  }
}
function absent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('unsupported Git indirection or alternates exists');
}

export async function inspectV4RawErgoCheckout(input: Readonly<V4RawCheckoutInput>): Promise<V4RawCheckoutObservation> {
  if (process.platform !== 'win32' || !isAbsolute(input.sourcePath) || !isAbsolute(input.gitExecutablePath)) {
    fail('Windows absolute source and Git paths are required');
  }
  const source = resolve(input.sourcePath);
  const git = resolve(input.gitExecutablePath);
  const assertGitHome = prepareV4GitHome(source, input.gitHomePath);
  const physicalBaseline = await captureV4PhysicalMetadata(source);
  directParents(source);
  const sourceBefore = lstatSync(source, { bigint: true });
  if (!sourceBefore.isDirectory() || sourceBefore.isSymbolicLink()) fail('source is linked or not a directory');
  const gitDir = resolve(source, '.git');
  const gitDirBefore = lstatSync(gitDir, { bigint: true });
  if (!gitDirBefore.isDirectory() || gitDirBefore.isSymbolicLink()) fail('Git metadata is indirect');
  const objectsBefore = directDirectory(resolve(gitDir, 'objects'));
  const objectInfoBefore = directDirectory(resolve(gitDir, 'objects', 'info'));
  const objectPackBefore = directDirectory(resolve(gitDir, 'objects', 'pack'));
  const infoBefore = optionalDirectory(resolve(gitDir, 'info'));
  const excludeBefore = infoBefore ? optionalFile(resolve(gitDir, 'info', 'exclude'), 65536) : undefined;
  const attributesBefore = infoBefore ? optionalFile(resolve(gitDir, 'info', 'attributes'), 65536) : undefined;
  absent(resolve(gitDir, 'bridge-no-global-home'));
  absent(resolve(gitDir, 'commondir'));
  absent(resolve(gitDir, 'config.worktree'));
  absent(resolve(gitDir, 'objects', 'info', 'alternates'));
  const gitBefore = directFile(git, 131072);
  if (sha256(gitBefore.bytes) !== EXPECTED_GIT_SHA256) fail('Git executable pin differs');
  const indexBefore = directFile(resolve(gitDir, 'index'), MAX_INDEX_BYTES);
  const configBefore = directFile(resolve(gitDir, 'config'), 65536);
  const declarations = declaredFiles(input.consensusSourceLockBytes, input.overlay);
  const env = gitEnvironment(git, resolve(input.gitHomePath));
  const prefix = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'core.autocrlf=false', '--no-optional-locks', '-C', source];
  const query = async (args: string[], label: string): Promise<Buffer> => {
    assertGitHome();
    return await withPinnedV4BoundedChildTools(async () => {
      const result = await runBoundedProcess({ executablePath: git, args: [...prefix, ...args], cwd: source, env,
        timeoutMs: 30000, maxOutputBytes: MAX_GIT_OUTPUT_BYTES, maxStdoutBytes: MAX_GIT_OUTPUT_BYTES,
        maxStderrBytes: 16384, terminationGraceMs: 10000, label: 'V4 checkout ' + label });
      assertGitHome();
      if (result.exitCode !== 0 || result.stderrBytes.length !== 0
          || result.stdoutBytes.length > MAX_GIT_OUTPUT_BYTES) fail('bounded Git query failed: ' + label);
      return result.stdoutBytes;
    }, { path: git, sha256Hex: EXPECTED_GIT_SHA256, maxBytes: 131072 });
  };
  assertConfigNames(await query(['config', '--local', '--no-includes', '--name-only', '--list'], 'config'));
  const output: V4GitSnapshotBytes = {
    head: await query(['rev-parse', '--verify', 'HEAD'], 'HEAD'),
    tree: await query(['rev-parse', '--verify', 'HEAD^{tree}'], 'tree'),
    fullTree: await query(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], 'full tree'),
    buildSbtTreeEntry: await query(['ls-tree', '-z', '--full-tree', 'HEAD', '--', 'build.sbt'], 'build.sbt base'),
    index: await query(['ls-files', '--stage', '-z'], 'index'),
    indexFlags: await query(['ls-files', '-v', '-z'], 'index flags'),
    status: await query(['status', '--porcelain=v1', '-z', '--untracked-files=all'], 'status'),
  };
  const parsed = parseV4GitSnapshot(output, declarations);
  const blobs: Record<string, string> = {};
  const raw = new Map<string, { bytes: Buffer; stat: BigIntStats }>();
  for (const file of declarations) {
    const path = resolve(source, ...file.path.split('/'));
    if (!path.startsWith(source + sep)) fail('declared file escapes source');
    const observed = directFile(path, MAX_RAW_FILE_BYTES);
    if (gitBlob(observed.bytes) !== file.patchedBlob) fail('raw working blob differs: ' + file.path);
    blobs[file.path] = file.patchedBlob;
    raw.set(file.path, observed);
  }
  const physical = await inspectV4PhysicalSource(source,
    buildV4PhysicalPlan(parsed.headTreeEntries, declarations), physicalBaseline, async () => {
      if (oneHexLine(await query(['rev-parse', '--verify', 'HEAD'], 'final HEAD')) !== EXPECTED_HEAD
          || oneHexLine(await query(['rev-parse', '--verify', 'HEAD^{tree}'], 'final tree')) !== EXPECTED_TREE) {
        fail('HEAD or tree changed during observation');
      }
      const finalStatus = await query(['status', '--porcelain=v1', '-z', '--untracked-files=all'], 'final status');
      if (!finalStatus.equals(output.status)) fail('working status changed during observation');
      const indexAfter = directFile(resolve(gitDir, 'index'), MAX_INDEX_BYTES);
      const configAfter = directFile(resolve(gitDir, 'config'), 65536);
      const gitAfter = directFile(git, 131072);
      const objectsAfter = directDirectory(resolve(gitDir, 'objects'));
      const objectInfoAfter = directDirectory(resolve(gitDir, 'objects', 'info'));
      const objectPackAfter = directDirectory(resolve(gitDir, 'objects', 'pack'));
      const infoAfter = optionalDirectory(resolve(gitDir, 'info'));
      const excludeAfter = infoAfter ? optionalFile(resolve(gitDir, 'info', 'exclude'), 65536) : undefined;
      const attributesAfter = infoAfter ? optionalFile(resolve(gitDir, 'info', 'attributes'), 65536) : undefined;
      if (!same(indexBefore.stat, indexAfter.stat) || !indexBefore.bytes.equals(indexAfter.bytes)
          || !same(configBefore.stat, configAfter.stat) || !configBefore.bytes.equals(configAfter.bytes)
          || !same(gitBefore.stat, gitAfter.stat) || !gitBefore.bytes.equals(gitAfter.bytes)
          || !same(sourceBefore, lstatSync(source, { bigint: true }))
          || !same(gitDirBefore, lstatSync(gitDir, { bigint: true }))
          || !same(objectsBefore, objectsAfter) || !same(objectInfoBefore, objectInfoAfter)
          || !same(objectPackBefore, objectPackAfter) || !sameOptionalStat(infoBefore, infoAfter)
          || !sameOptionalFile(excludeBefore, excludeAfter)
          || !sameOptionalFile(attributesBefore, attributesAfter)) fail('Git source identity changed');
      absent(resolve(gitDir, 'bridge-no-global-home'));
      absent(resolve(gitDir, 'commondir'));
      absent(resolve(gitDir, 'config.worktree'));
      absent(resolve(gitDir, 'objects', 'info', 'alternates'));
      assertGitHome();
      for (const file of declarations) {
        const current = directFile(resolve(source, ...file.path.split('/')), MAX_RAW_FILE_BYTES);
        const previous = raw.get(file.path)!;
        if (!same(previous.stat, current.stat) || !previous.bytes.equals(current.bytes)) {
          fail('raw file changed during observation: ' + file.path);
        }
      }
    });
  const checkout: CheckoutObservation = { head: EXPECTED_HEAD, status: parsed.status, blobs };
  const buildSbtBytes = raw.get('build.sbt')!.bytes;
  const checked = assertV4ErgoSourceObservation({ consensusSourceLockBytes: input.consensusSourceLockBytes,
    overlay: input.overlay, checkout, buildSbtBytes, headBuildSbtBlob: parsed.headBuildSbtBlob });
  assertGitHome();
  return Object.freeze({ checkout: Object.freeze(checkout), headTree: EXPECTED_TREE,
    headBuildSbtBlob: EXPECTED_BUILD_BASE, buildSbtBytes: Buffer.from(buildSbtBytes),
    indexSha256Hex: sha256(indexBefore.bytes), sourceIdentityDigestHex: checked.sourceIdentityDigestHex,
    physicalSourceDigestHex: physical.physicalSourceDigestHex,
    physicalSourceFileCount: physical.physicalSourceFileCount,
    physicalSourceDirectoryCount: physical.physicalSourceDirectoryCount,
    physicalSourceTotalBytes: physical.physicalSourceTotalBytes });
}
