import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
  parseSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  type SubstrateFederatedIsolatedDevnetPegInPlanV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-receipt.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1 =
  'cbe160668ef12be1b33f77b0c7c7bbb16a6caf823ddba7260c700f13a0bf8923' as const;

const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1';
const EXECUTION_ROOT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-root.v1';
const EXECUTION_ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1';
const CHECK_ROOT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-execution-root.v1';
const CHECK_ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1';
const OUTPUT_OBSERVATION_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1';
const OUTPUT_OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1';

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_peg_in_source_lock_creation_confirmed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly root:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt>;
  readonly checkProjection:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1>;
  readonly execution: Readonly<{
    readonly expectedTxId: string;
    readonly transportStatus: 'accepted' | 'reconciled';
    readonly durableAttemptDigestHex: string;
    readonly journalDigestHex: string;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly preTransportReportDigestHex: string;
    readonly preTransportTipHeight: number;
    readonly preTransportTipHeaderIdHex: string;
    readonly outputExpectedTxId: string;
    readonly outputConfirmationDigestHex: string;
    readonly outputConfirmationHeight: number;
    readonly outputConfirmationHeaderIdHex: string;
    readonly candidateSourceLockBoxIdHex: string;
    readonly candidateTransitionFeeFundingBoxIdHex: string;
    readonly observedSourceLockBoxIdHex: string;
    readonly observedTransitionFeeFundingBoxIdHex: string;
    readonly outputObservationDigestHex: string;
    readonly primaryObservationDigestHex: string;
    readonly witnessObservationDigestHex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactRequestSha256Returned: true;
    readonly exactPegInPlanReturned: true;
    readonly executionRootReceiptDigestRecomputed: true;
    readonly checkProjectionRevalidated: true;
    readonly preTransportFundingBound: true;
    readonly exactConfirmedTransactionBound: true;
    readonly candidateOutputIdsBound: true;
    readonly outputObservationDigestRecomputed: true;
    readonly signedTransactionBytesProjected: false;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly setupSubmissionAndBroadcastExecuted: true;
    readonly valuePathLocalSyntheticSigningPerformed: true;
    readonly valuePathJvmNodeCheckPassed: true;
    readonly valuePathSubmissionExecuted: true;
    readonly valuePathBroadcastExecuted: true;
    readonly sourceLockCreationConfirmed: true;
    readonly sourceLockStillRefundable: true;
    readonly signedTransactionBytesReturnedOrPersisted: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly processLossRecoveryEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
  rootValue: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1> {
  fixedHex(commandRequestSha256Hex, 32, 'execution command request digest');
  assertPegInPlan(pegInPlan);
  const validated = validateExecutionRoot(
    rootValue,
    commandRequestSha256Hex,
    pegInPlan,
  );
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    status: 'local_peg_in_source_lock_creation_confirmed' as const,
    commandRequestSha256Hex,
    pegIn: Object.freeze({ ...pegInPlan }),
    ...validated,
    checks: Object.freeze({
      exactRequestSha256Returned: true as const,
      exactPegInPlanReturned: true as const,
      executionRootReceiptDigestRecomputed: true as const,
      checkProjectionRevalidated: true as const,
      preTransportFundingBound: true as const,
      exactConfirmedTransactionBound: true as const,
      candidateOutputIdsBound: true as const,
      outputObservationDigestRecomputed: true as const,
      signedTransactionBytesProjected: false as const,
      returnedValueContainsCapabilities: false as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      setupSubmissionAndBroadcastExecuted: true as const,
      valuePathLocalSyntheticSigningPerformed: true as const,
      valuePathJvmNodeCheckPassed: true as const,
      valuePathSubmissionExecuted: true as const,
      valuePathBroadcastExecuted: true as const,
      sourceLockCreationConfirmed: true as const,
      sourceLockStillRefundable: true as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      processLossRecoveryEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
  stdout: string,
  expectedCommandRequestSha256Hex: string,
  expectedPegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error(
      'source-lock execution worker output must be canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'commandRequestSha256Hex',
    'pegIn',
    'root',
    'checkProjection',
    'execution',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'source-lock execution worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'local_peg_in_source_lock_creation_confirmed'
    || receipt.commandRequestSha256Hex !== expectedCommandRequestSha256Hex
  ) {
    throw new Error('source-lock execution worker receipt identity changed');
  }
  fixedHex(receipt.commandRequestSha256Hex, 32, 'worker request digest');
  const pegIn = exactRecord(receipt.pegIn, [
    'amountNanoErg',
    'recipientAddressHex',
  ], 'execution worker peg-in plan');
  assertPegInPlan(pegIn as unknown as SubstrateFederatedIsolatedDevnetPegInPlanV1);
  if (
    pegIn.amountNanoErg !== expectedPegInPlan.amountNanoErg
    || pegIn.recipientAddressHex !== expectedPegInPlan.recipientAddressHex
  ) {
    throw new Error('source-lock execution worker plan changed');
  }
  const checkProjection =
    parseSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
      `${canonicalJson(receipt.checkProjection)}\n`,
      expectedCommandRequestSha256Hex,
      expectedPegInPlan,
    );
  const validatedRoot = validateExecutionRoot(
    receipt.root,
    expectedCommandRequestSha256Hex,
    expectedPegInPlan,
  );
  validateProjectedExecution(receipt.execution, checkProjection);
  if (
    canonicalJson(checkProjection)
      !== canonicalJson(validatedRoot.checkProjection)
    || canonicalJson(receipt.execution)
      !== canonicalJson(validatedRoot.execution)
  ) {
    throw new Error(
      'source-lock execution projection differs from committed root',
    );
  }
  assertExpectedBooleanRecord(receipt.checks, {
    exactRequestSha256Returned: true,
    exactPegInPlanReturned: true,
    executionRootReceiptDigestRecomputed: true,
    checkProjectionRevalidated: true,
    preTransportFundingBound: true,
    exactConfirmedTransactionBound: true,
    candidateOutputIdsBound: true,
    outputObservationDigestRecomputed: true,
    signedTransactionBytesProjected: false,
    returnedValueContainsCapabilities: false,
  }, 'execution worker checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    setupSubmissionAndBroadcastExecuted: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    valuePathSubmissionExecuted: true,
    valuePathBroadcastExecuted: true,
    sourceLockCreationConfirmed: true,
    sourceLockStillRefundable: true,
    signedTransactionBytesReturnedOrPersisted: false,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
    processLossRecoveryEstablished: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'execution worker boundaries');
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'execution worker receipt digest',
  );
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('source-lock execution worker receipt digest changed');
  }
  assertNoLocalPathValue(receipt);
  return receipt as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >;
}

