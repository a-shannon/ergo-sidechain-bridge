import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  assertLocalWasmSignedCheckCandidateProvenance,
} from './fleet-signer.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  type ErgoOperationalBroadcastAuthorization,
  type ErgoOperationalRevalidatedCandidate,
  type ErgoOperationalTransactionExecutionPorts,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
  type SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
} from './substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1,
  type SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardInputDiscoveryV2,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer.v1' as const;

const AUTHORIZATION_SCOPE =
  'fed-6-lab-local-synthetic-peg-in-source-lock-creation-only' as const;
const REVALIDATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_REVALIDATION_V1';
const AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZATION_V1';

type AuthorizerPort =
  ErgoOperationalTransactionExecutionPorts['broadcastAuthorizer'];

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1
extends AuthorizerPort {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA;
  readonly revalidationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA;
  readonly version: 1;
  readonly authorizationScope: typeof AUTHORIZATION_SCOPE;
  readonly expectedTxId: string;
  readonly sourceFundingBoxIdHex: string;
  readonly authorizationDigestHex: string;
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
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1>;
  readonly postCheck:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
  readonly preTransport:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
  readonly revalidationDigestHex: string;
  authorized: boolean;
}

interface AuthorizationMaterialV1 {
  readonly authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>;
  readonly revalidated: ErgoOperationalRevalidatedCandidate;
  readonly authorizationDigestHex: string;
}

const AUTHORIZERS = new WeakMap<object, AuthorizerMaterialV1>();
const AUTHORIZATIONS = new WeakMap<object, AuthorizationMaterialV1>();

export function createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1>;
    postCheck:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
    preTransport:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(input.target);
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    input.candidate,
    input.batch,
    input.target,
  );
  const checkBinding =
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(
      input.executionCheck,
      input.target,
    );
  const postCheck = assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
    input.postCheck,
    input.target,
  );
  const preTransport = assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
    input.preTransport,
    input.target,
  );
  const sourceFundingBoxIdHex = packet.boxes.sourceFundingInput.boxId;
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
    || input.executionCheck.receipt.sourceFundingBoxIdHex
      !== sourceFundingBoxIdHex
    || input.executionCheck.receipt.unsignedTransactionIdHex
      !== packet.transactions.sourceLockCreation.txId
    || input.executionCheck.receipt.signedTransactionIdHex
      !== packet.transactions.sourceLockCreation.txId
  ) {
    throw new Error('isolated source-lock authorizer target or check binding is invalid');
  }
  assertFundingObservation(
    postCheck,
    sourceFundingBoxIdHex,
    binding,
    'post-check',
  );
  assertFundingObservation(
    preTransport,
    sourceFundingBoxIdHex,
    binding,
    'pre-transport',
  );
  if (preTransport.target.tipHeight < postCheck.target.tipHeight) {
    throw new Error('isolated source-lock pre-transport height moved backwards');
  }
  const revalidationDigestHex = deriveRevalidationDigest({
    candidateDigestHex: input.candidate.candidateDigestHex,
    expectedTxId: packet.transactions.sourceLockCreation.txId,
    sourceFundingBoxIdHex,
    postCheck,
    preTransport,
    binding,
  });

  let authorizer!:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>;
  authorizer = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA,
    revalidationDigestHex,
    authorize: (revalidated: ErgoOperationalRevalidatedCandidate) => {
      const material = assertAuthorizer(authorizer, input.target);
      if (material.authorized) {
        throw new Error('isolated source-lock authorization is one-shot');
      }
      validateRevalidated(material, revalidated);
      const admission = revalidated.checked.signed.admission;
      const receipt = material.executionCheck.receipt;
      const handle = material.executionCheck.checkedAcceptance.submissionHandle;
      const authorizationDigestHex = sha256CanonicalJson({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA,
        authorizationScope: AUTHORIZATION_SCOPE,
        processBindingDigestHex: material.binding.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          material.binding.executionTargetIdentityDigestHex,
        candidateDigestHex: material.candidate.candidateDigestHex,
        setupRequestDigestHex: material.batch.request.requestDigestHex,
        expectedTxId: admission.expectedTxId,
        sourceFundingBoxIdHex: admission.sourceBoxId,
        admissionDigestHex: admission.bindingDigestHex,
        unsignedTransactionDigestHex: receipt.unsignedTransactionDigestHex,
        signedTransactionDigestHex: admission.expectedTxId === handle.txId
          ? receipt.signedTransactionCanonicalJsonSha256Hex
          : null,
        signedTransactionBytesSha256Hex:
          handle.signedTransactionBytesSha256Hex,
        signedTransactionBytesLength: handle.signedTransactionBytesLength,
        checkResponseDigestHex: handle.checkResponseDigestHex,
        publicCheckReceiptDigestHex: receipt.receiptDigestHex,
        revalidationDigestHex,
        postCheckReportDigestHex: material.postCheck.observation.reportDigestHex,
        preTransportReportDigestHex:
          material.preTransport.observation.reportDigestHex,
      }, AUTHORIZATION_DIGEST_DOMAIN);
      const authorizationArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA,
        version: 1 as const,
        authorizationScope: AUTHORIZATION_SCOPE,
        expectedTxId: admission.expectedTxId,
        sourceFundingBoxIdHex: admission.sourceBoxId,
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
    postCheck: input.postCheck,
    preTransport: input.preTransport,
    revalidationDigestHex,
    authorized: false,
  });
  return authorizer;
}

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertAuthorizer(authorizer, target);
}

