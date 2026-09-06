import type { StateTracker } from '../../state-tracker.js';
import { sha256CanonicalJson } from '../../strict-json.js';
import { PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION } from '../../peg-in-causal-admission-v2.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from '../../substrate-federated-settlement-family-v1.js';
import { collectSubstrateFederatedAuthoritySafeDevnetHistoryV1 } from '../../substrate-federated-authority-safe-devnet-history-v1.js';
import { collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2 } from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  discoverSubstrateFederatedRewardInputsV2,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import { discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1 } from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import type { RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input } from '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import type { SubstrateFederatedIsolatedDevnetSetupCheckSessionV2 } from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import { takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2 }
  from '../../substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV2,
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2,
} from '../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2 } from '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
import { createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2 } from '../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import { createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1 } from '../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js';
import { createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1 } from '../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js';
import { createSubstrateFederatedLocalDevnetGenesisJournalV1 } from '../../substrate-federated-local-devnet-genesis-journal-v1.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 } from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2,
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2,
} from '../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';
import {
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2,
} from '../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import { buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 } from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2 } from '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
} from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
} from '../../relayer-core/ergo-operational-transaction-lifecycle.js';
import { materializeUnsignedTransaction, type Eip12UnsignedTransaction } from '../../unsigned-ergo-transaction.js';
import { runErgoOperationalTransaction } from './ergo-operational-transaction.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3,
} from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
import {
  executeSubstrateFederatedIsolatedDevnetGenesisBatchV3,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1,
  waitForCanonicalConfirmation,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

export interface ExecuteSubstrateFederatedIsolatedDevnetManagedSetupV2Input {
  readonly lifecycle: Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>;
  readonly setupSession: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>;
  readonly continuation: Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4>;
  readonly expectedProfilePins: ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins'];
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly pegIn: Readonly<Pick<Parameters<typeof buildSubstrateFederatedIsolatedDevnetPegInCandidateV2>[0]['sourceIntent'],
    'amountNanoErg' | 'recipientAddressHex'>>;
  readonly applicationRunner: Readonly<SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3>;
  readonly state: StateTracker;
  readonly markerDirectory: string;
  readonly completionDeadline: number;
}

type Input = Readonly<ExecuteSubstrateFederatedIsolatedDevnetManagedSetupV2Input>;
type Batch = Parameters<typeof executeSubstrateFederatedIsolatedDevnetGenesisBatchV3>[0]['batch'];
type Observer = ReturnType<typeof createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>;
type OwnedFunding = Awaited<ReturnType<typeof discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1>>;
type ExecutionCheck = ReturnType<typeof promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1> | ReturnType<typeof promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1>;
type Operation = Parameters<typeof runErgoOperationalTransaction>[0];
type Ports = Parameters<typeof runErgoOperationalTransaction>[1];

// Match the existing canonical observer's full two-minute transaction budget.
const CONFIRMATION_BUDGET_MS = 2 * 60_000;
const FUNDING_DIGEST_DOMAIN = 'E2S_ISOLATED_DEVNET_MANAGED_SETUP_V2_FUNDING';
const GENESIS_ROLES = [
  { issuance: 'tracker', receipt: 'tracker' },
  { issuance: 'duplicate-prevention', receipt: 'duplicatePrevention' },
  { issuance: 'pooled-reserve', receipt: 'pooledReserve' },
] as const;

/** Runs within caller-owned mining, custody and storage lifetimes; does not admit a tracker. */
export async function executeSubstrateFederatedIsolatedDevnetManagedSetupV2(input: Input) {
  const { lifecycle, setupSession, continuation, target, state, completionDeadline } = input;
  requireTime(completionDeadline);
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (target.primaryMining !== true || target.witnessReadOnly !== true
    || continuation.signer.ergoAdmissionThreshold !== 1
    || continuation.signer.ergoAdmissionPublicKeysHex.length !== 1
    || continuation.signer.ergoAdmissionPublicKeysHex[0] !== setupSession.signer.publicKeyHex) {
    throw new Error('managed V2 setup requires the owned mining target and exact setup signer');
  }
  const sourceHistory = await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(lifecycle.sourceHistory, {
    temporaryDirectoryRoot: input.applicationRunner.temporaryDirectoryRoot,
    sharedCargoHomeRoot: input.applicationRunner.cargoDependencyCacheDirectory,
  });
  requireTime(completionDeadline);
  const rewardInputs = await discoverSubstrateFederatedRewardInputsV2(setupSession.signer);
  const ergoHistory = await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(rewardInputs);
  requireTime(completionDeadline);
  const packet = await continuation.produce({
    sourceHistory, ergoHistory, expectedProfilePins: input.expectedProfilePins,
    relayerArtifacts: lifecycle.relayerArtifacts,
  });
  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance(packet);
  requireTime(completionDeadline);
  const replay = takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2(packet.replay);
  const batch = await setupSession.runForExecutionV3RetainingPegInAndTrackerSigner({
    sourceAndCompilerInput: replay.sourceAndCompilerInput,
    expectedSettlementGenesisHeaderIdHex: replay.expectedSettlementGenesisHeaderIdHex,
    primaryNodeOrigin: target.primaryNodeOrigin,
    witnessNodeOrigin: target.witnessNodeOrigin,
  }, target);
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch, target);
  requireTime(completionDeadline, 3 * CONFIRMATION_BUDGET_MS);
  const genesisTransactions = await executeSubstrateFederatedIsolatedDevnetGenesisBatchV3({
    target, batch, state, markerDirectory: input.markerDirectory,
  });
  requireTime(completionDeadline);
  assertGenesisIdentity(batch, genesisTransactions);
  const observer = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(target, batch.request.target.genesisHeaderIdHex);
  const minimumHeight = Math.max(...genesisTransactions.map(value => value.confirmationHeight));
  const funding = await observeFunding(input, batch, minimumHeight);
  const sourceFundingInput = funding.observation.genesisInputs.tracker;
  const compilerInput = getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3(batch, target);
  const family = compilerInput.familyReceipt.profile;
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(family);
  const candidate = await buildSubstrateFederatedIsolatedDevnetPegInCandidateV2({
    batch, target, sourceFundingInput,
    sourceIntent: {
      formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
      sourceNetworkIdHex: profile.sourceNetworkIdHex,
      sidechainIdHex: profile.sidechainIdHex,
      bridgeAddressHex: profile.bridgeAddressHex,
      tokenAddressHex: profile.tokenAddressHex,
      settlementProfileIdHex: profile.settlementProfileIdHex,
      admissionProfileIdHex: family.familyIdHex,
      sourceAssetIdHex: profile.settlementAssetIdHex,
      amountNanoErg: input.pegIn.amountNanoErg,
      recipientAddressHex: input.pegIn.recipientAddressHex,
    },
    depositorErgoTreeHex: setupSession.signer.p2pkErgoTreeHex,
    creationHeights: {
      currentErgoHeight: funding.observation.target.tipHeight,
      sourceLockCreation: funding.observation.target.tipHeight,
      reserveTransition: funding.observation.target.tipHeight,
    },
  });
  const deposit = assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(candidate, batch, target);
  const fundingDigest = sha256CanonicalJson(sourceFundingInput, FUNDING_DIGEST_DOMAIN);
  if (sha256CanonicalJson(deposit.boxes.sourceFundingInput, FUNDING_DIGEST_DOMAIN) !== fundingDigest) {
    throw new Error('managed V2 candidate funding identity changed');
  }
  const postCandidate = await observeFunding(input, batch, funding.observation.target.tipHeight, fundingDigest);
  const sourceCheckReceipt = await setupSession.checkPegInSourceLockV2RetainingSigner(deposit, target);
  assertCheck(sourceCheckReceipt, input, batch, deposit.transactions.sourceLockCreation.txId);
  if (sourceCheckReceipt.sourceFundingBoxIdHex !== sourceFundingInput.boxId) {
    throw new Error('managed V2 source check input changed');
  }
  const postCheck = await observeFunding(input, batch, postCandidate.observation.target.tipHeight, fundingDigest);
  const preTransport = await observeFunding(input, batch, postCheck.observation.target.tipHeight, fundingDigest);
  const sourceCheck = promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1(sourceCheckReceipt, target);
  const sourceAuthorizer = createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2({ target, batch, candidate, executionCheck: sourceCheck, postCheck, preTransport });
  const sourceJournal = createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1({
    state, authorizer: sourceAuthorizer,
    reconciliationIdentityDigestHex: batch.targetBinding.executionTargetIdentityDigestHex,
    targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
  });
  if (await sourceJournal.reconcileActive(observer) !== 'none') {
    throw new Error('managed V2 source lock has a prior attempt');
  }
  const sourceTransport = createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1(target, sourceAuthorizer);
  const sourceTransaction = deposit.transactions.sourceLockCreation;
  const sourceHeight = sourceTransaction.eip12Tx.outputs[0]?.creationHeight;
  if (!Number.isSafeInteger(sourceHeight) || Number(sourceHeight) < 0) {
    throw new Error('managed V2 source lock creation height is invalid');
  }
  await executeCheckedOperation(operation(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    sourceTransaction, [sourceFundingInput.boxId], Number(sourceHeight),
  ), sourceCheck, input, {
    revalidate: async () => Object.freeze({ revalidationDigestHex: sourceAuthorizer.revalidationDigestHex }),
    authorize: value => sourceAuthorizer.authorize(value),
    reserve: value => sourceJournal.journal.reserve(value),
    finalize: value => sourceJournal.journal.finalize(value),
    submit: value => sourceTransport.submit(value),
  });
  const sourceConfirmation = await waitForCanonicalConfirmation(observer, sourceTransaction.txId, completionDeadline, 'source-lock');
  if (await sourceJournal.reconcileActive(observer) !== 'confirmed'
    || await sourceJournal.revalidateConfirmed(observer) !== 1) {
    throw new Error('managed V2 source lock durable confirmation changed');
  }
  const sourceLockObservation = await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2({ target, batch, candidate, confirmation: sourceConfirmation });
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2(sourceLockObservation, batch, candidate, target);
  requireTime(completionDeadline);

  const reserveTransaction = deposit.transactions.reserveTransition;
  const reserveInputIds = [deposit.boxes.reservePredecessor.boxId, deposit.boxes.sourceLock.boxId,
    deposit.boxes.transitionFeeFunding.boxId];
  const vaultCheckReceipt = await setupSession.checkPegInCommittedVaultV2RetainingSigner(deposit, target);
  assertCheck(vaultCheckReceipt, input, batch, reserveTransaction.txId);
  if (vaultCheckReceipt.reservePredecessorBoxIdHex !== reserveInputIds[0]
    || vaultCheckReceipt.sourceLockBoxIdHex !== reserveInputIds[1]
    || vaultCheckReceipt.transitionFeeFundingBoxIdHex !== reserveInputIds[2]
    || vaultCheckReceipt.boundaries.exactThreeInputTransitionBound !== true
    || vaultCheckReceipt.boundaries.mintAuthorized !== false) {
    throw new Error('managed V2 committed vault check inputs changed');
  }
  const vaultCheck = promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1(vaultCheckReceipt, target);
  const vaultAuthorization = createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2({
    target, batch, candidate, executionCheck: vaultCheck, sourceLockObservation,
  });
  const vaultJournal = createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1({
    state, authorizer: vaultAuthorization.broadcastAuthorizer,
    executionTargetIdentityDigestHex: batch.targetBinding.executionTargetIdentityDigestHex,
    targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
  });
  if (await vaultJournal.reconcileActive(observer) !== 'none') {
    throw new Error('managed V2 committed vault has a prior attempt');
  }
  const vaultTransport = createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1(target, vaultAuthorization.broadcastAuthorizer);
  await executeCheckedOperation(operation(PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    reserveTransaction, reserveInputIds, vaultCheckReceipt.signer.stateContextTipHeight), vaultCheck, input, {
    revalidate: value => vaultAuthorization.revalidator.revalidate(value),
    authorize: value => vaultAuthorization.broadcastAuthorizer.authorize(value),
    reserve: value => vaultJournal.journal.reserve(value),
    finalize: value => vaultJournal.journal.finalize(value),
    submit: value => vaultTransport.submit(value),
  });
  vaultAuthorization.takePreTransportObservation();
  await waitForCanonicalConfirmation(observer, reserveTransaction.txId, completionDeadline, 'committed-vault');
  if (await vaultJournal.reconcileActive(observer) !== 'confirmed') {
    throw new Error('managed V2 committed vault durable reconciliation failed');
  }
  const vaultConfirmations = await vaultJournal.revalidateConfirmed(observer);
  if (vaultConfirmations.length !== 1) throw new Error('managed V2 committed vault confirmation count changed');
  const committedVaultObservation = await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2({ target, batch, candidate, confirmation: vaultConfirmations[0]! });
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2(committedVaultObservation, batch, candidate, target);
  const mintDraft = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2({ target, batch, candidate, committedVaultObservation });
  const sourceEvidence = collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2({ target, batch, candidate, committedVaultObservation, draft: mintDraft });
  const issuedAtNativeHeight = SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2;
  requireTime(completionDeadline);
  const application = await continuation.executeApplication(packet, {
    mintSourceProofInput: {
      draft: mintDraft, evidenceReceipt: sourceEvidence, issuedAtNativeHeight,
      expiresAtNativeHeight: (BigInt(issuedAtNativeHeight)
        + BigInt(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2)).toString(),
    },
    applicationRunnerInput: input.applicationRunner,
  }, completionDeadline);

  // Funding must reach canonical confirmation before choosing the admission window.
  requireTime(completionDeadline, CONFIRMATION_BUDGET_MS);
  const checkedFunding = await setupSession.checkTrackerFeeFundingV3(target);
  requireTime(completionDeadline, CONFIRMATION_BUDGET_MS);
  const funded = await executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1({ target, checked: checkedFunding, state });
  const { confirmationHeight, confirmationHeaderIdHex } = funded;
  if (confirmationHeight === null || !Number.isSafeInteger(confirmationHeight) || confirmationHeight < 1
    || confirmationHeaderIdHex === null || !/^[0-9a-f]{64}$/.test(confirmationHeaderIdHex)) {
    throw new Error('managed V2 external-fee funding lacks canonical confirmation');
  }
  const feeFunding = Object.freeze({ ...funded, confirmationHeight, confirmationHeaderIdHex });
  requireTime(completionDeadline);
  const freshReserve = await waitForCanonicalConfirmation(observer, reserveTransaction.txId,
    completionDeadline, 'application-checkpoint-admission');
  if (freshReserve.confirmationHeight !== committedVaultObservation.confirmationHeight
    || freshReserve.confirmationHeaderIdHex !== committedVaultObservation.confirmationHeaderIdHex
    || !Number.isSafeInteger(freshReserve.observedAtHeight)
    || freshReserve.observedAtHeight < committedVaultObservation.confirmationHeight
    || freshReserve.observedAtHeight < feeFunding.confirmationHeight) {
    throw new Error('managed V2 committed reserve changed before checkpoint attestation');
  }
  requireTime(completionDeadline);
  const validFromErgoHeight = freshReserve.observedAtHeight.toString();
  const applicationCheckpoint = continuation.attestCheckpoint(application, {
    validFromErgoHeight, expiresAtErgoHeight: (BigInt(validFromErgoHeight) + 64n).toString(),
  });
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance(applicationCheckpoint);
  const proof = applicationCheckpoint.mintSourceProof;
  if (applicationCheckpoint.packet.receipt !== packet.receipt
    || proof.packetReceiptDigestHex !== packet.receipt.receiptDigestHex
    || proof.sourceProof.sourceEvidenceReceiptDigestHex !== sourceEvidence.receiptDigestHex
    || proof.sourceProof.mintReservationDraftDigestHex !== mintDraft.draftDigestHex
    || proof.sourceProof.mintReservationStatementIdHex !== mintDraft.statementIdHex
    || proof.sourceProof.mintIdentityHex !== mintDraft.reservationKeyHex) {
    throw new Error('managed V2 application checkpoint lineage changed');
  }

  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance(packet);
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch, target);
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(candidate, batch, target);
  const genesisJournal = createSubstrateFederatedLocalDevnetGenesisJournalV1({ state, markerDirectory: input.markerDirectory,
    reconciliationIdentityDigestHex: batch.targetBinding.executionTargetIdentityDigestHex });
  if (await genesisJournal.revalidateConfirmed(observer) !== 3) {
    throw new Error('managed V2 genesis durable confirmation count changed');
  }
  const refreshedGenesis = await refreshGenesis(batch, genesisTransactions, observer,
    completionDeadline, freshReserve.observedAtHeight);
  const issuance = batch.orderedTransactions[0]!.issuance;
  const materialized = await materializeUnsignedTransaction(
    issuance.unsignedTransactionBody as unknown as Eip12UnsignedTransaction, 'managed V2 tracker genesis');
  const trackerInputBox = materialized.outputs[0];
  if (materialized.txId !== issuance.unsignedTransactionIdHex || trackerInputBox === undefined
    || trackerInputBox.boxId !== issuance.predictedStateOutput.boxIdHex
    || trackerInputBox.transactionId !== issuance.predictedStateOutput.transactionIdHex
    || trackerInputBox.index !== issuance.predictedStateOutput.index
    || trackerInputBox.creationHeight !== issuance.predictedStateOutput.creationHeight) {
    throw new Error('managed V2 tracker genesis output identity changed');
  }
  requireTime(completionDeadline);
  return Object.freeze({ packet, batch, genesisTransactions: refreshedGenesis, candidate,
    sourceLockObservation, committedVaultObservation, mintDraft, sourceEvidence,
    feeFunding, applicationCheckpoint, trackerInputBox, compilerInput });
}

