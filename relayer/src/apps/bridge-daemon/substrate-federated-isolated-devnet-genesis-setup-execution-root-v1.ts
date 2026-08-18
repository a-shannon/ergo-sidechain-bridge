import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from '../../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  executeSubstrateFederatedLocalDevnetGenesisV1,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  type SubstrateFederatedLocalDevnetGenesisAdmission,
  type SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisExecutionResult,
  type SubstrateFederatedLocalDevnetGenesisRole,
  type SubstrateFederatedLocalDevnetGenesisSignedCandidate,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import { StateTracker } from '../../state-tracker.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from '../../substrate-federated-authority-safe-devnet-history-v1.js';
import type {
  RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input,
  SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1,
} from '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1,
  type BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input,
  type SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt,
} from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  type SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
} from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
  type ProduceSubstrateFederatedIsolatedDevnetPacketV1Input,
  type SubstrateFederatedIsolatedDevnetPacketSessionV1,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  discoverSubstrateFederatedRewardInputsV1,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
} from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  type SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1,
} from '../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  createSubstrateFederatedLocalDevnetGenesisJournalV1,
  type SubstrateFederatedLocalDevnetGenesisJournalV1,
} from '../../substrate-federated-local-devnet-genesis-journal-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-setup-execution-root.v1' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1';
const STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_V1';
const FEDERATION_EPOCH = '1';
const MAX_ADMISSION_VALIDITY_BLOCKS = '64';
const CONFIRMATION_POLL_MS = 250;
const ACTION_COMPLETION_BUDGET_MS = 9 * 60_000;

