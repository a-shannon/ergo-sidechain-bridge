import {
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readBoundedStableArtifact } from './bounded-artifact-read.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('bounded artifact read', () => {
  it('reads exact regular-file bytes through one retained descriptor', () => {
    const path = artifactPath();
    writeFileSync(path, Buffer.from('reviewed-artifact', 'utf8'));
    expect(readBoundedStableArtifact({
      path,
      maxBytes: 1024,
      label: 'reviewed artifact',
    })).toEqual(Buffer.from('reviewed-artifact', 'utf8'));
  });

  it('rejects an oversized sparse file before allocating its contents', () => {
    const path = artifactPath();
    writeFileSync(path, Buffer.from([0]));
    truncateSync(path, 1025);
    expect(() => readBoundedStableArtifact({
      path,
      maxBytes: 1024,
      label: 'reviewed artifact',
    })).toThrow(/exceeds 1024 bytes/i);
  });
});

function artifactPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'bridge-bounded-artifact-'));
  roots.push(root);
  return join(root, 'artifact.bin');
}
