import type { V4NodeBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

export interface V4AssemblyDirectoryEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'symlink' | 'other';
  readonly bytes: number;
  readonly nlink: number;
}

export function selectV4AssemblyCandidate(
  entries: readonly Readonly<V4AssemblyDirectoryEntry>[],
  lock: Readonly<Pick<V4NodeBuildLock, 'assemblyNamePattern' | 'minimumAssemblyBytes'>>,
): Readonly<V4AssemblyDirectoryEntry> {
  if (lock.assemblyNamePattern !== '^ergo-.*\\.jar$'
      || lock.minimumAssemblyBytes !== 33554432) {
    throw new Error('V4 assembly selection lock differs');
  }
  const matching = entries.filter(entry => /^ergo-.*\.jar$/u.test(entry.name));
  if (matching.length !== 1) {
    throw new Error('V4 build must produce exactly one matching assembly name');
  }
  const selected = matching[0]!;
  if (selected.name.includes('/') || selected.name.includes('\\')
      || selected.name === '.' || selected.name === '..'
      || selected.kind !== 'file'
      || selected.nlink !== 1
      || !Number.isSafeInteger(selected.bytes)
      || selected.bytes < lock.minimumAssemblyBytes) {
    throw new Error('V4 matching assembly is not a direct single-link regular file of sufficient size');
  }
  return Object.freeze({ ...selected });
}
