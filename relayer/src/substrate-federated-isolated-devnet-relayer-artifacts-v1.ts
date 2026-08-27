import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
} from 'node:path';

import {
  build as buildWithEsbuild,
  version as esbuildVersion,
  type BuildResult,
  type Metafile,
  type OutputFile,
} from 'esbuild';

import {
  canonicalPathIdentity,
  isPathInside,
} from './create-only-out-of-repository-artifact.js';
import { canonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACTS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-relayer-artifacts.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RUNTIME_ENTRYPOINTS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-runtime-entrypoints.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BUILD_ARCHIVE_V1_MAGIC =
  'E2SRBA01' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1 =
  Object.freeze({
    sourceArchive: 'relayer-source-archive.bin',
    packageLock: 'relayer-package-lock.bin',
    runtimeEntrypoints: 'relayer-runtime-entrypoints.bin',
    buildArtifact: 'relayer-build-artifact.bin',
    receipt: 'relayer-artifacts-receipt.v1.json',
  } as const);

const EXPECTED_ESBUILD_VERSION = '0.28.1';
const EXPECTED_WASM_PACK_VERSION = '0.14.0';
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_TOOL_BYTES = 128 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_GIT_SOURCE_BLOB_BYTES = 48 * 1024 * 1024;
const MAX_GIT_BLOB_BATCH_ENTRY_FRAMING_BYTES = 56;
const MAX_GIT_BLOB_BATCH_OUTPUT_BYTES = 64 * 1024 * 1024;
const BUILD_ARCHIVE_VERSION = 1;
const SCRATCH_DIRECTORY_PREFIX = '.e2s-rba-build-';

const SOURCE_ARCHIVE_PATHS = Object.freeze([
  'relayer',
  'wasm-avl',
  'sources/consensus-source-lock.json',
  'solidity/compiled/build-manifest.json',
  'solidity/compiled/ErgoBridge.runtime.bin',
  'solidity/compiled/SERG.runtime.bin',
] as const);

const RUNTIME_ENTRYPOINTS = Object.freeze([
  Object.freeze({
    source: 'relayer/src/relayer-daemon.ts',
    output: 'relayer/dist/relayer-daemon.js',
  }),
  Object.freeze({
    source: 'relayer/src/scripts/operator-alert-external-worker.ts',
    output: 'relayer/dist/scripts/operator-alert-external-worker.js',
  }),
  Object.freeze({
    source: 'relayer/src/scripts/operator-alert-acknowledge.ts',
    output: 'relayer/dist/scripts/operator-alert-acknowledge.js',
  }),
] as const);

const WASM_RUNTIME_FILES = Object.freeze([
  'wasm-avl/pkg/bridge_avl.js',
  'wasm-avl/pkg/bridge_avl_bg.wasm',
  'wasm-avl/pkg/package.json',
] as const);

export interface ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input {
  readonly bridgeRoot: string;
  readonly gitExecutable: string;
  readonly wasmPackExecutable: string;
  readonly expectedHeadCommitSha1Hex: string;
  readonly destinationDirectory: string;
}

export interface SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1 {
  readonly file: string;
  readonly sizeBytes: number;
  readonly sha256Hex: string;
}

export interface SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACTS_V1_SCHEMA;
  readonly version: 1;
  readonly headCommitSha1Hex: string;
  readonly artifactSetDigestHex: string;
  readonly artifacts: Readonly<{
    readonly sourceArchive:
      Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1>;
    readonly packageLock:
      Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1>;
    readonly runtimeEntrypoints:
      Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1>;
    readonly buildArtifact:
      Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1>;
  }>;
  readonly boundaries: Readonly<{
    readonly buildToolchainAuthenticated: false;
    readonly fixedLocalVolumesAuthenticated: false;
    readonly crossPlatformNoReplaceEstablished: false;
    readonly targetHistoryAuthenticated: false;
    readonly ergoHistoryAuthenticated: false;
    readonly sourceAttestationCreated: false;
    readonly sourceAttestationVerified: false;
    readonly targetApproved: false;
    readonly nodeAcceptanceEstablished: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetBuildArchiveEntryV1 {
  readonly path: string;
  readonly bytes: Uint8Array;
}

interface StablePath {
  readonly path: string;
  readonly canonicalPath: string;
  readonly stat: BigIntStats;
}

interface RepositorySnapshot {
  readonly repositoryRoot: string;
  readonly bridgeRoot: string;
  readonly bridgePrefix: string;
  readonly headCommitSha1Hex: string;
  readonly headCommitUnixTime: string;
  readonly gitVersion: string;
  readonly gitExecutableSha256Hex: string;
  readonly sourceArchive: Buffer;
  readonly archivePaths: readonly string[];
  readonly trackedBlobs:
    readonly Readonly<SubstrateFederatedIsolatedDevnetTrackedBlobV1>[];
}

export interface SubstrateFederatedIsolatedDevnetTrackedBlobV1 {
  readonly path: string;
  readonly objectSha1Hex: string;
  readonly executable: boolean;
}

interface BuiltRuntime {
  readonly packageLock: Buffer;
  readonly runtimeEntrypoints: Buffer;
  readonly buildArtifact: Buffer;
}

interface OutputTarget {
  readonly finalDirectory: string;
  readonly parentDirectory: string;
  readonly parentIdentity: BigIntStats;
}

export async function produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1(
  input: Readonly<ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt>> {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('isolated relayer artifact production requires Node 24.x');
  }
  if (process.platform !== 'win32') {
    throw new Error(
      'isolated relayer artifact publication requires reviewed Windows no-replace rename semantics',
    );
  }
  const record = exactDataRecord(input, [
    'bridgeRoot',
    'gitExecutable',
    'wasmPackExecutable',
    'expectedHeadCommitSha1Hex',
    'destinationDirectory',
  ], 'isolated relayer artifact producer input');
  const expectedHeadCommitSha1Hex = commitSha1(
    record.expectedHeadCommitSha1Hex,
    'expected relayer artifact HEAD',
  );
  const gitExecutable = resolveStableFile(
    record.gitExecutable,
    'relayer artifact Git executable',
    MAX_TOOL_BYTES,
  );
  const wasmPackExecutable = resolveStableFile(
    record.wasmPackExecutable,
    'relayer artifact wasm-pack executable',
    MAX_TOOL_BYTES,
  );
  const bridgeRoot = resolveStableDirectory(
    record.bridgeRoot,
    'relayer artifact bridge root',
  );
  const snapshot = captureRepositorySnapshot(
    bridgeRoot,
    gitExecutable,
    expectedHeadCommitSha1Hex,
  );
  const target = resolveOutputTarget(
    record.destinationDirectory,
    snapshot.repositoryRoot,
  );
  const wasmPackVersion = readToolVersion(
    wasmPackExecutable,
    ['--version'],
    /^wasm-pack 0\.14\.0$/u,
    'wasm-pack',
  );
  if (esbuildVersion !== EXPECTED_ESBUILD_VERSION) {
    throw new Error('relayer artifact esbuild version differs from the reviewed version');
  }

  const scratchDirectory = join(
    target.parentDirectory,
    `${SCRATCH_DIRECTORY_PREFIX}${randomUUID()}`,
  );
  let scratchIdentity: BigIntStats | undefined;
  try {
    mkdirSync(scratchDirectory, { mode: 0o700 });
    scratchIdentity = lstatBigInt(
      scratchDirectory,
      'relayer artifact scratch directory',
    );
    assertStableDirectory(
      scratchDirectory,
      scratchIdentity,
      'relayer artifact scratch directory',
    );
    checkoutSnapshot(snapshot, gitExecutable, scratchDirectory);
    const scratchBridgeRoot = snapshot.bridgePrefix.length === 0
      ? scratchDirectory
      : join(scratchDirectory, ...snapshot.bridgePrefix.split('/'));
    const built = await buildRuntimeArtifacts({
      scratchBridgeRoot,
      snapshot,
      wasmPackExecutable,
      wasmPackVersion,
    });
    const artifacts = Object.freeze({
      sourceArchive: Buffer.from(snapshot.sourceArchive),
      packageLock: built.packageLock,
      runtimeEntrypoints: built.runtimeEntrypoints,
      buildArtifact: built.buildArtifact,
    });
    for (const [role, bytes] of Object.entries(artifacts)) {
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_ARTIFACT_BYTES) {
        throw new Error(`relayer artifact ${role} size is outside the portable limit`);
      }
    }
    assertRepositoryClosureUnchanged(snapshot, gitExecutable);
    const receipt = buildReceipt(snapshot.headCommitSha1Hex, artifacts);
    publishArtifacts(target, artifacts, receipt);
    return receipt;
  } finally {
    if (scratchIdentity !== undefined) removeOwnedDirectory(
      target.parentDirectory,
      scratchDirectory,
      scratchIdentity,
      'relayer artifact scratch directory',
    );
  }
}

export function encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(
  input: readonly Readonly<SubstrateFederatedIsolatedDevnetBuildArchiveEntryV1>[],
): Buffer {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32) {
    throw new Error('relayer build archive requires between 1 and 32 entries');
  }
  const entries = input.map(entry => {
    const record = exactDataRecord(entry, ['path', 'bytes'], 'relayer build archive entry');
    const path = canonicalArchivePath(record.path);
    if (!(record.bytes instanceof Uint8Array)) {
      throw new Error('relayer build archive entry bytes must be a Uint8Array');
    }
    const bytes = Buffer.from(record.bytes);
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_ARTIFACT_BYTES) {
      throw new Error('relayer build archive entry size is outside the bounded limit');
    }
    return Object.freeze({ path, bytes });
  }).sort((left, right) => compareStrings(left.path, right.path));
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]!.path === entries[index]!.path) {
      throw new Error('relayer build archive paths must be unique');
    }
  }
  const chunks: Buffer[] = [
    Buffer.from(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BUILD_ARCHIVE_V1_MAGIC, 'ascii'),
    uint32Be(BUILD_ARCHIVE_VERSION),
    uint32Be(entries.length),
  ];
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, 'utf8');
    chunks.push(
      uint32Be(pathBytes.byteLength),
      uint64Be(entry.bytes.byteLength),
      Buffer.from(sha256Hex(entry.bytes), 'hex'),
      pathBytes,
      entry.bytes,
    );
  }
  const archive = Buffer.concat(chunks);
  if (archive.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error('relayer build archive exceeds the portable artifact limit');
  }
  return archive;
}

