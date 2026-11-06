import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nativeJob } = vi.hoisted(() => ({ nativeJob: vi.fn() }));
vi.mock('./bounded-process-runner.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  runBoundedProcess: nativeJob,
}));

import {
  runV4OwnedBuildAttempt, runV6OwnedBuildAttempt,
  type V4OwnedBuildInput, type V6OwnedBuildInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.js';
import { V4_GENERATED_OUTPUT_ROOTS } from
  './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';

const base = resolve(import.meta.dirname, '__v6_actor_negative_absent__');
const cap = { maxFiles: 50_000, maxDirectories: 4_096,
  maxBytes: 536_870_912 };
const caps = { total: cap, roots: Object.fromEntries(
  V4_GENERATED_OUTPUT_ROOTS.map(root => [root, cap])) as V6OwnedBuildInput['caps']['roots'] };

function candidate(): V6OwnedBuildInput {
  const namespace = join(base, 'namespace');
  const leveldbRoot = join(namespace, 'gitlab-leveldb-file-repo-01');
  const home = (name: string): string => 'D:/v6-actor-negative-homes/' + name;
  return {
    bridgeRoot: join(base, 'bridge'), sourcePath: join(base, 'ergo-raw'),
    gitExecutablePath: join(base, 'tools', 'git.exe'),
    lockSelection: 'v6-current',
    mirrorRoot: join(base, 'mirror'), bootRoot: join(namespace, 'boot'),
    leveldbRoot, leveldbReceiptPath: leveldbRoot + '.json',
    mavenNamespaceRoot: namespace,
    v6MavenSourceRoot: join(base, 'coursier'),
    javaExecutablePath: join(base, 'tools', 'java.exe'),
    sbtLauncherJarPath: join(base, 'tools', 'sbt-launch.jar'),
    systemRoot: process.env.SystemRoot ?? process.env.WINDIR ?? 'C:/Windows',
    caps, maxMembershipBytes: 4_194_304,
    resultPath: 'D:/v6-actor-negative-result/v6-process-owned-build-result.json',
    gitHomes: {
      b0: home('b0'), preTarget: home('pre-target'),
      beforeResolverJob: home('before-r'), afterResolverJob: home('after-r'),
      beforeUpdateJob: home('before-u'), afterUpdateJob: home('after-u'),
      beforeAssemblyJob: home('before-a'), afterAssemblyJob: home('after-a'),
    },
  };
}

describe('V6 owned B0 actor pre-effect selection', () => {
  beforeEach(() => { nativeJob.mockClear(); });

  const assertNoEffect = (): void => {
    expect(nativeJob).not.toHaveBeenCalled();
    expect(existsSync(join(base, 'ergo-raw', 'target'))).toBe(false);
    expect(existsSync(join(base, 'attempt'))).toBe(false);
  };

  it('refuses V6 injection through the legacy actor before Git HOME or Java', async () => {
    await expect(runV4OwnedBuildAttempt(candidate() as unknown as V4OwnedBuildInput))
      .rejects.toThrow(/legacy lock selection differs/u);
    assertNoEffect();
  });

  it('requires the exact V6 literal and excludes the old mirror receipt field', async () => {
    const input = candidate();
    await expect(runV6OwnedBuildAttempt({
      ...input, lockSelection: 'v4',
    } as unknown as V6OwnedBuildInput))
      .rejects.toThrow(/explicit V6 selection or historical mirror receipt differs/u);
    await expect(runV6OwnedBuildAttempt({
      ...input, mirrorReceiptPath: input.mirrorRoot + '.json',
    } as V6OwnedBuildInput))
      .rejects.toThrow(/explicit V6 selection or historical mirror receipt differs/u);
    assertNoEffect();
  });

  it('refuses a larger total cap before any process or target effect', async () => {
    const input = candidate();
    await expect(runV6OwnedBuildAttempt({
      ...input, caps: { ...caps,
        total: { ...cap, maxFiles: 50_001 } },
    })).rejects.toThrow(/approved V6 output cap differs/u);
    assertNoEffect();
  });

  it('refuses overlapping source and V6 namespace before any effect', async () => {
    const input = candidate();
    await expect(runV6OwnedBuildAttempt({
      ...input, sourcePath: input.mavenNamespaceRoot,
    })).rejects.toThrow(/owned V6 roots overlap|namespace overlaps/u);
    assertNoEffect();
  });
});
