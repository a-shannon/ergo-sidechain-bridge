import {
  extractFrontierBridgeEventRoot,
  type FrontierBridgeEventRootInput,
} from './frontier-bridge-event-root.js';
import {
  assertNativeVerifiedBridgeCheckpointProvenance,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import {
  assertPinnedLocalSourceNativeCheckpointProvenance,
  type PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
} from './pinned-local-native-verifier-build.js';
import {
  buildTrustlessBurnInclusionProof,
  validateTrustlessBurnInclusionProofEnvelope,
  type TrustlessBurnInclusionProof,
} from './trustless-burn-proof.js';

export const NATIVE_FRONTIER_CHECKPOINT_JOIN_SCHEMA =
  'e2s.pinned-local-native-frontier-checkpoint-join.v1' as const;
export const NATIVE_FRONTIER_CHECKPOINT_JOIN_CANDIDATE_SCHEMA =
  'e2s.native-frontier-checkpoint-join-candidate.v1' as const;

const JOIN_BRAND: unique symbol = Symbol('e2s.native-frontier-checkpoint-join.verified');
const VERIFIED_JOINS = new WeakSet<object>();

interface NativeFrontierCheckpointJoinCore {
  sidechainIdHex: string;
  sidechainHeight: string;
  nativeConsensusBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
  targetBurnProof: TrustlessBurnInclusionProof;
  encodedCheckpointHex: string;
  checkpointCommitmentHex: string;
  extensionKeyHex: '0401';
  extensionValueHex: string;
}

export interface NativeFrontierCheckpointJoinCandidatePayload
  extends NativeFrontierCheckpointJoinCore {
  schema: typeof NATIVE_FRONTIER_CHECKPOINT_JOIN_CANDIDATE_SCHEMA;
  status: 'NATIVE_FRONTIER_CHECKPOINT_JOIN_CANDIDATE';
  boundary: {
    nativeVerifierOutputValidated: true;
    pinnedLocalSourceBuildVerified: false;
    completeBuildToolClosureVerified: false;
    dependencyCacheContentAttested: false;
    independentBuildAttestationVerified: false;
    localConformanceOnly: true;
    verificationScope: 'generic-self-pinned-local-conformance';
    nativeFinalityVerified: false;
    runtimeStateProofVerified: false;
    frontierBurnExtractionVerified: true;
    targetBurnInclusionVerified: true;
    ergoExtensionCandidateDerived: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    admissionEligible: false;
    committeeBypassPrevented: false;
    gate5Closed: false;
  };
}

export interface NativeFrontierCheckpointJoinPayload extends NativeFrontierCheckpointJoinCore {
  schema: typeof NATIVE_FRONTIER_CHECKPOINT_JOIN_SCHEMA;
  status: 'PINNED_LOCAL_NATIVE_FRONTIER_CHECKPOINT_JOINED';
  boundary: {
    nativeVerifierOutputValidated: true;
    pinnedLocalSourceBuildVerified: true;
    completeBuildToolClosureVerified: false;
    dependencyCacheContentAttested: false;
    independentBuildAttestationVerified: false;
    localConformanceOnly: true;
    verificationScope: 'pinned-local-exclusive-host-conformance';
    nativeFinalityVerified: true;
    runtimeStateProofVerified: true;
    frontierBurnExtractionVerified: true;
    targetBurnInclusionVerified: true;
    ergoExtensionCandidateDerived: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    admissionEligible: false;
    committeeBypassPrevented: false;
    gate5Closed: false;
  };
}

export type NativeFrontierCheckpointJoin = NativeFrontierCheckpointJoinPayload & {
  readonly [JOIN_BRAND]: true;
};

export function buildNativeFrontierCheckpointJoinCandidate(input: {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  frontier: FrontierBridgeEventRootInput;
  targetBurnIdHex: string;
}): NativeFrontierCheckpointJoinCandidatePayload {
  assertNativeVerifiedBridgeCheckpointProvenance(input?.checkpoint);
  const core = buildJoinCore(input);
  return deepFreeze({
    schema: NATIVE_FRONTIER_CHECKPOINT_JOIN_CANDIDATE_SCHEMA,
    status: 'NATIVE_FRONTIER_CHECKPOINT_JOIN_CANDIDATE' as const,
    ...core,
    boundary: {
      nativeVerifierOutputValidated: true as const,
      pinnedLocalSourceBuildVerified: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      independentBuildAttestationVerified: false as const,
      localConformanceOnly: true as const,
      verificationScope: 'generic-self-pinned-local-conformance' as const,
      nativeFinalityVerified: false as const,
      runtimeStateProofVerified: false as const,
      frontierBurnExtractionVerified: true as const,
      targetBurnInclusionVerified: true as const,
      ergoExtensionCandidateDerived: true as const,
      ergoExtensionAnchorVerified: false as const,
      onChainAcceptanceVerified: false as const,
      admissionEligible: false as const,
      committeeBypassPrevented: false as const,
      gate5Closed: false as const,
    },
  });
}

export function joinPinnedLocalNativeCheckpointToFrontierBurns(input: {
  checkpoint: PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
  frontier: FrontierBridgeEventRootInput;
  targetBurnIdHex: string;
}): NativeFrontierCheckpointJoin {
  assertPinnedLocalSourceNativeCheckpointProvenance(input?.checkpoint);
  const core = buildJoinCore(input);
  const result = deepFreeze({
    schema: NATIVE_FRONTIER_CHECKPOINT_JOIN_SCHEMA,
    status: 'PINNED_LOCAL_NATIVE_FRONTIER_CHECKPOINT_JOINED' as const,
    ...core,
    boundary: {
      nativeVerifierOutputValidated: true as const,
      pinnedLocalSourceBuildVerified: true as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      independentBuildAttestationVerified: false as const,
      localConformanceOnly: true as const,
      verificationScope: 'pinned-local-exclusive-host-conformance' as const,
      nativeFinalityVerified: true as const,
      runtimeStateProofVerified: true as const,
      frontierBurnExtractionVerified: true as const,
      targetBurnInclusionVerified: true as const,
      ergoExtensionCandidateDerived: true as const,
      ergoExtensionAnchorVerified: false as const,
      onChainAcceptanceVerified: false as const,
      admissionEligible: false as const,
      committeeBypassPrevented: false as const,
      gate5Closed: false as const,
    },
  }) as unknown as NativeFrontierCheckpointJoin;
  VERIFIED_JOINS.add(result);
  return result;
}

export function assertNativeFrontierCheckpointJoinProvenance(
  value: unknown,
): asserts value is NativeFrontierCheckpointJoin {
  if (typeof value !== 'object' || value === null || !VERIFIED_JOINS.has(value)) {
    throw new Error('native Frontier checkpoint join provenance is missing');
  }
}

export function validateNativeFrontierCheckpointIdentity(input: {
  checkpoint: {
    sidechainIdHex: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    burnLeafCount: number;
  };
  frontier: {
    sidechainIdHex: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    burnLeafCount: number;
  };
}): void {
  const frontierSidechainIdHex = fixedHex(input.frontier.sidechainIdHex, 'Frontier sidechain ID');
  if (frontierSidechainIdHex !== input.checkpoint.sidechainIdHex) {
    throw new Error('Frontier sidechain ID does not match the native finalized checkpoint');
  }
  const frontierExecutionBlockHashHex = fixedHex(
    input.frontier.executionBlockHashHex,
    'Frontier execution block hash',
  );
  if (frontierExecutionBlockHashHex !== input.checkpoint.executionBlockHashHex) {
    throw new Error('Frontier execution block hash does not match the native finalized checkpoint');
  }
  if (input.frontier.bridgeEventRootHex !== input.checkpoint.bridgeEventRootHex) {
    throw new Error('Frontier bridge event root does not match the native finalized checkpoint');
  }
  if (input.frontier.burnLeafCount !== input.checkpoint.burnLeafCount) {
    throw new Error('Frontier burn leaf count does not match the native finalized checkpoint');
  }
}

function buildJoinCore(input: {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  frontier: FrontierBridgeEventRootInput;
  targetBurnIdHex: string;
}): NativeFrontierCheckpointJoinCore {
  const checkpoint = input.checkpoint.checkpointCommitment.checkpoint;
  const extraction = extractFrontierBridgeEventRoot(input.frontier);
  if (extraction.commitment === null) {
    throw new Error('Frontier block contains no canonical successful PegOut burn');
  }

  validateNativeFrontierCheckpointIdentity({
    checkpoint: {
      sidechainIdHex: checkpoint.sidechainIdHex,
      executionBlockHashHex: checkpoint.executionBlockHashHex,
      bridgeEventRootHex: checkpoint.bridgeEventRootHex,
      burnLeafCount: checkpoint.burnLeafCount,
    },
    frontier: {
      sidechainIdHex: input.frontier.sidechainIdHex,
      executionBlockHashHex: input.frontier.executionBlockHashHex,
      bridgeEventRootHex: extraction.commitment.bridgeEventRootHex,
      burnLeafCount: extraction.commitment.leaves.length,
    },
  });

  const targetBurnProof = buildTrustlessBurnInclusionProof(
    extraction.commitment.leaves,
    input.targetBurnIdHex,
  );
  const proofValidation = validateTrustlessBurnInclusionProofEnvelope(targetBurnProof);
  if (!proofValidation.ok) {
    throw new Error(`joined target burn proof is invalid: ${proofValidation.errors.join('; ')}`);
  }

  return {
    sidechainIdHex: checkpoint.sidechainIdHex,
    sidechainHeight: checkpoint.sidechainHeight,
    nativeConsensusBlockHashHex: checkpoint.sidechainConsensusBlockHashHex,
    executionBlockHashHex: checkpoint.executionBlockHashHex,
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    burnLeafCount: checkpoint.burnLeafCount,
    targetBurnProof,
    encodedCheckpointHex: input.checkpoint.checkpointCommitment.encodedCheckpointHex,
    checkpointCommitmentHex: input.checkpoint.checkpointCommitment.checkpointCommitmentHex,
    extensionKeyHex: input.checkpoint.checkpointCommitment.extensionKeyHex,
    extensionValueHex: input.checkpoint.checkpointCommitment.extensionValueHex,
  };
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be 32-byte hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error(`${label} must be 32-byte hex`);
  return clean.toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
