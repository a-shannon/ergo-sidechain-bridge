import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
} from './native-finalized-bridge-checkpoint.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS,
  buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
  normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request,
  type NativeFinalizedPegInFrontierExecutionIdentityV1Request,
  type NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX,
  PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  normalizePegInFrontierEventStatementV1,
  type PegInFrontierEventStatementV1,
} from './peg-in-frontier-event-v1.js';

export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-event-request.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-event-verification.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS =
  'NATIVE_PEG_IN_FRONTIER_EVENT_VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-event-result-candidate.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_FRONTIER_EVENT_RESULT_CANDIDATE' as const;

export const MAX_FRONTIER_CURRENT_RECEIPTS_V1_SCALE_BYTES = 8 * 1024 * 1024;
export const MAX_FRONTIER_CURRENT_TRANSACTION_STATUSES_V1_SCALE_BYTES = 8 * 1024 * 1024;

export interface NativeFinalizedPegInFrontierEventV1Request {
  readonly schema: typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA;
  readonly executionIdentityRequest:
    NativeFinalizedPegInFrontierExecutionIdentityV1Request;
  readonly statement: PegInFrontierEventStatementV1;
}

interface FrontierReceiptStateVerificationPayload {
  readonly currentReceiptsStorageKeyHex:
    typeof SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX;
  readonly currentReceiptsScaleSha256Hex: string;
  readonly currentReceiptsScaleBytes: string;
  readonly currentTransactionStatusesStorageKeyHex:
    typeof SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX;
  readonly currentTransactionStatusesScaleSha256Hex: string;
  readonly currentTransactionStatusesScaleBytes: string;
  readonly receiptsRootHex: string;
  readonly receiptCount: number;
  readonly transactionStatusCount: number;
  readonly proofNodeCount: number;
  readonly proofBytes: number;
  readonly verified: true;
}

export interface FrontierPegInEventV1Output {
  readonly transactionHashHex: string;
  readonly transactionIndex: number;
  readonly transactionLogIndex: number;
  readonly globalEventIndex: number;
  readonly receiptType: 'legacy' | 'eip2930' | 'eip1559';
  readonly receiptStatusCode: 1;
  readonly bridgeAddressHex: string;
  readonly eventSignatureTopicHex: typeof FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX;
  readonly recipientHex: string;
  readonly amountNanoErg: string;
  readonly ergoBoxIdHex: string;
}

export interface NativeFinalizedPegInFrontierEventV1ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_VERIFICATION_SCHEMA;
  readonly reportedSourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly executionIdentity: Omit<
    NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
    'sourceResultStatus'
  >;
  readonly receiptState: Omit<FrontierReceiptStateVerificationPayload, 'verified'>;
  readonly event: FrontierPegInEventV1Output;
  readonly boundary: {
    readonly candidateOnly: true;
    readonly exactRequestBytesDigestBound: true;
    readonly independentlySuppliedTrustAnchorDigestBound: true;
    readonly verifierResultClaimShapeChecked: true;
    readonly verifierExecutionAuthenticated: false;
    readonly sidechainFinalityVerified: false;
    readonly executionIdentityVerified: false;
    readonly receiptStateProofVerified: false;
    readonly receiptsRootRecomputed: false;
    readonly transactionStatusVerified: false;
    readonly successfulReceiptVerified: false;
    readonly depositEventSemanticsVerified: false;
    readonly evmCodeStateVerified: false;
    readonly evmStorageStateVerified: false;
    readonly runtimeBuildAttestationVerified: false;
    readonly runtimeCodeIdentityVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export function normalizeNativeFinalizedPegInFrontierEventV1Request(
  value: unknown,
): NativeFinalizedPegInFrontierEventV1Request {
  const record = exactRecord(
    value,
    ['executionIdentityRequest', 'schema', 'statement'],
    'native finalized peg-in Frontier event V1 request',
  );
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    'native finalized peg-in Frontier event V1 request schema',
  );
  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
      record.executionIdentityRequest,
    );
  const statement = normalizePegInFrontierEventStatementV1(record.statement);
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement,
  });
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier event V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

/** Derive the Rust-compatible identity of the exact outer request bytes consumed. */
export function deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier event V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return blake2b256Hex(Buffer.from(requestBytes));
}

