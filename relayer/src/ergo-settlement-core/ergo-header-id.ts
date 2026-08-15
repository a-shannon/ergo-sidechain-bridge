import blakejs from 'blakejs';

const DIGEST_BYTES = 32;
const STATE_ROOT_BYTES = 33;
const PUBLIC_KEY_BYTES = 33;
const NONCE_BYTES = 8;
const VOTES_BYTES = 3;
const MAX_U32 = 0xffff_ffff;
const MAX_I32 = 0x7fff_ffff;
const MAX_I64 = 0x7fff_ffff_ffff_ffffn;
const MAX_BYTE_STRING_BYTES = 0xff;

export interface ErgoHeaderIdentityFields {
  readonly version: number;
  readonly parentId: Uint8Array;
  readonly adProofsRoot: Uint8Array;
  readonly stateRoot: Uint8Array;
  readonly transactionsRoot: Uint8Array;
  readonly timestamp: bigint;
  readonly nBits: number;
  readonly height: number;
  readonly extensionHash: Uint8Array;
  readonly votes: Uint8Array;
  readonly unparsedBytes?: Uint8Array;
  readonly powSolution: {
    readonly publicKey: Uint8Array;
    readonly nonce: Uint8Array;
    readonly oneTimePublicKey?: Uint8Array;
    readonly distance?: bigint;
  };
}

/**
 * Computes the canonical Ergo header ID from the pinned v6.0.2 wire format.
 *
 * The caller remains responsible for validating that encoded public keys are
 * valid curve points and that the header satisfies proof-of-work or consensus.
 */
export function computeErgoHeaderId(
  input: ErgoHeaderIdentityFields,
): Buffer {
  return Buffer.from(blakejs.blake2b(
    serializeErgoHeaderIdentity(input),
    undefined,
    DIGEST_BYTES,
  ));
}

export function serializeErgoHeaderIdentity(
  input: ErgoHeaderIdentityFields,
): Buffer {
  const chunks = [serializeErgoHeaderWithoutPow(input)];
  const version = input.version;
  const publicKey = exactBytes(
    input.powSolution.publicKey,
    PUBLIC_KEY_BYTES,
    'Autolykos public key',
  );
  const nonce = exactBytes(
    input.powSolution.nonce,
    NONCE_BYTES,
    'Autolykos nonce',
  );

  if (version === 1) {
    const oneTimePublicKey = exactBytes(
      input.powSolution.oneTimePublicKey,
      PUBLIC_KEY_BYTES,
      'Autolykos V1 one-time public key',
    );
    const distance = unsignedBigInt(
      input.powSolution.distance,
      (1n << 2040n) - 1n,
      'Autolykos V1 distance',
    );
    const distanceBytes = unsignedBigEndian(distance);
    if (distanceBytes.length > MAX_BYTE_STRING_BYTES) {
      throw new Error(
        `Autolykos V1 distance exceeds ${MAX_BYTE_STRING_BYTES} bytes`,
      );
    }
    chunks.push(
      publicKey,
      oneTimePublicKey,
      nonce,
      Buffer.from([distanceBytes.length]),
      distanceBytes,
    );
  } else {
    chunks.push(publicKey, nonce);
  }
  return Buffer.concat(chunks);
}

export function serializeErgoHeaderWithoutPow(
  input: ErgoHeaderIdentityFields,
): Buffer {
  const version = integerInRange(input.version, 1, 0x7f, 'header version');
  const parentId = exactBytes(input.parentId, DIGEST_BYTES, 'parent ID');
  const adProofsRoot = exactBytes(
    input.adProofsRoot,
    DIGEST_BYTES,
    'AD proofs root',
  );
  const transactionsRoot = exactBytes(
    input.transactionsRoot,
    DIGEST_BYTES,
    'transactions root',
  );
  const stateRoot = exactBytes(
    input.stateRoot,
    STATE_ROOT_BYTES,
    'state root',
  );
  const timestamp = unsignedBigInt(
    input.timestamp,
    MAX_I64,
    'header timestamp',
  );
  const extensionHash = exactBytes(
    input.extensionHash,
    DIGEST_BYTES,
    'extension hash',
  );
  const nBits = integerInRange(input.nBits, 0, MAX_U32, 'header nBits');
  const height = integerInRange(input.height, 0, MAX_I32, 'header height');
  const votes = exactBytes(input.votes, VOTES_BYTES, 'header votes');
  const unparsedBytes = boundedBytes(
    input.unparsedBytes ?? Buffer.alloc(0),
    MAX_BYTE_STRING_BYTES,
    'header unparsed bytes',
  );
  if (version <= 4 && unparsedBytes.length !== 0) {
    throw new Error(
      'header unparsed bytes must be empty through block version 4',
    );
  }
  const nBitsBytes = Buffer.alloc(4);
  nBitsBytes.writeUInt32BE(nBits);
  return Buffer.concat([
    Buffer.from([version]),
    parentId,
    adProofsRoot,
    transactionsRoot,
    stateRoot,
    unsignedVlq(timestamp),
    extensionHash,
    nBitsBytes,
    unsignedVlq(BigInt(height)),
    votes,
    ...(version > 1
      ? [Buffer.from([unparsedBytes.length]), unparsedBytes]
      : []),
  ]);
}

/**
 * Parses the exact pinned wire shape used by supported V1 and V2 headers.
 * Consensus and proof-of-work checks remain the caller's responsibility.
 */
export function parseErgoHeaderIdentity(
  value: Uint8Array,
): ErgoHeaderIdentityFields {
  return parseErgoHeaderIdentityInRange(value, 1);
}

