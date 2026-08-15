import blakejs from 'blakejs';

import {
  admitErgoAutolykosV2Header,
  decodeErgoCompactDifficulty,
  encodeErgoCompactDifficulty,
  type ErgoAutolykosV2Admission,
} from './ergo-autolykos-v2-header.js';
import {
  expectedEip37Difficulty,
  requiredEip37ContextHeights,
  type ErgoDifficultyHeader,
  type ErgoEip37DifficultyProfile,
} from './ergo-eip37-difficulty.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const DIGEST_BYTES = 32;
const MAX_I64 = 0x7fff_ffff_ffff_ffffn;
const MAX_U32 = 0xffff_ffff;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U256 = (1n << 256n) - 1n;
const CONTEXT_DOMAIN = Buffer.from(
  'ERGO_EIP37_CONTEXT_V1',
  'ascii',
);
const PROFILE_DOMAIN = Buffer.from(
  'ERGO_AUTOLYKOS_V2_SPV_PROFILE_V1',
  'ascii',
);

export interface ErgoAutolykosV2SpvProfile {
  readonly sourceNetworkId: Uint8Array;
  readonly checkpointHeaderId: Uint8Array;
  readonly checkpointDifficultyContextDigest: Uint8Array;
  readonly checkpointCumulativeWork: bigint;
  readonly expectedHeaderVersion: number;
  readonly difficulty: ErgoEip37DifficultyProfile;
  readonly requiredConfirmations: number;
  readonly maximumHeaders: number;
  readonly maximumFutureDriftMs: bigint;
}

export interface ErgoAutolykosV2SpvCheckpoint {
  readonly sourceNetworkId: Uint8Array;
  readonly header: ErgoHeaderIdentityFields;
  readonly difficultyContext: readonly ErgoDifficultyHeader[];
}

export interface VerifiedErgoAutolykosV2Header {
  readonly header: ErgoHeaderIdentityFields;
  readonly headerId: Buffer;
  readonly difficulty: bigint;
  readonly cumulativeWork: bigint;
  readonly hit: bigint;
  readonly target: bigint;
}

interface VerifiedErgoAutolykosV2BranchState {
  readonly profileId: Buffer;
  readonly sourceNetworkId: Buffer;
  readonly checkpointHeaderId: Buffer;
  readonly checkpointHeight: number;
  readonly requiredConfirmations: number;
  readonly cumulativeWork: bigint;
  readonly headers: readonly VerifiedErgoAutolykosV2Header[];
}

const VERIFIED_BRANCH_TOKEN = Symbol('verified-ergo-autolykos-v2-branch');

export class VerifiedErgoAutolykosV2Branch {
  constructor(
    token: typeof VERIFIED_BRANCH_TOKEN,
    state: VerifiedErgoAutolykosV2BranchState,
  ) {
    if (token !== VERIFIED_BRANCH_TOKEN) {
      throw new Error('verified SPV branch can only be created by verification');
    }
    VERIFIED_BRANCH_STATE.set(this, state);
    Object.freeze(this);
  }

  get profileId(): Buffer {
    return Buffer.from(verifiedBranchState(this).profileId);
  }

  get sourceNetworkId(): Buffer {
    return Buffer.from(verifiedBranchState(this).sourceNetworkId);
  }

  get checkpointHeaderId(): Buffer {
    return Buffer.from(verifiedBranchState(this).checkpointHeaderId);
  }

  get checkpointHeight(): number {
    return verifiedBranchState(this).checkpointHeight;
  }

  get requiredConfirmations(): number {
    return verifiedBranchState(this).requiredConfirmations;
  }

  get cumulativeWork(): bigint {
    return verifiedBranchState(this).cumulativeWork;
  }

  get headers(): readonly VerifiedErgoAutolykosV2Header[] {
    return verifiedBranchState(this).headers.map(cloneVerifiedHeader);
  }
}

const VERIFIED_BRANCH_STATE = new WeakMap<
  VerifiedErgoAutolykosV2Branch,
  VerifiedErgoAutolykosV2BranchState
>();

export interface ErgoSpvBranchTargetDepth {
  readonly included: boolean;
  readonly targetHeight: number | null;
  readonly confirmations: number;
  readonly depthSatisfied: boolean;
}

/**
 * Verifies one bounded, contiguous Autolykos V2 branch from a pinned checkpoint.
 *
 * The result is proof-core data only. It does not authenticate the checkpoint,
 * persist relay state, verify a transaction, select mint, or authorize funds.
 */
