import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { decodePegInSourceIntentV2Hex } from '../peg-in-causal-admission-v2.js';
import {
  assertExactSubstrateFederatedIsolatedDevnetSetupReceiptV1,
} from './run-substrate-federated-isolated-devnet-genesis-setup-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-worker-receipt.v1' as const;

const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1';
const ROOT_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-execution-root.v1';
const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1';
const SOURCE_LOCK_CHECK_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1';
const SOURCE_LOCK_CHECK_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1';
const SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_TRANSACTION_V1';
const SOURCE_FUNDING_BOX_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_FUNDING_BOX_V1';
const CANDIDATE_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1';
const CANDIDATE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1';
const DEPOSIT_PACKET_SCHEMA =
  'e2s.substrate-federated-pooled-reserve-deposit.v1';
const EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX =
  '9f3e2d80de28b12bd11d575998f102219208f924608e6138edc96fb10a27ee4e';
const SETUP_ROLE_ORDER = Object.freeze([
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const);

export interface SubstrateFederatedIsolatedDevnetPegInPlanV1 {
  readonly amountNanoErg: string;
  readonly recipientAddressHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_peg_in_source_lock_check_completed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly root: Readonly<{
    readonly schema: typeof ROOT_RECEIPT_SCHEMA;
    readonly staticExecutionManifestDigestHex: string;
    readonly receiptDigestHex: string;
  }>;
  readonly buildIdentityDigestHex: string;
  readonly target: Readonly<{
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly finalHeight: number;
  }>;
  readonly setup: Readonly<{
    readonly setupRequestDigestHex: string;
    readonly setupCheckReceiptDigestHex: string;
    readonly transactions: readonly Readonly<{
      readonly ordinal: number;
      readonly role: string;
      readonly transactionIdHex: string;
      readonly confirmationHeight: number;
      readonly confirmationHeaderIdHex: string;
    }>[];
  }>;
  readonly funding: Readonly<{
    readonly reportDigestHex: string;
    readonly postCandidateReportDigestHex: string;
    readonly postCheckReportDigestHex: string;
    readonly sourceFundingBoxIdHex: string;
    readonly sourceFundingBoxDigestHex: string;
    readonly tipHeight: number;
    readonly postCandidateTipHeight: number;
    readonly postCheckTipHeight: number;
  }>;
  readonly candidate: Readonly<{
    readonly candidateDigestHex: string;
    readonly familyIdHex: string;
    readonly sourceFundingBoxIdHex: string;
    readonly sourceFundingBoxDigestHex: string;
    readonly sourceLockTransactionIdHex: string;
    readonly unsignedTransactionDigestHex: string;
  }>;
  readonly check: Readonly<{
    readonly receiptDigestHex: string;
    readonly unsignedTransactionIdHex: string;
    readonly unsignedTransactionDigestHex: string;
    readonly signedTransactionIdHex: string;
    readonly signedTransactionCanonicalJsonSha256Hex: string;
    readonly signedTransactionBytesSha256Hex: string;
    readonly signedTransactionBytesLength: number;
    readonly checkResponseSha256Hex: string;
    readonly signerPublicKeyHex: string;
    readonly signerP2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
    readonly nodeOrigin: 'http://127.0.0.1:9051';
  }>;
  readonly checks: Readonly<{
    readonly exactRequestSha256Returned: true;
    readonly exactPegInPlanReturned: true;
    readonly rootReceiptDigestRecomputed: true;
    readonly candidateDigestRecomputed: true;
    readonly sourceFundingBoxDigestRecomputed: true;
    readonly unsignedTransactionDigestRecomputed: true;
    readonly fundingCandidateAndCheckBound: true;
    readonly signedTransactionBytesProjected: false;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly setupSubmissionAndBroadcastExecuted: true;
    readonly valuePathLocalSyntheticSigningPerformed: true;
    readonly valuePathJvmNodeCheckPassed: true;
    readonly signedTransactionBytesReturnedOrPersisted: false;
    readonly valuePathSubmissionAuthorityEstablished: false;
    readonly valuePathBroadcastAuthorityEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
  rootValue: unknown,
  commandRequestSha256Hex: string,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1> {
  fixedHex(commandRequestSha256Hex, 32, 'source-lock command request digest');
  assertPegInPlan(pegInPlan);
  const root = validateRootReceipt(rootValue, pegInPlan);
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    status: 'local_peg_in_source_lock_check_completed' as const,
    commandRequestSha256Hex,
    pegIn: Object.freeze({ ...pegInPlan }),
    ...root,
    checks: Object.freeze({
      exactRequestSha256Returned: true as const,
      exactPegInPlanReturned: true as const,
      rootReceiptDigestRecomputed: true as const,
      candidateDigestRecomputed: true as const,
      sourceFundingBoxDigestRecomputed: true as const,
      unsignedTransactionDigestRecomputed: true as const,
      fundingCandidateAndCheckBound: true as const,
      signedTransactionBytesProjected: false as const,
      returnedValueContainsCapabilities: false as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      setupSubmissionAndBroadcastExecuted: true as const,
      valuePathLocalSyntheticSigningPerformed: true as const,
      valuePathJvmNodeCheckPassed: true as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      valuePathSubmissionAuthorityEstablished: false as const,
      valuePathBroadcastAuthorityEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN),
  });
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
  stdout: string,
  expectedCommandRequestSha256Hex: string,
  expectedPegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error(
      'peg-in source-lock worker output must be canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'commandRequestSha256Hex',
    'pegIn',
    'root',
    'buildIdentityDigestHex',
    'target',
    'setup',
    'funding',
    'candidate',
    'check',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'peg-in source-lock worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'local_peg_in_source_lock_check_completed'
    || receipt.commandRequestSha256Hex !== expectedCommandRequestSha256Hex
  ) {
    throw new Error('peg-in source-lock worker receipt identity changed');
  }
  fixedHex(receipt.commandRequestSha256Hex, 32, 'worker request digest');
  const pegIn = exactRecord(receipt.pegIn, [
    'amountNanoErg',
    'recipientAddressHex',
  ], 'worker peg-in plan');
  assertPegInPlan(pegIn as unknown as SubstrateFederatedIsolatedDevnetPegInPlanV1);
  if (
    pegIn.amountNanoErg !== expectedPegInPlan.amountNanoErg
    || pegIn.recipientAddressHex !== expectedPegInPlan.recipientAddressHex
  ) {
    throw new Error('peg-in source-lock worker plan changed');
  }
  validateProjectedReceipt(receipt);
  assertExpectedBooleanRecord(receipt.checks, {
    exactRequestSha256Returned: true,
    exactPegInPlanReturned: true,
    rootReceiptDigestRecomputed: true,
    candidateDigestRecomputed: true,
    sourceFundingBoxDigestRecomputed: true,
    unsignedTransactionDigestRecomputed: true,
    fundingCandidateAndCheckBound: true,
    signedTransactionBytesProjected: false,
    returnedValueContainsCapabilities: false,
  }, 'worker receipt checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    setupSubmissionAndBroadcastExecuted: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    signedTransactionBytesReturnedOrPersisted: false,
    valuePathSubmissionAuthorityEstablished: false,
    valuePathBroadcastAuthorityEstablished: false,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'worker receipt boundaries');
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'worker receipt digest',
  );
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('peg-in source-lock worker receipt digest changed');
  }
  assertNoLocalPathValue(receipt);
  return receipt as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1
  >;
}

