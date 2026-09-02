import { createHash } from 'node:crypto';
import {
  spawn,
  spawnSync,
  type ChildProcess,
} from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { performance } from 'node:perf_hooks';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-settlement-core/ergo-extension-membership.js';
import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  normalizeErgoNodeHeaderBytes,
} from './adapters/ergo-utxo-state-runtime-witness-capture-port-v1.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionNodeObservationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromNodeDigestsV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
} from './relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  type SubstrateFederatedIsolatedDevnetTrackerTargetPreActionPhaseV1,
} from './relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import { verifyExecutableSha256 } from './native-executable-pin.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import type {
  SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1,
  SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1,
  SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

export {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
} from './relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-bound-frozen-execution.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-execution.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-execution.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-confirmation-execution.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-execution.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-confirmation-execution.v2' as const;

const PRIMARY_REST_PORT = 9051;
const WITNESS_REST_PORT = 9052;
const PRIMARY_P2P_PORT = 9021;
const WITNESS_P2P_PORT = 9022;
const OWNED_PORTS = [
  PRIMARY_REST_PORT,
  WITNESS_REST_PORT,
  PRIMARY_P2P_PORT,
  WITNESS_P2P_PORT,
] as const;
const MINIMUM_MINED_HEIGHT = 8;
const STARTUP_TIMEOUT_MS = 120_000;
const MINING_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 3_000;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1 =
  78 * 60_000;
const STABILITY_DELAY_MS = 500;
const MAX_RESPONSE_BYTES = 256 * 1024;
const API_KEY = 'hello';
const API_KEY_HASH_HEX =
  '324dcf027dd4a30a932c441f365a25e86b173defa4b8e58948253471b81b72cf';
const QUICK_DEVNET_GENESIS_STATE_DIGEST_HEX =
  '840ca0b8aec2d7a6c4f1589ca6070c8a5ed5924c835cdb8f816aa773b6fe1b6302';
const INITIAL_EXTENSION_FIELDS = `0401:${'00'.repeat(64)}`;
const CHECKPOINT_EXTENSION_KEY_HEX = '0401' as const;
const EPHEMERAL_MINING_MNEMONIC_ENVIRONMENT_VARIABLE =
  'E2S_FED6G1DI3B_EPHEMERAL_MINING_MNEMONIC';
const PROCESS_START_ERRORS = new WeakSet<ChildProcess>();
const OWNED_READ_ONLY_TARGET_BINDINGS = new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_READ_ONLY_TARGETS = new WeakSet<object>();
const OWNED_EXECUTION_TARGET_BINDINGS = new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_EXECUTION_TARGETS = new WeakSet<object>();
const OWNED_CHECKPOINT_TARGET_BINDINGS = new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_CHECKPOINT_TARGETS = new WeakSet<object>();
const OWNED_CHECKPOINT_BOUND_EXECUTION_TARGET_BINDINGS =
  new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_CHECKPOINT_BOUND_EXECUTION_TARGETS = new WeakSet<object>();
const OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGET_BINDINGS =
  new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGETS =
  new WeakSet<object>();
const OWNED_TRACKER_RESERVATION_FRESHNESS_TARGET_BINDINGS =
  new WeakMap<object, OwnedTargetBinding>();
const ACTIVE_OWNED_TRACKER_RESERVATION_FRESHNESS_TARGETS =
  new WeakSet<object>();
const OWNED_TRACKER_TRANSPORT_TARGET_BINDINGS =
  new WeakMap<object, OwnedTrackerTransportTargetBinding>();
const ACTIVE_OWNED_TRACKER_TRANSPORT_TARGETS = new WeakSet<object>();
const OWNED_TRACKER_RESERVATION_FRESHNESS_COMPLETIONS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();
const ISSUED_TRACKER_RESERVATION_FRESHNESS_COMPLETION_TARGETS =
  new WeakSet<object>();

export function deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(
  priorHeight: number,
  minimumTipHeight?: number,
): number {
  if (
    !Number.isSafeInteger(priorHeight)
    || priorHeight < 0
    || priorHeight >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('isolated checkpoint prior height is invalid');
  }
  if (
    minimumTipHeight !== undefined
    && (
      !Number.isSafeInteger(minimumTipHeight)
      || minimumTipHeight < 0
    )
  ) {
    throw new Error('isolated checkpoint minimum tip height is invalid');
  }
  return Math.max(priorHeight + 1, minimumTipHeight ?? 0);
}

type NodeRole = 'primary' | 'witness';
type NodeMode = 'mining' | 'non-mining';

interface ListenerBinding {
  readonly pid: number;
  readonly localAddress: string;
  readonly localPort: number;
}

interface TargetSnapshot {
  readonly network: 'devnet';
  readonly fullHeight: number;
  readonly indexedHeight: number;
  readonly headerIdHex: string;
}

interface OwnedNode {
  readonly role: NodeRole;
  readonly mode: NodeMode;
  readonly child: ChildProcess;
  readonly configPath: string;
  readonly configSha256Hex: string;
}

interface RuntimeLayout {
  readonly root: string;
  readonly logbackPath: string;
  readonly logbackSha256Hex: string;
  readonly primaryDataDirectory: string;
  readonly witnessDataDirectory: string;
  readonly primaryJavaTempDirectory: string;
  readonly witnessJavaTempDirectory: string;
  readonly primaryMiningConfigPath: string;
  readonly witnessMiningConfigPath: string;
  readonly primaryNonMiningConfigPath: string;
  readonly witnessNonMiningConfigPath: string;
  readonly configSha256Hex: Readonly<{
    primaryMining: string;
    witnessMining: string;
    primaryNonMining: string;
    witnessNonMining: string;
  }>;
}

interface OwnedTargetBinding {
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly assertActiveProcesses: () => void;
}

interface OwnedTrackerTransportTargetBinding extends OwnedTargetBinding {
  readonly reservationFreshnessProcessBindingDigestHex: string;
  readonly reservationFreshnessExecutionTargetIdentityDigestHex: string;
}

interface CheckpointExecutionContinuation {
  readonly extensionFields: string;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly executionTargetIdentityDigestHex: string;
  readonly checkpointExtensionObservationDigestHex: string;
}

interface TrackerReservationFreshnessContinuation {
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly frozenSnapshot: Readonly<TargetSnapshot>;
}

interface TrackerTransportContinuation {
  readonly reservationFreshnessTarget: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
  >;
  readonly reservationFreshnessProcessBindingDigestHex: string;
  readonly reservationFreshnessExecutionTargetIdentityDigestHex: string;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly frozenSnapshot: Readonly<TargetSnapshot>;
}

interface TrackerConfirmationContinuation {
  readonly trackerTransportProcessBindingDigestHex: string;
  readonly trackerTransportExecutionTargetIdentityDigestHex: string;
  readonly primaryProcessId: number;
  readonly witnessProcessId: number;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly transportSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input {
  readonly javaExecutablePath: string;
  readonly expectedJavaExecutableSha256Hex: string;
  readonly nodeAssemblyJarPath: string;
  readonly expectedNodeAssemblyJarSha256Hex: string;
  readonly buildIdentityDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt
  extends SubstrateFederatedIsolatedDevnetErgoNodeExecutionReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA;
  readonly version: 1;
  readonly finalSnapshot: Readonly<TargetSnapshot>;
  readonly checks: Readonly<{
    readonly directJavaAssemblyLaunch: true;
    readonly javaImageAndPinnedFilesRechecked: true;
    readonly isolatedFreshRuntimeStateUsed: true;
    readonly setupSignerSecretNeverExposedToCompositionRoot: true;
    readonly setupSignerMiningCredentialConsumedOnce: true;
    readonly ephemeralPowSecretPassedOnlyViaProcessEnvironment: true;
    readonly ephemeralPowSecretDiscardedBeforeAction: true;
    readonly miningTargetBoundToSessionPublicKey: true;
    readonly miningPhaseStoppedBeforeTargetFreeze: true;
    readonly sameDataDirectoriesResumedNonMining: true;
    readonly managedActionCompletionJoinedBeforeCleanup: true;
    readonly managedActionOverrunRejectedAfterJoin: true;
    readonly unverifiedProcessTerminationFailsStop: true;
    readonly exactNonMiningSnapshotStableAcrossAction: true;
    readonly spawnedProcessListenersExclusivelyLoopbackOwned: true;
    readonly configurationAndArtifactRecheckedAfterAction: true;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2 {
  readonly startMining: () => Promise<void>;
  readonly withMiningActiveExecutionTarget: <T>(
    action: (
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  }>>;
  readonly withMiningStoppedReadOnlyTarget: <T>(
    action: (
      target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>;
  }>>;
  readonly withCheckpointExtensionMiningTarget: <T>(
    checkpointExtensionValueHex: string,
    policy: Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningPolicyV1>,
    action: (
      target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt>;
  }>>;
  readonly withCheckpointBoundMiningActiveExecutionTarget: <T>(
    action: (
      target: Readonly<
        SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
      >,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt>;
  }>>;
  readonly withCheckpointBoundMiningStoppedExecutionTarget: <T>(
    action: (
      target: Readonly<
        SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
      >,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt>;
  }>>;
  readonly withCheckpointBoundReservationFreshnessRevalidationTarget: <T>(
    action: (
      target: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
      >,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt
    >;
  }>>;
  readonly withCheckpointBoundTrackerTransportTarget: <T>(
    completion: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
    >,
    action: (
      target: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2
      >,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV2Receipt
    >;
  }>>;
  readonly withTrackerTransportConfirmationMiningTarget: <T>(
    expectedTransactionIdHex: string,
    action: (
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
    ) => Promise<T>,
  ) => Promise<Readonly<{
    readonly value: T;
    readonly receipt: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt
    >;
  }>>;
  readonly stop: () => Promise<void>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointMiningPolicyV1 {
  readonly minimumTipHeight?: number;
}

export interface SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: true;
  readonly witnessReadOnly: true;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: true;
  readonly witnessReadOnly: true;
  readonly checkpointBound: true;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: false;
  readonly primaryReadOnly: true;
  readonly witnessReadOnly: true;
  readonly miningStopped: true;
  readonly checkpointBound: true;
}

export interface SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: false;
  readonly primaryReadOnly: true;
  readonly witnessReadOnly: true;
  readonly miningStopped: true;
  readonly checkpointBound: true;
  readonly reservationFreshnessRevalidation: true;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: false;
  readonly witnessReadOnly: true;
  readonly miningStopped: true;
  readonly checkpointBound: true;
  readonly reservationFreshnessCheckBound: true;
  readonly trackerTransport: true;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2 {
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMining: true;
  readonly witnessReadOnly: true;
  readonly checkpointBound: true;
  readonly reservationFreshnessCheckBound: true;
  readonly trackerTransport: true;
  readonly sameProcessCanonicalConfirmation: true;
}

export interface SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1 {
  readonly schema:
    'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1';
  readonly version: 1;
}

export interface SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1 {
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
  extends SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1 {
  readonly reservationFreshnessProcessBindingDigestHex: string;
  readonly reservationFreshnessExecutionTargetIdentityDigestHex: string;
}

export type SubstrateFederatedIsolatedDevnetOwnedCheckpointTargetBindingV1 =
  SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1;

export interface SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA;
  readonly version: 1;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMiningDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly initialSnapshot: Readonly<TargetSnapshot>;
  readonly finalSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt
{
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA;
  readonly version: 1;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly miningStoppedBeforeObservation: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly priorSnapshot: Readonly<TargetSnapshot>;
  readonly minedSnapshot: Readonly<TargetSnapshot>;
  readonly finalSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt
  extends SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt {
  readonly checkpointExtensionBoundDuringAction: true;
  readonly trackerAdmissionMiningCredentialConsumedOnce: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA;
  readonly version: 2;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMiningDuringAction: false;
  readonly primaryReadOnlyDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly miningStoppedBeforeAction: true;
  readonly exactFrozenSnapshotStableAcrossAction: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly preFreezeMiningSnapshot: Readonly<TargetSnapshot>;
  readonly actionStartSnapshot: Readonly<TargetSnapshot>;
  readonly actionEndSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly trackerAdmissionMiningCredentialConsumedOnce: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA;
  readonly version: 1;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryReadOnlyDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly miningStoppedBeforeAction: true;
  readonly exactFrozenSnapshotStableAcrossAction: true;
  readonly sameProcessesAsTrackerCheck: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly trackerCheckProcessBindingDigestHex: string;
  readonly trackerCheckExecutionTargetIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly trackerCheckSnapshot: Readonly<TargetSnapshot>;
  readonly actionStartSnapshot: Readonly<TargetSnapshot>;
  readonly actionEndSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V1_SCHEMA;
  readonly version: 1;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMiningStoppedDuringAction: true;
  readonly trackerTransportTargetActiveOnlyDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly miningStoppedBeforeAction: true;
  readonly exactFrozenChainSnapshotStableAcrossAction: true;
  readonly sameProcessesAsReservationFreshness: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly reservationFreshnessProcessBindingDigestHex: string;
  readonly reservationFreshnessExecutionTargetIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly reservationFreshnessSnapshot: Readonly<TargetSnapshot>;
  readonly actionStartSnapshot: Readonly<TargetSnapshot>;
  readonly actionEndSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV2Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA;
  readonly version: 2;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMiningDuringAction: true;
  readonly trackerTransportTargetActiveOnlyDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly miningRestartedBeforeAction: true;
  readonly sameProcessesAsReservationFreshness: false;
  readonly exactReservationFreshnessSnapshotRevalidatedBeforeAction: true;
  readonly trackerConfirmationMiningCredentialConsumedBeforeTransportOnce: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly reservationFreshnessProcessBindingDigestHex: string;
  readonly reservationFreshnessExecutionTargetIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly reservationFreshnessSnapshot: Readonly<TargetSnapshot>;
  readonly actionStartSnapshot: Readonly<TargetSnapshot>;
  readonly actionEndSnapshot: Readonly<TargetSnapshot>;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV1Receipt
  extends Omit<
    SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt,
    'schema'
  > {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V1_SCHEMA;
  readonly trackerConfirmationMiningCredentialConsumedOnce: true;
  readonly exactTrackerTransportBound: true;
  readonly confirmedTransactionIdHex: string;
  readonly trackerTransportProcessBindingDigestHex: string;
  readonly trackerTransportExecutionTargetIdentityDigestHex: string;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly transportSnapshot: Readonly<TargetSnapshot>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA;
  readonly version: 2;
  readonly primaryNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
  readonly witnessNodeOrigin:
    typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  readonly primaryMiningDuringAction: true;
  readonly witnessReadOnlyDuringAction: true;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly initialSnapshot: Readonly<TargetSnapshot>;
  readonly finalSnapshot: Readonly<TargetSnapshot>;
  readonly sameProcessesAsTrackerTransport: true;
  readonly exactTrackerTransportBound: true;
  readonly confirmedTransactionIdHex: string;
  readonly trackerTransportProcessBindingDigestHex: string;
  readonly trackerTransportExecutionTargetIdentityDigestHex: string;
  readonly checkpointExtensionBoundDuringAction: true;
  readonly checkpointSnapshotRevalidatedOnBothNodes: true;
  readonly checkpointExtensionObservationDigestHex: string;
  readonly extensionKeyHex: typeof CHECKPOINT_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly extensionFieldsSha256Hex: string;
  readonly checkpointSnapshot: Readonly<TargetSnapshot>;
  readonly transportSnapshot: Readonly<TargetSnapshot>;
}

export function assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
): string {
  const binding = OWNED_READ_ONLY_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_READ_ONLY_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo target is not owned by the active managed process action',
    );
  }
  binding.assertActiveProcesses();
  return binding.processBindingDigestHex;
}

export function assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedCheckpointTargetBindingV1> {
  const binding = OWNED_CHECKPOINT_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_CHECKPOINT_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo target is not owned by the active checkpoint observation',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
  });
}

export function assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding = OWNED_EXECUTION_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_EXECUTION_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo execution target is not owned by the active mining action',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
  });
}

export function assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
  >,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding = OWNED_CHECKPOINT_BOUND_EXECUTION_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_CHECKPOINT_BOUND_EXECUTION_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo checkpoint-bound target is not owned by the active tracker-admission action',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
  });
}

export function assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
  >,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding =
    OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo frozen checkpoint-bound target is not owned by the active tracker-check action',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
  });
}

