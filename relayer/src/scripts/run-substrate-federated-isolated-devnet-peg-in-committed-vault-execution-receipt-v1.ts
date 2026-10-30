import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
  parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-receipt-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-execution-worker-receipt.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1 =
  '3089d13a6066a9cbde0f8d23af3d1bc1d197f8fe1fcfe40e7d4e610a4f51521e' as const;

const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1';
const EXECUTION_ROOT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-execution-root.v1';
const EXECUTION_ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1';
const SOURCE_LOCK_ROOT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-root.v1';
const SOURCE_LOCK_ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1';
const COMMITTED_VAULT_CHECK_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1';
const COMMITTED_VAULT_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1';
const COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_TRANSACTION_V1';
const PRE_TRANSPORT_OBSERVATION_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-pre-transport-observation.v1';
const PRE_TRANSPORT_OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1';
const OUTPUT_OBSERVATION_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1';
const OUTPUT_OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1';

const SOURCE_LOCK_ROOT_CHECKS = Object.freeze({
  exactCheckedCandidatePromotedOnce: true,
  sourceFundingRevalidatedImmediatelyBeforeAuthorization: true,
  durableReservationPrecededTransport: true,
  exactLoopbackTransportConsumedCheckedBytesOnce: true,
  canonicalConfirmationObservedByBothNodes: true,
  exactSourceSpentAndOutputsObserved: true,
  returnedValueContainsCapabilities: false,
});

const SOURCE_LOCK_ROOT_BOUNDARIES = Object.freeze({
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
});

