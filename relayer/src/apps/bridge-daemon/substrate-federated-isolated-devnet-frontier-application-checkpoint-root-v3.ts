import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  assertFrontierLabApplicationOwnerClaimV1,
  disposeFrontierLabApplicationOwnerV1,
  type FrontierLabApplicationOwnerV1,
} from '../../adapters/frontier-lab-application-owner-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance,
  createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3,
  createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV4,
  type ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  type SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3,
  type SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2,
  type SubstrateFederatedIsolatedDevnetPacketSignerBindingV1,
  type SubstrateFederatedIsolatedDevnetPacketV2,
  type SubstrateFederatedIsolatedDevnetPacketV3,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance,
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance,
  preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_RUNNER_COMPLETION_BUDGET_MS_V1,
  type RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2Input,
  type SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2,
  type SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3,
} from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance,
} from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import {
  signFrontierLabProofBoundApplicationV1,
  signFrontierLabProofBoundApplicationV2,
} from './frontier-lab-proof-bound-application-signing-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-application-checkpoint-root.v3' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V4_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-application-checkpoint-root.v4' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_EXECUTION_BUDGET_MS_V3 =
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_RUNNER_COMPLETION_BUDGET_MS_V1;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3';
const RECEIPT_V4_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V4';

type ApplicationPacket = Readonly<
  SubstrateFederatedIsolatedDevnetPacketV2 | SubstrateFederatedIsolatedDevnetPacketV3
>;

type ApplicationRunnerReceipt = Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2
  | SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3
>;

interface RetainedApplicationOwner {
  readonly owner: Readonly<FrontierLabApplicationOwnerV1>;
  readonly requestSha256Hex: string;
  readonly ergoAdmissionSigner: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>;
  readonly ergoRecipientPublicKeyHex: string;
}

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
  readonly applicationRunner: ApplicationRunnerReceipt;
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

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4
  extends Omit<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3,
    'schema' | 'version' | 'packet'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V4_SCHEMA;
  readonly version: 4;
  readonly packet: Readonly<{ readonly receipt: Readonly<SubstrateFederatedIsolatedDevnetPacketV3['receipt']> }>;
}

type RootReceipt = Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  | SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4
>;

interface RootMaterial {
  readonly version: 3 | 4;
  readonly packet:
    ApplicationPacket;
  readonly mintSourceProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly applicationRunner: ApplicationRunnerReceipt;
  readonly checkpoint:
    Readonly<SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3>;
}

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3 {
  readonly packet:
    Readonly<SubstrateFederatedIsolatedDevnetPacketV2>;
  readonly mintSourceProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly applicationRunner: ApplicationRunnerReceipt;
}

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV4
  extends Omit<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3, 'packet'> {
  readonly packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV3>;
}

type ApplicationStage = Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3
  | SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV4
>;

const RECEIPTS = new WeakMap<object, Readonly<RootMaterial>>();

interface CheckpointAttestationInputV3 {
  readonly sourceNativeBlockHeight: string | number | bigint;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly admissionValidFromErgoHeight: string | number | bigint;
  readonly admissionExpiresAtErgoHeight: string | number | bigint;
}

