import {
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance,
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance,
  type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate,
  type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';
import {
  buildNativeVerifiedBridgeCheckpoint,
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  verifyNativeFinalizedBridgeCheckpoint,
  type AuthorityBoundNativeFinalizedBridgeCheckpointVerifier,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerification,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import {
  NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
  assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance,
  assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance,
  deriveNativeFinalizedPegInStateRequestDigestHex,
  normalizeNativeFinalizedPegInStateRequest,
  normalizeNativePegInStateStatementV1,
  type AuthorityBoundNativeFinalizedPegInStateVerification,
  type AuthorityBoundNativeFinalizedPegInStateVerifier,
  type NativeFinalizedPegInStateRequest,
  type NativePegInStateStatementV1,
} from './native-finalized-peg-in-state.js';
import {
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
  type NativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
  normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request,
  type NativeFinalizedPegInFrontierExecutionIdentityV1Request,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
  normalizeNativeFinalizedPegInFrontierEventV1Request,
  type NativeFinalizedPegInFrontierEventV1Request,
} from './native-finalized-peg-in-frontier-event-v1.js';
import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
  normalizeNativeFinalizedPegInFrontierContractStateV1Request,
  type NativeFinalizedPegInFrontierContractStateV1Request,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
  normalizeNativeFinalizedPegInFrontierMintTransitionV1Request,
  type NativeFinalizedPegInFrontierMintTransitionV1Request,
} from './native-finalized-peg-in-frontier-mint-transition-v1.js';
import {
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
  PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
  normalizeNativeFinalizedPegInCausalMintTransitionV2Request,
  type NativeFinalizedPegInCausalMintTransitionV2Request,
} from './native-finalized-peg-in-causal-mint-transition-v2.js';
import {
  NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
  PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA,
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV3Request,
  type NativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import {
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance,
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance,
  type PinnedLocalCausalV3ResultCandidate,
  type PinnedLocalCausalV3ResultCandidateEvaluator,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import type { NativeSubstrateRpcProofCodec } from './native-substrate-rpc-proof-codec.js';
import { normalizeExecutableSha256Hex } from './native-executable-pin.js';
import {
  normalizePegInFrontierExecutionIdentityStatementV1,
  type PegInFrontierExecutionIdentityStatementV1,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  normalizePegInFrontierEventStatementV1,
  type PegInFrontierEventStatementV1,
} from './peg-in-frontier-event-v1.js';
import {
  normalizePegInFrontierContractStateStatementV1,
  type PegInFrontierContractStateStatementV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  derivePegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';
import type { PegInCausalRuntimeStorageKeysV2 } from './peg-in-causal-runtime-state-v2.js';
import {
  normalizePegInRuntimeIdentityStatementV2,
  type PegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';
import { decodePegInRuntimeRecordV1ScaleHex } from './peg-in-runtime-state.js';
import {
  decodeCanonicalGrandpaAuthorityListScaleHex,
  requestBridgeCommitmentReadProof,
  requestGrandpaAuthorityTransitionProofScaleHex,
  requestGrandpaFinalityProofScaleHex,
  requestPegInFrontierExecutionIdentityReadProofV1,
  requestPegInFrontierContractStateReadProofV1,
  requestPegInFrontierEventReadProofV1,
  requestPegInFrontierMintTransitionParentStateReadProofV1,
  requestPegInFrontierMintTransitionPostStateReadProofV1,
  requestPegInCausalMintTransitionParentStateReadProofV2,
  requestPegInCausalMintTransitionPostStateReadProofV2,
  requestPegInCausalMintTransitionParentStateReadProofV3,
  requestPegInCausalMintTransitionPostStateReadProofV3,
  requestPegInRuntimeIdentityReadProofV2,
  requestPegInRuntimeStateReadProof,
  requestSubstrateBlockHashAt,
  requestSubstrateFinalizedHeadHash,
  requestSubstrateHeaderObservation,
  type ReadOnlySubstrateFinalityRpc,
} from './substrate-finality-provider.js';

export const COLLECTED_NATIVE_CHECKPOINT_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-checkpoint-request.v2';
export const COLLECTED_NATIVE_CHECKPOINT_VERIFICATION_SCHEMA =
  'e2s.collected-native-finalized-checkpoint-verification.v2';

const MAX_LINKED_GRANDPA_PROOFS = 16;
const MAX_ANCESTRY_HEADERS_PER_PROOF = 4_096;
const MAX_CHECKPOINT_TAIL_HEADERS = 4_096;
const MAX_TOTAL_ANCESTRY_HEADERS =
  MAX_LINKED_GRANDPA_PROOFS * MAX_ANCESTRY_HEADERS_PER_PROOF +
  MAX_CHECKPOINT_TAIL_HEADERS;
const DEFAULT_DEADLINE_MS = 2 * 60_000;
const MAX_DEADLINE_MS = 10 * 60_000;
const DEFAULT_RPC_CONCURRENCY = 8;
const MAX_RPC_CONCURRENCY = 32;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 3;

export type NativeTrustAnchor =
  NativeFinalizedBridgeCheckpointRequest['trustAnchor'];

export interface CollectNativeCheckpointRequestInput {
  rpc: ReadOnlySubstrateFinalityRpc;
  codec: NativeSubstrateRpcProofCodec;
  trustAnchor: NativeTrustAnchor;
  targetNativeBlockHashHex: string;
  deadlineMs?: number;
  rpcConcurrency?: number;
}

export interface CollectedNativeCheckpointRequest {
  schema: typeof COLLECTED_NATIVE_CHECKPOINT_REQUEST_SCHEMA;
  request: NativeFinalizedBridgeCheckpointRequest;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateProofNodeCount: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getStorage',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

interface CollectAndVerifyNativeCheckpointBaseInput
  extends CollectNativeCheckpointRequestInput {
  trustedAnchorDigestHex: string;
  maxAttempts?: number;
}

export type CollectAndVerifyNativeCheckpointInput =
  CollectAndVerifyNativeCheckpointBaseInput & (
    | {
      verifier: AuthorityBoundNativeFinalizedBridgeCheckpointVerifier;
      verifierExecutablePath?: never;
      verifierExecutableSha256Hex?: never;
      verifierExecutableInvocationSha256Hex?: never;
      verifierExecutableArgs?: never;
      verifierTimeoutMs?: never;
    }
    | {
      verifier?: never;
      verifierExecutablePath: string;
      verifierExecutableSha256Hex: string;
      verifierExecutableInvocationSha256Hex: string;
      verifierExecutableArgs?: readonly string[];
      verifierTimeoutMs?: number;
    }
  );

export interface CollectedNativeCheckpointVerification {
  schema: typeof COLLECTED_NATIVE_CHECKPOINT_VERIFICATION_SCHEMA;
  attemptCount: number;
  collection: CollectedNativeCheckpointRequest;
  verification: NativeFinalizedBridgeCheckpointVerification;
  checkpoint: NativeVerifiedBridgeCheckpoint;
  nativeExecutablePins: {
    codecSha256Hex: string;
    codecInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    verifierSha256Hex: string;
    verifierInvocationSha256Hex: string;
  };
  boundary: {
    readOnlyRpc: true;
    sidechainFinalityVerified: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export const COLLECTED_NATIVE_PEG_IN_STATE_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-state-request.v1';
export const COLLECTED_NATIVE_PEG_IN_STATE_VERIFICATION_SCHEMA =
  'e2s.collected-native-finalized-peg-in-state-verification.v1';
export const COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-runtime-identity-request.v2';
export const COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA =
  'e2s.collected-native-finalized-peg-in-runtime-identity-candidate.v2';
export const COLLECTED_NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-frontier-execution-identity-request.v1';
export const COLLECTED_NATIVE_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-frontier-event-request.v1';
export const COLLECTED_NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-frontier-contract-state-request.v1';
export const COLLECTED_NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-frontier-mint-transition-request.v1';
export const COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-causal-mint-transition-request.v2';
export const COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA =
  'e2s.collected-native-finalized-peg-in-causal-mint-transition-request.v3';
export const COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_CANDIDATE_SCHEMA =
  'e2s.collected-native-finalized-peg-in-causal-mint-transition-candidate.v3';

export interface CollectNativePegInStateRequestInput
  extends CollectNativeCheckpointRequestInput {
  statement: NativePegInStateStatementV1;
}

export interface CollectedNativePegInStateRequest {
  schema: typeof COLLECTED_NATIVE_PEG_IN_STATE_REQUEST_SCHEMA;
  request: NativeFinalizedPegInStateRequest;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateOutcome: 'membership' | 'nonMembership';
    runtimeStateStorageKeysHex: string[];
    runtimeStateProofNodeCount: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    statementRuntimeStateVerified: false;
    historicalMintAbsenceVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export interface CollectNativePegInRuntimeIdentityV2RequestInput
  extends CollectNativeCheckpointRequestInput {
  statement: PegInRuntimeIdentityStatementV2;
}

export interface CollectedNativePegInRuntimeIdentityV2Request {
  schema: typeof COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA;
  request: NativeFinalizedPegInRuntimeIdentityV2Request;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateOutcome: 'membership' | 'nonMembership';
    runtimeStateStorageKeysHex: string[];
    runtimeStateProofNodeCount: number;
    runtimeStateProofBytes: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    statementRuntimeStateVerified: false;
    runtimeCodeStateProofVerified: false;
    runtimeBuildAttestationVerified: false;
    historicalMintAbsenceVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export interface CollectNativePegInFrontierExecutionIdentityV1RequestInput
  extends CollectNativeCheckpointRequestInput {
  statement: PegInFrontierExecutionIdentityStatementV1;
}

export interface CollectedNativePegInFrontierExecutionIdentityV1Request {
  schema:
    typeof COLLECTED_NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA;
  request: NativeFinalizedPegInFrontierExecutionIdentityV1Request;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateStorageKeysHex: readonly [string, string, string];
    runtimeStateProofNodeCount: number;
    runtimeStateProofBytes: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    runtimeCodeStateProofVerified: false;
    currentBlockStateProofVerified: false;
    processedRecordStateProofVerified: false;
    executionBlockHashMappedToNativeState: false;
    transactionRootRecomputed: false;
    ommersHashRecomputed: false;
    recordTransactionBoundExactlyOnce: false;
    receiptInclusionVerified: false;
    transactionStatusVerified: false;
    depositEventSemanticsVerified: false;
    evmCodeStateVerified: false;
    evmStorageStateVerified: false;
    runtimeBuildAttestationVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    runtimeUpgradeHistoryVerified: false;
    historicalMintAbsenceVerified: false;
    mintAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  };
}

export interface CollectNativePegInFrontierEventV1RequestInput
  extends CollectNativeCheckpointRequestInput {
  executionIdentityStatement: PegInFrontierExecutionIdentityStatementV1;
  statement: PegInFrontierEventStatementV1;
}

export interface CollectedNativePegInFrontierEventV1Request {
  schema: typeof COLLECTED_NATIVE_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA;
  request: NativeFinalizedPegInFrontierEventV1Request;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateStorageKeysHex: readonly [string, string, string, string, string];
    runtimeStateProofNodeCount: number;
    runtimeStateProofBytes: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    executionIdentityVerified: false;
    receiptStateProofVerified: false;
    receiptsRootRecomputed: false;
    transactionStatusVerified: false;
    successfulReceiptVerified: false;
    depositEventSemanticsVerified: false;
    evmCodeStateVerified: false;
    evmStorageStateVerified: false;
    runtimeBuildAttestationVerified: false;
    runtimeCodeIdentityVerified: false;
    runtimeUpgradeHistoryVerified: false;
    committedVaultTransitionVerified: false;
    historicalMintAbsenceVerified: false;
    mintAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  };
}

export interface CollectNativePegInFrontierContractStateV1RequestInput
  extends CollectNativeCheckpointRequestInput {
  executionIdentityStatement: PegInFrontierExecutionIdentityStatementV1;
  eventStatement: PegInFrontierEventStatementV1;
  contractStateStatement: PegInFrontierContractStateStatementV1;
}

export interface CollectedNativePegInFrontierContractStateV1Request {
  schema: typeof COLLECTED_NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA;
  request: NativeFinalizedPegInFrontierContractStateV1Request;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    runtimeStateStorageKeysHex: readonly [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    runtimeStateProofNodeCount: number;
    runtimeStateProofBytes: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    executionIdentityVerified: false;
    receiptStateProofVerified: false;
    receiptsRootRecomputed: false;
    transactionStatusVerified: false;
    successfulReceiptVerified: false;
    depositEventSemanticsVerified: false;
    evmCodeStateVerified: false;
    evmStorageStateVerified: false;
    runtimeBuildAttestationVerified: false;
    runtimeCodeIdentityVerified: false;
    runtimeUpgradeHistoryVerified: false;
    historicalCodeContinuityVerified: false;
    historicalReceiptStateProofCompletenessVerified: false;
    committedVaultTransitionVerified: false;
    historicalMintAbsenceVerified: false;
    mintAuthorized: false;
    settlementAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  };
}

export interface CollectNativePegInFrontierMintTransitionV1RequestInput
  extends CollectNativePegInFrontierContractStateV1RequestInput {}

export interface CollectedNativePegInFrontierMintTransitionV1Request {
  schema: typeof COLLECTED_NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA;
  request: NativeFinalizedPegInFrontierMintTransitionV1Request;
  acquisition: {
    finalizedHeadHashHex: string;
    finalizedHeadNumber: string;
    targetHashHex: string;
    targetNumber: string;
    parentHashHex: string;
    parentNumber: string;
    linkedProofCount: number;
    ancestryHeaderCount: number;
    finalityHorizonHashHex: string;
    finalityHorizonNumber: string;
    postStateStorageKeysHex: readonly [
      string, string, string, string, string, string, string,
      string, string, string, string, string, string,
    ];
    postStateProofNodeCount: number;
    postStateProofBytes: number;
    parentStateStorageKeysHex: readonly [
      string, string, string, string, string, string, string, string, string, string,
    ];
    parentStateProofNodeCount: number;
    parentStateProofBytes: number;
    codecExecutableSha256Hex: string;
    codecExecutableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ];
  };
  boundary: {
    readOnlyRpc: true;
    candidatePackageOnly: true;
    rpcCodecCryptographicallyVerified: false;
    sidechainFinalityVerified: false;
    directParentVerified: false;
    prePostStateVerified: false;
    replayTransitionVerified: false;
    exactMintDeltasVerified: false;
    pairedMintLogVerified: false;
    singleTokenEffectVerified: false;
    reviewedDeploymentLineageVerified: false;
    committedVaultTransitionVerified: false;
    historicalMintAbsenceVerified: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    settlementAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  };
}

export interface CollectNativePegInCausalMintTransitionV2RequestInput
  extends CollectNativePegInFrontierMintTransitionV1RequestInput {}

export interface CollectedNativePegInCausalMintTransitionV2Request {
  readonly schema: typeof COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA;
  readonly request: NativeFinalizedPegInCausalMintTransitionV2Request;
  readonly acquisition: {
    readonly finalizedHeadHashHex: string;
    readonly finalizedHeadNumber: string;
    readonly targetHashHex: string;
    readonly targetNumber: string;
    readonly parentHashHex: string;
    readonly parentNumber: string;
    readonly linkedProofCount: number;
    readonly ancestryHeaderCount: number;
    readonly finalityHorizonHashHex: string;
    readonly finalityHorizonNumber: string;
    readonly postPendingKeysScaleHex: string;
    readonly postPendingRecordKeysHex: readonly string[];
    readonly postStateStorageKeysHex: readonly string[];
    readonly postStateProofNodeCount: number;
    readonly postStateProofBytes: number;
    readonly parentPendingKeysScaleHex: string;
    readonly parentPendingRecordKeysHex: readonly string[];
    readonly parentStateStorageKeysHex: readonly string[];
    readonly parentStateProofNodeCount: number;
    readonly parentStateProofBytes: number;
    readonly codecExecutableSha256Hex: string;
    readonly codecExecutableInvocationSha256Hex: {
      readonly encodeHeaders: string;
      readonly inspectWarpProof: string;
      readonly inspectFinalityProof: string;
    };
    readonly rpcMethods: readonly [
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getStorage',
      'state_getReadProof',
    ];
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly candidatePackageOnly: true;
    readonly rpcCodecCryptographicallyVerified: false;
    readonly sidechainFinalityVerified: false;
    readonly directParentVerified: false;
    readonly prePostStateVerified: false;
    readonly causalAdmissionTransitionVerified: false;
    readonly replayTransitionVerified: false;
    readonly exactMintDeltasVerified: false;
    readonly pairedMintLogVerified: false;
    readonly singleTokenEffectVerified: false;
    readonly reviewedDeploymentLineageVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly mintAuthorized: false;
    readonly daemonAdmissionAuthorized: false;
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

export interface CollectNativePegInCausalMintTransitionV3RequestInput
  extends CollectNativePegInCausalMintTransitionV2RequestInput {}

export interface CollectedNativePegInCausalMintTransitionV3Request
  extends Omit<
    CollectedNativePegInCausalMintTransitionV2Request,
    'boundary' | 'request' | 'schema'
  > {
  readonly schema: typeof COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA;
  readonly request: NativeFinalizedPegInCausalMintTransitionV3Request;
  readonly boundary: CollectedNativePegInCausalMintTransitionV2Request['boundary'] & {
    readonly federatedSourceProofReceiptAuthenticated: false;
    readonly trustlessSourceProofVerified: false;
  };
}

export interface CollectNativePegInCausalMintTransitionV3CandidateInput
  extends CollectNativePegInCausalMintTransitionV3RequestInput {
  readonly trustedAnchorDigestHex: string;
  readonly evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
  readonly maxAttempts?: number;
}

export interface CollectedNativePegInCausalMintTransitionV3Candidate {
  readonly schema:
    typeof COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_CANDIDATE_SCHEMA;
  readonly attemptCount: number;
  readonly collection: CollectedNativePegInCausalMintTransitionV3Request;
  readonly candidate: PinnedLocalCausalV3ResultCandidate;
  readonly nativeExecutablePins: {
    readonly codecSha256Hex: string;
    readonly codecInvocationSha256Hex: {
      readonly encodeHeaders: string;
      readonly inspectWarpProof: string;
      readonly inspectFinalityProof: string;
    };
    readonly verifierSha256Hex: string;
    readonly verifierInvocationSha256Hex: string;
    readonly verifierExecutionPolicySha256: string;
    readonly sourceExecutionIdentityDigestHex: string;
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly sourceRefreshedBeforeAndAfterExecution: true;
    readonly brokerSelfImageBoundToAuthorityRecordV2: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly candidateOutputOnly: true;
    readonly nativeVerifierExecutionAuthenticated: false;
    readonly reportedProofShapeValidated: true;
    readonly sidechainFinalityVerified: false;
    readonly directParentChildVerified: false;
    readonly causalPrePostStateVerified: false;
    readonly exactCausalSuccessorVerified: false;
    readonly federatedSourceProofReceiptAuthenticated: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly trustlessSourceProofVerified: false;
    readonly independentBuildAttestationVerified: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly lifecycleReferenceJoined: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly daemonAdmissionAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export interface CollectNativePegInRuntimeIdentityV2CandidateInput
  extends CollectNativePegInRuntimeIdentityV2RequestInput {
  trustedAnchorDigestHex: string;
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  maxAttempts?: number;
}

export interface CollectedNativePegInRuntimeIdentityV2Candidate {
  schema:
    typeof COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA;
  attemptCount: number;
  collection: CollectedNativePegInRuntimeIdentityV2Request;
  candidate:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
  nativeExecutablePins: {
    codecSha256Hex: string;
    codecInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    verifierSha256Hex: string;
    verifierInvocationSha256Hex: string;
    verifierExecutionPolicySha256: string;
    runtimeCodeSha256Hex: string;
    runtimeBuildPacketSha256Hex: string;
  };
  boundary: {
    readOnlyRpc: true;
    sidechainFinalityVerified: false;
    statementRuntimeStateVerified: false;
    runtimeCodeStateProofVerified: false;
    runtimeBuildAttestationVerified: true;
    nativeVerifierAttestationVerified: true;
    immutableLauncherInstallationRequired: true;
    authorityRecordV2Required: true;
    launcherInstallationActivationCampaignCompleted: false;
    launcherAtomicBootstrapProven: false;
    targetRuntimeBuildEvidenceMatched: false;
    targetRuntimeBuildIdentityVerified: false;
    targetStateCodeIsHistoricalProducerCode: false;
    runtimeUpgradeHistoryVerified: false;
    cutoverPolicyVerified: false;
    historicalMintAbsenceVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface CollectAndVerifyNativePegInStateInput
  extends CollectNativePegInStateRequestInput {
  trustedAnchorDigestHex: string;
  verifier: AuthorityBoundNativeFinalizedPegInStateVerifier;
  maxAttempts?: number;
}

export interface CollectedNativePegInStateVerification {
  schema: typeof COLLECTED_NATIVE_PEG_IN_STATE_VERIFICATION_SCHEMA;
  attemptCount: number;
  collection: CollectedNativePegInStateRequest;
  verification: AuthorityBoundNativeFinalizedPegInStateVerification;
  nativeExecutablePins: {
    codecSha256Hex: string;
    codecInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
    verifierSha256Hex: string;
    verifierInvocationSha256Hex: string;
    verifierExecutionPolicySha256: string;
  };
  boundary: {
    readOnlyRpc: true;
    sidechainFinalityVerified: true;
    statementRuntimeStateVerified: true;
    historicalMintAbsenceVerified: false;
    runtimeCodeIdentityVerified: false;
    committedVaultTransitionVerified: false;
    mintAuthorityGranted: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export class NativeCheckpointCollectionDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeCheckpointCollectionDriftError';
  }
}

export interface NativeCheckpointFinalityBounds {
  checkpointNumber: number;
  targetNumber: number;
  finalizedHeadNumber: number;
  finality?: {
    horizonNumber: number;
    unknownHeaderCount: number;
  };
}

export function validateNativeCheckpointFinalityBounds(
  bounds: NativeCheckpointFinalityBounds,
): void {
  const checkpointNumber = boundedInteger(
    bounds?.checkpointNumber,
    0,
    Number.MAX_SAFE_INTEGER,
    'reviewed trust checkpoint number',
  );
  const targetNumber = boundedInteger(
    bounds?.targetNumber,
    0,
    Number.MAX_SAFE_INTEGER,
    'target native block number',
  );
  const finalizedHeadNumber = boundedInteger(
    bounds?.finalizedHeadNumber,
    0,
    Number.MAX_SAFE_INTEGER,
    'observed finalized head number',
  );
  if (targetNumber < checkpointNumber) {
    throw new Error('target native block precedes the reviewed trust checkpoint');
  }
  if (targetNumber > finalizedHeadNumber) {
    throw new Error('target native block is above the observed finalized head');
  }
  if (!bounds.finality) return;
  const horizonNumber = boundedInteger(
    bounds.finality.horizonNumber,
    0,
    Number.MAX_SAFE_INTEGER,
    'target finality horizon number',
  );
  const unknownHeaderCount = boundedInteger(
    bounds.finality.unknownHeaderCount,
    0,
    Number.MAX_SAFE_INTEGER,
    'target finality unknown-header count',
  );
  if (
    horizonNumber < targetNumber
    || horizonNumber - targetNumber !== unknownHeaderCount
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'target finality proof header span changed during collection',
    );
  }
  if (horizonNumber > finalizedHeadNumber) {
    throw new NativeCheckpointCollectionDriftError(
      'target finality horizon is above the observed finalized head',
    );
  }
}

export async function collectNativeFinalizedCheckpointRequest(
  input: CollectNativeCheckpointRequestInput,
): Promise<CollectedNativeCheckpointRequest> {
  const material = await collectNativeFinalityMaterial(input);
  const runtimeStateProof = await requestBridgeCommitmentReadProof(
    material.rpc,
    material.targetHash,
  );
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(`0x${node}`, `runtime state proof node ${nodeIndex}`);
  }
  material.checkDeadline();
  const request: NativeFinalizedBridgeCheckpointRequest = {
    schema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
    trustAnchor: material.trustAnchor,
    targetNativeBlockHashHex: material.targetHash,
    targetHeaderScaleHex: material.targetHeaderScaleHex,
    linkedGrandpaProofs: material.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: material.finalityProofScaleHex,
    runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
  };
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(`native checkpoint request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`);
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_CHECKPOINT_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getStorage',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  });
}

export async function collectNativeFinalizedPegInStateRequest(
  input: CollectNativePegInStateRequestInput,
): Promise<CollectedNativePegInStateRequest> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const statement = normalizeNativePegInStateStatementV1(
    input?.statement,
    trustAnchor.sidechainIdHex,
  );
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const runtimeStateProof = await requestPegInRuntimeStateReadProof(material.rpc, {
    nativeBlockHashHex: material.targetHash,
    sidechainIdHex: material.trustAnchor.sidechainIdHex,
    ergoBoxIdHex: statement.ergoBoxIdHex,
    outcome: statement.record.outcome,
  });
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(`0x${node}`, `peg-in runtime state proof node ${nodeIndex}`);
  }
  material.checkDeadline();
  const request = normalizeNativeFinalizedPegInStateRequest({
    schema: NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
    trustAnchor: material.trustAnchor,
    targetNativeBlockHashHex: material.targetHash,
    targetHeaderScaleHex: material.targetHeaderScaleHex,
    linkedGrandpaProofs: material.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: material.finalityProofScaleHex,
    statement,
    runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native peg-in state request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_STATE_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateOutcome: runtimeStateProof.outcome,
      runtimeStateStorageKeysHex: runtimeStateProof.storageKeysHex,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  });
}

/**
 * Collect one finalized-state proof that jointly authenticates raw `:code` and peg-in state.
 *
 * The returned package is proof material only. It does not authenticate the referenced build
 * attestation, execute the native verifier, release a reconciliation hold, or grant mint authority.
 */
export async function collectNativeFinalizedPegInRuntimeIdentityV2Request(
  input: CollectNativePegInRuntimeIdentityV2RequestInput,
): Promise<CollectedNativePegInRuntimeIdentityV2Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const statement = normalizePegInRuntimeIdentityStatementV2(
    input?.statement,
    trustAnchor.sidechainIdHex,
  );
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const runtimeStateProof = await requestPegInRuntimeIdentityReadProofV2(
    material.rpc,
    {
      nativeBlockHashHex: material.targetHash,
      sidechainIdHex: material.trustAnchor.sidechainIdHex,
      ergoBoxIdHex: statement.ergoBoxIdHex,
      outcome: statement.record.outcome,
    },
  );
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in runtime identity V2 proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request({
    schema: NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
    trustAnchor: material.trustAnchor,
    targetNativeBlockHashHex: material.targetHash,
    targetHeaderScaleHex: material.targetHeaderScaleHex,
    linkedGrandpaProofs: material.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: material.finalityProofScaleHex,
    statement,
    runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native peg-in runtime identity V2 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateOutcome: runtimeStateProof.outcome,
      runtimeStateStorageKeysHex: runtimeStateProof.storageKeysHex,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      runtimeStateProofBytes: runtimeStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeBuildAttestationVerified: false,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  });
}

/**
 * Collect one finalized-state proof for exact runtime, Frontier block, and processed-record bytes.
 *
 * The returned package is proof material only. It does not execute a verifier, authenticate any
 * receipt, status, event, EVM state, build, runtime identity, vault transition, history, or mint.
 */
export async function collectNativeFinalizedPegInFrontierExecutionIdentityV1Request(
  input: CollectNativePegInFrontierExecutionIdentityV1RequestInput,
): Promise<CollectedNativePegInFrontierExecutionIdentityV1Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const statement = normalizePegInFrontierExecutionIdentityStatementV1(
    input?.statement,
    trustAnchor.sidechainIdHex,
  );
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const runtimeStateProof =
    await requestPegInFrontierExecutionIdentityReadProofV1(
      material.rpc,
      {
        nativeBlockHashHex: material.targetHash,
        sidechainIdHex: material.trustAnchor.sidechainIdHex,
        ergoBoxIdHex: statement.ergoBoxIdHex,
      },
    );
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in Frontier execution identity V1 proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const request = normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    trustAnchor: material.trustAnchor,
    targetNativeBlockHashHex: material.targetHash,
    targetHeaderScaleHex: material.targetHeaderScaleHex,
    linkedGrandpaProofs: material.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
    finalityProofScaleHex: material.finalityProofScaleHex,
    statement,
    runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native peg-in Frontier execution identity V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema:
      COLLECTED_NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateStorageKeysHex: runtimeStateProof.storageKeysHex,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      runtimeStateProofBytes: runtimeStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
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
      runtimeUpgradeHistoryVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    },
  });
}

/**
 * Collect one finalized five-key proof for a successful Frontier `PegIn` event request.
 *
 * The result is immutable candidate material only. It does not execute either native verifier,
 * authenticate receipt/event claims, authorize mint selection, mutate lifecycle state, sign,
 * submit, or broadcast.
 */
export async function collectNativeFinalizedPegInFrontierEventV1Request(
  input: CollectNativePegInFrontierEventV1RequestInput,
): Promise<CollectedNativePegInFrontierEventV1Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const executionIdentityStatement =
    normalizePegInFrontierExecutionIdentityStatementV1(
      input?.executionIdentityStatement,
      trustAnchor.sidechainIdHex,
    );
  const statement = normalizePegInFrontierEventStatementV1(input?.statement);
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const runtimeStateProof = await requestPegInFrontierEventReadProofV1(
    material.rpc,
    {
      nativeBlockHashHex: material.targetHash,
      sidechainIdHex: material.trustAnchor.sidechainIdHex,
      ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    },
  );
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in Frontier event V1 proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
      trustAnchor: material.trustAnchor,
      targetNativeBlockHashHex: material.targetHash,
      targetHeaderScaleHex: material.targetHeaderScaleHex,
      linkedGrandpaProofs: material.linkedGrandpaProofs,
      checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
      finalityProofScaleHex: material.finalityProofScaleHex,
      statement: executionIdentityStatement,
      runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
    });
  const request = normalizeNativeFinalizedPegInFrontierEventV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement,
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native peg-in Frontier event V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateStorageKeysHex: runtimeStateProof.storageKeysHex,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      runtimeStateProofBytes: runtimeStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
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
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    },
  });
}

