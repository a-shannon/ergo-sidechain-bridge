import { describe, expect, it } from 'vitest';

import {
  assertNonBroadcastNodePostPath,
  decodeAvlTreeRegisterDigest,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-helpers.js';

describe('ergo register helpers', () => {
  it.each([
    '/transactions',
    '/transactions/',
    '/transactions?trace=true',
    '/transactions/#fragment',
  ])('rejects transaction submission through the generic POST helper: %s', path => {
    expect(() => assertNonBroadcastNodePostPath(path)).toThrow(
      /cannot submit transactions/,
    );
  });

  it.each([
    '/transactions/check',
    '/blockchain/box/unspent/byAddress',
    '/script/p2sAddress',
  ])('allows non-broadcast node POST endpoints: %s', path => {
    expect(() => assertNonBroadcastNodePostPath(path)).not.toThrow();
  });

  it('round-trips short and multi-byte-length Coll[Byte] registers', () => {
    for (const bytes of [Buffer.from('abcd', 'hex'), Buffer.alloc(130, 0x7a)]) {
      expect(decodeCollByteRegister(encodeCollByteRegister(bytes))).toBe(bytes.toString('hex'));
    }
  });

  it('rejects malformed Coll[Byte] register lengths', () => {
    expect(() => decodeCollByteRegister('0e04aabb')).toThrow(/declares 4 bytes/);
    expect(() => decodeCollByteRegister('0500')).toThrow(/Coll\[Byte\]/);
  });

  it('encodes Long register values above signed 32-bit range', () => {
    expect(encodeLongRegister(3_000_000_000)).toBe('0580f882ad16');
  });

  it('rejects Long register values that cannot be represented exactly', () => {
    expect(() => encodeLongRegister(Number.MAX_SAFE_INTEGER + 1))
      .toThrow('Long register value outside JavaScript safe integer range');
  });

  it('extracts the digest from a Sigma AvlTree register', () => {
    const digest = '6aaafd25f895a30bc9cc00e6cc67a817f8e265e48cbfc700a1635bb002e62eb900';
    const register = encodeAvlTreeRegister(Buffer.from(digest, 'hex'), 0x0b, 1);

    expect(decodeAvlTreeRegisterDigest(register)).toBe(digest);
  });

  it('rejects non-AvlTree register values when extracting digests', () => {
    expect(() => decodeAvlTreeRegisterDigest('0500')).toThrow(/AvlTree/);
  });
});
