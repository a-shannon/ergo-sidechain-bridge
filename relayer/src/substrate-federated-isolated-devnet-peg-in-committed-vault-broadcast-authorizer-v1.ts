import { AuthenticatedSpvTrackerReadOnlyNodeClient } from './authenticated-spv-tracker-read-only-node-client.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  assertLocalWasmSignedCheckCandidateProvenance,
  checkSignedTransaction,
} from './fleet-signer.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  type ErgoOperationalBroadcastAuthorization,
  type ErgoOperationalCheckedCandidate,
  type ErgoOperationalRevalidatedCandidate,
  type ErgoOperationalTransactionExecutionPorts,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
} from './substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-pre-transport-observation.v1' as const;

const AUTHORIZATION_SCOPE =
  'fed-6-lab-local-synthetic-peg-in-committed-vault-transition-only' as const;
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1';
const REVALIDATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_REVALIDATION_V1';
const FRESH_JVM_CHECK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_FRESH_JVM_CHECK_V1';
const AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZATION_V1';

type RevalidatorPort = ErgoOperationalTransactionExecutionPorts['revalidator'];
type AuthorizerPort = ErgoOperationalTransactionExecutionPorts['broadcastAuthorizer'];

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_transition_inputs_unspent_and_dual_node_equal';
  readonly expectedTxId: string;
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly sourceLockConfirmationHeight: number;
  readonly sourceLockConfirmationDigestHex: string;
  readonly observedTipHeight: number;
  readonly observedTipHeaderIdHex: string;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly primaryObservationDigestHex: string;
  readonly witnessObservationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly exactDualLoopbackNodesAgreed: true;
    readonly originalSourceFundingRemainsSpent: true;
    readonly exactReservePredecessorUnspent: true;
    readonly exactSourceLockUnspent: true;
    readonly exactTransitionFeeFundingUnspent: true;
    readonly sourceLockConsumptionEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly mintAuthorized: false;
  }>;
  readonly observationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1
