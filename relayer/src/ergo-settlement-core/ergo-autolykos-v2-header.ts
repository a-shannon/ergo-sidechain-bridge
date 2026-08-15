import blakejs from 'blakejs';

import {
  computeErgoHeaderId,
  serializeErgoHeaderWithoutPow,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const DIGEST_BYTES = 32;
const NONCE_BYTES = 8;
const AUTOLYKOS_K = 32;
const AUTOLYKOS_N_BASE = 1 << 26;
const AUTOLYKOS_N_INCREASE_START = 600 * 1024;
const AUTOLYKOS_N_INCREASE_PERIOD = 50 * 1024;
const AUTOLYKOS_N_MAX_HEIGHT = 4_198_400;
const MAX_SUPPORTED_HEADER_VERSION = 4;
const MAX_U256 = (1n << 256n) - 1n;
const SECP256K1_FIELD = BigInt(
  '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f',
);
const SECP256K1_ORDER = BigInt(
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
);

const AUTOLYKOS_M = (() => {
  const bytes = Buffer.alloc(1024 * 8);
  for (let index = 0; index < 1024; index += 1) {
    bytes.writeBigUInt64BE(BigInt(index), index * 8);
  }
  return bytes;
})();

export interface ErgoAutolykosV2ParentState {
  readonly headerId: Uint8Array;
  readonly height: number;
  readonly timestamp: bigint;
}

export interface ErgoAutolykosV2AdmissionExpectation {
  readonly parent: ErgoAutolykosV2ParentState;
  readonly expectedNBits: number;
}

export interface ErgoAutolykosV2Admission {
  readonly headerId: Buffer;
  readonly message: Buffer;
  readonly difficulty: bigint;
  readonly target: bigint;
  readonly hit: bigint;
  readonly tableSize: number;
}

/**
 * Verifies the consensus-local obligations for one Autolykos V2 header.
 *
 * The expected difficulty and parent state must come from an authenticated
 * relay state. This function deliberately does not derive difficulty, select
 * a fork, authenticate a checkpoint, validate future time, or authorize mint.
 */
export function admitErgoAutolykosV2Header(
  header: ErgoHeaderIdentityFields,
  expectation: ErgoAutolykosV2AdmissionExpectation,
): ErgoAutolykosV2Admission {
  if (header.version < 2 || header.version > MAX_SUPPORTED_HEADER_VERSION) {
    throw new Error(
      `Autolykos V2 header version must be from 2 to ${MAX_SUPPORTED_HEADER_VERSION}`,
    );
  }
  assertCompressedSecp256k1Point(header.powSolution.publicKey);
  const expectedParentId = exactBytes(
    expectation.parent.headerId,
    DIGEST_BYTES,
    'expected parent header ID',
  );
  if (!Buffer.from(header.parentId).equals(expectedParentId)) {
    throw new Error('Autolykos V2 header does not extend the expected parent');
  }
  if (
    !Number.isSafeInteger(expectation.parent.height)
    || expectation.parent.height < 0
    || header.height !== expectation.parent.height + 1
  ) {
    throw new Error('Autolykos V2 header height is not parent height plus one');
  }
  if (
    typeof expectation.parent.timestamp !== 'bigint'
    || header.timestamp <= expectation.parent.timestamp
  ) {
    throw new Error('Autolykos V2 header timestamp must advance past its parent');
  }
  const expectedNBits = unsignedU32(
    expectation.expectedNBits,
    'expected Autolykos difficulty nBits',
  );
  if (header.nBits !== expectedNBits) {
    throw new Error('Autolykos V2 header does not bind the expected difficulty');
  }

  const difficulty = decodeErgoCompactDifficulty(header.nBits);
  if (difficulty <= 0n) {
    throw new Error('Autolykos V2 difficulty must be positive');
  }
  const target = SECP256K1_ORDER / difficulty;
  const message = autolykosV2Message(header);
  const tableSize = autolykosV2TableSize(header.height);
  const hit = calculateAutolykosV2Hit(header, message, tableSize);
  if (hit >= target) {
    throw new Error('Autolykos V2 proof of work does not satisfy its target');
  }

  return {
    headerId: computeErgoHeaderId(header),
    message,
    difficulty,
    target,
    hit,
    tableSize,
  };
}

export function verifyClaimedAutolykosV2ProofOfWork(
  header: ErgoHeaderIdentityFields,
): boolean {
  if (header.version < 2 || header.version > MAX_SUPPORTED_HEADER_VERSION) {
    return false;
  }
  try {
    assertCompressedSecp256k1Point(header.powSolution.publicKey);
  } catch {
    return false;
  }
  const difficulty = decodeErgoCompactDifficulty(header.nBits);
  if (difficulty <= 0n) return false;
  const target = SECP256K1_ORDER / difficulty;
  return calculateAutolykosV2Hit(header) < target;
}

export function calculateAutolykosV2Hit(
  header: ErgoHeaderIdentityFields,
  message = autolykosV2Message(header),
  tableSize = autolykosV2TableSize(header.height),
): bigint {
  const nonce = exactBytes(
    header.powSolution.nonce,
    NONCE_BYTES,
    'Autolykos V2 nonce',
  );
  const heightBytes = Buffer.alloc(4);
  heightBytes.writeUInt32BE(unsignedU32(header.height, 'header height'));

  const preIndex = unsignedBigInt(
    hash(Buffer.concat([message, nonce])).subarray(-8),
  );
  const indexBytes = fixedUnsignedBytes(
    preIndex % BigInt(tableSize),
    4,
    'Autolykos V2 pre-index',
  );
  const f = hash(Buffer.concat([indexBytes, heightBytes, AUTOLYKOS_M]))
    .subarray(1);
  const seed = Buffer.concat([f, message, nonce]);
  const indexDigest = hash(seed);
  const extendedIndexDigest = Buffer.concat([
    indexDigest,
    indexDigest.subarray(0, 3),
  ]);

  let sum = 0n;
  for (let index = 0; index < AUTOLYKOS_K; index += 1) {
    const elementIndex = Number(
      unsignedBigInt(extendedIndexDigest.subarray(index, index + 4))
        % BigInt(tableSize),
    );
    const elementIndexBytes = Buffer.alloc(4);
    elementIndexBytes.writeUInt32BE(elementIndex);
    const element = hash(Buffer.concat([
      elementIndexBytes,
      heightBytes,
      AUTOLYKOS_M,
    ])).subarray(1);
    sum += unsignedBigInt(element);
  }

  return unsignedBigInt(hash(fixedUnsignedBytes(
    sum,
    DIGEST_BYTES,
    'Autolykos V2 element sum',
  )));
}

export function autolykosV2Message(
  header: ErgoHeaderIdentityFields,
): Buffer {
  return hash(serializeErgoHeaderWithoutPow(header));
}

export function autolykosV2TableSize(height: number): number {
  if (!Number.isSafeInteger(height) || height < 0 || height > 0x7fff_ffff) {
    throw new Error('Autolykos V2 height must be a non-negative Int32');
  }
  const boundedHeight = Math.min(height, AUTOLYKOS_N_MAX_HEIGHT);
  if (boundedHeight < AUTOLYKOS_N_INCREASE_START) {
    return AUTOLYKOS_N_BASE;
  }
  const iterations = Math.floor(
    (boundedHeight - AUTOLYKOS_N_INCREASE_START)
      / AUTOLYKOS_N_INCREASE_PERIOD,
  ) + 1;
  let tableSize = AUTOLYKOS_N_BASE;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    tableSize = Math.floor(tableSize / 100) * 105;
  }
  return tableSize;
}

