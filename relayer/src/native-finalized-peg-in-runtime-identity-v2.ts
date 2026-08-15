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
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  normalizePegInRuntimeIdentityStatementV2,
  type PegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';

export const NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-runtime-identity-request.v2' as const;
export const NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-runtime-identity-verification.v2' as const;
export const NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS =
  'NATIVE_PEG_IN_RUNTIME_IDENTITY_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT' as const;

export const MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES = 512;
export const MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES = 4 * 1024 * 1024;
export const MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES = 8 * 1024 * 1024;

const MAX_SUBSTRATE_HEADER_SCALE_BYTES = 64 * 1024;
const MAX_SUBSTRATE_HEADER_DIGEST_LOGS = 256;
const MEMBERSHIP = 'membership' as const;
const FINALITY_SENTINEL_PROOF_NODE_HEX = '0x00';
const UINT64_MAX = (1n << 64n) - 1n;

export interface NativeFinalizedPegInRuntimeIdentityV2Request {
  readonly schema: typeof NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA;
  readonly trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  readonly targetNativeBlockHashHex: string;
  readonly targetHeaderScaleHex: string;
  readonly linkedGrandpaProofs: NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'];
  readonly checkpointTailHeadersScaleHex: readonly string[];
  readonly finalityProofScaleHex: string;
  readonly statement: PegInRuntimeIdentityStatementV2;
  readonly runtimeStateProofNodesHex: readonly string[];
}

export interface NativeFinalizedPegInRuntimeIdentityV2VerificationPayload {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA;
  readonly status: typeof NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS;
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
    readonly profileStorageKeyHex: string | null;
    readonly profileStorageValueScaleHex: string | null;
    readonly recordStorageKeyHex: string;
    readonly recordStorageValueScaleHex: string | null;
    readonly outcome: 'MEMBERSHIP' | 'NON_MEMBERSHIP';
    readonly proofNodeCount: number;
    readonly proofBytes: number;
    readonly verified: true;
  };
  readonly profile: null | {
    readonly formatVersion: 1;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly profileRevision: string;
    readonly activationHeight: string;
  };
  readonly record: null | {
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
  readonly boundary: {
    readonly sidechainFinalityVerified: true;
    readonly statementRuntimeStateVerified: true;
    readonly runtimeCodeStateProofVerified: true;
    readonly runtimeBuildAttestationVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly runtimeCodeIdentityVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
  };
}

export interface NativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity {
  readonly nativeBlockHashHex: string;
  readonly parentHashHex: string;
  readonly nativeHeight: string;
  readonly stateRootHex: string;
  readonly runtimeEnvironmentUpdatedDigestPresent: boolean;
}

export function normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
  value: unknown,
): NativeFinalizedPegInRuntimeIdentityV2Request {
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
  ], 'native finalized peg-in runtime identity V2 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
    'native finalized peg-in runtime identity V2 request schema',
  );

  const common = normalizeFinalityEnvelope(record);
  const statement = normalizePegInRuntimeIdentityStatementV2(
    record.statement,
    common.trustAnchor.sidechainIdHex,
  );
  const canonicalStatement = rustCanonicalStatement(statement);
  const runtimeStateProofNodesHex = normalizeRuntimeStateProofNodes(
    record.runtimeStateProofNodesHex,
  );
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
    trustAnchor: common.trustAnchor,
    targetNativeBlockHashHex: common.targetNativeBlockHashHex,
    targetHeaderScaleHex: common.targetHeaderScaleHex,
    linkedGrandpaProofs: common.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: common.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: common.finalityProofScaleHex,
    statement: canonicalStatement,
    runtimeStateProofNodesHex,
  });
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in runtime identity V2 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
  value: unknown,
): string {
  const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(value);
  return blake2b256Hex(Buffer.from(JSON.stringify(request), 'utf8'));
}

/**
 * Validate the exact V2 verifier payload without granting executable provenance or mint authority.
 */
