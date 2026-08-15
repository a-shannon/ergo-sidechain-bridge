import { readFileSync } from 'node:fs';

import {
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import {
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  buildPooledReserveBurnTrackerV5Context,
  type PooledReserveBurnTrackerContractV5Identity,
  type PooledReserveBurnTrackerV5Context,
} from './pooled-reserve-burn-tracker-v5.js';

interface PooledReserveBurnStatementGoldenVectorV5 {
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

export async function buildPooledReserveBurnTrackerV5AcceptanceFixture():
Promise<Readonly<PooledReserveBurnTrackerV5Context>> {
  const vector = JSON.parse(readFileSync(new URL(
    '../test-vectors/pooled-reserve-burn-statement-v5.json',
    import.meta.url,
  ), 'utf8')) as PooledReserveBurnStatementGoldenVectorV5;
  const contract = JSON.parse(readFileSync(new URL(
    '../test-vectors/pooled-reserve-burn-tracker-contract-v5.json',
    import.meta.url,
  ), 'utf8')) as PooledReserveBurnTrackerContractV5Identity;

  return buildPooledReserveBurnTrackerV5Context({
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
