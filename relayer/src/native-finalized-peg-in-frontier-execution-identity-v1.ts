import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  deriveNativeGrandpaTrustAnchorDigestHex,
  normalizeNativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointRequest,
} from './native-finalized-bridge-checkpoint.js';
import {
  NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA,
  PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
  normalizeNativeFinalizedPegInStateRequest,
  validateNativeFinalizedPegInStatePayloadBindings,
} from './native-finalized-peg-in-state.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import {
  PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
  normalizePegInFrontierExecutionIdentityStatementV1,
  type PegInFrontierExecutionIdentityStatementV1,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';

export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-execution-identity-request.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-execution-identity-verification.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS =
  'NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-execution-identity-result-candidate.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_RESULT_CANDIDATE' as const;

export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES = 512;
export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES = 8 * 1024 * 1024;
export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES = 12 * 1024 * 1024;
export const MAX_FRONTIER_CURRENT_BLOCK_V1_SCALE_BYTES = 8 * 1024 * 1024;

const FINALITY_SENTINEL_PROOF_NODE_HEX = '0x00';

export interface NativeFinalizedPegInFrontierExecutionIdentityV1Request {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA;
  readonly trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  readonly targetNativeBlockHashHex: string;
  readonly targetHeaderScaleHex: string;
  readonly linkedGrandpaProofs: NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'];
  readonly checkpointTailHeadersScaleHex: readonly string[];
  readonly finalityProofScaleHex: string;
  readonly statement: PegInFrontierExecutionIdentityStatementV1;
  readonly runtimeStateProofNodesHex: readonly string[];
}

interface NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_VERIFICATION_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly target: {
    readonly nativeBlockHashHex: string;
    readonly nativeHeight: string;
    readonly stateRootHex: string;
  };
  readonly authority: {
    readonly finalitySigningSetId: string;
    readonly finalitySigningAuthorityListScaleHex: string;
    readonly finalitySigningAuthoritySetHashHex: string;
    readonly transitionCount: number;
    readonly linkedAncestryVerified: true;
  };
  readonly finality: {
    readonly horizonHashHex: string;
    readonly horizonHeight: string;
    readonly canonicalJustificationScaleHex: string;
    readonly verified: true;
  };
  readonly runtimeState: {
    readonly runtimeCodeStorageKeyHex: typeof SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeSizeBytes: string;
    readonly buildAttestationId: string;
    readonly buildAttestationSha256Hex: string;
    readonly currentBlockStorageKeyHex:
      typeof SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX;
    readonly currentBlockScaleSha256Hex: string;
    readonly currentBlockScaleBytes: string;
    readonly recordStorageKeyHex: string;
    readonly recordStorageValueScaleHex: string;
    readonly proofNodeCount: number;
    readonly proofBytes: number;
    readonly verified: true;
  };
  readonly record: {
    readonly formatVersion: 1;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly profileRevision: string;
    readonly profileActivationHeight: string;
    readonly ergoBoxIdHex: string;
    readonly recipientHex: string;
    readonly amountNanoErg: string;
    readonly sidechainHeight: string;
    readonly executionBlockHashHex: string;
    readonly transactionHashHex: string;
    readonly eventIndex: number;
  };
  readonly execution: {
    readonly executionBlockHashHex: string;
    readonly executionHeight: string;
    readonly evmStateRootHex: string;
    readonly transactionRootHex: string;
    readonly ommersHashHex: string;
    readonly transactionCount: number;
    readonly ommerCount: number;
    readonly recordTransactionHashHex: string;
    readonly recordTransactionIndex: number;
  };
  readonly boundary: {
    readonly sidechainFinalityVerified: true;
    readonly runtimeCodeStateProofVerified: true;
    readonly currentBlockStateProofVerified: true;
    readonly processedRecordStateProofVerified: true;
    readonly executionBlockHashMappedToNativeState: true;
    readonly transactionRootRecomputed: true;
    readonly ommersHashRecomputed: true;
    readonly recordTransactionBoundExactlyOnce: true;
    readonly receiptInclusionVerified: false;
    readonly transactionStatusVerified: false;
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

export interface NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_VERIFICATION_SCHEMA;
  readonly sourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly target: NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['target'];
  readonly authority: Omit<
    NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['authority'],
    'linkedAncestryVerified'
  >;
  readonly finality: Omit<
    NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['finality'],
    'verified'
  >;
  readonly runtimeState: Omit<
    NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['runtimeState'],
    'verified'
  >;
  readonly record: NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['record'];
  readonly execution:
    NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['execution'];
  readonly boundary: {
    readonly candidateOnly: true;
    readonly exactRequestBytesDigestBound: true;
    readonly independentlySuppliedTrustAnchorDigestBound: true;
    readonly verifierResultClaimShapeChecked: true;
    readonly verifierExecutionAuthenticated: false;
    readonly sidechainFinalityVerified: false;
    readonly runtimeCodeStateProofVerified: false;
    readonly currentBlockStateProofVerified: false;
    readonly processedRecordStateProofVerified: false;
    readonly executionBlockHashMappedToNativeState: false;
    readonly transactionRootRecomputed: false;
    readonly ommersHashRecomputed: false;
    readonly recordTransactionBoundExactlyOnce: false;
    readonly receiptInclusionVerified: false;
    readonly transactionStatusVerified: false;
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

export function normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
  value: unknown,
): NativeFinalizedPegInFrontierExecutionIdentityV1Request {
  const record = exactRecord(value, [
    'checkpointTailHeadersScaleHex',
    'finalityProofScaleHex',
    'linkedGrandpaProofs',
    'runtimeStateProofNodesHex',
    'schema',
    'statement',
    'targetHeaderScaleHex',
    'targetNativeBlockHashHex',
    'trustAnchor',
  ], 'native finalized peg-in Frontier execution identity V1 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    'native finalized peg-in Frontier execution identity V1 request schema',
  );

  const common = normalizeFinalityEnvelope(record);
  const statement = normalizePegInFrontierExecutionIdentityStatementV1(
    record.statement,
    common.trustAnchor.sidechainIdHex,
  );
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    trustAnchor: common.trustAnchor,
    targetNativeBlockHashHex: common.targetNativeBlockHashHex,
    targetHeaderScaleHex: common.targetHeaderScaleHex,
    linkedGrandpaProofs: common.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: common.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: common.finalityProofScaleHex,
    statement,
    runtimeStateProofNodesHex: normalizeProofNodes(record.runtimeStateProofNodesHex),
  });
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier execution identity V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