export function verifyErgoAutolykosV2SpvBranch(
  profile: ErgoAutolykosV2SpvProfile,
  checkpoint: ErgoAutolykosV2SpvCheckpoint,
  suffix: readonly ErgoHeaderIdentityFields[],
  observedAtTimestamp: bigint,
): VerifiedErgoAutolykosV2Branch {
  validateProfile(profile);
  if (suffix.length === 0 || suffix.length > profile.maximumHeaders) {
    throw new Error(
      `SPV suffix must contain from 1 to ${profile.maximumHeaders} headers`,
    );
  }
  if (observedAtTimestamp < 0n || observedAtTimestamp > MAX_I64) {
    throw new Error('SPV observation timestamp must be an unsigned Int64');
  }

  const sourceNetworkId = exactBytes(
    checkpoint.sourceNetworkId,
    DIGEST_BYTES,
    'checkpoint source network ID',
  );
  if (!sourceNetworkId.equals(Buffer.from(profile.sourceNetworkId))) {
    throw new Error('SPV checkpoint source network does not match its profile');
  }
  const checkpointHeaderId = computeErgoHeaderId(checkpoint.header);
  if (!checkpointHeaderId.equals(Buffer.from(profile.checkpointHeaderId))) {
    throw new Error('SPV checkpoint header does not match its profile');
  }
  if (checkpoint.header.version !== profile.expectedHeaderVersion) {
    throw new Error('SPV checkpoint header version does not match its profile');
  }
  if (checkpoint.header.height + 1 < profile.difficulty.activationHeight) {
    throw new Error('SPV checkpoint predates the supported EIP-37 profile');
  }
  validateCheckpointDifficultyContext(profile, checkpoint);

  const profileId = computeErgoAutolykosV2SpvProfileId(profile);
  const difficultyHistory = new Map<number, ErgoDifficultyHeader>();
  for (const header of checkpoint.difficultyContext) {
    difficultyHistory.set(header.height, { ...header });
  }
  difficultyHistory.set(checkpoint.header.height, difficultyHeader(checkpoint.header));

  let parent = checkpoint.header;
  let parentId = checkpointHeaderId;
  let cumulativeWork = profile.checkpointCumulativeWork;
  const verified: VerifiedErgoAutolykosV2Header[] = [];
  const seen = new Set<string>([checkpointHeaderId.toString('hex')]);

  for (const candidate of suffix) {
    if (candidate.version !== profile.expectedHeaderVersion) {
      throw new Error('SPV suffix header version does not match its profile');
    }
    if (
      candidate.timestamp
      > observedAtTimestamp + profile.maximumFutureDriftMs
    ) {
      throw new Error('SPV suffix header exceeds the future timestamp limit');
    }
    const context = [...difficultyHistory.values()];
    const expectedDifficulty = expectedEip37Difficulty(
      difficultyHeader(parent),
      context,
      profile.difficulty,
    );
    const admission = admitErgoAutolykosV2Header(candidate, {
      parent: {
        headerId: parentId,
        height: parent.height,
        timestamp: parent.timestamp,
      },
      expectedNBits: encodeErgoCompactDifficulty(expectedDifficulty),
    });
    const headerIdHex = admission.headerId.toString('hex');
    if (seen.has(headerIdHex)) {
      throw new Error('SPV suffix contains a duplicate header identity');
    }
    seen.add(headerIdHex);
    if (admission.difficulty > MAX_U256 - cumulativeWork) {
      throw new Error('SPV cumulative work exceeds UInt256');
    }
    cumulativeWork += admission.difficulty;
    verified.push(toVerifiedHeader(candidate, admission, cumulativeWork));
    difficultyHistory.set(candidate.height, difficultyHeader(candidate));
    parent = candidate;
    parentId = admission.headerId;
  }

  return new VerifiedErgoAutolykosV2Branch(VERIFIED_BRANCH_TOKEN, {
    profileId,
    sourceNetworkId,
    checkpointHeaderId,
    checkpointHeight: checkpoint.header.height,
    requiredConfirmations: profile.requiredConfirmations,
    cumulativeWork,
    headers: verified,
  });
}

export function selectHeavierErgoAutolykosV2Branch(
  current: VerifiedErgoAutolykosV2Branch,
  candidate: VerifiedErgoAutolykosV2Branch,
): VerifiedErgoAutolykosV2Branch {
  const currentState = verifiedBranchState(current);
  const candidateState = verifiedBranchState(candidate);
  if (
    !currentState.profileId.equals(candidateState.profileId)
    || !currentState.checkpointHeaderId.equals(candidateState.checkpointHeaderId)
  ) {
    throw new Error('SPV branches do not share the same profile and checkpoint');
  }
  return candidateState.cumulativeWork > currentState.cumulativeWork
    ? candidate
    : current;
}

