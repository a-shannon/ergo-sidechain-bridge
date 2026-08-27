import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from '../../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
} from '../../relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9,
  projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9,
} from '../../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';

const mocked = vi.hoisted(() => ({
  build: vi.fn(),
  process: vi.fn(),
  setup: vi.fn(),
  claim: vi.fn(),
  checkpointClaim: vi.fn(),
  checkpointSequenceClaim: vi.fn(),
  checkpointObserve: vi.fn(),
  checkpointAssert: vi.fn(),
  checkpointBoundObserve: vi.fn(),
  checkpointBoundAssert: vi.fn(),
  checkpointBoundFrozenObserve: vi.fn(),
  checkpointBoundFrozenAssert: vi.fn(),
  trackerReservationFreshnessObserve: vi.fn(),
  trackerReservationFreshnessObserveAssert: vi.fn(),
  observedHeaderBuild: vi.fn(),
  checkpointExtensionEncode: vi.fn(),
  packet: vi.fn(),
  packetContinuation: vi.fn(),
  packetV2Assert: vi.fn(),
  packetRelayerLineageClaim: vi.fn(),
  requestBindingClaim: vi.fn(),
  mintDraftBuild: vi.fn(),
  evidenceCollect: vi.fn(),
  frontierConsumerPreflight: vi.fn(),
  frontierConsumer: vi.fn(),
  frontierConsumerAssert: vi.fn(),
  applicationCheckpointContinuation: vi.fn(),
  applicationCheckpointAssert: vi.fn(),
  applicationRunnerPreflight: vi.fn(),
  trackerBuild: vi.fn(),
  observedTrackerBuild: vi.fn(),
  trackerAssert: vi.fn(),
  materializeUnsigned: vi.fn(),
  sourceHistory: vi.fn(),
  rewardDiscovery: vi.fn(),
  rewardDiscoveryAssert: vi.fn(),
  ergoHistory: vi.fn(),
  familyDecode: vi.fn(),
  pegInCandidateBuild: vi.fn(),
  pegInCandidateAssert: vi.fn(),
  pegInSourceLockCheck: vi.fn(),
  pegInSourceLockRetainingCheck: vi.fn(),
  pegInSourceLockPromote: vi.fn(),
  pegInSourceLockDiscard: vi.fn(),
  ownedRewardDiscovery: vi.fn(),
  pegInSourceLockAuthorizer: vi.fn(),
  pegInSourceLockTransport: vi.fn(),
  pegInSourceLockJournal: vi.fn(),
  pegInSourceLockOutputObserve: vi.fn(),
  pegInSourceLockOutputAssert: vi.fn(),
  pegInCommittedVaultCheck: vi.fn(),
  pegInCommittedVaultRetainingCheck: vi.fn(),
  observedTrackerCheck: vi.fn(),
  observedTrackerCheckAssert: vi.fn(),
  observedFrozenTrackerCheck: vi.fn(),
  observedFrozenTrackerCheckAssert: vi.fn(),
  trackerReservationFreshnessCheck: vi.fn(),
  trackerReservationFreshnessCheckAssert: vi.fn(),
  trackerReservationFreshnessCompletionClaim: vi.fn(),
  trackerReservationFreshnessCheckDiscard: vi.fn(),
  trackerReservationFreshnessPromote: vi.fn(),
  trackerTransportAuthorize: vi.fn(),
  trackerTransportJournalCreate: vi.fn(),
  trackerTransportPreflight: vi.fn(),
  trackerTransportSubmit: vi.fn(),
  pegInCommittedVaultPromote: vi.fn(),
  pegInCommittedVaultAuthorizationSession: vi.fn(),
  pegInCommittedVaultTransport: vi.fn(),
  pegInCommittedVaultJournal: vi.fn(),
  pegInCommittedVaultOutputObserve: vi.fn(),
  pegInCommittedVaultOutputAssert: vi.fn(),
  execute: vi.fn(),
  revalidator: vi.fn(),
  observer: vi.fn(),
  authorizer: vi.fn(),
  assertConfirmed: vi.fn(),
  transport: vi.fn(),
  journal: vi.fn(),
  stateClose: vi.fn(),
}));

vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.build,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1: mocked.process,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-checkpoint-bound-frozen-execution.v2',
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1:
    31 * 60_000,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-execution.v1',
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', () => ({
  claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2:
    mocked.checkpointClaim,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2:
    mocked.checkpointSequenceClaim,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2: mocked.claim,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: mocked.setup,
}));
vi.mock('../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1:
    mocked.checkpointAssert,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1:
    mocked.checkpointBoundAssert,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2:
    mocked.checkpointBoundFrozenAssert,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1:
    mocked.trackerReservationFreshnessObserveAssert,
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1:
    mocked.checkpointObserve,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1:
    mocked.checkpointBoundObserve,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2:
    mocked.checkpointBoundFrozenObserve,
  observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1:
    mocked.trackerReservationFreshnessObserve,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v2',
}));
vi.mock('../../bridge-validity-tracker-header-context-v1.js', () => ({
  BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE:
    'eip0045-validity-tracker-canonical-synthetic-header-context',
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE:
    'eip0045-validity-tracker-observed-header-context',
  buildBridgeValidityTrackerObservedHeaderContextV1:
    mocked.observedHeaderBuild,
}));
vi.mock('../../profiles/substrate-federated-v1/checkpoint-statement.js', async importOriginal => ({
  ...(await importOriginal()),
  encodeSubstrateFederatedCheckpointExtensionValueV1:
    mocked.checkpointExtensionEncode,
}));
vi.mock('../../substrate-federated-isolated-devnet-packet-producer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance:
    mocked.packetV2Assert,
  claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1:
    mocked.packetRelayerLineageClaim,
  createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2:
    mocked.packetContinuation,
  createSubstrateFederatedIsolatedDevnetPacketSessionV1: mocked.packet,
}));
vi.mock(
  '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js',
  () => ({
    claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1:
      mocked.requestBindingClaim,
  }),
);
vi.mock('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1:
    mocked.mintDraftBuild,
}));
vi.mock('../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1:
    mocked.evidenceCollect,
}));
vi.mock('../../substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance:
    mocked.frontierConsumerAssert,
  preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2:
    mocked.frontierConsumerPreflight,
  runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2:
    mocked.frontierConsumer,
}));
vi.mock('./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', () => ({
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance:
    mocked.applicationCheckpointAssert,
  createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3:
    mocked.applicationCheckpointContinuation,
  preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3:
    mocked.applicationRunnerPreflight,
}));
vi.mock('../../substrate-federated-tracker-v1.js', () => ({
  assertSubstrateFederatedTrackerV1Context: mocked.trackerAssert,
  buildCompilerBoundSubstrateFederatedTrackerV1Context: mocked.trackerBuild,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context:
    mocked.observedTrackerBuild,
  SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA:
    'e2s.substrate-federated-v1-tracker-context',
}));
vi.mock('../../unsigned-ergo-transaction.js', () => ({
  materializeUnsignedTransaction: mocked.materializeUnsigned,
}));
vi.mock('../../substrate-federated-authority-safe-devnet-history-v1.js', () => ({
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1: mocked.sourceHistory,
}));
vi.mock('../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js', () => ({
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance:
    mocked.rewardDiscoveryAssert,
  discoverSubstrateFederatedRewardInputsV2: mocked.rewardDiscovery,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: 'http://127.0.0.1:9051',
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: 'http://127.0.0.1:9052',
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocked.pegInCandidateAssert,
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocked.pegInCandidateBuild,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1:
    mocked.observedTrackerCheckAssert,
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2:
    mocked.observedFrozenTrackerCheckAssert,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1:
    mocked.trackerReservationFreshnessCheckAssert,
  claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1:
    mocked.trackerReservationFreshnessCompletionClaim,
  discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1:
    mocked.trackerReservationFreshnessCheckDiscard,
  promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1:
    mocked.trackerReservationFreshnessPromote,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1:
    mocked.pegInCommittedVaultPromote,
  discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1:
    mocked.pegInSourceLockDiscard,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1:
    mocked.pegInSourceLockPromote,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v2',
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-check.v1',
}));
vi.mock('../../substrate-federated-settlement-family-v1.js', () => ({
  decodeSubstrateFederatedSettlementFamilyV1Profile: mocked.familyDecode,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2:
    mocked.ergoHistory,
}));
vi.mock('../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js', () => ({
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN:
    'http://127.0.0.1:9051',
  executeSubstrateFederatedLocalDevnetGenesisV1: mocked.execute,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1:
    (value: unknown) => value,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1:
    mocked.revalidator,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1:
    mocked.observer,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1:
    50_000,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1:
    mocked.assertConfirmed,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1:
    mocked.authorizer,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1:
    mocked.transport,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1:
    mocked.pegInSourceLockTransport,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1:
    mocked.pegInCommittedVaultTransport,
}));
vi.mock('./substrate-federated-isolated-devnet-tracker-checked-transport-v1.js', () => ({
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1:
    mocked.trackerTransportSubmit,
}));
vi.mock('./substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js', () => ({
  authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1:
    mocked.trackerTransportAuthorize,
  createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1:
    mocked.trackerTransportJournalCreate,
  createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1:
    mocked.trackerTransportPreflight,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1:
    mocked.pegInCommittedVaultAuthorizationSession,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1:
    mocked.pegInSourceLockAuthorizer,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1:
    mocked.ownedRewardDiscovery,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1:
    mocked.pegInSourceLockOutputAssert,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1:
    mocked.pegInSourceLockOutputObserve,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1:
    mocked.pegInCommittedVaultOutputAssert,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1:
    mocked.pegInCommittedVaultOutputObserve,
}));
vi.mock('../../substrate-federated-local-devnet-genesis-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetGenesisJournalV1: mocked.journal,
}));
vi.mock('../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1:
    mocked.pegInSourceLockJournal,
}));
vi.mock('../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1:
    mocked.pegInCommittedVaultJournal,
}));
vi.mock('../../state-tracker.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../state-tracker.js')
  >();
  return {
    ...actual,
    StateTracker: class extends actual.StateTracker {
      override close(): void {
        try {
          super.close();
        } finally {
          mocked.stateClose();
        }
      }
    },
  };
});

import {
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance,
  assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance,
  assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance,
  projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9,
  runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3,
  runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5,
  runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1,
  runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7,
  runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9,
  runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6,
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance,
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore,
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance,
  authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1,
  persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
} from './substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from '../../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
} from '../../scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-receipt-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from '../../scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import type {
  SubstrateFederatedLocalDevnetGenesisConfirmation,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
} from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';

const MINING_CREDENTIAL = Object.freeze({ schema: 'synthetic-mining-credential' });
const CHECKPOINT_MINING_CREDENTIAL = Object.freeze({
  schema: 'synthetic-checkpoint-mining-credential',
});
const TRACKER_ADMISSION_MINING_CREDENTIAL = Object.freeze({
  schema: 'synthetic-tracker-admission-mining-credential',
});
const TRACKER_CONFIRMATION_MINING_CREDENTIAL = Object.freeze({
  schema: 'synthetic-tracker-confirmation-mining-credential',
});
const TRACKER_RESERVATION_FRESHNESS_COMPLETION = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1',
  version: 1 as const,
});
const TRACKER_TRANSPORT_REQUEST_BINDING = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-bootstrap-request-binding.v1',
  version: 1 as const,
  requestSha256Hex: 'f'.repeat(64),
});
const TRACKER_TRANSPORT_REQUEST_CAMPAIGN_BINDING = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-bootstrap-request-campaign-binding.v1',
  version: 1 as const,
  requestSha256Hex: 'f'.repeat(64),
});