const ROLE_ORDER = Object.freeze([
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const);

const STATIC_EXECUTION_MANIFEST = Object.freeze({
  schema: 'e2s.substrate-federated-isolated-devnet-genesis-setup-static-execution.v1',
  version: 1 as const,
  roles: ROLE_ORDER,
  operations: Object.freeze([
    'buildSubstrateFederatedIsolatedDevnetErgoNodeV1',
    'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
    'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
    'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
    'collectSubstrateFederatedAuthoritySafeDevnetHistoryV1',
    'discoverSubstrateFederatedRewardInputsV1',
    'collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1',
    'setupSession.runForExecution',
    'createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1',
    'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
    'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    'createSubstrateFederatedLocalDevnetGenesisJournalV1',
    'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    'executeSubstrateFederatedLocalDevnetGenesisV1',
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    STATIC_EXECUTION_MANIFEST,
    STATIC_EXECUTION_MANIFEST_DIGEST_DOMAIN,
  );

export interface RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input {
  readonly build:
    Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>;
  readonly lifecycle:
    Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>;
}

export interface SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'three_local_setup_transactions_canonically_confirmed';
  readonly staticExecutionManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
  readonly lifecycle: Readonly<{
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly setupCheckReceiptDigestHex: string;
    readonly setupRequestDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
  }>;
  readonly transactions: readonly Readonly<{
    readonly ordinal: 0 | 1 | 2;
    readonly role: SubstrateFederatedLocalDevnetGenesisRole;
    readonly expectedTxId: string;
    readonly transportStatus: 'accepted' | 'ambiguous' | 'reconciled';
    readonly durableAttemptDigestHex: string;
    readonly journalDigestHex: string;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
  }>[];
  readonly checks: Readonly<{
    readonly exactLockedPatchedNodeBuiltBeforeSignerCreation: true;
    readonly staticExecutionModulesBound: true;
    readonly replacementPortAccepted: false;
    readonly exactCheckedCandidatesConsumedOnce: true;
    readonly exactCanonicalRoleOrderEnforced: true;
    readonly durableReservationPrecededTransport: true;
    readonly predecessorConfirmationPrecededSuccessorAuthorization: true;
    readonly allConfirmedAttemptsRevalidatedBeforeTeardown: true;
    readonly temporaryJournalRemovedAfterResolution: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localSyntheticCompatibilityOnly: true;
    readonly localSetupTargetNodeAcceptanceEstablished: true;
    readonly localSetupSubmissionExecuted: true;
    readonly localSetupBroadcastExecuted: true;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
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

export interface SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt>;
}

/**
 * The only static FED-6-LAB root that may connect checked setup candidates to
 * the local `/transactions` transport. It accepts no replaceable runtime port.
 */
export async function runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
  input:
    Readonly<RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1>> {
  const built = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(
    input.build,
  );
  let setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2> | undefined;
  let packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1> | undefined;
  let nodeSession:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1>
    | undefined;
  let managed:
    Readonly<{
      readonly value: Readonly<ExecutionActionResult>;
      readonly receipt:
        Readonly<SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt>;
    }> | undefined;
  const journalRoots = new Set<string>();
  let failure: unknown;

  try {
    setupSession =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const miningCredential =
      claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(
        setupSession,
      );
    packetSession = createSubstrateFederatedIsolatedDevnetPacketSessionV1(
      setupSession.signer,
    );
    assertPacketErgoSignerMatchesSetup(packetSession, setupSession.signer);
    const profilePins = deriveExpectedProfilePins(packetSession);
    nodeSession = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
      {
        javaExecutablePath: built.javaExecutablePath,
        expectedJavaExecutableSha256Hex:
          built.receipt.toolchain.javaExecutableSha256Hex,
        nodeAssemblyJarPath: built.nodeAssemblyJarPath,
        expectedNodeAssemblyJarSha256Hex:
          built.receipt.build.artifactSha256Hex,
        buildIdentityDigestHex: built.receipt.buildIdentityDigestHex,
      },
      nodeLaunchBinding(setupSession.signer),
      miningCredential,
    );
    await nodeSession.startMining();
    managed = await nodeSession.withMiningActiveExecutionTarget(
      async target => await executeManagedSetupAction(
        input.lifecycle,
        setupSession!,
         packetSession!,
         profilePins,
         target,
         journalRoots,
       ),
     );
  } catch (error) {
    failure = error;
  }

  const teardownErrors: unknown[] = [];
  disposeSession(packetSession, 'packet session', teardownErrors);
  disposeSession(setupSession, 'setup-check session', teardownErrors);
  let taskOwnedChainDestructionEstablished = nodeSession === undefined;
  if (nodeSession !== undefined) {
    try {
      await nodeSession.stop();
      taskOwnedChainDestructionEstablished = true;
    } catch (error) {
      teardownErrors.push(new Error('Ergo node teardown failed', {
        cause: error,
      }));
    }
  }
  if (taskOwnedChainDestructionEstablished) {
    for (const journalRoot of journalRoots) {
      try {
        rmSync(journalRoot, { recursive: true, force: false });
        journalRoots.delete(journalRoot);
      } catch (error) {
        teardownErrors.push(new Error('local genesis journal teardown failed', {
          cause: error,
        }));
      }
    }
  }
  if (failure !== undefined) {
    if (teardownErrors.length > 0) {
      throw new AggregateError(
        [failure, ...teardownErrors],
        'isolated genesis setup execution failed and teardown was incomplete',
      );
    }
    throw failure;
  }
  if (teardownErrors.length > 0) {
    throw new AggregateError(
      teardownErrors,
      'isolated genesis setup execution teardown was incomplete',
    );
  }
  if (managed === undefined) {
    throw new Error('isolated genesis setup execution produced no result');
  }

  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'three_local_setup_transactions_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: built.receipt,
    process: managed.receipt,
    lifecycle: managed.value.lifecycle,
    transactions: managed.value.transactions,
    checks: {
      exactLockedPatchedNodeBuiltBeforeSignerCreation: true as const,
      staticExecutionModulesBound: true as const,
      replacementPortAccepted: false as const,
      exactCheckedCandidatesConsumedOnce: true as const,
      exactCanonicalRoleOrderEnforced: true as const,
      durableReservationPrecededTransport: true as const,
      predecessorConfirmationPrecededSuccessorAuthorization: true as const,
      allConfirmedAttemptsRevalidatedBeforeTeardown: true as const,
      temporaryJournalRemovedAfterResolution: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true as const,
      localSetupTargetNodeAcceptanceEstablished: true as const,
      localSetupSubmissionExecuted: true as const,
      localSetupBroadcastExecuted: true as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN),
  });
  assertNoCapabilityValue(receipt);
  assertNoLocalPathValue(receipt);
  return Object.freeze({ receipt });
}

interface ExecutionActionResult {
  readonly lifecycle:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['lifecycle'];
  readonly transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'];
}

async function executeManagedSetupAction(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>,
  setupSession:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2>,
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
  profilePins:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  journalRoots: Set<string>,
): Promise<Readonly<ExecutionActionResult>> {
  const completionDeadline = Date.now() + ACTION_COMPLETION_BUDGET_MS;
  const sourceHistory =
    await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(
      input.sourceHistory,
    );
  const rewardInputs = await discoverSubstrateFederatedRewardInputsV1(
    setupSession.signer,
  );
  const ergoHistory =
    await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
      rewardInputs,
    );
  const packet = await packetSession.produce({
    sourceHistory,
    ergoHistory,
    expectedProfilePins: profilePins,
    relayerArtifacts: input.relayerArtifacts,
  });
  const batch = await setupSession.runForExecution({
    portableReplayInput: packet.portableReplayInput,
    primaryNodeOrigin: target.primaryNodeOrigin,
    witnessNodeOrigin: target.witnessNodeOrigin,
  }, target);
  assertCanonicalBatch(batch);

  const targetBinding = batch.targetBinding;
  const observer =
    createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
      target,
      batch.request.target.genesisHeaderIdHex,
    );
  const revalidator =
    createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(target, batch);
  const authorizer =
    createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
      target,
      batch,
      revalidator,
      observer,
    );
  const transport =
    createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
      target,
      authorizer,
    );

  const localStateRoot = mkdtempSync(join(tmpdir(), 'e2s-fed6lab-'));
  journalRoots.add(localStateRoot);
  const markerDirectory = join(localStateRoot, 'attempt-markers');
  mkdirSync(markerDirectory);
  const state = new StateTracker(join(localStateRoot, 'state-store'));
  let actionResult: Readonly<ExecutionActionResult> | undefined;
  let actionFailure: unknown;
  try {
    const journal = createSubstrateFederatedLocalDevnetGenesisJournalV1({
      state,
      markerDirectory,
      reconciliationIdentityDigestHex:
        targetBinding.executionTargetIdentityDigestHex,
    });
    const transactions: SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'][number][] = [];
    for (let ordinal = 0; ordinal < batch.orderedTransactions.length; ordinal += 1) {
      const transaction = batch.orderedTransactions[ordinal]!;
      const role = coreRole(transaction.issuance.role);
      if (role !== ROLE_ORDER[ordinal]) {
        throw new Error('isolated genesis execution role order changed');
      }
      const execution = await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(batch, transaction, role),
        executionPorts(
          batch,
          transaction,
          role,
          revalidator,
          authorizer,
          journal,
          transport,
          observer,
        ),
      );
      assertTransportExecution(execution, role, transaction);
      const confirmation = await waitForCanonicalConfirmation(
        observer,
        transaction.issuance.unsignedTransactionIdHex,
        completionDeadline,
      );
      const reconciliation = await journal.reconcileActive(observer);
      if (
        execution.confirmationStatus === 'confirmed'
          ? reconciliation !== 'none'
          : reconciliation !== 'confirmed'
      ) {
        throw new Error('isolated genesis durable reconciliation changed');
      }
      authorizer.acknowledgeCanonicalConfirmation(role, confirmation);
      transactions.push(Object.freeze({
        ordinal: ordinal as 0 | 1 | 2,
        role,
        expectedTxId: execution.expectedTxId,
        transportStatus: execution.status,
        durableAttemptDigestHex: execution.durableAttemptDigestHex,
        journalDigestHex: execution.journalDigestHex,
        confirmationDigestHex: confirmation.observationDigestHex,
        confirmationHeight: confirmation.confirmationHeight!,
        confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex!,
      }));
    }
    assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1(
      authorizer,
      target,
    );
    if (await journal.revalidateConfirmed(observer) !== ROLE_ORDER.length) {
      throw new Error('isolated genesis confirmed attempt count changed');
    }
    const finalTransactions = await refreshCanonicalReceiptConfirmations(
      transactions,
      observer,
      completionDeadline,
    );
    actionResult = deepFreeze({
      lifecycle: {
        federationProfileIdHex: profilePins.federationProfileIdHex,
        sourceAttestationKeySetDigestHex:
          profilePins.sourceAttestationKeySetDigestHex,
        ergoAdmissionKeySetDigestHex:
          profilePins.ergoAdmissionKeySetDigestHex,
        packetReceiptDigestHex: packet.receipt.receiptDigestHex,
        setupCheckReceiptDigestHex: batch.receipt.receiptDigestHex,
        setupRequestDigestHex: batch.request.requestDigestHex,
        executionTargetIdentityDigestHex:
          targetBinding.executionTargetIdentityDigestHex,
      },
      transactions: finalTransactions,
    });
  } catch (error) {
    actionFailure = error;
  }
  const cleanupErrors: unknown[] = [];
  try {
    state.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (actionFailure !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [actionFailure, ...cleanupErrors],
        'isolated genesis action failed and local journal cleanup was incomplete',
      );
    }
    throw actionFailure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'isolated genesis local journal cleanup was incomplete',
    );
  }
  if (actionResult === undefined) {
    throw new Error('isolated genesis managed action produced no result');
  }
  return actionResult;
}

