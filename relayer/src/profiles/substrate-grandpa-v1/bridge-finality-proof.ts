import blakejs from 'blakejs';

import {
  BRIDGE_CHECKPOINT_ENCODED_BYTES,
  decodeBridgeCheckpointV1,
  deriveBridgeCheckpointCommitmentHex,
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import { MAX_NATIVE_VERIFIER_REQUEST_BYTES } from './aggregate-finality-proof-limits.js';

export { MAX_NATIVE_VERIFIER_REQUEST_BYTES };

export const BRIDGE_FINALITY_STATEMENT_VERSION = 1;
export const BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256 = 1;
export const BRIDGE_FINALITY_RULE_GRANDPA_STATE_FINALITY = 1;
export const BRIDGE_FINALITY_STATEMENT_FLAGS_NONE = 0;
export const BRIDGE_FINALITY_STATEMENT_V1_BYTES = 356;
export const BRIDGE_FINALITY_PROGRAM_ID_DOMAIN =
  'E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1';
export const BRIDGE_FINALITY_STATEMENT_V1_DOMAIN =
  'E2S_BRIDGE_FINALITY_STATEMENT_V1';

export const AGGREGATE_FINALITY_PROOF_VERSION = 1;
export const AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA = 1;
export const AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED = 2;
export const AGGREGATE_FINALITY_PROOF_FLAGS_NONE = 0;
export const AGGREGATE_FINALITY_PROOF_V1_HEADER_BYTES = 108;
export const AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES = 464;
export const AGGREGATE_FINALITY_PROOF_V1_DOMAIN =
  'E2S_AGGREGATE_FINALITY_PROOF_V1';
export const NATIVE_GRANDPA_PROOF_PAYLOAD_V1_DOMAIN =
  'E2S_NATIVE_GRANDPA_PROOF_PAYLOAD_V1';

const DIGEST_BYTES = 32;
const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const STATEMENT_CHECKPOINT_OFFSET = 4;
const STATEMENT_COMMITMENT_OFFSET = STATEMENT_CHECKPOINT_OFFSET + BRIDGE_CHECKPOINT_ENCODED_BYTES;
const STATEMENT_TRUSTED_ANCHOR_OFFSET = STATEMENT_COMMITMENT_OFFSET + DIGEST_BYTES;
const STATEMENT_FINALITY_HORIZON_HEIGHT_OFFSET = STATEMENT_TRUSTED_ANCHOR_OFFSET + DIGEST_BYTES;
const STATEMENT_FINALITY_HORIZON_HASH_OFFSET = STATEMENT_FINALITY_HORIZON_HEIGHT_OFFSET + 8;
const STATEMENT_PROGRAM_ID_OFFSET = STATEMENT_FINALITY_HORIZON_HASH_OFFSET + DIGEST_BYTES;
const PROOF_STATEMENT_OFFSET = AGGREGATE_FINALITY_PROOF_V1_HEADER_BYTES;

export interface BridgeFinalityStatementV1Input {
  version?: number;
  hashAlgorithmId?: number;
  finalityRuleId?: number;
  flags?: number;
  encodedCheckpointHex: string;
  checkpointCommitmentHex: string;
  trustedAnchorDigestHex: string;
  finalityHorizonHeight: string | number | bigint;
  finalityHorizonHashHex: string;
}

export interface BridgeFinalityStatementV1 {
  readonly version: 1;
  readonly hashAlgorithmId: 1;
  readonly finalityRuleId: 1;
  readonly flags: 0;
  readonly checkpoint: Readonly<BridgeCheckpointV1>;
  readonly encodedCheckpointHex: string;
  readonly checkpointCommitmentHex: string;
  readonly trustedAnchorDigestHex: string;
  readonly finalityHorizonHeight: string;
  readonly finalityHorizonHashHex: string;
  readonly programIdHex: string;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
}

export interface AggregateFinalityProofV1Input {
  version?: number;
  proofSystemId?: number;
  hashAlgorithmId?: number;
  flags?: number;
  verifierProfileIdHex: string;
  encodedStatement: Buffer | string;
  payload: Buffer | string;
}

export interface AggregateFinalityProofV1 {
  readonly version: 1;
  readonly proofSystemId: 1;
  readonly hashAlgorithmId: 1;
  readonly flags: 0;
  readonly statementLength: 356;
  readonly payloadLength: number;
  readonly verifierProfileIdHex: string;
  readonly statementDigestHex: string;
  readonly payloadDigestHex: string;
  readonly proofDigestHex: string;
  readonly statement: BridgeFinalityStatementV1;
  readonly payloadHex: string;
  readonly encodedProofHex: string;
}

export function deriveBridgeFinalityProgramIdHex(): string {
  return blake2b256(Buffer.from(BRIDGE_FINALITY_PROGRAM_ID_DOMAIN, 'ascii')).toString('hex');
}

export function deriveBridgeFinalityStatementDigestHex(
  encodedStatement: Buffer | string,
): string {
  const statementBytes = normalizeExactBytes(
    encodedStatement,
    BRIDGE_FINALITY_STATEMENT_V1_BYTES,
    'encoded finality statement',
  );
  return blake2b256(Buffer.concat([
    Buffer.from(BRIDGE_FINALITY_STATEMENT_V1_DOMAIN, 'ascii'),
    statementBytes,
  ])).toString('hex');
}

export function deriveNativeGrandpaProofPayloadDigestHex(payload: Buffer | string): string {
  assertNativeProofPayloadInputBound(payload);
  const payloadBytes = normalizeVariableBytes(payload, 'native GRANDPA proof payload');
  return blake2b256(Buffer.concat([
    Buffer.from(NATIVE_GRANDPA_PROOF_PAYLOAD_V1_DOMAIN, 'ascii'),
    payloadBytes,
  ])).toString('hex');
}

export function deriveAggregateFinalityProofDigestHex(
  encodedProof: Buffer | string,
): string {
  assertAggregateProofInputBound(encodedProof);
  const proofBytes = normalizeVariableBytes(encodedProof, 'encoded aggregate finality proof');
  return blake2b256(Buffer.concat([
    Buffer.from(AGGREGATE_FINALITY_PROOF_V1_DOMAIN, 'ascii'),
    proofBytes,
  ])).toString('hex');
}

export function buildBridgeFinalityStatementV1(
  input: BridgeFinalityStatementV1Input,
): BridgeFinalityStatementV1 {
  validateStatementDiscriminators(
    input.version ?? BRIDGE_FINALITY_STATEMENT_VERSION,
    input.hashAlgorithmId ?? BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
    input.finalityRuleId ?? BRIDGE_FINALITY_RULE_GRANDPA_STATE_FINALITY,
    input.flags ?? BRIDGE_FINALITY_STATEMENT_FLAGS_NONE,
  );

  const checkpointBytes = normalizeExactBytes(
    input.encodedCheckpointHex,
    BRIDGE_CHECKPOINT_ENCODED_BYTES,
    'encoded checkpoint',
  );
  const checkpoint = decodeAndFreezeCheckpoint(checkpointBytes);
  const suppliedCommitment = normalizeExactBytes(
    input.checkpointCommitmentHex,
    DIGEST_BYTES,
    'checkpoint commitment',
  );
  assertCheckpointCommitment(checkpointBytes, suppliedCommitment);
  const trustedAnchorDigest = normalizeExactBytes(
    input.trustedAnchorDigestHex,
    DIGEST_BYTES,
    'trustedAnchorDigest',
  );
  const finalityHorizonHeight = normalizeUint64(
    input.finalityHorizonHeight,
    'finalityHorizonHeight',
  );
  const finalityHorizonHash = normalizeExactBytes(
    input.finalityHorizonHashHex,
    DIGEST_BYTES,
    'finalityHorizonHash',
  );
  const programId = Buffer.from(deriveBridgeFinalityProgramIdHex(), 'hex');

  const statementBytes = Buffer.concat([
    Buffer.from([
      BRIDGE_FINALITY_STATEMENT_VERSION,
      BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
      BRIDGE_FINALITY_RULE_GRANDPA_STATE_FINALITY,
      BRIDGE_FINALITY_STATEMENT_FLAGS_NONE,
    ]),
    checkpointBytes,
    suppliedCommitment,
    trustedAnchorDigest,
    uint64Be(finalityHorizonHeight),
    finalityHorizonHash,
    programId,
  ]);

  return freezeStatement({
    checkpoint,
    checkpointBytes,
    checkpointCommitment: suppliedCommitment,
    trustedAnchorDigest,
    finalityHorizonHeight,
    finalityHorizonHash,
    programId,
    statementBytes,
  });
}

export function decodeBridgeFinalityStatementV1(
  encodedStatement: Buffer | string,
): BridgeFinalityStatementV1 {
  const statementBytes = normalizeExactBytes(
    encodedStatement,
    BRIDGE_FINALITY_STATEMENT_V1_BYTES,
    'encoded finality statement',
  );
  validateStatementDiscriminators(
    statementBytes[0],
    statementBytes[1],
    statementBytes[2],
    statementBytes[3],
  );

  const checkpointBytes = statementBytes.subarray(
    STATEMENT_CHECKPOINT_OFFSET,
    STATEMENT_COMMITMENT_OFFSET,
  );
  const checkpoint = decodeAndFreezeCheckpoint(checkpointBytes);
  const checkpointCommitment = statementBytes.subarray(
    STATEMENT_COMMITMENT_OFFSET,
    STATEMENT_TRUSTED_ANCHOR_OFFSET,
  );
  assertCheckpointCommitment(checkpointBytes, checkpointCommitment);
  const trustedAnchorDigest = statementBytes.subarray(
    STATEMENT_TRUSTED_ANCHOR_OFFSET,
    STATEMENT_FINALITY_HORIZON_HEIGHT_OFFSET,
  );
  const finalityHorizonHeight = statementBytes.readBigUInt64BE(
    STATEMENT_FINALITY_HORIZON_HEIGHT_OFFSET,
  );
  const finalityHorizonHash = statementBytes.subarray(
    STATEMENT_FINALITY_HORIZON_HASH_OFFSET,
    STATEMENT_PROGRAM_ID_OFFSET,
  );
  const programId = statementBytes.subarray(STATEMENT_PROGRAM_ID_OFFSET);
  const expectedProgramId = Buffer.from(deriveBridgeFinalityProgramIdHex(), 'hex');
  if (!programId.equals(expectedProgramId)) {
    throw new Error('bridge finality statement program ID mismatch');
  }

  return freezeStatement({
    checkpoint,
    checkpointBytes,
    checkpointCommitment,
    trustedAnchorDigest,
    finalityHorizonHeight,
    finalityHorizonHash,
    programId,
    statementBytes,
  });
}

export function buildAggregateFinalityProofV1(
  input: AggregateFinalityProofV1Input,
): AggregateFinalityProofV1 {
  validateProofDiscriminators(
    input.version ?? AGGREGATE_FINALITY_PROOF_VERSION,
    input.proofSystemId ?? AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
    input.hashAlgorithmId ?? BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
    input.flags ?? AGGREGATE_FINALITY_PROOF_FLAGS_NONE,
  );
  const verifierProfileId = normalizeExactBytes(
    input.verifierProfileIdHex,
    DIGEST_BYTES,
    'verifierProfileId',
  );
  const statementBytes = normalizeExactBytes(
    input.encodedStatement,
    BRIDGE_FINALITY_STATEMENT_V1_BYTES,
    'encoded finality statement',
  );
  const statement = decodeBridgeFinalityStatementV1(statementBytes);
  assertNativeProofPayloadInputBound(input.payload);
  const payloadBytes = normalizeVariableBytes(input.payload, 'native GRANDPA proof payload');
  assertPayloadLength(payloadBytes.length);

  return encodeAndFreezeProof({
    verifierProfileId,
    statement,
    statementBytes,
    payloadBytes,
  });
}

export function decodeAggregateFinalityProofV1(
  encodedProof: Buffer | string,
): AggregateFinalityProofV1 {
  assertAggregateProofInputBound(encodedProof);
  const proofBytes = normalizeVariableBytes(encodedProof, 'encoded aggregate finality proof');
  if (proofBytes.length < AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES) {
    throw new Error(
      `encoded aggregate finality proof must be at least ` +
      `${AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES} bytes`,
    );
  }
  validateProofDiscriminators(proofBytes[0], proofBytes[1], proofBytes[2], proofBytes[3]);

  const statementLength = proofBytes.readUInt32BE(4);
  if (statementLength !== BRIDGE_FINALITY_STATEMENT_V1_BYTES) {
    throw new Error(
      `aggregate finality proof statement length must be ` +
      `${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`,
    );
  }
  const payloadLength = proofBytes.readUInt32BE(8);
  assertPayloadLength(payloadLength);
  const expectedLength = AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES + payloadLength;
  if (proofBytes.length !== expectedLength) {
    throw new Error(
      `aggregate finality proof payload length mismatch: header declares ${payloadLength} bytes, ` +
      `envelope contains ${proofBytes.length - AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES}`,
    );
  }

  const verifierProfileId = proofBytes.subarray(12, 44);
  const suppliedStatementDigest = proofBytes.subarray(44, 76);
  const suppliedPayloadDigest = proofBytes.subarray(76, 108);
  const statementBytes = proofBytes.subarray(
    PROOF_STATEMENT_OFFSET,
    AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES,
  );
  const payloadBytes = proofBytes.subarray(AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES);

  // Validate the nested statement before its outer digest so inner invariant failures stay visible.
  const statement = decodeBridgeFinalityStatementV1(statementBytes);
  const expectedStatementDigest = Buffer.from(
    deriveBridgeFinalityStatementDigestHex(statementBytes),
    'hex',
  );
  if (!suppliedStatementDigest.equals(expectedStatementDigest)) {
    throw new Error('aggregate finality proof statement digest mismatch');
  }
  const expectedPayloadDigest = Buffer.from(
    deriveNativeGrandpaProofPayloadDigestHex(payloadBytes),
    'hex',
  );
  if (!suppliedPayloadDigest.equals(expectedPayloadDigest)) {
    throw new Error('aggregate finality proof payload digest mismatch');
  }

  const decoded = encodeAndFreezeProof({
    verifierProfileId,
    statement,
    statementBytes,
    payloadBytes,
  });
  if (decoded.encodedProofHex !== proofBytes.toString('hex')) {
    throw new Error('aggregate finality proof is not canonically encoded');
  }
  return decoded;
}

function validateStatementDiscriminators(
  version: number,
  hashAlgorithmId: number,
  finalityRuleId: number,
  flags: number,
): void {
  if (version !== BRIDGE_FINALITY_STATEMENT_VERSION) {
    throw new Error(`unsupported bridge finality statement version: ${version}`);
  }
  if (hashAlgorithmId !== BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256) {
    throw new Error(`unsupported bridge finality statement hash algorithm: ${hashAlgorithmId}`);
  }
  if (finalityRuleId !== BRIDGE_FINALITY_RULE_GRANDPA_STATE_FINALITY) {
    throw new Error(`unsupported bridge finality statement finality rule: ${finalityRuleId}`);
  }
  if (flags !== BRIDGE_FINALITY_STATEMENT_FLAGS_NONE) {
    throw new Error(`unsupported bridge finality statement flags: ${flags}`);
  }
}

function validateProofDiscriminators(
  version: number,
  proofSystemId: number,
  hashAlgorithmId: number,
  flags: number,
): void {
  if (version !== AGGREGATE_FINALITY_PROOF_VERSION) {
    throw new Error(`unsupported aggregate finality proof version: ${version}`);
  }
  if (proofSystemId === AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED) {
    throw new Error('aggregate finality proof system 2 is reserved and not activated');
  }
  if (proofSystemId !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA) {
    throw new Error(`unsupported aggregate finality proof system: ${proofSystemId}`);
  }
  if (hashAlgorithmId !== BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256) {
    throw new Error(`unsupported aggregate finality proof hash algorithm: ${hashAlgorithmId}`);
  }
  if (flags !== AGGREGATE_FINALITY_PROOF_FLAGS_NONE) {
    throw new Error(`unsupported aggregate finality proof flags: ${flags}`);
  }
}

function decodeAndFreezeCheckpoint(encodedCheckpoint: Buffer): Readonly<BridgeCheckpointV1> {
  return Object.freeze({ ...decodeBridgeCheckpointV1(Buffer.from(encodedCheckpoint)) });
}

function assertCheckpointCommitment(
  encodedCheckpoint: Buffer,
  suppliedCommitment: Buffer,
): void {
  const recomputed = Buffer.from(deriveBridgeCheckpointCommitmentHex(encodedCheckpoint), 'hex');
  if (!suppliedCommitment.equals(recomputed)) {
    throw new Error('bridge finality statement checkpoint commitment mismatch');
  }
}

function freezeStatement(input: {
  checkpoint: Readonly<BridgeCheckpointV1>;
  checkpointBytes: Buffer;
  checkpointCommitment: Buffer;
  trustedAnchorDigest: Buffer;
  finalityHorizonHeight: bigint;
  finalityHorizonHash: Buffer;
  programId: Buffer;
  statementBytes: Buffer;
}): BridgeFinalityStatementV1 {
  return Object.freeze({
    version: BRIDGE_FINALITY_STATEMENT_VERSION,
    hashAlgorithmId: BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
    finalityRuleId: BRIDGE_FINALITY_RULE_GRANDPA_STATE_FINALITY,
    flags: BRIDGE_FINALITY_STATEMENT_FLAGS_NONE,
    checkpoint: input.checkpoint,
    encodedCheckpointHex: input.checkpointBytes.toString('hex'),
    checkpointCommitmentHex: input.checkpointCommitment.toString('hex'),
    trustedAnchorDigestHex: input.trustedAnchorDigest.toString('hex'),
    finalityHorizonHeight: input.finalityHorizonHeight.toString(),
    finalityHorizonHashHex: input.finalityHorizonHash.toString('hex'),
    programIdHex: input.programId.toString('hex'),
    encodedStatementHex: input.statementBytes.toString('hex'),
    statementDigestHex: deriveBridgeFinalityStatementDigestHex(input.statementBytes),
  });
}

function encodeAndFreezeProof(input: {
  verifierProfileId: Buffer;
  statement: BridgeFinalityStatementV1;
  statementBytes: Buffer;
  payloadBytes: Buffer;
}): AggregateFinalityProofV1 {
  const statementDigest = Buffer.from(
    deriveBridgeFinalityStatementDigestHex(input.statementBytes),
    'hex',
  );
  const payloadDigest = Buffer.from(
    deriveNativeGrandpaProofPayloadDigestHex(input.payloadBytes),
    'hex',
  );
  const header = Buffer.alloc(AGGREGATE_FINALITY_PROOF_V1_HEADER_BYTES);
  header[0] = AGGREGATE_FINALITY_PROOF_VERSION;
  header[1] = AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA;
  header[2] = BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256;
  header[3] = AGGREGATE_FINALITY_PROOF_FLAGS_NONE;
  header.writeUInt32BE(BRIDGE_FINALITY_STATEMENT_V1_BYTES, 4);
  header.writeUInt32BE(input.payloadBytes.length, 8);
  input.verifierProfileId.copy(header, 12);
  statementDigest.copy(header, 44);
  payloadDigest.copy(header, 76);
  const proofBytes = Buffer.concat([header, input.statementBytes, input.payloadBytes]);
  const proofDigestHex = deriveAggregateFinalityProofDigestHex(proofBytes);

  return Object.freeze({
    version: AGGREGATE_FINALITY_PROOF_VERSION,
    proofSystemId: AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
    hashAlgorithmId: BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
    flags: AGGREGATE_FINALITY_PROOF_FLAGS_NONE,
    statementLength: BRIDGE_FINALITY_STATEMENT_V1_BYTES,
    payloadLength: input.payloadBytes.length,
    verifierProfileIdHex: input.verifierProfileId.toString('hex'),
    statementDigestHex: statementDigest.toString('hex'),
    payloadDigestHex: payloadDigest.toString('hex'),
    proofDigestHex,
    statement: input.statement,
    payloadHex: input.payloadBytes.toString('hex'),
    encodedProofHex: proofBytes.toString('hex'),
  });
}

function assertAggregateProofInputBound(value: Buffer | string): void {
  const maxBytes = AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES
    + MAX_NATIVE_VERIFIER_REQUEST_BYTES;
  if (Buffer.isBuffer(value)) {
    if (value.length > maxBytes) {
      throw new Error(`encoded aggregate finality proof exceeds ${maxBytes} bytes`);
    }
    return;
  }
  if (typeof value === 'string' && value.length > maxBytes * 2) {
    throw new Error(`encoded aggregate finality proof exceeds ${maxBytes} bytes`);
  }
}

function assertNativeProofPayloadInputBound(value: Buffer | string): void {
  if (Buffer.isBuffer(value)) {
    if (value.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
      throw new Error(
        `native GRANDPA proof payload exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
      );
    }
    return;
  }
  if (
    typeof value === 'string'
    && value.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES * 2
  ) {
    throw new Error(
      `native GRANDPA proof payload exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
}

function assertPayloadLength(payloadLength: number): void {
  if (!Number.isSafeInteger(payloadLength) || payloadLength < 1 || payloadLength > UINT32_MAX) {
    throw new Error('aggregate finality proof payload length must be a positive uint32');
  }
  if (payloadLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `aggregate finality proof payload exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
}

function normalizeExactBytes(
  value: Buffer | string,
  expectedBytes: number,
  label: string,
): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length !== expectedBytes) {
      throw new Error(`${label} must be ${expectedBytes} bytes, got ${value.length}`);
    }
    return Buffer.from(value);
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a Buffer or hex string`);
  }
  if (value.startsWith('0x')) {
    throw new Error(`${label} must use canonical lowercase hex without a prefix`);
  }
  if (value.length % 2 !== 0) {
    throw new Error(`${label} hex must encode whole bytes`);
  }
  if (value.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${value.length / 2}`);
  }
  if (!/^[0-9a-f]*$/.test(value)) {
    if (/^[0-9a-fA-F]*$/.test(value)) {
      throw new Error(`${label} must use canonical lowercase hex without a prefix`);
    }
    throw new Error(`${label} must be hex`);
  }
  return Buffer.from(value, 'hex');
}

function normalizeVariableBytes(value: Buffer | string, label: string): Buffer {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a Buffer or hex string`);
  }
  if (value.length % 2 !== 0) {
    throw new Error(`${label} hex must encode whole bytes`);
  }
  if (!/^[0-9a-f]*$/.test(value)) {
    if (/^(?:0x)?[0-9a-fA-F]*$/.test(value)) {
      throw new Error(`${label} must use canonical lowercase hex without a prefix`);
    }
    throw new Error(`${label} must be hex`);
  }
  return Buffer.from(value, 'hex');
}

function normalizeUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} number input must be a non-negative safe integer`);
    }
  } else if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`${label} must be a non-negative integer`);
    }
  } else {
    if (typeof value !== 'string') {
      throw new Error(`${label} must be a canonical non-negative integer`);
    }
    if (value.length > 20) {
      throw new Error(`${label} must fit uint64`);
    }
    if (!/^(0|[1-9]\d*)$/.test(value)) {
      throw new Error(`${label} must be a canonical non-negative integer`);
    }
  }
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function uint64Be(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(value);
  return out;
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, DIGEST_BYTES));
}
