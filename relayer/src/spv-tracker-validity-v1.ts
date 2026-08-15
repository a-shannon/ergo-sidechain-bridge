/**
 * Pure preactivation planner for SPVTrackerValidityV1 admission.
 *
 * The transition binds one complete EIP-0045 envelope to an exact 0x0401
 * checkpoint anchor and an append-only AVL successor. It performs no network,
 * persistence, signing, submission, or broadcast operation.
 */

import blakejs from 'blakejs';

import {
  tracker_v2_empty_digest,
  tracker_v2_get_proof,
  tracker_v2_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  decodeBridgeValidityFinalityPayloadV2,
} from './bridge-validity-finality-statement-v2.js';
import {
  assertEip0045BridgeValidityProofEnvelopeV1Matches,
  type Eip0045BridgeValidityProofEnvelopeV1ExpectedContext,
} from './bridge-validity-proof-envelope-v1.js';
import {
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE,
  ERGO_EXTENSION_MERKLE_MAX_DEPTH,
  validateErgoExtensionMembershipProof,
  verifyErgoExtensionMembership,
} from './ergo-extension-membership.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';

export const VALIDITY_SPV_TRACKER_DOMAIN = 'E2S_SPV_VALIDITY_V1';
export const VALIDITY_SPV_TRACKER_KEY_LENGTH = 32;
export const VALIDITY_SPV_TRACKER_VALUE_LENGTH = 264;
export const VALIDITY_SPV_TRACKER_FLAGS = 0x01;
export const VALIDITY_SPV_TRACKER_COMPATIBILITY_PROOF_SYSTEM_ID = 1;
export const VALIDITY_SPV_TRACKER_MAX_BURNS = 256;
export const VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX = 9;
export const VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES =
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE * ERGO_EXTENSION_MERKLE_MAX_DEPTH;

const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_HEADER_HEIGHT = 0x7fff_ffff;

export interface ValiditySpvTrackerHistoryEntry {
  readonly key: string;
  readonly value: string;
}

export interface ValiditySpvTrackerIdentity {
  readonly sidechainIdHex: string;
  readonly sidechainHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
}

export interface ValiditySpvTrackerValue {
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly compatibilityProofSystemId: number;
  readonly compatibilityStatementDigestHex: string;
  readonly compatibilitySemanticProgramIdHex: string;
  readonly compatibilityVerifierProfileIdHex: string;
  readonly compatibilityPayloadDigestHex: string;
  readonly compatibilityAggregateProofDigestHex: string;
}

export interface ValiditySpvTrackerGetProof {
  readonly keyHex: string;
  readonly valueHex: string;
  readonly getProofHex: string;
  readonly digestHex: string;
}

export interface ValiditySpvAnchorHeader {
  readonly idHex: string;
  readonly height: number;
  readonly extensionRootHex: string;
  readonly contextIndex: number;
}

export interface BuildValiditySpvAdmissionV1Input {
  readonly envelope: unknown;
  readonly expectedEnvelope:
    Eip0045BridgeValidityProofEnvelopeV1ExpectedContext;
  readonly trackerNftIdHex: string;
  readonly extensionProofHex: string;
  readonly anchorHeader: ValiditySpvAnchorHeader;
  readonly approvedSidechainIdHex: string;
  readonly approvedTrustAnchorDigestHex: string;
  readonly history: readonly ValiditySpvTrackerHistoryEntry[];
  readonly currentCounter: number | bigint;
  readonly currentLatestSidechainHeight: string | number | bigint;
  readonly currentStampHeight: number;
  readonly currentErgoHeight: number;
}