export function decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(
  input: Uint8Array,
): readonly Readonly<SubstrateFederatedIsolatedDevnetBuildArchiveEntryV1>[] {
  const bytes = Buffer.from(input);
  if (bytes.byteLength < 16) throw new Error('relayer build archive is truncated');
  if (bytes.subarray(0, 8).toString('ascii')
    !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BUILD_ARCHIVE_V1_MAGIC) {
    throw new Error('relayer build archive magic is unsupported');
  }
  if (bytes.readUInt32BE(8) !== BUILD_ARCHIVE_VERSION) {
    throw new Error('relayer build archive version is unsupported');
  }
  const count = bytes.readUInt32BE(12);
  if (count === 0 || count > 32) throw new Error('relayer build archive entry count is invalid');
  const entries: SubstrateFederatedIsolatedDevnetBuildArchiveEntryV1[] = [];
  let offset = 16;
  let previousPath = '';
  for (let index = 0; index < count; index += 1) {
    if (offset + 44 > bytes.byteLength) throw new Error('relayer build archive entry is truncated');
    const pathLength = bytes.readUInt32BE(offset);
    const contentLength = readSafeUInt64(bytes, offset + 4, 'relayer build archive content length');
    const expectedDigest = bytes.subarray(offset + 12, offset + 44).toString('hex');
    offset += 44;
    if (pathLength === 0 || pathLength > 4096 || offset + pathLength + contentLength > bytes.byteLength) {
      throw new Error('relayer build archive entry bounds are invalid');
    }
    const pathBytes = bytes.subarray(offset, offset + pathLength);
    const path = canonicalArchivePath(pathBytes.toString('utf8'));
    if (!Buffer.from(path, 'utf8').equals(pathBytes)) {
      throw new Error('relayer build archive path encoding is not canonical');
    }
    offset += pathLength;
    const content = Buffer.from(bytes.subarray(offset, offset + contentLength));
    offset += contentLength;
    if (path <= previousPath || sha256Hex(content) !== expectedDigest) {
      throw new Error('relayer build archive ordering or content digest is invalid');
    }
    previousPath = path;
    entries.push(Object.freeze({ path, bytes: content }));
  }
  if (offset !== bytes.byteLength) throw new Error('relayer build archive has trailing bytes');
  const canonical = encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(entries);
  if (!canonical.equals(bytes)) throw new Error('relayer build archive encoding is not canonical');
  return Object.freeze(entries);
}

