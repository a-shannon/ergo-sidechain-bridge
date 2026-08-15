import { spawn } from 'child_process';
import { realpathSync } from 'fs';
import { dirname, isAbsolute } from 'path';
import { TextDecoder } from 'util';

import blakejs from 'blakejs';

import {
  buildBridgeCheckpointCommitmentV1,
  deriveGrandpaJustificationHashHex,
  type BridgeCheckpointCommitmentV1,
} from './bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
  type AggregateFinalityProofV1,
  type BridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  deriveExecutableInvocationSha256Hex,
  normalizeExecutableSha256Hex,
  verifyExecutableInvocationSha256,
  verifyExecutableSha256,
} from './native-executable-pin.js';
import {
  assertNativeVerifierExecutionAuthorityProvenance,
  assertNativeVerifierExecutionAuthorityResultProvenance,
  type NativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import { MAX_NATIVE_VERIFIER_REQUEST_BYTES } from './native-verifier-limits.js';

export { MAX_NATIVE_VERIFIER_REQUEST_BYTES } from './native-verifier-limits.js';

export const NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA =
  'e2s.native-finalized-bridge-checkpoint-request.v2';
export const NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA =
  'e2s.native-finalized-bridge-checkpoint-verification.v2';
export const NATIVE_VERIFIED_BRIDGE_CHECKPOINT_SCHEMA =
  'e2s.native-verified-bridge-checkpoint.v2';

export const MAX_NATIVE_VERIFIER_STDOUT_BYTES = 16 * 1024 * 1024;
export const MAX_NATIVE_VERIFIER_STDERR_BYTES = 64 * 1024;

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 5 * 60_000;
const MAX_EXECUTABLE_ARGS = 16;
const MAX_EXECUTABLE_ARGV_BYTES = 256 * 1024;
const MAX_LINKED_GRANDPA_PROOFS = 16;
const MAX_ANCESTRY_HEADERS_PER_PROOF = 4_096;
const MAX_CHECKPOINT_TAIL_HEADERS = 4_096;
const MAX_TOTAL_ANCESTRY_HEADERS =
  MAX_LINKED_GRANDPA_PROOFS * MAX_ANCESTRY_HEADERS_PER_PROOF +
  MAX_CHECKPOINT_TAIL_HEADERS;
const MAX_TOTAL_AUTHORITY_TRANSITIONS = MAX_TOTAL_ANCESTRY_HEADERS;
const MAX_RUNTIME_STATE_PROOF_NODES = 256;
const MAX_AUTHORITY_LIST_BYTES = 4 * 1024;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_GRANDPA_PROOF_BYTES = 8 * 1024 * 1024;
const MAX_FINALITY_PROOF_BYTES = 4 * 1024 * 1024;
const MAX_RUNTIME_STATE_PROOF_NODE_BYTES = 64 * 1024;
const MAX_RUNTIME_STATE_PROOF_BYTES = 256 * 1024;
const BRIDGE_COMMITMENT_STORAGE_KEY_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
const BRIDGE_COMMITMENT_V1_SCALE_BYTES = 109;
const GRANDPA_AUTHORITY_SET_DOMAIN = Buffer.from(
  'E2S_GRANDPA_AUTHORITY_SET_V1',
  'utf8',
);
const GRANDPA_TRUST_ANCHOR_DOMAIN = Buffer.from(
  'E2S_GRANDPA_TRUST_ANCHOR_V1',
  'utf8',
);
const MAX_BURN_LEAF_COUNT = 256;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const NATIVE_VERIFICATION_BRAND: unique symbol = Symbol(
  'e2s.native-finalized-bridge-checkpoint.verified',
);
const NATIVE_VERIFICATION_RESULTS = new WeakSet<object>();
const NATIVE_VERIFICATION_EXECUTABLES = new WeakMap<object, NativeVerifierExecutableProvenance>();
const NATIVE_VERIFIED_CHECKPOINT_BRAND: unique symbol = Symbol(
  'e2s.native-finalized-bridge-checkpoint.checkpoint-verified',
);
const NATIVE_VERIFIED_CHECKPOINT_RESULTS = new WeakSet<object>();
const NATIVE_VERIFIED_CHECKPOINT_EXECUTABLES = new WeakMap<
  object,
  NativeVerifierExecutableProvenance
>();
const NATIVE_CHECKPOINT_AGGREGATE_FINALITY_PROOFS = new WeakMap<
  object,
  NativeVerifiedBridgeCheckpoint
>();

interface NativeVerifierExecutableProvenance {
  executablePath: string;
  executableSha256Hex: string;
  executionMode:
    | 'direct-process-candidate-only'
    | 'source-refreshed-authority-contained-candidate-only';
  authority?: NativeVerifierExecutionAuthority;
}

export interface NativeGrandpaTrustAnchor {
  sidechainIdHex: string;
  checkpointHashHex: string;
  checkpointNumber: string;
  grandpaSetId: string;
  authorityListScaleHex: string;
}

export interface NativeFinalizedBridgeCheckpointRequest {
  schema: typeof NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA;
  trustAnchor: NativeGrandpaTrustAnchor;
  targetNativeBlockHashHex: string;
  targetHeaderScaleHex: string;
  linkedGrandpaProofs: Array<{
    ancestryHeadersScaleHex: string[];
    proofScaleHex: string;
  }>;
  checkpointTailHeadersScaleHex: string[];
  finalityProofScaleHex: string;
  runtimeStateProofNodesHex: string[];
}

export interface NativeFinalizedBridgeCheckpointVerificationPayload {
  schema: typeof NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA;
  status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT';
  requestDigestHex: string;
  trustAnchorDigestHex: string;
  target: {
    nativeBlockHashHex: string;
    nativeHeight: string;
    stateRootHex: string;
  };
  authority: {
    finalitySigningSetId: string;
    finalitySigningAuthorityListScaleHex: string;
    finalitySigningAuthoritySetHashHex: string;
    transitionCount: number;
    linkedAncestryVerified: true;
  };
  finality: {
    horizonHashHex: string;
    horizonHeight: string;
    canonicalJustificationScaleHex: string;
    verified: true;
  };
  runtimeState: {
    storageKeyHex: string;
    storageValueScaleHex: string;
    proofNodeCount: number;
    proofBytes: number;
    verified: true;
  };
  commitment: {
    sidechainIdHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    burnLeafCount: number;
  };
  boundary: {
    sidechainFinalityVerified: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export type NativeFinalizedBridgeCheckpointVerification =
  NativeFinalizedBridgeCheckpointVerificationPayload & {
    readonly [NATIVE_VERIFICATION_BRAND]: true;
  };

export interface VerifyNativeFinalizedBridgeCheckpointInput {
  executablePath: string;
  expectedExecutableSha256Hex: string;
  expectedExecutableInvocationSha256Hex: string;
  executableArgs?: readonly string[];
  timeoutMs?: number;
  trustedAnchorDigestHex: string;
  request: NativeFinalizedBridgeCheckpointRequest;
}

export interface AuthorityBoundNativeFinalizedBridgeCheckpointVerifier {
  readonly executionBoundary: {
    mode: 'source-refreshed-authority-contained-candidate-only';
    sourceOwnedAttestorLockReloadedPerLaunch: true;
    executionPolicyValidatedPerLaunch: true;
    installerEpochFloorRequired: true;
    containedProcessRequired: true;
    settlementAuthorityGranted: false;
    gate5Closed: false;
  };
  readonly executableSha256Hex: string;
  deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string;
  verify(input: {
    trustedAnchorDigestHex: string;
    request: NativeFinalizedBridgeCheckpointRequest;
  }): Promise<NativeFinalizedBridgeCheckpointVerification>;
}

export interface NativeVerifiedBridgeCheckpointPayload {
  schema: typeof NATIVE_VERIFIED_BRIDGE_CHECKPOINT_SCHEMA;
  status: 'NATIVE_VERIFIED';
  nativeVerification: NativeFinalizedBridgeCheckpointVerificationPayload;
  checkpointCommitment: BridgeCheckpointCommitmentV1;
  finalityStatement: BridgeFinalityStatementV1;
  checks: {
    hashLinkedAuthorityPathVerified: true;
    grandpaFinalityVerified: true;
    runtimeStateProofVerified: true;
    canonicalJustificationCommitted: true;
    canonicalFinalityStatementBound: true;
  };
  boundary: {
    checkpointCandidateOnly: true;
    sidechainFinalityVerified: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export type NativeVerifiedBridgeCheckpoint = NativeVerifiedBridgeCheckpointPayload & {
  readonly [NATIVE_VERIFIED_CHECKPOINT_BRAND]: true;
};

export async function verifyNativeFinalizedBridgeCheckpoint(
  input: VerifyNativeFinalizedBridgeCheckpointInput,
): Promise<NativeFinalizedBridgeCheckpointVerification> {
  const executablePath = validateExecutablePath(input?.executablePath);
  const expectedExecutableSha256Hex = normalizeExecutableSha256Hex(
    input?.expectedExecutableSha256Hex,
    'native verifier executable digest',
  );
  const executableArgs = validateExecutableArgs(input?.executableArgs ?? []);
  const timeoutMs = validateTimeout(input?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const prepared = prepareNativeFinalizedBridgeCheckpointVerification({
    trustedAnchorDigestHex: input?.trustedAnchorDigestHex,
    request: input?.request,
  });

  const finalExecutableArgs = [
    ...executableArgs,
    '--trusted-anchor-digest',
    prepared.trustedAnchorDigestHex,
  ];
  verifyExecutableInvocationSha256(
    expectedExecutableSha256Hex,
    finalExecutableArgs,
    input?.expectedExecutableInvocationSha256Hex,
    'native verifier executable',
  );

  await verifyExecutableSha256(
    executablePath,
    expectedExecutableSha256Hex,
    'native verifier executable',
  );

  const stdout = await runVerifier({
    executablePath,
    executableArgs: finalExecutableArgs,
    timeoutMs,
    requestBytes: prepared.requestBytes,
  });
  await verifyExecutableSha256(
    executablePath,
    expectedExecutableSha256Hex,
    'native verifier executable after execution',
  );
  return finalizeNativeFinalizedBridgeCheckpointVerification({
    stdout,
    prepared,
    executableProvenance: {
    executablePath: realpathSync(executablePath),
    executableSha256Hex: expectedExecutableSha256Hex,
      executionMode: 'direct-process-candidate-only',
    },
  });
}

export function createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier(
  authority: NativeVerifierExecutionAuthority,
): AuthorityBoundNativeFinalizedBridgeCheckpointVerifier {
  assertNativeVerifierExecutionAuthorityProvenance(authority);
  const declaration = authority.declaration;
  const executableSha256Hex = normalizeExecutableSha256Hex(
    declaration.verifierExecutableSha256Hex,
    'authority-bound native verifier executable digest',
  );
  const executionBoundary = Object.freeze({
    mode: 'source-refreshed-authority-contained-candidate-only' as const,
    sourceOwnedAttestorLockReloadedPerLaunch: true as const,
    executionPolicyValidatedPerLaunch: true as const,
    installerEpochFloorRequired: true as const,
    containedProcessRequired: true as const,
    settlementAuthorityGranted: false as const,
    gate5Closed: false as const,
  });

  return Object.freeze({
    executionBoundary,
    executableSha256Hex,
    deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string {
      return deriveExecutableInvocationSha256Hex(executableSha256Hex, [
        '--trusted-anchor-digest',
        hashHex(trustedAnchorDigestHex, 'trustedAnchorDigestHex'),
      ]);
    },
    async verify(input: {
      trustedAnchorDigestHex: string;
      request: NativeFinalizedBridgeCheckpointRequest;
    }): Promise<NativeFinalizedBridgeCheckpointVerification> {
      const prepared = prepareNativeFinalizedBridgeCheckpointVerification(input);
      const result = await authority.execute({
        operation: 'verify-checkpoint',
        trustedAnchorDigestHex: prepared.trustedAnchorDigestHex,
        requestBytes: prepared.requestBytes,
      });
      assertNativeVerifierExecutionAuthorityResultProvenance({ authority, result });
      if (result.operation !== 'verify-checkpoint') {
        throw new Error('authority-bound native verifier result operation does not match');
      }
      return finalizeNativeFinalizedBridgeCheckpointVerification({
        stdout: result.stdout,
        prepared,
        executableProvenance: {
          executablePath: realpathSync(declaration.verifierExecutablePath),
          executableSha256Hex,
          executionMode: 'source-refreshed-authority-contained-candidate-only',
          authority,
        },
      });
    },
  });
}

interface PreparedNativeFinalizedBridgeCheckpointVerification {
  request: NativeFinalizedBridgeCheckpointRequest;
  trustedAnchorDigestHex: string;
  requestBytes: Buffer;
  requestDigestHex: string;
}

function prepareNativeFinalizedBridgeCheckpointVerification(input: {
  trustedAnchorDigestHex: unknown;
  request: unknown;
}): PreparedNativeFinalizedBridgeCheckpointVerification {
  const request = normalizeNativeFinalizedBridgeCheckpointRequest(input?.request);
  const trustedAnchorDigestHex = hashHex(
    input?.trustedAnchorDigestHex,
    'trustedAnchorDigestHex',
  );
  if (deriveNativeGrandpaTrustAnchorDigestHex(request) !== trustedAnchorDigestHex) {
    throw new Error('native verifier request trust anchor does not match the independently supplied digest');
  }
  const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
  if (requestBytes.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  return {
    request,
    trustedAnchorDigestHex,
    requestBytes,
    requestDigestHex: blake2b256Hex(requestBytes),
  };
}

function finalizeNativeFinalizedBridgeCheckpointVerification(input: {
  stdout: Buffer;
  prepared: PreparedNativeFinalizedBridgeCheckpointVerification;
  executableProvenance: NativeVerifierExecutableProvenance;
}): NativeFinalizedBridgeCheckpointVerification {
  const verification = normalizeVerification(
    parseSingleJsonObject(input.stdout),
    input.prepared.request,
    input.prepared.requestDigestHex,
    input.prepared.trustedAnchorDigestHex,
  );
  NATIVE_VERIFICATION_EXECUTABLES.set(
    verification,
    deepFreeze(input.executableProvenance),
  );
  return verification;
}

export function buildNativeVerifiedBridgeCheckpoint(
  verification: NativeFinalizedBridgeCheckpointVerification,
): NativeVerifiedBridgeCheckpoint {
  if (
    typeof verification !== 'object' ||
    verification === null ||
    !NATIVE_VERIFICATION_RESULTS.has(verification)
  ) {
    throw new Error('native verification result lacks verifier provenance');
  }
  requireLiteral(
    verification?.schema,
    NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA,
    'native verification schema',
  );
  requireLiteral(
    verification.status,
    'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    'native verification status',
  );
  requireLiteral(
    verification.authority?.linkedAncestryVerified,
    true,
    'native verification linked ancestry',
  );
  requireLiteral(
    verification.finality?.verified,
    true,
    'native verification finality',
  );
  requireLiteral(
    verification.runtimeState?.verified,
    true,
    'native verification runtime state',
  );
  requireLiteral(
    verification.boundary?.sidechainFinalityVerified,
    true,
    'native verification sidechain finality boundary',
  );
  requireLiteral(
    verification.boundary.ergoExtensionAnchorVerified,
    false,
    'native verification Ergo anchor boundary',
  );
  requireLiteral(
    verification.boundary.onChainAcceptanceVerified,
    false,
    'native verification on-chain boundary',
  );
  requireLiteral(
    verification.boundary.transactionMutationEnabled,
    false,
    'native verification transaction boundary',
  );
  requireLiteral(
    verification.boundary.gate5Closed,
    false,
    'native verification Gate 5 boundary',
  );

  const checkpointCommitment = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: stripHexPrefix(verification.commitment.sidechainIdHex),
    sidechainHeight: verification.commitment.sidechainHeight,
    sidechainConsensusBlockHashHex: stripHexPrefix(
      verification.target.nativeBlockHashHex,
    ),
    executionBlockHashHex: stripHexPrefix(
      verification.commitment.executionBlockHashHex,
    ),
    bridgeEventRootHex: stripHexPrefix(verification.commitment.bridgeEventRootHex),
    burnLeafCount: verification.commitment.burnLeafCount,
    finalityAuthoritySetId: verification.authority.finalitySigningSetId,
    finalityAuthoritySetHashHex: stripHexPrefix(
      verification.authority.finalitySigningAuthoritySetHashHex,
    ),
    finalityProofHashHex: deriveGrandpaJustificationHashHex(
      hexBytes(verification.finality.canonicalJustificationScaleHex),
    ),
  });
  const finalityStatement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpointCommitment.encodedCheckpointHex,
    checkpointCommitmentHex: checkpointCommitment.checkpointCommitmentHex,
    trustedAnchorDigestHex: stripHexPrefix(verification.trustAnchorDigestHex),
    finalityHorizonHeight: verification.finality.horizonHeight,
    finalityHorizonHashHex: stripHexPrefix(verification.finality.horizonHashHex),
  });

  const checkpoint = deepFreeze({
    schema: NATIVE_VERIFIED_BRIDGE_CHECKPOINT_SCHEMA,
    status: 'NATIVE_VERIFIED',
    nativeVerification: structuredClone(verification),
    checkpointCommitment,
    finalityStatement,
    checks: {
      hashLinkedAuthorityPathVerified: true,
      grandpaFinalityVerified: true,
      runtimeStateProofVerified: true,
      canonicalJustificationCommitted: true,
      canonicalFinalityStatementBound: true,
    },
    boundary: {
      checkpointCandidateOnly: true,
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  }) as unknown as NativeVerifiedBridgeCheckpoint;
  const executableProvenance = NATIVE_VERIFICATION_EXECUTABLES.get(verification);
  if (!executableProvenance) {
    throw new Error('native verification result lacks executable provenance');
  }
  NATIVE_VERIFIED_CHECKPOINT_RESULTS.add(checkpoint);
  NATIVE_VERIFIED_CHECKPOINT_EXECUTABLES.set(checkpoint, executableProvenance);
  return checkpoint;
}

export function buildNativeCheckpointAggregateFinalityProofV1(input: {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  request: NativeFinalizedBridgeCheckpointRequest;
}): AggregateFinalityProofV1 {
  assertNativeVerifiedBridgeCheckpointProvenance(input?.checkpoint);
  const request = normalizeNativeFinalizedBridgeCheckpointRequest(input?.request);
  const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
  if (requestBytes.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }
  const requestDigestHex = blake2b256Hex(requestBytes);
  if (
    requestDigestHex
    !== input.checkpoint.nativeVerification.requestDigestHex
  ) {
    throw new Error('native aggregate finality proof request does not match the verified checkpoint');
  }
  if (
    stripHexPrefix(deriveNativeGrandpaTrustAnchorDigestHex(request))
    !== input.checkpoint.finalityStatement.trustedAnchorDigestHex
  ) {
    throw new Error('native aggregate finality proof trust anchor does not match the finality statement');
  }
  const executableProvenance = NATIVE_VERIFIED_CHECKPOINT_EXECUTABLES.get(input.checkpoint);
  if (!executableProvenance) {
    throw new Error('native verified checkpoint lacks executable provenance');
  }
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: stripHexPrefix(executableProvenance.executableSha256Hex),
    encodedStatement: input.checkpoint.finalityStatement.encodedStatementHex,
    payload: requestBytes,
  });
  NATIVE_CHECKPOINT_AGGREGATE_FINALITY_PROOFS.set(proof, input.checkpoint);
  return proof;
}

export function assertNativeCheckpointAggregateFinalityProofProvenance(
  proof: unknown,
  checkpoint: NativeVerifiedBridgeCheckpoint,
): asserts proof is AggregateFinalityProofV1 {
  assertNativeVerifiedBridgeCheckpointProvenance(checkpoint);
  if (
    typeof proof !== 'object'
    || proof === null
    || NATIVE_CHECKPOINT_AGGREGATE_FINALITY_PROOFS.get(proof) !== checkpoint
  ) {
    throw new Error('native checkpoint aggregate finality proof provenance is missing');
  }
}

export function assertNativeVerifiedBridgeCheckpointProvenance(
  checkpoint: unknown,
): asserts checkpoint is NativeVerifiedBridgeCheckpoint {
  if (
    typeof checkpoint !== 'object'
    || checkpoint === null
    || !NATIVE_VERIFIED_CHECKPOINT_RESULTS.has(checkpoint)
  ) {
    throw new Error('native verified checkpoint provenance is missing');
  }
}

export function assertNativeVerifiedBridgeCheckpointExecutableProvenance(
  checkpoint: NativeVerifiedBridgeCheckpoint,
  expected: {
    executablePath: string;
    executableSha256Hex: string;
  },
): void {
  assertNativeVerifiedBridgeCheckpointProvenance(checkpoint);
  const observed = NATIVE_VERIFIED_CHECKPOINT_EXECUTABLES.get(checkpoint);
  if (!observed) {
    throw new Error('native verified checkpoint executable provenance is missing');
  }
  const expectedPath = realpathSync(validateExecutablePath(expected?.executablePath));
  const expectedSha256Hex = normalizeExecutableSha256Hex(
    expected?.executableSha256Hex,
    'expected native verifier executable digest',
  );
  if (!sameExecutablePath(observed.executablePath, expectedPath)) {
    throw new Error('native verified checkpoint was produced by a different executable');
  }
  if (observed.executableSha256Hex !== expectedSha256Hex) {
    throw new Error('native verified checkpoint executable digest does not match the expected verifier');
  }
}

export function assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance(
  checkpoint: NativeVerifiedBridgeCheckpoint,
  authority: NativeVerifierExecutionAuthority,
): void {
  assertNativeVerifiedBridgeCheckpointProvenance(checkpoint);
  assertNativeVerifierExecutionAuthorityProvenance(authority);
  const observed = NATIVE_VERIFIED_CHECKPOINT_EXECUTABLES.get(checkpoint);
  if (
    !observed
    || observed.executionMode !== 'source-refreshed-authority-contained-candidate-only'
    || observed.authority !== authority
  ) {
    throw new Error(
      'native verified checkpoint lacks source-refreshed authority execution provenance',
    );
  }
}

export function normalizeNativeFinalizedBridgeCheckpointRequest(
  value: unknown,
): NativeFinalizedBridgeCheckpointRequest {
  const record = exactRecord(value, [
    'schema',
    'trustAnchor',
    'targetNativeBlockHashHex',
    'targetHeaderScaleHex',
    'linkedGrandpaProofs',
    'checkpointTailHeadersScaleHex',
    'finalityProofScaleHex',
    'runtimeStateProofNodesHex',
  ], 'request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    'request.schema',
  );

  const trustAnchor = exactRecord(record.trustAnchor, [
    'sidechainIdHex',
    'checkpointHashHex',
    'checkpointNumber',
    'grandpaSetId',
    'authorityListScaleHex',
  ], 'request.trustAnchor');
  const linkedGrandpaProofs = denseArray(
    record.linkedGrandpaProofs,
    0,
    MAX_LINKED_GRANDPA_PROOFS,
    'request.linkedGrandpaProofs',
  );
  let totalAncestryHeaders = 0;
  let requestHexBytes = 0;
  const accountRequestHex = (value: string, label: string): string => {
    requestHexBytes += hexByteLength(value);
    if (requestHexBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
      throw new Error(
        `native verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes while reading ${label}`,
      );
    }
    return value;
  };
  const normalizedLinkedProofs = linkedGrandpaProofs.map((entry, proofIndex) => {
    const proof = exactRecord(entry, [
      'ancestryHeadersScaleHex',
      'proofScaleHex',
    ], `request.linkedGrandpaProofs[${proofIndex}]`);
    const ancestryHeaders = denseArray(
      proof.ancestryHeadersScaleHex,
      1,
      MAX_ANCESTRY_HEADERS_PER_PROOF,
      `request.linkedGrandpaProofs[${proofIndex}].ancestryHeadersScaleHex`,
    );
    totalAncestryHeaders += ancestryHeaders.length;
    if (totalAncestryHeaders > MAX_TOTAL_ANCESTRY_HEADERS) {
      throw new Error(
        `request linked GRANDPA ancestry exceeds ${MAX_TOTAL_ANCESTRY_HEADERS} headers`,
      );
    }
    const ancestryHeadersScaleHex = ancestryHeaders.map((header, headerIndex) => {
      const label =
        `request.linkedGrandpaProofs[${proofIndex}].ancestryHeadersScaleHex[${headerIndex}]`;
      return accountRequestHex(
        byteHex(
          header,
          MAX_HEADER_BYTES,
          label,
        ),
        label,
      );
    });
    const proofLabel = `request.linkedGrandpaProofs[${proofIndex}].proofScaleHex`;
    return {
      ancestryHeadersScaleHex,
      proofScaleHex: accountRequestHex(
        byteHex(proof.proofScaleHex, MAX_GRANDPA_PROOF_BYTES, proofLabel),
        proofLabel,
      ),
    };
  });

  const checkpointTailHeaders = denseArray(
    record.checkpointTailHeadersScaleHex,
    0,
    MAX_CHECKPOINT_TAIL_HEADERS,
    'request.checkpointTailHeadersScaleHex',
  );
  totalAncestryHeaders += checkpointTailHeaders.length;
  if (totalAncestryHeaders > MAX_TOTAL_ANCESTRY_HEADERS) {
    throw new Error(
      `request checkpoint ancestry exceeds ${MAX_TOTAL_ANCESTRY_HEADERS} headers`,
    );
  }
  const checkpointTailHeadersScaleHex = checkpointTailHeaders.map(
    (header, headerIndex) => {
      const label = `request.checkpointTailHeadersScaleHex[${headerIndex}]`;
      return accountRequestHex(
        byteHex(header, MAX_HEADER_BYTES, label),
        label,
      );
    },
  );

  const runtimeStateProofNodes = denseArray(
    record.runtimeStateProofNodesHex,
    1,
    MAX_RUNTIME_STATE_PROOF_NODES,
    'request.runtimeStateProofNodesHex',
  );
  let runtimeProofBytes = 0;
  const normalizedRuntimeNodes = runtimeStateProofNodes.map((node, index) => {
    const label = `request.runtimeStateProofNodesHex[${index}]`;
    const normalized = accountRequestHex(
      byteHex(node, MAX_RUNTIME_STATE_PROOF_NODE_BYTES, label),
      label,
    );
    runtimeProofBytes += hexByteLength(normalized);
    if (runtimeProofBytes > MAX_RUNTIME_STATE_PROOF_BYTES) {
      throw new Error(
        `request runtime state proof exceeds ${MAX_RUNTIME_STATE_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });

  const checkpointNumber = decimalUint64(
    trustAnchor.checkpointNumber,
    'request.trustAnchor.checkpointNumber',
  );

  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: {
      sidechainIdHex: hashHex(
        trustAnchor.sidechainIdHex,
        'request.trustAnchor.sidechainIdHex',
      ),
      checkpointHashHex: hashHex(
        trustAnchor.checkpointHashHex,
        'request.trustAnchor.checkpointHashHex',
      ),
      checkpointNumber,
      grandpaSetId: decimalUint64(
        trustAnchor.grandpaSetId,
        'request.trustAnchor.grandpaSetId',
      ),
      authorityListScaleHex: byteHex(
        trustAnchor.authorityListScaleHex,
        MAX_AUTHORITY_LIST_BYTES,
        'request.trustAnchor.authorityListScaleHex',
      ),
    },
    targetNativeBlockHashHex: hashHex(
      record.targetNativeBlockHashHex,
      'request.targetNativeBlockHashHex',
    ),
    targetHeaderScaleHex: byteHex(
      record.targetHeaderScaleHex,
      MAX_HEADER_BYTES,
      'request.targetHeaderScaleHex',
    ),
    linkedGrandpaProofs: normalizedLinkedProofs,
    checkpointTailHeadersScaleHex,
    finalityProofScaleHex: accountRequestHex(
      byteHex(
        record.finalityProofScaleHex,
        MAX_FINALITY_PROOF_BYTES,
        'request.finalityProofScaleHex',
      ),
      'request.finalityProofScaleHex',
    ),
    runtimeStateProofNodesHex: normalizedRuntimeNodes,
  };
}

function normalizeVerification(
  value: unknown,
  request: NativeFinalizedBridgeCheckpointRequest,
  requestDigestHex: string,
  trustedAnchorDigestHex: string,
): NativeFinalizedBridgeCheckpointVerification {
  const record = exactRecord(value, [
    'schema',
    'status',
    'requestDigestHex',
    'trustAnchorDigestHex',
    'target',
    'authority',
    'finality',
    'runtimeState',
    'commitment',
    'boundary',
  ], 'verification');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA,
    'verification.schema',
  );
  requireLiteral(
    record.status,
    'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    'verification.status',
  );

  const target = exactRecord(record.target, [
    'nativeBlockHashHex',
    'nativeHeight',
    'stateRootHex',
  ], 'verification.target');
  const authority = exactRecord(record.authority, [
    'finalitySigningSetId',
    'finalitySigningAuthorityListScaleHex',
    'finalitySigningAuthoritySetHashHex',
    'transitionCount',
    'linkedAncestryVerified',
  ], 'verification.authority');
  const finality = exactRecord(record.finality, [
    'horizonHashHex',
    'horizonHeight',
    'canonicalJustificationScaleHex',
    'verified',
  ], 'verification.finality');
  const runtimeState = exactRecord(record.runtimeState, [
    'storageKeyHex',
    'storageValueScaleHex',
    'proofNodeCount',
    'proofBytes',
    'verified',
  ], 'verification.runtimeState');
  const commitment = exactRecord(record.commitment, [
    'sidechainIdHex',
    'sidechainHeight',
    'executionBlockHashHex',
    'bridgeEventRootHex',
    'burnLeafCount',
  ], 'verification.commitment');
  const boundary = exactRecord(record.boundary, [
    'sidechainFinalityVerified',
    'ergoExtensionAnchorVerified',
    'onChainAcceptanceVerified',
    'transactionMutationEnabled',
    'gate5Closed',
  ], 'verification.boundary');

  const echoedRequestDigest = hashHex(
    record.requestDigestHex,
    'verification.requestDigestHex',
  );
  if (echoedRequestDigest !== requestDigestHex) {
    throw new Error('native verifier request digest does not match the exact request bytes');
  }
  const trustAnchorDigest = hashHex(
    record.trustAnchorDigestHex,
    'verification.trustAnchorDigestHex',
  );
  if (trustAnchorDigest !== trustedAnchorDigestHex) {
    throw new Error('native verifier trust-anchor digest does not match the independent trust root');
  }
  const independentlyDerivedTrustAnchorDigest = deriveNativeGrandpaTrustAnchorDigestHex(request);
  if (trustedAnchorDigestHex !== independentlyDerivedTrustAnchorDigest) {
    throw new Error('native verifier trust-anchor digest is not bound to the request fields');
  }

  const nativeBlockHashHex = hashHex(
    target.nativeBlockHashHex,
    'verification.target.nativeBlockHashHex',
  );
  if (nativeBlockHashHex !== request.targetNativeBlockHashHex) {
    throw new Error('native verifier target hash does not match the requested target');
  }
  const nativeHeight = decimalUint64(
    target.nativeHeight,
    'verification.target.nativeHeight',
  );
  if (BigInt(nativeHeight) < BigInt(request.trustAnchor.checkpointNumber)) {
    throw new Error('native verifier target height precedes the trust anchor');
  }

  const transitionCount = boundedInteger(
    authority.transitionCount,
    0,
    MAX_TOTAL_AUTHORITY_TRANSITIONS,
    'verification.authority.transitionCount',
  );
  const finalitySigningSetId = decimalUint64(
    authority.finalitySigningSetId,
    'verification.authority.finalitySigningSetId',
  );
  const expectedFinalitySigningSetId = BigInt(request.trustAnchor.grandpaSetId) +
    BigInt(transitionCount);
  if (
    expectedFinalitySigningSetId > UINT64_MAX ||
    BigInt(finalitySigningSetId) !== expectedFinalitySigningSetId
  ) {
    throw new Error('native verifier finality-signing GRANDPA set ID is not linked to the trust anchor');
  }

  const finalitySigningAuthorityListScaleHex = byteHex(
    authority.finalitySigningAuthorityListScaleHex,
    MAX_AUTHORITY_LIST_BYTES,
    'verification.authority.finalitySigningAuthorityListScaleHex',
  );
  const finalitySigningAuthoritySetHashHex = hashHex(
    authority.finalitySigningAuthoritySetHashHex,
    'verification.authority.finalitySigningAuthoritySetHashHex',
  );
  if (
    finalitySigningAuthoritySetHashHex !==
    deriveNativeGrandpaAuthoritySetHashHex(finalitySigningAuthorityListScaleHex)
  ) {
    throw new Error('native verifier finality-signing authority-set hash is inconsistent');
  }

  const horizonHashHex = hashHex(
    finality.horizonHashHex,
    'verification.finality.horizonHashHex',
  );
  const horizonHeight = decimalUint64(
    finality.horizonHeight,
    'verification.finality.horizonHeight',
  );
  if (BigInt(horizonHeight) < BigInt(nativeHeight)) {
    throw new Error('native verifier finality horizon precedes the target');
  }
  const canonicalJustificationScaleHex = byteHex(
    finality.canonicalJustificationScaleHex,
    MAX_FINALITY_PROOF_BYTES,
    'verification.finality.canonicalJustificationScaleHex',
  );

  const proofNodeCount = boundedInteger(
    runtimeState.proofNodeCount,
    1,
    MAX_RUNTIME_STATE_PROOF_NODES,
    'verification.runtimeState.proofNodeCount',
  );
  if (proofNodeCount !== request.runtimeStateProofNodesHex.length) {
    throw new Error('native verifier proof-node count does not match the request');
  }
  const expectedProofBytes = request.runtimeStateProofNodesHex.reduce(
    (total, node) => total + hexByteLength(node),
    0,
  );
  const proofBytes = boundedInteger(
    runtimeState.proofBytes,
    1,
    MAX_RUNTIME_STATE_PROOF_BYTES,
    'verification.runtimeState.proofBytes',
  );
  if (proofBytes !== expectedProofBytes) {
    throw new Error('native verifier proof byte count does not match the request');
  }

  const sidechainIdHex = hashHex(
    commitment.sidechainIdHex,
    'verification.commitment.sidechainIdHex',
  );
  if (sidechainIdHex !== request.trustAnchor.sidechainIdHex) {
    throw new Error('native verifier commitment sidechain ID does not match the trust anchor');
  }
  const sidechainHeight = decimalUint64(
    commitment.sidechainHeight,
    'verification.commitment.sidechainHeight',
  );
  if (sidechainHeight !== nativeHeight) {
    throw new Error('native verifier commitment height does not match the target');
  }
  const executionBlockHashHex = hashHex(
    commitment.executionBlockHashHex,
    'verification.commitment.executionBlockHashHex',
  );
  const bridgeEventRootHex = hashHex(
    commitment.bridgeEventRootHex,
    'verification.commitment.bridgeEventRootHex',
  );
  const burnLeafCount = boundedInteger(
    commitment.burnLeafCount,
    1,
    MAX_BURN_LEAF_COUNT,
    'verification.commitment.burnLeafCount',
  );
  const storageKeyHex = byteHex(
    runtimeState.storageKeyHex,
    BRIDGE_COMMITMENT_STORAGE_KEY_HEX.length / 2 - 1,
    'verification.runtimeState.storageKeyHex',
  );
  if (storageKeyHex !== BRIDGE_COMMITMENT_STORAGE_KEY_HEX) {
    throw new Error('native verifier runtime storage key is not the bridge commitment key');
  }
  const storageValueScaleHex = byteHex(
    runtimeState.storageValueScaleHex,
    BRIDGE_COMMITMENT_V1_SCALE_BYTES,
    'verification.runtimeState.storageValueScaleHex',
  );
  if (
    hexByteLength(storageValueScaleHex) !== BRIDGE_COMMITMENT_V1_SCALE_BYTES ||
    storageValueScaleHex !== encodeBridgeCommitmentScaleHex({
      sidechainIdHex,
      sidechainHeight,
      executionBlockHashHex,
      bridgeEventRootHex,
      burnLeafCount,
    })
  ) {
    throw new Error('native verifier runtime storage value is inconsistent with the commitment');
  }

  requireLiteral(
    authority.linkedAncestryVerified,
    true,
    'verification.authority.linkedAncestryVerified',
  );
  requireLiteral(finality.verified, true, 'verification.finality.verified');
  requireLiteral(runtimeState.verified, true, 'verification.runtimeState.verified');
  requireLiteral(
    boundary.sidechainFinalityVerified,
    true,
    'verification.boundary.sidechainFinalityVerified',
  );
  requireLiteral(
    boundary.ergoExtensionAnchorVerified,
    false,
    'verification.boundary.ergoExtensionAnchorVerified',
  );
  requireLiteral(
    boundary.onChainAcceptanceVerified,
    false,
    'verification.boundary.onChainAcceptanceVerified',
  );
  requireLiteral(
    boundary.transactionMutationEnabled,
    false,
    'verification.boundary.transactionMutationEnabled',
  );
  requireLiteral(boundary.gate5Closed, false, 'verification.boundary.gate5Closed');

  const normalized: NativeFinalizedBridgeCheckpointVerificationPayload = {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_VERIFICATION_SCHEMA,
    status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    requestDigestHex: echoedRequestDigest,
    trustAnchorDigestHex: trustAnchorDigest,
    target: {
      nativeBlockHashHex,
      nativeHeight,
      stateRootHex: hashHex(target.stateRootHex, 'verification.target.stateRootHex'),
    },
    authority: {
      finalitySigningSetId,
      finalitySigningAuthorityListScaleHex,
      finalitySigningAuthoritySetHashHex,
      transitionCount,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex,
      horizonHeight,
      canonicalJustificationScaleHex,
      verified: true,
    },
    runtimeState: {
      storageKeyHex,
      storageValueScaleHex,
      proofNodeCount,
      proofBytes,
      verified: true,
    },
    commitment: {
      sidechainIdHex,
      sidechainHeight,
      executionBlockHashHex,
      bridgeEventRootHex,
      burnLeafCount,
    },
    boundary: {
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  };
  const branded = normalized as NativeFinalizedBridgeCheckpointVerification;
  NATIVE_VERIFICATION_RESULTS.add(branded);
  return deepFreeze(branded);
}

async function runVerifier(input: {
  executablePath: string;
  executableArgs: string[];
  timeoutMs: number;
  requestBytes: Buffer;
}): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    let child;
    try {
      child = spawn(input.executablePath, input.executableArgs, {
        shell: false,
        windowsHide: true,
        cwd: dirname(input.executablePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: minimalVerifierEnvironment(),
      });
    } catch {
      reject(new Error('failed to spawn native verifier'));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let termination: 'timeout' | 'stdout' | 'stderr' | null = null;
    let spawnFailed = false;
    let stdinFailed = false;
    let settled = false;

    const finish = (error?: Error, stdout?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout ?? Buffer.alloc(0));
    };
    const terminate = (reason: typeof termination) => {
      if (termination !== null) return;
      termination = reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => terminate('timeout'), input.timeoutMs);

    child.once('error', () => {
      spawnFailed = true;
    });
    child.stdin.once('error', () => {
      stdinFailed = true;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_NATIVE_VERIFIER_STDOUT_BYTES) {
        terminate('stdout');
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_NATIVE_VERIFIER_STDERR_BYTES) terminate('stderr');
    });
    child.once('close', (code, signal) => {
      if (termination === 'timeout') {
        finish(new Error(`native verifier timed out after ${input.timeoutMs} ms`));
        return;
      }
      if (termination === 'stdout') {
        finish(new Error(
          `native verifier stdout exceeds ${MAX_NATIVE_VERIFIER_STDOUT_BYTES} bytes`,
        ));
        return;
      }
      if (termination === 'stderr') {
        finish(new Error(
          `native verifier stderr exceeds ${MAX_NATIVE_VERIFIER_STDERR_BYTES} bytes`,
        ));
        return;
      }
      if (spawnFailed) {
        finish(new Error('failed to spawn native verifier'));
        return;
      }
      if (stdinFailed) {
        finish(new Error('failed to write the bounded request to the native verifier'));
        return;
      }
      if (code !== 0) {
        if (code === null) {
          finish(new Error(`native verifier terminated by signal ${signal ?? 'unknown'}`));
        } else {
          finish(new Error(`native verifier exited with code ${code}`));
        }
        return;
      }
      finish(undefined, Buffer.concat(stdoutChunks, stdoutBytes));
    });

    child.stdin.end(input.requestBytes);
  });
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) throw new Error('native verifier produced empty stdout');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch {
    throw new Error('native verifier stdout is not valid UTF-8');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('native verifier stdout must contain exactly one JSON result');
  }
}

function validateExecutablePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    !isAbsolute(value)
  ) {
    throw new Error('native verifier executablePath must be a non-empty absolute path');
  }
  return value;
}

function sameExecutablePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function validateExecutableArgs(value: readonly string[]): string[] {
  const maxPrefixArguments = MAX_EXECUTABLE_ARGS - 2;
  if (!Array.isArray(value) || value.length > maxPrefixArguments) {
    throw new Error(`native verifier executableArgs must contain at most ${maxPrefixArguments} arguments`);
  }
  let totalBytes = 0;
  return value.map((argument, index) => {
    if (typeof argument !== 'string' || argument.includes('\0')) {
      throw new Error(`native verifier executableArgs[${index}] must be a NUL-free string`);
    }
    totalBytes += Buffer.byteLength(argument, 'utf8');
    if (totalBytes > MAX_EXECUTABLE_ARGV_BYTES) {
      throw new Error(`native verifier argv exceeds ${MAX_EXECUTABLE_ARGV_BYTES} bytes`);
    }
    return argument;
  });
}

function validateTimeout(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > MAX_TIMEOUT_MS) {
    throw new Error(`native verifier timeoutMs must be between 1 and ${MAX_TIMEOUT_MS}`);
  }
  return Number(value);
}

function minimalVerifierEnvironment(): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return {};
  const env: NodeJS.ProcessEnv = {};
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
  return env;
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(fields);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} has unknown field ${key}`);
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw new Error(`${label} is missing field ${field}`);
    }
  }
  return record;
}

function denseArray(
  value: unknown,
  minLength: number,
  maxLength: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw new Error(`${label} must contain between ${minLength} and ${maxLength} entries`);
  }
  const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must be a dense array without extra fields`);
  }
  return value;
}

function hashHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lower-case 0x-prefixed 32-byte hex value`);
  }
  return value;
}

