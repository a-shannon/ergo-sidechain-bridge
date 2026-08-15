/**
 * Pure builder for V2 SPV tracker admission.
 *
 * The resulting plan proves that the frozen checkpoint bytes occur under
 * extension key 0x0401 in a specific Ergo header and prepares an append-only
 * AVL insertion. Sidechain finality remains authorized by the tracker box's
 * distinct R9 attestor until Ergo can verify the finality proof or an
 * equivalent cryptographic attestation. Distinct proposition bytes do not
 * establish independent custody.
 */

import blakejs from 'blakejs';

import {
  tracker_v2_empty_digest,
  tracker_v2_get_proof,
  tracker_v2_insert,
  tracker_v2_verify_insert,
} from '../../../../wasm-avl/pkg/bridge_avl.js';
import {
  BRIDGE_CHECKPOINT_ENCODED_BYTES,
  BRIDGE_EXTENSION_KEY_HEX,
  decodeBridgeCheckpointV1,
  deriveBridgeCheckpointCommitmentHex,
  encodeBridgeExtensionValueV1,
} from './bridge-checkpoint-commitment.js';
import {
  AGGREGATE_FINALITY_COMMITMENT_V1_BYTES,
  decodeAggregateFinalityCommitmentV1,
} from './bridge-finality-commitment.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  deriveBridgeFinalityProgramIdHex,
} from './bridge-finality-proof.js';
import {
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE,
  ERGO_EXTENSION_MERKLE_MAX_DEPTH,
  validateErgoExtensionMembershipProof,
  verifyErgoExtensionMembership,
} from '../../ergo-settlement-core/ergo-extension-membership.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';

export const AUTHENTICATED_SPV_TRACKER_DOMAIN = 'E2S_SPV_V2';
export const AUTHENTICATED_SPV_TRACKER_KEY_LENGTH = 32;
export const AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH = 264;
export const AUTHENTICATED_SPV_TRACKER_FLAGS = 0x01; // append-only inserts
export const AUTHENTICATED_SPV_TRACKER_MAX_BURNS = 256;
export const AUTHENTICATED_SPV_TRACKER_MAX_HEADER_INDEX = 9;
export const AUTHENTICATED_SPV_TRACKER_PROOF_LENGTH_PREFIX_BYTES = 8;
export const AUTHENTICATED_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES =
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE * ERGO_EXTENSION_MERKLE_MAX_DEPTH;
const AUTHENTICATED_SPV_TRACKER_MAX_REPLAY_HEIGHT = 254;
const AUTHENTICATED_SPV_TRACKER_MAX_PACKAGED_NODE_BYTES =
  1 + AUTHENTICATED_SPV_TRACKER_KEY_LENGTH * 2 + AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH;
export const AUTHENTICATED_SPV_TRACKER_MAX_AVL_INSERT_PROOF_BYTES =
  (2 * AUTHENTICATED_SPV_TRACKER_MAX_REPLAY_HEIGHT + 2)
    * AUTHENTICATED_SPV_TRACKER_MAX_PACKAGED_NODE_BYTES
  + 1
  + Math.ceil(AUTHENTICATED_SPV_TRACKER_MAX_REPLAY_HEIGHT / 8);
export const AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES =
  AUTHENTICATED_SPV_TRACKER_PROOF_LENGTH_PREFIX_BYTES
  + AUTHENTICATED_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES
  + AUTHENTICATED_SPV_TRACKER_MAX_AVL_INSERT_PROOF_BYTES;

const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_HEADER_HEIGHT = 0x7fff_ffff;

export interface AuthenticatedSpvTrackerHistoryEntry {
  key: string;
  value: string;
}

export interface AuthenticatedSpvTrackerIdentity {
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  executionBlockHashHex: string;
}

export interface AuthenticatedSpvTrackerGetProof {
  keyHex: string;
  valueHex: string;
  getProofHex: string;
  digestHex: string;
}

export interface AuthenticatedSpvAnchorHeader {
  idHex: string;
  height: number;
  extensionRootHex: string;
  contextIndex: number;
}

interface AuthenticatedSpvAdmissionBaseInput {
  encodedCheckpointHex: string;
  aggregateFinalityCommitmentHex: string;
  extensionProofHex: string;
  anchorHeader: AuthenticatedSpvAnchorHeader;
  approvedSidechainIdHex: string;
  currentCounter: number | bigint;
  currentLatestSidechainHeight: string | number | bigint;
  currentStampHeight: number;
  currentErgoHeight: number;
  finalityAttestorSigmaPropRegisterHex: string;
}

