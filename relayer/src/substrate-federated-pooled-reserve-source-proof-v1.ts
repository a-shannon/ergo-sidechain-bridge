import { createPublicKey, verify as verifySignature } from 'node:crypto';

import blakejs from 'blakejs';

import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const SUBSTRATE_FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_CONFORMANCE_V1_SCHEMA =
  'e2s.substrate-federated-pooled-reserve-source-proof-reference-conformance.v1' as const;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1 = 1 as const;
export const POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4 = 4 as const;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1 = 1n;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1 = 2 as const;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1 = 64n;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_SIGNERS_V1 = 8 as const;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1 = 540 as const;
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4 = 623 as const;

const PROOF_SYSTEM_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_SYSTEM_V1';
const PROOF_PROFILE_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_PROFILE_V1';
const SOURCE_KEY_SET_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_KEY_SET_V1';
const PROOF_REQUEST_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_REQUEST_V1';
const PROOF_RESULT_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_RESULT_V1';
const PROOF_ATTESTATION_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ATTESTATION_V1';
const PROOF_SIGNATURE_SET_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_SIGNATURE_SET_V1';
const PROOF_ENVELOPE_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ENVELOPE_V1';
const VERIFIER_PROFILE_DOMAIN =
  'E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_RUNTIME_V1';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX =
  Object.freeze([
    '0x2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12',
    '0x22fc297792f0b6ffc0bfcfdb7edb0c0aa14e025a365ec0e342e86e3829cb74b6',
    '0xdb995fe25169d141cab9bbba92baa01f9f2e1ece7df4cb2ac05190f37fcc1f9d',
  ] as const);

export interface FederatedPooledReserveSourceProofProfileV1Input {
  readonly federationEpoch: string | number | bigint;
  readonly threshold: number;
  readonly signerPublicKeysHex: readonly string[];
  readonly maxValidityBlocks: string | number | bigint;
  readonly verifierProfileIdHex: string;
}

export interface FederatedPooledReserveSourceProofProfileV1 {
  readonly formatVersion:
    typeof FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1;
  readonly federationEpoch: string;
  readonly threshold: number;
  readonly signerPublicKeysHex: readonly string[];
  readonly sourceAttestationKeySetDigestHex: string;
  readonly maxValidityBlocks: string;
  readonly verifierProfileIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
}

export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX =
  domainHash(PROOF_SYSTEM_DOMAIN, Buffer.alloc(0));
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX =
  domainHash(VERIFIER_PROFILE_DOMAIN, Buffer.alloc(0));
export const FEDERATED_POOLED_RESERVE_SOURCE_KEY_SET_DIGEST_V1_HEX =
  deriveFederatedPooledReserveSourceKeySetDigestV1Hex();
export const FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX =
  deriveFederatedPooledReserveSourceProofProfileIdV1Hex();

export interface FederatedPooledReserveSourceProofEvidenceV1 {
  readonly sourceLockBoxCanonicalHex: string;
  readonly reserveTransitionTransactionCanonicalHex: string;
  readonly successorReserveBoxCanonicalHex: string;
  readonly inclusionProofCanonicalHex: string;
  readonly checkpointAncestryCanonicalHex: string;
  readonly finalityProofCanonicalHex: string;
  readonly verifierExecutableSha256Hex: string;
}

