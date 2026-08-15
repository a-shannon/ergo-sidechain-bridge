import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  type BigIntStats,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { TextDecoder } from 'node:util';

import {
  canonicalJson,
  parseStrictJson,
} from './strict-json.js';
import type {
  ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
  SubstrateFederatedIsolatedDevnetPortableArtifactsV1,
  SubstrateFederatedIsolatedDevnetPortableTrustPinsV1,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';

export const
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA =
    'e2s.substrate-federated-isolated-devnet-portable-replay-request.v1' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1 =
  Object.freeze({
    trackerTemplate: 'contracts/SPVTrackerSubstrateFederatedV1.es',
    duplicatePreventionTemplate:
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    sourceLockTemplate: 'contracts/MainChainLockPooledReserveV6.es',
    pooledReserveTemplate:
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    sourceAcceptanceReport: 'artifacts/source-history/acceptance.v1.json',
    sourceReportedFinalizedBlocks:
      'artifacts/source-history/reported-finalized-blocks.v1.json',
    sourceRuntimeHistory:
      'artifacts/source-history/runtime-history.v1.json',
    sourceApplicationHistory:
      'artifacts/source-history/application-history.v1.json',
    sourceHistoryReceipt:
      'artifacts/source-history/history-receipt.v1.json',
    ergoGreatestWorkHeadersManifest:
      'artifacts/ergo-history/greatest-work-headers.v1.bin',
    ergoTransactionsManifest:
      'artifacts/ergo-history/transactions.v1.bin',
    ergoUtxoTransitionsManifest:
      'artifacts/ergo-history/utxo-transitions.v1.json',
    relayerSourceArchive: 'artifacts/relayer/source-archive.v1.bin',
    relayerPackageLock: 'artifacts/relayer/package-lock.v1.bin',
    relayerRuntimeEntrypointsManifest:
      'artifacts/relayer/runtime-entrypoints.v1.bin',
    relayerBuildArtifact: 'artifacts/relayer/build-artifact.v1.bin',
    attestationPacket: 'attestation/isolated-launch-packet.v1.json',
  } satisfies Readonly<
    Record<keyof SubstrateFederatedIsolatedDevnetPortableArtifactsV1, string>
  >);

type ArtifactPathKey =
  keyof typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1;

const ARTIFACT_PATH_KEYS = Object.freeze([
  'trackerTemplate',
  'duplicatePreventionTemplate',
  'sourceLockTemplate',
  'pooledReserveTemplate',
  'sourceAcceptanceReport',
  'sourceReportedFinalizedBlocks',
  'sourceRuntimeHistory',
  'sourceApplicationHistory',
  'sourceHistoryReceipt',
  'ergoGreatestWorkHeadersManifest',
  'ergoTransactionsManifest',
  'ergoUtxoTransitionsManifest',
  'relayerSourceArchive',
  'relayerPackageLock',
  'relayerRuntimeEntrypointsManifest',
  'relayerBuildArtifact',
  'attestationPacket',
] as const satisfies readonly ArtifactPathKey[]);

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export interface SubstrateFederatedIsolatedDevnetPortableReplayRequestV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly files: Readonly<Record<ArtifactPathKey, string>>;
}

interface ResolvedArtifact {
  readonly path: string;
  readonly canonicalPathIdentity: string;
  readonly fileIdentity: string;
  readonly stat: BigIntStats;
}