/**
 * Collect one finalized twelve-key request for event, contract-code, and contract-storage state.
 *
 * The package remains read-only and candidate-only. It does not execute the native verifier,
 * authenticate the supplied trust root, establish historical completeness, release a hold,
 * authorize funds, sign, submit, or broadcast.
 */
export async function collectNativeFinalizedPegInFrontierContractStateV1Request(
  input: CollectNativePegInFrontierContractStateV1RequestInput,
): Promise<CollectedNativePegInFrontierContractStateV1Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const executionIdentityStatement =
    normalizePegInFrontierExecutionIdentityStatementV1(
      input?.executionIdentityStatement,
      trustAnchor.sidechainIdHex,
    );
  const eventStatement = normalizePegInFrontierEventStatementV1(input?.eventStatement);
  const contractStateStatement = normalizePegInFrontierContractStateStatementV1(
    input?.contractStateStatement,
    executionIdentityStatement.ergoBoxIdHex,
  );
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const runtimeStateProof = await requestPegInFrontierContractStateReadProofV1(
    material.rpc,
    {
      nativeBlockHashHex: material.targetHash,
      sidechainIdHex: material.trustAnchor.sidechainIdHex,
      ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
      bridgeAddressHex: contractStateStatement.bridgeAddressHex,
      tokenAddressHex: contractStateStatement.tokenAddressHex,
    },
  );
  for (const [nodeIndex, node] of runtimeStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in Frontier contract-state V1 proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
      trustAnchor: material.trustAnchor,
      targetNativeBlockHashHex: material.targetHash,
      targetHeaderScaleHex: material.targetHeaderScaleHex,
      linkedGrandpaProofs: material.linkedGrandpaProofs,
      checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
      finalityProofScaleHex: material.finalityProofScaleHex,
      statement: executionIdentityStatement,
      runtimeStateProofNodesHex: runtimeStateProof.proofNodesHex.map(node => `0x${node}`),
    });
  const eventRequest = normalizeNativeFinalizedPegInFrontierEventV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement: eventStatement,
  });
  const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest,
    statement: contractStateStatement,
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
    throw new Error(
      `native peg-in Frontier contract-state V1 request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      runtimeStateStorageKeysHex: runtimeStateProof.storageKeysHex,
      runtimeStateProofNodeCount: runtimeStateProof.proofNodesHex.length,
      runtimeStateProofBytes: runtimeStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
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
}

/**
 * Collect one exact finalized event-block/post-state proof and its direct-parent proof.
 *
 * The two proof surfaces are read-only and remain candidate material. Collection does not execute
 * the Rust verifier, authenticate its executable, join reviewed deployment lineage, prove the
 * preceding Ergo vault transition, authorize mint admission, mutate state, sign, or broadcast.
 */
export async function collectNativeFinalizedPegInFrontierMintTransitionV1Request(
  input: CollectNativePegInFrontierMintTransitionV1RequestInput,
): Promise<CollectedNativePegInFrontierMintTransitionV1Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const executionIdentityStatement =
    normalizePegInFrontierExecutionIdentityStatementV1(
      input?.executionIdentityStatement,
      trustAnchor.sidechainIdHex,
    );
  const eventStatement = normalizePegInFrontierEventStatementV1(input?.eventStatement);
  const contractStateStatement = normalizePegInFrontierContractStateStatementV1(
    input?.contractStateStatement,
    executionIdentityStatement.ergoBoxIdHex,
  );
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionIdentityStatement.expectedRecordScaleHex,
  );
  const transitionStatement = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress,
  });
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const targetNumber = Number(material.acquisition.targetNumber);
  if (targetNumber === 0) {
    throw new Error('Frontier mint-transition event block cannot be genesis');
  }
  const parentNumber = targetNumber - 1;
  const canonicalParentHash = await requestSubstrateBlockHashAt(
    material.rpc,
    parentNumber,
  );
  if (canonicalParentHash !== material.targetParentHash) {
    throw new NativeCheckpointCollectionDriftError(
      'Frontier mint-transition target parent changed canonical identity during collection',
    );
  }
  const parentObservation = await requestSubstrateHeaderObservation(
    material.rpc,
    canonicalParentHash,
  );
  const [encodedParent] = await material.codec.encodeHeaders([{
    expectedHashHex: canonicalParentHash,
    header: parentObservation,
  }]);
  if (
    !encodedParent
    || encodedParent.hashHex !== canonicalParentHash
    || encodedParent.number !== parentNumber.toString()
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'Frontier mint-transition parent header differs from canonical RPC ancestry',
    );
  }
  material.accountMaterial(
    encodedParent.headerScaleHex,
    'peg-in Frontier mint-transition parent header',
  );

  const proofIdentity = {
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    bridgeAddressHex: contractStateStatement.bridgeAddressHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress as string,
  };
  const [postStateProof, parentStateProof] = await Promise.all([
    requestPegInFrontierMintTransitionPostStateReadProofV1(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: material.targetHash,
    }),
    requestPegInFrontierMintTransitionParentStateReadProofV1(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: canonicalParentHash,
    }),
  ]);
  for (const [nodeIndex, node] of postStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in Frontier mint-transition post-state proof node ${nodeIndex}`,
    );
  }
  for (const [nodeIndex, node] of parentStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in Frontier mint-transition parent-state proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const [canonicalTargetAfterProof, canonicalParentAfterProof] = await Promise.all([
    requestSubstrateBlockHashAt(material.rpc, targetNumber),
    requestSubstrateBlockHashAt(material.rpc, parentNumber),
  ]);
  if (
    canonicalTargetAfterProof !== material.targetHash
    || canonicalParentAfterProof !== canonicalParentHash
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'Frontier mint-transition parent/event identities changed during proof collection',
    );
  }

  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
      trustAnchor: material.trustAnchor,
      targetNativeBlockHashHex: material.targetHash,
      targetHeaderScaleHex: material.targetHeaderScaleHex,
      linkedGrandpaProofs: material.linkedGrandpaProofs,
      checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
      finalityProofScaleHex: material.finalityProofScaleHex,
      statement: executionIdentityStatement,
      runtimeStateProofNodesHex: postStateProof.proofNodesHex.map(node => `0x${node}`),
    });
  const eventRequest = normalizeNativeFinalizedPegInFrontierEventV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement: eventStatement,
  });
  const contractStateRequest =
    normalizeNativeFinalizedPegInFrontierContractStateV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
      eventRequest,
      statement: contractStateStatement,
    });
  const request = normalizeNativeFinalizedPegInFrontierMintTransitionV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    contractStateRequest,
    parentNativeBlockHashHex: canonicalParentHash,
    parentHeaderScaleHex: encodedParent.headerScaleHex,
    parentStateProofNodesHex: parentStateProof.proofNodesHex.map(node => `0x${node}`),
    statement: transitionStatement,
  });
  const exactRequestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (exactRequestBytes > MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native peg-in Frontier mint-transition V1 request exceeds ${MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      parentHashHex: canonicalParentHash,
      parentNumber: parentNumber.toString(),
      postStateStorageKeysHex: postStateProof.storageKeysHex,
      postStateProofNodeCount: postStateProof.proofNodesHex.length,
      postStateProofBytes: postStateProof.proofBytes,
      parentStateStorageKeysHex: parentStateProof.storageKeysHex,
      parentStateProofNodeCount: parentStateProof.proofNodesHex.length,
      parentStateProofBytes: parentStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      directParentVerified: false,
      prePostStateVerified: false,
      replayTransitionVerified: false,
      exactMintDeltasVerified: false,
      pairedMintLogVerified: false,
      singleTokenEffectVerified: false,
      reviewedDeploymentLineageVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
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
}

/**
 * Collect the exact T20C finalized child/direct-parent request with causal runtime-state keys.
 *
 * RPC supplies bounded candidate bytes only. The returned package does not execute either native
 * verifier, authenticate trie semantics, authorize mint admission, mutate lifecycle state, sign,
 * submit, or broadcast.
 */
export async function collectNativeFinalizedPegInCausalMintTransitionV2Request(
  input: CollectNativePegInCausalMintTransitionV2RequestInput,
): Promise<CollectedNativePegInCausalMintTransitionV2Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const executionIdentityStatement =
    normalizePegInFrontierExecutionIdentityStatementV1(
      input?.executionIdentityStatement,
      trustAnchor.sidechainIdHex,
    );
  const eventStatement = normalizePegInFrontierEventStatementV1(input?.eventStatement);
  const contractStateStatement = normalizePegInFrontierContractStateStatementV1(
    input?.contractStateStatement,
    executionIdentityStatement.ergoBoxIdHex,
  );
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionIdentityStatement.expectedRecordScaleHex,
  );
  const transitionStatement = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress,
  });
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const targetNumber = Number(material.acquisition.targetNumber);
  if (targetNumber === 0) {
    throw new Error('causal mint-transition finalized child cannot be genesis');
  }
  const parentNumber = targetNumber - 1;
  const canonicalParentHash = await requestSubstrateBlockHashAt(
    material.rpc,
    parentNumber,
  );
  if (canonicalParentHash !== material.targetParentHash) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition finalized child parent changed canonical identity during collection',
    );
  }
  const parentObservation = await requestSubstrateHeaderObservation(
    material.rpc,
    canonicalParentHash,
  );
  const [encodedParent] = await material.codec.encodeHeaders([{
    expectedHashHex: canonicalParentHash,
    header: parentObservation,
  }]);
  if (
    !encodedParent
    || encodedParent.hashHex !== canonicalParentHash
    || encodedParent.number !== parentNumber.toString()
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition parent header differs from canonical RPC ancestry',
    );
  }
  material.accountMaterial(
    encodedParent.headerScaleHex,
    'peg-in causal mint-transition parent header',
  );

  const proofIdentity = {
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    bridgeAddressHex: contractStateStatement.bridgeAddressHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress as string,
  };
  const [postStateProof, parentStateProof] = await Promise.all([
    requestPegInCausalMintTransitionPostStateReadProofV2(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: material.targetHash,
    }),
    requestPegInCausalMintTransitionParentStateReadProofV2(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: canonicalParentHash,
    }),
  ]);
  material.accountMaterial(
    postStateProof.pendingKeysScaleHex,
    'peg-in causal mint-transition child pending-key list',
  );
  material.accountMaterial(
    parentStateProof.pendingKeysScaleHex,
    'peg-in causal mint-transition parent pending-key list',
  );
  for (const [nodeIndex, node] of postStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in causal mint-transition child-state proof node ${nodeIndex}`,
    );
  }
  for (const [nodeIndex, node] of parentStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in causal mint-transition parent-state proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const [canonicalTargetAfterProof, canonicalParentAfterProof] = await Promise.all([
    requestSubstrateBlockHashAt(material.rpc, targetNumber),
    requestSubstrateBlockHashAt(material.rpc, parentNumber),
  ]);
  if (
    canonicalTargetAfterProof !== material.targetHash
    || canonicalParentAfterProof !== canonicalParentHash
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition parent/child identities changed during proof collection',
    );
  }
  if (
    Object.keys(postStateProof.causalStorageKeys).some(key =>
      postStateProof.causalStorageKeys[key as keyof PegInCausalRuntimeStorageKeysV2]
        !== parentStateProof.causalStorageKeys[key as keyof PegInCausalRuntimeStorageKeysV2]
    )
  ) {
    throw new Error('causal mint-transition parent/child storage-key derivations disagree');
  }

  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
      trustAnchor: material.trustAnchor,
      targetNativeBlockHashHex: material.targetHash,
      targetHeaderScaleHex: material.targetHeaderScaleHex,
      linkedGrandpaProofs: material.linkedGrandpaProofs,
      checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
      finalityProofScaleHex: material.finalityProofScaleHex,
      statement: executionIdentityStatement,
      runtimeStateProofNodesHex: postStateProof.proofNodesHex.map(node => `0x${node}`),
    });
  const eventRequest = normalizeNativeFinalizedPegInFrontierEventV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement: eventStatement,
  });
  const contractStateRequest = normalizeNativeFinalizedPegInFrontierContractStateV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest,
    statement: contractStateStatement,
  });
  const mintTransitionRequest = normalizeNativeFinalizedPegInFrontierMintTransitionV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    contractStateRequest,
    parentNativeBlockHashHex: canonicalParentHash,
    parentHeaderScaleHex: encodedParent.headerScaleHex,
    parentStateProofNodesHex: parentStateProof.proofNodesHex.map(node => `0x${node}`),
    statement: transitionStatement,
  });
  const request = normalizeNativeFinalizedPegInCausalMintTransitionV2Request({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    mintTransitionRequest,
    statement: {
      schema: PEG_IN_CAUSAL_MINT_TRANSITION_V2_STATEMENT_SCHEMA,
      ...postStateProof.causalStorageKeys,
    },
  });

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      parentHashHex: canonicalParentHash,
      parentNumber: parentNumber.toString(),
      postPendingKeysScaleHex: postStateProof.pendingKeysScaleHex,
      postPendingRecordKeysHex: postStateProof.discoveredPendingRecordKeysHex,
      postStateStorageKeysHex: postStateProof.storageKeysHex,
      postStateProofNodeCount: postStateProof.proofNodesHex.length,
      postStateProofBytes: postStateProof.proofBytes,
      parentPendingKeysScaleHex: parentStateProof.pendingKeysScaleHex,
      parentPendingRecordKeysHex: parentStateProof.discoveredPendingRecordKeysHex,
      parentStateStorageKeysHex: parentStateProof.storageKeysHex,
      parentStateProofNodeCount: parentStateProof.proofNodesHex.length,
      parentStateProofBytes: parentStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getStorage',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      directParentVerified: false,
      prePostStateVerified: false,
      causalAdmissionTransitionVerified: false,
      replayTransitionVerified: false,
      exactMintDeltasVerified: false,
      pairedMintLogVerified: false,
      singleTokenEffectVerified: false,
      reviewedDeploymentLineageVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
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
}

/**
 * Collect the V3 finalized child/direct-parent request with exact receipt-map coverage.
 *
 * RPC supplies bounded candidate bytes only. Receipt collection does not authenticate the
 * federated source proof, execute the native verifier, authorize mint admission, release a hold,
 * mutate lifecycle state, sign, submit, or broadcast.
 */
export async function collectNativeFinalizedPegInCausalMintTransitionV3Request(
  input: CollectNativePegInCausalMintTransitionV3RequestInput,
): Promise<CollectedNativePegInCausalMintTransitionV3Request> {
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const executionIdentityStatement =
    normalizePegInFrontierExecutionIdentityStatementV1(
      input?.executionIdentityStatement,
      trustAnchor.sidechainIdHex,
    );
  const eventStatement = normalizePegInFrontierEventStatementV1(input?.eventStatement);
  const contractStateStatement = normalizePegInFrontierContractStateStatementV1(
    input?.contractStateStatement,
    executionIdentityStatement.ergoBoxIdHex,
  );
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionIdentityStatement.expectedRecordScaleHex,
  );
  const transitionStatement = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress,
  });
  const material = await collectNativeFinalityMaterial({
    ...input,
    trustAnchor,
  });
  const targetNumber = Number(material.acquisition.targetNumber);
  if (targetNumber === 0) {
    throw new Error('causal mint-transition V3 finalized child cannot be genesis');
  }
  const parentNumber = targetNumber - 1;
  const canonicalParentHash = await requestSubstrateBlockHashAt(
    material.rpc,
    parentNumber,
  );
  if (canonicalParentHash !== material.targetParentHash) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition V3 finalized child parent changed canonical identity during collection',
    );
  }
  const parentObservation = await requestSubstrateHeaderObservation(
    material.rpc,
    canonicalParentHash,
  );
  const [encodedParent] = await material.codec.encodeHeaders([{
    expectedHashHex: canonicalParentHash,
    header: parentObservation,
  }]);
  if (
    !encodedParent
    || encodedParent.hashHex !== canonicalParentHash
    || encodedParent.number !== parentNumber.toString()
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition V3 parent header differs from canonical RPC ancestry',
    );
  }
  material.accountMaterial(
    encodedParent.headerScaleHex,
    'peg-in causal mint-transition V3 parent header',
  );

  const proofIdentity = {
    sidechainIdHex: trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionIdentityStatement.ergoBoxIdHex,
    bridgeAddressHex: contractStateStatement.bridgeAddressHex,
    tokenAddressHex: contractStateStatement.tokenAddressHex,
    recipientHex: runtimeRecord.recipientAddress as string,
  };
  const [postStateProof, parentStateProof] = await Promise.all([
    requestPegInCausalMintTransitionPostStateReadProofV3(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: material.targetHash,
    }),
    requestPegInCausalMintTransitionParentStateReadProofV3(material.rpc, {
      ...proofIdentity,
      nativeBlockHashHex: canonicalParentHash,
    }),
  ]);
  material.accountMaterial(
    postStateProof.pendingKeysScaleHex,
    'peg-in causal mint-transition V3 child pending-key list',
  );
  material.accountMaterial(
    parentStateProof.pendingKeysScaleHex,
    'peg-in causal mint-transition V3 parent pending-key list',
  );
  for (const [nodeIndex, node] of postStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in causal mint-transition V3 child-state proof node ${nodeIndex}`,
    );
  }
  for (const [nodeIndex, node] of parentStateProof.proofNodesHex.entries()) {
    material.accountMaterial(
      `0x${node}`,
      `peg-in causal mint-transition V3 parent-state proof node ${nodeIndex}`,
    );
  }
  material.checkDeadline();
  const [canonicalTargetAfterProof, canonicalParentAfterProof] = await Promise.all([
    requestSubstrateBlockHashAt(material.rpc, targetNumber),
    requestSubstrateBlockHashAt(material.rpc, parentNumber),
  ]);
  if (
    canonicalTargetAfterProof !== material.targetHash
    || canonicalParentAfterProof !== canonicalParentHash
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'causal mint-transition V3 parent/child identities changed during proof collection',
    );
  }
  if (Object.keys(postStateProof.causalStorageKeys).some(key =>
    postStateProof.causalStorageKeys[
      key as keyof typeof postStateProof.causalStorageKeys
    ] !== parentStateProof.causalStorageKeys[
      key as keyof typeof parentStateProof.causalStorageKeys
    ]
  )) {
    throw new Error('causal mint-transition V3 parent/child storage-key derivations disagree');
  }

  const executionIdentityRequest =
    normalizeNativeFinalizedPegInFrontierExecutionIdentityV1Request({
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
      trustAnchor: material.trustAnchor,
      targetNativeBlockHashHex: material.targetHash,
      targetHeaderScaleHex: material.targetHeaderScaleHex,
      linkedGrandpaProofs: material.linkedGrandpaProofs,
      checkpointTailHeadersScaleHex: material.checkpointTailHeadersScaleHex,
      finalityProofScaleHex: material.finalityProofScaleHex,
      statement: executionIdentityStatement,
      runtimeStateProofNodesHex: postStateProof.proofNodesHex.map(node => `0x${node}`),
    });
  const eventRequest = normalizeNativeFinalizedPegInFrontierEventV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
    executionIdentityRequest,
    statement: eventStatement,
  });
  const contractStateRequest = normalizeNativeFinalizedPegInFrontierContractStateV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest,
    statement: contractStateStatement,
  });
  const mintTransitionRequest = normalizeNativeFinalizedPegInFrontierMintTransitionV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    contractStateRequest,
    parentNativeBlockHashHex: canonicalParentHash,
    parentHeaderScaleHex: encodedParent.headerScaleHex,
    parentStateProofNodesHex: parentStateProof.proofNodesHex.map(node => `0x${node}`),
    statement: transitionStatement,
  });
  const request = normalizeNativeFinalizedPegInCausalMintTransitionV3Request({
    schema: NATIVE_FINALIZED_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
    mintTransitionRequest,
    statement: {
      schema: PEG_IN_CAUSAL_MINT_TRANSITION_V3_STATEMENT_SCHEMA,
      ...postStateProof.causalStorageKeys,
    },
  });

  return deepFreeze({
    schema: COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
    request,
    acquisition: {
      ...material.acquisition,
      parentHashHex: canonicalParentHash,
      parentNumber: parentNumber.toString(),
      postPendingKeysScaleHex: postStateProof.pendingKeysScaleHex,
      postPendingRecordKeysHex: postStateProof.discoveredPendingRecordKeysHex,
      postStateStorageKeysHex: postStateProof.storageKeysHex,
      postStateProofNodeCount: postStateProof.proofNodesHex.length,
      postStateProofBytes: postStateProof.proofBytes,
      parentPendingKeysScaleHex: parentStateProof.pendingKeysScaleHex,
      parentPendingRecordKeysHex: parentStateProof.discoveredPendingRecordKeysHex,
      parentStateStorageKeysHex: parentStateProof.storageKeysHex,
      parentStateProofNodeCount: parentStateProof.proofNodesHex.length,
      parentStateProofBytes: parentStateProof.proofBytes,
      rpcMethods: [
        'chain_getBlockHash',
        'chain_getFinalizedHead',
        'chain_getHeader',
        'bridge_grandpaWarpProof',
        'grandpa_proveFinality',
        'state_getStorage',
        'state_getReadProof',
      ],
    },
    boundary: {
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      directParentVerified: false,
      prePostStateVerified: false,
      causalAdmissionTransitionVerified: false,
      federatedSourceProofReceiptAuthenticated: false,
      trustlessSourceProofVerified: false,
      replayTransitionVerified: false,
      exactMintDeltasVerified: false,
      pairedMintLogVerified: false,
      singleTokenEffectVerified: false,
      reviewedDeploymentLineageVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
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
}

/**
 * Recollect and evaluate one V3 result through the pinned local contained authority.
 *
 * The launcher bootstrap is not atomic, so the child output remains quarantined.
 * Structural validation does not authenticate finality, the causal transition,
 * source-proof admission, lifecycle, mint, signing, submission, or broadcast.
 */
export async function collectNativeFinalizedPegInCausalMintTransitionV3Candidate(
  input: CollectNativePegInCausalMintTransitionV3CandidateInput,
): Promise<CollectedNativePegInCausalMintTransitionV3Candidate> {
  const maxAttempts = boundedInteger(
    input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS,
    'causal mint-transition V3 collection attempts',
  );
  const evaluator = input?.evaluator;
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(
    evaluator,
  );
  const trustedAnchorDigestHex = normalizeExecutableSha256Hex(
    input?.trustedAnchorDigestHex,
    'native causal V3 independently supplied trust anchor digest',
  );
  const collectionInput: CollectNativePegInCausalMintTransitionV3RequestInput =
    Object.freeze({
      rpc: input?.rpc,
      codec: input?.codec,
      trustAnchor: deepFreeze(structuredClone(input?.trustAnchor)),
      targetNativeBlockHashHex: input?.targetNativeBlockHashHex,
      deadlineMs: input?.deadlineMs,
      rpcConcurrency: input?.rpcConcurrency,
      executionIdentityStatement: deepFreeze(
        structuredClone(input?.executionIdentityStatement),
      ),
      eventStatement: deepFreeze(structuredClone(input?.eventStatement)),
      contractStateStatement: deepFreeze(
        structuredClone(input?.contractStateStatement),
      ),
    });
  const verifierSha256Hex = normalizeExecutableSha256Hex(
    evaluator.executableSha256Hex,
    'native causal V3 candidate evaluator executable digest',
  );
  const verifierInvocationSha256Hex = normalizeExecutableSha256Hex(
    evaluator.deriveExecutableInvocationSha256Hex(
      trustedAnchorDigestHex,
    ),
    'native causal V3 candidate evaluator invocation digest',
  );
  const verifierExecutionPolicySha256 = normalizeExecutableSha256Hex(
    `0x${evaluator.executionPolicySha256}`,
    'native causal V3 candidate evaluator execution policy digest',
  ).slice(2);
  const sourceExecutionIdentityDigestHex = normalizeExecutableSha256Hex(
    evaluator.sourceExecutionIdentityDigestHex,
    'native causal V3 candidate source execution identity digest',
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const collection =
        await collectNativeFinalizedPegInCausalMintTransitionV3Request(
          collectionInput,
        );
      const requestBytes = Buffer.from(JSON.stringify(collection.request), 'utf8');
      const candidate = await evaluator.evaluate({
        trustedAnchorDigestHex,
        request: collection.request,
      });
      assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
        evaluator,
        candidate,
        expectedRequestDigestHex:
          deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
            requestBytes,
          ),
      });
      return deepFreeze({
        schema:
          COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_CANDIDATE_SCHEMA,
        attemptCount: attempt,
        collection,
        candidate,
        nativeExecutablePins: {
          codecSha256Hex: collection.acquisition.codecExecutableSha256Hex,
          codecInvocationSha256Hex:
            collection.acquisition.codecExecutableInvocationSha256Hex,
          verifierSha256Hex,
          verifierInvocationSha256Hex,
          verifierExecutionPolicySha256,
          sourceExecutionIdentityDigestHex,
        },
        boundary: {
          readOnlyRpc: true as const,
          sourceRefreshedBeforeAndAfterExecution: true as const,
          brokerSelfImageBoundToAuthorityRecordV2: true as const,
          launcherInstallationActivationCampaignCompleted: false as const,
          launcherAtomicBootstrapProven: false as const,
          candidateOutputOnly: true as const,
          nativeVerifierExecutionAuthenticated: false as const,
          reportedProofShapeValidated: true as const,
          sidechainFinalityVerified: false as const,
          directParentChildVerified: false as const,
          causalPrePostStateVerified: false as const,
          exactCausalSuccessorVerified: false as const,
          federatedSourceProofReceiptAuthenticated: false as const,
          sourceProofExecutionAuthenticated: false as const,
          sourceCanonicalityVerified: false as const,
          trustlessSourceProofVerified: false as const,
          independentBuildAttestationVerified: false as const,
          localConformanceOnly: true as const,
          admissionEligible: false as const,
          lifecycleReferenceJoined: false as const,
          committedVaultTransitionVerified: false as const,
          mintAuthorized: false as const,
          daemonAdmissionAuthorized: false as const,
          signingAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          transactionMutationEnabled: false as const,
          gate5Closed: false as const,
          productionReadinessVerified: false as const,
        },
      });
    } catch (error) {
      if (
        !(error instanceof NativeCheckpointCollectionDriftError)
        || attempt === maxAttempts
      ) {
        throw error;
      }
    }
  }
  throw new Error(
    'causal mint-transition V3 candidate collection exhausted its bounded attempts',
  );
}