/** Derive the Rust-compatible identity of the exact request bytes consumed by a verifier. */
export function deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier execution identity V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return blake2b256Hex(Buffer.from(requestBytes));
}

/**
 * Bind one reported offline-verifier result into a non-authoritative candidate.
 *
 * This function does not execute or authenticate the Rust verifier. It deliberately strips every
 * reported cryptographic `true` claim. Only a future provenance-branded contained execution may
 * promote the result.
 */
export function buildNativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInFrontierExecutionIdentityV1ResultCandidate {
  if (input.requestBytes.byteLength > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier execution identity V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  let decodedRequest: unknown;
  try {
    decodedRequest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes),
    );
  } catch (error) {
    throw new Error(
      'native finalized peg-in Frontier execution identity V1 request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request(
    decodedRequest,
  );
  const trustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied Frontier execution identity trust anchor digest',
  );
  if (
    deriveNativeGrandpaTrustAnchorDigestHex(commonFinalityRequest(request))
    !== trustedAnchorDigestHex
  ) {
    throw new Error(
      'Frontier execution identity request does not match the independently supplied trust anchor',
    );
  }

  const result = exactRecord(input.verification, [
    'authority',
    'boundary',
    'execution',
    'finality',
    'record',
    'requestDigestHex',
    'runtimeState',
    'schema',
    'status',
    'target',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in Frontier execution identity V1 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_VERIFICATION_SCHEMA,
    'native finalized peg-in Frontier execution identity V1 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS,
    'native finalized peg-in Frontier execution identity V1 verification status',
  );
  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'Frontier execution identity request digest',
  );
  if (
    requestDigestHex
    !== deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
      input.requestBytes,
    )
  ) {
    throw new Error('Frontier execution identity request digest does not match the exact request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'Frontier execution identity verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error(
      'Frontier execution identity verification does not match the independently supplied trust anchor',
    );
  }

  const runtimeState = normalizeRuntimeState(result.runtimeState, request);
  const inherited = validateInheritedPegInBindings({
    request,
    trustedAnchorDigestHex,
    target: result.target,
    authority: result.authority,
    finality: result.finality,
    runtimeState,
    record: result.record,
  });
  if (!inherited.record) {
    throw new Error('Frontier execution identity membership result omitted the processed record');
  }
  const expectedTarget =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      request.targetHeaderScaleHex,
    );
  if (
    expectedTarget.nativeBlockHashHex !== request.targetNativeBlockHashHex
    || inherited.target.nativeBlockHashHex !== expectedTarget.nativeBlockHashHex
    || inherited.target.nativeHeight !== expectedTarget.nativeHeight
    || inherited.target.stateRootHex !== expectedTarget.stateRootHex
  ) {
    throw new Error(
      'Frontier execution identity target tuple does not match the exact native SCALE header',
    );
  }
  const execution = normalizeExecution(
    result.execution,
    inherited.target.nativeHeight,
    inherited.record,
  );
  normalizeBoundary(result.boundary);

  return deepFreeze({
    schema:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_SCHEMA,
    status:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_RESULT_CANDIDATE_STATUS,
    sourceResultSchema:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_VERIFICATION_SCHEMA,
    sourceResultStatus: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: resultTrustAnchorDigestHex,
    target: inherited.target,
    authority: {
      finalitySigningSetId: inherited.authority.finalitySigningSetId,
      finalitySigningAuthorityListScaleHex:
        inherited.authority.finalitySigningAuthorityListScaleHex,
      finalitySigningAuthoritySetHashHex:
        inherited.authority.finalitySigningAuthoritySetHashHex,
      transitionCount: inherited.authority.transitionCount,
    },
    finality: {
      horizonHashHex: inherited.finality.horizonHashHex,
      horizonHeight: inherited.finality.horizonHeight,
      canonicalJustificationScaleHex: inherited.finality.canonicalJustificationScaleHex,
    },
    runtimeState: {
      runtimeCodeStorageKeyHex: runtimeState.runtimeCodeStorageKeyHex,
      runtimeCodeSha256Hex: runtimeState.runtimeCodeSha256Hex,
      runtimeCodeSizeBytes: runtimeState.runtimeCodeSizeBytes,
      buildAttestationId: runtimeState.buildAttestationId,
      buildAttestationSha256Hex: runtimeState.buildAttestationSha256Hex,
      currentBlockStorageKeyHex: runtimeState.currentBlockStorageKeyHex,
      currentBlockScaleSha256Hex: runtimeState.currentBlockScaleSha256Hex,
      currentBlockScaleBytes: runtimeState.currentBlockScaleBytes,
      recordStorageKeyHex: runtimeState.recordStorageKeyHex,
      recordStorageValueScaleHex: runtimeState.recordStorageValueScaleHex,
      proofNodeCount: runtimeState.proofNodeCount,
      proofBytes: runtimeState.proofBytes,
    },
    record: inherited.record,
    execution,
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      verifierResultClaimShapeChecked: true,
      verifierExecutionAuthenticated: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofVerified: false,
      currentBlockStateProofVerified: false,
      processedRecordStateProofVerified: false,
      executionBlockHashMappedToNativeState: false,
      transactionRootRecomputed: false,
      ommersHashRecomputed: false,
      recordTransactionBoundExactlyOnce: false,
      receiptInclusionVerified: false,
      transactionStatusVerified: false,
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

function normalizeFinalityEnvelope(
  record: Record<string, unknown>,
): NativeFinalizedBridgeCheckpointRequest {
  return normalizeNativeFinalizedBridgeCheckpointRequest({
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: record.trustAnchor,
    targetNativeBlockHashHex: record.targetNativeBlockHashHex,
    targetHeaderScaleHex: record.targetHeaderScaleHex,
    linkedGrandpaProofs: record.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: record.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: record.finalityProofScaleHex,
    runtimeStateProofNodesHex: [FINALITY_SENTINEL_PROOF_NODE_HEX],
  });
}

function commonFinalityRequest(
  request: NativeFinalizedPegInFrontierExecutionIdentityV1Request,
): NativeFinalizedBridgeCheckpointRequest {
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: request.trustAnchor,
    targetNativeBlockHashHex: request.targetNativeBlockHashHex,
    targetHeaderScaleHex: request.targetHeaderScaleHex,
    linkedGrandpaProofs: request.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: [...request.checkpointTailHeadersScaleHex],
    finalityProofScaleHex: request.finalityProofScaleHex,
    runtimeStateProofNodesHex: [FINALITY_SENTINEL_PROOF_NODE_HEX],
  };
}

function normalizeProofNodes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Frontier execution identity proof nodes must be a non-empty array');
  }
  if (value.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES) {
    throw new Error(
      `Frontier execution identity proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES} nodes`,
    );
  }
  let proofBytes = 0;
  const nodes = value.map((node, index) => {
    const normalized = lowerByteHex(node, `Frontier execution identity proof node ${index}`);
    const bytes = (normalized.length - 2) / 2;
    if (bytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES) {
      throw new Error(
        `Frontier execution identity proof node ${index} exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES} bytes`,
      );
    }
    proofBytes += bytes;
    if (proofBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES) {
      throw new Error(
        `Frontier execution identity proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(nodes).size !== nodes.length) {
    throw new Error('Frontier execution identity proof contains duplicate nodes');
  }
  return Object.freeze(nodes);
}

function normalizeRuntimeState(
  value: unknown,
  request: NativeFinalizedPegInFrontierExecutionIdentityV1Request,
): NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['runtimeState'] {
  const state = exactRecord(value, [
    'buildAttestationId',
    'buildAttestationSha256Hex',
    'currentBlockScaleBytes',
    'currentBlockScaleSha256Hex',
    'currentBlockStorageKeyHex',
    'proofBytes',
    'proofNodeCount',
    'recordStorageKeyHex',
    'recordStorageValueScaleHex',
    'runtimeCodeSha256Hex',
    'runtimeCodeSizeBytes',
    'runtimeCodeStorageKeyHex',
    'verified',
  ], 'Frontier execution identity runtime state');
  requireLiteral(
    state.runtimeCodeStorageKeyHex,
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    'Frontier execution identity runtime-code storage key',
  );
  requireLiteral(
    state.currentBlockStorageKeyHex,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    'Frontier execution identity CurrentBlock storage key',
  );
  const runtimeCodeSha256Hex = fixedHex(
    state.runtimeCodeSha256Hex,
    32,
    'Frontier execution identity runtime-code SHA-256',
  );
  const runtimeCodeSizeBytes = positiveDecimal(
    state.runtimeCodeSizeBytes,
    'Frontier execution identity runtime-code size',
  );
  const buildAttestationId = nonEmptyString(
    state.buildAttestationId,
    'Frontier execution identity build attestation ID',
  );
  const buildAttestationSha256Hex = fixedHex(
    state.buildAttestationSha256Hex,
    32,
    'Frontier execution identity build attestation SHA-256',
  );
  if (
    runtimeCodeSha256Hex !== request.statement.runtimeCode.artifactSha256Hex
    || runtimeCodeSizeBytes !== request.statement.runtimeCode.artifactSizeBytes
    || buildAttestationId !== request.statement.runtimeCode.buildAttestationId
    || buildAttestationSha256Hex
      !== request.statement.runtimeCode.buildAttestationSha256Hex
  ) {
    throw new Error('Frontier execution identity runtime-code result differs from the statement');
  }
  const currentBlockScaleSha256Hex = fixedHex(
    state.currentBlockScaleSha256Hex,
    32,
    'Frontier CurrentBlock SCALE SHA-256',
  );
  const currentBlockScaleBytes = positiveBoundedDecimal(
    state.currentBlockScaleBytes,
    MAX_FRONTIER_CURRENT_BLOCK_V1_SCALE_BYTES,
    'Frontier CurrentBlock SCALE size',
  );
  const recordStorageKeyHex = lowerByteHex(
    state.recordStorageKeyHex,
    'Frontier execution identity processed-record storage key',
  );
  const recordStorageValueScaleHex = lowerByteHex(
    state.recordStorageValueScaleHex,
    'Frontier execution identity processed-record SCALE value',
  );
  if (recordStorageValueScaleHex !== request.statement.expectedRecordScaleHex) {
    throw new Error('Frontier execution identity record result differs from the statement');
  }
  const proofNodeCount = boundedInteger(
    state.proofNodeCount,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
    'Frontier execution identity proof-node count',
  );
  if (proofNodeCount !== request.runtimeStateProofNodesHex.length) {
    throw new Error('Frontier execution identity proof-node count differs from the request');
  }
  const expectedProofBytes = request.runtimeStateProofNodesHex.reduce(
    (total, node) => total + (node.length - 2) / 2,
    0,
  );
  const proofBytes = boundedInteger(
    state.proofBytes,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
    'Frontier execution identity proof byte count',
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error('Frontier execution identity proof byte count differs from the request');
  }
  literalTrue(state.verified, 'Frontier execution identity runtime-state verification');

  return {
    runtimeCodeStorageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    runtimeCodeSha256Hex,
    runtimeCodeSizeBytes,
    buildAttestationId,
    buildAttestationSha256Hex,
    currentBlockStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    currentBlockScaleSha256Hex,
    currentBlockScaleBytes,
    recordStorageKeyHex,
    recordStorageValueScaleHex,
    proofNodeCount,
    proofBytes,
    verified: true,
  };
}

function validateInheritedPegInBindings(input: {
  request: NativeFinalizedPegInFrontierExecutionIdentityV1Request;
  trustedAnchorDigestHex: string;
  target: unknown;
  authority: unknown;
  finality: unknown;
  runtimeState: NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['runtimeState'];
  record: unknown;
}) {
  const v1Request = normalizeNativeFinalizedPegInStateRequest({
    schema: NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
    trustAnchor: input.request.trustAnchor,
    targetNativeBlockHashHex: input.request.targetNativeBlockHashHex,
    targetHeaderScaleHex: input.request.targetHeaderScaleHex,
    linkedGrandpaProofs: input.request.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: input.request.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: input.request.finalityProofScaleHex,
    statement: {
      schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
      ergoBoxIdHex: input.request.statement.ergoBoxIdHex,
      record: {
        outcome: 'membership',
        expectedRecordScaleHex: input.request.statement.expectedRecordScaleHex,
      },
    },
    runtimeStateProofNodesHex: [FINALITY_SENTINEL_PROOF_NODE_HEX],
  });
  const v1RequestBytes = Buffer.from(JSON.stringify(v1Request), 'utf8');
  return validateNativeFinalizedPegInStatePayloadBindings({
    requestBytes: v1RequestBytes,
    trustedAnchorDigestHex: input.trustedAnchorDigestHex,
    verification: {
      schema: NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA,
      status: 'NATIVE_PEG_IN_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
      requestDigestHex: blake2b256Hex(v1RequestBytes),
      trustAnchorDigestHex: input.trustedAnchorDigestHex,
      target: input.target,
      authority: input.authority,
      finality: input.finality,
      runtimeState: {
        profileStorageKeyHex: null,
        profileStorageValueScaleHex: null,
        recordStorageKeyHex: input.runtimeState.recordStorageKeyHex,
        recordStorageValueScaleHex: input.runtimeState.recordStorageValueScaleHex,
        outcome: 'MEMBERSHIP',
        proofNodeCount: 1,
        proofBytes: 1,
        verified: true,
      },
      profile: null,
      record: input.record,
      boundary: {
        sidechainFinalityVerified: true,
        statementRuntimeStateVerified: true,
        historicalMintAbsenceVerified: false,
        runtimeCodeIdentityVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
      },
    },
  });
}

function normalizeExecution(
  value: unknown,
  nativeHeight: string,
  record: NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['record'],
): NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['execution'] {
  const execution = exactRecord(value, [
    'evmStateRootHex',
    'executionBlockHashHex',
    'executionHeight',
    'ommerCount',
    'ommersHashHex',
    'recordTransactionHashHex',
    'recordTransactionIndex',
    'transactionCount',
    'transactionRootHex',
  ], 'Frontier execution identity execution result');
  const executionBlockHashHex = fixedHex(
    execution.executionBlockHashHex,
    32,
    'Frontier execution block hash',
  );
  const executionHeight = canonicalDecimal(
    execution.executionHeight,
    'Frontier execution height',
  );
  if (
    executionBlockHashHex !== record.executionBlockHashHex
    || executionHeight !== record.sidechainHeight
    || executionHeight !== nativeHeight
  ) {
    throw new Error('Frontier execution block identity differs from native state');
  }
  const recordTransactionHashHex = fixedHex(
    execution.recordTransactionHashHex,
    32,
    'Frontier record transaction hash',
  );
  if (recordTransactionHashHex !== record.transactionHashHex) {
    throw new Error('Frontier execution transaction identity differs from the processed record');
  }
  const transactionCount = positiveBoundedInteger(
    execution.transactionCount,
    'Frontier transaction count',
  );
  const recordTransactionIndex = boundedInteger(
    execution.recordTransactionIndex,
    Number.MAX_SAFE_INTEGER,
    'Frontier record transaction index',
  );
  if (recordTransactionIndex >= transactionCount) {
    throw new Error('Frontier record transaction index is outside the authenticated block');
  }
  return {
    executionBlockHashHex,
    executionHeight,
    evmStateRootHex: fixedHex(execution.evmStateRootHex, 32, 'Frontier EVM state root'),
    transactionRootHex: fixedHex(
      execution.transactionRootHex,
      32,
      'Frontier transaction root',
    ),
    ommersHashHex: fixedHex(execution.ommersHashHex, 32, 'Frontier ommers hash'),
    transactionCount,
    ommerCount: boundedInteger(
      execution.ommerCount,
      Number.MAX_SAFE_INTEGER,
      'Frontier ommer count',
    ),
    recordTransactionHashHex,
    recordTransactionIndex,
  };
}

function normalizeBoundary(
  value: unknown,
): NativeFinalizedPegInFrontierExecutionIdentityV1VerificationPayload['boundary'] {
  const boundary = exactRecord(value, [
    'committedVaultTransitionVerified',
    'currentBlockStateProofVerified',
    'depositEventSemanticsVerified',
    'evmCodeStateVerified',
    'evmStorageStateVerified',
    'executionBlockHashMappedToNativeState',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'ommersHashRecomputed',
    'processedRecordStateProofVerified',
    'productionReadinessVerified',
    'receiptInclusionVerified',
    'recordTransactionBoundExactlyOnce',
    'runtimeBuildAttestationVerified',
    'runtimeCodeIdentityVerified',
    'runtimeCodeStateProofVerified',
    'sidechainFinalityVerified',
    'transactionMutationEnabled',
    'transactionRootRecomputed',
    'transactionStatusVerified',
  ], 'Frontier execution identity claim boundary');
  return {
    sidechainFinalityVerified: literalTrue(
      boundary.sidechainFinalityVerified,
      'sidechain finality boundary',
    ),
    runtimeCodeStateProofVerified: literalTrue(
      boundary.runtimeCodeStateProofVerified,
      'runtime-code state proof boundary',
    ),
    currentBlockStateProofVerified: literalTrue(
      boundary.currentBlockStateProofVerified,
      'CurrentBlock state proof boundary',
    ),
    processedRecordStateProofVerified: literalTrue(
      boundary.processedRecordStateProofVerified,
      'processed-record state proof boundary',
    ),
    executionBlockHashMappedToNativeState: literalTrue(
      boundary.executionBlockHashMappedToNativeState,
      'execution block mapping boundary',
    ),
    transactionRootRecomputed: literalTrue(
      boundary.transactionRootRecomputed,
      'transaction-root recomputation boundary',
    ),
    ommersHashRecomputed: literalTrue(
      boundary.ommersHashRecomputed,
      'ommers-hash recomputation boundary',
    ),
    recordTransactionBoundExactlyOnce: literalTrue(
      boundary.recordTransactionBoundExactlyOnce,
      'record transaction multiplicity boundary',
    ),
    receiptInclusionVerified: literalFalse(
      boundary.receiptInclusionVerified,
      'receipt inclusion boundary',
    ),
    transactionStatusVerified: literalFalse(
      boundary.transactionStatusVerified,
      'transaction status boundary',
    ),
    depositEventSemanticsVerified: literalFalse(
      boundary.depositEventSemanticsVerified,
      'deposit-event semantics boundary',
    ),
    evmCodeStateVerified: literalFalse(
      boundary.evmCodeStateVerified,
      'EVM code-state boundary',
    ),
    evmStorageStateVerified: literalFalse(
      boundary.evmStorageStateVerified,
      'EVM storage-state boundary',
    ),
    runtimeBuildAttestationVerified: literalFalse(
      boundary.runtimeBuildAttestationVerified,
      'runtime build-attestation boundary',
    ),
    runtimeCodeIdentityVerified: literalFalse(
      boundary.runtimeCodeIdentityVerified,
      'runtime-code identity boundary',
    ),
    committedVaultTransitionVerified: literalFalse(
      boundary.committedVaultTransitionVerified,
      'committed-vault boundary',
    ),
    historicalMintAbsenceVerified: literalFalse(
      boundary.historicalMintAbsenceVerified,
      'historical mint absence boundary',
    ),
    mintAuthorized: literalFalse(boundary.mintAuthorized, 'mint authorization boundary'),
    transactionMutationEnabled: literalFalse(
      boundary.transactionMutationEnabled,
      'transaction mutation boundary',
    ),
    gate5Closed: literalFalse(boundary.gate5Closed, 'Gate 5 boundary'),
    productionReadinessVerified: literalFalse(
      boundary.productionReadinessVerified,
      'production-readiness boundary',
    ),
  };
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

function requireLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function lowerByteHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase 0x-prefixed bytes`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return value;
}

function canonicalDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical non-negative decimal string`);
  }
  return value;
}

function positiveBoundedDecimal(value: unknown, max: number, label: string): string {
  const decimal = positiveDecimal(value, label);
  if (BigInt(decimal) > BigInt(max)) throw new Error(`${label} exceeds ${max} bytes`);
  return decimal;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
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
