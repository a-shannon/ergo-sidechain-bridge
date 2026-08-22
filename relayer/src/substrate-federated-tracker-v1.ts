import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import { assertContextExtensionSafe } from './context-extension-guard.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import { buildErgoExtensionMembershipProof } from './ergo-extension-membership.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  decodeSubstrateFederatedCheckpointStatementV1ForAdmission,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
  type SubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
  SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import type {
  SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA =
  'e2s.substrate-federated-v1-tracker-context' as const;
export const SUBSTRATE_FEDERATED_TRACKER_V1_CONTEXT_KEYS =
  Object.freeze([0, 1, 2] as const);

const SIGMA_STATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa' as const;
const TEMPLATE_SOURCE_SHA256_HEX =
  '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852' as const;
const RESOLVED_SOURCE_SHA256_HEX =
  '7b8a1d7efe253360dfb2ae21ecd44199c061176e7e73a6f87960b66e304311d8' as const;
const PROPOSITION_BYTES = 2_713 as const;
const PROPOSITION_SHA256_HEX =
  '8de007e45b4528614885b922732c1d1b2f38bc76bc73f4468f91ccb85d4f7a80' as const;
const CONTRACT_ID_HEX =
  '4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c' as const;
const CONTRACT_IDENTITY_CANONICAL_SHA256_HEX =
  '4dbc257777e47b8214fa5eab9258748d84d464a1efaed1782ea1277d9b3d7857' as const;
const TRACKER_VALUE = '10000000' as const;
const FIXTURE_SETUP_INPUT_BOX_ID_HEX = '67'.repeat(32);
const MAX_INGRESS_BYTES = 262_144;

export interface SubstrateFederatedTrackerContractV1Identity {
  readonly schema: 'e2s.substrate-federated-v1-tracker-contract';
  readonly version: 1;
  readonly sigmaStateCommit: string;
  readonly templateSourceSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
  readonly trackerNftIdHex: string;
  readonly application: {
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
  };
  readonly federationProfileIdHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
  readonly federationEpoch: string;
  readonly maxAdmissionValidityBlocks: string;
  readonly sourceSignaturesVerifiedOnChain: false;
  readonly jvmReductionAccepted: false;
  readonly profileActivated: false;
  readonly signingPerformed: false;
  readonly submissionPerformed: false;
  readonly broadcastPerformed: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
  readonly trustlessStatusEstablished: false;
}

export interface BuildSubstrateFederatedTrackerV1Input {
  readonly contract: Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly encodedStatementHex: string;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
}

export interface BuildCompilerBoundSubstrateFederatedTrackerV1Input {
  readonly compilerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly compilerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly trackerInputBox: unknown;
  readonly encodedStatementHex: string;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
}

export interface SubstrateFederatedTrackerV1Context {
  readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA;
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly contract: Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly statement: {
    readonly encodedHex: string;
    readonly statementIdHex: string;
    readonly sourceSignaturesVerifiedOnChain: false;
  };
  readonly trackerTransition: {
    readonly trackerNftIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly inputValue: typeof TRACKER_VALUE;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly inputRegisters:
      Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
    readonly successorRegisters:
      Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly extensionProofHex: string;
    readonly avlInsertProofHex: string;
    readonly transitionProofBundleHex: string;
    readonly headers: readonly {
      readonly id: string;
      readonly height: number;
      readonly extensionRootHex: string;
      readonly jvmHeaderJson: string;
      readonly serializedHex: string;
    }[];
  };
  readonly contextExtension: {
    readonly keys: readonly [0, 1, 2];
    readonly serializedHex: string;
    readonly serializedBytes: number;
    readonly eip12Values: Readonly<Record<'0' | '1' | '2', string>>;
  };
  readonly inputBoxSigmaHex: string;
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly unsignedTransactionIdHex: string;
  readonly boundaries: {
    readonly contractIdentityBound: true;
    readonly statementAndProfileValidated: true;
    readonly anchorMembershipConstructed: true;
    readonly exactContextExtensionRoundTrip: true;
    readonly avlTransitionConstructed: true;
    readonly sourceSignaturesVerifiedOnChain: false;
    readonly jvmReductionAccepted: false;
    readonly nodeCheckPerformed: false;
    readonly profileActivated: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  };
}

export function assertSubstrateFederatedTrackerContractV1Identity(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedTrackerContractV1Identity> {
  if (value === null || typeof value !== 'object') {
    throw new Error('substrate federated tracker V1 contract identity is invalid');
  }
  const identity = assertContractIdentity(
    value as Readonly<SubstrateFederatedTrackerContractV1Identity>,
  );
  if (
    sha256Hex(Buffer.from(canonicalJson(identity), 'utf8'))
      !== CONTRACT_IDENTITY_CANONICAL_SHA256_HEX
  ) {
    throw new Error(
      'substrate federated tracker V1 contract identity metadata is not the pinned artifact',
    );
  }
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildSubstrateFederatedTrackerV1Context(
  input: BuildSubstrateFederatedTrackerV1Input,
): Promise<Readonly<SubstrateFederatedTrackerV1Context>> {
  const contract = assertContractIdentity(input.contract);
  return buildTrackerContext({
    contract,
    profile: input.profile,
    encodedStatementHex: input.encodedStatementHex,
    currentErgoHeight: input.currentErgoHeight,
    anchorContextIndex: input.anchorContextIndex,
  });
}

export async function buildCompilerBoundSubstrateFederatedTrackerV1Context(
  input: BuildCompilerBoundSubstrateFederatedTrackerV1Input,
): Promise<Readonly<SubstrateFederatedTrackerV1Context>> {
  const compilerReceipt = assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    input.compilerReceipt,
    input.compilerRequest,
  );
  const contract = compilerBoundContractIdentity(
    input.compilerRequest,
    compilerReceipt,
  );
  const trackerInputBox = await normalizeEip12Box(
    input.trackerInputBox,
    'compiler-bound federated tracker input box',
  );
  return buildTrackerContext({
    contract,
    profile: input.compilerRequest.profile,
    encodedStatementHex: input.encodedStatementHex,
    currentErgoHeight: input.currentErgoHeight,
    anchorContextIndex: input.anchorContextIndex,
    trackerInputBox,
  });
}

async function buildTrackerContext(input: Readonly<{
  readonly contract: Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly encodedStatementHex: string;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
  readonly trackerInputBox?: Readonly<Eip12Box>;
}>): Promise<Readonly<SubstrateFederatedTrackerV1Context>> {
  const contract = input.contract;
  const statement = decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
    input.encodedStatementHex,
    input.profile,
    input.currentErgoHeight,
  );
  assertProfileAndApplicationBindings(contract, input.profile, statement);
  const extensionValueHex = encodeSubstrateFederatedCheckpointExtensionValueV1(
    statement.encodedStatementHex,
  );
  const extensionProof = buildErgoExtensionMembershipProof([
    {
      key: Buffer.from('0100', 'hex'),
      value: Buffer.from('fixture-side-field', 'ascii'),
    },
    {
      key: Buffer.from('0401', 'hex'),
      value: Buffer.from(extensionValueHex, 'hex'),
    },
  ], Buffer.from('0401', 'hex'));
  const wasm = await getWasm();
  const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: positiveInt(input.currentErgoHeight, 'current Ergo height'),
    anchorContextIndex: nonnegativeInt(
      input.anchorContextIndex,
      'anchor context index',
    ),
    anchorExtensionRootHex: extensionProof.root.toString('hex'),
  });
  const anchor = headers.anchorHeader;
  const admission = buildSubstrateFederatedTrackerAdmissionV1({
    profile: input.profile,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: input.currentErgoHeight,
    anchorHeaderIdHex: anchor.id,
    anchorHeaderHeight: anchor.height,
  });
  if (admission.extensionValueHex !== extensionValueHex) {
    throw new Error('federated tracker extension value changed during construction');
  }
  const inputDigestHex = exactHex(
    tracker_application_v2_empty_digest(),
    33,
    'empty federated tracker digest',
  );
  const inserted = JSON.parse(tracker_application_v2_insert(
    '[]',
    admission.trackerKeyHex,
    admission.trackerValueHex,
  )) as Readonly<Record<string, unknown>>;
  const successorDigestHex = exactHex(
    inserted.new_digest_hex,
    33,
    'successor federated tracker digest',
  );
  const avlInsertProofHex = variableHex(
    inserted.insert_proof_hex,
    'federated tracker AVL insert proof',
  );
  const transitionProofBundleHex = Buffer.concat([
    uint64Be(BigInt(extensionProof.proof.length)),
    extensionProof.proof,
    Buffer.from(avlInsertProofHex, 'hex'),
  ]).toString('hex');
  const genesisRegisters = Object.freeze({
    R4: encodeCollByteRegister(Buffer.from(input.profile.profileIdHex, 'hex')),
    R5: encodeTrackerAvlRegister(inputDigestHex),
    R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(
      input.profile.ergoAdmissionKeySetDigestHex,
      'hex',
    )),
  });
  const inputRegisters = input.trackerInputBox === undefined
    ? Object.freeze({
        ...genesisRegisters,
        R8: encodeIntRegister(input.currentErgoHeight - 1),
      })
    : assertCompilerBoundTrackerInputBox(
        input.trackerInputBox,
        contract,
        genesisRegisters,
        input.currentErgoHeight,
      );
  const successorRegisters = Object.freeze({
    R4: inputRegisters.R4,
    R5: encodeTrackerAvlRegister(successorDigestHex),
    R6: inputRegisters.R6,
    R7: encodeLongRegister(BigInt(statement.sourceNativeBlockHeight)),
    R8: encodeIntRegister(input.currentErgoHeight),
    R9: inputRegisters.R9,
  });
  const serialized = await serializeContext({
    wasm,
    contract,
    statementHex: statement.encodedStatementHex,
    transitionProofBundleHex,
    inputRegisters,
    successorRegisters,
    currentErgoHeight: input.currentErgoHeight,
    anchorContextIndex: input.anchorContextIndex,
    trackerInputBox: input.trackerInputBox,
  });

  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA,
    version: 1 as const,
    trustModel: 'federated_non_trustless' as const,
    contract,
    statement: {
      encodedHex: statement.encodedStatementHex,
      statementIdHex: statement.statementIdHex,
      sourceSignaturesVerifiedOnChain: false as const,
    },
    trackerTransition: {
      trackerNftIdHex: contract.trackerNftIdHex,
      trackerKeyHex: admission.trackerKeyHex,
      trackerValueHex: admission.trackerValueHex,
      inputValue: TRACKER_VALUE,
      inputDigestHex,
      successorDigestHex,
      inputRegisters,
      successorRegisters,
      currentErgoHeight: input.currentErgoHeight,
      anchorContextIndex: input.anchorContextIndex,
      extensionProofHex: extensionProof.proof.toString('hex'),
      avlInsertProofHex,
      transitionProofBundleHex,
      headers: headers.headers.map(header => ({
        id: header.id,
        height: header.height,
        extensionRootHex: header.extensionRootHex,
        jvmHeaderJson: header.jvmHeaderJson,
        serializedHex: header.serializedHex,
      })),
    },
    contextExtension: serialized.contextExtension,
    inputBoxSigmaHex: serialized.inputBoxSigmaHex,
    eip12UnsignedTransaction: serialized.eip12UnsignedTransaction,
    prooflessTransactionHex: serialized.prooflessTransactionHex,
    prooflessTransactionBytes: serialized.prooflessTransactionBytes,
    unsignedTransactionIdHex: serialized.unsignedTransactionIdHex,
    boundaries: {
      contractIdentityBound: true as const,
      statementAndProfileValidated: true as const,
      anchorMembershipConstructed: true as const,
      exactContextExtensionRoundTrip: true as const,
      avlTransitionConstructed: true as const,
      sourceSignaturesVerifiedOnChain: false as const,
      jvmReductionAccepted: false as const,
      nodeCheckPerformed: false as const,
      profileActivated: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
}

