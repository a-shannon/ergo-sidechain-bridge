import { createHash } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmdirSync, rmSync,
  symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertSameV4PhysicalMetadata,
  buildV4PhysicalPlan,
  captureV4PhysicalMetadata,
  inspectV4PhysicalSource,
  scanV4PhysicalSourcePass,
  type V4PhysicalDeclaration,
  type V4PhysicalTreeEntry,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import { inspectV4RawErgoCheckout } from './substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js';

const D_TEST_PARENT = parse('D:/').root;
function hasRequiredDVolume(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const stat = lstatSync(D_TEST_PARENT);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('V4 D volume root is indirect');
    }
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENODEV') return false;
    throw error;
  }
}

function gitBlob(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}
function fixture(): {
  head: Map<string, V4PhysicalTreeEntry>;
  declarations: V4PhysicalDeclaration[];
  contents: Map<string, Buffer>;
} {
  const head = new Map<string, V4PhysicalTreeEntry>();
  const contents = new Map<string, Buffer>();
  for (let i = 0; i < 734; i++) {
    const path = `tree/file${String(i).padStart(4, '0')}`;
    const base = Buffer.from([i % 256]);
    head.set(path, { path, mode: i < 724 ? '100644' : '100755',
      type: 'blob', objectId: gitBlob(base) });
    contents.set(path, base);
  }
  const declarations: V4PhysicalDeclaration[] = [];
  for (let i = 0; i < 6; i++) {
    const path = `tree/file${String(i).padStart(4, '0')}`;
    const patched = Buffer.from(`patched-${i}`);
    declarations.push({ path, status: 'modified', patchedBlob: gitBlob(patched) });
    contents.set(path, patched);
  }
  for (let i = 0; i < 3; i++) {
    const path = `tree/add${i}`;
    const added = Buffer.from(`added-${i}`);
    declarations.push({ path, status: 'added', patchedBlob: gitBlob(added) });
    contents.set(path, added);
  }
  return { head, declarations, contents };
}

