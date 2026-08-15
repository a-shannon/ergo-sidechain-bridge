import { describe, expect, it } from 'vitest';

import {
  buildSpvTrackerEntryFromAnchor,
  findSidechainAnchorFields,
  normalizeSidechainAnchorField,
} from './spv-anchor.js';

describe('SPV anchor helpers', () => {
  it('normalizes a 0x0401 extension field into an SPV tracker entry', () => {
    const anchor = normalizeSidechainAnchorField({
      key: '0401',
      value: 'aa'.repeat(32),
      height: 330000,
      headerId: 'bb'.repeat(32),
    });

    const entry = buildSpvTrackerEntryFromAnchor(anchor, {
      sidechainIdHex: '11'.repeat(32),
      sidechainHeight: 1234n,
      sidechainHeaderHashHex: '22'.repeat(32),
    });

    expect(anchor.bridgeEventRootHex).toBe('aa'.repeat(32));
    expect(entry.bridgeEventRootHex).toBe('aa'.repeat(32));
    expect(entry.ergoAnchorHeight).toBe(330000);
  });

  it('rejects fields outside the sidechain keyspace or wrong value size', () => {
    expect(() => normalizeSidechainAnchorField({
      key: '0301',
      value: 'aa'.repeat(32),
      height: 1,
      headerId: 'bb'.repeat(32),
    })).toThrow(/0x04xx/);

    expect(() => normalizeSidechainAnchorField({
      key: '0401',
      value: 'aa'.repeat(31),
      height: 1,
      headerId: 'bb'.repeat(32),
    })).toThrow(/32 bytes/);
  });

  it('rejects non-concrete anchor heights and header IDs', () => {
    expect(() => normalizeSidechainAnchorField({
      key: '0401',
      value: 'aa'.repeat(32),
      height: -1,
      headerId: 'bb'.repeat(32),
    })).toThrow(/anchor height must be a non-negative integer/);

    expect(() => normalizeSidechainAnchorField({
      key: '0401',
      value: 'aa'.repeat(32),
      height: 1.5,
      headerId: 'bb'.repeat(32),
    })).toThrow(/anchor height must be a non-negative integer/);

    expect(() => normalizeSidechainAnchorField({
      key: '0401',
      value: 'aa'.repeat(32),
      height: 1,
      headerId: 'bb'.repeat(31),
    })).toThrow(/header ID must be 32 bytes/);
  });

  it('filters only the configured sidechain anchor key', () => {
    const fields = findSidechainAnchorFields([
      { key: '0401', value: 'aa'.repeat(32), height: 1, headerId: '11'.repeat(32) },
      { key: '0402', value: 'bb'.repeat(32), height: 1, headerId: '22'.repeat(32) },
    ]);

    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('0401');
  });

  it('finds 0x-prefixed configured anchor keys with the default expected key', () => {
    const fields = findSidechainAnchorFields([
      { key: '0x0401', value: 'aa'.repeat(32), height: 1, headerId: '11'.repeat(32) },
      { key: '0x0402', value: 'bb'.repeat(32), height: 1, headerId: '22'.repeat(32) },
    ]);

    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('0401');
    expect(fields[0].bridgeEventRootHex).toBe('aa'.repeat(32));
  });
});