export interface FederatedPooledReserveSourceProofRequestV1 {
  readonly runtimeProfile: PooledReserveMintReservationRuntimeProfileV4;
  readonly statementHex: string;
  readonly evidence: FederatedPooledReserveSourceProofEvidenceV1;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface FederatedPooledReserveSourceProofResultFieldsV1 {
  readonly formatVersion:
    typeof FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1;
  readonly federationEpoch: string | number | bigint;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly requestDigestHex: string;
  readonly sourceLockBoxCanonicalBlake2b256Hex: string;
  readonly reserveTransitionTransactionCanonicalBlake2b256Hex: string;
  readonly successorReserveBoxCanonicalBlake2b256Hex: string;
  readonly inclusionProofBlake2b256Hex: string;
  readonly checkpointAncestryBlake2b256Hex: string;
  readonly finalityProofBlake2b256Hex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly verifierProfileIdHex: string;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface FederatedPooledReserveSourceProofSignatureV1 {
  readonly signerPublicKeyHex: string;
  readonly signatureHex: string;
}

export interface FederatedPooledReserveSourceProofEnvelopeV1 {
  readonly result: FederatedPooledReserveSourceProofResultFieldsV1;
  readonly signatures: readonly FederatedPooledReserveSourceProofSignatureV1[];
}

export interface FederatedPooledReserveSourceProofSignatureVerificationV1 {
  readonly resultIdHex: string;
  readonly attestationDigestHex: string;
  readonly signatureSetDigestHex: string;
  readonly signatures: readonly FederatedPooledReserveSourceProofSignatureV1[];
}

export interface PooledReserveMintReservationSourceProofEnvelopeV4 {
  readonly formatVersion:
    typeof POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
  readonly proofBytesHex: string;
}

export interface FederatedPooledReserveSourceProofReferenceConformanceV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_CONFORMANCE_V1_SCHEMA;
  readonly status: 'REFERENCE_SOURCE_PROOF_CODEC_AND_SIGNATURE_CONFORMANCE_VERIFIED';
  readonly runtimeProfileIdHex: string;
  readonly statementIdHex: string;
  readonly statementBytesDigestHex: string;
  readonly mintIdentityHex: string;
  readonly proofSystemIdHex:
    typeof FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX;
  readonly proofProfileIdHex:
    typeof FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX;
  readonly sourceAttestationKeySetDigestHex:
    typeof FEDERATED_POOLED_RESERVE_SOURCE_KEY_SET_DIGEST_V1_HEX;
  readonly requestDigestHex: string;
  readonly proofResultIdHex: string;
  readonly proofAttestationDigestHex: string;
  readonly signatureSetDigestHex: string;
  readonly proofDigestHex: string;
  readonly issuedAtNativeHeight: string;
  readonly expiresAtNativeHeight: string;
  readonly validatedAtNativeHeight: string;
  readonly proofBytesScaleHex: string;
  readonly sourceProofEnvelopeScaleHex: string;
  readonly evidence: Readonly<{
    sourceLockBoxCanonicalBlake2b256Hex: string;
    reserveTransitionTransactionCanonicalBlake2b256Hex: string;
    successorReserveBoxCanonicalBlake2b256Hex: string;
    inclusionProofBlake2b256Hex: string;
    checkpointAncestryBlake2b256Hex: string;
    finalityProofBlake2b256Hex: string;
    verifierExecutableSha256Hex: string;
  }>;
  readonly boundary: Readonly<{
    exactRustProfileAndCodecVerified: true;
    exactStatementAndRuntimeProfileBound: true;
    exactThresholdSignatureSetVerified: true;
    publicReferenceSignerSetOnly: true;
    federatedSourceAttestationVerified: false;
    sourceAuthorityEstablished: false;
    runtimeActivationEligible: false;
    authorityConsumerEligible: false;
    sourceCanonicalityIndependentlyVerified: false;
    ergoPowAuthenticated: false;
    trustlessFinalityVerified: false;
    runtimeReservationWritten: false;
    mintExecuted: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    trustlessStatusEstablished: false;
    productionReadinessEstablished: false;
  }>;
}

type NormalizedResult = Readonly<{
  formatVersion: 1;
  federationEpoch: bigint;
  sourceAttestationKeySetDigestHex: string;
  sourceAttestationThreshold: number;
  requestDigestHex: string;
  sourceLockBoxCanonicalBlake2b256Hex: string;
  reserveTransitionTransactionCanonicalBlake2b256Hex: string;
  successorReserveBoxCanonicalBlake2b256Hex: string;
  inclusionProofBlake2b256Hex: string;
  checkpointAncestryBlake2b256Hex: string;
  finalityProofBlake2b256Hex: string;
  verifierExecutableSha256Hex: string;
  verifierProfileIdHex: string;
  issuedAtNativeHeight: bigint;
  expiresAtNativeHeight: bigint;
}>;

type NormalizedProofProfile = Readonly<{
  formatVersion: 1;
  federationEpoch: bigint;
  threshold: number;
  signerPublicKeysHex: readonly string[];
  sourceAttestationKeySetDigestHex: string;
  maxValidityBlocks: bigint;
  verifierProfileIdHex: string;
  proofSystemIdHex: string;
  proofProfileIdHex: string;
}>;

type NormalizedRequest = Readonly<{
  runtimeProfile: Readonly<PooledReserveMintReservationRuntimeProfileV4>;
  runtimeProfileIdHex: string;
  statement: Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  statementHex: string;
  statementIdHex: string;
  statementBytesDigestHex: string;
  evidence: Readonly<FederatedPooledReserveSourceProofEvidenceV1>;
  issuedAtNativeHeight: bigint;
  expiresAtNativeHeight: bigint;
}>;

export function deriveFederatedPooledReserveSourceKeySetDigestV1Hex(): string {
  return deriveFederatedPooledReserveSourceKeySetDigestForKeysV1Hex(
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  );
}

export function deriveFederatedPooledReserveSourceProofProfileIdV1Hex(): string {
  return buildFederatedPooledReserveSourceProofProfileV1(
    referenceSourceProofProfileInput(),
  ).proofProfileIdHex;
}

export function deriveFederatedPooledReserveSourceKeySetDigestForKeysV1Hex(
  signerPublicKeysHex: readonly string[],
): string {
  const keys = normalizeSourceProofSignerKeys(signerPublicKeysHex);
  return domainHash(SOURCE_KEY_SET_DOMAIN, Buffer.concat([
    uint16Be(keys.length),
    ...keys.map(
      value => fixedBytes(value, 32, 'source-attestation public key', true),
    ),
  ]));
}

export function buildFederatedPooledReserveSourceProofProfileV1(
  input: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
): Readonly<FederatedPooledReserveSourceProofProfileV1> {
  const normalized = normalizeProofProfileInput(input);
  return deepFreeze({
    formatVersion: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1,
    federationEpoch: normalized.federationEpoch.toString(),
    threshold: normalized.threshold,
    signerPublicKeysHex: normalized.signerPublicKeysHex,
    sourceAttestationKeySetDigestHex:
      normalized.sourceAttestationKeySetDigestHex,
    maxValidityBlocks: normalized.maxValidityBlocks.toString(),
    verifierProfileIdHex: normalized.verifierProfileIdHex,
    proofSystemIdHex: normalized.proofSystemIdHex,
    proofProfileIdHex: normalized.proofProfileIdHex,
  });
}

export function deriveFederatedPooledReserveSourceProofProfileIdForInputV1Hex(
  input: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
): string {
  return buildFederatedPooledReserveSourceProofProfileV1(input).proofProfileIdHex;
}

function deriveProofProfileIdFromNormalized(
  profile: Readonly<Omit<NormalizedProofProfile, 'proofProfileIdHex'>>,
): string {
  return domainHash(PROOF_PROFILE_DOMAIN, Buffer.concat([
    Buffer.from([FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1]),
    uint64Be(profile.federationEpoch),
    fixedBytes(
      profile.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
      true,
    ),
    uint16Be(profile.threshold),
    uint64Be(profile.maxValidityBlocks),
    fixedBytes(
      profile.verifierProfileIdHex,
      32,
      'source-proof verifier profile ID',
      true,
    ),
  ]));
}

export function deriveFederatedPooledReserveSourceProofRequestDigestV1Hex(
  request: FederatedPooledReserveSourceProofRequestV1,
): string {
  return deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex(
    referenceSourceProofProfileInput(),
    request,
  );
}

export function deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex(
  profile: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
  request: FederatedPooledReserveSourceProofRequestV1,
): string {
  const normalizedProfile = normalizeProofProfileInput(profile);
  return deriveRequestDigestForProfile(
    normalizedProfile,
    normalizeRequestForProfile(normalizedProfile, request),
  );
}

export function buildFederatedPooledReserveSourceProofResultFieldsV1(
  request: FederatedPooledReserveSourceProofRequestV1,
): Readonly<FederatedPooledReserveSourceProofResultFieldsV1> {
  return buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
    referenceSourceProofProfileInput(),
    request,
  );
}