async function serializeContext(input: {
  readonly wasm: any;
  readonly contract: Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly statementHex: string;
  readonly transitionProofBundleHex: string;
  readonly inputRegisters: Readonly<Record<string, string>>;
  readonly successorRegisters: Readonly<Record<string, string>>;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
  readonly trackerInputBox?: Readonly<Eip12Box>;
}): Promise<{
  readonly contextExtension: SubstrateFederatedTrackerV1Context['contextExtension'];
  readonly inputBoxSigmaHex: string;
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly unsignedTransactionIdHex: string;
}> {
  const { wasm } = input;
  let statementConstant: any;
  let bundleConstant: any;
  let indexConstant: any;
  let extension: any;
  let setupUnsigned: any;
  let setupId: any;
  let setupCandidates: any;
  let setupCandidate: any;
  let inputBox: any;
  let inputBoxId: any;
  let unsigned: any;
  let proofless: any;
  let unsignedId: any;
  try {
    statementConstant = wasm.Constant.from_byte_array(
      Uint8Array.from(Buffer.from(input.statementHex, 'hex')),
    );
    bundleConstant = wasm.Constant.from_byte_array(
      Uint8Array.from(Buffer.from(input.transitionProofBundleHex, 'hex')),
    );
    indexConstant = wasm.Constant.from_i32(input.anchorContextIndex);
    extension = new wasm.ContextExtension();
    extension.set_pair(0, statementConstant);
    extension.set_pair(1, bundleConstant);
    extension.set_pair(2, indexConstant);
    const eip12Values = Object.freeze({
      '0': lowerHex(statementConstant.encode_to_base16(), 'statement constant'),
      '1': lowerHex(bundleConstant.encode_to_base16(), 'proof bundle constant'),
      '2': lowerHex(indexConstant.encode_to_base16(), 'header index constant'),
    });
    if (input.trackerInputBox === undefined) {
      setupUnsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
        inputs: [{ boxId: FIXTURE_SETUP_INPUT_BOX_ID_HEX, extension: {} }],
        dataInputs: [],
        outputs: [{
          value: TRACKER_VALUE,
          ergoTree: input.contract.propositionHex,
          assets: [{ tokenId: input.contract.trackerNftIdHex, amount: '1' }],
          additionalRegisters: input.inputRegisters,
          creationHeight: input.currentErgoHeight - 1,
        }],
      }));
      setupId = setupUnsigned.id();
      setupCandidates = setupUnsigned.output_candidates();
      if (setupCandidates.len() !== 1) {
        throw new Error('federated tracker setup must contain one output');
      }
      setupCandidate = setupCandidates.get(0);
      inputBox = wasm.ErgoBox.from_box_candidate(setupCandidate, setupId, 0);
      setupCandidate = undefined;
      setupId = undefined;
    } else {
      inputBox = wasm.ErgoBox.from_json(JSON.stringify(input.trackerInputBox));
      if (
        canonicalJson(inputBox.to_js_eip12())
          !== canonicalJson(input.trackerInputBox)
      ) {
        throw new Error('compiler-bound federated tracker input box drifted');
      }
    }
    inputBoxId = inputBox.box_id();
    const inputBoxIdHex = exactHex(inputBoxId.to_str(), 32, 'tracker input box ID');
    const inputBoxSigmaHex = Buffer.from(
      inputBox.sigma_serialize_bytes(),
    ).toString('hex');
    const eip12UnsignedTransaction = deepFreeze({
      inputs: [{ boxId: inputBoxIdHex, extension: eip12Values }],
      dataInputs: [],
      outputs: [{
        value: TRACKER_VALUE,
        ergoTree: input.contract.propositionHex,
        assets: [{ tokenId: input.contract.trackerNftIdHex, amount: '1' }],
        additionalRegisters: input.successorRegisters,
        creationHeight: input.currentErgoHeight,
      }],
    });
    assertContextExtensionSafe(
      eip12UnsignedTransaction.inputs,
      'substrate federated tracker V1 ContextExtension',
      SUBSTRATE_FEDERATED_TRACKER_V1_CONTEXT_KEYS.length,
    );
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    if (canonicalJson(unsigned.to_js_eip12()) !== canonicalJson(eip12UnsignedTransaction)) {
      throw new Error('WASM changed the federated tracker transaction');
    }
    const serializedExtension = Buffer.from(extension.sigma_serialize_bytes());
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = exactHex(
      unsignedId.to_str(),
      32,
      'unsigned transaction ID',
    );
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (prooflessBytes.length > MAX_INGRESS_BYTES) {
      throw new Error('federated tracker transaction exceeds the ingress bound');
    }
    if (blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex) {
      throw new Error('federated tracker transaction ID mismatch');
    }
    return deepFreeze({
      contextExtension: {
        keys: [0, 1, 2] as const,
        serializedHex: serializedExtension.toString('hex'),
        serializedBytes: serializedExtension.length,
        eip12Values,
      },
      inputBoxSigmaHex,
      eip12UnsignedTransaction,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      unsignedTransactionIdHex,
    });
  } finally {
    unsignedId?.free?.();
    proofless?.free?.();
    unsigned?.free?.();
    inputBoxId?.free?.();
    inputBox?.free?.();
    setupCandidate?.free?.();
    setupCandidates?.free?.();
    setupId?.free?.();
    setupUnsigned?.free?.();
    extension?.free?.();
    indexConstant?.free?.();
    bundleConstant?.free?.();
    statementConstant?.free?.();
  }
}