function captureRepositorySnapshot(
  bridge: Readonly<StablePath>,
  git: Readonly<StablePath>,
  expectedHeadCommitSha1Hex: string,
): Readonly<RepositorySnapshot> {
  const repositoryRootText = runTextTool(
    git.path,
    ['-C', bridge.canonicalPath, 'rev-parse', '--show-toplevel'],
    bridge.canonicalPath,
    safeGitEnvironment(),
    'Git repository-root query',
  );
  const repositoryRoot = resolveStableDirectory(
    repositoryRootText,
    'relayer artifact Git repository root',
  );
  if (!isPathInside(repositoryRoot.canonicalPath, bridge.canonicalPath)) {
    throw new Error('relayer artifact bridge root is outside the Git worktree');
  }
  const bridgePrefix = normalizeRelativePath(relative(
    repositoryRoot.canonicalPath,
    bridge.canonicalPath,
  ));
  const archivePaths = SOURCE_ARCHIVE_PATHS.map(path => repositoryPath(
    bridgePrefix,
    path,
  ));
  const headCommitSha1Hex = commitSha1(runTextTool(
    git.path,
    ['-C', repositoryRoot.canonicalPath, 'rev-parse', 'HEAD'],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git HEAD query',
  ), 'observed relayer artifact HEAD');
  if (headCommitSha1Hex !== expectedHeadCommitSha1Hex) {
    throw new Error('relayer artifact HEAD differs from the explicit expected commit');
  }
  const status = runBinaryTool(
    git.path,
    ['-C', repositoryRoot.canonicalPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...archivePaths],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git source status query',
  );
  if (status.byteLength !== 0) {
    throw new Error('relayer artifact source closure is not clean');
  }
  runToolExpectSuccess(
    git.path,
    [
      '-C', repositoryRoot.canonicalPath,
      'diff', '--quiet', expectedHeadCommitSha1Hex, '--', ...archivePaths,
    ],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git source/index comparison',
  );
  const tree = runBinaryTool(
    git.path,
    [
      '-C', repositoryRoot.canonicalPath,
      'ls-tree', '-r', '-z', expectedHeadCommitSha1Hex, '--', ...archivePaths,
    ],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git source-tree inventory',
  );
  const trackedBlobs = parseTrackedBlobs(tree);
  if (trackedBlobs.length === 0) throw new Error('relayer artifact source closure is empty');
  const sourceArchive = runBinaryTool(
    git.path,
    [
      '-C', repositoryRoot.canonicalPath,
      'archive', '--format=zip', expectedHeadCommitSha1Hex, '--', ...archivePaths,
    ],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git source archive',
  );
  if (sourceArchive.byteLength <= 0 || sourceArchive.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error('relayer source archive size is outside the portable limit');
  }
  const headCommitUnixTime = canonicalUnsignedDecimal(runTextTool(
    git.path,
    [
      '-C', repositoryRoot.canonicalPath,
      'show', '-s', '--format=%ct', expectedHeadCommitSha1Hex,
    ],
    repositoryRoot.canonicalPath,
    safeGitEnvironment(),
    'Git commit-time query',
  ), 'relayer artifact commit time');
  const gitVersion = readToolVersion(
    git,
    ['--version'],
    /^git version [0-9]+\.[0-9]+\.[0-9]+(?:\.[^\s]+)?$/u,
    'Git',
  );
  return Object.freeze({
    repositoryRoot: repositoryRoot.canonicalPath,
    bridgeRoot: bridge.canonicalPath,
    bridgePrefix,
    headCommitSha1Hex,
    headCommitUnixTime,
    gitVersion,
    gitExecutableSha256Hex: sha256StableFile(git, MAX_TOOL_BYTES, 'Git executable'),
    sourceArchive: Buffer.from(sourceArchive),
    archivePaths,
    trackedBlobs,
  });
}

