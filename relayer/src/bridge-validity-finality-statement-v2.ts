import blakejs from 'blakejs';

import {
  BRIDGE_CHECKPOINT_ENCODED_BYTES,
  BRIDGE_EXTENSION_KEY_HEX,
  decodeBridgeCheckpointV1,
  deriveBridgeCheckpointCommitmentHex,
  encodeBridgeExtensionValueV1,
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import { decodeAggregateFinalityProofV1 } from './bridge-finality-proof.js';

export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN =
  'E2S_BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2';
export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_VERSION = 2;
export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_HASH_BLAKE2B256 = 1;
export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_SOURCE_SUBSTRATE_GRANDPA_V1 = 1;
export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_FLAGS_NONE = 0;
export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS = 256;

export const EIP0045_ERGO_STATEMENT_V1_DOMAIN = 'Ergo.VerifyStark.Statement';
export const EIP0045_ERGO_STATEMENT_V1_VERSION = 1;
export const EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES = 159;
export const EIP0045_INITIAL_MAX_APPLICATION_PAYLOAD_BYTES = 16_384;

const DIGEST_BYTES = 32;
const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const PAYLOAD_DOMAIN_BYTES = Buffer.byteLength(
  BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN,
  'ascii',
);
const PAYLOAD_DISCRIMINATOR_OFFSET = PAYLOAD_DOMAIN_BYTES + 1;
const PAYLOAD_TRACKER_NFT_OFFSET = PAYLOAD_DISCRIMINATOR_OFFSET + 4;
const PAYLOAD_CHECKPOINT_OFFSET = PAYLOAD_TRACKER_NFT_OFFSET + DIGEST_BYTES;
const PAYLOAD_CHECKPOINT_COMMITMENT_OFFSET =
  PAYLOAD_CHECKPOINT_OFFSET + BRIDGE_CHECKPOINT_ENCODED_BYTES;
const PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET =
  PAYLOAD_CHECKPOINT_COMMITMENT_OFFSET + DIGEST_BYTES;
const PAYLOAD_NATIVE_REQUEST_DIGEST_OFFSET =
  PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (5 * DIGEST_BYTES);
const PAYLOAD_TRUSTED_ANCHOR_DIGEST_OFFSET =
  PAYLOAD_NATIVE_REQUEST_DIGEST_OFFSET + DIGEST_BYTES;
const PAYLOAD_FINALITY_HORIZON_HEIGHT_OFFSET =
  PAYLOAD_TRUSTED_ANCHOR_DIGEST_OFFSET + DIGEST_BYTES;
const PAYLOAD_FINALITY_HORIZON_HASH_OFFSET =
  PAYLOAD_FINALITY_HORIZON_HEIGHT_OFFSET + 8;
const PAYLOAD_EXTENSION_KEY_OFFSET = PAYLOAD_FINALITY_HORIZON_HASH_OFFSET + DIGEST_BYTES;
const PAYLOAD_EXTENSION_VALUE_OFFSET = PAYLOAD_EXTENSION_KEY_OFFSET + 2;

export const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES =
  PAYLOAD_EXTENSION_VALUE_OFFSET + 64;

const EIP_STATEMENT_CHAIN_DOMAIN_OFFSET = EIP0045_ERGO_STATEMENT_V1_DOMAIN.length + 1;
const EIP_STATEMENT_PROFILE_OFFSET = EIP_STATEMENT_CHAIN_DOMAIN_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PROGRAM_OFFSET = EIP_STATEMENT_PROFILE_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_CONTRACT_OFFSET = EIP_STATEMENT_PROGRAM_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET = EIP_STATEMENT_CONTRACT_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_OFFSET = EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET + 4;

export interface BridgeValidityFinalityPayloadV2Input {
  trackerNftIdHex: string;
  encodedCompatibilityAggregateProofV1: Buffer | string;
}

export interface BridgeValidityFinalityPayloadV2 {
  readonly version: 2;
  readonly hashAlgorithmId: 1;
  readonly sourceProfileId: 1;
  readonly flags: 0;
  readonly trackerNftIdHex: string;
  readonly compatibilityStatementV1DigestHex: string;
  readonly compatibilitySemanticProgramIdHex: string;
  readonly compatibilityVerifierProfileIdHex: string;
  readonly compatibilityPayloadDigestHex: string;
  readonly compatibilityAggregateProofDigestHex: string;
  readonly nativeVerifierRequestDigestHex: string;
  readonly checkpoint: Readonly<BridgeCheckpointV1>;
  readonly encodedCheckpointHex: string;
  readonly checkpointCommitmentHex: string;
  readonly trustedAnchorDigestHex: string;
  readonly finalityHorizonHeight: string;
  readonly finalityHorizonHashHex: string;
  readonly extensionKeyHex: typeof BRIDGE_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly encodedPayloadHex: string;
  readonly payloadDigestHex: string;
}

export interface Eip0045BridgeValidityStatementV1Input {
  chainDomainIdHex: string;
  profileIdHex: string;
  programIdHex: string;
  contractPropositionBytes: Buffer | string;
  applicationPayload: Buffer | string;
}

export interface Eip0045BridgeValidityStatementV1 {
  readonly version: 1;
  readonly chainDomainIdHex: string;
  readonly profileIdHex: string;
  readonly programIdHex: string;
  readonly contractIdHex: string;
  readonly applicationPayload: Readonly<BridgeValidityFinalityPayloadV2>;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
}

export function buildBridgeValidityFinalityPayloadV2(
  input: BridgeValidityFinalityPayloadV2Input,
): BridgeValidityFinalityPayloadV2 {
  const trackerNftId = exactHexBytes(input.trackerNftIdHex, DIGEST_BYTES, 'trackerNftId');
  const compatibilityProof = decodeAggregateFinalityProofV1(
    input.encodedCompatibilityAggregateProofV1,
  );
  const compatibilityStatement = compatibilityProof.statement;
  const nativeVerifierRequest = Buffer.from(compatibilityProof.payloadHex, 'hex');

  const encodedCheckpoint = Buffer.from(compatibilityStatement.encodedCheckpointHex, 'hex');
  const checkpoint = decodeBridgeCheckpointV1(encodedCheckpoint);
  assertValidityProfileCheckpoint(checkpoint);
  const checkpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(encodedCheckpoint),
    'hex',
  );
  if (checkpointCommitment.toString('hex') !== compatibilityStatement.checkpointCommitmentHex) {
    throw new Error('compatibility statement checkpoint commitment mismatch');
  }
  const compatibilityStatementDigest = Buffer.from(compatibilityProof.statementDigestHex, 'hex');
  const compatibilitySemanticProgramId = Buffer.from(compatibilityStatement.programIdHex, 'hex');
  const compatibilityVerifierProfileId = Buffer.from(
    compatibilityProof.verifierProfileIdHex,
    'hex',
  );
  const compatibilityPayloadDigest = Buffer.from(compatibilityProof.payloadDigestHex, 'hex');
  const compatibilityAggregateProofDigest = Buffer.from(compatibilityProof.proofDigestHex, 'hex');
  const nativeVerifierRequestDigest = blake2b256(nativeVerifierRequest);
  const trustedAnchorDigest = Buffer.from(compatibilityStatement.trustedAnchorDigestHex, 'hex');
  const finalityHorizonHash = Buffer.from(compatibilityStatement.finalityHorizonHashHex, 'hex');
  const extensionValue = Buffer.from(encodeBridgeExtensionValueV1({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: checkpointCommitment.toString('hex'),
  }), 'hex');

  const payloadBytes = Buffer.concat([
    Buffer.from(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from([
      BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_VERSION,
      BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_HASH_BLAKE2B256,
      BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_SOURCE_SUBSTRATE_GRANDPA_V1,
      BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_FLAGS_NONE,
    ]),
    trackerNftId,
    encodedCheckpoint,
    checkpointCommitment,
    compatibilityStatementDigest,
    compatibilitySemanticProgramId,
    compatibilityVerifierProfileId,
    compatibilityPayloadDigest,
    compatibilityAggregateProofDigest,
    nativeVerifierRequestDigest,
    trustedAnchorDigest,
    uint64Be(compatibilityStatement.finalityHorizonHeight, 'finalityHorizonHeight'),
    finalityHorizonHash,
    Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
    extensionValue,
  ]);

  if (payloadBytes.length !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES) {
    throw new Error('bridge validity finality payload V2 internal length mismatch');
  }
  return freezePayload({
    trackerNftId,
    compatibilityStatementDigest,
    compatibilitySemanticProgramId,
    compatibilityVerifierProfileId,
    compatibilityPayloadDigest,
    compatibilityAggregateProofDigest,
    nativeVerifierRequestDigest,
    checkpoint,
    encodedCheckpoint,
    checkpointCommitment,
    trustedAnchorDigest,
    finalityHorizonHash,
    extensionValue,
    payloadBytes,
    finalityHorizonHeight: BigInt(compatibilityStatement.finalityHorizonHeight),
  });
}

export function decodeBridgeValidityFinalityPayloadV2(
  encodedPayload: Buffer | string,
): BridgeValidityFinalityPayloadV2 {
  const payloadBytes = exactBytes(
    encodedPayload,
    BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    'encoded bridge validity finality payload V2',
  );
  const expectedDomain = Buffer.concat([
    Buffer.from(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN, 'ascii'),
    Buffer.from([0]),
  ]);
  if (!payloadBytes.subarray(0, PAYLOAD_DISCRIMINATOR_OFFSET).equals(expectedDomain)) {
    throw new Error('bridge validity finality payload V2 domain mismatch');
  }
  validatePayloadDiscriminators(
    payloadBytes[PAYLOAD_DISCRIMINATOR_OFFSET],
    payloadBytes[PAYLOAD_DISCRIMINATOR_OFFSET + 1],
    payloadBytes[PAYLOAD_DISCRIMINATOR_OFFSET + 2],
    payloadBytes[PAYLOAD_DISCRIMINATOR_OFFSET + 3],
  );

  const trackerNftId = payloadBytes.subarray(
    PAYLOAD_TRACKER_NFT_OFFSET,
    PAYLOAD_CHECKPOINT_OFFSET,
  );
  const encodedCheckpoint = payloadBytes.subarray(
    PAYLOAD_CHECKPOINT_OFFSET,
    PAYLOAD_CHECKPOINT_COMMITMENT_OFFSET,
  );
  const checkpoint = decodeBridgeCheckpointV1(encodedCheckpoint);
  assertValidityProfileCheckpoint(checkpoint);
  const checkpointCommitment = payloadBytes.subarray(
    PAYLOAD_CHECKPOINT_COMMITMENT_OFFSET,
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET,
  );
  const expectedCheckpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(encodedCheckpoint),
    'hex',
  );
  if (!checkpointCommitment.equals(expectedCheckpointCommitment)) {
    throw new Error('bridge validity finality payload V2 checkpoint commitment mismatch');
  }
  const compatibilityStatementDigest = payloadBytes.subarray(
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET,
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + DIGEST_BYTES,
  );
  const compatibilitySemanticProgramId = payloadBytes.subarray(
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + DIGEST_BYTES,
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (2 * DIGEST_BYTES),
  );
  const compatibilityVerifierProfileId = payloadBytes.subarray(
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (2 * DIGEST_BYTES),
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (3 * DIGEST_BYTES),
  );
  const compatibilityPayloadDigest = payloadBytes.subarray(
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (3 * DIGEST_BYTES),
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (4 * DIGEST_BYTES),
  );
  const compatibilityAggregateProofDigest = payloadBytes.subarray(
    PAYLOAD_COMPATIBILITY_STATEMENT_DIGEST_OFFSET + (4 * DIGEST_BYTES),
    PAYLOAD_NATIVE_REQUEST_DIGEST_OFFSET,
  );
  const nativeVerifierRequestDigest = payloadBytes.subarray(
    PAYLOAD_NATIVE_REQUEST_DIGEST_OFFSET,
    PAYLOAD_TRUSTED_ANCHOR_DIGEST_OFFSET,
  );
  const trustedAnchorDigest = payloadBytes.subarray(
    PAYLOAD_TRUSTED_ANCHOR_DIGEST_OFFSET,
    PAYLOAD_FINALITY_HORIZON_HEIGHT_OFFSET,
  );
  const finalityHorizonHeight = payloadBytes.readBigUInt64BE(
    PAYLOAD_FINALITY_HORIZON_HEIGHT_OFFSET,
  );
  const finalityHorizonHash = payloadBytes.subarray(
    PAYLOAD_FINALITY_HORIZON_HASH_OFFSET,
    PAYLOAD_EXTENSION_KEY_OFFSET,
  );
  const extensionKey = payloadBytes.subarray(
    PAYLOAD_EXTENSION_KEY_OFFSET,
    PAYLOAD_EXTENSION_VALUE_OFFSET,
  );
  if (extensionKey.toString('hex') !== BRIDGE_EXTENSION_KEY_HEX) {
    throw new Error('bridge validity finality payload V2 extension key mismatch');
  }
  const extensionValue = payloadBytes.subarray(PAYLOAD_EXTENSION_VALUE_OFFSET);
  const expectedExtensionValue = Buffer.from(encodeBridgeExtensionValueV1({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: checkpointCommitment.toString('hex'),
  }), 'hex');
  if (!extensionValue.equals(expectedExtensionValue)) {
    throw new Error('bridge validity finality payload V2 extension value mismatch');
  }

  return freezePayload({
    trackerNftId,
    compatibilityStatementDigest,
    compatibilitySemanticProgramId,
    compatibilityVerifierProfileId,
    compatibilityPayloadDigest,
    compatibilityAggregateProofDigest,
    nativeVerifierRequestDigest,
    checkpoint,
    encodedCheckpoint,
    checkpointCommitment,
    trustedAnchorDigest,
    finalityHorizonHash,
    extensionValue,
    payloadBytes,
    finalityHorizonHeight,
  });
}

