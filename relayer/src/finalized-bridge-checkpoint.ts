import {
  buildBridgeCheckpointCommitmentV1,
  deriveGrandpaAuthoritySetHashHex,
  deriveGrandpaJustificationHashHex,
  type BridgeCheckpointCommitmentV1,
} from './bridge-checkpoint-commitment.js';
import {
  BRIDGE_COMMITMENT_STORAGE_KEY_HEX,
  BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
  MAX_BRIDGE_COMMITMENT_PROOF_BYTES,
  MAX_BRIDGE_COMMITMENT_PROOF_NODES,
  MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
  decodeCanonicalGrandpaAuthorityListScaleHex,
} from './substrate-finality-provider.js';

export const FINALIZED_BRIDGE_CHECKPOINT_CANDIDATE_SCHEMA =
  'e2s.finalized-bridge-checkpoint-candidate.v1';
export const FRONTIER_BRIDGE_EVENT_ROOT_FORMAT_VERSION = 1;
export const FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS = 256;

export interface SubstrateHeaderObservation {
  hashHex: string;
  number: string | number | bigint;
  stateRootHex: string;
}

export interface RuntimeBridgeCommitmentObservation {
  atNativeBlockHashHex: string;
  formatVersion: number;
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
}

export interface GrandpaAuthoritySetObservation {
  atNativeBlockHashHex: string;
  setId: string | number | bigint;
  authorityListScaleHex: string;
}

export interface RuntimeStateReadProofObservation {
  atNativeBlockHashHex: string;
  storageKeysHex: string[];
  storageValueScaleHex: string;
  proofNodesHex: string[];
}

export interface FinalizedBridgeCheckpointProvider {
  getFinalizedHead(): Promise<string>;
  getHeader(nativeBlockHashHex: string): Promise<SubstrateHeaderObservation>;
  getCanonicalBlockHash(height: string): Promise<string>;
  getGenesisBlockHash(): Promise<string>;
  getBridgeCommitmentAt(
    nativeBlockHashHex: string,
  ): Promise<RuntimeBridgeCommitmentObservation>;
  getGrandpaAuthoritySetAt(
    nativeBlockHashHex: string,
  ): Promise<GrandpaAuthoritySetObservation>;
  getRuntimeStateReadProofAt?(
    nativeBlockHashHex: string,
  ): Promise<RuntimeStateReadProofObservation | null>;
}

export interface AssembleFinalizedBridgeCheckpointCandidateInput {
  targetNativeBlockHashHex: string;
  grandpaJustificationScaleHex: string;
  provider: FinalizedBridgeCheckpointProvider;
}

export interface FinalizedBridgeCheckpointCandidateBoundary {
  readOnly: true;
  candidateOnly: true;
  nodeObservationsCryptographicallyVerified: false;
  grandpaJustificationVerified: false;
  authoritySetAuthenticated: false;
  authorityTransitionsVerified: false;
  runtimeStateProofVerified: false;
  executionConsensusMappingVerified: false;
  sidechainFinalityVerified: false;
  ergoAnchorAuthenticated: false;
  onChainAcceptanceProven: false;
  transactionBroadcastOrMutation: false;
  gate5Closed: false;
}

export interface FinalizedBridgeCheckpointCandidate {
  schema: typeof FINALIZED_BRIDGE_CHECKPOINT_CANDIDATE_SCHEMA;
  status: 'CANDIDATE';
  target: {
    nativeBlockHashHex: string;
    nativeHeight: string;
    nativeStateRootHex: string;
    executionBlockHashHex: string;
  };
  finalizedHeadObservation: {
    nativeBlockHashHex: string;
    nativeHeight: string;
  };
  runtimeCommitment: {
    formatVersion: 1;
    sidechainIdHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    burnLeafCount: number;
  };
  grandpaInputs: {
    authoritySetId: string;
    authorityListScaleHex: string;
    authorityCount: number;
    justificationScaleHex: string;
  };
  runtimeStateReadProof: {
    atNativeBlockHashHex: string;
    storageKeysHex: string[];
    storageValueScaleHex: string;
    proofNodesHex: string[];
  } | null;
  checkpointCommitment: BridgeCheckpointCommitmentV1;
  checks: {
    targetAtOrBelowObservedFinalizedHead: true;
    targetCanonicalAtObservedHeight: true;
    runtimeCommitmentBoundToTargetHash: true;
    authoritySetBoundToTargetHash: true;
    runtimeIdentityMatchesGenesis: true;
    runtimeHeightMatchesNativeHeader: true;
  };
  boundary: FinalizedBridgeCheckpointCandidateBoundary;
}

