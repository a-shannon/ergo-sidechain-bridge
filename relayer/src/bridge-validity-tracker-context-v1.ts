import blakejs from 'blakejs';

import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  assertBridgeValidityTrackerCanonicalHeaderContextV1,
  BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
  type BridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import type {
  ValiditySpvAdmissionV1Plan,
} from './spv-tracker-validity-v1.js';

export const EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_V1_SCHEMA =
  'e2s.bridge-validity-tracker-context.v1';
export const EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_KEYS =
  Object.freeze([0, 1, 2, 3] as const);
export const EIP0045_INITIAL_TRANSACTION_INGRESS_BYTES = 262_144;

const FIXTURE_INPUT_BOX_ID_HEX = '55'.repeat(32);
const FIXTURE_TRACKER_VALUE = '10000000';

export interface Eip0045BridgeValidityTrackerContextV1 {
  readonly schema:
    typeof EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_V1_SCHEMA;
  readonly version: 1;
  readonly sourceAdmission: {
    readonly statementDigestHex: string;
    readonly rawSealDigestHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
  };
  readonly trackerTransition: {
    readonly trackerNftIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
    readonly inputValue: typeof FIXTURE_TRACKER_VALUE;
    readonly inputRegisters:
      Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
    readonly successorRegisters:
      Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
    readonly currentErgoHeight: number;
    readonly anchorHeader: {
      readonly idHex: string;
      readonly height: number;
      readonly extensionRootHex: string;
      readonly contextIndex: number;
    };
    readonly headers: readonly {
      readonly raw: Readonly<Record<string, unknown>>;
      readonly id: string;
      readonly parentId: string;
      readonly height: number;
      readonly extensionRootHex: string;
      readonly jvmHeaderJson: string;
      readonly serializedHex: string;
    }[];
    readonly provenance:
      typeof BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE;
  };
  readonly contextExtension: {
    readonly keys: readonly [0, 1, 2, 3];
    readonly valueTypes: readonly [
      'Coll[Coll[Byte]]',
      'Coll[Byte]',
      'Coll[Byte]',
      'Int',
    ];
    readonly proofChunkLengths: readonly number[];
    readonly applicationPayloadBytes: number;
    readonly proofBundleBytes: number;
    readonly headerIndex: number;
    readonly eip12Values:
      Readonly<Record<'0' | '1' | '2' | '3', string>>;
    readonly serializedHex: string;
    readonly serializedBytes: number;
    readonly serializedBlake2b256Hex: string;
  };
  readonly eip12UnsignedTransaction:
    Readonly<Eip12ValidityTrackerUnsignedTransaction>;
  readonly wasmRoundTripEip12:
    Readonly<Eip12ValidityTrackerUnsignedTransaction>;
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: {
    readonly serializationConformanceOnly: true;
    readonly exactTrackerSuccessorIncluded: true;
    readonly canonicalSyntheticHeaderIdsEstablished: true;
    readonly minedHeaderEvidenceEstablished: false;
    readonly signingPerformed: false;
    readonly nodeCheckPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export interface BuildEip0045BridgeValidityTrackerContextV1Input {
  readonly plan: ValiditySpvAdmissionV1Plan;
  readonly headerContext: BridgeValidityTrackerCanonicalHeaderContextV1;
}

interface Eip12ValidityTrackerUnsignedTransaction {
  readonly inputs: readonly [{
    readonly boxId: string;
    readonly extension:
      Readonly<Record<'0' | '1' | '2' | '3', string>>;
  }];
  readonly dataInputs: readonly [];
  readonly outputs: readonly [{
    readonly value: string;
    readonly ergoTree: string;
    readonly assets: readonly [{
      readonly tokenId: string;
      readonly amount: string;
    }];
    readonly additionalRegisters:
      Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
    readonly creationHeight: number;
  }];
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildEip0045BridgeValidityTrackerContextV1(
  input: BuildEip0045BridgeValidityTrackerContextV1Input,
): Promise<Eip0045BridgeValidityTrackerContextV1> {
  const { plan, headerContext } = input;
  assertHeaderContext(plan, headerContext);
  const proofChunks = plan.contextExtension.proofChunksHex.map(
    chunk => Uint8Array.from(Buffer.from(exactHex(chunk, 'proof chunk'), 'hex')),
  );
  const applicationPayload = Uint8Array.from(Buffer.from(
    exactHex(
      plan.contextExtension.applicationPayloadHex,
      'application payload',
    ),
    'hex',
  ));
  const proofBundle = Uint8Array.from(Buffer.from(
    exactHex(plan.contextExtension.proofBundleHex, 'proof bundle'),
    'hex',
  ));
  const headerIndex = plan.contextExtension.headerIndex;
  if (!Number.isSafeInteger(headerIndex) || headerIndex < 0) {
    throw new Error('validity tracker header index must be nonnegative');
  }
  const wasm = await getWasm();

  let proofChunksConstant: any;
  let applicationPayloadConstant: any;
  let proofBundleConstant: any;
  let headerIndexConstant: any;
  let extension: any;
  let unsigned: any;
  let unsignedInputs: any;
  let parsedInput: any;
  let parsedExtension: any;
  let parsedProofChunks: any;
  let parsedPayload: any;
  let parsedBundle: any;
  let parsedHeaderIndex: any;
  let unsignedId: any;
  let prooflessTransaction: any;
  let prooflessTransactionId: any;
  try {
    proofChunksConstant = wasm.Constant.from_coll_coll_byte(proofChunks);
    applicationPayloadConstant =
      wasm.Constant.from_byte_array(applicationPayload);
    proofBundleConstant = wasm.Constant.from_byte_array(proofBundle);
    headerIndexConstant = wasm.Constant.from_i32(headerIndex);
    assertType(
      proofChunksConstant,
      'SColl(SColl(SByte))',
      'proof chunks',
    );
    assertType(applicationPayloadConstant, 'SColl(SByte)', 'payload');
    assertType(proofBundleConstant, 'SColl(SByte)', 'proof bundle');
    assertType(headerIndexConstant, 'SInt', 'header index');

    extension = new wasm.ContextExtension();
    extension.set_pair(0, proofChunksConstant);
    extension.set_pair(1, applicationPayloadConstant);
    extension.set_pair(2, proofBundleConstant);
    extension.set_pair(3, headerIndexConstant);
    const eip12Values = Object.freeze({
      '0': lowerHex(
        proofChunksConstant.encode_to_base16(),
        'proof chunks constant',
      ),
      '1': lowerHex(
        applicationPayloadConstant.encode_to_base16(),
        'application payload constant',
      ),
      '2': lowerHex(
        proofBundleConstant.encode_to_base16(),
        'proof bundle constant',
      ),
      '3': lowerHex(
        headerIndexConstant.encode_to_base16(),
        'header index constant',
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
        value: FIXTURE_TRACKER_VALUE,
        ergoTree:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
        assets: [{
          tokenId: plan.trackerNftIdHex,
          amount: '1',
        }],
        additionalRegisters: plan.successorRegisters,
        creationHeight: plan.currentErgoHeight,
      }],
    }) as Eip12ValidityTrackerUnsignedTransaction;

    assertContextExtensionSafe(
      [...eip12UnsignedTransaction.inputs],
      'EIP-0045 bridge validity tracker ContextExtension V1',
      EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_KEYS.length,
    );
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const wasmRoundTripEip12 = deepFreeze(
      unsigned.to_js_eip12(),
    ) as Eip12ValidityTrackerUnsignedTransaction;
    if (
      canonicalJson(wasmRoundTripEip12)
      !== canonicalJson(eip12UnsignedTransaction)
    ) {
      throw new Error(
        'WASM changed the validity tracker unsigned transaction',
      );
    }

    unsignedInputs = unsigned.inputs();
    if (unsignedInputs.len() !== 1) {
      throw new Error('validity tracker transaction must have one input');
    }
    parsedInput = unsignedInputs.get(0);
    parsedExtension = parsedInput.extension();
    const parsedKeys = [...parsedExtension.keys()];
    if (
      parsedKeys.length !== 4
      || parsedKeys.some(
        (key, index) =>
          key !== EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_KEYS[index],
      )
    ) {
      throw new Error(
        'validity tracker ContextExtension keys must be exactly [0,1,2,3]',
      );
    }
    const parsedSerialized =
      Buffer.from(parsedExtension.sigma_serialize_bytes());
    if (!parsedSerialized.equals(serialized)) {
      throw new Error(
        'validity tracker ContextExtension bytes changed after round trip',
      );
    }

    parsedProofChunks = parsedExtension.get(0);
    parsedPayload = parsedExtension.get(1);
    parsedBundle = parsedExtension.get(2);
    parsedHeaderIndex = parsedExtension.get(3);
    assertType(parsedProofChunks, 'SColl(SColl(SByte))', 'parsed proof chunks');
    assertType(parsedPayload, 'SColl(SByte)', 'parsed payload');
    assertType(parsedBundle, 'SColl(SByte)', 'parsed proof bundle');
    assertType(parsedHeaderIndex, 'SInt', 'parsed header index');
    assertChunks(parsedProofChunks.to_coll_coll_byte(), proofChunks);
    assertBytes(parsedPayload.to_byte_array(), applicationPayload, 'payload');
    assertBytes(parsedBundle.to_byte_array(), proofBundle, 'proof bundle');
    if (parsedHeaderIndex.to_i32() !== headerIndex) {
      throw new Error('validity tracker header index changed after round trip');
    }

    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'validity tracker unsigned transaction ID',
    );
    unsignedId.free?.();
    unsignedId = undefined;
    const consumedUnsigned = unsigned;
    unsigned = undefined;
    prooflessTransaction = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array()],
    );
    prooflessTransactionId = prooflessTransaction.id();
    const prooflessTransactionIdHex = fixedHex(
      prooflessTransactionId.to_str(),
      32,
      'validity tracker proofless transaction ID',
    );
    const prooflessBytes =
      Buffer.from(prooflessTransaction.sigma_serialize_bytes());
    if (prooflessBytes.length > EIP0045_INITIAL_TRANSACTION_INGRESS_BYTES) {
      throw new Error(
        'validity tracker transaction exceeds the EIP-0045 ingress bound',
      );
    }
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error(
        'validity tracker proofless bytes and transaction IDs differ',
      );
    }
    return deepFreeze({
      schema: EIP0045_BRIDGE_VALIDITY_TRACKER_CONTEXT_V1_SCHEMA,
      version: 1 as const,
      sourceAdmission: {
        statementDigestHex: plan.statementDigestHex,
        rawSealDigestHex: plan.rawSealDigestHex,
        trackerKeyHex: plan.trackerKeyHex,
        trackerValueHex: plan.trackerValueHex,
        inputDigestHex: plan.inputDigestHex,
        successorDigestHex: plan.successorDigestHex,
      },
      trackerTransition: {
        trackerNftIdHex: plan.trackerNftIdHex,
        approvedTrustAnchorDigestHex:
          plan.approvedTrustAnchorDigestHex,
        inputValue: FIXTURE_TRACKER_VALUE,
        inputRegisters: plan.inputRegisters,
        successorRegisters: plan.successorRegisters,
        currentErgoHeight: plan.currentErgoHeight,
        anchorHeader: plan.anchorHeader,
        headers: headerContext.headers.map(header => ({
          raw: header.raw,
          id: header.id,
          parentId: header.parentId,
          height: header.height,
          extensionRootHex: header.extensionRootHex,
          jvmHeaderJson: header.jvmHeaderJson,
          serializedHex: header.serializedHex,
        })),
        provenance:
          BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
      },
      contextExtension: {
        keys: [0, 1, 2, 3] as const,
        valueTypes: [
          'Coll[Coll[Byte]]',
          'Coll[Byte]',
          'Coll[Byte]',
          'Int',
        ] as const,
        proofChunkLengths: proofChunks.map(chunk => chunk.length),
        applicationPayloadBytes: applicationPayload.length,
        proofBundleBytes: proofBundle.length,
        headerIndex,
        eip12Values,
        serializedHex: parsedSerialized.toString('hex'),
        serializedBytes: parsedSerialized.length,
        serializedBlake2b256Hex: blake2b256Hex(parsedSerialized),
      },
      eip12UnsignedTransaction,
      wasmRoundTripEip12,
      unsignedTransactionIdHex,
      prooflessTransactionIdHex,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      boundaries: {
        serializationConformanceOnly: true as const,
        exactTrackerSuccessorIncluded: true as const,
        canonicalSyntheticHeaderIdsEstablished: true as const,
        minedHeaderEvidenceEstablished: false as const,
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
    prooflessTransactionId?.free?.();
    prooflessTransaction?.free?.();
    unsignedId?.free?.();
    parsedHeaderIndex?.free?.();
    parsedBundle?.free?.();
    parsedPayload?.free?.();
    parsedProofChunks?.free?.();
    parsedExtension?.free?.();
    parsedInput?.free?.();
    unsignedInputs?.free?.();
    unsigned?.free?.();
    extension?.free?.();
    headerIndexConstant?.free?.();
    proofBundleConstant?.free?.();
    applicationPayloadConstant?.free?.();
    proofChunksConstant?.free?.();
  }
}

function assertHeaderContext(
  plan: ValiditySpvAdmissionV1Plan,
  context: BuildEip0045BridgeValidityTrackerContextV1Input['headerContext'],
): void {
  assertBridgeValidityTrackerCanonicalHeaderContextV1(context);
  if (
    context.provenance
      !== BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE
    || context.currentHeight !== plan.currentErgoHeight
    || context.anchorContextIndex !== plan.anchorHeader.contextIndex
    || context.headers.length !== 10
  ) {
    throw new Error(
      'validity tracker canonical synthetic header context mismatch',
    );
  }
  const anchor = context.headers[context.anchorContextIndex];
  if (
    anchor === undefined
    || anchor.id !== plan.anchorHeader.idHex
    || anchor.height !== plan.anchorHeader.height
    || anchor.extensionRootHex !== plan.anchorHeader.extensionRootHex
    || context.anchorHeader.id !== anchor.id
  ) {
    throw new Error('validity tracker canonical synthetic anchor mismatch');
  }
}

function assertType(value: any, expected: string, label: string): void {
  const actual = value.dbg_tpe();
  if (actual !== expected) {
    throw new Error(
      `${label} Sigma type mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

function assertChunks(
  actual: readonly Uint8Array[],
  expected: readonly Uint8Array[],
): void {
  if (actual.length !== expected.length) {
    throw new Error('validity tracker proof chunk count changed');
  }
  for (let index = 0; index < expected.length; index += 1) {
    assertBytes(actual[index], expected[index], `proof chunk ${index}`);
  }
}

function assertBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  if (!Buffer.from(actual).equals(Buffer.from(expected))) {
    throw new Error(`validity tracker ${label} bytes changed`);
  }
}

function exactHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function lowerHex(value: unknown, label: string): string {
  return exactHex(value, label);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const hex = exactHex(value, label);
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
      .map(([key, item]) =>
        `${JSON.stringify(key)}:${canonicalJson(item)}`)
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
