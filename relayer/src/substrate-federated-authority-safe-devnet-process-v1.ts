import { createHash } from 'node:crypto';
import {
  spawn,
  spawnSync,
  type ChildProcess,
} from 'node:child_process';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import {
  createBoundedFrontierBackingReadClient,
} from './adapters/bounded-frontier-backing-rpc.js';
import {
  assertFrontierBackingReadAgreementNodeIdentityBinding,
  assertFrontierBackingReadAgreementSourcesSealed,
  createFrontierBackingReadAgreementSources,
  observeFrontierBackingReadAgreement,
  sealFrontierBackingReadAgreementSources,
  type FrontierBackingReadAgreementSnapshot,
  type FrontierBackingReadAgreementSources,
  type FrontierBackingReadClient,
} from './adapters/frontier-backing-read-agreement.js';
import { verifyExecutableSha256 } from './native-executable-pin.js';
import { parseStrictJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_PROCESS_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-process.v1' as const;
export const SUBSTRATE_FEDERATED_OWNED_RECOVERY_PROCESS_V1_SCHEMA =
  'e2s.substrate-federated-owned-recovery-process.v1' as const;
export const SUBSTRATE_FEDERATED_OWNED_RECOVERY_LIFECYCLE_V1_SCHEMA =
  'e2s.substrate-federated-owned-recovery-lifecycle.v1' as const;
export const SUBSTRATE_FEDERATED_OWNED_RECOVERY_TIMELINE_V1_SCHEMA =
  'e2s.substrate-federated-owned-recovery-timeline.v1' as const;

const STARTUP_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 2_000;
const STOP_TIMEOUT_MS = 10_000;
const MAX_RPC_RESPONSE_BYTES = 64 * 1024;
const MAX_CHAIN_SPEC_BYTES = 16 * 1024 * 1024;
const RECOVERY_LAG_BLOCKS = 2;
const ACCEPTANCE_PROCESS_RECEIPTS = new WeakSet<object>();
const RECOVERY_PROCESS_RECEIPTS = new WeakSet<object>();
const RECOVERY_RECEIPTS = new WeakSet<object>();
const RECOVERY_TIMELINE_RECEIPTS = new WeakSet<object>();
const RECOVERY_TIMELINE_MATERIALS = new WeakSet<object>();
const PROCESS_ERRORS = new WeakMap<ChildProcess, Error>();

interface ListenerBinding {
  readonly pid: number;
  readonly localAddress: string;
}

export interface OwnedAuthoritySafeDevnetProcessV1Input {
  readonly nodeBinaryPath: string;
  readonly expectedNodeBinarySha256Hex: string;
  readonly chainSpecBytes: Uint8Array;
  readonly expectedChainSpecSha256Hex: string;
  readonly primaryRpcUrl: string;
  readonly witnessRpcUrl: string;
  readonly primaryP2pPort: number;
  readonly witnessP2pPort: number;
  readonly primaryPrometheusPort: number;
  readonly witnessPrometheusPort: number;
}

export interface OwnedAuthoritySafeDevnetProcessV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_PROCESS_V1_SCHEMA;
  readonly version: 1;
  readonly nodeBinarySha256Hex: string;
  readonly chainSpecSha256Hex: string;
  readonly primaryPeerIdSha256Hex: string;
  readonly witnessPeerIdSha256Hex: string;
  readonly processBindingDigestHex: string;
  readonly checks: Readonly<{
    readonly freshArchiveStateUsed: true;
    readonly runningImageIdentityBoundForBothNodes: true;
    readonly chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true;
    readonly rpcP2pAndPrometheusListenersOwnedBySpawnedProcesses: true;
    readonly allListenersBoundToLoopback: true;
    readonly exactMutualPeerIdentityObservedAtActionBoundaries: true;
    readonly exactBinaryRecheckedAfterAction: true;
    readonly bothProcessesStoppedAndListenersReleased: true;
  }>;
}

export interface OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt
  extends Omit<OwnedAuthoritySafeDevnetProcessV1Receipt, 'schema'> {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_OWNED_RECOVERY_PROCESS_V1_SCHEMA;
}

export interface OwnedAuthoritySafeDevnetRecoveryBestTipV1 {
  readonly height: number;
  readonly blockHashHex: string;
}

export interface OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_OWNED_RECOVERY_LIFECYCLE_V1_SCHEMA;
  readonly version: 1;
  readonly processBindingDigestHex: string;
  readonly initialAgreement:
    Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  readonly lagRecovery: Readonly<{
    before: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    primaryWhileWitnessStopped:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    recoveredAgreement:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    lagBlocks: typeof RECOVERY_LAG_BLOCKS;
  }>;
  readonly connectedRestart: Readonly<{
    before: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    after: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    witnessPeerIdentityPreserved: true;
  }>;
  readonly emptyTailReplacement: Readonly<{
    finalizedAnchor: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    commonParent: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    abandonedTip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    replacementAtAbandonedHeight:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    replacementTip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  }>;
  readonly checks: Readonly<{
    exactConnectedBestTipAgreementObserved: true;
    deterministicWitnessLagAndRecoveryObserved: true;
    sameIdentityConnectedWitnessRestartObserved: true;
    transactionPoolEmptyBeforeEveryManualSeal: true;
    executionTransactionsAbsentForEveryCanonicalRecoveryBlock: true;
    manualSealPinnedForRecoveryLifecycle: true;
    grandpaVoterDisabledForRecoveryLifecycle: true;
    unfinalizedEmptyTailReplacementObserved: true;
    noProcessOrTransportCapabilityReturned: true;
  }>;
  readonly boundaries: Readonly<{
    independentAdministrationEstablished: false;
    sourceConsensusAuthenticated: false;
    sourceFinalityAuthenticated: false;
    transactionSubmissionAuthorized: false;
    mintAuthorized: false;
    payoutAuthorized: false;
    fundsAuthorityEstablished: false;
  }>;
}

export interface OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput {
  readonly sidechainIdHex: string;
  readonly expectedChainId: string;
  readonly bridgeAddress: string;
  readonly expectedBridgeCodeHashHex: string;
  readonly expectedSergAddress: string;
  readonly expectedSergCodeHashHex: string;
}

export interface OwnedAuthoritySafeDevnetRecoveryTimelineV1Snapshots {
  readonly initial: Readonly<FrontierBackingReadAgreementSnapshot>;
  readonly lagRecovered: Readonly<FrontierBackingReadAgreementSnapshot>;
  readonly restarted: Readonly<FrontierBackingReadAgreementSnapshot>;
  readonly replacement: Readonly<FrontierBackingReadAgreementSnapshot>;
}

export interface OwnedAuthoritySafeDevnetRecoveryTimelineV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_OWNED_RECOVERY_TIMELINE_V1_SCHEMA;
  readonly version: 1;
  readonly processBindingDigestHex: string;
  readonly lifecycleDigestHex: string;
  readonly sourceIdsHex: readonly [string, string];
  readonly observationAgreementDigestsHex: readonly [
    string,
    string,
    string,
    string,
  ];
  readonly checks: Readonly<{
    fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true;
    deterministicDualSourceDisagreementRejected: true;
    boundedReadSourcesSealedBeforeReturn: true;
    noProcessOrTransportCapabilityReturned: true;
  }>;
  readonly boundaries: Readonly<{
    sameOwnedProcessLifetimeEstablished: true;
    independentAdministrationEstablished: false;
    sourceConsensusAuthenticated: false;
    sourceFinalityAuthenticated: false;
    transactionSubmissionAuthorized: false;
    mintAuthorized: false;
    payoutAuthorized: false;
    fundsAuthorityEstablished: false;
  }>;
}

export interface OwnedAuthoritySafeDevnetRecoveryTimelineV1Material {
  readonly process: Readonly<OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt>;
  readonly lifecycle: Readonly<OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt>;
  readonly sources: FrontierBackingReadAgreementSources;
  readonly snapshots: Readonly<
    OwnedAuthoritySafeDevnetRecoveryTimelineV1Snapshots
  >;
  readonly receipt: Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Receipt>;
}

