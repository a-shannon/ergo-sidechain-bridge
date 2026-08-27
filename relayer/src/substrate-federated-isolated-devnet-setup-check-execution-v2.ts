import { randomBytes } from 'node:crypto';

import { Mnemonic } from 'ethers';

import {
  checkSignedTransaction,
  prepareLocalWasmRootCheckCandidates,
  prepareLocalWasmRootCheckCandidatesFromNode,
  promoteLocalWasmCheckedTransactionForSubmissionV1,
  type LocalWasmCheckedSubmissionAcceptanceV1,
  type LocalWasmExactBytesSignedCheckCandidate,
  type LocalWasmOpaqueCheckResult,
} from './fleet-signer.js';
import {
  assertBridgeValidityTrackerObservedHeaderContextV1,
  type BridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import {
  assertExactSubstrateFederatedTrackerV1InputBox,
  assertSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerV1Context,
} from './substrate-federated-tracker-v1.js';
import {
  executeObservedAnchorTrackerCheckKernelV1,
  executeObservedAnchorTrackerCheckKernelV2,
  executeObservedAnchorTrackerReservationFreshnessCheckKernelV1,
  type ObservedAnchorTrackerCheckKernelV2Result,
  type ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result,
} from './substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1,
  bindSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  type SubstrateFederatedSettlementFamilyCompilerBindingV1,
} from './substrate-federated-settlement-family-compiler-binding-v1.js';
import {
  deriveLocalWasmRootSignerPublicIdentity,
} from './local-wasm-root-signer-public-identity.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1,
  issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  replaySubstrateFederatedIsolatedDevnetPortableV1,
  takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
  type ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
  type SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV2,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetSetupCheckV2,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  normalizeEip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const PRIMARY_NODE_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_NODE_ORIGIN = 'http://127.0.0.1:9052';
const PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_PROFILE_V2';
const DECLARED_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FIXED_SETUP_CHECK_DECLARATION_V2';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-check.v1' as const;
const PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1';
const PEG_IN_SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_TRANSACTION_V1';
const PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_V1';
const PEG_IN_COMMITTED_VAULT_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1';
const PEG_IN_COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_TRANSACTION_V1';
const PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_V1';
const OBSERVED_ANCHOR_TRACKER_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1';
const OBSERVED_ANCHOR_TRACKER_CHECK_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2';
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1';
const EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();
const FAMILY_EXECUTION_BATCHES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    familyCompilerBinding:
      Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
    trackerCompilerBinding:
      Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
  }>
>();
const PEG_IN_SOURCE_LOCK_CHECK_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
  }>
>();
const PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
  }>
>();
const OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS = new WeakSet<object>();
const OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS = new WeakSet<object>();
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS = new WeakSet<object>();
const TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL = new WeakMap<
  object,
  Readonly<{
    target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checked: Readonly<LocalWasmOpaqueCheckResult>;
    completion: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
    >;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

export interface SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >;
  readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

const TRACKER_TRANSPORT_EXECUTION_CHECKS = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1>;
    binding: Readonly<
      SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
    >;
  }>
>();

export interface RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2 {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly rewardInputErgoTrees: Readonly<{
    readonly delay1: string;
    readonly delay720: string;
  }>;
  readonly networkPrefix: 16;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>;
  readonly miningCredential:
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly claimCheckpointMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly claimTrackerAdmissionMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly claimTrackerConfirmationMiningCredential: () =>
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>;
  readonly dispose: () => void;
  readonly run: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>>;
  readonly runForExecution: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  >>;
  readonly runForExecutionRetainingPegInSigner: (
    input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  >>;
  readonly checkPegInSourceLock: (
    input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt
  >>;
  readonly checkPegInSourceLockRetainingSigner: (
    input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt
  >>;
  readonly checkPegInCommittedVault: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
    >,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
  >>;
  readonly checkPegInCommittedVaultRetainingSigner: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
    >,
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
  >>;
  readonly checkTrackerCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
  >>;
  readonly checkFrozenTrackerCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >>;
  readonly recheckTrackerReservationFreshnessCandidate: (
    input: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
    >,
    target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >,
  ) => Promise<Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >>;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input {
  readonly sourceFundingBoxIdHex: string;
  readonly unsignedTransaction:
    Readonly<MaterializedUnsignedTransaction>;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly sourceFundingBoxIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseSha256Hex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly exactProcessOwnedTargetBound: true;
    readonly exactTransactionAndSourceBoxBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input {
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly unsignedTransaction:
    Readonly<MaterializedUnsignedTransaction>;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseSha256Hex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly exactProcessOwnedTargetBound: true;
    readonly exactThreeInputTransitionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input {
  readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
  readonly observedHeaderContext:
    Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
  readonly trackerInputBox: unknown;
}

export interface SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly trackerInputBoxIdHex: string;
  readonly statementIdHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseSha256Hex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly checkpointBoundActiveTarget: true;
    readonly observedAnchorContextBound: true;
    readonly exactTrackerInputAndTransactionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayProtectionEstablished: false;
    readonly payoutEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export type SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt =
  Readonly<ObservedAnchorTrackerCheckKernelV2Result> & Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA;
    readonly version: 2;
    readonly status: 'PASS';
    readonly receiptDigestHex: string;
  }>;

export type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt =
  Readonly<ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result>
  & Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'PASS';
    readonly receiptDigestHex: string;
  }>;

export function assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated observed-anchor tracker check lacks exact process provenance',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated observed-anchor frozen tracker check V2 lacks exact runtime provenance',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated tracker reservation freshness check lacks exact runtime provenance',
    );
  }
}

/** Promote one exact freshness check into the next owned transport phase. */
export function promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    receipt,
  );
  const material = TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1(target);
  if (
    material === undefined
    || material.binding.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated tracker freshness check lacks exact transport provenance',
    );
  }
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.delete(receipt);
  const submissionExecutionBinding = Object.freeze({
    processBindingDigestHex: current.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      current.executionTargetIdentityDigestHex,
  });
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        submissionExecutionBinding,
      ),
  });
  TRACKER_TRANSPORT_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1(
  value: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1
  >,
  target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1
> {
  const material = TRACKER_TRANSPORT_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.reservationFreshnessProcessBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.reservationFreshnessExecutionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated tracker transport execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
): void {
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.delete(receipt);
}

export function claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
  receipt: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    receipt,
  );
  const material = TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.get(receipt);
  if (material === undefined) {
    throw new Error(
      'isolated tracker reservation freshness completion is absent or discarded',
    );
  }
  return material.completion;
}

