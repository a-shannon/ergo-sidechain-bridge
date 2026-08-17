import {
  createBoundedAuthenticatedSpvTrackerReadOnlySource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
} from './fleet-signer.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1,
  type SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisRevalidationPhase,
  type SubstrateFederatedLocalDevnetGenesisRole,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  type SubstrateFederatedGenesisBoxObservationV1,
  type SubstrateFederatedGenesisNodeSource,
  type SubstrateFederatedGenesisRole,
  validateSubstrateFederatedGenesisBoxPairV1,
} from './substrate-federated-genesis-observation-v1.js';
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

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-revalidator.v1' as const;

const REVALIDATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATION_V1';
const BOX_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATED_BOX_V1';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;

type RevalidatorPort =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['revalidator'];

export interface SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1
extends RevalidatorPort {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA;
}

export interface SubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactExpectationV1 {
  readonly checkedCandidate:
    SubstrateFederatedLocalDevnetGenesisCheckedCandidate;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly phase: SubstrateFederatedLocalDevnetGenesisRevalidationPhase;
  readonly sourceBoxId: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly observedAtHeight: number;
  readonly observedTipHeaderIdHex: string;
  readonly sourceBoxDigestHex: string;
  readonly sourceBoxSigmaSerializedSha256Hex: string;
  readonly observationDigestHex: string;
}

interface RevalidatorMaterialV1 {
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>;
  readonly primarySource: SubstrateFederatedGenesisNodeSource;
  readonly witnessSource: SubstrateFederatedGenesisNodeSource;
  readonly transactions: ReadonlyMap<
    SubstrateFederatedLocalDevnetGenesisRole,
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>
  >;
}

interface ArtifactMaterialV1 {
  readonly revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>;
  readonly checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly phase: SubstrateFederatedLocalDevnetGenesisRevalidationPhase;
  readonly sourceBoxId: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly observedAtHeight: number;
  readonly observedTipHeaderIdHex: string;
  readonly sourceBoxDigestHex: string;
  readonly sourceBoxSigmaSerializedSha256Hex: string;
  readonly observationDigestHex: string;
}

interface NodeSnapshotV1 {
  readonly network: 'devnet';
  readonly genesisHeaderIdHex: string;
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
}

interface NodeObservationV1 {
  readonly snapshot: Readonly<NodeSnapshotV1>;
  readonly box: Readonly<SubstrateFederatedGenesisBoxObservationV1>;
}

const REVALIDATORS = new WeakMap<object, RevalidatorMaterialV1>();
const ARTIFACTS = new WeakMap<object, ArtifactMaterialV1>();
const REVALIDATION_PHASES = new WeakMap<object, Set<
  SubstrateFederatedLocalDevnetGenesisRevalidationPhase
>>();

