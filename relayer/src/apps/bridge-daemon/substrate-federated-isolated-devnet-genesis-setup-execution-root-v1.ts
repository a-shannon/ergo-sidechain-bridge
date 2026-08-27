import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { platform, tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNativeError, isProxy } from 'node:util/types';

import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from '../../bridge-validity-tracker-header-context-v1.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
} from '../../peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from '../../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
} from '../../substrate-federated-settlement-family-v1.js';
import {
  runErgoOperationalTransaction,
} from './ergo-operational-transaction.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  type ErgoOperationalExecutionResult,
} from '../../relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9 as createTrackerTransportManagedCampaignPhaseFailureV9,
  projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9 as projectTrackerTransportManagedCampaignPhaseFailureV9,
  type SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9 as TrackerTransportManagedCampaignPhaseV9,
} from '../../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';
import {
  executeSubstrateFederatedLocalDevnetGenesisV1,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  type SubstrateFederatedLocalDevnetGenesisAdmission,
  type SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisExecutionResult,
  type SubstrateFederatedLocalDevnetGenesisRole,
  type SubstrateFederatedLocalDevnetGenesisSignedCandidate,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance,
  StateTracker,
  type ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result,
} from '../../state-tracker.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from '../../substrate-federated-authority-safe-devnet-history-v1.js';
import type {
  RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input,
  SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1,
} from '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1,
  type BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input,
  type SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt,
} from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt,
  type SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt,
  type SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV1Receipt,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from '../../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2,
  observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
  type SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1,
} from '../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
} from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance,
  claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2,
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
  type ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  type SubstrateFederatedIsolatedDevnetPacketContinuationSessionV2,
  type SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2,
  type SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  type SubstrateFederatedIsolatedDevnetPacketSessionV1,
  type SubstrateFederatedIsolatedDevnetPacketV2,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
} from '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1,
  type SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1,
} from '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance,
  preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2,
  runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2,
  type SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2,
  type SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2,
} from '../../substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
  createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3,
  preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3,
} from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance as assertFrozenObservedAnchorTrackerCheckCampaignRootV7RegistryProvenance,
  PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  registerSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
} from './substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore,
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance,
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance,
  authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1,
  persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
  type SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1,
  type SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1,
} from './substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1,
} from '../../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
} from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  discoverSubstrateFederatedRewardInputsV2,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardInputDiscoveryV2,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1,
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt,
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1,
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2,
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1,
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1,
  claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1,
  promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1,
  discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from '../../substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1,
} from './substrate-federated-isolated-devnet-tracker-checked-transport-v1.js';
import {
  authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1,
  createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1,
  createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1,
} from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1,
} from '../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
} from '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
import {
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
} from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
} from '../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
} from '../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
} from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1,
  type SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1,
} from '../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  createSubstrateFederatedLocalDevnetGenesisJournalV1,
  type SubstrateFederatedLocalDevnetGenesisJournalV1,
} from '../../substrate-federated-local-devnet-genesis-journal-v1.js';
import {
  createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1,
} from '../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js';
import {
  createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1,
} from '../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js';
import {
  assertSubstrateFederatedTrackerV1Context,
  buildCompilerBoundSubstrateFederatedTrackerV1Context,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context,
  SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA,
  type SubstrateFederatedTrackerV1Context,
} from '../../substrate-federated-tracker-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12UnsignedTransaction,
} from '../../unsigned-ergo-transaction.js';

export {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
};

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-setup-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-candidate-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-root.v3' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_V4_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-candidate-campaign-root.v4' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_V5_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-checkpoint-anchor-campaign-root.v5' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-root.v6' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-reservation-freshness-campaign-root.v8' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-root.v9' as const;
const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation.v1' as const;
const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1' as const;
const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1';
const PEG_IN_CANDIDATE_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1';
const PEG_IN_SOURCE_LOCK_CHECK_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1';
const PEG_IN_SOURCE_LOCK_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1';
const PEG_IN_COMMITTED_VAULT_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1';
const PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1';
const PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3';
const PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_V4';
const PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_V5';
const PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6';
const PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8';
const PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9';
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9';
const STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_V1';
const PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_V1';
const PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_V1';
const PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_V1';
const PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_V1';
const PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_V1';
const PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_V3';
const PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_V4';
const PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_V5';
const PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_V6';
const PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_V7';
const PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_V8';
const PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_V9';
const PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_FUNDING_BOX_V1';
const FEDERATION_EPOCH = '1';
const MAX_ADMISSION_VALIDITY_BLOCKS = '64';
const CONFIRMATION_POLL_MS = 250;
const TRANSACTION_CONFIRMATION_BUDGET_MS = 2 * 60_000;
const MAX_CONFIRMATION_WINDOWS = 11;
const NON_CONFIRMATION_ACTION_BUDGET_MS = 8 * 60_000;
const OBSERVED_TRACKER_V2_CONTEXT_MINIMUM_TIP_HEIGHT = 11;
const ACTION_COMPLETION_BUDGET_MS =
  (MAX_CONFIRMATION_WINDOWS * TRANSACTION_CONFIRMATION_BUDGET_MS)
  + NON_CONFIRMATION_ACTION_BUDGET_MS;

if (
  TRANSACTION_CONFIRMATION_BUDGET_MS
    <= SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1
  || ACTION_COMPLETION_BUDGET_MS
    >= SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1
) {
  throw new Error('isolated managed confirmation timing envelope is invalid');
}