export interface BuildAuthenticatedSpvAdmissionInput extends AuthenticatedSpvAdmissionBaseInput {
  history: AuthenticatedSpvTrackerHistoryEntry[];
}

export interface ReplayAuthenticatedSpvAdmissionInput extends AuthenticatedSpvAdmissionBaseInput {
  currentDigestHex: string;
  avlInsertProofHex: string;
}

export interface AuthenticatedSpvAdmissionPlan {
  aggregateFinalityCommitmentHex: string;
  aggregateFinalityCommitmentDigestHex: string;
  checkpointCommitmentHex: string;
  trackerKeyHex: string;
  trackerValueHex: string;
  extensionValueHex: string;
  extensionProofHex: string;
  avlInsertProofHex: string;
  proofBundleHex: string;
  inputDigestHex: string;
  successorDigestHex: string;
  sidechainHeight: string;
  anchorHeader: AuthenticatedSpvAnchorHeader;
  inputRegisters: Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>;
  successorRegisters: Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>;
  contextExtension: Record<'0' | '1' | '2' | '3', string>;
  trustBoundary: 'proof-bound-attestor-authorized-finality';
}

export interface AuthenticatedSpvTrackerFinalityIdentity {
  finalityProofSystemId: number;
  finalityStatementDigestHex: string;
  finalityProgramIdHex: string;
  finalityVerifierProfileIdHex: string;
  finalityProofPayloadDigestHex: string;
  finalityProofDigestHex: string;
}

export interface AuthenticatedSpvProofBundle {
  extensionProofHex: string;
  avlInsertProofHex: string;
}

interface AuthenticatedSpvAvlTransition {
  inputDigestHex: string;
  successorDigestHex: string;
  avlInsertProofHex: string;
}

export interface AuthenticatedSpvTrackerValue extends AuthenticatedSpvTrackerFinalityIdentity {
  bridgeEventRootHex: string;
  checkpointCommitmentHex: string;
  anchorHeaderIdHex: string;
  anchorHeaderHeight: number;
}

export function deriveAuthenticatedSpvTrackerKey(input: AuthenticatedSpvTrackerIdentity): string {
  const sidechainHeight = normalizePositiveSignedLong(input.sidechainHeight, 'sidechainHeight');
  return blake2b256(Buffer.concat([
    Buffer.from(AUTHENTICATED_SPV_TRACKER_DOMAIN, 'ascii'),
    Buffer.from(normalizeHex(input.sidechainIdHex, 32, 'sidechainId'), 'hex'),
    uint64Be(sidechainHeight),
    Buffer.from(normalizeHex(input.executionBlockHashHex, 32, 'executionBlockHash'), 'hex'),
  ])).toString('hex');
}

