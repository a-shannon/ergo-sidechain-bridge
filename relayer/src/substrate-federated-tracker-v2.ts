import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_insert,
  tracker_application_v2_verify_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
  assertBridgeValidityTrackerObservedHeaderContextV1,
  type BridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import { assertContextExtensionSafe } from './context-extension-guard.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import { verifyErgoExtensionMembership } from './ergo-settlement-core/ergo-extension-membership.js';
import {
  decodeSubstrateFederatedCheckpointStatementV1ForAdmission,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
  SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import { canonicalJson } from './strict-json.js';
import type { SubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';
import { normalizeEip12Box, type Eip12Box } from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_TRACKER_V2_SCHEMA =
  'e2s.substrate-federated-v2-tracker-context' as const;
export const SUBSTRATE_FEDERATED_TRACKER_V2_CONTEXT_KEYS =
  Object.freeze([0, 1, 2] as const);

const TRACKER_VALUE = '10000000' as const;
const MAX_INGRESS_BYTES = 262_144;
type Registers = Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;

export interface BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Input {
  readonly compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly compilerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
  readonly trackerInputBox: unknown;
  readonly encodedStatementHex: string;
  readonly observedHeaderContext: Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
  readonly extensionMembershipProofHex: string;
}

export interface BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationInput
  extends BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Input {
  readonly previousContext: Readonly<SubstrateFederatedTrackerV2Context>;
}

export interface SubstrateFederatedTrackerV2Context {
  readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V2_SCHEMA;
  readonly version: 2;
  readonly trustModel: 'federated_non_trustless';
  readonly compilerRequestDigestHex: string;
  readonly compilerReceiptDigestHex: string;
  readonly contract: SubstrateFederatedTrackerJvmCompilerReceiptV2['contract'] &
    Readonly<{ trackerNftIdHex: string }>;
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
    readonly inputRegisters: Registers;
    readonly successorRegisters: Registers;
    readonly currentErgoHeight: number;
    readonly anchorHeight: number;
    readonly anchorContextProvenance:
      typeof BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE;
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
    readonly feesIncluded: false;
    readonly sourceSignaturesVerifiedOnChain: false;
    readonly jvmReductionAccepted: false;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly profileActivated: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  };
}

interface TrackerHistoryEntry {
  readonly key: string;
  readonly value: string;
}

interface TrackerContextMetadata {
  readonly compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly compilerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
  readonly history: readonly Readonly<TrackerHistoryEntry>[];
  readonly latestSourceNativeBlockHeight: bigint;
  readonly latestAdmissionErgoHeight: number;
  readonly parent?: Readonly<SubstrateFederatedTrackerV2Context>;
}

const TRACKER_CONTEXTS = new WeakSet<object>();
const TRACKER_CONTEXT_METADATA = new WeakMap<object, Readonly<TrackerContextMetadata>>();
let wasmPromise: Promise<any> | undefined;

function getWasm(): Promise<any> {
  return wasmPromise ??= import('ergo-lib-wasm-nodejs')
    .then(module => module.default ?? module);
}

export function assertSubstrateFederatedTrackerV2Context(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedTrackerV2Context> {
  if (value === null || typeof value !== 'object'
    || !TRACKER_CONTEXTS.has(value) || !Object.isFrozen(value)) {
    throw new Error('substrate federated tracker V2 context provenance is missing');
  }
  const context = value as Readonly<SubstrateFederatedTrackerV2Context>;
  if (context.schema !== SUBSTRATE_FEDERATED_TRACKER_V2_SCHEMA
    || context.version !== 2
    || context.trackerTransition.headers.length !== 10
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE) {
    throw new Error('substrate federated tracker V2 context shape mismatch');
  }
}

export function assertSubstrateFederatedTrackerV2ContinuationContext(
  context: Readonly<SubstrateFederatedTrackerV2Context>,
  previousContext: Readonly<SubstrateFederatedTrackerV2Context>,
): void {
  assertSubstrateFederatedTrackerV2Context(context);
  assertSubstrateFederatedTrackerV2Context(previousContext);
  if (TRACKER_CONTEXT_METADATA.get(context)?.parent !== previousContext) {
    throw new Error('substrate federated tracker V2 continuation parent differs');
  }
}

export function buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context(
  input: BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Input,
): Promise<Readonly<SubstrateFederatedTrackerV2Context>> {
  return buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContextInternal(
    input, undefined,
  );
}

export function buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationContext(
  input: BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContinuationInput,
): Promise<Readonly<SubstrateFederatedTrackerV2Context>> {
  const previousContext = input.previousContext;
  if (previousContext === undefined) {
    return Promise.reject(new Error('federated tracker V2 continuation previous context is required'));
  }
  return buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContextInternal(
    input, previousContext,
  );
}

async function buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2ContextInternal(
  input: BuildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Input,
  previousContext: Readonly<SubstrateFederatedTrackerV2Context> | undefined,
): Promise<Readonly<SubstrateFederatedTrackerV2Context>> {
  // Provenance-bearing objects are already deeply frozen. Copy mutable ingress
  // and capture every caller property before the first asynchronous boundary.
  const compilerRequest = input.compilerRequest;
  const compilerReceipt = input.compilerReceipt;
  const headers = input.observedHeaderContext;
  const encodedStatementHex = input.encodedStatementHex;
  const extensionProofHex = boundedHex(input.extensionMembershipProofHex, 'extension membership proof');
  const boxSnapshot = structuredClone(input.trackerInputBox);
  let previousMetadata: Readonly<TrackerContextMetadata> | undefined;
  if (previousContext !== undefined) {
    assertSubstrateFederatedTrackerV2Context(previousContext);
    previousMetadata = TRACKER_CONTEXT_METADATA.get(previousContext);
    if (previousMetadata === undefined) {
      throw new Error('substrate federated tracker V2 predecessor metadata is missing');
    }
  }
  assertBridgeValidityTrackerObservedHeaderContextV1(headers);
  const receipt = assertSubstrateFederatedTrackerJvmCompilerReceiptV2(
    compilerReceipt, compilerRequest,
  );
  if (previousMetadata !== undefined
    && (compilerRequest !== previousMetadata.compilerRequest
      || compilerReceipt !== previousMetadata.compilerReceipt)) {
    throw new Error('substrate federated tracker V2 compiler lineage differs from the predecessor');
  }
  const { profile, application } = compilerRequest;
  const contract = deepFreeze({
    ...receipt.contract,
    trackerNftIdHex: compilerRequest.trackerNftIdHex,
  });
  const currentErgoHeight = positiveInt(headers.currentHeight, 'current Ergo height');
  const anchor = headers.anchorHeader;
  const anchorHeight = positiveInt(anchor.height, 'anchor height');
  const statement = decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
    encodedStatementHex, profile, currentErgoHeight,
  );
  const sourceNativeBlockHeight = BigInt(statement.sourceNativeBlockHeight);
  if (previousMetadata !== undefined
    && (sourceNativeBlockHeight <= previousMetadata.latestSourceNativeBlockHeight
      || currentErgoHeight <= previousMetadata.latestAdmissionErgoHeight)) {
    throw new Error('federated tracker V2 continuation heights must strictly increase');
  }
  for (const key of Object.keys(application) as (keyof typeof application)[]) {
    if (application[key] !== statement[key]) {
      throw new Error(`federated tracker V2 statement differs from compiled application: ${key}`);
    }
  }
  const extensionValueHex = encodeSubstrateFederatedCheckpointExtensionValueV1(
    statement.encodedStatementHex,
  );
  const extensionProofBytes = Buffer.from(extensionProofHex, 'hex');
  if (!verifyErgoExtensionMembership({
    key: Buffer.from('0401', 'hex'),
    value: Buffer.from(extensionValueHex, 'hex'),
    proof: extensionProofBytes,
    root: Buffer.from(anchor.extensionRootHex, 'hex'),
  })) {
    throw new Error('observed 0x0401 membership proof does not match the anchor');
  }
  const trackerInputBox = await normalizeExactBox(boxSnapshot);
  const genesisDigestHex = exactHex(
    tracker_application_v2_empty_digest(), 33, 'empty tracker digest',
  );
  const genesisRegisters: Registers = deepFreeze({
    R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
    R5: encodeTrackerAvlRegister(genesisDigestHex),
    R6: encodeCollByteRegister(Buffer.from(application.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
  });
  const inputDigestHex = previousContext === undefined
    ? genesisDigestHex : previousContext.trackerTransition.successorDigestHex;
  const inputRegisters: Registers = previousContext === undefined
    ? genesisRegisters : previousContext.trackerTransition.successorRegisters;
  const expectedCreationHeight = previousContext?.trackerTransition.currentErgoHeight;
  if (trackerInputBox.value !== TRACKER_VALUE
    || trackerInputBox.ergoTree !== contract.propositionHex
    || trackerInputBox.assets.length !== 1
    || trackerInputBox.assets[0]?.tokenId !== contract.trackerNftIdHex
    || trackerInputBox.assets[0]?.amount !== '1'
    || canonicalJson(trackerInputBox.additionalRegisters) !== canonicalJson(inputRegisters)
    || !Number.isSafeInteger(trackerInputBox.creationHeight)
    || trackerInputBox.creationHeight < 0
    || trackerInputBox.creationHeight >= currentErgoHeight
    || (expectedCreationHeight !== undefined
      && trackerInputBox.creationHeight !== expectedCreationHeight)) {
    throw new Error(previousContext === undefined
      ? 'compiler-bound federated tracker V2 input box differs from genesis state'
      : 'compiler-bound federated tracker V2 input box differs from retained predecessor state');
  }
  const admission = buildSubstrateFederatedTrackerAdmissionV1({
    profile,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight,
    anchorHeaderIdHex: anchor.id,
    anchorHeaderHeight: anchorHeight,
  });
  if (admission.extensionValueHex !== extensionValueHex) {
    throw new Error('federated tracker V2 extension value changed during construction');
  }
  const retainedHistory = previousMetadata?.history ?? [];
  const inserted = JSON.parse(tracker_application_v2_insert(
    JSON.stringify(retainedHistory), admission.trackerKeyHex, admission.trackerValueHex,
  )) as Record<string, unknown>;
  const successorDigestHex = exactHex(inserted.new_digest_hex, 33, 'successor tracker digest');
  const avlInsertProofHex = boundedHex(inserted.insert_proof_hex, 'tracker AVL insert proof');
  const replayed = JSON.parse(tracker_application_v2_verify_insert(
    inputDigestHex, admission.trackerKeyHex, admission.trackerValueHex, avlInsertProofHex,
  )) as Record<string, unknown>;
  if (exactHex(replayed.new_digest_hex, 33, 'replayed tracker digest') !== successorDigestHex) {
    throw new Error('federated tracker V2 AVL insertion replay differs from the successor');
  }
  const proofLength = Buffer.alloc(8);
  proofLength.writeBigUInt64BE(BigInt(extensionProofBytes.length));
  const transitionProofBundleHex = Buffer.concat([
    proofLength, extensionProofBytes, Buffer.from(avlInsertProofHex, 'hex'),
  ]).toString('hex');
  const successorRegisters: Registers = deepFreeze({
    ...inputRegisters,
    R5: encodeTrackerAvlRegister(successorDigestHex),
    R7: encodeLongRegister(BigInt(statement.sourceNativeBlockHeight)),
    R8: encodeIntRegister(currentErgoHeight),
  });
  const serialized = await serializeContext({
    contract, trackerInputBox, successorRegisters, currentErgoHeight, anchorHeight,
    statementHex: statement.encodedStatementHex, transitionProofBundleHex,
  });
  const context: Readonly<SubstrateFederatedTrackerV2Context> = deepFreeze({
    schema: SUBSTRATE_FEDERATED_TRACKER_V2_SCHEMA,
    version: 2,
    trustModel: 'federated_non_trustless',
    compilerRequestDigestHex: compilerRequest.requestDigestHex,
    compilerReceiptDigestHex: receipt.receiptDigestHex,
    contract,
    statement: {
      encodedHex: statement.encodedStatementHex,
      statementIdHex: statement.statementIdHex,
      sourceSignaturesVerifiedOnChain: false,
    },
    trackerTransition: {
      trackerNftIdHex: contract.trackerNftIdHex,
      trackerKeyHex: admission.trackerKeyHex,
      trackerValueHex: admission.trackerValueHex,
      inputValue: TRACKER_VALUE,
      inputDigestHex, successorDigestHex, inputRegisters, successorRegisters,
      currentErgoHeight, anchorHeight,
      anchorContextProvenance: headers.provenance,
      extensionProofHex, avlInsertProofHex, transitionProofBundleHex,
      headers: headers.headers.map(header => ({
        id: header.id, height: header.height,
        extensionRootHex: header.extensionRootHex,
        jvmHeaderJson: header.jvmHeaderJson, serializedHex: header.serializedHex,
      })),
    },
    ...serialized,
    boundaries: {
      contractIdentityBound: true,
      statementAndProfileValidated: true,
      anchorMembershipConstructed: true,
      exactContextExtensionRoundTrip: true,
      avlTransitionConstructed: true,
      feesIncluded: false,
      sourceSignaturesVerifiedOnChain: false,
      jvmReductionAccepted: false,
      nodeCheckPerformed: false,
      targetNodeAcceptanceEstablished: false,
      profileActivated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    },
  });
  TRACKER_CONTEXTS.add(context);
  const history = deepFreeze([
    ...retainedHistory,
    deepFreeze({ key: admission.trackerKeyHex, value: admission.trackerValueHex }),
  ]);
  TRACKER_CONTEXT_METADATA.set(context, Object.freeze({
    compilerRequest,
    compilerReceipt,
    history,
    latestSourceNativeBlockHeight: sourceNativeBlockHeight,
    latestAdmissionErgoHeight: currentErgoHeight,
    ...(previousContext === undefined ? {} : { parent: previousContext }),
  }));
  return context;
}

export async function assertExactSubstrateFederatedTrackerV2InputBox(
  context: Readonly<SubstrateFederatedTrackerV2Context>,
  value: unknown,
): Promise<Readonly<Eip12Box>> {
  assertSubstrateFederatedTrackerV2Context(context);
  const box = await normalizeExactBox(structuredClone(value));
  const inputs = context.eip12UnsignedTransaction.inputs;
  if (!Array.isArray(inputs) || inputs.length !== 1 || inputs[0]?.boxId !== box.boxId) {
    throw new Error('federated tracker V2 input box ID differs from the context');
  }
  const wasm = await getWasm();
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
    if (canonicalJson(parsed.to_js_eip12()) !== canonicalJson(box)
      || Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') !== context.inputBoxSigmaHex) {
      throw new Error('federated tracker V2 input box Sigma bytes differ from the context');
    }
  } finally {
    parsed?.free?.();
  }
  return deepFreeze(box);
}

async function normalizeExactBox(snapshot: unknown): Promise<Readonly<Eip12Box>> {
  const box = await normalizeEip12Box(snapshot, 'federated tracker V2 input box');
  if (canonicalJson(snapshot) !== canonicalJson(box)) {
    throw new Error('federated tracker V2 input box is not exact canonical EIP-12');
  }
  return deepFreeze(box);
}

async function serializeContext(input: Readonly<{
  contract: SubstrateFederatedTrackerV2Context['contract'];
  trackerInputBox: Readonly<Eip12Box>;
  successorRegisters: Registers;
  statementHex: string;
  transitionProofBundleHex: string;
  currentErgoHeight: number;
  anchorHeight: number;
}>): Promise<Pick<SubstrateFederatedTrackerV2Context,
  'contextExtension' | 'inputBoxSigmaHex' | 'eip12UnsignedTransaction'
  | 'prooflessTransactionHex' | 'prooflessTransactionBytes' | 'unsignedTransactionIdHex'>> {
  const wasm = await getWasm();
  let statementConstant: any;
  let bundleConstant: any;
  let heightConstant: any;
  let extension: any;
  let inputBox: any;
  let inputBoxId: any;
  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let roundTrip: any;
  try {
    statementConstant = wasm.Constant.from_byte_array(Buffer.from(input.statementHex, 'hex'));
    bundleConstant = wasm.Constant.from_byte_array(Buffer.from(input.transitionProofBundleHex, 'hex'));
    heightConstant = wasm.Constant.from_i32(input.anchorHeight);
    extension = new wasm.ContextExtension();
    extension.set_pair(0, statementConstant);
    extension.set_pair(1, bundleConstant);
    extension.set_pair(2, heightConstant);
    const eip12Values = {
      '0': boundedHex(statementConstant.encode_to_base16(), 'statement constant'),
      '1': boundedHex(bundleConstant.encode_to_base16(), 'proof bundle constant'),
      '2': boundedHex(heightConstant.encode_to_base16(), 'absolute anchor height constant'),
    };
    inputBox = wasm.ErgoBox.from_json(JSON.stringify(input.trackerInputBox));
    if (canonicalJson(inputBox.to_js_eip12()) !== canonicalJson(input.trackerInputBox)) {
      throw new Error('federated tracker V2 input box changed during WASM parsing');
    }
    inputBoxId = inputBox.box_id();
    const boxId = exactHex(inputBoxId.to_str(), 32, 'tracker input box ID');
    if (boxId !== input.trackerInputBox.boxId) {
      throw new Error('federated tracker V2 input box ID changed during WASM parsing');
    }
    const inputBoxSigmaHex = Buffer.from(inputBox.sigma_serialize_bytes()).toString('hex');
    const eip12UnsignedTransaction = deepFreeze({
      inputs: [{ boxId, extension: eip12Values }],
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
      'substrate federated tracker V2 ContextExtension',
      SUBSTRATE_FEDERATED_TRACKER_V2_CONTEXT_KEYS.length,
    );
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(eip12UnsignedTransaction));
    if (canonicalJson(unsigned.to_js_eip12()) !== canonicalJson(eip12UnsignedTransaction)) {
      throw new Error('WASM changed the federated tracker V2 transaction');
    }
    const serializedExtension = Buffer.from(extension.sigma_serialize_bytes());
    const expectedExtension = Buffer.concat([
      Buffer.from([3]),
      ...SUBSTRATE_FEDERATED_TRACKER_V2_CONTEXT_KEYS.flatMap(key => [
        Buffer.from([key]), Buffer.from(eip12Values[String(key) as keyof typeof eip12Values], 'hex'),
      ]),
    ]);
    if (!serializedExtension.equals(expectedExtension)) {
      throw new Error('federated tracker V2 ContextExtension bytes changed');
    }
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = exactHex(unsignedId.to_str(), 32, 'unsigned transaction ID');
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (prooflessBytes.length > MAX_INGRESS_BYTES) {
      throw new Error('federated tracker V2 transaction exceeds the ingress bound');
    }
    if (blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex) {
      throw new Error('federated tracker V2 transaction ID mismatch');
    }
    // Use the established JSON-to-bytes check; the WASM binary parser has
    // known failures on some otherwise valid transaction serializations.
    roundTrip = wasm.Transaction.from_json(JSON.stringify(proofless.to_js_eip12()));
    if (!Buffer.from(roundTrip.sigma_serialize_bytes()).equals(prooflessBytes)
      || canonicalJson(roundTrip.to_js_eip12()) !== canonicalJson(proofless.to_js_eip12())) {
      throw new Error('federated tracker V2 proofless transaction round-trip mismatch');
    }
    return {
      contextExtension: {
        keys: SUBSTRATE_FEDERATED_TRACKER_V2_CONTEXT_KEYS,
        serializedHex: serializedExtension.toString('hex'),
        serializedBytes: serializedExtension.length,
        eip12Values,
      },
      inputBoxSigmaHex, eip12UnsignedTransaction,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      unsignedTransactionIdHex,
    };
  } finally {
    roundTrip?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
    inputBoxId?.free?.();
    inputBox?.free?.();
    extension?.free?.();
    heightConstant?.free?.();
    bundleConstant?.free?.();
    statementConstant?.free?.();
  }
}

function encodeTrackerAvlRegister(digestHex: string): string {
  return encodeAvlTreeRegister(
    Buffer.from(exactHex(digestHex, 33, 'tracker digest'), 'hex'),
    1, SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
  );
}

function positiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function exactHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function boundedHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0
    || value.length > MAX_INGRESS_BYTES * 2 || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be bounded non-empty lowercase whole-byte hex`);
  }
  return value;
}

function blake2b256Hex(bytes: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