function checkoutSnapshot(
  snapshot: Readonly<RepositorySnapshot>,
  git: Readonly<StablePath>,
  scratchDirectory: string,
): void {
  const input = Buffer.from(
    `${snapshot.trackedBlobs.map(blob => blob.objectSha1Hex).join('\n')}\n`,
    'ascii',
  );
  const batch = runBinaryTool(
    git.path,
    ['-C', snapshot.repositoryRoot, 'cat-file', '--batch'],
    snapshot.repositoryRoot,
    safeGitEnvironment(),
    'Git source blob batch',
    input,
    maximumSubstrateFederatedIsolatedDevnetGitBlobBatchBytesV1(
      snapshot.trackedBlobs.length,
    ),
  );
  const materialized = decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
    batch,
    snapshot.trackedBlobs,
  );
  for (const [index, blob] of snapshot.trackedBlobs.entries()) {
    const file = resolve(scratchDirectory, ...blob.path.split('/'));
    const parent = dirname(file);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const parentIdentity = lstatBigInt(parent, 'checked-out relayer source parent');
    assertStableDirectory(parent, parentIdentity, 'checked-out relayer source parent');
    writeNewFile(file, materialized[index]!, parentIdentity);
    const stat = lstatBigInt(file, 'checked-out relayer source');
    if (!isStableSingleLinkFile(stat) || realpathSync(file) !== file) {
      throw new Error('checked-out relayer source is not one regular single-link file');
    }
  }
}

function assertRepositoryClosureUnchanged(
  snapshot: Readonly<RepositorySnapshot>,
  git: Readonly<StablePath>,
): void {
  const currentHead = commitSha1(runTextTool(
    git.path,
    ['-C', snapshot.repositoryRoot, 'rev-parse', 'HEAD'],
    snapshot.repositoryRoot,
    safeGitEnvironment(),
    'final Git HEAD query',
  ), 'final relayer artifact HEAD');
  if (currentHead !== snapshot.headCommitSha1Hex) {
    throw new Error('relayer artifact HEAD changed during production');
  }
  const status = runBinaryTool(
    git.path,
    [
      '-C', snapshot.repositoryRoot,
      'status', '--porcelain=v1', '-z', '--untracked-files=all',
      '--', ...snapshot.archivePaths,
    ],
    snapshot.repositoryRoot,
    safeGitEnvironment(),
    'final Git source status query',
  );
  if (status.byteLength !== 0) {
    throw new Error('relayer artifact source closure changed during production');
  }
  runToolExpectSuccess(
    git.path,
    [
      '-C', snapshot.repositoryRoot,
      'diff', '--quiet', snapshot.headCommitSha1Hex, '--', ...snapshot.archivePaths,
    ],
    snapshot.repositoryRoot,
    safeGitEnvironment(),
    'final Git source/index comparison',
  );
}

async function buildRuntimeArtifacts(input: {
  readonly scratchBridgeRoot: string;
  readonly snapshot: Readonly<RepositorySnapshot>;
  readonly wasmPackExecutable: Readonly<StablePath>;
  readonly wasmPackVersion: string;
}): Promise<Readonly<BuiltRuntime>> {
  const relayerRoot = join(input.scratchBridgeRoot, 'relayer');
  const wasmRoot = join(input.scratchBridgeRoot, 'wasm-avl');
  const packageLock = readStableFile(
    join(relayerRoot, 'package-lock.json'),
    MAX_ARTIFACT_BYTES,
    'relayer package lock',
  );
  const packageJson = readStableFile(
    join(relayerRoot, 'package.json'),
    MAX_ARTIFACT_BYTES,
    'relayer package manifest',
  );
  runToolExpectSuccess(
    input.wasmPackExecutable.path,
    [
      'build',
      '--mode', 'no-install',
      '--target', 'nodejs',
      '--release',
      '--out-dir', 'pkg',
      '--', '--locked', '--offline',
    ],
    wasmRoot,
    safeBuildEnvironment(
      input.snapshot.headCommitUnixTime,
      input.scratchBridgeRoot,
    ),
    'offline wasm-pack build',
  );

  const esbuildResult = await buildWithEsbuild({
    absWorkingDir: relayerRoot,
    entryPoints: RUNTIME_ENTRYPOINTS.map(entry => entry.source.slice('relayer/'.length)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
    outdir: 'dist',
    outbase: 'src',
    entryNames: '[dir]/[name]',
    write: false,
    metafile: true,
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
    plugins: [{
      name: 'external-reviewed-wasm-avl',
      setup(build) {
        build.onResolve({ filter: /bridge_avl[.]js$/ }, args => {
          if (!normalizeToolPath(args.path).endsWith('wasm-avl/pkg/bridge_avl.js')) {
            throw new Error('unexpected bridge_avl import path');
          }
          return { path: args.path, external: true };
        });
      },
    }],
  });
  assertEsbuildResult(esbuildResult);
  const outputByPath = new Map<string, Buffer>();
  for (const output of esbuildResult.outputFiles!) {
    const relativeOutput = normalizeRelativePath(relative(
      input.scratchBridgeRoot,
      output.path,
    ));
    if (!RUNTIME_ENTRYPOINTS.some(entry => entry.output === relativeOutput)) {
      throw new Error('esbuild emitted an unexpected relayer runtime output');
    }
    outputByPath.set(relativeOutput, Buffer.from(output.contents));
  }
  if (outputByPath.size !== RUNTIME_ENTRYPOINTS.length) {
    throw new Error('esbuild did not emit every reviewed relayer runtime entrypoint');
  }
  for (const path of WASM_RUNTIME_FILES) {
    outputByPath.set(path, readStableFile(
      join(input.scratchBridgeRoot, ...path.split('/')),
      MAX_ARTIFACT_BYTES,
      'generated WASM runtime artifact',
    ));
  }
  outputByPath.set('relayer/package.json', packageJson);
  const buildEntries = [...outputByPath.entries()]
    .map(([path, bytes]) => Object.freeze({ path, bytes }));
  const buildArtifact = encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(
    buildEntries,
  );
  const runtimeEntrypoints = buildRuntimeEntrypointsManifest({
    scratchBridgeRoot: input.scratchBridgeRoot,
    snapshot: input.snapshot,
    packageLock,
    esbuildResult,
    wasmPackExecutable: input.wasmPackExecutable,
    wasmPackVersion: input.wasmPackVersion,
    buildEntries,
  });
  return Object.freeze({
    packageLock,
    runtimeEntrypoints,
    buildArtifact,
  });
}

function buildRuntimeEntrypointsManifest(input: {
  readonly scratchBridgeRoot: string;
  readonly snapshot: Readonly<RepositorySnapshot>;
  readonly packageLock: Buffer;
  readonly esbuildResult: Readonly<BuildResult & { metafile: Metafile }>;
  readonly wasmPackExecutable: Readonly<StablePath>;
  readonly wasmPackVersion: string;
  readonly buildEntries:
    readonly Readonly<SubstrateFederatedIsolatedDevnetBuildArchiveEntryV1>[];
}): Buffer {
  const sourceInputs = Object.keys(input.esbuildResult.metafile.inputs)
    .map(path => normalizeRelativePath(path))
    .sort(compareStrings)
    .map(path => {
      if (!path.startsWith('src/')) {
        throw new Error('esbuild consumed a source outside the reviewed relayer source root');
      }
      const bytes = readStableFile(
        join(input.scratchBridgeRoot, 'relayer', ...path.split('/')),
        MAX_ARTIFACT_BYTES,
        'relayer runtime source input',
      );
      return Object.freeze({
        path: `relayer/${path}`,
        sizeBytes: bytes.byteLength,
        sha256Hex: sha256Hex(bytes),
      });
    });
  const externalImports = Object.values(input.esbuildResult.metafile.outputs)
    .flatMap(output => output.imports.filter(item => item.external).map(item => Object.freeze({
      path: item.path,
      kind: item.kind,
    })))
    .sort((left, right) => compareStrings(
      `${left.path}\0${left.kind}`,
      `${right.path}\0${right.kind}`,
    ));
  const manifest = Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RUNTIME_ENTRYPOINTS_V1_SCHEMA,
    version: 1 as const,
    headCommitSha1Hex: input.snapshot.headCommitSha1Hex,
    sourceArchivePaths: SOURCE_ARCHIVE_PATHS,
    entrypoints: RUNTIME_ENTRYPOINTS,
    sourceInputs,
    externalImports,
    buildEntries: input.buildEntries
      .map(entry => Object.freeze({
        path: entry.path,
        sizeBytes: entry.bytes.byteLength,
        sha256Hex: sha256Hex(entry.bytes),
      }))
      .sort((left, right) => compareStrings(left.path, right.path)),
    packageLock: Object.freeze({
      path: 'relayer/package-lock.json',
      sizeBytes: input.packageLock.byteLength,
      sha256Hex: sha256Hex(input.packageLock),
    }),
    tools: Object.freeze({
      nodeVersion: process.version,
      esbuildVersion,
      gitVersion: input.snapshot.gitVersion,
      gitExecutableSha256Hex: input.snapshot.gitExecutableSha256Hex,
      wasmPackVersion: input.wasmPackVersion,
      wasmPackExecutableSha256Hex: sha256StableFile(
        input.wasmPackExecutable,
        MAX_TOOL_BYTES,
        'wasm-pack executable',
      ),
      rustSourcePathRemapping: 'local-prefix-redaction-v1' as const,
    }),
    externalMutableInputs: Object.freeze([
      'operator-supplied environment',
      'deployment-state file',
      'runtime database',
      'network endpoints and credentials',
    ]),
    boundaries: falseBoundaries(),
  });
  return Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8');
}

