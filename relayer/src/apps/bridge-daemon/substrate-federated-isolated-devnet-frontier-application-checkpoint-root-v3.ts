import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance,
  createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3,
  type ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  type SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3,
  type SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2,
  type SubstrateFederatedIsolatedDevnetPacketSignerBindingV1,
  type SubstrateFederatedIsolatedDevnetPacketV2,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance,
  preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
  type RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2Input,
  type SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2,
} from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-application-checkpoint-root.v3' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3';

export type SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3 =
  Readonly<Omit<
    RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2Input,
    'mintSourceProofReceipt'
  >>;

export interface ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input {
  readonly mintSourceProofInput:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input>;
  readonly applicationRunnerInput:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>;
}

export interface SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3 {
  readonly validFromErgoHeight: string | number | bigint;
  readonly expiresAtErgoHeight: string | number | bigint;
}

export interface CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input {
  readonly mintSourceProofInput:
    ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input['mintSourceProofInput'];
  readonly applicationRunnerInput:
    ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input['applicationRunnerInput'];
  readonly checkpointAdmission: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
  >;
}

export interface RunSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3Input {
  readonly ergoAdmissionSigner: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >;
  readonly packetInput:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>;
  readonly mintSourceProofInput:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input>;
  readonly applicationRunnerInput:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>;
  readonly checkpointAdmission: Readonly<{
    readonly validFromErgoHeight: string | number | bigint;
    readonly expiresAtErgoHeight: string | number | bigint;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA;
  readonly version: 3;
  readonly status:
    'packet_mint_application_burn_checkpoint_composed';
  readonly packet: Readonly<{
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetPacketV2['receipt']>;
  }>;
  readonly mintSourceProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly applicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2>;
  readonly checkpoint:
    Readonly<SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3>;
  readonly binding: Readonly<{
    readonly targetDescriptorDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly mintSourceProofReceiptDigestHex: string;
    readonly applicationRunnerReceiptDigestHex: string;
    readonly checkpointReceiptDigestHex: string;
    readonly burnIdHex: string;
    readonly bridgeEventRootHex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactPacketObjectBound: true;
    readonly exactPacketMintSourceProofObjectBound: true;
    readonly exactProcessProvenApplicationRunnerReceiptBound: true;
    readonly exactPacketInnerMintProofPassedToRunner: true;
    readonly packetMintAndRunnerTargetDescriptorBound: true;
    readonly checkpointFieldsDerivedFromApplicationBurnReceipt: true;
    readonly exactCheckpointReceiptObjectBound: true;
    readonly packetThenMintThenApplicationBurnThenCheckpointOrderingEstablished:
      true;
    readonly allProvenanceRevalidatedAfterApplicationExecution: true;
    readonly noCallerSuppliedExecutionOrAuthorityCallbackAccepted: true;
  }>;
  readonly boundary: Readonly<{
    readonly isolatedTestClientOnly: true;
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly thresholdSourceAttestationVerified: true;
    readonly independentAttestorCustodyEstablished: false;
    readonly applicationBurnReceiptBound: true;
    readonly checkpointAttestationEstablished: true;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly ergoTransactionSigningAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

interface RootMaterialV3 {
  readonly packet:
    Readonly<SubstrateFederatedIsolatedDevnetPacketV2>;
  readonly mintSourceProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly applicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2>;
  readonly checkpoint:
    Readonly<SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3>;
}

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3 {
  readonly packet:
    Readonly<SubstrateFederatedIsolatedDevnetPacketV2>;
  readonly mintSourceProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly applicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2>;
}

const RECEIPTS = new WeakMap<object, Readonly<RootMaterialV3>>();

interface CheckpointAttestationInputV3 {
  readonly sourceNativeBlockHeight: string | number | bigint;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly admissionValidFromErgoHeight: string | number | bigint;
  readonly admissionExpiresAtErgoHeight: string | number | bigint;
}

interface PacketCheckpointContinuationV3 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>;
  readonly produce: (
    input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetPacketV2>>;
  readonly produceMintSourceProof: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input
    >,
  ) => Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >;
  readonly produceCheckpointAttestation: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    mintSourceProof: Readonly<
      SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
    >,
    input: Readonly<CheckpointAttestationInputV3>,
  ) => Readonly<
    SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3
  >;
  readonly dispose: () => void;
}

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>;
  readonly produce: PacketCheckpointContinuationV3['produce'];
  readonly executeApplication: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    input: Readonly<
      ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
    >,
    completionDeadline?: number,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
  >>;
  readonly attestCheckpoint: (
    application: Readonly<
      SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
    >,
    checkpointAdmission: Readonly<
      SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
    >,
  ) => Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  >;
  readonly complete: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    input: Readonly<
      CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
    >,
    completionDeadline?: number,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  >>;
  readonly dispose: () => void;
}