export function buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
  profile: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
  request: FederatedPooledReserveSourceProofRequestV1,
): Readonly<FederatedPooledReserveSourceProofResultFieldsV1> {
  const normalizedProfile = normalizeProofProfileInput(profile);
  const normalized = normalizeRequestForProfile(normalizedProfile, request);
  return deepFreeze({
    formatVersion: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1,
    federationEpoch: normalizedProfile.federationEpoch.toString(),
    sourceAttestationKeySetDigestHex:
      normalizedProfile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: normalizedProfile.threshold,
    requestDigestHex: deriveRequestDigestForProfile(
      normalizedProfile,
      normalized,
    ),
    sourceLockBoxCanonicalBlake2b256Hex:
      blake2b256Hex(normalized.evidence.sourceLockBoxCanonicalHex),
    reserveTransitionTransactionCanonicalBlake2b256Hex:
      blake2b256Hex(
        normalized.evidence.reserveTransitionTransactionCanonicalHex,
      ),
    successorReserveBoxCanonicalBlake2b256Hex:
      blake2b256Hex(normalized.evidence.successorReserveBoxCanonicalHex),
    inclusionProofBlake2b256Hex:
      blake2b256Hex(normalized.evidence.inclusionProofCanonicalHex),
    checkpointAncestryBlake2b256Hex:
      blake2b256Hex(normalized.evidence.checkpointAncestryCanonicalHex),
    finalityProofBlake2b256Hex:
      blake2b256Hex(normalized.evidence.finalityProofCanonicalHex),
    verifierExecutableSha256Hex:
      normalized.evidence.verifierExecutableSha256Hex,
    verifierProfileIdHex: normalizedProfile.verifierProfileIdHex,
    issuedAtNativeHeight: normalized.issuedAtNativeHeight.toString(),
    expiresAtNativeHeight: normalized.expiresAtNativeHeight.toString(),
  });
}

export function deriveFederatedPooledReserveSourceProofResultIdV1Hex(
  result: FederatedPooledReserveSourceProofResultFieldsV1,
): string {
  const normalized = normalizeResult(result);
  return domainHash(PROOF_RESULT_DOMAIN, encodeResultHashBody(normalized));
}

export function deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
  profile: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
  request: FederatedPooledReserveSourceProofRequestV1,
  result: FederatedPooledReserveSourceProofResultFieldsV1,
): string {
  const normalizedProfile = normalizeProofProfileInput(profile);
  const normalized = normalizeResultForProfileAndRequest(
    normalizedProfile,
    normalizeRequestForProfile(normalizedProfile, request),
    result,
  );
  return domainHash(PROOF_RESULT_DOMAIN, encodeResultHashBody(normalized));
}

export function deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
  resultIdHex: string,
): string {
  return domainHash(
    PROOF_ATTESTATION_DOMAIN,
    fixedBytes(resultIdHex, 32, 'source-proof result ID', true),
  );
}

export function verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
  profile: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
  request: FederatedPooledReserveSourceProofRequestV1,
  result: FederatedPooledReserveSourceProofResultFieldsV1,
  signatures: readonly FederatedPooledReserveSourceProofSignatureV1[],
): Readonly<FederatedPooledReserveSourceProofSignatureVerificationV1> {
  const normalizedProfile = normalizeProofProfileInput(profile);
  const normalizedResult = normalizeResultForProfileAndRequest(
    normalizedProfile,
    normalizeRequestForProfile(normalizedProfile, request),
    result,
  );
  const normalizedSignatures = normalizeSignaturesForProfile(
    normalizedProfile,
    signatures,
  );
  const resultIdHex = domainHash(
    PROOF_RESULT_DOMAIN,
    encodeResultHashBody(normalizedResult),
  );
  const attestationDigestHex =
    deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(resultIdHex);
  verifySignatures(normalizedSignatures, attestationDigestHex);
  return deepFreeze({
    resultIdHex,
    attestationDigestHex,
    signatureSetDigestHex: domainHash(
      PROOF_SIGNATURE_SET_DOMAIN,
      Buffer.concat(normalizedSignatures.flatMap(signature => [
        fixedBytes(
          signature.signerPublicKeyHex,
          32,
          'signature public key',
          true,
        ),
        fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
      ])),
    ),
    signatures: normalizedSignatures,
  });
}

export function encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
  envelope: FederatedPooledReserveSourceProofEnvelopeV1,
): string {
  const normalized = normalizeInnerEnvelope(envelope);
  const bytes = Buffer.concat([
    encodeResultScale(normalized.result),
    encodeScaleCompactLength(normalized.signatures.length),
    ...normalized.signatures.flatMap(signature => [
      fixedBytes(signature.signerPublicKeyHex, 32, 'signature public key', true),
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    ]),
  ]);
  if (bytes.length !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1) {
    throw new Error('federated pooled-reserve source-proof inner SCALE length drifted');
  }
  return hex(bytes);
}

export function decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
  value: string,
): Readonly<FederatedPooledReserveSourceProofEnvelopeV1> {
  const bytes = fixedBytes(
    value,
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1,
    'federated pooled-reserve source-proof inner SCALE envelope',
  );
  let offset = 0;
  const result = normalizeResult({
    formatVersion: bytes[offset++] as 1,
    federationEpoch: bytes.readBigUInt64LE(offset),
    sourceAttestationKeySetDigestHex: sliceHex(bytes, offset += 8, offset += 32),
    sourceAttestationThreshold: bytes.readUInt16LE(offset),
    requestDigestHex: sliceHex(bytes, offset += 2, offset += 32),
    sourceLockBoxCanonicalBlake2b256Hex: sliceHex(bytes, offset, offset += 32),
    reserveTransitionTransactionCanonicalBlake2b256Hex:
      sliceHex(bytes, offset, offset += 32),
    successorReserveBoxCanonicalBlake2b256Hex:
      sliceHex(bytes, offset, offset += 32),
    inclusionProofBlake2b256Hex: sliceHex(bytes, offset, offset += 32),
    checkpointAncestryBlake2b256Hex: sliceHex(bytes, offset, offset += 32),
    finalityProofBlake2b256Hex: sliceHex(bytes, offset, offset += 32),
    verifierExecutableSha256Hex: sliceHex(bytes, offset, offset += 32),
    verifierProfileIdHex: sliceHex(bytes, offset, offset += 32),
    issuedAtNativeHeight: bytes.readBigUInt64LE(offset),
    expiresAtNativeHeight: bytes.readBigUInt64LE(offset += 8),
  });
  offset += 8;
  const signatureCount = decodeSingleByteScaleCompactLength(bytes[offset++]);
  if (signatureCount !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1) {
    throw new Error('federated pooled-reserve proof has a non-threshold signature count');
  }
  const signatures: FederatedPooledReserveSourceProofSignatureV1[] = [];
  for (let index = 0; index < signatureCount; index += 1) {
    signatures.push({
      signerPublicKeyHex: sliceHex(bytes, offset, offset += 32),
      signatureHex: sliceHex(bytes, offset, offset += 64),
    });
  }
  if (offset !== bytes.length) {
    throw new Error('federated pooled-reserve source-proof bytes contain trailing data');
  }
  const decoded = deepFreeze({ result, signatures });
  if (encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(decoded) !== value) {
    throw new Error('federated pooled-reserve source-proof inner SCALE is not canonical');
  }
  return decoded;
}