const ROLE_ORDER = Object.freeze([
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const);

const STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema: 'e2s.substrate-federated-isolated-devnet-genesis-setup-static-execution.v1',
  version: 1 as const,
  roles: ROLE_ORDER,
  operations: Object.freeze([
    'buildSubstrateFederatedIsolatedDevnetErgoNodeV1',
    'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
    'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
    'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
    'collectSubstrateFederatedAuthoritySafeDevnetHistoryV1',
    'discoverSubstrateFederatedRewardInputsV2',
    'collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2',
    'setupSession.runForExecution',
    'createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1',
    'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
    'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    'createSubstrateFederatedLocalDevnetGenesisJournalV1',
    'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    'executeSubstrateFederatedLocalDevnetGenesisV1',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    STATIC_EXECUTION_MANIFEST,
    STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-candidate-static-execution.v1',
  version: 1 as const,
  setupStaticExecutionManifestDigestHex:
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  operations: Object.freeze([
    'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1',
    'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1',
    'assertSubstrateFederatedRewardInputDiscoveryV2Provenance',
    'buildSubstrateFederatedIsolatedDevnetPegInCandidateV1',
    'assertSubstrateFederatedIsolatedDevnetPegInCandidateV1',
    'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1.postCandidateRevalidation',
    'assertSubstrateFederatedRewardInputDiscoveryV2Provenance.postCandidateRevalidation',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST,
    PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-static-execution.v1',
  version: 1 as const,
  candidateStaticExecutionManifestDigestHex:
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  operations: Object.freeze([
    'setupSession.runForExecutionRetainingPegInSigner',
    'setupSession.checkPegInSourceLock',
    'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1.postCheckRevalidation',
    'assertSubstrateFederatedRewardInputDiscoveryV2Provenance.postCheckRevalidation',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST,
    PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-static-execution.v1',
  version: 1 as const,
  checkStaticExecutionManifestDigestHex:
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  operations: Object.freeze([
    'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
    'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1.preTransportRevalidation',
    'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1',
    'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
    'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
    'runErgoOperationalTransaction',
    'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
    'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST,
    PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-static-execution.v1',
  version: 1 as const,
  sourceLockStaticExecutionManifestDigestHex:
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  operations: Object.freeze([
    'setupSession.checkPegInSourceLockRetainingSigner',
    'setupSession.checkPegInCommittedVault',
    'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1',
    'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1',
    'createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1',
    'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1',
    'runErgoOperationalTransaction.committedVault',
    'observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST,
    PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-static-execution.v1',
  version: 1 as const,
  committedVaultCompatibilityManifestDigestHex:
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  packetSessionReplacement: Object.freeze({
    compatibilityOperation:
      'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
    campaignOperation:
      'createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2',
    packetCompatibilityPreserved: true as const,
    sourceAttestationRetainedUntilProofConsumption: true as const,
  }),
  additionalOperations: Object.freeze([
    'buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1',
    'collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1',
    'packetSession.produceMintSourceProof',
    'runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-static-execution.v3',
    version: 3 as const,
    committedVaultCompatibilityManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    packetSessionReplacement: Object.freeze({
      compatibilityOperation:
        'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
      campaignOperation:
        'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3',
      packetCompatibilityPreserved: true as const,
      sourceAttestationRetainedThroughCheckpointAttestation: true as const,
    }),
    additionalOperations: Object.freeze([
      'buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1',
      'collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1',
      'applicationCheckpointContinuation.executeApplication',
      'confirmationObserver.observeCommittedVaultAfterApplication',
      'applicationCheckpointContinuation.attestCheckpoint',
      'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance',
    ]),
    checkpointAdmission: Object.freeze({
      validFrom:
        'fresh post-application dual-node observation height of the committed-vault transaction',
      validityBlocks: MAX_ADMISSION_VALIDITY_BLOCKS,
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3 =
  sha256CanonicalJson(
    PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-candidate-campaign-static-execution.v4',
    version: 4 as const,
    applicationCheckpointManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
    additionalOperations: Object.freeze([
      'confirmationObserver.observeTrackerSetupAfterCheckpoint',
      'materializeUnsignedTransaction',
      'buildCompilerBoundSubstrateFederatedTrackerV1Context',
    ]),
    trackerCandidate: Object.freeze({
      compilerReceipt: 'exact same-process JVM setup compiler receipt',
      trackerInput: 'exact canonically confirmed tracker setup output',
      statement: 'exact application checkpoint statement',
      anchor: 'synthetic 0x0401 header context; non-authorizing',
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4 =
  sha256CanonicalJson(
    PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-checkpoint-anchor-campaign-static-execution.v5',
    version: 5 as const,
    applicationCheckpointManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
    additionalOperations: Object.freeze([
      'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2',
      'encodeSubstrateFederatedCheckpointExtensionValueV1',
      'nodeSession.withCheckpointExtensionMiningTarget',
      'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1',
      'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
    ]),
    checkpointAnchor: Object.freeze({
      source: 'exact application checkpoint statement',
      keyHex: '0401',
      target: 'second mining phase over the same isolated Ergo chain data',
      observation:
        'exact canonical header bytes and extension membership agreed by primary and witness',
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5 =
  sha256CanonicalJson(
    PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-static-execution.v6',
    version: 6 as const,
    checkpointAnchorManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5,
    trackerCandidateManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4,
    additionalOperations: Object.freeze([
      'setupSession.checkPegInCommittedVaultRetainingSigner',
      'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
      'nodeSession.withCheckpointBoundMiningActiveExecutionTarget',
      'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1',
      'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1',
      'buildBridgeValidityTrackerObservedHeaderContextV1',
      'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context',
      'setupSession.checkTrackerCandidate',
      'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1',
    ]),
    authorityBoundary: Object.freeze({
      signing: 'local synthetic WASM root signer',
      acceptance:
        'checkpoint-bound active local JVM /transactions/check only',
      submission: false as const,
      broadcast: false as const,
      trackerAdmission: false as const,
      payout: false as const,
    }),
    observedHeaderContext: Object.freeze({
      headerVersion: 2 as const,
      headerCount: 10 as const,
      anchor:
        'exact mined 0x0401 checkpoint retained in the current active window',
      minimumCheckpointTipHeight:
        OBSERVED_TRACKER_V2_CONTEXT_MINIMUM_TIP_HEIGHT,
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6 =
  sha256CanonicalJson(
    PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-static-execution.v7',
    version: 7 as const,
    checkpointAnchorManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5,
    trackerCandidateManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4,
    additionalOperations: Object.freeze([
      'setupSession.checkPegInCommittedVaultRetainingSigner',
      'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
      'nodeSession.withCheckpointBoundMiningStoppedExecutionTarget',
      'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2',
      'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
      'buildBridgeValidityTrackerObservedHeaderContextV1',
      'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context',
      'setupSession.checkFrozenTrackerCandidate',
      'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2',
    ]),
    authorityBoundary: Object.freeze({
      signing: 'local synthetic WASM root signer',
      acceptance:
        'checkpoint-bound frozen local JVM /transactions/check only',
      submission: false as const,
      broadcast: false as const,
      trackerAdmission: false as const,
      payout: false as const,
    }),
    observedHeaderContext: Object.freeze({
      headerVersion: 2 as const,
      headerCount: 10 as const,
      anchor:
        'exact mined 0x0401 checkpoint retained in the frozen non-mining window',
      minimumCheckpointTipHeight:
        OBSERVED_TRACKER_V2_CONTEXT_MINIMUM_TIP_HEIGHT,
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7 =
  sha256CanonicalJson(
    PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-reservation-freshness-campaign-static-execution.v8',
    version: 8 as const,
    frozenTrackerManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
    reservationOperationProfileDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
    additionalOperations: Object.freeze([
      'authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1',
      'persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1',
      'StateTracker.reloadSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1',
      'nodeSession.withCheckpointBoundReservationFreshnessRevalidationTarget',
      'observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1',
      'buildBridgeValidityTrackerObservedHeaderContextV1',
      'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context',
      'setupSession.recheckTrackerReservationFreshnessCandidate',
      'assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
    ]),
    authorityBoundary: Object.freeze({
      persistence: 'task-owned file-backed SQLite reservation only',
      signing: 'same synthetic WASM root signer retained in-process',
      acceptance:
        'reservation-freshness-bound frozen local JVM /transactions/check only',
      signedTransactionBytesPersisted: false as const,
      submission: false as const,
      broadcast: false as const,
      trackerAdmission: false as const,
      payout: false as const,
    }),
    restartBoundary: Object.freeze({
      firstStoreClosedBeforeReload: true as const,
      sameStoreReopened: true as const,
      exactReservationReloadedBeforeAndAfterFreshness: true as const,
      localDatabaseAuthoritative: false as const,
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8 =
  sha256CanonicalJson(
    PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

const PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-static-execution.v9',
    version: 9 as const,
    reservationFreshnessManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8,
    additionalOperations: Object.freeze([
      'claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1',
      'nodeSession.withCheckpointBoundTrackerTransportTarget',
      'promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
      'authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1',
      'createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1',
      'journal.reserve',
      'claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
      'createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1',
      'submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1',
      'journal.finalize',
      'nodeSession.withTrackerTransportConfirmationMiningTarget',
      'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
      'confirmationObserver.observeExactTrackerAttempt',
    ]),
    authorityBoundary: Object.freeze({
      persistence:
        'caller-owned file-backed SQLite attempt journal retained after execution',
      signing: 'same synthetic WASM root signer retained in-process',
      acceptance:
        'same-target frozen local JVM /transactions/check result only',
      preflight:
        'process-proven exact request bytes and reviewed relayer packet lineage bound to one atomically inserted pending attempt',
      transport:
        'one credential-free POST to the fixed loopback primary node without retry',
      confirmationMining:
        'fourth independent one-shot synthetic mining credential after durable outcome finalization',
      canonicalConfirmation:
        'exact attempted transaction observed canonically by primary and witness before teardown',
      trackerAdmission: true as const,
      payout: false as const,
    }),
    restartBoundary: Object.freeze({
      attemptPersistedBeforePost: true as const,
      durableAttemptClaimedBeforeFreshPreflightConsumption: true as const,
      exactFreshPreflightConsumedInCheckedCallbackImmediatelyBeforePost:
        true as const,
      anExistingAttemptPreventsAnotherPost: true as const,
      acceptedAndAmbiguousOutcomesRetained: true as const,
      localDatabaseAuthoritative: false as const,
    }),
    exposedCapabilities: Object.freeze([]),
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9 =
  sha256CanonicalJson(
    PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST,
    PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

export interface RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input {
  readonly build:
    Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>;
  readonly lifecycle:
    Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>;
}

export interface RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input
extends RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input {
  readonly pegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>;
}

export interface RunSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Input
extends RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input {
  readonly frontierMintProofConsumer:
    SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2;
}

export interface RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input
  extends RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input {
  readonly frontierApplicationRunner:
    SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3;
}

export type RunSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Input =
  RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input;

export type RunSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Input =
  RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input;

export type RunSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Input =
  RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input;

export type RunSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Input =
  RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input;

export type RunSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Input =
  RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input;

export interface RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Input
  extends RunSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Input {
  readonly requestBinding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1>;
  readonly trackerTransportJournalRoot: string;
}

export interface SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'three_local_setup_transactions_canonically_confirmed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly lifecycle: Readonly<{
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly setupCheckReceiptDigestHex: string;
    readonly setupRequestDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly transactions: readonly Readonly<{
    readonly ordinal: 0 | 1 | 2;
    readonly role: SubstrateFederatedLocalDevnetGenesisRole;
    readonly expectedTxId: string;
    readonly transportStatus: 'accepted' | 'ambiguous' | 'reconciled';
    readonly durableAttemptDigestHex: string;
    readonly journalDigestHex: string;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
  }>[];
  readonly checks: Readonly<{
    readonly exactLockedPatchedNodeBuiltBeforeSignerCreation: true;
    readonly staticExecutionModulesBound: true;
    readonly replacementPortAccepted: false;
    readonly exactCheckedCandidatesConsumedOnce: true;
    readonly exactCanonicalRoleOrderEnforced: true;
    readonly durableReservationPrecededTransport: true;
    readonly predecessorConfirmationPrecededSuccessorAuthorization: true;
    readonly allConfirmedAttemptsRevalidatedBeforeTeardown: true;
    readonly temporaryJournalRemovedAfterResolution: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupTargetNodeAcceptanceEstablished: true;
    readonly localSetupSubmissionExecuted: true;
    readonly localSetupBroadcastExecuted: true;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt>;
}

export interface SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status:
    'setup_confirmed_and_unsigned_peg_in_candidate_constructed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup: Readonly<{
    readonly lifecycle:
      SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['lifecycle'];
    readonly transactions:
      SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'];
  }>;
  readonly pegIn: Readonly<{
    readonly fundingObservation: Readonly<{
      readonly reportDigestHex: string;
      readonly observedAt: string;
      readonly primaryNodeOrigin:
        typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
      readonly witnessNodeOrigin:
        typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
      readonly genesisHeaderIdHex: string;
      readonly tipHeight: number;
      readonly tipHeaderIdHex: string;
      readonly sourceFundingBoxIdHex: string;
      readonly sourceFundingBoxDigestHex: string;
      readonly postCandidateReportDigestHex: string;
      readonly postCandidateTipHeight: number;
      readonly postCandidateTipHeaderIdHex: string;
      readonly postCheckReportDigestHex?: string;
      readonly postCheckTipHeight?: number;
      readonly postCheckTipHeaderIdHex?: string;
      readonly preTransportReportDigestHex?: string;
      readonly preTransportTipHeight?: number;
      readonly preTransportTipHeaderIdHex?: string;
    }>;
    readonly candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    readonly sourceLockCheck?:
      Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>;
    readonly committedVaultCheck?: Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
    >;
    readonly sourceLockExecution?: Readonly<{
      readonly expectedTxId: string;
      readonly transportStatus: 'accepted' | 'reconciled';
      readonly durableAttemptDigestHex: string;
      readonly journalDigestHex: string;
      readonly confirmationDigestHex: string;
      readonly confirmationHeight: number;
      readonly confirmationHeaderIdHex: string;
      readonly outputObservation:
        Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>;
    }>;
    readonly committedVaultExecution?: Readonly<{
      readonly expectedTxId: string;
      readonly transportStatus: 'accepted' | 'reconciled';
      readonly durableAttemptDigestHex: string;
      readonly journalDigestHex: string;
      readonly confirmationDigestHex: string;
      readonly confirmationHeight: number;
      readonly confirmationHeaderIdHex: string;
      readonly preTransportObservation: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1
      >;
      readonly outputObservation: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1
      >;
    }>;
  }>;
  readonly checks: Readonly<{
    readonly setupAndFundingObservedInOneTargetLifetime: true;
    readonly allSetupLineagesRevalidatedAfterCandidateConstruction: true;
    readonly exactDualNodeFundingObservationConsumed: true;
    readonly sourceFundingDistinctFromSetupInputsAndOutputs: true;
    readonly sourceFundingRevalidatedAfterCandidateConstruction: true;
    readonly deterministicUnsignedCandidateConstructed: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupTargetNodeAcceptanceEstablished: true;
    readonly localSetupSubmissionExecuted: true;
    readonly localSetupBroadcastExecuted: true;
    readonly localSetupCanonicalConfirmationEstablished: true;
    readonly localSourceFundingObservationEstablished: true;
    readonly localSourceFundingReobservationEstablished: true;
    readonly valuePathNodeCheckPerformed: false;
    readonly valuePathSigningAuthorityEstablished: false;
    readonly valuePathSubmissionAuthorityEstablished: false;
    readonly valuePathBroadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt>;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'setup_confirmed_and_peg_in_source_lock_node_check_passed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup: SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn: Readonly<
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']
    & {
      readonly sourceLockCheck:
        Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>;
      readonly fundingObservation: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']['fundingObservation']
        & {
          readonly postCheckReportDigestHex: string;
          readonly postCheckTipHeight: number;
          readonly postCheckTipHeaderIdHex: string;
        }
      >;
    }
  >;
  readonly checks: Readonly<{
    readonly setupCandidateAndCheckCompletedInOneTargetLifetime: true;
    readonly exactCandidateFundingAndUnsignedTransactionBound: true;
    readonly sourceFundingRevalidatedImmediatelyBeforeSigning: true;
    readonly sourceFundingRevalidatedAfterNodeCheck: true;
    readonly exactSameNodeSigningContextAndJvmCheckUsed: true;
    readonly signedTransactionBytesReturnedOrPersisted: false;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupCanonicalConfirmationEstablished: true;
    readonly localSourceFundingObservationEstablished: true;
    readonly valuePathLocalSyntheticSigningPerformed: true;
    readonly valuePathJvmNodeCheckPassed: true;
    readonly valuePathSubmissionAuthorityEstablished: false;
    readonly valuePathBroadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt
  >;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'peg_in_source_lock_creation_canonically_confirmed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt['pegIn']
    & {
      readonly sourceLockExecution: NonNullable<
        SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']['sourceLockExecution']
      >;
      readonly fundingObservation: Readonly<
        SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt['pegIn']['fundingObservation']
        & {
          readonly preTransportReportDigestHex: string;
          readonly preTransportTipHeight: number;
          readonly preTransportTipHeaderIdHex: string;
        }
      >;
    }
  >;
  readonly checks: Readonly<{
    readonly exactCheckedCandidatePromotedOnce: true;
    readonly sourceFundingRevalidatedImmediatelyBeforeAuthorization: true;
    readonly durableReservationPrecededTransport: true;
    readonly exactLoopbackTransportConsumedCheckedBytesOnce: true;
    readonly canonicalConfirmationObservedByBothNodes: true;
    readonly exactSourceSpentAndOutputsObserved: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly valuePathLocalSyntheticSigningPerformed: true;
    readonly valuePathJvmNodeCheckPassed: true;
    readonly valuePathSubmissionExecuted: true;
    readonly valuePathBroadcastExecuted: true;
    readonly sourceLockCreationConfirmed: true;
    readonly sourceLockStillRefundable: true;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt
  >;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'peg_in_source_lock_consumed_into_committed_reserve';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt['pegIn']
    & {
      readonly committedVaultCheck: Readonly<
        SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt
      >;
      readonly committedVaultExecution: NonNullable<
        SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']['committedVaultExecution']
      >;
    }
  >;
  readonly checks: Readonly<{
    readonly sourceLockConfirmedBeforeCommittedVaultCheck: true;
    readonly exactThreeInputTransitionCheckedAndRevalidated: true;
    readonly freshJvmCheckPrecededAuthorization: true;
    readonly durableReservationPrecededTransport: true;
    readonly exactLoopbackTransportConsumedCheckedBytesOnce: true;
    readonly canonicalConfirmationObservedByBothNodes: true;
    readonly exactTransitionInputsSpentAndReserveSuccessorObserved: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly valuePathLocalSyntheticSigningPerformed: true;
    readonly valuePathJvmNodeCheckPassed: true;
    readonly valuePathSubmissionExecuted: true;
    readonly valuePathBroadcastExecuted: true;
    readonly sourceLockCreationConfirmed: true;
    readonly sourceLockStillRefundable: false;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly depositCommitmentStateEstablished: true;
    readonly mintAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt
  >;
}

interface SubstrateFederatedIsolatedDevnetPegInMintProofCampaignMaterialV1 {
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly evidenceReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>;
  readonly packetProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly consumerReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2>;
}

export interface SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status:
    'committed_reserve_proof_consumed_by_frontier_lab';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt['pegIn'];
  readonly mintProof:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignMaterialV1>;
  readonly checks: Readonly<{
    readonly committedReserveAndProofConsumedInOneTargetLifetime: true;
    readonly compatibilityPacketReplacedByBoundContinuationV2: true;
    readonly exactCommittedReserveBoundToMintStatement: true;
    readonly exactCollectedEvidenceBoundToPacketProof: true;
    readonly exactPacketProofConsumedByFrontier: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupAndValuePathBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly depositCommitmentStateEstablished: true;
    readonly sourceEvidenceCollectionProvenanceEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly externalTargetNodeAcceptanceEstablished: false;
    readonly sourceCanonicalityIndependentlyVerified: false;
    readonly ergoPowAuthenticated: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Receipt
  >;
}

interface SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3 {
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly evidenceReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>;
  readonly applicationCheckpoint: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  >;
  readonly checkpointAdmissionObservation: Readonly<{
    readonly expectedTxId: string;
    readonly observedAtHeight: number;
    readonly observationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA;
  readonly version: 3;
  readonly status:
    'committed_reserve_minted_burned_and_checkpoint_attested_in_frontier_lab';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt['pegIn'];
  readonly application:
    Readonly<SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3>;
  readonly checks: Readonly<{
    readonly setupVaultMintBurnAndCheckpointCompletedInOneTargetLifetime: true;
    readonly compatibilityPacketReplacedByBoundContinuationV3: true;
    readonly exactCommittedReserveBoundToMintStatement: true;
    readonly exactCollectedEvidenceBoundToPacketProof: true;
    readonly exactRetainedPacketConsumedByApplicationCheckpointRoot: true;
    readonly checkpointAdmissionDerivedFromFreshVaultReobservation: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupAndValuePathBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly depositCommitmentStateEstablished: true;
    readonly sourceEvidenceCollectionProvenanceEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly frontierApplicationBurnExecuted: true;
    readonly federatedCheckpointAttestationEstablished: true;
    readonly externalTargetNodeAcceptanceEstablished: false;
    readonly sourceCanonicalityIndependentlyVerified: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt
  >;
}

interface ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4 {
  readonly application: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
  >;
  readonly trackerSetup: Readonly<{
    readonly expectedTxId: string;
    readonly outputBoxIdHex: string;
    readonly outputIndex: 0;
    readonly outputCreationHeight: number;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly observedAtHeight: number;
  }>;
  readonly compilerBinding:
    SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2['trackerCompilerBinding'];
  readonly trackerInputBox: Readonly<Eip12Box>;
  readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
}

interface SubstrateFederatedIsolatedDevnetTrackerCandidateMaterialV4 {
  readonly trackerSetup:
    ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4['trackerSetup'];
  readonly candidate: Readonly<{
    readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA;
    readonly version: 1;
    readonly trustModel: 'federated_non_trustless';
    readonly contractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly statementIdHex: string;
    readonly inputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly syntheticAnchorHeaderIdHex: string;
    readonly syntheticAnchorHeaderHeight: number;
    readonly syntheticAnchorExtensionRootHex: string;
    readonly contextExtensionSerializedHex: string;
    readonly prooflessTransactionBytes: number;
    readonly unsignedTransactionIdHex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_V4_SCHEMA;
  readonly version: 4;
  readonly status: 'checkpoint_bound_proofless_tracker_candidate_constructed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt['pegIn'];
  readonly application:
    Readonly<SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3>;
  readonly trackerCandidate:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerCandidateMaterialV4>;
  readonly checks: Readonly<{
    readonly setupVaultMintBurnCheckpointAndTrackerCandidateCompletedInOneTargetLifetime: true;
    readonly exactApplicationCheckpointConsumedByTrackerCandidate: true;
    readonly exactSameProcessTrackerCompilerReceiptConsumed: true;
    readonly exactConfirmedTrackerSetupOutputConsumed: true;
    readonly deterministicProoflessTrackerCandidateConstructed: true;
    readonly syntheticAnchorExplicitlyNonAuthorizing: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupAndPegInBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly frontierApplicationBurnExecuted: true;
    readonly federatedCheckpointAttestationEstablished: true;
    readonly syntheticAnchorContextConstructed: true;
    readonly trackerCandidateConstructed: true;
    readonly externalTargetNodeAcceptanceEstablished: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerJvmReductionAccepted: false;
    readonly trackerNodeCheckPerformed: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly trackerSigningPerformed: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerBroadcastPerformed: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Receipt
  >;
}

export interface SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_V5_SCHEMA;
  readonly version: 5;
  readonly status: 'application_checkpoint_anchored_in_local_ergo_devnet';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt['pegIn'];
  readonly application:
    Readonly<SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3>;
  readonly checkpointAnchor: Readonly<{
    readonly mining:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt>;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
    >;
  }>;
  readonly checks: Readonly<{
    readonly setupVaultMintBurnCheckpointAndAnchorCompletedInOneChainLifetime: true;
    readonly exactApplicationCheckpointEncodedInto0401: true;
    readonly sameChainCheckpointExtensionMinedAfterApplication: true;
    readonly exactPrimaryWitnessAnchorAgreementEstablished: true;
    readonly exactExtensionMembershipRecomputed: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly localSetupAndPegInBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly frontierApplicationBurnExecuted: true;
    readonly federatedCheckpointAttestationEstablished: true;
    readonly localErgoCheckpointAnchorObserved: true;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly trackerCandidateConstructed: false;
    readonly trackerJvmReductionAccepted: false;
    readonly trackerNodeCheckPerformed: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly trackerSigningPerformed: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerBroadcastPerformed: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Receipt
  >;
}

interface SubstrateFederatedIsolatedDevnetObservedAnchorTrackerMaterialV6 {
  readonly execution: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt
  >;
  readonly observation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1
  >;
  readonly trackerSetup:
    ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4['trackerSetup'];
  readonly candidate: Readonly<{
    readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA;
    readonly version: 1;
    readonly trustModel: 'federated_non_trustless';
    readonly contractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly statementIdHex: string;
    readonly inputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeaderHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly anchorContextProvenance:
      typeof BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE;
    readonly contextExtensionSerializedHex: string;
    readonly prooflessTransactionBytes: number;
    readonly unsignedTransactionIdHex: string;
  }>;
  readonly check: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
  >;
}

export interface SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA;
  readonly version: 6;
  readonly status:
    'observed_anchor_tracker_candidate_accepted_by_local_node_check';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt['pegIn'];
  readonly application: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
  >;
  readonly checkpointAnchor: Readonly<{
    readonly mining:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt>;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
    >;
  }>;
  readonly tracker: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerMaterialV6
  >;
  readonly checks: Readonly<{
    readonly setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime: true;
    readonly exactObserved0401AnchorConsumedByTrackerCandidate: true;
    readonly exactCheckpointBoundActiveTargetConsumedByTrackerCheck: true;
    readonly exactConfirmedTrackerSetupOutputConsumed: true;
    readonly exactSameProcessTrackerCompilerReceiptConsumed: true;
    readonly localWasmSignatureAcceptedBySameTargetJvmCheck: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly localSetupAndPegInBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly frontierApplicationBurnExecuted: true;
    readonly federatedCheckpointAttestationEstablished: true;
    readonly localErgoCheckpointAnchorObserved: true;
    readonly checkpointBoundTrackerExecutionObserved: true;
    readonly trackerCandidateConstructed: true;
    readonly trackerJvmReductionAccepted: true;
    readonly trackerNodeCheckPerformed: true;
    readonly trackerSigningPerformed: true;
    readonly signedTrackerBytesPersisted: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerBroadcastPerformed: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt
  >;
}

interface SubstrateFederatedIsolatedDevnetFrozenObservedAnchorTrackerMaterialV7 {
  readonly execution: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt
  >;
  readonly observation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
  >;
  readonly trackerSetup:
    ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4['trackerSetup'];
  readonly candidate:
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerMaterialV6['candidate'];
  readonly check: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >;
}

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA;
  readonly version: 7;
  readonly status:
    'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly setup:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['setup'];
  readonly pegIn:
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt['pegIn'];
  readonly application: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
  >;
  readonly checkpointAnchor: Readonly<{
    readonly mining:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt>;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
    >;
  }>;
  readonly tracker: Readonly<
    SubstrateFederatedIsolatedDevnetFrozenObservedAnchorTrackerMaterialV7
  >;
  readonly checks: Readonly<{
    readonly setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime: true;
    readonly exactObserved0401AnchorConsumedByTrackerCandidate: true;
    readonly exactCheckpointBoundFrozenTargetConsumedByTrackerCheck: true;
    readonly exactFrozenSnapshotStableAcrossTrackerCheck: true;
    readonly exactConfirmedTrackerSetupOutputConsumed: true;
    readonly exactSameProcessTrackerCompilerReceiptConsumed: true;
    readonly localWasmSignatureAcceptedBySameTargetJvmCheck: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly localSetupAndPegInBroadcastExecuted: true;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly frontierTestClientReservationAndMintExecuted: true;
    readonly frontierApplicationBurnExecuted: true;
    readonly federatedCheckpointAttestationEstablished: true;
    readonly localErgoCheckpointAnchorObserved: true;
    readonly checkpointBoundFrozenTrackerExecutionObserved: true;
    readonly trackerCandidateConstructed: true;
    readonly trackerJvmReductionAccepted: true;
    readonly trackerNodeCheckPerformed: true;
    readonly trackerSigningPerformed: true;
    readonly signedTrackerBytesPersisted: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerBroadcastPerformed: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >;
}

interface SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8 {
  readonly frozenTrackerRoot: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >;
  readonly authorization: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
  >;
  readonly durableReservation: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
  >;
  readonly reloadedReservation: Readonly<
    ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result['reservation']
  >;
  readonly execution: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt
  >;
  readonly observation: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1
  >;
  readonly check: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
  >;
  readonly transport?: Readonly<{
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV1Receipt
    >;
    readonly authorization: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
    >;
    readonly attempt: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly durableAttemptDigestHex: string;
    }>;
    readonly outcome: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1
    >;
    readonly confirmationExecution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV1Receipt
    >;
    readonly confirmation: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationV1
    >;
  }>;
}

interface SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'confirmed';
  readonly transactionIdHex: string;
  readonly confirmations: number;
  readonly observedAtHeight: number;
  readonly confirmationHeight: number;
  readonly confirmationHeaderIdHex: string;
  readonly observationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA;
  readonly version: 8;
  readonly status:
    'durable_tracker_reservation_reloaded_and_freshness_rechecked';
  readonly staticExecutionManifestDigestHex: string;
  readonly frozenTrackerRoot: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >;
  readonly reservation: Readonly<{
    readonly authorization: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
    >;
    readonly durable: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
    >;
    readonly reloaded: Readonly<
      ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result['reservation']
    >;
  }>;
  readonly freshness: Readonly<{
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt
    >;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1
    >;
    readonly check: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
    >;
  }>;
  readonly checks: Readonly<{
    readonly setupThroughFreshnessCompletedInOneChainLifetime: true;
    readonly firstReservationStoreClosedBeforeReopen: true;
    readonly exactReservationReloadedBeforeAndAfterFreshness: true;
    readonly exactFrozenTrackerTargetReacquired: true;
    readonly exactObserved0401AnchorReacquired: true;
    readonly exactReservedTrackerCandidateReconstructed: true;
    readonly sameSyntheticSignerAndJvmCheckReused: true;
    readonly everyEphemeralCapabilityDisposedBeforeReturn: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly processProvenFrozenTrackerRootConsumed: true;
    readonly durableReservationEstablished: true;
    readonly localDatabaseAuthoritative: false;
    readonly trackerInputRevalidated: true;
    readonly checkpointAnchorRevalidated: true;
    readonly frozenTargetSnapshotRevalidated: true;
    readonly trackerJvmReductionRechecked: true;
    readonly trackerSigningPerformed: true;
    readonly signedTrackerBytesPersisted: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt
  >;
}

const TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_RECEIPTS =
  new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_SCHEMA;
  readonly version: 9;
  readonly status: 'local_tracker_transport_canonically_confirmed';
  readonly staticExecutionManifestDigestHex: string;
  readonly freshness: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt
  >;
  readonly transport: Readonly<{
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV1Receipt
    >;
    readonly authorization: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
    >;
    readonly attempt: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly durableAttemptDigestHex: string;
    }>;
    readonly outcome: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1
    >;
    readonly confirmationExecution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV1Receipt
    >;
    readonly confirmation: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationV1
    >;
  }>;
  readonly checks: Readonly<{
    readonly exactFreshnessCheckPromotedOnce: true;
    readonly exactTransportTargetActiveOnlyDuringAttempt: true;
    readonly durableAttemptPersistedBeforePost: true;
    readonly exactCheckedBytesConsumedOnce: true;
    readonly transportOutcomePersistedBeforeReturn: true;
    readonly exactAttemptConfirmedBeforeTeardown: true;
    readonly persistentJournalPathExcludedFromReceipt: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly trackerTransportAttempted: true;
    readonly exactNodeAcceptanceObserved: true;
    readonly oneTransportAttemptRecorded: true;
    readonly canonicalConfirmationObserved: true;
    readonly trackerAdmissionEstablished: true;
    readonly localDatabaseAuthoritative: false;
    readonly signedTrackerBytesPersisted: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly profileActivated: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9 {
  readonly receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Receipt
  >;
}

const TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_RECEIPTS = new WeakSet<object>();

interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9Receipt {
  readonly schema:
    'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9';
  readonly version: 9;
  readonly status: 'local_tracker_transport_not_canonically_confirmed';
  readonly staticExecutionManifestDigestHex: string;
  readonly transport: Readonly<{
    readonly authorization: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly executionTargetIdentityDigestHex: string;
      readonly authorizationDigestHex: string;
    }>;
    readonly attempt: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly durableAttemptDigestHex: string;
    }>;
    readonly outcome: Readonly<{
      readonly status: 'accepted' | 'ambiguous';
      readonly expectedTransactionIdHex: string;
      readonly submittedTransactionIdHex: string | null;
      readonly durableAttemptDigestHex: string;
      readonly outcomeDigestHex: string;
      readonly responseDigestHex: string;
    }>;
  }>;
  readonly confirmation: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureDiagnosticV1
  >;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly oneTransportAttemptRecorded: true;
    readonly transportOutcomePersisted: true;
    readonly exactNodeAcceptanceObserved: boolean;
    readonly canonicalConfirmationObserved: false;
    readonly trackerAdmissionEstablished: false;
    readonly signedTrackerBytesPersisted: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

const TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9_RECEIPTS =
  new WeakMap<Error, Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9Receipt
  >>();

type SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureCategoryV1 =
  | 'managed_deadline_elapsed'
  | 'confirmation_budget_elapsed'
  | 'pending_at_deadline'
  | 'not_found_at_deadline'
  | 'observation_completed_after_deadline'
  | 'observer_failure'
  | 'clock_failure'
  | 'confirmation_phase_failure';

interface SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureDiagnosticV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA;
  readonly version: 1;
  readonly category:
    SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureCategoryV1;
  readonly expectedTransactionIdHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly confirmationBudgetMs: number;
  readonly observationCount: number;
  readonly lastObservation: Readonly<{
    readonly status: 'confirmed' | 'pending' | 'not_found';
    readonly confirmations: number;
    readonly observedAtHeight: number;
    readonly observationDigestHex: string;
  }> | null;
}

const TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTICS_V1 =
  new WeakMap<Error, Readonly<
    SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureDiagnosticV1
  >>();
const TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1 = Object.freeze([
  'managed_deadline_elapsed',
  'confirmation_budget_elapsed',
  'pending_at_deadline',
  'not_found_at_deadline',
  'observation_completed_after_deadline',
  'observer_failure',
  'clock_failure',
  'confirmation_phase_failure',
] as const);

interface PegInCandidatePlanV1 {
  readonly amountNanoErg: string;
  readonly recipientAddressHex: string;
}

/**
 * The only static FED-6-LAB root that may connect checked setup candidates to
 * the local `/transactions` transport. It accepts no replaceable runtime port.
 */
export async function runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1>> {
  const { buildReceipt, managed } = await runManagedCampaign(input, undefined);

  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'three_local_setup_transactions_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    lifecycle: managed.value.lifecycle,
    transactions: managed.value.transactions,
    checks: {
      exactLockedPatchedNodeBuiltBeforeSignerCreation: true as const,
      staticExecutionModulesBound: true as const,
      replacementPortAccepted: false as const,
      exactCheckedCandidatesConsumedOnce: true as const,
      exactCanonicalRoleOrderEnforced: true as const,
      durableReservationPrecededTransport: true as const,
      predecessorConfirmationPrecededSuccessorAuthorization: true as const,
      allConfirmedAttemptsRevalidatedBeforeTeardown: true as const,
      temporaryJournalRemovedAfterResolution: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupTargetNodeAcceptanceEstablished: true as const,
      localSetupSubmissionExecuted: true as const,
      localSetupBroadcastExecuted: true as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(body, ROOT_RECEIPT_DIGEST_DOMAIN);
  return Object.freeze({ receipt });
}

/**
 * Static FED-6-LAB root for the next value-path boundary. It retains the exact
 * setup target only long enough to revalidate setup and construct one unsigned
 * candidate from a fresh dual-node funding observation.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1>> {
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'candidate',
  );
  const pegIn = managed.value.pegIn;
  if (pegIn === undefined) {
    throw new Error('isolated devnet peg-in candidate was not constructed');
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status:
      'setup_confirmed_and_unsigned_peg_in_candidate_constructed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn,
    checks: {
      setupAndFundingObservedInOneTargetLifetime: true as const,
      allSetupLineagesRevalidatedAfterCandidateConstruction: true as const,
      exactDualNodeFundingObservationConsumed: true as const,
      sourceFundingDistinctFromSetupInputsAndOutputs: true as const,
      sourceFundingRevalidatedAfterCandidateConstruction: true as const,
      deterministicUnsignedCandidateConstructed: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupTargetNodeAcceptanceEstablished: true as const,
      localSetupSubmissionExecuted: true as const,
      localSetupBroadcastExecuted: true as const,
      localSetupCanonicalConfirmationEstablished: true as const,
      localSourceFundingObservationEstablished: true as const,
      localSourceFundingReobservationEstablished: true as const,
      valuePathNodeCheckPerformed: false as const,
      valuePathSigningAuthorityEstablished: false as const,
      valuePathSubmissionAuthorityEstablished: false as const,
      valuePathBroadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_CANDIDATE_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Check-only FED-6-LAB root for the first value-path transaction. The exact
 * signed object remains process-local and no submission handle is created.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1>> {
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'check-source-lock',
  );
  const pegIn = managed.value.pegIn;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.fundingObservation.postCheckReportDigestHex === undefined
    || pegIn.fundingObservation.postCheckTipHeight === undefined
    || pegIn.fundingObservation.postCheckTipHeaderIdHex === undefined
  ) {
    throw new Error('isolated devnet peg-in source-lock check was not completed');
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status:
      'setup_confirmed_and_peg_in_source_lock_node_check_passed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt['pegIn'],
    checks: {
      setupCandidateAndCheckCompletedInOneTargetLifetime: true as const,
      exactCandidateFundingAndUnsignedTransactionBound: true as const,
      sourceFundingRevalidatedImmediatelyBeforeSigning: true as const,
      sourceFundingRevalidatedAfterNodeCheck: true as const,
      exactSameNodeSigningContextAndJvmCheckUsed: true as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupCanonicalConfirmationEstablished: true as const,
      localSourceFundingObservationEstablished: true as const,
      valuePathLocalSyntheticSigningPerformed: true as const,
      valuePathJvmNodeCheckPassed: true as const,
      valuePathSubmissionAuthorityEstablished: false as const,
      valuePathBroadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_SOURCE_LOCK_CHECK_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Execute only the refundable source-lock creation on the owned LAB devnet.
 * The successor reserve transition and every mint authority remain absent.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1>> {
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'execute-source-lock',
  );
  const pegIn = managed.value.pegIn;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.fundingObservation.postCheckReportDigestHex === undefined
    || pegIn.fundingObservation.postCheckTipHeight === undefined
    || pegIn.fundingObservation.postCheckTipHeaderIdHex === undefined
    || pegIn.fundingObservation.preTransportReportDigestHex === undefined
    || pegIn.fundingObservation.preTransportTipHeight === undefined
    || pegIn.fundingObservation.preTransportTipHeaderIdHex === undefined
  ) {
    throw new Error('isolated devnet peg-in source-lock execution was incomplete');
  }
  const postCheckTipHeight = pegIn.fundingObservation.postCheckTipHeight;
  const preTransportTipHeight = pegIn.fundingObservation.preTransportTipHeight;
  const confirmationHeight = pegIn.sourceLockExecution.confirmationHeight;
  const finalFullHeight = managed.receipt.finalSnapshot.fullHeight;
  const finalIndexedHeight = managed.receipt.finalSnapshot.indexedHeight;
  if (
    ![postCheckTipHeight, preTransportTipHeight, confirmationHeight,
      finalFullHeight, finalIndexedHeight]
      .every(height => Number.isSafeInteger(height) && height >= 0)
    || postCheckTipHeight > preTransportTipHeight
    || preTransportTipHeight > confirmationHeight
    || confirmationHeight > finalFullHeight
    || confirmationHeight > finalIndexedHeight
  ) {
    throw new Error(
      'isolated devnet peg-in source-lock execution chronology changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'peg_in_source_lock_creation_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt['pegIn'],
    checks: {
      exactCheckedCandidatePromotedOnce: true as const,
      sourceFundingRevalidatedImmediatelyBeforeAuthorization: true as const,
      durableReservationPrecededTransport: true as const,
      exactLoopbackTransportConsumedCheckedBytesOnce: true as const,
      canonicalConfirmationObservedByBothNodes: true as const,
      exactSourceSpentAndOutputsObserved: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      valuePathLocalSyntheticSigningPerformed: true as const,
      valuePathJvmNodeCheckPassed: true as const,
      valuePathSubmissionExecuted: true as const,
      valuePathBroadcastExecuted: true as const,
      sourceLockCreationConfirmed: true as const,
      sourceLockStillRefundable: true as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_SOURCE_LOCK_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Execute the exact refundable-source to committed-reserve transition on the
 * owned LAB devnet. Minting remains outside this root.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1>> {
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'execute-committed-vault',
  );
  const pegIn = managed.value.pegIn;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
  ) {
    throw new Error(
      'isolated devnet committed-vault execution was incomplete',
    );
  }
  const sourceConfirmationHeight =
    pegIn.sourceLockExecution.confirmationHeight;
  const preTransportHeight =
    pegIn.committedVaultExecution.preTransportObservation.observedTipHeight;
  const committedConfirmationHeight =
    pegIn.committedVaultExecution.confirmationHeight;
  const finalFullHeight = managed.receipt.finalSnapshot.fullHeight;
  const finalIndexedHeight = managed.receipt.finalSnapshot.indexedHeight;
  if (
    ![
      sourceConfirmationHeight,
      preTransportHeight,
      committedConfirmationHeight,
      finalFullHeight,
      finalIndexedHeight,
    ].every(height => Number.isSafeInteger(height) && height >= 0)
    || sourceConfirmationHeight > preTransportHeight
    || preTransportHeight > committedConfirmationHeight
    || committedConfirmationHeight > finalFullHeight
    || committedConfirmationHeight > finalIndexedHeight
  ) {
    throw new Error(
      'isolated devnet committed-vault execution chronology changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'peg_in_source_lock_consumed_into_committed_reserve' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt['pegIn'],
    checks: {
      sourceLockConfirmedBeforeCommittedVaultCheck: true as const,
      exactThreeInputTransitionCheckedAndRevalidated: true as const,
      freshJvmCheckPrecededAuthorization: true as const,
      durableReservationPrecededTransport: true as const,
      exactLoopbackTransportConsumedCheckedBytesOnce: true as const,
      canonicalConfirmationObservedByBothNodes: true as const,
      exactTransitionInputsSpentAndReserveSuccessorObserved: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      valuePathLocalSyntheticSigningPerformed: true as const,
      valuePathJvmNodeCheckPassed: true as const,
      valuePathSubmissionExecuted: true as const,
      valuePathBroadcastExecuted: true as const,
      sourceLockCreationConfirmed: true as const,
      sourceLockStillRefundable: false as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      depositCommitmentStateEstablished: true as const,
      mintAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_COMMITTED_VAULT_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Runs the complete local peg-in evidence path in one owned process lifetime.
 * The final consumer is an in-memory Frontier TestClient; no runtime profile,
 * external mint authority, or reusable signing/submission capability escapes.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const consumerPlan = normalizeFrontierMintProofConsumerPlan(
    input.frontierMintProofConsumer,
  );
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'consume-mint-proof',
    consumerPlan,
  );
  const pegIn = managed.value.pegIn;
  const mintProof = managed.value.mintProof;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || mintProof === undefined
  ) {
    throw new Error('isolated devnet peg-in mint-proof campaign was incomplete');
  }
  if (
    mintProof.consumerReceipt.packetProof !== mintProof.packetProof
    || mintProof.consumerReceipt.packetProofReceiptDigestHex
      !== mintProof.packetProof.receiptDigestHex
    || mintProof.consumerReceipt.sourceProofReceiptDigestHex
      !== mintProof.packetProof.sourceProof.receiptDigestHex
    || mintProof.consumerReceipt.sourceEvidenceReceiptDigestHex
      !== mintProof.evidenceReceipt.receiptDigestHex
    || mintProof.packetProof.sourceProof.sourceEvidenceReceiptDigestHex
      !== mintProof.evidenceReceipt.receiptDigestHex
    || mintProof.packetProof.sourceProof.mintReservationDraftDigestHex
      !== mintProof.draft.draftDigestHex
    || mintProof.consumerReceipt.statementIdHex
      !== mintProof.draft.statementIdHex
    || mintProof.consumerReceipt.mintIdentityHex
      !== mintProof.draft.reservationKeyHex
  ) {
    throw new Error('isolated devnet peg-in mint-proof campaign binding changed');
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'committed_reserve_proof_consumed_by_frontier_lab' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Receipt['pegIn'],
    mintProof,
    checks: {
      committedReserveAndProofConsumedInOneTargetLifetime: true as const,
      compatibilityPacketReplacedByBoundContinuationV2: true as const,
      exactCommittedReserveBoundToMintStatement: true as const,
      exactCollectedEvidenceBoundToPacketProof: true as const,
      exactPacketProofConsumedByFrontier: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupAndValuePathBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      depositCommitmentStateEstablished: true as const,
      sourceEvidenceCollectionProvenanceEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      externalTargetNodeAcceptanceEstablished: false as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      ergoPowAuthenticated: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Executes the real LAB packet -> mint -> application burn -> checkpoint join
 * while retaining the source-attestation session created before setup.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'consume-application-checkpoint',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  const pegIn = managed.value.pegIn;
  const application = managed.value.applicationCheckpoint;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || application === undefined
  ) {
    throw new Error(
      'isolated devnet peg-in application-checkpoint campaign was incomplete',
    );
  }
  const root = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    root,
  );
  const mintProof = root.mintSourceProof;
  const checkpointStatement =
    root.checkpoint.checkpointAttestation.checkpointStatement;
  const admissionObservation = application.checkpointAdmissionObservation;
  const validFrom = admissionObservation.observedAtHeight.toString();
  const expiresAt = (
    BigInt(validFrom) + BigInt(MAX_ADMISSION_VALIDITY_BLOCKS)
  ).toString();
  if (
    root.packet.receipt.receiptDigestHex
      !== managed.value.lifecycle.packetReceiptDigestHex
    || mintProof.packetReceiptDigestHex
      !== root.packet.receipt.receiptDigestHex
    || mintProof.sourceProof.sourceEvidenceReceiptDigestHex
      !== application.evidenceReceipt.receiptDigestHex
    || mintProof.sourceProof.mintReservationDraftDigestHex
      !== application.draft.draftDigestHex
    || mintProof.sourceProof.mintReservationStatementIdHex
      !== application.draft.statementIdHex
    || mintProof.sourceProof.mintIdentityHex
      !== application.draft.reservationKeyHex
    || admissionObservation.expectedTxId
      !== pegIn.committedVaultExecution.expectedTxId
    || admissionObservation.confirmationHeight
      !== pegIn.committedVaultExecution.confirmationHeight
    || admissionObservation.confirmationHeaderIdHex
      !== pegIn.committedVaultExecution.confirmationHeaderIdHex
    || admissionObservation.observedAtHeight
      < admissionObservation.confirmationHeight
    || checkpointStatement.admissionValidFromErgoHeight !== validFrom
    || checkpointStatement.admissionExpiresAtErgoHeight !== expiresAt
    || root.binding.packetReceiptDigestHex
      !== root.packet.receipt.receiptDigestHex
    || root.binding.mintSourceProofReceiptDigestHex
      !== mintProof.receiptDigestHex
  ) {
    throw new Error(
      'isolated devnet peg-in application-checkpoint campaign binding changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA,
    version: 3 as const,
    status:
      'committed_reserve_minted_burned_and_checkpoint_attested_in_frontier_lab' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt['pegIn'],
    application,
    checks: {
      setupVaultMintBurnAndCheckpointCompletedInOneTargetLifetime: true as const,
      compatibilityPacketReplacedByBoundContinuationV3: true as const,
      exactCommittedReserveBoundToMintStatement: true as const,
      exactCollectedEvidenceBoundToPacketProof: true as const,
      exactRetainedPacketConsumedByApplicationCheckpointRoot: true as const,
      checkpointAdmissionDerivedFromFreshVaultReobservation: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupAndValuePathBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      depositCommitmentStateEstablished: true as const,
      sourceEvidenceCollectionProvenanceEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      externalTargetNodeAcceptanceEstablished: false as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      ergoAnchorEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Extends the application checkpoint campaign through deterministic tracker
 * candidate construction. The header context remains synthetic, so this root
 * creates no tracker admission, signing, submission, or funds authority.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const { buildReceipt, managed } = await runManagedCampaign(
    input,
    pegInPlan,
    'construct-tracker-candidate',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  const pegIn = managed.value.pegIn;
  const application = managed.value.applicationCheckpoint;
  const trackerStage = managed.value.trackerCandidate;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || application === undefined
    || trackerStage === undefined
    || trackerStage.application !== application
  ) {
    throw new Error(
      'isolated devnet peg-in tracker-candidate campaign was incomplete',
    );
  }
  const root = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    root,
  );
  const finalTrackerConfirmations = managed.value.transactions.filter(
    transaction => transaction.ordinal === 0 && transaction.role === 'tracker',
  );
  const checkpointStatement =
    root.checkpoint.checkpointAttestation.checkpointStatement;
  if (
    finalTrackerConfirmations.length !== 1
    || finalTrackerConfirmations[0]!.expectedTxId
      !== trackerStage.trackerSetup.expectedTxId
    || finalTrackerConfirmations[0]!.confirmationHeight
      !== trackerStage.trackerSetup.confirmationHeight
    || finalTrackerConfirmations[0]!.confirmationHeaderIdHex
      !== trackerStage.trackerSetup.confirmationHeaderIdHex
    || trackerStage.context.statement.encodedHex
      !== checkpointStatement.encodedStatementHex
    || trackerStage.context.statement.statementIdHex
      !== checkpointStatement.statementIdHex
  ) {
    throw new Error(
      'isolated devnet checkpoint-to-tracker candidate binding changed',
    );
  }
  const trackerCandidate = projectManagedTrackerCandidateV4(trackerStage);
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_V4_SCHEMA,
    version: 4 as const,
    status: 'checkpoint_bound_proofless_tracker_candidate_constructed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Receipt['pegIn'],
    application,
    trackerCandidate,
    checks: {
      setupVaultMintBurnCheckpointAndTrackerCandidateCompletedInOneTargetLifetime:
        true as const,
      exactApplicationCheckpointConsumedByTrackerCandidate: true as const,
      exactSameProcessTrackerCompilerReceiptConsumed: true as const,
      exactConfirmedTrackerSetupOutputConsumed: true as const,
      deterministicProoflessTrackerCandidateConstructed: true as const,
      syntheticAnchorExplicitlyNonAuthorizing: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupAndPegInBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      syntheticAnchorContextConstructed: true as const,
      trackerCandidateConstructed: true as const,
      externalTargetNodeAcceptanceEstablished: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      ergoAnchorEstablished: false as const,
      trackerJvmReductionAccepted: false as const,
      trackerNodeCheckPerformed: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      trackerSigningPerformed: false as const,
      trackerSubmissionPerformed: false as const,
      trackerBroadcastPerformed: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Extends the application checkpoint campaign through a second mining phase
 * over the same isolated Ergo chain. The phase mines and observes the exact
 * 0x0401 checkpoint commitment, but constructs or admits no tracker spend.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const { buildReceipt, managed, checkpointAnchor } = await runManagedCampaign(
    input,
    pegInPlan,
    'mine-checkpoint-anchor',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  const pegIn = managed.value.pegIn;
  const application = managed.value.applicationCheckpoint;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || application === undefined
    || checkpointAnchor === undefined
  ) {
    throw new Error(
      'isolated devnet peg-in checkpoint-anchor campaign was incomplete',
    );
  }
  const applicationReceipt = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    applicationReceipt,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
    checkpointAnchor.observation,
  );
  const statement =
    applicationReceipt.checkpoint.checkpointAttestation.checkpointStatement;
  const expectedExtensionValueHex =
    encodeSubstrateFederatedCheckpointExtensionValueV1(
      statement.encodedStatementHex,
    );
  if (
    checkpointAnchor.mining.extensionValueHex !== expectedExtensionValueHex
    || checkpointAnchor.observation.extensionValueHex
      !== expectedExtensionValueHex
    || checkpointAnchor.observation.processBindingDigestHex
      !== checkpointAnchor.mining.processBindingDigestHex
    || checkpointAnchor.observation.executionTargetIdentityDigestHex
      !== checkpointAnchor.mining.executionTargetIdentityDigestHex
    || checkpointAnchor.observation.targetGenesisHeaderIdHex
      !== pegIn.fundingObservation.genesisHeaderIdHex
    || checkpointAnchor.observation.priorHeaderIdHex
      !== managed.receipt.finalSnapshot.headerIdHex
    || checkpointAnchor.observation.priorHeight
      !== managed.receipt.finalSnapshot.fullHeight
    || checkpointAnchor.mining.priorSnapshot.fullHeight
      !== managed.receipt.finalSnapshot.fullHeight
    || checkpointAnchor.mining.priorSnapshot.indexedHeight
      !== managed.receipt.finalSnapshot.indexedHeight
    || checkpointAnchor.mining.priorSnapshot.headerIdHex
      !== managed.receipt.finalSnapshot.headerIdHex
    || checkpointAnchor.mining.minedSnapshot.fullHeight
      <= checkpointAnchor.mining.priorSnapshot.fullHeight
    || checkpointAnchor.mining.minedSnapshot.fullHeight
      > checkpointAnchor.mining.finalSnapshot.fullHeight
    || checkpointAnchor.observation.anchorHeight
      !== checkpointAnchor.mining.finalSnapshot.fullHeight
    || checkpointAnchor.observation.anchorHeaderIdHex
      !== checkpointAnchor.mining.finalSnapshot.headerIdHex
  ) {
    throw new Error(
      'isolated devnet application checkpoint-to-anchor binding changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_V5_SCHEMA,
    version: 5 as const,
    status: 'application_checkpoint_anchored_in_local_ergo_devnet' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Receipt['pegIn'],
    application,
    checkpointAnchor,
    checks: {
      setupVaultMintBurnCheckpointAndAnchorCompletedInOneChainLifetime:
        true as const,
      exactApplicationCheckpointEncodedInto0401: true as const,
      sameChainCheckpointExtensionMinedAfterApplication: true as const,
      exactPrimaryWitnessAnchorAgreementEstablished: true as const,
      exactExtensionMembershipRecomputed: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      localSetupAndPegInBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      localErgoCheckpointAnchorObserved: true as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      trackerCandidateConstructed: false as const,
      trackerJvmReductionAccepted: false as const,
      trackerNodeCheckPerformed: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      trackerSigningPerformed: false as const,
      trackerSubmissionPerformed: false as const,
      trackerBroadcastPerformed: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Extends the local application-checkpoint campaign through an active-target
 * observed-header tracker signature and same-target JVM check. The signed
 * transaction is not returned, submitted, broadcast, or admitted into state.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const {
    buildReceipt,
    managed,
    checkpointAnchor,
    observedAnchorTracker,
  } = await runManagedCampaign(
    input,
    pegInPlan,
    'check-observed-anchor-tracker',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  const pegIn = managed.value.pegIn;
  const application = managed.value.applicationCheckpoint;
  const trackerStage = managed.value.trackerCandidate;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || application === undefined
    || trackerStage === undefined
    || trackerStage.application !== application
    || checkpointAnchor === undefined
    || observedAnchorTracker === undefined
  ) {
    throw new Error(
      'isolated devnet observed-anchor tracker-check campaign was incomplete',
    );
  }
  const applicationReceipt = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    applicationReceipt,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
    checkpointAnchor.observation,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
    observedAnchorTracker.observation,
  );
  assertSubstrateFederatedTrackerV1Context(observedAnchorTracker.context);
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1(
    observedAnchorTracker.check,
  );
  const statement =
    applicationReceipt.checkpoint.checkpointAttestation.checkpointStatement;
  const expectedExtensionValueHex =
    encodeSubstrateFederatedCheckpointExtensionValueV1(
      statement.encodedStatementHex,
    );
  const context = observedAnchorTracker.context;
  const check = observedAnchorTracker.check;
  const activeObservation = observedAnchorTracker.observation;
  const trackerExecution = observedAnchorTracker.execution;
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  const contextTip = context.trackerTransition.headers[0];
  const finalTrackerConfirmations = managed.value.transactions.filter(
    transaction => transaction.ordinal === 0 && transaction.role === 'tracker',
  );
  if (
    anchor === undefined
    || contextTip === undefined
    || finalTrackerConfirmations.length !== 1
    || finalTrackerConfirmations[0]!.expectedTxId
      !== trackerStage.trackerSetup.expectedTxId
    || finalTrackerConfirmations[0]!.confirmationHeight
      !== trackerStage.trackerSetup.confirmationHeight
    || finalTrackerConfirmations[0]!.confirmationHeaderIdHex
      !== trackerStage.trackerSetup.confirmationHeaderIdHex
    || trackerStage.trackerInputBox.boxId
      !== trackerStage.trackerSetup.outputBoxIdHex
    || checkpointAnchor.mining.extensionValueHex !== expectedExtensionValueHex
    || checkpointAnchor.observation.extensionValueHex
      !== expectedExtensionValueHex
    || checkpointAnchor.observation.processBindingDigestHex
      !== checkpointAnchor.mining.processBindingDigestHex
    || checkpointAnchor.observation.executionTargetIdentityDigestHex
      !== checkpointAnchor.mining.executionTargetIdentityDigestHex
    || checkpointAnchor.observation.targetGenesisHeaderIdHex
      !== pegIn.fundingObservation.genesisHeaderIdHex
    || checkpointAnchor.observation.priorHeaderIdHex
      !== managed.receipt.finalSnapshot.headerIdHex
    || checkpointAnchor.observation.priorHeight
      !== managed.receipt.finalSnapshot.fullHeight
    || checkpointAnchor.observation.anchorHeight
      !== checkpointAnchor.mining.finalSnapshot.fullHeight
    || checkpointAnchor.observation.anchorHeaderIdHex
      !== checkpointAnchor.mining.finalSnapshot.headerIdHex
    || activeObservation.targetGenesisHeaderIdHex
      !== checkpointAnchor.observation.targetGenesisHeaderIdHex
    || activeObservation.extensionValueHex !== expectedExtensionValueHex
    || activeObservation.anchorHeaderIdHex
      !== checkpointAnchor.observation.anchorHeaderIdHex
    || activeObservation.anchorHeight
      !== checkpointAnchor.observation.anchorHeight
    || activeObservation.anchorExtensionRootHex
      !== checkpointAnchor.observation.anchorExtensionRootHex
    || activeObservation.headers.length !== 10
    || activeObservation.boundaries.primaryAndWitnessAgreed !== true
    || activeObservation.boundaries.primaryMiningDuringObservation !== true
    || activeObservation.boundaries.checkpointBoundActiveTarget !== true
    || activeObservation.boundaries.exactCheckpointRetainedInCurrentContext
      !== true
    || activeObservation.boundaries.exactExtensionMembershipRecomputed !== true
    || activeObservation.processBindingDigestHex
      !== trackerExecution.processBindingDigestHex
    || activeObservation.executionTargetIdentityDigestHex
      !== trackerExecution.executionTargetIdentityDigestHex
    || trackerExecution.extensionValueHex !== expectedExtensionValueHex
    || trackerExecution.extensionKeyHex
      !== checkpointAnchor.mining.extensionKeyHex
    || trackerExecution.extensionFieldsSha256Hex
      !== checkpointAnchor.mining.extensionFieldsSha256Hex
    || trackerExecution.executionTargetIdentityDigestHex
      !== checkpointAnchor.mining.executionTargetIdentityDigestHex
    || trackerExecution.primaryMiningDuringAction !== true
    || trackerExecution.witnessReadOnlyDuringAction !== true
    || trackerExecution.checkpointExtensionBoundDuringAction !== true
    || trackerExecution.trackerAdmissionMiningCredentialConsumedOnce !== true
    || trackerExecution.checkpointSnapshotRevalidatedOnBothNodes !== true
    || trackerExecution.checkpointSnapshot.headerIdHex
      !== checkpointAnchor.observation.anchorHeaderIdHex
    || trackerExecution.checkpointSnapshot.fullHeight
      !== checkpointAnchor.observation.anchorHeight
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || context.statement.encodedHex !== statement.encodedStatementHex
    || context.statement.statementIdHex !== statement.statementIdHex
    || context.trackerTransition.headers.length !== 10
    || context.trackerTransition.currentErgoHeight !== contextTip.height + 1
    || anchor.id !== checkpointAnchor.observation.anchorHeaderIdHex
    || anchor.height !== checkpointAnchor.observation.anchorHeight
    || anchor.extensionRootHex
      !== checkpointAnchor.observation.anchorExtensionRootHex
    || check.trackerInputBoxIdHex !== trackerStage.trackerInputBox.boxId
    || check.statementIdHex !== context.statement.statementIdHex
    || check.anchorHeaderIdHex !== anchor.id
    || check.anchorHeight !== anchor.height
    || check.anchorContextIndex
      !== context.trackerTransition.anchorContextIndex
    || check.unsignedTransactionIdHex !== context.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== context.unsignedTransactionIdHex
    || context.trackerTransition.anchorContextIndex
      !== activeObservation.anchorContextIndex
    || check.target.processBindingDigestHex
      !== activeObservation.processBindingDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== activeObservation.executionTargetIdentityDigestHex
    || check.signer.stateContextTipHeight !== contextTip.height
    || check.signer.stateContextTipIdHex !== contextTip.id
    || check.boundaries.observedAnchorContextBound !== true
    || check.boundaries.checkpointBoundActiveTarget !== true
    || check.boundaries.exactTrackerInputAndTransactionBound !== true
    || check.boundaries.localWasmRootSigningPerformed !== true
    || check.boundaries.localJvmNodeCheckPassed !== true
    || check.boundaries.signedTransactionBytesPersisted !== false
    || check.boundaries.submissionAuthorityEstablished !== false
    || check.boundaries.broadcastAuthorityEstablished !== false
    || check.boundaries.trackerAdmissionEstablished !== false
    || check.boundaries.replayProtectionEstablished !== false
    || check.boundaries.payoutEstablished !== false
    || check.boundaries.fundsAuthorityEstablished !== false
    || check.boundaries.gate5Closed !== false
    || check.boundaries.trustlessStatusEstablished !== false
    || check.boundaries.productionReadinessEstablished !== false
  ) {
    throw new Error(
      'isolated devnet observed anchor, tracker candidate, and JVM check binding changed',
    );
  }
  const tracker = projectManagedObservedAnchorTrackerV6(
    trackerStage,
    trackerExecution,
    activeObservation,
    context,
    check,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA,
    version: 6 as const,
    status:
      'observed_anchor_tracker_candidate_accepted_by_local_node_check' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt['pegIn'],
    application,
    checkpointAnchor,
    tracker,
    checks: {
      setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
        true as const,
      exactObserved0401AnchorConsumedByTrackerCandidate: true as const,
      exactCheckpointBoundActiveTargetConsumedByTrackerCheck: true as const,
      exactConfirmedTrackerSetupOutputConsumed: true as const,
      exactSameProcessTrackerCompilerReceiptConsumed: true as const,
      localWasmSignatureAcceptedBySameTargetJvmCheck: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      localSetupAndPegInBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      localErgoCheckpointAnchorObserved: true as const,
      checkpointBoundTrackerExecutionObserved: true as const,
      trackerCandidateConstructed: true as const,
      trackerJvmReductionAccepted: true as const,
      trackerNodeCheckPerformed: true as const,
      trackerSigningPerformed: true as const,
      signedTrackerBytesPersisted: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      trackerSubmissionPerformed: false as const,
      trackerBroadcastPerformed: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  return Object.freeze({ receipt });
}

/**
 * Repeats the V6 tracker check against the same task-owned chain only after
 * both local nodes have been restarted in a frozen non-mining window.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const execution = await runManagedCampaign(
    input,
    pegInPlan,
    'check-observed-anchor-tracker-frozen',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  return Object.freeze({
    receipt: finalizeFrozenObservedAnchorTrackerCheckCampaignRootV7(
      execution,
    ),
  });
}

function finalizeFrozenObservedAnchorTrackerCheckCampaignRootV7(
  execution: Readonly<ManagedCampaignExecutionV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
> {
  const {
    buildReceipt,
    managed,
    checkpointAnchor,
    frozenObservedAnchorTracker,
  } = execution;
  const pegIn = managed.value.pegIn;
  const application = managed.value.applicationCheckpoint;
  const trackerStage = managed.value.trackerCandidate;
  if (
    pegIn === undefined
    || pegIn.sourceLockCheck === undefined
    || pegIn.sourceLockExecution === undefined
    || pegIn.committedVaultCheck === undefined
    || pegIn.committedVaultExecution === undefined
    || application === undefined
    || trackerStage === undefined
    || trackerStage.application !== application
    || checkpointAnchor === undefined
    || frozenObservedAnchorTracker === undefined
  ) {
    throw new Error(
      'isolated devnet frozen observed-anchor tracker-check campaign was incomplete',
    );
  }
  const applicationReceipt = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    applicationReceipt,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
    checkpointAnchor.observation,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
    frozenObservedAnchorTracker.observation,
  );
  assertSubstrateFederatedTrackerV1Context(
    frozenObservedAnchorTracker.context,
  );
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
    frozenObservedAnchorTracker.check,
  );

  const statement =
    applicationReceipt.checkpoint.checkpointAttestation.checkpointStatement;
  const expectedExtensionValueHex =
    encodeSubstrateFederatedCheckpointExtensionValueV1(
      statement.encodedStatementHex,
    );
  const context = frozenObservedAnchorTracker.context;
  const check = frozenObservedAnchorTracker.check;
  const frozenObservation = frozenObservedAnchorTracker.observation;
  const trackerExecution = frozenObservedAnchorTracker.execution;
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  const contextTip = context.trackerTransition.headers[0];
  const frozenTip = frozenObservation.headers[0];
  if (frozenTip === undefined) {
    throw new Error(
      'isolated devnet frozen observed anchor, tracker candidate, and JVM check binding changed',
    );
  }
  const finalTrackerConfirmations = managed.value.transactions.filter(
    transaction => transaction.ordinal === 0 && transaction.role === 'tracker',
  );
  const actionStart = trackerExecution.actionStartSnapshot;
  const actionEnd = trackerExecution.actionEndSnapshot;
  const expectedCheckpointExtensionObservationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
      checkpointAnchor.observation,
    );
  const failFrozenBinding = (binding: string): never => {
    throw new Error(
      `isolated devnet frozen observed anchor, tracker candidate, and JVM check binding changed: ${binding}`,
    );
  };
  if (anchor === undefined) failFrozenBinding('anchor missing');
  if (contextTip === undefined) failFrozenBinding('context tip missing');
  if (finalTrackerConfirmations.length !== 1) {
    failFrozenBinding('tracker confirmation cardinality');
  }
  const finalTrackerConfirmation = finalTrackerConfirmations[0]!;
  const frozenBindingChecks = [
    ['tracker confirmation transaction',
      () => finalTrackerConfirmation.expectedTxId === trackerStage.trackerSetup.expectedTxId],
    ['tracker confirmation height',
      () => finalTrackerConfirmation.confirmationHeight
        === trackerStage.trackerSetup.confirmationHeight],
    ['tracker confirmation header',
      () => finalTrackerConfirmation.confirmationHeaderIdHex
        === trackerStage.trackerSetup.confirmationHeaderIdHex],
    ['tracker input box',
      () => trackerStage.trackerInputBox.boxId === trackerStage.trackerSetup.outputBoxIdHex],
    ['mined extension value',
      () => checkpointAnchor.mining.extensionValueHex === expectedExtensionValueHex],
    ['observed extension value',
      () => checkpointAnchor.observation.extensionValueHex === expectedExtensionValueHex],
    ['anchor process binding',
      () => checkpointAnchor.observation.processBindingDigestHex
        === checkpointAnchor.mining.processBindingDigestHex],
    ['anchor execution target',
      () => checkpointAnchor.observation.executionTargetIdentityDigestHex
        === checkpointAnchor.mining.executionTargetIdentityDigestHex],
    ['anchor target genesis',
      () => checkpointAnchor.observation.targetGenesisHeaderIdHex
        === pegIn.fundingObservation.genesisHeaderIdHex],
    ['anchor prior header',
      () => checkpointAnchor.observation.priorHeaderIdHex
        === managed.receipt.finalSnapshot.headerIdHex],
    ['anchor prior height',
      () => checkpointAnchor.observation.priorHeight
        === managed.receipt.finalSnapshot.fullHeight],
    ['anchor mined height',
      () => checkpointAnchor.observation.anchorHeight
        === checkpointAnchor.mining.finalSnapshot.fullHeight],
    ['anchor mined header',
      () => checkpointAnchor.observation.anchorHeaderIdHex
        === checkpointAnchor.mining.finalSnapshot.headerIdHex],
    ['frozen target genesis',
      () => frozenObservation.targetGenesisHeaderIdHex
        === checkpointAnchor.observation.targetGenesisHeaderIdHex],
    ['frozen extension value',
      () => frozenObservation.extensionValueHex === expectedExtensionValueHex],
    ['frozen anchor header',
      () => frozenObservation.anchorHeaderIdHex
        === checkpointAnchor.observation.anchorHeaderIdHex],
    ['frozen anchor height',
      () => frozenObservation.anchorHeight === checkpointAnchor.observation.anchorHeight],
    ['frozen anchor extension root',
      () => frozenObservation.anchorExtensionRootHex
        === checkpointAnchor.observation.anchorExtensionRootHex],
    ['frozen header cardinality', () => frozenObservation.headers.length === 10],
    ['frozen observation schema',
      () => frozenObservation.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA],
    ['frozen observation version', () => frozenObservation.version === 2],
    ['frozen node agreement',
      () => frozenObservation.boundaries.primaryAndWitnessAgreed === true],
    ['frozen observation mining stop',
      () => frozenObservation.boundaries.miningStoppedDuringObservation === true],
    ['frozen checkpoint target',
      () => frozenObservation.boundaries.checkpointBoundFrozenTarget === true],
    ['frozen checkpoint retention',
      () => frozenObservation.boundaries.exactCheckpointRetainedInCurrentContext === true],
    ['frozen extension recomputation',
      () => frozenObservation.boundaries.exactExtensionMembershipRecomputed === true],
    ['frozen execution process binding',
      () => frozenObservation.processBindingDigestHex
        === trackerExecution.processBindingDigestHex],
    ['frozen execution target',
      () => frozenObservation.executionTargetIdentityDigestHex
        === trackerExecution.executionTargetIdentityDigestHex],
    ['execution schema',
      () => trackerExecution.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA],
    ['execution version', () => trackerExecution.version === 2],
    ['execution extension value',
      () => trackerExecution.extensionValueHex === expectedExtensionValueHex],
    ['execution extension key',
      () => trackerExecution.extensionKeyHex === checkpointAnchor.mining.extensionKeyHex],
    ['execution extension fields',
      () => trackerExecution.extensionFieldsSha256Hex
        === checkpointAnchor.mining.extensionFieldsSha256Hex],
    ['execution target identity',
      () => trackerExecution.executionTargetIdentityDigestHex
        === checkpointAnchor.mining.executionTargetIdentityDigestHex],
    ['execution mining stopped', () => trackerExecution.primaryMiningDuringAction === false],
    ['execution primary read only', () => trackerExecution.primaryReadOnlyDuringAction === true],
    ['execution witness read only', () => trackerExecution.witnessReadOnlyDuringAction === true],
    ['execution pre-action mining stop', () => trackerExecution.miningStoppedBeforeAction === true],
    ['execution frozen snapshot',
      () => trackerExecution.exactFrozenSnapshotStableAcrossAction === true],
    ['execution checkpoint extension',
      () => trackerExecution.checkpointExtensionBoundDuringAction === true],
    ['execution credential consumption',
      () => trackerExecution.trackerAdmissionMiningCredentialConsumedOnce === true],
    ['execution checkpoint revalidation',
      () => trackerExecution.checkpointSnapshotRevalidatedOnBothNodes === true],
    ['execution checkpoint header',
      () => trackerExecution.checkpointSnapshot.headerIdHex
        === checkpointAnchor.observation.anchorHeaderIdHex],
    ['execution checkpoint height',
      () => trackerExecution.checkpointSnapshot.fullHeight
        === checkpointAnchor.observation.anchorHeight],
    ['execution checkpoint extension binding digest',
      () => trackerExecution.checkpointExtensionObservationDigestHex
        === expectedCheckpointExtensionObservationDigestHex],
    ['action network stability', () => actionStart.network === actionEnd.network],
    ['action height stability', () => actionStart.fullHeight === actionEnd.fullHeight],
    ['action indexed height stability',
      () => actionStart.indexedHeight === actionEnd.indexedHeight],
    ['action header stability', () => actionStart.headerIdHex === actionEnd.headerIdHex],
    ['action frozen height', () => actionStart.fullHeight === frozenTip.height],
    ['action frozen indexed height', () => actionStart.indexedHeight === frozenTip.height],
    ['action frozen header', () => actionStart.headerIdHex === frozenTip.idHex],
    ['context frozen height', () => contextTip.height === frozenTip.height],
    ['context frozen header', () => contextTip.id === frozenTip.idHex],
    ['context provenance',
      () => context.trackerTransition.anchorContextProvenance
        === BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE],
    ['context statement bytes',
      () => context.statement.encodedHex === statement.encodedStatementHex],
    ['context statement identity',
      () => context.statement.statementIdHex === statement.statementIdHex],
    ['context header cardinality', () => context.trackerTransition.headers.length === 10],
    ['context current height',
      () => context.trackerTransition.currentErgoHeight === contextTip.height + 1],
    ['context anchor header',
      () => anchor.id === checkpointAnchor.observation.anchorHeaderIdHex],
    ['context anchor height', () => anchor.height === checkpointAnchor.observation.anchorHeight],
    ['context anchor extension root',
      () => anchor.extensionRootHex === checkpointAnchor.observation.anchorExtensionRootHex],
    ['check tracker input', () => check.trackerInputBoxIdHex === trackerStage.trackerInputBox.boxId],
    ['check schema',
      () => check.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA],
    ['check version', () => check.version === 2],
    ['check statement identity',
      () => check.statementIdHex === context.statement.statementIdHex],
    ['check anchor header', () => check.anchorHeaderIdHex === anchor.id],
    ['check anchor height', () => check.anchorHeight === anchor.height],
    ['check anchor index',
      () => check.anchorContextIndex === context.trackerTransition.anchorContextIndex],
    ['check unsigned transaction',
      () => check.unsignedTransactionIdHex === context.unsignedTransactionIdHex],
    ['check signed transaction',
      () => check.signedTransactionIdHex === context.unsignedTransactionIdHex],
    ['check frozen anchor index',
      () => context.trackerTransition.anchorContextIndex
        === frozenObservation.anchorContextIndex],
    ['check target process binding',
      () => check.target.processBindingDigestHex
        === frozenObservation.processBindingDigestHex],
    ['check target execution identity',
      () => check.target.executionTargetIdentityDigestHex
        === frozenObservation.executionTargetIdentityDigestHex],
    ['check signer tip height', () => check.signer.stateContextTipHeight === contextTip.height],
    ['check signer tip header', () => check.signer.stateContextTipIdHex === contextTip.id],
    ['check observed anchor boundary', () => check.boundaries.observedAnchorContextBound === true],
    ['check frozen target boundary', () => check.boundaries.checkpointBoundFrozenTarget === true],
    ['check transaction boundary',
      () => check.boundaries.exactTrackerInputAndTransactionBound === true],
    ['check signing boundary', () => check.boundaries.localWasmRootSigningPerformed === true],
    ['check JVM boundary', () => check.boundaries.localJvmNodeCheckPassed === true],
    ['check signed bytes persistence',
      () => check.boundaries.signedTransactionBytesPersisted === false],
    ['check submission authority',
      () => check.boundaries.submissionAuthorityEstablished === false],
    ['check broadcast authority',
      () => check.boundaries.broadcastAuthorityEstablished === false],
    ['check tracker admission', () => check.boundaries.trackerAdmissionEstablished === false],
    ['check replay protection', () => check.boundaries.replayProtectionEstablished === false],
    ['check payout', () => check.boundaries.payoutEstablished === false],
    ['check funds authority', () => check.boundaries.fundsAuthorityEstablished === false],
    ['check Gate 5', () => check.boundaries.gate5Closed === false],
    ['check trustless status', () => check.boundaries.trustlessStatusEstablished === false],
    ['check production readiness',
      () => check.boundaries.productionReadinessEstablished === false],
  ] as const;
  const failedBinding = frozenBindingChecks.find(([, matches]) => !matches());
  if (failedBinding !== undefined) failFrozenBinding(failedBinding[0]);
  const tracker = projectManagedFrozenObservedAnchorTrackerV7(
    trackerStage,
    trackerExecution,
    frozenObservation,
    context,
    check,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
    version: 7 as const,
    status:
      'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
    build: buildReceipt,
    process: managed.receipt,
    setup: {
      lifecycle: managed.value.lifecycle,
      transactions: managed.value.transactions,
    },
    pegIn: pegIn as SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt['pegIn'],
    application,
    checkpointAnchor,
    tracker,
    checks: {
      setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
        true as const,
      exactObserved0401AnchorConsumedByTrackerCandidate: true as const,
      exactCheckpointBoundFrozenTargetConsumedByTrackerCheck: true as const,
      exactFrozenSnapshotStableAcrossTrackerCheck: true as const,
      exactConfirmedTrackerSetupOutputConsumed: true as const,
      exactSameProcessTrackerCompilerReceiptConsumed: true as const,
      localWasmSignatureAcceptedBySameTargetJvmCheck: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      localSetupAndPegInBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      localErgoCheckpointAnchorObserved: true as const,
      checkpointBoundFrozenTrackerExecutionObserved: true as const,
      trackerCandidateConstructed: true as const,
      trackerJvmReductionAccepted: true as const,
      trackerNodeCheckPerformed: true as const,
      trackerSigningPerformed: true as const,
      signedTrackerBytesPersisted: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      trackerSubmissionPerformed: false as const,
      trackerBroadcastPerformed: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  registerSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
    receipt,
    Object.freeze({
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
      applicationCheckpoint: applicationReceipt,
      checkpointAnchorObservation: checkpointAnchor.observation,
      tracker,
    }),
  );
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
> {
  assertFrozenObservedAnchorTrackerCheckCampaignRootV7RegistryProvenance(
    value,
  );
}

/**
 * Persists and reloads the exact V7 reservation, then rechecks its unchanged
 * candidate against fresh frozen observations before any transport exists.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8
>> {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const execution = await runManagedCampaign(
    input,
    pegInPlan,
    'revalidate-tracker-reservation-freshness',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
  );
  const material = execution.trackerReservationFreshness;
  if (material === undefined) {
    throw new Error(
      'isolated devnet tracker reservation freshness campaign was incomplete',
    );
  }
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
    material.frozenTrackerRoot,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
    material.authorization,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    material.durableReservation,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
    material.observation,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    material.check,
  );

  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA,
    version: 8 as const,
    status:
      'durable_tracker_reservation_reloaded_and_freshness_rechecked' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8,
    frozenTrackerRoot: material.frozenTrackerRoot,
    reservation: {
      authorization: material.authorization,
      durable: material.durableReservation,
      reloaded: material.reloadedReservation,
    },
    freshness: {
      execution: material.execution,
      observation: material.observation,
      check: material.check,
    },
    checks: {
      setupThroughFreshnessCompletedInOneChainLifetime: true as const,
      firstReservationStoreClosedBeforeReopen: true as const,
      exactReservationReloadedBeforeAndAfterFreshness: true as const,
      exactFrozenTrackerTargetReacquired: true as const,
      exactObserved0401AnchorReacquired: true as const,
      exactReservedTrackerCandidateReconstructed: true as const,
      sameSyntheticSignerAndJvmCheckReused: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      processProvenFrozenTrackerRootConsumed: true as const,
      durableReservationEstablished: true as const,
      localDatabaseAuthoritative: false as const,
      trackerInputRevalidated: true as const,
      checkpointAnchorRevalidated: true as const,
      frozenTargetSnapshotRevalidated: true as const,
      trackerJvmReductionRechecked: true as const,
      trackerSigningPerformed: true as const,
      signedTrackerBytesPersisted: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_RECEIPTS.add(receipt);
  return Object.freeze({ receipt });
}

function finalizeTrackerReservationFreshnessReceiptV8(
  material: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt
> {
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA,
    version: 8 as const,
    status:
      'durable_tracker_reservation_reloaded_and_freshness_rechecked' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8,
    frozenTrackerRoot: material.frozenTrackerRoot,
    reservation: {
      authorization: material.authorization,
      durable: material.durableReservation,
      reloaded: material.reloadedReservation,
    },
    freshness: {
      execution: material.execution,
      observation: material.observation,
      check: material.check,
    },
    checks: {
      setupThroughFreshnessCompletedInOneChainLifetime: true as const,
      firstReservationStoreClosedBeforeReopen: true as const,
      exactReservationReloadedBeforeAndAfterFreshness: true as const,
      exactFrozenTrackerTargetReacquired: true as const,
      exactObserved0401AnchorReacquired: true as const,
      exactReservedTrackerCandidateReconstructed: true as const,
      sameSyntheticSignerAndJvmCheckReused: true as const,
      everyEphemeralCapabilityDisposedBeforeReturn: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      processProvenFrozenTrackerRootConsumed: true as const,
      durableReservationEstablished: true as const,
      localDatabaseAuthoritative: false as const,
      trackerInputRevalidated: true as const,
      checkpointAnchorRevalidated: true as const,
      frozenTargetSnapshotRevalidated: true as const,
      trackerJvmReductionRechecked: true as const,
      trackerSigningPerformed: true as const,
      signedTrackerBytesPersisted: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Object.isFrozen(value)
    || !TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_RECEIPTS.has(value)
  ) {
    throw new Error(
      'isolated devnet tracker reservation freshness root V8 lacks exact runtime provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt
  >;
  const { receiptDigestHex, ...body } = receipt;
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA
    || receipt.version !== 8
    || receipt.status
      !== 'durable_tracker_reservation_reloaded_and_freshness_rechecked'
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8
    || sha256CanonicalJson(
      body,
      PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
    ) !== receiptDigestHex
  ) {
    throw new Error(
      'isolated devnet tracker reservation freshness root V8 binding changed',
    );
  }
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
    receipt.frozenTrackerRoot,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
    receipt.reservation.authorization,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    receipt.reservation.durable,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
    receipt.freshness.observation,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    receipt.freshness.check,
  );
}

const TRACKER_TRANSPORT_SENSITIVE_PATH_PATTERN =
  /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.ssh|logs?|db|database|[^\\/]*(?:mnemonic|seed[-_ ]?phrase|private[-_ ]?key|api[-_ ]?key|credentials?|secret|wallet|keystore|keyring|deployed[-_ ]state|deployment[-_ ]state|runtime[-_ ]?(?:db|database|state))[^\\/]*|[^\\/]+\.(?:sqlite(?:3)?|db|log)(?:[.-][^\\/]*)?)(?:[\\/]|$)/iu;
const TRACKER_TRANSPORT_ATTEMPT_DIRECTORY =
  'tracker-transport-attempt' as const;

function normalizeTrackerTransportJournalRootV9(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || hasRemoteOrDevicePathV9(value)
    || TRACKER_TRANSPORT_SENSITIVE_PATH_PATTERN.test(value)
  ) {
    throw new Error(
      'isolated tracker transport journal root must be one local absolute non-sensitive path',
    );
  }
  const requested = resolve(value);
  if (
    hasRemoteOrDevicePathV9(requested)
    || TRACKER_TRANSPORT_SENSITIVE_PATH_PATTERN.test(requested)
    || (
      platform() === 'win32'
      && !/^[A-Za-z]:[\\/]$/u.test(win32.parse(requested).root)
    )
  ) {
    throw new Error(
      'isolated tracker transport journal root must remain on one local drive',
    );
  }
  const status = lstatSync(requested);
  const canonical = realpathSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || canonicalPathIdentityV9(canonical)
      !== canonicalPathIdentityV9(requested)
  ) {
    throw new Error(
      'isolated tracker transport journal root must be one link-free directory',
    );
  }
  const worktreeRoot = realpathSync(resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    '..',
  ));
  if (pathsOverlapV9(worktreeRoot, canonical)) {
    throw new Error(
      'isolated tracker transport journal root must remain outside the worktree',
    );
  }
  if (readdirSync(canonical).length !== 0) {
    throw new Error(
      'isolated tracker transport journal root must be empty before the one-attempt campaign',
    );
  }
  const ownedRoot = join(canonical, TRACKER_TRANSPORT_ATTEMPT_DIRECTORY);
  try {
    mkdirSync(ownedRoot);
  } catch (error) {
    throw new Error(
      'isolated tracker transport campaign journal root is already claimed',
      { cause: error },
    );
  }
  const claimedEntries = readdirSync(canonical);
  if (
    claimedEntries.length !== 1
    || claimedEntries[0] !== TRACKER_TRANSPORT_ATTEMPT_DIRECTORY
  ) {
    throw new Error(
      'isolated tracker transport campaign journal parent changed during claim',
    );
  }
  return assertReservedTrackerTransportJournalRootV9(ownedRoot);
}

function assertReservedTrackerTransportJournalRootV9(value: string): string {
  const requested = resolve(value);
  const status = lstatSync(requested);
  const canonical = realpathSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || canonicalPathIdentityV9(canonical)
      !== canonicalPathIdentityV9(requested)
    || readdirSync(canonical).length !== 0
  ) {
    throw new Error(
      'isolated tracker transport campaign journal root changed before opening',
    );
  }
  return canonical;
}

function hasRemoteOrDevicePathV9(value: string): boolean {
  return /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(value);
}

function canonicalPathIdentityV9(value: string): string {
  return platform() === 'win32' ? value.toLowerCase() : value;
}

function pathsOverlapV9(left: string, right: string): boolean {
  return isPathInsideV9(left, right) || isPathInsideV9(right, left);
}

function isPathInsideV9(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === ''
    || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function trackerTransportCanonicalConfirmationFailureV9(
  authorization: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1
  >,
  attempt: Readonly<{
    readonly expectedTransactionIdHex: string;
    readonly durableAttemptDigestHex: string;
  }>,
  outcome: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportOutcomeV1>,
  cause: unknown,
): Error {
  const confirmation =
    projectTrackerCanonicalConfirmationFailureDiagnosticV1(cause)
    ?? deepFreeze({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA,
      version: 1 as const,
      category: 'confirmation_phase_failure' as const,
      expectedTransactionIdHex: attempt.expectedTransactionIdHex,
      executionTargetIdentityDigestHex:
        authorization.executionTargetIdentityDigestHex,
      confirmationBudgetMs: TRANSACTION_CONFIRMATION_BUDGET_MS,
      observationCount: 0,
      lastObservation: null,
    });
  if (
    authorization.expectedTransactionIdHex !== attempt.expectedTransactionIdHex
    || outcome.expectedTransactionIdHex !== attempt.expectedTransactionIdHex
    || outcome.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
    || outcome.trackerAdmissionEstablished !== false
    || confirmation.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA
    || confirmation.version !== 1
    || !TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1.includes(
      confirmation.category,
    )
    || confirmation.expectedTransactionIdHex
      !== attempt.expectedTransactionIdHex
    || confirmation.executionTargetIdentityDigestHex
      !== authorization.executionTargetIdentityDigestHex
    || confirmation.confirmationBudgetMs !== TRANSACTION_CONFIRMATION_BUDGET_MS
    || (outcome.status !== 'accepted' && outcome.status !== 'ambiguous')
    || (
      outcome.status === 'accepted'
        ? outcome.submittedTransactionIdHex !== attempt.expectedTransactionIdHex
        : outcome.submittedTransactionIdHex !== null
    )
  ) {
    throw new Error(
      'isolated tracker transport terminal failure binding changed',
    );
  }
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9' as const,
    version: 9 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
    transport: Object.freeze({
      authorization: Object.freeze({
        expectedTransactionIdHex: authorization.expectedTransactionIdHex,
        executionTargetIdentityDigestHex:
          authorization.executionTargetIdentityDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
      }),
      attempt: Object.freeze({
        expectedTransactionIdHex: attempt.expectedTransactionIdHex,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      }),
      outcome: Object.freeze({
        status: outcome.status,
        expectedTransactionIdHex: outcome.expectedTransactionIdHex,
        submittedTransactionIdHex: outcome.submittedTransactionIdHex,
        durableAttemptDigestHex: outcome.durableAttemptDigestHex,
        outcomeDigestHex: outcome.outcomeDigestHex,
        responseDigestHex: outcome.responseDigestHex,
      }),
    }),
    confirmation,
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      oneTransportAttemptRecorded: true as const,
      transportOutcomePersisted: true as const,
      exactNodeAcceptanceObserved: outcome.status === 'accepted',
      canonicalConfirmationObserved: false as const,
      trackerAdmissionEstablished: false as const,
      signedTrackerBytesPersisted: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  const receipt = finalizeReceipt(
    body,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9,
  );
  assertCapabilityFreePlainData(
    receipt,
    'isolated devnet tracker transport failure receipt',
  );
  const failure = new Error(
    'isolated tracker transport was not canonically confirmed',
    { cause },
  );
  TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9_RECEIPTS.set(failure, receipt);
  return failure;
}

function projectTrackerCanonicalConfirmationFailureDiagnosticV1(
  value: unknown,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureDiagnosticV1
> | null {
  return projectDirectOrPrimaryAggregateFailureV1(
    value,
    TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTICS_V1,
  );
}

export function projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
  value: unknown,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9Receipt
> | null {
  return projectDirectOrPrimaryAggregateFailureV1(
    value,
    TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9_RECEIPTS,
  );
}

function projectDirectOrPrimaryAggregateFailureV1<T>(
  value: unknown,
  registry: WeakMap<Error, Readonly<T>>,
): Readonly<T> | null {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null) return null;
    const direct = registry.get(current as Error);
    if (direct !== undefined) return direct;
    if (!isNativeError(current) || isProxy(current)) return null;
    const errorsDescriptor = Object.getOwnPropertyDescriptor(
      current,
      'errors',
    );
    if (
      errorsDescriptor === undefined
      || !('value' in errorsDescriptor)
      || !Array.isArray(errorsDescriptor.value)
      || isProxy(errorsDescriptor.value)
    ) {
      return null;
    }
    const primaryDescriptor = Object.getOwnPropertyDescriptor(
      errorsDescriptor.value,
      '0',
    );
    if (primaryDescriptor === undefined || !('value' in primaryDescriptor)) {
      return null;
    }
    current = primaryDescriptor.value;
  }
  return null;
}

/**
 * Extend V8 by one durable, credential-free loopback transport attempt. The
 * retained journal is intentionally not returned. The exact attempt must be
 * canonically confirmed in the same owned devnet lifecycle before teardown.
 */
export async function runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Input
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9
>> {
  const trackerTransportJournalRoot =
    normalizeTrackerTransportJournalRootV9(input.trackerTransportJournalRoot);
  const requestCampaignBinding =
    claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
      input.requestBinding,
      input,
    );
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: input.lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: input.lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const pegInPlan = normalizePegInCandidatePlan(input.pegIn);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(
    input.frontierApplicationRunner,
  );
  const sourceAcceptanceBuildWorkspace = Object.freeze({
    temporaryDirectoryRoot: applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: applicationRunner.cargoDependencyCacheDirectory,
  });
  const execution = await runManagedCampaign(
    input,
    pegInPlan,
    'submit-tracker-once',
    undefined,
    applicationRunner,
    sourceAcceptanceBuildWorkspace,
    Object.freeze({
      requestBinding: requestCampaignBinding,
      journalRoot: trackerTransportJournalRoot,
    }),
  ).catch(error => {
    if (
      projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
        error,
      ) !== null
      || projectTrackerTransportManagedCampaignPhaseFailureV9(error) !== null
    ) {
      throw error;
    }
    throw createTrackerTransportManagedCampaignPhaseFailureV9(
      'ergo node build',
      error,
    );
  });
  const material = execution.trackerReservationFreshness;
  if (material === undefined || material.transport === undefined) {
    throw new Error(
      'isolated devnet tracker transport campaign was incomplete',
    );
  }
  const freshness = finalizeTrackerReservationFreshnessReceiptV8(material);
  const transport = material.transport;
  if (
    transport.authorization.expectedTransactionIdHex
      !== transport.attempt.expectedTransactionIdHex
    || transport.outcome.expectedTransactionIdHex
      !== transport.attempt.expectedTransactionIdHex
    || transport.outcome.durableAttemptDigestHex
      !== transport.attempt.durableAttemptDigestHex
    || transport.confirmation.status !== 'confirmed'
    || transport.confirmation.confirmationHeight === null
    || transport.confirmation.confirmationHeaderIdHex === null
    || transport.confirmation.confirmations < 1
    || transport.confirmation.transactionIdHex
      !== transport.attempt.expectedTransactionIdHex
    || transport.confirmationExecution.confirmedTransactionIdHex
      !== transport.attempt.expectedTransactionIdHex
    || transport.confirmationExecution
      .trackerTransportProcessBindingDigestHex
      !== transport.execution.processBindingDigestHex
    || transport.confirmationExecution
      .trackerTransportExecutionTargetIdentityDigestHex
      !== transport.execution.executionTargetIdentityDigestHex
    || (
      transport.outcome.status === 'accepted'
        ? transport.outcome.submittedTransactionIdHex
          !== transport.attempt.expectedTransactionIdHex
        : transport.outcome.submittedTransactionIdHex !== null
    )
  ) {
    throw new Error('isolated tracker transport outcome binding changed');
  }

  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_SCHEMA,
    version: 9 as const,
    status: 'local_tracker_transport_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
    freshness,
    transport,
    checks: {
      exactFreshnessCheckPromotedOnce: true as const,
      exactTransportTargetActiveOnlyDuringAttempt: true as const,
      durableAttemptPersistedBeforePost: true as const,
      exactCheckedBytesConsumedOnce: true as const,
      transportOutcomePersistedBeforeReturn: true as const,
      exactAttemptConfirmedBeforeTeardown: true as const,
      persistentJournalPathExcludedFromReceipt: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localIsolatedDevnetOnly: true as const,
      trackerTransportAttempted: true as const,
      exactNodeAcceptanceObserved: true as const,
      oneTransportAttemptRecorded: true as const,
      canonicalConfirmationObserved: true as const,
      trackerAdmissionEstablished: true as const,
      localDatabaseAuthoritative: false as const,
      signedTrackerBytesPersisted: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      profileActivated: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
    },
  };
  const receipt = finalizeReceipt(
    body,
    PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
  );
  assertCapabilityFreePlainData(
    receipt,
    'isolated devnet tracker transport root V9 receipt',
  );
  TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_RECEIPTS.add(receipt);
  return Object.freeze({ receipt });
}

export function assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Receipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Object.isFrozen(value)
    || !TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_RECEIPTS.has(value)
  ) {
    throw new Error(
      'isolated devnet tracker transport root V9 lacks exact runtime provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Receipt
  >;
  const { receiptDigestHex, ...body } = receipt;
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V9_SCHEMA
    || receipt.version !== 9
    || receipt.status !== 'local_tracker_transport_canonically_confirmed'
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9
    || sha256CanonicalJson(
      body,
      PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
    ) !== receiptDigestHex
  ) {
    throw new Error('isolated devnet tracker transport root V9 binding changed');
  }
  assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance(
    receipt.freshness,
  );
}

type PegInActionV1 =
  | 'candidate'
  | 'check-source-lock'
  | 'execute-source-lock'
  | 'execute-committed-vault'
  | 'consume-mint-proof'
  | 'consume-application-checkpoint'
  | 'construct-tracker-candidate'
  | 'mine-checkpoint-anchor'
  | 'check-observed-anchor-tracker'
  | 'check-observed-anchor-tracker-frozen'
  | 'revalidate-tracker-reservation-freshness'
  | 'submit-tracker-once';

function isFrozenTrackerCheckAction(action: PegInActionV1): boolean {
  return action === 'check-observed-anchor-tracker-frozen'
    || action === 'revalidate-tracker-reservation-freshness'
    || action === 'submit-tracker-once';
}

function isApplicationCheckpointAction(action: PegInActionV1): boolean {
  return action === 'consume-application-checkpoint'
    || action === 'construct-tracker-candidate'
    || action === 'mine-checkpoint-anchor'
    || action === 'check-observed-anchor-tracker'
    || isFrozenTrackerCheckAction(action);
}

function isCheckpointMiningAction(action: PegInActionV1): boolean {
  return action === 'mine-checkpoint-anchor'
    || action === 'check-observed-anchor-tracker'
    || isFrozenTrackerCheckAction(action);
}

type SubstrateFederatedIsolatedDevnetPacketSessionV1OrV2OrV3 =
  | Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>
  | Readonly<SubstrateFederatedIsolatedDevnetPacketContinuationSessionV2>
  | Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3
  >;

interface ManagedCampaignExecutionV1 {
  readonly buildReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly managed: Readonly<{
    readonly value: Readonly<ExecutionActionResult>;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  }>;
  readonly checkpointAnchor?: Readonly<{
    readonly mining:
      Readonly<SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt>;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
    >;
  }>;
  readonly observedAnchorTracker?: Readonly<{
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt
    >;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1
    >;
    readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
    readonly check: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
    >;
  }>;
  readonly frozenObservedAnchorTracker?: Readonly<{
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt
    >;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
    >;
    readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
    readonly check: Readonly<
      SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
    >;
  }>;
  readonly trackerReservationFreshness?: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8
  >;
}

async function runManagedCampaign(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input>,
  pegInPlan: Readonly<PegInCandidatePlanV1> | undefined,
  pegInAction: PegInActionV1 = 'candidate',
  frontierMintProofConsumer:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2>
    | undefined = undefined,
  frontierApplicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>
    | undefined = undefined,
  sourceAcceptanceBuildWorkspace:
    Readonly<{
      readonly temporaryDirectoryRoot: string;
      readonly sharedCargoHomeRoot: string;
    }> | undefined = undefined,
  trackerTransportCampaign: Readonly<{
    readonly requestBinding:
      Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>;
    readonly journalRoot: string;
  }> | undefined = undefined,
): Promise<Readonly<ManagedCampaignExecutionV1>> {
  const applicationCheckpointAction =
    isApplicationCheckpointAction(pegInAction);
  if (
    (pegInAction === 'consume-mint-proof')
      !== (frontierMintProofConsumer !== undefined)
    || applicationCheckpointAction !== (frontierApplicationRunner !== undefined)
    || (pegInAction === 'submit-tracker-once')
      !== (trackerTransportCampaign !== undefined)
  ) {
    throw new Error(
      'isolated devnet Frontier consumer must match the campaign action',
    );
  }
  const buildInput = input.build;
  const lifecycleInput = input.lifecycle;
  const built = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(
    buildInput,
  );
  assertCapabilityFreePlainData(built, 'isolated devnet node build result');
  deepFreeze(built);
  let managedPhase: TrackerTransportManagedCampaignPhaseV9 =
    'setup and packet session';
  let setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2> | undefined;
  let packetSession:
    SubstrateFederatedIsolatedDevnetPacketSessionV1OrV2OrV3 | undefined;
  let nodeSession:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1>
    | undefined;
  let managed: ManagedCampaignExecutionV1['managed'] | undefined;
  let checkpointAnchor: ManagedCampaignExecutionV1['checkpointAnchor'];
  let observedAnchorTracker:
    ManagedCampaignExecutionV1['observedAnchorTracker'];
  let frozenObservedAnchorTracker:
    ManagedCampaignExecutionV1['frozenObservedAnchorTracker'];
  let trackerReservationFreshness:
    ManagedCampaignExecutionV1['trackerReservationFreshness'];
  const journalRoots = new Set<string>();
  let failure: unknown;

  try {
    setupSession =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    packetSession = applicationCheckpointAction
      ? createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        setupSession.signer,
      )
      : pegInAction === 'consume-mint-proof'
        ? createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2(
          setupSession.signer,
        )
        : createSubstrateFederatedIsolatedDevnetPacketSessionV1(
          setupSession.signer,
        );
    assertPacketErgoSignerMatchesSetup(packetSession, setupSession.signer);
    const profilePins = deriveExpectedProfilePins(packetSession);
    const processInput = {
      javaExecutablePath: built.javaExecutablePath,
      expectedJavaExecutableSha256Hex:
        built.receipt.toolchain.javaExecutableSha256Hex,
      nodeAssemblyJarPath: built.nodeAssemblyJarPath,
      expectedNodeAssemblyJarSha256Hex:
        built.receipt.build.artifactSha256Hex,
      buildIdentityDigestHex: built.receipt.buildIdentityDigestHex,
    };
    const launchBinding = nodeLaunchBinding(setupSession.signer);
    const credentialSequence = (
      pegInAction === 'check-observed-anchor-tracker'
      || isFrozenTrackerCheckAction(pegInAction)
    )
      ? claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(
        setupSession,
      )
      : undefined;
    const credentialPair = pegInAction === 'mine-checkpoint-anchor'
      ? claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2(setupSession)
      : undefined;
    const miningCredential = credentialSequence?.miningCredential
      ?? credentialPair?.miningCredential
      ?? claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(
        setupSession,
      );
    managedPhase = 'node process construction';
    nodeSession = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
      processInput,
      launchBinding,
      miningCredential,
      credentialSequence?.checkpointMiningCredential
        ?? credentialPair?.checkpointMiningCredential,
      credentialSequence?.trackerAdmissionMiningCredential,
      credentialSequence?.trackerConfirmationMiningCredential,
    );
    managedPhase = 'node startup and mining';
    await nodeSession.startMining();
    managedPhase = 'managed setup execution';
    managed = await nodeSession.withMiningActiveExecutionTarget(
      async target => await executeManagedSetupAction(
        lifecycleInput,
        setupSession!,
        packetSession!,
        profilePins,
        target,
        journalRoots,
        pegInPlan,
        pegInAction,
        frontierMintProofConsumer,
        frontierApplicationRunner,
        sourceAcceptanceBuildWorkspace,
      ),
    );
    assertCapabilityFreePlainData(managed, 'isolated devnet managed result');
    deepFreeze(managed);
    assertManagedCampaignBindings(built.receipt, managed);
    if (isCheckpointMiningAction(pegInAction)) {
      const application = managed.value.applicationCheckpoint;
      const pegIn = managed.value.pegIn;
      const trackerStage = managed.value.trackerCandidate;
      if (
        application === undefined
        || pegIn === undefined
        || (
          (
            pegInAction === 'check-observed-anchor-tracker'
            || isFrozenTrackerCheckAction(pegInAction)
          )
          && trackerStage === undefined
        )
      ) {
        throw new Error(
          'isolated checkpoint-anchor campaign lacks application material',
        );
      }
      const extensionValueHex =
        encodeSubstrateFederatedCheckpointExtensionValueV1(
          application.applicationCheckpoint.checkpoint.checkpointAttestation
            .checkpointStatement.encodedStatementHex,
        );
      const priorProcessSnapshot = managed.receipt.finalSnapshot;
      const checkpointMiningPolicy = (
        pegInAction === 'check-observed-anchor-tracker'
        || isFrozenTrackerCheckAction(pegInAction)
      )
        ? Object.freeze({
          minimumTipHeight: OBSERVED_TRACKER_V2_CONTEXT_MINIMUM_TIP_HEIGHT,
        })
        : Object.freeze({});
      managedPhase = 'checkpoint anchor';
      const anchored = await nodeSession.withCheckpointExtensionMiningTarget(
        extensionValueHex,
        checkpointMiningPolicy,
        async target =>
          await observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
            target,
            targetGenesisHeaderIdHex:
              pegIn.fundingObservation.genesisHeaderIdHex,
            expectedPriorHeaderIdHex:
              priorProcessSnapshot.headerIdHex,
            expectedPriorHeight:
              priorProcessSnapshot.fullHeight,
            expectedExtensionValueHex: extensionValueHex,
          }),
      );
      assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
        anchored.value,
      );
      checkpointAnchor = deepFreeze({
        mining: anchored.receipt,
        observation: anchored.value,
      });
      assertCapabilityFreePlainData(
        checkpointAnchor,
        'isolated devnet checkpoint anchor result',
      );
      if (pegInAction === 'check-observed-anchor-tracker') {
        managedPhase = 'observed tracker check';
        const stage = trackerStage!;
        const checked =
          await nodeSession.withCheckpointBoundMiningActiveExecutionTarget(
            async target => {
              const observation =
                await observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1({
                  target,
                  targetGenesisHeaderIdHex:
                    pegIn.fundingObservation.genesisHeaderIdHex,
                  expectedAnchorHeaderIdHex:
                    anchored.value.anchorHeaderIdHex,
                  expectedAnchorHeight: anchored.value.anchorHeight,
                  expectedAnchorExtensionRootHex:
                    anchored.value.anchorExtensionRootHex,
                  expectedExtensionValueHex: extensionValueHex,
                });
              assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
                observation,
              );
              const wasmModule = await import('ergo-lib-wasm-nodejs');
              const wasm = wasmModule.default ?? wasmModule;
              const observedHeaders =
                buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
                  rawHeaders: observation.headers.map(header => header.raw),
                  anchorContextIndex: observation.anchorContextIndex,
                  expectedAnchorHeaderIdHex: observation.anchorHeaderIdHex,
                  expectedAnchorExtensionRootHex:
                    observation.anchorExtensionRootHex,
                });
              const context =
                await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context({
                  compilerRequest: stage.compilerBinding.request,
                  compilerReceipt: stage.compilerBinding.receipt,
                  trackerInputBox: stage.trackerInputBox,
                  encodedStatementHex:
                    application.applicationCheckpoint.checkpoint
                      .checkpointAttestation.checkpointStatement.encodedStatementHex,
                  observedHeaderContext: observedHeaders,
                  extensionMembershipProofHex:
                    observation.extensionMembershipProofHex,
                });
              assertSubstrateFederatedTrackerV1Context(context);
              const check = await setupSession!.checkTrackerCandidate({
                context,
                observedHeaderContext: observedHeaders,
                trackerInputBox: stage.trackerInputBox,
              }, target);
              assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1(
                check,
              );
              return deepFreeze({ observation, context, check });
            },
          );
        observedAnchorTracker = deepFreeze({
          execution: checked.receipt,
          ...checked.value,
        });
        assertCapabilityFreePlainData(
          observedAnchorTracker,
          'isolated devnet observed-anchor tracker result',
        );
      } else if (isFrozenTrackerCheckAction(pegInAction)) {
        managedPhase = 'frozen tracker check';
        const stage = trackerStage!;
        const checked =
          await nodeSession.withCheckpointBoundMiningStoppedExecutionTarget(
            async target => {
              const observation =
                await observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2({
                  target,
                  targetGenesisHeaderIdHex:
                    pegIn.fundingObservation.genesisHeaderIdHex,
                  expectedAnchorHeaderIdHex:
                    anchored.value.anchorHeaderIdHex,
                  expectedAnchorHeight: anchored.value.anchorHeight,
                  expectedAnchorExtensionRootHex:
                    anchored.value.anchorExtensionRootHex,
                  expectedExtensionValueHex: extensionValueHex,
                });
              assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
                observation,
              );
              const wasmModule = await import('ergo-lib-wasm-nodejs');
              const wasm = wasmModule.default ?? wasmModule;
              const observedHeaders =
                buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
                  rawHeaders: observation.headers.map(header => header.raw),
                  anchorContextIndex: observation.anchorContextIndex,
                  expectedAnchorHeaderIdHex: observation.anchorHeaderIdHex,
                  expectedAnchorExtensionRootHex:
                    observation.anchorExtensionRootHex,
                });
              const context =
                await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context({
                  compilerRequest: stage.compilerBinding.request,
                  compilerReceipt: stage.compilerBinding.receipt,
                  trackerInputBox: stage.trackerInputBox,
                  encodedStatementHex:
                    application.applicationCheckpoint.checkpoint
                      .checkpointAttestation.checkpointStatement.encodedStatementHex,
                  observedHeaderContext: observedHeaders,
                  extensionMembershipProofHex:
                    observation.extensionMembershipProofHex,
                });
              assertSubstrateFederatedTrackerV1Context(context);
              const check = await setupSession!.checkFrozenTrackerCandidate({
                context,
                observedHeaderContext: observedHeaders,
                trackerInputBox: stage.trackerInputBox,
              }, target);
              assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
                check,
              );
              return deepFreeze({ observation, context, check });
            },
          );
        frozenObservedAnchorTracker = deepFreeze({
          execution: checked.receipt,
          ...checked.value,
        });
        assertCapabilityFreePlainData(
          frozenObservedAnchorTracker,
          'isolated devnet frozen observed-anchor tracker result',
        );
        if (
          pegInAction === 'revalidate-tracker-reservation-freshness'
          || pegInAction === 'submit-tracker-once'
        ) {
          managedPhase = 'tracker reservation and transport';
          trackerReservationFreshness =
            await runTrackerReservationFreshnessCampaignV8({
              buildReceipt: built.receipt,
              managed,
              checkpointAnchor: checkpointAnchor!,
              frozenObservedAnchorTracker,
              nodeSession,
              setupSession,
              trackerStage: stage,
              pegIn,
              application,
              extensionValueHex,
              ...(trackerTransportCampaign === undefined
                ? {}
                : { trackerTransportCampaign }),
            });
        }
      }
    }
  } catch (error) {
    failure = trackerTransportCampaign === undefined
      || projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
        error,
      ) !== null
      ? error
      : createTrackerTransportManagedCampaignPhaseFailureV9(
        managedPhase,
        error,
      );
  }

  const teardownErrors: unknown[] = [];
  disposeSession(packetSession, 'packet session', teardownErrors);
  disposeSession(setupSession, 'setup-check session', teardownErrors);
  let taskOwnedChainDestructionEstablished = nodeSession === undefined;
  if (nodeSession !== undefined) {
    try {
      await nodeSession.stop();
      taskOwnedChainDestructionEstablished = true;
    } catch (error) {
      teardownErrors.push(new Error('Ergo node teardown failed', {
        cause: error,
      }));
    }
  }
  if (taskOwnedChainDestructionEstablished) {
    for (const journalRoot of journalRoots) {
      try {
        rmSync(journalRoot, { recursive: true, force: false });
        journalRoots.delete(journalRoot);
      } catch (error) {
        teardownErrors.push(new Error('local genesis journal teardown failed', {
          cause: error,
        }));
      }
    }
  }
  if (failure !== undefined) {
    if (teardownErrors.length > 0) {
      const aggregate = new AggregateError(
        [failure, ...teardownErrors],
        'isolated genesis setup execution failed and teardown was incomplete',
      );
      throw trackerTransportCampaign === undefined
        || projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          failure,
        ) !== null
        ? aggregate
        : createTrackerTransportManagedCampaignPhaseFailureV9(
          managedPhase,
          aggregate,
        );
    }
    throw failure;
  }
  if (teardownErrors.length > 0) {
    const aggregate = new AggregateError(
      teardownErrors,
      'isolated genesis setup execution teardown was incomplete',
    );
    throw trackerTransportCampaign === undefined
      ? aggregate
      : createTrackerTransportManagedCampaignPhaseFailureV9(
        'campaign teardown',
        aggregate,
      );
  }
  if (managed === undefined) {
    throw new Error('isolated genesis setup execution produced no result');
  }
  return Object.freeze({
    buildReceipt: built.receipt,
    managed,
    ...(checkpointAnchor === undefined ? {} : { checkpointAnchor }),
    ...(observedAnchorTracker === undefined
      ? {}
      : { observedAnchorTracker }),
    ...(frozenObservedAnchorTracker === undefined
      ? {}
      : { frozenObservedAnchorTracker }),
    ...(trackerReservationFreshness === undefined
      ? {}
      : { trackerReservationFreshness }),
  });
}

async function runTrackerReservationFreshnessCampaignV8(
  input: Readonly<{
    readonly buildReceipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
    readonly managed: ManagedCampaignExecutionV1['managed'];
    readonly checkpointAnchor: NonNullable<
      ManagedCampaignExecutionV1['checkpointAnchor']
    >;
    readonly frozenObservedAnchorTracker: NonNullable<
      ManagedCampaignExecutionV1['frozenObservedAnchorTracker']
    >;
    readonly nodeSession:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1>;
    readonly setupSession:
      Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>;
    readonly trackerStage:
      Readonly<ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4>;
    readonly pegIn:
      SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'];
    readonly application: Readonly<
      SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
    >;
    readonly extensionValueHex: string;
    readonly trackerTransportCampaign?: Readonly<{
      readonly requestBinding:
        Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>;
      readonly journalRoot: string;
    }>;
  }>,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8
>> {
  const frozenTrackerRoot =
    finalizeFrozenObservedAnchorTrackerCheckCampaignRootV7({
      buildReceipt: input.buildReceipt,
      managed: input.managed,
      checkpointAnchor: input.checkpointAnchor,
      frozenObservedAnchorTracker: input.frozenObservedAnchorTracker,
    });
  const authorization =
    authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
      frozenTrackerRoot,
    );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
    authorization,
  );

  const persistentReservationRoot =
    input.trackerTransportCampaign !== undefined;
  const reservationRoot = input.trackerTransportCampaign?.journalRoot ?? mkdtempSync(
    join(tmpdir(), 'e2s-fed6lab-tracker-reservation-'),
  );
  let firstStore:
    ReturnType<typeof createIsolatedDevnetStateTracker> | undefined;
  let reopenedStore:
    ReturnType<typeof createIsolatedDevnetStateTracker> | undefined;
  let firstStoreClosed = false;
  let result:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8>
    | undefined;
  let retainedFreshnessCheck:
    Readonly<SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt>
    | undefined;
  let failure: unknown;

  try {
    if (persistentReservationRoot) {
      assertReservedTrackerTransportJournalRootV9(reservationRoot);
    }
    firstStore = createIsolatedDevnetStateTracker(reservationRoot);
    const durableReservation =
      persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
        firstStore,
        authorization,
      );
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
      durableReservation,
    );
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
      durableReservation,
      firstStore,
    );
    firstStore.close();
    firstStoreClosed = true;

    reopenedStore = createIsolatedDevnetStateTracker(reservationRoot);
    const beforeFreshness =
      reopenedStore
        .reloadSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          authorization.reservationIdentityHex,
        );
    assertReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance(
      beforeFreshness,
      reopenedStore,
    );
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
      durableReservation,
      reopenedStore,
    );
    assertReloadedTrackerReservationV8(
      beforeFreshness,
      durableReservation,
      authorization,
    );

    const checked =
      await input.nodeSession
        .withCheckpointBoundReservationFreshnessRevalidationTarget(
          async target => {
            const observation =
              await observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1({
                target,
                targetGenesisHeaderIdHex:
                  input.pegIn.fundingObservation.genesisHeaderIdHex,
                expectedAnchorHeaderIdHex:
                  input.checkpointAnchor.observation.anchorHeaderIdHex,
                expectedAnchorHeight:
                  input.checkpointAnchor.observation.anchorHeight,
                expectedAnchorExtensionRootHex:
                  input.checkpointAnchor.observation.anchorExtensionRootHex,
                expectedExtensionValueHex: input.extensionValueHex,
              });
            assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
              observation,
            );
            const wasmModule = await import('ergo-lib-wasm-nodejs');
            const wasm = wasmModule.default ?? wasmModule;
            const observedHeaders =
              buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
                rawHeaders: observation.headers.map(header => header.raw),
                anchorContextIndex: observation.anchorContextIndex,
                expectedAnchorHeaderIdHex: observation.anchorHeaderIdHex,
                expectedAnchorExtensionRootHex:
                  observation.anchorExtensionRootHex,
              });
            const context =
              await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context({
                compilerRequest: input.trackerStage.compilerBinding.request,
                compilerReceipt: input.trackerStage.compilerBinding.receipt,
                trackerInputBox: input.trackerStage.trackerInputBox,
                encodedStatementHex:
                  input.application.applicationCheckpoint.checkpoint
                    .checkpointAttestation.checkpointStatement
                    .encodedStatementHex,
                observedHeaderContext: observedHeaders,
                extensionMembershipProofHex:
                  observation.extensionMembershipProofHex,
              });
            assertSubstrateFederatedTrackerV1Context(context);
            const check =
              await input.setupSession
                .recheckTrackerReservationFreshnessCandidate({
                  context,
                  observedHeaderContext: observedHeaders,
                  trackerInputBox: input.trackerStage.trackerInputBox,
                }, target);
            assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
              check,
            );
            return deepFreeze({ observation, context, check });
          },
        );
    retainedFreshnessCheck = checked.value.check;
    const afterFreshness =
      reopenedStore
        .reloadSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          authorization.reservationIdentityHex,
        );
    assertReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance(
      afterFreshness,
      reopenedStore,
    );
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
      durableReservation,
      reopenedStore,
    );
    assertReloadedTrackerReservationV8(
      afterFreshness,
      durableReservation,
      authorization,
    );
    if (
      sha256CanonicalJson(beforeFreshness.reservation)
        !== sha256CanonicalJson(afterFreshness.reservation)
    ) {
      throw new Error(
        'isolated devnet tracker reservation changed during freshness revalidation',
      );
    }
    assertTrackerReservationFreshnessBindingsV8({
      frozenTrackerRoot,
      authorization,
      durableReservation,
      execution: checked.receipt,
      observation: checked.value.observation,
      context: checked.value.context,
      check: checked.value.check,
    });
    let transport:
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessMaterialV8['transport'];
    if (persistentReservationRoot) {
      const completion =
        claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
          checked.value.check,
        );
      const transported = await input.nodeSession
        .withCheckpointBoundTrackerTransportTarget(
          completion,
          async target => {
            const executionCheck =
              promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
                checked.value.check,
                target,
              );
            retainedFreshnessCheck = undefined;
            const transportAuthorization =
              authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1({
                executionCheck,
                target,
                durableReservation,
              });
            const journal =
              createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1({
                state: reopenedStore!,
                durableReservation,
              });
            const attempt = journal.reserve(transportAuthorization);
            const relayerLineage = MANAGED_CAMPAIGN_RELAYER_LINEAGES_V9.get(
              input.managed.value,
            );
            if (
              relayerLineage === undefined
              || input.trackerTransportCampaign === undefined
            ) {
              throw new Error(
                'isolated tracker transport campaign lacks reviewed request and relayer lineage',
              );
            }
            const preflight =
              createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1({
                requestBinding:
                  input.trackerTransportCampaign.requestBinding,
                relayerLineage,
                target,
                executionCheck,
                authorization: transportAuthorization,
                journal,
                attempt,
              });
            const submission =
              await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
                target,
                executionCheck,
                authorization: transportAuthorization,
                journal,
                attempt,
                preflight,
              });
            const outcome = journal.finalize(attempt, submission);
            return deepFreeze({
              authorization: transportAuthorization,
              attempt: {
                expectedTransactionIdHex: attempt.expectedTransactionIdHex,
                durableAttemptDigestHex: attempt.durableAttemptDigestHex,
              },
              outcome,
            });
          },
        );
      const confirmationDeadline = performance.now()
        + ACTION_COMPLETION_BUDGET_MS;
      let confirmed: Readonly<{
        readonly value:
          Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>;
        readonly receipt: Readonly<
          SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV1Receipt
        >;
      }>;
      try {
        confirmed = await input.nodeSession
          .withTrackerTransportConfirmationMiningTarget(
            transported.value.attempt.expectedTransactionIdHex,
            async target => {
              const observer =
                createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
                  target,
                  input.pegIn.fundingObservation.genesisHeaderIdHex,
                );
              return await waitForCanonicalConfirmation(
                observer,
                transported.value.attempt.expectedTransactionIdHex,
                confirmationDeadline,
                'tracker-admission',
              );
            },
          );
        if (
          confirmed.value.status !== 'confirmed'
          || confirmed.value.confirmationHeight === null
          || confirmed.value.confirmationHeaderIdHex === null
          || confirmed.value.confirmations < 1
        ) {
          throw new Error(
            'isolated tracker transport did not reach canonical confirmation',
          );
        }
      } catch (error) {
        throw trackerTransportCanonicalConfirmationFailureV9(
          transported.value.authorization,
          transported.value.attempt,
          transported.value.outcome,
          error,
        );
      }
      const canonicalConfirmation =
        projectTrackerTransportCanonicalConfirmationV9(
          confirmed.value,
          transported.value.attempt.expectedTransactionIdHex,
        );
      transport = deepFreeze({
        execution: transported.receipt,
        authorization: transported.value.authorization,
        attempt: transported.value.attempt,
        outcome: transported.value.outcome,
        confirmationExecution: confirmed.receipt,
        confirmation: canonicalConfirmation,
      });
      assertCapabilityFreePlainData(
        transport,
        'isolated devnet tracker transport result',
      );
    }
    result = deepFreeze({
      frozenTrackerRoot,
      authorization,
      durableReservation,
      reloadedReservation: afterFreshness.reservation,
      execution: checked.receipt,
      observation: checked.value.observation,
      check: checked.value.check,
      ...(transport === undefined ? {} : { transport }),
    });
    assertCapabilityFreePlainData(
      result,
      'isolated devnet tracker reservation freshness result',
    );
  } catch (error) {
    failure = error;
  }

  const cleanupErrors: unknown[] = [];
  if (retainedFreshnessCheck !== undefined) {
    discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
      retainedFreshnessCheck,
    );
    retainedFreshnessCheck = undefined;
  }
  if (firstStore !== undefined && !firstStoreClosed) {
    try {
      firstStore.close();
      firstStoreClosed = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (reopenedStore !== undefined) {
    try {
      reopenedStore.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (!persistentReservationRoot) {
    try {
      rmSync(reservationRoot, { recursive: true, force: false });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (failure !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        'tracker reservation freshness failed and local reservation cleanup was incomplete',
      );
    }
    throw failure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'tracker reservation freshness local reservation cleanup was incomplete',
    );
  }
  if (result === undefined || firstStoreClosed !== true) {
    throw new Error(
      'isolated devnet tracker reservation freshness produced no restart-safe result',
    );
  }
  return result;
}

function assertReloadedTrackerReservationV8(
  reload: Readonly<ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result>,
  durable: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
  >,
  authorization: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
  >,
): void {
  const reservation = reload.reservation;
  if (
    reservation.reservationIdentityHex !== durable.reservationIdentityHex
    || reservation.durableReservationDigestHex
      !== durable.durableReservationDigestHex
    || reservation.operationProfileDigestHex
      !== durable.operationProfileDigestHex
    || reservation.authorizationDigestHex !== durable.authorizationDigestHex
    || reservation.rootReceiptDigestHex !== durable.rootReceiptDigestHex
    || reservation.reservationIdentityHex
      !== authorization.reservationIdentityHex
    || reservation.sourceProfileDigestHex
      !== durable.bindings.sourceProfileDigestHex
    || reservation.trackerSetupDigestHex
      !== durable.bindings.trackerSetupDigestHex
    || reservation.checkpointAnchorDigestHex
      !== durable.bindings.checkpointAnchorDigestHex
    || reservation.frozenTargetDigestHex
      !== durable.bindings.frozenTargetDigestHex
    || reservation.trackerCandidateDigestHex
      !== durable.bindings.trackerCandidateDigestHex
    || reservation.jvmCheckDigestHex !== durable.bindings.jvmCheckDigestHex
    || reservation.statementIdHex !== durable.bindings.statementIdHex
    || reservation.trackerInputBoxIdHex
      !== durable.bindings.trackerInputBoxIdHex
    || reservation.unsignedTransactionIdHex
      !== durable.bindings.unsignedTransactionIdHex
    || reservation.anchorHeaderIdHex !== durable.bindings.anchorHeaderIdHex
    || reservation.targetIdentityDigestHex
      !== durable.bindings.targetIdentityDigestHex
  ) {
    throw new Error(
      'isolated devnet reloaded tracker reservation binding changed',
    );
  }
}

function assertTrackerReservationFreshnessBindingsV8(
  input: Readonly<{
    readonly frozenTrackerRoot: Readonly<
      SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
    >;
    readonly authorization: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
    >;
    readonly durableReservation: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
    >;
    readonly execution: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt
    >;
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1
    >;
    readonly context: Readonly<SubstrateFederatedTrackerV1Context>;
    readonly check: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt
    >;
  }>,
): void {
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
    input.frozenTrackerRoot,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
    input.authorization,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    input.durableReservation,
  );
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
    input.observation,
  );
  assertSubstrateFederatedTrackerV1Context(input.context);
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
    input.check,
  );

  const root = input.frozenTrackerRoot;
  const frozenExecution = root.tracker.execution;
  const frozenObservation = root.tracker.observation;
  const frozenCheck = root.tracker.check;
  const frozenCandidate = root.tracker.candidate;
  const execution = input.execution;
  const observation = input.observation;
  const context = input.context;
  const check = input.check;
  const expectedCheckpointExtensionObservationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
      root.checkpointAnchor.observation,
    );
  const contextTip = context.trackerTransition.headers[0];
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  if (
    contextTip === undefined
    || anchor === undefined
    || execution.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA
    || execution.version !== 1
    || execution.sameProcessesAsTrackerCheck !== true
    || execution.primaryReadOnlyDuringAction !== true
    || execution.witnessReadOnlyDuringAction !== true
    || execution.miningStoppedBeforeAction !== true
    || execution.exactFrozenSnapshotStableAcrossAction !== true
    || execution.buildIdentityDigestHex
      !== frozenExecution.buildIdentityDigestHex
    || execution.executableIdentityDigestHex
      !== frozenExecution.executableIdentityDigestHex
    || execution.trackerCheckProcessBindingDigestHex
      !== frozenExecution.processBindingDigestHex
    || execution.trackerCheckExecutionTargetIdentityDigestHex
      !== frozenExecution.executionTargetIdentityDigestHex
    || execution.trackerCheckExecutionTargetIdentityDigestHex
      !== input.durableReservation.bindings.targetIdentityDigestHex
    || execution.trackerCheckSnapshot.headerIdHex
      !== frozenExecution.actionEndSnapshot.headerIdHex
    || execution.trackerCheckSnapshot.network
      !== frozenExecution.actionEndSnapshot.network
    || execution.trackerCheckSnapshot.fullHeight
      !== frozenExecution.actionEndSnapshot.fullHeight
    || execution.trackerCheckSnapshot.indexedHeight
      !== frozenExecution.actionEndSnapshot.indexedHeight
    || execution.actionStartSnapshot.network
      !== execution.trackerCheckSnapshot.network
    || execution.actionStartSnapshot.fullHeight
      !== execution.trackerCheckSnapshot.fullHeight
    || execution.actionStartSnapshot.indexedHeight
      !== execution.trackerCheckSnapshot.indexedHeight
    || execution.actionStartSnapshot.headerIdHex
      !== execution.trackerCheckSnapshot.headerIdHex
    || execution.actionEndSnapshot.network
      !== execution.trackerCheckSnapshot.network
    || execution.actionEndSnapshot.fullHeight
      !== execution.trackerCheckSnapshot.fullHeight
    || execution.actionEndSnapshot.indexedHeight
      !== execution.trackerCheckSnapshot.indexedHeight
    || execution.actionEndSnapshot.headerIdHex
      !== execution.trackerCheckSnapshot.headerIdHex
    || execution.actionStartSnapshot.headerIdHex
      !== execution.actionEndSnapshot.headerIdHex
    || execution.actionStartSnapshot.fullHeight
      !== execution.actionEndSnapshot.fullHeight
    || execution.actionStartSnapshot.indexedHeight
      !== execution.actionEndSnapshot.indexedHeight
    || execution.checkpointExtensionObservationDigestHex
      !== expectedCheckpointExtensionObservationDigestHex
    || execution.extensionKeyHex !== '0401'
    || execution.extensionValueHex !== frozenObservation.extensionValueHex
    || execution.checkpointSnapshot.headerIdHex
      !== root.checkpointAnchor.observation.anchorHeaderIdHex
    || execution.checkpointSnapshot.fullHeight
      !== root.checkpointAnchor.observation.anchorHeight
    || observation.processBindingDigestHex !== execution.processBindingDigestHex
    || observation.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || observation.targetGenesisHeaderIdHex
      !== frozenObservation.targetGenesisHeaderIdHex
    || observation.extensionKeyHex !== '0401'
    || observation.extensionValueHex !== frozenObservation.extensionValueHex
    || observation.anchorHeaderIdHex !== frozenObservation.anchorHeaderIdHex
    || observation.anchorHeight !== frozenObservation.anchorHeight
    || observation.anchorExtensionRootHex
      !== frozenObservation.anchorExtensionRootHex
    || observation.boundaries.primaryAndWitnessAgreed !== true
    || observation.boundaries.miningStoppedDuringObservation !== true
    || observation.boundaries.checkpointBoundReservationFreshnessTarget
      !== true
    || observation.boundaries.exactCheckpointRetainedInCurrentContext !== true
    || observation.boundaries.exactExtensionMembershipRecomputed !== true
    || observation.boundaries.durableReservationBound !== false
    || observation.boundaries.trackerInputRevalidated !== false
    || observation.boundaries.jvmTransactionRechecked !== false
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || context.statement.statementIdHex !== frozenCandidate.statementIdHex
    || context.unsignedTransactionIdHex
      !== frozenCandidate.unsignedTransactionIdHex
    || anchor.id !== frozenCandidate.anchorHeaderIdHex
    || anchor.height !== frozenCandidate.anchorHeaderHeight
    || anchor.extensionRootHex !== frozenCandidate.anchorExtensionRootHex
    || check.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA
    || check.version !== 1
    || check.trackerInputBoxIdHex !== frozenCheck.trackerInputBoxIdHex
    || check.statementIdHex !== frozenCheck.statementIdHex
    || check.anchorHeaderIdHex !== frozenCheck.anchorHeaderIdHex
    || check.anchorHeight !== frozenCheck.anchorHeight
    || check.anchorContextIndex !== frozenCheck.anchorContextIndex
    || check.unsignedTransactionIdHex
      !== input.durableReservation.bindings.unsignedTransactionIdHex
    || check.unsignedTransactionIdHex !== frozenCheck.unsignedTransactionIdHex
    || check.unsignedTransactionDigestHex
      !== frozenCheck.unsignedTransactionDigestHex
    || check.signedTransactionIdHex !== frozenCheck.signedTransactionIdHex
    || check.signedTransactionCanonicalJsonSha256Hex
      !== frozenCheck.signedTransactionCanonicalJsonSha256Hex
    || check.signedTransactionBytesSha256Hex
      !== frozenCheck.signedTransactionBytesSha256Hex
    || check.signedTransactionBytesLength
      !== frozenCheck.signedTransactionBytesLength
    || check.checkResponseSha256Hex !== frozenCheck.checkResponseSha256Hex
    || check.target.processBindingDigestHex !== execution.processBindingDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || check.signer.publicKeyHex !== frozenCheck.signer.publicKeyHex
    || check.signer.p2pkErgoTreeHex !== frozenCheck.signer.p2pkErgoTreeHex
    || check.signer.stateContextTipHeight !== contextTip.height
    || check.signer.stateContextTipIdHex !== contextTip.id
    || check.boundaries.reservationFreshnessRevalidationTarget !== true
    || check.boundaries.observedAnchorContextBound !== true
    || check.boundaries.exactTrackerInputAndTransactionBound !== true
    || check.boundaries.localWasmRootSigningPerformed !== true
    || check.boundaries.localJvmNodeCheckPassed !== true
    || check.boundaries.durableReservationBound !== false
    || check.boundaries.signedTransactionBytesPersisted !== false
    || check.boundaries.submissionAuthorityEstablished !== false
    || check.boundaries.broadcastAuthorityEstablished !== false
    || check.boundaries.trackerAdmissionEstablished !== false
    || check.boundaries.replayProtectionEstablished !== false
    || check.boundaries.payoutEstablished !== false
    || check.boundaries.fundsAuthorityEstablished !== false
    || check.boundaries.gate5Closed !== false
    || check.boundaries.trustlessStatusEstablished !== false
    || check.boundaries.productionReadinessEstablished !== false
  ) {
    throw new Error(
      'isolated devnet tracker reservation freshness binding changed or gained authority',
    );
  }
}