export function assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
  >,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding =
    OWNED_TRACKER_RESERVATION_FRESHNESS_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_TRACKER_RESERVATION_FRESHNESS_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo target is not owned by the active reservation-freshness action',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
  });
}

function assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTarget(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1
      | SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
> {
  const binding = OWNED_TRACKER_TRANSPORT_TARGET_BINDINGS.get(value);
  if (
    binding === undefined
    || !ACTIVE_OWNED_TRACKER_TRANSPORT_TARGETS.has(value)
  ) {
    throw new Error(
      'isolated Ergo target is not owned by the active tracker-transport action',
    );
  }
  binding.assertActiveProcesses();
  return Object.freeze({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
    reservationFreshnessProcessBindingDigestHex:
      binding.reservationFreshnessProcessBindingDigestHex,
    reservationFreshnessExecutionTargetIdentityDigestHex:
      binding.reservationFreshnessExecutionTargetIdentityDigestHex,
  });
}

/** Retained as a fail-closed compatibility surface for historical V1 callers. */
export function assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1(
  value: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
> {
  return assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTarget(value);
}

export function assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(
  value: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2>,
): Readonly<
  SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
> {
  return assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTarget(value);
}

/**
 * Seal one successful checker-owned freshness action. Import rules restrict
 * this issuer to the concrete setup checker; the composition root can only
 * claim the resulting opaque completion through that checker.
 */
export function issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
  target: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
      target,
    );
  if (ISSUED_TRACKER_RESERVATION_FRESHNESS_COMPLETION_TARGETS.has(target)) {
    throw new Error(
      'isolated tracker reservation freshness completion is already issued',
    );
  }
  const completion = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1' as const,
    version: 1 as const,
  });
  ISSUED_TRACKER_RESERVATION_FRESHNESS_COMPLETION_TARGETS.add(target);
  OWNED_TRACKER_RESERVATION_FRESHNESS_COMPLETIONS.set(
    completion,
    Object.freeze({ target, binding }),
  );
  return completion;
}

interface NormalizedProcessInput {
  readonly javaExecutablePath: string;
  readonly javaExecutableSha256Hex: string;
  readonly nodeAssemblyJarPath: string;
  readonly nodeAssemblyJarSha256Hex: string;
  readonly buildIdentityDigestHex: string;
  readonly executableIdentityDigestHex: string;
}

/**
 * Creates an inert owner for the fixed local Ergo pair. No process starts until
 * startMining() is called. It accepts only a one-shot opaque credential whose
 * secret can be consumed by this process adapter and never inspected by the
 * composition root.
 * The caller-supplied action is not a capability sandbox; only the static G1dI3b
 * composition root may supply it. File hashes are checked before and after the
 * run but do not attest loaded bytes against a hostile same-user process.
 */
