import blakejs from 'blakejs';
import {
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS,
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA,
  PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
  buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate,
  deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV2Request,
  type NativeFinalizedPegInCausalMintTransitionV2ResultCandidate,
} from './native-finalized-peg-in-causal-mint-transition-v2.js';
import {
  decodePegInRuntimeRecordV1ScaleHex,
  derivePegInRuntimeRecordKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
} from './peg-in-causal-source-proof-admission-v1.js';
import { parseStrictJson } from './strict-json.js';
import {
  derivePegInCausalAdmissionReceiptStorageKeyV1,
  derivePegInCausalInvalidationTombstoneStorageKeyV1,
} from './substrate-finality-provider.js';

export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-request.v3' as const;
export const PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA =
  'e2s.peg-in-causal-mint-transition-statement.v3' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-verification.v3' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATUS =
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-result-candidate.v3' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_RESULT_CANDIDATE' as const;
export const MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES = 64 * 1024 * 1024;

const RESULT_CANDIDATES = new WeakSet<object>();

export interface PegInCausalMintTransitionStatementRequestV3 {
  readonly schema: typeof PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA;
  readonly recordKeyHex: string;
  readonly currentPegInProfileStorageKeyHex: string;
  readonly currentCausalProfileStorageKeyHex: string;
  readonly causalEnforcementStorageKeyHex: string;
  readonly pendingKeysStorageKeyHex: string;
  readonly pendingAdmissionStorageKeyHex: string;
  readonly admissionReceiptStorageKeyHex: string;
  readonly invalidationTombstoneStorageKeyHex: string;
  readonly processedRecordStorageKeyHex: string;
  readonly consumedAdmissionStorageKeyHex: string;
}

export interface NativeFinalizedPegInCausalMintTransitionV3Request {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA;
  readonly mintTransitionRequest: ReturnType<
    typeof normalizeNativeFinalizedPegInCausalMintTransitionV2Request
  >['mintTransitionRequest'];
  readonly statement: PegInCausalMintTransitionStatementRequestV3;
}

