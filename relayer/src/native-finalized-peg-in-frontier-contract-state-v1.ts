import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import { MAX_NATIVE_VERIFIER_REQUEST_BYTES } from './native-finalized-bridge-checkpoint.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
  buildNativeFinalizedPegInFrontierEventV1ResultCandidate,
  normalizeNativeFinalizedPegInFrontierEventV1Request,
  type NativeFinalizedPegInFrontierEventV1Request,
  type NativeFinalizedPegInFrontierEventV1ResultCandidate,
} from './native-finalized-peg-in-frontier-event-v1.js';
import {
  MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
  normalizePegInFrontierContractStateStatementV1,
  type PegInFrontierContractStateStatementV1,
} from './peg-in-frontier-contract-state-v1.js';

export const NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-contract-state-request.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-contract-state-verification.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS =
  'NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-contract-state-result-candidate.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_RESULT_CANDIDATE' as const;

const RESULT_CANDIDATES = new WeakSet<object>();

export interface NativeFinalizedPegInFrontierContractStateV1Request {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA;
  readonly eventRequest: NativeFinalizedPegInFrontierEventV1Request;
  readonly statement: PegInFrontierContractStateStatementV1;
}

export interface FrontierPegInContractStateV1Output {
  readonly stateRootHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeAccountCodeStorageKeyHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: string;
  readonly tokenAccountCodeStorageKeyHex: string;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: string;
  readonly bridgeOwnerStorageKeyHex: string;
  readonly bridgeOwnerAddressHex: string;
  readonly bridgeConfigurationStorageKeyHex: string;
  readonly bridgeTokenAddressHex: string;
  readonly bridgePaused: boolean;
  readonly processedPegInStorageKeyHex: string;
  readonly processedPegIn: true;
  readonly tokenTotalSupplyStorageKeyHex: string;
  readonly tokenTotalSupply: string;
  readonly tokenOwnerStorageKeyHex: string;
  readonly tokenOwnerAddressHex: string;
  readonly proofNodeCount: number;
  readonly proofBytes: number;
  readonly verified: true;
}

export interface NativeFinalizedPegInFrontierContractStateV1ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA;
  readonly reportedSourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly eventVerification: NativeFinalizedPegInFrontierEventV1ResultCandidate;
  readonly contractState: Omit<FrontierPegInContractStateV1Output, 'verified'>;
  readonly boundary: {
    readonly candidateOnly: true;
    readonly exactRequestBytesDigestBound: true;
    readonly independentlySuppliedTrustAnchorDigestBound: true;
    readonly verifierResultClaimShapeChecked: true;
    readonly verifierExecutionAuthenticated: false;
    readonly daemonAdmissionAuthorized: false;
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
    readonly runtimeUpgradeHistoryVerified: false;
    readonly historicalCodeContinuityVerified: false;
    readonly historicalReceiptStateProofCompletenessVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly mintAuthorized: false;
    readonly settlementAuthorized: false;
    readonly reconciliationHoldReleaseAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export function normalizeNativeFinalizedPegInFrontierContractStateV1Request(
  value: unknown,
): NativeFinalizedPegInFrontierContractStateV1Request {
  const record = exactRecord(
    value,
    ['eventRequest', 'schema', 'statement'],
    'native finalized peg-in Frontier contract-state V1 request',
  );
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    'native finalized peg-in Frontier contract-state V1 request schema',
  );
  const eventRequest = normalizeNativeFinalizedPegInFrontierEventV1Request(
    record.eventRequest,
  );
  const statement = normalizePegInFrontierContractStateStatementV1(
    record.statement,
    eventRequest.executionIdentityRequest.statement.ergoBoxIdHex,
  );
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest,
    statement,
  });
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier contract-state V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier contract-state V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return blake2b256Hex(Buffer.from(requestBytes));
}