export interface FinalizedBridgeCheckpointObservationBundle {
  finalizedHeadHashHex: string;
  targetHeader: SubstrateHeaderObservation;
  finalizedHeadHeader: SubstrateHeaderObservation;
  canonicalTargetHashHex: string;
  genesisBlockHashHex: string;
  runtimeCommitment: RuntimeBridgeCommitmentObservation;
  grandpaAuthoritySet: GrandpaAuthoritySetObservation;
  runtimeStateReadProof?: RuntimeStateReadProofObservation | null;
}

export async function assembleFinalizedBridgeCheckpointCandidate(
  input: AssembleFinalizedBridgeCheckpointCandidateInput,
): Promise<FinalizedBridgeCheckpointCandidate> {
  const targetHash = normalizeHashHex(input.targetNativeBlockHashHex, 'target native block hash');
  const justificationHex = normalizeByteHex(
    input.grandpaJustificationScaleHex,
    'GRANDPA justification SCALE bytes',
  );

  const finalizedHeadHash = normalizeHashHex(
    await input.provider.getFinalizedHead(),
    'observed finalized head hash',
  );
  const finalizedHead = normalizeHeader(
    await input.provider.getHeader(finalizedHeadHash),
    finalizedHeadHash,
    'observed finalized head',
  );
  const targetHeader = normalizeHeader(
    await input.provider.getHeader(targetHash),
    targetHash,
    'target header',
  );
  if (targetHeader.number > finalizedHead.number) {
    throw new Error('target native height exceeds the observed finalized-head height');
  }

  const canonicalTargetHash = normalizeHashHex(
    await input.provider.getCanonicalBlockHash(targetHeader.number.toString()),
    'canonical target block hash',
  );
  if (canonicalTargetHash !== targetHash) {
    throw new Error('target native block is not canonical at its observed height');
  }

  const genesisHash = normalizeHashHex(
    await input.provider.getGenesisBlockHash(),
    'sidechain genesis block hash',
  );
  const runtime = normalizeRuntimeCommitment(
    await input.provider.getBridgeCommitmentAt(targetHash),
    targetHash,
  );
  if (runtime.sidechainIdHex !== genesisHash) {
    throw new Error('runtime commitment sidechain ID does not match the genesis block hash');
  }
  if (runtime.sidechainHeight !== targetHeader.number) {
    throw new Error('runtime commitment height does not match the target native header');
  }
  if (runtime.executionBlockHashHex === targetHash) {
    throw new Error('native consensus and Frontier execution block hashes must remain distinct');
  }

  const authoritySet = normalizeAuthoritySet(
    await input.provider.getGrandpaAuthoritySetAt(targetHash),
    targetHash,
  );
  const authorities = decodeCanonicalGrandpaAuthorityListScaleHex(
    authoritySet.authorityListScaleHex,
  );

  const readProof = input.provider.getRuntimeStateReadProofAt
    ? normalizeReadProof(
        await input.provider.getRuntimeStateReadProofAt(targetHash),
        targetHash,
        runtime,
      )
    : null;
  const authoritySetHash = deriveGrandpaAuthoritySetHashHex(
    Buffer.from(authoritySet.authorityListScaleHex, 'hex'),
  );
  const justificationHash = deriveGrandpaJustificationHashHex(
    Buffer.from(justificationHex, 'hex'),
  );
  const checkpointCommitment = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: runtime.sidechainIdHex,
    sidechainHeight: runtime.sidechainHeight,
    sidechainConsensusBlockHashHex: targetHash,
    executionBlockHashHex: runtime.executionBlockHashHex,
    bridgeEventRootHex: runtime.bridgeEventRootHex,
    burnLeafCount: runtime.burnLeafCount,
    finalityAuthoritySetId: authoritySet.setId,
    finalityAuthoritySetHashHex: authoritySetHash,
    finalityProofHashHex: justificationHash,
  });

  return {
    schema: FINALIZED_BRIDGE_CHECKPOINT_CANDIDATE_SCHEMA,
    status: 'CANDIDATE',
    target: {
      nativeBlockHashHex: targetHash,
      nativeHeight: targetHeader.number.toString(),
      nativeStateRootHex: targetHeader.stateRootHex,
      executionBlockHashHex: runtime.executionBlockHashHex,
    },
    finalizedHeadObservation: {
      nativeBlockHashHex: finalizedHeadHash,
      nativeHeight: finalizedHead.number.toString(),
    },
    runtimeCommitment: {
      formatVersion: FRONTIER_BRIDGE_EVENT_ROOT_FORMAT_VERSION,
      sidechainIdHex: runtime.sidechainIdHex,
      sidechainHeight: runtime.sidechainHeight.toString(),
      executionBlockHashHex: runtime.executionBlockHashHex,
      bridgeEventRootHex: runtime.bridgeEventRootHex,
      burnLeafCount: runtime.burnLeafCount,
    },
    grandpaInputs: {
      authoritySetId: authoritySet.setId.toString(),
      authorityListScaleHex: authoritySet.authorityListScaleHex,
      authorityCount: authorities.length,
      justificationScaleHex: justificationHex,
    },
    runtimeStateReadProof: readProof,
    checkpointCommitment,
    checks: {
      targetAtOrBelowObservedFinalizedHead: true,
      targetCanonicalAtObservedHeight: true,
      runtimeCommitmentBoundToTargetHash: true,
      authoritySetBoundToTargetHash: true,
      runtimeIdentityMatchesGenesis: true,
      runtimeHeightMatchesNativeHeader: true,
    },
    boundary: finalizedBridgeCheckpointCandidateBoundary(),
  };
}