interface OwnedAuthoritySafeDevnetRecoveryOperationsV1 {
  observeStableAgreement():
    Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>>;
  exerciseDeterministicWitnessLagAndRecovery(): Promise<Readonly<{
    before: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    primaryWhileWitnessStopped:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    recoveredAgreement:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    lagBlocks: typeof RECOVERY_LAG_BLOCKS;
  }>>;
  exerciseConnectedWitnessRestart(): Promise<Readonly<{
    before: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    after: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    witnessPeerIdentityPreserved: true;
  }>>;
  exerciseUnfinalizedEmptyTailReplacement(): Promise<Readonly<{
    finalizedAnchor: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    commonParent: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    abandonedTip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    replacementAtAbandonedHeight:
      Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
    replacementTip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  }>>;
}

interface OwnedAuthoritySafeDevnetInternalOwnerV1 {
  readonly endpoints: Readonly<{
    primaryRpcUrl: string;
    witnessRpcUrl: string;
  }>;
  readonly recovery:
    Readonly<OwnedAuthoritySafeDevnetRecoveryOperationsV1>;
  readonly nodeIdentityDigests: Readonly<{
    primaryPeerIdSha256Hex: string;
    witnessPeerIdSha256Hex: string;
  }>;
}

type OwnedAuthoritySafeDevnetProcessModeV1 =
  | 'acceptance_observation'
  | 'recovery_lifecycle';

interface OwnedAuthoritySafeDevnetRecoveryTimelineV1 {
  readonly initialAgreement:
    Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
  readonly lagRecovery:
    OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt['lagRecovery'];
  readonly connectedRestart:
    OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt['connectedRestart'];
  readonly emptyTailReplacement:
    OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt['emptyTailReplacement'];
}

interface OwnedAuthoritySafeDevnetRecoveryTimelineV1Hooks {
  afterInitial(
    tip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  ): Promise<void>;
  afterLagRecovered(
    tip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  ): Promise<void>;
  afterRestarted(
    tip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  ): Promise<void>;
  afterReplacement(
    tip: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  ): Promise<void>;
}

export async function withOwnedAuthoritySafeDevnetProcessesV1<T>(
  input: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
  action: (endpoints: Readonly<{
    primaryRpcUrl: string;
    witnessRpcUrl: string;
  }>) => Promise<T>,
): Promise<Readonly<{
  value: T;
  receipt: Readonly<OwnedAuthoritySafeDevnetProcessV1Receipt>;
}>> {
  if (typeof action !== 'function') {
    throw new Error('authority-safe owned-process action is required');
  }
  return await withOwnedAuthoritySafeDevnetProcessOwnerV1(
    input,
    owner => action(owner.endpoints),
    'acceptance_observation',
  );
}

export async function exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(
  input: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
): Promise<Readonly<{
  process: Readonly<OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt>;
  lifecycle: Readonly<OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt>;
}>> {
  const owned = await withOwnedAuthoritySafeDevnetProcessOwnerV1(
    input,
    owner => collectOwnedAuthoritySafeDevnetRecoveryTimelineV1(owner),
    'recovery_lifecycle',
  );
  const lifecycle = createOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(
    owned.receipt.processBindingDigestHex,
    owned.value,
  );
  return Object.freeze({ process: owned.receipt, lifecycle });
}