function requireTime(deadline: number, reserveMs = 0): void {
  const now = performance.now();
  if (!Number.isFinite(now) || !Number.isFinite(deadline) || now + reserveMs >= deadline) {
    throw new Error('managed V2 setup lacks its required completion/confirmation budget');
  }
}

async function observeFunding(input: Input, batch: Batch, minimumHeight: number, expectedDigest?: string): Promise<OwnedFunding> {
  requireTime(input.completionDeadline);
  const owned = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(input.setupSession.signer, input.target);
  const funding = owned.observation;
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(funding);
  const setupBoxIds = new Set(batch.orderedTransactions.flatMap(({ issuance }) =>
    [issuance.genesisInputBoxIdHex, issuance.predictedStateOutput.boxIdHex]));
  const setupTxIds = new Set(batch.orderedTransactions.map(({ issuance }) => issuance.unsignedTransactionIdHex));
  const boxIds = Object.values(funding.genesisBoxIds);
  if (funding.sources.primaryNodeOrigin !== input.target.primaryNodeOrigin
    || funding.sources.witnessNodeOrigin !== input.target.witnessNodeOrigin
    || funding.target.genesisHeaderIdHex !== batch.request.target.genesisHeaderIdHex
    || funding.target.tipHeight < minimumHeight
    || funding.signer.publicKeyHex !== input.setupSession.signer.publicKeyHex
    || funding.signer.p2pkErgoTreeHex !== input.setupSession.signer.p2pkErgoTreeHex
    || boxIds.length !== 3 || new Set(boxIds).size !== 3
    || boxIds.some(id => setupBoxIds.has(id))
    || Object.values(funding.genesisInputs).some(box => setupTxIds.has(box.transactionId))
    || (expectedDigest !== undefined
      && sha256CanonicalJson(funding.genesisInputs.tracker, FUNDING_DIGEST_DOMAIN) !== expectedDigest)) {
    throw new Error('managed V2 fresh funding observation changed');
  }
  return owned;
}

