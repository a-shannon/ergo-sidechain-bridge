import blakejs from 'blakejs';

import {
  AGGREGATE_FINALITY_PROOF_FLAGS_NONE,
  AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED,
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES,
  AGGREGATE_FINALITY_PROOF_VERSION,
  BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
  BRIDGE_FINALITY_STATEMENT_V1_BYTES,
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  decodeAggregateFinalityProofV1,
  decodeBridgeFinalityStatementV1,
  deriveBridgeFinalityStatementDigestHex,
  type AggregateFinalityProofV1,
  type BridgeFinalityStatementV1,
} from './bridge-finality-proof.js';

export const AGGREGATE_FINALITY_COMMITMENT_V1_BYTES = 496;
export const AGGREGATE_FINALITY_COMMITMENT_V1_DOMAIN =
  'E2S_AGGREGATE_FINALITY_COMMITMENT_V1';

const DIGEST_BYTES = 32;
const STATEMENT_OFFSET = 108;
const PROOF_DIGEST_OFFSET = AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES;

export interface AggregateFinalityCommitmentTrustBoundaryV1 {
  readonly kind: 'proof-identity-commitment-only';
  readonly statementValidated: true;
  readonly payloadAvailable: false;
  readonly payloadDigestVerifiedFromCommitment: false;
  readonly fullProofDigestVerifiedFromCommitment: false;
  readonly proofValidityEstablished: false;
  readonly trustlessVerificationEstablished: false;
  readonly onChainVerificationEstablished: false;
}

export interface AggregateFinalityCommitmentV1 {
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
  readonly encodedCommitmentHex: string;
  readonly commitmentDigestHex: string;
  readonly trustBoundary: AggregateFinalityCommitmentTrustBoundaryV1;
}

export type AggregateFinalityCommitmentV1ProofInput =
  | AggregateFinalityProofV1
  | Buffer
  | string;

export const AGGREGATE_FINALITY_COMMITMENT_V1_TRUST_BOUNDARY = Object.freeze({
  kind: 'proof-identity-commitment-only',
  statementValidated: true,
  payloadAvailable: false,
  payloadDigestVerifiedFromCommitment: false,
  fullProofDigestVerifiedFromCommitment: false,
  proofValidityEstablished: false,
  trustlessVerificationEstablished: false,
  onChainVerificationEstablished: false,
} as const satisfies AggregateFinalityCommitmentTrustBoundaryV1);

export function buildAggregateFinalityCommitmentV1(
  input: AggregateFinalityCommitmentV1ProofInput,
): AggregateFinalityCommitmentV1 {
  const proof = decodeCanonicalProof(input);
  const proofBytes = Buffer.from(proof.encodedProofHex, 'hex');
  const commitmentBytes = Buffer.concat([
    proofBytes.subarray(0, AGGREGATE_FINALITY_PROOF_V1_FIXED_PREFIX_BYTES),
    Buffer.from(proof.proofDigestHex, 'hex'),
  ]);
  return decodeAggregateFinalityCommitmentV1(commitmentBytes);
}