interface CandidateBindingsV1 {
  readonly sourceFundingBoxIdHex: string;
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly reserveSuccessorBoxIdHex: string;
  readonly reserveTransitionTxIdHex: string;
  readonly reserveTransitionDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_peg_in_committed_vault_transition_confirmed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt
  >;
  readonly sourceLockProjection: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >;
  readonly execution: Readonly<{
    readonly expectedTxId: string;
    readonly transportStatus: 'accepted' | 'reconciled';
    readonly durableAttemptDigestHex: string;
    readonly journalDigestHex: string;
    readonly committedVaultCheckReceiptDigestHex: string;
    readonly committedVaultCheckTipHeight: number;
    readonly committedVaultCheckTipHeaderIdHex: string;
    readonly unsignedTransactionDigestHex: string;
    readonly signedTransactionCanonicalJsonSha256Hex: string;
    readonly signedTransactionBytesSha256Hex: string;
    readonly signedTransactionBytesLength: number;
    readonly preTransportObservationDigestHex: string;
    readonly preTransportTipHeight: number;
    readonly preTransportTipHeaderIdHex: string;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly outputObservationDigestHex: string;
    readonly outputTipHeight: number;
    readonly outputTipHeaderIdHex: string;
    readonly sourceFundingBoxIdHex: string;
    readonly reservePredecessorBoxIdHex: string;
    readonly sourceLockBoxIdHex: string;
    readonly transitionFeeFundingBoxIdHex: string;
    readonly reserveSuccessorBoxIdHex: string;
    readonly preTransportPrimaryObservationDigestHex: string;
    readonly preTransportWitnessObservationDigestHex: string;
    readonly outputPrimaryObservationDigestHex: string;
    readonly outputWitnessObservationDigestHex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactRequestSha256Returned: true;
    readonly exactPegInPlanReturned: true;
    readonly executionRootReceiptDigestRecomputed: true;
    readonly sourceLockProjectionRevalidated: true;
    readonly committedVaultCheckDigestRecomputed: true;
    readonly exactTransitionCandidateBound: true;
    readonly preTransportObservationDigestRecomputed: true;
    readonly outputObservationDigestRecomputed: true;
    readonly refreshedConfirmationBound: true;
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
    readonly sourceLockStillRefundable: false;
    readonly signedTransactionBytesReturnedOrPersisted: false;
    readonly sourceLockConsumptionEstablished: true;
    readonly reserveLineageEstablished: true;
    readonly depositCommitmentStateEstablished: true;
    readonly mintAuthorized: false;
    readonly processLossRecoveryEstablished: false;
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

export function buildSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1(
  rootValue: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1> {
  fixedHex(commandRequestSha256Hex, 32, 'committed-vault command request digest');
  assertPegInPlan(pegInPlan);
  const validated = validateExecutionRoot(
    rootValue,
    commandRequestSha256Hex,
    pegInPlan,
  );
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    status: 'local_peg_in_committed_vault_transition_confirmed' as const,
    commandRequestSha256Hex,
    pegIn: Object.freeze({ ...pegInPlan }),
    ...validated,
    checks: Object.freeze({
      exactRequestSha256Returned: true as const,
      exactPegInPlanReturned: true as const,
      executionRootReceiptDigestRecomputed: true as const,
      sourceLockProjectionRevalidated: true as const,
      committedVaultCheckDigestRecomputed: true as const,
      exactTransitionCandidateBound: true as const,
      preTransportObservationDigestRecomputed: true as const,
      outputObservationDigestRecomputed: true as const,
      refreshedConfirmationBound: true as const,
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
      sourceLockStillRefundable: false as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      depositCommitmentStateEstablished: true as const,
      mintAuthorized: false as const,
      processLossRecoveryEstablished: false as const,
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
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1(
  stdout: string,
  expectedCommandRequestSha256Hex: string,
  expectedPegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error(
      'committed-vault execution worker output must be canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'commandRequestSha256Hex',
    'pegIn',
    'root',
    'sourceLockProjection',
    'execution',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'committed-vault execution worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'local_peg_in_committed_vault_transition_confirmed'
    || receipt.commandRequestSha256Hex !== expectedCommandRequestSha256Hex
  ) {
    throw new Error('committed-vault execution worker receipt identity changed');
  }
  fixedHex(receipt.commandRequestSha256Hex, 32, 'worker request digest');
  const pegIn = exactRecord(receipt.pegIn, [
    'amountNanoErg',
    'recipientAddressHex',
  ], 'committed-vault execution worker peg-in plan');
  assertPegInPlan(pegIn as unknown as SubstrateFederatedIsolatedDevnetPegInPlanV1);
  if (
    pegIn.amountNanoErg !== expectedPegInPlan.amountNanoErg
    || pegIn.recipientAddressHex !== expectedPegInPlan.recipientAddressHex
  ) {
    throw new Error('committed-vault execution worker plan changed');
  }
  const validated = validateExecutionRoot(
    receipt.root,
    expectedCommandRequestSha256Hex,
    expectedPegInPlan,
  );
  const sourceLockProjection =
    parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
      `${canonicalJson(receipt.sourceLockProjection)}\n`,
      expectedCommandRequestSha256Hex,
      expectedPegInPlan,
    );
  assertExecutionProjection(receipt.execution);
  if (
    canonicalJson(sourceLockProjection)
      !== canonicalJson(validated.sourceLockProjection)
    || canonicalJson(receipt.execution) !== canonicalJson(validated.execution)
  ) {
    throw new Error(
      'committed-vault execution projection differs from committed root',
    );
  }
  assertExpectedBooleanRecord(receipt.checks, {
    exactRequestSha256Returned: true,
    exactPegInPlanReturned: true,
    executionRootReceiptDigestRecomputed: true,
    sourceLockProjectionRevalidated: true,
    committedVaultCheckDigestRecomputed: true,
    exactTransitionCandidateBound: true,
    preTransportObservationDigestRecomputed: true,
    outputObservationDigestRecomputed: true,
    refreshedConfirmationBound: true,
    signedTransactionBytesProjected: false,
    returnedValueContainsCapabilities: false,
  }, 'committed-vault execution worker checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    setupSubmissionAndBroadcastExecuted: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    valuePathSubmissionExecuted: true,
    valuePathBroadcastExecuted: true,
    sourceLockCreationConfirmed: true,
    sourceLockStillRefundable: false,
    signedTransactionBytesReturnedOrPersisted: false,
    sourceLockConsumptionEstablished: true,
    reserveLineageEstablished: true,
    depositCommitmentStateEstablished: true,
    mintAuthorized: false,
    processLossRecoveryEstablished: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    sourceConsensusIndependentlyAuthenticated: false,
    ergoConsensusIndependentlyAuthenticated: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'committed-vault execution worker boundaries');
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'committed-vault execution worker receipt digest',
  );
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('committed-vault execution worker receipt digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return receipt as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1
  >;
}

function validateExecutionRoot(
  value: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Pick<
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1,
  'root' | 'sourceLockProjection' | 'execution'
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
  ], 'committed-vault execution root receipt');
  if (
    receipt.schema !== EXECUTION_ROOT_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'peg_in_source_lock_consumed_into_committed_reserve'
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1
  ) {
    throw new Error('committed-vault execution root identity changed');
  }
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'committed-vault execution root digest',
  );
  const { receiptDigestHex: _rootDigest, ...rootBody } = receipt;
  if (
    sha256CanonicalJson(rootBody, EXECUTION_ROOT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('committed-vault execution root digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertExpectedBooleanRecord(receipt.checks, {
    sourceLockConfirmedBeforeCommittedVaultCheck: true,
    exactThreeInputTransitionCheckedAndRevalidated: true,
    freshJvmCheckPrecededAuthorization: true,
    durableReservationPrecededTransport: true,
    exactLoopbackTransportConsumedCheckedBytesOnce: true,
    canonicalConfirmationObservedByBothNodes: true,
    exactTransitionInputsSpentAndReserveSuccessorObserved: true,
    returnedValueContainsCapabilities: false,
  }, 'committed-vault execution root checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    valuePathSubmissionExecuted: true,
    valuePathBroadcastExecuted: true,
    sourceLockCreationConfirmed: true,
    sourceLockStillRefundable: false,
    sourceLockConsumptionEstablished: true,
    reserveLineageEstablished: true,
    depositCommitmentStateEstablished: true,
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
  }, 'committed-vault execution root boundaries');
  const pegIn = exactRecord(receipt.pegIn, [
    'fundingObservation',
    'candidate',
    'sourceLockCheck',
    'sourceLockExecution',
    'committedVaultCheck',
    'committedVaultExecution',
  ], 'committed-vault execution peg-in result');
  const sourceLockRootBody = Object.freeze({
    schema: SOURCE_LOCK_ROOT_SCHEMA,
    version: 1 as const,
    status: 'peg_in_source_lock_creation_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
    build: receipt.build,
    process: receipt.process,
    setup: receipt.setup,
    pegIn: Object.freeze({
      fundingObservation: pegIn.fundingObservation,
      candidate: pegIn.candidate,
      sourceLockCheck: pegIn.sourceLockCheck,
      sourceLockExecution: pegIn.sourceLockExecution,
    }),
    checks: SOURCE_LOCK_ROOT_CHECKS,
    boundaries: SOURCE_LOCK_ROOT_BOUNDARIES,
  });
  const sourceLockProjection =
    buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
      Object.freeze({
        ...sourceLockRootBody,
        receiptDigestHex: sha256CanonicalJson(
          sourceLockRootBody,
          SOURCE_LOCK_ROOT_DIGEST_DOMAIN,
        ),
      }),
      commandRequestSha256Hex,
      pegInPlan,
    );
  const candidate = extractCandidateBindings(pegIn.candidate);
  const check = validateCommittedVaultCheck(
    pegIn.committedVaultCheck,
    candidate,
    sourceLockProjection,
  );
  const execution = validateExecution(
    pegIn.committedVaultExecution,
    check,
    candidate,
    sourceLockProjection,
  );
  return Object.freeze({
    root: Object.freeze(receipt) as unknown as Readonly<
      SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt
    >,
    sourceLockProjection,
    execution,
  });
}

function extractCandidateBindings(value: unknown): CandidateBindingsV1 {
  const candidate = plainRecord(value, 'committed-vault execution candidate');
  const packet = plainRecord(
    candidate.depositPacket,
    'committed-vault execution deposit packet',
  );
  const boxes = plainRecord(packet.boxes, 'committed-vault execution boxes');
  const transactions = plainRecord(
    packet.transactions,
    'committed-vault execution transactions',
  );
  const reserveTransition = plainRecord(
    transactions.reserveTransition,
    'committed-vault reserve transition',
  );
  return Object.freeze({
    sourceFundingBoxIdHex: boxId(
      boxes.sourceFundingInput,
      'committed-vault source funding box',
    ),
    reservePredecessorBoxIdHex: boxId(
      boxes.reservePredecessor,
      'committed-vault reserve predecessor',
    ),
    sourceLockBoxIdHex: boxId(
      boxes.sourceLock,
      'committed-vault source lock',
    ),
    transitionFeeFundingBoxIdHex: boxId(
      boxes.transitionFeeFunding,
      'committed-vault transition fee funding',
    ),
    reserveSuccessorBoxIdHex: boxId(
      boxes.reserveSuccessor,
      'committed-vault reserve successor',
    ),
    reserveTransitionTxIdHex: fixedHex(
      reserveTransition.txId,
      32,
      'committed-vault reserve transition transaction ID',
    ),
    reserveTransitionDigestHex: sha256CanonicalJson(
      reserveTransition,
      COMMITTED_VAULT_TRANSACTION_DIGEST_DOMAIN,
    ),
  });
}

function validateCommittedVaultCheck(
  value: unknown,
  candidate: Readonly<CandidateBindingsV1>,
  sourceLock: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >,
): Readonly<Record<string, unknown>> {
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'unsignedTransactionIdHex',
    'unsignedTransactionDigestHex',
    'signedTransactionIdHex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionBytesSha256Hex',
    'signedTransactionBytesLength',
    'checkResponseSha256Hex',
    'target',
    'signer',
    'checker',
    'boundaries',
    'receiptDigestHex',
  ], 'committed-vault check receipt');
  if (
    receipt.schema !== COMMITTED_VAULT_CHECK_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'PASS'
    || !positiveSafeInteger(receipt.signedTransactionBytesLength)
  ) {
    throw new Error('committed-vault check identity changed');
  }
  for (const key of [
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'unsignedTransactionIdHex',
    'unsignedTransactionDigestHex',
    'signedTransactionIdHex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionBytesSha256Hex',
    'checkResponseSha256Hex',
    'receiptDigestHex',
  ]) {
    fixedHex(receipt[key], 32, `committed-vault check ${key}`);
  }
  const target = exactRecord(receipt.target, [
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
  ], 'committed-vault check target');
  fixedHex(target.processBindingDigestHex, 32, 'committed-vault process binding');
  fixedHex(
    target.executionTargetIdentityDigestHex,
    32,
    'committed-vault execution target identity',
  );
  const signer = exactRecord(receipt.signer, [
    'derivation',
    'publicKeyHex',
    'p2pkErgoTreeHex',
    'stateContextTipHeight',
    'stateContextTipIdHex',
  ], 'committed-vault check signer');
  if (
    signer.derivation !== 'wasm-root'
    || !positiveSafeInteger(signer.stateContextTipHeight)
  ) {
    throw new Error('committed-vault signer identity changed');
  }
  fixedHex(signer.publicKeyHex, 33, 'committed-vault signer public key');
  lowerEvenHex(signer.p2pkErgoTreeHex, 'committed-vault signer ErgoTree');
  fixedHex(signer.stateContextTipIdHex, 32, 'committed-vault signer state tip');
  const checker = exactRecord(receipt.checker, [
    'nodeOrigin',
    'path',
    'method',
    'transportPolicy',
  ], 'committed-vault checker');
  if (
    checker.nodeOrigin !== 'http://127.0.0.1:9051'
    || checker.path !== '/transactions/check'
    || checker.method !== 'POST'
    || checker.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('committed-vault checker changed');
  }
  assertExpectedBooleanRecord(receipt.boundaries, {
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
  }, 'committed-vault check boundaries');
  const checkTipHeight = signer.stateContextTipHeight as number;
  if (
    checkTipHeight < sourceLock.execution.confirmationHeight
    || (
      checkTipHeight === sourceLock.execution.confirmationHeight
      && signer.stateContextTipIdHex
        !== sourceLock.execution.confirmationHeaderIdHex
    )
  ) {
    throw new Error('committed-vault check chronology changed');
  }
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, COMMITTED_VAULT_CHECK_DIGEST_DOMAIN)
      !== receipt.receiptDigestHex
    || receipt.reservePredecessorBoxIdHex
      !== candidate.reservePredecessorBoxIdHex
    || receipt.sourceLockBoxIdHex !== candidate.sourceLockBoxIdHex
    || receipt.transitionFeeFundingBoxIdHex
      !== candidate.transitionFeeFundingBoxIdHex
    || receipt.unsignedTransactionIdHex !== candidate.reserveTransitionTxIdHex
    || receipt.signedTransactionIdHex !== candidate.reserveTransitionTxIdHex
    || receipt.unsignedTransactionDigestHex
      !== candidate.reserveTransitionDigestHex
    || target.processBindingDigestHex
      !== sourceLock.checkProjection.target.processBindingDigestHex
    || target.executionTargetIdentityDigestHex
      !== sourceLock.checkProjection.target.executionTargetIdentityDigestHex
    || signer.publicKeyHex
      !== sourceLock.checkProjection.check.signerPublicKeyHex
    || signer.p2pkErgoTreeHex
      !== sourceLock.checkProjection.check.signerP2pkErgoTreeHex
  ) {
    throw new Error('committed-vault check binding changed');
  }
  return Object.freeze(receipt);
}