function executionInput(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
) {
  const issuance = transaction.issuance;
  if (
    issuance.predictedStateOutput.creationHeight
      !== batch.request.target.preSetupAnchor.height
  ) {
    throw new Error('isolated genesis creation height differs from its anchor');
  }
  return {
    role,
    planDigestHex: batch.request.requestDigestHex,
    targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
    expectedTxId: issuance.unsignedTransactionIdHex,
    sourceBoxId: issuance.genesisInputBoxIdHex,
    inputBoxIds: [issuance.genesisInputBoxIdHex],
    attemptedAtHeight: issuance.predictedStateOutput.creationHeight,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    unsignedTransaction: issuance.unsignedTransactionBody,
  } as const;
}

function executionPorts(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  revalidator: SubstrateFederatedLocalDevnetGenesisExecutionPorts['revalidator'],
  authorizer:
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['broadcastAuthorizer'],
  journal: Readonly<SubstrateFederatedLocalDevnetGenesisJournalV1>,
  transport: SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport'],
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
): Readonly<SubstrateFederatedLocalDevnetGenesisExecutionPorts> {
  return Object.freeze({
    signer: Object.freeze({
      sign: async (admission: SubstrateFederatedLocalDevnetGenesisAdmission) => {
        assertAdmissionMatchesTransaction(admission, batch, transaction, role);
        return Object.freeze({
          signedTransactionDigestHex:
            transaction.signedCandidate.signedTransactionDigestHex,
          signerArtifact: transaction.signedCandidate,
        });
      },
    }),
    checker: Object.freeze({
      check: async (
        signed: SubstrateFederatedLocalDevnetGenesisSignedCandidate,
      ) => {
        assertAdmissionMatchesTransaction(
          signed.admission,
          batch,
          transaction,
          role,
        );
        if (
          signed.signerArtifact !== transaction.signedCandidate
          || signed.signedTransactionDigestHex
            !== transaction.signedCandidate.signedTransactionDigestHex
        ) {
          throw new Error('isolated genesis signed candidate binding changed');
        }
        return Object.freeze({
          checkResponseDigestHex:
            transaction.checkedAcceptance.submissionHandle.checkResponseDigestHex,
          checkerArtifact:
            transaction.checkedAcceptance.submissionHandle,
        });
      },
    }),
    revalidator,
    broadcastAuthorizer: authorizer,
    journal: journal.journal,
    transport,
    confirmationObserver: observer,
  });
}