function buildReceipt(
  headCommitSha1Hex: string,
  artifacts: Readonly<{
    readonly sourceArchive: Buffer;
    readonly packageLock: Buffer;
    readonly runtimeEntrypoints: Buffer;
    readonly buildArtifact: Buffer;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt> {
  const identities = Object.freeze({
    sourceArchive: artifactIdentity(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.sourceArchive,
      artifacts.sourceArchive,
    ),
    packageLock: artifactIdentity(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.packageLock,
      artifacts.packageLock,
    ),
    runtimeEntrypoints: artifactIdentity(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.runtimeEntrypoints,
      artifacts.runtimeEntrypoints,
    ),
    buildArtifact: artifactIdentity(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.buildArtifact,
      artifacts.buildArtifact,
    ),
  });
  return Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACTS_V1_SCHEMA,
    version: 1 as const,
    headCommitSha1Hex,
    artifactSetDigestHex: sha256Hex(Buffer.from(canonicalJson(identities), 'utf8')),
    artifacts: identities,
    boundaries: falseBoundaries(),
  });
}

function publishArtifacts(
  target: Readonly<OutputTarget>,
  artifacts: Readonly<{
    readonly sourceArchive: Buffer;
    readonly packageLock: Buffer;
    readonly runtimeEntrypoints: Buffer;
    readonly buildArtifact: Buffer;
  }>,
  receipt: Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt>,
): void {
  assertStableDirectory(
    target.parentDirectory,
    target.parentIdentity,
    'relayer artifact destination parent',
  );
  assertPathAbsent(target.finalDirectory, 'relayer artifact destination');
  const stagingDirectory = join(
    target.parentDirectory,
    `.${basename(target.finalDirectory)}.partial-${randomUUID()}`,
  );
  mkdirSync(stagingDirectory, { mode: 0o700 });
  const stagingIdentity = lstatBigInt(
    stagingDirectory,
    'relayer artifact staging directory',
  );
  assertStableDirectory(
    stagingDirectory,
    stagingIdentity,
    'relayer artifact staging directory',
  );
  let published = false;
  try {
    const files = [
      [SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.sourceArchive, artifacts.sourceArchive],
      [SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.packageLock, artifacts.packageLock],
      [SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.runtimeEntrypoints, artifacts.runtimeEntrypoints],
      [SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.buildArtifact, artifacts.buildArtifact],
      [SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.receipt,
        Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8')],
    ] as const;
    for (const [name, bytes] of files) {
      writeNewFile(join(stagingDirectory, name), bytes, stagingIdentity);
    }
    for (const [name, bytes] of files) {
      const observed = readStableFile(
        join(stagingDirectory, name),
        MAX_ARTIFACT_BYTES,
        'staged relayer artifact',
      );
      if (!observed.equals(bytes)) {
        throw new Error('staged relayer artifact content changed before publication');
      }
    }
    assertStableDirectory(
      target.parentDirectory,
      target.parentIdentity,
      'relayer artifact destination parent',
    );
    assertPathAbsent(target.finalDirectory, 'relayer artifact destination');
    renameSync(stagingDirectory, target.finalDirectory);
    published = true;
    assertStableDirectory(
      target.finalDirectory,
      stagingIdentity,
      'published relayer artifact directory',
    );
  } catch (error) {
    if (published) throw error;
    removeOwnedDirectory(
      target.parentDirectory,
      stagingDirectory,
      stagingIdentity,
      'relayer artifact staging directory',
    );
    throw error;
  }
}

function resolveOutputTarget(value: unknown, repositoryRoot: string): Readonly<OutputTarget> {
  const requested = explicitAbsolutePath(value, 'relayer artifact destination');
  if (/\.partial(?:-|$)|\.build(?:-|$)/iu.test(basename(requested))) {
    throw new Error('relayer artifact destination must not use a transient name');
  }
  assertPathAbsent(requested, 'relayer artifact destination');
  const parent = resolveStableDirectory(dirname(requested), 'relayer artifact destination parent');
  const finalDirectory = join(parent.canonicalPath, basename(requested));
  if (isPathInside(repositoryRoot, finalDirectory)) {
    throw new Error('relayer artifacts must be written outside the Git worktree');
  }
  return Object.freeze({
    finalDirectory,
    parentDirectory: parent.canonicalPath,
    parentIdentity: parent.stat,
  });
}

function resolveStableFile(value: unknown, label: string, maximumBytes: number): Readonly<StablePath> {
  const path = explicitAbsolutePath(value, label);
  const stat = lstatBigInt(path, label);
  const canonicalPath = realpathSync(path);
  const canonicalStat = lstatBigInt(canonicalPath, label);
  if (
    canonicalPath !== path
    || !isStableSingleLinkFile(stat)
    || !sameStableFile(stat, canonicalStat)
    || stat.size <= 0n
    || stat.size > BigInt(maximumBytes)
  ) {
    throw new Error(`${label} must be one bounded regular single-link file`);
  }
  return Object.freeze({ path, canonicalPath, stat });
}

function resolveStableDirectory(value: unknown, label: string): Readonly<StablePath> {
  const path = explicitAbsolutePath(value, label);
  const stat = lstatBigInt(path, label);
  const canonicalPath = realpathSync(path);
  if (canonicalPath !== path) throw new Error(`${label} must not traverse a link`);
  assertStableDirectory(path, stat, label);
  return Object.freeze({ path, canonicalPath, stat });
}

function explicitAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || hasSensitivePath(value)
    || hasRemoteOrDeviceNamespace(value)
  ) {
    throw new Error(
      `${label} must be an absolute non-sensitive path without remote or device syntax`,
    );
  }
  const absolute = resolve(value);
  if (hasRemoteOrDeviceNamespace(absolute)) {
    throw new Error(`${label} must not use remote or device syntax`);
  }
  return absolute;
}