function validateExecution(
  value: unknown,
  check: Readonly<Record<string, unknown>>,
  candidate: Readonly<CandidateBindingsV1>,
  sourceLock: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >,
): SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1['execution'] {
  const execution = exactRecord(value, [
    'expectedTxId',
    'transportStatus',
    'durableAttemptDigestHex',
    'journalDigestHex',
    'confirmationDigestHex',
    'confirmationHeight',
    'confirmationHeaderIdHex',
    'preTransportObservation',
    'outputObservation',
  ], 'committed-vault execution result');
  if (
    (execution.transportStatus !== 'accepted'
      && execution.transportStatus !== 'reconciled')
    || !positiveSafeInteger(execution.confirmationHeight)
  ) {
    throw new Error('committed-vault execution result changed');
  }
  for (const key of [
    'expectedTxId',
    'durableAttemptDigestHex',
    'journalDigestHex',
    'confirmationDigestHex',
    'confirmationHeaderIdHex',
  ]) {
    fixedHex(execution[key], 32, `committed-vault execution ${key}`);
  }
  const preTransport = validatePreTransportObservation(
    execution.preTransportObservation,
    candidate,
    sourceLock,
  );
  const output = validateOutputObservation(
    execution.outputObservation,
    candidate,
    sourceLock,
  );
  const preTransportTipHeight = preTransport.observedTipHeight as number;
  const outputTipHeight = output.observedTipHeight as number;
  const checkSigner = plainRecord(
    check.signer,
    'validated committed-vault check signer',
  );
  const committedVaultCheckTipHeight =
    checkSigner.stateContextTipHeight as number;
  const committedVaultCheckTipHeaderIdHex =
    checkSigner.stateContextTipIdHex as string;
  if (
    execution.expectedTxId !== candidate.reserveTransitionTxIdHex
    || preTransport.expectedTxId !== execution.expectedTxId
    || output.expectedTxId !== execution.expectedTxId
    || output.confirmationHeight !== execution.confirmationHeight
    || output.confirmationHeaderIdHex !== execution.confirmationHeaderIdHex
    || output.confirmationObservationDigestHex
      !== execution.confirmationDigestHex
    || committedVaultCheckTipHeight > preTransportTipHeight
    || (
      committedVaultCheckTipHeight === preTransportTipHeight
      && committedVaultCheckTipHeaderIdHex
        !== preTransport.observedTipHeaderIdHex
    )
    || sourceLock.execution.confirmationHeight
      > preTransportTipHeight
    || preTransportTipHeight > execution.confirmationHeight
    || execution.confirmationHeight > outputTipHeight
    || outputTipHeight > sourceLock.checkProjection.target.finalHeight
  ) {
    throw new Error('committed-vault execution chronology or binding changed');
  }
  return Object.freeze({
    expectedTxId: execution.expectedTxId as string,
    transportStatus: execution.transportStatus as 'accepted' | 'reconciled',
    durableAttemptDigestHex: execution.durableAttemptDigestHex as string,
    journalDigestHex: execution.journalDigestHex as string,
    committedVaultCheckReceiptDigestHex: check.receiptDigestHex as string,
    committedVaultCheckTipHeight,
    committedVaultCheckTipHeaderIdHex,
    unsignedTransactionDigestHex: check.unsignedTransactionDigestHex as string,
    signedTransactionCanonicalJsonSha256Hex:
      check.signedTransactionCanonicalJsonSha256Hex as string,
    signedTransactionBytesSha256Hex:
      check.signedTransactionBytesSha256Hex as string,
    signedTransactionBytesLength: check.signedTransactionBytesLength as number,
    preTransportObservationDigestHex:
      preTransport.observationDigestHex as string,
    preTransportTipHeight,
    preTransportTipHeaderIdHex: preTransport.observedTipHeaderIdHex as string,
    confirmationDigestHex: execution.confirmationDigestHex as string,
    confirmationHeight: execution.confirmationHeight as number,
    confirmationHeaderIdHex: execution.confirmationHeaderIdHex as string,
    outputObservationDigestHex: output.observationDigestHex as string,
    outputTipHeight,
    outputTipHeaderIdHex: output.observedTipHeaderIdHex as string,
    sourceFundingBoxIdHex: candidate.sourceFundingBoxIdHex,
    reservePredecessorBoxIdHex: candidate.reservePredecessorBoxIdHex,
    sourceLockBoxIdHex: candidate.sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex: candidate.transitionFeeFundingBoxIdHex,
    reserveSuccessorBoxIdHex: candidate.reserveSuccessorBoxIdHex,
    preTransportPrimaryObservationDigestHex:
      preTransport.primaryObservationDigestHex as string,
    preTransportWitnessObservationDigestHex:
      preTransport.witnessObservationDigestHex as string,
    outputPrimaryObservationDigestHex:
      output.primaryObservationDigestHex as string,
    outputWitnessObservationDigestHex:
      output.witnessObservationDigestHex as string,
  });
}

