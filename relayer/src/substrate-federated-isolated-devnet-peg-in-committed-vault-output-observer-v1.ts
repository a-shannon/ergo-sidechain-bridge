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
  assertSubstrateFederatedNativeGenesisPegInPacketV1,
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV2,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  SubstrateFederatedNativeGenesisSetupExecutionBatchV1,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import type { SubstrateFederatedPooledReserveDepositV2Packet }
  from './substrate-federated-pooled-reserve-deposit-v2.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1' as const;

const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1';
const NODE_STATE_OBSERVATION_MAX_ATTEMPTS = 3;
const FINALITY_TARGET_MAX_TIP_LAG = 64;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1 =
  10 as const;

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
  readonly finalityTargetHeight: number;
  readonly finalityTargetHeaderIdHex: string;
  readonly requiredSuccessorDepth:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1;
  readonly finalityPathHeaderIdsHex: readonly string[];
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
    readonly exactRequiredDepthAncestryObserved: true;
    readonly exactFinalityTargetSelected: true;
    readonly ergoPowAuthenticated: false;
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
    batch: object;
    candidate?: object;
    packet: DepositPacket;
    assertNativePacket?: () => DepositPacket;
  }>
>();

type DepositPacket = ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV1>
  | ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV2>;

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
  const retained = Object.freeze({ ...input });
  const { candidate, batch, target } = retained;
  return observeOutputs(retained, () =>
    assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(candidate, batch, target));
}

export async function observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
    candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>> {
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
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertCandidate();
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
  const initialConfirmation =
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
    initialConfirmation.status !== 'confirmed'
    || initialConfirmation.confirmationHeight === null
    || initialConfirmation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      'isolated committed-vault output observation requires refreshed canonical confirmation',
    );
  }
  const [primaryState, witnessState] = await Promise.all([
    observeNodeState(
      primary,
      packet.boxes.sourceFundingInput.boxId,
      packet.boxes.reservePredecessor.boxId,
      packet.boxes.sourceLock.boxId,
      packet.boxes.transitionFeeFunding.boxId,
      packet.boxes.reserveSuccessor,
      initialConfirmation.confirmationHeight,
      initialConfirmation.confirmationHeaderIdHex,
      'primary',
    ),
    observeNodeState(
      witness,
      packet.boxes.sourceFundingInput.boxId,
      packet.boxes.reservePredecessor.boxId,
      packet.boxes.sourceLock.boxId,
      packet.boxes.transitionFeeFunding.boxId,
      packet.boxes.reserveSuccessor,
      initialConfirmation.confirmationHeight,
      initialConfirmation.confirmationHeaderIdHex,
      'witness',
    ),
  ]);
  if (canonicalJson(primaryState) !== canonicalJson(witnessState)) {
    throw new Error('isolated committed-vault output observations disagree');
  }
  if (
    initialConfirmation.observedAtHeight > primaryState.tip.height
  ) {
    throw new Error(
      'isolated committed-vault initial confirmation snapshot is ahead of the stable output tip',
    );
  }
  const latestConfirmation =
    await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
      artifact: initialConfirmation.observerArtifact,
      expectedReconciliationIdentityDigestHex:
        binding.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex:
        input.batch.request.target.genesisHeaderIdHex,
      expectedTxId,
      priorConfirmation: initialConfirmation,
    });
  if (
    latestConfirmation.status !== 'confirmed'
    || latestConfirmation.confirmationHeight === null
    || latestConfirmation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      'isolated committed-vault output observation requires final canonical confirmation',
    );
  }
  if (
    latestConfirmation.confirmationHeight
      !== initialConfirmation.confirmationHeight
    || latestConfirmation.confirmationHeaderIdHex
      !== initialConfirmation.confirmationHeaderIdHex
  ) {
    throw new Error(
      'isolated committed-vault canonical inclusion changed during observation',
    );
  }
  if (latestConfirmation.observedAtHeight < primaryState.tip.height) {
    throw new Error(
      'isolated committed-vault final confirmation snapshot is behind the stable output tip',
    );
  }
  const [latestPrimaryFinality, latestWitnessFinality] = await Promise.all([
    observeStableFinality(
      primary,
      latestConfirmation.confirmationHeight,
      latestConfirmation.confirmationHeaderIdHex,
      'primary',
    ),
    observeStableFinality(
      witness,
      latestConfirmation.confirmationHeight,
      latestConfirmation.confirmationHeaderIdHex,
      'witness',
    ),
  ]);
  if (
    canonicalJson(latestPrimaryFinality)
      !== canonicalJson(latestWitnessFinality)
  ) {
    throw new Error(
      'isolated committed-vault finality reobservations disagree',
    );
  }
  if (
    canonicalJson(latestPrimaryFinality.finality)
      !== canonicalJson(primaryState.finality)
    || canonicalJson(latestWitnessFinality.finality)
      !== canonicalJson(witnessState.finality)
  ) {
    throw new Error(
      'isolated committed-vault finality target changed during observation',
    );
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    current.processBindingDigestHex !== binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || assertCandidate() !== packet
  ) {
    throw new Error(
      'isolated committed-vault output target changed during observation',
    );
  }
  return retainObservation(input, packet, binding, current, primaryState, witnessState, {
    ...latestConfirmation,
    confirmationHeight: latestConfirmation.confirmationHeight,
    confirmationHeaderIdHex: latestConfirmation.confirmationHeaderIdHex,
  });
}