export function assertBridgeValidityFinalityPayloadV2Matches(
  encodedPayload: Buffer | string,
  expected: BridgeValidityFinalityPayloadV2Input,
): BridgeValidityFinalityPayloadV2 {
  const actual = exactBytes(
    encodedPayload,
    BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    'encoded bridge validity finality payload V2',
  );
  const rebuilt = buildBridgeValidityFinalityPayloadV2(expected);
  const expectedBytes = Buffer.from(rebuilt.encodedPayloadHex, 'hex');
  if (!actual.equals(expectedBytes)) {
    throw new Error('bridge validity finality payload V2 expected binding mismatch');
  }
  return decodeBridgeValidityFinalityPayloadV2(actual);
}

export function deriveEip0045ContractIdHex(
  contractPropositionBytes: Buffer | string,
): string {
  const propositionBytes = variableBytes(
    contractPropositionBytes,
    'contract proposition bytes',
    UINT32_MAX,
  );
  if (propositionBytes.length === 0) {
    throw new Error('contract proposition bytes must be non-empty');
  }
  return blake2b256(propositionBytes).toString('hex');
}

export function buildEip0045BridgeValidityStatementV1(
  input: Eip0045BridgeValidityStatementV1Input,
): Eip0045BridgeValidityStatementV1 {
  const chainDomainId = exactHexBytes(input.chainDomainIdHex, DIGEST_BYTES, 'chainDomainId');
  const profileId = exactHexBytes(input.profileIdHex, DIGEST_BYTES, 'profileId');
  const programId = exactHexBytes(input.programIdHex, DIGEST_BYTES, 'programId');
  const contractId = Buffer.from(deriveEip0045ContractIdHex(input.contractPropositionBytes), 'hex');
  const payloadBytes = exactBytes(
    input.applicationPayload,
    BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    'bridge validity application payload',
  );
  const applicationPayload = decodeBridgeValidityFinalityPayloadV2(payloadBytes);
  if (payloadBytes.length > EIP0045_INITIAL_MAX_APPLICATION_PAYLOAD_BYTES) {
    throw new Error('bridge validity application payload exceeds the EIP-0045 initial profile limit');
  }

  const statementBytes = Buffer.concat([
    Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii'),
    Buffer.from([EIP0045_ERGO_STATEMENT_V1_VERSION]),
    chainDomainId,
    profileId,
    programId,
    contractId,
    uint32Le(payloadBytes.length, 'application payload length'),
    payloadBytes,
  ]);
  if (statementBytes.length !== EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + payloadBytes.length) {
    throw new Error('EIP-0045 ErgoStatementV1 internal length mismatch');
  }
  return Object.freeze({
    version: EIP0045_ERGO_STATEMENT_V1_VERSION,
    chainDomainIdHex: chainDomainId.toString('hex'),
    profileIdHex: profileId.toString('hex'),
    programIdHex: programId.toString('hex'),
    contractIdHex: contractId.toString('hex'),
    applicationPayload,
    encodedStatementHex: statementBytes.toString('hex'),
    statementDigestHex: blake2b256(statementBytes).toString('hex'),
  });
}