export function encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
  envelope: PooledReserveMintReservationSourceProofEnvelopeV4,
): string {
  const normalized = normalizeOuterEnvelope(envelope);
  const proofBytes = fixedBytes(
    normalized.proofBytesHex,
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1,
    'federated pooled-reserve proof bytes',
  );
  const bytes = Buffer.concat([
    Buffer.from([normalized.formatVersion]),
    fixedBytes(normalized.proofSystemIdHex, 32, 'source-proof system ID', true),
    fixedBytes(normalized.proofProfileIdHex, 32, 'source-proof profile ID', true),
    uint64Le(normalized.issuedAtNativeHeight),
    uint64Le(normalized.expiresAtNativeHeight),
    encodeScaleCompactLength(proofBytes.length),
    proofBytes,
  ]);
  if (bytes.length !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4) {
    throw new Error('federated pooled-reserve source-proof outer SCALE length drifted');
  }
  return hex(bytes);
}

export function decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
  value: string,
): Readonly<PooledReserveMintReservationSourceProofEnvelopeV4> {
  const bytes = fixedBytes(
    value,
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4,
    'pooled-reserve mint-reservation source-proof V4 SCALE envelope',
  );
  const compact = decodeTwoByteScaleCompactLength(bytes, 81);
  if (
    compact.length !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1
    || compact.bytes !== 2
  ) {
    throw new Error('pooled-reserve source-proof byte length is not canonical');
  }
  const decoded = normalizeOuterEnvelope({
    formatVersion: bytes[0] as 4,
    proofSystemIdHex: sliceHex(bytes, 1, 33),
    proofProfileIdHex: sliceHex(bytes, 33, 65),
    issuedAtNativeHeight: bytes.readBigUInt64LE(65),
    expiresAtNativeHeight: bytes.readBigUInt64LE(73),
    proofBytesHex: sliceHex(bytes, 83, bytes.length),
  });
  decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(decoded.proofBytesHex);
  if (encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(decoded) !== value) {
    throw new Error('pooled-reserve source-proof V4 SCALE envelope is not canonical');
  }
  return decoded;
}

export function verifyFederatedPooledReserveSourceProofReferenceConformanceV1(input: {
  readonly request: FederatedPooledReserveSourceProofRequestV1;
  readonly sourceProofEnvelopeScaleHex: string;
  readonly currentNativeHeight: string | number | bigint;
}): Readonly<FederatedPooledReserveSourceProofReferenceConformanceV1> {
  const record = exactRecord(
    input,
    ['currentNativeHeight', 'request', 'sourceProofEnvelopeScaleHex'],
    'federated pooled-reserve source-proof validation input',
  );
  const request = normalizeRequest(
    record.request as FederatedPooledReserveSourceProofRequestV1,
  );
  const currentNativeHeight = uint64(
    record.currentNativeHeight,
    'current native height',
  );
  const outer = decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
    fixedBytesHex(
      record.sourceProofEnvelopeScaleHex,
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4,
      'pooled-reserve source-proof outer SCALE envelope',
    ),
  );
  if (
    outer.proofSystemIdHex !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX
    || outer.proofProfileIdHex !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX
    || outer.issuedAtNativeHeight.toString() !== request.issuedAtNativeHeight.toString()
    || outer.expiresAtNativeHeight.toString() !== request.expiresAtNativeHeight.toString()
  ) {
    throw new Error('federated pooled-reserve outer proof does not bind the exact request');
  }
  const inner = decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
    outer.proofBytesHex,
  );
  const result = normalizeResult(inner.result);
  const expected = normalizeResult(
    buildFederatedPooledReserveSourceProofResultFieldsV1(input.request),
  );
  for (const field of [
    'formatVersion',
    'federationEpoch',
    'sourceAttestationKeySetDigestHex',
    'sourceAttestationThreshold',
    'requestDigestHex',
    'sourceLockBoxCanonicalBlake2b256Hex',
    'reserveTransitionTransactionCanonicalBlake2b256Hex',
    'successorReserveBoxCanonicalBlake2b256Hex',
    'inclusionProofBlake2b256Hex',
    'checkpointAncestryBlake2b256Hex',
    'finalityProofBlake2b256Hex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
    'issuedAtNativeHeight',
    'expiresAtNativeHeight',
  ] as const) {
    if (result[field] !== expected[field]) {
      throw new Error(
        `federated pooled-reserve source-proof ${field} differs from the exact request`,
      );
    }
  }
  validateWindow(request, currentNativeHeight);
  const proofResultIdHex =
    deriveFederatedPooledReserveSourceProofResultIdV1Hex(inner.result);
  const proofAttestationDigestHex =
    deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
      proofResultIdHex,
    );
  const signatures = normalizeSignatures(inner.signatures);
  verifySignatures(signatures, proofAttestationDigestHex);
  const signatureSetDigestHex = domainHash(
    PROOF_SIGNATURE_SET_DOMAIN,
    Buffer.concat(signatures.flatMap(signature => [
      fixedBytes(signature.signerPublicKeyHex, 32, 'signature public key', true),
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    ])),
  );
  const proofDigestHex = domainHash(
    PROOF_ENVELOPE_DOMAIN,
    Buffer.concat([
      fixedBytes(proofResultIdHex, 32, 'source-proof result ID', true),
      fixedBytes(signatureSetDigestHex, 32, 'signature-set digest', true),
    ]),
  );
  const validated = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_CONFORMANCE_V1_SCHEMA,
    status:
      'REFERENCE_SOURCE_PROOF_CODEC_AND_SIGNATURE_CONFORMANCE_VERIFIED' as const,
    runtimeProfileIdHex: request.runtimeProfileIdHex,
    statementIdHex: request.statementIdHex,
    statementBytesDigestHex: request.statementBytesDigestHex,
    mintIdentityHex: request.statement.mintIdentityHex,
    proofSystemIdHex: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    sourceAttestationKeySetDigestHex:
      FEDERATED_POOLED_RESERVE_SOURCE_KEY_SET_DIGEST_V1_HEX,
    requestDigestHex: result.requestDigestHex,
    proofResultIdHex,
    proofAttestationDigestHex,
    signatureSetDigestHex,
    proofDigestHex,
    issuedAtNativeHeight: result.issuedAtNativeHeight.toString(),
    expiresAtNativeHeight: result.expiresAtNativeHeight.toString(),
    validatedAtNativeHeight: currentNativeHeight.toString(),
    proofBytesScaleHex: outer.proofBytesHex,
    sourceProofEnvelopeScaleHex:
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(outer),
    evidence: {
      sourceLockBoxCanonicalBlake2b256Hex:
        result.sourceLockBoxCanonicalBlake2b256Hex,
      reserveTransitionTransactionCanonicalBlake2b256Hex:
        result.reserveTransitionTransactionCanonicalBlake2b256Hex,
      successorReserveBoxCanonicalBlake2b256Hex:
        result.successorReserveBoxCanonicalBlake2b256Hex,
      inclusionProofBlake2b256Hex: result.inclusionProofBlake2b256Hex,
      checkpointAncestryBlake2b256Hex:
        result.checkpointAncestryBlake2b256Hex,
      finalityProofBlake2b256Hex: result.finalityProofBlake2b256Hex,
      verifierExecutableSha256Hex: result.verifierExecutableSha256Hex,
    },
    boundary: {
      exactRustProfileAndCodecVerified: true as const,
      exactStatementAndRuntimeProfileBound: true as const,
      exactThresholdSignatureSetVerified: true as const,
      publicReferenceSignerSetOnly: true as const,
      federatedSourceAttestationVerified: false as const,
      sourceAuthorityEstablished: false as const,
      runtimeActivationEligible: false as const,
      authorityConsumerEligible: false as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      ergoPowAuthenticated: false as const,
      trustlessFinalityVerified: false as const,
      runtimeReservationWritten: false as const,
      mintExecuted: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  return validated;
}

