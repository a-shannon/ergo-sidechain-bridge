import blakejs from 'blakejs';

import {
  buildEip0045BridgeValidityContextExtensionV1,
  type BuildEip0045BridgeValidityContextExtensionV1Input,
} from './bridge-validity-context-extension-v1.js';

export const EIP0045_BRIDGE_VALIDITY_PROOFLESS_TRANSACTION_V1_SCHEMA =
  'e2s.bridge-validity-proofless-transaction.v1';

export interface Eip0045BridgeValidityProoflessTransactionV1 {
  readonly schema:
    typeof EIP0045_BRIDGE_VALIDITY_PROOFLESS_TRANSACTION_V1_SCHEMA;
  readonly version: 1;
  readonly sourceContextExtension: {
    readonly schema: 'e2s.bridge-validity-context-extension.v1';
    readonly version: 1;
    readonly statementDigestHex: string;
    readonly rawSealDigestHex: string;
    readonly serializedHex: string;
    readonly serializedBlake2b256Hex: string;
    readonly proofChunkLengths: readonly number[];
    readonly proofChunkBlake2b256Hex: readonly string[];
    readonly applicationPayloadBytes: number;
    readonly applicationPayloadBlake2b256Hex: string;
    readonly unsignedTransactionIdHex: string;
    readonly unsignedEip12Blake2b256Hex: string;
  };
  readonly transaction: {
    readonly inputCount: 1;
    readonly dataInputCount: 0;
    readonly outputCount: 1;
    readonly inputBoxIdHex: string;
    readonly inputProofBytes: 0;
    readonly contextExtensionKeys: readonly [0, 1];
    readonly output: {
      readonly value: string;
      readonly ergoTreeHex: string;
      readonly assetCount: 0;
      readonly additionalRegisterCount: 0;
      readonly creationHeight: number;
    };
    readonly outputBoxIdHex: string;
    readonly prooflessEip12Blake2b256Hex: string;
    readonly bytesToSignHex: string;
    readonly bytesToSignBytes: number;
    readonly bytesToSignBlake2b256Hex: string;
    readonly transactionIdHex: string;
  };
  readonly boundaries: {
    readonly wholeTransactionSerializationOnly: true;
    readonly signingPerformed: false;
    readonly nodeCheckPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly fundsAuthorityEstablished: false;
  };
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildEip0045BridgeValidityProoflessTransactionV1(
  input: BuildEip0045BridgeValidityContextExtensionV1Input,
): Promise<Eip0045BridgeValidityProoflessTransactionV1> {
  const contextFixture =
    await buildEip0045BridgeValidityContextExtensionV1(input);
  const wasm = await getWasm();

  let unsigned: any;
  let prooflessTransaction: any;
  let unsignedId: any;
  let transactionId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(contextFixture.eip12UnsignedTransaction),
    );
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = exactFixedHex(
      unsignedId.to_str(),
      32,
      'unsigned transaction ID',
    );
    unsignedId.free?.();
    unsignedId = undefined;
    if (unsignedTransactionIdHex !== contextFixture.unsignedTransactionIdHex) {
      throw new Error('WP-06Y unsigned transaction ID changed before serialization');
    }