describe('isolated devnet genesis setup execution root V1', () => {
  let order: string[];
  let currentBatch: ReturnType<typeof setupBatch>;
  let processSession: ReturnType<typeof validProcessSession>;
  let observerPort: ReturnType<typeof validObserver>;
  let authorizerPort: ReturnType<typeof validAuthorizer>;
  let journalPort: ReturnType<typeof validJournal>;
  let rewardDiscoveryCount: number;
  let fundingObservation: ReturnType<typeof validPegInFundingObservation>;
  let postCandidateFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;
  let postCheckFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;
  let preTransportFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;
  let packetV2: ReturnType<typeof validPacketV2>;
  let mintDraft: ReturnType<typeof validMintDraft>;
  let evidenceReceipt: ReturnType<typeof validEvidenceReceipt>;
  let packetProof: ReturnType<typeof validPacketProof>;
  let consumerReceipt: ReturnType<typeof validConsumerReceipt>;
  let applicationCheckpointReceipt:
    ReturnType<typeof validApplicationCheckpointReceipt>;
  let applicationCheckpointStage:
    ReturnType<typeof validApplicationCheckpointStage>;
  let trackerSetupMaterial:
    ReturnType<typeof validMaterializedTrackerSetup>;
  let trackerContext: ReturnType<typeof validTrackerContext>;
  let observedHeaderContext: ReturnType<typeof validObservedHeaderContext>;
  let observedTrackerContext: ReturnType<typeof validObservedTrackerContext>;
  let observedTrackerCheck: ReturnType<typeof validObservedTrackerCheck>;
  let checkpointAnchorObservation:
    ReturnType<typeof validCheckpointAnchorObservation>;
  let checkpointBoundObservation:
    ReturnType<typeof validCheckpointBoundObservation>;
  let frozenCheckpointBoundObservation:
    ReturnType<typeof validFrozenCheckpointBoundObservation>;
  let frozenObservedTrackerCheck:
    ReturnType<typeof validFrozenObservedTrackerCheck>;
  let trackerReservationFreshnessObservation:
    ReturnType<typeof validTrackerReservationFreshnessObservation>;
  let trackerReservationFreshnessCheck:
    ReturnType<typeof validTrackerReservationFreshnessCheck>;
  let trackerTransportExecutionCheck: Readonly<Record<string, unknown>>;
  let trackerTransportAuthorization: Readonly<Record<string, unknown>>;
  let trackerTransportAttempt: Readonly<Record<string, unknown>>;
  let trackerTransportPreflight: Readonly<Record<string, unknown>>;
  let packetRelayerLineage: Readonly<Record<string, unknown>>;
  let trackerTransportOutcome: Readonly<Record<string, unknown>>;
  let trackerTransportJournal: Readonly<{
    reserve: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    currentBatch = setupBatch();
    observerPort = validObserver(order);
    authorizerPort = validAuthorizer(order);
    journalPort = validJournal(order);
    processSession = validProcessSession(order);
    rewardDiscoveryCount = 0;
    fundingObservation = validPegInFundingObservation();
    postCandidateFundingObservation = structuredClone(fundingObservation);
    postCandidateFundingObservation.reportDigestHex = digest('d');
    postCandidateFundingObservation.observedAt = '2026-08-18T09:01:00.000Z';
    postCandidateFundingObservation.target.tipHeight = 131;
    postCandidateFundingObservation.target.tipHeaderIdHex = digest('e');
    postCheckFundingObservation = structuredClone(fundingObservation);
    postCheckFundingObservation.reportDigestHex = digest('f');
    postCheckFundingObservation.observedAt = '2026-08-18T09:02:00.000Z';
    postCheckFundingObservation.target.tipHeight = 132;
    postCheckFundingObservation.target.tipHeaderIdHex = digest('0');
    preTransportFundingObservation = structuredClone(fundingObservation);
    preTransportFundingObservation.reportDigestHex = digest('6');
    preTransportFundingObservation.observedAt = '2026-08-18T09:03:00.000Z';
    preTransportFundingObservation.target.tipHeight = 133;
    preTransportFundingObservation.target.tipHeaderIdHex = digest('1');
    packetV2 = validPacketV2();
    packetRelayerLineage = Object.freeze({
      schema:
        'e2s.substrate-federated-isolated-devnet-packet-relayer-lineage.v1',
      version: 1,
      headCommitSha1Hex: '1'.repeat(40),
      relayerArtifactSetDigestHex: digest('1'),
      packetReceiptDigestHex: digest('2'),
    });
    mocked.packetRelayerLineageClaim.mockImplementation(value => {
      order.push('tracker-transport:packet-lineage:claim');
      if (value !== packetV2) {
        throw new Error('packet relayer lineage input changed');
      }
      return packetRelayerLineage;
    });
    mocked.requestBindingClaim.mockImplementation((value, input) => {
      if (
        value !== TRACKER_TRANSPORT_REQUEST_BINDING
        || input === null
        || typeof input !== 'object'
        || input.build === undefined
        || input.lifecycle === undefined
      ) {
        throw new Error('tracker transport request binding changed');
      }
      return TRACKER_TRANSPORT_REQUEST_CAMPAIGN_BINDING;
    });
    mintDraft = validMintDraft();
    evidenceReceipt = validEvidenceReceipt(mintDraft);
    packetProof = validPacketProof(packetV2, mintDraft, evidenceReceipt);
    consumerReceipt = validConsumerReceipt(
      packetV2,
      mintDraft,
      evidenceReceipt,
      packetProof,
    );
    applicationCheckpointReceipt = validApplicationCheckpointReceipt(
      packetV2,
      packetProof,
    );
    applicationCheckpointStage = validApplicationCheckpointStage(
      applicationCheckpointReceipt,
      packetV2,
    );
    trackerSetupMaterial = validMaterializedTrackerSetup(currentBatch);
    trackerContext = validTrackerContext(
      trackerSetupMaterial.outputs[0]!,
      applicationCheckpointReceipt,
    );
    checkpointAnchorObservation = validCheckpointAnchorObservation();
    checkpointBoundObservation = validCheckpointBoundObservation(
      checkpointAnchorObservation,
    );
    frozenCheckpointBoundObservation = validFrozenCheckpointBoundObservation(
      checkpointAnchorObservation,
    );
    observedHeaderContext = validObservedHeaderContext(
      checkpointBoundObservation,
    );
    observedTrackerContext = validObservedTrackerContext(
      trackerContext,
      observedHeaderContext,
    );
    observedTrackerCheck = validObservedTrackerCheck(
      observedTrackerContext,
      trackerSetupMaterial.outputs[0]!,
      {
        processBindingDigestHex:
          checkpointBoundObservation.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          checkpointBoundObservation.executionTargetIdentityDigestHex,
      },
    );
    frozenObservedTrackerCheck = validFrozenObservedTrackerCheck(
      observedTrackerContext,
      trackerSetupMaterial.outputs[0]!,
      {
        processBindingDigestHex:
          frozenCheckpointBoundObservation.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          frozenCheckpointBoundObservation.executionTargetIdentityDigestHex,
      },
    );
    trackerReservationFreshnessObservation =
      validTrackerReservationFreshnessObservation(
        checkpointAnchorObservation,
      );
    trackerReservationFreshnessCheck = validTrackerReservationFreshnessCheck(
      frozenObservedTrackerCheck,
    );
    trackerTransportExecutionCheck = Object.freeze({
      receipt: trackerReservationFreshnessCheck,
      signedCandidate: Object.freeze({ role: 'synthetic-signed-candidate' }),
      checkedAcceptance: Object.freeze({ role: 'synthetic-check-acceptance' }),
    });
    trackerTransportAuthorization = Object.freeze({
      expectedTransactionIdHex:
        trackerReservationFreshnessCheck.signedTransactionIdHex,
      executionTargetIdentityDigestHex: digest('6'),
      authorizationDigestHex: digest('2'),
    });
    trackerTransportAttempt = Object.freeze({
      expectedTransactionIdHex:
        trackerReservationFreshnessCheck.signedTransactionIdHex,
      durableAttemptDigestHex: digest('3'),
      authorization: trackerTransportAuthorization,
    });
    trackerTransportPreflight = Object.freeze({
      schema:
        'e2s.substrate-federated-isolated-devnet-tracker-transport-preflight.v1',
      version: 1,
      status: 'fresh_campaign_bound_before_one_local_post',
      preflightDigestHex: digest('7'),
    });
    trackerTransportOutcome = Object.freeze({
      schema:
        'e2s.substrate-federated-isolated-devnet-tracker-transport-outcome.v1',
      version: 1,
      status: 'accepted',
      expectedTransactionIdHex:
        trackerReservationFreshnessCheck.signedTransactionIdHex,
      submittedTransactionIdHex:
        trackerReservationFreshnessCheck.signedTransactionIdHex,
      durableAttemptDigestHex: digest('3'),
      responseDigestHex: digest('4'),
      trackerAdmissionEstablished: false,
      outcomeDigestHex: digest('5'),
    });
    trackerTransportJournal = Object.freeze({
      reserve: vi.fn(authorization => {
        order.push('tracker-transport:journal:reserve');
        if (authorization !== trackerTransportAuthorization) {
          throw new Error('tracker transport authorization changed');
        }
        return trackerTransportAttempt;
      }),
      finalize: vi.fn((attempt, submission) => {
        order.push('tracker-transport:journal:finalize');
        if (
          attempt !== trackerTransportAttempt
          || submission.status !== 'accepted'
          || submission.submittedTransactionIdHex
            !== trackerReservationFreshnessCheck.signedTransactionIdHex
        ) {
          throw new Error('tracker transport outcome changed');
        }
        return trackerTransportOutcome;
      }),
    });

    mocked.build.mockImplementation(async () => {
      order.push('build');
      return validBuild();
    });
    mocked.setup.mockImplementation(async () => {
      order.push('setup');
      return {
        signer: setupSigner(),
        dispose: vi.fn(() => order.push('dispose:setup')),
        runForExecution: vi.fn(async () => {
          order.push('setup:execution');
          return currentBatch;
        }),
        runForExecutionRetainingPegInSigner: vi.fn(async () => {
          order.push('setup:execution:retain-peg-in-signer');
          return currentBatch;
        }),
        checkPegInSourceLock: mocked.pegInSourceLockCheck,
        checkPegInSourceLockRetainingSigner:
          mocked.pegInSourceLockRetainingCheck,
        checkPegInCommittedVault: mocked.pegInCommittedVaultCheck,
        checkPegInCommittedVaultRetainingSigner:
          mocked.pegInCommittedVaultRetainingCheck,
        checkTrackerCandidate: mocked.observedTrackerCheck,
        checkFrozenTrackerCandidate: mocked.observedFrozenTrackerCheck,
        recheckTrackerReservationFreshnessCandidate:
          mocked.trackerReservationFreshnessCheck,
      };
    });
    mocked.claim.mockReturnValue(MINING_CREDENTIAL);
    mocked.checkpointClaim.mockReturnValue(Object.freeze({
      miningCredential: MINING_CREDENTIAL,
      checkpointMiningCredential: CHECKPOINT_MINING_CREDENTIAL,
    }));
    mocked.checkpointSequenceClaim.mockReturnValue(Object.freeze({
      miningCredential: MINING_CREDENTIAL,
      checkpointMiningCredential: CHECKPOINT_MINING_CREDENTIAL,
      trackerAdmissionMiningCredential: TRACKER_ADMISSION_MINING_CREDENTIAL,
      trackerConfirmationMiningCredential:
        TRACKER_CONFIRMATION_MINING_CREDENTIAL,
    }));
    mocked.checkpointExtensionEncode.mockReturnValue(
      checkpointAnchorObservation.extensionValueHex,
    );
    mocked.checkpointObserve.mockImplementation(async input => {
      order.push('checkpoint-anchor:observe');
      if (
        input.target.primaryNodeOrigin !== executionTarget().primaryNodeOrigin
        || input.target.witnessNodeOrigin
          !== executionTarget().witnessNodeOrigin
        || input.targetGenesisHeaderIdHex
          !== fundingObservation.target.genesisHeaderIdHex
        || input.expectedPriorHeaderIdHex
          !== processReceipt().finalSnapshot.headerIdHex
        || input.expectedPriorHeight
          !== processReceipt().finalSnapshot.fullHeight
        || input.expectedExtensionValueHex
          !== checkpointAnchorObservation.extensionValueHex
      ) {
        throw new Error('checkpoint anchor observation input changed');
      }
      return checkpointAnchorObservation;
    });
    mocked.checkpointAssert.mockImplementation(value => {
      order.push('checkpoint-anchor:assert');
      if (value !== checkpointAnchorObservation) {
        throw new Error('checkpoint anchor observation provenance changed');
      }
    });
    mocked.checkpointBoundObserve.mockImplementation(async input => {
      order.push('checkpoint-bound-tracker:observe');
      if (
        input.target.primaryNodeOrigin !== activeExecutionTarget().primaryNodeOrigin
        || input.target.witnessNodeOrigin
          !== activeExecutionTarget().witnessNodeOrigin
        || input.target.checkpointBound !== true
        || input.targetGenesisHeaderIdHex
          !== fundingObservation.target.genesisHeaderIdHex
        || input.expectedAnchorHeaderIdHex
          !== checkpointAnchorObservation.anchorHeaderIdHex
        || input.expectedAnchorHeight
          !== checkpointAnchorObservation.anchorHeight
        || input.expectedAnchorExtensionRootHex
          !== checkpointAnchorObservation.anchorExtensionRootHex
        || input.expectedExtensionValueHex
          !== checkpointAnchorObservation.extensionValueHex
      ) {
        throw new Error('checkpoint-bound tracker observation input changed');
      }
      return checkpointBoundObservation;
    });
    mocked.checkpointBoundAssert.mockImplementation(value => {
      order.push('checkpoint-bound-tracker:assert');
      if (value !== checkpointBoundObservation) {
        throw new Error('checkpoint-bound tracker observation provenance changed');
      }
    });
    mocked.checkpointBoundFrozenObserve.mockImplementation(async input => {
      order.push('checkpoint-bound-frozen-tracker:observe');
      if (
        input.target.primaryNodeOrigin !== frozenExecutionTarget().primaryNodeOrigin
        || input.target.witnessNodeOrigin
          !== frozenExecutionTarget().witnessNodeOrigin
        || input.target.primaryMining !== false
        || input.target.primaryReadOnly !== true
        || input.target.witnessReadOnly !== true
        || input.target.miningStopped !== true
        || input.target.checkpointBound !== true
        || input.targetGenesisHeaderIdHex
          !== fundingObservation.target.genesisHeaderIdHex
        || input.expectedAnchorHeaderIdHex
          !== checkpointAnchorObservation.anchorHeaderIdHex
        || input.expectedAnchorHeight
          !== checkpointAnchorObservation.anchorHeight
        || input.expectedAnchorExtensionRootHex
          !== checkpointAnchorObservation.anchorExtensionRootHex
        || input.expectedExtensionValueHex
          !== checkpointAnchorObservation.extensionValueHex
      ) {
        throw new Error(
          'checkpoint-bound frozen tracker observation input changed',
        );
      }
      return frozenCheckpointBoundObservation;
    });
    mocked.checkpointBoundFrozenAssert.mockImplementation(value => {
      order.push('checkpoint-bound-frozen-tracker:assert');
      if (value !== frozenCheckpointBoundObservation) {
        throw new Error(
          'checkpoint-bound frozen tracker observation provenance changed',
        );
      }
    });
    mocked.trackerReservationFreshnessObserve.mockImplementation(
      async input => {
        order.push('tracker-reservation-freshness:observe');
        if (
          input.target.primaryNodeOrigin
            !== trackerReservationFreshnessTarget().primaryNodeOrigin
          || input.target.witnessNodeOrigin
            !== trackerReservationFreshnessTarget().witnessNodeOrigin
          || input.target.primaryMining !== false
          || input.target.primaryReadOnly !== true
          || input.target.witnessReadOnly !== true
          || input.target.miningStopped !== true
          || input.target.checkpointBound !== true
          || input.target.reservationFreshnessRevalidation !== true
          || input.targetGenesisHeaderIdHex
            !== fundingObservation.target.genesisHeaderIdHex
          || input.expectedAnchorHeaderIdHex
            !== checkpointAnchorObservation.anchorHeaderIdHex
          || input.expectedAnchorHeight
            !== checkpointAnchorObservation.anchorHeight
          || input.expectedAnchorExtensionRootHex
            !== checkpointAnchorObservation.anchorExtensionRootHex
          || input.expectedExtensionValueHex
            !== checkpointAnchorObservation.extensionValueHex
        ) {
          throw new Error(
            'tracker reservation freshness observation input changed',
          );
        }
        return trackerReservationFreshnessObservation;
      },
    );
    mocked.trackerReservationFreshnessObserveAssert.mockImplementation(
      value => {
        order.push('tracker-reservation-freshness:observe:assert');
        if (value !== trackerReservationFreshnessObservation) {
          throw new Error(
            'tracker reservation freshness observation provenance changed',
          );
        }
      },
    );
    mocked.observedHeaderBuild.mockImplementation((_wasm, input) => {
      order.push('tracker:observed-headers:build');
      if (
        input.rawHeaders.length !== 10
        || input.anchorContextIndex
          !== checkpointBoundObservation.anchorContextIndex
        || input.expectedAnchorHeaderIdHex
          !== checkpointBoundObservation.anchorHeaderIdHex
        || input.expectedAnchorExtensionRootHex
          !== checkpointBoundObservation.anchorExtensionRootHex
      ) {
        throw new Error('observed tracker header input binding changed');
      }
      return observedHeaderContext;
    });
    mocked.packet.mockImplementation(() => ({
      signer: packetSigner(),
      dispose: vi.fn(() => order.push('dispose:packet')),
      produce: vi.fn(async () => {
        order.push('packet:produce');
        return {
          receipt: { receiptDigestHex: digest('9') },
          portableReplayInput: { packet: 'portable' },
        };
      }),
    }));
    mocked.packetContinuation.mockImplementation(() => ({
      signer: packetSigner(),
      dispose: vi.fn(() => order.push('dispose:packet-v2')),
      produce: vi.fn(async () => {
        order.push('packet-v2:produce');
        return packetV2;
      }),
      produceMintSourceProof: vi.fn((packet, input) => {
        order.push('peg-in:mint-proof:produce');
        if (
          packet !== packetV2
          || input.draft !== mintDraft
          || input.evidenceReceipt !== evidenceReceipt
        ) {
          throw new Error('mint-proof continuation input binding changed');
        }
        return packetProof;
      }),
    }));
    mocked.applicationRunnerPreflight.mockImplementation(input => {
      order.push('peg-in:application-runner:preflight');
      return Object.freeze({ ...input });
    });
    mocked.applicationCheckpointContinuation.mockImplementation(() => ({
      signer: packetSigner(),
      dispose: vi.fn(() => order.push('dispose:application-checkpoint-v3')),
      produce: vi.fn(async () => {
        order.push('packet-v3:produce');
        return packetV2;
      }),
      executeApplication: vi.fn(async (
        packet,
        input,
        completionDeadline,
      ) => {
        order.push('peg-in:application:execute');
        if (
          packet !== packetV2
          || input.mintSourceProofInput.draft !== mintDraft
          || input.mintSourceProofInput.evidenceReceipt !== evidenceReceipt
          || input.applicationRunnerInput.frontierSourceDirectory
            !== 'reviewed/frontier'
          || input.applicationRunnerInput.temporaryDirectoryRoot
            !== 'reviewed/frontier-temporary'
          || input.applicationRunnerInput.cargoDependencyCacheDirectory
            !== 'reviewed/frontier-cargo-cache'
          || !Number.isFinite(completionDeadline)
          || completionDeadline <= performance.now()
        ) {
          throw new Error(
            'application execution input binding changed',
          );
        }
        return applicationCheckpointStage;
      }),
      attestCheckpoint: vi.fn((application, checkpointAdmission) => {
        order.push('peg-in:checkpoint:attest');
        if (
          application !== applicationCheckpointStage
          || checkpointAdmission.validFromErgoHeight !== '220'
          || checkpointAdmission.expiresAtErgoHeight !== '284'
        ) {
          throw new Error('checkpoint attestation input binding changed');
        }
        return applicationCheckpointReceipt;
      }),
      complete: vi.fn(() => {
        throw new Error('legacy one-step completion must not be used');
      }),
    }));
    mocked.packetV2Assert.mockImplementation(value => {
      order.push('packet-v2:assert');
      if (value !== packetV2) {
        throw new Error('packet V2 provenance changed');
      }
    });
    mocked.mintDraftBuild.mockImplementation(input => {
      order.push('peg-in:mint-proof:draft');
      if (
        input.batch !== currentBatch
        || input.candidate.depositPacket === undefined
      ) {
        throw new Error('mint draft input binding changed');
      }
      return mintDraft;
    });
    mocked.evidenceCollect.mockImplementation(input => {
      order.push('peg-in:mint-proof:evidence');
      if (input.draft !== mintDraft) {
        throw new Error('committed-reserve evidence draft binding changed');
      }
      return evidenceReceipt;
    });
    mocked.frontierConsumerPreflight.mockImplementation(input => {
      order.push('peg-in:mint-proof:consumer:preflight');
      return Object.freeze({ ...input });
    });
    mocked.frontierConsumer.mockImplementation(async (
      input,
      completionDeadline,
    ) => {
      order.push('peg-in:mint-proof:consumer');
      if (
        input.proofReceipt !== packetProof
        || input.offline !== true
        || !Number.isFinite(completionDeadline)
        || completionDeadline <= performance.now()
        || completionDeadline - performance.now() > 30 * 60_000
      ) {
        throw new Error('Frontier mint-proof consumer input binding changed');
      }
      return consumerReceipt;
    });
    mocked.frontierConsumerAssert.mockImplementation(value => {
      order.push('peg-in:mint-proof:consumer:assert');
      if (value !== consumerReceipt) {
        throw new Error('Frontier mint-proof consumer provenance changed');
      }
    });
    mocked.applicationCheckpointAssert.mockImplementation(value => {
      order.push('peg-in:application-checkpoint:assert');
      if (value !== applicationCheckpointReceipt) {
        throw new Error('application-checkpoint provenance changed');
      }
    });
    mocked.materializeUnsigned.mockImplementation(async (transaction, label) => {
      order.push('tracker:setup:materialize');
      if (
        transaction
          !== currentBatch.orderedTransactions[0]!.issuance
            .unsignedTransactionBody
        || label !== 'isolated devnet tracker setup transaction'
      ) {
        throw new Error('tracker setup materialization input binding changed');
      }
      return trackerSetupMaterial;
    });
    mocked.trackerBuild.mockImplementation(async input => {
      order.push('tracker:candidate:build');
      if (
        input.compilerRequest
          !== currentBatch.trackerCompilerBinding.request
        || input.compilerReceipt
          !== currentBatch.trackerCompilerBinding.receipt
        || input.trackerInputBox !== trackerSetupMaterial.outputs[0]
        || input.encodedStatementHex
          !== applicationCheckpointReceipt.checkpoint.checkpointAttestation
            .checkpointStatement.encodedStatementHex
        || input.currentErgoHeight !== 221
        || input.anchorContextIndex !== 0
      ) {
        throw new Error('tracker candidate producer binding changed');
      }
      return trackerContext;
    });
    mocked.observedTrackerBuild.mockImplementation(async input => {
      order.push('tracker:observed-candidate:build');
      if (
        input.compilerRequest !== currentBatch.trackerCompilerBinding.request
        || input.compilerReceipt !== currentBatch.trackerCompilerBinding.receipt
        || input.trackerInputBox !== trackerSetupMaterial.outputs[0]
        || input.encodedStatementHex
          !== applicationCheckpointReceipt.checkpoint.checkpointAttestation
            .checkpointStatement.encodedStatementHex
        || input.observedHeaderContext !== observedHeaderContext
        || input.extensionMembershipProofHex
          !== checkpointBoundObservation.extensionMembershipProofHex
      ) {
        throw new Error('observed tracker candidate input binding changed');
      }
      return observedTrackerContext;
    });
    mocked.trackerAssert.mockImplementation(value => {
      if (value !== observedTrackerContext) {
        throw new Error('observed tracker context provenance changed');
      }
    });
    mocked.observedTrackerCheck.mockImplementation(async (input, target) => {
      order.push('tracker:observed-candidate:check');
      if (
        input.context !== observedTrackerContext
        || input.observedHeaderContext !== observedHeaderContext
        || input.trackerInputBox !== trackerSetupMaterial.outputs[0]
        || target.primaryNodeOrigin !== activeExecutionTarget().primaryNodeOrigin
        || target.witnessNodeOrigin !== activeExecutionTarget().witnessNodeOrigin
        || target.primaryMining !== true
        || target.witnessReadOnly !== true
        || target.checkpointBound !== true
      ) {
        throw new Error('observed tracker check input binding changed');
      }
      return observedTrackerCheck;
    });
    mocked.observedTrackerCheckAssert.mockImplementation(value => {
      if (value !== observedTrackerCheck) {
        throw new Error('observed tracker check provenance changed');
      }
    });
    mocked.observedFrozenTrackerCheck.mockImplementation(async (
      input,
      target,
    ) => {
      order.push('tracker:frozen-observed-candidate:check');
      if (
        input.context !== observedTrackerContext
        || input.observedHeaderContext !== observedHeaderContext
        || input.trackerInputBox !== trackerSetupMaterial.outputs[0]
        || target.primaryNodeOrigin !== frozenExecutionTarget().primaryNodeOrigin
        || target.witnessNodeOrigin !== frozenExecutionTarget().witnessNodeOrigin
        || target.primaryMining !== false
        || target.primaryReadOnly !== true
        || target.witnessReadOnly !== true
        || target.miningStopped !== true
        || target.checkpointBound !== true
      ) {
        throw new Error('frozen observed tracker check input binding changed');
      }
      return frozenObservedTrackerCheck;
    });
    mocked.observedFrozenTrackerCheckAssert.mockImplementation(value => {
      if (value !== frozenObservedTrackerCheck) {
        throw new Error('frozen observed tracker check provenance changed');
      }
    });
    mocked.trackerReservationFreshnessCheck.mockImplementation(async (
      input,
      target,
    ) => {
      order.push('tracker-reservation-freshness:check');
      if (
        input.context !== observedTrackerContext
        || input.observedHeaderContext !== observedHeaderContext
        || input.trackerInputBox !== trackerSetupMaterial.outputs[0]
        || target.primaryNodeOrigin
          !== trackerReservationFreshnessTarget().primaryNodeOrigin
        || target.witnessNodeOrigin
          !== trackerReservationFreshnessTarget().witnessNodeOrigin
        || target.primaryMining !== false
        || target.primaryReadOnly !== true
        || target.witnessReadOnly !== true
        || target.miningStopped !== true
        || target.checkpointBound !== true
        || target.reservationFreshnessRevalidation !== true
      ) {
        throw new Error(
          'tracker reservation freshness check input binding changed',
        );
      }
      return trackerReservationFreshnessCheck;
    });
    mocked.trackerReservationFreshnessCheckAssert.mockImplementation(
      value => {
        if (value !== trackerReservationFreshnessCheck) {
          throw new Error(
            'tracker reservation freshness check provenance changed',
          );
        }
      },
    );
    mocked.trackerReservationFreshnessCompletionClaim.mockImplementation(
      value => {
        order.push('tracker-transport:freshness:claim');
        if (value !== trackerReservationFreshnessCheck) {
          throw new Error('tracker freshness completion input changed');
        }
        return TRACKER_RESERVATION_FRESHNESS_COMPLETION;
      },
    );
    mocked.trackerReservationFreshnessPromote.mockImplementation(
      (value, target) => {
        order.push('tracker-transport:freshness:promote');
        if (
          value !== trackerReservationFreshnessCheck
          || target.trackerTransport !== true
          || target.reservationFreshnessCheckBound !== true
        ) {
          throw new Error('tracker freshness promotion input changed');
        }
        return trackerTransportExecutionCheck;
      },
    );
    mocked.trackerTransportAuthorize.mockImplementation(input => {
      order.push('tracker-transport:authorize');
      if (
        input.executionCheck !== trackerTransportExecutionCheck
        || input.target.trackerTransport !== true
        || input.target.reservationFreshnessCheckBound !== true
        || input.durableReservation?.bindings?.unsignedTransactionIdHex
          !== trackerReservationFreshnessCheck.unsignedTransactionIdHex
      ) {
        throw new Error('tracker transport authorization input changed');
      }
      return trackerTransportAuthorization;
    });
    mocked.trackerTransportJournalCreate.mockImplementation(input => {
      order.push('tracker-transport:journal:create');
      if (
        input.durableReservation?.bindings?.unsignedTransactionIdHex
          !== trackerReservationFreshnessCheck.unsignedTransactionIdHex
      ) {
        throw new Error('tracker transport journal input changed');
      }
      return trackerTransportJournal;
    });
    mocked.trackerTransportPreflight.mockImplementation(input => {
      order.push('tracker-transport:preflight');
      if (
        input.requestBinding !== TRACKER_TRANSPORT_REQUEST_CAMPAIGN_BINDING
        || input.relayerLineage !== packetRelayerLineage
        || input.target.trackerTransport !== true
        || input.executionCheck !== trackerTransportExecutionCheck
        || input.authorization !== trackerTransportAuthorization
        || input.journal !== trackerTransportJournal
        || input.attempt !== trackerTransportAttempt
      ) {
        throw new Error('tracker transport preflight input changed');
      }
      return trackerTransportPreflight;
    });
    mocked.trackerTransportSubmit.mockImplementation(async input => {
      order.push('tracker-transport:post');
      if (
        input.target.trackerTransport !== true
        || input.target.reservationFreshnessCheckBound !== true
        || input.executionCheck !== trackerTransportExecutionCheck
        || input.authorization !== trackerTransportAuthorization
        || input.journal !== trackerTransportJournal
        || input.attempt !== trackerTransportAttempt
        || input.preflight !== trackerTransportPreflight
      ) {
        throw new Error('tracker transport submission input changed');
      }
      return Object.freeze({
        status: 'accepted' as const,
        submittedTransactionIdHex:
          trackerReservationFreshnessCheck.signedTransactionIdHex,
        responseDigestHex: digest('4'),
      });
    });
    mocked.process.mockReturnValue(processSession);
    mocked.sourceHistory.mockImplementation(async () => {
      order.push('source:history');
      return { source: 'history' };
    });
    mocked.rewardDiscovery.mockImplementation(async () => {
      rewardDiscoveryCount += 1;
      if (rewardDiscoveryCount === 1) {
        order.push('ergo:rewards');
        return { rewards: 'observed' };
      }
      if (rewardDiscoveryCount === 2) {
        order.push('ergo:rewards:peg-in');
        return fundingObservation;
      }
      if (rewardDiscoveryCount === 3) {
        order.push('ergo:rewards:peg-in:revalidate');
        return postCandidateFundingObservation;
      }
      if (rewardDiscoveryCount === 4) {
        order.push('ergo:rewards:peg-in:post-check');
        return postCheckFundingObservation;
      }
      order.push('ergo:rewards:peg-in:pre-transport');
      return preTransportFundingObservation;
    });
    mocked.ownedRewardDiscovery.mockImplementation(async () => ({
      schema:
        'e2s.substrate-federated-isolated-devnet-owned-reward-input-discovery.v1',
      observation: await mocked.rewardDiscovery(),
      processBindingDigestHex:
        currentBatch.targetBinding.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        currentBatch.targetBinding.executionTargetIdentityDigestHex,
    }));
    mocked.rewardDiscoveryAssert.mockImplementation(value => {
      order.push('peg-in:funding:assert');
      if (
        value !== fundingObservation
        && value !== postCandidateFundingObservation
        && value !== postCheckFundingObservation
        && value !== preTransportFundingObservation
      ) {
        throw new Error('funding observation provenance changed');
      }
    });
    mocked.ergoHistory.mockImplementation(async () => {
      order.push('ergo:history');
      return { ergo: 'history' };
    });
    mocked.familyDecode.mockReturnValue(validFamilyProfile());
    mocked.revalidator.mockReturnValue({
      revalidate: vi.fn(async (_checked, phase) => ({
        sourceBoxId: digest('1'),
        sourceBoxUnspent: true,
        targetGenesisHeaderIdHex: digest('a'),
        observedAtHeight: phase === 'post-check' ? 120 : 121,
        observedTipHeaderIdHex: digest('b'),
        sourceBoxDigestHex: digest('c'),
        sourceBoxSigmaSerializedSha256Hex: digest('d'),
        observationDigestHex: phase === 'post-check' ? digest('e') : digest('f'),
        revalidationArtifact: {},
      })),
    });
    mocked.observer.mockReturnValue(observerPort);
    mocked.authorizer.mockReturnValue(authorizerPort);
    mocked.assertConfirmed.mockImplementation(authorizer => {
      if (authorizer !== authorizerPort || authorizer.nextOrdinal() !== 3) {
        throw new Error('setup not confirmed');
      }
    });
    mocked.transport.mockReturnValue({
      submit: vi.fn(async attempt => {
        const role = attempt.candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`transport:${role}`);
        return {
          status: 'accepted',
          submittedTxId: attempt.candidate.authorization.revalidated.checked
            .signed.admission.expectedTxId,
          responseDigestHex: digest('8'),
        };
      }),
    });
    mocked.journal.mockReturnValue(journalPort);
    mocked.execute.mockImplementation(executeThroughPorts(order));
    mocked.pegInCandidateBuild.mockImplementation(async input => {
      order.push('peg-in:candidate:build');
      return validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      );
    });
    mocked.pegInCandidateAssert.mockImplementation(candidate => {
      order.push('peg-in:candidate:assert');
      return candidate.depositPacket;
    });
    mocked.pegInSourceLockCheck.mockImplementation(async input => {
      order.push('peg-in:source-lock:check');
      return validPegInSourceLockCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInSourceLockRetainingCheck.mockImplementation(async input => {
      order.push('peg-in:source-lock:check:retain-signer');
      return validPegInSourceLockCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInSourceLockPromote.mockImplementation(receipt => {
      order.push('peg-in:source-lock:promote');
      return validPegInSourceLockExecutionCheck(receipt);
    });
    mocked.pegInSourceLockDiscard.mockImplementation(() => {
      order.push('peg-in:source-lock:discard');
    });
    mocked.pegInSourceLockAuthorizer.mockImplementation(() => ({
      schema:
        'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer.v1',
      revalidationDigestHex: digest('2'),
      authorize: vi.fn(revalidated => {
        order.push('peg-in:source-lock:authorize');
        return {
          authorizationDigestHex: digest('3'),
          authorizationArtifact: { revalidated },
        };
      }),
    }));
    mocked.pegInSourceLockTransport.mockImplementation(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:source-lock:transport');
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('4'),
        };
      }),
    }));
    let sourceLockReconciliationCount = 0;
    mocked.pegInSourceLockJournal.mockImplementation(() => ({
      journal: {
        reserve: vi.fn(authorization => {
          order.push('peg-in:source-lock:journal:reserve');
          return {
            durableAttemptDigestHex: digest('5'),
            durableArtifact: { authorization },
          };
        }),
        finalize: vi.fn(({ submission }) => {
          order.push('peg-in:source-lock:journal:finalize');
          return {
            status: submission.status,
            journalDigestHex: digest('6'),
          };
        }),
      },
      reconcileActive: vi.fn(async () => {
        sourceLockReconciliationCount += 1;
        const status = sourceLockReconciliationCount === 1
          ? 'none' as const
          : 'confirmed' as const;
        order.push(`peg-in:source-lock:journal:reconcile:${status}`);
        return status;
      }),
      revalidateConfirmed: vi.fn(async () => {
        order.push('peg-in:source-lock:journal:revalidate');
        return 1;
      }),
    }));
    mocked.pegInSourceLockOutputObserve.mockImplementation(async () => {
      order.push('peg-in:source-lock:outputs');
      return validPegInSourceLockOutputObservation();
    });
    mocked.pegInSourceLockOutputAssert.mockImplementation(value => {
      if (value.schema
        !== 'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1') {
        throw new Error('source-lock output observation changed');
      }
    });
    mocked.pegInCommittedVaultCheck.mockImplementation(async input => {
      order.push('peg-in:committed-vault:check');
      return validPegInCommittedVaultCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInCommittedVaultRetainingCheck.mockImplementation(async input => {
      order.push('peg-in:committed-vault:check:retain-signer');
      return validPegInCommittedVaultCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInCommittedVaultPromote.mockImplementation(receipt => {
      order.push('peg-in:committed-vault:promote');
      return validPegInCommittedVaultExecutionCheck(receipt);
    });
    mocked.pegInCommittedVaultAuthorizationSession.mockImplementation(() => {
      const preTransportObservation =
        validPegInCommittedVaultPreTransportObservation();
      return {
        revalidator: {
          revalidate: vi.fn(async () => {
            order.push('peg-in:committed-vault:revalidate');
            return { revalidationDigestHex: digest('a') };
          }),
        },
        broadcastAuthorizer: {
          schema:
            'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer.v1',
          authorize: vi.fn(revalidated => {
            order.push('peg-in:committed-vault:authorize');
            return {
              authorizationDigestHex: digest('b'),
              authorizationArtifact: { revalidated },
            };
          }),
        },
        takePreTransportObservation: vi.fn(() => {
          order.push('peg-in:committed-vault:take-pre-transport');
          return preTransportObservation;
        }),
      };
    });
    mocked.pegInCommittedVaultTransport.mockImplementation(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:committed-vault:transport');
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('c'),
        };
      }),
    }));
    let committedVaultReconciliationCount = 0;
    const latestCommittedVaultConfirmation = Object.freeze({
      ...confirmation(digest('9'), 4, 1),
      confirmationHeight: 139,
      observedAtHeight: 141,
    });
    const outputBoundCommittedVaultConfirmation = Object.freeze({
      ...latestCommittedVaultConfirmation,
      confirmationHeight: 140,
      observedAtHeight: 142,
      confirmationHeaderIdHex: digest('7'),
      observationDigestHex: digest('8'),
    });
    mocked.pegInCommittedVaultJournal.mockImplementation(() => ({
      journal: {
        reserve: vi.fn(authorization => {
          order.push('peg-in:committed-vault:journal:reserve');
          return {
            durableAttemptDigestHex: digest('d'),
            durableArtifact: { authorization },
          };
        }),
        finalize: vi.fn(({ submission }) => {
          order.push('peg-in:committed-vault:journal:finalize');
          return {
            status: submission.status,
            journalDigestHex: digest('e'),
          };
        }),
      },
      reconcileActive: vi.fn(async () => {
        committedVaultReconciliationCount += 1;
        const status = committedVaultReconciliationCount === 1
          ? 'none' as const
          : 'confirmed' as const;
        order.push(`peg-in:committed-vault:journal:reconcile:${status}`);
        return status;
      }),
      revalidateConfirmed: vi.fn(async () => {
        order.push('peg-in:committed-vault:journal:revalidate');
        return [latestCommittedVaultConfirmation];
      }),
    }));
    mocked.pegInCommittedVaultOutputObserve.mockImplementation(async input => {
      order.push('peg-in:committed-vault:outputs');
      if (input.confirmation !== latestCommittedVaultConfirmation) {
        throw new Error('stale committed-vault confirmation was consumed');
      }
      return validPegInCommittedVaultOutputObservation(
        outputBoundCommittedVaultConfirmation,
      );
    });
    mocked.pegInCommittedVaultOutputAssert.mockImplementation(value => {
      if (value.schema
        !== 'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1') {
        throw new Error('committed-vault output observation changed');
      }
    });
  });

  it('broadcasts and confirms the exact three setup roles in canonical order', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      );

    expect(order).toEqual([
      'build',
      'setup',
      'mining:start',
      'execution:enter',
      'source:history',
      'ergo:rewards',
      'ergo:history',
      'packet:produce',
      'setup:execution',
      'execute:tracker',
      'authorize:tracker',
      'journal:reserve:tracker',
      'transport:tracker',
      'journal:finalize:tracker',
      'observe:tracker',
      'journal:reconcile',
      'ack:tracker',
      'execute:duplicatePrevention',
      'authorize:duplicatePrevention',
      'journal:reserve:duplicatePrevention',
      'transport:duplicatePrevention',
      'journal:finalize:duplicatePrevention',
      'observe:duplicatePrevention',
      'journal:reconcile',
      'ack:duplicatePrevention',
      'execute:pooledReserve',
      'authorize:pooledReserve',
      'journal:reserve:pooledReserve',
      'transport:pooledReserve',
      'journal:finalize:pooledReserve',
      'observe:pooledReserve',
      'journal:reconcile',
      'ack:pooledReserve',
      'journal:revalidate',
      'observe:tracker',
      'observe:duplicatePrevention',
      'observe:pooledReserve',
      'execution:leave',
      'dispose:packet',
      'dispose:setup',
      'process:stop',
    ]);
    expect(result.receipt.status)
      .toBe('three_local_setup_transactions_canonically_confirmed');
    expect(result.receipt.staticExecutionManifestDigestHex)
      .toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      );
    expect(result.receipt.transactions.map(value => value.role)).toEqual([
      'tracker',
      'duplicatePrevention',
      'pooledReserve',
    ]);
    expect(result.receipt.transactions.map(value => value.confirmationHeight))
      .toEqual([120, 121, 122]);
    expect(result.receipt.checks.durableReservationPrecededTransport).toBe(true);
    expect(result.receipt.boundaries.localSetupBroadcastExecuted).toBe(true);
    expect(result.receipt.boundaries.publicNetworkUsed).toBe(false);
    expect(result.receipt.boundaries.gate5Closed).toBe(false);
    expect(result.receipt.boundaries.trustlessStatusEstablished).toBe(false);
    expect(result.receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u,
    );
  });

  it('constructs one unsigned peg-in candidate after fresh same-lifetime funding observation', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('ack:pooledReserve')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in'),
    );
    expect(order.indexOf('peg-in:funding:assert')).toBeLessThan(
      order.indexOf('peg-in:candidate:build'),
    );
    expect(order.indexOf('peg-in:candidate:build')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:revalidate'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:revalidate')).toBeLessThan(
      order.lastIndexOf('journal:revalidate'),
    );
    expect(order.lastIndexOf('journal:revalidate')).toBeLessThan(
      order.indexOf('execution:leave'),
    );
    expect(journalPort.revalidateConfirmed).toHaveBeenCalledTimes(2);
    expect(mocked.assertConfirmed).toHaveBeenCalledTimes(2);
    expect(mocked.rewardDiscoveryAssert).toHaveBeenCalledTimes(2);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: currentBatch,
        sourceFundingInput: fundingObservation.genesisInputs.tracker,
        depositorErgoTreeHex: setupSigner().p2pkErgoTreeHex,
        creationHeights: {
          currentErgoHeight: fundingObservation.target.tipHeight,
          sourceLockCreation: fundingObservation.target.tipHeight,
          reserveTransition: fundingObservation.target.tipHeight,
        },
        sourceIntent: expect.objectContaining({
          amountNanoErg: '5000000',
          recipientAddressHex: 'b1'.repeat(20),
        }),
      }),
    );
    expect(result.receipt).toMatchObject({
      status: 'setup_confirmed_and_unsigned_peg_in_candidate_constructed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        setupAndFundingObservedInOneTargetLifetime: true,
        allSetupLineagesRevalidatedAfterCandidateConstruction: true,
        exactDualNodeFundingObservationConsumed: true,
        sourceFundingDistinctFromSetupInputsAndOutputs: true,
        sourceFundingRevalidatedAfterCandidateConstruction: true,
        deterministicUnsignedCandidateConstructed: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localSetupCanonicalConfirmationEstablished: true,
        localSourceFundingObservationEstablished: true,
        localSourceFundingReobservationEstablished: true,
        valuePathNodeCheckPerformed: false,
        valuePathSigningAuthorityEstablished: false,
        valuePathSubmissionAuthorityEstablished: false,
        valuePathBroadcastAuthorityEstablished: false,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.receipt.pegIn.fundingObservation.sourceFundingBoxIdHex)
      .toBe(fundingObservation.genesisInputs.tracker.boxId);
    expect(result.receipt.pegIn.fundingObservation.postCandidateReportDigestHex)
      .toBe(postCandidateFundingObservation.reportDigestHex);
    expect(result.receipt.pegIn.fundingObservation.postCandidateTipHeight)
      .toBe(131);
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
    expect(containsFunction(result)).toBe(false);
  });

  it('signs and JVM-checks the exact source-lock candidate without exposing submission', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('setup:execution:retain-peg-in-signer')).toBeLessThan(
      order.indexOf('peg-in:source-lock:check'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:revalidate')).toBeLessThan(
      order.indexOf('peg-in:source-lock:check'),
    );
    expect(order.indexOf('peg-in:source-lock:check')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:post-check'),
    );
    expect(mocked.pegInSourceLockCheck).toHaveBeenCalledTimes(1);
    expect(mocked.pegInSourceLockCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFundingBoxIdHex: fundingObservation.genesisInputs.tracker.boxId,
        unsignedTransaction: expect.objectContaining({ txId: digest('8') }),
      }),
      executionTarget(),
    );
    expect(mocked.rewardDiscoveryAssert).toHaveBeenCalledTimes(3);
    expect(result.receipt).toMatchObject({
      status: 'setup_confirmed_and_peg_in_source_lock_node_check_passed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        setupCandidateAndCheckCompletedInOneTargetLifetime: true,
        exactCandidateFundingAndUnsignedTransactionBound: true,
        sourceFundingRevalidatedImmediatelyBeforeSigning: true,
        sourceFundingRevalidatedAfterNodeCheck: true,
        exactSameNodeSigningContextAndJvmCheckUsed: true,
        signedTransactionBytesReturnedOrPersisted: false,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        valuePathLocalSyntheticSigningPerformed: true,
        valuePathJvmNodeCheckPassed: true,
        valuePathSubmissionAuthorityEstablished: false,
        valuePathBroadcastAuthorityEstablished: false,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.receipt.pegIn.fundingObservation.postCheckReportDigestHex)
      .toBe(postCheckFundingObservation.reportDigestHex);
    expect(result.receipt.pegIn.sourceLockCheck.signedTransactionIdHex)
      .toBe(digest('8'));
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('reserves, submits, confirms, and observes only the refundable source-lock creation', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('peg-in:source-lock:check')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:pre-transport'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:pre-transport')).toBeLessThan(
      order.indexOf('peg-in:source-lock:promote'),
    );
    expect(order.indexOf('peg-in:source-lock:journal:reserve')).toBeLessThan(
      order.indexOf('peg-in:source-lock:transport'),
    );
    expect(order.indexOf('peg-in:source-lock:transport')).toBeLessThan(
      order.indexOf('observe:sourceLock'),
    );
    expect(order.indexOf('observe:sourceLock')).toBeLessThan(
      order.indexOf('peg-in:source-lock:outputs'),
    );
    expect(mocked.pegInSourceLockPromote).toHaveBeenCalledTimes(1);
    expect(mocked.pegInSourceLockDiscard).not.toHaveBeenCalled();
    expect(mocked.pegInSourceLockOutputObserve).toHaveBeenCalledWith({
      target: executionTarget(),
      batch: currentBatch,
      candidate: expect.any(Object),
      confirmation: expect.objectContaining({
        status: 'confirmed',
        confirmationHeight: 135,
      }),
    });
    expect(result.receipt).toMatchObject({
      status: 'peg_in_source_lock_creation_canonically_confirmed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        exactCheckedCandidatePromotedOnce: true,
        sourceFundingRevalidatedImmediatelyBeforeAuthorization: true,
        durableReservationPrecededTransport: true,
        exactLoopbackTransportConsumedCheckedBytesOnce: true,
        canonicalConfirmationObservedByBothNodes: true,
        exactSourceSpentAndOutputsObserved: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        valuePathSubmissionExecuted: true,
        valuePathBroadcastExecuted: true,
        sourceLockCreationConfirmed: true,
        sourceLockStillRefundable: true,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      pegIn: {
        fundingObservation: {
          preTransportReportDigestHex:
            preTransportFundingObservation.reportDigestHex,
          preTransportTipHeight: 133,
        },
        sourceLockExecution: {
          expectedTxId: digest('8'),
          transportStatus: 'accepted',
          durableAttemptDigestHex: digest('5'),
          journalDigestHex: digest('6'),
          outputObservation: {
            status: 'exact_source_spent_and_refundable_outputs_unspent',
          },
        },
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('starts a fresh bounded confirmation window after source-lock transport', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const baselineObserve = observerPort.observe.getMockImplementation();
    if (baselineObserve === undefined) {
      throw new Error('observer mock is unavailable');
    }
    let sourceLockPending = true;
    observerPort.observe.mockImplementation(async (...args) => {
      if (args[0] === digest('8') && sourceLockPending) {
        sourceLockPending = false;
        order.push('observe:sourceLock:pending');
        now += 60_000;
        return {
          status: 'pending' as const,
          confirmations: 1,
          observedAtHeight: 135,
          observationDigestHex: digest('2'),
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          observerArtifact: {},
        };
      }
      return await baselineObserve(...args);
    });
    mocked.pegInSourceLockTransport.mockImplementationOnce(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:source-lock:transport');
        now = 9 * 60_000 + 1;
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('4'),
        };
      }),
    }));

    try {
      const result =
        await runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
          pegInRootInput(),
        );

      expect(result.receipt.status)
        .toBe('peg_in_source_lock_creation_canonically_confirmed');
      expect(order).toContain('observe:sourceLock:pending');
      expect(order).toContain('peg-in:source-lock:outputs');
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects a confirmation returned after its monotonic transaction window', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const baselineObserve = observerPort.observe.getMockImplementation();
    if (baselineObserve === undefined) {
      throw new Error('observer mock is unavailable');
    }
    observerPort.observe.mockImplementation(async (...args) => {
      const observation = await baselineObserve(...args);
      if (args[0] === digest('8')) now += 2 * 60_000 + 1;
      return observation;
    });

    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
          pegInRootInput(),
        ),
      ).rejects.toThrow(/source-lock transaction confirmation exceeded its deadline/);
      expect(order).toContain('peg-in:source-lock:transport');
      expect(order).not.toContain('peg-in:source-lock:outputs');
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('consumes the confirmed source lock into the exact committed reserve and stops before mint', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1(
        pegInRootInput(),
      );

    expect(mocked.pegInSourceLockCheck).not.toHaveBeenCalled();
    expect(mocked.pegInSourceLockRetainingCheck).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:source-lock:outputs')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:check'),
    );
    expect(order.indexOf('peg-in:committed-vault:check')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:promote'),
    );
    expect(order.indexOf('peg-in:committed-vault:revalidate')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:authorize'),
    );
    expect(order.indexOf('peg-in:committed-vault:authorize')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:journal:reserve'),
    );
    expect(order.indexOf('peg-in:committed-vault:journal:reserve')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:transport'),
    );
    expect(order.indexOf('peg-in:committed-vault:transport')).toBeLessThan(
      order.indexOf('observe:committedVault'),
    );
    expect(order.indexOf('observe:committedVault')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:outputs'),
    );
    expect(mocked.pegInCommittedVaultCheck).toHaveBeenCalledWith({
      reservePredecessorBoxIdHex: digest('a'),
      sourceLockBoxIdHex: digest('b'),
      transitionFeeFundingBoxIdHex: digest('d'),
      unsignedTransaction: expect.objectContaining({ txId: digest('9') }),
    }, executionTarget());
    expect(result.receipt).toMatchObject({
      status: 'peg_in_source_lock_consumed_into_committed_reserve',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        sourceLockConfirmedBeforeCommittedVaultCheck: true,
        exactThreeInputTransitionCheckedAndRevalidated: true,
        freshJvmCheckPrecededAuthorization: true,
        durableReservationPrecededTransport: true,
        exactTransitionInputsSpentAndReserveSuccessorObserved: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        sourceLockCreationConfirmed: true,
        sourceLockStillRefundable: false,
        sourceLockConsumptionEstablished: true,
        reserveLineageEstablished: true,
        depositCommitmentStateEstablished: true,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      pegIn: {
        committedVaultCheck: {
          status: 'PASS',
          unsignedTransactionIdHex: digest('9'),
        },
        committedVaultExecution: {
          expectedTxId: digest('9'),
          transportStatus: 'accepted',
          durableAttemptDigestHex: digest('d'),
          journalDigestHex: digest('e'),
          confirmationDigestHex: digest('8'),
          confirmationHeight: 140,
          confirmationHeaderIdHex: digest('7'),
          preTransportObservation: {
            observedTipHeight: 136,
          },
          outputObservation: {
            status:
              'exact_transition_inputs_spent_and_reserve_successor_unspent',
            boundaries: {
              sourceLockConsumptionEstablished: true,
              reserveLineageEstablished: true,
              mintAuthorized: false,
              gate5Closed: false,
            },
          },
        },
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('consumes one exact committed-reserve proof in Frontier before tearing down the campaign', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
        pegInMintProofRootInput(),
      );

    expect(mocked.packet).not.toHaveBeenCalled();
    expect(mocked.packetContinuation).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:mint-proof:consumer:preflight')).toBeLessThan(
      order.indexOf('build'),
    );
    expect(mocked.pegInSourceLockCheck).not.toHaveBeenCalled();
    expect(mocked.pegInSourceLockRetainingCheck).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:committed-vault:outputs')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:draft'),
    );
    expect(order.indexOf('peg-in:mint-proof:draft')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:evidence'),
    );
    expect(order.indexOf('peg-in:mint-proof:evidence')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:produce'),
    );
    expect(order.indexOf('peg-in:mint-proof:produce')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:consumer'),
    );
    expect(order.indexOf('peg-in:mint-proof:consumer:assert')).toBeLessThan(
      order.indexOf('execution:leave'),
    );
    expect(order.indexOf('execution:leave')).toBeLessThan(
      order.indexOf('dispose:packet-v2'),
    );
    expect(mocked.mintDraftBuild).toHaveBeenCalledWith({
      batch: currentBatch,
      target: executionTarget(),
      candidate: expect.objectContaining({ depositPacket: expect.any(Object) }),
      committedVaultObservation: expect.objectContaining({
        confirmationHeight: 140,
      }),
    });
    expect(mocked.evidenceCollect).toHaveBeenCalledWith({
      batch: currentBatch,
      target: executionTarget(),
      candidate: expect.objectContaining({ depositPacket: expect.any(Object) }),
      committedVaultObservation: expect.objectContaining({
        confirmationHeight: 140,
      }),
      draft: mintDraft,
    });
    const continuation = mocked.packetContinuation.mock.results[0]!.value;
    expect(continuation.produceMintSourceProof).toHaveBeenCalledWith(
      packetV2,
      {
        draft: mintDraft,
        evidenceReceipt,
        issuedAtNativeHeight:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
        expiresAtNativeHeight:
          (
            BigInt(
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
            )
            + BigInt(
              SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
            )
          ).toString(),
      },
    );
    expect(mocked.frontierConsumer).toHaveBeenCalledWith(
      {
        frontierSourceDirectory: 'reviewed/frontier',
        cargoExecutablePath: 'reviewed/cargo.exe',
        rustcExecutablePath: 'reviewed/rustc.exe',
        gitExecutablePath: 'reviewed/git.exe',
        offline: true,
        proofReceipt: packetProof,
      },
      expect.any(Number),
    );
    expect(result.receipt).toMatchObject({
      status: 'committed_reserve_proof_consumed_by_frontier_lab',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      mintProof: {
        draft: mintDraft,
        evidenceReceipt,
        packetProof,
        consumerReceipt,
      },
      checks: {
        committedReserveAndProofConsumedInOneTargetLifetime: true,
        compatibilityPacketReplacedByBoundContinuationV2: true,
        exactCommittedReserveBoundToMintStatement: true,
        exactCollectedEvidenceBoundToPacketProof: true,
        exactPacketProofConsumedByFrontier: true,
        everyEphemeralCapabilityDisposedBeforeReturn: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        sourceLockConsumptionEstablished: true,
        reserveLineageEstablished: true,
        depositCommitmentStateEstablished: true,
        sourceEvidenceCollectionProvenanceEstablished: true,
        frontierTestClientReservationAndMintExecuted: true,
        externalTargetNodeAcceptanceEstablished: false,
        sourceCanonicalityIndependentlyVerified: false,
        ergoPowAuthenticated: false,
        profileActivated: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );

  });

  it('retains one exact packet through the real application burn and checkpoint composition', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
        pegInApplicationCheckpointRootInput(),
      );

    expect(mocked.packet).not.toHaveBeenCalled();
    expect(mocked.packetContinuation).not.toHaveBeenCalled();
    expect(mocked.applicationCheckpointContinuation).toHaveBeenCalledTimes(1);
    expect(mocked.sourceHistory).toHaveBeenCalledWith(
      expect.anything(),
      {
        temporaryDirectoryRoot: 'reviewed/frontier-temporary',
        sharedCargoHomeRoot: 'reviewed/frontier-cargo-cache',
      },
    );
    expect(order.indexOf('peg-in:application-runner:preflight')).toBeLessThan(
      order.indexOf('build'),
    );
    expect(order.indexOf('peg-in:committed-vault:outputs')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:draft'),
    );
    expect(order.indexOf('peg-in:mint-proof:draft')).toBeLessThan(
      order.indexOf('peg-in:mint-proof:evidence'),
    );
    expect(order.indexOf('peg-in:mint-proof:evidence')).toBeLessThan(
      order.indexOf('peg-in:application:execute'),
    );
    expect(order.indexOf('peg-in:application:execute')).toBeLessThan(
      order.indexOf('observe:committedVault:post-application'),
    );
    expect(order.indexOf('observe:committedVault:post-application')).toBeLessThan(
      order.indexOf('peg-in:checkpoint:attest'),
    );
    expect(order.indexOf('peg-in:checkpoint:attest')).toBeLessThan(
      order.indexOf('peg-in:application-checkpoint:assert'),
    );
    expect(order.indexOf('peg-in:application-checkpoint:assert')).toBeLessThan(
      order.indexOf('dispose:application-checkpoint-v3'),
    );
    expect(order.indexOf('dispose:application-checkpoint-v3')).toBeLessThan(
      order.lastIndexOf('peg-in:application-checkpoint:assert'),
    );
    const continuation =
      mocked.applicationCheckpointContinuation.mock.results[0]!.value;
    expect(continuation.executeApplication).toHaveBeenCalledWith(
      packetV2,
      {
        mintSourceProofInput: {
          draft: mintDraft,
          evidenceReceipt,
          issuedAtNativeHeight:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
          expiresAtNativeHeight:
            (
              BigInt(
                SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
              )
              + BigInt(
                SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
              )
            ).toString(),
        },
        applicationRunnerInput: {
          frontierSourceDirectory: 'reviewed/frontier',
          temporaryDirectoryRoot: 'reviewed/frontier-temporary',
          cargoDependencyCacheDirectory: 'reviewed/frontier-cargo-cache',
          cargoExecutablePath: 'reviewed/cargo.exe',
          rustcExecutablePath: 'reviewed/rustc.exe',
          gitExecutablePath: 'reviewed/git.exe',
          offline: true,
        },
      },
      expect.any(Number),
    );
    expect(continuation.attestCheckpoint).toHaveBeenCalledWith(
      applicationCheckpointStage,
      {
        validFromErgoHeight: '220',
        expiresAtErgoHeight: '284',
      },
    );
    expect(continuation.complete).not.toHaveBeenCalled();
    expect(result.receipt).toMatchObject({
      status:
        'committed_reserve_minted_burned_and_checkpoint_attested_in_frontier_lab',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
      application: {
        draft: mintDraft,
        evidenceReceipt,
        applicationCheckpoint: applicationCheckpointReceipt,
        checkpointAdmissionObservation: {
          expectedTxId: digest('9'),
          observedAtHeight: 220,
          confirmationHeight: 140,
        },
      },
      checks: {
        setupVaultMintBurnAndCheckpointCompletedInOneTargetLifetime: true,
        compatibilityPacketReplacedByBoundContinuationV3: true,
        exactCommittedReserveBoundToMintStatement: true,
        exactCollectedEvidenceBoundToPacketProof: true,
        exactRetainedPacketConsumedByApplicationCheckpointRoot: true,
        checkpointAdmissionDerivedFromFreshVaultReobservation: true,
        everyEphemeralCapabilityDisposedBeforeReturn: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        sourceLockConsumptionEstablished: true,
        reserveLineageEstablished: true,
        frontierTestClientReservationAndMintExecuted: true,
        frontierApplicationBurnExecuted: true,
        federatedCheckpointAttestationEstablished: true,
        deterministicSourceFinalityEstablished: false,
        ergoAnchorEstablished: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(
      result.receipt.application.applicationCheckpoint.packet.receipt,
    ).toBe(packetV2.receipt);
    expect(
      result.receipt.application.applicationCheckpoint.packet,
    ).not.toBe(packetV2);
    expect(
      result.receipt.application.applicationCheckpoint.packet,
    ).not.toHaveProperty('portableReplayInput');
    expect(
      result.receipt.application.applicationCheckpoint.packet,
    ).not.toHaveProperty('replay');
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('binds the exact application checkpoint and confirmed tracker setup output into a non-authorizing candidate', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
        pegInApplicationCheckpointRootInput(),
      );

    expect(order.indexOf('peg-in:checkpoint:attest')).toBeLessThan(
      order.indexOf('observe:tracker:post-checkpoint'),
    );
    expect(order.indexOf('observe:tracker:post-checkpoint')).toBeLessThan(
      order.indexOf('tracker:setup:materialize'),
    );
    expect(order.indexOf('tracker:setup:materialize')).toBeLessThan(
      order.indexOf('tracker:candidate:build'),
    );
    expect(order.indexOf('tracker:candidate:build')).toBeLessThan(
      order.indexOf('dispose:application-checkpoint-v3'),
    );
    expect(mocked.materializeUnsigned).toHaveBeenCalledTimes(1);
    expect(mocked.trackerBuild).toHaveBeenCalledWith({
      compilerRequest: currentBatch.trackerCompilerBinding.request,
      compilerReceipt: currentBatch.trackerCompilerBinding.receipt,
      trackerInputBox: trackerSetupMaterial.outputs[0],
      encodedStatementHex:
        applicationCheckpointReceipt.checkpoint.checkpointAttestation
          .checkpointStatement.encodedStatementHex,
      currentErgoHeight: 221,
      anchorContextIndex: 0,
    });
    expect(result.receipt).toMatchObject({
      status: 'checkpoint_bound_proofless_tracker_candidate_constructed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4,
      trackerCandidate: {
        trackerSetup: {
          expectedTxId: digest('4'),
          outputBoxIdHex: digest('a'),
          confirmationHeight: 120,
          confirmationHeaderIdHex: digest('2'),
          observedAtHeight: 221,
        },
        candidate: {
          schema: 'e2s.substrate-federated-v1-tracker-context',
          trustModel: 'federated_non_trustless',
          contractIdHex: digest('7'),
          trackerNftIdHex: digest('8'),
          statementIdHex: digest('6'),
          inputBoxIdHex: digest('a'),
          currentErgoHeight: 221,
          anchorContextIndex: 0,
          syntheticAnchorHeaderIdHex: digest('a'),
          syntheticAnchorHeaderHeight: 220,
          unsignedTransactionIdHex: digest('c'),
        },
      },
      checks: {
        exactApplicationCheckpointConsumedByTrackerCandidate: true,
        exactSameProcessTrackerCompilerReceiptConsumed: true,
        exactConfirmedTrackerSetupOutputConsumed: true,
        deterministicProoflessTrackerCandidateConstructed: true,
        syntheticAnchorExplicitlyNonAuthorizing: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        syntheticAnchorContextConstructed: true,
        trackerCandidateConstructed: true,
        ergoAnchorEstablished: false,
        trackerJvmReductionAccepted: false,
        trackerNodeCheckPerformed: false,
        trackerAdmissionEstablished: false,
        trackerSigningPerformed: false,
        trackerSubmissionPerformed: false,
        trackerBroadcastPerformed: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('mines and observes the exact checkpoint commitment on the same isolated chain', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5(
        pegInApplicationCheckpointRootInput(),
      );

    const encodedStatementHex =
      applicationCheckpointReceipt.checkpoint.checkpointAttestation
        .checkpointStatement.encodedStatementHex;
    expect(mocked.checkpointExtensionEncode)
      .toHaveBeenCalledWith(encodedStatementHex);
    expect(mocked.checkpointClaim).toHaveBeenCalledTimes(1);
    expect(mocked.process.mock.calls[0]?.[2]).toBe(MINING_CREDENTIAL);
    expect(mocked.process.mock.calls[0]?.[3])
      .toBe(CHECKPOINT_MINING_CREDENTIAL);
    expect(processSession.withCheckpointExtensionMiningTarget.mock.calls[0]?.[1])
      .toEqual({});
    expect(order.indexOf('execution:leave')).toBeLessThan(
      order.indexOf('checkpoint-mining:enter'),
    );
    expect(order.indexOf('checkpoint-mining:enter')).toBeLessThan(
      order.indexOf('checkpoint-anchor:observe'),
    );
    expect(order.indexOf('checkpoint-anchor:observe')).toBeLessThan(
      order.indexOf('checkpoint-mining:leave'),
    );
    expect(order.indexOf('checkpoint-mining:leave')).toBeLessThan(
      order.indexOf('dispose:application-checkpoint-v3'),
    );
    expect(result.receipt).toMatchObject({
      status: 'application_checkpoint_anchored_in_local_ergo_devnet',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5,
      checkpointAnchor: {
        mining: {
          extensionKeyHex: '0401',
          extensionValueHex: checkpointAnchorObservation.extensionValueHex,
          priorSnapshot: processReceipt().finalSnapshot,
        },
        observation: checkpointAnchorObservation,
      },
      checks: {
        setupVaultMintBurnCheckpointAndAnchorCompletedInOneChainLifetime: true,
        exactApplicationCheckpointEncodedInto0401: true,
        sameChainCheckpointExtensionMinedAfterApplication: true,
        exactPrimaryWitnessAnchorAgreementEstablished: true,
        exactExtensionMembershipRecomputed: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localIsolatedDevnetOnly: true,
        localErgoCheckpointAnchorObserved: true,
        deterministicSourceFinalityEstablished: false,
        ergoPowAuthenticated: false,
        trackerCandidateConstructed: false,
        trackerJvmReductionAccepted: false,
        trackerNodeCheckPerformed: false,
        trackerAdmissionEstablished: false,
        trackerSigningPerformed: false,
        trackerSubmissionPerformed: false,
        trackerBroadcastPerformed: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('binds the mined 0x0401 anchor into a locally signed tracker candidate accepted by the same JVM target', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
        pegInApplicationCheckpointRootInput(),
      );

    expect(mocked.pegInCommittedVaultCheck).not.toHaveBeenCalled();
    expect(mocked.pegInCommittedVaultRetainingCheck).toHaveBeenCalledTimes(1);
    expect(mocked.checkpointClaim).not.toHaveBeenCalled();
    expect(mocked.checkpointSequenceClaim).toHaveBeenCalledTimes(1);
    expect(mocked.process.mock.calls[0]?.[4])
      .toBe(TRACKER_ADMISSION_MINING_CREDENTIAL);
    expect(processSession.withCheckpointExtensionMiningTarget.mock.calls[0]?.[1])
      .toEqual({ minimumTipHeight: 11 });
    expect(order.indexOf('checkpoint-anchor:observe')).toBeLessThan(
      order.indexOf('checkpoint-bound-execution:enter'),
    );
    expect(order.indexOf('checkpoint-bound-execution:enter')).toBeLessThan(
      order.indexOf('checkpoint-bound-tracker:observe'),
    );
    expect(order.indexOf('checkpoint-bound-tracker:observe')).toBeLessThan(
      order.indexOf('tracker:observed-headers:build'),
    );
    expect(order.indexOf('tracker:observed-headers:build')).toBeLessThan(
      order.indexOf('tracker:observed-candidate:build'),
    );
    expect(order.indexOf('tracker:observed-candidate:build')).toBeLessThan(
      order.indexOf('tracker:observed-candidate:check'),
    );
    expect(result.receipt).toMatchObject({
      status: 'observed_anchor_tracker_candidate_accepted_by_local_node_check',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
      checkpointAnchor: {
        observation: checkpointAnchorObservation,
      },
      tracker: {
        execution: checkpointBoundExecutionReceipt(),
        observation: checkpointBoundObservation,
        trackerSetup: {
          expectedTxId: digest('4'),
          outputBoxIdHex: digest('a'),
        },
        candidate: {
          anchorContextProvenance:
            'eip0045-validity-tracker-observed-header-context',
          anchorHeaderIdHex: checkpointAnchorObservation.anchorHeaderIdHex,
          anchorHeaderHeight: checkpointAnchorObservation.anchorHeight,
          anchorExtensionRootHex:
            checkpointAnchorObservation.anchorExtensionRootHex,
          inputBoxIdHex: digest('a'),
          statementIdHex: digest('6'),
          unsignedTransactionIdHex: digest('c'),
        },
        check: observedTrackerCheck,
      },
      checks: {
        setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
          true,
        exactObserved0401AnchorConsumedByTrackerCandidate: true,
        exactCheckpointBoundActiveTargetConsumedByTrackerCheck: true,
        exactConfirmedTrackerSetupOutputConsumed: true,
        exactSameProcessTrackerCompilerReceiptConsumed: true,
        localWasmSignatureAcceptedBySameTargetJvmCheck: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localErgoCheckpointAnchorObserved: true,
        checkpointBoundTrackerExecutionObserved: true,
        trackerCandidateConstructed: true,
        trackerJvmReductionAccepted: true,
        trackerNodeCheckPerformed: true,
        trackerSigningPerformed: true,
        signedTrackerBytesPersisted: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        trackerSubmissionPerformed: false,
        trackerBroadcastPerformed: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('checks the observed anchor against an immutable same-node snapshot', async () => {
    expect(
      frozenCheckpointBoundExecutionReceipt()
        .checkpointExtensionObservationDigestHex,
    ).not.toBe(checkpointAnchorObservation.observationDigestHex);
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      );

    expect(mocked.checkpointSequenceClaim).toHaveBeenCalledTimes(1);
    expect(processSession.withCheckpointBoundMiningActiveExecutionTarget)
      .not.toHaveBeenCalled();
    expect(processSession.withCheckpointBoundMiningStoppedExecutionTarget)
      .toHaveBeenCalledTimes(1);
    expect(order.indexOf('checkpoint-anchor:observe')).toBeLessThan(
      order.indexOf('checkpoint-bound-frozen-execution:enter'),
    );
    expect(order.indexOf('checkpoint-bound-frozen-execution:enter')).toBeLessThan(
      order.indexOf('checkpoint-bound-frozen-tracker:observe'),
    );
    expect(order.indexOf('checkpoint-bound-frozen-tracker:observe')).toBeLessThan(
      order.indexOf('tracker:frozen-observed-candidate:check'),
    );
    expect(result.receipt).toMatchObject({
      status:
        'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
      checkpointAnchor: {
        observation: checkpointAnchorObservation,
      },
      tracker: {
        execution: frozenCheckpointBoundExecutionReceipt(),
        observation: frozenCheckpointBoundObservation,
        trackerSetup: {
          expectedTxId: digest('4'),
          outputBoxIdHex: digest('a'),
        },
        candidate: {
          anchorContextProvenance:
            'eip0045-validity-tracker-observed-header-context',
          anchorHeaderIdHex: checkpointAnchorObservation.anchorHeaderIdHex,
          inputBoxIdHex: digest('a'),
          statementIdHex: digest('6'),
          unsignedTransactionIdHex: digest('c'),
        },
        check: frozenObservedTrackerCheck,
      },
      checks: {
        setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
          true,
        exactObserved0401AnchorConsumedByTrackerCandidate: true,
        exactCheckpointBoundFrozenTargetConsumedByTrackerCheck: true,
        exactFrozenSnapshotStableAcrossTrackerCheck: true,
        exactConfirmedTrackerSetupOutputConsumed: true,
        exactSameProcessTrackerCompilerReceiptConsumed: true,
        localWasmSignatureAcceptedBySameTargetJvmCheck: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localErgoCheckpointAnchorObserved: true,
        checkpointBoundFrozenTrackerExecutionObserved: true,
        trackerCandidateConstructed: true,
        trackerJvmReductionAccepted: true,
        trackerNodeCheckPerformed: true,
        trackerSigningPerformed: true,
        signedTrackerBytesPersisted: false,
        trackerAdmissionEstablished: false,
        trackerSubmissionPerformed: false,
        trackerBroadcastPerformed: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );

    assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
      result.receipt,
    );
    const authorization =
      authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
        result.receipt,
      );
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
      authorization,
    );
    expect(authorization).toMatchObject({
      status:
        'exact_frozen_tracker_check_authorized_for_durable_reservation',
      operationProfileDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
      rootReceiptDigestHex: result.receipt.receiptDigestHex,
      sourceProfile: {
        statementIdHex: digest('6'),
        bridgeEventRootHex: digest('3'),
        burnIdHex: digest('2'),
      },
      trackerSetup: {
        transactionIdHex: digest('4'),
        outputBoxIdHex: digest('a'),
      },
      checkpointAnchor: {
        extensionKeyHex: '0401',
        extensionValueHex: `${digest('3')}${digest('6')}`,
        anchorHeaderIdHex: checkpointAnchorObservation.anchorHeaderIdHex,
      },
      frozenTarget: {
        processBindingDigestHex: digest('0'),
        executionTargetIdentityDigestHex: digest('8'),
        snapshotHeight: 143,
        snapshotHeaderIdHex: digest('e'),
      },
      trackerCandidate: {
        trustModel: 'federated_non_trustless',
        inputBoxIdHex: digest('a'),
        statementIdHex: digest('6'),
        unsignedTransactionIdHex: digest('c'),
      },
      jvmCheck: {
        unsignedTransactionIdHex: digest('c'),
        stateContextTipHeight: 143,
        stateContextTipIdHex: digest('e'),
      },
      boundaries: {
        localIsolatedDevnetOnly: true,
        exactProcessProvenRootConsumed: true,
        structuralRevalidationCompleted: true,
        reservationAuthorityEstablished: true,
        durableReservationEstablished: false,
        signedTransactionBytesPersisted: false,
        signingCapabilityExposed: false,
        deterministicSourceFinalityEstablished: false,
        ergoPowAuthenticated: false,
        profileActivated: false,
        mintAuthorized: false,
        submissionAuthorityEstablished: false,
        broadcastAuthorityEstablished: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
        publicNetworkUsed: false,
        realFundsUsed: false,
        existingWalletMaterialUsed: false,
      },
    });
    expect(containsFunction(authorization)).toBe(false);
    expect(JSON.stringify(authorization)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
    const actualStateTracker = await vi.importActual<
      typeof import('../../state-tracker.js')
    >('../../state-tracker.js');
    const reservationDirectory = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-admission-reservation-'),
    );
    const primaryStorePath = join(reservationDirectory, 'primary.sqlite');
    const primaryTracker = new actualStateTracker.StateTracker(primaryStorePath);
    const competingTracker = new actualStateTracker.StateTracker(
      join(reservationDirectory, 'competing.sqlite'),
    );
    let durableReservation!: ReturnType<
      typeof persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1
    >;
    let primaryTrackerClosed = false;
    let reopenedTracker: InstanceType<
      typeof actualStateTracker.StateTracker
    > | undefined;
    try {
      durableReservation =
        persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          primaryTracker,
          authorization,
        );
      assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
        durableReservation,
      );
      assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
        durableReservation,
        primaryTracker,
      );
      const persisted = primaryTracker
        .getSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          authorization.reservationIdentityHex,
        );
      expect(persisted).toMatchObject({
        reservationIdentityHex: authorization.reservationIdentityHex,
        operationProfileDigestHex: authorization.operationProfileDigestHex,
        rootReceiptDigestHex: authorization.rootReceiptDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
        sourceProfileDigestHex: authorization.bindings.sourceProfileDigestHex,
        trackerSetupDigestHex: authorization.bindings.trackerSetupDigestHex,
        checkpointAnchorDigestHex:
          authorization.bindings.checkpointAnchorDigestHex,
        frozenTargetDigestHex: authorization.bindings.frozenTargetDigestHex,
        trackerCandidateDigestHex:
          authorization.bindings.trackerCandidateDigestHex,
        jvmCheckDigestHex: authorization.bindings.jvmCheckDigestHex,
        statementIdHex: authorization.sourceProfile.statementIdHex,
        trackerInputBoxIdHex: authorization.trackerCandidate.inputBoxIdHex,
        unsignedTransactionIdHex:
          authorization.trackerCandidate.unsignedTransactionIdHex,
        anchorHeaderIdHex: authorization.checkpointAnchor.anchorHeaderIdHex,
        targetIdentityDigestHex:
          authorization.frozenTarget.executionTargetIdentityDigestHex,
      });
      expect(durableReservation).toMatchObject({
        status: 'exact_tracker_admission_reservation_persisted',
        reservationIdentityHex: authorization.reservationIdentityHex,
        durableReservationDigestHex: persisted?.durableReservationDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
        boundaries: {
          localIsolatedDevnetOnly: true,
          exactAuthorizationConsumed: true,
          durableReservationEstablished: true,
          localDatabaseAuthoritative: false,
          signedTransactionBytesPersisted: false,
          signingCapabilityExposed: false,
          deterministicSourceFinalityEstablished: false,
          ergoPowAuthenticated: false,
          profileActivated: false,
          mintAuthorized: false,
          submissionAuthorityEstablished: false,
          broadcastAuthorityEstablished: false,
          trackerAdmissionEstablished: false,
          globalReplayInsertionEstablished: false,
          payoutAuthorized: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
          trustlessStatusEstablished: false,
          productionReadinessEstablished: false,
          publicNetworkUsed: false,
          realFundsUsed: false,
          existingWalletMaterialUsed: false,
        },
      });
      primaryTracker.close();
      primaryTrackerClosed = true;
      reopenedTracker = new actualStateTracker.StateTracker(primaryStorePath);
      const retry =
        persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          reopenedTracker,
          authorization,
        );
      expect(retry).toEqual(durableReservation);
      assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
        durableReservation,
        reopenedTracker,
      );
      expect(() =>
        persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
          competingTracker,
          authorization,
        )
      ).toThrow(/cannot fan out across persistence stores/);
      expect(
        competingTracker
          .getSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
            authorization.reservationIdentityHex,
          ),
      ).toBeNull();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
          durableReservation,
          competingTracker,
        )
      ).toThrow(/persistence store changed/);
    } finally {
      if (!primaryTrackerClosed) primaryTracker.close();
      reopenedTracker?.close();
      competingTracker.close();
      rmSync(reservationDirectory, { recursive: true, force: true });
    }
    expect(containsFunction(durableReservation)).toBe(false);
    expect(JSON.stringify(durableReservation)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
    const copiedAuthorizationPort = {
      reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1: vi.fn(),
    };
    expect(() =>
      persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
        copiedAuthorizationPort,
        structuredClone(authorization),
      )
    ).toThrow(/authorization lacks exact process provenance/);
    expect(
      copiedAuthorizationPort
        .reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1,
    ).not.toHaveBeenCalled();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
        structuredClone(durableReservation),
      )
    ).toThrow(/lacks exact process provenance/);
    expect(() =>
      authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
        result.receipt,
      )
    ).toThrow(/already consumed for reservation authorization/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
        structuredClone(result.receipt),
      )
    ).toThrow(/lacks exact runtime provenance/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
        structuredClone(authorization),
      )
    ).toThrow(/lacks exact process provenance/);
  });

  it('reloads the exact durable tracker reservation and rechecks freshness in one process lifetime', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      );

    expect(
      processSession
        .withCheckpointBoundReservationFreshnessRevalidationTarget,
    ).toHaveBeenCalledTimes(1);
    expect(mocked.trackerReservationFreshnessObserve).toHaveBeenCalledTimes(1);
    expect(mocked.trackerReservationFreshnessCheck).toHaveBeenCalledTimes(1);
    expect(
      mocked.trackerReservationFreshnessCheckDiscard,
    ).toHaveBeenCalledTimes(1);
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(
      order.indexOf('tracker:frozen-observed-candidate:check'),
    ).toBeLessThan(
      order.indexOf('tracker-reservation-freshness-execution:enter'),
    );
    expect(
      order.indexOf('tracker-reservation-freshness:observe'),
    ).toBeLessThan(
      order.indexOf('tracker-reservation-freshness:check'),
    );
    expect(
      order.indexOf('tracker-reservation-freshness:check'),
    ).toBeLessThan(order.indexOf('process:stop'));

    expect(result.receipt).toMatchObject({
      schema:
        'e2s.substrate-federated-isolated-devnet-peg-in-tracker-reservation-freshness-campaign-root.v8',
      version: 8,
      status:
        'durable_tracker_reservation_reloaded_and_freshness_rechecked',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8,
      frozenTrackerRoot: {
        status:
          'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check',
      },
      reservation: {
        authorization: {
          status:
            'exact_frozen_tracker_check_authorized_for_durable_reservation',
        },
        durable: {
          status: 'exact_tracker_admission_reservation_persisted',
        },
        reloaded: {
          statementIdHex: digest('6'),
          trackerInputBoxIdHex: digest('a'),
          unsignedTransactionIdHex: digest('c'),
          anchorHeaderIdHex: checkpointAnchorObservation.anchorHeaderIdHex,
          targetIdentityDigestHex: digest('8'),
        },
      },
      freshness: {
        execution: trackerReservationFreshnessExecutionReceipt(),
        observation: trackerReservationFreshnessObservation,
        check: trackerReservationFreshnessCheck,
      },
      checks: {
        setupThroughFreshnessCompletedInOneChainLifetime: true,
        firstReservationStoreClosedBeforeReopen: true,
        exactReservationReloadedBeforeAndAfterFreshness: true,
        exactFrozenTrackerTargetReacquired: true,
        exactObserved0401AnchorReacquired: true,
        exactReservedTrackerCandidateReconstructed: true,
        sameSyntheticSignerAndJvmCheckReused: true,
        everyEphemeralCapabilityDisposedBeforeReturn: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localIsolatedDevnetOnly: true,
        processProvenFrozenTrackerRootConsumed: true,
        durableReservationEstablished: true,
        localDatabaseAuthoritative: false,
        trackerInputRevalidated: true,
        checkpointAnchorRevalidated: true,
        frozenTargetSnapshotRevalidated: true,
        trackerJvmReductionRechecked: true,
        trackerSigningPerformed: true,
        signedTrackerBytesPersisted: false,
        deterministicSourceFinalityEstablished: false,
        ergoPowAuthenticated: false,
        profileActivated: false,
        mintAuthorized: false,
        submissionAuthorityEstablished: false,
        broadcastAuthorityEstablished: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
        publicNetworkUsed: false,
        realFundsUsed: false,
        existingWalletMaterialUsed: false,
      },
    });
    expect(
      result.receipt.reservation.authorization.rootReceiptDigestHex,
    ).toBe(result.receipt.frozenTrackerRoot.receiptDigestHex);
    expect(
      result.receipt.reservation.durable.reservationIdentityHex,
    ).toBe(result.receipt.reservation.reloaded.reservationIdentityHex);
    expect(
      result.receipt.reservation.durable.durableReservationDigestHex,
    ).toBe(result.receipt.reservation.reloaded.durableReservationDigestHex);
    expect(
      result.receipt.freshness.execution
        .trackerCheckExecutionTargetIdentityDigestHex,
    ).toBe(result.receipt.reservation.reloaded.targetIdentityDigestHex);
    expect(result.receipt.freshness.check.unsignedTransactionIdHex).toBe(
      result.receipt.reservation.reloaded.unsignedTransactionIdHex,
    );
    expect(result.receipt.freshness.check.signedTransactionIdHex).toBe(
      result.receipt.frozenTrackerRoot.tracker.check.signedTransactionIdHex,
    );
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:reviewed[\\/]|signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );

    assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance(
      result.receipt,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance(
        structuredClone(result.receipt),
      )
    ).toThrow(/lacks exact runtime provenance/);
  });

  it.each([
    ['build', 'ergo node build'],
    ['setup', 'setup and packet session'],
  ] as const)('projects only the finite V9 %s phase before node construction', async (
    boundary,
    expectedPhase,
  ) => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), `e2s-tracker-${boundary}-phase-`),
    );
    const privateDiagnostic =
      `synthetic private ${boundary} failure under ${journalRoot}`;
    const rejected = new Error(privateDiagnostic);
    if (boundary === 'build') {
      mocked.build.mockRejectedValueOnce(rejected);
    } else {
      mocked.setup.mockRejectedValueOnce(rejected);
    }
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBe(expectedPhase);
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          new AggregateError([failure, new Error('cleanup failed')]),
        ),
      ).toBeNull();
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          new Error(privateDiagnostic),
        ),
      ).toBeNull();
      expect(mocked.process).not.toHaveBeenCalled();
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('keeps the shared managed-phase marker finite and process-local', () => {
    for (
      const phase of
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1
    ) {
      const failure = new Error(`private ${phase} detail`);
      expect(
        createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
          phase,
          failure,
        ),
      ).toBe(failure);
      expect(
        projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
          failure,
        ),
      ).toBe(phase);
    }
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        new Error('frozen tracker check'),
      ),
    ).toBeNull();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        'private phase' as any,
        new Error('private detail'),
      )
    ).toThrow(/managed campaign phase is invalid/iu);

    expect(() =>
      createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
        'private phase' as any,
        new Error('private detail'),
      )
    ).toThrow('tracker transport managed campaign phase is invalid');
    const compatibilityFailure =
      createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
        'frozen tracker check',
        'private detail',
      );
    expect(compatibilityFailure.message).toBe(
      'isolated tracker transport managed campaign phase failed',
    );
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        compatibilityFailure,
      ),
    ).toBe('frozen tracker check');
    expect(
      projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
        compatibilityFailure,
      ),
    ).toBe('frozen tracker check');
  });

  it.each([
    ['build', 'ergo node build'],
    ['setup', 'setup and packet session'],
  ] as const)('projects only the finite V7 %s phase before node construction', async (
    boundary,
    expectedPhase,
  ) => {
    const privateDiagnostic = `synthetic private V7 ${boundary} failure`;
    if (boundary === 'build') {
      mocked.build.mockRejectedValueOnce(new Error(privateDiagnostic));
    } else {
      mocked.setup.mockRejectedValueOnce(new Error(privateDiagnostic));
    }
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput() as any,
      );
    } catch (error) {
      failure = error;
    }

    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        failure,
      ),
    ).toBe(expectedPhase);
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        new Error(privateDiagnostic),
      ),
    ).toBeNull();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it.each([
    ['source history', 'source history collection'],
    ['frozen tracker', 'frozen tracker check'],
  ] as const)('projects the exact V7 %s managed subphase', async (
    boundary,
    expectedPhase,
  ) => {
    const privateDiagnostic = `synthetic private V7 ${boundary} failure`;
    if (boundary === 'source history') {
      mocked.sourceHistory.mockRejectedValueOnce(new Error(privateDiagnostic));
    } else {
      mocked.checkpointBoundFrozenObserve.mockRejectedValueOnce(
        new Error(privateDiagnostic),
      );
    }
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput() as any,
      );
    } catch (error) {
      failure = error;
    }

    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        failure,
      ),
    ).toBe(expectedPhase);
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        new Error(privateDiagnostic),
      ),
    ).toBeNull();
  });

  it('retains the V7 primary managed phase across teardown aggregation', async () => {
    mocked.sourceHistory.mockRejectedValueOnce(
      new Error('synthetic private V7 source history failure'),
    );
    processSession.stop.mockRejectedValueOnce(
      new Error('synthetic private V7 teardown failure'),
    );
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput() as any,
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        failure,
      ),
    ).toBe('source history collection');
  });

  it('classifies a V7 teardown-only failure without diagnostic text', async () => {
    processSession.stop.mockRejectedValueOnce(
      new Error('synthetic private V7 teardown-only failure'),
    );
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput() as any,
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        failure,
      ),
    ).toBe('campaign teardown');
  });

  it('does not project managed campaign phases for the adjacent V8 action', async () => {
    mocked.setup.mockRejectedValueOnce(
      new Error('synthetic private V8 setup failure'),
    );
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      );
    } catch (error) {
      failure = error;
    }

    expect(
      projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
        failure,
      ),
    ).toBeNull();
  });

  it.each([
    ['source history', 'source history collection'],
    ['Ergo funding', 'ergo funding and history'],
  ] as const)(
    'projects the exact V9 %s managed subphase without its private cause',
    async (boundary, expectedPhase) => {
      const journalRoot = mkdtempSync(
        join(tmpdir(), `e2s-tracker-${boundary.replace(' ', '-')}-phase-`),
      );
      const privateDiagnostic =
        `synthetic private ${boundary} failure under ${journalRoot}`;
      if (boundary === 'source history') {
        mocked.sourceHistory.mockRejectedValueOnce(new Error(privateDiagnostic));
      } else {
        mocked.rewardDiscovery.mockRejectedValueOnce(new Error(privateDiagnostic));
      }
      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        });
      } catch (error) {
        failure = error;
      }

      try {
        expect(
          projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
            failure,
          ),
        ).toBe(expectedPhase);
        expect(processSession.startMining).toHaveBeenCalledOnce();
        expect(processSession.stop).toHaveBeenCalledOnce();
      } finally {
        rmSync(journalRoot, { recursive: true, force: true });
      }
    },
  );

  it('preserves the V9 non-Error compatibility message through the root', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-non-error-phase-'),
    );
    mocked.sourceHistory.mockRejectedValueOnce('private non-Error cause');
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        'isolated tracker transport managed campaign phase failed',
      );
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBe('source history collection');
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('assigns the V9 genesis transport phase before support construction', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-genesis-transport-phase-'),
    );
    const privateDiagnostic =
      `synthetic private observer construction failure under ${journalRoot}`;
    mocked.observer.mockImplementationOnce(() => {
      throw new Error(privateDiagnostic);
    });
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBe('genesis setup transport');
      expect(processSession.startMining).toHaveBeenCalledOnce();
      expect(processSession.stop).toHaveBeenCalledOnce();
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('retains the V9 managed subphase across teardown aggregation', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-source-history-aggregate-phase-'),
    );
    mocked.sourceHistory.mockRejectedValueOnce(
      new Error(`synthetic private source failure under ${journalRoot}`),
    );
    processSession.stop.mockRejectedValueOnce(
      new Error(`synthetic private teardown failure under ${journalRoot}`),
    );
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      expect(failure).toBeInstanceOf(AggregateError);
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBe('source history collection');
      expect(processSession.stop).toHaveBeenCalledOnce();
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('projects the V9 node-start phase across teardown aggregation', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-node-start-phase-'),
    );
    const privateDiagnostic = `synthetic private node failure under ${journalRoot}`;
    processSession.startMining.mockRejectedValueOnce(
      new Error(privateDiagnostic),
    );
    processSession.stop.mockRejectedValueOnce(
      new Error(`synthetic private teardown failure under ${journalRoot}`),
    );
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBe('node startup and mining');
      expect(failure).toBeInstanceOf(AggregateError);
      expect(processSession.stop).toHaveBeenCalledOnce();
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('records and canonically confirms one durable tracker transport attempt before teardown', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-transport-root-'),
    );
    try {
      const rootInput = {
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      };
      const result =
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9(
          rootInput,
        );

      expect(
        processSession.withCheckpointBoundTrackerTransportTarget,
      ).toHaveBeenCalledTimes(1);
      expect(
        processSession.withTrackerTransportConfirmationMiningTarget,
      ).toHaveBeenCalledTimes(1);
      expect(mocked.trackerReservationFreshnessCheckDiscard).not
        .toHaveBeenCalled();
      expect(mocked.trackerTransportJournalCreate).toHaveBeenCalledTimes(1);
      expect(mocked.requestBindingClaim).toHaveBeenCalledWith(
        TRACKER_TRANSPORT_REQUEST_BINDING,
        rootInput,
      );
      expect(trackerTransportJournal.reserve).toHaveBeenCalledTimes(1);
      expect(mocked.packetRelayerLineageClaim).toHaveBeenCalledOnce();
      expect(mocked.trackerTransportPreflight).toHaveBeenCalledTimes(1);
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
      expect(trackerTransportJournal.finalize).toHaveBeenCalledTimes(1);
      expect(
        order.indexOf('tracker-transport:freshness:claim'),
      ).toBeLessThan(order.indexOf('tracker-transport:journal:reserve'));
      expect(
        order.indexOf('tracker-transport:journal:reserve'),
      ).toBeLessThan(order.indexOf('tracker-transport:preflight'));
      expect(
        order.indexOf('tracker-transport:packet-lineage:claim'),
      ).toBeLessThan(order.indexOf('tracker-transport:preflight'));
      expect(order.indexOf('tracker-transport:preflight')).toBeLessThan(
        order.indexOf('tracker-transport:post'),
      );
      expect(order.indexOf('tracker-transport:post')).toBeLessThan(
        order.indexOf('tracker-transport:journal:finalize'),
      );
      expect(
        order.indexOf('tracker-transport:journal:finalize'),
      ).toBeLessThan(order.indexOf('tracker-confirmation:enter'));
      expect(order.indexOf('tracker-confirmation:enter')).toBeLessThan(
        order.indexOf('observe:tracker-admission'),
      );
      expect(order.indexOf('observe:tracker-admission')).toBeLessThan(
        order.indexOf('tracker-confirmation:leave'),
      );
      expect(order.indexOf('tracker-confirmation:leave')).toBeLessThan(
        order.indexOf('process:stop'),
      );

      expect(result.receipt).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-root.v9',
        version: 9,
        status: 'local_tracker_transport_canonically_confirmed',
        staticExecutionManifestDigestHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
        freshness: {
          status:
            'durable_tracker_reservation_reloaded_and_freshness_rechecked',
        },
        transport: {
          execution: trackerTransportExecutionReceipt(),
          authorization: trackerTransportAuthorization,
          attempt: {
            expectedTransactionIdHex:
              trackerReservationFreshnessCheck.signedTransactionIdHex,
            durableAttemptDigestHex: digest('3'),
          },
          outcome: trackerTransportOutcome,
          confirmationExecution: trackerConfirmationExecutionReceipt(),
          confirmation: trackerTransportConfirmation(),
        },
        checks: {
          exactFreshnessCheckPromotedOnce: true,
          exactTransportTargetActiveOnlyDuringAttempt: true,
          durableAttemptPersistedBeforePost: true,
          exactCheckedBytesConsumedOnce: true,
          transportOutcomePersistedBeforeReturn: true,
          exactAttemptConfirmedBeforeTeardown: true,
          persistentJournalPathExcludedFromReceipt: true,
          returnedValueContainsCapabilities: false,
        },
        boundaries: {
          localIsolatedDevnetOnly: true,
          trackerTransportAttempted: true,
          exactNodeAcceptanceObserved: true,
          oneTransportAttemptRecorded: true,
          canonicalConfirmationObserved: true,
          trackerAdmissionEstablished: true,
          localDatabaseAuthoritative: false,
          signedTrackerBytesPersisted: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
          trustlessStatusEstablished: false,
          productionReadinessEstablished: false,
          publicNetworkUsed: false,
          realFundsUsed: false,
          existingWalletMaterialUsed: false,
        },
      });
      expect(containsFunction(result)).toBe(false);
      expect(JSON.stringify(result)).not.toContain(journalRoot);
      assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance(
        result.receipt,
      );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance(
          structuredClone(result.receipt),
        )
      ).toThrow(/lacks exact runtime provenance/);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('projects a bounded terminal receipt when the durable transport is not confirmed', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-transport-unconfirmed-'),
    );
    processSession.withTrackerTransportConfirmationMiningTarget
      .mockRejectedValueOnce(new Error(
        `synthetic private diagnostic under ${journalRoot}`,
      ));
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      const receipt =
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          failure,
        );
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          failure,
        ),
      ).toBeNull();
      expect(receipt).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9',
        version: 9,
        status: 'local_tracker_transport_not_canonically_confirmed',
        staticExecutionManifestDigestHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
        transport: {
          authorization: {
            expectedTransactionIdHex:
              trackerTransportAuthorization.expectedTransactionIdHex,
            executionTargetIdentityDigestHex:
              trackerTransportAuthorization.executionTargetIdentityDigestHex,
            authorizationDigestHex:
              trackerTransportAuthorization.authorizationDigestHex,
          },
          attempt: {
            expectedTransactionIdHex:
              trackerTransportAttempt.expectedTransactionIdHex,
            durableAttemptDigestHex:
              trackerTransportAttempt.durableAttemptDigestHex,
          },
          outcome: {
            status: trackerTransportOutcome.status,
            expectedTransactionIdHex:
              trackerTransportOutcome.expectedTransactionIdHex,
            submittedTransactionIdHex:
              trackerTransportOutcome.submittedTransactionIdHex,
            durableAttemptDigestHex:
              trackerTransportOutcome.durableAttemptDigestHex,
            outcomeDigestHex: trackerTransportOutcome.outcomeDigestHex,
            responseDigestHex: trackerTransportOutcome.responseDigestHex,
          },
        },
        confirmation: {
          schema:
            'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1',
          version: 1,
          category: 'confirmation_phase_failure',
          expectedTransactionIdHex:
            trackerTransportAttempt.expectedTransactionIdHex,
          executionTargetIdentityDigestHex:
            trackerTransportAuthorization.executionTargetIdentityDigestHex,
          confirmationBudgetMs: 120000,
          observationCount: 0,
          lastObservation: null,
        },
        boundaries: {
          oneTransportAttemptRecorded: true,
          transportOutcomePersisted: true,
          exactNodeAcceptanceObserved: true,
          canonicalConfirmationObserved: false,
          trackerAdmissionEstablished: false,
          signedTrackerBytesPersisted: false,
          publicNetworkUsed: false,
          gate5Closed: false,
        },
      });
      expect(receipt?.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
      expect(JSON.stringify(receipt)).not.toContain(journalRoot);
      expect(JSON.stringify(receipt)).not.toContain('synthetic private diagnostic');
      expect(
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          new AggregateError([
            failure,
            new Error('synthetic cleanup failure'),
          ]),
        ),
      ).toBe(receipt);
      expect(
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          new AggregateError([
            new AggregateError([
              failure,
              new Error('synthetic reservation cleanup failure'),
            ]),
            new Error('synthetic campaign teardown failure'),
          ]),
        ),
      ).toBe(receipt);
      expect(
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          new AggregateError([
            new Error('synthetic cleanup failure'),
            failure,
          ]),
        ),
      ).toBeNull();
      expect(
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          new Error('forged failure'),
        ),
      ).toBeNull();
      expect(
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          new AggregateError([new Error('forged aggregate')]),
        ),
      ).toBeNull();
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
      expect(trackerTransportJournal.finalize).toHaveBeenCalledTimes(1);
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['pending', 'pending_at_deadline'],
    ['not_found', 'not_found_at_deadline'],
    ['budget', 'confirmation_budget_elapsed'],
    ['observer_failure', 'observer_failure'],
  ] as const)(
    'projects a typed %s tracker confirmation terminal category',
    async (mode, expectedCategory) => {
      const journalRoot = mkdtempSync(
        join(tmpdir(), 'e2s-tracker-confirmation-diagnostic-'),
      );
      const baselineObserve = observerPort.observe.getMockImplementation();
      if (baselineObserve === undefined) {
        throw new Error('observer mock is unavailable');
      }
      let now = 0;
      let confirmationClockReads = 0;
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => {
        if (
          mode === 'budget'
          && order.includes('tracker-confirmation:enter')
        ) {
          confirmationClockReads += 1;
          return confirmationClockReads === 1 ? 0 : 2 * 60_000 + 1;
        }
        return now;
      });
      observerPort.observe.mockImplementation(async (...args) => {
        if (
          args[0] === digest('c')
          && order.includes('tracker-confirmation:enter')
        ) {
          now = 2 * 60_000 + 1;
          if (mode === 'observer_failure') {
            throw new AggregateError(
              Array.from(
                { length: 40 },
                (_, index) => new Error(
                  `private observer diagnostic ${index} under ${journalRoot}`,
                ),
              ),
              'private aggregate observer failure',
            );
          }
          if (mode === 'budget') {
            throw new Error('budget mode reached the observer unexpectedly');
          }
          return Object.freeze({
            ...confirmation(args[0], 0, 1),
            status: mode,
            confirmations: 0,
            confirmationHeight: null,
            confirmationHeaderIdHex: null,
          });
        }
        return await baselineObserve(...args);
      });
      if (mode === 'observer_failure') {
        const baselineConfirmationAction =
          processSession.withTrackerTransportConfirmationMiningTarget
            .getMockImplementation();
        if (baselineConfirmationAction === undefined) {
          throw new Error('confirmation action mock is unavailable');
        }
        processSession.withTrackerTransportConfirmationMiningTarget
          .mockImplementationOnce(async (...args) => {
            try {
              return await baselineConfirmationAction(...args);
            } catch (error) {
              throw new AggregateError([
                error,
                ...Array.from(
                  { length: 40 },
                  (_, index) => new Error(`cleanup failure ${index}`),
                ),
              ], 'confirmation and cleanup failed');
            }
          });
      }
      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        });
      } catch (error) {
        failure = error;
      }

      try {
        const receipt =
          projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
            failure,
          );
        expect(receipt?.confirmation).toMatchObject({
          schema:
            'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1',
          version: 1,
          category: expectedCategory,
          expectedTransactionIdHex: digest('c'),
          executionTargetIdentityDigestHex: digest('6'),
          confirmationBudgetMs: 120000,
          observationCount: mode === 'budget' ? 0 : 1,
          lastObservation: mode === 'observer_failure' || mode === 'budget'
            ? null
            : { status: mode },
        });
        expect(JSON.stringify(receipt)).not.toContain(journalRoot);
        expect(JSON.stringify(receipt)).not.toContain('private observer diagnostic');
        expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
      } finally {
        clock.mockRestore();
        rmSync(journalRoot, { recursive: true, force: true });
      }
    },
  );

  it('does not inspect opaque confirmation failure accessors', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-confirmation-opaque-error-'),
    );
    let accessorReads = 0;
    const opaqueErrors = new Proxy([new Error('opaque nested failure')], {
      get: () => {
        accessorReads += 1;
        throw new Error('errors proxy must not execute');
      },
      getOwnPropertyDescriptor: () => {
        accessorReads += 1;
        throw new Error('errors descriptor proxy must not execute');
      },
    });
    const opaqueFailure = new AggregateError([], 'opaque confirmation failure');
    Object.defineProperties(opaqueFailure, {
      cause: {
        configurable: true,
        get: () => {
          accessorReads += 1;
          throw new Error('cause accessor must not execute');
        },
      },
      errors: {
        configurable: true,
        value: opaqueErrors,
      },
    });
    processSession.withTrackerTransportConfirmationMiningTarget
      .mockRejectedValueOnce(opaqueFailure);
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
        ...(pegInApplicationCheckpointRootInput() as any),
        trackerTransportJournalRoot: journalRoot,
      });
    } catch (error) {
      failure = error;
    }

    try {
      const receipt =
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          failure,
        );
      expect(receipt?.confirmation.category)
        .toBe('confirmation_phase_failure');
      expect(accessorReads).toBe(0);
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ['authorization transaction', () => {
      trackerTransportAuthorization = Object.freeze({
        ...trackerTransportAuthorization,
        expectedTransactionIdHex: digest('e'),
      });
    }],
    ['outcome transaction', () => {
      trackerTransportOutcome = Object.freeze({
        ...trackerTransportOutcome,
        expectedTransactionIdHex: digest('e'),
      });
    }],
    ['durable attempt', () => {
      trackerTransportOutcome = Object.freeze({
        ...trackerTransportOutcome,
        durableAttemptDigestHex: digest('e'),
      });
    }],
    ['accepted submitted transaction', () => {
      trackerTransportOutcome = Object.freeze({
        ...trackerTransportOutcome,
        submittedTransactionIdHex: null,
      });
    }],
    ['ambiguous submitted transaction', () => {
      trackerTransportOutcome = Object.freeze({
        ...trackerTransportOutcome,
        status: 'ambiguous',
      });
    }],
    ['unknown outcome status', () => {
      trackerTransportOutcome = Object.freeze({
        ...trackerTransportOutcome,
        status: 'unknown',
        submittedTransactionIdHex: null,
      });
    }],
  ] as const)(
    'rejects an unconfirmed transport with a mismatched %s binding',
    async (_label, mutate) => {
      const journalRoot = mkdtempSync(
        join(tmpdir(), 'e2s-tracker-transport-mismatch-'),
      );
      mutate();
      processSession.withTrackerTransportConfirmationMiningTarget
        .mockRejectedValueOnce(new Error('synthetic confirmation failure'));
      try {
        await expect(
          runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
            ...(pegInApplicationCheckpointRootInput() as any),
            trackerTransportJournalRoot: journalRoot,
          }),
        ).rejects.toThrow(
          'isolated tracker transport terminal failure binding changed',
        );
      } finally {
        rmSync(journalRoot, { recursive: true, force: true });
      }
    },
  );

  it('does not restart mining when durable outcome finalization fails after POST', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-transport-finalize-failure-'),
    );
    trackerTransportJournal.finalize.mockImplementationOnce(() => {
      order.push('tracker-transport:journal:finalize');
      throw new Error('synthetic durable outcome failure');
    });
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        }),
      ).rejects.toThrow('synthetic durable outcome failure');
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
      expect(trackerTransportJournal.finalize).toHaveBeenCalledTimes(1);
      expect(
        processSession.withTrackerTransportConfirmationMiningTarget,
      ).not.toHaveBeenCalled();
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('rejects a canonical confirmation for any transaction other than the exact attempt', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-transport-confirmation-drift-'),
    );
    processSession.withTrackerTransportConfirmationMiningTarget
      .mockResolvedValueOnce({
        value: trackerTransportConfirmation(),
        receipt: {
          ...trackerConfirmationExecutionReceipt(),
          confirmedTransactionIdHex: digest('f'),
        },
      });
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        }),
      ).rejects.toThrow('isolated tracker transport outcome binding changed');
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('rejects direct tracker journal paths inside or above the worktree', async () => {
    const worktreeRoot = realpathSync(resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      '..',
    ));
    for (const journalRoot of [worktreeRoot, dirname(worktreeRoot)]) {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        }),
      ).rejects.toThrow(/must remain outside the worktree/);
    }
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects linked and nonempty tracker journal directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'e2s-tracker-journal-boundary-'));
    const target = join(root, 'target');
    const link = join(root, 'link');
    const nonempty = join(root, 'nonempty');
    mkdirSync(target);
    mkdirSync(nonempty);
    writeFileSync(join(nonempty, 'existing.txt'), 'occupied');
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: link,
        }),
      ).rejects.toThrow(/must be one link-free directory/);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: nonempty,
        }),
      ).rejects.toThrow(/must be empty before the one-attempt campaign/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('atomically excludes a concurrent campaign from the same journal parent', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-journal-exclusive-'),
    );
    try {
      const first =
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        });
      expect(readdirSync(journalRoot)).toEqual(['tracker-transport-attempt']);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        }),
      ).rejects.toThrow(/must be empty before the one-attempt campaign/);
      await expect(first).resolves.toBeDefined();
      expect(mocked.trackerTransportSubmit).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('rejects replacement of the atomically reserved journal directory before opening it', async () => {
    const journalRoot = mkdtempSync(
      join(tmpdir(), 'e2s-tracker-journal-replacement-'),
    );
    mocked.build.mockImplementationOnce(async () => {
      const entries = readdirSync(journalRoot);
      expect(entries).toHaveLength(1);
      const reservedRoot = join(journalRoot, entries[0]!);
      rmSync(reservedRoot, { recursive: true, force: true });
      writeFileSync(reservedRoot, 'replaced');
      return validBuild();
    });
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
          ...(pegInApplicationCheckpointRootInput() as any),
          trackerTransportJournalRoot: journalRoot,
        }),
      ).rejects.toThrow(
        'isolated tracker transport campaign journal root changed before opening',
      );
      expect(mocked.trackerTransportJournalCreate).not.toHaveBeenCalled();
      expect(mocked.trackerTransportSubmit).not.toHaveBeenCalled();
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  it('rejects freshness execution that does not reacquire the frozen tracker target', async () => {
    processSession
      .withCheckpointBoundReservationFreshnessRevalidationTarget
      .mockImplementationOnce(async action => {
        order.push('tracker-reservation-freshness-execution:enter');
        const value = await action(trackerReservationFreshnessTarget());
        order.push('tracker-reservation-freshness-execution:leave');
        return {
          value,
          receipt: {
            ...trackerReservationFreshnessExecutionReceipt(),
            trackerCheckExecutionTargetIdentityDigestHex: digest('f'),
          },
        };
      });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /tracker reservation freshness binding changed or gained authority/,
    );
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it('rejects a stable freshness snapshot that differs from the frozen tracker snapshot', async () => {
    const differentStableSnapshot = Object.freeze({
      ...trackerReservationFreshnessExecutionReceipt().actionStartSnapshot,
      headerIdHex: digest('f'),
    });
    processSession
      .withCheckpointBoundReservationFreshnessRevalidationTarget
      .mockImplementationOnce(async action => {
        order.push('tracker-reservation-freshness-execution:enter');
        const value = await action(trackerReservationFreshnessTarget());
        order.push('tracker-reservation-freshness-execution:leave');
        return {
          value,
          receipt: {
            ...trackerReservationFreshnessExecutionReceipt(),
            actionStartSnapshot: differentStableSnapshot,
            actionEndSnapshot: differentStableSnapshot,
          },
        };
      });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /tracker reservation freshness binding changed or gained authority/,
    );
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it('rejects freshness execution from a different node executable', async () => {
    processSession
      .withCheckpointBoundReservationFreshnessRevalidationTarget
      .mockImplementationOnce(async action => {
        order.push('tracker-reservation-freshness-execution:enter');
        const value = await action(trackerReservationFreshnessTarget());
        order.push('tracker-reservation-freshness-execution:leave');
        return {
          value,
          receipt: {
            ...trackerReservationFreshnessExecutionReceipt(),
            executableIdentityDigestHex: digest('f'),
          },
        };
      });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /tracker reservation freshness binding changed or gained authority/,
    );
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it('rejects a freshly observed anchor outside the reacquired process binding', async () => {
    trackerReservationFreshnessObservation = Object.freeze({
      ...trackerReservationFreshnessObservation,
      processBindingDigestHex: digest('f'),
    }) as ReturnType<typeof validTrackerReservationFreshnessObservation>;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /tracker reservation freshness binding changed or gained authority/,
    );
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it('rejects a freshness JVM result for a different signed tracker transaction', async () => {
    trackerReservationFreshnessCheck = Object.freeze({
      ...trackerReservationFreshnessCheck,
      signedTransactionIdHex: digest('f'),
    }) as ReturnType<typeof validTrackerReservationFreshnessCheck>;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /tracker reservation freshness binding changed or gained authority/,
    );
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it('tears down both reservation stores when the freshness JVM check fails', async () => {
    mocked.trackerReservationFreshnessCheck.mockRejectedValueOnce(
      new Error('synthetic freshness JVM rejection'),
    );

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(/synthetic freshness JVM rejection/);
    expect(mocked.stateClose).toHaveBeenCalledTimes(3);
    expect(order).toContain('process:stop');
  });

  it.each([
    ['primary mining', { primaryMiningDuringAction: true }],
    ['primary read-only', { primaryReadOnlyDuringAction: false }],
    ['witness read-only', { witnessReadOnlyDuringAction: false }],
    ['mining stop', { miningStoppedBeforeAction: false }],
    ['snapshot stability', { exactFrozenSnapshotStableAcrossAction: false }],
  ] as const)(
    'rejects a frozen tracker receipt with invalid %s evidence',
    async (_label, mutation) => {
      processSession.withCheckpointBoundMiningStoppedExecutionTarget
        .mockImplementationOnce(async action => ({
          value: await action(frozenExecutionTarget()),
          receipt: Object.freeze({
            ...frozenCheckpointBoundExecutionReceipt(),
            ...mutation,
          }) as unknown as ReturnType<
            typeof frozenCheckpointBoundExecutionReceipt
          >,
        }));

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        /frozen observed anchor, tracker candidate, and JVM check binding changed/,
      );

      expect(mocked.observedFrozenTrackerCheck).toHaveBeenCalledTimes(1);
      expect(order).toContain('process:stop');
    },
  );

  it('rejects frozen execution bound to a different anchor observation', async () => {
    processSession.withCheckpointBoundMiningStoppedExecutionTarget
      .mockImplementationOnce(async action => ({
        value: await action(frozenExecutionTarget()),
        receipt: Object.freeze({
          ...frozenCheckpointBoundExecutionReceipt(),
          checkpointExtensionObservationDigestHex: digest('f'),
        }),
      }));

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /frozen observed anchor, tracker candidate, and JVM check binding changed: execution checkpoint extension binding digest/,
    );
  });

  it('rejects reservation authorization when the source statement diverges from the application burn root', async () => {
    applicationCheckpointReceipt = Object.freeze({
      ...applicationCheckpointReceipt,
      checkpoint: Object.freeze({
        ...applicationCheckpointReceipt.checkpoint,
        checkpointAttestation: Object.freeze({
          ...applicationCheckpointReceipt.checkpoint.checkpointAttestation,
          checkpointStatement: Object.freeze({
            ...applicationCheckpointReceipt.checkpoint.checkpointAttestation
              .checkpointStatement,
            bridgeEventRootHex: digest('f'),
          }),
        }),
      }),
    }) as typeof applicationCheckpointReceipt;
    applicationCheckpointStage = validApplicationCheckpointStage(
      applicationCheckpointReceipt,
      packetV2,
    );

    const result =
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      );

    expect(() =>
      authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
        result.receipt,
      )
    ).toThrow(/checkpoint binding changed/);
  });

  it('rejects frozen action snapshot drift after the JVM check', async () => {
    processSession.withCheckpointBoundMiningStoppedExecutionTarget
      .mockImplementationOnce(async action => ({
        value: await action(frozenExecutionTarget()),
        receipt: Object.freeze({
          ...frozenCheckpointBoundExecutionReceipt(),
          actionEndSnapshot: Object.freeze({
            ...frozenCheckpointBoundExecutionReceipt().actionEndSnapshot,
            headerIdHex: digest('f'),
          }),
        }),
      }));

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /frozen observed anchor, tracker candidate, and JVM check binding changed/,
    );

    expect(order).toContain('process:stop');
  });

  it('rejects a stable snapshot that is not the signed observation tip', async () => {
    const wrongSnapshot = Object.freeze({
      ...frozenCheckpointBoundExecutionReceipt().actionStartSnapshot,
      headerIdHex: digest('f'),
    });
    processSession.withCheckpointBoundMiningStoppedExecutionTarget
      .mockImplementationOnce(async action => ({
        value: await action(frozenExecutionTarget()),
        receipt: Object.freeze({
          ...frozenCheckpointBoundExecutionReceipt(),
          actionStartSnapshot: wrongSnapshot,
          actionEndSnapshot: wrongSnapshot,
        }),
      }));

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      /frozen observed anchor, tracker candidate, and JVM check binding changed/,
    );

    expect(order).toContain('process:stop');
  });

  it.each([
    'execution V1 substitution',
    'observation V1 substitution',
    'check V1 substitution',
  ] as const)(
    'rejects %s in the frozen V7 root',
    async source => {
      if (source === 'execution V1 substitution') {
        processSession.withCheckpointBoundMiningStoppedExecutionTarget
          .mockImplementationOnce(async action => ({
            value: await action(frozenExecutionTarget()),
            receipt: Object.freeze({
              ...frozenCheckpointBoundExecutionReceipt(),
              schema:
                'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
              version: 1,
            }) as unknown as ReturnType<
              typeof frozenCheckpointBoundExecutionReceipt
            >,
          }));
      } else if (source === 'observation V1 substitution') {
        frozenCheckpointBoundObservation = Object.freeze({
          ...frozenCheckpointBoundObservation,
          schema:
            'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v1',
          version: 1,
        }) as unknown as typeof frozenCheckpointBoundObservation;
      } else {
        frozenObservedTrackerCheck = Object.freeze({
          ...frozenObservedTrackerCheck,
          schema:
            'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v1',
          version: 1,
        }) as unknown as typeof frozenObservedTrackerCheck;
      }

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        /frozen observed anchor, tracker candidate, and JVM check binding changed/,
      );

      expect(order).toContain('process:stop');
    },
  );

  it('tears down the isolated nodes when the frozen JVM check fails', async () => {
    mocked.observedFrozenTrackerCheck.mockRejectedValueOnce(
      new Error('frozen local JVM check rejected'),
    );

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(/frozen local JVM check rejected/);

    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
  });

  it('rejects a tracker context that loses observed-anchor provenance', async () => {
    observedTrackerContext = Object.freeze({
      ...observedTrackerContext,
      trackerTransition: Object.freeze({
        ...observedTrackerContext.trackerTransition,
        anchorContextProvenance:
          'eip0045-validity-tracker-canonical-synthetic-header-context',
      }),
    }) as unknown as ReturnType<typeof validObservedTrackerContext>;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(/observed anchor, tracker candidate, and JVM check binding changed/);

    expect(mocked.observedTrackerCheck).toHaveBeenCalledTimes(1);
    expect(order).toContain('process:stop');
  });

  it('rejects a tracker check whose signed transaction identity diverges', async () => {
    observedTrackerCheck = Object.freeze({
      ...observedTrackerCheck,
      signedTransactionIdHex: digest('f'),
    }) as ReturnType<typeof validObservedTrackerCheck>;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(/observed anchor, tracker candidate, and JVM check binding changed/);

    expect(mocked.observedTrackerCheckAssert).toHaveBeenCalled();
    expect(order).toContain('process:stop');
  });

  it.each([
    'active observation',
    'active execution receipt',
  ] as const)(
    'rejects %s process-binding drift before promoting the tracker check',
    async source => {
      if (source === 'active observation') {
        checkpointBoundObservation = Object.freeze({
          ...checkpointBoundObservation,
          processBindingDigestHex: digest('0'),
        }) as typeof checkpointBoundObservation;
      } else {
        processSession.withCheckpointBoundMiningActiveExecutionTarget
          .mockImplementationOnce(async action => ({
            value: await action(activeExecutionTarget()),
            receipt: Object.freeze({
              ...checkpointBoundExecutionReceipt(),
              processBindingDigestHex: digest('0'),
            }),
          }));
      }

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        /observed anchor, tracker candidate, and JVM check binding changed/,
      );

      expect(mocked.observedTrackerCheck).toHaveBeenCalledTimes(1);
      expect(order).toContain('process:stop');
    },
  );

  it.each([
    'active observation anchor index',
    'active execution credential claim',
    'tracker check target identity',
    'tracker check anchor identity',
  ] as const)(
    'rejects isolated %s drift before exposing the tracker result',
    async source => {
      if (source === 'active observation anchor index') {
        checkpointBoundObservation = Object.freeze({
          ...checkpointBoundObservation,
          anchorContextIndex: checkpointBoundObservation.anchorContextIndex + 1,
        }) as typeof checkpointBoundObservation;
      } else if (source === 'active execution credential claim') {
        processSession.withCheckpointBoundMiningActiveExecutionTarget
          .mockImplementationOnce(async action => ({
            value: await action(activeExecutionTarget()),
            receipt: Object.freeze({
              ...checkpointBoundExecutionReceipt(),
              trackerAdmissionMiningCredentialConsumedOnce: false,
            }) as unknown as ReturnType<typeof checkpointBoundExecutionReceipt>,
          }));
      } else if (source === 'tracker check target identity') {
        observedTrackerCheck = Object.freeze({
          ...observedTrackerCheck,
          target: Object.freeze({
            ...observedTrackerCheck.target,
            executionTargetIdentityDigestHex: digest('0'),
          }),
        }) as ReturnType<typeof validObservedTrackerCheck>;
      } else {
        observedTrackerCheck = Object.freeze({
          ...observedTrackerCheck,
          anchorHeaderIdHex: digest('0'),
        }) as ReturnType<typeof validObservedTrackerCheck>;
      }

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        /observed anchor, tracker candidate, and JVM check binding changed/,
      );

      expect(mocked.observedTrackerCheck).toHaveBeenCalledTimes(1);
      expect(order).toContain('process:stop');
    },
  );

  it.each([
    'extension value',
    'process binding',
    'target genesis',
    'prior snapshot',
    'mined snapshot',
    'anchor height',
    'anchor header',
  ] as const)(
    'rejects checkpoint-to-anchor %s drift',
    async field => {
      if (field === 'extension value') {
        checkpointAnchorObservation = Object.freeze({
          ...checkpointAnchorObservation,
          extensionValueHex: 'ff'.repeat(64),
        }) as typeof checkpointAnchorObservation;
        mocked.checkpointObserve.mockResolvedValueOnce(checkpointAnchorObservation);
      } else if (field === 'process binding') {
        checkpointAnchorObservation = Object.freeze({
          ...checkpointAnchorObservation,
          processBindingDigestHex: digest('f'),
        }) as typeof checkpointAnchorObservation;
      } else if (field === 'target genesis') {
        checkpointAnchorObservation = Object.freeze({
          ...checkpointAnchorObservation,
          targetGenesisHeaderIdHex: digest('f'),
        }) as typeof checkpointAnchorObservation;
      } else if (field === 'anchor height') {
        checkpointAnchorObservation = Object.freeze({
          ...checkpointAnchorObservation,
          anchorHeight: 140,
        }) as unknown as typeof checkpointAnchorObservation;
      } else if (field === 'anchor header') {
        checkpointAnchorObservation = Object.freeze({
          ...checkpointAnchorObservation,
          anchorHeaderIdHex: digest('f'),
        }) as typeof checkpointAnchorObservation;
      } else if (field === 'mined snapshot') {
        processSession.withCheckpointExtensionMiningTarget
          .mockImplementationOnce(async (extensionValueHex, _policy, action) => ({
            value: await action(executionTarget()),
            receipt: {
              ...checkpointMiningReceipt(extensionValueHex),
              minedSnapshot: {
                ...checkpointMiningReceipt(extensionValueHex).minedSnapshot,
                fullHeight: 140,
              },
            } as unknown as ReturnType<typeof checkpointMiningReceipt>,
          }));
      } else {
        processSession.withCheckpointExtensionMiningTarget
          .mockImplementationOnce(async (extensionValueHex, _policy, action) => ({
            value: await action(executionTarget()),
            receipt: {
              ...checkpointMiningReceipt(extensionValueHex),
              priorSnapshot: {
                ...processReceipt().finalSnapshot,
                headerIdHex: digest('f'),
              },
            },
          }));
      }

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(/checkpoint-to-anchor binding changed/);
    },
  );

  it.each([
    ['encoded statement', 'encodedHex', 'ff'],
    ['statement identity', 'statementIdHex', digest('f')],
  ] as const)(
    'rejects isolated %s drift returned by the tracker builder',
    async (_label, field, value) => {
      trackerContext = Object.freeze({
        ...trackerContext,
        statement: Object.freeze({
          ...trackerContext.statement,
          [field]: value,
        }),
      }) as ReturnType<typeof validTrackerContext>;

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        'isolated devnet checkpoint-to-tracker candidate binding changed',
      );

      expect(mocked.trackerBuild).toHaveBeenCalledTimes(1);
      expect(order).toContain('dispose:application-checkpoint-v3');
      expect(order).toContain('dispose:setup');
      expect(order).toContain('process:stop');
    },
  );

  it.each([
    ['contract identity binding', 'contractIdentityBound', false],
    ['statement/profile validation', 'statementAndProfileValidated', false],
    ['anchor membership construction', 'anchorMembershipConstructed', false],
    ['context-extension round trip', 'exactContextExtensionRoundTrip', false],
    ['AVL transition construction', 'avlTransitionConstructed', false],
    ['source signature authority', 'sourceSignaturesVerifiedOnChain', true],
    ['JVM acceptance authority', 'jvmReductionAccepted', true],
    ['node-check authority', 'nodeCheckPerformed', true],
    ['profile activation', 'profileActivated', true],
    ['signing authority', 'signingPerformed', true],
    ['submission authority', 'submissionPerformed', true],
    ['broadcast authority', 'broadcastPerformed', true],
    ['funds authority', 'fundsAuthorityEstablished', true],
    ['Gate 5 closure', 'gate5Closed', true],
    ['trustless status', 'trustlessStatusEstablished', true],
  ] as const)(
    'rejects one isolated tracker boundary mutation: %s',
    async (_label, field, value) => {
      trackerContext = Object.freeze({
        ...trackerContext,
        boundaries: Object.freeze({
          ...trackerContext.boundaries,
          [field]: value,
        }),
      }) as ReturnType<typeof validTrackerContext>;

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        'isolated devnet tracker candidate context changed or gained authority',
      );

      expect(mocked.trackerBuild).toHaveBeenCalledTimes(1);
      expect(order).toContain('dispose:application-checkpoint-v3');
      expect(order).toContain('dispose:setup');
      expect(order).toContain('process:stop');
    },
  );

  it.each([
    ['contract', 'sourceSignaturesVerifiedOnChain'],
    ['contract', 'jvmReductionAccepted'],
    ['contract', 'profileActivated'],
    ['contract', 'signingPerformed'],
    ['contract', 'submissionPerformed'],
    ['contract', 'broadcastPerformed'],
    ['contract', 'fundsAuthorityEstablished'],
    ['contract', 'gate5Closed'],
    ['contract', 'trustlessStatusEstablished'],
    ['statement', 'sourceSignaturesVerifiedOnChain'],
  ] as const)(
    'rejects one isolated nested tracker authority mutation: %s.%s',
    async (section, field) => {
      trackerContext = Object.freeze({
        ...trackerContext,
        [section]: Object.freeze({
          ...trackerContext[section],
          [field]: true,
        }),
      }) as ReturnType<typeof validTrackerContext>;

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        'isolated devnet tracker candidate context changed or gained authority',
      );

      expect(mocked.trackerBuild).toHaveBeenCalledTimes(1);
      expect(order).toContain('dispose:application-checkpoint-v3');
      expect(order).toContain('dispose:setup');
      expect(order).toContain('process:stop');
    },
  );

  it('rejects tracker setup output drift before the candidate builder runs', async () => {
    trackerSetupMaterial = Object.freeze({
      ...trackerSetupMaterial,
      outputs: Object.freeze([Object.freeze({
        ...trackerSetupMaterial.outputs[0]!,
        boxId: digest('f'),
      })]),
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      'isolated devnet tracker setup output changed during exact rematerialization',
    );

    expect(mocked.trackerBuild).not.toHaveBeenCalled();
    expect(order).toContain('tracker:setup:materialize');
    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
  });

  it.each([
    ['confirmation height', { confirmationHeight: 121 }],
    ['confirmation header', { confirmationHeaderIdHex: digest('f') }],
  ] as const)('rejects tracker %s drift after candidate construction', async (
    _label,
    mutation,
  ) => {
    const baselineObserve = observerPort.observe.getMockImplementation()!;
    observerPort.observe.mockImplementation(async expectedTxId => {
      const confirmation = await baselineObserve(expectedTxId);
      if (
        expectedTxId === digest('4')
        && order.includes('tracker:candidate:build')
      ) {
        return Object.freeze({
          ...confirmation,
          ...mutation,
        });
      }
      return confirmation;
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      'isolated devnet checkpoint-to-tracker candidate binding changed',
    );

    expect(mocked.trackerBuild).toHaveBeenCalledTimes(1);
    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
  });

  it('tears down every owned capability when tracker construction rejects', async () => {
    mocked.trackerBuild.mockImplementationOnce(async () => {
      order.push('tracker:candidate:build');
      throw new Error('synthetic tracker candidate rejection');
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow('synthetic tracker candidate rejection');

    expect(order).toContain('tracker:setup:materialize');
    expect(order).toContain('tracker:candidate:build');
    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
  });

  it('snapshots source-acceptance build roots before the first async build boundary', async () => {
    const input = pegInApplicationCheckpointRootInput() as unknown as {
      frontierApplicationRunner: {
        temporaryDirectoryRoot: string;
        cargoDependencyCacheDirectory: string;
      };
    };
    mocked.build.mockImplementationOnce(async () => {
      order.push('build');
      input.frontierApplicationRunner.temporaryDirectoryRoot =
        'mutated/frontier-temporary';
      input.frontierApplicationRunner.cargoDependencyCacheDirectory =
        'mutated/frontier-cargo-cache';
      return validBuild();
    });

    await runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
      input as never,
    );

    expect(mocked.sourceHistory).toHaveBeenCalledWith(
      expect.anything(),
      {
        temporaryDirectoryRoot: 'reviewed/frontier-temporary',
        sharedCargoHomeRoot: 'reviewed/frontier-cargo-cache',
      },
    );
  });

  it('rejects a cloned application packet and tears down the campaign', async () => {
    applicationCheckpointReceipt = Object.freeze({
      ...applicationCheckpointReceipt,
      packet: structuredClone(packetV2),
    }) as never;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      'isolated devnet application-checkpoint producer-to-consumer binding changed',
    );

    expect(order).toContain('peg-in:application:execute');
    expect(order).toContain('peg-in:checkpoint:attest');
    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
  });

  it('tears down every owned capability when the application runner rejects', async () => {
    mocked.applicationCheckpointContinuation.mockImplementationOnce(() => ({
      signer: packetSigner(),
      dispose: vi.fn(() => order.push('dispose:application-checkpoint-v3')),
      produce: vi.fn(async () => {
        order.push('packet-v3:produce');
        return packetV2;
      }),
      executeApplication: vi.fn(async () => {
        order.push('peg-in:application:execute');
        throw new Error('synthetic Frontier application runner rejection');
      }),
      attestCheckpoint: vi.fn(),
      complete: vi.fn(),
    }));

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow('synthetic Frontier application runner rejection');

    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:application:execute')).toBeLessThan(
      order.indexOf('dispose:application-checkpoint-v3'),
    );
  });

  it('rejects an invalid application runner before building or starting the target', async () => {
    mocked.applicationRunnerPreflight.mockImplementationOnce(() => {
      order.push('peg-in:application-runner:preflight:reject');
      throw new Error('synthetic invalid application runner path');
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow('synthetic invalid application runner path');

    expect(order).toEqual(['peg-in:application-runner:preflight:reject']);
    expect(mocked.build).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
    expect(mocked.applicationCheckpointContinuation).not.toHaveBeenCalled();
  });

  it('rejects committed-vault drift after the application burn before checkpoint attestation', async () => {
    const baselineObserve = observerPort.observe.getMockImplementation()!;
    observerPort.observe.mockImplementation(async expectedTxId => {
      const confirmation = await baselineObserve(expectedTxId);
      if (
        expectedTxId === digest('9')
        && order.includes('peg-in:application:execute')
      ) {
        return Object.freeze({
          ...confirmation,
          confirmationHeaderIdHex: digest('f'),
        });
      }
      return confirmation;
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
        pegInApplicationCheckpointRootInput(),
      ),
    ).rejects.toThrow(
      'isolated devnet committed reserve changed before checkpoint attestation',
    );

    const continuation =
      mocked.applicationCheckpointContinuation.mock.results[0]!.value;
    expect(continuation.executeApplication).toHaveBeenCalledTimes(1);
    expect(continuation.attestCheckpoint).not.toHaveBeenCalled();
    expect(order).toContain('dispose:application-checkpoint-v3');
    expect(order).toContain('process:stop');
  });

  it('rejects a post-application confirmation after its deadline and tears down before attestation', async () => {
    const baselineObserve = observerPort.observe.getMockImplementation();
    if (baselineObserve === undefined) {
      throw new Error('observer mock is unavailable');
    }
    const before = localJournalDirectories();
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    observerPort.observe.mockImplementation(async (...args) => {
      const observation = await baselineObserve(...args);
      if (
        args[0] === digest('9')
        && order.includes('peg-in:application:execute')
      ) {
        now += 2 * 60_000 + 1;
      }
      return observation;
    });

    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3(
          pegInApplicationCheckpointRootInput(),
        ),
      ).rejects.toThrow(
        /application-checkpoint-admission transaction confirmation exceeded its deadline/u,
      );

      const continuation =
        mocked.applicationCheckpointContinuation.mock.results[0]!.value;
      expect(continuation.executeApplication).toHaveBeenCalledTimes(1);
      expect(continuation.attestCheckpoint).not.toHaveBeenCalled();
      expect(order).toContain('dispose:application-checkpoint-v3');
      expect(order).toContain('dispose:setup');
      expect(order).toContain('process:stop');
      expect(mocked.stateClose).toHaveBeenCalledTimes(1);
      expect(processSession.stop).toHaveBeenCalledTimes(1);
      expect(
        order.filter(value => value === 'dispose:application-checkpoint-v3'),
      ).toHaveLength(1);
      expect(order.filter(value => value === 'dispose:setup')).toHaveLength(1);
      expect(order.filter(value => value === 'process:stop')).toHaveLength(1);
      expect(order.indexOf('peg-in:application:execute')).toBeLessThan(
        order.indexOf('observe:committedVault:post-application'),
      );
      expect(
        order.indexOf('observe:committedVault:post-application'),
      ).toBeLessThan(order.indexOf('dispose:application-checkpoint-v3'));
      expect(order.indexOf('dispose:application-checkpoint-v3')).toBeLessThan(
        order.indexOf('dispose:setup'),
      );
      expect(order.indexOf('dispose:setup')).toBeLessThan(
        order.indexOf('process:stop'),
      );
      expect(localJournalDirectories()).toEqual(before);
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects an invalid Frontier consumer plan before building or starting the target', async () => {
    mocked.frontierConsumerPreflight.mockImplementationOnce(() => {
      order.push('peg-in:mint-proof:consumer:preflight:reject');
      throw new Error('synthetic invalid Frontier consumer path');
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
        pegInMintProofRootInput(),
      ),
    ).rejects.toThrow('synthetic invalid Frontier consumer path');

    expect(order).toEqual(['peg-in:mint-proof:consumer:preflight:reject']);
    expect(mocked.build).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects a source application that the deterministic Frontier LAB cannot deploy', async () => {
    const input = pegInMintProofRootInput() as unknown as {
      lifecycle: {
        sourceHistory: {
          acceptance: {
            bridgeAddress: string;
          };
        };
      };
    };
    input.lifecycle.sourceHistory.acceptance.bridgeAddress =
      '0x0606060606060606060606060606060606060606';

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
        input as never,
      ),
    ).rejects.toThrow(
      'Frontier LAB proof application differs from the deterministic deployment',
    );

    expect(order).toEqual([]);
    expect(mocked.build).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('tears down every owned capability when the Frontier proof consumer rejects', async () => {
    mocked.frontierConsumer.mockImplementationOnce(async () => {
      order.push('peg-in:mint-proof:consumer');
      throw new Error('synthetic Frontier consumer rejection');
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
        pegInMintProofRootInput(),
      ),
    ).rejects.toThrow('synthetic Frontier consumer rejection');

    expect(order).toContain('peg-in:mint-proof:produce');
    expect(order).toContain('dispose:packet-v2');
    expect(order).toContain('dispose:setup');
    expect(order).toContain('process:stop');
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:mint-proof:consumer')).toBeLessThan(
      order.indexOf('dispose:packet-v2'),
    );
    expect(order.indexOf('dispose:packet-v2')).toBeLessThan(
      order.indexOf('dispose:setup'),
    );
    expect(order.indexOf('dispose:setup')).toBeLessThan(
      order.indexOf('process:stop'),
    );
  });

  it.each([
    ['packet receipt', () => {
      packetProof = Object.freeze({
        ...packetProof,
        packetReceiptDigestHex: digest('f'),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['target descriptor', () => {
      packetProof = Object.freeze({
        ...packetProof,
        targetDescriptorDigestHex: digest('f'),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['packet source-proof receipt', () => {
      packetProof = Object.freeze({
        ...packetProof,
        sourceProofReceiptDigestHex: digest('f'),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['source evidence', () => {
      packetProof = Object.freeze({
        ...packetProof,
        sourceProof: Object.freeze({
          ...packetProof.sourceProof,
          sourceEvidenceReceiptDigestHex: digest('f'),
        }),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['mint draft', () => {
      packetProof = Object.freeze({
        ...packetProof,
        sourceProof: Object.freeze({
          ...packetProof.sourceProof,
          mintReservationDraftDigestHex: digest('f'),
        }),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['statement identity', () => {
      packetProof = Object.freeze({
        ...packetProof,
        sourceProof: Object.freeze({
          ...packetProof.sourceProof,
          mintReservationStatementIdHex: digest('f'),
        }),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['mint identity', () => {
      packetProof = Object.freeze({
        ...packetProof,
        sourceProof: Object.freeze({
          ...packetProof.sourceProof,
          mintIdentityHex: digest('f'),
        }),
      }) as never;
      consumerReceipt = validConsumerReceipt(
        packetV2,
        mintDraft,
        evidenceReceipt,
        packetProof,
      );
    }],
    ['consumer proof object', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        packetProof: structuredClone(packetProof),
      }) as never;
    }],
    ['consumer receipt binding', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        packetProofReceiptDigestHex: digest('f'),
      }) as never;
    }],
    ['consumer source-proof receipt', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        sourceProofReceiptDigestHex: digest('f'),
      }) as never;
    }],
    ['consumer source evidence', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        sourceEvidenceReceiptDigestHex: digest('f'),
      }) as never;
    }],
    ['consumer target descriptor', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        targetDescriptorDigestHex: digest('f'),
      }) as never;
    }],
    ['consumer statement identity', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        statementIdHex: digest('f'),
      }) as never;
    }],
    ['consumer mint identity', () => {
      consumerReceipt = Object.freeze({
        ...consumerReceipt,
        mintIdentityHex: digest('f'),
      }) as never;
    }],
  ] as const)(
    'rejects an isolated %s join mutation and tears down the campaign',
    async (_label, mutate) => {
      mutate();

      await expect(
        runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1(
          pegInMintProofRootInput(),
        ),
      ).rejects.toThrow(/binding changed/u);

      expect(mocked.frontierConsumer).toHaveBeenCalledTimes(1);
      expect(mocked.stateClose).toHaveBeenCalledTimes(1);
      expect(order).toContain('dispose:packet-v2');
      expect(order).toContain('dispose:setup');
      expect(order).toContain('process:stop');
      expect(order.indexOf('peg-in:mint-proof:consumer')).toBeLessThan(
        order.indexOf('dispose:packet-v2'),
      );
    },
  );

  it('fits all eleven committed-vault confirmation windows inside the action envelope', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const baselineObserve = observerPort.observe.getMockImplementation();
    if (baselineObserve === undefined) {
      throw new Error('observer mock is unavailable');
    }
    let confirmationCalls = 0;
    observerPort.observe.mockImplementation(async (...args) => {
      confirmationCalls += 1;
      now += 119_000;
      return await baselineObserve(...args);
    });
    mocked.pegInSourceLockTransport.mockImplementationOnce(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:source-lock:transport');
        now += 7 * 60_000;
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('4'),
        };
      }),
    }));

    try {
      const result =
        await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1(
          pegInRootInput(),
        );

      expect(result.receipt.status)
        .toBe('peg_in_source_lock_consumed_into_committed_reserve');
      expect(confirmationCalls).toBe(11);
      expect(now).toBeLessThan(30 * 60_000);
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects post-check observation after pre-transport authorization', async () => {
    postCheckFundingObservation.target.tipHeight = 134;
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding observation is not a fresh setup successor/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects confirmation before pre-transport authorization', async () => {
    preTransportFundingObservation.target.tipHeight = 136;
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock execution chronology changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects confirmation after the managed process final height', async () => {
    processSession.withMiningActiveExecutionTarget.mockImplementationOnce(
      async action => {
        order.push('execution:enter');
        const value = await action(executionTarget());
        order.push('execution:leave');
        return { value, receipt: processReceipt(134) };
      },
    );
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock execution chronology changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects signed material hidden in an opaque candidate subtree', async () => {
    mocked.pegInCandidateBuild.mockImplementationOnce(async input => {
      const candidate = structuredClone(validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      )) as any;
      candidate.depositPacket.reserve = {
        signedTransactionBytesHex: 'ab'.repeat(64),
      };
      return candidate;
    });
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/signed or capability material/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects cyclic data hidden in an opaque candidate subtree', async () => {
    mocked.pegInCandidateBuild.mockImplementationOnce(async input => {
      const candidate = structuredClone(validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      )) as any;
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      candidate.depositPacket.reserve = cyclic;
      return candidate;
    });
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/must not contain cyclic data/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a check receipt that is not bound to the exact unsigned transaction', async () => {
    mocked.pegInSourceLockCheck.mockImplementationOnce(async input => ({
      ...validPegInSourceLockCheck(input, currentBatch.targetBinding),
      unsignedTransactionIdHex: digest('0'),
    }));
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock check binding changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects source funding drift after the JVM node check', async () => {
    postCheckFundingObservation.genesisInputs.tracker.value = '999999999';
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding changed after source-lock check/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['reused setup input', () => {
      fundingObservation.genesisBoxIds.tracker = digest('1');
      fundingObservation.genesisInputs.tracker.boxId = digest('1');
    }],
    ['wrong target genesis', () => {
      fundingObservation.target.genesisHeaderIdHex = digest('f');
    }],
    ['observation before setup confirmation', () => {
      fundingObservation.target.tipHeight = 121;
    }],
    ['setup transaction output', () => {
      fundingObservation.genesisInputs.tracker.transactionId =
        currentBatch.orderedTransactions[0]!.issuance.unsignedTransactionIdHex;
    }],
  ])('rejects peg-in funding with %s', async (_label, mutate) => {
    mutate();
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding observation is not a fresh setup successor/);
    expect(mocked.pegInCandidateBuild).not.toHaveBeenCalled();
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects funding drift after candidate construction', async () => {
    postCandidateFundingObservation.genesisBoxIds.tracker = digest('f');
    postCandidateFundingObservation.genesisInputs.tracker.boxId = digest('f');
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding changed after candidate construction/);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a process receipt bound to another target', async () => {
    processSession.withMiningActiveExecutionTarget.mockImplementationOnce(
      async action => {
        order.push('execution:enter');
        const value = await action(executionTarget());
        order.push('execution:leave');
        return {
          value,
          receipt: {
            ...processReceipt(),
            executionTargetIdentityDigestHex: digest('f'),
          },
        };
      },
    );
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/managed process binding changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['alternating accessor', (receipt: Record<PropertyKey, unknown>) => {
      let reads = 0;
      Object.defineProperty(receipt, 'buildIdentityDigestHex', {
        enumerable: true,
        get: () => digest(reads++ === 0 ? '3' : 'f'),
      });
    }],
    ['custom prototype', (receipt: Record<PropertyKey, unknown>) => {
      Object.setPrototypeOf(receipt, { hiddenCapability: () => undefined });
    }],
    ['symbol capability', (receipt: Record<PropertyKey, unknown>) => {
      receipt[Symbol('hidden')] = () => undefined;
    }],
    ['non-enumerable capability', (receipt: Record<PropertyKey, unknown>) => {
      Object.defineProperty(receipt, 'hiddenCapability', {
        enumerable: false,
        value: () => undefined,
      });
    }],
  ])('rejects producer-owned %s data', async (_label, mutate) => {
    const build = validBuild();
    mutate(build.receipt as unknown as Record<PropertyKey, unknown>);
    mocked.build.mockResolvedValueOnce(build);
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      ),
    ).rejects.toThrow(/capability-free plain data|custom prototypes|symbol-keyed|enumerable data fields/);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects setup rollback detected after candidate construction', async () => {
    journalPort.revalidateConfirmed
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/setup changed after peg-in candidate construction/);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid peg-in data before building or starting a target', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1({
        ...(pegInRootInput() as unknown as Record<string, unknown>),
        pegIn: {
          amountNanoErg: '05000000',
          recipientAddressHex: 'b1'.repeat(20),
        },
      } as never),
    ).rejects.toThrow(/amount must be canonical/);
    expect(mocked.build).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('does not authorize a successor when predecessor confirmation fails', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    observerPort.observe.mockImplementation(async () => {
      now = 2 * 60_000 + 1;
      throw new Error('dual-node confirmation disagreement');
    });
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
          rootInput(),
        ),
      ).rejects.toThrow(
        /isolated setup:tracker transaction confirmation remained unavailable/,
      );
      expect(order.filter(value => value.startsWith('execute:'))).toEqual([
        'execute:tracker',
      ]);
      expect(order).not.toContain('ack:tracker');
      expect(mocked.stateClose).toHaveBeenCalledTimes(1);
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not transport when the managed action lacks a full confirmation window', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const baselineAuthorize = authorizerPort.authorize.getMockImplementation();
    if (baselineAuthorize === undefined) {
      throw new Error('authorizer mock is unavailable');
    }
    authorizerPort.authorize.mockImplementation((...args) => {
      const authorization = baselineAuthorize(...args);
      now = 28 * 60_000 + 1;
      return authorization;
    });

    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
          rootInput(),
        ),
      ).rejects.toThrow(/lacks a full confirmation window/);
      expect(order).not.toContain('transport:tracker');
      expect(order).not.toContain('ack:tracker');
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('retains the journal if an unresolved attempt outlives proven node cleanup', async () => {
    const before = localJournalDirectories();
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    observerPort.observe.mockImplementation(async () => {
      now = 2 * 60_000 + 1;
      throw new Error('dual-node confirmation disagreement');
    });
    processSession.stop.mockRejectedValue(new Error('node termination unproven'));
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
          rootInput(),
        ),
      ).rejects.toThrow(/teardown was incomplete/);
      const retained = [...localJournalDirectories()]
        .filter(directory => !before.has(directory));
      expect(retained).toHaveLength(1);
      expect(order.filter(value => value.startsWith('execute:'))).toEqual([
        'execute:tracker',
      ]);
      expect(order).not.toContain('ack:tracker');
    } finally {
      clock.mockRestore();
      for (const directory of localJournalDirectories()) {
        if (before.has(directory)) continue;
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects creation-height drift before any transaction can execute', async () => {
    currentBatch.orderedTransactions[1]!.issuance.predictedStateOutput
      .creationHeight += 1;
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      ),
    ).rejects.toThrow(/batch order or anchor changed/);
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(mocked.transport).not.toHaveBeenCalled();
  });

  it('keeps the execution composition static and exposes no injected ports', () => {
    const source = readFileSync(join(
      import.meta.dirname,
      'substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    ), 'utf8');
    expect(source).toContain('const STATIC_EXECUTION_MANIFEST');
    expect(source).toContain(
      'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    );
    expect(source).toContain(
      'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    );
    expect(source).toContain('replacementPortAccepted: false');
    expect(source).not.toMatch(/export interface .*Deps/u);
    expect(source).not.toContain('process.env');
  });

  it('keeps the check receipt parser pinned to the exact static manifest', () => {
    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    ).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    );
  });

  it('keeps the execution receipt parser pinned to the exact static manifest', () => {
    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
    ).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    );
  });
});