function retainObservation(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: object;
    candidate?: object;
  }>,
  packet: DepositPacket,
  binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  current: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  primaryState: Awaited<ReturnType<typeof observeNodeState>>,
  witnessState: Awaited<ReturnType<typeof observeNodeState>>,
  latestConfirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation> & {
    confirmationHeight: number; confirmationHeaderIdHex: string;
  },
  assertNativePacket?: () => DepositPacket,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1> {
  const expectedTxId = packet.transactions.reserveTransition.txId;
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
    finalityTargetHeight: primaryState.finality.targetHeight,
    finalityTargetHeaderIdHex: primaryState.finality.targetHeaderIdHex,
    requiredSuccessorDepth:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
    finalityPathHeaderIdsHex: primaryState.finality.pathHeaderIdsHex,
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
      exactRequiredDepthAncestryObserved: true as const,
      exactFinalityTargetSelected: true as const,
      ergoPowAuthenticated: false as const,
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
  OBSERVATIONS.set(observation, Object.freeze({
    target: input.target,
    binding,
    batch: input.batch,
    candidate: input.candidate,
    packet,
    ...(assertNativePacket ? { assertNativePacket } : {}),
  }));
  return observation;
}

type NativeTip = Readonly<{ height: number; idHex: string }>;
interface NativeWindow {
  assertReadCustody(): void;
  recordTip(client: AuthenticatedSpvTrackerReadOnlyNodeClient, tip: NativeTip): void;
  recordHeader(header: NativeTip & { readonly parentIdHex?: string }): void;
}
class NativeTipAdvance extends Error {}

