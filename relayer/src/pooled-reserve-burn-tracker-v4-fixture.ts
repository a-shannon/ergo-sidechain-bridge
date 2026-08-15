import { readFileSync } from 'node:fs';

import {
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import {
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  buildPooledReserveBurnTrackerV4Context,
  type PooledReserveBurnTrackerContractV4Identity,
  type PooledReserveBurnTrackerV4Context,
} from './pooled-reserve-burn-tracker-v4.js';

interface PooledReserveBurnStatementGoldenVectorV4 {
  readonly input: {
    readonly runtimeProfile: PooledReserveMintReservationRuntimeProfileV4;
    readonly checkpoint: BridgeCheckpointV1;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly trackerNftIdHex: string;
    readonly targetNativeStateRootHex: string;
    readonly trustedAnchorDigestHex: string;
    readonly finalityHorizonHeight: string;
    readonly finalityHorizonHashHex: string;
    readonly chainDomainIdHex: string;
  };
  readonly expected: {
    readonly runtimeProfileScaleHex: string;
  };
}

export async function buildPooledReserveBurnTrackerV4AcceptanceFixture():
Promise<Readonly<PooledReserveBurnTrackerV4Context>> {
  const vector = JSON.parse(readFileSync(new URL(
    '../test-vectors/pooled-reserve-burn-statement-v4.json',
    import.meta.url,
  ), 'utf8')) as PooledReserveBurnStatementGoldenVectorV4;
  const contract = JSON.parse(readFileSync(new URL(
    '../test-vectors/pooled-reserve-burn-tracker-contract-v4.json',
    import.meta.url,
  ), 'utf8')) as PooledReserveBurnTrackerContractV4Identity;

  return buildPooledReserveBurnTrackerV4Context({
    contract,
    runtimeProfileScaleHex: vector.expected.runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex: vector.input.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: vector.input.sourceRuntimeCodeBytes,
    trackerNftIdHex: vector.input.trackerNftIdHex,
    checkpoint: vector.input.checkpoint,
    targetNativeStateRootHex: vector.input.targetNativeStateRootHex,
    trustedAnchorDigestHex: vector.input.trustedAnchorDigestHex,
    finalityHorizonHeight: vector.input.finalityHorizonHeight,
    finalityHorizonHashHex: vector.input.finalityHorizonHashHex,
    chainDomainIdHex: vector.input.chainDomainIdHex,
    currentErgoHeight: 1_000,
    anchorContextIndex: 2,
    proofChunksHex: ['01', '0203'],
  });
}
