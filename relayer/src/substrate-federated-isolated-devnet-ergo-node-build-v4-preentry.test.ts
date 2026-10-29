import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

import { captureV4BuildDependencies } from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import type { V4DependencyTree } from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import { captureV4PostBuildPhysicalTree } from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import { inspectV4NodeBuildPreflightWithPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';
import {
  inspectV4BuildPreentry, V4_PREENTRY_DIAGNOSTIC_STAGES,
  type V4BuildPreentryInput, type V4PreentryDiagnosticStage,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-preentry.js';
import type { V4PhysicalPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js', () => ({
  inspectV4NodeBuildPreflightWithPlan: vi.fn(),
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js', () => ({
  captureV4PostBuildPhysicalTree: vi.fn(),
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js', async importOriginal => {
  const original = await importOriginal<typeof import('./substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js')>();
  return { ...original, captureV4BuildDependencies: vi.fn() };
});

const preflightMock = vi.mocked(inspectV4NodeBuildPreflightWithPlan);
const captureMock = vi.mocked(captureV4PostBuildPhysicalTree);
const dependenciesMock = vi.mocked(captureV4BuildDependencies);
const lockSha = 'a'.repeat(64);

function input(): V4BuildPreentryInput {
  const cap = { maxFiles: 1_000, maxDirectories: 500, maxBytes: 500_000_000 };
  return {
    bridgeRoot: 'C:/bridge', sourcePath: 'D:/owned-source',
    gitHomePath: 'D:/owned-git-home', gitExecutablePath: 'C:/tools/git.exe',
    mirrorRoot: 'D:/owned-mirror', mirrorReceiptPath: 'D:/owned-mirror.json',
    bootRoot: 'D:/owned-boot', leveldbRoot: 'D:/owned-leveldb',
    leveldbReceiptPath: 'D:/owned-leveldb.json',
    caps: { roots: {
      target: cap, 'project/target': cap, 'project/project/target': cap,
      'ergo-core/target': cap, 'ergo-wallet/target': cap, 'avldb/target': cap,
    }, total: { maxFiles: 5_000, maxDirectories: 2_000, maxBytes: 1_000_000_000 } },
    maxMembershipBytes: 1_000_000,
  };
}

function syntheticPlan(): V4PhysicalPlan {
  const names = Array.from({ length: 737 }, (_, index) => 'f' + String(index).padStart(3, '0'));
  return {
    files: new Map(names.map(name => [name, 'a'.repeat(40)])),
    directories: new Set(['']),
    children: new Map([['', new Set(names)]]),
  };
}

function syntheticDependencyTree(bytes: number): V4DependencyTree {
  return {
    rootIdentity: 'synthetic-root', directories: [], files: [], bytes,
    directorySha256Hex: 'a'.repeat(64), fileMembershipSha256Hex: 'b'.repeat(64),
    metadataSha256Hex: 'c'.repeat(64), membership: '', identities: new Map(),
  };
}

function stubProducers(plan: V4PhysicalPlan): void {
  preflightMock.mockResolvedValue({
    observation: { lockSha256Hex: lockSha } as Awaited<ReturnType<typeof inspectV4NodeBuildPreflightWithPlan>>['observation'],
    physicalPlan: plan,
  });
  captureMock.mockResolvedValue({
    rootIdentity: 'synthetic-root', gitRootIdentity: 'synthetic-git',
    entries: [], membership: 'synthetic-membership',
  });
  dependenciesMock.mockResolvedValue({
    lockSha256Hex: lockSha,
    mirrorReceiptSha256Hex: 'b'.repeat(64),
    leveldbReceiptSha256Hex: 'c'.repeat(64),
    mirror: syntheticDependencyTree(123),
    boot: syntheticDependencyTree(45),
    leveldb: syntheticDependencyTree(67),
    bootJarFrameSha256Hex: 'e'.repeat(64),
    leveldbAggregateSha256Hex: 'f'.repeat(64),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('V4 source-only preentry composition', () => {
  it('joins only synthetic producer observations and retains explicit false authority', async () => {
    const plan = syntheticPlan();
    stubProducers(plan);
    const supplied = input();
    const observed = await inspectV4BuildPreentry(supplied);
    expect(preflightMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith({
      sourceRoot: resolve(supplied.sourcePath), plan, caps: observed.caps,
      phase: 'before', maxMembershipBytes: supplied.maxMembershipBytes,
    });
    expect(dependenciesMock).toHaveBeenCalledWith(supplied);
    expect(observed).toMatchObject({
      sourceOnlyPreparation: true, resolverExecuted: false,
      buildExecuted: false, campaignAdmitted: false,
      dependencies: { lockSha256Hex: lockSha },
    });
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed.caps.roots.target)).toBe(true);
    expect(Object.isFrozen(observed.prebuild.entries)).toBe(true);
    expect(observed.planSnapshot.sha256Hex).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('reports each V5 preentry check before it starts while retaining the result shape', async () => {
    stubProducers(syntheticPlan());
    const stages: V4PreentryDiagnosticStage[] = [];
    const observed = await inspectV4BuildPreentry(
      { ...input(), lockSelection: 'v5-source59' }, stage => { stages.push(stage); });
    expect(Object.isFrozen(V4_PREENTRY_DIAGNOSTIC_STAGES)).toBe(true);
    expect(stages).toEqual([
      'CAPS_COPY', 'ROOTS', 'MEMBERSHIP_CAP', 'PREFLIGHT', 'PLAN_SNAPSHOT',
      'PHYSICAL_BEFORE', 'PLAN_COMPARE', 'DEPENDENCIES', 'PLAN_COMPARE', 'LOCK_COMPARE',
    ]);
    expect(observed).toMatchObject({ sourceOnlyPreparation: true,
      resolverExecuted: false, buildExecuted: false, campaignAdmitted: false });
    const v4Stage = vi.fn();
    await inspectV4BuildPreentry(input(), v4Stage);
    expect(v4Stage).not.toHaveBeenCalled();
  });

  it('reports the last V5 preentry stage for isolated producer refusals', async () => {
    const cases: ReadonlyArray<Readonly<{
      refuse: () => void;
      expected: readonly V4PreentryDiagnosticStage[];
    }>> = [
      { refuse: () => { preflightMock.mockRejectedValueOnce(new Error('synthetic preflight')); },
        expected: ['CAPS_COPY', 'ROOTS', 'MEMBERSHIP_CAP', 'PREFLIGHT'] },
      { refuse: () => { captureMock.mockRejectedValueOnce(new Error('synthetic physical')); },
        expected: ['CAPS_COPY', 'ROOTS', 'MEMBERSHIP_CAP', 'PREFLIGHT',
          'PLAN_SNAPSHOT', 'PHYSICAL_BEFORE'] },
      { refuse: () => { dependenciesMock.mockRejectedValueOnce(new Error('synthetic dependencies')); },
        expected: ['CAPS_COPY', 'ROOTS', 'MEMBERSHIP_CAP', 'PREFLIGHT',
          'PLAN_SNAPSHOT', 'PHYSICAL_BEFORE', 'PLAN_COMPARE', 'DEPENDENCIES'] },
    ];
    for (const item of cases) {
      vi.resetAllMocks();
      stubProducers(syntheticPlan());
      item.refuse();
      const stages: V4PreentryDiagnosticStage[] = [];
      await expect(inspectV4BuildPreentry(
        { ...input(), lockSelection: 'v5-source59' }, stage => { stages.push(stage); }))
        .rejects.toThrow(/synthetic/u);
      expect(stages).toEqual(item.expected);
      expect(stages.every(stage => V4_PREENTRY_DIAGNOSTIC_STAGES.includes(stage)))
        .toBe(true);
    }
  });

  it('rejects absent and overlapping roots before any producer call', async () => {
    const missing = input();
    await expect(inspectV4BuildPreentry({ ...missing, leveldbRoot: '' }))
      .rejects.toThrow(/absolute/u);
    const overlap = input();
    await expect(inspectV4BuildPreentry({ ...overlap, leveldbRoot: 'D:/owned-mirror/child' }))
      .rejects.toThrow(/overlap/u);
    expect(preflightMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
    expect(dependenciesMock).not.toHaveBeenCalled();
  });

  it('requires caller caps rather than selecting an inherited output budget', async () => {
    const supplied = input();
    await expect(inspectV4BuildPreentry({ ...supplied, caps: undefined as never }))
      .rejects.toThrow(/caller caps/u);
    expect(preflightMock).not.toHaveBeenCalled();
  });

  it('uses validated inputs when the caller mutates during the preflight await', async () => {
    const plan = syntheticPlan();
    stubProducers(plan);
    const supplied = input();
    preflightMock.mockImplementation(async () => {
      Object.assign(supplied, {
        sourcePath: 'D:/owned-mirror/child', mirrorRoot: 'D:/owned-source/child',
        maxMembershipBytes: 2_000_000,
      });
      Object.assign(supplied.caps.total, { maxFiles: 10_000 });
      return {
        observation: { lockSha256Hex: lockSha } as Awaited<ReturnType<
          typeof inspectV4NodeBuildPreflightWithPlan>>['observation'],
        physicalPlan: plan,
      };
    });
    const observed = await inspectV4BuildPreentry(supplied);
    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceRoot: resolve('D:/owned-source'), maxMembershipBytes: 1_000_000,
      caps: expect.objectContaining({ total: expect.objectContaining({ maxFiles: 5_000 }) }),
    }));
    expect(dependenciesMock).toHaveBeenCalledWith(expect.objectContaining({
      sourcePath: 'D:/owned-source', mirrorRoot: 'D:/owned-mirror',
      maxMembershipBytes: 1_000_000,
    }));
    expect(observed.maxMembershipBytes).toBe(1_000_000);
    expect(observed.caps.total.maxFiles).toBe(5_000);
  });

  it('uses validated dependency roots when the caller mutates during capture', async () => {
    const plan = syntheticPlan();
    stubProducers(plan);
    const supplied = input();
    captureMock.mockImplementation(async () => {
      Object.assign(supplied, {
        leveldbRoot: 'D:/owned-mirror/child',
        leveldbReceiptPath: 'D:/unexpected.json', maxMembershipBytes: 2_000_000,
      });
      return { rootIdentity: 'synthetic-root', gitRootIdentity: 'synthetic-git',
        entries: [], membership: 'synthetic-membership' };
    });
    const observed = await inspectV4BuildPreentry(supplied);
    expect(dependenciesMock).toHaveBeenCalledWith(expect.objectContaining({
      leveldbRoot: 'D:/owned-leveldb', leveldbReceiptPath: 'D:/owned-leveldb.json',
      maxMembershipBytes: 1_000_000,
    }));
    expect(observed.maxMembershipBytes).toBe(1_000_000);
  });

  it('rejects a changed plan immediately after the prebuild capture await', async () => {
    const plan = syntheticPlan();
    stubProducers(plan);
    captureMock.mockImplementation(async () => {
      (plan.files as Map<string, string>).set('f000', 'b'.repeat(40));
      return { rootIdentity: 'synthetic-root', gitRootIdentity: 'synthetic-git',
        entries: [], membership: '' };
    });
    await expect(inspectV4BuildPreentry(input())).rejects.toThrow(/plan changed/u);
    expect(dependenciesMock).not.toHaveBeenCalled();
  });

  it('rejects a changed child set immediately after the dependency await', async () => {
    const plan = syntheticPlan();
    stubProducers(plan);
    dependenciesMock.mockImplementation(async () => {
      (plan.children.get('') as Set<string>).delete('f000');
      return {
        lockSha256Hex: lockSha,
        mirrorReceiptSha256Hex: '', leveldbReceiptSha256Hex: '',
        mirror: syntheticDependencyTree(0),
        boot: syntheticDependencyTree(0), leveldb: syntheticDependencyTree(0),
        bootJarFrameSha256Hex: '', leveldbAggregateSha256Hex: '',
      };
    });
    await expect(inspectV4BuildPreentry(input())).rejects.toThrow(/children differ/u);
  });

  it('propagates the physical producer refusal for preexisting generated output', async () => {
    stubProducers(syntheticPlan());
    captureMock.mockRejectedValue(new Error('generated output preexists'));
    await expect(inspectV4BuildPreentry(input())).rejects.toThrow(/generated output preexists/u);
    expect(dependenciesMock).not.toHaveBeenCalled();
  });

  it('propagates a dependency refusal without issuing a preentry result', async () => {
    stubProducers(syntheticPlan());
    dependenciesMock.mockRejectedValue(new Error('LevelDB membership changed'));
    await expect(inspectV4BuildPreentry(input())).rejects.toThrow(/LevelDB membership changed/u);
  });
});