export interface ValiditySpvAdmissionV1Plan {
  readonly trackerNftIdHex: string;
  readonly approvedTrustAnchorDigestHex: string;
  readonly encodedPayloadHex: string;
  readonly statementDigestHex: string;
  readonly rawSealDigestHex: string;
  readonly proofChunksHex: readonly string[];
  readonly checkpointCommitmentHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly extensionValueHex: string;
  readonly extensionProofHex: string;
  readonly avlInsertProofHex: string;
  readonly proofBundleHex: string;
  readonly inputDigestHex: string;
  readonly successorDigestHex: string;
  readonly sidechainHeight: string;
  readonly currentErgoHeight: number;
  readonly anchorHeader: ValiditySpvAnchorHeader;
  readonly inputRegisters:
    Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
  readonly successorRegisters:
    Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
  readonly contextExtension: {
    readonly proofChunksHex: readonly string[];
    readonly applicationPayloadHex: string;
    readonly proofBundleHex: string;
    readonly headerIndex: number;
  };
  readonly boundaries: {
    readonly proofTransportValidated: true;
    readonly proofValidityEstablishedByPlanner: false;
    readonly localAnchorMembershipValidated: true;
    readonly profileActivated: false;
    readonly nodeCheckPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

export function deriveValiditySpvTrackerKey(input: {
  readonly sidechainIdHex: string;
  readonly sidechainHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
}): string {
  const sidechainHeight =
    positiveSignedLong(input.sidechainHeight, 'sidechainHeight');
  return blake2b256(Buffer.concat([
    Buffer.from(VALIDITY_SPV_TRACKER_DOMAIN, 'ascii'),
    hexBytes(input.sidechainIdHex, 32, 'sidechainId'),
    uint64Be(sidechainHeight),
    hexBytes(input.executionBlockHashHex, 32, 'executionBlockHash'),
  ])).toString('hex');
}

export function encodeValiditySpvTrackerValue(input: {
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly compatibilityStatementDigestHex: string;
  readonly compatibilitySemanticProgramIdHex: string;
  readonly compatibilityVerifierProfileIdHex: string;
  readonly compatibilityPayloadDigestHex: string;
  readonly compatibilityAggregateProofDigestHex: string;
}): string {
  return Buffer.concat([
    hexBytes(input.bridgeEventRootHex, 32, 'bridgeEventRoot'),
    hexBytes(input.checkpointCommitmentHex, 32, 'checkpointCommitment'),
    hexBytes(input.anchorHeaderIdHex, 32, 'anchorHeaderId'),
    uint32Be(headerHeight(input.anchorHeaderHeight, 'anchorHeaderHeight')),
    uint32Be(VALIDITY_SPV_TRACKER_COMPATIBILITY_PROOF_SYSTEM_ID),
    hexBytes(
      input.compatibilityStatementDigestHex,
      32,
      'compatibilityStatementDigest',
    ),
    hexBytes(
      input.compatibilitySemanticProgramIdHex,
      32,
      'compatibilitySemanticProgramId',
    ),
    hexBytes(
      input.compatibilityVerifierProfileIdHex,
      32,
      'compatibilityVerifierProfileId',
    ),
    hexBytes(
      input.compatibilityPayloadDigestHex,
      32,
      'compatibilityPayloadDigest',
    ),
    hexBytes(
      input.compatibilityAggregateProofDigestHex,
      32,
      'compatibilityAggregateProofDigest',
    ),
  ]).toString('hex');
}

/**
 * Decodes the immutable tracker value used by the validity-settlement V1
 * profile. This is deliberately separate from authenticated V2: V1 accepts
 * only the frozen compatibility proof-system identifier and does not promote
 * its compatibility fields into Frontier application-state membership or
 * funds authority.
 */
export function decodeValiditySpvTrackerValue(
  valueHex: string,
): ValiditySpvTrackerValue {
  const bytes = Buffer.from(
    fixedHex(
      valueHex,
      VALIDITY_SPV_TRACKER_VALUE_LENGTH,
      'validity tracker value',
    ),
    'hex',
  );
  const compatibilityProofSystemId = bytes.readUInt32BE(100);
  if (
    compatibilityProofSystemId
    !== VALIDITY_SPV_TRACKER_COMPATIBILITY_PROOF_SYSTEM_ID
  ) {
    throw new Error('validity tracker proof-system ID is not supported');
  }
  return Object.freeze({
    bridgeEventRootHex: bytes.subarray(0, 32).toString('hex'),
    checkpointCommitmentHex: bytes.subarray(32, 64).toString('hex'),
    anchorHeaderIdHex: bytes.subarray(64, 96).toString('hex'),
    // This immutable value, rather than mutable tracker R8, is the anchor
    // height that settlement must bind to.
    anchorHeaderHeight: bytes.readUInt32BE(96),
    compatibilityProofSystemId,
    compatibilityStatementDigestHex: bytes.subarray(104, 136).toString('hex'),
    compatibilitySemanticProgramIdHex: bytes.subarray(136, 168).toString('hex'),
    compatibilityVerifierProfileIdHex: bytes.subarray(168, 200).toString('hex'),
    compatibilityPayloadDigestHex: bytes.subarray(200, 232).toString('hex'),
    compatibilityAggregateProofDigestHex: bytes.subarray(232, 264).toString('hex'),
  });
}

/** Builds a membership proof for an existing validity tracker entry. */
export function buildValiditySpvTrackerGetProof(
  history: readonly ValiditySpvTrackerHistoryEntry[],
  identity: ValiditySpvTrackerIdentity,
): ValiditySpvTrackerGetProof {
  const normalized = normalizeHistory(history);
  const keyHex = deriveValiditySpvTrackerKey(identity);
  if (!normalized.some(entry => entry.key === keyHex)) {
    throw new Error('validity tracker history does not contain the derived V1 key');
  }
  const result = JSON.parse(
    tracker_v2_get_proof(JSON.stringify(normalized), keyHex),
  ) as Readonly<Record<string, unknown>>;
  return Object.freeze({
    keyHex,
    valueHex: fixedHex(
      result.value_hex,
      VALIDITY_SPV_TRACKER_VALUE_LENGTH,
      'validity tracker proof value',
    ),
    getProofHex: variableHex(
      result.get_proof_hex,
      'validity tracker get proof',
    ),
    digestHex: fixedHex(
      result.digest_hex,
      33,
      'validity tracker proof digest',
    ),
  });
}

export function getValiditySpvTrackerDigest(
  history: readonly ValiditySpvTrackerHistoryEntry[],
): string {
  if (history.length === 0) {
    return fixedHex(
      tracker_v2_empty_digest(),
      33,
      'empty validity tracker digest',
    );
  }
  const normalized = normalizeHistory(history);
  const result = JSON.parse(
    tracker_v2_get_proof(JSON.stringify(normalized), normalized[0].key),
  ) as Readonly<Record<string, unknown>>;
  return fixedHex(
    result.digest_hex,
    33,
    'validity tracker digest',
  );
}

export function buildValiditySpvAdmissionV1(
  input: BuildValiditySpvAdmissionV1Input,
): ValiditySpvAdmissionV1Plan {
  const envelope = assertEip0045BridgeValidityProofEnvelopeV1Matches(
    input.envelope,
    input.expectedEnvelope,
  );
  const payload = decodeBridgeValidityFinalityPayloadV2(
    envelope.consumerAbi.applicationPayloadHex,
  );
  const trackerNftIdHex = fixedHex(
    input.trackerNftIdHex,
    32,
    'tracker NFT ID',
  );
  if (payload.trackerNftIdHex !== trackerNftIdHex) {
    throw new Error('validity payload tracker NFT does not match the tracker');
  }
  const approvedSidechainIdHex = fixedHex(
    input.approvedSidechainIdHex,
    32,
    'approved sidechain ID',
  );
  if (payload.checkpoint.sidechainIdHex !== approvedSidechainIdHex) {
    throw new Error(
      'validity checkpoint sidechain ID does not match the tracker allowlist',
    );
  }
  const approvedTrustAnchorDigestHex = fixedHex(
    input.approvedTrustAnchorDigestHex,
    32,
    'approved trust-anchor digest',
  );
  if (payload.trustedAnchorDigestHex !== approvedTrustAnchorDigestHex) {
    throw new Error(
      'validity proof trust anchor does not match the tracker approval',
    );
  }
  const sidechainHeight = positiveSignedLong(
    payload.checkpoint.sidechainHeight,
    'checkpoint sidechain height',
  );
  const oldLatestHeight = nonnegativeSignedLong(
    input.currentLatestSidechainHeight,
    'current latest sidechain height',
  );
  if (sidechainHeight <= oldLatestHeight) {
    throw new Error('validity checkpoint must advance the tracker height');
  }
  if (
    payload.checkpoint.burnLeafCount < 1
    || payload.checkpoint.burnLeafCount > VALIDITY_SPV_TRACKER_MAX_BURNS
  ) {
    throw new Error(
      `validity checkpoint burn count must be between 1 and ${VALIDITY_SPV_TRACKER_MAX_BURNS}`,
    );
  }

  const anchorHeader = normalizeAnchorHeader(input.anchorHeader);
  const currentErgoHeight =
    headerHeight(input.currentErgoHeight, 'current Ergo height');
  const currentStampHeight =
    headerHeight(input.currentStampHeight, 'current tracker stamp height');
  if (anchorHeader.height > currentErgoHeight) {
    throw new Error('validity anchor cannot be newer than the current Ergo height');
  }
  if (
    currentErgoHeight - anchorHeader.height
    !== anchorHeader.contextIndex + 1
  ) {
    throw new Error(
      'validity anchor context index must match its exact Ergo depth',
    );
  }
  if (currentStampHeight >= currentErgoHeight) {
    throw new Error('current Ergo height must advance the tracker stamp');
  }

  const extensionProofHex = variableHex(
    input.extensionProofHex,
    'extension proof',
    VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES,
  );
  const extensionProof = Buffer.from(extensionProofHex, 'hex');
  const extensionProofValidation =
    validateErgoExtensionMembershipProof(extensionProof);
  if (!extensionProofValidation.ok) {
    throw new Error(extensionProofValidation.errors.join('; '));
  }
  if (!verifyErgoExtensionMembership({
    key: Buffer.from(payload.extensionKeyHex, 'hex'),
    value: Buffer.from(payload.extensionValueHex, 'hex'),
    proof: extensionProof,
    root: Buffer.from(anchorHeader.extensionRootHex, 'hex'),
  })) {
    throw new Error(
      'validity checkpoint 0x0401 value is not in the anchor extension root',
    );
  }

  const trackerKeyHex = deriveValiditySpvTrackerKey({
    sidechainIdHex: payload.checkpoint.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex: payload.checkpoint.executionBlockHashHex,
  });
  const trackerValueHex = encodeValiditySpvTrackerValue({
    bridgeEventRootHex: payload.checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: payload.checkpointCommitmentHex,
    anchorHeaderIdHex: anchorHeader.idHex,
    anchorHeaderHeight: anchorHeader.height,
    compatibilityStatementDigestHex:
      payload.compatibilityStatementV1DigestHex,
    compatibilitySemanticProgramIdHex:
      payload.compatibilitySemanticProgramIdHex,
    compatibilityVerifierProfileIdHex:
      payload.compatibilityVerifierProfileIdHex,
    compatibilityPayloadDigestHex:
      payload.compatibilityPayloadDigestHex,
    compatibilityAggregateProofDigestHex:
      payload.compatibilityAggregateProofDigestHex,
  });
  const history = normalizeHistory(input.history);
  const inputDigestHex = history.length === 0
    ? fixedHex(tracker_v2_empty_digest(), 33, 'empty validity tracker digest')
    : currentTrackerDigest(history);
  const inserted = JSON.parse(
    tracker_v2_insert(JSON.stringify(history), trackerKeyHex, trackerValueHex),
  ) as Readonly<Record<string, unknown>>;
  const successorDigestHex = fixedHex(
    inserted.new_digest_hex,
    33,
    'successor validity tracker digest',
  );
  const avlInsertProofHex = variableHex(
    inserted.insert_proof_hex,
    'validity tracker AVL insert proof',
  );
  const proofBundleHex = encodeValiditySpvProofBundle(
    extensionProofHex,
    avlInsertProofHex,
  );
  const currentCounter =
    nonnegativeSignedLong(input.currentCounter, 'current tracker counter');
  if (currentCounter === MAX_SIGNED_LONG) {
    throw new Error('current tracker counter cannot advance beyond Long range');
  }

  return deepFreeze({
    trackerNftIdHex,
    approvedTrustAnchorDigestHex,
    encodedPayloadHex: payload.encodedPayloadHex,
    statementDigestHex: envelope.statementDigestHex,
    rawSealDigestHex: envelope.rawSealDigestHex,
    proofChunksHex: [...envelope.consumerAbi.proofChunksHex],
    checkpointCommitmentHex: payload.checkpointCommitmentHex,
    trackerKeyHex,
    trackerValueHex,
    extensionValueHex: payload.extensionValueHex,
    extensionProofHex,
    avlInsertProofHex,
    proofBundleHex,
    inputDigestHex,
    successorDigestHex,
    sidechainHeight: sidechainHeight.toString(),
    currentErgoHeight,
    anchorHeader,
    inputRegisters: {
      R4: encodeLongRegister(currentCounter),
      R5: encodeValiditySpvTrackerAvlRegister(inputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(approvedSidechainIdHex, 'hex')),
      R7: encodeLongRegister(oldLatestHeight),
      R8: encodeIntRegister(currentStampHeight),
      R9: encodeCollByteRegister(
        Buffer.from(approvedTrustAnchorDigestHex, 'hex'),
      ),
    },
    successorRegisters: {
      R4: encodeLongRegister(currentCounter + 1n),
      R5: encodeValiditySpvTrackerAvlRegister(successorDigestHex),
      R6: encodeCollByteRegister(Buffer.from(approvedSidechainIdHex, 'hex')),
      R7: encodeLongRegister(sidechainHeight),
      R8: encodeIntRegister(currentErgoHeight),
      R9: encodeCollByteRegister(
        Buffer.from(approvedTrustAnchorDigestHex, 'hex'),
      ),
    },
    contextExtension: {
      proofChunksHex: [...envelope.consumerAbi.proofChunksHex],
      applicationPayloadHex: payload.encodedPayloadHex,
      proofBundleHex,
      headerIndex: anchorHeader.contextIndex,
    },
    boundaries: {
      proofTransportValidated: true as const,
      proofValidityEstablishedByPlanner: false as const,
      localAnchorMembershipValidated: true as const,
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
}

export function encodeValiditySpvProofBundle(
  extensionProofHex: string,
  avlInsertProofHex: string,
): string {
  const extensionProof = Buffer.from(variableHex(
    extensionProofHex,
    'extension proof',
    VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES,
  ), 'hex');
  const validation = validateErgoExtensionMembershipProof(extensionProof);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  const avlInsertProof = Buffer.from(variableHex(
    avlInsertProofHex,
    'validity tracker AVL insert proof',
  ), 'hex');
  if (avlInsertProof.length === 0) {
    throw new Error('validity tracker AVL insert proof must be non-empty');
  }
  return Buffer.concat([
    uint64Be(BigInt(extensionProof.length)),
    extensionProof,
    avlInsertProof,
  ]).toString('hex');
}

export function encodeValiditySpvTrackerAvlRegister(
  digestHex: string,
): string {
  return encodeAvlTreeRegister(
    Buffer.from(fixedHex(digestHex, 33, 'validity tracker digest'), 'hex'),
    VALIDITY_SPV_TRACKER_FLAGS,
    VALIDITY_SPV_TRACKER_VALUE_LENGTH,
  );
}

function currentTrackerDigest(
  history: readonly ValiditySpvTrackerHistoryEntry[],
): string {
  const proof = JSON.parse(
    tracker_v2_get_proof(JSON.stringify(history), history[0].key),
  ) as Readonly<Record<string, unknown>>;
  return fixedHex(
    proof.digest_hex,
    33,
    'current validity tracker digest',
  );
}

function normalizeHistory(
  history: readonly ValiditySpvTrackerHistoryEntry[],
): ValiditySpvTrackerHistoryEntry[] {
  return history.map((entry, index) => ({
    key: fixedHex(
      entry.key,
      VALIDITY_SPV_TRACKER_KEY_LENGTH,
      `history[${index}].key`,
    ),
    value: fixedHex(
      entry.value,
      VALIDITY_SPV_TRACKER_VALUE_LENGTH,
      `history[${index}].value`,
    ),
  }));
}

function normalizeAnchorHeader(
  input: ValiditySpvAnchorHeader,
): ValiditySpvAnchorHeader {
  if (
    !Number.isSafeInteger(input.contextIndex)
    || input.contextIndex < 0
    || input.contextIndex > VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX
  ) {
    throw new Error(
      `validity anchor context index must be between 0 and ${VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX}`,
    );
  }
  return Object.freeze({
    idHex: fixedHex(input.idHex, 32, 'validity anchor header ID'),
    height: headerHeight(input.height, 'validity anchor height'),
    extensionRootHex: fixedHex(
      input.extensionRootHex,
      32,
      'validity anchor extension root',
    ),
    contextIndex: input.contextIndex,
  });
}

function positiveSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = signedLong(value, label);
  if (normalized <= 0n) throw new Error(`${label} must be positive`);
  return normalized;
}

function nonnegativeSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = signedLong(value, label);
  if (normalized < 0n) throw new Error(`${label} must be nonnegative`);
  return normalized;
}

function signedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  if (
    typeof value === 'string'
    && !/^(?:0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  let normalized: bigint;
  try {
    normalized = BigInt(value);
  } catch {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  if (normalized < 0n || normalized > MAX_SIGNED_LONG) {
    throw new Error(`${label} must fit a nonnegative signed Long`);
  }
  return normalized;
}

function headerHeight(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_HEADER_HEIGHT
  ) {
    throw new Error(`${label} must fit a nonnegative Int`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(
  value: unknown,
  label: string,
  maxBytes = Number.MAX_SAFE_INTEGER,
): string {
  if (
    typeof value !== 'string'
    || value.length % 2 !== 0
    || !/^[0-9a-f]*$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  if (value.length / 2 > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte bound`);
  }
  return value;
}

function hexBytes(value: unknown, bytes: number, label: string): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function uint32Be(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value, 0);
  return bytes;
}

function uint64Be(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value, 0);
  return bytes;
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
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