interface PacketCheckpointContinuation<Packet extends ApplicationPacket = ApplicationPacket> {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>;
  readonly produce: (
    input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
  ) => Promise<Packet>;
  readonly produceMintSourceProof: (
    packet: Packet,
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input
    >,
  ) => Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >;
  readonly produceCheckpointAttestation: (
    packet: Packet,
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
  readonly produce: PacketCheckpointContinuation<Readonly<SubstrateFederatedIsolatedDevnetPacketV2>>['produce'];
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

export interface SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4 {
  readonly signer: Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>;
  readonly produce: PacketCheckpointContinuation<Readonly<SubstrateFederatedIsolatedDevnetPacketV3>>['produce'];
  readonly executeApplication: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV3>,
    input: Readonly<ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input>,
    completionDeadline?: number,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV4>>;
  readonly attestCheckpoint: (
    application: Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV4>,
    checkpointAdmission: Readonly<SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3>,
  ) => Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4>;
  readonly complete: (
    packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV3>,
    input: Readonly<CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input>,
    completionDeadline?: number,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4>>;
  readonly dispose: () => void;
}

type ApplicationOwnerInput = Readonly<{
  readonly owner: Readonly<FrontierLabApplicationOwnerV1>;
  readonly requestSha256Hex: string;
}>;

export function createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
  ergoAdmissionSigner: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >,
  applicationOwner?: ApplicationOwnerInput,
): Readonly<
  SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3
> {
  return createApplicationCheckpointContinuation(ergoAdmissionSigner, applicationOwner, 3) as
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3>;
}

export function createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4(
  ergoAdmissionSigner: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
  applicationOwner: ApplicationOwnerInput,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4> {
  if (applicationOwner === undefined) {
    throw new Error('Frontier V4 application requires fresh owner custody');
  }
  return createApplicationCheckpointContinuation(ergoAdmissionSigner, applicationOwner, 4) as
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4>;
}

function createApplicationCheckpointContinuation(
  ergoAdmissionSigner: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
  applicationOwner: ApplicationOwnerInput | undefined,
  version: 3 | 4,
) {
  const owner = applicationOwner?.owner;
  const requestSha256Hex = applicationOwner?.requestSha256Hex;
  if (applicationOwner !== undefined) {
    assertFrontierLabApplicationOwnerClaimV1(owner!, requestSha256Hex!);
  }
  const continuation = ((): Readonly<PacketCheckpointContinuation> => {
    try {
      if (owner !== undefined) {
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(ergoAdmissionSigner);
      }
      const session = version === 4
        ? createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV4(ergoAdmissionSigner)
        : createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3(ergoAdmissionSigner);
      if (owner !== undefined
        && !session.signer.ergoAdmissionPublicKeysHex.includes(ergoAdmissionSigner.publicKeyHex)) {
        session.dispose();
        throw new Error('Frontier application recipient differs from the packet Ergo-admission signer');
      }
      // Only the matching private producer is selected; packet guards below
      // and inside that session retain the narrower version at every use.
      return session as Readonly<PacketCheckpointContinuation>;
    } catch (error) {
      if (owner !== undefined) disposeFrontierLabApplicationOwnerV1(owner);
      throw error;
    }
  })();
  const retainedOwner: Readonly<RetainedApplicationOwner> | undefined = owner === undefined
    ? undefined : Object.freeze({
      owner, requestSha256Hex: requestSha256Hex!, ergoAdmissionSigner,
      ergoRecipientPublicKeyHex: `0x${ergoAdmissionSigner.publicKeyHex}`,
    });
  let state:
    | 'fresh'
    | 'packet_running'
    | 'packet_ready'
    | 'application_running'
    | 'application_ready'
    | 'checkpoint_running'
    | 'closed' = 'fresh';
  let completedPacket:
    ApplicationPacket | undefined;
  let completedApplication:
    ApplicationStage | undefined;

  const close = (): void => {
    completedPacket = undefined;
    completedApplication = undefined;
    state = 'closed';
    try { continuation.dispose(); }
    finally { if (owner !== undefined) disposeFrontierLabApplicationOwnerV1(owner); }
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
      assertPacketVersion(packet, version);
      if (owner !== undefined) assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex!);
      completedPacket = packet;
      state = 'packet_ready';
      return packet;
    } catch (error) {
      close();
      throw error;
    }
  };
  const executeApplication = async (
    packet: ApplicationPacket,
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
        version,
        retainedOwner,
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
    application: ApplicationStage,
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
        version,
      );
    } finally {
      close();
    }
  };
  const complete = async (
    packet: ApplicationPacket,
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
  continuation: Readonly<PacketCheckpointContinuation>,
  packet: ApplicationPacket,
  plan: Readonly<
    ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input
  >,
  completionDeadline: number | undefined,
  version: 3 | 4,
  applicationOwner?: Readonly<RetainedApplicationOwner>,
): Promise<ApplicationStage> {
  assertPacketVersion(packet, version);
  if (applicationOwner !== undefined) {
    assertFrontierLabApplicationOwnerClaimV1(applicationOwner.owner, applicationOwner.requestSha256Hex);
  }
  const mintSourceProof = continuation.produceMintSourceProof(
    packet,
    plan.mintSourceProofInput,
  );
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  if (mintSourceProof.packetReceiptDigestHex !== packet.receipt.receiptDigestHex
    || mintSourceProof.targetDescriptorDigestHex !== packet.receipt.targetDescriptorDigestHex
    || mintSourceProof.sourceProofReceiptDigestHex !== mintSourceProof.sourceProof.receiptDigestHex
    || mintSourceProof.sourceProof.targetDescriptorDigestHex !== packet.receipt.targetDescriptorDigestHex) {
    throw new Error('Frontier application mint proof differs from the retained packet or target');
  }
  let applicationRunner: ApplicationRunnerReceipt;
  if (applicationOwner !== undefined) {
    assertApplicationRecipientBinding(applicationOwner);
    const expectedOwnerAddressHex = applicationOwner.owner.ownerAddressHex;
    const signedTransactions = version === 4
      ? await signApplicationV4(packet, mintSourceProof, applicationOwner)
      : await signApplicationV3(packet, mintSourceProof, applicationOwner);
    // Signing consumes owner custody. Revalidate the remaining campaign proof
    // and recipient bindings before starting the bounded Rust execution.
    assertApplicationRecipientBinding(applicationOwner);
    assertPacketVersion(packet, version);
    assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(mintSourceProof);
    applicationRunner = await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3({
      ...plan.applicationRunnerInput,
      mintSourceProofReceipt: mintSourceProof.sourceProof,
      ergoRecipientPublicKeyHex: applicationOwner.ergoRecipientPublicKeyHex,
      signedTransactions,
    }, capApplicationRunnerCompletionDeadline(completionDeadline));
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance(applicationRunner);
    if (applicationRunner.signedApplication.ownerAddressHex !== expectedOwnerAddressHex
      || applicationRunner.signedApplication.ergoRecipientPublicKeyHex !== applicationOwner.ergoRecipientPublicKeyHex) {
      throw new Error('Frontier signed runner differs from the retained owner or campaign recipient');
    }
  } else {
    applicationRunner = await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2(
      {
        ...plan.applicationRunnerInput,
        mintSourceProofReceipt: mintSourceProof.sourceProof,
      },
      capApplicationRunnerCompletionDeadline(completionDeadline),
    );
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(applicationRunner);
  }
  assertPacketVersion(packet, version);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  assertMintAndRunnerBinding(packet, mintSourceProof, applicationRunner);

  return deepFreeze({
    packet,
    mintSourceProof,
    applicationRunner,
  }) as ApplicationStage;
}