export function createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2(
  inputValue: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input>,
  bindingValue: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>,
  miningCredentialValue:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  checkpointMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  trackerAdmissionMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  trackerConfirmationMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2> {
  const { input, binding } = normalizeProcessConstruction(
    inputValue,
    bindingValue,
    miningCredentialValue,
    checkpointMiningCredentialValue,
    trackerAdmissionMiningCredentialValue,
    trackerConfirmationMiningCredentialValue,
  );
  let miningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
      miningCredentialValue;
  let checkpointMiningCredential = checkpointMiningCredentialValue;
  let trackerAdmissionMiningCredential = trackerAdmissionMiningCredentialValue;
  let trackerConfirmationMiningCredential =
    trackerConfirmationMiningCredentialValue;
  let checkpointExecutionContinuation:
    Readonly<CheckpointExecutionContinuation> | undefined;
  let trackerReservationFreshnessContinuation:
    Readonly<TrackerReservationFreshnessContinuation> | undefined;
  let trackerTransportContinuation:
    Readonly<TrackerTransportContinuation> | undefined;
  let trackerConfirmationContinuation:
    Readonly<TrackerConfirmationContinuation> | undefined;
  let state: 'inert' | 'mining' | 'action' | 'read-only' | 'stopped' = 'inert';
  let ownedRuntimeRoot: string | undefined;
  let runtime: RuntimeLayout | undefined;
  let primary: OwnedNode | undefined;
  let witness: OwnedNode | undefined;
  let activeOperation:
    | 'start'
    | 'execution'
    | 'transition'
    | 'anchor'
    | 'checkpoint-execution'
    | 'checkpoint-freshness'
    | 'tracker-transport'
    | 'tracker-confirmation'
    | 'stop'
    | undefined;

  const cleanup = async (): Promise<void> => {
    if (state === 'stopped') return;
    if (miningCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        miningCredential,
      );
      miningCredential = undefined;
    }
    if (checkpointMiningCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        checkpointMiningCredential,
      );
      checkpointMiningCredential = undefined;
    }
    if (trackerAdmissionMiningCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerAdmissionMiningCredential,
      );
      trackerAdmissionMiningCredential = undefined;
    }
    if (trackerConfirmationMiningCredential !== undefined) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerConfirmationMiningCredential,
      );
      trackerConfirmationMiningCredential = undefined;
    }
    if (
      state === 'inert' && ownedRuntimeRoot === undefined && runtime === undefined
      && primary === undefined && witness === undefined
    ) {
      state = 'stopped';
      return;
    }
    const terminationErrors: Error[] = [];
    for (const [node, clear] of [
      [witness, () => { witness = undefined; }],
      [primary, () => { primary = undefined; }],
    ] as const) {
      try {
        await stopOwnedNode(node, false);
        clear();
      } catch (error) {
        terminationErrors.push(
          asError(error, 'isolated Ergo process cleanup failed'),
        );
      }
    }
    const ownedNodeTerminationEstablished = terminationErrors.length === 0;
    let reservedPortsProvenUnowned = false;
    if (ownedNodeTerminationEstablished) {
      try {
        assertPortsUnowned(OWNED_PORTS);
        reservedPortsProvenUnowned = true;
      } catch {
        reservedPortsProvenUnowned = false;
      }
    }
    if (
      decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(
        ownedNodeTerminationEstablished,
        reservedPortsProvenUnowned,
      ) === 'hold_cleanup_authority'
    ) {
      return await holdOwnedNodeCleanupAuthority();
    }
    const cleanupErrors: Error[] = [];
    if (ownedRuntimeRoot !== undefined) {
      try {
        removeOwnedRuntime(ownedRuntimeRoot);
        ownedRuntimeRoot = undefined;
        runtime = undefined;
      } catch (error) {
        cleanupErrors.push(asError(error, 'isolated Ergo runtime cleanup failed'));
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'isolated Ergo owned-process cleanup was incomplete',
      );
    }
    state = 'stopped';
  };

  const stop = async (): Promise<void> => {
    if (activeOperation !== undefined) {
      throw new Error(
        `isolated Ergo owned processes cannot stop while ${activeOperation} is active`,
      );
    }
    activeOperation = 'stop';
    try {
      await cleanup();
    } finally {
      activeOperation = undefined;
    }
  };

  const failWithCleanup = async (failure: unknown): Promise<never> => {
    if (state === 'action') state = 'read-only';
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [
          asError(failure, 'isolated Ergo owned-process lifecycle failed'),
          asError(cleanupError, 'isolated Ergo owned-process cleanup failed'),
        ],
        'isolated Ergo lifecycle failed and cleanup was incomplete',
      );
    }
    throw failure;
  };

  return Object.freeze({
    startMining: async () => {
      if (state !== 'inert' || activeOperation !== undefined) {
        throw new Error('isolated Ergo mining phase can start exactly once');
      }
      activeOperation = 'start';
      try {
        recheckProcessArtifacts(input);
        assertPortsUnowned(OWNED_PORTS);
        const createdRoot = createOwnedRuntimeRoot(value => {
          ownedRuntimeRoot = value;
        });
        ownedRuntimeRoot = createdRoot;
        runtime = createRuntimeLayout(createdRoot, binding);
        const credential = miningCredential;
        if (credential === undefined) {
          throw new Error('isolated Ergo mining credential is already consumed');
        }
        miningCredential = undefined;
        let launchedPrimary: OwnedNode | undefined;
        consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          binding.miningTargetPublicKeyHex,
          ephemeralMiningMnemonic => {
            launchedPrimary = spawnOwnedNode(
              input,
              runtime!,
              'primary',
              'mining',
              ephemeralMiningMnemonic,
            );
          },
        );
        if (launchedPrimary === undefined) {
          throw new Error('isolated Ergo primary mining process did not start');
        }
        primary = launchedPrimary;
        await waitForBasicNodeReadiness(primary);
        assertOwnedNodeIdentity(input, runtime, primary);
        witness = spawnOwnedNode(input, runtime, 'witness', 'mining');
        await waitForBasicNodeReadiness(witness);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        state = 'mining';
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withMiningActiveExecutionTarget: async <T>(
      action: (
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'mining' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
      ) {
        throw new Error(
          'isolated Ergo execution action requires the active mining phase',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated Ergo execution action is required');
      }
      activeOperation = 'execution';
      try {
        const initialSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        recheckRuntimeFiles(input, runtime);

        const executionTargetIdentityDigestHex =
          deriveExecutionTargetIdentityDigestHex(input, runtime, binding);
        const processBindingDigestHex = sha256CanonicalJson({
          schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
          executionTargetIdentityDigestHex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          initialSnapshot,
        }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_EXECUTION_PROCESS_V1');
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true as const,
          witnessReadOnly: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'mining'
          ) {
            throw new Error('isolated Ergo execution processes are not active');
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_EXECUTION_TARGET_BINDINGS.set(target, Object.freeze({
          processBindingDigestHex,
          executionTargetIdentityDigestHex,
          assertActiveProcesses,
        }));
        state = 'action';
        ACTIVE_OWNED_EXECUTION_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_EXECUTION_TARGETS.delete(target);
        }
        state = 'mining';

        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        primary = spawnOwnedNode(input, runtime, 'primary', 'non-mining');
        const finalSnapshot = await waitForMinimumIndexedSnapshot(primary);
        witness = spawnOwnedNode(input, runtime, 'witness', 'non-mining');
        await waitForExactSnapshot(witness, finalSnapshot, STARTUP_TIMEOUT_MS);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, finalSnapshot);
        recheckRuntimeFiles(input, runtime);
        state = 'read-only';

        const receipt: SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
            version: 1 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryMiningDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            initialSnapshot,
            finalSnapshot,
          });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withMiningStoppedReadOnlyTarget: async <T>(
      action: (
        target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'mining' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
      ) {
        throw new Error('isolated Ergo read-only action requires the active mining phase');
      }
      if (typeof action !== 'function') {
        throw new Error('isolated Ergo read-only action is required');
      }
      activeOperation = 'transition';
      try {
        await waitForMinimumIndexedSnapshot(primary);
        await waitForMinimumIndexedSnapshot(witness);
        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        primary = spawnOwnedNode(input, runtime, 'primary', 'non-mining');
        const frozenSnapshot = await waitForMinimumIndexedSnapshot(primary);
        witness = spawnOwnedNode(input, runtime, 'witness', 'non-mining');
        await waitForExactSnapshot(witness, frozenSnapshot, STARTUP_TIMEOUT_MS);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, frozenSnapshot);

        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          miningStopped: true as const,
        });
        const processBindingDigestHex = deriveProcessBindingDigestHex(
          input,
          runtime,
          frozenSnapshot,
        );
        OWNED_READ_ONLY_TARGET_BINDINGS.set(target, Object.freeze({
          processBindingDigestHex,
          executionTargetIdentityDigestHex:
            deriveExecutionTargetIdentityDigestHex(input, runtime, binding),
          assertActiveProcesses: () => {
            if (
              state !== 'action' || primary === undefined || witness === undefined
              || runtime === undefined
            ) {
              throw new Error('isolated Ergo read-only processes are not active');
            }
            assertOwnedNodeIdentity(input, runtime, primary);
            assertOwnedNodeIdentity(input, runtime, witness);
            assertOwnedListenerBindings(primary, witness);
            recheckRuntimeFiles(input, runtime);
          },
        }));
        state = 'action';
        ACTIVE_OWNED_READ_ONLY_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_READ_ONLY_TARGETS.delete(target);
        }
        state = 'read-only';

        await assertStableExactSnapshot(primary, witness, frozenSnapshot);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        recheckRuntimeFiles(input, runtime);

        const receipt: SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
            version: 1 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            miningStoppedBeforeAction: true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            finalSnapshot: frozenSnapshot,
            checks: Object.freeze({
              directJavaAssemblyLaunch: true as const,
              javaImageAndPinnedFilesRechecked: true as const,
              isolatedFreshRuntimeStateUsed: true as const,
              setupSignerSecretNeverExposedToCompositionRoot: true as const,
              setupSignerMiningCredentialConsumedOnce: true as const,
              ephemeralPowSecretPassedOnlyViaProcessEnvironment: true as const,
              ephemeralPowSecretDiscardedBeforeAction: true as const,
              miningTargetBoundToSessionPublicKey: true as const,
              miningPhaseStoppedBeforeTargetFreeze: true as const,
              sameDataDirectoriesResumedNonMining: true as const,
              managedActionCompletionJoinedBeforeCleanup: true as const,
              managedActionOverrunRejectedAfterJoin: true as const,
              unverifiedProcessTerminationFailsStop: true as const,
              exactNonMiningSnapshotStableAcrossAction: true as const,
              spawnedProcessListenersExclusivelyLoopbackOwned: true as const,
              configurationAndArtifactRecheckedAfterAction: true as const,
            }),
          });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withCheckpointExtensionMiningTarget: async <T>(
      checkpointExtensionValueHexValue: string,
      policy: Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningPolicyV1>,
      action: (
        target: Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'read-only' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'non-mining' || witness.mode !== 'non-mining'
      ) {
        throw new Error(
          'isolated Ergo checkpoint mining action requires the frozen first execution',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated Ergo checkpoint mining action is required');
      }
      if (
        typeof policy !== 'object'
        || policy === null
        || Array.isArray(policy)
        || Object.keys(policy).some(key => key !== 'minimumTipHeight')
      ) {
        throw new Error('isolated Ergo checkpoint mining policy is invalid');
      }
      const checkpointExtensionValueHex = fixedHex(
        checkpointExtensionValueHexValue,
        64,
        'isolated checkpoint extension value',
      );
      const extensionFields =
        `${CHECKPOINT_EXTENSION_KEY_HEX}:${checkpointExtensionValueHex}`;
      const credential = checkpointMiningCredential;
      if (credential === undefined) {
        throw new Error(
          'isolated checkpoint mining credential is absent, consumed, or revoked',
        );
      }
      activeOperation = 'anchor';
      try {
        const priorSnapshot = await waitForCommonIndexedSnapshot(primary, witness);
        const requiredCheckpointTipHeight =
          deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(
            priorSnapshot.fullHeight,
            policy.minimumTipHeight,
          );
        await assertStableExactSnapshot(primary, witness, priorSnapshot);
        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        checkpointMiningCredential = undefined;
        let launchedPrimary: OwnedNode | undefined;
        consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          binding.miningTargetPublicKeyHex,
          ephemeralMiningMnemonic => {
            launchedPrimary = spawnOwnedNode(
              input,
              runtime!,
              'primary',
              'mining',
              ephemeralMiningMnemonic,
              extensionFields,
            );
          },
        );
        if (launchedPrimary === undefined) {
          throw new Error('isolated Ergo checkpoint mining process did not start');
        }
        primary = launchedPrimary;
        await waitForBasicNodeReadiness(primary);
        assertOwnedNodeIdentity(input, runtime, primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'mining',
          undefined,
          extensionFields,
        );
        await waitForBasicNodeReadiness(witness);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        const minedSnapshot = await waitForCommonIndexedSnapshotAfterHeight(
          primary,
          witness,
          requiredCheckpointTipHeight - 1,
        );

        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);
        primary = spawnOwnedNode(
          input,
          runtime,
          'primary',
          'non-mining',
          undefined,
          extensionFields,
        );
        const finalSnapshot = await waitForMinimumIndexedSnapshot(primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'non-mining',
          undefined,
          extensionFields,
        );
        await waitForExactSnapshot(witness, finalSnapshot, STARTUP_TIMEOUT_MS);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, finalSnapshot);
        recheckRuntimeFiles(input, runtime);

        const executionTargetIdentityDigestHex =
          deriveExecutionTargetIdentityDigestHex(
            input,
            runtime,
            binding,
            extensionFields,
          );
        const extensionFieldsSha256Hex =
          sha256(Buffer.from(extensionFields, 'ascii'));
        const processBindingDigestHex = sha256CanonicalJson({
          schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
          executionTargetIdentityDigestHex,
          extensionFieldsSha256Hex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          priorSnapshot,
          minedSnapshot,
          finalSnapshot,
        }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_PROCESS_V1');
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          miningStopped: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'non-mining'
            || witness.mode !== 'non-mining'
          ) {
            throw new Error('isolated Ergo checkpoint observation processes are not active');
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_CHECKPOINT_TARGET_BINDINGS.set(target, Object.freeze({
          processBindingDigestHex,
          executionTargetIdentityDigestHex,
          assertActiveProcesses,
        }));
        state = 'action';
        ACTIVE_OWNED_CHECKPOINT_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_CHECKPOINT_TARGETS.delete(target);
        }
        state = 'read-only';

        await assertStableExactSnapshot(primary, witness, finalSnapshot);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        recheckRuntimeFiles(input, runtime);
        const checkpointExtensionObservationDigestHex =
          await observeExactCheckpointExtensionOnBothNodes(
            primary,
            witness,
            finalSnapshot,
            checkpointExtensionValueHex,
          );
        checkpointExecutionContinuation = Object.freeze({
          extensionFields,
          extensionValueHex: checkpointExtensionValueHex,
          extensionFieldsSha256Hex,
          checkpointSnapshot: finalSnapshot,
          executionTargetIdentityDigestHex,
          checkpointExtensionObservationDigestHex,
        });

        const receipt: SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
            version: 1 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            miningStoppedBeforeObservation: true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: checkpointExtensionValueHex,
            extensionFieldsSha256Hex,
            priorSnapshot,
            minedSnapshot,
            finalSnapshot,
          });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withCheckpointBoundMiningActiveExecutionTarget: async <T>(
      action: (
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
        >,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'read-only' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'non-mining' || witness.mode !== 'non-mining'
        || checkpointExecutionContinuation === undefined
      ) {
        throw new Error(
          'isolated Ergo checkpoint-bound execution requires one completed checkpoint observation',
        );
      }
      if (trackerAdmissionMiningCredential === undefined) {
        throw new Error(
          'isolated tracker-admission mining credential is absent, consumed, or revoked',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated Ergo checkpoint-bound execution action is required');
      }
      activeOperation = 'checkpoint-execution';
      try {
        const continuation = checkpointExecutionContinuation;
        await assertStableExactSnapshot(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        const credential = trackerAdmissionMiningCredential;
        trackerAdmissionMiningCredential = undefined;
        let launchedPrimary: OwnedNode | undefined;
        consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          binding.miningTargetPublicKeyHex,
          ephemeralMiningMnemonic => {
            launchedPrimary = spawnOwnedNode(
              input,
              runtime!,
              'primary',
              'mining',
              ephemeralMiningMnemonic,
              continuation.extensionFields,
            );
          },
        );
        if (launchedPrimary === undefined) {
          throw new Error(
            'isolated Ergo checkpoint-bound primary mining process did not start',
          );
        }
        primary = launchedPrimary;
        await waitForBasicNodeReadiness(primary);
        assertOwnedNodeIdentity(input, runtime, primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'mining',
          undefined,
          continuation.extensionFields,
        );
        await waitForBasicNodeReadiness(witness);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        const initialSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const executionTargetIdentityDigestHex =
          deriveExecutionTargetIdentityDigestHex(
            input,
            runtime,
            binding,
            continuation.extensionFields,
          );
        if (
          executionTargetIdentityDigestHex
            !== continuation.executionTargetIdentityDigestHex
        ) {
          throw new Error(
            'isolated Ergo checkpoint-bound execution target identity changed',
          );
        }
        const processBindingDigestHex = sha256CanonicalJson({
          schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
          executionTargetIdentityDigestHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          initialSnapshot,
        }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_EXECUTION_PROCESS_V1');
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true as const,
          witnessReadOnly: true as const,
          checkpointBound: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'mining'
          ) {
            throw new Error(
              'isolated Ergo checkpoint-bound execution processes are not active',
            );
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_CHECKPOINT_BOUND_EXECUTION_TARGET_BINDINGS.set(
          target,
          Object.freeze({
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            assertActiveProcesses,
          }),
        );
        state = 'action';
        ACTIVE_OWNED_CHECKPOINT_BOUND_EXECUTION_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_CHECKPOINT_BOUND_EXECUTION_TARGETS.delete(target);
        }
        state = 'mining';

        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);
        primary = spawnOwnedNode(
          input,
          runtime,
          'primary',
          'non-mining',
          undefined,
          continuation.extensionFields,
        );
        const finalSnapshot = await waitForMinimumIndexedSnapshot(primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'non-mining',
          undefined,
          continuation.extensionFields,
        );
        await waitForExactSnapshot(witness, finalSnapshot, STARTUP_TIMEOUT_MS);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, finalSnapshot);
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);
        state = 'read-only';
        checkpointExecutionContinuation = undefined;

        const receipt:
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
            version: 1 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryMiningDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            checkpointExtensionBoundDuringAction: true as const,
            trackerAdmissionMiningCredentialConsumedOnce: true as const,
            checkpointSnapshotRevalidatedOnBothNodes: true as const,
            checkpointExtensionObservationDigestHex:
              continuation.checkpointExtensionObservationDigestHex,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: continuation.extensionValueHex,
            extensionFieldsSha256Hex:
              continuation.extensionFieldsSha256Hex,
            checkpointSnapshot: continuation.checkpointSnapshot,
            initialSnapshot,
            finalSnapshot,
          });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withCheckpointBoundMiningStoppedExecutionTarget: async <T>(
      action: (
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
        >,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'read-only' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'non-mining' || witness.mode !== 'non-mining'
        || checkpointExecutionContinuation === undefined
      ) {
        throw new Error(
          'isolated Ergo checkpoint-bound execution requires one completed checkpoint observation',
        );
      }
      if (trackerAdmissionMiningCredential === undefined) {
        throw new Error(
          'isolated tracker-admission mining credential is absent, consumed, or revoked',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated Ergo checkpoint-bound execution action is required');
      }
      activeOperation = 'checkpoint-execution';
      try {
        const continuation = checkpointExecutionContinuation;
        await assertStableExactSnapshot(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        const credential = trackerAdmissionMiningCredential;
        trackerAdmissionMiningCredential = undefined;
        let launchedPrimary: OwnedNode | undefined;
        consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          binding.miningTargetPublicKeyHex,
          ephemeralMiningMnemonic => {
            launchedPrimary = spawnOwnedNode(
              input,
              runtime!,
              'primary',
              'mining',
              ephemeralMiningMnemonic,
              continuation.extensionFields,
            );
          },
        );
        if (launchedPrimary === undefined) {
          throw new Error(
            'isolated Ergo checkpoint-bound primary mining process did not start',
          );
        }
        primary = launchedPrimary;
        await waitForBasicNodeReadiness(primary);
        assertOwnedNodeIdentity(input, runtime, primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'mining',
          undefined,
          continuation.extensionFields,
        );
        await waitForBasicNodeReadiness(witness);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        const preFreezeMiningSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);
        primary = spawnOwnedNode(
          input,
          runtime,
          'primary',
          'non-mining',
          undefined,
          continuation.extensionFields,
        );
        const frozenSnapshot = await waitForMinimumIndexedSnapshot(primary);
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'non-mining',
          undefined,
          continuation.extensionFields,
        );
        await waitForExactSnapshot(witness, frozenSnapshot, STARTUP_TIMEOUT_MS);
        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, frozenSnapshot);
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const executionTargetIdentityDigestHex =
          deriveExecutionTargetIdentityDigestHex(
            input,
            runtime,
            binding,
            continuation.extensionFields,
          );
        if (
          executionTargetIdentityDigestHex
            !== continuation.executionTargetIdentityDigestHex
        ) {
          throw new Error(
            'isolated Ergo checkpoint-bound execution target identity changed',
          );
        }
        const processBindingDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
          executionTargetIdentityDigestHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          preFreezeMiningSnapshot,
          actionStartSnapshot: frozenSnapshot,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
        }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_PROCESS_V2');
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: false as const,
          primaryReadOnly: true as const,
          witnessReadOnly: true as const,
          miningStopped: true as const,
          checkpointBound: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'non-mining'
            || witness.mode !== 'non-mining'
          ) {
            throw new Error(
              'isolated Ergo checkpoint-bound execution processes are not active',
            );
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGET_BINDINGS.set(
          target,
          Object.freeze({
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            assertActiveProcesses,
          }),
        );
        state = 'action';
        ACTIVE_OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_CHECKPOINT_BOUND_FROZEN_EXECUTION_TARGETS.delete(target);
        }
        state = 'read-only';

        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(primary, witness, frozenSnapshot);
        const [actionEndSnapshot, witnessActionEndSnapshot] = await Promise.all([
          readTargetSnapshot(primary),
          readTargetSnapshot(witness),
        ]);
        assertExactSnapshot(actionEndSnapshot, frozenSnapshot, 'primary');
        assertExactSnapshot(witnessActionEndSnapshot, frozenSnapshot, 'witness');
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);
        checkpointExecutionContinuation = undefined;

        const receipt:
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
            version: 2 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryMiningDuringAction: false as const,
            primaryReadOnlyDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            miningStoppedBeforeAction: true as const,
            exactFrozenSnapshotStableAcrossAction: true as const,
            checkpointExtensionBoundDuringAction: true as const,
            trackerAdmissionMiningCredentialConsumedOnce: true as const,
            checkpointSnapshotRevalidatedOnBothNodes: true as const,
            checkpointExtensionObservationDigestHex:
              continuation.checkpointExtensionObservationDigestHex,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: continuation.extensionValueHex,
            extensionFieldsSha256Hex:
              continuation.extensionFieldsSha256Hex,
            checkpointSnapshot: continuation.checkpointSnapshot,
            preFreezeMiningSnapshot,
            actionStartSnapshot: frozenSnapshot,
            actionEndSnapshot,
          });
        trackerReservationFreshnessContinuation = Object.freeze({
          processBindingDigestHex,
          executionTargetIdentityDigestHex,
          extensionValueHex: continuation.extensionValueHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          checkpointExtensionObservationDigestHex:
            continuation.checkpointExtensionObservationDigestHex,
          frozenSnapshot: actionEndSnapshot,
        });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withCheckpointBoundReservationFreshnessRevalidationTarget: async <T>(
      action: (
        target: Readonly<
          SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
        >,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'read-only' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'non-mining' || witness.mode !== 'non-mining'
        || trackerReservationFreshnessContinuation === undefined
      ) {
        throw new Error(
          'isolated tracker reservation freshness requires one completed frozen tracker check',
        );
      }
      if (typeof action !== 'function') {
        throw new Error(
          'isolated tracker reservation freshness action is required',
        );
      }
      activeOperation = 'checkpoint-freshness';
      try {
        const continuation = trackerReservationFreshnessContinuation;
        trackerReservationFreshnessContinuation = undefined;
        await assertStableExactSnapshot(
          primary,
          witness,
          continuation.frozenSnapshot,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);
        const [actionStartSnapshot, witnessActionStartSnapshot] =
          await Promise.all([
            readTargetSnapshot(primary),
            readTargetSnapshot(witness),
          ]);
        assertExactSnapshot(
          actionStartSnapshot,
          continuation.frozenSnapshot,
          'primary',
        );
        assertExactSnapshot(
          witnessActionStartSnapshot,
          continuation.frozenSnapshot,
          'witness',
        );

        const executionTargetIdentityDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
          trackerCheckExecutionTargetIdentityDigestHex:
            continuation.executionTargetIdentityDigestHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          trackerCheckSnapshot: continuation.frozenSnapshot,
        });
        const processBindingDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
          executionTargetIdentityDigestHex,
          trackerCheckProcessBindingDigestHex:
            continuation.processBindingDigestHex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          actionStartSnapshot,
        });

        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: false as const,
          primaryReadOnly: true as const,
          witnessReadOnly: true as const,
          miningStopped: true as const,
          checkpointBound: true as const,
          reservationFreshnessRevalidation: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'non-mining'
            || witness.mode !== 'non-mining'
          ) {
            throw new Error(
              'isolated tracker reservation freshness processes are not active',
            );
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_TRACKER_RESERVATION_FRESHNESS_TARGET_BINDINGS.set(
          target,
          Object.freeze({
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            assertActiveProcesses,
          }),
        );
        state = 'action';
        ACTIVE_OWNED_TRACKER_RESERVATION_FRESHNESS_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_TRACKER_RESERVATION_FRESHNESS_TARGETS.delete(target);
        }
        state = 'read-only';

        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        await assertStableExactSnapshot(
          primary,
          witness,
          continuation.frozenSnapshot,
        );
        const [actionEndSnapshot, witnessActionEndSnapshot] = await Promise.all([
          readTargetSnapshot(primary),
          readTargetSnapshot(witness),
        ]);
        assertExactSnapshot(
          actionEndSnapshot,
          continuation.frozenSnapshot,
          'primary',
        );
        assertExactSnapshot(
          witnessActionEndSnapshot,
          continuation.frozenSnapshot,
          'witness',
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const receipt:
          SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
            version: 1 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryReadOnlyDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            miningStoppedBeforeAction: true as const,
            exactFrozenSnapshotStableAcrossAction: true as const,
            sameProcessesAsTrackerCheck: true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            trackerCheckProcessBindingDigestHex:
              continuation.processBindingDigestHex,
            trackerCheckExecutionTargetIdentityDigestHex:
              continuation.executionTargetIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            trackerCheckSnapshot: continuation.frozenSnapshot,
            actionStartSnapshot,
            actionEndSnapshot,
            checkpointExtensionBoundDuringAction: true as const,
            checkpointSnapshotRevalidatedOnBothNodes: true as const,
            checkpointExtensionObservationDigestHex:
              continuation.checkpointExtensionObservationDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: continuation.extensionValueHex,
            extensionFieldsSha256Hex:
              continuation.extensionFieldsSha256Hex,
            checkpointSnapshot: continuation.checkpointSnapshot,
          });
        trackerTransportContinuation = Object.freeze({
          reservationFreshnessTarget: target,
          reservationFreshnessProcessBindingDigestHex: processBindingDigestHex,
          reservationFreshnessExecutionTargetIdentityDigestHex:
            executionTargetIdentityDigestHex,
          extensionValueHex: continuation.extensionValueHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          checkpointExtensionObservationDigestHex:
            continuation.checkpointExtensionObservationDigestHex,
          frozenSnapshot: actionEndSnapshot,
        });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    withCheckpointBoundTrackerTransportTarget: async <T>(
      completion: Readonly<
        SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
      >,
      action: (
        target: Readonly<
          SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2
        >,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'read-only' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'non-mining' || witness.mode !== 'non-mining'
        || trackerTransportContinuation === undefined
      ) {
        throw new Error(
          'isolated tracker transport requires one completed reservation freshness check',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated tracker transport action is required');
      }
      if (trackerConfirmationMiningCredential === undefined) {
        throw new Error(
          'isolated tracker-confirmation mining credential is absent, consumed, or revoked',
        );
      }
      const completionBinding =
        OWNED_TRACKER_RESERVATION_FRESHNESS_COMPLETIONS.get(completion);
      if (
        completionBinding === undefined
        || completionBinding.target
          !== trackerTransportContinuation.reservationFreshnessTarget
        || completionBinding.binding.processBindingDigestHex
          !== trackerTransportContinuation
            .reservationFreshnessProcessBindingDigestHex
        || completionBinding.binding.executionTargetIdentityDigestHex
          !== trackerTransportContinuation
            .reservationFreshnessExecutionTargetIdentityDigestHex
      ) {
        throw new Error(
          'isolated tracker transport lacks exact reservation freshness completion',
        );
      }
      OWNED_TRACKER_RESERVATION_FRESHNESS_COMPLETIONS.delete(completion);
      activeOperation = 'tracker-transport';
      let targetActivationFailurePhase:
        SubstrateFederatedIsolatedDevnetTrackerTargetPreActionPhaseV1 | null =
          null;
      try {
        const continuation = trackerTransportContinuation;
        trackerTransportContinuation = undefined;
        targetActivationFailurePhase =
          'tracker transport frozen snapshot revalidation';
        await assertStableExactSnapshot(
          primary,
          witness,
          continuation.frozenSnapshot,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        targetActivationFailurePhase = 'tracker transport node shutdown';
        await stopOwnedNode(primary, true);
        primary = undefined;
        await stopOwnedNode(witness, true);
        witness = undefined;
        assertPortsUnowned(OWNED_PORTS);
        recheckRuntimeFiles(input, runtime);

        targetActivationFailurePhase = 'tracker transport witness restart';
        witness = spawnOwnedNode(
          input,
          runtime,
          'witness',
          'mining',
          undefined,
          `${CHECKPOINT_EXTENSION_KEY_HEX}:${continuation.extensionValueHex}`,
        );
        await waitForBasicNodeReadiness(witness);
        assertOwnedNodeIdentity(input, runtime, witness);

        targetActivationFailurePhase = 'tracker transport primary restart';
        const credential = trackerConfirmationMiningCredential;
        trackerConfirmationMiningCredential = undefined;
        let launchedPrimary: OwnedNode | undefined;
        consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          binding.miningTargetPublicKeyHex,
          ephemeralMiningMnemonic => {
            launchedPrimary = spawnOwnedNode(
              input,
              runtime!,
              'primary',
              'mining',
              ephemeralMiningMnemonic,
              `${CHECKPOINT_EXTENSION_KEY_HEX}:${continuation.extensionValueHex}`,
            );
          },
        );
        if (launchedPrimary === undefined) {
          throw new Error(
            'isolated tracker-transport primary mining process did not start',
          );
        }
        primary = launchedPrimary;
        await waitForBasicNodeReadiness(primary);
        assertOwnedNodeIdentity(input, runtime, primary);
        targetActivationFailurePhase =
          'tracker transport post-restart continuity';
        assertOwnedListenerBindings(primary, witness);
        const actionStartSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertPostRestartContinuity(
          primary,
          witness,
          actionStartSnapshot,
          continuation.frozenSnapshot,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        targetActivationFailurePhase = null;
        const executionTargetIdentityDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA,
          reservationFreshnessExecutionTargetIdentityDigestHex:
            continuation.reservationFreshnessExecutionTargetIdentityDigestHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          reservationFreshnessSnapshot: continuation.frozenSnapshot,
          actionStartSnapshot,
        });
        const processBindingDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA,
          executionTargetIdentityDigestHex,
          reservationFreshnessProcessBindingDigestHex:
            continuation.reservationFreshnessProcessBindingDigestHex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          actionStartSnapshot,
        });
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true as const,
          witnessReadOnly: true as const,
          checkpointBound: true as const,
          reservationFreshnessCheckBound: true as const,
          trackerTransport: true as const,
          sameProcessCanonicalConfirmation: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'mining'
            || witness.mode !== 'mining'
          ) {
            throw new Error(
              'isolated tracker transport processes are not active',
            );
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_TRACKER_TRANSPORT_TARGET_BINDINGS.set(
          target,
          Object.freeze({
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            reservationFreshnessProcessBindingDigestHex:
              continuation.reservationFreshnessProcessBindingDigestHex,
            reservationFreshnessExecutionTargetIdentityDigestHex:
              continuation.reservationFreshnessExecutionTargetIdentityDigestHex,
            assertActiveProcesses,
          }),
        );
        state = 'action';
        ACTIVE_OWNED_TRACKER_TRANSPORT_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_TRACKER_TRANSPORT_TARGETS.delete(target);
        }
        state = 'mining';

        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        const actionEndSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const receipt:
          SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV2Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA,
            version: 2 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryMiningDuringAction: true as const,
            trackerTransportTargetActiveOnlyDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            miningRestartedBeforeAction: true as const,
            sameProcessesAsReservationFreshness: false as const,
            exactReservationFreshnessSnapshotRevalidatedBeforeAction:
              true as const,
            trackerConfirmationMiningCredentialConsumedBeforeTransportOnce:
              true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            reservationFreshnessProcessBindingDigestHex:
              continuation.reservationFreshnessProcessBindingDigestHex,
            reservationFreshnessExecutionTargetIdentityDigestHex:
              continuation.reservationFreshnessExecutionTargetIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            reservationFreshnessSnapshot: continuation.frozenSnapshot,
            actionStartSnapshot,
            actionEndSnapshot,
            checkpointExtensionBoundDuringAction: true as const,
            checkpointSnapshotRevalidatedOnBothNodes: true as const,
            checkpointExtensionObservationDigestHex:
              continuation.checkpointExtensionObservationDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: continuation.extensionValueHex,
            extensionFieldsSha256Hex:
              continuation.extensionFieldsSha256Hex,
            checkpointSnapshot: continuation.checkpointSnapshot,
          });
        trackerConfirmationContinuation = Object.freeze({
          trackerTransportProcessBindingDigestHex: processBindingDigestHex,
          trackerTransportExecutionTargetIdentityDigestHex:
            executionTargetIdentityDigestHex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          extensionValueHex: continuation.extensionValueHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          checkpointExtensionObservationDigestHex:
            continuation.checkpointExtensionObservationDigestHex,
          transportSnapshot: actionEndSnapshot,
        });
        return Object.freeze({ value, receipt });
      } catch (error) {
        const failurePhase = targetActivationFailurePhase;
        try {
          return await failWithCleanup(error);
        } catch (failure) {
          if (failurePhase !== null) {
            throw createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
              failurePhase,
              failure,
            );
          }
          throw failure;
        }
      } finally {
        activeOperation = undefined;
      }
    },
    withTrackerTransportConfirmationMiningTarget: async <T>(
      expectedTransactionIdHexValue: string,
      action: (
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => Promise<T>,
    ) => {
      if (
        state !== 'mining' || activeOperation !== undefined
        || runtime === undefined || primary === undefined || witness === undefined
        || primary.mode !== 'mining' || witness.mode !== 'mining'
        || trackerConfirmationContinuation === undefined
      ) {
        throw new Error(
          'isolated tracker confirmation requires one completed transport attempt',
        );
      }
      if (typeof action !== 'function') {
        throw new Error('isolated tracker confirmation action is required');
      }
      const confirmedTransactionIdHex = fixedHex(
        expectedTransactionIdHexValue,
        32,
        'isolated tracker confirmation transaction ID',
      );
      activeOperation = 'tracker-confirmation';
      try {
        const continuation = trackerConfirmationContinuation;
        trackerConfirmationContinuation = undefined;
        if (
          processId(primary) !== continuation.primaryProcessId
          || processId(witness) !== continuation.witnessProcessId
        ) {
          throw new Error(
            'isolated tracker confirmation process identity changed after transport',
          );
        }
        assertOwnedListenerBindings(primary, witness);
        const initialSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const executionTargetIdentityDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA,
          trackerTransportExecutionTargetIdentityDigestHex:
            continuation.trackerTransportExecutionTargetIdentityDigestHex,
          confirmedTransactionIdHex,
          extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
          checkpointSnapshot: continuation.checkpointSnapshot,
          transportSnapshot: continuation.transportSnapshot,
        });
        const processBindingDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA,
          executionTargetIdentityDigestHex,
          trackerTransportProcessBindingDigestHex:
            continuation.trackerTransportProcessBindingDigestHex,
          primaryProcessId: processId(primary),
          witnessProcessId: processId(witness),
          initialSnapshot,
        });
        const target = Object.freeze({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true as const,
          witnessReadOnly: true as const,
        });
        const assertActiveProcesses = (): void => {
          if (
            state !== 'action' || primary === undefined || witness === undefined
            || runtime === undefined || primary.mode !== 'mining'
            || witness.mode !== 'mining'
          ) {
            throw new Error(
              'isolated tracker-confirmation processes are not active',
            );
          }
          assertOwnedNodeIdentity(input, runtime, primary);
          assertOwnedNodeIdentity(input, runtime, witness);
          assertOwnedListenerBindings(primary, witness);
          recheckRuntimeFiles(input, runtime);
        };
        OWNED_EXECUTION_TARGET_BINDINGS.set(target, Object.freeze({
          processBindingDigestHex,
          executionTargetIdentityDigestHex,
          assertActiveProcesses,
        }));
        state = 'action';
        ACTIVE_OWNED_EXECUTION_TARGETS.add(target);
        let value: T;
        try {
          value = await runManagedAction(action, target);
        } finally {
          ACTIVE_OWNED_EXECUTION_TARGETS.delete(target);
        }
        state = 'mining';

        assertOwnedNodeIdentity(input, runtime, primary);
        assertOwnedNodeIdentity(input, runtime, witness);
        assertOwnedListenerBindings(primary, witness);
        const finalSnapshot = await waitForCommonIndexedSnapshot(
          primary,
          witness,
        );
        await assertCheckpointRemainsCanonical(
          primary,
          witness,
          continuation.checkpointSnapshot,
        );
        recheckRuntimeFiles(input, runtime);

        const receipt:
          SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt =
          Object.freeze({
            schema:
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA,
            version: 2 as const,
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            primaryMiningDuringAction: true as const,
            witnessReadOnlyDuringAction: true as const,
            buildIdentityDigestHex: input.buildIdentityDigestHex,
            executableIdentityDigestHex: input.executableIdentityDigestHex,
            processBindingDigestHex,
            executionTargetIdentityDigestHex,
            initialSnapshot,
            finalSnapshot,
            sameProcessesAsTrackerTransport: true as const,
            exactTrackerTransportBound: true as const,
            confirmedTransactionIdHex,
            trackerTransportProcessBindingDigestHex:
              continuation.trackerTransportProcessBindingDigestHex,
            trackerTransportExecutionTargetIdentityDigestHex:
              continuation.trackerTransportExecutionTargetIdentityDigestHex,
            checkpointExtensionBoundDuringAction: true as const,
            checkpointSnapshotRevalidatedOnBothNodes: true as const,
            checkpointExtensionObservationDigestHex:
              continuation.checkpointExtensionObservationDigestHex,
            extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
            extensionValueHex: continuation.extensionValueHex,
            extensionFieldsSha256Hex: continuation.extensionFieldsSha256Hex,
            checkpointSnapshot: continuation.checkpointSnapshot,
            transportSnapshot: continuation.transportSnapshot,
          });
        return Object.freeze({ value, receipt });
      } catch (error) {
        return await failWithCleanup(error);
      } finally {
        activeOperation = undefined;
      }
    },
    stop,
  });
}

