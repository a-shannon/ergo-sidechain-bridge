import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
  normalizeNativeFinalizedPegInFrontierMintTransitionV1Request,
  type NativeFinalizedPegInFrontierMintTransitionV1Request,
  type NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
} from './native-finalized-peg-in-frontier-mint-transition-v1.js';
import {
  decodePegInConsumedAdmissionV3Hex,
  blake2b256Hex,
} from './peg-in-causal-admission-v2.js';
import {
  derivePegInCausalRuntimeStorageKeysFromRecordKeyV2,
} from './peg-in-causal-runtime-state-v2.js';
import {
  decodePegInRuntimeRecordV1ScaleHex,
  derivePegInRuntimeRecordKeyV1Hex,
} from './peg-in-runtime-state.js';
import { parseStrictJson } from './strict-json.js';

export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-request.v2' as const;
export const PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA =
  'e2s.peg-in-causal-mint-transition-statement.v2' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-verification.v2' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS =
  'NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-causal-mint-transition-result-candidate.v2' as const;
export const NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_RESULT_CANDIDATE' as const;
export const MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES = 64 * 1024 * 1024;

const RESULT_CANDIDATES = new WeakSet<object>();

export interface PegInCausalMintTransitionStatementRequestV2 {
  readonly schema: typeof PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA;
  readonly recordKeyHex: string;
  readonly currentPegInProfileStorageKeyHex: string;
  readonly currentCausalProfileStorageKeyHex: string;
  readonly causalEnforcementStorageKeyHex: string;
  readonly pendingKeysStorageKeyHex: string;
  readonly pendingAdmissionStorageKeyHex: string;
  readonly processedRecordStorageKeyHex: string;
  readonly consumedAdmissionStorageKeyHex: string;
}

export interface NativeFinalizedPegInCausalMintTransitionV2Request {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA;
  readonly mintTransitionRequest: NativeFinalizedPegInFrontierMintTransitionV1Request;
  readonly statement: PegInCausalMintTransitionStatementRequestV2;
}

export interface NativeFinalizedPegInCausalMintTransitionV2ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA;
  readonly reportedSourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly mintTransitionVerification:
    NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate;
  readonly headerBinding: Readonly<{
    parentNativeBlockHashHex: string;
    parentNativeHeight: string;
    parentStateRootHex: string;
    childNativeBlockHashHex: string;
    childNativeHeight: string;
    childStateRootHex: string;
  }>;
  readonly causalTransition: Readonly<{
    recordKeyHex: string;
    causalProfileIdHex: string;
    sourceIntentIdHex: string;
    admissionIdHex: string;
    proofSystemIdHex: string;
    proofProfileIdHex: string;
    processedRecordScaleHex: string;
    consumedAdmissionV3Hex: string;
    parentPendingKeyCount: number;
    postPendingKeyCount: number;
    parentProofNodeCount: number;
    parentProofBytes: number;
    postProofNodeCount: number;
    postProofBytes: number;
  }>;
  readonly boundary: Readonly<{
    candidateOnly: true;
    exactRequestBytesDigestBound: true;
    independentlySuppliedTrustAnchorDigestBound: true;
    nestedT20CResultShapeChecked: true;
    exactParentChildAndCausalSuccessorShapeChecked: true;
    nativeVerifierExecutionAuthenticated: false;
    sidechainFinalityVerified: false;
    directParentChildVerified: false;
    causalPrePostStateVerified: false;
    exactCausalSuccessorVerified: false;
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

export function normalizeNativeFinalizedPegInCausalMintTransitionV2Request(
  value: unknown,
): NativeFinalizedPegInCausalMintTransitionV2Request {
  const record = exactRecord(value, [
    'mintTransitionRequest',
    'schema',
    'statement',
  ], 'native finalized causal peg-in mint-transition V2 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    'native finalized causal peg-in mint-transition V2 request schema',
  );
  const mintTransitionRequest =
    normalizeNativeFinalizedPegInFrontierMintTransitionV1Request(
      record.mintTransitionRequest,
    );
  const statementRecord = exactRecord(record.statement, [
    'causalEnforcementStorageKeyHex',
    'consumedAdmissionStorageKeyHex',
    'currentCausalProfileStorageKeyHex',
    'currentPegInProfileStorageKeyHex',
    'pendingAdmissionStorageKeyHex',
    'pendingKeysStorageKeyHex',
    'processedRecordStorageKeyHex',
    'recordKeyHex',
    'schema',
  ], 'causal peg-in mint-transition V2 statement');
  requireLiteral(
    statementRecord.schema,
    PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
    'causal peg-in mint-transition V2 statement schema',
  );
  const executionStatement = mintTransitionRequest.contractStateRequest
    .eventRequest.executionIdentityRequest.statement;
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionStatement.expectedRecordScaleHex,
  );
  const recordKeyHex = derivePegInRuntimeRecordKeyV1Hex({
    sidechainIdHex: runtimeRecord.sidechainIdHex,
    ergoBoxIdHex: runtimeRecord.ergoBoxIdHex,
  });
  const expectedKeys = derivePegInCausalRuntimeStorageKeysFromRecordKeyV2(recordKeyHex);
  const statement = deepFreeze({
    schema: PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
    recordKeyHex: exactKey(statementRecord.recordKeyHex, expectedKeys.recordKeyHex, 'record key'),
    currentPegInProfileStorageKeyHex: exactKey(
      statementRecord.currentPegInProfileStorageKeyHex,
      expectedKeys.currentPegInProfileStorageKeyHex,
      'current V1 profile storage key',
    ),
    currentCausalProfileStorageKeyHex: exactKey(
      statementRecord.currentCausalProfileStorageKeyHex,
      expectedKeys.currentCausalProfileStorageKeyHex,
      'current causal profile storage key',
    ),
    causalEnforcementStorageKeyHex: exactKey(
      statementRecord.causalEnforcementStorageKeyHex,
      expectedKeys.causalEnforcementStorageKeyHex,
      'causal enforcement storage key',
    ),
    pendingKeysStorageKeyHex: exactKey(
      statementRecord.pendingKeysStorageKeyHex,
      expectedKeys.pendingKeysStorageKeyHex,
      'pending keys storage key',
    ),
    pendingAdmissionStorageKeyHex: exactKey(
      statementRecord.pendingAdmissionStorageKeyHex,
      expectedKeys.pendingAdmissionStorageKeyHex,
      'pending admission storage key',
    ),
    processedRecordStorageKeyHex: exactKey(
      statementRecord.processedRecordStorageKeyHex,
      expectedKeys.processedRecordStorageKeyHex,
      'processed record storage key',
    ),
    consumedAdmissionStorageKeyHex: exactKey(
      statementRecord.consumedAdmissionStorageKeyHex,
      expectedKeys.consumedAdmissionStorageKeyHex,
      'consumed admission storage key',
    ),
  });
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    mintTransitionRequest,
    statement,
  });
  const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (bytes > MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }
  return `0x${Buffer.from(blakejs.blake2b(Buffer.from(requestBytes), undefined, 32)).toString('hex')}`;
}

