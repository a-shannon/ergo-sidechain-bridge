import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
} from '../frontier-ergo-autolykos-committed-vault-source-proof-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from '../unsigned-ergo-transaction.js';
import {
  computeErgoBlockTransactionsRoot,
  computeErgoTransactionWitnessId,
} from './ergo-block-transactions-root.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  computeErgoScorexTransactionRuntimeParserProfileIdV1Hex,
  decodeErgoScorexTransactionRuntimeWitnessV1,
  deriveErgoScorexTransactionRuntimeWitnessIdV1Hex,
  encodeErgoScorexTransactionRuntimeWitnessV1,
  ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
  type ErgoScorexTransactionRuntimeParserProfileV1,
  type ErgoScorexTransactionRuntimeWitnessInputV1,
} from './ergo-scorex-transaction-runtime-witness-v1.js';

const SOURCE_AMOUNT = 100_000_000n;
const SOURCE_LOCK_TREE = `0008cd02${'22'.repeat(32)}`;
const VAULT_TREE = `0008cd02${'11'.repeat(32)}`;
const RECIPIENT_H160 = '44'.repeat(20);
const DEPOSITOR_TREE = `0008cd02${'33'.repeat(32)}`;
const GENERATOR = Buffer.from(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'hex',
);
const GOLDEN_WITNESS_HEX = readFileSync(new URL(
  '../../test-vectors/ergo-scorex-transaction-runtime-witness-v1.hex',
  import.meta.url,
), 'utf8').trim();
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: SOURCE_LOCK_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface Fixture {
  readonly profile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly input: ErgoScorexTransactionRuntimeWitnessInputV1;
  readonly transaction: MaterializedUnsignedTransaction;
  readonly signedBytes: Buffer;
  readonly expectedTransactionsRootHex: string;
}

let fixture: Fixture;

beforeAll(async () => {
  fixture = await buildFixture();
});