export async function captureOwnedAuthoritySafeDevnetRecoveryTimelineV1(
  input: Readonly<{
    process: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>;
    observation:
      Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput>;
  }>,
): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Material>> {
  const owned = await withOwnedAuthoritySafeDevnetProcessOwnerV1(
    input.process,
    async owner => {
      const primaryClient = createBoundedFrontierBackingReadClient(
        owner.endpoints.primaryRpcUrl,
        input.observation.bridgeAddress,
      );
      const witnessClient = createBoundedFrontierBackingReadClient(
        owner.endpoints.witnessRpcUrl,
        input.observation.bridgeAddress,
      );
      const administrationIdentityDigests = processLocalAdministrationDigests(
        owner.nodeIdentityDigests,
      );
      const sourceInput = {
        primaryRpcUrl: owner.endpoints.primaryRpcUrl,
        primaryNodeIdentityDigestHex:
          owner.nodeIdentityDigests.primaryPeerIdSha256Hex,
        primaryAdministrationIdentityDigestHex:
          administrationIdentityDigests.primary,
        witnessRpcUrl: owner.endpoints.witnessRpcUrl,
        witnessNodeIdentityDigestHex:
          owner.nodeIdentityDigests.witnessPeerIdSha256Hex,
        witnessAdministrationIdentityDigestHex:
          administrationIdentityDigests.witness,
        expectedChainId: input.observation.expectedChainId,
        expectedBridgeAddress: input.observation.bridgeAddress,
        expectedBridgeCodeHashHex:
          input.observation.expectedBridgeCodeHashHex,
        expectedSergAddress: input.observation.expectedSergAddress,
        expectedSergCodeHashHex: input.observation.expectedSergCodeHashHex,
      } as const;
      const sources = createFrontierBackingReadAgreementSources({
        ...sourceInput,
        primaryClient,
        witnessClient,
      });
      const disagreementSources = createFrontierBackingReadAgreementSources({
        ...sourceInput,
        primaryClient,
        witnessClient: supplyDivergingReadClient(witnessClient),
      });
      const snapshots: {
        initial?: Readonly<FrontierBackingReadAgreementSnapshot>;
        lagRecovered?: Readonly<FrontierBackingReadAgreementSnapshot>;
        restarted?: Readonly<FrontierBackingReadAgreementSnapshot>;
        replacement?: Readonly<FrontierBackingReadAgreementSnapshot>;
      } = {};
      const observe = async () => await observeFrontierBackingReadAgreement({
        sources,
        sidechainIdHex: input.observation.sidechainIdHex,
        bridgeAddress: input.observation.bridgeAddress,
      });
      let deterministicDisagreementRejected = false;
      const timeline = await collectOwnedAuthoritySafeDevnetRecoveryTimelineV1(
        owner,
        {
          afterInitial: async tip => {
            snapshots.initial = await observe();
            await assertSnapshotTip(
              snapshots.initial,
              tip,
              'initial',
              owner.endpoints,
            );
            try {
              await observeFrontierBackingReadAgreement({
                sources: disagreementSources,
                sidechainIdHex: input.observation.sidechainIdHex,
                bridgeAddress: input.observation.bridgeAddress,
              });
            } catch (error) {
              if (
                error instanceof Error
                && /readers disagree on the pinned burn inventory or supply/i
                  .test(error.message)
              ) {
                deterministicDisagreementRejected = true;
              } else {
                throw error;
              }
            }
            if (!deterministicDisagreementRejected) {
              throw new Error(
                'owned recovery timeline accepted the deterministic reader disagreement',
              );
            }
          },
          afterLagRecovered: async tip => {
            snapshots.lagRecovered = await observe();
            await assertSnapshotTip(
              snapshots.lagRecovered,
              tip,
              'lag-recovered',
              owner.endpoints,
            );
          },
          afterRestarted: async tip => {
            snapshots.restarted = await observe();
            await assertSnapshotTip(
              snapshots.restarted,
              tip,
              'restarted',
              owner.endpoints,
            );
          },
          afterReplacement: async tip => {
            snapshots.replacement = await observe();
            await assertSnapshotTip(
              snapshots.replacement,
              tip,
              'replacement',
              owner.endpoints,
            );
          },
        },
      );
      const completeSnapshots = completeRecoveryTimelineSnapshots(snapshots);
      sealFrontierBackingReadAgreementSources(sources);
      sealFrontierBackingReadAgreementSources(disagreementSources);
      assertFrontierBackingReadAgreementSourcesSealed(sources);
      assertFrontierBackingReadAgreementSourcesSealed(disagreementSources);
      return Object.freeze({
        timeline,
        sources,
        snapshots: completeSnapshots,
        deterministicDisagreementRejected,
      });
    },
    'recovery_lifecycle',
  );
  const lifecycle = createOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(
    owned.receipt.processBindingDigestHex,
    owned.value.timeline,
  );
  const lifecycleDigestHex = sha256Canonical(lifecycle);
  assertFrontierBackingReadAgreementNodeIdentityBinding(owned.value.sources, {
    primaryNodeIdentityDigestHex: owned.receipt.primaryPeerIdSha256Hex,
    witnessNodeIdentityDigestHex: owned.receipt.witnessPeerIdSha256Hex,
  });
  const observationAgreementDigestsHex = Object.freeze([
    owned.value.snapshots.initial.agreementDigestHex,
    owned.value.snapshots.lagRecovered.agreementDigestHex,
    owned.value.snapshots.restarted.agreementDigestHex,
    owned.value.snapshots.replacement.agreementDigestHex,
  ]) as readonly [string, string, string, string];
  const receipt = deepFreeze({
    schema: SUBSTRATE_FEDERATED_OWNED_RECOVERY_TIMELINE_V1_SCHEMA,
    version: 1 as const,
    processBindingDigestHex: owned.receipt.processBindingDigestHex,
    lifecycleDigestHex,
    sourceIdsHex: owned.value.sources.sourceIdsHex,
    observationAgreementDigestsHex,
    checks: {
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true as const,
      deterministicDualSourceDisagreementRejected: true as const,
      boundedReadSourcesSealedBeforeReturn: true as const,
      noProcessOrTransportCapabilityReturned: true as const,
    },
    boundaries: {
      sameOwnedProcessLifetimeEstablished: true as const,
      independentAdministrationEstablished: false as const,
      sourceConsensusAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      transactionSubmissionAuthorized: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
  RECOVERY_TIMELINE_RECEIPTS.add(receipt);
  const material = Object.freeze({
    process: owned.receipt,
    lifecycle,
    sources: owned.value.sources,
    snapshots: owned.value.snapshots,
    receipt,
  });
  RECOVERY_TIMELINE_MATERIALS.add(material);
  return material;
}

function createOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(
  processBindingDigestHex: string,
  timeline: Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1>,
): Readonly<OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt> {
  const lifecycle = deepFreeze({
    schema: SUBSTRATE_FEDERATED_OWNED_RECOVERY_LIFECYCLE_V1_SCHEMA,
    version: 1 as const,
    processBindingDigestHex,
    initialAgreement: timeline.initialAgreement,
    lagRecovery: timeline.lagRecovery,
    connectedRestart: timeline.connectedRestart,
    emptyTailReplacement: timeline.emptyTailReplacement,
    checks: {
      exactConnectedBestTipAgreementObserved: true as const,
      deterministicWitnessLagAndRecoveryObserved: true as const,
      sameIdentityConnectedWitnessRestartObserved: true as const,
      transactionPoolEmptyBeforeEveryManualSeal: true as const,
      executionTransactionsAbsentForEveryCanonicalRecoveryBlock: true as const,
      manualSealPinnedForRecoveryLifecycle: true as const,
      grandpaVoterDisabledForRecoveryLifecycle: true as const,
      unfinalizedEmptyTailReplacementObserved: true as const,
      noProcessOrTransportCapabilityReturned: true as const,
    },
    boundaries: {
      independentAdministrationEstablished: false as const,
      sourceConsensusAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      transactionSubmissionAuthorized: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
  RECOVERY_RECEIPTS.add(lifecycle);
  return lifecycle;
}

export function assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(
  value: unknown,
): asserts value is OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt {
  if (typeof value !== 'object' || value === null || !RECOVERY_RECEIPTS.has(value)) {
    throw new Error('owned recovery lifecycle receipt provenance is missing');
  }
}

export function assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material(
  value: unknown,
): asserts value is OwnedAuthoritySafeDevnetRecoveryTimelineV1Material {
  if (
    typeof value !== 'object'
    || value === null
    || !RECOVERY_TIMELINE_MATERIALS.has(value)
  ) {
    throw new Error('owned recovery timeline material provenance is missing');
  }
  const material = value as OwnedAuthoritySafeDevnetRecoveryTimelineV1Material;
  if (!RECOVERY_TIMELINE_RECEIPTS.has(material.receipt)) {
    throw new Error('owned recovery timeline receipt provenance is missing');
  }
  assertFrontierBackingReadAgreementSourcesSealed(material.sources);
}

async function collectOwnedAuthoritySafeDevnetRecoveryTimelineV1(
  owner: Readonly<OwnedAuthoritySafeDevnetInternalOwnerV1>,
  hooks?: Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Hooks>,
): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1>> {
  const initialAgreement = await owner.recovery.observeStableAgreement();
  await hooks?.afterInitial(initialAgreement);
  const lagRecovery =
    await owner.recovery.exerciseDeterministicWitnessLagAndRecovery();
  await hooks?.afterLagRecovered(lagRecovery.recoveredAgreement);
  const connectedRestart =
    await owner.recovery.exerciseConnectedWitnessRestart();
  await hooks?.afterRestarted(connectedRestart.after);
  const emptyTailReplacement =
    await owner.recovery.exerciseUnfinalizedEmptyTailReplacement();
  await hooks?.afterReplacement(emptyTailReplacement.replacementTip);
  return deepFreeze({
    initialAgreement,
    lagRecovery,
    connectedRestart,
    emptyTailReplacement,
  });
}

function processLocalAdministrationDigests(
  nodeIdentityDigests:
    Readonly<OwnedAuthoritySafeDevnetInternalOwnerV1['nodeIdentityDigests']>,
): Readonly<{ primary: string; witness: string }> {
  const identity = (role: 'primary' | 'witness', nodeIdentityDigestHex: string) =>
    sha256Canonical({
      schema: 'e2s.substrate-federated-process-local-custody-slot.v1',
      role,
      nodeIdentityDigestHex,
    });
  return Object.freeze({
    primary: identity(
      'primary',
      nodeIdentityDigests.primaryPeerIdSha256Hex,
    ),
    witness: identity(
      'witness',
      nodeIdentityDigests.witnessPeerIdSha256Hex,
    ),
  });
}

function supplyDivergingReadClient(
  source: FrontierBackingReadClient,
): FrontierBackingReadClient {
  return Object.freeze({
    getCurrentBlockNumber: () => source.getCurrentBlockNumber(),
    getBlock: (blockNumber: number) => source.getBlock(blockNumber),
    scanForPegOuts: (fromBlock: number, toBlock: number) =>
      source.scanForPegOuts(fromBlock, toBlock),
    getTransactionReceipt: (transactionHash: string) =>
      source.getTransactionReceipt(transactionHash),
    getTotalSERGSupplyAtBlockHash: async (blockHashHex: string) =>
      (await source.getTotalSERGSupplyAtBlockHash(blockHashHex)) + 1n,
    getRuntimeIdentityAtBlockHash: (blockHashHex: string) =>
      source.getRuntimeIdentityAtBlockHash(blockHashHex),
  });
}

function completeRecoveryTimelineSnapshots(
  value: Readonly<{
    initial?: Readonly<FrontierBackingReadAgreementSnapshot>;
    lagRecovered?: Readonly<FrontierBackingReadAgreementSnapshot>;
    restarted?: Readonly<FrontierBackingReadAgreementSnapshot>;
    replacement?: Readonly<FrontierBackingReadAgreementSnapshot>;
  }>,
): Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Snapshots> {
  if (
    value.initial === undefined
    || value.lagRecovered === undefined
    || value.restarted === undefined
    || value.replacement === undefined
  ) {
    throw new Error('owned recovery timeline did not capture all four snapshots');
  }
  return Object.freeze({
    initial: value.initial,
    lagRecovered: value.lagRecovered,
    restarted: value.restarted,
    replacement: value.replacement,
  });
}

async function assertSnapshotTip(
  snapshot: Readonly<FrontierBackingReadAgreementSnapshot>,
  expected: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  label: string,
  endpoints: Readonly<{
    primaryRpcUrl: string;
    witnessRpcUrl: string;
  }>,
): Promise<void> {
  if (snapshot.pinnedHeight !== expected.height) {
    throw new Error(`owned recovery ${label} snapshot differs from its lifecycle pin`);
  }
  const [primaryNativeHashHex, witnessNativeHashHex] = await Promise.all([
    rpcHash(
      await rpcRequest(endpoints.primaryRpcUrl, 'chain_getBlockHash', [
        rpcQuantity(snapshot.pinnedHeight),
      ]),
      `owned recovery ${label} primary native block hash`,
    ),
    rpcHash(
      await rpcRequest(endpoints.witnessRpcUrl, 'chain_getBlockHash', [
        rpcQuantity(snapshot.pinnedHeight),
      ]),
      `owned recovery ${label} witness native block hash`,
    ),
  ]);
  if (
    primaryNativeHashHex !== expected.blockHashHex
    || witnessNativeHashHex !== expected.blockHashHex
  ) {
    throw new Error(
      `owned recovery ${label} native block differs from its lifecycle pin`,
    );
  }
}

async function withOwnedAuthoritySafeDevnetProcessOwnerV1<T>(
  input: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
  action: (owner: Readonly<OwnedAuthoritySafeDevnetInternalOwnerV1>) => Promise<T>,
  mode: 'acceptance_observation',
): Promise<Readonly<{
  value: T;
  receipt: Readonly<OwnedAuthoritySafeDevnetProcessV1Receipt>;
}>>;
async function withOwnedAuthoritySafeDevnetProcessOwnerV1<T>(
  input: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
  action: (owner: Readonly<OwnedAuthoritySafeDevnetInternalOwnerV1>) => Promise<T>,
  mode: 'recovery_lifecycle',
): Promise<Readonly<{
  value: T;
  receipt: Readonly<OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt>;
}>>;
async function withOwnedAuthoritySafeDevnetProcessOwnerV1<T>(
  input: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
  action: (owner: Readonly<OwnedAuthoritySafeDevnetInternalOwnerV1>) => Promise<T>,
  mode: OwnedAuthoritySafeDevnetProcessModeV1,
): Promise<Readonly<{
  value: T;
  receipt: Readonly<
    OwnedAuthoritySafeDevnetProcessV1Receipt
    | OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt
  >;
}>> {
  if (process.platform !== 'win32') {
    throw new Error('authority-safe owned-process V1 is supported only on Windows');
  }
  const nodeBinaryPath = canonicalRegularFile(
    input.nodeBinaryPath,
    'authority-safe node binary',
  );
  const nodeBinarySha256Hex = digest(
    input.expectedNodeBinarySha256Hex,
    'authority-safe node binary SHA-256',
  );
  const chainSpecBytes = boundedBytes(
    input.chainSpecBytes,
    MAX_CHAIN_SPEC_BYTES,
    'authority-safe chain spec',
  );
  const chainSpecSha256Hex = digest(
    input.expectedChainSpecSha256Hex,
    'authority-safe chain-spec SHA-256',
  );
  if (sha256(chainSpecBytes) !== chainSpecSha256Hex) {
    throw new Error('authority-safe chain-spec bytes differ from the explicit pin');
  }
  if (mode === 'recovery_lifecycle') {
    assertRecoveryManualSealGenesis(chainSpecBytes);
  }
  const primaryRpc = loopbackRpc(input.primaryRpcUrl, 'primary RPC');
  const witnessRpc = loopbackRpc(input.witnessRpcUrl, 'witness RPC');
  const ports = [
    primaryRpc.port,
    witnessRpc.port,
    port(input.primaryP2pPort, 'primary P2P port'),
    port(input.witnessP2pPort, 'witness P2P port'),
    port(input.primaryPrometheusPort, 'primary Prometheus port'),
    port(input.witnessPrometheusPort, 'witness Prometheus port'),
  ];
  if (new Set(ports).size !== ports.length) {
    throw new Error('authority-safe process ports must be pairwise distinct');
  }
  await verifyExecutableSha256(
    nodeBinaryPath,
    `0x${nodeBinarySha256Hex}`,
    'authority-safe owned-process node binary',
  );
  assertPortsUnowned(ports);
  assertPortsBindable(ports);
  assertPortsUnowned(ports);

  const runtimeDirectory = mkdtempSync(join(tmpdir(), 'e2s-fed6g1c-runtime-'));
  const specPath = join(runtimeDirectory, 'authority-safe.json');
  const primaryBasePath = join(runtimeDirectory, 'primary');
  const witnessBasePath = join(runtimeDirectory, 'witness');
  writeFileSync(specPath, chainSpecBytes, { flag: 'wx', mode: 0o600 });
  assertChainSpecUnchanged(specPath, chainSpecSha256Hex);

  let primary: ChildProcess | undefined;
  let witness: ChildProcess | undefined;
  let actionValue: T | undefined;
  let primaryPeerId = '';
  let witnessPeerId = '';
  let actionCompleted = false;
  let actionError: unknown;
  let cleanupError: Error | undefined;
  const witnessPorts = [
    witnessRpc.port,
    input.witnessP2pPort,
    input.witnessPrometheusPort,
  ] as const;
  const launchWitness = async (requireRetainedIdentity: boolean): Promise<void> => {
    if (witness !== undefined) {
      throw new Error('authority-safe witness process is already running');
    }
    assertPortsUnowned(witnessPorts);
    assertPortsBindable(witnessPorts);
    assertPortsUnowned(witnessPorts);
    const retainedPeerId = witnessPeerId;
    witness = spawnNode(nodeBinaryPath, [
      '--chain', specPath,
      '--base-path', witnessBasePath,
      '--listen-addr', `/ip4/127.0.0.1/tcp/${input.witnessP2pPort}`,
      '--rpc-port', String(witnessRpc.port),
      '--prometheus-port', String(input.witnessPrometheusPort),
      '--no-telemetry',
      '--no-mdns',
      '--rpc-methods', 'unsafe',
      '--state-pruning', 'archive',
      '--blocks-pruning', 'archive',
      '--unsafe-force-node-key-generation',
      ...(mode === 'recovery_lifecycle'
        ? ['--sealing', 'manual', '--no-grandpa']
        : []),
      '--name', 'fed6g1c-witness',
      '--bootnodes',
      `/ip4/127.0.0.1/tcp/${input.primaryP2pPort}/p2p/${primaryPeerId}`,
    ], runtimeDirectory, 'witness');
    const observedPeerId = await waitForPeerId(
      witnessRpc.url,
      witness,
      'witness',
    );
    if (requireRetainedIdentity && observedPeerId !== retainedPeerId) {
      throw new Error('authority-safe witness peer identity changed during restart');
    }
    witnessPeerId = observedPeerId;
    await assertRunningExecutableIdentity(
      witness,
      nodeBinaryPath,
      nodeBinarySha256Hex,
      'witness',
    );
    assertChainSpecUnchanged(specPath, chainSpecSha256Hex);
  };
  const stopWitness = async (): Promise<void> => {
    const current = requiredProcess(witness, 'witness');
    await stopChild(current);
    witness = undefined;
    assertPortsUnowned(witnessPorts);
  };
  const assertConnectedRuntime = async (): Promise<void> => {
    const currentPrimary = requiredProcess(primary, 'primary');
    const currentWitness = requiredProcess(witness, 'witness');
    assertLive(currentPrimary, 'primary');
    assertLive(currentWitness, 'witness');
    await waitForConnectedHealth(primaryRpc.url, currentPrimary, 'primary');
    await waitForConnectedHealth(witnessRpc.url, currentWitness, 'witness');
    await assertExactMutualPeerIdentity({
      primaryUrl: primaryRpc.url,
      primary: currentPrimary,
      primaryPeerId,
      witnessUrl: witnessRpc.url,
      witness: currentWitness,
      witnessPeerId,
    });
    assertListenerOwnership([
      { pid: processId(currentPrimary, 'primary'), ports: [
        primaryRpc.port,
        input.primaryP2pPort,
        input.primaryPrometheusPort,
      ] },
      { pid: processId(currentWitness, 'witness'), ports: witnessPorts },
    ]);
  };
  const startWitness = async (): Promise<void> => {
    assertChainSpecUnchanged(specPath, chainSpecSha256Hex);
    await launchWitness(true);
    await assertConnectedRuntime();
  };
  const restartWitness = async (): Promise<void> => {
    await stopWitness();
    await startWitness();
  };
  try {
    primary = spawnNode(nodeBinaryPath, [
      '--chain', specPath,
      '--base-path', primaryBasePath,
      '--listen-addr', `/ip4/127.0.0.1/tcp/${input.primaryP2pPort}`,
      '--rpc-port', String(primaryRpc.port),
      '--prometheus-port', String(input.primaryPrometheusPort),
      '--no-telemetry',
      '--no-mdns',
      '--rpc-methods', 'unsafe',
      '--state-pruning', 'archive',
      '--blocks-pruning', 'archive',
      '--unsafe-force-node-key-generation',
      ...(mode === 'recovery_lifecycle'
        ? ['--sealing', 'manual', '--no-grandpa']
        : []),
      '--name', 'fed6g1c-primary',
      '--alice',
      '--force-authoring',
    ], runtimeDirectory, 'primary');
    primaryPeerId = await waitForPeerId(primaryRpc.url, primary, 'primary');
    await assertRunningExecutableIdentity(
      primary,
      nodeBinaryPath,
      nodeBinarySha256Hex,
      'primary',
    );
    assertChainSpecUnchanged(specPath, chainSpecSha256Hex);

    await launchWitness(false);
    if (witnessPeerId === primaryPeerId) {
      throw new Error('authority-safe owned nodes must have distinct peer identities');
    }
    await assertConnectedRuntime();

    actionValue = await action(Object.freeze({
      endpoints: Object.freeze({
        primaryRpcUrl: primaryRpc.url,
        witnessRpcUrl: witnessRpc.url,
      }),
      nodeIdentityDigests: Object.freeze({
        primaryPeerIdSha256Hex: sha256(Buffer.from(primaryPeerId, 'utf8')),
        witnessPeerIdSha256Hex: sha256(Buffer.from(witnessPeerId, 'utf8')),
      }),
      recovery: createOwnedAuthoritySafeDevnetRecoveryOperationsV1({
        primaryRpcUrl: primaryRpc.url,
        witnessRpcUrl: witnessRpc.url,
        primary: () => requiredProcess(primary, 'primary'),
        witness: () => requiredProcess(witness, 'witness'),
        stopWitness,
        startWitness,
        restartWitness,
      }),
    }));
    await assertConnectedRuntime();
    const currentPrimary = requiredProcess(primary, 'primary');
    const currentWitness = requiredProcess(witness, 'witness');
    await assertRunningExecutableIdentity(
      currentPrimary,
      nodeBinaryPath,
      nodeBinarySha256Hex,
      'primary',
    );
    await assertRunningExecutableIdentity(
      currentWitness,
      nodeBinaryPath,
      nodeBinarySha256Hex,
      'witness',
    );
    assertChainSpecUnchanged(specPath, chainSpecSha256Hex);
    await verifyExecutableSha256(
      nodeBinaryPath,
      `0x${nodeBinarySha256Hex}`,
      'authority-safe owned-process node binary',
    );
    actionCompleted = true;
  } catch (error) {
    actionError = error;
  } finally {
    const cleanupErrors: Error[] = [];
    for (const child of [witness, primary]) {
      try {
        await stopChild(child);
      } catch (error) {
        cleanupErrors.push(error instanceof Error
          ? error
          : new Error('authority-safe node process cleanup failed'));
      }
    }
    try {
      assertPortsUnowned(ports);
    } catch (error) {
      cleanupErrors.push(error instanceof Error
        ? error
        : new Error('authority-safe listener cleanup failed'));
    }
    try {
      rmSync(runtimeDirectory, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      cleanupErrors.push(error instanceof Error
        ? error
        : new Error('authority-safe runtime-directory cleanup failed'));
    }
    if (cleanupErrors.length > 0) {
      cleanupError = new Error(
        `authority-safe process cleanup failed: ${cleanupErrors
          .map(error => error.message)
          .join('; ')}`,
      );
    }
  }
  if (actionError && cleanupError) {
    throw new AggregateError(
      [asError(actionError, 'authority-safe owned-process action failed'), cleanupError],
      'authority-safe action and process cleanup failed',
    );
  }
  if (cleanupError) throw cleanupError;
  if (actionError) throw actionError;
  if (!actionCompleted || actionValue === undefined) {
    throw new Error('authority-safe owned-process action did not complete');
  }

  const processBinding = Object.freeze({
    nodeBinarySha256Hex,
    chainSpecSha256Hex,
    primaryRpcPort: primaryRpc.port,
    witnessRpcPort: witnessRpc.port,
    primaryP2pPort: input.primaryP2pPort,
    witnessP2pPort: input.witnessP2pPort,
    primaryPrometheusPort: input.primaryPrometheusPort,
    witnessPrometheusPort: input.witnessPrometheusPort,
    primaryP2pListenAddress: `/ip4/127.0.0.1/tcp/${input.primaryP2pPort}`,
    witnessP2pListenAddress: `/ip4/127.0.0.1/tcp/${input.witnessP2pPort}`,
    primaryPeerIdSha256Hex: sha256(Buffer.from(primaryPeerId, 'utf8')),
    witnessPeerIdSha256Hex: sha256(Buffer.from(witnessPeerId, 'utf8')),
    ...(mode === 'recovery_lifecycle'
      ? {
          manualSealPinnedForRecoveryLifecycle: true as const,
          grandpaVoterDisabledForRecoveryLifecycle: true as const,
        }
      : {}),
  });
  const receipt = Object.freeze({
    schema: mode === 'acceptance_observation'
      ? SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_PROCESS_V1_SCHEMA
      : SUBSTRATE_FEDERATED_OWNED_RECOVERY_PROCESS_V1_SCHEMA,
    version: 1 as const,
    nodeBinarySha256Hex,
    chainSpecSha256Hex,
    primaryPeerIdSha256Hex: processBinding.primaryPeerIdSha256Hex,
    witnessPeerIdSha256Hex: processBinding.witnessPeerIdSha256Hex,
    processBindingDigestHex: sha256Canonical(processBinding),
    checks: Object.freeze({
      freshArchiveStateUsed: true as const,
      runningImageIdentityBoundForBothNodes: true as const,
      chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true as const,
      rpcP2pAndPrometheusListenersOwnedBySpawnedProcesses: true as const,
      allListenersBoundToLoopback: true as const,
      exactMutualPeerIdentityObservedAtActionBoundaries: true as const,
      exactBinaryRecheckedAfterAction: true as const,
      bothProcessesStoppedAndListenersReleased: true as const,
    }),
  });
  if (mode === 'acceptance_observation') {
    ACCEPTANCE_PROCESS_RECEIPTS.add(receipt);
  } else {
    RECOVERY_PROCESS_RECEIPTS.add(receipt);
  }
  return Object.freeze({ value: actionValue, receipt });
}

export function assertOwnedAuthoritySafeDevnetProcessV1Receipt(
  value: unknown,
): asserts value is OwnedAuthoritySafeDevnetProcessV1Receipt {
  if (
    typeof value !== 'object'
    || value === null
    || !ACCEPTANCE_PROCESS_RECEIPTS.has(value)
  ) {
    throw new Error('authority-safe owned-process receipt provenance is missing');
  }
}

export function assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt(
  value: unknown,
): asserts value is OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt {
  if (
    typeof value !== 'object'
    || value === null
    || !RECOVERY_PROCESS_RECEIPTS.has(value)
  ) {
    throw new Error('owned recovery process receipt provenance is missing');
  }
}

function createOwnedAuthoritySafeDevnetRecoveryOperationsV1(
  input: Readonly<{
    primaryRpcUrl: string;
    witnessRpcUrl: string;
    primary: () => ChildProcess;
    witness: () => ChildProcess;
    stopWitness: () => Promise<void>;
    startWitness: () => Promise<void>;
    restartWitness: () => Promise<void>;
  }>,
): Readonly<OwnedAuthoritySafeDevnetRecoveryOperationsV1> {
  const observeStableAgreement = async () =>
    await waitForBestTipAgreement({
      primaryRpcUrl: input.primaryRpcUrl,
      witnessRpcUrl: input.witnessRpcUrl,
      primary: input.primary,
      witness: input.witness,
    });

  return Object.freeze({
    observeStableAgreement,
    exerciseDeterministicWitnessLagAndRecovery: async () => {
      const before = await observeStableAgreement();
      await input.stopWitness();
      let primaryWhileWitnessStopped = before;
      for (let index = 0; index < RECOVERY_LAG_BLOCKS; index += 1) {
        primaryWhileWitnessStopped = await createEmptyManualSealBlock({
          rpcUrl: input.primaryRpcUrl,
          child: input.primary(),
          role: 'primary',
          parent: primaryWhileWitnessStopped,
        });
        await waitForExactBestTip(
          input.primaryRpcUrl,
          input.primary,
          'primary',
          primaryWhileWitnessStopped,
        );
        await assertExecutionBlockTransactionFree(
          input.primaryRpcUrl,
          input.primary(),
          'primary',
          primaryWhileWitnessStopped.height,
        );
      }
      await input.startWitness();
      const recoveredAgreement = await waitForBestTipAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
        expected: primaryWhileWitnessStopped,
      });
      if (recoveredAgreement.height !== before.height + RECOVERY_LAG_BLOCKS) {
        throw new Error('authority-safe deterministic witness lag height drifted');
      }
      return deepFreeze({
        before,
        primaryWhileWitnessStopped,
        recoveredAgreement,
        lagBlocks: 2 as const,
      });
    },
    exerciseConnectedWitnessRestart: async () => {
      const before = await observeStableAgreement();
      await input.restartWitness();
      const after = await waitForBestTipAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
        expected: before,
      });
      return deepFreeze({
        before,
        after,
        witnessPeerIdentityPreserved: true as const,
      });
    },
    exerciseUnfinalizedEmptyTailReplacement: async () => {
      const finalizedAnchor = await waitForFinalizedAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
      });
      const commonParent = await observeStableAgreement();
      const abandonedTip = await createEmptyManualSealBlock({
        rpcUrl: input.primaryRpcUrl,
        child: input.primary(),
        role: 'primary',
        parent: commonParent,
      });
      await waitForBestTipAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
        expected: abandonedTip,
      });
      await assertExecutionBlockTransactionFree(
        input.primaryRpcUrl,
        input.primary(),
        'primary',
        abandonedTip.height,
      );

      const replacementAtAbandonedHeight = await createEmptyManualSealBlock({
        rpcUrl: input.primaryRpcUrl,
        child: input.primary(),
        role: 'primary',
        parent: commonParent,
      });
      if (replacementAtAbandonedHeight.blockHashHex === abandonedTip.blockHashHex) {
        throw new Error('authority-safe replacement branch reused the abandoned block');
      }
      const replacementTip = await createEmptyManualSealBlock({
        rpcUrl: input.primaryRpcUrl,
        child: input.primary(),
        role: 'primary',
        parent: replacementAtAbandonedHeight,
      });
      await waitForBestTipAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
        expected: replacementTip,
      });
      await assertExecutionBlockTransactionFree(
        input.primaryRpcUrl,
        input.primary(),
        'primary',
        replacementAtAbandonedHeight.height,
      );
      await assertExecutionBlockTransactionFree(
        input.primaryRpcUrl,
        input.primary(),
        'primary',
        replacementTip.height,
      );
      const [primaryReplacement, witnessReplacement] = await Promise.all([
        readCanonicalBlockHashAt(
          input.primaryRpcUrl,
          input.primary(),
          'primary',
          abandonedTip.height,
        ),
        readCanonicalBlockHashAt(
          input.witnessRpcUrl,
          input.witness(),
          'witness',
          abandonedTip.height,
        ),
      ]);
      if (
        primaryReplacement !== replacementAtAbandonedHeight.blockHashHex
        || witnessReplacement !== replacementAtAbandonedHeight.blockHashHex
        || primaryReplacement === abandonedTip.blockHashHex
      ) {
        throw new Error('authority-safe unfinalized empty tail was not replaced');
      }
      const finalizedAfter = await readFinalizedAgreement({
        primaryRpcUrl: input.primaryRpcUrl,
        witnessRpcUrl: input.witnessRpcUrl,
        primary: input.primary,
        witness: input.witness,
      });
      if (
        finalizedAfter.height >= abandonedTip.height
        || !sameBestTip(finalizedAfter, finalizedAnchor)
      ) {
        throw new Error('authority-safe replaced tail was not demonstrably unfinalized');
      }
      return deepFreeze({
        finalizedAnchor,
        commonParent,
        abandonedTip,
        replacementAtAbandonedHeight,
        replacementTip,
      });
    },
  });
}

