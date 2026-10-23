import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, type BigIntStats } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  inspectV4RawErgoCheckout,
  type V4RawCheckoutObservation,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js';
import {
  inspectV4NodeBuildLock,
  type V4NodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import type {
  V4BuildSbtOverlayPin,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-source.js';

const CONSENSUS_LOCK_RELATIVE_PATH = 'sources/consensus-source-lock.json';
const JOB_SCRIPT_RELATIVE_PATH = 'scripts/windows-job-process.ps1';
const MAX_SUPPORT_FILE_BYTES = 65_536;

export interface V4NodeBuildPreflightInput {
  readonly bridgeRoot: string;
  readonly sourcePath: string;
  readonly gitHomePath: string;
  readonly gitExecutablePath: string;
}

export interface V4NodeBuildPreflightObservation {
  readonly lockSha256Hex: string;
  readonly consensusSourceLockSha256Hex: string;
  readonly windowsJobProcessRunnerSha256Hex: string;
  readonly sourceIdentityDigestHex: string;
  readonly physicalSourceDigestHex: string;
  readonly physicalSourceFileCount: number;
  readonly physicalSourceDirectoryCount: number;
  readonly physicalSourceTotalBytes: number;
  readonly checkoutHead: string;
  readonly checkoutTree: string;
  readonly checkoutIndexSha256Hex: string;
  readonly checkoutStatus: string;
  readonly headBuildSbtBlob: string;
  readonly workingBuildSbtBlob: string;
  readonly workingBuildSbtSha256Hex: string;
}

interface PinnedFile {
  readonly bytes: Buffer;
  readonly stat: BigIntStats;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function assertDirectParents(path: string): void {
  let cursor = dirname(path);
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('V4 preflight support has a linked or non-directory ancestor');
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function readPinnedDirectFile(path: string, expectedSha256: string): PinnedFile {
  assertDirectParents(path);
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(MAX_SUPPORT_FILE_BYTES)) {
    throw new Error('V4 preflight support is not a bounded direct single-link file');
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!same(before, after) || bytes.length !== Number(before.size)
      || sha256(bytes) !== expectedSha256) {
    throw new Error('V4 preflight support bytes or identity differ');
  }
  return { bytes, stat: before };
}

function assertSamePinnedFile(before: PinnedFile, after: PinnedFile): void {
  if (!same(before.stat, after.stat) || !before.bytes.equals(after.bytes)) {
    throw new Error('V4 preflight support changed during checkout observation');
  }
}

function assertConsensusEncoding(bytes: Buffer): void {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r') || !text.endsWith('\n')) {
    throw new Error('V4 consensus source lock encoding differs');
  }
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('V4 consensus source lock is not an object');
  }
}

// This pure byte check does not observe a checkout and is not a preflight result.
export function derivePinnedV4BuildSbtOverlay(
  lock: Readonly<V4NodeBuildLock>,
  consensusSourceLockBytes: Buffer,
  windowsJobScriptBytes: Buffer,
): Readonly<V4BuildSbtOverlayPin> {
  if (sha256(consensusSourceLockBytes) !== lock.consensusSourceLockSha256
      || sha256(windowsJobScriptBytes) !== lock.windowsJobProcessRunnerSha256) {
    throw new Error('V4 preflight support does not match the pinned build lock');
  }
  assertConsensusEncoding(consensusSourceLockBytes);
  return Object.freeze({
    path: 'build.sbt',
    status: 'modified',
    baseBlob: lock.buildSbtBaseBlob,
    patchedBlob: lock.buildSbtOverlayBlob,
    bytes: lock.buildSbtOverlayBytes,
    sha256Hex: lock.buildSbtOverlaySha256,
  });
}

function summarizeCheckout(
  lock: Readonly<V4NodeBuildLock>,
  lockSha256Hex: string,
  raw: Readonly<V4RawCheckoutObservation>,
): V4NodeBuildPreflightObservation {
  if (raw.checkout.head !== lock.ergoNodeBaseCommit
      || raw.headBuildSbtBlob !== lock.buildSbtBaseBlob
      || raw.checkout.blobs['build.sbt'] !== lock.buildSbtOverlayBlob
      || raw.buildSbtBytes.length !== lock.buildSbtOverlayBytes
      || sha256(raw.buildSbtBytes) !== lock.buildSbtOverlaySha256
      || !/^[0-9a-f]{64}$/u.test(raw.indexSha256Hex)
      || !/^[0-9a-f]{64}$/u.test(raw.sourceIdentityDigestHex)
      || !/^[0-9a-f]{64}$/u.test(raw.physicalSourceDigestHex)
      || raw.physicalSourceFileCount !== 737
      || !Number.isSafeInteger(raw.physicalSourceDirectoryCount)
      || raw.physicalSourceDirectoryCount <= 0
      || !Number.isSafeInteger(raw.physicalSourceTotalBytes)
      || raw.physicalSourceTotalBytes < 0) {
    throw new Error('V4 checkout result differs from the pinned build lock');
  }
  return Object.freeze({
    lockSha256Hex,
    consensusSourceLockSha256Hex: lock.consensusSourceLockSha256,
    windowsJobProcessRunnerSha256Hex: lock.windowsJobProcessRunnerSha256,
    sourceIdentityDigestHex: raw.sourceIdentityDigestHex,
    physicalSourceDigestHex: raw.physicalSourceDigestHex,
    physicalSourceFileCount: raw.physicalSourceFileCount,
    physicalSourceDirectoryCount: raw.physicalSourceDirectoryCount,
    physicalSourceTotalBytes: raw.physicalSourceTotalBytes,
    checkoutHead: raw.checkout.head,
    checkoutTree: raw.headTree,
    checkoutIndexSha256Hex: raw.indexSha256Hex,
    checkoutStatus: raw.checkout.status,
    headBuildSbtBlob: raw.headBuildSbtBlob,
    workingBuildSbtBlob: raw.checkout.blobs['build.sbt'],
    workingBuildSbtSha256Hex: lock.buildSbtOverlaySha256,
  });
}

export async function inspectV4NodeBuildPreflight(
  input: Readonly<V4NodeBuildPreflightInput>,
): Promise<V4NodeBuildPreflightObservation> {
  const pinned = inspectV4NodeBuildLock(input.bridgeRoot);
  const consensusPath = resolve(input.bridgeRoot, CONSENSUS_LOCK_RELATIVE_PATH);
  const jobScriptPath = resolve(import.meta.dirname, JOB_SCRIPT_RELATIVE_PATH);
  const consensusBefore = readPinnedDirectFile(consensusPath, pinned.lock.consensusSourceLockSha256);
  const jobBefore = readPinnedDirectFile(jobScriptPath, pinned.lock.windowsJobProcessRunnerSha256);
  const overlay = derivePinnedV4BuildSbtOverlay(
    pinned.lock, consensusBefore.bytes, jobBefore.bytes,
  );
  const raw = await inspectV4RawErgoCheckout({
    sourcePath: input.sourcePath,
    gitHomePath: input.gitHomePath,
    gitExecutablePath: input.gitExecutablePath,
    consensusSourceLockBytes: consensusBefore.bytes,
    overlay,
  });
  assertSamePinnedFile(
    consensusBefore, readPinnedDirectFile(consensusPath, pinned.lock.consensusSourceLockSha256),
  );
  assertSamePinnedFile(
    jobBefore, readPinnedDirectFile(jobScriptPath, pinned.lock.windowsJobProcessRunnerSha256),
  );
  if (inspectV4NodeBuildLock(input.bridgeRoot).sha256Hex !== pinned.sha256Hex) {
    throw new Error('V4 build lock changed during checkout observation');
  }
  return summarizeCheckout(pinned.lock, pinned.sha256Hex, raw);
}