function assertAdmissionMatchesTransaction(
  admission: SubstrateFederatedLocalDevnetGenesisAdmission,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  role: SubstrateFederatedLocalDevnetGenesisRole,
): void {
  const issuance = transaction.issuance;
  if (
    admission.role !== role
    || admission.planDigestHex !== batch.request.requestDigestHex
    || admission.targetGenesisHeaderIdHex
      !== batch.request.target.genesisHeaderIdHex
    || admission.expectedTxId !== issuance.unsignedTransactionIdHex
    || admission.sourceBoxId !== issuance.genesisInputBoxIdHex
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== issuance.genesisInputBoxIdHex
    || admission.attemptedAtHeight
      !== issuance.predictedStateOutput.creationHeight
    || admission.nodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || admission.unsignedTransaction !== issuance.unsignedTransactionBody
  ) {
    throw new Error('isolated genesis admission differs from checked issuance');
  }
}

function assertTransportExecution(
  result: SubstrateFederatedLocalDevnetGenesisExecutionResult,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
): asserts result is Extract<
  SubstrateFederatedLocalDevnetGenesisExecutionResult,
  { readonly transportAttempted: true }
> & { readonly status: 'accepted' | 'ambiguous' | 'reconciled' } {
  if (
    result.transportAttempted !== true
    || result.status === 'rejected'
    || result.role !== role
    || result.expectedTxId !== transaction.issuance.unsignedTransactionIdHex
  ) {
    throw new Error('isolated genesis setup transaction was not transported');
  }
}