/** @deprecated Active tracker transport campaigns use the V2 factory name. */
export const createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1 =
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2;

function normalizeProcessConstruction(
  inputValue: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input>,
  bindingValue: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>,
  miningCredentialValue:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  checkpointMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  trackerAdmissionMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
  trackerConfirmationMiningCredentialValue?:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>,
): Readonly<{
  readonly input: Readonly<NormalizedProcessInput>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>;
}> {
  try {
    if (process.platform !== 'win32') {
      throw new Error(
        'isolated Ergo owned-process V1 is supported only on Windows',
      );
    }
    const input = normalizeProcessInput(inputValue);
    const binding = normalizeLaunchBinding(bindingValue);
    assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      miningCredentialValue,
      binding.miningTargetPublicKeyHex,
    );
    if (checkpointMiningCredentialValue !== undefined) {
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        checkpointMiningCredentialValue,
        binding.miningTargetPublicKeyHex,
      );
      if (checkpointMiningCredentialValue === miningCredentialValue) {
        throw new Error(
          'isolated checkpoint mining credential must be independently one-shot',
        );
      }
    }
    if (trackerAdmissionMiningCredentialValue !== undefined) {
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerAdmissionMiningCredentialValue,
        binding.miningTargetPublicKeyHex,
      );
      if (
        trackerAdmissionMiningCredentialValue === miningCredentialValue
        || trackerAdmissionMiningCredentialValue
          === checkpointMiningCredentialValue
      ) {
        throw new Error(
          'isolated tracker-admission mining credential must be independently one-shot',
        );
      }
    }
    if (trackerConfirmationMiningCredentialValue !== undefined) {
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerConfirmationMiningCredentialValue,
        binding.miningTargetPublicKeyHex,
      );
      if (
        trackerConfirmationMiningCredentialValue === miningCredentialValue
        || trackerConfirmationMiningCredentialValue
          === checkpointMiningCredentialValue
        || trackerConfirmationMiningCredentialValue
          === trackerAdmissionMiningCredentialValue
      ) {
        throw new Error(
          'isolated tracker-confirmation mining credential must be independently one-shot',
        );
      }
    }
    return Object.freeze({ input, binding });
  } catch (error) {
    revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
      miningCredentialValue,
    );
    if (
      checkpointMiningCredentialValue !== undefined
      && checkpointMiningCredentialValue !== miningCredentialValue
    ) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        checkpointMiningCredentialValue,
      );
    }
    if (
      trackerAdmissionMiningCredentialValue !== undefined
      && trackerAdmissionMiningCredentialValue !== miningCredentialValue
      && trackerAdmissionMiningCredentialValue
        !== checkpointMiningCredentialValue
    ) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerAdmissionMiningCredentialValue,
      );
    }
    if (
      trackerConfirmationMiningCredentialValue !== undefined
      && trackerConfirmationMiningCredentialValue !== miningCredentialValue
      && trackerConfirmationMiningCredentialValue
        !== checkpointMiningCredentialValue
      && trackerConfirmationMiningCredentialValue
        !== trackerAdmissionMiningCredentialValue
    ) {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        trackerConfirmationMiningCredentialValue,
      );
    }
    throw error;
  }
}