async function createEmptyManualSealBlock(input: Readonly<{
  rpcUrl: string;
  child: ChildProcess;
  role: string;
  parent: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
}>): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  assertLive(input.child, input.role);
  const pending = await rpcRequest(
    input.rpcUrl,
    'author_pendingExtrinsics',
    [],
  );
  if (!Array.isArray(pending) || pending.length !== 0) {
    throw new Error('authority-safe manual-seal transaction pool is not empty');
  }
  const created = await rpcRequest(input.rpcUrl, 'engine_createBlock', [
    true,
    false,
    `0x${input.parent.blockHashHex}`,
  ]);
  if (created === null || typeof created !== 'object' || Array.isArray(created)) {
    throw new Error('authority-safe manual-seal response is not an object');
  }
  const blockHashHex = rpcHash(
    (created as Record<string, unknown>).hash,
    'authority-safe manual-seal block hash',
  );
  const header = rpcHeader(
    await rpcRequest(input.rpcUrl, 'chain_getHeader', [`0x${blockHashHex}`]),
    'authority-safe manual-seal block header',
  );
  if (
    header.height !== input.parent.height + 1
    || header.parentHashHex !== input.parent.blockHashHex
  ) {
    throw new Error('authority-safe manual-seal block differs from its exact parent');
  }
  return Object.freeze({ height: header.height, blockHashHex });
}

