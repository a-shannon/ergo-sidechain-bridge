import {
  decodeErgoCompactDifficulty,
  encodeErgoCompactDifficulty,
} from './ergo-autolykos-v2-header.js';

const PRECISION = 1_000_000_000n;
const MAX_I32 = 0x7fff_ffff;
const MAX_CONTEXT_HEADERS = 512;

export interface ErgoDifficultyHeader {
  readonly height: number;
  readonly timestamp: bigint;
  readonly nBits: number;
}

export interface ErgoEip37DifficultyProfile {
  readonly activationHeight: number;
  readonly epochLength: number;
  readonly useLastEpochs: number;
  readonly desiredBlockIntervalMs: bigint;
  readonly initialDifficulty: bigint;
}

export function requiredEip37ContextHeights(
  nextHeight: number,
  profile: ErgoEip37DifficultyProfile,
): readonly number[] {
  validateProfile(profile);
  if (!Number.isSafeInteger(nextHeight) || nextHeight < 1) {
    throw new Error('next Ergo header height must be a positive integer');
  }
  if ((nextHeight - 1) % profile.epochLength !== 0) {
    return [nextHeight - 1];
  }
  const heights: number[] = [];
  for (let index = profile.useLastEpochs; index >= 0; index -= 1) {
    const height = (nextHeight - 1) - (index * profile.epochLength);
    if (height >= 0) heights.push(height);
  }
  return heights;
}

export function expectedEip37Difficulty(
  parent: ErgoDifficultyHeader,
  context: readonly ErgoDifficultyHeader[],
  profile: ErgoEip37DifficultyProfile,
): bigint {
  validateProfile(profile);
  validateHeader(parent, 'parent difficulty header');
  const nextHeight = parent.height + 1;
  if (nextHeight < profile.activationHeight) {
    throw new Error('EIP-37 profile is not active at the next header height');
  }
  if (parent.height % profile.epochLength !== 0) {
    return positiveDifficulty(parent.nBits, 'parent difficulty');
  }

  const expectedHeights = requiredEip37ContextHeights(nextHeight, profile);
  const byHeight = new Map<number, ErgoDifficultyHeader>();
  for (const header of context) {
    validateHeader(header, 'EIP-37 context header');
    if (byHeight.has(header.height)) {
      throw new Error(`duplicate EIP-37 context height ${header.height}`);
    }
    byHeight.set(header.height, header);
  }
  const headers = expectedHeights.map((height) => {
    const header = byHeight.get(height);
    if (header === undefined) {
      throw new Error(`missing EIP-37 context header at height ${height}`);
    }
    return header;
  });
  if (headers.at(-1)?.height !== parent.height) {
    throw new Error('EIP-37 context does not terminate at the exact parent');
  }
  return calculateEip37Difficulty(headers, profile);
}

export function calculateEip37Difficulty(
  previousHeaders: readonly ErgoDifficultyHeader[],
  profile: ErgoEip37DifficultyProfile,
): bigint {
  validateProfile(profile);
  if (previousHeaders.length < 2) {
    throw new Error('EIP-37 recalculation requires at least two headers');
  }
  for (const header of previousHeaders) {
    validateHeader(header, 'EIP-37 previous header');
  }

  const last = previousHeaders.at(-1)!;
  const lastDifficulty = positiveDifficulty(last.nBits, 'last difficulty');
  const predictive = calculatePredictiveDifficulty(previousHeaders, profile);
  const limitedPredictive = predictive > lastDifficulty
    ? minimum(predictive, lastDifficulty * 3n / 2n)
    : maximum(predictive, lastDifficulty / 2n);
  const classic = calculateBitcoinDifficulty(previousHeaders, profile);
  const average = (classic + limitedPredictive) / 2n;
  const bounded = average > lastDifficulty
    ? minimum(average, lastDifficulty * 3n / 2n)
    : maximum(average, lastDifficulty / 2n);
  return normalizeDifficulty(bounded);
}

export function calculatePredictiveDifficulty(
  previousHeaders: readonly ErgoDifficultyHeader[],
  profile: ErgoEip37DifficultyProfile,
): bigint {
  validateProfile(profile);
  if (previousHeaders.length === 0) {
    throw new Error('predictive difficulty requires at least one header');
  }
  for (const header of previousHeaders) {
    validateHeader(header, 'predictive difficulty header');
  }
  const first = previousHeaders[0]!;
  const last = previousHeaders.at(-1)!;
  let uncompressed: bigint;
  if (previousHeaders.length === 1 || first.timestamp >= last.timestamp) {
    uncompressed = positiveDifficulty(first.nBits, 'first difficulty');
  } else {
    const data: Array<readonly [number, bigint]> = [];
    for (let index = 1; index < previousHeaders.length; index += 1) {
      const start = previousHeaders[index - 1]!;
      const end = previousHeaders[index]!;
      if (end.height - start.height !== profile.epochLength) {
        throw new Error('EIP-37 context heights do not match the epoch length');
      }
      const elapsed = end.timestamp - start.timestamp;
      if (elapsed <= 0n) {
        throw new Error('EIP-37 context timestamps must strictly increase');
      }
      const difficulty = positiveDifficulty(end.nBits, 'epoch difficulty')
        * profile.desiredBlockIntervalMs
        * BigInt(profile.epochLength)
        / elapsed;
      data.push([end.height, difficulty]);
    }
    const interpolated = interpolateDifficulty(data, profile.epochLength);
    uncompressed = interpolated >= 1n
      ? interpolated
      : profile.initialDifficulty;
  }
  return normalizeDifficulty(uncompressed);
}