export function createObservationBundleProvider(
  bundle: FinalizedBridgeCheckpointObservationBundle,
): FinalizedBridgeCheckpointProvider {
  const targetHash = normalizeHashHex(bundle.targetHeader.hashHex, 'bundle target header hash');
  const finalizedHash = normalizeHashHex(
    bundle.finalizedHeadHashHex,
    'bundle finalized head hash',
  );
  const targetHeight = normalizeUint64(bundle.targetHeader.number, 'bundle target height');

  return {
    getFinalizedHead: async () => finalizedHash,
    getHeader: async hash => {
      const normalized = normalizeHashHex(hash, 'requested header hash');
      if (normalized === targetHash) return structuredClone(bundle.targetHeader);
      if (normalized === finalizedHash) return structuredClone(bundle.finalizedHeadHeader);
      throw new Error('offline observation bundle does not contain the requested header');
    },
    getCanonicalBlockHash: async height => {
      if (normalizeUint64(height, 'requested canonical height') !== targetHeight) {
        throw new Error('offline observation bundle does not contain the requested height');
      }
      return bundle.canonicalTargetHashHex;
    },
    getGenesisBlockHash: async () => bundle.genesisBlockHashHex,
    getBridgeCommitmentAt: async hash => {
      assertRequestedTarget(hash, targetHash, 'runtime commitment');
      return structuredClone(bundle.runtimeCommitment);
    },
    getGrandpaAuthoritySetAt: async hash => {
      assertRequestedTarget(hash, targetHash, 'GRANDPA authority set');
      return structuredClone(bundle.grandpaAuthoritySet);
    },
    getRuntimeStateReadProofAt: async hash => {
      assertRequestedTarget(hash, targetHash, 'runtime state read proof');
      return bundle.runtimeStateReadProof
        ? structuredClone(bundle.runtimeStateReadProof)
        : null;
    },
  };
}

function normalizeHeader(
  value: SubstrateHeaderObservation,
  requestedHash: string,
  label: string,
): { hashHex: string; number: bigint; stateRootHex: string } {
  const hashHex = normalizeHashHex(value?.hashHex, `${label} hash`);
  if (hashHex !== requestedHash) {
    throw new Error(`${label} response is not bound to the requested native block hash`);
  }
  return {
    hashHex,
    number: normalizeUint64(value.number, `${label} number`),
    stateRootHex: normalizeHashHex(value.stateRootHex, `${label} state root`),
  };
}

