import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
  consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1,
} from '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';
import {
  claimFrontierLabApplicationOwnerRequestV1,
  disposeFrontierLabApplicationOwnerV1,
} from '../../adapters/frontier-lab-application-owner-v1.js';
import { buildSubstrateFederatedCheckpointProfileV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1 }
  from '../../profiles/substrate-federated-v1/checkpoint-statement.js';
import { buildSubstrateFederatedIsolatedDevnetErgoNodeV1 }
  from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import { createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1 }
  from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1 }
  from '../../substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import { assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1 }
  from '../../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4,
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance,
} from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
import { executeSubstrateFederatedIsolatedDevnetManagedSetupV2 }
  from './substrate-federated-isolated-devnet-managed-setup-v2.js';
import {
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
} from '../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import { buildBridgeValidityTrackerObservedHeaderContextV1 }
  from '../../bridge-validity-tracker-header-context-v1.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context }
  from '../../substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction }
  from '../../substrate-federated-tracker-v2-external-fee.js';
import {
  authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission,
  reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission,
  revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission,
  confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission,
} from '../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js';
import {
  submitSubstrateFederatedIsolatedDevnetTrackerV2Admission,
  finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission,
  submitSubstrateFederatedIsolatedDevnetWithdrawalV2,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2,
  confirmSubstrateFederatedIsolatedDevnetWithdrawalV2,
} from '../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 }
  from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { StateTracker } from '../../state-tracker.js';
