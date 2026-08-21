import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA,
} from '../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
} from '../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from '../peg-in-causal-admission-v2.js';
import {
  assertValidityApplicationPooledReserveMintReservationStatementV4Bindings,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from '../validity-application-pooled-reserve-mint-reservation-v4.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_WORKER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-worker-receipt.v1' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1';
const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_WORKER_RECEIPT_V1';
const DRAFT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1';
const EVIDENCE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1';
const EVIDENCE_BYTES_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_BYTES_V1';
const SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_RECEIPT_V2';
const PACKET_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2';
const FRONTIER_CONSUMER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

const ROOT_CHECKS = Object.freeze({
  committedReserveAndProofConsumedInOneTargetLifetime: true,
  compatibilityPacketReplacedByBoundContinuationV2: true,
  exactCommittedReserveBoundToMintStatement: true,
  exactCollectedEvidenceBoundToPacketProof: true,
  exactPacketProofConsumedByFrontier: true,
  everyEphemeralCapabilityDisposedBeforeReturn: true,
  returnedValueContainsCapabilities: false,
});

const ROOT_BOUNDARIES = Object.freeze({
  localSyntheticCompatibilityOnly: true,
  localSetupAndValuePathBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  depositCommitmentStateEstablished: true,
  sourceEvidenceCollectionProvenanceEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  externalTargetNodeAcceptanceEstablished: false,
  sourceCanonicalityIndependentlyVerified: false,
  ergoPowAuthenticated: false,
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

export interface SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_WORKER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_peg_in_mint_proof_campaign_completed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly execution: Readonly<{
    readonly rootReceiptDigestHex: string;
    readonly staticExecutionManifestDigestHex: string;
    readonly buildIdentityDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly committedVaultObservationDigestHex: string;
    readonly reserveSuccessorBoxIdHex: string;
  }>;
  readonly proof: Readonly<{
    readonly mintReservationDraftDigestHex: string;
    readonly statementIdHex: string;
    readonly mintIdentityHex: string;
    readonly sourceEvidenceReceiptDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly packetProofReceiptDigestHex: string;
    readonly sourceProofReceiptDigestHex: string;
    readonly targetDescriptorDigestHex: string;
    readonly frontierConsumerReceiptDigestHex: string;
    readonly frontierSourceLockDigestHex: string;
    readonly frontierToolchainDigestHex: string;
    readonly frontierExecutionInputDigestHex: string;
    readonly frontierStdoutSha256Hex: string;
    readonly frontierStderrSha256Hex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactRequestSha256Returned: true;
    readonly exactPegInPlanReturned: true;
    readonly rootReceiptDigestRecomputed: true;
    readonly exactBuildAndProcessIdentityJoined: true;
    readonly exactCommittedReserveObservationProjected: true;
    readonly exactDraftEvidencePacketAndConsumerDigestsJoined: true;
    readonly signedTransactionBytesProjected: false;
    readonly localPathsProjected: false;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: typeof ROOT_BOUNDARIES;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
  rootValue: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1> {
  fixedHex(commandRequestSha256Hex, 32, 'mint-proof command request digest');
  assertPegInPlan(pegInPlan);
  const projection = validateAndProjectRoot(rootValue, pegInPlan);
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_WORKER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    status: 'local_peg_in_mint_proof_campaign_completed' as const,
    commandRequestSha256Hex,
    pegIn: Object.freeze({ ...pegInPlan }),
    ...projection,
    checks: Object.freeze({
      exactRequestSha256Returned: true as const,
      exactPegInPlanReturned: true as const,
      rootReceiptDigestRecomputed: true as const,
      exactBuildAndProcessIdentityJoined: true as const,
      exactCommittedReserveObservationProjected: true as const,
      exactDraftEvidencePacketAndConsumerDigestsJoined: true as const,
      signedTransactionBytesProjected: false as const,
      localPathsProjected: false as const,
      returnedValueContainsCapabilities: false as const,
    }),
    boundaries: ROOT_BOUNDARIES,
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
  stdout: string,
  expectedCommandRequestSha256Hex: string,
  expectedPegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error(
      'mint-proof campaign worker output must be canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'commandRequestSha256Hex',
    'pegIn',
    'execution',
    'proof',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'mint-proof campaign worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_WORKER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'local_peg_in_mint_proof_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedCommandRequestSha256Hex
  ) {
    throw new Error('mint-proof campaign worker receipt identity changed');
  }
  fixedHex(receipt.commandRequestSha256Hex, 32, 'worker request digest');
  const pegIn = exactRecord(receipt.pegIn, [
    'amountNanoErg',
    'recipientAddressHex',
  ], 'mint-proof campaign peg-in plan');
  assertPegInPlan(pegIn as unknown as SubstrateFederatedIsolatedDevnetPegInPlanV1);
  if (
    pegIn.amountNanoErg !== expectedPegInPlan.amountNanoErg
    || pegIn.recipientAddressHex !== expectedPegInPlan.recipientAddressHex
  ) {
    throw new Error('mint-proof campaign worker peg-in plan changed');
  }
  assertExecutionProjection(receipt.execution);
  assertProofProjection(receipt.proof);
  assertExpectedBooleanRecord(receipt.checks, {
    exactRequestSha256Returned: true,
    exactPegInPlanReturned: true,
    rootReceiptDigestRecomputed: true,
    exactBuildAndProcessIdentityJoined: true,
    exactCommittedReserveObservationProjected: true,
    exactDraftEvidencePacketAndConsumerDigestsJoined: true,
    signedTransactionBytesProjected: false,
    localPathsProjected: false,
    returnedValueContainsCapabilities: false,
  }, 'mint-proof campaign worker checks');
  assertExpectedBooleanRecord(
    receipt.boundaries,
    ROOT_BOUNDARIES,
    'mint-proof campaign worker boundaries',
  );
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'mint-proof campaign worker receipt digest',
  );
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('mint-proof campaign worker receipt digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return receipt as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1
  >;
}

function validateAndProjectRoot(
  value: unknown,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Pick<
  SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1,
  'execution' | 'proof'
> {
  const root = exactRecord(value, [
    'schema',
    'version',
    'status',
    'staticExecutionManifestDigestHex',
    'build',
    'process',
    'setup',
    'pegIn',
    'mintProof',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'mint-proof campaign root receipt');
  if (
    root.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA
    || root.version !== 1
    || root.status !== 'committed_reserve_proof_consumed_by_frontier_lab'
    || root.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1
  ) {
    throw new Error('mint-proof campaign root identity changed');
  }
  const rootReceiptDigestHex = fixedHex(
    root.receiptDigestHex,
    32,
    'mint-proof campaign root receipt digest',
  );
  const { receiptDigestHex: _rootDigest, ...rootBody } = root;
  if (
    sha256CanonicalJson(rootBody, ROOT_RECEIPT_DIGEST_DOMAIN)
      !== rootReceiptDigestHex
  ) {
    throw new Error('mint-proof campaign root receipt digest changed');
  }
  assertExpectedBooleanRecord(root.checks, ROOT_CHECKS, 'mint-proof root checks');
  assertExpectedBooleanRecord(
    root.boundaries,
    ROOT_BOUNDARIES,
    'mint-proof root boundaries',
  );
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(root);
  assertNoLocalPathValue(root);

  const build = exactRecord(root.build, [
    'schema',
    'version',
    'status',
    'source',
    'toolchain',
    'build',
    'checks',
    'buildIdentityDigestHex',
    'boundaries',
  ], 'mint-proof root build receipt');
  const processReceipt = exactRecord(root.process, [
    'schema',
    'version',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'primaryMiningDuringAction',
    'witnessReadOnlyDuringAction',
    'buildIdentityDigestHex',
    'executableIdentityDigestHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'initialSnapshot',
    'finalSnapshot',
  ], 'mint-proof root process receipt');
  const buildIdentityDigestHex = fixedHex(
    build.buildIdentityDigestHex,
    32,
    'mint-proof build identity digest',
  );
  if (processReceipt.buildIdentityDigestHex !== buildIdentityDigestHex) {
    throw new Error('mint-proof root build and process identities differ');
  }
  const processBindingDigestHex = fixedHex(
    processReceipt.processBindingDigestHex,
    32,
    'mint-proof process binding digest',
  );
  const executionTargetIdentityDigestHex = fixedHex(
    processReceipt.executionTargetIdentityDigestHex,
    32,
    'mint-proof execution target identity digest',
  );

  const pegIn = exactRecord(root.pegIn, [
    'fundingObservation',
    'candidate',
    'sourceLockCheck',
    'sourceLockExecution',
    'committedVaultCheck',
    'committedVaultExecution',
  ], 'mint-proof root peg-in result');
  const committedVaultExecution = exactRecord(
    pegIn.committedVaultExecution,
    [
      'expectedTxId',
      'transportStatus',
      'durableAttemptDigestHex',
      'journalDigestHex',
      'confirmationDigestHex',
      'confirmationHeight',
      'confirmationHeaderIdHex',
      'preTransportObservation',
      'outputObservation',
    ],
    'mint-proof committed-vault execution',
  );
  const outputObservation = exactRecord(
    committedVaultExecution.outputObservation,
    [
      'schema',
      'version',
      'status',
      'expectedTxId',
      'sourceFundingBoxIdHex',
      'reservePredecessorBoxIdHex',
      'sourceLockBoxIdHex',
      'transitionFeeFundingBoxIdHex',
      'reserveSuccessorBoxIdHex',
      'confirmationHeight',
      'confirmationHeaderIdHex',
      'confirmationObservationDigestHex',
      'finalityTargetHeight',
      'finalityTargetHeaderIdHex',
      'requiredSuccessorDepth',
      'finalityPathHeaderIdsHex',
      'observedTipHeight',
      'observedTipHeaderIdHex',
      'processBindingDigestHex',
      'executionTargetIdentityDigestHex',
      'primaryObservationDigestHex',
      'witnessObservationDigestHex',
      'boundaries',
      'observationDigestHex',
    ],
    'mint-proof committed-vault output observation',
  );
  const committedVaultObservationDigestHex = fixedHex(
    outputObservation.observationDigestHex,
    32,
    'committed-vault observation digest',
  );
  const reserveSuccessorBoxIdHex = fixedHex(
    outputObservation.reserveSuccessorBoxIdHex,
    32,
    'committed-vault reserve successor box ID',
  );

  const mintProof = exactRecord(root.mintProof, [
    'draft',
    'evidenceReceipt',
    'packetProof',
    'consumerReceipt',
  ], 'mint-proof campaign material');
  const draft = exactRecord(mintProof.draft, [
    'schema',
    'version',
    'status',
    'statement',
    'statementHex',
    'statementIdHex',
    'reservationKeyHex',
    'provenance',
    'boundary',
    'limitations',
    'draftDigestHex',
  ], 'mint-proof reservation draft');
  if (
    draft.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA
    || draft.version !== 1
    || draft.status !== 'canonical_statement_waiting_for_source_proof'
  ) {
    throw new Error('mint-proof reservation draft identity changed');
  }
  const evidence = exactRecord(mintProof.evidenceReceipt, [
    'schema',
    'version',
    'status',
    'mintReservationDraftDigestHex',
    'mintReservationStatementIdHex',
    'mintIdentityHex',
    'candidateDigestHex',
    'committedVaultObservationDigestHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'collectorExecutableSha256Hex',
    'collectorModuleSha256Hex',
    'evidence',
    'evidenceDigestHex',
    'checks',
    'boundaries',
    'limitations',
    'receiptDigestHex',
  ], 'mint-proof source evidence receipt');
  if (
    evidence.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA
    || evidence.version !== 1
    || evidence.status !== 'canonical_committed_reserve_evidence_collected'
  ) {
    throw new Error('mint-proof source evidence identity changed');
  }
  const packetProof = exactRecord(mintProof.packetProof, [
    'schema',
    'version',
    'status',
    'packetReceiptDigestHex',
    'targetDescriptorDigestHex',
    'sourceProofReceiptDigestHex',
    'sourceProof',
    'checks',
    'receiptDigestHex',
  ], 'mint-proof packet proof receipt');
  if (
    packetProof.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2_SCHEMA
    || packetProof.version !== 2
    || packetProof.status
      !== 'packet_bound_collected_federated_source_proof_produced'
  ) {
    throw new Error('mint-proof packet proof identity changed');
  }
  const sourceProof = exactRecord(packetProof.sourceProof, [
    'schema',
    'version',
    'status',
    'sourceAttestationBindingDigestHex',
    'sourceEvidenceReceiptDigestHex',
    'targetDescriptorDigestHex',
    'mintReservationDraftDigestHex',
    'mintReservationStatementIdHex',
    'mintIdentityHex',
    'settlementFamilyIdHex',
    'encodedSettlementFamilyProfileHex',
    'runtimeProfileScaleHex',
    'runtimeProfileIdHex',
    'sourceProofProfileIdHex',
    'sourceProofProfileScaleHex',
    'requestDigestHex',
    'request',
    'result',
    'signatureVerification',
    'proofBytesScaleHex',
    'sourceProofEnvelopeScaleHex',
    'sourceProofEnvelopeSha256Hex',
    'checks',
    'boundary',
    'limitations',
    'receiptDigestHex',
  ], 'mint-proof source proof receipt');
  if (
    sourceProof.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA
    || sourceProof.version !== 2
    || sourceProof.status !== 'collected_federated_source_proof_produced'
  ) {
    throw new Error('mint-proof source proof identity changed');
  }
  const consumer = exactRecord(mintProof.consumerReceipt, [
    'schema',
    'version',
    'status',
    'packetProof',
    'packetProofReceiptDigestHex',
    'sourceProofReceiptDigestHex',
    'sourceEvidenceReceiptDigestHex',
    'targetDescriptorDigestHex',
    'runtimeProfileIdHex',
    'sourceProofProfileIdHex',
    'statementIdHex',
    'mintIdentityHex',
    'sourceLockDigestHex',
    'toolchainDigestHex',
    'dynamicSourceProofSha256Hex',
    'executionInputDigestHex',
    'stdoutSha256Hex',
    'stderrSha256Hex',
    'checks',
    'boundary',
    'limitations',
    'receiptDigestHex',
  ], 'mint-proof Frontier consumer receipt');
  if (
    consumer.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA
    || consumer.version !== 2
    || consumer.status !== 'packet_bound_proof_consumed_by_frontier_lab'
  ) {
    throw new Error('mint-proof Frontier consumer identity changed');
  }

  const draftDigestHex = assertEmbeddedDigest(
    draft,
    'draftDigestHex',
    DRAFT_DIGEST_DOMAIN,
    'mint reservation draft',
  );
  const evidenceReceiptDigestHex = assertEmbeddedDigest(
    evidence,
    'receiptDigestHex',
    EVIDENCE_RECEIPT_DIGEST_DOMAIN,
    'source evidence receipt',
  );
  const evidenceDigestHex = fixedHex(
    evidence.evidenceDigestHex,
    32,
    'source evidence bytes digest',
  );
  if (
    sha256CanonicalJson(evidence.evidence, EVIDENCE_BYTES_DIGEST_DOMAIN)
      !== evidenceDigestHex
  ) {
    throw new Error('source evidence bytes digest changed');
  }
  const sourceProofReceiptDigestHex = assertEmbeddedDigest(
    sourceProof,
    'receiptDigestHex',
    SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN,
    'source proof receipt',
  );
  const packetProofReceiptDigestHex = assertEmbeddedDigest(
    packetProof,
    'receiptDigestHex',
    PACKET_PROOF_RECEIPT_DIGEST_DOMAIN,
    'packet proof receipt',
  );
  const frontierConsumerReceiptDigestHex = assertEmbeddedDigest(
    consumer,
    'receiptDigestHex',
    FRONTIER_CONSUMER_RECEIPT_DIGEST_DOMAIN,
    'Frontier consumer receipt',
  );

  const statement = exactRecord(draft.statement, [
    'formatVersion',
    'lineageProfileIdHex',
    'sourceIntentHex',
    'sourceIntentIdHex',
    'mintIdentityHex',
    'sourceLockBoxIdHex',
    'reserveTransitionTransactionIdHex',
    'depositCommitmentHex',
    'successorReserveBoxIdHex',
    'successorReserveDigestHex',
    'successorReserveLiabilityNanoErg',
    'ergoDepositFinalityPolicyIdHex',
    'inclusionHeaderIdHex',
    'inclusionHeight',
    'targetHeaderIdHex',
    'targetHeight',
    'requiredSuccessorDepth',
  ], 'mint-proof reservation statement');
  const typedStatement = statement as unknown as
    ValidityApplicationPooledReserveMintReservationStatementV4;
  assertValidityApplicationPooledReserveMintReservationStatementV4Bindings(
    typedStatement,
  );
  const statementHex = encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
    typedStatement,
  );
  const statementIdHex =
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      typedStatement,
    );
  if (
    draft.statementHex !== statementHex
    || draft.statementIdHex !== statementIdHex
  ) {
    throw new Error('mint-proof reservation statement encoding changed');
  }
  const sourceIntent = decodePegInSourceIntentV2Hex(
    statement.sourceIntentHex as string,
  );
  if (
    statement.sourceIntentIdHex !== derivePegInSourceIntentIdV2Hex(sourceIntent)
    || sourceIntent.amountNanoErg.toString() !== pegInPlan.amountNanoErg
    || sourceIntent.recipientAddressHex
      !== `0x${pegInPlan.recipientAddressHex}`
  ) {
    throw new Error('mint-proof campaign peg-in plan differs from root statement');
  }

  fixedHex(draft.draftDigestHex, 32, 'mint reservation draft digest');
  fixedWireHex(draft.statementIdHex, 32, 'statement ID');
  const mintIdentityHex = fixedWireHex(
    draft.reservationKeyHex,
    32,
    'mint identity',
  );
  const packetReceiptDigestHex = fixedHex(
    packetProof.packetReceiptDigestHex,
    32,
    'packet receipt digest',
  );
  const targetDescriptorDigestHex = fixedHex(
    packetProof.targetDescriptorDigestHex,
    32,
    'target descriptor digest',
  );
  if (
    draft.reservationKeyHex !== statement.mintIdentityHex
    || evidence.mintReservationDraftDigestHex !== draftDigestHex
    || evidence.mintReservationStatementIdHex !== statementIdHex
    || evidence.mintIdentityHex !== mintIdentityHex
    || evidence.committedVaultObservationDigestHex
      !== committedVaultObservationDigestHex
    || evidence.processBindingDigestHex !== processBindingDigestHex
    || evidence.executionTargetIdentityDigestHex
      !== executionTargetIdentityDigestHex
    || packetProof.sourceProofReceiptDigestHex !== sourceProofReceiptDigestHex
    || sourceProof.sourceEvidenceReceiptDigestHex
      !== evidenceReceiptDigestHex
    || sourceProof.targetDescriptorDigestHex !== targetDescriptorDigestHex
    || sourceProof.mintReservationDraftDigestHex !== draftDigestHex
    || sourceProof.mintReservationStatementIdHex !== statementIdHex
    || sourceProof.mintIdentityHex !== mintIdentityHex
    || consumer.packetProofReceiptDigestHex !== packetProofReceiptDigestHex
    || consumer.sourceProofReceiptDigestHex !== sourceProofReceiptDigestHex
    || consumer.sourceEvidenceReceiptDigestHex
      !== evidenceReceiptDigestHex
    || consumer.targetDescriptorDigestHex !== targetDescriptorDigestHex
    || consumer.statementIdHex !== statementIdHex
    || consumer.mintIdentityHex !== mintIdentityHex
    || canonicalJson(consumer.packetProof) !== canonicalJson(packetProof)
  ) {
    throw new Error('mint-proof campaign producer-to-consumer binding changed');
  }

  const execution = Object.freeze({
    rootReceiptDigestHex,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    buildIdentityDigestHex,
    processBindingDigestHex,
    executionTargetIdentityDigestHex,
    committedVaultObservationDigestHex,
    reserveSuccessorBoxIdHex,
  });
  const proof = Object.freeze({
    mintReservationDraftDigestHex: draftDigestHex,
    statementIdHex,
    mintIdentityHex,
    sourceEvidenceReceiptDigestHex: evidenceReceiptDigestHex,
    packetReceiptDigestHex,
    packetProofReceiptDigestHex,
    sourceProofReceiptDigestHex,
    targetDescriptorDigestHex,
    frontierConsumerReceiptDigestHex,
    frontierSourceLockDigestHex: fixedHex(
      consumer.sourceLockDigestHex,
      32,
      'Frontier source lock digest',
    ),
    frontierToolchainDigestHex: fixedHex(
      consumer.toolchainDigestHex,
      32,
      'Frontier toolchain digest',
    ),
    frontierExecutionInputDigestHex: fixedHex(
      consumer.executionInputDigestHex,
      32,
      'Frontier execution input digest',
    ),
    frontierStdoutSha256Hex: fixedHex(
      consumer.stdoutSha256Hex,
      32,
      'Frontier stdout digest',
    ),
    frontierStderrSha256Hex: fixedHex(
      consumer.stderrSha256Hex,
      32,
      'Frontier stderr digest',
    ),
  });
  return Object.freeze({ execution, proof });
}

function assertExecutionProjection(value: unknown): void {
  const projection = exactRecord(value, [
    'rootReceiptDigestHex',
    'staticExecutionManifestDigestHex',
    'buildIdentityDigestHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'committedVaultObservationDigestHex',
    'reserveSuccessorBoxIdHex',
  ], 'mint-proof execution projection');
  if (
    projection.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1
  ) {
    throw new Error('mint-proof static execution manifest changed');
  }
  for (const [key, fieldValue] of Object.entries(projection)) {
    if (key !== 'staticExecutionManifestDigestHex') {
      fixedHex(fieldValue, 32, `mint-proof execution ${key}`);
    }
  }
}

function assertProofProjection(value: unknown): void {
  const projection = exactRecord(value, [
    'mintReservationDraftDigestHex',
    'statementIdHex',
    'mintIdentityHex',
    'sourceEvidenceReceiptDigestHex',
    'packetReceiptDigestHex',
    'packetProofReceiptDigestHex',
    'sourceProofReceiptDigestHex',
    'targetDescriptorDigestHex',
    'frontierConsumerReceiptDigestHex',
    'frontierSourceLockDigestHex',
    'frontierToolchainDigestHex',
    'frontierExecutionInputDigestHex',
    'frontierStdoutSha256Hex',
    'frontierStderrSha256Hex',
  ], 'mint-proof proof projection');
  for (const [key, fieldValue] of Object.entries(projection)) {
    if (key === 'statementIdHex' || key === 'mintIdentityHex') {
      fixedWireHex(fieldValue, 32, `mint-proof proof ${key}`);
    } else {
      fixedHex(fieldValue, 32, `mint-proof proof ${key}`);
    }
  }
}

function assertPegInPlan(
  value: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  if (
    !/^[1-9][0-9]*$/u.test(value.amountNanoErg)
    || BigInt(value.amountNanoErg) > ERGO_POSITIVE_LONG_MAX
    || !/^[0-9a-f]{40}$/u.test(value.recipientAddressHex)
    || /^0{40}$/u.test(value.recipientAddressHex)
  ) {
    throw new Error('mint-proof campaign peg-in plan is invalid');
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

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function fixedWireHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function assertEmbeddedDigest(
  record: Readonly<Record<string, unknown>>,
  digestKey: string,
  domain: string,
  label: string,
): string {
  const digest = fixedHex(record[digestKey], 32, `${label} digest`);
  const body = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== digestKey),
  );
  if (sha256CanonicalJson(body, domain) !== digest) {
    throw new Error(`${label} digest changed`);
  }
  return digest;
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
  ) {
    throw new Error(`${label} must be an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
    throw new Error(`${label} fields changed`);
  }
  return value as Record<string, unknown>;
}

function assertNoLocalPathValue(value: unknown): void {
  if (
    typeof value === 'string'
    && (/(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u.test(value)
      || value.startsWith('\\\\')
      || value.startsWith('//')
      || value.startsWith('file://')
      || value.startsWith('/Users/')
      || value.startsWith('/home/')
      || value.startsWith('/tmp/'))
  ) {
    throw new Error('mint-proof campaign receipt contains a local path');
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoLocalPathValue(entry);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) assertNoLocalPathValue(entry);
  }
}
