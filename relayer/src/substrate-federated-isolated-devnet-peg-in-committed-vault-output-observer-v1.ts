import { AuthenticatedSpvTrackerReadOnlyNodeClient } from './authenticated-spv-tracker-read-only-node-client.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1' as const;

const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1';

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_transition_inputs_spent_and_reserve_successor_unspent';
  readonly expectedTxId: string;
  readonly sourceFundingBoxIdHex: string;
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly reserveSuccessorBoxIdHex: string;
  readonly confirmationHeight: number;
  readonly confirmationHeaderIdHex: string;
  readonly confirmationObservationDigestHex: string;
  readonly observedTipHeight: number;
  readonly observedTipHeaderIdHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly primaryObservationDigestHex: string;
  readonly witnessObservationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly exactDualLoopbackNodesAgreed: true;
    readonly originalSourceFundingRemainsSpent: true;
    readonly exactReservePredecessorSpent: true;
    readonly exactSourceLockSpent: true;
    readonly exactTransitionFeeFundingSpent: true;
    readonly exactReserveSuccessorUnspent: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly depositCommitmentStateEstablished: true;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  }>;
  readonly observationDigestHex: string;
}

const OBSERVATIONS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

export async function observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    confirmation:
      Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    input.candidate,
    input.batch,
    input.target,
  );
  const expectedTxId = packet.transactions.reserveTransition.txId;
  const confirmation =
    normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
      input.confirmation,
    );
  if (
    confirmation.status !== 'confirmed'
    || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      'isolated committed-vault output observation requires confirmation',
    );
  }
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    confirmation.observerArtifact,
    binding.executionTargetIdentityDigestHex,
    input.batch.request.target.genesisHeaderIdHex,
    expectedTxId,
    confirmation,
  );
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    input.target.primaryNodeOrigin,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    input.target.witnessNodeOrigin,
  );
  const primaryState = await observeNodeState(
    primary,
    packet.boxes.sourceFundingInput.boxId,
    packet.boxes.reservePredecessor.boxId,
    packet.boxes.sourceLock.boxId,
    packet.boxes.transitionFeeFunding.boxId,
    packet.boxes.reserveSuccessor,
    'primary',
  );
  const witnessState = await observeNodeState(
    witness,
    packet.boxes.sourceFundingInput.boxId,
    packet.boxes.reservePredecessor.boxId,
    packet.boxes.sourceLock.boxId,
    packet.boxes.transitionFeeFunding.boxId,
    packet.boxes.reserveSuccessor,
    'witness',
  );
  if (canonicalJson(primaryState) !== canonicalJson(witnessState)) {
    throw new Error('isolated committed-vault output observations disagree');
  }
  const latestConfirmation =
    await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
      artifact: confirmation.observerArtifact,
      expectedReconciliationIdentityDigestHex:
        binding.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex:
        input.batch.request.target.genesisHeaderIdHex,
      expectedTxId,
      priorConfirmation: confirmation,
    });
  if (
    latestConfirmation.status !== 'confirmed'
    || latestConfirmation.confirmationHeight === null
    || latestConfirmation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      'isolated committed-vault output observation requires refreshed canonical confirmation',
    );
  }
  const [rawPrimaryTipAfterConfirmation, rawWitnessTipAfterConfirmation] =
    await Promise.all([
      primary.getBestHeader(),
      witness.getBestHeader(),
    ]);
  const primaryTipAfterConfirmation = normalizeBestHeader(
    rawPrimaryTipAfterConfirmation,
    'isolated committed-vault primary post-confirmation tip',
  );
  const witnessTipAfterConfirmation = normalizeBestHeader(
    rawWitnessTipAfterConfirmation,
    'isolated committed-vault witness post-confirmation tip',
  );
  if (
    canonicalJson(primaryTipAfterConfirmation)
      !== canonicalJson(primaryState.tip)
    || canonicalJson(witnessTipAfterConfirmation)
      !== canonicalJson(witnessState.tip)
  ) {
    throw new Error(
      'isolated committed-vault tip changed while refreshing canonical confirmation',
    );
  }
  if (
    latestConfirmation.observedAtHeight !== primaryState.tip.height
  ) {
    throw new Error(
      'isolated committed-vault confirmation snapshot does not match stable output tip',
    );
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    current.processBindingDigestHex !== binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault output target changed during observation',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    status:
      'exact_transition_inputs_spent_and_reserve_successor_unspent' as const,
    expectedTxId,
    sourceFundingBoxIdHex: packet.boxes.sourceFundingInput.boxId,
    reservePredecessorBoxIdHex: packet.boxes.reservePredecessor.boxId,
    sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
    transitionFeeFundingBoxIdHex: packet.boxes.transitionFeeFunding.boxId,
    reserveSuccessorBoxIdHex: packet.boxes.reserveSuccessor.boxId,
    confirmationHeight: latestConfirmation.confirmationHeight,
    confirmationHeaderIdHex: latestConfirmation.confirmationHeaderIdHex,
    confirmationObservationDigestHex:
      latestConfirmation.observationDigestHex,
    observedTipHeight: primaryState.tip.height,
    observedTipHeaderIdHex: primaryState.tip.idHex,
    processBindingDigestHex: current.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      current.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: primaryState.digestHex,
    witnessObservationDigestHex: witnessState.digestHex,
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true as const,
      originalSourceFundingRemainsSpent: true as const,
      exactReservePredecessorSpent: true as const,
      exactSourceLockSpent: true as const,
      exactTransitionFeeFundingSpent: true as const,
      exactReserveSuccessorUnspent: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      depositCommitmentStateEstablished: true as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    }),
  });
  const observation = Object.freeze({
    ...body,
    observationDigestHex: sha256CanonicalJson(
      body,
      OBSERVATION_DIGEST_DOMAIN,
    ),
  });
  OBSERVATIONS.set(observation, Object.freeze({ target: input.target, binding }));
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
  observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  const material = OBSERVATIONS.get(observation);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  const { observationDigestHex, ...body } = observation;
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || observationDigestHex
      !== sha256CanonicalJson(body, OBSERVATION_DIGEST_DOMAIN)
  ) {
    throw new Error(
      'isolated committed-vault output observation lacks provenance',
    );
  }
}

