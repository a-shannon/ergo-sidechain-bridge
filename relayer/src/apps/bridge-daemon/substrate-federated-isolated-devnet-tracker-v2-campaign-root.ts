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
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 }
  from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { StateTracker } from '../../state-tracker.js';
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

/** Own the full V2 campaign; no caller-supplied execution ports or legacy fallback. */
export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot(
  input: RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput,
) {
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
      node, setup, application, state, markerDirectory,
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
  RECEIPTS.add(receipt);
  return Object.freeze({ receipt });
}

async function runCampaign(input: Readonly<{
  node: ReturnType<typeof createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1>;
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
  const managed = await node.withMiningActiveExecutionTarget(target => executeSubstrateFederatedIsolatedDevnetManagedSetupV2({
    lifecycle: input.lifecycle, setupSession: setup, continuation: input.application,
    expectedProfilePins: input.expectedProfilePins, target, pegIn: input.pegIn,
    applicationRunner: input.applicationRunner, state, markerDirectory: input.markerDirectory,
    completionDeadline: performance.now() + APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS,
  }));
  const prepared = managed.value;
  const checkpoint = prepared.applicationCheckpoint;
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance(checkpoint);
  const statement = checkpoint.checkpoint.checkpointAttestation.checkpointStatement;
  const extensionValueHex = encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex);
  const genesisHeaderIdHex = prepared.batch.request.target.genesisHeaderIdHex;
  const priorSnapshot = managed.receipt.finalSnapshot;
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
    const check = await setup.checkFrozenTrackerV2Candidate({
      context, transaction, observedHeaderContext: headers,
    }, target);
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
  const confirmed = await node.withTrackerTransportConfirmationMiningTarget(attempt.expectedTxId, async target => {
    const observer = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(target, genesisHeaderIdHex);
    const confirmation = await waitForCanonicalConfirmation(observer, attempt.expectedTxId,
      performance.now() + 2 * 60_000, 'tracker-v2-admission');
    const stored = await confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission(attempt, target, confirmation);
    return {
      expectedTxId: attempt.expectedTxId, durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      confirmationHeight: stored.confirmationHeight,
      confirmationHeaderIdHex: stored.confirmationHeaderId,
      observationDigestHex: confirmation.observationDigestHex,
    };
  });
  return finalizeReceipt({
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
}

export type SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt =
  Awaited<ReturnType<typeof runCampaign>>;

export function assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt> {
  if (value === null || typeof value !== 'object' || !Object.isFrozen(value) || !RECEIPTS.has(value)) {
    throw new Error('tracker V2 campaign receipt lacks completed process provenance');
  }
}