function normalizeRequest(
  value: FederatedPooledReserveSourceProofRequestV1,
): NormalizedRequest {
  return normalizeRequestForProfile(
    normalizeProofProfileInput(referenceSourceProofProfileInput()),
    value,
  );
}

function normalizeRequestForProfile(
  profile: NormalizedProofProfile,
  value: FederatedPooledReserveSourceProofRequestV1,
): NormalizedRequest {
  const request = exactRecord(
    value,
    [
      'evidence',
      'expiresAtNativeHeight',
      'issuedAtNativeHeight',
      'runtimeProfile',
      'statementHex',
    ],
    'federated pooled-reserve source-proof request',
  );
  const runtimeProfileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      request.runtimeProfile as PooledReserveMintReservationRuntimeProfileV4,
    );
  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      runtimeProfileScaleHex,
    );
  if (
    runtimeProfile.sourceProofSystemIdHex
      !== profile.proofSystemIdHex
    || runtimeProfile.sourceProofProfileIdHex
      !== profile.proofProfileIdHex
  ) {
    const referenceProfileIdHex =
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX;
    throw new Error(profile.proofProfileIdHex === referenceProfileIdHex
      ? 'runtime profile does not select the static federated pooled-reserve proof family'
      : 'runtime profile does not select the exact federated pooled-reserve proof profile');
  }
  const statementHex = fixedBytesHex(
    request.statementHex,
    603,
    'pooled-reserve mint-reservation statement V4',
  );
  const statement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statementHex,
    );
  if (
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(statement)
    !== statementHex
  ) {
    throw new Error('pooled-reserve mint-reservation statement V4 is not canonical');
  }
  assertStatementMatchesRuntimeProfile(statement, runtimeProfile);
  const evidenceRecord = exactRecord(
    request.evidence,
    [
      'checkpointAncestryCanonicalHex',
      'finalityProofCanonicalHex',
      'inclusionProofCanonicalHex',
      'reserveTransitionTransactionCanonicalHex',
      'sourceLockBoxCanonicalHex',
      'successorReserveBoxCanonicalHex',
      'verifierExecutableSha256Hex',
    ],
    'federated pooled-reserve source-proof evidence',
  );
  const evidence = deepFreeze({
    sourceLockBoxCanonicalHex: canonicalBytes(
      evidenceRecord.sourceLockBoxCanonicalHex,
      'canonical source-lock box',
    ),
    reserveTransitionTransactionCanonicalHex: canonicalBytes(
      evidenceRecord.reserveTransitionTransactionCanonicalHex,
      'canonical reserve-transition transaction',
    ),
    successorReserveBoxCanonicalHex: canonicalBytes(
      evidenceRecord.successorReserveBoxCanonicalHex,
      'canonical successor-reserve box',
    ),
    inclusionProofCanonicalHex: canonicalBytes(
      evidenceRecord.inclusionProofCanonicalHex,
      'canonical inclusion proof',
    ),
    checkpointAncestryCanonicalHex: canonicalBytes(
      evidenceRecord.checkpointAncestryCanonicalHex,
      'canonical checkpoint ancestry',
    ),
    finalityProofCanonicalHex: canonicalBytes(
      evidenceRecord.finalityProofCanonicalHex,
      'canonical finality proof',
    ),
    verifierExecutableSha256Hex: fixedBytesHex(
      evidenceRecord.verifierExecutableSha256Hex,
      32,
      'verifier executable SHA-256',
      true,
    ),
  });
  return deepFreeze({
    runtimeProfile,
    runtimeProfileIdHex:
      derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile),
    statement,
    statementHex,
    statementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    statementBytesDigestHex: blake2b256Hex(statementHex),
    evidence,
    issuedAtNativeHeight: uint64(
      request.issuedAtNativeHeight,
      'source-proof issue height',
    ),
    expiresAtNativeHeight: uint64(
      request.expiresAtNativeHeight,
      'source-proof expiry height',
    ),
  });
}

