import type {
  AggregateSettlementRecoveryObservationPort,
  AggregateSettlementRecoveryPolicyV1,
} from '../relayer-core/aggregate-settlement-recovery.js';
import {
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance,
  assertStableAggregateSettlementErgoObservationProvenance,
  createMatchingAggregateSettlementErgoObservationSources,
  observeMatchingAggregateSettlementErgoTransaction,
  observeStableAggregateSettlementErgoTransaction,
  type AggregateSettlementErgoObservationClient,
  type AggregateSettlementErgoObservationSourcePair,
  type MatchingAggregateSettlementErgoObservationConsensus,
  type StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';

type RecoveryErgoObservationPort = AggregateSettlementRecoveryObservationPort<
  StableAggregateSettlementErgoObservation,
  MatchingAggregateSettlementErgoObservationConsensus
>;
type RecoveryErgoObservationInput =
  Parameters<RecoveryErgoObservationPort['observe']>[0];

export type AggregateSettlementErgoWitness =
  AggregateSettlementErgoObservationSourcePair;

export function createAggregateSettlementErgoWitness(input: {
  primaryErgo: AggregateSettlementErgoObservationClient;
  primaryNodeUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessErgo: AggregateSettlementErgoObservationClient;
  witnessNodeUrl: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
}): AggregateSettlementErgoWitness {
  if (input.primaryErgo === input.witnessErgo) {
    throw new Error('aggregate settlement primary and witness require distinct Ergo client instances');
  }
  return createMatchingAggregateSettlementErgoObservationSources(input);
}

export async function observeAggregateSettlementRecoveryAttempt(input: {
  ergo: AggregateSettlementErgoObservationClient;
  witness?: AggregateSettlementErgoWitness;
  transactionId: string;
  policy: AggregateSettlementRecoveryPolicyV1;
}): Promise<{
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus | null;
}> {
  if (!input.witness) {
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: input.ergo,
      transactionId: input.transactionId,
      policy: input.policy,
    });
    assertStableAggregateSettlementErgoObservationProvenance(observation);
    return { observation, consensus: null };
  }
  if (input.witness.primarySource.ergo !== input.ergo) {
    throw new Error('aggregate settlement recovery witness is not bound to the active primary Ergo client');
  }
  const observed = await observeMatchingAggregateSettlementErgoTransaction({
    primary: input.witness.primarySource,
    witness: input.witness.witnessSource,
    transactionId: input.transactionId,
    policy: input.policy,
  });
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance(observed.consensus);
  return {
    observation: observed.primaryObservation,
    consensus: observed.consensus,
  };
}

export function createAggregateSettlementRecoveryErgoAdapter(input: {
  ergo: AggregateSettlementErgoObservationClient;
  witness?: AggregateSettlementErgoWitness;
}): RecoveryErgoObservationPort {
  return Object.freeze({
    observe: ({ transactionId, policy }: RecoveryErgoObservationInput) =>
      observeAggregateSettlementRecoveryAttempt({
        ergo: input.ergo,
        witness: input.witness,
        transactionId,
        policy,
      }),
  });
}
