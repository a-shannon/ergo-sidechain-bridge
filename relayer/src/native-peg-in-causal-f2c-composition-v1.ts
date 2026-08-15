import { createHash } from 'node:crypto';

import {
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV3Request,
  type NativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import {
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance,
  projectPinnedLocalCausalV3ReportedReceiptIdentity,
  type PinnedLocalCausalV3ResultCandidate,
  type PinnedLocalCausalV3ResultCandidateEvaluator,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import {
  assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance,
  assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance,
  type PinnedLocalCausalSourceProofProducerCandidate,
  type PinnedLocalCausalSourceProofProducerCandidateEvaluator,
} from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import {
  createPegInCausalAdmissionSecurityRegistryV1,
  projectPegInCausalAdmissionLifecycleV1,
  type PegInCausalAdmissionLifecycleJournalV1,
} from './peg-in-causal-admission-lifecycle-v1.js';
import {
  assertPegInCausalSourceProofResultV1Provenance,
  buildPegInCausalSourceProofResultFieldsV1,
  derivePegInCausalSourceProofRequestV1DigestHex,
  derivePegInCausalSourceProofResultIdV1Hex,
  type PegInCausalSourceProofRequestV1,
  type PegInCausalSourceProofResultV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  assertPegInCausalAdmissionV2Bindings,
  derivePegInCausalAdmissionIdV2Hex,
  derivePegInCausalAdmissionProfileIdV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import { decodePegInRuntimeRecordV1ScaleHex } from './peg-in-runtime-state.js';

export const NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2c-composition-candidate.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_STATUS =
  'JOINED_QUARANTINED_CAUSAL_IDENTITIES_WITH_DENY_ONLY_LIFECYCLE' as const;
export const NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2c-composition-preflight.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_STATUS =
  'NON_LIFECYCLE_CAUSAL_IDENTITIES_PREFLIGHTED' as const;

export interface NativePegInCausalF2cCompositionV1IdentityBody {
  readonly candidateIdHex: string;
  readonly admissionProfileIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly recordKeyHex: string;
  readonly sourceProofRequestDigestHex: string;
  readonly sourceProofResultIdHex: string;
  readonly sourceProofDigestHex: string;
  readonly causalV3RequestDigestHex: string;
  readonly causalV3TrustAnchorDigestHex: string;
  readonly receiptIdentityDigestHex: string;
  readonly lifecycleJournalHeadDigestHex: string;
  readonly currentNativeHeight: string;
  readonly causalV3OutputSha256Hex: string;
  readonly sourceProofProducerOutputSha256Hex: string;
}

export function deriveNativePegInCausalF2cCompositionV1IdentityDigestHex(
  input: NativePegInCausalF2cCompositionV1IdentityBody,
): string {
  assertExactKeys(input, [
    'admissionProfileIdHex',
    'candidateIdHex',
    'causalV3OutputSha256Hex',
    'causalV3RequestDigestHex',
    'causalV3TrustAnchorDigestHex',
    'currentNativeHeight',
    'lifecycleJournalHeadDigestHex',
    'receiptIdentityDigestHex',
    'recordKeyHex',
    'sourceIntentIdHex',
    'sourceProofDigestHex',
    'sourceProofProducerOutputSha256Hex',
    'sourceProofRequestDigestHex',
    'sourceProofResultIdHex',
  ], 'causal F2c composition identity body');
  return domainSha256(
    'E2S_NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_IDENTITY_V1',
    input,
  );
}

declare const COMPOSITION_BRAND: unique symbol;
declare const PREFLIGHT_BRAND: unique symbol;

export interface NativePegInCausalF2cCompositionV1Input {
  readonly causalV3Evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
  readonly causalV3Candidate: PinnedLocalCausalV3ResultCandidate;
  readonly causalV3Request: NativeFinalizedPegInCausalMintTransitionV3Request;
  readonly sourceProofProducerEvaluator:
    PinnedLocalCausalSourceProofProducerCandidateEvaluator;
  readonly sourceProofProducerCandidate:
    PinnedLocalCausalSourceProofProducerCandidate;
  readonly sourceProofRequest: PegInCausalSourceProofRequestV1;
  readonly sourceProofResult: PegInCausalSourceProofResultV1;
  readonly lifecycleJournal: PegInCausalAdmissionLifecycleJournalV1;
  readonly currentNativeHeight: string | number | bigint;
}

export type NativePegInCausalF2cPreflightV1Input = Omit<
  NativePegInCausalF2cCompositionV1Input,
  'lifecycleJournal'
>;

export interface NativePegInCausalF2cPreflightV1Payload {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_STATUS;
  readonly candidateIdHex: string;
  readonly boundary: Readonly<{
    candidateOnly: true;
    nonLifecycleBindingsVerified: true;
    lifecycleCreated: false;
    lifecycleJoined: false;
    mintAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  }>;
}

export type NativePegInCausalF2cPreflightV1 =
  NativePegInCausalF2cPreflightV1Payload & {
    readonly [PREFLIGHT_BRAND]: true;
  };

export interface NativePegInCausalF2cCompositionV1CandidatePayload {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_STATUS;
  readonly identityDigestHex: string;
  readonly candidateIdHex: string;
  readonly admissionProfileIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly recordKeyHex: string;
  readonly sourceProof: Readonly<{
    requestDigestHex: string;
    resultIdHex: string;
    proofDigestHex: string;
    verifierExecutableSha256Hex: string;
    verifierProfileIdHex: string;
  }>;
  readonly causalV3: Readonly<{
    requestDigestHex: string;
    trustAnchorDigestHex: string;
    reportedReceiptIdentityDigestHex: string;
    admissionReceiptScaleSha256Hex: string;
    admissionAdmittedAtNativeHeight: string;
    admissionExpiresAtNativeHeight: string;
    parentNativeBlockHashHex: string;
    parentNativeHeight: string;
    childNativeBlockHashHex: string;
    childNativeHeight: string;
  }>;
  readonly lifecycle: Readonly<{
    status: 'admitted';
    journalHeadDigestHex: string;
    journalEventCount: number;
    currentNativeHeight: string;
    proofResultIdHex: string;
  }>;
  readonly quarantinedChildOutputs: Readonly<{
    causalV3Sha256Hex: string;
    causalV3SizeBytes: string;
    sourceProofProducerSha256Hex: string;
    sourceProofProducerSizeBytes: string;
    contentExposed: false;
  }>;
  readonly execution: Readonly<{
    causalV3SourceIdentityDigestHex: string;
    causalV3ExecutionPolicySha256: string;
    sourceProofProducerSourceIdentityDigestHex: string;
    sourceProofProducerExecutionPolicySha256: string;
  }>;
  readonly boundary: Readonly<{
    candidateOnly: true;
    sameProcessCausalV3CandidateProvenanceVerified: true;
    sameProcessSourceProofProducerCandidateProvenanceVerified: true;
    sameProcessFederatedSourceProofResultProvenanceVerified: true;
    sourceRequestToRuntimeRecordBindingsVerified: true;
    reportedRuntimeAdmissionReceiptIdentityJoined: true;
    denyOnlyLifecycleReferenceJoined: true;
    rawChildOutputsQuarantined: true;
    nativeVerifierExecutionAuthenticated: false;
    reportedRuntimeAdmissionReceiptAuthenticated: false;
    sourceProofExecutionAuthenticated: false;
    sourceCanonicalityVerified: false;
    sidechainFinalityVerified: false;
    trustlessSourceProofVerified: false;
    runtimePendingAdmissionWritten: false;
    lifecycleIsFundsAuthority: false;
    committedVaultTransitionVerified: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  }>;
}

export type NativePegInCausalF2cCompositionV1Candidate =
  NativePegInCausalF2cCompositionV1CandidatePayload & {
    readonly [COMPOSITION_BRAND]: true;
  };

const COMPOSITIONS = new WeakMap<object, string>();
const PREFLIGHTS = new WeakMap<object, PreparedNativePegInCausalF2cV1>();
const FINALIZED_PREFLIGHTS = new WeakSet<object>();

interface PreparedNativePegInCausalF2cV1 {
  readonly input: NativePegInCausalF2cPreflightV1Input;
  readonly causalV3Request: NativeFinalizedPegInCausalMintTransitionV3Request;
  readonly causalV3RequestDigestHex: string;
  readonly sourceProofRequestDigestHex: string;
  readonly admissionProfileIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly admissionIdHex: string;
  readonly receiptProjection: ReturnType<
    typeof projectPinnedLocalCausalV3ReportedReceiptIdentity
  >;
  readonly currentNativeHeight: string;
}

/**
 * Validate every non-lifecycle F2c binding without creating or consuming a
 * lifecycle journal. The returned token is process-local and non-authorizing.
 */
export function createNativePegInCausalF2cPreflightV1(
  input: NativePegInCausalF2cPreflightV1Input,
): NativePegInCausalF2cPreflightV1 {
  assertExactKeys(input, [
    'causalV3Candidate',
    'causalV3Evaluator',
    'causalV3Request',
    'currentNativeHeight',
    'sourceProofProducerCandidate',
    'sourceProofProducerEvaluator',
    'sourceProofRequest',
    'sourceProofResult',
  ], 'causal F2c composition input');
  const inputSnapshot = { ...input };
  input = Object.freeze({
    ...inputSnapshot,
    sourceProofRequest: structuredClone(inputSnapshot.sourceProofRequest),
  });

  const causalV3Request = normalizeNativeFinalizedPegInCausalMintTransitionV3Request(
    input.causalV3Request,
  );
  const causalV3RequestDigestHex =
    deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
      Buffer.from(JSON.stringify(causalV3Request), 'utf8'),
    );
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
    evaluator: input.causalV3Evaluator,
    candidate: input.causalV3Candidate,
    expectedRequestDigestHex: causalV3RequestDigestHex,
  });

  const sourceProofRequestDigestHex =
    derivePegInCausalSourceProofRequestV1DigestHex(input.sourceProofRequest);
  assertPegInCausalSourceProofResultV1Provenance(input.sourceProofResult);
  const expectedSourceProofResultFields = buildPegInCausalSourceProofResultFieldsV1({
    request: input.sourceProofRequest,
    issuedAtNativeHeight: input.sourceProofResult.issuedAtNativeHeight,
    expiresAtNativeHeight: input.sourceProofResult.expiresAtNativeHeight,
  });
  const expectedSourceProofResultIdHex =
    derivePegInCausalSourceProofResultIdV1Hex(expectedSourceProofResultFields);
  if (
    input.sourceProofResult.requestDigestHex !== sourceProofRequestDigestHex
    || input.sourceProofResult.sourceProofResultIdHex !== expectedSourceProofResultIdHex
  ) {
    throw new Error('source-proof result differs from the exact F2c source request');
  }
  assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance({
    evaluator: input.sourceProofProducerEvaluator,
    candidate: input.sourceProofProducerCandidate,
    expectedRequestDigestHex: sourceProofRequestDigestHex,
  });
  assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance({
    evaluator: input.sourceProofProducerEvaluator,
    candidate: input.sourceProofProducerCandidate,
    expectedRequestDigestHex: sourceProofRequestDigestHex,
    expectedResultIdHex: expectedSourceProofResultIdHex,
  });

  assertPegInCausalAdmissionV2Bindings({
    profile: input.sourceProofRequest.admissionProfile,
    sourceIntent: input.sourceProofRequest.sourceIntent,
    statement: input.sourceProofRequest.statement,
  });
  const admissionProfileIdHex = derivePegInCausalAdmissionProfileIdV2Hex(
    input.sourceProofRequest.admissionProfile,
  );
  const sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(
    input.sourceProofRequest.sourceIntent,
  );
  const admissionIdHex = derivePegInCausalAdmissionIdV2Hex(
    input.sourceProofRequest.statement,
  );
  if (
    input.sourceProofRequest.candidateIdHex !== admissionIdHex
    || input.sourceProofResult.candidateIdHex !== admissionIdHex
    || input.sourceProofResult.admissionIdHex !== admissionIdHex
  ) {
    throw new Error('F2c candidate identity differs from the exact causal admission');
  }

  const executionStatement = causalV3Request.mintTransitionRequest.contractStateRequest
    .eventRequest.executionIdentityRequest.statement;
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionStatement.expectedRecordScaleHex,
  );
  const contractStateStatement =
    causalV3Request.mintTransitionRequest.contractStateRequest.statement;
  assertEqualHex(
    runtimeRecord.sidechainIdHex,
    input.sourceProofRequest.sourceIntent.sidechainIdHex,
    32,
    'runtime sidechain ID',
  );
  assertEqualHex(
    runtimeRecord.bridgeAddress,
    input.sourceProofRequest.sourceIntent.bridgeAddressHex,
    20,
    'runtime bridge address',
  );
  assertEqualHex(
    contractStateStatement.tokenAddressHex,
    input.sourceProofRequest.sourceIntent.tokenAddressHex,
    20,
    'runtime token address',
  );
  assertEqualHex(
    runtimeRecord.ergoBoxIdHex,
    input.sourceProofRequest.statement.sourceBoxIdHex,
    32,
    'runtime source box ID',
  );
  assertEqualHex(
    runtimeRecord.recipientAddress,
    input.sourceProofRequest.sourceIntent.recipientAddressHex,
    20,
    'runtime recipient',
  );
  assertEqualDecimal(
    runtimeRecord.amountNanoErg,
    input.sourceProofRequest.sourceIntent.amountNanoErg,
    'runtime amount',
  );
  assertEqualDecimal(
    runtimeRecord.profileRevision,
    input.sourceProofRequest.admissionProfile.profileRevision,
    'runtime profile revision',
  );
  assertEqualDecimal(
    runtimeRecord.profileActivationHeight,
    input.sourceProofRequest.admissionProfile.activationHeight,
    'runtime profile activation height',
  );
  assertEqualHex(
    causalV3Request.statement.recordKeyHex,
    input.sourceProofRequest.statement.legacyMintIdentityHex,
    32,
    'runtime record key',
  );

  const receiptProjection = projectPinnedLocalCausalV3ReportedReceiptIdentity({
    evaluator: input.causalV3Evaluator,
    candidate: input.causalV3Candidate,
    expectedRequestDigestHex: causalV3RequestDigestHex,
    expected: {
      recordKeyHex: causalV3Request.statement.recordKeyHex,
      causalProfileIdHex: admissionProfileIdHex,
      sourceIntentIdHex,
      admissionIdHex,
      proofSystemIdHex: input.sourceProofResult.proofSystemIdHex,
      proofProfileIdHex: input.sourceProofResult.proofProfileIdHex,
      admissionReceiptStorageKeyHex:
        causalV3Request.statement.admissionReceiptStorageKeyHex,
      sourceProofRequestDigestHex,
      sourceProofResultIdHex: input.sourceProofResult.sourceProofResultIdHex,
      sourceProofDigestHex: input.sourceProofResult.sourceProofDigestHex,
      verifierExecutableSha256Hex:
        input.sourceProofResult.verifierExecutableSha256Hex,
      verifierProfileIdHex: input.sourceProofResult.verifierProfileIdHex,
      admissionExpiresAtNativeHeight: input.sourceProofResult.expiresAtNativeHeight,
      sourceProofIssuedAtNativeHeight: input.sourceProofResult.issuedAtNativeHeight,
    },
  });

  const currentNativeHeight = uint64Decimal(
    input.currentNativeHeight,
    'current native height',
  );
  if (
    BigInt(currentNativeHeight) < BigInt(receiptProjection.childNativeHeight)
    || BigInt(currentNativeHeight)
      < BigInt(receiptProjection.admissionAdmittedAtNativeHeight)
  ) {
    throw new Error('causal F2c composition current height predates the reported transition');
  }
  const sourceProofValidatedAtNativeHeight = uint64Decimal(
    input.sourceProofResult.validatedAtNativeHeight,
    'source-proof validation height',
  );
  const sourceProofExpiresAtNativeHeight = uint64Decimal(
    input.sourceProofResult.expiresAtNativeHeight,
    'source-proof expiry height',
  );
  if (
    BigInt(currentNativeHeight) < BigInt(sourceProofValidatedAtNativeHeight)
    || BigInt(currentNativeHeight) >= BigInt(sourceProofExpiresAtNativeHeight)
  ) {
    throw new Error('causal F2c source-proof result is not fresh at the current native height');
  }

  const prepared = Object.freeze({
    input,
    causalV3Request,
    causalV3RequestDigestHex,
    sourceProofRequestDigestHex,
    admissionProfileIdHex,
    sourceIntentIdHex,
    admissionIdHex,
    receiptProjection,
    currentNativeHeight,
  });
  const preflight = deepFreeze({
    schema: NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2C_PREFLIGHT_V1_STATUS,
    candidateIdHex: admissionIdHex,
    boundary: {
      candidateOnly: true as const,
      nonLifecycleBindingsVerified: true as const,
      lifecycleCreated: false as const,
      lifecycleJoined: false as const,
      mintAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      gate5Closed: false as const,
      productionReadinessVerified: false as const,
    },
  }) as NativePegInCausalF2cPreflightV1;
  PREFLIGHTS.set(preflight, prepared);
  return preflight;
}