function byteHex(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lower-case 0x-prefixed whole-byte hex`);
  }
  const byteLength = hexByteLength(value);
  if (byteLength > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return value;
}

function decimalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint64 string`);
  }
  if (BigInt(value) > UINT64_MAX) throw new Error(`${label} exceeds uint64`);
  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function requireLiteral<T extends string | boolean>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is T {
  if (value !== expected) throw new Error(`${label} must be exactly ${String(expected)}`);
}

function hexByteLength(value: string): number {
  return (value.length - 2) / 2;
}

function blake2b256Hex(bytes: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
}

export function deriveNativeGrandpaAuthoritySetHashHex(
  authorityListScaleHex: string,
): string {
  const normalized = byteHex(
    authorityListScaleHex,
    MAX_AUTHORITY_LIST_BYTES,
    'GRANDPA authority list',
  );
  return blake2b256Hex(Buffer.concat([
    GRANDPA_AUTHORITY_SET_DOMAIN,
    hexBytes(normalized),
  ]));
}

export function deriveNativeGrandpaTrustAnchorDigestHex(
  request: NativeFinalizedBridgeCheckpointRequest,
): string {
  return deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor(
    request.trustAnchor,
  );
}

export function deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor(
  trustAnchor: NativeGrandpaTrustAnchor,
): string {
  const sidechainIdHex = hashHex(
    trustAnchor.sidechainIdHex,
    'GRANDPA trust-anchor sidechain ID',
  );
  const checkpointHashHex = hashHex(
    trustAnchor.checkpointHashHex,
    'GRANDPA trust-anchor checkpoint hash',
  );
  const checkpointNumberValue = decimalUint64(
    trustAnchor.checkpointNumber,
    'GRANDPA trust-anchor checkpoint number',
  );
  const grandpaSetIdValue = decimalUint64(
    trustAnchor.grandpaSetId,
    'GRANDPA trust-anchor set ID',
  );
  const authorityListScaleHex = byteHex(
    trustAnchor.authorityListScaleHex,
    MAX_AUTHORITY_LIST_BYTES,
    'GRANDPA trust-anchor authority list',
  );
  const checkpointNumber = Buffer.alloc(8);
  checkpointNumber.writeBigUInt64BE(BigInt(checkpointNumberValue));
  const setId = Buffer.alloc(8);
  setId.writeBigUInt64BE(BigInt(grandpaSetIdValue));
  return blake2b256Hex(Buffer.concat([
    GRANDPA_TRUST_ANCHOR_DOMAIN,
    hexBytes(sidechainIdHex),
    hexBytes(checkpointHashHex),
    checkpointNumber,
    setId,
    hexBytes(deriveNativeGrandpaAuthoritySetHashHex(authorityListScaleHex)),
  ]));
}

function encodeBridgeCommitmentScaleHex(value: {
  sidechainIdHex: string;
  sidechainHeight: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
}): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64LE(BigInt(value.sidechainHeight));
  const count = Buffer.alloc(4);
  count.writeUInt32LE(value.burnLeafCount);
  return `0x${Buffer.concat([
    Buffer.from([1]),
    hexBytes(value.sidechainIdHex),
    height,
    hexBytes(value.executionBlockHashHex),
    hexBytes(value.bridgeEventRootHex),
    count,
  ]).toString('hex')}`;
}

function hexBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}