function validatePreTransportObservation(
  value: unknown,
  candidate: Readonly<CandidateBindingsV1>,
  sourceLock: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >,
): Readonly<Record<string, unknown>> {
  const observation = exactRecord(value, [
    'schema',
    'version',
    'status',
    'expectedTxId',
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'sourceLockConfirmationHeight',
    'sourceLockConfirmationDigestHex',
    'observedTipHeight',
    'observedTipHeaderIdHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'primaryObservationDigestHex',
    'witnessObservationDigestHex',
    'boundaries',
    'observationDigestHex',
  ], 'committed-vault pre-transport observation');
  if (
    observation.schema !== PRE_TRANSPORT_OBSERVATION_SCHEMA
    || observation.version !== 1
    || observation.status
      !== 'exact_transition_inputs_unspent_and_dual_node_equal'
    || !positiveSafeInteger(observation.sourceLockConfirmationHeight)
    || !positiveSafeInteger(observation.observedTipHeight)
  ) {
    throw new Error('committed-vault pre-transport observation changed');
  }
  for (const [key, field] of Object.entries(observation)) {
    if (key.endsWith('Hex')) {
      fixedHex(field, 32, `committed-vault pre-transport ${key}`);
    }
  }
  assertExpectedBooleanRecord(observation.boundaries, {
    exactDualLoopbackNodesAgreed: true,
    originalSourceFundingRemainsSpent: true,
    exactReservePredecessorUnspent: true,
    exactSourceLockUnspent: true,
    exactTransitionFeeFundingUnspent: true,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
  }, 'committed-vault pre-transport boundaries');
  const { observationDigestHex: _digest, ...body } = observation;
  if (
    sha256CanonicalJson(body, PRE_TRANSPORT_OBSERVATION_DIGEST_DOMAIN)
      !== observation.observationDigestHex
    || observation.expectedTxId !== candidate.reserveTransitionTxIdHex
    || observation.reservePredecessorBoxIdHex
      !== candidate.reservePredecessorBoxIdHex
    || observation.sourceLockBoxIdHex !== candidate.sourceLockBoxIdHex
    || observation.transitionFeeFundingBoxIdHex
      !== candidate.transitionFeeFundingBoxIdHex
    || observation.sourceLockConfirmationHeight
      !== sourceLock.execution.confirmationHeight
    || observation.sourceLockConfirmationDigestHex
      !== sourceLock.execution.confirmationDigestHex
    || observation.processBindingDigestHex
      !== sourceLock.checkProjection.target.processBindingDigestHex
    || observation.executionTargetIdentityDigestHex
      !== sourceLock.checkProjection.target.executionTargetIdentityDigestHex
    || observation.primaryObservationDigestHex
      !== observation.witnessObservationDigestHex
  ) {
    throw new Error('committed-vault pre-transport binding changed');
  }
  return Object.freeze(observation);
}