/**
 * Collect target-state runtime bytes and quarantine one structurally bound candidate output.
 *
 * The current launcher bootstrap is not atomic, so the candidate does not authenticate finality,
 * runtime state, target-build matching, execution identity, historical producer identity,
 * complete runtime lineage, a mint cutover, or committed-vault consumption.
 */
export async function collectNativeFinalizedPegInRuntimeIdentityV2Candidate(
  input: CollectNativePegInRuntimeIdentityV2CandidateInput,
): Promise<CollectedNativePegInRuntimeIdentityV2Candidate> {
  const maxAttempts = boundedInteger(
    input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS,
    'runtime identity V2 collection attempts',
  );
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
    input?.evaluator,
  );
  const verifierSha256Hex = normalizeExecutableSha256Hex(
    input.evaluator.executableSha256Hex,
    'native runtime identity V2 verifier executable digest',
  );
  const verifierInvocationSha256Hex = normalizeExecutableSha256Hex(
    input.evaluator.deriveExecutableInvocationSha256Hex(
      input?.trustedAnchorDigestHex,
    ),
    'native runtime identity V2 verifier invocation digest',
  );
  const verifierExecutionPolicySha256 = normalizeExecutableSha256Hex(
    `0x${input.evaluator.executionPolicySha256}`,
    'native runtime identity V2 verifier execution policy digest',
  ).slice(2);
  const runtimeCodeSha256Hex = normalizeExecutableSha256Hex(
    input.evaluator.runtimeCodeSha256Hex,
    'reviewed runtime code digest',
  );
  const runtimeBuildPacketSha256Hex = normalizeExecutableSha256Hex(
    input.evaluator.runtimeBuildPacketSha256Hex,
    'reviewed runtime build packet digest',
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const collection =
        await collectNativeFinalizedPegInRuntimeIdentityV2Request(input);
      const candidate = await input.evaluator.evaluate({
        trustedAnchorDigestHex: input.trustedAnchorDigestHex,
        request: collection.request,
      });
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
        evaluator: input.evaluator,
        candidate,
        expectedRequestDigestHex:
          deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
            collection.request,
          ),
      });
      return deepFreeze({
        schema:
          COLLECTED_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA,
        attemptCount: attempt,
        collection,
        candidate,
        nativeExecutablePins: {
          codecSha256Hex: collection.acquisition.codecExecutableSha256Hex,
          codecInvocationSha256Hex:
            collection.acquisition.codecExecutableInvocationSha256Hex,
          verifierSha256Hex,
          verifierInvocationSha256Hex,
          verifierExecutionPolicySha256,
          runtimeCodeSha256Hex,
          runtimeBuildPacketSha256Hex,
        },
        boundary: {
          readOnlyRpc: true as const,
          sidechainFinalityVerified: false as const,
          statementRuntimeStateVerified: false as const,
          runtimeCodeStateProofVerified: false as const,
          runtimeBuildAttestationVerified: true as const,
          nativeVerifierAttestationVerified: true as const,
          immutableLauncherInstallationRequired: true as const,
          authorityRecordV2Required: true as const,
          launcherInstallationActivationCampaignCompleted: false as const,
          launcherAtomicBootstrapProven: false as const,
          targetRuntimeBuildEvidenceMatched: false as const,
          targetRuntimeBuildIdentityVerified: false as const,
          targetStateCodeIsHistoricalProducerCode: false as const,
          runtimeUpgradeHistoryVerified: false as const,
          cutoverPolicyVerified: false as const,
          historicalMintAbsenceVerified: false as const,
          runtimeCodeIdentityVerified: false as const,
          committedVaultTransitionVerified: false as const,
          mintAuthorityGranted: false as const,
          transactionMutationEnabled: false as const,
          gate5Closed: false as const,
          productionReady: false as const,
        },
      });
    } catch (error) {
      if (
        !(error instanceof NativeCheckpointCollectionDriftError)
        || attempt === maxAttempts
      ) {
        throw error;
      }
    }
  }
  throw new Error(
    'runtime identity V2 collection exhausted its bounded attempts',
  );
}

