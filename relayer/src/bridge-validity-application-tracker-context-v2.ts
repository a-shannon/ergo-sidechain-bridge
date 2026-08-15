import blakejs from 'blakejs';

import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  assertEip0045BridgeApplicationProofEnvelopeV2Matches,
  type Eip0045BridgeApplicationProofEnvelopeV2,
  type Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext,
} from './bridge-validity-application-proof-envelope-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  assertBridgeValidityTrackerCanonicalHeaderContextV1,
  BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
  type BridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  buildApplicationValiditySpvTrackerGetProof,
  encodeApplicationValiditySpvTransitionProofBundle,
  type ApplicationValiditySpvAdmissionV2Plan,
} from './spv-tracker-validity-v2.js';

export const EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_V2_SCHEMA =
  'e2s.bridge-validity-application-tracker-context.v2';
export const EIP0045_BRIDGE_APPLICATION_TRACKER_BINDING_REJECTION_CONTEXT_V2_SCHEMA =
  'e2s.bridge-validity-application-tracker-binding-rejection-context.v2';
export const EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_KEYS =
  Object.freeze([0, 1, 2, 3] as const);
export const EIP0045_APPLICATION_TRACKER_INITIAL_INGRESS_BYTES = 262_144;

const FIXTURE_INPUT_BOX_ID_HEX = '66'.repeat(32);
const FIXTURE_TRACKER_VALUE = '10000000';