export function evaluateErgoSpvBranchTargetDepth(
  branch: VerifiedErgoAutolykosV2Branch,
  targetHeaderId: Uint8Array,
): ErgoSpvBranchTargetDepth {
  const state = verifiedBranchState(branch);
  const target = exactBytes(targetHeaderId, DIGEST_BYTES, 'target header ID');
  const index = state.headers.findIndex((header) => header.headerId.equals(target));
  if (index < 0) {
    return {
      included: false,
      targetHeight: null,
      confirmations: 0,
      depthSatisfied: false,
    };
  }
  const confirmations = state.headers.length - index;
  return {
    included: true,
    targetHeight: state.headers[index]!.header.height,
    confirmations,
    depthSatisfied: confirmations >= state.requiredConfirmations,
  };
}

export function computeErgoDifficultyContextDigest(
  context: readonly ErgoDifficultyHeader[],
): Buffer {
  if (context.length > 0xffff) {
    throw new Error('difficulty context exceeds Uint16 capacity');
  }
  const chunks = [CONTEXT_DOMAIN, unsignedBytes(context.length, 2)];
  let previousHeight = -1;
  for (const header of context) {
    if (!Number.isSafeInteger(header.height) || header.height <= previousHeight) {
      throw new Error('difficulty context heights must be strictly increasing');
    }
    if (header.timestamp < 0n || header.timestamp > MAX_I64) {
      throw new Error('difficulty context timestamp must be an unsigned Int64');
    }
    if (decodeErgoCompactDifficulty(header.nBits) <= 0n) {
      throw new Error('difficulty context must contain positive difficulty');
    }
    chunks.push(
      unsignedBytes(header.height, 4),
      unsignedBytes(header.timestamp, 8),
      unsignedBytes(header.nBits, 4),
    );
    previousHeight = header.height;
  }
  return hash(Buffer.concat(chunks));
}

export function computeErgoAutolykosV2SpvProfileId(
  profile: ErgoAutolykosV2SpvProfile,
): Buffer {
  validateProfile(profile);
  return hash(Buffer.concat([
    PROFILE_DOMAIN,
    Buffer.from(profile.sourceNetworkId),
    Buffer.from(profile.checkpointHeaderId),
    Buffer.from(profile.checkpointDifficultyContextDigest),
    unsignedBytes(profile.checkpointCumulativeWork, 32),
    unsignedBytes(profile.expectedHeaderVersion, 1),
    unsignedBytes(profile.difficulty.activationHeight, 4),
    unsignedBytes(profile.difficulty.epochLength, 4),
    unsignedBytes(profile.difficulty.useLastEpochs, 4),
    unsignedBytes(profile.difficulty.desiredBlockIntervalMs, 8),
    unsignedBytes(profile.difficulty.initialDifficulty, 32),
    unsignedBytes(profile.requiredConfirmations, 4),
    unsignedBytes(profile.maximumHeaders, 4),
    unsignedBytes(profile.maximumFutureDriftMs, 8),
  ]));
}

function validateCheckpointDifficultyContext(
  profile: ErgoAutolykosV2SpvProfile,
  checkpoint: ErgoAutolykosV2SpvCheckpoint,
): void {
  const digest = computeErgoDifficultyContextDigest(
    checkpoint.difficultyContext,
  );
  if (!digest.equals(Buffer.from(profile.checkpointDifficultyContextDigest))) {
    throw new Error('SPV checkpoint difficulty context digest mismatch');
  }
  const nextRecalculationHeight = checkpoint.header.height
    % profile.difficulty.epochLength === 0
    ? checkpoint.header.height + 1
    : (
      Math.floor(checkpoint.header.height / profile.difficulty.epochLength) + 1
    ) * profile.difficulty.epochLength + 1;
  const required = requiredEip37ContextHeights(
    nextRecalculationHeight,
    profile.difficulty,
  ).filter((height) => height < checkpoint.header.height);
  const actual = checkpoint.difficultyContext.map((header) => header.height);
  if (
    actual.length !== required.length
    || actual.some((height, index) => height !== required[index])
  ) {
    throw new Error('SPV checkpoint difficulty context heights are incomplete');
  }
}