/** Join one genuine preflight to one current same-process deny-only journal. */
export function finalizeNativePegInCausalF2cCompositionV1(input: {
  readonly preflight: NativePegInCausalF2cPreflightV1;
  readonly lifecycleJournal: PegInCausalAdmissionLifecycleJournalV1;
}): NativePegInCausalF2cCompositionV1Candidate {
  assertExactKeys(input, ['lifecycleJournal', 'preflight'], 'causal F2c finalization input');
  const preflight = input.preflight;
  const lifecycleJournal = input.lifecycleJournal;
  const prepared = preflight && typeof preflight === 'object'
    ? PREFLIGHTS.get(preflight)
    : undefined;
  if (
    prepared === undefined
    || preflight.candidateIdHex !== prepared.admissionIdHex
    || FINALIZED_PREFLIGHTS.has(preflight)
  ) {
    throw new Error('causal F2c preflight process provenance is missing or already finalized');
  }
  const {
    input: preparedInput,
    causalV3Request,
    causalV3RequestDigestHex,
    sourceProofRequestDigestHex,
    admissionProfileIdHex,
    sourceIntentIdHex,
    admissionIdHex,
    receiptProjection,
    currentNativeHeight,
  } = prepared;
  const lifecycleProjection = projectPegInCausalAdmissionLifecycleV1({
    journal: lifecycleJournal,
    registry: createPegInCausalAdmissionSecurityRegistryV1(),
    currentNativeHeight,
  });
  const proofReference = lifecycleProjection.proofReference;
  const lifecycleJournalHeadDigestHex = lifecycleProjection.journalHeadDigestHex;
  if (
    lifecycleProjection.status !== 'admitted'
    || lifecycleProjection.observationHold
    || lifecycleProjection.invalidationReason !== null
    || lifecycleProjection.consumedIncident
    || lifecycleProjection.boundary.processJournalProvenanceVerified !== true
    || proofReference === null
    || lifecycleJournalHeadDigestHex === null
  ) {
    throw new Error('causal F2c lifecycle is not a current admitted deny-only head');
  }
  const expectedReference = {
    candidateIdHex: admissionIdHex,
    proofSystemIdHex: preparedInput.sourceProofResult.proofSystemIdHex,
    proofProfileIdHex: preparedInput.sourceProofResult.proofProfileIdHex,
    proofResultIdHex: preparedInput.sourceProofResult.sourceProofResultIdHex,
    proofDigestHex: preparedInput.sourceProofResult.sourceProofDigestHex,
    requestDigestHex: sourceProofRequestDigestHex,
    verifierExecutableSha256Hex:
      preparedInput.sourceProofResult.verifierExecutableSha256Hex,
    validatedAtNativeHeight: preparedInput.sourceProofResult.validatedAtNativeHeight,
    expiresAtNativeHeight: preparedInput.sourceProofResult.expiresAtNativeHeight,
  };
  for (const [field, value] of Object.entries(expectedReference)) {
    if (proofReference[field as keyof typeof expectedReference] !== value) {
      throw new Error(`causal F2c lifecycle proof reference ${field} differs`);
    }
  }

  const identityBody = {
    candidateIdHex: admissionIdHex,
    admissionProfileIdHex,
    sourceIntentIdHex,
    recordKeyHex: causalV3Request.statement.recordKeyHex,
    sourceProofRequestDigestHex,
    sourceProofResultIdHex: preparedInput.sourceProofResult.sourceProofResultIdHex,
    sourceProofDigestHex: preparedInput.sourceProofResult.sourceProofDigestHex,
    causalV3RequestDigestHex,
    causalV3TrustAnchorDigestHex: preparedInput.causalV3Candidate.trustAnchorDigestHex,
    receiptIdentityDigestHex: receiptProjection.receiptIdentityDigestHex,
    lifecycleJournalHeadDigestHex,
    currentNativeHeight,
    causalV3OutputSha256Hex:
      preparedInput.causalV3Candidate.quarantinedChildOutput.sha256Hex,
    sourceProofProducerOutputSha256Hex:
      preparedInput.sourceProofProducerCandidate.quarantinedChildOutput.sha256Hex,
  };
  const identityDigestHex =
    deriveNativePegInCausalF2cCompositionV1IdentityDigestHex(identityBody);
  const candidate = deepFreeze({
    schema: NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_STATUS,
    identityDigestHex,
    candidateIdHex: admissionIdHex,
    admissionProfileIdHex,
    sourceIntentIdHex,
    recordKeyHex: causalV3Request.statement.recordKeyHex,
    sourceProof: {
      requestDigestHex: sourceProofRequestDigestHex,
      resultIdHex: preparedInput.sourceProofResult.sourceProofResultIdHex,
      proofDigestHex: preparedInput.sourceProofResult.sourceProofDigestHex,
      verifierExecutableSha256Hex:
        preparedInput.sourceProofResult.verifierExecutableSha256Hex,
      verifierProfileIdHex: preparedInput.sourceProofResult.verifierProfileIdHex,
    },
    causalV3: {
      requestDigestHex: causalV3RequestDigestHex,
      trustAnchorDigestHex: preparedInput.causalV3Candidate.trustAnchorDigestHex,
      reportedReceiptIdentityDigestHex: receiptProjection.receiptIdentityDigestHex,
      admissionReceiptScaleSha256Hex:
        receiptProjection.admissionReceiptScaleSha256Hex,
      admissionAdmittedAtNativeHeight:
        receiptProjection.admissionAdmittedAtNativeHeight,
      admissionExpiresAtNativeHeight:
        receiptProjection.admissionExpiresAtNativeHeight,
      parentNativeBlockHashHex: receiptProjection.parentNativeBlockHashHex,
      parentNativeHeight: receiptProjection.parentNativeHeight,
      childNativeBlockHashHex: receiptProjection.childNativeBlockHashHex,
      childNativeHeight: receiptProjection.childNativeHeight,
    },
    lifecycle: {
      status: 'admitted' as const,
      journalHeadDigestHex: lifecycleJournalHeadDigestHex,
      journalEventCount: lifecycleProjection.journalEventCount,
      currentNativeHeight,
      proofResultIdHex: proofReference.proofResultIdHex,
    },
    quarantinedChildOutputs: {
      causalV3Sha256Hex:
        preparedInput.causalV3Candidate.quarantinedChildOutput.sha256Hex,
      causalV3SizeBytes:
        preparedInput.causalV3Candidate.quarantinedChildOutput.sizeBytes,
      sourceProofProducerSha256Hex:
        preparedInput.sourceProofProducerCandidate.quarantinedChildOutput.sha256Hex,
      sourceProofProducerSizeBytes:
        preparedInput.sourceProofProducerCandidate.quarantinedChildOutput.sizeBytes,
      contentExposed: false as const,
    },
    execution: {
      causalV3SourceIdentityDigestHex:
        preparedInput.causalV3Candidate.execution.sourceExecutionIdentityDigestHex,
      causalV3ExecutionPolicySha256:
        preparedInput.causalV3Candidate.execution.executionPolicySha256,
      sourceProofProducerSourceIdentityDigestHex:
        preparedInput.sourceProofProducerCandidate.execution.sourceExecutionIdentityDigestHex,
      sourceProofProducerExecutionPolicySha256:
        preparedInput.sourceProofProducerCandidate.execution.executionPolicySha256,
    },
    boundary: {
      candidateOnly: true as const,
      sameProcessCausalV3CandidateProvenanceVerified: true as const,
      sameProcessSourceProofProducerCandidateProvenanceVerified: true as const,
      sameProcessFederatedSourceProofResultProvenanceVerified: true as const,
      sourceRequestToRuntimeRecordBindingsVerified: true as const,
      reportedRuntimeAdmissionReceiptIdentityJoined: true as const,
      denyOnlyLifecycleReferenceJoined: true as const,
      rawChildOutputsQuarantined: true as const,
      nativeVerifierExecutionAuthenticated: false as const,
      reportedRuntimeAdmissionReceiptAuthenticated: false as const,
      sourceProofExecutionAuthenticated: false as const,
      sourceCanonicalityVerified: false as const,
      sidechainFinalityVerified: false as const,
      trustlessSourceProofVerified: false as const,
      runtimePendingAdmissionWritten: false as const,
      lifecycleIsFundsAuthority: false as const,
      committedVaultTransitionVerified: false as const,
      mintAuthorized: false as const,
      daemonAdmissionAuthorized: false as const,
      reconciliationHoldReleaseAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      transactionMutationEnabled: false as const,
      gate5Closed: false as const,
      productionReadinessVerified: false as const,
    },
  }) as NativePegInCausalF2cCompositionV1Candidate;
  COMPOSITIONS.set(candidate, identityDigestHex);
  FINALIZED_PREFLIGHTS.add(preflight);
  return candidate;
}

