import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  scanV4DirectDependencyTree, type V4DependencyTree,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import {
  seedV4IsolatedSbtBoot, type V4BootSeedInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-boot-seed.js';

let fixtureRoot: string | undefined;
afterEach(() => {
  if (!fixtureRoot) return;
  const path = resolve(fixtureRoot);
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith('v4-boot-seed-')) {
    throw new Error('test fixture cleanup path differs');
  }
  rmSync(path, { recursive: true });
  fixtureRoot = undefined;
});

function fileFrame(tree: V4DependencyTree): string {
  const hash = createHash('sha256');
  for (const file of tree.files) {
    hash.update(Buffer.from(file.path, 'utf8')).update(Buffer.from([0]))
      .update(String(file.size)).update(Buffer.from([0]))
      .update(file.sha256Hex).update('\n');
  }
  return hash.digest('hex');
}

function fixture(): V4BootSeedInput {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'v4-boot-seed-'));
  const sourceRoot = resolve(fixtureRoot, 'source');
  const bootRoot = resolve(fixtureRoot, 'boot');
  const stateRoot = resolve(sourceRoot, 'target', 'bridge-sbt-state-v4');
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(resolve(bootRoot, 'lib'), { recursive: true });
  mkdirSync(resolve(bootRoot, 'sbt'), { recursive: true });
  writeFileSync(resolve(bootRoot, 'lib', 'one.jar'), 'one');
  writeFileSync(resolve(bootRoot, 'sbt', 'two.jar'), 'two');
  const capturedBoot = scanV4DirectDependencyTree(bootRoot, 92, 6, 65_536);
  return {
    sourceRoot, bootRoot, capturedBoot,
    destinationRoot: resolve(stateRoot, 'sbt-boot'),
    lock: {
      isolatedSbtStateDirectory: 'target/bridge-sbt-state-v4',
      ownedBootJarCount: 2,
      ownedBootJarBytes: 6,
      ownedBootDirectoryCount: 2,
      ownedBootJarFrameSha256: fileFrame(capturedBoot),
    } as unknown as V4BootSeedInput['lock'],
  };
}

describe('V4 isolated SBT boot seed', () => {
  it('copies only the pinned JAR tree into an absent state and preserves the source', () => {
    const input = fixture();
    const result = seedV4IsolatedSbtBoot(input);
    expect(result).toEqual({
      destinationRoot: input.destinationRoot, fileCount: 2, bytes: 6,
      frameSha256Hex: input.lock.ownedBootJarFrameSha256,
    });
    const copied = scanV4DirectDependencyTree(input.destinationRoot, 92, 6, 65_536);
    expect(copied.files).toEqual(input.capturedBoot.files);
    expect(scanV4DirectDependencyTree(input.bootRoot, 92, 6, 65_536).files)
      .toEqual(input.capturedBoot.files);
  });

  it('rejects changed source bytes before making the destination', () => {
    const input = fixture();
    writeFileSync(resolve(input.bootRoot, 'lib', 'one.jar'), 'ONE');
    expect(() => seedV4IsolatedSbtBoot(input)).toThrow(/captured boot source/u);
    expect(existsSync(input.destinationRoot)).toBe(false);
  });

  it('refuses an existing target before copying', () => {
    const input = fixture();
    mkdirSync(input.destinationRoot);
    expect(() => seedV4IsolatedSbtBoot(input)).toThrow(/destination already exists/u);
  });

  it('refuses an incorrect pinned frame before copying', () => {
    const input = fixture();
    const changed = {
      ...input,
      lock: { ...input.lock, ownedBootJarFrameSha256: '0'.repeat(64) },
    };
    expect(() => seedV4IsolatedSbtBoot(changed)).toThrow(/pinned JAR frame/u);
    expect(existsSync(input.destinationRoot)).toBe(false);
  });
});
