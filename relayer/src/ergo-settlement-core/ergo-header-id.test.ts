import { describe, expect, it } from 'vitest';

import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
  serializeErgoHeaderWithoutPow,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const GENERATOR =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

const MAINNET_HEIGHT_1: ErgoHeaderIdentityFields = {
  version: 1,
  parentId: hex('00'.repeat(32)),
  adProofsRoot:
    hex('766ab7a313cd2fb66d135b0be6662aa02dfa8e5b17342c05a04396268df0bfbb'),
  stateRoot:
    hex('18b7a08878f2a7ee4389c5a1cece1e2724abe8b8adc8916240dd1bcac069177303'),
  transactionsRoot:
    hex('93fb06aa44413ff57ac878fda9377207d5db0e78833556b331b4d9727b3153ba'),
  timestamp: 1_561_978_977_137n,
  nBits: 100_734_821,
  height: 1,
  extensionHash:
    hex('0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'),
  votes: hex('000000'),
  powSolution: {
    publicKey:
      hex('03be7ad70c74f691345cbedba19f4844e7fc514e1188a7929f5ae261d5bb00bb66'),
    oneTimePublicKey:
      hex('02da9385ac99014ddcffe88d2ac5f28ce817cd615f270a0a5eae58acfb9fd9f6a0'),
    nonce: hex('000000030151dc63'),
    distance:
      46_909_460_813_884_299_753_486_408_728_361_968_139_945_651_324_239_558_400_157_099_627n,
  },
};

const MAINNET_HEIGHT_1_839_567: ErgoHeaderIdentityFields = {
  version: 4,
  parentId:
    hex('060b87d1cd5b7c805a7a002befec355e2d617ff7a8593ce387b8600d1d378add'),
  adProofsRoot:
    hex('957670ed1d61bf929e8a0517a90c7865b064d58327004b1d6cb6435cd39d2f10'),
  stateRoot:
    hex('7e8496f5d58bfeb82fa74c19b59f2a87e6dc506cc8c087a040c08a122c006fa21a'),
  transactionsRoot:
    hex('d7237d7150e6544d7cefa5577bc950a482cc14c577f9d0ec77e4f2da96a95489'),
  timestamp: 1_785_320_024_508n,
  nBits: 105_084_994,
  height: 1_839_567,
  extensionHash:
    hex('14ebde61c3d53288173e1129e37f05244a21680e5d1ca583fbb8f4df130a099c'),
  votes: hex('000000'),
  powSolution: {
    publicKey:
      hex('0274e729bb6615cbda94d9d176a2f1525068f12b330e38bbbf387232797dfd891f'),
    oneTimePublicKey: hex(GENERATOR),
    nonce: hex('001d432a7ce0ea8a'),
    distance: 0n,
  },
};

