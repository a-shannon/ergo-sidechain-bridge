import { describe, expect, it } from 'vitest';

import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12UnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const INPUT_BOX = {
  boxId: '1a465b44d875d2be19e8bd34c225150ed5daeeebd43775bfa3eb9f27e80ad1fb',
  value: '1000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 100,
  transactionId: '134c289942382dd34a02d88aeeccfc74796a0b5c3150a8f2f25f65dc3225300c',
  index: 0,
};

function transaction(): Eip12UnsignedTransaction {
  return {
    inputs: [{ ...INPUT_BOX, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: '1000000',
      ergoTree: `0008cd02${'33'.repeat(32)}`,
      assets: [],
      additionalRegisters: {},
      creationHeight: 101,
    }],
  };
}

describe('unsigned Ergo transaction materialization', () => {
  it('accepts only canonical ErgoTree serialization', async () => {
    const tree = `0008cd02${'22'.repeat(32)}`;
    await expect(normalizeErgoTreeHex(tree, 'refund proposition'))
      .resolves.toBe(tree);
    await expect(normalizeErgoTreeHex('ff', 'refund proposition'))
      .rejects.toThrow(/valid ErgoTree|canonically serialized/);
  });

  it('validates complete EIP-12 boxes and derives deterministic transaction/output IDs', async () => {
    await expect(normalizeEip12Box(INPUT_BOX, 'funding box')).resolves.toEqual(INPUT_BOX);
    await expect(normalizeEip12Box({
      ...INPUT_BOX,
      value: 1_000_000,
    }, 'node funding box')).resolves.toEqual(INPUT_BOX);

    const first = await materializeUnsignedTransaction(transaction(), 'offline fixture');
    const second = await materializeUnsignedTransaction(transaction(), 'offline fixture');
    expect(second).toEqual(first);
    expect(first.txId).toMatch(/^[0-9a-f]{64}$/);
    expect(first.outputs).toHaveLength(1);
    expect(first.outputs[0]).toMatchObject({
      transactionId: first.txId,
      index: 0,
      value: '1000000',
      creationHeight: 101,
    });
    expect(first.outputs[0].boxId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects incomplete boxes and runtime amount aliases', async () => {
    await expect(normalizeEip12Box({
      ...INPUT_BOX,
      value: { toString: () => '1000000' },
    }, 'aliased box')).rejects.toThrow(/primitive positive decimal string/);

    await expect(normalizeEip12Box({
      ...INPUT_BOX,
      value: Number.MAX_SAFE_INTEGER + 1,
    }, 'unsafe numeric box')).rejects.toThrow(/positive safe integer/);

    const withoutAssets = { ...INPUT_BOX } as Record<string, unknown>;
    delete withoutAssets.assets;
    await expect(normalizeEip12Box(withoutAssets, 'incomplete box'))
      .rejects.toThrow(/assets must be an array/);

    const withoutRegisters = { ...INPUT_BOX } as Record<string, unknown>;
    delete withoutRegisters.additionalRegisters;
    await expect(normalizeEip12Box(withoutRegisters, 'incomplete box'))
      .rejects.toThrow(/additionalRegisters must be an object/);

    await expect(normalizeEip12Box({
      ...INPUT_BOX,
      assets: [{
        tokenId: '44'.repeat(32),
        amount: { toString: () => '1' },
      }],
    }, 'aliased token box')).rejects.toThrow(
      /primitive positive decimal string/,
    );
  });

  it('rejects forged box IDs, non-positive heights, and unsafe extension counts', async () => {
    await expect(normalizeEip12Box({ ...INPUT_BOX, boxId: 'ff'.repeat(32) }, 'funding box'))
      .rejects.toThrow(/Box id parsed|boxId does not match/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      outputs: [{ ...transaction().outputs[0], creationHeight: 0 }],
    }, 'bad height')).rejects.toThrow(/creationHeight must be a positive/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      inputs: [{
        ...INPUT_BOX,
        extension: {
          '0': '0400',
          '1': '0402',
          '2': '0404',
          '3': '0406',
          '4': '0408',
        },
      }],
    }, 'unsafe extension')).rejects.toThrow(/ContextExtension/i);
  });

  it('snapshots ContextExtension before applying the serialization guard', async () => {
    let reads = 0;
    const input = {
      ...INPUT_BOX,
    } as Record<string, unknown>;
    Object.defineProperty(input, 'extension', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1
          ? {}
          : {
              '0': '0400',
              '1': '0402',
              '2': '0404',
              '3': '0406',
              '4': '0408',
            };
      },
    });
    const tx = transaction();
    const result = await materializeUnsignedTransaction({
      ...tx,
      inputs: [
        input as unknown as Eip12UnsignedTransaction['inputs'][number],
      ],
    }, 'extension snapshot');

    expect(reads).toBe(1);
    expect(result.eip12Tx.inputs[0].extension).toEqual({});
  });

  it('rejects invalid box references and broken ERG or token conservation', async () => {
    await expect(materializeUnsignedTransaction({
      ...transaction(),
      inputs: [
        { ...INPUT_BOX, extension: {} },
        { ...INPUT_BOX, extension: {} },
      ],
      outputs: [{ ...transaction().outputs[0], value: '2000000' }],
    }, 'duplicate inputs')).rejects.toThrow(/duplicate input box IDs/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      dataInputs: [INPUT_BOX],
    }, 'overlap')).rejects.toThrow(/both input and data input/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      outputs: [{ ...transaction().outputs[0], value: '2000000' }],
    }, 'inflation')).rejects.toThrow(/does not conserve ERG value/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      outputs: [{
        ...transaction().outputs[0],
        assets: [{ tokenId: '44'.repeat(32), amount: '1' }],
      }],
    }, 'foreign token mint')).rejects.toThrow(/outside the first-input minting rule/i);

    await expect(materializeUnsignedTransaction({
      ...transaction(),
      outputs: [{
        ...transaction().outputs[0],
        assets: [{ tokenId: INPUT_BOX.boxId, amount: '1' }],
      }],
    }, 'first-input mint')).resolves.toMatchObject({
      outputs: [{ assets: [{ tokenId: INPUT_BOX.boxId, amount: '1' }] }],
    });

    const minted = await materializeUnsignedTransaction({
      ...transaction(),
      outputs: [{
        ...transaction().outputs[0],
        assets: [{ tokenId: INPUT_BOX.boxId, amount: '1' }],
      }],
    }, 'token-bearing fixture');
    await expect(materializeUnsignedTransaction({
      inputs: [{ ...minted.outputs[0], extension: {} }],
      dataInputs: [],
      outputs: [{ ...transaction().outputs[0], creationHeight: 102 }],
    }, 'token destruction')).rejects.toThrow(/must preserve existing token/i);
  });
});
