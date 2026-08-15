import { describe, expect, it } from 'vitest';

import { encodeErgoCompactDifficulty } from './ergo-autolykos-v2-header.js';
import {
  calculateEip37Difficulty,
  calculatePredictiveDifficulty,
  expectedEip37Difficulty,
  interpolateDifficulty,
  requiredEip37ContextHeights,
  type ErgoDifficultyHeader,
  type ErgoEip37DifficultyProfile,
} from './ergo-eip37-difficulty.js';

const PROFILE: ErgoEip37DifficultyProfile = {
  activationHeight: 844_673,
  epochLength: 128,
  useLastEpochs: 8,
  desiredBlockIntervalMs: 120_000n,
  initialDifficulty: 1n,
};

describe('Ergo EIP-37 difficulty', () => {
  it('rejects an EIP-37 history profile before unbounded context iteration', () => {
    expect(() => requiredEip37ContextHeights(926_977, {
      ...PROFILE,
      useLastEpochs: 512,
    })).toThrow(/at most 512 headers/);
  });

  it('matches the pinned JVM context-height vectors', () => {
    expect(requiredEip37ContextHeights(926_977, {
      ...PROFILE,
      useLastEpochs: 4,
    })).toEqual([926_464, 926_592, 926_720, 926_848, 926_976]);
    expect(requiredEip37ContextHeights(927_105, {
      ...PROFILE,
      useLastEpochs: 4,
    })).toEqual([926_592, 926_720, 926_848, 926_976, 927_104]);
    expect(requiredEip37ContextHeights(926_976, {
      ...PROFILE,
      useLastEpochs: 4,
    })).toEqual([926_975]);
  });

  it('matches the pinned JVM interpolation vectors', () => {
    const difficulty = 675_204_474_840_679_645_414_180_963_439_886_534_428n;
    expect(interpolateDifficulty([
      [799_167_010, difficulty],
      [799_167_133, difficulty],
      [799_167_256, difficulty],
      [799_167_379, difficulty],
    ], 123)).toBe(difficulty);
    expect(interpolateDifficulty([
      [123, difficulty],
      [246, difficulty * 2n],
      [369, difficulty * 2n],
      [492, difficulty],
    ], 123)).toBe(difficulty * 3n / 2n);
    expect(interpolateDifficulty([
      [123, difficulty],
      [246, difficulty * 2n],
      [369, difficulty * 3n],
      [492, difficulty * 4n],
    ], 123)).toBe(
      3_376_022_374_203_398_227_070_904_817_199_432_672_139n,
    );
  });

  it('preserves constant hash rate through predictive and EIP-37 calculation', () => {
    const difficulty = 1_000_000n;
    const headers = epochHeaders(844_672, difficulty, 120_000n);
    expect(calculatePredictiveDifficulty(headers, PROFILE)).toBe(difficulty);
    expect(calculateEip37Difficulty(headers, PROFILE)).toBe(difficulty);
    expect(expectedEip37Difficulty(headers.at(-1)!, headers, PROFILE)).toBe(
      difficulty,
    );
  });

  it('caps an abrupt difficulty move to the EIP-37 half/double bounds', () => {
    const difficulty = 1_000_000n;
    const slow = epochHeaders(844_672, difficulty, 480_000n);
    const fast = epochHeaders(844_672, difficulty, 30_000n);
    expect(calculateEip37Difficulty(slow, PROFILE)).toBe(500_000n);
    expect(calculateEip37Difficulty(fast, PROFILE)).toBe(1_500_000n);
  });

  it('retains parent difficulty between epochs and rejects incomplete context', () => {
    const parent = header(844_673, 1_234_567n, 1_000n);
    expect(expectedEip37Difficulty(parent, [], PROFILE)).toBe(
      1_234_567n,
    );
    const boundary = header(844_800, 1_234_567n, 2_000n);
    expect(() => expectedEip37Difficulty(boundary, [boundary], PROFILE))
      .toThrow(/missing EIP-37 context/);
  });

  it('rejects duplicate, mis-spaced, and non-increasing context', () => {
    const headers = epochHeaders(844_672, 1_000_000n, 120_000n);
    expect(() => expectedEip37Difficulty(headers.at(-1)!, [
      ...headers,
      headers[0]!,
    ], PROFILE)).toThrow(/duplicate/);
    expect(() => calculatePredictiveDifficulty([
      headers[0]!,
      { ...headers[1]!, height: headers[1]!.height + 1 },
    ], PROFILE)).toThrow(/epoch length/);
    expect(() => calculateEip37Difficulty([
      headers[0]!,
      { ...headers[1]!, timestamp: headers[0]!.timestamp },
    ], PROFILE)).toThrow(/strictly increase/);
  });
});

function epochHeaders(
  endingHeight: number,
  difficulty: bigint,
  blockIntervalMs: bigint,
): ErgoDifficultyHeader[] {
  const firstHeight = endingHeight - (PROFILE.useLastEpochs * PROFILE.epochLength);
  return Array.from({ length: PROFILE.useLastEpochs + 1 }, (_, index) => {
    const height = firstHeight + (index * PROFILE.epochLength);
    return header(
      height,
      difficulty,
      BigInt(height - firstHeight) * blockIntervalMs,
    );
  });
}

function header(
  height: number,
  difficulty: bigint,
  timestamp: bigint,
): ErgoDifficultyHeader {
  return {
    height,
    timestamp,
    nBits: encodeErgoCompactDifficulty(difficulty),
  };
}
