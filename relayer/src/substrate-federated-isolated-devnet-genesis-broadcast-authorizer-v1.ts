import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  type LocalWasmCheckedSubmissionHandleV1,
} from './fleet-signer.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate,
  type SubstrateFederatedLocalDevnetGenesisRevalidation,
  type SubstrateFederatedLocalDevnetGenesisRole,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  type SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1,
  type SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1,
} from './substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  type SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  type SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v1' as const;

const WITNESS_ORIGIN = 'http://127.0.0.1:9052' as const;
const AUTHORIZATION_SCOPE =
  'fed-6-lab-local-synthetic-genesis-setup-only' as const;
const AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZATION_V1';
const ROLE_ORDER = Object.freeze([
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const);

type BroadcastAuthorizerPort =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['broadcastAuthorizer'];

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1
extends BroadcastAuthorizerPort {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA;
  acknowledgeCanonicalConfirmation(
    role: SubstrateFederatedLocalDevnetGenesisRole,
    confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
  ): void;
}

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA;
  readonly version: 1;
  readonly authorizationScope: typeof AUTHORIZATION_SCOPE;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly ordinal: 0 | 1 | 2;
  readonly expectedTxId: string;
  readonly authorizationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1 {
  readonly revalidated:
    SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate;
  readonly preTransportEvidence:
    SubstrateFederatedLocalDevnetGenesisRevalidation;
  readonly authorizationDigestHex: string;
}

interface AuthorizerMaterialV1 {
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>;
  readonly revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>;
  readonly confirmationObserver:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>;
  readonly transactions: ReadonlyMap<
    SubstrateFederatedLocalDevnetGenesisRole,
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>
  >;
  nextOrdinal: number;
  pending: Readonly<{
    readonly role: SubstrateFederatedLocalDevnetGenesisRole;
    readonly ordinal: 0 | 1 | 2;
    readonly expectedTxId: string;
  }> | null;
}

interface AuthorizationMaterialV1 {
  readonly authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>;
  readonly revalidated:
    SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate;
  readonly preTransportEvidence:
    SubstrateFederatedLocalDevnetGenesisRevalidation;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly ordinal: 0 | 1 | 2;
  readonly expectedTxId: string;
  readonly authorizationDigestHex: string;
}

interface ValidatedAuthorizationInputV1 {
  readonly checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate;
  readonly transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>;
  readonly handle: Readonly<LocalWasmCheckedSubmissionHandleV1>;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly ordinal: 0 | 1 | 2;
}

const AUTHORIZERS = new WeakMap<object, AuthorizerMaterialV1>();
const AUTHORIZATIONS = new WeakMap<object, AuthorizationMaterialV1>();
const AUTHORIZED_HANDLES = new WeakSet<object>();

/**
 * This factory is the reviewed authorization decision for FED-6-LAB setup.
 * It must remain dormant until the sole static LAB composition root imports it.
 */
export function createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
  confirmationObserver:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  const targetBinding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    targetBinding.processBindingDigestHex !== binding.processBindingDigestHex
    || targetBinding.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || target.witnessNodeOrigin !== WITNESS_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
    || batch.request.target.primary.nodeOrigin !== target.primaryNodeOrigin
    || batch.request.target.witness.nodeOrigin !== target.witnessNodeOrigin
  ) {
    throw new Error('isolated genesis authorizer target binding is invalid');
  }
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    confirmationObserver,
    binding.executionTargetIdentityDigestHex,
  );
  const transactions = new Map<
    SubstrateFederatedLocalDevnetGenesisRole,
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>
  >();
  const handles = new Set<object>();
  for (const transaction of batch.orderedTransactions) {
    const role = coreRole(transaction.issuance.role);
    const handle = transaction.checkedAcceptance.submissionHandle;
    if (
      handle === null
      || typeof handle !== 'object'
      || transactions.has(role)
      || handles.has(handle)
    ) {
      throw new Error('isolated genesis authorizer role or handle is duplicated');
    }
    transactions.set(role, transaction);
    handles.add(handle);
  }
  if (
    transactions.size !== ROLE_ORDER.length
    || ROLE_ORDER.some((role, index) =>
      coreRole(batch.orderedTransactions[index]?.issuance.role) !== role)
  ) {
    throw new Error('isolated genesis authorizer requires canonical setup order');
  }

  let authorizer!:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>;
  authorizer = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA,
    authorize: (
      revalidated:
        SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate,
      preTransportEvidence:
        SubstrateFederatedLocalDevnetGenesisRevalidation,
    ) => {
      const material = assertAuthorizer(authorizer, target);
      const validated = validateAuthorizationInput(
        material,
        revalidated,
        preTransportEvidence,
      );
      if (material.pending !== null) {
        throw new Error(
          'isolated genesis predecessor confirmation is required',
        );
      }
      if (validated.ordinal !== material.nextOrdinal) {
        throw new Error('isolated genesis authorization order is invalid');
      }
      if (AUTHORIZED_HANDLES.has(validated.handle)) {
        throw new Error('isolated genesis checked handle is already authorized');
      }

      const admission = validated.checked.signed.admission;
      const authorizationDigestHex = sha256CanonicalJson({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA,
        authorizationScope: AUTHORIZATION_SCOPE,
        processBindingDigestHex: material.binding.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          material.binding.executionTargetIdentityDigestHex,
        requestDigestHex: material.batch.request.requestDigestHex,
        role: validated.role,
        ordinal: validated.ordinal,
        targetGenesisHeaderIdHex: admission.targetGenesisHeaderIdHex,
        expectedTxId: admission.expectedTxId,
        admissionDigestHex: admission.admissionDigestHex,
        sourceBoxId: admission.sourceBoxId,
        signedTransactionDigestHex:
          validated.checked.signed.signedTransactionDigestHex,
        checkResponseDigestHex: validated.checked.checkResponseDigestHex,
        postCheck: evidenceDigestInput(revalidated.postCheckEvidence),
        preTransport: evidenceDigestInput(preTransportEvidence),
      }, AUTHORIZATION_DIGEST_DOMAIN);
      const ordinal = validated.ordinal;
      const authorizationArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA,
        version: 1 as const,
        authorizationScope: AUTHORIZATION_SCOPE,
        role: validated.role,
        ordinal,
        expectedTxId: admission.expectedTxId,
        authorizationDigestHex,
      });
      AUTHORIZED_HANDLES.add(validated.handle);
      material.pending = Object.freeze({
        role: validated.role,
        ordinal,
        expectedTxId: admission.expectedTxId,
      });
      AUTHORIZATIONS.set(authorizationArtifact, Object.freeze({
        authorizer,
        revalidated,
        preTransportEvidence,
        role: validated.role,
        ordinal,
        expectedTxId: admission.expectedTxId,
        authorizationDigestHex,
      }));
      return Object.freeze({ authorizationDigestHex, authorizationArtifact });
    },
    acknowledgeCanonicalConfirmation: (
      role: SubstrateFederatedLocalDevnetGenesisRole,
      confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
    ) => {
      const material = assertAuthorizer(authorizer, target);
      const pending = material.pending;
      if (pending === null || pending.role !== role) {
        throw new Error(
          'isolated genesis confirmation does not match a pending role',
        );
      }
      const exact =
        normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
          confirmation,
        );
      if (
        exact.status !== 'confirmed'
        || exact.confirmations
          < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
        || exact.confirmationHeight === null
        || exact.confirmationHeaderIdHex === null
      ) {
        throw new Error(
          'isolated genesis progression requires canonical confirmation',
        );
      }
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        exact.observerArtifact,
        material.binding.executionTargetIdentityDigestHex,
        material.batch.request.target.genesisHeaderIdHex,
        pending.expectedTxId,
        exact,
      );
      material.pending = null;
      material.nextOrdinal += 1;
    },
  });
  AUTHORIZERS.set(authorizer, {
    target,
    binding,
    batch,
    revalidator,
    confirmationObserver,
    transactions,
    nextOrdinal: 0,
    pending: null,
  });
  return authorizer;
}