    const consumedUnsigned = unsigned;
    unsigned = undefined;
    prooflessTransaction = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array()],
    );
    transactionId = prooflessTransaction.id();
    const transactionIdHex = exactFixedHex(
      transactionId.to_str(),
      32,
      'proofless transaction ID',
    );
    const bytesToSign = Buffer.from(
      prooflessTransaction.sigma_serialize_bytes(),
    );
    const bytesToSignBlake2b256Hex = blake2b256Hex(bytesToSign);
    if (
      transactionIdHex !== unsignedTransactionIdHex
      || bytesToSignBlake2b256Hex !== transactionIdHex
    ) {
      throw new Error(
        'proofless transaction bytes, unsigned ID, and transaction ID must match',
      );
    }

    const prooflessEip12 = deepFreeze(
      prooflessTransaction.to_js_eip12(),
    ) as Readonly<Record<string, unknown>>;
    const summary = assertExactProoflessEip12(
      prooflessEip12,
      contextFixture.eip12UnsignedTransaction,
      contextFixture.contextExtension.eip12Values,
      transactionIdHex,
    );

    return deepFreeze({
      schema: EIP0045_BRIDGE_VALIDITY_PROOFLESS_TRANSACTION_V1_SCHEMA,
      version: 1 as const,
      sourceContextExtension: {
        schema: contextFixture.schema,
        version: contextFixture.version,
        statementDigestHex: contextFixture.sourceEnvelope.statementDigestHex,
        rawSealDigestHex: contextFixture.sourceEnvelope.rawSealDigestHex,
        serializedHex: contextFixture.contextExtension.serializedHex,
        serializedBlake2b256Hex:
          contextFixture.contextExtension.serializedBlake2b256Hex,
        proofChunkLengths:
          contextFixture.contextExtension.proofChunkLengths,
        proofChunkBlake2b256Hex:
          contextFixture.contextExtension.proofChunkBlake2b256Hex,
        applicationPayloadBytes:
          contextFixture.contextExtension.applicationPayloadBytes,
        applicationPayloadBlake2b256Hex:
          contextFixture.contextExtension.applicationPayloadBlake2b256Hex,
        unsignedTransactionIdHex,
        unsignedEip12Blake2b256Hex: blake2b256Hex(
          Buffer.from(
            canonicalJson(contextFixture.eip12UnsignedTransaction),
            'ascii',
          ),
        ),
      },
      transaction: {
        ...summary,
        prooflessEip12Blake2b256Hex: blake2b256Hex(
          Buffer.from(canonicalJson(prooflessEip12), 'ascii'),
        ),
        bytesToSignHex: bytesToSign.toString('hex'),
        bytesToSignBytes: bytesToSign.length,
        bytesToSignBlake2b256Hex,
        transactionIdHex,
      },
      boundaries: {
        wholeTransactionSerializationOnly: true as const,
        signingPerformed: false as const,
        nodeCheckPerformed: false as const,
        submissionPerformed: false as const,
        broadcastPerformed: false as const,
        profileActivated: false as const,
        gate5Closed: false as const,
        fundsAuthorityEstablished: false as const,
      },
    });
  } finally {
    transactionId?.free?.();
    unsignedId?.free?.();
    prooflessTransaction?.free?.();
    unsigned?.free?.();
  }
}