function assertStatementMatchesRuntimeProfile(
  statement: ValidityApplicationPooledReserveMintReservationStatementV4,
  runtimeProfile: PooledReserveMintReservationRuntimeProfileV4,
): void {
  const sourceIntent = decodePegInSourceIntentV2Hex(statement.sourceIntentHex);
  for (const [actual, expected, label] of [
    [statement.lineageProfileIdHex, runtimeProfile.lineageProfileIdHex, 'lineage profile'],
    [sourceIntent.sourceNetworkIdHex, runtimeProfile.sourceNetworkIdHex, 'source network'],
    [sourceIntent.sidechainIdHex, runtimeProfile.sidechainIdHex, 'sidechain'],
    [sourceIntent.bridgeAddressHex, runtimeProfile.bridgeAddressHex, 'bridge address'],
    [sourceIntent.tokenAddressHex, runtimeProfile.tokenAddressHex, 'token address'],
    [sourceIntent.settlementProfileIdHex, runtimeProfile.settlementProfileIdHex, 'settlement profile'],
    [
      statement.ergoDepositFinalityPolicyIdHex,
      runtimeProfile.ergoDepositFinalityPolicyIdHex,
      'Ergo deposit finality policy',
    ],
  ] as const) {
    if (actual !== expected) {
      throw new Error(
        `pooled-reserve mint-reservation statement does not match runtime ${label}`,
      );
    }
  }
}

function referenceSourceProofProfileInput(): Readonly<
  FederatedPooledReserveSourceProofProfileV1Input
> {
  return Object.freeze({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    threshold: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
    signerPublicKeysHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
    maxValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    verifierProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  });
}

function normalizeProofProfileInput(
  value: Readonly<FederatedPooledReserveSourceProofProfileV1Input>,
): NormalizedProofProfile {
  const profile = exactRecord(
    value,
    [
      'federationEpoch',
      'maxValidityBlocks',
      'signerPublicKeysHex',
      'threshold',
      'verifierProfileIdHex',
    ],
    'federated pooled-reserve source-proof profile',
  );
  const federationEpoch = uint64(profile.federationEpoch, 'federation epoch');
  const maxValidityBlocks = uint64(
    profile.maxValidityBlocks,
    'source-proof maximum validity blocks',
  );
  const signerPublicKeysHex = normalizeSourceProofSignerKeys(
    profile.signerPublicKeysHex as readonly string[],
  );
  if (
    federationEpoch === 0n
    || maxValidityBlocks === 0n
    || maxValidityBlocks > 1_024n
    || !Number.isSafeInteger(profile.threshold)
    || (profile.threshold as number) < 2
    || (profile.threshold as number) > signerPublicKeysHex.length
  ) {
    throw new Error('federated pooled-reserve source-proof profile is invalid');
  }
  const sourceAttestationKeySetDigestHex =
    deriveFederatedPooledReserveSourceKeySetDigestForKeysV1Hex(
      signerPublicKeysHex,
    );
  const base = {
    formatVersion: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1,
    federationEpoch,
    threshold: profile.threshold as number,
    signerPublicKeysHex,
    sourceAttestationKeySetDigestHex,
    maxValidityBlocks,
    verifierProfileIdHex: fixedBytesHex(
      profile.verifierProfileIdHex,
      32,
      'source-proof verifier profile ID',
      true,
    ),
    proofSystemIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  } as const;
  return deepFreeze({
    ...base,
    proofProfileIdHex: deriveProofProfileIdFromNormalized(base),
  });
}

function normalizeSourceProofSignerKeys(
  values: readonly string[],
): readonly string[] {
  if (
    !Array.isArray(values)
    || values.length < 2
    || values.length > FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_SIGNERS_V1
  ) {
    throw new Error('federated pooled-reserve source-proof key set is invalid');
  }
  const normalized = values.map((value, index) => fixedBytesHex(
    value,
    32,
    `source-attestation public key ${index}`,
    true,
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]! >= normalized[index]!) {
      throw new Error(
        'federated pooled-reserve source-proof keys are not canonical',
      );
    }
  }
  return deepFreeze(normalized);
}

function normalizeResult(
  value: FederatedPooledReserveSourceProofResultFieldsV1,
): NormalizedResult {
  return normalizeResultForProfile(
    normalizeProofProfileInput(referenceSourceProofProfileInput()),
    value,
  );
}

function normalizeResultForProfile(
  profile: NormalizedProofProfile,
  value: FederatedPooledReserveSourceProofResultFieldsV1,
): NormalizedResult {
  const result = exactRecord(
    value,
    [
      'checkpointAncestryBlake2b256Hex',
      'expiresAtNativeHeight',
      'federationEpoch',
      'finalityProofBlake2b256Hex',
      'formatVersion',
      'inclusionProofBlake2b256Hex',
      'issuedAtNativeHeight',
      'requestDigestHex',
      'reserveTransitionTransactionCanonicalBlake2b256Hex',
      'sourceAttestationKeySetDigestHex',
      'sourceAttestationThreshold',
      'sourceLockBoxCanonicalBlake2b256Hex',
      'successorReserveBoxCanonicalBlake2b256Hex',
      'verifierExecutableSha256Hex',
      'verifierProfileIdHex',
    ],
    'federated pooled-reserve source-proof result',
  );
  if (
    result.formatVersion
      !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1
    || uint64(result.federationEpoch, 'federation epoch')
      !== profile.federationEpoch
    || result.sourceAttestationThreshold
      !== profile.threshold
  ) {
    throw new Error('federated pooled-reserve source-proof result profile is invalid');
  }
  const normalized = {
    formatVersion: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FORMAT_VERSION_V1,
    federationEpoch: profile.federationEpoch,
    sourceAttestationKeySetDigestHex: fixedBytesHex(
      result.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
      true,
    ),
    sourceAttestationThreshold: profile.threshold,
    requestDigestHex: fixedBytesHex(
      result.requestDigestHex,
      32,
      'source-proof request digest',
      true,
    ),
    sourceLockBoxCanonicalBlake2b256Hex: fixedBytesHex(
      result.sourceLockBoxCanonicalBlake2b256Hex,
      32,
      'source-lock box digest',
      true,
    ),
    reserveTransitionTransactionCanonicalBlake2b256Hex: fixedBytesHex(
      result.reserveTransitionTransactionCanonicalBlake2b256Hex,
      32,
      'reserve-transition transaction digest',
      true,
    ),
    successorReserveBoxCanonicalBlake2b256Hex: fixedBytesHex(
      result.successorReserveBoxCanonicalBlake2b256Hex,
      32,
      'successor-reserve box digest',
      true,
    ),
    inclusionProofBlake2b256Hex: fixedBytesHex(
      result.inclusionProofBlake2b256Hex,
      32,
      'inclusion-proof digest',
      true,
    ),
    checkpointAncestryBlake2b256Hex: fixedBytesHex(
      result.checkpointAncestryBlake2b256Hex,
      32,
      'checkpoint-ancestry digest',
      true,
    ),
    finalityProofBlake2b256Hex: fixedBytesHex(
      result.finalityProofBlake2b256Hex,
      32,
      'finality-proof digest',
      true,
    ),
    verifierExecutableSha256Hex: fixedBytesHex(
      result.verifierExecutableSha256Hex,
      32,
      'verifier executable SHA-256',
      true,
    ),
    verifierProfileIdHex: fixedBytesHex(
      result.verifierProfileIdHex,
      32,
      'verifier profile ID',
      true,
    ),
    issuedAtNativeHeight: uint64(
      result.issuedAtNativeHeight,
      'source-proof issue height',
    ),
    expiresAtNativeHeight: uint64(
      result.expiresAtNativeHeight,
      'source-proof expiry height',
    ),
  } as const;
  if (
    normalized.sourceAttestationKeySetDigestHex
      !== profile.sourceAttestationKeySetDigestHex
    || normalized.verifierProfileIdHex
      !== profile.verifierProfileIdHex
  ) {
    throw new Error('federated pooled-reserve source-proof result is not static-profile bound');
  }
  return deepFreeze(normalized);
}

