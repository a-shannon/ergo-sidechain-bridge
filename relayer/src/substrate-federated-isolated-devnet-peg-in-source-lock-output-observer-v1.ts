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

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1' as const;

const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1';

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_source_spent_and_refundable_outputs_unspent';
  readonly expectedTxId: string;
  readonly sourceFundingBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly confirmationHeight: number;
  readonly confirmationHeaderIdHex: string;
  readonly confirmationObservationDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly primaryObservationDigestHex: string;
  readonly witnessObservationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly exactDualLoopbackNodesAgreed: true;
    readonly sourceFundingSpent: true;
    readonly sourceLockUnspentAndExact: true;
    readonly transitionFeeFundingUnspentAndExact: true;
    readonly sourceLockStillRefundable: true;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
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

export async function observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    confirmation:
      Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    input.candidate,
    input.batch,
    input.target,
  );
  const expectedTxId = packet.transactions.sourceLockCreation.txId;
  const confirmation =
    normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
      input.confirmation,
    );
  if (
    confirmation.status !== 'confirmed'
    || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null
  ) {
    throw new Error('isolated source-lock output observation requires confirmation');
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
    packet.boxes.sourceLock,
    packet.boxes.transitionFeeFunding,
    'primary',
  );
  const witnessState = await observeNodeState(
    witness,
    packet.boxes.sourceFundingInput.boxId,
    packet.boxes.sourceLock,
    packet.boxes.transitionFeeFunding,
    'witness',
  );
  if (canonicalJson(primaryState) !== canonicalJson(witnessState)) {
    throw new Error('isolated source-lock output observations disagree');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    current.processBindingDigestHex !== binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated source-lock output target changed during observation');
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_source_spent_and_refundable_outputs_unspent' as const,
    expectedTxId,
    sourceFundingBoxIdHex: packet.boxes.sourceFundingInput.boxId,
    sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
    transitionFeeFundingBoxIdHex: packet.boxes.transitionFeeFunding.boxId,
    confirmationHeight: confirmation.confirmationHeight,
    confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex,
    confirmationObservationDigestHex: confirmation.observationDigestHex,
    processBindingDigestHex: current.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      current.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: primaryState.digestHex,
    witnessObservationDigestHex: witnessState.digestHex,
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true as const,
      sourceFundingSpent: true as const,
      sourceLockUnspentAndExact: true as const,
      transitionFeeFundingUnspentAndExact: true as const,
      sourceLockStillRefundable: true as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
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

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
  observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>,
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
    throw new Error('isolated source-lock output observation lacks provenance');
  }
}

async function observeNodeState(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  sourceFundingBoxIdHex: string,
  expectedSourceLock: Eip12Box,
  expectedTransitionFeeFunding: Eip12Box,
  label: string,
): Promise<Readonly<{
  sourceFundingBoxIdHex: string;
  sourceFundingPresent: false;
  sourceLock: Eip12Box;
  transitionFeeFunding: Eip12Box;
  digestHex: string;
}>> {
  const sourceFunding = await client.getBoxByIdOrNull(sourceFundingBoxIdHex);
  const rawSourceLock = await client.getBoxByIdOrNull(expectedSourceLock.boxId);
  const rawTransitionFee = await client.getBoxByIdOrNull(
    expectedTransitionFeeFunding.boxId,
  );
  if (sourceFunding !== null) {
    throw new Error(`isolated source-lock ${label} still reports source funding`);
  }
  if (rawSourceLock === null || rawTransitionFee === null) {
    throw new Error(`isolated source-lock ${label} output is unavailable`);
  }
  const sourceLock = await normalizeEip12Box(
    rawSourceLock,
    `isolated source-lock ${label} source-lock output`,
  );
  const transitionFeeFunding = await normalizeEip12Box(
    rawTransitionFee,
    `isolated source-lock ${label} transition-fee output`,
  );
  if (
    canonicalJson(sourceLock) !== canonicalJson(expectedSourceLock)
    || canonicalJson(transitionFeeFunding)
      !== canonicalJson(expectedTransitionFeeFunding)
  ) {
    throw new Error(`isolated source-lock ${label} output bytes changed`);
  }
  const body = Object.freeze({
    sourceFundingBoxIdHex,
    sourceFundingPresent: false as const,
    sourceLock,
    transitionFeeFunding,
  });
  return Object.freeze({
    ...body,
    digestHex: sha256CanonicalJson(body, OBSERVATION_DIGEST_DOMAIN),
  });
}