interface ExecutionActionResult {
  readonly lifecycle:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['lifecycle'];
  readonly transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'];
  readonly pegIn?:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'];
  readonly mintProof?:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignMaterialV1>;
  readonly applicationCheckpoint?: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
  >;
  readonly trackerCandidate?: Readonly<
    ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4
  >;
}

const MANAGED_CAMPAIGN_RELAYER_LINEAGES_V9 = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1>
>();

const MANAGED_PEG_IN_SOURCE_LOCK_MATERIAL = new WeakMap<
  object,
  Readonly<{
    postCheckFundingObservation:
      Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
    postCheckOwnedFundingObservation:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
  }>
>();

async function executeManagedSetupAction(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  packetSession:
    SubstrateFederatedIsolatedDevnetPacketSessionV1OrV2OrV3,
  profilePins:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  journalRoots: Set<string>,
  pegInPlan: Readonly<PegInCandidatePlanV1> | undefined,
  pegInAction: PegInActionV1,
  frontierMintProofConsumer:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2>
    | undefined,
  frontierApplicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>
    | undefined,
  sourceAcceptanceBuildWorkspace:
    Readonly<{
      readonly temporaryDirectoryRoot: string;
      readonly sharedCargoHomeRoot: string;
    }> | undefined,
): Promise<Readonly<ExecutionActionResult>> {
  const applicationCheckpointAction =
    isApplicationCheckpointAction(pegInAction);
  if (
    (pegInAction === 'consume-mint-proof')
      !== (frontierMintProofConsumer !== undefined)
    || applicationCheckpointAction !== (frontierApplicationRunner !== undefined)
  ) {
    throw new Error(
      'isolated devnet Frontier consumer must match the managed action',
    );
  }
  const completionDeadline = performance.now() + ACTION_COMPLETION_BUDGET_MS;
  const sourceHistory =
    await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(
      input.sourceHistory,
      sourceAcceptanceBuildWorkspace,
    );
  const rewardInputs = await discoverSubstrateFederatedRewardInputsV2(
    setupSession.signer,
  );
  const ergoHistory =
    await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(
      rewardInputs,
    );
  const packet = await packetSession.produce({
    sourceHistory,
    ergoHistory,
    expectedProfilePins: profilePins,
    relayerArtifacts: input.relayerArtifacts,
  });
  const setupExecutionInput = {
    portableReplayInput: packet.portableReplayInput,
    primaryNodeOrigin: target.primaryNodeOrigin,
    witnessNodeOrigin: target.witnessNodeOrigin,
  };
  const batch = pegInAction !== 'candidate'
    ? await setupSession.runForExecutionRetainingPegInSigner(
      setupExecutionInput,
      target,
    )
    : await setupSession.runForExecution(setupExecutionInput, target);
  assertCanonicalBatch(batch);

  const targetBinding = batch.targetBinding;
  const observer =
    createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
      target,
      batch.request.target.genesisHeaderIdHex,
    );
  const revalidator =
    createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(target, batch);
  const authorizer =
    createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
      target,
      batch,
      revalidator,
      observer,
    );
  const transport =
    createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
      target,
      authorizer,
    );

  const localStateRoot = mkdtempSync(join(tmpdir(), 'e2s-fed6lab-'));
  journalRoots.add(localStateRoot);
  const markerDirectory = join(localStateRoot, 'attempt-markers');
  mkdirSync(markerDirectory);
  const state = createIsolatedDevnetStateTracker(localStateRoot);
  let actionResult: Readonly<ExecutionActionResult> | undefined;
  let actionFailure: unknown;
  try {
    const journal = createSubstrateFederatedLocalDevnetGenesisJournalV1({
      state,
      markerDirectory,
      reconciliationIdentityDigestHex:
        targetBinding.executionTargetIdentityDigestHex,
    });
    const transactions: SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'][number][] = [];
    for (let ordinal = 0; ordinal < batch.orderedTransactions.length; ordinal += 1) {
      const transaction = batch.orderedTransactions[ordinal]!;
      const role = coreRole(transaction.issuance.role);
      if (role !== ROLE_ORDER[ordinal]) {
        throw new Error('isolated genesis execution role order changed');
      }
      const execution = await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(batch, transaction, role),
        executionPorts(
          batch,
          transaction,
          role,
          revalidator,
          authorizer,
          journal,
          transport,
          observer,
          completionDeadline,
        ),
      );
      assertTransportExecution(execution, role, transaction);
      const confirmation = await waitForCanonicalConfirmation(
        observer,
        transaction.issuance.unsignedTransactionIdHex,
        completionDeadline,
        `setup:${role}`,
      );
      const reconciliation = await journal.reconcileActive(observer);
      if (
        execution.confirmationStatus === 'confirmed'
          ? reconciliation !== 'none'
          : reconciliation !== 'confirmed'
      ) {
        throw new Error('isolated genesis durable reconciliation changed');
      }
      authorizer.acknowledgeCanonicalConfirmation(role, confirmation);
      transactions.push(Object.freeze({
        ordinal: ordinal as 0 | 1 | 2,
        role,
        expectedTxId: execution.expectedTxId,
        transportStatus: execution.status,
        durableAttemptDigestHex: execution.durableAttemptDigestHex,
        journalDigestHex: execution.journalDigestHex,
        confirmationDigestHex: confirmation.observationDigestHex,
        confirmationHeight: confirmation.confirmationHeight!,
        confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex!,
      }));
    }
    assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1(
      authorizer,
      target,
    );
    if (await journal.revalidateConfirmed(observer) !== ROLE_ORDER.length) {
      throw new Error('isolated genesis confirmed attempt count changed');
    }
    let finalTransactions = await refreshCanonicalReceiptConfirmations(
      transactions,
      observer,
      completionDeadline,
    );
    let pegIn:
      SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']
      | undefined;
    let mintProof:
      Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignMaterialV1>
      | undefined;
    let applicationCheckpoint: Readonly<
      SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
    > | undefined;
    let trackerCandidate: Readonly<
      ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4
    > | undefined;
    if (pegInPlan !== undefined) {
      pegIn = await buildManagedPegInCandidate(
        pegInPlan,
        setupSession,
        batch,
        target,
        Math.max(...finalTransactions.map(value => value.confirmationHeight)),
        pegInAction,
      );
      if (pegInAction === 'check-source-lock') {
        discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
          pegIn.sourceLockCheck!,
        );
      } else if (
        pegInAction === 'execute-source-lock'
        || pegInAction === 'execute-committed-vault'
        || pegInAction === 'consume-mint-proof'
        || pegInAction === 'consume-application-checkpoint'
        || pegInAction === 'construct-tracker-candidate'
        || pegInAction === 'mine-checkpoint-anchor'
        || pegInAction === 'check-observed-anchor-tracker'
        || isFrozenTrackerCheckAction(pegInAction)
      ) {
        pegIn = await executeManagedPegInSourceLock(
          pegIn,
          batch,
          target,
          setupSession,
          state,
          observer,
          completionDeadline,
        );
        if (
          pegInAction === 'execute-committed-vault'
          || pegInAction === 'consume-mint-proof'
          || pegInAction === 'consume-application-checkpoint'
          || pegInAction === 'construct-tracker-candidate'
          || pegInAction === 'mine-checkpoint-anchor'
          || pegInAction === 'check-observed-anchor-tracker'
          || isFrozenTrackerCheckAction(pegInAction)
        ) {
          pegIn = await executeManagedPegInCommittedVault(
            pegIn,
            batch,
            target,
            setupSession,
            state,
            observer,
            completionDeadline,
            pegInAction === 'check-observed-anchor-tracker'
              || isFrozenTrackerCheckAction(pegInAction),
          );
        }
        if (pegInAction === 'consume-mint-proof') {
          if (
            frontierMintProofConsumer === undefined
            || !('produceMintSourceProof' in packetSession)
          ) {
            throw new Error(
              'isolated devnet mint-proof campaign requires its V2 continuation and consumer',
            );
          }
          assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
          mintProof = await consumeManagedPegInMintProof(
            packetSession,
            packet,
            pegIn,
            batch,
            target,
            frontierMintProofConsumer,
            completionDeadline,
          );
        } else if (applicationCheckpointAction) {
          if (
            frontierApplicationRunner === undefined
            || !('executeApplication' in packetSession)
            || !('attestCheckpoint' in packetSession)
          ) {
            throw new Error(
              'isolated devnet application-checkpoint campaign requires its V3 continuation and runner',
            );
          }
          assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
          applicationCheckpoint =
            await consumeManagedPegInApplicationCheckpoint(
              packetSession,
              packet,
              pegIn,
              batch,
              target,
              frontierApplicationRunner,
              observer,
              completionDeadline,
            );
          if (
            pegInAction === 'construct-tracker-candidate'
            || pegInAction === 'check-observed-anchor-tracker'
            || isFrozenTrackerCheckAction(pegInAction)
          ) {
            trackerCandidate = await constructManagedTrackerCandidateV4(
              applicationCheckpoint,
              batch,
              finalTransactions,
              observer,
              completionDeadline,
            );
          }
        }
      }
      assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1(
        authorizer,
        target,
      );
      if (await journal.revalidateConfirmed(observer) !== ROLE_ORDER.length) {
        throw new Error(
          'isolated genesis setup changed after peg-in candidate construction',
        );
      }
      finalTransactions = await refreshCanonicalReceiptConfirmations(
        finalTransactions,
        observer,
        completionDeadline,
      );
    }
    assertManagedActionDeadline(completionDeadline, 'completion');
    actionResult = deepFreeze({
      lifecycle: {
        federationProfileIdHex: profilePins.federationProfileIdHex,
        sourceAttestationKeySetDigestHex:
          profilePins.sourceAttestationKeySetDigestHex,
        ergoAdmissionKeySetDigestHex:
          profilePins.ergoAdmissionKeySetDigestHex,
        packetReceiptDigestHex: packet.receipt.receiptDigestHex,
        setupCheckReceiptDigestHex: batch.receipt.receiptDigestHex,
        setupRequestDigestHex: batch.request.requestDigestHex,
        executionTargetIdentityDigestHex:
          targetBinding.executionTargetIdentityDigestHex,
      },
      transactions: finalTransactions,
      ...(pegIn === undefined ? {} : { pegIn }),
      ...(mintProof === undefined ? {} : { mintProof }),
      ...(applicationCheckpoint === undefined
        ? {}
        : { applicationCheckpoint }),
      ...(trackerCandidate === undefined ? {} : { trackerCandidate }),
    });
    if (pegInAction === 'submit-tracker-once') {
      assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
      if (
        !/^[0-9a-f]{64}$/u.test(packet.receipt.relayerArtifactSetDigestHex)
        || !/^[0-9a-f]{64}$/u.test(packet.receipt.receiptDigestHex)
        || packet.receipt.checks.realRelayerArtifactProducerInvoked !== true
        || packet.receipt.checks.relayerArtifactFilesRehashedAfterPublication
          !== true
      ) {
        throw new Error(
          'isolated managed campaign lacks verified relayer source lineage',
        );
      }
      MANAGED_CAMPAIGN_RELAYER_LINEAGES_V9.set(
        actionResult,
        claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(packet),
      );
    }
  } catch (error) {
    actionFailure = error;
  }
  const cleanupErrors: unknown[] = [];
  try {
    state.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (actionFailure !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [actionFailure, ...cleanupErrors],
        'isolated genesis action failed and local journal cleanup was incomplete',
      );
    }
    throw actionFailure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'isolated genesis local journal cleanup was incomplete',
    );
  }
  if (actionResult === undefined) {
    throw new Error('isolated genesis managed action produced no result');
  }
  return actionResult;
}