function deriveProcessBindingDigestHex(
  input: NormalizedProcessInput,
  runtime: RuntimeLayout,
  finalSnapshot: TargetSnapshot,
): string {
  return sha256CanonicalJson({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
    buildIdentityDigestHex: input.buildIdentityDigestHex,
    executableIdentityDigestHex: input.executableIdentityDigestHex,
    configSha256Hex: runtime.configSha256Hex,
    logbackSha256Hex: runtime.logbackSha256Hex,
    extensionFieldsSha256Hex:
      sha256(Buffer.from(INITIAL_EXTENSION_FIELDS, 'ascii')),
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    primaryP2pPort: PRIMARY_P2P_PORT,
    witnessP2pPort: WITNESS_P2P_PORT,
    managedActionCompletionBudgetMs:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
    finalSnapshot,
  }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1');
}

function deriveExecutionTargetIdentityDigestHex(
  input: NormalizedProcessInput,
  runtime: RuntimeLayout,
  binding: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>,
  extensionFields: string = INITIAL_EXTENSION_FIELDS,
): string {
  return sha256CanonicalJson({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
    buildIdentityDigestHex: input.buildIdentityDigestHex,
    executableIdentityDigestHex: input.executableIdentityDigestHex,
    configSha256Hex: runtime.configSha256Hex,
    logbackSha256Hex: runtime.logbackSha256Hex,
    extensionFieldsSha256Hex: sha256(Buffer.from(extensionFields, 'ascii')),
    quickDevnetGenesisStateDigestHex: QUICK_DEVNET_GENESIS_STATE_DIGEST_HEX,
    miningTargetPublicKeyHex: binding.miningTargetPublicKeyHex,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    primaryP2pPort: PRIMARY_P2P_PORT,
    witnessP2pPort: WITNESS_P2P_PORT,
  }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_EXECUTION_TARGET_V1');
}

function normalizeProcessInput(
  value: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input>,
): Readonly<NormalizedProcessInput> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('isolated Ergo process input must be an object');
  }
  const javaExecutablePath = canonicalRegularFile(
    value.javaExecutablePath,
    'isolated Ergo Java executable',
  );
  const nodeAssemblyJarPath = canonicalRegularFile(
    value.nodeAssemblyJarPath,
    'isolated Ergo node assembly JAR',
  );
  const javaExecutableSha256Hex = digest(
    value.expectedJavaExecutableSha256Hex,
    'isolated Ergo Java executable SHA-256',
  );
  const nodeAssemblyJarSha256Hex = digest(
    value.expectedNodeAssemblyJarSha256Hex,
    'isolated Ergo node assembly JAR SHA-256',
  );
  const buildIdentityDigestHex = digest(
    value.buildIdentityDigestHex,
    'isolated Ergo node build identity',
  );
  if (fileSha256(javaExecutablePath) !== javaExecutableSha256Hex) {
    throw new Error('isolated Ergo Java executable differs from its exact pin');
  }
  if (fileSha256(nodeAssemblyJarPath) !== nodeAssemblyJarSha256Hex) {
    throw new Error('isolated Ergo node assembly JAR differs from its exact pin');
  }
  return Object.freeze({
    javaExecutablePath,
    javaExecutableSha256Hex,
    nodeAssemblyJarPath,
    nodeAssemblyJarSha256Hex,
    buildIdentityDigestHex,
    executableIdentityDigestHex: sha256CanonicalJson({
      launchMode: 'direct-java-jar',
      javaExecutableSha256Hex,
      nodeAssemblyJarSha256Hex,
      nodeMainClass: 'org.ergoplatform.ErgoApp',
      nodeNetworkArgument: '--devnet',
    }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_EXECUTABLE_V1'),
  });
}

function normalizeLaunchBinding(
  value: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('isolated Ergo launch binding must be an object');
  }
  const publicKeyHex = fixedHex(
    value.miningTargetPublicKeyHex,
    33,
    'isolated Ergo mining public key',
  );
  if (!publicKeyHex.startsWith('02') && !publicKeyHex.startsWith('03')) {
    throw new Error('isolated Ergo mining public key must be compressed');
  }
  if (value.p2pkErgoTreeHex !== `0008cd${publicKeyHex}`) {
    throw new Error('isolated Ergo mining P2PK tree differs from its public key');
  }
  if (
    value.rewardInputErgoTrees?.delay1
      !== deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 1)
    || value.rewardInputErgoTrees?.delay720
      !== deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 720)
  ) {
    throw new Error('isolated Ergo reward trees differ from the mining public key');
  }
  if (value.networkPrefix !== 16) {
    throw new Error('isolated Ergo launch binding requires network prefix 16');
  }
  if (
    value.primaryNodeOrigin !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || value.witnessNodeOrigin !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
  ) {
    throw new Error('isolated Ergo launch binding requires the fixed loopback origins');
  }
  return Object.freeze({
    miningTargetPublicKeyHex: publicKeyHex,
    p2pkErgoTreeHex: value.p2pkErgoTreeHex,
    rewardInputErgoTrees: Object.freeze({
      delay1: value.rewardInputErgoTrees.delay1,
      delay720: value.rewardInputErgoTrees.delay720,
    }),
    networkPrefix: 16 as const,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  });
}

