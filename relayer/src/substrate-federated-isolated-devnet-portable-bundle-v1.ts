import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
  type BigIntStats,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './strict-json.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-files-v1.js';

export const
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA =
    'e2s.substrate-federated-isolated-devnet-portable-bundle-assembly.v1' as const;

export const
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE =
    'portable-replay-request.v1.json' as const;

export type SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1 =
  keyof typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1;

export type SubstrateFederatedIsolatedDevnetPortableSourcePathsV1 = Readonly<
  Record<SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1, string>
>;

export interface AssembleSubstrateFederatedIsolatedDevnetPortableBundleV1Input {
  readonly destinationDirectory: string;
  readonly sources:
    SubstrateFederatedIsolatedDevnetPortableSourcePathsV1;
}

export interface SubstrateFederatedIsolatedDevnetPortableBundleAssemblyV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA;
  readonly version: 1;
  readonly artifactCount: 17;
  readonly artifactByteCount: number;
  readonly requestFile:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE;
}

interface StableFile {
  readonly path: string;
  readonly canonicalPath: string;
  readonly canonicalPathIdentity: string;
  readonly stat: BigIntStats;
}

interface ResolvedSource extends StableFile {
  readonly fileIdentity: string;
}

interface StagedFile {
  readonly file: StableFile;
  readonly expectedBytes: Buffer;
  readonly label: string;
}

interface OutputTarget {
  readonly finalDirectory: string;
  readonly parentDirectory: string;
  readonly parentIdentity: BigIntStats;
}

const ARTIFACT_ROLES = Object.freeze(Object.keys(
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
) as SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1[]);

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const WORKTREE_ROOT = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));

export function assembleSubstrateFederatedIsolatedDevnetPortableBundleV1(
  input: Readonly<AssembleSubstrateFederatedIsolatedDevnetPortableBundleV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetPortableBundleAssemblyV1> {
  if (ARTIFACT_ROLES.length !== 17) {
    throw new Error('isolated portable bundle requires exactly 17 artifact roles');
  }
  const record = exactDataRecord(input, [
    'destinationDirectory',
    'sources',
  ], 'isolated portable bundle assembly input');
  const target = resolveOutputTarget(record.destinationDirectory);
  const sourceRecord = exactDataRecord(
    record.sources,
    ARTIFACT_ROLES,
    'isolated portable bundle source paths',
  );

  const canonicalPaths = new Set<string>();
  const fileIdentities = new Set<string>();
  const resolvedSources = new Map<
    SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
    ResolvedSource
  >();
  for (const role of ARTIFACT_ROLES) {
    const source = resolveSourcePath(sourceRecord[role], role);
    if (
      canonicalPaths.has(source.canonicalPathIdentity)
      || fileIdentities.has(source.fileIdentity)
    ) {
      throw new Error('isolated portable bundle source files must be distinct');
    }
    canonicalPaths.add(source.canonicalPathIdentity);
    fileIdentities.add(source.fileIdentity);
    resolvedSources.set(role, source);
  }

  const artifacts = new Map<
    SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
    Buffer
  >();
  let artifactByteCount = 0;
  for (const role of ARTIFACT_ROLES) {
    const source = resolvedSources.get(role)!;
    const bytes = readStableBoundedFile(
      source,
      `isolated portable ${role} source`,
      MAX_ARTIFACT_BYTES,
    );
    artifacts.set(role, bytes);
    artifactByteCount += bytes.byteLength;
  }

  publishBundle(target, artifacts);
  return Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA,
    version: 1 as const,
    artifactCount: 17 as const,
    artifactByteCount,
    requestFile:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
  });
}

function resolveOutputTarget(value: unknown): Readonly<OutputTarget> {
  const requested = explicitAbsoluteNonRemoteSyntaxPath(
    value,
    'isolated portable bundle destination',
  );
  if (/\.partial(?:-|$)/i.test(basename(requested))) {
    throw new Error('isolated portable bundle destination must not be partial');
  }
  assertPathAbsent(requested, 'isolated portable bundle destination');
  const parentPath = dirname(requested);
  const parentIdentity = safeLstat(
    parentPath,
    'isolated portable bundle destination parent',
  );
  const canonicalParent = safeRealpath(
    parentPath,
    'isolated portable bundle destination parent',
  );
  if (
    !isStableDirectory(parentIdentity)
    || canonicalPathIdentity(canonicalParent)
      !== canonicalPathIdentity(parentPath)
  ) {
    throw new Error(
      'isolated portable bundle destination parent must be one regular non-UNC directory',
    );
  }
  const finalDirectory = join(canonicalParent, basename(requested));
  if (isPathInside(WORKTREE_ROOT, finalDirectory)) {
    throw new Error('isolated portable bundle must remain outside the Git worktree');
  }
  return Object.freeze({
    finalDirectory,
    parentDirectory: canonicalParent,
    parentIdentity,
  });
}