export function decodeEip0045BridgeValidityStatementV1(
  encodedStatement: Buffer | string,
): Eip0045BridgeValidityStatementV1 {
  const statementBytes = variableBytes(
    encodedStatement,
    'encoded EIP-0045 ErgoStatementV1',
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + EIP0045_INITIAL_MAX_APPLICATION_PAYLOAD_BYTES,
  );
  if (statementBytes.length < EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES) {
    throw new Error('encoded EIP-0045 ErgoStatementV1 is truncated');
  }
  const expectedDomain = Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii');
  if (!statementBytes.subarray(0, expectedDomain.length).equals(expectedDomain)) {
    throw new Error('EIP-0045 ErgoStatementV1 domain mismatch');
  }
  if (statementBytes[expectedDomain.length] !== EIP0045_ERGO_STATEMENT_V1_VERSION) {
    throw new Error('unsupported EIP-0045 ErgoStatement version');
  }
  const payloadLength = statementBytes.readUInt32LE(EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET);
  if (payloadLength !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES) {
    throw new Error('EIP-0045 bridge validity application payload length mismatch');
  }
  if (statementBytes.length !== EIP_STATEMENT_PAYLOAD_OFFSET + payloadLength) {
    throw new Error('EIP-0045 ErgoStatementV1 total length mismatch');
  }
  const chainDomainId = statementBytes.subarray(
    EIP_STATEMENT_CHAIN_DOMAIN_OFFSET,
    EIP_STATEMENT_PROFILE_OFFSET,
  );
  const profileId = statementBytes.subarray(
    EIP_STATEMENT_PROFILE_OFFSET,
    EIP_STATEMENT_PROGRAM_OFFSET,
  );
  const programId = statementBytes.subarray(
    EIP_STATEMENT_PROGRAM_OFFSET,
    EIP_STATEMENT_CONTRACT_OFFSET,
  );
  const contractId = statementBytes.subarray(
    EIP_STATEMENT_CONTRACT_OFFSET,
    EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET,
  );
  const applicationPayload = decodeBridgeValidityFinalityPayloadV2(
    statementBytes.subarray(EIP_STATEMENT_PAYLOAD_OFFSET),
  );

  return Object.freeze({
    version: EIP0045_ERGO_STATEMENT_V1_VERSION,
    chainDomainIdHex: chainDomainId.toString('hex'),
    profileIdHex: profileId.toString('hex'),
    programIdHex: programId.toString('hex'),
    contractIdHex: contractId.toString('hex'),
    applicationPayload,
    encodedStatementHex: statementBytes.toString('hex'),
    statementDigestHex: blake2b256(statementBytes).toString('hex'),
  });
}