export async function collectAndVerifyNativeFinalizedPegInState(
  input: CollectAndVerifyNativePegInStateInput,
): Promise<CollectedNativePegInStateVerification> {
  const maxAttempts = boundedInteger(
    input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS,
    'peg-in state collection attempts',
  );
  assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance(input?.verifier);
  const verifierSha256Hex = normalizeExecutableSha256Hex(
    input.verifier.executableSha256Hex,
    'native peg-in verifier executable digest',
  );
  const verifierInvocationSha256Hex = normalizeExecutableSha256Hex(
    input.verifier.deriveExecutableInvocationSha256Hex(input?.trustedAnchorDigestHex),
    'native peg-in verifier executable invocation digest',
  );
  const verifierExecutionPolicySha256 = normalizeExecutableSha256Hex(
    `0x${input.verifier.executionPolicySha256}`,
    'native peg-in verifier execution policy digest',
  ).slice(2);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const collection = await collectNativeFinalizedPegInStateRequest(input);
      const verification = await input.verifier.verify({
        trustedAnchorDigestHex: input.trustedAnchorDigestHex,
        request: collection.request,
      });
      assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance({
        verifier: input.verifier,
        verification,
        expectedRequestDigestHex:
          deriveNativeFinalizedPegInStateRequestDigestHex(collection.request),
      });
      return deepFreeze({
        schema: COLLECTED_NATIVE_PEG_IN_STATE_VERIFICATION_SCHEMA,
        attemptCount: attempt,
        collection,
        verification,
        nativeExecutablePins: {
          codecSha256Hex: collection.acquisition.codecExecutableSha256Hex,
          codecInvocationSha256Hex:
            collection.acquisition.codecExecutableInvocationSha256Hex,
          verifierSha256Hex,
          verifierInvocationSha256Hex,
          verifierExecutionPolicySha256,
        },
        boundary: {
          readOnlyRpc: true,
          sidechainFinalityVerified: true,
          statementRuntimeStateVerified: true,
          historicalMintAbsenceVerified: false,
          runtimeCodeIdentityVerified: false,
          committedVaultTransitionVerified: false,
          mintAuthorityGranted: false,
          transactionMutationEnabled: false,
          gate5Closed: false,
        },
      });
    } catch (error) {
      if (!(error instanceof NativeCheckpointCollectionDriftError) || attempt === maxAttempts) {
        throw error;
      }
    }
  }
  throw new Error('peg-in state collection exhausted its bounded attempts');
}