function compilerBoundContractIdentity(
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>,
): Readonly<SubstrateFederatedTrackerContractV1Identity> {
  const profile = request.profile;
  return deepFreeze({
    schema: 'e2s.substrate-federated-v1-tracker-contract' as const,
    version: 1 as const,
    sigmaStateCommit: request.sigmaStateCommit,
    templateSourceSha256Hex: request.template.templateSourceSha256Hex,
    resolvedSourceSha256Hex: receipt.contract.resolvedSourceSha256Hex,
    propositionBytes: receipt.contract.propositionBytes,
    propositionSha256Hex: receipt.contract.propositionSha256Hex,
    propositionHex: receipt.contract.propositionHex,
    contractIdHex: receipt.contract.contractIdHex,
    trackerNftIdHex: request.trackerNftIdHex,
    application: request.application,
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: profile.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: profile.ergoAdmissionPublicKeysHex,
    federationEpoch: profile.federationEpoch,
    maxAdmissionValidityBlocks: profile.maxAdmissionValidityBlocks,
    sourceSignaturesVerifiedOnChain: false as const,
    jvmReductionAccepted: false as const,
    profileActivated: false as const,
    signingPerformed: false as const,
    submissionPerformed: false as const,
    broadcastPerformed: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
  });
}

function assertCompilerBoundTrackerInputBox(
  box: Readonly<Eip12Box>,
  contract: Readonly<SubstrateFederatedTrackerContractV1Identity>,
  expectedRegisters: Readonly<
    Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>
  >,
  currentErgoHeight: number,
): Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>> {
  const registerKeys = Object.keys(box.additionalRegisters).sort();
  if (
    box.value !== TRACKER_VALUE
    || box.ergoTree !== contract.propositionHex
    || box.assets.length !== 1
    || box.assets[0]?.tokenId !== contract.trackerNftIdHex
    || box.assets[0]?.amount !== '1'
    || registerKeys.join(',') !== 'R4,R5,R6,R7,R8,R9'
    || registerKeys.some(key => (
      box.additionalRegisters[key] !== expectedRegisters[
        key as keyof typeof expectedRegisters
      ]
    ))
    || !Number.isSafeInteger(box.creationHeight)
    || box.creationHeight < 0
    || box.creationHeight >= currentErgoHeight
  ) {
    throw new Error(
      'compiler-bound federated tracker input box differs from genesis state',
    );
  }
  return Object.freeze({
    R4: box.additionalRegisters.R4,
    R5: box.additionalRegisters.R5,
    R6: box.additionalRegisters.R6,
    R7: box.additionalRegisters.R7,
    R8: box.additionalRegisters.R8,
    R9: box.additionalRegisters.R9,
  });
}