export function assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  const material = assertAuthorizer(authorizer, target);
  if (material.nextOrdinal !== ROLE_ORDER.length || material.pending !== null) {
    throw new Error('isolated genesis setup is not canonically confirmed');
  }
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertAuthorizer(authorizer, target);
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  artifact: object,
  expectation:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1>,
): void {
  const material = assertAuthorizer(authorizer);
  const authorization = AUTHORIZATIONS.get(artifact);
  const authorizationDigestHex = fixedHex32(
    expectation.authorizationDigestHex,
    'expected isolated genesis authorization digest',
  );
  if (
    authorization === undefined
    || authorization.authorizer !== authorizer
    || authorization.revalidated !== expectation.revalidated
    || authorization.preTransportEvidence
      !== expectation.preTransportEvidence
    || authorization.authorizationDigestHex !== authorizationDigestHex
  ) {
    throw new Error(
      'isolated genesis broadcast authorization lacks exact process provenance',
    );
  }
  const exact = artifact as Partial<
    SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1
  >;
  if (
    exact.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA
    || exact.version !== 1
    || exact.authorizationScope !== AUTHORIZATION_SCOPE
    || exact.role !== authorization.role
    || exact.ordinal !== authorization.ordinal
    || exact.expectedTxId !== authorization.expectedTxId
    || exact.authorizationDigestHex !== authorization.authorizationDigestHex
    || Object.keys(exact).sort().join(',')
      !== 'authorizationDigestHex,authorizationScope,expectedTxId,ordinal,role,schema,version'
  ) {
    throw new Error('isolated genesis broadcast authorization shape is invalid');
  }
  validateAuthorizationInput(
    material,
    expectation.revalidated,
    expectation.preTransportEvidence,
  );
}

