import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canonicalJson } from './strict-json.js';
import {
  assertV6SelectedLockStructureNonAuthorizing,
  inspectSelectedV6NodeBuildLock,
  V6_NODE_BUILD_LOCK_CANONICAL_TEXT,
  V6_NODE_BUILD_LOCK_FILE_NAME,
  V6_NODE_BUILD_LOCK_SHA256_HEX,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): Uint8Array =>
  Buffer.from(canonicalJson(value) + '\n', 'utf8');
const parsedLock = (): Record<string, unknown> =>
  JSON.parse(V6_NODE_BUILD_LOCK_CANONICAL_TEXT) as Record<string, unknown>;

describe('V6 current node build lock is a source-only selected input', () => {
  let root: string;
  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'v6-lock-test-')));
  });
  afterEach(() => {
    const parent = resolve(realpathSync.native(tmpdir()));
    if (dirname(root).toLowerCase() !== parent.toLowerCase()
        || !basename(root).startsWith('v6-lock-test-')
        || !root.toLowerCase().startsWith(parent.toLowerCase() + sep)) {
      throw new Error('unsafe V6 lock fixture cleanup path');
    }
    rmSync(root, { recursive: true });
  });

  const selected = (root: string): string => join(root, V6_NODE_BUILD_LOCK_FILE_NAME);

  it('accepts only the fixed canonical file without build or campaign authority', () => {
    const path = selected(root);
    writeFileSync(path, V6_NODE_BUILD_LOCK_CANONICAL_TEXT, { flag: 'wx' });
    expect(V6_NODE_BUILD_LOCK_CANONICAL_TEXT.length).toBeLessThanOrEqual(4_096);
    expect(sha(V6_NODE_BUILD_LOCK_CANONICAL_TEXT)).toBe(V6_NODE_BUILD_LOCK_SHA256_HEX);
    const result = inspectSelectedV6NodeBuildLock({
      path, expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    });
    expect(result).toMatchObject({
      path: resolve(path), sha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
      sourceOnly: true, campaignAdmitted: false,
      lock: {
        schemaVersion: 6,
        consensusSourceLockSha256:
          '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
        ownedMavenMirrorReceiptSha256:
          '27ff67d2da5b0dd35a7a4f401f9d8bd1d386ff15d8fc80ba4c2decbbc5527f31',
        ownedMavenMirrorMetadataSha256:
          '863f729f28617af3ffc3254ae4784635145dfd00b0c8f9d2cecf60ae8ec1da7c',
        v6LeveldbTerminalSha256:
          '218d544350e9d0aa3372cc871cd5ea1811832a3879f484e11b09c2a2403370f2',
        approvedOutputCaps: {
          maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912,
        },
        sourceOnly: true, resolverExecuted: false, buildExecuted: false,
        campaignAdmitted: false, externalAcceptanceEstablished: false,
      },
    });
  });

  it('refuses the stale consensus pair even when candidate bytes are internally hashed', () => {
    const candidate = parsedLock();
    candidate.consensusSourceLockSha256 =
      '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6';
    expect(() => assertV6SelectedLockStructureNonAuthorizing(canonical(candidate)))
      .toThrow(/selected pins differ/u);
    const path = selected(root);
    const text = Buffer.from(canonical(candidate)).toString('utf8');
    writeFileSync(path, text, { flag: 'wx' });
    expect(() => inspectSelectedV6NodeBuildLock({ path, expectedSha256Hex: sha(text) }))
      .toThrow(/caller digest differs/u);
  });

  it('refuses foreign Maven and LevelDB terminal lineage independently', () => {
    for (const key of ['v6MavenTerminalSha256', 'v6LeveldbTerminalSha256']) {
      const candidate = parsedLock();
      candidate[key] = 'f'.repeat(64);
      expect(() => assertV6SelectedLockStructureNonAuthorizing(canonical(candidate)))
        .toThrow(/selected pins differ/u);
    }
  });

  it('refuses each increased output or Job budget', () => {
    for (const update of [
      (value: Record<string, unknown>) => {
        (value.approvedOutputCaps as Record<string, unknown>).maxFiles = 50_001;
      },
      (value: Record<string, unknown>) => {
        (value.approvedOutputCaps as Record<string, unknown>).maxDirectories = 4_097;
      },
      (value: Record<string, unknown>) => {
        (value.approvedOutputCaps as Record<string, unknown>).maxBytes = 536_870_913;
      },
      (value: Record<string, unknown>) => { value.buildTimeoutMs = 900_001; },
      (value: Record<string, unknown>) => {
        (value.resolverJob as Record<string, unknown>).timeoutMs = 300_001;
      },
      (value: Record<string, unknown>) => {
        (value.updateJob as Record<string, unknown>).timeoutMs = 120_001;
      },
    ]) {
      const candidate = parsedLock();
      update(candidate);
      expect(() => assertV6SelectedLockStructureNonAuthorizing(canonical(candidate)))
        .toThrow(/selected pins differ/u);
    }
  });

  it('refuses an extra field, duplicate key, BOM, CRLF and invalid UTF-8', () => {
    expect(() => assertV6SelectedLockStructureNonAuthorizing(canonical({
      ...parsedLock(), surplus: true,
    }))).toThrow(/selected pins differ/u);
    expect(() => assertV6SelectedLockStructureNonAuthorizing(
      Buffer.from('{"schemaVersion":6,"schemaVersion":6}\n')))
      .toThrow(/duplicate keys/u);
    expect(() => assertV6SelectedLockStructureNonAuthorizing(Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(V6_NODE_BUILD_LOCK_CANONICAL_TEXT),
    ]))).toThrow(/encoding differs/u);
    expect(() => assertV6SelectedLockStructureNonAuthorizing(Buffer.from(
      V6_NODE_BUILD_LOCK_CANONICAL_TEXT.replace(/\n/gu, '\r\n'))))
      .toThrow(/encoding differs/u);
    expect(() => assertV6SelectedLockStructureNonAuthorizing(
      Buffer.from([0xc3, 0x28, 0x0a]))).toThrow();
  });

  it('refuses a hard-linked file and an occupied directory path', () => {
    const original = join(root, 'source.json');
    writeFileSync(original, V6_NODE_BUILD_LOCK_CANONICAL_TEXT, { flag: 'wx' });
    const linked = selected(root);
    linkSync(original, linked);
    expect(() => inspectSelectedV6NodeBuildLock({
      path: linked, expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    })).toThrow(/direct single-link/u);
    const occupied = join(root, 'occupied');
    mkdirSync(occupied);
    const directory = selected(occupied);
    mkdirSync(directory);
    expect(() => inspectSelectedV6NodeBuildLock({
      path: directory, expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    })).toThrow(/direct single-link/u);
  });
});