async function settleNativeReads<T>(reads: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(reads);
  // Mining in one read must not hide a semantic failure in its sibling.
  const failure = settled.find(result => result.status === 'rejected'
    && !(result.reason instanceof NativeTipAdvance));
  if (failure?.status === 'rejected') throw failure.reason;
  return settled.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

export async function observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
    packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>> {
  const retained = Object.freeze({ ...input });
  const { target, batch, packet } = retained;
  const binding = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  const assertPacket = () => assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, target);
  const assertActive = () => {
    const current = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
    if (current.processBindingDigestHex !== binding.processBindingDigestHex
      || current.executionTargetIdentityDigestHex !== binding.executionTargetIdentityDigestHex
      || assertPacket() !== packet) {
      throw new Error('native committed-vault target or packet changed');
    }
  };
  const assertReadCustody = () => {
    if (assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(packet, batch, target) !== packet) {
      throw new Error('native committed-vault read custody changed');
    }
  };
  const readGroup = async <T>(read: () => Promise<T>): Promise<T> => {
    assertActive();
    try {
      return await read();
    } finally {
      assertActive();
    }
  };
  assertActive();
  const confirmation = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(retained.confirmation);
  if (confirmation.status !== 'confirmed' || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null) {
    throw new Error('native committed-vault requires canonical confirmation');
  }
  const expectedTxId = packet.transactions.reserveTransition.txId;
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    confirmation.observerArtifact, binding.executionTargetIdentityDigestHex,
    batch.request.target.genesisHeaderIdHex, expectedTxId, confirmation,
  );
  let prior = confirmation;
  const refresh = async () => {
    const latest = await readGroup(() => reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
      artifact: prior.observerArtifact,
      expectedReconciliationIdentityDigestHex: binding.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
      expectedTxId, priorConfirmation: prior,
    }));
    if (latest.status !== 'confirmed' || latest.confirmationHeight === null
      || latest.confirmationHeaderIdHex === null
      || latest.confirmationHeight !== confirmation.confirmationHeight
      || latest.confirmationHeaderIdHex !== confirmation.confirmationHeaderIdHex
      || latest.observedAtHeight < prior.observedAtHeight) {
      throw new Error('native committed-vault canonical inclusion changed or confirmation regressed');
    }
    prior = latest;
    return { ...latest, confirmationHeight: latest.confirmationHeight,
      confirmationHeaderIdHex: latest.confirmationHeaderIdHex };
  };
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(target.primaryNodeOrigin);
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(target.witnessNodeOrigin);
  const tips = new Map<AuthenticatedSpvTrackerReadOnlyNodeClient, NativeTip>();
  const headers = new Map<number, string>();
  const heights = new Map<string, number>();
  const parents = new Map<string, string>();
  const window: NativeWindow = {
    assertReadCustody,
    recordHeader(header) {
      const known = headers.get(header.height);
      const height = heights.get(header.idHex);
      const parent = parents.get(header.idHex);
      if ((known !== undefined && known !== header.idHex)
        || (height !== undefined && height !== header.height)
        || (parent !== undefined && header.parentIdHex !== undefined && parent !== header.parentIdHex)) {
        throw new Error('native committed-vault conflicting header at a previously observed height');
      }
      headers.set(header.height, header.idHex);
      heights.set(header.idHex, header.height);
      if (header.parentIdHex !== undefined) parents.set(header.idHex, header.parentIdHex);
    },
    recordTip(client, tip) {
      const previous = tips.get(client);
      if (previous && (tip.height < previous.height
        || (tip.height === previous.height && tip.idHex !== previous.idHex))) {
        throw new Error('native committed-vault per-node tip regressed or replaced');
      }
      window.recordHeader(tip);
      tips.set(client, tip);
    },
  };
  // Repeat only read-only windows interrupted by mining, never failed state checks.
  for (let attempt = 0; attempt < NODE_STATE_OBSERVATION_MAX_ATTEMPTS; attempt++) {
    try {
      const initial = await refresh();
      const observe = (client: AuthenticatedSpvTrackerReadOnlyNodeClient, label: string) =>
        observeNodeState(client, packet.boxes.sourceFundingInput.boxId,
          packet.boxes.reservePredecessor.boxId, packet.boxes.sourceLock.boxId,
          packet.boxes.transitionFeeFunding.boxId, packet.boxes.reserveSuccessor,
          initial.confirmationHeight, initial.confirmationHeaderIdHex, label, window);
      const [primaryState, witnessState] = await readGroup(() => settleNativeReads([
        observe(primary, 'primary'), observe(witness, 'witness'),
      ]));
      if (!primaryState || !witnessState) throw new Error('native committed-vault output pair is incomplete');
      if (canonicalJson(primaryState.finality) !== canonicalJson(witnessState.finality)) {
        throw new Error('native committed-vault finality observations disagree');
      }
      if ([primaryState, witnessState].some(state => initial.observedAtHeight > state.tip.height)) {
        throw new Error('native committed-vault confirmation snapshot conflicts with output tip');
      }
      if (canonicalJson(primaryState.tip) !== canonicalJson(witnessState.tip)) throw new NativeTipAdvance();
      const latest = await refresh();
      if (latest.observedAtHeight < primaryState.tip.height) {
        throw new Error('native committed-vault confirmation snapshot conflicts with output tip');
      }
      // Closing confirmation may observe later mining. Each closing walk still
      // crosses the captured output tip; the shared header ledger rejects its replacement.
      const [primaryFinality, witnessFinality] = await readGroup(() => settleNativeReads([
        observeStableFinality(primary, latest.confirmationHeight, latest.confirmationHeaderIdHex, 'primary', window),
        observeStableFinality(witness, latest.confirmationHeight, latest.confirmationHeaderIdHex, 'witness', window),
      ]));
      if (!primaryFinality || !witnessFinality) throw new Error('native committed-vault finality pair is incomplete');
      if ([primaryFinality, witnessFinality].some(state =>
        canonicalJson(state.finality) !== canonicalJson(primaryState.finality))) {
        throw new Error('native committed-vault finality target changed');
      }
      if ([primaryFinality, witnessFinality].some(state => latest.observedAtHeight > state.tip.height)) {
        throw new Error('native committed-vault confirmation exceeds the closing tip');
      }
      if (canonicalJson(primaryFinality.tip) !== canonicalJson(witnessFinality.tip)) {
        throw new NativeTipAdvance();
      }
      assertActive();
      return retainObservation(retained, packet, binding, binding,
        primaryState, witnessState, latest, assertPacket);
    } catch (error) {
      assertActive();
      if (!(error instanceof NativeTipAdvance)) throw error;
    }
  }
  throw new Error('native committed-vault observation did not stabilize within three windows');
}