function assertCheck(receipt: ExecutionCheck['receipt'], input: Input, batch: Batch, expectedTxId: string): void {
  if (receipt.status !== 'PASS' || receipt.unsignedTransactionIdHex !== expectedTxId
    || receipt.signedTransactionIdHex !== expectedTxId
    || receipt.target.processBindingDigestHex !== batch.targetBinding.processBindingDigestHex
    || receipt.target.executionTargetIdentityDigestHex !== batch.targetBinding.executionTargetIdentityDigestHex
    || receipt.signer.publicKeyHex !== input.setupSession.signer.publicKeyHex
    || receipt.signer.p2pkErgoTreeHex !== input.setupSession.signer.p2pkErgoTreeHex
    || receipt.checker.nodeOrigin !== input.target.primaryNodeOrigin
    || receipt.boundaries.localWasmRootSigningPerformed !== true
    || receipt.boundaries.localJvmNodeCheckPassed !== true
    || receipt.boundaries.submissionAuthorityEstablished !== false
    || receipt.boundaries.broadcastAuthorityEstablished !== false) {
    throw new Error('managed V2 exact transaction check binding changed');
  }
}

function operation(operationProfile: Operation['operationProfile'],
  transaction: ReturnType<typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV2>['transactions']['sourceLockCreation'],
  inputBoxIds: string[], attemptedAtHeight: number): Operation {
  return { operationProfile, expectedTxId: transaction.txId, sourceBoxId: inputBoxIds[0]!, inputBoxIds,
    attemptedAtHeight, targetSidechainHeight: null, targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null, unsignedTransaction: transaction.eip12Tx };
}