describe('V4 physical source census', () => {
  it('rejects a HEAD link or Gitlink, a case collision, and a file/directory prefix conflict', () => {
    const { head, declarations } = fixture();
    const path = 'tree/file0000';
    for (const [mode, type] of [['120000', 'blob'], ['160000', 'commit']] as const) {
      const linked = new Map(head);
      linked.set(path, { ...linked.get(path)!, mode, type });
      expect(() => buildV4PhysicalPlan(linked, declarations)).toThrow(/unsupported HEAD entry/u);
    }
    const collision = new Map(head);
    collision.delete('tree/file0010');
    collision.set('TREE/File0000', { ...head.get(path)!, path: 'TREE/File0000' });
    expect(() => buildV4PhysicalPlan(collision, declarations)).toThrow(/case-colliding/u);
    const prefix = declarations.map((item, i) => i === 6
      ? { ...item, path: 'tree/file0000/child' } : item);
    expect(() => buildV4PhysicalPlan(head, prefix)).toThrow(/prefix conflict/u);
  });

  it('sees every file and rejects an ignored file, empty directory, changed blob, and hardlink', async () => {
    const { head, declarations, contents } = fixture();
    const plan = buildV4PhysicalPlan(head, declarations);
    const root = mkdtempSync(join(tmpdir(), 'v4-physical-'));
    try {
      mkdirSync(join(root, '.git'));
      mkdirSync(join(root, 'tree'));
      for (const [path, bytes] of contents) writeFileSync(join(root, ...path.split('/')), bytes);
      const first = scanV4PhysicalSourcePass(root, plan);
      expect(first.physicalSourceFileCount).toBe(737);
      expect(first.physicalSourceDirectoryCount).toBe(2);
      expect(first.physicalSourceTotalBytes).toBe([...contents.values()]
        .reduce((sum, bytes) => sum + bytes.length, 0));
      if (process.platform === 'win32') {
        const baseline = await captureV4PhysicalMetadata(root);
        const checked = await inspectV4PhysicalSource(root, plan, baseline, async () => {});
        expect(checked.physicalSourceDigestHex).toBe(first.physicalSourceDigestHex);
      }
      writeFileSync(join(root, 'tree', '.ignored'), 'extra');
      expect(() => scanV4PhysicalSourcePass(root, plan)).toThrow(/membership differs/u);
      rmSync(join(root, 'tree', '.ignored'));
      mkdirSync(join(root, 'tree', 'empty'));
      expect(() => scanV4PhysicalSourcePass(root, plan)).toThrow(/membership differs/u);
      rmSync(join(root, 'tree', 'empty'), { recursive: true });
      writeFileSync(join(root, 'tree', 'file0000'), 'forged');
      expect(() => scanV4PhysicalSourcePass(root, plan)).toThrow(/Git blob differs/u);
      writeFileSync(join(root, 'tree', 'file0000'), contents.get('tree/file0000')!);
      rmSync(join(root, 'tree', 'file0000'));
      linkSync(join(root, 'tree', 'file0256'), join(root, 'tree', 'file0000'));
      expect(() => scanV4PhysicalSourcePass(root, plan)).toThrow(/single-link/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasRequiredDVolume())('rejects root and Git-object junctions before attempting Git', async () => {
    const base = mkdtempSync(join(tmpdir(), 'v4-reparse-negative-'));
    const source = join(base, 'source');
    const linked = join(base, 'linked');
    const target = join(base, 'target');
    const gitHome = mkdtempSync(join(D_TEST_PARENT, 'v4-physical-git-home-'));
    let rootLinked = false;
    let objectLinked = false;
    try {
      mkdirSync(source);
      mkdirSync(join(source, '.git'));
      mkdirSync(target);
      symlinkSync(source, linked, 'junction');
      rootLinked = true;
      const input = { gitExecutablePath: join(base, 'missing-git.exe'), gitHomePath: gitHome,
        consensusSourceLockBytes: Buffer.alloc(0), overlay: {} as never };
      await expect(inspectV4RawErgoCheckout({ ...input, sourcePath: linked }))
        .rejects.toThrow(/reparse inspection failed/u);
      symlinkSync(target, join(source, '.git', 'objects'), 'junction');
      objectLinked = true;
      await expect(inspectV4RawErgoCheckout({ ...input, sourcePath: source }))
        .rejects.toThrow(/reparse inspection failed/u);
    } finally {
      if (objectLinked) rmdirSync(join(source, '.git', 'objects'));
      if (rootLinked) rmdirSync(linked);
      rmSync(base, { recursive: true, force: true });
      rmSync(gitHome, { recursive: true, force: true });
    }
  });

  it('rejects a same-byte new inode between the two full source passes', async () => {
    if (process.platform !== 'win32') return;
    const { head, declarations, contents } = fixture();
    const plan = buildV4PhysicalPlan(head, declarations);
    const root = mkdtempSync(join(tmpdir(), 'v4-identity-negative-'));
    const outside = mkdtempSync(join(tmpdir(), 'v4-identity-old-'));
    try {
      mkdirSync(join(root, '.git'));
      mkdirSync(join(root, 'tree'));
      for (const [path, bytes] of contents) writeFileSync(join(root, ...path.split('/')), bytes);
      const baseline = await captureV4PhysicalMetadata(root);
      const original = scanV4PhysicalSourcePass(root, plan);
      await expect(inspectV4PhysicalSource(root, plan, baseline, async () => {
        const path = join(root, 'tree', 'file0100');
        renameSync(path, join(outside, 'file0100'));
        writeFileSync(path, contents.get('tree/file0100')!);
        const replaced = scanV4PhysicalSourcePass(root, plan);
        expect(replaced.physicalSourceDigestHex).toBe(original.physicalSourceDigestHex);
        expect(replaced.membership).toBe(original.membership);
      })).rejects.toThrow(/identity changed between physical passes/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects a new Git-metadata member against the first census', async () => {
    if (process.platform !== 'win32') return;
    const base = mkdtempSync(join(tmpdir(), 'v4-git-membership-'));
    try {
      mkdirSync(join(base, '.git'));
      const baseline = await captureV4PhysicalMetadata(base);
      writeFileSync(join(base, '.git', 'extra'), 'new metadata member');
      const after = await captureV4PhysicalMetadata(base);
      expect(() => assertSameV4PhysicalMetadata(baseline, after))
        .toThrow(/metadata membership changed/u);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
