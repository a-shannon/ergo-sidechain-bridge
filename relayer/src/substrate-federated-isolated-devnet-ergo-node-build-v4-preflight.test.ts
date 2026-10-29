import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readHistoricalConsensusSourceLockBytes } from './historical-consensus-source-lock.test-helper.js';
import { inspectV4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import { derivePinnedV4BuildSbtOverlay, inspectV4NodeBuildGitAfterTarget,
  inspectV4NodeBuildPreflight, inspectV4NodeBuildPreflightWithPlan,
  inspectV6NodeBuildGitAfterTarget, inspectV6NodeBuildPreflightWithPlan,
  type V4NodeBuildPreflightInput,
  type V6NodeBuildPreflightInput } from
  './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';
import { inspectSelectedV6OrLegacyBuildLock } from
  './substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const consensusBytes = readHistoricalConsensusSourceLockBytes();
const currentConsensusBytes = readFileSync(resolve(bridgeRoot,
  'sources', 'consensus-source-lock.json'));
const jobBytes = readFileSync(resolve(import.meta.dirname, 'scripts', 'windows-job-process.ps1'));

describe('V4 build preflight static pins', () => {
  it('refuses runtime V6 injection through every legacy entry before file reads', async () => {
    const forged = { lockSelection: 'v6-current' } as unknown as V4NodeBuildPreflightInput;
    await expect(inspectV4NodeBuildPreflight(forged))
      .rejects.toThrow(/V4\/V5 preflight explicit lock selection/u);
    await expect(inspectV4NodeBuildPreflightWithPlan(forged))
      .rejects.toThrow(/V4\/V5 preflight explicit lock selection/u);
    await expect(inspectV4NodeBuildGitAfterTarget(forged))
      .rejects.toThrow(/V4\/V5 preflight explicit lock selection/u);
    const mislabeled = { lockSelection: 'v4' } as unknown as V6NodeBuildPreflightInput;
    await expect(inspectV6NodeBuildPreflightWithPlan(mislabeled))
      .rejects.toThrow(/V6 preflight requires explicit current/u);
    await expect(inspectV6NodeBuildGitAfterTarget(mislabeled))
      .rejects.toThrow(/V6 post-target Git check requires current/u);
  });

  it('pairs only the explicit V6 lock with the current consensus before checkout', () => {
    const selected = inspectSelectedV6OrLegacyBuildLock(bridgeRoot, 'v6-current');
    expect(derivePinnedV4BuildSbtOverlay(selected.lock, currentConsensusBytes,
      jobBytes)).toMatchObject({
      bytes: 20_585,
      patchedBlob: '23f9dbe303639b4e42cb85b9c4ef220b0a8aff78',
    });
    expect(() => derivePinnedV4BuildSbtOverlay(selected.lock, consensusBytes,
      jobBytes)).toThrow(/does not match the pinned build lock/u);
    const historical = inspectV4NodeBuildLock(bridgeRoot);
    expect(() => derivePinnedV4BuildSbtOverlay(historical.lock,
      currentConsensusBytes, jobBytes)).toThrow(/does not match the pinned build lock/u);
  });

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