export function createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
  target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  batch:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(batch, target);
  if (
    target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || batch.request.target.primary.nodeOrigin !== target.primaryNodeOrigin
    || batch.request.target.witness.nodeOrigin !== target.witnessNodeOrigin
    || batch.request.target.genesisHeaderIdHex.length !== 64
  ) {
    throw new Error('isolated genesis revalidator target binding is invalid');
  }
  const transactions = new Map<
    SubstrateFederatedLocalDevnetGenesisRole,
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>
  >();
  for (const transaction of batch.orderedTransactions) {
    const role = coreRole(transaction.issuance.role);
    if (transactions.has(role)) {
      throw new Error('isolated genesis revalidator role is duplicated');
    }
    transactions.set(role, transaction);
  }
  if (transactions.size !== 3) {
    throw new Error('isolated genesis revalidator requires all setup roles');
  }
  const primarySource = createBoundedAuthenticatedSpvTrackerReadOnlySource(
    target.primaryNodeOrigin,
  ) as SubstrateFederatedGenesisNodeSource;
  const witnessSource = createBoundedAuthenticatedSpvTrackerReadOnlySource(
    target.witnessNodeOrigin,
  ) as SubstrateFederatedGenesisNodeSource;
  if (primarySource === witnessSource) {
    throw new Error('isolated genesis revalidator requires distinct node sources');
  }

  let revalidator!:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>;
  revalidator = Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA,
    revalidate: async (
      checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
      phase: SubstrateFederatedLocalDevnetGenesisRevalidationPhase,
    ) => {
      const material = assertRevalidator(revalidator);
      const exactPhase = revalidationPhase(phase);
      const transaction = assertCheckedCandidate(
        checked,
        batch,
        material.binding,
        material.transactions,
      );
      const handle = transaction.checkedAcceptance.submissionHandle;
      const issued = REVALIDATION_PHASES.get(handle) ?? new Set();
      if (issued.has(exactPhase)) {
        throw new Error(
          `isolated genesis ${exactPhase} revalidation is already issued or in progress`,
        );
      }
      issued.add(exactPhase);
      REVALIDATION_PHASES.set(handle, issued);
      const sourceBoxId = fixedHex32(
        checked.signed.admission.sourceBoxId,
        'isolated genesis source box ID',
      );
      const targetGenesisHeaderIdHex = fixedHex32(
        checked.signed.admission.targetGenesisHeaderIdHex,
        'isolated genesis target header ID',
      );
      const observation = await observeMatchingSourcesWithRetry(
        revalidator,
        material,
        transaction,
        targetGenesisHeaderIdHex,
      );
      if (
        checked.signed.admission.attemptedAtHeight
          > observation.snapshot.tipHeight
      ) {
        throw new Error(
          'isolated genesis attempted height exceeds the revalidated tip',
        );
      }
      const current = assertRevalidator(revalidator).binding;
      if (
        current.processBindingDigestHex !== binding.processBindingDigestHex
        || current.executionTargetIdentityDigestHex
          !== binding.executionTargetIdentityDigestHex
      ) {
        throw new Error('isolated genesis revalidator process binding changed');
      }
      const expectedTxId = fixedHex32(
        checked.signed.admission.expectedTxId,
        'isolated genesis expected transaction ID',
      );
      const sourceBoxDigestHex = sha256CanonicalJson(
        observation.box.box,
        BOX_DIGEST_DOMAIN,
      );
      const sourceBoxSigmaSerializedSha256Hex =
        observation.box.sigmaSerializedSha256Hex;
      const observationDigestHex = sha256CanonicalJson({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA,
        processBindingDigestHex: current.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          current.executionTargetIdentityDigestHex,
        requestDigestHex: batch.request.requestDigestHex,
        role: checked.signed.admission.role,
        phase: exactPhase,
        expectedTxId,
        admissionDigestHex: checked.signed.admission.admissionDigestHex,
        checkResponseDigestHex: checked.checkResponseDigestHex,
        sourceBoxId,
        targetGenesisHeaderIdHex,
        observedAtHeight: observation.snapshot.tipHeight,
        tipHeaderIdHex: observation.snapshot.tipHeaderIdHex,
        sourceBoxDigestHex,
        sigmaSerializedSha256Hex:
          sourceBoxSigmaSerializedSha256Hex,
        primarySourceIdHex: batch.request.target.primary.sourceIdHex,
        witnessSourceIdHex: batch.request.target.witness.sourceIdHex,
      }, REVALIDATION_DIGEST_DOMAIN);
      const revalidationArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA,
        role: checked.signed.admission.role,
        phase: exactPhase,
        observationDigestHex,
      });
      ARTIFACTS.set(revalidationArtifact, Object.freeze({
        revalidator,
        checked,
        role: checked.signed.admission.role,
        phase: exactPhase,
        sourceBoxId,
        targetGenesisHeaderIdHex,
        expectedTxId,
        observedAtHeight: observation.snapshot.tipHeight,
        observedTipHeaderIdHex: observation.snapshot.tipHeaderIdHex,
        sourceBoxDigestHex,
        sourceBoxSigmaSerializedSha256Hex,
        observationDigestHex,
      }));
      return Object.freeze({
        sourceBoxId,
        sourceBoxUnspent: true as const,
        targetGenesisHeaderIdHex,
        observedAtHeight: observation.snapshot.tipHeight,
        observedTipHeaderIdHex: observation.snapshot.tipHeaderIdHex,
        sourceBoxDigestHex,
        sourceBoxSigmaSerializedSha256Hex,
        observationDigestHex,
        revalidationArtifact,
      });
    },
  });
  REVALIDATORS.set(revalidator, Object.freeze({
    target,
    binding,
    batch,
    primarySource,
    witnessSource,
    transactions,
  }));
  return revalidator;
}

