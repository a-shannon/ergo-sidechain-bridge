import { AuthenticatedSpvTrackerReadOnlyNodeClient } from './authenticated-spv-tracker-read-only-node-client.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
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
    candidate?: object;
    packet: DepositPacket;
    assertNativePacket?: () => DepositPacket;
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
      | SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3
      | SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
    candidate?: object;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
  assertCandidate: () => DepositPacket,
  assertRetainedReadCustody?: () => DepositPacket,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>> {
  const native = assertRetainedReadCustody !== undefined;
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertCandidate();
  const assertActive = () => {
    if (!native) return;
    const current = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
    if (current.processBindingDigestHex !== binding.processBindingDigestHex
      || current.executionTargetIdentityDigestHex !== binding.executionTargetIdentityDigestHex
      || assertCandidate() !== packet) {
      throw new Error('native source-lock output target or packet changed during observation');
    }
  };
  const assertReadCustody = () => {
    if (assertRetainedReadCustody && assertRetainedReadCustody() !== packet) {
      throw new Error('native source-lock read custody changed');
    }
  };
  const readGroup = async <T>(read: () => Promise<T>): Promise<T> => {
    assertActive();
    try { return await read(); } finally { assertActive(); }
  };
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
    assertActive();
    const refreshed = await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
      artifact: prior.observerArtifact,
      expectedReconciliationIdentityDigestHex: binding.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex: input.batch.request.target.genesisHeaderIdHex,
      expectedTxId,
      priorConfirmation: prior,
    });
    assertActive();
    if (refreshed.status !== 'confirmed' || refreshed.confirmationHeight === null
      || refreshed.confirmationHeaderIdHex === null) {
      throw new Error('isolated source-lock output observation requires refreshed canonical confirmation');
    }
    if (native && (refreshed.confirmationHeight !== confirmation.confirmationHeight
      || refreshed.confirmationHeaderIdHex !== confirmation.confirmationHeaderIdHex
      || refreshed.observedAtHeight < prior.observedAtHeight)) {
      throw new Error('native source-lock canonical inclusion changed or confirmation regressed');
    }
    return Object.freeze({ ...refreshed,
      confirmationHeight: refreshed.confirmationHeight,
      confirmationHeaderIdHex: refreshed.confirmationHeaderIdHex,
    });
  };
  type Tip = Awaited<ReturnType<typeof readTip>>;
  const previousTips = new Map<AuthenticatedSpvTrackerReadOnlyNodeClient, Tip>();
  const observedHeaders = new Map<number, string>();
  const readWindowTip = async (client: AuthenticatedSpvTrackerReadOnlyNodeClient) => {
    const tip = await readTip(client, native ? assertReadCustody : assertActive);
    if (native) {
      const previous = previousTips.get(client);
      if (previous && (tip.height < previous.height
        || (tip.height === previous.height && tip.idHex !== previous.idHex))) {
        throw new Error('native source-lock output-observation tip regressed or changed');
      }
      const observedId = observedHeaders.get(tip.height);
      if (observedId !== undefined && observedId !== tip.idHex) {
        throw new Error('native source-lock output-observation tips disagree at a previously observed height');
      }
      observedHeaders.set(tip.height, tip.idHex);
      previousTips.set(client, tip);
    }
    return tip;
  };
  const sameNativeTip = (first: Tip, second: Tip) => {
    if (first.height !== second.height) return false;
    if (first.idHex !== second.idHex) {
      throw new Error('native source-lock output-observation tips disagree');
    }
    return true;
  };
  let priorConfirmation = confirmation;
  // Native mining may advance; only complete read-only windows are repeated.
  for (let attempt = 0; attempt < (native ? 3 : 1); attempt++) {
    const initialConfirmation = await refreshConfirmation(priorConfirmation);
    priorConfirmation = initialConfirmation;
    const window = await readGroup(async () => {
      const [primaryTipBefore, witnessTipBefore] = native
        ? await settleReads([readWindowTip(primary), readWindowTip(witness)])
        : [await readWindowTip(primary), await readWindowTip(witness)];
      if (native && !sameNativeTip(primaryTipBefore!, witnessTipBefore!)) return null;
      const observe = (client: AuthenticatedSpvTrackerReadOnlyNodeClient, label: string) =>
        observeNodeState(client, packet.boxes.sourceFundingInput.boxId, packet.boxes.sourceLock,
          packet.boxes.transitionFeeFunding, label, native ? assertReadCustody : assertActive);
      const [primaryState, witnessState] = native
        ? await settleReads([observe(primary, 'primary'), observe(witness, 'witness')])
        : [await observe(primary, 'primary'), await observe(witness, 'witness')];
      if (native) {
        if (initialConfirmation.observedAtHeight > primaryTipBefore!.height
          || primaryTipBefore!.height - initialConfirmation.confirmationHeight
            < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS) {
          throw new Error('native source-lock confirmation snapshot or depth exceeds the output tip');
        }
        await settleReads([primary, witness].map(async client => {
          assertReadCustody();
          const ids = await client.getBlockHeaderIdsAtHeight(initialConfirmation.confirmationHeight);
          assertReadCustody();
          if (ids.length !== 1 || ids[0] !== initialConfirmation.confirmationHeaderIdHex) {
            throw new Error('native source-lock output inclusion differs from canonical confirmation');
          }
        }));
      }
      const after = native ? await settleReads([readWindowTip(primary), readWindowTip(witness)]) : undefined;
      return { primaryTipBefore: primaryTipBefore!, witnessTipBefore: witnessTipBefore!,
        primaryState: primaryState!, witnessState: witnessState!, after };
    });
    if (window === null) continue;
    const { primaryTipBefore, witnessTipBefore, primaryState, witnessState } = window;
    if (canonicalJson(primaryState) !== canonicalJson(witnessState)) {
      throw new Error('isolated source-lock output observations disagree');
    }
    const latestConfirmation = await refreshConfirmation(initialConfirmation);
    if (latestConfirmation.confirmationHeight !== initialConfirmation.confirmationHeight
      || latestConfirmation.confirmationHeaderIdHex !== initialConfirmation.confirmationHeaderIdHex) {
      throw new Error('isolated source-lock canonical inclusion changed during observation');
    }
    const primaryTipAfter = native ? window.after![0]! : await readWindowTip(primary);
    const witnessTipAfter = native ? window.after![1]! : await readWindowTip(witness);
    if (native) {
      priorConfirmation = latestConfirmation;
      const primaryStable = sameNativeTip(primaryTipBefore, primaryTipAfter);
      const witnessStable = sameNativeTip(primaryTipBefore, witnessTipAfter);
      sameNativeTip(primaryTipAfter, witnessTipAfter);
      if (!primaryStable || !witnessStable) continue;
      if (packet.boxes.sourceLock.creationHeight > primaryTipBefore.height
        || packet.boxes.transitionFeeFunding.creationHeight > primaryTipBefore.height) {
        throw new Error('native source-lock output creation height exceeds the stable tip');
      }
      if (latestConfirmation.observedAtHeight < primaryTipBefore.height) {
        throw new Error('native source-lock confirmation snapshots differ from the output tip');
      }
      // The closing confirmation may observe later mining. Rebind the captured
      // output anchor afterward; visible tips do not imply an atomic UTXO view.
      const continuous = await readGroup(async () => {
        const before = await settleReads([readWindowTip(primary), readWindowTip(witness)]);
        if (!sameNativeTip(before[0]!, before[1]!)) return false;
        if (latestConfirmation.observedAtHeight > before[0]!.height) {
          throw new Error('native source-lock confirmation exceeds the closing tip');
        }
        await settleReads([primary, witness].map(async client => {
          assertReadCustody();
          const ids = await client.getBlockHeaderIdsAtHeight(primaryTipBefore.height);
          assertReadCustody();
          if (ids.length !== 1 || ids[0] !== primaryTipBefore.idHex) {
            throw new Error('native source-lock captured output anchor changed after confirmation');
          }
        }));
        const after = await settleReads([readWindowTip(primary), readWindowTip(witness)]);
        return sameNativeTip(before[0]!, after[0]!) && sameNativeTip(before[0]!, after[1]!);
      });
      if (!continuous) continue;
    }
    if ([witnessTipBefore, primaryTipAfter, witnessTipAfter].some(
      tip => canonicalJson(tip) !== canonicalJson(primaryTipBefore),
    )) {
      throw new Error('isolated source-lock observation requires one stable dual-node tip');
    }
    if (!native && (initialConfirmation.observedAtHeight > primaryTipBefore.height
      || latestConfirmation.observedAtHeight !== primaryTipBefore.height
      || latestConfirmation.confirmationHeight > primaryTipBefore.height)) {
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
      ...(native ? { assertNativePacket: assertCandidate } : {}),
    }));
    return observation;
  }
  throw new Error('native source-lock output-observation did not stabilize within three windows');
}

