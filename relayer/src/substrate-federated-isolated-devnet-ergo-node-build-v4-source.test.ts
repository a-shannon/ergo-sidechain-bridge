import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { readHistoricalConsensusSourceLockBytes } from './historical-consensus-source-lock.test-helper.js';
import {
  assertV4ErgoSourceObservation,
  type V4BuildSbtOverlayPin,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-source.js';

const consensusSourceLockBytes = readHistoricalConsensusSourceLockBytes();
const consensusLock = JSON.parse(consensusSourceLockBytes.toString('utf8')) as {
  ergoNode: Record<string, unknown>;
};
const ergoNode = consensusLock.ergoNode;
const patchedFiles = ergoNode.files as Array<{
  path: string;
  status: 'modified' | 'added';
  patchedBlob: string;
}>;
const buildSbtBytes = Buffer.from('name := "v4 source fixture"\n', 'utf8');
const baseBuildSbtBlob = '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d';
const overlay: V4BuildSbtOverlayPin = {
  path: 'build.sbt',
  status: 'modified',
  baseBlob: baseBuildSbtBlob,
  patchedBlob: createHash('sha1')
    .update(Buffer.from(`blob ${buildSbtBytes.length}\0`, 'utf8'))
    .update(buildSbtBytes).digest('hex'),
  bytes: buildSbtBytes.length,
  sha256Hex: createHash('sha256').update(buildSbtBytes).digest('hex'),
};
const status = [
  ...patchedFiles.map(file => file.status === 'added'
    ? `?? ${file.path}` : ` M ${file.path}`),
  ' M build.sbt',
].sort().join('\n');
const checkout = {
  head: ergoNode.baseCommit as string,
  status,
  blobs: Object.fromEntries([
    ...patchedFiles.map(file => [file.path, file.patchedBlob]),
    ['build.sbt', overlay.patchedBlob],
  ]),
};

function candidate(changes: Record<string, unknown> = {}) {
  return {
    consensusSourceLockBytes,
    overlay,
    checkout,
    buildSbtBytes,
    headBuildSbtBlob: baseBuildSbtBlob,
    ...changes,
  };
}

describe('isolated devnet Ergo node build V4 source boundary', () => {
  it('accepts exactly the original eight declarations and pinned ninth overlay', () => {
    const result = assertV4ErgoSourceObservation(candidate());
    expect(result.expectedStatus).toBe(status);
    expect(result.sourceIdentityDigestHex).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects a forged coherent build.sbt ancestry claim', () => {
    expect(() => assertV4ErgoSourceObservation(candidate({
      overlay: { ...overlay, baseBlob: 'a'.repeat(40) },
    }))).toThrow(/overlay|base blob|HEAD/u);
  });

  it('rejects an observed HEAD build.sbt blob different from the lock', () => {
    expect(() => assertV4ErgoSourceObservation(candidate({
      headBuildSbtBlob: 'b'.repeat(40),
    }))).toThrow(/base blob|HEAD/u);
  });

  it('rejects a substituted eight-file consensus source lock', () => {
    const changed = Buffer.from(consensusSourceLockBytes);
    changed[0] = changed[0] === 0x7b ? 0x5b : 0x7b;
    expect(() => assertV4ErgoSourceObservation(candidate({
      consensusSourceLockBytes: changed,
    }))).toThrow(/original consensus source lock bytes/u);
  });

  it('rejects raw byte drift, including a line-ending change', () => {
    expect(() => assertV4ErgoSourceObservation(candidate({
      buildSbtBytes: Buffer.from('name := "v4 source fixture"\r\n', 'utf8'),
    }))).toThrow(/overlay/u);
  });

  it('rejects a tenth working change and staged index drift', () => {
    for (const changedStatus of [
      `${status}\n?? unexpected.scala`,
      `${status}\n!! INDEX DRIFT`,
    ]) {
      expect(() => assertV4ErgoSourceObservation(candidate({
        checkout: { ...checkout, status: changedStatus },
      }))).toThrow(/nine-file raw checkout/u);
    }
  });

  it('rejects missing or extra observed blob entries', () => {
    const withoutOverlay = { ...checkout.blobs };
    delete withoutOverlay['build.sbt'];
    for (const blobs of [
      withoutOverlay,
      { ...checkout.blobs, 'unexpected.scala': 'c'.repeat(40) },
    ]) {
      expect(() => assertV4ErgoSourceObservation(candidate({
        checkout: { ...checkout, blobs },
      }))).toThrow(/exactly nine declared paths/u);
    }
  });
});
