import { describe, expect, it } from 'vitest';

import {
  admitErgoAutolykosV2Header,
  assertCompressedSecp256k1Point,
  autolykosV2Message,
  autolykosV2TableSize,
  calculateAutolykosV2Hit,
  decodeErgoCompactDifficulty,
  encodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from './ergo-autolykos-v2-header.js';
import type { ErgoHeaderIdentityFields } from './ergo-header-id.js';

const AUTOLYKOS_N_INCREASE_VECTOR: ErgoHeaderIdentityFields = {
  version: 2,
  parentId: hex('ac2101807f0000ca01ff0119db227f202201007f62000177a080005d440896d0'),
  adProofsRoot: hex('5d3f80dcff7f5e7f59007294c180808d0158d1ff6ba10000f901c7f0ef87dcff'),
  stateRoot: hex('5c8c00b8403d3701557181c8df800001b6d5009e2201c6ff807d71808c00019780'),
  transactionsRoot: hex('f17fffacb6ff7f7f1180d2ff7f1e24ffffe1ff937f807f0797b9ff6ebdae007e'),
  timestamp: 4_928_911_477_310_178_288n,
  nBits: 37_748_736,
  height: 614_400,
  extensionHash: hex('1480887f80007f4b01cf7f013ff1ffff564a0000b9a54f00770e807f41ff88c0'),
  votes: hex('000000'),
  powSolution: {
    publicKey: hex('03bedaee069ff4829500b3c07c4d5fe6b3ea3d3bf76c5c28c1d4dcdb1bed0ade0c'),
    nonce: hex('0000000000003105'),
  },
};

const PARENT = {
  headerId: AUTOLYKOS_N_INCREASE_VECTOR.parentId,
  height: AUTOLYKOS_N_INCREASE_VECTOR.height - 1,
  timestamp: AUTOLYKOS_N_INCREASE_VECTOR.timestamp - 1n,
};

describe('Ergo Autolykos V2 header admission', () => {
  it('matches the pinned JVM message, N, hit, target, and valid PoW vector', () => {
    expect(autolykosV2Message(AUTOLYKOS_N_INCREASE_VECTOR).toString('hex')).toBe(
      '548c3e602a8f36f8f2738f5f643b02425038044d98543a51cabaa9785e7e864f',
    );
    expect(autolykosV2TableSize(AUTOLYKOS_N_INCREASE_VECTOR.height)).toBe(
      70_464_240,
    );
    expect(calculateAutolykosV2Hit(AUTOLYKOS_N_INCREASE_VECTOR).toString(16)).toBe(
      '2fcb113fe65e5754959872dfdbffea0489bf830beb4961ddc0e9e66a1412a',
    );
    expect(
      decodeErgoCompactDifficulty(AUTOLYKOS_N_INCREASE_VECTOR.nBits),
    ).toBe(16_384n);

    const admission = admitErgoAutolykosV2Header(
      AUTOLYKOS_N_INCREASE_VECTOR,
      { parent: PARENT, expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits },
    );
    expect(admission.target).toBe(
      7_067_388_259_113_537_318_333_190_002_971_674_063_283_542_741_642_755_394_446_115_914_399_301_849n,
    );
    expect(admission.hit).toBeLessThan(admission.target);
  });

  it('rejects an easy-difficulty header even when its claimed PoW is valid', () => {
    const easyDifficultyHeader = {
      ...AUTOLYKOS_N_INCREASE_VECTOR,
      nBits: encodeErgoCompactDifficulty(1n),
    };
    expect(verifyClaimedAutolykosV2ProofOfWork(easyDifficultyHeader)).toBe(true);
    expect(() => admitErgoAutolykosV2Header(easyDifficultyHeader, {
      parent: PARENT,
      expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits,
    })).toThrow(/expected difficulty/);
  });

  it('rejects broken PoW after the expected-difficulty check passes', () => {
    const invalidNonceHeader = {
      ...AUTOLYKOS_N_INCREASE_VECTOR,
      powSolution: {
        ...AUTOLYKOS_N_INCREASE_VECTOR.powSolution,
        nonce: hex('0000000000003104'),
      },
    };
    expect(verifyClaimedAutolykosV2ProofOfWork(invalidNonceHeader)).toBe(false);
    expect(() => admitErgoAutolykosV2Header(invalidNonceHeader, {
      parent: PARENT,
      expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits,
    })).toThrow(/proof of work/);
  });

  it('rejects parent, height, timestamp, and unsupported-version drift', () => {
    expect(() => admitErgoAutolykosV2Header(
      { ...AUTOLYKOS_N_INCREASE_VECTOR, parentId: hex('00'.repeat(32)) },
      { parent: PARENT, expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits },
    )).toThrow(/expected parent/);
    expect(() => admitErgoAutolykosV2Header(
      { ...AUTOLYKOS_N_INCREASE_VECTOR, height: 614_401 },
      { parent: PARENT, expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits },
    )).toThrow(/parent height plus one/);
    expect(() => admitErgoAutolykosV2Header(
      AUTOLYKOS_N_INCREASE_VECTOR,
      {
        parent: { ...PARENT, timestamp: AUTOLYKOS_N_INCREASE_VECTOR.timestamp },
        expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits,
      },
    )).toThrow(/timestamp/);
    expect(() => admitErgoAutolykosV2Header(
      { ...AUTOLYKOS_N_INCREASE_VECTOR, version: 5 },
      { parent: PARENT, expectedNBits: AUTOLYKOS_N_INCREASE_VECTOR.nBits },
    )).toThrow(/version/);
  });

  it('rejects malformed and off-curve compressed public keys', () => {
    expect(() => assertCompressedSecp256k1Point(hex(`04${'00'.repeat(32)}`)))
      .toThrow(/prefix/);
    expect(() => assertCompressedSecp256k1Point(hex(`02${'00'.repeat(32)}`)))
      .toThrow(/not on the curve/);
    expect(verifyClaimedAutolykosV2ProofOfWork({
      ...AUTOLYKOS_N_INCREASE_VECTOR,
      powSolution: {
        ...AUTOLYKOS_N_INCREASE_VECTOR.powSolution,
        publicKey: hex(`02${'00'.repeat(32)}`),
      },
    })).toBe(false);
  });

  it.each([
    [0x180130e0, '130e0000000000000000000000000000000000000000000'],
    [0x1d00ffff, 'ffff0000000000000000000000000000000000000000000000000000'],
    [0x01003456, '0'],
    [0x01123456, '12'],
    [0x02008000, '80'],
    [0x05009234, '92340000'],
    [0x04923456, '-12345600'],
    [0x04123456, '12345600'],
  ])('matches the JVM compact difficulty vector 0x%s', (nBits, expectedHex) => {
    expect(decodeErgoCompactDifficulty(nBits).toString(16)).toBe(expectedHex);
  });

  it('round-trips representative positive compact difficulties canonically', () => {
    for (const difficulty of [1n, 128n, 16_384n, 1_325_481_984n]) {
      expect(
        decodeErgoCompactDifficulty(encodeErgoCompactDifficulty(difficulty)),
      ).toBe(difficulty);
    }
  });

  it('rejects compact difficulties outside the runtime UInt256 domain', () => {
    expect(() => decodeErgoCompactDifficulty(0x2201_0000))
      .toThrow(/UInt256/);
    expect(() => encodeErgoCompactDifficulty(1n << 256n))
      .toThrow(/UInt256/);
  });

  it('matches every pinned JVM N-growth boundary', () => {
    expect(autolykosV2TableSize(500_000)).toBe(67_108_864);
    expect(autolykosV2TableSize(600_000)).toBe(67_108_864);
    expect(autolykosV2TableSize(600 * 1024)).toBe(70_464_240);
    expect(autolykosV2TableSize(650 * 1024)).toBe(73_987_410);
    expect(autolykosV2TableSize(700_000)).toBe(73_987_410);
    expect(autolykosV2TableSize(788_400)).toBe(81_571_035);
    expect(autolykosV2TableSize(1_051_200)).toBe(104_107_290);
    expect(autolykosV2TableSize(4_198_400)).toBe(2_143_944_600);
    expect(autolykosV2TableSize(41_984_000)).toBe(2_143_944_600);
  });
});

function hex(value: string): Buffer {
  return Buffer.from(value, 'hex');
}