function validateOutputObservation(
  value: unknown,
  candidate: Readonly<CandidateBindingsV1>,
  sourceLock: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >,
): Readonly<Record<string, unknown>> {
  const observation = exactRecord(value, [
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
    'observedTipHeight',
    'observedTipHeaderIdHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'primaryObservationDigestHex',
    'witnessObservationDigestHex',
    'boundaries',
    'observationDigestHex',
  ], 'committed-vault output observation');
  if (
    observation.schema !== OUTPUT_OBSERVATION_SCHEMA
    || observation.version !== 1
    || observation.status
      !== 'exact_transition_inputs_spent_and_reserve_successor_unspent'
    || !positiveSafeInteger(observation.confirmationHeight)
    || !positiveSafeInteger(observation.observedTipHeight)
  ) {
    throw new Error('committed-vault output observation changed');
  }
  for (const [key, field] of Object.entries(observation)) {
    if (key.endsWith('Hex')) {
      fixedHex(field, 32, `committed-vault output ${key}`);
    }
  }
  assertExpectedBooleanRecord(observation.boundaries, {
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
  }, 'committed-vault output boundaries');
  const { observationDigestHex: _digest, ...body } = observation;
  if (
    sha256CanonicalJson(body, OUTPUT_OBSERVATION_DIGEST_DOMAIN)
      !== observation.observationDigestHex
    || observation.expectedTxId !== candidate.reserveTransitionTxIdHex
    || observation.sourceFundingBoxIdHex !== candidate.sourceFundingBoxIdHex
    || observation.reservePredecessorBoxIdHex
      !== candidate.reservePredecessorBoxIdHex
    || observation.sourceLockBoxIdHex !== candidate.sourceLockBoxIdHex
    || observation.transitionFeeFundingBoxIdHex
      !== candidate.transitionFeeFundingBoxIdHex
    || observation.reserveSuccessorBoxIdHex
      !== candidate.reserveSuccessorBoxIdHex
    || observation.processBindingDigestHex
      !== sourceLock.checkProjection.target.processBindingDigestHex
    || observation.executionTargetIdentityDigestHex
      !== sourceLock.checkProjection.target.executionTargetIdentityDigestHex
    || observation.primaryObservationDigestHex
      !== observation.witnessObservationDigestHex
  ) {
    throw new Error('committed-vault output binding changed');
  }
  return Object.freeze(observation);
}