function parseTrackedBlobs(
  bytes: Buffer,
): readonly Readonly<SubstrateFederatedIsolatedDevnetTrackedBlobV1>[] {
  const records = bytes.toString('utf8').split('\0').filter(Boolean);
  const blobs = records.map(record => {
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)$/u.exec(record);
    if (!match) throw new Error('relayer artifact source tree contains an unsupported entry');
    return Object.freeze({
      path: canonicalArchivePath(match[3]!),
      objectSha1Hex: match[2]!,
      executable: match[1] === '100755',
    });
  }).sort((left, right) => compareStrings(left.path, right.path));
  for (let index = 1; index < blobs.length; index += 1) {
    if (blobs[index - 1]!.path === blobs[index]!.path) {
      throw new Error('relayer artifact source tree contains duplicate paths');
    }
  }
  return Object.freeze(blobs);
}

export function decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
  bytes: Buffer,
  expected:
    readonly Readonly<SubstrateFederatedIsolatedDevnetTrackedBlobV1>[],
): readonly Buffer[] {
  const contents: Buffer[] = [];
  let offset = 0;
  let totalBytes = 0;
  for (const blob of expected) {
    const headerEnd = bytes.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error('Git source blob batch header is truncated');
    const header = bytes.subarray(offset, headerEnd).toString('ascii');
    const match = /^([0-9a-f]{40}) blob (0|[1-9][0-9]*)$/u.exec(header);
    if (!match || match[1] !== blob.objectSha1Hex) {
      throw new Error('Git source blob batch identity is invalid');
    }
    const size = Number(canonicalUnsignedDecimal(
      match[2]!,
      'Git source blob size',
    ));
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ARTIFACT_BYTES) {
      throw new Error('Git source blob size is outside the bounded limit');
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= bytes.byteLength || bytes[contentEnd] !== 0x0a) {
      throw new Error('Git source blob batch content is truncated');
    }
    const content = Buffer.from(bytes.subarray(contentStart, contentEnd));
    const observedObject = createHash('sha1')
      .update(Buffer.from(`blob ${content.byteLength}\0`, 'ascii'))
      .update(content)
      .digest('hex');
    if (observedObject !== blob.objectSha1Hex) {
      throw new Error('Git source blob content differs from its immutable object identity');
    }
    totalBytes += content.byteLength;
    if (totalBytes > MAX_GIT_SOURCE_BLOB_BYTES) {
      throw new Error('Git source blob closure exceeds the bounded total');
    }
    contents.push(content);
    offset = contentEnd + 1;
  }
  if (offset !== bytes.byteLength) {
    throw new Error('Git source blob batch has trailing bytes');
  }
  return Object.freeze(contents);
}