export function loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1(
  requestPath: string,
  trustPins: Readonly<SubstrateFederatedIsolatedDevnetPortableTrustPinsV1>,
): Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input> {
  const requestAbsolute = resolveExplicitRequestPath(requestPath);
  const request = parseRequest(readBoundedRegularFile(
    requestAbsolute,
    'isolated portable replay request',
    MAX_REQUEST_BYTES,
  ));
  const bundleRoot = safeRealpath(
    dirname(requestAbsolute),
    'isolated portable replay bundle root',
  );
  assertBundleRoot(bundleRoot);

  const canonicalPaths = new Set<string>();
  const fileIdentities = new Set<string>();
  const resolved = new Map<ArtifactPathKey, ResolvedArtifact>();
  for (const key of ARTIFACT_PATH_KEYS) {
    const artifact = resolveBundleFile(bundleRoot, request.files[key], key);
    if (
      canonicalPaths.has(artifact.canonicalPathIdentity)
      || fileIdentities.has(artifact.fileIdentity)
    ) {
      throw new Error('isolated portable replay artifact files must be distinct');
    }
    canonicalPaths.add(artifact.canonicalPathIdentity);
    fileIdentities.add(artifact.fileIdentity);
    resolved.set(key, artifact);
  }

  const artifacts = Object.fromEntries(ARTIFACT_PATH_KEYS.map(key => [
    key,
    readBoundedRegularFile(
      resolved.get(key)!.path,
      `isolated portable ${key} artifact`,
      MAX_ARTIFACT_BYTES,
      resolved.get(key)!.stat,
    ),
  ])) as Record<ArtifactPathKey, Buffer>;
  const pins = exactDataRecord(trustPins, [
    'expectedTargetDescriptorDigestHex',
    'expectedSourceAttestationKeySetDigestHex',
  ], 'isolated portable trust pins');

  return Object.freeze({
    artifacts: Object.freeze(artifacts),
    trustPins: Object.freeze({
      expectedTargetDescriptorDigestHex: fixedDigestHex(
        pins.expectedTargetDescriptorDigestHex,
        'expected target descriptor digest',
      ),
      expectedSourceAttestationKeySetDigestHex: fixedDigestHex(
        pins.expectedSourceAttestationKeySetDigestHex,
        'expected source-attestation key-set digest',
      ),
    }),
  });
}

function parseRequest(
  bytes: Uint8Array,
): Readonly<SubstrateFederatedIsolatedDevnetPortableReplayRequestV1> {
  const parsed = parseCanonicalJson(bytes, 'isolated portable replay request');
  const record = exactDataRecord(parsed, [
    'schema',
    'version',
    'files',
  ], 'isolated portable replay request');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('isolated portable replay request schema is unsupported');
  }
  const fileRecord = exactDataRecord(
    record.files,
    ARTIFACT_PATH_KEYS,
    'isolated portable replay request files',
  );
  const files = Object.fromEntries(ARTIFACT_PATH_KEYS.map(key => {
    const value = fileRecord[key];
    if (typeof value !== 'string') {
      throw new Error(`isolated portable ${key} path must be a string`);
    }
    const normalized = safeRelativePath(value, key);
    if (
      normalized
        !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1[key]
    ) {
      throw new Error(`isolated portable ${key} path must remain canonical`);
    }
    return [key, normalized] as const;
  })) as Record<ArtifactPathKey, string>;
  return Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
    version: 1 as const,
    files: Object.freeze(files),
  });
}

function resolveExplicitRequestPath(value: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || hasSensitivePath(value)
  ) {
    throw new Error('isolated portable replay requires a non-sensitive request path');
  }
  if (hasRemoteOrDeviceNamespace(value)) {
    throw new Error(
      'isolated portable replay request must not use a remote or device path',
    );
  }
  const absolute = resolve(value);
  if (hasRemoteOrDeviceNamespace(absolute)) {
    throw new Error(
      'isolated portable replay request must not use a remote or device path',
    );
  }
  const stat = safeLstat(absolute, 'isolated portable replay request');
  if (!isStableSingleLinkFile(stat)) {
    throw new Error(
      'isolated portable replay request must be a stable single-link file',
    );
  }
  return absolute;
}

function assertBundleRoot(root: string): void {
  const stat = safeLstat(root, 'isolated portable replay bundle root');
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(
      'isolated portable replay bundle root must be a regular directory',
    );
  }
}

function resolveBundleFile(
  root: string,
  value: string,
  label: ArtifactPathKey,
): Readonly<ResolvedArtifact> {
  const normalized = safeRelativePath(value, label);
  const candidate = resolve(root, ...normalized.split('/'));
  assertContainedPath(root, candidate, label);
  assertNoLinkedComponents(root, normalized, label);
  const canonical = safeRealpath(
    candidate,
    `isolated portable ${label} artifact`,
  );
  assertContainedPath(root, canonical, label);
  const stat = safeLstat(candidate, `isolated portable ${label} artifact`);
  if (!isStableSingleLinkFile(stat)) {
    throw new Error(
      `isolated portable ${label} must be a stable single-link file`,
    );
  }
  return Object.freeze({
    path: candidate,
    canonicalPathIdentity: canonicalPathIdentity(canonical),
    fileIdentity: stableFileIdentity(stat),
    stat,
  });
}