/** Promote the exact in-process source-lock check once inside the static LAB root. */
export function promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1> {
  const material = PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated peg-in source-lock check lacks exact execution provenance',
    );
  }
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.delete(receipt);
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        current,
      ),
  });
  PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(
  value:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = PEG_IN_SOURCE_LOCK_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated peg-in source-lock execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>,
): void {
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.delete(receipt);
}

/** Promote the exact in-process committed-vault check once inside the LAB root. */
export function promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1> {
  const material = PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.get(receipt);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault check lacks exact execution provenance',
    );
  }
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.delete(receipt);
  const promoted = Object.freeze({
    receipt,
    signedCandidate: material.signedCandidate,
    checkedAcceptance:
      promoteLocalWasmCheckedTransactionForSubmissionV1(
        material.signedCandidate,
        material.checked,
        current,
      ),
  });
  PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS.set(promoted, Object.freeze({
    target,
    binding: current,
  }));
  return promoted;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(
  value:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = PEG_IN_COMMITTED_VAULT_EXECUTION_CHECKS.get(value);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.receipt.target.processBindingDigestHex
      !== current.processBindingDigestHex
    || value.receipt.target.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || value.signedCandidate.txId !== value.receipt.signedTransactionIdHex
    || value.checkedAcceptance.submissionHandle.txId
      !== value.receipt.signedTransactionIdHex
  ) {
    throw new Error(
      'isolated committed-vault execution check binding changed',
    );
  }
  return current;
}

export function discardSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
  receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>,
): void {
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.delete(receipt);
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2 {
  readonly issuance:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2>;
  readonly signedCandidate:
    LocalWasmExactBytesSignedCheckCandidate;
  readonly checkedAcceptance:
    Readonly<LocalWasmCheckedSubmissionAcceptanceV1>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly targetBinding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly orderedTransactions: readonly Readonly<
    SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2
  >[];
}

export interface SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2
  extends SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 {
  readonly familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
  readonly trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
}

export interface SubstrateFederatedTrackerCompilerBindingV1 {
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1['sourceAndCompilerInput']['trackerRequest']>;
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1['sourceAndCompilerInput']['trackerReceipt']>;
}

interface FixedSetupCheckRunV2 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly executionReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>;
  readonly trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>;
}

export interface SubstrateFederatedIsolatedDevnetSetupExecutionPromotionV2Input {
  readonly executionReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>;
  readonly request:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>;
  readonly expectedTargetBinding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
}

/**
 * Creates the signer before the caller builds the matching packet and target.
 * The synthetic mnemonic remains inside this one-shot process session.
 * Process termination, not JavaScript string reassignment, is the cleanup boundary.
 */