extends AuthorizerPort {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA;
  readonly version: 1;
  readonly authorizationScope: typeof AUTHORIZATION_SCOPE;
  readonly expectedTxId: string;
  readonly reservePredecessorBoxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly transitionFeeFundingBoxIdHex: string;
  readonly authorizationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1 {
  readonly revalidator: Readonly<RevalidatorPort>;
  readonly broadcastAuthorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>;
  readonly takePreTransportObservation: () => Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1
  >;
}

interface RevalidationMaterialV1 {
  readonly checked: ErgoOperationalCheckedCandidate;
  readonly observation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1>;
  readonly freshJvmCheckResponseDigestHex: string;
  readonly revalidationDigestHex: string;
}

interface AuthorizerMaterialV1 {
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
  readonly candidate:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
  readonly executionCheck:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1>;
  readonly sourceLockObservation:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>;
  revalidation: RevalidationMaterialV1 | undefined;
  revalidationState: 'fresh' | 'revalidating' | 'revalidated' | 'failed';
  authorized: boolean;
  observationTaken: boolean;
}

interface AuthorizationMaterialV1 {
  readonly authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>;
  readonly revalidated: ErgoOperationalRevalidatedCandidate;
  readonly authorizationDigestHex: string;
}

const AUTHORIZERS = new WeakMap<object, AuthorizerMaterialV1>();
const AUTHORIZATIONS = new WeakMap<object, AuthorizationMaterialV1>();
const CLAIMED_EXECUTION_CHECKS = new WeakSet<object>();

export function createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1>;
    sourceLockObservation:
      Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    input.candidate,
    input.batch,
    input.target,
  );
  const checkBinding =
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(
      input.executionCheck,
      input.target,
    );
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
    input.sourceLockObservation,
    input.target,
  );
  const check = input.executionCheck.receipt;
  const source = input.sourceLockObservation;
  if (
    checkBinding.processBindingDigestHex !== binding.processBindingDigestHex
    || checkBinding.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || input.target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || input.target.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || input.target.primaryMining !== true
    || input.target.witnessReadOnly !== true
    || check.unsignedTransactionIdHex
      !== packet.transactions.reserveTransition.txId
    || check.signedTransactionIdHex !== packet.transactions.reserveTransition.txId
    || check.reservePredecessorBoxIdHex
      !== packet.boxes.reservePredecessor.boxId
    || check.sourceLockBoxIdHex !== packet.boxes.sourceLock.boxId
    || check.transitionFeeFundingBoxIdHex
      !== packet.boxes.transitionFeeFunding.boxId
    || source.expectedTxId !== packet.transactions.sourceLockCreation.txId
    || source.sourceFundingBoxIdHex !== packet.boxes.sourceFundingInput.boxId
    || source.sourceLockBoxIdHex !== packet.boxes.sourceLock.boxId
    || source.transitionFeeFundingBoxIdHex
      !== packet.boxes.transitionFeeFunding.boxId
    || source.processBindingDigestHex !== binding.processBindingDigestHex
    || source.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || source.boundaries.sourceFundingSpent !== true
    || source.boundaries.sourceLockUnspentAndExact !== true
    || source.boundaries.transitionFeeFundingUnspentAndExact !== true
  ) {
    throw new Error(
      'isolated committed-vault authorizer input binding is invalid',
    );
  }
  if (CLAIMED_EXECUTION_CHECKS.has(input.executionCheck)) {
    throw new Error(
      'isolated committed-vault execution check is already claimed',
    );
  }
  CLAIMED_EXECUTION_CHECKS.add(input.executionCheck);

  let authorizer!:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>;
  const revalidator: RevalidatorPort = Object.freeze({
    revalidate: async checked => {
      const material = assertAuthorizer(authorizer, input.target);
      if (material.revalidationState !== 'fresh') {
        throw new Error('isolated committed-vault revalidation is one-shot');
      }
      material.revalidationState = 'revalidating';
      try {
        validateChecked(material, checked);
        const observation = await observeExactTransitionInputs(material, packet);
        const freshJvmCheckResponseDigestHex = await recheckExactSignedCandidate(
          material,
          observation,
        );
        const revalidationDigestHex = sha256CanonicalJson({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA,
          operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
          processBindingDigestHex: material.binding.processBindingDigestHex,
          executionTargetIdentityDigestHex:
            material.binding.executionTargetIdentityDigestHex,
          candidateDigestHex: material.candidate.candidateDigestHex,
          expectedTxId: packet.transactions.reserveTransition.txId,
          checkedTransactionDigestHex:
            material.executionCheck.receipt.receiptDigestHex,
          sourceLockObservationDigestHex:
            material.sourceLockObservation.observationDigestHex,
          preTransportObservationDigestHex: observation.observationDigestHex,
          freshJvmCheckResponseDigestHex,
        }, REVALIDATION_DIGEST_DOMAIN);
        material.revalidation = Object.freeze({
          checked,
          observation,
          freshJvmCheckResponseDigestHex,
          revalidationDigestHex,
        });
        material.revalidationState = 'revalidated';
        return Object.freeze({ revalidationDigestHex });
      } catch (error) {
        material.revalidationState = 'failed';
        throw error;
      }
    },
  });
  authorizer = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA,
    authorize: (revalidated: ErgoOperationalRevalidatedCandidate) => {
      const material = assertAuthorizer(authorizer, input.target);
      if (material.authorized) {
        throw new Error('isolated committed-vault authorization is one-shot');
      }
      validateRevalidated(material, revalidated);
      const admission = revalidated.checked.signed.admission;
      const receipt = material.executionCheck.receipt;
      const handle = material.executionCheck.checkedAcceptance.submissionHandle;
      const observation = material.revalidation!.observation;
      const authorizationDigestHex = sha256CanonicalJson({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA,
        authorizationScope: AUTHORIZATION_SCOPE,
        processBindingDigestHex: material.binding.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          material.binding.executionTargetIdentityDigestHex,
        candidateDigestHex: material.candidate.candidateDigestHex,
        setupRequestDigestHex: material.batch.request.requestDigestHex,
        expectedTxId: admission.expectedTxId,
        reservePredecessorBoxIdHex: admission.sourceBoxId,
        inputBoxIds: admission.inputBoxIds,
        admissionDigestHex: admission.bindingDigestHex,
        unsignedTransactionDigestHex: receipt.unsignedTransactionDigestHex,
        signedTransactionDigestHex:
          receipt.signedTransactionCanonicalJsonSha256Hex,
        signedTransactionBytesSha256Hex:
          handle.signedTransactionBytesSha256Hex,
        signedTransactionBytesLength: handle.signedTransactionBytesLength,
        checkResponseDigestHex: handle.checkResponseDigestHex,
        publicCheckReceiptDigestHex: receipt.receiptDigestHex,
        revalidationDigestHex: revalidated.revalidationDigestHex,
        preTransportObservationDigestHex: observation.observationDigestHex,
        freshJvmCheckResponseDigestHex:
          material.revalidation!.freshJvmCheckResponseDigestHex,
      }, AUTHORIZATION_DIGEST_DOMAIN);
      const authorizationArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA,
        version: 1 as const,
        authorizationScope: AUTHORIZATION_SCOPE,
        expectedTxId: admission.expectedTxId,
        reservePredecessorBoxIdHex: admission.inputBoxIds[0]!,
        sourceLockBoxIdHex: admission.inputBoxIds[1]!,
        transitionFeeFundingBoxIdHex: admission.inputBoxIds[2]!,
        authorizationDigestHex,
      });
      material.authorized = true;
      AUTHORIZATIONS.set(authorizationArtifact, Object.freeze({
        authorizer,
        revalidated,
        authorizationDigestHex,
      }));
      return Object.freeze({ authorizationDigestHex, authorizationArtifact });
    },
  });
  AUTHORIZERS.set(authorizer, {
    target: input.target,
    binding,
    batch: input.batch,
    candidate: input.candidate,
    executionCheck: input.executionCheck,
    sourceLockObservation: input.sourceLockObservation,
    revalidation: undefined,
    revalidationState: 'fresh',
    authorized: false,
    observationTaken: false,
  });
  return Object.freeze({
    revalidator,
    broadcastAuthorizer: authorizer,
    takePreTransportObservation: () => {
      const material = assertAuthorizer(authorizer, input.target);
      if (
        !material.authorized
        || material.revalidation === undefined
        || material.revalidationState !== 'revalidated'
        || material.observationTaken
      ) {
        throw new Error(
          'isolated committed-vault pre-transport observation is unavailable or consumed',
        );
      }
      material.observationTaken = true;
      return material.revalidation.observation;
    },
  });
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertAuthorizer(authorizer, target);
}