function assertAuthorizer(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  expectedTarget?:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): AuthorizerMaterialV1 {
  const material = AUTHORIZERS.get(authorizer);
  if (
    material === undefined
    || authorizer.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA
    || (expectedTarget !== undefined && material.target !== expectedTarget)
  ) {
    throw new Error('isolated genesis broadcast authorizer lacks provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
      material.target,
    );
  const batchBinding =
    assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
      material.batch,
      material.target,
    );
  if (
    current.processBindingDigestHex
      !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
    || batchBinding.processBindingDigestHex
      !== material.binding.processBindingDigestHex
    || batchBinding.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated genesis broadcast authorizer process changed');
  }
  return material;
}

function validateAuthorizationInput(
  material: AuthorizerMaterialV1,
  revalidated: SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate,
  preTransportEvidence: SubstrateFederatedLocalDevnetGenesisRevalidation,
): ValidatedAuthorizationInputV1 {
  const checked = revalidated?.checked;
  const admission = checked?.signed?.admission;
  const role = admission?.role;
  const transaction = role === undefined
    ? undefined
    : material.transactions.get(role);
  const ordinal = ROLE_ORDER.indexOf(role as typeof ROLE_ORDER[number]);
  if (transaction === undefined || ordinal < 0 || ordinal > 2) {
    throw new Error('isolated genesis authorization role is not admitted');
  }
  const issuance = transaction.issuance;
  const handle = transaction.checkedAcceptance.submissionHandle;
  const expectedAdmissionDigestHex =
    deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1({
      role: admission.role,
      planDigestHex: admission.planDigestHex,
      targetGenesisHeaderIdHex: admission.targetGenesisHeaderIdHex,
      expectedTxId: admission.expectedTxId,
      sourceBoxId: admission.sourceBoxId,
      inputBoxIds: admission.inputBoxIds,
      attemptedAtHeight: admission.attemptedAtHeight,
      nodeOrigin: admission.nodeOrigin,
    });
  if (
    admission.schema
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA
    || admission.admissionDigestHex !== expectedAdmissionDigestHex
    || admission.planDigestHex !== material.batch.request.requestDigestHex
    || admission.targetGenesisHeaderIdHex
      !== material.batch.request.target.genesisHeaderIdHex
    || admission.expectedTxId !== issuance.unsignedTransactionIdHex
    || admission.sourceBoxId !== issuance.genesisInputBoxIdHex
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== issuance.genesisInputBoxIdHex
    || admission.nodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || admission.unsignedTransaction !== issuance.unsignedTransactionBody
    || checked.signed.signerArtifact !== transaction.signedCandidate
    || checked.signed.signedTransactionDigestHex
      !== transaction.signedCandidate.signedTransactionDigestHex
    || checked.checkerArtifact !== handle
    || checked.checkResponseDigestHex !== handle.checkResponseDigestHex
    || handle.txId !== admission.expectedTxId
  ) {
    throw new Error('isolated genesis authorization candidate binding changed');
  }
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
    handle,
    material.binding,
  );
  assertRevalidationEvidence(
    material.revalidator,
    checked,
    role,
    'post-check',
    revalidated.postCheckEvidence,
  );
  assertRevalidationEvidence(
    material.revalidator,
    checked,
    role,
    'pre-transport',
    preTransportEvidence,
  );
  if (
    preTransportEvidence.observedAtHeight
      < revalidated.postCheckEvidence.observedAtHeight
    || preTransportEvidence.sourceBoxId
      !== revalidated.postCheckEvidence.sourceBoxId
    || preTransportEvidence.targetGenesisHeaderIdHex
      !== revalidated.postCheckEvidence.targetGenesisHeaderIdHex
    || preTransportEvidence.sourceBoxDigestHex
      !== revalidated.postCheckEvidence.sourceBoxDigestHex
    || preTransportEvidence.sourceBoxSigmaSerializedSha256Hex
      !== revalidated.postCheckEvidence.sourceBoxSigmaSerializedSha256Hex
  ) {
    throw new Error('isolated genesis revalidation continuity changed');
  }
  return {
    checked,
    transaction,
    handle,
    role,
    ordinal: ordinal as 0 | 1 | 2,
  };
}

