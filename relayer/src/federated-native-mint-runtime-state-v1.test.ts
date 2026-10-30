import { encodeRlp } from 'ethers';
import { describe, expect, it, vi } from 'vitest';

import {
  encodeFederatedNativeMintConsumedV4ScaleHex as consumed,
  encodeFederatedNativeMintExtrinsicV1Hex as extrinsic,
  FEDERATED_NATIVE_MINT_CONSUMED_V4_BYTES,
  MAX_FEDERATED_LEGACY_ETHEREUM_RAW_V1_BYTES,
  type FederatedNativeMintConsumedV4,
} from './federated-native-mint-runtime-state-v1.js';

// Source baseline 11cc15a560fe51e81e924272869aca072f013b59:
// 0001-bridge-runtime-commitment.patch:50708 (consumed), :52526/:52554 (runtime call).
// ethereum 3be0d8fd4c2ad1ba216b69ef65b9382612efc8ba:
// src/transaction/legacy.rs:15,82,150,177 (action, signature, Encode, field order), mod.rs:115.
// impl-codec 0.7.0 src/lib.rs:18,43 (U256 little endian versus raw H256 bytes).
// SDK bbc435c7667d3283ba280a8fec44676357392753:
// substrate/primitives/runtime/src/generic/unchecked_extrinsic.rs:48,291,449 (v5 bare, compact length).
// These are hand-derived layout fixtures, not a Rust execution differential. No key material.
const hash = (byte: string) => `0x${byte.repeat(32)}`;
const fixture = (): FederatedNativeMintConsumedV4 => ({
  profileIdHex: hash('11'), statementIdHex: hash('22'), mintIdentityHex: hash('33'),
  consumedAtNativeHeight: 0x0102030405060708n,
  executionBlockHashHex: hash('44'), transactionHashHex: hash('55'), eventIndex: 0x11223344,
});
const hashOffsets = [
  ['profileIdHex', 1, 33], ['statementIdHex', 33, 65], ['mintIdentityHex', 65, 97],
  ['executionBlockHashHex', 105, 137], ['transactionHashHex', 137, 169],
] as const;
const uncheckedConsumed = (value: unknown) => consumed(value as FederatedNativeMintConsumedV4);
const uncheckedExtrinsic = (value: unknown) => extrinsic(value as string);