export async function createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2():
  Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2>> {
  const entropy = randomBytes(32);
  let mnemonic = '';
  try {
    mnemonic = Mnemonic.fromEntropy(`0x${entropy.toString('hex')}`).phrase;
  } finally {
    entropy.fill(0);
  }
  try {
    const identity = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
    const signer = Object.freeze({
      publicKeyHex: identity.publicKeyHex,
      p2pkErgoTreeHex: identity.p2pkErgoTreeHex,
      rewardInputErgoTrees: Object.freeze({
        delay1: deriveDevnetRewardErgoTreeHexForDelay(
          identity.publicKeyHex,
          1,
        ),
        delay720: deriveDevnetRewardErgoTreeHexForDelay(
          identity.publicKeyHex,
          720,
        ),
      }),
      networkPrefix: 16 as const,
    });
    const miningCredential =
      issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        mnemonic,
        identity.publicKeyHex,
      );
    let checkpointMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let trackerAdmissionMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let trackerConfirmationMiningCredential:
      Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1> | undefined =
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          mnemonic,
          identity.publicKeyHex,
        );
    let frozenTrackerCheck:
      Readonly<SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt>
      | undefined;
    let state:
      | 'open'
      | 'running'
      | 'setup-complete'
      | 'source-lock-check-complete'
      | 'committed-vault-check-complete'
      | 'frozen-tracker-check-complete'
      | 'closed' = 'open';
    let terminalInvalidationRequested = false;
    const close = (): void => {
      if (state === 'closed') return;
      terminalInvalidationRequested = true;
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        miningCredential,
      );
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
      frozenTrackerCheck = undefined;
      mnemonic = '';
      state = 'closed';
    };
    const consume = async <T>(
      expectedState:
        | 'open'
        | 'setup-complete'
        | 'source-lock-check-complete'
        | 'committed-vault-check-complete'
        | 'frozen-tracker-check-complete',
      operation: (activeMnemonic: string) => Promise<T>,
      successState:
        | 'setup-complete'
        | 'source-lock-check-complete'
        | 'committed-vault-check-complete'
        | 'frozen-tracker-check-complete'
        | 'closed',
    ): Promise<T> => {
      if (state !== expectedState) {
        const error = new Error(
          expectedState === 'open'
            ? 'isolated fixed setup-check session is already consumed or disposed'
            : 'isolated peg-in signer continuation is absent, consumed, or disposed',
        );
        if (state === 'running') {
          terminalInvalidationRequested = true;
        } else if (state !== 'closed') {
          close();
        }
        throw error;
      }
      state = 'running';
      try {
        const result = await operation(mnemonic);
        if (terminalInvalidationRequested) {
          close();
          throw new Error(
            'isolated fixed setup-check session was invalidated by a concurrent transition',
          );
        }
        if (successState === 'closed') {
          close();
        } else {
          state = successState;
        }
        return result;
      } catch (error) {
        close();
        throw error;
      }
    };
    const runForExecution = async (
      input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      retainPegInSigner: boolean,
      activeMnemonic: string,
    ): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>> => {
      const expectedTargetBinding =
        assertExecutionTargetMatchesOrigins(target, input);
      const result = await runFixedSetupCheck(input, activeMnemonic);
      const batch = promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2({
        executionReceipt: result.executionReceipt,
        request: result.request,
        expectedTargetBinding,
        target,
      });
      const familyBatch =
        attachSubstrateFederatedSettlementFamilyCompilerBindingV2(
          batch,
          result.familyCompilerBinding,
          result.trackerCompilerBinding,
          target,
        );
      if (retainPegInSigner) {
        assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
          familyBatch,
          target,
        );
      }
      return familyBatch;
    };
    return Object.freeze({
      signer,
      miningCredential,
      claimCheckpointMiningCredential: () => {
        if (checkpointMiningCredential === undefined) {
          throw new Error(
            'isolated checkpoint mining credential is absent, claimed, or disposed',
          );
        }
        const credential = checkpointMiningCredential;
        checkpointMiningCredential = undefined;
        return credential;
      },
      claimTrackerAdmissionMiningCredential: () => {
        if (trackerAdmissionMiningCredential === undefined) {
          throw new Error(
            'isolated tracker-admission mining credential is absent, claimed, or disposed',
          );
        }
        const credential = trackerAdmissionMiningCredential;
        trackerAdmissionMiningCredential = undefined;
        return credential;
      },
      claimTrackerConfirmationMiningCredential: () => {
        if (trackerConfirmationMiningCredential === undefined) {
          throw new Error(
            'isolated tracker-confirmation mining credential is absent, claimed, or disposed',
          );
        }
        const credential = trackerConfirmationMiningCredential;
        trackerConfirmationMiningCredential = undefined;
        return credential;
      },
      dispose: () => {
        if (state === 'running') {
          throw new Error('isolated fixed setup-check session is running');
        }
        if (
          state === 'open'
          || state === 'setup-complete'
          || state === 'source-lock-check-complete'
          || state === 'committed-vault-check-complete'
          || state === 'frozen-tracker-check-complete'
        ) {
          close();
        }
      },
      run: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
      ) => consume(
        'open',
        async activeMnemonic =>
          (await runFixedSetupCheck(input, activeMnemonic)).receipt,
        'closed',
      ),
      runForExecution: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'open',
        activeMnemonic => runForExecution(
          input,
          target,
          false,
          activeMnemonic,
        ),
        'closed',
      ),
      runForExecutionRetainingPegInSigner: async (
        input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'open',
        activeMnemonic => runForExecution(
          input,
          target,
          true,
          activeMnemonic,
        ),
        'setup-complete',
      ),
      checkPegInSourceLock: async (
        input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'setup-complete',
        activeMnemonic => runPegInSourceLockCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'closed',
      ),
      checkPegInSourceLockRetainingSigner: async (
        input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'setup-complete',
        activeMnemonic => runPegInSourceLockCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'source-lock-check-complete',
      ),
      checkPegInCommittedVault: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
        >,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'source-lock-check-complete',
        activeMnemonic => runPegInCommittedVaultCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'closed',
      ),
      checkPegInCommittedVaultRetainingSigner: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input
        >,
        target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
      ) => consume(
        'source-lock-check-complete',
        activeMnemonic => runPegInCommittedVaultCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'committed-vault-check-complete',
      ),
      checkTrackerCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
        >,
      ) => consume(
        'committed-vault-check-complete',
        activeMnemonic => runObservedAnchorTrackerCheck(
          input,
          target,
          signer,
          activeMnemonic,
        ),
        'closed',
      ),
      checkFrozenTrackerCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
        >,
      ) => consume(
        'committed-vault-check-complete',
        async activeMnemonic => {
          const receipt = await runObservedAnchorTrackerCheckV2(
            input,
            target,
            signer,
            activeMnemonic,
          );
          frozenTrackerCheck = receipt;
          return receipt;
        },
        'frozen-tracker-check-complete',
      ),
      recheckTrackerReservationFreshnessCandidate: async (
        input: Readonly<
          SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
        >,
        target: Readonly<
          SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
        >,
      ) => consume(
        'frozen-tracker-check-complete',
        activeMnemonic => {
          if (frozenTrackerCheck === undefined) {
            throw new Error(
              'isolated frozen tracker check is absent before freshness recheck',
            );
          }
          assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
            frozenTrackerCheck,
          );
          return runTrackerReservationFreshnessCheckV1(
            input,
            target,
            signer,
            activeMnemonic,
            frozenTrackerCheck,
          );
        },
        'closed',
      ),
    });
  } catch (error) {
    mnemonic = '';
    throw error;
  }
}