async function waitForCanonicalConfirmation(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  expectedTxId: string,
  deadline: number,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConfirmation>> {
  let lastObservationFailure: unknown;
  for (;;) {
    let rawObservation:
      SubstrateFederatedLocalDevnetGenesisConfirmation | null;
    try {
      rawObservation = await observer.observe(
        expectedTxId,
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
      );
      lastObservationFailure = undefined;
    } catch (error) {
      lastObservationFailure = error;
      rawObservation = null;
    }
    if (rawObservation === null) {
      if (Date.now() >= deadline) {
        throw new Error(
          'isolated genesis transaction confirmation remained unavailable before the managed deadline',
          lastObservationFailure === undefined
            ? undefined
            : { cause: lastObservationFailure },
        );
      }
      await delay(CONFIRMATION_POLL_MS);
      continue;
    }
    const observation =
      normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
        rawObservation,
      );
    if (
      observation.status === 'confirmed'
      && observation.confirmationHeight !== null
      && observation.confirmationHeaderIdHex !== null
    ) {
      return observation;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `isolated genesis transaction remained ${observation.status} before the managed deadline`,
      );
    }
    await delay(CONFIRMATION_POLL_MS);
  }
}

async function refreshCanonicalReceiptConfirmations(
  transactions:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'],
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  deadline: number,
): Promise<
  SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions']
> {
  const refreshed:
    SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt['transactions'][number][] = [];
  for (const transaction of transactions) {
    const confirmation = await waitForCanonicalConfirmation(
      observer,
      transaction.expectedTxId,
      deadline,
    );
    refreshed.push(Object.freeze({
      ...transaction,
      confirmationDigestHex: confirmation.observationDigestHex,
      confirmationHeight: confirmation.confirmationHeight!,
      confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex!,
    }));
  }
  return Object.freeze(refreshed);
}

function assertCanonicalBatch(
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
): void {
  if (
    batch.orderedTransactions.length !== ROLE_ORDER.length
    || batch.orderedTransactions.some((transaction, index) =>
      coreRole(transaction.issuance.role) !== ROLE_ORDER[index]
      || transaction.issuance.ordinal !== index
      || transaction.issuance.predictedStateOutput.creationHeight
        !== batch.request.target.preSetupAnchor.height
    )
  ) {
    throw new Error('isolated genesis execution batch order or anchor changed');
  }
}

function deriveExpectedProfilePins(
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
): Readonly<
  ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']
> {
  const signer = packetSession.signer;
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: FEDERATION_EPOCH,
    maxAdmissionValidityBlocks: MAX_ADMISSION_VALIDITY_BLOCKS,
    sourceAttestationThreshold: signer.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      signer.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: signer.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: signer.ergoAdmissionPublicKeysHex,
  });
  return Object.freeze({
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
  });
}

function assertPacketErgoSignerMatchesSetup(
  packetSession:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1>,
  setupSigner:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
): void {
  if (
    packetSession.signer.ergoAdmissionThreshold !== 1
    || packetSession.signer.ergoAdmissionPublicKeysHex.length !== 1
    || packetSession.signer.ergoAdmissionPublicKeysHex[0]
      !== setupSigner.publicKeyHex
  ) {
    throw new Error(
      'isolated packet Ergo-admission signer differs from the setup signer',
    );
  }
}

function nodeLaunchBinding(
  signer:
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1> {
  return Object.freeze({
    miningTargetPublicKeyHex: signer.publicKeyHex,
    p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
    rewardInputErgoTrees: Object.freeze({
      delay1: signer.rewardInputErgoTrees.delay1,
      delay720: signer.rewardInputErgoTrees.delay720,
    }),
    networkPrefix: signer.networkPrefix,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  });
}

function coreRole(
  role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
): SubstrateFederatedLocalDevnetGenesisRole {
  if (role === 'duplicate-prevention') return 'duplicatePrevention';
  if (role === 'pooled-reserve') return 'pooledReserve';
  return 'tracker';
}

function disposeSession(
  session: Readonly<{ readonly dispose: () => void }> | undefined,
  label: string,
  errors: unknown[],
): void {
  if (session === undefined) return;
  try {
    session.dispose();
  } catch (error) {
    errors.push(new Error(`${label} teardown failed`, { cause: error }));
  }
}

function assertNoCapabilityValue(value: unknown): void {
  if (typeof value === 'function') {
    throw new Error('isolated genesis receipt contains a capability');
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoCapabilityValue(entry);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) assertNoCapabilityValue(entry);
  }
}

function assertNoLocalPathValue(value: unknown): void {
  if (
    typeof value === 'string'
    && (/(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u.test(value)
      || value.startsWith('\\\\')
      || value.startsWith('//'))
  ) {
    throw new Error('isolated genesis receipt contains a local path');
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoLocalPathValue(entry);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) assertNoLocalPathValue(entry);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