function createOwnedRuntimeRoot(onCreated: (path: string) => void): string {
  const candidate = mkdtempSync(join(tmpdir(), 'e2s-fed6g1di3b-ergo-'));
  onCreated(candidate);
  const root = realpathSync(candidate);
  assertOwnedRuntimePath(root);
  return root;
}

function createRuntimeLayout(
  root: string,
  binding: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>,
): RuntimeLayout {
  assertOwnedRuntimePath(root);
  const primaryDataDirectory = createOwnedDirectory(root, 'primary-data');
  const witnessDataDirectory = createOwnedDirectory(root, 'witness-data');
  const primaryJavaTempDirectory = createOwnedDirectory(root, 'primary-jvm-temp');
  const witnessJavaTempDirectory = createOwnedDirectory(root, 'witness-jvm-temp');
  const logbackPath = join(root, 'logback.xml');
  writeFileSync(logbackPath, logbackBytes(), { flag: 'wx', mode: 0o600 });

  const configurations = [
    ['primary-mining.conf', 'primary', 'mining', primaryDataDirectory],
    ['witness-mining.conf', 'witness', 'mining', witnessDataDirectory],
    ['primary-non-mining.conf', 'primary', 'non-mining', primaryDataDirectory],
    ['witness-non-mining.conf', 'witness', 'non-mining', witnessDataDirectory],
  ] as const;
  const paths = new Map<string, string>();
  const hashes = new Map<string, string>();
  for (const [name, role, mode, dataDirectory] of configurations) {
    const path = join(root, name);
    const bytes = buildSubstrateFederatedIsolatedDevnetErgoNodeConfigV1({
      role,
      mode,
      dataDirectory,
      binding,
    });
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
    paths.set(name, path);
    hashes.set(name, sha256(bytes));
  }
  return Object.freeze({
    root,
    logbackPath,
    logbackSha256Hex: fileSha256(logbackPath),
    primaryDataDirectory,
    witnessDataDirectory,
    primaryJavaTempDirectory,
    witnessJavaTempDirectory,
    primaryMiningConfigPath: paths.get('primary-mining.conf')!,
    witnessMiningConfigPath: paths.get('witness-mining.conf')!,
    primaryNonMiningConfigPath: paths.get('primary-non-mining.conf')!,
    witnessNonMiningConfigPath: paths.get('witness-non-mining.conf')!,
    configSha256Hex: Object.freeze({
      primaryMining: hashes.get('primary-mining.conf')!,
      witnessMining: hashes.get('witness-mining.conf')!,
      primaryNonMining: hashes.get('primary-non-mining.conf')!,
      witnessNonMining: hashes.get('witness-non-mining.conf')!,
    }),
  });
}

export function buildSubstrateFederatedIsolatedDevnetErgoNodeConfigV1(
  input: Readonly<{
    role: NodeRole;
    mode: NodeMode;
    dataDirectory: string;
    binding: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1>;
  }>,
): Buffer {
  const { role, mode } = input;
  const dataDirectory = resolve(input.dataDirectory);
  if (!isAbsolute(input.dataDirectory)) {
    throw new Error('isolated Ergo data directory must be absolute');
  }
  const binding = normalizeLaunchBinding(input.binding);
  const primaryMining = role === 'primary' && mode === 'mining';
  const lines = [
    'ergo {',
    `  directory = "${hoconPath(dataDirectory)}"`,
    '  networkType = "devnet"',
    '  node {',
    `    miningPubKeyHex = "${binding.miningTargetPublicKeyHex}"`,
    `    mining = ${primaryMining ? 'true' : 'false'}`,
    `    offlineGeneration = ${primaryMining ? 'true' : 'false'}`,
    ...(primaryMining ? ['    internalMinerPollingInterval = 8s'] : []),
    '    useExternalMiner = false',
    '    extraIndex = true',
    '    minimalFeeAmount = 0',
    '  }',
    ...(primaryMining
      ? [
        `  wallet.testMnemonic = \${?${EPHEMERAL_MINING_MNEMONIC_ENVIRONMENT_VARIABLE}}`,
        '  wallet.testKeysQty = 1',
      ]
      : []),
    '  chain {',
    `    genesisStateDigestHex = "${QUICK_DEVNET_GENESIS_STATE_DIGEST_HEX}"`,
    '    monetary.minerRewardDelay = 1',
    '  }',
    '}',
    'scorex {',
    '  network {',
    `    bindAddress = "127.0.0.1:${role === 'primary' ? PRIMARY_P2P_PORT : WITNESS_P2P_PORT}"`,
    `    nodeName = "fed6g1di3b-ergo-${role}"`,
    `    knownPeers = ${role === 'primary' ? '[]' : '["127.0.0.1:9021"]'}`,
    '    declaredAddress = null',
    '    upnpEnabled = false',
    '  }',
    '  restApi {',
    `    bindAddress = "127.0.0.1:${role === 'primary' ? PRIMARY_REST_PORT : WITNESS_REST_PORT}"`,
    `    apiKeyHash = "${API_KEY_HASH_HEX}"`,
    '    publicUrl = null',
    '  }',
    '}',
    '',
  ];
  const bytes = Buffer.from(lines.join('\n'), 'ascii');
  const text = bytes.toString('ascii');
  const expectedMnemonicReference =
    `wallet.testMnemonic = \${?${EPHEMERAL_MINING_MNEMONIC_ENVIRONMENT_VARIABLE}}`;
  if (
    (primaryMining && !text.includes(expectedMnemonicReference))
    || (!primaryMining && /testMnemonic|testKeysQty/iu.test(text))
    || /testMnemonic\s*=\s*["']/iu.test(text)
    || /secretStorage/iu.test(text)
  ) {
    throw new Error('isolated Ergo node configuration exposed persistent wallet material');
  }
  return bytes;
}

function logbackBytes(): Buffer {
  return Buffer.from([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<configuration>',
    '  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">',
    '    <encoder><pattern>%d{HH:mm:ss.SSS} %-5level %logger{24} - %msg%n</pattern></encoder>',
    '  </appender>',
    '  <root level="INFO"><appender-ref ref="STDOUT"/></root>',
    '</configuration>',
    '',
  ].join('\n'), 'ascii');
}

function spawnOwnedNode(
  input: Readonly<NormalizedProcessInput>,
  runtime: Readonly<RuntimeLayout>,
  role: NodeRole,
  mode: NodeMode,
  ephemeralMiningMnemonic?: string,
  extensionFields: string = INITIAL_EXTENSION_FIELDS,
): OwnedNode {
  const requiresMiningSecret = role === 'primary' && mode === 'mining';
  if (
    requiresMiningSecret
      ? !isMnemonicPhrase(ephemeralMiningMnemonic)
      : ephemeralMiningMnemonic !== undefined
  ) {
    throw new Error('isolated Ergo ephemeral PoW secret does not match the process role');
  }
  const configPath = role === 'primary'
    ? mode === 'mining'
      ? runtime.primaryMiningConfigPath
      : runtime.primaryNonMiningConfigPath
    : mode === 'mining'
      ? runtime.witnessMiningConfigPath
      : runtime.witnessNonMiningConfigPath;
  const configSha256Hex = role === 'primary'
    ? mode === 'mining'
      ? runtime.configSha256Hex.primaryMining
      : runtime.configSha256Hex.primaryNonMining
    : mode === 'mining'
      ? runtime.configSha256Hex.witnessMining
      : runtime.configSha256Hex.witnessNonMining;
  assertFileDigest(configPath, configSha256Hex, `${role} ${mode} configuration`);
  const javaTempDirectory = role === 'primary'
    ? runtime.primaryJavaTempDirectory
    : runtime.witnessJavaTempDirectory;
  const args = [
    '-Xms256m',
    '-Xmx1024m',
    `-Djava.io.tmpdir=${javaTempDirectory}`,
    `-Dlogback.configurationFile=${runtime.logbackPath}`,
    '-jar',
    input.nodeAssemblyJarPath,
    '--devnet',
    '--config',
    configPath,
  ];
  const child = spawn(input.javaExecutablePath, args, {
    cwd: runtime.root,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: minimalEnvironment(ephemeralMiningMnemonic, extensionFields),
  });
  child.stdout?.resume();
  child.stderr?.resume();
  child.once('error', () => {
    PROCESS_START_ERRORS.add(child);
  });
  if (!Number.isSafeInteger(child.pid) || !child.pid) {
    child.kill('SIGKILL');
    throw new Error(`isolated Ergo ${role} ${mode} process did not expose a PID`);
  }
  return Object.freeze({ role, mode, child, configPath, configSha256Hex });
}

async function waitForBasicNodeReadiness(node: Readonly<OwnedNode>): Promise<void> {
  await retryNode(node, STARTUP_TIMEOUT_MS, async () => {
    const origin = node.role === 'primary'
      ? SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
      : SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
    const info = plainRecord(await getJson(origin, '/info'), `${node.role} node info`);
    const networkValue = info.network ?? info.networkType;
    if (typeof networkValue !== 'string' || networkValue.trim().toLowerCase() !== 'devnet') {
      throw new Error(`${node.role} node did not report devnet`);
    }
  });
}

async function waitForMinimumIndexedSnapshot(
  node: Readonly<OwnedNode>,
): Promise<Readonly<TargetSnapshot>> {
  return await retryNode(node, MINING_TIMEOUT_MS, async () => {
    const snapshot = await readTargetSnapshot(node);
    if (
      snapshot.fullHeight < MINIMUM_MINED_HEIGHT
      || snapshot.indexedHeight !== snapshot.fullHeight
    ) {
      throw new Error(`${node.role} has not observed and indexed enough signer rewards`);
    }
    return snapshot;
  });
}

async function waitForCommonIndexedSnapshot(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
): Promise<Readonly<TargetSnapshot>> {
  return await retryNode(primary, MINING_TIMEOUT_MS, async () => {
    assertLive(witness);
    const [primarySnapshot, witnessSnapshot] = await Promise.all([
      readTargetSnapshot(primary),
      readTargetSnapshot(witness),
    ]);
    if (
      primarySnapshot.fullHeight < MINIMUM_MINED_HEIGHT
      || primarySnapshot.indexedHeight !== primarySnapshot.fullHeight
      || witnessSnapshot.indexedHeight !== witnessSnapshot.fullHeight
      || primarySnapshot.fullHeight !== witnessSnapshot.fullHeight
      || primarySnapshot.headerIdHex !== witnessSnapshot.headerIdHex
    ) {
      throw new Error('isolated Ergo execution pair has not reached one common tip');
    }
    return primarySnapshot;
  });
}

async function waitForCommonIndexedSnapshotAfterHeight(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
  priorHeight: number,
): Promise<Readonly<TargetSnapshot>> {
  return await retryNode(primary, MINING_TIMEOUT_MS, async () => {
    const snapshot = await waitForCommonIndexedSnapshot(primary, witness);
    if (snapshot.fullHeight <= priorHeight) {
      throw new Error('isolated Ergo checkpoint extension has not reached a new common block');
    }
    return snapshot;
  });
}

async function assertCheckpointRemainsCanonical(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
  checkpoint: Readonly<TargetSnapshot>,
): Promise<void> {
  const path = `/blocks/at/${checkpoint.fullHeight}`;
  const [primaryIdsValue, witnessIdsValue] = await Promise.all([
    getJson(SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN, path),
    getJson(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, path),
  ]);
  for (const [role, value] of [
    ['primary', primaryIdsValue],
    ['witness', witnessIdsValue],
  ] as const) {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new Error(
        `isolated Ergo ${role} checkpoint height is not singular after restart`,
      );
    }
    const observedIdHex = fixedHex(
      value[0],
      32,
      `isolated Ergo ${role} checkpoint header ID`,
    );
    if (observedIdHex !== checkpoint.headerIdHex) {
      throw new Error(
        `isolated Ergo ${role} checkpoint is not canonical after restart`,
      );
    }
  }
  assertLive(primary);
  assertLive(witness);
}