export function assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
  revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
  artifact: object,
  expectation:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactExpectationV1>,
): void {
  assertRevalidator(revalidator);
  const material = ARTIFACTS.get(artifact);
  if (
    material === undefined
    || material.revalidator !== revalidator
    || material.checked !== expectation.checkedCandidate
    || material.role !== expectation.role
    || material.phase !== expectation.phase
    || material.sourceBoxId !== fixedHex32(
      expectation.sourceBoxId,
      'expected isolated genesis source box ID',
    )
    || material.targetGenesisHeaderIdHex !== fixedHex32(
      expectation.targetGenesisHeaderIdHex,
      'expected isolated genesis target header ID',
    )
    || material.expectedTxId !== fixedHex32(
      expectation.expectedTxId,
      'expected isolated genesis transaction ID',
    )
    || material.observedAtHeight !== nonNegativeInteger(
      expectation.observedAtHeight,
      'expected isolated genesis observation height',
    )
    || material.observedTipHeaderIdHex !== fixedHex32(
      expectation.observedTipHeaderIdHex,
      'expected isolated genesis tip header ID',
    )
    || material.sourceBoxDigestHex !== fixedHex32(
      expectation.sourceBoxDigestHex,
      'expected isolated genesis source-box digest',
    )
    || material.sourceBoxSigmaSerializedSha256Hex !== fixedHex32(
      expectation.sourceBoxSigmaSerializedSha256Hex,
      'expected isolated genesis source-box Sigma digest',
    )
    || material.observationDigestHex !== fixedHex32(
      expectation.observationDigestHex,
      'expected isolated genesis observation digest',
    )
  ) {
    throw new Error(
      'isolated genesis revalidation artifact lacks exact process provenance',
    );
  }
  const revalidatorMaterial = assertRevalidator(revalidator);
  assertCheckedCandidate(
    material.checked,
    revalidatorMaterial.batch,
    revalidatorMaterial.binding,
    revalidatorMaterial.transactions,
  );
}

function assertRevalidator(
  revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
): RevalidatorMaterialV1 {
  const material = REVALIDATORS.get(revalidator);
  if (
    material === undefined
    || revalidator.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_REVALIDATOR_V1_SCHEMA
  ) {
    throw new Error('isolated genesis revalidator lacks process provenance');
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
      material.target,
    );
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2(
    material.batch,
    material.target,
  );
  if (
    current.processBindingDigestHex
      !== material.binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex
      !== material.binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated genesis revalidator process binding changed');
  }
  return material;
}

function assertCheckedCandidate(
  checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
  batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2>,
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  transactions: ReadonlyMap<
    SubstrateFederatedLocalDevnetGenesisRole,
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2> {
  const admission = checked?.signed?.admission;
  const transaction = admission === undefined
    ? undefined
    : transactions.get(admission.role);
  if (transaction === undefined) {
    throw new Error('isolated genesis checked candidate role is not admitted');
  }
  const issuance = transaction.issuance;
  const handle = transaction.checkedAcceptance.submissionHandle;
  const expectedRole = coreRole(issuance.role);
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
    admission.schema !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA
    || admission.admissionDigestHex !== expectedAdmissionDigestHex
    || admission.role !== expectedRole
    || admission.planDigestHex !== batch.request.requestDigestHex
    || admission.targetGenesisHeaderIdHex
      !== batch.request.target.genesisHeaderIdHex
    || admission.expectedTxId !== issuance.unsignedTransactionIdHex
    || admission.sourceBoxId !== issuance.genesisInputBoxIdHex
    || admission.inputBoxIds.length !== 1
    || admission.inputBoxIds[0] !== issuance.genesisInputBoxIdHex
    || admission.nodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || admission.unsignedTransaction !== issuance.unsignedTransactionBody
    || checked.signed.signedTransactionDigestHex
      !== transaction.signedCandidate.signedTransactionDigestHex
    || checked.signed.signerArtifact !== transaction.signedCandidate
    || checked.checkResponseDigestHex !== handle.checkResponseDigestHex
    || checked.checkerArtifact !== handle
    || handle.txId !== issuance.unsignedTransactionIdHex
  ) {
    throw new Error('isolated genesis checked candidate binding changed');
  }
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(handle, binding);
  return transaction;
}