function validateRootReceipt(
  value: unknown,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Omit<
  SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
  'schema' | 'version' | 'status' | 'commandRequestSha256Hex' | 'pegIn'
  | 'checks' | 'boundaries' | 'receiptDigestHex'
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
  ], 'peg-in source-lock execution receipt');
  if (
    receipt.schema !== ROOT_RECEIPT_SCHEMA
    || receipt.version !== 1
    || receipt.status
      !== 'setup_confirmed_and_peg_in_source_lock_node_check_passed'
    || receipt.staticExecutionManifestDigestHex
      !== EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX
  ) {
    throw new Error('peg-in source-lock root receipt identity changed');
  }
  const setup = exactRecord(receipt.setup, [
    'lifecycle',
    'transactions',
  ], 'peg-in source-lock setup receipt');
  const process = assertExactSubstrateFederatedIsolatedDevnetSetupReceiptV1(
    receipt.build,
    receipt.process,
    setup.lifecycle,
    setup.transactions,
  );
  const rootReceiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'peg-in source-lock root receipt digest',
  );
  const { receiptDigestHex: _rootDigest, ...rootBody } = receipt;
  if (
    sha256CanonicalJson(rootBody, ROOT_RECEIPT_DIGEST_DOMAIN)
      !== rootReceiptDigestHex
  ) {
    throw new Error('peg-in source-lock root receipt digest changed');
  }
  assertExpectedBooleanRecord(receipt.checks, {
    setupCandidateAndCheckCompletedInOneTargetLifetime: true,
    exactCandidateFundingAndUnsignedTransactionBound: true,
    sourceFundingRevalidatedImmediatelyBeforeSigning: true,
    sourceFundingRevalidatedAfterNodeCheck: true,
    exactSameNodeSigningContextAndJvmCheckUsed: true,
    signedTransactionBytesReturnedOrPersisted: false,
    returnedValueContainsCapabilities: false,
  }, 'peg-in source-lock root checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    localSetupCanonicalConfirmationEstablished: true,
    localSourceFundingObservationEstablished: true,
    valuePathLocalSyntheticSigningPerformed: true,
    valuePathJvmNodeCheckPassed: true,
    valuePathSubmissionAuthorityEstablished: false,
    valuePathBroadcastAuthorityEstablished: false,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
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
  }, 'peg-in source-lock root boundaries');
  const lifecycle = exactRecord(setup.lifecycle, [
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'ergoAdmissionKeySetDigestHex',
    'packetReceiptDigestHex',
    'setupCheckReceiptDigestHex',
    'setupRequestDigestHex',
    'executionTargetIdentityDigestHex',
  ], 'peg-in setup lifecycle');
  const transactions = projectSetupTransactions(
    setup.transactions,
    process.initialHeight,
    process.finalHeight,
  );
  const pegIn = validatePegInRoot(
    receipt.pegIn,
    pegInPlan,
    process,
    lifecycle,
    transactions,
  );
  return Object.freeze({
    root: Object.freeze({
      schema: ROOT_RECEIPT_SCHEMA,
      staticExecutionManifestDigestHex:
        EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX,
      receiptDigestHex: rootReceiptDigestHex,
    }),
    buildIdentityDigestHex: process.buildIdentityDigestHex,
    target: Object.freeze({
      processBindingDigestHex: process.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        process.executionTargetIdentityDigestHex,
      finalHeight: process.finalHeight,
    }),
    setup: Object.freeze({
      setupRequestDigestHex: fixedHex(
        lifecycle.setupRequestDigestHex,
        32,
        'setup request digest',
      ),
      setupCheckReceiptDigestHex: fixedHex(
        lifecycle.setupCheckReceiptDigestHex,
        32,
        'setup check receipt digest',
      ),
      transactions,
    }),
    ...pegIn,
  });
}