function executeThroughPorts(order: string[]) {
  return async (input: any, ports: any) => {
    order.push(`execute:${input.role}`);
    const admission = Object.freeze({
      schema: 'e2s.substrate-federated-local-devnet-genesis-execution.v1',
      ...input,
      inputBoxIds: Object.freeze([...input.inputBoxIds]),
      admissionDigestHex: digest('7'),
    });
    const signedEvidence = await ports.signer.sign(admission);
    const signed = Object.freeze({
      admission,
      signedTransactionDigestHex: signedEvidence.signedTransactionDigestHex,
      signerArtifact: signedEvidence.signerArtifact,
    });
    const checkedEvidence = await ports.checker.check(signed);
    const checked = Object.freeze({
      signed,
      checkResponseDigestHex: checkedEvidence.checkResponseDigestHex,
      checkerArtifact: checkedEvidence.checkerArtifact,
    });
    const postCheckEvidence = await ports.revalidator.revalidate(
      checked,
      'post-check',
    );
    const revalidated = Object.freeze({ checked, postCheckEvidence });
    const preTransportEvidence = await ports.revalidator.revalidate(
      checked,
      'pre-transport',
    );
    const authorizationEvidence = ports.broadcastAuthorizer.authorize(
      revalidated,
      preTransportEvidence,
    );
    const authorization = Object.freeze({
      revalidated,
      preTransportEvidence,
      ...authorizationEvidence,
    });
    const candidate = Object.freeze({ authorization });
    const durableEvidence = ports.journal.reserve(candidate);
    const durable = Object.freeze({
      candidate,
      ...durableEvidence,
    });
    const submission = await ports.transport.submit(durable);
    const finalized = ports.journal.finalize({
      attempt: durable,
      submission,
    });
    return Object.freeze({
      status: submission.status,
      role: input.role,
      expectedTxId: input.expectedTxId,
      submittedTxId: submission.submittedTxId,
      confirmationStatus: 'pending',
      confirmationDigestHex: null,
      transportAttempted: true,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: durable.durableAttemptDigestHex,
      journalDigestHex: finalized.journalDigestHex,
    });
  };
}