/**
 * Bind one reported offline-verifier result into a non-authoritative candidate.
 *
 * The Rust report is shape-checked and cross-bound to the exact request, nested execution identity,
 * receipt/status state, and event. This function does not execute or authenticate the Rust binary,
 * so every cryptographic `true` is deliberately stripped from the returned candidate.
 */
export function buildNativeFinalizedPegInFrontierEventV1ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInFrontierEventV1ResultCandidate {
  if (input.requestBytes.byteLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier event V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  let decodedRequest: unknown;
  try {
    decodedRequest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes),
    );
  } catch (error) {
    throw new Error(
      'native finalized peg-in Frontier event V1 request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const request = normalizeNativeFinalizedPegInFrontierEventV1Request(decodedRequest);
  const trustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied Frontier event trust anchor digest',
  );

  const result = exactRecord(input.verification, [
    'boundary',
    'event',
    'executionIdentity',
    'receiptState',
    'requestDigestHex',
    'schema',
    'status',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in Frontier event V1 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_VERIFICATION_SCHEMA,
    'native finalized peg-in Frontier event V1 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
    'native finalized peg-in Frontier event V1 verification status',
  );
  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'Frontier event request digest',
  );
  if (
    requestDigestHex
    !== deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(input.requestBytes)
  ) {
    throw new Error('Frontier event request digest does not match the exact request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'Frontier event verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error(
      'Frontier event verification does not match the independently supplied trust anchor',
    );
  }

  const nestedRequestBytes = Buffer.from(
    JSON.stringify(request.executionIdentityRequest),
    'utf8',
  );
  const projectedExecutionIdentity = exactRecord(result.executionIdentity, [
    'authority',
    'boundary',
    'execution',
    'finality',
    'record',
    'requestDigestHex',
    'runtimeState',
    'schema',
    'target',
    'trustAnchorDigestHex',
  ], 'status-free Frontier execution identity projection');
  // Reuse the unchanged V1 payload validator without accepting or re-exporting its historical
  // reviewed-root status. The outer Rust report and returned candidate both omit that field.
  const validatedExecutionIdentity =
    buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate({
      requestBytes: nestedRequestBytes,
      trustedAnchorDigestHex,
      verification: {
        ...projectedExecutionIdentity,
        status: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS,
      },
    });
  const receiptState = normalizeReceiptState(
    result.receiptState,
    request,
    validatedExecutionIdentity,
  );
  const event = normalizeEvent(result.event, validatedExecutionIdentity);
  normalizeVerificationBoundary(result.boundary);

  const { verified: _verified, ...candidateReceiptState } = receiptState;
  const {
    sourceResultStatus: _nestedSourceResultStatus,
    ...executionIdentity
  } = validatedExecutionIdentity;
  return deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_RESULT_CANDIDATE_STATUS,
    sourceResultSchema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_VERIFICATION_SCHEMA,
    reportedSourceResultStatus: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: trustedAnchorDigestHex,
    executionIdentity,
    receiptState: candidateReceiptState,
    event,
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      verifierResultClaimShapeChecked: true,
      verifierExecutionAuthenticated: false,
      sidechainFinalityVerified: false,
      executionIdentityVerified: false,
      receiptStateProofVerified: false,
      receiptsRootRecomputed: false,
      transactionStatusVerified: false,
      successfulReceiptVerified: false,
      depositEventSemanticsVerified: false,
      evmCodeStateVerified: false,
      evmStorageStateVerified: false,
      runtimeBuildAttestationVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    },
  });
}