function resolveSourcePath(
  value: unknown,
  role: SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
): Readonly<ResolvedSource> {
  const path = explicitAbsoluteNonRemoteSyntaxPath(
    value,
    `isolated portable ${role} source`,
  );
  const stat = safeLstat(path, `isolated portable ${role} source`);
  const canonicalPath = safeRealpath(
    path,
    `isolated portable ${role} source`,
  );
  const canonicalStat = safeLstat(
    canonicalPath,
    `isolated portable ${role} canonical source`,
  );
  if (
    canonicalPathIdentity(canonicalPath) !== canonicalPathIdentity(path)
    || !isStableSingleLinkFile(stat)
    || !sameStableFile(stat, canonicalStat)
  ) {
    throw new Error(
      `isolated portable ${role} source must be one stable single-link file at an explicit non-UNC path`,
    );
  }
  return Object.freeze({
    path,
    canonicalPath,
    canonicalPathIdentity: canonicalPathIdentity(canonicalPath),
    fileIdentity: stableFileIdentity(stat),
    stat,
  });
}

function readStableBoundedFile(
  source: Readonly<StableFile>,
  label: string,
  maximumBytes: number,
): Buffer {
  const beforeOpen = safeLstat(source.path, label);
  if (!sameStableFile(source.stat, beforeOpen)) {
    throw new Error(`${label} changed after source selection`);
  }
  let descriptor: number;
  try {
    descriptor = openSync(source.path, constants.O_RDONLY);
  } catch {
    throw new Error(`${label} could not be opened`);
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const afterOpen = safeLstat(source.path, label);
    assertStableFile(source, beforeOpen, opened, afterOpen, label);
    if (opened.size <= 0n || opened.size > BigInt(maximumBytes)) {
      throw new Error(`${label} size is outside the bounded limit`);
    }
    const bytes = Buffer.allocUnsafe(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      let count: number;
      try {
        count = readSync(
          descriptor,
          bytes,
          offset,
          bytes.length - offset,
          null,
        );
      } catch {
        throw new Error(`${label} could not be read`);
      }
      if (count <= 0) throw new Error(`${label} changed while being read`);
      offset += count;
    }
    let trailing: number;
    try {
      trailing = readSync(
        descriptor,
        Buffer.allocUnsafe(1),
        0,
        1,
        null,
      );
    } catch {
      throw new Error(`${label} could not be read`);
    }
    if (trailing !== 0) throw new Error(`${label} grew while being read`);

    const afterRead = fstatSync(descriptor, { bigint: true });
    const finalPath = safeLstat(source.path, label);
    assertStableFile(source, opened, afterRead, finalPath, label);
    if (
      BigInt(bytes.byteLength) !== opened.size
      || afterRead.size !== opened.size
      || afterRead.mtimeNs !== opened.mtimeNs
      || afterRead.ctimeNs !== opened.ctimeNs
    ) {
      throw new Error(`${label} changed while being read`);
    }
    return Buffer.from(bytes);
  } finally {
    closeSync(descriptor);
  }
}

function assertStableFile(
  source: Readonly<StableFile>,
  expected: BigIntStats,
  descriptor: BigIntStats,
  currentPath: BigIntStats,
  label: string,
): void {
  if (
    !isStableSingleLinkFile(descriptor)
    || !isStableSingleLinkFile(currentPath)
    || !sameStableFile(expected, descriptor)
    || !sameStableFile(descriptor, currentPath)
    || canonicalPathIdentity(safeRealpath(source.path, label))
      !== source.canonicalPathIdentity
  ) {
    throw new Error(`${label} identity changed while being read`);
  }
}

