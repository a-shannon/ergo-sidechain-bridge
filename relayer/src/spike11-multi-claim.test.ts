/**
 * Spike 11: Unit tests for multi-claim batch extension building.
 * These tests are pure/offline — no node or WASM required.
 */
import { describe, it, expect } from 'vitest';
import {
  packClaimCore,
  buildBatchDupExtension,
  buildBatchUnlockExtension,
} from './aggregate-settlement-builder.js';

// Minimal sigma encoders matching the spike scripts
function sigmaCollByte(data: Buffer): string {
  const vlq = (n: number) => {
    const out: number[] = [];
    while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
    out.push(n & 0x7f);
    return Buffer.from(out);
  };
  return '0e' + vlq(data.length).toString('hex') + data.toString('hex');
}
function sigmaInt(value: number): string {
  const zigzag = value >= 0 ? value << 1 : (value << 1) ^ (value >> 31);
  const vlq = (n: number) => {
    const out: number[] = [];
    while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
    out.push(n & 0x7f);
    return Buffer.from(out);
  };
  return '04' + vlq(zigzag).toString('hex');
}

describe('packClaimCore', () => {
  it('produces a 109-byte buffer with correct field layout', () => {
    const trackerKey = 'aa'.repeat(32);
    const burnTxId = 'bb'.repeat(32);
    const amount = 1_000_000n;
    const recipientTree = 'cc'.repeat(36);
    const selector = 0 as const;

    const core = packClaimCore(trackerKey, burnTxId, amount, recipientTree, selector);

    expect(core.length).toBe(109);
    expect(core.subarray(0, 32).toString('hex')).toBe(trackerKey);
    expect(core.subarray(32, 64).toString('hex')).toBe(burnTxId);
    expect(core.readBigUInt64BE(64)).toBe(amount);
    expect(core.subarray(72, 108).toString('hex')).toBe(recipientTree);
    expect(core[108]).toBe(0);
  });

  it('sets selector byte to 1 when trackerTreeSelector is 1', () => {
    const core = packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 1n, 'cc'.repeat(36), 1);
    expect(core[108]).toBe(1);
  });

  it('rejects a tracker key with the wrong size', () => {
    expect(() => packClaimCore('aa'.repeat(31), 'bb'.repeat(32), 1n, 'cc'.repeat(36), 0))
      .toThrow('trackerKeyHex must be 32 bytes');
  });

  it('rejects a burn TX ID with the wrong size', () => {
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(33), 1n, 'cc'.repeat(36), 0))
      .toThrow('burnTxIdHex must be 32 bytes');
  });

  it('rejects a recipient tree with the wrong size', () => {
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 1n, 'cc'.repeat(35), 0))
      .toThrow('recipientTreeHex must be 36 bytes');
  });

  it('rejects amounts outside the positive signed Long range', () => {
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(32), -1n, 'cc'.repeat(36), 0))
      .toThrow('amountNanoErg must fit a positive signed Long');
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 0n, 'cc'.repeat(36), 0))
      .toThrow('amountNanoErg must fit a positive signed Long');
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 0x8000_0000_0000_0000n, 'cc'.repeat(36), 0))
      .toThrow('amountNanoErg must fit a positive signed Long');
  });

  it('rejects invalid tracker tree selectors', () => {
    expect(() => packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 1n, 'cc'.repeat(36), 2 as any))
      .toThrow('trackerTreeSelector must be 0 or 1');
  });
});