export interface Eip0045BridgeApplicationTrackerContextV2 {
  readonly schema:
    typeof EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_V2_SCHEMA;
  readonly version: 2;
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
    readonly applicationBindingHex:
      typeof EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX;
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
    readonly applicationPayloadBytes: 973;
    readonly proofBundleBytes: number;
    readonly headerIndex: number;
    readonly eip12Values:
      Readonly<Record<'0' | '1' | '2' | '3', string>>;
    readonly serializedHex: string;
    readonly serializedBytes: number;
    readonly serializedBlake2b256Hex: string;
  };
  readonly eip12UnsignedTransaction:
    Readonly<Eip12ApplicationTrackerUnsignedTransaction>;
  readonly wasmRoundTripEip12:
    Readonly<Eip12ApplicationTrackerUnsignedTransaction>;
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly rejectionVectors: {
    readonly duplicateKey: {
      readonly inputDigestHex: string;
      readonly getProofHex: string;
      readonly transitionProofBundleHex: string;
      readonly expectedContractAcceptance: false;
    };
  };
  readonly boundaries: {
    readonly serializationConformanceOnly: true;
    readonly exactTrackerSuccessorIncluded: true;
    readonly exactContractPinnedApplicationProfileIncluded: true;
    readonly selectedHeaderTupleIncluded: true;
    readonly canonicalSyntheticHeaderIdsEstablished: true;
    readonly proofValidityEstablishedByFixture: false;
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

export interface BuildEip0045BridgeApplicationTrackerContextV2Input {
  readonly plan: ApplicationValiditySpvAdmissionV2Plan;
  readonly envelope: Eip0045BridgeApplicationProofEnvelopeV2;
  readonly expected:
    Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext;
  readonly headerContext: BridgeValidityTrackerCanonicalHeaderContextV1;
}

export type Eip0045BridgeApplicationTrackerBindingRejectionContextV2 =
  Omit<
    Eip0045BridgeApplicationTrackerContextV2,
    'schema' | 'trackerTransition' | 'boundaries'
  > & {
    readonly schema:
      typeof EIP0045_BRIDGE_APPLICATION_TRACKER_BINDING_REJECTION_CONTEXT_V2_SCHEMA;
    readonly trackerTransition:
      Omit<
        Eip0045BridgeApplicationTrackerContextV2['trackerTransition'],
        'applicationBindingHex'
      > & {
        readonly applicationBindingHex: string;
      };
    readonly boundaries:
      Omit<
        Eip0045BridgeApplicationTrackerContextV2['boundaries'],
        'exactContractPinnedApplicationProfileIncluded'
      > & {
        readonly exactContractPinnedApplicationProfileIncluded: false;
        readonly expectedContractAcceptance: false;
      };
  };

export interface BuildEip0045BridgeApplicationTrackerBindingRejectionContextV2Input
  extends BuildEip0045BridgeApplicationTrackerContextV2Input {
  readonly alternateApplicationBindingHex: string;
}

interface Eip12ApplicationTrackerUnsignedTransaction {
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

export async function buildEip0045BridgeApplicationTrackerContextV2(
  input: BuildEip0045BridgeApplicationTrackerContextV2Input,
): Promise<Eip0045BridgeApplicationTrackerContextV2> {
  const envelope =
    assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      input.envelope,
      input.expected,
    );
  assertPlan(envelope, input.plan);
  return serializeEip0045BridgeApplicationTrackerContextV2(
    input,
    envelope,
    EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_V2_SCHEMA,
    EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    true,
  ) as Promise<Eip0045BridgeApplicationTrackerContextV2>;
}

export async function buildEip0045BridgeApplicationTrackerBindingRejectionContextV2(
  input: BuildEip0045BridgeApplicationTrackerBindingRejectionContextV2Input,
): Promise<Eip0045BridgeApplicationTrackerBindingRejectionContextV2> {
  const envelope =
    assertEip0045BridgeApplicationProofEnvelopeV2Matches(
      input.envelope,
      input.expected,
    );
  assertBindingRejectionPlan(
    envelope,
    input.plan,
    input.alternateApplicationBindingHex,
  );
  return serializeEip0045BridgeApplicationTrackerContextV2(
    input,
    envelope,
    EIP0045_BRIDGE_APPLICATION_TRACKER_BINDING_REJECTION_CONTEXT_V2_SCHEMA,
    input.alternateApplicationBindingHex,
    false,
  ) as Promise<Eip0045BridgeApplicationTrackerBindingRejectionContextV2>;
}

async function serializeEip0045BridgeApplicationTrackerContextV2(
  input: BuildEip0045BridgeApplicationTrackerContextV2Input,
  envelope: Eip0045BridgeApplicationProofEnvelopeV2,
  schema:
    | typeof EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_V2_SCHEMA
    | typeof EIP0045_BRIDGE_APPLICATION_TRACKER_BINDING_REJECTION_CONTEXT_V2_SCHEMA,
  applicationBindingHex: string,
  exactContractPinnedApplicationProfileIncluded: boolean,
): Promise<unknown> {
  const { plan, headerContext } = input;
  assertHeaderContext(plan, headerContext);
  const proofChunks = envelope.consumerAbi.proofChunksHex.map(chunk =>
    Uint8Array.from(Buffer.from(chunk, 'hex')));
  const applicationPayload = Uint8Array.from(Buffer.from(
    plan.applicationPayloadHex,
    'hex',
  ));
  const proofBundle = Uint8Array.from(Buffer.from(
    plan.transitionProofBundleHex,
    'hex',
  ));
  const decodedPayload =
    decodeBridgeValidityApplicationPayloadV3(plan.applicationPayloadHex);
  const duplicateKeyProof =
    buildApplicationValiditySpvTrackerGetProof(
      [{
        key: plan.trackerKeyHex,
        value: plan.trackerValueHex,
      }],
      {
        sidechainIdHex:
          decodedPayload.finality.checkpoint.sidechainIdHex,
        sidechainHeight: BigInt(plan.sidechainHeight),
        executionBlockHashHex:
          decodedPayload.finality.checkpoint.executionBlockHashHex,
      },
    );
  const duplicateKeyTransitionProofBundleHex =
    encodeApplicationValiditySpvTransitionProofBundle(
      plan.extensionProofHex,
      duplicateKeyProof.getProofHex,
    );
  const headerIndex = plan.suppliedAnchorTuple.contextIndex;
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
    assertType(proofChunksConstant, 'SColl(SColl(SByte))', 'proof chunks');
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
          EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
        assets: [{
          tokenId: plan.trackerNftIdHex,
          amount: '1',
        }],
        additionalRegisters: plan.successorRegisters,
        creationHeight: plan.currentErgoHeight,
      }],
    }) as Eip12ApplicationTrackerUnsignedTransaction;
    assertContextExtensionSafe(
      [...eip12UnsignedTransaction.inputs],
      'EIP-0045 bridge application tracker ContextExtension V2',
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_KEYS.length,
    );
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const wasmRoundTripEip12 = deepFreeze(
      unsigned.to_js_eip12(),
    ) as Eip12ApplicationTrackerUnsignedTransaction;
    if (
      canonicalJson(wasmRoundTripEip12)
      !== canonicalJson(eip12UnsignedTransaction)
    ) {
      throw new Error(
        'WASM changed the application tracker unsigned transaction',
      );
    }

    unsignedInputs = unsigned.inputs();
    if (unsignedInputs.len() !== 1) {
      throw new Error('application tracker transaction must have one input');
    }
    parsedInput = unsignedInputs.get(0);
    parsedExtension = parsedInput.extension();
    const parsedKeys = [...parsedExtension.keys()];
    if (
      parsedKeys.length !== 4
      || parsedKeys.some(
        (key, index) =>
          key !== EIP0045_BRIDGE_APPLICATION_TRACKER_CONTEXT_KEYS[index],
      )
    ) {
      throw new Error(
        'application tracker ContextExtension keys must be [0,1,2,3]',
      );
    }
    const parsedSerialized =
      Buffer.from(parsedExtension.sigma_serialize_bytes());
    if (!parsedSerialized.equals(serialized)) {
      throw new Error(
        'application tracker ContextExtension bytes changed after round trip',
      );
    }
    parsedProofChunks = parsedExtension.get(0);
    parsedPayload = parsedExtension.get(1);
    parsedBundle = parsedExtension.get(2);
    parsedHeaderIndex = parsedExtension.get(3);
    assertType(parsedProofChunks, 'SColl(SColl(SByte))', 'parsed chunks');
    assertType(parsedPayload, 'SColl(SByte)', 'parsed payload');
    assertType(parsedBundle, 'SColl(SByte)', 'parsed proof bundle');
    assertType(parsedHeaderIndex, 'SInt', 'parsed header index');
    assertChunks(parsedProofChunks.to_coll_coll_byte(), proofChunks);
    assertBytes(parsedPayload.to_byte_array(), applicationPayload, 'payload');
    assertBytes(parsedBundle.to_byte_array(), proofBundle, 'proof bundle');
    if (parsedHeaderIndex.to_i32() !== headerIndex) {
      throw new Error('application tracker header index changed');
    }

    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'application tracker unsigned transaction ID',
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
      'application tracker proofless transaction ID',
    );
    const prooflessBytes =
      Buffer.from(prooflessTransaction.sigma_serialize_bytes());
    if (
      prooflessBytes.length
      > EIP0045_APPLICATION_TRACKER_INITIAL_INGRESS_BYTES
    ) {
      throw new Error(
        'application tracker transaction exceeds the EIP-0045 ingress bound',
      );
    }
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error(
        'application tracker proofless bytes and transaction IDs differ',
      );
    }

    return deepFreeze({
      schema,
      version: 2 as const,
      sourceAdmission: {
        statementDigestHex: plan.statementDigestHex,
        rawSealDigestHex: envelope.rawSealDigestHex,
        trackerKeyHex: plan.trackerKeyHex,
        trackerValueHex: plan.trackerValueHex,
        inputDigestHex: plan.inputDigestHex,
        successorDigestHex: plan.successorDigestHex,
      },
      trackerTransition: {
        trackerNftIdHex: plan.trackerNftIdHex,
        approvedTrustAnchorDigestHex:
          plan.expectedTrustAnchorDigestHex,
        applicationBindingHex,
        inputValue: FIXTURE_TRACKER_VALUE,
        inputRegisters: plan.inputRegisters,
        successorRegisters: plan.successorRegisters,
        currentErgoHeight: plan.currentErgoHeight,
        anchorHeader: {
          idHex: plan.suppliedAnchorTuple.idHex,
          height: plan.suppliedAnchorTuple.height,
          extensionRootHex: plan.suppliedAnchorTuple.extensionRootHex,
          contextIndex: plan.suppliedAnchorTuple.contextIndex,
        },
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
        applicationPayloadBytes: 973 as const,
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
      rejectionVectors: {
        duplicateKey: {
          inputDigestHex: duplicateKeyProof.digestHex,
          getProofHex: duplicateKeyProof.getProofHex,
          transitionProofBundleHex:
            duplicateKeyTransitionProofBundleHex,
          expectedContractAcceptance: false as const,
        },
      },
      boundaries: {
        serializationConformanceOnly: true as const,
        exactTrackerSuccessorIncluded: true as const,
        exactContractPinnedApplicationProfileIncluded,
        selectedHeaderTupleIncluded: true as const,
        canonicalSyntheticHeaderIdsEstablished: true as const,
        proofValidityEstablishedByFixture: false as const,
        minedHeaderEvidenceEstablished: false as const,
        signingPerformed: false as const,
        nodeCheckPerformed: false as const,
        submissionPerformed: false as const,
        broadcastPerformed: false as const,
        profileActivated: false as const,
        gate5Closed: false as const,
        fundsAuthorityEstablished: false as const,
        ...(
          exactContractPinnedApplicationProfileIncluded
            ? {}
            : { expectedContractAcceptance: false as const }
        ),
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

function assertPlan(
  envelope: Eip0045BridgeApplicationProofEnvelopeV2,
  plan: ApplicationValiditySpvAdmissionV2Plan,
): void {
  const payload =
    decodeBridgeValidityApplicationPayloadV3(plan.applicationPayloadHex);
  const application = payload.application;
  const exactBindings = [
    [
      plan.contractIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
      'contract ID',
    ],
    [
      plan.encodedStatementHex,
      envelope.encodedStatementHex,
      'statement',
    ],
    [
      plan.statementDigestHex,
      envelope.statementDigestHex,
      'statement digest',
    ],
    [
      plan.applicationPayloadHex,
      envelope.consumerAbi.applicationPayloadHex,
      'application payload',
    ],
    [
      plan.expectedSourceNetworkIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
      'source network',
    ],
    [
      plan.expectedSidechainIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      'sidechain',
    ],
    [
      plan.expectedSettlementProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
      'settlement profile',
    ],
    [
      plan.expectedCausalProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
      'causal profile',
    ],
    [
      application.encodedBindingHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      'application binding',
    ],
  ] as const;
  for (const [actual, expected, label] of exactBindings) {
    if (actual !== expected) {
      throw new Error(
        `application tracker plan ${label} does not match the contract profile`,
      );
    }
  }
  assertUnsupportedAuthorityBoundaries(plan);
}

function assertBindingRejectionPlan(
  envelope: Eip0045BridgeApplicationProofEnvelopeV2,
  plan: ApplicationValiditySpvAdmissionV2Plan,
  alternateApplicationBindingHex: string,
): void {
  assertExactBridgeRuntimeHashRejectionBinding(
    alternateApplicationBindingHex,
  );
  const payload =
    decodeBridgeValidityApplicationPayloadV3(plan.applicationPayloadHex);
  const application = payload.application;
  const exactBindings = [
    [
      plan.contractIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
      'contract ID',
    ],
    [
      plan.encodedStatementHex,
      envelope.encodedStatementHex,
      'statement',
    ],
    [
      plan.statementDigestHex,
      envelope.statementDigestHex,
      'statement digest',
    ],
    [
      plan.applicationPayloadHex,
      envelope.consumerAbi.applicationPayloadHex,
      'application payload',
    ],
    [
      plan.expectedSourceNetworkIdHex,
      application.sourceNetworkIdHex,
      'source network',
    ],
    [
      plan.expectedSidechainIdHex,
      application.sidechainIdHex,
      'sidechain',
    ],
    [
      plan.expectedSettlementProfileIdHex,
      application.settlementProfileIdHex,
      'settlement profile',
    ],
    [
      plan.expectedCausalProfileIdHex,
      application.causalProfileIdHex,
      'causal profile',
    ],
    [
      application.encodedBindingHex,
      alternateApplicationBindingHex,
      'alternate application binding',
    ],
  ] as const;
  for (const [actual, expected, label] of exactBindings) {
    if (actual !== expected) {
      throw new Error(
        `application tracker rejection plan ${label} mismatch`,
      );
    }
  }
  assertUnsupportedAuthorityBoundaries(plan);
}

function assertExactBridgeRuntimeHashRejectionBinding(
  alternateApplicationBindingHex: string,
): void {
  if (!/^[0-9a-f]{480}$/.test(alternateApplicationBindingHex)) {
    throw new Error(
      'application tracker rejection binding must be exactly 240 lowercase hex bytes',
    );
  }
  const canonical = Buffer.from(
    EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    'hex',
  );
  const alternate = Buffer.from(alternateApplicationBindingHex, 'hex');
  const differences = [...canonical.keys()].filter(
    index => canonical[index] !== alternate[index],
  );
  if (
    differences.length !== 1
    || differences[0] !== 168
    || canonical[168] !== 0xbb
    || alternate[168] !== 0xba
  ) {
    throw new Error(
      'application tracker rejection binding must change only the first bridge runtime hash byte',
    );
  }
}

function assertUnsupportedAuthorityBoundaries(
  plan: ApplicationValiditySpvAdmissionV2Plan,
): void {
  if (
    plan.boundaries.anchorHeaderTupleAuthenticated
    || plan.boundaries.expectedIdentitiesAuthorityEstablished
    || plan.boundaries.proofTransportValidated
    || plan.boundaries.proofValidityEstablishedByPlanner
    || plan.boundaries.profileActivated
    || plan.boundaries.onChainAcceptanceEstablished
    || plan.boundaries.fundsAuthorityEstablished
    || plan.boundaries.gate5Closed
  ) {
    throw new Error(
      'application tracker planner promoted an unsupported authority boundary',
    );
  }
}

function assertHeaderContext(
  plan: ApplicationValiditySpvAdmissionV2Plan,
  context: BridgeValidityTrackerCanonicalHeaderContextV1,
): void {
  assertBridgeValidityTrackerCanonicalHeaderContextV1(context);
  if (
    context.currentHeight !== plan.currentErgoHeight
    || context.anchorContextIndex !== plan.suppliedAnchorTuple.contextIndex
    || context.headers.length !== 10
  ) {
    throw new Error(
      'application tracker canonical synthetic header context mismatch',
    );
  }
  const anchor = context.headers[context.anchorContextIndex];
  if (
    anchor === undefined
    || anchor.id !== plan.suppliedAnchorTuple.idHex
    || anchor.height !== plan.suppliedAnchorTuple.height
    || anchor.extensionRootHex
      !== plan.suppliedAnchorTuple.extensionRootHex
    || context.anchorHeader !== anchor
  ) {
    throw new Error(
      'application tracker selected synthetic anchor tuple mismatch',
    );
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
    throw new Error('application tracker proof chunk count changed');
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
    throw new Error(`application tracker ${label} bytes changed`);
  }
}

function lowerHex(value: unknown, label: string): string {
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

function fixedHex(value: unknown, bytes: number, label: string): string {
  const hex = lowerHex(value, label);
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