function validateExecutionRoot(
  value: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Pick<
  SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
  'root' | 'checkProjection' | 'execution'
> {
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'staticExecutionManifestDigestHex',
    'build',
    'process',
    'setup',
    'pegIn',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'source-lock execution root receipt');
  if (
    receipt.schema !== EXECUTION_ROOT_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'peg_in_source_lock_creation_canonically_confirmed'
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1
  ) {
    throw new Error('source-lock execution root identity changed');
  }
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'source-lock execution root digest',
  );
  const { receiptDigestHex: _rootDigest, ...rootBody } = receipt;
  if (
    sha256CanonicalJson(rootBody, EXECUTION_ROOT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('source-lock execution root digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertExpectedBooleanRecord(receipt.checks, {
    exactCheckedCandidatePromotedOnce: true,
    sourceFundingRevalidatedImmediatelyBeforeAuthorization: true,
    durableReservationPrecededTransport: true,
    exactLoopbackTransportConsumedCheckedBytesOnce: true,
    canonicalConfirmationObservedByBothNodes: true,
    exactSourceSpentAndOutputsObserved: true,
    returnedValueContainsCapabilities: false,
  }, 'source-lock execution root checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    valuePathSubmissionExecuted: true,
    valuePathBroadcastExecuted: true,
    sourceLockCreationConfirmed: true,
    sourceLockStillRefundable: true,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    processLossRecoveryEstablished: false,
    sourceConsensusIndependentlyAuthenticated: false,
    ergoConsensusIndependentlyAuthenticated: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'source-lock execution root boundaries');
  const pegIn = exactRecord(receipt.pegIn, [
    'fundingObservation',
    'candidate',
    'sourceLockCheck',
    'sourceLockExecution',
  ], 'source-lock execution peg-in result');
  const funding = exactRecord(pegIn.fundingObservation, [
    'reportDigestHex',
    'observedAt',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'genesisHeaderIdHex',
    'tipHeight',
    'tipHeaderIdHex',
    'sourceFundingBoxIdHex',
    'sourceFundingBoxDigestHex',
    'postCandidateReportDigestHex',
    'postCandidateTipHeight',
    'postCandidateTipHeaderIdHex',
    'postCheckReportDigestHex',
    'postCheckTipHeight',
    'postCheckTipHeaderIdHex',
    'preTransportReportDigestHex',
    'preTransportTipHeight',
    'preTransportTipHeaderIdHex',
  ], 'source-lock execution funding observation');
  if (
    !positiveSafeInteger(funding.postCheckTipHeight)
    || !positiveSafeInteger(funding.preTransportTipHeight)
    || funding.preTransportTipHeight < funding.postCheckTipHeight
  ) {
    throw new Error('source-lock execution pre-transport funding changed');
  }
  for (const [key, field] of Object.entries(funding)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `execution funding ${key}`);
  }
  const {
    preTransportReportDigestHex: _preTransportReport,
    preTransportTipHeight: _preTransportHeight,
    preTransportTipHeaderIdHex: _preTransportHeader,
    ...checkFunding
  } = funding;
  const checkRootBody = Object.freeze({
    schema: CHECK_ROOT_SCHEMA,
    version: 1 as const,
    status: 'setup_confirmed_and_peg_in_source_lock_node_check_passed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: receipt.build,
    process: receipt.process,
    setup: receipt.setup,
    pegIn: Object.freeze({
      fundingObservation: Object.freeze(checkFunding),
      candidate: pegIn.candidate,
      sourceLockCheck: pegIn.sourceLockCheck,
    }),
    checks: Object.freeze({
      setupCandidateAndCheckCompletedInOneTargetLifetime: true as const,
      exactCandidateFundingAndUnsignedTransactionBound: true as const,
      sourceFundingRevalidatedImmediatelyBeforeSigning: true as const,
      sourceFundingRevalidatedAfterNodeCheck: true as const,
      exactSameNodeSigningContextAndJvmCheckUsed: true as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      returnedValueContainsCapabilities: false as const,
    }),
    boundaries: Object.freeze({
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
    }),
  });
  const checkProjection =
    buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
      Object.freeze({
        ...checkRootBody,
        receiptDigestHex: sha256CanonicalJson(
          checkRootBody,
          CHECK_ROOT_DIGEST_DOMAIN,
        ),
      }),
      commandRequestSha256Hex,
      pegInPlan,
    );
  const candidateOutputIds = extractCandidateOutputIds(pegIn.candidate);
  const execution = validateExecution(
    pegIn.sourceLockExecution,
    funding,
    checkProjection,
    candidateOutputIds,
  );
  return Object.freeze({
    root: Object.freeze(receipt) as unknown as Readonly<
      SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt
    >,
    checkProjection,
    execution,
  });
}