function validObserver(order: string[]) {
  const observationCount = new Map<string, number>();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1',
    reconciliationIdentityDigestHex: digest('6'),
    observe: vi.fn(async (
      expectedTxId: string,
    ): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>> => {
      if (expectedTxId === digest('8')) {
        const round = observationCount.get(expectedTxId) ?? 0;
        observationCount.set(expectedTxId, round + 1);
        order.push('observe:sourceLock');
        return {
          ...confirmation(expectedTxId, 3, round),
          confirmationHeight: 135,
          observedAtHeight: 140,
        } as const;
      }
      if (expectedTxId === digest('9')) {
        const round = observationCount.get(expectedTxId) ?? 0;
        observationCount.set(expectedTxId, round + 1);
        const postApplication = order.includes('peg-in:application:execute');
        order.push(
          postApplication
            ? 'observe:committedVault:post-application'
            : 'observe:committedVault',
        );
        return {
          ...confirmation(expectedTxId, 4, round),
          confirmationHeight: 140,
          confirmationHeaderIdHex: digest('7'),
          observedAtHeight: postApplication ? 220 : 140,
        } as const;
      }
      if (
        expectedTxId === digest('4')
        && order.includes('peg-in:checkpoint:attest')
      ) {
        order.push('observe:tracker:post-checkpoint');
        return {
          ...confirmation(expectedTxId, 0, 1),
          observedAtHeight: 221,
        } as const;
      }
      if (
        expectedTxId === digest('c')
        && order.includes('peg-in:checkpoint:attest')
      ) {
        order.push('observe:tracker-admission');
        return {
          ...confirmation(expectedTxId, 0, 1),
          observedAtHeight: 221,
        } as const;
      }
      const index = setupTransactions().findIndex(value =>
        value.issuance.unsignedTransactionIdHex === expectedTxId
      );
      const role = ['tracker', 'duplicatePrevention', 'pooledReserve'][index];
      const round = observationCount.get(expectedTxId) ?? 0;
      observationCount.set(expectedTxId, round + 1);
      order.push(`observe:${role}`);
      return confirmation(expectedTxId, index, round);
    }),
  };
}