export interface NativeFinalizedPegInCausalMintTransitionV3ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_VERIFICATION_SCHEMA;
  readonly reportedSourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly mintTransitionVerification:
    NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['mintTransitionVerification'];
  readonly headerBinding:
    NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['headerBinding'];
  readonly causalTransition: Readonly<
    NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['causalTransition'] & {
      admissionReceiptStorageKeyHex: string;
      invalidationTombstoneStorageKeyHex: string;
      sourceProofRequestDigestHex: string;
      sourceProofResultIdHex: string;
      sourceProofDigestHex: string;
      verifierExecutableSha256Hex: string;
      verifierProfileIdHex: string;
      admissionAdmittedAtNativeHeight: string;
      admissionExpiresAtNativeHeight: string;
      admissionReceiptScaleHex: string;
    }
  >;
  readonly boundary: Readonly<{
    candidateOnly: true;
    exactRequestBytesDigestBound: true;
    independentlySuppliedTrustAnchorDigestBound: true;
    nestedT20CResultShapeChecked: true;
    exactParentChildAndCausalSuccessorShapeChecked: true;
    exactFederatedReceiptResultShapeChecked: true;
    nativeVerifierExecutionAuthenticated: false;
    sidechainFinalityVerified: false;
    directParentChildVerified: false;
    causalPrePostStateVerified: false;
    exactCausalSuccessorVerified: false;
    federatedSourceProofReceiptAuthenticated: false;
    trustlessSourceProofVerified: false;
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

export function normalizeNativeFinalizedPegInCausalMintTransitionV3Request(
  value: unknown,
): NativeFinalizedPegInCausalMintTransitionV3Request {
  const record = exactRecord(value, [
    'mintTransitionRequest',
    'schema',
    'statement',
  ], 'native finalized causal peg-in mint-transition V3 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
    'native finalized causal peg-in mint-transition V3 request schema',
  );
  const statementRecord = exactRecord(record.statement, [
    'admissionReceiptStorageKeyHex',
    'causalEnforcementStorageKeyHex',
    'consumedAdmissionStorageKeyHex',
    'currentCausalProfileStorageKeyHex',
    'currentPegInProfileStorageKeyHex',
    'invalidationTombstoneStorageKeyHex',
    'pendingAdmissionStorageKeyHex',
    'pendingKeysStorageKeyHex',
    'processedRecordStorageKeyHex',
    'recordKeyHex',
    'schema',
  ], 'causal peg-in mint-transition V3 statement');
  requireLiteral(
    statementRecord.schema,
    PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA,
    'causal peg-in mint-transition V3 statement schema',
  );
  const baseRequest = normalizeNativeFinalizedPegInCausalMintTransitionV2Request({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    mintTransitionRequest: record.mintTransitionRequest,
    statement: {
      schema: PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
      recordKeyHex: statementRecord.recordKeyHex,
      currentPegInProfileStorageKeyHex: statementRecord.currentPegInProfileStorageKeyHex,
      currentCausalProfileStorageKeyHex: statementRecord.currentCausalProfileStorageKeyHex,
      causalEnforcementStorageKeyHex: statementRecord.causalEnforcementStorageKeyHex,
      pendingKeysStorageKeyHex: statementRecord.pendingKeysStorageKeyHex,
      pendingAdmissionStorageKeyHex: statementRecord.pendingAdmissionStorageKeyHex,
      processedRecordStorageKeyHex: statementRecord.processedRecordStorageKeyHex,
      consumedAdmissionStorageKeyHex: statementRecord.consumedAdmissionStorageKeyHex,
    },
  });
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    baseRequest.mintTransitionRequest.contractStateRequest.eventRequest
      .executionIdentityRequest.statement.expectedRecordScaleHex,
  );
  const recordKeyHex = derivePegInRuntimeRecordKeyV1Hex({
    sidechainIdHex: runtimeRecord.sidechainIdHex,
    ergoBoxIdHex: runtimeRecord.ergoBoxIdHex,
  });
  if (recordKeyHex !== baseRequest.statement.recordKeyHex) {
    throw new Error('causal V3 record key differs from the nested runtime record');
  }
  const admissionReceiptStorageKeyHex = exactKey(
    statementRecord.admissionReceiptStorageKeyHex,
    derivePegInCausalAdmissionReceiptStorageKeyV1(recordKeyHex),
    'admission receipt storage key',
  );
  const invalidationTombstoneStorageKeyHex = exactKey(
    statementRecord.invalidationTombstoneStorageKeyHex,
    derivePegInCausalInvalidationTombstoneStorageKeyV1(recordKeyHex),
    'invalidation tombstone storage key',
  );
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
    mintTransitionRequest: baseRequest.mintTransitionRequest,
    statement: {
      schema: PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA,
      recordKeyHex: baseRequest.statement.recordKeyHex,
      currentPegInProfileStorageKeyHex:
        baseRequest.statement.currentPegInProfileStorageKeyHex,
      currentCausalProfileStorageKeyHex:
        baseRequest.statement.currentCausalProfileStorageKeyHex,
      causalEnforcementStorageKeyHex:
        baseRequest.statement.causalEnforcementStorageKeyHex,
      pendingKeysStorageKeyHex: baseRequest.statement.pendingKeysStorageKeyHex,
      pendingAdmissionStorageKeyHex:
        baseRequest.statement.pendingAdmissionStorageKeyHex,
      admissionReceiptStorageKeyHex,
      invalidationTombstoneStorageKeyHex,
      processedRecordStorageKeyHex:
        baseRequest.statement.processedRecordStorageKeyHex,
      consumedAdmissionStorageKeyHex:
        baseRequest.statement.consumedAdmissionStorageKeyHex,
    },
  });
  if (Buffer.byteLength(JSON.stringify(request), 'utf8')
    > MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES} bytes`,
    );
  }
  return `0x${Buffer.from(
    blakejs.blake2b(Buffer.from(requestBytes), undefined, 32),
  ).toString('hex')}`;
}

/** Quarantine one caller-supplied V3 report without accepting its proof claims. */
export function buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInCausalMintTransitionV3ResultCandidate {
  if (input.requestBytes.byteLength > MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_V3_REQUEST_BYTES} bytes`,
    );
  }
  let requestSource: string;
  try {
    requestSource = new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes);
  } catch (error) {
    throw new Error('native finalized causal mint-transition request is not valid UTF-8 JSON', {
      cause: error,
    });
  }
  const request = normalizeNativeFinalizedPegInCausalMintTransitionV3Request(
    parseStrictJson(requestSource, 'native finalized causal mint-transition V3 request bytes'),
  );
  const trustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied causal mint-transition trust anchor digest',
  );
  const result = exactRecord(input.verification, [
    'boundary',
    'causalTransition',
    'headerBinding',
    'mintTransitionVerification',
    'requestDigestHex',
    'schema',
    'status',
    'trustAnchorDigestHex',
  ], 'native finalized causal peg-in mint-transition V3 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_VERIFICATION_SCHEMA,
    'native finalized causal peg-in mint-transition V3 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATUS,
    'native finalized causal peg-in mint-transition V3 verification status',
  );
  const requestDigestHex = fixedHex(result.requestDigestHex, 32, 'causal request digest');
  if (requestDigestHex
    !== deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(input.requestBytes)) {
    throw new Error('causal mint-transition request digest does not match the exact V3 request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'causal verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error('causal verification does not match the independently supplied trust anchor');
  }

  const baseCandidate = buildBaseV2Candidate({
    request,
    trustedAnchorDigestHex,
    result,
  });
  const receipt = normalizeV3ReceiptTransition(
    result.causalTransition,
    request,
    baseCandidate,
  );
  normalizeVerificationBoundary(result.boundary);

  const candidate = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_RESULT_CANDIDATE_STATUS,
    sourceResultSchema:
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_VERIFICATION_SCHEMA,
    reportedSourceResultStatus:
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: resultTrustAnchorDigestHex,
    mintTransitionVerification: baseCandidate.mintTransitionVerification,
    headerBinding: baseCandidate.headerBinding,
    causalTransition: {
      ...baseCandidate.causalTransition,
      admissionReceiptStorageKeyHex: request.statement.admissionReceiptStorageKeyHex,
      invalidationTombstoneStorageKeyHex:
        request.statement.invalidationTombstoneStorageKeyHex,
      ...receipt,
    },
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      nestedT20CResultShapeChecked: true,
      exactParentChildAndCausalSuccessorShapeChecked: true,
      exactFederatedReceiptResultShapeChecked: true,
      nativeVerifierExecutionAuthenticated: false,
      sidechainFinalityVerified: false,
      directParentChildVerified: false,
      causalPrePostStateVerified: false,
      exactCausalSuccessorVerified: false,
      federatedSourceProofReceiptAuthenticated: false,
      trustlessSourceProofVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    } as const,
  });
  RESULT_CANDIDATES.add(candidate);
  return candidate;
}