function extractCandidateOutputIds(value: unknown): Readonly<{
  sourceLockBoxIdHex: string;
  transitionFeeFundingBoxIdHex: string;
}> {
  const candidate = plainRecord(value, 'execution candidate');
  const packet = plainRecord(candidate.depositPacket, 'execution deposit packet');
  const boxes = plainRecord(packet.boxes, 'execution deposit boxes');
  const sourceLock = plainRecord(boxes.sourceLock, 'execution source-lock box');
  const transitionFeeFunding = plainRecord(
    boxes.transitionFeeFunding,
    'execution transition-fee box',
  );
  return Object.freeze({
    sourceLockBoxIdHex: fixedHex(
      sourceLock.boxId,
      32,
      'candidate source-lock box ID',
    ),
    transitionFeeFundingBoxIdHex: fixedHex(
      transitionFeeFunding.boxId,
      32,
      'candidate transition-fee box ID',
    ),
  });
}

function validateExecution(
  value: unknown,
  funding: Readonly<Record<string, unknown>>,
  checkProjection:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1>,
  candidateOutputIds: Readonly<{
    sourceLockBoxIdHex: string;
    transitionFeeFundingBoxIdHex: string;
  }>,
): SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1['execution'] {
  const execution = exactRecord(value, [
    'expectedTxId',
    'transportStatus',
    'durableAttemptDigestHex',
    'journalDigestHex',
    'confirmationDigestHex',
    'confirmationHeight',
    'confirmationHeaderIdHex',
    'outputObservation',
  ], 'source-lock execution result');
  if (
    (execution.transportStatus !== 'accepted'
      && execution.transportStatus !== 'reconciled')
    || !positiveSafeInteger(execution.confirmationHeight)
  ) {
    throw new Error('source-lock execution result changed');
  }
  if (
    (funding.postCheckTipHeight as number)
      > (funding.preTransportTipHeight as number)
    || (funding.preTransportTipHeight as number)
      > execution.confirmationHeight
    || execution.confirmationHeight > checkProjection.target.finalHeight
  ) {
    throw new Error('source-lock execution chronology changed');
  }
  for (const [key, field] of Object.entries(execution)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `source-lock execution ${key}`);
  }
  const output = exactRecord(execution.outputObservation, [
    'schema',
    'version',
    'status',
    'expectedTxId',
    'sourceFundingBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'confirmationHeight',
    'confirmationHeaderIdHex',
    'confirmationObservationDigestHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'primaryObservationDigestHex',
    'witnessObservationDigestHex',
    'boundaries',
    'observationDigestHex',
  ], 'source-lock output observation');
  if (
    output.schema !== OUTPUT_OBSERVATION_SCHEMA
    || output.version !== 1
    || output.status !== 'exact_source_spent_and_refundable_outputs_unspent'
    || !positiveSafeInteger(output.confirmationHeight)
  ) {
    throw new Error('source-lock output observation identity changed');
  }
  for (const [key, field] of Object.entries(output)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `source-lock output ${key}`);
  }
  assertExpectedBooleanRecord(output.boundaries, {
    exactDualLoopbackNodesAgreed: true,
    sourceFundingSpent: true,
    sourceLockUnspentAndExact: true,
    transitionFeeFundingUnspentAndExact: true,
    sourceLockStillRefundable: true,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
  }, 'source-lock output boundaries');
  const { observationDigestHex, ...outputBody } = output;
  if (
    sha256CanonicalJson(outputBody, OUTPUT_OBSERVATION_DIGEST_DOMAIN)
      !== observationDigestHex
    || execution.expectedTxId
      !== checkProjection.candidate.sourceLockTransactionIdHex
    || output.expectedTxId !== execution.expectedTxId
    || output.sourceFundingBoxIdHex
      !== checkProjection.candidate.sourceFundingBoxIdHex
    || output.sourceLockBoxIdHex !== candidateOutputIds.sourceLockBoxIdHex
    || output.transitionFeeFundingBoxIdHex
      !== candidateOutputIds.transitionFeeFundingBoxIdHex
    || output.confirmationHeight !== execution.confirmationHeight
    || output.confirmationHeaderIdHex !== execution.confirmationHeaderIdHex
    || output.confirmationObservationDigestHex
      !== execution.confirmationDigestHex
    || output.processBindingDigestHex
      !== checkProjection.target.processBindingDigestHex
    || output.executionTargetIdentityDigestHex
      !== checkProjection.target.executionTargetIdentityDigestHex
    || output.primaryObservationDigestHex
      !== output.witnessObservationDigestHex
  ) {
    throw new Error('source-lock execution and output binding changed');
  }
  return Object.freeze({
    expectedTxId: execution.expectedTxId as string,
    transportStatus: execution.transportStatus as 'accepted' | 'reconciled',
    durableAttemptDigestHex: execution.durableAttemptDigestHex as string,
    journalDigestHex: execution.journalDigestHex as string,
    confirmationDigestHex: execution.confirmationDigestHex as string,
    confirmationHeight: execution.confirmationHeight as number,
    confirmationHeaderIdHex: execution.confirmationHeaderIdHex as string,
    preTransportReportDigestHex:
      funding.preTransportReportDigestHex as string,
    preTransportTipHeight: funding.preTransportTipHeight as number,
    preTransportTipHeaderIdHex:
      funding.preTransportTipHeaderIdHex as string,
    outputExpectedTxId: output.expectedTxId as string,
    outputConfirmationDigestHex:
      output.confirmationObservationDigestHex as string,
    outputConfirmationHeight: output.confirmationHeight as number,
    outputConfirmationHeaderIdHex:
      output.confirmationHeaderIdHex as string,
    candidateSourceLockBoxIdHex: candidateOutputIds.sourceLockBoxIdHex,
    candidateTransitionFeeFundingBoxIdHex:
      candidateOutputIds.transitionFeeFundingBoxIdHex,
    observedSourceLockBoxIdHex: output.sourceLockBoxIdHex as string,
    observedTransitionFeeFundingBoxIdHex:
      output.transitionFeeFundingBoxIdHex as string,
    outputObservationDigestHex: observationDigestHex as string,
    primaryObservationDigestHex: output.primaryObservationDigestHex as string,
    witnessObservationDigestHex: output.witnessObservationDigestHex as string,
  });
}