export function promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
  input: Readonly<
    SubstrateFederatedIsolatedDevnetSetupExecutionPromotionV2Input
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2> {
  const receipt =
    validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
      structuredClone(input.executionReceipt),
      input.request,
    );
  const before = assertExecutionTargetMatchesOrigins(input.target, {
    primaryNodeOrigin: input.request.target.primary.nodeOrigin,
    witnessNodeOrigin: input.request.target.witness.nodeOrigin,
  });
  if (
    before.processBindingDigestHex
      !== input.expectedTargetBinding.processBindingDigestHex
    || before.executionTargetIdentityDigestHex
      !== input.expectedTargetBinding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated setup execution process binding changed');
  }
  const material =
    takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2(
      input.executionReceipt,
      input.request,
      input.target,
    );
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  if (
    before.processBindingDigestHex !== after.processBindingDigestHex
    || before.executionTargetIdentityDigestHex
      !== after.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated setup execution process binding changed');
  }
  const orderedTransactions = material.orderedTransactions.map(
    (transaction, index) => {
      const issuance = input.request.orderedIssuances[index];
      if (
        issuance === undefined
        || issuance.ordinal !== transaction.ordinal
        || issuance.role !== transaction.role
      ) {
        throw new Error('isolated setup execution issuance order changed');
      }
      return Object.freeze({
        issuance,
        signedCandidate: transaction.signedCandidate,
        checkedAcceptance:
          promoteLocalWasmCheckedTransactionForSubmissionV1(
            transaction.signedCandidate,
            transaction.checked,
            after,
          ),
      });
    },
  );
  const batch = Object.freeze({
    receipt,
    request: input.request,
    targetBinding: after,
    orderedTransactions: Object.freeze(orderedTransactions),
  });
  EXECUTION_BATCHES.set(batch, Object.freeze({
    target: input.target,
    binding: after,
  }));
  return batch;
}

export function assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const material = EXECUTION_BATCHES.get(batch);
  if (material === undefined || material.target !== target) {
    throw new Error('isolated setup execution batch lacks exact process provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
    || batch.targetBinding.processBindingDigestHex
      !== current.processBindingDigestHex
    || batch.targetBinding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || batch.orderedTransactions.length !== 3
  ) {
    throw new Error('isolated setup execution batch process binding changed');
  }
  return current;
}

export function assertSubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1> {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  const material = FAMILY_EXECUTION_BATCHES.get(batch);
  if (
    material === undefined
    || material.target !== target
    || material.familyCompilerBinding !== batch.familyCompilerBinding
    || material.trackerCompilerBinding !== batch.trackerCompilerBinding
  ) {
    throw new Error(
      'isolated setup family execution batch lacks exact process provenance',
    );
  }
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1(
    material.familyCompilerBinding,
  );
  return material.familyCompilerBinding;
}

function assertExecutionTargetMatchesOrigins(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  input: Readonly<{ primaryNodeOrigin: string; witnessNodeOrigin: string }>,
): Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    target.primaryNodeOrigin !== input.primaryNodeOrigin
    || target.witnessNodeOrigin !== input.witnessNodeOrigin
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated setup execution target differs from its request');
  }
  return binding;
}

async function runPegInSourceLockCheck(
  inputValue:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>> {
  const input = capturePegInSourceLockCheckInput(inputValue);
  const before = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  const nodeOrigin = exactOrigin(
    target.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'peg-in checker',
  );
  if (
    target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated peg-in check target differs from the owned pair');
  }
  const transaction = input.unsignedTransaction;
  const independentlyDerivedId = fixedHex(
    await deriveUnsignedTransactionId(transaction.eip12Tx),
    32,
    'isolated peg-in independently derived transaction ID',
  );
  if (
    independentlyDerivedId !== transaction.txId
    || transaction.eip12Tx.inputs.length !== 1
    || transaction.eip12Tx.inputs[0]?.boxId !== input.sourceFundingBoxIdHex
    || transaction.eip12Tx.dataInputs.length !== 0
  ) {
    throw new Error('isolated peg-in source-lock transaction binding changed');
  }
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    transaction,
    PEG_IN_SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN,
  );
  const batch = await prepareLocalWasmRootCheckCandidatesFromNode({
    mnemonic,
    networkPrefix: expectedSigner.networkPrefix,
    nodeOrigin,
    candidates: [{
      role: 'peg-in-source-lock',
      eip12Tx: transaction.eip12Tx,
      expectedTxId: transaction.txId,
    }],
  });
  const prepared = batch.candidates[0];
  if (
    batch.derivation !== 'wasm-root'
    || batch.pubKeyHex !== expectedSigner.publicKeyHex
    || batch.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || batch.candidates.length !== 1
    || prepared === undefined
    || prepared.role !== 'peg-in-source-lock'
    || prepared.expectedTxId !== transaction.txId
    || prepared.signedCandidate.txId !== transaction.txId
  ) {
    throw new Error('isolated peg-in source-lock signer binding changed');
  }
  const checked = await checkSignedTransaction(
    prepared.signedCandidate,
    'isolated local peg-in source-lock check',
    nodeOrigin,
  );
  if (checked === null) {
    throw new Error('isolated local peg-in source-lock JVM node check failed');
  }
  const signedBytesDigestHex = fixedHex(
    checked.signedTransactionBytesSha256Hex,
    32,
    'isolated peg-in signed transaction bytes digest',
  );
  const signedBytesLength = positiveSafeInteger(
    checked.signedTransactionBytesLength,
    'isolated peg-in signed transaction bytes length',
  );
  if (
    checked.txId !== transaction.txId
    || checked.signedTransactionDigestHex
      !== prepared.signedCandidate.signedTransactionDigestHex
    || signedBytesDigestHex
      !== prepared.signedCandidate.signedTransactionBytesSha256Hex
    || signedBytesLength
      !== prepared.signedCandidate.signedTransactionBytesLength
    || checked.signerContext.pubKeyHex !== expectedSigner.publicKeyHex
    || checked.signerContext.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || checked.signerContext.stateContextTipHeight !== batch.stateContextTipHeight
    || checked.signerContext.stateContextTipIdHex !== batch.stateContextTipIdHex
    || checked.checkerIdentity.nodeOrigin !== nodeOrigin
    || checked.checkerIdentity.path !== '/transactions/check'
    || checked.checkerIdentity.method !== 'POST'
    || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('isolated peg-in signer and JVM node receipt disagree');
  }
  const after = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated peg-in execution target changed during check');
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    sourceFundingBoxIdHex: input.sourceFundingBoxIdHex,
    unsignedTransactionIdHex: transaction.txId,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: checked.txId,
    signedTransactionCanonicalJsonSha256Hex:
      checked.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedBytesDigestHex,
    signedTransactionBytesLength: signedBytesLength,
    checkResponseSha256Hex: sha256CanonicalJson({
      role: 'peg-in-source-lock',
      response: checked.checkResult,
    }, PEG_IN_SOURCE_LOCK_CHECK_RESPONSE_DIGEST_DOMAIN),
    target: Object.freeze({
      processBindingDigestHex: after.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        after.executionTargetIdentityDigestHex,
    }),
    signer: Object.freeze({
      derivation: 'wasm-root' as const,
      publicKeyHex: expectedSigner.publicKeyHex,
      p2pkErgoTreeHex: expectedSigner.p2pkErgoTreeHex,
      stateContextTipHeight: batch.stateContextTipHeight,
      stateContextTipIdHex: batch.stateContextTipIdHex,
    }),
    checker: Object.freeze({
      nodeOrigin,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      exactProcessOwnedTargetBound: true as const,
      exactTransactionAndSourceBoxBound: true as const,
      localWasmRootSigningPerformed: true as const,
      localJvmNodeCheckPassed: true as const,
      signedTransactionBytesPersisted: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      PEG_IN_SOURCE_LOCK_CHECK_DIGEST_DOMAIN,
    ),
  });
  PEG_IN_SOURCE_LOCK_CHECK_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: after,
    signedCandidate: prepared.signedCandidate,
    checked,
  }));
  return receipt;
}