/** Quarantine one caller-supplied T20E-D report without accepting its proof claims. */
export function buildNativeFinalizedPegInCausalMintTransitionV2ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInCausalMintTransitionV2ResultCandidate {
  if (input.requestBytes.byteLength > MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized causal mint-transition request exceeds ${MAX_NATIVE_CAUSAL_MINT_TRANSITION_REQUEST_BYTES} bytes`,
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
  const request = normalizeNativeFinalizedPegInCausalMintTransitionV2Request(
    parseStrictJson(requestSource, 'native finalized causal mint-transition request bytes'),
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
  ], 'native finalized causal peg-in mint-transition V2 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA,
    'native finalized causal peg-in mint-transition V2 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS,
    'native finalized causal peg-in mint-transition V2 verification status',
  );
  const requestDigestHex = fixedHex(result.requestDigestHex, 32, 'causal request digest');
  if (
    requestDigestHex
    !== deriveNativeFinalizedPegInCausalMintTransitionV2ExactRequestDigestHex(input.requestBytes)
  ) {
    throw new Error('causal mint-transition request digest does not match the exact request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'causal verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error('causal verification does not match the independently supplied trust anchor');
  }
  const mintTransitionVerification =
    buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(request.mintTransitionRequest), 'utf8'),
      trustedAnchorDigestHex,
      verification: result.mintTransitionVerification,
    });
  const headerBinding = normalizeHeaderBinding(result.headerBinding, mintTransitionVerification);
  const causalTransition = normalizeCausalTransition(
    result.causalTransition,
    request,
    mintTransitionVerification,
    headerBinding,
  );
  normalizeVerificationBoundary(result.boundary);

  const candidate = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_RESULT_CANDIDATE_STATUS,
    sourceResultSchema:
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_VERIFICATION_SCHEMA,
    reportedSourceResultStatus:
      NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: resultTrustAnchorDigestHex,
    mintTransitionVerification,
    headerBinding,
    causalTransition,
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      nestedT20CResultShapeChecked: true,
      exactParentChildAndCausalSuccessorShapeChecked: true,
      nativeVerifierExecutionAuthenticated: false,
      sidechainFinalityVerified: false,
      directParentChildVerified: false,
      causalPrePostStateVerified: false,
      exactCausalSuccessorVerified: false,
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

export function assertNativeFinalizedPegInCausalMintTransitionV2ResultCandidateProvenance(
  value: unknown,
): asserts value is NativeFinalizedPegInCausalMintTransitionV2ResultCandidate {
  if (!value || typeof value !== 'object' || !RESULT_CANDIDATES.has(value)) {
    throw new Error('native finalized causal mint-transition candidate provenance is missing');
  }
}

function normalizeHeaderBinding(
  value: unknown,
  mint: NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
): NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['headerBinding'] {
  const record = exactRecord(value, [
    'childNativeBlockHashHex',
    'childNativeHeight',
    'childStateRootHex',
    'directParentChildVerified',
    'parentNativeBlockHashHex',
    'parentNativeHeight',
    'parentStateRootHex',
  ], 'causal parent/child header binding');
  const headerBinding = {
    parentNativeBlockHashHex: fixedHex(record.parentNativeBlockHashHex, 32, 'parent hash'),
    parentNativeHeight: uint64Decimal(record.parentNativeHeight, 'parent height'),
    parentStateRootHex: fixedHex(record.parentStateRootHex, 32, 'parent state root'),
    childNativeBlockHashHex: fixedHex(record.childNativeBlockHashHex, 32, 'child hash'),
    childNativeHeight: uint64Decimal(record.childNativeHeight, 'child height'),
    childStateRootHex: fixedHex(record.childStateRootHex, 32, 'child state root'),
  };
  const childState = mint.contractStateVerification.contractState;
  if (
    headerBinding.parentNativeBlockHashHex !== mint.parentLink.parentNativeBlockHashHex
    || headerBinding.parentNativeHeight !== mint.parentLink.parentNativeHeight
    || headerBinding.parentStateRootHex !== mint.parentLink.parentStateRootHex
    || headerBinding.childNativeBlockHashHex !== mint.parentLink.eventNativeBlockHashHex
    || headerBinding.childNativeHeight !== mint.parentLink.eventNativeHeight
    || headerBinding.childStateRootHex !== childState.stateRootHex
    || BigInt(headerBinding.parentNativeHeight) + 1n !== BigInt(headerBinding.childNativeHeight)
  ) {
    throw new Error('causal header binding differs from the exact nested T20C parent and child');
  }
  literalTrue(record.directParentChildVerified, 'direct parent/child verification');
  return deepFreeze(headerBinding);
}

function normalizeCausalTransition(
  value: unknown,
  request: NativeFinalizedPegInCausalMintTransitionV2Request,
  mint: NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
  header: NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['headerBinding'],
): NativeFinalizedPegInCausalMintTransitionV2ResultCandidate['causalTransition'] {
  const record = exactRecord(value, [
    'admissionIdHex',
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
    'verified',
  ], 'causal state transition');
  const parentProofNodes = request.mintTransitionRequest.parentStateProofNodesHex;
  const postProofNodes = request.mintTransitionRequest.contractStateRequest
    .eventRequest.executionIdentityRequest.runtimeStateProofNodesHex;
  const parentPendingKeyCount = boundedInteger(
    record.parentPendingKeyCount,
    1,
    256,
    'parent pending-key count',
  );
  const postPendingKeyCount = boundedInteger(
    record.postPendingKeyCount,
    0,
    255,
    'post pending-key count',
  );
  if (postPendingKeyCount !== parentPendingKeyCount - 1) {
    throw new Error('causal pending-key counts are not one exact deletion');
  }
  const processedRecordScaleHex = byteHex(
    record.processedRecordScaleHex,
    205,
    'processed record SCALE',
  );
  const nestedRecordScaleHex = request.mintTransitionRequest.contractStateRequest
    .eventRequest.executionIdentityRequest.statement.expectedRecordScaleHex;
  if (processedRecordScaleHex !== nestedRecordScaleHex) {
    throw new Error('causal processed record differs from the exact nested T20C record');
  }
  const recordKeyHex = fixedHex(record.recordKeyHex, 32, 'causal record key');
  if (recordKeyHex !== request.statement.recordKeyHex) {
    throw new Error('causal transition record key differs from the exact request');
  }
  const causalProfileIdHex = fixedHex(record.causalProfileIdHex, 32, 'causal profile ID', true);
  const sourceIntentIdHex = fixedHex(record.sourceIntentIdHex, 32, 'source intent ID', true);
  const admissionIdHex = fixedHex(record.admissionIdHex, 32, 'admission ID', true);
  const proofSystemIdHex = fixedHex(record.proofSystemIdHex, 32, 'proof-system ID', true);
  const proofProfileIdHex = fixedHex(record.proofProfileIdHex, 32, 'proof-profile ID', true);
  const consumedAdmissionV3Hex = byteHex(
    record.consumedAdmissionV3Hex,
    249,
    'consumed admission V3',
  );
  const consumed = decodePegInConsumedAdmissionV3Hex(consumedAdmissionV3Hex);
  const event = mint.contractStateVerification.eventVerification.event;
  const execution = mint.contractStateVerification
    .eventVerification.executionIdentity.execution;
  if (
    consumed.admissionIdHex !== admissionIdHex
    || consumed.sourceIntentIdHex !== sourceIntentIdHex
    || consumed.legacyMintIdentityHex !== recordKeyHex
    || consumed.nativeParentBlockHashHex !== header.parentNativeBlockHashHex
    || String(consumed.nativeMintHeight) !== header.childNativeHeight
    || consumed.executionBlockHashHex !== execution.executionBlockHashHex
    || String(consumed.executionHeight) !== execution.executionHeight
    || consumed.transactionHashHex !== event.transactionHashHex
    || consumed.transactionIndex !== event.transactionIndex
    || consumed.eventIndex !== event.globalEventIndex
    || consumed.processedRecordBlake2b256Hex !== blake2b256Hex(processedRecordScaleHex)
  ) {
    throw new Error('consumed admission V3 differs from the exact T20C execution successor');
  }
  const transition = {
    recordKeyHex,
    causalProfileIdHex,
    sourceIntentIdHex,
    admissionIdHex,
    proofSystemIdHex,
    proofProfileIdHex,
    processedRecordScaleHex,
    consumedAdmissionV3Hex,
    parentPendingKeyCount,
    postPendingKeyCount,
    parentProofNodeCount: exactCount(
      record.parentProofNodeCount,
      parentProofNodes.length,
      'parent proof node count',
    ),
    parentProofBytes: exactCount(
      record.parentProofBytes,
      proofBytes(parentProofNodes),
      'parent proof bytes',
    ),
    postProofNodeCount: exactCount(
      record.postProofNodeCount,
      postProofNodes.length,
      'post proof node count',
    ),
    postProofBytes: exactCount(
      record.postProofBytes,
      proofBytes(postProofNodes),
      'post proof bytes',
    ),
  };
  literalTrue(record.verified, 'causal transition verification');
  return deepFreeze(transition);
}

function normalizeVerificationBoundary(value: unknown): void {
  const record = exactRecord(value, [
    'causalPrePostStateVerified',
    'committedVaultTransitionVerified',
    'daemonAdmissionAuthorized',
    'directParentChildVerified',
    'exactCausalSuccessorVerified',
    'gate5Closed',
    'mintAuthorized',
    'nativeVerifierExecutionAuthenticated',
    'productionReadinessVerified',
    'sidechainFinalityVerified',
    'transactionMutationEnabled',
  ], 'causal verification boundary');
  for (const field of [
    'sidechainFinalityVerified',
    'directParentChildVerified',
    'causalPrePostStateVerified',
    'exactCausalSuccessorVerified',
  ]) {
    literalTrue(record[field], `${field} boundary`);
  }
  for (const field of [
    'committedVaultTransitionVerified',
    'nativeVerifierExecutionAuthenticated',
    'mintAuthorized',
    'daemonAdmissionAuthorized',
    'transactionMutationEnabled',
    'gate5Closed',
    'productionReadinessVerified',
  ]) {
    literalFalse(record[field], `${field} boundary`);
  }
}

function exactKey(value: unknown, expected: string, label: string): string {
  const actual = byteHex(value, expected.length / 2 - 1, label);
  if (actual !== expected) throw new Error(`${label} differs from the canonical storage key`);
  return actual;
}

function proofBytes(values: readonly string[]): number {
  return values.reduce((sum, value) => sum + byteHex(value, undefined, 'proof node').length / 2 - 1, 0);
}

function exactCount(value: unknown, expected: number, label: string): number {
  const actual = boundedInteger(value, 0, Number.MAX_SAFE_INTEGER, label);
  if (actual !== expected) throw new Error(`${label} differs from the exact request`);
  return actual;
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const expected = [...fields].sort();
  const actual = Object.keys(record).sort();
  if (expected.length !== actual.length || expected.some((field, index) => field !== actual[index])) {
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
  const parsed = BigInt(value);
  if (parsed > (1n << 64n) - 1n) throw new Error(`${label} exceeds uint64`);
  return value;
}

function boundedInteger(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value as number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