/**
 * Quarantine one caller-supplied Rust report as a non-authorizing candidate.
 *
 * This validates exact cross-layer identities but does not authenticate execution of the native
 * verifier. Every proof, finality, funds, lifecycle, signer, submitter, and broadcast claim is
 * therefore stripped from the returned candidate.
 */
export function buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInFrontierContractStateV1ResultCandidate {
  let decodedRequest: unknown;
  try {
    decodedRequest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes),
    );
  } catch (error) {
    throw new Error(
      'native finalized peg-in Frontier contract-state V1 request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request(decodedRequest);
  const trustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied Frontier contract-state trust anchor digest',
  );
  const result = exactRecord(input.verification, [
    'boundary',
    'contractState',
    'eventVerification',
    'requestDigestHex',
    'schema',
    'status',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in Frontier contract-state V1 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA,
    'native finalized peg-in Frontier contract-state V1 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
    'native finalized peg-in Frontier contract-state V1 verification status',
  );
  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'Frontier contract-state request digest',
  );
  if (
    requestDigestHex
    !== deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(input.requestBytes)
  ) {
    throw new Error('Frontier contract-state request digest does not match the exact request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'Frontier contract-state verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error(
      'Frontier contract-state verification does not match the independently supplied trust anchor',
    );
  }

  const projectedEvent = exactRecord(result.eventVerification, [
    'boundary',
    'event',
    'executionIdentity',
    'receiptState',
    'requestDigestHex',
    'schema',
    'trustAnchorDigestHex',
  ], 'status-free Frontier event verification projection');
  const eventVerification = buildNativeFinalizedPegInFrontierEventV1ResultCandidate({
    requestBytes: Buffer.from(JSON.stringify(request.eventRequest), 'utf8'),
    trustedAnchorDigestHex,
    verification: {
      ...projectedEvent,
      status: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_STATUS,
    },
  });
  const contractState = normalizeContractState(
    result.contractState,
    request,
    eventVerification,
  );
  normalizeVerificationBoundary(result.boundary);
  const { verified: _verified, ...candidateContractState } = contractState;

  const candidate: NativeFinalizedPegInFrontierContractStateV1ResultCandidate = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_RESULT_CANDIDATE_STATUS,
    sourceResultSchema:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA,
    reportedSourceResultStatus: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: trustedAnchorDigestHex,
    eventVerification,
    contractState: candidateContractState,
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      verifierResultClaimShapeChecked: true,
      verifierExecutionAuthenticated: false,
      daemonAdmissionAuthorized: false,
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
      runtimeUpgradeHistoryVerified: false,
      historicalCodeContinuityVerified: false,
      historicalReceiptStateProofCompletenessVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      settlementAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    },
  });
  RESULT_CANDIDATES.add(candidate);
  return candidate;
}

export function assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance(
  value: unknown,
): asserts value is NativeFinalizedPegInFrontierContractStateV1ResultCandidate {
  if (!value || typeof value !== 'object' || !RESULT_CANDIDATES.has(value)) {
    throw new Error('native finalized Frontier contract-state candidate provenance is missing');
  }
}