async function runPegInCommittedVaultCheck(
  inputValue:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt>> {
  const input = capturePegInCommittedVaultCheckInput(inputValue);
  const before = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  const nodeOrigin = exactOrigin(
    target.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'peg-in committed-vault checker',
  );
  if (
    target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error(
      'isolated committed-vault check target differs from the owned pair',
    );
  }
  const transaction = input.unsignedTransaction;
  const independentlyDerivedId = fixedHex(
    await deriveUnsignedTransactionId(transaction.eip12Tx),
    32,
    'isolated committed-vault independently derived transaction ID',
  );
  const reserveInput = transaction.eip12Tx.inputs[0];
  const sourceLockInput = transaction.eip12Tx.inputs[1];
  const transitionFeeInput = transaction.eip12Tx.inputs[2];
  if (
    independentlyDerivedId !== transaction.txId
    || transaction.eip12Tx.inputs.length !== 3
    || reserveInput?.boxId !== input.reservePredecessorBoxIdHex
    || sourceLockInput?.boxId !== input.sourceLockBoxIdHex
    || transitionFeeInput?.boxId !== input.transitionFeeFundingBoxIdHex
    || transaction.eip12Tx.dataInputs.length !== 0
    || transaction.eip12Tx.outputs.length !== 2
    || transaction.outputs.length !== 2
    || Object.keys(reserveInput?.extension ?? {}).sort().join(',') !== '0'
    || typeof reserveInput?.extension['0'] !== 'string'
    || reserveInput.extension['0'].length === 0
    || Object.keys(sourceLockInput?.extension ?? {}).length !== 0
    || Object.keys(transitionFeeInput?.extension ?? {}).length !== 0
  ) {
    throw new Error(
      'isolated peg-in committed-vault transaction binding changed',
    );
  }
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    transaction,
    PEG_IN_COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN,
  );
  const batch = await prepareLocalWasmRootCheckCandidatesFromNode({
    mnemonic,
    networkPrefix: expectedSigner.networkPrefix,
    nodeOrigin,
    candidates: [{
      role: 'peg-in-committed-vault',
      eip12Tx: transaction.eip12Tx,
      expectedTxId: transaction.txId,
    }],
  });
  const prepared = batch.candidates[0];
  if (
    batch.derivation !== 'wasm-root'
    || batch.pubKeyHex !== expectedSigner.publicKeyHex
    || batch.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || batch.candidates.length !== 1
    || prepared === undefined
    || prepared.role !== 'peg-in-committed-vault'
    || prepared.expectedTxId !== transaction.txId
    || prepared.signedCandidate.txId !== transaction.txId
  ) {
    throw new Error('isolated peg-in committed-vault signer binding changed');
  }
  const checked = await checkSignedTransaction(
    prepared.signedCandidate,
    'isolated local peg-in committed-vault check',
    nodeOrigin,
  );
  if (checked === null) {
    throw new Error('isolated local committed-vault JVM node check failed');
  }
  const signedBytesDigestHex = fixedHex(
    checked.signedTransactionBytesSha256Hex,
    32,
    'isolated committed-vault signed transaction bytes digest',
  );
  const signedBytesLength = positiveSafeInteger(
    checked.signedTransactionBytesLength,
    'isolated committed-vault signed transaction bytes length',
  );
  if (
    checked.txId !== transaction.txId
    || checked.signedTransactionDigestHex
      !== prepared.signedCandidate.signedTransactionDigestHex
    || signedBytesDigestHex
      !== prepared.signedCandidate.signedTransactionBytesSha256Hex
    || signedBytesLength
      !== prepared.signedCandidate.signedTransactionBytesLength
    || checked.signerContext.pubKeyHex !== expectedSigner.publicKeyHex
    || checked.signerContext.ergoTreeHex !== expectedSigner.p2pkErgoTreeHex
    || checked.signerContext.stateContextTipHeight
      !== batch.stateContextTipHeight
    || checked.signerContext.stateContextTipIdHex !== batch.stateContextTipIdHex
    || checked.checkerIdentity.nodeOrigin !== nodeOrigin
    || checked.checkerIdentity.path !== '/transactions/check'
    || checked.checkerIdentity.method !== 'POST'
    || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error(
      'isolated committed-vault signer and JVM node receipt disagree',
    );
  }
  const after = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
    target,
  );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault execution target changed during check',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    reservePredecessorBoxIdHex: input.reservePredecessorBoxIdHex,
    sourceLockBoxIdHex: input.sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex: input.transitionFeeFundingBoxIdHex,
    unsignedTransactionIdHex: transaction.txId,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: checked.txId,
    signedTransactionCanonicalJsonSha256Hex:
      checked.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedBytesDigestHex,
    signedTransactionBytesLength: signedBytesLength,
    checkResponseSha256Hex: sha256CanonicalJson({
      role: 'peg-in-committed-vault',
      response: checked.checkResult,
    }, PEG_IN_COMMITTED_VAULT_CHECK_RESPONSE_DIGEST_DOMAIN),
    target: Object.freeze({
      processBindingDigestHex: after.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        after.executionTargetIdentityDigestHex,
    }),
    signer: Object.freeze({
      derivation: 'wasm-root' as const,
      publicKeyHex: expectedSigner.publicKeyHex,
      p2pkErgoTreeHex: expectedSigner.p2pkErgoTreeHex,
      stateContextTipHeight: batch.stateContextTipHeight,
      stateContextTipIdHex: batch.stateContextTipIdHex,
    }),
    checker: Object.freeze({
      nodeOrigin,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      exactProcessOwnedTargetBound: true as const,
      exactThreeInputTransitionBound: true as const,
      localWasmRootSigningPerformed: true as const,
      localJvmNodeCheckPassed: true as const,
      signedTransactionBytesPersisted: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      PEG_IN_COMMITTED_VAULT_CHECK_DIGEST_DOMAIN,
    ),
  });
  PEG_IN_COMMITTED_VAULT_CHECK_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: after,
    signedCandidate: prepared.signedCandidate,
    checked,
  }));
  return receipt;
}