function normalizeRuntimeCommitment(
  value: RuntimeBridgeCommitmentObservation,
  targetHash: string,
): {
  sidechainIdHex: string;
  sidechainHeight: bigint;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
} {
  assertBoundHash(value?.atNativeBlockHashHex, targetHash, 'runtime commitment');
  if (value.formatVersion !== FRONTIER_BRIDGE_EVENT_ROOT_FORMAT_VERSION) {
    throw new Error(`runtime commitment format version must be ${FRONTIER_BRIDGE_EVENT_ROOT_FORMAT_VERSION}`);
  }
  if (
    !Number.isSafeInteger(value.burnLeafCount) ||
    value.burnLeafCount < 1 ||
    value.burnLeafCount > FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS
  ) {
    throw new Error(
      `runtime commitment burn count must be between 1 and ${FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS}`,
    );
  }
  return {
    sidechainIdHex: normalizeHashHex(value.sidechainIdHex, 'runtime sidechain ID'),
    sidechainHeight: normalizeUint64(value.sidechainHeight, 'runtime sidechain height'),
    executionBlockHashHex: normalizeHashHex(
      value.executionBlockHashHex,
      'runtime execution block hash',
    ),
    bridgeEventRootHex: normalizeHashHex(value.bridgeEventRootHex, 'runtime bridge event root'),
    burnLeafCount: value.burnLeafCount,
  };
}

function normalizeAuthoritySet(
  value: GrandpaAuthoritySetObservation,
  targetHash: string,
): { setId: bigint; authorityListScaleHex: string } {
  assertBoundHash(value?.atNativeBlockHashHex, targetHash, 'GRANDPA authority set');
  return {
    setId: normalizeUint64(value.setId, 'GRANDPA authority set ID'),
    authorityListScaleHex: normalizeByteHex(
      value.authorityListScaleHex,
      'GRANDPA authority-list SCALE bytes',
    ),
  };
}