async function buildManagedPegInCandidate(
  plan: Readonly<PegInCandidatePlanV1>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  minimumSetupConfirmationHeight: number,
  pegInAction: PegInActionV1,
): Promise<
  SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']
> {
  const ownedFundingObservation =
    await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
      setupSession.signer,
      target,
    );
  const fundingObservation = ownedFundingObservation.observation;
  assertCapabilityFreePlainData(
    fundingObservation,
    'isolated devnet peg-in funding observation',
  );
  deepFreeze(fundingObservation);
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(
    fundingObservation,
  );
  assertPegInFundingObservation(
    fundingObservation,
    setupSession,
    batch,
    target,
    minimumSetupConfirmationHeight,
  );
  const sourceFundingInput = fundingObservation.genesisInputs.tracker;
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    batch.familyCompilerBinding.profile,
  );
  const candidate =
    await buildSubstrateFederatedIsolatedDevnetPegInCandidateV1({
      batch,
      target,
      sourceFundingInput,
      sourceIntent: {
        formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
        sourceNetworkIdHex: profile.sourceNetworkIdHex,
        sidechainIdHex: profile.sidechainIdHex,
        bridgeAddressHex: profile.bridgeAddressHex,
        tokenAddressHex: profile.tokenAddressHex,
        settlementProfileIdHex: profile.settlementProfileIdHex,
        admissionProfileIdHex:
          batch.familyCompilerBinding.profile.familyIdHex,
        sourceAssetIdHex: profile.settlementAssetIdHex,
        amountNanoErg: plan.amountNanoErg,
        recipientAddressHex: plan.recipientAddressHex,
      },
      depositorErgoTreeHex: setupSession.signer.p2pkErgoTreeHex,
      creationHeights: {
        currentErgoHeight: fundingObservation.target.tipHeight,
        sourceLockCreation: fundingObservation.target.tipHeight,
        reserveTransition: fundingObservation.target.tipHeight,
      },
    });
  assertCapabilityFreePlainData(candidate, 'isolated devnet peg-in candidate');
  deepFreeze(candidate);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    candidate,
    batch,
    target,
  );
  const sourceFundingBoxDigestHex = sha256CanonicalJson(
    sourceFundingInput,
    PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
  );
  if (
    packet.boxes.sourceFundingInput.boxId !== sourceFundingInput.boxId
    || sha256CanonicalJson(
      packet.boxes.sourceFundingInput,
      PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
    ) !== sourceFundingBoxDigestHex
  ) {
    throw new Error('isolated devnet peg-in funding identity changed');
  }
  const postCandidateOwnedFundingObservation =
    await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
      setupSession.signer,
      target,
    );
  const postCandidateFundingObservation =
    postCandidateOwnedFundingObservation.observation;
  assertCapabilityFreePlainData(
    postCandidateFundingObservation,
    'isolated devnet post-candidate funding observation',
  );
  deepFreeze(postCandidateFundingObservation);
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(
    postCandidateFundingObservation,
  );
  assertPegInFundingObservation(
    postCandidateFundingObservation,
    setupSession,
    batch,
    target,
    fundingObservation.target.tipHeight,
  );
  const postCandidateSourceFundingInput =
    postCandidateFundingObservation.genesisInputs.tracker;
  if (
    postCandidateSourceFundingInput.boxId !== sourceFundingInput.boxId
    || sha256CanonicalJson(
      postCandidateSourceFundingInput,
      PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
    ) !== sourceFundingBoxDigestHex
  ) {
    throw new Error(
      'isolated devnet peg-in funding changed after candidate construction',
    );
  }
  let sourceLockCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt>
    | undefined;
  let postCheckFundingObservation:
    Readonly<SubstrateFederatedRewardInputDiscoveryV2> | undefined;
  let postCheckOwnedFundingObservation:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>
    | undefined;
  if (pegInAction !== 'candidate') {
    const sourceLockCheckInput = {
      sourceFundingBoxIdHex: sourceFundingInput.boxId,
      unsignedTransaction: packet.transactions.sourceLockCreation,
    };
    sourceLockCheck = (
      pegInAction === 'execute-committed-vault'
      || pegInAction === 'consume-mint-proof'
      || pegInAction === 'consume-application-checkpoint'
      || pegInAction === 'construct-tracker-candidate'
      || pegInAction === 'mine-checkpoint-anchor'
      || pegInAction === 'check-observed-anchor-tracker'
      || isFrozenTrackerCheckAction(pegInAction)
    )
      ? await setupSession.checkPegInSourceLockRetainingSigner(
        sourceLockCheckInput,
        target,
      )
      : await setupSession.checkPegInSourceLock(sourceLockCheckInput, target);
    assertCapabilityFreePlainData(
      sourceLockCheck,
      'isolated devnet peg-in source-lock check receipt',
    );
    deepFreeze(sourceLockCheck);
    if (
      sourceLockCheck.status !== 'PASS'
      || sourceLockCheck.sourceFundingBoxIdHex !== sourceFundingInput.boxId
      || sourceLockCheck.unsignedTransactionIdHex
        !== packet.transactions.sourceLockCreation.txId
      || sourceLockCheck.signedTransactionIdHex
        !== packet.transactions.sourceLockCreation.txId
      || sourceLockCheck.target.processBindingDigestHex
        !== candidate.target.processBindingDigestHex
      || sourceLockCheck.target.executionTargetIdentityDigestHex
        !== candidate.target.executionTargetIdentityDigestHex
      || sourceLockCheck.signer.publicKeyHex
        !== setupSession.signer.publicKeyHex
      || sourceLockCheck.signer.p2pkErgoTreeHex
        !== setupSession.signer.p2pkErgoTreeHex
      || sourceLockCheck.checker.nodeOrigin !== target.primaryNodeOrigin
      || sourceLockCheck.boundaries.localWasmRootSigningPerformed !== true
      || sourceLockCheck.boundaries.localJvmNodeCheckPassed !== true
      || sourceLockCheck.boundaries.submissionAuthorityEstablished !== false
      || sourceLockCheck.boundaries.broadcastAuthorityEstablished !== false
    ) {
      throw new Error('isolated devnet peg-in source-lock check binding changed');
    }
    postCheckOwnedFundingObservation =
      await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        setupSession.signer,
        target,
      );
    postCheckFundingObservation = postCheckOwnedFundingObservation.observation;
    assertCapabilityFreePlainData(
      postCheckFundingObservation,
      'isolated devnet post-check funding observation',
    );
    deepFreeze(postCheckFundingObservation);
    assertSubstrateFederatedRewardInputDiscoveryV2Provenance(
      postCheckFundingObservation,
    );
    assertPegInFundingObservation(
      postCheckFundingObservation,
      setupSession,
      batch,
      target,
      postCandidateFundingObservation.target.tipHeight,
    );
    const postCheckSourceFundingInput =
      postCheckFundingObservation.genesisInputs.tracker;
    if (
      postCheckSourceFundingInput.boxId !== sourceFundingInput.boxId
      || sha256CanonicalJson(
        postCheckSourceFundingInput,
        PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
      ) !== sourceFundingBoxDigestHex
    ) {
      throw new Error(
        'isolated devnet peg-in funding changed after source-lock check',
      );
    }
  }
  const result = deepFreeze({
    fundingObservation: {
      reportDigestHex: fundingObservation.reportDigestHex,
      observedAt: fundingObservation.observedAt,
      primaryNodeOrigin: fundingObservation.sources.primaryNodeOrigin,
      witnessNodeOrigin: fundingObservation.sources.witnessNodeOrigin,
      genesisHeaderIdHex: fundingObservation.target.genesisHeaderIdHex,
      tipHeight: fundingObservation.target.tipHeight,
      tipHeaderIdHex: fundingObservation.target.tipHeaderIdHex,
      sourceFundingBoxIdHex: sourceFundingInput.boxId,
      sourceFundingBoxDigestHex,
      postCandidateReportDigestHex:
        postCandidateFundingObservation.reportDigestHex,
      postCandidateTipHeight: postCandidateFundingObservation.target.tipHeight,
      postCandidateTipHeaderIdHex:
        postCandidateFundingObservation.target.tipHeaderIdHex,
      ...(postCheckFundingObservation === undefined
        ? {}
        : {
          postCheckReportDigestHex:
            postCheckFundingObservation.reportDigestHex,
          postCheckTipHeight: postCheckFundingObservation.target.tipHeight,
          postCheckTipHeaderIdHex:
            postCheckFundingObservation.target.tipHeaderIdHex,
        }),
    },
    candidate,
    ...(sourceLockCheck === undefined ? {} : { sourceLockCheck }),
  });
  if (
    postCheckFundingObservation !== undefined
    && postCheckOwnedFundingObservation !== undefined
  ) {
    MANAGED_PEG_IN_SOURCE_LOCK_MATERIAL.set(result, Object.freeze({
      postCheckFundingObservation,
      postCheckOwnedFundingObservation,
    }));
  }
  return result;
}

