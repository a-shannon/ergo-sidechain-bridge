/**
 * State Tracker -- SQLite persistence for relayer state
 * 
 * Tracks peg-in/peg-out events, sidechain sync progress,
 * and AVL tree history for rebuild-on-demand pattern.
 * 
 * Inspired by production sequencer architecture:
 * - Event-sourced state via SQLite
 * - Crash-safe (rebuild from DB on restart)
 * - No in-memory state that isn't backed by a DB row
 */

import { createHash, randomBytes } from 'crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { resolve } from 'path';

import Database from 'better-sqlite3';
import {
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance,
} from './authenticated-settlement-candidate.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import {
  assertAuthenticatedSettlementCheckAdmissionProvenance,
  type AuthenticatedSettlementCheckAdmission,
} from './authenticated-settlement-check-admission.js';
import {
  AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA,
  assertAuthenticatedSettlementExecutionReservationAdmissionProvenance,
  deriveAuthenticatedSettlementCandidateAuthorityDigest,
  type AuthenticatedSettlementExecutionReservationAdmission,
} from './authenticated-settlement-execution-reservation.js';
import {
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION,
  AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA,
  assertAuthenticatedSettlementTransportAttemptCurrentAuthority,
  assertAuthenticatedSettlementTransportAttemptAdmissionProvenance,
  deriveAuthenticatedSettlementTransportAttemptIdentity,
  type AuthenticatedSettlementSubmissionFinalizationInput,
  type AuthenticatedSettlementTransportAttemptAdmission,
} from './authenticated-settlement-transport-attempt.js';
import {
  assertAuthenticatedSpvTrackerReconstructionProvenance,
  type AuthenticatedSpvTrackerReconstruction,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  assertAuthenticatedV2DupReconstructionProvenance,
  type AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import {
  assertAuthenticatedV2CacheRecoveryReportProvenance,
} from './authenticated-v2-cache-recovery.js';
import {
  assertAuthenticatedV2VaultReconstructionProvenance,
  type AuthenticatedV2SettlementVaultBox,
  type AuthenticatedV2VaultReconstruction,
} from './authenticated-v2-vault-reconstruction.js';
import {
  digestAuthenticatedV2PackageRecoveryBinding,
} from './adapters/authenticated-v2-package-recovery-reconstruction.js';
import {
  assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance,
} from './authenticated-settlement-sidechain-view.js';
import {
  AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
  assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance,
  assertAuthenticatedV2RecoverySourceMatchesDraft,
  type AuthenticatedV2PreparedCandidateRecoveryAdmission,
} from './relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import {
  OPERATOR_ALERT_DELIVERY_STATE_SCHEMA,
  OPERATOR_ALERT_PROFILE_ID,
  normalizeOperatorAlertDeliveryState,
  type OperatorAlertDeliveryState,
} from './relayer-core/operator-alert-delivery-state.js';
import {
  assertOutstandingPegOutLiabilityObservation,
  LEGACY_FAILED_PEG_OUT_CLASS_V1,
  type OutstandingPegOutLiabilityObservation,
  type OutstandingPegOutLiabilityStatus,
} from './relayer-core/cross-ledger-backing-alarm.js';
import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  DUP_HEARTBEAT_OPERATION_PROFILE,
  ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  type ErgoOperationalTransactionProfile,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  PEG_IN_MINT_FEE_POLICY_ID,
  PEG_IN_MINT_TRANSPORT_SCHEMA,
  normalizePegInMintAcceptedSubmission,
  type PegInMintAcceptedSubmission,
  type PegInMintTransportRejectionReason,
} from './relayer-core/peg-in-mint-transport-lifecycle.js';
import {
  AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
  decodeAuthenticatedSpvTrackerValue,
  deriveAuthenticatedSpvTrackerKey,
  type AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import { getSpvTrackerDigest, type SpvTrackerEntry } from './spv-tracker.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA } from './bridge-finality-proof.js';
import {
  DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY,
  normalizeAggregateSettlementErgoObservationRecord,
  type AggregateSettlementErgoObservationRecord,
} from './aggregate-settlement-ergo-finality-policy.js';
import {
  AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance,
  assertStableAggregateSettlementErgoObservationProvenance,
  type MatchingAggregateSettlementErgoObservationConsensus,
  type StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';
import {
  PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA,
  PEG_IN_ROUTE_RECONSTRUCTION_BOUNDARY,
  assertPegInRouteReconstructionProvenance,
  pegInRouteReconstructionDigestHex,
  type PegInRouteReconstruction,
  type PegInRouteReconstructionDeposit,
  type PegInRouteReconstructionLegacyRoute,
  type PegInRouteReconstructionSemantic,
} from './peg-in-route-reconstruction.js';
import {
  createPegInCommitmentReceipt,
  parsePegInCommitmentReceiptJson,
  pegInCommitmentReceiptDigestHex,
  pegInCommitmentReceiptJson,
  type PegInCommitmentReceipt,
} from './peg-in-commitment-receipt.js';
import {
  assertPegInSidechainReconstructionProvenance,
  validatePegInSidechainReconstructionStructure,
  type PegInSidechainReconstruction,
} from './peg-in-sidechain-reconstruction.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA,
  classifyPooledReserveMintReservationRecoveryStateV4,
  pooledReserveMintReservationRecoveryObservationDigestHexV4,
  type PersistPooledReserveMintReservationRecoveryObservationV4Input,
  type PersistPooledReserveMintReservationRecoveryObservationV4Result,
  type PooledReserveMintReservationRecoveryObservationV4,
  type PooledReserveMintReservationRecoveryObservationV4Semantic,
} from './pooled-reserve-mint-reservation-recovery-v4.js';
import {
  assertPooledReserveMintReservationFinalityContinuityV4Binding,
  type PooledReserveMintReservationFinalityContinuityV4,
} from './pooled-reserve-mint-reservation-finality-continuity-v4.js';
import { canonicalJson, parseStrictJson, sha256CanonicalJson } from './strict-json.js';

const AUTHENTICATED_V2_RECOVERY_PROVENANCE_MIGRATION =
  'authenticated-v2-recovery-provenance-v1';

export const PEG_IN_RECONCILIATION_OBSERVATION_SCHEMA =
  'e2s.peg-in-reconciliation-observation.v1';
export const PEG_IN_RECONCILIATION_OBSERVATION_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:peg-in-reconciliation-observation:v1';
export const PEG_IN_SAFETY_INCIDENT_SCHEMA =
  'e2s.peg-in-safety-incident.v1';
export const PEG_IN_SAFETY_INCIDENT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:peg-in-safety-incident:v1';
export const PEG_IN_CIRCUIT_BREAKER_STATE_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:peg-in-circuit-breaker-state:v1';
export const LOCAL_CONTINUITY_STATE_SCHEMA =
  'e2s.local-continuity-state.v1';
export const LOCAL_CONTINUITY_IDENTITY_SCHEMA =
  'e2s.local-continuity-identity.v1';
export const LOCAL_CONTINUITY_WITNESS_SCHEMA =
  'e2s.local-continuity-witness.v2';
export const FUNDS_EXECUTION_AUTHORITY_SCHEMA =
  'e2s.funds-execution-authority.v1';

const LOCAL_CONTINUITY_LOCATION_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:local-continuity-location:v1';

export type PegInStatus =
  | 'detected'
  | 'confirmed'
  | 'consume_submitted'
  | 'consume_confirmed'
  | 'minting'
  | 'minted'
  | 'commit_invalid'
  | 'incident'
  | 'failed';
export type PegInSourceClassification =
  | 'unknown'
  | 'active_committed_vault'
  | 'legacy_unminted_refundable'
  | 'legacy_minted_requires_migration'
  | 'legacy_already_consumed';
export type PegInSafetyIncidentKind =
  | 'commitment_disappeared'
  | 'refundable_source_restored'
  | 'canonical_header_replaced'
  | 'commitment_receipt_conflict'
  | 'committed_vault_unavailable'
  | 'mint_outcome_commitment_lost'
  | 'legacy_refundable_after_mint'
  | 'submission_identity_mismatch'
  | 'missing_commitment_receipt'
  | 'solvency_deficit'
  | 'unspecified';
export type PegOutStatus = 'detected' | 'confirmed' | 'phase1_created' | 'aggregate_submitted' | 'batch_submitted' | 'phase2_unlocked' | 'burn_reverted' | 'failed';
export type SubmittedSettlementStatus = Extract<PegOutStatus, 'aggregate_submitted' | 'batch_submitted'>;
export type AggregateSettlementAttemptMode = 'single' | 'single-with-ingest' | 'batch';
export type AggregateSettlementAttemptStatus = 'pending' | 'submitted' | 'confirmed' | 'abandoned';
export type AggregateSettlementAbandonmentReason =
  | 'legacy_unclassified'
  | 'pending_pretransport'
  | 'burn_invalidation'
  | 'submitted_absence'
  | 'pending_transport_absence';
export type AggregateSettlementRecoveryBindingStatus = 'legacy_unbound' | 'policy_v1';
export type AggregateSettlementRecoveryQuarantineReason = 'confirmed_reorg_observed';
export type AuthenticatedSettlementCandidateStatus = 'prepared' | 'check_passed' | 'invalidated';
export type AuthenticatedSettlementExecutionReservationStatus = 'active' | 'revoked';
export type AuthenticatedSettlementSubmissionAttemptStatus =
  | 'pending'
  | 'rejected'
  | 'submitted'
  | 'confirmed'
  | 'quarantined';
export type AuthenticatedSettlementSubmissionQuarantineReason =
  | 'execution_reservation_revoked'
  | 'confirmed_transaction_disappeared'
  | 'confirmed_transaction_reorged';

export interface PegInEvent {
  id: number;
  ergoLockBoxId: string;
  targetEvmAddress: string;
  amountNanoErg: bigint;
  ergoLockHeight: number;
  status: PegInStatus;
  sourceClassification: PegInSourceClassification;
  depositorErgoTreeHex: string | null;
  commitTxId: string | null;
  committedVaultBoxId: string | null;
  commitInclusionHeight: number | null;
  commitInclusionHeaderId: string | null;
  commitmentReceipt: Readonly<PegInCommitmentReceipt> | null;
  commitmentReceiptDigestHex: string | null;
  commitFailure: string | null;
  sidechainMintTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PegInMintTransportAttemptStatus =
  | 'pending'
  | 'rejected'
  | 'accepted'
  | 'ambiguous'
  | 'confirmed'
  | 'abandoned'
  | 'quarantined';

export interface PegInMintTransportAttemptRecord {
  readonly id: number;
  readonly pegInId: number;
  readonly operationDigestHex: string;
  readonly envelopeDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly signedEnvelopeDigestHex: string;
  readonly attemptDigestHex: string;
  readonly sourceBoxIdHex: string;
  readonly committedVaultBoxIdHex: string;
  readonly commitmentReceiptDigestHex: string;
  readonly recipientAddress: string;
  readonly amountNanoErg: bigint;
  readonly chainId: string;
  readonly bridgeAddress: string;
  readonly sergAddress: string;
  readonly relayerAddress: string;
  readonly bridgeCodeHashHex: string;
  readonly sergOwnerAddress: string;
  readonly sergCodeHashHex: string;
  readonly feePolicyId: typeof PEG_IN_MINT_FEE_POLICY_ID;
  readonly admittedBlockNumber: number;
  readonly admittedBlockHashHex: string;
  readonly observedPendingNonce: number;
  readonly expiresAtBlockNumber: number;
  readonly callDataHex: string;
  readonly transactionType: 0 | 2;
  readonly nonce: number;
  readonly gasLimit: bigint;
  readonly gasPriceWei: bigint | null;
  readonly maxFeePerGasWei: bigint | null;
  readonly maxPriorityFeePerGasWei: bigint | null;
  readonly accessListDigestHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionDigestHex: string;
  readonly expectedTransactionHashHex: string;
  readonly status: PegInMintTransportAttemptStatus;
  readonly rejectionReason: PegInMintTransportRejectionReason | null;
  readonly transactionHashHex: string | null;
  readonly responseDigestHex: string | null;
  readonly confirmationBlockNumber: number | null;
  readonly confirmationBlockHashHex: string | null;
  readonly confirmationCount: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PegInIncidentInput {
  readonly kind: PegInSafetyIncidentKind;
  readonly reason: string;
  readonly observedCommitmentReceiptDigestHex?: string | null;
}

export interface PegInCircuitBreakerState {
  readonly open: boolean;
  readonly incidentCount: number;
  readonly continuityStatus: 'established' | 'recovery_required';
  readonly continuityRecoveryRequired: boolean;
  readonly externalContinuityWitnessCurrent: boolean;
  readonly retainedExecutionAuthority: boolean;
  readonly stateDigestHex: string;
}

export interface FundsExecutionAuthorityLease {
  readonly schema: typeof FUNDS_EXECUTION_AUTHORITY_SCHEMA;
  readonly epochHex: string;
}

export interface FundsReleaseAuthorization
  extends PegInCircuitBreakerState {
  readonly executionAuthorityEpochHex: string;
}

export interface PegOutEvent {
  id: number;
  sidechainBurnTxHash: string;
  sidechainId: string | null;
  burnId: string | null;
  ergoRecipientAddress: string;
  amountNanoErg: bigint;
  sidechainBurnHeight: number;
  user: string | null;
  sidechainBlockHash: string | null;
  sidechainLogIndex: number | null;
  status: PegOutStatus;
  phase1BoxId: string | null;
  phase2UnlockTxId: string | null;
  avlProofHex: string | null;
  ergoAnchorHeight: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpvTrackerHistoryEntry {
  keyHex: string;
  valueHex: string;
  sidechainHeight: bigint;
  sidechainHeaderHash: string;
  bridgeEventRoot: string;
  ergoAnchorHeight: number;
}

export interface AuthenticatedSpvTrackerHistoryEntry {
  keyHex: string;
  valueHex: string;
  sidechainId: string;
  sidechainHeight: bigint;
  executionBlockHash: string;
  bridgeEventRoot: string;
  checkpointCommitment: string;
  anchorHeaderId: string;
  anchorHeaderHeight: number;
}

export interface AuthenticatedSpvTrackerHistoryReplacementResult {
  changed: boolean;
  previousEntries: number;
  currentEntries: number;
  invalidatedCandidates: number;
}

export interface AuthenticatedSpvTrackerReconstructionCacheState {
  sidechainIdHex: string;
  trackerNftIdHex: string;
  genesisBoxId: string;
  finalityAttestorSigmaPropRegisterHex: string;
  tipBoxId: string;
  tipDigest: string;
  observationDigest: string;
  observedErgoTip: number;
  observedErgoTipId: string;
  observedErgoParentId: string;
  observedErgoExtensionRoot: string;
}

export interface AuthenticatedV2DupHistoryReplacementResult {
  changed: boolean;
  previousEntries: number;
  currentEntries: number;
  invalidatedCandidates: number;
}

export interface AuthenticatedV2DupReconstructionCacheState {
  duplicatePreventionNftIdHex: string;
  duplicatePreventionErgoTreeHex: string;
  genesisBoxId: string;
  tipBoxId: string;
  tipDigest: string;
  observationDigest: string;
  observedErgoTip: number;
  observedErgoTipId: string;
  observedErgoParentId: string;
  observedErgoExtensionRoot: string;
}

export interface AuthenticatedV2DupCacheIdentity {
  duplicatePreventionNftIdHex: string;
  duplicatePreventionErgoTreeHex: string;
}

export interface AuthenticatedV2VaultHistoryReplacementResult {
  changed: boolean;
  previousBoxes: number;
  currentBoxes: number;
  previousUnspentBoxes: number;
  currentUnspentBoxes: number;
  invalidatedCandidates: number;
}

export interface AuthenticatedV2VaultReconstructionCacheState {
  vaultAddress: string;
  vaultErgoTreeHex: string;
  duplicatePreventionObservationDigestHex: string;
  duplicatePreventionTipBoxIdHex: string;
  observationDigestHex: string;
  observedErgoTip: number;
  observedErgoTipIdHex: string;
  observedErgoParentIdHex: string;
  observedErgoExtensionRootHex: string;
}

export interface AuthenticatedV2VaultCacheIdentity {
  vaultAddress: string;
  vaultErgoTreeHex: string;
}

export interface AuthenticatedV2RecoveryCacheReplacementInput {
  trackerReconstruction: AuthenticatedSpvTrackerReconstruction;
  duplicatePreventionReconstruction: AuthenticatedV2DupReconstruction;
  duplicatePreventionIdentity: AuthenticatedV2DupCacheIdentity;
  vaultReconstruction: AuthenticatedV2VaultReconstruction;
  vaultIdentity: AuthenticatedV2VaultCacheIdentity;
}

export interface AuthenticatedV2RecoveryCacheReplacementResult {
  tracker: AuthenticatedSpvTrackerHistoryReplacementResult;
  duplicatePrevention: AuthenticatedV2DupHistoryReplacementResult;
  vault: AuthenticatedV2VaultHistoryReplacementResult;
  activeCandidatesBefore: number;
  activeCandidatesAfter: number;
  recoverableAttemptsBefore: number;
  recoverableAttemptsAfter: number;
}

export type AuthenticatedSpvTrackerPersistedIdentity = Omit<
  AuthenticatedSpvTrackerIdentity,
  'sidechainHeight'
> & { sidechainHeight: bigint };

export interface AggregateSettlementAttempt {
  id: number;
  mode: AggregateSettlementAttemptMode;
  expectedTxId: string;
  submittedTxId: string | null;
  burnTxHashes: string[];
  status: AggregateSettlementAttemptStatus;
  abandonmentReason: AggregateSettlementAbandonmentReason | null;
  lifecycleVersion: number;
  transportReservationDigest: string | null;
  fundsReleaseAuthorityEpochHex: string | null;
  transportStartedAt: string | null;
  transportCompletedAt: string | null;
  recoveryBindingStatus: AggregateSettlementRecoveryBindingStatus;
  recoveryPolicyVersion: number | null;
  recoveryRequiredConfirmations: number | null;
  ergoObservation: AggregateSettlementErgoObservationRecord | null;
  ergoObservationSourceCount: number;
  ergoObservationConsensusDigest: string | null;
  recoveryQuarantine: {
    reason: AggregateSettlementRecoveryQuarantineReason;
    observation: AggregateSettlementErgoObservationRecord;
    sourceCount: number;
    consensusDigestHex: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PegInRouteReconstructionCacheState {
  schema: typeof PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA;
  manifestId: string;
  manifestDigestHex: string;
  sourceRevisionHex: string;
  routeBindings: PegInRouteReconstruction['routeBindings'];
  networkId: string;
  snapshot: PegInRouteReconstruction['network']['snapshot'];
  anchorHeader: PegInRouteReconstruction['network']['anchorHeader'];
  primarySourceId: string;
  witnessSourceId: string;
  observationDigestHex: string;
  reconstructionDigestHex: string;
  decision: PegInRouteReconstruction['decision'];
  observedAt: string;
}

export interface PegInRouteReconstructionCacheSnapshot {
  state: PegInRouteReconstructionCacheState;
  activeHistory: PegInRouteReconstructionDeposit[];
  activeCurrentBoxIdsHex: string[];
  vaultHistoryBoxIdsHex: string[];
  vaultCurrentBoxIdsHex: string[];
  legacyRoutes: PegInRouteReconstructionLegacyRoute[];
}

export interface PegInRouteReconstructionReplacementResult {
  changed: boolean;
  previousDeposits: number;
  currentDeposits: number;
  previousVaultBoxes: number;
  currentVaultBoxes: number;
  previousLegacyBoxes: number;
  currentLegacyBoxes: number;
  pegInLifecycleRowsCreatedOrChanged: 0;
}

export interface PegInJoinedReconstructionCacheSnapshot {
  route: PegInRouteReconstructionCacheSnapshot;
  sidechain: PegInSidechainReconstruction;
}

export interface PegInJoinedReconstructionReplacementInput {
  routeReconstruction: PegInRouteReconstruction;
  sidechainReconstruction: PegInSidechainReconstruction;
}

export interface PegInJoinedReconstructionReplacementResult {
  changed: boolean;
  route: PegInRouteReconstructionReplacementResult;
  previousEntries: number;
  currentEntries: number;
  previousIssues: number;
  currentIssues: number;
  pegInLifecycleRowsCreatedOrChanged: 0;
  settlementAuthorityRowsCreatedOrChanged: 0;
}

export type PegInReconciliationDisposition = 'deferred' | 'quarantined';
export type PegInReconciliationReason =
  | 'native_grandpa_finality_unavailable'
  | 'joined_reconstruction_inconsistent'
  | 'joined_entry_missing'
  | 'joined_entry_invalid'
  | 'source_classification_mismatch'
  | 'committed_vault_not_observed'
  | 'unexpected_frontier_mint'
  | 'local_mint_not_observed'
  | 'local_mint_identity_missing'
  | 'local_mint_identity_mismatch'
  | 'local_lifecycle_terminal'
  | 'event_binding_mismatch';

export interface PegInReconciliationObservationSemantic {
  schema: typeof PEG_IN_RECONCILIATION_OBSERVATION_SCHEMA;
  pegInId: number;
  ergoLockBoxId: string;
  lifecycleStatus: PegInStatus;
  lifecycleDigestHex: string;
  joinedReconstructionDigestHex: string;
  ergoRouteReconstructionDigestHex: string;
  frontierViewDigestHex: string;
  observedTip: Readonly<{ height: number; idHex: string }>;
  joinedEntryState: PegInSidechainReconstruction['entries'][number]['state'] | null;
  joinedEventTransactionHashHex: string | null;
  disposition: PegInReconciliationDisposition;
  reason: PegInReconciliationReason;
  observedAt: string;
}

export interface PegInReconciliationObservation
  extends PegInReconciliationObservationSemantic {
  id: number;
  observationDigestHex: string;
  createdAt: string;
}

export interface RecordPegInReconciliationInput {
  ergoLockBoxId: string;
  expectedLifecycleDigestHex: string;
  expectedJoinedReconstructionDigestHex: string;
}

export interface RecordPegInReconciliationResult {
  appended: boolean;
  observation: PegInReconciliationObservation;
  lifecycleRowsCreatedOrChanged: 0;
  settlementAuthorityRowsCreatedOrChanged: 0;
}

export interface PegInRuntimeReconciliationCandidatePage {
  candidates: PegInEvent[];
  remainingCandidates: boolean;
}

export interface AggregateSettlementJournalAdmission {
  expectedTxId: string;
  lifecycleVersion: number;
  mode: AggregateSettlementAttemptMode;
  burnTxHashes: string[];
  fundsReleaseAuthorityEpochHex?: string | null;
}

export interface AggregateSettlementTransportReservation
  extends AggregateSettlementJournalAdmission {
  reservationDigest: string;
}

export interface AggregateSettlementAbandonMutationResult {
  resetBurns: number;
  skippedBurns: number;
}

export interface AggregateSettlementRecoveryMutationResult {
  applied: boolean;
  restoredBurns: number;
  skippedBurns: number;
  missingPegOuts: number;
  rolledBackBurns: number;
  rolledBackPreFinality: boolean;
}

export interface AggregateSettlementRecoveryMutationInput {
  expectedTxId: string;
  expectedLifecycleVersion: number;
  expectedStatus: Extract<AggregateSettlementAttemptStatus, 'pending' | 'submitted'>;
  expectedSubmittedTxId: string | null;
  mode: AggregateSettlementAttemptMode;
  burnTxHashes: string[];
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus | null;
}

export interface AggregateSettlementRecoveryObservationHistoryEntry {
  expectedTxId: string;
  lifecycleVersion: number;
  purpose: 'abandonment_absence';
  sourceAuthorityProfile: typeof AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE;
  observation: AggregateSettlementErgoObservationRecord;
  sourceCount: number;
  consensusDigestHex: string;
  createdAt: string;
}

export interface AggregateSettlementRecoveryObservationAppendInput {
  expectedTxId: string;
  expectedLifecycleVersion: number;
  expectedStatus: Extract<AggregateSettlementAttemptStatus, 'pending' | 'submitted'>;
  purpose: 'abandonment_absence';
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus;
}

export interface AggregateSettlementRecoveryObservationAppendResult {
  recorded: boolean;
  previous: AggregateSettlementRecoveryObservationHistoryEntry | null;
  current: AggregateSettlementRecoveryObservationHistoryEntry;
}

export interface ConfirmedAggregateSettlementReorgObservationInput {
  expectedTxId: string;
  expectedLifecycleVersion: number;
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus;
}

export interface AuthenticatedSettlementCandidateInput {
  schemaVersion: number;
  candidateId: string;
  burnId: string;
  burnTxHash: string;
  sidechainId: string;
  sidechainHeight: bigint;
  sidechainBlockHash: string;
  sidechainLogIndex: number;
  trackerKey: string;
  trackerValue: string;
  trackerBoxId: string;
  anchorHeaderId: string;
  anchorHeaderHeight: number;
  dupInputBoxId: string;
  dupInputDigest: string;
  vaultBoxId: string;
  unsignedTxDigest: string;
  creationHeight: number;
  observedSidechainTip: bigint;
  observedErgoTip: number;
}

export interface AuthenticatedSettlementCandidate extends AuthenticatedSettlementCandidateInput {
  status: AuthenticatedSettlementCandidateStatus;
  recoverySchema: string | null;
  recoverySidechainConsensusDigest: string | null;
  recoveryAdmissionDigest: string | null;
  recoverySidechainTipHash: string | null;
  recoverySidechainSourceCount: number | null;
  checkExpectedTxId: string | null;
  checkUnsignedPackageDigest: string | null;
  checkSignedTransactionDigest: string | null;
  checkResponseDigest: string | null;
  checkSignerContextDigest: string | null;
  checkCheckerIdentityDigest: string | null;
  checkRevalidationDigest: string | null;
  checkNativeVerificationRequestDigest: string | null;
  checkTrustAnchorDigest: string | null;
  checkFinalityHorizonHash: string | null;
  checkFinalityHorizonHeight: bigint | null;
  checkFinalityStatementDigest: string | null;
  checkFinalityProgramId: string | null;
  checkFinalityProofSystemId: number | null;
  checkFinalityVerifierProfileId: string | null;
  checkFinalityProofPayloadDigest: string | null;
  checkFinalityProofDigest: string | null;
  checkStableErgoViewDigest: string | null;
  checkStableSidechainViewDigest: string | null;
  checkAdmissionDigest: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedSettlementBurnRevertResult {
  pegOutTransitioned: boolean;
  candidatesInvalidated: number;
}

export interface PendingAggregateSettlementBurnInvalidationResult {
  attemptAbandoned: boolean;
  pegOutsTransitioned: number;
  candidatesInvalidated: number;
}

export interface AuthenticatedSettlementExecutionReservation {
  schema: string;
  reservationDigestHex: string;
  candidateId: string;
  candidateAuthorityDigestHex: string;
  burnId: string;
  burnTxHash: string;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
  duplicatePreventionBoxId: string;
  vaultBoxId: string;
  expectedTxId: string;
  unsignedTxDigestHex: string;
  unsignedPackageDigestHex: string;
  signedTransactionDigestHex: string;
  checkResponseDigestHex: string;
  signerContextDigestHex: string | null;
  checkerIdentityDigestHex: string | null;
  revalidationDigestHex: string;
  stableErgoViewDigestHex: string;
  stableSidechainViewDigestHex: string;
  finalityProofDigestHex: string;
  checkAdmissionDigestHex: string;
  authorizationDigestHex: string;
  status: AuthenticatedSettlementExecutionReservationStatus;
  revocationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AuthenticatedSettlementExecutionReservationLookup =
  | { reservationDigestHex: string }
  | { candidateId: string };

export interface AuthenticatedSettlementSubmissionAttempt {
  schema: string;
  lifecycleVersion: number;
  executionReservationDigestHex: string;
  transportReservationDigestHex: string;
  durableAttemptDigestHex: string;
  candidateId: string;
  expectedTxId: string;
  unsignedTxDigestHex: string;
  unsignedPackageDigestHex: string;
  payoutDigestHex: string;
  trackerBoxId: string;
  duplicatePreventionBoxId: string;
  signedTransactionDigestHex: string;
  preSubmitRevalidationDigestHex: string;
  broadcastAuthorizationDigestHex: string;
  status: AuthenticatedSettlementSubmissionAttemptStatus;
  submissionAttempted: true;
  submissionDisposition: 'accepted' | 'rejected' | 'ambiguous' | null;
  submittedTxId: string | null;
  responseDigestHex: string | null;
  ergoObservation: AggregateSettlementErgoObservationRecord | null;
  ergoObservationSourceCount: number;
  ergoObservationConsensusDigestHex: string | null;
  quarantineReason: AuthenticatedSettlementSubmissionQuarantineReason | null;
  createdAt: string;
  submissionFinalizedAt: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}

export type AuthenticatedSettlementSubmissionAttemptLookup =
  | { durableAttemptDigestHex: string }
  | { executionReservationDigestHex: string }
  | { expectedTxId: string };

export interface AuthenticatedSettlementSubmissionObservationInput {
  durableAttemptDigestHex: string;
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus;
}

export interface AuthenticatedSettlementSubmissionObservationResult {
  applied: boolean;
  status:
    | 'pending_reconciliation'
    | 'submitted'
    | 'confirmed'
    | 'quarantined';
  attempt: AuthenticatedSettlementSubmissionAttempt;
}

export type ErgoOperationalTransactionAttemptStatus =
  | 'pending'
  | 'accepted'
  | 'ambiguous'
  | 'confirmed'
  | 'abandoned'
  | 'quarantined';

export interface ErgoOperationalTransactionAttempt {
  schema: typeof ERGO_OPERATIONAL_TRANSACTION_SCHEMA;
  operationProfile: ErgoOperationalTransactionProfile;
  expectedTxId: string;
  sourceBoxId: string;
  inputBoxIds: readonly string[];
  attemptedAtHeight: number;
  targetSidechainHeight: number | null;
  targetSidechainBlockHashHex: string | null;
  heartbeatKeyHex: string | null;
  reconciliationIdentityDigestHex: string | null;
  bindingDigestHex: string;
  signedTransactionDigestHex: string;
  checkResponseDigestHex: string;
  revalidationDigestHex: string;
  authorizationDigestHex: string;
  fundsReleaseAuthorityEpochHex: string | null;
  durableAttemptDigestHex: string;
  status: ErgoOperationalTransactionAttemptStatus;
  submissionDisposition: 'accepted' | 'ambiguous' | null;
  submittedTxId: string | null;
  responseDigestHex: string | null;
  confirmationHeight: number | null;
  confirmationHeaderId: string | null;
  abandonmentReason: string | null;
  quarantineReason: string | null;
  createdAt: string;
  submissionFinalizedAt: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}

export interface ReserveErgoOperationalTransactionAttemptInput {
  operationProfile: ErgoOperationalTransactionProfile;
  expectedTxId: string;
  sourceBoxId: string;
  inputBoxIds: readonly string[];
  attemptedAtHeight: number;
  targetSidechainHeight: number | null;
  targetSidechainBlockHashHex: string | null;
  heartbeatKeyHex: string | null;
  reconciliationIdentityDigestHex?: string | null;
  bindingDigestHex: string;
  signedTransactionDigestHex: string;
  checkResponseDigestHex: string;
  revalidationDigestHex: string;
  authorizationDigestHex: string;
}

export interface StateTrackerOptions {
  readOnly?: boolean;
}

export interface OperatorHealthPersistenceState {
  readonly solvencyDeficitIncidentPresent: boolean;
  readonly reorgQuarantineConditionCount: number;
  readonly activeSettlementAttemptCount: number;
  readonly oldestActiveSettlementUpdatedAtMs: number | null;
}

export interface PegOutBurnMetadata {
  user?: string;
  sidechainId?: string;
  sidechainBlockHash?: string;
  sidechainLogIndex?: number;
}

export type PegOutEventLookup =
  | string
  | { burnId: string }
  | { burnTxHash: string; sidechainLogIndex: number };

function normalizeHex(hex: string, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hex`);
  }
  return clean.toLowerCase();
}

function normalizeFixedHex(hex: string, expectedBytes: number, label: string): string {
  const clean = normalizeHex(hex, label);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean;
}

function normalizeBurnTxHash(txHash: string): string {
  return normalizeFixedHex(txHash, 32, 'sidechain burn tx hash');
}

function normalizeBurnId(burnId: string): string {
  return normalizeFixedHex(burnId, 32, 'burnId');
}

function normalizeSettlementTxId(txId: string): string {
  return normalizeFixedHex(txId, 32, 'aggregate settlement tx id');
}

function normalizeErgoOperationalTransactionProfile(
  value: string,
): ErgoOperationalTransactionProfile {
  if (
    value !== PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
    && value !== SCS_ORACLE_UPDATE_OPERATION_PROFILE
    && value !== DUP_HEARTBEAT_OPERATION_PROFILE
    && value !== DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
    && value !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
  ) {
    throw new Error('unknown Ergo operational transaction profile');
  }
  return value;
}

function normalizeErgoOperationalAttemptHeight(
  value: unknown,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizeErgoOperationalInputBoxIds(
  value: unknown,
  sourceBoxId: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Ergo operational attempt input box IDs must be a non-empty array');
  }
  const inputBoxIds = value.map((item, index) =>
    normalizeFixedHex(
      String(item),
      32,
      `Ergo operational attempt inputBoxIds[${index}]`,
    ));
  if (new Set(inputBoxIds).size !== inputBoxIds.length) {
    throw new Error('Ergo operational attempt input box IDs must be unique');
  }
  if (inputBoxIds[0] !== sourceBoxId) {
    throw new Error('Ergo operational attempt source box must be its first input');
  }
  return Object.freeze(inputBoxIds);
}

function normalizeErgoOperationalContext(input: {
  operationProfile: ErgoOperationalTransactionProfile;
  targetSidechainHeight: unknown;
  targetSidechainBlockHashHex: unknown;
  heartbeatKeyHex: unknown;
}): {
  targetSidechainHeight: number | null;
  targetSidechainBlockHashHex: string | null;
  heartbeatKeyHex: string | null;
} {
  if (input.operationProfile === PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE) {
    if (
      input.targetSidechainHeight != null
      || input.targetSidechainBlockHashHex != null
      || input.heartbeatKeyHex != null
    ) {
      throw new Error('committed-vault operational attempt has invalid route context');
    }
    return {
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    };
  }
  if (input.operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE) {
    if (input.heartbeatKeyHex != null) {
      throw new Error('SCS operational attempt has invalid heartbeat context');
    }
    return {
      targetSidechainHeight: normalizeErgoOperationalAttemptHeight(
        input.targetSidechainHeight,
        'SCS operational target height',
      ),
      targetSidechainBlockHashHex: normalizeFixedHex(
        String(input.targetSidechainBlockHashHex),
        32,
        'SCS operational target block hash',
      ),
      heartbeatKeyHex: null,
    };
  }
  if (
    input.operationProfile === DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
    || input.operationProfile
      === SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
  ) {
    if (
      input.targetSidechainHeight != null
      || input.targetSidechainBlockHashHex != null
      || input.heartbeatKeyHex != null
    ) {
      throw new Error(
        'local devnet operational attempt has invalid route context',
      );
    }
    return {
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    };
  }
  if (
    input.targetSidechainHeight != null
    || input.targetSidechainBlockHashHex != null
  ) {
    throw new Error('DUP heartbeat operational attempt has invalid SCS context');
  }
  return {
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: normalizeFixedHex(
      String(input.heartbeatKeyHex),
      32,
      'DUP operational heartbeat key',
    ),
  };
}

function normalizeErgoOperationalReconciliationIdentity(
  operationProfile: ErgoOperationalTransactionProfile,
  value: unknown,
): string | null {
  if (
    operationProfile === DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
    || operationProfile
      === SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
  ) {
    return normalizeFixedHex(
      String(value),
      32,
      'local devnet operational reconciliation identity digest',
    );
  }
  if (value != null) {
    throw new Error(
      'only local devnet operational profiles may bind a reconciliation identity digest',
    );
  }
  return null;
}

interface ErgoOperationalTransactionAttemptRow {
  schema: string;
  operation_profile: string;
  expected_tx_id: string;
  source_box_id: string;
  input_box_ids_json: string;
  attempted_at_height: number;
  target_sidechain_height: number | null;
  target_sidechain_block_hash: string | null;
  heartbeat_key_hex: string | null;
  reconciliation_identity_digest: string | null;
  binding_digest: string;
  signed_transaction_digest: string;
  check_response_digest: string;
  revalidation_digest: string;
  authorization_digest: string;
  funds_release_authority_epoch: string | null;
  durable_attempt_digest: string;
  status: ErgoOperationalTransactionAttemptStatus;
  submission_disposition: 'accepted' | 'ambiguous' | null;
  submitted_tx_id: string | null;
  response_digest: string | null;
  confirmation_height: number | null;
  confirmation_header_id: string | null;
  abandonment_reason: string | null;
  quarantine_reason: string | null;
  created_at: string;
  submission_finalized_at: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

function mapErgoOperationalTransactionAttempt(
  row: ErgoOperationalTransactionAttemptRow,
): ErgoOperationalTransactionAttempt {
  if (row.schema !== ERGO_OPERATIONAL_TRANSACTION_SCHEMA) {
    throw new Error('persisted Ergo operational transaction schema is unsupported');
  }
  const operationProfile = normalizeErgoOperationalTransactionProfile(
    row.operation_profile,
  );
  const expectedTxId = normalizeFixedHex(
    row.expected_tx_id,
    32,
    'persisted Ergo operational expected transaction ID',
  );
  const sourceBoxId = normalizeFixedHex(
    row.source_box_id,
    32,
    'persisted Ergo operational source box ID',
  );
  const parsedInputBoxIds = parseStrictJson(
    row.input_box_ids_json,
    'persisted Ergo operational input box IDs',
  );
  const inputBoxIds = normalizeErgoOperationalInputBoxIds(
    parsedInputBoxIds,
    sourceBoxId,
  );
  if (canonicalJson(inputBoxIds) !== row.input_box_ids_json) {
    throw new Error('persisted Ergo operational input box IDs must be canonical JSON');
  }
  const context = normalizeErgoOperationalContext({
    operationProfile,
    targetSidechainHeight: row.target_sidechain_height,
    targetSidechainBlockHashHex: row.target_sidechain_block_hash,
    heartbeatKeyHex: row.heartbeat_key_hex,
  });
  const reconciliationIdentityDigestHex =
    normalizeErgoOperationalReconciliationIdentity(
      operationProfile,
      row.reconciliation_identity_digest,
    );
  if (
    !['pending', 'accepted', 'ambiguous', 'confirmed', 'abandoned', 'quarantined']
      .includes(row.status)
  ) {
    throw new Error('persisted Ergo operational attempt status is unsupported');
  }
  if (
    row.status === 'confirmed'
    && (
      row.confirmation_height === null
      || row.confirmation_header_id === null
      || row.confirmed_at === null
    )
  ) {
    throw new Error(
      'persisted confirmed Ergo operational attempt lacks an exact block identity',
    );
  }
  return Object.freeze({
    schema: ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
    operationProfile,
    expectedTxId,
    sourceBoxId,
    inputBoxIds,
    attemptedAtHeight: normalizeErgoOperationalAttemptHeight(
      row.attempted_at_height,
      'persisted Ergo operational attempted height',
    ),
    targetSidechainHeight: context.targetSidechainHeight,
    targetSidechainBlockHashHex: context.targetSidechainBlockHashHex,
    heartbeatKeyHex: context.heartbeatKeyHex,
    reconciliationIdentityDigestHex,
    bindingDigestHex: normalizeFixedHex(
      row.binding_digest,
      32,
      'persisted Ergo operational binding digest',
    ),
    signedTransactionDigestHex: normalizeFixedHex(
      row.signed_transaction_digest,
      32,
      'persisted Ergo operational signed transaction digest',
    ),
    checkResponseDigestHex: normalizeFixedHex(
      row.check_response_digest,
      32,
      'persisted Ergo operational check response digest',
    ),
    revalidationDigestHex: normalizeFixedHex(
      row.revalidation_digest,
      32,
      'persisted Ergo operational revalidation digest',
    ),
    authorizationDigestHex: normalizeFixedHex(
      row.authorization_digest,
      32,
      'persisted Ergo operational authorization digest',
    ),
    fundsReleaseAuthorityEpochHex:
      row.funds_release_authority_epoch === null
        ? null
        : normalizeFixedHex(
            row.funds_release_authority_epoch,
            32,
            'persisted funds-release authority epoch',
          ),
    durableAttemptDigestHex: normalizeFixedHex(
      row.durable_attempt_digest,
      32,
      'persisted Ergo operational durable attempt digest',
    ),
    status: row.status,
    submissionDisposition: row.submission_disposition,
    submittedTxId: row.submitted_tx_id === null
      ? null
      : normalizeFixedHex(
          row.submitted_tx_id,
          32,
          'persisted Ergo operational submitted transaction ID',
        ),
    responseDigestHex: row.response_digest === null
      ? null
      : normalizeFixedHex(
          row.response_digest,
          32,
          'persisted Ergo operational response digest',
        ),
    confirmationHeight: row.confirmation_height === null
      ? null
      : normalizeErgoOperationalAttemptHeight(
          row.confirmation_height,
          'persisted Ergo operational confirmation height',
        ),
    confirmationHeaderId: row.confirmation_header_id === null
      ? null
      : normalizeFixedHex(
          row.confirmation_header_id,
          32,
          'persisted Ergo operational confirmation header ID',
        ),
    abandonmentReason: row.abandonment_reason,
    quarantineReason: row.quarantine_reason,
    createdAt: row.created_at,
    submissionFinalizedAt: row.submission_finalized_at,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  });
}

function ergoOperationalAttemptJournalDigestHex(
  attempt: ErgoOperationalTransactionAttempt,
): string {
  return sha256CanonicalJson({
    domain: 'E2S_ERGO_OPERATIONAL_TRANSACTION_JOURNAL_V1',
    schema: attempt.schema,
    operationProfile: attempt.operationProfile,
    expectedTxId: attempt.expectedTxId,
    sourceBoxId: attempt.sourceBoxId,
    inputBoxIds: attempt.inputBoxIds,
    attemptedAtHeight: attempt.attemptedAtHeight,
    targetSidechainHeight: attempt.targetSidechainHeight,
    targetSidechainBlockHashHex: attempt.targetSidechainBlockHashHex,
    heartbeatKeyHex: attempt.heartbeatKeyHex,
    ...(attempt.reconciliationIdentityDigestHex === null
      ? {}
      : {
          reconciliationIdentityDigestHex:
            attempt.reconciliationIdentityDigestHex,
        }),
    bindingDigestHex: attempt.bindingDigestHex,
    signedTransactionDigestHex: attempt.signedTransactionDigestHex,
    checkResponseDigestHex: attempt.checkResponseDigestHex,
    revalidationDigestHex: attempt.revalidationDigestHex,
    authorizationDigestHex: attempt.authorizationDigestHex,
    fundsReleaseAuthorityEpochHex: attempt.fundsReleaseAuthorityEpochHex,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    status: attempt.status,
    submissionDisposition: attempt.submissionDisposition,
    submittedTxId: attempt.submittedTxId,
    responseDigestHex: attempt.responseDigestHex,
    confirmationHeight: attempt.confirmationHeight,
    confirmationHeaderId: attempt.confirmationHeaderId,
    abandonmentReason: attempt.abandonmentReason,
    quarantineReason: attempt.quarantineReason,
  });
}

function canonicalP2pkErgoTree(value: string): string {
  const normalized = normalizeHex(value, 'peg-out recipient');
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `0008cd${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error('peg-out recipient must be a compressed key or canonical P2PK ErgoTree');
}

function normalizeNonnegativeSignedInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SIGNED_INT) {
    throw new Error(`${label} must be a nonnegative safe signed Int`);
  }
  return value;
}

function normalizePositiveSignedInt(value: number, label: string): number {
  const normalized = normalizeNonnegativeSignedInt(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function normalizeUint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must fit uint32`);
  }
  return value;
}

function normalizeReason(reason: string, label: string): string {
  const normalized = reason.trim();
  if (normalized.length === 0 || normalized.length > 1000) {
    throw new Error(`${label} must contain 1-1000 characters`);
  }
  return normalized;
}

const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_SIGNED_INT = 0x7fff_ffff;

function normalizePositiveSignedLong(value: number | bigint, label: string): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > MAX_SIGNED_LONG) {
    throw new Error(`${label} must be a positive signed Long`);
  }
  return normalized;
}

function normalizePositiveLongText(value: string, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical positive integer string`);
  }
  return normalizePositiveSignedLong(BigInt(value), label).toString();
}

function normalizeVaultAddress(value: string, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > 256
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical base58 string`);
  }
  return value;
}

function normalizeBoundedHex(value: string, maxBytes: number, label: string): string {
  const normalized = normalizeHex(value, label);
  if (normalized.length > maxBytes * 2) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  return normalized;
}

interface AuthenticatedV2VaultCacheRow {
  box_id: string;
  transaction_id: string;
  output_index: number;
  creation_height: number;
  value_nanoerg: string;
  ergo_tree: string;
  r4: string;
  r5: string;
  r6: string;
  r7: string;
  deposit_id: string;
  target_evm_address: string;
  original_amount_nanoerg: string;
  provenance_hex: string;
  spent_transaction_id: string | null;
  sigma_serialized_hex: string;
  sigma_serialized_sha256: string;
  current_unspent: 0 | 1;
}

function normalizeVaultCacheBox(
  box: AuthenticatedV2SettlementVaultBox,
  index: number,
  expectedErgoTreeHex: string,
  expectedCurrent: boolean,
): AuthenticatedV2VaultCacheRow {
  if (!box || typeof box !== 'object') throw new Error(`vault box ${index} must be an object`);
  const boxId = normalizeFixedHex(box.boxIdHex, 32, `vault box ${index} ID`);
  if (!Array.isArray(box.assets) || box.assets.length !== 0) {
    throw new Error(`vault box ${boxId} must remain pure ERG`);
  }
  const registers = box.additionalRegisters;
  if (
    !registers
    || typeof registers !== 'object'
    || Array.isArray(registers)
    || JSON.stringify(Object.keys(registers).sort()) !== JSON.stringify(['R4', 'R5', 'R6', 'R7'])
  ) {
    throw new Error(`vault box ${boxId} must contain exactly R4-R7`);
  }
  const ergoTree = normalizeHex(box.ergoTreeHex, `vault box ${boxId} ErgoTree`);
  if (ergoTree !== expectedErgoTreeHex) {
    throw new Error(`vault box ${boxId} does not match the configured ErgoTree`);
  }
  if (box.currentUtxoBinaryMatched !== expectedCurrent) {
    throw new Error(`vault box ${boxId} current-UTXO binary status is inconsistent`);
  }
  const spentTransactionId = box.spentTransactionIdHex === null
    ? null
    : normalizeFixedHex(
      box.spentTransactionIdHex,
      32,
      `vault box ${boxId} spending transaction ID`,
    );
  if (expectedCurrent && spentTransactionId !== null) {
    throw new Error(`current vault box ${boxId} cannot be marked spent`);
  }
  const sigmaSerializedHex = normalizeBoundedHex(
    box.sigmaSerializedHex,
    1024 * 1024,
    `vault box ${boxId} Sigma binary`,
  );
  const sigmaSerializedSha256 = normalizeFixedHex(
    box.sigmaSerializedSha256Hex,
    32,
    `vault box ${boxId} Sigma binary digest`,
  );
  if (sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaSerializedSha256) {
    throw new Error(`vault box ${boxId} Sigma binary digest does not match its bytes`);
  }
  return {
    box_id: boxId,
    transaction_id: normalizeFixedHex(
      box.transactionIdHex,
      32,
      `vault box ${boxId} transaction ID`,
    ),
    output_index: normalizeNonnegativeSignedInt(box.outputIndex, `vault box ${boxId} output index`),
    creation_height: normalizeNonnegativeSignedInt(
      box.creationHeight,
      `vault box ${boxId} creation height`,
    ),
    value_nanoerg: normalizePositiveLongText(box.valueNanoErg, `vault box ${boxId} value`),
    ergo_tree: ergoTree,
    r4: normalizeBoundedHex(registers.R4, 32 * 1024, `vault box ${boxId} R4`),
    r5: normalizeBoundedHex(registers.R5, 32 * 1024, `vault box ${boxId} R5`),
    r6: normalizeBoundedHex(registers.R6, 32 * 1024, `vault box ${boxId} R6`),
    r7: normalizeBoundedHex(registers.R7, 32 * 1024, `vault box ${boxId} R7`),
    deposit_id: normalizeFixedHex(box.depositIdHex, 32, `vault box ${boxId} deposit ID`),
    target_evm_address: normalizeFixedHex(
      box.targetEvmAddressHex,
      20,
      `vault box ${boxId} target EVM address`,
    ),
    original_amount_nanoerg: normalizePositiveLongText(
      box.originalAmountNanoErg,
      `vault box ${boxId} original amount`,
    ),
    provenance_hex: normalizeBoundedHex(
      box.provenanceHex,
      4 * 1024,
      `vault box ${boxId} provenance`,
    ),
    spent_transaction_id: spentTransactionId,
    sigma_serialized_hex: sigmaSerializedHex,
    sigma_serialized_sha256: sigmaSerializedSha256,
    current_unspent: expectedCurrent ? 1 : 0,
  };
}

function persistedAuthenticatedV2VaultBox(
  row: Record<string, any>,
  index: number,
): AuthenticatedV2SettlementVaultBox {
  const boxId = normalizeFixedHex(row.box_id, 32, `persisted vault box ${index} ID`);
  if (row.current_unspent !== 0 && row.current_unspent !== 1) {
    throw new Error(`persisted vault box ${boxId} current flag is invalid`);
  }
  const spentTransactionIdHex = row.spent_transaction_id === null
    ? null
    : normalizeFixedHex(
      row.spent_transaction_id,
      32,
      `persisted vault box ${boxId} spending transaction ID`,
    );
  if (row.current_unspent === 1 && spentTransactionIdHex !== null) {
    throw new Error(`persisted current vault box ${boxId} cannot be marked spent`);
  }
  const sigmaSerializedHex = normalizeBoundedHex(
    row.sigma_serialized_hex,
    1024 * 1024,
    `persisted vault box ${boxId} Sigma binary`,
  );
  const sigmaSerializedSha256Hex = normalizeFixedHex(
    row.sigma_serialized_sha256,
    32,
    `persisted vault box ${boxId} Sigma digest`,
  );
  if (sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaSerializedSha256Hex) {
    throw new Error(`persisted vault box ${boxId} Sigma digest does not match its bytes`);
  }
  return {
    boxIdHex: boxId,
    transactionIdHex: normalizeFixedHex(
      row.transaction_id,
      32,
      `persisted vault box ${boxId} transaction ID`,
    ),
    outputIndex: normalizeNonnegativeSignedInt(
      row.output_index,
      `persisted vault box ${boxId} output index`,
    ),
    creationHeight: normalizeNonnegativeSignedInt(
      row.creation_height,
      `persisted vault box ${boxId} creation height`,
    ),
    valueNanoErg: normalizePositiveLongText(row.value_nanoerg, `persisted vault box ${boxId} value`),
    ergoTreeHex: normalizeHex(row.ergo_tree, `persisted vault box ${boxId} ErgoTree`),
    assets: [],
    additionalRegisters: {
      R4: normalizeBoundedHex(row.r4, 32 * 1024, `persisted vault box ${boxId} R4`),
      R5: normalizeBoundedHex(row.r5, 32 * 1024, `persisted vault box ${boxId} R5`),
      R6: normalizeBoundedHex(row.r6, 32 * 1024, `persisted vault box ${boxId} R6`),
      R7: normalizeBoundedHex(row.r7, 32 * 1024, `persisted vault box ${boxId} R7`),
    },
    depositIdHex: normalizeFixedHex(row.deposit_id, 32, `persisted vault box ${boxId} deposit ID`),
    targetEvmAddressHex: normalizeFixedHex(
      row.target_evm_address,
      20,
      `persisted vault box ${boxId} target EVM address`,
    ),
    originalAmountNanoErg: normalizePositiveLongText(
      row.original_amount_nanoerg,
      `persisted vault box ${boxId} original amount`,
    ),
    provenanceHex: normalizeBoundedHex(
      row.provenance_hex,
      4 * 1024,
      `persisted vault box ${boxId} provenance`,
    ),
    spentTransactionIdHex,
    sigmaSerializedHex,
    sigmaSerializedSha256Hex,
    currentUtxoBinaryMatched: row.current_unspent === 1,
  };
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeAuthenticatedSpvTrackerEntry(
  entry: AuthenticatedSpvTrackerHistoryEntry,
): AuthenticatedSpvTrackerHistoryEntry {
  if (
    !Number.isSafeInteger(entry.anchorHeaderHeight)
    || entry.anchorHeaderHeight < 0
    || entry.anchorHeaderHeight > MAX_SIGNED_INT
  ) {
    throw new Error('anchorHeaderHeight must be a nonnegative safe signed Int');
  }

  const normalized = {
    keyHex: normalizeFixedHex(entry.keyHex, 32, 'authenticated tracker key'),
    valueHex: normalizeFixedHex(
      entry.valueHex,
      AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
      'authenticated tracker value',
    ),
    sidechainId: normalizeFixedHex(entry.sidechainId, 32, 'sidechainId'),
    sidechainHeight: normalizePositiveSignedLong(entry.sidechainHeight, 'sidechainHeight'),
    executionBlockHash: normalizeFixedHex(entry.executionBlockHash, 32, 'executionBlockHash'),
    bridgeEventRoot: normalizeFixedHex(entry.bridgeEventRoot, 32, 'bridgeEventRoot'),
    checkpointCommitment: normalizeFixedHex(entry.checkpointCommitment, 32, 'checkpointCommitment'),
    anchorHeaderId: normalizeFixedHex(entry.anchorHeaderId, 32, 'anchorHeaderId'),
    anchorHeaderHeight: entry.anchorHeaderHeight,
  };
  const decoded = decodeAuthenticatedSpvTrackerValue(normalized.valueHex);
  if (
    deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: normalized.sidechainId,
      sidechainHeight: normalized.sidechainHeight,
      executionBlockHashHex: normalized.executionBlockHash,
    }) !== normalized.keyHex
    ||
    decoded.bridgeEventRootHex !== normalized.bridgeEventRoot
    || decoded.checkpointCommitmentHex !== normalized.checkpointCommitment
    || decoded.anchorHeaderIdHex !== normalized.anchorHeaderId
    || decoded.anchorHeaderHeight !== normalized.anchorHeaderHeight
  ) {
    throw new Error('authenticated tracker key or value does not match entry metadata');
  }
  return normalized;
}

function assertAggregateAttemptShape(
  mode: AggregateSettlementAttemptMode,
  burnTxHashes: string[],
): void {
  if (mode === 'batch') {
    if (burnTxHashes.length < 2) {
      throw new Error('batch aggregate settlement attempt requires at least 2 burn tx hashes');
    }
    return;
  }
  if (burnTxHashes.length !== 1) {
    throw new Error(`${mode} aggregate settlement attempt requires exactly 1 burn tx hash`);
  }
}

function submittedStatusForAggregateMode(
  mode: AggregateSettlementAttemptMode,
): SubmittedSettlementStatus {
  return mode === 'batch' ? 'batch_submitted' : 'aggregate_submitted';
}

function parseAggregateBurnTxHashesJson(value: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} contains malformed burn identities`);
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new Error(`${label} burn identities must be a string array`);
  }
  const normalized = parsed.map(item => normalizeBurnTxHash(item as string));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} contains duplicate burn identities`);
  }
  return normalized;
}

function normalizeAggregateSettlementObservationAuthority(input: {
  observation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus | null;
}): {
  observation: AggregateSettlementErgoObservationRecord;
  sourceCount: number;
  consensusDigestHex: string | null;
  sourceAuthorityProfile: typeof AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE | null;
} {
  assertStableAggregateSettlementErgoObservationProvenance(input.observation);
  const observation = normalizeAggregateSettlementErgoObservationRecord(input.observation.record);
  if (input.consensus === null) {
    return {
      observation,
      sourceCount: 1,
      consensusDigestHex: null,
      sourceAuthorityProfile: null,
    };
  }
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance(input.consensus);
  if (input.consensus.record.observationDigestHex !== observation.observationDigestHex) {
    throw new Error('aggregate settlement Ergo observation consensus does not match the stable observation');
  }
  return {
    observation,
    sourceCount: input.consensus.sourceCount,
    consensusDigestHex: input.consensus.consensusDigestHex,
    sourceAuthorityProfile: input.consensus.sourceAuthorityProfile,
  };
}

function canAdvanceConfirmedAggregateSettlementObservation(
  previous: AggregateSettlementErgoObservationRecord | null,
  next: AggregateSettlementErgoObservationRecord,
): boolean {
  if (previous?.status !== 'confirmed_final' || next.status !== 'confirmed_final') return false;
  if (
    previous.policyVersion !== next.policyVersion
    || previous.requiredConfirmations !== next.requiredConfirmations
    || previous.transactionIdHex !== next.transactionIdHex
    || previous.transactionDigestHex !== next.transactionDigestHex
    || previous.inclusionHeight !== next.inclusionHeight
    || previous.inclusionHeaderIdHex !== next.inclusionHeaderIdHex
    || next.observedTipHeight < previous.observedTipHeight
  ) {
    return false;
  }
  if (
    next.observedTipHeight === previous.observedTipHeight
    && next.observedTipHeaderIdHex !== previous.observedTipHeaderIdHex
  ) {
    return false;
  }
  return true;
}

function sameObservedAggregateSettlementTransaction(
  previous: AggregateSettlementErgoObservationRecord,
  next: AggregateSettlementErgoObservationRecord,
): boolean {
  const previousConfirmed =
    previous.status === 'confirmed_pre_finality'
    || previous.status === 'confirmed_final';
  const nextConfirmed =
    next.status === 'confirmed_pre_finality'
    || next.status === 'confirmed_final';
  if (!previousConfirmed || !nextConfirmed) return true;
  return previous.transactionIdHex === next.transactionIdHex
    && previous.transactionDigestHex === next.transactionDigestHex
    && previous.inclusionHeight === next.inclusionHeight
    && previous.inclusionHeaderIdHex === next.inclusionHeaderIdHex;
}

function mapAggregateSettlementAttemptRow(row: any): AggregateSettlementAttempt {
  const observationColumns = [
    row.ergo_observation_policy_version,
    row.ergo_observation_required_confirmations,
    row.ergo_observation_transaction_digest,
    row.ergo_observation_inclusion_height,
    row.ergo_observation_inclusion_header_id,
    row.ergo_observation_tip_height,
    row.ergo_observation_tip_header_id,
    row.ergo_observation_confirmations,
    row.ergo_observation_digest,
    row.ergo_observation_consensus_digest,
  ];
  let ergoObservation: AggregateSettlementErgoObservationRecord | null = null;
  if (row.ergo_observation_status === null || row.ergo_observation_status === undefined) {
    if (observationColumns.some(value => value !== null && value !== undefined)) {
      throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has partial Ergo observation state`);
    }
  } else {
    ergoObservation = normalizeAggregateSettlementErgoObservationRecord({
      policyVersion: Number(row.ergo_observation_policy_version) as 1,
      requiredConfirmations: Number(row.ergo_observation_required_confirmations),
      status: row.ergo_observation_status,
      transactionIdHex: row.expected_tx_id,
      transactionDigestHex: row.ergo_observation_transaction_digest,
      inclusionHeight: row.ergo_observation_inclusion_height === null
        ? null
        : Number(row.ergo_observation_inclusion_height),
      inclusionHeaderIdHex: row.ergo_observation_inclusion_header_id,
      observedTipHeight: Number(row.ergo_observation_tip_height),
      observedTipHeaderIdHex: row.ergo_observation_tip_header_id,
      confirmations: Number(row.ergo_observation_confirmations),
      observationDigestHex: row.ergo_observation_digest,
    });
  }
  const recoveryBindingStatus = row.recovery_binding_status as AggregateSettlementRecoveryBindingStatus;
  if (recoveryBindingStatus !== 'legacy_unbound' && recoveryBindingStatus !== 'policy_v1') {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid recovery binding status`);
  }
  const abandonmentReason = row.abandonment_reason === null
    || row.abandonment_reason === undefined
    ? null
    : row.abandonment_reason as AggregateSettlementAbandonmentReason;
  const supportedAbandonmentReasons: AggregateSettlementAbandonmentReason[] = [
    'legacy_unclassified',
    'pending_pretransport',
    'burn_invalidation',
    'submitted_absence',
    'pending_transport_absence',
  ];
  if (
    (row.status === 'abandoned' && !supportedAbandonmentReasons.includes(abandonmentReason!))
    || (row.status !== 'abandoned' && abandonmentReason !== null)
  ) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid abandonment reason`);
  }
  const lifecycleVersion = Number(row.lifecycle_version);
  if (!Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 0) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid lifecycle version`);
  }
  const transportReservationDigest = row.transport_reservation_digest === null
    || row.transport_reservation_digest === undefined
    ? null
    : normalizeFixedHex(
      row.transport_reservation_digest,
      32,
      'aggregate settlement transport reservation digest',
    );
  const fundsReleaseAuthorityEpochHex =
    row.funds_release_authority_epoch === null
      || row.funds_release_authority_epoch === undefined
      ? null
      : normalizeFixedHex(
          row.funds_release_authority_epoch,
          32,
          'aggregate settlement funds-release authority epoch',
        );
  const transportStartedAt = row.transport_started_at ?? null;
  const transportCompletedAt = row.transport_completed_at ?? null;
  if (
    (transportReservationDigest === null && (transportStartedAt !== null || transportCompletedAt !== null))
    || (transportReservationDigest !== null && transportStartedAt === null)
    || (transportCompletedAt !== null && row.status !== 'submitted' && row.status !== 'confirmed')
  ) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has inconsistent transport state`);
  }
  const ergoObservationSourceCount = Number(row.ergo_observation_source_count ?? 0);
  if (!Number.isSafeInteger(ergoObservationSourceCount) || ergoObservationSourceCount < 0) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid observation source count`);
  }
  const ergoObservationConsensusDigest = row.ergo_observation_consensus_digest === null
    || row.ergo_observation_consensus_digest === undefined
    ? null
    : normalizeFixedHex(
      row.ergo_observation_consensus_digest,
      32,
      'aggregate settlement observation consensus digest',
    );
  if (
    ergoObservation === null
    && (ergoObservationSourceCount !== 0 || ergoObservationConsensusDigest !== null)
  ) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has authority without an observation`);
  }
  if (
    ergoObservation !== null
    && (
      ergoObservationSourceCount < 1
      || (ergoObservationSourceCount === 1 && ergoObservationConsensusDigest !== null)
      || (ergoObservationSourceCount > 1 && ergoObservationConsensusDigest === null)
    )
  ) {
    throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has inconsistent observation authority`);
  }
  const recoveryQuarantineReason = row.recovery_quarantine_reason;
  let recoveryQuarantine: AggregateSettlementAttempt['recoveryQuarantine'] = null;
  if (recoveryQuarantineReason !== null && recoveryQuarantineReason !== undefined) {
    if (recoveryQuarantineReason !== 'confirmed_reorg_observed') {
      throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid recovery quarantine reason`);
    }
    const recoveryQuarantineSourceCount = Number(row.recovery_quarantine_source_count);
    if (!Number.isSafeInteger(recoveryQuarantineSourceCount) || recoveryQuarantineSourceCount < 2) {
      throw new Error(`aggregate settlement attempt ${row.expected_tx_id} has invalid recovery quarantine source count`);
    }
    recoveryQuarantine = {
      reason: recoveryQuarantineReason,
      observation: normalizeAggregateSettlementErgoObservationRecord({
        policyVersion: Number(row.recovery_quarantine_policy_version) as 1,
        requiredConfirmations: Number(row.recovery_quarantine_required_confirmations),
        status: row.recovery_quarantine_status,
        transactionIdHex: row.expected_tx_id,
        transactionDigestHex: row.recovery_quarantine_transaction_digest,
        inclusionHeight: row.recovery_quarantine_inclusion_height === null
          ? null
          : Number(row.recovery_quarantine_inclusion_height),
        inclusionHeaderIdHex: row.recovery_quarantine_inclusion_header_id,
        observedTipHeight: Number(row.recovery_quarantine_tip_height),
        observedTipHeaderIdHex: row.recovery_quarantine_tip_header_id,
        confirmations: Number(row.recovery_quarantine_confirmations),
        observationDigestHex: row.recovery_quarantine_observation_digest,
      }),
      sourceCount: recoveryQuarantineSourceCount,
      consensusDigestHex: normalizeFixedHex(
        row.recovery_quarantine_consensus_digest,
        32,
        'recovery quarantine consensus digest',
      ),
    };
  }
  return {
    id: row.id,
    mode: row.mode,
    expectedTxId: row.expected_tx_id,
    submittedTxId: row.submitted_tx_id,
    burnTxHashes: parseAggregateBurnTxHashesJson(
      row.burn_tx_hashes_json,
      `aggregate settlement attempt ${row.expected_tx_id}`,
    ),
    status: row.status,
    abandonmentReason,
    lifecycleVersion,
    transportReservationDigest,
    fundsReleaseAuthorityEpochHex,
    transportStartedAt,
    transportCompletedAt,
    recoveryBindingStatus,
    recoveryPolicyVersion: row.recovery_policy_version === null
      ? null
      : Number(row.recovery_policy_version),
    recoveryRequiredConfirmations: row.recovery_required_confirmations === null
      ? null
      : Number(row.recovery_required_confirmations),
    ergoObservation,
    ergoObservationSourceCount,
    ergoObservationConsensusDigest,
    recoveryQuarantine,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAggregateSettlementRecoveryObservationRow(
  row: any,
): AggregateSettlementRecoveryObservationHistoryEntry {
  const purpose = row.purpose;
  if (purpose !== 'abandonment_absence') {
    throw new Error(`aggregate settlement recovery observation ${row.id} has invalid purpose`);
  }
  if (row.source_authority_profile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE) {
    throw new Error(`aggregate settlement recovery observation ${row.id} has unsupported source authority`);
  }
  const lifecycleVersion = Number(row.lifecycle_version);
  if (!Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 0) {
    throw new Error(`aggregate settlement recovery observation ${row.id} has invalid lifecycle version`);
  }
  const sourceCount = Number(row.source_count);
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 2) {
    throw new Error(`aggregate settlement recovery observation ${row.id} has invalid source count`);
  }
  return {
    expectedTxId: normalizeSettlementTxId(row.expected_tx_id),
    lifecycleVersion,
    purpose,
    sourceAuthorityProfile: AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
    observation: normalizeAggregateSettlementErgoObservationRecord({
      policyVersion: Number(row.observation_policy_version) as 1,
      requiredConfirmations: Number(row.observation_required_confirmations),
      status: row.observation_status,
      transactionIdHex: row.expected_tx_id,
      transactionDigestHex: row.observation_transaction_digest,
      inclusionHeight: row.observation_inclusion_height === null
        ? null
        : Number(row.observation_inclusion_height),
      inclusionHeaderIdHex: row.observation_inclusion_header_id,
      observedTipHeight: Number(row.observation_tip_height),
      observedTipHeaderIdHex: row.observation_tip_header_id,
      confirmations: Number(row.observation_confirmations),
      observationDigestHex: row.observation_digest,
    }),
    sourceCount,
    consensusDigestHex: normalizeFixedHex(row.consensus_digest, 32, 'recovery observation consensus digest'),
    createdAt: String(row.created_at),
  };
}

function normalizeAuthenticatedSettlementCandidateInput(
  input: AuthenticatedSettlementCandidateInput,
): AuthenticatedSettlementCandidateInput {
  const burnTxHash = normalizeBurnTxHash(input.burnTxHash);
  const sidechainId = normalizeFixedHex(input.sidechainId, 32, 'sidechainId');
  const sidechainLogIndex = normalizeUint32(input.sidechainLogIndex, 'sidechainLogIndex');
  const burnId = normalizeBurnId(input.burnId);
  const expectedBurnId = deriveTrustlessBurnIdHex({
    sidechainIdHex: sidechainId,
    sidechainTxHashHex: burnTxHash,
    eventIndex: sidechainLogIndex,
  });
  if (burnId !== expectedBurnId) {
    throw new Error('authenticated settlement candidate burnId does not match its sidechain event identity');
  }
  const creationHeight = normalizeNonnegativeSignedInt(input.creationHeight, 'creationHeight');
  if (creationHeight === 0) {
    throw new Error('creationHeight must be positive');
  }
  const normalized = {
    schemaVersion: normalizeNonnegativeSignedInt(
      input.schemaVersion,
      'authenticated settlement candidate schema version',
    ),
    candidateId: normalizeFixedHex(input.candidateId, 32, 'authenticated settlement candidate ID'),
    burnId,
    burnTxHash,
    sidechainId,
    sidechainHeight: normalizePositiveSignedLong(input.sidechainHeight, 'sidechainHeight'),
    sidechainBlockHash: normalizeFixedHex(input.sidechainBlockHash, 32, 'sidechainBlockHash'),
    sidechainLogIndex,
    trackerKey: normalizeFixedHex(input.trackerKey, 32, 'authenticated tracker key'),
    trackerValue: normalizeFixedHex(
      input.trackerValue,
      AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
      'authenticated tracker value',
    ),
    trackerBoxId: normalizeFixedHex(input.trackerBoxId, 32, 'authenticated tracker box ID'),
    anchorHeaderId: normalizeFixedHex(input.anchorHeaderId, 32, 'anchor header ID'),
    anchorHeaderHeight: normalizeNonnegativeSignedInt(input.anchorHeaderHeight, 'anchorHeaderHeight'),
    dupInputBoxId: normalizeFixedHex(input.dupInputBoxId, 32, 'authenticated DUP input box ID'),
    dupInputDigest: normalizeFixedHex(input.dupInputDigest, 33, 'authenticated DUP input digest'),
    vaultBoxId: normalizeFixedHex(input.vaultBoxId, 32, 'settlement vault box ID'),
    unsignedTxDigest: normalizeFixedHex(input.unsignedTxDigest, 32, 'unsigned transaction digest'),
    creationHeight,
    observedSidechainTip: normalizePositiveSignedLong(
      input.observedSidechainTip,
      'observedSidechainTip',
    ),
    observedErgoTip: normalizeNonnegativeSignedInt(input.observedErgoTip, 'observedErgoTip'),
  };
  if (normalized.schemaVersion !== AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION) {
    throw new Error(
      `authenticated settlement candidate schema version must be ${AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION}`,
    );
  }
  const trackerValue = decodeAuthenticatedSpvTrackerValue(normalized.trackerValue);
  if (
    deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: normalized.sidechainId,
      sidechainHeight: normalized.sidechainHeight,
      executionBlockHashHex: normalized.sidechainBlockHash,
    }) !== normalized.trackerKey
    || trackerValue.anchorHeaderIdHex !== normalized.anchorHeaderId
    || trackerValue.anchorHeaderHeight !== normalized.anchorHeaderHeight
  ) {
    throw new Error('authenticated settlement candidate tracker binding is inconsistent');
  }
  return normalized;
}

function mapAuthenticatedSettlementCandidateRow(row: any): AuthenticatedSettlementCandidate {
  return {
    schemaVersion: row.candidate_schema_version,
    candidateId: row.candidate_id,
    burnId: row.burn_id,
    burnTxHash: row.burn_tx_hash,
    sidechainId: row.sidechain_id,
    sidechainHeight: BigInt(row.sidechain_height),
    sidechainBlockHash: row.sidechain_block_hash,
    sidechainLogIndex: row.sidechain_log_index,
    trackerKey: row.tracker_key,
    trackerValue: row.tracker_value,
    trackerBoxId: row.tracker_box_id,
    anchorHeaderId: row.anchor_header_id,
    anchorHeaderHeight: row.anchor_header_height,
    dupInputBoxId: row.dup_input_box_id,
    dupInputDigest: row.dup_input_digest,
    vaultBoxId: row.vault_box_id,
    unsignedTxDigest: row.unsigned_tx_digest,
    creationHeight: row.creation_height,
    observedSidechainTip: BigInt(row.observed_sidechain_tip),
    observedErgoTip: row.observed_ergo_tip,
    status: row.status,
    recoverySchema: row.recovery_schema,
    recoverySidechainConsensusDigest: row.recovery_sidechain_consensus_digest,
    recoveryAdmissionDigest: row.recovery_admission_digest,
    recoverySidechainTipHash: row.recovery_sidechain_tip_hash,
    recoverySidechainSourceCount: row.recovery_sidechain_source_count,
    checkExpectedTxId: row.check_expected_tx_id,
    checkUnsignedPackageDigest: row.check_unsigned_package_digest,
    checkSignedTransactionDigest: row.check_signed_transaction_digest,
    checkResponseDigest: row.check_response_digest,
    checkSignerContextDigest: row.check_signer_context_digest,
    checkCheckerIdentityDigest: row.check_checker_identity_digest,
    checkRevalidationDigest: row.check_revalidation_digest,
    checkNativeVerificationRequestDigest: row.check_native_verification_request_digest,
    checkTrustAnchorDigest: row.check_trust_anchor_digest,
    checkFinalityHorizonHash: row.check_finality_horizon_hash,
    checkFinalityHorizonHeight: row.check_finality_horizon_height === null
      ? null
      : BigInt(row.check_finality_horizon_height),
    checkFinalityStatementDigest: row.check_finality_statement_digest,
    checkFinalityProgramId: row.check_finality_program_id,
    checkFinalityProofSystemId: row.check_finality_proof_system_id,
    checkFinalityVerifierProfileId: row.check_finality_verifier_profile_id,
    checkFinalityProofPayloadDigest: row.check_finality_proof_payload_digest,
    checkFinalityProofDigest: row.check_finality_proof_digest,
    checkStableErgoViewDigest: row.check_stable_ergo_view_digest,
    checkStableSidechainViewDigest: row.check_stable_sidechain_view_digest,
    checkAdmissionDigest: row.check_admission_digest,
    invalidationReason: row.invalidation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuthenticatedSettlementExecutionReservationRow(
  row: any,
): AuthenticatedSettlementExecutionReservation {
  return {
    schema: row.schema,
    reservationDigestHex: row.reservation_digest,
    candidateId: row.candidate_id,
    candidateAuthorityDigestHex: row.candidate_authority_digest,
    burnId: row.burn_id,
    burnTxHash: row.burn_tx_hash,
    amountNanoErg: BigInt(row.amount_nanoerg),
    recipientErgoTreeHex: row.recipient_ergo_tree,
    duplicatePreventionBoxId: row.dup_input_box_id,
    vaultBoxId: row.vault_box_id,
    expectedTxId: row.expected_tx_id,
    unsignedTxDigestHex: row.unsigned_tx_digest,
    unsignedPackageDigestHex: row.unsigned_package_digest,
    signedTransactionDigestHex: row.signed_transaction_digest,
    checkResponseDigestHex: row.check_response_digest,
    signerContextDigestHex: row.signer_context_digest,
    checkerIdentityDigestHex: row.checker_identity_digest,
    revalidationDigestHex: row.revalidation_digest,
    stableErgoViewDigestHex: row.stable_ergo_view_digest,
    stableSidechainViewDigestHex: row.stable_sidechain_view_digest,
    finalityProofDigestHex: row.finality_proof_digest,
    checkAdmissionDigestHex: row.check_admission_digest,
    authorizationDigestHex: row.authorization_digest,
    status: row.status,
    revocationReason: row.revocation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuthenticatedSettlementSubmissionAttemptRow(
  row: any,
): AuthenticatedSettlementSubmissionAttempt {
  const observationValues = [
    row.ergo_observation_policy_version,
    row.ergo_observation_required_confirmations,
    row.ergo_observation_transaction_digest,
    row.ergo_observation_inclusion_height,
    row.ergo_observation_inclusion_header_id,
    row.ergo_observation_tip_height,
    row.ergo_observation_tip_header_id,
    row.ergo_observation_confirmations,
    row.ergo_observation_digest,
    row.ergo_observation_consensus_digest,
  ];
  let ergoObservation: AggregateSettlementErgoObservationRecord | null = null;
  if (row.ergo_observation_status === null || row.ergo_observation_status === undefined) {
    if (observationValues.some(value => value !== null && value !== undefined)) {
      throw new Error(
        `authenticated settlement attempt ${row.durable_attempt_digest} has partial Ergo observation state`,
      );
    }
    if (Number(row.ergo_observation_source_count) !== 0) {
      throw new Error(
        `authenticated settlement attempt ${row.durable_attempt_digest} has partial observation authority`,
      );
    }
  } else {
    ergoObservation = normalizeAggregateSettlementErgoObservationRecord({
      policyVersion: Number(row.ergo_observation_policy_version) as 1,
      requiredConfirmations: Number(row.ergo_observation_required_confirmations),
      status: row.ergo_observation_status,
      transactionIdHex: row.expected_tx_id,
      transactionDigestHex: row.ergo_observation_transaction_digest,
      inclusionHeight: row.ergo_observation_inclusion_height === null
        ? null
        : Number(row.ergo_observation_inclusion_height),
      inclusionHeaderIdHex: row.ergo_observation_inclusion_header_id,
      observedTipHeight: Number(row.ergo_observation_tip_height),
      observedTipHeaderIdHex: row.ergo_observation_tip_header_id,
      confirmations: Number(row.ergo_observation_confirmations),
      observationDigestHex: row.ergo_observation_digest,
    });
    if (
      !Number.isSafeInteger(Number(row.ergo_observation_source_count))
      || Number(row.ergo_observation_source_count) < 2
      || normalizeFixedHex(
        row.ergo_observation_consensus_digest,
        32,
        'authenticated settlement observation consensus digest',
      ) !== row.ergo_observation_consensus_digest
    ) {
      throw new Error(
        `authenticated settlement attempt ${row.durable_attempt_digest} has invalid observation authority`,
      );
    }
  }
  if (Number(row.submission_attempted) !== 1) {
    throw new Error(
      `authenticated settlement attempt ${row.durable_attempt_digest} is not durably marked attempted`,
    );
  }
  const status = row.status as AuthenticatedSettlementSubmissionAttemptStatus;
  const disposition = row.submission_disposition as
    AuthenticatedSettlementSubmissionAttempt['submissionDisposition'];
  const supportedStatuses: AuthenticatedSettlementSubmissionAttemptStatus[] = [
    'pending',
    'rejected',
    'submitted',
    'confirmed',
    'quarantined',
  ];
  const supportedDispositions = ['accepted', 'rejected', 'ambiguous', null];
  if (
    row.schema !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA
    || Number(row.lifecycle_version)
      !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION
    || !supportedStatuses.includes(status)
    || !supportedDispositions.includes(disposition)
    || (
      status === 'pending'
      && disposition !== null
      && disposition !== 'ambiguous'
    )
    || (status === 'rejected' && disposition !== 'rejected')
    || (
      (status === 'submitted' || status === 'confirmed')
      && disposition !== 'accepted'
    )
    || (
      disposition === 'accepted'
      && row.submitted_tx_id !== row.expected_tx_id
    )
    || (
      (disposition === 'rejected' || disposition === 'ambiguous')
      && row.submitted_tx_id !== null
    )
    || (
      disposition === null
      && row.submitted_tx_id !== null
    )
    || (
      status === 'quarantined'
      && row.quarantine_reason !== 'execution_reservation_revoked'
      && row.quarantine_reason !== 'confirmed_transaction_disappeared'
      && row.quarantine_reason !== 'confirmed_transaction_reorged'
    )
    || (status !== 'quarantined' && row.quarantine_reason !== null)
    || (
      status === 'confirmed'
      && (
        ergoObservation?.status !== 'confirmed_final'
        || row.confirmed_at === null
        || row.confirmed_at === undefined
      )
    )
  ) {
    throw new Error(
      `authenticated settlement attempt ${row.durable_attempt_digest} has invalid lifecycle state`,
    );
  }
  const expectedIdentity =
    deriveAuthenticatedSettlementTransportAttemptIdentity({
      executionReservationDigestHex: row.execution_reservation_digest,
      candidateId: row.candidate_id,
      expectedTxId: row.expected_tx_id,
      unsignedTxDigestHex: row.unsigned_tx_digest,
      unsignedPackageDigestHex: row.unsigned_package_digest,
      payoutDigestHex: row.payout_digest,
      trackerBoxId: row.tracker_box_id,
      duplicatePreventionBoxId: row.dup_input_box_id,
      signedTransactionDigestHex: row.signed_transaction_digest,
      preSubmitRevalidationDigestHex: row.pre_submit_revalidation_digest,
      broadcastAuthorizationDigestHex: row.broadcast_authorization_digest,
    });
  if (
    expectedIdentity.transportReservationDigestHex
      !== row.transport_reservation_digest
    || expectedIdentity.durableAttemptDigestHex !== row.durable_attempt_digest
  ) {
    throw new Error(
      `authenticated settlement attempt ${row.durable_attempt_digest} has invalid durable identity`,
    );
  }
  return {
    schema: row.schema,
    lifecycleVersion: Number(row.lifecycle_version),
    executionReservationDigestHex: row.execution_reservation_digest,
    transportReservationDigestHex: row.transport_reservation_digest,
    durableAttemptDigestHex: row.durable_attempt_digest,
    candidateId: row.candidate_id,
    expectedTxId: row.expected_tx_id,
    unsignedTxDigestHex: row.unsigned_tx_digest,
    unsignedPackageDigestHex: row.unsigned_package_digest,
    payoutDigestHex: row.payout_digest,
    trackerBoxId: row.tracker_box_id,
    duplicatePreventionBoxId: row.dup_input_box_id,
    signedTransactionDigestHex: row.signed_transaction_digest,
    preSubmitRevalidationDigestHex: row.pre_submit_revalidation_digest,
    broadcastAuthorizationDigestHex: row.broadcast_authorization_digest,
    status,
    submissionAttempted: true,
    submissionDisposition: disposition,
    submittedTxId: row.submitted_tx_id,
    responseDigestHex: row.response_digest,
    ergoObservation,
    ergoObservationSourceCount: Number(row.ergo_observation_source_count),
    ergoObservationConsensusDigestHex: row.ergo_observation_consensus_digest,
    quarantineReason: row.quarantine_reason,
    createdAt: row.created_at,
    submissionFinalizedAt: row.submission_finalized_at,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  };
}

function authenticatedSettlementSubmissionAttemptMatchesAdmission(
  attempt: AuthenticatedSettlementSubmissionAttempt,
  admission: AuthenticatedSettlementTransportAttemptAdmission,
): boolean {
  return attempt.schema === admission.schema
    && attempt.lifecycleVersion === admission.lifecycleVersion
    && attempt.executionReservationDigestHex === admission.executionReservationDigestHex
    && attempt.transportReservationDigestHex === admission.transportReservationDigestHex
    && attempt.durableAttemptDigestHex === admission.durableAttemptDigestHex
    && attempt.candidateId === admission.candidateId
    && attempt.expectedTxId === admission.expectedTxId
    && attempt.unsignedTxDigestHex === admission.unsignedTxDigestHex
    && attempt.unsignedPackageDigestHex === admission.unsignedPackageDigestHex
    && attempt.payoutDigestHex === admission.payoutDigestHex
    && attempt.trackerBoxId === admission.trackerBoxId
    && attempt.duplicatePreventionBoxId === admission.duplicatePreventionBoxId
    && attempt.signedTransactionDigestHex === admission.signedTransactionDigestHex
    && attempt.preSubmitRevalidationDigestHex === admission.preSubmitRevalidationDigestHex
    && attempt.broadcastAuthorizationDigestHex === admission.broadcastAuthorizationDigestHex;
}

function authenticatedSettlementExecutionReservationMatchesAdmission(
  reservation: AuthenticatedSettlementExecutionReservation,
  admission: AuthenticatedSettlementExecutionReservationAdmission,
): boolean {
  return reservation.schema === admission.schema
    && reservation.reservationDigestHex === admission.reservationDigestHex
    && reservation.candidateId === admission.candidateId
    && reservation.candidateAuthorityDigestHex === admission.candidateAuthorityDigestHex
    && reservation.burnId === admission.burnId
    && reservation.burnTxHash === admission.burnTxHash
    && reservation.amountNanoErg === admission.amountNanoErg
    && reservation.recipientErgoTreeHex === admission.recipientErgoTreeHex
    && reservation.duplicatePreventionBoxId === admission.duplicatePreventionBoxId
    && reservation.vaultBoxId === admission.vaultBoxId
    && reservation.expectedTxId === admission.expectedTxId
    && reservation.unsignedTxDigestHex === admission.unsignedTxDigestHex
    && reservation.unsignedPackageDigestHex === admission.unsignedPackageDigestHex
    && reservation.signedTransactionDigestHex === admission.signedTransactionDigestHex
    && reservation.checkResponseDigestHex === admission.checkResponseDigestHex
    && reservation.signerContextDigestHex === admission.signerContextDigestHex
    && reservation.checkerIdentityDigestHex === admission.checkerIdentityDigestHex
    && reservation.revalidationDigestHex === admission.revalidationDigestHex
    && reservation.stableErgoViewDigestHex === admission.stableErgoViewDigestHex
    && reservation.stableSidechainViewDigestHex === admission.stableSidechainViewDigestHex
    && reservation.finalityProofDigestHex === admission.finalityProofDigestHex
    && reservation.checkAdmissionDigestHex === admission.checkAdmissionDigestHex
    && reservation.authorizationDigestHex === admission.authorizationDigestHex;
}

function authenticatedSettlementExecutionReservationMatchesCandidate(
  candidate: AuthenticatedSettlementCandidate,
  admission: AuthenticatedSettlementExecutionReservationAdmission,
): boolean {
  return candidate.candidateId === admission.candidateId
    && deriveAuthenticatedSettlementCandidateAuthorityDigest(candidate)
      === admission.candidateAuthorityDigestHex
    && candidate.burnId === admission.burnId
    && candidate.burnTxHash === admission.burnTxHash
    && candidate.dupInputBoxId === admission.duplicatePreventionBoxId
    && candidate.vaultBoxId === admission.vaultBoxId
    && candidate.unsignedTxDigest === admission.unsignedTxDigestHex
    && candidate.checkExpectedTxId === admission.expectedTxId
    && candidate.checkUnsignedPackageDigest === admission.unsignedPackageDigestHex
    && candidate.checkSignedTransactionDigest === admission.signedTransactionDigestHex
    && candidate.checkResponseDigest === admission.checkResponseDigestHex
    && candidate.checkSignerContextDigest === admission.signerContextDigestHex
    && candidate.checkCheckerIdentityDigest === admission.checkerIdentityDigestHex
    && candidate.checkRevalidationDigest === admission.revalidationDigestHex
    && candidate.checkStableErgoViewDigest === admission.stableErgoViewDigestHex
    && candidate.checkStableSidechainViewDigest === admission.stableSidechainViewDigestHex
    && candidate.checkFinalityProofDigest === admission.finalityProofDigestHex
    && candidate.checkAdmissionDigest === admission.checkAdmissionDigestHex;
}

function authenticatedSettlementCandidateInputMatches(
  existing: AuthenticatedSettlementCandidate,
  expected: AuthenticatedSettlementCandidateInput,
): boolean {
  return existing.schemaVersion === expected.schemaVersion
    && existing.candidateId === expected.candidateId
    && existing.burnId === expected.burnId
    && existing.burnTxHash === expected.burnTxHash
    && existing.sidechainId === expected.sidechainId
    && existing.sidechainHeight === expected.sidechainHeight
    && existing.sidechainBlockHash === expected.sidechainBlockHash
    && existing.sidechainLogIndex === expected.sidechainLogIndex
    && existing.trackerKey === expected.trackerKey
    && existing.trackerValue === expected.trackerValue
    && existing.trackerBoxId === expected.trackerBoxId
    && existing.anchorHeaderId === expected.anchorHeaderId
    && existing.anchorHeaderHeight === expected.anchorHeaderHeight
    && existing.dupInputBoxId === expected.dupInputBoxId
    && existing.dupInputDigest === expected.dupInputDigest
    && existing.vaultBoxId === expected.vaultBoxId
    && existing.unsignedTxDigest === expected.unsignedTxDigest
    && existing.creationHeight === expected.creationHeight
    && existing.observedSidechainTip === expected.observedSidechainTip
    && existing.observedErgoTip === expected.observedErgoTip;
}

function mapPegInCommitmentReceiptRow(
  row: any,
): Readonly<PegInCommitmentReceipt> | null {
  const persisted = [
    row.commit_inclusion_header_id,
    row.commit_verification_receipt_json,
    row.commit_verification_receipt_digest,
  ];
  if (persisted.every(value => value === null || value === undefined)) return null;
  if (persisted.some(value => value === null || value === undefined)) {
    throw new Error('persisted peg-in commitment receipt columns must be all null or all present');
  }
  if (typeof row.commit_verification_receipt_json !== 'string') {
    throw new Error('persisted peg-in commitment receipt JSON must be text');
  }
  const receipt = parsePegInCommitmentReceiptJson(
    row.commit_verification_receipt_json,
  );
  const receiptDigestHex = normalizeFixedHex(
    row.commit_verification_receipt_digest,
    32,
    'persisted peg-in commitment receipt digest',
  );
  if (pegInCommitmentReceiptDigestHex(receipt) !== receiptDigestHex) {
    throw new Error('persisted peg-in commitment receipt digest does not match JSON');
  }
  if (
    normalizeFixedHex(
      row.commit_inclusion_header_id,
      32,
      'persisted peg-in commitment inclusion header ID',
    ) !== receipt.verification.headerIdHex
  ) {
    throw new Error('persisted peg-in commitment header does not match receipt');
  }
  if (
    normalizeFixedHex(
      row.ergo_lock_box_id,
      32,
      'persisted peg-in source box ID',
    ) !== receipt.sourceBoxIdHex
    || normalizeFixedHex(
      row.commit_tx_id,
      32,
      'persisted peg-in commitment transaction ID',
    ) !== receipt.commitmentTxIdHex
    || normalizeFixedHex(
      row.committed_vault_box_id,
      32,
      'persisted peg-in committed vault box ID',
    ) !== receipt.committedVaultBoxIdHex
    || row.commit_inclusion_height !== receipt.verification.height
  ) {
    throw new Error('persisted peg-in commitment receipt does not match lifecycle row');
  }
  return receipt;
}

function mapPegInEventRow(row: any): PegInEvent {
  const commitmentReceipt = mapPegInCommitmentReceiptRow(row);
  return {
    id: row.id,
    ergoLockBoxId: row.ergo_lock_box_id,
    targetEvmAddress: row.target_evm_address,
    amountNanoErg: BigInt(row.amount_nanoerg),
    ergoLockHeight: row.ergo_lock_height,
    status: row.status,
    sourceClassification: row.source_classification ?? 'unknown',
    depositorErgoTreeHex: row.depositor_ergo_tree_hex ?? null,
    commitTxId: row.commit_tx_id ?? null,
    committedVaultBoxId: row.committed_vault_box_id ?? null,
    commitInclusionHeight: row.commit_inclusion_height ?? null,
    commitInclusionHeaderId: row.commit_inclusion_header_id ?? null,
    commitmentReceipt,
    commitmentReceiptDigestHex: row.commit_verification_receipt_digest ?? null,
    commitFailure: row.commit_failure ?? null,
    sidechainMintTxHash: row.sidechain_mint_tx_hash ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function localContinuityLocationDigestHex(canonicalDbPath: string): string {
  const canonicalPath = process.platform === 'win32'
    ? canonicalDbPath.replace(/\\/g, '/')
    : canonicalDbPath;
  return createHash('sha256')
    .update(`${LOCAL_CONTINUITY_LOCATION_DIGEST_DOMAIN}\0`, 'ascii')
    .update(canonicalPath, 'utf8')
    .digest('hex');
}

function formatLocalContinuityWitness(
  identityHex: string,
  locationDigestHex: string,
): string {
  return [
    LOCAL_CONTINUITY_WITNESS_SCHEMA,
    normalizeFixedHex(identityHex, 32, 'local continuity witness identity'),
    normalizeFixedHex(
      locationDigestHex,
      32,
      'local continuity witness location digest',
    ),
    '',
  ].join('\n');
}

export function createLocalContinuityWitnessText(
  identityHex: string,
  dbPath: string,
): string {
  return formatLocalContinuityWitness(
    identityHex,
    localContinuityLocationDigestHex(
      realpathSync.native(resolve(dbPath)),
    ),
  );
}

function mapPegInMintTransportAttemptRow(
  row: any,
): PegInMintTransportAttemptRecord {
  if (
    row.schema !== PEG_IN_MINT_TRANSPORT_SCHEMA
    || row.fee_policy_id !== PEG_IN_MINT_FEE_POLICY_ID
  ) {
    throw new Error(
      'persisted peg-in mint transport profile is unsupported',
    );
  }
  return Object.freeze({
    id: Number(row.id),
    pegInId: Number(row.peg_in_id),
    operationDigestHex: String(row.operation_digest),
    envelopeDigestHex: String(row.envelope_digest),
    authorizationDigestHex: String(row.authorization_digest),
    signedEnvelopeDigestHex: String(row.signed_envelope_digest),
    attemptDigestHex: String(row.attempt_digest),
    sourceBoxIdHex: String(row.source_box_id),
    committedVaultBoxIdHex: String(row.committed_vault_box_id),
    commitmentReceiptDigestHex: String(row.commitment_receipt_digest),
    recipientAddress: String(row.recipient_address),
    amountNanoErg: BigInt(row.amount_nanoerg),
    chainId: String(row.chain_id),
    bridgeAddress: String(row.bridge_address),
    sergAddress: String(row.serg_address),
    relayerAddress: String(row.relayer_address),
    bridgeCodeHashHex: String(row.bridge_code_hash),
    sergOwnerAddress: String(row.serg_owner_address),
    sergCodeHashHex: String(row.serg_code_hash),
    feePolicyId: String(row.fee_policy_id) as
      typeof PEG_IN_MINT_FEE_POLICY_ID,
    admittedBlockNumber: Number(row.admitted_block_number),
    admittedBlockHashHex: String(row.admitted_block_hash),
    observedPendingNonce: Number(row.observed_pending_nonce),
    expiresAtBlockNumber: Number(row.expires_at_block_number),
    callDataHex: String(row.call_data_hex),
    transactionType: Number(row.transaction_type) as 0 | 2,
    nonce: Number(row.nonce),
    gasLimit: BigInt(row.gas_limit),
    gasPriceWei: row.gas_price_wei === null
      ? null
      : BigInt(row.gas_price_wei),
    maxFeePerGasWei: row.max_fee_per_gas_wei === null
      ? null
      : BigInt(row.max_fee_per_gas_wei),
    maxPriorityFeePerGasWei:
      row.max_priority_fee_per_gas_wei === null
        ? null
        : BigInt(row.max_priority_fee_per_gas_wei),
    accessListDigestHex: String(row.access_list_digest),
    unsignedTransactionDigestHex: String(row.unsigned_transaction_digest),
    signedTransactionDigestHex: String(row.signed_transaction_digest),
    expectedTransactionHashHex: String(row.expected_transaction_hash),
    status: row.status as PegInMintTransportAttemptStatus,
    rejectionReason: row.rejection_reason ?? null,
    transactionHashHex: row.transaction_hash ?? null,
    responseDigestHex: row.response_digest ?? null,
    confirmationBlockNumber: row.confirmation_block_number === null
      ? null
      : Number(row.confirmation_block_number),
    confirmationBlockHashHex: row.confirmation_block_hash ?? null,
    confirmationCount: row.confirmation_count === null
      ? null
      : Number(row.confirmation_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

const PEG_IN_STATUSES = new Set<PegInStatus>([
  'detected',
  'confirmed',
  'consume_submitted',
  'consume_confirmed',
  'minting',
  'minted',
  'commit_invalid',
  'incident',
  'failed',
]);

const PEG_IN_SOURCE_CLASSIFICATIONS = new Set<PegInSourceClassification>([
  'unknown',
  'active_committed_vault',
  'legacy_unminted_refundable',
  'legacy_minted_requires_migration',
  'legacy_already_consumed',
]);

const PEG_IN_SAFETY_INCIDENT_KINDS = new Set<PegInSafetyIncidentKind>([
  'commitment_disappeared',
  'refundable_source_restored',
  'canonical_header_replaced',
  'commitment_receipt_conflict',
  'committed_vault_unavailable',
  'mint_outcome_commitment_lost',
  'legacy_refundable_after_mint',
  'submission_identity_mismatch',
  'missing_commitment_receipt',
  'solvency_deficit',
  'unspecified',
]);

const PEG_IN_RECONCILIATION_REASONS = new Set<PegInReconciliationReason>([
  'native_grandpa_finality_unavailable',
  'joined_reconstruction_inconsistent',
  'joined_entry_missing',
  'joined_entry_invalid',
  'source_classification_mismatch',
  'committed_vault_not_observed',
  'unexpected_frontier_mint',
  'local_mint_not_observed',
  'local_mint_identity_missing',
  'local_mint_identity_mismatch',
  'local_lifecycle_terminal',
  'event_binding_mismatch',
]);

const PEG_IN_INVALID_JOINED_STATES = new Set<
  PegInSidechainReconstruction['entries'][number]['state']
>([
  'invalid_event_semantics',
  'invalid_event_without_processed_state',
  'invalid_processed_state_without_event',
  'invalid_mint_without_committed_vault',
  'legacy_invalid_event_without_processed_state',
  'legacy_invalid_processed_state_without_event',
  'legacy_mint_observed_unverifiable',
]);

export function pegInLifecycleDigestHex(event: PegInEvent): string {
  const status = normalizePegInStatus(event.status, 'peg-in lifecycle status');
  const sourceClassification = normalizePegInSourceClassification(
    event.sourceClassification,
    'peg-in lifecycle source classification',
  );
  const receipt = event.commitmentReceipt === null
    ? null
    : createPegInCommitmentReceipt(event.commitmentReceipt);
  const receiptDigestHex = event.commitmentReceiptDigestHex === null
    ? null
    : normalizeFixedHex(
      event.commitmentReceiptDigestHex,
      32,
      'peg-in lifecycle commitment receipt digest',
    );
  if (
    (receipt === null) !== (receiptDigestHex === null)
    || (receipt !== null
      && pegInCommitmentReceiptDigestHex(receipt) !== receiptDigestHex)
  ) {
    throw new Error('peg-in lifecycle commitment receipt and digest must match');
  }
  if (
    receipt !== null
    && (
      event.commitInclusionHeaderId === null
      || event.commitInclusionHeight !== receipt.verification.height
      || normalizeFixedHex(
        event.commitInclusionHeaderId,
        32,
        'peg-in lifecycle commit inclusion header ID',
      ) !== receipt.verification.headerIdHex
      || event.commitTxId === null
      || normalizeFixedHex(
        event.commitTxId,
        32,
        'peg-in lifecycle commitment transaction ID',
      ) !== receipt.commitmentTxIdHex
      || event.committedVaultBoxId === null
      || normalizeFixedHex(
        event.committedVaultBoxId,
        32,
        'peg-in lifecycle committed vault box ID',
      ) !== receipt.committedVaultBoxIdHex
      || normalizeFixedHex(
        event.ergoLockBoxId,
        32,
        'peg-in lifecycle source box ID',
      ) !== receipt.sourceBoxIdHex
    )
  ) {
    throw new Error('peg-in lifecycle commitment receipt does not match lifecycle fields');
  }
  const semantic = {
    id: normalizePositiveSignedInt(event.id, 'peg-in lifecycle row ID'),
    ergoLockBoxId: normalizeFixedHex(event.ergoLockBoxId, 32, 'peg-in lifecycle box ID'),
    targetEvmAddress: normalizeFixedHex(
      event.targetEvmAddress,
      20,
      'peg-in lifecycle EVM recipient',
    ),
    amountNanoErg: normalizePositiveLongText(
      event.amountNanoErg.toString(),
      'peg-in lifecycle amount',
    ),
    ergoLockHeight: normalizeNonnegativeSignedInt(
      event.ergoLockHeight,
      'peg-in lifecycle lock height',
    ),
    status,
    sourceClassification,
    depositorErgoTreeHex: event.depositorErgoTreeHex === null
      ? null
      : normalizeHex(event.depositorErgoTreeHex, 'peg-in lifecycle depositor ErgoTree'),
    commitTxId: event.commitTxId === null
      ? null
      : normalizeFixedHex(event.commitTxId, 32, 'peg-in lifecycle commit transaction ID'),
    committedVaultBoxId: event.committedVaultBoxId === null
      ? null
      : normalizeFixedHex(event.committedVaultBoxId, 32, 'peg-in lifecycle vault box ID'),
    commitInclusionHeight: event.commitInclusionHeight === null
      ? null
      : normalizeNonnegativeSignedInt(
        event.commitInclusionHeight,
        'peg-in lifecycle commit inclusion height',
      ),
    commitInclusionHeaderId: event.commitInclusionHeaderId === null
      ? null
      : normalizeFixedHex(
        event.commitInclusionHeaderId,
        32,
        'peg-in lifecycle commit inclusion header ID',
      ),
    commitmentReceipt: receipt,
    commitmentReceiptDigestHex: receiptDigestHex,
    commitFailure: event.commitFailure === null
      ? null
      : normalizeBoundedText(event.commitFailure, 2000, 'peg-in lifecycle failure'),
    sidechainMintTxHash: event.sidechainMintTxHash === null
      ? null
      : normalizeFixedHex(
        event.sidechainMintTxHash,
        32,
        'peg-in lifecycle mint transaction hash',
      ),
  };
  return sha256CanonicalJson(
    semantic,
    'ergo-sidechain-bridge:peg-in-lifecycle:v2',
  );
}

export function pegInReconciliationObservationDigestHex(
  semantic: PegInReconciliationObservationSemantic,
): string {
  return sha256CanonicalJson(
    semantic,
    PEG_IN_RECONCILIATION_OBSERVATION_DIGEST_DOMAIN,
  );
}

function derivePegInReconciliationDecision(
  pegIn: PegInEvent,
  reconstruction: PegInSidechainReconstruction,
): {
  entry: PegInSidechainReconstruction['entries'][number] | null;
  disposition: PegInReconciliationDisposition;
  reason: PegInReconciliationReason;
} {
  const entry = reconstruction.entries.find(
    candidate => candidate.ergoBoxIdHex === normalizeFixedHex(
      pegIn.ergoLockBoxId,
      32,
      'peg-in reconciliation box ID',
    ),
  ) ?? null;
  const quarantine = (reason: PegInReconciliationReason) => ({
    entry,
    disposition: 'quarantined' as const,
    reason,
  });

  if (entry !== null && PEG_IN_INVALID_JOINED_STATES.has(entry.state)) {
    return quarantine('joined_entry_invalid');
  }
  if (
    reconstruction.decision.classification !== 'reconstruction_consistent'
    || !reconstruction.decision.exactCrossChainHistoryAgreement
    || reconstruction.issues.length !== 0
  ) {
    return quarantine('joined_reconstruction_inconsistent');
  }
  if (entry === null) return quarantine('joined_entry_missing');

  const sourceClassification = normalizePegInSourceClassification(
    pegIn.sourceClassification,
    'peg-in reconciliation source classification',
  );
  if (['commit_invalid', 'incident', 'failed'].includes(pegIn.status)) {
    return quarantine('local_lifecycle_terminal');
  }
  if (
    sourceClassification === 'unknown'
    || (sourceClassification === 'active_committed_vault') !== (entry.routeKind === 'active')
  ) {
    return quarantine('source_classification_mismatch');
  }
  if (
    sourceClassification === 'active_committed_vault'
    && ['detected', 'confirmed'].includes(pegIn.status)
    && entry.routeClassification !== 'refundable'
  ) {
    return quarantine('source_classification_mismatch');
  }
  if (
    sourceClassification === 'active_committed_vault'
    && entry.routeClassification !== 'refundable'
    && entry.routeClassification !== 'commit_pending'
    && entry.routeClassification !== 'committed'
  ) {
    return quarantine('source_classification_mismatch');
  }
  if (
    sourceClassification === 'legacy_unminted_refundable'
    && entry.state !== 'legacy_unminted'
  ) {
    return quarantine('source_classification_mismatch');
  }
  if (
    sourceClassification === 'legacy_minted_requires_migration'
    && entry.state !== 'legacy_mint_observed_unverifiable'
  ) {
    return quarantine('source_classification_mismatch');
  }
  if (sourceClassification === 'legacy_already_consumed') {
    return quarantine('source_classification_mismatch');
  }
  if (
    ['consume_confirmed', 'minting', 'minted'].includes(pegIn.status)
    && (
      sourceClassification !== 'active_committed_vault'
      || entry.routeClassification !== 'committed'
    )
  ) {
    return quarantine('committed_vault_not_observed');
  }
  if (entry.event !== null) {
    if (
      normalizeFixedHex(entry.event.recipientAddress, 20, 'joined peg-in recipient')
        !== normalizeFixedHex(pegIn.targetEvmAddress, 20, 'local peg-in recipient')
      || entry.event.amountNanoErg !== pegIn.amountNanoErg.toString()
    ) {
      return quarantine('event_binding_mismatch');
    }
  }
  if (pegIn.status === 'minted') {
    if (entry.event === null || !entry.processedAtObservedTip) {
      return quarantine('local_mint_not_observed');
    }
    if (pegIn.sidechainMintTxHash === null) {
      return quarantine('local_mint_identity_missing');
    }
    if (
      normalizeFixedHex(
        pegIn.sidechainMintTxHash,
        32,
        'local peg-in mint transaction hash',
      ) !== entry.event.transactionHashHex
    ) {
      return quarantine('local_mint_identity_mismatch');
    }
  } else if (
    pegIn.status !== 'minting'
    && entry.event !== null
    && entry.processedAtObservedTip
  ) {
    return quarantine('unexpected_frontier_mint');
  }

  return {
    entry,
    disposition: 'deferred',
    reason: 'native_grandpa_finality_unavailable',
  };
}

function mapPegInReconciliationObservationRow(row: any): PegInReconciliationObservation {
  if (row.schema !== PEG_IN_RECONCILIATION_OBSERVATION_SCHEMA) {
    throw new Error('persisted peg-in reconciliation observation schema is unsupported');
  }
  const disposition = row.disposition;
  if (disposition !== 'deferred' && disposition !== 'quarantined') {
    throw new Error('persisted peg-in reconciliation disposition is unsupported');
  }
  const reason = row.reason as PegInReconciliationReason;
  if (!PEG_IN_RECONCILIATION_REASONS.has(reason)) {
    throw new Error('persisted peg-in reconciliation reason is unsupported');
  }
  if (
    (disposition === 'deferred')
    !== (reason === 'native_grandpa_finality_unavailable')
  ) {
    throw new Error('persisted peg-in reconciliation disposition and reason disagree');
  }
  const lifecycleStatus = normalizePegInStatus(
    row.lifecycle_status,
    'persisted peg-in reconciliation lifecycle status',
  );
  const joinedEntryState = row.joined_entry_state === null
    ? null
    : normalizeJoinedPegInState(row.joined_entry_state);
  const semantic: PegInReconciliationObservationSemantic = {
    schema: PEG_IN_RECONCILIATION_OBSERVATION_SCHEMA,
    pegInId: normalizePositiveSignedInt(row.peg_in_id, 'peg-in reconciliation row ID'),
    ergoLockBoxId: normalizeFixedHex(
      row.ergo_lock_box_id,
      32,
      'persisted peg-in reconciliation box ID',
    ),
    lifecycleStatus,
    lifecycleDigestHex: normalizeFixedHex(
      row.lifecycle_digest,
      32,
      'persisted peg-in reconciliation lifecycle digest',
    ),
    joinedReconstructionDigestHex: normalizeFixedHex(
      row.joined_reconstruction_digest,
      32,
      'persisted joined peg-in reconstruction digest',
    ),
    ergoRouteReconstructionDigestHex: normalizeFixedHex(
      row.ergo_route_reconstruction_digest,
      32,
      'persisted peg-in route reconstruction digest',
    ),
    frontierViewDigestHex: normalizeFixedHex(
      row.frontier_view_digest,
      32,
      'persisted Frontier peg-in view digest',
    ),
    observedTip: Object.freeze({
      height: normalizeNonnegativeSignedInt(
        row.observed_tip_height,
        'persisted peg-in reconciliation tip height',
      ),
      idHex: normalizeFixedHex(
        row.observed_tip_id,
        32,
        'persisted peg-in reconciliation tip ID',
      ),
    }),
    joinedEntryState,
    joinedEventTransactionHashHex: row.joined_event_transaction_hash === null
      ? null
      : normalizeFixedHex(
        row.joined_event_transaction_hash,
        32,
        'persisted joined peg-in event transaction hash',
      ),
    disposition,
    reason,
    observedAt: normalizeCanonicalIsoTimestamp(
      row.observed_at,
      'persisted peg-in reconciliation observation time',
    ),
  };
  const observationDigestHex = normalizeFixedHex(
    row.observation_digest,
    32,
    'persisted peg-in reconciliation observation digest',
  );
  if (pegInReconciliationObservationDigestHex(semantic) !== observationDigestHex) {
    throw new Error('persisted peg-in reconciliation digest does not match its semantics');
  }
  return Object.freeze({
    id: normalizePositiveSignedInt(row.id, 'peg-in reconciliation journal ID'),
    ...semantic,
    observationDigestHex,
    createdAt: normalizeBoundedText(
      row.created_at,
      64,
      'persisted peg-in reconciliation creation time',
    ),
  });
}

function normalizePegInStatus(value: unknown, label: string): PegInStatus {
  if (typeof value !== 'string' || !PEG_IN_STATUSES.has(value as PegInStatus)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as PegInStatus;
}

function normalizePegInSourceClassification(
  value: unknown,
  label: string,
): PegInSourceClassification {
  if (
    typeof value !== 'string'
    || !PEG_IN_SOURCE_CLASSIFICATIONS.has(value as PegInSourceClassification)
  ) {
    throw new Error(`${label} is unsupported`);
  }
  return value as PegInSourceClassification;
}

function normalizePegInSafetyIncidentKind(
  value: unknown,
  label: string,
): PegInSafetyIncidentKind {
  if (
    typeof value !== 'string'
    || !PEG_IN_SAFETY_INCIDENT_KINDS.has(value as PegInSafetyIncidentKind)
  ) {
    throw new Error(`${label} is unsupported`);
  }
  return value as PegInSafetyIncidentKind;
}

function normalizeJoinedPegInState(
  value: unknown,
): PegInSidechainReconstruction['entries'][number]['state'] {
  if (typeof value !== 'string' || ![
    'committed_unminted',
    'mint_pending',
    'mint_confirmed_by_depth',
    'refundable_unminted',
    'commit_pending_unminted',
    'refunded_unminted',
    'unresolved_unminted',
    'invalid_event_semantics',
    'invalid_event_without_processed_state',
    'invalid_processed_state_without_event',
    'invalid_mint_without_committed_vault',
    'legacy_unminted',
    'legacy_invalid_event_without_processed_state',
    'legacy_invalid_processed_state_without_event',
    'legacy_mint_observed_unverifiable',
  ].includes(value)) {
    throw new Error('persisted joined peg-in entry state is unsupported');
  }
  return value as PegInSidechainReconstruction['entries'][number]['state'];
}

function normalizePooledReserveMintReservationRecoverySemanticV4(
  input: Readonly<PooledReserveMintReservationRecoveryObservationV4Semantic>,
): PooledReserveMintReservationRecoveryObservationV4Semantic {
  if (
    input?.schema
    !== POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery observation schema is unsupported',
    );
  }
  const lifecycleStatus = input.reservation?.lifecycleStatus;
  if (
    lifecycleStatus !== 'absent'
    && lifecycleStatus !== 'pending'
    && lifecycleStatus !== 'consumed'
    && lifecycleStatus !== 'invalidated'
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery lifecycle status is unsupported',
    );
  }
  const lifecycleRecordScaleHex =
    input.reservation.lifecycleRecordScaleHex === null
      ? null
      : `0x${normalizeBoundedHex(
          input.reservation.lifecycleRecordScaleHex,
          4096,
          'pooled-reserve mint-reservation lifecycle record',
        )}`;
  const expiresAtHeight = input.reservation.expiresAtHeight === null
    ? null
    : normalizeCanonicalUint64Text(
        input.reservation.expiresAtHeight,
        'pooled-reserve mint-reservation expiry height',
      );
  const semantic: PooledReserveMintReservationRecoveryObservationV4Semantic = {
    schema:
      POOLED_RESERVE_MINT_RESERVATION_RECOVERY_OBSERVATION_V4_SCHEMA,
    reservation: {
      statementIdHex: normalizePrefixedFixedHex(
        input.reservation.statementIdHex,
        32,
        'pooled-reserve mint-reservation statement ID',
      ),
      reservationKeyHex: normalizePrefixedFixedHex(
        input.reservation.reservationKeyHex,
        32,
        'pooled-reserve mint-reservation key',
      ),
      admissionCandidateDigestHex: normalizePrefixedFixedHex(
        input.reservation.admissionCandidateDigestHex,
        32,
        'pooled-reserve mint-reservation admission candidate digest',
      ),
      profileIdHex: normalizePrefixedFixedHex(
        input.reservation.profileIdHex,
        32,
        'pooled-reserve mint-reservation profile ID',
      ),
      lifecycleStatus,
      lifecycleRecordScaleHex,
      expiresAtHeight,
    },
    source: {
      requestDigestHex: normalizePrefixedFixedHex(
        input.source.requestDigestHex,
        32,
        'pooled-reserve mint-reservation request digest',
      ),
      trustAnchorDigestHex: normalizePrefixedFixedHex(
        input.source.trustAnchorDigestHex,
        32,
        'pooled-reserve mint-reservation trust anchor digest',
      ),
      targetNativeBlockHashHex: normalizePrefixedFixedHex(
        input.source.targetNativeBlockHashHex,
        32,
        'pooled-reserve mint-reservation target block hash',
      ),
      targetNativeHeight: normalizeCanonicalUint64Text(
        input.source.targetNativeHeight,
        'pooled-reserve mint-reservation target height',
      ),
      targetStateRootHex: normalizePrefixedFixedHex(
        input.source.targetStateRootHex,
        32,
        'pooled-reserve mint-reservation target state root',
      ),
      finalityHorizonHashHex: normalizePrefixedFixedHex(
        input.source.finalityHorizonHashHex,
        32,
        'pooled-reserve mint-reservation finality horizon hash',
      ),
      finalityHorizonHeight: normalizeCanonicalUint64Text(
        input.source.finalityHorizonHeight,
        'pooled-reserve mint-reservation finality horizon height',
      ),
      bridgeRuntimeCodeSha256Hex: normalizePrefixedFixedHex(
        input.source.bridgeRuntimeCodeSha256Hex,
        32,
        'pooled-reserve runtime code SHA-256',
      ),
      bridgeRuntimeCodeBytes: normalizeCanonicalUint64Text(
        input.source.bridgeRuntimeCodeBytes,
        'pooled-reserve runtime code bytes',
      ),
    },
    classification: input.classification,
  };
  if (
    BigInt(semantic.source.finalityHorizonHeight)
      < BigInt(semantic.source.targetNativeHeight)
  ) {
    throw new Error(
      'pooled-reserve mint-reservation finality horizon precedes the target',
    );
  }
  if (semantic.source.bridgeRuntimeCodeBytes === '0') {
    throw new Error('pooled-reserve runtime code bytes must be positive');
  }
  const expectedClassification =
    classifyPooledReserveMintReservationRecoveryStateV4({
      status: semantic.reservation.lifecycleStatus,
      targetNativeHeight: semantic.source.targetNativeHeight,
      lifecycleRecordScaleHex:
        semantic.reservation.lifecycleRecordScaleHex,
      expiresAtHeight: semantic.reservation.expiresAtHeight,
    });
  if (semantic.classification !== expectedClassification) {
    throw new Error(
      'pooled-reserve mint-reservation recovery classification is invalid',
    );
  }
  return semantic;
}

function mapPooledReserveMintReservationRecoveryObservationV4Row(
  row: any,
): PooledReserveMintReservationRecoveryObservationV4 {
  const semantic =
    normalizePooledReserveMintReservationRecoverySemanticV4({
      schema: row.schema,
      reservation: {
        statementIdHex: row.statement_id,
        reservationKeyHex: row.reservation_key,
        admissionCandidateDigestHex: row.admission_candidate_digest,
        profileIdHex: row.profile_id,
        lifecycleStatus: row.lifecycle_status,
        lifecycleRecordScaleHex: row.lifecycle_record_scale_hex,
        expiresAtHeight: row.expires_at_height,
      },
      source: {
        requestDigestHex: row.request_digest,
        trustAnchorDigestHex: row.trust_anchor_digest,
        targetNativeBlockHashHex: row.target_native_block_hash,
        targetNativeHeight: row.target_native_height,
        targetStateRootHex: row.target_state_root,
        finalityHorizonHashHex: row.finality_horizon_hash,
        finalityHorizonHeight: row.finality_horizon_height,
        bridgeRuntimeCodeSha256Hex: row.bridge_runtime_code_sha256,
        bridgeRuntimeCodeBytes: row.bridge_runtime_code_bytes,
      },
      classification: row.classification,
    });
  const observationDigestHex =
    pooledReserveMintReservationRecoveryObservationDigestHexV4(semantic);
  if (
    normalizeFixedHex(
      row.observation_digest,
      32,
      'persisted pooled-reserve mint-reservation observation digest',
    ) !== observationDigestHex
  ) {
    throw new Error(
      'persisted pooled-reserve mint-reservation observation digest is invalid',
    );
  }
  return {
    ...semantic,
    id: normalizePositiveSignedInt(
      row.id,
      'pooled-reserve mint-reservation observation row ID',
    ),
    observationDigestHex,
    observedAt: normalizeCanonicalIsoTimestamp(
      row.observed_at,
      'pooled-reserve mint-reservation observation time',
    ),
    createdAt: normalizeCanonicalIsoTimestamp(
      row.created_at,
      'pooled-reserve mint-reservation journal creation time',
    ),
  };
}

export class StateTracker {
  private db: Database.Database;
  private readonly isReadOnly: boolean;
  private readonly fundsExecutionLockPath: string | null;
  private readonly fundsReleaseHoldPath: string | null;
  private readonly fundsReleaseContinuityPath: string | null;
  private readonly fundsReleaseContinuityLocationDigestHex: string | null;
  private fundsExecutionAuthorityRetainedForRecovery = false;
  private fundsExecutionAuthority: Readonly<{
    lease: FundsExecutionAuthorityLease;
    ownerDigestHex: string;
    lockFd: number | null;
  }> | null = null;

  constructor(dbPath: string = './bridge-state.sqlite', options: StateTrackerOptions = {}) {
    this.isReadOnly = options.readOnly === true;
    this.db = this.isReadOnly
      ? new Database(dbPath, { readonly: true, fileMustExist: true })
      : new Database(dbPath);
    let canonicalDbPath: string | null;
    try {
      canonicalDbPath = dbPath === ':memory:'
        ? null
        : realpathSync.native(resolve(dbPath));
    } catch (error) {
      this.db.close();
      throw error;
    }
    this.fundsExecutionLockPath =
      canonicalDbPath === null
        ? null
        : `${canonicalDbPath}.funds-execution.lock`;
    this.fundsReleaseHoldPath =
      canonicalDbPath === null
        ? null
        : `${canonicalDbPath}.funds-release-hold`;
    this.fundsReleaseContinuityPath =
      canonicalDbPath === null
        ? null
        : `${canonicalDbPath}.funds-release-continuity`;
    this.fundsReleaseContinuityLocationDigestHex =
      canonicalDbPath === null
        ? null
        : localContinuityLocationDigestHex(canonicalDbPath);
    if (
      !this.isReadOnly
      && this.fundsExecutionLockPath !== null
      && existsSync(this.fundsExecutionLockPath)
    ) {
      this.db.close();
      throw new Error(
        'a retained funds execution lock requires reviewed recovery',
      );
    }
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('recursive_triggers = ON');
    if (!this.isReadOnly) {
      this.db.pragma('journal_mode = WAL');
      this.initializeLocalContinuityState();
      this.migrate();
    }
  }

  private initializeLocalContinuityState(): void {
    const initialize = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS local_continuity_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema TEXT NOT NULL,
          status TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (schema = '${LOCAL_CONTINUITY_STATE_SCHEMA}'),
          CHECK (status IN ('established', 'recovery_required'))
        );

        CREATE TABLE IF NOT EXISTS funds_execution_authority (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema TEXT NOT NULL,
          epoch_hex TEXT NOT NULL,
          owner_digest_hex TEXT NOT NULL,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (schema = '${FUNDS_EXECUTION_AUTHORITY_SCHEMA}'),
          CHECK (length(epoch_hex) = 64),
          CHECK (length(owner_digest_hex) = 64)
        );

        CREATE TABLE IF NOT EXISTS local_continuity_identity (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema TEXT NOT NULL,
          identity_hex TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (schema = '${LOCAL_CONTINUITY_IDENTITY_SCHEMA}'),
          CHECK (length(identity_hex) = 64)
        );

        CREATE TRIGGER IF NOT EXISTS local_continuity_state_no_update
        BEFORE UPDATE ON local_continuity_state
        BEGIN
          SELECT RAISE(ABORT, 'local continuity state is immutable without reviewed recovery');
        END;

        CREATE TRIGGER IF NOT EXISTS local_continuity_state_no_delete
        BEFORE DELETE ON local_continuity_state
        BEGIN
          SELECT RAISE(ABORT, 'local continuity state cannot be cleared without reviewed recovery');
        END;

        CREATE TRIGGER IF NOT EXISTS local_continuity_identity_no_update
        BEFORE UPDATE ON local_continuity_identity
        BEGIN
          SELECT RAISE(ABORT, 'local continuity identity is immutable without reviewed recovery');
        END;

        CREATE TRIGGER IF NOT EXISTS local_continuity_identity_no_delete
        BEFORE DELETE ON local_continuity_identity
        BEGIN
          SELECT RAISE(ABORT, 'local continuity identity cannot be cleared without reviewed recovery');
        END;
      `);
      this.db.prepare(`
        INSERT OR IGNORE INTO local_continuity_state (
          id,
          schema,
          status,
          reason
        ) VALUES (1, ?, ?, ?)
      `).run(
        LOCAL_CONTINUITY_STATE_SCHEMA,
        'recovery_required',
        'database continuity has not been established by reviewed recovery authority',
      );
      this.db.prepare(`
        INSERT OR IGNORE INTO local_continuity_identity (
          id,
          schema,
          identity_hex
        ) VALUES (1, ?, ?)
      `).run(
        LOCAL_CONTINUITY_IDENTITY_SCHEMA,
        randomBytes(32).toString('hex'),
      );
    });
    initialize();
    const continuity = this.db.prepare(`
      SELECT status
      FROM local_continuity_state
      WHERE id = 1
    `).get() as { status: string } | undefined;
    if (continuity?.status === 'recovery_required') {
      this.ensureExternalFundsReleaseHold(
        'database continuity requires reviewed recovery',
      );
    }
  }

  private readLocalContinuityIdentityHex(): string {
    const row = this.db.prepare(`
      SELECT schema, identity_hex
      FROM local_continuity_identity
      WHERE id = 1
    `).get() as {
      schema: string;
      identity_hex: string;
    } | undefined;
    if (row === undefined) {
      throw new Error('persisted local continuity identity is missing');
    }
    if (row.schema !== LOCAL_CONTINUITY_IDENTITY_SCHEMA) {
      throw new Error('persisted local continuity identity schema is unsupported');
    }
    return normalizeFixedHex(
      row.identity_hex,
      32,
      'persisted local continuity identity',
    );
  }

  private isExternalContinuityWitnessCurrent(
    identityHex: string,
  ): boolean {
    if (this.fundsReleaseContinuityPath === null) return true;
    if (this.fundsReleaseContinuityLocationDigestHex === null) return false;
    try {
      return readFileSync(
        this.fundsReleaseContinuityPath,
        'utf8',
      ) === formatLocalContinuityWitness(
        identityHex,
        this.fundsReleaseContinuityLocationDigestHex,
      );
    } catch {
      return false;
    }
  }

  private hasExternalFundsReleaseHoldEntry(): boolean {
    if (this.fundsReleaseHoldPath === null) return false;
    try {
      lstatSync(this.fundsReleaseHoldPath);
      return true;
    } catch (error: any) {
      return error?.code !== 'ENOENT';
    }
  }

  private ensureExternalFundsReleaseHold(reason: string): void {
    if (this.fundsReleaseHoldPath === null) return;
    let holdFd: number | null = null;
    try {
      try {
        holdFd = openSync(
          this.fundsReleaseHoldPath,
          'wx',
          0o600,
        );
      } catch (error: any) {
        if (error?.code === 'EEXIST') return;
        throw error;
      }
      writeFileSync(
        holdFd,
        `${canonicalJson({
          schema: 'e2s.external-funds-release-hold.v1',
          reason: normalizeBoundedText(
            reason,
            2000,
            'external funds-release hold reason',
          ),
          createdAt: new Date().toISOString(),
        })}\n`,
        'utf8',
      );
      fsyncSync(holdFd);
    } catch (error) {
      this.fundsExecutionAuthorityRetainedForRecovery = true;
      if (holdFd !== null) {
        closeSync(holdFd);
        holdFd = null;
      }
      // Retain any partial directory entry as a fail-closed recovery marker.
      let continuityWitnessInvalidated =
        this.fundsReleaseContinuityPath === null;
      let continuityWitnessError: unknown = null;
      if (this.fundsReleaseContinuityPath !== null) {
        try {
          unlinkSync(this.fundsReleaseContinuityPath);
          continuityWitnessInvalidated = true;
        } catch (witnessError: any) {
          continuityWitnessInvalidated =
            witnessError?.code === 'ENOENT';
          if (!continuityWitnessInvalidated) {
            continuityWitnessError = witnessError;
          }
        }
      }
      let recoveryAuthorityPersisted = false;
      let recoveryAuthorityError: unknown = null;
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO funds_execution_authority (
            id,
            schema,
            epoch_hex,
            owner_digest_hex
          ) VALUES (1, ?, ?, ?)
        `).run(
          FUNDS_EXECUTION_AUTHORITY_SCHEMA,
          randomBytes(32).toString('hex'),
          randomBytes(32).toString('hex'),
        );
        recoveryAuthorityPersisted = this.db.prepare(`
          SELECT 1
          FROM funds_execution_authority
          WHERE id = 1
        `).get() !== undefined;
      } catch (authorityError) {
        recoveryAuthorityPersisted = false;
        recoveryAuthorityError = authorityError;
      }
      if (!continuityWitnessInvalidated && !recoveryAuthorityPersisted) {
        throw new AggregateError(
          [
            error,
            ...(continuityWitnessError === null
              ? []
              : [continuityWitnessError]),
            ...(recoveryAuthorityError === null
              ? []
              : [recoveryAuthorityError]),
          ],
          'funds-release hold failed and no durable recovery boundary could be persisted',
        );
      }
      throw error;
    } finally {
      if (holdFd !== null) closeSync(holdFd);
    }
  }

  acquireFundsExecutionAuthority(): FundsExecutionAuthorityLease {
    if (this.isReadOnly) {
      throw new Error(
        'Cannot acquire funds execution authority: StateTracker is open in read-only mode',
      );
    }
    if (this.fundsExecutionAuthority !== null) {
      throw new Error('funds execution authority is already held by this process');
    }
    if (this.fundsExecutionAuthorityRetainedForRecovery) {
      throw new Error(
        'funds execution authority is retained for reviewed recovery',
      );
    }

    const ownerToken = randomBytes(32);
    const ownerDigestHex = createHash('sha256')
      .update(ownerToken)
      .digest('hex');
    const lease = Object.freeze({
      schema: FUNDS_EXECUTION_AUTHORITY_SCHEMA,
      epochHex: randomBytes(32).toString('hex'),
    });
    let lockFd: number | null = null;

    try {
      if (this.fundsExecutionLockPath !== null) {
        try {
          lockFd = openSync(
            this.fundsExecutionLockPath,
            'wx',
            0o600,
          );
        } catch (error: any) {
          if (error?.code === 'EEXIST') {
            throw new Error(
              'a retained funds execution lock requires reviewed recovery',
            );
          }
          throw error;
        }
        writeFileSync(
          lockFd,
          `${canonicalJson({
            schema: lease.schema,
            epochHex: lease.epochHex,
            ownerDigestHex,
          })}\n`,
          'utf8',
        );
        fsyncSync(lockFd);
      }
      const acquire = this.db.transaction(() => {
        const retained = this.db.prepare(`
          SELECT schema, epoch_hex
          FROM funds_execution_authority
          WHERE id = 1
        `).get() as { schema: string; epoch_hex: string } | undefined;
        if (retained !== undefined) {
          throw new Error(
            'a retained funds execution authority requires reviewed recovery',
          );
        }
        this.db.prepare(`
          INSERT INTO funds_execution_authority (
            id,
            schema,
            epoch_hex,
            owner_digest_hex
          ) VALUES (1, ?, ?, ?)
        `).run(
          lease.schema,
          lease.epochHex,
          ownerDigestHex,
        );
      });
      acquire.immediate();
    } catch (error) {
      if (lockFd !== null) {
        closeSync(lockFd);
        try {
          unlinkSync(this.fundsExecutionLockPath!);
        } catch {
          // A retained lock file is fail-closed and requires reviewed recovery.
        }
      }
      throw error;
    }

    this.fundsExecutionAuthority = Object.freeze({
      lease,
      ownerDigestHex,
      lockFd,
    });
    return lease;
  }

  releaseFundsExecutionAuthority(): void {
    this.assertWritable('release funds execution authority');
    const authority = this.fundsExecutionAuthority;
    if (authority === null) {
      throw new Error('this process does not hold funds execution authority');
    }
    if (this.fundsExecutionAuthorityRetainedForRecovery) {
      if (authority.lockFd !== null) {
        try {
          closeSync(authority.lockFd);
        } catch {
          // The on-disk lock and database epoch remain the deciding hold.
        }
      }
      this.fundsExecutionAuthority = null;
      throw new Error(
        'funds execution authority is retained for reviewed recovery',
      );
    }
    this.assertOwnedFundsExecutionAuthority(authority.lease.epochHex);
    try {
      const release = this.db.transaction(() => {
        const result = this.db.prepare(`
          DELETE FROM funds_execution_authority
          WHERE id = 1
            AND schema = ?
            AND epoch_hex = ?
            AND owner_digest_hex = ?
        `).run(
          authority.lease.schema,
          authority.lease.epochHex,
          authority.ownerDigestHex,
        );
        if (result.changes !== 1) {
          throw new Error('funds execution authority changed before release');
        }
      });
      release.immediate();
      if (authority.lockFd !== null) {
        closeSync(authority.lockFd);
        unlinkSync(this.fundsExecutionLockPath!);
      }
      this.fundsExecutionAuthority = null;
    } catch (error) {
      if (authority.lockFd !== null) {
        try {
          closeSync(authority.lockFd);
        } catch {
          // Retain the lock file as a fail-closed recovery marker.
        }
      }
      this.fundsExecutionAuthority = null;
      throw error;
    }
  }

  private assertOwnedFundsExecutionAuthority(
    expectedEpochHex?: string,
  ): FundsExecutionAuthorityLease {
    if (this.fundsExecutionAuthorityRetainedForRecovery) {
      throw new Error(
        'funds execution authority is retained for reviewed recovery',
      );
    }
    const authority = this.fundsExecutionAuthority;
    if (authority === null) {
      throw new Error('funds execution authority is not held by this process');
    }
    if (
      this.fundsExecutionLockPath !== null
      && (
        authority.lockFd === null
        || !existsSync(this.fundsExecutionLockPath)
      )
    ) {
      throw new Error('funds execution lock is not current');
    }
    const row = this.db.prepare(`
      SELECT schema, epoch_hex, owner_digest_hex
      FROM funds_execution_authority
      WHERE id = 1
    `).get() as {
      schema: string;
      epoch_hex: string;
      owner_digest_hex: string;
    } | undefined;
    if (
      row === undefined
      || row.schema !== authority.lease.schema
      || row.epoch_hex !== authority.lease.epochHex
      || row.owner_digest_hex !== authority.ownerDigestHex
    ) {
      throw new Error('funds execution authority is not current');
    }
    if (
      expectedEpochHex !== undefined
      && normalizeFixedHex(
        expectedEpochHex,
        32,
        'expected funds execution authority epoch',
      ) !== authority.lease.epochHex
    ) {
      throw new Error('funds execution authority epoch changed');
    }
    return authority.lease;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS peg_in_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ergo_lock_box_id TEXT UNIQUE NOT NULL,
        target_evm_address TEXT NOT NULL,
        amount_nanoerg TEXT NOT NULL,
        ergo_lock_height INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'detected',
        source_classification TEXT NOT NULL DEFAULT 'unknown',
        depositor_ergo_tree_hex TEXT,
        commit_tx_id TEXT,
        committed_vault_box_id TEXT,
        commit_inclusion_height INTEGER,
        commit_inclusion_header_id TEXT,
        commit_verification_receipt_json TEXT,
        commit_verification_receipt_digest TEXT,
        commit_failure TEXT,
        sidechain_mint_tx_hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS peg_in_mint_transport_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        peg_in_id INTEGER NOT NULL,
        operation_digest TEXT NOT NULL UNIQUE,
        envelope_digest TEXT NOT NULL UNIQUE,
        authorization_digest TEXT NOT NULL UNIQUE,
        signed_envelope_digest TEXT NOT NULL UNIQUE,
        attempt_digest TEXT NOT NULL UNIQUE,
        source_box_id TEXT NOT NULL,
        committed_vault_box_id TEXT NOT NULL,
        commitment_receipt_digest TEXT NOT NULL,
        recipient_address TEXT NOT NULL,
        amount_nanoerg TEXT NOT NULL,
        chain_id TEXT NOT NULL,
        bridge_address TEXT NOT NULL,
        serg_address TEXT NOT NULL,
        relayer_address TEXT NOT NULL,
        bridge_code_hash TEXT NOT NULL,
        serg_owner_address TEXT NOT NULL,
        serg_code_hash TEXT NOT NULL,
        fee_policy_id TEXT NOT NULL,
        admitted_block_number INTEGER NOT NULL,
        admitted_block_hash TEXT NOT NULL,
        observed_pending_nonce INTEGER NOT NULL,
        expires_at_block_number INTEGER NOT NULL,
        call_data_hex TEXT NOT NULL,
        transaction_type INTEGER NOT NULL,
        nonce INTEGER NOT NULL,
        gas_limit TEXT NOT NULL,
        gas_price_wei TEXT,
        max_fee_per_gas_wei TEXT,
        max_priority_fee_per_gas_wei TEXT,
        access_list_digest TEXT NOT NULL,
        unsigned_transaction_digest TEXT NOT NULL UNIQUE,
        signed_transaction_digest TEXT NOT NULL UNIQUE,
        expected_transaction_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        rejection_reason TEXT,
        transaction_hash TEXT,
        response_digest TEXT,
        confirmation_block_number INTEGER,
        confirmation_block_hash TEXT,
        confirmation_count INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (peg_in_id) REFERENCES peg_in_events(id) ON DELETE RESTRICT,
        CHECK (schema = 'e2s.peg-in-mint-transport.v1'),
        CHECK (fee_policy_id = 'e2s.frontier-peg-in-mint-fee-policy.v1'),
        CHECK (serg_owner_address = bridge_address),
        CHECK (status IN (
          'pending',
          'rejected',
          'accepted',
          'ambiguous',
          'confirmed',
          'abandoned',
          'quarantined'
        )),
        CHECK (
          rejection_reason IS NULL
          OR rejection_reason IN (
            'source_revalidation_failed',
            'target_revalidation_failed'
          )
        ),
        CHECK (transaction_type IN (0, 2)),
        CHECK (
          (transaction_type = 0
            AND gas_price_wei IS NOT NULL
            AND max_fee_per_gas_wei IS NULL
            AND max_priority_fee_per_gas_wei IS NULL)
          OR
          (transaction_type = 2
            AND gas_price_wei IS NULL
            AND max_fee_per_gas_wei IS NOT NULL
            AND max_priority_fee_per_gas_wei IS NOT NULL)
        ),
        CHECK (
          status NOT IN ('accepted', 'confirmed')
          OR (
            transaction_hash = expected_transaction_hash
            AND response_digest IS NOT NULL
            AND confirmation_block_number IS NOT NULL
            AND confirmation_block_hash IS NOT NULL
            AND confirmation_count = 3
          )
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS peg_in_mint_single_active_attempt
        ON peg_in_mint_transport_attempts(peg_in_id)
        WHERE status IN ('pending', 'accepted', 'ambiguous');

      CREATE INDEX IF NOT EXISTS peg_in_mint_attempts_by_peg_in
        ON peg_in_mint_transport_attempts(peg_in_id, id);

      CREATE UNIQUE INDEX IF NOT EXISTS peg_in_mint_active_nonce
        ON peg_in_mint_transport_attempts(chain_id, relayer_address, nonce)
        WHERE status IN (
          'pending',
          'accepted',
          'ambiguous',
          'confirmed',
          'quarantined'
        );

      CREATE TRIGGER IF NOT EXISTS peg_in_mint_attempt_no_delete
      BEFORE DELETE ON peg_in_mint_transport_attempts
      BEGIN
        SELECT RAISE(ABORT, 'peg-in mint transport attempts are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_mint_attempt_identity_immutable
      BEFORE UPDATE ON peg_in_mint_transport_attempts
      WHEN NEW.schema IS NOT OLD.schema
        OR NEW.peg_in_id IS NOT OLD.peg_in_id
        OR NEW.operation_digest IS NOT OLD.operation_digest
        OR NEW.envelope_digest IS NOT OLD.envelope_digest
        OR NEW.authorization_digest IS NOT OLD.authorization_digest
        OR NEW.signed_envelope_digest IS NOT OLD.signed_envelope_digest
        OR NEW.attempt_digest IS NOT OLD.attempt_digest
        OR NEW.source_box_id IS NOT OLD.source_box_id
        OR NEW.committed_vault_box_id IS NOT OLD.committed_vault_box_id
        OR NEW.commitment_receipt_digest IS NOT OLD.commitment_receipt_digest
        OR NEW.recipient_address IS NOT OLD.recipient_address
        OR NEW.amount_nanoerg IS NOT OLD.amount_nanoerg
        OR NEW.chain_id IS NOT OLD.chain_id
        OR NEW.bridge_address IS NOT OLD.bridge_address
        OR NEW.serg_address IS NOT OLD.serg_address
        OR NEW.relayer_address IS NOT OLD.relayer_address
        OR NEW.bridge_code_hash IS NOT OLD.bridge_code_hash
        OR NEW.serg_owner_address IS NOT OLD.serg_owner_address
        OR NEW.serg_code_hash IS NOT OLD.serg_code_hash
        OR NEW.fee_policy_id IS NOT OLD.fee_policy_id
        OR NEW.admitted_block_number IS NOT OLD.admitted_block_number
        OR NEW.admitted_block_hash IS NOT OLD.admitted_block_hash
        OR NEW.observed_pending_nonce IS NOT OLD.observed_pending_nonce
        OR NEW.expires_at_block_number IS NOT OLD.expires_at_block_number
        OR NEW.call_data_hex IS NOT OLD.call_data_hex
        OR NEW.transaction_type IS NOT OLD.transaction_type
        OR NEW.nonce IS NOT OLD.nonce
        OR NEW.gas_limit IS NOT OLD.gas_limit
        OR NEW.gas_price_wei IS NOT OLD.gas_price_wei
        OR NEW.max_fee_per_gas_wei IS NOT OLD.max_fee_per_gas_wei
        OR NEW.max_priority_fee_per_gas_wei
          IS NOT OLD.max_priority_fee_per_gas_wei
        OR NEW.access_list_digest IS NOT OLD.access_list_digest
        OR NEW.unsigned_transaction_digest
          IS NOT OLD.unsigned_transaction_digest
        OR NEW.signed_transaction_digest
          IS NOT OLD.signed_transaction_digest
        OR NEW.expected_transaction_hash
          IS NOT OLD.expected_transaction_hash
        OR NEW.created_at IS NOT OLD.created_at
      BEGIN
        SELECT RAISE(ABORT, 'peg-in mint transport attempt identity is immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_mint_attempt_quarantine
      AFTER UPDATE OF status ON peg_in_events
      WHEN NEW.status IN ('commit_invalid', 'incident', 'failed')
      BEGIN
        UPDATE peg_in_mint_transport_attempts
        SET status = 'quarantined',
            updated_at = datetime('now')
        WHERE peg_in_id = NEW.id
          AND status IN ('pending', 'accepted', 'ambiguous');
      END;

      CREATE TABLE IF NOT EXISTS peg_in_safety_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        kind TEXT NOT NULL,
        peg_in_id INTEGER,
        evidence_json TEXT NOT NULL,
        evidence_digest TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (peg_in_id) REFERENCES peg_in_events(id) ON DELETE RESTRICT,
        CHECK (schema = 'e2s.peg-in-safety-incident.v1'),
        CHECK (kind IN (
          'commitment_disappeared',
          'refundable_source_restored',
          'canonical_header_replaced',
          'commitment_receipt_conflict',
          'committed_vault_unavailable',
          'mint_outcome_commitment_lost',
          'legacy_refundable_after_mint',
          'submission_identity_mismatch',
          'missing_commitment_receipt',
          'solvency_deficit',
          'unspecified'
        ))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS peg_in_single_solvency_deficit
        ON peg_in_safety_incidents(kind)
        WHERE kind = 'solvency_deficit';

      CREATE TRIGGER IF NOT EXISTS peg_in_safety_incidents_no_update
      BEFORE UPDATE ON peg_in_safety_incidents
      BEGIN
        SELECT RAISE(ABORT, 'peg-in safety incidents are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_safety_incidents_no_delete
      BEFORE DELETE ON peg_in_safety_incidents
      BEGIN
        SELECT RAISE(ABORT, 'peg-in safety incidents cannot be cleared without reviewed authority');
      END;

      CREATE TABLE IF NOT EXISTS peg_in_route_reconstruction_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema TEXT NOT NULL,
        manifest_id TEXT NOT NULL,
        manifest_digest TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        route_bindings_json TEXT NOT NULL,
        network_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        anchor_header_json TEXT NOT NULL,
        primary_source_id TEXT NOT NULL,
        witness_source_id TEXT NOT NULL,
        observation_digest TEXT NOT NULL,
        reconstruction_digest TEXT NOT NULL,
        decision_classification TEXT NOT NULL,
        observation_condition_met INTEGER NOT NULL,
        decision_blockers_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        CHECK (observation_condition_met IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS peg_in_route_reconstruction_deposits (
        box_id TEXT PRIMARY KEY,
        address_box_index INTEGER NOT NULL,
        transaction_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        creation_height INTEGER NOT NULL,
        value_nanoerg TEXT NOT NULL,
        spent_transaction_id TEXT,
        target_evm_address TEXT NOT NULL,
        declared_amount_nanoerg TEXT NOT NULL,
        signer_metadata_hex TEXT NOT NULL,
        depositor_ergo_tree_hex TEXT NOT NULL,
        classification TEXT NOT NULL,
        transition_transaction_id TEXT,
        transition_inclusion_height INTEGER,
        transition_inclusion_block_id TEXT,
        transition_confirmations INTEGER,
        transition_vault_box_id TEXT,
        current_unspent INTEGER NOT NULL,
        CHECK (classification IN ('refundable', 'commit_pending', 'committed', 'refunded', 'unresolved')),
        CHECK (current_unspent IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS peg_in_route_reconstruction_vault_boxes (
        box_id TEXT PRIMARY KEY,
        current_unspent INTEGER NOT NULL,
        CHECK (current_unspent IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS peg_in_route_reconstruction_legacy_routes (
        ordinal INTEGER PRIMARY KEY,
        version TEXT NOT NULL,
        address TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS peg_in_route_reconstruction_legacy_boxes (
        route_ordinal INTEGER NOT NULL,
        box_id TEXT NOT NULL,
        current_unspent INTEGER NOT NULL,
        PRIMARY KEY (route_ordinal, box_id),
        FOREIGN KEY (route_ordinal)
          REFERENCES peg_in_route_reconstruction_legacy_routes(ordinal)
          ON DELETE CASCADE,
        CHECK (current_unspent IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS peg_in_sidechain_reconstruction_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        ergo_route_reconstruction_digest TEXT NOT NULL,
        frontier_view_digest TEXT NOT NULL,
        frontier_source_ids_json TEXT NOT NULL,
        observed_tip_json TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        boundary_json TEXT NOT NULL,
        reconstruction_digest TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS peg_in_sidechain_reconstruction_entries (
        ordinal INTEGER PRIMARY KEY,
        state_id INTEGER NOT NULL DEFAULT 1 CHECK (state_id = 1),
        ergo_box_id TEXT NOT NULL UNIQUE,
        route_kind TEXT NOT NULL,
        route_classification TEXT NOT NULL,
        processed_at_observed_tip INTEGER NOT NULL,
        cross_chain_state TEXT NOT NULL,
        event_json TEXT,
        FOREIGN KEY (state_id)
          REFERENCES peg_in_sidechain_reconstruction_state(id)
          ON DELETE CASCADE,
        CHECK (processed_at_observed_tip IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS peg_in_sidechain_reconstruction_issues (
        ordinal INTEGER PRIMARY KEY,
        state_id INTEGER NOT NULL DEFAULT 1 CHECK (state_id = 1),
        code TEXT NOT NULL,
        ergo_box_id TEXT NOT NULL,
        message TEXT NOT NULL,
        FOREIGN KEY (state_id)
          REFERENCES peg_in_sidechain_reconstruction_state(id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS peg_in_reconciliation_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        peg_in_id INTEGER NOT NULL,
        ergo_lock_box_id TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        lifecycle_digest TEXT NOT NULL,
        joined_reconstruction_digest TEXT NOT NULL,
        ergo_route_reconstruction_digest TEXT NOT NULL,
        frontier_view_digest TEXT NOT NULL,
        observed_tip_height INTEGER NOT NULL,
        observed_tip_id TEXT NOT NULL,
        joined_entry_state TEXT,
        joined_event_transaction_hash TEXT,
        disposition TEXT NOT NULL,
        reason TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        observation_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (peg_in_id) REFERENCES peg_in_events(id) ON DELETE RESTRICT,
        UNIQUE (id, peg_in_id),
        CHECK (schema = 'e2s.peg-in-reconciliation-observation.v1'),
        CHECK (disposition IN ('deferred', 'quarantined')),
        CHECK (reason IN (
          'native_grandpa_finality_unavailable',
          'joined_reconstruction_inconsistent',
          'joined_entry_missing',
          'joined_entry_invalid',
          'source_classification_mismatch',
          'committed_vault_not_observed',
          'unexpected_frontier_mint',
          'local_mint_not_observed',
          'local_mint_identity_missing',
          'local_mint_identity_mismatch',
          'local_lifecycle_terminal',
          'event_binding_mismatch'
        )),
        CHECK (
          (disposition = 'deferred' AND reason = 'native_grandpa_finality_unavailable')
          OR
          (disposition = 'quarantined' AND reason != 'native_grandpa_finality_unavailable')
        )
      );

      CREATE TABLE IF NOT EXISTS peg_in_reconciliation_state (
        peg_in_id INTEGER PRIMARY KEY,
        latest_journal_id INTEGER NOT NULL UNIQUE,
        FOREIGN KEY (peg_in_id) REFERENCES peg_in_events(id) ON DELETE RESTRICT,
        FOREIGN KEY (latest_journal_id, peg_in_id)
          REFERENCES peg_in_reconciliation_journal(id, peg_in_id)
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS peg_in_reconciliation_journal_by_peg_in
        ON peg_in_reconciliation_journal(peg_in_id, id);

      CREATE TRIGGER IF NOT EXISTS peg_in_reconciliation_journal_no_update
      BEFORE UPDATE ON peg_in_reconciliation_journal
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation journal is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_reconciliation_journal_no_delete
      BEFORE DELETE ON peg_in_reconciliation_journal
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation journal is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_reconciliation_state_no_delete
      BEFORE DELETE ON peg_in_reconciliation_state
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation hold cannot be cleared without finality authority');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_reconciliation_state_monotonic
      BEFORE UPDATE ON peg_in_reconciliation_state
      WHEN NEW.peg_in_id IS NOT OLD.peg_in_id
        OR NEW.latest_journal_id <= OLD.latest_journal_id
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation hold must advance monotonically');
      END;

      CREATE TRIGGER IF NOT EXISTS peg_in_reconciliation_hold_blocks_authority_update
      BEFORE UPDATE ON peg_in_events
      WHEN EXISTS (
        SELECT 1 FROM peg_in_reconciliation_state
        WHERE peg_in_id = OLD.id
      )
      AND (
        NEW.ergo_lock_box_id IS NOT OLD.ergo_lock_box_id
        OR NEW.target_evm_address IS NOT OLD.target_evm_address
        OR NEW.amount_nanoerg IS NOT OLD.amount_nanoerg
        OR NEW.ergo_lock_height IS NOT OLD.ergo_lock_height
        OR NEW.status IS NOT OLD.status
        OR NEW.source_classification IS NOT OLD.source_classification
        OR NEW.depositor_ergo_tree_hex IS NOT OLD.depositor_ergo_tree_hex
        OR NEW.commit_tx_id IS NOT OLD.commit_tx_id
        OR NEW.committed_vault_box_id IS NOT OLD.committed_vault_box_id
        OR NEW.commit_inclusion_height IS NOT OLD.commit_inclusion_height
        OR NEW.sidechain_mint_tx_hash IS NOT OLD.sidechain_mint_tx_hash
      )
      AND NOT (
        NEW.status IN ('commit_invalid', 'incident', 'failed')
        AND NEW.ergo_lock_box_id IS OLD.ergo_lock_box_id
        AND NEW.target_evm_address IS OLD.target_evm_address
        AND NEW.amount_nanoerg IS OLD.amount_nanoerg
        AND NEW.ergo_lock_height IS OLD.ergo_lock_height
        AND NEW.source_classification IS OLD.source_classification
        AND NEW.depositor_ergo_tree_hex IS OLD.depositor_ergo_tree_hex
        AND NEW.commit_tx_id IS OLD.commit_tx_id
        AND NEW.committed_vault_box_id IS OLD.committed_vault_box_id
        AND NEW.commit_inclusion_height IS OLD.commit_inclusion_height
        AND NEW.sidechain_mint_tx_hash IS OLD.sidechain_mint_tx_hash
      )
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation hold blocks lifecycle authority changes');
      END;

      CREATE TABLE IF NOT EXISTS pooled_reserve_mint_reservation_observation_journal_v4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        reservation_key TEXT NOT NULL,
        statement_id TEXT NOT NULL,
        admission_candidate_digest TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        lifecycle_record_scale_hex TEXT,
        expires_at_height TEXT,
        classification TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        trust_anchor_digest TEXT NOT NULL,
        target_native_block_hash TEXT NOT NULL,
        target_native_height TEXT NOT NULL,
        target_state_root TEXT NOT NULL,
        finality_horizon_hash TEXT NOT NULL,
        finality_horizon_height TEXT NOT NULL,
        bridge_runtime_code_sha256 TEXT NOT NULL,
        bridge_runtime_code_bytes TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        observation_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (id, reservation_key),
        CHECK (
          schema = 'e2s.pooled-reserve-mint-reservation-recovery-observation.v4'
        ),
        CHECK (
          lifecycle_status IN ('absent', 'pending', 'consumed', 'invalidated')
        ),
        CHECK (
          classification IN (
            'absent_non_authorizing_hold',
            'pending_hold',
            'expired_pending_runtime_retirement_required',
            'consumed_terminal_hold',
            'invalidated_terminal_hold'
          )
        ),
        CHECK (
          (lifecycle_status = 'absent'
            AND lifecycle_record_scale_hex IS NULL
            AND expires_at_height IS NULL
            AND classification = 'absent_non_authorizing_hold')
          OR
          (lifecycle_status = 'pending'
            AND lifecycle_record_scale_hex IS NOT NULL
            AND expires_at_height IS NOT NULL
            AND classification IN (
              'pending_hold',
              'expired_pending_runtime_retirement_required'
            ))
          OR
          (lifecycle_status = 'consumed'
            AND lifecycle_record_scale_hex IS NOT NULL
            AND expires_at_height IS NULL
            AND classification = 'consumed_terminal_hold')
          OR
          (lifecycle_status = 'invalidated'
            AND lifecycle_record_scale_hex IS NOT NULL
            AND expires_at_height IS NULL
            AND classification = 'invalidated_terminal_hold')
        )
      );

      CREATE TABLE IF NOT EXISTS pooled_reserve_mint_reservation_holds_v4 (
        reservation_key TEXT PRIMARY KEY,
        latest_journal_id INTEGER NOT NULL UNIQUE,
        FOREIGN KEY (latest_journal_id, reservation_key)
          REFERENCES pooled_reserve_mint_reservation_observation_journal_v4(
            id,
            reservation_key
          )
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS pooled_reserve_mint_reservation_journal_by_key_v4
        ON pooled_reserve_mint_reservation_observation_journal_v4(
          reservation_key,
          id
        );

      CREATE TRIGGER IF NOT EXISTS pooled_reserve_mint_reservation_journal_no_update_v4
      BEFORE UPDATE ON pooled_reserve_mint_reservation_observation_journal_v4
      BEGIN
        SELECT RAISE(
          ABORT,
          'pooled-reserve mint-reservation observation journal is append-only'
        );
      END;

      CREATE TRIGGER IF NOT EXISTS pooled_reserve_mint_reservation_journal_no_delete_v4
      BEFORE DELETE ON pooled_reserve_mint_reservation_observation_journal_v4
      BEGIN
        SELECT RAISE(
          ABORT,
          'pooled-reserve mint-reservation observation journal is append-only'
        );
      END;

      CREATE TRIGGER IF NOT EXISTS pooled_reserve_mint_reservation_hold_no_delete_v4
      BEFORE DELETE ON pooled_reserve_mint_reservation_holds_v4
      BEGIN
        SELECT RAISE(
          ABORT,
          'pooled-reserve mint-reservation hold cannot be cleared locally'
        );
      END;

      CREATE TRIGGER IF NOT EXISTS pooled_reserve_mint_reservation_hold_monotonic_v4
      BEFORE UPDATE ON pooled_reserve_mint_reservation_holds_v4
      WHEN NEW.reservation_key IS NOT OLD.reservation_key
        OR NEW.latest_journal_id <= OLD.latest_journal_id
      BEGIN
        SELECT RAISE(
          ABORT,
          'pooled-reserve mint-reservation hold must advance monotonically'
        );
      END;

      CREATE TABLE IF NOT EXISTS peg_out_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sidechain_burn_tx_hash TEXT NOT NULL,
        sidechain_id TEXT,
        burn_id TEXT,
        ergo_recipient_address TEXT NOT NULL,
        amount_nanoerg TEXT NOT NULL,
        sidechain_burn_height INTEGER NOT NULL,
        user TEXT,
        sidechain_block_hash TEXT,
        sidechain_log_index INTEGER,
        status TEXT NOT NULL DEFAULT 'detected',
        phase1_box_id TEXT,
        phase2_unlock_tx_id TEXT,
        avl_proof_hex TEXT,
        pending_avl_key TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS avl_tree_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hex TEXT UNIQUE NOT NULL,
        value_hex TEXT NOT NULL DEFAULT '01',
        inserted_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS spv_tracker_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hex TEXT UNIQUE NOT NULL,
        value_hex TEXT NOT NULL,
        sidechain_height TEXT NOT NULL,
        sidechain_header_hash TEXT NOT NULL,
        bridge_event_root TEXT NOT NULL,
        ergo_anchor_height INTEGER NOT NULL,
        inserted_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_dup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hex TEXT UNIQUE NOT NULL,
        insertion_tx_id TEXT UNIQUE NOT NULL,
        dup_input_box_id TEXT UNIQUE NOT NULL,
        dup_successor_box_id TEXT UNIQUE NOT NULL,
        inserted_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_dup_reconstruction_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        dup_nft_id TEXT NOT NULL,
        dup_ergo_tree TEXT NOT NULL,
        genesis_box_id TEXT NOT NULL,
        tip_box_id TEXT NOT NULL,
        tip_digest TEXT NOT NULL,
        observation_digest TEXT NOT NULL,
        observed_ergo_tip INTEGER NOT NULL,
        observed_ergo_tip_id TEXT NOT NULL,
        observed_ergo_parent_id TEXT NOT NULL,
        observed_ergo_extension_root TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_vault_history (
        box_id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        creation_height INTEGER NOT NULL,
        value_nanoerg TEXT NOT NULL,
        ergo_tree TEXT NOT NULL,
        r4 TEXT NOT NULL,
        r5 TEXT NOT NULL,
        r6 TEXT NOT NULL,
        r7 TEXT NOT NULL,
        deposit_id TEXT NOT NULL,
        target_evm_address TEXT NOT NULL,
        original_amount_nanoerg TEXT NOT NULL,
        provenance_hex TEXT NOT NULL,
        spent_transaction_id TEXT,
        sigma_serialized_hex TEXT NOT NULL,
        sigma_serialized_sha256 TEXT NOT NULL,
        current_unspent INTEGER NOT NULL CHECK (current_unspent IN (0, 1)),
        reconstructed_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_vault_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        burn_id TEXT UNIQUE NOT NULL,
        spending_transaction_id TEXT UNIQUE NOT NULL,
        input_box_id TEXT UNIQUE NOT NULL,
        successor_box_id TEXT UNIQUE,
        payout_box_id TEXT NOT NULL,
        payout_value_nanoerg TEXT NOT NULL,
        miner_fee_nanoerg TEXT NOT NULL,
        reconstructed_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_vault_reconstruction_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        vault_address TEXT NOT NULL,
        vault_ergo_tree TEXT NOT NULL,
        dup_observation_digest TEXT NOT NULL,
        dup_tip_box_id TEXT NOT NULL,
        observation_digest TEXT NOT NULL,
        observed_ergo_tip INTEGER NOT NULL,
        observed_ergo_tip_id TEXT NOT NULL,
        observed_ergo_parent_id TEXT NOT NULL,
        observed_ergo_extension_root TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_spv_tracker_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hex TEXT UNIQUE NOT NULL,
        value_hex TEXT NOT NULL,
        sidechain_id TEXT NOT NULL,
        sidechain_height TEXT NOT NULL,
        execution_block_hash TEXT NOT NULL,
        bridge_event_root TEXT NOT NULL,
        checkpoint_commitment TEXT NOT NULL,
        anchor_header_id TEXT NOT NULL,
        anchor_header_height INTEGER NOT NULL,
        inserted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(sidechain_id, sidechain_height)
      );

      CREATE TABLE IF NOT EXISTS authenticated_spv_tracker_reconstruction_state (
        sidechain_id TEXT PRIMARY KEY,
        tracker_nft_id TEXT NOT NULL,
        genesis_box_id TEXT NOT NULL,
        finality_attestor_sigma_prop TEXT NOT NULL,
        tip_box_id TEXT NOT NULL,
        tip_digest TEXT NOT NULL,
        observation_digest TEXT NOT NULL,
        observed_ergo_tip INTEGER NOT NULL,
        observed_ergo_tip_id TEXT NOT NULL,
        observed_ergo_parent_id TEXT NOT NULL,
        observed_ergo_extension_root TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pending_dup_heartbeats (
        tx_id TEXT PRIMARY KEY,
        key_hex TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ergo_operational_transaction_attempts (
        schema TEXT NOT NULL,
        operation_profile TEXT NOT NULL,
        expected_tx_id TEXT PRIMARY KEY,
        source_box_id TEXT NOT NULL,
        input_box_ids_json TEXT NOT NULL,
        attempted_at_height INTEGER NOT NULL,
        target_sidechain_height INTEGER,
        target_sidechain_block_hash TEXT,
        heartbeat_key_hex TEXT,
        reconciliation_identity_digest TEXT,
        binding_digest TEXT NOT NULL,
        signed_transaction_digest TEXT NOT NULL,
        check_response_digest TEXT NOT NULL,
        revalidation_digest TEXT NOT NULL,
        authorization_digest TEXT NOT NULL,
        funds_release_authority_epoch TEXT,
        durable_attempt_digest TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        submission_disposition TEXT,
        submitted_tx_id TEXT,
        response_digest TEXT,
        confirmation_height INTEGER,
        confirmation_header_id TEXT,
        abandonment_reason TEXT,
        quarantine_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        submission_finalized_at TEXT,
        confirmed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (schema = '${ERGO_OPERATIONAL_TRANSACTION_SCHEMA}'),
        CHECK (
          operation_profile IN (
            '${PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE}',
            '${SCS_ORACLE_UPDATE_OPERATION_PROFILE}',
            '${DUP_HEARTBEAT_OPERATION_PROFILE}',
            '${DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE}',
            '${SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE}'
          )
        ),
        CHECK (
          (
            operation_profile = '${PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE}'
            AND target_sidechain_height IS NULL
            AND target_sidechain_block_hash IS NULL
            AND heartbeat_key_hex IS NULL
            AND reconciliation_identity_digest IS NULL
          )
          OR (
            operation_profile = '${SCS_ORACLE_UPDATE_OPERATION_PROFILE}'
            AND target_sidechain_height IS NOT NULL
            AND target_sidechain_block_hash IS NOT NULL
            AND heartbeat_key_hex IS NULL
            AND reconciliation_identity_digest IS NULL
          )
          OR (
            operation_profile = '${DUP_HEARTBEAT_OPERATION_PROFILE}'
            AND target_sidechain_height IS NULL
            AND target_sidechain_block_hash IS NULL
            AND heartbeat_key_hex IS NOT NULL
            AND reconciliation_identity_digest IS NULL
          )
          OR (
            operation_profile = '${DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE}'
            AND target_sidechain_height IS NULL
            AND target_sidechain_block_hash IS NULL
            AND heartbeat_key_hex IS NULL
            AND reconciliation_identity_digest IS NOT NULL
          )
          OR (
            operation_profile = '${SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE}'
            AND target_sidechain_height IS NULL
            AND target_sidechain_block_hash IS NULL
            AND heartbeat_key_hex IS NULL
            AND reconciliation_identity_digest IS NOT NULL
          )
        ),
        CHECK (
          status IN (
            'pending',
            'accepted',
            'ambiguous',
            'confirmed',
            'abandoned',
            'quarantined'
          )
        ),
        CHECK (
          submission_disposition IS NULL
          OR submission_disposition IN ('accepted', 'ambiguous')
        ),
        CHECK (
          (
            submission_disposition = 'accepted'
            AND submitted_tx_id = expected_tx_id
            AND status IN ('accepted', 'confirmed', 'abandoned', 'quarantined')
          )
          OR (
            submission_disposition = 'ambiguous'
            AND submitted_tx_id IS NULL
            AND status IN ('ambiguous', 'confirmed', 'abandoned', 'quarantined')
          )
          OR (
            submission_disposition IS NULL
            AND submitted_tx_id IS NULL
            AND status IN ('pending', 'confirmed', 'abandoned', 'quarantined')
          )
        ),
        CHECK (
          (
            status = 'confirmed'
            AND confirmation_height IS NOT NULL
            AND confirmation_header_id IS NOT NULL
            AND confirmed_at IS NOT NULL
          )
          OR (status <> 'confirmed')
        ),
        CHECK (
          (status = 'abandoned' AND abandonment_reason IS NOT NULL)
          OR (status <> 'abandoned' AND abandonment_reason IS NULL)
        ),
        CHECK (
          (status = 'quarantined' AND quarantine_reason IS NOT NULL)
          OR (status <> 'quarantined' AND quarantine_reason IS NULL)
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ergo_operational_active_source
        ON ergo_operational_transaction_attempts(source_box_id)
        WHERE status IN ('pending', 'accepted', 'ambiguous');
      CREATE UNIQUE INDEX IF NOT EXISTS ergo_operational_active_singleton_profile
        ON ergo_operational_transaction_attempts(operation_profile)
        WHERE operation_profile IN (
          '${SCS_ORACLE_UPDATE_OPERATION_PROFILE}',
          '${DUP_HEARTBEAT_OPERATION_PROFILE}',
          '${DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE}',
          '${SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE}'
        )
          AND status IN ('pending', 'accepted', 'ambiguous');

      CREATE TABLE IF NOT EXISTS aggregate_settlement_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        expected_tx_id TEXT UNIQUE NOT NULL,
        submitted_tx_id TEXT,
        burn_tx_hashes_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        abandonment_reason TEXT,
        lifecycle_version INTEGER NOT NULL DEFAULT 0,
        transport_reservation_digest TEXT,
        funds_release_authority_epoch TEXT,
        transport_started_at TEXT,
        transport_completed_at TEXT,
        recovery_binding_status TEXT NOT NULL DEFAULT 'legacy_unbound',
        recovery_policy_version INTEGER,
        recovery_required_confirmations INTEGER,
        ergo_observation_policy_version INTEGER,
        ergo_observation_required_confirmations INTEGER,
        ergo_observation_status TEXT,
        ergo_observation_transaction_digest TEXT,
        ergo_observation_inclusion_height INTEGER,
        ergo_observation_inclusion_header_id TEXT,
        ergo_observation_tip_height INTEGER,
        ergo_observation_tip_header_id TEXT,
        ergo_observation_confirmations INTEGER,
        ergo_observation_digest TEXT,
        ergo_observation_source_count INTEGER NOT NULL DEFAULT 0,
        ergo_observation_consensus_digest TEXT,
        recovery_quarantine_reason TEXT,
        recovery_quarantine_policy_version INTEGER,
        recovery_quarantine_required_confirmations INTEGER,
        recovery_quarantine_status TEXT,
        recovery_quarantine_transaction_digest TEXT,
        recovery_quarantine_inclusion_height INTEGER,
        recovery_quarantine_inclusion_header_id TEXT,
        recovery_quarantine_tip_height INTEGER,
        recovery_quarantine_tip_header_id TEXT,
        recovery_quarantine_confirmations INTEGER,
        recovery_quarantine_observation_digest TEXT,
        recovery_quarantine_source_count INTEGER,
        recovery_quarantine_consensus_digest TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        CHECK (status IN ('pending', 'submitted', 'confirmed', 'abandoned')),
        CHECK (
          (status = 'abandoned' AND abandonment_reason IN (
            'legacy_unclassified',
            'pending_pretransport',
            'burn_invalidation',
            'submitted_absence',
            'pending_transport_absence'
          ))
          OR (status != 'abandoned' AND abandonment_reason IS NULL)
        ),
        CHECK (mode IN ('single', 'single-with-ingest', 'batch')),
        CHECK (recovery_binding_status IN ('legacy_unbound', 'policy_v1')),
        CHECK (recovery_quarantine_reason IS NULL OR recovery_quarantine_reason IN ('confirmed_reorg_observed'))
      );

      CREATE TABLE IF NOT EXISTS aggregate_settlement_recovery_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expected_tx_id TEXT NOT NULL,
        lifecycle_version INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        source_authority_profile TEXT NOT NULL DEFAULT 'legacy-origin-only-v1',
        observation_policy_version INTEGER NOT NULL,
        observation_required_confirmations INTEGER NOT NULL,
        observation_status TEXT NOT NULL,
        observation_transaction_digest TEXT,
        observation_inclusion_height INTEGER,
        observation_inclusion_header_id TEXT,
        observation_tip_height INTEGER NOT NULL,
        observation_tip_header_id TEXT NOT NULL,
        observation_confirmations INTEGER NOT NULL,
        observation_digest TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        consensus_digest TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        CHECK (purpose IN ('abandonment_absence')),
        UNIQUE(expected_tx_id, lifecycle_version, purpose, observation_digest, consensus_digest)
      );

      CREATE TABLE IF NOT EXISTS state_tracker_migrations (
        migration_id TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_settlement_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_schema_version INTEGER,
        candidate_id TEXT UNIQUE NOT NULL,
        burn_id TEXT NOT NULL,
        burn_tx_hash TEXT NOT NULL,
        sidechain_id TEXT NOT NULL,
        sidechain_height TEXT NOT NULL,
        sidechain_block_hash TEXT NOT NULL,
        sidechain_log_index INTEGER NOT NULL,
        tracker_key TEXT NOT NULL,
        tracker_value TEXT NOT NULL,
        tracker_box_id TEXT NOT NULL,
        anchor_header_id TEXT NOT NULL,
        anchor_header_height INTEGER NOT NULL,
        dup_input_box_id TEXT NOT NULL,
        dup_input_digest TEXT NOT NULL,
        vault_box_id TEXT NOT NULL,
        unsigned_tx_digest TEXT NOT NULL,
        creation_height INTEGER NOT NULL,
        observed_sidechain_tip TEXT NOT NULL,
        observed_ergo_tip INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'prepared',
        recovery_schema TEXT,
        recovery_sidechain_consensus_digest TEXT,
        recovery_admission_digest TEXT,
        recovery_sidechain_tip_hash TEXT,
        recovery_sidechain_source_count INTEGER,
        check_expected_tx_id TEXT,
        check_unsigned_package_digest TEXT,
        check_signed_transaction_digest TEXT,
        check_response_digest TEXT,
        check_signer_context_digest TEXT,
        check_checker_identity_digest TEXT,
        check_revalidation_digest TEXT,
        check_native_verification_request_digest TEXT,
        check_trust_anchor_digest TEXT,
        check_finality_horizon_hash TEXT,
        check_finality_horizon_height TEXT,
        check_finality_statement_digest TEXT,
        check_finality_program_id TEXT,
        check_finality_proof_system_id INTEGER,
        check_finality_verifier_profile_id TEXT,
        check_finality_proof_payload_digest TEXT,
        check_finality_proof_digest TEXT,
        check_stable_ergo_view_digest TEXT,
        check_stable_sidechain_view_digest TEXT,
        check_admission_digest TEXT,
        invalidation_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        CHECK (status IN ('prepared', 'check_passed', 'invalidated'))
      );

      CREATE TABLE IF NOT EXISTS authenticated_settlement_execution_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        reservation_digest TEXT UNIQUE NOT NULL,
        candidate_id TEXT NOT NULL,
        candidate_authority_digest TEXT NOT NULL,
        burn_id TEXT NOT NULL,
        burn_tx_hash TEXT NOT NULL,
        amount_nanoerg TEXT NOT NULL,
        recipient_ergo_tree TEXT NOT NULL,
        dup_input_box_id TEXT NOT NULL,
        vault_box_id TEXT NOT NULL,
        expected_tx_id TEXT NOT NULL,
        unsigned_tx_digest TEXT NOT NULL,
        unsigned_package_digest TEXT NOT NULL,
        signed_transaction_digest TEXT NOT NULL,
        check_response_digest TEXT NOT NULL,
        signer_context_digest TEXT NOT NULL,
        checker_identity_digest TEXT NOT NULL,
        revalidation_digest TEXT NOT NULL,
        stable_ergo_view_digest TEXT NOT NULL,
        stable_sidechain_view_digest TEXT NOT NULL,
        finality_proof_digest TEXT NOT NULL,
        check_admission_digest TEXT NOT NULL,
        authorization_digest TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        revocation_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        CHECK (status IN ('active', 'revoked')),
        CHECK (
          (status = 'active' AND revocation_reason IS NULL)
          OR (status = 'revoked' AND revocation_reason IS NOT NULL)
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_candidate
        ON authenticated_settlement_execution_reservations(candidate_id)
        WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_burn
        ON authenticated_settlement_execution_reservations(burn_id)
        WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_burn_tx
        ON authenticated_settlement_execution_reservations(burn_tx_hash)
        WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_dup
        ON authenticated_settlement_execution_reservations(dup_input_box_id)
        WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_vault
        ON authenticated_settlement_execution_reservations(vault_box_id)
        WHERE status = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_execution_reservation_active_tx
        ON authenticated_settlement_execution_reservations(expected_tx_id)
        WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS authenticated_settlement_submission_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schema TEXT NOT NULL,
        lifecycle_version INTEGER NOT NULL,
        execution_reservation_digest TEXT UNIQUE NOT NULL,
        transport_reservation_digest TEXT UNIQUE NOT NULL,
        durable_attempt_digest TEXT UNIQUE NOT NULL,
        candidate_id TEXT UNIQUE NOT NULL,
        expected_tx_id TEXT UNIQUE NOT NULL,
        unsigned_tx_digest TEXT NOT NULL,
        unsigned_package_digest TEXT NOT NULL,
        payout_digest TEXT NOT NULL,
        tracker_box_id TEXT NOT NULL,
        dup_input_box_id TEXT UNIQUE NOT NULL,
        signed_transaction_digest TEXT NOT NULL,
        pre_submit_revalidation_digest TEXT NOT NULL,
        broadcast_authorization_digest TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        submission_attempted INTEGER NOT NULL DEFAULT 1,
        submission_disposition TEXT,
        submitted_tx_id TEXT,
        response_digest TEXT,
        ergo_observation_policy_version INTEGER,
        ergo_observation_required_confirmations INTEGER,
        ergo_observation_status TEXT,
        ergo_observation_transaction_digest TEXT,
        ergo_observation_inclusion_height INTEGER,
        ergo_observation_inclusion_header_id TEXT,
        ergo_observation_tip_height INTEGER,
        ergo_observation_tip_header_id TEXT,
        ergo_observation_confirmations INTEGER,
        ergo_observation_digest TEXT,
        ergo_observation_source_count INTEGER NOT NULL DEFAULT 0,
        ergo_observation_consensus_digest TEXT,
        quarantine_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        submission_finalized_at TEXT,
        confirmed_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        CHECK (status IN ('pending', 'rejected', 'submitted', 'confirmed', 'quarantined')),
        CHECK (submission_attempted = 1),
        CHECK (
          submission_disposition IS NULL
          OR submission_disposition IN ('accepted', 'rejected', 'ambiguous')
        ),
        CHECK (
          (
            submission_disposition IS 'accepted'
            AND submitted_tx_id IS expected_tx_id
          )
          OR (
            submission_disposition IN ('rejected', 'ambiguous')
            AND submitted_tx_id IS NULL
          )
          OR (submission_disposition IS NULL AND submitted_tx_id IS NULL)
        ),
        CHECK (
          (status = 'rejected' AND submission_disposition IS 'rejected')
          OR (
            status IN ('submitted', 'confirmed')
            AND submission_disposition IS 'accepted'
          )
          OR (
            status = 'pending'
            AND (
              submission_disposition IS NULL
              OR submission_disposition IS 'ambiguous'
            )
          )
          OR status = 'quarantined'
        ),
        CHECK (
          (status = 'quarantined' AND quarantine_reason IS NOT NULL)
          OR (status <> 'quarantined' AND quarantine_reason IS NULL)
        ),
        CHECK (
          status <> 'confirmed'
          OR (
            ergo_observation_status = 'confirmed_final'
            AND ergo_observation_policy_version IS NOT NULL
            AND ergo_observation_required_confirmations IS NOT NULL
            AND ergo_observation_transaction_digest IS NOT NULL
            AND ergo_observation_inclusion_height IS NOT NULL
            AND ergo_observation_inclusion_header_id IS NOT NULL
            AND ergo_observation_tip_height IS NOT NULL
            AND ergo_observation_tip_header_id IS NOT NULL
            AND ergo_observation_confirmations IS NOT NULL
            AND ergo_observation_digest IS NOT NULL
            AND ergo_observation_source_count >= 2
            AND ergo_observation_consensus_digest IS NOT NULL
            AND confirmed_at IS NOT NULL
          )
        )
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        latest_ergo_height INTEGER NOT NULL DEFAULT 0,
        latest_sidechain_height INTEGER NOT NULL DEFAULT 0,
        state_box_id TEXT,
        prevention_box_id TEXT,
        peg_in_reconcile_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS operator_alert_delivery_state (
        profile_id TEXT PRIMARY KEY,
        schema TEXT NOT NULL,
        profile_version INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        alert_id_hex TEXT NOT NULL,
        condition_digest_hex TEXT NOT NULL,
        cache_generation_hex TEXT NOT NULL,
        opened_at_ms INTEGER NOT NULL,
        transition TEXT NOT NULL,
        condition_active INTEGER NOT NULL,
        overall TEXT NOT NULL,
        reasons_json TEXT NOT NULL,
        previous_alert_id_hex TEXT,
        delivery_status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        claimed_at_ms INTEGER,
        lease_expires_at_ms INTEGER,
        next_attempt_at_ms INTEGER,
        delivered_at_ms INTEGER,
        last_failure_code TEXT,
        updated_at_ms INTEGER NOT NULL,
        CHECK (profile_id = '${OPERATOR_ALERT_PROFILE_ID}'),
        CHECK (schema = '${OPERATOR_ALERT_DELIVERY_STATE_SCHEMA}'),
        CHECK (profile_version = 1),
        CHECK (revision > 0),
        CHECK (length(alert_id_hex) = 64),
        CHECK (length(condition_digest_hex) = 64),
        CHECK (length(cache_generation_hex) = 64),
        CHECK (previous_alert_id_hex IS NULL OR length(previous_alert_id_hex) = 64),
        CHECK (opened_at_ms >= 0),
        CHECK (transition IN ('raised', 'updated', 'recovered')),
        CHECK (condition_active IN (0, 1)),
        CHECK (overall IN ('healthy', 'degraded', 'held')),
        CHECK (delivery_status IN ('pending', 'delivering', 'retry_wait', 'delivered')),
        CHECK (attempt_count >= 0),
        CHECK (
          last_failure_code IS NULL
          OR last_failure_code IN (
            'delivery_rejected',
            'delivery_unavailable',
            'unexpected_failure'
          )
        )
      );

      INSERT OR IGNORE INTO sync_state (id) VALUES (1);
    `);

    // Migration: add pending_avl_key column if it doesn't exist
    // (for databases created before this fix)
    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN pending_avl_key TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    // Migration: add ergo_anchor_height to peg_out_events.
    // Persists the first observed anchor height for a peg-out so that
    // retries always use the same anchor even if the lookback window
    // advances past the original block.
    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN ergo_anchor_height INTEGER`);
    } catch {
      // Column already exists -- safe to ignore
    }

    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN user TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN sidechain_block_hash TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN sidechain_log_index INTEGER`);
    } catch {
      // Column already exists -- safe to ignore
    }

    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN sidechain_id TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    try {
      this.db.exec(`ALTER TABLE peg_out_events ADD COLUMN burn_id TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    this.migrateAuthenticatedSettlementCheckSchema();
    this.migrateFundsExecutionAuthorityEpochSchema();
    this.migrateErgoOperationalReconciliationIdentitySchema();
    this.migrateAggregateSettlementRecoverySchema();
    this.migrateAggregateSettlementRecoveryObservationSchema();

    this.migratePegOutEventIdentitySchema();
    this.migrateAuthenticatedSettlementCandidateBurnIds();
    this.installAuthenticatedSettlementExecutionReservationTriggers();

    const pegInColumns = [
      `ALTER TABLE peg_in_events ADD COLUMN source_classification TEXT NOT NULL DEFAULT 'unknown'`,
      `ALTER TABLE peg_in_events ADD COLUMN depositor_ergo_tree_hex TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_tx_id TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN committed_vault_box_id TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_inclusion_height INTEGER`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_inclusion_header_id TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_verification_receipt_json TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_verification_receipt_digest TEXT`,
      `ALTER TABLE peg_in_events ADD COLUMN commit_failure TEXT`,
    ];
    for (const migration of pegInColumns) {
      try {
        this.db.exec(migration);
      } catch {
        // Column already exists -- safe to ignore
      }
    }
    this.installPegInReconciliationHoldTrigger();

    try {
      this.db.exec(
        `ALTER TABLE sync_state ADD COLUMN peg_in_reconcile_cursor INTEGER NOT NULL DEFAULT 0`,
      );
    } catch {
      // Column already exists -- safe to ignore
    }
  }

  private migrateFundsExecutionAuthorityEpochSchema(): void {
    try {
      this.db.exec(`
        ALTER TABLE ergo_operational_transaction_attempts
        ADD COLUMN funds_release_authority_epoch TEXT
      `);
    } catch {
      // Column already exists -- safe to ignore.
    }
  }

  private migrateErgoOperationalReconciliationIdentitySchema(): void {
    try {
      this.db.exec(`
        ALTER TABLE ergo_operational_transaction_attempts
        ADD COLUMN reconciliation_identity_digest TEXT
      `);
    } catch {
      // Column already exists -- safe to ignore.
    }
  }

  private installPegInReconciliationHoldTrigger(): void {
    this.db.exec(`
      DROP TRIGGER IF EXISTS peg_in_reconciliation_hold_blocks_authority_update;

      CREATE TRIGGER peg_in_reconciliation_hold_blocks_authority_update
      BEFORE UPDATE ON peg_in_events
      WHEN EXISTS (
        SELECT 1 FROM peg_in_reconciliation_state
        WHERE peg_in_id = OLD.id
      )
      AND (
        NEW.ergo_lock_box_id IS NOT OLD.ergo_lock_box_id
        OR NEW.target_evm_address IS NOT OLD.target_evm_address
        OR NEW.amount_nanoerg IS NOT OLD.amount_nanoerg
        OR NEW.ergo_lock_height IS NOT OLD.ergo_lock_height
        OR NEW.status IS NOT OLD.status
        OR NEW.source_classification IS NOT OLD.source_classification
        OR NEW.depositor_ergo_tree_hex IS NOT OLD.depositor_ergo_tree_hex
        OR NEW.commit_tx_id IS NOT OLD.commit_tx_id
        OR NEW.committed_vault_box_id IS NOT OLD.committed_vault_box_id
        OR NEW.commit_inclusion_height IS NOT OLD.commit_inclusion_height
        OR NEW.commit_inclusion_header_id IS NOT OLD.commit_inclusion_header_id
        OR NEW.commit_verification_receipt_json IS NOT OLD.commit_verification_receipt_json
        OR NEW.commit_verification_receipt_digest IS NOT OLD.commit_verification_receipt_digest
        OR NEW.sidechain_mint_tx_hash IS NOT OLD.sidechain_mint_tx_hash
      )
      AND NOT (
        NEW.status IN ('commit_invalid', 'incident', 'failed')
        AND NEW.ergo_lock_box_id IS OLD.ergo_lock_box_id
        AND NEW.target_evm_address IS OLD.target_evm_address
        AND NEW.amount_nanoerg IS OLD.amount_nanoerg
        AND NEW.ergo_lock_height IS OLD.ergo_lock_height
        AND NEW.source_classification IS OLD.source_classification
        AND NEW.depositor_ergo_tree_hex IS OLD.depositor_ergo_tree_hex
        AND NEW.commit_tx_id IS OLD.commit_tx_id
        AND NEW.committed_vault_box_id IS OLD.committed_vault_box_id
        AND NEW.commit_inclusion_height IS OLD.commit_inclusion_height
        AND NEW.commit_inclusion_header_id IS OLD.commit_inclusion_header_id
        AND NEW.commit_verification_receipt_json IS OLD.commit_verification_receipt_json
        AND NEW.commit_verification_receipt_digest IS OLD.commit_verification_receipt_digest
        AND NEW.sidechain_mint_tx_hash IS OLD.sidechain_mint_tx_hash
      )
      BEGIN
        SELECT RAISE(ABORT, 'peg-in reconciliation hold blocks lifecycle authority changes');
      END;
    `);
  }

  private installAuthenticatedSettlementExecutionReservationTriggers(): void {
    const install = this.db.transaction(() => {
      this.db.exec(`
      DROP TRIGGER IF EXISTS authenticated_execution_reservation_candidate_drift;
      DROP TRIGGER IF EXISTS authenticated_execution_reservation_candidate_delete;
      DROP TRIGGER IF EXISTS authenticated_execution_reservation_peg_out_drift;
      DROP TRIGGER IF EXISTS authenticated_execution_reservation_peg_out_delete;
      DROP TRIGGER IF EXISTS authenticated_submission_attempt_reservation_revoked;
      DROP TRIGGER IF EXISTS authenticated_submission_attempt_reservation_deleted;

      CREATE TRIGGER IF NOT EXISTS authenticated_execution_reservation_candidate_drift
      AFTER UPDATE ON authenticated_settlement_candidates
      WHEN OLD.candidate_schema_version IS NOT NEW.candidate_schema_version
        OR OLD.candidate_id IS NOT NEW.candidate_id
        OR OLD.burn_id IS NOT NEW.burn_id
        OR OLD.burn_tx_hash IS NOT NEW.burn_tx_hash
        OR OLD.sidechain_id IS NOT NEW.sidechain_id
        OR OLD.sidechain_height IS NOT NEW.sidechain_height
        OR OLD.sidechain_block_hash IS NOT NEW.sidechain_block_hash
        OR OLD.sidechain_log_index IS NOT NEW.sidechain_log_index
        OR OLD.tracker_key IS NOT NEW.tracker_key
        OR OLD.tracker_value IS NOT NEW.tracker_value
        OR OLD.tracker_box_id IS NOT NEW.tracker_box_id
        OR OLD.anchor_header_id IS NOT NEW.anchor_header_id
        OR OLD.anchor_header_height IS NOT NEW.anchor_header_height
        OR OLD.dup_input_box_id IS NOT NEW.dup_input_box_id
        OR OLD.dup_input_digest IS NOT NEW.dup_input_digest
        OR OLD.vault_box_id IS NOT NEW.vault_box_id
        OR OLD.unsigned_tx_digest IS NOT NEW.unsigned_tx_digest
        OR OLD.creation_height IS NOT NEW.creation_height
        OR OLD.observed_sidechain_tip IS NOT NEW.observed_sidechain_tip
        OR OLD.observed_ergo_tip IS NOT NEW.observed_ergo_tip
        OR OLD.status IS NOT NEW.status
        OR OLD.recovery_schema IS NOT NEW.recovery_schema
        OR OLD.recovery_sidechain_consensus_digest IS NOT NEW.recovery_sidechain_consensus_digest
        OR OLD.recovery_admission_digest IS NOT NEW.recovery_admission_digest
        OR OLD.recovery_sidechain_tip_hash IS NOT NEW.recovery_sidechain_tip_hash
        OR OLD.recovery_sidechain_source_count IS NOT NEW.recovery_sidechain_source_count
        OR OLD.check_expected_tx_id IS NOT NEW.check_expected_tx_id
        OR OLD.check_unsigned_package_digest IS NOT NEW.check_unsigned_package_digest
        OR OLD.check_signed_transaction_digest IS NOT NEW.check_signed_transaction_digest
        OR OLD.check_response_digest IS NOT NEW.check_response_digest
        OR OLD.check_signer_context_digest IS NOT NEW.check_signer_context_digest
        OR OLD.check_checker_identity_digest IS NOT NEW.check_checker_identity_digest
        OR OLD.check_revalidation_digest IS NOT NEW.check_revalidation_digest
        OR OLD.check_native_verification_request_digest IS NOT NEW.check_native_verification_request_digest
        OR OLD.check_trust_anchor_digest IS NOT NEW.check_trust_anchor_digest
        OR OLD.check_finality_horizon_hash IS NOT NEW.check_finality_horizon_hash
        OR OLD.check_finality_horizon_height IS NOT NEW.check_finality_horizon_height
        OR OLD.check_finality_statement_digest IS NOT NEW.check_finality_statement_digest
        OR OLD.check_finality_program_id IS NOT NEW.check_finality_program_id
        OR OLD.check_finality_proof_system_id IS NOT NEW.check_finality_proof_system_id
        OR OLD.check_finality_verifier_profile_id IS NOT NEW.check_finality_verifier_profile_id
        OR OLD.check_finality_proof_payload_digest IS NOT NEW.check_finality_proof_payload_digest
        OR OLD.check_finality_proof_digest IS NOT NEW.check_finality_proof_digest
        OR OLD.check_stable_ergo_view_digest IS NOT NEW.check_stable_ergo_view_digest
        OR OLD.check_stable_sidechain_view_digest IS NOT NEW.check_stable_sidechain_view_digest
        OR OLD.check_admission_digest IS NOT NEW.check_admission_digest
        OR OLD.invalidation_reason IS NOT NEW.invalidation_reason
      BEGIN
        UPDATE authenticated_settlement_execution_reservations
        SET status = 'revoked',
            revocation_reason = 'candidate lifecycle or binding changed',
            updated_at = datetime('now')
        WHERE status = 'active'
          AND candidate_id IN (OLD.candidate_id, NEW.candidate_id);
      END;

      CREATE TRIGGER IF NOT EXISTS authenticated_execution_reservation_candidate_delete
      AFTER DELETE ON authenticated_settlement_candidates
      BEGIN
        UPDATE authenticated_settlement_execution_reservations
        SET status = 'revoked',
            revocation_reason = 'candidate was removed',
            updated_at = datetime('now')
        WHERE candidate_id = OLD.candidate_id AND status = 'active';
      END;

      CREATE TRIGGER IF NOT EXISTS authenticated_execution_reservation_peg_out_drift
      AFTER UPDATE ON peg_out_events
      WHEN (
          OLD.status IS NOT NEW.status
          AND NOT (OLD.status = 'detected' AND NEW.status = 'confirmed')
        )
        OR OLD.burn_id IS NOT NEW.burn_id
        OR OLD.sidechain_burn_tx_hash IS NOT NEW.sidechain_burn_tx_hash
        OR OLD.amount_nanoerg IS NOT NEW.amount_nanoerg
        OR OLD.ergo_recipient_address IS NOT NEW.ergo_recipient_address
        OR OLD.sidechain_burn_height IS NOT NEW.sidechain_burn_height
        OR OLD.user IS NOT NEW.user
        OR OLD.sidechain_block_hash IS NOT NEW.sidechain_block_hash
        OR OLD.sidechain_log_index IS NOT NEW.sidechain_log_index
        OR OLD.sidechain_id IS NOT NEW.sidechain_id
        OR OLD.phase1_box_id IS NOT NEW.phase1_box_id
        OR OLD.phase2_unlock_tx_id IS NOT NEW.phase2_unlock_tx_id
        OR OLD.avl_proof_hex IS NOT NEW.avl_proof_hex
        OR OLD.pending_avl_key IS NOT NEW.pending_avl_key
        OR OLD.ergo_anchor_height IS NOT NEW.ergo_anchor_height
      BEGIN
        UPDATE authenticated_settlement_execution_reservations
        SET status = 'revoked',
            revocation_reason = 'peg-out lifecycle or binding changed',
            updated_at = datetime('now')
        WHERE status = 'active'
          AND (
            burn_id = lower(COALESCE(OLD.burn_id, ''))
            OR
            burn_id = lower(COALESCE(NEW.burn_id, ''))
            OR burn_tx_hash = lower(
              CASE
                WHEN substr(OLD.sidechain_burn_tx_hash, 1, 2) = '0x'
                  THEN substr(OLD.sidechain_burn_tx_hash, 3)
                ELSE OLD.sidechain_burn_tx_hash
              END
            )
            OR burn_tx_hash = lower(
              CASE
                WHEN substr(NEW.sidechain_burn_tx_hash, 1, 2) = '0x'
                  THEN substr(NEW.sidechain_burn_tx_hash, 3)
                ELSE NEW.sidechain_burn_tx_hash
              END
            )
          );
      END;

      CREATE TRIGGER IF NOT EXISTS authenticated_execution_reservation_peg_out_delete
      AFTER DELETE ON peg_out_events
      BEGIN
        UPDATE authenticated_settlement_execution_reservations
        SET status = 'revoked',
            revocation_reason = 'peg-out was removed',
            updated_at = datetime('now')
        WHERE status = 'active'
          AND (
            burn_id = lower(COALESCE(OLD.burn_id, ''))
            OR burn_tx_hash = lower(
              CASE
                WHEN substr(OLD.sidechain_burn_tx_hash, 1, 2) = '0x'
                  THEN substr(OLD.sidechain_burn_tx_hash, 3)
                ELSE OLD.sidechain_burn_tx_hash
              END
            )
          );
      END;

      CREATE TRIGGER IF NOT EXISTS authenticated_submission_attempt_reservation_revoked
      AFTER UPDATE OF status ON authenticated_settlement_execution_reservations
      WHEN OLD.status <> 'revoked' AND NEW.status = 'revoked'
      BEGIN
        UPDATE authenticated_settlement_submission_attempts
        SET status = 'quarantined',
            quarantine_reason = 'execution_reservation_revoked',
            updated_at = datetime('now')
        WHERE execution_reservation_digest = NEW.reservation_digest
          AND status <> 'quarantined';
      END;

      CREATE TRIGGER IF NOT EXISTS authenticated_submission_attempt_reservation_deleted
      AFTER DELETE ON authenticated_settlement_execution_reservations
      BEGIN
        UPDATE authenticated_settlement_submission_attempts
        SET status = 'quarantined',
            quarantine_reason = 'execution_reservation_revoked',
            updated_at = datetime('now')
        WHERE execution_reservation_digest = OLD.reservation_digest
          AND status <> 'quarantined';
      END;
      `);
    });
    install.immediate();
  }

  private migrateAggregateSettlementRecoverySchema(): void {
    const columns = [
      'abandonment_reason TEXT',
      'lifecycle_version INTEGER NOT NULL DEFAULT 0',
      'transport_reservation_digest TEXT',
      'funds_release_authority_epoch TEXT',
      'transport_started_at TEXT',
      'transport_completed_at TEXT',
      "recovery_binding_status TEXT NOT NULL DEFAULT 'legacy_unbound'",
      'recovery_policy_version INTEGER',
      'recovery_required_confirmations INTEGER',
      'ergo_observation_policy_version INTEGER',
      'ergo_observation_required_confirmations INTEGER',
      'ergo_observation_status TEXT',
      'ergo_observation_transaction_digest TEXT',
      'ergo_observation_inclusion_height INTEGER',
      'ergo_observation_inclusion_header_id TEXT',
      'ergo_observation_tip_height INTEGER',
      'ergo_observation_tip_header_id TEXT',
      'ergo_observation_confirmations INTEGER',
      'ergo_observation_digest TEXT',
      'ergo_observation_source_count INTEGER NOT NULL DEFAULT 0',
      'ergo_observation_consensus_digest TEXT',
      'recovery_quarantine_reason TEXT',
      'recovery_quarantine_policy_version INTEGER',
      'recovery_quarantine_required_confirmations INTEGER',
      'recovery_quarantine_status TEXT',
      'recovery_quarantine_transaction_digest TEXT',
      'recovery_quarantine_inclusion_height INTEGER',
      'recovery_quarantine_inclusion_header_id TEXT',
      'recovery_quarantine_tip_height INTEGER',
      'recovery_quarantine_tip_header_id TEXT',
      'recovery_quarantine_confirmations INTEGER',
      'recovery_quarantine_observation_digest TEXT',
      'recovery_quarantine_source_count INTEGER',
      'recovery_quarantine_consensus_digest TEXT',
    ];
    for (const column of columns) {
      try {
        this.db.exec(`ALTER TABLE aggregate_settlement_attempts ADD COLUMN ${column}`);
      } catch {
        // Column already exists -- safe to ignore.
      }
    }
    this.db.exec(`
      UPDATE aggregate_settlement_attempts
      SET abandonment_reason = 'legacy_unclassified'
      WHERE status = 'abandoned' AND abandonment_reason IS NULL;
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS aggregate_settlement_transport_reservation_digest_unique
      ON aggregate_settlement_attempts(transport_reservation_digest)
      WHERE transport_reservation_digest IS NOT NULL;
    `);
  }

  private migrateAggregateSettlementRecoveryObservationSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aggregate_settlement_recovery_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expected_tx_id TEXT NOT NULL,
        lifecycle_version INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        source_authority_profile TEXT NOT NULL DEFAULT 'legacy-origin-only-v1',
        observation_policy_version INTEGER NOT NULL,
        observation_required_confirmations INTEGER NOT NULL,
        observation_status TEXT NOT NULL,
        observation_transaction_digest TEXT,
        observation_inclusion_height INTEGER,
        observation_inclusion_header_id TEXT,
        observation_tip_height INTEGER NOT NULL,
        observation_tip_header_id TEXT NOT NULL,
        observation_confirmations INTEGER NOT NULL,
        observation_digest TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        consensus_digest TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        CHECK (purpose IN ('abandonment_absence')),
        UNIQUE(expected_tx_id, lifecycle_version, purpose, observation_digest, consensus_digest)
      );
    `);
    try {
      this.db.exec(`
        ALTER TABLE aggregate_settlement_recovery_observations
        ADD COLUMN source_authority_profile TEXT NOT NULL DEFAULT 'legacy-origin-only-v1'
      `);
    } catch {
      // Column already exists -- safe to ignore.
    }
  }

  private migrateAuthenticatedSettlementCheckSchema(): void {
    const existingColumns = this.db.prepare(`
      PRAGMA table_info(authenticated_settlement_candidates)
    `).all() as Array<{ name: string }>;
    const durableRecoveryColumns = [
      'recovery_schema',
      'recovery_sidechain_consensus_digest',
      'recovery_admission_digest',
      'recovery_sidechain_tip_hash',
      'recovery_sidechain_source_count',
    ];
    const hadDurableRecoveryColumns = durableRecoveryColumns.every(
      name => existingColumns.some(column => column.name === name),
    );
    const recoveryMigrationCompleted = this.db.prepare(`
      SELECT migration_id
      FROM state_tracker_migrations
      WHERE migration_id = ?
    `).get(AUTHENTICATED_V2_RECOVERY_PROVENANCE_MIGRATION) !== undefined;
    if (recoveryMigrationCompleted && !hadDurableRecoveryColumns) {
      throw new Error(
        'authenticated V2 recovery provenance migration marker conflicts with the candidate schema',
      );
    }

    try {
      this.db.exec(`ALTER TABLE authenticated_settlement_candidates ADD COLUMN creation_height INTEGER`);
    } catch {
      // Column already exists -- safe to ignore
    }

    const nullableColumns = [
      'candidate_schema_version INTEGER',
      'check_unsigned_package_digest TEXT',
      'check_signed_transaction_digest TEXT',
      'check_signer_context_digest TEXT',
      'check_checker_identity_digest TEXT',
      'check_revalidation_digest TEXT',
      'check_native_verification_request_digest TEXT',
      'check_trust_anchor_digest TEXT',
      'check_finality_horizon_hash TEXT',
      'check_finality_horizon_height TEXT',
      'check_finality_statement_digest TEXT',
      'check_finality_program_id TEXT',
      'check_finality_proof_system_id INTEGER',
      'check_finality_verifier_profile_id TEXT',
      'check_finality_proof_payload_digest TEXT',
      'check_finality_proof_digest TEXT',
      'check_stable_ergo_view_digest TEXT',
      'check_stable_sidechain_view_digest TEXT',
      'check_admission_digest TEXT',
      'recovery_schema TEXT',
      'recovery_sidechain_consensus_digest TEXT',
      'recovery_admission_digest TEXT',
      'recovery_sidechain_tip_hash TEXT',
      'recovery_sidechain_source_count INTEGER',
    ];
    for (const column of nullableColumns) {
      try {
        this.db.exec(`ALTER TABLE authenticated_settlement_candidates ADD COLUMN ${column}`);
      } catch {
        // Column already exists -- safe to ignore
      }
    }
    for (const column of [
      'signer_context_digest TEXT',
      'checker_identity_digest TEXT',
    ]) {
      try {
        this.db.exec(
          `ALTER TABLE authenticated_settlement_execution_reservations ADD COLUMN ${column}`,
        );
      } catch {
        // Column already exists -- safe to ignore
      }
    }

    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET creation_height = observed_ergo_tip,
          status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'candidate predates explicit transaction creation-height binding'
          ),
          updated_at = datetime('now')
      WHERE creation_height IS NULL
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'candidate predates explicit candidate schema version binding'
          ),
          updated_at = datetime('now')
      WHERE status IN ('prepared', 'check_passed')
        AND (
          candidate_schema_version IS NULL
          OR candidate_schema_version != ${AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION}
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'checked candidate predates signer and checker identity binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'check_passed'
        AND (
          check_signer_context_digest IS NULL
          OR length(check_signer_context_digest) <> 64
          OR check_signer_context_digest GLOB '*[^0-9a-f]*'
          OR check_checker_identity_digest IS NULL
          OR length(check_checker_identity_digest) <> 64
          OR check_checker_identity_digest GLOB '*[^0-9a-f]*'
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_execution_reservations
      SET status = 'revoked',
          revocation_reason = COALESCE(
            revocation_reason,
            'reservation predates signer and checker identity binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'active'
        AND (
          schema <> '${AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA}'
          OR signer_context_digest IS NULL
          OR length(signer_context_digest) <> 64
          OR signer_context_digest GLOB '*[^0-9a-f]*'
          OR checker_identity_digest IS NULL
          OR length(checker_identity_digest) <> 64
          OR checker_identity_digest GLOB '*[^0-9a-f]*'
        )
    `);
    if (!recoveryMigrationCompleted) {
      const completeRecoveryMigration = this.db.transaction(() => {
        this.db.exec(`
        UPDATE authenticated_settlement_candidates
        SET status = 'invalidated',
            invalidation_reason = COALESCE(
              invalidation_reason,
              'prepared candidate predates durable package-recovery provenance binding'
            ),
            updated_at = datetime('now')
        WHERE status = 'prepared'
        `);
        this.db.prepare(`
          INSERT INTO state_tracker_migrations (migration_id) VALUES (?)
        `).run(AUTHENTICATED_V2_RECOVERY_PROVENANCE_MIGRATION);
      });
      completeRecoveryMigration.immediate();
    }
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'prepared candidate has incomplete package-recovery provenance binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'prepared'
        AND (
          recovery_schema IS NOT NULL
          OR recovery_sidechain_consensus_digest IS NOT NULL
          OR recovery_admission_digest IS NOT NULL
          OR recovery_sidechain_tip_hash IS NOT NULL
          OR recovery_sidechain_source_count IS NOT NULL
        )
        AND (
          recovery_schema IS NULL
          OR recovery_schema <> '${AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA}'
          OR recovery_sidechain_consensus_digest IS NULL
          OR length(recovery_sidechain_consensus_digest) <> 64
          OR recovery_sidechain_consensus_digest GLOB '*[^0-9a-f]*'
          OR recovery_admission_digest IS NULL
          OR length(recovery_admission_digest) <> 64
          OR recovery_admission_digest GLOB '*[^0-9a-f]*'
          OR recovery_sidechain_tip_hash IS NULL
          OR length(recovery_sidechain_tip_hash) <> 64
          OR recovery_sidechain_tip_hash GLOB '*[^0-9a-f]*'
          OR recovery_sidechain_source_count IS NULL
          OR recovery_sidechain_source_count < 2
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'checked candidate predates stable-view admission binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'check_passed'
        AND (
          check_stable_ergo_view_digest IS NULL
          OR length(check_stable_ergo_view_digest) <> 64
          OR check_stable_ergo_view_digest GLOB '*[^0-9a-f]*'
          OR check_stable_sidechain_view_digest IS NULL
          OR length(check_stable_sidechain_view_digest) <> 64
          OR check_stable_sidechain_view_digest GLOB '*[^0-9a-f]*'
          OR check_admission_digest IS NULL
          OR length(check_admission_digest) <> 64
          OR check_admission_digest GLOB '*[^0-9a-f]*'
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'checked candidate predates exact signed transaction digest binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'check_passed'
        AND (
          check_signed_transaction_digest IS NULL
          OR length(check_signed_transaction_digest) <> 64
          OR check_signed_transaction_digest GLOB '*[^0-9a-f]*'
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'checked candidate lacks a canonical unsigned package binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'check_passed'
        AND (
          check_unsigned_package_digest IS NULL
          OR length(check_unsigned_package_digest) <> 64
          OR check_unsigned_package_digest GLOB '*[^0-9a-f]*'
        )
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET candidate_schema_version = 0
      WHERE candidate_schema_version IS NULL
    `);
    this.db.exec(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = COALESCE(
            invalidation_reason,
            'checked candidate predates canonical finality proof identity binding'
          ),
          updated_at = datetime('now')
      WHERE status = 'check_passed'
        AND (
          check_finality_statement_digest IS NULL
          OR check_finality_program_id IS NULL
          OR check_finality_proof_system_id IS NULL
          OR check_finality_verifier_profile_id IS NULL
          OR check_finality_proof_payload_digest IS NULL
          OR check_finality_proof_digest IS NULL
        )
    `);
  }

  private migratePegOutEventIdentitySchema(): void {
    const table = this.db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'peg_out_events'
    `).get() as { sql: string } | undefined;
    if (!table) throw new Error('peg_out_events migration requires an existing table');

    if (/sidechain_burn_tx_hash\s+TEXT\s+UNIQUE/i.test(table.sql)) {
      const migrationTable = 'peg_out_events_event_identity_migration';
      const stale = this.db.prepare(`
        SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
      `).get(migrationTable);
      if (stale) {
        throw new Error(`${migrationTable} already exists; refusing an ambiguous peg-out migration`);
      }
      const migrate = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE ${migrationTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sidechain_burn_tx_hash TEXT NOT NULL,
            sidechain_id TEXT,
            burn_id TEXT,
            ergo_recipient_address TEXT NOT NULL,
            amount_nanoerg TEXT NOT NULL,
            sidechain_burn_height INTEGER NOT NULL,
            user TEXT,
            sidechain_block_hash TEXT,
            sidechain_log_index INTEGER,
            status TEXT NOT NULL DEFAULT 'detected',
            phase1_box_id TEXT,
            phase2_unlock_tx_id TEXT,
            avl_proof_hex TEXT,
            pending_avl_key TEXT,
            ergo_anchor_height INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          );
          INSERT INTO ${migrationTable} (
            id,
            sidechain_burn_tx_hash,
            sidechain_id,
            burn_id,
            ergo_recipient_address,
            amount_nanoerg,
            sidechain_burn_height,
            user,
            sidechain_block_hash,
            sidechain_log_index,
            status,
            phase1_box_id,
            phase2_unlock_tx_id,
            avl_proof_hex,
            pending_avl_key,
            ergo_anchor_height,
            created_at,
            updated_at
          )
          SELECT
            id,
            sidechain_burn_tx_hash,
            sidechain_id,
            burn_id,
            ergo_recipient_address,
            amount_nanoerg,
            sidechain_burn_height,
            user,
            sidechain_block_hash,
            sidechain_log_index,
            status,
            phase1_box_id,
            phase2_unlock_tx_id,
            avl_proof_hex,
            pending_avl_key,
            ergo_anchor_height,
            created_at,
            updated_at
          FROM peg_out_events;
          DROP TABLE peg_out_events;
          ALTER TABLE ${migrationTable} RENAME TO peg_out_events;
        `);
      });
      migrate();
    }

    this.db.exec(`
      DROP INDEX IF EXISTS peg_out_events_normalized_burn_tx_hash;

      CREATE UNIQUE INDEX IF NOT EXISTS peg_out_events_event_coordinate
      ON peg_out_events (
        lower(
          CASE
            WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
              THEN substr(sidechain_burn_tx_hash, 3)
            ELSE sidechain_burn_tx_hash
          END
        ),
        sidechain_log_index
      )
      WHERE sidechain_log_index IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS peg_out_events_legacy_tx_hash
      ON peg_out_events (
        lower(
          CASE
            WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
              THEN substr(sidechain_burn_tx_hash, 3)
            ELSE sidechain_burn_tx_hash
          END
        )
      )
      WHERE sidechain_log_index IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS peg_out_events_burn_id
      ON peg_out_events (lower(burn_id))
      WHERE burn_id IS NOT NULL;
    `);
  }

  private migrateAuthenticatedSettlementCandidateBurnIds(): void {
    try {
      this.db.exec(`ALTER TABLE authenticated_settlement_candidates ADD COLUMN burn_id TEXT`);
    } catch {
      // Column already exists -- safe to ignore
    }

    const rows = this.db.prepare(`
      SELECT id, sidechain_id, burn_tx_hash, sidechain_log_index
      FROM authenticated_settlement_candidates
      WHERE burn_id IS NULL
      ORDER BY id ASC
    `).all() as Array<{
      id: number;
      sidechain_id: string;
      burn_tx_hash: string;
      sidechain_log_index: number;
    }>;
    const migrate = this.db.transaction(() => {
      for (const row of rows) {
        const sidechainId = normalizeFixedHex(row.sidechain_id, 32, 'candidate migration sidechainId');
        const burnTxHash = normalizeBurnTxHash(row.burn_tx_hash);
        const sidechainLogIndex = normalizeUint32(
          row.sidechain_log_index,
          'candidate migration sidechainLogIndex',
        );
        const burnId = deriveTrustlessBurnIdHex({
          sidechainIdHex: sidechainId,
          sidechainTxHashHex: burnTxHash,
          eventIndex: sidechainLogIndex,
        });
        const pegOutRows = this.db.prepare(`
          SELECT id, sidechain_id, burn_id
          FROM peg_out_events
          WHERE lower(
            CASE
              WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
                THEN substr(sidechain_burn_tx_hash, 3)
              ELSE sidechain_burn_tx_hash
            END
          ) = ? AND sidechain_log_index = ?
        `).all(burnTxHash, sidechainLogIndex) as Array<{
          id: number;
          sidechain_id: string | null;
          burn_id: string | null;
        }>;
        if (pegOutRows.length !== 1) {
          throw new Error(`candidate migration cannot resolve exact peg-out event ${burnTxHash}:${sidechainLogIndex}`);
        }
        const pegOut = pegOutRows[0];
        if (pegOut.sidechain_id !== null && normalizeFixedHex(
          pegOut.sidechain_id,
          32,
          'persisted peg-out sidechainId',
        ) !== sidechainId) {
          throw new Error('candidate migration found a conflicting persisted peg-out sidechainId');
        }
        if (pegOut.burn_id !== null && normalizeBurnId(pegOut.burn_id) !== burnId) {
          throw new Error('candidate migration found a conflicting persisted peg-out burnId');
        }
        this.db.prepare(`
          UPDATE peg_out_events
          SET sidechain_id = ?, burn_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(sidechainId, burnId, pegOut.id);
        this.db.prepare(`
          UPDATE authenticated_settlement_candidates SET burn_id = ? WHERE id = ?
        `).run(burnId, row.id);
      }
    });
    migrate();

    this.db.exec(`
      DROP INDEX IF EXISTS authenticated_candidate_active_burn;

      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_candidate_active_burn
      ON authenticated_settlement_candidates (burn_id)
      WHERE status IN ('prepared', 'check_passed');

      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_candidate_active_dup
      ON authenticated_settlement_candidates (dup_input_box_id)
      WHERE status IN ('prepared', 'check_passed');

      CREATE UNIQUE INDEX IF NOT EXISTS authenticated_candidate_active_vault
      ON authenticated_settlement_candidates (vault_box_id)
      WHERE status IN ('prepared', 'check_passed');
    `);
  }

  private resolvePegOutRow(
    lookup: PegOutEventLookup,
    action: string,
    required: boolean,
  ): any | undefined {
    let rows: any[];
    let label: string;
    if (typeof lookup === 'string') {
      const burnTxHash = normalizeBurnTxHash(lookup);
      label = burnTxHash;
      rows = this.db.prepare(`
        SELECT * FROM peg_out_events
        WHERE lower(
          CASE
            WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
              THEN substr(sidechain_burn_tx_hash, 3)
            ELSE sidechain_burn_tx_hash
          END
        ) = ?
        ORDER BY id ASC
      `).all(burnTxHash);
      if (rows.length > 1) {
        throw new Error(
          `Cannot ${action}: peg-out transaction ${burnTxHash} is ambiguous; burn event identity is required`,
        );
      }
    } else if ('burnId' in lookup) {
      const burnId = normalizeBurnId(lookup.burnId);
      label = burnId;
      rows = this.db.prepare(`
        SELECT * FROM peg_out_events WHERE lower(burn_id) = ? ORDER BY id ASC
      `).all(burnId);
    } else {
      const burnTxHash = normalizeBurnTxHash(lookup.burnTxHash);
      const sidechainLogIndex = normalizeUint32(
        lookup.sidechainLogIndex,
        'sidechainLogIndex',
      );
      label = `${burnTxHash}:${sidechainLogIndex}`;
      rows = this.db.prepare(`
        SELECT * FROM peg_out_events
        WHERE lower(
          CASE
            WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
              THEN substr(sidechain_burn_tx_hash, 3)
            ELSE sidechain_burn_tx_hash
          END
        ) = ? AND sidechain_log_index = ?
        ORDER BY id ASC
      `).all(burnTxHash, sidechainLogIndex);
    }
    if (rows.length > 1) {
      throw new Error(`Cannot ${action}: peg-out identity ${label} resolves to multiple rows`);
    }
    if (rows.length === 0 && required) {
      throw new Error(`Cannot ${action}: peg-out ${label} does not exist`);
    }
    return rows[0];
  }

  private requirePegOut(lookup: PegOutEventLookup, action: string): any {
    return this.resolvePegOutRow(lookup, action, true);
  }

  private assertWritable(action: string): void {
    if (this.isReadOnly) {
      throw new Error(`Cannot ${action}: StateTracker is open in read-only mode`);
    }
    if (
      this.fundsExecutionLockPath !== null
      && existsSync(this.fundsExecutionLockPath)
      && this.fundsExecutionAuthority === null
    ) {
      throw new Error(
        `Cannot ${action}: another process holds funds execution authority`,
      );
    }
  }

  // --- Peg-In Events -----------------------------------------

  insertPegIn(
    boxId: string,
    targetEvm: string,
    amount: bigint,
    height: number,
    sourceClassification: PegInSourceClassification = 'unknown',
    depositorErgoTreeHex: string | null = null,
  ): void {
    this.assertWritable('insert peg-in');
    this.db.prepare(`
      INSERT OR IGNORE INTO peg_in_events
        (
          ergo_lock_box_id, target_evm_address, amount_nanoerg,
          ergo_lock_height, source_classification, depositor_ergo_tree_hex
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      boxId,
      targetEvm,
      amount.toString(),
      height,
      sourceClassification,
      depositorErgoTreeHex,
    );
  }

  getPendingPegIns(): PegInEvent[] {
    const rows = this.db.prepare(`
      SELECT p.*
      FROM peg_in_events p
      LEFT JOIN peg_in_reconciliation_state r ON r.peg_in_id = p.id
      WHERE p.status IN ('detected', 'confirmed', 'consume_submitted', 'consume_confirmed', 'minting')
        AND r.peg_in_id IS NULL
      ORDER BY p.ergo_lock_height ASC
    `).all();
    return rows.map(mapPegInEventRow);
  }

  hasPegInRuntimeReconciliationLifecycleRows(): boolean {
    const row = this.db.prepare(`
      SELECT EXISTS(
        SELECT 1
        FROM peg_in_events
        WHERE status IN ('detected', 'confirmed', 'consume_submitted', 'consume_confirmed', 'minting')
      ) AS present
    `).get() as { present: number };
    return row.present === 1;
  }

  getPegInRuntimeReconciliationCandidates(
    joinedReconstructionDigestHex: string,
    maxRows = 50,
  ): PegInRuntimeReconciliationCandidatePage {
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1_000) {
      throw new Error('peg-in runtime reconciliation max rows must be between 1 and 1000');
    }
    const normalizedJoinedDigestHex = normalizeFixedHex(
      joinedReconstructionDigestHex,
      32,
      'peg-in runtime joined reconstruction digest',
    );
    const rows = this.db.prepare(`
      SELECT p.*
      FROM peg_in_events p
      LEFT JOIN peg_in_reconciliation_state r ON r.peg_in_id = p.id
      LEFT JOIN peg_in_reconciliation_journal j
        ON j.id = r.latest_journal_id AND j.peg_in_id = p.id
      WHERE p.status IN ('detected', 'confirmed', 'consume_submitted', 'consume_confirmed', 'minting')
        AND (
          r.peg_in_id IS NULL
          OR j.id IS NULL
          OR j.joined_reconstruction_digest <> ?
        )
      ORDER BY
        CASE WHEN r.peg_in_id IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN r.peg_in_id IS NULL THEN p.id ELSE r.latest_journal_id END ASC,
        p.id ASC
      LIMIT ?
    `).all(normalizedJoinedDigestHex, maxRows + 1);
    return {
      candidates: rows.slice(0, maxRows).map(mapPegInEventRow),
      remainingCandidates: rows.length > maxRows,
    };
  }

  /** Look up a peg-in by boxId regardless of status (for double-mint prevention) */
  getPegInByBoxId(boxId: string): PegInEvent | undefined {
    const row = this.db.prepare(`
      SELECT * FROM peg_in_events WHERE ergo_lock_box_id = ?
    `).get(boxId);
    return row ? mapPegInEventRow(row) : undefined;
  }

  getPegInLifecycleDigest(boxId: string): string | null {
    const event = this.getPegInByBoxId(normalizeFixedHex(
      boxId,
      32,
      'peg-in lifecycle digest box ID',
    ));
    return event ? pegInLifecycleDigestHex(event) : null;
  }

  getPegInReconciliationHold(boxId: string): PegInReconciliationObservation | null {
    const normalizedBoxId = normalizeFixedHex(
      boxId,
      32,
      'peg-in reconciliation hold box ID',
    );
    const row = this.db.prepare(`
      SELECT j.*
      FROM peg_in_reconciliation_state s
      JOIN peg_in_events p ON p.id = s.peg_in_id
      JOIN peg_in_reconciliation_journal j
        ON j.id = s.latest_journal_id AND j.peg_in_id = s.peg_in_id
      WHERE p.ergo_lock_box_id = ?
    `).get(normalizedBoxId);
    return row ? mapPegInReconciliationObservationRow(row) : null;
  }

  getPegInReconciliationJournal(boxId: string): PegInReconciliationObservation[] {
    const normalizedBoxId = normalizeFixedHex(
      boxId,
      32,
      'peg-in reconciliation journal box ID',
    );
    const rows = this.db.prepare(`
      SELECT j.*
      FROM peg_in_reconciliation_journal j
      JOIN peg_in_events p ON p.id = j.peg_in_id
      WHERE p.ergo_lock_box_id = ?
      ORDER BY j.id ASC
    `).all(normalizedBoxId);
    return rows.map(mapPegInReconciliationObservationRow);
  }

  recordPegInReconciliationFromJoinedCache(
    input: RecordPegInReconciliationInput,
  ): RecordPegInReconciliationResult {
    this.assertWritable('record joined peg-in reconciliation');
    const normalizedBoxId = normalizeFixedHex(
      input.ergoLockBoxId,
      32,
      'peg-in reconciliation box ID',
    );
    const expectedLifecycleDigestHex = normalizeFixedHex(
      input.expectedLifecycleDigestHex,
      32,
      'expected peg-in lifecycle digest',
    );
    const expectedJoinedReconstructionDigestHex = normalizeFixedHex(
      input.expectedJoinedReconstructionDigestHex,
      32,
      'expected joined peg-in reconstruction digest',
    );

    const recordObservation = this.db.transaction((): RecordPegInReconciliationResult => {
      const authorityBefore = pegInSettlementAuthorityState(this.db);
      const row = this.db.prepare(`
        SELECT * FROM peg_in_events WHERE ergo_lock_box_id = ?
      `).get(normalizedBoxId);
      if (!row) {
        throw new Error('joined peg-in reconciliation requires an existing lifecycle row');
      }
      const pegIn = mapPegInEventRow(row);
      const lifecycleDigestHex = pegInLifecycleDigestHex(pegIn);
      if (lifecycleDigestHex !== expectedLifecycleDigestHex) {
        throw new Error('peg-in lifecycle changed before joined reconciliation');
      }

      const joined = this.getPegInJoinedReconstructionSnapshot();
      if (joined === null) {
        throw new Error('joined peg-in reconciliation cache is unavailable');
      }
      if (
        joined.sidechain.reconstructionDigestHex
        !== expectedJoinedReconstructionDigestHex
      ) {
        throw new Error('joined peg-in reconstruction changed before reconciliation');
      }

      const decision = derivePegInReconciliationDecision(pegIn, joined.sidechain);
      const semantic: PegInReconciliationObservationSemantic = {
        schema: PEG_IN_RECONCILIATION_OBSERVATION_SCHEMA,
        pegInId: pegIn.id,
        ergoLockBoxId: normalizedBoxId,
        lifecycleStatus: pegIn.status,
        lifecycleDigestHex,
        joinedReconstructionDigestHex: joined.sidechain.reconstructionDigestHex,
        ergoRouteReconstructionDigestHex:
          joined.sidechain.ergoRouteReconstructionDigestHex,
        frontierViewDigestHex: joined.sidechain.frontierViewDigestHex,
        observedTip: joined.sidechain.observedTip,
        joinedEntryState: decision.entry?.state ?? null,
        joinedEventTransactionHashHex:
          decision.entry?.event?.transactionHashHex ?? null,
        disposition: decision.disposition,
        reason: decision.reason,
        observedAt: joined.sidechain.observedAt,
      };
      const observationDigestHex = pegInReconciliationObservationDigestHex(semantic);
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO peg_in_reconciliation_journal (
          schema, peg_in_id, ergo_lock_box_id, lifecycle_status,
          lifecycle_digest, joined_reconstruction_digest,
          ergo_route_reconstruction_digest, frontier_view_digest,
          observed_tip_height, observed_tip_id, joined_entry_state,
          joined_event_transaction_hash, disposition, reason, observed_at,
          observation_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        semantic.schema,
        semantic.pegInId,
        semantic.ergoLockBoxId,
        semantic.lifecycleStatus,
        semantic.lifecycleDigestHex,
        semantic.joinedReconstructionDigestHex,
        semantic.ergoRouteReconstructionDigestHex,
        semantic.frontierViewDigestHex,
        semantic.observedTip.height,
        semantic.observedTip.idHex,
        semantic.joinedEntryState,
        semantic.joinedEventTransactionHashHex,
        semantic.disposition,
        semantic.reason,
        semantic.observedAt,
        observationDigestHex,
      );
      const observationRow = this.db.prepare(`
        SELECT * FROM peg_in_reconciliation_journal
        WHERE observation_digest = ?
      `).get(observationDigestHex);
      if (!observationRow) {
        throw new Error('peg-in reconciliation journal insert was not retained');
      }
      const observation = mapPegInReconciliationObservationRow(observationRow);
      if (
        observation.pegInId !== pegIn.id
        || observation.ergoLockBoxId !== normalizedBoxId
      ) {
        throw new Error('peg-in reconciliation digest resolves to another lifecycle row');
      }

      this.db.prepare(`
        INSERT INTO peg_in_reconciliation_state (peg_in_id, latest_journal_id)
        VALUES (?, ?)
        ON CONFLICT(peg_in_id) DO UPDATE SET
          latest_journal_id = excluded.latest_journal_id
        WHERE excluded.latest_journal_id > peg_in_reconciliation_state.latest_journal_id
      `).run(pegIn.id, observation.id);
      const current = this.getPegInReconciliationHold(normalizedBoxId);
      if (current?.id !== observation.id) {
        throw new Error('peg-in reconciliation hold did not retain the current observation');
      }

      const authorityAfter = pegInSettlementAuthorityState(this.db);
      if (authorityAfter !== authorityBefore) {
        throw new Error('peg-in reconciliation changed lifecycle authority');
      }
      return {
        appended: inserted.changes === 1,
        observation,
        lifecycleRowsCreatedOrChanged: 0,
        settlementAuthorityRowsCreatedOrChanged: 0,
      };
    });
    return recordObservation.immediate();
  }

  getPooledReserveMintReservationRecoveryHoldV4(
    reservationKeyHex: string,
  ): PooledReserveMintReservationRecoveryObservationV4 | null {
    const reservationKey = normalizePrefixedFixedHex(
      reservationKeyHex,
      32,
      'pooled-reserve mint-reservation key',
    );
    const row = this.db.prepare(`
      SELECT j.*
      FROM pooled_reserve_mint_reservation_holds_v4 h
      JOIN pooled_reserve_mint_reservation_observation_journal_v4 j
        ON j.id = h.latest_journal_id
       AND j.reservation_key = h.reservation_key
      WHERE h.reservation_key = ?
    `).get(reservationKey);
    return row
      ? mapPooledReserveMintReservationRecoveryObservationV4Row(row)
      : null;
  }

  getPooledReserveMintReservationRecoveryJournalV4(
    reservationKeyHex: string,
  ): PooledReserveMintReservationRecoveryObservationV4[] {
    const reservationKey = normalizePrefixedFixedHex(
      reservationKeyHex,
      32,
      'pooled-reserve mint-reservation key',
    );
    const rows = this.db.prepare(`
      SELECT *
      FROM pooled_reserve_mint_reservation_observation_journal_v4
      WHERE reservation_key = ?
      ORDER BY id ASC
    `).all(reservationKey);
    return rows.map(
      mapPooledReserveMintReservationRecoveryObservationV4Row,
    );
  }

  persistPooledReserveMintReservationRecoveryObservationV4(
    input: PersistPooledReserveMintReservationRecoveryObservationV4Input,
  ): PersistPooledReserveMintReservationRecoveryObservationV4Result {
    this.assertWritable(
      'persist pooled-reserve mint-reservation recovery observation V4',
    );
    const semantic =
      normalizePooledReserveMintReservationRecoverySemanticV4(input.semantic);
    const observedAt = normalizeCanonicalIsoTimestamp(
      input.observedAt,
      'pooled-reserve mint-reservation observation time',
    );
    const observationDigestHex =
      pooledReserveMintReservationRecoveryObservationDigestHexV4(semantic);

    const persist = this.db.transaction(
      (): PersistPooledReserveMintReservationRecoveryObservationV4Result => {
        const authorityBefore = pegInSettlementAuthorityState(this.db);
        const existingRow = this.db.prepare(`
          SELECT *
          FROM pooled_reserve_mint_reservation_observation_journal_v4
          WHERE observation_digest = ?
        `).get(observationDigestHex);
        if (existingRow) {
          const observation =
            mapPooledReserveMintReservationRecoveryObservationV4Row(existingRow);
          if (canonicalJson(observationSemanticV4(observation)) !== canonicalJson(semantic)) {
            throw new Error(
              'pooled-reserve mint-reservation observation digest conflicts with persisted state',
            );
          }
          const hold =
            this.getPooledReserveMintReservationRecoveryHoldV4(
              semantic.reservation.reservationKeyHex,
            );
          if (hold === null) {
            throw new Error(
              'pooled-reserve mint-reservation journal exists without its fail-closed hold',
            );
          }
          if (
            hold.id !== observation.id
            || hold.observationDigestHex
              !== observation.observationDigestHex
          ) {
            throw new Error(
              'pooled-reserve mint-reservation recovery rejected a stale journal replay',
            );
          }
          if (
            input.finalityContinuity !== undefined
            && input.finalityContinuity !== null
          ) {
            throw new Error(
              'pooled-reserve mint-reservation duplicate observation cannot carry finality continuity',
            );
          }
          assertUnchangedPegInSettlementAuthority(
            authorityBefore,
            pegInSettlementAuthorityState(this.db),
          );
          return {
            appended: false,
            observation,
            hold,
            pegInLifecycleRowsCreatedOrChanged: 0,
            settlementAuthorityRowsCreatedOrChanged: 0,
          };
        }

        const current =
          this.getPooledReserveMintReservationRecoveryHoldV4(
            semantic.reservation.reservationKeyHex,
          );
        if (current !== null) {
          assertPooledReserveMintReservationRecoveryIdentityV4(
            current,
            semantic,
          );
          assertPooledReserveMintReservationRecoveryTransitionV4(
            current,
            semantic,
            input.finalityContinuity ?? null,
          );
        } else if (input.finalityContinuity !== undefined
          && input.finalityContinuity !== null) {
          throw new Error(
            'pooled-reserve mint-reservation initial observation cannot carry finality continuity',
          );
        }

        const inserted = this.db.prepare(`
          INSERT INTO pooled_reserve_mint_reservation_observation_journal_v4 (
            schema,
            reservation_key,
            statement_id,
            admission_candidate_digest,
            profile_id,
            lifecycle_status,
            lifecycle_record_scale_hex,
            expires_at_height,
            classification,
            request_digest,
            trust_anchor_digest,
            target_native_block_hash,
            target_native_height,
            target_state_root,
            finality_horizon_hash,
            finality_horizon_height,
            bridge_runtime_code_sha256,
            bridge_runtime_code_bytes,
            observed_at,
            observation_digest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          semantic.schema,
          semantic.reservation.reservationKeyHex,
          semantic.reservation.statementIdHex,
          semantic.reservation.admissionCandidateDigestHex,
          semantic.reservation.profileIdHex,
          semantic.reservation.lifecycleStatus,
          semantic.reservation.lifecycleRecordScaleHex,
          semantic.reservation.expiresAtHeight,
          semantic.classification,
          semantic.source.requestDigestHex,
          semantic.source.trustAnchorDigestHex,
          semantic.source.targetNativeBlockHashHex,
          semantic.source.targetNativeHeight,
          semantic.source.targetStateRootHex,
          semantic.source.finalityHorizonHashHex,
          semantic.source.finalityHorizonHeight,
          semantic.source.bridgeRuntimeCodeSha256Hex,
          semantic.source.bridgeRuntimeCodeBytes,
          observedAt,
          observationDigestHex,
        );
        const observationRow = this.db.prepare(`
          SELECT *
          FROM pooled_reserve_mint_reservation_observation_journal_v4
          WHERE id = ?
        `).get(inserted.lastInsertRowid);
        if (!observationRow) {
          throw new Error(
            'pooled-reserve mint-reservation observation was not persisted',
          );
        }
        const observation =
          mapPooledReserveMintReservationRecoveryObservationV4Row(
            observationRow,
          );
        this.db.prepare(`
          INSERT INTO pooled_reserve_mint_reservation_holds_v4 (
            reservation_key,
            latest_journal_id
          ) VALUES (?, ?)
          ON CONFLICT(reservation_key) DO UPDATE SET
            latest_journal_id = excluded.latest_journal_id
        `).run(
          semantic.reservation.reservationKeyHex,
          observation.id,
        );
        const hold =
          this.getPooledReserveMintReservationRecoveryHoldV4(
            semantic.reservation.reservationKeyHex,
          );
        if (hold?.id !== observation.id) {
          throw new Error(
            'pooled-reserve mint-reservation hold did not retain the latest observation',
          );
        }
        assertUnchangedPegInSettlementAuthority(
          authorityBefore,
          pegInSettlementAuthorityState(this.db),
        );
        return {
          appended: true,
          observation,
          hold,
          pegInLifecycleRowsCreatedOrChanged: 0,
          settlementAuthorityRowsCreatedOrChanged: 0,
        };
      },
    );
    return persist.immediate();
  }

  updatePegInClassification(
    boxId: string,
    sourceClassification: PegInSourceClassification,
  ): void {
    this.assertWritable(`classify peg-in as ${sourceClassification}`);
    this.db.prepare(`
      UPDATE peg_in_events
      SET source_classification = ?, updated_at = datetime('now')
      WHERE ergo_lock_box_id = ?
    `).run(sourceClassification, boxId);
  }

  recordPegInConsumeSubmitted(boxId: string, commitTxId: string): void {
    this.assertWritable('record peg-in consume submission');
    const result = this.db.prepare(`
      UPDATE peg_in_events
      SET status = 'consume_submitted',
          commit_tx_id = ?,
          committed_vault_box_id = NULL,
          commit_inclusion_height = NULL,
          commit_inclusion_header_id = NULL,
          commit_verification_receipt_json = NULL,
          commit_verification_receipt_digest = NULL,
          commit_failure = NULL,
          updated_at = datetime('now')
      WHERE ergo_lock_box_id = ?
        AND status IN ('detected', 'confirmed', 'consume_submitted')
    `).run(commitTxId, boxId);
    if (result.changes !== 1) {
      throw new Error(`Cannot record consume submission from current peg-in state: ${boxId}`);
    }
  }

  recordPegInConsumeConfirmed(
    boxId: string,
    vaultBoxId: string,
    input: {
      readonly inclusionHeight: number;
      readonly inclusionHeaderId: string;
      readonly verification: unknown;
    },
  ): void {
    this.assertWritable('record peg-in consume confirmation');
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      if (!current?.commitTxId) {
        throw new Error(
          `Cannot confirm consume without a persisted commitment transaction: ${boxId}`,
        );
      }
      const receipt = createPegInCommitmentReceipt({
        sourceBoxIdHex: boxId,
        committedVaultBoxIdHex: vaultBoxId,
        commitmentTxIdHex: current.commitTxId,
        verification: input.verification,
      });
      const inclusionHeight = normalizeNonnegativeSignedInt(
        input.inclusionHeight,
        'peg-in commitment inclusion height',
      );
      const inclusionHeaderId = normalizeFixedHex(
        input.inclusionHeaderId,
        32,
        'peg-in commitment inclusion header ID',
      );
      if (
        receipt.verification.height !== inclusionHeight
        || receipt.verification.headerIdHex !== inclusionHeaderId
      ) {
        throw new Error(
          'peg-in commitment receipt does not match independently observed inclusion',
        );
      }
      const receiptJson = pegInCommitmentReceiptJson(receipt);
      const receiptDigestHex = pegInCommitmentReceiptDigestHex(receipt);
      if (
        current.commitmentReceiptDigestHex
        && current.commitmentReceiptDigestHex !== receiptDigestHex
      ) {
        throw new Error('Cannot replace an existing peg-in commitment receipt');
      }
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'consume_confirmed',
            committed_vault_box_id = ?,
            commit_inclusion_height = ?,
            commit_inclusion_header_id = ?,
            commit_verification_receipt_json = ?,
            commit_verification_receipt_digest = ?,
            commit_failure = NULL,
            updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN ('consume_submitted', 'consume_confirmed')
      `).run(
        receipt.committedVaultBoxIdHex,
        inclusionHeight,
        inclusionHeaderId,
        receiptJson,
        receiptDigestHex,
        receipt.sourceBoxIdHex,
      );
      if (result.changes !== 1) {
        throw new Error(`Cannot confirm consume from current peg-in state: ${boxId}`);
      }
      const confirmed = this.getPegInByBoxId(boxId);
      if (confirmed?.commitTxId) {
        const attempt = this.getErgoOperationalTransactionAttempt(
          confirmed.commitTxId,
        );
        if (
          attempt
          && ['pending', 'accepted', 'ambiguous', 'abandoned', 'confirmed'].includes(
            attempt.status,
          )
        ) {
          this.confirmErgoOperationalTransactionAttempt({
            expectedTxId: confirmed.commitTxId,
            confirmationHeight: inclusionHeight,
            confirmationHeaderId: inclusionHeaderId,
          });
        } else if (attempt) {
          throw new Error(
            `Cannot confirm peg-in consume with operational attempt ${attempt.status}`,
          );
        }
      }
    })();
  }

  getLatestPegInMintTransportAttempt(
    boxId: string,
  ): PegInMintTransportAttemptRecord | null {
    const row = this.db.prepare(`
      SELECT attempt.*
      FROM peg_in_mint_transport_attempts attempt
      JOIN peg_in_events event ON event.id = attempt.peg_in_id
      WHERE event.ergo_lock_box_id = ?
      ORDER BY attempt.id DESC
      LIMIT 1
    `).get(boxId);
    return row ? mapPegInMintTransportAttemptRow(row) : null;
  }

  confirmPegInMintTransportRecovery(
    boxId: string,
    expectedTransactionHashHex: string,
    submission: PegInMintAcceptedSubmission,
  ): void {
    this.assertWritable('confirm recovered peg-in mint transport');
    const expectedHashHex = normalizeFixedHex(
      expectedTransactionHashHex,
      32,
      'reserved sidechain mint tx hash',
    );
    const normalizedSubmission = normalizePegInMintAcceptedSubmission(
      expectedHashHex,
      submission,
    );
    this.db.transaction(() => {
      const attempt = this.db.prepare(`
        SELECT
          attempt.id,
          attempt.status,
          attempt.expected_transaction_hash,
          attempt.transaction_hash,
          attempt.response_digest,
          attempt.confirmation_block_number,
          attempt.confirmation_block_hash,
          attempt.confirmation_count
        FROM peg_in_mint_transport_attempts attempt
        JOIN peg_in_events event ON event.id = attempt.peg_in_id
        WHERE event.ergo_lock_box_id = ?
          AND attempt.status IN (
            'pending',
            'accepted',
            'ambiguous',
            'confirmed'
          )
        ORDER BY attempt.id DESC
        LIMIT 1
      `).get(boxId) as {
        id: number;
        status: PegInMintTransportAttemptStatus;
        expected_transaction_hash: string;
        transaction_hash: string | null;
        response_digest: string | null;
        confirmation_block_number: number | null;
        confirmation_block_hash: string | null;
        confirmation_count: number | null;
      } | undefined;
      if (
        !attempt
        || attempt.expected_transaction_hash !== expectedHashHex
      ) {
        throw new Error(
          'Recovered peg-in mint does not match the active exact transport reservation.',
        );
      }
      const persistedConfirmation = [
        attempt.transaction_hash,
        attempt.response_digest,
        attempt.confirmation_block_number,
        attempt.confirmation_block_hash,
        attempt.confirmation_count,
      ];
      const hasPersistedConfirmation =
        persistedConfirmation.some(value => value !== null);
      if (
        hasPersistedConfirmation
        && (
          attempt.transaction_hash
            !== normalizedSubmission.transactionHashHex
          || attempt.response_digest
            !== normalizedSubmission.responseDigestHex
          || attempt.confirmation_block_number
            !== normalizedSubmission.confirmationBlockNumber
          || attempt.confirmation_block_hash
            !== normalizedSubmission.confirmationBlockHashHex
          || attempt.confirmation_count
            !== normalizedSubmission.confirmationCount
        )
      ) {
        throw new Error(
          'Recovered peg-in mint confirmation conflicts with retained transport evidence.',
        );
      }
      const attemptUpdate = this.db.prepare(`
        UPDATE peg_in_mint_transport_attempts
        SET status = 'confirmed',
            transaction_hash = ?,
            response_digest = ?,
            confirmation_block_number = ?,
            confirmation_block_hash = ?,
            confirmation_count = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND status IN ('pending', 'accepted', 'ambiguous', 'confirmed')
      `).run(
        normalizedSubmission.transactionHashHex,
        normalizedSubmission.responseDigestHex,
        normalizedSubmission.confirmationBlockNumber,
        normalizedSubmission.confirmationBlockHashHex,
        normalizedSubmission.confirmationCount,
        attempt.id,
      );
      if (attemptUpdate.changes !== 1) {
        throw new Error(
          'Recovered peg-in mint lost its exact transport reservation.',
        );
      }
      const eventUpdate = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'minted',
            sidechain_mint_tx_hash = ?,
            commit_failure = NULL,
            updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN ('minting', 'minted')
          AND commit_verification_receipt_json IS NOT NULL
          AND commit_verification_receipt_digest IS NOT NULL
      `).run(`0x${normalizedSubmission.transactionHashHex}`, boxId);
      if (eventUpdate.changes !== 1) {
        throw new Error(
          'Recovered peg-in mint does not match a minting event.',
        );
      }
    })();
  }

  beginPegInMint(boxId: string): void {
    this.assertWritable('begin peg-in mint');
    const current = this.getPegInByBoxId(boxId);
    if (!current?.commitmentReceipt) {
      throw new Error(`Cannot mint peg-in before committed-vault confirmation: ${boxId}`);
    }
    const result = this.db.prepare(`
      UPDATE peg_in_events
      SET status = 'minting', commit_failure = NULL, updated_at = datetime('now')
      WHERE ergo_lock_box_id = ?
        AND status IN ('consume_confirmed', 'minting')
        AND commit_verification_receipt_json IS NOT NULL
        AND commit_verification_receipt_digest IS NOT NULL
    `).run(boxId);
    if (result.changes !== 1) {
      throw new Error(`Cannot mint peg-in before committed-vault confirmation: ${boxId}`);
    }
  }

  recordPegInMinted(boxId: string, mintTxHash?: string): void {
    this.assertWritable('record peg-in mint');
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      if (!current?.commitmentReceipt) {
        throw new Error(`Cannot record mint before committed-vault confirmation: ${boxId}`);
      }
      const normalizedMintTxHash = mintTxHash
        ? normalizeFixedHex(mintTxHash, 32, 'sidechain mint tx hash')
        : null;
      const persistedMintTxHash = normalizedMintTxHash
        ? `0x${normalizedMintTxHash}`
        : null;
      if (normalizedMintTxHash) {
        const exactAttempt = this.db.prepare(`
          SELECT
            attempt.status,
            attempt.expected_transaction_hash,
            attempt.transaction_hash
          FROM peg_in_mint_transport_attempts attempt
          JOIN peg_in_events event ON event.id = attempt.peg_in_id
          WHERE event.ergo_lock_box_id = ?
            AND attempt.status IN (
              'pending',
              'accepted',
              'ambiguous',
              'confirmed',
              'quarantined'
            )
          ORDER BY attempt.id DESC
          LIMIT 1
        `).get(boxId) as {
          status: PegInMintTransportAttemptStatus;
          expected_transaction_hash: string;
          transaction_hash: string | null;
        } | undefined;
        if (
          exactAttempt
          && (
            !['accepted', 'confirmed'].includes(exactAttempt.status)
            || exactAttempt.expected_transaction_hash !== normalizedMintTxHash
            || exactAttempt.transaction_hash !== normalizedMintTxHash
          )
        ) {
          throw new Error(
            'Peg-in mint transaction hash does not match the exact transport reservation.',
          );
        }
      }
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'minted',
            sidechain_mint_tx_hash = COALESCE(?, sidechain_mint_tx_hash),
            commit_failure = NULL,
            updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN ('consume_confirmed', 'minting', 'minted')
          AND commit_verification_receipt_json IS NOT NULL
          AND commit_verification_receipt_digest IS NOT NULL
      `).run(persistedMintTxHash, boxId);
      if (result.changes !== 1) {
        throw new Error(`Cannot record mint before committed-vault confirmation: ${boxId}`);
      }
      this.db.prepare(`
        UPDATE peg_in_mint_transport_attempts
        SET status = 'confirmed',
            updated_at = datetime('now')
        WHERE id = (
          SELECT attempt.id
          FROM peg_in_mint_transport_attempts attempt
          JOIN peg_in_events event ON event.id = attempt.peg_in_id
          WHERE event.ergo_lock_box_id = ?
            AND attempt.status = 'accepted'
            AND (
              ? IS NULL
              OR (
                attempt.expected_transaction_hash = ?
                AND attempt.transaction_hash = ?
              )
            )
          ORDER BY attempt.id DESC
          LIMIT 1
        )
      `).run(
        boxId,
        normalizedMintTxHash,
        normalizedMintTxHash,
        normalizedMintTxHash,
      );
    })();
  }

  resetPegInMintForRetry(boxId: string, reason: string): void {
    this.assertWritable('reset peg-in mint for retry');
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      if (!current?.commitmentReceipt) {
        throw new Error(`Cannot reset mint before committed-vault confirmation: ${boxId}`);
      }
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'consume_confirmed',
            sidechain_mint_tx_hash = NULL,
            commit_failure = ?,
            updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN ('minting', 'minted')
      `).run(reason, boxId);
      if (result.changes !== 1) {
        throw new Error(`Cannot reset mint before committed-vault confirmation: ${boxId}`);
      }
      this.db.prepare(`
        UPDATE peg_in_mint_transport_attempts
        SET status = 'abandoned',
            updated_at = datetime('now')
        WHERE id = (
          SELECT attempt.id
          FROM peg_in_mint_transport_attempts attempt
          JOIN peg_in_events event ON event.id = attempt.peg_in_id
          WHERE event.ergo_lock_box_id = ?
            AND attempt.status IN (
              'pending',
              'accepted',
              'ambiguous',
              'confirmed'
            )
          ORDER BY attempt.id DESC
          LIMIT 1
        )
      `).run(boxId);
    })();
  }

  resetPegInCommit(boxId: string, reason: string): void {
    this.assertWritable('reset peg-in commitment');
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'detected',
            commit_tx_id = NULL,
            committed_vault_box_id = NULL,
            commit_inclusion_height = NULL,
            commit_inclusion_header_id = NULL,
            commit_verification_receipt_json = NULL,
            commit_verification_receipt_digest = NULL,
            commit_failure = ?,
            updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN ('consume_submitted', 'consume_confirmed')
      `).run(reason, boxId);
      if (result.changes !== 1) return;
      if (current?.commitTxId) {
        const attempt = this.getErgoOperationalTransactionAttempt(current.commitTxId);
        if (
          attempt
          && ['pending', 'accepted', 'ambiguous'].includes(attempt.status)
        ) {
          this.abandonErgoOperationalTransactionAttempt(
            current.commitTxId,
            reason,
          );
        } else if (attempt?.status === 'confirmed') {
          this.quarantineErgoOperationalTransactionAttempt(
            current.commitTxId,
            reason,
          );
        }
      }
    })();
  }

  markPegInCommitInvalid(boxId: string, reason: string): void {
    this.assertWritable('mark peg-in commitment invalid');
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'commit_invalid', commit_failure = ?, updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
          AND status IN (
            'detected',
            'confirmed',
            'consume_submitted',
            'consume_confirmed',
            'commit_invalid'
          )
      `).run(reason, boxId);
      if (result.changes !== 1) return;
      if (current?.commitTxId) {
        const attempt = this.getErgoOperationalTransactionAttempt(current.commitTxId);
        if (attempt && attempt.status !== 'quarantined') {
          this.quarantineErgoOperationalTransactionAttempt(
            current.commitTxId,
            reason,
          );
        }
      }
    })();
  }

  markPegInIncident(
    boxId: string,
    incident: string | PegInIncidentInput,
  ): void {
    this.assertWritable('mark peg-in incident');
    const kind = normalizePegInSafetyIncidentKind(
      typeof incident === 'string' ? 'unspecified' : incident.kind,
      'peg-in safety incident kind',
    );
    const reason = normalizeBoundedText(
      typeof incident === 'string' ? incident : incident.reason,
      2000,
      'peg-in safety incident reason',
    );
    const observedCommitmentReceiptDigestHex =
      typeof incident === 'string'
        || incident.observedCommitmentReceiptDigestHex === undefined
        || incident.observedCommitmentReceiptDigestHex === null
        ? null
        : normalizeFixedHex(
          incident.observedCommitmentReceiptDigestHex,
          32,
          'observed peg-in commitment receipt digest',
        );
    if (!this.getPegInByBoxId(boxId)) {
      throw new Error(`Cannot mark unknown peg-in incident: ${boxId}`);
    }
    this.ensureExternalFundsReleaseHold(reason);
    this.db.transaction(() => {
      const current = this.getPegInByBoxId(boxId);
      if (!current) throw new Error(`Cannot mark unknown peg-in incident: ${boxId}`);
      const existingRows = this.db.prepare(`
        SELECT evidence_json
        FROM peg_in_safety_incidents
        WHERE peg_in_id = ?
          AND kind = ?
          AND reason = ?
      `).all(current.id, kind, reason) as Array<{ evidence_json: string }>;
      const alreadyRecorded = existingRows.some(({ evidence_json: evidenceJson }) => {
        const evidence = parseCanonicalObjectJson(
          evidenceJson,
          'persisted peg-in safety incident evidence',
        );
        const observedDigestValue =
          evidence.observedCommitmentReceiptDigestHex;
        if (
          observedDigestValue !== null
          && typeof observedDigestValue !== 'string'
        ) {
          throw new Error(
            'persisted observed peg-in commitment receipt digest must be hex or null',
          );
        }
        const persistedObservedDigest =
          observedDigestValue === null
            ? null
            : normalizeFixedHex(
              observedDigestValue,
              32,
              'persisted observed peg-in commitment receipt digest',
            );
        return persistedObservedDigest === observedCommitmentReceiptDigestHex;
      });
      if (alreadyRecorded) return;
      const result = this.db.prepare(`
        UPDATE peg_in_events
        SET status = 'incident', commit_failure = ?, updated_at = datetime('now')
        WHERE ergo_lock_box_id = ?
      `).run(reason, current.ergoLockBoxId);
      if (result.changes !== 1) {
        throw new Error(`Cannot persist peg-in incident: ${boxId}`);
      }
      this.appendPegInSafetyIncident({
        kind,
        pegInId: current.id,
        reason,
        evidence: {
          schema: PEG_IN_SAFETY_INCIDENT_SCHEMA,
          kind,
          pegInBoxIdHex: normalizeFixedHex(
            current.ergoLockBoxId,
            32,
            'incident peg-in source box ID',
          ),
          lifecycleStatus: normalizePegInStatus(
            current.status,
            'incident lifecycle status',
          ),
          commitmentTxIdHex: current.commitTxId === null
            ? null
            : normalizeFixedHex(
              current.commitTxId,
              32,
              'incident commitment transaction ID',
            ),
          committedVaultBoxIdHex: current.committedVaultBoxId === null
            ? null
            : normalizeFixedHex(
              current.committedVaultBoxId,
              32,
              'incident committed vault box ID',
            ),
          retainedCommitmentReceiptDigestHex:
            current.commitmentReceiptDigestHex,
          observedCommitmentReceiptDigestHex,
          reason,
        },
      });
      if (current?.commitTxId) {
        const attempt = this.getErgoOperationalTransactionAttempt(current.commitTxId);
        if (attempt && attempt.status !== 'quarantined') {
          this.quarantineErgoOperationalTransactionAttempt(
            current.commitTxId,
            reason,
          );
        }
      }
    })();
  }

  recordPegInSolvencyDeficitIncident(input: {
    readonly ergoHeight: number;
    readonly totalSupplyNanoErg: bigint;
    readonly totalLockedNanoErg: bigint;
  }): boolean {
    this.assertWritable('record peg-in solvency deficit incident');
    const ergoHeight = normalizeNonnegativeSignedInt(
      input.ergoHeight,
      'solvency incident Ergo height',
    );
    if (input.totalSupplyNanoErg <= input.totalLockedNanoErg) {
      throw new Error('solvency incident requires a positive backing deficit');
    }
    const totalSupplyNanoErg = normalizePositiveLongText(
      input.totalSupplyNanoErg.toString(),
      'solvency incident total supply',
    );
    if (
      input.totalLockedNanoErg < 0n
      || input.totalLockedNanoErg > MAX_SIGNED_LONG
    ) {
      throw new Error('solvency incident locked value must be a nonnegative signed Long');
    }
    const totalLockedNanoErg = input.totalLockedNanoErg.toString();
    const deficitNanoErg = normalizePositiveLongText(
      (input.totalSupplyNanoErg - input.totalLockedNanoErg).toString(),
      'solvency incident deficit',
    );
    const existing = this.db.prepare(`
      SELECT 1
      FROM peg_in_safety_incidents
      WHERE kind = 'solvency_deficit'
      LIMIT 1
    `).get();
    if (existing) return false;
    return this.appendPegInSafetyIncident({
      kind: 'solvency_deficit',
      pegInId: null,
      reason: 'sERG supply exceeds observed counted peg-in backing',
      evidence: {
        schema: PEG_IN_SAFETY_INCIDENT_SCHEMA,
        kind: 'solvency_deficit',
        pegInBoxIdHex: null,
        lifecycleStatus: null,
        commitmentTxIdHex: null,
        committedVaultBoxIdHex: null,
        retainedCommitmentReceiptDigestHex: null,
        observedCommitmentReceiptDigestHex: null,
        solvency: {
          ergoHeight,
          totalSupplyNanoErg,
          totalLockedNanoErg,
          deficitNanoErg,
        },
        reason: 'sERG supply exceeds observed counted peg-in backing',
      },
    });
  }

  getOperatorAlertDeliveryCacheGenerationHex(): string {
    return this.readLocalContinuityIdentityHex();
  }

  getOperatorAlertDeliveryState(
    profileId: string,
  ): OperatorAlertDeliveryState | null {
    const row = this.db.prepare(`
      SELECT
        schema,
        profile_id,
        profile_version,
        revision,
        alert_id_hex,
        condition_digest_hex,
        cache_generation_hex,
        opened_at_ms,
        transition,
        condition_active,
        overall,
        reasons_json,
        previous_alert_id_hex,
        delivery_status,
        attempt_count,
        claimed_at_ms,
        lease_expires_at_ms,
        next_attempt_at_ms,
        delivered_at_ms,
        last_failure_code,
        updated_at_ms
      FROM operator_alert_delivery_state
      WHERE profile_id = ?
    `).get(profileId) as {
      schema: string;
      profile_id: string;
      profile_version: number;
      revision: number;
      alert_id_hex: string;
      condition_digest_hex: string;
      cache_generation_hex: string;
      opened_at_ms: number;
      transition: OperatorAlertDeliveryState['transition'];
      condition_active: number;
      overall: OperatorAlertDeliveryState['overall'];
      reasons_json: string;
      previous_alert_id_hex: string | null;
      delivery_status: OperatorAlertDeliveryState['deliveryStatus'];
      attempt_count: number;
      claimed_at_ms: number | null;
      lease_expires_at_ms: number | null;
      next_attempt_at_ms: number | null;
      delivered_at_ms: number | null;
      last_failure_code: OperatorAlertDeliveryState['lastFailureCode'];
      updated_at_ms: number;
    } | undefined;
    if (!row) return null;
    if (row.condition_active !== 0 && row.condition_active !== 1) {
      throw new Error('operator alert condition state is corrupt');
    }
    return normalizeOperatorAlertDeliveryState({
      schema: row.schema as OperatorAlertDeliveryState['schema'],
      profileId: row.profile_id as OperatorAlertDeliveryState['profileId'],
      profileVersion:
        row.profile_version as OperatorAlertDeliveryState['profileVersion'],
      revision: row.revision,
      alertIdHex: row.alert_id_hex,
      conditionDigestHex: row.condition_digest_hex,
      cacheGenerationHex: row.cache_generation_hex,
      openedAtMs: row.opened_at_ms,
      transition: row.transition,
      conditionActive: row.condition_active === 1,
      overall: row.overall,
      reasons: JSON.parse(row.reasons_json) as OperatorAlertDeliveryState['reasons'],
      previousAlertIdHex: row.previous_alert_id_hex,
      deliveryStatus: row.delivery_status,
      attemptCount: row.attempt_count,
      claimedAtMs: row.claimed_at_ms,
      leaseExpiresAtMs: row.lease_expires_at_ms,
      nextAttemptAtMs: row.next_attempt_at_ms,
      deliveredAtMs: row.delivered_at_ms,
      lastFailureCode: row.last_failure_code,
      updatedAtMs: row.updated_at_ms,
    });
  }

  compareAndSetOperatorAlertDeliveryState(input: Readonly<{
    expectedRevision: number | null;
    next: OperatorAlertDeliveryState;
  }>): boolean {
    const next = normalizeOperatorAlertDeliveryState(input.next);
    if (
      (input.expectedRevision === null && next.revision !== 1)
      || (
        input.expectedRevision !== null
        && next.revision !== input.expectedRevision + 1
      )
    ) {
      throw new Error('operator alert state revision is not monotonic');
    }
    const values = [
      next.schema,
      next.profileId,
      next.profileVersion,
      next.revision,
      next.alertIdHex,
      next.conditionDigestHex,
      next.cacheGenerationHex,
      next.openedAtMs,
      next.transition,
      next.conditionActive ? 1 : 0,
      next.overall,
      JSON.stringify(next.reasons),
      next.previousAlertIdHex,
      next.deliveryStatus,
      next.attemptCount,
      next.claimedAtMs,
      next.leaseExpiresAtMs,
      next.nextAttemptAtMs,
      next.deliveredAtMs,
      next.lastFailureCode,
      next.updatedAtMs,
    ] as const;
    return this.db.transaction(() => {
      if (input.expectedRevision === null) {
        const result = this.db.prepare(`
          INSERT OR IGNORE INTO operator_alert_delivery_state (
            schema,
            profile_id,
            profile_version,
            revision,
            alert_id_hex,
            condition_digest_hex,
            cache_generation_hex,
            opened_at_ms,
            transition,
            condition_active,
            overall,
            reasons_json,
            previous_alert_id_hex,
            delivery_status,
            attempt_count,
            claimed_at_ms,
            lease_expires_at_ms,
            next_attempt_at_ms,
            delivered_at_ms,
            last_failure_code,
            updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...values);
        return result.changes === 1;
      }
      const result = this.db.prepare(`
        UPDATE operator_alert_delivery_state SET
          schema = ?,
          profile_id = ?,
          profile_version = ?,
          revision = ?,
          alert_id_hex = ?,
          condition_digest_hex = ?,
          cache_generation_hex = ?,
          opened_at_ms = ?,
          transition = ?,
          condition_active = ?,
          overall = ?,
          reasons_json = ?,
          previous_alert_id_hex = ?,
          delivery_status = ?,
          attempt_count = ?,
          claimed_at_ms = ?,
          lease_expires_at_ms = ?,
          next_attempt_at_ms = ?,
          delivered_at_ms = ?,
          last_failure_code = ?,
          updated_at_ms = ?
        WHERE profile_id = ? AND revision = ?
      `).run(...values, next.profileId, input.expectedRevision);
      return result.changes === 1;
    })();
  }

  getOperatorHealthPersistenceState(): OperatorHealthPersistenceState {
    return this.db.transaction(() => {
      const solvencyDeficitIncidentPresent = this.db.prepare(`
        SELECT 1
        FROM peg_in_safety_incidents
        WHERE kind = 'solvency_deficit'
        LIMIT 1
      `).get() !== undefined;
      const quarantineRows = this.db.prepare(`
        SELECT
          (
            SELECT COUNT(*)
            FROM aggregate_settlement_attempts
            WHERE recovery_quarantine_reason IS NOT NULL
          )
          + (
            SELECT COUNT(*)
            FROM authenticated_settlement_submission_attempts
            WHERE status = 'quarantined'
          )
          + (
            SELECT COUNT(*)
            FROM ergo_operational_transaction_attempts
            WHERE status = 'quarantined'
          )
          + (
            SELECT COUNT(*)
            FROM peg_out_events
            WHERE status = 'burn_reverted'
          )
          + (
            SELECT COUNT(*)
            FROM peg_in_reconciliation_state s
            JOIN peg_in_reconciliation_journal j
              ON j.id = s.latest_journal_id
             AND j.peg_in_id = s.peg_in_id
            WHERE j.disposition = 'quarantined'
          )
          AS condition_count
      `).get() as { condition_count: number };
      const settlementLifecycleRows = this.db.prepare(`
        SELECT
          work_key,
          MAX(
            CASE WHEN active = 1 THEN updated_at_ms END
          ) AS latest_active_at_ms,
          MAX(
            CASE WHEN terminal = 1 THEN updated_at_ms END
          ) AS latest_terminal_at_ms,
          SUM(
            CASE WHEN updated_at_ms IS NULL THEN 1 ELSE 0 END
          ) AS invalid_timestamp_count
        FROM (
          SELECT work_key, active, terminal,
            CASE
              WHEN
                length(updated_at) = 19
                AND strftime(
                  '%Y-%m-%d %H:%M:%S',
                  updated_at
                ) = updated_at
              THEN CAST(strftime('%s', updated_at) AS INTEGER) * 1000
              WHEN
                length(updated_at) = 24
                AND strftime(
                  '%Y-%m-%dT%H:%M:%fZ',
                  updated_at
                ) = updated_at
              THEN
                CAST(strftime('%s', updated_at) AS INTEGER) * 1000
                + CAST(substr(updated_at, 21, 3) AS INTEGER)
              ELSE NULL
            END AS updated_at_ms
          FROM (
            SELECT
              'aggregate:' || lower(expected_tx_id) AS work_key,
              updated_at,
              CASE
                WHEN status IN ('pending', 'submitted') THEN 1
                ELSE 0
              END AS active,
              CASE
                WHEN status IN ('confirmed', 'abandoned') THEN 1
                ELSE 0
              END AS terminal
            FROM aggregate_settlement_attempts
            UNION ALL
            SELECT
              'burn:' || lower(burn_id),
              updated_at,
              CASE
                WHEN status IN ('prepared', 'check_passed') THEN 1
                ELSE 0
              END,
              CASE WHEN status = 'invalidated' THEN 1 ELSE 0 END
            FROM authenticated_settlement_candidates
            UNION ALL
            SELECT
              'burn:' || lower(burn_id),
              updated_at,
              CASE WHEN status = 'active' THEN 1 ELSE 0 END,
              CASE WHEN status = 'revoked' THEN 1 ELSE 0 END
            FROM authenticated_settlement_execution_reservations
            UNION ALL
            SELECT
              'burn:' || lower(c.burn_id),
              a.updated_at,
              CASE
                WHEN a.status IN ('pending', 'submitted') THEN 1
                ELSE 0
              END,
              CASE
                WHEN a.status IN (
                  'rejected',
                  'confirmed',
                  'quarantined'
                ) THEN 1
                ELSE 0
              END
            FROM authenticated_settlement_submission_attempts a
            JOIN authenticated_settlement_candidates c
              ON c.candidate_id = a.candidate_id
            UNION ALL
            SELECT
              CASE
                WHEN burn_id IS NULL
                  THEN 'peg-out:' || CAST(id AS TEXT)
                ELSE 'burn:' || lower(burn_id)
              END,
              updated_at,
              CASE
                WHEN status IN (
                  'detected',
                  'confirmed',
                  'phase1_created',
                  'aggregate_submitted',
                  'batch_submitted'
                ) THEN 1
                ELSE 0
              END,
              CASE
                WHEN status IN (
                  'phase2_unlocked',
                  'burn_reverted',
                  'failed'
                ) THEN 1
                ELSE 0
              END
            FROM peg_out_events
          )
        )
        GROUP BY work_key
      `).all() as Array<{
        work_key: string;
        latest_active_at_ms: number | null;
        latest_terminal_at_ms: number | null;
        invalid_timestamp_count: number;
      }>;
      const reorgQuarantineConditionCount = normalizeNonnegativeSignedInt(
        quarantineRows.condition_count,
        'operator-health reorg quarantine condition count',
      );
      let activeSettlementAttemptCount = 0;
      let oldestActiveSettlementUpdatedAtMs: number | null = null;
      for (const row of settlementLifecycleRows) {
        const invalidTimestampCount = normalizeNonnegativeSignedInt(
          row.invalid_timestamp_count,
          'operator-health invalid settlement timestamp count',
        );
        if (invalidTimestampCount > 0) {
          throw new Error(
            'operator-health settlement lifecycle contains a non-canonical timestamp',
          );
        }
        const latestActiveAtMs = normalizeOptionalOperatorHealthTimestampMs(
          row.latest_active_at_ms,
          'operator-health latest active settlement update',
        );
        const latestTerminalAtMs = normalizeOptionalOperatorHealthTimestampMs(
          row.latest_terminal_at_ms,
          'operator-health latest terminal settlement update',
        );
        if (
          latestActiveAtMs !== null
          && (
            latestTerminalAtMs === null
            || latestActiveAtMs > latestTerminalAtMs
          )
        ) {
          activeSettlementAttemptCount += 1;
          oldestActiveSettlementUpdatedAtMs =
            oldestActiveSettlementUpdatedAtMs === null
              ? latestActiveAtMs
              : Math.min(
                oldestActiveSettlementUpdatedAtMs,
                latestActiveAtMs,
              );
        }
      }
      activeSettlementAttemptCount = normalizeNonnegativeSignedInt(
        activeSettlementAttemptCount,
        'operator-health active settlement attempt count',
      );
      if (
        (activeSettlementAttemptCount === 0)
        !== (oldestActiveSettlementUpdatedAtMs === null)
      ) {
        throw new Error(
          'persisted operator-health active settlement count and timestamp disagree',
        );
      }
      return Object.freeze({
        solvencyDeficitIncidentPresent,
        reorgQuarantineConditionCount,
        activeSettlementAttemptCount,
        oldestActiveSettlementUpdatedAtMs,
      });
    })();
  }

  getPegInCircuitBreakerState(): PegInCircuitBreakerState {
    return this.db.transaction(() => {
      const continuityRow = this.db.prepare(`
        SELECT schema, status
        FROM local_continuity_state
        WHERE id = 1
      `).get() as {
        schema: string;
        status: 'established' | 'recovery_required';
      } | undefined;
      if (continuityRow === undefined) {
        throw new Error('persisted local continuity state is missing');
      }
      if (
        continuityRow.schema !== LOCAL_CONTINUITY_STATE_SCHEMA
      ) {
        throw new Error('persisted local continuity state schema is unsupported');
      }
      const continuityStatus = continuityRow.status;
      if (
        continuityStatus !== 'established'
        && continuityStatus !== 'recovery_required'
      ) {
        throw new Error('persisted local continuity status is unsupported');
      }
      const continuityRecoveryRequired =
        continuityStatus === 'recovery_required';
      const continuityIdentityHex = this.readLocalContinuityIdentityHex();
      const externalContinuityWitnessCurrent =
        this.isExternalContinuityWitnessCurrent(continuityIdentityHex);
      const externalFundsReleaseHold =
        this.hasExternalFundsReleaseHoldEntry();
      const executionAuthorityRow = this.db.prepare(`
        SELECT 1
        FROM funds_execution_authority
        WHERE id = 1
      `).get();
      const executionLockPresent =
        this.fundsExecutionLockPath !== null
        && existsSync(this.fundsExecutionLockPath);
      const retainedExecutionAuthority =
        this.fundsExecutionAuthorityRetainedForRecovery
        || (executionAuthorityRow !== undefined && !executionLockPresent);
      const durableRows = this.db.prepare(`
      SELECT evidence_digest
      FROM peg_in_safety_incidents
      ORDER BY id ASC
    `).all() as Array<{ evidence_digest: string }>;
      const legacyRows = this.db.prepare(`
      SELECT p.ergo_lock_box_id
      FROM peg_in_events p
      WHERE p.status = 'incident'
        AND NOT EXISTS (
          SELECT 1
          FROM peg_in_safety_incidents i
          WHERE i.peg_in_id = p.id
        )
      ORDER BY p.id ASC
    `).all() as Array<{ ergo_lock_box_id: string }>;
      const postSubmissionRows = this.db.prepare(`
      SELECT *
      FROM peg_in_events
      WHERE status IN ('minting', 'minted')
      ORDER BY id ASC
    `).all();
      const evidenceDigestsHex = durableRows.map(row => normalizeFixedHex(
        row.evidence_digest,
        32,
        'persisted peg-in safety incident digest',
      ));
      const legacyIncidentBoxIdsHex = legacyRows.map(row => normalizeFixedHex(
        row.ergo_lock_box_id,
        32,
        'legacy peg-in incident box ID',
      ));
      const receiptlessMintBoxIdsHex = postSubmissionRows
        .map(mapPegInEventRow)
        .filter(row => row.commitmentReceipt === null)
        .map(row => normalizeFixedHex(
          row.ergoLockBoxId,
          32,
          'receiptless minted peg-in box ID',
        ));
      const incidentCount = evidenceDigestsHex.length
        + legacyIncidentBoxIdsHex.length
        + receiptlessMintBoxIdsHex.length;
      return Object.freeze({
        open:
          incidentCount > 0
          || continuityRecoveryRequired
          || !externalContinuityWitnessCurrent
          || retainedExecutionAuthority
          || externalFundsReleaseHold,
        incidentCount,
        continuityStatus,
        continuityRecoveryRequired,
        externalContinuityWitnessCurrent,
        retainedExecutionAuthority,
        stateDigestHex: sha256CanonicalJson(
          {
            schema: 'e2s.peg-in-circuit-breaker-state.v1',
            continuityStatus,
            continuityIdentityHex,
            externalContinuityWitnessCurrent,
            retainedExecutionAuthority,
            externalFundsReleaseHold,
            evidenceDigestsHex,
            legacyIncidentBoxIdsHex,
            receiptlessMintBoxIdsHex,
          },
          PEG_IN_CIRCUIT_BREAKER_STATE_DIGEST_DOMAIN,
        ),
      });
    })();
  }

  holdFundsReleaseForOperatorReview(reason: string): void {
    this.assertWritable('hold funds release for operator review');
    this.ensureExternalFundsReleaseHold(reason);
  }

  assertFundsReleaseAuthorized(
    expectedStateDigestHex?: string,
    expectedExecutionAuthorityEpochHex?: string,
  ): FundsReleaseAuthorization {
    if (this.fundsExecutionAuthorityRetainedForRecovery) {
      throw new Error(
        'funds execution authority is retained for reviewed recovery',
      );
    }
    return this.db.transaction(() => {
      const state = this.getPegInCircuitBreakerState();
      if (state.open) {
        throw new Error('local funds-release hold is open');
      }
      if (
        expectedStateDigestHex !== undefined
        && normalizeFixedHex(
          expectedStateDigestHex,
          32,
          'expected funds-release state digest',
        ) !== state.stateDigestHex
      ) {
        throw new Error('local funds-release state changed before authorization');
      }
      const executionAuthority = this.assertOwnedFundsExecutionAuthority(
        expectedExecutionAuthorityEpochHex,
      );
      return Object.freeze({
        ...state,
        executionAuthorityEpochHex: executionAuthority.epochHex,
      });
    }).immediate();
  }

  startFundsReleaseTransport<T>(
    expectedStateDigestHex: string,
    expectedExecutionAuthorityEpochHex: string,
    startTransport: () => T,
  ): T {
    this.assertWritable('start funds-release transport');
    if (typeof startTransport !== 'function') {
      throw new Error('funds-release transport starter must be a function');
    }
    const start = this.db.transaction(() => {
      this.assertFundsReleaseAuthorized(
        expectedStateDigestHex,
        expectedExecutionAuthorityEpochHex,
      );
      return startTransport();
    });
    return start.immediate();
  }

  private appendPegInSafetyIncident(input: {
    readonly kind: PegInSafetyIncidentKind;
    readonly pegInId: number | null;
    readonly reason: string;
    readonly evidence: Readonly<Record<string, unknown>>;
  }): boolean {
    const kind = normalizePegInSafetyIncidentKind(
      input.kind,
      'peg-in safety incident kind',
    );
    const reason = normalizeBoundedText(
      input.reason,
      2000,
      'peg-in safety incident reason',
    );
    this.ensureExternalFundsReleaseHold(reason);
    const evidenceJson = canonicalJson(input.evidence);
    const evidenceDigestHex = sha256CanonicalJson(
      input.evidence,
      PEG_IN_SAFETY_INCIDENT_DIGEST_DOMAIN,
    );
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO peg_in_safety_incidents (
        schema,
        kind,
        peg_in_id,
        evidence_json,
        evidence_digest,
        reason
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      PEG_IN_SAFETY_INCIDENT_SCHEMA,
      kind,
      input.pegInId,
      evidenceJson,
      evidenceDigestHex,
      reason,
    );
    return result.changes === 1;
  }

  getPegInRouteReconstructionSnapshot(): PegInRouteReconstructionCacheSnapshot | null {
    return this.db.transaction(() => this.readPegInRouteReconstructionSnapshot())();
  }

  private readPegInRouteReconstructionSnapshot(): PegInRouteReconstructionCacheSnapshot | null {
    const row = this.db.prepare(`
      SELECT schema, manifest_id, manifest_digest, source_revision,
             route_bindings_json, network_id, snapshot_json, anchor_header_json,
             primary_source_id, witness_source_id, observation_digest,
             reconstruction_digest, decision_classification,
             observation_condition_met, decision_blockers_json, observed_at
      FROM peg_in_route_reconstruction_state
      WHERE id = 1
    `).get() as Record<string, any> | undefined;
    if (!row) return null;

    const routeBindings = parseCanonicalObjectJson(
      row.route_bindings_json,
      'persisted peg-in route bindings',
    ) as unknown as PegInRouteReconstruction['routeBindings'];
    const rawSnapshot = parseCanonicalObjectJson(
      row.snapshot_json,
      'persisted peg-in route snapshot',
    );
    const rawTip = requirePlainObject(rawSnapshot.tip, 'persisted peg-in route tip');
    const snapshot: PegInRouteReconstruction['network']['snapshot'] = {
      network: normalizeLowerIdentifier(rawSnapshot.network, 'persisted peg-in route network'),
      indexedHeight: normalizeNonnegativeSignedInt(
        rawSnapshot.indexedHeight as number,
        'persisted peg-in route indexed height',
      ),
      fullHeight: normalizeNonnegativeSignedInt(
        rawSnapshot.fullHeight as number,
        'persisted peg-in route full height',
      ),
      tip: {
        height: normalizeNonnegativeSignedInt(
          rawTip.height as number,
          'persisted peg-in route tip height',
        ),
        idHex: normalizeFixedHex(
          rawTip.idHex as string,
          32,
          'persisted peg-in route tip ID',
        ),
      },
    };
    const rawAnchor = parseCanonicalObjectJson(
      row.anchor_header_json,
      'persisted peg-in route anchor',
    );
    const observedIds = rawAnchor.observedIdsHex;
    if (!Array.isArray(observedIds)) {
      throw new Error('persisted peg-in route anchor observed IDs must be an array');
    }
    const anchorHeader: PegInRouteReconstruction['network']['anchorHeader'] = {
      height: normalizeNonnegativeSignedInt(
        rawAnchor.height as number,
        'persisted peg-in route anchor height',
      ),
      expectedIdHex: normalizeFixedHex(
        rawAnchor.expectedIdHex as string,
        32,
        'persisted peg-in route expected anchor ID',
      ),
      observedIdsHex: observedIds.map((value, index) => normalizeFixedHex(
        value as string,
        32,
        `persisted peg-in route observed anchor ID ${index}`,
      )),
      depthAtSnapshot: normalizeNonnegativeSignedInt(
        rawAnchor.depthAtSnapshot as number,
        'persisted peg-in route anchor depth',
      ),
    };
    const blockers = parseCanonicalArrayJson(
      row.decision_blockers_json,
      'persisted peg-in route blockers',
    ) as unknown as PegInRouteReconstruction['decision']['blockers'];
    const classification = normalizePegInRouteObservationClassification(
      row.decision_classification,
    );
    if (row.observation_condition_met !== 0 && row.observation_condition_met !== 1) {
      throw new Error('persisted peg-in route condition flag is invalid');
    }
    const state: PegInRouteReconstructionCacheState = {
      schema: normalizePegInRouteReconstructionSchema(row.schema),
      manifestId: normalizeBoundedText(row.manifest_id, 256, 'persisted peg-in route manifest ID'),
      manifestDigestHex: normalizeFixedHex(
        row.manifest_digest,
        32,
        'persisted peg-in route manifest digest',
      ),
      sourceRevisionHex: normalizeFixedHex(
        row.source_revision,
        20,
        'persisted peg-in route source revision',
      ),
      routeBindings,
      networkId: normalizeLowerIdentifier(row.network_id, 'persisted peg-in route network ID'),
      snapshot,
      anchorHeader,
      primarySourceId: normalizeCredentialFreeHttpOrigin(
        row.primary_source_id,
        'persisted primary peg-in route source',
      ),
      witnessSourceId: normalizeCredentialFreeHttpOrigin(
        row.witness_source_id,
        'persisted witness peg-in route source',
      ),
      observationDigestHex: normalizeFixedHex(
        row.observation_digest,
        32,
        'persisted peg-in route observation digest',
      ),
      reconstructionDigestHex: normalizeFixedHex(
        row.reconstruction_digest,
        32,
        'persisted peg-in route reconstruction digest',
      ),
      decision: {
        classification,
        observationConditionMet: row.observation_condition_met === 1,
        blockers,
      },
      observedAt: normalizeCanonicalIsoTimestamp(
        row.observed_at,
        'persisted peg-in route observation time',
      ),
    };

    const depositRows = this.db.prepare(`
      SELECT box_id, address_box_index, transaction_id, output_index,
             creation_height, value_nanoerg, spent_transaction_id,
             target_evm_address, declared_amount_nanoerg, signer_metadata_hex,
             depositor_ergo_tree_hex, classification, transition_transaction_id,
             transition_inclusion_height, transition_inclusion_block_id,
             transition_confirmations, transition_vault_box_id, current_unspent
      FROM peg_in_route_reconstruction_deposits
      ORDER BY address_box_index ASC, box_id ASC
    `).all() as Array<Record<string, any>>;
    const activeCurrentBoxIdsHex: string[] = [];
    const activeHistory = depositRows.map((deposit, index) => {
      const normalized = persistedPegInRouteDeposit(deposit, index);
      if (deposit.current_unspent === 1) activeCurrentBoxIdsHex.push(normalized.boxIdHex);
      return normalized;
    });

    const vaultRows = this.db.prepare(`
      SELECT box_id, current_unspent
      FROM peg_in_route_reconstruction_vault_boxes
      ORDER BY box_id ASC
    `).all() as Array<{ box_id: string; current_unspent: number }>;
    const vaultHistoryBoxIdsHex: string[] = [];
    const vaultCurrentBoxIdsHex: string[] = [];
    for (const [index, vault] of vaultRows.entries()) {
      const boxId = normalizeFixedHex(vault.box_id, 32, `persisted peg-in vault box ${index}`);
      assertSqliteBoolean(vault.current_unspent, `persisted peg-in vault box ${boxId} current flag`);
      vaultHistoryBoxIdsHex.push(boxId);
      if (vault.current_unspent === 1) vaultCurrentBoxIdsHex.push(boxId);
    }

    const routeRows = this.db.prepare(`
      SELECT ordinal, version, address
      FROM peg_in_route_reconstruction_legacy_routes
      ORDER BY ordinal ASC
    `).all() as Array<{ ordinal: number; version: string; address: string }>;
    const legacyRoutes = routeRows.map(route => {
      const ordinal = normalizeNonnegativeSignedInt(route.ordinal, 'persisted legacy route ordinal');
      const boxes = this.db.prepare(`
        SELECT box_id, current_unspent
        FROM peg_in_route_reconstruction_legacy_boxes
        WHERE route_ordinal = ?
        ORDER BY box_id ASC
      `).all(ordinal) as Array<{ box_id: string; current_unspent: number }>;
      const historyBoxIdsHex: string[] = [];
      const currentBoxIdsHex: string[] = [];
      for (const [index, box] of boxes.entries()) {
        const boxId = normalizeFixedHex(
          box.box_id,
          32,
          `persisted legacy route ${ordinal} box ${index}`,
        );
        assertSqliteBoolean(
          box.current_unspent,
          `persisted legacy route ${ordinal} box ${boxId} current flag`,
        );
        historyBoxIdsHex.push(boxId);
        if (box.current_unspent === 1) currentBoxIdsHex.push(boxId);
      }
      return {
        ordinal,
        version: normalizeBoundedText(route.version, 128, 'persisted legacy route version'),
        address: normalizeVaultAddress(route.address, 'persisted legacy route address'),
        historyBoxIdsHex,
        currentBoxIdsHex,
      };
    });

    const persisted: PegInRouteReconstruction = {
      schema: state.schema,
      observedAt: state.observedAt,
      reconstructionDigestHex: state.reconstructionDigestHex,
      manifest: {
        manifestId: state.manifestId,
        schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
        computedSha256Hex: state.manifestDigestHex,
        expectedSha256Hex: state.manifestDigestHex,
        sourceRevision: state.sourceRevisionHex,
        profile: 'committed-vault-v3',
        settlementVaultProfileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility',
      },
      routeBindings: state.routeBindings,
      network: {
        networkId: state.networkId,
        snapshot: state.snapshot,
        anchorHeader: state.anchorHeader,
      },
      sources: {
        primary: state.primarySourceId,
        witness: state.witnessSourceId,
      },
      observationDigestHex: state.observationDigestHex,
      decision: state.decision,
      activeHistory,
      activeCurrentBoxIdsHex,
      vaultHistoryBoxIdsHex,
      vaultCurrentBoxIdsHex,
      legacyRoutes,
      boundary: PEG_IN_ROUTE_RECONSTRUCTION_BOUNDARY,
    };
    const {
      observedAt: _observedAt,
      reconstructionDigestHex: _reconstructionDigestHex,
      ...semantic
    } = persisted;
    const recomputedDigestHex = pegInRouteReconstructionDigestHex(
      semantic as PegInRouteReconstructionSemantic,
    );
    if (recomputedDigestHex !== state.reconstructionDigestHex) {
      throw new Error('persisted peg-in route reconstruction digest does not match cache semantics');
    }
    return normalizePegInRouteReconstruction(persisted);
  }

  getPegInJoinedReconstructionSnapshot(): PegInJoinedReconstructionCacheSnapshot | null {
    return this.db.transaction(() => {
      const sidechain = this.readPegInSidechainReconstructionSnapshot();
      if (sidechain === null) return null;
      const route = this.readPegInRouteReconstructionSnapshot();
      if (route === null) {
        throw new Error('persisted peg-in sidechain reconstruction has no Ergo route cache');
      }
      if (
        sidechain.ergoRouteReconstructionDigestHex
        !== route.state.reconstructionDigestHex
      ) {
        throw new Error('persisted peg-in sidechain reconstruction binds a stale Ergo route');
      }
      return { route, sidechain };
    })();
  }

  private readPegInSidechainReconstructionSnapshot(): PegInSidechainReconstruction | null {
    const row = this.db.prepare(`
      SELECT schema, profile_json, ergo_route_reconstruction_digest,
             frontier_view_digest, frontier_source_ids_json, observed_tip_json,
             decision_json, boundary_json, reconstruction_digest, observed_at
      FROM peg_in_sidechain_reconstruction_state
      WHERE id = 1
    `).get() as Record<string, any> | undefined;
    if (!row) {
      const orphanCount = this.db.prepare(`
        SELECT (
          (SELECT COUNT(*) FROM peg_in_sidechain_reconstruction_entries)
          + (SELECT COUNT(*) FROM peg_in_sidechain_reconstruction_issues)
        ) AS count
      `).get() as { count: number };
      if (orphanCount.count !== 0) {
        throw new Error('persisted peg-in sidechain reconstruction has orphan rows');
      }
      return null;
    }

    const entryRows = this.db.prepare(`
      SELECT ordinal, ergo_box_id, route_kind, route_classification,
             processed_at_observed_tip, cross_chain_state, event_json
      FROM peg_in_sidechain_reconstruction_entries
      ORDER BY ordinal ASC
    `).all() as Array<Record<string, any>>;
    const entries = entryRows.map((entry, index) => {
      if (entry.ordinal !== index) {
        throw new Error('persisted peg-in sidechain entry ordinals are not contiguous');
      }
      assertSqliteBoolean(
        entry.processed_at_observed_tip,
        `persisted peg-in sidechain entry ${index} processed flag`,
      );
      return {
        ergoBoxIdHex: entry.ergo_box_id,
        routeKind: entry.route_kind,
        routeClassification: entry.route_classification,
        processedAtObservedTip: entry.processed_at_observed_tip === 1,
        state: entry.cross_chain_state,
        event: entry.event_json === null
          ? null
          : parseCanonicalObjectJson(
            entry.event_json,
            `persisted peg-in sidechain entry ${index} event`,
          ),
      };
    });
    const issueRows = this.db.prepare(`
      SELECT ordinal, code, ergo_box_id, message
      FROM peg_in_sidechain_reconstruction_issues
      ORDER BY ordinal ASC
    `).all() as Array<Record<string, any>>;
    const issues = issueRows.map((entry, index) => {
      if (entry.ordinal !== index) {
        throw new Error('persisted peg-in sidechain issue ordinals are not contiguous');
      }
      return {
        code: entry.code,
        ergoBoxIdHex: entry.ergo_box_id,
        message: entry.message,
      };
    });
    const persisted = validatePegInSidechainReconstructionStructure({
      schema: row.schema,
      observedAt: row.observed_at,
      profile: parseCanonicalObjectJson(
        row.profile_json,
        'persisted peg-in sidechain profile',
      ),
      ergoRouteReconstructionDigestHex: row.ergo_route_reconstruction_digest,
      frontierViewDigestHex: row.frontier_view_digest,
      frontierSourceIds: parseCanonicalArrayJson(
        row.frontier_source_ids_json,
        'persisted Frontier peg-in sources',
      ),
      observedTip: parseCanonicalObjectJson(
        row.observed_tip_json,
        'persisted peg-in sidechain tip',
      ),
      entries,
      issues,
      decision: parseCanonicalObjectJson(
        row.decision_json,
        'persisted peg-in sidechain decision',
      ),
      reconstructionDigestHex: row.reconstruction_digest,
      boundary: parseCanonicalObjectJson(
        row.boundary_json,
        'persisted peg-in sidechain boundary',
      ),
    });
    if (
      persisted.schema !== row.schema
      || persisted.ergoRouteReconstructionDigestHex
        !== row.ergo_route_reconstruction_digest
      || persisted.frontierViewDigestHex !== row.frontier_view_digest
      || persisted.reconstructionDigestHex !== row.reconstruction_digest
    ) {
      throw new Error('persisted peg-in sidechain state columns disagree');
    }
    return persisted;
  }

  replacePegInRouteReconstruction(
    reconstruction: PegInRouteReconstruction,
  ): PegInRouteReconstructionReplacementResult {
    assertPegInRouteReconstructionProvenance(reconstruction);
    this.assertWritable('replace peg-in route reconstruction cache');
    const desired = normalizePegInRouteReconstruction(reconstruction);

    const replace = this.db.transaction((): PegInRouteReconstructionReplacementResult => {
      const previous = this.readPegInRouteReconstructionSnapshot();
      const previousCounts = {
        deposits: previous?.activeHistory.length ?? 0,
        vaultBoxes: previous?.vaultHistoryBoxIdsHex.length ?? 0,
        legacyBoxes: previous?.legacyRoutes.reduce(
          (sum, route) => sum + route.historyBoxIdsHex.length,
          0,
        ) ?? 0,
      };
      const changed = previous === null
        || canonicalJson(pegInRouteCacheSemantic(previous))
          !== canonicalJson(pegInRouteCacheSemantic(desired));
      const authorityBefore = pegInSettlementAuthorityState(this.db);
      if (changed) {
        this.db.prepare(`DELETE FROM peg_in_sidechain_reconstruction_state`).run();
        this.db.prepare(`DELETE FROM peg_in_route_reconstruction_deposits`).run();
        this.db.prepare(`DELETE FROM peg_in_route_reconstruction_vault_boxes`).run();
        this.db.prepare(`DELETE FROM peg_in_route_reconstruction_legacy_routes`).run();
        this.db.prepare(`DELETE FROM peg_in_route_reconstruction_state`).run();

        this.db.prepare(`
          INSERT INTO peg_in_route_reconstruction_state (
            id, schema, manifest_id, manifest_digest, source_revision,
            route_bindings_json, network_id, snapshot_json, anchor_header_json,
            primary_source_id, witness_source_id, observation_digest,
            reconstruction_digest, decision_classification,
            observation_condition_met, decision_blockers_json, observed_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          desired.state.schema,
          desired.state.manifestId,
          desired.state.manifestDigestHex,
          desired.state.sourceRevisionHex,
          canonicalJson(desired.state.routeBindings),
          desired.state.networkId,
          canonicalJson(desired.state.snapshot),
          canonicalJson(desired.state.anchorHeader),
          desired.state.primarySourceId,
          desired.state.witnessSourceId,
          desired.state.observationDigestHex,
          desired.state.reconstructionDigestHex,
          desired.state.decision.classification,
          desired.state.decision.observationConditionMet ? 1 : 0,
          canonicalJson(desired.state.decision.blockers),
          desired.state.observedAt,
        );

        const activeCurrent = new Set(desired.activeCurrentBoxIdsHex);
        const insertDeposit = this.db.prepare(`
          INSERT INTO peg_in_route_reconstruction_deposits (
            box_id, address_box_index, transaction_id, output_index,
            creation_height, value_nanoerg, spent_transaction_id,
            target_evm_address, declared_amount_nanoerg, signer_metadata_hex,
            depositor_ergo_tree_hex, classification, transition_transaction_id,
            transition_inclusion_height, transition_inclusion_block_id,
            transition_confirmations, transition_vault_box_id, current_unspent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const deposit of desired.activeHistory) {
          insertDeposit.run(
            deposit.boxIdHex,
            deposit.addressBoxIndex,
            deposit.transactionIdHex,
            deposit.outputIndex,
            deposit.creationHeight,
            deposit.valueNanoErg,
            deposit.spentTransactionIdHex,
            deposit.targetEvmAddressHex,
            deposit.declaredAmountNanoErg,
            deposit.signerMetadataHex,
            deposit.depositorErgoTreeHex,
            deposit.classification,
            deposit.transition?.spendingTransactionIdHex ?? null,
            deposit.transition?.inclusionHeight ?? null,
            deposit.transition?.inclusionBlockIdHex ?? null,
            deposit.transition?.confirmations ?? null,
            deposit.transition?.vaultBoxIdHex ?? null,
            activeCurrent.has(deposit.boxIdHex) ? 1 : 0,
          );
        }

        const vaultCurrent = new Set(desired.vaultCurrentBoxIdsHex);
        const insertVault = this.db.prepare(`
          INSERT INTO peg_in_route_reconstruction_vault_boxes (box_id, current_unspent)
          VALUES (?, ?)
        `);
        for (const boxId of desired.vaultHistoryBoxIdsHex) {
          insertVault.run(boxId, vaultCurrent.has(boxId) ? 1 : 0);
        }

        const insertLegacyRoute = this.db.prepare(`
          INSERT INTO peg_in_route_reconstruction_legacy_routes (ordinal, version, address)
          VALUES (?, ?, ?)
        `);
        const insertLegacyBox = this.db.prepare(`
          INSERT INTO peg_in_route_reconstruction_legacy_boxes (
            route_ordinal, box_id, current_unspent
          ) VALUES (?, ?, ?)
        `);
        for (const route of desired.legacyRoutes) {
          insertLegacyRoute.run(route.ordinal, route.version, route.address);
          const current = new Set(route.currentBoxIdsHex);
          for (const boxId of route.historyBoxIdsHex) {
            insertLegacyBox.run(route.ordinal, boxId, current.has(boxId) ? 1 : 0);
          }
        }
      }

      const authorityAfter = pegInSettlementAuthorityState(this.db);
      if (authorityAfter !== authorityBefore) {
        throw new Error('peg-in route cache replacement changed lifecycle authority');
      }
      return {
        changed,
        previousDeposits: previousCounts.deposits,
        currentDeposits: desired.activeHistory.length,
        previousVaultBoxes: previousCounts.vaultBoxes,
        currentVaultBoxes: desired.vaultHistoryBoxIdsHex.length,
        previousLegacyBoxes: previousCounts.legacyBoxes,
        currentLegacyBoxes: desired.legacyRoutes.reduce(
          (sum, route) => sum + route.historyBoxIdsHex.length,
          0,
        ),
        pegInLifecycleRowsCreatedOrChanged: 0,
      };
    });
    return replace.immediate();
  }

  replacePegInJoinedReconstruction(
    input: PegInJoinedReconstructionReplacementInput,
  ): PegInJoinedReconstructionReplacementResult {
    assertPegInRouteReconstructionProvenance(input.routeReconstruction);
    assertPegInSidechainReconstructionProvenance(input.sidechainReconstruction);
    this.assertWritable('replace joined peg-in reconstruction cache');
    const desired = validatePegInSidechainReconstructionStructure(
      input.sidechainReconstruction,
    );
    if (
      desired.ergoRouteReconstructionDigestHex
      !== input.routeReconstruction.reconstructionDigestHex
    ) {
      throw new Error('joined peg-in reconstruction binds another Ergo route');
    }

    const replace = this.db.transaction((): PegInJoinedReconstructionReplacementResult => {
      const authorityBefore = pegInSettlementAuthorityState(this.db);
      const previous = this.readPegInSidechainReconstructionSnapshot();
      const route = this.replacePegInRouteReconstruction(input.routeReconstruction);
      const currentRoute = this.readPegInRouteReconstructionSnapshot();
      if (
        currentRoute === null
        || currentRoute.state.reconstructionDigestHex
          !== desired.ergoRouteReconstructionDigestHex
      ) {
        throw new Error('joined peg-in reconstruction did not retain its exact Ergo route');
      }
      const changed = route.changed
        || previous === null
        || previous.reconstructionDigestHex !== desired.reconstructionDigestHex;
      if (changed) {
        this.db.prepare(`DELETE FROM peg_in_sidechain_reconstruction_state`).run();
        this.db.prepare(`
          INSERT INTO peg_in_sidechain_reconstruction_state (
            id, schema, profile_json, ergo_route_reconstruction_digest,
            frontier_view_digest, frontier_source_ids_json, observed_tip_json,
            decision_json, boundary_json, reconstruction_digest, observed_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          desired.schema,
          canonicalJson(desired.profile),
          desired.ergoRouteReconstructionDigestHex,
          desired.frontierViewDigestHex,
          canonicalJson(desired.frontierSourceIds),
          canonicalJson(desired.observedTip),
          canonicalJson(desired.decision),
          canonicalJson(desired.boundary),
          desired.reconstructionDigestHex,
          desired.observedAt,
        );

        const insertEntry = this.db.prepare(`
          INSERT INTO peg_in_sidechain_reconstruction_entries (
            ordinal, ergo_box_id, route_kind, route_classification,
            processed_at_observed_tip, cross_chain_state, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const [ordinal, entry] of desired.entries.entries()) {
          insertEntry.run(
            ordinal,
            entry.ergoBoxIdHex,
            entry.routeKind,
            entry.routeClassification,
            entry.processedAtObservedTip ? 1 : 0,
            entry.state,
            entry.event === null ? null : canonicalJson(entry.event),
          );
        }

        const insertIssue = this.db.prepare(`
          INSERT INTO peg_in_sidechain_reconstruction_issues (
            ordinal, code, ergo_box_id, message
          ) VALUES (?, ?, ?, ?)
        `);
        for (const [ordinal, entry] of desired.issues.entries()) {
          insertIssue.run(
            ordinal,
            entry.code,
            entry.ergoBoxIdHex,
            entry.message,
          );
        }
      }

      const retained = this.readPegInSidechainReconstructionSnapshot();
      if (
        retained === null
        || retained.reconstructionDigestHex !== desired.reconstructionDigestHex
        || retained.ergoRouteReconstructionDigestHex
          !== currentRoute.state.reconstructionDigestHex
      ) {
        throw new Error('joined peg-in reconstruction cache write was inconsistent');
      }
      const authorityAfter = pegInSettlementAuthorityState(this.db);
      if (authorityAfter !== authorityBefore) {
        throw new Error('joined peg-in cache replacement changed lifecycle authority');
      }
      return {
        changed,
        route,
        previousEntries: previous?.entries.length ?? 0,
        currentEntries: desired.entries.length,
        previousIssues: previous?.issues.length ?? 0,
        currentIssues: desired.issues.length,
        pegInLifecycleRowsCreatedOrChanged: 0,
        settlementAuthorityRowsCreatedOrChanged: 0,
      };
    });
    return replace.immediate();
  }

  // --- Peg-Out Events ----------------------------------------

  runPegOutBackingInventoryTransaction<T>(operation: () => T): T {
    this.assertWritable('persist complete peg-out backing inventory');
    return this.db.transaction(operation)();
  }

  getSettlementAuthorityInventoryCounts(): Readonly<{
    pegInEvents: number;
    pegInMintTransportAttempts: number;
    aggregateSettlementAttempts: number;
    authenticatedSettlementCandidates: number;
    authenticatedSettlementExecutionReservations: number;
    authenticatedSettlementSubmissionAttempts: number;
    ergoOperationalTransactionAttempts: number;
    pendingDupHeartbeats: number;
  }> {
    const read = this.db.transaction(() => Object.freeze({
      pegInEvents: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM peg_in_events',
        'peg-in events',
      ),
      pegInMintTransportAttempts: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM peg_in_mint_transport_attempts',
        'peg-in mint transport attempts',
      ),
      aggregateSettlementAttempts: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM aggregate_settlement_attempts',
        'aggregate settlement attempts',
      ),
      authenticatedSettlementCandidates: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM authenticated_settlement_candidates',
        'authenticated settlement candidates',
      ),
      authenticatedSettlementExecutionReservations: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM authenticated_settlement_execution_reservations',
        'authenticated settlement execution reservations',
      ),
      authenticatedSettlementSubmissionAttempts: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM authenticated_settlement_submission_attempts',
        'authenticated settlement submission attempts',
      ),
      ergoOperationalTransactionAttempts: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM ergo_operational_transaction_attempts',
        'Ergo operational transaction attempts',
      ),
      pendingDupHeartbeats: readCount(
        this.db,
        'SELECT COUNT(*) AS count FROM pending_dup_heartbeats',
        'pending DUP heartbeats',
      ),
    }));
    return read();
  }

  insertPegOut(
    burnTxHash: string,
    ergoRecipient: string,
    amount: bigint,
    height: number,
    metadata: PegOutBurnMetadata = {},
  ): void {
    this.assertWritable('insert peg-out');
    const insert = this.db.transaction(() => {
      const normalizedBurnTxHash = normalizeBurnTxHash(burnTxHash);
      const sidechainLogIndex = metadata.sidechainLogIndex === undefined
        ? null
        : normalizeUint32(metadata.sidechainLogIndex, 'sidechainLogIndex');
      const sidechainId = metadata.sidechainId === undefined
        ? null
        : normalizeFixedHex(metadata.sidechainId, 32, 'sidechainId');
      if (sidechainId !== null && sidechainLogIndex === null) {
        throw new Error('sidechainId requires sidechainLogIndex for peg-out burn identity');
      }
      const burnId = sidechainId === null || sidechainLogIndex === null
        ? null
        : deriveTrustlessBurnIdHex({
          sidechainIdHex: sidechainId,
          sidechainTxHashHex: normalizedBurnTxHash,
          eventIndex: sidechainLogIndex,
        });
      const sidechainBlockHash = metadata.sidechainBlockHash === undefined
        ? null
        : normalizeFixedHex(metadata.sidechainBlockHash, 32, 'sidechainBlockHash');
      const transactionRows = this.db.prepare(`
        SELECT id, sidechain_log_index, status
        FROM peg_out_events
        WHERE lower(
          CASE
            WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
              THEN substr(sidechain_burn_tx_hash, 3)
            ELSE sidechain_burn_tx_hash
          END
        ) = ?
        ORDER BY id ASC
      `).all(normalizedBurnTxHash) as Array<{
        id: number;
        sidechain_log_index: number | null;
        status: PegOutStatus;
      }>;
      if (
        sidechainLogIndex !== null
        && transactionRows.some(row => row.sidechain_log_index === null)
      ) {
        throw new Error(
          'legacy hash-only row blocks event-keyed insertion until explicit repair assigns its canonical log index',
        );
      }
      if (
        sidechainLogIndex === null
        && transactionRows.some(row => row.sidechain_log_index !== null)
      ) {
        throw new Error(
          'indexed burn events block insertion of an ambiguous legacy hash-only row',
        );
      }
      const exactCoordinateExists = sidechainLogIndex !== null
        && transactionRows.some(row => row.sidechain_log_index === sidechainLogIndex);
      if (sidechainLogIndex !== null && !exactCoordinateExists) {
        const activeAttempts = this.db.prepare(`
          SELECT burn_tx_hashes_json
          FROM aggregate_settlement_attempts
          WHERE status IN ('pending', 'submitted')
        `).all() as Array<{ burn_tx_hashes_json: string }>;
        const activeLegacyJournal = activeAttempts.some(row =>
          parseAggregateBurnTxHashesJson(
            row.burn_tx_hashes_json,
            'active legacy aggregate journal',
          ).includes(normalizedBurnTxHash)
        );
        if (activeLegacyJournal) {
          throw new Error(
            'active legacy aggregate journal blocks a sibling burn event; manual reconciliation is required',
          );
        }
      }
      if (
        sidechainLogIndex !== null
        && !exactCoordinateExists
        && transactionRows.some(row => row.status !== 'detected' && row.status !== 'confirmed')
      ) {
        throw new Error(
          'legacy aggregate lifecycle already started for this transaction hash; manual reconciliation is required before adding a sibling burn event',
        );
      }
      const existing = sidechainLogIndex === null
        ? this.db.prepare(`
          SELECT * FROM peg_out_events
          WHERE lower(
            CASE
              WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
                THEN substr(sidechain_burn_tx_hash, 3)
              ELSE sidechain_burn_tx_hash
            END
          ) = ? AND sidechain_log_index IS NULL
        `).get(normalizedBurnTxHash) as any | undefined
        : this.resolvePegOutRow({
          burnTxHash: normalizedBurnTxHash,
          sidechainLogIndex,
        }, 'insert peg-out', false);

      if (existing) {
        const conflicts = existing.ergo_recipient_address !== ergoRecipient
          || existing.amount_nanoerg !== amount.toString()
          || existing.sidechain_burn_height !== height
          || (
            metadata.user !== undefined
            && existing.user !== null
            && existing.user.toLowerCase() !== metadata.user.toLowerCase()
          )
          || (
            sidechainBlockHash !== null
            && existing.sidechain_block_hash !== null
            && normalizeFixedHex(
              existing.sidechain_block_hash,
              32,
              'persisted sidechainBlockHash',
            ) !== sidechainBlockHash
          )
          || (
            sidechainId !== null
            && existing.sidechain_id !== null
            && normalizeFixedHex(existing.sidechain_id, 32, 'persisted sidechainId') !== sidechainId
          )
          || (
            burnId !== null
            && existing.burn_id !== null
            && normalizeBurnId(existing.burn_id) !== burnId
          );
        if (conflicts) {
          throw new Error('peg-out event identity conflicts with an existing persisted row');
        }
        this.db.prepare(`
          UPDATE peg_out_events
          SET user = COALESCE(user, ?),
              sidechain_block_hash = COALESCE(sidechain_block_hash, ?),
              sidechain_id = COALESCE(sidechain_id, ?),
              burn_id = COALESCE(burn_id, ?),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          metadata.user ?? null,
          sidechainBlockHash,
          sidechainId,
          burnId,
          existing.id,
        );
        return;
      }

      if (burnId !== null && this.resolvePegOutRow({ burnId }, 'insert peg-out', false)) {
        throw new Error('peg-out burnId conflicts with a different persisted event coordinate');
      }
      this.db.prepare(`
        INSERT INTO peg_out_events
          (
            sidechain_burn_tx_hash,
            sidechain_id,
            burn_id,
            ergo_recipient_address,
            amount_nanoerg,
            sidechain_burn_height,
            user,
            sidechain_block_hash,
            sidechain_log_index
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedBurnTxHash,
        sidechainId,
        burnId,
        ergoRecipient,
        amount.toString(),
        height,
        metadata.user ?? null,
        sidechainBlockHash,
        sidechainLogIndex,
      );
    });
    insert.immediate();
  }

  repairDetectedPegOut(
    lookup: PegOutEventLookup,
    ergoRecipient: string,
    amount: bigint,
    height: number,
    metadata: PegOutBurnMetadata = {},
  ): boolean {
    this.assertWritable('repair detected peg-out');
    const repair = this.db.transaction((): boolean => {
      const existing = this.requirePegOut(lookup, 'repair detected peg-out');
      const persistedBurnTxHash = normalizeBurnTxHash(existing.sidechain_burn_tx_hash);
      const sidechainLogIndex = metadata.sidechainLogIndex === undefined
        ? existing.sidechain_log_index
        : normalizeUint32(metadata.sidechainLogIndex, 'sidechainLogIndex');
      if (
        existing.sidechain_log_index !== null
        && sidechainLogIndex !== existing.sidechain_log_index
      ) {
        throw new Error('repair cannot change an existing peg-out event log index');
      }
      const sidechainId = metadata.sidechainId === undefined
        ? existing.sidechain_id
        : normalizeFixedHex(metadata.sidechainId, 32, 'sidechainId');
      if (
        existing.sidechain_id !== null
        && sidechainId !== null
        && normalizeFixedHex(existing.sidechain_id, 32, 'persisted sidechainId') !== sidechainId
      ) {
        throw new Error('repair cannot change an existing peg-out sidechainId');
      }
      if (sidechainId !== null && sidechainLogIndex === null) {
        throw new Error('sidechainId requires sidechainLogIndex for peg-out burn identity');
      }
      const burnId = sidechainId === null || sidechainLogIndex === null
        ? existing.burn_id
        : deriveTrustlessBurnIdHex({
          sidechainIdHex: sidechainId,
          sidechainTxHashHex: persistedBurnTxHash,
          eventIndex: sidechainLogIndex,
        });
      if (
        existing.burn_id !== null
        && burnId !== null
        && normalizeBurnId(existing.burn_id) !== burnId
      ) {
        throw new Error('repair cannot change an existing peg-out burnId');
      }
      const sidechainBlockHash = metadata.sidechainBlockHash === undefined
        ? null
        : normalizeFixedHex(metadata.sidechainBlockHash, 32, 'sidechainBlockHash');
      const result = this.db.prepare(`
        UPDATE peg_out_events
        SET ergo_recipient_address = ?,
            amount_nanoerg = ?,
            sidechain_burn_height = ?,
            user = COALESCE(?, user),
            sidechain_block_hash = COALESCE(?, sidechain_block_hash),
            sidechain_log_index = COALESCE(?, sidechain_log_index),
            sidechain_id = COALESCE(?, sidechain_id),
            burn_id = COALESCE(?, burn_id),
            phase1_box_id = NULL,
            phase2_unlock_tx_id = NULL,
            avl_proof_hex = NULL,
            pending_avl_key = NULL,
            ergo_anchor_height = NULL,
            updated_at = datetime('now')
        WHERE id = ?
          AND status = 'detected'
      `).run(
        ergoRecipient,
        amount.toString(),
        height,
        metadata.user ?? null,
        sidechainBlockHash,
        sidechainLogIndex,
        sidechainId,
        burnId,
        existing.id,
      );
      if (result.changes > 0 && burnId !== null) {
        this.db.prepare(`
          UPDATE authenticated_settlement_candidates
          SET status = 'invalidated',
              invalidation_reason = 'peg-out semantics were repaired after candidate preparation',
              updated_at = datetime('now')
          WHERE burn_id = ?
            AND status IN ('prepared', 'check_passed')
        `).run(normalizeBurnId(burnId));
      }
      return result.changes > 0;
    });
    return repair.immediate();
  }

  updatePegOutStatus(lookup: PegOutEventLookup, status: PegOutStatus, extra?: { phase1BoxId?: string; phase2TxId?: string; avlProof?: string; pendingAvlKey?: string }): void {
    this.assertWritable(`update peg-out status to ${status}`);
    const pegOut = this.requirePegOut(lookup, `update peg-out status to ${status}`);
    if (status === 'failed') {
      throw new Error(
        `Cannot create ${LEGACY_FAILED_PEG_OUT_CLASS_V1}; peg-out failures require a versioned reconstruction path`,
      );
    }
    if (pegOut.status === 'failed') {
      throw new Error(
        `Cannot transition ${LEGACY_FAILED_PEG_OUT_CLASS_V1} without external settlement reconstruction`,
      );
    }
    const result = this.db.prepare(`
      UPDATE peg_out_events
      SET status = ?,
          phase1_box_id = COALESCE(?, phase1_box_id),
          phase2_unlock_tx_id = COALESCE(?, phase2_unlock_tx_id),
          avl_proof_hex = COALESCE(?, avl_proof_hex),
          pending_avl_key = COALESCE(?, pending_avl_key),
          updated_at = datetime('now')
      WHERE id = ?
        AND (status != 'burn_reverted' OR ? = 'burn_reverted')
    `).run(
      status,
      extra?.phase1BoxId ?? null,
      extra?.phase2TxId ?? null,
      extra?.avlProof ?? null,
      extra?.pendingAvlKey ?? null,
      pegOut.id,
      status,
    );
    if (result.changes !== 1) {
      throw new Error(`Cannot transition terminal burn_reverted peg-out to ${status}`);
    }
  }

  getPendingPegOuts(): PegOutEvent[] {
    return this.db.prepare(`
      SELECT * FROM peg_out_events WHERE status IN ('detected', 'confirmed', 'phase1_created', 'aggregate_submitted', 'batch_submitted')
      ORDER BY sidechain_burn_height ASC, id ASC
    `).all() as PegOutEvent[];
  }

  getSubmittedSettlementTxId(
    lookup: PegOutEventLookup,
    expectedStatus: SubmittedSettlementStatus,
  ): string | null {
    const row = this.resolvePegOutRow(
      lookup,
      'get submitted settlement transaction',
      false,
    ) as {
      status: PegOutStatus;
      phase1_box_id: string | null;
      phase2_unlock_tx_id: string | null;
    } | undefined;

    if (!row || row.status !== expectedStatus) return null;
    return row.phase1_box_id ?? row.phase2_unlock_tx_id ?? null;
  }

  recordAggregateSettlementAttempt(
    mode: AggregateSettlementAttemptMode,
    burnTxHashes: string[],
    expectedTxId: string,
    expectedFundsReleaseStateDigestHex?: string,
    expectedFundsExecutionAuthorityEpochHex?: string,
  ): AggregateSettlementJournalAdmission {
    this.assertWritable('record aggregate settlement attempt');
    const normalizedBurns = burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(mode, normalizedBurns);
    if (new Set(normalizedBurns).size !== normalizedBurns.length) {
      throw new Error('legacy aggregate journal requires unique transaction hashes per claim');
    }
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const burnTxHashesJson = JSON.stringify(normalizedBurns);
    if (
      (expectedFundsReleaseStateDigestHex === undefined)
      !== (expectedFundsExecutionAuthorityEpochHex === undefined)
    ) {
      throw new Error(
        'aggregate settlement admission requires both funds-release digest and authority epoch',
      );
    }
    const fundsReleaseAuthorityEpochHex =
      expectedFundsExecutionAuthorityEpochHex === undefined
        ? null
        : normalizeFixedHex(
            expectedFundsExecutionAuthorityEpochHex,
            32,
            'aggregate settlement funds execution authority epoch',
          );
    const record = this.db.transaction(() => {
      if (expectedFundsReleaseStateDigestHex !== undefined) {
        this.assertFundsReleaseAuthorized(
          expectedFundsReleaseStateDigestHex,
          fundsReleaseAuthorityEpochHex!,
        );
      }
      const activeReservations = this.db.prepare(`
        SELECT reservation_digest, burn_tx_hash, expected_tx_id
        FROM authenticated_settlement_execution_reservations
        WHERE status = 'active'
        ORDER BY id ASC
      `).all() as Array<{
        reservation_digest: string;
        burn_tx_hash: string;
        expected_tx_id: string;
      }>;
      for (const reservation of activeReservations) {
        if (
          reservation.expected_tx_id === normalizedExpectedTxId
          || normalizedBurns.includes(reservation.burn_tx_hash)
        ) {
          throw new Error(
            `authenticated execution reservation ${reservation.reservation_digest} conflicts with legacy aggregate journal`,
          );
        }
      }

      for (const burnTxHash of normalizedBurns) {
        const eventCount = this.getPegOutEventCountByTxHash(burnTxHash);
        if (eventCount !== 1) {
          throw new Error(
            `legacy aggregate journal requires exactly one persisted burn event per transaction hash; found ${eventCount}`,
          );
        }
      }

      const activeAttempts = this.db.prepare(`
        SELECT expected_tx_id, burn_tx_hashes_json
        FROM aggregate_settlement_attempts
        WHERE status IN ('pending', 'submitted')
          AND expected_tx_id != ?
        ORDER BY id ASC
      `).all(normalizedExpectedTxId) as Array<{
        expected_tx_id: string;
        burn_tx_hashes_json: string;
      }>;
      for (const activeAttempt of activeAttempts) {
        const activeBurns = parseAggregateBurnTxHashesJson(
          activeAttempt.burn_tx_hashes_json,
          `active legacy aggregate journal ${activeAttempt.expected_tx_id}`,
        );
        const overlap = normalizedBurns.find(burnTxHash => activeBurns.includes(burnTxHash));
        if (overlap) {
          throw new Error(
            `active legacy aggregate journal ${activeAttempt.expected_tx_id} already claims burn ${overlap}`,
          );
        }
      }

      const existing = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;

      if (existing) {
        if (existing.mode !== mode || existing.burn_tx_hashes_json !== burnTxHashesJson) {
          throw new Error(
            `aggregate settlement attempt ${normalizedExpectedTxId} does not match existing journal row`,
          );
        }
        if (
          fundsReleaseAuthorityEpochHex !== null
          && existing.funds_release_authority_epoch
            !== fundsReleaseAuthorityEpochHex
        ) {
          throw new Error(
            `aggregate settlement attempt ${normalizedExpectedTxId} belongs to a different execution authority`,
          );
        }
        if (existing.status === 'abandoned') {
          if (existing.transport_reservation_digest !== null) {
            throw new Error(
              `aggregate settlement attempt ${normalizedExpectedTxId} has unresolved transport provenance`,
            );
          }
          if (
            existing.recovery_binding_status !== 'policy_v1'
            || existing.recovery_policy_version !== DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.version
            || existing.recovery_required_confirmations
              !== DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.requiredConfirmations
          ) {
            throw new Error(
              `legacy-unbound aggregate settlement attempt ${normalizedExpectedTxId} cannot be reactivated automatically`,
            );
          }
          this.db.prepare(`
            UPDATE aggregate_settlement_attempts
            SET status = 'pending',
                abandonment_reason = NULL,
                submitted_tx_id = NULL,
                lifecycle_version = lifecycle_version + 1,
                transport_reservation_digest = NULL,
                funds_release_authority_epoch = ?,
                transport_started_at = NULL,
                transport_completed_at = NULL,
                ergo_observation_policy_version = NULL,
                ergo_observation_required_confirmations = NULL,
                ergo_observation_status = NULL,
                ergo_observation_transaction_digest = NULL,
                ergo_observation_inclusion_height = NULL,
                ergo_observation_inclusion_header_id = NULL,
                ergo_observation_tip_height = NULL,
                ergo_observation_tip_header_id = NULL,
                ergo_observation_confirmations = NULL,
                ergo_observation_digest = NULL,
                ergo_observation_source_count = 0,
                ergo_observation_consensus_digest = NULL,
                updated_at = datetime('now')
            WHERE expected_tx_id = ?
          `).run(
            fundsReleaseAuthorityEpochHex,
            normalizedExpectedTxId,
          );
        }
        return;
      }

      this.db.prepare(`
        INSERT INTO aggregate_settlement_attempts (
          mode,
          expected_tx_id,
          burn_tx_hashes_json,
          funds_release_authority_epoch,
          recovery_binding_status,
          recovery_policy_version,
          recovery_required_confirmations
        )
        VALUES (?, ?, ?, ?, 'policy_v1', ?, ?)
      `).run(
        mode,
        normalizedExpectedTxId,
        burnTxHashesJson,
        fundsReleaseAuthorityEpochHex,
        DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.version,
        DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.requiredConfirmations,
      );
    });
    record.immediate();
    const attempt = this.getAggregateSettlementAttempt(normalizedExpectedTxId);
    if (
      !attempt
      || attempt.status !== 'pending'
      || attempt.mode !== mode
      || JSON.stringify(attempt.burnTxHashes) !== burnTxHashesJson
      || attempt.transportReservationDigest !== null
      || attempt.fundsReleaseAuthorityEpochHex
        !== fundsReleaseAuthorityEpochHex
    ) {
      throw new Error(
        `aggregate settlement attempt ${normalizedExpectedTxId} is not an admissible pending journal`,
      );
    }
    return {
      expectedTxId: attempt.expectedTxId,
      lifecycleVersion: attempt.lifecycleVersion,
      mode: attempt.mode,
      burnTxHashes: [...attempt.burnTxHashes],
      fundsReleaseAuthorityEpochHex:
        attempt.fundsReleaseAuthorityEpochHex,
    };
  }

  getOutstandingPegOutLiabilityObservations():
    readonly OutstandingPegOutLiabilityObservation[] {
    const rows = this.db.prepare(`
      SELECT
        sidechain_burn_tx_hash,
        sidechain_id,
        burn_id,
        ergo_recipient_address,
        amount_nanoerg,
        sidechain_burn_height,
        sidechain_block_hash,
        sidechain_log_index,
        phase1_box_id,
        phase2_unlock_tx_id,
        status
      FROM peg_out_events
      ORDER BY sidechain_burn_height ASC, id ASC
    `).all() as Array<{
      sidechain_burn_tx_hash: string;
      sidechain_id: string | null;
      burn_id: string | null;
      ergo_recipient_address: string;
      amount_nanoerg: string;
      sidechain_burn_height: number;
      sidechain_block_hash: string | null;
      sidechain_log_index: number | null;
      phase1_box_id: string | null;
      phase2_unlock_tx_id: string | null;
      status: string;
    }>;

    return Object.freeze(rows.map((row) => {
      if (row.sidechain_id === null) {
        throw new Error('outstanding peg-out liability requires a canonical sidechain ID');
      }
      if (row.burn_id === null) {
        throw new Error('outstanding peg-out liability requires a canonical burn ID');
      }
      if (row.sidechain_block_hash === null) {
        throw new Error('outstanding peg-out liability requires a canonical sidechain block hash');
      }
      if (row.sidechain_log_index === null) {
        throw new Error('outstanding peg-out liability requires a canonical sidechain log index');
      }
      const sidechainIdHex = normalizeFixedHex(
        row.sidechain_id,
        32,
        'outstanding peg-out sidechain ID',
      );
      const sidechainTransactionHashHex = normalizeBurnTxHash(
        row.sidechain_burn_tx_hash,
      );
      const sidechainLogIndex = normalizeUint32(
        row.sidechain_log_index,
        'outstanding peg-out sidechain log index',
      );
      const burnIdHex = normalizeBurnId(row.burn_id);
      const expectedBurnIdHex = deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: sidechainTransactionHashHex,
        eventIndex: sidechainLogIndex,
      });
      if (burnIdHex !== expectedBurnIdHex) {
        throw new Error('outstanding peg-out burn ID does not match its event identity');
      }
      const amountNanoErg = BigInt(normalizePositiveLongText(
        row.amount_nanoerg,
        'outstanding peg-out liability amount',
      ));
      const sidechainBurnHeight = normalizeNonnegativeSignedInt(
        row.sidechain_burn_height,
        'outstanding peg-out burn height',
      );
      const sidechainBlockHashHex = normalizeFixedHex(
        row.sidechain_block_hash,
        32,
        'outstanding peg-out sidechain block hash',
      );
      if (row.ergo_recipient_address.length === 0) {
        throw new Error('outstanding peg-out recipient must be non-empty');
      }
      const phase2UnlockTransactionIdHex = row.phase2_unlock_tx_id === null
        ? null
        : normalizeFixedHex(
          row.phase2_unlock_tx_id,
          32,
          'outstanding peg-out phase-2 settlement transaction ID',
        );
      const submittedStatus = row.status === 'aggregate_submitted'
        || row.status === 'batch_submitted';
      const phase1ReferenceHex = row.phase1_box_id === null
        ? null
        : normalizeFixedHex(
          row.phase1_box_id,
          32,
          'outstanding peg-out phase-1 reference',
        );
      if (
        submittedStatus
        && phase1ReferenceHex !== null
        && phase2UnlockTransactionIdHex !== null
        && phase1ReferenceHex !== phase2UnlockTransactionIdHex
      ) {
        throw new Error(
          'outstanding submitted peg-out has conflicting settlement transaction IDs',
        );
      }
      const observation = Object.freeze({
        burnIdHex,
        sidechainIdHex,
        sidechainTransactionHashHex,
        sidechainBlockHashHex,
        sidechainLogIndex,
        sidechainBurnHeight,
        amountNanoErg,
        ergoRecipientAddress: row.ergo_recipient_address,
        inFlightSettlementTransactionIdHex: submittedStatus
          ? phase1ReferenceHex ?? phase2UnlockTransactionIdHex
          : null,
        phase2UnlockTransactionIdHex,
        status: row.status as OutstandingPegOutLiabilityStatus,
      });
      assertOutstandingPegOutLiabilityObservation(observation);
      return observation;
    }));
  }

  startPendingAggregateSettlementSubmission(
    admission: AggregateSettlementJournalAdmission,
    expectedFundsReleaseStateDigestHex?: string,
    expectedFundsExecutionAuthorityEpochHex?: string,
  ): AggregateSettlementTransportReservation {
    this.assertWritable('start pending aggregate settlement submission');
    const expectedTxId = normalizeSettlementTxId(admission.expectedTxId);
    if (!Number.isSafeInteger(admission.lifecycleVersion) || admission.lifecycleVersion < 0) {
      throw new Error('aggregate settlement submission lifecycle version must be nonnegative');
    }
    const burnTxHashes = admission.burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(admission.mode, burnTxHashes);
    if (new Set(burnTxHashes).size !== burnTxHashes.length) {
      throw new Error('aggregate settlement submission requires unique burn transaction hashes');
    }
    const burnTxHashesJson = JSON.stringify(burnTxHashes);
    if (
      (expectedFundsReleaseStateDigestHex === undefined)
      !== (expectedFundsExecutionAuthorityEpochHex === undefined)
    ) {
      throw new Error(
        'aggregate settlement reservation requires both funds-release digest and authority epoch',
      );
    }
    const fundsReleaseAuthorityEpochHex =
      expectedFundsExecutionAuthorityEpochHex === undefined
        ? null
        : normalizeFixedHex(
            expectedFundsExecutionAuthorityEpochHex,
            32,
            'aggregate settlement reservation authority epoch',
          );
    if (
      admission.fundsReleaseAuthorityEpochHex !== undefined
      && admission.fundsReleaseAuthorityEpochHex
        !== fundsReleaseAuthorityEpochHex
    ) {
      throw new Error(
        'aggregate settlement admission authority epoch changed before reservation',
      );
    }
    const reservationDigest = randomBytes(32).toString('hex');
    const reserve = this.db.transaction(() => {
      if (expectedFundsReleaseStateDigestHex !== undefined) {
        this.assertFundsReleaseAuthorized(
          expectedFundsReleaseStateDigestHex,
          fundsReleaseAuthorityEpochHex!,
        );
      }
      const result = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET transport_reservation_digest = ?,
            transport_started_at = datetime('now'),
            transport_completed_at = NULL,
            lifecycle_version = lifecycle_version + 1,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND status = 'pending'
          AND mode = ?
          AND burn_tx_hashes_json = ?
          AND (
            (funds_release_authority_epoch IS NULL AND ? IS NULL)
            OR funds_release_authority_epoch = ?
          )
          AND transport_reservation_digest IS NULL
      `).run(
        reservationDigest,
        expectedTxId,
        admission.lifecycleVersion,
        admission.mode,
        burnTxHashesJson,
        fundsReleaseAuthorityEpochHex,
        fundsReleaseAuthorityEpochHex,
      );
      if (result.changes !== 1) {
        throw new Error(
          `aggregate settlement ${expectedTxId} changed before transport reservation`,
        );
      }
      return {
        expectedTxId,
        lifecycleVersion: admission.lifecycleVersion + 1,
        mode: admission.mode,
        burnTxHashes,
        fundsReleaseAuthorityEpochHex,
        reservationDigest,
      };
    });
    return reserve.immediate();
  }

  applyAggregateSettlementRecoveryObservation(
    input: AggregateSettlementRecoveryMutationInput,
  ): AggregateSettlementRecoveryMutationResult {
    this.assertWritable('apply aggregate settlement recovery observation');
    const expectedTxId = normalizeSettlementTxId(input.expectedTxId);
    if (!Number.isSafeInteger(input.expectedLifecycleVersion) || input.expectedLifecycleVersion < 0) {
      throw new Error('aggregate settlement expected lifecycle version must be nonnegative');
    }
    if (input.expectedStatus !== 'pending' && input.expectedStatus !== 'submitted') {
      throw new Error('aggregate settlement recovery expects pending or submitted state');
    }
    const expectedSubmittedTxId = input.expectedSubmittedTxId === null
      ? null
      : normalizeSettlementTxId(input.expectedSubmittedTxId);
    const normalizedBurns = input.burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(input.mode, normalizedBurns);
    const expectedBurnsJson = JSON.stringify(normalizedBurns);
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation: input.observation,
      consensus: input.consensus,
    });
    if (authority.observation.transactionIdHex !== expectedTxId) {
      throw new Error('aggregate settlement recovery observation transaction does not match the journal');
    }

    const emptyResult = (): AggregateSettlementRecoveryMutationResult => ({
      applied: false,
      restoredBurns: 0,
      skippedBurns: 0,
      missingPegOuts: 0,
      rolledBackBurns: 0,
      rolledBackPreFinality: false,
    });
    const run = this.db.transaction((): AggregateSettlementRecoveryMutationResult => {
      const raw = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(expectedTxId) as any | undefined;
      if (!raw) return emptyResult();
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (
        attempt.lifecycleVersion !== input.expectedLifecycleVersion
        || attempt.status !== input.expectedStatus
        || attempt.submittedTxId !== expectedSubmittedTxId
        || attempt.mode !== input.mode
        || JSON.stringify(attempt.burnTxHashes) !== expectedBurnsJson
      ) {
        return emptyResult();
      }
      if (
        attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        throw new Error('aggregate settlement recovery policy is legacy or does not match the observation');
      }
      if (
        attempt.ergoObservation?.status === 'confirmed_final'
        && authority.observation.status !== 'confirmed_final'
      ) {
        throw new Error('final aggregate settlement observation cannot roll back automatically');
      }

      const submittedStatus = submittedStatusForAggregateMode(input.mode);
      if (
        authority.observation.status === 'absent'
        && attempt.ergoObservation?.status === 'confirmed_pre_finality'
      ) {
        if (
          authority.sourceCount < 2
          || authority.consensusDigestHex === null
          || authority.sourceAuthorityProfile
            !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
        ) {
          throw new Error('pre-finality rollback requires matching observations from distinct Ergo sources');
        }
        const rows: Array<{ id: number; burnTxHash: string }> = [];
        let skippedBurns = 0;
        for (const burnTxHash of normalizedBurns) {
          const row = this.resolvePegOutRow(
            burnTxHash,
            'roll back pre-finality aggregate settlement',
            false,
          ) as {
            id: number;
            status: PegOutStatus;
            phase1_box_id: string | null;
            phase2_unlock_tx_id: string | null;
            pending_avl_key: string | null;
          } | undefined;
          if (!row) {
            return { ...emptyResult(), missingPegOuts: 1 };
          }
          if (row.status === 'detected' || row.status === 'confirmed') {
            skippedBurns++;
            continue;
          }
          const submittedTxId = row.phase1_box_id ?? row.phase2_unlock_tx_id;
          const pendingAvlKey = normalizeBurnTxHash(row.pending_avl_key ?? burnTxHash);
          if (
            row.status !== submittedStatus
            || submittedTxId !== expectedTxId
            || pendingAvlKey !== burnTxHash
          ) {
            throw new Error(`pre-finality rollback burn ${burnTxHash} no longer matches the journal`);
          }
          const avlRow = this.db.prepare(`
            SELECT 1 FROM avl_tree_history WHERE key_hex = ?
          `).get(pendingAvlKey);
          if (avlRow) {
            throw new Error(`pre-finality rollback cannot remove committed AVL key ${pendingAvlKey}`);
          }
          rows.push({ id: row.id, burnTxHash });
        }
        for (const row of rows) {
          const result = this.db.prepare(`
            UPDATE peg_out_events
            SET status = 'detected',
                phase1_box_id = NULL,
                phase2_unlock_tx_id = NULL,
                avl_proof_hex = NULL,
                pending_avl_key = NULL,
                ergo_anchor_height = NULL,
                updated_at = datetime('now')
            WHERE id = ?
              AND status = ?
              AND COALESCE(phase1_box_id, phase2_unlock_tx_id) = ?
              AND COALESCE(pending_avl_key, sidechain_burn_tx_hash) = ?
          `).run(row.id, submittedStatus, expectedTxId, row.burnTxHash);
          if (result.changes !== 1) {
            throw new Error(`pre-finality rollback CAS failed for burn ${row.burnTxHash}`);
          }
        }
        const result = this.db.prepare(`
          UPDATE aggregate_settlement_attempts
          SET status = 'pending',
              submitted_tx_id = NULL,
              lifecycle_version = lifecycle_version + 1,
              transport_reservation_digest = NULL,
              transport_started_at = NULL,
              transport_completed_at = NULL,
              ergo_observation_policy_version = ?,
              ergo_observation_required_confirmations = ?,
              ergo_observation_status = ?,
              ergo_observation_transaction_digest = ?,
              ergo_observation_inclusion_height = ?,
              ergo_observation_inclusion_header_id = ?,
              ergo_observation_tip_height = ?,
              ergo_observation_tip_header_id = ?,
              ergo_observation_confirmations = ?,
              ergo_observation_digest = ?,
              ergo_observation_source_count = ?,
              ergo_observation_consensus_digest = ?,
              updated_at = datetime('now')
          WHERE expected_tx_id = ?
            AND lifecycle_version = ?
            AND status = ?
        `).run(
          authority.observation.policyVersion,
          authority.observation.requiredConfirmations,
          authority.observation.status,
          authority.observation.transactionDigestHex,
          authority.observation.inclusionHeight,
          authority.observation.inclusionHeaderIdHex,
          authority.observation.observedTipHeight,
          authority.observation.observedTipHeaderIdHex,
          authority.observation.confirmations,
          authority.observation.observationDigestHex,
          authority.sourceCount,
          authority.consensusDigestHex,
          expectedTxId,
          input.expectedLifecycleVersion,
          input.expectedStatus,
        );
        if (result.changes !== 1) {
          throw new Error(`pre-finality rollback journal CAS failed for ${expectedTxId}`);
        }
        return {
          applied: true,
          restoredBurns: 0,
          skippedBurns,
          missingPegOuts: 0,
          rolledBackBurns: rows.length,
          rolledBackPreFinality: true,
        };
      }

      if (authority.observation.status === 'absent') {
        if (attempt.status === 'pending' && attempt.transportReservationDigest !== null) {
          return emptyResult();
        }
        const result = this.db.prepare(`
          UPDATE aggregate_settlement_attempts
          SET lifecycle_version = lifecycle_version + 1,
              ergo_observation_policy_version = ?,
              ergo_observation_required_confirmations = ?,
              ergo_observation_status = ?,
              ergo_observation_transaction_digest = ?,
              ergo_observation_inclusion_height = ?,
              ergo_observation_inclusion_header_id = ?,
              ergo_observation_tip_height = ?,
              ergo_observation_tip_header_id = ?,
              ergo_observation_confirmations = ?,
              ergo_observation_digest = ?,
              ergo_observation_source_count = ?,
              ergo_observation_consensus_digest = ?,
              updated_at = datetime('now')
          WHERE expected_tx_id = ?
            AND lifecycle_version = ?
            AND status = ?
        `).run(
          authority.observation.policyVersion,
          authority.observation.requiredConfirmations,
          authority.observation.status,
          authority.observation.transactionDigestHex,
          authority.observation.inclusionHeight,
          authority.observation.inclusionHeaderIdHex,
          authority.observation.observedTipHeight,
          authority.observation.observedTipHeaderIdHex,
          authority.observation.confirmations,
          authority.observation.observationDigestHex,
          authority.sourceCount,
          authority.consensusDigestHex,
          expectedTxId,
          input.expectedLifecycleVersion,
          input.expectedStatus,
        );
        if (result.changes !== 1) return emptyResult();
        return { ...emptyResult(), applied: true };
      }

      const rows: Array<{ id: number; burnTxHash: string }> = [];
      let skippedBurns = 0;
      let missingPegOuts = 0;
      for (const burnTxHash of normalizedBurns) {
        const row = this.resolvePegOutRow(
          burnTxHash,
          'restore aggregate settlement attempt',
          false,
        ) as {
          id: number;
          status: PegOutStatus;
          phase1_box_id: string | null;
          phase2_unlock_tx_id: string | null;
          pending_avl_key: string | null;
        } | undefined;
        if (!row) {
          missingPegOuts++;
          continue;
        }
        if (row.status === 'detected' || row.status === 'confirmed') {
          rows.push({ id: row.id, burnTxHash });
          continue;
        }
        const submittedTxId = row.phase1_box_id ?? row.phase2_unlock_tx_id;
        const pendingAvlKey = normalizeBurnTxHash(row.pending_avl_key ?? burnTxHash);
        if (
          row.status === submittedStatus
          && submittedTxId === expectedTxId
          && pendingAvlKey === burnTxHash
        ) {
          skippedBurns++;
          continue;
        }
        throw new Error(`aggregate settlement recovery burn ${burnTxHash} has incompatible state ${row.status}`);
      }
      if (missingPegOuts > 0) {
        return { ...emptyResult(), missingPegOuts };
      }

      const attemptResult = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'submitted',
            submitted_tx_id = ?,
            lifecycle_version = lifecycle_version + 1,
            transport_completed_at = CASE
              WHEN transport_reservation_digest IS NULL THEN transport_completed_at
              ELSE datetime('now')
            END,
            ergo_observation_policy_version = ?,
            ergo_observation_required_confirmations = ?,
            ergo_observation_status = ?,
            ergo_observation_transaction_digest = ?,
            ergo_observation_inclusion_height = ?,
            ergo_observation_inclusion_header_id = ?,
            ergo_observation_tip_height = ?,
            ergo_observation_tip_header_id = ?,
            ergo_observation_confirmations = ?,
            ergo_observation_digest = ?,
            ergo_observation_source_count = ?,
            ergo_observation_consensus_digest = ?,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND status = ?
      `).run(
        expectedTxId,
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        authority.sourceCount,
        authority.consensusDigestHex,
        expectedTxId,
        input.expectedLifecycleVersion,
        input.expectedStatus,
      );
      if (attemptResult.changes !== 1) return emptyResult();

      for (const row of rows) {
        const result = this.db.prepare(`
          UPDATE peg_out_events
          SET status = ?,
              phase1_box_id = ?,
              pending_avl_key = ?,
              updated_at = datetime('now')
          WHERE id = ?
            AND status IN ('detected', 'confirmed')
        `).run(submittedStatus, expectedTxId, row.burnTxHash, row.id);
        if (result.changes !== 1) {
          throw new Error(`aggregate settlement recovery CAS failed for burn ${row.burnTxHash}`);
        }
      }
      return {
        applied: true,
        restoredBurns: rows.length,
        skippedBurns,
        missingPegOuts: 0,
        rolledBackBurns: 0,
        rolledBackPreFinality: false,
      };
    });
    return run.immediate();
  }

  markAggregateSettlementAttemptSubmitted(
    reservation: AggregateSettlementTransportReservation,
    submittedTxId: string,
  ): boolean {
    this.assertWritable('mark aggregate settlement attempt submitted');
    const normalizedExpectedTxId = normalizeSettlementTxId(reservation.expectedTxId);
    const normalizedSubmittedTxId = normalizeSettlementTxId(submittedTxId);
    if (normalizedSubmittedTxId !== normalizedExpectedTxId) {
      throw new Error(
        `submitted aggregate settlement tx ${normalizedSubmittedTxId} does not match expected ${normalizedExpectedTxId}`,
      );
    }
    if (!Number.isSafeInteger(reservation.lifecycleVersion) || reservation.lifecycleVersion < 1) {
      throw new Error('aggregate settlement transport lifecycle version must be positive');
    }
    const normalizedBurns = reservation.burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(reservation.mode, normalizedBurns);
    const reservationDigest = normalizeFixedHex(
      reservation.reservationDigest,
      32,
      'aggregate settlement transport reservation digest',
    );

    const result = this.db.prepare(`
      UPDATE aggregate_settlement_attempts
      SET status = 'submitted',
          submitted_tx_id = ?,
          lifecycle_version = lifecycle_version + 1,
          transport_completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE expected_tx_id = ?
        AND lifecycle_version = ?
        AND status = 'pending'
        AND mode = ?
        AND burn_tx_hashes_json = ?
        AND transport_reservation_digest = ?
        AND transport_started_at IS NOT NULL
        AND transport_completed_at IS NULL
    `).run(
      normalizedSubmittedTxId,
      normalizedExpectedTxId,
      reservation.lifecycleVersion,
      reservation.mode,
      JSON.stringify(normalizedBurns),
      reservationDigest,
    );
    return result.changes > 0;
  }

  private hasExactSpvTrackerEntry(entry: SpvTrackerHistoryEntry): boolean {
    const row = this.db.prepare(`
      SELECT value_hex, sidechain_height, sidechain_header_hash, bridge_event_root, ergo_anchor_height
      FROM spv_tracker_history
      WHERE key_hex = ?
    `).get(entry.keyHex) as {
      value_hex: string;
      sidechain_height: string;
      sidechain_header_hash: string;
      bridge_event_root: string;
      ergo_anchor_height: number;
    } | undefined;
    return row !== undefined
      && row.value_hex === entry.valueHex
      && row.sidechain_height === entry.sidechainHeight.toString()
      && row.sidechain_header_hash === entry.sidechainHeaderHash
      && row.bridge_event_root === entry.bridgeEventRoot
      && row.ergo_anchor_height === entry.ergoAnchorHeight;
  }

  private matchesExpectedSpvTrackerSuccessorDigest(
    expectedDigestHex: string,
    trackerEntry?: SpvTrackerHistoryEntry,
  ): boolean {
    const expectedDigest = normalizeFixedHex(
      expectedDigestHex,
      33,
      'confirmed tracker successor digest',
    );
    const history = this.getSpvTrackerHistory().map(entry => ({
      key: normalizeFixedHex(entry.key, 32, 'persisted SPV tracker key'),
      value: normalizeFixedHex(entry.value, 36, 'persisted SPV tracker value'),
    }));
    if (trackerEntry) {
      const key = normalizeFixedHex(trackerEntry.keyHex, 32, 'SPV tracker ingest key');
      const value = normalizeFixedHex(trackerEntry.valueHex, 36, 'SPV tracker ingest value');
      const existing = history.find(entry => entry.key === key);
      if (existing && existing.value !== value) return false;
      if (!existing) history.push({ key, value });
    }
    return getSpvTrackerDigest(history) === expectedDigest;
  }

  private refreshConfirmedAggregateSettlementObservation(
    expectedTxId: string,
    attempt: AggregateSettlementAttempt,
    observation: AggregateSettlementErgoObservationRecord,
    trackerEntry?: SpvTrackerHistoryEntry,
  ): boolean {
    if (attempt.recoveryQuarantine !== null) return false;
    if (!canAdvanceConfirmedAggregateSettlementObservation(attempt.ergoObservation, observation)) {
      return false;
    }
    if (trackerEntry && !this.hasExactSpvTrackerEntry(trackerEntry)) return false;
    if (attempt.ergoObservation!.observationDigestHex === observation.observationDigestHex) {
      return true;
    }
    const result = this.db.prepare(`
      UPDATE aggregate_settlement_attempts
      SET lifecycle_version = lifecycle_version + 1,
          ergo_observation_policy_version = ?,
          ergo_observation_required_confirmations = ?,
          ergo_observation_status = ?,
          ergo_observation_transaction_digest = ?,
          ergo_observation_inclusion_height = ?,
          ergo_observation_inclusion_header_id = ?,
          ergo_observation_tip_height = ?,
          ergo_observation_tip_header_id = ?,
          ergo_observation_confirmations = ?,
          ergo_observation_digest = ?,
          ergo_observation_source_count = 1,
          ergo_observation_consensus_digest = NULL,
          updated_at = datetime('now')
      WHERE expected_tx_id = ?
        AND status = 'confirmed'
        AND lifecycle_version = ?
        AND ergo_observation_digest = ?
    `).run(
      observation.policyVersion,
      observation.requiredConfirmations,
      observation.status,
      observation.transactionDigestHex,
      observation.inclusionHeight,
      observation.inclusionHeaderIdHex,
      observation.observedTipHeight,
      observation.observedTipHeaderIdHex,
      observation.confirmations,
      observation.observationDigestHex,
      expectedTxId,
      attempt.lifecycleVersion,
      attempt.ergoObservation!.observationDigestHex,
    );
    return result.changes === 1;
  }

  confirmSubmittedSingleSettlementAttempt(
    expectedTxId: string,
    expectedLifecycleVersion: number,
    mode: Exclude<AggregateSettlementAttemptMode, 'batch'>,
    burnTxHash: string,
    observation: StableAggregateSettlementErgoObservation,
    expectedTrackerSuccessorDigestHex: string,
    trackerEntry?: SpvTrackerHistoryEntry,
    burnEventLookup?: PegOutEventLookup,
  ): boolean {
    this.assertWritable('confirm submitted single settlement attempt');
    if (!Number.isSafeInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 0) {
      throw new Error('single aggregate settlement confirmation requires a valid lifecycle version');
    }
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const normalizedBurn = normalizeBurnTxHash(burnTxHash);
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation,
      consensus: null,
    });
    if (
      authority.observation.status !== 'confirmed_final'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
    ) {
      throw new Error('single aggregate settlement confirmation requires a final stable Ergo observation');
    }

    const run = this.db.transaction((): boolean => {
      const raw = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!raw) return false;
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (
        attempt.mode !== mode
        || attempt.lifecycleVersion !== expectedLifecycleVersion
        || attempt.burnTxHashes.length !== 1
        || attempt.burnTxHashes[0] !== normalizedBurn
        || (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedExpectedTxId
        || (attempt.status !== 'submitted' && attempt.status !== 'confirmed')
        || attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        return false;
      }
      if ((mode === 'single-with-ingest') !== (trackerEntry !== undefined)) {
        return false;
      }
      if (!this.matchesExpectedSpvTrackerSuccessorDigest(
        expectedTrackerSuccessorDigestHex,
        trackerEntry,
      )) return false;

      const row = this.resolvePegOutRow(
        burnEventLookup ?? normalizedBurn,
        'confirm legacy single settlement',
        false,
      ) as {
        id: number;
        sidechain_burn_tx_hash: string;
        status: PegOutStatus;
        phase1_box_id: string | null;
        phase2_unlock_tx_id: string | null;
        pending_avl_key: string | null;
      } | undefined;
      if (!row || normalizeBurnTxHash(row.sidechain_burn_tx_hash) !== normalizedBurn) return false;
      const submittedTxId = row.phase1_box_id ?? row.phase2_unlock_tx_id;
      const pendingAvlKey = normalizeBurnTxHash(row.pending_avl_key ?? normalizedBurn);
      if (pendingAvlKey !== normalizedBurn) return false;

      if (attempt.status === 'confirmed') {
        if (
          row.status !== 'phase2_unlocked'
          || row.phase2_unlock_tx_id !== normalizedExpectedTxId
          || !this.db.prepare(`SELECT 1 FROM avl_tree_history WHERE key_hex = ?`).get(pendingAvlKey)
        ) {
          return false;
        }
        return this.refreshConfirmedAggregateSettlementObservation(
          normalizedExpectedTxId,
          attempt,
          authority.observation,
          trackerEntry,
        );
      }
      if (row.status !== 'aggregate_submitted' || submittedTxId !== normalizedExpectedTxId) {
        return false;
      }

      this.insertAvlKey(pendingAvlKey);
      if (trackerEntry) this.insertSpvTrackerEntry(trackerEntry);
      const pegOutResult = this.db.prepare(`
        UPDATE peg_out_events
        SET status = 'phase2_unlocked',
            phase2_unlock_tx_id = ?,
            pending_avl_key = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND status = 'aggregate_submitted'
          AND COALESCE(phase1_box_id, phase2_unlock_tx_id) = ?
          AND COALESCE(pending_avl_key, sidechain_burn_tx_hash) = ?
      `).run(
        normalizedExpectedTxId,
        pendingAvlKey,
        row.id,
        normalizedExpectedTxId,
        pendingAvlKey,
      );
      if (pegOutResult.changes !== 1) {
        throw new Error(`cannot confirm single aggregate settlement ${normalizedExpectedTxId}: burn CAS failed`);
      }
      const attemptResult = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'confirmed',
            lifecycle_version = lifecycle_version + 1,
            ergo_observation_policy_version = ?,
            ergo_observation_required_confirmations = ?,
            ergo_observation_status = ?,
            ergo_observation_transaction_digest = ?,
            ergo_observation_inclusion_height = ?,
            ergo_observation_inclusion_header_id = ?,
            ergo_observation_tip_height = ?,
            ergo_observation_tip_header_id = ?,
            ergo_observation_confirmations = ?,
            ergo_observation_digest = ?,
            ergo_observation_source_count = 1,
            ergo_observation_consensus_digest = NULL,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND status = 'submitted'
      `).run(
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        normalizedExpectedTxId,
        attempt.lifecycleVersion,
      );
      if (attemptResult.changes !== 1) {
        throw new Error(`cannot confirm single aggregate settlement ${normalizedExpectedTxId}: journal CAS failed`);
      }
      return true;
    });
    return run.immediate();
  }

  confirmSubmittedBatchSettlementAttempt(
    expectedTxId: string,
    expectedLifecycleVersion: number,
    burnTxHashes: string[],
    observation: StableAggregateSettlementErgoObservation,
    expectedTrackerSuccessorDigestHex: string,
    trackerEntry?: SpvTrackerHistoryEntry,
    burnEventLookups?: PegOutEventLookup[],
  ): boolean {
    this.assertWritable('confirm submitted batch settlement attempt');
    if (!Number.isSafeInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 0) {
      throw new Error('batch aggregate settlement confirmation requires a valid lifecycle version');
    }
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const normalizedBurns = burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape('batch', normalizedBurns);
    if (burnEventLookups && burnEventLookups.length !== normalizedBurns.length) {
      throw new Error('batch settlement event lookup count must match the burn journal');
    }
    const expectedBurnsJson = JSON.stringify(normalizedBurns);
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation,
      consensus: null,
    });
    if (
      authority.observation.status !== 'confirmed_final'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
    ) {
      throw new Error('batch aggregate settlement confirmation requires a final stable Ergo observation');
    }

    const run = this.db.transaction((): boolean => {
      const raw = this.db.prepare(`
        SELECT *
        FROM aggregate_settlement_attempts
        WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!raw) return false;
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (
        attempt.mode !== 'batch' ||
        attempt.lifecycleVersion !== expectedLifecycleVersion ||
        JSON.stringify(attempt.burnTxHashes) !== expectedBurnsJson ||
        (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedExpectedTxId ||
        (attempt.status !== 'submitted' && attempt.status !== 'confirmed') ||
        attempt.recoveryBindingStatus !== 'policy_v1' ||
        attempt.recoveryPolicyVersion !== authority.observation.policyVersion ||
        attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        return false;
      }
      if (!this.matchesExpectedSpvTrackerSuccessorDigest(
        expectedTrackerSuccessorDigestHex,
        trackerEntry,
      )) return false;

      const rows: Array<{ id: number; burnTxHash: string; pendingAvlKey: string }> = [];
      for (let index = 0; index < normalizedBurns.length; index++) {
        const burnTxHash = normalizedBurns[index];
        const row = this.resolvePegOutRow(
          burnEventLookups?.[index] ?? burnTxHash,
          'confirm legacy batch settlement',
          false,
        ) as {
          id: number;
          sidechain_burn_tx_hash: string;
          status: PegOutStatus;
          phase1_box_id: string | null;
          phase2_unlock_tx_id: string | null;
          pending_avl_key: string | null;
        } | undefined;
        if (!row) return false;
        if (normalizeBurnTxHash(row.sidechain_burn_tx_hash) !== burnTxHash) return false;

        const submittedTxId = row.phase1_box_id ?? row.phase2_unlock_tx_id;
        const pendingAvlKey = normalizeBurnTxHash(row.pending_avl_key ?? burnTxHash);
        if (pendingAvlKey !== burnTxHash) return false;
        if (attempt.status === 'confirmed') {
          if (row.status !== 'phase2_unlocked' || row.phase2_unlock_tx_id !== normalizedExpectedTxId) {
            return false;
          }
          const avlRow = this.db.prepare(`
            SELECT 1 FROM avl_tree_history WHERE key_hex = ?
          `).get(pendingAvlKey);
          if (!avlRow) return false;
          rows.push({ id: row.id, burnTxHash, pendingAvlKey });
          continue;
        }
        if (row.status !== 'batch_submitted' || submittedTxId !== normalizedExpectedTxId) {
          return false;
        }
        rows.push({ id: row.id, burnTxHash, pendingAvlKey });
      }

      if (attempt.status === 'confirmed') {
        return this.refreshConfirmedAggregateSettlementObservation(
          normalizedExpectedTxId,
          attempt,
          authority.observation,
          trackerEntry,
        );
      }

      for (const row of rows) {
        this.insertAvlKey(row.pendingAvlKey);
        const result = this.db.prepare(`
          UPDATE peg_out_events
          SET status = 'phase2_unlocked',
              phase2_unlock_tx_id = ?,
              pending_avl_key = ?,
              updated_at = datetime('now')
          WHERE id = ?
            AND status = 'batch_submitted'
            AND COALESCE(phase1_box_id, phase2_unlock_tx_id) = ?
            AND COALESCE(pending_avl_key, sidechain_burn_tx_hash) = ?
        `).run(
          normalizedExpectedTxId,
          row.pendingAvlKey,
          row.id,
          normalizedExpectedTxId,
          row.pendingAvlKey,
        );
        if (result.changes !== 1) {
          throw new Error(
            `cannot confirm batch aggregate settlement ${normalizedExpectedTxId}: concurrent guard failed for burn ${row.burnTxHash}`,
          );
        }
      }
      if (trackerEntry) {
        this.insertSpvTrackerEntry(trackerEntry);
      }
      const result = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'confirmed',
            lifecycle_version = lifecycle_version + 1,
            ergo_observation_policy_version = ?,
            ergo_observation_required_confirmations = ?,
            ergo_observation_status = ?,
            ergo_observation_transaction_digest = ?,
            ergo_observation_inclusion_height = ?,
            ergo_observation_inclusion_header_id = ?,
            ergo_observation_tip_height = ?,
            ergo_observation_tip_header_id = ?,
            ergo_observation_confirmations = ?,
            ergo_observation_digest = ?,
            ergo_observation_source_count = 1,
            ergo_observation_consensus_digest = NULL,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND status = 'submitted'
      `).run(
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        normalizedExpectedTxId,
        attempt.lifecycleVersion,
      );
      if (result.changes !== 1) {
        throw new Error(`cannot confirm batch aggregate settlement ${normalizedExpectedTxId}: journal guard failed`);
      }
      return true;
    });

    return run.immediate();
  }

  markAggregateSettlementAttemptAbandoned(expectedTxId: string): boolean {
    this.assertWritable('mark aggregate settlement attempt abandoned');
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const result = this.db.prepare(`
      UPDATE aggregate_settlement_attempts
      SET status = 'abandoned',
          abandonment_reason = 'pending_pretransport',
          submitted_tx_id = NULL,
          lifecycle_version = lifecycle_version + 1,
          updated_at = datetime('now')
      WHERE expected_tx_id = ?
        AND status = 'pending'
        AND transport_reservation_digest IS NULL
    `).run(normalizedExpectedTxId);
    return result.changes > 0;
  }

  invalidatePendingAggregateSettlementAfterBurnObservation(
    admission: AggregateSettlementJournalAdmission,
    revertedBurnLookups: PegOutEventLookup[],
    reason: string,
  ): PendingAggregateSettlementBurnInvalidationResult {
    this.assertWritable('invalidate pending aggregate settlement after burn observation');
    const normalizedExpectedTxId = normalizeSettlementTxId(admission.expectedTxId);
    if (!Number.isSafeInteger(admission.lifecycleVersion) || admission.lifecycleVersion < 0) {
      throw new Error('aggregate settlement burn invalidation lifecycle version must be nonnegative');
    }
    const normalizedAdmissionBurns = admission.burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(admission.mode, normalizedAdmissionBurns);
    const admissionBurnsJson = JSON.stringify(normalizedAdmissionBurns);
    const normalizedReason = normalizeReason(reason, 'aggregate settlement burn invalidation reason');
    const run = this.db.transaction((): PendingAggregateSettlementBurnInvalidationResult => {
      const attempt = this.db.prepare(`
        SELECT status, lifecycle_version, mode, burn_tx_hashes_json, transport_reservation_digest
        FROM aggregate_settlement_attempts
        WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as {
        status: AggregateSettlementAttemptStatus;
        lifecycle_version: number;
        mode: AggregateSettlementAttemptMode;
        burn_tx_hashes_json: string;
        transport_reservation_digest: string | null;
      } | undefined;
      if (
        !attempt
        || attempt.status !== 'pending'
        || attempt.lifecycle_version !== admission.lifecycleVersion
        || attempt.mode !== admission.mode
        || attempt.burn_tx_hashes_json !== admissionBurnsJson
        || attempt.transport_reservation_digest !== null
      ) {
        throw new Error(
          `aggregate settlement ${normalizedExpectedTxId} changed before burn invalidation`,
        );
      }
      const attemptBurns = parseAggregateBurnTxHashesJson(
        attempt.burn_tx_hashes_json,
        `pending legacy aggregate journal ${normalizedExpectedTxId}`,
      );
      const seenPegOutIds = new Set<number>();
      let pegOutsTransitioned = 0;
      let candidatesInvalidated = 0;

      for (const lookup of revertedBurnLookups) {
        const pegOut = this.requirePegOut(lookup, 'invalidate pending aggregate settlement burn') as {
          id: number;
          burn_id: string | null;
          sidechain_burn_tx_hash: string;
          status: PegOutStatus;
        };
        if (seenPegOutIds.has(pegOut.id)) {
          throw new Error('aggregate settlement burn invalidation contains a duplicate peg-out');
        }
        seenPegOutIds.add(pegOut.id);
        const burnTxHash = normalizeBurnTxHash(pegOut.sidechain_burn_tx_hash);
        if (!attemptBurns.includes(burnTxHash)) {
          throw new Error(
            `peg-out burn ${burnTxHash} does not belong to aggregate settlement ${normalizedExpectedTxId}`,
          );
        }
        if (pegOut.status === 'phase2_unlocked') {
          throw new Error('cannot classify an already-settled peg-out as a recoverable burn reversion');
        }
        if (pegOut.status !== 'burn_reverted') {
          this.db.prepare(`
            UPDATE peg_out_events
            SET status = 'burn_reverted', updated_at = datetime('now')
            WHERE id = ?
          `).run(pegOut.id);
          pegOutsTransitioned += 1;
        }
        if (pegOut.burn_id !== null) {
          const candidates = this.db.prepare(`
            UPDATE authenticated_settlement_candidates
            SET status = 'invalidated',
                invalidation_reason = ?,
                updated_at = datetime('now')
            WHERE burn_id = ? AND status IN ('prepared', 'check_passed')
          `).run(normalizedReason, normalizeBurnId(pegOut.burn_id));
          candidatesInvalidated += candidates.changes;
        }
      }

      const abandoned = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'abandoned',
            abandonment_reason = 'burn_invalidation',
            submitted_tx_id = NULL,
            lifecycle_version = lifecycle_version + 1,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND status = 'pending'
          AND mode = ?
          AND burn_tx_hashes_json = ?
          AND transport_reservation_digest IS NULL
      `).run(
        normalizedExpectedTxId,
        admission.lifecycleVersion,
        admission.mode,
        admissionBurnsJson,
      );
      if (abandoned.changes !== 1) {
        throw new Error(
          `aggregate settlement ${normalizedExpectedTxId} changed before burn invalidation committed`,
        );
      }
      return {
        attemptAbandoned: true,
        pegOutsTransitioned,
        candidatesInvalidated,
      };
    });
    return run.immediate();
  }

  abandonSubmittedAggregateSettlementAttempt(
    expectedTxId: string,
    expectedLifecycleVersion: number,
    expectedStatus: SubmittedSettlementStatus,
    burnTxHashes: string[],
    observation: StableAggregateSettlementErgoObservation,
    consensus: MatchingAggregateSettlementErgoObservationConsensus,
  ): AggregateSettlementAbandonMutationResult {
    this.assertWritable('abandon submitted aggregate settlement attempt');
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const normalizedBurns = burnTxHashes.map(normalizeBurnTxHash);
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation,
      consensus,
    });
    if (
      authority.observation.status !== 'absent'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
      || authority.sourceCount < 2
      || authority.consensusDigestHex === null
      || authority.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
    ) {
      throw new Error('aggregate settlement abandonment requires matching stable absence observations');
    }
    if (!Number.isSafeInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 0) {
      throw new Error('aggregate settlement abandonment lifecycle version must be nonnegative');
    }

    const run = this.db.transaction((): AggregateSettlementAbandonMutationResult => {
      const raw = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!raw) {
        throw new Error(`aggregate settlement attempt not found: ${normalizedExpectedTxId}`);
      }
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (attempt.status !== 'submitted') {
        throw new Error(
          `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: status is ${attempt.status}`,
        );
      }
      if (attempt.lifecycleVersion !== expectedLifecycleVersion) {
        throw new Error(
          `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: lifecycle changed`,
        );
      }
      assertAggregateAttemptShape(attempt.mode, normalizedBurns);
      if (
        new Set(normalizedBurns).size !== normalizedBurns.length
        || JSON.stringify(attempt.burnTxHashes) !== JSON.stringify(normalizedBurns)
        || submittedStatusForAggregateMode(attempt.mode) !== expectedStatus
        || (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedExpectedTxId
      ) {
        throw new Error(
          `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: journal identity mismatch`,
        );
      }
      if (
        attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        throw new Error(`cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: recovery policy mismatch`);
      }
      if (attempt.ergoObservation?.status === 'confirmed_final') {
        throw new Error(`cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: final observation exists`);
      }

      let resetBurns = 0;
      let skippedBurns = 0;
      for (const burnTxHash of normalizedBurns) {
        const row = this.resolvePegOutRow(
          burnTxHash,
          'abandon legacy aggregate settlement',
          false,
        ) as {
          id: number;
          status: PegOutStatus;
          phase1_box_id: string | null;
          phase2_unlock_tx_id: string | null;
          pending_avl_key: string | null;
        } | undefined;
        if (!row) {
          throw new Error(`cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: missing peg-out ${burnTxHash}`);
        }

        const avlKey = row.pending_avl_key ?? burnTxHash;
        const avlRow = this.db.prepare(`
          SELECT 1 FROM avl_tree_history WHERE key_hex = ?
        `).get(avlKey);
        if (avlRow) {
          throw new Error(`cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: burn ${burnTxHash} already exists in AVL history`);
        }

        if (row.status === expectedStatus) {
          const submittedTxId = row.phase1_box_id ?? row.phase2_unlock_tx_id;
          if (submittedTxId?.toLowerCase() !== normalizedExpectedTxId) {
            throw new Error(
              `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: burn ${burnTxHash} does not match submitted tx`,
            );
          }
          const result = this.db.prepare(`
            UPDATE peg_out_events
            SET status = 'detected',
                phase1_box_id = NULL,
                phase2_unlock_tx_id = NULL,
                avl_proof_hex = NULL,
                pending_avl_key = NULL,
                ergo_anchor_height = NULL,
                updated_at = datetime('now')
            WHERE id = ?
              AND status = ?
              AND COALESCE(phase1_box_id, phase2_unlock_tx_id) = ?
          `).run(row.id, expectedStatus, normalizedExpectedTxId);
          if (result.changes !== 1) {
            throw new Error(
              `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: concurrent reset guard failed for burn ${burnTxHash}`,
            );
          }
          resetBurns++;
          continue;
        }

        if (row.status === 'detected' || row.status === 'confirmed') {
          skippedBurns++;
          continue;
        }

        throw new Error(
          `cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: burn ${burnTxHash} has status ${row.status}`,
        );
      }

      const result = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'abandoned',
            abandonment_reason = 'submitted_absence',
            submitted_tx_id = NULL,
            lifecycle_version = lifecycle_version + 1,
            transport_reservation_digest = NULL,
            transport_started_at = NULL,
            transport_completed_at = NULL,
            ergo_observation_policy_version = ?,
            ergo_observation_required_confirmations = ?,
            ergo_observation_status = ?,
            ergo_observation_transaction_digest = ?,
            ergo_observation_inclusion_height = ?,
            ergo_observation_inclusion_header_id = ?,
            ergo_observation_tip_height = ?,
            ergo_observation_tip_header_id = ?,
            ergo_observation_confirmations = ?,
            ergo_observation_digest = ?,
            ergo_observation_source_count = ?,
            ergo_observation_consensus_digest = ?,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND status = 'submitted'
          AND lifecycle_version = ?
      `).run(
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        authority.sourceCount,
        authority.consensusDigestHex,
        normalizedExpectedTxId,
        expectedLifecycleVersion,
      );
      if (result.changes !== 1) {
        throw new Error(`cannot abandon aggregate settlement attempt ${normalizedExpectedTxId}: journal guard failed`);
      }
      return { resetBurns, skippedBurns };
    });

    return run.immediate();
  }

  abandonPendingAggregateSettlementTransportReservation(
    expectedTxId: string,
    expectedLifecycleVersion: number,
    mode: AggregateSettlementAttemptMode,
    burnTxHashes: string[],
    observation: StableAggregateSettlementErgoObservation,
    consensus: MatchingAggregateSettlementErgoObservationConsensus,
  ): AggregateSettlementAbandonMutationResult {
    this.assertWritable('abandon pending aggregate settlement transport reservation');
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const normalizedBurns = burnTxHashes.map(normalizeBurnTxHash);
    assertAggregateAttemptShape(mode, normalizedBurns);
    const normalizedBurnsJson = JSON.stringify(normalizedBurns);
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation,
      consensus,
    });
    if (
      authority.observation.status !== 'absent'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
      || authority.sourceCount < 2
      || authority.consensusDigestHex === null
      || authority.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
    ) {
      throw new Error(
        'pending aggregate settlement transport retirement requires matching stable absence observations',
      );
    }
    if (!Number.isSafeInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 1) {
      throw new Error(
        'pending aggregate settlement transport retirement lifecycle version must be positive',
      );
    }
    if (new Set(normalizedBurns).size !== normalizedBurns.length) {
      throw new Error(
        'pending aggregate settlement transport retirement requires unique burn transaction hashes',
      );
    }

    const run = this.db.transaction((): AggregateSettlementAbandonMutationResult => {
      const raw = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!raw) {
        throw new Error(`aggregate settlement attempt not found: ${normalizedExpectedTxId}`);
      }
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (
        attempt.status !== 'pending'
        || attempt.lifecycleVersion !== expectedLifecycleVersion
        || attempt.mode !== mode
        || JSON.stringify(attempt.burnTxHashes) !== normalizedBurnsJson
        || attempt.submittedTxId !== null
        || attempt.transportReservationDigest === null
        || attempt.transportStartedAt === null
        || attempt.transportCompletedAt !== null
      ) {
        throw new Error(
          `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: journal reservation changed`,
        );
      }
      if (
        attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        throw new Error(
          `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: recovery policy mismatch`,
        );
      }
      if (attempt.ergoObservation?.status === 'confirmed_final') {
        throw new Error(
          `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: final observation exists`,
        );
      }

      let skippedBurns = 0;
      for (const burnTxHash of normalizedBurns) {
        const row = this.resolvePegOutRow(
          burnTxHash,
          'retire pending aggregate settlement transport',
          false,
        ) as {
          status: PegOutStatus;
          phase1_box_id: string | null;
          phase2_unlock_tx_id: string | null;
          pending_avl_key: string | null;
        } | undefined;
        if (!row) {
          throw new Error(
            `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: missing peg-out ${burnTxHash}`,
          );
        }
        const avlKey = row.pending_avl_key ?? burnTxHash;
        const avlRow = this.db.prepare(`
          SELECT 1 FROM avl_tree_history WHERE key_hex = ?
        `).get(avlKey);
        if (avlRow) {
          throw new Error(
            `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: burn ${burnTxHash} already exists in AVL history`,
          );
        }
        if (
          !['detected', 'confirmed', 'burn_reverted'].includes(row.status)
          || row.phase1_box_id !== null
          || row.phase2_unlock_tx_id !== null
          || row.pending_avl_key !== null
        ) {
          throw new Error(
            `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: burn ${burnTxHash} has incompatible state ${row.status}`,
          );
        }
        skippedBurns++;
      }

      const result = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'abandoned',
            abandonment_reason = 'pending_transport_absence',
            submitted_tx_id = NULL,
            lifecycle_version = lifecycle_version + 1,
            transport_reservation_digest = NULL,
            transport_started_at = NULL,
            transport_completed_at = NULL,
            ergo_observation_policy_version = ?,
            ergo_observation_required_confirmations = ?,
            ergo_observation_status = ?,
            ergo_observation_transaction_digest = ?,
            ergo_observation_inclusion_height = ?,
            ergo_observation_inclusion_header_id = ?,
            ergo_observation_tip_height = ?,
            ergo_observation_tip_header_id = ?,
            ergo_observation_confirmations = ?,
            ergo_observation_digest = ?,
            ergo_observation_source_count = ?,
            ergo_observation_consensus_digest = ?,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND status = 'pending'
          AND lifecycle_version = ?
          AND mode = ?
          AND burn_tx_hashes_json = ?
          AND submitted_tx_id IS NULL
          AND transport_reservation_digest = ?
          AND transport_started_at IS NOT NULL
          AND transport_completed_at IS NULL
      `).run(
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        authority.sourceCount,
        authority.consensusDigestHex,
        normalizedExpectedTxId,
        expectedLifecycleVersion,
        mode,
        normalizedBurnsJson,
        attempt.transportReservationDigest,
      );
      if (result.changes !== 1) {
        throw new Error(
          `cannot retire pending aggregate settlement transport ${normalizedExpectedTxId}: journal guard failed`,
        );
      }
      return { resetBurns: 0, skippedBurns };
    });

    return run.immediate();
  }

  getAggregateSettlementAttempt(expectedTxId: string): AggregateSettlementAttempt | null {
    const normalizedExpectedTxId = normalizeSettlementTxId(expectedTxId);
    const row = this.db.prepare(`
      SELECT * FROM aggregate_settlement_attempts
      WHERE expected_tx_id = ?
    `).get(normalizedExpectedTxId) as any | undefined;
    return row ? mapAggregateSettlementAttemptRow(row) : null;
  }

  getRecoverableAggregateSettlementAttempts(): AggregateSettlementAttempt[] {
    const rows = this.db.prepare(`
      SELECT * FROM aggregate_settlement_attempts
      WHERE status IN ('pending', 'submitted')
      ORDER BY created_at ASC, id ASC
    `).all() as any[];
    return rows.map(mapAggregateSettlementAttemptRow);
  }

  getConfirmedAggregateSettlementAttempts(): AggregateSettlementAttempt[] {
    const rows = this.db.prepare(`
      SELECT * FROM aggregate_settlement_attempts
      WHERE status = 'confirmed'
      ORDER BY created_at ASC, id ASC
    `).all() as any[];
    return rows.map(mapAggregateSettlementAttemptRow);
  }

  recordConfirmedAggregateSettlementReorgObservation(
    input: ConfirmedAggregateSettlementReorgObservationInput,
  ): boolean {
    this.assertWritable('record confirmed aggregate settlement reorg observation');
    const normalizedExpectedTxId = normalizeSettlementTxId(input.expectedTxId);
    if (!Number.isSafeInteger(input.expectedLifecycleVersion) || input.expectedLifecycleVersion < 0) {
      throw new Error('confirmed aggregate settlement reorg observation lifecycle version must be nonnegative');
    }
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation: input.observation,
      consensus: input.consensus,
    });
    if (
      authority.observation.status !== 'absent'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
      || authority.sourceCount < 2
      || authority.consensusDigestHex === null
      || authority.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
    ) {
      throw new Error('confirmed aggregate settlement reorg observation requires matching absence consensus');
    }

    const run = this.db.transaction((): boolean => {
      const raw = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!raw) return false;
      const attempt = mapAggregateSettlementAttemptRow(raw);
      if (
        attempt.status !== 'confirmed'
        || attempt.lifecycleVersion !== input.expectedLifecycleVersion
        || (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedExpectedTxId
        || attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
        || attempt.ergoObservation?.status !== 'confirmed_final'
      ) {
        return false;
      }
      if (attempt.recoveryQuarantine !== null) {
        return attempt.recoveryQuarantine.observation.observationDigestHex
          === authority.observation.observationDigestHex
          && attempt.recoveryQuarantine.consensusDigestHex === authority.consensusDigestHex;
      }
      const result = this.db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET lifecycle_version = lifecycle_version + 1,
            recovery_quarantine_reason = 'confirmed_reorg_observed',
            recovery_quarantine_policy_version = ?,
            recovery_quarantine_required_confirmations = ?,
            recovery_quarantine_status = ?,
            recovery_quarantine_transaction_digest = ?,
            recovery_quarantine_inclusion_height = ?,
            recovery_quarantine_inclusion_header_id = ?,
            recovery_quarantine_tip_height = ?,
            recovery_quarantine_tip_header_id = ?,
            recovery_quarantine_confirmations = ?,
            recovery_quarantine_observation_digest = ?,
            recovery_quarantine_source_count = ?,
            recovery_quarantine_consensus_digest = ?,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND status = 'confirmed'
          AND lifecycle_version = ?
          AND recovery_quarantine_reason IS NULL
      `).run(
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        authority.sourceCount,
        authority.consensusDigestHex,
        normalizedExpectedTxId,
        input.expectedLifecycleVersion,
      );
      return result.changes === 1;
    });

    return run.immediate();
  }

  recordAggregateSettlementRecoveryObservation(
    input: AggregateSettlementRecoveryObservationAppendInput,
  ): AggregateSettlementRecoveryObservationAppendResult {
    this.assertWritable('record aggregate settlement recovery observation');
    const normalizedExpectedTxId = normalizeSettlementTxId(input.expectedTxId);
    if (!Number.isSafeInteger(input.expectedLifecycleVersion) || input.expectedLifecycleVersion < 0) {
      throw new Error('aggregate settlement recovery observation lifecycle version must be nonnegative');
    }
    if (input.expectedStatus !== 'pending' && input.expectedStatus !== 'submitted') {
      throw new Error('aggregate settlement recovery observation expects pending or submitted state');
    }
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation: input.observation,
      consensus: input.consensus,
    });
    if (
      input.purpose !== 'abandonment_absence'
      || authority.observation.status !== 'absent'
      || authority.observation.transactionIdHex !== normalizedExpectedTxId
      || authority.sourceCount < 2
      || authority.consensusDigestHex === null
      || authority.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
    ) {
      throw new Error('aggregate settlement recovery observation requires matching absence consensus');
    }

    const run = this.db.transaction((): AggregateSettlementRecoveryObservationAppendResult => {
      const attemptRow = this.db.prepare(`
        SELECT * FROM aggregate_settlement_attempts WHERE expected_tx_id = ?
      `).get(normalizedExpectedTxId) as any | undefined;
      if (!attemptRow) {
        throw new Error(`aggregate settlement attempt not found: ${normalizedExpectedTxId}`);
      }
      const attempt = mapAggregateSettlementAttemptRow(attemptRow);
      if (attempt.status !== input.expectedStatus) {
        throw new Error(
          `cannot record aggregate settlement recovery observation ${normalizedExpectedTxId}: status is ${attempt.status}`,
        );
      }
      if (attempt.lifecycleVersion !== input.expectedLifecycleVersion) {
        throw new Error(
          `cannot record aggregate settlement recovery observation ${normalizedExpectedTxId}: lifecycle changed`,
        );
      }
      if (
        input.expectedStatus === 'pending'
        && (
          attempt.submittedTxId !== null
          || attempt.transportReservationDigest === null
          || attempt.transportStartedAt === null
          || attempt.transportCompletedAt !== null
        )
      ) {
        throw new Error(
          `cannot record aggregate settlement recovery observation ${normalizedExpectedTxId}: pending attempt has no active transport reservation`,
        );
      }
      if (
        attempt.recoveryBindingStatus !== 'policy_v1'
        || attempt.recoveryPolicyVersion !== authority.observation.policyVersion
        || attempt.recoveryRequiredConfirmations !== authority.observation.requiredConfirmations
      ) {
        throw new Error(
          `cannot record aggregate settlement recovery observation ${normalizedExpectedTxId}: recovery policy mismatch`,
        );
      }

      const previousRow = this.db.prepare(`
        SELECT *
        FROM aggregate_settlement_recovery_observations
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND purpose = ?
          AND source_authority_profile = ?
          AND observation_status = 'absent'
          AND source_count >= 2
          AND observation_digest != ?
        ORDER BY observation_tip_height DESC, id DESC
        LIMIT 1
      `).get(
        normalizedExpectedTxId,
        input.expectedLifecycleVersion,
        input.purpose,
        AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
        authority.observation.observationDigestHex,
      ) as any | undefined;

      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO aggregate_settlement_recovery_observations (
          expected_tx_id,
          lifecycle_version,
          purpose,
          source_authority_profile,
          observation_policy_version,
          observation_required_confirmations,
          observation_status,
          observation_transaction_digest,
          observation_inclusion_height,
          observation_inclusion_header_id,
          observation_tip_height,
          observation_tip_header_id,
          observation_confirmations,
          observation_digest,
          source_count,
          consensus_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedExpectedTxId,
        input.expectedLifecycleVersion,
        input.purpose,
        authority.sourceAuthorityProfile,
        authority.observation.policyVersion,
        authority.observation.requiredConfirmations,
        authority.observation.status,
        authority.observation.transactionDigestHex,
        authority.observation.inclusionHeight,
        authority.observation.inclusionHeaderIdHex,
        authority.observation.observedTipHeight,
        authority.observation.observedTipHeaderIdHex,
        authority.observation.confirmations,
        authority.observation.observationDigestHex,
        authority.sourceCount,
        authority.consensusDigestHex,
      );
      const currentRow = this.db.prepare(`
        SELECT *
        FROM aggregate_settlement_recovery_observations
        WHERE expected_tx_id = ?
          AND lifecycle_version = ?
          AND purpose = ?
          AND source_authority_profile = ?
          AND observation_digest = ?
          AND consensus_digest = ?
      `).get(
        normalizedExpectedTxId,
        input.expectedLifecycleVersion,
        input.purpose,
        AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
        authority.observation.observationDigestHex,
        authority.consensusDigestHex,
      ) as any | undefined;
      if (!currentRow) {
        throw new Error(
          `aggregate settlement recovery observation ${authority.observation.observationDigestHex} was not persisted`,
        );
      }
      return {
        recorded: insert.changes === 1,
        previous: previousRow ? mapAggregateSettlementRecoveryObservationRow(previousRow) : null,
        current: mapAggregateSettlementRecoveryObservationRow(currentRow),
      };
    });

    return run.immediate();
  }

  recordAuthenticatedSettlementCandidate(
    input: AuthenticatedSettlementCandidateInput,
  ): AuthenticatedSettlementCandidate {
    assertNativeVerifiedAuthenticatedSettlementCandidateProvenance(input);
    this.assertWritable('record authenticated settlement candidate');
    const normalized = normalizeAuthenticatedSettlementCandidateInput(input);
    const run = this.db.transaction((): AuthenticatedSettlementCandidate => {
      const pegOut = this.db.prepare(`
        SELECT
          sidechain_id,
          burn_id,
          sidechain_burn_tx_hash,
          sidechain_burn_height,
          sidechain_block_hash,
          sidechain_log_index,
          status
        FROM peg_out_events
        WHERE lower(burn_id) = ?
      `).get(normalized.burnId) as {
        sidechain_id: string | null;
        burn_id: string | null;
        sidechain_burn_tx_hash: string;
        sidechain_burn_height: number;
        sidechain_block_hash: string | null;
        sidechain_log_index: number | null;
        status: PegOutStatus;
      } | undefined;
      if (!pegOut) {
        throw new Error(`Cannot record authenticated settlement candidate: burnId ${normalized.burnId} does not exist`);
      }
      if (pegOut.status !== 'detected' && pegOut.status !== 'confirmed') {
        throw new Error(
          `Cannot record authenticated settlement candidate from peg-out status ${pegOut.status}`,
        );
      }
      if (
        pegOut.sidechain_id === null
        || normalizeFixedHex(pegOut.sidechain_id, 32, 'persisted sidechainId') !== normalized.sidechainId
        || pegOut.burn_id === null
        || normalizeBurnId(pegOut.burn_id) !== normalized.burnId
        || normalizeBurnTxHash(pegOut.sidechain_burn_tx_hash) !== normalized.burnTxHash
        || BigInt(pegOut.sidechain_burn_height) !== normalized.sidechainHeight
        || pegOut.sidechain_block_hash === null
        || normalizeFixedHex(pegOut.sidechain_block_hash, 32, 'persisted sidechainBlockHash') !== normalized.sidechainBlockHash
        || pegOut.sidechain_log_index !== normalized.sidechainLogIndex
      ) {
        throw new Error('authenticated settlement candidate does not match persisted burn coordinates');
      }

      const existingRow = this.db.prepare(`
        SELECT * FROM authenticated_settlement_candidates WHERE candidate_id = ?
      `).get(normalized.candidateId) as any | undefined;
      if (existingRow) {
        const existing = mapAuthenticatedSettlementCandidateRow(existingRow);
        if (!authenticatedSettlementCandidateInputMatches(existing, normalized)) {
          throw new Error(`authenticated settlement candidate ${normalized.candidateId} conflicts with existing journal row`);
        }
        if (existing.status === 'invalidated') {
          throw new Error(`authenticated settlement candidate ${normalized.candidateId} was invalidated and cannot be reactivated`);
        }
        return existing;
      }

      const activeConflict = this.db.prepare(`
        SELECT candidate_id, burn_id, dup_input_box_id, vault_box_id
        FROM authenticated_settlement_candidates
        WHERE status IN ('prepared', 'check_passed')
          AND (
            burn_id = ?
            OR dup_input_box_id = ?
            OR vault_box_id = ?
          )
        ORDER BY id ASC
        LIMIT 1
      `).get(
        normalized.burnId,
        normalized.dupInputBoxId,
        normalized.vaultBoxId,
      ) as {
        candidate_id: string;
        burn_id: string;
        dup_input_box_id: string;
        vault_box_id: string;
      } | undefined;
      if (activeConflict) {
        throw new Error(
          `authenticated settlement candidate conflicts with active candidate ${activeConflict.candidate_id}`,
        );
      }

      this.db.prepare(`
        INSERT INTO authenticated_settlement_candidates (
          candidate_schema_version,
          candidate_id,
          burn_id,
          burn_tx_hash,
          sidechain_id,
          sidechain_height,
          sidechain_block_hash,
          sidechain_log_index,
          tracker_key,
          tracker_value,
          tracker_box_id,
          anchor_header_id,
          anchor_header_height,
          dup_input_box_id,
          dup_input_digest,
          vault_box_id,
          unsigned_tx_digest,
          creation_height,
          observed_sidechain_tip,
          observed_ergo_tip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalized.schemaVersion,
        normalized.candidateId,
        normalized.burnId,
        normalized.burnTxHash,
        normalized.sidechainId,
        normalized.sidechainHeight.toString(),
        normalized.sidechainBlockHash,
        normalized.sidechainLogIndex,
        normalized.trackerKey,
        normalized.trackerValue,
        normalized.trackerBoxId,
        normalized.anchorHeaderId,
        normalized.anchorHeaderHeight,
        normalized.dupInputBoxId,
        normalized.dupInputDigest,
        normalized.vaultBoxId,
        normalized.unsignedTxDigest,
        normalized.creationHeight,
        normalized.observedSidechainTip.toString(),
        normalized.observedErgoTip,
      );
      const inserted = this.db.prepare(`
        SELECT * FROM authenticated_settlement_candidates WHERE candidate_id = ?
      `).get(normalized.candidateId);
      return mapAuthenticatedSettlementCandidateRow(inserted);
    });
    return run.immediate();
  }

  recordRecoveredAuthenticatedSettlementCandidate(
    admission: AuthenticatedV2PreparedCandidateRecoveryAdmission,
  ): AuthenticatedSettlementCandidate {
    assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance(admission);
    assertAuthenticatedV2CacheRecoveryReportProvenance(admission.cacheRecovery);
    assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance(
      admission.sidechainConsensus,
    );
    assertAuthenticatedV2RecoverySourceMatchesDraft(
      admission,
      admission.sidechainConsensus,
    );
    assertNativeVerifiedAuthenticatedSettlementCandidateProvenance(admission.candidate);
    this.assertWritable('record recovered authenticated settlement candidate');

    const candidate = normalizeAuthenticatedSettlementCandidateInput(admission.candidate);
    if (admission.schema !== AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA) {
      throw new Error('authenticated settlement recovery schema is unsupported');
    }
    normalizeFixedHex(admission.packageDigestHex, 32, 'recovery package digest');
    normalizeSettlementTxId(admission.expectedTxId);
    normalizeFixedHex(admission.cacheRecoveryDigestHex, 32, 'cache recovery digest');
    const sidechainConsensusDigest = normalizeFixedHex(
      admission.sidechainConsensusDigestHex,
      32,
      'recovery sidechain consensus digest',
    );
    const recoveryAdmissionDigest = normalizeFixedHex(
      admission.recoveryAdmissionDigestHex,
      32,
      'recovery admission digest',
    );
    const sidechainTipHash = normalizeFixedHex(
      admission.sidechainTipHashHex,
      32,
      'recovery sidechain tip hash',
    );
    const sidechainSourceCount = normalizeNonnegativeSignedInt(
      admission.sidechainConsensus.sourceCount,
      'recovery sidechain source count',
    );
    if (
      sidechainSourceCount < 2
      || sidechainConsensusDigest !== admission.sidechainConsensus.consensusDigestHex
      || sidechainTipHash !== admission.sidechainConsensus.view.observedTipHashHex
    ) {
      throw new Error('authenticated settlement recovery sidechain provenance is inconsistent');
    }
    const expectedRecoveryAdmissionDigest =
      digestAuthenticatedV2PackageRecoveryBinding({
        schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
        candidateId: candidate.candidateId,
        burnId: candidate.burnId,
        packageDigestHex: admission.packageDigestHex,
        expectedTxId: admission.expectedTxId,
        cacheRecoveryDigestHex: admission.cacheRecoveryDigestHex,
        sidechainConsensusDigestHex: sidechainConsensusDigest,
        sidechainTipHashHex: sidechainTipHash,
      });
    if (recoveryAdmissionDigest !== expectedRecoveryAdmissionDigest) {
      throw new Error(
        'authenticated settlement recovery admission digest is inconsistent',
      );
    }

    const recover = this.db.transaction((): AuthenticatedSettlementCandidate => {
      const trackerState = this.getAuthenticatedSpvTrackerReconstructionState(
        candidate.sidechainId,
      );
      if (
        trackerState === null
        || trackerState.tipBoxId !== candidate.trackerBoxId
        || trackerState.tipBoxId !== admission.cacheRecovery.currentInputs.trackerBoxIdHex
        || trackerState.observationDigest
          !== admission.cacheRecovery.reconstructionDigests.tracker
        || trackerState.observedErgoTip !== admission.cacheRecovery.observedTip.height
        || trackerState.observedErgoTipId !== admission.cacheRecovery.observedTip.idHex
        || trackerState.observedErgoParentId !== admission.cacheRecovery.observedTip.parentIdHex
        || trackerState.observedErgoExtensionRoot
          !== admission.cacheRecovery.observedTip.extensionRootHex
      ) {
        throw new Error(
          'recovered candidate tracker tip is not the exact current reconstructed cache input',
        );
      }
      const trackerHistory = this.getAuthenticatedSpvTrackerHistory(candidate.sidechainId);
      const matchingTrackerEntries = trackerHistory.filter(
        entry => entry.key === candidate.trackerKey,
      );
      if (
        matchingTrackerEntries.length !== 1
        || matchingTrackerEntries[0].value !== candidate.trackerValue
      ) {
        throw new Error('recovered candidate tracker entry is absent from the reconstructed cache');
      }

      const duplicatePrevention = this.getAuthenticatedV2DupReconstructionState();
      if (
        duplicatePrevention === null
        || duplicatePrevention.tipBoxId !== candidate.dupInputBoxId
        || duplicatePrevention.tipDigest !== candidate.dupInputDigest
        || duplicatePrevention.observedErgoTip !== admission.cacheRecovery.observedTip.height
        || duplicatePrevention.observedErgoTipId !== admission.cacheRecovery.observedTip.idHex
      ) {
        throw new Error('recovered candidate DUP input is absent from the reconstructed cache');
      }
      if (this.getAuthenticatedV2DupHistory().includes(candidate.burnId)) {
        throw new Error('recovered candidate burn is already present in authenticated DUP history');
      }

      const vaultState = this.getAuthenticatedV2VaultReconstructionState();
      if (
        vaultState === null
        || vaultState.observedErgoTip !== admission.cacheRecovery.observedTip.height
        || vaultState.observedErgoTipIdHex !== admission.cacheRecovery.observedTip.idHex
        || !this.getAuthenticatedV2CurrentVaultBoxIds().includes(candidate.vaultBoxId)
      ) {
        throw new Error('recovered candidate vault input is absent from the reconstructed cache');
      }

      this.insertPegOut(
        admission.pegOut.sidechainTxHash,
        admission.pegOut.ergoRecipientAddress,
        BigInt(admission.pegOut.amount),
        admission.pegOut.sidechainBlockNumber,
        {
          user: admission.pegOut.user,
          sidechainId: candidate.sidechainId,
          sidechainBlockHash: candidate.sidechainBlockHash,
          sidechainLogIndex: candidate.sidechainLogIndex,
        },
      );
      const recorded = this.recordAuthenticatedSettlementCandidate(admission.candidate);
      if (
        recorded.status !== 'prepared'
        || recorded.checkExpectedTxId !== null
        || recorded.checkUnsignedPackageDigest !== null
        || recorded.checkSignedTransactionDigest !== null
        || recorded.checkResponseDigest !== null
        || recorded.checkSignerContextDigest !== null
        || recorded.checkCheckerIdentityDigest !== null
        || recorded.checkRevalidationDigest !== null
        || recorded.checkNativeVerificationRequestDigest !== null
        || recorded.checkTrustAnchorDigest !== null
        || recorded.checkFinalityHorizonHash !== null
        || recorded.checkFinalityHorizonHeight !== null
        || recorded.checkFinalityStatementDigest !== null
        || recorded.checkFinalityProgramId !== null
        || recorded.checkFinalityProofSystemId !== null
        || recorded.checkFinalityVerifierProfileId !== null
        || recorded.checkFinalityProofPayloadDigest !== null
        || recorded.checkFinalityProofDigest !== null
        || recorded.checkStableErgoViewDigest !== null
        || recorded.checkStableSidechainViewDigest !== null
        || recorded.checkAdmissionDigest !== null
      ) {
        throw new Error('database-loss recovery cannot restore checked settlement authority');
      }
      const hasRecoveryMetadata = recorded.recoverySchema !== null
        || recorded.recoverySidechainConsensusDigest !== null
        || recorded.recoveryAdmissionDigest !== null
        || recorded.recoverySidechainTipHash !== null
        || recorded.recoverySidechainSourceCount !== null;
      if (
        hasRecoveryMetadata
        && (
          recorded.recoverySchema !== AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA
          || recorded.recoverySidechainConsensusDigest !== sidechainConsensusDigest
          || recorded.recoveryAdmissionDigest !== recoveryAdmissionDigest
          || recorded.recoverySidechainTipHash !== sidechainTipHash
          || recorded.recoverySidechainSourceCount !== sidechainSourceCount
        )
      ) {
        throw new Error('authenticated settlement candidate conflicts with durable recovery provenance');
      }
      const updated = this.db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET recovery_schema = ?,
            recovery_sidechain_consensus_digest = ?,
            recovery_admission_digest = ?,
            recovery_sidechain_tip_hash = ?,
            recovery_sidechain_source_count = ?,
            updated_at = datetime('now')
        WHERE candidate_id = ?
          AND status = 'prepared'
      `).run(
        AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
        sidechainConsensusDigest,
        recoveryAdmissionDigest,
        sidechainTipHash,
        sidechainSourceCount,
        candidate.candidateId,
      );
      if (updated.changes !== 1) {
        throw new Error('database-loss recovery could not persist prepared-candidate provenance');
      }
      const persistedRow = this.db.prepare(`
        SELECT * FROM authenticated_settlement_candidates WHERE candidate_id = ?
      `).get(candidate.candidateId);
      const persisted = mapAuthenticatedSettlementCandidateRow(persistedRow);
      if (
        persisted.recoverySchema !== AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA
        || persisted.recoverySidechainConsensusDigest !== sidechainConsensusDigest
        || persisted.recoveryAdmissionDigest !== recoveryAdmissionDigest
        || persisted.recoverySidechainTipHash !== sidechainTipHash
        || persisted.recoverySidechainSourceCount !== sidechainSourceCount
      ) {
        throw new Error('database-loss recovery provenance was not durably persisted');
      }
      return persisted;
    });
    return recover.immediate();
  }

  getAuthenticatedSettlementCandidate(candidateId: string): AuthenticatedSettlementCandidate | null {
    const normalizedCandidateId = normalizeFixedHex(
      candidateId,
      32,
      'authenticated settlement candidate ID',
    );
    const row = this.db.prepare(`
      SELECT * FROM authenticated_settlement_candidates WHERE candidate_id = ?
    `).get(normalizedCandidateId);
    return row ? mapAuthenticatedSettlementCandidateRow(row) : null;
  }

  getAuthenticatedSettlementExecutionReservation(
    lookup: AuthenticatedSettlementExecutionReservationLookup,
  ): AuthenticatedSettlementExecutionReservation | null {
    const [column, value] = 'reservationDigestHex' in lookup
      ? [
          'reservation_digest',
          normalizeFixedHex(
            lookup.reservationDigestHex,
            32,
            'authenticated settlement execution reservation digest',
          ),
        ]
      : [
          'candidate_id',
          normalizeFixedHex(
            lookup.candidateId,
            32,
            'authenticated settlement candidate ID',
          ),
        ];
    const rows = this.db.prepare(`
      SELECT *
      FROM authenticated_settlement_execution_reservations
      WHERE ${column} = ?
      ORDER BY id DESC
    `).all(value);
    if (rows.length === 0) return null;
    if ('reservationDigestHex' in lookup && rows.length !== 1) {
      throw new Error('execution reservation digest resolves to multiple journal rows');
    }
    return mapAuthenticatedSettlementExecutionReservationRow(rows[0]);
  }

  reserveAuthenticatedSettlementExecution(
    admission: AuthenticatedSettlementExecutionReservationAdmission,
  ): AuthenticatedSettlementExecutionReservation {
    assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(admission);
    this.assertWritable('reserve authenticated settlement execution');
    const normalized = {
      schema: admission.schema,
      reservationDigestHex: normalizeFixedHex(
        admission.reservationDigestHex,
        32,
        'authenticated settlement execution reservation digest',
      ),
      candidateId: normalizeFixedHex(
        admission.candidateId,
        32,
        'authenticated settlement candidate ID',
      ),
      candidateAuthorityDigestHex: normalizeFixedHex(
        admission.candidateAuthorityDigestHex,
        32,
        'authenticated settlement candidate authority digest',
      ),
      burnId: normalizeBurnId(admission.burnId),
      burnTxHash: normalizeBurnTxHash(admission.burnTxHash),
      amountNanoErg: normalizePositiveSignedLong(
        admission.amountNanoErg,
        'authenticated settlement amount',
      ),
      recipientErgoTreeHex: normalizeFixedHex(
        admission.recipientErgoTreeHex,
        36,
        'authenticated settlement recipient ErgoTree',
      ),
      duplicatePreventionBoxId: normalizeFixedHex(
        admission.duplicatePreventionBoxId,
        32,
        'authenticated settlement DUP input box ID',
      ),
      vaultBoxId: normalizeFixedHex(
        admission.vaultBoxId,
        32,
        'authenticated settlement vault box ID',
      ),
      expectedTxId: normalizeSettlementTxId(admission.expectedTxId),
      unsignedTxDigestHex: normalizeFixedHex(
        admission.unsignedTxDigestHex,
        32,
        'authenticated settlement unsigned transaction digest',
      ),
      unsignedPackageDigestHex: normalizeFixedHex(
        admission.unsignedPackageDigestHex,
        32,
        'authenticated settlement unsigned package digest',
      ),
      signedTransactionDigestHex: normalizeFixedHex(
        admission.signedTransactionDigestHex,
        32,
        'authenticated settlement signed transaction digest',
      ),
      checkResponseDigestHex: normalizeFixedHex(
        admission.checkResponseDigestHex,
        32,
        'authenticated settlement JVM check response digest',
      ),
      signerContextDigestHex: normalizeFixedHex(
        admission.signerContextDigestHex,
        32,
        'authenticated settlement signer context digest',
      ),
      checkerIdentityDigestHex: normalizeFixedHex(
        admission.checkerIdentityDigestHex,
        32,
        'authenticated settlement checker identity digest',
      ),
      revalidationDigestHex: normalizeFixedHex(
        admission.revalidationDigestHex,
        32,
        'authenticated settlement revalidation digest',
      ),
      stableErgoViewDigestHex: normalizeFixedHex(
        admission.stableErgoViewDigestHex,
        32,
        'authenticated settlement stable Ergo view digest',
      ),
      stableSidechainViewDigestHex: normalizeFixedHex(
        admission.stableSidechainViewDigestHex,
        32,
        'authenticated settlement stable sidechain view digest',
      ),
      finalityProofDigestHex: normalizeFixedHex(
        admission.finalityProofDigestHex,
        32,
        'authenticated settlement finality proof digest',
      ),
      checkAdmissionDigestHex: normalizeFixedHex(
        admission.checkAdmissionDigestHex,
        32,
        'authenticated settlement check admission digest',
      ),
      authorizationDigestHex: normalizeFixedHex(
        admission.authorizationDigestHex,
        32,
        'authenticated settlement execution authorization digest',
      ),
    };
    if (normalized.schema !== AUTHENTICATED_SETTLEMENT_EXECUTION_RESERVATION_SCHEMA) {
      throw new Error('authenticated settlement execution reservation schema is unsupported');
    }

    const reserve = this.db.transaction((): AuthenticatedSettlementExecutionReservation => {
      const candidateRows = this.db.prepare(`
        SELECT c.*, p.status AS peg_out_status,
          p.burn_id AS peg_out_burn_id,
          p.sidechain_burn_tx_hash AS peg_out_burn_tx_hash,
          p.amount_nanoerg AS peg_out_amount_nanoerg,
          p.ergo_recipient_address AS peg_out_recipient
        FROM authenticated_settlement_candidates c
        JOIN peg_out_events p ON lower(p.burn_id) = c.burn_id
        WHERE c.candidate_id = ?
      `).all(normalized.candidateId) as any[];
      if (candidateRows.length !== 1) {
        throw new Error(
          `authenticated execution reservation requires exactly one persisted candidate and burn; found ${candidateRows.length}`,
        );
      }
      const candidateRow = candidateRows[0];
      const candidate = mapAuthenticatedSettlementCandidateRow(candidateRow);
      if (candidate.status !== 'check_passed' || candidate.invalidationReason !== null) {
        throw new Error('authenticated settlement candidate is not currently reservable');
      }
      if (
        candidateRow.peg_out_status !== 'detected'
        && candidateRow.peg_out_status !== 'confirmed'
      ) {
        throw new Error(
          `authenticated execution reservation rejects peg-out status ${candidateRow.peg_out_status}`,
        );
      }
      if (
        normalizeBurnId(candidateRow.peg_out_burn_id) !== normalized.burnId
        || normalizeBurnTxHash(candidateRow.peg_out_burn_tx_hash) !== normalized.burnTxHash
        || normalizePositiveSignedLong(
          BigInt(candidateRow.peg_out_amount_nanoerg),
          'persisted peg-out amount',
        ) !== normalized.amountNanoErg
        || canonicalP2pkErgoTree(candidateRow.peg_out_recipient)
          !== normalized.recipientErgoTreeHex
        || !authenticatedSettlementExecutionReservationMatchesCandidate(candidate, normalized)
      ) {
        throw new Error('authenticated execution reservation does not match current persisted authority');
      }

      const existingRow = this.db.prepare(`
        SELECT *
        FROM authenticated_settlement_execution_reservations
        WHERE reservation_digest = ?
      `).get(normalized.reservationDigestHex) as any | undefined;
      if (existingRow) {
        const existing = mapAuthenticatedSettlementExecutionReservationRow(existingRow);
        if (!authenticatedSettlementExecutionReservationMatchesAdmission(existing, normalized)) {
          throw new Error('authenticated execution reservation digest conflicts with journal');
        }
        if (existing.status !== 'active') {
          throw new Error('revoked authenticated execution reservation cannot be reactivated');
        }
        return existing;
      }

      const legacyAttempts = this.db.prepare(`
        SELECT expected_tx_id, burn_tx_hashes_json
        FROM aggregate_settlement_attempts
        WHERE status IN ('pending', 'submitted')
        ORDER BY id ASC
      `).all() as Array<{
        expected_tx_id: string;
        burn_tx_hashes_json: string;
      }>;
      for (const attempt of legacyAttempts) {
        const burns = parseAggregateBurnTxHashesJson(
          attempt.burn_tx_hashes_json,
          `active legacy aggregate journal ${attempt.expected_tx_id}`,
        );
        if (
          attempt.expected_tx_id === normalized.expectedTxId
          || burns.includes(normalized.burnTxHash)
        ) {
          throw new Error(
            `active legacy aggregate journal ${attempt.expected_tx_id} conflicts with authenticated execution reservation`,
          );
        }
      }

      const activeConflict = this.db.prepare(`
        SELECT reservation_digest
        FROM authenticated_settlement_execution_reservations
        WHERE status = 'active'
          AND (
            candidate_id = ?
            OR burn_id = ?
            OR burn_tx_hash = ?
            OR dup_input_box_id = ?
            OR vault_box_id = ?
            OR expected_tx_id = ?
          )
        ORDER BY id ASC
        LIMIT 1
      `).get(
        normalized.candidateId,
        normalized.burnId,
        normalized.burnTxHash,
        normalized.duplicatePreventionBoxId,
        normalized.vaultBoxId,
        normalized.expectedTxId,
      ) as { reservation_digest: string } | undefined;
      if (activeConflict) {
        throw new Error(
          `active authenticated execution reservation ${activeConflict.reservation_digest} already claims a required resource`,
        );
      }

      this.db.prepare(`
        INSERT INTO authenticated_settlement_execution_reservations (
          schema,
          reservation_digest,
          candidate_id,
          candidate_authority_digest,
          burn_id,
          burn_tx_hash,
          amount_nanoerg,
          recipient_ergo_tree,
          dup_input_box_id,
          vault_box_id,
          expected_tx_id,
          unsigned_tx_digest,
          unsigned_package_digest,
          signed_transaction_digest,
          check_response_digest,
          signer_context_digest,
          checker_identity_digest,
          revalidation_digest,
          stable_ergo_view_digest,
          stable_sidechain_view_digest,
          finality_proof_digest,
          check_admission_digest,
          authorization_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalized.schema,
        normalized.reservationDigestHex,
        normalized.candidateId,
        normalized.candidateAuthorityDigestHex,
        normalized.burnId,
        normalized.burnTxHash,
        normalized.amountNanoErg.toString(),
        normalized.recipientErgoTreeHex,
        normalized.duplicatePreventionBoxId,
        normalized.vaultBoxId,
        normalized.expectedTxId,
        normalized.unsignedTxDigestHex,
        normalized.unsignedPackageDigestHex,
        normalized.signedTransactionDigestHex,
        normalized.checkResponseDigestHex,
        normalized.signerContextDigestHex,
        normalized.checkerIdentityDigestHex,
        normalized.revalidationDigestHex,
        normalized.stableErgoViewDigestHex,
        normalized.stableSidechainViewDigestHex,
        normalized.finalityProofDigestHex,
        normalized.checkAdmissionDigestHex,
        normalized.authorizationDigestHex,
      );
      const persistedRow = this.db.prepare(`
        SELECT *
        FROM authenticated_settlement_execution_reservations
        WHERE reservation_digest = ?
      `).get(normalized.reservationDigestHex);
      if (!persistedRow) {
        throw new Error('authenticated settlement execution reservation was not persisted');
      }
      const persisted = mapAuthenticatedSettlementExecutionReservationRow(persistedRow);
      if (
        persisted.status !== 'active'
        || !authenticatedSettlementExecutionReservationMatchesAdmission(persisted, normalized)
      ) {
        throw new Error('persisted authenticated settlement execution reservation is inconsistent');
      }
      return persisted;
    });
    return reserve.immediate();
  }

  getAuthenticatedSettlementSubmissionAttempt(
    lookup: AuthenticatedSettlementSubmissionAttemptLookup,
  ): AuthenticatedSettlementSubmissionAttempt | null {
    let column: string;
    let value: string;
    if ('durableAttemptDigestHex' in lookup) {
      column = 'durable_attempt_digest';
      value = normalizeFixedHex(
        lookup.durableAttemptDigestHex,
        32,
        'authenticated settlement durable attempt digest',
      );
    } else if ('executionReservationDigestHex' in lookup) {
      column = 'execution_reservation_digest';
      value = normalizeFixedHex(
        lookup.executionReservationDigestHex,
        32,
        'authenticated settlement execution reservation digest',
      );
    } else {
      column = 'expected_tx_id';
      value = normalizeSettlementTxId(lookup.expectedTxId);
    }
    const row = this.db.prepare(`
      SELECT *
      FROM authenticated_settlement_submission_attempts
      WHERE ${column} = ?
    `).get(value);
    return row ? mapAuthenticatedSettlementSubmissionAttemptRow(row) : null;
  }

  getRecoverableAuthenticatedSettlementSubmissionAttempts():
  AuthenticatedSettlementSubmissionAttempt[] {
    const attempts = this.db.prepare(`
      SELECT *
      FROM authenticated_settlement_submission_attempts
      WHERE status IN ('pending', 'submitted')
      ORDER BY created_at ASC, id ASC
    `).all().map(mapAuthenticatedSettlementSubmissionAttemptRow);
    for (const attempt of attempts) {
      assertAuthenticatedSettlementTransportAttemptCurrentAuthority(
        this,
        attempt,
      );
    }
    return attempts;
  }

  getObservableAuthenticatedSettlementSubmissionAttempts():
  AuthenticatedSettlementSubmissionAttempt[] {
    return this.db.prepare(`
      SELECT *
      FROM authenticated_settlement_submission_attempts
      WHERE status IN ('pending', 'submitted', 'confirmed')
      ORDER BY created_at ASC, id ASC
    `).all().map(mapAuthenticatedSettlementSubmissionAttemptRow);
  }

  reserveAuthenticatedSettlementTransportAttempt(
    admission: AuthenticatedSettlementTransportAttemptAdmission,
  ): AuthenticatedSettlementSubmissionAttempt {
    assertAuthenticatedSettlementTransportAttemptAdmissionProvenance(admission);
    this.assertWritable('reserve authenticated settlement transport attempt');
    const normalized = {
      schema: admission.schema,
      lifecycleVersion: admission.lifecycleVersion,
      executionReservationDigestHex: normalizeFixedHex(
        admission.executionReservationDigestHex,
        32,
        'authenticated settlement execution reservation digest',
      ),
      transportReservationDigestHex: normalizeFixedHex(
        admission.transportReservationDigestHex,
        32,
        'authenticated settlement transport reservation digest',
      ),
      durableAttemptDigestHex: normalizeFixedHex(
        admission.durableAttemptDigestHex,
        32,
        'authenticated settlement durable attempt digest',
      ),
      candidateId: normalizeFixedHex(
        admission.candidateId,
        32,
        'authenticated settlement candidate ID',
      ),
      expectedTxId: normalizeSettlementTxId(admission.expectedTxId),
      unsignedTxDigestHex: normalizeFixedHex(
        admission.unsignedTxDigestHex,
        32,
        'authenticated settlement unsigned transaction digest',
      ),
      unsignedPackageDigestHex: normalizeFixedHex(
        admission.unsignedPackageDigestHex,
        32,
        'authenticated settlement unsigned package digest',
      ),
      payoutDigestHex: normalizeFixedHex(
        admission.payoutDigestHex,
        32,
        'authenticated settlement payout digest',
      ),
      trackerBoxId: normalizeFixedHex(
        admission.trackerBoxId,
        32,
        'authenticated settlement tracker box ID',
      ),
      duplicatePreventionBoxId: normalizeFixedHex(
        admission.duplicatePreventionBoxId,
        32,
        'authenticated settlement DUP input box ID',
      ),
      signedTransactionDigestHex: normalizeFixedHex(
        admission.signedTransactionDigestHex,
        32,
        'authenticated settlement signed transaction digest',
      ),
      preSubmitRevalidationDigestHex: normalizeFixedHex(
        admission.preSubmitRevalidationDigestHex,
        32,
        'authenticated settlement pre-submit revalidation digest',
      ),
      broadcastAuthorizationDigestHex: normalizeFixedHex(
        admission.broadcastAuthorizationDigestHex,
        32,
        'authenticated settlement broadcast authorization digest',
      ),
    };
    if (
      normalized.schema !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_SCHEMA
      || normalized.lifecycleVersion
        !== AUTHENTICATED_SETTLEMENT_TRANSPORT_ATTEMPT_LIFECYCLE_VERSION
    ) {
      throw new Error('authenticated settlement transport attempt schema is unsupported');
    }
    const expectedIdentity = deriveAuthenticatedSettlementTransportAttemptIdentity(
      normalized,
    );
    if (
      expectedIdentity.transportReservationDigestHex
        !== normalized.transportReservationDigestHex
      || expectedIdentity.durableAttemptDigestHex
        !== normalized.durableAttemptDigestHex
    ) {
      throw new Error('authenticated settlement transport attempt identity is invalid');
    }

    const reserve = this.db.transaction((): AuthenticatedSettlementSubmissionAttempt => {
      assertAuthenticatedSettlementTransportAttemptCurrentAuthority(
        this,
        normalized,
      );
      const authorityRow = this.db.prepare(`
        SELECT r.*, c.tracker_box_id AS candidate_tracker_box_id,
          c.status AS candidate_status,
          c.invalidation_reason AS candidate_invalidation_reason
        FROM authenticated_settlement_execution_reservations r
        JOIN authenticated_settlement_candidates c ON c.candidate_id = r.candidate_id
        WHERE r.reservation_digest = ?
      `).get(normalized.executionReservationDigestHex) as any | undefined;
      if (!authorityRow) {
        throw new Error(
          'authenticated transport attempt requires one persisted execution reservation',
        );
      }
      const reservation =
        mapAuthenticatedSettlementExecutionReservationRow(authorityRow);
      if (
        reservation.status !== 'active'
        || authorityRow.candidate_status !== 'check_passed'
        || authorityRow.candidate_invalidation_reason !== null
      ) {
        throw new Error(
          'authenticated transport attempt requires an active checked execution reservation',
        );
      }
      if (
        reservation.candidateId !== normalized.candidateId
        || reservation.expectedTxId !== normalized.expectedTxId
        || reservation.unsignedTxDigestHex !== normalized.unsignedTxDigestHex
        || reservation.unsignedPackageDigestHex
          !== normalized.unsignedPackageDigestHex
        || reservation.signedTransactionDigestHex
          !== normalized.signedTransactionDigestHex
        || reservation.duplicatePreventionBoxId
          !== normalized.duplicatePreventionBoxId
        || normalizeFixedHex(
          authorityRow.candidate_tracker_box_id,
          32,
          'persisted authenticated settlement tracker box ID',
        ) !== normalized.trackerBoxId
      ) {
        throw new Error(
          'authenticated transport attempt does not match the active execution reservation',
        );
      }

      const conflict = this.db.prepare(`
        SELECT a.*
        FROM authenticated_settlement_submission_attempts a
        JOIN authenticated_settlement_execution_reservations prior
          ON prior.reservation_digest = a.execution_reservation_digest
        WHERE a.execution_reservation_digest = ?
          OR a.transport_reservation_digest = ?
          OR a.durable_attempt_digest = ?
          OR a.candidate_id = ?
          OR a.expected_tx_id = ?
          OR prior.burn_id = ?
          OR prior.dup_input_box_id = ?
          OR prior.vault_box_id = ?
        ORDER BY a.id ASC
        LIMIT 1
      `).get(
        normalized.executionReservationDigestHex,
        normalized.transportReservationDigestHex,
        normalized.durableAttemptDigestHex,
        normalized.candidateId,
        normalized.expectedTxId,
        reservation.burnId,
        reservation.duplicatePreventionBoxId,
        reservation.vaultBoxId,
      );
      if (conflict) {
        const existing = mapAuthenticatedSettlementSubmissionAttemptRow(conflict);
        const detail = authenticatedSettlementSubmissionAttemptMatchesAdmission(
          existing,
          admission,
        )
          ? 'already has a durable transport attempt; reconcile it without resubmission'
          : 'conflicts with an existing durable transport attempt';
        throw new Error(`authenticated execution reservation ${detail}`);
      }

      this.db.prepare(`
        INSERT INTO authenticated_settlement_submission_attempts (
          schema,
          lifecycle_version,
          execution_reservation_digest,
          transport_reservation_digest,
          durable_attempt_digest,
          candidate_id,
          expected_tx_id,
          unsigned_tx_digest,
          unsigned_package_digest,
          payout_digest,
          tracker_box_id,
          dup_input_box_id,
          signed_transaction_digest,
          pre_submit_revalidation_digest,
          broadcast_authorization_digest,
          status,
          submission_attempted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1)
      `).run(
        normalized.schema,
        normalized.lifecycleVersion,
        normalized.executionReservationDigestHex,
        normalized.transportReservationDigestHex,
        normalized.durableAttemptDigestHex,
        normalized.candidateId,
        normalized.expectedTxId,
        normalized.unsignedTxDigestHex,
        normalized.unsignedPackageDigestHex,
        normalized.payoutDigestHex,
        normalized.trackerBoxId,
        normalized.duplicatePreventionBoxId,
        normalized.signedTransactionDigestHex,
        normalized.preSubmitRevalidationDigestHex,
        normalized.broadcastAuthorizationDigestHex,
      );
      const persisted = this.getAuthenticatedSettlementSubmissionAttempt({
        durableAttemptDigestHex: normalized.durableAttemptDigestHex,
      });
      if (
        !persisted
        || persisted.status !== 'pending'
        || !authenticatedSettlementSubmissionAttemptMatchesAdmission(
          persisted,
          admission,
        )
      ) {
        throw new Error(
          'authenticated settlement transport attempt was not persisted exactly',
        );
      }
      return persisted;
    });
    return reserve.immediate();
  }

  finalizeAuthenticatedSettlementSubmissionAttempt(
    input: AuthenticatedSettlementSubmissionFinalizationInput,
  ): AuthenticatedSettlementSubmissionAttempt {
    this.assertWritable('finalize authenticated settlement submission attempt');
    const durableAttemptDigestHex = normalizeFixedHex(
      input.durableAttemptDigestHex,
      32,
      'authenticated settlement durable attempt digest',
    );
    if (
      input.disposition !== 'accepted'
      && input.disposition !== 'rejected'
      && input.disposition !== 'ambiguous'
    ) {
      throw new Error('authenticated settlement submission disposition is unsupported');
    }
    const submittedTxId = input.submittedTxId === null
      ? null
      : normalizeSettlementTxId(input.submittedTxId);
    const responseDigestHex = input.responseDigestHex === null
      ? null
      : normalizeFixedHex(
        input.responseDigestHex,
        32,
        'authenticated settlement submission response digest',
      );
    if (
      (input.disposition === 'accepted' && submittedTxId === null)
      || (input.disposition !== 'accepted' && submittedTxId !== null)
      || (
        (input.disposition === 'accepted' || input.disposition === 'rejected')
        && responseDigestHex === null
      )
    ) {
      throw new Error(
        'authenticated settlement submission result is inconsistent with its disposition',
      );
    }

    const finalize = this.db.transaction((): AuthenticatedSettlementSubmissionAttempt => {
      const row = this.db.prepare(`
        SELECT *
        FROM authenticated_settlement_submission_attempts
        WHERE durable_attempt_digest = ?
      `).get(durableAttemptDigestHex);
      if (!row) {
        throw new Error('authenticated settlement durable attempt is unavailable');
      }
      const attempt = mapAuthenticatedSettlementSubmissionAttemptRow(row);
      if (submittedTxId !== null && submittedTxId !== attempt.expectedTxId) {
        throw new Error(
          'authenticated settlement submitted transaction ID does not match the durable attempt',
        );
      }
      if (attempt.status === 'quarantined') {
        throw new Error('quarantined authenticated settlement attempt cannot be finalized');
      }
      const exactReplay =
        attempt.submissionDisposition === input.disposition
        && attempt.submittedTxId === submittedTxId
        && attempt.responseDigestHex === responseDigestHex;
      if (attempt.submissionDisposition !== null) {
        if (!exactReplay) {
          throw new Error(
            'authenticated settlement submission finalization conflicts with the durable journal',
          );
        }
        return attempt;
      }
      if (attempt.status !== 'pending') {
        throw new Error(
          `authenticated settlement attempt status ${attempt.status} cannot be finalized`,
        );
      }
      const reservation = this.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: attempt.executionReservationDigestHex,
      });
      if (!reservation || reservation.status !== 'active') {
        throw new Error(
          'authenticated settlement execution reservation is no longer active',
        );
      }
      const status = input.disposition === 'accepted'
        ? 'submitted'
        : input.disposition === 'rejected'
          ? 'rejected'
          : 'pending';
      const mutation = this.db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET status = ?,
            submission_disposition = ?,
            submitted_tx_id = ?,
            response_digest = ?,
            submission_finalized_at = datetime('now'),
            updated_at = datetime('now')
        WHERE durable_attempt_digest = ?
          AND status = 'pending'
          AND submission_disposition IS NULL
      `).run(
        status,
        input.disposition,
        submittedTxId,
        responseDigestHex,
        durableAttemptDigestHex,
      );
      if (mutation.changes !== 1) {
        throw new Error(
          'authenticated settlement submission finalization compare-and-set did not apply',
        );
      }
      const persisted = this.getAuthenticatedSettlementSubmissionAttempt({
        durableAttemptDigestHex,
      });
      if (
        !persisted
        || persisted.status !== status
        || persisted.submissionDisposition !== input.disposition
        || persisted.submittedTxId !== submittedTxId
        || persisted.responseDigestHex !== responseDigestHex
      ) {
        throw new Error(
          'authenticated settlement submission finalization was not persisted exactly',
        );
      }
      return persisted;
    });
    return finalize.immediate();
  }

  recordAuthenticatedSettlementSubmissionObservation(
    input: AuthenticatedSettlementSubmissionObservationInput,
  ): AuthenticatedSettlementSubmissionObservationResult {
    this.assertWritable('record authenticated settlement submission observation');
    const durableAttemptDigestHex = normalizeFixedHex(
      input.durableAttemptDigestHex,
      32,
      'authenticated settlement durable attempt digest',
    );
    const authority = normalizeAggregateSettlementObservationAuthority({
      observation: input.observation,
      consensus: input.consensus,
    });
    if (
      authority.sourceAuthorityProfile
        !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
      || authority.sourceCount < 2
      || authority.consensusDigestHex === null
    ) {
      throw new Error(
        'authenticated settlement confirmation requires matching bounded Ergo observations',
      );
    }

    const record = this.db.transaction(
      (): AuthenticatedSettlementSubmissionObservationResult => {
        const row = this.db.prepare(`
          SELECT *
          FROM authenticated_settlement_submission_attempts
          WHERE durable_attempt_digest = ?
        `).get(durableAttemptDigestHex);
        if (!row) {
          throw new Error('authenticated settlement durable attempt is unavailable');
        }
        const attempt = mapAuthenticatedSettlementSubmissionAttemptRow(row);
        if (authority.observation.transactionIdHex !== attempt.expectedTxId) {
          throw new Error(
            'authenticated settlement observation transaction ID does not match the durable attempt',
          );
        }
        if (attempt.status === 'rejected') {
          throw new Error(
            'rejected authenticated settlement attempt cannot accept confirmation evidence',
          );
        }
        if (attempt.status === 'quarantined') {
          throw new Error(
            'quarantined authenticated settlement attempt is terminal pending explicit recovery',
          );
        }
        const confirmedTransactionReorged =
          attempt.status === 'confirmed'
          && attempt.ergoObservation !== null
          && !sameObservedAggregateSettlementTransaction(
            attempt.ergoObservation,
            authority.observation,
          );
        const confirmedTransactionDisappeared =
          attempt.status === 'confirmed'
          && !confirmedTransactionReorged
          && authority.observation.status !== 'confirmed_final';
        if (
          attempt.ergoObservation
          && !confirmedTransactionReorged
          && !confirmedTransactionDisappeared
          && (
            authority.observation.observedTipHeight
              < attempt.ergoObservation.observedTipHeight
            || (
              authority.observation.observedTipHeight
                === attempt.ergoObservation.observedTipHeight
              && authority.observation.observedTipHeaderIdHex
                !== attempt.ergoObservation.observedTipHeaderIdHex
            )
          )
        ) {
          throw new Error(
            'authenticated settlement observation does not advance the recorded Ergo view',
          );
        }
        if (
          attempt.ergoObservation
          && attempt.status !== 'confirmed'
          && !sameObservedAggregateSettlementTransaction(
            attempt.ergoObservation,
            authority.observation,
          )
        ) {
          throw new Error(
            'authenticated settlement observation changes the recorded transaction inclusion',
          );
        }

        const reservation = this.getAuthenticatedSettlementExecutionReservation({
          reservationDigestHex: attempt.executionReservationDigestHex,
        });
        let nextStatus: AuthenticatedSettlementSubmissionAttemptStatus;
        let resultStatus: AuthenticatedSettlementSubmissionObservationResult['status'];
        let quarantineReason:
          AuthenticatedSettlementSubmissionQuarantineReason | null = null;
        let submissionDisposition = attempt.submissionDisposition;
        let submittedTxId = attempt.submittedTxId;
        if (!reservation || reservation.status !== 'active') {
          nextStatus = 'quarantined';
          resultStatus = 'quarantined';
          quarantineReason = 'execution_reservation_revoked';
        } else if (confirmedTransactionReorged) {
          nextStatus = 'quarantined';
          resultStatus = 'quarantined';
          quarantineReason = 'confirmed_transaction_reorged';
        } else if (confirmedTransactionDisappeared) {
          nextStatus = 'quarantined';
          resultStatus = 'quarantined';
          quarantineReason = 'confirmed_transaction_disappeared';
        } else if (authority.observation.status === 'confirmed_final') {
          if (
            attempt.status === 'confirmed'
            && !canAdvanceConfirmedAggregateSettlementObservation(
              attempt.ergoObservation,
              authority.observation,
            )
          ) {
            throw new Error(
              'authenticated settlement final observation conflicts with confirmed history',
            );
          }
          nextStatus = 'confirmed';
          resultStatus = 'confirmed';
          submissionDisposition = 'accepted';
          submittedTxId = attempt.expectedTxId;
        } else if (
          authority.observation.status === 'mempool'
          || authority.observation.status === 'confirmed_pre_finality'
        ) {
          if (attempt.status === 'confirmed') {
            nextStatus = 'quarantined';
            resultStatus = 'quarantined';
            quarantineReason = 'confirmed_transaction_disappeared';
          } else {
            nextStatus = 'submitted';
            resultStatus = 'submitted';
            submissionDisposition = 'accepted';
            submittedTxId = attempt.expectedTxId;
          }
        } else if (attempt.status === 'confirmed') {
          nextStatus = 'quarantined';
          resultStatus = 'quarantined';
          quarantineReason = 'confirmed_transaction_disappeared';
        } else {
          nextStatus = attempt.status;
          resultStatus = 'pending_reconciliation';
        }

        this.db.prepare(`
          UPDATE authenticated_settlement_submission_attempts
          SET status = ?,
              submission_disposition = ?,
              submitted_tx_id = ?,
              ergo_observation_policy_version = ?,
              ergo_observation_required_confirmations = ?,
              ergo_observation_status = ?,
              ergo_observation_transaction_digest = ?,
              ergo_observation_inclusion_height = ?,
              ergo_observation_inclusion_header_id = ?,
              ergo_observation_tip_height = ?,
              ergo_observation_tip_header_id = ?,
              ergo_observation_confirmations = ?,
              ergo_observation_digest = ?,
              ergo_observation_source_count = ?,
              ergo_observation_consensus_digest = ?,
              quarantine_reason = ?,
              confirmed_at = CASE
                WHEN ? = 'confirmed' THEN COALESCE(confirmed_at, datetime('now'))
                ELSE confirmed_at
              END,
              updated_at = datetime('now')
          WHERE durable_attempt_digest = ?
        `).run(
          nextStatus,
          submissionDisposition,
          submittedTxId,
          authority.observation.policyVersion,
          authority.observation.requiredConfirmations,
          authority.observation.status,
          authority.observation.transactionDigestHex,
          authority.observation.inclusionHeight,
          authority.observation.inclusionHeaderIdHex,
          authority.observation.observedTipHeight,
          authority.observation.observedTipHeaderIdHex,
          authority.observation.confirmations,
          authority.observation.observationDigestHex,
          authority.sourceCount,
          authority.consensusDigestHex,
          quarantineReason,
          nextStatus,
          durableAttemptDigestHex,
        );
        const persisted = this.getAuthenticatedSettlementSubmissionAttempt({
          durableAttemptDigestHex,
        });
        if (
          !persisted
          || persisted.status !== nextStatus
          || persisted.ergoObservation?.observationDigestHex
            !== authority.observation.observationDigestHex
          || persisted.ergoObservationConsensusDigestHex
            !== authority.consensusDigestHex
        ) {
          throw new Error(
            'authenticated settlement confirmation observation was not persisted exactly',
          );
        }
        return { applied: true, status: resultStatus, attempt: persisted };
      },
    );
    return record.immediate();
  }

  getActiveAuthenticatedSettlementCandidates(): AuthenticatedSettlementCandidate[] {
    const rows = this.db.prepare(`
      SELECT * FROM authenticated_settlement_candidates
      WHERE status IN ('prepared', 'check_passed')
      ORDER BY created_at ASC, id ASC
    `).all();
    return rows.map(mapAuthenticatedSettlementCandidateRow);
  }

  markAuthenticatedSettlementCandidateCheckPassed(
    admission: AuthenticatedSettlementCheckAdmission,
  ): boolean {
    assertAuthenticatedSettlementCheckAdmissionProvenance(admission);
    this.assertWritable('mark authenticated settlement candidate check passed');
    const normalizedCandidateId = normalizeFixedHex(
      admission.candidateId,
      32,
      'authenticated settlement candidate ID',
    );
    const normalizedExpectedTxId = normalizeSettlementTxId(admission.expectedTxId);
    const normalizedUnsignedPackageDigest = normalizeFixedHex(
      admission.unsignedPackageDigestHex,
      32,
      'unsigned settlement package digest',
    );
    const normalizedSignedTransactionDigest = normalizeFixedHex(
      admission.signedTransactionDigestHex,
      32,
      'signed settlement transaction digest',
    );
    const normalizedCheckResponseDigest = normalizeFixedHex(
      admission.checkResponseDigestHex,
      32,
      'transaction check response digest',
    );
    const normalizedSignerContextDigest = normalizeFixedHex(
      admission.signerContextDigestHex,
      32,
      'transaction check signer context digest',
    );
    const normalizedCheckerIdentityDigest = normalizeFixedHex(
      admission.checkerIdentityDigestHex,
      32,
      'transaction check checker identity digest',
    );
    const normalizedCheckRevalidationDigest = normalizeFixedHex(
      admission.revalidationDigestHex,
      32,
      'transaction check revalidation digest',
    );
    const normalizedNativeVerificationRequestDigest = normalizeFixedHex(
      admission.nativeVerificationRequestDigestHex,
      32,
      'transaction check native verification request digest',
    );
    const normalizedTrustAnchorDigest = normalizeFixedHex(
      admission.trustAnchorDigestHex,
      32,
      'transaction check trust anchor digest',
    );
    const normalizedFinalityHorizonHash = normalizeFixedHex(
      admission.finalityHorizonHashHex,
      32,
      'transaction check finality horizon hash',
    );
    const normalizedFinalityHorizonHeight = normalizePositiveSignedLong(
      admission.finalityHorizonHeight,
      'transaction check finality horizon height',
    );
    const normalizedFinalityStatementDigest = normalizeFixedHex(
      admission.finalityStatementDigestHex,
      32,
      'transaction check finality statement digest',
    );
    const normalizedFinalityProgramId = normalizeFixedHex(
      admission.finalityProgramIdHex,
      32,
      'transaction check finality program ID',
    );
    const normalizedFinalityProofSystemId = admission.finalityProofSystemId;
    if (
      normalizedFinalityProofSystemId
      !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA
    ) {
      throw new Error('transaction check finality proof system is unsupported');
    }
    const normalizedFinalityVerifierProfileId = normalizeFixedHex(
      admission.finalityVerifierProfileIdHex,
      32,
      'transaction check finality verifier profile ID',
    );
    const normalizedFinalityProofPayloadDigest = normalizeFixedHex(
      admission.finalityProofPayloadDigestHex,
      32,
      'transaction check finality proof payload digest',
    );
    const normalizedFinalityProofDigest = normalizeFixedHex(
      admission.finalityProofDigestHex,
      32,
      'transaction check aggregate finality proof digest',
    );
    const normalizedStableErgoViewDigest = normalizeFixedHex(
      admission.stableErgoViewDigestHex,
      32,
      'transaction check stable Ergo view digest',
    );
    const normalizedStableSidechainViewDigest = normalizeFixedHex(
      admission.stableSidechainViewDigestHex,
      32,
      'transaction check stable sidechain view digest',
    );
    const normalizedAdmissionDigest = normalizeFixedHex(
      admission.admissionDigestHex,
      32,
      'transaction check admission digest',
    );
    const run = this.db.transaction((): boolean => {
      const row = this.db.prepare(`
        SELECT c.*, p.status AS peg_out_status
        FROM authenticated_settlement_candidates c
        JOIN peg_out_events p ON lower(p.burn_id) = c.burn_id
        WHERE c.candidate_id = ?
      `).get(normalizedCandidateId) as any | undefined;
      if (!row || row.status === 'invalidated') return false;
      if (row.peg_out_status !== 'detected' && row.peg_out_status !== 'confirmed') {
        throw new Error(
          `cannot mark candidate check passed from peg-out status ${row.peg_out_status}`,
        );
      }
      if (row.status === 'check_passed') {
        if (
          row.check_expected_tx_id !== normalizedExpectedTxId
          || row.check_unsigned_package_digest !== normalizedUnsignedPackageDigest
          || row.check_signed_transaction_digest !== normalizedSignedTransactionDigest
          || row.check_response_digest !== normalizedCheckResponseDigest
          || row.check_signer_context_digest !== normalizedSignerContextDigest
          || row.check_checker_identity_digest !== normalizedCheckerIdentityDigest
          || row.check_revalidation_digest !== normalizedCheckRevalidationDigest
          || row.check_native_verification_request_digest
            !== normalizedNativeVerificationRequestDigest
          || row.check_trust_anchor_digest !== normalizedTrustAnchorDigest
          || row.check_finality_horizon_hash !== normalizedFinalityHorizonHash
          || BigInt(row.check_finality_horizon_height)
            !== normalizedFinalityHorizonHeight
          || row.check_finality_statement_digest
            !== normalizedFinalityStatementDigest
          || row.check_finality_program_id !== normalizedFinalityProgramId
          || row.check_finality_proof_system_id
            !== normalizedFinalityProofSystemId
          || row.check_finality_verifier_profile_id
            !== normalizedFinalityVerifierProfileId
          || row.check_finality_proof_payload_digest
            !== normalizedFinalityProofPayloadDigest
          || row.check_finality_proof_digest !== normalizedFinalityProofDigest
          || row.check_stable_ergo_view_digest !== normalizedStableErgoViewDigest
          || row.check_stable_sidechain_view_digest !== normalizedStableSidechainViewDigest
          || row.check_admission_digest !== normalizedAdmissionDigest
        ) {
          throw new Error('authenticated settlement candidate check result conflicts with journal');
        }
        return true;
      }
      const result = this.db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET status = 'check_passed',
            check_expected_tx_id = ?,
            check_unsigned_package_digest = ?,
            check_signed_transaction_digest = ?,
            check_response_digest = ?,
            check_signer_context_digest = ?,
            check_checker_identity_digest = ?,
            check_revalidation_digest = ?,
            check_native_verification_request_digest = ?,
            check_trust_anchor_digest = ?,
            check_finality_horizon_hash = ?,
            check_finality_horizon_height = ?,
            check_finality_statement_digest = ?,
            check_finality_program_id = ?,
            check_finality_proof_system_id = ?,
            check_finality_verifier_profile_id = ?,
            check_finality_proof_payload_digest = ?,
            check_finality_proof_digest = ?,
            check_stable_ergo_view_digest = ?,
            check_stable_sidechain_view_digest = ?,
            check_admission_digest = ?,
            updated_at = datetime('now')
        WHERE candidate_id = ? AND status = 'prepared'
      `).run(
        normalizedExpectedTxId,
        normalizedUnsignedPackageDigest,
        normalizedSignedTransactionDigest,
        normalizedCheckResponseDigest,
        normalizedSignerContextDigest,
        normalizedCheckerIdentityDigest,
        normalizedCheckRevalidationDigest,
        normalizedNativeVerificationRequestDigest,
        normalizedTrustAnchorDigest,
        normalizedFinalityHorizonHash,
        normalizedFinalityHorizonHeight.toString(),
        normalizedFinalityStatementDigest,
        normalizedFinalityProgramId,
        normalizedFinalityProofSystemId,
        normalizedFinalityVerifierProfileId,
        normalizedFinalityProofPayloadDigest,
        normalizedFinalityProofDigest,
        normalizedStableErgoViewDigest,
        normalizedStableSidechainViewDigest,
        normalizedAdmissionDigest,
        normalizedCandidateId,
      );
      return result.changes === 1;
    });
    return run.immediate();
  }

  invalidateAuthenticatedSettlementCandidate(candidateId: string, reason: string): boolean {
    this.assertWritable('invalidate authenticated settlement candidate');
    const normalizedCandidateId = normalizeFixedHex(
      candidateId,
      32,
      'authenticated settlement candidate ID',
    );
    const normalizedReason = normalizeReason(reason, 'candidate invalidation reason');
    const result = this.db.prepare(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = ?,
          updated_at = datetime('now')
      WHERE candidate_id = ? AND status IN ('prepared', 'check_passed')
    `).run(normalizedReason, normalizedCandidateId);
    return result.changes === 1;
  }

  invalidateActiveAuthenticatedSettlementCandidates(reason: string): number {
    this.assertWritable('invalidate active authenticated settlement candidates');
    const normalizedReason = normalizeReason(reason, 'candidate invalidation reason');
    const result = this.db.prepare(`
      UPDATE authenticated_settlement_candidates
      SET status = 'invalidated',
          invalidation_reason = ?,
          updated_at = datetime('now')
      WHERE status IN ('prepared', 'check_passed')
    `).run(normalizedReason);
    return result.changes;
  }

  markPegOutBurnRevertedAndInvalidateCandidates(
    lookup: PegOutEventLookup,
    reason: string,
  ): AuthenticatedSettlementBurnRevertResult {
    this.assertWritable('mark peg-out burn reverted and invalidate candidates');
    const normalizedReason = normalizeReason(reason, 'burn reversion reason');
    const run = this.db.transaction((): AuthenticatedSettlementBurnRevertResult => {
      const pegOut = this.requirePegOut(lookup, 'mark burn reverted') as {
        id: number;
        burn_id: string | null;
        sidechain_burn_tx_hash: string;
        status: PegOutStatus;
      };
      if (pegOut.status === 'phase2_unlocked') {
        throw new Error('cannot classify an already-settled peg-out as a recoverable burn reversion');
      }
      const pegOutTransitioned = pegOut.status !== 'burn_reverted';
      if (pegOutTransitioned) {
        this.db.prepare(`
          UPDATE peg_out_events
          SET status = 'burn_reverted', updated_at = datetime('now')
          WHERE id = ?
        `).run(pegOut.id);
      }
      const candidates = pegOut.burn_id === null
        ? { changes: 0 }
        : this.db.prepare(`
          UPDATE authenticated_settlement_candidates
          SET status = 'invalidated',
              invalidation_reason = ?,
              updated_at = datetime('now')
          WHERE burn_id = ? AND status IN ('prepared', 'check_passed')
        `).run(normalizedReason, normalizeBurnId(pegOut.burn_id));
      return {
        pegOutTransitioned,
        candidatesInvalidated: candidates.changes,
      };
    });
    return run.immediate();
  }

  /** Look up a peg-out by sidechain TX hash regardless of status (for dedup) */
  getPegOutEventCountByTxHash(burnTxHash: string): number {
    const normalizedBurnTxHash = normalizeBurnTxHash(burnTxHash);
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM peg_out_events
      WHERE lower(
        CASE
          WHEN substr(sidechain_burn_tx_hash, 1, 2) = '0x'
            THEN substr(sidechain_burn_tx_hash, 3)
          ELSE sidechain_burn_tx_hash
        END
      ) = ?
    `).get(normalizedBurnTxHash) as { count: number };
    return row.count;
  }

  getPegOut(lookup: PegOutEventLookup): PegOutEvent | undefined {
    return this.resolvePegOutRow(lookup, 'look up peg-out', false) as
      | PegOutEvent
      | undefined;
  }

  getPegOutByTxHash(burnTxHash: string): PegOutEvent | undefined {
    return this.getPegOut(burnTxHash);
  }

  getPegOutByBurnId(burnId: string): PegOutEvent | undefined {
    return this.getPegOut({ burnId });
  }

  getPegOutByEvent(burnTxHash: string, sidechainLogIndex: number): PegOutEvent | undefined {
    return this.getPegOut({ burnTxHash, sidechainLogIndex });
  }

  // --- AVL Tree History (Rebuild-on-Demand) ------------------

  insertAvlKey(keyHex: string, valueHex: string = '01'): void {
    this.assertWritable('insert AVL key');
    this.db.prepare(`
      INSERT OR IGNORE INTO avl_tree_history (key_hex, value_hex)
      VALUES (?, ?)
    `).run(keyHex, valueHex);
  }

  getAllAvlKeys(): string[] {
    const rows = this.db.prepare(`
      SELECT key_hex FROM avl_tree_history ORDER BY id ASC
    `).all() as { key_hex: string }[];
    return rows.map(r => r.key_hex);
  }

  hasAvlKey(keyHex: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM avl_tree_history WHERE key_hex = ?
    `).get(keyHex);
    return !!row;
  }

  getSpvTrackerIdentityByHeight(
    sidechainHeight: number | bigint,
    sidechainIdHex: string,
  ): SpvTrackerEntry | null {
    const rows = this.db.prepare(`
      SELECT sidechain_height, sidechain_header_hash, bridge_event_root, ergo_anchor_height
      FROM spv_tracker_history
      WHERE sidechain_height = ?
      ORDER BY id ASC
    `).all(BigInt(sidechainHeight).toString()) as {
      sidechain_height: string;
      sidechain_header_hash: string;
      bridge_event_root: string;
      ergo_anchor_height: number;
    }[];

    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(`multiple SPV tracker entries for sidechain height ${sidechainHeight}`);
    }

    return {
      sidechainIdHex,
      sidechainHeight: BigInt(rows[0].sidechain_height),
      sidechainHeaderHashHex: rows[0].sidechain_header_hash,
      bridgeEventRootHex: rows[0].bridge_event_root,
      ergoAnchorHeight: rows[0].ergo_anchor_height,
    };
  }

  // SPV Tracker History (Schema B, key=32B, value=36B)

  insertSpvTrackerEntry(entry: SpvTrackerHistoryEntry): void {
    this.assertWritable('insert SPV tracker entry');
    const existing = this.db.prepare(`
      SELECT 1 FROM spv_tracker_history WHERE key_hex = ?
    `).get(entry.keyHex);
    if (existing) {
      if (!this.hasExactSpvTrackerEntry(entry)) {
        throw new Error(`SPV tracker entry ${entry.keyHex} conflicts with persisted history`);
      }
      return;
    }
    const result = this.db.prepare(`
      INSERT INTO spv_tracker_history (
        key_hex,
        value_hex,
        sidechain_height,
        sidechain_header_hash,
        bridge_event_root,
        ergo_anchor_height
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.keyHex,
      entry.valueHex,
      entry.sidechainHeight.toString(),
      entry.sidechainHeaderHash,
      entry.bridgeEventRoot,
      entry.ergoAnchorHeight,
    );
    if (result.changes !== 1 || !this.hasExactSpvTrackerEntry(entry)) {
      throw new Error(`SPV tracker entry ${entry.keyHex} was not persisted exactly`);
    }
  }

  getSpvTrackerHistory(): { key: string; value: string }[] {
    const rows = this.db.prepare(`
      SELECT key_hex, value_hex FROM spv_tracker_history ORDER BY id ASC
    `).all() as { key_hex: string; value_hex: string }[];
    return rows.map(r => ({ key: r.key_hex, value: r.value_hex }));
  }

  hasSpvTrackerKey(keyHex: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM spv_tracker_history WHERE key_hex = ?
    `).get(keyHex);
    return !!row;
  }

  getAuthenticatedV2DupHistory(): string[] {
    const rows = this.db.prepare(`
      SELECT key_hex FROM authenticated_dup_history ORDER BY id ASC
    `).all() as { key_hex: string }[];
    return rows.map(row => normalizeFixedHex(row.key_hex, 32, 'persisted authenticated DUP key'));
  }

  getAuthenticatedV2DupReconstructionState(): AuthenticatedV2DupReconstructionCacheState | null {
    const row = this.db.prepare(`
      SELECT dup_nft_id, dup_ergo_tree, genesis_box_id, tip_box_id, tip_digest,
             observation_digest, observed_ergo_tip, observed_ergo_tip_id,
             observed_ergo_parent_id, observed_ergo_extension_root
      FROM authenticated_dup_reconstruction_state
      WHERE id = 1
    `).get() as {
      dup_nft_id: string;
      dup_ergo_tree: string;
      genesis_box_id: string;
      tip_box_id: string;
      tip_digest: string;
      observation_digest: string;
      observed_ergo_tip: number;
      observed_ergo_tip_id: string;
      observed_ergo_parent_id: string;
      observed_ergo_extension_root: string;
    } | undefined;
    if (!row) return null;
    return {
      duplicatePreventionNftIdHex: normalizeFixedHex(
        row.dup_nft_id,
        32,
        'persisted DUP NFT ID',
      ),
      duplicatePreventionErgoTreeHex: normalizeHex(
        row.dup_ergo_tree,
        'persisted DUP ErgoTree',
      ),
      genesisBoxId: normalizeFixedHex(row.genesis_box_id, 32, 'persisted DUP genesis box ID'),
      tipBoxId: normalizeFixedHex(row.tip_box_id, 32, 'persisted DUP tip box ID'),
      tipDigest: normalizeFixedHex(row.tip_digest, 33, 'persisted DUP tip digest'),
      observationDigest: normalizeFixedHex(
        row.observation_digest,
        32,
        'persisted DUP observation digest',
      ),
      observedErgoTip: normalizeNonnegativeSignedInt(
        row.observed_ergo_tip,
        'persisted DUP observed Ergo tip',
      ),
      observedErgoTipId: normalizeFixedHex(
        row.observed_ergo_tip_id,
        32,
        'persisted DUP observed Ergo tip ID',
      ),
      observedErgoParentId: normalizeFixedHex(
        row.observed_ergo_parent_id,
        32,
        'persisted DUP observed Ergo parent ID',
      ),
      observedErgoExtensionRoot: normalizeFixedHex(
        row.observed_ergo_extension_root,
        32,
        'persisted DUP observed Ergo extension root',
      ),
    };
  }

  replaceAuthenticatedV2DupHistory(
    reconstruction: AuthenticatedV2DupReconstruction,
    expectedIdentity: AuthenticatedV2DupCacheIdentity,
  ): AuthenticatedV2DupHistoryReplacementResult {
    assertAuthenticatedV2DupReconstructionProvenance(reconstruction);
    this.assertWritable('replace authenticated V2 DUP history');
    const duplicatePreventionNftIdHex = normalizeFixedHex(
      expectedIdentity.duplicatePreventionNftIdHex,
      32,
      'configured DUP NFT ID',
    );
    const duplicatePreventionErgoTreeHex = normalizeHex(
      expectedIdentity.duplicatePreventionErgoTreeHex,
      'configured DUP ErgoTree',
    );
    if (
      normalizeFixedHex(reconstruction.duplicatePreventionNftIdHex, 32, 'reconstructed DUP NFT ID')
        !== duplicatePreventionNftIdHex
      || normalizeHex(reconstruction.duplicatePreventionErgoTreeHex, 'reconstructed DUP ErgoTree')
        !== duplicatePreventionErgoTreeHex
    ) {
      throw new Error('reconstructed DUP identity does not match the configured cache identity');
    }
    const genesisBoxId = normalizeFixedHex(
      reconstruction.genesisBoxIdHex,
      32,
      'reconstructed DUP genesis box ID',
    );
    const tipBoxId = normalizeFixedHex(
      reconstruction.tipBoxIdHex,
      32,
      'reconstructed DUP tip box ID',
    );
    const tipDigest = normalizeFixedHex(
      reconstruction.tipDigestHex,
      33,
      'reconstructed DUP tip digest',
    );
    const observationDigest = normalizeFixedHex(
      reconstruction.observationDigestHex,
      32,
      'reconstructed DUP observation digest',
    );
    const observedErgoTip = normalizeNonnegativeSignedInt(
      reconstruction.observedTip.height,
      'reconstructed DUP observed Ergo tip',
    );
    const observedErgoTipId = normalizeFixedHex(
      reconstruction.observedTip.idHex,
      32,
      'reconstructed DUP observed Ergo tip ID',
    );
    const observedErgoParentId = normalizeFixedHex(
      reconstruction.observedTip.parentIdHex,
      32,
      'reconstructed DUP observed Ergo parent ID',
    );
    const observedErgoExtensionRoot = normalizeFixedHex(
      reconstruction.observedTip.extensionRootHex,
      32,
      'reconstructed DUP observed Ergo extension root',
    );
    if (reconstruction.historyKeys.length !== reconstruction.transitions.length) {
      throw new Error('reconstructed DUP history and transition counts differ');
    }
    const entries = reconstruction.historyKeys.map((key, index) => {
      const transition = reconstruction.transitions[index];
      const normalizedKey = normalizeFixedHex(key, 32, `reconstructed DUP key ${index}`);
      if (normalizedKey !== transition.burnIdHex) {
        throw new Error(`reconstructed DUP transition ${index} does not bind its history key`);
      }
      return {
        keyHex: normalizedKey,
        insertionTxId: normalizeFixedHex(
          transition.spendingTransactionIdHex,
          32,
          `reconstructed DUP transition ${index} transaction ID`,
        ),
        inputBoxId: normalizeFixedHex(
          transition.dupInputBoxIdHex,
          32,
          `reconstructed DUP transition ${index} input box ID`,
        ),
        successorBoxId: normalizeFixedHex(
          transition.dupSuccessorBoxIdHex,
          32,
          `reconstructed DUP transition ${index} successor box ID`,
        ),
      };
    });
    const run = this.db.transaction((): AuthenticatedV2DupHistoryReplacementResult => {
      const previous = this.db.prepare(`
        SELECT key_hex, insertion_tx_id, dup_input_box_id, dup_successor_box_id
        FROM authenticated_dup_history
        ORDER BY id ASC
      `).all() as Array<{
        key_hex: string;
        insertion_tx_id: string;
        dup_input_box_id: string;
        dup_successor_box_id: string;
      }>;
      const previousState = this.getAuthenticatedV2DupReconstructionState();
      if (
        previousState !== null
        && (
          previousState.duplicatePreventionNftIdHex !== duplicatePreventionNftIdHex
          || previousState.duplicatePreventionErgoTreeHex !== duplicatePreventionErgoTreeHex
        )
      ) {
        throw new Error('configured DUP cache identity conflicts with the persisted singleton');
      }
      const unchanged = previousState !== null
        && previousState.duplicatePreventionNftIdHex === duplicatePreventionNftIdHex
        && previousState.duplicatePreventionErgoTreeHex === duplicatePreventionErgoTreeHex
        && previousState.genesisBoxId === genesisBoxId
        && previousState.tipBoxId === tipBoxId
        && previousState.tipDigest === tipDigest
        && previous.length === entries.length
        && entries.every((entry, index) => {
          const row = previous[index];
          return row.key_hex === entry.keyHex
            && row.insertion_tx_id === entry.insertionTxId
            && row.dup_input_box_id === entry.inputBoxId
            && row.dup_successor_box_id === entry.successorBoxId;
        });
      if (!unchanged) {
        this.db.prepare('DELETE FROM authenticated_dup_history').run();
        const insert = this.db.prepare(`
          INSERT INTO authenticated_dup_history (
            key_hex, insertion_tx_id, dup_input_box_id, dup_successor_box_id
          ) VALUES (?, ?, ?, ?)
        `);
        for (const entry of entries) {
          insert.run(entry.keyHex, entry.insertionTxId, entry.inputBoxId, entry.successorBoxId);
        }
      }
      this.db.prepare(`
        INSERT INTO authenticated_dup_reconstruction_state (
          id, dup_nft_id, dup_ergo_tree, genesis_box_id, tip_box_id, tip_digest,
          observation_digest, observed_ergo_tip, observed_ergo_tip_id,
          observed_ergo_parent_id, observed_ergo_extension_root
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          dup_nft_id = excluded.dup_nft_id,
          dup_ergo_tree = excluded.dup_ergo_tree,
          genesis_box_id = excluded.genesis_box_id,
          tip_box_id = excluded.tip_box_id,
          tip_digest = excluded.tip_digest,
          observation_digest = excluded.observation_digest,
          observed_ergo_tip = excluded.observed_ergo_tip,
          observed_ergo_tip_id = excluded.observed_ergo_tip_id,
          observed_ergo_parent_id = excluded.observed_ergo_parent_id,
          observed_ergo_extension_root = excluded.observed_ergo_extension_root,
          updated_at = datetime('now')
      `).run(
        duplicatePreventionNftIdHex,
        duplicatePreventionErgoTreeHex,
        genesisBoxId,
        tipBoxId,
        tipDigest,
        observationDigest,
        observedErgoTip,
        observedErgoTipId,
        observedErgoParentId,
        observedErgoExtensionRoot,
      );
      if (unchanged) {
        return {
          changed: false,
          previousEntries: previous.length,
          currentEntries: entries.length,
          invalidatedCandidates: 0,
        };
      }
      const reason = normalizeReason(
        `authenticated DUP lineage changed at Ergo tip ${reconstruction.observedTip.idHex}`,
        'candidate invalidation reason',
      );
      const invalidated = this.db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET status = 'invalidated',
            invalidation_reason = ?,
            updated_at = datetime('now')
        WHERE status IN ('prepared', 'check_passed')
          AND (dup_input_box_id <> ? OR dup_input_digest <> ?)
      `).run(reason, tipBoxId, tipDigest);
      return {
        changed: true,
        previousEntries: previous.length,
        currentEntries: entries.length,
        invalidatedCandidates: invalidated.changes,
      };
    });
    return run.immediate();
  }

  getAuthenticatedV2VaultReconstructionState(): AuthenticatedV2VaultReconstructionCacheState | null {
    const row = this.db.prepare(`
      SELECT vault_address, vault_ergo_tree, dup_observation_digest, dup_tip_box_id,
             observation_digest, observed_ergo_tip, observed_ergo_tip_id,
             observed_ergo_parent_id, observed_ergo_extension_root
      FROM authenticated_vault_reconstruction_state
      WHERE id = 1
    `).get() as {
      vault_address: string;
      vault_ergo_tree: string;
      dup_observation_digest: string;
      dup_tip_box_id: string;
      observation_digest: string;
      observed_ergo_tip: number;
      observed_ergo_tip_id: string;
      observed_ergo_parent_id: string;
      observed_ergo_extension_root: string;
    } | undefined;
    if (!row) return null;
    return {
      vaultAddress: normalizeVaultAddress(row.vault_address, 'persisted vault address'),
      vaultErgoTreeHex: normalizeHex(row.vault_ergo_tree, 'persisted vault ErgoTree'),
      duplicatePreventionObservationDigestHex: normalizeFixedHex(
        row.dup_observation_digest,
        32,
        'persisted vault DUP observation digest',
      ),
      duplicatePreventionTipBoxIdHex: normalizeFixedHex(
        row.dup_tip_box_id,
        32,
        'persisted vault DUP tip box ID',
      ),
      observationDigestHex: normalizeFixedHex(
        row.observation_digest,
        32,
        'persisted vault observation digest',
      ),
      observedErgoTip: normalizeNonnegativeSignedInt(
        row.observed_ergo_tip,
        'persisted vault observed Ergo tip',
      ),
      observedErgoTipIdHex: normalizeFixedHex(
        row.observed_ergo_tip_id,
        32,
        'persisted vault observed Ergo tip ID',
      ),
      observedErgoParentIdHex: normalizeFixedHex(
        row.observed_ergo_parent_id,
        32,
        'persisted vault observed Ergo parent ID',
      ),
      observedErgoExtensionRootHex: normalizeFixedHex(
        row.observed_ergo_extension_root,
        32,
        'persisted vault observed Ergo extension root',
      ),
    };
  }

  getAuthenticatedV2VaultHistory(): AuthenticatedV2SettlementVaultBox[] {
    const rows = this.db.prepare(`
      SELECT box_id, transaction_id, output_index, creation_height, value_nanoerg,
             ergo_tree, r4, r5, r6, r7, deposit_id, target_evm_address,
             original_amount_nanoerg, provenance_hex, spent_transaction_id,
             sigma_serialized_hex, sigma_serialized_sha256, current_unspent
      FROM authenticated_vault_history
      ORDER BY box_id ASC
    `).all() as Array<Record<string, any>>;
    return rows.map((row, index) => persistedAuthenticatedV2VaultBox(row, index));
  }

  getAuthenticatedV2CurrentVaultBoxIds(): string[] {
    const rows = this.db.prepare(`
      SELECT box_id
      FROM authenticated_vault_history
      WHERE current_unspent = 1
      ORDER BY box_id ASC
    `).all() as Array<{ box_id: string }>;
    return rows.map((row, index) => normalizeFixedHex(
      row.box_id,
      32,
      `persisted current vault box ${index}`,
    ));
  }

  replaceAuthenticatedV2RecoveryCaches(
    input: AuthenticatedV2RecoveryCacheReplacementInput,
  ): AuthenticatedV2RecoveryCacheReplacementResult {
    assertAuthenticatedSpvTrackerReconstructionProvenance(input.trackerReconstruction);
    assertAuthenticatedV2DupReconstructionProvenance(input.duplicatePreventionReconstruction);
    assertAuthenticatedV2VaultReconstructionProvenance(input.vaultReconstruction);
    this.assertWritable('replace authenticated V2 recovery caches');
    assertSameAuthenticatedV2RecoverySnapshot(
      input.trackerReconstruction.observedTip,
      input.duplicatePreventionReconstruction.observedTip,
      'tracker and DUP reconstructions',
    );
    assertSameAuthenticatedV2RecoverySnapshot(
      input.duplicatePreventionReconstruction.observedTip,
      input.vaultReconstruction.stableSnapshot.bestHeader,
      'DUP and vault reconstructions',
    );
    if (
      input.vaultReconstruction.stableSnapshot.indexedHeight
        !== input.duplicatePreventionReconstruction.indexedHeight
      || input.vaultReconstruction.stableSnapshot.fullHeight
        !== input.duplicatePreventionReconstruction.fullHeight
    ) {
      throw new Error('DUP and vault reconstruction index snapshots differ');
    }
    if (
      normalizeFixedHex(
        input.vaultReconstruction.duplicatePreventionObservationDigestHex,
        32,
        'vault DUP observation digest',
      ) !== normalizeFixedHex(
        input.duplicatePreventionReconstruction.observationDigestHex,
        32,
        'DUP observation digest',
      )
      || normalizeFixedHex(
        input.vaultReconstruction.duplicatePreventionTipBoxIdHex,
        32,
        'vault DUP tip box ID',
      ) !== normalizeFixedHex(
        input.duplicatePreventionReconstruction.tipBoxIdHex,
        32,
        'DUP tip box ID',
      )
    ) {
      throw new Error('vault reconstruction does not bind the recovered DUP identity');
    }

    const replace = this.db.transaction((): AuthenticatedV2RecoveryCacheReplacementResult => {
      const activeCandidatesBefore = this.getActiveAuthenticatedSettlementCandidates();
      const activeCandidateStateBefore = new Map(activeCandidatesBefore.map(candidate => [
        candidate.candidateId,
        canonicalAuthorityState(candidate),
      ]));
      const recoverableAttemptsBefore = this.getRecoverableAggregateSettlementAttempts();
      const recoverableAttemptStateBefore = new Map(recoverableAttemptsBefore.map(attempt => [
        attempt.expectedTxId,
        canonicalAuthorityState(attempt),
      ]));
      const tracker = this.replaceAuthenticatedSpvTrackerHistory(input.trackerReconstruction);
      const duplicatePrevention = this.replaceAuthenticatedV2DupHistory(
        input.duplicatePreventionReconstruction,
        input.duplicatePreventionIdentity,
      );
      const vault = this.replaceAuthenticatedV2VaultForest(
        input.vaultReconstruction,
        input.vaultIdentity,
      );
      const activeCandidatesAfter = this.getActiveAuthenticatedSettlementCandidates();
      const recoverableAttemptsAfter = this.getRecoverableAggregateSettlementAttempts();
      if (activeCandidatesAfter.some(candidate => (
        activeCandidateStateBefore.get(candidate.candidateId) !== canonicalAuthorityState(candidate)
      ))) {
        throw new Error('authenticated cache recovery created or changed settlement candidate authority');
      }
      if (recoverableAttemptsAfter.some(attempt => (
        recoverableAttemptStateBefore.get(attempt.expectedTxId) !== canonicalAuthorityState(attempt)
      ))) {
        throw new Error('authenticated cache recovery created or changed settlement attempt authority');
      }
      return {
        tracker,
        duplicatePrevention,
        vault,
        activeCandidatesBefore: activeCandidatesBefore.length,
        activeCandidatesAfter: activeCandidatesAfter.length,
        recoverableAttemptsBefore: recoverableAttemptsBefore.length,
        recoverableAttemptsAfter: recoverableAttemptsAfter.length,
      };
    });
    return replace.immediate();
  }

  replaceAuthenticatedV2VaultForest(
    reconstruction: AuthenticatedV2VaultReconstruction,
    expectedIdentity: AuthenticatedV2VaultCacheIdentity,
  ): AuthenticatedV2VaultHistoryReplacementResult {
    assertAuthenticatedV2VaultReconstructionProvenance(reconstruction);
    this.assertWritable('replace authenticated V2 vault forest');
    const vaultAddress = normalizeVaultAddress(
      expectedIdentity.vaultAddress,
      'configured vault address',
    );
    const vaultErgoTreeHex = normalizeHex(
      expectedIdentity.vaultErgoTreeHex,
      'configured vault ErgoTree',
    );
    if (
      normalizeVaultAddress(reconstruction.vaultAddress, 'reconstructed vault address')
        !== vaultAddress
      || normalizeHex(reconstruction.vaultErgoTreeHex, 'reconstructed vault ErgoTree')
        !== vaultErgoTreeHex
    ) {
      throw new Error('reconstructed vault identity does not match the configured cache identity');
    }
    const currentIds = reconstruction.currentUnspentBoxIdsHex.map((value, index) =>
      normalizeFixedHex(value, 32, `reconstructed current vault box ${index}`));
    if (new Set(currentIds).size !== currentIds.length) {
      throw new Error('reconstructed current vault box IDs must be unique');
    }
    const currentIdSet = new Set(currentIds);
    const boxes = reconstruction.boxes.map((box, index) => {
      const boxId = normalizeFixedHex(box.boxIdHex, 32, `reconstructed vault box ${index} ID`);
      return normalizeVaultCacheBox(
        box,
        index,
        vaultErgoTreeHex,
        currentIdSet.has(boxId),
      );
    }).sort((left, right) => left.box_id.localeCompare(right.box_id));
    if (new Set(boxes.map(box => box.box_id)).size !== boxes.length) {
      throw new Error('reconstructed vault history box IDs must be unique');
    }
    const boxIds = new Set(boxes.map(box => box.box_id));
    for (const currentId of currentIds) {
      if (!boxIds.has(currentId)) {
        throw new Error(`reconstructed current vault ${currentId} is absent from history`);
      }
    }
    const transitions = reconstruction.transitions.map((transition, index) => ({
      burn_id: normalizeFixedHex(transition.burnIdHex, 32, `vault transition ${index} burn ID`),
      spending_transaction_id: normalizeFixedHex(
        transition.spendingTransactionIdHex,
        32,
        `vault transition ${index} transaction ID`,
      ),
      input_box_id: normalizeFixedHex(
        transition.inputBoxIdHex,
        32,
        `vault transition ${index} input box ID`,
      ),
      successor_box_id: transition.successorBoxIdHex === null
        ? null
        : normalizeFixedHex(
          transition.successorBoxIdHex,
          32,
          `vault transition ${index} successor box ID`,
        ),
      payout_box_id: normalizeFixedHex(
        transition.payoutBoxIdHex,
        32,
        `vault transition ${index} payout box ID`,
      ),
      payout_value_nanoerg: normalizePositiveLongText(
        transition.payoutValueNanoErg,
        `vault transition ${index} payout`,
      ),
      miner_fee_nanoerg: normalizePositiveLongText(
        transition.minerFeeNanoErg,
        `vault transition ${index} miner fee`,
      ),
    }));
    for (const transition of transitions) {
      if (!boxIds.has(transition.input_box_id)) {
        throw new Error(`vault transition input ${transition.input_box_id} is absent from history`);
      }
      if (transition.successor_box_id !== null && !boxIds.has(transition.successor_box_id)) {
        throw new Error(
          `vault transition successor ${transition.successor_box_id} is absent from history`,
        );
      }
    }
    const transitionByInput = new Map(transitions.map(entry => [entry.input_box_id, entry]));
    for (const box of boxes) {
      const transition = transitionByInput.get(String(box.box_id));
      if (box.spent_transaction_id === null) {
        if (transition !== undefined) {
          throw new Error(`unspent vault ${box.box_id} cannot have a settlement transition`);
        }
      } else if (
        transition === undefined
        || transition.spending_transaction_id !== box.spent_transaction_id
      ) {
        throw new Error(`spent vault ${box.box_id} is not bound to its settlement transition`);
      }
    }
    for (const [field, values] of [
      ['burn IDs', transitions.map(entry => entry.burn_id)],
      ['transaction IDs', transitions.map(entry => entry.spending_transaction_id)],
      ['input box IDs', transitions.map(entry => entry.input_box_id)],
      ['successor box IDs', transitions
        .map(entry => entry.successor_box_id)
        .filter((value): value is string => value !== null)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        throw new Error(`reconstructed vault transition ${field} must be unique`);
      }
    }
    const duplicatePreventionObservationDigestHex = normalizeFixedHex(
      reconstruction.duplicatePreventionObservationDigestHex,
      32,
      'reconstructed vault DUP observation digest',
    );
    const duplicatePreventionTipBoxIdHex = normalizeFixedHex(
      reconstruction.duplicatePreventionTipBoxIdHex,
      32,
      'reconstructed vault DUP tip box ID',
    );
    const observationDigestHex = normalizeFixedHex(
      reconstruction.observationDigestHex,
      32,
      'reconstructed vault observation digest',
    );
    const observedErgoTip = normalizeNonnegativeSignedInt(
      reconstruction.stableSnapshot.bestHeader.height,
      'reconstructed vault observed Ergo tip',
    );
    const observedErgoTipIdHex = normalizeFixedHex(
      reconstruction.stableSnapshot.bestHeader.idHex,
      32,
      'reconstructed vault observed Ergo tip ID',
    );
    const observedErgoParentIdHex = normalizeFixedHex(
      reconstruction.stableSnapshot.bestHeader.parentIdHex,
      32,
      'reconstructed vault observed Ergo parent ID',
    );
    const observedErgoExtensionRootHex = normalizeFixedHex(
      reconstruction.stableSnapshot.bestHeader.extensionRootHex,
      32,
      'reconstructed vault observed Ergo extension root',
    );

    const run = this.db.transaction((): AuthenticatedV2VaultHistoryReplacementResult => {
      const previousState = this.getAuthenticatedV2VaultReconstructionState();
      if (
        previousState !== null
        && (
          previousState.vaultAddress !== vaultAddress
          || previousState.vaultErgoTreeHex !== vaultErgoTreeHex
        )
      ) {
        throw new Error('configured vault cache identity conflicts with persisted state');
      }
      const previousBoxes = this.db.prepare(`
        SELECT box_id, transaction_id, output_index, creation_height, value_nanoerg,
               ergo_tree, r4, r5, r6, r7, deposit_id, target_evm_address,
               original_amount_nanoerg, provenance_hex, spent_transaction_id,
               sigma_serialized_hex, sigma_serialized_sha256, current_unspent
        FROM authenticated_vault_history
        ORDER BY box_id ASC
      `).all() as Array<Record<string, any>>;
      const previousTransitions = this.db.prepare(`
        SELECT burn_id, spending_transaction_id, input_box_id, successor_box_id,
               payout_box_id, payout_value_nanoerg, miner_fee_nanoerg
        FROM authenticated_vault_transitions
        ORDER BY id ASC
      `).all() as Array<Record<string, any>>;
      const previousUnspentBoxes = previousBoxes.filter(row => row.current_unspent === 1).length;
      const changed = JSON.stringify(previousBoxes) !== JSON.stringify(boxes)
        || JSON.stringify(previousTransitions) !== JSON.stringify(transitions);
      if (changed) {
        this.db.prepare('DELETE FROM authenticated_vault_transitions').run();
        this.db.prepare('DELETE FROM authenticated_vault_history').run();
        const insertBox = this.db.prepare(`
          INSERT INTO authenticated_vault_history (
            box_id, transaction_id, output_index, creation_height, value_nanoerg,
            ergo_tree, r4, r5, r6, r7, deposit_id, target_evm_address,
            original_amount_nanoerg, provenance_hex, spent_transaction_id,
            sigma_serialized_hex, sigma_serialized_sha256, current_unspent
          ) VALUES (
            @box_id, @transaction_id, @output_index, @creation_height, @value_nanoerg,
            @ergo_tree, @r4, @r5, @r6, @r7, @deposit_id, @target_evm_address,
            @original_amount_nanoerg, @provenance_hex, @spent_transaction_id,
            @sigma_serialized_hex, @sigma_serialized_sha256, @current_unspent
          )
        `);
        for (const box of boxes) insertBox.run(box);
        const insertTransition = this.db.prepare(`
          INSERT INTO authenticated_vault_transitions (
            burn_id, spending_transaction_id, input_box_id, successor_box_id,
            payout_box_id, payout_value_nanoerg, miner_fee_nanoerg
          ) VALUES (
            @burn_id, @spending_transaction_id, @input_box_id, @successor_box_id,
            @payout_box_id, @payout_value_nanoerg, @miner_fee_nanoerg
          )
        `);
        for (const transition of transitions) insertTransition.run(transition);
      }
      this.db.prepare(`
        INSERT INTO authenticated_vault_reconstruction_state (
          id, vault_address, vault_ergo_tree, dup_observation_digest, dup_tip_box_id,
          observation_digest, observed_ergo_tip, observed_ergo_tip_id,
          observed_ergo_parent_id, observed_ergo_extension_root
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          vault_address = excluded.vault_address,
          vault_ergo_tree = excluded.vault_ergo_tree,
          dup_observation_digest = excluded.dup_observation_digest,
          dup_tip_box_id = excluded.dup_tip_box_id,
          observation_digest = excluded.observation_digest,
          observed_ergo_tip = excluded.observed_ergo_tip,
          observed_ergo_tip_id = excluded.observed_ergo_tip_id,
          observed_ergo_parent_id = excluded.observed_ergo_parent_id,
          observed_ergo_extension_root = excluded.observed_ergo_extension_root,
          updated_at = datetime('now')
      `).run(
        vaultAddress,
        vaultErgoTreeHex,
        duplicatePreventionObservationDigestHex,
        duplicatePreventionTipBoxIdHex,
        observationDigestHex,
        observedErgoTip,
        observedErgoTipIdHex,
        observedErgoParentIdHex,
        observedErgoExtensionRootHex,
      );
      if (!changed) {
        return {
          changed: false,
          previousBoxes: previousBoxes.length,
          currentBoxes: boxes.length,
          previousUnspentBoxes,
          currentUnspentBoxes: currentIds.length,
          invalidatedCandidates: 0,
        };
      }
      const reason = normalizeReason(
        `authenticated vault forest changed at Ergo tip ${observedErgoTipIdHex}`,
        'candidate invalidation reason',
      );
      const invalidated = this.db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET status = 'invalidated',
            invalidation_reason = ?,
            updated_at = datetime('now')
        WHERE status IN ('prepared', 'check_passed')
          AND NOT EXISTS (
            SELECT 1
            FROM authenticated_vault_history AS vault
            WHERE vault.box_id = authenticated_settlement_candidates.vault_box_id
              AND vault.current_unspent = 1
          )
      `).run(reason);
      return {
        changed: true,
        previousBoxes: previousBoxes.length,
        currentBoxes: boxes.length,
        previousUnspentBoxes,
        currentUnspentBoxes: currentIds.length,
        invalidatedCandidates: invalidated.changes,
      };
    });
    return run();
  }

  // Authenticated SPV Tracker History (V2, key=32B, value=264B)

  getAuthenticatedSpvTrackerReconstructionState(
    sidechainIdHex: string,
  ): AuthenticatedSpvTrackerReconstructionCacheState | null {
    const sidechainId = normalizeFixedHex(sidechainIdHex, 32, 'sidechainId');
    const row = this.db.prepare(`
      SELECT sidechain_id, tracker_nft_id, genesis_box_id,
             finality_attestor_sigma_prop, tip_box_id, tip_digest,
             observation_digest, observed_ergo_tip, observed_ergo_tip_id,
             observed_ergo_parent_id, observed_ergo_extension_root
      FROM authenticated_spv_tracker_reconstruction_state
      WHERE sidechain_id = ?
    `).get(sidechainId) as {
      sidechain_id: string;
      tracker_nft_id: string;
      genesis_box_id: string;
      finality_attestor_sigma_prop: string;
      tip_box_id: string;
      tip_digest: string;
      observation_digest: string;
      observed_ergo_tip: number;
      observed_ergo_tip_id: string;
      observed_ergo_parent_id: string;
      observed_ergo_extension_root: string;
    } | undefined;
    if (!row) return null;
    return {
      sidechainIdHex: normalizeFixedHex(
        row.sidechain_id,
        32,
        'persisted tracker sidechain ID',
      ),
      trackerNftIdHex: normalizeFixedHex(
        row.tracker_nft_id,
        32,
        'persisted tracker NFT ID',
      ),
      genesisBoxId: normalizeFixedHex(
        row.genesis_box_id,
        32,
        'persisted tracker genesis box ID',
      ),
      finalityAttestorSigmaPropRegisterHex: normalizeHex(
        row.finality_attestor_sigma_prop,
        'persisted tracker finality attestor SigmaProp',
      ),
      tipBoxId: normalizeFixedHex(row.tip_box_id, 32, 'persisted tracker tip box ID'),
      tipDigest: normalizeFixedHex(row.tip_digest, 33, 'persisted tracker tip digest'),
      observationDigest: normalizeFixedHex(
        row.observation_digest,
        32,
        'persisted tracker observation digest',
      ),
      observedErgoTip: normalizeNonnegativeSignedInt(
        row.observed_ergo_tip,
        'persisted tracker observed Ergo tip',
      ),
      observedErgoTipId: normalizeFixedHex(
        row.observed_ergo_tip_id,
        32,
        'persisted tracker observed Ergo tip ID',
      ),
      observedErgoParentId: normalizeFixedHex(
        row.observed_ergo_parent_id,
        32,
        'persisted tracker observed Ergo parent ID',
      ),
      observedErgoExtensionRoot: normalizeFixedHex(
        row.observed_ergo_extension_root,
        32,
        'persisted tracker observed Ergo extension root',
      ),
    };
  }

  replaceAuthenticatedSpvTrackerHistory(
    reconstruction: AuthenticatedSpvTrackerReconstruction,
  ): AuthenticatedSpvTrackerHistoryReplacementResult {
    assertAuthenticatedSpvTrackerReconstructionProvenance(reconstruction);
    this.assertWritable('replace authenticated SPV tracker history');
    const sidechainId = normalizeFixedHex(
      reconstruction.sidechainIdHex,
      32,
      'reconstructed sidechainId',
    );
    const trackerNftId = normalizeFixedHex(
      reconstruction.trackerNftIdHex,
      32,
      'reconstructed tracker NFT ID',
    );
    const genesisBoxId = normalizeFixedHex(
      reconstruction.genesisBoxId,
      32,
      'reconstructed tracker genesis box ID',
    );
    const finalityAttestorSigmaProp = normalizeHex(
      reconstruction.finalityAttestorSigmaPropRegisterHex,
      'reconstructed tracker finality attestor SigmaProp',
    );
    const tipBoxId = normalizeFixedHex(
      reconstruction.tipBoxId,
      32,
      'reconstructed tracker tip box ID',
    );
    const tipDigest = normalizeFixedHex(
      reconstruction.tipDigestHex,
      33,
      'reconstructed tracker tip digest',
    );
    const observationDigest = normalizeFixedHex(
      reconstruction.observationDigestHex,
      32,
      'reconstructed tracker observation digest',
    );
    const observedErgoTip = normalizeNonnegativeSignedInt(
      reconstruction.observedTip.height,
      'reconstructed tracker observed Ergo tip',
    );
    const observedErgoTipId = normalizeFixedHex(
      reconstruction.observedTip.idHex,
      32,
      'reconstructed tracker observed Ergo tip ID',
    );
    const observedErgoParentId = normalizeFixedHex(
      reconstruction.observedTip.parentIdHex,
      32,
      'reconstructed tracker observed Ergo parent ID',
    );
    const observedErgoExtensionRoot = normalizeFixedHex(
      reconstruction.observedTip.extensionRootHex,
      32,
      'reconstructed tracker observed Ergo extension root',
    );
    const entries = reconstruction.entries.map(entry => {
      if (entry.sidechainId !== sidechainId) {
        throw new Error('reconstructed authenticated tracker entry crosses sidechain partitions');
      }
      return normalizeAuthenticatedSpvTrackerEntry({ ...entry });
    });
    const run = this.db.transaction((): AuthenticatedSpvTrackerHistoryReplacementResult => {
      const previous = this.db.prepare(`
        SELECT
          key_hex,
          value_hex,
          sidechain_id,
          sidechain_height,
          execution_block_hash,
          bridge_event_root,
          checkpoint_commitment,
          anchor_header_id,
          anchor_header_height
        FROM authenticated_spv_tracker_history
        WHERE sidechain_id = ?
        ORDER BY id ASC
      `).all(sidechainId) as Array<{
        key_hex: string;
        value_hex: string;
        sidechain_id: string;
        sidechain_height: string;
        execution_block_hash: string;
        bridge_event_root: string;
        checkpoint_commitment: string;
        anchor_header_id: string;
        anchor_header_height: number;
      }>;
      const previousState = this.getAuthenticatedSpvTrackerReconstructionState(sidechainId);
      if (
        previousState !== null
        && (
          previousState.trackerNftIdHex !== trackerNftId
          || previousState.genesisBoxId !== genesisBoxId
          || previousState.finalityAttestorSigmaPropRegisterHex !== finalityAttestorSigmaProp
        )
      ) {
        throw new Error('reconstructed tracker identity conflicts with the persisted singleton');
      }
      const unchanged = previousState !== null
        && previousState.trackerNftIdHex === trackerNftId
        && previousState.genesisBoxId === genesisBoxId
        && previousState.finalityAttestorSigmaPropRegisterHex === finalityAttestorSigmaProp
        && previousState.tipBoxId === tipBoxId
        && previousState.tipDigest === tipDigest
        && previous.length === entries.length && entries.every((entry, index) => {
        const row = previous[index];
        return row.key_hex === entry.keyHex
          && row.value_hex === entry.valueHex
          && row.sidechain_id === entry.sidechainId
          && row.sidechain_height === entry.sidechainHeight.toString()
          && row.execution_block_hash === entry.executionBlockHash
          && row.bridge_event_root === entry.bridgeEventRoot
          && row.checkpoint_commitment === entry.checkpointCommitment
          && row.anchor_header_id === entry.anchorHeaderId
          && row.anchor_header_height === entry.anchorHeaderHeight;
      });
      if (!unchanged) {
        this.db.prepare(`
          DELETE FROM authenticated_spv_tracker_history WHERE sidechain_id = ?
        `).run(sidechainId);
        const insert = this.db.prepare(`
          INSERT INTO authenticated_spv_tracker_history (
            key_hex,
            value_hex,
            sidechain_id,
            sidechain_height,
            execution_block_hash,
            bridge_event_root,
            checkpoint_commitment,
            anchor_header_id,
            anchor_header_height
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const entry of entries) {
          insert.run(
            entry.keyHex,
            entry.valueHex,
            entry.sidechainId,
            entry.sidechainHeight.toString(),
            entry.executionBlockHash,
            entry.bridgeEventRoot,
            entry.checkpointCommitment,
            entry.anchorHeaderId,
            entry.anchorHeaderHeight,
          );
        }
      }
      this.db.prepare(`
        INSERT INTO authenticated_spv_tracker_reconstruction_state (
          sidechain_id, tracker_nft_id, genesis_box_id, finality_attestor_sigma_prop,
          tip_box_id, tip_digest, observation_digest, observed_ergo_tip,
          observed_ergo_tip_id, observed_ergo_parent_id, observed_ergo_extension_root
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sidechain_id) DO UPDATE SET
          tracker_nft_id = excluded.tracker_nft_id,
          genesis_box_id = excluded.genesis_box_id,
          finality_attestor_sigma_prop = excluded.finality_attestor_sigma_prop,
          tip_box_id = excluded.tip_box_id,
          tip_digest = excluded.tip_digest,
          observation_digest = excluded.observation_digest,
          observed_ergo_tip = excluded.observed_ergo_tip,
          observed_ergo_tip_id = excluded.observed_ergo_tip_id,
          observed_ergo_parent_id = excluded.observed_ergo_parent_id,
          observed_ergo_extension_root = excluded.observed_ergo_extension_root,
          updated_at = datetime('now')
      `).run(
        sidechainId,
        trackerNftId,
        genesisBoxId,
        finalityAttestorSigmaProp,
        tipBoxId,
        tipDigest,
        observationDigest,
        observedErgoTip,
        observedErgoTipId,
        observedErgoParentId,
        observedErgoExtensionRoot,
      );
      if (unchanged) {
        return {
          changed: false,
          previousEntries: previous.length,
          currentEntries: entries.length,
          invalidatedCandidates: 0,
        };
      }
      const reason = normalizeReason(
        `authenticated tracker lineage changed at Ergo tip ${reconstruction.observedTip.idHex}`,
        'candidate invalidation reason',
      );
      const invalidated = this.db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET status = 'invalidated',
            invalidation_reason = ?,
            updated_at = datetime('now')
        WHERE sidechain_id = ? AND status IN ('prepared', 'check_passed')
      `).run(reason, sidechainId);
      return {
        changed: true,
        previousEntries: previous.length,
        currentEntries: entries.length,
        invalidatedCandidates: invalidated.changes,
      };
    });
    return run();
  }

  insertAuthenticatedSpvTrackerEntry(entry: AuthenticatedSpvTrackerHistoryEntry): void {
    this.assertWritable('insert authenticated SPV tracker entry');
    const normalized = normalizeAuthenticatedSpvTrackerEntry(entry);
    const sidechainHeight = normalized.sidechainHeight.toString();
    const insert = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT
          key_hex,
          value_hex,
          sidechain_id,
          sidechain_height,
          execution_block_hash,
          bridge_event_root,
          checkpoint_commitment,
          anchor_header_id,
          anchor_header_height
        FROM authenticated_spv_tracker_history
        WHERE key_hex = ? OR (sidechain_id = ? AND sidechain_height = ?)
        ORDER BY id ASC
      `).all(normalized.keyHex, normalized.sidechainId, sidechainHeight) as {
        key_hex: string;
        value_hex: string;
        sidechain_id: string;
        sidechain_height: string;
        execution_block_hash: string;
        bridge_event_root: string;
        checkpoint_commitment: string;
        anchor_header_id: string;
        anchor_header_height: number;
      }[];

      const isIdentical = rows.length === 1
        && rows[0].key_hex === normalized.keyHex
        && rows[0].value_hex === normalized.valueHex
        && rows[0].sidechain_id === normalized.sidechainId
        && rows[0].sidechain_height === sidechainHeight
        && rows[0].execution_block_hash === normalized.executionBlockHash
        && rows[0].bridge_event_root === normalized.bridgeEventRoot
        && rows[0].checkpoint_commitment === normalized.checkpointCommitment
        && rows[0].anchor_header_id === normalized.anchorHeaderId
        && rows[0].anchor_header_height === normalized.anchorHeaderHeight;
      if (isIdentical) return;
      if (rows.length > 0) {
        throw new Error(
          `conflicting authenticated SPV tracker entry for key ${normalized.keyHex} or sidechain height ${sidechainHeight}`,
        );
      }

      this.db.prepare(`
        INSERT INTO authenticated_spv_tracker_history (
          key_hex,
          value_hex,
          sidechain_id,
          sidechain_height,
          execution_block_hash,
          bridge_event_root,
          checkpoint_commitment,
          anchor_header_id,
          anchor_header_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalized.keyHex,
        normalized.valueHex,
        normalized.sidechainId,
        sidechainHeight,
        normalized.executionBlockHash,
        normalized.bridgeEventRoot,
        normalized.checkpointCommitment,
        normalized.anchorHeaderId,
        normalized.anchorHeaderHeight,
      );
    });
    insert();
  }

  getAuthenticatedSpvTrackerHistory(sidechainIdHex: string): { key: string; value: string }[] {
    const sidechainId = normalizeFixedHex(sidechainIdHex, 32, 'sidechainId');
    const rows = this.db.prepare(`
      SELECT key_hex, value_hex
      FROM authenticated_spv_tracker_history
      WHERE sidechain_id = ?
      ORDER BY id ASC
    `).all(sidechainId) as { key_hex: string; value_hex: string }[];
    return rows.map(row => ({
      key: normalizeFixedHex(row.key_hex, 32, 'persisted authenticated tracker key'),
      value: normalizeFixedHex(
        row.value_hex,
        AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
        'persisted authenticated tracker value',
      ),
    }));
  }

  getAuthenticatedSpvTrackerIdentityByHeight(
    sidechainHeight: number | bigint,
    sidechainIdHex: string,
  ): AuthenticatedSpvTrackerPersistedIdentity | null {
    const normalizedHeight = normalizePositiveSignedLong(sidechainHeight, 'sidechainHeight');
    const normalizedSidechainId = normalizeFixedHex(sidechainIdHex, 32, 'sidechainId');
    const rows = this.db.prepare(`
      SELECT sidechain_height, execution_block_hash
      FROM authenticated_spv_tracker_history
      WHERE sidechain_id = ? AND sidechain_height = ?
      ORDER BY id ASC
    `).all(normalizedSidechainId, normalizedHeight.toString()) as {
      sidechain_height: string;
      execution_block_hash: string;
    }[];

    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(`multiple authenticated SPV tracker entries for sidechain height ${normalizedHeight}`);
    }
    return {
      sidechainIdHex: normalizedSidechainId,
      sidechainHeight: BigInt(rows[0].sidechain_height),
      executionBlockHashHex: normalizeFixedHex(
        rows[0].execution_block_hash,
        32,
        'persisted executionBlockHash',
      ),
    };
  }

  // --- Sync State ---------------------------------------------

  getSyncState(): { latestErgoHeight: number; latestSidechainHeight: number; stateBoxId: string | null; preventionBoxId: string | null } {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as any;
    return {
      latestErgoHeight: row.latest_ergo_height,
      latestSidechainHeight: row.latest_sidechain_height,
      stateBoxId: row.state_box_id,
      preventionBoxId: row.prevention_box_id,
    };
  }

  updateSyncState(updates: { ergoHeight?: number; sidechainHeight?: number; stateBoxId?: string; preventionBoxId?: string }): void {
    this.assertWritable('update sync state');
    const fields: string[] = ['updated_at = datetime(\'now\')'];
    const values: any[] = [];

    if (updates.ergoHeight !== undefined) { fields.push('latest_ergo_height = ?'); values.push(updates.ergoHeight); }
    if (updates.sidechainHeight !== undefined) { fields.push('latest_sidechain_height = ?'); values.push(updates.sidechainHeight); }
    if (updates.stateBoxId !== undefined) { fields.push('state_box_id = ?'); values.push(updates.stateBoxId); }
    if (updates.preventionBoxId !== undefined) { fields.push('prevention_box_id = ?'); values.push(updates.preventionBoxId); }

    this.db.prepare(`UPDATE sync_state SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  }

  // --- Anchor Height Persistence --------------------------------

  /**
   * Get the persisted ergo_anchor_height for a peg-out.
   * Returns null if not yet resolved or if the peg-out does not exist.
   */
  getPersistedAnchorHeight(lookup: PegOutEventLookup): number | null {
    const row = this.resolvePegOutRow(lookup, 'get persisted anchor height', false) as
      | { ergo_anchor_height: number | null }
      | undefined;
    return row?.ergo_anchor_height ?? null;
  }

  /**
   * Persist the chosen ergo_anchor_height for a peg-out.
   * Once set, all subsequent retries reuse this exact height.
   */
  setPersistedAnchorHeight(lookup: PegOutEventLookup, anchorHeight: number): void {
    this.assertWritable('persist anchor height');
    const pegOut = this.requirePegOut(lookup, 'persist anchor height');
    this.db.prepare(`
      UPDATE peg_out_events
      SET ergo_anchor_height = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(anchorHeight, pegOut.id);
  }

  /**
   * Clear a persisted anchor height (e.g. after a reorg invalidates the
   * anchored block). The next cycle will re-resolve via forward scan.
   */
  clearPersistedAnchorHeight(lookup: PegOutEventLookup): void {
    this.assertWritable('clear persisted anchor height');
    const pegOut = this.requirePegOut(lookup, 'clear persisted anchor height');
    this.db.prepare(`
      UPDATE peg_out_events
      SET ergo_anchor_height = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(pegOut.id);
  }

  // --- Reorg Recovery & Reconciliation (Composite Defense) -------

  /**
   * 🚨 CHAIN β DEFENSE: Reset a peg-out to 'detected' with FULL field clearing.
   * Bypasses the COALESCE trap (Finding #57 / Chain β) by explicitly NULLing
   * all Phase 1 artifacts. Used when a reorg invalidates a confirmed Phase 1 TX.
   */
  resetPegOutToDetected(lookup: PegOutEventLookup): void {
    this.assertWritable('reset peg-out to detected');
    const pegOut = this.requirePegOut(lookup, 'reset peg-out to detected');
    if (pegOut.status === 'failed') {
      throw new Error(
        `Cannot reset ${LEGACY_FAILED_PEG_OUT_CLASS_V1} without external settlement reconstruction`,
      );
    }
    const result = this.db.prepare(`
      UPDATE peg_out_events
      SET status = 'detected',
          phase1_box_id = NULL,
          phase2_unlock_tx_id = NULL,
          avl_proof_hex = NULL,
          pending_avl_key = NULL,
          ergo_anchor_height = NULL,
          updated_at = datetime('now')
      WHERE id = ? AND status != 'burn_reverted'
    `).run(pegOut.id);
    if (result.changes !== 1) {
      throw new Error('Cannot reset terminal burn_reverted peg-out to detected');
    }
  }

  /**
   * 🚨 CHAIN β DEFENSE: Remove a phantom AVL key from local history.
   * Used when a reorg invalidates a Phase 1 TX whose AVL key was
   * already committed to local SQLite but never confirmed on-chain.
   */
  removeAvlKey(keyHex: string): void {
    this.assertWritable('remove AVL key');
    this.db.prepare(`
      DELETE FROM avl_tree_history WHERE key_hex = ?
    `).run(keyHex);
  }

  /**
   * 🚨 CHAIN θ DEFENSE: Get peg-ins by status for reconciliation.
   * Used to verify that 'minted' peg-ins are actually confirmed on the EVM.
   */
  getPegInsByStatus(status: PegInStatus): PegInEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM peg_in_events WHERE status = ?
      ORDER BY ergo_lock_height ASC
    `).all(status);
    return rows.map(mapPegInEventRow);
  }

  getPegInsRequiringPostSubmissionReconciliation(): PegInEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM peg_in_events
      WHERE status IN ('minting', 'minted')
      ORDER BY id ASC
    `).all();
    return rows.map(mapPegInEventRow);
  }

  /**
   * Return a bounded, restart-safe reconciliation page. The persisted cursor
   * advances monotonically through row IDs and wraps only after reaching the end.
   */
  getPegInReconciliationBatch(limit = 50): PegInEvent[] {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('peg-in reconciliation batch limit must be a positive safe integer');
    }
    const cursorRow = this.db.prepare(`
      SELECT peg_in_reconcile_cursor FROM sync_state WHERE id = 1
    `).get() as { peg_in_reconcile_cursor?: number } | undefined;
    const cursor = cursorRow?.peg_in_reconcile_cursor ?? 0;
    let rows = this.db.prepare(`
      SELECT * FROM peg_in_events
      WHERE status = 'minted' AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `).all(cursor, limit);
    if (rows.length === 0 && cursor > 0) {
      rows = this.db.prepare(`
        SELECT * FROM peg_in_events
        WHERE status = 'minted'
        ORDER BY id ASC
        LIMIT ?
      `).all(limit);
    }
    return rows.map(mapPegInEventRow);
  }

  advancePegInReconciliationCursor(lastProcessedId: number): void {
    this.assertWritable('advance peg-in reconciliation cursor');
    if (!Number.isSafeInteger(lastProcessedId) || lastProcessedId <= 0) {
      throw new Error('last processed peg-in id must be a positive safe integer');
    }
    this.db.prepare(`
      UPDATE sync_state
      SET peg_in_reconcile_cursor = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(lastProcessedId);
  }

  /**
   * 🚨 CHAIN β DEFENSE: Get all peg-outs with committed AVL keys that
   * may be affected by an Ergo reorg.
   *
   * Returns peg-outs in two categories:
   * - 'phase1_created': Phase 1 was confirmed, AVL key committed,
   *   waiting for Phase 2. Reorg → reset to 'detected'.
   * - 'burn_reverted': Phase 1 was confirmed, AVL key committed,
   *   but burn was later detected as reverted. Reorg → purge AVL
   *   key and Phase 1 artifacts, keep terminal status.
   *
   * Both have phase1_box_id set and may have pending_avl_key committed.
   */
  getPegOutsWithAvlKeysForReorg(): Array<{ burnId: string | null; burnTxHash: string; sidechainLogIndex: number | null; pendingAvlKey: string | null; status: string; phase1BoxId: string }> {
    const rows = this.db.prepare(`
      SELECT burn_id, sidechain_burn_tx_hash, sidechain_log_index, pending_avl_key, status, phase1_box_id
      FROM peg_out_events
      WHERE status IN ('phase1_created', 'burn_reverted')
        AND phase1_box_id IS NOT NULL
        AND pending_avl_key IS NOT NULL
    `).all() as any[];
    return rows.map(r => ({
      burnId: r.burn_id,
      burnTxHash: r.sidechain_burn_tx_hash,
      sidechainLogIndex: r.sidechain_log_index,
      pendingAvlKey: r.pending_avl_key,
      status: r.status,
      phase1BoxId: r.phase1_box_id,
    }));
  }

  /**
   * 🚨 CHAIN β DEFENSE: Clear Phase 1 artifacts from a peg-out WITHOUT
   * changing its status. Used for terminal-status rows (e.g. burn_reverted)
   * where the AVL key must be purged after an Ergo reorg but the status
   * must remain terminal to avoid re-processing a reverted burn.
   */
  clearPhase1Artifacts(lookup: PegOutEventLookup): void {
    this.assertWritable('clear Phase 1 artifacts');
    const pegOut = this.requirePegOut(lookup, 'clear Phase 1 artifacts');
    this.db.prepare(`
      UPDATE peg_out_events
      SET phase1_box_id = NULL,
          avl_proof_hex = NULL,
          pending_avl_key = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(pegOut.id);
  }

  reserveErgoOperationalTransactionAttempt(
    input: ReserveErgoOperationalTransactionAttemptInput,
    expectedFundsReleaseStateDigestHex?: string,
    expectedFundsExecutionAuthorityEpochHex?: string,
  ): ErgoOperationalTransactionAttempt {
    this.assertWritable('reserve Ergo operational transaction attempt');
    const operationProfile = normalizeErgoOperationalTransactionProfile(
      input.operationProfile,
    );
    const expectedTxId = normalizeFixedHex(
      input.expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const sourceBoxId = normalizeFixedHex(
      input.sourceBoxId,
      32,
      'Ergo operational source box ID',
    );
    const inputBoxIds = normalizeErgoOperationalInputBoxIds(
      input.inputBoxIds,
      sourceBoxId,
    );
    const attemptedAtHeight = normalizeErgoOperationalAttemptHeight(
      input.attemptedAtHeight,
      'Ergo operational attempted height',
    );
    const context = normalizeErgoOperationalContext({
      operationProfile,
      targetSidechainHeight: input.targetSidechainHeight,
      targetSidechainBlockHashHex: input.targetSidechainBlockHashHex,
      heartbeatKeyHex: input.heartbeatKeyHex,
    });
    const reconciliationIdentityDigestHex =
      normalizeErgoOperationalReconciliationIdentity(
        operationProfile,
        input.reconciliationIdentityDigestHex,
      );
    const bindingDigestHex = normalizeFixedHex(
      input.bindingDigestHex,
      32,
      'Ergo operational binding digest',
    );
    const signedTransactionDigestHex = normalizeFixedHex(
      input.signedTransactionDigestHex,
      32,
      'Ergo operational signed transaction digest',
    );
    const checkResponseDigestHex = normalizeFixedHex(
      input.checkResponseDigestHex,
      32,
      'Ergo operational check response digest',
    );
    const revalidationDigestHex = normalizeFixedHex(
      input.revalidationDigestHex,
      32,
      'Ergo operational revalidation digest',
    );
    const authorizationDigestHex = normalizeFixedHex(
      input.authorizationDigestHex,
      32,
      'Ergo operational authorization digest',
    );
    if (
      (expectedFundsReleaseStateDigestHex === undefined)
      !== (expectedFundsExecutionAuthorityEpochHex === undefined)
    ) {
      throw new Error(
        'Ergo operational reservation requires both funds-release digest and authority epoch',
      );
    }
    const fundsReleaseAuthorityEpochHex =
      expectedFundsExecutionAuthorityEpochHex === undefined
        ? null
        : normalizeFixedHex(
            expectedFundsExecutionAuthorityEpochHex,
            32,
            'Ergo operational funds execution authority epoch',
          );
    const durableAttemptDigestHex = sha256CanonicalJson({
      domain: 'E2S_ERGO_OPERATIONAL_DURABLE_ATTEMPT_V1',
      schema: ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
      operationProfile,
      expectedTxId,
      sourceBoxId,
      inputBoxIds,
      attemptedAtHeight,
      targetSidechainHeight: context.targetSidechainHeight,
      targetSidechainBlockHashHex: context.targetSidechainBlockHashHex,
      heartbeatKeyHex: context.heartbeatKeyHex,
      ...(reconciliationIdentityDigestHex === null
        ? {}
        : { reconciliationIdentityDigestHex }),
      bindingDigestHex,
      signedTransactionDigestHex,
      checkResponseDigestHex,
      revalidationDigestHex,
      authorizationDigestHex,
      fundsReleaseAuthorityEpochHex,
    });
    const reserve = this.db.transaction(() => {
      if (expectedFundsReleaseStateDigestHex !== undefined) {
        this.assertFundsReleaseAuthorized(
          expectedFundsReleaseStateDigestHex,
          fundsReleaseAuthorityEpochHex!,
        );
      }
      if (this.getErgoOperationalTransactionAttempt(expectedTxId)) {
        throw new Error(
          `Ergo operational attempt ${expectedTxId} already exists; reconcile it instead of resubmitting`,
        );
      }
      if (
        (
          operationProfile === DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
          || operationProfile
            === SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
        )
        && this.getActiveErgoOperationalTransactionAttempts(operationProfile).length !== 0
      ) {
        throw new Error(
          'an unresolved local devnet operational attempt must be reconciled before replacement',
        );
      }
      if (operationProfile === DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE) {
        const inputSet = new Set(inputBoxIds);
        const priorRows = this.db.prepare(`
          SELECT input_box_ids_json
          FROM ergo_operational_transaction_attempts
          WHERE operation_profile = ?
        `).all(operationProfile) as Array<{ input_box_ids_json: string }>;
        for (const row of priorRows) {
          const parsed = parseStrictJson(
            row.input_box_ids_json,
            'prior reward consolidation input box IDs',
          );
          if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('prior reward consolidation input box IDs are invalid');
          }
          const priorSourceBoxId = normalizeFixedHex(
            String(parsed[0]),
            32,
            'prior reward consolidation source box ID',
          );
          const priorInputBoxIds = normalizeErgoOperationalInputBoxIds(
            parsed,
            priorSourceBoxId,
          );
          if (priorInputBoxIds.some(boxId => inputSet.has(boxId))) {
            throw new Error(
              'a previously journaled reward box cannot be used by a replacement transaction',
            );
          }
        }
      }
      this.db.prepare(`
        INSERT INTO ergo_operational_transaction_attempts (
          schema,
          operation_profile,
          expected_tx_id,
          source_box_id,
          input_box_ids_json,
          attempted_at_height,
          target_sidechain_height,
          target_sidechain_block_hash,
          heartbeat_key_hex,
          reconciliation_identity_digest,
          binding_digest,
          signed_transaction_digest,
          check_response_digest,
          revalidation_digest,
          authorization_digest,
          funds_release_authority_epoch,
          durable_attempt_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
        operationProfile,
        expectedTxId,
        sourceBoxId,
        canonicalJson(inputBoxIds),
        attemptedAtHeight,
        context.targetSidechainHeight,
        context.targetSidechainBlockHashHex,
        context.heartbeatKeyHex,
        reconciliationIdentityDigestHex,
        bindingDigestHex,
        signedTransactionDigestHex,
        checkResponseDigestHex,
        revalidationDigestHex,
        authorizationDigestHex,
        fundsReleaseAuthorityEpochHex,
        durableAttemptDigestHex,
      );
      const attempt = this.getErgoOperationalTransactionAttempt(expectedTxId);
      if (!attempt) {
        throw new Error('Ergo operational durable attempt was not persisted');
      }
      return attempt;
    });
    return reserve.immediate();
  }

  getErgoOperationalTransactionAttempt(
    expectedTxId: string,
  ): ErgoOperationalTransactionAttempt | null {
    const normalizedTxId = normalizeFixedHex(
      expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const row = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE expected_tx_id = ?
    `).get(normalizedTxId) as ErgoOperationalTransactionAttemptRow | undefined;
    return row ? mapErgoOperationalTransactionAttempt(row) : null;
  }

  getErgoOperationalTransactionAttempts(
    operationProfile: ErgoOperationalTransactionProfile,
  ): ErgoOperationalTransactionAttempt[] {
    const profile = normalizeErgoOperationalTransactionProfile(operationProfile);
    const rows = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE operation_profile = ?
      ORDER BY created_at ASC, expected_tx_id ASC
    `).all(profile) as ErgoOperationalTransactionAttemptRow[];
    return rows.map(mapErgoOperationalTransactionAttempt);
  }

  getActiveErgoOperationalTransactionAttempts(
    operationProfile: ErgoOperationalTransactionProfile,
  ): ErgoOperationalTransactionAttempt[] {
    const profile = normalizeErgoOperationalTransactionProfile(operationProfile);
    const rows = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE operation_profile = ?
        AND status IN ('pending', 'accepted', 'ambiguous')
      ORDER BY created_at ASC, expected_tx_id ASC
    `).all(profile) as ErgoOperationalTransactionAttemptRow[];
    return rows.map(mapErgoOperationalTransactionAttempt);
  }

  getReconcilableErgoOperationalTransactionAttempts(
    operationProfile: ErgoOperationalTransactionProfile,
  ): ErgoOperationalTransactionAttempt[] {
    const profile = normalizeErgoOperationalTransactionProfile(operationProfile);
    const rows = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE operation_profile = ?
        AND status IN ('pending', 'accepted', 'ambiguous', 'abandoned')
      ORDER BY created_at ASC, expected_tx_id ASC
    `).all(profile) as ErgoOperationalTransactionAttemptRow[];
    return rows.map(mapErgoOperationalTransactionAttempt);
  }

  getConfirmedErgoOperationalTransactionAttempts(
    operationProfile: ErgoOperationalTransactionProfile,
  ): ErgoOperationalTransactionAttempt[] {
    const profile = normalizeErgoOperationalTransactionProfile(operationProfile);
    const rows = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE operation_profile = ? AND status = 'confirmed'
      ORDER BY confirmation_height ASC, expected_tx_id ASC
    `).all(profile) as ErgoOperationalTransactionAttemptRow[];
    return rows.map(mapErgoOperationalTransactionAttempt);
  }

  getQuarantinedErgoOperationalTransactionAttempts(
    operationProfile: ErgoOperationalTransactionProfile,
  ): ErgoOperationalTransactionAttempt[] {
    const profile = normalizeErgoOperationalTransactionProfile(operationProfile);
    const rows = this.db.prepare(`
      SELECT * FROM ergo_operational_transaction_attempts
      WHERE operation_profile = ? AND status = 'quarantined'
      ORDER BY updated_at ASC, expected_tx_id ASC
    `).all(profile) as ErgoOperationalTransactionAttemptRow[];
    return rows.map(mapErgoOperationalTransactionAttempt);
  }

  finalizeErgoOperationalTransactionAttempt(input: {
    expectedTxId: string;
    durableAttemptDigestHex: string;
    disposition: 'accepted' | 'ambiguous';
    submittedTxId: string | null;
    responseDigestHex: string | null;
  }): {
    attempt: ErgoOperationalTransactionAttempt;
    journalDigestHex: string;
  } {
    this.assertWritable('finalize Ergo operational transaction attempt');
    const expectedTxId = normalizeFixedHex(
      input.expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const durableAttemptDigestHex = normalizeFixedHex(
      input.durableAttemptDigestHex,
      32,
      'Ergo operational durable attempt digest',
    );
    const submittedTxId = input.submittedTxId === null
      ? null
      : normalizeFixedHex(
          input.submittedTxId,
          32,
          'Ergo operational submitted transaction ID',
        );
    if (
      (input.disposition === 'accepted' && submittedTxId !== expectedTxId)
      || (input.disposition === 'ambiguous' && submittedTxId !== null)
    ) {
      throw new Error('Ergo operational submission disposition is inconsistent');
    }
    const responseDigestHex = input.responseDigestHex === null
      ? null
      : normalizeFixedHex(
          input.responseDigestHex,
          32,
          'Ergo operational response digest',
        );
    if (input.disposition === 'accepted' && responseDigestHex === null) {
      throw new Error('accepted Ergo operational submission requires a response digest');
    }
    const result = this.db.prepare(`
      UPDATE ergo_operational_transaction_attempts
      SET status = ?,
          submission_disposition = ?,
          submitted_tx_id = ?,
          response_digest = ?,
          submission_finalized_at = datetime('now'),
          updated_at = datetime('now')
      WHERE expected_tx_id = ?
        AND durable_attempt_digest = ?
        AND status = 'pending'
    `).run(
      input.disposition,
      input.disposition,
      submittedTxId,
      responseDigestHex,
      expectedTxId,
      durableAttemptDigestHex,
    );
    if (result.changes !== 1) {
      throw new Error('Ergo operational attempt cannot be finalized from its current state');
    }
    const attempt = this.getErgoOperationalTransactionAttempt(expectedTxId);
    if (!attempt) {
      throw new Error('finalized Ergo operational attempt is unavailable');
    }
    return {
      attempt,
      journalDigestHex: ergoOperationalAttemptJournalDigestHex(attempt),
    };
  }

  confirmErgoOperationalTransactionAttempt(input: {
    expectedTxId: string;
    confirmationHeight: number;
    confirmationHeaderId: string;
  }): ErgoOperationalTransactionAttempt {
    this.assertWritable('confirm Ergo operational transaction attempt');
    const expectedTxId = normalizeFixedHex(
      input.expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const confirmationHeight = normalizeErgoOperationalAttemptHeight(
      input.confirmationHeight,
      'Ergo operational confirmation height',
    );
    if (typeof input.confirmationHeaderId !== 'string') {
      throw new Error('Ergo operational confirmation header ID is required');
    }
    const confirmationHeaderId = normalizeFixedHex(
      input.confirmationHeaderId,
      32,
      'Ergo operational confirmation header ID',
    );
    const confirm = this.db.transaction(() => {
      const current = this.getErgoOperationalTransactionAttempt(expectedTxId);
      if (!current) throw new Error('Ergo operational attempt is unavailable');
      if (current.status === 'confirmed') {
        if (
          current.confirmationHeight !== confirmationHeight
          || current.confirmationHeaderId !== confirmationHeaderId
        ) {
          throw new Error('Ergo operational confirmation conflicts with durable state');
        }
        if (
          current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
          && (
            !current.heartbeatKeyHex
            || !this.hasAvlKey(current.heartbeatKeyHex)
          )
        ) {
          throw new Error('confirmed DUP operational attempt lacks committed AVL history');
        }
        return current;
      }
      const result = this.db.prepare(`
        UPDATE ergo_operational_transaction_attempts
        SET status = 'confirmed',
            confirmation_height = ?,
            confirmation_header_id = ?,
            abandonment_reason = NULL,
            quarantine_reason = NULL,
            confirmed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND status IN ('pending', 'accepted', 'ambiguous', 'abandoned')
      `).run(confirmationHeight, confirmationHeaderId, expectedTxId);
      if (result.changes !== 1) {
        throw new Error('Ergo operational attempt cannot be confirmed from its current state');
      }

      if (current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE) {
        if (!current.heartbeatKeyHex) {
          throw new Error('confirmed DUP operational attempt lacks its bound heartbeat key');
        }
        this.db.prepare(`
          INSERT OR IGNORE INTO avl_tree_history (key_hex, value_hex)
          VALUES (?, '01')
        `).run(current.heartbeatKeyHex);
      }

      const supersededReason = normalizeReason(
        `superseded by confirmed exact transaction ${expectedTxId}`,
        'Ergo operational supersession reason',
      );
      if (
        current.operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE
        || current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
      ) {
        this.db.prepare(`
          UPDATE ergo_operational_transaction_attempts
          SET status = 'abandoned',
              abandonment_reason = ?,
              quarantine_reason = NULL,
              updated_at = datetime('now')
          WHERE expected_tx_id <> ?
            AND operation_profile = ?
            AND status IN ('pending', 'accepted', 'ambiguous')
        `).run(supersededReason, expectedTxId, current.operationProfile);
      } else {
        this.db.prepare(`
          UPDATE ergo_operational_transaction_attempts
          SET status = 'abandoned',
              abandonment_reason = ?,
              quarantine_reason = NULL,
              updated_at = datetime('now')
          WHERE expected_tx_id <> ?
            AND operation_profile = ?
            AND source_box_id = ?
            AND status IN ('pending', 'accepted', 'ambiguous')
        `).run(
          supersededReason,
          expectedTxId,
          current.operationProfile,
          current.sourceBoxId,
        );
      }

      const confirmed = this.getErgoOperationalTransactionAttempt(expectedTxId);
      if (!confirmed) {
        throw new Error('confirmed Ergo operational attempt is unavailable');
      }
      return confirmed;
    });
    return confirm.immediate();
  }

  rebindConfirmedErgoOperationalTransactionAttempt(input: {
    expectedTxId: string;
    confirmationHeight: number;
    confirmationHeaderId: string;
  }): ErgoOperationalTransactionAttempt {
    this.assertWritable('rebind confirmed Ergo operational transaction attempt');
    const expectedTxId = normalizeFixedHex(
      input.expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const confirmationHeight = normalizeErgoOperationalAttemptHeight(
      input.confirmationHeight,
      'Ergo operational confirmation height',
    );
    const confirmationHeaderId = normalizeFixedHex(
      input.confirmationHeaderId,
      32,
      'Ergo operational confirmation header ID',
    );
    const rebind = this.db.transaction(() => {
      const current = this.getErgoOperationalTransactionAttempt(expectedTxId);
      if (!current || current.status !== 'confirmed') {
        throw new Error('only a confirmed Ergo operational attempt can be rebound');
      }
      if (
        current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
        && (
          !current.heartbeatKeyHex
          || !this.hasAvlKey(current.heartbeatKeyHex)
        )
      ) {
        throw new Error('confirmed DUP operational attempt lacks committed AVL history');
      }
      if (
        current.confirmationHeight === confirmationHeight
        && current.confirmationHeaderId === confirmationHeaderId
      ) {
        return current;
      }
      const result = this.db.prepare(`
        UPDATE ergo_operational_transaction_attempts
        SET confirmation_height = ?,
            confirmation_header_id = ?,
            confirmed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE expected_tx_id = ? AND status = 'confirmed'
      `).run(confirmationHeight, confirmationHeaderId, expectedTxId);
      if (result.changes !== 1) {
        throw new Error('confirmed Ergo operational attempt could not be rebound');
      }
      const rebound = this.getErgoOperationalTransactionAttempt(expectedTxId);
      if (!rebound) throw new Error('rebound Ergo operational attempt is unavailable');
      return rebound;
    });
    return rebind.immediate();
  }

  reopenConfirmedErgoOperationalTransactionAttempt(
    expectedTxId: string,
  ): ErgoOperationalTransactionAttempt {
    this.assertWritable('reopen confirmed Ergo operational transaction attempt');
    const normalizedTxId = normalizeFixedHex(
      expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const reopen = this.db.transaction(() => {
      const current = this.getErgoOperationalTransactionAttempt(normalizedTxId);
      if (!current || current.status !== 'confirmed') {
        throw new Error('only a confirmed Ergo operational attempt can be reopened');
      }
      if (
        current.operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE
        || current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
      ) {
        const reason = normalizeReason(
          `superseded while confirmed transaction ${normalizedTxId} re-establishes finality`,
          'Ergo operational reopening reason',
        );
        this.db.prepare(`
          UPDATE ergo_operational_transaction_attempts
          SET status = 'abandoned',
              abandonment_reason = ?,
              quarantine_reason = NULL,
              updated_at = datetime('now')
          WHERE expected_tx_id <> ?
            AND operation_profile = ?
            AND status IN ('pending', 'accepted', 'ambiguous')
        `).run(reason, normalizedTxId, current.operationProfile);
      }
      if (
        current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
        && current.heartbeatKeyHex
      ) {
        this.db.prepare(`
          DELETE FROM avl_tree_history WHERE key_hex = ?
        `).run(current.heartbeatKeyHex);
      }
      const reopenedStatus = current.submissionDisposition ?? 'pending';
      const result = this.db.prepare(`
        UPDATE ergo_operational_transaction_attempts
        SET status = ?,
            confirmation_height = NULL,
            confirmation_header_id = NULL,
            abandonment_reason = NULL,
            quarantine_reason = NULL,
            confirmed_at = NULL,
            updated_at = datetime('now')
        WHERE expected_tx_id = ? AND status = 'confirmed'
      `).run(reopenedStatus, normalizedTxId);
      if (result.changes !== 1) {
        throw new Error('confirmed Ergo operational attempt could not be reopened');
      }
      const reopened = this.getErgoOperationalTransactionAttempt(normalizedTxId);
      if (!reopened) throw new Error('reopened Ergo operational attempt is unavailable');
      return reopened;
    });
    return reopen.immediate();
  }

  abandonErgoOperationalTransactionAttempt(
    expectedTxId: string,
    reason: string,
  ): ErgoOperationalTransactionAttempt {
    this.assertWritable('abandon Ergo operational transaction attempt');
    const normalizedTxId = normalizeFixedHex(
      expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const normalizedReason = normalizeReason(
      reason,
      'Ergo operational abandonment reason',
    );
    const result = this.db.prepare(`
      UPDATE ergo_operational_transaction_attempts
      SET status = 'abandoned',
          abandonment_reason = ?,
          quarantine_reason = NULL,
          updated_at = datetime('now')
      WHERE expected_tx_id = ?
        AND status IN ('pending', 'accepted', 'ambiguous')
    `).run(normalizedReason, normalizedTxId);
    if (result.changes !== 1) {
      throw new Error('Ergo operational attempt cannot be abandoned from its current state');
    }
    const attempt = this.getErgoOperationalTransactionAttempt(normalizedTxId);
    if (!attempt) throw new Error('abandoned Ergo operational attempt is unavailable');
    return attempt;
  }

  quarantineErgoOperationalTransactionAttempt(
    expectedTxId: string,
    reason: string,
  ): ErgoOperationalTransactionAttempt {
    this.assertWritable('quarantine Ergo operational transaction attempt');
    const normalizedTxId = normalizeFixedHex(
      expectedTxId,
      32,
      'Ergo operational expected transaction ID',
    );
    const normalizedReason = normalizeReason(
      reason,
      'Ergo operational quarantine reason',
    );
    const quarantine = this.db.transaction(() => {
      const current = this.getErgoOperationalTransactionAttempt(normalizedTxId);
      if (!current) throw new Error('Ergo operational attempt is unavailable');
      if (current.status === 'quarantined') {
        if (current.quarantineReason !== normalizedReason) {
          throw new Error('Ergo operational quarantine conflicts with durable state');
        }
        return current;
      }
      if (
        current.status === 'confirmed'
        && current.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
        && current.heartbeatKeyHex
      ) {
        this.db.prepare(`
          DELETE FROM avl_tree_history WHERE key_hex = ?
        `).run(current.heartbeatKeyHex);
      }
      const result = this.db.prepare(`
        UPDATE ergo_operational_transaction_attempts
        SET status = 'quarantined',
            abandonment_reason = NULL,
            quarantine_reason = ?,
            updated_at = datetime('now')
        WHERE expected_tx_id = ?
          AND status <> 'quarantined'
      `).run(normalizedReason, normalizedTxId);
      if (result.changes !== 1) {
        throw new Error('Ergo operational attempt cannot be quarantined');
      }
      const attempt = this.getErgoOperationalTransactionAttempt(normalizedTxId);
      if (!attempt) {
        throw new Error('quarantined Ergo operational attempt is unavailable');
      }
      return attempt;
    });
    return quarantine.immediate();
  }

  recordPendingDupHeartbeat(txId: string, keyHex: string): void {
    this.assertWritable('record pending DUP heartbeat');
    this.db.prepare(`
      INSERT OR REPLACE INTO pending_dup_heartbeats (tx_id, key_hex)
      VALUES (?, ?)
    `).run(txId, keyHex);
  }

  getPendingDupHeartbeats(): Array<{ txId: string; keyHex: string }> {
    const rows = this.db.prepare(`
      SELECT tx_id, key_hex FROM pending_dup_heartbeats
      ORDER BY created_at ASC
    `).all() as { tx_id: string; key_hex: string }[];
    return rows.map(r => ({ txId: r.tx_id, keyHex: r.key_hex }));
  }

  clearPendingDupHeartbeat(txId: string): void {
    this.assertWritable('clear pending DUP heartbeat');
    this.db.prepare(`
      DELETE FROM pending_dup_heartbeats WHERE tx_id = ?
    `).run(txId);
  }

  close(): void {
    try {
      if (this.fundsExecutionAuthority !== null) {
        this.releaseFundsExecutionAuthority();
      }
    } finally {
      this.db.close();
    }
  }
}

function normalizePegInRouteReconstruction(
  reconstruction: PegInRouteReconstruction,
): PegInRouteReconstructionCacheSnapshot {
  const schema = normalizePegInRouteReconstructionSchema(reconstruction.schema);
  const manifestId = normalizeBoundedText(
    reconstruction.manifest.manifestId,
    256,
    'peg-in route manifest ID',
  );
  const manifestDigestHex = normalizeFixedHex(
    reconstruction.manifest.computedSha256Hex,
    32,
    'peg-in route manifest digest',
  );
  if (
    normalizeFixedHex(
      reconstruction.manifest.expectedSha256Hex,
      32,
      'expected peg-in route manifest digest',
    ) !== manifestDigestHex
  ) {
    throw new Error('peg-in route reconstruction manifest digest is not the expected digest');
  }
  const sourceRevisionHex = normalizeFixedHex(
    reconstruction.manifest.sourceRevision,
    20,
    'peg-in route source revision',
  );
  const routeBindings = structuredClone(reconstruction.routeBindings);
  normalizeVaultAddress(routeBindings.mainChainLockAddress, 'peg-in MainChainLock address');
  normalizeBoundedHex(
    routeBindings.mainChainLockErgoTreeHex,
    32 * 1024,
    'peg-in MainChainLock ErgoTree',
  );
  normalizeVaultAddress(routeBindings.settlementVaultAddress, 'peg-in settlement-vault address');
  normalizeBoundedHex(
    routeBindings.settlementVaultErgoTreeHex,
    32 * 1024,
    'peg-in settlement-vault ErgoTree',
  );
  if (
    !Number.isSafeInteger(routeBindings.commitConfirmations)
    || routeBindings.commitConfirmations < 10
  ) {
    throw new Error('peg-in route commit confirmations must be at least 10');
  }
  if (
    !Number.isSafeInteger(routeBindings.committeeThreshold)
    || routeBindings.committeeThreshold < 1
    || routeBindings.committeeThreshold > routeBindings.committeePublicKeysHex.length
  ) {
    throw new Error('peg-in route committee threshold is invalid');
  }
  const committeeKeys = routeBindings.committeePublicKeysHex.map((key, index) =>
    normalizeFixedHex(key, 33, `peg-in route committee key ${index}`));
  if (new Set(committeeKeys).size !== committeeKeys.length) {
    throw new Error('peg-in route committee keys must be unique');
  }

  const networkId = normalizeLowerIdentifier(
    reconstruction.network.networkId,
    'peg-in route network ID',
  );
  const snapshot = {
    network: normalizeLowerIdentifier(
      reconstruction.network.snapshot.network,
      'peg-in route node network',
    ),
    indexedHeight: normalizeNonnegativeSignedInt(
      reconstruction.network.snapshot.indexedHeight,
      'peg-in route indexed height',
    ),
    fullHeight: normalizeNonnegativeSignedInt(
      reconstruction.network.snapshot.fullHeight,
      'peg-in route full height',
    ),
    tip: {
      height: normalizeNonnegativeSignedInt(
        reconstruction.network.snapshot.tip.height,
        'peg-in route tip height',
      ),
      idHex: normalizeFixedHex(
        reconstruction.network.snapshot.tip.idHex,
        32,
        'peg-in route tip ID',
      ),
    },
  };
  if (
    snapshot.indexedHeight !== snapshot.fullHeight
    || snapshot.tip.height !== snapshot.fullHeight
  ) {
    throw new Error('peg-in route reconstruction snapshot is not synchronized');
  }
  const anchorHeader = {
    height: normalizeNonnegativeSignedInt(
      reconstruction.network.anchorHeader.height,
      'peg-in route anchor height',
    ),
    expectedIdHex: normalizeFixedHex(
      reconstruction.network.anchorHeader.expectedIdHex,
      32,
      'peg-in route expected anchor ID',
    ),
    observedIdsHex: reconstruction.network.anchorHeader.observedIdsHex.map((id, index) =>
      normalizeFixedHex(id, 32, `peg-in route observed anchor ID ${index}`)),
    depthAtSnapshot: normalizeNonnegativeSignedInt(
      reconstruction.network.anchorHeader.depthAtSnapshot,
      'peg-in route anchor depth',
    ),
  };
  if (!anchorHeader.observedIdsHex.includes(anchorHeader.expectedIdHex)) {
    throw new Error('peg-in route reconstruction anchor is not canonical at its height');
  }

  const primarySourceId = normalizeCredentialFreeHttpOrigin(
    reconstruction.sources.primary,
    'primary peg-in route source',
  );
  const witnessSourceId = normalizeCredentialFreeHttpOrigin(
    reconstruction.sources.witness,
    'witness peg-in route source',
  );
  if (primarySourceId === witnessSourceId) {
    throw new Error('peg-in route reconstruction requires distinct source origins');
  }
  const observationDigestHex = normalizeFixedHex(
    reconstruction.observationDigestHex,
    32,
    'peg-in route observation digest',
  );
  const reconstructionDigestHex = normalizeFixedHex(
    reconstruction.reconstructionDigestHex,
    32,
    'peg-in route reconstruction digest',
  );
  const classification = normalizePegInRouteObservationClassification(
    reconstruction.decision.classification,
  );
  const blockers = reconstruction.decision.blockers.map((blocker, index) => {
    const raw = requirePlainObject(blocker, `peg-in route blocker ${index}`);
    const code = normalizePegInRouteObservationClassification(raw.code);
    if (code === 'observation_condition_met_under_explicit_manifest') {
      throw new Error('peg-in route blocker cannot use the passing classification');
    }
    return {
      code,
      message: normalizeBoundedText(raw.message, 1000, `peg-in route blocker ${index} message`),
    };
  });
  if (
    reconstruction.decision.observationConditionMet
    && (
      blockers.length !== 0
      || classification !== 'observation_condition_met_under_explicit_manifest'
    )
  ) {
    throw new Error('passing peg-in route reconstruction cannot retain blockers');
  }
  if (!reconstruction.decision.observationConditionMet && blockers.length === 0) {
    throw new Error('blocked peg-in route reconstruction must retain its blocker');
  }
  if (
    !reconstruction.decision.observationConditionMet
    && blockers[0].code !== classification
  ) {
    throw new Error('blocked peg-in route reconstruction classification must match its first blocker');
  }

  const activeCurrentBoxIdsHex = normalizeUniqueFixedHexes(
    reconstruction.activeCurrentBoxIdsHex,
    32,
    'current peg-in route deposit',
  );
  const activeCurrent = new Set(activeCurrentBoxIdsHex);
  const seenDepositIds = new Set<string>();
  const seenAddressIndexes = new Set<number>();
  const activeHistory = reconstruction.activeHistory.map((deposit, index) => {
    const normalized = normalizePegInRouteDeposit(deposit, index);
    if (seenDepositIds.has(normalized.boxIdHex)) {
      throw new Error(`peg-in route reconstruction repeats deposit ${normalized.boxIdHex}`);
    }
    if (seenAddressIndexes.has(normalized.addressBoxIndex)) {
      throw new Error('peg-in route reconstruction repeats an address-box index');
    }
    seenDepositIds.add(normalized.boxIdHex);
    seenAddressIndexes.add(normalized.addressBoxIndex);
    const current = activeCurrent.has(normalized.boxIdHex);
    if (current !== (normalized.classification === 'refundable')) {
      throw new Error('peg-in route current deposit set does not match refundable classification');
    }
    if (normalized.transition !== null) {
      const expectedConfirmations = snapshot.fullHeight - normalized.transition.inclusionHeight + 1;
      if (
        normalized.transition.inclusionHeight > snapshot.fullHeight
        || normalized.transition.confirmations !== expectedConfirmations
      ) {
        throw new Error('peg-in route transition confirmations do not match the observed snapshot');
      }
    }
    if (
      normalized.classification === 'commit_pending'
      && normalized.transition!.confirmations >= routeBindings.commitConfirmations
    ) {
      throw new Error('pending peg-in commit already satisfies the confirmation policy');
    }
    if (
      normalized.classification === 'committed'
      && normalized.transition!.confirmations < routeBindings.commitConfirmations
    ) {
      throw new Error('committed peg-in does not satisfy the confirmation policy');
    }
    return normalized;
  }).sort((left, right) => (
    left.addressBoxIndex - right.addressBoxIndex
    || left.boxIdHex.localeCompare(right.boxIdHex)
  ));
  if (activeCurrentBoxIdsHex.some(boxId => !seenDepositIds.has(boxId))) {
    throw new Error('current peg-in route deposit is absent from indexed history');
  }

  const vaultHistoryBoxIdsHex = normalizeUniqueFixedHexes(
    reconstruction.vaultHistoryBoxIdsHex,
    32,
    'peg-in route vault history box',
  );
  const vaultHistory = new Set(vaultHistoryBoxIdsHex);
  const vaultCurrentBoxIdsHex = normalizeUniqueFixedHexes(
    reconstruction.vaultCurrentBoxIdsHex,
    32,
    'current peg-in route vault box',
  );
  if (vaultCurrentBoxIdsHex.some(boxId => !vaultHistory.has(boxId))) {
    throw new Error('current peg-in route vault box is absent from indexed history');
  }
  for (const deposit of activeHistory) {
    if (
      (deposit.classification === 'commit_pending' || deposit.classification === 'committed')
      && !vaultHistory.has(deposit.transition!.vaultBoxIdHex!)
    ) {
      throw new Error('committed peg-in vault output is absent from indexed vault history');
    }
  }

  const seenOrdinals = new Set<number>();
  const legacyRoutes = reconstruction.legacyRoutes.map(route => {
    const ordinal = normalizeNonnegativeSignedInt(route.ordinal, 'legacy peg-in route ordinal');
    if (seenOrdinals.has(ordinal)) throw new Error('legacy peg-in route ordinal is duplicated');
    seenOrdinals.add(ordinal);
    const historyBoxIdsHex = normalizeUniqueFixedHexes(
      route.historyBoxIdsHex,
      32,
      `legacy peg-in route ${ordinal} history box`,
    );
    const history = new Set(historyBoxIdsHex);
    const currentBoxIdsHex = normalizeUniqueFixedHexes(
      route.currentBoxIdsHex,
      32,
      `legacy peg-in route ${ordinal} current box`,
    );
    if (currentBoxIdsHex.some(boxId => !history.has(boxId))) {
      throw new Error(`legacy peg-in route ${ordinal} current set is absent from history`);
    }
    return {
      ordinal,
      version: normalizeBoundedText(route.version, 128, 'legacy peg-in route version'),
      address: normalizeVaultAddress(route.address, 'legacy peg-in route address'),
      historyBoxIdsHex,
      currentBoxIdsHex,
    };
  }).sort((left, right) => left.ordinal - right.ordinal);
  if (legacyRoutes.length !== routeBindings.declaredLegacyCount) {
    throw new Error('peg-in route reconstruction legacy count differs from the manifest');
  }

  return {
    state: {
      schema,
      manifestId,
      manifestDigestHex,
      sourceRevisionHex,
      routeBindings,
      networkId,
      snapshot,
      anchorHeader,
      primarySourceId,
      witnessSourceId,
      observationDigestHex,
      reconstructionDigestHex,
      decision: {
        classification,
        observationConditionMet: reconstruction.decision.observationConditionMet,
        blockers,
      },
      observedAt: normalizeCanonicalIsoTimestamp(
        reconstruction.observedAt,
        'peg-in route observation time',
      ),
    },
    activeHistory,
    activeCurrentBoxIdsHex,
    vaultHistoryBoxIdsHex,
    vaultCurrentBoxIdsHex,
    legacyRoutes,
  };
}

function normalizePegInRouteDeposit(
  deposit: PegInRouteReconstructionDeposit,
  index: number,
): PegInRouteReconstructionDeposit {
  const label = `peg-in route deposit ${index}`;
  const classification = normalizePegInRouteDepositClassification(deposit.classification);
  const spentTransactionIdHex = deposit.spentTransactionIdHex === null
    ? null
    : normalizeFixedHex(deposit.spentTransactionIdHex, 32, `${label} spending transaction ID`);
  let transition: PegInRouteReconstructionDeposit['transition'] = null;
  if (deposit.transition !== null) {
    transition = {
      spendingTransactionIdHex: normalizeFixedHex(
        deposit.transition.spendingTransactionIdHex,
        32,
        `${label} transition transaction ID`,
      ),
      inclusionHeight: normalizeNonnegativeSignedInt(
        deposit.transition.inclusionHeight,
        `${label} transition inclusion height`,
      ),
      inclusionBlockIdHex: normalizeFixedHex(
        deposit.transition.inclusionBlockIdHex,
        32,
        `${label} transition inclusion block ID`,
      ),
      confirmations: normalizePositiveSignedInt(
        deposit.transition.confirmations,
        `${label} transition confirmations`,
      ),
      vaultBoxIdHex: deposit.transition.vaultBoxIdHex === null
        ? null
        : normalizeFixedHex(
          deposit.transition.vaultBoxIdHex,
          32,
          `${label} transition vault box ID`,
        ),
    };
  }
  if (classification === 'refundable' && (spentTransactionIdHex !== null || transition !== null)) {
    throw new Error(`${label} refundable state cannot retain a spend transition`);
  }
  if (classification === 'commit_pending' || classification === 'committed') {
    if (
      spentTransactionIdHex === null
      || transition === null
      || transition.vaultBoxIdHex === null
      || transition.spendingTransactionIdHex !== spentTransactionIdHex
    ) {
      throw new Error(`${label} committed state lacks its exact vault transition`);
    }
  }
  if (classification === 'refunded') {
    if (
      spentTransactionIdHex === null
      || transition === null
      || transition.vaultBoxIdHex !== null
      || transition.spendingTransactionIdHex !== spentTransactionIdHex
    ) {
      throw new Error(`${label} refunded state lacks its exact refund transition`);
    }
  }
  return {
    addressBoxIndex: normalizeNonnegativeSignedInt(
      deposit.addressBoxIndex,
      `${label} address-box index`,
    ),
    boxIdHex: normalizeFixedHex(deposit.boxIdHex, 32, `${label} box ID`),
    transactionIdHex: normalizeFixedHex(
      deposit.transactionIdHex,
      32,
      `${label} creation transaction ID`,
    ),
    outputIndex: normalizeNonnegativeSignedInt(deposit.outputIndex, `${label} output index`),
    creationHeight: normalizeNonnegativeSignedInt(
      deposit.creationHeight,
      `${label} creation height`,
    ),
    valueNanoErg: normalizePositiveLongText(deposit.valueNanoErg, `${label} value`),
    spentTransactionIdHex,
    targetEvmAddressHex: normalizeFixedHex(
      deposit.targetEvmAddressHex,
      20,
      `${label} target EVM address`,
    ),
    declaredAmountNanoErg: normalizePositiveLongText(
      deposit.declaredAmountNanoErg,
      `${label} declared amount`,
    ),
    signerMetadataHex: normalizeBoundedHex(
      deposit.signerMetadataHex,
      4 * 1024,
      `${label} signer metadata`,
    ),
    depositorErgoTreeHex: normalizeBoundedHex(
      deposit.depositorErgoTreeHex,
      32 * 1024,
      `${label} depositor ErgoTree`,
    ),
    classification,
    transition,
  };
}

function persistedPegInRouteDeposit(
  row: Record<string, any>,
  index: number,
): PegInRouteReconstructionDeposit {
  const transitionFields = [
    row.transition_transaction_id,
    row.transition_inclusion_height,
    row.transition_inclusion_block_id,
    row.transition_confirmations,
    row.transition_vault_box_id,
  ];
  const transition = transitionFields.every(value => value === null)
    ? null
    : {
      spendingTransactionIdHex: normalizeFixedHex(
        row.transition_transaction_id,
        32,
        `persisted peg-in route deposit ${index} transition transaction ID`,
      ),
      inclusionHeight: normalizeNonnegativeSignedInt(
        row.transition_inclusion_height,
        `persisted peg-in route deposit ${index} transition inclusion height`,
      ),
      inclusionBlockIdHex: normalizeFixedHex(
        row.transition_inclusion_block_id,
        32,
        `persisted peg-in route deposit ${index} transition inclusion block ID`,
      ),
      confirmations: normalizePositiveSignedInt(
        row.transition_confirmations,
        `persisted peg-in route deposit ${index} transition confirmations`,
      ),
      vaultBoxIdHex: row.transition_vault_box_id === null
        ? null
        : normalizeFixedHex(
          row.transition_vault_box_id,
          32,
          `persisted peg-in route deposit ${index} transition vault box ID`,
        ),
    };
  assertSqliteBoolean(
    row.current_unspent,
    `persisted peg-in route deposit ${index} current flag`,
  );
  return normalizePegInRouteDeposit({
    addressBoxIndex: row.address_box_index,
    boxIdHex: row.box_id,
    transactionIdHex: row.transaction_id,
    outputIndex: row.output_index,
    creationHeight: row.creation_height,
    valueNanoErg: row.value_nanoerg,
    spentTransactionIdHex: row.spent_transaction_id,
    targetEvmAddressHex: row.target_evm_address,
    declaredAmountNanoErg: row.declared_amount_nanoerg,
    signerMetadataHex: row.signer_metadata_hex,
    depositorErgoTreeHex: row.depositor_ergo_tree_hex,
    classification: row.classification,
    transition,
  }, index);
}

function pegInRouteCacheSemantic(snapshot: PegInRouteReconstructionCacheSnapshot): unknown {
  const { observedAt: _observedAt, ...state } = snapshot.state;
  return {
    state,
    activeHistory: snapshot.activeHistory,
    activeCurrentBoxIdsHex: [...snapshot.activeCurrentBoxIdsHex].sort(),
    vaultHistoryBoxIdsHex: [...snapshot.vaultHistoryBoxIdsHex].sort(),
    vaultCurrentBoxIdsHex: [...snapshot.vaultCurrentBoxIdsHex].sort(),
    legacyRoutes: snapshot.legacyRoutes,
  };
}

function parseCanonicalObjectJson(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'string') throw new Error(`${label} must be JSON text`);
  const parsed = parseStrictJson(value, label);
  const object = requirePlainObject(parsed, label);
  if (canonicalJson(object) !== value) throw new Error(`${label} must be canonical JSON`);
  return object;
}

function parseCanonicalArrayJson(value: unknown, label: string): unknown[] {
  if (typeof value !== 'string') throw new Error(`${label} must be JSON text`);
  const parsed = parseStrictJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  if (canonicalJson(parsed) !== value) throw new Error(`${label} must be canonical JSON`);
  return parsed;
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function normalizePegInRouteReconstructionSchema(
  value: unknown,
): typeof PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA {
  if (value !== PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA) {
    throw new Error('peg-in route reconstruction schema is unsupported');
  }
  return value;
}

function normalizePegInRouteObservationClassification(
  value: unknown,
): PegInRouteReconstruction['decision']['classification'] {
  const allowed = new Set<string>([
    'blocked_manifest_invalid',
    'blocked_manifest_digest_mismatch',
    'blocked_source_identity',
    'blocked_source_template_mismatch',
    'blocked_network_mismatch',
    'blocked_anchor_policy',
    'blocked_index_unsynchronized',
    'blocked_node_view_unstable',
    'blocked_source_disagreement',
    'blocked_query_failure',
    'blocked_compile_identity',
    'blocked_box_malformed',
    'blocked_commit_pending',
    'blocked_transition_unresolved',
    'blocked_no_active_route_history',
    'blocked_no_committed_transition',
    'blocked_legacy_mcl_utxo_present',
    'observation_condition_met_under_explicit_manifest',
  ]);
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error('peg-in route observation classification is invalid');
  }
  return value as PegInRouteReconstruction['decision']['classification'];
}

function normalizePegInRouteDepositClassification(
  value: unknown,
): PegInRouteReconstructionDeposit['classification'] {
  if (![
    'refundable',
    'commit_pending',
    'committed',
    'refunded',
    'unresolved',
  ].includes(String(value))) {
    throw new Error('peg-in route deposit classification is invalid');
  }
  return value as PegInRouteReconstructionDeposit['classification'];
}

function normalizeUniqueFixedHexes(
  values: readonly string[],
  bytes: number,
  label: string,
): string[] {
  if (!Array.isArray(values)) throw new Error(`${label} set must be an array`);
  const normalized = values.map((value, index) =>
    normalizeFixedHex(value, bytes, `${label} ${index}`)).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} set must be unique`);
  }
  return normalized;
}

function normalizeLowerIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a lowercase identifier`);
  }
  return value;
}

function normalizeBoundedText(value: unknown, maxLength: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical text`);
  }
  return value;
}

function normalizeCredentialFreeHttpOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an HTTP(S) origin`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || parsed.search
    || parsed.hash
    || parsed.origin !== value
  ) {
    throw new Error(`${label} must be a canonical credential-free root origin`);
  }
  return value;
}

function normalizeCanonicalIsoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  if (new Date(value).toISOString() !== value) {
    throw new Error(`${label} is not a real timestamp`);
  }
  return value;
}

function normalizeOptionalOperatorHealthTimestampMs(
  value: unknown,
  label: string,
): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe UTC timestamp`);
  }
  return Number(value);
}

function normalizePrefixedFixedHex(
  value: string,
  expectedBytes: number,
  label: string,
): string {
  return `0x${normalizeFixedHex(value, expectedBytes, label)}`;
}

function normalizeCanonicalUint64Text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint64 string`);
  }
  const normalized = BigInt(value);
  if (normalized > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return normalized.toString();
}

function observationSemanticV4(
  observation: PooledReserveMintReservationRecoveryObservationV4,
): PooledReserveMintReservationRecoveryObservationV4Semantic {
  return {
    schema: observation.schema,
    reservation: { ...observation.reservation },
    source: { ...observation.source },
    classification: observation.classification,
  };
}

function assertPooledReserveMintReservationRecoveryIdentityV4(
  current: PooledReserveMintReservationRecoveryObservationV4,
  next: PooledReserveMintReservationRecoveryObservationV4Semantic,
): void {
  if (
    current.reservation.statementIdHex
      !== next.reservation.statementIdHex
    || current.reservation.profileIdHex !== next.reservation.profileIdHex
    || current.source.trustAnchorDigestHex
      !== next.source.trustAnchorDigestHex
    || current.source.bridgeRuntimeCodeSha256Hex
      !== next.source.bridgeRuntimeCodeSha256Hex
    || current.source.bridgeRuntimeCodeBytes
      !== next.source.bridgeRuntimeCodeBytes
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery identity conflicts with the current hold',
    );
  }
}

function assertPooledReserveMintReservationRecoveryTransitionV4(
  current: PooledReserveMintReservationRecoveryObservationV4,
  next: PooledReserveMintReservationRecoveryObservationV4Semantic,
  finalityContinuity:
    Readonly<PooledReserveMintReservationFinalityContinuityV4> | null,
): void {
  const currentHeight = BigInt(current.source.targetNativeHeight);
  const nextHeight = BigInt(next.source.targetNativeHeight);
  if (nextHeight < currentHeight) {
    throw new Error(
      'pooled-reserve mint-reservation recovery observation is out of order',
    );
  }
  if (
    nextHeight === currentHeight
    && !isPooledReserveMintReservationAdmissionProvenanceRefreshV4(
      current,
      next,
    )
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery has a same-height conflicting block or state',
    );
  }
  const currentFinalityHorizonHeight =
    BigInt(current.source.finalityHorizonHeight);
  const nextFinalityHorizonHeight =
    BigInt(next.source.finalityHorizonHeight);
  if (nextFinalityHorizonHeight < currentFinalityHorizonHeight) {
    throw new Error(
      'pooled-reserve mint-reservation recovery finality horizon regressed',
    );
  }
  if (nextFinalityHorizonHeight > currentFinalityHorizonHeight) {
    if (finalityContinuity === null) {
      throw new Error(
        'pooled-reserve mint-reservation recovery finality horizon advance lacks authenticated ancestry',
      );
    }
    assertPooledReserveMintReservationFinalityContinuityV4Binding(
      finalityContinuity,
      current,
      next,
    );
  } else if (finalityContinuity !== null) {
    throw new Error(
      'pooled-reserve mint-reservation recovery finality continuity is unexpected without a horizon advance',
    );
  } else if (
    next.source.finalityHorizonHashHex
      !== current.source.finalityHorizonHashHex
  ) {
    throw new Error(
      'pooled-reserve mint-reservation recovery finality horizon conflicts',
    );
  }

  const currentStatus = current.reservation.lifecycleStatus;
  const nextStatus = next.reservation.lifecycleStatus;
  if (currentStatus === 'pending' && nextStatus === 'absent') {
    throw new Error(
      'pooled-reserve mint-reservation pending state cannot roll back to absent',
    );
  }
  if (currentStatus === 'consumed' || currentStatus === 'invalidated') {
    if (nextStatus !== currentStatus) {
      throw new Error(
        'pooled-reserve mint-reservation terminal state cannot roll back or conflict',
      );
    }
  }
  if (
    currentStatus === nextStatus
    && currentStatus !== 'absent'
    && current.reservation.lifecycleRecordScaleHex
      !== next.reservation.lifecycleRecordScaleHex
  ) {
    throw new Error(
      'pooled-reserve mint-reservation lifecycle record conflicts with replay state',
    );
  }
}

function isPooledReserveMintReservationAdmissionProvenanceRefreshV4(
  current: PooledReserveMintReservationRecoveryObservationV4,
  next: PooledReserveMintReservationRecoveryObservationV4Semantic,
): boolean {
  const currentSemantic = observationSemanticV4(current);
  return canonicalJson({
    ...currentSemantic,
    reservation: {
      ...currentSemantic.reservation,
      admissionCandidateDigestHex:
        next.reservation.admissionCandidateDigestHex,
    },
  }) === canonicalJson(next);
}

function assertUnchangedPegInSettlementAuthority(
  before: string,
  after: string,
): void {
  if (after !== before) {
    throw new Error(
      'pooled-reserve mint-reservation recovery changed funds authority',
    );
  }
}

function assertSqliteBoolean(value: unknown, label: string): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) throw new Error(`${label} is invalid`);
}

function assertSameAuthenticatedV2RecoverySnapshot(
  left: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>,
  right: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>,
  label: string,
): void {
  const normalize = (value: typeof left, side: string) => ({
    idHex: normalizeFixedHex(value.idHex, 32, `${label} ${side} tip ID`),
    parentIdHex: normalizeFixedHex(value.parentIdHex, 32, `${label} ${side} parent ID`),
    height: normalizeNonnegativeSignedInt(value.height, `${label} ${side} tip height`),
    extensionRootHex: normalizeFixedHex(
      value.extensionRootHex,
      32,
      `${label} ${side} extension root`,
    ),
  });
  if (JSON.stringify(normalize(left, 'left')) !== JSON.stringify(normalize(right, 'right'))) {
    throw new Error(`${label} were captured at different Ergo snapshots`);
  }
}

function readCount(
  db: Database.Database,
  query: string,
  label: string,
): number {
  const row = db.prepare(query).get() as { count: number } | undefined;
  if (
    row === undefined
    || !Number.isSafeInteger(row.count)
    || row.count < 0
  ) {
    throw new Error(`${label} count is invalid`);
  }
  return row.count;
}

function pegInSettlementAuthorityState(db: Database.Database): string {
  return canonicalAuthorityState({
    pegIns: db.prepare(`
      SELECT * FROM peg_in_events ORDER BY id ASC
    `).all(),
    attempts: db.prepare(`
      SELECT * FROM aggregate_settlement_attempts ORDER BY id ASC
    `).all(),
    candidates: db.prepare(`
      SELECT * FROM authenticated_settlement_candidates ORDER BY candidate_id ASC
    `).all(),
    reservations: db.prepare(`
      SELECT * FROM authenticated_settlement_execution_reservations
      ORDER BY candidate_id ASC
    `).all(),
    submissionAttempts: db.prepare(`
      SELECT * FROM authenticated_settlement_submission_attempts
      ORDER BY candidate_id ASC
    `).all(),
  });
}

function canonicalAuthorityState(value: unknown): string {
  return JSON.stringify(value, (_key, field) => (
    typeof field === 'bigint' ? { bigint: field.toString() } : field
  ));
}