export function encodeAuthenticatedSpvTrackerValue(
  input: AuthenticatedSpvTrackerValue,
): string {
  const finalityProofSystemId = normalizeFinalityProofSystemId(input.finalityProofSystemId);
  const finalityProgramIdHex = normalizeHex(input.finalityProgramIdHex, 32, 'finalityProgramId');
  if (finalityProgramIdHex !== deriveBridgeFinalityProgramIdHex()) {
    throw new Error('finalityProgramId does not match the activated bridge finality program');
  }
  return Buffer.concat([
    Buffer.from(normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot'), 'hex'),
    Buffer.from(normalizeHex(input.checkpointCommitmentHex, 32, 'checkpointCommitment'), 'hex'),
    Buffer.from(normalizeHex(input.anchorHeaderIdHex, 32, 'anchorHeaderId'), 'hex'),
    uint32Be(normalizeHeaderHeight(input.anchorHeaderHeight, 'anchorHeaderHeight')),
    uint32Be(finalityProofSystemId),
    Buffer.from(normalizeHex(input.finalityStatementDigestHex, 32, 'finalityStatementDigest'), 'hex'),
    Buffer.from(finalityProgramIdHex, 'hex'),
    Buffer.from(normalizeHex(input.finalityVerifierProfileIdHex, 32, 'finalityVerifierProfileId'), 'hex'),
    Buffer.from(normalizeHex(input.finalityProofPayloadDigestHex, 32, 'finalityProofPayloadDigest'), 'hex'),
    Buffer.from(normalizeHex(input.finalityProofDigestHex, 32, 'finalityProofDigest'), 'hex'),
  ]).toString('hex');
}

export function decodeAuthenticatedSpvTrackerValue(valueHex: string): AuthenticatedSpvTrackerValue {
  const bytes = Buffer.from(
    normalizeHex(valueHex, AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH, 'authenticated tracker value'),
    'hex',
  );
  const finalityProofSystemId = normalizeFinalityProofSystemId(bytes.readUInt32BE(100));
  const finalityProgramIdHex = bytes.subarray(136, 168).toString('hex');
  if (finalityProgramIdHex !== deriveBridgeFinalityProgramIdHex()) {
    throw new Error('authenticated tracker finality program ID is not activated');
  }
  return {
    bridgeEventRootHex: bytes.subarray(0, 32).toString('hex'),
    checkpointCommitmentHex: bytes.subarray(32, 64).toString('hex'),
    anchorHeaderIdHex: bytes.subarray(64, 96).toString('hex'),
    anchorHeaderHeight: bytes.readUInt32BE(96),
    finalityProofSystemId,
    finalityStatementDigestHex: bytes.subarray(104, 136).toString('hex'),
    finalityProgramIdHex,
    finalityVerifierProfileIdHex: bytes.subarray(168, 200).toString('hex'),
    finalityProofPayloadDigestHex: bytes.subarray(200, 232).toString('hex'),
    finalityProofDigestHex: bytes.subarray(232, 264).toString('hex'),
  };
}

export function encodeAuthenticatedSpvProofBundle(
  extensionProofHex: string,
  avlInsertProofHex: string,
): string {
  const extensionProof = Buffer.from(normalizeBoundedVariableHex(
    extensionProofHex,
    'extension proof',
    AUTHENTICATED_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES,
  ), 'hex');
  const avlInsertProof = Buffer.from(normalizeBoundedVariableHex(
    avlInsertProofHex,
    'AVL insert proof',
    AUTHENTICATED_SPV_TRACKER_MAX_AVL_INSERT_PROOF_BYTES,
  ), 'hex');
  const proofValidation = validateErgoExtensionMembershipProof(extensionProof);
  if (!proofValidation.ok) throw new Error(proofValidation.errors.join('; '));
  if (avlInsertProof.length === 0) {
    throw new Error('AVL insert proof must be non-empty');
  }
  return Buffer.concat([
    uint64Be(BigInt(extensionProof.length)),
    extensionProof,
    avlInsertProof,
  ]).toString('hex');
}

export function decodeAuthenticatedSpvProofBundle(
  proofBundleHex: string,
): AuthenticatedSpvProofBundle {
  const proofBundle = Buffer.from(normalizeBoundedVariableHex(
    proofBundleHex,
    'proof bundle',
    AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES,
  ), 'hex');
  if (proofBundle.length <= AUTHENTICATED_SPV_TRACKER_PROOF_LENGTH_PREFIX_BYTES) {
    throw new Error('proof bundle must contain an extension proof and an AVL insert proof');
  }
  const extensionProofLength = proofBundle.readBigUInt64BE(0);
  if (extensionProofLength > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('extension proof length exceeds the safe integer range');
  }
  if (extensionProofLength > BigInt(AUTHENTICATED_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES)) {
    throw new Error('extension proof length exceeds the authenticated tracker bound');
  }
  const extensionEnd = AUTHENTICATED_SPV_TRACKER_PROOF_LENGTH_PREFIX_BYTES
    + Number(extensionProofLength);
  if (
    extensionProofLength === 0n
    || extensionEnd >= proofBundle.length
  ) {
    throw new Error('extension proof length does not leave a non-empty AVL insert proof');
  }
  const extensionProof = proofBundle.subarray(
    AUTHENTICATED_SPV_TRACKER_PROOF_LENGTH_PREFIX_BYTES,
    extensionEnd,
  );
  const proofValidation = validateErgoExtensionMembershipProof(extensionProof);
  if (!proofValidation.ok) throw new Error(proofValidation.errors.join('; '));
  const avlInsertProof = proofBundle.subarray(extensionEnd);
  if (avlInsertProof.length > AUTHENTICATED_SPV_TRACKER_MAX_AVL_INSERT_PROOF_BYTES) {
    throw new Error('AVL insert proof length exceeds the authenticated tracker bound');
  }
  return {
    extensionProofHex: extensionProof.toString('hex'),
    avlInsertProofHex: avlInsertProof.toString('hex'),
  };
}

export function buildAuthenticatedSpvAdmission(
  input: BuildAuthenticatedSpvAdmissionInput,
): AuthenticatedSpvAdmissionPlan {
  const history = normalizeHistory(input.history);
  return assembleAuthenticatedSpvAdmission(input, (trackerKeyHex, trackerValueHex) => {
    const inputDigestHex = getAuthenticatedSpvTrackerDigest(history);
    const inserted = JSON.parse(
      tracker_v2_insert(JSON.stringify(history), trackerKeyHex, trackerValueHex),
    );
    return {
      inputDigestHex,
      successorDigestHex: normalizeHex(inserted.new_digest_hex, 33, 'successor tracker digest'),
      avlInsertProofHex: normalizeVariableHex(inserted.insert_proof_hex, 'AVL insert proof'),
    };
  });
}

export function replayAuthenticatedSpvAdmission(
  input: ReplayAuthenticatedSpvAdmissionInput,
): AuthenticatedSpvAdmissionPlan {
  const inputDigestHex = normalizeHex(input.currentDigestHex, 33, 'current tracker digest');
  const avlInsertProofHex = normalizeVariableHex(input.avlInsertProofHex, 'AVL insert proof');
  return assembleAuthenticatedSpvAdmission(input, (trackerKeyHex, trackerValueHex) => {
    const verified = JSON.parse(tracker_v2_verify_insert(
      inputDigestHex,
      trackerKeyHex,
      trackerValueHex,
      avlInsertProofHex,
    ));
    return {
      inputDigestHex,
      successorDigestHex: normalizeHex(
        verified.new_digest_hex,
        33,
        'verified successor tracker digest',
      ),
      avlInsertProofHex,
    };
  });
}

function assembleAuthenticatedSpvAdmission(
  input: AuthenticatedSpvAdmissionBaseInput,
  resolveAvlTransition: (
    trackerKeyHex: string,
    trackerValueHex: string,
  ) => AuthenticatedSpvAvlTransition,
): AuthenticatedSpvAdmissionPlan {
  const checkpointBytes = Buffer.from(
    normalizeHex(input.encodedCheckpointHex, BRIDGE_CHECKPOINT_ENCODED_BYTES, 'encoded checkpoint'),
    'hex',
  );
  const checkpoint = decodeBridgeCheckpointV1(checkpointBytes);
  const finalityCommitment = decodeAggregateFinalityCommitmentV1(
    normalizeHex(
      input.aggregateFinalityCommitmentHex,
      AGGREGATE_FINALITY_COMMITMENT_V1_BYTES,
      'aggregate finality commitment',
    ),
  );
  if (finalityCommitment.statement.encodedCheckpointHex !== checkpointBytes.toString('hex')) {
    throw new Error('aggregate finality commitment checkpoint does not match the admission checkpoint');
  }
  const sidechainHeight = normalizePositiveSignedLong(checkpoint.sidechainHeight, 'checkpoint sidechainHeight');
  const oldLatestHeight = normalizeNonNegativeSignedLong(
    input.currentLatestSidechainHeight,
    'currentLatestSidechainHeight',
  );
  if (sidechainHeight <= oldLatestHeight) {
    throw new Error('checkpoint sidechainHeight must advance the tracker height');
  }
  if (checkpoint.burnLeafCount > AUTHENTICATED_SPV_TRACKER_MAX_BURNS) {
    throw new Error(`checkpoint burnLeafCount must not exceed ${AUTHENTICATED_SPV_TRACKER_MAX_BURNS}`);
  }

  const approvedSidechainIdHex = normalizeHex(
    input.approvedSidechainIdHex,
    32,
    'approvedSidechainId',
  );
  if (checkpoint.sidechainIdHex !== approvedSidechainIdHex) {
    throw new Error('checkpoint sidechainId does not match the tracker allowlist');
  }

  const anchorHeader = normalizeAnchorHeader(input.anchorHeader);
  const currentErgoHeight = normalizeHeaderHeight(input.currentErgoHeight, 'currentErgoHeight');
  const currentStampHeight = normalizeHeaderHeight(input.currentStampHeight, 'currentStampHeight');
  if (anchorHeader.height > currentErgoHeight) {
    throw new Error('anchor header cannot be newer than the current Ergo height');
  }
  if (currentErgoHeight - anchorHeader.height !== anchorHeader.contextIndex + 1) {
    throw new Error(
      'anchor header contextIndex + 1 must equal currentErgoHeight - anchorHeader.height',
    );
  }
  if (currentStampHeight >= currentErgoHeight) {
    throw new Error('current Ergo height must advance the tracker stamp');
  }

  const checkpointCommitmentHex = deriveBridgeCheckpointCommitmentHex(checkpointBytes);
  const extensionValueHex = encodeBridgeExtensionValueV1({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex,
  });
  const extensionProofHex = normalizeVariableHex(input.extensionProofHex, 'extension proof');
  const extensionProof = Buffer.from(extensionProofHex, 'hex');
  const extensionMember = verifyErgoExtensionMembership({
    key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
    value: Buffer.from(extensionValueHex, 'hex'),
    proof: extensionProof,
    root: Buffer.from(anchorHeader.extensionRootHex, 'hex'),
  });
  if (!extensionMember) {
    throw new Error('checkpoint extension value is not a member of the anchor header extension root');
  }

  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: checkpoint.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex: checkpoint.executionBlockHashHex,
  });
  const trackerValueHex = encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex,
    anchorHeaderIdHex: anchorHeader.idHex,
    anchorHeaderHeight: anchorHeader.height,
    finalityProofSystemId: finalityCommitment.proofSystemId,
    finalityStatementDigestHex: finalityCommitment.statementDigestHex,
    finalityProgramIdHex: finalityCommitment.statement.programIdHex,
    finalityVerifierProfileIdHex: finalityCommitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: finalityCommitment.payloadDigestHex,
    finalityProofDigestHex: finalityCommitment.proofDigestHex,
  });
  const {
    inputDigestHex,
    successorDigestHex,
    avlInsertProofHex,
  } = resolveAvlTransition(trackerKeyHex, trackerValueHex);
  const proofBundleHex = encodeAuthenticatedSpvProofBundle(extensionProofHex, avlInsertProofHex);
  const currentCounter = normalizeNonNegativeSignedLong(input.currentCounter, 'currentCounter');
  if (currentCounter === MAX_SIGNED_LONG) {
    throw new Error('currentCounter cannot advance beyond signed Long range');
  }
  const finalityAttestorSigmaPropRegisterHex = normalizeSigmaConstant(
    input.finalityAttestorSigmaPropRegisterHex,
    'finalityAttestorSigmaPropRegister',
  );

  const inputRegisters = {
    R4: encodeLongRegister(currentCounter),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(inputDigestHex),
    R6: encodeCollByteRegister(Buffer.from(approvedSidechainIdHex, 'hex')),
    R7: encodeLongRegister(oldLatestHeight),
    R8: encodeIntRegister(currentStampHeight),
    R9: finalityAttestorSigmaPropRegisterHex,
  };
  const successorRegisters = {
    R4: encodeLongRegister(currentCounter + 1n),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(successorDigestHex),
    R6: inputRegisters.R6,
    R7: encodeLongRegister(sidechainHeight),
    R8: encodeIntRegister(currentErgoHeight),
    R9: finalityAttestorSigmaPropRegisterHex,
  };

  return {
    aggregateFinalityCommitmentHex: finalityCommitment.encodedCommitmentHex,
    aggregateFinalityCommitmentDigestHex: finalityCommitment.commitmentDigestHex,
    checkpointCommitmentHex,
    trackerKeyHex,
    trackerValueHex,
    extensionValueHex,
    extensionProofHex,
    avlInsertProofHex,
    proofBundleHex,
    inputDigestHex,
    successorDigestHex,
    sidechainHeight: sidechainHeight.toString(),
    anchorHeader,
    inputRegisters,
    successorRegisters,
    contextExtension: {
      '0': encodeCollByteRegister(Buffer.from(finalityCommitment.encodedCommitmentHex, 'hex')),
      '1': encodeCollByteRegister(Buffer.from(trackerValueHex, 'hex')),
      '2': encodeCollByteRegister(Buffer.from(proofBundleHex, 'hex')),
      '3': encodeIntRegister(anchorHeader.contextIndex),
    },
    trustBoundary: 'proof-bound-attestor-authorized-finality',
  };
}

