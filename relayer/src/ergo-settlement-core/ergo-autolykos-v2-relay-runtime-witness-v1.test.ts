import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  buildErgoAutolykosV2RelayWitnessV1,
} from './ergo-autolykos-v2-relay-witness-v1.js';
import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex,
  encodeErgoAutolykosV2RelayRuntimeWitnessV1,
  ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
} from './ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
} from './ergo-autolykos-v2-spv-branch.js';
import type { ErgoDifficultyHeader } from './ergo-eip37-difficulty.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

const VECTOR_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test-vectors/ergo-autolykos-v2-spv-jvm-differential-v1.json',
);
const RUNTIME_VECTOR_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test-vectors/ergo-autolykos-v2-relay-runtime-witness-v1.hex',
);

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

interface DifferentialVector {
  source: { networkIdHex: string };
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
  suffix: Array<{ header: HeaderRecord }>;
}

const vector = JSON.parse(
  readFileSync(VECTOR_PATH, 'utf8'),
) as DifferentialVector;
const EXPECTED_SPV_PROFILE_ID_HEX =
  computeErgoAutolykosV2SpvProfileId(spvProfile()).toString('hex');

describe('Ergo Autolykos V2 binary relay runtime witness V1', () => {
  it('freezes one canonical non-authorizing cross-language byte envelope', () => {
    const witness = runtimeWitness();
    const encoded = encodeErgoAutolykosV2RelayRuntimeWitnessV1(witness);
    const decoded = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      encoded,
      EXPECTED_SPV_PROFILE_ID_HEX,
    );

    expect(decoded).toEqual(witness);
    expect(encoded.toString('hex')).toBe(
      readFileSync(RUNTIME_VECTOR_PATH, 'utf8').trim(),
    );
    expect(encodeErgoAutolykosV2RelayRuntimeWitnessV1(decoded)).toEqual(encoded);
    expect({
      length: encoded.length,
      sha256Hex: sha256(encoded),
      familyIdHex:
        ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
      spvProfileIdHex: encoded.subarray(72, 104).toString('hex'),
      witnessIdHex:
        deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
          encoded,
          EXPECTED_SPV_PROFILE_ID_HEX,
        ),
    }).toEqual({
      length: 3_135,
      sha256Hex:
        'bc8587464125825f6c6f95c375141c6c68db8f7fed993717167cbf4b4d339ffc',
      familyIdHex:
        'a874c8b8b84d3bb619839d2105daea6e24b97f7fb2df352954f1935d7e7cc1ab',
      spvProfileIdHex:
        '222a776449ba3424f62222f99646aa900fd8f02d988c957f411e7e1ce8df5c3e',
      witnessIdHex:
        'a0667c06a13c0a29dc11a59b1cc2f0ce7dc302bfec342036adf885f8a3d0488a',
    });
  });

  it('rejects envelope, directory, role, count, and proof mutations', () => {
    const encoded = encodeErgoAutolykosV2RelayRuntimeWitnessV1(runtimeWitness());
    const checkpointLength = encoded.readUInt32BE(56);
    const branchesOffset = 72 + 225 + checkpointLength;
    const branchesLength = encoded.readUInt32BE(62);
    const firstHeaderLength = encoded.readUInt16BE(branchesOffset + 12);
    const firstHeaderOffset = branchesOffset + 14;
    const targetHeaderLength = encoded.readUInt16BE(
      branchesOffset + branchesLength,
    );
    const targetHeaderOffset = branchesOffset + branchesLength + 2;

    const mutants: Buffer[] = [];
    mutants.push(flipped(encoded, 0));
    mutants.push(flipped(encoded, 8));
    mutants.push(flipped(encoded, 9));
    mutants.push(flipped(encoded, 10));
    mutants.push(flipped(encoded, 12));
    mutants.push(flipped(encoded, 16));
    mutants.push(flipped(encoded, 48));
    mutants.push(flipped(encoded, 49));
    mutants.push(flipped(encoded, 50));
    mutants.push(flipped(encoded, 72));
    mutants.push(replaced(encoded, branchesOffset, 0));
    mutants.push(replaced(encoded, branchesOffset + 1, 2));
    mutants.push(flipped(
      encoded,
      firstHeaderOffset + firstHeaderLength - 1,
    ));
    mutants.push(flipped(
      encoded,
      targetHeaderOffset + targetHeaderLength - 1,
    ));
    mutants.push(Buffer.from(encoded.subarray(0, -1)));
    mutants.push(Buffer.concat([encoded, Buffer.from([0])]));

    for (const mutant of mutants) {
      expect(() => decodeErgoAutolykosV2RelayRuntimeWitnessV1(
        mutant,
        EXPECTED_SPV_PROFILE_ID_HEX,
      ))
        .toThrow();
    }
  });

  it('does not alias caller-owned envelope bytes', () => {
    const encoded = encodeErgoAutolykosV2RelayRuntimeWitnessV1(runtimeWitness());
    const before = Buffer.from(encoded);
    const decoded = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      encoded,
      EXPECTED_SPV_PROFILE_ID_HEX,
    );
    encoded.fill(0);
    expect(encodeErgoAutolykosV2RelayRuntimeWitnessV1(decoded)).toEqual(before);
  });

  it('rejects a claimed current branch when a supplied branch has more work', () => {
    const suffix = vector.suffix.map(({ header }) => canonicalHeader(header));
    const profile = { ...spvProfile(), requiredConfirmations: 1 };
    const witness = buildErgoAutolykosV2RelayWitnessV1({
      profile,
      checkpoint: spvCheckpoint(),
      currentBranch: {
        suffix: suffix.slice(0, -1),
        observedAtTimestamp: suffix.at(-2)!.timestamp,
      },
      competingBranches: [{
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      }],
      targetHeader: suffix[0]!,
    });
    expect(() => encodeErgoAutolykosV2RelayRuntimeWitnessV1(witness))
      .toThrow(/not greatest-work/);
  });

  it('binds the exact SPV profile and rejects ambiguous branch sets', () => {
    const suffix = vector.suffix.map(({ header }) => canonicalHeader(header));
    const lowDepthProfile = { ...spvProfile(), requiredConfirmations: 1 };
    const lowDepthWitness = buildErgoAutolykosV2RelayWitnessV1({
      profile: lowDepthProfile,
      checkpoint: spvCheckpoint(),
      currentBranch: {
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      },
      competingBranches: [],
      targetHeader: suffix[0]!,
    });
    const lowDepthBytes = encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      lowDepthWitness,
    );
    expect(lowDepthBytes.subarray(16, 48).toString('hex'))
      .toBe(ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX);
    expect(lowDepthBytes.subarray(72, 104).toString('hex'))
      .not.toBe(EXPECTED_SPV_PROFILE_ID_HEX);
    expect(() => decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      lowDepthBytes,
      EXPECTED_SPV_PROFILE_ID_HEX,
    )).toThrow(/not statically registered/);

    const duplicateTipWitness = buildErgoAutolykosV2RelayWitnessV1({
      profile: spvProfile(),
      checkpoint: spvCheckpoint(),
      currentBranch: {
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      },
      competingBranches: [{
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      }],
      targetHeader: suffix[0]!,
    });
    expect(() => encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      duplicateTipWitness,
    )).toThrow(/duplicate branch tip/);

    const unorderedCompetingBranches = [
      {
        suffix: suffix.slice(0, -2),
        observedAtTimestamp: suffix.at(-3)!.timestamp,
      },
      {
        suffix: suffix.slice(0, -1),
        observedAtTimestamp: suffix.at(-2)!.timestamp,
      },
    ].sort((left, right) => Buffer.compare(
      computeErgoHeaderId(right.suffix.at(-1)!),
      computeErgoHeaderId(left.suffix.at(-1)!),
    ));
    const unorderedBranchesWitness = buildErgoAutolykosV2RelayWitnessV1({
      profile: spvProfile(),
      checkpoint: spvCheckpoint(),
      currentBranch: {
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      },
      competingBranches: unorderedCompetingBranches,
      targetHeader: suffix[0]!,
    });
    expect(() => encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      unorderedBranchesWitness,
    )).toThrow(/not ordered by tip ID/);
  });

  it('rejects an absent or shallow target in the selected current branch', () => {
    const suffix = vector.suffix.map(({ header }) => canonicalHeader(header));
    const input = {
      profile: spvProfile(),
      checkpoint: spvCheckpoint(),
      currentBranch: {
        suffix,
        observedAtTimestamp: suffix.at(-1)!.timestamp,
      },
      competingBranches: [],
    };
    expect(() => encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      buildErgoAutolykosV2RelayWitnessV1({
        ...input,
        targetHeader: suffix[1]!,
      }),
    )).toThrow(/below required depth/);
    expect(() => encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      buildErgoAutolykosV2RelayWitnessV1({
        ...input,
        targetHeader: canonicalHeader(vector.checkpoint),
      }),
    )).toThrow(/absent or below required depth/);
  });
});