describe('pure consumed V4 SCALE bytes', () => {
  it('matches all 173 bytes, no vector prefix, deterministic and nonmutating', () => {
    const input = Object.freeze(fixture());
    const expected = `0x04${'11'.repeat(32)}${'22'.repeat(32)}${'33'.repeat(32)}`
      + `0807060504030201${'44'.repeat(32)}${'55'.repeat(32)}44332211`;
    expect(consumed(input)).toBe(expected);
    expect(consumed(input)).toBe(expected);
    expect(input).toEqual(fixture());
    const bytes = Buffer.from(expected.slice(2), 'hex');
    expect(bytes.length).toBe(FEDERATED_NATIVE_MINT_CONSUMED_V4_BYTES);
    for (const [field, start, end] of hashOffsets) {
      expect(bytes.subarray(start, end).toString('hex')).toBe(input[field].slice(2));
    }
  });

  it('accepts exact zero/max unsigned bounds and equivalent canonical number forms', () => {
    for (const [height, index] of [[0n, 0n], [(1n << 64n) - 1n, (1n << 32n) - 1n]]) {
      const bytes = Buffer.from(consumed({ ...fixture(), consumedAtNativeHeight: height,
        eventIndex: index }).slice(2), 'hex');
      expect(bytes.readBigUInt64LE(97)).toBe(height);
      expect(bytes.readUInt32LE(169)).toBe(Number(index));
    }
    expect(consumed({ ...fixture(), consumedAtNativeHeight: 2, eventIndex: '3' }))
      .toBe(consumed({ ...fixture(), consumedAtNativeHeight: '2', eventIndex: 3n }));
  });

  it('accepts own-data null-prototype input independent of insertion order', () => {
    expect(consumed(Object.assign(Object.create(null),
      Object.fromEntries(Object.entries(fixture()).reverse())))).toBe(consumed(fixture()));
  });

  for (const [field] of hashOffsets) {
    it.each([
      ['zero', hash('00')], ['short', `0x${'ab'.repeat(31)}`], ['long', `${hash('ab')}00`],
      ['uppercase', hash('AB')], ['unprefixed', 'ab'.repeat(32)], ['odd', `${hash('ab')}a`],
      ['nonhex', hash('zz')], ['newline', `${hash('ab')}\n`], ['null', null], ['object', {}],
    ])(`rejects ${field}: %s independently`, (_label, value) => {
      expect(() => uncheckedConsumed({ ...fixture(), [field]: value })).toThrow(field);
    });
  }
  for (const [field, bits] of [['consumedAtNativeHeight', 64], ['eventIndex', 32]] as const) {
    it.each([
      ['negative', -1n], ['negative zero', -0], ['overflow', 1n << BigInt(bits)],
      ['unsafe number', Number.MAX_SAFE_INTEGER + 1], ['fraction', 1.5], ['NaN', NaN],
      ['infinity', Infinity], ['null', null], ['boolean', true], ['object', { valueOf: () => 1n }],
      ['leading zero', '01'], ['positive sign', '+1'], ['hex', '0x1'], ['empty', ''],
      ['newline', '1\n'], ['whitespace', ' 1'], ['decimal', '1.0'], ['huge', '1'.repeat(21)],
    ])(`rejects ${field}: %s independently`, (_label, value) => {
      expect(() => uncheckedConsumed({ ...fixture(), [field]: value })).toThrow(field);
    });
  }
  for (const field of Object.keys(fixture())) {
    it(`rejects missing, inherited, hidden and accessor ${field} without invoking the accessor`, () => {
      const missing: Record<string, unknown> = { ...fixture() };
      delete missing[field];
      expect(() => uncheckedConsumed(missing)).toThrow(/own-data/);
      expect(() => uncheckedConsumed(Object.assign(Object.create({ [field]: fixture()[field as keyof FederatedNativeMintConsumedV4] }), missing)))
        .toThrow(/own-data/);
      expect(() => consumed(Object.defineProperty(fixture(), field, { enumerable: false }))).toThrow(/own-data/);
      const getter = vi.fn(() => { throw new Error('must not invoke'); });
      expect(() => consumed(Object.defineProperty(fixture(), field, { enumerable: true, get: getter })))
        .toThrow(/own-data/);
      expect(getter).not.toHaveBeenCalled();
    });
  }
  it.each([null, undefined, [], 'record', 1, () => fixture()])('rejects non-record %s', value => {
    expect(() => uncheckedConsumed(value)).toThrow(/own-data/);
  });
  it.each(['extra', 'hidden', 'symbol', 'formatVersion'])('rejects extra %s', kind => {
    const input = Object.defineProperty(fixture(), kind === 'symbol' ? Symbol() : kind,
      { value: 4, enumerable: kind !== 'hidden' });
    expect(() => consumed(input)).toThrow(/own-data/);
  });
});

const address = '0x101112131415161718191a1b1c1d1e1f20212223';
const legacyFields = () => [
  '0x0102030405060708', '0x1112131415161718', '0x2122232425262728', address,
  '0x3132333435363738', '0xdeadbeef', '0x2147', '0x010203', '0x040506',
];
const rawWith = (index: number, value: string) => {
  const fields = legacyFields(); fields[index] = value; return encodeRlp(fields);
};
const rawGolden = '0xf849880102030405060708881112131415161718882122232425262728'
  + '94101112131415161718191a1b1c1d1e1f2021222388313233343536373884deadbeef8221478301020383040506';
const zeroes = (bytes: number) => '00'.repeat(bytes);