function assertContainedPath(
  root: string,
  candidate: string,
  label: ArtifactPathKey,
): void {
  const relativePath = relative(root, candidate);
  if (
    relativePath === ''
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`isolated portable ${label} path escapes the bundle root`);
  }
}

function assertNoLinkedComponents(
  root: string,
  normalized: string,
  label: ArtifactPathKey,
): void {
  const segments = normalized.split('/');
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    const stat = safeLstat(current, `isolated portable ${label} path component`);
    if (stat.isSymbolicLink()) {
      throw new Error(`isolated portable ${label} path must not contain links`);
    }
    const final = index === segments.length - 1;
    if ((!final && !stat.isDirectory()) || (final && !stat.isFile())) {
      throw new Error(
        `isolated portable ${label} must resolve through regular directories to a file`,
      );
    }
  }
}

function safeRelativePath(value: string, label: string): string {
  if (
    value.length === 0
    || value.length > 240
    || isAbsolute(value)
    || value.includes('\\')
    || value.includes('\0')
    || value.split('/').some(
      segment => segment === '' || segment === '.' || segment === '..',
    )
    || !/^[A-Za-z0-9._/-]+$/.test(value)
    || hasSensitivePath(value)
  ) {
    throw new Error(`isolated portable ${label} path is unsafe`);
  }
  return value;
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

function readBoundedRegularFile(
  path: string,
  label: string,
  maxBytes: number,
  expectedAtResolution?: BigIntStats,
): Buffer {
  const beforeOpen = safeLstat(path, label);
  if (!isStableSingleLinkFile(beforeOpen)) {
    throw new Error(`${label} must be a stable single-link file`);
  }
  if (
    expectedAtResolution !== undefined
    && !sameStableFile(expectedAtResolution, beforeOpen)
  ) {
    throw new Error(`${label} changed after bundle resolution`);
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY);
  } catch {
    throw new Error(`${label} could not be opened`);
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const afterOpen = safeLstat(path, label);
    assertStableRegularFile(beforeOpen, opened, afterOpen, label);
    if (opened.size <= 0n || opened.size > BigInt(maxBytes)) {
      throw new Error(`${label} size is outside the portable replay bound`);
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
      if (count <= 0) {
        throw new Error(`${label} changed while it was being read`);
      }
      offset += count;
    }
    let trailingBytes: number;
    try {
      trailingBytes = readSync(
        descriptor,
        Buffer.allocUnsafe(1),
        0,
        1,
        null,
      );
    } catch {
      throw new Error(`${label} could not be read`);
    }
    if (trailingBytes !== 0) {
      throw new Error(`${label} grew while it was being read`);
    }
    const afterRead = fstatSync(descriptor, { bigint: true });
    const finalPath = safeLstat(path, label);
    assertStableRegularFile(opened, afterRead, finalPath, label);
    if (
      BigInt(bytes.length) !== opened.size
      || afterRead.size !== opened.size
      || afterRead.mtimeNs !== opened.mtimeNs
      || afterRead.ctimeNs !== opened.ctimeNs
    ) {
      throw new Error(`${label} changed while it was being read`);
    }
    return Buffer.from(bytes);
  } finally {
    closeSync(descriptor);
  }
}

function assertStableRegularFile(
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
  ) {
    throw new Error(`${label} identity changed while it was being opened`);
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
    throw new Error(
      'isolated portable artifact lacks a stable single-link identity',
    );
  }
  return `inode:${stat.dev}:${stat.ino}`;
}

function canonicalPathIdentity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
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

function parseCanonicalJson(bytes: Uint8Array, label: string): unknown {
  let source: string;
  try {
    source = UTF8.decode(bytes);
  } catch {
    throw new Error(`${label} must be canonical UTF-8`);
  }
  let parsed: unknown;
  try {
    parsed = parseStrictJson(source, label);
  } catch {
    throw new Error(`${label} is not strict JSON`);
  }
  if (source !== `${canonicalJson(parsed)}\n`) {
    throw new Error(`${label} must use canonical JSON with one trailing LF`);
  }
  return parsed;
}

function fixedDigestHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`isolated portable ${label} must be 32-byte lowercase hex`);
  }
  return value;
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