export function maximumSubstrateFederatedIsolatedDevnetGitBlobBatchBytesV1(
  expectedBlobCount: number,
): number {
  if (!Number.isSafeInteger(expectedBlobCount) || expectedBlobCount <= 0) {
    throw new Error('Git source blob count must be a positive safe integer');
  }
  const maximumBytes = MAX_GIT_SOURCE_BLOB_BYTES
    + expectedBlobCount * MAX_GIT_BLOB_BATCH_ENTRY_FRAMING_BYTES;
  if (
    !Number.isSafeInteger(maximumBytes)
    || maximumBytes > MAX_GIT_BLOB_BATCH_OUTPUT_BYTES
  ) {
    throw new Error('Git source blob batch framing exceeds the bounded limit');
  }
  return maximumBytes;
}

function assertEsbuildResult(
  result: BuildResult,
): asserts result is BuildResult & { outputFiles: OutputFile[]; metafile: Metafile } {
  if (!result.outputFiles || !result.metafile) {
    throw new Error('esbuild did not return the reviewed in-memory outputs');
  }
}

function artifactIdentity(
  file: string,
  bytes: Buffer,
): Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1> {
  return Object.freeze({
    file,
    sizeBytes: bytes.byteLength,
    sha256Hex: sha256Hex(bytes),
  });
}

