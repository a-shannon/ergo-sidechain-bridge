import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  buildPegInCausalCommitmentV2Tx,
  buildPegInCausalRefundV2Tx,
} from './peg-in-causal-commitment-v2.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  encodeCollByteRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vector = JSON.parse(readFileSync(
  resolve(__dirname, '../test-vectors/peg-in-causal-admission-v2.json'),
  'utf8',
));

const sourceIntentHex = vector.expected.sourceIntentHex.slice(2);
const sourceNetworkIdHex = vector.sourceIntent.sourceNetworkIdHex.slice(2);
const admissionProfileIdHex = vector.sourceIntent.admissionProfileIdHex.slice(2);
const sourceBoxId = 'aa'.repeat(32);
const feeBoxId = 'bb'.repeat(32);
const sourceTree = `1008cd02${'11'.repeat(32)}`;
const vaultTree = `1008cd02${'22'.repeat(32)}`;
const depositorTree = `0008cd02${'33'.repeat(32)}`;

function sourceIntentWithNonErgAsset(): string {
  const bytes = Buffer.from(sourceIntentHex, 'hex');
  bytes[169] = 1;
  return encodeCollByteRegister(bytes);
}

function sourceIntentRegisterWithAmount(amountNanoErg: string): string {
  const encoded = encodePegInSourceIntentV2Hex({
    ...vector.sourceIntent,
    amountNanoErg,
  });
  return encodeCollByteRegister(Buffer.from(encoded.slice(2), 'hex'));
}

function sourceBox(overrides: Record<string, unknown> = {}): any {
  return {
    boxId: sourceBoxId,
    value: vector.sourceIntent.amountNanoErg,
    ergoTree: sourceTree,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
    },
    creationHeight: 100,
    ...overrides,
  };
}

function feeBox(overrides: Record<string, unknown> = {}): any {
  return {
    boxId: feeBoxId,
    value: MINER_FEE + 1_000_000,
    ergoTree: depositorTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: 100,
    ...overrides,
  };
}

describe('Peg-In Causal Commitment V2 transaction plans', () => {
  it('moves the exact source intent and source box identity into the causal vault', () => {
    const plan = buildPegInCausalCommitmentV2Tx({
      sourceLockBox: sourceBox(),
      feeBox: feeBox(),
      causalVaultErgoTreeHex: vaultTree,
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 200,
    });

    expect(plan.inputs).toEqual([
      { boxId: sourceBoxId, extension: {} },
      { boxId: feeBoxId, extension: {} },
    ]);
    expect(plan.outputs).toEqual([
      {
        value: vector.sourceIntent.amountNanoErg,
        ergoTree: vaultTree,
        assets: [],
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
          R5: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
        },
        creationHeight: 200,
      },
      {
        value: '1000000',
        ergoTree: depositorTree,
        assets: [],
        additionalRegisters: {},
        creationHeight: 200,
      },
      {
        value: String(MINER_FEE),
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 200,
      },
    ]);
  });

  it('returns the exact source value to the depositor on the timeout plan', () => {
    const plan = buildPegInCausalRefundV2Tx({
      sourceLockBox: sourceBox(),
      feeBox: feeBox(),
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 10_101,
    });

    expect(plan.outputs[0]).toEqual({
      value: vector.sourceIntent.amountNanoErg,
      ergoTree: depositorTree,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
      },
      creationHeight: 10_101,
    });
    expect(plan.outputs.at(-1)).toMatchObject({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
    });
  });

  it.each([
    ['wrong source value', { value: String(BigInt(vector.sourceIntent.amountNanoErg) + 1n) }, {}, /must equal source intent amount/],
    ['wrong source tree', { ergoTree: `1008cd02${'99'.repeat(32)}` }, {}, /active causal source profile/],
    ['source token', { assets: [{ tokenId: '44'.repeat(32), amount: 1 }] }, {}, /sourceLockBox must be pure ERG/],
    ['wrong network', {}, { expectedSourceNetworkIdHex: '55'.repeat(32) }, /source network/],
    ['wrong profile', {}, { expectedAdmissionProfileIdHex: '66'.repeat(32) }, /admission profile/],
    ['non-ERG asset', { additionalRegisters: { R4: sourceIntentWithNonErgAsset(), R5: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')) } }, {}, /native ERG zero asset ID/],
    ['missing intent', { additionalRegisters: { R5: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')) } }, {}, /missing R4/],
    ['missing depositor', { additionalRegisters: { R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')) } }, {}, /missing R5/],
    ['fee token', {}, { feeBox: feeBox({ assets: [{ tokenId: '77'.repeat(32), amount: 1 }] }) }, /feeBox must be pure ERG/],
    ['same input', {}, { feeBox: feeBox({ boxId: sourceBoxId }) }, /must be distinct/],
  ])('rejects %s', (_label, sourceOverrides, inputOverrides, error) => {
    expect(() => buildPegInCausalCommitmentV2Tx({
      sourceLockBox: sourceBox(sourceOverrides),
      feeBox: feeBox(),
      causalVaultErgoTreeHex: vaultTree,
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 200,
      ...inputOverrides,
    })).toThrow(error as RegExp);
  });

  it('rejects a refund plan before the exact timeout boundary', () => {
    expect(() => buildPegInCausalRefundV2Tx({
      sourceLockBox: sourceBox(),
      feeBox: feeBox(),
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 10_099,
    })).toThrow(/timeout height 10100/);
  });

  it('rejects a refund source outside the active causal source ErgoTree', () => {
    expect(() => buildPegInCausalRefundV2Tx({
      sourceLockBox: sourceBox({ ergoTree: `1008cd02${'98'.repeat(32)}` }),
      feeBox: feeBox(),
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 10_101,
    })).toThrow(/active causal source profile/);
  });

  it('rejects commitment at or after the refund timeout boundary', () => {
    expect(() => buildPegInCausalCommitmentV2Tx({
      sourceLockBox: sourceBox(),
      feeBox: feeBox(),
      causalVaultErgoTreeHex: vaultTree,
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 10_100,
    })).toThrow(/at or after timeout height 10100/);
  });

  it('preserves exact nanoERG values above the JavaScript safe-integer range', () => {
    const amount = '9007199254740993';
    const plan = buildPegInCausalCommitmentV2Tx({
      sourceLockBox: sourceBox({
        value: amount,
        additionalRegisters: {
          R4: sourceIntentRegisterWithAmount(amount),
          R5: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
        },
      }),
      feeBox: feeBox(),
      causalVaultErgoTreeHex: vaultTree,
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 200,
    });

    expect(plan.outputs[0].value).toBe(amount);
  });

  it('rejects source values outside the positive Ergo Long range', () => {
    const amount = '9223372036854775808';
    expect(() => buildPegInCausalCommitmentV2Tx({
      sourceLockBox: sourceBox({
        value: amount,
        additionalRegisters: {
          R4: sourceIntentRegisterWithAmount(amount),
          R5: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
        },
      }),
      feeBox: feeBox(),
      causalVaultErgoTreeHex: vaultTree,
      expectedSourceLockErgoTreeHex: sourceTree,
      expectedSourceNetworkIdHex: sourceNetworkIdHex,
      expectedAdmissionProfileIdHex: admissionProfileIdHex,
      creationHeight: 200,
    })).toThrow(/positive Ergo Long range/);
  });
});