async function executeCheckedOperation(expected: Operation, check: ExecutionCheck, input: Input,
  ports: Pick<Ports, 'revalidate' | 'authorize' | 'reserve' | 'finalize' | 'submit'>): Promise<void> {
  requireTime(input.completionDeadline, CONFIRMATION_BUDGET_MS);
  let preTransportFailure: unknown;
  const execution = await runErgoOperationalTransaction(expected, {
    ...ports,
    sign: async admission => {
      if (admission.operationProfile !== expected.operationProfile
        || admission.expectedTxId !== check.receipt.unsignedTransactionIdHex
        || admission.sourceBoxId !== expected.sourceBoxId
        || admission.inputBoxIds.length !== expected.inputBoxIds.length
        || !admission.inputBoxIds.every((id, index) => id === expected.inputBoxIds[index])
        || admission.attemptedAtHeight !== expected.attemptedAtHeight
        || admission.targetSidechainHeight !== null || admission.targetSidechainBlockHashHex !== null
        || admission.heartbeatKeyHex !== null || admission.unsignedTransaction !== expected.unsignedTransaction) {
        throw new Error('managed V2 operational admission changed');
      }
      return Object.freeze({ nodeOrigin: input.target.primaryNodeOrigin,
        signedTransactionDigestHex: check.receipt.signedTransactionCanonicalJsonSha256Hex,
        signerArtifact: check.signedCandidate });
    },
    check: async signed => {
      if (signed.signerArtifact !== check.signedCandidate
        || signed.signedTransactionDigestHex !== check.receipt.signedTransactionCanonicalJsonSha256Hex) {
        throw new Error('managed V2 checked signer binding changed');
      }
      return Object.freeze({ checkResponseDigestHex: check.checkedAcceptance.submissionHandle.checkResponseDigestHex,
        checkerArtifact: check.checkedAcceptance.submissionHandle });
    },
    submit: attempt => {
      try {
        requireTime(input.completionDeadline, CONFIRMATION_BUDGET_MS);
      } catch (error) {
        preTransportFailure = error;
        throw error;
      }
      return ports.submit(attempt);
    },
  });
  // The operational lifecycle journals thrown submissions as ambiguous. A local
  // deadline rejection is known not to have reached transport and must stop here.
  if (preTransportFailure !== undefined) throw preTransportFailure;
  if ((execution.status !== 'accepted' && execution.status !== 'ambiguous')
    || execution.expectedTxId !== expected.expectedTxId || execution.durableAttemptRecorded !== true) {
    throw new Error('managed V2 transaction was not durably transported');
  }
}