function runtimeWitness() {
  const suffix = vector.suffix.map(({ header }) => canonicalHeader(header));
  return buildErgoAutolykosV2RelayWitnessV1({
    profile: spvProfile(),
    checkpoint: spvCheckpoint(),
    currentBranch: {
      suffix,
      observedAtTimestamp: suffix.at(-1)!.timestamp,
    },
    competingBranches: [],
    targetHeader: suffix[0]!,
  });
}

function spvProfile(): ErgoAutolykosV2SpvProfile {
  const difficultyContext = vector.difficultyContext.map(difficultyHeader);
  return {
    sourceNetworkId: fixedHex(vector.source.networkIdHex, 32),
    checkpointHeaderId: fixedHex(vector.checkpoint.idHex, 32),
    checkpointDifficultyContextDigest:
      computeErgoDifficultyContextDigest(difficultyContext),
    checkpointCumulativeWork: BigInt(vector.profile.relativeCheckpointWork),
    expectedHeaderVersion: vector.profile.expectedHeaderVersion,
    difficulty: {
      activationHeight: vector.profile.activationHeight,
      epochLength: vector.profile.epochLength,
      useLastEpochs: vector.profile.useLastEpochs,
      desiredBlockIntervalMs: BigInt(vector.profile.desiredBlockIntervalMs),
      initialDifficulty: BigInt(vector.profile.initialDifficulty),
    },
    requiredConfirmations: vector.profile.requiredConfirmations,
    maximumHeaders: vector.profile.maximumHeaders,
    maximumFutureDriftMs: BigInt(vector.profile.maximumFutureDriftMs),
  };
}