async function executeManagedPegInSourceLock(
  pegIn:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  state: ReturnType<typeof createIsolatedDevnetStateTracker>,
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  completionDeadline: number,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']>> {
  const material = MANAGED_PEG_IN_SOURCE_LOCK_MATERIAL.get(pegIn);
  const sourceLockCheck = pegIn.sourceLockCheck;
  if (material === undefined || sourceLockCheck === undefined) {
    throw new Error('isolated source-lock execution material is unavailable');
  }
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    pegIn.candidate,
    batch,
    target,
  );
  const sourceFundingBox = packet.boxes.sourceFundingInput;
  const preTransportOwnedFundingObservation =
    await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
      setupSession.signer,
      target,
    );
  const preTransport = preTransportOwnedFundingObservation.observation;
  assertCapabilityFreePlainData(
    preTransport,
    'isolated devnet pre-transport funding observation',
  );
  deepFreeze(preTransport);
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(preTransport);
  assertPegInFundingObservation(
    preTransport,
    setupSession,
    batch,
    target,
    material.postCheckFundingObservation.target.tipHeight,
  );
  if (
    preTransport.genesisInputs.tracker.boxId !== sourceFundingBox.boxId
    || sha256CanonicalJson(
      preTransport.genesisInputs.tracker,
      PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
    ) !== pegIn.fundingObservation.sourceFundingBoxDigestHex
  ) {
    throw new Error(
      'isolated devnet peg-in funding changed before source-lock authorization',
    );
  }
  const executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1> =
    promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
      sourceLockCheck,
      target,
    );
  const sourceLockAuthorizer =
    createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1({
      target,
      batch,
      candidate: pegIn.candidate,
      executionCheck,
      postCheck: material.postCheckOwnedFundingObservation,
      preTransport: preTransportOwnedFundingObservation,
    });
  const sourceLockJournal =
    createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1({
      state,
      authorizer: sourceLockAuthorizer,
      reconciliationIdentityDigestHex:
        batch.targetBinding.executionTargetIdentityDigestHex,
      targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
    });
  if (await sourceLockJournal.reconcileActive(observer) !== 'none') {
    throw new Error('unexpected prior source-lock attempt was reconciled');
  }
  const sourceLockTransport =
    createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1(
      target,
      sourceLockAuthorizer,
    );
  const sourceLockCreation = packet.transactions.sourceLockCreation;
  const sourceLockCreationHeight =
    sourceLockCreation.eip12Tx.outputs[0]?.creationHeight;
  if (
    !Number.isSafeInteger(sourceLockCreationHeight)
    || Number(sourceLockCreationHeight) < 0
  ) {
    throw new Error('isolated source-lock creation height is invalid');
  }
  const execution = await runErgoOperationalTransaction({
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    expectedTxId: sourceLockCreation.txId,
    sourceBoxId: sourceFundingBox.boxId,
    inputBoxIds: [sourceFundingBox.boxId],
    attemptedAtHeight: Number(sourceLockCreationHeight),
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    unsignedTransaction: sourceLockCreation.eip12Tx,
  }, {
    sign: async admission => {
      assertSourceLockOperationalAdmission(
        admission,
        executionCheck,
        sourceLockCreation.eip12Tx,
        sourceFundingBox.boxId,
      );
      return Object.freeze({
        nodeOrigin: target.primaryNodeOrigin,
        signedTransactionDigestHex:
          executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex,
        signerArtifact: executionCheck.signedCandidate,
      });
    },
    check: async signed => {
      if (
        signed.signerArtifact !== executionCheck.signedCandidate
        || signed.signedTransactionDigestHex
          !== executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex
      ) {
        throw new Error('isolated source-lock checked signer binding changed');
      }
      return Object.freeze({
        checkResponseDigestHex:
          executionCheck.checkedAcceptance.submissionHandle
            .checkResponseDigestHex,
        checkerArtifact:
          executionCheck.checkedAcceptance.submissionHandle,
      });
    },
    revalidate: async () => Object.freeze({
      revalidationDigestHex: sourceLockAuthorizer.revalidationDigestHex,
    }),
    authorize: revalidated => sourceLockAuthorizer.authorize(revalidated),
    reserve: authorization => sourceLockJournal.journal.reserve(authorization),
    finalize: input => sourceLockJournal.journal.finalize(input),
    submit: attempt => {
      assertFullConfirmationWindowAvailable(
        completionDeadline,
        'source-lock',
      );
      return sourceLockTransport.submit(attempt);
    },
  });
  assertSourceLockTransportExecution(execution, sourceLockCreation.txId);
  const confirmation = await waitForCanonicalConfirmation(
    observer,
    sourceLockCreation.txId,
    completionDeadline,
    'source-lock',
  );
  if (await sourceLockJournal.reconcileActive(observer) !== 'confirmed') {
    throw new Error('source-lock durable reconciliation did not confirm');
  }
  if (await sourceLockJournal.revalidateConfirmed(observer) !== 1) {
    throw new Error('source-lock confirmed attempt count changed');
  }
  const outputObservation =
    await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
      target,
      batch,
      candidate: pegIn.candidate,
      confirmation,
    });
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
    outputObservation,
    target,
  );
  assertCapabilityFreePlainData(
    outputObservation,
    'isolated source-lock output observation',
  );
  return deepFreeze({
    ...pegIn,
    fundingObservation: {
      ...pegIn.fundingObservation,
      preTransportReportDigestHex: preTransport.reportDigestHex,
      preTransportTipHeight: preTransport.target.tipHeight,
      preTransportTipHeaderIdHex: preTransport.target.tipHeaderIdHex,
    },
    sourceLockExecution: {
      expectedTxId: sourceLockCreation.txId,
      transportStatus: execution.status === 'accepted'
        ? 'accepted' as const
        : 'reconciled' as const,
      durableAttemptDigestHex: execution.durableAttemptDigestHex,
      journalDigestHex: execution.journalDigestHex,
      confirmationDigestHex: confirmation.observationDigestHex,
      confirmationHeight: confirmation.confirmationHeight!,
      confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex!,
      outputObservation,
    },
  });
}

