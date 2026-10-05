import { createHash } from 'node:crypto';
import {
  existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copySubstrateFederatedTwoCycleNodeStateV1 as copy,
  type TwoCycleNodeStateCopyInputV1,
} from './substrate-federated-two-cycle-node-state-copy-v1.js';

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, lstatSync: vi.fn(fs.lstatSync) };
});

const frontier = ['chains/bridge_federated_v4_genesis/db/full',
  'chains/bridge_federated_v4_genesis/frontier/db'];
const ergo = ['state', 'history'];
const fixtures: string[] = [];
afterEach(() => {
  // Synthetic per-test files only, never a node data directory or historical runtime.
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function fixture(kind: 'frontier' | 'ergo' = 'frontier') {
  const root = mkdtempSync(join(tmpdir(), 'bridge-node-copy-synthetic-'));
  fixtures.push(root);
  const paths = kind === 'frontier' ? frontier : ergo;
  const primaryRoot = join(root, 'primary');
  const witnessRoot = join(root, 'witness');
  for (const [node, nodeRoot] of [['primary', primaryRoot], ['witness', witnessRoot]]) {
    for (const path of paths) {
      mkdirSync(join(nodeRoot, path, 'nested'), { recursive: true });
      writeFileSync(join(nodeRoot, path, 'nested', '000001.sst'), `${node}:${path}:synthetic-state`);
      writeFileSync(join(nodeRoot, path, 'LOCK'), '');
    }
    // These excluded trees must never be enumerated or copied, even when aliased.
    for (const name of ['network', 'keystore', 'wallet', 'jvm-temp']) {
      symlinkSync(nodeRoot, join(nodeRoot, name), 'junction');
    }
    writeFileSync(join(nodeRoot, 'config.json'), 'excluded synthetic config');
    writeFileSync(join(nodeRoot, 'node.log'), 'excluded synthetic log');
  }
  let calls = 0;
  const input: TwoCycleNodeStateCopyInputV1 = { kind, primaryRoot, witnessRoot,
    destinationDirectory: join(root, 'copied'), assertSourcesQuiescent: () => { calls++; } };
  return { root, paths, input, guardCalls: () => calls,
    file: join(primaryRoot, paths[0], 'nested', '000001.sst') };
}

describe('bounded key-free stopped-node database copy', () => {
  it.each(['frontier', 'ergo'] as const)('copies only %s database allowlists with relative hashes', async kind => {
    const f = fixture(kind);
    const manifest = await copy(f.input);
    expect(f.guardCalls()).toBe(2);
    expect(manifest.files).toHaveLength(8);
    expect(manifest.nodeConsistencyEstablished).toBe(false);
    expect(manifest.freshRestartValidated).toBe(false);
    expect(readdirSync(f.input.destinationDirectory).sort()).toEqual(['manifest.json', 'primary', 'witness']);
    let total = 0;
    for (const file of manifest.files) {
      const actual = readFileSync(join(f.input.destinationDirectory, file.node, file.path));
      expect(actual).toEqual(readFileSync(join(file.node === 'primary' ? f.input.primaryRoot : f.input.witnessRoot, file.path)));
      expect(createHash('sha256').update(actual).digest('hex')).toBe(file.sha256Hex);
      expect(actual.length).toBe(file.bytes);
      total += file.bytes;
    }
    expect(manifest.totalBytes).toBe(total);
    expect(JSON.parse(readFileSync(join(f.input.destinationDirectory, 'manifest.json'), 'utf8'))).toEqual(manifest);
    expect(JSON.stringify(manifest)).not.toContain(f.root);
    for (const node of ['primary', 'witness']) {
      for (const name of ['network', 'keystore', 'wallet', 'jvm-temp', 'config.json', 'node.log']) {
        expect(existsSync(join(f.input.destinationDirectory, node, name))).toBe(false);
      }
    }
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.files[0])).toBe(true);
  });

  it.each(['primary', 'witness'] as const)('rejects a missing required %s subtree', async node => {
    const f = fixture('ergo');
    rmSync(join(node === 'primary' ? f.input.primaryRoot : f.input.witnessRoot, 'history'), { recursive: true });
    await expect(copy(f.input)).rejects.toThrow();
    expect(existsSync(f.input.destinationDirectory)).toBe(false);
  });

  it.each(['empty', 'zero-bytes', 'file'] as const)('rejects %s required subtree', async fault => {
    const f = fixture('ergo');
    const path = join(f.input.primaryRoot, 'history');
    rmSync(path, { recursive: true });
    if (fault === 'file') writeFileSync(path, 'wrong type');
    else {
      mkdirSync(path);
      if (fault === 'zero-bytes') writeFileSync(join(path, 'LOCK'), '');
    }
    await expect(copy(f.input)).rejects.toThrow(/subtree/);
  });

  it('rejects a hardlinked database file', async () => {
    const f = fixture();
    linkSync(f.file, join(f.root, 'hardlink'));
    await expect(copy(f.input)).rejects.toThrow(/hardlink/);
  });

  it('rejects a symlinked database file via an isolated lstat response', async () => {
    const f = fixture();
    // Native file-symlink creation needs a Windows privilege unavailable on this
    // test host. Real junction fixtures above/below cover on-disk aliases.
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(lstatSync).mockImplementation(((path: string) => {
      const stat = actual.lstatSync(path);
      if (path === f.file) stat.isSymbolicLink = () => true;
      return stat;
    }) as typeof lstatSync);
    try { await expect(copy(f.input)).rejects.toThrow(/alias/); }
    finally { vi.mocked(lstatSync).mockImplementation(actual.lstatSync); }
  });

  it('rejects a database tree deeper than its traversal bound', async () => {
    const f = fixture('ergo');
    mkdirSync(join(f.input.primaryRoot, 'state', ...Array<string>(65).fill('deeper')), { recursive: true });
    await expect(copy(f.input)).rejects.toThrow(/depth/);
  });

  it('rejects an explicit parent traversal in a supplied path', async () => {
    const f = fixture();
    await expect(copy({ ...f.input, destinationDirectory: `${f.root}/primary/../copy` })).rejects.toThrow(/traversal/);
  });

  it.each(['root', 'required-subtree', 'nested-directory', 'destination-parent'] as const)(
    'rejects a junction at %s', async fault => {
      const f = fixture('ergo');
      let input = f.input;
      if (fault === 'root') {
        const alias = join(f.root, 'alias');
        symlinkSync(f.input.primaryRoot, alias, 'junction');
        input = { ...input, primaryRoot: alias };
      } else if (fault === 'destination-parent') {
        const alias = join(f.root, 'alias');
        symlinkSync(f.root, alias, 'junction');
        input = { ...input, destinationDirectory: join(alias, 'copy') };
      } else {
        const alias = fault === 'required-subtree' ? join(input.primaryRoot, 'history')
          : join(input.primaryRoot, 'state', 'nested');
        rmSync(alias, { recursive: true });
        symlinkSync(join(input.witnessRoot, 'history'), alias, 'junction');
      }
      await expect(copy(input)).rejects.toThrow(/alias/);
    });

  it.each(['identical', 'source-descendant', 'destination-in-source', 'source-in-destination'] as const)(
    'rejects %s root overlap', async fault => {
      const f = fixture('ergo');
      const input = { ...f.input };
      if (fault === 'identical') input.witnessRoot = input.primaryRoot;
      if (fault === 'source-descendant') input.witnessRoot = join(input.primaryRoot, 'state');
      if (fault === 'destination-in-source') input.destinationDirectory = join(input.primaryRoot, 'copy');
      if (fault === 'source-in-destination') input.destinationDirectory = f.root;
      await expect(copy(input)).rejects.toThrow(/overlap/);
    });

  it.each(['file', 'directory', 'junction'] as const)('rejects existing destination %s', async kind => {
    const f = fixture();
    if (kind === 'file') writeFileSync(f.input.destinationDirectory, 'existing');
    if (kind === 'directory') mkdirSync(f.input.destinationDirectory);
    if (kind === 'junction') symlinkSync(f.input.primaryRoot, f.input.destinationDirectory, 'junction');
    await expect(copy(f.input)).rejects.toThrow(/already exists/);
  });

  it.each(['maxFiles', 'maxFileBytes', 'maxTotalBytes'] as const)('enforces %s before publishing', async name => {
    const f = fixture();
    await expect(copy({ ...f.input, [name]: 1 })).rejects.toThrow(/bound/);
    expect(existsSync(f.input.destinationDirectory)).toBe(false);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid bound %s', async value => {
    const f = fixture();
    await expect(copy({ ...f.input, maxFiles: value })).rejects.toThrow(/invalid/);
  });

  it.each(['relative', 'unsafe-component'] as const)('rejects %s destination path', async fault => {
    const f = fixture();
    const path = fault === 'relative' ? 'copied' : join(f.root, 'unsafe:stream');
    await expect(copy({ ...f.input, destinationDirectory: path })).rejects.toThrow(/absolute|unsafe/);
  });

  it('rejects unsupported layouts and missing shutdown guard', async () => {
    const f = fixture();
    await expect(copy({ ...f.input, kind: 'other' } as unknown as TwoCycleNodeStateCopyInputV1)).rejects.toThrow(/layout/);
    await expect(copy({ ...f.input, assertSourcesQuiescent: undefined } as unknown as TwoCycleNodeStateCopyInputV1))
      .rejects.toThrow(/quiescence/);
  });

  it.each(['content', 'added-file', 'deleted-file', 'replaced-file'] as const)(
    'rejects source %s drift and leaves an unpublished partial', async fault => {
      const f = fixture();
      let calls = 0;
      await expect(copy({ ...f.input, assertSourcesQuiescent: () => {
        if (++calls !== 2) return;
        if (fault === 'content') writeFileSync(f.file, Buffer.alloc(readFileSync(f.file).length, 0x78));
        if (fault === 'added-file') writeFileSync(join(f.input.primaryRoot, f.paths[0], 'extra.sst'), 'added');
        if (fault === 'deleted-file') rmSync(f.file);
        if (fault === 'replaced-file') { renameSync(f.file, join(f.root, 'original')); writeFileSync(f.file, 'replacement'); }
      } })).rejects.toThrow();
      expect(existsSync(f.input.destinationDirectory)).toBe(false);
      const partials = readdirSync(f.root).filter(name => name.startsWith('.copied.partial-'));
      expect(partials).toHaveLength(1);
      expect(existsSync(join(f.root, partials[0], 'manifest.json'))).toBe(false);
    });

  it.each(['content', 'excluded-file'] as const)('rejects destination %s drift', async fault => {
    const f = fixture();
    let calls = 0;
    await expect(copy({ ...f.input, assertSourcesQuiescent: () => {
      if (++calls !== 2) return;
      const partial = readdirSync(f.root).find(name => name.startsWith('.copied.partial-'))!;
      if (fault === 'content') writeFileSync(join(f.root, partial, 'primary', f.paths[0], 'nested', '000001.sst'), 'changed');
      else writeFileSync(join(f.root, partial, 'primary', 'secret.json'), 'unexpected');
    } })).rejects.toThrow(/destination/);
    expect(existsSync(f.input.destinationDirectory)).toBe(false);
  });

  it.each(['hardlink', 'junction'] as const)('rejects destination %s substitution', async fault => {
    const f = fixture('ergo');
    let calls = 0;
    await expect(copy({ ...f.input, assertSourcesQuiescent: () => {
      if (++calls !== 2) return;
      const partial = readdirSync(f.root).find(name => name.startsWith('.copied.partial-'))!;
      const target = join(f.root, partial, 'primary', 'state', 'nested');
      if (fault === 'hardlink') linkSync(join(target, '000001.sst'), join(f.root, 'linked-copy'));
      else { rmSync(target, { recursive: true }); symlinkSync(join(f.input.primaryRoot, 'state', 'nested'), target, 'junction'); }
    } })).rejects.toThrow(/hardlink|alias/);
    expect(existsSync(f.input.destinationDirectory)).toBe(false);
  });

  it.each([1, 2])('refuses publication when owner stop guard fails at call %s', async failureCall => {
    const f = fixture();
    let calls = 0;
    await expect(copy({ ...f.input, assertSourcesQuiescent: () => {
      if (++calls === failureCall) throw new Error('owner has not proved shutdown');
    } })).rejects.toThrow(/shutdown/);
    expect(existsSync(f.input.destinationDirectory)).toBe(false);
  });
});