export function assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1(
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>,
  packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
): Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(observation, target);
  const material = OBSERVATIONS.get(observation);
  if (material?.assertNativePacket === undefined || material.batch !== batch || material.packet !== packet) {
    throw new Error('native committed-vault observation lacks exact packet and batch provenance');
  }
  return packet;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1(
  observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  candidate:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV1> {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
    observation,
    target,
  );
  const material = OBSERVATIONS.get(observation);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    candidate,
    batch,
    target,
  );
  if (
    material === undefined
    || material.batch !== batch
    || material.candidate !== candidate
    || material.packet !== packet
  ) {
    throw new Error(
      'isolated committed-vault output observation does not bind the exact candidate',
    );
  }
  return packet;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2(
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>,
  candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV2> {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(observation, target);
  const material = OBSERVATIONS.get(observation);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(candidate, batch, target);
  if (material === undefined || material.batch !== batch
    || material.candidate !== candidate || material.packet !== packet) {
    throw new Error('isolated committed-vault output observation does not bind the exact V2 candidate');
  }
  return packet;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
  observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  const material = OBSERVATIONS.get(observation);
  let current: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  if (material !== undefined && material.target === target && material.assertNativePacket !== undefined) {
    if (material.assertNativePacket() !== material.packet) {
      throw new Error('native committed-vault observation packet changed');
    }
    // The original packet assertion has just validated its original batch and target.
    current = (material.batch as Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>).targetBinding;
  } else {
    current = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  }
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
  confirmationHeight: number,
  confirmationHeaderIdHex: string,
  label: string,
  window?: NativeWindow,
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
  finality: Readonly<{
    targetHeight: number;
    targetHeaderIdHex: string;
    pathHeaderIdsHex: readonly string[];
  }>;
  digestHex: string;
}>> {
  for (let attempt = 0; attempt < NODE_STATE_OBSERVATION_MAX_ATTEMPTS; attempt += 1) {
    window?.assertReadCustody();
    const tipBefore = normalizeBestHeader(
      await client.getBestHeader(),
      `isolated committed-vault ${label} pre-output tip`,
    );
    window?.assertReadCustody();
    window?.recordTip(client, tipBefore);
    const boxReads = [sourceFundingBoxIdHex, reservePredecessorBoxIdHex, sourceLockBoxIdHex,
      transitionFeeFundingBoxIdHex, expectedReserveSuccessor.boxId].map(id => {
      if (!window) return client.getBoxByIdOrNull(id);
      return (async () => {
        window.assertReadCustody();
        try {
          return await client.getBoxByIdOrNull(id);
        } finally {
          window.assertReadCustody();
        }
      })();
    });
    const [
      sourceFunding,
      reservePredecessor,
      sourceLock,
      transitionFeeFunding,
      rawReserveSuccessor,
    ] = await (window ? settleNativeReads(boxReads) : Promise.all(boxReads));
    window?.assertReadCustody();
    const tipAfter = normalizeBestHeader(
      await client.getBestHeader(),
      `isolated committed-vault ${label} post-output tip`,
    );
    window?.assertReadCustody();
    window?.recordTip(client, tipAfter);
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
    window?.assertReadCustody();
    if (
      canonicalJson(reserveSuccessor)
        !== canonicalJson(expectedReserveSuccessor)
    ) {
      throw new Error(
        `isolated committed-vault ${label} reserve successor bytes changed`,
      );
    }
    if (window && reserveSuccessor.creationHeight > tipAfter.height) {
      throw new Error('native committed-vault successor creation height exceeds observed tip');
    }
    if (canonicalJson(tipBefore) === canonicalJson(tipAfter)) {
      const finality = await observeExactFinalityPath(
        client,
        tipAfter,
        confirmationHeight,
        confirmationHeaderIdHex,
        label,
        window,
      );
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
        finality,
      });
      return Object.freeze({
        ...body,
        digestHex: sha256CanonicalJson(body, OBSERVATION_DIGEST_DOMAIN),
      });
    }
    assertTipAdvancedWithoutReplacement(tipBefore, tipAfter, label);
    if (window) throw new NativeTipAdvance();
  }
  throw new Error(
    `isolated committed-vault ${label} tip did not stabilize during output observation`,
  );
}

