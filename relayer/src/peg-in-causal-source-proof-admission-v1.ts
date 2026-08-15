import { createPublicKey, verify as verifySignature } from 'node:crypto';

import blakejs from 'blakejs';

import {
  assertPegInCausalAdmissionV2Bindings,
  blake2b256Hex,
  derivePegInCausalAdmissionProfileIdV2Hex,
  derivePegInCausalAdmissionIdV2Hex,
  encodePegInCausalAdmissionStatementV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInCausalAdmissionProfileV2,
  type PegInCausalAdmissionStatementV2,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';

export const PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA =
  'e2s.peg-in-causal-source-proof-admission.v1' as const;
export const PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_V1_SCHEMA =
  'e2s.peg-in-causal-source-proof-profile.v1' as const;

export const PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX =
  '0x36c06f93b9cf9a7f80c59f5bfb8b7790c7f355933cd001fffccc9110f9f95069' as const;
export const PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX =
  '0x25b6e4d9beac8863882fc8f8c43ced66f2d087b3fba128112014b3fb8fd22ff6' as const;
export const PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX =
  '0xe1c2db0d496efae61a16d7791456ae44c3927b3b8d0d9f029d8a9fe100e215ea' as const;
export const PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX =
  '0x65ca4632abc4db51255e42e83a9aee8a72b19d41921d45824ce847cd696e9537' as const;

export const PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX = deepFreeze([
  '0x2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12',
  '0x22fc297792f0b6ffc0bfcfdb7edb0c0aa14e025a365ec0e342e86e3829cb74b6',
  '0xdb995fe25169d141cab9bbba92baa01f9f2e1ece7df4cb2ac05190f37fcc1f9d',
] as const);

export const PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1 = 2 as const;
export const PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1 = 10 as const;
export const PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1 = 64n;
export const MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES = 64 * 1024;
export const MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES = 4 * 1024;

const SOURCE_PROOF_SYSTEM_DOMAIN = 'E2S_PEG_IN_ERGO_FEDERATED_SOURCE_PROOF_V1';
const SOURCE_PROOF_PROFILE_DOMAIN = 'E2S_PEG_IN_ERGO_FEDERATED_SOURCE_PROOF_PROFILE_V1';
const SOURCE_PROOF_REQUEST_DOMAIN = 'E2S_PEG_IN_ERGO_SOURCE_PROOF_REQUEST_V1';
const SOURCE_PROOF_RESULT_DOMAIN = 'E2S_PEG_IN_ERGO_SOURCE_PROOF_RESULT_V1';
const SOURCE_PROOF_ATTESTATION_DOMAIN = 'E2S_PEG_IN_ERGO_SOURCE_PROOF_ATTESTATION_V1';
const SOURCE_PROOF_SIGNATURE_SET_DOMAIN = 'E2S_PEG_IN_ERGO_SOURCE_PROOF_SIGNATURE_SET_V1';
const SOURCE_PROOF_ENVELOPE_DOMAIN = 'E2S_PEG_IN_ERGO_SOURCE_PROOF_ENVELOPE_V1';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SOURCE_PROOF_RESULTS = new WeakSet<object>();

export type PegInCausalSourceProofHoldReasonV1 =
  | 'stale_source_state'
  | 'source_reorg'
  | 'conflicting_source_evidence';

export interface PegInCausalSourceProofProfileV1 {
  readonly schema: typeof PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_V1_SCHEMA;
  readonly formatVersion: 1;
  readonly profileKind: 'federated-compatibility-v1';
  readonly proofSystemIdHex: typeof PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX;
  readonly proofProfileIdHex: typeof PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX;
  readonly threshold: typeof PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1;
  readonly signerPublicKeysHex: typeof PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX;
  readonly maxValidityBlocks: '64';
  readonly finalityPolicyIdHex: typeof PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX;
  readonly requiredConfirmations: typeof PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1;
  readonly verifierProfileIdHex: typeof PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX;
  readonly validityOrStarkFamilyAllowed: false;
}

export interface PegInCausalSourceProofRegistryV1 {
  readonly schema: typeof PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA;
  readonly profiles: readonly [PegInCausalSourceProofProfileV1];
  readonly boundary: Readonly<{
    sourceOwnedStaticRegistry: true;
    runtimeRegistrationAllowed: false;
    activeProofProfileCount: 1;
    compatibilityProfileExplicitlyFederated: true;
    validityOrStarkProfileReinterpretationAllowed: false;
  }>;
}

export interface PegInCausalSourceProofRequestV1 {
  readonly schema: typeof PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA;
  readonly candidateIdHex: string;
  readonly admissionProfile: PegInCausalAdmissionProfileV2;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly statement: PegInCausalAdmissionStatementV2;
  readonly sourceBoxCanonicalHex: string;
  readonly commitmentTransactionCanonicalHex: string;
  readonly vaultSuccessorCanonicalHex: string;
  readonly inclusionProofCanonicalHex: string;
  readonly checkpointAncestryCanonicalHex: string;
  readonly finalityProofCanonicalHex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly sourceConsumption: Readonly<{
    consumedSourceBoxIdHex: string;
    consumingTransactionIdHex: string;
    vaultOutputIndex: number;
    vaultBoxIdHex: string;
    commitmentInclusionBlockIdHex: string;
    commitmentInclusionHeight: string | number | bigint;
    acceptanceCheckpointBlockIdHex: string;
    acceptanceCheckpointHeight: string | number | bigint;
    finalityPolicyIdHex: string;
  }>;
}

export interface PegInCausalSourceProofResultFieldsV1 {
  readonly formatVersion: 1;
  readonly requestDigestHex: string;
  readonly sourceBoxCanonicalBlake2b256Hex: string;
  readonly commitmentTransactionCanonicalBlake2b256Hex: string;
  readonly vaultSuccessorCanonicalBlake2b256Hex: string;
  readonly inclusionProofBlake2b256Hex: string;
  readonly checkpointAncestryBlake2b256Hex: string;
  readonly finalityProofBlake2b256Hex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly verifierProfileIdHex: string;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface PegInCausalSourceProofSignatureV1 {
  readonly signerPublicKeyHex: string;
  readonly signatureHex: string;
}

export interface PegInCausalSourceProofEnvelopeV1 {
  readonly result: PegInCausalSourceProofResultFieldsV1;
  readonly signatures: readonly PegInCausalSourceProofSignatureV1[];
}

export interface PegInCausalSourceProofResultV1 {
  readonly schema: typeof PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA;
  readonly status: 'FEDERATED_SOURCE_PROOF_ENVELOPE_VERIFIED';
  readonly candidateIdHex: string;
  readonly admissionIdHex: string;
  readonly proofSystemIdHex: typeof PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX;
  readonly proofProfileIdHex: typeof PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX;
  readonly requestDigestHex: string;
  readonly sourceProofResultIdHex: string;
  readonly sourceProofAttestationDigestHex: string;
  readonly signatureSetDigestHex: string;
  readonly sourceProofDigestHex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly verifierProfileIdHex: typeof PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX;
  readonly issuedAtNativeHeight: string;
  readonly expiresAtNativeHeight: string;
  readonly validatedAtNativeHeight: string;
  readonly envelopeScaleHex: string;
  readonly evidence: Readonly<{
    sourceBoxCanonicalBlake2b256Hex: string;
    commitmentTransactionCanonicalBlake2b256Hex: string;
    vaultSuccessorCanonicalBlake2b256Hex: string;
    inclusionProofBlake2b256Hex: string;
    checkpointAncestryBlake2b256Hex: string;
    finalityProofBlake2b256Hex: string;
  }>;
  readonly boundary: Readonly<{
    processProvenanceVerified: true;
    exactRustProfileAndCodecVerified: true;
    exactThresholdSignatureSetVerified: true;
    federatedSourceProofAttestationVerified: true;
    sourceProofExecutionAuthenticated: false;
    sourceCanonicalityVerified: false;
    trustlessFinalityVerified: false;
    runtimePendingAdmissionWritten: false;
    lifecycleAdmissionAdvanced: false;
    mintAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  }>;
}

export type PegInCausalSourceProofAdmissionOutcomeV1 =
  | Readonly<{ status: 'reproof_candidate'; result: PegInCausalSourceProofResultV1 }>
  | Readonly<{ status: 'reproof_held'; reasons: readonly PegInCausalSourceProofHoldReasonV1[] }>;

const STATIC_PROFILE = deepFreeze({
  schema: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_V1_SCHEMA,
  formatVersion: 1 as const,
  profileKind: 'federated-compatibility-v1' as const,
  proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  threshold: PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1,
  signerPublicKeysHex: PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
  maxValidityBlocks: '64' as const,
  finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
  requiredConfirmations: PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
  verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
  validityOrStarkFamilyAllowed: false as const,
});

const STATIC_REGISTRY = deepFreeze({
  schema: PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
  profiles: [STATIC_PROFILE] as const,
  boundary: {
    sourceOwnedStaticRegistry: true as const,
    runtimeRegistrationAllowed: false as const,
    activeProofProfileCount: 1 as const,
    compatibilityProfileExplicitlyFederated: true as const,
    validityOrStarkProfileReinterpretationAllowed: false as const,
  },
});

if (deriveStaticProfileIdHex() !== PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX) {
  throw new Error('static causal source-proof profile identity differs from the Rust runtime');
}
if (domainHash(SOURCE_PROOF_SYSTEM_DOMAIN, Buffer.alloc(0))
  !== PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX) {
  throw new Error('static causal source-proof system identity differs from the Rust runtime');
}

export function createPegInCausalSourceProofRegistryV1(): PegInCausalSourceProofRegistryV1 {
  return STATIC_REGISTRY;
}

export function derivePegInCausalSourceProofProfileV1DigestHex(
  profile: PegInCausalSourceProofProfileV1,
): string {
  assertStaticProfile(profile);
  return deriveStaticProfileIdHex();
}

export function derivePegInCausalSourceProofRequestV1DigestHex(
  request: PegInCausalSourceProofRequestV1,
): string {
  const normalized = normalizePegInCausalSourceProofRequestV1(request);
  return deriveRequestDigest(normalized);
}

export function buildPegInCausalSourceProofResultFieldsV1(input: {
  readonly request: PegInCausalSourceProofRequestV1;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}): PegInCausalSourceProofResultFieldsV1 {
  const request = normalizePegInCausalSourceProofRequestV1(input.request);
  return deepFreeze({
    formatVersion: 1 as const,
    requestDigestHex: deriveRequestDigest(request),
    sourceBoxCanonicalBlake2b256Hex: blake2b256Hex(request.sourceBoxCanonicalHex),
    commitmentTransactionCanonicalBlake2b256Hex: blake2b256Hex(
      request.commitmentTransactionCanonicalHex,
    ),
    vaultSuccessorCanonicalBlake2b256Hex: blake2b256Hex(request.vaultSuccessorCanonicalHex),
    inclusionProofBlake2b256Hex: blake2b256Hex(request.inclusionProofCanonicalHex),
    checkpointAncestryBlake2b256Hex: blake2b256Hex(
      request.checkpointAncestryCanonicalHex,
    ),
    finalityProofBlake2b256Hex: blake2b256Hex(request.finalityProofCanonicalHex),
    verifierExecutableSha256Hex: request.verifierExecutableSha256Hex,
    verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
    issuedAtNativeHeight: uint64(input.issuedAtNativeHeight, 'source-proof issue height').toString(),
    expiresAtNativeHeight: uint64(input.expiresAtNativeHeight, 'source-proof expiry height')
      .toString(),
  });
}

export function derivePegInCausalSourceProofResultIdV1Hex(
  result: PegInCausalSourceProofResultFieldsV1,
): string {
  return domainHash(SOURCE_PROOF_RESULT_DOMAIN, encodeResultHashBody(normalizeResult(result)));
}

export function derivePegInCausalSourceProofAttestationDigestV1Hex(
  resultIdHex: string,
): string {
  return domainHash(SOURCE_PROOF_ATTESTATION_DOMAIN, fixedBytes(resultIdHex, 32, 'result ID', true));
}

export function encodePegInCausalSourceProofEnvelopeScaleV1Hex(
  envelope: PegInCausalSourceProofEnvelopeV1,
): string {
  const normalizedEnvelope = normalizePegInCausalSourceProofEnvelopeV1(envelope);
  const result = normalizeResult(normalizedEnvelope.result);
  const signatures = normalizeSignatures(normalizedEnvelope.signatures);
  return hex(Buffer.concat([
    encodeResultScale(result),
    Buffer.from([signatures.length << 2]),
    ...signatures.flatMap(signature => [
      fixedBytes(signature.signerPublicKeyHex, 32, 'signature public key', true),
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    ]),
  ]));
}

export function validatePegInCausalSourceProofEnvelopeV1(input: {
  readonly request: PegInCausalSourceProofRequestV1;
  readonly envelope: PegInCausalSourceProofEnvelopeV1;
  readonly currentNativeHeight: string | number | bigint;
}): PegInCausalSourceProofResultV1 {
  const request = normalizePegInCausalSourceProofRequestV1(input.request);
  const envelope = normalizePegInCausalSourceProofEnvelopeV1(input.envelope);
  const result = normalizeResult(envelope.result);
  const signatures = normalizeSignatures(envelope.signatures);
  const currentNativeHeight = uint64(input.currentNativeHeight, 'current native height');
  const expected = buildPegInCausalSourceProofResultFieldsV1({
    request,
    issuedAtNativeHeight: result.issuedAtNativeHeight,
    expiresAtNativeHeight: result.expiresAtNativeHeight,
  });
  for (const field of [
    'requestDigestHex',
    'sourceBoxCanonicalBlake2b256Hex',
    'commitmentTransactionCanonicalBlake2b256Hex',
    'vaultSuccessorCanonicalBlake2b256Hex',
    'inclusionProofBlake2b256Hex',
    'checkpointAncestryBlake2b256Hex',
    'finalityProofBlake2b256Hex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ] as const) {
    if (result[field] !== expected[field]) {
      throw new Error(`federated source-proof result ${field} differs from the exact request`);
    }
  }
  validateWindow(result, currentNativeHeight);

  const sourceProofResultIdHex = derivePegInCausalSourceProofResultIdV1Hex(result);
  const sourceProofAttestationDigestHex =
    derivePegInCausalSourceProofAttestationDigestV1Hex(sourceProofResultIdHex);
  verifySignatures(signatures, sourceProofAttestationDigestHex);
  const signatureSetDigestHex = domainHash(
    SOURCE_PROOF_SIGNATURE_SET_DOMAIN,
    Buffer.concat(signatures.flatMap(signature => [
      fixedBytes(signature.signerPublicKeyHex, 32, 'signature public key', true),
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    ])),
  );
  const sourceProofDigestHex = domainHash(
    SOURCE_PROOF_ENVELOPE_DOMAIN,
    Buffer.concat([
      fixedBytes(sourceProofResultIdHex, 32, 'result ID', true),
      fixedBytes(signatureSetDigestHex, 32, 'signature-set digest', true),
    ]),
  );
  const envelopeScaleHex = encodePegInCausalSourceProofEnvelopeScaleV1Hex({
    result,
    signatures,
  });
  if (fixedBytes(envelopeScaleHex, 498, 'source-proof SCALE envelope').length !== 498) {
    throw new Error('federated source-proof SCALE envelope has an unexpected length');
  }

  const validated = deepFreeze({
    schema: PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
    status: 'FEDERATED_SOURCE_PROOF_ENVELOPE_VERIFIED' as const,
    candidateIdHex: request.candidateIdHex,
    admissionIdHex: request.candidateIdHex,
    proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    requestDigestHex: result.requestDigestHex,
    sourceProofResultIdHex,
    sourceProofAttestationDigestHex,
    signatureSetDigestHex,
    sourceProofDigestHex,
    verifierExecutableSha256Hex: result.verifierExecutableSha256Hex,
    verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
    issuedAtNativeHeight: result.issuedAtNativeHeight.toString(),
    expiresAtNativeHeight: result.expiresAtNativeHeight.toString(),
    validatedAtNativeHeight: currentNativeHeight.toString(),
    envelopeScaleHex,
    evidence: {
      sourceBoxCanonicalBlake2b256Hex: result.sourceBoxCanonicalBlake2b256Hex,
      commitmentTransactionCanonicalBlake2b256Hex:
        result.commitmentTransactionCanonicalBlake2b256Hex,
      vaultSuccessorCanonicalBlake2b256Hex: result.vaultSuccessorCanonicalBlake2b256Hex,
      inclusionProofBlake2b256Hex: result.inclusionProofBlake2b256Hex,
      checkpointAncestryBlake2b256Hex: result.checkpointAncestryBlake2b256Hex,
      finalityProofBlake2b256Hex: result.finalityProofBlake2b256Hex,
    },
    boundary: {
      processProvenanceVerified: true as const,
      exactRustProfileAndCodecVerified: true as const,
      exactThresholdSignatureSetVerified: true as const,
      federatedSourceProofAttestationVerified: true as const,
      sourceProofExecutionAuthenticated: false as const,
      sourceCanonicalityVerified: false as const,
      trustlessFinalityVerified: false as const,
      runtimePendingAdmissionWritten: false as const,
      lifecycleAdmissionAdvanced: false as const,
      mintAuthorized: false as const,
      reconciliationHoldReleaseAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      gate5Closed: false as const,
      productionReadinessVerified: false as const,
    },
  });
  SOURCE_PROOF_RESULTS.add(validated);
  return validated;
}

export function evaluatePegInCausalSourceProofAdmissionV1(input: {
  readonly request: PegInCausalSourceProofRequestV1;
  readonly envelope?: PegInCausalSourceProofEnvelopeV1;
  readonly currentNativeHeight?: string | number | bigint;
  readonly sourceObservation: 'fresh' | 'stale' | 'reorg' | 'conflicting';
}): PegInCausalSourceProofAdmissionOutcomeV1 {
  const holds = {
    stale: 'stale_source_state',
    reorg: 'source_reorg',
    conflicting: 'conflicting_source_evidence',
  } as const;
  if (input.sourceObservation !== 'fresh') {
    return deepFreeze({ status: 'reproof_held' as const, reasons: [holds[input.sourceObservation]] });
  }
  if (input.envelope === undefined || input.currentNativeHeight === undefined) {
    throw new Error('fresh source-proof admission requires an exact signed envelope and height');
  }
  return deepFreeze({
    status: 'reproof_candidate' as const,
    result: validatePegInCausalSourceProofEnvelopeV1({
      request: input.request,
      envelope: input.envelope,
      currentNativeHeight: input.currentNativeHeight,
    }),
  });
}

export function assertPegInCausalSourceProofResultV1Provenance(
  value: unknown,
): asserts value is PegInCausalSourceProofResultV1 {
  if (!value || typeof value !== 'object' || !SOURCE_PROOF_RESULTS.has(value)) {
    throw new Error('peg-in causal source-proof result process provenance is missing');
  }
}

export function assertPegInCausalSourceProofReproofContinuityV1(input: {
  readonly previous: PegInCausalSourceProofResultV1;
  readonly next: PegInCausalSourceProofResultV1;
}): void {
  assertPegInCausalSourceProofResultV1Provenance(input.previous);
  assertPegInCausalSourceProofResultV1Provenance(input.next);
  for (const field of [
    'candidateIdHex',
    'admissionIdHex',
    'proofSystemIdHex',
    'proofProfileIdHex',
    'requestDigestHex',
    'sourceProofResultIdHex',
    'sourceProofDigestHex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
    'envelopeScaleHex',
  ] as const) {
    if (input.previous[field] !== input.next[field]) {
      throw new Error('source-proof reproof continuity differs from the exact admitted evidence');
    }
  }
}

export function normalizePegInCausalSourceProofRequestV1(
  value: unknown,
): PegInCausalSourceProofRequestV1 {
  const record = exactRecord(value, [
    'admissionProfile', 'candidateIdHex', 'checkpointAncestryCanonicalHex',
    'commitmentTransactionCanonicalHex', 'finalityProofCanonicalHex',
    'inclusionProofCanonicalHex', 'schema', 'sourceBoxCanonicalHex',
    'sourceConsumption', 'sourceIntent', 'statement', 'vaultSuccessorCanonicalHex',
    'verifierExecutableSha256Hex',
  ], 'peg-in causal source-proof request');
  if (record.schema !== PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA) {
    throw new Error('peg-in causal source-proof request schema is unsupported');
  }
  const admissionProfile = record.admissionProfile as PegInCausalAdmissionProfileV2;
  const sourceIntent = record.sourceIntent as PegInSourceIntentV2;
  const statement = record.statement as PegInCausalAdmissionStatementV2;
  exactRecord(admissionProfile, [
    'activationHeight', 'bridgeAddressHex', 'finalityPolicyIdHex', 'formatVersion',
    'profileRevision', 'proofProfileIdHex', 'proofSystemIdHex', 'settlementProfileIdHex',
    'sidechainIdHex', 'sourceLockErgoTreeHashHex', 'sourceNetworkIdHex',
    'tokenAddressHex', 'vaultErgoTreeHashHex',
  ], 'causal admission profile');
  exactRecord(sourceIntent, [
    'admissionProfileIdHex', 'amountNanoErg', 'bridgeAddressHex', 'formatVersion',
    'recipientAddressHex', 'settlementProfileIdHex', 'sidechainIdHex',
    'sourceAssetIdHex', 'sourceNetworkIdHex', 'tokenAddressHex',
  ], 'causal source intent');
  exactRecord(statement, [
    'acceptanceCheckpointBlockIdHex', 'acceptanceCheckpointHeight',
    'commitmentInclusionBlockIdHex', 'commitmentInclusionHeight',
    'commitmentTransactionIdHex', 'finalityPolicyIdHex', 'formatVersion',
    'legacyMintIdentityHex', 'requiredConfirmations', 'sourceBoxIdHex',
    'sourceCreationTransactionIdHex', 'sourceIntentIdHex', 'sourceLockErgoTreeHashHex',
    'sourceOutputIndex', 'vaultBoxIdHex', 'vaultErgoTreeHashHex', 'vaultOutputIndex',
  ], 'causal admission statement');
  assertPegInCausalAdmissionV2Bindings({ profile: admissionProfile, sourceIntent, statement });
  if (
    fixedHash(admissionProfile.proofSystemIdHex, 'admission proof-system ID')
      !== PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX
    || fixedHash(admissionProfile.proofProfileIdHex, 'admission proof-profile ID')
      !== PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX
    || fixedHash(admissionProfile.finalityPolicyIdHex, 'admission finality-policy ID')
      !== PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX
    || fixedHash(statement.finalityPolicyIdHex, 'statement finality-policy ID')
      !== PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX
    || statement.requiredConfirmations !== PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1
  ) {
    throw new Error('causal admission does not select the static federated source-proof profile');
  }
  const admissionIdHex = derivePegInCausalAdmissionIdV2Hex(statement);
  const candidateIdHex = fixedHash(record.candidateIdHex, 'source-proof candidate ID');
  if (candidateIdHex !== admissionIdHex) {
    throw new Error('source-proof lifecycle candidate must equal the exact causal admission ID');
  }
  const sourceConsumption = exactRecord(record.sourceConsumption, [
    'acceptanceCheckpointBlockIdHex', 'acceptanceCheckpointHeight',
    'commitmentInclusionBlockIdHex', 'commitmentInclusionHeight',
    'consumedSourceBoxIdHex', 'consumingTransactionIdHex', 'finalityPolicyIdHex',
    'vaultBoxIdHex', 'vaultOutputIndex',
  ], 'source consumption evidence');
  const normalizedConsumption = deepFreeze({
    consumedSourceBoxIdHex: exactHash(
      sourceConsumption.consumedSourceBoxIdHex,
      statement.sourceBoxIdHex,
      'consumed source box ID',
    ),
    consumingTransactionIdHex: exactHash(
      sourceConsumption.consumingTransactionIdHex,
      statement.commitmentTransactionIdHex,
      'consuming transaction ID',
    ),
    vaultOutputIndex: exactUint32(
      sourceConsumption.vaultOutputIndex,
      statement.vaultOutputIndex,
      'vault output index',
    ),
    vaultBoxIdHex: exactHash(
      sourceConsumption.vaultBoxIdHex,
      statement.vaultBoxIdHex,
      'vault box ID',
    ),
    commitmentInclusionBlockIdHex: exactHash(
      sourceConsumption.commitmentInclusionBlockIdHex,
      statement.commitmentInclusionBlockIdHex,
      'commitment inclusion block ID',
    ),
    commitmentInclusionHeight: exactUint64(
      sourceConsumption.commitmentInclusionHeight,
      statement.commitmentInclusionHeight,
      'commitment inclusion height',
    ),
    acceptanceCheckpointBlockIdHex: exactHash(
      sourceConsumption.acceptanceCheckpointBlockIdHex,
      statement.acceptanceCheckpointBlockIdHex,
      'acceptance checkpoint block ID',
    ),
    acceptanceCheckpointHeight: exactUint64(
      sourceConsumption.acceptanceCheckpointHeight,
      statement.acceptanceCheckpointHeight,
      'acceptance checkpoint height',
    ),
    finalityPolicyIdHex: exactHash(
      sourceConsumption.finalityPolicyIdHex,
      statement.finalityPolicyIdHex,
      'finality policy ID',
    ),
  });
  return deepFreeze({
    schema: PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
    candidateIdHex,
    admissionProfile: { ...admissionProfile },
    sourceIntent: { ...sourceIntent },
    statement: { ...statement },
    sourceBoxCanonicalHex: boundedBytes(
      record.sourceBoxCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES,
      'canonical source box',
    ),
    commitmentTransactionCanonicalHex: boundedBytes(
      record.commitmentTransactionCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'canonical commitment transaction',
    ),
    vaultSuccessorCanonicalHex: boundedBytes(
      record.vaultSuccessorCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES,
      'canonical vault successor',
    ),
    inclusionProofCanonicalHex: boundedBytes(
      record.inclusionProofCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'canonical inclusion proof',
    ),
    checkpointAncestryCanonicalHex: boundedBytes(
      record.checkpointAncestryCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'canonical checkpoint ancestry',
    ),
    finalityProofCanonicalHex: boundedBytes(
      record.finalityProofCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'canonical finality proof',
    ),
    verifierExecutableSha256Hex: fixedHash(
      record.verifierExecutableSha256Hex,
      'verifier executable SHA-256',
    ),
    sourceConsumption: normalizedConsumption,
  });
}

export function normalizePegInCausalSourceProofEnvelopeV1(
  value: unknown,
): PegInCausalSourceProofEnvelopeV1 {
  const record = exactRecord(value, ['result', 'signatures'], 'federated source-proof envelope');
  const result = normalizeResult(record.result as PegInCausalSourceProofResultFieldsV1);
  const signatures = normalizeSignatures(
    record.signatures as readonly PegInCausalSourceProofSignatureV1[],
  );
  return deepFreeze({
    result: {
      formatVersion: result.formatVersion,
      requestDigestHex: result.requestDigestHex,
      sourceBoxCanonicalBlake2b256Hex: result.sourceBoxCanonicalBlake2b256Hex,
      commitmentTransactionCanonicalBlake2b256Hex:
        result.commitmentTransactionCanonicalBlake2b256Hex,
      vaultSuccessorCanonicalBlake2b256Hex: result.vaultSuccessorCanonicalBlake2b256Hex,
      inclusionProofBlake2b256Hex: result.inclusionProofBlake2b256Hex,
      checkpointAncestryBlake2b256Hex: result.checkpointAncestryBlake2b256Hex,
      finalityProofBlake2b256Hex: result.finalityProofBlake2b256Hex,
      verifierExecutableSha256Hex: result.verifierExecutableSha256Hex,
      verifierProfileIdHex: result.verifierProfileIdHex,
      issuedAtNativeHeight: result.issuedAtNativeHeight.toString(),
      expiresAtNativeHeight: result.expiresAtNativeHeight.toString(),
    },
    signatures: signatures.map(signature => ({ ...signature })),
  });
}

function normalizeResult(
  value: PegInCausalSourceProofResultFieldsV1,
): Readonly<{
  formatVersion: 1;
  requestDigestHex: string;
  sourceBoxCanonicalBlake2b256Hex: string;
  commitmentTransactionCanonicalBlake2b256Hex: string;
  vaultSuccessorCanonicalBlake2b256Hex: string;
  inclusionProofBlake2b256Hex: string;
  checkpointAncestryBlake2b256Hex: string;
  finalityProofBlake2b256Hex: string;
  verifierExecutableSha256Hex: string;
  verifierProfileIdHex: string;
  issuedAtNativeHeight: bigint;
  expiresAtNativeHeight: bigint;
}> {
  const record = exactRecord(value, [
    'checkpointAncestryBlake2b256Hex', 'commitmentTransactionCanonicalBlake2b256Hex',
    'expiresAtNativeHeight', 'finalityProofBlake2b256Hex', 'formatVersion',
    'inclusionProofBlake2b256Hex', 'issuedAtNativeHeight', 'requestDigestHex',
    'sourceBoxCanonicalBlake2b256Hex', 'vaultSuccessorCanonicalBlake2b256Hex',
    'verifierExecutableSha256Hex', 'verifierProfileIdHex',
  ], 'federated source-proof result');
  if (record.formatVersion !== 1) {
    throw new Error('federated source-proof result format version is unsupported');
  }
  return deepFreeze({
    formatVersion: 1 as const,
    requestDigestHex: fixedHash(record.requestDigestHex, 'source-proof request digest'),
    sourceBoxCanonicalBlake2b256Hex: fixedHash(
      record.sourceBoxCanonicalBlake2b256Hex,
      'source-box digest',
    ),
    commitmentTransactionCanonicalBlake2b256Hex: fixedHash(
      record.commitmentTransactionCanonicalBlake2b256Hex,
      'commitment-transaction digest',
    ),
    vaultSuccessorCanonicalBlake2b256Hex: fixedHash(
      record.vaultSuccessorCanonicalBlake2b256Hex,
      'vault-successor digest',
    ),
    inclusionProofBlake2b256Hex: fixedHash(record.inclusionProofBlake2b256Hex, 'inclusion digest'),
    checkpointAncestryBlake2b256Hex: fixedHash(
      record.checkpointAncestryBlake2b256Hex,
      'checkpoint-ancestry digest',
    ),
    finalityProofBlake2b256Hex: fixedHash(record.finalityProofBlake2b256Hex, 'finality digest'),
    verifierExecutableSha256Hex: fixedHash(
      record.verifierExecutableSha256Hex,
      'verifier executable SHA-256',
    ),
    verifierProfileIdHex: fixedHash(record.verifierProfileIdHex, 'verifier profile ID'),
    issuedAtNativeHeight: uint64(record.issuedAtNativeHeight, 'source-proof issue height'),
    expiresAtNativeHeight: uint64(record.expiresAtNativeHeight, 'source-proof expiry height'),
  });
}

function normalizeSignatures(
  values: readonly PegInCausalSourceProofSignatureV1[],
): readonly PegInCausalSourceProofSignatureV1[] {
  if (!Array.isArray(values) || values.length !== PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1) {
    throw new Error('federated source proof must contain the exact threshold signature set');
  }
  const normalized = values.map((value, index) => {
    const record = exactRecord(
      value,
      ['signatureHex', 'signerPublicKeyHex'],
      `federated source-proof signature ${index}`,
    );
    return deepFreeze({
      signerPublicKeyHex: hex(fixedBytes(record.signerPublicKeyHex, 32, 'signature public key', true)),
      signatureHex: hex(fixedBytes(record.signatureHex, 64, 'Ed25519 signature')),
    });
  });
  for (const [index, signature] of normalized.entries()) {
    if (!PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX.includes(
      signature.signerPublicKeyHex as typeof PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX[number],
    )) {
      throw new Error('federated source-proof signature key is not registered');
    }
    if (index > 0 && normalized[index - 1]!.signerPublicKeyHex >= signature.signerPublicKeyHex) {
      throw new Error('federated source-proof signatures are not in canonical order');
    }
  }
  return deepFreeze(normalized);
}

function verifySignatures(
  signatures: readonly PegInCausalSourceProofSignatureV1[],
  attestationDigestHex: string,
): void {
  const message = fixedBytes(attestationDigestHex, 32, 'attestation digest', true);
  for (const signature of signatures) {
    const rawPublicKey = fixedBytes(signature.signerPublicKeyHex, 32, 'signature public key', true);
    let publicKey;
    try {
      publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
        format: 'der',
        type: 'spki',
      });
    } catch (error) {
      throw new Error('federated source-proof public key is invalid', { cause: error });
    }
    if (!verifySignature(
      null,
      message,
      publicKey,
      fixedBytes(signature.signatureHex, 64, 'Ed25519 signature'),
    )) {
      throw new Error('federated source-proof signature is invalid');
    }
  }
}

function deriveRequestDigest(request: PegInCausalSourceProofRequestV1): string {
  return domainHash(SOURCE_PROOF_REQUEST_DOMAIN, Buffer.concat([
    fixedBytes(
      derivePegInCausalAdmissionProfileIdV2Hex(request.admissionProfile),
      32,
      'causal admission profile ID',
      true,
    ),
    fixedBytes(encodePegInSourceIntentV2Hex(request.sourceIntent), 229, 'source intent'),
    fixedBytes(
      encodePegInCausalAdmissionStatementV2Hex(request.statement),
      381,
      'admission statement',
    ),
  ]));
}

function deriveStaticProfileIdHex(): string {
  return domainHash(SOURCE_PROOF_PROFILE_DOMAIN, Buffer.concat([
    Buffer.from([1]),
    uint16Be(PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1),
    uint16Be(PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX.length),
    uint64Be(PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1),
    fixedBytes(PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX, 32, 'finality policy ID', true),
    uint32Be(PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1),
    fixedBytes(PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX, 32, 'verifier profile ID', true),
    ...PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX.map(value =>
      fixedBytes(value, 32, 'source-proof signer public key', true)),
  ]));
}

function encodeResultHashBody(result: ReturnType<typeof normalizeResult>): Buffer {
  return Buffer.concat([
    Buffer.from([result.formatVersion]),
    ...resultHashes(result),
    uint64Be(result.issuedAtNativeHeight),
    uint64Be(result.expiresAtNativeHeight),
  ]);
}

function encodeResultScale(result: ReturnType<typeof normalizeResult>): Buffer {
  return Buffer.concat([
    Buffer.from([result.formatVersion]),
    ...resultHashes(result),
    uint64Le(result.issuedAtNativeHeight),
    uint64Le(result.expiresAtNativeHeight),
  ]);
}

function resultHashes(result: ReturnType<typeof normalizeResult>): Buffer[] {
  return [
    result.requestDigestHex,
    result.sourceBoxCanonicalBlake2b256Hex,
    result.commitmentTransactionCanonicalBlake2b256Hex,
    result.vaultSuccessorCanonicalBlake2b256Hex,
    result.inclusionProofBlake2b256Hex,
    result.checkpointAncestryBlake2b256Hex,
    result.finalityProofBlake2b256Hex,
    result.verifierExecutableSha256Hex,
    result.verifierProfileIdHex,
  ].map(value => fixedBytes(value, 32, 'source-proof result hash', true));
}

function validateWindow(
  result: ReturnType<typeof normalizeResult>,
  currentNativeHeight: bigint,
): void {
  if (
    result.issuedAtNativeHeight > currentNativeHeight
    || currentNativeHeight >= result.expiresAtNativeHeight
    || result.expiresAtNativeHeight <= result.issuedAtNativeHeight
    || result.expiresAtNativeHeight - result.issuedAtNativeHeight
      > PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1
  ) {
    throw new Error('federated source proof is stale or outside its bounded validity window');
  }
}

function assertStaticProfile(value: unknown): asserts value is PegInCausalSourceProofProfileV1 {
  if (value !== STATIC_PROFILE) {
    throw new Error('peg-in causal source-proof profile is not source-owned and static');
  }
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
  return value as Record<string, unknown>;
}

function fixedHash(value: unknown, label: string): string {
  return hex(fixedBytes(value, 32, label, true));
}

function exactHash(value: unknown, expected: unknown, label: string): string {
  const actual = fixedHash(value, label);
  if (actual !== fixedHash(expected, `expected ${label}`)) {
    throw new Error(`${label} does not match the causal admission statement`);
  }
  return actual;
}

function exactUint32(value: unknown, expected: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) {
    throw new Error(`${label} must be a uint32`);
  }
  if (value !== expected) {
    throw new Error(`${label} does not match the causal admission statement`);
  }
  return value as number;
}

function exactUint64(value: unknown, expected: string | number | bigint, label: string): string {
  const actual = uint64(value, label);
  if (actual !== uint64(expected, `expected ${label}`)) {
    throw new Error(`${label} does not match the causal admission statement`);
  }
  return actual.toString();
}

function boundedBytes(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase 0x-prefixed bytes`);
  }
  if ((value.length - 2) / 2 > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  return value;
}

function fixedBytes(value: unknown, bytes: number, label: string, nonZero = false): Buffer {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
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
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
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

function uint32Be(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
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

function domainHash(domain: string, bytes: Buffer): string {
  return hex(Buffer.from(blakejs.blake2b(
    Buffer.concat([Buffer.from(domain, 'ascii'), bytes]),
    undefined,
    32,
  )));
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
