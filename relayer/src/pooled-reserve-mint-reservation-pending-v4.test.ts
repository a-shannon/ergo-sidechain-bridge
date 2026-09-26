import { describe, expect, it, vi } from 'vitest';

import {
  encodePooledReserveMintReservationPendingV4ScaleHex as encode,
  type PooledReserveMintReservationPendingV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';

const hash = (byte: string) => `0x${byte.repeat(32)}`;
const fixture = (): PooledReserveMintReservationPendingV4 => ({
  profileIdHex: hash('11'),
  statementHex: `0x${'ab'.repeat(603)}`,
  statementIdHex: hash('22'),
  mintIdentityHex: hash('33'),
  sourceStatementBytesDigestHex: hash('44'),
  sourceProofSystemIdHex: hash('55'),
  sourceProofProfileIdHex: hash('66'),
  sourceProofIssuedAtNativeHeight: '72623859790382856',
  sourceProofRequestDigestHex: hash('77'),
  sourceProofResultIdHex: hash('88'),
  sourceProofDigestHex: hash('99'),
  reservedAtNativeHeight: 0x1112131415161718n,
  expiresAtNativeHeight: 0x2122232425262728n,
});
const hashOffsets = [
  ['profileIdHex', 1, 33],
  ['statementIdHex', 638, 670],
  ['mintIdentityHex', 670, 702],
  ['sourceStatementBytesDigestHex', 702, 734],
  ['sourceProofSystemIdHex', 734, 766],
  ['sourceProofProfileIdHex', 766, 798],
  ['sourceProofRequestDigestHex', 806, 838],
  ['sourceProofResultIdHex', 838, 870],
  ['sourceProofDigestHex', 870, 902],
] as const;
const heightFields = [
  'sourceProofIssuedAtNativeHeight', 'reservedAtNativeHeight', 'expiresAtNativeHeight',
] as const;
const fields = Object.keys(fixture());
const uncheckedEncode = (value: unknown) => encode(value as PooledReserveMintReservationPendingV4);

describe('pure pending reservation V4 SCALE encoder', () => {
  it('encodes every exact offset in the 918-byte runtime record without mutating input', () => {
    const input = Object.freeze(fixture());
    const before = { ...input };
    const encoded = encode(input);
    expect(encoded).toMatch(/^0x[0-9a-f]{1836}$/);
    const bytes = Buffer.from(encoded.slice(2), 'hex');
    expect(bytes.length).toBe(918);
    expect(bytes[0]).toBe(4);
    expect(bytes.subarray(33, 35).toString('hex')).toBe('6d09');
    expect(bytes.subarray(35, 638).toString('hex')).toBe(input.statementHex.slice(2));
    for (const [field, start, end] of hashOffsets) {
      expect(bytes.subarray(start, end).toString('hex'), field).toBe(input[field].slice(2));
    }
    expect(bytes.subarray(798, 806).toString('hex')).toBe('0807060504030201');
    expect(bytes.subarray(902, 910).toString('hex')).toBe('1817161514131211');
    expect(bytes.subarray(910, 918).toString('hex')).toBe('2827262524232221');
    expect(input).toEqual(before);
    expect(encode(input)).toBe(encoded);
  });

  it('accepts zero issue/reservation, equal issue/reservation and the maximum u64 expiry', () => {
    const bytes = Buffer.from(encode({ ...fixture(), sourceProofIssuedAtNativeHeight: 0,
      reservedAtNativeHeight: '0', expiresAtNativeHeight: 0xffff_ffff_ffff_ffffn }).slice(2), 'hex');
    expect(bytes.readBigUInt64LE(798)).toBe(0n);
    expect(bytes.readBigUInt64LE(902)).toBe(0n);
    expect(bytes.subarray(910).toString('hex')).toBe('ffffffffffffffff');
  });

  it('preserves full u64 precision and accepts canonical numeric representations', () => {
    const input = { ...fixture(), sourceProofIssuedAtNativeHeight: 0xffff_ffff_ffff_fffen,
      reservedAtNativeHeight: '18446744073709551614', expiresAtNativeHeight: '18446744073709551615' };
    const bytes = Buffer.from(encode(input).slice(2), 'hex');
    expect(bytes.readBigUInt64LE(798)).toBe(0xffff_ffff_ffff_fffen);
    expect(bytes.readBigUInt64LE(902)).toBe(0xffff_ffff_ffff_fffen);
    const small = { ...fixture(), sourceProofIssuedAtNativeHeight: 1, reservedAtNativeHeight: 2, expiresAtNativeHeight: 3 };
    expect(encode(small)).toBe(encode({ ...small, sourceProofIssuedAtNativeHeight: '1',
      reservedAtNativeHeight: 2n, expiresAtNativeHeight: '3' }));
  });

  it('accepts a null-prototype own-data record independent of property order', () => {
    const input = Object.assign(Object.create(null), Object.fromEntries(Object.entries(fixture()).reverse()));
    expect(encode(input)).toBe(encode(fixture()));
  });

  for (const [field] of hashOffsets) {
    describe(field, () => {
      it('rejects zero independently', () => {
        expect(() => encode({ ...fixture(), [field]: hash('00') })).toThrow(`${field} must not be zero`);
      });
      it.each([
        ['short', `0x${'ab'.repeat(31)}`], ['long', `0x${'ab'.repeat(33)}`],
        ['odd', `0x${'a'.repeat(63)}`], ['unprefixed', 'ab'.repeat(32)],
        ['uppercase', hash('AB')], ['invalid hex', hash('gg')],
        ['null', null], ['number', 1], ['object', { toString: () => hash('ab') }],
      ])('rejects %s independently', (_label, value) => {
        expect(() => uncheckedEncode({ ...fixture(), [field]: value })).toThrow(field);
      });
    });
  }

  it.each([
    ['short', `0x${'ab'.repeat(602)}`], ['long', `0x${'ab'.repeat(604)}`],
    ['odd', `0x${'a'.repeat(1205)}`], ['unprefixed', 'ab'.repeat(603)],
    ['uppercase', `0x${'AB'.repeat(603)}`], ['invalid hex', `0x${'gg'.repeat(603)}`],
    ['null', null], ['bytes', Buffer.alloc(603)], ['number', 603],
  ])('rejects %s statement independently', (_label, value) => {
    expect(() => uncheckedEncode({ ...fixture(), statementHex: value })).toThrow('statementHex');
  });

  for (const field of heightFields) {
    it.each([
      ['negative bigint', -1n], ['negative number', -1], ['negative zero', -0],
      ['overflow bigint', 1n << 64n], ['overflow string', '18446744073709551616'],
      ['unsafe number', Number.MAX_SAFE_INTEGER + 1], ['fraction', 1.5],
      ['NaN', NaN], ['infinity', Infinity], ['null', null], ['undefined', undefined],
      ['boolean', true], ['object', { valueOf: () => 1n }],
      ['leading zero', '01'], ['signed string', '+1'], ['negative string', '-1'],
      ['hex string', '0x01'], ['whitespace', ' 1'], ['trailing newline', '1\n'],
      ['empty', ''], ['decimal', '1.0'], ['exponent', '1e1'], ['oversized', '1'.repeat(100)],
    ])(`rejects ${field}: %s independently`, (_label, value) => {
      expect(() => uncheckedEncode({ ...fixture(), [field]: value })).toThrow(`${field} must be a canonical uint64`);
    });
  }

  it.each([
    ['issue after reservation', { sourceProofIssuedAtNativeHeight: 3 }],
    ['reservation at expiry', { reservedAtNativeHeight: 3 }],
    ['reservation after expiry', { reservedAtNativeHeight: 4 }],
    ['expiry at reservation', { expiresAtNativeHeight: 2 }],
    ['expiry before reservation', { expiresAtNativeHeight: 1 }],
  ])('rejects %s', (_label, change) => {
    expect(() => encode({ ...fixture(), sourceProofIssuedAtNativeHeight: 1,
      reservedAtNativeHeight: 2, expiresAtNativeHeight: 3, ...change })).toThrow('issue <= reserved < expiry');
  });

  for (const field of fields) {
    it(`rejects missing own field ${field}`, () => {
      const input: Record<string, unknown> = { ...fixture() };
      delete input[field];
      expect(() => uncheckedEncode(input)).toThrow(/own-data/);
    });
    it(`rejects accessor ${field} without invoking it`, () => {
      const getter = vi.fn(() => { throw new Error('getter must not run'); });
      const input = Object.defineProperty(fixture(), field, { enumerable: true, get: getter });
      expect(() => encode(input)).toThrow(/own-data/);
      expect(getter).not.toHaveBeenCalled();
    });
    it(`rejects nonenumerable ${field}`, () => {
      const input = Object.defineProperty(fixture(), field, { enumerable: false });
      expect(() => encode(input)).toThrow(/own-data/);
    });
  }

  it.each([null, undefined, [], 'record', 1, () => fixture()])('rejects non-record input %s', value => {
    expect(() => uncheckedEncode(value)).toThrow(/own-data/);
  });
  it('rejects inherited fields and custom prototypes', () => {
    expect(() => uncheckedEncode(Object.create(fixture()))).toThrow(/own-data/);
    expect(() => uncheckedEncode(Object.assign(Object.create({}), fixture()))).toThrow(/own-data/);
  });
  it.each(['extra', 'nonenumerable extra', 'symbol'])('rejects %s fields', kind => {
    const input = Object.defineProperty(fixture(), kind === 'symbol' ? Symbol('extra') : 'extra',
      { value: true, enumerable: kind !== 'nonenumerable extra' });
    expect(() => encode(input)).toThrow(/own-data/);
  });
});