describe('canonical Ergo header identity', () => {
  it('matches the Ergo mainnet V1 genesis header ID', () => {
    expect(computeErgoHeaderId(MAINNET_HEIGHT_1).toString('hex')).toBe(
      'b0244dfc267baca974a4caee06120321562784303a8a688976ae56170e4d175b',
    );
  });

  it('matches an Ergo mainnet V4 header ID', () => {
    expect(
      computeErgoHeaderId(MAINNET_HEIGHT_1_839_567).toString('hex'),
    ).toBe(
      '599f166598cc7ca483a556c899bcffcdb55fba18eda114aba9624e46059d94d1',
    );
  });

  it('exposes the exact canonical pre-PoW message bytes', () => {
    const full = serializeErgoHeaderIdentity(MAINNET_HEIGHT_1_839_567);
    const withoutPow = serializeErgoHeaderWithoutPow(
      MAINNET_HEIGHT_1_839_567,
    );
    expect(full.subarray(0, withoutPow.length)).toEqual(withoutPow);
    expect(full.subarray(withoutPow.length)).toEqual(Buffer.concat([
      Buffer.from(MAINNET_HEIGHT_1_839_567.powSolution.publicKey),
      Buffer.from(MAINNET_HEIGHT_1_839_567.powSolution.nonce),
    ]));
  });

  it('encodes the Autolykos V1 zero-distance boundary as one zero byte', () => {
    const zeroDistance = {
      ...MAINNET_HEIGHT_1,
      powSolution: {
        ...MAINNET_HEIGHT_1.powSolution,
        distance: 0n,
      },
    };
    const bytes = serializeErgoHeaderIdentity(zeroDistance);
    expect(bytes.subarray(-2)).toEqual(hex('0100'));
    expect(computeErgoHeaderId(zeroDistance).toString('hex')).toBe(
      '5301d7258bd35a1da9e4825efda33c77c981a6b2283ca5802c00c929b0a04721',
    );
  });

  it('changes the ID when the transaction root changes', () => {
    expect(computeErgoHeaderId({
      ...MAINNET_HEIGHT_1_839_567,
      transactionsRoot: hex('ff'.repeat(32)),
    })).not.toEqual(computeErgoHeaderId(MAINNET_HEIGHT_1_839_567));
  });

  it('does not mutate caller-owned bytes', () => {
    const parentId = Buffer.from(MAINNET_HEIGHT_1_839_567.parentId);
    const before = Buffer.from(parentId);
    const bytes = serializeErgoHeaderIdentity({
      ...MAINNET_HEIGHT_1_839_567,
      parentId,
    });
    parentId.fill(0xff);
    expect(bytes.subarray(1, 33)).toEqual(before);
  });

  it('parses the exact supported Autolykos V2 wire shape canonically', () => {
    const bytes = serializeErgoHeaderIdentity(MAINNET_HEIGHT_1_839_567);
    const parsed = parseErgoAutolykosV2HeaderIdentity(bytes);
    expect(serializeErgoHeaderIdentity(parsed)).toEqual(bytes);
    expect(computeErgoHeaderId(parsed)).toEqual(
      computeErgoHeaderId(MAINNET_HEIGHT_1_839_567),
    );
    expect(parsed).toEqual({
      ...MAINNET_HEIGHT_1_839_567,
      unparsedBytes: Buffer.alloc(0),
      powSolution: {
        publicKey: MAINNET_HEIGHT_1_839_567.powSolution.publicKey,
        nonce: MAINNET_HEIGHT_1_839_567.powSolution.nonce,
      },
    });
  });

  it('parses the exact canonical Autolykos V1 wire shape for historical observation', () => {
    const bytes = serializeErgoHeaderIdentity(MAINNET_HEIGHT_1);
    const parsed = parseErgoHeaderIdentity(bytes);
    expect(serializeErgoHeaderIdentity(parsed)).toEqual(bytes);
    expect(computeErgoHeaderId(parsed)).toEqual(
      computeErgoHeaderId(MAINNET_HEIGHT_1),
    );
    expect(parsed).toEqual({
      ...MAINNET_HEIGHT_1,
      unparsedBytes: Buffer.alloc(0),
    });
  });

  it('rejects truncated, trailing, legacy, and non-canonical header bytes', () => {
    const bytes = serializeErgoHeaderIdentity(MAINNET_HEIGHT_1_839_567);
    expect(() => parseErgoAutolykosV2HeaderIdentity(bytes.subarray(0, -1)))
      .toThrow(/boundary/);
    expect(() => parseErgoAutolykosV2HeaderIdentity(Buffer.concat([
      bytes,
      Buffer.from([0]),
    ]))).toThrow(/trailing/);
    expect(() => parseErgoAutolykosV2HeaderIdentity(
      serializeErgoHeaderIdentity(MAINNET_HEIGHT_1),
    )).toThrow(/version 2 to 4/);
    expect(() => parseErgoHeaderIdentity(Buffer.from([0])))
      .toThrow(/version 1 to 4/);

    const timestampOffset = 1 + 32 + 32 + 32 + 33;
    let timestampEnd = timestampOffset;
    while ((bytes[timestampEnd]! & 0x80) !== 0) timestampEnd += 1;
    const nonCanonicalTimestamp = Buffer.concat([
      bytes.subarray(0, timestampEnd),
      Buffer.from([bytes[timestampEnd]! | 0x80, 0]),
      bytes.subarray(timestampEnd + 1),
    ]);
    expect(() => parseErgoAutolykosV2HeaderIdentity(nonCanonicalTimestamp))
      .toThrow(/non-canonical unsigned VLQ/);
  });

  it('rejects malformed fields and unsupported early unparsed bytes', () => {
    expect(() => computeErgoHeaderId({
      ...MAINNET_HEIGHT_1_839_567,
      stateRoot: hex('00'.repeat(32)),
    })).toThrow(/state root/);
    expect(() => computeErgoHeaderId({
      ...MAINNET_HEIGHT_1_839_567,
      unparsedBytes: hex('01'),
    })).toThrow(/empty through block version 4/);
    expect(() => computeErgoHeaderId({
      ...MAINNET_HEIGHT_1,
      powSolution: {
        ...MAINNET_HEIGHT_1.powSolution,
        oneTimePublicKey: undefined,
      },
    })).toThrow(/one-time public key/);
  });
});

function hex(value: string): Buffer {
  return Buffer.from(value, 'hex');
}
