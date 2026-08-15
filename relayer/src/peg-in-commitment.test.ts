import { describe, expect, it } from 'vitest';

import { encodeCollByteRegister, encodeLongRegister, MINER_FEE, MINER_FEE_TREE } from './ergo-helpers.js';
import { buildPegInCommitmentTx, type BoxLike } from './peg-in-commitment.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

const vaultErgoTreeHex = '100204a00b08cd';
const depositorErgoTreeHex = '0008cd02' + '33'.repeat(32);
const targetH160Hex = '44'.repeat(20);

function box(boxId: string, value: BoxLike['value'], assets: BoxLike['assets'] = []): BoxLike {
  return {
    boxId,
    value,
    ergoTree: depositorErgoTreeHex,
    assets,
    additionalRegisters: {},
    creationHeight: 330_000,
  };
}

function build(overrides: Partial<Parameters<typeof buildPegInCommitmentTx>[0]> = {}) {
  return buildPegInCommitmentTx({
    assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
    depositBox: box('11'.repeat(32), 5_000_000),
    feeBox: box('22'.repeat(32), MINER_FEE),
    vaultErgoTreeHex,
    targetH160Hex,
    depositorErgoTreeHex,
    creationHeight: 330_100,
    ...overrides,
  });
}

describe('peg-in commitment transaction planner', () => {
  it('builds a balanced unsigned commitment with value and identity bindings', () => {
    const tx = build();

    expect(tx.inputs).toEqual([
      { boxId: '11'.repeat(32), extension: {} },
      { boxId: '22'.repeat(32), extension: {} },
    ]);
    expect(tx.dataInputs).toEqual([]);
    expect(tx.outputs).toEqual([
      {
        value: 5_000_000,
        ergoTree: vaultErgoTreeHex,
        assets: [],
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from('11'.repeat(32), 'hex')),
          R5: encodeCollByteRegister(Buffer.from(targetH160Hex, 'hex')),
          R6: encodeLongRegister(5_000_000),
          R7: encodeCollByteRegister(Buffer.from(depositorErgoTreeHex, 'hex')),
        },
        creationHeight: 330_100,
      },
      {
        value: MINER_FEE,
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 330_100,
      },
    ]);
  });

  it('returns fee-only change to the fee input ErgoTree before the miner fee', () => {
    const tx = build({ feeBox: box('22'.repeat(32), 2_100_000) });

    expect(tx.outputs).toHaveLength(3);
    expect(tx.outputs[1]).toMatchObject({
      value: 1_000_000,
      ergoTree: depositorErgoTreeHex,
      assets: [],
      additionalRegisters: {},
    });
    expect(tx.outputs[2]).toMatchObject({ value: MINER_FEE, ergoTree: MINER_FEE_TREE });
  });

  it('absorbs fee dust into the miner fee instead of creating an invalid change box', () => {
    const tx = build({ feeBox: box('22'.repeat(32), MINER_FEE + 999_999) });

    expect(tx.outputs).toHaveLength(2);
    expect(tx.outputs[1]).toMatchObject({
      value: MINER_FEE + 999_999,
      ergoTree: MINER_FEE_TREE,
    });
  });

  it('rejects a token-bearing deposit', () => {
    expect(() => build({
      depositBox: box('11'.repeat(32), 5_000_000, [{ tokenId: 'aa'.repeat(32), amount: 1 }]),
    })).toThrow('depositBox must be pure ERG');
  });

  it('rejects any asset profile other than the static native-ERG V1 profile', () => {
    expect(() => build({
      assetProfileId: 'e2s.substrate-grandpa-v1.asset.token.v1',
    })).toThrow('unsupported Substrate/GRANDPA V1 asset profile');
  });

  it.each([
    ['deposit box ID', { depositBox: box('11'.repeat(31), 5_000_000) }, /depositBox boxId must be 32 bytes/],
    ['target H160', { targetH160Hex: '44'.repeat(19) }, /targetH160 must be 20 bytes/],
    ['depositor ErgoTree', { depositorErgoTreeHex: 'abc' }, /depositorErgoTree must be nonempty even-length hex/],
  ])('rejects an invalid %s', (_label, overrides, expected) => {
    expect(() => build(overrides)).toThrow(expected);
  });

  it('rejects using the same box as the deposit and fee input', () => {
    expect(() => build({ feeBox: box('11'.repeat(32), MINER_FEE) }))
      .toThrow('depositBox and feeBox must be distinct');
  });

  it('rejects a fee input that cannot fund the miner fee', () => {
    expect(() => build({ feeBox: box('22'.repeat(32), MINER_FEE - 1) }))
      .toThrow('feeBox value');
  });

  it('rejects unsafe deposit and fee values', () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    expect(() => build({ depositBox: box('11'.repeat(32), unsafe) }))
      .toThrow('depositBox value is outside JavaScript safe integer range');
    expect(() => build({ feeBox: box('22'.repeat(32), unsafe) }))
      .toThrow('feeBox value is outside JavaScript safe integer range');
  });
});
