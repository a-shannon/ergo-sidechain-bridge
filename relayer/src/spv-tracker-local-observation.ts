import {
  getSpvTrackerDigest,
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import type { SpvTrackerObservationInput } from './spv-tracker-observation.js';

export const localGate5SpvTrackerEntry: SpvTrackerEntry = {
  sidechainIdHex: '11'.repeat(32),
  sidechainHeight: 12345,
  sidechainHeaderHashHex: '22'.repeat(32),
  bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
  ergoAnchorHeight: 987654,
};

export interface BuildLocalGate5SpvTrackerObservationInput {
  observedAt: string;
  bridgeEventRootHex?: string;
}

export function buildLocalGate5SpvTrackerObservation(
  input: BuildLocalGate5SpvTrackerObservationInput,
): SpvTrackerObservationInput {
  const expectedEntry = {
    ...localGate5SpvTrackerEntry,
    bridgeEventRootHex: input.bridgeEventRootHex ?? localGate5SpvTrackerEntry.bridgeEventRootHex,
  };
  const history = [toSpvTrackerHistoryEntry(expectedEntry)];
  return {
    sourceLabel: 'local public Gate 5 SPV tracker observation input',
    network: 'local offline',
    observedAt: input.observedAt,
    trackerDigestHex: getSpvTrackerDigest(history),
    trackerBox: {
      boxId: '44'.repeat(32),
      nftId: '55'.repeat(32),
    },
    expectedEntry,
    sidechainFinality: {
      finalityRule: 'local offline rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations',
      sidechainBlockHeight: Number(expectedEntry.sidechainHeight),
      observedSidechainHeight: Number(expectedEntry.sidechainHeight) + 12,
      requiredConfirmations: 12,
    },
    history,
  };
}
