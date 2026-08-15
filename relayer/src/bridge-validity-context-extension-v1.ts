import blakejs from 'blakejs';

import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  assertEip0045BridgeValidityProofEnvelopeV1Matches,
  type Eip0045BridgeValidityProofEnvelopeV1ExpectedContext,
} from './bridge-validity-proof-envelope-v1.js';

export const EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_V1_SCHEMA =
  'e2s.bridge-validity-context-extension.v1';
export const EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_KEYS =
  Object.freeze([0, 1] as const);

const FIXTURE_INPUT_BOX_ID_HEX = '44'.repeat(32);
const FIXTURE_OUTPUT_ERGO_TREE_HEX = `0008cd02${'33'.repeat(32)}`;

export interface BuildEip0045BridgeValidityContextExtensionV1Input {
  readonly envelope: unknown;
  readonly expected: Eip0045BridgeValidityProofEnvelopeV1ExpectedContext;
}

export interface Eip0045BridgeValidityContextExtensionV1 {
  readonly schema: typeof EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_V1_SCHEMA;
  readonly version: 1;
  readonly sourceEnvelope: {
    readonly schema: 'e2s.bridge-validity-proof-envelope.v1';
    readonly version: 1;
    readonly statementDigestHex: string;
    readonly rawSealDigestHex: string;
  };
  readonly contextExtension: {
    readonly keys: readonly [0, 1];
    readonly valueTypes: readonly ['Coll[Coll[Byte]]', 'Coll[Byte]'];
    readonly proofChunkLengths: readonly number[];
    readonly proofChunkBlake2b256Hex: readonly string[];
    readonly applicationPayloadBytes: number;
    readonly applicationPayloadBlake2b256Hex: string;
    readonly eip12Values: Readonly<Record<'0' | '1', string>>;
    readonly serializedHex: string;
    readonly serializedBlake2b256Hex: string;
  };
  readonly eip12UnsignedTransaction: Readonly<Eip12UnsignedTransaction>;
  readonly wasmRoundTripEip12: Readonly<Eip12UnsignedTransaction>;
  readonly unsignedTransactionIdHex: string;
  readonly boundaries: {
    readonly serializationConformanceOnly: true;
    readonly signingPerformed: false;
    readonly nodeCheckPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly gate5Closed: false;
    readonly fundsAuthorityEstablished: false;
  };
}