function validAuthorizer(order: string[]) {
  let nextOrdinal = 0;
  let pending: string | null = null;
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v1',
    authorize: vi.fn((revalidated: any) => {
      const role = revalidated.checked.signed.admission.role;
      if (pending !== null || role !== ROLE_ORDER[nextOrdinal]) {
        throw new Error('authorization order changed');
      }
      pending = role;
      order.push(`authorize:${role}`);
      return {
        authorizationDigestHex: digest(String(nextOrdinal + 1)),
        authorizationArtifact: {},
      };
    }),
    acknowledgeCanonicalConfirmation: vi.fn((role: string) => {
      if (pending !== role) throw new Error('confirmation role changed');
      order.push(`ack:${role}`);
      pending = null;
      nextOrdinal += 1;
    }),
    nextOrdinal: () => nextOrdinal,
  };
}

function validJournal(order: string[]) {
  return {
    journal: {
      reserve: vi.fn((candidate: any) => {
        const role = candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`journal:reserve:${role}`);
        return {
          durableAttemptDigestHex: digest('4'),
          reconciliationIdentityDigestHex: digest('6'),
          durableArtifact: {},
        };
      }),
      finalize: vi.fn(({ attempt, submission }: any) => {
        const role = attempt.candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`journal:finalize:${role}`);
        return {
          status: submission.status,
          journalDigestHex: digest('5'),
        };
      }),
      confirm: vi.fn(),
    },
    reconcileActive: vi.fn(async () => {
      order.push('journal:reconcile');
      return 'confirmed';
    }),
    revalidateConfirmed: vi.fn(async () => {
      order.push('journal:revalidate');
      return 3;
    }),
  };
}

