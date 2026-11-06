import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  lstatSync: vi.fn(), fstatSync: vi.fn(), readdirSync: vi.fn(),
  openSync: vi.fn(), readSync: vi.fn(), closeSync: vi.fn(), readFileSync: vi.fn(),
}));
vi.mock('node:fs', async original => ({
  ...await original<typeof import('node:fs')>(), ...fsMock,
}));
afterEach(() => {
  for (const mock of Object.values(fsMock)) mock.mockReset();
});

import {
  V4PostBuildCaptureFailure, parseV4PostBuildInspectorOutput, scanV4PostBuildDirectTree,
  validateV4PhysicalPostBuildPair, validateV4PhysicalResolverStagePair,
  type V4PostBuildPhysicalCapture,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import {
  V4_GENERATED_OUTPUT_ROOTS, type V4PostBuildCaps, type V4PostBuildEntry,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import type { V4PhysicalPlan } from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';

const blob = createHash('sha1').update(Buffer.from('blob 1\0')).update('x').digest('hex');
const content = createHash('sha256').update('x').digest('hex');
const root = resolve('C:/v4-postbuild-physical-fixture');
const names = Array.from({ length: 737 }, (_, index) => `source-${index.toString().padStart(4, '0')}`);
const plan: V4PhysicalPlan = {
  files: new Map(names.map(name => [name, blob])),
  directories: new Set(['']), children: new Map(),
};
const emptyCaps: V4PostBuildCaps = {
  roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(name => [name,
    { maxFiles: 0, maxDirectories: 0, maxBytes: 0 },
  ])) as unknown as V4PostBuildCaps['roots'],
  total: { maxFiles: 0, maxDirectories: 0, maxBytes: 0 },
};
const directory = (mtime: bigint) => ({
  dev: 1n, ino: 2n, mode: 16384n, nlink: 1n, size: 0n,
  mtimeNs: mtime, ctimeNs: mtime,
  isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
});
const file = (nlink = 1n) => ({
  dev: 1n, ino: 3n, mode: 32768n, nlink, size: 1n,
  mtimeNs: 1n, ctimeNs: 1n,
  isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
});
function arrangeScan(extra: readonly string[] = [], linked = false, hardLinked = false): void {
  let statCalls = 0;
  let readCalls = 0;
  fsMock.readdirSync.mockImplementation((path: unknown) => {
    if (String(path) !== root) throw new Error('unexpected directory');
    return ['.git', ...names, ...extra];
  });
  fsMock.lstatSync.mockImplementation((path: unknown) => {
    const base = String(path).slice(String(path).lastIndexOf('\\') + 1);
    if (base.startsWith('source-')) {
      return linked ? { ...file(), isSymbolicLink: () => true }
        : file(hardLinked ? 2n : 1n);
    }
    statCalls++;
    return directory(BigInt(statCalls));
  });
  fsMock.fstatSync.mockReturnValue(file());
  fsMock.openSync.mockReturnValue(10);
  fsMock.readSync.mockImplementation((_fd: unknown, buffer: unknown) => {
    readCalls++;
    if (readCalls % 2 === 0) return 0;
    (buffer as Buffer)[0] = 'x'.charCodeAt(0);
    return 1;
  });
}
function scan() {
  return scanV4PostBuildDirectTree({
    sourceRoot: root, plan, caps: emptyCaps, phase: 'before', maxMembershipBytes: 131_072,
  });
}

describe('V4 bounded non-authorizing physical post-build capture', () => {
  it('captures all pinned files with direct stable-handle hashes and tolerates directory timestamp changes', () => {
    arrangeScan();
    const result = scan();
    expect(result.entries).toHaveLength(737);
    expect(result.membership.split('\n')).toHaveLength(739);
    expect(result.membership).toContain('D\t.git\n');
    expect(result.entries[0]).toMatchObject({
      kind: 'file', path: names[0], bytes: 1, sha256Hex: content,
      gitBlobSha1Hex: blob, nlink: 1, reparsePoint: false,
    });
    expect(fsMock.readSync).toHaveBeenCalledTimes(1_474);
    expect(fsMock.closeSync).toHaveBeenCalledTimes(737);
  });

  it('rejects an extra file, a case collision, a linked file and an absent Git root separately', () => {
    arrangeScan(['extra.txt']);
    expect(scan).toThrow(/outside source and six output roots/u);
    arrangeScan(['SOURCE-0000']);
    expect(scan).toThrow(/case-colliding directory children/u);
    arrangeScan([], true);
    expect(scan).toThrow(/reparse link/u);
    arrangeScan([], false, true);
    expect(scan).toThrow(/file exceeds cap or is indirect/u);
    arrangeScan();
    fsMock.readdirSync.mockReturnValue([...names]);
    expect(scan).toThrow(/source or Git count differs/u);
  });

  it('rejects an unbounded caller cap before reading the tree', () => {
    arrangeScan();
    expect(() => scanV4PostBuildDirectTree({
      sourceRoot: root, plan, caps: { ...emptyCaps, total: {
        maxFiles: 100_000, maxDirectories: 0, maxBytes: 0,
      } }, phase: 'before', maxMembershipBytes: 131_072,
    })).toThrow(/entry cap exceeds inspection ceiling/u);
    expect(fsMock.readdirSync).not.toHaveBeenCalled();
  });

  it('captures only actual resolver output roots and rejects a file in a root position', () => {
    arrangeScan(['target']);
    fsMock.readdirSync.mockImplementation((candidate: unknown) => {
      if (String(candidate) === root) return ['.git', ...names, 'target'];
      if (String(candidate) === resolve(root, 'target')) return [];
      throw new Error('unexpected directory');
    });
    const resolverCaps: V4PostBuildCaps = {
      roots: { ...emptyCaps.roots, target: {
        maxFiles: 0, maxDirectories: 1, maxBytes: 0,
      } }, total: { maxFiles: 0, maxDirectories: 1, maxBytes: 0 },
    };
    const input = { sourceRoot: root, plan, caps: resolverCaps,
      phase: 'resolver' as const, maxMembershipBytes: 131_072 };
    const captured = scanV4PostBuildDirectTree(input);
    expect(captured.entries.filter(entry => entry.path === 'target'))
      .toEqual([{ path: 'target', kind: 'directory', identity: '1:2:16384:1',
        reparsePoint: false }]);
    expect(() => scanV4PostBuildDirectTree({ ...input, phase: 'after' }))
      .toThrow(/generated output root absent/u);
    expect(() => scanV4PostBuildDirectTree({ ...input, phase: 'before' }))
      .toThrow(/generated output preexists/u);
    const originalStat = fsMock.lstatSync.getMockImplementation()!;
    fsMock.lstatSync.mockImplementation((candidate: unknown) =>
      String(candidate) === resolve(root, 'target') ? file() : originalStat(candidate));
    expect(() => scanV4PostBuildDirectTree(input))
      .toThrow(/generated output root is not a directory/u);
  });

  it('captures the exact nested SBT scaffold within existing caps and rejects deviations', () => {
    const nestedPlan: V4PhysicalPlan = {
      ...plan, directories: new Set(['', 'project']),
    };
    const nestedCaps: V4PostBuildCaps = {
      roots: { ...emptyCaps.roots, 'project/project/target': {
        maxFiles: 0, maxDirectories: 2, maxBytes: 0,
      } },
      total: { maxFiles: 0, maxDirectories: 2, maxBytes: 0 },
    };
    const input = { sourceRoot: root, plan: nestedPlan, caps: nestedCaps,
      phase: 'resolver' as const, maxMembershipBytes: 131_072 };
    const arrangeNested = (children: readonly string[] = ['target']): void => {
      arrangeScan();
      fsMock.readdirSync.mockImplementation((candidate: unknown) => {
        if (String(candidate) === root) return ['.git', ...names, 'project'];
        if (String(candidate) === resolve(root, 'project')) return ['project'];
        if (String(candidate) === resolve(root, 'project', 'project')) return [...children];
        if (String(candidate) === resolve(root, 'project', 'project', 'target')) return [];
        throw new Error('unexpected directory');
      });
    };
    arrangeNested();
    const captured = scanV4PostBuildDirectTree(input);
    expect(captured.entries.filter(entry => entry.path.startsWith('project/project'))
      .map(entry => entry.path)).toEqual(['project/project', 'project/project/target']);
    expect(captured.membership).toContain('D\tproject/project\n');
    expect(captured.membership).toContain('D\tproject/project/target\n');
    arrangeNested();
    expect(() => scanV4PostBuildDirectTree({ ...input, phase: 'before' }))
      .toThrow(/generated output preexists/u);
    arrangeNested([]);
    expect(() => scanV4PostBuildDirectTree(input))
      .toThrow(/generated scaffold lacks target root/u);
    arrangeNested(['target', 'other']);
    expect(() => scanV4PostBuildDirectTree(input))
      .toThrow(/outside source and six output roots/u);
    arrangeNested();
    const originalStat = fsMock.lstatSync.getMockImplementation()!;
    fsMock.lstatSync.mockImplementation((candidate: unknown) =>
      String(candidate) === resolve(root, 'project', 'project')
        ? file() : originalStat(candidate));
    expect(() => scanV4PostBuildDirectTree(input))
      .toThrow(/generated scaffold is not a directory/u);
    arrangeNested();
    const directStat = fsMock.lstatSync.getMockImplementation()!;
    fsMock.lstatSync.mockImplementation((candidate: unknown) =>
      String(candidate) === resolve(root, 'project', 'project')
        ? { ...directory(1n), isSymbolicLink: () => true }
        : directStat(candidate));
    expect(() => scanV4PostBuildDirectTree(input)).toThrow(/reparse link/u);
    arrangeNested();
    expect(() => scanV4PostBuildDirectTree({ ...input, caps: {
      ...nestedCaps, roots: { ...nestedCaps.roots, 'project/project/target': {
        ...nestedCaps.roots['project/project/target'], maxDirectories: 1,
      } },
    } })).toThrow(/generated output exceeds caller cap/u);
    arrangeNested();
    expect(() => scanV4PostBuildDirectTree({ ...input, caps: {
      ...nestedCaps, total: { ...nestedCaps.total, maxDirectories: 1 },
    } })).toThrow(/cap/u);
  });

  it('requires complete canonical inspector output including an opaque direct Git root', () => {
    const valid = 'D\t.git\nD\ttarget\nF\ttarget/assembly.jar\n';
    expect(parseV4PostBuildInspectorOutput(Buffer.from(valid).toString('base64'), 3, 1024))
      .toBe(valid);
    expect(() => parseV4PostBuildInspectorOutput(Buffer.from(valid).toString('base64') + '!', 3, 1024))
      .toThrow(/canonical base64/u);
    expect(() => parseV4PostBuildInspectorOutput(
      Buffer.from(valid.replaceAll('\n', '\r\n')).toString('base64'), 3, 1024,
    )).toThrow(/encoding differs/u);
    expect(() => parseV4PostBuildInspectorOutput(
      Buffer.from('D\t.git\nF\ttarget/assembly.jar\n').toString('base64'), 2, 1024,
    )).toThrow(/parent is absent/u);
    expect(() => parseV4PostBuildInspectorOutput(
      Buffer.from('D\t.git\nD\tTarget\nD\ttarget\n').toString('base64'), 3, 1024,
    )).toThrow(/case-collides/u);
    expect(() => parseV4PostBuildInspectorOutput(
      Buffer.from('D\ttarget\n').toString('base64'), 1, 1024,
    )).toThrow(/Git root is absent/u);
  });

  it('classifies each V5 inspector output branch without returning path data', () => {
    const valid = 'D\t.git\nD\ttarget\nF\ttarget/assembly.jar\n';
    const encode = (text: string): string => Buffer.from(text).toString('base64');
    const refusalCode = (encoded: string, maxEntries = 3, maxBytes = 1024,
      versioned = true): string => {
      try {
        parseV4PostBuildInspectorOutput(encoded, maxEntries, maxBytes,
          versioned ? 'v5-source59-after-assembly' : undefined);
        return 'ACCEPTED';
      } catch (error) {
        if (!V4PostBuildCaptureFailure.isConstructed(error)) throw error;
        return error.code;
      }
    };
    expect(refusalCode(encode(valid))).toBe('ACCEPTED');
    expect(refusalCode('%')).toBe('INSPECTOR_OUTPUT_BASE64');
    expect(refusalCode(encode(valid), 3, 1)).toBe('INSPECTOR_OUTPUT_BYTES');
    expect(refusalCode(Buffer.from([0xff]).toString('base64')))
      .toBe('INSPECTOR_OUTPUT_UTF8');
    expect(refusalCode(encode(valid.replaceAll('\n', '\r\n'))))
      .toBe('INSPECTOR_OUTPUT_FRAMING');
    expect(refusalCode(encode(valid), 2)).toBe('INSPECTOR_OUTPUT_COUNT');
    expect(refusalCode(encode('D\t.git\nX\ttarget\n')))
      .toBe('INSPECTOR_OUTPUT_ROW');
    expect(refusalCode(encode('D\ttarget\nD\t.git\n')))
      .toBe('INSPECTOR_OUTPUT_ORDER');
    expect(refusalCode(encode('D\t.git\nF\tbad:name\n')))
      .toBe('INSPECTOR_OUTPUT_PATH');
    expect(refusalCode(encode('D\t.git\nD\tTarget\nD\ttarget\n')))
      .toBe('INSPECTOR_OUTPUT_CASE');
    expect(refusalCode(encode('D\ttarget\n'))).toBe('INSPECTOR_OUTPUT_GIT');
    expect(refusalCode(encode('D\t.git\nF\ttarget/assembly.jar\n')))
      .toBe('INSPECTOR_OUTPUT_PARENT');
    expect(refusalCode('%', 3, 1024, false)).toBe('OTHER');
  });

  it('parses a bounded large canonical membership without recursive Base64 matching', () => {
    const suffix = 'x'.repeat(80);
    const membership = 'D\t.git\nD\ttarget\n' + Array.from({ length: 50_000 }, (_, index) =>
      `F\ttarget/f-${index.toString().padStart(5, '0')}-${suffix}\n`).join('');
    const membershipBytes = Buffer.byteLength(membership, 'utf8');
    expect(membershipBytes).toBeGreaterThan(4_194_304);
    expect(membershipBytes).toBeLessThan(16_777_216);
    const encoded = Buffer.from(membership).toString('base64');
    const parse = (value: string, maxBytes: number): string =>
      parseV4PostBuildInspectorOutput(value, 50_002, maxBytes,
        'v5-source59-after-assembly');
    expect(parse(encoded, 16_777_216) === membership).toBe(true);

    const refusal = (value: string, maxBytes: number): V4PostBuildCaptureFailure => {
      let caught: unknown;
      try { parse(value, maxBytes); } catch (error) { caught = error; }
      if (!V4PostBuildCaptureFailure.isConstructed(caught)) {
        throw new Error('expected a finite inspector output refusal');
      }
      return caught;
    };
    const overCap = refusal(encoded, 4_194_304);
    expect(overCap.code).toBe('INSPECTOR_OUTPUT_BYTES');
    expect(overCap.message).not.toContain('target/');
    const middle = Math.floor(encoded.length / 2);
    const malformed = refusal(encoded.slice(0, middle) + '!' + encoded.slice(middle + 1),
      16_777_216);
    expect(malformed.code).toBe('INSPECTOR_OUTPUT_BASE64');
    expect(malformed.message).not.toContain('target/');
  });

  it('keeps the root identity and post-build partition as separate conditions', () => {
    const sourceBlob = '1'.repeat(40);
    const sourceHash = '2'.repeat(64);
    const jarHash = '3'.repeat(64);
    const jarBytes = 33_554_432;
    const tinyPlan: V4PhysicalPlan = {
      files: new Map([['build.sbt', sourceBlob]]),
      directories: new Set(['', 'project', 'ergo-core', 'ergo-wallet', 'avldb']),
      children: new Map(),
    };
    const beforeEntries: V4PostBuildEntry[] = [
      ...[...tinyPlan.directories].filter(Boolean).map(path => ({
        path, kind: 'directory' as const, identity: `dir:${path}`, reparsePoint: false,
      })),
      { path: 'build.sbt', kind: 'file', identity: 'file:build.sbt', reparsePoint: false,
        nlink: 1, bytes: 4, sha256Hex: sourceHash, gitBlobSha1Hex: sourceBlob },
    ];
    const outputs: V4PostBuildEntry[] = [
      { path: 'project/project', kind: 'directory' as const,
        identity: 'dir:project/project', reparsePoint: false },
      ...V4_GENERATED_OUTPUT_ROOTS.map(path => ({ path, kind: 'directory' as const,
        identity: `dir:${path}`, reparsePoint: false })),
      { path: 'target/scala-2.12', kind: 'directory', identity: 'dir:scala', reparsePoint: false },
      { path: 'target/scala-2.12/ergo-test.jar', kind: 'file', identity: 'jar',
        reparsePoint: false, nlink: 1, bytes: jarBytes, sha256Hex: jarHash },
    ];
    const digest = createHash('sha256').update([
      ...[...tinyPlan.directories].filter(Boolean).map(path => `D\0${path}\n`),
      `F\0build.sbt\0${4}\0${sourceHash}\n`,
    ].sort().join('')).digest('hex');
    const caps: V4PostBuildCaps = {
      roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(name => [name,
        { maxFiles: name === 'target' ? 1 : 0,
          maxDirectories: name === 'target' || name === 'project/project/target' ? 2 : 1,
          maxBytes: name === 'target' ? jarBytes : 0 },
      ])) as unknown as V4PostBuildCaps['roots'],
      total: { maxFiles: 1, maxDirectories: 8, maxBytes: jarBytes },
    };
    const before: V4PostBuildPhysicalCapture = {
      rootIdentity: 'root:1', gitRootIdentity: 'git:1', entries: beforeEntries, membership: '',
    };
    const after: V4PostBuildPhysicalCapture = {
      rootIdentity: 'root:1', gitRootIdentity: 'git:1',
      entries: [...beforeEntries, ...outputs], membership: '',
    };
    const input = { before, after, plan: tinyPlan, expectedSourceDigestHex: digest,
      caps, lock: { assemblyDirectory: 'target/scala-2.12',
        assemblyNamePattern: '^ergo-.*\\.jar$', minimumAssemblyBytes: jarBytes } } as const;
    expect(validateV4PhysicalPostBuildPair(input).assembly.sha256Hex).toBe(jarHash);
    const resolver = { ...after, entries: [...beforeEntries,
      { path: 'target', kind: 'directory' as const, identity: 'resolver:target',
        reparsePoint: false }] };
    expect(validateV4PhysicalResolverStagePair({ ...input, resolver }).total)
      .toEqual({ files: 0, directories: 1, bytes: 0 });
    expect(() => validateV4PhysicalResolverStagePair({ ...input,
      resolver: { ...resolver, gitRootIdentity: 'changed' },
    })).toThrow(/root identity changed between captures/u);
    expect(() => validateV4PhysicalPostBuildPair({ ...input,
      after: { ...after, rootIdentity: 'swapped' },
    })).toThrow(/root identity changed between captures/u);
  });
});