function publishBundle(
  target: Readonly<OutputTarget>,
  artifacts: ReadonlyMap<
    SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
    Buffer
  >,
): void {
  assertSameDirectory(
    target.parentDirectory,
    target.parentIdentity,
    'isolated portable bundle destination parent',
  );
  assertPathAbsent(target.finalDirectory, 'isolated portable bundle destination');
  const stagingDirectory = join(
    target.parentDirectory,
    `.${basename(target.finalDirectory)}.partial-${randomUUID()}`,
  );
  try {
    mkdirSync(stagingDirectory, { mode: 0o700 });
  } catch {
    throw new Error('isolated portable bundle staging directory could not be created');
  }
  const stagingIdentity = safeLstat(
    stagingDirectory,
    'isolated portable bundle staging directory',
  );
  assertSameDirectory(
    stagingDirectory,
    stagingIdentity,
    'isolated portable bundle staging directory',
  );

  let published = false;
  try {
    const stagedFiles: StagedFile[] = [];
    const directories = createCanonicalDirectories(
      stagingDirectory,
      stagingIdentity,
    );
    for (const role of ARTIFACT_ROLES) {
      const relativePath =
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1[role];
      const path = join(stagingDirectory, ...relativePath.split('/'));
      const parent = directories.get(dirnameRelative(relativePath))!;
      const label = `isolated portable ${role} artifact`;
      const file = writeNewBundleFile(
        path,
        artifacts.get(role)!,
        parent,
        label,
      );
      stagedFiles.push(Object.freeze({
        file,
        expectedBytes: artifacts.get(role)!,
        label,
      }));
    }

    const request = Object.freeze({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
      version: 1 as const,
      files:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
    });
    const requestBytes = Buffer.from(`${canonicalJson(request)}\n`, 'utf8');
    const requestLabel = 'isolated portable replay request';
    const requestFile = writeNewBundleFile(
      join(
        stagingDirectory,
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
      ),
      requestBytes,
      stagingIdentity,
      requestLabel,
    );
    stagedFiles.push(Object.freeze({
      file: requestFile,
      expectedBytes: requestBytes,
      label: requestLabel,
    }));

    for (const staged of stagedFiles) {
      const currentBytes = readStableBoundedFile(
        staged.file,
        staged.label,
        MAX_ARTIFACT_BYTES,
      );
      if (!currentBytes.equals(staged.expectedBytes)) {
        throw new Error(`${staged.label} content changed before publication`);
      }
    }

    assertSameDirectory(
      stagingDirectory,
      stagingIdentity,
      'isolated portable bundle staging directory',
    );
    assertSameDirectory(
      target.parentDirectory,
      target.parentIdentity,
      'isolated portable bundle destination parent',
    );
    assertPathAbsent(
      target.finalDirectory,
      'isolated portable bundle destination',
    );
    try {
      renameSync(stagingDirectory, target.finalDirectory);
    } catch {
      throw new Error('isolated portable bundle could not be published');
    }
    published = true;
    assertSameDirectory(
      target.finalDirectory,
      stagingIdentity,
      'isolated portable published bundle',
    );
  } catch (error) {
    if (published) throw error;
    try {
      removeStagingDirectory(target, stagingDirectory, stagingIdentity);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'isolated portable bundle assembly and cleanup both failed',
      );
    }
    throw error;
  }
}

function createCanonicalDirectories(
  stagingDirectory: string,
  stagingIdentity: BigIntStats,
): ReadonlyMap<string, BigIntStats> {
  const relativeDirectories = new Set<string>();
  for (const relativePath of Object.values(
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  )) {
    const segments = relativePath.split('/').slice(0, -1);
    for (let count = 1; count <= segments.length; count += 1) {
      relativeDirectories.add(segments.slice(0, count).join('/'));
    }
  }
  const ordered = [...relativeDirectories].sort((left, right) => {
    const depth = left.split('/').length - right.split('/').length;
    return depth === 0 ? left.localeCompare(right) : depth;
  });
  const identities = new Map<string, BigIntStats>([['.', stagingIdentity]]);
  for (const relativePath of ordered) {
    const parentRelative = dirnameRelative(relativePath);
    const parent = identities.get(parentRelative)!;
    const path = join(stagingDirectory, ...relativePath.split('/'));
    assertSameDirectory(
      dirname(path),
      parent,
      'isolated portable bundle staging parent',
    );
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch {
      throw new Error('isolated portable bundle staging path could not be created');
    }
    const identity = safeLstat(path, 'isolated portable bundle staging path');
    assertSameDirectory(path, identity, 'isolated portable bundle staging path');
    identities.set(relativePath, identity);
  }
  return identities;
}