function assertProfileAndApplicationBindings(
  contract: Readonly<SubstrateFederatedTrackerContractV1Identity>,
  profile: Readonly<SubstrateFederatedCheckpointProfileV1>,
  statement: ReturnType<typeof decodeSubstrateFederatedCheckpointStatementV1ForAdmission>,
): void {
  const exact = [
    [contract.federationProfileIdHex, profile.profileIdHex],
    [contract.sourceAttestationKeySetDigestHex, profile.sourceAttestationKeySetDigestHex],
    [contract.sourceAttestationThreshold, profile.sourceAttestationThreshold],
    [contract.ergoAdmissionKeySetDigestHex, profile.ergoAdmissionKeySetDigestHex],
    [contract.ergoAdmissionThreshold, profile.ergoAdmissionThreshold],
    [contract.federationEpoch, profile.federationEpoch],
    [contract.maxAdmissionValidityBlocks, profile.maxAdmissionValidityBlocks],
    [contract.application.sourceNetworkIdHex, statement.sourceNetworkIdHex],
    [contract.application.sidechainIdHex, statement.sidechainIdHex],
    [contract.application.bridgeAddressHex, statement.bridgeAddressHex],
    [contract.application.tokenAddressHex, statement.tokenAddressHex],
    [contract.application.bridgeRuntimeCodeSha256Hex, statement.bridgeRuntimeCodeSha256Hex],
    [contract.application.bridgeRuntimeCodeBytes, statement.bridgeRuntimeCodeBytes],
    [contract.application.tokenRuntimeCodeSha256Hex, statement.tokenRuntimeCodeSha256Hex],
    [contract.application.tokenRuntimeCodeBytes, statement.tokenRuntimeCodeBytes],
    [contract.application.sourceRuntimeCodeSha256Hex, statement.sourceRuntimeCodeSha256Hex],
    [contract.application.sourceRuntimeCodeBytes, statement.sourceRuntimeCodeBytes],
    [contract.application.runtimeProfileIdHex, statement.runtimeProfileIdHex],
    [contract.application.settlementProfileIdHex, statement.settlementProfileIdHex],
  ] as const;
  if (exact.some(([left, right]) => left !== right)) {
    throw new Error('federated tracker statement differs from the compiled profile');
  }
  if (
    contract.ergoAdmissionPublicKeysHex.length
      !== profile.ergoAdmissionPublicKeysHex.length
    || contract.ergoAdmissionPublicKeysHex.some(
      (key, index) => key !== profile.ergoAdmissionPublicKeysHex[index],
    )
  ) {
    throw new Error('federated tracker Ergo admission keys differ from the compiled profile');
  }
}