function normalizeResultForProfileAndRequest(
  profile: NormalizedProofProfile,
  request: NormalizedRequest,
  value: FederatedPooledReserveSourceProofResultFieldsV1,
): NormalizedResult {
  const result = normalizeResultForProfile(profile, value);
  if (
    result.requestDigestHex
      !== deriveRequestDigestForProfile(profile, request)
  ) {
    throw new Error(
      'federated pooled-reserve source-proof result differs from the exact profile-bound request',
    );
  }
  return result;
}

function normalizeInnerEnvelope(
  value: FederatedPooledReserveSourceProofEnvelopeV1,
): Readonly<{
  result: NormalizedResult;
  signatures: readonly FederatedPooledReserveSourceProofSignatureV1[];
}> {
  const envelope = exactRecord(
    value,
    ['result', 'signatures'],
    'federated pooled-reserve source-proof inner envelope',
  );
  return deepFreeze({
    result: normalizeResult(
      envelope.result as FederatedPooledReserveSourceProofResultFieldsV1,
    ),
    signatures: normalizeSignatures(
      envelope.signatures as readonly FederatedPooledReserveSourceProofSignatureV1[],
    ),
  });
}

function normalizeOuterEnvelope(
  value: PooledReserveMintReservationSourceProofEnvelopeV4,
): Readonly<{
  formatVersion: 4;
  proofSystemIdHex: string;
  proofProfileIdHex: string;
  issuedAtNativeHeight: bigint;
  expiresAtNativeHeight: bigint;
  proofBytesHex: string;
}> {
  const envelope = exactRecord(
    value,
    [
      'expiresAtNativeHeight',
      'formatVersion',
      'issuedAtNativeHeight',
      'proofBytesHex',
      'proofProfileIdHex',
      'proofSystemIdHex',
    ],
    'pooled-reserve mint-reservation source-proof V4 envelope',
  );
  if (
    envelope.formatVersion
      !== POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4
  ) {
    throw new Error('pooled-reserve mint-reservation source-proof version is unsupported');
  }
  return deepFreeze({
    formatVersion:
      POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
    proofSystemIdHex: fixedBytesHex(
      envelope.proofSystemIdHex,
      32,
      'source-proof system ID',
      true,
    ),
    proofProfileIdHex: fixedBytesHex(
      envelope.proofProfileIdHex,
      32,
      'source-proof profile ID',
      true,
    ),
    issuedAtNativeHeight: uint64(
      envelope.issuedAtNativeHeight,
      'source-proof issue height',
    ),
    expiresAtNativeHeight: uint64(
      envelope.expiresAtNativeHeight,
      'source-proof expiry height',
    ),
    proofBytesHex: fixedBytesHex(
      envelope.proofBytesHex,
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1,
      'federated pooled-reserve proof bytes',
    ),
  });
}

function normalizeSignatures(
  values: readonly FederatedPooledReserveSourceProofSignatureV1[],
): readonly FederatedPooledReserveSourceProofSignatureV1[] {
  return normalizeSignaturesForProfile(
    normalizeProofProfileInput(referenceSourceProofProfileInput()),
    values,
  );
}

function normalizeSignaturesForProfile(
  profile: NormalizedProofProfile,
  values: readonly FederatedPooledReserveSourceProofSignatureV1[],
): readonly FederatedPooledReserveSourceProofSignatureV1[] {
  if (
    !Array.isArray(values)
    || values.length !== profile.threshold
  ) {
    throw new Error(
      'federated pooled-reserve proof must contain the exact threshold signature set',
    );
  }
  const normalized = values.map((value, index) => {
    const signature = exactRecord(
      value,
      ['signatureHex', 'signerPublicKeyHex'],
      `federated pooled-reserve source-proof signature ${index}`,
    );
    return deepFreeze({
      signerPublicKeyHex: fixedBytesHex(
        signature.signerPublicKeyHex,
        32,
        'signature public key',
        true,
      ),
      signatureHex: fixedBytesHex(
        signature.signatureHex,
        64,
        'Ed25519 signature',
      ),
    });
  });
  for (const [index, signature] of normalized.entries()) {
    if (
      !profile.signerPublicKeysHex.some(
        key => key === signature.signerPublicKeyHex,
      )
    ) {
      throw new Error('federated pooled-reserve signature key is not registered');
    }
    if (
      index > 0
      && normalized[index - 1]!.signerPublicKeyHex >= signature.signerPublicKeyHex
    ) {
      throw new Error('federated pooled-reserve signatures are not in canonical order');
    }
  }
  return deepFreeze(normalized);
}

function verifySignatures(
  signatures: readonly FederatedPooledReserveSourceProofSignatureV1[],
  attestationDigestHex: string,
): void {
  const message = fixedBytes(
    attestationDigestHex,
    32,
    'source-proof attestation digest',
    true,
  );
  for (const signature of signatures) {
    const rawPublicKey = fixedBytes(
      signature.signerPublicKeyHex,
      32,
      'signature public key',
      true,
    );
    let publicKey;
    try {
      publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
        format: 'der',
        type: 'spki',
      });
    } catch (error) {
      throw new Error('federated pooled-reserve public key is invalid', {
        cause: error,
      });
    }
    if (!verifySignature(
      null,
      message,
      publicKey,
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    )) {
      throw new Error('federated pooled-reserve source-proof signature is invalid');
    }
  }
}