async function observeNodeState(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  sourceFundingBoxIdHex: string,
  reservePredecessorBoxIdHex: string,
  sourceLockBoxIdHex: string,
  transitionFeeFundingBoxIdHex: string,
  expectedReserveSuccessor: Eip12Box,
  label: string,
): Promise<Readonly<{
  sourceFundingBoxIdHex: string;
  sourceFundingPresent: false;
  reservePredecessorBoxIdHex: string;
  reservePredecessorPresent: false;
  sourceLockBoxIdHex: string;
  sourceLockPresent: false;
  transitionFeeFundingBoxIdHex: string;
  transitionFeeFundingPresent: false;
  tip: Readonly<{ height: number; idHex: string }>;
  reserveSuccessor: Eip12Box;
  digestHex: string;
}>> {
  const tipBefore = normalizeBestHeader(
    await client.getBestHeader(),
    `isolated committed-vault ${label} pre-output tip`,
  );
  const [
    sourceFunding,
    reservePredecessor,
    sourceLock,
    transitionFeeFunding,
    rawReserveSuccessor,
  ] = await Promise.all([
    client.getBoxByIdOrNull(sourceFundingBoxIdHex),
    client.getBoxByIdOrNull(reservePredecessorBoxIdHex),
    client.getBoxByIdOrNull(sourceLockBoxIdHex),
    client.getBoxByIdOrNull(transitionFeeFundingBoxIdHex),
    client.getBoxByIdOrNull(expectedReserveSuccessor.boxId),
  ]);
  const tipAfter = normalizeBestHeader(
    await client.getBestHeader(),
    `isolated committed-vault ${label} post-output tip`,
  );
  if (canonicalJson(tipBefore) !== canonicalJson(tipAfter)) {
    throw new Error(
      `isolated committed-vault ${label} tip changed during output observation`,
    );
  }
  if (
    sourceFunding !== null
    || reservePredecessor !== null
    || sourceLock !== null
    || transitionFeeFunding !== null
  ) {
    throw new Error(
      `isolated committed-vault ${label} still reports a transition input`,
    );
  }
  if (rawReserveSuccessor === null) {
    throw new Error(
      `isolated committed-vault ${label} reserve successor is unavailable`,
    );
  }
  const reserveSuccessor = await normalizeEip12Box(
    rawReserveSuccessor,
    `isolated committed-vault ${label} reserve successor`,
  );
  if (
    canonicalJson(reserveSuccessor)
      !== canonicalJson(expectedReserveSuccessor)
  ) {
    throw new Error(
      `isolated committed-vault ${label} reserve successor bytes changed`,
    );
  }
  const body = Object.freeze({
    sourceFundingBoxIdHex,
    sourceFundingPresent: false as const,
    reservePredecessorBoxIdHex,
    reservePredecessorPresent: false as const,
    sourceLockBoxIdHex,
    sourceLockPresent: false as const,
    transitionFeeFundingBoxIdHex,
    transitionFeeFundingPresent: false as const,
    tip: tipAfter,
    reserveSuccessor,
  });
  return Object.freeze({
    ...body,
    digestHex: sha256CanonicalJson(body, OBSERVATION_DIGEST_DOMAIN),
  });
}

function normalizeBestHeader(
  value: unknown,
  label: string,
): Readonly<{ height: number; idHex: string }> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.height !== 'number'
    || !Number.isSafeInteger(record.height)
    || record.height < 0
  ) {
    throw new Error(`${label} height must be a nonnegative safe integer`);
  }
  if (
    typeof record.id !== 'string'
    || !/^[0-9a-fA-F]{64}$/u.test(record.id)
  ) {
    throw new Error(`${label} id must be 32-byte hex`);
  }
  return Object.freeze({
    height: record.height,
    idHex: record.id.toLowerCase(),
  });
}