function assertRevalidationEvidence(
  revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
  checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  phase: 'post-check' | 'pre-transport',
  evidence: SubstrateFederatedLocalDevnetGenesisRevalidation,
): void {
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
    revalidator,
    evidence.revalidationArtifact,
    {
      checkedCandidate: checked,
      role,
      phase,
      sourceBoxId: evidence.sourceBoxId,
      targetGenesisHeaderIdHex: evidence.targetGenesisHeaderIdHex,
      expectedTxId: checked.signed.admission.expectedTxId,
      observedAtHeight: evidence.observedAtHeight,
      observedTipHeaderIdHex: evidence.observedTipHeaderIdHex,
      sourceBoxDigestHex: evidence.sourceBoxDigestHex,
      sourceBoxSigmaSerializedSha256Hex:
        evidence.sourceBoxSigmaSerializedSha256Hex,
      observationDigestHex: evidence.observationDigestHex,
    },
  );
}

function evidenceDigestInput(
  evidence: SubstrateFederatedLocalDevnetGenesisRevalidation,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    observedAtHeight: evidence.observedAtHeight,
    observedTipHeaderIdHex: evidence.observedTipHeaderIdHex,
    sourceBoxDigestHex: evidence.sourceBoxDigestHex,
    sourceBoxSigmaSerializedSha256Hex:
      evidence.sourceBoxSigmaSerializedSha256Hex,
    observationDigestHex: evidence.observationDigestHex,
  });
}

function coreRole(
  value: unknown,
): SubstrateFederatedLocalDevnetGenesisRole {
  if (value === 'tracker') return 'tracker';
  if (value === 'duplicate-prevention') return 'duplicatePrevention';
  if (value === 'pooled-reserve') return 'pooledReserve';
  throw new Error('isolated genesis authorizer setup role is invalid');
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return value;
}