async function assertPostRestartContinuity(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
  actionStartSnapshot: Readonly<TargetSnapshot>,
  frozenSnapshot: Readonly<TargetSnapshot>,
): Promise<void> {
  const path = `/blocks/at/${frozenSnapshot.fullHeight}`;
  const [primaryHeaderIdsAtFrozenHeight, witnessHeaderIdsAtFrozenHeight] =
    await Promise.all([
      getJson(SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN, path),
      getJson(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, path),
    ]);
  assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1({
    actionStartSnapshot,
    frozenSnapshot,
    primaryHeaderIdsAtFrozenHeight,
    witnessHeaderIdsAtFrozenHeight,
  });
  assertLive(primary);
  assertLive(witness);
}

export function assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1(
  input: Readonly<{
    actionStartSnapshot: Readonly<TargetSnapshot>;
    frozenSnapshot: Readonly<TargetSnapshot>;
    primaryHeaderIdsAtFrozenHeight: unknown;
    witnessHeaderIdsAtFrozenHeight: unknown;
  }>,
): void {
  const { actionStartSnapshot, frozenSnapshot } = input;
  if (
    actionStartSnapshot.network !== frozenSnapshot.network
    || actionStartSnapshot.indexedHeight !== actionStartSnapshot.fullHeight
    || actionStartSnapshot.fullHeight < frozenSnapshot.fullHeight
  ) {
    throw new Error(
      'isolated Ergo post-restart tip is not an indexed descendant of the frozen target',
    );
  }
  for (const [role, value] of [
    ['primary', input.primaryHeaderIdsAtFrozenHeight],
    ['witness', input.witnessHeaderIdsAtFrozenHeight],
  ] as const) {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new Error(
        `isolated Ergo ${role} frozen height is not singular after restart`,
      );
    }
    const observedIdHex = fixedHex(
      value[0],
      32,
      `isolated Ergo ${role} frozen header ID`,
    );
    if (observedIdHex !== frozenSnapshot.headerIdHex) {
      throw new Error(
        `isolated Ergo ${role} frozen snapshot is not canonical after restart`,
      );
    }
  }
}

async function observeExactCheckpointExtensionOnBothNodes(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
  checkpoint: Readonly<TargetSnapshot>,
  expectedExtensionValueHex: string,
): Promise<string> {
  const [primaryDigestHex, witnessDigestHex] = await Promise.all([
    observeExactCheckpointExtension(
      primary,
      checkpoint,
      expectedExtensionValueHex,
    ),
    observeExactCheckpointExtension(
      witness,
      checkpoint,
      expectedExtensionValueHex,
    ),
  ]);
  return deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestV1(
    checkpoint,
    expectedExtensionValueHex,
    primaryDigestHex,
    witnessDigestHex,
  );
}

export function deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestV1(
  checkpoint: Readonly<{
    readonly network: 'devnet';
    readonly fullHeight: number;
    readonly indexedHeight: number;
    readonly headerIdHex: string;
  }>,
  expectedExtensionValueHex: string,
  primaryObservationDigestHex: string,
  witnessObservationDigestHex: string,
): string {
  return deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromNodeDigestsV1(
    checkpoint,
    expectedExtensionValueHex,
    primaryObservationDigestHex,
    witnessObservationDigestHex,
  );
}

async function observeExactCheckpointExtension(
  node: Readonly<OwnedNode>,
  checkpoint: Readonly<TargetSnapshot>,
  expectedExtensionValueHex: string,
): Promise<string> {
  const origin = node.role === 'primary'
    ? SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    : SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  const block = plainRecord(
    await getJson(origin, `/blocks/${checkpoint.headerIdHex}`),
    `isolated Ergo ${node.role} checkpoint block`,
  );
  const observationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionNodeObservationDigestV1(
      node.role,
      checkpoint,
      expectedExtensionValueHex,
      block,
    );
  assertLive(node);
  return observationDigestHex;
}

export function deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionNodeObservationDigestV1(
  role: NodeRole,
  checkpoint: Readonly<{
    readonly fullHeight: number;
    readonly headerIdHex: string;
  }>,
  expectedExtensionValueHex: string,
  blockValue: unknown,
): string {
  const checkpointHeaderIdHex = fixedHex(
    checkpoint.headerIdHex,
    32,
    `isolated Ergo ${role} checkpoint header ID`,
  );
  const checkpointHeight = nonnegativeInteger(
    checkpoint.fullHeight,
    `isolated Ergo ${role} checkpoint height`,
  );
  const normalizedExtensionValueHex = fixedHex(
    expectedExtensionValueHex,
    64,
    `isolated Ergo ${role} checkpoint extension value`,
  );
  const block = plainRecord(
    blockValue,
    `isolated Ergo ${role} checkpoint block`,
  );
  const rawHeader = plainRecord(
    block.header,
    `isolated Ergo ${role} checkpoint block header`,
  );
  const canonicalHeaderBytes = normalizeErgoNodeHeaderBytes(rawHeader);
  const identity = parseErgoHeaderIdentity(canonicalHeaderBytes);
  const headerIdHex = computeErgoHeaderId(identity).toString('hex');
  if (
    headerIdHex !== checkpointHeaderIdHex
    || identity.height !== checkpointHeight
  ) {
    throw new Error(
      `isolated Ergo ${role} checkpoint block identity changed`,
    );
  }
  const extension = plainRecord(
    block.extension,
    `isolated Ergo ${role} checkpoint extension`,
  );
  if (!Array.isArray(extension.fields) || extension.fields.length === 0) {
    throw new Error(
      `isolated Ergo ${role} checkpoint extension fields are absent`,
    );
  }
  const fields = extension.fields.map((field, index) => {
    if (!Array.isArray(field) || field.length !== 2) {
      throw new Error(
        `isolated Ergo ${role} checkpoint extension field ${index} is malformed`,
      );
    }
    const keyHex = variableHex(
      field[0],
      `isolated Ergo ${role} checkpoint extension key ${index}`,
    );
    const valueHex = variableHex(
      field[1],
      `isolated Ergo ${role} checkpoint extension value ${index}`,
    );
    if (Buffer.from(keyHex, 'hex').length !== 2) {
      throw new Error(
        `isolated Ergo ${role} checkpoint extension key ${index} must be two bytes`,
      );
    }
    if (Buffer.from(valueHex, 'hex').length > 64) {
      throw new Error(
        `isolated Ergo ${role} checkpoint extension value ${index} exceeds 64 bytes`,
      );
    }
    return Object.freeze({ keyHex, valueHex });
  });
  const matching = fields.filter(field =>
    field.keyHex === CHECKPOINT_EXTENSION_KEY_HEX
  );
  if (
    matching.length !== 1
    || matching[0]!.valueHex !== normalizedExtensionValueHex
  ) {
    throw new Error(
      `isolated Ergo ${role} checkpoint does not contain the exact 0x0401 value`,
    );
  }
  const membership = buildErgoExtensionMembershipProof(
    fields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from(CHECKPOINT_EXTENSION_KEY_HEX, 'hex'),
  );
  const extensionRootHex = Buffer.from(identity.extensionHash).toString('hex');
  if (membership.root.toString('hex') !== extensionRootHex) {
    throw new Error(
      `isolated Ergo ${role} checkpoint extension root changed`,
    );
  }
  return deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionNodeObservationDigestV1({
    checkpoint: {
      network: 'devnet',
      fullHeight: identity.height,
      indexedHeight: identity.height,
      headerIdHex,
    },
    expectedExtensionValueHex: normalizedExtensionValueHex,
    canonicalHeaderBytesHex: canonicalHeaderBytes.toString('hex'),
    extensionRootHex,
    extensionFields: fields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
  });
}

async function waitForExactSnapshot(
  node: Readonly<OwnedNode>,
  expected: Readonly<TargetSnapshot>,
  timeoutMs: number,
): Promise<void> {
  await retryNode(node, timeoutMs, async () => {
    const actual = await readTargetSnapshot(node);
    assertExactSnapshot(actual, expected, node.role);
  });
}

async function assertStableExactSnapshot(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
  expected: Readonly<TargetSnapshot>,
): Promise<void> {
  await waitForExactSnapshot(primary, expected, STARTUP_TIMEOUT_MS);
  await waitForExactSnapshot(witness, expected, STARTUP_TIMEOUT_MS);
  await delay(STABILITY_DELAY_MS);
  const [primaryAfter, witnessAfter] = await Promise.all([
    readTargetSnapshot(primary),
    readTargetSnapshot(witness),
  ]);
  assertExactSnapshot(primaryAfter, expected, 'primary');
  assertExactSnapshot(witnessAfter, expected, 'witness');
}

async function readTargetSnapshot(
  node: Readonly<OwnedNode>,
): Promise<Readonly<TargetSnapshot>> {
  const origin = node.role === 'primary'
    ? SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    : SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  const [infoValue, headersValue, indexValue] = await Promise.all([
    getJson(origin, '/info'),
    getJson(origin, '/blocks/lastHeaders/1'),
    getJson(origin, '/blockchain/indexedHeight'),
  ]);
  const info = plainRecord(infoValue, `${node.role} node info`);
  const networkValue = info.network ?? info.networkType;
  if (typeof networkValue !== 'string' || networkValue.trim().toLowerCase() !== 'devnet') {
    throw new Error(`${node.role} node did not identify the exact devnet network`);
  }
  const fullHeight = nonnegativeInteger(info.fullHeight, `${node.role} full height`);
  if (!Array.isArray(headersValue) || headersValue.length !== 1) {
    throw new Error(`${node.role} best-header response is not singular`);
  }
  const header = plainRecord(headersValue[0], `${node.role} best header`);
  const headerHeight = nonnegativeInteger(header.height, `${node.role} header height`);
  if (headerHeight !== fullHeight) {
    throw new Error(`${node.role} best header differs from full height`);
  }
  const headerIdHex = fixedHex(header.id, 32, `${node.role} best header ID`);
  const index = plainRecord(indexValue, `${node.role} indexed height`);
  const indexedHeight = nonnegativeInteger(
    index.indexedHeight,
    `${node.role} indexed height`,
  );
  if (nonnegativeInteger(index.fullHeight, `${node.role} index full height`) !== fullHeight) {
    throw new Error(`${node.role} index full height differs from node info`);
  }
  return Object.freeze({
    network: 'devnet' as const,
    fullHeight,
    indexedHeight,
    headerIdHex,
  });
}

function assertExactSnapshot(
  actual: Readonly<TargetSnapshot>,
  expected: Readonly<TargetSnapshot>,
  role: NodeRole,
): void {
  if (
    actual.network !== expected.network
    || actual.fullHeight !== expected.fullHeight
    || actual.indexedHeight !== expected.fullHeight
    || actual.headerIdHex !== expected.headerIdHex
  ) {
    throw new Error(`isolated Ergo ${role} snapshot differs from the frozen target`);
  }
}

async function retryNode<T>(
  node: Readonly<OwnedNode>,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertLive(node);
    try {
      return await operation();
    } catch {
      await delay(250);
    }
  }
  throw new Error(
    `isolated Ergo ${node.role} ${node.mode} target did not become ready`,
  );
}

async function getJson(origin: string, path: string): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    method: 'GET',
    headers: { 'Accept-Encoding': 'identity', Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('isolated Ergo read returned non-success');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('isolated Ergo read exceeded the response limit');
  }
  return JSON.parse(text) as unknown;
}