async function waitForBestTipAgreement(input: Readonly<{
  primaryRpcUrl: string;
  witnessRpcUrl: string;
  primary: () => ChildProcess;
  witness: () => ChildProcess;
  expected?: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
}>): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const [primary, witness] = await Promise.all([
        readBestTip(input.primaryRpcUrl, input.primary(), 'primary'),
        readBestTip(input.witnessRpcUrl, input.witness(), 'witness'),
      ]);
      if (
        sameBestTip(primary, witness)
        && (input.expected === undefined || sameBestTip(primary, input.expected))
      ) {
        return primary;
      }
      lastError = new Error('connected best tips do not agree');
    } catch (error) {
      assertLive(input.primary(), 'primary');
      assertLive(input.witness(), 'witness');
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `authority-safe connected best-tip agreement did not become stable: ${
      lastError instanceof Error ? lastError.message : 'unknown RPC failure'
    }`,
  );
}

async function waitForFinalizedAgreement(input: Readonly<{
  primaryRpcUrl: string;
  witnessRpcUrl: string;
  primary: () => ChildProcess;
  witness: () => ChildProcess;
  expected?: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>;
}>): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const [primary, witness] = await Promise.all([
        readFinalizedTip(input.primaryRpcUrl, input.primary(), 'primary'),
        readFinalizedTip(input.witnessRpcUrl, input.witness(), 'witness'),
      ]);
      if (
        sameBestTip(primary, witness)
        && (input.expected === undefined || sameBestTip(primary, input.expected))
      ) {
        return primary;
      }
      lastError = new Error('connected finalized heads do not agree');
    } catch (error) {
      assertLive(input.primary(), 'primary');
      assertLive(input.witness(), 'witness');
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `authority-safe connected finalized-head agreement did not become stable: ${
      lastError instanceof Error ? lastError.message : 'unknown RPC failure'
    }`,
  );
}