interface Eip12UnsignedTransaction {
  readonly inputs: readonly [{
    readonly boxId: string;
    readonly extension: Readonly<Record<'0' | '1', string>>;
  }];
  readonly dataInputs: readonly [];
  readonly outputs: readonly [{
    readonly value: string;
    readonly ergoTree: string;
    readonly assets: readonly [];
    readonly additionalRegisters: Readonly<Record<string, never>>;
    readonly creationHeight: number;
  }];
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildEip0045BridgeValidityContextExtensionV1(
  input: BuildEip0045BridgeValidityContextExtensionV1Input,
): Promise<Eip0045BridgeValidityContextExtensionV1> {
  const envelope = assertEip0045BridgeValidityProofEnvelopeV1Matches(
    input.envelope,
    input.expected,
  );
  const proofChunks = envelope.consumerAbi.proofChunksHex.map(
    chunk => Uint8Array.from(Buffer.from(chunk, 'hex')),
  );
  const applicationPayload = Uint8Array.from(
    Buffer.from(envelope.consumerAbi.applicationPayloadHex, 'hex'),
  );
  const wasm = await getWasm();

  let proofChunksConstant: any;
  let applicationPayloadConstant: any;
  let extension: any;
  let unsigned: any;
  let unsignedInputs: any;
  let parsedInput: any;
  let parsedExtension: any;
  let parsedProofChunksConstant: any;
  let parsedApplicationPayloadConstant: any;
  let unsignedId: any;
  try {
    proofChunksConstant = wasm.Constant.from_coll_coll_byte(proofChunks);
    applicationPayloadConstant = wasm.Constant.from_byte_array(applicationPayload);
    extension = new wasm.ContextExtension();
    assertExactType(
      proofChunksConstant.dbg_tpe(),
      'SColl(SColl(SByte))',
      'proof chunks',
    );
    assertExactType(
      applicationPayloadConstant.dbg_tpe(),
      'SColl(SByte)',
      'application payload',
    );

    extension.set_pair(0, proofChunksConstant);
    extension.set_pair(1, applicationPayloadConstant);
    const eip12Values = Object.freeze({
      '0': exactLowerHex(
        proofChunksConstant.encode_to_base16(),
        'proof chunks EIP-12 constant',
      ),
      '1': exactLowerHex(
        applicationPayloadConstant.encode_to_base16(),
        'application payload EIP-12 constant',
      ),
    });
    const serialized = Buffer.from(extension.sigma_serialize_bytes());
    const eip12UnsignedTransaction = deepFreeze({
      inputs: [{
        boxId: FIXTURE_INPUT_BOX_ID_HEX,
        extension: eip12Values,
      }],
      dataInputs: [],
      outputs: [{
        value: '1000000',
        ergoTree: FIXTURE_OUTPUT_ERGO_TREE_HEX,
        assets: [],
        additionalRegisters: {},
        creationHeight: 100,
      }],
    }) as Eip12UnsignedTransaction;

    assertContextExtensionSafe(
      [...eip12UnsignedTransaction.inputs],
      'EIP-0045 bridge validity ContextExtension V1',
      4,
    );
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const wasmRoundTripEip12 = deepFreeze(
      unsigned.to_js_eip12(),
    ) as Eip12UnsignedTransaction;
    if (canonicalJson(wasmRoundTripEip12) !== canonicalJson(eip12UnsignedTransaction)) {
      throw new Error('WASM EIP-12 unsigned transaction round trip changed the fixture');
    }

    unsignedInputs = unsigned.inputs();
    if (unsignedInputs.len() !== 1) {
      throw new Error('WASM EIP-12 unsigned transaction must contain exactly one input');
    }
    parsedInput = unsignedInputs.get(0);
    parsedExtension = parsedInput.extension();
    const parsedKeys = [...parsedExtension.keys()];
    assertExactKeys(parsedKeys);
    const parsedSerialized = Buffer.from(parsedExtension.sigma_serialize_bytes());
    if (!parsedSerialized.equals(serialized)) {
      throw new Error('WASM EIP-12 ContextExtension bytes differ after round trip');
    }

    parsedProofChunksConstant = parsedExtension.get(0);
    parsedApplicationPayloadConstant = parsedExtension.get(1);
    assertExactType(
      parsedProofChunksConstant.dbg_tpe(),
      'SColl(SColl(SByte))',
      'round-trip proof chunks',
    );
    assertExactType(
      parsedApplicationPayloadConstant.dbg_tpe(),
      'SColl(SByte)',
      'round-trip application payload',
    );
    assertExactChunks(
      parsedProofChunksConstant.to_coll_coll_byte(),
      proofChunks,
    );
    if (
      !Buffer.from(parsedApplicationPayloadConstant.to_byte_array())
        .equals(Buffer.from(applicationPayload))
    ) {
      throw new Error('WASM EIP-12 application payload bytes changed after round trip');
    }

    unsignedId = unsigned.id();
    return deepFreeze({
      schema: EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_V1_SCHEMA,
      version: 1 as const,
      sourceEnvelope: {
        schema: envelope.schema,
        version: envelope.version,
        statementDigestHex: envelope.statementDigestHex,
        rawSealDigestHex: envelope.rawSealDigestHex,
      },
      contextExtension: {
        keys: [0, 1] as const,
        valueTypes: ['Coll[Coll[Byte]]', 'Coll[Byte]'] as const,
        proofChunkLengths: proofChunks.map(chunk => chunk.length),
        proofChunkBlake2b256Hex: proofChunks.map(chunk => blake2b256Hex(chunk)),
        applicationPayloadBytes: applicationPayload.length,
        applicationPayloadBlake2b256Hex: blake2b256Hex(applicationPayload),
        eip12Values,
        serializedHex: parsedSerialized.toString('hex'),
        serializedBlake2b256Hex: blake2b256Hex(parsedSerialized),
      },
      eip12UnsignedTransaction,
      wasmRoundTripEip12,
      unsignedTransactionIdHex: exactFixedHex(
        unsignedId.to_str(),
        32,
        'unsigned transaction ID',
      ),
      boundaries: {
        serializationConformanceOnly: true as const,
        signingPerformed: false as const,
        nodeCheckPerformed: false as const,
        submissionPerformed: false as const,
        broadcastPerformed: false as const,
        gate5Closed: false as const,
        fundsAuthorityEstablished: false as const,
      },
    });
  } finally {
    unsignedId?.free?.();
    parsedApplicationPayloadConstant?.free?.();
    parsedProofChunksConstant?.free?.();
    parsedExtension?.free?.();
    parsedInput?.free?.();
    unsignedInputs?.free?.();
    unsigned?.free?.();
    extension?.free?.();
    applicationPayloadConstant?.free?.();
    proofChunksConstant?.free?.();
  }
}

function assertExactType(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} Sigma type mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertExactKeys(keys: number[]): void {
  if (
    keys.length !== EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_KEYS.length
    || keys.some((key, index) => key !== EIP0045_BRIDGE_VALIDITY_CONTEXT_EXTENSION_KEYS[index])
  ) {
    throw new Error('WASM EIP-12 ContextExtension keys must be exactly [0,1]');
  }
}

function assertExactChunks(
  actual: readonly Uint8Array[],
  expected: readonly Uint8Array[],
): void {
  if (actual.length !== expected.length) {
    throw new Error('WASM EIP-12 proof chunk count changed after round trip');
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!Buffer.from(actual[index]).equals(Buffer.from(expected[index]))) {
      throw new Error(`WASM EIP-12 proof chunk ${index} changed after round trip`);
    }
  }
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