function signApplicationV3(
  packet: ApplicationPacket,
  proof: Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>,
  owner: Readonly<RetainedApplicationOwner>,
) {
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
  return signFrontierLabProofBoundApplicationV1(owner.owner, owner.requestSha256Hex,
    packet, proof, owner.ergoRecipientPublicKeyHex);
}

function signApplicationV4(
  packet: ApplicationPacket,
  proof: Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>,
  owner: Readonly<RetainedApplicationOwner>,
) {
  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance(packet);
  return signFrontierLabProofBoundApplicationV2(owner.owner, owner.requestSha256Hex,
    packet, proof, owner.ergoRecipientPublicKeyHex);
}

function assertPacketVersion(value: unknown, version: 3 | 4): asserts value is ApplicationPacket {
  if (version === 4) assertSubstrateFederatedIsolatedDevnetPacketV3Provenance(value);
  else assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(value);
}

function assertApplicationRecipientBinding(owner: Readonly<RetainedApplicationOwner>): void {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(owner.ergoAdmissionSigner);
  if (`0x${owner.ergoAdmissionSigner.publicKeyHex}` !== owner.ergoRecipientPublicKeyHex) {
    throw new Error('Frontier application campaign recipient binding changed');
  }
}

function assertApplicationRunnerProvenance(receipt: ApplicationRunnerReceipt): void {
  if (receipt.version === 3) {
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance(receipt);
  } else if (receipt.version === 2) {
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(receipt);
  } else {
    throw new Error('Frontier application runner version is not supported');
  }
}

function capApplicationRunnerCompletionDeadline(
  completionDeadline: number | undefined,
): number | undefined {
  if (completionDeadline === undefined) return undefined;
  return Math.min(
    completionDeadline,
    performance.now()
      + SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_EXECUTION_BUDGET_MS_V3,
  );
}

function attestApplicationCheckpointContinuation(
  continuation: Readonly<PacketCheckpointContinuation>,
  application: ApplicationStage,
  checkpointAdmission: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3
  >,
  version: 3 | 4,
): RootReceipt {
  const { packet, mintSourceProof, applicationRunner } = application;
  assertPacketVersion(packet, version);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    mintSourceProof,
  );
  assertApplicationRunnerProvenance(applicationRunner);
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
    schema: version === 4
      ? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V4_SCHEMA
      : SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA,
    version,
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
    receiptDigestHex: sha256CanonicalJson(body, version === 4 ? RECEIPT_V4_DIGEST_DOMAIN : RECEIPT_DIGEST_DOMAIN),
  }) as RootReceipt;
  RECEIPTS.set(receipt, Object.freeze({
    version,
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
  assertRootReceiptVersion(value, 3);
}

export function assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4> {
  assertRootReceiptVersion(value, 4);
}

function assertRootReceiptVersion(value: unknown, version: 3 | 4): asserts value is RootReceipt {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'Frontier application-checkpoint root receipt lacks process provenance',
    );
  }
  const material = RECEIPTS.get(value);
  if (material === undefined || material.version !== version) {
    throw new Error(
      'Frontier application-checkpoint root receipt lacks process provenance',
    );
  }
  const receipt = value as RootReceipt;
  if (
    receipt.packet.receipt !== material.packet.receipt
    || receipt.mintSourceProof !== material.mintSourceProof
    || receipt.applicationRunner !== material.applicationRunner
    || receipt.checkpoint !== material.checkpoint
  ) {
    throw new Error('Frontier application-checkpoint root binding changed');
  }
  assertPacketVersion(material.packet, version);
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    material.mintSourceProof,
  );
  assertApplicationRunnerProvenance(material.applicationRunner);
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
  if (sha256CanonicalJson(body, version === 4 ? RECEIPT_V4_DIGEST_DOMAIN : RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex) {
    throw new Error('Frontier application-checkpoint root receipt changed');
  }
}

function assertMintAndRunnerBinding(
  packet: ApplicationPacket,
  mintSourceProof: Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >,
  applicationRunner: ApplicationRunnerReceipt,
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
  applicationRunner: ApplicationRunnerReceipt,
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