export function getAuthenticatedSpvTrackerDigest(
  history: AuthenticatedSpvTrackerHistoryEntry[],
): string {
  if (history.length === 0) {
    return normalizeHex(tracker_v2_empty_digest(), 33, 'empty tracker digest');
  }
  const normalized = normalizeHistory(history);
  const result = JSON.parse(
    tracker_v2_get_proof(JSON.stringify(normalized), normalized[0].key),
  );
  return normalizeHex(result.digest_hex, 33, 'tracker digest');
}

export function buildAuthenticatedSpvTrackerGetProof(
  history: AuthenticatedSpvTrackerHistoryEntry[],
  identity: AuthenticatedSpvTrackerIdentity,
): AuthenticatedSpvTrackerGetProof {
  const normalized = normalizeHistory(history);
  const keyHex = deriveAuthenticatedSpvTrackerKey(identity);
  if (!normalized.some(entry => entry.key === keyHex)) {
    throw new Error('authenticated tracker history does not contain the derived V2 key');
  }
  const result = JSON.parse(tracker_v2_get_proof(JSON.stringify(normalized), keyHex));
  return {
    keyHex,
    valueHex: normalizeHex(
      result.value_hex,
      AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
      'authenticated tracker proof value',
    ),
    getProofHex: normalizeVariableHex(result.get_proof_hex, 'authenticated tracker get proof'),
    digestHex: normalizeHex(result.digest_hex, 33, 'authenticated tracker proof digest'),
  };
}