export function assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>,
  authorization: ErgoOperationalBroadcastAuthorization,
): void {
  const material = assertAuthorizer(authorizer);
  const stored = AUTHORIZATIONS.get(authorization.authorizationArtifact);
  if (
    stored === undefined
    || stored.authorizer !== authorizer
    || stored.revalidated !== authorization.revalidated
    || stored.authorizationDigestHex !== authorization.authorizationDigestHex
  ) {
    throw new Error(
      'isolated committed-vault authorization lacks exact process provenance',
    );
  }
  validateRevalidated(material, authorization.revalidated);
  const artifact = authorization.authorizationArtifact as Partial<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1
  >;
  const packet = material.candidate.depositPacket;
  if (
    artifact.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA
    || artifact.version !== 1
    || artifact.authorizationScope !== AUTHORIZATION_SCOPE
    || artifact.expectedTxId !== packet.transactions.reserveTransition.txId
    || artifact.reservePredecessorBoxIdHex
      !== packet.boxes.reservePredecessor.boxId
    || artifact.sourceLockBoxIdHex !== packet.boxes.sourceLock.boxId
    || artifact.transitionFeeFundingBoxIdHex
      !== packet.boxes.transitionFeeFunding.boxId
    || artifact.authorizationDigestHex !== authorization.authorizationDigestHex
    || Object.keys(artifact).sort().join(',')
      !== 'authorizationDigestHex,authorizationScope,expectedTxId,reservePredecessorBoxIdHex,schema,sourceLockBoxIdHex,transitionFeeFundingBoxIdHex,version'
  ) {
    throw new Error('isolated committed-vault authorization shape is invalid');
  }
}