describe('Ergo Scorex transaction runtime witness V1', () => {
  it('reconstructs the exact bounded Scorex transaction and source/vault identities', () => {
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input);
    const decoded = decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded,
      fixture.profile,
    );

    expect(decoded).toMatchObject({
      status: 'NON_AUTHORIZING_SCOREX_TRANSACTION_WITNESS_VERIFIED',
      formatFamilyIdHex:
        ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
      parserProfileIdHex:
        computeErgoScorexTransactionRuntimeParserProfileIdV1Hex(fixture.profile),
      routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
      assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
      blockVersion: 4,
      transactionIndex: 0,
      transactionCount: 1,
      transactionIdHex:
        'f4540c518ecba96efa9fb2aa658381ea01c865a13cfb94bb667c10c1cc6d1562',
      signedTransactionLength: 257,
      signedTransactionSha256Hex:
        '40437da636142d44f798af3a0e1d16dc3e2d76688916ace4d13db4a3725735e5',
      transactionWitnessLeafIdHex:
        '5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8',
      targetTransactionsRootHex:
        '60de6bd37e625419e282a58b95d82a2103aa460422a4f9be38f93ca706fbd045',
      source: {
        boxIdHex:
          '987ee35df12f3754ad68364ed454ce581bad419a51d16a916728230cbaf11d78',
        serializedBytesLength: 176,
        inputIndex: 0,
        valueNanoErg: SOURCE_AMOUNT.toString(),
        recipientH160Hex: RECIPIENT_H160,
        signerPublicKeyHex: GENERATOR.toString('hex'),
        depositorErgoTreeHex: DEPOSITOR_TREE,
      },
      vault: {
        boxIdHex:
          '4f78935151aad7a1a99af76b60a984ce11d3c2cc76a083cbdf64e5c479323bf6',
        outputIndex: 0,
        valueNanoErg: SOURCE_AMOUNT.toString(),
      },
      authority: {
        transactionExecutionValidated: false,
        currentUtxoMembershipEstablished: false,
        globallyCanonicalErgoConsensusAccepted: false,
        runtimeAdmissionAuthorized: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(Buffer.from(decoded.signedTransactionBytesHex, 'hex'))
      .toEqual(fixture.signedBytes);
    expect(decoded.bytesToSignHex).toBe(decoded.signedTransactionBytesHex);
    expect(decoded.targetTransactionsRootHex).toBe(
      fixture.expectedTransactionsRootHex,
    );
    expect(encoded.length).toBe(826);
    expect(encoded.toString('hex')).toBe(GOLDEN_WITNESS_HEX);
    expect(sha256(encoded)).toBe(
      '4ae6cd56915f0c23d3e1394c2d391d23f9b97a3318621e156a43945f8ec2e0d3',
    );
    expect(deriveErgoScorexTransactionRuntimeWitnessIdV1Hex(
      encoded,
      fixture.profile,
    )).toBe(
      'b4a285454e8d0595c2e7e2986c7d8a9abe9e61707a5153940491a765036195f4',
    );
  });

  it('does not mutate caller-owned inputs while encoding or decoding', () => {
    const input = clone(fixture.input);
    const snapshot = clone(input);
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(input);
    const encodedSnapshot = Buffer.from(encoded);

    decodeErgoScorexTransactionRuntimeWitnessV1(encoded, fixture.profile);

    expect(input).toEqual(snapshot);
    expect(encoded).toEqual(encodedSnapshot);
  });

  it('removes proof payloads only from bytes-to-sign and rebinds the witness leaf', async () => {
    const input = clone(fixture.input) as MutableWitness;
    input.inputs[0]!.proofHex = 'aabbcc';
    const transactionId = Buffer.from(fixture.transaction.txId, 'hex');
    const witnessLeafId = computeErgoTransactionWitnessId([
      Buffer.from('aabbcc', 'hex'),
      Buffer.alloc(0),
    ]);
    input.transactionMerkleSiblingsHex[0] = scorexLeafHash(witnessLeafId)
      .toString('hex');
    input.witnessMerkleSiblingsHex[0] = scorexLeafHash(transactionId)
      .toString('hex');

    const baseline = decodeErgoScorexTransactionRuntimeWitnessV1(
      encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input),
      fixture.profile,
    );
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(input);
    const decoded = decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded,
      fixture.profile,
    );

    expect(decoded.bytesToSignHex).toBe(baseline.bytesToSignHex);
    expect(decoded.transactionIdHex).toBe(baseline.transactionIdHex);
    expect(decoded.transactionWitnessLeafIdHex).toBe(witnessLeafId.toString('hex'));
    expect(decoded.signedTransactionBytesHex).not.toBe(baseline.signedTransactionBytesHex);
    expect(decoded.targetTransactionsRootHex).toBe(computeErgoBlockTransactionsRoot({
      blockVersion: 4,
      transactions: [{
        transactionId,
        spendingProofs: [Buffer.from('aabbcc', 'hex'), Buffer.alloc(0)],
      }],
    }).toString('hex'));

    const wasmModule = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmModule.default ?? wasmModule;
    const signed = wasm.Transaction.from_json(JSON.stringify({
      id: fixture.transaction.txId,
      inputs: fixture.transaction.eip12Tx.inputs.map((value, index) => ({
        boxId: value.boxId,
        spendingProof: {
          proofBytes: index === 0 ? 'aabbcc' : '',
          extension: value.extension,
        },
      })),
      dataInputs: [],
      outputs: fixture.transaction.outputs,
    }));
    expect(Buffer.from(decoded.signedTransactionBytesHex, 'hex'))
      .toEqual(Buffer.from(signed.sigma_serialize_bytes()));
    signed.free?.();
  });

  it('rejects a valid envelope under a different statically selected profile', () => {
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input);
    const otherProfile = {
      ...fixture.profile,
      changeErgoTreeHex: `0008cd02${'35'.repeat(32)}`,
    };
    expect(() => decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded,
      otherProfile,
    )).toThrow(/not statically registered/);
  });

  it('verifies derived path sides and the Scorex odd-node rule', () => {
    const input = clone(fixture.input) as MutableWitness;
    const transactionId = Buffer.from(fixture.transaction.txId, 'hex');
    const witnessId = computeErgoTransactionWitnessId([
      Buffer.alloc(0),
      Buffer.alloc(0),
    ]);
    const leaves = [
      Buffer.alloc(32, 0x10),
      Buffer.alloc(32, 0x11),
      transactionId,
      Buffer.alloc(31, 0x20),
      Buffer.alloc(31, 0x21),
      witnessId,
    ];
    const transactionPath = scorexMerklePath(leaves, 2);
    const witnessPath = scorexMerklePath(leaves, 5);
    expect(transactionPath.root).toEqual(witnessPath.root);
    expect(witnessPath.siblings).toHaveLength(2);
    input.transactionIndex = 2;
    input.transactionCount = 3;
    input.transactionMerkleSiblingsHex = transactionPath.siblings
      .map(value => value.toString('hex'));
    input.witnessMerkleSiblingsHex = witnessPath.siblings
      .map(value => value.toString('hex'));

    const decoded = decodeErgoScorexTransactionRuntimeWitnessV1(
      encodeErgoScorexTransactionRuntimeWitnessV1(input),
      fixture.profile,
    );
    expect(decoded.targetTransactionsRootHex).toBe(
      transactionPath.root.toString('hex'),
    );

    const truncated = clone(input);
    truncated.transactionMerkleSiblingsHex.pop();
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(truncated))
      .toThrow(/Merkle path is truncated/);

    const indexDrift = clone(input);
    indexDrift.transactionIndex = 1;
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(indexDrift))
      .toThrow(/Merkle paths disagree/);

    const countDrift = clone(input);
    countDrift.transactionCount = 4;
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(countDrift))
      .toThrow(/Merkle path is truncated/);

    const surplus = clone(input);
    surplus.witnessMerkleSiblingsHex.push('77'.repeat(32));
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(surplus))
      .toThrow(/unused siblings/);
  });

  it('accepts a 4096-byte output body and rejects 4097 bytes', () => {
    const exact = withChangeOutputBodyLength(fixture.input, 4 * 1024);
    expect(serializeFixtureOutput(exact.outputs[1]!).length).toBe(4 * 1024);
    rebindSingleTransactionRoots(exact);
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(exact)).not.toThrow();

    const oversized = withChangeOutputBodyLength(fixture.input, (4 * 1024) + 1);
    expect(serializeFixtureOutput(oversized.outputs[1]!).length).toBe((4 * 1024) + 1);
    rebindSingleTransactionRoots(oversized);
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(oversized))
      .toThrow(/output body exceeds 4096 bytes/);
  });

  it.each([
    ['an unregistered parser profile', (input: MutableWitness) => {
      input.profile.vaultErgoTreeHex = `0008cd02${'12'.repeat(32)}`;
    }, /parser profile is not statically registered|vault ErgoTree|unregistered ErgoTree/],
    ['a non-empty context extension', (input: MutableWitness) => {
      input.inputs[0]!.contextExtensionHex = '01';
    }, /only empty context extensions/],
    ['a missing refundable source input', (input: MutableWitness) => {
      input.inputs[0]!.boxIdHex = '77'.repeat(32);
    }, /appear exactly once/],
    ['duplicate spending inputs', (input: MutableWitness) => {
      input.inputs[1]!.boxIdHex = input.inputs[0]!.boxIdHex;
    }, /input box IDs must be distinct|appear exactly once/],
    ['a vault amount different from the source', (input: MutableWitness) => {
      input.outputs[0]!.valueNanoErg = (SOURCE_AMOUNT - 1n).toString();
    }, /vault value/],
    ['an unregistered vault tree', (input: MutableWitness) => {
      input.outputs[0]!.ergoTreeHex = `0008cd02${'12'.repeat(32)}`;
    }, /registered vault ErgoTree|unregistered ErgoTree/],
    ['a source-ID drift in vault R4', (input: MutableWitness) => {
      input.outputs[0]!.registersHex[0] = encodeCollByteRegister(
        Buffer.alloc(32, 0x88),
      );
    }, /vault R4/],
    ['a recipient drift in vault R5', (input: MutableWitness) => {
      input.outputs[0]!.registersHex[1] = encodeCollByteRegister(
        Buffer.alloc(20, 0x55),
      );
    }, /vault R5/],
    ['an amount drift in vault R6', (input: MutableWitness) => {
      input.outputs[0]!.registersHex[2] = encodeLongRegister(SOURCE_AMOUNT - 1n);
    }, /vault R6/],
    ['a depositor drift in vault R7', (input: MutableWitness) => {
      input.outputs[0]!.registersHex[3] = encodeCollByteRegister(
        Buffer.from(`0008cd02${'34'.repeat(32)}`, 'hex'),
      );
    }, /vault R7/],
    ['a transaction Merkle sibling drift', (input: MutableWitness) => {
      input.transactionMerkleSiblingsHex[0] = '99'.repeat(32);
    }, /Merkle paths disagree/],
    ['a witness Merkle sibling drift', (input: MutableWitness) => {
      input.witnessMerkleSiblingsHex[0] = '99'.repeat(32);
    }, /Merkle paths disagree/],
  ] as const)('rejects %s', (_name, mutate, expected) => {
    const input = clone(fixture.input) as MutableWitness;
    mutate(input);
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(input))
      .toThrow(expected);
  });

  it('rejects a non-minimal Scorex VLQ before deriving source identity', () => {
    const input = clone(fixture.input) as MutableWitness;
    const source = Buffer.from(input.sourceBoxHex, 'hex');
    expect(source.subarray(0, 4).toString('hex')).toBe('80c2d72f');
    input.sourceBoxHex = Buffer.concat([
      source.subarray(0, 3),
      Buffer.from([0xaf, 0x00]),
      source.subarray(4),
    ]).toString('hex');

    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(input))
      .toThrow(/not minimally encoded/);
  });

  it('rejects a non-minimal source output-index VLQ', () => {
    const input = clone(fixture.input) as MutableWitness;
    const source = Buffer.from(input.sourceBoxHex, 'hex');
    expect(source.at(-1)).toBe(0);
    input.sourceBoxHex = Buffer.concat([
      source.subarray(0, -1),
      Buffer.from([0x80, 0x00]),
    ]).toString('hex');

    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(input))
      .toThrow(/output index is not minimally encoded/);
  });

  it.each([
    ['source token count', (source: Buffer) => {
      source[4 + Buffer.from(SOURCE_LOCK_TREE, 'hex').length + 1] = 1;
    }, /source box must contain no tokens/],
    ['source register count', (source: Buffer) => {
      source[4 + Buffer.from(SOURCE_LOCK_TREE, 'hex').length + 2] = 3;
    }, /contain exactly R4-R7/],
    ['source amount register', (source: Buffer) => {
      replaceSameLength(
        source,
        Buffer.from(encodeLongRegister(SOURCE_AMOUNT), 'hex'),
        Buffer.from(encodeLongRegister(SOURCE_AMOUNT - 1n), 'hex'),
      );
    }, /R5 must equal/],
    ['source signer key', (source: Buffer) => {
      const encodedKey = Buffer.from(encodeCollByteRegister(GENERATOR), 'hex');
      const offset = source.indexOf(encodedKey);
      expect(offset).toBeGreaterThanOrEqual(0);
      source[offset + 2] = 0x04;
    }, /point prefix/],
  ] as const)('rejects %s drift', (_name, mutate, expected) => {
    const input = clone(fixture.input) as MutableWitness;
    const source = Buffer.from(input.sourceBoxHex, 'hex');
    mutate(source);
    input.sourceBoxHex = source.toString('hex');
    expect(() => encodeErgoScorexTransactionRuntimeWitnessV1(input))
      .toThrow(expected);
  });

  it.each([
    ['data-input count', 0, /supports no data inputs/],
    ['distinct-token table count', 1, /supports no distinct token IDs/],
  ] as const)('rejects a nonzero raw %s', (_name, relativeOffset, expected) => {
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input);
    const counts = transactionCountOffsets(encoded);
    encoded[counts.dataInputCount + relativeOffset] = 1;
    expect(() => decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded,
      fixture.profile,
    )).toThrow(expected);
  });

  it.each([
    ['magic', 0],
    ['format', 8],
    ['flags', 9],
    ['section order', 48],
  ] as const)('rejects raw envelope %s drift', (_name, offset) => {
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input);
    encoded[offset] ^= 0x01;
    expect(() => decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded,
      fixture.profile,
    )).toThrow();
  });

  it('rejects truncation and trailing bytes', () => {
    const encoded = encodeErgoScorexTransactionRuntimeWitnessV1(fixture.input);
    expect(() => decodeErgoScorexTransactionRuntimeWitnessV1(
      encoded.subarray(0, -1),
      fixture.profile,
    )).toThrow();
    expect(() => decodeErgoScorexTransactionRuntimeWitnessV1(
      Buffer.concat([encoded, Buffer.from([0])]),
      fixture.profile,
    )).toThrow();
  });
});