async function readFinalizedAgreement(input: Readonly<{
  primaryRpcUrl: string;
  witnessRpcUrl: string;
  primary: () => ChildProcess;
  witness: () => ChildProcess;
}>): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  const [primary, witness] = await Promise.all([
    readFinalizedTip(input.primaryRpcUrl, input.primary(), 'primary'),
    readFinalizedTip(input.witnessRpcUrl, input.witness(), 'witness'),
  ]);
  if (!sameBestTip(primary, witness)) {
    throw new Error('authority-safe connected finalized heads do not agree');
  }
  return primary;
}

async function waitForExactBestTip(
  rpcUrl: string,
  child: () => ChildProcess,
  role: string,
  expected: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const observed = await readBestTip(rpcUrl, child(), role);
      if (sameBestTip(observed, expected)) return;
      lastError = new Error(`${role} best tip differs from the expected block`);
    } catch (error) {
      assertLive(child(), role);
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `authority-safe ${role} best tip did not reach the expected block: ${
      lastError instanceof Error ? lastError.message : 'unknown RPC failure'
    }`,
  );
}

async function readBestTip(
  rpcUrl: string,
  child: ChildProcess,
  role: string,
): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  assertLive(child, role);
  const best = rpcHeader(
    await rpcRequest(rpcUrl, 'chain_getHeader', []),
    `authority-safe ${role} best header`,
  );
  const blockHashHex = await readCanonicalBlockHashAt(
    rpcUrl,
    child,
    role,
    best.height,
  );
  const pinned = rpcHeader(
    await rpcRequest(rpcUrl, 'chain_getHeader', [`0x${blockHashHex}`]),
    `authority-safe ${role} pinned best header`,
  );
  if (pinned.height !== best.height) {
    throw new Error(`authority-safe ${role} best header changed during observation`);
  }
  return Object.freeze({ height: best.height, blockHashHex });
}

