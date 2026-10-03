import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3,
  type SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
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
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import {
  assertNoLocalPathValue,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_WORKER_RECEIPT_V3_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-worker-receipt.v3' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3';
const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_WORKER_RECEIPT_V3';

const EXPECTED_ROOT_CHECKS = Object.freeze({
  setupVaultMintBurnAndCheckpointCompletedInOneTargetLifetime: true,
  compatibilityPacketReplacedByBoundContinuationV3: true,
  exactCommittedReserveBoundToMintStatement: true,
  exactCollectedEvidenceBoundToPacketProof: true,
  exactRetainedPacketConsumedByApplicationCheckpointRoot: true,
  checkpointAdmissionDerivedFromFreshVaultReobservation: true,
  everyEphemeralCapabilityDisposedBeforeReturn: true,
  returnedValueContainsCapabilities: false,
});

const EXPECTED_ROOT_BOUNDARIES = Object.freeze({
  localSyntheticCompatibilityOnly: true,
  localSetupAndValuePathBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  depositCommitmentStateEstablished: true,
  sourceEvidenceCollectionProvenanceEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  frontierApplicationBurnExecuted: true,
  federatedCheckpointAttestationEstablished: true,
  externalTargetNodeAcceptanceEstablished: false,
  sourceCanonicalityIndependentlyVerified: false,
  deterministicSourceFinalityEstablished: false,
  ergoPowAuthenticated: false,
  ergoAnchorEstablished: false,
  trackerAdmissionEstablished: false,
  globalReplayInsertionEstablished: false,
  payoutAuthorized: false,
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
  localPathsAndCapabilitiesExcluded: true,
});

const EXPECTED_WORKER_BOUNDARIES = Object.freeze({
  localSyntheticCompatibilityOnly: true,
  localSetupAndValuePathBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  frontierApplicationBurnExecuted: true,
  federatedCheckpointAttestationEstablished: true,
  externalTargetNodeAcceptanceEstablished: false,
  sourceCanonicalityIndependentlyVerified: false,
  deterministicSourceFinalityEstablished: false,
  ergoAnchorEstablished: false,
  trackerAdmissionEstablished: false,
  globalReplayInsertionEstablished: false,
  payoutAuthorized: false,
  publicNetworkUsed: false,
  realFundsUsed: false,
  existingWalletMaterialUsed: false,
  profileActivated: false,
  mintAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
});

export interface SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_WORKER_RECEIPT_V3_SCHEMA;
  readonly version: 3;
  readonly status:
    'request_bound_local_application_checkpoint_campaign_completed';
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
  readonly checks: Readonly<typeof EXPECTED_WORKER_CHECKS>;
  readonly boundaries: Readonly<typeof EXPECTED_WORKER_BOUNDARIES>;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt
  >,
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3
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
  ) {
    throw new Error(
      'application-checkpoint campaign producer-to-consumer binding changed',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_WORKER_RECEIPT_V3_SCHEMA,
    version: 3 as const,
    status:
      'request_bound_local_application_checkpoint_campaign_completed' as const,
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
    checks: EXPECTED_WORKER_CHECKS,
    boundaries: EXPECTED_WORKER_BOUNDARIES,
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'application-checkpoint campaign worker receipt');
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('application-checkpoint campaign worker output is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'application-checkpoint campaign worker output is not canonical JSON',
    );
  }
  const receipt = exactRecord(parsed, [
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
    'version',
  ], 'application-checkpoint campaign worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_WORKER_RECEIPT_V3_SCHEMA
    || receipt.version !== 3
    || receipt.status
      !== 'request_bound_local_application_checkpoint_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
  ) {
    throw new Error('application-checkpoint campaign worker identity changed');
  }
  assertPegInPlan(receipt.pegIn, expectedPegIn);
  fixedHex(receipt.rootReceiptDigestHex, 32, 'root receipt digest');
  validateExecutionProjection(receipt.execution);
  validateProofProjection(receipt.proof);
  validateApplicationProjection(receipt.application);
  validateCheckpointProjection(receipt.checkpoint);
  assertExpectedBooleanRecord(
    receipt.checks,
    EXPECTED_WORKER_CHECKS,
    'application-checkpoint campaign worker checks',
  );
  assertExpectedBooleanRecord(
    receipt.boundaries,
    EXPECTED_WORKER_BOUNDARIES,
    'application-checkpoint campaign worker boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'worker receipt digest')
      !== sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('application-checkpoint campaign worker digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'application-checkpoint campaign worker receipt');
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3
  >;
}

function validateRoot(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt
  >,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  if (
    root.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA
    || root.version !== 3
    || root.status
      !== 'committed_reserve_minted_burned_and_checkpoint_attested_in_frontier_lab'
    || root.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3
  ) {
    throw new Error('application-checkpoint campaign root identity changed');
  }
  const { receiptDigestHex, ...body } = root;
  if (
    fixedHex(receiptDigestHex, 32, 'root receipt digest')
      !== sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('application-checkpoint campaign root digest changed');
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
    throw new Error('peg-in plan differs from application-checkpoint root');
  }
}

function validateExecutionProjection(value: unknown): void {
  const record = exactRecord(value, [
    'checkpointAdmissionObservationDigestHex',
    'checkpointAdmissionObservedAtHeight',
    'committedVaultTransactionIdHex',
    'executionTargetIdentityDigestHex',
    'reserveSuccessorBoxIdHex',
  ], 'application-checkpoint execution projection');
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
  ], 'application-checkpoint proof projection');
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
  ], 'application-checkpoint application projection');
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
  ], 'application-checkpoint checkpoint projection');
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

function assertPegInPlan(
  value: unknown,
  expected: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  const record = exactRecord(
    value,
    ['amountNanoErg', 'recipientAddressHex'],
    'application-checkpoint peg-in plan',
  );
  canonicalPositiveIntegerString(record.amountNanoErg, 'peg-in amount');
  if (
    record.amountNanoErg !== expected.amountNanoErg
    || record.recipientAddressHex !== expected.recipientAddressHex
    || !/^[0-9a-f]{40}$/u.test(String(record.recipientAddressHex))
    || /^0{40}$/u.test(String(record.recipientAddressHex))
  ) {
    throw new Error('application-checkpoint peg-in plan changed');
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

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