export function assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>,
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
      'isolated source-lock authorization lacks exact process provenance',
    );
  }
  validateRevalidated(material, authorization.revalidated);
  const artifact = authorization.authorizationArtifact as Partial<
    SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1
  >;
  if (
    artifact.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA
    || artifact.version !== 1
    || artifact.authorizationScope !== AUTHORIZATION_SCOPE
    || artifact.expectedTxId
      !== authorization.revalidated.checked.signed.admission.expectedTxId
    || artifact.sourceFundingBoxIdHex
      !== authorization.revalidated.checked.signed.admission.sourceBoxId
    || artifact.authorizationDigestHex !== authorization.authorizationDigestHex
    || Object.keys(artifact).sort().join(',')
      !== 'authorizationDigestHex,authorizationScope,expectedTxId,schema,sourceFundingBoxIdHex,version'
  ) {
    throw new Error('isolated source-lock authorization shape is invalid');
  }
}

function assertAuthorizer(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>,
  expectedTarget?: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): AuthorizerMaterialV1 {
  const material = AUTHORIZERS.get(authorizer);
  if (
    material === undefined
    || authorizer.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA
    || authorizer.revalidationDigestHex !== material.revalidationDigestHex
    || (expectedTarget !== undefined && material.target !== expectedTarget)
  ) {
    throw new Error('isolated source-lock authorizer lacks provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(material.target);
  if (
    current.processBindingDigestHex !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated source-lock authorizer process binding changed');
  }
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1(
    material.candidate,
    material.batch,
    material.target,
  );
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1(
    material.executionCheck,
    material.target,
  );
  return material;
}

function validateRevalidated(
  material: AuthorizerMaterialV1,
  revalidated: ErgoOperationalRevalidatedCandidate,
): void {
  const admission = revalidated.checked.signed.admission;
  const packet = material.candidate.depositPacket;
  const executionCheck = material.executionCheck;
  const handle = executionCheck.checkedAcceptance.submissionHandle;
  assertLocalWasmSignedCheckCandidateProvenance(executionCheck.signedCandidate);
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
    handle,
    material.binding,
  );
  if (
    admission.operationProfile
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE
    || admission.expectedTxId !== packet.transactions.sourceLockCreation.txId
    || admission.sourceBoxId !== packet.boxes.sourceFundingInput.boxId
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== packet.boxes.sourceFundingInput.boxId
    || admission.targetSidechainHeight !== null
    || admission.targetSidechainBlockHashHex !== null
    || admission.heartbeatKeyHex !== null
    || admission.unsignedTransaction
      !== packet.transactions.sourceLockCreation.eip12Tx
    || revalidated.checked.signed.nodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || revalidated.checked.signed.signerArtifact
      !== executionCheck.signedCandidate
    || revalidated.checked.signed.signedTransactionDigestHex
      !== executionCheck.receipt.signedTransactionCanonicalJsonSha256Hex
    || revalidated.checked.checkerArtifact !== handle
    || revalidated.checked.checkResponseDigestHex
      !== handle.checkResponseDigestHex
    || revalidated.revalidationDigestHex !== material.revalidationDigestHex
  ) {
    throw new Error('isolated source-lock authorization input binding changed');
  }
}

function assertFundingObservation(
  observation: Readonly<SubstrateFederatedRewardInputDiscoveryV2>,
  sourceFundingBoxIdHex: string,
  binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  label: string,
): void {
  if (
    observation.sources.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || observation.sources.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || observation.genesisInputs.tracker.boxId !== sourceFundingBoxIdHex
    || observation.target.network !== 'devnet'
    || observation.boundary.fixedDualLoopbackOrigins !== true
    || observation.boundary.targetBinaryRevalidationRequired !== true
    || !/^[0-9a-f]{64}$/u.test(observation.reportDigestHex)
    || !/^[0-9a-f]{64}$/u.test(binding.executionTargetIdentityDigestHex)
  ) {
    throw new Error(`isolated source-lock ${label} observation is invalid`);
  }
}

function deriveRevalidationDigest(input: {
  candidateDigestHex: string;
  expectedTxId: string;
  sourceFundingBoxIdHex: string;
  postCheck: Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
  preTransport: Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
  binding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}): string {
  return sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_BROADCAST_AUTHORIZER_V1_SCHEMA,
    candidateDigestHex: input.candidateDigestHex,
    expectedTxId: input.expectedTxId,
    sourceFundingBoxIdHex: input.sourceFundingBoxIdHex,
    processBindingDigestHex: input.binding.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      input.binding.executionTargetIdentityDigestHex,
    postCheckReportDigestHex: input.postCheck.reportDigestHex,
    postCheckTipHeight: input.postCheck.target.tipHeight,
    postCheckTipHeaderIdHex: input.postCheck.target.tipHeaderIdHex,
    preTransportReportDigestHex: input.preTransport.reportDigestHex,
    preTransportTipHeight: input.preTransport.target.tipHeight,
    preTransportTipHeaderIdHex: input.preTransport.target.tipHeaderIdHex,
  }, REVALIDATION_DIGEST_DOMAIN);
}