export interface NativeFinalityCollectionMaterial {
  rpc: ReadOnlySubstrateFinalityRpc;
  codec: NativeSubstrateRpcProofCodec;
  trustAnchor: NativeTrustAnchor;
  targetHash: string;
  targetParentHash: string;
  targetHeaderScaleHex: string;
  linkedGrandpaProofs: NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'];
  checkpointTailHeadersScaleHex: string[];
  finalityProofScaleHex: string;
  acquisition: Omit<
    CollectedNativeCheckpointRequest['acquisition'],
    'runtimeStateProofNodeCount' | 'rpcMethods'
  >;
  accountMaterial(value: string, label: string): void;
  checkDeadline(): void;
}

/**
 * Collect the bounded finality envelope without assigning semantics to any
 * runtime storage. Callers must add and authenticate their own exact-key proof.
 */
export async function collectNativeFinalityMaterial(
  input: CollectNativeCheckpointRequestInput,
): Promise<NativeFinalityCollectionMaterial> {
  const rpc = requireObject(input?.rpc, 'read-only Substrate RPC');
  const codec = requireObject(input?.codec, 'native RPC proof codec');
  const codecExecutableSha256Hex = normalizeExecutableSha256Hex(
    codec.executableSha256Hex,
    'native RPC codec executable digest',
  );
  const codecExecutableInvocationSha256Hex = {
    encodeHeaders: normalizeExecutableSha256Hex(
      codec.executableInvocationSha256Hex?.encodeHeaders,
      'native RPC codec header invocation digest',
    ),
    inspectWarpProof: normalizeExecutableSha256Hex(
      codec.executableInvocationSha256Hex?.inspectWarpProof,
      'native RPC codec warp invocation digest',
    ),
    inspectFinalityProof: normalizeExecutableSha256Hex(
      codec.executableInvocationSha256Hex?.inspectFinalityProof,
      'native RPC codec finality invocation digest',
    ),
  };
  const trustAnchor = normalizeTrustAnchor(input?.trustAnchor);
  const targetHash = hashHex(input?.targetNativeBlockHashHex, 'target native block hash');
  const deadlineMs = boundedInteger(
    input?.deadlineMs ?? DEFAULT_DEADLINE_MS,
    1,
    MAX_DEADLINE_MS,
    'checkpoint collection deadline',
  );
  const rpcConcurrency = boundedInteger(
    input?.rpcConcurrency ?? DEFAULT_RPC_CONCURRENCY,
    1,
    MAX_RPC_CONCURRENCY,
    'checkpoint RPC concurrency',
  );
  const deadline = Date.now() + deadlineMs;
  const checkpointNumber = Number(trustAnchor.checkpointNumber);

  checkDeadline(deadline);
  const genesisHash = await requestSubstrateBlockHashAt(rpc, 0);
  checkDeadline(deadline);
  if (genesisHash !== trustAnchor.sidechainIdHex) {
    throw new Error('Substrate RPC genesis hash does not match the reviewed sidechain ID');
  }

  const observedAnchorHash = await requestSubstrateBlockHashAt(rpc, checkpointNumber);
  checkDeadline(deadline);
  if (observedAnchorHash !== trustAnchor.checkpointHashHex) {
    throw new Error('Substrate RPC does not expose the reviewed trust checkpoint canonically');
  }

  const finalizedHeadHash = await requestSubstrateFinalizedHeadHash(rpc);
  const finalizedHeadObservation = await requestSubstrateHeaderObservation(rpc, finalizedHeadHash);
  const [encodedFinalizedHead] = await codec.encodeHeaders([{
    expectedHashHex: finalizedHeadHash,
    header: finalizedHeadObservation,
  }]);
  checkDeadline(deadline);

  const targetObservation = await requestSubstrateHeaderObservation(rpc, targetHash);
  const [encodedTarget] = await codec.encodeHeaders([{
    expectedHashHex: targetHash,
    header: targetObservation,
  }]);
  const targetNumber = Number(encodedTarget.number);
  const finalizedHeadNumber = Number(encodedFinalizedHead.number);
  validateNativeCheckpointFinalityBounds({
    checkpointNumber,
    targetNumber,
    finalizedHeadNumber,
  });
  const canonicalTargetHash = await requestSubstrateBlockHashAt(rpc, targetNumber);
  checkDeadline(deadline);
  if (canonicalTargetHash !== targetHash) {
    throw new NativeCheckpointCollectionDriftError(
      'target native block changed canonical identity during collection',
    );
  }

  const linkedGrandpaProofs: NativeFinalizedBridgeCheckpointRequest['linkedGrandpaProofs'] = [];
  let packageMaterialBytes = hexByteLength(trustAnchor.authorityListScaleHex) +
    hexByteLength(encodedTarget.headerScaleHex);
  const accountMaterial = (value: string, label: string): void => {
    packageMaterialBytes += hexByteLength(value);
    if (packageMaterialBytes > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
      throw new Error(
        `native checkpoint proof material exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes while collecting ${label}`,
      );
    }
  };

  const finalityProofScaleHex = `0x${await requestGrandpaFinalityProofScaleHex(
    rpc,
    targetNumber,
  )}`;
  accountMaterial(finalityProofScaleHex, 'target finality proof');
  const finality = await codec.inspectFinalityProof(finalityProofScaleHex);
  checkDeadline(deadline);
  const finalityHorizonNumber = Number(finality.horizonNumber);
  validateNativeCheckpointFinalityBounds({
    checkpointNumber,
    targetNumber,
    finalizedHeadNumber,
    finality: {
      horizonNumber: finalityHorizonNumber,
      unknownHeaderCount: finality.unknownHeaderCount,
    },
  });
  const canonicalHorizonHash = await requestSubstrateBlockHashAt(rpc, finalityHorizonNumber);
  checkDeadline(deadline);
  if (canonicalHorizonHash !== finality.horizonHashHex) {
    throw new NativeCheckpointCollectionDriftError(
      'target finality horizon changed canonical identity during collection',
    );
  }

  let currentHash = trustAnchor.checkpointHashHex;
  let currentNumber = checkpointNumber;
  let ancestryHeaderCount = 0;

  const collectCanonicalHeaderRange = async (
    startHash: string,
    startNumber: number,
    endNumber: number,
    maxHeaders: number,
    label: string,
  ) => {
    const count = endNumber - startNumber;
    if (count < 0 || count > maxHeaders) {
      throw new Error(`${label} exceeds ${maxHeaders} headers; review a newer trust checkpoint`);
    }
    ancestryHeaderCount += count;
    if (ancestryHeaderCount > MAX_TOTAL_ANCESTRY_HEADERS) {
      throw new Error(`GRANDPA ancestry exceeds ${MAX_TOTAL_ANCESTRY_HEADERS} total headers`);
    }
    if (count === 0) return [];

    const heights = Array.from({ length: count }, (_, index) => startNumber + index + 1);
    const hashes = await mapWithConcurrency(heights, rpcConcurrency, async height => {
      checkDeadline(deadline);
      return await requestSubstrateBlockHashAt(rpc, height);
    });
    const observations = await mapWithConcurrency(hashes, rpcConcurrency, async hash => {
      checkDeadline(deadline);
      return {
        expectedHashHex: hash,
        header: await requestSubstrateHeaderObservation(rpc, hash),
      };
    });
    const encoded = await codec.encodeHeaders(observations);
    let expectedParentHash = startHash;
    for (const [index, header] of encoded.entries()) {
      const expectedNumber = startNumber + index + 1;
      accountMaterial(header.headerScaleHex, `${label} header ${index}`);
      if (header.number !== String(expectedNumber) || header.parentHashHex !== expectedParentHash) {
        throw new NativeCheckpointCollectionDriftError(
          `${label} changed at height ${expectedNumber}`,
        );
      }
      expectedParentHash = header.hashHex;
    }
    checkDeadline(deadline);
    return encoded;
  };

  let reachedFinalityHorizonBoundary = currentNumber === finalityHorizonNumber;

  for (
    let chunkIndex = 0;
    !reachedFinalityHorizonBoundary && chunkIndex < MAX_LINKED_GRANDPA_PROOFS;
    chunkIndex += 1
  ) {
    checkDeadline(deadline);
    const sourceProofScaleHex = `0x${await requestGrandpaAuthorityTransitionProofScaleHex(
      rpc,
      currentHash,
    )}`;
    // The source proof is acquisition-only and independently capped by the codec. Charge only
    // the selected prefix that enters the native verifier request against the request budget.
    const inspected = await codec.inspectWarpProof(
      sourceProofScaleHex,
      finality.horizonNumber,
    );
    checkDeadline(deadline);

    if (inspected.selectedFragmentCount > 0) {
      const selectedTargetNumber = Number(inspected.selectedTargetNumber);
      if (
        inspected.selectedProofScaleHex === null ||
        inspected.selectedTargetHashHex === null ||
        inspected.selectedTargetNumber === null ||
        inspected.selectedTargetHeaderScaleHex === null ||
        selectedTargetNumber <= currentNumber
      ) {
        throw new NativeCheckpointCollectionDriftError(
          'selected GRANDPA handoff did not advance beyond its requested start',
        );
      }
      const encodedAncestry = await collectCanonicalHeaderRange(
        currentHash,
        currentNumber,
        selectedTargetNumber,
        MAX_ANCESTRY_HEADERS_PER_PROOF,
        `GRANDPA proof chunk ${chunkIndex} ancestry`,
      );
      const terminal = encodedAncestry.at(-1);
      if (
        !terminal ||
        terminal.hashHex !== inspected.selectedTargetHashHex ||
        terminal.number !== inspected.selectedTargetNumber ||
        terminal.headerScaleHex !== inspected.selectedTargetHeaderScaleHex
      ) {
        throw new NativeCheckpointCollectionDriftError(
          'selected GRANDPA handoff disagrees with canonical RPC ancestry',
        );
      }
      accountMaterial(inspected.selectedProofScaleHex, `selected GRANDPA proof chunk ${chunkIndex}`);
      linkedGrandpaProofs.push({
        ancestryHeadersScaleHex: encodedAncestry.map(header => header.headerScaleHex),
        proofScaleHex: inspected.selectedProofScaleHex,
      });
      currentHash = terminal.hashHex;
      currentNumber = Number(terminal.number);
    }

    if (inspected.stoppedBeforeHorizon) {
      reachedFinalityHorizonBoundary = true;
      break;
    }
    if (inspected.sourceComplete) {
      throw new NativeCheckpointCollectionDriftError(
        'complete GRANDPA warp proof ended before the target finality horizon',
      );
    }
    if (inspected.selectedFragmentCount === 0) {
      throw new NativeCheckpointCollectionDriftError(
        'incomplete GRANDPA warp proof did not advance toward the finality horizon',
      );
    }
  }
  if (!reachedFinalityHorizonBoundary) {
    throw new Error(`GRANDPA authority path exceeds ${MAX_LINKED_GRANDPA_PROOFS} chunks`);
  }

  const checkpointTail = await collectCanonicalHeaderRange(
    currentHash,
    currentNumber,
    finalityHorizonNumber,
    MAX_CHECKPOINT_TAIL_HEADERS,
    'checkpoint tail',
  );
  const tailTerminal = checkpointTail.at(-1);
  if (
    (tailTerminal && tailTerminal.hashHex !== finality.horizonHashHex) ||
    (!tailTerminal && currentHash !== finality.horizonHashHex)
  ) {
    throw new NativeCheckpointCollectionDriftError(
      'checkpoint tail and target finality proof ended at different horizons',
    );
  }

  return {
    rpc,
    codec,
    trustAnchor,
    targetHash,
    targetParentHash: targetObservation.parentHash,
    targetHeaderScaleHex: encodedTarget.headerScaleHex,
    linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: checkpointTail.map(header => header.headerScaleHex),
    finalityProofScaleHex,
    acquisition: {
      finalizedHeadHashHex: finalizedHeadHash,
      finalizedHeadNumber: encodedFinalizedHead.number,
      targetHashHex: targetHash,
      targetNumber: encodedTarget.number,
      linkedProofCount: linkedGrandpaProofs.length,
      ancestryHeaderCount,
      finalityHorizonHashHex: finality.horizonHashHex,
      finalityHorizonNumber: finality.horizonNumber,
      codecExecutableSha256Hex,
      codecExecutableInvocationSha256Hex,
    },
    accountMaterial,
    checkDeadline: () => checkDeadline(deadline),
  };
}