export function validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInRuntimeIdentityV2VerificationPayload {
  let decodedRequest: unknown;
  try {
    decodedRequest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes),
    );
  } catch (error) {
    throw new Error(
      'native finalized peg-in runtime identity V2 request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(decodedRequest);
  const independentlyTrustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied peg-in runtime identity trust anchor digest',
  );
  const result = exactRecord(input.verification, [
    'authority',
    'boundary',
    'finality',
    'profile',
    'record',
    'requestDigestHex',
    'runtimeState',
    'schema',
    'status',
    'target',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in runtime identity V2 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
    'native finalized peg-in runtime identity V2 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS,
    'native finalized peg-in runtime identity V2 verification status',
  );

  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'native peg-in runtime identity V2 request digest',
  );
  if (requestDigestHex !== blake2b256Hex(Buffer.from(input.requestBytes))) {
    throw new Error(
      'native peg-in runtime identity V2 request digest does not match the exact request',
    );
  }

  const commonRequest = commonFinalityRequest(request);
  if (
    deriveNativeGrandpaTrustAnchorDigestHex(commonRequest)
    !== independentlyTrustedAnchorDigestHex
  ) {
    throw new Error(
      'native peg-in runtime identity V2 request does not match the independently supplied trust anchor',
    );
  }
  const trustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'native peg-in runtime identity V2 verification trust anchor digest',
  );
  if (trustAnchorDigestHex !== independentlyTrustedAnchorDigestHex) {
    throw new Error(
      'native peg-in runtime identity V2 verification does not match the independently supplied trust anchor',
    );
  }

  const runtimeState = normalizeRuntimeStateResult(result.runtimeState, request);
  const boundary = normalizeBoundary(result.boundary);
  const expectedTarget =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      request.targetHeaderScaleHex,
    );
  if (expectedTarget.nativeBlockHashHex !== request.targetNativeBlockHashHex) {
    throw new Error(
      'native peg-in runtime identity V2 target header hash does not match the request',
    );
  }
  const inherited = validateInheritedV1Bindings({
    request,
    trustedAnchorDigestHex: independentlyTrustedAnchorDigestHex,
    target: result.target,
    authority: result.authority,
    finality: result.finality,
    runtimeState,
    profile: result.profile,
    record: result.record,
  });
  if (
    inherited.target.nativeBlockHashHex !== expectedTarget.nativeBlockHashHex
    || inherited.target.nativeHeight !== expectedTarget.nativeHeight
    || inherited.target.stateRootHex !== expectedTarget.stateRootHex
  ) {
    throw new Error(
      'native peg-in runtime identity V2 target tuple does not match the exact SCALE header',
    );
  }

  return deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS,
    requestDigestHex,
    trustAnchorDigestHex,
    target: inherited.target,
    authority: inherited.authority,
    finality: inherited.finality,
    runtimeState: {
      runtimeCodeStorageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      runtimeCodeSha256Hex: runtimeState.runtimeCodeSha256Hex,
      runtimeCodeSizeBytes: runtimeState.runtimeCodeSizeBytes,
      buildAttestationId: runtimeState.buildAttestationId,
      buildAttestationSha256Hex: runtimeState.buildAttestationSha256Hex,
      profileStorageKeyHex: inherited.runtimeState.profileStorageKeyHex,
      profileStorageValueScaleHex: inherited.runtimeState.profileStorageValueScaleHex,
      recordStorageKeyHex: inherited.runtimeState.recordStorageKeyHex,
      recordStorageValueScaleHex: inherited.runtimeState.recordStorageValueScaleHex,
      outcome: inherited.runtimeState.outcome,
      proofNodeCount: runtimeState.proofNodeCount,
      proofBytes: runtimeState.proofBytes,
      verified: true,
    },
    profile: inherited.profile,
    record: inherited.record,
    boundary,
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
  request: NativeFinalizedPegInRuntimeIdentityV2Request,
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