async function executeManagedPegInCommittedVault(
  pegIn:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  state: ReturnType<typeof createIsolatedDevnetStateTracker>,
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  completionDeadline: number,
  retainSignerForTrackerCheck = false,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn']>> {
  const sourceLockExecution = pegIn.sourceLockExecution;
  if (sourceLockExecution === undefined) {
    throw new Error(
      'isolated committed-vault execution requires confirmed source lock',
    );
  }
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
    sourceLockExecution.outputObservation,
    target,
  );
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    pegIn.candidate,
    batch,
    target,
  );
  const reserveTransition = packet.transactions.reserveTransition;
  const committedVaultCheckInput = {
    reservePredecessorBoxIdHex: packet.boxes.reservePredecessor.boxId,
    sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
    transitionFeeFundingBoxIdHex:
      packet.boxes.transitionFeeFunding.boxId,
    unsignedTransaction: reserveTransition,
  };
  const committedVaultCheck = retainSignerForTrackerCheck
    ? await setupSession.checkPegInCommittedVaultRetainingSigner(
      committedVaultCheckInput,
      target,
    )
    : await setupSession.checkPegInCommittedVault(
      committedVaultCheckInput,
      target,
    );
  assertCapabilityFreePlainData(
    committedVaultCheck,
    'isolated devnet committed-vault check receipt',
  );
  deepFreeze(committedVaultCheck);
  if (
    committedVaultCheck.status !== 'PASS'
    || committedVaultCheck.unsignedTransactionIdHex !== reserveTransition.txId
    || committedVaultCheck.signedTransactionIdHex !== reserveTransition.txId
    || committedVaultCheck.reservePredecessorBoxIdHex
      !== packet.boxes.reservePredecessor.boxId
    || committedVaultCheck.sourceLockBoxIdHex !== packet.boxes.sourceLock.boxId
    || committedVaultCheck.transitionFeeFundingBoxIdHex
      !== packet.boxes.transitionFeeFunding.boxId
    || committedVaultCheck.target.processBindingDigestHex
      !== batch.targetBinding.processBindingDigestHex
    || committedVaultCheck.target.executionTargetIdentityDigestHex
      !== batch.targetBinding.executionTargetIdentityDigestHex
    || committedVaultCheck.signer.publicKeyHex !== setupSession.signer.publicKeyHex
    || committedVaultCheck.signer.p2pkErgoTreeHex
      !== setupSession.signer.p2pkErgoTreeHex
    || committedVaultCheck.checker.nodeOrigin !== target.primaryNodeOrigin
    || committedVaultCheck.boundaries.exactThreeInputTransitionBound !== true
    || committedVaultCheck.boundaries.localJvmNodeCheckPassed !== true
    || committedVaultCheck.boundaries.submissionAuthorityEstablished !== false
    || committedVaultCheck.boundaries.broadcastAuthorityEstablished !== false
    || committedVaultCheck.boundaries.mintAuthorized !== false
  ) {
    throw new Error('isolated committed-vault check binding changed');
  }
  const executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1> =
    promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(
      committedVaultCheck,
      target,
    );
  const authorizationSession =
    createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1({
      target,
      batch,
      candidate: pegIn.candidate,
      executionCheck,
      sourceLockObservation: sourceLockExecution.outputObservation,
    });
  const committedVaultJournal =
    createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1({
      state,
      authorizer: authorizationSession.broadcastAuthorizer,
      executionTargetIdentityDigestHex:
        batch.targetBinding.executionTargetIdentityDigestHex,
      targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
    });
  if (await committedVaultJournal.reconcileActive(observer) !== 'none') {
    throw new Error('unexpected prior committed-vault attempt was reconciled');
  }
  const committedVaultTransport =
    createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1(
      target,
      authorizationSession.broadcastAuthorizer,
    );
  const execution = await runErgoOperationalTransaction({
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: reserveTransition.txId,
    sourceBoxId: packet.boxes.reservePredecessor.boxId,
    inputBoxIds: [
      packet.boxes.reservePredecessor.boxId,
      packet.boxes.sourceLock.boxId,
      packet.boxes.transitionFeeFunding.boxId,
    ],
    attemptedAtHeight: committedVaultCheck.signer.stateContextTipHeight,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    unsignedTransaction: reserveTransition.eip12Tx,
  }, {
    sign: async admission => {
      assertCommittedVaultOperationalAdmission(
        admission,
        executionCheck,
        reserveTransition.eip12Tx,
        committedVaultCheck.signer.stateContextTipHeight,
        [
          packet.boxes.reservePredecessor.boxId,
          packet.boxes.sourceLock.boxId,
          packet.boxes.transitionFeeFunding.boxId,
        ],
      );
      return Object.freeze({
        nodeOrigin: target.primaryNodeOrigin,
        signedTransactionDigestHex:
          executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex,
        signerArtifact: executionCheck.signedCandidate,
      });
    },
    check: async signed => {
      if (
        signed.signerArtifact !== executionCheck.signedCandidate
        || signed.signedTransactionDigestHex
          !== executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex
      ) {
        throw new Error(
          'isolated committed-vault checked signer binding changed',
        );
      }
      return Object.freeze({
        checkResponseDigestHex:
          executionCheck.checkedAcceptance.submissionHandle
            .checkResponseDigestHex,
        checkerArtifact:
          executionCheck.checkedAcceptance.submissionHandle,
      });
    },
    revalidate: checked =>
      authorizationSession.revalidator.revalidate(checked),
    authorize: revalidated =>
      authorizationSession.broadcastAuthorizer.authorize(revalidated),
    reserve: authorization =>
      committedVaultJournal.journal.reserve(authorization),
    finalize: input => committedVaultJournal.journal.finalize(input),
    submit: attempt => {
      assertFullConfirmationWindowAvailable(
        completionDeadline,
        'committed-vault',
      );
      return committedVaultTransport.submit(attempt);
    },
  });
  assertCommittedVaultTransportExecution(execution, reserveTransition.txId);
  const preTransportObservation =
    authorizationSession.takePreTransportObservation();
  assertCapabilityFreePlainData(
    preTransportObservation,
    'isolated committed-vault pre-transport observation',
  );
  await waitForCanonicalConfirmation(
    observer,
    reserveTransition.txId,
    completionDeadline,
    'committed-vault',
  );
  if (await committedVaultJournal.reconcileActive(observer) !== 'confirmed') {
    throw new Error('committed-vault durable reconciliation did not confirm');
  }
  const latestConfirmations =
    await committedVaultJournal.revalidateConfirmed(observer);
  if (latestConfirmations.length !== 1) {
    throw new Error('committed-vault confirmed attempt count changed');
  }
  const latestConfirmation = latestConfirmations[0]!;
  const outputObservation =
    await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
      target,
      batch,
      candidate: pegIn.candidate,
      confirmation: latestConfirmation,
    });
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
    outputObservation,
    target,
  );
  assertCapabilityFreePlainData(
    outputObservation,
    'isolated committed-vault output observation',
  );
  return deepFreeze({
    ...pegIn,
    committedVaultCheck,
    committedVaultExecution: {
      expectedTxId: reserveTransition.txId,
      transportStatus: execution.status === 'accepted'
        ? 'accepted' as const
        : 'reconciled' as const,
      durableAttemptDigestHex: execution.durableAttemptDigestHex,
      journalDigestHex: execution.journalDigestHex,
      confirmationDigestHex:
        outputObservation.confirmationObservationDigestHex,
      confirmationHeight: outputObservation.confirmationHeight,
      confirmationHeaderIdHex: outputObservation.confirmationHeaderIdHex,
      preTransportObservation,
      outputObservation,
    },
  });
}