async function settleReads<T>(reads: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(reads);
  return settled.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

export async function observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
    packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>;
    confirmation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>> {
  const retained = Object.freeze({ ...input });
  const { target, batch, packet } = retained;
  return observeOutputs(retained, () =>
    assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, target), () =>
    assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(packet, batch, target));
}

export function assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1(
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>,
  packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
): Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(observation, target);
  const material = OBSERVATIONS.get(observation);
  if (material?.assertNativePacket === undefined || material.batch !== batch || material.packet !== packet) {
    throw new Error('native source-lock output observation lacks exact packet and batch provenance');
  }
  return packet;
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
  let current: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  if (material !== undefined && material.target === target && material.assertNativePacket !== undefined) {
    if (material.assertNativePacket() !== material.packet) {
      throw new Error('native source-lock output observation packet changed');
    }
    // Full packet provenance revalidates this exact target and its immutable
    // binding. A continuation's setup batch belongs to the earlier setup action.
    current = material.binding;
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
    throw new Error('isolated source-lock output observation lacks provenance');
  }
}

async function observeNodeState(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  sourceFundingBoxIdHex: string,
  expectedSourceLock: Eip12Box,
  expectedTransitionFeeFunding: Eip12Box,
  label: string,
  assertActive: () => void = () => {},
): Promise<Readonly<{
  sourceFundingBoxIdHex: string;
  sourceFundingPresent: false;
  sourceLock: Eip12Box;
  transitionFeeFunding: Eip12Box;
  digestHex: string;
}>> {
  assertActive();
  const sourceFunding = await client.getBoxByIdOrNull(sourceFundingBoxIdHex);
  assertActive();
  const rawSourceLock = await client.getBoxByIdOrNull(expectedSourceLock.boxId);
  assertActive();
  const rawTransitionFee = await client.getBoxByIdOrNull(
    expectedTransitionFeeFunding.boxId,
  );
  assertActive();
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
  assertActive();
  const transitionFeeFunding = await normalizeEip12Box(
    rawTransitionFee,
    `isolated source-lock ${label} transition-fee output`,
  );
  assertActive();
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
  assertActive: () => void = () => {},
): Promise<Readonly<{ height: number; idHex: string }>> {
  assertActive();
  const header = await client.getBestHeader();
  assertActive();
  if (header === null || typeof header !== 'object' || Array.isArray(header)
    || !('height' in header) || !('id' in header)
    || typeof header.height !== 'number' || !Number.isSafeInteger(header.height) || header.height <= 0
    || typeof header.id !== 'string' || !/^[0-9a-f]{64}$/u.test(header.id)) {
    throw new Error('isolated source-lock observation requires a canonical positive-height tip');
  }
  return Object.freeze({ height: header.height, idHex: header.id });
}