import { buildTrustlessBurnInclusionProof } from '../../profiles/substrate-grandpa-v1/trustless-burn-proof.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from '../../substrate-federated-settlement-family-v1.js';
import {
  APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS,
  normalizeTrackerTransportJournalRootV9,
  assertReservedTrackerTransportJournalRootV9,
  normalizePegInCandidatePlan,
  normalizeFrontierApplicationRunnerPlan,
  waitForCanonicalConfirmation,
  finalizeReceipt,
  type RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Input,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

export type RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput =
  Readonly<RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Input>;

const RECEIPT_SCHEMA = 'e2s.substrate-federated-isolated-devnet-tracker-v2-campaign';
const RECEIPT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_V2_CAMPAIGN';
const RECEIPTS = new WeakSet<object>();
const WITHDRAWAL_RECEIPT_SCHEMA = 'e2s.substrate-federated-isolated-devnet-withdrawal-v2-check-campaign';
const WITHDRAWAL_RECEIPT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_WITHDRAWAL_V2_CHECK_CAMPAIGN';
const WITHDRAWAL_RECEIPTS = new WeakSet<object>();
const COMPLETED_WITHDRAWAL_RECEIPT_SCHEMA = 'e2s.substrate-federated-isolated-devnet-withdrawal-v2-campaign';
const COMPLETED_WITHDRAWAL_RECEIPT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_WITHDRAWAL_V2_CAMPAIGN';
const COMPLETED_WITHDRAWAL_RECEIPTS = new WeakSet<object>();
type CampaignMode = 'tracker' | 'withdrawal-check' | 'withdrawal';
type SetupSession = Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
type WithdrawalCheck = Awaited<ReturnType<SetupSession['checkWithdrawalV2']>>;
type WithdrawalClaim = Parameters<SetupSession['checkWithdrawalV2']>[0];
interface WithdrawalCompletion {
  readonly authorizationDigestHex: string;
  readonly durableAttemptDigestHex: string;
  readonly transportStatus: 'accepted' | 'ambiguous';
  readonly transportResponseDigestHex: string | null;
  readonly journalDigestHex: string;
  readonly confirmation: Readonly<{
    expectedTxId: string;
    confirmationHeight: number;
    confirmationHeaderIdHex: string;
    observationDigestHex: string;
  }>;
}

/** Own the full V2 campaign; no caller-supplied execution ports or legacy fallback. */
export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot(
  input: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput,
) {
  const result = await runOwnedCampaign(input, 'tracker');
  RECEIPTS.add(result.trackerReceipt);
  return Object.freeze({ receipt: result.trackerReceipt });
}

/** Check the complete withdrawal in the original campaign; never transport payout. */
export async function runSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignRoot(
  input: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput,
) {
  const result = await runOwnedCampaign(input, 'withdrawal-check');
  if (result.withdrawalReceipt === undefined) throw new Error('withdrawal campaign produced no checked receipt');
  WITHDRAWAL_RECEIPTS.add(result.withdrawalReceipt);
  return Object.freeze({ receipt: result.withdrawalReceipt });
}

/** Execute one local withdrawal and finish canonical confirmation before cleanup. */
export async function runSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignRoot(
  input: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput,
) {
  const result = await runOwnedCampaign(input, 'withdrawal');
  if (result.completedWithdrawalReceipt === undefined) throw new Error('withdrawal campaign produced no confirmed receipt');
  COMPLETED_WITHDRAWAL_RECEIPTS.add(result.completedWithdrawalReceipt);
  return Object.freeze({ receipt: result.completedWithdrawalReceipt });
}

async function runOwnedCampaign(input: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput, mode: CampaignMode) {
  const buildInput = input.build;
  const lifecycle = input.lifecycle;
  const pegInInput = input.pegIn;
  const runnerInput = input.frontierApplicationRunner;
  const journalInput = input.trackerTransportJournalRoot;
  const request = claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(input.requestBinding, { build: buildInput, lifecycle });
  const requestSha256Hex = consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(request);
  const pegIn = normalizePegInCandidatePlan(pegInInput);
  const applicationRunner = normalizeFrontierApplicationRunnerPlan(runnerInput);
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: lifecycle.sourceHistory.acceptance.bridgeAddress,
    tokenAddressHex: lifecycle.sourceHistory.acceptance.tokenAddress,
  });
  const journalRoot = normalizeTrackerTransportJournalRootV9(journalInput);
  const owner = claimFrontierLabApplicationOwnerRequestV1(requestSha256Hex);
  let setup: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>> | undefined;
  let application: ReturnType<typeof createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4> | undefined;
  let mining: ReturnType<typeof claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2> | undefined;
  let node: ReturnType<typeof createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1> | undefined;
  let state: StateTracker | undefined;
  let failure: unknown;
  let receipt: Awaited<ReturnType<typeof runCampaign>> | undefined;

  try {
    const built = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(buildInput);
    setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    application = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4(setup.signer, { owner, requestSha256Hex });
    if (application.signer.ergoAdmissionThreshold !== 1
      || application.signer.ergoAdmissionPublicKeysHex.length !== 1
      || application.signer.ergoAdmissionPublicKeysHex[0] !== setup.signer.publicKeyHex) {
      throw new Error('tracker V2 campaign admission signer differs from setup custody');
    }
    const profile = buildSubstrateFederatedCheckpointProfileV1({
      federationEpoch: '1', maxAdmissionValidityBlocks: '64',
      sourceAttestationThreshold: application.signer.sourceAttestationThreshold,
      sourceAttestationPublicKeysHex: application.signer.sourceAttestationPublicKeysHex,
      ergoAdmissionThreshold: application.signer.ergoAdmissionThreshold,
      ergoAdmissionPublicKeysHex: application.signer.ergoAdmissionPublicKeysHex,
    });
    mining = claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(setup);
    node = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1({
      javaExecutablePath: built.javaExecutablePath,
      expectedJavaExecutableSha256Hex: built.receipt.toolchain.javaExecutableSha256Hex,
      nodeAssemblyJarPath: built.nodeAssemblyJarPath,
      expectedNodeAssemblyJarSha256Hex: built.receipt.build.artifactSha256Hex,
      buildIdentityDigestHex: built.receipt.buildIdentityDigestHex,
    }, {
      miningTargetPublicKeyHex: setup.signer.publicKeyHex,
      p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      rewardInputErgoTrees: { ...setup.signer.rewardInputErgoTrees },
      networkPrefix: setup.signer.networkPrefix,
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    }, mining.miningCredential, mining.checkpointMiningCredential,
    mining.trackerAdmissionMiningCredential, mining.trackerConfirmationMiningCredential);
    assertReservedTrackerTransportJournalRootV9(journalRoot);
    const markerDirectory = join(journalRoot, 'attempt-markers');
    mkdirSync(markerDirectory);
    state = new StateTracker(join(journalRoot, 'state-store'));
    await node.startMining();
    receipt = await runCampaign({
      node, setup, application, state, markerDirectory, mode,
      lifecycle, pegIn, applicationRunner, requestSha256Hex,
      buildReceipt: built.receipt,
      expectedProfilePins: {
        federationProfileIdHex: profile.profileIdHex,
        sourceAttestationKeySetDigestHex: profile.sourceAttestationKeySetDigestHex,
        ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
      },
    });
  } catch (error) {
    failure = error;
  }

  const cleanupErrors: unknown[] = [];
  for (const session of [application, setup]) {
    try { session?.dispose(); } catch (error) { cleanupErrors.push(error); }
  }
  try { await node?.stop(); } catch (error) { cleanupErrors.push(error); }
  try { state?.close(); } catch (error) { cleanupErrors.push(error); }
  if (mining !== undefined) {
    for (const credential of Object.values(mining)) {
      try { revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential); } catch (error) { cleanupErrors.push(error); }
    }
  }
  try { disposeFrontierLabApplicationOwnerV1(owner); } catch (error) { cleanupErrors.push(error); }
  if (failure !== undefined || cleanupErrors.length > 0) {
    if (failure !== undefined && cleanupErrors.length === 0) throw failure;
    throw new AggregateError(failure === undefined ? cleanupErrors : [failure, ...cleanupErrors],
      'tracker V2 campaign or owned-resource cleanup failed');
  }
  if (receipt === undefined) throw new Error('tracker V2 campaign produced no confirmed receipt');
  return receipt;
}

