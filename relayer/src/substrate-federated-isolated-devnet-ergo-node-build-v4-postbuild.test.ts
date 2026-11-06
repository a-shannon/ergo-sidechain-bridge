import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  lstatSync: vi.fn(), fstatSync: vi.fn(), openSync: vi.fn(),
  readSync: vi.fn(), closeSync: vi.fn(),
}));
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(), ...fsMock,
}));
afterEach(() => {
  for (const mocked of Object.values(fsMock)) mocked.mockReset();
});

import {
  V4_GENERATED_OUTPUT_ROOTS,
  hashV4SelectedAssembly,
  validateV4PostBuildObservations,
  validateV4ResolverStageObservations,
  type V4PostBuildCaps,
  type V4PostBuildEntry,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import type { V4PhysicalPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

const blob = '1'.repeat(40);
const fileHash = '2'.repeat(64);
const jarHash = '3'.repeat(64);
const jarBytes = 33554432;
const lock = {
  assemblyDirectory: 'target/scala-2.12',
  assemblyNamePattern: '^ergo-.*\\.jar$',
  minimumAssemblyBytes: jarBytes,
} as const;
const plan: V4PhysicalPlan = {
  files: new Map([['build.sbt', blob]]),
  directories: new Set(['', 'project', 'ergo-core', 'ergo-wallet', 'avldb']),
  children: new Map(),
};
const before: V4PostBuildEntry[] = [
  ...[...plan.directories].filter(Boolean).map(path => ({
    path, kind: 'directory' as const, identity: `source-dir:${path}`, reparsePoint: false,
  })),
  { path: 'build.sbt', kind: 'file', identity: 'source-file:build.sbt',
    reparsePoint: false, nlink: 1, bytes: 4, sha256Hex: fileHash, gitBlobSha1Hex: blob },
];
const generated: V4PostBuildEntry[] = [
  { path: 'project/project', kind: 'directory', identity: 'output:project/project',
    reparsePoint: false },
  ...V4_GENERATED_OUTPUT_ROOTS.map(path => ({
    path, kind: 'directory' as const, identity: `output:${path}`, reparsePoint: false,
  })),
  { path: 'target/scala-2.12', kind: 'directory', identity: 'output:target/scala-2.12',
    reparsePoint: false },
  { path: 'target/scala-2.12/ergo-assembly.jar', kind: 'file', identity: 'output:jar',
    reparsePoint: false, nlink: 1, bytes: jarBytes, sha256Hex: jarHash },
];
const expectedSourceDigestHex = createHash('sha256').update([
  ...[...plan.directories].filter(Boolean).map(path => `D\0${path}\n`),
  `F\0build.sbt\0${4}\0${fileHash}\n`,
].sort().join('')).digest('hex');
const caps: V4PostBuildCaps = {
  roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(root => [root,
    { maxFiles: root === 'target' ? 1 : 0,
      maxDirectories: root === 'target' || root === 'project/project/target' ? 2 : 1,
      maxBytes: root === 'target' ? jarBytes : 0 },
  ])) as unknown as V4PostBuildCaps['roots'],
  total: { maxFiles: 1, maxDirectories: 8, maxBytes: jarBytes },
};

function validate(after: readonly V4PostBuildEntry[] = [...before, ...generated],
  old: readonly V4PostBuildEntry[] = before,
  limits: V4PostBuildCaps = caps) {
  return validateV4PostBuildObservations({
    before: old, after, plan, expectedSourceDigestHex, caps: limits, lock,
  });
}

function validateResolver(resolver: readonly V4PostBuildEntry[] = before,
  old: readonly V4PostBuildEntry[] = before, limits: V4PostBuildCaps = caps) {
  return validateV4ResolverStageObservations({
    before: old, resolver, plan, expectedSourceDigestHex, caps: limits, lock,
  });
}

const resolverOutput: V4PostBuildEntry[] = [
  { path: 'target', kind: 'directory', identity: 'resolver:target', reparsePoint: false },
  { path: 'target/scala-2.12', kind: 'directory', identity: 'resolver:scala',
    reparsePoint: false },
  { path: 'target/scala-2.12/resolved.txt', kind: 'file', identity: 'resolver:file',
    reparsePoint: false, nlink: 1, bytes: 4, sha256Hex: fileHash },
];

describe('V4 resolver-stage observation before assembly', () => {
  it('accepts zero or a proper subset of generated roots without inventing six roots', () => {
    expect(validateResolver().total).toEqual({ files: 0, directories: 0, bytes: 0 });
    const observed = validateResolver([...before, ...resolverOutput]);
    expect(observed.sourceDigestHex).toBe(expectedSourceDigestHex);
    expect(observed.total).toEqual({ files: 1, directories: 2, bytes: 4 });
    expect(observed.generated['ergo-wallet/target']).toEqual({
      files: 0, directories: 0, bytes: 0,
    });
    expect(Object.isFrozen(observed.generated.target)).toBe(true);
    expect(() => validate([...before, ...resolverOutput])).toThrow(/generated output root absent/u);
  });

  it('rejects a generated root as a file and any assembly name before assembly', () => {
    expect(() => validateResolver([...before, {
      path: 'target', kind: 'file', identity: 'root-file', reparsePoint: false,
      nlink: 1, bytes: 0, sha256Hex: fileHash,
    }])).toThrow(/root is not a directory/u);
    const wider = { ...caps,
      roots: { ...caps.roots, target: { ...caps.roots.target, maxDirectories: 3 } },
      total: { ...caps.total, maxDirectories: 9 },
    };
    for (const entry of [
      { path: 'target/scala-2.12/ergo-old.jar', kind: 'file' as const,
        identity: 'old-file', reparsePoint: false, nlink: 1, bytes: 0,
        sha256Hex: fileHash },
      { path: 'target/scala-2.12/ergo-old.jar', kind: 'directory' as const,
        identity: 'old-directory', reparsePoint: false },
    ]) {
      expect(() => validateResolver([...before, ...resolverOutput.slice(0, 2), entry],
        before, wider)).toThrow(/assembly-name artifact preexists/u);
    }
    expect(() => validate([...before, ...generated.filter(entry => !entry.path.endsWith('.jar'))]))
      .toThrow(/exactly one matching assembly name/u);
  });

  it('rejects changed source, paths outside output roots, and unsafe output entries', () => {
    const changedHash = before.map(entry => entry.path === 'build.sbt'
      ? { ...entry, sha256Hex: '4'.repeat(64) } : entry);
    expect(() => validateResolver([...changedHash, ...resolverOutput]))
      .toThrow(/source digest differs/u);
    const changedInode = before.map(entry => entry.path === 'build.sbt'
      ? { ...entry, identity: 'replacement-inode' } : entry);
    expect(() => validateResolver([...changedInode, ...resolverOutput]))
      .toThrow(/source identity or content changed/u);
    expect(() => validateResolver([...before, { path: 'outside.txt', kind: 'file',
      identity: 'outside', reparsePoint: false, nlink: 1, bytes: 0, sha256Hex: fileHash }]))
      .toThrow(/outside six generated roots/u);
    expect(() => validateResolver([...before, ...resolverOutput.map(entry =>
      entry.path.endsWith('resolved.txt') ? { ...entry, nlink: 2 } : entry)]))
      .toThrow(/single-link/u);
    expect(() => validateResolver([...before, ...resolverOutput.map(entry =>
      entry.path === 'target' ? { ...entry, reparsePoint: true } : entry)]))
      .toThrow(/unsafe observed entry/u);
    expect(() => validateResolver([...before, resolverOutput[0]!,
      { ...resolverOutput[0]!, path: 'TARGET' }])).toThrow(/case-colliding/u);
  });

  it('rejects missing parents, duplicate entries, and per-root or total cap excess', () => {
    expect(() => validateResolver([...before, resolverOutput[0]!, resolverOutput[2]!]))
      .toThrow(/observed parent is missing/u);
    expect(() => validateResolver([...before, resolverOutput[0]!, resolverOutput[0]!]))
      .toThrow(/case-colliding/u);
    const extra = { ...resolverOutput[2]!, path: 'target/scala-2.12/another.txt' };
    const two = [...before, ...resolverOutput, extra];
    expect(() => validateResolver(two, before, { ...caps,
      total: { maxFiles: 2, maxDirectories: 8, maxBytes: 8 },
    })).toThrow(/exceeds caller cap/u);
    expect(() => validateResolver(two, before, { ...caps,
      roots: { ...caps.roots, target: { maxFiles: 2, maxDirectories: 2, maxBytes: 8 } },
      total: { maxFiles: 1, maxDirectories: 8, maxBytes: 8 },
    })).toThrow(/exceeds caller cap/u);
  });

  it('charges only the generated nested scaffold to existing directory caps', () => {
    const scaffold = generated.find(entry => entry.path === 'project/project')!;
    const nestedRoot = generated.find(entry => entry.path === 'project/project/target')!;
    const observed = validateResolver([...before, scaffold, nestedRoot]);
    expect(observed.generated['project/project/target']).toEqual({
      files: 0, directories: 2, bytes: 0,
    });
    expect(observed.total.directories).toBe(2);
    expect(() => validateResolver([...before, scaffold]))
      .toThrow(/generated scaffold lacks target root/u);
    expect(() => validateResolver([...before, scaffold, nestedRoot, {
      ...nestedRoot, path: 'project/project/other',
    }])).toThrow(/outside six generated roots/u);
    expect(() => validateResolver([...before, {
      path: 'project/project', kind: 'file', identity: 'scaffold-file',
      reparsePoint: false, nlink: 1, bytes: 0, sha256Hex: fileHash,
    }])).toThrow(/generated scaffold is not a directory/u);
    expect(() => validateResolver([...before, {
      ...scaffold, reparsePoint: true,
    }, nestedRoot])).toThrow(/unsafe observed entry/u);
    expect(() => validateResolver([...before, scaffold, nestedRoot], before, {
      ...caps, roots: { ...caps.roots, 'project/project/target': {
        ...caps.roots['project/project/target'], maxDirectories: 1,
      } },
    })).toThrow(/exceeds caller cap/u);
    expect(() => validateResolver([...before, scaffold, nestedRoot], before, {
      ...caps, total: { ...caps.total, maxDirectories: 1 },
    })).toThrow(/exceeds caller cap/u);
  });
});

describe('V4 non-authorizing post-build observation validation', () => {
  it('partitions all six output roots and selects the sole direct JAR', () => {
    const result = validate();
    expect(result.sourceDigestHex).toBe(expectedSourceDigestHex);
    expect(result.total).toEqual({ files: 1, directories: 8, bytes: jarBytes });
    expect(result.generated.target).toEqual({ files: 1, directories: 2, bytes: jarBytes });
    expect(result.generated['project/project/target']).toEqual({
      files: 0, directories: 2, bytes: 0,
    });
    expect(result.assembly).toEqual({
      path: 'target/scala-2.12/ergo-assembly.jar', bytes: jarBytes, sha256Hex: jarHash,
    });
    expect(Object.isFrozen(result.generated.target)).toBe(true);
  });

  it('rejects changed, missing, or unplanned pinned source paths', () => {
    const changed = before.map(entry => entry.path === 'build.sbt'
      ? { ...entry, sha256Hex: '4'.repeat(64) } : entry);
    expect(() => validate([...changed, ...generated])).toThrow(/source digest differs/u);
    expect(() => validate([...before.filter(entry => entry.path !== 'build.sbt'), ...generated]))
      .toThrow(/pinned source file differs/u);
    expect(() => validate([...before, ...generated,
      { path: 'unplanned.txt', kind: 'file', identity: 'extra', reparsePoint: false,
        nlink: 1, bytes: 1, sha256Hex: '5'.repeat(64) }], before,
    { ...caps, total: { maxFiles: 2, maxDirectories: 8, maxBytes: jarBytes + 1 } }))
      .toThrow(/outside six generated roots/u);
  });

  it('rejects preexisting output, changed source identity, and case collisions', () => {
    expect(() => validate([...before, ...generated], [...before, generated[0]!]))
      .toThrow(/pre-build source entry count differs/u);
    expect(() => validate([...before.map(entry => entry.path === 'project'
      ? { ...entry, identity: 'changed' } : entry), ...generated]))
      .toThrow(/source identity or content changed/u);
    expect(() => validate([...before, ...generated, { ...generated[0]!, path: 'TARGET' }],
      before, { ...caps, total: { maxFiles: 1, maxDirectories: 9, maxBytes: jarBytes } }))
      .toThrow(/case-colliding/u);
  });

  it('rejects reparse, linked, incomplete, or over-cap observations', () => {
    expect(() => validate([...before, ...generated.map(entry => entry.path === 'target'
      ? { ...entry, reparsePoint: true } : entry)]))
      .toThrow(/unsafe observed entry/u);
    expect(() => validate([...before, ...generated.map(entry => entry.kind === 'file'
      ? { ...entry, nlink: 2 } : entry)]))
      .toThrow(/single-link/u);
    expect(() => validate([...before, ...generated.filter(entry => entry.path !== 'avldb/target')]))
      .toThrow(/generated output root absent/u);
    expect(() => validate(undefined, before, { ...caps, total: { ...caps.total, maxBytes: jarBytes - 1 } }))
      .toThrow(/exceeds caller cap/u);
    expect(() => validate(undefined, before, { ...caps, roots: {} as V4PostBuildCaps['roots'] }))
      .toThrow(/six explicit root caps/u);
    expect(() => validate([...before, ...generated,
      { path: 'target/scala-2.12/extra.txt', kind: 'file', identity: 'extra',
        reparsePoint: false, nlink: 1, bytes: 0, sha256Hex: '7'.repeat(64) }]))
      .toThrow(/observation entry count exceeds caps/u);
  });

  it('counts every matching JAR name before any size filter', () => {
    expect(() => validate([...before, ...generated,
      { path: 'target/scala-2.12/ergo-stale.jar', kind: 'file', identity: 'stale',
        reparsePoint: false, nlink: 1, bytes: 0, sha256Hex: '6'.repeat(64) }],
    before, { ...caps, roots: { ...caps.roots, target: {
      maxFiles: 2, maxDirectories: 2, maxBytes: jarBytes,
    } }, total: { maxFiles: 2, maxDirectories: 8, maxBytes: jarBytes } }))
      .toThrow(/exactly one matching assembly name/u);
  });

  it('hashes a direct selected JAR and rejects changed bytes or linked paths', () => {
    const root = resolve('C:/v4-postbuild-virtual');
    const path = resolve(root, 'target', 'scala-2.12', 'ergo-test.jar');
    const linkedParent = resolve(root, 'target');
    const directoryStat = { dev: 1n, ino: 1n, mode: 16384n, nlink: 1n, size: 0n,
      mtimeNs: 1n, ctimeNs: 1n, isDirectory: () => true, isSymbolicLink: () => false };
    const fileStat = { dev: 1n, ino: 2n, mode: 32768n, nlink: 1n, size: 7n,
      mtimeNs: 1n, ctimeNs: 1n, isFile: () => true, isSymbolicLink: () => false };
    fsMock.lstatSync.mockImplementation((candidate: unknown) => String(candidate) === path
      ? fileStat : directoryStat);
    fsMock.fstatSync.mockReturnValue(fileStat);
    fsMock.openSync.mockReturnValue(17);
    let readCalls = 0;
    fsMock.readSync.mockImplementation((_fd: unknown, buffer: unknown) => {
      readCalls++;
      if (readCalls > 4) throw new Error('fixture read budget exceeded');
      if (readCalls % 2 === 0) return 0;
      Buffer.from('bounded').copy(buffer as Buffer);
      return 7;
    });
    const actualHash = createHash('sha256').update('bounded').digest('hex');
    const assembly = { path: 'target/scala-2.12/ergo-test.jar', bytes: 7,
      sha256Hex: actualHash };
    expect(hashV4SelectedAssembly(root, assembly, 7)).toBe(actualHash);
    expect(fsMock.readSync).toHaveBeenCalledTimes(2);
    expect(fsMock.closeSync).toHaveBeenCalledWith(17);
    expect(() => hashV4SelectedAssembly(root,
      { ...assembly, sha256Hex: '0'.repeat(64) }, 7)).toThrow(/digest differs/u);
    fsMock.lstatSync.mockImplementation((candidate: unknown) => String(candidate) === path
      ? { ...fileStat, isSymbolicLink: () => true } : directoryStat);
    expect(() => hashV4SelectedAssembly(root, assembly, 7)).toThrow(/not stable direct/u);
    fsMock.lstatSync.mockImplementation((candidate: unknown) => String(candidate) === linkedParent
      ? { ...directoryStat, isSymbolicLink: () => true }
      : String(candidate) === path ? fileStat : directoryStat);
    expect(() => hashV4SelectedAssembly(root, assembly, 7)).toThrow(/linked assembly ancestor/u);
  });
});