export function encodeAuthenticatedSpvTrackerAvlRegister(digestHex: string): string {
  return encodeAvlTreeRegister(
    Buffer.from(normalizeHex(digestHex, 33, 'tracker digest'), 'hex'),
    AUTHENTICATED_SPV_TRACKER_FLAGS,
    AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
  );
}

function normalizeHistory(
  history: AuthenticatedSpvTrackerHistoryEntry[],
): AuthenticatedSpvTrackerHistoryEntry[] {
  return history.map((entry, index) => ({
    key: normalizeHex(entry.key, AUTHENTICATED_SPV_TRACKER_KEY_LENGTH, `history[${index}].key`),
    value: normalizeHex(entry.value, AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH, `history[${index}].value`),
  }));
}

function normalizeAnchorHeader(header: AuthenticatedSpvAnchorHeader): AuthenticatedSpvAnchorHeader {
  if (!Number.isInteger(header.contextIndex) ||
    header.contextIndex < 0 ||
    header.contextIndex > AUTHENTICATED_SPV_TRACKER_MAX_HEADER_INDEX) {
    throw new Error(
      `anchor header contextIndex must be between 0 and ${AUTHENTICATED_SPV_TRACKER_MAX_HEADER_INDEX}`,
    );
  }
  return {
    idHex: normalizeHex(header.idHex, 32, 'anchor header id'),
    height: normalizeHeaderHeight(header.height, 'anchor header height'),
    extensionRootHex: normalizeHex(header.extensionRootHex, 32, 'anchor header extension root'),
    contextIndex: header.contextIndex,
  };
}

