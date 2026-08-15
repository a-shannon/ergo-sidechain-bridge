import { describe, expect, it } from 'vitest';

import {
  encodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from './ergo-autolykos-v2-header.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
  evaluateErgoSpvBranchTargetDepth,
  selectHeavierErgoAutolykosV2Branch,
  verifyErgoAutolykosV2SpvBranch,
  VerifiedErgoAutolykosV2Branch,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
  type VerifiedErgoAutolykosV2Header,
} from './ergo-autolykos-v2-spv-branch.js';
import type { ErgoDifficultyHeader } from './ergo-eip37-difficulty.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const GENERATOR = hex(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);
const NETWORK_ID = hex('11'.repeat(32));
const DIFFICULTY = 4n;
const NBITS = encodeErgoCompactDifficulty(DIFFICULTY);
const INTERVAL = 120_000n;

describe('Ergo Autolykos V2 SPV branch', () => {
  it('verifies EIP-37, cumulative work, target depth, and immutable output', () => {
    const fixture = fixtureState();
    const suffix = mineSuffix(fixture.checkpoint.header, 3);
    const branch = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      suffix,
      suffix.at(-1)!.timestamp,
    );

    expect(branch.profileId).toEqual(
      computeErgoAutolykosV2SpvProfileId(fixture.profile),
    );
    expect(branch.cumulativeWork).toBe(
      fixture.profile.checkpointCumulativeWork + (3n * DIFFICULTY),
    );
    expect(evaluateErgoSpvBranchTargetDepth(
      branch,
      branch.headers[1]!.headerId,
    )).toEqual({
      included: true,
      targetHeight: 130,
      confirmations: 2,
      depthSatisfied: true,
    });

    suffix[0]!.parentId.fill(0xff);
    expect(branch.headers[0]!.header.parentId).toEqual(
      branch.checkpointHeaderId,
    );
  });

  it('selects only strictly heavier work and keeps the current branch on a tie', () => {
    const fixture = fixtureState();
    const current = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      mineSuffix(fixture.checkpoint.header, 2, 1),
      fixture.checkpoint.header.timestamp + (10n * INTERVAL),
    );
    const tie = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      mineSuffix(fixture.checkpoint.header, 2, 100),
      fixture.checkpoint.header.timestamp + (10n * INTERVAL),
    );
    const heavier = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      mineSuffix(fixture.checkpoint.header, 3, 200),
      fixture.checkpoint.header.timestamp + (10n * INTERVAL),
    );

    expect(selectHeavierErgoAutolykosV2Branch(current, tie)).toBe(current);
    expect(selectHeavierErgoAutolykosV2Branch(current, heavier)).toBe(heavier);
  });

  it('rejects an easier claimed difficulty, broken ancestry, and future time', () => {
    const fixture = fixtureState();
    const valid = mineSuffix(fixture.checkpoint.header, 1)[0]!;
    const easy = mineHeader({ ...valid, nBits: encodeErgoCompactDifficulty(1n) });
    expect(verifyClaimedAutolykosV2ProofOfWork(easy)).toBe(true);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      [easy],
      easy.timestamp,
    )).toThrow(/expected difficulty/);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      [{ ...valid, parentId: hex('00'.repeat(32)) }],
      valid.timestamp,
    )).toThrow(/expected parent/);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      [valid],
      fixture.checkpoint.header.timestamp - fixture.profile.maximumFutureDriftMs - 1n,
    )).toThrow(/future timestamp/);
  });

  it('rejects checkpoint, network, context, and profile drift', () => {
    const fixture = fixtureState();
    const suffix = mineSuffix(fixture.checkpoint.header, 1);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      { ...fixture.checkpoint, sourceNetworkId: hex('22'.repeat(32)) },
      suffix,
      suffix[0]!.timestamp,
    )).toThrow(/source network/);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      {
        ...fixture.checkpoint,
        header: { ...fixture.checkpoint.header, votes: hex('010000') },
      },
      suffix,
      suffix[0]!.timestamp,
    )).toThrow(/checkpoint header/);
    expect(() => verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      { ...fixture.checkpoint, difficultyContext: [] },
      suffix,
      suffix[0]!.timestamp,
    )).toThrow(/context digest/);

    const otherProfile = {
      ...fixture.profile,
      sourceNetworkId: hex('33'.repeat(32)),
    };
    const otherCheckpoint = {
      ...fixture.checkpoint,
      sourceNetworkId: otherProfile.sourceNetworkId,
    };
    const other = verifyErgoAutolykosV2SpvBranch(
      otherProfile,
      otherCheckpoint,
      suffix,
      suffix[0]!.timestamp,
    );
    const original = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      suffix,
      suffix[0]!.timestamp,
    );
    expect(() => selectHeavierErgoAutolykosV2Branch(original, other))
      .toThrow(/same profile/);

    expect(() => verifyErgoAutolykosV2SpvBranch(
      {
        ...fixture.profile,
        checkpointCumulativeWork: (1n << 256n) - 1n,
      },
      fixture.checkpoint,
      suffix,
      suffix[0]!.timestamp,
    )).toThrow(/cumulative work exceeds UInt256/);
    expect(() => computeErgoAutolykosV2SpvProfileId({
      ...fixture.profile,
      checkpointCumulativeWork: 1n << 256n,
    })).toThrow(/positive UInt256/);
  });

  it('does not treat absent or shallow target coverage as depth-satisfied', () => {
    const fixture = fixtureState();
    const branch = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      mineSuffix(fixture.checkpoint.header, 2),
      fixture.checkpoint.header.timestamp + (10n * INTERVAL),
    );
    expect(evaluateErgoSpvBranchTargetDepth(
      branch,
      hex('ff'.repeat(32)),
    )).toEqual({
      included: false,
      targetHeight: null,
      confirmations: 0,
      depthSatisfied: false,
    });
    expect(evaluateErgoSpvBranchTargetDepth(
      branch,
      branch.headers[1]!.headerId,
    ).depthSatisfied).toBe(false);
  });

  it('rejects forged branches and ignores mutations of returned copies', () => {
    const fixture = fixtureState();
    const branch = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      mineSuffix(fixture.checkpoint.header, 2),
      fixture.checkpoint.header.timestamp + (10n * INTERVAL),
    );
    const originalTarget = branch.headers[0]!.headerId;
    const exposedProfileId = branch.profileId;
    const exposedHeaders = branch.headers as VerifiedErgoAutolykosV2Header[];
    exposedProfileId.fill(0xff);
    exposedHeaders[0]!.headerId.fill(0xff);
    exposedHeaders.splice(0, exposedHeaders.length);

    expect(branch.profileId).not.toEqual(exposedProfileId);
    expect(branch.headers).toHaveLength(2);
    expect(evaluateErgoSpvBranchTargetDepth(branch, originalTarget))
      .toMatchObject({ included: true, confirmations: 2 });

    const forged = {
      profileId: branch.profileId,
      checkpointHeaderId: branch.checkpointHeaderId,
      cumulativeWork: branch.cumulativeWork + 1_000_000n,
      headers: [],
    } as unknown as VerifiedErgoAutolykosV2Branch;
    expect(() => selectHeavierErgoAutolykosV2Branch(branch, forged))
      .toThrow(/not produced by the verifier/);
    expect(() => evaluateErgoSpvBranchTargetDepth(forged, originalTarget))
      .toThrow(/not produced by the verifier/);
    expect(() => new VerifiedErgoAutolykosV2Branch(
      Symbol('forged') as never,
      {} as never,
    )).toThrow(/only be created by verification/);
  });
});

