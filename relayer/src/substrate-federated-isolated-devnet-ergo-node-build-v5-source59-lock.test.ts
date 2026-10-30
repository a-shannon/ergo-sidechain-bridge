import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectV4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';
import {
  assertV5Source59LockBytePins,
  assertV5Source59LockStructureNonAuthorizing,
  inspectV5Source59NodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v5-source59-lock.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const baseline = readFileSync(resolve(bridgeRoot, 'sources',
  'substrate-federated-isolated-devnet-node-build-lock-v4.json'));
const selected = readFileSync(resolve(bridgeRoot, 'sources',
  'substrate-federated-isolated-devnet-node-build-lock-v5-source59.json'));

describe('explicit SOURCE59 build lock', () => {
  it('selects only the versioned 20,585-byte overlay and preserves V4', () => {
    const old = inspectV4NodeBuildLock(bridgeRoot);
    const next = inspectV5Source59NodeBuildLock(bridgeRoot);
    expect(old.lock.buildSbtOverlayBytes).toBe(13660);
    expect(next.lock.buildSbtOverlayBytes).toBe(20585);
    expect(next.lock.buildSbtOverlaySha256)
      .toBe('a0e138c7f4379b1c42e004d4e776a81e24f4b7757d09ceeb7488bc3951a4db03');
    expect(next.lock.buildSbtOverlayBlob)
      .toBe('23f9dbe303639b4e42cb85b9c4ef220b0a8aff78');
    expect(Object.isFrozen(next.lock)).toBe(true);
    expect(Object.isFrozen(next.lock.javaSystemProperties)).toBe(true);
    expect(Object.keys(next.lock).sort()).toEqual(Object.keys(old.lock).sort());
  });

  it('keeps the exact byte pins separate from structural validation', () => {
    expect(() => assertV5Source59LockBytePins(selected, baseline)).not.toThrow();
    expect(() => assertV5Source59LockBytePins(baseline, baseline)).toThrow();
    expect(() => assertV5Source59LockBytePins(selected.subarray(0, -1), baseline))
      .toThrow();
    expect(() => assertV5Source59LockBytePins(selected,
      Buffer.from(baseline.toString('utf8').replace(
        '"buildSbtOverlayBytes": 13660', '"buildSbtOverlayBytes": 20585')))).toThrow();
  });

  it('rejects partial overlay updates and unrelated fields at the structural seam', () => {
    const replace = (from: string, to: string): Buffer => {
      const text = selected.toString('utf8');
      expect(text.split(from)).toHaveLength(2);
      return Buffer.from(text.replace(from, to), 'utf8');
    };
    expect(() => assertV5Source59LockStructureNonAuthorizing(
      replace('"buildSbtOverlayBytes": 20585', '"buildSbtOverlayBytes": 13660'),
      baseline)).toThrow();
    expect(() => assertV5Source59LockStructureNonAuthorizing(
      replace('23f9dbe303639b4e42cb85b9c4ef220b0a8aff78',
        '7e35f6295070996d5ae0f6fc22f10737e26ee4cd'), baseline)).toThrow();
    expect(() => assertV5Source59LockStructureNonAuthorizing(
      replace('ownedBootJarCount": 87', 'ownedBootJarCount": 88'),
      baseline)).toThrow();
  });

  it('rejects duplicate keys, truncation and changed baseline authority at the seam', () => {
    const text = selected.toString('utf8');
    const duplicate = Buffer.from(text.replace(
      '  "schemaVersion": 5,',
      '  "schemaVersion": 5,\n  "schemaVersion": 5,'), 'utf8');
    expect(() => assertV5Source59LockStructureNonAuthorizing(duplicate, baseline))
      .toThrow(/duplicate/u);
    expect(() => assertV5Source59LockStructureNonAuthorizing(
      selected.subarray(0, -1), baseline))
      .toThrow();
    expect(() => assertV5Source59LockStructureNonAuthorizing(selected,
      Buffer.from(baseline.toString('utf8').replace(
        '"buildSbtOverlayBytes": 13660', '"buildSbtOverlayBytes": 20585')))).toThrow();
  });
});
