import {
  MINER_FEE,
} from './ergo-encoding.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance,
  type SubstrateFederatedIsolatedDevnetGenerationV1,
  type SubstrateFederatedIsolatedDevnetGenesisPayloadV1,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-provisioning.v1' as const;

const PLAN_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_V1';
const INPUT_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_INPUT_SET_V1';
const IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_IDENTITY_V1';
const IDENTITY_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_IDENTITY_SET_V1';
const TRANSACTION_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_UNSIGNED_BODY_V1';
const MATERIALIZED_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MATERIALIZED_TX_V1';
const provisionings = new WeakSet<object>();

export type ProvisioningRole =
  'tracker' | 'duplicate-prevention' | 'pooled-reserve';

export interface SubstrateFederatedIsolatedDevnetGenesisInputsV1 {
  readonly tracker: unknown;
  readonly duplicatePrevention: unknown;
  readonly pooledReserve: unknown;
}

export interface SubstrateFederatedIsolatedDevnetProvisioningIdentityV1 {
  readonly role: ProvisioningRole;
  readonly identityDigestHex: string;
  readonly genesisInputBoxIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly stateOutputBoxIdHex: string;
  readonly stateOutputIndex: 0;
  readonly creationHeight: number;
  readonly unsignedTransactionBodyDigestHex: string;
  readonly materializedTransactionDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetProvisioningEntryV1 {
  readonly identity:
    Readonly<SubstrateFederatedIsolatedDevnetProvisioningIdentityV1>;
  readonly transaction: Readonly<MaterializedUnsignedTransaction>;
}

export interface SubstrateFederatedIsolatedDevnetProvisioningV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'authenticated_non_authorizing_unsigned_provisioning';
  readonly planDigestHex: string;
  readonly generation: Readonly<{
    readonly manifestDigestHex: string;
    readonly baselineDigestHex: string;
    readonly targetDescriptorDigestHex: string;
    readonly generationIdHex: string;
    readonly settlementNetworkId: 'ergo-testnet';
    readonly sourceNetworkScope: 'isolated-devnet';
    readonly trustModel: 'federated_non_trustless';
    readonly setupAnchorHeaderIdHex: string;
    readonly setupAnchorHeight: number;
  }>;
  readonly genesisInputs: Readonly<{
    readonly inputSetDigestHex: string;
    readonly tracker: Readonly<Eip12Box>;
    readonly duplicatePrevention: Readonly<Eip12Box>;
    readonly pooledReserve: Readonly<Eip12Box>;
  }>;
  readonly provisioning: Readonly<{
    readonly identitySetDigestHex: string;
    readonly tracker:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningEntryV1>;
    readonly duplicatePrevention:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningEntryV1>;
    readonly pooledReserve:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningEntryV1>;
  }>;
  readonly checks: Readonly<{
    readonly sameProcessGenerationVerified: true;
    readonly exactHistoricalGenesisBoxesReparsed: true;
    readonly exactTargetGenesisInputIdsMatched: true;
    readonly pairwiseDistinctPureErgInputsVerified: true;
    readonly setupAnchorCreationHeightBound: true;
    readonly exactGenesisPayloadsMaterialized: true;
    readonly exactUnsignedProvisioningIdentitiesBound: true;
    readonly copiedGenerationAccepted: false;
    readonly callerSuppliedOutputIdentitiesAccepted: false;
    readonly currentUtxoViewAcceptedAsHistory: false;
  }>;
  readonly execution: Readonly<{
    readonly networkAccessPerformed: false;
    readonly runtimeDatabaseOpened: false;
    readonly deploymentStateOpened: false;
    readonly signerOrWalletMaterialRead: false;
    readonly nodeCheckPerformed: false;
    readonly signedTransactionConstructed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
  }>;
  readonly boundaries: Readonly<{
    readonly isolatedDevnetGenerationAuthenticated: true;
    readonly historicalInputBodiesBoundByCanonicalBoxIds: true;
    readonly currentGenesisInputsObservedUnspent: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly trackerLineageEstablished: false;
    readonly duplicatePreventionLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface BuildSubstrateFederatedIsolatedDevnetProvisioningV1Input {
  readonly generation:
    Readonly<SubstrateFederatedIsolatedDevnetGenerationV1>;
  readonly genesisInputs:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisInputsV1>;
}

export interface MaterializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1Input {
  readonly genesisInputs:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisInputsV1>;
  readonly lineages:
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['lineages'];
  readonly genesisPayloads:
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['genesisPayloads'];
  readonly creationHeight: number;
  readonly inputMode: 'historical' | 'fresh-current';
}

export interface SubstrateFederatedIsolatedDevnetProvisioningCoreV1 {
  readonly genesisInputs:
    SubstrateFederatedIsolatedDevnetProvisioningV1['genesisInputs'];
  readonly provisioning:
    SubstrateFederatedIsolatedDevnetProvisioningV1['provisioning'];
}

export async function buildSubstrateFederatedIsolatedDevnetProvisioningV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetProvisioningV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetProvisioningV1>> {
  const capturedInput = exactRecord(
    input,
    ['generation', 'genesisInputs'],
    'isolated-devnet provisioning input',
  );
  const generation = capturedInput.generation as Readonly<
    SubstrateFederatedIsolatedDevnetGenerationV1
  >;
  const historicalGenesisInputs = capturedInput.genesisInputs as Readonly<
    SubstrateFederatedIsolatedDevnetGenesisInputsV1
  >;
  assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance(
    generation,
  );
  const creationHeight = generation.launchBaseline.ergoSetupAnchor.height;
  const core =
    await materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1({
      genesisInputs: historicalGenesisInputs,
      lineages: generation.target.lineages,
      genesisPayloads: generation.target.genesisPayloads,
      creationHeight,
      inputMode: 'historical',
    });
  const binding = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_V1_SCHEMA,
    version: 1 as const,
    status: 'authenticated_non_authorizing_unsigned_provisioning' as const,
    generation: {
      manifestDigestHex: generation.manifestDigestHex,
      baselineDigestHex: generation.launchBaseline.baselineDigestHex,
      targetDescriptorDigestHex: generation.target.descriptorDigestHex,
      generationIdHex: generation.generation.generationIdHex,
      settlementNetworkId: generation.generation.settlementNetworkId,
      sourceNetworkScope: generation.generation.sourceNetworkScope,
      trustModel: generation.generation.trustModel,
      setupAnchorHeaderIdHex:
        generation.launchBaseline.ergoSetupAnchor.headerIdHex,
      setupAnchorHeight: creationHeight,
    },
    genesisInputs: core.genesisInputs,
    provisioning: core.provisioning,
    checks: {
      sameProcessGenerationVerified: true as const,
      exactHistoricalGenesisBoxesReparsed: true as const,
      exactTargetGenesisInputIdsMatched: true as const,
      pairwiseDistinctPureErgInputsVerified: true as const,
      setupAnchorCreationHeightBound: true as const,
      exactGenesisPayloadsMaterialized: true as const,
      exactUnsignedProvisioningIdentitiesBound: true as const,
      copiedGenerationAccepted: false as const,
      callerSuppliedOutputIdentitiesAccepted: false as const,
      currentUtxoViewAcceptedAsHistory: false as const,
    },
    execution: {
      networkAccessPerformed: false as const,
      runtimeDatabaseOpened: false as const,
      deploymentStateOpened: false as const,
      signerOrWalletMaterialRead: false as const,
      nodeCheckPerformed: false as const,
      signedTransactionConstructed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
    },
    boundaries: {
      isolatedDevnetGenerationAuthenticated: true as const,
      historicalInputBodiesBoundByCanonicalBoxIds: true as const,
      currentGenesisInputsObservedUnspent: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      trackerLineageEstablished: false as const,
      duplicatePreventionLineageEstablished: false as const,
      reserveLineageEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      confirmationEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const plan = deepFreeze({
    ...binding,
    planDigestHex: sha256CanonicalJson(binding, PLAN_DIGEST_DOMAIN),
  });
  provisionings.add(plan);
  return plan;
}

export function assertSubstrateFederatedIsolatedDevnetProvisioningV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetProvisioningV1> {
  if (value === null || typeof value !== 'object' || !provisionings.has(value)) {
    throw new Error('isolated-devnet provisioning lacks process provenance');
  }
}

export async function materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1(
  input: Readonly<
    MaterializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1Input
  >,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetProvisioningCoreV1>> {
  const captured = exactRecord(input, [
    'genesisInputs',
    'lineages',
    'genesisPayloads',
    'creationHeight',
    'inputMode',
  ], 'isolated-devnet provisioning-core input');
  const creationHeight = captured.creationHeight as number;
  if (!Number.isSafeInteger(creationHeight) || creationHeight <= 0) {
    throw new Error('isolated-devnet setup anchor height is invalid');
  }
  const lineages = captured.lineages as
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['lineages'];
  const payloads = captured.genesisPayloads as
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['genesisPayloads'];
  const genesisInputs = await normalizeGenesisInputs(
    captured.genesisInputs as Readonly<
      SubstrateFederatedIsolatedDevnetGenesisInputsV1
    >,
    lineages,
    creationHeight,
    exactInputMode(captured.inputMode),
  );
  const [tracker, duplicatePrevention, pooledReserve] = await Promise.all([
    materializeEntry(
      'tracker',
      genesisInputs.tracker,
      payloads.tracker,
      creationHeight,
    ),
    materializeEntry(
      'duplicate-prevention',
      genesisInputs.duplicatePrevention,
      payloads.duplicatePrevention,
      creationHeight,
    ),
    materializeEntry(
      'pooled-reserve',
      genesisInputs.pooledReserve,
      payloads.pooledReserve,
      creationHeight,
    ),
  ]);
  const identities = {
    tracker: tracker.identity,
    duplicatePrevention: duplicatePrevention.identity,
    pooledReserve: pooledReserve.identity,
  };
  return deepFreeze({
    genesisInputs: {
      inputSetDigestHex: sha256CanonicalJson(
        genesisInputs,
        INPUT_SET_DIGEST_DOMAIN,
      ),
      ...genesisInputs,
    },
    provisioning: {
      identitySetDigestHex: sha256CanonicalJson(
        identities,
        IDENTITY_SET_DIGEST_DOMAIN,
      ),
      tracker,
      duplicatePrevention,
      pooledReserve,
    },
  });
}

async function normalizeGenesisInputs(
  value: Readonly<SubstrateFederatedIsolatedDevnetGenesisInputsV1>,
  expected:
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['lineages'],
  setupAnchorHeight: number,
  inputMode: 'historical' | 'fresh-current',
): Promise<Readonly<{
  tracker: Readonly<Eip12Box>;
  duplicatePrevention: Readonly<Eip12Box>;
  pooledReserve: Readonly<Eip12Box>;
}>> {
  const capturedInputs = exactRecord(value, [
    'tracker',
    'duplicatePrevention',
    'pooledReserve',
  ], `isolated-devnet ${inputMode} genesis inputs`);
  const snapshots = {
    tracker: snapshotGenesisBox(capturedInputs.tracker, 'tracker', inputMode),
    duplicatePrevention: snapshotGenesisBox(
      capturedInputs.duplicatePrevention,
      'duplicate-prevention',
      inputMode,
    ),
    pooledReserve: snapshotGenesisBox(
      capturedInputs.pooledReserve,
      'pooled-reserve',
      inputMode,
    ),
  };
  const normalized = await Promise.all([
    normalizeEip12Box(
      snapshots.tracker,
      `isolated ${inputMode} tracker input`,
    ),
    normalizeEip12Box(
      snapshots.duplicatePrevention,
      `isolated ${inputMode} duplicate-prevention input`,
    ),
    normalizeEip12Box(
      snapshots.pooledReserve,
      `isolated ${inputMode} pooled-reserve input`,
    ),
  ]);
  const result = {
    tracker: normalized[0]!,
    duplicatePrevention: normalized[1]!,
    pooledReserve: normalized[2]!,
  };
  if (
    result.tracker.boxId !== expected.tracker.genesisInputBoxIdHex
    || result.duplicatePrevention.boxId
      !== expected.duplicatePrevention.genesisInputBoxIdHex
    || result.pooledReserve.boxId
      !== expected.pooledReserve.genesisInputBoxIdHex
  ) {
    throw new Error(
      `isolated ${inputMode} genesis inputs do not match the exact target descriptor`,
    );
  }
  if (new Set(Object.values(result).map(box => box.boxId)).size !== 3) {
    throw new Error('isolated historical genesis inputs must be pairwise distinct');
  }
  for (const [role, box] of Object.entries(result)) {
    if (
      box.assets.length !== 0
      || Object.keys(box.additionalRegisters).length !== 0
      || box.creationHeight > setupAnchorHeight
    ) {
      throw new Error(
        `isolated historical ${role} input must be pure ERG, register-free, and not newer than the setup anchor`,
      );
    }
  }
  return deepFreeze(result);
}

function snapshotGenesisBox(
  value: unknown,
  role: string,
  inputMode: 'historical' | 'fresh-current',
): unknown {
  const label = `isolated ${inputMode} ${role} input`;
  const record = exactRecord(value, [
    'boxId',
    'value',
    'ergoTree',
    'assets',
    'additionalRegisters',
    'creationHeight',
    'transactionId',
    'index',
  ], label);
  if (!Array.isArray(record.assets)) {
    throw new Error(`${label}.assets must be an array`);
  }
  if (record.assets.length !== 0) {
    throw new Error(`${label} must be pure ERG`);
  }
  exactRecord(record.additionalRegisters, [], `${label}.additionalRegisters`);
  try {
    return structuredClone(record);
  } catch {
    throw new Error(`${label} must be a cloneable plain EIP-12 box`);
  }
}

function exactInputMode(value: unknown): 'historical' | 'fresh-current' {
  if (value !== 'historical' && value !== 'fresh-current') {
    throw new Error('isolated-devnet provisioning input mode is invalid');
  }
  return value;
}

async function materializeEntry(
  role: ProvisioningRole,
  genesisInput: Readonly<Eip12Box>,
  payload: Readonly<SubstrateFederatedIsolatedDevnetGenesisPayloadV1>,
  creationHeight: number,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetProvisioningEntryV1>> {
  if (
    payload.role !== role
    || payload.assets.length !== 1
    || payload.assets[0]!.amount !== '1'
  ) {
    throw new Error(`isolated ${role} genesis payload shape drifted`);
  }
  const transaction = await materializeSubstrateFederatedSingletonIssuanceV1({
    label: `isolated federated ${role} issuance`,
    genesisInput,
    expectedNftIdHex: payload.assets[0]!.tokenId,
    propositionHex: payload.ergoTreeHex,
    registers: payload.additionalRegisters,
    singletonValue: BigInt(payload.valueNanoErg),
    fee: BigInt(MINER_FEE),
    creationHeight,
  });
  const stateOutput = transaction.outputs[0]!;
  const identityBody = {
    role,
    genesisInputBoxIdHex: genesisInput.boxId,
    unsignedTransactionIdHex: transaction.txId,
    stateOutputBoxIdHex: stateOutput.boxId,
    stateOutputIndex: 0 as const,
    creationHeight,
    unsignedTransactionBodyDigestHex: sha256CanonicalJson(
      transaction.eip12Tx,
      TRANSACTION_BODY_DIGEST_DOMAIN,
    ),
    materializedTransactionDigestHex: sha256CanonicalJson(
      transaction,
      MATERIALIZED_TRANSACTION_DIGEST_DOMAIN,
    ),
  };
  return deepFreeze({
    identity: {
      ...identityBody,
      identityDigestHex: sha256CanonicalJson(
        identityBody,
        IDENTITY_DIGEST_DOMAIN,
      ),
    },
    transaction,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some(key => typeof key !== 'string')) {
    throw new Error(`${label} keys are invalid`);
  }
  const sorted = (actual as string[]).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(sorted) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
  const captured: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