export async function collectAndVerifyNativeFinalizedCheckpoint(
  input: CollectAndVerifyNativeCheckpointInput,
): Promise<CollectedNativeCheckpointVerification> {
  const maxAttempts = boundedInteger(
    input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS,
    'checkpoint collection attempts',
  );
  const authorityVerifier = input?.verifier;
  const verifierExecutableSha256Hex = normalizeExecutableSha256Hex(
    authorityVerifier?.executableSha256Hex ?? input?.verifierExecutableSha256Hex,
    'native verifier executable digest',
  );
  const verifierExecutableInvocationSha256Hex = normalizeExecutableSha256Hex(
    authorityVerifier === undefined
      ? input?.verifierExecutableInvocationSha256Hex
      : authorityVerifier.deriveExecutableInvocationSha256Hex(
          input?.trustedAnchorDigestHex,
        ),
    'native verifier executable invocation digest',
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const collection = await collectNativeFinalizedCheckpointRequest(input);
      const verification = authorityVerifier === undefined
        ? await verifyNativeFinalizedBridgeCheckpoint({
            executablePath: input.verifierExecutablePath,
            expectedExecutableSha256Hex: input.verifierExecutableSha256Hex,
            expectedExecutableInvocationSha256Hex:
              verifierExecutableInvocationSha256Hex,
            executableArgs: input.verifierExecutableArgs,
            timeoutMs: input.verifierTimeoutMs,
            trustedAnchorDigestHex: input.trustedAnchorDigestHex,
            request: collection.request,
          })
        : await authorityVerifier.verify({
            trustedAnchorDigestHex: input.trustedAnchorDigestHex,
            request: collection.request,
          });
      const checkpoint = buildNativeVerifiedBridgeCheckpoint(verification);
      return deepFreeze({
        schema: COLLECTED_NATIVE_CHECKPOINT_VERIFICATION_SCHEMA,
        attemptCount: attempt,
        collection,
        verification,
        checkpoint,
        nativeExecutablePins: {
          codecSha256Hex: collection.acquisition.codecExecutableSha256Hex,
          codecInvocationSha256Hex:
            collection.acquisition.codecExecutableInvocationSha256Hex,
          verifierSha256Hex: verifierExecutableSha256Hex,
          verifierInvocationSha256Hex: verifierExecutableInvocationSha256Hex,
        },
        boundary: {
          readOnlyRpc: true,
          sidechainFinalityVerified: true,
          ergoExtensionAnchorVerified: false,
          onChainAcceptanceVerified: false,
          transactionMutationEnabled: false,
          gate5Closed: false,
        },
      });
    } catch (error) {
      if (!(error instanceof NativeCheckpointCollectionDriftError) || attempt === maxAttempts) {
        throw error;
      }
    }
  }
  throw new Error('checkpoint collection exhausted its bounded attempts');
}