async function observeExactFinalityPath(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  tip: Readonly<{ height: number; idHex: string }>,
  inclusionHeight: number,
  inclusionHeaderIdHex: string,
  label: string,
  window?: NativeWindow,
): Promise<Readonly<{
  targetHeight: number;
  targetHeaderIdHex: string;
  pathHeaderIdsHex: readonly string[];
}>> {
  const targetHeight = inclusionHeight
    + SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1;
  if (
    !Number.isSafeInteger(targetHeight)
    || targetHeight > 0xffff_ffff
    || tip.height < targetHeight
  ) {
    throw new Error(
      `isolated committed-vault ${label} tip has not reached the exact finality target`,
    );
  }
  if (tip.height - targetHeight > FINALITY_TARGET_MAX_TIP_LAG) {
    throw new Error(
      `isolated committed-vault ${label} finality target is outside the bounded tip window`,
    );
  }
  const descending: Array<Readonly<{
    height: number;
    idHex: string;
    parentIdHex: string;
  }>> = [];
  let cursor = tip;
  while (cursor.height >= inclusionHeight) {
    window?.assertReadCustody();
    const raw = await client.getBlockHeaderById(cursor.idHex);
    window?.assertReadCustody();
    if (raw === null) {
      throw new Error(
        `isolated committed-vault ${label} finality header is unavailable`,
      );
    }
    const header = normalizeHeader(
      raw,
      `isolated committed-vault ${label} finality header`,
    );
    if (header.idHex !== cursor.idHex || header.height !== cursor.height) {
      throw new Error(
        `isolated committed-vault ${label} finality header identity changed`,
      );
    }
    window?.recordHeader(header);
    if (header.height <= targetHeight) descending.push(header);
    if (header.height === inclusionHeight) break;
    cursor = Object.freeze({
      height: header.height - 1,
      idHex: header.parentIdHex,
    });
  }
  const ascending = descending.reverse();
  if (
    ascending.length
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1
        + 1
    || ascending[0]?.height !== inclusionHeight
    || ascending[0]?.idHex !== inclusionHeaderIdHex
    || ascending.at(-1)?.height !== targetHeight
  ) {
    throw new Error(
      `isolated committed-vault ${label} finality path does not bind the canonical inclusion`,
    );
  }
  for (let index = 1; index < ascending.length; index += 1) {
    if (ascending[index]!.parentIdHex !== ascending[index - 1]!.idHex) {
      throw new Error(
        `isolated committed-vault ${label} finality path parent link changed`,
      );
    }
  }
  return Object.freeze({
    targetHeight,
    targetHeaderIdHex: ascending.at(-1)!.idHex,
    pathHeaderIdsHex: Object.freeze(ascending.map(header => header.idHex)),
  });
}