function spvCheckpoint(): ErgoAutolykosV2SpvCheckpoint {
  return {
    sourceNetworkId: fixedHex(vector.source.networkIdHex, 32),
    header: canonicalHeader(vector.checkpoint),
    difficultyContext: vector.difficultyContext.map(difficultyHeader),
  };
}

function canonicalHeader(record: HeaderRecord): ErgoHeaderIdentityFields {
  return {
    version: record.version,
    parentId: fixedHex(record.parentIdHex, 32),
    adProofsRoot: fixedHex(record.adProofsRootHex, 32),
    stateRoot: fixedHex(record.stateRootHex, 33),
    transactionsRoot: fixedHex(record.transactionsRootHex, 32),
    timestamp: BigInt(record.timestampMs),
    nBits: record.nBits,
    height: record.height,
    extensionHash: fixedHex(record.extensionHashHex, 32),
    votes: fixedHex(record.votesHex, 3),
    powSolution: {
      publicKey: fixedHex(record.powPublicKeyHex, 33),
      nonce: fixedHex(record.powNonceHex, 8),
    },
  };
}

function difficultyHeader(record: HeaderRecord): ErgoDifficultyHeader {
  return {
    height: record.height,
    timestamp: BigInt(record.timestampMs),
    nBits: record.nBits,
  };
}

function fixedHex(value: string, bytes: number): Buffer {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`fixture value must be exactly ${bytes} lowercase hex bytes`);
  }
  return Buffer.from(value, 'hex');
}

function flipped(value: Buffer, offset: number): Buffer {
  const mutant = Buffer.from(value);
  mutant[offset] ^= 1;
  return mutant;
}

function replaced(value: Buffer, offset: number, replacement: number): Buffer {
  const mutant = Buffer.from(value);
  mutant[offset] = replacement;
  return mutant;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
