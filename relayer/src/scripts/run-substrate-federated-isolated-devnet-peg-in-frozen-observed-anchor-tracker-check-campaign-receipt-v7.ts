import { createHash } from 'node:crypto';

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt,
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
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from '../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA,
} from '../substrate-federated-tracker-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import {
  assertNoLocalPathValue,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-worker-receipt.v7' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7';
export const WORKER_RECEIPT_DIGEST_DOMAIN_V7 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7';

const BINDING_FAILURE_MESSAGE =
  'frozen-observed-anchor-tracker-check campaign producer-to-consumer binding changed';
const BINDING_LABELS = Object.freeze([
  'committed vault missing',
  'frozen tip missing',
  'admission transaction',
  'admission confirmation height',
  'admission confirmation header',
  'admission observation height',
  'admission valid-from height',
  'admission expiry height',
  'application packet receipt',
  'application target descriptor',
  'application mint proof receipt',
  'application runner receipt',
  'application checkpoint receipt',
  'application burn identity',
  'application event root',
  'mint proof draft',
  'mint proof statement',
  'mint proof identity',
  'mint proof source evidence',
  'committed reserve successor',
  'checkpoint source block height',
  'checkpoint source block hash',
  'checkpoint execution block hash',
  'checkpoint event root',
  'checkpoint sidechain identity',
  'checkpoint bridge address',
  'checkpoint token address',
  'checkpoint burn leaf count',
  'mined anchor extension key',
  'mined anchor extension value',
  'observed anchor extension key',
  'observed anchor extension value',
  'anchor process binding',
  'anchor execution target',
  'campaign lifecycle execution target',
  'anchor header identity',
  'anchor height',
  'tracker execution extension key',
  'tracker execution extension value',
  'tracker execution extension fields',
  'tracker execution target',
  'tracker execution schema',
  'tracker execution version',
  'tracker action mining boundary',
  'tracker primary read-only boundary',
  'tracker witness read-only boundary',
  'tracker pre-action mining stop',
  'tracker frozen snapshot stability',
  'tracker checkpoint extension boundary',
  'tracker mining credential consumption',
  'tracker checkpoint revalidation',
  'tracker checkpoint header',
  'tracker checkpoint height',
  'tracker checkpoint observation digest',
  'tracker action network stability',
  'tracker action height stability',
  'tracker action indexed height stability',
  'tracker action header stability',
  'frozen observation schema',
  'frozen observation version',
  'frozen anchor header',
  'frozen anchor height',
  'frozen anchor extension root',
  'frozen anchor extension value',
  'frozen process binding',
  'frozen execution target',
  'frozen header cardinality',
  'frozen action height',
  'frozen action indexed height',
  'frozen action header',
  'frozen node agreement',
  'frozen observation mining stop',
  'frozen checkpoint target',
  'frozen checkpoint retention',
  'frozen extension recomputation',
  'frozen PoW nonclaim',
  'frozen tracker admission nonclaim',
  'frozen signing nonclaim',
  'frozen submission nonclaim',
  'frozen broadcast nonclaim',
  'frozen funds authority nonclaim',
  'frozen Gate 5 nonclaim',
  'frozen trustless nonclaim',
  'tracker candidate schema',
  'tracker candidate version',
  'tracker candidate trust model',
  'tracker candidate anchor provenance',
  'tracker candidate input',
  'tracker candidate statement',
  'tracker candidate anchor header',
  'tracker candidate anchor height',
  'tracker candidate anchor extension root',
  'tracker candidate anchor index',
  'tracker check schema',
  'tracker check version',
  'tracker check status',
  'tracker check input',
  'tracker check statement',
  'tracker check anchor header',
  'tracker check anchor height',
  'tracker check anchor index',
  'tracker check unsigned transaction',
  'tracker check signed transaction',
  'tracker check process binding',
  'tracker check execution target',
  'tracker check signer derivation',
  'tracker check signer tip height',
  'tracker check signer tip header',
  'tracker check path',
  'tracker check method',
  'tracker check transport policy',
  'tracker check local boundary',
  'tracker check frozen target boundary',
  'tracker check anchor boundary',
  'tracker check transaction boundary',
  'tracker check signing boundary',
  'tracker check JVM boundary',
  'tracker check signed bytes non-persistence',
  'tracker check submission nonclaim',
  'tracker check broadcast nonclaim',
  'tracker check admission nonclaim',
  'tracker check replay nonclaim',
  'tracker check payout nonclaim',
  'tracker check funds authority nonclaim',
  'tracker check Gate 5 nonclaim',
  'tracker check trustless nonclaim',
  'tracker check production readiness nonclaim',
] as const);
const BINDING_LABEL_SET: ReadonlySet<string> = new Set(BINDING_LABELS);
type FrozenObservedAnchorTrackerCheckCampaignBindingLabelV7 =
  typeof BINDING_LABELS[number];

