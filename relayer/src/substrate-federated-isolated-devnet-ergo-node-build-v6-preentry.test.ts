import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readHistoricalConsensusSourceLockBytes } from './historical-consensus-source-lock.test-helper.js';
import {
  V4_GENERATED_OUTPUT_ROOTS,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import {
  V6_NODE_BUILD_LOCK_CANONICAL_TEXT,
  V6_NODE_BUILD_LOCK_FILE_NAME,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import {
  inspectV6BuildPreentry, selectV6BuildPreentryInputNonAuthorizing,
  type V6BuildPreentryInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-preentry.js';

const cap = Object.freeze({ maxFiles: 50_000, maxDirectories: 4_096,
  maxBytes: 536_870_912 });
const caps = Object.freeze({
  total: cap,
  roots: Object.freeze(Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(root =>
    [root, cap])) as V6BuildPreentryInput['caps']['roots']),
});

function candidate(base = resolve('synthetic-v6-preentry')): V6BuildPreentryInput {
  const namespace = resolve(base, 'namespace');
  const leveldbRoot = resolve(namespace, 'gitlab-leveldb-file-repo-01');
  return {
    bridgeRoot: resolve(base, 'bridge'),
    sourcePath: resolve(base, 'ergo-raw'),
    gitHomePath: resolve(base, 'git-home'),
    gitExecutablePath: resolve(base, 'tools', 'git.exe'),
    lockSelection: 'v6-current',
    mirrorRoot: resolve(base, 'public-mirror'),
    bootRoot: resolve(namespace, 'boot'),
    leveldbRoot,
    leveldbReceiptPath: leveldbRoot + '.json',
    mavenNamespaceRoot: namespace,
    v6MavenSourceRoot: resolve(base, 'public-coursier'),
    caps, maxMembershipBytes: 4_194_304,
  };
}

describe('V6 owned build preentry is source-only and selected explicitly', () => {
  it('projects coherent synthetic paths and the six fixed caps without provenance', () => {
    const selected = selectV6BuildPreentryInputNonAuthorizing(candidate());
    expect(selected.preflight.lockSelection).toBe('v6-current');
    expect(Object.keys(selected.dependencies).sort()).toEqual([
      'bootRoot', 'bridgeRoot', 'leveldbReceiptPath', 'leveldbRoot',
      'lockSelection', 'mavenNamespaceRoot', 'mirrorRoot', 'v6MavenSourceRoot',
    ].sort());
    expect('mirrorReceiptPath' in selected.dependencies).toBe(false);
    expect(selected.caps.total).toEqual(cap);
    expect(selected.maxMembershipBytes).toBe(4_194_304);
  });

  it('refuses a legacy literal or historical sibling receipt before file reads', async () => {
    const input = candidate();
    await expect(inspectV6BuildPreentry({
      ...input, lockSelection: 'v4',
    } as unknown as V6BuildPreentryInput))
      .rejects.toThrow(/explicit V6 input fields or lock selection/u);
    await expect(inspectV6BuildPreentry({
      ...input, mirrorReceiptPath: input.mirrorRoot + '.json',
    } as V6BuildPreentryInput))
      .rejects.toThrow(/explicit V6 input fields or lock selection/u);
  });

  it('refuses overlaps and every total-cap increase before file reads', () => {
    const input = candidate();
    expect(() => selectV6BuildPreentryInputNonAuthorizing({
      ...input, sourcePath: input.mavenNamespaceRoot,
    })).toThrow(/namespace overlaps|owned V6 roots overlap/u);
    expect(() => selectV6BuildPreentryInputNonAuthorizing({
      ...input, bootRoot: input.mirrorRoot,
    })).toThrow(/owned V6 roots overlap/u);
    for (const changed of [
      { ...cap, maxFiles: 50_001 },
      { ...cap, maxDirectories: 4_097 },
      { ...cap, maxBytes: 536_870_913 },
    ]) {
      expect(() => selectV6BuildPreentryInputNonAuthorizing({
        ...input, caps: { ...caps, total: changed },
      })).toThrow(/approved V6 output cap differs/u);
    }
    expect(() => selectV6BuildPreentryInputNonAuthorizing({
      ...input, maxMembershipBytes: 4_194_305,
    })).toThrow(/explicit V6 membership cap differs/u);
  });

  it('rejects a stale consensus lock before raw-source or target observation', async () => {
    const fixtureRoot = realpathSync.native(mkdtempSync(join(tmpdir(), 'v6-preentry-test-')));
    try {
      const input = candidate(fixtureRoot);
      const sources = join(input.bridgeRoot, 'sources');
      mkdirSync(sources, { recursive: true });
      writeFileSync(join(sources, V6_NODE_BUILD_LOCK_FILE_NAME),
        V6_NODE_BUILD_LOCK_CANONICAL_TEXT, { flag: 'wx' });
      writeFileSync(join(sources, 'consensus-source-lock.json'),
        readHistoricalConsensusSourceLockBytes(), { flag: 'wx' });
      await expect(inspectV6BuildPreentry(input))
        .rejects.toThrow(/preflight support bytes or identity differ/u);
      expect(existsSync(join(input.sourcePath, 'target'))).toBe(false);
      expect(existsSync(join(fixtureRoot, 'attempt'))).toBe(false);
    } finally {
      const parent = resolve(realpathSync.native(tmpdir()));
      if (dirname(fixtureRoot).toLowerCase() !== parent.toLowerCase()
          || !basename(fixtureRoot).startsWith('v6-preentry-test-')
          || !fixtureRoot.toLowerCase().startsWith(parent.toLowerCase() + sep)) {
        throw new Error('unsafe V6 preentry fixture cleanup path');
      }
      rmSync(fixtureRoot, { recursive: true });
    }
  });
});
