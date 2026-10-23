import { createHash } from 'node:crypto';

import {
  validateErgoCheckout,
  type CheckoutObservation,
} from './consensus-source-baseline.js';
import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';

export interface V4BuildSbtOverlayPin {
  readonly path: 'build.sbt';
  readonly status: 'modified';
  readonly baseBlob: string;
  readonly patchedBlob: string;
  readonly bytes: number;
  readonly sha256Hex: string;
}

export interface V4ErgoSourceObservationInput {
  readonly consensusSourceLockBytes: Buffer;
  readonly overlay: Readonly<V4BuildSbtOverlayPin>;
  readonly checkout: Readonly<CheckoutObservation>;
  readonly buildSbtBytes: Buffer;
  readonly headBuildSbtBlob: string;
}

const SOURCE_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V4_SOURCE';
const CONSENSUS_SOURCE_LOCK_SHA256_HEX =
  '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6';
const BUILD_SBT_BASE_BLOB = '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d';

function fail(reason: string): never {
  throw new Error(reason);
}

function fixedHex(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value);
}

export function assertV4ErgoSourceObservation(
  input: Readonly<V4ErgoSourceObservationInput>,
): Readonly<{ sourceIdentityDigestHex: string; expectedStatus: string }> {
  if (!Buffer.isBuffer(input.consensusSourceLockBytes)
      || createHash('sha256').update(input.consensusSourceLockBytes).digest('hex')
        !== CONSENSUS_SOURCE_LOCK_SHA256_HEX) {
    fail('original consensus source lock bytes differ');
  }
  const consensusLock = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(input.consensusSourceLockBytes),
  ) as { ergoNode?: Record<string, unknown> };
  const ergoNodeLock = consensusLock.ergoNode;
  if (!ergoNodeLock || typeof ergoNodeLock !== 'object'
      || Array.isArray(ergoNodeLock)) {
    fail('original Ergo source lock is missing');
  }
  const files = ergoNodeLock.files;
  if (!Array.isArray(files) || files.length !== 8
      || files.some(file => file === null || typeof file !== 'object'
        || Array.isArray(file) || typeof file.path !== 'string')
      || new Set(files.map(file => file.path)).size !== 8
      || files.some(file => file.path === 'build.sbt')) {
    fail('V4 requires exactly the eight original Ergo patch declarations');
  }
  const overlay = input.overlay;
  if (overlay.path !== 'build.sbt' || overlay.status !== 'modified'
      || !fixedHex(overlay.baseBlob, 20)
      || overlay.baseBlob !== BUILD_SBT_BASE_BLOB
      || input.headBuildSbtBlob !== BUILD_SBT_BASE_BLOB
      || !fixedHex(overlay.patchedBlob, 20)
      || !fixedHex(overlay.sha256Hex, 32)
      || !Number.isSafeInteger(overlay.bytes) || overlay.bytes <= 0
      || !Buffer.isBuffer(input.buildSbtBytes)
      || input.buildSbtBytes.length !== overlay.bytes) {
    fail('V4 build.sbt overlay or HEAD base blob differs');
  }
  const rawSha256 = createHash('sha256').update(input.buildSbtBytes).digest('hex');
  const gitBlob = createHash('sha1')
    .update(Buffer.from(`blob ${input.buildSbtBytes.length}\0`, 'utf8'))
    .update(input.buildSbtBytes).digest('hex');
  if (rawSha256 !== overlay.sha256Hex || gitBlob !== overlay.patchedBlob) {
    fail('V4 build.sbt raw bytes differ from overlay pin');
  }
  const declaredFiles = [
    ...files,
    {
      path: overlay.path,
      status: overlay.status,
      baseBlob: overlay.baseBlob,
      patchedBlob: overlay.patchedBlob,
    },
  ];
  const observedBlobPaths = Object.keys(input.checkout.blobs).sort();
  const declaredPaths = declaredFiles.map(file => file.path as string).sort();
  if (observedBlobPaths.length !== declaredPaths.length
      || observedBlobPaths.some((path, index) => path !== declaredPaths[index])) {
    fail('V4 checkout blob set differs from exactly nine declared paths');
  }
  const validation = validateErgoCheckout(
    { ...ergoNodeLock, files: declaredFiles },
    input.checkout,
  );
  if (validation.errors.length !== 0 || validation.expectedStatus === undefined) {
    fail('V4 nine-file raw checkout differs from extended source lock');
  }
  return Object.freeze({
    expectedStatus: validation.expectedStatus,
    sourceIdentityDigestHex: sha256CanonicalJson({
      head: input.checkout.head,
      status: input.checkout.status,
      blobs: input.checkout.blobs,
      buildSbtRawSha256Hex: rawSha256,
    }, SOURCE_IDENTITY_DOMAIN),
  });
}