export function isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(
  value: unknown,
): value is FrozenObservedAnchorTrackerCheckCampaignBindingLabelV7 {
  return typeof value === 'string' && BINDING_LABEL_SET.has(value);
}

class FrozenObservedAnchorTrackerCheckCampaignBindingErrorV7 extends Error {
  readonly binding: FrozenObservedAnchorTrackerCheckCampaignBindingLabelV7;

  constructor(binding: string) {
    if (!isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(binding)) {
      throw new Error('frozen-observed-anchor-tracker-check binding label is unsafe');
    }
    super(`${BINDING_FAILURE_MESSAGE}: ${binding}`);
    this.name = 'FrozenObservedAnchorTrackerCheckCampaignBindingErrorV7';
    this.binding = binding;
  }
}

export function readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(
  error: unknown,
): string | undefined {
  return error instanceof FrozenObservedAnchorTrackerCheckCampaignBindingErrorV7
    ? error.binding
    : undefined;
}

const WORKER_PHASES = Object.freeze([
  'worker arguments',
  'worker platform',
  'external roots',
  'worker roots',
  'worker environment',
  'bootstrap request',
  'campaign root',
  'worker receipt',
] as const);
const WORKER_PHASE_SET: ReadonlySet<string> = new Set(WORKER_PHASES);
export type FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7 =
  typeof WORKER_PHASES[number];

export function isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(
  value: unknown,
): value is FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7 {
  return typeof value === 'string' && WORKER_PHASE_SET.has(value);
}

class FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseErrorV7 extends Error {
  readonly phase: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7;

  constructor(
    phase: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
    cause: unknown,
  ) {
    if (!isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(phase)) {
      throw new Error(
        'frozen-observed-anchor-tracker-check campaign worker phase is invalid',
      );
    }
    const detail = cause instanceof Error ? cause.message : 'worker phase failed';
    super(`${phase}: ${detail}`);
    this.name = 'FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseErrorV7';
    this.phase = phase;
    Object.freeze(this);
  }
}

export function createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7(
  phase: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
  cause: unknown,
): Error {
  return new FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseErrorV7(
    phase,
    cause,
  );
}

export function readSafeFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(
  error: unknown,
): FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7 | undefined {
  if (
    !(error instanceof FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseErrorV7)
    || !isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(error.phase)
  ) {
    return undefined;
  }
  return error.phase;
}