async function observeMatchingSourcesWithRetry(
  revalidator:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisRevalidatorV1>,
  material: RevalidatorMaterialV1,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  targetGenesisHeaderIdHex: string,
): Promise<NodeObservationV1> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OBSERVATION_ATTEMPTS; attempt += 1) {
    assertRevalidator(revalidator);
    try {
      const [primary, witness] = await Promise.all([
        observeSource(
          material.primarySource,
          transaction,
          targetGenesisHeaderIdHex,
          'primary',
        ),
        observeSource(
          material.witnessSource,
          transaction,
          targetGenesisHeaderIdHex,
          'witness',
        ),
      ]);
      if (
        canonicalJson(primary.snapshot) !== canonicalJson(witness.snapshot)
        || canonicalJson(primary.box) !== canonicalJson(witness.box)
      ) {
        throw new Error('isolated genesis primary and witness observations disagree');
      }
      assertRevalidator(revalidator);
      return primary;
    } catch (error) {
      lastError = error;
      assertRevalidator(revalidator);
      if (attempt < OBSERVATION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, OBSERVATION_RETRY_MS));
      }
    }
  }
  throw new Error(
    `isolated genesis dual-node revalidation did not stabilize: ${String(lastError)}`,
  );
}

async function observeSource(
  source: SubstrateFederatedGenesisNodeSource,
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
  targetGenesisHeaderIdHex: string,
  sourceRole: 'primary' | 'witness',
): Promise<NodeObservationV1> {
  assertCompleteSource(source);
  const before = await observeSnapshot(
    source,
    targetGenesisHeaderIdHex,
    sourceRole,
  );
  const sourceBoxId = transaction.issuance.genesisInputBoxIdHex;
  const [rawBox, rawBinary] = await Promise.all([
    source.getBoxByIdOrNull(sourceBoxId),
    source.getBoxBinaryByIdOrNull!(sourceBoxId),
  ]);
  if (rawBox === null || rawBinary === null) {
    throw new Error(
      `isolated genesis ${sourceRole} source box is no longer unspent`,
    );
  }
  const after = await observeSnapshot(
    source,
    targetGenesisHeaderIdHex,
    sourceRole,
  );
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error(
      `isolated genesis ${sourceRole} target changed during revalidation`,
    );
  }
  const binary = plainRecord(
    rawBinary,
    `isolated genesis ${sourceRole} binary box response`,
  );
  const observed = await validateSubstrateFederatedGenesisBoxPairV1(
    rawBox,
    ownDataValue(
      binary,
      'bytes',
      `isolated genesis ${sourceRole} binary box response`,
    ),
    sourceBoxId,
    transaction.issuance.role as SubstrateFederatedGenesisRole,
    before.tipHeight,
  );
  if (
    canonicalJson(observed.box)
      !== canonicalJson(expectedInputBox(transaction))
  ) {
    throw new Error(
      `isolated genesis ${sourceRole} source box differs from the signed input`,
    );
  }
  return Object.freeze({ snapshot: before, box: observed });
}

async function observeSnapshot(
  source: SubstrateFederatedGenesisNodeSource,
  targetGenesisHeaderIdHex: string,
  sourceRole: 'primary' | 'witness',
): Promise<Readonly<NodeSnapshotV1>> {
  const [rawInfo, rawBestHeader, rawGenesisIds] = await Promise.all([
    source.getInfo(),
    source.getBestHeader(),
    source.getBlockHeaderIdsAtHeight(1),
  ]);
  const info = plainRecord(rawInfo, `isolated genesis ${sourceRole} node info`);
  const bestHeader = plainRecord(
    rawBestHeader,
    `isolated genesis ${sourceRole} best header`,
  );
  const network = String(info.network ?? info.networkType).trim().toLowerCase();
  if (network !== 'devnet') {
    throw new Error(`isolated genesis ${sourceRole} requires devnet identity`);
  }
  const tipHeight = nonNegativeInteger(
    ownDataValue(
      bestHeader,
      'height',
      `isolated genesis ${sourceRole} best header`,
    ),
    `isolated genesis ${sourceRole} tip height`,
  );
  if (
    nonNegativeInteger(
      info.fullHeight,
      `isolated genesis ${sourceRole} full height`,
    ) !== tipHeight
  ) {
    throw new Error(
      `isolated genesis ${sourceRole} info and best-header heights disagree`,
    );
  }
  if (!Array.isArray(rawGenesisIds) || rawGenesisIds.length !== 1) {
    throw new Error(
      `isolated genesis ${sourceRole} must expose one genesis header`,
    );
  }
  const genesisHeaderIdHex = fixedHex32(
    rawGenesisIds[0],
    `isolated genesis ${sourceRole} chain anchor`,
  );
  if (genesisHeaderIdHex !== targetGenesisHeaderIdHex) {
    throw new Error(`isolated genesis ${sourceRole} target identity changed`);
  }
  return Object.freeze({
    network: 'devnet' as const,
    genesisHeaderIdHex,
    tipHeight,
    tipHeaderIdHex: fixedHex32(
      ownDataValue(
        bestHeader,
        'id',
        `isolated genesis ${sourceRole} best header`,
      ),
      `isolated genesis ${sourceRole} tip header ID`,
    ),
  });
}