/** Parses the same wire shape while rejecting legacy Autolykos V1 headers. */
export function parseErgoAutolykosV2HeaderIdentity(
  value: Uint8Array,
): ErgoHeaderIdentityFields {
  return parseErgoHeaderIdentityInRange(value, 2);
}

function parseErgoHeaderIdentityInRange(
  value: Uint8Array,
  minimumVersion: 1 | 2,
): ErgoHeaderIdentityFields {
  if (!(value instanceof Uint8Array)) {
    throw new Error('canonical Ergo header must be bytes');
  }
  const bytes = Buffer.from(value);
  const cursor = new HeaderCursor(bytes);
  const version = cursor.u8('header version');
  if (version < minimumVersion || version > 4) {
    throw new Error(minimumVersion === 2
      ? 'canonical Ergo header must use Autolykos V2 block version 2 to 4'
      : 'canonical Ergo header must use supported block version 1 to 4');
  }
  const parentId = cursor.bytes(DIGEST_BYTES, 'parent ID');
  const adProofsRoot = cursor.bytes(DIGEST_BYTES, 'AD proofs root');
  const transactionsRoot = cursor.bytes(DIGEST_BYTES, 'transactions root');
  const stateRoot = cursor.bytes(STATE_ROOT_BYTES, 'state root');
  const timestamp = cursor.unsignedVlq(MAX_I64, 'header timestamp');
  const extensionHash = cursor.bytes(DIGEST_BYTES, 'extension hash');
  const nBits = cursor.u32be('header nBits');
  const heightValue = cursor.unsignedVlq(BigInt(MAX_I32), 'header height');
  const votes = cursor.bytes(VOTES_BYTES, 'header votes');
  const unparsedBytes = version === 1
    ? Buffer.alloc(0)
    : cursor.bytes(
      cursor.u8('header unparsed-byte length'),
      'header unparsed bytes',
    );
  if (unparsedBytes.length !== 0) {
    throw new Error('header unparsed bytes must be empty through block version 4');
  }
  const publicKey = cursor.bytes(PUBLIC_KEY_BYTES, 'Autolykos public key');
  const oneTimePublicKey = version === 1
    ? cursor.bytes(PUBLIC_KEY_BYTES, 'Autolykos V1 one-time public key')
    : undefined;
  const nonce = cursor.bytes(NONCE_BYTES, 'Autolykos nonce');
  const distance = version === 1
    ? unsignedBigEndianValue(cursor.bytes(
      cursor.u8('Autolykos V1 distance length'),
      'Autolykos V1 distance',
    ))
    : undefined;
  cursor.end();

  const header: ErgoHeaderIdentityFields = {
    version,
    parentId,
    adProofsRoot,
    stateRoot,
    transactionsRoot,
    timestamp,
    nBits,
    height: Number(heightValue),
    extensionHash,
    votes,
    unparsedBytes,
    powSolution: {
      publicKey,
      nonce,
      ...(oneTimePublicKey === undefined ? {} : { oneTimePublicKey }),
      ...(distance === undefined ? {} : { distance }),
    },
  };
  if (!serializeErgoHeaderIdentity(header).equals(bytes)) {
    throw new Error('canonical Ergo header bytes do not round-trip exactly');
  }
  return header;
}

class HeaderCursor {
  private offset = 0;

  constructor(private readonly source: Buffer) {}

  u8(label: string): number {
    return this.bytes(1, label)[0]!;
  }

  u32be(label: string): number {
    const bytes = this.bytes(4, label);
    return bytes.readUInt32BE(0);
  }

  bytes(length: number, label: string): Buffer {
    if (
      !Number.isSafeInteger(length)
      || length < 0
      || this.offset + length > this.source.length
    ) {
      throw new Error(`${label} exceeds the canonical Ergo header boundary`);
    }
    const result = Buffer.from(
      this.source.subarray(this.offset, this.offset + length),
    );
    this.offset += length;
    return result;
  }

  unsignedVlq(maximum: bigint, label: string): bigint {
    let result = 0n;
    let shift = 0n;
    let count = 0;
    while (true) {
      const byte = this.u8(label);
      const payload = byte & 0x7f;
      result |= BigInt(payload) << shift;
      count += 1;
      if (result > maximum) {
        throw new Error(`${label} exceeds its supported range`);
      }
      if ((byte & 0x80) === 0) {
        if (count > 1 && payload === 0) {
          throw new Error(`${label} uses a non-canonical unsigned VLQ`);
        }
        return result;
      }
      shift += 7n;
      if (shift > 63n) {
        throw new Error(`${label} unsigned VLQ is too long`);
      }
    }
  }

  end(): void {
    if (this.offset !== this.source.length) {
      throw new Error('canonical Ergo header contains trailing bytes');
    }
  }
}

function unsignedVlq(value: bigint): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(bytes);
}

function unsignedBigEndian(value: bigint): Buffer {
  if (value === 0n) return Buffer.from([0]);
  const hex = value.toString(16);
  return Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, 'hex');
}

function unsignedBigEndianValue(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) result = (result << 8n) | BigInt(byte);
  return result;
}

function exactBytes(
  value: Uint8Array | undefined,
  expectedLength: number,
  label: string,
): Buffer {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) {
    throw new Error(`${label} must be exactly ${expectedLength} bytes`);
  }
  return Buffer.from(value);
}

function boundedBytes(
  value: Uint8Array,
  maximumLength: number,
  label: string,
): Buffer {
  if (!(value instanceof Uint8Array) || value.length > maximumLength) {
    throw new Error(`${label} must contain at most ${maximumLength} bytes`);
  }
  return Buffer.from(value);
}

function integerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function unsignedBigInt(
  value: bigint | undefined,
  maximum: bigint,
  label: string,
): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > maximum) {
    throw new Error(`${label} must be an unsigned integer in range`);
  }
  return value;
}