const EXPECTED_ROOT_CHECKS = Object.freeze({
  setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
    true,
  exactObserved0401AnchorConsumedByTrackerCandidate: true,
  exactCheckpointBoundFrozenTargetConsumedByTrackerCheck: true,
  exactFrozenSnapshotStableAcrossTrackerCheck: true,
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
  checkpointBoundFrozenTrackerExecutionObserved: true,
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
  exactFrozenTrackerTargetBound: true,
  exactFrozenSnapshotStableAcrossTrackerCheck: true,
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
  checkpointBoundFrozenTrackerExecutionObserved: true,
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

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA;
  readonly version: 7;
  readonly status:
    'request_bound_local_frozen_observed_anchor_tracker_check_campaign_completed';
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
  readonly trackerExecution: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA;
    readonly version: 2;
    readonly checkpointExtensionObservationDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly preFreezeMiningFullHeight: number;
    readonly preFreezeMiningIndexedHeight: number;
    readonly preFreezeMiningHeaderIdHex: string;
    readonly actionStartFullHeight: number;
    readonly actionStartIndexedHeight: number;
    readonly actionStartHeaderIdHex: string;
    readonly actionEndFullHeight: number;
    readonly actionEndIndexedHeight: number;
    readonly actionEndHeaderIdHex: string;
    readonly checkpointFullHeight: number;
    readonly checkpointIndexedHeight: number;
    readonly checkpointHeaderIdHex: string;
  }>;
  readonly trackerObservation: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA;
    readonly version: 2;
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
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA;
    readonly version: 2;
    readonly status: 'PASS';
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

export function buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >,
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7
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
  const frozenObservation = tracker.observation;
  const candidate = tracker.candidate;
  const check = tracker.check;
  const frozenTip = frozenObservation.headers[0];
  const actionStart = tracker.execution.actionStartSnapshot;
  const actionEnd = tracker.execution.actionEndSnapshot;
  const expectedCheckpointExtensionObservationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
      anchor.observation,
    );
  const failBinding = (binding: string): never => {
    throw new FrozenObservedAnchorTrackerCheckCampaignBindingErrorV7(binding);
  };
  if (committedVault === undefined) failBinding('committed vault missing');
  if (frozenTip === undefined) failBinding('frozen tip missing');
  const bindingChecks = [
    ['admission transaction', () => admission.expectedTxId === committedVault.expectedTxId],
    ['admission confirmation height',
      () => admission.confirmationHeight === committedVault.confirmationHeight],
    ['admission confirmation header',
      () => admission.confirmationHeaderIdHex === committedVault.confirmationHeaderIdHex],
    ['admission observation height',
      () => admission.observedAtHeight >= admission.confirmationHeight],
    ['admission valid-from height',
      () => statement.admissionValidFromErgoHeight === admission.observedAtHeight.toString()],
    ['admission expiry height',
      () => BigInt(statement.admissionExpiresAtErgoHeight)
        > BigInt(statement.admissionValidFromErgoHeight)],
    ['application packet receipt',
      () => applicationRoot.binding.packetReceiptDigestHex
        === applicationRoot.packet.receipt.receiptDigestHex],
    ['application target descriptor',
      () => applicationRoot.binding.targetDescriptorDigestHex
        === applicationRoot.packet.receipt.targetDescriptorDigestHex],
    ['application mint proof receipt',
      () => applicationRoot.binding.mintSourceProofReceiptDigestHex
        === applicationRoot.mintSourceProof.receiptDigestHex],
    ['application runner receipt',
      () => applicationRoot.binding.applicationRunnerReceiptDigestHex
        === runner.receiptDigestHex],
    ['application checkpoint receipt',
      () => applicationRoot.binding.checkpointReceiptDigestHex
        === applicationRoot.checkpoint.receiptDigestHex],
    ['application burn identity',
      () => applicationRoot.binding.burnIdHex === evidence.burn.burnIdHex],
    ['application event root',
      () => applicationRoot.binding.bridgeEventRootHex === evidence.burn.bridgeEventRootHex],
    ['mint proof draft',
      () => sourceProof.mintReservationDraftDigestHex === draft.draftDigestHex],
    ['mint proof statement',
      () => sourceProof.mintReservationStatementIdHex === draft.statementIdHex],
    ['mint proof identity', () => sourceProof.mintIdentityHex === draft.reservationKeyHex],
    ['mint proof source evidence',
      () => sourceProof.sourceEvidenceReceiptDigestHex
        === root.application.evidenceReceipt.receiptDigestHex],
    ['committed reserve successor',
      () => draft.statement.successorReserveBoxIdHex
        === `0x${committedVault.outputObservation.reserveSuccessorBoxIdHex}`],
    ['checkpoint source block height',
      () => statement.sourceNativeBlockHeight === evidence.sourceNativeBlock.height.toString()],
    ['checkpoint source block hash',
      () => statement.sourceNativeBlockHashHex === unprefixedWireHex(
        evidence.sourceNativeBlock.hashHex,
        32,
        'application source native block hash',
      )],
    ['checkpoint execution block hash',
      () => statement.executionBlockHashHex === unprefixedWireHex(
        evidence.execution.blockHashHex,
        32,
        'application execution block hash',
      )],
    ['checkpoint event root',
      () => statement.bridgeEventRootHex === unprefixedWireHex(
        evidence.burn.bridgeEventRootHex,
        32,
        'application bridge event root',
      )],
    ['checkpoint sidechain identity',
      () => statement.sidechainIdHex === unprefixedWireHex(
        evidence.execution.sidechainIdHex,
        32,
        'application sidechain ID',
      )],
    ['checkpoint bridge address',
      () => statement.bridgeAddressHex === unprefixedWireHex(
        evidence.application.bridgeAddressHex,
        20,
        'application bridge address',
      )],
    ['checkpoint token address',
      () => statement.tokenAddressHex === unprefixedWireHex(
        evidence.application.tokenAddressHex,
        20,
        'application token address',
      )],
    ['checkpoint burn leaf count',
      () => statement.burnLeafCount === evidence.burn.burnLeafCount],
    ['mined anchor extension key', () => anchor.mining.extensionKeyHex === '0401'],
    ['mined anchor extension value',
      () => anchor.mining.extensionValueHex
        === `${statement.bridgeEventRootHex}${statement.statementIdHex}`],
    ['observed anchor extension key', () => anchor.observation.extensionKeyHex === '0401'],
    ['observed anchor extension value',
      () => anchor.mining.extensionValueHex === anchor.observation.extensionValueHex],
    ['anchor process binding',
      () => anchor.mining.processBindingDigestHex
        === anchor.observation.processBindingDigestHex],
    ['anchor execution target',
      () => anchor.mining.executionTargetIdentityDigestHex
        === anchor.observation.executionTargetIdentityDigestHex],
    ['campaign lifecycle execution target',
      () => root.process.executionTargetIdentityDigestHex
        === root.setup.lifecycle.executionTargetIdentityDigestHex],
    ['anchor header identity',
      () => anchor.mining.finalSnapshot.headerIdHex === anchor.observation.anchorHeaderIdHex],
    ['anchor height',
      () => anchor.mining.finalSnapshot.fullHeight === anchor.observation.anchorHeight],
    ['tracker execution extension key',
      () => tracker.execution.extensionKeyHex === anchor.mining.extensionKeyHex],
    ['tracker execution extension value',
      () => tracker.execution.extensionValueHex === anchor.mining.extensionValueHex],
    ['tracker execution extension fields',
      () => tracker.execution.extensionFieldsSha256Hex
        === anchor.mining.extensionFieldsSha256Hex],
    ['tracker execution target',
      () => tracker.execution.executionTargetIdentityDigestHex
        === anchor.mining.executionTargetIdentityDigestHex],
    ['tracker execution schema',
      () => tracker.execution.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA],
    ['tracker execution version', () => tracker.execution.version === 2],
    ['tracker action mining boundary',
      () => tracker.execution.primaryMiningDuringAction === false],
    ['tracker primary read-only boundary',
      () => tracker.execution.primaryReadOnlyDuringAction === true],
    ['tracker witness read-only boundary',
      () => tracker.execution.witnessReadOnlyDuringAction === true],
    ['tracker pre-action mining stop',
      () => tracker.execution.miningStoppedBeforeAction === true],
    ['tracker frozen snapshot stability',
      () => tracker.execution.exactFrozenSnapshotStableAcrossAction === true],
    ['tracker checkpoint extension boundary',
      () => tracker.execution.checkpointExtensionBoundDuringAction === true],
    ['tracker mining credential consumption',
      () => tracker.execution.trackerAdmissionMiningCredentialConsumedOnce === true],
    ['tracker checkpoint revalidation',
      () => tracker.execution.checkpointSnapshotRevalidatedOnBothNodes === true],
    ['tracker checkpoint header',
      () => tracker.execution.checkpointSnapshot.headerIdHex
        === anchor.observation.anchorHeaderIdHex],
    ['tracker checkpoint height',
      () => tracker.execution.checkpointSnapshot.fullHeight === anchor.observation.anchorHeight],
    ['tracker checkpoint observation digest',
      () => tracker.execution.checkpointExtensionObservationDigestHex
        === expectedCheckpointExtensionObservationDigestHex],
    ['tracker action network stability', () => actionStart.network === actionEnd.network],
    ['tracker action height stability', () => actionStart.fullHeight === actionEnd.fullHeight],
    ['tracker action indexed height stability',
      () => actionStart.indexedHeight === actionEnd.indexedHeight],
    ['tracker action header stability',
      () => actionStart.headerIdHex === actionEnd.headerIdHex],
    ['frozen observation schema',
      () => frozenObservation.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA],
    ['frozen observation version', () => frozenObservation.version === 2],
    ['frozen anchor header',
      () => frozenObservation.anchorHeaderIdHex === anchor.observation.anchorHeaderIdHex],
    ['frozen anchor height',
      () => frozenObservation.anchorHeight === anchor.observation.anchorHeight],
    ['frozen anchor extension root',
      () => frozenObservation.anchorExtensionRootHex
        === anchor.observation.anchorExtensionRootHex],
    ['frozen anchor extension value',
      () => frozenObservation.extensionValueHex === anchor.observation.extensionValueHex],
    ['frozen process binding',
      () => frozenObservation.processBindingDigestHex
        === tracker.execution.processBindingDigestHex],
    ['frozen execution target',
      () => frozenObservation.executionTargetIdentityDigestHex
        === tracker.execution.executionTargetIdentityDigestHex],
    ['frozen header cardinality', () => frozenObservation.headers.length === 10],
    ['frozen action height', () => actionStart.fullHeight === frozenTip.height],
    ['frozen action indexed height', () => actionStart.indexedHeight === frozenTip.height],
    ['frozen action header', () => actionStart.headerIdHex === frozenTip.idHex],
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
    ['frozen PoW nonclaim',
      () => frozenObservation.boundaries.ergoPowAuthenticated === false],
    ['frozen tracker admission nonclaim',
      () => frozenObservation.boundaries.trackerAdmissionEstablished === false],
    ['frozen signing nonclaim',
      () => frozenObservation.boundaries.signingPerformed === false],
    ['frozen submission nonclaim',
      () => frozenObservation.boundaries.submissionPerformed === false],
    ['frozen broadcast nonclaim',
      () => frozenObservation.boundaries.broadcastPerformed === false],
    ['frozen funds authority nonclaim',
      () => frozenObservation.boundaries.fundsAuthorityEstablished === false],
    ['frozen Gate 5 nonclaim',
      () => frozenObservation.boundaries.gate5Closed === false],
    ['frozen trustless nonclaim',
      () => frozenObservation.boundaries.trustlessStatusEstablished === false],
    ['tracker candidate schema', () => candidate.schema === SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA],
    ['tracker candidate version', () => candidate.version === 1],
    ['tracker candidate trust model',
      () => candidate.trustModel === 'federated_non_trustless'],
    ['tracker candidate anchor provenance',
      () => candidate.anchorContextProvenance
        === BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE],
    ['tracker candidate input',
      () => candidate.inputBoxIdHex === tracker.trackerSetup.outputBoxIdHex],
    ['tracker candidate statement',
      () => candidate.statementIdHex === statement.statementIdHex],
    ['tracker candidate anchor header',
      () => candidate.anchorHeaderIdHex === frozenObservation.anchorHeaderIdHex],
    ['tracker candidate anchor height',
      () => candidate.anchorHeaderHeight === frozenObservation.anchorHeight],
    ['tracker candidate anchor extension root',
      () => candidate.anchorExtensionRootHex === frozenObservation.anchorExtensionRootHex],
    ['tracker candidate anchor index',
      () => candidate.anchorContextIndex === frozenObservation.anchorContextIndex],
    ['tracker check schema',
      () => check.schema
        === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA],
    ['tracker check version', () => check.version === 2],
    ['tracker check status', () => check.status === 'PASS'],
    ['tracker check input', () => check.trackerInputBoxIdHex === candidate.inputBoxIdHex],
    ['tracker check statement', () => check.statementIdHex === candidate.statementIdHex],
    ['tracker check anchor header',
      () => check.anchorHeaderIdHex === candidate.anchorHeaderIdHex],
    ['tracker check anchor height', () => check.anchorHeight === candidate.anchorHeaderHeight],
    ['tracker check anchor index',
      () => check.anchorContextIndex === candidate.anchorContextIndex],
    ['tracker check unsigned transaction',
      () => check.unsignedTransactionIdHex === candidate.unsignedTransactionIdHex],
    ['tracker check signed transaction',
      () => check.signedTransactionIdHex === candidate.unsignedTransactionIdHex],
    ['tracker check process binding',
      () => check.target.processBindingDigestHex === tracker.execution.processBindingDigestHex],
    ['tracker check execution target',
      () => check.target.executionTargetIdentityDigestHex
        === tracker.execution.executionTargetIdentityDigestHex],
    ['tracker check signer derivation', () => check.signer.derivation === 'wasm-root'],
    ['tracker check signer tip height',
      () => check.signer.stateContextTipHeight === frozenTip.height],
    ['tracker check signer tip header',
      () => check.signer.stateContextTipIdHex === frozenTip.idHex],
    ['tracker check path', () => check.checker.path === '/transactions/check'],
    ['tracker check method', () => check.checker.method === 'POST'],
    ['tracker check transport policy',
      () => check.checker.transportPolicy === 'no-redirect-no-proxy'],
    ['tracker check local boundary',
      () => check.boundaries.localIsolatedDevnetOnly === true],
    ['tracker check frozen target boundary',
      () => check.boundaries.checkpointBoundFrozenTarget === true],
    ['tracker check anchor boundary',
      () => check.boundaries.observedAnchorContextBound === true],
    ['tracker check transaction boundary',
      () => check.boundaries.exactTrackerInputAndTransactionBound === true],
    ['tracker check signing boundary',
      () => check.boundaries.localWasmRootSigningPerformed === true],
    ['tracker check JVM boundary',
      () => check.boundaries.localJvmNodeCheckPassed === true],
    ['tracker check signed bytes non-persistence',
      () => check.boundaries.signedTransactionBytesPersisted === false],
    ['tracker check submission nonclaim',
      () => check.boundaries.submissionAuthorityEstablished === false],
    ['tracker check broadcast nonclaim',
      () => check.boundaries.broadcastAuthorityEstablished === false],
    ['tracker check admission nonclaim',
      () => check.boundaries.trackerAdmissionEstablished === false],
    ['tracker check replay nonclaim',
      () => check.boundaries.replayProtectionEstablished === false],
    ['tracker check payout nonclaim',
      () => check.boundaries.payoutEstablished === false],
    ['tracker check funds authority nonclaim',
      () => check.boundaries.fundsAuthorityEstablished === false],
    ['tracker check Gate 5 nonclaim',
      () => check.boundaries.gate5Closed === false],
    ['tracker check trustless nonclaim',
      () => check.boundaries.trustlessStatusEstablished === false],
    ['tracker check production readiness nonclaim',
      () => check.boundaries.productionReadinessEstablished === false],
  ] as const;
  for (const [binding] of bindingChecks) {
    if (!isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(binding)) {
      throw new Error(
        'frozen-observed-anchor-tracker-check binding label registry changed',
      );
    }
  }
  const failedBinding = bindingChecks.find(([, matches]) => !matches());
  if (failedBinding !== undefined) failBinding(failedBinding[0]);
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA,
    version: 7 as const,
    status:
      'request_bound_local_frozen_observed_anchor_tracker_check_campaign_completed' as const,
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
    trackerExecution: {
      schema: tracker.execution.schema,
      version: tracker.execution.version,
      checkpointExtensionObservationDigestHex:
        tracker.execution.checkpointExtensionObservationDigestHex,
      processBindingDigestHex: tracker.execution.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        tracker.execution.executionTargetIdentityDigestHex,
      preFreezeMiningFullHeight:
        tracker.execution.preFreezeMiningSnapshot.fullHeight,
      preFreezeMiningIndexedHeight:
        tracker.execution.preFreezeMiningSnapshot.indexedHeight,
      preFreezeMiningHeaderIdHex:
        tracker.execution.preFreezeMiningSnapshot.headerIdHex,
      actionStartFullHeight: actionStart.fullHeight,
      actionStartIndexedHeight: actionStart.indexedHeight,
      actionStartHeaderIdHex: actionStart.headerIdHex,
      actionEndFullHeight: actionEnd.fullHeight,
      actionEndIndexedHeight: actionEnd.indexedHeight,
      actionEndHeaderIdHex: actionEnd.headerIdHex,
      checkpointFullHeight: tracker.execution.checkpointSnapshot.fullHeight,
      checkpointIndexedHeight: tracker.execution.checkpointSnapshot.indexedHeight,
      checkpointHeaderIdHex: tracker.execution.checkpointSnapshot.headerIdHex,
    },
    trackerObservation: {
      schema: frozenObservation.schema,
      version: frozenObservation.version,
      observationDigestHex: frozenObservation.observationDigestHex,
      anchorHeaderIdHex: frozenObservation.anchorHeaderIdHex,
      anchorHeight: frozenObservation.anchorHeight,
      anchorExtensionRootHex: frozenObservation.anchorExtensionRootHex,
      anchorContextIndex: frozenObservation.anchorContextIndex,
      processBindingDigestHex: frozenObservation.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        frozenObservation.executionTargetIdentityDigestHex,
      tipHeight: frozenTip.height,
      tipIdHex: frozenTip.idHex,
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
      schema: check.schema,
      version: check.version,
      status: check.status,
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
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN_V7),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'frozen-observed-anchor-tracker-check campaign worker receipt');
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  expectedCheckpointExtensionObservationDigestHex?: string,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  if (expectedCheckpointExtensionObservationDigestHex !== undefined) {
    fixedHex(
      expectedCheckpointExtensionObservationDigestHex,
      32,
      'expected checkpoint extension observation digest',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('frozen-observed-anchor-tracker-check campaign worker output is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker output is not canonical JSON',
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
    'trackerExecution',
    'trackerObservation',
    'trackerSetup',
    'version',
  ], 'frozen-observed-anchor-tracker-check campaign worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA
    || receipt.version !== 7
    || receipt.status
      !== 'request_bound_local_frozen_observed_anchor_tracker_check_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
  ) {
    throw new Error('frozen-observed-anchor-tracker-check campaign worker identity changed');
  }
  assertPegInPlan(receipt.pegIn, expectedPegIn);
  fixedHex(receipt.rootReceiptDigestHex, 32, 'root receipt digest');
  validateExecutionProjection(receipt.execution);
  validateProofProjection(receipt.proof);
  validateApplicationProjection(receipt.application);
  validateCheckpointProjection(receipt.checkpoint);
  validateAnchorProjection(receipt.anchor);
  validateTrackerSetupProjection(receipt.trackerSetup);
  validateTrackerExecutionProjection(receipt.trackerExecution);
  validateTrackerObservationProjection(receipt.trackerObservation);
  validateTrackerCandidateProjection(receipt.trackerCandidate);
  validateTrackerCheckProjection(receipt.trackerCheck);
  validateReceiptProjectionBindings(
    receipt,
    expectedCheckpointExtensionObservationDigestHex,
  );
  assertExpectedBooleanRecord(
    receipt.checks,
    EXPECTED_WORKER_CHECKS,
    'frozen-observed-anchor-tracker-check campaign worker checks',
  );
  assertExpectedBooleanRecord(
    receipt.boundaries,
    EXPECTED_WORKER_BOUNDARIES,
    'frozen-observed-anchor-tracker-check campaign worker boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'worker receipt digest')
      !== sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN_V7)
  ) {
    throw new Error('frozen-observed-anchor-tracker-check campaign worker digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'frozen-observed-anchor-tracker-check campaign worker receipt');
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7
  >;
}

function validateRoot(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  if (
    root.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA
    || root.version !== 7
    || root.status
      !== 'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check'
    || root.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7
  ) {
    throw new Error('frozen-observed-anchor-tracker-check campaign root identity changed');
  }
  const { receiptDigestHex, ...body } = root;
  if (
    fixedHex(receiptDigestHex, 32, 'root receipt digest')
      !== sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('frozen-observed-anchor-tracker-check campaign root digest changed');
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
    throw new Error('peg-in plan differs from frozen-observed-anchor-tracker-check root');
  }
}

function validateExecutionProjection(value: unknown): void {
  const record = exactRecord(value, [
    'checkpointAdmissionObservationDigestHex',
    'checkpointAdmissionObservedAtHeight',
    'committedVaultTransactionIdHex',
    'executionTargetIdentityDigestHex',
    'reserveSuccessorBoxIdHex',
  ], 'frozen-observed-anchor-tracker-check execution projection');
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
  ], 'frozen-observed-anchor-tracker-check proof projection');
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
  ], 'frozen-observed-anchor-tracker-check application projection');
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
  ], 'frozen-observed-anchor-tracker-check checkpoint projection');
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