export function createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
  ergoAdmissionSigner: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3
> {
  const continuation =
    createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3(
      ergoAdmissionSigner,
    );
  let state:
    | 'fresh'
    | 'packet_running'
    | 'packet_ready'
    | 'application_running'
    | 'application_ready'
    | 'checkpoint_running'
    | 'closed' = 'fresh';
  let completedPacket:
    Readonly<SubstrateFederatedIsolatedDevnetPacketV2> | undefined;
  let completedApplication:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3>
    | undefined;

  const close = (): void => {
    completedPacket = undefined;
    completedApplication = undefined;
    state = 'closed';
    continuation.dispose();
  };
  const dispose = (): void => {
    if (
      state === 'packet_running'
      || state === 'application_running'
      || state === 'checkpoint_running'
    ) {
      throw new Error(
        'Frontier application-checkpoint continuation is running',
      );
    }
    if (state !== 'closed') {
      close();
    }
  };
  const produce = async (
    input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
  ) => {
    if (state !== 'fresh') {
      throw new Error(
        'Frontier application-checkpoint continuation is already consumed or disposed',
      );
    }
    state = 'packet_running';
    try {
      const packet = await continuation.produce(input);
      assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
      completedPacket = packet;
      state = 'packet_ready';
      return packet;
    } catch (error) {
      close();
      throw error;
    }
  };
  const executeApplication = async (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    input: Readonly<
      ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
    >,
    completionDeadline: number | undefined = undefined,
  ) => {
    if (state !== 'packet_ready' || packet !== completedPacket) {
      throw new Error(
        'Frontier application-checkpoint continuation requires its exact retained packet',
      );
    }
    state = 'application_running';
    try {
      const application = await executeApplicationCheckpointContinuation(
        continuation,
        packet,
        preflightApplicationInput(input),
        completionDeadline,
      );
      completedApplication = application;
      state = 'application_ready';
      return application;
    } catch (error) {
      close();
      throw error;
    }
  };
  const attestCheckpoint = (
    application: Readonly<
      SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
    >,
    checkpointAdmission: Readonly<
      SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
    >,
  ) => {
    if (
      state !== 'application_ready'
      || application !== completedApplication
    ) {
      throw new Error(
        'Frontier application-checkpoint continuation requires its exact application stage',
      );
    }
    state = 'checkpoint_running';
    try {
      return attestApplicationCheckpointContinuation(
        continuation,
        application,
        preflightCheckpointAdmission(checkpointAdmission),
      );
    } finally {
      close();
    }
  };
  const complete = async (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
    input: Readonly<
      CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
    >,
    completionDeadline: number | undefined = undefined,
  ) => {
    if (state !== 'packet_ready' || packet !== completedPacket) {
      throw new Error(
        'Frontier application-checkpoint continuation requires its exact retained packet',
      );
    }
    let plan: Readonly<
      CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
    >;
    try {
      plan = preflightCompletionInput(input);
    } catch (error) {
      dispose();
      throw error;
    }
    const application = await executeApplication(packet, {
      mintSourceProofInput: plan.mintSourceProofInput,
      applicationRunnerInput: plan.applicationRunnerInput,
    }, completionDeadline);
    return attestCheckpoint(application, plan.checkpointAdmission);
  };
  return Object.freeze({
    signer: continuation.signer,
    dispose,
    produce,
    executeApplication,
    attestCheckpoint,
    complete,
  });
}

export async function runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3Input
  >,
  completionDeadline: number | undefined = undefined,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