function validatePegInRoot(
  value: unknown,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  process: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
  lifecycle: Readonly<Record<string, unknown>>,
  setupTransactions: readonly Readonly<{
    ordinal: number;
    role: string;
    transactionIdHex: string;
  }>[],
): Pick<
  SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
  'funding' | 'candidate' | 'check'
> {
  const pegIn = exactRecord(value, [
    'fundingObservation',
    'candidate',
    'sourceLockCheck',
  ], 'peg-in root result');
  const funding = validateFunding(pegIn.fundingObservation);
  const candidate = validateCandidate(
    pegIn.candidate,
    pegInPlan,
    process,
    lifecycle,
    setupTransactions,
  );
  const check = validateCheck(pegIn.sourceLockCheck, process);
  if (
    funding.sourceFundingBoxIdHex !== candidate.sourceFundingBoxIdHex
    || funding.sourceFundingBoxDigestHex
      !== candidate.sourceFundingBoxDigestHex
    || check.unsignedTransactionIdHex
      !== candidate.sourceLockTransactionIdHex
    || check.unsignedTransactionDigestHex
      !== candidate.unsignedTransactionDigestHex
    || check.signedTransactionIdHex !== check.unsignedTransactionIdHex
  ) {
    throw new Error('peg-in funding, candidate, and check binding changed');
  }
  return Object.freeze({ funding, candidate, check });
}