function normalizeHeaderHeight(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_HEADER_HEIGHT) {
    throw new Error(`${label} must be a non-negative signed Int`);
  }
  return value;
}

function normalizeFinalityProofSystemId(value: number): number {
  if (value !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA) {
    throw new Error(
      `finality proof system must be ${AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA}`,
    );
  }
  return value;
}

function normalizePositiveSignedLong(value: string | number | bigint, label: string): bigint {
  const parsed = normalizeNonNegativeSignedLong(value, label);
  if (parsed === 0n) throw new Error(`${label} must be greater than zero`);
  return parsed;
}

function normalizeNonNegativeSignedLong(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} number must be a non-negative safe integer`);
  }
  const raw = String(value);
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be a non-negative integer`);
  const parsed = BigInt(raw);
  if (parsed > MAX_SIGNED_LONG) throw new Error(`${label} must fit a positive signed Long`);
  return parsed;
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = normalizeVariableHex(hex, label);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean;
}

function normalizeVariableHex(hex: string, label: string): string {
  if (typeof hex !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function normalizeBoundedVariableHex(
  hex: string,
  label: string,
  maxBytes: number,
): string {
  if (typeof hex !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const prefixChars = hex.startsWith('0x') ? 2 : 0;
  if (hex.length > maxBytes * 2 + prefixChars) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte bound`);
  }
  const clean = prefixChars === 2 ? hex.slice(2) : hex;
  return normalizeVariableHex(clean, label);
}

function normalizeSigmaConstant(hex: string, label: string): string {
  const clean = normalizeVariableHex(hex, label);
  if (clean.length < 4) throw new Error(`${label} is too short`);
  return clean;
}

function uint32Be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function uint64Be(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(value);
  return out;
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}