function assertAuthorizer(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>,
  expectedTarget?:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): AuthorizerMaterialV1 {
  const material = AUTHORIZERS.get(authorizer);
  if (
    material === undefined
    || authorizer.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA
    || (expectedTarget !== undefined && material.target !== expectedTarget)
  ) {
    throw new Error('isolated committed-vault authorizer lacks provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(material.target);
  if (
    current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated committed-vault authorizer process binding changed');
  }
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    material.candidate,
    material.batch,
    material.target,
  );
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1(
    material.executionCheck,
    material.target,
  );
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
    material.sourceLockObservation,
    material.target,
  );
  return material;
}

function validateChecked(
  material: AuthorizerMaterialV1,
  checked: ErgoOperationalCheckedCandidate,
): void {
  const packet = material.candidate.depositPacket;
  const executionCheck = material.executionCheck;
  const admission = checked.signed.admission;
  const handle = executionCheck.checkedAcceptance.submissionHandle;
  assertLocalWasmSignedCheckCandidateProvenance(executionCheck.signedCandidate);
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
    handle,
    material.binding,
  );
  const expectedInputs = [
    packet.boxes.reservePredecessor.boxId,
    packet.boxes.sourceLock.boxId,
    packet.boxes.transitionFeeFunding.boxId,
  ];
  if (
    admission.operationProfile !== PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
    || admission.expectedTxId !== packet.transactions.reserveTransition.txId
    || admission.sourceBoxId !== expectedInputs[0]
    || !sameStrings(admission.inputBoxIds, expectedInputs)
    || admission.targetSidechainHeight !== null
    || admission.targetSidechainBlockHashHex !== null
    || admission.heartbeatKeyHex !== null
    || admission.unsignedTransaction
      !== packet.transactions.reserveTransition.eip12Tx
    || checked.signed.nodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || checked.signed.signerArtifact !== executionCheck.signedCandidate
    || checked.signed.signedTransactionDigestHex
      !== executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex
    || checked.checkerArtifact !== handle
    || checked.checkResponseDigestHex !== handle.checkResponseDigestHex
  ) {
    throw new Error('isolated committed-vault checked binding changed');
  }
}

function validateRevalidated(
  material: AuthorizerMaterialV1,
  revalidated: ErgoOperationalRevalidatedCandidate,
): void {
  validateChecked(material, revalidated.checked);
  if (
    material.revalidationState !== 'revalidated'
    || material.revalidation === undefined
    || material.revalidation.checked !== revalidated.checked
    || material.revalidation.revalidationDigestHex
      !== revalidated.revalidationDigestHex
  ) {
    throw new Error('isolated committed-vault revalidation binding changed');
  }
}

