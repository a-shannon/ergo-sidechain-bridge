/**
 * Side-effect-free Ergo constants and Sigma serialization helpers.
 *
 * Keep this module free of environment, filesystem, network, signing, and
 * runtime-state access so offline builders can import it safely.
 */

export function vlq(n: number): Buffer {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n & 0x7f);
  return Buffer.from(out);
}

function vlqBigint(n: bigint): Buffer {
  const out: number[] = [];
  while (n > 0x7fn) {
    out.push(Number(n & 0x7fn) | 0x80);
    n >>= 7n;
  }
  out.push(Number(n & 0x7fn));
  return Buffer.from(out);
}

/** Encode a byte array as Sigma Coll[Byte]: 0e + VLQ(length) + payload. */
export function encodeCollByteRegister(data: Buffer): string {
  return '0e' + vlq(data.length).toString('hex') + data.toString('hex');
}

export function decodeCollByteRegister(registerHex: string, label = 'Coll[Byte] register'): string {
  return decodeCollByteRegisterWithin(registerHex, label, null);
}

export function decodeBoundedCollByteRegister(
  registerHex: string,
  label: string,
  maxPayloadBytes: number,
): string {
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 0) {
    throw new Error(`${label} maximum payload length must be a nonnegative safe integer`);
  }
  return decodeCollByteRegisterWithin(registerHex, label, maxPayloadBytes);
}

function decodeCollByteRegisterWithin(
  registerHex: string,
  label: string,
  maxPayloadBytes: number | null,
): string {
  if (typeof registerHex !== 'string') {
    throw new Error(`${label} must be a Sigma-serialized Coll[Byte]`);
  }
  const prefixChars = registerHex.startsWith('0x') ? 2 : 0;
  // One type byte plus at most five bytes for the 32-bit VLQ length. Check
  // this before applying a whole-string regex or allocating the payload.
  if (
    maxPayloadBytes !== null
    && registerHex.length > (maxPayloadBytes + 6) * 2 + prefixChars
  ) {
    throw new Error(`${label} exceeds the ${maxPayloadBytes}-byte payload bound`);
  }
  const clean = prefixChars === 2 ? registerHex.slice(2) : registerHex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0 || !clean.startsWith('0e')) {
    throw new Error(`${label} must be a Sigma-serialized Coll[Byte]`);
  }

  let offset = 2;
  let length = 0;
  let shift = 0;
  for (;;) {
    if (offset + 2 > clean.length || shift > 28) {
      throw new Error(`${label} has an invalid VLQ length`);
    }
    const byte = Number.parseInt(clean.slice(offset, offset + 2), 16);
    offset += 2;
    length |= (byte & 0x7f) << shift;
    if (maxPayloadBytes !== null && length > maxPayloadBytes) {
      throw new Error(`${label} exceeds the ${maxPayloadBytes}-byte payload bound`);
    }
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  const payload = clean.slice(offset);
  if (payload.length !== length * 2) {
    throw new Error(
      `${label} length prefix declares ${length} bytes but payload has ${payload.length / 2}`,
    );
  }
  return payload.toLowerCase();
}

export function encodeLongRegister(value: number | bigint): string {
  if (typeof value === 'number' && (!Number.isInteger(value) || !Number.isSafeInteger(value))) {
    throw new Error(`Long register value outside JavaScript safe integer range: ${value}`);
  }
  const n = BigInt(value);
  if (n < -0x8000_0000_0000_0000n || n > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`Long register value outside signed 64-bit range: ${value}`);
  }
  const zigzag = n >= 0n ? n << 1n : (n << 1n) ^ (n >> 63n);
  return '05' + vlqBigint(zigzag).toString('hex');
}

export function decodeCanonicalLongRegister(
  registerHex: string,
  label = 'Long register',
): bigint {
  const decoded = decodeCanonicalSignedScalar(registerHex, 0x05, 64, label);
  if (encodeLongRegister(decoded) !== normalizeSerializedConstant(registerHex)) {
    throw new Error(`${label} must use the canonical Long encoding`);
  }
  return decoded;
}