export function decodeAggregateFinalityCommitmentV1(
  encodedCommitment: Buffer | string,
): AggregateFinalityCommitmentV1 {
  const commitmentBytes = normalizeExactBytes(
    encodedCommitment,
    AGGREGATE_FINALITY_COMMITMENT_V1_BYTES,
    'encoded aggregate finality commitment',
  );
  validateDiscriminators(
    commitmentBytes[0],
    commitmentBytes[1],
    commitmentBytes[2],
    commitmentBytes[3],
  );

  const statementLength = commitmentBytes.readUInt32BE(4);
  if (statementLength !== BRIDGE_FINALITY_STATEMENT_V1_BYTES) {
    throw new Error(
      `aggregate finality commitment statement length must be ` +
      `${BRIDGE_FINALITY_STATEMENT_V1_BYTES} bytes`,
    );
  }
  const payloadLength = commitmentBytes.readUInt32BE(8);
  assertPayloadLength(payloadLength);

  const verifierProfileId = commitmentBytes.subarray(12, 44);
  const suppliedStatementDigest = commitmentBytes.subarray(44, 76);
  const payloadDigest = commitmentBytes.subarray(76, STATEMENT_OFFSET);
  const statementBytes = commitmentBytes.subarray(STATEMENT_OFFSET, PROOF_DIGEST_OFFSET);
  const proofDigest = commitmentBytes.subarray(PROOF_DIGEST_OFFSET);

  const statement = decodeBridgeFinalityStatementV1(statementBytes);
  const expectedStatementDigest = Buffer.from(
    deriveBridgeFinalityStatementDigestHex(statementBytes),
    'hex',
  );
  if (!suppliedStatementDigest.equals(expectedStatementDigest)) {
    throw new Error('aggregate finality commitment statement digest mismatch');
  }

  return Object.freeze({
    version: AGGREGATE_FINALITY_PROOF_VERSION,
    proofSystemId: AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
    hashAlgorithmId: BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256,
    flags: AGGREGATE_FINALITY_PROOF_FLAGS_NONE,
    statementLength: BRIDGE_FINALITY_STATEMENT_V1_BYTES,
    payloadLength,
    verifierProfileIdHex: verifierProfileId.toString('hex'),
    statementDigestHex: suppliedStatementDigest.toString('hex'),
    payloadDigestHex: payloadDigest.toString('hex'),
    proofDigestHex: proofDigest.toString('hex'),
    statement,
    encodedCommitmentHex: commitmentBytes.toString('hex'),
    commitmentDigestHex: digestCommitmentBytes(commitmentBytes).toString('hex'),
    trustBoundary: AGGREGATE_FINALITY_COMMITMENT_V1_TRUST_BOUNDARY,
  });
}

export function deriveAggregateFinalityCommitmentDigestHex(
  encodedCommitment: Buffer | string,
): string {
  return decodeAggregateFinalityCommitmentV1(encodedCommitment).commitmentDigestHex;
}

function decodeCanonicalProof(
  input: AggregateFinalityCommitmentV1ProofInput,
): AggregateFinalityProofV1 {
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    return decodeAggregateFinalityProofV1(input);
  }
  if (!input || typeof input.encodedProofHex !== 'string') {
    throw new Error('aggregate finality commitment requires a canonical V1 proof');
  }
  return decodeAggregateFinalityProofV1(input.encodedProofHex);
}

function validateDiscriminators(
  version: number,
  proofSystemId: number,
  hashAlgorithmId: number,
  flags: number,
): void {
  if (version !== AGGREGATE_FINALITY_PROOF_VERSION) {
    throw new Error(`unsupported aggregate finality commitment version: ${version}`);
  }
  if (proofSystemId === AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED) {
    throw new Error('aggregate finality commitment proof system 2 is reserved and not activated');
  }
  if (proofSystemId !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA) {
    throw new Error(`unsupported aggregate finality commitment proof system: ${proofSystemId}`);
  }
  if (hashAlgorithmId !== BRIDGE_FINALITY_HASH_ALGORITHM_BLAKE2B256) {
    throw new Error(`unsupported aggregate finality commitment hash algorithm: ${hashAlgorithmId}`);
  }
  if (flags !== AGGREGATE_FINALITY_PROOF_FLAGS_NONE) {
    throw new Error(`unsupported aggregate finality commitment flags: ${flags}`);
  }
}

function assertPayloadLength(payloadLength: number): void {
  if (payloadLength < 1) {
    throw new Error('aggregate finality commitment payload length must be a positive uint32');
  }
  if (payloadLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `aggregate finality commitment payload exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
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

function digestCommitmentBytes(commitmentBytes: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(Buffer.concat([
    Buffer.from(AGGREGATE_FINALITY_COMMITMENT_V1_DOMAIN, 'ascii'),
    commitmentBytes,
  ]), undefined, DIGEST_BYTES));
}