async function observeExactTransitionInputs(
  material: AuthorizerMaterialV1,
  packet: ReturnType<
    typeof assertSubstrateFederatedIsolatedDevnetPegInCandidateV1
  >,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1
>> {
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    material.target.primaryNodeOrigin,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    material.target.witnessNodeOrigin,
  );
  const primaryState = await observeNodeInputs(
    primary,
    packet.boxes.sourceFundingInput.boxId,
    packet.boxes.reservePredecessor,
    packet.boxes.sourceLock,
    packet.boxes.transitionFeeFunding,
    'primary',
  );
  const witnessState = await observeNodeInputs(
    witness,
    packet.boxes.sourceFundingInput.boxId,
    packet.boxes.reservePredecessor,
    packet.boxes.sourceLock,
    packet.boxes.transitionFeeFunding,
    'witness',
  );
  if (canonicalJson(primaryState) !== canonicalJson(witnessState)) {
    throw new Error('isolated committed-vault input observations disagree');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(material.target);
  if (
    current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated committed-vault target changed during revalidation',
    );
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_transition_inputs_unspent_and_dual_node_equal' as const,
    expectedTxId: packet.transactions.reserveTransition.txId,
    reservePredecessorBoxIdHex: packet.boxes.reservePredecessor.boxId,
    sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
    transitionFeeFundingBoxIdHex: packet.boxes.transitionFeeFunding.boxId,
    sourceLockConfirmationHeight:
      material.sourceLockObservation.confirmationHeight,
    sourceLockConfirmationDigestHex:
      material.sourceLockObservation.confirmationObservationDigestHex,
    observedTipHeight: primaryState.tip.height,
    observedTipHeaderIdHex: primaryState.tip.idHex,
    processBindingDigestHex: current.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      current.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: primaryState.digestHex,
    witnessObservationDigestHex: witnessState.digestHex,
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true as const,
      originalSourceFundingRemainsSpent: true as const,
      exactReservePredecessorUnspent: true as const,
      exactSourceLockUnspent: true as const,
      exactTransitionFeeFundingUnspent: true as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
    }),
  });
  return Object.freeze({
    ...body,
    observationDigestHex: sha256CanonicalJson(
      body,
      OBSERVATION_DIGEST_DOMAIN,
    ),
  });
}

async function observeNodeInputs(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  sourceFundingBoxIdHex: string,
  expectedReservePredecessor: Eip12Box,
  expectedSourceLock: Eip12Box,
  expectedTransitionFeeFunding: Eip12Box,
  label: string,
): Promise<Readonly<{
  sourceFundingBoxIdHex: string;
  sourceFundingPresent: false;
  tip: Readonly<{ height: number; idHex: string }>;
  reservePredecessor: Eip12Box;
  sourceLock: Eip12Box;
  transitionFeeFunding: Eip12Box;
  digestHex: string;
}>> {
  const tipBefore = normalizeBestHeader(
    await client.getBestHeader(),
    `isolated committed-vault ${label} pre-observation tip`,
  );
  const sourceFunding = await client.getBoxByIdOrNull(sourceFundingBoxIdHex);
  const rawReserve = await client.getBoxByIdOrNull(
    expectedReservePredecessor.boxId,
  );
  const rawSourceLock = await client.getBoxByIdOrNull(expectedSourceLock.boxId);
  const rawTransitionFee = await client.getBoxByIdOrNull(
    expectedTransitionFeeFunding.boxId,
  );
  const tipAfter = normalizeBestHeader(
    await client.getBestHeader(),
    `isolated committed-vault ${label} post-observation tip`,
  );
  if (canonicalJson(tipBefore) !== canonicalJson(tipAfter)) {
    throw new Error(
      `isolated committed-vault ${label} tip changed during input observation`,
    );
  }
  if (sourceFunding !== null) {
    throw new Error(
      `isolated committed-vault ${label} reports original source funding`,
    );
  }
  if (
    rawReserve === null
    || rawSourceLock === null
    || rawTransitionFee === null
  ) {
    throw new Error(
      `isolated committed-vault ${label} transition input is unavailable`,
    );
  }
  const reservePredecessor = await normalizeEip12Box(
    rawReserve,
    `isolated committed-vault ${label} reserve predecessor`,
  );
  const sourceLock = await normalizeEip12Box(
    rawSourceLock,
    `isolated committed-vault ${label} source lock`,
  );
  const transitionFeeFunding = await normalizeEip12Box(
    rawTransitionFee,
    `isolated committed-vault ${label} transition-fee funding`,
  );
  if (
    canonicalJson(reservePredecessor)
      !== canonicalJson(expectedReservePredecessor)
    || canonicalJson(sourceLock) !== canonicalJson(expectedSourceLock)
    || canonicalJson(transitionFeeFunding)
      !== canonicalJson(expectedTransitionFeeFunding)
  ) {
    throw new Error(
      `isolated committed-vault ${label} transition input bytes changed`,
    );
  }
  const body = Object.freeze({
    sourceFundingBoxIdHex,
    sourceFundingPresent: false as const,
    tip: tipAfter,
    reservePredecessor,
    sourceLock,
    transitionFeeFunding,
  });
  return Object.freeze({
    ...body,
    digestHex: sha256CanonicalJson(body, OBSERVATION_DIGEST_DOMAIN),
  });
}