function validProcessSession(order: string[]) {
  return {
    startMining: vi.fn(async () => {
      order.push('mining:start');
    }),
    withMiningActiveExecutionTarget: vi.fn(async action => {
      order.push('execution:enter');
      const value = await action(executionTarget());
      order.push('execution:leave');
      return { value, receipt: processReceipt() };
    }),
    withCheckpointExtensionMiningTarget: vi.fn(async (
      extensionValueHex,
      _policy,
      action,
    ) => {
      order.push('checkpoint-mining:enter');
      const value = await action(readOnlyTarget());
      order.push('checkpoint-mining:leave');
      return {
        value,
        receipt: checkpointMiningReceipt(extensionValueHex),
      };
    }),
    withCheckpointBoundMiningActiveExecutionTarget: vi.fn(async action => {
      order.push('checkpoint-bound-execution:enter');
      const value = await action(activeExecutionTarget());
      order.push('checkpoint-bound-execution:leave');
      return {
        value,
        receipt: checkpointBoundExecutionReceipt(),
      };
    }),
    withCheckpointBoundMiningStoppedExecutionTarget: vi.fn(async action => {
      order.push('checkpoint-bound-frozen-execution:enter');
      const value = await action(frozenExecutionTarget());
      order.push('checkpoint-bound-frozen-execution:leave');
      return {
        value,
        receipt: frozenCheckpointBoundExecutionReceipt(),
      };
    }),
    withCheckpointBoundReservationFreshnessRevalidationTarget: vi.fn(
      async action => {
        order.push('tracker-reservation-freshness-execution:enter');
        const value = await action(trackerReservationFreshnessTarget());
        order.push('tracker-reservation-freshness-execution:leave');
        return {
          value,
          receipt: trackerReservationFreshnessExecutionReceipt(),
        };
      },
    ),
    withCheckpointBoundTrackerTransportTarget: vi.fn(async (
      completion,
      action,
    ) => {
      order.push('tracker-transport-execution:enter');
      if (completion !== TRACKER_RESERVATION_FRESHNESS_COMPLETION) {
        throw new Error('tracker transport completion changed');
      }
      const value = await action(trackerTransportTarget());
      order.push('tracker-transport-execution:leave');
      return {
        value,
        receipt: trackerTransportExecutionReceipt(),
      };
    }),
    withTrackerTransportConfirmationMiningTarget: vi.fn(async (
      expectedTransactionIdHex,
      action,
    ) => {
      order.push('tracker-confirmation:enter');
      if (expectedTransactionIdHex !== digest('c')) {
        throw new Error('tracker confirmation transaction changed');
      }
      const value = await action(executionTarget());
      order.push('tracker-confirmation:leave');
      return {
        value,
        receipt: trackerConfirmationExecutionReceipt(),
      };
    }),
    stop: vi.fn(async () => {
      order.push('process:stop');
    }),
  };
}

