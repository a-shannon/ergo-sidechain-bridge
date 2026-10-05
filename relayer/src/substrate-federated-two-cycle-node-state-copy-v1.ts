import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, opendirSync, readSync, realpathSync, renameSync, writeFileSync, writeSync,
  type Stats,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

export const SUBSTRATE_FEDERATED_TWO_CYCLE_NODE_STATE_COPY_V1_SCHEMA =
  'e2s.substrate-federated-two-cycle-node-state-copy.v1' as const;

export interface TwoCycleNodeStateCopyInputV1 {
  readonly kind: 'frontier' | 'ergo';
  /** Already-stopped, owner-exposed base paths (Frontier) or data paths (Ergo). */
  readonly primaryRoot: string;
  readonly witnessRoot: string;
  /** Fresh directory under an existing, caller-controlled private parent. */
  readonly destinationDirectory: string;
  /** Owner must prove process shutdown and absence of writers/listeners. Called twice.
   * This callback is a precondition, not a shutdown receipt or consistency proof. */
  readonly assertSourcesQuiescent: () => void | Promise<void>;
  readonly maxFiles?: number;
  readonly maxTotalBytes?: number;
  readonly maxFileBytes?: number;
}

export interface TwoCycleNodeStateCopyManifestV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_TWO_CYCLE_NODE_STATE_COPY_V1_SCHEMA;
  readonly kind: 'frontier' | 'ergo';
  readonly files: readonly Readonly<{
    node: 'primary' | 'witness'; path: string; bytes: number; sha256Hex: string;
  }>[];
  readonly totalBytes: number;
  readonly nodeConsistencyEstablished: false;
  readonly freshRestartValidated: false;
}

const SUBTREES = Object.freeze({
  frontier: ['chains/bridge_federated_v4_genesis/db/full',
    'chains/bridge_federated_v4_genesis/frontier/db'],
  ergo: ['state', 'history'],
});
const MAX_DEPTH = 64;
const MAX_ENTRIES = 500_000;
type Entry = { node: 'primary' | 'witness'; path: string; directory: boolean;
  identity: string; bytes: number; sha256Hex?: string };
type Bounds = { files: number; total: number; file: number };

/** Copies only the fixed database subtrees. No key, wallet, network, config,
 * node-launch or execution-authority route exists. All path parents and roots
 * must remain under exclusive caller control throughout this operation; portable
 * Node filesystem APIs do not provide an adversarial filesystem sandbox.
 * Matching bytes do not prove database consistency: owner stop/listener evidence
 * and fresh-process restart/tip validation are separate caller obligations. */