function assertExecutionProjection(value: unknown): void {
  const execution = exactRecord(value, [
    'expectedTxId',
    'transportStatus',
    'durableAttemptDigestHex',
    'journalDigestHex',
    'committedVaultCheckReceiptDigestHex',
    'committedVaultCheckTipHeight',
    'committedVaultCheckTipHeaderIdHex',
    'unsignedTransactionDigestHex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionBytesSha256Hex',
    'signedTransactionBytesLength',
    'preTransportObservationDigestHex',
    'preTransportTipHeight',
    'preTransportTipHeaderIdHex',
    'confirmationDigestHex',
    'confirmationHeight',
    'confirmationHeaderIdHex',
    'outputObservationDigestHex',
    'outputTipHeight',
    'outputTipHeaderIdHex',
    'sourceFundingBoxIdHex',
    'reservePredecessorBoxIdHex',
    'sourceLockBoxIdHex',
    'transitionFeeFundingBoxIdHex',
    'reserveSuccessorBoxIdHex',
    'preTransportPrimaryObservationDigestHex',
    'preTransportWitnessObservationDigestHex',
    'outputPrimaryObservationDigestHex',
    'outputWitnessObservationDigestHex',
  ], 'projected committed-vault execution');
  if (
    (execution.transportStatus !== 'accepted'
      && execution.transportStatus !== 'reconciled')
    || !positiveSafeInteger(execution.signedTransactionBytesLength)
    || !positiveSafeInteger(execution.committedVaultCheckTipHeight)
    || !positiveSafeInteger(execution.preTransportTipHeight)
    || !positiveSafeInteger(execution.confirmationHeight)
    || !positiveSafeInteger(execution.outputTipHeight)
  ) {
    throw new Error('projected committed-vault execution changed');
  }
  for (const [key, field] of Object.entries(execution)) {
    if (key.endsWith('Hex') || key === 'expectedTxId') {
      fixedHex(field, 32, `projected committed-vault execution ${key}`);
    }
  }
  if (
    execution.preTransportPrimaryObservationDigestHex
      !== execution.preTransportWitnessObservationDigestHex
    || execution.outputPrimaryObservationDigestHex
      !== execution.outputWitnessObservationDigestHex
    || execution.committedVaultCheckTipHeight
      > execution.preTransportTipHeight
    || execution.preTransportTipHeight > execution.confirmationHeight
    || execution.confirmationHeight > execution.outputTipHeight
  ) {
    throw new Error('projected committed-vault execution binding changed');
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
    throw new Error('isolated peg-in committed-vault execution plan is invalid');
  }
}

function boxId(value: unknown, label: string): string {
  return fixedHex(plainRecord(value, label).boxId, 32, `${label} ID`);
}

function lowerEvenHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be nonempty lowercase hexadecimal bytes`);
  }
  return value;
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
      throw new Error(
        'committed-vault execution receipt must not contain local paths',
      );
    }
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}