function validBuild() {
  return {
    javaExecutablePath: 'reviewed/java.exe',
    nodeAssemblyJarPath: 'reviewed/ergo.jar',
    receipt: {
      schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1',
      version: 1,
      status: 'exact_locked_patched_node_built',
      toolchain: { javaExecutableSha256Hex: digest('1') },
      build: { artifactSha256Hex: digest('2') },
      buildIdentityDigestHex: digest('3'),
      boundaries: { gate5Closed: false },
    },
  };
}

function processReceipt(finalHeight = 140) {
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMiningDuringAction: true,
    witnessReadOnlyDuringAction: true,
    buildIdentityDigestHex: digest('3'),
    executableIdentityDigestHex: digest('4'),
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    initialSnapshot: {
      network: 'devnet',
      fullHeight: 100,
      indexedHeight: 100,
      headerIdHex: digest('a'),
    },
    finalSnapshot: {
      network: 'devnet',
      fullHeight: finalHeight,
      indexedHeight: finalHeight,
      headerIdHex: digest('b'),
    },
  } as const;
}

function checkpointMiningReceipt(extensionValueHex: string) {
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    miningStoppedBeforeObservation: true,
    buildIdentityDigestHex: digest('3'),
    executableIdentityDigestHex: digest('4'),
    processBindingDigestHex: digest('7'),
    executionTargetIdentityDigestHex: digest('8'),
    minedSnapshot: {
      network: 'devnet',
      fullHeight: 141,
      indexedHeight: 141,
      headerIdHex: digest('c'),
    },
    finalSnapshot: {
      network: 'devnet',
      fullHeight: 142,
      indexedHeight: 142,
      headerIdHex: digest('d'),
    },
    extensionKeyHex: '0401',
    extensionValueHex,
    extensionFieldsSha256Hex: digest('e'),
    priorSnapshot: processReceipt().finalSnapshot,
  } as const;
}

function checkpointBoundExecutionReceipt() {
  const anchor = validCheckpointAnchorObservation();
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMiningDuringAction: true,
    witnessReadOnlyDuringAction: true,
    checkpointExtensionBoundDuringAction: true,
    trackerAdmissionMiningCredentialConsumedOnce: true,
    checkpointSnapshotRevalidatedOnBothNodes: true,
    checkpointExtensionObservationDigestHex:
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        anchor,
      ),
    buildIdentityDigestHex: digest('3'),
    executableIdentityDigestHex: digest('4'),
    processBindingDigestHex: digest('f'),
    executionTargetIdentityDigestHex: digest('8'),
    extensionKeyHex: '0401',
    extensionValueHex: anchor.extensionValueHex,
    extensionFieldsSha256Hex: digest('e'),
    checkpointSnapshot: checkpointMiningReceipt(
      anchor.extensionValueHex,
    ).finalSnapshot,
    initialSnapshot: checkpointMiningReceipt(
      anchor.extensionValueHex,
    ).finalSnapshot,
    finalSnapshot: {
      ...checkpointMiningReceipt(anchor.extensionValueHex).finalSnapshot,
      fullHeight: 143,
      indexedHeight: 143,
      headerIdHex: digest('e'),
    },
  } as const;
}

function frozenCheckpointBoundExecutionReceipt() {
  const anchor = validCheckpointAnchorObservation();
  const frozenSnapshot = {
    network: 'devnet',
    fullHeight: 143,
    indexedHeight: 143,
    headerIdHex: digest('e'),
  } as const;
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-checkpoint-bound-frozen-execution.v2',
    version: 2,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMiningDuringAction: false,
    primaryReadOnlyDuringAction: true,
    witnessReadOnlyDuringAction: true,
    miningStoppedBeforeAction: true,
    exactFrozenSnapshotStableAcrossAction: true,
    checkpointExtensionBoundDuringAction: true,
    trackerAdmissionMiningCredentialConsumedOnce: true,
    checkpointSnapshotRevalidatedOnBothNodes: true,
    checkpointExtensionObservationDigestHex:
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        anchor,
      ),
    buildIdentityDigestHex: digest('3'),
    executableIdentityDigestHex: digest('4'),
    processBindingDigestHex: digest('0'),
    executionTargetIdentityDigestHex: digest('8'),
    extensionKeyHex: '0401',
    extensionValueHex: anchor.extensionValueHex,
    extensionFieldsSha256Hex: digest('e'),
    checkpointSnapshot: checkpointMiningReceipt(
      anchor.extensionValueHex,
    ).finalSnapshot,
    preFreezeMiningSnapshot: frozenSnapshot,
    actionStartSnapshot: frozenSnapshot,
    actionEndSnapshot: frozenSnapshot,
  } as const;
}

function trackerReservationFreshnessExecutionReceipt() {
  const frozen = frozenCheckpointBoundExecutionReceipt();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-execution.v1',
    version: 1,
    primaryNodeOrigin: frozen.primaryNodeOrigin,
    witnessNodeOrigin: frozen.witnessNodeOrigin,
    primaryReadOnlyDuringAction: true,
    witnessReadOnlyDuringAction: true,
    miningStoppedBeforeAction: true,
    exactFrozenSnapshotStableAcrossAction: true,
    sameProcessesAsTrackerCheck: true,
    buildIdentityDigestHex: frozen.buildIdentityDigestHex,
    executableIdentityDigestHex: frozen.executableIdentityDigestHex,
    trackerCheckProcessBindingDigestHex: frozen.processBindingDigestHex,
    trackerCheckExecutionTargetIdentityDigestHex:
      frozen.executionTargetIdentityDigestHex,
    processBindingDigestHex: digest('1'),
    executionTargetIdentityDigestHex: digest('2'),
    trackerCheckSnapshot: frozen.actionEndSnapshot,
    actionStartSnapshot: frozen.actionEndSnapshot,
    actionEndSnapshot: frozen.actionEndSnapshot,
    checkpointExtensionBoundDuringAction: true,
    checkpointSnapshotRevalidatedOnBothNodes: true,
    checkpointExtensionObservationDigestHex:
      frozen.checkpointExtensionObservationDigestHex,
    extensionKeyHex: frozen.extensionKeyHex,
    extensionValueHex: frozen.extensionValueHex,
    extensionFieldsSha256Hex: frozen.extensionFieldsSha256Hex,
    checkpointSnapshot: frozen.checkpointSnapshot,
  } as const;
}

function trackerTransportExecutionReceipt() {
  const freshness = trackerReservationFreshnessExecutionReceipt();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-transport-execution.v1',
    version: 1,
    primaryNodeOrigin: freshness.primaryNodeOrigin,
    witnessNodeOrigin: freshness.witnessNodeOrigin,
    primaryMiningStoppedDuringAction: true,
    trackerTransportTargetActiveOnlyDuringAction: true,
    witnessReadOnlyDuringAction: true,
    miningStoppedBeforeAction: true,
    exactFrozenChainSnapshotStableAcrossAction: true,
    sameProcessesAsReservationFreshness: true,
    buildIdentityDigestHex: freshness.buildIdentityDigestHex,
    executableIdentityDigestHex: freshness.executableIdentityDigestHex,
    reservationFreshnessProcessBindingDigestHex:
      freshness.processBindingDigestHex,
    reservationFreshnessExecutionTargetIdentityDigestHex:
      freshness.executionTargetIdentityDigestHex,
    processBindingDigestHex: digest('7'),
    executionTargetIdentityDigestHex: digest('8'),
    reservationFreshnessSnapshot: freshness.actionEndSnapshot,
    actionStartSnapshot: freshness.actionEndSnapshot,
    actionEndSnapshot: freshness.actionEndSnapshot,
    checkpointExtensionBoundDuringAction: true,
    checkpointSnapshotRevalidatedOnBothNodes: true,
    checkpointExtensionObservationDigestHex:
      freshness.checkpointExtensionObservationDigestHex,
    extensionKeyHex: freshness.extensionKeyHex,
    extensionValueHex: freshness.extensionValueHex,
    extensionFieldsSha256Hex: freshness.extensionFieldsSha256Hex,
    checkpointSnapshot: freshness.checkpointSnapshot,
  } as const;
}

function trackerConfirmationExecutionReceipt() {
  const transport = trackerTransportExecutionReceipt();
  const anchor = validCheckpointAnchorObservation();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-confirmation-execution.v1',
    version: 1,
    primaryNodeOrigin: transport.primaryNodeOrigin,
    witnessNodeOrigin: transport.witnessNodeOrigin,
    primaryMiningDuringAction: true,
    witnessReadOnlyDuringAction: true,
    buildIdentityDigestHex: transport.buildIdentityDigestHex,
    executableIdentityDigestHex: transport.executableIdentityDigestHex,
    processBindingDigestHex: digest('9'),
    executionTargetIdentityDigestHex: digest('a'),
    initialSnapshot: transport.actionEndSnapshot,
    finalSnapshot: {
      ...transport.actionEndSnapshot,
      fullHeight: transport.actionEndSnapshot.fullHeight + 1,
      indexedHeight: transport.actionEndSnapshot.indexedHeight + 1,
      headerIdHex: digest('f'),
    },
    trackerConfirmationMiningCredentialConsumedOnce: true,
    exactTrackerTransportBound: true,
    confirmedTransactionIdHex: digest('c'),
    trackerTransportProcessBindingDigestHex: transport.processBindingDigestHex,
    trackerTransportExecutionTargetIdentityDigestHex:
      transport.executionTargetIdentityDigestHex,
    checkpointExtensionBoundDuringAction: true,
    checkpointSnapshotRevalidatedOnBothNodes: true,
    checkpointExtensionObservationDigestHex:
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        anchor,
      ),
    extensionKeyHex: anchor.extensionKeyHex,
    extensionValueHex: anchor.extensionValueHex,
    extensionFieldsSha256Hex: transport.extensionFieldsSha256Hex,
    checkpointSnapshot: transport.checkpointSnapshot,
    transportSnapshot: transport.actionEndSnapshot,
  } as const;
}

function validCheckpointAnchorObservation() {
  const extensionValueHex = `${digest('3')}${digest('6')}`;
  const headerIds = ['d', 'c', 'b', 'a', '9', '8', '7', '6', '5', '4'];
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-checkpoint-anchor-observation.v1',
    version: 1,
    targetGenesisHeaderIdHex: digest('a'),
    priorHeaderIdHex: digest('b'),
    priorHeight: 140,
    extensionKeyHex: '0401',
    extensionValueHex,
    anchorHeaderIdHex: digest('d'),
    anchorHeight: 142,
    anchorContextIndex: 0,
    anchorExtensionRootHex: digest('9'),
    extensionFields: Object.freeze([
      Object.freeze({ keyHex: '0401', valueHex: extensionValueHex }),
    ]),
    extensionMembershipProofHex: '00',
    headers: Object.freeze(headerIds.map((character, index) => Object.freeze({
      canonicalHeaderBytesHex: digest(character),
      idHex: digest(character),
      height: 142 - index,
      extensionRootHex: index === 0 ? digest('9') : digest(character),
      raw: Object.freeze({
        id: digest(character),
        height: 142 - index,
      }),
    }))),
    processBindingDigestHex: digest('7'),
    executionTargetIdentityDigestHex: digest('8'),
    observationDigestHex: digest('a'),
    boundaries: Object.freeze({
      primaryAndWitnessAgreed: true,
      miningStoppedDuringObservation: true,
      priorSnapshotAncestryEstablished: true,
      exactExtensionMembershipRecomputed: true,
      ergoPowAuthenticated: false,
      trackerAdmissionEstablished: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    }),
  } as const);
}

function validCheckpointBoundObservation(
  anchor: ReturnType<typeof validCheckpointAnchorObservation>,
) {
  const headers = validCheckpointBoundHeaders(anchor);
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v1',
    version: 1,
    targetGenesisHeaderIdHex: anchor.targetGenesisHeaderIdHex,
    extensionKeyHex: anchor.extensionKeyHex,
    extensionValueHex: anchor.extensionValueHex,
    anchorHeaderIdHex: anchor.anchorHeaderIdHex,
    anchorHeight: anchor.anchorHeight,
    anchorContextIndex: 1,
    anchorExtensionRootHex: anchor.anchorExtensionRootHex,
    extensionFields: anchor.extensionFields,
    extensionMembershipProofHex: anchor.extensionMembershipProofHex,
    headers,
    processBindingDigestHex:
      checkpointBoundExecutionReceipt().processBindingDigestHex,
    executionTargetIdentityDigestHex:
      checkpointBoundExecutionReceipt().executionTargetIdentityDigestHex,
    observationDigestHex: digest('2'),
    boundaries: Object.freeze({
      primaryAndWitnessAgreed: true,
      primaryMiningDuringObservation: true,
      checkpointBoundActiveTarget: true,
      exactCheckpointRetainedInCurrentContext: true,
      exactExtensionMembershipRecomputed: true,
      ergoPowAuthenticated: false,
      trackerAdmissionEstablished: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    }),
  } as const);
}

function validFrozenCheckpointBoundObservation(
  anchor: ReturnType<typeof validCheckpointAnchorObservation>,
) {
  const headers = validCheckpointBoundHeaders(anchor);
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v2',
    version: 2,
    targetGenesisHeaderIdHex: anchor.targetGenesisHeaderIdHex,
    extensionKeyHex: anchor.extensionKeyHex,
    extensionValueHex: anchor.extensionValueHex,
    anchorHeaderIdHex: anchor.anchorHeaderIdHex,
    anchorHeight: anchor.anchorHeight,
    anchorContextIndex: 1,
    anchorExtensionRootHex: anchor.anchorExtensionRootHex,
    extensionFields: anchor.extensionFields,
    extensionMembershipProofHex: anchor.extensionMembershipProofHex,
    headers,
    processBindingDigestHex:
      frozenCheckpointBoundExecutionReceipt().processBindingDigestHex,
    executionTargetIdentityDigestHex:
      frozenCheckpointBoundExecutionReceipt().executionTargetIdentityDigestHex,
    observationDigestHex: digest('7'),
    boundaries: Object.freeze({
      primaryAndWitnessAgreed: true,
      miningStoppedDuringObservation: true,
      checkpointBoundFrozenTarget: true,
      exactCheckpointRetainedInCurrentContext: true,
      exactExtensionMembershipRecomputed: true,
      ergoPowAuthenticated: false,
      trackerAdmissionEstablished: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    }),
  } as const);
}

function validTrackerReservationFreshnessObservation(
  anchor: ReturnType<typeof validCheckpointAnchorObservation>,
) {
  const frozen = validFrozenCheckpointBoundObservation(anchor);
  const {
    checkpointBoundFrozenTarget: _checkpointBoundFrozenTarget,
    ...sharedBoundaries
  } = frozen.boundaries;
  return Object.freeze({
    ...frozen,
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-observation.v1',
    version: 1,
    processBindingDigestHex:
      trackerReservationFreshnessExecutionReceipt().processBindingDigestHex,
    executionTargetIdentityDigestHex:
      trackerReservationFreshnessExecutionReceipt()
        .executionTargetIdentityDigestHex,
    observationDigestHex: digest('8'),
    boundaries: Object.freeze({
      ...sharedBoundaries,
      checkpointBoundReservationFreshnessTarget: true,
      durableReservationBound: false,
      trackerInputRevalidated: false,
      jvmTransactionRechecked: false,
    }),
  } as const);
}

function validCheckpointBoundHeaders(
  anchor: ReturnType<typeof validCheckpointAnchorObservation>,
) {
  return Object.freeze([
    Object.freeze({
      idHex: digest('e'),
      height: anchor.anchorHeight + 1,
      raw: Object.freeze({
        id: digest('e'),
        height: anchor.anchorHeight + 1,
      }),
    }),
    ...anchor.headers.slice(0, 9),
  ]);
}

function setupBatch() {
  return {
    receipt: { receiptDigestHex: digest('d') },
    request: {
      requestDigestHex: digest('e'),
      target: {
        genesisHeaderIdHex: digest('a'),
        preSetupAnchor: { height: 100, headerIdHex: digest('b') },
        primary: { nodeOrigin: 'http://127.0.0.1:9051' },
        witness: { nodeOrigin: 'http://127.0.0.1:9052' },
      },
    },
    targetBinding: {
      processBindingDigestHex: digest('5'),
      executionTargetIdentityDigestHex: digest('6'),
    },
    familyCompilerBinding: {
      profile: { familyIdHex: digest('f') },
    },
    trackerCompilerBinding: {
      request: Object.freeze({ requestDigestHex: digest('1') }),
      receipt: Object.freeze({ receiptDigestHex: digest('2') }),
    },
    orderedTransactions: setupTransactions(),
  };
}

function setupTransactions() {
  return [
    setupTransaction(0, 'tracker', '1'),
    setupTransaction(1, 'duplicate-prevention', '2'),
    setupTransaction(2, 'pooled-reserve', '3'),
  ];
}

function setupTransaction(
  ordinal: 0 | 1 | 2,
  role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
  character: string,
) {
  const sourceBoxId = digest(character);
  const expectedTxId = digest(String(Number(character) + 3));
  const unsignedTransactionBody = {
    inputs: [{ boxId: sourceBoxId }],
    dataInputs: [],
    outputs: [],
  };
  const signedCandidate = {
    signedTransactionDigestHex: digest(String(Number(character) + 6)),
  };
  return {
    issuance: {
      ordinal,
      role,
      genesisInputBoxIdHex: sourceBoxId,
      unsignedTransactionIdHex: expectedTxId,
      unsignedTransactionBody,
      predictedStateOutput: {
        boxIdHex: digest('a'),
        transactionIdHex: expectedTxId,
        index: 0,
        creationHeight: 100,
        bodyDigestHex: digest('b'),
      },
    },
    signedCandidate,
    checkedAcceptance: {
      submissionHandle: {
        checkResponseDigestHex: digest(String(Number(character) + 7)),
      },
    },
  };
}

function validMaterializedTrackerSetup(batch: ReturnType<typeof setupBatch>) {
  const issuance = batch.orderedTransactions[0]!.issuance;
  return Object.freeze({
    txId: issuance.unsignedTransactionIdHex,
    eip12Tx: issuance.unsignedTransactionBody,
    outputs: Object.freeze([Object.freeze({
      boxId: issuance.predictedStateOutput.boxIdHex,
      value: '10000000',
      ergoTree: '00',
      assets: Object.freeze([]),
      additionalRegisters: Object.freeze({}),
      creationHeight: issuance.predictedStateOutput.creationHeight,
      transactionId: issuance.predictedStateOutput.transactionIdHex,
      index: issuance.predictedStateOutput.index,
    })]),
  });
}

function validTrackerContext(
  trackerInputBox:
    ReturnType<typeof validMaterializedTrackerSetup>['outputs'][number],
  checkpoint: ReturnType<typeof validApplicationCheckpointReceipt>,
) {
  const statement = checkpoint.checkpoint.checkpointAttestation
    .checkpointStatement;
  return Object.freeze({
    schema: 'e2s.substrate-federated-v1-tracker-context',
    version: 1,
    trustModel: 'federated_non_trustless',
    contract: Object.freeze({
      contractIdHex: digest('7'),
      sourceSignaturesVerifiedOnChain: false,
      jvmReductionAccepted: false,
      profileActivated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    }),
    statement: Object.freeze({
      encodedHex: statement.encodedStatementHex,
      statementIdHex: statement.statementIdHex,
      sourceSignaturesVerifiedOnChain: false,
    }),
    trackerTransition: Object.freeze({
      trackerNftIdHex: digest('8'),
      trackerKeyHex: digest('9'),
      trackerValueHex: 'ab'.repeat(288),
      inputDigestHex: '00'.repeat(33),
      successorDigestHex: '01'.repeat(33),
      currentErgoHeight: 221,
      anchorContextIndex: 0,
      anchorContextProvenance:
        'eip0045-validity-tracker-canonical-synthetic-header-context',
      headers: Object.freeze([Object.freeze({
        id: digest('a'),
        height: 220,
        extensionRootHex: digest('b'),
        jvmHeaderJson: '{}',
        serializedHex: '00',
      })]),
    }),
    contextExtension: Object.freeze({
      serializedHex: '000102',
    }),
    eip12UnsignedTransaction: Object.freeze({
      inputs: Object.freeze([Object.freeze({
        boxId: trackerInputBox.boxId,
        extension: Object.freeze({}),
      })]),
      dataInputs: Object.freeze([]),
      outputs: Object.freeze([]),
    }),
    prooflessTransactionBytes: 1_024,
    unsignedTransactionIdHex: digest('c'),
    boundaries: Object.freeze({
      contractIdentityBound: true,
      statementAndProfileValidated: true,
      anchorMembershipConstructed: true,
      exactContextExtensionRoundTrip: true,
      avlTransitionConstructed: true,
      sourceSignaturesVerifiedOnChain: false,
      jvmReductionAccepted: false,
      nodeCheckPerformed: false,
      profileActivated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    }),
  } as const);
}

