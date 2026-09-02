import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveBridgeRepositoryRootsFromCheckoutLayout } from './bridge-repository-layout.js';

describe('bridge repository checkout layout', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves a standalone bridge checkout without executing Git', () => {
    const bridgeRoot = temporaryRoot('e2s-bridge-standalone-');
    mkdirSync(join(bridgeRoot, '.git'));
    vi.stubEnv('PATH', '');

    expect(resolveBridgeRepositoryRootsFromCheckoutLayout(bridgeRoot)).toEqual({
      bridgeRoot,
      worktreeRoot: bridgeRoot,
    });
  });

  it('resolves a bridge inside a superproject worktree without executing Git', () => {
    const worktreeRoot = temporaryRoot('e2s-bridge-superproject-');
    writeFileSync(join(worktreeRoot, '.git'), 'gitdir: external-worktree-metadata\n');
    const bridgeRoot = join(worktreeRoot, 'ergo-sidechain-bridge');
    mkdirSync(bridgeRoot);

    expect(resolveBridgeRepositoryRootsFromCheckoutLayout(bridgeRoot)).toEqual({
      bridgeRoot,
      worktreeRoot,
    });
  });

  it('rejects a directory that is not a supported bridge checkout layout', () => {
    const root = temporaryRoot('e2s-bridge-unbound-');
    const bridgeRoot = join(root, 'ergo-sidechain-bridge');
    mkdirSync(bridgeRoot);

    expect(() => resolveBridgeRepositoryRootsFromCheckoutLayout(bridgeRoot))
      .toThrow('bridge checkout layout is unavailable');
  });

  it.each([
    ['missing gitdir prefix', 'not git metadata\n'],
    ['embedded NUL', 'gitdir: external\u0000metadata\n'],
    ['lone carriage return', 'gitdir: external\r'],
    ['oversized content', `gitdir: ${'a'.repeat(4096)}\n`],
  ])('rejects %s in linked-worktree metadata', (_label, contents) => {
    const bridgeRoot = temporaryRoot('e2s-bridge-malformed-marker-');
    writeFileSync(join(bridgeRoot, '.git'), contents);

    expect(() => resolveBridgeRepositoryRootsFromCheckoutLayout(bridgeRoot))
      .toThrow('bridge checkout layout is unavailable');
  });

  function temporaryRoot(prefix: string): string {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
    roots.push(root);
    return root;
  }
});