async function consumeManagedPegInMintProof(
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketContinuationSessionV2>,
  packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
  pegIn:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'],
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  frontierMintProofConsumer:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2>,
  completionDeadline: number,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignMaterialV1>> {
  const { draft, evidenceReceipt, mintSourceProofInput } =
    buildManagedPegInMintSourceProofInput(pegIn, batch, target);
  const packetProof = packetSession.produceMintSourceProof(
    packet,
    mintSourceProofInput,
  );
  assertManagedActionDeadline(
    completionDeadline,
    'Frontier mint-proof consumer',
  );
  const consumerReceipt =
    await runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
      {
        ...frontierMintProofConsumer,
        proofReceipt: packetProof,
      },
      completionDeadline,
    );
  assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance(
    consumerReceipt,
  );
  if (
    packetProof.packetReceiptDigestHex !== packet.receipt.receiptDigestHex
    || packetProof.targetDescriptorDigestHex
      !== packet.receipt.targetDescriptorDigestHex
    || packetProof.sourceProofReceiptDigestHex
      !== packetProof.sourceProof.receiptDigestHex
    || packetProof.sourceProof.sourceEvidenceReceiptDigestHex
      !== evidenceReceipt.receiptDigestHex
    || packetProof.sourceProof.mintReservationDraftDigestHex
      !== draft.draftDigestHex
    || packetProof.sourceProof.mintReservationStatementIdHex
      !== draft.statementIdHex
    || packetProof.sourceProof.mintIdentityHex !== draft.reservationKeyHex
    || consumerReceipt.packetProof !== packetProof
    || consumerReceipt.packetProofReceiptDigestHex
      !== packetProof.receiptDigestHex
    || consumerReceipt.sourceProofReceiptDigestHex
      !== packetProof.sourceProof.receiptDigestHex
    || consumerReceipt.sourceEvidenceReceiptDigestHex
      !== evidenceReceipt.receiptDigestHex
    || consumerReceipt.targetDescriptorDigestHex
      !== packet.receipt.targetDescriptorDigestHex
    || consumerReceipt.statementIdHex !== draft.statementIdHex
    || consumerReceipt.mintIdentityHex !== draft.reservationKeyHex
  ) {
    throw new Error(
      'isolated devnet mint-proof producer-to-consumer binding changed',
    );
  }
  const material = {
    draft,
    evidenceReceipt,
    packetProof,
    consumerReceipt,
  };
  assertCapabilityFreePlainData(
    material,
    'isolated devnet peg-in mint-proof campaign material',
  );
  return deepFreeze(material);
}

async function consumeManagedPegInApplicationCheckpoint(
  continuation: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3
  >,
  packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
  pegIn:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'],
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  applicationRunner:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>,
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  completionDeadline: number,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
>> {
  const { draft, evidenceReceipt, mintSourceProofInput } =
    buildManagedPegInMintSourceProofInput(pegIn, batch, target);
  const committedVaultExecution = pegIn.committedVaultExecution;
  if (committedVaultExecution === undefined) {
    throw new Error(
      'isolated devnet application-checkpoint campaign requires a confirmed committed reserve',
    );
  }
  assertManagedActionDeadline(
    completionDeadline,
    'Frontier application-checkpoint campaign',
  );
  const application = await continuation.executeApplication(packet, {
    mintSourceProofInput,
    applicationRunnerInput: applicationRunner,
  }, completionDeadline);
  const freshConfirmation = await waitForCanonicalConfirmation(
    observer,
    committedVaultExecution.expectedTxId,
    completionDeadline,
    'application-checkpoint-admission',
  );
  if (
    freshConfirmation.confirmationHeight
      !== committedVaultExecution.confirmationHeight
    || freshConfirmation.confirmationHeaderIdHex
      !== committedVaultExecution.confirmationHeaderIdHex
    || freshConfirmation.observedAtHeight
      < freshConfirmation.confirmationHeight
  ) {
    throw new Error(
      'isolated devnet committed reserve changed before checkpoint attestation',
    );
  }
  const checkpointAdmissionObservation = Object.freeze({
    expectedTxId: committedVaultExecution.expectedTxId,
    observedAtHeight: freshConfirmation.observedAtHeight,
    observationDigestHex: freshConfirmation.observationDigestHex,
    confirmationHeight: freshConfirmation.confirmationHeight,
    confirmationHeaderIdHex: freshConfirmation.confirmationHeaderIdHex,
  });
  assertCapabilityFreePlainData(
    checkpointAdmissionObservation,
    'isolated devnet checkpoint admission observation',
  );
  const validFromErgoHeight = freshConfirmation.observedAtHeight.toString();
  const expiresAtErgoHeight = (
    BigInt(validFromErgoHeight) + BigInt(MAX_ADMISSION_VALIDITY_BLOCKS)
  ).toString();
  const applicationCheckpoint = continuation.attestCheckpoint(
    application,
    {
      validFromErgoHeight,
      expiresAtErgoHeight,
    },
  );
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    applicationCheckpoint,
  );
  if (
    applicationCheckpoint.packet.receipt !== packet.receipt
    || applicationCheckpoint.mintSourceProof.packetReceiptDigestHex
      !== packet.receipt.receiptDigestHex
    || applicationCheckpoint.mintSourceProof.sourceProof
      .sourceEvidenceReceiptDigestHex !== evidenceReceipt.receiptDigestHex
    || applicationCheckpoint.mintSourceProof.sourceProof
      .mintReservationDraftDigestHex !== draft.draftDigestHex
    || applicationCheckpoint.mintSourceProof.sourceProof
      .mintReservationStatementIdHex !== draft.statementIdHex
    || applicationCheckpoint.mintSourceProof.sourceProof.mintIdentityHex
      !== draft.reservationKeyHex
  ) {
    throw new Error(
      'isolated devnet application-checkpoint producer-to-consumer binding changed',
    );
  }
  const material = {
    draft,
    evidenceReceipt,
    applicationCheckpoint,
    checkpointAdmissionObservation,
  };
  assertCapabilityFreePlainData(
    material,
    'isolated devnet peg-in application-checkpoint campaign material',
  );
  return deepFreeze(material);
}

async function constructManagedTrackerCandidateV4(
  application: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignMaterialV3
  >,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'],
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  completionDeadline: number,
): Promise<Readonly<
  ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4
>> {
  const checkpoint = application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    checkpoint,
  );
  const statement = checkpoint.checkpoint.checkpointAttestation.checkpointStatement;
  const validFromErgoHeight = Number(statement.admissionValidFromErgoHeight);
  if (
    !Number.isSafeInteger(validFromErgoHeight)
    || validFromErgoHeight < 0
    || validFromErgoHeight.toString()
      !== statement.admissionValidFromErgoHeight
  ) {
    throw new Error(
      'isolated devnet tracker candidate validity height is not a safe canonical integer',
    );
  }
  const trackerIssuances = batch.orderedTransactions.filter(transaction =>
    transaction.issuance.ordinal === 0
    && transaction.issuance.role === 'tracker'
  );
  const trackerConfirmations = transactions.filter(transaction =>
    transaction.ordinal === 0
    && transaction.role === 'tracker'
  );
  if (trackerIssuances.length !== 1 || trackerConfirmations.length !== 1) {
    throw new Error(
      'isolated devnet tracker candidate requires one exact tracker setup lineage',
    );
  }
  const trackerTransaction = trackerIssuances[0]!;
  const retainedConfirmation = trackerConfirmations[0]!;
  const issuance = trackerTransaction.issuance;
  if (
    retainedConfirmation.expectedTxId !== issuance.unsignedTransactionIdHex
    || issuance.predictedStateOutput.transactionIdHex
      !== issuance.unsignedTransactionIdHex
    || issuance.predictedStateOutput.index !== 0
  ) {
    throw new Error(
      'isolated devnet tracker setup transaction lineage changed before candidate construction',
    );
  }
  const freshConfirmation = await waitForStableCanonicalConfirmationAfterHeight(
    observer,
    retainedConfirmation,
    validFromErgoHeight,
    completionDeadline,
    'tracker-candidate-input',
  );
  const materialized = await materializeUnsignedTransaction(
    issuance.unsignedTransactionBody as unknown as Eip12UnsignedTransaction,
    'isolated devnet tracker setup transaction',
  );
  const trackerInputBox = materialized.outputs[issuance.predictedStateOutput.index];
  if (
    materialized.txId !== issuance.unsignedTransactionIdHex
    || trackerInputBox === undefined
    || trackerInputBox.boxId !== issuance.predictedStateOutput.boxIdHex
    || trackerInputBox.transactionId
      !== issuance.predictedStateOutput.transactionIdHex
    || trackerInputBox.index !== issuance.predictedStateOutput.index
    || trackerInputBox.creationHeight
      !== issuance.predictedStateOutput.creationHeight
  ) {
    throw new Error(
      'isolated devnet tracker setup output changed during exact rematerialization',
    );
  }
  const context = await buildCompilerBoundSubstrateFederatedTrackerV1Context({
    compilerRequest: batch.trackerCompilerBinding.request,
    compilerReceipt: batch.trackerCompilerBinding.receipt,
    trackerInputBox,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: freshConfirmation.observedAtHeight,
    anchorContextIndex: 0,
  });
  const stage = {
    application,
    trackerSetup: {
      expectedTxId: retainedConfirmation.expectedTxId,
      outputBoxIdHex: issuance.predictedStateOutput.boxIdHex,
      outputIndex: 0 as const,
      outputCreationHeight: issuance.predictedStateOutput.creationHeight,
      confirmationDigestHex: freshConfirmation.observationDigestHex,
      confirmationHeight: freshConfirmation.confirmationHeight!,
      confirmationHeaderIdHex: freshConfirmation.confirmationHeaderIdHex!,
      observedAtHeight: freshConfirmation.observedAtHeight,
    },
    compilerBinding: batch.trackerCompilerBinding,
    trackerInputBox,
    context,
  };
  assertCapabilityFreePlainData(
    stage,
    'isolated devnet checkpoint-bound tracker candidate stage',
  );
  return deepFreeze(stage);
}

function projectManagedTrackerCandidateV4(
  stage: Readonly<ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4>,
): Readonly<SubstrateFederatedIsolatedDevnetTrackerCandidateMaterialV4> {
  const context = stage.context;
  const transaction = context.eip12UnsignedTransaction;
  const inputs = transaction.inputs;
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  if (
    context.schema !== SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA
    || context.version !== 1
    || context.trustModel !== 'federated_non_trustless'
    || !Array.isArray(inputs)
    || inputs.length !== 1
    || inputs[0] === null
    || typeof inputs[0] !== 'object'
    || Array.isArray(inputs[0])
    || (inputs[0] as Readonly<Record<string, unknown>>).boxId
      !== stage.trackerSetup.outputBoxIdHex
    || anchor === undefined
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE
    || context.boundaries.contractIdentityBound !== true
    || context.boundaries.statementAndProfileValidated !== true
    || context.boundaries.anchorMembershipConstructed !== true
    || context.boundaries.exactContextExtensionRoundTrip !== true
    || context.boundaries.avlTransitionConstructed !== true
    || context.boundaries.sourceSignaturesVerifiedOnChain !== false
    || context.boundaries.jvmReductionAccepted !== false
    || context.boundaries.nodeCheckPerformed !== false
    || context.boundaries.profileActivated !== false
    || context.boundaries.signingPerformed !== false
    || context.boundaries.submissionPerformed !== false
    || context.boundaries.broadcastPerformed !== false
    || context.boundaries.fundsAuthorityEstablished !== false
    || context.boundaries.gate5Closed !== false
    || context.boundaries.trustlessStatusEstablished !== false
    || context.contract.sourceSignaturesVerifiedOnChain !== false
    || context.contract.jvmReductionAccepted !== false
    || context.contract.profileActivated !== false
    || context.contract.signingPerformed !== false
    || context.contract.submissionPerformed !== false
    || context.contract.broadcastPerformed !== false
    || context.contract.fundsAuthorityEstablished !== false
    || context.contract.gate5Closed !== false
    || context.contract.trustlessStatusEstablished !== false
    || context.statement.sourceSignaturesVerifiedOnChain !== false
  ) {
    throw new Error(
      'isolated devnet tracker candidate context changed or gained authority',
    );
  }
  const material = {
    trackerSetup: stage.trackerSetup,
    candidate: {
      schema: context.schema,
      version: context.version,
      trustModel: context.trustModel,
      contractIdHex: context.contract.contractIdHex,
      trackerNftIdHex: context.trackerTransition.trackerNftIdHex,
      statementIdHex: context.statement.statementIdHex,
      inputBoxIdHex: stage.trackerSetup.outputBoxIdHex,
      trackerKeyHex: context.trackerTransition.trackerKeyHex,
      trackerValueHex: context.trackerTransition.trackerValueHex,
      inputDigestHex: context.trackerTransition.inputDigestHex,
      successorDigestHex: context.trackerTransition.successorDigestHex,
      currentErgoHeight: context.trackerTransition.currentErgoHeight,
      anchorContextIndex: context.trackerTransition.anchorContextIndex,
      syntheticAnchorHeaderIdHex: anchor.id,
      syntheticAnchorHeaderHeight: anchor.height,
      syntheticAnchorExtensionRootHex: anchor.extensionRootHex,
      contextExtensionSerializedHex: context.contextExtension.serializedHex,
      prooflessTransactionBytes: context.prooflessTransactionBytes,
      unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    },
  };
  assertCapabilityFreePlainData(
    material,
    'isolated devnet projected tracker candidate material',
  );
  return deepFreeze(material);
}

function projectManagedObservedAnchorTrackerV6(
  stage: Readonly<ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4>,
  execution: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt
  >,
  observation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1
  >,
  context: Readonly<SubstrateFederatedTrackerV1Context>,
  check: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt
  >,
): Readonly<SubstrateFederatedIsolatedDevnetObservedAnchorTrackerMaterialV6> {
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
    observation,
  );
  assertSubstrateFederatedTrackerV1Context(context);
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1(check);
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  const transaction = context.eip12UnsignedTransaction;
  const inputs = transaction.inputs;
  const input = Array.isArray(inputs) ? inputs[0] : undefined;
  if (
    anchor === undefined
    || !Array.isArray(inputs)
    || input === undefined
    || inputs.length !== 1
    || input.boxId !== stage.trackerSetup.outputBoxIdHex
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || context.boundaries.contractIdentityBound !== true
    || context.boundaries.statementAndProfileValidated !== true
    || context.boundaries.anchorMembershipConstructed !== true
    || context.boundaries.exactContextExtensionRoundTrip !== true
    || context.boundaries.avlTransitionConstructed !== true
    || context.boundaries.sourceSignaturesVerifiedOnChain !== false
    || context.boundaries.jvmReductionAccepted !== false
    || context.boundaries.nodeCheckPerformed !== false
    || context.boundaries.profileActivated !== false
    || context.boundaries.signingPerformed !== false
    || context.boundaries.submissionPerformed !== false
    || context.boundaries.broadcastPerformed !== false
    || context.boundaries.fundsAuthorityEstablished !== false
    || context.boundaries.gate5Closed !== false
    || context.boundaries.trustlessStatusEstablished !== false
    || check.trackerInputBoxIdHex !== stage.trackerSetup.outputBoxIdHex
    || check.statementIdHex !== context.statement.statementIdHex
    || check.anchorHeaderIdHex !== anchor.id
    || check.anchorHeight !== anchor.height
    || check.anchorContextIndex
      !== context.trackerTransition.anchorContextIndex
    || observation.anchorContextIndex
      !== context.trackerTransition.anchorContextIndex
    || observation.anchorHeaderIdHex !== anchor.id
    || observation.anchorHeight !== anchor.height
    || observation.anchorExtensionRootHex !== anchor.extensionRootHex
    || observation.processBindingDigestHex !== execution.processBindingDigestHex
    || observation.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || check.target.processBindingDigestHex !== execution.processBindingDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || check.unsignedTransactionIdHex !== context.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== context.unsignedTransactionIdHex
  ) {
    throw new Error(
      'isolated devnet observed-anchor tracker projection changed or gained authority',
    );
  }
  const material = {
    execution,
    observation,
    trackerSetup: stage.trackerSetup,
    candidate: {
      schema: context.schema,
      version: context.version,
      trustModel: context.trustModel,
      contractIdHex: context.contract.contractIdHex,
      trackerNftIdHex: context.trackerTransition.trackerNftIdHex,
      statementIdHex: context.statement.statementIdHex,
      inputBoxIdHex: stage.trackerSetup.outputBoxIdHex,
      trackerKeyHex: context.trackerTransition.trackerKeyHex,
      trackerValueHex: context.trackerTransition.trackerValueHex,
      inputDigestHex: context.trackerTransition.inputDigestHex,
      successorDigestHex: context.trackerTransition.successorDigestHex,
      currentErgoHeight: context.trackerTransition.currentErgoHeight,
      anchorContextIndex: context.trackerTransition.anchorContextIndex,
      anchorHeaderIdHex: anchor.id,
      anchorHeaderHeight: anchor.height,
      anchorExtensionRootHex: anchor.extensionRootHex,
      anchorContextProvenance:
        context.trackerTransition.anchorContextProvenance,
      contextExtensionSerializedHex: context.contextExtension.serializedHex,
      prooflessTransactionBytes: context.prooflessTransactionBytes,
      unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    },
    check,
  };
  assertCapabilityFreePlainData(
    material,
    'isolated devnet projected observed-anchor tracker material',
  );
  return deepFreeze(material);
}

function projectManagedFrozenObservedAnchorTrackerV7(
  stage: Readonly<ManagedSubstrateFederatedIsolatedDevnetTrackerCandidateStageV4>,
  execution: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt
  >,
  observation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
  >,
  context: Readonly<SubstrateFederatedTrackerV1Context>,
  check: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetFrozenObservedAnchorTrackerMaterialV7
> {
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
    observation,
  );
  assertSubstrateFederatedTrackerV1Context(context);
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(check);
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  const transaction = context.eip12UnsignedTransaction;
  const inputs = transaction.inputs;
  const input = Array.isArray(inputs) ? inputs[0] : undefined;
  if (
    anchor === undefined
    || !Array.isArray(inputs)
    || input === undefined
    || inputs.length !== 1
    || input.boxId !== stage.trackerSetup.outputBoxIdHex
    || context.trackerTransition.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || context.boundaries.contractIdentityBound !== true
    || context.boundaries.statementAndProfileValidated !== true
    || context.boundaries.anchorMembershipConstructed !== true
    || context.boundaries.exactContextExtensionRoundTrip !== true
    || context.boundaries.avlTransitionConstructed !== true
    || context.boundaries.sourceSignaturesVerifiedOnChain !== false
    || context.boundaries.jvmReductionAccepted !== false
    || context.boundaries.nodeCheckPerformed !== false
    || context.boundaries.profileActivated !== false
    || context.boundaries.signingPerformed !== false
    || context.boundaries.submissionPerformed !== false
    || context.boundaries.broadcastPerformed !== false
    || context.boundaries.fundsAuthorityEstablished !== false
    || context.boundaries.gate5Closed !== false
    || context.boundaries.trustlessStatusEstablished !== false
    || check.trackerInputBoxIdHex !== stage.trackerSetup.outputBoxIdHex
    || check.statementIdHex !== context.statement.statementIdHex
    || check.anchorHeaderIdHex !== anchor.id
    || check.anchorHeight !== anchor.height
    || check.anchorContextIndex
      !== context.trackerTransition.anchorContextIndex
    || observation.anchorContextIndex
      !== context.trackerTransition.anchorContextIndex
    || observation.anchorHeaderIdHex !== anchor.id
    || observation.anchorHeight !== anchor.height
    || observation.anchorExtensionRootHex !== anchor.extensionRootHex
    || observation.processBindingDigestHex !== execution.processBindingDigestHex
    || observation.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || check.target.processBindingDigestHex !== execution.processBindingDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== execution.executionTargetIdentityDigestHex
    || check.unsignedTransactionIdHex !== context.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== context.unsignedTransactionIdHex
    || check.boundaries.checkpointBoundFrozenTarget !== true
  ) {
    throw new Error(
      'isolated devnet frozen observed-anchor tracker projection changed or gained authority',
    );
  }
  const material = {
    execution,
    observation,
    trackerSetup: stage.trackerSetup,
    candidate: {
      schema: context.schema,
      version: context.version,
      trustModel: context.trustModel,
      contractIdHex: context.contract.contractIdHex,
      trackerNftIdHex: context.trackerTransition.trackerNftIdHex,
      statementIdHex: context.statement.statementIdHex,
      inputBoxIdHex: stage.trackerSetup.outputBoxIdHex,
      trackerKeyHex: context.trackerTransition.trackerKeyHex,
      trackerValueHex: context.trackerTransition.trackerValueHex,
      inputDigestHex: context.trackerTransition.inputDigestHex,
      successorDigestHex: context.trackerTransition.successorDigestHex,
      currentErgoHeight: context.trackerTransition.currentErgoHeight,
      anchorContextIndex: context.trackerTransition.anchorContextIndex,
      anchorHeaderIdHex: anchor.id,
      anchorHeaderHeight: anchor.height,
      anchorExtensionRootHex: anchor.extensionRootHex,
      anchorContextProvenance:
        context.trackerTransition.anchorContextProvenance,
      contextExtensionSerializedHex: context.contextExtension.serializedHex,
      prooflessTransactionBytes: context.prooflessTransactionBytes,
      unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    },
    check,
  };
  assertCapabilityFreePlainData(
    material,
    'isolated devnet projected frozen observed-anchor tracker material',
  );
  return deepFreeze(material);
}