/** Preserve the original one-shot API for existing same-process callers. */
export function createNativePegInCausalF2cCompositionV1(
  input: NativePegInCausalF2cCompositionV1Input,
): NativePegInCausalF2cCompositionV1Candidate {
  assertExactKeys(input, [
    'causalV3Candidate',
    'causalV3Evaluator',
    'causalV3Request',
    'currentNativeHeight',
    'lifecycleJournal',
    'sourceProofProducerCandidate',
    'sourceProofProducerEvaluator',
    'sourceProofRequest',
    'sourceProofResult',
  ], 'causal F2c composition input');
  const preflight = createNativePegInCausalF2cPreflightV1({
    causalV3Evaluator: input.causalV3Evaluator,
    causalV3Candidate: input.causalV3Candidate,
    causalV3Request: input.causalV3Request,
    sourceProofProducerEvaluator: input.sourceProofProducerEvaluator,
    sourceProofProducerCandidate: input.sourceProofProducerCandidate,
    sourceProofRequest: input.sourceProofRequest,
    sourceProofResult: input.sourceProofResult,
    currentNativeHeight: input.currentNativeHeight,
  });
  return finalizeNativePegInCausalF2cCompositionV1({
    preflight,
    lifecycleJournal: input.lifecycleJournal,
  });
}