function validateProfile(profile: ErgoAutolykosV2SpvProfile): void {
  exactBytes(profile.sourceNetworkId, DIGEST_BYTES, 'source network ID');
  exactBytes(profile.checkpointHeaderId, DIGEST_BYTES, 'checkpoint header ID');
  exactBytes(
    profile.checkpointDifficultyContextDigest,
    DIGEST_BYTES,
    'checkpoint difficulty context digest',
  );
  if (
    profile.checkpointCumulativeWork <= 0n
    || profile.checkpointCumulativeWork > MAX_U256
  ) {
    throw new Error('checkpoint cumulative work must be a positive UInt256');
  }
  if (
    !Number.isSafeInteger(profile.expectedHeaderVersion)
    || profile.expectedHeaderVersion < 2
    || profile.expectedHeaderVersion > 4
  ) {
    throw new Error('expected SPV header version must be from 2 to 4');
  }
  if (
    !Number.isSafeInteger(profile.requiredConfirmations)
    || profile.requiredConfirmations < 1
    || !Number.isSafeInteger(profile.maximumHeaders)
    || profile.maximumHeaders < profile.requiredConfirmations
  ) {
    throw new Error('SPV header and finality bounds are invalid');
  }
  if (
    profile.maximumFutureDriftMs < 0n
    || profile.maximumFutureDriftMs > MAX_U64
  ) {
    throw new Error('SPV future drift must be an unsigned Uint64');
  }
  requiredEip37ContextHeights(
    profile.difficulty.activationHeight,
    profile.difficulty,
  );
}

function difficultyHeader(
  header: ErgoHeaderIdentityFields,
): ErgoDifficultyHeader {
  return {
    height: header.height,
    timestamp: header.timestamp,
    nBits: header.nBits,
  };
}

function toVerifiedHeader(
  header: ErgoHeaderIdentityFields,
  admission: ErgoAutolykosV2Admission,
  cumulativeWork: bigint,
): VerifiedErgoAutolykosV2Header {
  return {
    header: cloneHeader(header),
    headerId: Buffer.from(admission.headerId),
    difficulty: admission.difficulty,
    cumulativeWork,
    hit: admission.hit,
    target: admission.target,
  };
}

function cloneVerifiedHeader(
  verified: VerifiedErgoAutolykosV2Header,
): VerifiedErgoAutolykosV2Header {
  return {
    header: cloneHeader(verified.header),
    headerId: Buffer.from(verified.headerId),
    difficulty: verified.difficulty,
    cumulativeWork: verified.cumulativeWork,
    hit: verified.hit,
    target: verified.target,
  };
}

function verifiedBranchState(
  branch: VerifiedErgoAutolykosV2Branch,
): VerifiedErgoAutolykosV2BranchState {
  if (!(branch instanceof VerifiedErgoAutolykosV2Branch)) {
    throw new Error('SPV branch was not produced by the verifier');
  }
  const state = VERIFIED_BRANCH_STATE.get(branch);
  if (state === undefined) {
    throw new Error('SPV branch was not produced by the verifier');
  }
  return state;
}

function cloneHeader(
  header: ErgoHeaderIdentityFields,
): ErgoHeaderIdentityFields {
  return {
    ...header,
    parentId: Buffer.from(header.parentId),
    adProofsRoot: Buffer.from(header.adProofsRoot),
    stateRoot: Buffer.from(header.stateRoot),
    transactionsRoot: Buffer.from(header.transactionsRoot),
    extensionHash: Buffer.from(header.extensionHash),
    votes: Buffer.from(header.votes),
    unparsedBytes: header.unparsedBytes === undefined
      ? undefined
      : Buffer.from(header.unparsedBytes),
    powSolution: {
      publicKey: Buffer.from(header.powSolution.publicKey),
      nonce: Buffer.from(header.powSolution.nonce),
      oneTimePublicKey: header.powSolution.oneTimePublicKey === undefined
        ? undefined
        : Buffer.from(header.powSolution.oneTimePublicKey),
      distance: header.powSolution.distance,
    },
  };
}

function hash(bytes: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(bytes, undefined, DIGEST_BYTES));
}

function exactBytes(
  value: Uint8Array,
  expectedLength: number,
  label: string,
): Buffer {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) {
    throw new Error(`${label} must be exactly ${expectedLength} bytes`);
  }
  return Buffer.from(value);
}

function unsignedBytes(
  value: number | bigint,
  length: number,
): Buffer {
  const numeric = typeof value === 'bigint' ? value : BigInt(value);
  if (numeric < 0n) throw new Error('fixed-width integer must be unsigned');
  const hex = numeric.toString(16).padStart(length * 2, '0');
  if (hex.length > length * 2) {
    throw new Error(`fixed-width integer exceeds ${length} bytes`);
  }
  return Buffer.from(hex, 'hex');
}