function writeNewBundleFile(
  path: string,
  bytes: Uint8Array,
  parentIdentity: BigIntStats,
  label: string,
): Readonly<StableFile> {
  const parentPath = dirname(path);
  assertSameDirectory(parentPath, parentIdentity, `${label} parent`);
  let descriptor: number | undefined;
  try {
    try {
      descriptor = openSync(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
    } catch {
      throw new Error(`${label} could not be created`);
    }
    const opened = fstatSync(descriptor, { bigint: true });
    const currentPath = safeLstat(path, label);
    if (
      !isStableSingleLinkFile(opened)
      || !sameFileIdentity(opened, currentPath)
      || opened.size !== 0n
      || canonicalPathIdentity(safeRealpath(path, label))
        !== canonicalPathIdentity(path)
    ) {
      throw new Error(`${label} identity changed while being created`);
    }
    let offset = 0;
    while (offset < bytes.byteLength) {
      let count: number;
      try {
        count = writeSync(
          descriptor,
          bytes,
          offset,
          bytes.byteLength - offset,
          null,
        );
      } catch {
        throw new Error(`${label} could not be written`);
      }
      if (count <= 0) throw new Error(`${label} could not be written`);
      offset += count;
    }
    try {
      fsyncSync(descriptor);
    } catch {
      throw new Error(`${label} could not be synchronized`);
    }
    const written = fstatSync(descriptor, { bigint: true });
    const finalPath = safeLstat(path, label);
    assertSameDirectory(parentPath, parentIdentity, `${label} parent`);
    if (
      !isStableSingleLinkFile(written)
      || !sameFileIdentity(opened, written)
      || !sameFileIdentity(written, finalPath)
      || written.size !== BigInt(bytes.byteLength)
      || canonicalPathIdentity(safeRealpath(path, label))
        !== canonicalPathIdentity(path)
    ) {
      throw new Error(`${label} changed while being written`);
    }
    return Object.freeze({
      path,
      canonicalPath: path,
      canonicalPathIdentity: canonicalPathIdentity(path),
      stat: written,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function removeStagingDirectory(
  target: Readonly<OutputTarget>,
  stagingDirectory: string,
  stagingIdentity: BigIntStats,
): void {
  assertSameDirectory(
    target.parentDirectory,
    target.parentIdentity,
    'isolated portable bundle destination parent during cleanup',
  );
  if (!isPathInside(target.parentDirectory, stagingDirectory)) {
    throw new Error('isolated portable bundle staging path escaped its parent');
  }
  assertSameDirectory(
    stagingDirectory,
    stagingIdentity,
    'isolated portable bundle staging directory during cleanup',
  );
  try {
    rmSync(stagingDirectory, { recursive: true, force: false });
  } catch {
    throw new Error('isolated portable bundle staging directory could not be removed');
  }
}

function explicitAbsoluteNonRemoteSyntaxPath(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || hasSensitivePath(value)
    || hasRemoteOrDeviceNamespace(value)
  ) {
    throw new Error(
      `${label} must be an absolute non-sensitive path without explicit remote or device syntax`,
    );
  }
  const absolute = resolve(value);
  if (hasRemoteOrDeviceNamespace(absolute)) {
    throw new Error(`${label} must not use a remote or device namespace`);
  }
  return absolute;
}

function assertPathAbsent(path: string, label: string): void {
  try {
    lstatSync(path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error(`${label} availability could not be established`);
  }
  throw new Error(`${label} must not already exist`);
}

function assertSameDirectory(
  path: string,
  expected: BigIntStats,
  label: string,
): void {
  const stat = safeLstat(path, label);
  if (
    !isStableDirectory(stat)
    || !sameFileIdentity(expected, stat)
    || canonicalPathIdentity(safeRealpath(path, label))
      !== canonicalPathIdentity(path)
  ) {
    throw new Error(`${label} identity changed`);
  }
}

function isStableDirectory(stat: BigIntStats): boolean {
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && stat.dev > 0n
    && stat.ino > 0n;
}

function isStableSingleLinkFile(stat: BigIntStats): boolean {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.dev > 0n
    && stat.ino > 0n;
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev > 0n
    && left.ino > 0n
    && right.dev > 0n
    && right.ino > 0n
    && left.dev === right.dev
    && left.ino === right.ino;
}

function sameStableFile(left: BigIntStats, right: BigIntStats): boolean {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function stableFileIdentity(stat: BigIntStats): string {
  if (!isStableSingleLinkFile(stat)) {
    throw new Error('isolated portable source lacks a stable file identity');
  }
  return `inode:${stat.dev}:${stat.ino}`;
}

function canonicalPathIdentity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === ''
    || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function dirnameRelative(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '.' : path.slice(0, index);
}

function hasSensitivePath(value: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|[^\\/]*(?:mnemonic|seed[-_ ]?phrase|private[-_ ]?key|api[-_ ]?key|credential|secret|wallet|deployed[-_ ]state|deployment[-_ ]state)[^\\/]*|[^\\/]+\.(?:sqlite(?:3)?|db|log))(?:[\\/]|$)/i.test(value);
}

function hasRemoteOrDeviceNamespace(value: string): boolean {
  const normalized = value.replaceAll('/', '\\');
  return normalized.startsWith('\\\\')
    || /^\\\\[?.]\\/.test(normalized)
    || /^[A-Za-z]:[^\\]/.test(normalized);
}

function safeLstat(path: string, label: string): BigIntStats {
  try {
    return lstatSync(path, { bigint: true });
  } catch {
    throw new Error(`${label} is unavailable`);
  }
}

function safeRealpath(path: string, label: string): string {
  try {
    return realpathSync(path);
  } catch {
    throw new Error(`${label} cannot be resolved`);
  }
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Readonly<Record<K, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} has unexpected fields`);
  }
  const result = {} as Record<K, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