export function assertEip0045BridgeValidityStatementV1Matches(
  encodedStatement: Buffer | string,
  expected: Eip0045BridgeValidityStatementV1Input,
): Eip0045BridgeValidityStatementV1 {
  const actual = decodeEip0045BridgeValidityStatementV1(encodedStatement);
  const rebuilt = buildEip0045BridgeValidityStatementV1(expected);
  if (actual.encodedStatementHex !== rebuilt.encodedStatementHex) {
    throw new Error('EIP-0045 bridge validity statement expected binding mismatch');
  }
  return actual;
}

function freezePayload(input: {
  trackerNftId: Buffer;
  compatibilityStatementDigest: Buffer;
  compatibilitySemanticProgramId: Buffer;
  compatibilityVerifierProfileId: Buffer;
  compatibilityPayloadDigest: Buffer;
  compatibilityAggregateProofDigest: Buffer;
  nativeVerifierRequestDigest: Buffer;
  checkpoint: BridgeCheckpointV1;
  encodedCheckpoint: Buffer;
  checkpointCommitment: Buffer;
  trustedAnchorDigest: Buffer;
  finalityHorizonHash: Buffer;
  extensionValue: Buffer;
  payloadBytes: Buffer;
  finalityHorizonHeight: bigint;
}): BridgeValidityFinalityPayloadV2 {
  return Object.freeze({
    version: BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_VERSION,
    hashAlgorithmId: BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_HASH_BLAKE2B256,
    sourceProfileId: BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_SOURCE_SUBSTRATE_GRANDPA_V1,
    flags: BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_FLAGS_NONE,
    trackerNftIdHex: input.trackerNftId.toString('hex'),
    compatibilityStatementV1DigestHex: input.compatibilityStatementDigest.toString('hex'),
    compatibilitySemanticProgramIdHex: input.compatibilitySemanticProgramId.toString('hex'),
    compatibilityVerifierProfileIdHex: input.compatibilityVerifierProfileId.toString('hex'),
    compatibilityPayloadDigestHex: input.compatibilityPayloadDigest.toString('hex'),
    compatibilityAggregateProofDigestHex:
      input.compatibilityAggregateProofDigest.toString('hex'),
    nativeVerifierRequestDigestHex: input.nativeVerifierRequestDigest.toString('hex'),
    checkpoint: Object.freeze({ ...input.checkpoint }),
    encodedCheckpointHex: input.encodedCheckpoint.toString('hex'),
    checkpointCommitmentHex: input.checkpointCommitment.toString('hex'),
    trustedAnchorDigestHex: input.trustedAnchorDigest.toString('hex'),
    finalityHorizonHeight: input.finalityHorizonHeight.toString(),
    finalityHorizonHashHex: input.finalityHorizonHash.toString('hex'),
    extensionKeyHex: BRIDGE_EXTENSION_KEY_HEX,
    extensionValueHex: input.extensionValue.toString('hex'),
    encodedPayloadHex: input.payloadBytes.toString('hex'),
    payloadDigestHex: blake2b256(input.payloadBytes).toString('hex'),
  });
}