async function stopOwnedNode(
  node: Readonly<OwnedNode> | undefined,
  requireOrderly: boolean,
): Promise<void> {
  if (node === undefined) return;
  if (node.child.exitCode !== null || node.child.signalCode !== null) {
    if (requireOrderly) {
      throw new Error(`isolated Ergo ${node.role} process exited before orderly stop`);
    }
    return;
  }
  if (!requireOrderly) {
    await forceStop(node);
    return;
  }
  let shutdownFailure: unknown;
  try {
    const origin = node.role === 'primary'
      ? SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
      : SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
    const response = await fetch(`${origin}/node/shutdown`, {
      method: 'POST',
      headers: { api_key: API_KEY, 'Accept-Encoding': 'identity' },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error('shutdown endpoint returned non-success');
    }
    await waitForClose(node.child, SHUTDOWN_TIMEOUT_MS);
  } catch (error) {
    shutdownFailure = error;
  }
  if (shutdownFailure !== undefined) {
    await forceStop(node);
    throw new Error(`isolated Ergo ${node.role} process did not stop orderly`, {
      cause: shutdownFailure,
    });
  }
}

async function forceStop(node: Readonly<OwnedNode>): Promise<void> {
  if (node.child.exitCode !== null || node.child.signalCode !== null) return;
  const closed = waitForClose(node.child, SHUTDOWN_TIMEOUT_MS);
  node.child.kill('SIGKILL');
  await closed;
}

async function waitForClose(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.off('close', closeHandler);
      reject(new Error('isolated Ergo process stop timed out'));
    }, timeoutMs);
    const closeHandler = () => {
      clearTimeout(timer);
      resolvePromise();
    };
    child.once('close', closeHandler);
  });
}

function assertOwnedNodeIdentity(
  input: Readonly<NormalizedProcessInput>,
  runtime: Readonly<RuntimeLayout>,
  node: Readonly<OwnedNode>,
): void {
  assertLive(node);
  const pid = processId(node);
  const runningPath = windowsRunningExecutablePath(pid);
  if (runningPath.toLowerCase() !== input.javaExecutablePath.toLowerCase()) {
    throw new Error(`isolated Ergo ${node.role} process image differs from Java`);
  }
  if (fileSha256(runningPath) !== input.javaExecutableSha256Hex) {
    throw new Error(`isolated Ergo ${node.role} running Java digest differs`);
  }
  assertFileDigest(
    input.nodeAssemblyJarPath,
    input.nodeAssemblyJarSha256Hex,
    'isolated Ergo node assembly JAR',
  );
  assertFileDigest(node.configPath, node.configSha256Hex, `${node.role} configuration`);
  assertFileDigest(runtime.logbackPath, runtime.logbackSha256Hex, 'logback configuration');
}

function assertOwnedListenerBindings(
  primary: Readonly<OwnedNode>,
  witness: Readonly<OwnedNode>,
): void {
  const expected = new Map<number, ReadonlySet<number>>([
    [processId(primary), new Set([PRIMARY_REST_PORT, PRIMARY_P2P_PORT])],
    [processId(witness), new Set([WITNESS_REST_PORT, WITNESS_P2P_PORT])],
  ]);
  const bindings = windowsProcessListenerBindings([...expected.keys()]);
  for (const binding of bindings) {
    if (
      !expected.get(binding.pid)?.has(binding.localPort)
      || !isLoopbackAddress(binding.localAddress)
    ) {
      throw new Error('isolated Ergo spawned process exposed an unexpected listener');
    }
  }
  for (const [pid, ports] of expected) {
    for (const port of ports) {
      if (!bindings.some(binding => (
        binding.pid === pid && binding.localPort === port
        && binding.localAddress === '127.0.0.1'
      ))) {
        throw new Error(
          'isolated Ergo expected listener is not loopback-owned by its spawned process',
        );
      }
    }
  }
}

function assertPortsUnowned(ports: readonly number[]): void {
  const bindings = windowsListenerBindings(ports);
  if ([...bindings.values()].some(value => value.length > 0)) {
    throw new Error('isolated Ergo process port is already owned');
  }
}

function windowsListenerBindings(
  ports: readonly number[],
): Map<number, ListenerBinding[]> {
  const powershell = windowsPowerShellPath();
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
    powershell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      cwd: resolve(process.env.SystemRoot ?? process.env.WINDIR!),
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error || result.signal !== null || result.status !== 0
    || result.stderr.trim() !== ''
  ) {
    throw new Error('Windows listener ownership inspection failed');
  }
  const parsed = JSON.parse(result.stdout || '[]') as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const bindings = new Map(ports.map(value => [value, [] as ListenerBinding[]]));
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Windows listener ownership output is malformed');
    }
    const record = row as Record<string, unknown>;
    const localAddress = record.LocalAddress;
    const localPort = Number(record.LocalPort);
    const pid = Number(record.OwningProcess);
    if (
      typeof localAddress !== 'string' || !bindings.has(localPort)
      || !Number.isSafeInteger(pid) || pid <= 0
    ) {
      throw new Error('Windows listener ownership row is malformed');
    }
    bindings.get(localPort)!.push({ pid, localAddress, localPort });
  }
  return bindings;
}

function windowsProcessListenerBindings(pids: readonly number[]): ListenerBinding[] {
  if (
    pids.length === 0
    || pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)
  ) {
    throw new Error('Windows listener ownership inspection requires process IDs');
  }
  const script = [
    `$pids=@(${pids.join(',')})`,
    'try { $rows=@(Get-NetTCPConnection -State Listen -OwningProcess $pids -ErrorAction Stop '
      + '| Select-Object LocalAddress,LocalPort,OwningProcess) } '
      + 'catch { if ($_.FullyQualifiedErrorId '
      + '-like "CmdletizationQuery_NotFound,Get-NetTCPConnection*") '
      + '{ $rows=@() } else { throw } }',
    'ConvertTo-Json -Compress -InputObject $rows',
  ].join('; ');
  const result = spawnSync(
    windowsPowerShellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      cwd: resolve(process.env.SystemRoot ?? process.env.WINDIR!),
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error || result.signal !== null || result.status !== 0
    || result.stderr.trim() !== ''
  ) {
    throw new Error('Windows process listener inspection failed');
  }
  const parsed = JSON.parse(result.stdout || '[]') as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map(row => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Windows process listener output is malformed');
    }
    const record = row as Record<string, unknown>;
    const localAddress = record.LocalAddress;
    const localPort = Number(record.LocalPort);
    const pid = Number(record.OwningProcess);
    if (
      typeof localAddress !== 'string'
      || !Number.isSafeInteger(localPort) || localPort <= 0 || localPort > 65_535
      || !pids.includes(pid)
    ) {
      throw new Error('Windows process listener row is malformed');
    }
    return { pid, localAddress, localPort };
  });
}

function windowsRunningExecutablePath(pid: number): string {
  const result = spawnSync(
    windowsPowerShellPath(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$value=(Get-Process -Id ${pid} -ErrorAction Stop).Path; [Console]::Out.Write($value)`,
    ],
    {
      cwd: resolve(process.env.SystemRoot ?? process.env.WINDIR!),
      env: minimalEnvironment(),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    },
  );
  if (
    result.error || result.signal !== null || result.status !== 0
    || result.stderr.trim() !== '' || result.stdout.trim() === ''
  ) {
    throw new Error('Windows process image inspection failed');
  }
  return canonicalRegularFile(result.stdout.trim(), 'running Java process image');
}

function windowsPowerShellPath(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('Windows SystemRoot is unavailable');
  }
  return resolve(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

function recheckRuntimeFiles(
  input: Readonly<NormalizedProcessInput>,
  runtime: Readonly<RuntimeLayout>,
): void {
  recheckProcessArtifacts(input);
  assertFileDigest(runtime.logbackPath, runtime.logbackSha256Hex, 'logback configuration');
  const files = [
    [runtime.primaryMiningConfigPath, runtime.configSha256Hex.primaryMining],
    [runtime.witnessMiningConfigPath, runtime.configSha256Hex.witnessMining],
    [runtime.primaryNonMiningConfigPath, runtime.configSha256Hex.primaryNonMining],
    [runtime.witnessNonMiningConfigPath, runtime.configSha256Hex.witnessNonMining],
  ] as const;
  for (const [path, expected] of files) {
    assertFileDigest(path, expected, 'isolated Ergo node configuration');
  }
}

function recheckProcessArtifacts(input: Readonly<NormalizedProcessInput>): void {
  assertFileDigest(
    input.javaExecutablePath,
    input.javaExecutableSha256Hex,
    'isolated Ergo Java executable',
  );
  assertFileDigest(
    input.nodeAssemblyJarPath,
    input.nodeAssemblyJarSha256Hex,
    'isolated Ergo node assembly JAR',
  );
}

function assertFileDigest(path: string, expected: string, label: string): void {
  if (fileSha256(canonicalRegularFile(path, label)) !== expected) {
    throw new Error(`${label} changed during the owned-process lifecycle`);
  }
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

function createOwnedDirectory(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path, { mode: 0o700 });
  const real = realpathSync(path);
  if (!isStrictDescendant(root, real) || lstatSync(real).isSymbolicLink()) {
    throw new Error('isolated Ergo runtime directory escaped its owned root');
  }
  return real;
}

function removeOwnedRuntime(path: string): void {
  assertOwnedRuntimePath(path);
  rmSync(path, { recursive: true, force: true, maxRetries: 3 });
}

function assertOwnedRuntimePath(path: string): void {
  const resolved = resolve(path);
  const tempRoot = realpathSync(tmpdir());
  if (
    !isStrictDescendant(tempRoot, resolved)
    || !resolve(resolved).startsWith(resolve(tempRoot) + sep)
    || !resolved.split(/[\\/]/u).at(-1)?.startsWith('e2s-fed6g1di3b-ergo-')
  ) {
    throw new Error('isolated Ergo runtime root is outside the dedicated temp namespace');
  }
}

function isStrictDescendant(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child));
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`)
    && !isAbsolute(value);
}

function assertLive(node: Readonly<OwnedNode>): void {
  if (PROCESS_START_ERRORS.has(node.child)) {
    throw new Error(`isolated Ergo ${node.role} process failed to start`);
  }
  if (node.child.exitCode !== null || node.child.signalCode !== null) {
    throw new Error(`isolated Ergo ${node.role} process exited unexpectedly`);
  }
}

function processId(node: Readonly<OwnedNode>): number {
  assertLive(node);
  if (!Number.isSafeInteger(node.child.pid) || !node.child.pid) {
    throw new Error(`isolated Ergo ${node.role} process PID is unavailable`);
  }
  return node.child.pid;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string' || value.length !== bytes * 2
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hexadecimal`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string' || value.length === 0
    || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be nonempty lowercase hexadecimal`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  return fixedHex(value, 32, label);
}

function hoconPath(path: string): string {
  if (/['"\r\n\0]/u.test(path)) {
    throw new Error('isolated Ergo runtime path cannot be represented in HOCON');
  }
  return path.replaceAll('\\', '/');
}

function isLoopbackAddress(value: string): boolean {
  return value === '127.0.0.1' || value === '::1';
}

function minimalEnvironment(
  ephemeralMiningMnemonic?: string,
  extensionFields: string = INITIAL_EXTENSION_FIELDS,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ERGO_SIDECHAIN_EXTENSION_FIELDS: extensionFields,
  };
  if (ephemeralMiningMnemonic !== undefined) {
    environment[EPHEMERAL_MINING_MNEMONIC_ENVIRONMENT_VARIABLE] =
      ephemeralMiningMnemonic;
  }
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function runManagedAction<TTarget extends object, T>(
  action: (target: Readonly<TTarget>) => Promise<T>,
  target: Readonly<TTarget>,
): Promise<T> {
  const startedAtMs = performance.now();
  const value = await action(target);
  assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1(
    startedAtMs,
    performance.now(),
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
  );
  return value;
}

export function assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1(
  startedAtMs: number,
  completedAtMs: number,
  completionBudgetMs: number,
): void {
  if (
    !Number.isFinite(startedAtMs)
    || !Number.isFinite(completedAtMs)
    || !Number.isSafeInteger(completionBudgetMs)
    || completionBudgetMs <= 0
    || completedAtMs < startedAtMs
  ) {
    throw new Error('isolated Ergo managed-action timing is invalid');
  }
  if (completedAtMs - startedAtMs > completionBudgetMs) {
    throw new Error(
      'isolated Ergo managed action exceeded its completion budget',
    );
  }
}

export function decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(
  ownedNodeTerminationEstablished: boolean,
  reservedPortsProvenUnowned: boolean,
): 'release_cleanup_authority' | 'hold_cleanup_authority' {
  return ownedNodeTerminationEstablished && reservedPortsProvenUnowned
    ? 'release_cleanup_authority'
    : 'hold_cleanup_authority';
}

async function holdOwnedNodeCleanupAuthority(): Promise<never> {
  setInterval(() => undefined, 60_000);
  return await new Promise<never>(() => undefined);
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

function isMnemonicPhrase(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 32
    && value.length <= 512
    && /^[a-z]+(?: [a-z]+){11,23}$/u.test(value);
}
