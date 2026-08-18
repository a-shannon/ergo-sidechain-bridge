import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
} from '../../peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from '../../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
} from '../../substrate-federated-settlement-family-v1.js';
import {
  runErgoOperationalTransaction,
} from './ergo-operational-transaction.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  type ErgoOperationalExecutionResult,
} from '../../relayer-core/ergo-operational-transaction-lifecycle.js';
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
import { StateTracker } from '../../state-tracker.js';
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
  type SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
} from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  type SubstrateFederatedIsolatedDevnetPacketSessionV1,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  discoverSubstrateFederatedRewardInputsV2,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardInputDiscoveryV2,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt,
  SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1,
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from '../../substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
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
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
} from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
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

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-setup-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-candidate-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-execution-root.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-root.v1' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1';
const PEG_IN_CANDIDATE_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1';
const PEG_IN_SOURCE_LOCK_CHECK_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1';
const PEG_IN_SOURCE_LOCK_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1';
const STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_V1';
const PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_V1';
const PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_V1';
const PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_V1';
const PEG_IN_SOURCE_FUNDING_BOX_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_FUNDING_BOX_V1';
const FEDERATION_EPOCH = '1';
const MAX_ADMISSION_VALIDITY_BLOCKS = '64';
const CONFIRMATION_POLL_MS = 250;
const ACTION_COMPLETION_BUDGET_MS = 9 * 60_000;

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

type PegInActionV1 = 'candidate' | 'check-source-lock' | 'execute-source-lock';

interface ManagedCampaignExecutionV1 {
  readonly buildReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly managed: Readonly<{
    readonly value: Readonly<ExecutionActionResult>;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  }>;
}

async function runManagedCampaign(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input>,
  pegInPlan: Readonly<PegInCandidatePlanV1> | undefined,
  pegInAction: PegInActionV1 = 'candidate',
): Promise<Readonly<ManagedCampaignExecutionV1>> {
  const buildInput = input.build;
  const lifecycleInput = input.lifecycle;
  const built = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(
    buildInput,
  );
  assertCapabilityFreePlainData(built, 'isolated devnet node build result');
  deepFreeze(built);
  let setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2> | undefined;
  let packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1> | undefined;
  let nodeSession:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1>
    | undefined;
  let managed: ManagedCampaignExecutionV1['managed'] | undefined;
  const journalRoots = new Set<string>();
  let failure: unknown;

  try {
    setupSession =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const miningCredential =
      claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(
        setupSession,
      );
    packetSession = createSubstrateFederatedIsolatedDevnetPacketSessionV1(
      setupSession.signer,
    );
    assertPacketErgoSignerMatchesSetup(packetSession, setupSession.signer);
    const profilePins = deriveExpectedProfilePins(packetSession);
    nodeSession = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
      {
        javaExecutablePath: built.javaExecutablePath,
        expectedJavaExecutableSha256Hex:
          built.receipt.toolchain.javaExecutableSha256Hex,
        nodeAssemblyJarPath: built.nodeAssemblyJarPath,
        expectedNodeAssemblyJarSha256Hex:
          built.receipt.build.artifactSha256Hex,
        buildIdentityDigestHex: built.receipt.buildIdentityDigestHex,
      },
      nodeLaunchBinding(setupSession.signer),
      miningCredential,
    );
    await nodeSession.startMining();
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
      ),
    );
    assertCapabilityFreePlainData(managed, 'isolated devnet managed result');
    deepFreeze(managed);
    assertManagedCampaignBindings(built.receipt, managed);
  } catch (error) {
    failure = error;
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
      throw new AggregateError(
        [failure, ...teardownErrors],
        'isolated genesis setup execution failed and teardown was incomplete',
      );
    }
    throw failure;
  }
  if (teardownErrors.length > 0) {
    throw new AggregateError(
      teardownErrors,
      'isolated genesis setup execution teardown was incomplete',
    );
  }
  if (managed === undefined) {
    throw new Error('isolated genesis setup execution produced no result');
  }
  return Object.freeze({ buildReceipt: built.receipt, managed });
}

interface ExecutionActionResult {
  readonly lifecycle:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['lifecycle'];
  readonly transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'];
  readonly pegIn?:
    SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt['pegIn'];
}

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
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
  profilePins:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  journalRoots: Set<string>,
  pegInPlan: Readonly<PegInCandidatePlanV1> | undefined,
  pegInAction: PegInActionV1,
): Promise<Readonly<ExecutionActionResult>> {
  const completionDeadline = Date.now() + ACTION_COMPLETION_BUDGET_MS;
  const sourceHistory =
    await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(
      input.sourceHistory,
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
  const state = new StateTracker(join(localStateRoot, 'state-store'));
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
        ),
      );
      assertTransportExecution(execution, role, transaction);
      const confirmation = await waitForCanonicalConfirmation(
        observer,
        transaction.issuance.unsignedTransactionIdHex,
        completionDeadline,
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
    if (pegInPlan !== undefined) {
      pegIn = await buildManagedPegInCandidate(
        pegInPlan,
        setupSession,
        batch,
        target,
        Math.max(...finalTransactions.map(value => value.confirmationHeight)),
        pegInAction !== 'candidate',
      );
      if (pegInAction === 'check-source-lock') {
        discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(
          pegIn.sourceLockCheck!,
        );
      } else if (pegInAction === 'execute-source-lock') {
        pegIn = await executeManagedPegInSourceLock(
          pegIn,
          batch,
          target,
          setupSession,
          state,
          observer,
          completionDeadline,
        );
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
    });
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
  checkSourceLock: boolean,
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
  if (checkSourceLock) {
    sourceLockCheck = await setupSession.checkPegInSourceLock({
      sourceFundingBoxIdHex: sourceFundingInput.boxId,
      unsignedTransaction: packet.transactions.sourceLockCreation,
    }, target);
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
  state: StateTracker,
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
    submit: attempt => sourceLockTransport.submit(attempt),
  });
  assertSourceLockTransportExecution(execution, sourceLockCreation.txId);
  const confirmation = await waitForCanonicalConfirmation(
    observer,
    sourceLockCreation.txId,
    completionDeadline,
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
    transport,
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

async function waitForCanonicalConfirmation(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  expectedTxId: string,
  deadline: number,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>> {
  let lastObservationFailure: unknown;
  for (;;) {
    let rawObservation:
      SubstrateFederatedLocalDevnetGenesisConfirmation | null;
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
    if (rawObservation === null) {
      if (Date.now() >= deadline) {
        throw new Error(
          'isolated genesis transaction confirmation remained unavailable before the managed deadline',
          lastObservationFailure === undefined
            ? undefined
            : { cause: lastObservationFailure },
        );
      }
      await delay(CONFIRMATION_POLL_MS);
      continue;
    }
    const observation =
      normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
        rawObservation,
      );
    if (
      observation.status === 'confirmed'
      && observation.confirmationHeight !== null
      && observation.confirmationHeaderIdHex !== null
    ) {
      return observation;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `isolated genesis transaction remained ${observation.status} before the managed deadline`,
      );
    }
    await delay(CONFIRMATION_POLL_MS);
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

function finalizeReceipt<T extends object>(
  body: T,
  digestDomain: string,
): Readonly<T & { readonly receiptDigestHex: string }> {
  assertCapabilityFreePlainData(body, 'isolated devnet receipt body');
  assertNoLocalPathValue(body);
  deepFreeze(body);
  const receipt = {
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, digestDomain),
  };
  assertCapabilityFreePlainData(receipt, 'isolated devnet receipt');
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
