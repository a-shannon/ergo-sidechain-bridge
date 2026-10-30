import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const checkout = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js', async importOriginal => ({
  ...(await importOriginal<typeof import('./substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js')>()),
  inspectV4GitCheckoutAfterTarget: checkout.observe,
}));

import { inspectV4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import { inspectV4NodeBuildGitAfterTarget } from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('V4 post-target Git support pins', () => {
  it('derives the pinned overlay locally and returns only the Git observation', async () => {
    const lock = inspectV4NodeBuildLock(bridgeRoot).lock;
    const projected = Object.freeze({ head: lock.ergoNodeBaseCommit,
      tree: '9f8d571534b21eec660ff21177adf725e50ddf02',
      indexSha256Hex: '1'.repeat(64), status: 'synthetic-nine-path-status',
      sourceIdentityDigestHex: '2'.repeat(64) });
    checkout.observe.mockResolvedValueOnce(projected);
    const input = { bridgeRoot, sourcePath: 'D:\\synthetic-source',
      gitHomePath: 'D:\\synthetic-git-home', gitExecutablePath: 'C:\\synthetic-git.exe' };
    const observed = await inspectV4NodeBuildGitAfterTarget(input);
    expect(observed).toBe(projected);
    expect(checkout.observe).toHaveBeenCalledTimes(1);
    const raw = checkout.observe.mock.calls[0]![0] as {
      sourcePath: string; gitHomePath: string; gitExecutablePath: string;
      consensusSourceLockBytes: Buffer;
      overlay: { path: string; status: string; baseBlob: string; patchedBlob: string;
        bytes: number; sha256Hex: string };
    };
    expect([raw.sourcePath, raw.gitHomePath, raw.gitExecutablePath]).toEqual([
      input.sourcePath, input.gitHomePath, input.gitExecutablePath,
    ]);
    expect(digest(raw.consensusSourceLockBytes)).toBe(lock.consensusSourceLockSha256);
    expect(raw.overlay).toEqual({ path: 'build.sbt', status: 'modified',
      baseBlob: lock.buildSbtBaseBlob, patchedBlob: lock.buildSbtOverlayBlob,
      bytes: lock.buildSbtOverlayBytes, sha256Hex: lock.buildSbtOverlaySha256 });
    expect(Object.keys(observed).sort()).toEqual([
      'head', 'indexSha256Hex', 'sourceIdentityDigestHex', 'status', 'tree',
    ]);
  });
});
