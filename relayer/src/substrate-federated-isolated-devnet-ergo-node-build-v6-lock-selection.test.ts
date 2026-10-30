import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { legacyInspect } = vi.hoisted(() => ({
  legacyInspect: vi.fn((root: string, selection: string) => Object.freeze({
    lock: Object.freeze({ root, schemaVersion: selection === 'v4' ? 4 : 5 }),
    sha256Hex: selection === 'v4' ? '4'.repeat(64) : '5'.repeat(64),
  })),
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v5-source59-lock.js',
  () => ({ inspectSelectedV4OrV5BuildLock: legacyInspect }));

import {
  inspectSelectedV6OrLegacyBuildLock,
  type V6OrLegacyBuildLockSelection,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js';
import {
  V6_NODE_BUILD_LOCK_CANONICAL_TEXT,
  V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');

describe('explicit V6 or unchanged legacy node build lock selection', () => {
  let fixtureRoot: string | undefined;
  beforeEach(() => { legacyInspect.mockClear(); });
  afterEach(() => {
    if (!fixtureRoot) return;
    const parent = resolve(realpathSync.native(tmpdir()));
    if (dirname(fixtureRoot).toLowerCase() !== parent.toLowerCase()
        || !basename(fixtureRoot).startsWith('v6-lock-selector-')
        || !fixtureRoot.toLowerCase().startsWith(parent.toLowerCase() + sep)) {
      throw new Error('unsafe V6 lock selector fixture cleanup path');
    }
    rmSync(fixtureRoot, { recursive: true });
    fixtureRoot = undefined;
  });

  it('delegates the V4 default and explicit V5 unchanged', () => {
    const defaultResult = inspectSelectedV6OrLegacyBuildLock(bridgeRoot);
    const v5Result = inspectSelectedV6OrLegacyBuildLock(bridgeRoot, 'v5-source59');
    expect(defaultResult).toMatchObject({ sha256Hex: '4'.repeat(64) });
    expect(v5Result).toMatchObject({ sha256Hex: '5'.repeat(64) });
    expect(legacyInspect.mock.calls).toEqual([
      [bridgeRoot, 'v4'], [bridgeRoot, 'v5-source59'],
    ]);
  });

  it('reads the actual fixed V6 lock and never calls the legacy inspector', () => {
    const selected = inspectSelectedV6OrLegacyBuildLock(bridgeRoot, 'v6-current');
    expect(selected.sha256Hex).toBe(V6_NODE_BUILD_LOCK_SHA256_HEX);
    expect(selected.lock).toMatchObject({
      schemaVersion: 6,
      kind: 'substrate-federated-isolated-devnet-node-build-lock-v6-current',
      consensusSourceLockSha256:
        '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
      sourceOnly: true, campaignAdmitted: false,
    });
    expect(legacyInspect).not.toHaveBeenCalled();
  });

  it('refuses unknown and relative V6 selections without legacy fallback', () => {
    expect(() => inspectSelectedV6OrLegacyBuildLock(
      bridgeRoot, 'V6-current' as V6OrLegacyBuildLockSelection))
      .toThrow(/unknown explicit lock selection/u);
    expect(() => inspectSelectedV6OrLegacyBuildLock('.', 'v6-current'))
      .toThrow(/bridge root must be absolute/u);
    expect(legacyInspect).not.toHaveBeenCalled();
  });

  it('refuses a substituted V6 lock with no V4 or V5 fallback', () => {
    fixtureRoot = realpathSync.native(mkdtempSync(join(tmpdir(), 'v6-lock-selector-')));
    const sourceDir = join(fixtureRoot, 'sources');
    mkdirSync(sourceDir);
    const selectedPath = resolve(fixtureRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH);
    writeFileSync(selectedPath, V6_NODE_BUILD_LOCK_CANONICAL_TEXT.replace(
      '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
      '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6'),
    { flag: 'wx' });
    expect(() => inspectSelectedV6OrLegacyBuildLock(fixtureRoot!, 'v6-current'))
      .toThrow(/selected lock bytes differ/u);
    expect(legacyInspect).not.toHaveBeenCalled();
  });
});