export function assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance(
  value: unknown,
): asserts value is NativeFinalizedPegInCausalMintTransitionV3ResultCandidate {
  if (!value || typeof value !== 'object' || !RESULT_CANDIDATES.has(value)) {
    throw new Error('native finalized causal mint-transition V3 candidate provenance is missing');
  }
}

function buildBaseV2Candidate(input: {
  request: NativeFinalizedPegInCausalMintTransitionV3Request;
  trustedAnchorDigestHex: string;
  result: Record<string, unknown>;
}): NativeFinalizedPegInCausalMintTransitionV2ResultCandidate {
  const causal = exactRecord(input.result.causalTransition, [
    'admissionExpiresAtNativeHeight',
    'admissionIdHex',
    'admissionReceiptScaleHex',
    'causalProfileIdHex',
    'consumedAdmissionV3Hex',
    'parentPendingKeyCount',
    'parentProofBytes',
    'parentProofNodeCount',
    'postPendingKeyCount',
    'postProofBytes',
    'postProofNodeCount',
    'processedRecordScaleHex',
    'proofProfileIdHex',
    'proofSystemIdHex',
    'recordKeyHex',
    'sourceIntentIdHex',
    'sourceProofDigestHex',
    'sourceProofRequestDigestHex',
    'sourceProofResultIdHex',
    'verified',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ], 'causal V3 state transition');
  const statement = input.request.statement;
  const v2Request = normalizeNativeFinalizedPegInCausalMintTransitionV2Request({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    mintTransitionRequest: input.request.mintTransitionRequest,
    statement: {
      schema: PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
      recordKeyHex: statement.recordKeyHex,
      currentPegInProfileStorageKeyHex: statement.currentPegInProfileStorageKeyHex,
      currentCausalProfileStorageKeyHex: statement.currentCausalProfileStorageKeyHex,
      causalEnforcementStorageKeyHex: statement.causalEnforcementStorageKeyHex,
      pendingKeysStorageKeyHex: statement.pendingKeysStorageKeyHex,
      pendingAdmissionStorageKeyHex: statement.pendingAdmissionStorageKeyHex,
      processedRecordStorageKeyHex: statement.processedRecordStorageKeyHex,
      consumedAdmissionStorageKeyHex: statement.consumedAdmissionStorageKeyHex,
    },
  });
  const v2RequestBytes = Buffer.from(JSON.stringify(v2Request), 'utf8');
  return buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate({
    requestBytes: v2RequestBytes,
    trustedAnchorDigestHex: input.trustedAnchorDigestHex,
    verification: {
      schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA,
      status: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS,
      requestDigestHex:
        deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex(v2RequestBytes),
      trustAnchorDigestHex: input.result.trustAnchorDigestHex,
      mintTransitionVerification: input.result.mintTransitionVerification,
      headerBinding: input.result.headerBinding,
      causalTransition: {
        recordKeyHex: causal.recordKeyHex,
        causalProfileIdHex: causal.causalProfileIdHex,
        sourceIntentIdHex: causal.sourceIntentIdHex,
        admissionIdHex: causal.admissionIdHex,
        proofSystemIdHex: causal.proofSystemIdHex,
        proofProfileIdHex: causal.proofProfileIdHex,
        processedRecordScaleHex: causal.processedRecordScaleHex,
        consumedAdmissionV3Hex: causal.consumedAdmissionV3Hex,
        parentPendingKeyCount: causal.parentPendingKeyCount,
        postPendingKeyCount: causal.postPendingKeyCount,
        parentProofNodeCount: causal.parentProofNodeCount,
        parentProofBytes: causal.parentProofBytes,
        postProofNodeCount: causal.postProofNodeCount,
        postProofBytes: causal.postProofBytes,
        verified: causal.verified,
      },
      boundary: {
        sidechainFinalityVerified: true,
        directParentChildVerified: true,
        causalPrePostStateVerified: true,
        exactCausalSuccessorVerified: true,
        committedVaultTransitionVerified: false,
        nativeVerifierExecutionAuthenticated: false,
        mintAuthorized: false,
        daemonAdmissionAuthorized: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    },
  });
}

function normalizeV3ReceiptTransition(
  value: unknown,
  request: NativeFinalizedPegInCausalMintTransitionV3Request,
  base: NativeFinalizedPegInCausalMintTransitionV2ResultCandidate,
): Omit<
  NativeFinalizedPegInCausalMintTransitionV3ResultCandidate['causalTransition'],
  keyof NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['causalTransition']
  | 'admissionReceiptStorageKeyHex'
  | 'invalidationTombstoneStorageKeyHex'
> {
  const record = value as Record<string, unknown>;
  const sourceProofRequestDigestHex = fixedHex(
    record.sourceProofRequestDigestHex,
    32,
    'source-proof request digest',
    true,
  );
  const sourceProofResultIdHex = fixedHex(
    record.sourceProofResultIdHex,
    32,
    'source-proof result ID',
    true,
  );
  const sourceProofDigestHex = fixedHex(
    record.sourceProofDigestHex,
    32,
    'source-proof digest',
    true,
  );
  const verifierExecutableSha256Hex = fixedHex(
    record.verifierExecutableSha256Hex,
    32,
    'source verifier executable SHA-256',
    true,
  );
  const verifierProfileIdHex = exactKey(
    record.verifierProfileIdHex,
    PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
    'source verifier profile ID',
  );
  if (base.causalTransition.proofSystemIdHex
    !== PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX) {
    throw new Error('causal proof-system ID differs from the static federated profile');
  }
  if (base.causalTransition.proofProfileIdHex
    !== PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX) {
    throw new Error('causal proof-profile ID differs from the static federated profile');
  }
  const admissionExpiresAtNativeHeight = uint64Decimal(
    record.admissionExpiresAtNativeHeight,
    'admission expiry height',
  );
  const admissionReceiptScaleHex = byteHex(
    record.admissionReceiptScaleHex,
    241,
    'admission receipt SCALE',
  );
  const receipt = decodeAdmissionReceiptScaleV1(admissionReceiptScaleHex);
  if (
    receipt.profileIdHex !== base.causalTransition.causalProfileIdHex
    || receipt.admissionIdHex !== base.causalTransition.admissionIdHex
    || receipt.sourceProofRequestDigestHex !== sourceProofRequestDigestHex
    || receipt.sourceProofResultIdHex !== sourceProofResultIdHex
    || receipt.sourceProofDigestHex !== sourceProofDigestHex
    || receipt.verifierExecutableSha256Hex !== verifierExecutableSha256Hex
    || receipt.verifierProfileIdHex !== verifierProfileIdHex
    || receipt.expiresAtNativeHeight !== admissionExpiresAtNativeHeight
  ) {
    throw new Error('admission receipt SCALE differs from the exact V3 result fields');
  }
  const parentHeight = BigInt(base.headerBinding.parentNativeHeight);
  const childHeight = BigInt(base.headerBinding.childNativeHeight);
  if (BigInt(receipt.admittedAtNativeHeight) > parentHeight) {
    throw new Error('admission receipt was admitted after the authenticated parent');
  }
  if (BigInt(receipt.expiresAtNativeHeight) <= childHeight) {
    throw new Error('admission receipt is expired at the authenticated child');
  }
  if (request.statement.admissionReceiptStorageKeyHex
    !== derivePegInCausalAdmissionReceiptStorageKeyV1(base.causalTransition.recordKeyHex)) {
    throw new Error('admission receipt key differs from the exact V3 record key');
  }
  if (request.statement.invalidationTombstoneStorageKeyHex
    !== derivePegInCausalInvalidationTombstoneStorageKeyV1(
      base.causalTransition.recordKeyHex,
    )) {
    throw new Error('invalidation tombstone key differs from the exact V3 record key');
  }
  return deepFreeze({
    sourceProofRequestDigestHex,
    sourceProofResultIdHex,
    sourceProofDigestHex,
    verifierExecutableSha256Hex,
    verifierProfileIdHex,
    admissionAdmittedAtNativeHeight: receipt.admittedAtNativeHeight,
    admissionExpiresAtNativeHeight,
    admissionReceiptScaleHex,
  });
}

function decodeAdmissionReceiptScaleV1(value: string): {
  profileIdHex: string;
  admissionIdHex: string;
  sourceProofRequestDigestHex: string;
  sourceProofResultIdHex: string;
  sourceProofDigestHex: string;
  verifierExecutableSha256Hex: string;
  verifierProfileIdHex: string;
  admittedAtNativeHeight: string;
  expiresAtNativeHeight: string;
} {
  const bytes = fixedHexBytes(value, 241, 'admission receipt SCALE');
  if (bytes[0] !== 1) throw new Error('admission receipt format version must be 1');
  let offset = 1;
  const takeHash = (): string => {
    const result = `0x${bytes.subarray(offset, offset + 32).toString('hex')}`;
    offset += 32;
    return result;
  };
  const profileIdHex = takeHash();
  const admissionIdHex = takeHash();
  const sourceProofRequestDigestHex = takeHash();
  const sourceProofResultIdHex = takeHash();
  const sourceProofDigestHex = takeHash();
  const verifierExecutableSha256Hex = takeHash();
  const verifierProfileIdHex = takeHash();
  const admittedAtNativeHeight = bytes.readBigUInt64LE(offset).toString();
  offset += 8;
  const expiresAtNativeHeight = bytes.readBigUInt64LE(offset).toString();
  return {
    profileIdHex,
    admissionIdHex,
    sourceProofRequestDigestHex,
    sourceProofResultIdHex,
    sourceProofDigestHex,
    verifierExecutableSha256Hex,
    verifierProfileIdHex,
    admittedAtNativeHeight,
    expiresAtNativeHeight,
  };
}

function normalizeVerificationBoundary(value: unknown): void {
  const record = exactRecord(value, [
    'causalPrePostStateVerified',
    'committedVaultTransitionVerified',
    'daemonAdmissionAuthorized',
    'directParentChildVerified',
    'exactCausalSuccessorVerified',
    'federatedSourceProofReceiptAuthenticated',
    'gate5Closed',
    'mintAuthorized',
    'nativeVerifierExecutionAuthenticated',
    'productionReadinessVerified',
    'sidechainFinalityVerified',
    'transactionMutationEnabled',
    'trustlessSourceProofVerified',
  ], 'causal V3 verification boundary');
  for (const field of [
    'sidechainFinalityVerified',
    'directParentChildVerified',
    'causalPrePostStateVerified',
    'exactCausalSuccessorVerified',
    'federatedSourceProofReceiptAuthenticated',
  ]) literalTrue(record[field], `${field} boundary`);
  for (const field of [
    'trustlessSourceProofVerified',
    'committedVaultTransitionVerified',
    'nativeVerifierExecutionAuthenticated',
    'mintAuthorized',
    'daemonAdmissionAuthorized',
    'transactionMutationEnabled',
    'gate5Closed',
    'productionReadinessVerified',
  ]) literalFalse(record[field], `${field} boundary`);
}

function exactKey(value: unknown, expected: string, label: string): string {
  const actual = byteHex(value, expected.length / 2 - 1, label);
  if (actual !== expected) throw new Error(`${label} differs from the canonical value`);
  return actual;
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const expected = [...fields].sort();
  const actual = Object.keys(record).sort();
  if (expected.length !== actual.length
    || expected.some((field, index) => field !== actual[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
  return record;
}

function requireLiteral(value: unknown, expected: string, label: string): void {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must be true`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must be false`);
  return false;
}

function fixedHex(value: unknown, bytes: number, label: string, nonzero = false): string {
  const normalized = byteHex(value, bytes, label);
  if (nonzero && /^0x0+$/.test(normalized)) throw new Error(`${label} must not be zero`);
  return normalized;
}

function fixedHexBytes(value: unknown, bytes: number, label: string): Buffer {
  return Buffer.from(fixedHex(value, bytes, label).slice(2), 'hex');
}

function byteHex(value: unknown, bytes: number | undefined, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed byte string`);
  }
  if (bytes !== undefined && value.length !== 2 + bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return value;
}

function uint64Decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  if (BigInt(value) > (1n << 64n) - 1n) throw new Error(`${label} exceeds uint64`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