function fixtureState(): {
  profile: ErgoAutolykosV2SpvProfile;
  checkpoint: ErgoAutolykosV2SpvCheckpoint;
} {
  const context: ErgoDifficultyHeader[] = [{
    height: 0,
    timestamp: 0n,
    nBits: NBITS,
  }];
  const checkpointHeader = baseHeader({
    height: 128,
    timestamp: 128n * INTERVAL,
    parentId: hex('aa'.repeat(32)),
    nonce: 0n,
  });
  const checkpoint: ErgoAutolykosV2SpvCheckpoint = {
    sourceNetworkId: NETWORK_ID,
    header: checkpointHeader,
    difficultyContext: context,
  };
  const profile: ErgoAutolykosV2SpvProfile = {
    sourceNetworkId: NETWORK_ID,
    checkpointHeaderId: computeErgoHeaderId(checkpointHeader),
    checkpointDifficultyContextDigest: computeErgoDifficultyContextDigest(context),
    checkpointCumulativeWork: 10_000n,
    expectedHeaderVersion: 4,
    difficulty: {
      activationHeight: 1,
      epochLength: 128,
      useLastEpochs: 2,
      desiredBlockIntervalMs: INTERVAL,
      initialDifficulty: 1n,
    },
    requiredConfirmations: 2,
    maximumHeaders: 16,
    maximumFutureDriftMs: 10n * INTERVAL,
  };
  return { profile, checkpoint };
}

function mineSuffix(
  checkpoint: ErgoHeaderIdentityFields,
  length: number,
  salt = 0,
): ErgoHeaderIdentityFields[] {
  const headers: ErgoHeaderIdentityFields[] = [];
  let parent = checkpoint;
  for (let index = 0; index < length; index += 1) {
    const candidate = baseHeader({
      height: parent.height + 1,
      timestamp: parent.timestamp + INTERVAL,
      parentId: computeErgoHeaderId(parent),
      nonce: BigInt(salt + index),
      salt: salt + index + 1,
    });
    const mined = mineHeader(candidate);
    headers.push(mined);
    parent = mined;
  }
  return headers;
}

function mineHeader(
  candidate: ErgoHeaderIdentityFields,
): ErgoHeaderIdentityFields {
  for (let nonce = 0n; nonce < 10_000n; nonce += 1n) {
    const nonceBytes = Buffer.alloc(8);
    nonceBytes.writeBigUInt64BE(nonce);
    const header = {
      ...candidate,
      powSolution: { ...candidate.powSolution, nonce: nonceBytes },
    };
    if (verifyClaimedAutolykosV2ProofOfWork(header)) return header;
  }
  throw new Error('test miner did not find a bounded Autolykos nonce');
}

function baseHeader(input: {
  height: number;
  timestamp: bigint;
  parentId: Uint8Array;
  nonce: bigint;
  salt?: number;
}): ErgoHeaderIdentityFields {
  const salt = input.salt ?? 0;
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64BE(input.nonce);
  return {
    version: 4,
    parentId: Buffer.from(input.parentId),
    adProofsRoot: filled(32, salt + 1),
    stateRoot: filled(33, salt + 2),
    transactionsRoot: filled(32, salt + 3),
    timestamp: input.timestamp,
    nBits: NBITS,
    height: input.height,
    extensionHash: filled(32, salt + 4),
    votes: hex('000000'),
    powSolution: { publicKey: GENERATOR, nonce },
  };
}

function filled(length: number, value: number): Buffer {
  return Buffer.alloc(length, value & 0xff);
}

function hex(value: string): Buffer {
  return Buffer.from(value, 'hex');
}
