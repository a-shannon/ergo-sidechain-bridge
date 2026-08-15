import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  assertWp06CanonicalJvmFixtureHeaderBinding,
  assertWp06CanonicalJvmHeaderVectorProvenance,
  assertWp06CanonicalJvmHeaderVectorStructure,
  assertWp06CanonicalJvmHeaderWindowProvenance,
  getWp06CanonicalJvmHeaderWindow,
  loadWp06CanonicalJvmHeaderVector,
  WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX,
  WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX,
} from './wp06-canonical-jvm-header-chain.js';

function rawVector(): any {
  return JSON.parse(readFileSync(
    join(process.cwd(), 'test-vectors', 'wp06-canonical-jvm-header-chain-v1.json'),
    'utf8',
  ));
}

describe('WP-06 canonical JVM synthetic header vector', () => {
  it('loads one pinned, deeply frozen capability with an object-identical shared anchor', () => {
    const vector = loadWp06CanonicalJvmHeaderVector();
    const tracker = getWp06CanonicalJvmHeaderWindow(vector, 'trackerAdmission');
    const settlement = getWp06CanonicalJvmHeaderWindow(vector, 'settlement');

    expect(vector.fileSha256Hex).toBe(WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX);
    expect(vector.anchorExtensionRootHex).toBe(WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX);
    expect(vector.headersOldestToNewest.map(header => header.height)).toEqual(
      Array.from({ length: 15 }, (_, index) => 99_990 + index),
    );
    expect(tracker.headers.map(header => header.height)).toEqual(
      Array.from({ length: 10 }, (_, index) => 99_999 - index),
    );
    expect(settlement.headers.map(header => header.height)).toEqual(
      Array.from({ length: 10 }, (_, index) => 100_004 - index),
    );
    expect(tracker.anchorContextIndex).toBe(4);
    expect(settlement.anchorContextIndex).toBe(9);
    expect(tracker.anchorHeader).toBe(settlement.anchorHeader);
    expect(tracker.anchorHeader.id).toBe(vector.anchorIdHex);
    expect(tracker.anchorHeader.extensionRootHex)
      .toBe(WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX);
    expect(Object.isFrozen(vector.headersOldestToNewest[0].raw)).toBe(true);
    expect(vector.boundaries).toEqual({
      deterministicSyntheticHeaders: true,
      minedHeaderEvidence: false,
      nodeStatefulAcceptance: false,
      broadcastPerformed: false,
    });
  });

  it('rejects rehydrated vector and window copies as capabilities', () => {
    const vector = loadWp06CanonicalJvmHeaderVector();
    const window = getWp06CanonicalJvmHeaderWindow(vector, 'trackerAdmission');

    expect(() => assertWp06CanonicalJvmHeaderVectorProvenance(
      structuredClone(vector),
    )).toThrow(/vector provenance is missing/i);
    expect(() => assertWp06CanonicalJvmHeaderWindowProvenance(
      structuredClone(window),
    )).toThrow(/window provenance is missing/i);
  });

  it('binds the exact rebuilt JVM fixture JSON and expected IDs to each window', () => {
    const vector = loadWp06CanonicalJvmHeaderVector();
    const window = getWp06CanonicalJvmHeaderWindow(vector, 'trackerAdmission');
    const fixture = {
      headers: window.headers.map(header => ({
        expectedIdHex: header.id,
        headerJson: header.jvmHeaderJson,
      })),
    };
    expect(() => assertWp06CanonicalJvmFixtureHeaderBinding(window, fixture)).not.toThrow();

    const wrongId = structuredClone(fixture);
    wrongId.headers[0].expectedIdHex = 'ef'.repeat(32);
    expect(() => assertWp06CanonicalJvmFixtureHeaderBinding(window, wrongId))
      .toThrow(/expected ID mismatch/i);

    const wrongJson = structuredClone(fixture);
    wrongJson.headers[0].headerJson = '{}';
    expect(() => assertWp06CanonicalJvmFixtureHeaderBinding(window, wrongJson))
      .toThrow(/header 0 JSON mismatch/i);
  });

  it('isolates vector identity, parent, anchor-root, JVM-json, window, and boundary drift', () => {
    const cases: Array<[string, (value: any) => void, RegExp]> = [
      ['schema', value => { value.schemaVersion = 2; }, /schema version mismatch/i],
      ['decoder', value => { value.generator.decoder = 'other'; }, /decoder mismatch/i],
      ['parent', value => { value.chain.headers[8].parentIdHex = 'ef'.repeat(32); }, /parent link mismatch/i],
      ['header ID', value => { value.chain.headers[8].idHex = 'ed'.repeat(32); }, /parent link mismatch/i],
      [
        'anchor root',
        value => { value.chain.headers[5].extensionRootHex = 'ec'.repeat(32); },
        /anchor extension root mismatch/i,
      ],
      [
        'JVM JSON digest',
        value => { value.chain.headers[2].jvmHeaderJsonSha256Hex = 'eb'.repeat(32); },
        /JVM JSON digest mismatch/i,
      ],
      [
        'window ID',
        value => { value.windows.trackerAdmission.headerIdsHexTipToOldest[0] = 'ea'.repeat(32); },
        /tracker admission header 0 ID mismatch/i,
      ],
      [
        'same-height alternate anchor',
        value => { value.windows.settlement.headerIdsHexTipToOldest[9] = 'e9'.repeat(32); },
        /settlement header 9 ID mismatch/i,
      ],
      [
        'mined claim',
        value => { value.boundaries.minedHeaderEvidence = true; },
        /mined-header boundary mismatch/i,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const value = rawVector();
      mutate(value);
      expect(() => assertWp06CanonicalJvmHeaderVectorStructure(value), label).toThrow(pattern);
    }
  });
});