async function runCampaign(input: Readonly<{
  node: ReturnType<typeof createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1>;
  mode: CampaignMode;
  setup: Awaited<ReturnType<typeof createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2>>;
  application: ReturnType<typeof createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4>;
  state: StateTracker;
  markerDirectory: string;
  lifecycle: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput['lifecycle'];
  pegIn: ReturnType<typeof normalizePegInCandidatePlan>;
  applicationRunner: ReturnType<typeof normalizeFrontierApplicationRunnerPlan>;
  expectedProfilePins: Parameters<typeof executeSubstrateFederatedIsolatedDevnetManagedSetupV2>[0]['expectedProfilePins'];
  requestSha256Hex: string;
  buildReceipt: Awaited<ReturnType<typeof buildSubstrateFederatedIsolatedDevnetErgoNodeV1>>['receipt'];
}>) {
  const { node, setup, state } = input;
  const withdrawalCheck = input.mode !== 'tracker';
  const managed = await node.withMiningActiveExecutionTarget(target => executeSubstrateFederatedIsolatedDevnetManagedSetupV2({
    lifecycle: input.lifecycle, setupSession: setup, continuation: input.application,
    expectedProfilePins: input.expectedProfilePins, target, pegIn: input.pegIn,
    applicationRunner: input.applicationRunner, state, markerDirectory: input.markerDirectory,
    completionDeadline: performance.now() + APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS,
    ...(withdrawalCheck ? { withdrawalCheck: true as const } : {}),
  }));
  const prepared = managed.value;
  const checkpoint = prepared.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance(checkpoint);
  const statement = checkpoint.checkpoint.checkpointAttestation.checkpointStatement;
  const extensionValueHex = encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex);
  const genesisHeaderIdHex = prepared.batch.request.target.genesisHeaderIdHex;
  const priorSnapshot = managed.receipt.finalSnapshot;
  const withdrawalFee = prepared.withdrawalFeeFunding;
  if (withdrawalCheck && (withdrawalFee === undefined
    || withdrawalFee.confirmationHeight === null || !Number.isSafeInteger(withdrawalFee.confirmationHeight)
    || withdrawalFee.confirmationHeight < 1 || withdrawalFee.confirmationHeight > priorSnapshot.fullHeight
    || BigInt(statement.admissionValidFromErgoHeight) < BigInt(withdrawalFee.confirmationHeight))) {
    throw new Error('withdrawal V2 admission window precedes confirmed withdrawal fee funding');
  }
  const withdrawalClaim = withdrawalCheck ? deriveApplicationWithdrawalClaim(prepared) : undefined;
  if (prepared.feeFunding.confirmationHeight > priorSnapshot.fullHeight
    || BigInt(statement.admissionValidFromErgoHeight) < BigInt(prepared.feeFunding.confirmationHeight)) {
    throw new Error('tracker V2 admission window precedes confirmed external-fee funding');
  }
  const anchored = await node.withCheckpointExtensionMiningTarget(extensionValueHex,
    { minimumTipHeight: 11 }, target => observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
      target, targetGenesisHeaderIdHex: genesisHeaderIdHex,
      expectedPriorHeaderIdHex: priorSnapshot.headerIdHex,
      expectedPriorHeight: priorSnapshot.fullHeight,
      expectedExtensionValueHex: extensionValueHex,
    }));
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(anchored.value);

  // Check, authorization and reservation share the same non-escaping frozen target.
  const admitted = await node.withCheckpointBoundMiningStoppedExecutionTarget(async target => {
    const observation = await observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2({
      target, targetGenesisHeaderIdHex: genesisHeaderIdHex,
      expectedAnchorHeaderIdHex: anchored.value.anchorHeaderIdHex,
      expectedAnchorHeight: anchored.value.anchorHeight,
      expectedAnchorExtensionRootHex: anchored.value.anchorExtensionRootHex,
      expectedExtensionValueHex: extensionValueHex,
    });
    assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(observation);
    const module = await import('ergo-lib-wasm-nodejs');
    const headers = buildBridgeValidityTrackerObservedHeaderContextV1(module.default ?? module, {
      rawHeaders: observation.headers.map(header => header.raw),
      anchorContextIndex: observation.anchorContextIndex,
      expectedAnchorHeaderIdHex: observation.anchorHeaderIdHex,
      expectedAnchorExtensionRootHex: observation.anchorExtensionRootHex,
    });
    const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
      compilerRequest: prepared.compilerInput.trackerRequest,
      compilerReceipt: prepared.compilerInput.trackerReceipt,
      trackerInputBox: prepared.trackerInputBox,
      encodedStatementHex: statement.encodedStatementHex,
      observedHeaderContext: headers,
      extensionMembershipProofHex: observation.extensionMembershipProofHex,
    });
    const transaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
      trackerContext: context, trackerInputBox: prepared.trackerInputBox,
      feeInputBox: prepared.feeFunding.feeInputBox, feePayerPublicKeyHex: setup.signer.publicKeyHex,
    });
    const checkInput = { context, transaction, observedHeaderContext: headers };
    const check = withdrawalCheck
      ? await setup.checkFrozenTrackerV2CandidateRetainingWithdrawalSigner(checkInput, target)
      : await setup.checkFrozenTrackerV2Candidate(checkInput, target);
    const authorization = await authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission(check, target);
    const attempt = reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission(authorization, state);
    return { attempt, authorization, checkDigestHex: check.result.checkDigestHex,
      unsignedTransactionIdHex: transaction.unsignedTransactionIdHex, observation };
  });
  const { attempt } = admitted.value;
  const refreshed = await node.withCheckpointBoundReservationFreshnessRevalidationTarget(
    target => revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission(attempt, target));
  const transported = await node.withCheckpointBoundTrackerTransportTarget(refreshed.value, async target => {
    const submission = await submitSubstrateFederatedIsolatedDevnetTrackerV2Admission(target, attempt);
    const finalized = finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission(attempt, submission);
    return { submission, journalDigestHex: finalized.journalDigestHex };
  });
  let withdrawal: WithdrawalCheck | undefined;
  let withdrawalCompletion: WithdrawalCompletion | undefined;
  const confirmed = await node.withTrackerTransportConfirmationMiningTarget(attempt.expectedTxId, async target => {
    const observer = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(target, genesisHeaderIdHex);
    const confirmation = await waitForCanonicalConfirmation(observer, attempt.expectedTxId,
      performance.now() + 2 * 60_000, 'tracker-v2-admission');
    const stored = await confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission(attempt, target, confirmation);
    if (withdrawalClaim !== undefined) {
      withdrawal = await setup.checkWithdrawalV2(withdrawalClaim, target);
      if (input.mode === 'withdrawal') {
        const withdrawalAuthorization = await authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2(withdrawal, target);
        const withdrawalAttempt = reserveSubstrateFederatedIsolatedDevnetWithdrawalV2(withdrawalAuthorization, state);
        const submission = await submitSubstrateFederatedIsolatedDevnetWithdrawalV2(target, withdrawalAttempt);
        const finalized = finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2(withdrawalAttempt, submission);
        const payoutConfirmation = await waitForCanonicalConfirmation(observer, withdrawalAttempt.expectedTxId,
          performance.now() + 2 * 60_000, 'withdrawal-v2');
        const payout = await confirmSubstrateFederatedIsolatedDevnetWithdrawalV2(withdrawalAttempt, target, payoutConfirmation);
        if (payout.expectedTxId !== withdrawal.packet.transaction.txId || payout.status !== 'confirmed'
          || payout.confirmationHeight === null || payout.confirmationHeaderId === null) {
          throw new Error('withdrawal V2 campaign lacks exact confirmed payout');
        }
        withdrawalCompletion = Object.freeze({
          authorizationDigestHex: withdrawalAuthorization.authorizationDigestHex,
          durableAttemptDigestHex: withdrawalAttempt.durableAttemptDigestHex,
          transportStatus: submission.status, transportResponseDigestHex: submission.responseDigestHex,
          journalDigestHex: finalized.journalDigestHex,
          confirmation: Object.freeze({ expectedTxId: payout.expectedTxId,
            confirmationHeight: payout.confirmationHeight, confirmationHeaderIdHex: payout.confirmationHeaderId,
            observationDigestHex: payoutConfirmation.observationDigestHex }),
        });
      }
    }
    return {
      expectedTxId: attempt.expectedTxId, durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      confirmationHeight: stored.confirmationHeight,
      confirmationHeaderIdHex: stored.confirmationHeaderId,
      observationDigestHex: confirmation.observationDigestHex,
    };
  });
  const trackerReceipt = finalizeReceipt({
    schema: RECEIPT_SCHEMA, version: 2 as const,
    status: 'local_tracker_v2_canonically_confirmed' as const,
    requestSha256Hex: input.requestSha256Hex, build: input.buildReceipt,
    setup: {
      packetReceiptDigestHex: prepared.packet.receipt.receiptDigestHex,
      setupRequestDigestHex: prepared.batch.request.requestDigestHex,
      transactions: prepared.genesisTransactions,
      execution: managed.receipt,
    },
    applicationCheckpoint: checkpoint,
    feeFunding: {
      expectedTxId: prepared.feeFunding.expectedTxId,
      durableAttemptDigestHex: prepared.feeFunding.durableAttemptDigestHex,
      confirmationHeight: prepared.feeFunding.confirmationHeight,
      confirmationHeaderIdHex: prepared.feeFunding.confirmationHeaderIdHex,
      feeInputBoxIdHex: prepared.feeFunding.feeInputBox.boxId,
    },
    anchor: { observation: anchored.value, execution: anchored.receipt },
    tracker: {
      authorizationDigestHex: admitted.value.authorization.authorizationDigestHex,
      checkDigestHex: admitted.value.checkDigestHex,
      expectedTxId: admitted.value.unsignedTransactionIdHex,
      frozenExecution: admitted.receipt,
      freshnessExecution: refreshed.receipt,
      transportExecution: transported.receipt,
      transportStatus: transported.value.submission.status,
      journalDigestHex: transported.value.journalDigestHex,
      confirmation: confirmed.value,
      confirmationExecution: confirmed.receipt,
    },
    boundaries: {
      localIsolatedDevnetOnly: true, canonicalTrackerAdmissionObserved: true,
      feeFundingConfirmedBeforeAdmissionWindow: true,
      independentAttestorCustodyEstablished: false, operationalMintEnabled: false,
      globalReplayInsertionEstablished: false, payoutAuthorized: false,
      fundsAuthorityEstablished: false, gate5Closed: false,
      trustlessStatusEstablished: false, productionReadinessEstablished: false,
    },
  }, RECEIPT_DOMAIN);
  if (!withdrawalCheck) return { trackerReceipt, withdrawalReceipt: undefined, completedWithdrawalReceipt: undefined };
  if (withdrawal === undefined || withdrawalFee === undefined) throw new Error('withdrawal V2 campaign check is absent');
  const packet = withdrawal.packet;
  const withdrawalReceipt = finalizeReceipt({
    schema: WITHDRAWAL_RECEIPT_SCHEMA, version: 1 as const,
    status: 'local_withdrawal_v2_checked' as const,
    requestSha256Hex: input.requestSha256Hex,
    trackerCampaign: trackerReceipt,
    withdrawalFeeFunding: {
      expectedTxId: withdrawalFee.expectedTxId,
      durableAttemptDigestHex: withdrawalFee.durableAttemptDigestHex,
      confirmationHeight: withdrawalFee.confirmationHeight,
      confirmationHeaderIdHex: withdrawalFee.confirmationHeaderIdHex,
      feeInputBoxIdHex: withdrawalFee.feeInputBox.boxId,
    },
    withdrawal: {
      expectedTxId: packet.transaction.txId,
      signedTransactionDigestHex: withdrawal.signedCandidate.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex: withdrawal.signedCandidate.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: withdrawal.signedCandidate.signedTransactionBytesLength,
      checker: withdrawal.checkedResult.checkerIdentity,
      signer: withdrawal.checkedResult.signerContext,
      burnIdHex: packet.burn.leaf.burnIdHex,
      amountNanoErg: packet.burn.leaf.amountNanoErg,
      recipientErgoTreeHex: packet.burn.recipientErgoTreeHex,
      reserve: packet.reserve,
      duplicatePrevention: { inputDigestHex: packet.duplicatePrevention.inputDigestHex,
        outputDigestHex: packet.duplicatePrevention.outputDigestHex },
      predecessorBoxIds: packet.transaction.eip12Tx.inputs.map(box => box.boxId),
      trackerDataInputBoxIdHex: packet.boxes.trackerDataInput.boxId,
      predictedPayoutBoxIdHex: packet.boxes.payout.boxId,
    },
    boundaries: {
      ...trackerReceipt.boundaries, withdrawalCheckedWithOriginalCustody: true,
      withdrawalTransportPerformed: false, canonicalPayoutObserved: false,
    },
  }, WITHDRAWAL_RECEIPT_DOMAIN);
  if (input.mode === 'withdrawal-check') return { trackerReceipt, withdrawalReceipt, completedWithdrawalReceipt: undefined };
  if (withdrawalCompletion === undefined) throw new Error('withdrawal V2 campaign completion is absent');
  const completedWithdrawalReceipt = finalizeReceipt({
    schema: COMPLETED_WITHDRAWAL_RECEIPT_SCHEMA, version: 1 as const,
    status: 'local_withdrawal_v2_canonically_confirmed' as const,
    requestSha256Hex: input.requestSha256Hex,
    withdrawalCheck: withdrawalReceipt,
    withdrawal: { ...withdrawalCompletion,
      payoutBoxIdHex: packet.boxes.payout.boxId,
      reserveSuccessorBoxIdHex: packet.boxes.reserveSuccessor.boxId,
      duplicatePreventionSuccessorBoxIdHex: packet.boxes.duplicatePreventionSuccessor.boxId },
    boundaries: { ...withdrawalReceipt.boundaries,
      payoutAuthorized: true, withdrawalTransportPerformed: true, canonicalPayoutObserved: true,
      canonicalReserveSuccessorObserved: true, canonicalDuplicatePreventionSuccessorObserved: true },
  }, COMPLETED_WITHDRAWAL_RECEIPT_DOMAIN);
  return { trackerReceipt, withdrawalReceipt, completedWithdrawalReceipt };
}