async function runObservedAnchorTrackerCheck(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
>> {
  const result = await executeObservedAnchorTrackerCheckKernelV1({
    inputValue,
    target,
    expectedSigner,
    operations: {
      captureContext: value => {
        assertSubstrateFederatedTrackerV1Context(value);
        return value;
      },
      captureObservedHeaderContext: value => {
        assertBridgeValidityTrackerObservedHeaderContextV1(value);
        return value;
      },
      captureTargetBinding: () =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
          target,
        ),
      captureTrackerInputBox:
        assertExactSubstrateFederatedTrackerV1InputBox,
      deriveUnsignedTransactionId,
      prepareCandidate: async input =>
        await prepareLocalWasmRootCheckCandidates({
          mnemonic,
          networkPrefix: input.networkPrefix,
          nodeOrigin: input.nodeOrigin,
          headers: input.headers,
          candidates: [{
            role: input.role,
            eip12Tx: input.eip12Tx,
            expectedTxId: input.expectedTxId,
          }],
        }),
      checkCandidate: async (candidate, nodeOrigin) =>
        await checkSignedTransaction(
          candidate,
          'isolated local observed-anchor tracker check',
          nodeOrigin,
        ),
    },
  });
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      OBSERVED_ANCHOR_TRACKER_CHECK_DIGEST_DOMAIN,
    ),
  });
  OBSERVED_ANCHOR_TRACKER_CHECK_RECEIPTS.add(receipt);
  return receipt;
}

async function runObservedAnchorTrackerCheckV2(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
>> {
  const result = await executeObservedAnchorTrackerCheckKernelV2({
    inputValue,
    target,
    expectedSigner,
    operations: {
      captureContext: value => {
        assertSubstrateFederatedTrackerV1Context(value);
        return value;
      },
      captureObservedHeaderContext: value => {
        assertBridgeValidityTrackerObservedHeaderContextV1(value);
        return value;
      },
      captureTargetBinding: () =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
          target,
        ),
      captureTrackerInputBox:
        assertExactSubstrateFederatedTrackerV1InputBox,
      deriveUnsignedTransactionId,
      prepareCandidate: async input =>
        await prepareLocalWasmRootCheckCandidates({
          mnemonic,
          networkPrefix: input.networkPrefix,
          nodeOrigin: input.nodeOrigin,
          headers: input.headers,
          candidates: [{
            role: input.role,
            eip12Tx: input.eip12Tx,
            expectedTxId: input.expectedTxId,
          }],
        }),
      checkCandidate: async (candidate, nodeOrigin) =>
        await checkSignedTransaction(
          candidate,
          'isolated local observed-anchor frozen tracker check',
          nodeOrigin,
        ),
    },
  });
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
    version: 2 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      OBSERVED_ANCHOR_TRACKER_CHECK_V2_DIGEST_DOMAIN,
    ),
  });
  OBSERVED_ANCHOR_TRACKER_CHECK_V2_RECEIPTS.add(receipt);
  return receipt;
}

