import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  decodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from './ergo-autolykos-v2-header.js';
import {
  expectedEip37Difficulty,
  requiredEip37ContextHeights,
  type ErgoDifficultyHeader,
} from './ergo-eip37-difficulty.js';
import {
  computeErgoDifficultyContextDigest,
  evaluateErgoSpvBranchTargetDepth,
  verifyErgoAutolykosV2SpvBranch,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
} from './ergo-autolykos-v2-spv-branch.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderWithoutPow,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VECTOR_PATH = resolve(
  BRIDGE_ROOT,
  'relayer/test-vectors/ergo-autolykos-v2-spv-jvm-differential-v1.json',
);
const VECTOR_SHA256 =
  '546a099f4344a206f4f194e8c1652ca7a943da5be3a29311518aea932e157bd4';
const ERGO_NODE_COMMIT =
  '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1';

interface HeaderRecord {
  idHex: string;
  parentIdHex: string;
  version: number;
  height: number;
  timestampMs: string;
  nBits: number;
  adProofsRootHex: string;
  stateRootHex: string;
  transactionsRootHex: string;
  extensionHashHex: string;
  votesHex: string;
  powPublicKeyHex: string;
  powNonceHex: string;
}

interface ExpectedHeaderRecord {
  header: HeaderRecord;
  expected: {
    prePowHex: string;
    difficulty: string;
    target: string;
    hit: string;
    relativeCumulativeWork: string;
  };
}

interface DifferentialVector {
  schema: string;
  source: {
    network: string;
    networkIdHex: string;
    apiBase: string;
    heightRouteTemplate: string;
    headerRouteTemplate: string;
    ergoNodeCommit: string;
  };
  profile: {
    activationHeight: number;
    epochLength: number;
    useLastEpochs: number;
    desiredBlockIntervalMs: string;
    initialDifficulty: string;
    expectedHeaderVersion: number;
    requiredConfirmations: number;
    maximumHeaders: number;
    maximumFutureDriftMs: string;
    relativeCheckpointWork: string;
  };
  difficultyContext: HeaderRecord[];
  checkpoint: HeaderRecord;
  suffix: ExpectedHeaderRecord[];
  expected: {
    difficultyContextDigestHex: string;
    boundaryDifficulty: string;
    boundaryNBits: number;
    suffixWork: string;
    finalRelativeCumulativeWork: string;
    finalHeaderIdHex: string;
  };
  mutants: {
    easierBoundaryNBits: number;
    ancestryHeaderIndex: number;
    ancestryParentIdHex: string;
  };
  boundaries: {
    historicalHeaderFixture: boolean;
    currentCanonicalityEstablished: boolean;
    checkpointAuthenticationEstablished: boolean;
    absoluteCheckpointWorkEstablished: boolean;
    nodeAcceptanceEstablished: boolean;
    mintAuthorityEstablished: boolean;
    settlementAuthorityEstablished: boolean;
    gate5Closed: boolean;
    trustlessStatusEstablished: boolean;
    productionReadinessEstablished: boolean;
    broadcastPerformed: boolean;
  };
}

const vectorBytes = readFileSync(VECTOR_PATH);
const vector = JSON.parse(vectorBytes.toString('utf8')) as DifferentialVector;