function normalizeRuntimeStateProofNodes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('peg-in runtime identity V2 proof nodes must be a non-empty array');
  }
  if (value.length > MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES) {
    throw new Error(
      `peg-in runtime identity V2 proof exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES} nodes`,
    );
  }
  let aggregateBytes = 0;
  const nodes = value.map((node, index) => {
    const normalized = lowerByteHex(
      node,
      `peg-in runtime identity V2 proof node ${index}`,
    );
    const bytes = (normalized.length - 2) / 2;
    if (bytes > MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES) {
      throw new Error(
        `peg-in runtime identity V2 proof node ${index} exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES} bytes`,
      );
    }
    aggregateBytes += bytes;
    if (aggregateBytes > MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES) {
      throw new Error(
        `peg-in runtime identity V2 proof exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(nodes).size !== nodes.length) {
    throw new Error('peg-in runtime identity V2 proof contains duplicate nodes');
  }
  return Object.freeze(nodes);
}

function normalizeRuntimeStateResult(
  value: unknown,
  request: NativeFinalizedPegInRuntimeIdentityV2Request,
) {
  const runtimeState = exactRecord(value, [
    'buildAttestationId',
    'buildAttestationSha256Hex',
    'outcome',
    'profileStorageKeyHex',
    'profileStorageValueScaleHex',
    'proofBytes',
    'proofNodeCount',
    'recordStorageKeyHex',
    'recordStorageValueScaleHex',
    'runtimeCodeSha256Hex',
    'runtimeCodeSizeBytes',
    'runtimeCodeStorageKeyHex',
    'verified',
  ], 'native peg-in runtime identity V2 runtime state');
  requireLiteral(
    runtimeState.runtimeCodeStorageKeyHex,
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    'runtime-code storage key',
  );
  const runtimeCodeSha256Hex = fixedHex(
    runtimeState.runtimeCodeSha256Hex,
    32,
    'runtime-code SHA-256',
    true,
  );
  const runtimeCodeSizeBytes = positiveDecimal(
    runtimeState.runtimeCodeSizeBytes,
    'runtime-code size',
  );
  const buildAttestationId = exactString(
    runtimeState.buildAttestationId,
    'runtime build attestation ID',
  );
  const buildAttestationSha256Hex = fixedHex(
    runtimeState.buildAttestationSha256Hex,
    32,
    'runtime build attestation SHA-256',
    true,
  );
  if (
    runtimeCodeSha256Hex !== request.statement.runtimeCode.artifactSha256Hex
    || runtimeCodeSizeBytes !== request.statement.runtimeCode.artifactSizeBytes
    || buildAttestationId !== request.statement.runtimeCode.buildAttestationId
    || buildAttestationSha256Hex
      !== request.statement.runtimeCode.buildAttestationSha256Hex
  ) {
    throw new Error(
      'native peg-in runtime identity V2 runtime-code result differs from the statement',
    );
  }

  const proofNodeCount = boundedInteger(
    runtimeState.proofNodeCount,
    'runtime state proof node count',
    MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES,
  );
  if (proofNodeCount !== request.runtimeStateProofNodesHex.length) {
    throw new Error(
      'native peg-in runtime identity V2 proof-node count does not match the request',
    );
  }
  const expectedProofBytes = request.runtimeStateProofNodesHex.reduce(
    (total, node) => total + (node.length - 2) / 2,
    0,
  );
  const proofBytes = boundedInteger(
    runtimeState.proofBytes,
    'runtime state proof byte count',
    MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES,
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error(
      'native peg-in runtime identity V2 proof byte count does not match the request',
    );
  }
  literalTrue(runtimeState.verified, 'runtime state verification');

  return {
    runtimeCodeSha256Hex,
    runtimeCodeSizeBytes,
    buildAttestationId,
    buildAttestationSha256Hex,
    profileStorageKeyHex: runtimeState.profileStorageKeyHex,
    profileStorageValueScaleHex: runtimeState.profileStorageValueScaleHex,
    recordStorageKeyHex: runtimeState.recordStorageKeyHex,
    recordStorageValueScaleHex: runtimeState.recordStorageValueScaleHex,
    outcome: runtimeState.outcome,
    proofNodeCount,
    proofBytes,
  };
}

function validateInheritedV1Bindings(input: {
  request: NativeFinalizedPegInRuntimeIdentityV2Request;
  trustedAnchorDigestHex: string;
  target: unknown;
  authority: unknown;
  finality: unknown;
  runtimeState: ReturnType<typeof normalizeRuntimeStateResult>;
  profile: unknown;
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
    statement: projectV1Statement(input.request.statement),
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
        profileStorageKeyHex: input.runtimeState.profileStorageKeyHex,
        profileStorageValueScaleHex: input.runtimeState.profileStorageValueScaleHex,
        recordStorageKeyHex: input.runtimeState.recordStorageKeyHex,
        recordStorageValueScaleHex: input.runtimeState.recordStorageValueScaleHex,
        outcome: input.runtimeState.outcome,
        proofNodeCount: 1,
        proofBytes: 1,
        verified: true,
      },
      profile: input.profile,
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

function projectV1Statement(statement: PegInRuntimeIdentityStatementV2) {
  if (statement.record.outcome === MEMBERSHIP) {
    return {
      schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
      ergoBoxIdHex: statement.ergoBoxIdHex,
      record: statement.record,
    };
  }
  if (!('expectedProfileScaleHex' in statement)) {
    throw new Error('peg-in runtime identity V2 non-membership profile is missing');
  }
  return {
    schema: PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
    ergoBoxIdHex: statement.ergoBoxIdHex,
    expectedProfileScaleHex: statement.expectedProfileScaleHex,
    record: statement.record,
  };
}

function rustCanonicalStatement(
  statement: PegInRuntimeIdentityStatementV2,
): PegInRuntimeIdentityStatementV2 {
  if (statement.record.outcome === MEMBERSHIP) {
    return deepFreeze({
      schema: statement.schema,
      runtimeCode: statement.runtimeCode,
      ergoBoxIdHex: statement.ergoBoxIdHex,
      record: statement.record,
    });
  }
  if (!('expectedProfileScaleHex' in statement)) {
    throw new Error('peg-in runtime identity V2 non-membership profile is missing');
  }
  return deepFreeze({
    schema: statement.schema,
    runtimeCode: statement.runtimeCode,
    ergoBoxIdHex: statement.ergoBoxIdHex,
    expectedProfileScaleHex: statement.expectedProfileScaleHex,
    record: statement.record,
  });
}

function normalizeBoundary(
  value: unknown,
): NativeFinalizedPegInRuntimeIdentityV2VerificationPayload['boundary'] {
  const boundary = exactRecord(value, [
    'committedVaultTransitionVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'runtimeBuildAttestationVerified',
    'runtimeCodeIdentityVerified',
    'runtimeCodeStateProofVerified',
    'sidechainFinalityVerified',
    'statementRuntimeStateVerified',
    'transactionMutationEnabled',
  ], 'native peg-in runtime identity V2 boundary');
  return {
    sidechainFinalityVerified: literalTrue(
      boundary.sidechainFinalityVerified,
      'sidechain finality boundary',
    ),
    statementRuntimeStateVerified: literalTrue(
      boundary.statementRuntimeStateVerified,
      'statement runtime state boundary',
    ),
    runtimeCodeStateProofVerified: literalTrue(
      boundary.runtimeCodeStateProofVerified,
      'runtime-code state proof boundary',
    ),
    runtimeBuildAttestationVerified: literalFalse(
      boundary.runtimeBuildAttestationVerified,
      'runtime build attestation boundary',
    ),
    historicalMintAbsenceVerified: literalFalse(
      boundary.historicalMintAbsenceVerified,
      'historical mint absence boundary',
    ),
    runtimeCodeIdentityVerified: literalFalse(
      boundary.runtimeCodeIdentityVerified,
      'runtime-code identity boundary',
    ),
    committedVaultTransitionVerified: literalFalse(
      boundary.committedVaultTransitionVerified,
      'committed-vault boundary',
    ),
    mintAuthorized: literalFalse(boundary.mintAuthorized, 'mint authorization boundary'),
    transactionMutationEnabled: literalFalse(
      boundary.transactionMutationEnabled,
      'transaction mutation boundary',
    ),
    gate5Closed: literalFalse(boundary.gate5Closed, 'Gate 5 boundary'),
  };
}

export function deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
  headerScaleHex: string,
): NativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity {
  const normalized = lowerByteHex(
    headerScaleHex,
    'native peg-in runtime identity V2 target SCALE header',
  );
  const bytes = Buffer.from(normalized.slice(2), 'hex');
  if (bytes.length > MAX_SUBSTRATE_HEADER_SCALE_BYTES) {
    throw new Error(
      `native peg-in runtime identity V2 target SCALE header exceeds ${MAX_SUBSTRATE_HEADER_SCALE_BYTES} bytes`,
    );
  }
  const compact = decodeCanonicalCompactUint(
    bytes,
    32,
    'native peg-in runtime identity V2 target SCALE header height',
  );
  const stateRootOffset = 32 + compact.bytesRead;
  const minimumRemainingHeaderBytes = 32 + 32 + 1;
  if (stateRootOffset + minimumRemainingHeaderBytes > bytes.length) {
    throw new Error(
      'native peg-in runtime identity V2 target SCALE header is truncated',
    );
  }
  if (compact.value > UINT64_MAX) {
    throw new Error(
      'native peg-in runtime identity V2 target SCALE header height exceeds uint64',
    );
  }
  const runtimeEnvironmentUpdatedDigestPresent =
    assertCanonicalSubstrateHeaderDigest(
      bytes,
      stateRootOffset + 64,
    );
  return {
    nativeBlockHashHex: blake2b256Hex(bytes),
    parentHashHex: `0x${bytes.subarray(0, 32).toString('hex')}`,
    nativeHeight: compact.value.toString(),
    stateRootHex: `0x${bytes.subarray(stateRootOffset, stateRootOffset + 32).toString('hex')}`,
    runtimeEnvironmentUpdatedDigestPresent,
  };
}

function decodeCanonicalCompactUint(
  bytes: Buffer,
  offset: number,
  label: string,
): { value: bigint; bytesRead: number } {
  if (offset >= bytes.length) {
    throw new Error(`${label} is missing`);
  }
  const first = bytes[offset];
  const mode = first & 0x03;
  if (mode === 0) {
    return { value: BigInt(first >>> 2), bytesRead: 1 };
  }
  if (mode === 1) {
    if (offset + 2 > bytes.length) {
      throw new Error(`${label} is truncated`);
    }
    const value = BigInt(bytes.readUInt16LE(offset) >>> 2);
    if (value < 1n << 6n) {
      throw new Error(`${label} is noncanonical`);
    }
    return { value, bytesRead: 2 };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) {
      throw new Error(`${label} is truncated`);
    }
    const value = BigInt(bytes.readUInt32LE(offset) >>> 2);
    if (value < 1n << 14n) {
      throw new Error(`${label} is noncanonical`);
    }
    return { value, bytesRead: 4 };
  }

  const valueBytes = (first >>> 2) + 4;
  if (valueBytes > 8 || offset + 1 + valueBytes > bytes.length) {
    throw new Error(`${label} is out of bounds`);
  }
  let value = 0n;
  for (let index = 0; index < valueBytes; index += 1) {
    value |= BigInt(bytes[offset + 1 + index]) << BigInt(index * 8);
  }
  if (value < 1n << 30n || bytes[offset + valueBytes] === 0) {
    throw new Error(`${label} is noncanonical`);
  }
  return { value, bytesRead: 1 + valueBytes };
}

function assertCanonicalSubstrateHeaderDigest(
  bytes: Buffer,
  digestOffset: number,
): boolean {
  const digestCount = decodeCanonicalCompactUint(
    bytes,
    digestOffset,
    'native peg-in runtime identity V2 target SCALE header digest log count',
  );
  if (digestCount.value > BigInt(MAX_SUBSTRATE_HEADER_DIGEST_LOGS)) {
    throw new Error(
      `native peg-in runtime identity V2 target SCALE header digest exceeds ${MAX_SUBSTRATE_HEADER_DIGEST_LOGS} logs`,
    );
  }

  let cursor = digestOffset + digestCount.bytesRead;
  let runtimeEnvironmentUpdatedDigestPresent = false;
  for (let index = 0; index < Number(digestCount.value); index += 1) {
    if (cursor >= bytes.length) {
      throw new Error(
        'native peg-in runtime identity V2 target SCALE header digest is truncated',
      );
    }
    const variant = bytes[cursor];
    cursor += 1;
    if (variant === 8) {
      runtimeEnvironmentUpdatedDigestPresent = true;
      continue;
    }
    if (variant === 4 || variant === 5 || variant === 6) {
      if (cursor + 4 > bytes.length) {
        throw new Error(
          'native peg-in runtime identity V2 target SCALE header digest engine ID is truncated',
        );
      }
      cursor += 4;
    } else if (variant !== 0) {
      throw new Error(
        `native peg-in runtime identity V2 target SCALE header digest variant ${variant} is unsupported`,
      );
    }
    cursor = consumeCanonicalScaleByteVector(
      bytes,
      cursor,
      'native peg-in runtime identity V2 target SCALE header digest payload',
    );
  }
  if (cursor !== bytes.length) {
    throw new Error(
      'native peg-in runtime identity V2 target SCALE header has trailing bytes',
    );
  }
  return runtimeEnvironmentUpdatedDigestPresent;
}

function consumeCanonicalScaleByteVector(
  bytes: Buffer,
  offset: number,
  label: string,
): number {
  const length = decodeCanonicalCompactUint(bytes, offset, `${label} length`);
  const payloadOffset = offset + length.bytesRead;
  const remaining = bytes.length - payloadOffset;
  if (length.value > BigInt(remaining)) {
    throw new Error(`${label} is truncated`);
  }
  return payloadOffset + Number(length.value);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = objectRecord(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function lowerByteHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase 0x-prefixed bytes`);
  }
  return value;
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  if (nonzero && /^0x0+$/.test(value)) throw new Error(`${label} must not be zero`);
  return value;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return value;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, max: number): number {
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