function normalizeReceiptState(
  value: unknown,
  request: NativeFinalizedPegInFrontierEventV1Request,
  executionIdentity: NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
): FrontierReceiptStateVerificationPayload {
  const state = exactRecord(value, [
    'currentReceiptsScaleBytes',
    'currentReceiptsScaleSha256Hex',
    'currentReceiptsStorageKeyHex',
    'currentTransactionStatusesScaleBytes',
    'currentTransactionStatusesScaleSha256Hex',
    'currentTransactionStatusesStorageKeyHex',
    'proofBytes',
    'proofNodeCount',
    'receiptCount',
    'receiptsRootHex',
    'transactionStatusCount',
    'verified',
  ], 'Frontier receipt/status state');
  requireLiteral(
    state.currentReceiptsStorageKeyHex,
    request.statement.currentReceiptsStorageKeyHex,
    'Frontier CurrentReceipts storage key',
  );
  requireLiteral(
    state.currentTransactionStatusesStorageKeyHex,
    request.statement.currentTransactionStatusesStorageKeyHex,
    'Frontier CurrentTransactionStatuses storage key',
  );
  const receiptCount = positiveBoundedInteger(state.receiptCount, 'Frontier receipt count');
  const transactionStatusCount = positiveBoundedInteger(
    state.transactionStatusCount,
    'Frontier transaction-status count',
  );
  if (
    receiptCount !== executionIdentity.execution.transactionCount
    || transactionStatusCount !== receiptCount
  ) {
    throw new Error('Frontier receipt/status counts differ from the authenticated block');
  }
  const proofNodeCount = boundedInteger(
    state.proofNodeCount,
    request.executionIdentityRequest.runtimeStateProofNodesHex.length,
    'Frontier event proof-node count',
  );
  if (proofNodeCount !== request.executionIdentityRequest.runtimeStateProofNodesHex.length) {
    throw new Error('Frontier event proof-node count differs from the request');
  }
  const expectedProofBytes = request.executionIdentityRequest.runtimeStateProofNodesHex.reduce(
    (total, node) => total + (node.length - 2) / 2,
    0,
  );
  const proofBytes = boundedInteger(
    state.proofBytes,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
    'Frontier event proof byte count',
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error('Frontier event proof byte count differs from the request');
  }
  literalTrue(state.verified, 'Frontier receipt/status verification');
  return {
    currentReceiptsStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    currentReceiptsScaleSha256Hex: fixedHex(
      state.currentReceiptsScaleSha256Hex,
      32,
      'Frontier CurrentReceipts SCALE SHA-256',
    ),
    currentReceiptsScaleBytes: positiveBoundedDecimal(
      state.currentReceiptsScaleBytes,
      MAX_FRONTIER_CURRENT_RECEIPTS_V1_SCALE_BYTES,
      'Frontier CurrentReceipts SCALE size',
    ),
    currentTransactionStatusesStorageKeyHex:
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    currentTransactionStatusesScaleSha256Hex: fixedHex(
      state.currentTransactionStatusesScaleSha256Hex,
      32,
      'Frontier CurrentTransactionStatuses SCALE SHA-256',
    ),
    currentTransactionStatusesScaleBytes: positiveBoundedDecimal(
      state.currentTransactionStatusesScaleBytes,
      MAX_FRONTIER_CURRENT_TRANSACTION_STATUSES_V1_SCALE_BYTES,
      'Frontier CurrentTransactionStatuses SCALE size',
    ),
    receiptsRootHex: fixedHex(state.receiptsRootHex, 32, 'Frontier receipts root'),
    receiptCount,
    transactionStatusCount,
    proofNodeCount,
    proofBytes,
    verified: true,
  };
}

