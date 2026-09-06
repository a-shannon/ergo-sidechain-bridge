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
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV2,
  type SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1,
  type SubstrateFederatedIsolatedDevnetGenesisRevalidatorV2,
} from './substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  type SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2,
  type SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  type SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v2' as const;

const WITNESS_ORIGIN = 'http://127.0.0.1:9052' as const;
const AUTHORIZATION_SCOPE =
  'fed-6-lab-local-synthetic-genesis-setup-only' as const;
const AUTHORIZATION_PROFILES = Object.freeze({
  1: Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V1_SCHEMA,
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZATION_V1',
  }),
  2: Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA,
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZATION_V2',
  }),
});
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

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2
extends Omit<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1, 'schema'> {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA;
}

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2
extends Omit<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1, 'schema' | 'version'> {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA;
  readonly version: 2;
}

type AuthorizerVersion = keyof typeof AUTHORIZATION_PROFILES;
type Authorizer = Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1
  | SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>;
type SetupBatch = Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2
  | SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
type Revalidator = Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1
  | SubstrateFederatedIsolatedDevnetGenesisRevalidatorV2>;

export interface SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1 {
  readonly revalidated:
    SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate;
  readonly preTransportEvidence:
    SubstrateFederatedLocalDevnetGenesisRevalidation;
  readonly authorizationDigestHex: string;
}

interface AuthorizerMaterialV1 {
  readonly version: AuthorizerVersion;
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly batch: SetupBatch;
  readonly revalidator: Revalidator;
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
  readonly authorizer: Authorizer;
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
  return createAuthorizer(target, batch, revalidator, confirmationObserver, 1) as
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>;
}

export function createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>,
  revalidator: Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV2>,
  confirmationObserver: Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2> {
  return createAuthorizer(target, batch, revalidator, confirmationObserver, 2) as
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>;
}

// Public factories select the reviewed provenance profile, never a caller callback.
function assertSetupBatch(batch: SetupBatch,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  version: AuthorizerVersion,
) {
  return version === 1
    ? assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
      batch as Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>, target)
    : assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(
      batch as Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>, target);
}

function createAuthorizer(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch: SetupBatch,
  revalidator: Revalidator,
  confirmationObserver: Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  version: AuthorizerVersion,
): Authorizer {
  const binding = assertSetupBatch(batch, target, version);
  const profile = AUTHORIZATION_PROFILES[version];
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

  let authorizer!: Authorizer;
  authorizer = Object.freeze({
    schema: profile.schema,
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
        schema: profile.schema,
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
      }, profile.domain);
      const ordinal = validated.ordinal;
      const authorizationArtifact = Object.freeze({
        schema: profile.schema,
        version,
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
    version,
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
  assertSetupConfirmed(authorizer, target, 1);
}

export function assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2(
  authorizer: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertSetupConfirmed(authorizer, target, 2);
}

function assertSetupConfirmed(authorizer: Authorizer,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  version: AuthorizerVersion,
): void {
  const material = assertAuthorizerVersion(authorizer, version, target);
  if (material.nextOrdinal !== ROLE_ORDER.length || material.pending !== null) {
    throw new Error('isolated genesis setup is not canonically confirmed');
  }
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertAuthorizerVersion(authorizer, 1, target);
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2(
  authorizer: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): void {
  assertAuthorizerVersion(authorizer, 2, target);
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
  artifact: object,
  expectation:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1>,
): void {
  assertAuthorizationArtifact(authorizer, artifact, expectation, 1);
}

export function assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2(
  authorizer: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>,
  artifact: object,
  expectation: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1>,
): void {
  assertAuthorizationArtifact(authorizer, artifact, expectation, 2);
}

function assertAuthorizationArtifact(authorizer: Authorizer, artifact: object,
  expectation: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationExpectationV1>,
  version: AuthorizerVersion,
): void {
  const material = assertAuthorizerVersion(authorizer, version);
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
    | SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2
  >;
  if (
    exact.schema !== AUTHORIZATION_PROFILES[version].schema
    || exact.version !== version
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

function assertAuthorizerVersion(authorizer: Authorizer, version: AuthorizerVersion,
  target?: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): AuthorizerMaterialV1 {
  const material = assertAuthorizer(authorizer, target);
  if (material.version !== version) {
    throw new Error('isolated genesis broadcast authorizer version differs');
  }
  return material;
}

function assertAuthorizer(
  authorizer: Authorizer,
  expectedTarget?:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): AuthorizerMaterialV1 {
  const material = AUTHORIZERS.get(authorizer);
  if (
    material === undefined
    || authorizer.schema !== AUTHORIZATION_PROFILES[material.version].schema
    || (expectedTarget !== undefined && material.target !== expectedTarget)
  ) {
    throw new Error('isolated genesis broadcast authorizer lacks provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
      material.target,
    );
  const batchBinding =
    assertSetupBatch(
      material.batch,
      material.target,
      material.version,
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
    material,
    checked,
    role,
    'post-check',
    revalidated.postCheckEvidence,
  );
  assertRevalidationEvidence(
    material,
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
  material: AuthorizerMaterialV1,
  checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  role: SubstrateFederatedLocalDevnetGenesisRole,
  phase: 'post-check' | 'pre-transport',
  evidence: SubstrateFederatedLocalDevnetGenesisRevalidation,
): void {
  const expectation = {
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
  };
  if (material.version === 1) {
    assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
      material.revalidator as Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
      evidence.revalidationArtifact, expectation);
  } else {
    assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV2(
      material.revalidator as Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV2>,
      evidence.revalidationArtifact, expectation);
  }
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