describe('Ergo Autolykos V2 SPV JVM differential vector', () => {
  it('pins one bounded historical mainnet window without promoting authority', () => {
    const attributes = readFileSync(resolve(BRIDGE_ROOT, '.gitattributes'), 'utf8');
    expect(attributes).toContain('relayer/test-vectors/*.json text eol=lf');
    expect(sha256(vectorBytes)).toBe(VECTOR_SHA256);
    expect(vector.schema)
      .toBe('e2s.ergo-autolykos-v2-spv-jvm-differential.v1');
    expect(vector.source).toEqual({
      network: 'Ergo mainnet',
      networkIdHex:
        'b0244dfc267baca974a4caee06120321562784303a8a688976ae56170e4d175b',
      apiBase: 'https://api.ergoplatform.com',
      heightRouteTemplate: '/blocks/at/{height}',
      headerRouteTemplate: '/blocks/{headerId}',
      ergoNodeCommit: ERGO_NODE_COMMIT,
    });
    expect(vector.boundaries).toEqual({
      historicalHeaderFixture: true,
      currentCanonicalityEstablished: false,
      checkpointAuthenticationEstablished: false,
      absoluteCheckpointWorkEstablished: false,
      nodeAcceptanceEstablished: false,
      mintAuthorityEstablished: false,
      settlementAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      broadcastPerformed: false,
    });

    const checkpoint = canonicalHeader(vector.checkpoint);
    const contextHeights = vector.difficultyContext.map(({ height }) => height);
    expect(contextHeights).toEqual(
      requiredEip37ContextHeights(
        checkpoint.height + 1,
        spvProfile().difficulty,
      ).filter((height) => height < checkpoint.height),
    );
    expect(vector.suffix.map(({ header }) => header.height))
      .toEqual(Array.from({ length: 10 }, (_, index) => 926_977 + index));
  });

  it('matches IDs, EIP-37 difficulty, pre-PoW bytes, PoW and relative work', () => {
    const checkpoint = canonicalHeader(vector.checkpoint);
    const difficultyContext = vector.difficultyContext.map(difficultyHeader);
    const checkpointDifficulty = difficultyHeader(vector.checkpoint);
    const expectedBoundaryDifficulty = expectedEip37Difficulty(
      checkpointDifficulty,
      [...difficultyContext, checkpointDifficulty],
      spvProfile().difficulty,
    );
    expect(expectedBoundaryDifficulty.toString())
      .toBe(vector.expected.boundaryDifficulty);
    expect(vector.suffix[0]!.header.nBits).toBe(vector.expected.boundaryNBits);

    for (const record of [
      ...vector.difficultyContext,
      vector.checkpoint,
      ...vector.suffix.map(({ header }) => header),
    ]) {
      expect(computeErgoHeaderId(canonicalHeader(record)).toString('hex'))
        .toBe(record.idHex);
    }

    const branch = verifyErgoAutolykosV2SpvBranch(
      spvProfile(),
      spvCheckpoint(),
      vector.suffix.map(({ header }) => canonicalHeader(header)),
      BigInt(vector.suffix.at(-1)!.header.timestampMs),
    );
    expect(computeErgoDifficultyContextDigest(difficultyContext).toString('hex'))
      .toBe(vector.expected.difficultyContextDigestHex);
    expect(branch.headers).toHaveLength(vector.suffix.length);

    for (const [index, verified] of branch.headers.entries()) {
      const entry = vector.suffix[index]!;
      expect(verified.headerId.toString('hex')).toBe(entry.header.idHex);
      expect(serializeErgoHeaderWithoutPow(verified.header).toString('hex'))
        .toBe(entry.expected.prePowHex);
      expect(verified.difficulty.toString()).toBe(entry.expected.difficulty);
      expect(verified.target.toString()).toBe(entry.expected.target);
      expect(verified.hit.toString()).toBe(entry.expected.hit);
      expect(verified.cumulativeWork.toString())
        .toBe(entry.expected.relativeCumulativeWork);
    }

    const suffixWork = branch.headers.reduce(
      (total, header) => total + header.difficulty,
      0n,
    );
    expect(suffixWork.toString()).toBe(vector.expected.suffixWork);
    expect(branch.cumulativeWork.toString())
      .toBe(vector.expected.finalRelativeCumulativeWork);
    expect(branch.headers.at(-1)!.headerId.toString('hex'))
      .toBe(vector.expected.finalHeaderIdHex);
    expect(evaluateErgoSpvBranchTargetDepth(
      branch,
      branch.headers[0]!.headerId,
    )).toEqual({
      included: true,
      targetHeight: 926_977,
      confirmations: 10,
      depthSatisfied: true,
    });
  });

  it('rejects isolated easier-difficulty and ancestry mutations', () => {
    const suffix = vector.suffix.map(({ header }) => canonicalHeader(header));
    const easier = cloneHeader(suffix[0]!, {
      nBits: vector.mutants.easierBoundaryNBits,
    });
    expect(decodeErgoCompactDifficulty(easier.nBits))
      .toBeLessThan(decodeErgoCompactDifficulty(suffix[0]!.nBits));
    expect(verifyClaimedAutolykosV2ProofOfWork(easier)).toBe(true);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      spvProfile(),
      spvCheckpoint(),
      [easier, ...suffix.slice(1)],
      BigInt(vector.suffix.at(-1)!.header.timestampMs),
    )).toThrow(/expected difficulty/);

    const ancestryIndex = vector.mutants.ancestryHeaderIndex;
    const wrongParent = cloneHeader(suffix[ancestryIndex]!, {
      parentId: fixedHex(
        vector.mutants.ancestryParentIdHex,
        32,
        'ancestry mutant parent ID',
      ),
    });
    expect(() => verifyErgoAutolykosV2SpvBranch(
      spvProfile(),
      spvCheckpoint(),
      [
        ...suffix.slice(0, ancestryIndex),
        wrongParent,
        ...suffix.slice(ancestryIndex + 1),
      ],
      BigInt(vector.suffix.at(-1)!.header.timestampMs),
    )).toThrow(/does not extend/);
  });
});

