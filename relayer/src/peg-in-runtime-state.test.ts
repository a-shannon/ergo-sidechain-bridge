import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX,
  PEG_IN_RUNTIME_PROFILE_V1_SCALE_BYTES,
  PEG_IN_RUNTIME_RECORD_V1_SCALE_BYTES,
  assertPegInRuntimeRecordMatchesProfileGenerationV1,
  decodePegInRuntimeProfileV1ScaleHex,
  decodePegInRuntimeRecordV1ScaleHex,
  derivePegInRuntimeRecordKeyV1Hex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
  encodePegInRuntimeProfileV1ScaleHex,
  encodePegInRuntimeRecordV1ScaleHex,
  type PegInRuntimeProfileV1,
  type PegInRuntimeRecordV1,
} from './peg-in-runtime-state.js';

const vector = JSON.parse(
  readFileSync(
    new URL('../test-vectors/peg-in-runtime-state-v1.json', import.meta.url),
    'utf8',
  ),
) as {
  schema: string;
  profile: PegInRuntimeProfileV1;
  record: PegInRuntimeRecordV1;
  expected: {
    recordKeyHex: string;
    currentProfileStorageKeyHex: string;
    processedPegInStorageKeyHex: string;
    profileScaleHex: string;
    profileScaleBlake2b256Hex: string;
    recordScaleHex: string;
    recordScaleBlake2b256Hex: string;
  };
};
const { profile, record } = vector;

