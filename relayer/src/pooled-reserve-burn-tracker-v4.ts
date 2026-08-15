import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  encodeBridgeCheckpointV1,
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-extension-membership.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  decodeEip0045PooledReserveBurnStatementV4,
  decodePooledReserveBurnApplicationBindingV4,
  encodeEip0045PooledReserveBurnStatementV4,
  encodePooledReserveBurnApplicationBindingV4,
  encodePooledReserveBurnPublicInputsV4,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
} from './pooled-reserve-burn-statement-v4.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';

export {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';

export const POOLED_RESERVE_BURN_TRACKER_V4_SCHEMA =
  'e2s.pooled-reserve-burn-tracker-context.v4' as const;
export const POOLED_RESERVE_BURN_TRACKER_V4_KEY_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_KEY_V4' as const;
export const POOLED_RESERVE_BURN_TRACKER_V4_VALUE_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_VALUE_V4' as const;
export const POOLED_RESERVE_BURN_TRACKER_V4_PAYLOAD_DIGEST_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_PAYLOAD_DIGEST_V4' as const;
export const POOLED_RESERVE_BURN_TRACKER_V4_VALUE_BYTES = 370 as const;
export const POOLED_RESERVE_BURN_TRACKER_V4_CONTEXT_KEYS =
  Object.freeze([0, 1, 2, 3] as const);

const POOLED_RESERVE_BURN_TRACKER_V4_SIGMA_STATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa' as const;
const POOLED_RESERVE_BURN_TRACKER_V4_TEMPLATE_SOURCE_SHA256_HEX =
  'e7216bb2878d7d1f27369180ce5cbdb5e87a1be2cff290e13ea66d627aa6f0db' as const;
const POOLED_RESERVE_BURN_TRACKER_V4_RESOLVED_SOURCE_SHA256_HEX =
  'e83ccdb9fcfa97c03b3205d4d0cae5a39fdac0b91686ba1d15fa1000e67acf5a' as const;
const POOLED_RESERVE_BURN_TRACKER_V4_PROPOSITION_BYTES = 2_942 as const;
const POOLED_RESERVE_BURN_TRACKER_V4_PROPOSITION_SHA256_HEX =
  'f2c4274cb56cd6da77f7d79c0b327ca3e0e0b1f8c13ada1996f1d5021af98a2d' as const;
const POOLED_RESERVE_BURN_TRACKER_V4_CONTRACT_ID_HEX =
  'dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd' as const;
const POOLED_RESERVE_BURN_TRACKER_V4_BINDING_PREFIX_SHA256_HEX =
  '54b9ba6b41cdefad62c98461204d15d39b8f8c31eaf0770e4f448fd7eaec0f9f' as const;
const TRACKER_VALUE = '10000000';
const FIXTURE_SETUP_INPUT_BOX_ID_HEX = '66'.repeat(32);
const MAX_INGRESS_BYTES = 262_144;
const pooledReserveBurnTrackerV4Contexts = new WeakSet<object>();

export interface PooledReserveBurnTrackerContractV4Identity {
  readonly schema: 'e2s.pooled-reserve-burn-tracker-contract.v4';
  readonly version: 4;
  readonly sigmaStateCommit: string;
  readonly templateSourceSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly applicationBindingPrefixHex: string;
  readonly programIdHex:
    typeof POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX;
  readonly verifierProfileIdHex:
    typeof POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export interface BuildPooledReserveBurnTrackerV4Input {
  readonly contract: Readonly<PooledReserveBurnTrackerContractV4Identity>;
  readonly runtimeProfileScaleHex: string;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly trackerNftIdHex: string;
  readonly checkpoint: Readonly<BridgeCheckpointV1>;
  readonly targetNativeStateRootHex: string;
  readonly trustedAnchorDigestHex: string;
  readonly finalityHorizonHeight: string | number | bigint;
  readonly finalityHorizonHashHex: string;
  readonly chainDomainIdHex: string;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
  readonly proofChunksHex: readonly string[];
}

export interface BuildCompiledPooledReserveBurnTrackerV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly checkpoint: Readonly<BridgeCheckpointV1>;
  readonly targetNativeStateRootHex: string;
  readonly finalityHorizonHeight: string | number | bigint;
  readonly finalityHorizonHashHex: string;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
  readonly proofChunksHex: readonly string[];
}

export interface PooledReserveBurnTrackerV4Context {
  readonly schema: typeof POOLED_RESERVE_BURN_TRACKER_V4_SCHEMA;
  readonly version: 4;
  readonly contract: Readonly<PooledReserveBurnTrackerContractV4Identity>;
  readonly statement: {
    readonly encodedHex: string;
    readonly digestHex: string;
    readonly publicInputsHex: string;
    readonly publicInputsDigestHex: string;
    readonly applicationBindingHex: string;
    readonly applicationBindingDigestHex: string;
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
    readonly keys: readonly [0, 1, 2, 3];
    readonly proofChunksHex: readonly string[];
    readonly serializedHex: string;
    readonly serializedBytes: number;
    readonly eip12Values:
      Readonly<Record<'0' | '1' | '2' | '3', string>>;
  };
  readonly inputBoxSigmaHex: string;
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly unsignedTransactionIdHex: string;
  readonly boundaries: {
    readonly frozenContractIdentityBound: true;
    readonly statementCodecValidated: true;
    readonly selfContractBindingValidated: true;
    readonly exactContextExtensionRoundTrip: true;
    readonly avlTransitionConstructed: true;
    readonly profileActivated: false;
    readonly nodeCheckPerformed: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildPooledReserveBurnTrackerV4Context(
  input: BuildPooledReserveBurnTrackerV4Input,
): Promise<Readonly<PooledReserveBurnTrackerV4Context>> {
  return buildPooledReserveBurnTrackerV4ContextWithIdentity(
    input,
    assertContractIdentity,
  );
}

export async function buildCompiledPooledReserveBurnTrackerV4Context(
  input: BuildCompiledPooledReserveBurnTrackerV4Input,
): Promise<Readonly<PooledReserveBurnTrackerV4Context>> {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    input.compiledInstance,
  );
  const compiled = input.compiledInstance;
  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      compiled.application.runtimeProfileScaleHex,
    );
  const receipt = compiled.contracts.tracker.receipt;
  const programIdHex = compiled.application.programIdHex.slice(2);
  const verifierProfileIdHex =
    compiled.application.verifierProfileIdHex.slice(2);
  if (
    programIdHex !== POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX
    || verifierProfileIdHex
      !== POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX
  ) {
    throw new Error(
      'compiled pooled-reserve burn tracker uses the wrong proof identity',
    );
  }
  const contract: Readonly<PooledReserveBurnTrackerContractV4Identity> =
    deepFreeze({
      schema: 'e2s.pooled-reserve-burn-tracker-contract.v4' as const,
      version: 4 as const,
      sigmaStateCommit: receipt.sigmaStateCommit,
      templateSourceSha256Hex:
        compiled.contracts.tracker.templateSha256Hex,
      resolvedSourceSha256Hex:
        compiled.contracts.tracker.resolvedSourceSha256Hex,
      applicationBindingPrefixHex:
        compiled.application.burnBindingHex.slice(0, 449 * 2),
      programIdHex,
      verifierProfileIdHex,
      propositionBytes: receipt.propositionBytes,
      propositionSha256Hex: receipt.propositionSha256Hex,
      propositionHex: receipt.propositionHex,
      contractIdHex: receipt.contractIdHex,
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    });

  return buildPooledReserveBurnTrackerV4ContextWithIdentity({
    contract,
    runtimeProfileScaleHex: compiled.application.runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex:
      compiled.application.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: compiled.application.sourceRuntimeCodeBytes,
    trackerNftIdHex: compiled.genesis.trackerNftIdHex.slice(2),
    checkpoint: input.checkpoint,
    targetNativeStateRootHex: input.targetNativeStateRootHex,
    trustedAnchorDigestHex:
      compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex.slice(2),
    finalityHorizonHeight: input.finalityHorizonHeight,
    finalityHorizonHashHex: input.finalityHorizonHashHex,
    chainDomainIdHex: runtimeProfile.sourceNetworkIdHex.slice(2),
    currentErgoHeight: input.currentErgoHeight,
    anchorContextIndex: input.anchorContextIndex,
    proofChunksHex: input.proofChunksHex,
  }, value => {
    if (value !== contract) {
      throw new Error(
        'compiled pooled-reserve burn tracker contract identity was replaced',
      );
    }
    return value;
  });
}

async function buildPooledReserveBurnTrackerV4ContextWithIdentity(
  input: BuildPooledReserveBurnTrackerV4Input,
  validateContract: (
    value: Readonly<PooledReserveBurnTrackerContractV4Identity>,
  ) => Readonly<PooledReserveBurnTrackerContractV4Identity>,
): Promise<Readonly<PooledReserveBurnTrackerV4Context>> {
  const contract = validateContract(input.contract);
  const binding = encodePooledReserveBurnApplicationBindingV4({
    runtimeProfileScaleHex: input.runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex: input.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: input.sourceRuntimeCodeBytes,
    trackerNftIdHex: input.trackerNftIdHex,
    settlementTrackerContractIdHex: contract.contractIdHex,
  });
  const decodedBinding = decodePooledReserveBurnApplicationBindingV4(binding);
  if (binding.subarray(0, 449).toString('hex') !== contract.applicationBindingPrefixHex) {
    throw new Error('pooled-reserve burn tracker binding prefix differs from the compiled contract');
  }
  if (decodedBinding.settlementTrackerContractIdHex !== contract.contractIdHex) {
    throw new Error('pooled-reserve burn tracker binding is not self-bound');
  }

  const checkpoint = encodeBridgeCheckpointV1(input.checkpoint);
  const publicInputs = encodePooledReserveBurnPublicInputsV4({
    applicationBinding: binding,
    encodedCheckpoint: checkpoint,
    targetNativeStateRootHex: input.targetNativeStateRootHex,
    trustedAnchorDigestHex: input.trustedAnchorDigestHex,
    finalityHorizonHeight: input.finalityHorizonHeight,
    finalityHorizonHashHex: input.finalityHorizonHashHex,
  });
  const statementBytes = encodeEip0045PooledReserveBurnStatementV4({
    chainDomainIdHex: input.chainDomainIdHex,
    profileIdHex: contract.verifierProfileIdHex,
    programIdHex: contract.programIdHex,
    contractIdHex: contract.contractIdHex,
    publicInputs,
  });
  const statement = decodeEip0045PooledReserveBurnStatementV4(statementBytes);

  const extensionProof = buildErgoExtensionMembershipProof([
    {
      key: Buffer.from('0100', 'hex'),
      value: Buffer.from('fixture-side-field', 'ascii'),
    },
    {
      key: Buffer.from(statement.publicInputs.extensionKeyHex, 'hex'),
      value: Buffer.from(statement.publicInputs.extensionValueHex, 'hex'),
    },
  ], Buffer.from(statement.publicInputs.extensionKeyHex, 'hex'));
  const wasm = await getWasm();
  const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: safePositiveInt(input.currentErgoHeight, 'current Ergo height'),
    anchorContextIndex: nonnegativeInt(input.anchorContextIndex, 'anchor context index'),
    anchorExtensionRootHex: extensionProof.root.toString('hex'),
  });
  const anchor = headers.anchorHeader;
  const trackerKeyHex = blake2b256Hex(Buffer.concat([
    Buffer.from(POOLED_RESERVE_BURN_TRACKER_V4_KEY_DOMAIN, 'ascii'),
    Buffer.from(statement.publicInputs.application.runtimeProfile.sidechainIdHex.slice(2), 'hex'),
    uint64Be(BigInt(statement.publicInputs.checkpoint.sidechainHeight)),
    Buffer.from(statement.publicInputs.checkpoint.executionBlockHashHex, 'hex'),
  ]));
  const trackerValueHex = encodeTrackerValue({
    bridgeEventRootHex: statement.publicInputs.checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: statement.publicInputs.checkpointCommitmentHex,
    anchorHeaderIdHex: anchor.id,
    anchorHeaderHeight: anchor.height,
    sidechainConsensusBlockHashHex:
      statement.publicInputs.checkpoint.sidechainConsensusBlockHashHex,
    burnLeafCount: statement.publicInputs.checkpoint.burnLeafCount,
    applicationBindingDigestHex: statement.publicInputs.applicationBindingDigestHex,
    settlementProfileIdHex:
      statement.publicInputs.application.runtimeProfile.settlementProfileIdHex.slice(2),
    lineageProfileIdHex:
      statement.publicInputs.application.runtimeProfile.lineageProfileIdHex.slice(2),
    payloadHex: publicInputs.toString('hex'),
    programIdHex: contract.programIdHex,
    verifierProfileIdHex: contract.verifierProfileIdHex,
  });
  const inputDigestHex = exactHex(
    tracker_application_v2_empty_digest(),
    33,
    'empty V4 tracker digest',
  );
  const inserted = JSON.parse(tracker_application_v2_insert(
    '[]',
    trackerKeyHex,
    trackerValueHex,
  )) as Readonly<Record<string, unknown>>;
  const successorDigestHex = exactHex(
    inserted.new_digest_hex,
    33,
    'successor V4 tracker digest',
  );
  const avlInsertProofHex = variableHex(
    inserted.insert_proof_hex,
    'V4 tracker AVL insert proof',
  );
  const transitionProofBundleHex = Buffer.concat([
    uint64Be(BigInt(extensionProof.proof.length)),
    extensionProof.proof,
    Buffer.from(avlInsertProofHex, 'hex'),
  ]).toString('hex');
  const runtimeProfile = statement.publicInputs.application.runtimeProfile;
  const inputRegisters = Object.freeze({
    R4: encodeCollByteRegister(Buffer.from(runtimeProfile.lineageProfileIdHex.slice(2), 'hex')),
    R5: encodeTrackerAvlRegister(inputDigestHex),
    R6: encodeCollByteRegister(Buffer.from(runtimeProfile.sidechainIdHex.slice(2), 'hex')),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(input.currentErgoHeight - 1),
    R9: encodeCollByteRegister(Buffer.from(statement.publicInputs.trustedAnchorDigestHex, 'hex')),
  });
  const successorRegisters = Object.freeze({
    R4: inputRegisters.R4,
    R5: encodeTrackerAvlRegister(successorDigestHex),
    R6: inputRegisters.R6,
    R7: encodeLongRegister(BigInt(statement.publicInputs.checkpoint.sidechainHeight)),
    R8: encodeIntRegister(input.currentErgoHeight),
    R9: inputRegisters.R9,
  });
  const proofChunks = input.proofChunksHex.map((value, index) =>
    Buffer.from(variableHex(value, `proof chunk ${index}`), 'hex'));
  if (proofChunks.length === 0) {
    throw new Error('pooled-reserve burn tracker proof chunks must be non-empty');
  }

  const context = await serializeContext({
    wasm,
    contract,
    trackerNftIdHex: exactHex(input.trackerNftIdHex, 32, 'tracker NFT'),
    publicInputs,
    proofChunks,
    transitionProofBundleHex,
    inputRegisters,
    successorRegisters,
    currentErgoHeight: input.currentErgoHeight,
    anchorContextIndex: input.anchorContextIndex,
  });

  const result: Readonly<PooledReserveBurnTrackerV4Context> = deepFreeze({
    schema: POOLED_RESERVE_BURN_TRACKER_V4_SCHEMA,
    version: 4 as const,
    contract,
    statement: {
      encodedHex: statement.encodedStatementHex,
      digestHex: statement.statementDigestHex,
      publicInputsHex: statement.publicInputs.encodedPublicInputsHex,
      publicInputsDigestHex: statement.publicInputs.publicInputsDigestHex,
      applicationBindingHex: statement.publicInputs.application.encodedBindingHex,
      applicationBindingDigestHex:
        statement.publicInputs.applicationBindingDigestHex,
    },
    trackerTransition: {
      trackerNftIdHex: exactHex(input.trackerNftIdHex, 32, 'tracker NFT'),
      trackerKeyHex,
      trackerValueHex,
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
    contextExtension: context.contextExtension,
    inputBoxSigmaHex: context.inputBoxSigmaHex,
    eip12UnsignedTransaction: context.eip12UnsignedTransaction,
    prooflessTransactionHex: context.prooflessTransactionHex,
    prooflessTransactionBytes: context.prooflessTransactionBytes,
    unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    boundaries: {
      frozenContractIdentityBound: true as const,
      statementCodecValidated: true as const,
      selfContractBindingValidated: true as const,
      exactContextExtensionRoundTrip: true as const,
      avlTransitionConstructed: true as const,
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
  pooledReserveBurnTrackerV4Contexts.add(result);
  return result;
}

export function assertPooledReserveBurnTrackerV4ContextProvenance(
  value: unknown,
): asserts value is Readonly<PooledReserveBurnTrackerV4Context> {
  if (
    value === null
    || typeof value !== 'object'
    || !pooledReserveBurnTrackerV4Contexts.has(value)
  ) {
    throw new Error(
      'pooled-reserve burn tracker V4 context must be built in this process',
    );
  }
}

async function serializeContext(input: {
  readonly wasm: any;
  readonly contract: Readonly<PooledReserveBurnTrackerContractV4Identity>;
  readonly trackerNftIdHex: string;
  readonly publicInputs: Buffer;
  readonly proofChunks: readonly Buffer[];
  readonly transitionProofBundleHex: string;
  readonly inputRegisters: Readonly<Record<string, string>>;
  readonly successorRegisters: Readonly<Record<string, string>>;
  readonly currentErgoHeight: number;
  readonly anchorContextIndex: number;
}): Promise<{
  readonly contextExtension: PooledReserveBurnTrackerV4Context['contextExtension'];
  readonly inputBoxSigmaHex: string;
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly unsignedTransactionIdHex: string;
}> {
  const { wasm } = input;
  let chunksConstant: any;
  let payloadConstant: any;
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
    chunksConstant = wasm.Constant.from_coll_coll_byte(
      input.proofChunks.map(value => Uint8Array.from(value)),
    );
    payloadConstant = wasm.Constant.from_byte_array(Uint8Array.from(input.publicInputs));
    bundleConstant = wasm.Constant.from_byte_array(
      Uint8Array.from(Buffer.from(input.transitionProofBundleHex, 'hex')),
    );
    indexConstant = wasm.Constant.from_i32(input.anchorContextIndex);
    extension = new wasm.ContextExtension();
    extension.set_pair(0, chunksConstant);
    extension.set_pair(1, payloadConstant);
    extension.set_pair(2, bundleConstant);
    extension.set_pair(3, indexConstant);
    const eip12Values = Object.freeze({
      '0': lowerHex(chunksConstant.encode_to_base16(), 'proof chunks constant'),
      '1': lowerHex(payloadConstant.encode_to_base16(), 'payload constant'),
      '2': lowerHex(bundleConstant.encode_to_base16(), 'proof bundle constant'),
      '3': lowerHex(indexConstant.encode_to_base16(), 'header index constant'),
    });
    setupUnsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: [{ boxId: FIXTURE_SETUP_INPUT_BOX_ID_HEX, extension: {} }],
      dataInputs: [],
      outputs: [{
        value: TRACKER_VALUE,
        ergoTree: input.contract.propositionHex,
        assets: [{ tokenId: input.trackerNftIdHex, amount: '1' }],
        additionalRegisters: input.inputRegisters,
        creationHeight: input.currentErgoHeight - 1,
      }],
    }));
    setupId = setupUnsigned.id();
    setupCandidates = setupUnsigned.output_candidates();
    if (setupCandidates.len() !== 1) {
      throw new Error('pooled-reserve burn tracker setup must contain one output');
    }
    setupCandidate = setupCandidates.get(0);
    inputBox = wasm.ErgoBox.from_box_candidate(setupCandidate, setupId, 0);
    setupCandidate = undefined;
    setupId = undefined;
    inputBoxId = inputBox.box_id();
    const inputBoxIdHex = exactHex(
      inputBoxId.to_str(),
      32,
      'tracker input box ID',
    );
    const inputBoxSigmaHex = Buffer.from(
      inputBox.sigma_serialize_bytes(),
    ).toString('hex');
    const eip12UnsignedTransaction = deepFreeze({
      inputs: [{
        boxId: inputBoxIdHex,
        extension: eip12Values,
      }],
      dataInputs: [],
      outputs: [{
        value: TRACKER_VALUE,
        ergoTree: input.contract.propositionHex,
        assets: [{ tokenId: input.trackerNftIdHex, amount: '1' }],
        additionalRegisters: input.successorRegisters,
        creationHeight: input.currentErgoHeight,
      }],
    });
    assertContextExtensionSafe(
      eip12UnsignedTransaction.inputs,
      'pooled-reserve burn tracker V4 ContextExtension',
      POOLED_RESERVE_BURN_TRACKER_V4_CONTEXT_KEYS.length,
    );
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const roundTrip = unsigned.to_js_eip12();
    if (canonicalJson(roundTrip) !== canonicalJson(eip12UnsignedTransaction)) {
      throw new Error('WASM changed the pooled-reserve burn tracker transaction');
    }
    const serialized = Buffer.from(extension.sigma_serialize_bytes());
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
      throw new Error('pooled-reserve burn tracker transaction exceeds ingress bound');
    }
    if (blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex) {
      throw new Error('pooled-reserve burn tracker transaction ID mismatch');
    }
    return deepFreeze({
      contextExtension: {
        keys: [0, 1, 2, 3] as const,
        proofChunksHex: input.proofChunks.map(value => value.toString('hex')),
        serializedHex: serialized.toString('hex'),
        serializedBytes: serialized.length,
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
    payloadConstant?.free?.();
    chunksConstant?.free?.();
  }
}

function encodeTrackerValue(input: {
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sidechainConsensusBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly lineageProfileIdHex: string;
  readonly payloadHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}): string {
  const value = Buffer.concat([
    Buffer.from(POOLED_RESERVE_BURN_TRACKER_V4_VALUE_DOMAIN, 'ascii'),
    Buffer.from([0, 4, 1, 1, 0]),
    Buffer.from(exactHex(input.bridgeEventRootHex, 32, 'bridge event root'), 'hex'),
    Buffer.from(exactHex(input.checkpointCommitmentHex, 32, 'checkpoint commitment'), 'hex'),
    Buffer.from(exactHex(input.anchorHeaderIdHex, 32, 'anchor header ID'), 'hex'),
    uint32Be(input.anchorHeaderHeight),
    Buffer.from(exactHex(input.sidechainConsensusBlockHashHex, 32, 'consensus block hash'), 'hex'),
    uint32Be(input.burnLeafCount),
    Buffer.from(exactHex(input.applicationBindingDigestHex, 32, 'application binding digest'), 'hex'),
    Buffer.from(exactHex(input.settlementProfileIdHex, 32, 'settlement profile'), 'hex'),
    Buffer.from(exactHex(input.lineageProfileIdHex, 32, 'lineage profile'), 'hex'),
    Buffer.from(blake2b256Hex(Buffer.concat([
      Buffer.from(POOLED_RESERVE_BURN_TRACKER_V4_PAYLOAD_DIGEST_DOMAIN, 'ascii'),
      Buffer.from(exactHex(input.payloadHex, POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES, 'public inputs'), 'hex'),
    ])), 'hex'),
    Buffer.from(exactHex(input.programIdHex, 32, 'program ID'), 'hex'),
    Buffer.from(exactHex(input.verifierProfileIdHex, 32, 'verifier profile ID'), 'hex'),
  ]);
  if (value.length !== POOLED_RESERVE_BURN_TRACKER_V4_VALUE_BYTES) {
    throw new Error('pooled-reserve burn tracker V4 value length mismatch');
  }
  return value.toString('hex');
}

function encodeTrackerAvlRegister(digestHex: string): string {
  return encodeAvlTreeRegister(
    Buffer.from(exactHex(digestHex, 33, 'V4 tracker digest'), 'hex'),
    1,
    POOLED_RESERVE_BURN_TRACKER_V4_VALUE_BYTES,
  );
}

function assertContractIdentity(
  value: Readonly<PooledReserveBurnTrackerContractV4Identity>,
): Readonly<PooledReserveBurnTrackerContractV4Identity> {
  if (
    value.schema !== 'e2s.pooled-reserve-burn-tracker-contract.v4'
    || value.version !== 4
    || value.sigmaStateCommit !== POOLED_RESERVE_BURN_TRACKER_V4_SIGMA_STATE_COMMIT
    || value.templateSourceSha256Hex
      !== POOLED_RESERVE_BURN_TRACKER_V4_TEMPLATE_SOURCE_SHA256_HEX
    || value.resolvedSourceSha256Hex
      !== POOLED_RESERVE_BURN_TRACKER_V4_RESOLVED_SOURCE_SHA256_HEX
    || value.programIdHex !== POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX
    || value.verifierProfileIdHex
      !== POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX
    || value.applicationBindingPrefixHex.length !== 449 * 2
    || value.propositionBytes !== POOLED_RESERVE_BURN_TRACKER_V4_PROPOSITION_BYTES
    || value.propositionSha256Hex
      !== POOLED_RESERVE_BURN_TRACKER_V4_PROPOSITION_SHA256_HEX
    || value.contractIdHex !== POOLED_RESERVE_BURN_TRACKER_V4_CONTRACT_ID_HEX
    || !/^[0-9a-f]+$/.test(value.applicationBindingPrefixHex)
    || sha256Hex(Buffer.from(value.applicationBindingPrefixHex, 'hex'))
      !== POOLED_RESERVE_BURN_TRACKER_V4_BINDING_PREFIX_SHA256_HEX
    || value.propositionHex.length !== value.propositionBytes * 2
    || sha256Hex(Buffer.from(value.propositionHex, 'hex'))
      !== value.propositionSha256Hex
    || blake2b256Hex(Buffer.from(value.propositionHex, 'hex'))
      !== value.contractIdHex
    || value.profileActivated
    || value.nodeCheckPerformed
    || value.fundsAuthorityEstablished
    || value.gate5Closed
  ) {
    throw new Error('pooled-reserve burn tracker V4 contract identity is invalid');
  }
  return value;
}

function uint32Be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('uint32 value is out of range');
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
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
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase whole-byte hex`);
  }
  return value;
}

function lowerHex(value: unknown, label: string): string {
  return variableHex(value, label);
}

function safePositiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
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