export function encodeIntRegister(value: number): string {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new Error(`Int register value out of range: ${value}`);
  }
  const n = BigInt(value);
  const zigzag = n >= 0n ? n << 1n : (n << 1n) ^ (n >> 31n);
  return '04' + vlqBigint(zigzag).toString('hex');
}

export function decodeCanonicalIntRegister(
  registerHex: string,
  label = 'Int register',
): number {
  const decoded = decodeCanonicalSignedScalar(registerHex, 0x04, 32, label);
  const value = Number(decoded);
  if (!Number.isSafeInteger(value) || encodeIntRegister(value) !== normalizeSerializedConstant(registerHex)) {
    throw new Error(`${label} must use the canonical Int encoding`);
  }
  return value;
}

export function encodeSigmaPropRegister(compressedPubKey33Hex: string): string {
  if (compressedPubKey33Hex.length !== 66) {
    throw new Error(`SigmaProp pubkey must be 66 hex chars (33 bytes), got ${compressedPubKey33Hex.length}`);
  }
  return '08cd' + compressedPubKey33Hex;
}

/**
 * Encode a Sigma AvlTree register. Bridge DUP trees use Some(1) as their fixed
 * value length; encoding None here would describe a different authenticated
 * tree and invalidate the WASM proofs.
 */
export function encodeAvlTreeRegister(
  digest33: Buffer,
  flags = 1,
  valueLengthOpt?: number,
): string {
  const valueLengthHex = valueLengthOpt === undefined || valueLengthOpt === null
    ? '00'
    : '01' + vlq(valueLengthOpt).toString('hex');
  return '64' +
    digest33.toString('hex') +
    flags.toString(16).padStart(2, '0') +
    vlq(32).toString('hex') +
    valueLengthHex;
}

export function decodeAvlTreeRegisterDigest(registerHex: string, label = 'AvlTree register'): string {
  const clean = registerHex.startsWith('0x') ? registerHex.slice(2) : registerHex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.slice(0, 2).toLowerCase() !== '64') {
    throw new Error(`${label} must be a Sigma AvlTree value`);
  }
  if (clean.length < 68) {
    throw new Error(`${label} is too short to contain an AVL digest`);
  }
  return clean.slice(2, 68).toLowerCase();
}

/** Set the ErgoTree size bit when required by post-v0 validation rules. */
export function ensureSizeBit(ergoTreeHex: string): string {
  const buffer = Buffer.from(ergoTreeHex, 'hex');
  const header = buffer[0];
  const version = header & 0x07;
  if (version === 0 || (header & 0x08) !== 0) return ergoTreeHex;

  const bodyBytes = buffer.subarray(1);
  return Buffer.concat([
    Buffer.from([header | 0x08]),
    vlq(bodyBytes.length),
    bodyBytes,
  ]).toString('hex');
}

function decodeCanonicalSignedScalar(
  registerHex: string,
  expectedType: number,
  width: 32 | 64,
  label: string,
): bigint {
  const clean = normalizeSerializedConstant(registerHex);
  const bytes = Buffer.from(clean, 'hex');
  if (bytes.length < 2 || bytes[0] !== expectedType) {
    throw new Error(
      `${label} must be one canonical Sigma-serialized ${width === 64 ? 'Long' : 'Int'}`,
    );
  }

  let unsigned = 0n;
  let shift = 0n;
  let consumed = 0;
  for (let index = 1; index < bytes.length; index++) {
    const byte = bytes[index];
    unsigned |= BigInt(byte & 0x7f) << shift;
    consumed++;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (consumed >= (width === 64 ? 10 : 5)) {
      throw new Error(`${label} has an invalid VLQ encoding`);
    }
  }
  if (consumed === 0 || 1 + consumed !== bytes.length || (bytes[bytes.length - 1] & 0x80) !== 0) {
    throw new Error(`${label} must be one fully consumed VLQ constant`);
  }
  if (unsigned > ((1n << BigInt(width)) - 1n)) {
    throw new Error(`${label} is outside the signed ${width}-bit range`);
  }
  return (unsigned >> 1n) ^ -(unsigned & 1n);
}

function normalizeSerializedConstant(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error('serialized Sigma constant must be even-length hex');
  }
  return clean.toLowerCase();
}