function validateTrackerExecutionProjection(value: unknown): void {
  const record = exactRecord(value, [
    'actionEndFullHeight',
    'actionEndHeaderIdHex',
    'actionEndIndexedHeight',
    'actionStartFullHeight',
    'actionStartHeaderIdHex',
    'actionStartIndexedHeight',
    'checkpointFullHeight',
    'checkpointHeaderIdHex',
    'checkpointIndexedHeight',
    'checkpointExtensionObservationDigestHex',
    'executionTargetIdentityDigestHex',
    'preFreezeMiningFullHeight',
    'preFreezeMiningHeaderIdHex',
    'preFreezeMiningIndexedHeight',
    'processBindingDigestHex',
    'schema',
    'version',
  ], 'frozen tracker execution projection');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA
    || record.version !== 2
  ) {
    throw new Error('frozen tracker execution projection schema or version changed');
  }
  for (const key of [
    'actionEndHeaderIdHex',
    'actionStartHeaderIdHex',
    'checkpointHeaderIdHex',
    'checkpointExtensionObservationDigestHex',
    'executionTargetIdentityDigestHex',
    'preFreezeMiningHeaderIdHex',
    'processBindingDigestHex',
  ] as const) {
    fixedHex(record[key], 32, `frozen tracker execution ${key}`);
  }
  for (const key of [
    'actionEndFullHeight',
    'actionEndIndexedHeight',
    'actionStartFullHeight',
    'actionStartIndexedHeight',
    'checkpointFullHeight',
    'checkpointIndexedHeight',
    'preFreezeMiningFullHeight',
    'preFreezeMiningIndexedHeight',
  ] as const) {
    positiveSafeInteger(record[key], `frozen tracker execution ${key}`);
  }
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
    'schema',
    'tipHeight',
    'tipIdHex',
    'version',
  ], 'tracker observation projection');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA
    || record.version !== 2
  ) {
    throw new Error('tracker observation projection schema or version changed');
  }
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
    'schema',
    'signedTransactionBytesLength',
    'signedTransactionBytesSha256Hex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionIdHex',
    'signerP2pkErgoTreeHex',
    'signerPublicKeyHex',
    'signingContextTipHeight',
    'signingContextTipIdHex',
    'statementIdHex',
    'status',
    'unsignedTransactionDigestHex',
    'unsignedTransactionIdHex',
    'version',
  ], 'tracker check projection');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA
    || record.version !== 2
    || record.status !== 'PASS'
  ) {
    throw new Error('tracker check projection schema, version, or status changed');
  }
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
  expectedCheckpointExtensionObservationDigestHex?: string,
): void {
  const execution = receipt.execution as Record<string, unknown>;
  const checkpoint = receipt.checkpoint as Record<string, unknown>;
  const application = receipt.application as Record<string, unknown>;
  const anchor = receipt.anchor as Record<string, unknown>;
  const setup = receipt.trackerSetup as Record<string, unknown>;
  const trackerExecution = receipt.trackerExecution as Record<string, unknown>;
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
    || trackerExecution.executionTargetIdentityDigestHex
      !== observation.executionTargetIdentityDigestHex
    || trackerExecution.processBindingDigestHex
      !== observation.processBindingDigestHex
    || trackerExecution.actionStartFullHeight
      !== trackerExecution.actionEndFullHeight
    || trackerExecution.actionStartIndexedHeight
      !== trackerExecution.actionEndIndexedHeight
    || trackerExecution.actionStartHeaderIdHex
      !== trackerExecution.actionEndHeaderIdHex
    || trackerExecution.actionStartFullHeight !== observation.tipHeight
    || trackerExecution.actionStartIndexedHeight !== observation.tipHeight
    || trackerExecution.actionStartHeaderIdHex !== observation.tipIdHex
    || trackerExecution.checkpointFullHeight !== anchor.anchorHeight
    || trackerExecution.checkpointHeaderIdHex !== anchor.anchorHeaderIdHex
    || (
      expectedCheckpointExtensionObservationDigestHex !== undefined
      && trackerExecution.checkpointExtensionObservationDigestHex
        !== expectedCheckpointExtensionObservationDigestHex
    )
    || check.executionTargetIdentityDigestHex
      !== observation.executionTargetIdentityDigestHex
    || check.processBindingDigestHex !== trackerExecution.processBindingDigestHex
    || Number(candidate.currentErgoHeight) !== Number(observation.tipHeight) + 1
    || check.unsignedTransactionIdHex !== candidate.unsignedTransactionIdHex
    || check.signedTransactionIdHex !== check.unsignedTransactionIdHex
    || check.signingContextTipHeight !== observation.tipHeight
    || check.signingContextTipIdHex !== observation.tipIdHex
  ) {
    throw new Error(
      'frozen observed-anchor tracker receipt projection binding changed',
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
    'frozen-observed-anchor-tracker-check peg-in plan',
  );
  canonicalPositiveIntegerString(record.amountNanoErg, 'peg-in amount');
  if (
    record.amountNanoErg !== expected.amountNanoErg
    || record.recipientAddressHex !== expected.recipientAddressHex
    || !/^[0-9a-f]{40}$/u.test(String(record.recipientAddressHex))
    || /^0{40}$/u.test(String(record.recipientAddressHex))
  ) {
    throw new Error('frozen-observed-anchor-tracker-check peg-in plan changed');
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