function assertValidityProfileCheckpoint(checkpoint: BridgeCheckpointV1): void {
  if (checkpoint.burnLeafCount > BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS) {
    throw new Error(
      `bridge validity finality payload V2 burnLeafCount exceeds ${BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_MAX_BURNS}`,
    );
  }
}

function validatePayloadDiscriminators(
  version: number,
  hashAlgorithmId: number,
  sourceProfileId: number,
  flags: number,
): void {
  if (version !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_VERSION) {
    throw new Error(`unsupported bridge validity finality payload version: ${version}`);
  }
  if (hashAlgorithmId !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_HASH_BLAKE2B256) {
    throw new Error(`unsupported bridge validity finality hash algorithm: ${hashAlgorithmId}`);
  }
  if (sourceProfileId !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_SOURCE_SUBSTRATE_GRANDPA_V1) {
    throw new Error(`unsupported bridge validity finality source profile: ${sourceProfileId}`);
  }
  if (flags !== BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_FLAGS_NONE) {
    throw new Error(`unsupported bridge validity finality payload flags: ${flags}`);
  }
}

function exactHexBytes(value: string, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed hex`);
  }
  if (value.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return Buffer.from(value, 'hex');
}

function exactBytes(
  value: Buffer | string,
  expectedBytes: number,
  label: string,
): Buffer {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : exactHexBytes(value, expectedBytes, label);
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return bytes;
}

function variableBytes(
  value: Buffer | string,
  label: string,
  maxBytes: number,
): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    }
    return Buffer.from(value);
  }
  if (typeof value !== 'string' || value.length > maxBytes * 2) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed whole-byte hex`);
  }
  return Buffer.from(value, 'hex');
}

function uint32Le(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must fit uint32`);
  }
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function uint64Be(value: string | number | bigint, label: string): Buffer {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} number input must be a non-negative safe integer`);
  }
  const text = String(value);
  if (!/^\d+$/.test(text) || text.length > 20) {
    throw new Error(`${label} must be a canonical uint64`);
  }
  const parsed = BigInt(text);
  if (parsed > UINT64_MAX) {
    throw new Error(`${label} must fit uint64`);
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(parsed);
  return out;
}

function blake2b256(bytes: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(bytes, undefined, 32));
}