function expectedInputBox(
  transaction:
    Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2>,
): Readonly<Record<string, unknown>> {
  const body = plainRecord(
    transaction.issuance.unsignedTransactionBody,
    'isolated genesis unsigned transaction',
  );
  const inputs = ownDataValue(
    body,
    'inputs',
    'isolated genesis unsigned transaction',
  );
  if (!Array.isArray(inputs) || inputs.length !== 1) {
    throw new Error('isolated genesis unsigned transaction input count changed');
  }
  const input = plainRecord(inputs[0], 'isolated genesis unsigned input');
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'additionalRegisters',
    'assets',
    'boxId',
    'creationHeight',
    'ergoTree',
    'extension',
    'index',
    'transactionId',
    'value',
  ];
  if (keys.join('\0') !== expectedKeys.join('\0')) {
    throw new Error('isolated genesis unsigned input fields changed');
  }
  const extension = plainRecord(
    ownDataValue(input, 'extension', 'isolated genesis unsigned input'),
    'isolated genesis unsigned input extension',
  );
  if (Object.keys(extension).length !== 0) {
    throw new Error('isolated genesis setup input extension must be empty');
  }
  return Object.freeze({
    boxId: ownDataValue(input, 'boxId', 'isolated genesis unsigned input'),
    value: ownDataValue(input, 'value', 'isolated genesis unsigned input'),
    ergoTree: ownDataValue(input, 'ergoTree', 'isolated genesis unsigned input'),
    assets: ownDataValue(input, 'assets', 'isolated genesis unsigned input'),
    additionalRegisters: ownDataValue(
      input,
      'additionalRegisters',
      'isolated genesis unsigned input',
    ),
    creationHeight: ownDataValue(
      input,
      'creationHeight',
      'isolated genesis unsigned input',
    ),
    transactionId: ownDataValue(
      input,
      'transactionId',
      'isolated genesis unsigned input',
    ),
    index: ownDataValue(input, 'index', 'isolated genesis unsigned input'),
  });
}

function assertCompleteSource(source: SubstrateFederatedGenesisNodeSource): void {
  if (
    source === null
    || typeof source !== 'object'
    || typeof source.getInfo !== 'function'
    || typeof source.getBestHeader !== 'function'
    || typeof source.getBlockHeaderIdsAtHeight !== 'function'
    || typeof source.getBoxByIdOrNull !== 'function'
    || typeof source.getBoxBinaryByIdOrNull !== 'function'
  ) {
    throw new Error('isolated genesis revalidator source is incomplete');
  }
}

function coreRole(
  role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
): SubstrateFederatedLocalDevnetGenesisRole {
  return role === 'duplicate-prevention' ? 'duplicatePrevention' : role === 'pooled-reserve'
    ? 'pooledReserve'
    : 'tracker';
}

function revalidationPhase(
  value: unknown,
): SubstrateFederatedLocalDevnetGenesisRevalidationPhase {
  if (value !== 'post-check' && value !== 'pre-transport') {
    throw new Error('isolated genesis revalidation phase is invalid');
  }
  return value;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function ownDataValue(
  record: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
    throw new Error(`${label}.${key} must be an own data property`);
  }
  return descriptor.value;
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  const normalized = value.replace(/^0x/iu, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}
