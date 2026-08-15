import {
  verifyErgoAutolykosV2SpvBranch,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
  type VerifiedErgoAutolykosV2Branch,
} from './ergo-autolykos-v2-spv-branch.js';
import type { ErgoDifficultyHeader } from './ergo-eip37-difficulty.js';
import {
  serializeErgoHeaderIdentity,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';
import { canonicalJson } from './strict-json.js';

export const ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA =
  'e2s.ergo-autolykos-v2-relay-witness.v1' as const;

const MAX_BRANCHES = 32;
const MAX_HEADERS_PER_BRANCH = 512;
const MAX_TOTAL_HEADERS = 4096;
const MAX_DIFFICULTY_CONTEXT_HEADERS = 512;
const MAX_WITNESS_BYTES = 8 * 1024 * 1024;
const MAX_I64 = 0x7fff_ffff_ffff_ffffn;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U256 = (1n << 256n) - 1n;

export interface ErgoHeaderWitnessV1 {
  readonly version: number;
  readonly parentIdHex: string;
  readonly adProofsRootHex: string;
  readonly stateRootHex: string;
  readonly transactionsRootHex: string;
  readonly timestamp: string;
  readonly nBits: number;
  readonly height: number;
  readonly extensionHashHex: string;
  readonly votesHex: string;
  readonly unparsedBytesHex: string;
  readonly powSolution: Readonly<{
    publicKeyHex: string;
    nonceHex: string;
    oneTimePublicKeyHex: string | null;
    distance: string | null;
  }>;
}

export interface ErgoAutolykosV2SpvProfileWitnessV1 {
  readonly sourceNetworkIdHex: string;
  readonly checkpointHeaderIdHex: string;
  readonly checkpointDifficultyContextDigestHex: string;
  readonly checkpointCumulativeWork: string;
  readonly expectedHeaderVersion: number;
  readonly difficulty: Readonly<{
    activationHeight: number;
    epochLength: number;
    useLastEpochs: number;
    desiredBlockIntervalMs: string;
    initialDifficulty: string;
  }>;
  readonly requiredConfirmations: number;
  readonly maximumHeaders: number;
  readonly maximumFutureDriftMs: string;
}

export interface ErgoAutolykosV2SpvCheckpointWitnessV1 {
  readonly sourceNetworkIdHex: string;
  readonly header: Readonly<ErgoHeaderWitnessV1>;
  readonly difficultyContext: readonly Readonly<{
    height: number;
    timestamp: string;
    nBits: number;
  }>[];
}

export interface ErgoAutolykosV2RelayBranchWitnessV1 {
  readonly role: 'current' | 'competing';
  readonly observedAtTimestamp: string;
  readonly suffix: readonly Readonly<ErgoHeaderWitnessV1>[];
}

export interface ErgoAutolykosV2RelayWitnessV1 {
  readonly schema: typeof ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA;
  readonly profile: Readonly<ErgoAutolykosV2SpvProfileWitnessV1>;
  readonly checkpoint: Readonly<ErgoAutolykosV2SpvCheckpointWitnessV1>;
  readonly branches: readonly Readonly<ErgoAutolykosV2RelayBranchWitnessV1>[];
  readonly targetHeader: Readonly<ErgoHeaderWitnessV1>;
}

export interface BuildErgoAutolykosV2RelayWitnessV1Input {
  readonly profile: ErgoAutolykosV2SpvProfile;
  readonly checkpoint: ErgoAutolykosV2SpvCheckpoint;
  readonly currentBranch: Readonly<{
    suffix: readonly ErgoHeaderIdentityFields[];
    observedAtTimestamp: bigint;
  }>;
  readonly competingBranches: readonly Readonly<{
    suffix: readonly ErgoHeaderIdentityFields[];
    observedAtTimestamp: bigint;
  }>[];
  readonly targetHeader: ErgoHeaderIdentityFields;
}

export interface ReplayedErgoAutolykosV2RelayWitnessV1 {
  readonly witness: Readonly<ErgoAutolykosV2RelayWitnessV1>;
  readonly profile: ErgoAutolykosV2SpvProfile;
  readonly checkpoint: ErgoAutolykosV2SpvCheckpoint;
  readonly currentBranch: VerifiedErgoAutolykosV2Branch;
  readonly competingBranches: readonly VerifiedErgoAutolykosV2Branch[];
  readonly targetHeader: ErgoHeaderIdentityFields;
}

export function buildErgoAutolykosV2RelayWitnessV1(
  input: BuildErgoAutolykosV2RelayWitnessV1Input,
): Readonly<ErgoAutolykosV2RelayWitnessV1> {
  const snapshot = exactDataObject(input, [
    'profile',
    'checkpoint',
    'currentBranch',
    'competingBranches',
    'targetHeader',
  ], 'Ergo relay witness input');
  const current = branchInput(snapshot.currentBranch, 'current');
  const competing = denseArray(
    snapshot.competingBranches,
    MAX_BRANCHES - 1,
    'Ergo relay competing branches',
  ).map((value, index) => branchInput(
    value,
    'competing',
    `Ergo relay competing branch ${index}`,
  ));
  const witness = normalizeErgoAutolykosV2RelayWitnessV1({
    schema: ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA,
    profile: encodeProfile(snapshot.profile as ErgoAutolykosV2SpvProfile),
    checkpoint: encodeCheckpoint(
      snapshot.checkpoint as ErgoAutolykosV2SpvCheckpoint,
    ),
    branches: [current, ...competing],
    targetHeader: encodeHeader(
      snapshot.targetHeader as ErgoHeaderIdentityFields,
    ),
  });
  replayErgoAutolykosV2RelayWitnessV1(witness);
  return witness;
}

export function normalizeErgoAutolykosV2RelayWitnessV1(
  value: unknown,
): Readonly<ErgoAutolykosV2RelayWitnessV1> {
  const raw = exactDataObject(value, [
    'schema',
    'profile',
    'checkpoint',
    'branches',
    'targetHeader',
  ], 'Ergo relay witness');
  if (raw.schema !== ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA) {
    throw new Error('Ergo relay witness schema is unsupported');
  }
  const profile = normalizeProfile(raw.profile);
  const checkpoint = normalizeCheckpoint(raw.checkpoint);
  const branches = denseArray(
    raw.branches,
    MAX_BRANCHES,
    'Ergo relay branches',
  ).map((branch, index) => normalizeBranch(branch, index));
  if (branches.length === 0 || branches[0]!.role !== 'current') {
    throw new Error('Ergo relay witness must start with exactly one current branch');
  }
  if (branches.slice(1).some(branch => branch.role !== 'competing')) {
    throw new Error('Ergo relay witness contains another current branch');
  }
  const totalHeaders = branches.reduce(
    (total, branch) => total + branch.suffix.length,
    0,
  );
  if (totalHeaders > MAX_TOTAL_HEADERS) {
    throw new Error(`Ergo relay witness exceeds ${MAX_TOTAL_HEADERS} total headers`);
  }
  const witness = deepFreeze({
    schema: ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA,
    profile,
    checkpoint,
    branches,
    targetHeader: normalizeHeader(raw.targetHeader, 'Ergo relay target header'),
  });
  if (Buffer.byteLength(canonicalJson(witness), 'utf8') > MAX_WITNESS_BYTES) {
    throw new Error(`Ergo relay witness exceeds ${MAX_WITNESS_BYTES} bytes`);
  }
  return witness;
}

export function replayErgoAutolykosV2RelayWitnessV1(
  value: unknown,
): ReplayedErgoAutolykosV2RelayWitnessV1 {
  const witness = normalizeErgoAutolykosV2RelayWitnessV1(value);
  const profile = decodeProfile(witness.profile);
  const checkpoint = decodeCheckpoint(witness.checkpoint);
  const verified = witness.branches.map(branch =>
    verifyErgoAutolykosV2SpvBranch(
      profile,
      checkpoint,
      branch.suffix.map(decodeHeader),
      canonicalUnsignedBigInt(
        branch.observedAtTimestamp,
        MAX_I64,
        'Ergo relay observation timestamp',
      ),
    ));
  return {
    witness,
    profile,
    checkpoint,
    currentBranch: verified[0]!,
    competingBranches: Object.freeze(verified.slice(1)),
    targetHeader: decodeHeader(witness.targetHeader),
  };
}

function branchInput(
  value: unknown,
  role: ErgoAutolykosV2RelayBranchWitnessV1['role'],
  label = 'Ergo relay current branch',
): ErgoAutolykosV2RelayBranchWitnessV1 {
  const raw = exactDataObject(value, [
    'suffix',
    'observedAtTimestamp',
  ], label);
  const suffix = denseArray(
    raw.suffix,
    MAX_HEADERS_PER_BRANCH,
    `${label} suffix`,
  );
  if (suffix.length === 0) throw new Error(`${label} suffix must not be empty`);
  return {
    role,
    observedAtTimestamp: canonicalUnsignedBigInt(
      raw.observedAtTimestamp,
      MAX_I64,
      `${label} observation timestamp`,
    ).toString(),
    suffix: suffix.map((header) => encodeHeader(
      header as ErgoHeaderIdentityFields,
    )),
  };
}

function encodeProfile(
  value: ErgoAutolykosV2SpvProfile,
): ErgoAutolykosV2SpvProfileWitnessV1 {
  const raw = exactDataObject(value, [
    'sourceNetworkId',
    'checkpointHeaderId',
    'checkpointDifficultyContextDigest',
    'checkpointCumulativeWork',
    'expectedHeaderVersion',
    'difficulty',
    'requiredConfirmations',
    'maximumHeaders',
    'maximumFutureDriftMs',
  ], 'Ergo relay profile input');
  const difficulty = exactDataObject(raw.difficulty, [
    'activationHeight',
    'epochLength',
    'useLastEpochs',
    'desiredBlockIntervalMs',
    'initialDifficulty',
  ], 'Ergo relay difficulty profile input');
  return {
    sourceNetworkIdHex: bytesHex(raw.sourceNetworkId, 32, 'source network ID'),
    checkpointHeaderIdHex:
      bytesHex(raw.checkpointHeaderId, 32, 'checkpoint header ID'),
    checkpointDifficultyContextDigestHex: bytesHex(
      raw.checkpointDifficultyContextDigest,
      32,
      'checkpoint difficulty-context digest',
    ),
    checkpointCumulativeWork: canonicalPositiveBigInt(
      raw.checkpointCumulativeWork,
      MAX_U256,
      'checkpoint cumulative work',
    ).toString(),
    expectedHeaderVersion: safeInteger(
      raw.expectedHeaderVersion,
      2,
      4,
      'expected header version',
    ),
    difficulty: {
      activationHeight: safeInteger(
        difficulty.activationHeight,
        1,
        0x7fff_ffff,
        'difficulty activation height',
      ),
      epochLength: safeInteger(
        difficulty.epochLength,
        1,
        0x7fff_ffff,
        'difficulty epoch length',
      ),
      useLastEpochs: safeInteger(
        difficulty.useLastEpochs,
        1,
        0x7fff_ffff,
        'difficulty retained epochs',
      ),
      desiredBlockIntervalMs: canonicalPositiveBigInt(
        difficulty.desiredBlockIntervalMs,
        MAX_U64,
        'desired block interval',
      ).toString(),
      initialDifficulty: canonicalPositiveBigInt(
        difficulty.initialDifficulty,
        MAX_U256,
        'initial difficulty',
      ).toString(),
    },
    requiredConfirmations: safeInteger(
      raw.requiredConfirmations,
      1,
      MAX_HEADERS_PER_BRANCH,
      'required confirmations',
    ),
    maximumHeaders: safeInteger(
      raw.maximumHeaders,
      1,
      MAX_HEADERS_PER_BRANCH,
      'maximum branch headers',
    ),
    maximumFutureDriftMs: canonicalUnsignedBigInt(
      raw.maximumFutureDriftMs,
      MAX_U64,
      'maximum future drift',
    ).toString(),
  };
}

function normalizeProfile(value: unknown): ErgoAutolykosV2SpvProfileWitnessV1 {
  const raw = exactDataObject(value, [
    'sourceNetworkIdHex',
    'checkpointHeaderIdHex',
    'checkpointDifficultyContextDigestHex',
    'checkpointCumulativeWork',
    'expectedHeaderVersion',
    'difficulty',
    'requiredConfirmations',
    'maximumHeaders',
    'maximumFutureDriftMs',
  ], 'Ergo relay profile');
  const difficulty = exactDataObject(raw.difficulty, [
    'activationHeight',
    'epochLength',
    'useLastEpochs',
    'desiredBlockIntervalMs',
    'initialDifficulty',
  ], 'Ergo relay difficulty profile');
  const profile = {
    sourceNetworkIdHex: fixedHex(raw.sourceNetworkIdHex, 32, 'source network ID'),
    checkpointHeaderIdHex:
      fixedHex(raw.checkpointHeaderIdHex, 32, 'checkpoint header ID'),
    checkpointDifficultyContextDigestHex: fixedHex(
      raw.checkpointDifficultyContextDigestHex,
      32,
      'checkpoint difficulty-context digest',
    ),
    checkpointCumulativeWork: canonicalPositiveBigInt(
      raw.checkpointCumulativeWork,
      MAX_U256,
      'checkpoint cumulative work',
    ).toString(),
    expectedHeaderVersion: safeInteger(
      raw.expectedHeaderVersion,
      2,
      4,
      'expected header version',
    ),
    difficulty: {
      activationHeight: safeInteger(
        difficulty.activationHeight,
        1,
        0x7fff_ffff,
        'difficulty activation height',
      ),
      epochLength: safeInteger(
        difficulty.epochLength,
        1,
        0x7fff_ffff,
        'difficulty epoch length',
      ),
      useLastEpochs: safeInteger(
        difficulty.useLastEpochs,
        1,
        0x7fff_ffff,
        'difficulty retained epochs',
      ),
      desiredBlockIntervalMs: canonicalPositiveBigInt(
        difficulty.desiredBlockIntervalMs,
        MAX_U64,
        'desired block interval',
      ).toString(),
      initialDifficulty: canonicalPositiveBigInt(
        difficulty.initialDifficulty,
        MAX_U256,
        'initial difficulty',
      ).toString(),
    },
    requiredConfirmations: safeInteger(
      raw.requiredConfirmations,
      1,
      MAX_HEADERS_PER_BRANCH,
      'required confirmations',
    ),
    maximumHeaders: safeInteger(
      raw.maximumHeaders,
      1,
      MAX_HEADERS_PER_BRANCH,
      'maximum branch headers',
    ),
    maximumFutureDriftMs: canonicalUnsignedBigInt(
      raw.maximumFutureDriftMs,
      MAX_U64,
      'maximum future drift',
    ).toString(),
  };
  if (profile.requiredConfirmations > profile.maximumHeaders) {
    throw new Error('Ergo relay profile confirmation bound exceeds branch bound');
  }
  return profile;
}

function decodeProfile(
  value: ErgoAutolykosV2SpvProfileWitnessV1,
): ErgoAutolykosV2SpvProfile {
  return {
    sourceNetworkId: Buffer.from(value.sourceNetworkIdHex, 'hex'),
    checkpointHeaderId: Buffer.from(value.checkpointHeaderIdHex, 'hex'),
    checkpointDifficultyContextDigest: Buffer.from(
      value.checkpointDifficultyContextDigestHex,
      'hex',
    ),
    checkpointCumulativeWork: BigInt(value.checkpointCumulativeWork),
    expectedHeaderVersion: value.expectedHeaderVersion,
    difficulty: {
      activationHeight: value.difficulty.activationHeight,
      epochLength: value.difficulty.epochLength,
      useLastEpochs: value.difficulty.useLastEpochs,
      desiredBlockIntervalMs: BigInt(value.difficulty.desiredBlockIntervalMs),
      initialDifficulty: BigInt(value.difficulty.initialDifficulty),
    },
    requiredConfirmations: value.requiredConfirmations,
    maximumHeaders: value.maximumHeaders,
    maximumFutureDriftMs: BigInt(value.maximumFutureDriftMs),
  };
}

function encodeCheckpoint(
  value: ErgoAutolykosV2SpvCheckpoint,
): ErgoAutolykosV2SpvCheckpointWitnessV1 {
  const raw = exactDataObject(value, [
    'sourceNetworkId',
    'header',
    'difficultyContext',
  ], 'Ergo relay checkpoint input');
  return {
    sourceNetworkIdHex:
      bytesHex(raw.sourceNetworkId, 32, 'checkpoint source network ID'),
    header: encodeHeader(raw.header as ErgoHeaderIdentityFields),
    difficultyContext: denseArray(
      raw.difficultyContext,
      MAX_DIFFICULTY_CONTEXT_HEADERS,
      'checkpoint difficulty context',
    ).map((entry, index) => encodeDifficultyHeader(
      entry as ErgoDifficultyHeader,
      `checkpoint difficulty context ${index}`,
    )),
  };
}

function normalizeCheckpoint(
  value: unknown,
): ErgoAutolykosV2SpvCheckpointWitnessV1 {
  const raw = exactDataObject(value, [
    'sourceNetworkIdHex',
    'header',
    'difficultyContext',
  ], 'Ergo relay checkpoint');
  return {
    sourceNetworkIdHex: fixedHex(
      raw.sourceNetworkIdHex,
      32,
      'checkpoint source network ID',
    ),
    header: normalizeHeader(raw.header, 'Ergo relay checkpoint header'),
    difficultyContext: denseArray(
      raw.difficultyContext,
      MAX_DIFFICULTY_CONTEXT_HEADERS,
      'checkpoint difficulty context',
    ).map((entry, index) => normalizeDifficultyHeader(
      entry,
      `checkpoint difficulty context ${index}`,
    )),
  };
}

function decodeCheckpoint(
  value: ErgoAutolykosV2SpvCheckpointWitnessV1,
): ErgoAutolykosV2SpvCheckpoint {
  return {
    sourceNetworkId: Buffer.from(value.sourceNetworkIdHex, 'hex'),
    header: decodeHeader(value.header),
    difficultyContext: value.difficultyContext.map(entry => ({
      height: entry.height,
      timestamp: BigInt(entry.timestamp),
      nBits: entry.nBits,
    })),
  };
}

function normalizeBranch(
  value: unknown,
  index: number,
): ErgoAutolykosV2RelayBranchWitnessV1 {
  const raw = exactDataObject(value, [
    'role',
    'observedAtTimestamp',
    'suffix',
  ], `Ergo relay branch ${index}`);
  if (raw.role !== 'current' && raw.role !== 'competing') {
    throw new Error(`Ergo relay branch ${index} role is unsupported`);
  }
  const suffix = denseArray(
    raw.suffix,
    MAX_HEADERS_PER_BRANCH,
    `Ergo relay branch ${index} suffix`,
  );
  if (suffix.length === 0) {
    throw new Error(`Ergo relay branch ${index} suffix must not be empty`);
  }
  return {
    role: raw.role,
    observedAtTimestamp: canonicalUnsignedBigInt(
      raw.observedAtTimestamp,
      MAX_I64,
      `Ergo relay branch ${index} observation timestamp`,
    ).toString(),
    suffix: suffix.map((header, headerIndex) => normalizeHeader(
      header,
      `Ergo relay branch ${index} header ${headerIndex}`,
    )),
  };
}

function encodeHeader(value: ErgoHeaderIdentityFields): ErgoHeaderWitnessV1 {
  const raw = dataObjectWithOptionalKeys(
    value,
    [
      'version',
      'parentId',
      'adProofsRoot',
      'stateRoot',
      'transactionsRoot',
      'timestamp',
      'nBits',
      'height',
      'extensionHash',
      'votes',
      'powSolution',
    ],
    ['unparsedBytes'],
    'Ergo relay header input',
  );
  const pow = dataObjectWithOptionalKeys(
    raw.powSolution,
    ['publicKey', 'nonce'],
    ['oneTimePublicKey', 'distance'],
    'Ergo relay header PoW input',
  );
  return normalizeHeader({
    version: raw.version,
    parentIdHex: bytesHex(raw.parentId, 32, 'header parent ID'),
    adProofsRootHex: bytesHex(raw.adProofsRoot, 32, 'header AD proofs root'),
    stateRootHex: bytesHex(raw.stateRoot, 33, 'header state root'),
    transactionsRootHex:
      bytesHex(raw.transactionsRoot, 32, 'header transactions root'),
    timestamp: canonicalUnsignedBigInt(
      raw.timestamp,
      MAX_I64,
      'header timestamp',
    ).toString(),
    nBits: raw.nBits,
    height: raw.height,
    extensionHashHex:
      bytesHex(raw.extensionHash, 32, 'header extension hash'),
    votesHex: bytesHex(raw.votes, 3, 'header votes'),
    unparsedBytesHex: raw.unparsedBytes === undefined
      ? ''
      : bytesHex(raw.unparsedBytes, undefined, 'header unparsed bytes'),
    powSolution: {
      publicKeyHex: bytesHex(pow.publicKey, 33, 'header public key'),
      nonceHex: bytesHex(pow.nonce, 8, 'header nonce'),
      oneTimePublicKeyHex: pow.oneTimePublicKey === undefined
        ? null
        : bytesHex(pow.oneTimePublicKey, 33, 'header one-time public key'),
      distance: pow.distance === undefined
        ? null
        : canonicalUnsignedBigInt(pow.distance, MAX_U256, 'header distance').toString(),
    },
  }, 'Ergo relay header');
}

function normalizeHeader(value: unknown, label: string): ErgoHeaderWitnessV1 {
  const raw = exactDataObject(value, [
    'version',
    'parentIdHex',
    'adProofsRootHex',
    'stateRootHex',
    'transactionsRootHex',
    'timestamp',
    'nBits',
    'height',
    'extensionHashHex',
    'votesHex',
    'unparsedBytesHex',
    'powSolution',
  ], label);
  const pow = exactDataObject(raw.powSolution, [
    'publicKeyHex',
    'nonceHex',
    'oneTimePublicKeyHex',
    'distance',
  ], `${label} PoW`);
  const normalized = {
    version: safeInteger(raw.version, 2, 4, `${label} version`),
    parentIdHex: fixedHex(raw.parentIdHex, 32, `${label} parent ID`),
    adProofsRootHex:
      fixedHex(raw.adProofsRootHex, 32, `${label} AD proofs root`),
    stateRootHex: fixedHex(raw.stateRootHex, 33, `${label} state root`),
    transactionsRootHex:
      fixedHex(raw.transactionsRootHex, 32, `${label} transactions root`),
    timestamp: canonicalUnsignedBigInt(
      raw.timestamp,
      MAX_I64,
      `${label} timestamp`,
    ).toString(),
    nBits: safeInteger(raw.nBits, 0, 0xffff_ffff, `${label} nBits`),
    height: safeInteger(raw.height, 0, 0x7fff_ffff, `${label} height`),
    extensionHashHex:
      fixedHex(raw.extensionHashHex, 32, `${label} extension hash`),
    votesHex: fixedHex(raw.votesHex, 3, `${label} votes`),
    unparsedBytesHex: variableHex(
      raw.unparsedBytesHex,
      0xff,
      `${label} unparsed bytes`,
      true,
    ),
    powSolution: {
      publicKeyHex:
        fixedHex(pow.publicKeyHex, 33, `${label} public key`),
      nonceHex: fixedHex(pow.nonceHex, 8, `${label} nonce`),
      oneTimePublicKeyHex: nullableFixedHex(
        pow.oneTimePublicKeyHex,
        33,
        `${label} one-time public key`,
      ),
      distance: pow.distance === null
        ? null
        : canonicalUnsignedBigInt(
          pow.distance,
          MAX_U256,
          `${label} distance`,
        ).toString(),
    },
  };
  if (
    normalized.unparsedBytesHex !== ''
    || normalized.powSolution.oneTimePublicKeyHex !== null
    || normalized.powSolution.distance !== null
  ) {
    throw new Error(`${label} must use the supported Autolykos V2 header shape`);
  }
  serializeErgoHeaderIdentity(decodeHeader(normalized));
  return normalized;
}

function decodeHeader(value: ErgoHeaderWitnessV1): ErgoHeaderIdentityFields {
  return {
    version: value.version,
    parentId: Buffer.from(value.parentIdHex, 'hex'),
    adProofsRoot: Buffer.from(value.adProofsRootHex, 'hex'),
    stateRoot: Buffer.from(value.stateRootHex, 'hex'),
    transactionsRoot: Buffer.from(value.transactionsRootHex, 'hex'),
    timestamp: BigInt(value.timestamp),
    nBits: value.nBits,
    height: value.height,
    extensionHash: Buffer.from(value.extensionHashHex, 'hex'),
    votes: Buffer.from(value.votesHex, 'hex'),
    unparsedBytes: Buffer.from(value.unparsedBytesHex, 'hex'),
    powSolution: {
      publicKey: Buffer.from(value.powSolution.publicKeyHex, 'hex'),
      nonce: Buffer.from(value.powSolution.nonceHex, 'hex'),
    },
  };
}

function encodeDifficultyHeader(
  value: ErgoDifficultyHeader,
  label: string,
): { height: number; timestamp: string; nBits: number } {
  const raw = exactDataObject(value, [
    'height',
    'timestamp',
    'nBits',
  ], label);
  return normalizeDifficultyHeader({
    height: raw.height,
    timestamp: typeof raw.timestamp === 'bigint'
      ? raw.timestamp.toString()
      : raw.timestamp,
    nBits: raw.nBits,
  }, label);
}

function normalizeDifficultyHeader(
  value: unknown,
  label: string,
): { height: number; timestamp: string; nBits: number } {
  const raw = exactDataObject(value, [
    'height',
    'timestamp',
    'nBits',
  ], label);
  return {
    height: safeInteger(raw.height, 0, 0x7fff_ffff, `${label} height`),
    timestamp: canonicalUnsignedBigInt(
      raw.timestamp,
      MAX_I64,
      `${label} timestamp`,
    ).toString(),
    nBits: safeInteger(raw.nBits, 0, 0xffff_ffff, `${label} nBits`),
  };
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  return dataObjectWithOptionalKeys(value, keys, [], label);
}

function dataObjectWithOptionalKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set([...required, ...optional]);
  const actual = ownKeys(descriptors);
  if (
    actual.some(key => typeof key !== 'string' || !allowed.has(key))
    || required.some(key => descriptors[key] === undefined)
  ) {
    throw new Error(`${label} contains unsupported or missing fields`);
  }
  const result: Record<string, unknown> = {};
  for (const key of actual) {
    const descriptor = descriptors[key as string];
    if (
      typeof key !== 'string'
      || descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}.${String(key)} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(
  value: unknown,
  maximumLength: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new Error(`${label} must be an array of at most ${maximumLength} items`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(['length']);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowed.add(key);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}[${index}] must be a dense data property`);
    }
    result.push(descriptor.value);
  }
  if (ownKeys(descriptors).some(key => !allowed.has(key))) {
    throw new Error(`${label} must not contain extra properties`);
  }
  return result;
}

function bytesHex(
  value: unknown,
  expectedLength: number | undefined,
  label: string,
): string {
  if (
    !(value instanceof Uint8Array)
    || (expectedLength !== undefined && value.length !== expectedLength)
  ) {
    throw new Error(
      expectedLength === undefined
        ? `${label} must be bytes`
        : `${label} must be exactly ${expectedLength} bytes`,
    );
  }
  return Buffer.from(value).toString('hex');
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = variableHex(value, bytes, label);
  if (clean.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return clean;
}

function nullableFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string | null {
  return value === null ? null : fixedHex(value, bytes, label);
}

function variableHex(
  value: unknown,
  maximumBytes: number,
  label: string,
  allowEmpty = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    (!allowEmpty && clean.length === 0)
    || clean.length % 2 !== 0
    || clean.length / 2 > maximumBytes
    || !/^[0-9a-f]*$/.test(clean)
  ) {
    throw new Error(`${label} must be lowercase bounded hex`);
  }
  return clean;
}

function safeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function ownKeys(value: object): PropertyKey[] {
  return [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];
}

function canonicalUnsignedBigInt(
  value: unknown,
  maximum: bigint,
  label: string,
): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n || value > maximum) {
      throw new Error(`${label} is outside its unsigned range`);
    }
    return value;
  }
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned integer`);
  }
  const parsed = BigInt(value);
  if (parsed > maximum) throw new Error(`${label} exceeds its unsigned range`);
  return parsed;
}

function canonicalPositiveBigInt(
  value: unknown,
  maximum: bigint,
  label: string,
): bigint {
  const parsed = canonicalUnsignedBigInt(value, maximum, label);
  if (parsed === 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