function buildManagedPegInMintSourceProofInput(
  pegIn:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'],
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<{
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly evidenceReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>;
  readonly mintSourceProofInput:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input>;
}> {
  const committedVaultObservation =
    pegIn.committedVaultExecution?.outputObservation;
  if (committedVaultObservation === undefined) {
    throw new Error(
      'isolated devnet mint proof requires a confirmed committed reserve',
    );
  }
  const draft =
    buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch,
      target,
      candidate: pegIn.candidate,
      committedVaultObservation,
    });
  const evidenceReceipt =
    collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1({
      batch,
      target,
      candidate: pegIn.candidate,
      committedVaultObservation,
      draft,
    });
  const issuedAtNativeHeight =
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2;
  const expiresAtNativeHeight = (
    BigInt(issuedAtNativeHeight)
    + BigInt(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2)
  ).toString();
  return Object.freeze({
    draft,
    evidenceReceipt,
    mintSourceProofInput: Object.freeze({
      draft,
      evidenceReceipt,
      issuedAtNativeHeight,
      expiresAtNativeHeight,
    }),
  });
}

function assertSourceLockOperationalAdmission(
  admission: Parameters<
    Parameters<typeof runErgoOperationalTransaction>[1]['sign']
  >[0],
  executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1>,
  unsignedTransaction: unknown,
  sourceFundingBoxIdHex: string,
): void {
  if (
    admission.operationProfile
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE
    || admission.expectedTxId !== executionCheck.receipt.unsignedTransactionIdHex
    || admission.sourceBoxId !== sourceFundingBoxIdHex
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== sourceFundingBoxIdHex
    || admission.unsignedTransaction !== unsignedTransaction
  ) {
    throw new Error('isolated source-lock operational admission changed');
  }
}

function assertCommittedVaultOperationalAdmission(
  admission: Parameters<
    Parameters<typeof runErgoOperationalTransaction>[1]['sign']
  >[0],
  executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1>,
  unsignedTransaction: unknown,
  attemptedAtHeight: number,
  inputBoxIds: readonly [string, string, string],
): void {
  if (
    admission.operationProfile !== PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
    || admission.expectedTxId
      !== executionCheck.receipt.unsignedTransactionIdHex
    || admission.sourceBoxId !== inputBoxIds[0]
    || admission.inputBoxIds.length !== inputBoxIds.length
    || !admission.inputBoxIds.every(
      (boxId, index) => boxId === inputBoxIds[index],
    )
    || admission.attemptedAtHeight !== attemptedAtHeight
    || admission.targetSidechainHeight !== null
    || admission.targetSidechainBlockHashHex !== null
    || admission.heartbeatKeyHex !== null
    || admission.unsignedTransaction !== unsignedTransaction
  ) {
    throw new Error('isolated committed-vault operational admission changed');
  }
}

function assertSourceLockTransportExecution(
  execution: ErgoOperationalExecutionResult,
  expectedTxId: string,
): asserts execution is Extract<
  ErgoOperationalExecutionResult,
  Readonly<{ status: 'accepted' | 'ambiguous' }>
> {
  if (
    (execution.status !== 'accepted' && execution.status !== 'ambiguous')
    || execution.expectedTxId !== expectedTxId
    || execution.durableAttemptRecorded !== true
  ) {
    throw new Error('isolated source-lock transaction was not transported');
  }
}

function assertCommittedVaultTransportExecution(
  execution: ErgoOperationalExecutionResult,
  expectedTxId: string,
): asserts execution is Extract<
  ErgoOperationalExecutionResult,
  Readonly<{ status: 'accepted' | 'ambiguous' }>
> {
  if (
    (execution.status !== 'accepted' && execution.status !== 'ambiguous')
    || execution.expectedTxId !== expectedTxId
    || execution.durableAttemptRecorded !== true
  ) {
    throw new Error('isolated committed-vault transaction was not transported');
  }
}

function assertPegInFundingObservation(
  funding:
    Readonly<SubstrateFederatedRewardInputDiscoveryV2>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  minimumSetupConfirmationHeight: number,
): void {
  const setupBoxIds = new Set(batch.orderedTransactions.flatMap(transaction => [
    transaction.issuance.genesisInputBoxIdHex,
    transaction.issuance.predictedStateOutput.boxIdHex,
  ]));
  const setupTransactionIds = new Set(
    batch.orderedTransactions.map(transaction =>
      transaction.issuance.unsignedTransactionIdHex
    ),
  );
  const fundingBoxIds = Object.values(funding.genesisBoxIds);
  const fundingInputs = Object.values(funding.genesisInputs);
  if (
    funding.sources.primaryNodeOrigin !== target.primaryNodeOrigin
    || funding.sources.witnessNodeOrigin !== target.witnessNodeOrigin
    || funding.target.genesisHeaderIdHex
      !== batch.request.target.genesisHeaderIdHex
    || funding.target.tipHeight < minimumSetupConfirmationHeight
    || funding.signer.publicKeyHex !== setupSession.signer.publicKeyHex
    || funding.signer.p2pkErgoTreeHex
      !== setupSession.signer.p2pkErgoTreeHex
    || fundingBoxIds.length !== 3
    || new Set(fundingBoxIds).size !== fundingBoxIds.length
    || fundingBoxIds.some(boxId => setupBoxIds.has(boxId))
    || fundingInputs.some(input =>
      setupTransactionIds.has(input.transactionId)
    )
  ) {
    throw new Error(
      'isolated devnet peg-in funding observation is not a fresh setup successor',
    );
  }
}

function assertManagedCampaignBindings(
  buildReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>,
  managed: ManagedCampaignExecutionV1['managed'],
): void {
  const process = managed.receipt;
  const lifecycle = managed.value.lifecycle;
  const candidate = managed.value.pegIn?.candidate;
  if (
    process.buildIdentityDigestHex !== buildReceipt.buildIdentityDigestHex
    || process.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || process.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || process.executionTargetIdentityDigestHex
      !== lifecycle.executionTargetIdentityDigestHex
    || (candidate !== undefined
      && (candidate.target.processBindingDigestHex
          !== process.processBindingDigestHex
        || candidate.target.executionTargetIdentityDigestHex
          !== process.executionTargetIdentityDigestHex))
  ) {
    throw new Error('isolated devnet managed process binding changed');
  }
}

function executionInput(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
) {
  const issuance = transaction.issuance;
  if (
    issuance.predictedStateOutput.creationHeight
      !== batch.request.target.preSetupAnchor.height
  ) {
    throw new Error('isolated genesis creation height differs from its anchor');
  }
  return {
    role,
    planDigestHex: batch.request.requestDigestHex,
    targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
    expectedTxId: issuance.unsignedTransactionIdHex,
    sourceBoxId: issuance.genesisInputBoxIdHex,
    inputBoxIds: [issuance.genesisInputBoxIdHex],
    attemptedAtHeight: issuance.predictedStateOutput.creationHeight,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    unsignedTransaction: issuance.unsignedTransactionBody,
  } as const;
}

function executionPorts(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  revalidator: SubstrateFederatedLocalDevnetGenesisExecutionPorts['revalidator'],
  authorizer:
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['broadcastAuthorizer'],
  journal: Readonly<SubstrateFederatedLocalDevnetGenesisJournalV1>,
  transport: SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport'],
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  completionDeadline: number,
): Readonly<SubstrateFederatedLocalDevnetGenesisExecutionPorts> {
  return Object.freeze({
    signer: Object.freeze({
      sign: async (admission: SubstrateFederatedLocalDevnetGenesisAdmission) => {
        assertAdmissionMatchesTransaction(admission, batch, transaction, role);
        return Object.freeze({
          signedTransactionDigestHex:
            transaction.signedCandidate.signedTransactionDigestHex,
          signerArtifact: transaction.signedCandidate,
        });
      },
    }),
    checker: Object.freeze({
      check: async (
        signed: SubstrateFederatedLocalDevnetGenesisSignedCandidate,
      ) => {
        assertAdmissionMatchesTransaction(
          signed.admission,
          batch,
          transaction,
          role,
        );
        if (
          signed.signerArtifact !== transaction.signedCandidate
          || signed.signedTransactionDigestHex
            !== transaction.signedCandidate.signedTransactionDigestHex
        ) {
          throw new Error('isolated genesis signed candidate binding changed');
        }
        return Object.freeze({
          checkResponseDigestHex:
            transaction.checkedAcceptance.submissionHandle.checkResponseDigestHex,
          checkerArtifact:
            transaction.checkedAcceptance.submissionHandle,
        });
      },
    }),
    revalidator,
    broadcastAuthorizer: authorizer,
    journal: journal.journal,
    transport: Object.freeze({
      ...transport,
      submit: (attempt: Parameters<typeof transport.submit>[0]) => {
        assertFullConfirmationWindowAvailable(
          completionDeadline,
          `setup:${role}`,
        );
        return transport.submit(attempt);
      },
    }),
    confirmationObserver: observer,
  });
}

function assertAdmissionMatchesTransaction(
  admission: SubstrateFederatedLocalDevnetGenesisAdmission,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
): void {
  const issuance = transaction.issuance;
  if (
    admission.role !== role
    || admission.planDigestHex !== batch.request.requestDigestHex
    || admission.targetGenesisHeaderIdHex
      !== batch.request.target.genesisHeaderIdHex
    || admission.expectedTxId !== issuance.unsignedTransactionIdHex
    || admission.sourceBoxId !== issuance.genesisInputBoxIdHex
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== issuance.genesisInputBoxIdHex
    || admission.attemptedAtHeight
      !== issuance.predictedStateOutput.creationHeight
    || admission.nodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || admission.unsignedTransaction !== issuance.unsignedTransactionBody
  ) {
    throw new Error('isolated genesis admission differs from checked issuance');
  }
}

function assertTransportExecution(
  result: SubstrateFederatedLocalDevnetGenesisExecutionResult,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
): asserts result is Extract<
  SubstrateFederatedLocalDevnetGenesisExecutionResult,
  { readonly transportAttempted: true }
> & { readonly status: 'accepted' | 'ambiguous' | 'reconciled' } {
  if (
    result.transportAttempted !== true
    || result.status === 'rejected'
    || result.role !== role
    || result.expectedTxId !== transaction.issuance.unsignedTransactionIdHex
  ) {
    throw new Error('isolated genesis setup transaction was not transported');
  }
}

function projectTrackerTransportCanonicalConfirmationV9(
  observation: Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>,
  transactionIdHex: string,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationV1
> {
  if (
    observation.status !== 'confirmed'
    || observation.confirmationHeight === null
    || observation.confirmationHeaderIdHex === null
    || observation.confirmations < 1
    || !/^[0-9a-f]{64}$/u.test(transactionIdHex)
  ) {
    throw new Error(
      'isolated tracker transport canonical confirmation is incomplete',
    );
  }
  return deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_V1_SCHEMA,
    version: 1 as const,
    status: 'confirmed' as const,
    transactionIdHex,
    confirmations: observation.confirmations,
    observedAtHeight: observation.observedAtHeight,
    confirmationHeight: observation.confirmationHeight,
    confirmationHeaderIdHex: observation.confirmationHeaderIdHex,
    observationDigestHex: observation.observationDigestHex,
  });
}

async function waitForCanonicalConfirmation(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  expectedTxId: string,
  completionDeadline: number,
  stage: string,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>> {
  let observedAt = performance.now();
  if (
    !Number.isFinite(observedAt)
    || !Number.isFinite(completionDeadline)
    || observedAt >= completionDeadline
  ) {
    throw canonicalConfirmationFailureDiagnosticErrorV1({
      category:
        Number.isFinite(observedAt)
          && Number.isFinite(completionDeadline)
          && observedAt >= completionDeadline
          ? 'managed_deadline_elapsed'
          : 'clock_failure',
      observer,
      expectedTxId,
      observationCount: 0,
      lastObservation: null,
      message: `isolated ${stage} transaction exceeded the managed action deadline`,
    });
  }
  const confirmationBudgetDeadline =
    observedAt + TRANSACTION_CONFIRMATION_BUDGET_MS;
  const deadline = Math.min(completionDeadline, confirmationBudgetDeadline);
  const deadlineLimitCategory:
    SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureCategoryV1 =
      completionDeadline < confirmationBudgetDeadline
        ? 'managed_deadline_elapsed'
        : 'confirmation_budget_elapsed';
  let lastObservationFailure: unknown;
  let lastObservation:
    Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation> | null = null;
  let observationCount = 0;
  for (;;) {
    const beforeObservation = performance.now();
    if (!Number.isFinite(beforeObservation) || beforeObservation < observedAt) {
      throw canonicalConfirmationFailureDiagnosticErrorV1({
        category: 'clock_failure',
        observer,
        expectedTxId,
        observationCount,
        lastObservation,
        message: 'isolated confirmation monotonic clock regressed',
      });
    }
    observedAt = beforeObservation;
    if (observedAt >= deadline) {
      throw confirmationDeadlineError(
        observer,
        expectedTxId,
        stage,
        observationCount,
        lastObservation,
        lastObservationFailure,
        deadlineLimitCategory,
      );
    }
    let rawObservation:
      SubstrateFederatedLocalDevnetGenesisConfirmation | null;
    observationCount += 1;
    try {
      rawObservation = await observer.observe(
        expectedTxId,
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
      );
      lastObservationFailure = undefined;
    } catch (error) {
      lastObservationFailure = error;
      rawObservation = null;
    }
    const afterObservation = performance.now();
    if (!Number.isFinite(afterObservation) || afterObservation < observedAt) {
      throw canonicalConfirmationFailureDiagnosticErrorV1({
        category: 'clock_failure',
        observer,
        expectedTxId,
        observationCount,
        lastObservation,
        message: 'isolated confirmation monotonic clock regressed',
      });
    }
    observedAt = afterObservation;
    let observation:
      Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation> | null = null;
    if (rawObservation !== null) {
      try {
        observation =
          normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
            rawObservation,
          );
      } catch (error) {
        throw canonicalConfirmationFailureDiagnosticErrorV1({
          category: 'observer_failure',
          observer,
          expectedTxId,
          observationCount,
          lastObservation,
          message: `isolated ${stage} transaction confirmation observation changed`,
          cause: error,
        });
      }
      lastObservation = observation;
    }
    if (observedAt >= deadline) {
      if (observation === null) {
        throw confirmationDeadlineError(
          observer,
          expectedTxId,
          stage,
          observationCount,
          lastObservation,
          lastObservationFailure,
          deadlineLimitCategory,
        );
      }
      throw canonicalConfirmationFailureDiagnosticErrorV1({
        category: observation.status === 'pending'
          ? 'pending_at_deadline'
          : observation.status === 'not_found'
          ? 'not_found_at_deadline'
          : 'observation_completed_after_deadline',
        observer,
        expectedTxId,
        observationCount,
        lastObservation: observation,
        message:
          `isolated ${stage} transaction confirmation exceeded its deadline`,
      });
    }
    if (observation === null) {
      await delay(Math.min(CONFIRMATION_POLL_MS, deadline - observedAt));
      continue;
    }
    if (
      observation.status === 'confirmed'
      && observation.confirmationHeight !== null
      && observation.confirmationHeaderIdHex !== null
    ) {
      return observation;
    }
    await delay(Math.min(CONFIRMATION_POLL_MS, deadline - observedAt));
  }
}

async function waitForStableCanonicalConfirmationAfterHeight(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  retained:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'][number],
  minimumExclusiveHeight: number,
  completionDeadline: number,
  stage: string,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>> {
  for (;;) {
    const confirmation = await waitForCanonicalConfirmation(
      observer,
      retained.expectedTxId,
      completionDeadline,
      stage,
    );
    if (
      confirmation.confirmationHeight !== retained.confirmationHeight
      || confirmation.confirmationHeaderIdHex
        !== retained.confirmationHeaderIdHex
    ) {
      throw new Error(
        `isolated ${stage} canonical confirmation changed`,
      );
    }
    if (confirmation.observedAtHeight > minimumExclusiveHeight) {
      return confirmation;
    }
    assertManagedActionDeadline(completionDeadline, stage);
    await delay(CONFIRMATION_POLL_MS);
  }
}

function confirmationDeadlineError(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  expectedTxId: string,
  stage: string,
  observationCount: number,
  lastObservation:
    Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation> | null,
  lastObservationFailure: unknown,
  deadlineLimitCategory:
    | 'managed_deadline_elapsed'
    | 'confirmation_budget_elapsed',
): Error {
  const unavailable = lastObservationFailure !== undefined;
  return canonicalConfirmationFailureDiagnosticErrorV1({
    category: unavailable
      ? 'observer_failure'
      : lastObservation?.status === 'pending'
      ? 'pending_at_deadline'
      : lastObservation?.status === 'not_found'
      ? 'not_found_at_deadline'
      : deadlineLimitCategory,
    observer,
    expectedTxId,
    observationCount,
    lastObservation,
    message: unavailable
      ? `isolated ${stage} transaction confirmation remained unavailable before its deadline`
      : `isolated ${stage} transaction confirmation exceeded its deadline`,
    ...(unavailable ? { cause: lastObservationFailure } : {}),
  });
}

function canonicalConfirmationFailureDiagnosticErrorV1(
  input: Readonly<{
    readonly category:
      SubstrateFederatedIsolatedDevnetTrackerCanonicalConfirmationFailureCategoryV1;
    readonly observer:
      Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>;
    readonly expectedTxId: string;
    readonly observationCount: number;
    readonly lastObservation:
      Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation> | null;
    readonly message: string;
    readonly cause?: unknown;
  }>,
): Error {
  if (
    !TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1.includes(
      input.category,
    )
    || !/^[0-9a-f]{64}$/u.test(input.expectedTxId)
    || !/^[0-9a-f]{64}$/u.test(
      input.observer.reconciliationIdentityDigestHex,
    )
    || !Number.isSafeInteger(input.observationCount)
    || input.observationCount < 0
    || (input.lastObservation !== null && input.observationCount === 0)
    || (input.category === 'observer_failure' && input.observationCount === 0)
    || (input.category === 'pending_at_deadline'
      && input.lastObservation?.status !== 'pending')
    || (input.category === 'not_found_at_deadline'
      && input.lastObservation?.status !== 'not_found')
    || (input.category === 'observation_completed_after_deadline'
      && input.lastObservation?.status !== 'confirmed')
    || (['observer_failure', 'clock_failure'].includes(input.category)
      && input.lastObservation?.status === 'confirmed')
    || (['managed_deadline_elapsed', 'confirmation_budget_elapsed',
      'confirmation_phase_failure'].includes(input.category)
      && (input.observationCount !== 0 || input.lastObservation !== null))
  ) {
    throw new Error('isolated canonical confirmation diagnostic binding changed');
  }
  const diagnostic = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA,
    version: 1 as const,
    category: input.category,
    expectedTransactionIdHex: input.expectedTxId,
    executionTargetIdentityDigestHex:
      input.observer.reconciliationIdentityDigestHex,
    confirmationBudgetMs: TRANSACTION_CONFIRMATION_BUDGET_MS,
    observationCount: input.observationCount,
    lastObservation: input.lastObservation === null
      ? null
      : deepFreeze({
          status: input.lastObservation.status,
          confirmations: input.lastObservation.confirmations,
          observedAtHeight: input.lastObservation.observedAtHeight,
          observationDigestHex: input.lastObservation.observationDigestHex,
        }),
  });
  assertCapabilityFreePlainData(
    diagnostic,
    'isolated tracker canonical confirmation failure diagnostic',
  );
  const failure = input.cause === undefined
    ? new Error(input.message)
    : new Error(input.message, { cause: input.cause });
  TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTICS_V1.set(
    failure,
    diagnostic,
  );
  return failure;
}

function assertFullConfirmationWindowAvailable(
  completionDeadline: number,
  stage: string,
): void {
  const now = performance.now();
  if (
    !Number.isFinite(now)
    || !Number.isFinite(completionDeadline)
    || now + TRANSACTION_CONFIRMATION_BUDGET_MS > completionDeadline
  ) {
    throw new Error(
      `isolated ${stage} transaction lacks a full confirmation window before the managed action deadline`,
    );
  }
}

function assertManagedActionDeadline(
  completionDeadline: number,
  stage: string,
): void {
  const now = performance.now();
  if (
    !Number.isFinite(now)
    || !Number.isFinite(completionDeadline)
    || now >= completionDeadline
  ) {
    throw new Error(`isolated managed action exceeded its deadline at ${stage}`);
  }
}

async function refreshCanonicalReceiptConfirmations(
  transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'],
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  deadline: number,
): Promise<
  SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions']
> {
  const refreshed:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'][number][] = [];
  for (const transaction of transactions) {
    const confirmation = await waitForCanonicalConfirmation(
      observer,
      transaction.expectedTxId,
      deadline,
      `setup-refresh:${transaction.role}`,
    );
    refreshed.push(Object.freeze({
      ...transaction,
      confirmationDigestHex: confirmation.observationDigestHex,
      confirmationHeight: confirmation.confirmationHeight!,
      confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex!,
    }));
  }
  return Object.freeze(refreshed);
}

function assertCanonicalBatch(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
): void {
  if (
    batch.orderedTransactions.length !== ROLE_ORDER.length
    || batch.orderedTransactions.some((transaction, index) =>
      coreRole(transaction.issuance.role) !== ROLE_ORDER[index]
      || transaction.issuance.ordinal !== index
      || transaction.issuance.predictedStateOutput.creationHeight
        !== batch.request.target.preSetupAnchor.height
    )
  ) {
    throw new Error('isolated genesis execution batch order or anchor changed');
  }
}

function deriveExpectedProfilePins(
  packetSession:
    SubstrateFederatedIsolatedDevnetPacketSessionV1OrV2OrV3,
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
    SubstrateFederatedIsolatedDevnetPacketSessionV1OrV2OrV3,
  setupSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
): void {
  if (
    packetSession.signer.ergoAdmissionThreshold !== 1
    || packetSession.signer.ergoAdmissionPublicKeysHex.length !== 1
    || packetSession.signer.ergoAdmissionPublicKeysHex[0]
      !== setupSigner.publicKeyHex
  ) {
    throw new Error(
      'isolated packet Ergo-admission signer differs from the setup signer',
    );
  }
}

function nodeLaunchBinding(
  signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
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

function coreRole(
  role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
): SubstrateFederatedLocalDevnetGenesisRole {
  if (role === 'duplicate-prevention') return 'duplicatePrevention';
  if (role === 'pooled-reserve') return 'pooledReserve';
  return 'tracker';
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

function createIsolatedDevnetStateTracker(localStateRoot: string) {
  return new StateTracker(join(localStateRoot, 'state-store'));
}

function assertNoLocalPathValue(value: unknown): void {
  if (
    typeof value === 'string'
    && (/(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u.test(value)
      || value.startsWith('\\\\')
      || value.startsWith('//'))
  ) {
    throw new Error('isolated genesis receipt contains a local path');
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoLocalPathValue(entry);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) assertNoLocalPathValue(entry);
  }
}

function normalizePegInCandidatePlan(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input['pegIn']>,
): Readonly<PegInCandidatePlanV1> {
  assertCapabilityFreePlainData(input, 'isolated devnet peg-in plan');
  assertExactObjectKeys(
    input,
    ['amountNanoErg', 'recipientAddressHex'],
    'isolated devnet peg-in plan',
  );
  const { amountNanoErg, recipientAddressHex } = input;
  if (!/^[1-9]\d*$/u.test(amountNanoErg)) {
    throw new Error(
      'isolated devnet peg-in amount must be canonical positive nanoERG',
    );
  }
  const amount = BigInt(amountNanoErg);
  if (amount < 1_000_000n || amount > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('isolated devnet peg-in amount is outside Ergo Long bounds');
  }
  if (
    !/^[0-9a-f]{40}$/u.test(recipientAddressHex)
    || /^0+$/u.test(recipientAddressHex)
  ) {
    throw new Error(
      'isolated devnet peg-in recipient must be canonical nonzero 20-byte hex',
    );
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

function normalizeFrontierMintProofConsumerPlan(
  input:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2> {
  assertCapabilityFreePlainData(
    input,
    'isolated devnet Frontier mint-proof consumer plan',
  );
  return preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
    input,
  );
}

function normalizeFrontierApplicationRunnerPlan(
  input:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3> {
  assertCapabilityFreePlainData(
    input,
    'isolated devnet Frontier application runner plan',
  );
  assertExactObjectKeys(
    input,
    [
      'cargoDependencyCacheDirectory',
      'cargoExecutablePath',
      'frontierSourceDirectory',
      'gitExecutablePath',
      'offline',
      'rustcExecutablePath',
      'temporaryDirectoryRoot',
    ],
    'isolated devnet Frontier application runner plan',
  );
  if (
    input.offline !== true
    || [
      input.cargoDependencyCacheDirectory,
      input.cargoExecutablePath,
      input.frontierSourceDirectory,
      input.gitExecutablePath,
      input.rustcExecutablePath,
      input.temporaryDirectoryRoot,
    ].some(value => typeof value !== 'string' || value.trim() === '')
  ) {
    throw new Error(
      'isolated devnet Frontier application runner plan is invalid',
    );
  }
  const normalized = Object.freeze({
    frontierSourceDirectory: input.frontierSourceDirectory,
    temporaryDirectoryRoot: input.temporaryDirectoryRoot,
    cargoDependencyCacheDirectory: input.cargoDependencyCacheDirectory,
    cargoExecutablePath: input.cargoExecutablePath,
    rustcExecutablePath: input.rustcExecutablePath,
    gitExecutablePath: input.gitExecutablePath,
    offline: true as const,
  });
  return preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3(
    normalized,
  );
}

function finalizeReceipt<T extends object>(
  body: T,
  digestDomain: string,
): Readonly<T & { readonly receiptDigestHex: string }> {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(body);
  assertNoLocalPathValue(body);
  deepFreeze(body);
  const receipt = {
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, digestDomain),
  };
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return deepFreeze(receipt);
}

function assertCapabilityFreePlainData(
  value: unknown,
  label: string,
  seen = new Set<object>(),
  active = new Set<object>(),
): void {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} must contain capability-free plain data only`);
  }
  if (active.has(value)) {
    throw new Error(`${label} must not contain cyclic data`);
  }
  if (seen.has(value)) return;
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    isArray
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    throw new Error(`${label} must not contain custom prototypes`);
  }
  seen.add(value);
  active.add(value);
  const keys: PropertyKey[] = [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];
  if (keys.some(key => typeof key === 'symbol')) {
    throw new Error(`${label} must not contain symbol-keyed data`);
  }
  if (isArray) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, String(index))) {
        throw new Error(`${label} must not contain sparse arrays`);
      }
    }
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new Error(`${label} must not contain symbol-keyed data`);
    }
    if (key === 'length' && isArray) continue;
    if (
      isArray
      && (!/^(?:0|[1-9]\d*)$/u.test(key)
        || Number(key) >= value.length)
    ) {
      throw new Error(`${label} must not contain non-index array fields`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      descriptor.get !== undefined
      || descriptor.set !== undefined
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} must contain enumerable data fields only`);
    }
    assertCapabilityFreePlainData(descriptor.value, label, seen, active);
  }
  active.delete(value);
}

function assertExactObjectKeys(
  value: object,
  expectedKeys: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): Readonly<T> {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const key of [
      ...Object.getOwnPropertyNames(value),
      ...Object.getOwnPropertySymbols(value),
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && 'value' in descriptor) {
        deepFreeze(descriptor.value, seen);
      }
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