function splitExtrinsic(raw: string) {
  const bytes = Buffer.from(raw.slice(2), 'hex');
  const mode = bytes[0] & 3;
  const prefixBytes = [1, 2, 4][mode];
  const length = mode === 0 ? bytes[0] >>> 2
    : mode === 1 ? bytes.readUInt16LE() >>> 2 : bytes.readUInt32LE() >>> 2;
  expect(length).toBe(bytes.length - prefixBytes);
  return { prefix: bytes.subarray(0, prefixBytes), body: bytes.subarray(prefixBytes) };
}

describe('legacy Ethereum raw bytes to pinned native bare extrinsic', () => {
  it('matches a hand-derived full layout including v5, enum/action tags, endian and EIP-155 v', () => {
    expect(encodeRlp(legacyFields())).toBe(rawGolden);
    const expected = '0x990305070000'
      + '0807060504030201' + zeroes(24)
      + '1817161514131211' + zeroes(24)
      + '2827262524232221' + zeroes(24)
      + '00' + address.slice(2)
      + '3837363534333231' + zeroes(24)
      + '10deadbeef4721000000000000'
      + zeroes(29) + '010203' + zeroes(29) + '040506';
    expect(extrinsic(rawGolden)).toBe(expected);
    expect(extrinsic(rawGolden)).toBe(expected);
    expect(splitExtrinsic(expected).body.length).toBe(230);
    expect(splitExtrinsic(expected).body.subarray(0, 4).toString('hex')).toBe('05070000');
  });

  it('encodes Create and empty input without an address or an option tag', () => {
    const fields = legacyFields(); fields[3] = '0x'; fields[5] = '0x';
    const { body } = splitExtrinsic(extrinsic(encodeRlp(fields)));
    expect(body.length).toBe(206);
    expect(body[100]).toBe(1);
    expect(body.subarray(101, 109).toString('hex')).toBe('3837363534333231');
    expect(body[133]).toBe(0);
    expect(body.subarray(134, 142).toString('hex')).toBe('4721000000000000');
  });

  for (const [index, offset] of [[0, 4], [1, 36], [2, 68], [4, 121]]) {
    it(`preserves full uint256 and zero for field ${index}`, () => {
      expect(splitExtrinsic(extrinsic(rawWith(index, `0x${'ff'.repeat(32)}`))).body.subarray(offset, offset + 32))
        .toEqual(Buffer.alloc(32, 255));
      expect(splitExtrinsic(extrinsic(rawWith(index, '0x'))).body.subarray(offset, offset + 32))
        .toEqual(Buffer.alloc(32));
    });
  }

  it.each(['0x1b', '0x1c', '0x25', '0x26', '0x2147', '0x2148', '0xffffffffffffffff'])
    ('preserves raw recovery v %s without substituting parity or chain ID', value => {
      const { body } = splitExtrinsic(extrinsic(rawWith(6, value)));
      expect(body.readBigUInt64LE(158)).toBe(BigInt(value));
    });

  it('preserves signature H256 order and the full crate scalar range, including high-s', () => {
    const nMinusOne = '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';
    for (const index of [7, 8]) {
      const offset = index === 7 ? 166 : 198;
      const { body } = splitExtrinsic(extrinsic(rawWith(index, nMinusOne)));
      expect(body.subarray(offset, offset + 32).toString('hex')).toBe(nMinusOne.slice(2));
      expect(splitExtrinsic(extrinsic(rawWith(index, '0x01'))).body[offset + 31]).toBe(1);
    }
  });

  it.each([[0, '00'], [63, 'fc'], [64, '0101'], [16383, 'fdff'], [16384, '02000100']])
    ('encodes input compact length %i', (length, prefix) => {
      const data = 'ab'.repeat(Number(length));
      const { body } = splitExtrinsic(extrinsic(rawWith(5, `0x${data}`)));
      expect(body.subarray(153, 153 + String(prefix).length / 2).toString('hex')).toBe(prefix);
      const dataOffset = 153 + String(prefix).length / 2;
      expect(body.subarray(dataOffset, dataOffset + Number(length)).toString('hex')).toBe(data);
      expect(body.subarray(dataOffset + Number(length), dataOffset + Number(length) + 8).toString('hex'))
        .toBe('4721000000000000');
    });

  it.each([[16156, 'fdff'], [16157, '02000100']])('encodes outer compact boundary at input %i', (length, prefix) => {
    expect(splitExtrinsic(extrinsic(rawWith(5, `0x${'ab'.repeat(Number(length))}`))).prefix.toString('hex')).toBe(prefix);
  });

  it('accepts exactly the raw-byte bound and rejects one byte over it', () => {
    const raw = rawWith(5, `0x${'ab'.repeat(65462)}`);
    expect((raw.length - 2) / 2).toBe(MAX_FEDERATED_LEGACY_ETHEREUM_RAW_V1_BYTES);
    expect(() => extrinsic(raw)).not.toThrow();
    expect(() => extrinsic(rawWith(5, `0x${'ab'.repeat(65463)}`))).toThrow(/bounded/);
  });

  for (const [index, label, width] of [[0, 'nonce', 32], [1, 'gasPrice', 32], [2, 'gasLimit', 32],
    [4, 'value', 32], [6, 'v', 8], [7, 'r', 32], [8, 's', 32]] as const) {
    it.each(['0x00', '0x0001', `0x01${'00'.repeat(width)}`])(`rejects noncanonical/overflow ${label}: %s`, value => {
      expect(() => extrinsic(rawWith(index, value))).toThrow(label);
    });
  }
  it.each(['0x', '0x01', '0x1a', '0x1d', '0x23', '0x24'])('rejects invalid v %s', value => {
    expect(() => extrinsic(rawWith(6, value))).toThrow(/v is invalid/);
  });
  for (const [index, label] of [[7, 'r'], [8, 's']] as const) {
    it.each(['0x', '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      `0x${'ff'.repeat(32)}`])(`rejects invalid ${label} %s`, value => {
      expect(() => extrinsic(rawWith(index, value))).toThrow(`${label} is invalid`);
    });
  }
  it.each([1, 19, 21, 32])('rejects action address of %i bytes', size => {
    expect(() => extrinsic(rawWith(3, `0x${'ab'.repeat(size)}`))).toThrow(/action/);
  });
  for (let index = 0; index < 9; index++) {
    it(`rejects nested field ${index}`, () => {
      const fields: (string | string[])[] = legacyFields(); fields[index] = ['0x01'];
      expect(() => extrinsic(encodeRlp(fields))).toThrow(/nine RLP byte fields/);
    });
  }
  it.each([6, 8, 10])('rejects %i fields, including unsigned legacy', size => {
    const fields = legacyFields();
    expect(() => extrinsic(encodeRlp(size < 9 ? fields.slice(0, size) : [...fields, '0x']))).toThrow(/nine/);
  });
  it.each([
    ['trailing bytes', `${rawGolden}00`], ['truncation', rawGolden.slice(0, -2)],
    ['typed 1', `0x01${rawGolden.slice(2)}`], ['typed 2', `0x02${rawGolden.slice(2)}`],
    ['nonminimal list length', '0xf8098080808080801b0102'],
    ['nonminimal field', '0xca808080808080811b0102'],
    ['non-list', '0x80'], ['unsigned EIP-155', '0xcb8080808080808221478080'],
  ])('rejects %s', (_label, raw) => { expect(() => extrinsic(raw)).toThrow(); });
  it.each([null, undefined, {}, [], Buffer.from([1]), 1, '0x', rawGolden.toUpperCase(),
    rawGolden.slice(2), `${rawGolden}a`, `${rawGolden}\n`, '0xgg'])('rejects malformed raw input %s', raw => {
    expect(() => uncheckedExtrinsic(raw)).toThrow(/bounded lowercase/);
  });
});
