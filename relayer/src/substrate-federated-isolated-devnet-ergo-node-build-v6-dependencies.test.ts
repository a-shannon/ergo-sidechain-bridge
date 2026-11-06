import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  captureV4BuildDependencies, captureV6BuildDependencies,
  selectV6DependencyPathsNonAuthorizing,
  type V4DependencyCaptureInput, type V6DependencyCaptureInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');

function selected(root = resolve('synthetic-v6-dependency-namespace')):
  V6DependencyCaptureInput {
  const leveldbRoot = resolve(root, 'gitlab-leveldb-file-repo-01');
  return {
    bridgeRoot: resolve('synthetic-bridge-reference'),
    lockSelection: 'v6-current',
    mavenNamespaceRoot: root,
    v6MavenSourceRoot: resolve('synthetic-public-coursier'),
    mirrorRoot: resolve('synthetic-public-mirror'),
    bootRoot: resolve(root, 'boot'),
    leveldbRoot,
    leveldbReceiptPath: leveldbRoot + '.json',
  };
}

describe('V6 build dependency selection before physical capture', () => {
  it('selects only the NEW terminal/report paths for coherent synthetic roots', () => {
    const input = selected();
    const paths = selectV6DependencyPathsNonAuthorizing(input);
    expect(paths).toMatchObject({
      namespaceRoot: input.mavenNamespaceRoot,
      mirrorRoot: input.mirrorRoot,
      mavenSourceRoot: input.v6MavenSourceRoot,
      leveldbRoot: input.leveldbRoot,
      leveldbReceiptPath: input.leveldbReceiptPath,
      mavenTerminalPath: resolve(input.mavenNamespaceRoot,
        'maven-public-cache-reattest-terminal-01.json'),
      mavenReportPath: resolve(input.mavenNamespaceRoot,
        'maven-public-cache-reattest-01.json'),
      leveldbTerminalPath: resolve(input.mavenNamespaceRoot,
        'gitlab-leveldb-owner-terminal-01.json'),
    });
    expect(paths.mavenReportPath).not.toBe(input.mirrorRoot + '.json');
  });

  it('refuses V6 injection through the legacy capture before touching paths', async () => {
    await expect(captureV4BuildDependencies({
      lockSelection: 'v6-current',
    } as unknown as V4DependencyCaptureInput))
      .rejects.toThrow(/legacy dependency lock selection differs/u);
  });

  it('refuses a wrong selection, old sibling receipt and overlapping roots', () => {
    const input = selected();
    expect(() => selectV6DependencyPathsNonAuthorizing({
      ...input, lockSelection: 'v4',
    } as unknown as V6DependencyCaptureInput)).toThrow(/selection fields differ/u);
    expect(() => selectV6DependencyPathsNonAuthorizing({
      ...input, mirrorReceiptPath: input.mirrorRoot + '.json',
    } as V6DependencyCaptureInput)).toThrow(/selection fields differ/u);
    expect(() => selectV6DependencyPathsNonAuthorizing({
      ...input, mavenNamespaceRoot: input.mirrorRoot,
    })).toThrow(/roots or selected LevelDB receipt differ/u);
    expect(() => selectV6DependencyPathsNonAuthorizing({
      ...input, leveldbReceiptPath: input.mirrorRoot + '.json',
    })).toThrow(/roots or selected LevelDB receipt differ/u);
  });

  it('refuses a foreign V6 terminal before any mirror or boot scan', async () => {
    const fixtureRoot = realpathSync.native(mkdtempSync(join(tmpdir(), 'v6-dependency-test-')));
    try {
      const namespaceRoot = join(fixtureRoot, 'namespace');
      const sourceRoot = join(fixtureRoot, 'source');
      const mirrorRoot = join(fixtureRoot, 'mirror');
      const bootRoot = join(namespaceRoot, 'boot');
      const leveldbRoot = join(namespaceRoot, 'gitlab-leveldb-file-repo-01');
      for (const path of [namespaceRoot, sourceRoot, mirrorRoot, bootRoot, leveldbRoot]) {
        mkdirSync(path);
      }
      writeFileSync(join(namespaceRoot, 'maven-public-cache-reattest-terminal-01.json'),
        '{}\n', { flag: 'wx' });
      const input: V6DependencyCaptureInput = {
        bridgeRoot, lockSelection: 'v6-current',
        mavenNamespaceRoot: namespaceRoot, v6MavenSourceRoot: sourceRoot,
        mirrorRoot, bootRoot, leveldbRoot,
        leveldbReceiptPath: leveldbRoot + '.json',
      };
      await expect(captureV6BuildDependencies(input))
        .rejects.toThrow(/pinned file bytes changed/u);
    } finally {
      const parent = resolve(realpathSync.native(tmpdir()));
      if (dirname(fixtureRoot).toLowerCase() !== parent.toLowerCase()
          || !basename(fixtureRoot).startsWith('v6-dependency-test-')
          || !fixtureRoot.toLowerCase().startsWith(parent.toLowerCase() + sep)) {
        throw new Error('unsafe V6 dependency fixture cleanup path');
      }
      rmSync(fixtureRoot, { recursive: true });
    }
  });
});
