import { describe, expect, it } from 'vitest';

import {
  inspectV4GitCheckoutAfterTarget,
  parseV4GitSnapshot,
  type V4GitSnapshotBytes,
  type V4PostTargetGitObservation,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js';

const head = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1';
const tree = '9f8d571534b21eec660ff21177adf725e50ddf02';
const buildBase = '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d';
const modified = ['src/a.scala', 'src/b.scala', 'src/c.scala', 'src/d.scala', 'src/e.scala'];
const added = ['src/f.scala', 'src/g.scala', 'src/h.scala'];
const declared = [
  ...modified.map((path, index) => ({ path, status: 'modified' as const,
    baseBlob: String(index + 1).repeat(40), patchedBlob: 'a'.repeat(40) })),
  ...added.map(path => ({ path, status: 'added' as const, patchedBlob: 'b'.repeat(40) })),
  { path: 'build.sbt', status: 'modified' as const, baseBlob: buildBase,
    patchedBlob: '7e35f6295070996d5ae0f6fc22f10737e26ee4cd' },
];

function z(records: readonly string[]): Buffer {
  return Buffer.from(records.length === 0 ? '' : records.join('\0') + '\0', 'utf8');
}

function snapshot(): V4GitSnapshotBytes {
  const entries = [
    '100644 blob ' + buildBase + '\tbuild.sbt',
    ...modified.map((path, index) => '100644 blob ' + String(index + 1).repeat(40) + '\t' + path),
  ];
  const index = [
    '100644 ' + buildBase + ' 0\tbuild.sbt',
    ...modified.map((path, i) => '100644 ' + String(i + 1).repeat(40) + ' 0\t' + path),
  ];
  const changed = ['build.sbt', ...modified].map(path => ' M ' + path)
    .concat(added.map(path => '?? ' + path));
  return {
    head: Buffer.from(head + '\n'), tree: Buffer.from(tree + '\n'),
    fullTree: z(entries), buildSbtTreeEntry: z([entries[0]]), index: z(index),
    indexFlags: z(['build.sbt', ...modified].map(path => 'H ' + path)),
    status: z(changed),
  };
}

describe('V4 post-target Git projection', () => {
  it('exports the post-target observation contract and accepts only the nine declared Git changes', () => {
    const projection: Pick<V4PostTargetGitObservation, 'head' | 'tree' | 'indexSha256Hex'
      | 'status' | 'sourceIdentityDigestHex'> = {
      head, tree, indexSha256Hex: '0'.repeat(64), status: '', sourceIdentityDigestHex: '0'.repeat(64),
    };
    expect(typeof inspectV4GitCheckoutAfterTarget).toBe('function');
    expect(projection.head).toBe(head);
    expect(parseV4GitSnapshot(snapshot(), declared).status.split('\n')).toHaveLength(9);
  });

  it('rejects generated target if Git exposes it as a tenth change or staged entry', () => {
    const base = snapshot();
    expect(() => parseV4GitSnapshot({ ...base,
      status: Buffer.concat([base.status, z(['?? target/generated.jar'])]),
    }, declared)).toThrow(/working status differs/u);
    expect(() => parseV4GitSnapshot({ ...base,
      index: Buffer.concat([base.index, z(['100644 ' + '9'.repeat(40) + ' 0\ttarget/generated.jar'])]),
    }, declared)).toThrow(/index differs/u);
  });
});