function validateFunding(value: unknown) {
  const funding = exactRecord(value, [
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
  ], 'peg-in funding observation');
  if (
    funding.primaryNodeOrigin !== 'http://127.0.0.1:9051'
    || funding.witnessNodeOrigin !== 'http://127.0.0.1:9052'
    || typeof funding.observedAt !== 'string'
    || Number.isNaN(Date.parse(funding.observedAt))
    || new Date(funding.observedAt).toISOString() !== funding.observedAt
    || !positiveSafeInteger(funding.tipHeight)
    || !positiveSafeInteger(funding.postCandidateTipHeight)
    || !positiveSafeInteger(funding.postCheckTipHeight)
    || funding.postCandidateTipHeight < funding.tipHeight
    || funding.postCheckTipHeight < funding.postCandidateTipHeight
  ) {
    throw new Error('peg-in funding observation changed');
  }
  for (const [key, field] of Object.entries(funding)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `funding ${key}`);
  }
  return Object.freeze({
    reportDigestHex: funding.reportDigestHex as string,
    postCandidateReportDigestHex:
      funding.postCandidateReportDigestHex as string,
    postCheckReportDigestHex: funding.postCheckReportDigestHex as string,
    sourceFundingBoxIdHex: funding.sourceFundingBoxIdHex as string,
    sourceFundingBoxDigestHex: funding.sourceFundingBoxDigestHex as string,
    tipHeight: funding.tipHeight as number,
    postCandidateTipHeight: funding.postCandidateTipHeight as number,
    postCheckTipHeight: funding.postCheckTipHeight as number,
  });
}