function normalizeTrustAnchor(value: unknown): NativeTrustAnchor {
  const record = exactRecord(value, [
    'sidechainIdHex',
    'checkpointHashHex',
    'checkpointNumber',
    'grandpaSetId',
    'authorityListScaleHex',
  ], 'trust anchor');
  const checkpointNumber = uint32Decimal(record.checkpointNumber, 'trust anchor checkpoint number');
  const grandpaSetId = uint64Decimal(record.grandpaSetId, 'trust anchor GRANDPA set ID');
  const authorityListScaleHex = byteHex(
    record.authorityListScaleHex,
    4 * 1024,
    'trust anchor authority list',
  );
  decodeCanonicalGrandpaAuthorityListScaleHex(authorityListScaleHex);
  return {
    sidechainIdHex: hashHex(record.sidechainIdHex, 'trust anchor sidechain ID'),
    checkpointHashHex: hashHex(record.checkpointHashHex, 'trust anchor checkpoint hash'),
    checkpointNumber,
    grandpaSetId,
    authorityListScaleHex,
  };
}

export function normalizeNativeCheckpointTrustAnchor(
  value: unknown,
): NativeTrustAnchor {
  return deepFreeze(normalizeTrustAnchor(value));
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function checkDeadline(deadline: number): void {
  if (Date.now() > deadline) throw new Error('checkpoint collection deadline exceeded');
}

function requireObject<T extends object>(value: T | undefined, label: string): T {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required`);
  return value;
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return record;
}

function hashHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lower-case 0x-prefixed 32-byte hex`);
  }
  return value;
}

function byteHex(value: unknown, maximumBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lower-case 0x-prefixed whole-byte hex`);
  }
  if ((value.length - 2) / 2 > maximumBytes) {
    throw new Error(`${label} exceeds ${maximumBytes} bytes`);
  }
  return value;
}

function uint32Decimal(value: unknown, label: string): string {
  const normalized = uint64Decimal(value, label);
  if (BigInt(normalized) > 0xffff_ffffn) throw new Error(`${label} exceeds uint32`);
  return normalized;
}

function uint64Decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint64 string`);
  }
  if (BigInt(value) > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} exceeds uint64`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function hexByteLength(value: string): number {
  return (value.length - 2) / 2;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