function deriveRequestDigest(request: NormalizedRequest): string {
  return deriveRequestDigestForProfile(
    normalizeProofProfileInput(referenceSourceProofProfileInput()),
    request,
  );
}

function deriveRequestDigestForProfile(
  profile: NormalizedProofProfile,
  request: NormalizedRequest,
): string {
  return blake2b256Hex(Buffer.concat([
    Buffer.from(PROOF_REQUEST_DOMAIN, 'ascii'),
    fixedBytes(request.runtimeProfileIdHex, 32, 'runtime profile ID', true),
    fixedBytes(request.statementIdHex, 32, 'reservation statement ID', true),
    fixedBytes(
      request.statementBytesDigestHex,
      32,
      'reservation statement bytes digest',
      true,
    ),
    fixedBytes(
      profile.proofSystemIdHex,
      32,
      'source-proof system ID',
      true,
    ),
    fixedBytes(
      profile.proofProfileIdHex,
      32,
      'source-proof profile ID',
      true,
    ),
    uint64Be(profile.federationEpoch),
    fixedBytes(
      profile.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
      true,
    ),
    uint16Be(profile.threshold),
    uint64Be(request.issuedAtNativeHeight),
    uint64Be(request.expiresAtNativeHeight),
  ]));
}

function encodeResultHashBody(result: NormalizedResult): Buffer {
  return Buffer.concat([
    Buffer.from([result.formatVersion]),
    uint64Be(result.federationEpoch),
    fixedBytes(
      result.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
      true,
    ),
    uint16Be(result.sourceAttestationThreshold),
    ...resultHashes(result),
    uint64Be(result.issuedAtNativeHeight),
    uint64Be(result.expiresAtNativeHeight),
  ]);
}

function encodeResultScale(result: NormalizedResult): Buffer {
  return Buffer.concat([
    Buffer.from([result.formatVersion]),
    uint64Le(result.federationEpoch),
    fixedBytes(
      result.sourceAttestationKeySetDigestHex,
      32,
      'source-attestation key-set digest',
      true,
    ),
    uint16Le(result.sourceAttestationThreshold),
    ...resultHashes(result),
    uint64Le(result.issuedAtNativeHeight),
    uint64Le(result.expiresAtNativeHeight),
  ]);
}

function resultHashes(result: NormalizedResult): Buffer[] {
  return [
    result.requestDigestHex,
    result.sourceLockBoxCanonicalBlake2b256Hex,
    result.reserveTransitionTransactionCanonicalBlake2b256Hex,
    result.successorReserveBoxCanonicalBlake2b256Hex,
    result.inclusionProofBlake2b256Hex,
    result.checkpointAncestryBlake2b256Hex,
    result.finalityProofBlake2b256Hex,
    result.verifierExecutableSha256Hex,
    result.verifierProfileIdHex,
  ].map(value => fixedBytes(value, 32, 'source-proof result hash', true));
}

function validateWindow(
  request: NormalizedRequest,
  currentNativeHeight: bigint,
): void {
  const activationHeight = uint64(
    request.runtimeProfile.activationHeight,
    'runtime activation height',
  );
  const runtimeMaxValidityBlocks = BigInt(request.runtimeProfile.maxPendingBlocks);
  const lifetime = request.expiresAtNativeHeight - request.issuedAtNativeHeight;
  if (
    request.expiresAtNativeHeight < request.issuedAtNativeHeight
    || request.issuedAtNativeHeight < activationHeight
    || request.issuedAtNativeHeight > currentNativeHeight
    || currentNativeHeight >= request.expiresAtNativeHeight
    || lifetime <= 0n
    || lifetime > FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1
    || lifetime > runtimeMaxValidityBlocks
  ) {
    throw new Error(
      'federated pooled-reserve source proof is stale or outside its bounded window',
    );
  }
}

function exactRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...expectedFields].sort();
  if (
    actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expectedFields.join(', ')}`);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
  return value as Record<string, unknown>;
}

function canonicalBytes(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase 0x-prefixed bytes`);
  }
  return value;
}

function fixedBytesHex(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): string {
  return hex(fixedBytes(value, bytes, label, nonZero));
}

function fixedBytes(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): Buffer {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be lowercase 0x-prefixed ${bytes}-byte data`);
  }
  const result = Buffer.from(value.slice(2), 'hex');
  if (nonZero && result.every(byte => byte === 0)) {
    throw new Error(`${label} must not be zero`);
  }
  return result;
}

function uint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value as string | number);
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (parsed < 0n || parsed > UINT64_MAX) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || BigInt(value) !== parsed)) {
    throw new Error(`${label} must be an exact unsigned 64-bit integer`);
  }
  return parsed;
}

function uint16Be(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function uint16Le(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function uint64Be(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function uint64Le(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function encodeScaleCompactLength(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value >= 1 << 14) {
    throw new Error('SCALE compact length is outside the supported two-byte range');
  }
  if (value < 64) return Buffer.from([value << 2]);
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE((value << 2) | 1);
  return bytes;
}

function decodeSingleByteScaleCompactLength(value: number): number {
  if ((value & 0x03) !== 0) {
    throw new Error('SCALE compact signature count is not canonical');
  }
  return value >>> 2;
}

function decodeTwoByteScaleCompactLength(
  bytes: Buffer,
  offset: number,
): Readonly<{ length: number; bytes: 2 }> {
  const encoded = bytes.readUInt16LE(offset);
  if ((encoded & 0x03) !== 1) {
    throw new Error('SCALE compact proof length is not a two-byte encoding');
  }
  const length = encoded >>> 2;
  if (length < 64) {
    throw new Error('SCALE compact proof length is not minimally encoded');
  }
  return { length, bytes: 2 };
}

function domainHash(domain: string, bytes: Buffer): string {
  return blake2b256Hex(Buffer.concat([Buffer.from(domain, 'ascii'), bytes]));
}

function blake2b256Hex(value: string | Uint8Array): string {
  const bytes = typeof value === 'string'
    ? Buffer.from(canonicalBytes(value, 'Blake2b input').slice(2), 'hex')
    : Buffer.from(value);
  return hex(Buffer.from(blakejs.blake2b(bytes, undefined, 32)));
}

function sliceHex(bytes: Buffer, start: number, end: number): string {
  return hex(bytes.subarray(start, end));
}

function hex(value: Buffer): string {
  return `0x${value.toString('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
