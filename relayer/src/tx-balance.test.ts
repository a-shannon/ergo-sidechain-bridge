import { describe, expect, it } from 'vitest';

import {
  planChangeOrFee,
  planChangeOrFeeBigInt,
  safeNanoErgNumber,
} from './ergo-settlement-core/tx-balance.js';

describe('planChangeOrFee', () => {
  it('returns full change when it can form a valid box', () => {
    expect(planChangeOrFee(1_500_000, 1_100_000, 1_000_000)).toEqual({
      changeOutputValue: 1_500_000,
      minerFeeValue: 1_100_000,
      absorbedDust: 0,
    });
  });

  it('adds dust change to the miner fee output to preserve ERG balance', () => {
    expect(planChangeOrFee(999_999, 1_100_000, 1_000_000)).toEqual({
      changeOutputValue: 0,
      minerFeeValue: 2_099_999,
      absorbedDust: 999_999,
    });
  });

  it('keeps exact-fee transactions balanced with no change', () => {
    expect(planChangeOrFee(0, 1_100_000, 1_000_000)).toEqual({
      changeOutputValue: 0,
      minerFeeValue: 1_100_000,
      absorbedDust: 0,
    });
  });

  it('rejects underfunded transaction plans', () => {
    expect(() => planChangeOrFee(-1, 1_100_000, 1_000_000)).toThrow('negative change');
  });

  it('supports BigInt values for high-value singleton touch transactions', () => {
    expect(planChangeOrFeeBigInt(999_999n, 1_100_000n, 1_000_000n)).toEqual({
      changeOutputValue: 0n,
      minerFeeValue: 2_099_999n,
      absorbedDust: 999_999n,
    });
  });

  it('converts string and bigint nanoERG values only when exact as number', () => {
    expect(safeNanoErgNumber('2100000', 'box value')).toBe(2_100_000);
    expect(safeNanoErgNumber(2_100_000n, 'box value')).toBe(2_100_000);
    expect(() => safeNanoErgNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'box value'))
      .toThrow('box value is outside JavaScript safe integer range');
  });
});