describe('buildBatchDupExtension', () => {
  const key1 = 'aa'.repeat(32);
  const key2 = 'bb'.repeat(32);
  const lp1 = 'dd'.repeat(10);
  const lp2 = 'ee'.repeat(10);
  const insertProof = 'ff'.repeat(20);

  it('produces correct Var layout for 2 claims', () => {
    const ext = buildBatchDupExtension([key1, key2], [lp1, lp2], insertProof, sigmaCollByte, sigmaInt);
    expect(ext['0']).toBe(sigmaInt(2));
    expect(ext['1']).toBe(sigmaCollByte(Buffer.from(insertProof, 'hex')));
    expect(ext['2']).toBe(sigmaCollByte(Buffer.from(key1, 'hex')));
    expect(ext['3']).toBe(sigmaCollByte(Buffer.from(key2, 'hex')));
    expect(ext['22']).toBe(sigmaCollByte(Buffer.from(lp1, 'hex')));
    expect(ext['23']).toBe(sigmaCollByte(Buffer.from(lp2, 'hex')));
    // No slots beyond active
    expect(ext['4']).toBeUndefined();
    expect(ext['24']).toBeUndefined();
  });

  it('rejects duplicate burn IDs', () => {
    expect(() => buildBatchDupExtension([key1, key1], [lp1, lp2], insertProof, sigmaCollByte, sigmaInt))
      .toThrow('Duplicate burn TX ID');
  });

  it('rejects count > 20', () => {
    const keys = Array.from({ length: 21 }, (_, i) => i.toString(16).padStart(64, '0'));
    const proofs = keys.map(() => 'dd'.repeat(10));
    expect(() => buildBatchDupExtension(keys, proofs, insertProof, sigmaCollByte, sigmaInt))
      .toThrow('out of range');
  });

  it('rejects mismatched proof count', () => {
    expect(() => buildBatchDupExtension([key1, key2], [lp1], insertProof, sigmaCollByte, sigmaInt))
      .toThrow('mismatch');
  });
});

describe('buildBatchUnlockExtension', () => {
  it('produces correct Var layout for 2 claims', () => {
    const core1 = packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 1_000_000n, 'cc'.repeat(36), 0);
    const core2 = packClaimCore('bb'.repeat(32), 'cc'.repeat(32), 2_000_000n, 'dd'.repeat(36), 1);
    const tp1 = 'cc'.repeat(10);
    const tp2 = 'dd'.repeat(10);
    const dlp1 = 'ee'.repeat(10);
    const dlp2 = 'ff'.repeat(10);
    const insertProof = '11'.repeat(20);

    const ext = buildBatchUnlockExtension(
      [core1, core2], [tp1, tp2], [dlp1, dlp2], insertProof, sigmaCollByte, sigmaInt,
    );

    expect(ext['0']).toBe(sigmaInt(2));
    expect(ext['1']).toBe(sigmaCollByte(Buffer.from(insertProof, 'hex')));
    expect(ext['2']).toBe(sigmaCollByte(core1));
    expect(ext['3']).toBe(sigmaCollByte(core2));
    expect(ext['12']).toBe(sigmaCollByte(Buffer.from(tp1, 'hex')));
    expect(ext['13']).toBe(sigmaCollByte(Buffer.from(tp2, 'hex')));
    expect(ext['22']).toBe(sigmaCollByte(Buffer.from(dlp1, 'hex')));
    expect(ext['23']).toBe(sigmaCollByte(Buffer.from(dlp2, 'hex')));
  });

  it('rejects malformed, zero, overflow, and invalid-selector claim cores', () => {
    const valid = packClaimCore('aa'.repeat(32), 'bb'.repeat(32), 1n, 'cc'.repeat(36), 0);
    const zero = Buffer.from(valid);
    zero.writeBigUInt64BE(0n, 64);
    const overflow = Buffer.from(valid);
    overflow.writeBigUInt64BE(0x8000_0000_0000_0000n, 64);
    const invalidSelector = Buffer.from(valid);
    invalidSelector[108] = 2;
    const invoke = (claimCore: Buffer) => buildBatchUnlockExtension(
      [claimCore], ['cc'.repeat(10)], ['dd'.repeat(10)], '11'.repeat(20), sigmaCollByte, sigmaInt,
    );

    expect(() => invoke(valid.subarray(0, 108))).toThrow('must be exactly 109 bytes');
    expect(() => invoke(zero)).toThrow('amount must fit a positive signed Long');
    expect(() => invoke(overflow)).toThrow('amount must fit a positive signed Long');
    expect(() => invoke(invalidSelector)).toThrow('tracker selector must be 0 or 1');
  });

  it('rejects count > 10', () => {
    const cores = Array.from({ length: 11 }, () => Buffer.alloc(109));
    const proofs = cores.map(() => 'aa'.repeat(10));
    expect(() => buildBatchUnlockExtension(cores, proofs, proofs, 'bb'.repeat(20), sigmaCollByte, sigmaInt))
      .toThrow('out of range');
  });
});