function assertContractIdentity(
  value: Readonly<SubstrateFederatedTrackerContractV1Identity>,
): Readonly<SubstrateFederatedTrackerContractV1Identity> {
  if (
    value.schema !== 'e2s.substrate-federated-v1-tracker-contract'
    || value.version !== 1
    || value.sigmaStateCommit !== SIGMA_STATE_COMMIT
    || value.templateSourceSha256Hex !== TEMPLATE_SOURCE_SHA256_HEX
    || value.resolvedSourceSha256Hex !== RESOLVED_SOURCE_SHA256_HEX
    || value.propositionBytes !== PROPOSITION_BYTES
    || value.propositionSha256Hex !== PROPOSITION_SHA256_HEX
    || value.contractIdHex !== CONTRACT_ID_HEX
    || value.propositionHex.length !== value.propositionBytes * 2
    || sha256Hex(Buffer.from(value.propositionHex, 'hex'))
      !== value.propositionSha256Hex
    || blake2b256Hex(Buffer.from(value.propositionHex, 'hex'))
      !== value.contractIdHex
    || !/^[0-9a-f]{64}$/.test(value.trackerNftIdHex)
    || value.sourceSignaturesVerifiedOnChain
    || value.jvmReductionAccepted
    || value.profileActivated
    || value.signingPerformed
    || value.submissionPerformed
    || value.broadcastPerformed
    || value.fundsAuthorityEstablished
    || value.gate5Closed
    || value.trustlessStatusEstablished
  ) {
    throw new Error('substrate federated tracker V1 contract identity is invalid');
  }
  return value;
}

function encodeTrackerAvlRegister(digestHex: string): string {
  return encodeAvlTreeRegister(
    Buffer.from(exactHex(digestHex, 33, 'federated tracker digest'), 'hex'),
    1,
    SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
  );
}

function uint64Be(value: bigint): Buffer {
  if (value < 0n || value > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('uint64 value exceeds the signed tracker range');
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function exactHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase whole-byte hex`);
  }
  return value;
}

function lowerHex(value: unknown, label: string): string {
  return variableHex(value, label);
}

function positiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function nonnegativeInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a nonnegative signed Int`);
  }
  return value;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
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