function normalizeContractState(
  value: unknown,
  request: NativeFinalizedPegInFrontierContractStateV1Request,
  eventVerification: NativeFinalizedPegInFrontierEventV1ResultCandidate,
): FrontierPegInContractStateV1Output {
  const state = exactRecord(value, [
    'bridgeAccountCodeStorageKeyHex',
    'bridgeAddressHex',
    'bridgeConfigurationStorageKeyHex',
    'bridgeOwnerAddressHex',
    'bridgeOwnerStorageKeyHex',
    'bridgePaused',
    'bridgeRuntimeCodeBytes',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeTokenAddressHex',
    'processedPegIn',
    'processedPegInStorageKeyHex',
    'proofBytes',
    'proofNodeCount',
    'stateRootHex',
    'tokenAccountCodeStorageKeyHex',
    'tokenAddressHex',
    'tokenOwnerAddressHex',
    'tokenOwnerStorageKeyHex',
    'tokenRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenTotalSupply',
    'tokenTotalSupplyStorageKeyHex',
    'verified',
  ], 'Frontier peg-in contract state');
  const statement = request.statement;
  const stateRootHex = fixedHex(state.stateRootHex, 32, 'Frontier contract-state root');
  if (stateRootHex !== eventVerification.executionIdentity.target.stateRootHex) {
    throw new Error('Frontier contract state does not share the authenticated event state root');
  }
  const bridgeAddressHex = fixedHex(state.bridgeAddressHex, 20, 'Frontier bridge address');
  const tokenAddressHex = fixedHex(state.tokenAddressHex, 20, 'Frontier token address');
  if (
    bridgeAddressHex !== statement.bridgeAddressHex
    || bridgeAddressHex !== eventVerification.event.bridgeAddressHex
  ) {
    throw new Error('Frontier contract-state bridge differs from the authenticated event');
  }
  if (tokenAddressHex !== statement.tokenAddressHex) {
    throw new Error('Frontier contract-state token differs from the request');
  }
  const bridgeRuntimeCodeBytes = positiveBoundedDecimal(
    state.bridgeRuntimeCodeBytes,
    MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
    'Frontier bridge runtime-code byte count',
  );
  const tokenRuntimeCodeBytes = positiveBoundedDecimal(
    state.tokenRuntimeCodeBytes,
    MAX_FRONTIER_EVM_RUNTIME_CODE_V1_BYTES,
    'Frontier token runtime-code byte count',
  );
  const bridgeRuntimeCodeSha256Hex = fixedHex(
    state.bridgeRuntimeCodeSha256Hex,
    32,
    'Frontier bridge runtime-code SHA-256',
  );
  const tokenRuntimeCodeSha256Hex = fixedHex(
    state.tokenRuntimeCodeSha256Hex,
    32,
    'Frontier token runtime-code SHA-256',
  );
  if (
    bridgeRuntimeCodeBytes !== statement.bridgeRuntimeCodeBytes
    || bridgeRuntimeCodeSha256Hex !== statement.bridgeRuntimeCodeSha256Hex
    || tokenRuntimeCodeBytes !== statement.tokenRuntimeCodeBytes
    || tokenRuntimeCodeSha256Hex !== statement.tokenRuntimeCodeSha256Hex
  ) {
    throw new Error('Frontier authenticated runtime-code identity differs from the request');
  }
  for (const field of [
    'bridgeAccountCodeStorageKeyHex',
    'tokenAccountCodeStorageKeyHex',
    'bridgeOwnerStorageKeyHex',
    'bridgeConfigurationStorageKeyHex',
    'processedPegInStorageKeyHex',
    'tokenTotalSupplyStorageKeyHex',
    'tokenOwnerStorageKeyHex',
  ] as const) {
    requireLiteral(state[field], statement[field], `Frontier contract-state ${field}`);
  }
  const bridgeOwnerAddressHex = fixedHex(
    state.bridgeOwnerAddressHex,
    20,
    'Frontier bridge owner',
  );
  const bridgeTokenAddressHex = fixedHex(
    state.bridgeTokenAddressHex,
    20,
    'Frontier bridge token binding',
  );
  if (bridgeTokenAddressHex !== tokenAddressHex) {
    throw new Error('Frontier bridge token binding differs from the authenticated token');
  }
  if (typeof state.bridgePaused !== 'boolean') {
    throw new Error('Frontier bridge paused state must be boolean');
  }
  literalTrue(state.processedPegIn, 'Frontier processed peg-in replay state');
  const tokenTotalSupply = uint256Decimal(state.tokenTotalSupply, 'Frontier token total supply');
  const tokenOwnerAddressHex = fixedHex(
    state.tokenOwnerAddressHex,
    20,
    'Frontier token owner',
  );
  if (tokenOwnerAddressHex !== bridgeAddressHex) {
    throw new Error('Frontier token owner differs from the authenticated bridge');
  }
  const proofNodeCount = boundedInteger(
    state.proofNodeCount,
    request.eventRequest.executionIdentityRequest.runtimeStateProofNodesHex.length,
    'Frontier contract-state proof-node count',
  );
  if (
    proofNodeCount
    !== request.eventRequest.executionIdentityRequest.runtimeStateProofNodesHex.length
  ) {
    throw new Error('Frontier contract-state proof-node count differs from the request');
  }
  const expectedProofBytes =
    request.eventRequest.executionIdentityRequest.runtimeStateProofNodesHex.reduce(
      (total, node) => total + (node.length - 2) / 2,
      0,
    );
  const proofBytes = boundedInteger(
    state.proofBytes,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
    'Frontier contract-state proof byte count',
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error('Frontier contract-state proof byte count differs from the request');
  }
  literalTrue(state.verified, 'Frontier contract-state verification');

  return {
    stateRootHex,
    bridgeAddressHex,
    tokenAddressHex,
    bridgeAccountCodeStorageKeyHex: statement.bridgeAccountCodeStorageKeyHex,
    bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes,
    tokenAccountCodeStorageKeyHex: statement.tokenAccountCodeStorageKeyHex,
    tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes,
    bridgeOwnerStorageKeyHex: statement.bridgeOwnerStorageKeyHex,
    bridgeOwnerAddressHex,
    bridgeConfigurationStorageKeyHex: statement.bridgeConfigurationStorageKeyHex,
    bridgeTokenAddressHex,
    bridgePaused: state.bridgePaused,
    processedPegInStorageKeyHex: statement.processedPegInStorageKeyHex,
    processedPegIn: true,
    tokenTotalSupplyStorageKeyHex: statement.tokenTotalSupplyStorageKeyHex,
    tokenTotalSupply,
    tokenOwnerStorageKeyHex: statement.tokenOwnerStorageKeyHex,
    tokenOwnerAddressHex,
    proofNodeCount,
    proofBytes,
    verified: true,
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
    'nativeVerifierExecutionAuthenticated',
    'productionReadinessVerified',
    'receiptStateProofVerified',
    'receiptsRootRecomputed',
    'runtimeBuildAttestationVerified',
    'runtimeCodeIdentityVerified',
    'daemonAdmissionAuthorized',
    'sidechainFinalityVerified',
    'successfulReceiptVerified',
    'transactionMutationEnabled',
    'transactionStatusVerified',
  ], 'Frontier contract-state verification claim boundary');
  for (const field of [
    'sidechainFinalityVerified',
    'executionIdentityVerified',
    'receiptStateProofVerified',
    'receiptsRootRecomputed',
    'transactionStatusVerified',
    'successfulReceiptVerified',
    'depositEventSemanticsVerified',
    'evmCodeStateVerified',
    'evmStorageStateVerified',
  ] as const) {
    literalTrue(boundary[field], `Frontier contract-state ${field} boundary`);
  }
  for (const field of [
    'runtimeBuildAttestationVerified',
    'runtimeCodeIdentityVerified',
    'committedVaultTransitionVerified',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'nativeVerifierExecutionAuthenticated',
    'daemonAdmissionAuthorized',
    'transactionMutationEnabled',
    'gate5Closed',
    'productionReadinessVerified',
  ] as const) {
    literalFalse(boundary[field], `Frontier contract-state ${field} boundary`);
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
  if (BigInt(value) > BigInt(max)) throw new Error(`${label} exceeds ${max}`);
  return value;
}

function uint256Decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint256 decimal string`);
  }
  if (BigInt(value) > (1n << 256n) - 1n) throw new Error(`${label} exceeds uint256`);
  return value;
}

function boundedInteger(value: unknown, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
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