export function assertNativePegInCausalF2cCompositionV1Provenance(
  candidate: unknown,
): asserts candidate is NativePegInCausalF2cCompositionV1Candidate {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('causal F2c composition candidate provenance is missing');
  }
  const identityDigestHex = COMPOSITIONS.get(candidate);
  if (
    identityDigestHex === undefined
    || (candidate as Partial<NativePegInCausalF2cCompositionV1Candidate>)
      .identityDigestHex !== identityDigestHex
  ) {
    throw new Error('causal F2c composition candidate provenance is missing');
  }
}

function assertEqualHex(
  left: unknown,
  right: unknown,
  bytes: number,
  label: string,
): void {
  if (canonicalHex(left, bytes, label) !== canonicalHex(right, bytes, label)) {
    throw new Error(`${label} differs between source proof and runtime record`);
  }
}

function canonicalHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function assertEqualDecimal(left: unknown, right: unknown, label: string): void {
  if (uint64Decimal(left, label) !== uint64Decimal(right, label)) {
    throw new Error(`${label} differs between source proof and runtime record`);
  }
}

function uint64Decimal(value: unknown, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value as string | number);
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (
    parsed < 0n
    || parsed > ((1n << 64n) - 1n)
    || (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
    || (typeof value === 'string' && value !== parsed.toString())
  ) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  return parsed.toString();
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function domainSha256(domain: string, body: unknown): string {
  return `0x${createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(JSON.stringify(body), 'utf8'))
    .digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