async function observeStableFinality(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  inclusionHeight: number,
  inclusionHeaderIdHex: string,
  label: string,
  window?: NativeWindow,
): Promise<Readonly<{
  tip: Readonly<{ height: number; idHex: string }>;
  finality: Readonly<{
    targetHeight: number;
    targetHeaderIdHex: string;
    pathHeaderIdsHex: readonly string[];
  }>;
}>> {
  for (
    let attempt = 0;
    attempt < NODE_STATE_OBSERVATION_MAX_ATTEMPTS;
    attempt += 1
  ) {
    window?.assertReadCustody();
    const tipBefore = normalizeBestHeader(
      await client.getBestHeader(),
      `isolated committed-vault ${label} pre-finality tip`,
    );
    window?.assertReadCustody();
    window?.recordTip(client, tipBefore);
    const finality = await observeExactFinalityPath(
      client,
      tipBefore,
      inclusionHeight,
      inclusionHeaderIdHex,
      label,
      window,
    );
    const tipAfter = normalizeBestHeader(
      await client.getBestHeader(),
      `isolated committed-vault ${label} post-finality tip`,
    );
    window?.assertReadCustody();
    window?.recordTip(client, tipAfter);
    if (canonicalJson(tipBefore) === canonicalJson(tipAfter)) {
      return Object.freeze({ tip: tipAfter, finality });
    }
    assertTipAdvancedWithoutReplacement(tipBefore, tipAfter, label);
    if (window) throw new NativeTipAdvance();
  }
  throw new Error(
    `isolated committed-vault ${label} tip did not stabilize during finality reobservation`,
  );
}

function assertTipAdvancedWithoutReplacement(
  before: Readonly<{ height: number; idHex: string }>,
  after: Readonly<{ height: number; idHex: string }>,
  label: string,
): void {
  if (after.height < before.height) {
    throw new Error(
      `isolated committed-vault ${label} tip regressed during output observation`,
    );
  }
  if (after.height === before.height || after.idHex === before.idHex) {
    throw new Error(
      `isolated committed-vault ${label} tip replaced or reused during output observation`,
    );
  }
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

function normalizeHeader(
  value: unknown,
  label: string,
): Readonly<{ height: number; idHex: string; parentIdHex: string }> {
  const best = normalizeBestHeader(value, label);
  const record = value as Record<string, unknown>;
  if (
    typeof record.parentId !== 'string'
    || !/^[0-9a-fA-F]{64}$/u.test(record.parentId)
  ) {
    throw new Error(`${label} parent id must be 32-byte hex`);
  }
  return Object.freeze({
    ...best,
    parentIdHex: record.parentId.toLowerCase(),
  });
}