async function runTrackerReservationFreshnessCheckV1(
  inputValue: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Input
  >,
  target: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
  >,
  expectedSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckExecutionSignerV2>,
  mnemonic: string,
  expectedFrozenCheck: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
>> {
  const targetBinding =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
      target,
    );
  let signedCandidate: LocalWasmExactBytesSignedCheckCandidate | undefined;
  let checkedResult: Readonly<LocalWasmOpaqueCheckResult> | undefined;
  const result =
    await executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
      inputValue,
      target,
      expectedSigner,
      expectedFrozenCheck,
      operations: {
        captureContext: value => {
          assertSubstrateFederatedTrackerV1Context(value);
          return value;
        },
        captureObservedHeaderContext: value => {
          assertBridgeValidityTrackerObservedHeaderContextV1(value);
          return value;
        },
        captureTargetBinding: () => targetBinding,
        captureTrackerInputBox:
          assertExactSubstrateFederatedTrackerV1InputBox,
        deriveUnsignedTransactionId,
        prepareCandidate: async input =>
          await prepareLocalWasmRootCheckCandidates({
            mnemonic,
            networkPrefix: input.networkPrefix,
            nodeOrigin: input.nodeOrigin,
            headers: input.headers,
            candidates: [{
              role: input.role,
              eip12Tx: input.eip12Tx,
              expectedTxId: input.expectedTxId,
            }],
          }),
        checkCandidate: async (candidate, nodeOrigin) => {
          const checked = await checkSignedTransaction(
            candidate,
            'isolated local tracker reservation freshness check',
            nodeOrigin,
          );
          if (checked !== null) {
            signedCandidate = candidate;
            checkedResult = checked;
          }
          return checked;
        },
      },
    });
  if (signedCandidate === undefined || checkedResult === undefined) {
    throw new Error(
      'isolated tracker reservation freshness check retained no exact submission material',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    ...result,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      TRACKER_RESERVATION_FRESHNESS_CHECK_V1_DIGEST_DOMAIN,
    ),
  });
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_RECEIPTS.add(receipt);
  const completion =
    issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
      target,
    );
  TRACKER_RESERVATION_FRESHNESS_CHECK_V1_MATERIAL.set(receipt, Object.freeze({
    target,
    binding: targetBinding,
    signedCandidate,
    checked: checkedResult,
    completion,
  }));
  return receipt;
}

/** Reconstruct G1dA-G1dF and perform G1dG without wider capabilities. */
async function runFixedSetupCheck(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
  mnemonic: string,
): Promise<Readonly<FixedSetupCheckRunV2>> {
  const captured = captureInput(input);
  const primaryNodeOrigin = exactOrigin(
    captured.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'primary',
  );
  const witnessNodeOrigin = exactOrigin(
    captured.witnessNodeOrigin,
    WITNESS_NODE_ORIGIN,
    'witness',
  );
  const replay = await replaySubstrateFederatedIsolatedDevnetPortableV1(
    captured.portableReplayInput,
  );
  const continuation =
    takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(replay);
  const sourceAndCompilerInput = continuation.sourceAndCompilerInput;
  const familyCompilerBinding =
    bindSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1({
      receipt: sourceAndCompilerInput.familyReceipt,
      expectedInput: {
        trackerRequest: sourceAndCompilerInput.trackerRequest,
        trackerReceipt: sourceAndCompilerInput.trackerReceipt,
        templates: sourceAndCompilerInput.familyTemplates,
        duplicatePreventionGenesisInputBoxIdHex:
          continuation.genesisBoxIds.duplicatePrevention,
        pooledReserveGenesisInputBoxIdHex:
          continuation.genesisBoxIds.pooledReserve,
      },
    });
  const trackerCompilerBinding = Object.freeze({
    request: sourceAndCompilerInput.trackerRequest,
    receipt: sourceAndCompilerInput.trackerReceipt,
  });
  const profile = buildTargetProfile(
    replay.reportDigestHex,
    continuation.expectedSettlementGenesisHeaderIdHex,
    continuation.genesisBoxIds,
    primaryNodeOrigin,
    witnessNodeOrigin,
  );

  const retainedObservation = await observeWithRetry(profile);
  const settlementTarget =
    buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
      ...sourceAndCompilerInput,
      settlementTargetProfile: profile,
      settlementObservation: retainedObservation,
    });
  const freshObservation = await observeWithRetry(profile);
  const provisioning =
    await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
      settlementTarget,
      settlementTargetProfile: profile,
      freshSettlementObservation: freshObservation,
    });
  const request =
    await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
      provisioning,
    );

  const executionReceipt = await runSubstrateFederatedIsolatedDevnetSetupCheckV2(
    request,
    mnemonic,
  );
  const receipt = validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
    structuredClone(executionReceipt),
    request,
  );
  return Object.freeze({
    receipt,
    executionReceipt,
    request,
    familyCompilerBinding,
    trackerCompilerBinding,
  });
}

function attachSubstrateFederatedSettlementFamilyCompilerBindingV2(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  familyCompilerBinding:
    Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1>,
  trackerCompilerBinding:
    Readonly<SubstrateFederatedTrackerCompilerBindingV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2> {
  const targetBinding =
    assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  assertSubstrateFederatedSettlementFamilyCompilerBindingV1(
    familyCompilerBinding,
  );
  const result = Object.freeze({
    ...batch,
    familyCompilerBinding,
    trackerCompilerBinding,
  });
  EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    binding: targetBinding,
  }));
  FAMILY_EXECUTION_BATCHES.set(result, Object.freeze({
    target,
    familyCompilerBinding,
    trackerCompilerBinding,
  }));
  return result;
}

function buildTargetProfile(
  replayReportDigestHex: string,
  expectedGenesisHeaderIdHex: string,
  genesisBoxIds: Readonly<{
    readonly tracker: string;
    readonly duplicatePrevention: string;
    readonly pooledReserve: string;
  }>,
  primaryNodeOrigin: string,
  witnessNodeOrigin: string,
): SubstrateFederatedGenesisTargetProfileV1 {
  const profileIdHex = sha256CanonicalJson({
    replayReportDigestHex,
    expectedGenesisHeaderIdHex,
    genesisBoxIds,
    primaryNodeOrigin,
    witnessNodeOrigin,
  }, PROFILE_ID_DOMAIN);
  return buildSubstrateFederatedGenesisTargetProfileV1({
    profileIdHex,
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex,
    primaryNodeOrigin,
    primaryNodeIdentityDigestHex: declaredIdentity(
      'primary-node-process',
      primaryNodeOrigin,
      profileIdHex,
    ),
    primaryAdministrationIdentityDigestHex: declaredIdentity(
      'primary-synthetic-custody',
      primaryNodeOrigin,
      profileIdHex,
    ),
    witnessNodeOrigin,
    witnessNodeIdentityDigestHex: declaredIdentity(
      'witness-node-process',
      witnessNodeOrigin,
      profileIdHex,
    ),
    witnessAdministrationIdentityDigestHex: declaredIdentity(
      'witness-observation-role',
      witnessNodeOrigin,
      profileIdHex,
    ),
    trackerGenesisBoxIdHex: genesisBoxIds.tracker,
    duplicatePreventionGenesisBoxIdHex:
      genesisBoxIds.duplicatePrevention,
    pooledReserveGenesisBoxIdHex: genesisBoxIds.pooledReserve,
  });
}