export function interpolateDifficulty(
  data: readonly (readonly [number, bigint])[],
  epochLength: number,
): bigint {
  if (data.length === 0) {
    throw new Error('difficulty interpolation requires at least one point');
  }
  if (!Number.isSafeInteger(epochLength) || epochLength <= 0) {
    throw new Error('difficulty epoch length must be positive');
  }
  if (data.length === 1) return data[0]![1];

  const size = BigInt(data.length);
  let xySum = 0n;
  let xSquaredSum = 0n;
  let ySum = 0n;
  let xSum = 0n;
  let maximumHeight = -1;
  for (const [height, difficulty] of data) {
    if (!Number.isSafeInteger(height) || height < 0 || difficulty < 0n) {
      throw new Error('difficulty interpolation point is invalid');
    }
    const x = BigInt(height);
    xySum += x * difficulty;
    xSquaredSum += x * x;
    ySum += difficulty;
    xSum += x;
    maximumHeight = Math.max(maximumHeight, height);
  }
  const denominator = (xSquaredSum * size) - (xSum * xSum);
  if (denominator === 0n) {
    throw new Error('difficulty interpolation heights are degenerate');
  }
  const slope = ((xySum * size) - (xSum * ySum)) * PRECISION
    / denominator;
  const intercept = ((ySum * PRECISION) - (slope * xSum))
    / size
    / PRECISION;
  const point = BigInt(maximumHeight + epochLength);
  return intercept + (slope * point / PRECISION);
}

function calculateBitcoinDifficulty(
  previousHeaders: readonly ErgoDifficultyHeader[],
  profile: ErgoEip37DifficultyProfile,
): bigint {
  const start = previousHeaders.at(-2)!;
  const end = previousHeaders.at(-1)!;
  const elapsed = end.timestamp - start.timestamp;
  if (elapsed <= 0n) {
    throw new Error('Bitcoin-style difficulty timestamps must strictly increase');
  }
  return positiveDifficulty(end.nBits, 'last epoch difficulty')
    * profile.desiredBlockIntervalMs
    * BigInt(profile.epochLength)
    / elapsed;
}

function normalizeDifficulty(difficulty: bigint): bigint {
  return decodeErgoCompactDifficulty(encodeErgoCompactDifficulty(difficulty));
}

function positiveDifficulty(nBits: number, label: string): bigint {
  const difficulty = decodeErgoCompactDifficulty(nBits);
  if (difficulty <= 0n) throw new Error(`${label} must be positive`);
  return difficulty;
}

function validateHeader(header: ErgoDifficultyHeader, label: string): void {
  if (!Number.isSafeInteger(header.height) || header.height < 0) {
    throw new Error(`${label} height must be a non-negative integer`);
  }
  if (typeof header.timestamp !== 'bigint' || header.timestamp < 0n) {
    throw new Error(`${label} timestamp must be unsigned`);
  }
  positiveDifficulty(header.nBits, `${label} difficulty`);
}

function validateProfile(profile: ErgoEip37DifficultyProfile): void {
  if (
    !Number.isSafeInteger(profile.activationHeight)
    || profile.activationHeight < 1
    || profile.activationHeight > MAX_I32
  ) {
    throw new Error('EIP-37 activation height must be positive');
  }
  if (!Number.isSafeInteger(profile.epochLength) || profile.epochLength <= 1) {
    throw new Error('EIP-37 epoch length must be greater than one');
  }
  if (!Number.isSafeInteger(profile.useLastEpochs) || profile.useLastEpochs <= 1) {
    throw new Error('EIP-37 history length must be greater than one epoch');
  }
  if (profile.useLastEpochs + 1 > MAX_CONTEXT_HEADERS) {
    throw new Error(`EIP-37 context must contain at most ${MAX_CONTEXT_HEADERS} headers`);
  }
  if (profile.epochLength >= MAX_I32 / profile.useLastEpochs) {
    throw new Error('EIP-37 epoch history exceeds Int32 height capacity');
  }
  if (profile.desiredBlockIntervalMs <= 0n || profile.initialDifficulty <= 0n) {
    throw new Error('EIP-37 interval and initial difficulty must be positive');
  }
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function maximum(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}