>> {
  const plan = preflight(input);
  const continuation =
    createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
      plan.ergoAdmissionSigner,
    );
  try {
    const packet = await continuation.produce(plan.packetInput);
    return await continuation.complete(packet, {
      mintSourceProofInput: plan.mintSourceProofInput,
      applicationRunnerInput: plan.applicationRunnerInput,
      checkpointAdmission: plan.checkpointAdmission,
    }, completionDeadline);
  } finally {
    continuation.dispose();
  }
}

async function executeApplicationCheckpointContinuation(
  continuation: Readonly<PacketCheckpointContinuationV3>,
  packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
  plan: Readonly<
    ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
  >,
  completionDeadline: number | undefined,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
>> {
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
  const mintSourceProof = continuation.produceMintSourceProof(
    packet,
    plan.mintSourceProofInput,
  );
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  const applicationRunner =
    await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2(
      {
        ...plan.applicationRunnerInput,
        mintSourceProofReceipt: mintSourceProof.sourceProof,
      },
      completionDeadline,
    );
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(
    applicationRunner,
  );
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  assertMintAndRunnerBinding(packet, mintSourceProof, applicationRunner);

  return deepFreeze({
    packet,
    mintSourceProof,
    applicationRunner,
  });
}

function attestApplicationCheckpointContinuation(
  continuation: Readonly<PacketCheckpointContinuationV3>,
  application: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
  >,
  checkpointAdmission: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
> {
  const { packet, mintSourceProof, applicationRunner } = application;
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(
    applicationRunner,
  );
  assertMintAndRunnerBinding(packet, mintSourceProof, applicationRunner);

  const applicationEvidence =
    applicationRunner.executionResult.applicationEvidence;
  const checkpoint = continuation.produceCheckpointAttestation(
    packet,
    mintSourceProof,
    {
      sourceNativeBlockHeight: applicationEvidence.sourceNativeBlock.height,
      sourceNativeBlockHashHex: applicationEvidence.sourceNativeBlock.hashHex,
      executionBlockHashHex: applicationEvidence.execution.blockHashHex,
      bridgeEventRootHex: applicationEvidence.burn.bridgeEventRootHex,
      burnLeafCount: applicationEvidence.burn.burnLeafCount,
      admissionValidFromErgoHeight:
        checkpointAdmission.validFromErgoHeight,
      admissionExpiresAtErgoHeight:
        checkpointAdmission.expiresAtErgoHeight,
    },
  );
  assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance(
    checkpoint,
  );
  assertApplicationBurnCheckpointBinding(applicationRunner, checkpoint);

  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA,
    version: 3 as const,
    status:
      'packet_mint_application_burn_checkpoint_composed' as const,
    packet: {
      receipt: packet.receipt,
    },
    mintSourceProof,
    applicationRunner,
    checkpoint,
    binding: {
      targetDescriptorDigestHex:
        packet.receipt.targetDescriptorDigestHex,
      packetReceiptDigestHex: packet.receipt.receiptDigestHex,
      mintSourceProofReceiptDigestHex: mintSourceProof.receiptDigestHex,
      applicationRunnerReceiptDigestHex:
        applicationRunner.receiptDigestHex,
      checkpointReceiptDigestHex: checkpoint.receiptDigestHex,
      burnIdHex: applicationEvidence.burn.burnIdHex,
      bridgeEventRootHex: applicationEvidence.burn.bridgeEventRootHex,
    },
    checks: {
      exactPacketObjectBound: true as const,
      exactPacketMintSourceProofObjectBound: true as const,
      exactProcessProvenApplicationRunnerReceiptBound: true as const,
      exactPacketInnerMintProofPassedToRunner: true as const,
      packetMintAndRunnerTargetDescriptorBound: true as const,
      checkpointFieldsDerivedFromApplicationBurnReceipt: true as const,
      exactCheckpointReceiptObjectBound: true as const,
      packetThenMintThenApplicationBurnThenCheckpointOrderingEstablished:
        true as const,
      allProvenanceRevalidatedAfterApplicationExecution: true as const,
      noCallerSuppliedExecutionOrAuthorityCallbackAccepted: true as const,
    },
    boundary: {
      isolatedTestClientOnly: true as const,
      processOwnedSyntheticCustodyOnly: true as const,
      thresholdSourceAttestationVerified: true as const,
      independentAttestorCustodyEstablished: false as const,
      applicationBurnReceiptBound: true as const,
      checkpointAttestationEstablished: true as const,
      sourceConsensusIndependentlyVerified: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoAnchorEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      ergoTransactionSigningAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The burn executes only in the pinned in-memory Frontier TestClient and the checkpoint is a disclosed federated attestation.',
      'Source consensus, deterministic finality, Ergo anchoring, tracker admission, global replay insertion and payout remain separate joins.',
      'No signing, submission, broadcast, funds authority, Gate 5 closure, trustless status or production readiness follows.',
    ] as const,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  RECEIPTS.set(receipt, Object.freeze({
    packet,
    mintSourceProof,
    applicationRunner,
    checkpoint,
  }));
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
> {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'Frontier application-checkpoint root receipt lacks process provenance',
    );
  }
  const material = RECEIPTS.get(value);
  if (material === undefined) {
    throw new Error(
      'Frontier application-checkpoint root receipt lacks process provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  >;
  if (
    receipt.packet.receipt !== material.packet.receipt
    || receipt.mintSourceProof !== material.mintSourceProof
    || receipt.applicationRunner !== material.applicationRunner
    || receipt.checkpoint !== material.checkpoint
  ) {
    throw new Error('Frontier application-checkpoint root binding changed');
  }
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(material.packet);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    material.mintSourceProof,
  );
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(
    material.applicationRunner,
  );
  assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance(
    material.checkpoint,
  );
  assertMintAndRunnerBinding(
    material.packet,
    material.mintSourceProof,
    material.applicationRunner,
  );
  assertApplicationBurnCheckpointBinding(
    material.applicationRunner,
    material.checkpoint,
  );
  const evidence = material.applicationRunner.executionResult.applicationEvidence;
  if (
    receipt.binding.targetDescriptorDigestHex
      !== material.packet.receipt.targetDescriptorDigestHex
    || receipt.binding.packetReceiptDigestHex
      !== material.packet.receipt.receiptDigestHex
    || receipt.binding.mintSourceProofReceiptDigestHex
      !== material.mintSourceProof.receiptDigestHex
    || receipt.binding.applicationRunnerReceiptDigestHex
      !== material.applicationRunner.receiptDigestHex
    || receipt.binding.checkpointReceiptDigestHex
      !== material.checkpoint.receiptDigestHex
    || receipt.binding.burnIdHex !== evidence.burn.burnIdHex
    || receipt.binding.bridgeEventRootHex
      !== evidence.burn.bridgeEventRootHex
  ) {
    throw new Error('Frontier application-checkpoint root digest binding changed');
  }
  const { receiptDigestHex, ...body } = receipt;
  if (sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex) {
    throw new Error('Frontier application-checkpoint root receipt changed');
  }
}

function assertMintAndRunnerBinding(
  packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
  mintSourceProof: Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >,
  applicationRunner: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2
  >,
): void {
  if (
    mintSourceProof.packetReceiptDigestHex
      !== packet.receipt.receiptDigestHex
    || mintSourceProof.targetDescriptorDigestHex
      !== packet.receipt.targetDescriptorDigestHex
    || mintSourceProof.sourceProofReceiptDigestHex
      !== mintSourceProof.sourceProof.receiptDigestHex
    || applicationRunner.mintSourceProof.receiptDigestHex
      !== mintSourceProof.sourceProofReceiptDigestHex
    || applicationRunner.mintSourceProof.targetDescriptorDigestHex
      !== mintSourceProof.targetDescriptorDigestHex
  ) {
    throw new Error(
      'Frontier application runner targets a different packet or mint proof',
    );
  }
}

function assertApplicationBurnCheckpointBinding(
  applicationRunner: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2
  >,
  checkpoint: Readonly<
    SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3
  >,
): void {
  const evidence = applicationRunner.executionResult.applicationEvidence;
  const statement = checkpoint.checkpointAttestation.checkpointStatement;
  if (
    statement.sourceNativeBlockHeight
      !== evidence.sourceNativeBlock.height.toString()
    || statement.sourceNativeBlockHashHex
      !== unprefixedHex(evidence.sourceNativeBlock.hashHex)
    || statement.executionBlockHashHex
      !== unprefixedHex(evidence.execution.blockHashHex)
    || statement.bridgeEventRootHex
      !== unprefixedHex(evidence.burn.bridgeEventRootHex)
    || statement.burnLeafCount !== evidence.burn.burnLeafCount
    || statement.sidechainIdHex
      !== unprefixedHex(evidence.execution.sidechainIdHex)
    || statement.bridgeAddressHex
      !== unprefixedHex(evidence.application.bridgeAddressHex)
    || statement.tokenAddressHex
      !== unprefixedHex(evidence.application.tokenAddressHex)
  ) {
    throw new Error(
      'federated checkpoint differs from the process-proven application burn',
    );
  }
}

export function preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3(
  input: Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3> {
  const runner = exactOwnDataRecord(input, [
    'cargoDependencyCacheDirectory',
    'cargoExecutablePath',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'rustcExecutablePath',
    'temporaryDirectoryRoot',
  ], 'Frontier application-checkpoint runner input');
  return preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1({
    frontierSourceDirectory: runner.frontierSourceDirectory as string,
    temporaryDirectoryRoot: runner.temporaryDirectoryRoot as string,
    cargoDependencyCacheDirectory:
      runner.cargoDependencyCacheDirectory as string,
    cargoExecutablePath: runner.cargoExecutablePath as string,
    rustcExecutablePath: runner.rustcExecutablePath as string,
    gitExecutablePath: runner.gitExecutablePath as string,
    offline: runner.offline as true,
  });
}

function preflight(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3Input
  >,
): Readonly<
  RunSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3Input
> {
  const record = exactOwnDataRecord(input, [
    'applicationRunnerInput',
    'checkpointAdmission',
    'ergoAdmissionSigner',
    'mintSourceProofInput',
    'packetInput',
  ], 'Frontier application-checkpoint root input');
  const runner =
    preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3(
      record.applicationRunnerInput as Readonly<
        SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3
      >,
    );
  const checkpointAdmission = preflightCheckpointAdmission(
    record.checkpointAdmission as Readonly<
      SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
    >,
  );
  return Object.freeze({
    ergoAdmissionSigner: record.ergoAdmissionSigner as Readonly<
      SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
    >,
    packetInput: record.packetInput as Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketV1Input
    >,
    mintSourceProofInput: record.mintSourceProofInput as Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input
    >,
    applicationRunnerInput: runner,
    checkpointAdmission,
  });
}

function preflightApplicationInput(
  input: Readonly<
    ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
  >,
): Readonly<
  ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
> {
  const record = exactOwnDataRecord(input, [
    'applicationRunnerInput',
    'mintSourceProofInput',
  ], 'Frontier application-checkpoint execution input');
  return Object.freeze({
    mintSourceProofInput: record.mintSourceProofInput as Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input
    >,
    applicationRunnerInput:
      preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3(
        record.applicationRunnerInput as Readonly<
          SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3
        >,
      ),
  });
}

function preflightCheckpointAdmission(
  input: Readonly<SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3> {
  const checkpointAdmission = exactOwnDataRecord(input, [
    'expiresAtErgoHeight',
    'validFromErgoHeight',
  ], 'Frontier application-checkpoint admission input');
  return Object.freeze({
    validFromErgoHeight:
      checkpointAdmission.validFromErgoHeight as string | number | bigint,
    expiresAtErgoHeight:
      checkpointAdmission.expiresAtErgoHeight as string | number | bigint,
  });
}

function preflightCompletionInput(
  input: Readonly<
    CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
  >,
): Readonly<
  CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
> {
  const record = exactOwnDataRecord(input, [
    'applicationRunnerInput',
    'checkpointAdmission',
    'mintSourceProofInput',
  ], 'Frontier application-checkpoint continuation input');
  const checkpointAdmission = preflightCheckpointAdmission(
    record.checkpointAdmission as Readonly<
      SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
    >,
  );
  return Object.freeze({
    mintSourceProofInput: record.mintSourceProofInput as Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input
    >,
    applicationRunnerInput: record.applicationRunnerInput as Readonly<
      SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3
    >,
    checkpointAdmission,
  });
}

function exactOwnDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an own data property`);
    }
  }
  const actualKeys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length
    || actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function unprefixedHex(value: string): string {
  return value.toLowerCase().replace(/^0x/u, '');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