function validateProjectedExecution(
  value: unknown,
  checkProjection:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1>,
): void {
  const execution = exactRecord(value, [
    'expectedTxId',
    'transportStatus',
    'durableAttemptDigestHex',
    'journalDigestHex',
    'confirmationDigestHex',
    'confirmationHeight',
    'confirmationHeaderIdHex',
    'preTransportReportDigestHex',
    'preTransportTipHeight',
    'preTransportTipHeaderIdHex',
    'outputExpectedTxId',
    'outputConfirmationDigestHex',
    'outputConfirmationHeight',
    'outputConfirmationHeaderIdHex',
    'candidateSourceLockBoxIdHex',
    'candidateTransitionFeeFundingBoxIdHex',
    'observedSourceLockBoxIdHex',
    'observedTransitionFeeFundingBoxIdHex',
    'outputObservationDigestHex',
    'primaryObservationDigestHex',
    'witnessObservationDigestHex',
  ], 'projected source-lock execution');
  for (const [key, field] of Object.entries(execution)) {
    if (key.endsWith('Hex') || key === 'expectedTxId') {
      fixedHex(field, 32, `projected source-lock execution ${key}`);
    }
  }
  if (
    (execution.transportStatus !== 'accepted'
      && execution.transportStatus !== 'reconciled')
    || !positiveSafeInteger(execution.confirmationHeight)
    || !positiveSafeInteger(execution.preTransportTipHeight)
    || execution.preTransportTipHeight
      < checkProjection.funding.postCheckTipHeight
    || execution.preTransportTipHeight > execution.confirmationHeight
    || execution.confirmationHeight > checkProjection.target.finalHeight
    || execution.expectedTxId
      !== checkProjection.candidate.sourceLockTransactionIdHex
    || execution.outputExpectedTxId !== execution.expectedTxId
    || execution.outputConfirmationDigestHex
      !== execution.confirmationDigestHex
    || execution.outputConfirmationHeight !== execution.confirmationHeight
    || execution.outputConfirmationHeaderIdHex
      !== execution.confirmationHeaderIdHex
    || execution.candidateSourceLockBoxIdHex
      !== execution.observedSourceLockBoxIdHex
    || execution.candidateTransitionFeeFundingBoxIdHex
      !== execution.observedTransitionFeeFundingBoxIdHex
    || execution.primaryObservationDigestHex
      !== execution.witnessObservationDigestHex
  ) {
    throw new Error('projected source-lock execution binding changed');
  }
}

function assertPegInPlan(
  value: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): void {
  if (
    !/^[1-9][0-9]*$/u.test(value.amountNanoErg)
    || BigInt(value.amountNanoErg) > 0x7fff_ffff_ffff_ffffn
    || !/^[0-9a-f]{40}$/u.test(value.recipientAddressHex)
    || /^0{40}$/u.test(value.recipientAddressHex)
  ) {
    throw new Error('isolated peg-in source-lock execution plan is invalid');
  }
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const record = exactRecord(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) throw new Error(`${label} changed`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hexadecimal bytes`);
  }
  return value;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = plainRecord(value, label);
  if (
    JSON.stringify(Object.keys(record).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields differ from V1`);
  }
  return record;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNoLocalPathValue(value: unknown): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (
        /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/)/u.test(current)
      )
    ) {
      throw new Error('source-lock execution receipt must not contain local paths');
    }
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}