function assertExactProoflessEip12(
  proofless: Readonly<Record<string, unknown>>,
  unsigned: Readonly<Record<string, unknown>>,
  expectedExtension: Readonly<Record<'0' | '1', string>>,
  transactionIdHex: string,
): {
  readonly inputCount: 1;
  readonly dataInputCount: 0;
  readonly outputCount: 1;
  readonly inputBoxIdHex: string;
  readonly inputProofBytes: 0;
  readonly contextExtensionKeys: readonly [0, 1];
  readonly output: {
    readonly value: string;
    readonly ergoTreeHex: string;
    readonly assetCount: 0;
    readonly additionalRegisterCount: 0;
    readonly creationHeight: number;
  };
  readonly outputBoxIdHex: string;
} {
  if (proofless.id !== transactionIdHex) {
    throw new Error('proofless EIP-12 transaction ID mismatch');
  }
  const unsignedInputs = exactArray(unsigned.inputs, 'unsigned inputs');
  const prooflessInputs = exactArray(proofless.inputs, 'proofless inputs');
  if (unsignedInputs.length !== 1 || prooflessInputs.length !== 1) {
    throw new Error('proofless transaction must contain exactly one input');
  }
  const unsignedInput = exactRecord(unsignedInputs[0], 'unsigned input');
  const prooflessInput = exactRecord(prooflessInputs[0], 'proofless input');
  const inputBoxIdHex = exactFixedHex(
    prooflessInput.boxId,
    32,
    'proofless input box ID',
  );
  if (inputBoxIdHex !== unsignedInput.boxId) {
    throw new Error('proofless input box ID differs from WP-06Y');
  }
  const spendingProof = exactRecord(
    prooflessInput.spendingProof,
    'proofless spending proof',
  );
  if (spendingProof.proofBytes !== '') {
    throw new Error('proofless transaction input must contain an empty proof');
  }
  const extension = exactRecord(
    spendingProof.extension,
    'proofless input extension',
  );
  if (canonicalJson(extension) !== canonicalJson(expectedExtension)) {
    throw new Error('proofless input extension differs from WP-06Y');
  }

  const unsignedDataInputs = exactArray(unsigned.dataInputs, 'unsigned data inputs');
  const prooflessDataInputs = exactArray(
    proofless.dataInputs,
    'proofless data inputs',
  );
  if (unsignedDataInputs.length !== 0 || prooflessDataInputs.length !== 0) {
    throw new Error('proofless transaction must not contain data inputs');
  }

  const unsignedOutputs = exactArray(unsigned.outputs, 'unsigned outputs');
  const prooflessOutputs = exactArray(proofless.outputs, 'proofless outputs');
  if (unsignedOutputs.length !== 1 || prooflessOutputs.length !== 1) {
    throw new Error('proofless transaction must contain exactly one output');
  }
  const unsignedOutput = exactRecord(unsignedOutputs[0], 'unsigned output');
  const prooflessOutput = exactRecord(prooflessOutputs[0], 'proofless output');
  for (const field of ['value', 'ergoTree', 'creationHeight'] as const) {
    if (prooflessOutput[field] !== unsignedOutput[field]) {
      throw new Error(`proofless output ${field} differs from WP-06Y`);
    }
  }
  const assets = exactArray(prooflessOutput.assets, 'proofless output assets');
  const additionalRegisters = exactRecord(
    prooflessOutput.additionalRegisters,
    'proofless output additional registers',
  );
  if (
    assets.length !== 0
    || Object.keys(additionalRegisters).length !== 0
    || canonicalJson(assets) !== canonicalJson(unsignedOutput.assets)
    || canonicalJson(additionalRegisters)
      !== canonicalJson(unsignedOutput.additionalRegisters)
  ) {
    throw new Error('proofless output assets or registers differ from WP-06Y');
  }
  if (prooflessOutput.transactionId !== transactionIdHex) {
    throw new Error('proofless output transaction ID mismatch');
  }
  if (prooflessOutput.index !== 0) {
    throw new Error('proofless output index must be zero');
  }

  return {
    inputCount: 1,
    dataInputCount: 0,
    outputCount: 1,
    inputBoxIdHex,
    inputProofBytes: 0,
    contextExtensionKeys: [0, 1] as const,
    output: {
      value: exactDecimalString(prooflessOutput.value, 'proofless output value'),
      ergoTreeHex: exactLowerHex(
        prooflessOutput.ergoTree,
        'proofless output ErgoTree',
      ),
      assetCount: 0,
      additionalRegisterCount: 0,
      creationHeight: exactSafeInteger(
        prooflessOutput.creationHeight,
        'proofless output creation height',
      ),
    },
    outputBoxIdHex: exactFixedHex(
      prooflessOutput.boxId,
      32,
      'proofless output box ID',
    ),
  };
}

function exactRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function exactDecimalString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical non-negative decimal string`);
  }
  return value;
}

function exactSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function exactLowerHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase unprefixed hex`);
  }
  if (value.length % 2 !== 0) {
    throw new Error(`${label} must contain whole bytes`);
  }
  return value;
}

function exactFixedHex(value: unknown, bytes: number, label: string): string {
  const hex = exactLowerHex(value, label);
  if (hex.length !== bytes * 2) {
    throw new Error(`${label} must contain exactly ${bytes} bytes`);
  }
  return hex;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