type MutableWitness = {
  -readonly [K in keyof ErgoScorexTransactionRuntimeWitnessInputV1]:
    K extends 'profile'
      ? { -readonly [P in keyof ErgoScorexTransactionRuntimeParserProfileV1]: string }
      : K extends 'inputs'
        ? Array<{ boxIdHex: string; proofHex: string; contextExtensionHex: string }>
        : K extends 'outputs'
          ? Array<{
            valueNanoErg: string;
            ergoTreeHex: string;
            creationHeight: number;
            registersHex: string[];
          }>
          : K extends 'transactionMerkleSiblingsHex' | 'witnessMerkleSiblingsHex'
            ? string[]
            : ErgoScorexTransactionRuntimeWitnessInputV1[K]
};

async function buildFixture(): Promise<Fixture> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R5: encodeLongRegister(SOURCE_AMOUNT),
        R6: encodeCollByteRegister(GENERATOR),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 111,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R5: encodeLongRegister(SOURCE_AMOUNT),
        R6: encodeCollByteRegister(GENERATOR),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 111,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    }],
  }, 'Ergo Scorex witness source fixture');
  const sourceBox = funding.outputs[0]!;
  const feeBox = funding.outputs[2]!;
  const transaction = await materializeUnsignedTransaction({
    inputs: [
      { ...sourceBox, extension: {} },
      { ...feeBox, extension: {} },
    ],
    dataInputs: [],
    outputs: [{
      value: SOURCE_AMOUNT,
      ergoTree: VAULT_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(sourceBox.boxId, 'hex')),
        R5: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R6: encodeLongRegister(SOURCE_AMOUNT),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 112,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: feeBox.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 112,
    }],
  }, 'Ergo Scorex witness commitment fixture');
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const signedJson = {
    id: transaction.txId,
    inputs: transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      spendingProof: { proofBytes: '', extension: input.extension },
    })),
    dataInputs: [],
    outputs: transaction.outputs,
  };
  const parsedTransaction = wasm.Transaction.from_json(JSON.stringify(signedJson));
  const parsedSource = wasm.ErgoBox.from_json(JSON.stringify(sourceBox));
  const signedBytes = Buffer.from(parsedTransaction.sigma_serialize_bytes());
  const sourceBoxBytes = Buffer.from(parsedSource.sigma_serialize_bytes());
  parsedTransaction.free?.();
  parsedSource.free?.();

  const witnessLeafId = computeErgoTransactionWitnessId([
    Buffer.alloc(0),
    Buffer.alloc(0),
  ]);
  const transactionId = Buffer.from(transaction.txId, 'hex');
  const transactionLeafHash = scorexLeafHash(transactionId);
  const witnessLeafHash = scorexLeafHash(witnessLeafId);
  const expectedTransactionsRootHex = computeErgoBlockTransactionsRoot({
    blockVersion: 4,
    transactions: [{
      transactionId,
      spendingProofs: [Buffer.alloc(0), Buffer.alloc(0)],
    }],
  }).toString('hex');
  const profile: ErgoScorexTransactionRuntimeParserProfileV1 = {
    routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
    assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    sourceLockErgoTreeHex: SOURCE_LOCK_TREE,
    vaultErgoTreeHex: VAULT_TREE,
    changeErgoTreeHex: feeBox.ergoTree,
  };
  const outputs = transaction.eip12Tx.outputs.map((output, index) => ({
    valueNanoErg: String(output.value),
    ergoTreeHex: output.ergoTree,
    creationHeight: output.creationHeight,
    registersHex: index === 0
      ? ['R4', 'R5', 'R6', 'R7'].map(key =>
        output.additionalRegisters?.[key]!)
      : [],
  }));
  const input: ErgoScorexTransactionRuntimeWitnessInputV1 = {
    profile,
    blockVersion: 4,
    transactionIndex: 0,
    transactionCount: 1,
    inputs: transaction.eip12Tx.inputs.map(value => ({
      boxIdHex: value.boxId,
      proofHex: '',
      contextExtensionHex: '00',
    })),
    outputs,
    transactionMerkleSiblingsHex: [witnessLeafHash.toString('hex')],
    witnessMerkleSiblingsHex: [transactionLeafHash.toString('hex')],
    sourceBoxHex: sourceBoxBytes.toString('hex'),
  };
  return {
    profile,
    input,
    transaction,
    signedBytes,
    expectedTransactionsRootHex,
  };
}