function validObservedHeaderContext(
  observation: Readonly<{
    anchorContextIndex: number;
    anchorHeaderIdHex: string;
    anchorExtensionRootHex: string;
    headers: readonly unknown[];
  }>,
) {
  return Object.freeze({
    schema: 'e2s.bridge-validity-tracker-observed-header-context.v1',
    version: 1,
    provenance: 'eip0045-validity-tracker-observed-header-context',
    anchorContextIndex: observation.anchorContextIndex,
    anchorHeaderIdHex: observation.anchorHeaderIdHex,
    anchorExtensionRootHex: observation.anchorExtensionRootHex,
    headers: observation.headers,
  } as const);
}

function validObservedTrackerContext(
  synthetic: ReturnType<typeof validTrackerContext>,
  observedHeaders: ReturnType<typeof validObservedHeaderContext>,
) {
  const headerIds = ['e', 'd', 'c', 'b', 'a', '9', '8', '7', '6', '5'];
  const headers = Object.freeze(headerIds.map((character, index) => Object.freeze({
    id: digest(character),
    height: 143 - index,
    extensionRootHex: index === 1 ? digest('9') : digest(character),
    jvmHeaderJson: '{}',
    serializedHex: '00',
  })));
  return Object.freeze({
    ...synthetic,
    contract: Object.freeze({
      ...synthetic.contract,
      ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: Object.freeze([setupSigner().publicKeyHex]),
    }),
    trackerTransition: Object.freeze({
      ...synthetic.trackerTransition,
      currentErgoHeight: headers[0]!.height + 1,
      anchorContextIndex: observedHeaders.anchorContextIndex,
      anchorContextProvenance:
        'eip0045-validity-tracker-observed-header-context',
      headers,
    }),
  } as const);
}

function validObservedTrackerCheck(
  context: ReturnType<typeof validObservedTrackerContext>,
  trackerInputBox:
    ReturnType<typeof validMaterializedTrackerSetup>['outputs'][number],
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ]!;
  const tip = context.trackerTransition.headers[0]!;
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v1',
    version: 1,
    status: 'PASS',
    trackerInputBoxIdHex: trackerInputBox.boxId,
    statementIdHex: context.statement.statementIdHex,
    anchorHeaderIdHex: anchor.id,
    anchorHeight: anchor.height,
    anchorContextIndex: context.trackerTransition.anchorContextIndex,
    unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    unsignedTransactionDigestHex: digest('1'),
    signedTransactionIdHex: context.unsignedTransactionIdHex,
    signedTransactionCanonicalJsonSha256Hex: digest('2'),
    signedTransactionBytesSha256Hex: digest('3'),
    signedTransactionBytesLength: 2_048,
    checkResponseSha256Hex: digest('4'),
    target: Object.freeze({ ...targetBinding }),
    signer: Object.freeze({
      derivation: 'wasm-root',
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
      stateContextTipHeight: tip.height,
      stateContextTipIdHex: tip.id,
    }),
    checker: Object.freeze({
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    }),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true,
      checkpointBoundActiveTarget: true,
      observedAnchorContextBound: true,
      exactTrackerInputAndTransactionBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      trackerAdmissionEstablished: false,
      replayProtectionEstablished: false,
      payoutEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    }),
    receiptDigestHex: digest('5'),
  } as const);
}

function validFrozenObservedTrackerCheck(
  context: ReturnType<typeof validObservedTrackerContext>,
  trackerInputBox:
    ReturnType<typeof validMaterializedTrackerSetup>['outputs'][number],
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  const active = validObservedTrackerCheck(
    context,
    trackerInputBox,
    targetBinding,
  );
  const {
    checkpointBoundActiveTarget: _checkpointBoundActiveTarget,
    ...sharedBoundaries
  } = active.boundaries;
  return Object.freeze({
    ...active,
    schema:
      'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v2',
    version: 2,
    boundaries: Object.freeze({
      ...sharedBoundaries,
      checkpointBoundFrozenTarget: true,
    }),
    receiptDigestHex: digest('6'),
  } as const);
}

function validTrackerReservationFreshnessCheck(
  frozen: ReturnType<typeof validFrozenObservedTrackerCheck>,
) {
  const {
    checkpointBoundFrozenTarget: _checkpointBoundFrozenTarget,
    ...sharedBoundaries
  } = frozen.boundaries;
  return Object.freeze({
    ...frozen,
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-check.v1',
    version: 1,
    target: Object.freeze({
      processBindingDigestHex:
        trackerReservationFreshnessExecutionReceipt().processBindingDigestHex,
      executionTargetIdentityDigestHex:
        trackerReservationFreshnessExecutionReceipt()
          .executionTargetIdentityDigestHex,
    }),
    boundaries: Object.freeze({
      ...sharedBoundaries,
      reservationFreshnessRevalidationTarget: true,
      durableReservationBound: false,
    }),
    receiptDigestHex: digest('9'),
  } as const);
}

function confirmation(expectedTxId: string, index: number, round: number) {
  return {
    status: 'confirmed',
    expectedTxId,
    observedTxId: expectedTxId,
    confirmations: 10,
    confirmationHeight: 110 + index + (round * 10),
    observedAtHeight: 120 + index + (round * 10),
    confirmationHeaderIdHex: digest(String(index + 1 + round)),
    observationDigestHex: digest(String(index + 4 + round)),
    observerArtifact: {},
  } as const;
}

function trackerTransportConfirmation() {
  const observed = confirmation(digest('c'), 0, 1);
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation.v1',
    version: 1,
    status: 'confirmed',
    transactionIdHex: digest('c'),
    confirmations: observed.confirmations,
    observedAtHeight: 221,
    confirmationHeight: observed.confirmationHeight,
    confirmationHeaderIdHex: observed.confirmationHeaderIdHex,
    observationDigestHex: observed.observationDigestHex,
  } as const;
}

function setupSigner() {
  const publicKeyHex = publicKey('1');
  return {
    publicKeyHex,
    p2pkErgoTreeHex: `0008cd${publicKeyHex}`,
    rewardInputErgoTrees: {
      delay1: '01',
      delay720: '02',
    },
    networkPrefix: 16,
  } as const;
}

function packetSigner() {
  return {
    sourceAttestationThreshold: 2,
    sourceAttestationPublicKeysHex: [
      digest('2'),
      digest('3'),
      digest('4'),
    ],
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [setupSigner().publicKeyHex],
  } as const;
}

function executionTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true,
    witnessReadOnly: true,
  } as const;
}

function readOnlyTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    miningStopped: true,
  } as const;
}

function activeExecutionTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true,
    witnessReadOnly: true,
    checkpointBound: true,
  } as const;
}

function frozenExecutionTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: false,
    primaryReadOnly: true,
    witnessReadOnly: true,
    miningStopped: true,
    checkpointBound: true,
  } as const;
}

function trackerReservationFreshnessTarget() {
  return {
    ...frozenExecutionTarget(),
    reservationFreshnessRevalidation: true,
  } as const;
}

function trackerTransportTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: false,
    witnessReadOnly: true,
    miningStopped: true,
    checkpointBound: true,
    reservationFreshnessCheckBound: true,
    trackerTransport: true,
  } as const;
}

function rootInput() {
  return {
    build: {
      worktreeRoot: 'reviewed/worktree',
      bridgeRoot: 'reviewed/bridge',
      ergoSourcePath: 'reviewed/ergo',
      gitExecutablePath: 'reviewed/git.exe',
      javaExecutablePath: 'reviewed/java.exe',
      sbtLauncherJarPath: 'reviewed/sbt-launch.jar',
    },
    lifecycle: {
      sourceHistory: {
        acceptance: {
          bridgeAddress:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
          tokenAddress:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
        },
      },
      relayerArtifacts: {
        expectedHeadCommitSha1Hex: '1'.repeat(40),
      },
    },
  } as never;
}

function pegInRootInput() {
  return {
    ...(rootInput() as unknown as Record<string, unknown>),
    pegIn: {
      amountNanoErg: '5000000',
      recipientAddressHex: 'b1'.repeat(20),
    },
  } as never;
}

function pegInMintProofRootInput() {
  return {
    ...(pegInRootInput() as unknown as Record<string, unknown>),
    frontierMintProofConsumer: {
      frontierSourceDirectory: 'reviewed/frontier',
      cargoExecutablePath: 'reviewed/cargo.exe',
      rustcExecutablePath: 'reviewed/rustc.exe',
      gitExecutablePath: 'reviewed/git.exe',
      offline: true,
    },
  } as never;
}

function pegInApplicationCheckpointRootInput() {
  return {
    ...(pegInRootInput() as unknown as Record<string, unknown>),
    frontierApplicationRunner: {
      frontierSourceDirectory: 'reviewed/frontier',
      temporaryDirectoryRoot: 'reviewed/frontier-temporary',
      cargoDependencyCacheDirectory: 'reviewed/frontier-cargo-cache',
      cargoExecutablePath: 'reviewed/cargo.exe',
      rustcExecutablePath: 'reviewed/rustc.exe',
      gitExecutablePath: 'reviewed/git.exe',
      offline: true,
    },
    requestBinding: TRACKER_TRANSPORT_REQUEST_BINDING,
  } as never;
}

function validPacketV2() {
  return {
    receipt: {
      schema: 'e2s.substrate-federated-isolated-devnet-packet-producer.v2',
      version: 2,
      receiptDigestHex: digest('2'),
      targetDescriptorDigestHex: digest('3'),
      relayerArtifactSetDigestHex: digest('1'),
      checks: {
        realRelayerArtifactProducerInvoked: true,
        relayerArtifactFilesRehashedAfterPublication: true,
      },
    },
    portableReplayInput: { packet: 'portable-v2' },
    replay: { reportDigestHex: digest('4') },
  } as const;
}

function validMintDraft() {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-mint-reservation-draft.v1',
    version: 1,
    status: 'canonical_statement_waiting_for_source_proof',
    statement: { formatVersion: 4 },
    statementHex: '0x01',
    statementIdHex: digest('5'),
    reservationKeyHex: digest('6'),
    provenance: {
      candidateDigestHex: digest('7'),
      committedVaultObservationDigestHex: digest('8'),
      familyCompilerBindingDigestHex: digest('9'),
      exactSameProcessCandidateAndObservationBound: true,
    },
    boundary: {
      exactCommittedReserveBound: true,
      exactFinalityTargetBound: true,
      canonicalV4StatementConstructed: true,
      runtimeProfileBound: false,
      canonicalSourceProofEvidenceCollected: false,
      sourceProofRequestConstructed: false,
      sourceAttestationEstablished: false,
      runtimeReservationWritten: false,
      mintExecuted: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    limitations: ['synthetic test draft'],
    draftDigestHex: digest('a'),
  } as const;
}

function validEvidenceReceipt(draft: ReturnType<typeof validMintDraft>) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-committed-reserve-evidence.v1',
    version: 1,
    status: 'canonical_committed_reserve_evidence_collected',
    mintReservationDraftDigestHex: draft.draftDigestHex,
    mintReservationStatementIdHex: draft.statementIdHex,
    mintIdentityHex: draft.reservationKeyHex,
    evidence: { sourceLockBoxCanonicalHex: '00' },
    receiptDigestHex: digest('b'),
  } as const;
}

function validPacketProof(
  packet: ReturnType<typeof validPacketV2>,
  draft: ReturnType<typeof validMintDraft>,
  evidence: ReturnType<typeof validEvidenceReceipt>,
) {
  const sourceProof = {
    receiptDigestHex: digest('c'),
    sourceEvidenceReceiptDigestHex: evidence.receiptDigestHex,
    targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
    mintReservationDraftDigestHex: draft.draftDigestHex,
    mintReservationStatementIdHex: draft.statementIdHex,
    mintIdentityHex: draft.reservationKeyHex,
  } as const;
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-packet-mint-source-proof.v2',
    version: 2,
    status: 'packet_bound_collected_federated_source_proof_produced',
    packetReceiptDigestHex: packet.receipt.receiptDigestHex,
    targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
    sourceProofReceiptDigestHex: sourceProof.receiptDigestHex,
    sourceProof,
    receiptDigestHex: digest('d'),
  } as const;
}

function validConsumerReceipt(
  packet: ReturnType<typeof validPacketV2>,
  draft: ReturnType<typeof validMintDraft>,
  evidence: ReturnType<typeof validEvidenceReceipt>,
  proof: ReturnType<typeof validPacketProof>,
) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-frontier-mint-proof-consumer.v2',
    version: 2,
    status: 'packet_bound_proof_consumed_by_frontier_lab',
    packetProof: proof,
    packetProofReceiptDigestHex: proof.receiptDigestHex,
    sourceProofReceiptDigestHex: proof.sourceProof.receiptDigestHex,
    sourceEvidenceReceiptDigestHex: evidence.receiptDigestHex,
    targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
    statementIdHex: draft.statementIdHex,
    mintIdentityHex: draft.reservationKeyHex,
    receiptDigestHex: digest('e'),
  } as const;
}

function validApplicationCheckpointReceipt(
  packet: ReturnType<typeof validPacketV2>,
  proof: ReturnType<typeof validPacketProof>,
) {
  const applicationRunner = {
    receiptDigestHex: digest('1'),
    mintSourceProof: proof.sourceProof,
    executionResult: {
      applicationEvidence: {
        burn: {
          burnIdHex: `0x${digest('2')}`,
          bridgeEventRootHex: `0x${digest('3')}`,
        },
      },
    },
  } as const;
  const checkpoint = {
    receiptDigestHex: digest('4'),
    checkpointAttestation: {
      checkpointStatement: {
        version: 1,
        hashAlgorithmId: 1,
        finalityRuleId: 1,
        flags: 0,
        sourceNetworkIdHex: digest('7'),
        sidechainIdHex: digest('8'),
        sourceNativeBlockHeight: '100',
        sourceNativeBlockHashHex: digest('9'),
        executionBlockHashHex: digest('a'),
        bridgeEventRootHex: digest('3'),
        burnLeafCount: 1,
        bridgeAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
        tokenAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
        bridgeRuntimeCodeSha256Hex: digest('b'),
        bridgeRuntimeCodeBytes: 100,
        tokenRuntimeCodeSha256Hex: digest('c'),
        tokenRuntimeCodeBytes: 200,
        sourceRuntimeCodeSha256Hex: digest('d'),
        sourceRuntimeCodeBytes: 300,
        runtimeProfileIdHex: digest('e'),
        settlementProfileIdHex: digest('f'),
        federationProfileIdHex: digest('0'),
        sourceAttestationKeySetDigestHex: digest('1'),
        sourceAttestationThreshold: 2,
        ergoAdmissionKeySetDigestHex: digest('2'),
        ergoAdmissionThreshold: 1,
        federationEpoch: '1',
        admissionValidFromErgoHeight: '220',
        admissionExpiresAtErgoHeight: '284',
        encodedStatementHex: '01'.repeat(64),
        statementIdHex: digest('6'),
      },
    },
  } as const;
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-frontier-application-checkpoint-root.v3',
    version: 3,
    status: 'packet_mint_application_burn_checkpoint_composed',
    packet: Object.freeze({
      receipt: packet.receipt,
    }),
    mintSourceProof: proof,
    applicationRunner,
    checkpoint,
    binding: {
      targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
      packetReceiptDigestHex: packet.receipt.receiptDigestHex,
      mintSourceProofReceiptDigestHex: proof.receiptDigestHex,
      applicationRunnerReceiptDigestHex: applicationRunner.receiptDigestHex,
      checkpointReceiptDigestHex: checkpoint.receiptDigestHex,
      burnIdHex: applicationRunner.executionResult.applicationEvidence.burn
        .burnIdHex,
      bridgeEventRootHex:
        applicationRunner.executionResult.applicationEvidence.burn
          .bridgeEventRootHex,
    },
    checks: {
      exactPacketObjectBound: true,
    },
    boundary: {
      isolatedTestClientOnly: true,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
    limitations: ['synthetic application-checkpoint test receipt'],
    receiptDigestHex: digest('5'),
  } as const);
}

function validApplicationCheckpointStage(
  receipt: ReturnType<typeof validApplicationCheckpointReceipt>,
  packet: ReturnType<typeof validPacketV2>,
) {
  return Object.freeze({
    packet,
    mintSourceProof: receipt.mintSourceProof,
    applicationRunner: receipt.applicationRunner,
  });
}

function validPegInFundingObservation() {
  const rewardBox = (boxId: string, transactionId: string, index: number) => ({
    boxId,
    value: '1000000000',
    ergoTree: '00',
    assets: [],
    additionalRegisters: {},
    creationHeight: 50 + index,
    transactionId,
    index,
  });
  return {
    reportDigestHex: digest('c'),
    observedAt: '2026-08-18T09:00:00.000Z',
    sources: {
      primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052',
    },
    target: {
      genesisHeaderIdHex: digest('a'),
      tipHeight: 130,
      tipHeaderIdHex: digest('b'),
    },
    signer: {
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
    },
    genesisBoxIds: {
      tracker: digest('c'),
      duplicatePrevention: digest('d'),
      pooledReserve: digest('e'),
    },
    genesisInputs: {
      tracker: rewardBox(digest('c'), digest('7'), 0),
      duplicatePrevention: rewardBox(digest('d'), digest('8'), 0),
      pooledReserve: rewardBox(digest('e'), digest('9'), 0),
    },
  };
}

function validFamilyProfile() {
  return {
    sourceNetworkIdHex: digest('1'),
    sidechainIdHex: digest('2'),
    bridgeAddressHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1.slice(2),
    tokenAddressHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1.slice(2),
    settlementProfileIdHex: digest('5'),
    settlementAssetIdHex: digest('6'),
  };
}

function validPegInCandidate(
  sourceFundingInput: Record<string, unknown>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  const eip12Box = (
    boxId: string,
    transactionId: string,
    index: number,
  ) => ({
    boxId,
    value: '5000000',
    ergoTree: '00',
    assets: [],
    additionalRegisters: {},
    creationHeight: 130,
    transactionId,
    index,
  });
  const reservePredecessor = eip12Box(digest('a'), digest('6'), 0);
  const sourceLock = eip12Box(digest('b'), digest('8'), 0);
  const transitionFeeFunding = eip12Box(digest('d'), digest('8'), 1);
  const sourceChange = eip12Box(digest('c'), digest('8'), 2);
  const sourceMinerFee = eip12Box(digest('e'), digest('8'), 3);
  const reserveSuccessor = eip12Box(digest('f'), digest('9'), 0);
  const transitionMinerFee = eip12Box(digest('0'), digest('9'), 1);
  const asOutputCandidate = (
    box: ReturnType<typeof eip12Box>,
  ) => ({
    value: box.value,
    ergoTree: box.ergoTree,
    assets: box.assets,
    additionalRegisters: box.additionalRegisters,
    creationHeight: box.creationHeight,
  });
  const sourceLockCreation = {
    txId: digest('8'),
    eip12Tx: {
      inputs: [{ ...structuredClone(sourceFundingInput), extension: {} }],
      dataInputs: [],
      outputs: [
        asOutputCandidate(sourceLock),
        asOutputCandidate(transitionFeeFunding),
        asOutputCandidate(sourceChange),
        asOutputCandidate(sourceMinerFee),
      ],
    },
    outputs: [
      sourceLock,
      transitionFeeFunding,
      sourceChange,
      sourceMinerFee,
    ],
  };
  const reserveTransition = {
    txId: digest('9'),
    eip12Tx: {
      inputs: [
        { ...reservePredecessor, extension: { '0': '0e20' } },
        { ...sourceLock, extension: {} },
        { ...transitionFeeFunding, extension: {} },
      ],
      dataInputs: [],
      outputs: [
        asOutputCandidate(reserveSuccessor),
        asOutputCandidate(transitionMinerFee),
      ],
    },
    outputs: [reserveSuccessor, transitionMinerFee],
  };
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1',
    version: 1,
    status: 'unsigned_non_authorizing_candidate',
    candidateDigestHex: digest('7'),
    target: { ...targetBinding },
    depositPacket: {
      boxes: {
        sourceFundingInput: structuredClone(sourceFundingInput),
        reservePredecessor,
        sourceLock,
        transitionFeeFunding,
        reserveSuccessor,
      },
      transactions: { sourceLockCreation, reserveTransition },
    },
    boundaries: {
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  };
}

function validPegInSourceLockCheck(
  input: Readonly<{
    sourceFundingBoxIdHex: string;
    unsignedTransaction: Readonly<{ txId: string }>;
  }>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1',
    version: 1,
    status: 'PASS',
    sourceFundingBoxIdHex: input.sourceFundingBoxIdHex,
    unsignedTransactionIdHex: input.unsignedTransaction.txId,
    unsignedTransactionDigestHex: digest('1'),
    signedTransactionIdHex: input.unsignedTransaction.txId,
    signedTransactionCanonicalJsonSha256Hex: digest('2'),
    signedTransactionBytesSha256Hex: digest('3'),
    signedTransactionBytesLength: 500,
    checkResponseSha256Hex: digest('4'),
    target: { ...targetBinding },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
      stateContextTipHeight: 131,
      stateContextTipIdHex: digest('e'),
    },
    checker: {
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      exactProcessOwnedTargetBound: true,
      exactTransactionAndSourceBoxBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    receiptDigestHex: digest('5'),
  } as const;
}

function validPegInSourceLockExecutionCheck(
  receipt: ReturnType<typeof validPegInSourceLockCheck>,
) {
  const signedCandidate = Object.freeze({
    profile: 'synthetic-source-lock-signed-candidate',
    txId: receipt.signedTransactionIdHex,
    signedTransactionDigestHex:
      receipt.signedTransactionCanonicalJsonSha256Hex,
  });
  const submissionHandle = Object.freeze({
    profile: 'synthetic-source-lock-submission-handle',
    checkResponseDigestHex: receipt.checkResponseSha256Hex,
  });
  return Object.freeze({
    receipt,
    signedCandidate,
    checkedAcceptance: Object.freeze({
      checked: Object.freeze({ status: 'PASS' }),
      submissionHandle,
    }),
  });
}

function validPegInSourceLockOutputObservation() {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1',
    version: 1,
    status: 'exact_source_spent_and_refundable_outputs_unspent',
    expectedTxId: digest('8'),
    observationDigestHex: digest('9'),
    boundaries: Object.freeze({
      sourceFundingSpent: true,
      sourceLockUnspentAndRefundable: true,
      transitionFeeFundingUnspent: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    }),
  } as const);
}

function validPegInCommittedVaultCheck(
  input: Readonly<{
    reservePredecessorBoxIdHex: string;
    sourceLockBoxIdHex: string;
    transitionFeeFundingBoxIdHex: string;
    unsignedTransaction: Readonly<{ txId: string }>;
  }>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1',
    version: 1,
    status: 'PASS',
    reservePredecessorBoxIdHex: input.reservePredecessorBoxIdHex,
    sourceLockBoxIdHex: input.sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex: input.transitionFeeFundingBoxIdHex,
    unsignedTransactionIdHex: input.unsignedTransaction.txId,
    unsignedTransactionDigestHex: digest('1'),
    signedTransactionIdHex: input.unsignedTransaction.txId,
    signedTransactionCanonicalJsonSha256Hex: digest('2'),
    signedTransactionBytesSha256Hex: digest('3'),
    signedTransactionBytesLength: 750,
    checkResponseSha256Hex: digest('4'),
    target: { ...targetBinding },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
      stateContextTipHeight: 136,
      stateContextTipIdHex: digest('2'),
    },
    checker: {
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      exactProcessOwnedTargetBound: true,
      exactThreeInputTransitionBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    receiptDigestHex: digest('5'),
  } as const;
}

function validPegInCommittedVaultExecutionCheck(
  receipt: ReturnType<typeof validPegInCommittedVaultCheck>,
) {
  const signedCandidate = Object.freeze({
    profile: 'synthetic-committed-vault-signed-candidate',
    txId: receipt.signedTransactionIdHex,
    signedTransactionDigestHex:
      receipt.signedTransactionCanonicalJsonSha256Hex,
  });
  const submissionHandle = Object.freeze({
    profile: 'synthetic-committed-vault-submission-handle',
    checkResponseDigestHex: receipt.checkResponseSha256Hex,
  });
  return Object.freeze({
    receipt,
    signedCandidate,
    checkedAcceptance: Object.freeze({
      checked: Object.freeze({ status: 'PASS' }),
      submissionHandle,
    }),
  });
}

function validPegInCommittedVaultPreTransportObservation() {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-pre-transport-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_unspent_and_dual_node_equal',
    expectedTxId: digest('9'),
    reservePredecessorBoxIdHex: digest('a'),
    sourceLockBoxIdHex: digest('b'),
    transitionFeeFundingBoxIdHex: digest('d'),
    sourceLockConfirmationHeight: 135,
    sourceLockConfirmationDigestHex: digest('9'),
    observedTipHeight: 136,
    observedTipHeaderIdHex: digest('2'),
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    primaryObservationDigestHex: digest('7'),
    witnessObservationDigestHex: digest('7'),
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorUnspent: true,
      exactSourceLockUnspent: true,
      exactTransitionFeeFundingUnspent: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
    }),
    observationDigestHex: digest('8'),
  } as const);
}

function validPegInCommittedVaultOutputObservation(
  exactConfirmation = confirmation(digest('9'), 4, 0),
) {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_spent_and_reserve_successor_unspent',
    expectedTxId: digest('9'),
    sourceFundingBoxIdHex: digest('c'),
    reservePredecessorBoxIdHex: digest('a'),
    sourceLockBoxIdHex: digest('b'),
    transitionFeeFundingBoxIdHex: digest('d'),
    reserveSuccessorBoxIdHex: digest('f'),
    confirmationHeight: exactConfirmation.confirmationHeight,
    confirmationHeaderIdHex: exactConfirmation.confirmationHeaderIdHex,
    confirmationObservationDigestHex: exactConfirmation.observationDigestHex,
    observedTipHeight: exactConfirmation.observedAtHeight,
    observedTipHeaderIdHex: exactConfirmation.confirmationHeaderIdHex,
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    primaryObservationDigestHex: digest('7'),
    witnessObservationDigestHex: digest('7'),
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorSpent: true,
      exactSourceLockSpent: true,
      exactTransitionFeeFundingSpent: true,
      exactReserveSuccessorUnspent: true,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    }),
    observationDigestHex: digest('9'),
  } as const);
}

const ROLE_ORDER = [
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const;

function digest(character: string): string {
  return character.repeat(64);
}

function publicKey(character: string): string {
  return `02${character.repeat(64)}`;
}

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (Array.isArray(value)) return value.some(containsFunction);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsFunction);
  }
  return false;
}

function localJournalDirectories(): ReadonlySet<string> {
  return new Set(
    readdirSync(tmpdir(), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('e2s-fed6lab-'))
      .map(entry => join(tmpdir(), entry.name)),
  );
}