function spvProfile(): ErgoAutolykosV2SpvProfile {
  return {
    sourceNetworkId: fixedHex(
      vector.source.networkIdHex,
      32,
      'source network ID',
    ),
    checkpointHeaderId: fixedHex(
      vector.checkpoint.idHex,
      32,
      'checkpoint header ID',
    ),
    checkpointDifficultyContextDigest: fixedHex(
      vector.expected.difficultyContextDigestHex,
      32,
      'difficulty context digest',
    ),
    checkpointCumulativeWork: BigInt(vector.profile.relativeCheckpointWork),
    expectedHeaderVersion: vector.profile.expectedHeaderVersion,
    difficulty: {
      activationHeight: vector.profile.activationHeight,
      epochLength: vector.profile.epochLength,
      useLastEpochs: vector.profile.useLastEpochs,
      desiredBlockIntervalMs:
        BigInt(vector.profile.desiredBlockIntervalMs),
      initialDifficulty: BigInt(vector.profile.initialDifficulty),
    },
    requiredConfirmations: vector.profile.requiredConfirmations,
    maximumHeaders: vector.profile.maximumHeaders,
    maximumFutureDriftMs: BigInt(vector.profile.maximumFutureDriftMs),
  };
}

function spvCheckpoint(): ErgoAutolykosV2SpvCheckpoint {
  return {
    sourceNetworkId: fixedHex(
      vector.source.networkIdHex,
      32,
      'source network ID',
    ),
    header: canonicalHeader(vector.checkpoint),
    difficultyContext: vector.difficultyContext.map(difficultyHeader),
  };
}

function canonicalHeader(record: HeaderRecord): ErgoHeaderIdentityFields {
  return {
    version: record.version,
    parentId: fixedHex(record.parentIdHex, 32, 'parent ID'),
    adProofsRoot: fixedHex(record.adProofsRootHex, 32, 'AD proofs root'),
    stateRoot: fixedHex(record.stateRootHex, 33, 'state root'),
    transactionsRoot: fixedHex(
      record.transactionsRootHex,
      32,
      'transactions root',
    ),
    timestamp: unsignedDecimal(record.timestampMs, 'timestamp'),
    nBits: record.nBits,
    height: record.height,
    extensionHash: fixedHex(record.extensionHashHex, 32, 'extension hash'),
    votes: fixedHex(record.votesHex, 3, 'votes'),
    powSolution: {
      publicKey: fixedHex(record.powPublicKeyHex, 33, 'PoW public key'),
      nonce: fixedHex(record.powNonceHex, 8, 'PoW nonce'),
    },
  };
}

function difficultyHeader(record: HeaderRecord): ErgoDifficultyHeader {
  return {
    height: record.height,
    timestamp: unsignedDecimal(record.timestampMs, 'timestamp'),
    nBits: record.nBits,
  };
}

function cloneHeader(
  header: ErgoHeaderIdentityFields,
  patch: Partial<ErgoHeaderIdentityFields>,
): ErgoHeaderIdentityFields {
  return {
    ...header,
    ...patch,
    parentId: Buffer.from(patch.parentId ?? header.parentId),
    adProofsRoot: Buffer.from(header.adProofsRoot),
    stateRoot: Buffer.from(header.stateRoot),
    transactionsRoot: Buffer.from(header.transactionsRoot),
    extensionHash: Buffer.from(header.extensionHash),
    votes: Buffer.from(header.votes),
    powSolution: {
      ...header.powSolution,
      publicKey: Buffer.from(header.powSolution.publicKey),
      nonce: Buffer.from(header.powSolution.nonce),
    },
  };
}

function fixedHex(value: string, bytes: number, label: string): Buffer {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return Buffer.from(value, 'hex');
}

function unsignedDecimal(value: string, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be an unsigned canonical decimal`);
  }
  return BigInt(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
