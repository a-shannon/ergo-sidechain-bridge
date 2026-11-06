import { createHash } from 'node:crypto';

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
  type SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
import {
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
} from '../bridge-validity-tracker-header-context-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  decodePegInSourceIntentV2Hex,
} from '../peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA,
} from '../substrate-federated-tracker-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import {
  assertNoLocalPathValue,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-worker-receipt.v6' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6';
const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6';

const EXPECTED_ROOT_CHECKS = Object.freeze({
  setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
    true,
  exactObserved0401AnchorConsumedByTrackerCandidate: true,
  exactCheckpointBoundActiveTargetConsumedByTrackerCheck: true,
  exactConfirmedTrackerSetupOutputConsumed: true,
  exactSameProcessTrackerCompilerReceiptConsumed: true,
  localWasmSignatureAcceptedBySameTargetJvmCheck: true,
  everyEphemeralCapabilityDisposedBeforeReturn: true,
  returnedValueContainsCapabilities: false,
});

const EXPECTED_ROOT_BOUNDARIES = Object.freeze({
  localIsolatedDevnetOnly: true,
  localSetupAndPegInBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  frontierApplicationBurnExecuted: true,
  federatedCheckpointAttestationEstablished: true,
  localErgoCheckpointAnchorObserved: true,
  checkpointBoundTrackerExecutionObserved: true,
  trackerCandidateConstructed: true,
  trackerJvmReductionAccepted: true,
  trackerNodeCheckPerformed: true,
  trackerSigningPerformed: true,
  signedTrackerBytesPersisted: false,
  deterministicSourceFinalityEstablished: false,
  ergoPowAuthenticated: false,
  trackerAdmissionEstablished: false,
  globalReplayInsertionEstablished: false,
  payoutAuthorized: false,
  trackerSubmissionPerformed: false,
  trackerBroadcastPerformed: false,
  publicNetworkUsed: false,
  realFundsUsed: false,
  existingWalletMaterialUsed: false,
  processLossRecoveryEstablished: false,
  profileActivated: false,
  mintAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
});

const EXPECTED_WORKER_CHECKS = Object.freeze({
  exactRootReceiptDigestVerified: true,
  processProvenApplicationCheckpointVerified: true,
  exactPegInPlanBoundToMintStatement: true,
  committedReserveBoundToFreshCheckpointAdmission: true,
  mintBurnAndCheckpointProjectionBound: true,
  exactObserved0401AnchorBound: true,
  exactActiveTrackerTargetBound: true,
  exactTrackerInputCandidateAndCheckBound: true,
  localSignatureAndJvmCheckIdentitiesBound: true,
  localPathsAndCapabilitiesExcluded: true,
});

const EXPECTED_WORKER_BOUNDARIES = Object.freeze({
  localIsolatedDevnetOnly: true,
  localSetupAndPegInBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  frontierApplicationBurnExecuted: true,
  federatedCheckpointAttestationEstablished: true,
  localErgoCheckpointAnchorObserved: true,
  checkpointBoundTrackerExecutionObserved: true,
  trackerCandidateConstructed: true,
  trackerJvmReductionAccepted: true,
  trackerNodeCheckPerformed: true,
  trackerSigningPerformed: true,
  signedTrackerBytesPersisted: false,
  deterministicSourceFinalityEstablished: false,
  ergoPowAuthenticated: false,
  trackerAdmissionEstablished: false,
  globalReplayInsertionEstablished: false,
  payoutAuthorized: false,
  trackerSubmissionPerformed: false,
  trackerBroadcastPerformed: false,
  publicNetworkUsed: false,
  realFundsUsed: false,
  existingWalletMaterialUsed: false,
  processLossRecoveryEstablished: false,
  profileActivated: false,
  mintAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
});