function normalizeReadProof(
  value: RuntimeStateReadProofObservation | null,
  targetHash: string,
  runtime: {
    sidechainIdHex: string;
    sidechainHeight: bigint;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    burnLeafCount: number;
  },
): FinalizedBridgeCheckpointCandidate['runtimeStateReadProof'] {
  if (value === null) return null;
  assertBoundHash(value?.atNativeBlockHashHex, targetHash, 'runtime state read proof');
  if (!Array.isArray(value.storageKeysHex) || value.storageKeysHex.length !== 1) {
    throw new Error('runtime state read proof must identify exactly one storage key');
  }
  if (!Array.isArray(value.proofNodesHex) || value.proofNodesHex.length === 0) {
    throw new Error('runtime state read proof must contain at least one proof node');
  }
  if (value.proofNodesHex.length > MAX_BRIDGE_COMMITMENT_PROOF_NODES) {
    throw new Error(
      `runtime state read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_NODES} nodes`,
    );
  }
  const storageKeysHex = value.storageKeysHex.map((key, index) =>
    normalizeByteHex(key, `runtime state read proof storage key ${index}`));
  if (new Set(storageKeysHex).size !== storageKeysHex.length) {
    throw new Error('runtime state read proof storage keys must be unique');
  }
  if (storageKeysHex[0] !== BRIDGE_COMMITMENT_STORAGE_KEY_HEX) {
    throw new Error('runtime state read proof must target BridgeCommitment::CurrentCommitment');
  }
  if (
    typeof value.storageValueScaleHex !== 'string' ||
    value.storageValueScaleHex.replace(/^0x/i, '').length !==
      BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES * 2
  ) {
    throw new Error(
      `runtime state read proof storage value must be ${BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES} bytes`,
    );
  }
  const storageValueScaleHex = normalizeByteHex(
    value.storageValueScaleHex,
    'runtime state read proof storage value',
  );
  if (storageValueScaleHex !== encodeRuntimeBridgeCommitmentScaleHex(runtime)) {
    throw new Error('runtime state read proof storage value does not match the checkpoint commitment');
  }
  let proofBytes = 0;
  const proofNodesHex = value.proofNodesHex.map((node, index) => {
    if (typeof node !== 'string') {
      throw new Error(`runtime state read proof node ${index} must be hex`);
    }
    const rawLength = node.startsWith('0x') ? node.length - 2 : node.length;
    if (rawLength > MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES * 2) {
      throw new Error(
        `runtime state read proof node ${index} exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES} bytes`,
      );
    }
    const normalized = normalizeByteHex(node, `runtime state read proof node ${index}`);
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_BRIDGE_COMMITMENT_PROOF_BYTES) {
      throw new Error(
        `runtime state read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('runtime state read proof contains duplicate trie nodes');
  }
  return {
    atNativeBlockHashHex: targetHash,
    storageKeysHex,
    storageValueScaleHex,
    proofNodesHex,
  };
}

export function encodeRuntimeBridgeCommitmentScaleHex(value: {
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
}): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64LE(normalizeUint64(value.sidechainHeight, 'runtime sidechain height'));
  const burnCount = Buffer.alloc(4);
  if (
    !Number.isSafeInteger(value.burnLeafCount) ||
    value.burnLeafCount < 1 ||
    value.burnLeafCount > FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS
  ) {
    throw new Error(
      `runtime commitment burn count must be between 1 and ${FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS}`,
    );
  }
  burnCount.writeUInt32LE(value.burnLeafCount);
  const encoded = Buffer.concat([
    Buffer.from([FRONTIER_BRIDGE_EVENT_ROOT_FORMAT_VERSION]),
    Buffer.from(normalizeHashHex(value.sidechainIdHex, 'runtime sidechain ID'), 'hex'),
    height,
    Buffer.from(normalizeHashHex(value.executionBlockHashHex, 'runtime execution block hash'), 'hex'),
    Buffer.from(normalizeHashHex(value.bridgeEventRootHex, 'runtime bridge event root'), 'hex'),
    burnCount,
  ]);
  if (encoded.length !== BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES) {
    throw new Error('runtime bridge commitment SCALE encoding length drifted');
  }
  return encoded.toString('hex');
}

function assertBoundHash(value: string, targetHash: string, label: string): void {
  if (normalizeHashHex(value, `${label} native block hash`) !== targetHash) {
    throw new Error(`${label} is not bound to the target native block hash`);
  }
}

function assertRequestedTarget(value: string, targetHash: string, label: string): void {
  if (normalizeHashHex(value, `requested ${label} hash`) !== targetHash) {
    throw new Error(`offline observation bundle cannot serve ${label} for another block`);
  }
}

function normalizeHashHex(value: string, label: string): string {
  const clean = normalizeByteHex(value, label);
  if (clean.length !== 64) {
    throw new Error(`${label} must be 32 bytes`);
  }
  return clean;
}

function normalizeByteHex(value: string, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must contain non-empty whole hex bytes`);
  }
  return clean.toLowerCase();
}

function normalizeUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} number must be a non-negative safe integer`);
    }
    return BigInt(value);
  }
  if (typeof value === 'bigint') {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw new Error(`${label} must fit uint64`);
    }
    return value;
  }
  if (typeof value !== 'string') throw new Error(`${label} must be an integer`);
  let parsed: bigint;
  if (/^(0|[1-9]\d*)$/.test(value)) {
    parsed = BigInt(value);
  } else if (/^0x(0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new Error(`${label} must be a canonical non-negative integer`);
  }
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} must fit uint64`);
  return parsed;
}

function finalizedBridgeCheckpointCandidateBoundary(): FinalizedBridgeCheckpointCandidateBoundary {
  return {
    readOnly: true,
    candidateOnly: true,
    nodeObservationsCryptographicallyVerified: false,
    grandpaJustificationVerified: false,
    authoritySetAuthenticated: false,
    authorityTransitionsVerified: false,
    runtimeStateProofVerified: false,
    executionConsensusMappingVerified: false,
    sidechainFinalityVerified: false,
    ergoAnchorAuthenticated: false,
    onChainAcceptanceProven: false,
    transactionBroadcastOrMutation: false,
    gate5Closed: false,
  };
}