function falseBoundaries() {
  return Object.freeze({
    buildToolchainAuthenticated: false as const,
    fixedLocalVolumesAuthenticated: false as const,
    crossPlatformNoReplaceEstablished: false as const,
    targetHistoryAuthenticated: false as const,
    ergoHistoryAuthenticated: false as const,
    sourceAttestationCreated: false as const,
    sourceAttestationVerified: false as const,
    targetApproved: false as const,
    nodeAcceptanceEstablished: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function writeNewFile(path: string, bytes: Buffer, parentIdentity: BigIntStats): void {
  assertStableDirectory(dirname(path), parentIdentity, 'relayer artifact file parent');
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!isStableSingleLinkFile(opened) || opened.size !== 0n) {
      throw new Error('relayer artifact file identity is invalid');
    }
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        null,
      );
      if (count <= 0) throw new Error('relayer artifact file could not be written');
      offset += count;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor, { bigint: true });
    const pathStat = lstatBigInt(path, 'relayer artifact file');
    if (
      !sameFileIdentity(opened, written)
      || !sameFileIdentity(written, pathStat)
      || written.size !== BigInt(bytes.byteLength)
    ) {
      throw new Error('relayer artifact file changed while being written');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readStableFile(path: string, maximumBytes: number, label: string): Buffer {
  const before = lstatBigInt(path, label);
  if (!isStableSingleLinkFile(before) || before.size <= 0n || before.size > BigInt(maximumBytes)) {
    throw new Error(`${label} is not one bounded regular single-link file`);
  }
  const canonical = realpathSync(path);
  if (canonical !== path) throw new Error(`${label} traverses a link`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!isStableSingleLinkFile(opened) || !sameStableFile(before, opened)) {
      throw new Error(`${label} changed before it was opened`);
    }
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (count <= 0) throw new Error(`${label} ended before its recorded size`);
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatBigInt(path, label);
    if (
      !sameStableFile(opened, after)
      || !sameStableFile(after, pathAfter)
      || BigInt(bytes.byteLength) !== after.size
    ) {
      throw new Error(`${label} changed while being read`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sha256StableFile(path: Readonly<StablePath>, maximumBytes: number, label: string): string {
  const current = resolveStableFile(path.path, label, maximumBytes);
  if (!sameStableFile(path.stat, current.stat)) throw new Error(`${label} changed`);
  return sha256Hex(readStableFile(path.path, maximumBytes, label));
}

function removeOwnedDirectory(
  parent: string,
  target: string,
  expectedIdentity: BigIntStats,
  label: string,
): void {
  if (
    !isPathInside(parent, target)
    || canonicalPathIdentity(dirname(target)) !== canonicalPathIdentity(parent)
  ) {
    throw new Error(`${label} escaped its owned parent`);
  }
  try {
    const stat = lstatSync(target, { bigint: true });
    if (
      !stat.isDirectory()
      || stat.isSymbolicLink()
      || !sameFileIdentity(expectedIdentity, stat)
    ) {
      throw new Error(`${label} is no longer a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  rmSync(target, { recursive: true, force: false });
}

function runTextTool(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
): string {
  const bytes = runBinaryTool(executable, args, cwd, env, label);
  const value = bytes.toString('utf8').trim();
  if (value.length === 0 || value.includes('\0')) throw new Error(`${label} returned invalid text`);
  return value;
}

function runBinaryTool(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
  input?: Buffer,
  maxBufferBytes: number = MAX_GIT_OUTPUT_BYTES,
): Buffer {
  if (!Number.isSafeInteger(maxBufferBytes) || maxBufferBytes <= 0) {
    throw new Error(`${label} output limit must be a positive safe integer`);
  }
  try {
    return Buffer.from(execFileSync(executable, [...args], {
      cwd,
      env,
      input,
      encoding: 'buffer',
      maxBuffer: maxBufferBytes,
      windowsHide: true,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    }));
  } catch {
    throw new Error(`${label} failed`);
  }
}

function runToolExpectSuccess(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
  input?: Buffer,
): void {
  try {
    execFileSync(executable, [...args], {
      cwd,
      env,
      input,
      encoding: 'buffer',
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      windowsHide: true,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(`${label} failed`);
  }
}

function readToolVersion(
  executable: Readonly<StablePath>,
  args: readonly string[],
  expected: RegExp,
  label: string,
): string {
  const version = runTextTool(
    executable.path,
    args,
    dirname(executable.path),
    safeGitEnvironment(),
    `${label} version query`,
  );
  if (!expected.test(version)) throw new Error(`${label} version is unsupported`);
  return version;
}

export function buildSubstrateFederatedIsolatedDevnetGitEnvironmentV1(): NodeJS.ProcessEnv {
  return Object.freeze({
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    COMSPEC: process.env.COMSPEC,
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    HOME: '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
    LANG: 'C',
    TZ: 'UTC',
  });
}

const safeGitEnvironment =
  buildSubstrateFederatedIsolatedDevnetGitEnvironmentV1;

function safeBuildEnvironment(
  sourceDateEpoch: string,
  scratchBridgeRoot: string,
): NodeJS.ProcessEnv {
  const userHome = resolveStableDirectory(
    process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME,
    'relayer artifact build user home',
  ).canonicalPath;
  const cargoHome = resolveStableDirectory(
    process.env.CARGO_HOME ?? join(userHome, '.cargo'),
    'relayer artifact Cargo home',
  ).canonicalPath;
  const rustupHome = resolveStableDirectory(
    process.env.RUSTUP_HOME ?? join(userHome, '.rustup'),
    'relayer artifact rustup home',
  ).canonicalPath;
  const optionalLocalPaths = [
    Object.freeze({
      value: process.env.LOCALAPPDATA,
      target: '/local-app-data',
      label: 'local app-data',
    }),
    Object.freeze({
      value: process.env.TEMP,
      target: '/temporary-files',
      label: 'temporary-file',
    }),
    Object.freeze({
      value: process.env.TMP,
      target: '/temporary-files-alias',
      label: 'temporary-file alias',
    }),
  ].flatMap(entry => entry.value === undefined || entry.value.length === 0
    ? []
    : [Object.freeze({
      source: resolveStableDirectory(
        entry.value,
        `relayer artifact ${entry.label} build directory`,
      ).canonicalPath,
      target: entry.target,
    })]);
  const remapEntries = [
    Object.freeze({
      source: scratchBridgeRoot,
      target: '/workspace/ergo-sidechain-bridge',
    }),
    Object.freeze({ source: cargoHome, target: '/tool-state/cargo' }),
    Object.freeze({ source: rustupHome, target: '/tool-state/rustup' }),
    Object.freeze({ source: userHome, target: '/user-home' }),
    ...optionalLocalPaths,
  ].filter((entry, index, entries) => entries.findIndex(candidate => (
    process.platform === 'win32'
      ? candidate.source.toLowerCase() === entry.source.toLowerCase()
      : candidate.source === entry.source
  )) === index).sort((left, right) => right.source.length - left.source.length);
  const encodedRustFlags = remapEntries.map(entry => (
    `--remap-path-prefix=${entry.source}=${entry.target}`
  )).join('\x1f');
  return Object.freeze({
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    COMSPEC: process.env.COMSPEC,
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.platform === 'win32' ? userHome : undefined,
    HOME: process.platform === 'win32' ? undefined : userHome,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    RUSTUP_HOME: rustupHome,
    CARGO_HOME: cargoHome,
    CARGO_NET_OFFLINE: 'true',
    CARGO_TERM_COLOR: 'never',
    CARGO_ENCODED_RUSTFLAGS: encodedRustFlags,
    SOURCE_DATE_EPOCH: sourceDateEpoch,
    LC_ALL: 'C',
    LANG: 'C',
    TZ: 'UTC',
  });
}

function canonicalArchivePath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4096
    || value.includes('\0')
    || value.includes('\\')
    || value.startsWith('/')
    || /^[A-Za-z]:/u.test(value)
    || value.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('relayer archive path is not canonical');
  }
  return value;
}

function normalizeRelativePath(value: string): string {
  const normalized = normalizeToolPath(value).replace(/^\.\//u, '');
  if (normalized === '') return '';
  return canonicalArchivePath(normalized);
}

function repositoryPath(prefix: string, path: string): string {
  return prefix.length === 0 ? path : `${prefix}/${path}`;
}

function normalizeToolPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/$/u, '');
}

function canonicalUnsignedDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal`);
  }
  return value;
}

function commitSha1(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be one lowercase Git SHA-1`);
  }
  return value;
}

function uint32Be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('relayer archive uint32 is out of range');
  }
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint64Be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('relayer archive uint64 is out of range');
  }
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function readSafeUInt64(bytes: Buffer, offset: number, label: string): number {
  const value = bytes.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds the safe range`);
  return Number(value);
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hasSensitivePath(value: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|secrets?|mnemonics?|private[-_ ]?keys?|deployed_state\.json|runtime[-_ ]?(?:db|database|state)|logs?)(?:[\\/]|$)/iu.test(value);
}

function hasRemoteOrDeviceNamespace(value: string): boolean {
  return /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(value);
}

function lstatBigInt(path: string, label: string): BigIntStats {
  try {
    return lstatSync(path, { bigint: true });
  } catch {
    throw new Error(`${label} could not be inspected`);
  }
}

function assertStableDirectory(path: string, expected: BigIntStats, label: string): void {
  const current = lstatBigInt(path, label);
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || !sameFileIdentity(expected, current)
    || realpathSync(path) !== path
  ) {
    throw new Error(`${label} identity changed`);
  }
}

function isStableSingleLinkFile(stat: BigIntStats): boolean {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.dev > 0n
    && stat.ino > 0n;
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: BigIntStats, right: BigIntStats): boolean {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
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

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compareStrings);
  const expected = [...keys].sort(compareStrings);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
  const record = Object.create(null) as Record<K, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) {
      throw new Error(`${label} fields must be own data properties`);
    }
    record[key] = descriptor.value;
  }
  return record;
}