export interface SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6_SCHEMA;
  readonly version: 6;
  readonly status:
    'request_bound_local_observed_anchor_tracker_check_campaign_completed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly rootReceiptDigestHex: string;
  readonly execution: Readonly<{
    readonly executionTargetIdentityDigestHex: string;
    readonly committedVaultTransactionIdHex: string;
    readonly reserveSuccessorBoxIdHex: string;
    readonly checkpointAdmissionObservationDigestHex: string;
    readonly checkpointAdmissionObservedAtHeight: number;
  }>;
  readonly proof: Readonly<{
    readonly sourceTargetDescriptorDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly mintReservationDraftDigestHex: string;
    readonly mintReservationStatementIdHex: string;
    readonly mintIdentityHex: string;
    readonly sourceEvidenceReceiptDigestHex: string;
    readonly mintSourceProofReceiptDigestHex: string;
  }>;
  readonly application: Readonly<{
    readonly applicationRunnerReceiptDigestHex: string;
    readonly applicationEvidenceReceiptDigestHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly sourceNativeBlockHeight: string;
    readonly sourceNativeBlockHashHex: string;
    readonly executionBlockHashHex: string;
    readonly burnIdHex: string;
    readonly burnLeafHashHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly amountNanoErg: string;
    readonly recipientErgoTreeHashHex: string;
  }>;
  readonly checkpoint: Readonly<{
    readonly packetCheckpointReceiptDigestHex: string;
    readonly federatedAttestationDigestHex: string;
    readonly statementIdHex: string;
    readonly admissionValidFromErgoHeight: string;
    readonly admissionExpiresAtErgoHeight: string;
  }>;
  readonly anchor: Readonly<{
    readonly extensionKeyHex: '0401';
    readonly extensionValueHex: string;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly observationDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly trackerSetup: Readonly<{
    readonly transactionIdHex: string;
    readonly outputBoxIdHex: string;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
  }>;
  readonly trackerObservation: Readonly<{
    readonly observationDigestHex: string;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly anchorContextIndex: number;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly tipHeight: number;
    readonly tipIdHex: string;
  }>;
  readonly trackerCandidate: Readonly<{
    readonly contractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly statementIdHex: string;
    readonly inputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueSha256Hex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly anchorContextProvenance:
      typeof BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE;
    readonly contextExtensionSha256Hex: string;
    readonly prooflessTransactionBytes: number;
    readonly unsignedTransactionIdHex: string;
  }>;
  readonly trackerCheck: Readonly<{
    readonly receiptDigestHex: string;
    readonly inputBoxIdHex: string;
    readonly statementIdHex: string;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorContextIndex: number;
    readonly unsignedTransactionIdHex: string;
    readonly unsignedTransactionDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly signedTransactionIdHex: string;
    readonly signedTransactionCanonicalJsonSha256Hex: string;
    readonly signedTransactionBytesSha256Hex: string;
    readonly signedTransactionBytesLength: number;
    readonly checkResponseSha256Hex: string;
    readonly signerPublicKeyHex: string;
    readonly signerP2pkErgoTreeHex: string;
    readonly signingContextTipHeight: number;
    readonly signingContextTipIdHex: string;
  }>;
  readonly checks: Readonly<typeof EXPECTED_WORKER_CHECKS>;
  readonly boundaries: Readonly<typeof EXPECTED_WORKER_BOUNDARIES>;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt
  >,
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6
> {
  validateRoot(root, pegIn);
  fixedHex(commandRequestSha256Hex, 32, 'command request digest');
  const applicationRoot = root.application.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    applicationRoot,
  );
  const runner = applicationRoot.applicationRunner;
  const evidence = runner.executionResult.applicationEvidence;
  const checkpoint = applicationRoot.checkpoint.checkpointAttestation;
  const statement = checkpoint.checkpointStatement;
  const sourceProof = applicationRoot.mintSourceProof.sourceProof;
  const draft = root.application.draft;
  const committedVault = root.pegIn.committedVaultExecution;
  const admission = root.application.checkpointAdmissionObservation;
  const anchor = root.checkpointAnchor;
  const tracker = root.tracker;
  const activeObservation = tracker.observation;
  const candidate = tracker.candidate;
  const check = tracker.check;
  const activeTip = activeObservation.headers[0];
  if (
    committedVault === undefined
    || admission.expectedTxId !== committedVault.expectedTxId
    || admission.confirmationHeight !== committedVault.confirmationHeight
    || admission.confirmationHeaderIdHex
      !== committedVault.confirmationHeaderIdHex
    || admission.observedAtHeight < admission.confirmationHeight
    || statement.admissionValidFromErgoHeight
      !== admission.observedAtHeight.toString()
    || BigInt(statement.admissionExpiresAtErgoHeight)
      <= BigInt(statement.admissionValidFromErgoHeight)
    || applicationRoot.binding.packetReceiptDigestHex
      !== applicationRoot.packet.receipt.receiptDigestHex
    || applicationRoot.binding.targetDescriptorDigestHex
      !== applicationRoot.packet.receipt.targetDescriptorDigestHex
    || applicationRoot.binding.mintSourceProofReceiptDigestHex
      !== applicationRoot.mintSourceProof.receiptDigestHex
    || applicationRoot.binding.applicationRunnerReceiptDigestHex
      !== runner.receiptDigestHex
    || applicationRoot.binding.checkpointReceiptDigestHex
      !== applicationRoot.checkpoint.receiptDigestHex
    || applicationRoot.binding.burnIdHex !== evidence.burn.burnIdHex
    || applicationRoot.binding.bridgeEventRootHex
      !== evidence.burn.bridgeEventRootHex
    || sourceProof.mintReservationDraftDigestHex !== draft.draftDigestHex
    || sourceProof.mintReservationStatementIdHex !== draft.statementIdHex
    || sourceProof.mintIdentityHex !== draft.reservationKeyHex
    || sourceProof.sourceEvidenceReceiptDigestHex
      !== root.application.evidenceReceipt.receiptDigestHex
    || draft.statement.successorReserveBoxIdHex
      !== `0x${committedVault.outputObservation.reserveSuccessorBoxIdHex}`
    || statement.sourceNativeBlockHeight
      !== evidence.sourceNativeBlock.height.toString()
    || statement.sourceNativeBlockHashHex
      !== unprefixedWireHex(
        evidence.sourceNativeBlock.hashHex,
        32,
        'application source native block hash',
      )
    || statement.executionBlockHashHex
      !== unprefixedWireHex(
        evidence.execution.blockHashHex,
        32,
        'application execution block hash',
      )
    || statement.bridgeEventRootHex
      !== unprefixedWireHex(
        evidence.burn.bridgeEventRootHex,
        32,
        'application bridge event root',
      )
    || statement.sidechainIdHex
      !== unprefixedWireHex(
        evidence.execution.sidechainIdHex,
        32,
        'application sidechain ID',
      )
    || statement.bridgeAddressHex
      !== unprefixedWireHex(
        evidence.application.bridgeAddressHex,
        20,
        'application bridge address',
      )
    || statement.tokenAddressHex
      !== unprefixedWireHex(
        evidence.application.tokenAddressHex,
        20,
        'application token address',
      )
    || statement.burnLeafCount !== evidence.burn.burnLeafCount
    || anchor.mining.extensionKeyHex !== '0401'
    || anchor.mining.extensionValueHex
      !== `${statement.bridgeEventRootHex}${statement.statementIdHex}`
    || anchor.observation.extensionKeyHex !== '0401'
    || anchor.mining.extensionValueHex !== anchor.observation.extensionValueHex
    || anchor.mining.processBindingDigestHex
      !== anchor.observation.processBindingDigestHex
    || anchor.mining.executionTargetIdentityDigestHex
      !== anchor.observation.executionTargetIdentityDigestHex
    || root.process.executionTargetIdentityDigestHex
      !== anchor.mining.executionTargetIdentityDigestHex
    || anchor.mining.finalSnapshot.headerIdHex
      !== anchor.observation.anchorHeaderIdHex
    || anchor.mining.finalSnapshot.fullHeight
      !== anchor.observation.anchorHeight
    || tracker.execution.extensionKeyHex !== anchor.mining.extensionKeyHex
    || tracker.execution.extensionValueHex !== anchor.mining.extensionValueHex
    || tracker.execution.extensionFieldsSha256Hex
      !== anchor.mining.extensionFieldsSha256Hex
    || tracker.execution.executionTargetIdentityDigestHex
      !== anchor.mining.executionTargetIdentityDigestHex
    || tracker.execution.primaryMiningDuringAction !== true
    || tracker.execution.witnessReadOnlyDuringAction !== true
    || tracker.execution.checkpointExtensionBoundDuringAction !== true
    || tracker.execution.trackerAdmissionMiningCredentialConsumedOnce !== true
    || tracker.execution.checkpointSnapshotRevalidatedOnBothNodes !== true
    || activeObservation.anchorHeaderIdHex
      !== anchor.observation.anchorHeaderIdHex
    || activeObservation.anchorHeight !== anchor.observation.anchorHeight
    || activeObservation.anchorExtensionRootHex
      !== anchor.observation.anchorExtensionRootHex
    || activeObservation.extensionValueHex
      !== anchor.observation.extensionValueHex
    || activeObservation.processBindingDigestHex
      !== tracker.execution.processBindingDigestHex
    || activeObservation.executionTargetIdentityDigestHex
      !== tracker.execution.executionTargetIdentityDigestHex
    || activeObservation.headers.length !== 10
    || activeTip === undefined
    || activeObservation.boundaries.primaryAndWitnessAgreed !== true
    || activeObservation.boundaries.primaryMiningDuringObservation !== true
    || activeObservation.boundaries.checkpointBoundActiveTarget !== true
    || activeObservation.boundaries.exactCheckpointRetainedInCurrentContext
      !== true
    || activeObservation.boundaries.exactExtensionMembershipRecomputed !== true
    || activeObservation.boundaries.ergoPowAuthenticated !== false
    || activeObservation.boundaries.trackerAdmissionEstablished !== false
    || activeObservation.boundaries.signingPerformed !== false
    || activeObservation.boundaries.submissionPerformed !== false
    || activeObservation.boundaries.broadcastPerformed !== false
    || activeObservation.boundaries.fundsAuthorityEstablished !== false
    || activeObservation.boundaries.gate5Closed !== false
    || activeObservation.boundaries.trustlessStatusEstablished !== false
    || candidate.schema !== SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA
    || candidate.version !== 1
    || candidate.trustModel !== 'federated_non_trustless'
    || candidate.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || candidate.inputBoxIdHex !== tracker.trackerSetup.outputBoxIdHex
    || candidate.statementIdHex !== statement.statementIdHex
    || candidate.anchorHeaderIdHex !== activeObservation.anchorHeaderIdHex
    || candidate.anchorHeaderHeight !== activeObservation.anchorHeight
    || candidate.anchorExtensionRootHex
      !== activeObservation.anchorExtensionRootHex
    || candidate.anchorContextIndex !== activeObservation.anchorContextIndex
    || check.status !== 'PASS'
    || check.trackerInputBoxIdHex !== candidate.inputBoxIdHex
    || check.statementIdHex !== candidate.statementIdHex
    || check.anchorHeaderIdHex !== candidate.anchorHeaderIdHex
    || check.anchorHeight !== candidate.anchorHeaderHeight
    || check.anchorContextIndex !== candidate.anchorContextIndex
    || check.unsignedTransactionIdHex !== candidate.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== candidate.unsignedTransactionIdHex
    || check.target.processBindingDigestHex
      !== tracker.execution.processBindingDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== tracker.execution.executionTargetIdentityDigestHex
    || check.signer.derivation !== 'wasm-root'
    || check.signer.stateContextTipHeight !== activeTip.height
    || check.signer.stateContextTipIdHex !== activeTip.idHex
    || check.checker.path !== '/transactions/check'
    || check.checker.method !== 'POST'
    || check.checker.transportPolicy !== 'no-redirect-no-proxy'
    || check.boundaries.localIsolatedDevnetOnly !== true
    || check.boundaries.checkpointBoundActiveTarget !== true
    || check.boundaries.observedAnchorContextBound !== true
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
      'observed-anchor-tracker-check campaign producer-to-consumer binding changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6_SCHEMA,
    version: 6 as const,
    status:
      'request_bound_local_observed_anchor_tracker_check_campaign_completed' as const,
    commandRequestSha256Hex,
    pegIn,
    rootReceiptDigestHex: root.receiptDigestHex,
    execution: {
      executionTargetIdentityDigestHex:
        root.process.executionTargetIdentityDigestHex,
      committedVaultTransactionIdHex: committedVault.expectedTxId,
      reserveSuccessorBoxIdHex:
        committedVault.outputObservation.reserveSuccessorBoxIdHex,
      checkpointAdmissionObservationDigestHex:
        admission.observationDigestHex,
      checkpointAdmissionObservedAtHeight: admission.observedAtHeight,
    },
    proof: {
      sourceTargetDescriptorDigestHex:
        applicationRoot.binding.targetDescriptorDigestHex,
      packetReceiptDigestHex: applicationRoot.packet.receipt.receiptDigestHex,
      mintReservationDraftDigestHex: root.application.draft.draftDigestHex,
      mintReservationStatementIdHex: root.application.draft.statementIdHex,
      mintIdentityHex: root.application.draft.reservationKeyHex,
      sourceEvidenceReceiptDigestHex:
        root.application.evidenceReceipt.receiptDigestHex,
      mintSourceProofReceiptDigestHex:
        applicationRoot.mintSourceProof.receiptDigestHex,
    },
    application: {
      applicationRunnerReceiptDigestHex: runner.receiptDigestHex,
      applicationEvidenceReceiptDigestHex: evidence.receiptDigestHex,
      bridgeAddressHex: evidence.application.bridgeAddressHex,
      tokenAddressHex: evidence.application.tokenAddressHex,
      sourceNativeBlockHeight: evidence.sourceNativeBlock.height.toString(),
      sourceNativeBlockHashHex: evidence.sourceNativeBlock.hashHex,
      executionBlockHashHex: evidence.execution.blockHashHex,
      burnIdHex: evidence.burn.burnIdHex,
      burnLeafHashHex: evidence.burn.burnLeafHashHex,
      bridgeEventRootHex: evidence.burn.bridgeEventRootHex,
      burnLeafCount: evidence.burn.burnLeafCount,
      amountNanoErg: evidence.burn.amountNanoErg,
      recipientErgoTreeHashHex: evidence.burn.recipientErgoTreeHashHex,
    },
    checkpoint: {
      packetCheckpointReceiptDigestHex: applicationRoot.checkpoint.receiptDigestHex,
      federatedAttestationDigestHex: checkpoint.attestationDigestHex,
      statementIdHex: statement.statementIdHex,
      admissionValidFromErgoHeight: statement.admissionValidFromErgoHeight,
      admissionExpiresAtErgoHeight: statement.admissionExpiresAtErgoHeight,
    },
    anchor: {
      extensionKeyHex: anchor.observation.extensionKeyHex,
      extensionValueHex: anchor.observation.extensionValueHex,
      anchorHeaderIdHex: anchor.observation.anchorHeaderIdHex,
      anchorHeight: anchor.observation.anchorHeight,
      anchorExtensionRootHex: anchor.observation.anchorExtensionRootHex,
      observationDigestHex: anchor.observation.observationDigestHex,
      processBindingDigestHex: anchor.observation.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        anchor.observation.executionTargetIdentityDigestHex,
    },
    trackerSetup: {
      transactionIdHex: tracker.trackerSetup.expectedTxId,
      outputBoxIdHex: tracker.trackerSetup.outputBoxIdHex,
      confirmationDigestHex: tracker.trackerSetup.confirmationDigestHex,
      confirmationHeight: tracker.trackerSetup.confirmationHeight,
      confirmationHeaderIdHex:
        tracker.trackerSetup.confirmationHeaderIdHex,
    },
    trackerObservation: {
      observationDigestHex: activeObservation.observationDigestHex,
      anchorHeaderIdHex: activeObservation.anchorHeaderIdHex,
      anchorHeight: activeObservation.anchorHeight,
      anchorExtensionRootHex: activeObservation.anchorExtensionRootHex,
      anchorContextIndex: activeObservation.anchorContextIndex,
      processBindingDigestHex: activeObservation.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        activeObservation.executionTargetIdentityDigestHex,
      tipHeight: activeTip.height,
      tipIdHex: activeTip.idHex,
    },
    trackerCandidate: {
      contractIdHex: candidate.contractIdHex,
      trackerNftIdHex: candidate.trackerNftIdHex,
      statementIdHex: candidate.statementIdHex,
      inputBoxIdHex: candidate.inputBoxIdHex,
      trackerKeyHex: candidate.trackerKeyHex,
      trackerValueSha256Hex: sha256HexBytes(
        candidate.trackerValueHex,
        'tracker value',
      ),
      inputDigestHex: candidate.inputDigestHex,
      successorDigestHex: candidate.successorDigestHex,
      currentErgoHeight: candidate.currentErgoHeight,
      anchorContextIndex: candidate.anchorContextIndex,
      anchorHeaderIdHex: candidate.anchorHeaderIdHex,
      anchorHeight: candidate.anchorHeaderHeight,
      anchorExtensionRootHex: candidate.anchorExtensionRootHex,
      anchorContextProvenance: candidate.anchorContextProvenance,
      contextExtensionSha256Hex: sha256HexBytes(
        candidate.contextExtensionSerializedHex,
        'tracker context extension',
      ),
      prooflessTransactionBytes: candidate.prooflessTransactionBytes,
      unsignedTransactionIdHex: candidate.unsignedTransactionIdHex,
    },
    trackerCheck: {
      receiptDigestHex: check.receiptDigestHex,
      inputBoxIdHex: check.trackerInputBoxIdHex,
      statementIdHex: check.statementIdHex,
      anchorHeaderIdHex: check.anchorHeaderIdHex,
      anchorHeight: check.anchorHeight,
      anchorContextIndex: check.anchorContextIndex,
      unsignedTransactionIdHex: check.unsignedTransactionIdHex,
      unsignedTransactionDigestHex: check.unsignedTransactionDigestHex,
      processBindingDigestHex: check.target.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        check.target.executionTargetIdentityDigestHex,
      signedTransactionIdHex: check.signedTransactionIdHex,
      signedTransactionCanonicalJsonSha256Hex:
        check.signedTransactionCanonicalJsonSha256Hex,
      signedTransactionBytesSha256Hex:
        check.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: check.signedTransactionBytesLength,
      checkResponseSha256Hex: check.checkResponseSha256Hex,
      signerPublicKeyHex: check.signer.publicKeyHex,
      signerP2pkErgoTreeHex: check.signer.p2pkErgoTreeHex,
      signingContextTipHeight: check.signer.stateContextTipHeight,
      signingContextTipIdHex: check.signer.stateContextTipIdHex,
    },
    checks: EXPECTED_WORKER_CHECKS,
    boundaries: EXPECTED_WORKER_BOUNDARIES,
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'observed-anchor-tracker-check campaign worker receipt');
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('observed-anchor-tracker-check campaign worker output is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'observed-anchor-tracker-check campaign worker output is not canonical JSON',
    );
  }
  const receipt = exactRecord(parsed, [
    'anchor',
    'application',
    'boundaries',
    'checkpoint',
    'checks',
    'commandRequestSha256Hex',
    'execution',
    'pegIn',
    'proof',
    'receiptDigestHex',
    'rootReceiptDigestHex',
    'schema',
    'status',
    'trackerCandidate',
    'trackerCheck',
    'trackerObservation',
    'trackerSetup',
    'version',
  ], 'observed-anchor-tracker-check campaign worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6_SCHEMA
    || receipt.version !== 6
    || receipt.status
      !== 'request_bound_local_observed_anchor_tracker_check_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
  ) {
    throw new Error('observed-anchor-tracker-check campaign worker identity changed');
  }
  assertPegInPlan(receipt.pegIn, expectedPegIn);
  fixedHex(receipt.rootReceiptDigestHex, 32, 'root receipt digest');
  validateExecutionProjection(receipt.execution);
  validateProofProjection(receipt.proof);
  validateApplicationProjection(receipt.application);
  validateCheckpointProjection(receipt.checkpoint);
  validateAnchorProjection(receipt.anchor);
  validateTrackerSetupProjection(receipt.trackerSetup);
  validateTrackerObservationProjection(receipt.trackerObservation);
  validateTrackerCandidateProjection(receipt.trackerCandidate);
  validateTrackerCheckProjection(receipt.trackerCheck);
  validateReceiptProjectionBindings(receipt);
  assertExpectedBooleanRecord(
    receipt.checks,
    EXPECTED_WORKER_CHECKS,
    'observed-anchor-tracker-check campaign worker checks',
  );
  assertExpectedBooleanRecord(
    receipt.boundaries,
    EXPECTED_WORKER_BOUNDARIES,
    'observed-anchor-tracker-check campaign worker boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'worker receipt digest')
      !== sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('observed-anchor-tracker-check campaign worker digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'observed-anchor-tracker-check campaign worker receipt');
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6
  >;
}

function validateRoot(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt
  >,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  if (
    root.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA
    || root.version !== 6
    || root.status
      !== 'observed_anchor_tracker_candidate_accepted_by_local_node_check'
    || root.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6
  ) {
    throw new Error('observed-anchor-tracker-check campaign root identity changed');
  }
  const { receiptDigestHex, ...body } = root;
  if (
    fixedHex(receiptDigestHex, 32, 'root receipt digest')
      !== sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('observed-anchor-tracker-check campaign root digest changed');
  }
  assertExpectedBooleanRecord(root.checks, EXPECTED_ROOT_CHECKS, 'root checks');
  assertExpectedBooleanRecord(
    root.boundaries,
    EXPECTED_ROOT_BOUNDARIES,
    'root boundaries',
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(
    root.application.draft.statement.sourceIntentHex,
  );
  if (
    sourceIntent.amountNanoErg.toString() !== pegIn.amountNanoErg
    || sourceIntent.recipientAddressHex !== `0x${pegIn.recipientAddressHex}`
  ) {
    throw new Error('peg-in plan differs from observed-anchor-tracker-check root');
  }
}

function validateExecutionProjection(value: unknown): void {
  const record = exactRecord(value, [
    'checkpointAdmissionObservationDigestHex',
    'checkpointAdmissionObservedAtHeight',
    'committedVaultTransactionIdHex',
    'executionTargetIdentityDigestHex',
    'reserveSuccessorBoxIdHex',
  ], 'observed-anchor-tracker-check execution projection');
  fixedHex(record.checkpointAdmissionObservationDigestHex, 32, 'checkpoint admission observation digest');
  fixedHex(record.committedVaultTransactionIdHex, 32, 'committed-vault transaction id');
  fixedHex(record.executionTargetIdentityDigestHex, 32, 'execution target identity digest');
  fixedHex(record.reserveSuccessorBoxIdHex, 32, 'reserve successor box id');
  positiveSafeInteger(record.checkpointAdmissionObservedAtHeight, 'checkpoint admission height');
}

function validateProofProjection(value: unknown): void {
  const record = exactRecord(value, [
    'mintIdentityHex',
    'mintReservationDraftDigestHex',
    'mintReservationStatementIdHex',
    'mintSourceProofReceiptDigestHex',
    'packetReceiptDigestHex',
    'sourceTargetDescriptorDigestHex',
    'sourceEvidenceReceiptDigestHex',
  ], 'observed-anchor-tracker-check proof projection');
  for (const key of [
    'mintReservationDraftDigestHex',
    'mintSourceProofReceiptDigestHex',
    'packetReceiptDigestHex',
    'sourceEvidenceReceiptDigestHex',
    'sourceTargetDescriptorDigestHex',
  ] as const) {
    fixedHex(record[key], 32, `proof projection ${key}`);
  }
  fixedWireHex(record.mintReservationStatementIdHex, 32, 'mint reservation statement ID');
  fixedWireHex(record.mintIdentityHex, 32, 'mint identity');
}

function validateApplicationProjection(value: unknown): void {
  const record = exactRecord(value, [
    'amountNanoErg',
    'applicationEvidenceReceiptDigestHex',
    'applicationRunnerReceiptDigestHex',
    'bridgeAddressHex',
    'bridgeEventRootHex',
    'burnIdHex',
    'burnLeafCount',
    'burnLeafHashHex',
    'executionBlockHashHex',
    'recipientErgoTreeHashHex',
    'sourceNativeBlockHashHex',
    'sourceNativeBlockHeight',
    'tokenAddressHex',
  ], 'observed-anchor-tracker-check application projection');
  for (const key of [
    'applicationEvidenceReceiptDigestHex',
    'applicationRunnerReceiptDigestHex',
  ] as const) {
    fixedHex(record[key], 32, `application projection ${key}`);
  }
  for (const key of [
    'bridgeEventRootHex',
    'burnIdHex',
    'burnLeafHashHex',
    'executionBlockHashHex',
    'recipientErgoTreeHashHex',
    'sourceNativeBlockHashHex',
  ] as const) {
    fixedWireHex(record[key], 32, `application projection ${key}`);
  }
  fixedWireHex(record.bridgeAddressHex, 20, 'application bridge address');
  fixedWireHex(record.tokenAddressHex, 20, 'application token address');
  canonicalPositiveIntegerString(record.amountNanoErg, 'application amount');
  canonicalPositiveIntegerString(record.sourceNativeBlockHeight, 'source native block height');
  positiveSafeInteger(record.burnLeafCount, 'burn leaf count');
}

function validateCheckpointProjection(value: unknown): void {
  const record = exactRecord(value, [
    'admissionExpiresAtErgoHeight',
    'admissionValidFromErgoHeight',
    'federatedAttestationDigestHex',
    'packetCheckpointReceiptDigestHex',
    'statementIdHex',
  ], 'observed-anchor-tracker-check checkpoint projection');
  fixedHex(record.federatedAttestationDigestHex, 32, 'federated attestation digest');
  fixedHex(record.packetCheckpointReceiptDigestHex, 32, 'packet checkpoint receipt digest');
  fixedHex(record.statementIdHex, 32, 'checkpoint statement id');
  const validFrom = canonicalPositiveIntegerString(
    record.admissionValidFromErgoHeight,
    'checkpoint admission valid-from height',
  );
  const expiresAt = canonicalPositiveIntegerString(
    record.admissionExpiresAtErgoHeight,
    'checkpoint admission expiry height',
  );
  if (expiresAt <= validFrom) {
    throw new Error('checkpoint admission window is invalid');
  }
}

function validateAnchorProjection(value: unknown): void {
  const record = exactRecord(value, [
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'anchorHeight',
    'executionTargetIdentityDigestHex',
    'extensionKeyHex',
    'extensionValueHex',
    'observationDigestHex',
    'processBindingDigestHex',
  ], 'observed-anchor projection');
  if (record.extensionKeyHex !== '0401') {
    throw new Error('observed-anchor extension key changed');
  }
  for (const key of [
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'executionTargetIdentityDigestHex',
    'observationDigestHex',
    'processBindingDigestHex',
  ] as const) {
    fixedHex(record[key], 32, `observed-anchor ${key}`);
  }
  fixedHex(record.extensionValueHex, 64, 'observed-anchor extension value');
  positiveSafeInteger(record.anchorHeight, 'observed-anchor height');
}

function validateTrackerSetupProjection(value: unknown): void {
  const record = exactRecord(value, [
    'confirmationDigestHex',
    'confirmationHeaderIdHex',
    'confirmationHeight',
    'outputBoxIdHex',
    'transactionIdHex',
  ], 'tracker setup projection');
  for (const key of [
    'confirmationDigestHex',
    'confirmationHeaderIdHex',
    'outputBoxIdHex',
    'transactionIdHex',
  ] as const) {
    fixedHex(record[key], 32, `tracker setup ${key}`);
  }
  positiveSafeInteger(record.confirmationHeight, 'tracker setup confirmation height');
}

function validateTrackerObservationProjection(value: unknown): void {
  const record = exactRecord(value, [
    'anchorContextIndex',
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'anchorHeight',
    'executionTargetIdentityDigestHex',
    'observationDigestHex',
    'processBindingDigestHex',
    'tipHeight',
    'tipIdHex',
  ], 'tracker observation projection');
  for (const key of [
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'executionTargetIdentityDigestHex',
    'observationDigestHex',
    'processBindingDigestHex',
    'tipIdHex',
  ] as const) {
    fixedHex(record[key], 32, `tracker observation ${key}`);
  }
  nonNegativeSafeInteger(record.anchorContextIndex, 'tracker observation anchor context index');
  positiveSafeInteger(record.anchorHeight, 'tracker observation anchor height');
  positiveSafeInteger(record.tipHeight, 'tracker observation tip height');
}

function validateTrackerCandidateProjection(value: unknown): void {
  const record = exactRecord(value, [
    'anchorContextIndex',
    'anchorContextProvenance',
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'anchorHeight',
    'contextExtensionSha256Hex',
    'contractIdHex',
    'currentErgoHeight',
    'inputBoxIdHex',
    'inputDigestHex',
    'prooflessTransactionBytes',
    'statementIdHex',
    'successorDigestHex',
    'trackerKeyHex',
    'trackerNftIdHex',
    'trackerValueSha256Hex',
    'unsignedTransactionIdHex',
  ], 'tracker candidate projection');
  if (
    record.anchorContextProvenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
  ) {
    throw new Error('tracker candidate observed-header provenance changed');
  }
  for (const key of [
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'contextExtensionSha256Hex',
    'contractIdHex',
    'inputBoxIdHex',
    'statementIdHex',
    'trackerKeyHex',
    'trackerNftIdHex',
    'trackerValueSha256Hex',
    'unsignedTransactionIdHex',
  ] as const) {
    fixedHex(record[key], 32, `tracker candidate ${key}`);
  }
  fixedHex(record.inputDigestHex, 33, 'tracker input digest');
  fixedHex(record.successorDigestHex, 33, 'tracker successor digest');
  positiveSafeInteger(record.currentErgoHeight, 'tracker current Ergo height');
  nonNegativeSafeInteger(record.anchorContextIndex, 'tracker anchor context index');
  positiveSafeInteger(record.anchorHeight, 'tracker anchor height');
  positiveSafeInteger(record.prooflessTransactionBytes, 'tracker proofless transaction bytes');
}

function validateTrackerCheckProjection(value: unknown): void {
  const record = exactRecord(value, [
    'anchorContextIndex',
    'anchorHeaderIdHex',
    'anchorHeight',
    'checkResponseSha256Hex',
    'executionTargetIdentityDigestHex',
    'inputBoxIdHex',
    'processBindingDigestHex',
    'receiptDigestHex',
    'signedTransactionBytesLength',
    'signedTransactionBytesSha256Hex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionIdHex',
    'signerP2pkErgoTreeHex',
    'signerPublicKeyHex',
    'signingContextTipHeight',
    'signingContextTipIdHex',
    'statementIdHex',
    'unsignedTransactionDigestHex',
    'unsignedTransactionIdHex',
  ], 'tracker check projection');
  for (const key of [
    'anchorHeaderIdHex',
    'checkResponseSha256Hex',
    'executionTargetIdentityDigestHex',
    'inputBoxIdHex',
    'processBindingDigestHex',
    'receiptDigestHex',
    'signedTransactionBytesSha256Hex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionIdHex',
    'signingContextTipIdHex',
    'statementIdHex',
    'unsignedTransactionDigestHex',
    'unsignedTransactionIdHex',
  ] as const) {
    fixedHex(record[key], 32, `tracker check ${key}`);
  }
  fixedHex(record.signerPublicKeyHex, 33, 'tracker signer public key');
  evenLowerHex(record.signerP2pkErgoTreeHex, 'tracker signer P2PK ErgoTree');
  nonNegativeSafeInteger(record.anchorContextIndex, 'tracker check anchor context index');
  positiveSafeInteger(record.anchorHeight, 'tracker check anchor height');
  positiveSafeInteger(record.signedTransactionBytesLength, 'signed tracker transaction bytes');
  positiveSafeInteger(record.signingContextTipHeight, 'tracker signing context tip height');
}

function validateReceiptProjectionBindings(
  receipt: Readonly<Record<string, unknown>>,
): void {
  const execution = receipt.execution as Record<string, unknown>;
  const checkpoint = receipt.checkpoint as Record<string, unknown>;
  const application = receipt.application as Record<string, unknown>;
  const anchor = receipt.anchor as Record<string, unknown>;
  const setup = receipt.trackerSetup as Record<string, unknown>;
  const observation = receipt.trackerObservation as Record<string, unknown>;
  const candidate = receipt.trackerCandidate as Record<string, unknown>;
  const check = receipt.trackerCheck as Record<string, unknown>;
  const validFrom = BigInt(String(checkpoint.admissionValidFromErgoHeight));
  const expiresAt = BigInt(String(checkpoint.admissionExpiresAtErgoHeight));
  const admissionObservedAt = BigInt(
    Number(execution.checkpointAdmissionObservedAtHeight),
  );
  const anchorHeight = BigInt(Number(anchor.anchorHeight));
  if (
    anchor.extensionValueHex
      !== `${String(application.bridgeEventRootHex).slice(2)}${checkpoint.statementIdHex}`
    || execution.executionTargetIdentityDigestHex
      !== anchor.executionTargetIdentityDigestHex
    || admissionObservedAt !== validFrom
    || anchorHeight < validFrom
    || anchorHeight >= expiresAt
    || Number(setup.confirmationHeight) > Number(anchor.anchorHeight)
    || setup.outputBoxIdHex !== candidate.inputBoxIdHex
    || candidate.inputBoxIdHex !== check.inputBoxIdHex
    || candidate.statementIdHex !== checkpoint.statementIdHex
    || check.statementIdHex !== candidate.statementIdHex
    || observation.anchorHeaderIdHex !== anchor.anchorHeaderIdHex
    || candidate.anchorHeaderIdHex !== observation.anchorHeaderIdHex
    || check.anchorHeaderIdHex !== candidate.anchorHeaderIdHex
    || observation.anchorHeight !== anchor.anchorHeight
    || candidate.anchorHeight !== observation.anchorHeight
    || check.anchorHeight !== candidate.anchorHeight
    || observation.anchorExtensionRootHex !== anchor.anchorExtensionRootHex
    || candidate.anchorExtensionRootHex !== observation.anchorExtensionRootHex
    || candidate.anchorContextIndex !== observation.anchorContextIndex
    || check.anchorContextIndex !== candidate.anchorContextIndex
    || Number(observation.anchorHeight)
      + Number(observation.anchorContextIndex)
      !== Number(observation.tipHeight)
    || observation.executionTargetIdentityDigestHex
      !== anchor.executionTargetIdentityDigestHex
    || check.executionTargetIdentityDigestHex
      !== observation.executionTargetIdentityDigestHex
    || check.processBindingDigestHex !== observation.processBindingDigestHex
    || Number(candidate.currentErgoHeight) !== Number(observation.tipHeight) + 1
    || check.unsignedTransactionIdHex !== candidate.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== check.unsignedTransactionIdHex
    || check.signingContextTipHeight !== observation.tipHeight
    || check.signingContextTipIdHex !== observation.tipIdHex
  ) {
    throw new Error(
      'observed-anchor tracker receipt projection binding changed',
    );
  }
}

function assertPegInPlan(
  value: unknown,
  expected: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  const record = exactRecord(
    value,
    ['amountNanoErg', 'recipientAddressHex'],
    'observed-anchor-tracker-check peg-in plan',
  );
  canonicalPositiveIntegerString(record.amountNanoErg, 'peg-in amount');
  if (
    record.amountNanoErg !== expected.amountNanoErg
    || record.recipientAddressHex !== expected.recipientAddressHex
    || !/^[0-9a-f]{40}$/u.test(String(record.recipientAddressHex))
    || /^0{40}$/u.test(String(record.recipientAddressHex))
  ) {
    throw new Error('observed-anchor-tracker-check peg-in plan changed');
  }
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const record = exactRecord(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) {
      throw new Error(`${label} changed`);
    }
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields changed`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical fixed-width hex`);
  }
  return value;
}

function fixedWireHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical 0x-prefixed fixed-width hex`);
  }
  return value;
}

function evenLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical even-length hex`);
  }
  return value;
}

function sha256HexBytes(value: unknown, label: string): string {
  const hex = evenLowerHex(value, label);
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function unprefixedWireHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  return fixedWireHex(value, bytes, label).slice(2);
}

function canonicalPositiveIntegerString(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must be a canonical positive integer`);
  }
  return BigInt(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