describe('peg-in runtime state V1', () => {
  it('reproduces the Rust runtime key and SCALE hashes', () => {
    const profileScaleHex = encodePegInRuntimeProfileV1ScaleHex(profile);
    const recordScaleHex = encodePegInRuntimeRecordV1ScaleHex(record);

    expect(vector.schema).toBe('e2s.peg-in-runtime-state-vector.v1');
    expect(hexBytes(profileScaleHex)).toHaveLength(PEG_IN_RUNTIME_PROFILE_V1_SCALE_BYTES);
    expect(hexBytes(recordScaleHex)).toHaveLength(PEG_IN_RUNTIME_RECORD_V1_SCALE_BYTES);
    expect(profileScaleHex).toBe(vector.expected.profileScaleHex);
    expect(recordScaleHex).toBe(vector.expected.recordScaleHex);
    expect(decodePegInRuntimeProfileV1ScaleHex(profileScaleHex)).toEqual({
      ...profile,
      profileRevision: String(profile.profileRevision),
      activationHeight: String(profile.activationHeight),
    });
    expect(decodePegInRuntimeRecordV1ScaleHex(recordScaleHex)).toEqual({
      ...record,
      profileRevision: String(record.profileRevision),
      profileActivationHeight: String(record.profileActivationHeight),
      amountNanoErg: String(record.amountNanoErg),
      sidechainHeight: String(record.sidechainHeight),
    });
    expect(blake2b256Hex(profileScaleHex)).toBe(vector.expected.profileScaleBlake2b256Hex);
    expect(blake2b256Hex(recordScaleHex)).toBe(vector.expected.recordScaleBlake2b256Hex);
    expect(derivePegInRuntimeRecordKeyV1Hex(record)).toBe(vector.expected.recordKeyHex);
    expect(PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX).toBe(
      vector.expected.currentProfileStorageKeyHex,
    );
    expect(PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX).toBe(
      vector.expected.processedPegInStorageKeyHex.slice(0, 66),
    );
    expect(deriveProcessedPegInRuntimeStorageKeyV1Hex(record)).toBe(
      vector.expected.processedPegInStorageKeyHex,
    );
    expect(hexBytes(vector.expected.processedPegInStorageKeyHex)).toHaveLength(80);
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(record, profile),
    ).not.toThrow();
  });

  it('keeps replay identity stable across profile and address rotations and binds chain and box', () => {
    const baseline = derivePegInRuntimeRecordKeyV1Hex(record);
    expect(
      derivePegInRuntimeRecordKeyV1Hex({
        ...record,
        sidechainIdHex: `0x${'12'.repeat(32)}`,
      }),
    ).not.toBe(baseline);
    const migratedAddressRecord = {
      ...record,
      bridgeAddress: `0x${'ab'.repeat(20)}`,
    } satisfies PegInRuntimeRecordV1;
    expect(derivePegInRuntimeRecordKeyV1Hex(migratedAddressRecord)).toBe(baseline);
    expect(
      derivePegInRuntimeRecordKeyV1Hex({
        ...record,
        ergoBoxIdHex: `0x${'56'.repeat(32)}`,
      }),
    ).not.toBe(baseline);

    const rotated = {
      ...record,
      profileRevision: 9,
      profileActivationHeight: 900,
    } satisfies PegInRuntimeRecordV1;
    expect(derivePegInRuntimeRecordKeyV1Hex(rotated)).toBe(baseline);
    expect(encodePegInRuntimeRecordV1ScaleHex(rotated)).not.toBe(
      encodePegInRuntimeRecordV1ScaleHex(record),
    );
  });

  it('rejects profile drift and records at or before activation independently', () => {
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, sidechainIdHex: `0x${'12'.repeat(32)}` },
        profile,
      ),
    ).toThrow('sidechain ID does not match');
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, bridgeAddress: `0x${'ab'.repeat(20)}` },
        profile,
      ),
    ).toThrow('bridge address does not match');
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, profileRevision: 8 },
        profile,
      ),
    ).toThrow('revision does not match');
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, profileActivationHeight: 999 },
        profile,
      ),
    ).toThrow('activation height does not match');
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, sidechainHeight: 999 },
        profile,
      ),
    ).toThrow('does not follow its profile activation block');
    expect(() =>
      assertPegInRuntimeRecordMatchesProfileGenerationV1(
        { ...record, sidechainHeight: 1_000 },
        profile,
      ),
    ).toThrow('does not follow its profile activation block');
  });

  it('rejects malformed or out-of-range record fields', () => {
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({ ...record, formatVersion: 2 as 1 }),
    ).toThrow('format version must be exactly 1');
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({ ...record, ergoBoxIdHex: `0x${'00'.repeat(32)}` }),
    ).toThrow('Ergo box ID must not be zero');
    expect(() =>
      derivePegInRuntimeRecordKeyV1Hex({
        ...record,
        ergoBoxIdHex: `0x${'00'.repeat(32)}`,
      }),
    ).toThrow('Ergo box ID must not be zero');
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({ ...record, recipientAddress: `0x${'00'.repeat(20)}` }),
    ).toThrow('recipient must not be zero');
    expect(() => encodePegInRuntimeRecordV1ScaleHex({ ...record, amountNanoErg: 0 })).toThrow(
      'amount must be positive',
    );
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({
        ...record,
        executionBlockHashHex: `0x${'00'.repeat(32)}`,
      }),
    ).toThrow('execution block hash must not be zero');
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({
        ...record,
        transactionHashHex: `0x${'00'.repeat(32)}`,
      }),
    ).toThrow('transaction hash must not be zero');
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({ ...record, amountNanoErg: 1n << 64n }),
    ).toThrow('between 0 and');
    expect(() =>
      encodePegInRuntimeRecordV1ScaleHex({ ...record, amountNanoErg: 1n << 63n }),
    ).toThrow('positive Ergo Long range');
    const overflowRecord = hexBytes(vector.expected.recordScaleHex);
    overflowRecord.writeBigUInt64LE(1n << 63n, 121);
    expect(() => decodePegInRuntimeRecordV1ScaleHex(`0x${overflowRecord.toString('hex')}`))
      .toThrow('positive Ergo Long range');
    expect(() => encodePegInRuntimeRecordV1ScaleHex({ ...record, eventIndex: 2 ** 32 })).toThrow(
      'event index must be an integer',
    );
    expect(() =>
      encodePegInRuntimeProfileV1ScaleHex({ ...profile, profileRevision: 0 }),
    ).toThrow('revision must be positive');
    expect(() => decodePegInRuntimeProfileV1ScaleHex(vector.expected.profileScaleHex.slice(2)))
      .toThrow('lowercase 0x-prefixed');
    expect(() => decodePegInRuntimeRecordV1ScaleHex(
      `${vector.expected.recordScaleHex.slice(0, -2)}FF`,
    )).toThrow('lowercase 0x-prefixed');
    expect(() => decodePegInRuntimeRecordV1ScaleHex(
      `0x02${vector.expected.recordScaleHex.slice(4)}`,
    )).toThrow('format version must be exactly 1');
  });
});

function hexBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function blake2b256Hex(value: string): string {
  return `0x${Buffer.from(blakejs.blake2b(hexBytes(value), undefined, 32)).toString('hex')}`;
}
