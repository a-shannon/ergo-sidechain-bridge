import { describe, expect, it } from 'vitest';

import {
  selectV4AssemblyCandidate,
  type V4AssemblyDirectoryEntry,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-assembly.js';

const lock = {
  assemblyNamePattern: '^ergo-.*\\.jar$',
  minimumAssemblyBytes: 33554432,
} as const;

function candidate(changes: Partial<V4AssemblyDirectoryEntry> = {}): V4AssemblyDirectoryEntry {
  return {
    name: 'ergo-assembly.jar',
    kind: 'file',
    bytes: 33554432,
    nlink: 1,
    ...changes,
  };
}

describe('isolated devnet Ergo node V4 assembly selection', () => {
  it('accepts one matching direct file at the minimum size', () => {
    expect(selectV4AssemblyCandidate([
      candidate(),
      candidate({ name: 'unrelated.jar', bytes: 1 }),
    ], lock)).toEqual(candidate());
  });

  it('counts every matching name before applying the size minimum', () => {
    expect(() => selectV4AssemblyCandidate([
      candidate(),
      candidate({ name: 'ergo-stale.jar', bytes: 1 }),
    ], lock)).toThrow(/exactly one matching assembly name/u);
  });

  it('rejects absent or duplicate matching names', () => {
    for (const entries of [
      [] as V4AssemblyDirectoryEntry[],
      [candidate(), candidate({ name: 'ergo-second.jar' })],
    ]) {
      expect(() => selectV4AssemblyCandidate(entries, lock))
        .toThrow(/exactly one matching assembly name/u);
    }
  });

  it('rejects an undersized, linked, or non-regular sole candidate', () => {
    for (const changes of [
      { bytes: 33554431 },
      { nlink: 2 },
      { kind: 'symlink' as const },
      { kind: 'directory' as const },
    ]) {
      expect(() => selectV4AssemblyCandidate([candidate(changes)], lock))
        .toThrow(/direct single-link regular file/u);
    }
  });

  it('rejects a changed selection lock', () => {
    const changed = {
      ...lock,
      minimumAssemblyBytes: 1,
    } as unknown as typeof lock;
    expect(() => selectV4AssemblyCandidate([candidate()], changed))
      .toThrow(/selection lock differs/u);
  });
});
