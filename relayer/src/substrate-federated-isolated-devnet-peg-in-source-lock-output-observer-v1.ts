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
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV2,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
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
    batch: object;
    candidate: object;
    packet: DepositPacket;
  }>
>();

type DepositPacket = ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV1>
  | ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV2>;

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
  const retained = Object.freeze({ ...input });
  const { candidate, batch, target } = retained;
  return observeOutputs(retained, () =>
    assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(candidate, batch, target));
}

export async function observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
    candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>> {
  const retained = Object.freeze({ ...input });
  const { candidate, batch, target } = retained;
  return observeOutputs(retained, () =>
    assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(candidate, batch, target));
}

async function observeOutputs(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
      | SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
    candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1
      | SubstrateFederatedIsolatedDevnetPegInCandidateV2>;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
  assertCandidate: () => DepositPacket,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertCandidate();
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
  const refreshConfirmation = async (
    prior: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>,
  ) => {
    const refreshed = await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
      artifact: prior.observerArtifact,
      expectedReconciliationIdentityDigestHex: binding.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex: input.batch.request.target.genesisHeaderIdHex,
      expectedTxId,
      priorConfirmation: prior,
    });
    if (refreshed.status !== 'confirmed' || refreshed.confirmationHeight === null
      || refreshed.confirmationHeaderIdHex === null) {
      throw new Error('isolated source-lock output observation requires refreshed canonical confirmation');
    }
    return Object.freeze({ ...refreshed,
      confirmationHeight: refreshed.confirmationHeight,
      confirmationHeaderIdHex: refreshed.confirmationHeaderIdHex,
    });
  };
  const initialConfirmation = await refreshConfirmation(confirmation);
  const primaryTipBefore = await readTip(primary);
  const witnessTipBefore = await readTip(witness);
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
  const latestConfirmation = await refreshConfirmation(initialConfirmation);
  if (latestConfirmation.confirmationHeight !== initialConfirmation.confirmationHeight
    || latestConfirmation.confirmationHeaderIdHex !== initialConfirmation.confirmationHeaderIdHex) {
    throw new Error('isolated source-lock canonical inclusion changed during observation');
  }
  const primaryTipAfter = await readTip(primary);
  const witnessTipAfter = await readTip(witness);
  if ([witnessTipBefore, primaryTipAfter, witnessTipAfter].some(
    tip => canonicalJson(tip) !== canonicalJson(primaryTipBefore),
  )) {
    throw new Error('isolated source-lock observation requires one stable dual-node tip');
  }
  if (initialConfirmation.observedAtHeight > primaryTipBefore.height
    || latestConfirmation.observedAtHeight !== primaryTipBefore.height
    || latestConfirmation.confirmationHeight > primaryTipBefore.height) {
    throw new Error('isolated source-lock confirmation snapshots differ from the stable output tip');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    current.processBindingDigestHex !== binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || assertCandidate() !== packet
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
    confirmationHeight: latestConfirmation.confirmationHeight,
    confirmationHeaderIdHex: latestConfirmation.confirmationHeaderIdHex,
    confirmationObservationDigestHex: latestConfirmation.observationDigestHex,
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
  OBSERVATIONS.set(observation, Object.freeze({
    target: input.target, binding, batch: input.batch, candidate: input.candidate, packet,
  }));
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2(
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>,
  candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV2> {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(observation, target);
  const material = OBSERVATIONS.get(observation);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(candidate, batch, target);
  if (material === undefined || material.batch !== batch
    || material.candidate !== candidate || material.packet !== packet) {
    throw new Error('isolated source-lock output observation does not bind the exact V2 candidate');
  }
  return packet;
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

async function readTip(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
): Promise<Readonly<{ height: number; idHex: string }>> {
  const header = await client.getBestHeader();
  if (header === null || typeof header !== 'object' || Array.isArray(header)
    || !('height' in header) || !('id' in header)
    || typeof header.height !== 'number' || !Number.isSafeInteger(header.height) || header.height <= 0
    || typeof header.id !== 'string' || !/^[0-9a-f]{64}$/u.test(header.id)) {
    throw new Error('isolated source-lock observation requires a canonical positive-height tip');
  }
  return Object.freeze({ height: header.height, idHex: header.id });
}