export type SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt =
  Awaited<ReturnType<typeof runCampaign>>['trackerReceipt'];

export type SubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt =
  NonNullable<Awaited<ReturnType<typeof runCampaign>>['withdrawalReceipt']>;
export type SubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt =
  NonNullable<Awaited<ReturnType<typeof runCampaign>>['completedWithdrawalReceipt']>;

export function assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt> {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value) || !RECEIPTS.has(value)) {
    throw new Error('tracker V2 campaign receipt lacks completed process provenance');
  }
}

export function assertSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt> {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value) || !WITHDRAWAL_RECEIPTS.has(value)) {
    throw new Error('withdrawal V2 campaign receipt lacks completed process provenance');
  }
}

export function assertSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt> {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value) || !COMPLETED_WITHDRAWAL_RECEIPTS.has(value)) {
    throw new Error('completed withdrawal V2 campaign receipt lacks completed process provenance');
  }
}

function deriveApplicationWithdrawalClaim(
  prepared: Awaited<ReturnType<typeof executeSubstrateFederatedIsolatedDevnetManagedSetupV2>>,
): Readonly<WithdrawalClaim> {
  const checkpoint = prepared.applicationCheckpoint;
  const evidence = checkpoint.applicationRunner.executionResult.applicationEvidence;
  const statement = checkpoint.checkpoint.checkpointAttestation.checkpointStatement;
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(prepared.compilerInput.familyReceipt.profile);
  const leaf = {
    sidechainIdHex: evidence.execution.sidechainIdHex,
    sidechainBlockHashHex: evidence.execution.blockHashHex,
    sidechainTxHashHex: evidence.execution.transactionHashHex,
    eventIndex: evidence.execution.eventIndex,
    burnIdHex: evidence.burn.burnIdHex,
    recipientErgoTreeHashHex: evidence.burn.recipientErgoTreeHashHex,
    amountNanoErg: evidence.burn.amountNanoErg,
    assetIdHex: profile.settlementAssetIdHex,
  };
  const proof = buildTrustlessBurnInclusionProof([leaf], leaf.burnIdHex);
  if (proof.bridgeEventRootHex !== evidence.burn.bridgeEventRootHex.replace(/^0x/, '').toLowerCase()
    || proof.bridgeEventRootHex !== statement.bridgeEventRootHex
    || proof.leafCount !== evidence.burn.burnLeafCount || proof.leafCount !== statement.burnLeafCount) {
    throw new Error('withdrawal burn proof differs from application checkpoint root or count');
  }
  return Object.freeze({
    trackerIdentity: Object.freeze({ sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
      sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex, executionBlockHashHex: statement.executionBlockHashHex }),
    burnLeaf: Object.freeze(leaf), leafIndex: proof.leafIndex, leafCount: proof.leafCount,
    burnProof: proof.proof, recipientErgoTreeHex: evidence.burn.recipientErgoTreeHex,
  });
}