function normalizeEvent(
  value: unknown,
  executionIdentity: NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate,
): FrontierPegInEventV1Output {
  const event = exactRecord(value, [
    'amountNanoErg',
    'bridgeAddressHex',
    'ergoBoxIdHex',
    'eventSignatureTopicHex',
    'globalEventIndex',
    'receiptStatusCode',
    'receiptType',
    'recipientHex',
    'transactionHashHex',
    'transactionIndex',
    'transactionLogIndex',
  ], 'Frontier PegIn event');
  const transactionHashHex = fixedHex(
    event.transactionHashHex,
    32,
    'Frontier event transaction hash',
  );
  if (transactionHashHex !== executionIdentity.record.transactionHashHex) {
    throw new Error('Frontier event transaction hash differs from the processed record');
  }
  const transactionIndex = boundedInteger(
    event.transactionIndex,
    executionIdentity.execution.transactionCount - 1,
    'Frontier event transaction index',
  );
  if (transactionIndex !== executionIdentity.execution.recordTransactionIndex) {
    throw new Error('Frontier event transaction index differs from the authenticated block');
  }
  const globalEventIndex = boundedInteger(
    event.globalEventIndex,
    0xffff_ffff,
    'Frontier global event index',
  );
  if (globalEventIndex !== executionIdentity.record.eventIndex) {
    throw new Error('Frontier global event index differs from the processed record');
  }
  const bridgeAddressHex = fixedHex(event.bridgeAddressHex, 20, 'Frontier bridge address');
  const recipientHex = fixedHex(event.recipientHex, 20, 'Frontier event recipient');
  const amountNanoErg = positiveErgoLongDecimal(event.amountNanoErg, 'Frontier event amount');
  const ergoBoxIdHex = fixedHex(event.ergoBoxIdHex, 32, 'Frontier event Ergo box ID');
  if (
    bridgeAddressHex !== executionIdentity.record.bridgeAddressHex
    || recipientHex !== executionIdentity.record.recipientHex
    || amountNanoErg !== executionIdentity.record.amountNanoErg
    || ergoBoxIdHex !== executionIdentity.record.ergoBoxIdHex
  ) {
    throw new Error('Frontier event fields differ from the processed record');
  }
  if (!['legacy', 'eip2930', 'eip1559'].includes(event.receiptType as string)) {
    throw new Error('Frontier event receipt type is unsupported');
  }
  requireLiteral(event.receiptStatusCode, 1, 'Frontier event receipt status');
  requireLiteral(
    event.eventSignatureTopicHex,
    FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX,
    'Frontier PegIn event signature topic',
  );
  return {
    transactionHashHex,
    transactionIndex,
    transactionLogIndex: boundedInteger(
      event.transactionLogIndex,
      globalEventIndex,
      'Frontier transaction log index',
    ),
    globalEventIndex,
    receiptType: event.receiptType as FrontierPegInEventV1Output['receiptType'],
    receiptStatusCode: 1,
    bridgeAddressHex,
    eventSignatureTopicHex: FRONTIER_PEG_IN_EVENT_SIGNATURE_TOPIC_HEX,
    recipientHex,
    amountNanoErg,
    ergoBoxIdHex,
  };
}

function normalizeVerificationBoundary(value: unknown): void {
  const boundary = exactRecord(value, [
    'committedVaultTransitionVerified',
    'depositEventSemanticsVerified',
    'evmCodeStateVerified',
    'evmStorageStateVerified',
    'executionIdentityVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'productionReadinessVerified',
    'receiptStateProofVerified',
    'receiptsRootRecomputed',
    'runtimeBuildAttestationVerified',
    'runtimeCodeIdentityVerified',
    'sidechainFinalityVerified',
    'successfulReceiptVerified',
    'transactionMutationEnabled',
    'transactionStatusVerified',
  ], 'Frontier event verification claim boundary');
  for (const [field, label] of [
    ['sidechainFinalityVerified', 'sidechain finality'],
    ['executionIdentityVerified', 'execution identity'],
    ['receiptStateProofVerified', 'receipt-state proof'],
    ['receiptsRootRecomputed', 'receipts-root recomputation'],
    ['transactionStatusVerified', 'transaction status'],
    ['successfulReceiptVerified', 'successful receipt'],
    ['depositEventSemanticsVerified', 'deposit-event semantics'],
  ] as const) {
    literalTrue(boundary[field], `${label} boundary`);
  }
  for (const [field, label] of [
    ['evmCodeStateVerified', 'EVM code-state'],
    ['evmStorageStateVerified', 'EVM storage-state'],
    ['runtimeBuildAttestationVerified', 'runtime build-attestation'],
    ['runtimeCodeIdentityVerified', 'runtime-code identity'],
    ['committedVaultTransitionVerified', 'committed-vault transition'],
    ['historicalMintAbsenceVerified', 'historical mint absence'],
    ['mintAuthorized', 'mint authorization'],
    ['transactionMutationEnabled', 'transaction mutation'],
    ['gate5Closed', 'Gate 5'],
    ['productionReadinessVerified', 'production readiness'],
  ] as const) {
    literalFalse(boundary[field], `${label} boundary`);
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function positiveBoundedDecimal(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  if (BigInt(value) > BigInt(max)) throw new Error(`${label} exceeds ${max} bytes`);
  return value;
}

function positiveErgoLongDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  if (BigInt(value) > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds the positive Ergo Long domain`);
  }
  return value;
}

function boundedInteger(value: unknown, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
}

function positiveBoundedInteger(value: unknown, label: string): number {
  const normalized = boundedInteger(value, Number.MAX_SAFE_INTEGER, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must remain true`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function blake2b256Hex(value: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