function assertGenesisIdentity(batch: Batch, transactions: Awaited<ReturnType<typeof executeSubstrateFederatedIsolatedDevnetGenesisBatchV3>>): void {
  if (transactions.length !== 3 || batch.orderedTransactions.length !== 3
    || batch.orderedTransactions.some(({ issuance }, index) => {
      const confirmed = transactions[index];
      const role = GENESIS_ROLES[index];
      return confirmed === undefined || role === undefined
        || issuance.ordinal !== index || issuance.role !== role.issuance
        || confirmed.ordinal !== index || confirmed.role !== role.receipt
        || confirmed.expectedTxId !== issuance.unsignedTransactionIdHex
        || issuance.predictedStateOutput.transactionIdHex !== issuance.unsignedTransactionIdHex
        || issuance.predictedStateOutput.index !== 0;
    })) throw new Error('managed V2 exact genesis lineage changed');
}

async function refreshGenesis(batch: Batch, transactions: Awaited<ReturnType<typeof executeSubstrateFederatedIsolatedDevnetGenesisBatchV3>>,
  observer: Observer, deadline: number, minimumObservationHeight: number): Promise<Awaited<ReturnType<typeof executeSubstrateFederatedIsolatedDevnetGenesisBatchV3>>> {
  assertGenesisIdentity(batch, transactions);
  const refreshed = [];
  for (const transaction of transactions) {
    const confirmation = await waitForCanonicalConfirmation(observer, transaction.expectedTxId,
      deadline, `setup-refresh:${transaction.role}`);
    if (confirmation.confirmationHeight !== transaction.confirmationHeight
      || confirmation.confirmationHeaderIdHex !== transaction.confirmationHeaderIdHex
      || confirmation.observedAtHeight < minimumObservationHeight) {
      throw new Error('managed V2 genesis canonical inclusion changed');
    }
    refreshed.push(Object.freeze({ ...transaction, confirmationDigestHex: confirmation.observationDigestHex,
      confirmationHeight: confirmation.confirmationHeight!, confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex! }));
  }
  return Object.freeze(refreshed);
}
