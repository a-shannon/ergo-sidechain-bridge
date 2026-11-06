import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, type BigIntStats } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { canonicalJson, parseStrictJson } from './strict-json.js';
import {
  inspectV4NodeBuildLock, type V4NodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

export const V5_SOURCE59_LOCK_RELATIVE_PATH =
  'sources/substrate-federated-isolated-devnet-node-build-lock-v5-source59.json';
export const V5_SOURCE59_LOCK_SHA256_HEX =
  '055bddd03ee921fa338efd30904f81f194afb6953c9d9d050931d6791dcac3f2';

const V4_LOCK_RELATIVE_PATH =
  'sources/substrate-federated-isolated-devnet-node-build-lock-v4.json';
const V4_LOCK_SHA256_HEX =
  'f5938646f5d4a9c4f2b08f551cb632e09171ab0b89c68fba82e80e58ba73fd64';
const OVERLAY_BLOB = '23f9dbe303639b4e42cb85b9c4ef220b0a8aff78';
const OVERLAY_SHA256 =
  'a0e138c7f4379b1c42e004d4e776a81e24f4b7757d09ceeb7488bc3951a4db03';

export type V5Source59NodeBuildLock = Readonly<
  Omit<V4NodeBuildLock, 'schemaVersion' | 'kind' | 'buildSbtOverlayBytes'> & {
    readonly schemaVersion: 5;
    readonly kind: 'substrate-federated-isolated-devnet-node-build-lock-v5-source59';
    readonly buildSbtOverlayBytes: 20585;
  }
>;
export type V4OrV5BuildLockSelection = 'v4' | 'v5-source59';
export type V4OrV5BuildLock = V4NodeBuildLock | V5Source59NodeBuildLock;

function fail(reason: string): never {
  throw new Error('V5 SOURCE59 build lock: ' + reason);
}
function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function directParents(path: string): void {
  for (let cursor = dirname(path);; cursor = dirname(cursor)) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) {
      fail('linked or non-directory ancestor');
    }
    if (cursor === dirname(cursor)) return;
  }
}
function readPinned(path: string, expectedSize: number, expectedSha: string): Buffer {
  const full = resolve(path);
  directParents(full);
  const before = lstatSync(full, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size !== BigInt(expectedSize)) fail('direct file size or links differ');
  const bytes = readFileSync(full);
  const after = lstatSync(full, { bigint: true });
  if (!same(before, after) || bytes.length !== expectedSize
      || sha(bytes) !== expectedSha) fail('file bytes or identity differ');
  return bytes;
}
function strictText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || text.includes('\r')
      || !text.endsWith('\n')) fail('encoding differs');
  return text;
}
function frozen(value: unknown): void {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) frozen(nested);
    Object.freeze(value);
  }
}

// These byte checks return no lock and accept no caller-supplied digest.
export function assertV5Source59LockBytePins(
  candidateBytes: Uint8Array, baselineBytes: Uint8Array,
): void {
  if (baselineBytes.length !== 3200 || sha(baselineBytes) !== V4_LOCK_SHA256_HEX
      || candidateBytes.length !== 3209
      || sha(candidateBytes) !== V5_SOURCE59_LOCK_SHA256_HEX) {
    fail('exact lock bytes differ');
  }
}

// Non-authorizing structural seam for isolated negative fixtures. Production
// calls it only after the fixed size and SHA-256 checks above have passed.
export function assertV5Source59LockStructureNonAuthorizing(
  candidateBytes: Uint8Array, baselineBytes: Uint8Array,
): void {
  const baseline = parseStrictJson(strictText(baselineBytes), 'V4 baseline lock');
  const candidate = parseStrictJson(strictText(candidateBytes), 'V5 SOURCE59 lock');
  if (baseline === null || typeof baseline !== 'object' || Array.isArray(baseline)
      || candidate === null || typeof candidate !== 'object'
      || Array.isArray(candidate)) fail('lock object differs');
  const old = baseline as Record<string, unknown>;
  if (old.schemaVersion !== 4
      || old.kind !== 'substrate-federated-isolated-devnet-node-build-lock-v4'
      || old.buildSbtOverlayBytes !== 13660
      || old.buildSbtOverlayBlob !== '7e35f6295070996d5ae0f6fc22f10737e26ee4cd'
      || old.buildSbtOverlaySha256
        !== 'd67f4695b35a6ea0e1a3a9db8bcb7caa873551644cdc81c4ea72ec7a482d4935') {
    fail('baseline lock scope differs');
  }
  const expected: Record<string, unknown> = {
    ...old,
    schemaVersion: 5,
    kind: 'substrate-federated-isolated-devnet-node-build-lock-v5-source59',
    buildSbtOverlayBlob: OVERLAY_BLOB,
    buildSbtOverlayBytes: 20585,
    buildSbtOverlaySha256: OVERLAY_SHA256,
  };
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    fail('fieldsets, types or unchanged pins differ');
  }
}

function selectPinnedV5Source59LockBytes(
  candidateBytes: Uint8Array, baselineBytes: Uint8Array,
): Readonly<V5Source59NodeBuildLock> {
  assertV5Source59LockBytePins(candidateBytes, baselineBytes);
  assertV5Source59LockStructureNonAuthorizing(candidateBytes, baselineBytes);
  const candidate = parseStrictJson(strictText(candidateBytes), 'V5 SOURCE59 lock');
  frozen(candidate);
  return candidate as V5Source59NodeBuildLock;
}

// A consumer must call this explicit selector; the V4 inspector keeps its
// original path, hash, schema and overlay acceptance unchanged.
export function inspectV5Source59NodeBuildLock(bridgeRoot: string): Readonly<{
  lock: Readonly<V5Source59NodeBuildLock>;
  sha256Hex: typeof V5_SOURCE59_LOCK_SHA256_HEX;
}> {
  const baseline = readPinned(resolve(bridgeRoot, V4_LOCK_RELATIVE_PATH),
    3200, V4_LOCK_SHA256_HEX);
  const selected = readPinned(resolve(bridgeRoot, V5_SOURCE59_LOCK_RELATIVE_PATH),
    3209, V5_SOURCE59_LOCK_SHA256_HEX);
  const lock = selectPinnedV5Source59LockBytes(selected, baseline);
  return Object.freeze({ lock, sha256Hex: V5_SOURCE59_LOCK_SHA256_HEX });
}

// The legacy default remains V4. A V5 caller must supply its distinct literal;
// a failed V5 inspection never falls back to the V4 lock.
export function inspectSelectedV4OrV5BuildLock(
  bridgeRoot: string, selection: V4OrV5BuildLockSelection = 'v4',
): Readonly<{ lock: Readonly<V4OrV5BuildLock>; sha256Hex: string }> {
  if (selection === 'v4') return inspectV4NodeBuildLock(bridgeRoot);
  if (selection === 'v5-source59') return inspectV5Source59NodeBuildLock(bridgeRoot);
  fail('unknown explicit lock selection');
}