async function recheckExactSignedCandidate(
  material: AuthorizerMaterialV1,
  observation: Readonly<
    SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1
  >,
): Promise<string> {
  const candidate = material.executionCheck.signedCandidate;
  const handle = material.executionCheck.checkedAcceptance.submissionHandle;
  const fresh = await checkSignedTransaction(
    candidate,
    'isolated local committed-vault pre-transport recheck',
    material.target.primaryNodeOrigin,
  );
  if (fresh === null) {
    throw new Error('isolated committed-vault fresh JVM check rejected');
  }
  if (
    fresh.txId !== handle.txId
    || fresh.signedTransactionDigestHex !== handle.signedTransactionDigestHex
    || fresh.signedTransactionBytesSha256Hex
      !== handle.signedTransactionBytesSha256Hex
    || fresh.signedTransactionBytesLength !== handle.signedTransactionBytesLength
    || canonicalJson(fresh.signerContext)
      !== canonicalJson(candidate.signerContext)
    || canonicalJson(fresh.checkerIdentity)
      !== canonicalJson(handle.checkerIdentity)
    || observation.observedTipHeight < candidate.signerContext.stateContextTipHeight
  ) {
    throw new Error('isolated committed-vault fresh JVM check binding changed');
  }

  const postCheckTip = await observeExactDualNodeTip(material);
  if (
    postCheckTip.height !== observation.observedTipHeight
    || postCheckTip.idHex !== observation.observedTipHeaderIdHex
  ) {
    throw new Error(
      'isolated committed-vault tip changed during fresh JVM check',
    );
  }

  return sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_BROADCAST_AUTHORIZER_V1_SCHEMA,
    expectedTxId: handle.txId,
    observedTipHeight: observation.observedTipHeight,
    observedTipHeaderIdHex: observation.observedTipHeaderIdHex,
    signedTransactionDigestHex: fresh.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: fresh.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: fresh.signedTransactionBytesLength,
    signerContext: fresh.signerContext,
    checkerIdentity: fresh.checkerIdentity,
    checkResult: fresh.checkResult,
  }, FRESH_JVM_CHECK_DIGEST_DOMAIN);
}

async function observeExactDualNodeTip(
  material: AuthorizerMaterialV1,
): Promise<Readonly<{ height: number; idHex: string }>> {
  const primary = normalizeBestHeader(
    await new AuthenticatedSpvTrackerReadOnlyNodeClient(
      material.target.primaryNodeOrigin,
    ).getBestHeader(),
    'isolated committed-vault primary post-check tip',
  );
  const witness = normalizeBestHeader(
    await new AuthenticatedSpvTrackerReadOnlyNodeClient(
      material.target.witnessNodeOrigin,
    ).getBestHeader(),
    'isolated committed-vault witness post-check tip',
  );
  if (canonicalJson(primary) !== canonicalJson(witness)) {
    throw new Error(
      'isolated committed-vault post-check tip observations disagree',
    );
  }
  return primary;
}

function normalizeBestHeader(
  value: unknown,
  label: string,
): Readonly<{ height: number; idHex: string }> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.height !== 'number'
    || !Number.isSafeInteger(record.height)
    || record.height < 0
  ) {
    throw new Error(`${label} height must be a nonnegative safe integer`);
  }
  if (
    typeof record.id !== 'string'
    || !/^[0-9a-fA-F]{64}$/.test(record.id)
  ) {
    throw new Error(`${label} id must be 32-byte hex`);
  }
  return Object.freeze({
    height: record.height,
    idHex: record.id.toLowerCase(),
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