async function readFinalizedTip(
  rpcUrl: string,
  child: ChildProcess,
  role: string,
): Promise<Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>> {
  assertLive(child, role);
  const blockHashHex = rpcHash(
    await rpcRequest(rpcUrl, 'chain_getFinalizedHead', []),
    `authority-safe ${role} finalized head`,
  );
  const header = rpcHeader(
    await rpcRequest(rpcUrl, 'chain_getHeader', [`0x${blockHashHex}`]),
    `authority-safe ${role} finalized header`,
  );
  return Object.freeze({ height: header.height, blockHashHex });
}

async function assertExecutionBlockTransactionFree(
  rpcUrl: string,
  child: ChildProcess,
  role: string,
  height: number,
): Promise<void> {
  assertLive(child, role);
  const value = await rpcRequest(rpcUrl, 'eth_getBlockByNumber', [
    rpcQuantity(height),
    false,
  ]);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`authority-safe ${role} execution block is unavailable`);
  }
  const block = value as Record<string, unknown>;
  if (
    rpcHeight(block.number, `authority-safe ${role} execution block height`)
      !== height
    || !Array.isArray(block.transactions)
    || block.transactions.length !== 0
  ) {
    throw new Error(
      `authority-safe ${role} recovery block contains an execution transaction`,
    );
  }
}

async function readCanonicalBlockHashAt(
  rpcUrl: string,
  child: ChildProcess,
  role: string,
  height: number,
): Promise<string> {
  assertLive(child, role);
  return rpcHash(
    await rpcRequest(rpcUrl, 'chain_getBlockHash', [rpcQuantity(height)]),
    `authority-safe ${role} canonical block hash`,
  );
}

function rpcHeader(
  value: unknown,
  label: string,
): Readonly<{ height: number; parentHashHex: string }> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  const record = value as Record<string, unknown>;
  return Object.freeze({
    height: rpcHeight(record.number, `${label} height`),
    parentHashHex: rpcHash(record.parentHash, `${label} parent hash`),
  });
}

function rpcHeight(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} is not a canonical RPC quantity`);
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the safe integer range`);
  }
  return Number(parsed);
}

function rpcQuantity(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('authority-safe RPC height must be a non-negative safe integer');
  }
  return `0x${value.toString(16)}`;
}

function rpcHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
  }
  return value.slice(2).toLowerCase();
}

function sameBestTip(
  left: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
  right: Readonly<OwnedAuthoritySafeDevnetRecoveryBestTipV1>,
): boolean {
  return left.height === right.height && left.blockHashHex === right.blockHashHex;
}

function requiredProcess(
  value: ChildProcess | undefined,
  role: string,
): ChildProcess {
  if (value === undefined) {
    throw new Error(`authority-safe ${role} process is unavailable`);
  }
  return value;
}

function spawnNode(
  executablePath: string,
  args: readonly string[],
  cwd: string,
  role: string,
): ChildProcess {
  const child = spawn(executablePath, [...args], {
    cwd,
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
    env: minimalEnvironment(),
  });
  child.once('error', error => {
    PROCESS_ERRORS.set(child, error);
  });
  if (!Number.isSafeInteger(child.pid) || !child.pid) {
    child.kill('SIGKILL');
    throw new Error(`authority-safe ${role} process did not expose a PID`);
  }
  return child;
}

async function waitForPeerId(
  url: string,
  child: ChildProcess,
  role: string,
): Promise<string> {
  return await retryRpc(child, role, async () => {
    const value = await rpcRequest(url, 'system_localPeerId');
    if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(value)) {
      throw new Error('peer identity is not canonical base58');
    }
    return value;
  });
}

async function waitForConnectedHealth(
  url: string,
  child: ChildProcess,
  role: string,
): Promise<void> {
  await retryRpc(child, role, async () => {
    const value = await rpcRequest(url, 'system_health');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('health response is not an object');
    }
    const health = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(health.peers)
      || Number(health.peers) < 1
      || health.isSyncing !== false
      || typeof health.shouldHavePeers !== 'boolean'
    ) {
      throw new Error('node is not connected and stable');
    }
  });
}

async function assertExactMutualPeerIdentity(input: Readonly<{
  primaryUrl: string;
  primary: ChildProcess;
  primaryPeerId: string;
  witnessUrl: string;
  witness: ChildProcess;
  witnessPeerId: string;
}>): Promise<void> {
  await Promise.all([
    assertExactConnectedPeer(
      input.primaryUrl,
      input.primary,
      'primary',
      input.witnessPeerId,
    ),
    assertExactConnectedPeer(
      input.witnessUrl,
      input.witness,
      'witness',
      input.primaryPeerId,
    ),
  ]);
}

async function assertExactConnectedPeer(
  url: string,
  child: ChildProcess,
  role: string,
  expectedPeerId: string,
): Promise<void> {
  const peers = await retryRpc(child, role, async () => {
    const value = await rpcRequest(url, 'system_peers');
    if (!Array.isArray(value)) {
      throw new Error('connected-peer response is not an array');
    }
    if (value.length === 0) {
      throw new Error('expected connected peer is not visible yet');
    }
    return value;
  });
  if (peers.length !== 1) {
    throw new Error(`authority-safe ${role} has an unexpected connected peer set`);
  }
  const peer = peers[0];
  if (
    peer === null
    || typeof peer !== 'object'
    || Array.isArray(peer)
    || (peer as Record<string, unknown>).peerId !== expectedPeerId
  ) {
    throw new Error(`authority-safe ${role} is not connected to the exact peer identity`);
  }
}

async function retryRpc<T>(
  child: ChildProcess,
  role: string,
  operation: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    assertLive(child, role);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(
    `authority-safe ${role} RPC did not become ready: ${
      lastError instanceof Error ? lastError.message : 'unknown RPC failure'
    }`,
  );
}

async function rpcRequest(
  url: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('authority-safe startup RPC returned non-success');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RPC_RESPONSE_BYTES) {
    throw new Error('authority-safe startup RPC response exceeded the limit');
  }
  const body = JSON.parse(text) as unknown;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('authority-safe startup RPC response is not an object');
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.jsonrpc !== '2.0' || envelope.id !== 1) {
    throw new Error('authority-safe startup RPC returned an invalid envelope');
  }
  if (Object.hasOwn(envelope, 'error')) {
    throw new Error(
      `authority-safe startup RPC ${method} failed: ${rpcErrorDetail(envelope.error)}`,
    );
  }
  if (!Object.hasOwn(envelope, 'result')) {
    throw new Error('authority-safe startup RPC returned an invalid envelope');
  }
  return envelope.result;
}

function rpcErrorDetail(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'malformed error';
  }
  const error = value as Record<string, unknown>;
  if (
    typeof error.code !== 'number'
    || !Number.isSafeInteger(error.code)
    || typeof error.message !== 'string'
    || error.message.length === 0
  ) {
    return 'malformed error';
  }
  const message = error.message
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256);
  return message.length === 0
    ? `code ${error.code}: empty message`
    : `code ${error.code}: ${message}`;
}