export async function copySubstrateFederatedTwoCycleNodeStateV1(
  input: TwoCycleNodeStateCopyInputV1,
): Promise<Readonly<TwoCycleNodeStateCopyManifestV1>> {
  const kind = input.kind;
  if (kind !== 'frontier' && kind !== 'ergo') throw new Error('unsupported node database layout');
  const guard = input.assertSourcesQuiescent;
  if (typeof guard !== 'function') throw new Error('source quiescence guard is required');
  const bounds: Bounds = {
    files: bound(input.maxFiles ?? 100_000, 250_000),
    total: bound(input.maxTotalBytes ?? 64 * 1024 ** 3, 1024 ** 4),
    file: bound(input.maxFileBytes ?? 16 * 1024 ** 3, 1024 ** 4),
  };
  const roots = { primary: checkedPath(input.primaryRoot, true),
    witness: checkedPath(input.witnessRoot, true) };
  const output = absolutePath(input.destinationDirectory);
  const parent = checkedPath(dirname(output), true);
  for (const [a, b] of [[roots.primary, roots.witness], [roots.primary, output],
    [roots.witness, output]]) {
    if (inside(a, b) || inside(b, a)) throw new Error('node source and destination roots overlap');
  }
  if (output === parent) throw new Error('invalid copy destination');
  assertAbsent(output);
  const rootIdentities = [identity(lstatSync(roots.primary)), identity(lstatSync(roots.witness))];
  const parentIdentity = identity(lstatSync(parent), false);
  await guard();
  checkRoots();
  const before = inventory(roots, SUBTREES[kind], bounds);
  const staging = mkdtempSync(join(parent, `.${basename(output)}.partial-`));
  // Failed partials remain private and inspectable. They are never returned as exports.
  for (const entry of before) {
    const source = join(roots[entry.node], entry.path);
    const target = join(staging, entry.node, entry.path);
    checkedPath(source, entry.directory);
    if (entry.directory) {
      mkdirSync(target, { recursive: true, mode: 0o700 });
    } else {
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      checkedPath(dirname(target), true);
      if (hashFile(source, bounds.file, target, entry.identity).sha256Hex !== entry.sha256Hex) {
        throw new Error('source database file drifted during copy');
      }
    }
  }
  await guard();
  checkRoots();
  checkedPath(parent, true);
  if (identity(lstatSync(parent), false) !== parentIdentity) throw new Error('destination parent changed');
  if (JSON.stringify(inventory(roots, SUBTREES[kind], bounds)) !== JSON.stringify(before)) {
    throw new Error('source database tree drifted during copy');
  }
  checkedPath(staging, true);
  const copiedRoots = { primary: checkedPath(join(staging, 'primary'), true),
    witness: checkedPath(join(staging, 'witness'), true) };
  const copied = inventory(copiedRoots, SUBTREES[kind], bounds);
  const content = (entries: Entry[]) => entries.map(({ identity: _identity, ...entry }) => entry);
  if (JSON.stringify(content(copied)) !== JSON.stringify(content(before))) {
    throw new Error('destination database tree differs from source');
  }
  // Also inspect the structural ancestors, so added files outside the allowlist reject.
  assertExactDestination(staging, before);
  const files = Object.freeze(before.filter(entry => !entry.directory).map(entry => Object.freeze({
    node: entry.node, path: entry.path, bytes: entry.bytes, sha256Hex: entry.sha256Hex!,
  })));
  const manifest = Object.freeze({
    schema: SUBSTRATE_FEDERATED_TWO_CYCLE_NODE_STATE_COPY_V1_SCHEMA,
    kind, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    nodeConsistencyEstablished: false as const, freshRestartValidated: false as const,
  });
  assertAbsent(output);
  const manifestPath = join(staging, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const manifestFd = openSync(manifestPath, 'r+');
  try { fsyncSync(manifestFd); } finally { closeSync(manifestFd); }
  // The manifest is written last; the directory rename publishes the completed copy.
  renameSync(staging, output);
  return manifest;

  function checkRoots(): void {
    for (const [index, root] of [roots.primary, roots.witness].entries()) {
      checkedPath(root, true);
      if (identity(lstatSync(root)) !== rootIdentities[index]) throw new Error('node source root drifted');
    }
  }
}

function inventory(roots: { primary: string; witness: string }, subtrees: readonly string[], bounds: Bounds) {
  const entries: Entry[] = [];
  let files = 0;
  let total = 0;
  let discovered = 0;
  for (const node of ['primary', 'witness'] as const) {
    for (const subtree of subtrees) {
      if (++discovered > MAX_ENTRIES) throw new Error('database tree entry bound exceeded');
      const startFiles = files;
      const startBytes = total;
      visit(subtree, 0);
      if (files === startFiles || total === startBytes) throw new Error('required database subtree is empty');
    }
    function visit(path: string, depth: number): void {
      if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES) throw new Error('database tree entry/depth bound exceeded');
      const source = join(roots[node], path);
      const stat = lstatSync(source);
      const directory = stat.isDirectory();
      checkedPath(source, directory);
      if (depth === 0 && !directory) throw new Error('required database subtree is not a directory');
      const entry: Entry = { node, path, directory, identity: identity(stat), bytes: directory ? 0 : stat.size };
      entries.push(entry);
      if (directory) {
        // Bounds are checked before retaining a potentially unbounded directory listing.
        const names = boundedNames(source, MAX_ENTRIES - discovered);
        discovered += names.length;
        for (const name of names) visit(`${path}/${name}`, depth + 1);
      } else {
        if (++files > bounds.files || stat.size > bounds.file || total + stat.size > bounds.total) {
          throw new Error('database file/byte bound exceeded');
        }
        total += stat.size;
        entry.sha256Hex = hashFile(source, bounds.file, undefined, entry.identity).sha256Hex;
      }
    }
  }
  return entries;
}