export function decodeErgoCompactDifficulty(nBits: number): bigint {
  const compact = unsignedU32(nBits, 'compact difficulty nBits');
  const size = compact >>> 24;
  let value = BigInt(compact & 0x007f_ffff);
  if (size <= 3) {
    value >>= BigInt(8 * (3 - size));
  } else {
    value <<= BigInt(8 * (size - 3));
  }
  if (value > MAX_U256) {
    throw new Error('compact difficulty exceeds UInt256');
  }
  return (compact & 0x0080_0000) === 0 ? value : -value;
}

export function encodeErgoCompactDifficulty(difficulty: bigint): number {
  if (typeof difficulty !== 'bigint') {
    throw new Error('difficulty must be a bigint');
  }
  const negative = difficulty < 0n;
  const absolute = negative ? -difficulty : difficulty;
  if (absolute === 0n) return 0;
  if (absolute > MAX_U256) {
    throw new Error('difficulty exceeds UInt256');
  }

  let size = Math.ceil(absolute.toString(16).length / 2);
  let compact = size <= 3
    ? absolute << BigInt(8 * (3 - size))
    : absolute >> BigInt(8 * (size - 3));
  if ((compact & 0x0080_0000n) !== 0n) {
    compact >>= 8n;
    size += 1;
  }
  compact |= BigInt(size) << 24n;
  if (negative) compact |= 0x0080_0000n;
  if (compact > 0xffff_ffffn) {
    throw new Error('difficulty cannot be encoded as compact nBits');
  }
  return Number(compact);
}

export function assertCompressedSecp256k1Point(
  encodedPoint: Uint8Array,
): void {
  const point = exactBytes(
    encodedPoint,
    33,
    'compressed secp256k1 point',
  );
  if (point[0] !== 0x02 && point[0] !== 0x03) {
    throw new Error('compressed secp256k1 point prefix must be 02 or 03');
  }
  const x = unsignedBigInt(point.subarray(1));
  if (x >= SECP256K1_FIELD) {
    throw new Error('compressed secp256k1 point x-coordinate is out of range');
  }
  const ySquared = mod((x * x * x) + 7n, SECP256K1_FIELD);
  let y = modPow(
    ySquared,
    (SECP256K1_FIELD + 1n) / 4n,
    SECP256K1_FIELD,
  );
  if (mod(y * y, SECP256K1_FIELD) !== ySquared) {
    throw new Error('compressed secp256k1 point is not on the curve');
  }
  const expectedOdd = point[0] === 0x03;
  if ((y & 1n) === 1n !== expectedOdd) {
    y = SECP256K1_FIELD - y;
  }
  if (((y & 1n) === 1n) !== expectedOdd) {
    throw new Error('compressed secp256k1 point parity is invalid');
  }
}

function hash(bytes: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(bytes, undefined, DIGEST_BYTES));
}

function unsignedBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  return BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
}

function mod(value: bigint, modulus: bigint): bigint {
  const reduced = value % modulus;
  return reduced >= 0n ? reduced : reduced + modulus;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = mod(base, modulus);
  let remaining = exponent;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = (result * factor) % modulus;
    }
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }
  return result;
}

function fixedUnsignedBytes(
  value: bigint,
  length: number,
  label: string,
): Buffer {
  if (value < 0n) throw new Error(`${label} must be unsigned`);
  const hex = value.toString(16).padStart(length * 2, '0');
  if (hex.length > length * 2) {
    throw new Error(`${label} exceeds ${length} bytes`);
  }
  return Buffer.from(hex, 'hex');
}

function exactBytes(
  value: Uint8Array,
  expectedLength: number,
  label: string,
): Buffer {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) {
    throw new Error(`${label} must be exactly ${expectedLength} bytes`);
  }
  return Buffer.from(value);
}

function unsignedU32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}
