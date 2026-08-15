import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  decodeBoundedCollByteRegister,
  decodeCollByteRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import { decodeCanonicalDlogSigmaPropRegister } from './ergo-encoding.js';

const VALID_DLOG_KEY =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('side-effect-free Ergo encoding', () => {
  it('preserves canonical register encodings', () => {
    const bytes = Buffer.alloc(130, 0x7a);
    expect(decodeCollByteRegister(encodeCollByteRegister(bytes))).toBe(bytes.toString('hex'));
    expect(encodeLongRegister(3_000_000_000)).toBe('0580f882ad16');
    expect(encodeLongRegister(0x7fff_ffff_ffff_ffffn)).toBe('05feffffffffffffffff01');
    expect(() => encodeLongRegister(0x8000_0000_0000_0000n)).toThrow('signed 64-bit range');
  });

  it('rejects oversized Coll[Byte] constants before decoding their payload', () => {
    const encoded = encodeCollByteRegister(Buffer.alloc(33, 0x7a));
    expect(() => decodeBoundedCollByteRegister(encoded, 'bounded bytes', 32))
      .toThrow(/32-byte payload bound/i);
    expect(decodeBoundedCollByteRegister(encoded, 'bounded bytes', 33))
      .toBe('7a'.repeat(33));
  });

  it('decodes only fully consumed canonical signed scalar constants', () => {
    for (const value of [0n, 1n, -1n, 3_000_000_000n, 0x7fff_ffff_ffff_ffffn]) {
      expect(decodeCanonicalLongRegister(encodeLongRegister(value))).toBe(value);
    }
    for (const value of [0, 1, -1, 900_002, 0x7fff_ffff]) {
      expect(decodeCanonicalIntRegister(encodeIntRegister(value))).toBe(value);
    }
    for (const malformed of ['0500ff', '058000', '04', '0400ff', '048000']) {
      expect(() => malformed.startsWith('05')
        ? decodeCanonicalLongRegister(malformed)
        : decodeCanonicalIntRegister(malformed)).toThrow(/canonical|fully consumed|VLQ/i);
    }
  });

  it('fully consumes and validates canonical proveDlog SigmaProp registers', () => {
    const canonical = encodeSigmaPropRegister(VALID_DLOG_KEY);
    expect(decodeCanonicalDlogSigmaPropRegister(canonical)).toBe(VALID_DLOG_KEY);
    expect(decodeCanonicalDlogSigmaPropRegister(`0x${canonical.toUpperCase()}`))
      .toBe(VALID_DLOG_KEY);

    for (const malformed of [
      `${canonical}00`,
      encodeCollByteRegister(Buffer.from(VALID_DLOG_KEY, 'hex')),
      `08cd04${'11'.repeat(32)}`,
      `08cd02${'ff'.repeat(32)}`,
    ]) {
      expect(() => decodeCanonicalDlogSigmaPropRegister(malformed))
        .toThrow(/canonical proveDlog|compressed secp256k1|valid canonical secp256k1/i);
    }
  });

  it('does not import environment, filesystem, network, or signing state', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./ergo-settlement-core/ergo-encoding.ts', import.meta.url)),
      'utf8',
    );
    for (const forbidden of [
      'process.env',
      "from 'axios'",
      "from 'fs'",
      "from 'dotenv'",
      'fetch(',
      'ERGO_API_KEY',
      'ERGO_NODE',
    ]) {
      expect(source, `unexpected side-effect surface: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