function scorexLeafHash(value: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(
    Buffer.concat([Buffer.from([0]), value]),
    undefined,
    32,
  ));
}

function scorexMerklePath(
  leaves: readonly Buffer[],
  leafIndex: number,
): { readonly root: Buffer; readonly siblings: readonly Buffer[] } {
  let level = leaves.map(scorexLeafHash);
  let index = leafIndex;
  const siblings: Buffer[] = [];
  while (level.length > 1) {
    const siblingIndex = index ^ 1;
    if (siblingIndex < level.length) siblings.push(level[siblingIndex]!);
    const next: Buffer[] = [];
    for (let position = 0; position < level.length; position += 2) {
      const left = level[position]!;
      const right = level[position + 1];
      next.push(Buffer.from(blakejs.blake2b(
        right === undefined
          ? Buffer.concat([Buffer.from([1]), left])
          : Buffer.concat([Buffer.from([1]), left, right]),
        undefined,
        32,
      )));
    }
    index = Math.floor(index / 2);
    level = next;
  }
  return { root: level[0]!, siblings };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function replaceSameLength(source: Buffer, before: Buffer, after: Buffer): void {
  expect(after.length).toBe(before.length);
  const offset = source.indexOf(before);
  expect(offset).toBeGreaterThanOrEqual(0);
  after.copy(source, offset);
}

function transactionCountOffsets(encoded: Buffer): { readonly dataInputCount: number } {
  const profileLength = encoded.readUInt32BE(50);
  const transactionStart = 72 + profileLength;
  let offset = transactionStart + 1 + 4 + 4;
  const inputCount = encoded[offset]!;
  offset += 1;
  expect(inputCount).toBe(2);
  for (let index = 0; index < inputCount; index += 1) {
    offset += 32;
    const proofLength = encoded.readUInt32BE(offset);
    offset += 4 + proofLength;
    const extensionLength = encoded.readUInt16BE(offset);
    offset += 2 + extensionLength;
  }
  return { dataInputCount: offset };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function withChangeOutputBodyLength(
  source: ErgoScorexTransactionRuntimeWitnessInputV1,
  targetLength: number,
): MutableWitness {
  const input = clone(source) as MutableWitness;
  const output = input.outputs[1]!;
  const fixedLength = scorexUnsignedVlq(BigInt(output.valueNanoErg)).length
    + scorexUnsignedVlq(BigInt(output.creationHeight)).length
    + 2;
  const treeLength = targetLength - fixedLength;
  expect(treeLength).toBeGreaterThan(0);
  const tree = '00'.repeat(treeLength);
  input.profile.changeErgoTreeHex = tree;
  output.ergoTreeHex = tree;
  return input;
}

function rebindSingleTransactionRoots(input: MutableWitness): void {
  input.transactionIndex = 0;
  input.transactionCount = 1;
  const transactionId = scorexBlake2b256(serializeFixtureTransaction(input, true));
  const witnessLeafId = computeErgoTransactionWitnessId(
    input.inputs.map(value => Buffer.from(value.proofHex, 'hex')),
  );
  input.transactionMerkleSiblingsHex = [scorexLeafHash(witnessLeafId).toString('hex')];
  input.witnessMerkleSiblingsHex = [scorexLeafHash(transactionId).toString('hex')];
}

function serializeFixtureTransaction(input: MutableWitness, proofless: boolean): Buffer {
  const chunks: Buffer[] = [scorexUnsignedVlq(BigInt(input.inputs.length))];
  for (const value of input.inputs) {
    const proof = proofless ? Buffer.alloc(0) : Buffer.from(value.proofHex, 'hex');
    chunks.push(
      Buffer.from(value.boxIdHex, 'hex'),
      scorexUnsignedVlq(BigInt(proof.length)),
      proof,
      Buffer.from(value.contextExtensionHex, 'hex'),
    );
  }
  chunks.push(
    scorexUnsignedVlq(0n),
    scorexUnsignedVlq(0n),
    scorexUnsignedVlq(BigInt(input.outputs.length)),
  );
  input.outputs.forEach(output => chunks.push(serializeFixtureOutput(output)));
  return Buffer.concat(chunks);
}

function serializeFixtureOutput(output: MutableWitness['outputs'][number]): Buffer {
  return Buffer.concat([
    scorexUnsignedVlq(BigInt(output.valueNanoErg)),
    Buffer.from(output.ergoTreeHex, 'hex'),
    scorexUnsignedVlq(BigInt(output.creationHeight)),
    Buffer.from([0, output.registersHex.length]),
    ...output.registersHex.map(value => Buffer.from(value, 'hex')),
  ]);
}

function scorexUnsignedVlq(value: bigint): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(bytes);
}

function scorexBlake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
}
