import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import type {
  CollectSubstrateFederatedAuthoritySafeDevnetHistoryV1Input,
  SubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from './substrate-federated-authority-safe-devnet-history-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import type {
  ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  SubstrateFederatedIsolatedDevnetPacketSessionV1,
  SubstrateFederatedIsolatedDevnetPacketV1,
} from './substrate-federated-isolated-devnet-packet-producer-v1.js';
import type {
  ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input,
} from './substrate-federated-isolated-devnet-relayer-artifacts-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardInputDiscoveryV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';

const FEDERATION_EPOCH = '1';
const MAX_ADMISSION_VALIDITY_BLOCKS = '64';

export interface RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input {
  readonly sourceHistory:
    Readonly<CollectSubstrateFederatedAuthoritySafeDevnetHistoryV1Input>;
  readonly relayerArtifacts:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input>;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1 {
  readonly miningTargetPublicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly rewardInputErgoTrees: Readonly<{
    readonly delay1: string;
    readonly delay720: string;
  }>;
  readonly networkPrefix: 16;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
}

export interface SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly miningStopped: true;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly miningStoppedBeforeAction: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeSessionV1 {
  readonly startMining: () => Promise<void>;
  readonly withMiningStoppedReadOnlyTarget: <T>(
    action: (
      target: Readonly<
        SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1
      >,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1>;
  }>>;
  readonly stop: () => Promise<void>;
}

type SubstrateFederatedIsolatedDevnetSetupCheckOnlySessionV2 = Pick<
  SubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  'signer' | 'dispose' | 'run'
>;

export interface SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports {
  readonly createSetupSession: () => Promise<
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckOnlySessionV2>
  >;
  readonly createPacketSession: (
    signer: Readonly<
      SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
    >,
  ) => Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>;
  /** Creates an inert owner before any process can start. */
  readonly createErgoNodeSession: (
    binding: Readonly<
      SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1
    >,
  ) => Readonly<SubstrateFederatedIsolatedDevnetErgoNodeSessionV1>;
  readonly collectSourceHistory: (
    input: Readonly<
      CollectSubstrateFederatedAuthoritySafeDevnetHistoryV1Input
    >,
  ) => Promise<Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1>>;
  readonly discoverRewardInputs: (
    signer: Readonly<
      SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
    >,
  ) => Promise<Readonly<SubstrateFederatedRewardInputDiscoveryV1>>;
  readonly collectErgoHistory: (
    discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV1>,
  ) => Promise<
    Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1>
  >;
}

export interface SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1 {
  readonly profilePins:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']>;
  readonly ergoNodeExecution:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1>;
  readonly packet:
    Readonly<SubstrateFederatedIsolatedDevnetPacketV1['receipt']>;
  readonly setupCheck:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly boundaries: Readonly<{
    readonly processFreeLifecycleOrderingOnly: true;
    readonly staticRuntimePortsBound: false;
    readonly nodeExecutableIdentityAuthenticated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  }>;
}

/**
 * Joins the G1dI3 capability order without claiming runtime provenance. A
 * later statically wired composition root must authenticate the concrete port,
 * node/build identity and retained receipt before this can become evidence.
 */
export async function runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>,
  ports: Readonly<SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1>> {
  let setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckOnlySessionV2> | undefined;
  let packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1> | undefined;
  let nodeSession:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeSessionV1> | undefined;
  let result:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1> | undefined;
  let failure: unknown;

  try {
    setupSession = await ports.createSetupSession();
    packetSession = ports.createPacketSession(setupSession.signer);
    assertPacketErgoSignerMatchesSetup(
      packetSession,
      setupSession.signer,
    );
    const profilePins = deriveExpectedProfilePins(packetSession);
    nodeSession = ports.createErgoNodeSession(
      nodeLaunchBinding(setupSession.signer),
    );
    await nodeSession.startMining();
    const managed = await nodeSession.withMiningStoppedReadOnlyTarget(
      async targetInput => {
        const target = exactReadOnlyErgoTarget(targetInput);
        const sourceHistory = await ports.collectSourceHistory(
          input.sourceHistory,
        );
        const rewardInputs = await ports.discoverRewardInputs(
          setupSession!.signer,
        );
        const ergoHistory = await ports.collectErgoHistory(rewardInputs);
        const packet = await packetSession!.produce({
          sourceHistory,
          ergoHistory,
          expectedProfilePins: profilePins,
          relayerArtifacts: input.relayerArtifacts,
        });
        const setupCheck = await setupSession!.run({
          portableReplayInput: packet.portableReplayInput,
          primaryNodeOrigin: target.primaryNodeOrigin,
          witnessNodeOrigin: target.witnessNodeOrigin,
        });
        return Object.freeze({ packet, setupCheck });
      },
    );
    const ergoNodeExecution = exactErgoNodeExecutionReceipt(managed.receipt);
    result = Object.freeze({
      profilePins,
      ergoNodeExecution,
      packet: managed.value.packet.receipt,
      setupCheck: managed.value.setupCheck,
      boundaries: Object.freeze({
        processFreeLifecycleOrderingOnly: true as const,
        staticRuntimePortsBound: false as const,
        nodeExecutableIdentityAuthenticated: false as const,
        targetNodeAcceptanceEstablished: false as const,
        submissionAuthorized: false as const,
        broadcastAuthorized: false as const,
        fundsAuthorityEstablished: false as const,
        gate5Closed: false as const,
      }),
    });
  } catch (error) {
    failure = error;
  }

  const teardownErrors: unknown[] = [];
  disposeSession(packetSession, 'packet session', teardownErrors);
  disposeSession(setupSession, 'setup-check session', teardownErrors);
  if (nodeSession !== undefined) {
    try {
      await nodeSession.stop();
    } catch (error) {
      teardownErrors.push(new Error('Ergo node teardown failed', {
        cause: error,
      }));
    }
  }

  if (failure !== undefined) {
    if (teardownErrors.length > 0) {
      throw new AggregateError(
        [failure, ...teardownErrors],
        'isolated-devnet bootstrap failed and teardown was incomplete',
      );
    }
    throw failure;
  }
  if (teardownErrors.length > 0) {
    throw new AggregateError(
      teardownErrors,
      'isolated-devnet bootstrap teardown was incomplete',
    );
  }
  if (result === undefined) {
    throw new Error('isolated-devnet bootstrap produced no result');
  }
  return result;
}

function deriveExpectedProfilePins(
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
): Readonly<
  ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']
> {
  const signer = packetSession.signer;
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: FEDERATION_EPOCH,
    maxAdmissionValidityBlocks: MAX_ADMISSION_VALIDITY_BLOCKS,
    sourceAttestationThreshold: signer.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      signer.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: signer.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: signer.ergoAdmissionPublicKeysHex,
  });
  return Object.freeze({
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
  });
}

