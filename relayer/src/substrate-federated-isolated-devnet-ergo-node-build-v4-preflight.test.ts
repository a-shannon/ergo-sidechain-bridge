import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectV4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import { derivePinnedV4BuildSbtOverlay } from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const consensusBytes = readFileSync(resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'));
const jobBytes = readFileSync(resolve(import.meta.dirname, 'scripts', 'windows-job-process.ps1'));

describe('V4 build preflight static pins', () => {
  it('derives the sole build.sbt overlay from the pinned V4 lock and exact support bytes', () => {
    const pinned = inspectV4NodeBuildLock(bridgeRoot);
    expect(derivePinnedV4BuildSbtOverlay(pinned.lock, consensusBytes, jobBytes)).toEqual({
      path: 'build.sbt',
      status: 'modified',
      baseBlob: pinned.lock.buildSbtBaseBlob,
      patchedBlob: pinned.lock.buildSbtOverlayBlob,
      bytes: pinned.lock.buildSbtOverlayBytes,
      sha256Hex: pinned.lock.buildSbtOverlaySha256,
    });
  });

  it('rejects a changed consensus lock independently of the Job script', () => {
    const pinned = inspectV4NodeBuildLock(bridgeRoot);
    const changed = Buffer.from(consensusBytes);
    changed[0] ^= 1;
    expect(() => derivePinnedV4BuildSbtOverlay(pinned.lock, changed, jobBytes)).toThrow(
      'V4 preflight support does not match the pinned build lock',
    );
  });

  it('rejects a changed Job script independently of the consensus lock', () => {
    const pinned = inspectV4NodeBuildLock(bridgeRoot);
    const changed = Buffer.from(jobBytes);
    changed[0] ^= 1;
    expect(() => derivePinnedV4BuildSbtOverlay(pinned.lock, consensusBytes, changed)).toThrow(
      'V4 preflight support does not match the pinned build lock',
    );
  });
});