function assertListenerOwnership(
  expected: readonly Readonly<{ pid: number; ports: readonly number[] }>[],
): void {
  const bindings = listenerBindings(expected.flatMap(value => [...value.ports]));
  for (const process of expected) {
    for (const expectedPort of process.ports) {
      const actual = bindings.get(expectedPort) ?? [];
      if (
        actual.length === 0
        || actual.some(binding => binding.pid !== process.pid)
        || actual.some(binding => !isLoopbackAddress(binding.localAddress))
        || !actual.some(binding => binding.localAddress === '127.0.0.1')
      ) {
        throw new Error(
          'authority-safe listener is not exclusively loopback-owned by its spawned node process',
        );
      }
    }
  }
}

function isLoopbackAddress(value: string): boolean {
  return value === '127.0.0.1' || value === '::1';
}

function assertPortsUnowned(ports: readonly number[]): void {
  const bindings = listenerBindings(ports);
  if ([...bindings.values()].some(value => value.length > 0)) {
    throw new Error('authority-safe process port is already owned');
  }
}

function assertPortsBindable(ports: readonly number[]): void {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows SystemRoot is unavailable for port bindability');
  }
  const script = [
    "$ErrorActionPreference='Stop'",
    '$listeners=@()',
    'try { foreach ($port in @(' + ports.join(',') + ')) { '
      + '$listener=[System.Net.Sockets.TcpListener]::new('
      + '[System.Net.IPAddress]::Loopback,$port); '
      + '$listener.Start(); $listeners+=,$listener } } '
      + 'finally { foreach ($listener in $listeners) { $listener.Stop() } }',
  ].join('; ');
  const result = spawnSync(
    resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      cwd: systemRoot,
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error
    || result.signal !== null
    || result.status !== 0
    || result.stdout.trim() !== ''
    || result.stderr.trim() !== ''
  ) {
    throw new Error('authority-safe process port is not bindable on IPv4 loopback');
  }
}

async function assertRunningExecutableIdentity(
  child: ChildProcess,
  expectedPath: string,
  expectedSha256Hex: string,
  role: string,
): Promise<void> {
  const pid = processId(child, role);
  const runningPath = windowsRunningExecutablePath(pid);
  if (runningPath.toLowerCase() !== expectedPath.toLowerCase()) {
    throw new Error(`authority-safe ${role} process image path differs from the exact binary`);
  }
  await verifyExecutableSha256(
    runningPath,
    `0x${expectedSha256Hex}`,
    `authority-safe ${role} running process image`,
  );
}

function windowsRunningExecutablePath(pid: number): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows SystemRoot is unavailable for process image inspection');
  }
  const result = spawnSync(
    resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$value=(Get-Process -Id ${pid} -ErrorAction Stop).Path; [Console]::Out.Write($value)`,
    ],
    {
      cwd: systemRoot,
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error
    || result.signal !== null
    || result.status !== 0
    || result.stderr.trim() !== ''
    || result.stdout.trim() === ''
  ) {
    throw new Error('Windows process image inspection failed');
  }
  return canonicalRegularFile(result.stdout.trim(), 'running process image');
}

function assertChainSpecUnchanged(path: string, expectedSha256Hex: string): void {
  if (sha256(readFileSync(path)) !== expectedSha256Hex) {
    throw new Error('authority-safe process chain-spec file changed during target observation');
  }
}

function listenerBindings(ports: readonly number[]): Map<number, ListenerBinding[]> {
  return windowsListenerBindings(ports);
}

function windowsListenerBindings(ports: readonly number[]): Map<number, ListenerBinding[]> {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows SystemRoot is unavailable for listener ownership');
  }
  const script = [
    `$ports=@(${ports.join(',')})`,
    'try { $rows=@(Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction Stop '
      + '| Select-Object LocalAddress,LocalPort,OwningProcess) } '
      + 'catch { if ($_.FullyQualifiedErrorId '
      + '-like "CmdletizationQuery_NotFound,Get-NetTCPConnection*") '
      + '{ $rows=@() } else { throw } }',
    'ConvertTo-Json -Compress -InputObject $rows',
  ].join('; ');
  const result = spawnSync(
    resolve(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      cwd: systemRoot,
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error
    || result.signal !== null
    || result.status !== 0
    || result.stderr.trim() !== ''
  ) {
    throw new Error('Windows listener ownership inspection failed');
  }
  const parsed = JSON.parse(result.stdout || '[]') as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const bindings = emptyBindingMap(ports);
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Windows listener ownership output is malformed');
    }
    const record = row as Record<string, unknown>;
    const localAddress = record.LocalAddress;
    const localPort = Number(record.LocalPort);
    const owningProcess = Number(record.OwningProcess);
    if (
      typeof localAddress !== 'string'
      || !bindings.has(localPort)
      || !Number.isSafeInteger(owningProcess)
      || owningProcess <= 0
    ) {
      throw new Error('Windows listener ownership row is malformed');
    }
    bindings.get(localPort)!.push({ pid: owningProcess, localAddress });
  }
  return bindings;
}

function emptyBindingMap(ports: readonly number[]): Map<number, ListenerBinding[]> {
  return new Map(ports.map(value => [value, []]));
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  let timer: NodeJS.Timeout | undefined;
  let closeHandler: (() => void) | undefined;
  const closed = new Promise<void>((resolvePromise, reject) => {
    closeHandler = () => {
      if (timer) clearTimeout(timer);
      resolvePromise();
    };
    child.once('close', closeHandler);
    timer = setTimeout(() => {
      reject(new Error('authority-safe node process did not stop within the limit'));
    }, STOP_TIMEOUT_MS);
  });
  if (!child.kill('SIGKILL')) {
    if (timer) clearTimeout(timer);
    if (closeHandler) child.off('close', closeHandler);
    throw new Error('authority-safe node process could not be stopped');
  }
  await closed;
}

function assertLive(child: ChildProcess, role: string): void {
  const startupError = PROCESS_ERRORS.get(child);
  if (startupError) {
    throw new Error(
      `authority-safe ${role} process failed to start: ${startupError.message}`,
    );
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`authority-safe ${role} process exited unexpectedly`);
  }
}

function processId(child: ChildProcess, role: string): number {
  assertLive(child, role);
  if (!Number.isSafeInteger(child.pid) || !child.pid) {
    throw new Error(`authority-safe ${role} process PID is unavailable`);
  }
  return child.pid;
}

function loopbackRpc(value: unknown, label: string): { url: string; port: number } {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error(`${label} must be one explicit loopback HTTP origin`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be one explicit loopback HTTP origin`);
  }
  if (
    parsed.protocol !== 'http:'
    || parsed.hostname !== '127.0.0.1'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.port === ''
  ) {
    throw new Error(`${label} must be one explicit loopback HTTP origin`);
  }
  const rpcPort = port(Number(parsed.port), `${label} port`);
  return { url: `http://127.0.0.1:${rpcPort}`, port: rpcPort };
}

function canonicalRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular file`);
  }
  return realpathSync(path);
}

function boundedBytes(value: unknown, maximum: number, label: string): Buffer {
  if (!(value instanceof Uint8Array) || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must contain bounded bytes`);
  }
  return Buffer.from(value);
}

function assertRecoveryManualSealGenesis(chainSpecBytes: Uint8Array): void {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(chainSpecBytes);
  } catch {
    throw new Error('authority-safe recovery chain spec is not valid UTF-8');
  }
  const parsed = parseStrictJson(decoded, 'authority-safe recovery chain spec');
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('authority-safe recovery chain spec must be an object');
  }
  const genesis = (parsed as Record<string, unknown>).genesis;
  const runtimeGenesis = objectField(genesis, 'runtimeGenesis');
  const patch = objectField(runtimeGenesis, 'patch');
  const manualSeal = objectField(patch, 'manualSeal');
  if (manualSeal.enable !== true) {
    throw new Error(
      'authority-safe recovery chain spec must enable manual sealing at genesis',
    );
  }
}

function objectField(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `authority-safe recovery chain spec field ${field} must be an object`,
    );
  }
  const child = (value as Record<string, unknown>)[field];
  if (child === null || typeof child !== 'object' || Array.isArray(child)) {
    throw new Error(
      `authority-safe recovery chain spec field ${field} must be an object`,
    );
  }
  return child as Record<string, unknown>;
}

function port(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
    throw new Error(`${label} must be between 1 and 65535`);
  }
  return Number(value);
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase 32-byte hex`);
  }
  return value;
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