async function observeWithRetry(
  profile: SubstrateFederatedGenesisTargetProfileV1,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OBSERVATION_ATTEMPTS; attempt += 1) {
    try {
      return await observeSubstrateFederatedGenesisV1(profile);
    } catch (error) {
      lastError = error;
      if (attempt < OBSERVATION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, OBSERVATION_RETRY_MS));
      }
    }
  }
  throw new Error(
    `isolated fixed setup-check target did not stabilize: ${String(lastError)}`,
  );
}

function declaredIdentity(
  role: string,
  nodeOrigin: string,
  profileIdHex: string,
): string {
  return sha256CanonicalJson({ role, nodeOrigin, profileIdHex },
    DECLARED_IDENTITY_DOMAIN);
}

function exactOrigin(
  value: string,
  expected: string,
  role: string,
): string {
  if (value !== expected) {
    throw new Error(
      `isolated fixed setup-check ${role} origin must be exactly ${expected}`,
    );
  }
  return value;
}

function captureInput(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input>,
): RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error('isolated fixed setup-check input must be a plain object');
  }
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'portableReplayInput',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error('isolated fixed setup-check input fields are invalid');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      throw new Error(
        `isolated fixed setup-check ${key} must be an enumerable data property`,
      );
    }
  }
  return Object.freeze({
    portableReplayInput: descriptors.portableReplayInput!.value,
    primaryNodeOrigin: descriptors.primaryNodeOrigin!.value,
    witnessNodeOrigin: descriptors.witnessNodeOrigin!.value,
  }) as RunSubstrateFederatedIsolatedDevnetFixedSetupCheckV2Input;
}

function capturePegInSourceLockCheckInput(
  input: Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Input> {
  assertPlainData(input, 'isolated peg-in source-lock check input');
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'sourceFundingBoxIdHex',
    'unsignedTransaction',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error('isolated peg-in source-lock check input fields are invalid');
  }
  const transaction = input.unsignedTransaction;
  if (
    transaction === null
    || typeof transaction !== 'object'
    || Array.isArray(transaction)
    || Object.keys(transaction).sort().join('\0') !== 'eip12Tx\0outputs\0txId'
    || transaction.eip12Tx === null
    || typeof transaction.eip12Tx !== 'object'
    || !Array.isArray(transaction.eip12Tx.inputs)
    || !Array.isArray(transaction.eip12Tx.dataInputs)
    || !Array.isArray(transaction.eip12Tx.outputs)
    || !Array.isArray(transaction.outputs)
  ) {
    throw new Error('isolated peg-in source-lock transaction shape is invalid');
  }
  return Object.freeze({
    sourceFundingBoxIdHex: fixedHex(
      input.sourceFundingBoxIdHex,
      32,
      'isolated peg-in source funding box ID',
    ),
    unsignedTransaction: structuredClone(transaction),
  });
}

function capturePegInCommittedVaultCheckInput(
  input:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Input> {
  assertPlainData(input, 'isolated peg-in committed-vault check input');
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'unsignedTransaction',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error(
      'isolated peg-in committed-vault check input fields are invalid',
    );
  }
  const transaction = input.unsignedTransaction;
  if (
    transaction === null
    || typeof transaction !== 'object'
    || Array.isArray(transaction)
    || Object.keys(transaction).sort().join('\0') !== 'eip12Tx\0outputs\0txId'
    || transaction.eip12Tx === null
    || typeof transaction.eip12Tx !== 'object'
    || !Array.isArray(transaction.eip12Tx.inputs)
    || !Array.isArray(transaction.eip12Tx.dataInputs)
    || !Array.isArray(transaction.eip12Tx.outputs)
    || !Array.isArray(transaction.outputs)
  ) {
    throw new Error(
      'isolated peg-in committed-vault transaction shape is invalid',
    );
  }
  return Object.freeze({
    reservePredecessorBoxIdHex: fixedHex(
      input.reservePredecessorBoxIdHex,
      32,
      'isolated peg-in reserve predecessor box ID',
    ),
    sourceLockBoxIdHex: fixedHex(
      input.sourceLockBoxIdHex,
      32,
      'isolated peg-in source-lock box ID',
    ),
    transitionFeeFundingBoxIdHex: fixedHex(
      input.transitionFeeFundingBoxIdHex,
      32,
      'isolated peg-in transition-fee funding box ID',
    ),
    unsignedTransaction: structuredClone(transaction),
  });
}

function assertPlainData(
  value: unknown,
  label: string,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} contains non-data capability material`);
  }
  if (seen.has(value)) throw new Error(`${label} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(`${label} contains a custom array prototype`);
      }
      const keys = Reflect.ownKeys(value);
      const expected = [
        ...Array.from({ length: value.length }, (_, index) => String(index)),
        'length',
      ];
      if (
        keys.length !== expected.length
        || keys.some((key, index) => key !== expected[index])
      ) {
        throw new Error(`${label} contains sparse, symbol, or extra array fields`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined
          || !descriptor.enumerable
          || !('value' in descriptor)
        ) {
          throw new Error(`${label} array entries must be enumerable data properties`);
        }
        assertPlainData(descriptor.value, `${label}[${index}]`, seen);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a custom object prototype`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new Error(`${label} contains symbol fields`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
      ) {
        throw new Error(`${label}.${key} must be an enumerable data property`);
      }
      assertPlainData(descriptor.value, `${label}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical ${bytes}-byte lowercase hex`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}