function assertPacketErgoSignerMatchesSetup(
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
  setupSigner: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >,
): void {
  const packetSigner = packetSession.signer;
  if (
    packetSigner.ergoAdmissionThreshold !== 1
    || packetSigner.ergoAdmissionPublicKeysHex.length !== 1
    || packetSigner.ergoAdmissionPublicKeysHex[0]
      !== setupSigner.publicKeyHex
  ) {
    throw new Error(
      'isolated packet Ergo-admission signer differs from the setup signer',
    );
  }
}

function nodeLaunchBinding(
  signer: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1> {
  return Object.freeze({
    miningTargetPublicKeyHex: signer.publicKeyHex,
    p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
    rewardInputErgoTrees: Object.freeze({
      delay1: signer.rewardInputErgoTrees.delay1,
      delay720: signer.rewardInputErgoTrees.delay720,
    }),
    networkPrefix: signer.networkPrefix,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  });
}

function exactReadOnlyErgoTarget(
  value: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1> {
  if (
    value.primaryNodeOrigin !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || value.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || value.miningStopped !== true
  ) {
    throw new Error(
      'isolated-devnet Ergo nodes did not enter the fixed non-mining target',
    );
  }
  return Object.freeze({
    primaryNodeOrigin: value.primaryNodeOrigin,
    witnessNodeOrigin: value.witnessNodeOrigin,
    miningStopped: true,
  });
}

function exactErgoNodeExecutionReceipt(
  value: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1> {
  if (
    value.primaryNodeOrigin !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || value.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || value.miningStoppedBeforeAction !== true
  ) {
    throw new Error(
      'isolated-devnet Ergo node execution receipt differs from the fixed non-mining target',
    );
  }
  return Object.freeze({
    primaryNodeOrigin: value.primaryNodeOrigin,
    witnessNodeOrigin: value.witnessNodeOrigin,
    miningStoppedBeforeAction: true,
    buildIdentityDigestHex: digest(
      value.buildIdentityDigestHex,
      'Ergo node build identity',
    ),
    executableIdentityDigestHex: digest(
      value.executableIdentityDigestHex,
      'Ergo node executable identity',
    ),
    processBindingDigestHex: digest(
      value.processBindingDigestHex,
      'Ergo node process binding',
    ),
  });
}

function digest(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} digest must be 32-byte lowercase hexadecimal`);
  }
  return value;
}

function disposeSession(
  session: Readonly<{ readonly dispose: () => void }> | undefined,
  label: string,
  errors: unknown[],
): void {
  if (session === undefined) return;
  try {
    session.dispose();
  } catch (error) {
    errors.push(new Error(`${label} teardown failed`, { cause: error }));
  }
}