function hashFile(path: string, limit: number, copyTo?: string, expectedIdentity?: string) {
  checkedPath(path, false);
  const sourceFd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let targetFd: number | undefined;
  try {
    const before = fstatSync(sourceFd);
    if (!before.isFile() || before.nlink !== 1 || before.size > limit
      || (expectedIdentity !== undefined && identity(before) !== expectedIdentity)) {
      throw new Error('database source file identity or size changed');
    }
    if (copyTo !== undefined) targetFd = openSync(copyTo, 'wx', 0o600);
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    for (;;) {
      const length = readSync(sourceFd, buffer, 0, Math.min(buffer.length, limit - bytes + 1), null);
      if (length === 0) break;
      bytes += length;
      if (bytes > limit || bytes > before.size) throw new Error('database file grew during copy');
      hash.update(buffer.subarray(0, length));
      if (targetFd !== undefined) {
        let written = 0;
        while (written < length) {
          const count = writeSync(targetFd, buffer, written, length - written);
          if (count < 1) throw new Error('database copy write made no progress');
          written += count;
        }
      }
    }
    checkedPath(path, false);
    if (bytes !== before.size || identity(fstatSync(sourceFd)) !== identity(before)
      || identity(lstatSync(path)) !== identity(before)) throw new Error('database file drifted');
    if (targetFd !== undefined) fsyncSync(targetFd);
    return { bytes, sha256Hex: hash.digest('hex') };
  } finally {
    closeSync(sourceFd);
    if (targetFd !== undefined) closeSync(targetFd);
  }
}

function assertExactDestination(root: string, entries: Entry[]): void {
  const expected = new Set<string>();
  for (const entry of entries) {
    let path = `${entry.node}/${entry.path}`;
    for (;;) {
      expected.add(path);
      const index = path.lastIndexOf('/');
      if (index < 0) break;
      path = path.slice(0, index);
    }
  }
  let seen = 0;
  let discovered = 0;
  function names(path: string): string[] {
    const result = boundedNames(path, expected.size - discovered);
    discovered += result.length;
    return result;
  }
  function visit(path: string): void {
    if (!expected.has(path) || ++seen > expected.size) throw new Error('unexpected destination entry');
    const absolute = join(root, path);
    const directory = lstatSync(absolute).isDirectory();
    checkedPath(absolute, directory);
    if (directory) for (const name of names(absolute)) visit(`${path}/${name}`);
  }
  for (const name of names(root)) visit(name);
  if (seen !== expected.size) throw new Error('missing destination entry');
}

function boundedNames(path: string, limit: number): string[] {
  const names: string[] = [];
  const listing = opendirSync(path);
  try {
    for (let child = listing.readSync(); child !== null; child = listing.readSync()) {
      if (names.length >= limit) throw new Error('database tree entry bound exceeded');
      safeName(child.name);
      names.push(child.name);
    }
  } finally { listing.closeSync(); }
  return names.sort();
}

function bound(value: number, ceiling: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error('invalid node copy bound');
  return value;
}
function safeName(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/:\0]/.test(name)
    || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    throw new Error('unsafe database path component');
  }
}
function absolutePath(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new Error('copy paths must be absolute');
  if (path.split(/[\\/]/).includes('..')) throw new Error('parent path traversal is forbidden');
  const absolute = resolve(path);
  for (const name of relative(parse(absolute).root, absolute).split(sep).filter(Boolean)) safeName(name);
  return absolute;
}
function checkedPath(path: string, directory: boolean): string {
  const absolute = absolutePath(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (current !== absolute && !stat.isDirectory())) throw new Error('path alias or invalid ancestor');
  }
  const stat = lstatSync(absolute);
  if ((directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) {
    throw new Error('unexpected database entry type or hardlink');
  }
  const canonical = realpathSync.native(absolute);
  if ((process.platform === 'win32' ? canonical.toLowerCase() !== absolute.toLowerCase() : canonical !== absolute)) {
    throw new Error('canonical path alias is forbidden');
  }
  return absolute;
}
function identity(stat: Stats, includeTimes = true): string {
  return JSON.stringify([stat.dev, stat.ino, stat.mode, stat.nlink,
    ...(includeTimes ? [stat.size, stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs] : [])]);
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
function assertAbsent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('copy destination already exists');
}