function validateCandidate(
  value: unknown,
  pegInPlan: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  process: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
  lifecycle: Readonly<Record<string, unknown>>,
  setupTransactions: readonly Readonly<{
    ordinal: number;
    role: string;
    transactionIdHex: string;
  }>[],
) {
  const candidate = exactRecord(value, [
    'schema',
    'version',
    'status',
    'trustModel',
    'candidateDigestHex',
    'target',
    'setup',
    'family',
    'depositPacket',
    'boundaries',
  ], 'peg-in candidate');
  if (
    candidate.schema !== CANDIDATE_SCHEMA
    || candidate.version !== 1
    || candidate.status !== 'unsigned_non_authorizing_candidate'
    || candidate.trustModel !== 'federated_non_trustless'
  ) {
    throw new Error('peg-in candidate identity changed');
  }
  const target = exactRecord(candidate.target, [
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
  ], 'peg-in candidate target');
  if (
    target.processBindingDigestHex !== process.processBindingDigestHex
    || target.executionTargetIdentityDigestHex
      !== process.executionTargetIdentityDigestHex
  ) {
    throw new Error('peg-in candidate target changed');
  }
  const setup = exactRecord(candidate.setup, [
    'requestDigestHex',
    'checkReceiptDigestHex',
    'pooledReserveIssuanceOrdinal',
    'pooledReserveTransactionIdHex',
    'pooledReserveBoxIdHex',
  ], 'peg-in candidate setup');
  if (
    setup.pooledReserveIssuanceOrdinal !== 2
    || setup.requestDigestHex !== lifecycle.setupRequestDigestHex
    || setup.checkReceiptDigestHex !== lifecycle.setupCheckReceiptDigestHex
    || setup.pooledReserveTransactionIdHex
      !== setupTransactions[2]?.transactionIdHex
  ) {
    throw new Error('peg-in candidate setup changed');
  }
  const family = exactRecord(candidate.family, [
    'familyIdHex',
    'compilerBindingDigestHex',
    'compilerProvenanceKind',
    'compilerProvenanceDigestHex',
  ], 'peg-in candidate family');
  if (family.compilerProvenanceKind !== 'same-process-pinned-jvm') {
    throw new Error('peg-in candidate compiler provenance changed');
  }
  for (const [key, field] of Object.entries(family)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `candidate family ${key}`);
  }
  const packet = exactRecord(candidate.depositPacket, [
    'schema',
    'version',
    'trustModel',
    'familyIdHex',
    'familyCompiler',
    'sourceIntentHex',
    'depositCommitmentHex',
    'depositInsertProofHex',
    'reserve',
    'transactions',
    'boxes',
    'invariants',
    'boundaries',
  ], 'peg-in deposit packet');
  if (
    packet.schema !== DEPOSIT_PACKET_SCHEMA
    || packet.version !== 1
    || packet.trustModel !== 'federated_non_trustless'
    || packet.familyIdHex !== family.familyIdHex
  ) {
    throw new Error('peg-in deposit packet identity changed');
  }
  const sourceIntent = decodePegInSourceIntentV2Hex(
    String(packet.sourceIntentHex),
  );
  if (
    String(sourceIntent.amountNanoErg) !== pegInPlan.amountNanoErg
    || sourceIntent.recipientAddressHex.slice(2)
      !== pegInPlan.recipientAddressHex
  ) {
    throw new Error('peg-in source intent does not match the command plan');
  }
  const transactions = exactRecord(packet.transactions, [
    'sourceLockCreation',
    'reserveTransition',
  ], 'peg-in deposit transactions');
  const sourceLockTransaction = exactRecord(
    transactions.sourceLockCreation,
    ['txId', 'eip12Tx', 'outputs'],
    'peg-in source-lock transaction',
  );
  const sourceLockTransactionIdHex = fixedHex(
    sourceLockTransaction.txId,
    32,
    'source-lock transaction ID',
  );
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    sourceLockTransaction,
    SOURCE_LOCK_TRANSACTION_DIGEST_DOMAIN,
  );
  const boxes = exactRecord(packet.boxes, [
    'sourceFundingInput',
    'sourceLock',
    'transitionFeeFunding',
    'reservePredecessor',
    'reserveSuccessor',
  ], 'peg-in deposit boxes');
  const sourceFundingBox = plainRecord(
    boxes.sourceFundingInput,
    'peg-in source funding box',
  );
  const sourceFundingBoxIdHex = fixedHex(
    sourceFundingBox.boxId,
    32,
    'source funding box ID',
  );
  const sourceFundingBoxDigestHex = sha256CanonicalJson(
    sourceFundingBox,
    SOURCE_FUNDING_BOX_DIGEST_DOMAIN,
  );
  assertExpectedBooleanRecord(packet.boundaries, {
    sourceLockCreationConstructed: true,
    reserveTransitionConstructed: true,
    predecessorStateProvenanceEstablished: false,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    depositCommitmentStateEstablished: false,
    ergoDepositFinalityEstablished: false,
    sidechainMintAcceptanceEstablished: false,
    profileActivated: false,
    targetNodeAcceptanceEstablished: false,
    nodeCheckPerformed: false,
    signingAuthorityEstablished: false,
    submissionAuthorityEstablished: false,
    broadcastAuthorityEstablished: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'peg-in deposit boundaries');
  assertExpectedBooleanRecord(candidate.boundaries, {
    exactSetupBatchAndTargetBound: true,
    exactFamilyCompilerBindingConsumed: true,
    pooledReservePredecessorDerivedFromSetup: true,
    deterministicUnsignedDepositConstructed: true,
    setupCanonicalConfirmationEstablished: false,
    sourceFundingObservationEstablished: false,
    sourceLockConsumptionEstablished: false,
    reserveLineageEstablished: false,
    mintAuthorized: false,
    profileActivated: false,
    targetNodeAcceptanceEstablished: false,
    nodeCheckPerformed: false,
    signingAuthorityEstablished: false,
    submissionAuthorityEstablished: false,
    broadcastAuthorityEstablished: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'peg-in candidate boundaries');
  const candidateDigestHex = fixedHex(
    candidate.candidateDigestHex,
    32,
    'peg-in candidate digest',
  );
  const { candidateDigestHex: _candidateDigest, ...candidateBody } = candidate;
  if (
    sha256CanonicalJson(candidateBody, CANDIDATE_DIGEST_DOMAIN)
      !== candidateDigestHex
  ) {
    throw new Error('peg-in candidate digest changed');
  }
  return Object.freeze({
    candidateDigestHex,
    familyIdHex: family.familyIdHex as string,
    sourceFundingBoxIdHex,
    sourceFundingBoxDigestHex,
    sourceLockTransactionIdHex,
    unsignedTransactionDigestHex,
  });
}

function validateCheck(
  value: unknown,
  process: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  const check = exactRecord(value, [
    'schema',
    'version',
    'status',
    'sourceFundingBoxIdHex',
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
  ], 'source-lock check receipt');
  if (
    check.schema !== SOURCE_LOCK_CHECK_RECEIPT_SCHEMA
    || check.version !== 1
    || check.status !== 'PASS'
    || !positiveSafeInteger(check.signedTransactionBytesLength)
    || check.signedTransactionBytesLength > 16 * 1024 * 1024
  ) {
    throw new Error('source-lock check receipt identity changed');
  }
  const target = exactRecord(check.target, [
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
  ], 'source-lock check target');
  if (
    target.processBindingDigestHex !== process.processBindingDigestHex
    || target.executionTargetIdentityDigestHex
      !== process.executionTargetIdentityDigestHex
  ) {
    throw new Error('source-lock check target changed');
  }
  const signer = exactRecord(check.signer, [
    'derivation',
    'publicKeyHex',
    'p2pkErgoTreeHex',
    'stateContextTipHeight',
    'stateContextTipIdHex',
  ], 'source-lock check signer');
  if (
    signer.derivation !== 'wasm-root'
    || !positiveSafeInteger(signer.stateContextTipHeight)
  ) {
    throw new Error('source-lock check signer changed');
  }
  const checker = exactRecord(check.checker, [
    'nodeOrigin',
    'path',
    'method',
    'transportPolicy',
  ], 'source-lock checker');
  if (
    checker.nodeOrigin !== 'http://127.0.0.1:9051'
    || checker.path !== '/transactions/check'
    || checker.method !== 'POST'
    || checker.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('source-lock checker changed');
  }
  assertExpectedBooleanRecord(check.boundaries, {
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
  }, 'source-lock check boundaries');
  const receiptDigestHex = fixedHex(
    check.receiptDigestHex,
    32,
    'source-lock check receipt digest',
  );
  const { receiptDigestHex: _checkDigest, ...checkBody } = check;
  if (
    sha256CanonicalJson(checkBody, SOURCE_LOCK_CHECK_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('source-lock check receipt digest changed');
  }
  return Object.freeze({
    receiptDigestHex,
    unsignedTransactionIdHex: fixedHex(
      check.unsignedTransactionIdHex,
      32,
      'check unsigned transaction ID',
    ),
    unsignedTransactionDigestHex: fixedHex(
      check.unsignedTransactionDigestHex,
      32,
      'check unsigned transaction digest',
    ),
    signedTransactionIdHex: fixedHex(
      check.signedTransactionIdHex,
      32,
      'check signed transaction ID',
    ),
    signedTransactionCanonicalJsonSha256Hex: fixedHex(
      check.signedTransactionCanonicalJsonSha256Hex,
      32,
      'signed transaction canonical JSON digest',
    ),
    signedTransactionBytesSha256Hex: fixedHex(
      check.signedTransactionBytesSha256Hex,
      32,
      'signed transaction bytes digest',
    ),
    signedTransactionBytesLength: check.signedTransactionBytesLength as number,
    checkResponseSha256Hex: fixedHex(
      check.checkResponseSha256Hex,
      32,
      'check response digest',
    ),
    signerPublicKeyHex: fixedHex(
      signer.publicKeyHex,
      33,
      'check signer public key',
    ),
    signerP2pkErgoTreeHex: evenLowerHex(
      signer.p2pkErgoTreeHex,
      'check signer P2PK ErgoTree',
    ),
    stateContextTipHeight: signer.stateContextTipHeight as number,
    stateContextTipIdHex: fixedHex(
      signer.stateContextTipIdHex,
      32,
      'check state-context tip ID',
    ),
    nodeOrigin: 'http://127.0.0.1:9051' as const,
  });
}

function projectSetupTransactions(
  value: unknown,
  initialHeight: number,
  finalHeight: number,
) {
  if (!Array.isArray(value) || value.length !== SETUP_ROLE_ORDER.length) {
    throw new Error('setup transaction projection changed');
  }
  const transactionIds = new Set<string>();
  let predecessorHeight = initialHeight;
  return Object.freeze(value.map((entry, index) => {
    const transaction = exactRecord(entry, [
      'ordinal',
      'role',
      'expectedTxId',
      'transportStatus',
      'durableAttemptDigestHex',
      'journalDigestHex',
      'confirmationDigestHex',
      'confirmationHeight',
      'confirmationHeaderIdHex',
    ], `setup transaction ${index}`);
    if (
      transaction.ordinal !== index
      || transaction.role !== SETUP_ROLE_ORDER[index]
      || !positiveSafeInteger(transaction.confirmationHeight)
      || transaction.confirmationHeight <= predecessorHeight
      || transaction.confirmationHeight > finalHeight
    ) {
      throw new Error('setup transaction projection changed');
    }
    predecessorHeight = transaction.confirmationHeight;
    const transactionIdHex = fixedHex(
      transaction.expectedTxId,
      32,
      `setup transaction ${index} ID`,
    );
    if (transactionIds.has(transactionIdHex)) {
      throw new Error('setup transaction projection IDs must be distinct');
    }
    transactionIds.add(transactionIdHex);
    return Object.freeze({
      ordinal: index,
      role: SETUP_ROLE_ORDER[index],
      transactionIdHex,
      confirmationHeight: transaction.confirmationHeight,
      confirmationHeaderIdHex: fixedHex(
        transaction.confirmationHeaderIdHex,
        32,
        `setup transaction ${index} confirmation header`,
      ),
    });
  }));
}

function validateProjectedSetupTransactions(
  value: unknown,
  finalHeight: number,
): void {
  if (!Array.isArray(value) || value.length !== SETUP_ROLE_ORDER.length) {
    throw new Error('worker setup transaction projection changed');
  }
  const transactionIds = new Set<string>();
  let predecessorHeight = 0;
  for (let index = 0; index < value.length; index += 1) {
    const transaction = exactRecord(value[index], [
      'ordinal',
      'role',
      'transactionIdHex',
      'confirmationHeight',
      'confirmationHeaderIdHex',
    ], `worker setup transaction ${index}`);
    if (
      transaction.ordinal !== index
      || transaction.role !== SETUP_ROLE_ORDER[index]
      || !positiveSafeInteger(transaction.confirmationHeight)
      || transaction.confirmationHeight <= predecessorHeight
      || transaction.confirmationHeight > finalHeight
    ) {
      throw new Error('worker setup transaction projection changed');
    }
    predecessorHeight = transaction.confirmationHeight;
    const transactionIdHex = fixedHex(
      transaction.transactionIdHex,
      32,
      `worker setup transaction ${index} ID`,
    );
    fixedHex(
      transaction.confirmationHeaderIdHex,
      32,
      `worker setup transaction ${index} confirmation header`,
    );
    if (transactionIds.has(transactionIdHex)) {
      throw new Error('worker setup transaction IDs must be distinct');
    }
    transactionIds.add(transactionIdHex);
  }
}

function validateProjectedReceipt(receipt: Readonly<Record<string, unknown>>): void {
  const root = exactRecord(receipt.root, [
    'schema',
    'staticExecutionManifestDigestHex',
    'receiptDigestHex',
  ], 'worker root projection');
  if (
    root.schema !== ROOT_RECEIPT_SCHEMA
    || root.staticExecutionManifestDigestHex
      !== EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX
  ) {
    throw new Error('worker root projection changed');
  }
  fixedHex(root.receiptDigestHex, 32, 'worker root receipt digest');
  fixedHex(receipt.buildIdentityDigestHex, 32, 'worker build identity');
  const target = exactRecord(receipt.target, [
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'finalHeight',
  ], 'worker target projection');
  fixedHex(target.processBindingDigestHex, 32, 'worker process binding');
  fixedHex(target.executionTargetIdentityDigestHex, 32, 'worker target identity');
  if (!positiveSafeInteger(target.finalHeight)) {
    throw new Error('worker target final height changed');
  }
  const setup = exactRecord(receipt.setup, [
    'setupRequestDigestHex',
    'setupCheckReceiptDigestHex',
    'transactions',
  ], 'worker setup projection');
  fixedHex(setup.setupRequestDigestHex, 32, 'worker setup request digest');
  fixedHex(setup.setupCheckReceiptDigestHex, 32, 'worker setup check digest');
  validateProjectedSetupTransactions(
    setup.transactions,
    target.finalHeight as number,
  );
  const funding = exactRecord(receipt.funding, [
    'reportDigestHex',
    'postCandidateReportDigestHex',
    'postCheckReportDigestHex',
    'sourceFundingBoxIdHex',
    'sourceFundingBoxDigestHex',
    'tipHeight',
    'postCandidateTipHeight',
    'postCheckTipHeight',
  ], 'worker funding projection');
  for (const [key, field] of Object.entries(funding)) {
    if (key.endsWith('Hex')) fixedHex(field, 32, `worker funding ${key}`);
  }
  if (
    !positiveSafeInteger(funding.tipHeight)
    || !positiveSafeInteger(funding.postCandidateTipHeight)
    || !positiveSafeInteger(funding.postCheckTipHeight)
    || funding.postCandidateTipHeight < funding.tipHeight
    || funding.postCheckTipHeight < funding.postCandidateTipHeight
  ) {
    throw new Error('worker funding heights changed');
  }
  const candidate = exactRecord(receipt.candidate, [
    'candidateDigestHex',
    'familyIdHex',
    'sourceFundingBoxIdHex',
    'sourceFundingBoxDigestHex',
    'sourceLockTransactionIdHex',
    'unsignedTransactionDigestHex',
  ], 'worker candidate projection');
  for (const [key, field] of Object.entries(candidate)) {
    fixedHex(field, 32, `worker candidate ${key}`);
  }
  const check = exactRecord(receipt.check, [
    'receiptDigestHex',
    'unsignedTransactionIdHex',
    'unsignedTransactionDigestHex',
    'signedTransactionIdHex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionBytesSha256Hex',
    'signedTransactionBytesLength',
    'checkResponseSha256Hex',
    'signerPublicKeyHex',
    'signerP2pkErgoTreeHex',
    'stateContextTipHeight',
    'stateContextTipIdHex',
    'nodeOrigin',
  ], 'worker check projection');
  for (const key of [
    'receiptDigestHex',
    'unsignedTransactionIdHex',
    'unsignedTransactionDigestHex',
    'signedTransactionIdHex',
    'signedTransactionCanonicalJsonSha256Hex',
    'signedTransactionBytesSha256Hex',
    'checkResponseSha256Hex',
    'stateContextTipIdHex',
  ]) fixedHex(check[key], 32, `worker check ${key}`);
  fixedHex(check.signerPublicKeyHex, 33, 'worker signer public key');
  evenLowerHex(check.signerP2pkErgoTreeHex, 'worker signer P2PK ErgoTree');
  if (
    !positiveSafeInteger(check.signedTransactionBytesLength)
    || check.signedTransactionBytesLength > 16 * 1024 * 1024
    || !positiveSafeInteger(check.stateContextTipHeight)
    || check.nodeOrigin !== 'http://127.0.0.1:9051'
    || funding.sourceFundingBoxIdHex !== candidate.sourceFundingBoxIdHex
    || funding.sourceFundingBoxDigestHex !== candidate.sourceFundingBoxDigestHex
    || candidate.sourceLockTransactionIdHex !== check.unsignedTransactionIdHex
    || candidate.unsignedTransactionDigestHex
      !== check.unsignedTransactionDigestHex
    || check.signedTransactionIdHex !== check.unsignedTransactionIdHex
  ) {
    throw new Error('worker projected binding changed');
  }
}

function assertPegInPlan(value: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>): void {
  if (
    !/^[1-9][0-9]*$/u.test(value.amountNanoErg)
    || BigInt(value.amountNanoErg) > 0x7fff_ffff_ffff_ffffn
    || !/^[0-9a-f]{40}$/u.test(value.recipientAddressHex)
    || /^0{40}$/u.test(value.recipientAddressHex)
  ) {
    throw new Error('isolated peg-in source-lock plan is invalid');
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

function evenLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hexadecimal bytes`);
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
      throw new Error('peg-in source-lock receipt must not contain local paths');
    }
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}
