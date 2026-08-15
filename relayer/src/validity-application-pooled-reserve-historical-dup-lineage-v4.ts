import { createHash } from 'node:crypto';

import {
  getDupTreeDigest,
  insertLockRecord,
  insertLockRecordsBatch,
} from './avl-bridge.js';
import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  decodeBoundedCollByteRegister,
  decodeCanonicalDlogSigmaPropRegister,
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  EMPTY_AVL_DIGEST,
} from './ergo-encoding.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  deriveValidityApplicationPooledReserveTrackerKeyV4Hex,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  decodeValidityApplicationSettlementBundleV2,
} from './validity-application-settlement-v2.js';
import { encodeTrustlessBurnLeaf } from './trustless-burn-proof.js';
import {
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance,
  type ValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-historical-dup-lineage.v4' as const;

const OBSERVATION_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4';
const PACKET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_PACKET_V4';
const MAX_LINEAGE_BOXES = 16_385;
const MAX_CONTEXT_VALUE_BYTES = 1024 * 1024;
const MAX_CONTEXT_EXTENSION_VARIABLES = 256;
const MAX_CONTEXT_EXTENSION_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_CANONICAL_BOX_BYTES = 1024 * 1024;

export type HistoricalDupDeclaredKeyIntentV4 =
  | 'sidechain-burn-transaction-hash'
  | 'event-level-burn-id';
export const HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4 =
  'opaque-32-byte-replay-key' as const;
export type HistoricalDupObservedKeySemanticsV4 =
  typeof HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4;
export type HistoricalDupR6CodecV4 =
  | 'canonical-dlog-sigmaprop'
  | 'fixed-32-byte-profile-id'
  | 'absent';
export type HistoricalDupTokenStrengthV4 =
  | 'script-preserves-token-id-only'
  | 'script-preserves-first-token-id-and-amount'
  | 'script-enforces-exact-singleton';
export type HistoricalDupTreeUpdateStrengthV4 =
  | 'digest-only'
  | 'full-avl-equality';

export interface HistoricalDupFamilyDescriptorV4 {
  readonly routeId: string;
  readonly sourceSurface: string;
  readonly declaredKeyIntent: HistoricalDupDeclaredKeyIntentV4;
  readonly observedKeySemantics: HistoricalDupObservedKeySemanticsV4;
  readonly successorOutputIndex: 0 | 1;
  readonly topology: Readonly<{
    readonly selfInputIndex: 0 | 1 | 'script-unconstrained';
    readonly inputCount: 2 | 3 | 'script-unconstrained';
    readonly dataInputCount: 0 | 1 | 'script-unconstrained';
  }>;
  readonly contextGrammar: Readonly<{
    readonly kind:
      | 'single-key'
      | 'batch-1-to-20'
      | 'burn-leaf-proof-bundle';
    readonly requiredVariableRule: string;
    readonly unusedVariableRule:
      'ignored-by-script-and-retained-in-provenance';
  }>;
  readonly r6Codec: HistoricalDupR6CodecV4;
  readonly treeUpdateStrength: HistoricalDupTreeUpdateStrengthV4;
  readonly counterRule:
    | 'one-per-spending-transaction'
    | 'not-encoded-profile-bound';
  readonly valueRule: 'nondecreasing' | 'exactly-preserved';
  readonly creationHeightRule:
    | 'script-unconstrained'
    | 'successor-within-spending-height-minus-100';
  readonly tokenStrength: HistoricalDupTokenStrengthV4;
  readonly strongerProfileIdentityRequired: true;
  readonly companionRouteSemantics: string;
}

function family(
  descriptor: HistoricalDupFamilyDescriptorV4,
): HistoricalDupFamilyDescriptorV4 {
  return deepFreeze(descriptor);
}

export const HISTORICAL_DUP_FAMILIES_V4 = deepFreeze([
  family({
    routeId: 'ergo-double-unlock-prevention',
    sourceSurface: 'contracts/DoubleUnlockPrevention.es',
    declaredKeyIntent: 'sidechain-burn-transaction-hash',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: {
      selfInputIndex: 'script-unconstrained',
      inputCount: 'script-unconstrained',
      dataInputCount: 'script-unconstrained',
    },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte transaction hash, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'digest-only',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'nondecreasing',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-preserves-token-id-only',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'legacy direct unlock route',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-aggregate',
    sourceSurface: 'contracts/DoubleUnlockPreventionAggregate.es',
    declaredKeyIntent: 'sidechain-burn-transaction-hash',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 1,
    topology: {
      selfInputIndex: 'script-unconstrained',
      inputCount: 'script-unconstrained',
      dataInputCount: 'script-unconstrained',
    },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte transaction hash, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'digest-only',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'nondecreasing',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-preserves-first-token-id-and-amount',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'legacy tracker plus aggregate settlement vault',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-aggregate-batch',
    sourceSurface: 'contracts/DoubleUnlockPreventionAggregateBatch.es',
    declaredKeyIntent: 'sidechain-burn-transaction-hash',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 1,
    topology: {
      selfInputIndex: 'script-unconstrained',
      inputCount: 'script-unconstrained',
      dataInputCount: 'script-unconstrained',
    },
    contextGrammar: {
      kind: 'batch-1-to-20',
      requiredVariableRule: 'Var(0)=count, Var(1)=batch insert proof, Var(2..21)=active keys, Var(22..41)=matching lookup proofs',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'digest-only',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'nondecreasing',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-preserves-first-token-id-and-amount',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'legacy tracker plus batch aggregate settlement vault',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-authenticated',
    sourceSurface: 'contracts/DoubleUnlockPreventionAuthenticated.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: { selfInputIndex: 0, inputCount: 2, dataInputCount: 1 },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte burn ID, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'nondecreasing',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerAuthenticated.es plus MainChainAggregateUnlockAuthenticated.es',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-authenticated-external-fee-v1',
    sourceSurface: 'contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: { selfInputIndex: 0, inputCount: 3, dataInputCount: 1 },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte burn ID, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'exactly-preserved',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerAuthenticated.es plus MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-causal-v2',
    sourceSurface: 'contracts/DoubleUnlockPreventionCausalV2.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: { selfInputIndex: 0, inputCount: 2, dataInputCount: 1 },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte burn ID, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'canonical-dlog-sigmaprop',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'nondecreasing',
    creationHeightRule: 'script-unconstrained',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerAuthenticated.es plus MainChainCausalVaultV2.es',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-validity-v1',
    sourceSurface: 'contracts/DoubleUnlockPreventionValidityV1.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: { selfInputIndex: 0, inputCount: 3, dataInputCount: 1 },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte burn ID, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'fixed-32-byte-profile-id',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'exactly-preserved',
    creationHeightRule: 'successor-within-spending-height-minus-100',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerValidityV1.es plus MainChainCausalVaultValidityV1.es',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-validity-application-v2',
    sourceSurface: 'contracts/DoubleUnlockPreventionValidityApplicationV2.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 0,
    topology: { selfInputIndex: 0, inputCount: 3, dataInputCount: 1 },
    contextGrammar: {
      kind: 'single-key',
      requiredVariableRule: 'Var(0)=lookup proof, Var(1)=32-byte burn ID, Var(2)=insert proof',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'fixed-32-byte-profile-id',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'one-per-spending-transaction',
    valueRule: 'exactly-preserved',
    creationHeightRule: 'successor-within-spending-height-minus-100',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerValidityApplicationV2.es plus MainChainCausalVaultValidityApplicationV2.es',
  }),
  family({
    routeId: 'ergo-double-unlock-prevention-pooled-reserve-v4',
    sourceSurface: 'contracts/DoubleUnlockPreventionPooledReserveV4.es',
    declaredKeyIntent: 'event-level-burn-id',
    observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
    successorOutputIndex: 1,
    topology: { selfInputIndex: 1, inputCount: 3, dataInputCount: 1 },
    contextGrammar: {
      kind: 'burn-leaf-proof-bundle',
      requiredVariableRule: 'Var(0)=tracker key, Var(1)=tracker proof, Var(2)=205-byte burn leaf, Var(3)=burn/DUP proof bundle',
      unusedVariableRule: 'ignored-by-script-and-retained-in-provenance',
    },
    r6Codec: 'absent',
    treeUpdateStrength: 'full-avl-equality',
    counterRule: 'not-encoded-profile-bound',
    valueRule: 'exactly-preserved',
    creationHeightRule: 'successor-within-spending-height-minus-100',
    tokenStrength: 'script-enforces-exact-singleton',
    strongerProfileIdentityRequired: true,
    companionRouteSemantics: 'SPVTrackerPooledReserveBurnV4.es plus MainChainPooledReserveValidityApplicationV4.es',
  }),
] as const);

assertDescriptorRegistryMatchesStaticCutoverRegistry();

type LegacyRoute = ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number];
type LegacyInstance = LegacyRoute['instances'][number];

export interface ReconstructValidityApplicationPooledReserveHistoricalDupLineageV4Input {
  readonly profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>;
  readonly route: LegacyRoute;
  readonly instance: LegacyInstance;
  readonly primarySource: AuthenticatedV2VaultChainSource;
  readonly witnessSource: AuthenticatedV2VaultChainSource;
}

export interface HistoricalDupTransitionV4 {
  readonly spendingTransactionIdHex: string;
  readonly spendingBlockIdHex: string;
  readonly spendingInclusionHeight: number;
  readonly inputBoxIdHex: string;
  readonly successorBoxIdHex: string;
  readonly counterBefore: string;
  readonly counterAfter: string;
  readonly rawInsertedKeysHex: readonly string[];
  readonly contextExtensionDigestHex: string;
  readonly successorDigestHex: string;
}

export interface HistoricalDupRegistersV4 {
  readonly R4: string;
  readonly R5: string;
  readonly R6?: string;
}

export interface HistoricalDupLineageBoxV4 {
  readonly boxIdHex: string;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly creationHeight: number;
  readonly inclusionHeight: number;
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly singletonTokenIdHex: string;
  readonly registers: Readonly<HistoricalDupRegistersV4>;
  readonly spentTransactionIdHex: string | null;
}

export interface ValidityApplicationPooledReserveHistoricalDupLineageV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA;
  readonly version: 4;
  readonly classification: 'never-funded' | 'raw-reconstructed';
  readonly packetDigestHex: string;
  readonly profileDigestHex: string;
  readonly requirementsDigestHex: string;
  readonly networkId: string;
  readonly routeId: string;
  readonly sourceSurface: string;
  readonly instanceId: string;
  readonly address: string;
  readonly ergoTreeHex: string;
  readonly singletonTokenIdHex: string;
  readonly genesisBoxIdHex: string;
  readonly descriptor: HistoricalDupFamilyDescriptorV4;
  readonly stableSnapshot: HistoricalDupSnapshotV4;
  readonly genesisObservedBoxIdHex: string | null;
  readonly tipBoxIdHex: string | null;
  readonly tipDigestHex: string;
  readonly tipCounter: string;
  readonly tipSigmaSerializedHex: string | null;
  readonly tipSigmaSerializedSha256Hex: string | null;
  readonly rawInsertedKeysHex: readonly string[];
  readonly lineageBoxes: readonly HistoricalDupLineageBoxV4[];
  readonly transitions: readonly HistoricalDupTransitionV4[];
  readonly observationDigestHex: string;
  readonly sourceIdDigestsHex: readonly [string, string];
  readonly distinctSourceAgreement: true;
  readonly historicalScriptLimitations: Readonly<{
    readonly strongerProfileSingletonEnforcedOffChain: true;
    readonly scriptTokenStrength: HistoricalDupTokenStrengthV4;
    readonly declaredKeyIntent: HistoricalDupDeclaredKeyIntentV4;
    readonly observedKeySemantics: HistoricalDupObservedKeySemanticsV4;
    readonly rawKeysPromotedToCanonicalEvents: false;
    readonly contextExtensionDigestValidation:
      'producer-attested-format-and-packet-digest-only';
    readonly spendingBlockIdValidation:
      'producer-attested-format-and-packet-digest-only';
  }>;
  readonly boundaries: Readonly<{
    readonly readOnlyReconstruction: true;
    readonly localPersistenceConsulted: false;
    readonly completeIndexedTokenLineageMatchedAddress: true;
    readonly singletonIssuanceRootEstablished: boolean;
    readonly sourceOperationalIndependenceAuthenticated: false;
    readonly ergoConsensusAuthenticated: false;
    readonly transactionInclusionAuthenticated: false;
    readonly canonicalEventMappingEstablished: false;
    readonly globalGenesisBuilt: false;
    readonly allHistoricalLineagesImported: false;
    readonly inventoryExhaustive: false;
    readonly routeRetired: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
  }>;
}

interface HistoricalDupSnapshotV4 {
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly bestHeader: Readonly<{
    readonly idHex: string;
    readonly parentIdHex: string;
    readonly height: number;
    readonly extensionRootHex: string;
  }>;
}

interface SourceObservation {
  readonly classification: 'never-funded' | 'raw-reconstructed';
  readonly stableSnapshot: HistoricalDupSnapshotV4;
  readonly completeIndexedTokenLineageMatchedAddress: true;
  readonly singletonIssuanceRootEstablished: boolean;
  readonly genesisObservedBoxIdHex: string | null;
  readonly tipBoxIdHex: string | null;
  readonly tipDigestHex: string;
  readonly tipCounter: string;
  readonly tipSigmaSerializedHex: string | null;
  readonly tipSigmaSerializedSha256Hex: string | null;
  readonly rawInsertedKeysHex: readonly string[];
  readonly lineageBoxes: readonly HistoricalDupLineageBoxV4[];
  readonly transitions: readonly HistoricalDupTransitionV4[];
  readonly observationDigestHex: string;
}

interface NormalizedBox {
  readonly raw: Record<string, any>;
  readonly boxIdHex: string;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly creationHeight: number;
  readonly inclusionHeight: number;
  readonly valueNanoErg: bigint;
  readonly ergoTreeHex: string;
  readonly tokenIdHex: string;
  readonly registers: Readonly<HistoricalDupRegistersV4>;
  readonly spentTransactionIdHex: string | null;
  readonly spendingContext: Readonly<Record<string, string>> | null;
}

interface NormalizedTransaction {
  readonly idHex: string;
  readonly blockIdHex: string;
  readonly inclusionHeight: number;
  readonly inputs: readonly unknown[];
  readonly dataInputs: readonly unknown[];
  readonly outputs: readonly unknown[];
}

const reconstructions = new WeakSet<object>();

export function assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance(
  value: unknown,
): asserts value is Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4> {
  if (value === null || typeof value !== 'object' || !reconstructions.has(value)) {
    throw new Error('historical DUP lineage reconstruction was not built in this process');
  }
}

export function validateValidityApplicationPooledReserveHistoricalDupLineageV4(
  value: unknown,
): Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4> {
  const packet = exactDataObject(value, [
    'schema',
    'version',
    'classification',
    'packetDigestHex',
    'profileDigestHex',
    'requirementsDigestHex',
    'networkId',
    'routeId',
    'sourceSurface',
    'instanceId',
    'address',
    'ergoTreeHex',
    'singletonTokenIdHex',
    'genesisBoxIdHex',
    'descriptor',
    'stableSnapshot',
    'genesisObservedBoxIdHex',
    'tipBoxIdHex',
    'tipDigestHex',
    'tipCounter',
    'tipSigmaSerializedHex',
    'tipSigmaSerializedSha256Hex',
    'rawInsertedKeysHex',
    'lineageBoxes',
    'transitions',
    'observationDigestHex',
    'sourceIdDigestsHex',
    'distinctSourceAgreement',
    'historicalScriptLimitations',
    'boundaries',
  ], 'serialized historical DUP lineage');
  if (
    packet.schema !== VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA
    || packet.version !== 4
    || (packet.classification !== 'never-funded'
      && packet.classification !== 'raw-reconstructed')
    || packet.distinctSourceAgreement !== true
  ) {
    throw new Error('serialized historical DUP lineage identity is invalid');
  }
  const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(candidate =>
    candidate.routeId === packet.routeId
    && candidate.sourceSurface === packet.sourceSurface
  );
  if (descriptor === undefined || canonicalJson(packet.descriptor) !== canonicalJson(descriptor)) {
    throw new Error('serialized historical DUP lineage descriptor is invalid');
  }
  for (const [field, label] of [
    [packet.networkId, 'network ID'],
    [packet.routeId, 'route ID'],
    [packet.sourceSurface, 'source surface'],
    [packet.instanceId, 'instance ID'],
    [packet.address, 'address'],
  ] as const) {
    if (typeof field !== 'string' || field.length === 0 || field.trim() !== field) {
      throw new Error(`serialized historical DUP ${label} is invalid`);
    }
  }
  exactHistoricalVariableHex(packet.ergoTreeHex, 'serialized historical DUP ErgoTree');
  const limitations = exactDataObject(packet.historicalScriptLimitations, [
    'strongerProfileSingletonEnforcedOffChain',
    'scriptTokenStrength',
    'declaredKeyIntent',
    'observedKeySemantics',
    'rawKeysPromotedToCanonicalEvents',
    'contextExtensionDigestValidation',
    'spendingBlockIdValidation',
  ], 'serialized historical DUP lineage limitations');
  const expectedLimitations = {
    strongerProfileSingletonEnforcedOffChain: true,
    scriptTokenStrength: descriptor.tokenStrength,
    declaredKeyIntent: descriptor.declaredKeyIntent,
    observedKeySemantics: descriptor.observedKeySemantics,
    rawKeysPromotedToCanonicalEvents: false,
    contextExtensionDigestValidation:
      'producer-attested-format-and-packet-digest-only',
    spendingBlockIdValidation:
      'producer-attested-format-and-packet-digest-only',
  };
  if (canonicalJson(limitations) !== canonicalJson(expectedLimitations)) {
    throw new Error('serialized historical DUP lineage limitations are invalid');
  }
  const expectedBoundaries = {
    readOnlyReconstruction: true,
    localPersistenceConsulted: false,
    completeIndexedTokenLineageMatchedAddress: true,
    singletonIssuanceRootEstablished: packet.classification === 'raw-reconstructed',
    sourceOperationalIndependenceAuthenticated: false,
    ergoConsensusAuthenticated: false,
    transactionInclusionAuthenticated: false,
    canonicalEventMappingEstablished: false,
    globalGenesisBuilt: false,
    allHistoricalLineagesImported: false,
    inventoryExhaustive: false,
    routeRetired: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
  };
  const boundaries = exactDataObject(
    packet.boundaries,
    Object.keys(expectedBoundaries),
    'serialized historical DUP lineage boundaries',
  );
  if (canonicalJson(boundaries) !== canonicalJson(expectedBoundaries)) {
    throw new Error('serialized historical DUP lineage authority boundaries are invalid');
  }
  exactHistoricalFixedHex(packet.profileDigestHex, 32, 'serialized historical DUP profile digest');
  exactHistoricalFixedHex(packet.requirementsDigestHex, 32, 'serialized historical DUP requirements digest');
  exactHistoricalFixedHex(packet.singletonTokenIdHex, 32, 'serialized historical DUP singleton token ID');
  exactHistoricalFixedHex(packet.genesisBoxIdHex, 32, 'serialized historical DUP genesis box ID');
  exactHistoricalFixedHex(packet.tipDigestHex, 33, 'serialized historical DUP tip digest');
  validateHistoricalDupSnapshot(packet.stableSnapshot);
  const sourceIdDigests = packet.sourceIdDigestsHex;
  if (
    !Array.isArray(sourceIdDigests)
    || sourceIdDigests.length !== 2
    || sourceIdDigests.some((digest, index) =>
      exactHistoricalFixedHex(
        digest,
        32,
        `serialized historical DUP source digest ${index}`,
      ) !== digest
    )
    || sourceIdDigests[0]!.localeCompare(sourceIdDigests[1]!) >= 0
  ) {
    throw new Error('serialized historical DUP source digests must be sorted and distinct');
  }
  if (!Array.isArray(packet.rawInsertedKeysHex)
    || !Array.isArray(packet.lineageBoxes)
    || !Array.isArray(packet.transitions)) {
    throw new Error('serialized historical DUP lineage arrays are invalid');
  }
  const rawInsertedKeysHex = packet.rawInsertedKeysHex.map((key, index) =>
    exactHistoricalFixedHex(key, 32, `serialized historical DUP raw key ${index}`)
  );
  if (
    rawInsertedKeysHex.length > MAX_LINEAGE_BOXES * 20
    || new Set(rawInsertedKeysHex).size !== rawInsertedKeysHex.length
  ) {
    throw new Error('serialized historical DUP raw keys are invalid');
  }
  const lineageBoxes = packet.lineageBoxes.map((box, index) =>
    validateSerializedHistoricalDupLineageBox(box, index, packet, descriptor)
  );
  const transitions = packet.transitions.map((transition, index) =>
    validateSerializedHistoricalDupTransition(transition, index)
  );
  validateHistoricalDupLineageShape(
    packet,
    descriptor,
    rawInsertedKeysHex,
    lineageBoxes,
    transitions,
  );
  const observation = {
    classification: packet.classification,
    stableSnapshot: packet.stableSnapshot,
    completeIndexedTokenLineageMatchedAddress: true,
    singletonIssuanceRootEstablished: packet.classification === 'raw-reconstructed',
    genesisObservedBoxIdHex: packet.genesisObservedBoxIdHex,
    tipBoxIdHex: packet.tipBoxIdHex,
    tipDigestHex: packet.tipDigestHex,
    tipCounter: packet.tipCounter,
    tipSigmaSerializedHex: packet.tipSigmaSerializedHex,
    tipSigmaSerializedSha256Hex: packet.tipSigmaSerializedSha256Hex,
    rawInsertedKeysHex,
    lineageBoxes,
    transitions,
  };
  const expectedObservationDigestHex = sha256CanonicalJson({
    identity: {
      profileDigestHex: packet.profileDigestHex,
      requirementsDigestHex: packet.requirementsDigestHex,
      networkId: packet.networkId,
      routeId: packet.routeId,
      sourceSurface: packet.sourceSurface,
      instanceId: packet.instanceId,
      address: packet.address,
      ergoTreeHex: packet.ergoTreeHex,
      singletonTokenIdHex: packet.singletonTokenIdHex,
      genesisBoxIdHex: packet.genesisBoxIdHex,
    },
    descriptor,
    observation,
  }, OBSERVATION_DIGEST_DOMAIN);
  if (packet.observationDigestHex !== expectedObservationDigestHex) {
    throw new Error('serialized historical DUP observation digest is invalid');
  }
  const packetDigestHex = exactHistoricalFixedHex(
    packet.packetDigestHex,
    32,
    'serialized historical DUP packet digest',
  );
  const packetBinding = { ...packet };
  delete packetBinding.packetDigestHex;
  if (sha256CanonicalJson(packetBinding, PACKET_DIGEST_DOMAIN) !== packetDigestHex) {
    throw new Error('serialized historical DUP packet digest is invalid');
  }
  return value as Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>;
}

function validateHistoricalDupSnapshot(value: unknown): void {
  const snapshot = exactDataObject(value, [
    'indexedHeight',
    'fullHeight',
    'bestHeader',
  ], 'serialized historical DUP snapshot');
  const indexedHeight = serializedNonnegativeSafeInteger(
    snapshot.indexedHeight,
    'serialized historical DUP indexed height',
  );
  const fullHeight = serializedNonnegativeSafeInteger(
    snapshot.fullHeight,
    'serialized historical DUP full height',
  );
  const header = exactDataObject(snapshot.bestHeader, [
    'idHex',
    'parentIdHex',
    'height',
    'extensionRootHex',
  ], 'serialized historical DUP best header');
  exactHistoricalFixedHex(header.idHex, 32, 'serialized historical DUP header ID');
  exactHistoricalFixedHex(header.parentIdHex, 32, 'serialized historical DUP parent ID');
  exactHistoricalFixedHex(
    header.extensionRootHex,
    32,
    'serialized historical DUP extension root',
  );
  const headerHeight = serializedNonnegativeSafeInteger(
    header.height,
    'serialized historical DUP header height',
  );
  if (indexedHeight > fullHeight || headerHeight !== fullHeight) {
    throw new Error('serialized historical DUP snapshot heights are inconsistent');
  }
}

function validateSerializedHistoricalDupLineageBox(
  value: unknown,
  index: number,
  packet: Record<string, unknown>,
  descriptor: HistoricalDupFamilyDescriptorV4,
): HistoricalDupLineageBoxV4 {
  const label = `serialized historical DUP lineage box ${index}`;
  const box = exactDataObject(value, [
    'boxIdHex',
    'transactionIdHex',
    'outputIndex',
    'creationHeight',
    'inclusionHeight',
    'valueNanoErg',
    'ergoTreeHex',
    'singletonTokenIdHex',
    'registers',
    'spentTransactionIdHex',
  ], label);
  exactHistoricalFixedHex(box.boxIdHex, 32, `${label} ID`);
  exactHistoricalFixedHex(box.transactionIdHex, 32, `${label} transaction ID`);
  serializedNonnegativeSafeInteger(box.outputIndex, `${label} output index`);
  serializedNonnegativeSafeInteger(box.creationHeight, `${label} creation height`);
  serializedNonnegativeSafeInteger(box.inclusionHeight, `${label} inclusion height`);
  canonicalPositiveBigIntString(box.valueNanoErg, `${label} value`);
  if (
    exactHistoricalVariableHex(box.ergoTreeHex, `${label} ErgoTree`)
      !== packet.ergoTreeHex
    || exactHistoricalFixedHex(
      box.singletonTokenIdHex,
      32,
      `${label} singleton token ID`,
    ) !== packet.singletonTokenIdHex
  ) {
    throw new Error(`${label} differs from the packet identity`);
  }
  const registers = exactDataObject(
    box.registers,
    descriptor.r6Codec === 'absent' ? ['R4', 'R5'] : ['R4', 'R5', 'R6'],
    `${label} registers`,
  );
  decodeHistoricalR4(
    exactHistoricalVariableHex(registers.R4, `${label} R4`),
    descriptor,
    `${label} R4`,
  );
  exactHistoricalVariableHex(registers.R5, `${label} R5`);
  validateR6(
    registers.R6 as string | undefined,
    descriptor,
    `${label} R6`,
  );
  if (box.spentTransactionIdHex !== null) {
    exactHistoricalFixedHex(
      box.spentTransactionIdHex,
      32,
      `${label} spent transaction ID`,
    );
  }
  return value as HistoricalDupLineageBoxV4;
}

function validateSerializedHistoricalDupTransition(
  value: unknown,
  index: number,
): HistoricalDupTransitionV4 {
  const label = `serialized historical DUP transition ${index}`;
  const transition = exactDataObject(value, [
    'spendingTransactionIdHex',
    'spendingBlockIdHex',
    'spendingInclusionHeight',
    'inputBoxIdHex',
    'successorBoxIdHex',
    'counterBefore',
    'counterAfter',
    'rawInsertedKeysHex',
    'contextExtensionDigestHex',
    'successorDigestHex',
  ], label);
  exactHistoricalFixedHex(
    transition.spendingTransactionIdHex,
    32,
    `${label} spending transaction ID`,
  );
  exactHistoricalFixedHex(
    transition.spendingBlockIdHex,
    32,
    `${label} spending block ID`,
  );
  serializedNonnegativeSafeInteger(
    transition.spendingInclusionHeight,
    `${label} inclusion height`,
  );
  exactHistoricalFixedHex(transition.inputBoxIdHex, 32, `${label} input box ID`);
  exactHistoricalFixedHex(
    transition.successorBoxIdHex,
    32,
    `${label} successor box ID`,
  );
  canonicalNonnegativeBigIntString(transition.counterBefore, `${label} counter before`);
  canonicalNonnegativeBigIntString(transition.counterAfter, `${label} counter after`);
  if (!Array.isArray(transition.rawInsertedKeysHex)) {
    throw new Error(`${label} raw keys must be an array`);
  }
  for (const [keyIndex, key] of transition.rawInsertedKeysHex.entries()) {
    exactHistoricalFixedHex(key, 32, `${label} raw key ${keyIndex}`);
  }
  exactHistoricalFixedHex(
    transition.contextExtensionDigestHex,
    32,
    `${label} context-extension digest`,
  );
  exactHistoricalFixedHex(
    transition.successorDigestHex,
    33,
    `${label} successor digest`,
  );
  return value as HistoricalDupTransitionV4;
}

function validateHistoricalDupLineageShape(
  packet: Record<string, unknown>,
  descriptor: HistoricalDupFamilyDescriptorV4,
  rawInsertedKeysHex: readonly string[],
  lineageBoxes: readonly HistoricalDupLineageBoxV4[],
  transitions: readonly HistoricalDupTransitionV4[],
): void {
  const classification = packet.classification;
  const tipCounter = canonicalNonnegativeBigIntString(
    packet.tipCounter,
    'serialized historical DUP tip counter',
  );
  if (classification === 'never-funded') {
    if (
      packet.genesisObservedBoxIdHex !== null
      || packet.tipBoxIdHex !== null
      || packet.tipSigmaSerializedHex !== null
      || packet.tipSigmaSerializedSha256Hex !== null
      || rawInsertedKeysHex.length !== 0
      || lineageBoxes.length !== 0
      || transitions.length !== 0
      || tipCounter !== '0'
      || packet.tipDigestHex !== EMPTY_AVL_DIGEST
    ) {
      throw new Error('serialized never-funded historical DUP lineage is inconsistent');
    }
    return;
  }
  if (
    lineageBoxes.length === 0
    || lineageBoxes.length > MAX_LINEAGE_BOXES
    || transitions.length !== lineageBoxes.length - 1
    || packet.genesisObservedBoxIdHex !== packet.genesisBoxIdHex
    || packet.tipBoxIdHex !== lineageBoxes[lineageBoxes.length - 1]!.boxIdHex
    || packet.tipSigmaSerializedHex === null
    || packet.tipSigmaSerializedSha256Hex === null
    || tipCounter !== String(transitions.length)
  ) {
    throw new Error('serialized reconstructed historical DUP lineage shape is invalid');
  }
  const sigmaSerializedHex = exactHistoricalVariableHex(
    packet.tipSigmaSerializedHex,
    'serialized historical DUP tip binary',
  );
  const sigmaDigest = exactHistoricalFixedHex(
    packet.tipSigmaSerializedSha256Hex,
    32,
    'serialized historical DUP tip binary digest',
  );
  if (sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaDigest) {
    throw new Error('serialized historical DUP tip binary digest is invalid');
  }
  const transitionKeys: string[] = [];
  const cumulativeKeys: string[] = [];
  const genesis = lineageBoxes[0]!;
  const genesisR4 = decodeHistoricalR4(
    genesis.registers.R4,
    descriptor,
    'serialized historical DUP genesis R4',
  );
  if (
    (typeof genesisR4 === 'bigint' && genesisR4 !== 0n)
    || decodeAvlRegister(
      genesis.registers.R5,
      'serialized historical DUP genesis R5',
      descriptor,
    )
      !== EMPTY_AVL_DIGEST
  ) {
    throw new Error('serialized historical DUP genesis registers are invalid');
  }
  validateR6(genesis.registers.R6, descriptor, 'serialized historical DUP genesis R6');
  for (const [index, transition] of transitions.entries()) {
    const input = lineageBoxes[index]!;
    const successor = lineageBoxes[index + 1]!;
    const inputR4 = decodeHistoricalR4(
      input.registers.R4,
      descriptor,
      `serialized historical DUP input ${index} R4`,
    );
    const successorR4 = decodeHistoricalR4(
      successor.registers.R4,
      descriptor,
      `serialized historical DUP successor ${index} R4`,
    );
    const r4LineageMatches = typeof genesisR4 === 'bigint'
      ? inputR4 === BigInt(index) && successorR4 === BigInt(index + 1)
      : inputR4 === genesisR4 && successorR4 === genesisR4;
    const r6LineageMatches = descriptor.r6Codec === 'absent'
      ? input.registers.R6 === undefined && successor.registers.R6 === undefined
      : successor.registers.R6 === genesis.registers.R6;
    const expectedInputDigest = getDupTreeDigest(cumulativeKeys);
    cumulativeKeys.push(...transition.rawInsertedKeysHex);
    const expectedSuccessorDigest = getDupTreeDigest(cumulativeKeys);
    if (
      transition.inputBoxIdHex !== input.boxIdHex
      || transition.successorBoxIdHex !== successor.boxIdHex
      || transition.spendingTransactionIdHex !== successor.transactionIdHex
      || transition.spendingInclusionHeight !== successor.inclusionHeight
      || transition.counterBefore !== String(index)
      || transition.counterAfter !== String(index + 1)
      || input.spentTransactionIdHex !== transition.spendingTransactionIdHex
      || !r4LineageMatches
      || decodeAvlRegister(
        input.registers.R5,
        `serialized historical DUP input ${index} R5`,
        descriptor,
      )
        !== expectedInputDigest
      || transition.successorDigestHex !== expectedSuccessorDigest
      || decodeAvlRegister(
        successor.registers.R5,
        `serialized historical DUP successor ${index} R5`,
        descriptor,
      )
        !== expectedSuccessorDigest
      || !r6LineageMatches
      || (descriptor.treeUpdateStrength === 'full-avl-equality'
        && successor.registers.R5
          !== withAvlDigest(input.registers.R5, expectedSuccessorDigest))
      || (descriptor.valueRule === 'exactly-preserved'
        ? BigInt(successor.valueNanoErg) !== BigInt(input.valueNanoErg)
        : BigInt(successor.valueNanoErg) < BigInt(input.valueNanoErg))
      || (descriptor.creationHeightRule === 'successor-within-spending-height-minus-100'
        && (successor.creationHeight < input.creationHeight
          || successor.creationHeight > transition.spendingInclusionHeight
          || successor.creationHeight < transition.spendingInclusionHeight - 100))
    ) {
      throw new Error(`serialized historical DUP transition ${index} breaks lineage continuity`);
    }
    validateR6(
      successor.registers.R6,
      descriptor,
      `serialized historical DUP successor ${index} R6`,
    );
    transitionKeys.push(...transition.rawInsertedKeysHex);
  }
  if (canonicalJson(transitionKeys) !== canonicalJson(rawInsertedKeysHex)) {
    throw new Error('serialized historical DUP transition keys differ from the raw lineage keys');
  }
  const tip = lineageBoxes[lineageBoxes.length - 1]!;
  if (
    tip.spentTransactionIdHex !== null
    || packet.tipDigestHex !== getDupTreeDigest([...rawInsertedKeysHex])
    || decodeAvlRegister(tip.registers.R5, 'serialized historical DUP tip R5', descriptor)
      !== packet.tipDigestHex
  ) {
    throw new Error('serialized historical DUP tip is invalid');
  }
}

export async function reconstructValidityApplicationPooledReserveHistoricalDupLineageV4(
  input: ReconstructValidityApplicationPooledReserveHistoricalDupLineageV4Input,
): Promise<Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>> {
  const request = exactDataObject(input, [
    'profile',
    'route',
    'instance',
    'primarySource',
    'witnessSource',
  ], 'historical DUP lineage reconstruction input');
  const profile = request.profile as Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(profile);
  const route = assertExactProfileRoute(profile, request.route);
  const instance = assertExactProfileInstance(route, request.instance);
  const descriptor = descriptorFor(route.routeId, route.sourceSurface);
  if (instance.singletonTokenIdHex === null || instance.genesisBoxIdHex === null) {
    throw new Error('historical DUP reconstruction requires an exact singleton NFT and genesis identity');
  }
  const primarySource = request.primarySource as AuthenticatedV2VaultChainSource;
  const witnessSource = request.witnessSource as AuthenticatedV2VaultChainSource;
  const primarySourceId = sourceId(primarySource?.observationSourceId, 'primary source');
  const witnessSourceId = sourceId(witnessSource?.observationSourceId, 'witness source');
  if (primarySource === witnessSource || primarySourceId === witnessSourceId) {
    throw new Error('historical DUP reconstruction requires two distinct source identities');
  }
  assertBudgetHooks(primarySource, 'primary source');
  assertBudgetHooks(witnessSource, 'witness source');

  const common = { profile, route, instance, descriptor };
  const [primary, witness] = await Promise.allSettled([
    observeWithinBudget(primarySource, common),
    observeWithinBudget(witnessSource, common),
  ]);
  if (primary.status === 'rejected') throw primary.reason;
  if (witness.status === 'rejected') throw witness.reason;
  if (canonicalJson(primary.value) !== canonicalJson(witness.value)) {
    throw new Error('distinct-source historical DUP reconstructions disagree');
  }

  const sourceIdDigestsHex = [
    sha256Utf8(primarySourceId),
    sha256Utf8(witnessSourceId),
  ].sort() as [string, string];
  const binding = {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA,
    version: 4 as const,
    classification: primary.value.classification,
    profileDigestHex: profile.profileDigestHex,
    requirementsDigestHex: profile.requirementsDigestHex,
    networkId: profile.network.networkId,
    routeId: route.routeId,
    sourceSurface: route.sourceSurface,
    instanceId: instance.instanceId,
    address: instance.address,
    ergoTreeHex: instance.ergoTreeHex,
    singletonTokenIdHex: instance.singletonTokenIdHex,
    genesisBoxIdHex: instance.genesisBoxIdHex,
    descriptor,
    stableSnapshot: primary.value.stableSnapshot,
    genesisObservedBoxIdHex: primary.value.genesisObservedBoxIdHex,
    tipBoxIdHex: primary.value.tipBoxIdHex,
    tipDigestHex: primary.value.tipDigestHex,
    tipCounter: primary.value.tipCounter,
    tipSigmaSerializedHex: primary.value.tipSigmaSerializedHex,
    tipSigmaSerializedSha256Hex: primary.value.tipSigmaSerializedSha256Hex,
    rawInsertedKeysHex: primary.value.rawInsertedKeysHex,
    lineageBoxes: primary.value.lineageBoxes,
    transitions: primary.value.transitions,
    observationDigestHex: primary.value.observationDigestHex,
    sourceIdDigestsHex,
    distinctSourceAgreement: true as const,
    historicalScriptLimitations: {
      strongerProfileSingletonEnforcedOffChain: true as const,
      scriptTokenStrength: descriptor.tokenStrength,
      declaredKeyIntent: descriptor.declaredKeyIntent,
      observedKeySemantics: descriptor.observedKeySemantics,
      rawKeysPromotedToCanonicalEvents: false as const,
      contextExtensionDigestValidation:
        'producer-attested-format-and-packet-digest-only' as const,
      spendingBlockIdValidation:
        'producer-attested-format-and-packet-digest-only' as const,
    },
    boundaries: {
      readOnlyReconstruction: true as const,
      localPersistenceConsulted: false as const,
      completeIndexedTokenLineageMatchedAddress:
        primary.value.completeIndexedTokenLineageMatchedAddress,
      singletonIssuanceRootEstablished:
        primary.value.singletonIssuanceRootEstablished,
      sourceOperationalIndependenceAuthenticated: false as const,
      ergoConsensusAuthenticated: false as const,
      transactionInclusionAuthenticated: false as const,
      canonicalEventMappingEstablished: false as const,
      globalGenesisBuilt: false as const,
      allHistoricalLineagesImported: false as const,
      inventoryExhaustive: false as const,
      routeRetired: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
    },
  };
  const result = deepFreeze({
    ...binding,
    packetDigestHex: sha256CanonicalJson(binding, PACKET_DIGEST_DOMAIN),
  });
  reconstructions.add(result);
  return result;
}

async function observeWithinBudget(
  source: AuthenticatedV2VaultChainSource,
  binding: Readonly<{
    profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>;
    route: LegacyRoute;
    instance: LegacyInstance;
    descriptor: HistoricalDupFamilyDescriptorV4;
  }>,
): Promise<SourceObservation> {
  let started = false;
  try {
    if (source.beginAuthenticatedTrackerReconstruction) {
      source.beginAuthenticatedTrackerReconstruction();
      started = true;
    }
    return await observeSource(source, binding);
  } finally {
    if (started) source.endAuthenticatedTrackerReconstruction!();
  }
}

async function observeSource(
  source: AuthenticatedV2VaultChainSource,
  binding: Readonly<{
    profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>;
    route: LegacyRoute;
    instance: LegacyInstance;
    descriptor: HistoricalDupFamilyDescriptorV4;
  }>,
): Promise<SourceObservation> {
  const { profile, route, instance, descriptor } = binding;
  const networkBefore = await readNetwork(source, 'initial');
  const expectedNetwork = profile.network.networkId === 'ergo-mainnet'
    ? 'mainnet'
    : 'testnet';
  if (networkBefore !== expectedNetwork) {
    throw new Error(`historical DUP source network ${networkBefore} differs from ${expectedNetwork}`);
  }
  const snapshotBefore = await captureSnapshot(source, 'initial');
  const [indexedRaw, currentRaw, tokenIndexedRaw] = await Promise.all([
    source.getIndexedBoxesByAddress(instance.address),
    source.getUnspentBoxesByAddress(instance.address),
    source.getIndexedBoxesByTokenId(instance.singletonTokenIdHex!),
  ]);
  if (
    !Array.isArray(indexedRaw)
    || !Array.isArray(currentRaw)
    || !Array.isArray(tokenIndexedRaw)
  ) {
    throw new Error('historical DUP address and token observations must be arrays');
  }
  if (
    indexedRaw.length > MAX_LINEAGE_BOXES
    || currentRaw.length > MAX_LINEAGE_BOXES
    || tokenIndexedRaw.length > MAX_LINEAGE_BOXES
  ) {
    throw new Error(`historical DUP observation exceeds ${MAX_LINEAGE_BOXES} boxes`);
  }
  const siblingTokenIds = exactProfileTokensAtAddress(route, instance.address);
  const addressIndexed = indexedRaw
    .map((value, index) => classifyAddressBox(
      value,
      index,
      instance.ergoTreeHex,
      siblingTokenIds,
      'indexed',
    ))
    .filter(box => box.tokenIdHex === instance.singletonTokenIdHex)
    .map((box, index) => normalizeIndexedBox(
      box.raw,
      index,
      instance,
      descriptor,
    ));
  const tokenIndexed = tokenIndexedRaw.map((value, index) =>
    normalizeIndexedBox(value, index, instance, descriptor)
  );
  if (
    canonicalJson(addressIndexed.map(indexedBoxAgreement).sort(compareBoxAgreement))
    !== canonicalJson(tokenIndexed.map(indexedBoxAgreement).sort(compareBoxAgreement))
  ) {
    throw new Error(
      'historical DUP complete singleton-token lineage differs from its address history',
    );
  }
  const indexed = tokenIndexed;
  const currentCandidates = currentRaw
    .map((value, index) => classifyAddressBox(
      value,
      index,
      instance.ergoTreeHex,
      siblingTokenIds,
      'current',
    ))
    .filter(box => box.tokenIdHex === instance.singletonTokenIdHex);

  if (indexed.length === 0) {
    if (currentCandidates.length !== 0) {
      throw new Error('current historical DUP singleton is absent from indexed history');
    }
    const snapshotAfter = await captureSnapshot(source, 'final');
    assertSnapshot(snapshotBefore, snapshotAfter);
    if (await readNetwork(source, 'final') !== networkBefore) {
      throw new Error('historical DUP source network changed during reconstruction');
    }
    const withoutDigest = {
      classification: 'never-funded' as const,
      stableSnapshot: snapshotAfter,
      completeIndexedTokenLineageMatchedAddress: true as const,
      singletonIssuanceRootEstablished: false,
      genesisObservedBoxIdHex: null,
      tipBoxIdHex: null,
      tipDigestHex: EMPTY_AVL_DIGEST,
      tipCounter: '0',
      tipSigmaSerializedHex: null,
      tipSigmaSerializedSha256Hex: null,
      rawInsertedKeysHex: [] as readonly string[],
      lineageBoxes: [] as readonly HistoricalDupLineageBoxV4[],
      transitions: [] as readonly HistoricalDupTransitionV4[],
    };
    return deepFreeze({
      ...withoutDigest,
      observationDigestHex: observationDigest(binding, withoutDigest),
    });
  }
  if (currentCandidates.length !== 1) {
    throw new Error(`historical DUP funded lineage must have exactly one current singleton, got ${currentCandidates.length}`);
  }

  const lineage = orderLineage(indexed);
  const genesis = lineage[0];
  if (genesis.boxIdHex !== instance.genesisBoxIdHex) {
    throw new Error('historical DUP lineage root differs from the profiled genesis box');
  }
  const setup = normalizeTransaction(
    await source.getTransaction(genesis.transactionIdHex),
    genesis.transactionIdHex,
    'historical DUP setup transaction',
  );
  if (setup.inclusionHeight !== genesis.inclusionHeight) {
    throw new Error('historical DUP genesis height differs from its setup transaction');
  }
  if (
    setup.inputs.length === 0
    || normalizedBoxId(setup.inputs[0]) !== instance.singletonTokenIdHex
  ) {
    throw new Error(
      'historical DUP singleton NFT must equal the setup transaction first input box ID',
    );
  }
  await validateSpendingHeader(source, setup);
  assertOutputMatches(
    setup.outputs[genesis.outputIndex],
    genesis,
    genesis.outputIndex,
    instance,
    descriptor,
    'historical DUP setup output',
  );
  const genesisR4 = decodeHistoricalR4(
    genesis.registers.R4,
    descriptor,
    'historical DUP genesis R4',
  );
  if (typeof genesisR4 === 'bigint' && genesisR4 !== 0n) {
    throw new Error('historical DUP genesis counter must be zero');
  }
  if (
    decodeAvlRegister(genesis.registers.R5, 'historical DUP genesis R5', descriptor)
      !== EMPTY_AVL_DIGEST
  ) {
    throw new Error('historical DUP genesis must use the canonical empty AVL digest');
  }
  validateR6(genesis.registers.R6, descriptor, 'historical DUP genesis R6');
  const stableR6 = genesis.registers.R6;

  const rawInsertedKeysHex: string[] = [];
  const transitions: HistoricalDupTransitionV4[] = [];
  for (let index = 0; index < lineage.length - 1; index += 1) {
    const current = lineage[index];
    const successor = lineage[index + 1];
    if (current.spentTransactionIdHex === null || current.spendingContext === null) {
      throw new Error(`historical DUP box ${current.boxIdHex} lacks spending provenance`);
    }
    if (current.spentTransactionIdHex !== successor.transactionIdHex) {
      throw new Error('historical DUP successor transaction does not consume its predecessor');
    }
    const expectedInputDigest = getDupTreeDigest(rawInsertedKeysHex);
    if (
      decodeAvlRegister(current.registers.R5, 'historical DUP input R5', descriptor)
        !== expectedInputDigest
    ) {
      throw new Error('historical DUP input digest differs from reconstructed history');
    }
    const transaction = normalizeTransaction(
      await source.getTransaction(current.spentTransactionIdHex),
      current.spentTransactionIdHex,
      'historical DUP spending transaction',
    );
    if (transaction.inclusionHeight !== successor.inclusionHeight) {
      throw new Error('historical DUP successor height differs from its spending transaction');
    }
    await validateSpendingHeader(source, transaction);
    validateTopology(transaction, current, descriptor);
    assertOutputMatches(
      transaction.outputs[descriptor.successorOutputIndex],
      successor,
      descriptor.successorOutputIndex,
      instance,
      descriptor,
      'historical DUP successor output',
    );
    const transactionContext = normalizeContext(
      record(transaction.inputs.find(input => normalizedBoxId(input) === current.boxIdHex), 'historical DUP transaction input')
        .spendingProof?.extension,
      'historical DUP transaction context',
    );
    if (canonicalJson(transactionContext) !== canonicalJson(current.spendingContext)) {
      throw new Error('indexed and transaction historical DUP contexts disagree');
    }
    const inserted = replayContext(current.spendingContext, descriptor, rawInsertedKeysHex);
    rawInsertedKeysHex.push(...inserted.keys);
    const successorDigestHex = getDupTreeDigest(rawInsertedKeysHex);
    if (
      inserted.successorDigestHex !== successorDigestHex
      || decodeAvlRegister(
        successor.registers.R5,
        'historical DUP successor R5',
        descriptor,
      ) !== successorDigestHex
    ) {
      throw new Error('historical DUP successor digest differs from replayed inserts');
    }
    if (
      descriptor.treeUpdateStrength === 'full-avl-equality'
      && successor.registers.R5
        !== withAvlDigest(current.registers.R5, successorDigestHex)
    ) {
      throw new Error('historical DUP successor changes the full AvlTree policy');
    }
    const currentR4 = decodeHistoricalR4(
      current.registers.R4,
      descriptor,
      'historical DUP input R4',
    );
    const successorR4 = decodeHistoricalR4(
      successor.registers.R4,
      descriptor,
      'historical DUP successor R4',
    );
    if (typeof genesisR4 === 'bigint') {
      if (currentR4 !== BigInt(index) || successorR4 !== BigInt(index + 1)) {
        throw new Error('historical DUP counter must advance once per spending transaction');
      }
    } else if (currentR4 !== genesisR4 || successorR4 !== genesisR4) {
      throw new Error('historical DUP successor changes the pooled-reserve V4 lineage profile');
    }
    if (descriptor.r6Codec !== 'absent' && successor.registers.R6 !== stableR6) {
      throw new Error('historical DUP successor changes R6 semantics');
    }
    validateR6(successor.registers.R6, descriptor, 'historical DUP successor R6');
    validateSuccessorPolicy(current, successor, transaction, descriptor);
    transitions.push(deepFreeze({
      spendingTransactionIdHex: transaction.idHex,
      spendingBlockIdHex: transaction.blockIdHex,
      spendingInclusionHeight: transaction.inclusionHeight,
      inputBoxIdHex: current.boxIdHex,
      successorBoxIdHex: successor.boxIdHex,
      counterBefore: String(index),
      counterAfter: String(index + 1),
      rawInsertedKeysHex: inserted.keys,
      contextExtensionDigestHex: sha256CanonicalJson(
        current.spendingContext,
        'E2S_HISTORICAL_DUP_CONTEXT_EXTENSION_V4',
      ),
      successorDigestHex,
    }));
  }

  const tip = lineage[lineage.length - 1];
  const tipDigestHex = getDupTreeDigest(rawInsertedKeysHex);
  if (decodeAvlRegister(tip.registers.R5, 'historical DUP tip R5', descriptor) !== tipDigestHex) {
    throw new Error('historical DUP tip digest differs from reconstructed history');
  }
  const tipR4 = decodeHistoricalR4(tip.registers.R4, descriptor, 'historical DUP tip R4');
  if (
    (typeof genesisR4 === 'bigint' && tipR4 !== BigInt(transitions.length))
    || (typeof genesisR4 === 'string' && tipR4 !== genesisR4)
  ) {
    throw new Error('historical DUP tip R4 differs from its reconstructed lineage');
  }
  const tipCounter = BigInt(transitions.length);
  const currentByAddress = normalizeCurrentBox(
    currentCandidates[0].raw,
    instance,
    descriptor,
    'current address-view historical DUP tip',
  );
  if (currentByAddress.boxIdHex !== tip.boxIdHex) {
    throw new Error('indexed historical DUP tip and current address view disagree');
  }
  assertBoxPayloadEqual(tip, currentByAddress, 'indexed and current historical DUP tip');
  const byIdRaw = await source.getBoxByIdOrNull(tip.boxIdHex);
  if (byIdRaw === null) throw new Error('historical DUP tip is absent from the current box view');
  const currentById = normalizeCurrentBox(
    byIdRaw,
    instance,
    descriptor,
    'current ID-view historical DUP tip',
  );
  assertBoxPayloadEqual(tip, currentById, 'indexed and ID-view historical DUP tip');
  const sigmaSerializedHex = await validateCanonicalBinary(
    byIdRaw,
    await source.getBoxBinaryByIdOrNull(tip.boxIdHex),
    currentById,
  );

  const snapshotAfter = await captureSnapshot(source, 'final');
  assertSnapshot(snapshotBefore, snapshotAfter);
  if (await readNetwork(source, 'final') !== networkBefore) {
    throw new Error('historical DUP source network changed during reconstruction');
  }
  const withoutDigest = {
    classification: 'raw-reconstructed' as const,
    stableSnapshot: snapshotAfter,
    completeIndexedTokenLineageMatchedAddress: true as const,
    singletonIssuanceRootEstablished: true,
    genesisObservedBoxIdHex: genesis.boxIdHex,
    tipBoxIdHex: tip.boxIdHex,
    tipDigestHex,
    tipCounter: tipCounter.toString(),
    tipSigmaSerializedHex: sigmaSerializedHex,
    tipSigmaSerializedSha256Hex: sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')),
    rawInsertedKeysHex: deepFreeze([...rawInsertedKeysHex]),
    lineageBoxes: deepFreeze(lineage.map(lineageBox)),
    transitions: deepFreeze(transitions),
  };
  return deepFreeze({
    ...withoutDigest,
    observationDigestHex: observationDigest(binding, withoutDigest),
  });
}

function observationDigest(
  binding: Readonly<{
    profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>;
    route: LegacyRoute;
    instance: LegacyInstance;
    descriptor: HistoricalDupFamilyDescriptorV4;
  }>,
  observation: unknown,
): string {
  return sha256CanonicalJson({
    identity: {
      profileDigestHex: binding.profile.profileDigestHex,
      requirementsDigestHex: binding.profile.requirementsDigestHex,
      networkId: binding.profile.network.networkId,
      routeId: binding.route.routeId,
      sourceSurface: binding.route.sourceSurface,
      instanceId: binding.instance.instanceId,
      address: binding.instance.address,
      ergoTreeHex: binding.instance.ergoTreeHex,
      singletonTokenIdHex: binding.instance.singletonTokenIdHex,
      genesisBoxIdHex: binding.instance.genesisBoxIdHex,
    },
    descriptor: binding.descriptor,
    observation,
  }, OBSERVATION_DIGEST_DOMAIN);
}

function replayContext(
  context: Readonly<Record<string, string>>,
  descriptor: HistoricalDupFamilyDescriptorV4,
  history: readonly string[],
): Readonly<{ keys: readonly string[]; successorDigestHex: string }> {
  if (descriptor.contextGrammar.kind === 'single-key') {
    requireContextKeys(context, ['0', '1', '2'], 'historical DUP single-key context');
    const lookupProofHex = decodeBoundedCollByteRegister(
      context['0'],
      'historical DUP lookup proof',
      MAX_CONTEXT_VALUE_BYTES,
    );
    const keyHex = fixedHex(
      decodeCollByteRegister(context['1'], 'historical DUP raw key'),
      32,
      'historical DUP raw key',
    );
    const insertProofHex = decodeBoundedCollByteRegister(
      context['2'],
      'historical DUP insert proof',
      MAX_CONTEXT_VALUE_BYTES,
    );
    if (history.includes(keyHex)) throw new Error(`historical DUP key ${keyHex} is duplicated`);
    const proof = insertLockRecord([...history], keyHex);
    if (proof.lookup_proof_hex !== lookupProofHex || proof.insert_proof_hex !== insertProofHex) {
      throw new Error('historical DUP single-key proofs do not replay');
    }
    return deepFreeze({ keys: [keyHex], successorDigestHex: proof.new_digest_hex });
  }

  if (descriptor.contextGrammar.kind === 'burn-leaf-proof-bundle') {
    requireContextKeys(
      context,
      ['0', '1', '2', '3'],
      'historical pooled-reserve V4 DUP context',
    );
    const trackerKeyHex = fixedHex(
      decodeCollByteRegister(context['0'], 'historical pooled-reserve V4 tracker key'),
      32,
      'historical pooled-reserve V4 tracker key',
    );
    const trackerProofHex = decodeBoundedCollByteRegister(
      context['1'],
      'historical pooled-reserve V4 tracker proof',
      MAX_CONTEXT_VALUE_BYTES,
    );
    if (trackerProofHex.length === 0) {
      throw new Error('historical pooled-reserve V4 tracker proof must be non-empty');
    }
    const burnLeaf = decodeHistoricalPooledReserveBurnLeaf(
      decodeBoundedCollByteRegister(
        context['2'],
        'historical pooled-reserve V4 burn leaf',
        MAX_CONTEXT_VALUE_BYTES,
      ),
    );
    const bundle = decodeValidityApplicationSettlementBundleV2(
      decodeBoundedCollByteRegister(
        context['3'],
        'historical pooled-reserve V4 proof bundle',
        MAX_CONTEXT_VALUE_BYTES,
      ),
    );
    const expectedTrackerKeyHex = deriveValidityApplicationPooledReserveTrackerKeyV4Hex({
      sidechainIdHex: burnLeaf.sidechainIdHex,
      sidechainHeight: bundle.sidechainHeight,
      executionBlockHashHex: burnLeaf.sidechainBlockHashHex,
    });
    if (trackerKeyHex !== expectedTrackerKeyHex) {
      throw new Error('historical pooled-reserve V4 tracker key does not match the burn leaf');
    }
    const keyHex = burnLeaf.burnIdHex;
    if (history.includes(keyHex)) {
      throw new Error(`historical DUP key ${keyHex} is duplicated`);
    }
    const proof = insertLockRecord([...history], keyHex);
    if (
      proof.lookup_proof_hex !== bundle.dupLookupProofHex
      || proof.insert_proof_hex !== bundle.dupInsertProofHex
    ) {
      throw new Error('historical pooled-reserve V4 DUP proofs do not replay');
    }
    return deepFreeze({ keys: [keyHex], successorDigestHex: proof.new_digest_hex });
  }

  if (!Object.hasOwn(context, '0') || !Object.hasOwn(context, '1')) {
    throw new Error('historical DUP batch context is missing count or insert proof');
  }
  const count = decodeCanonicalIntRegister(context['0'], 'historical DUP batch count');
  if (count < 1 || count > 20) {
    throw new Error('historical DUP batch count must be between 1 and 20');
  }
  const required = ['0', '1'];
  for (let index = 0; index < count; index += 1) {
    required.push(String(2 + index), String(22 + index));
  }
  requireContextKeys(context, required, 'historical DUP batch context');
  const insertProofHex = decodeBoundedCollByteRegister(
    context['1'],
    'historical DUP batch insert proof',
    MAX_CONTEXT_VALUE_BYTES,
  );
  const keys = Array.from({ length: count }, (_, index) => fixedHex(
    decodeCollByteRegister(context[String(2 + index)], `historical DUP batch key ${index}`),
    32,
    `historical DUP batch key ${index}`,
  ));
  if (new Set(keys).size !== keys.length || keys.some(key => history.includes(key))) {
    throw new Error('historical DUP batch contains a duplicate key');
  }
  const lookupProofs = Array.from({ length: count }, (_, index) =>
    decodeBoundedCollByteRegister(
      context[String(22 + index)],
      `historical DUP batch lookup proof ${index}`,
      MAX_CONTEXT_VALUE_BYTES,
    )
  );
  const proof = insertLockRecordsBatch([...history], keys);
  if (
    canonicalJson(proof.lookup_proofs_hex) !== canonicalJson(lookupProofs)
    || proof.insert_proof_hex !== insertProofHex
  ) {
    throw new Error('historical DUP batch proofs do not replay');
  }
  return deepFreeze({ keys, successorDigestHex: proof.new_digest_hex });
}

function validateTopology(
  transaction: NormalizedTransaction,
  current: NormalizedBox,
  descriptor: HistoricalDupFamilyDescriptorV4,
): void {
  const matchingInputs = transaction.inputs
    .map((input, index) => ({ index, boxIdHex: normalizedBoxId(input) }))
    .filter(input => input.boxIdHex === current.boxIdHex);
  if (matchingInputs.length !== 1) {
    throw new Error('historical DUP spending transaction must consume the singleton exactly once');
  }
  if (
    descriptor.topology.selfInputIndex !== 'script-unconstrained'
    && matchingInputs[0].index !== descriptor.topology.selfInputIndex
  ) {
    throw new Error('historical DUP singleton is at the wrong input index');
  }
  if (
    descriptor.topology.inputCount !== 'script-unconstrained'
    && transaction.inputs.length !== descriptor.topology.inputCount
  ) {
    throw new Error('historical DUP spending transaction has the wrong input count');
  }
  if (
    descriptor.topology.dataInputCount !== 'script-unconstrained'
    && transaction.dataInputs.length !== descriptor.topology.dataInputCount
  ) {
    throw new Error('historical DUP spending transaction has the wrong data-input count');
  }
  if (transaction.outputs.length <= descriptor.successorOutputIndex) {
    throw new Error('historical DUP spending transaction omits the successor output');
  }
  if (
    descriptor.contextGrammar.kind === 'burn-leaf-proof-bundle'
    && transaction.outputs.length !== 4
  ) {
    throw new Error('historical pooled-reserve V4 spending transaction must have four outputs');
  }
}

function validateSuccessorPolicy(
  current: NormalizedBox,
  successor: NormalizedBox,
  transaction: NormalizedTransaction,
  descriptor: HistoricalDupFamilyDescriptorV4,
): void {
  if (descriptor.valueRule === 'exactly-preserved') {
    if (successor.valueNanoErg !== current.valueNanoErg) {
      throw new Error('historical DUP successor must preserve value exactly');
    }
  } else if (successor.valueNanoErg < current.valueNanoErg) {
    throw new Error('historical DUP successor reduces singleton value');
  }
  if (descriptor.creationHeightRule === 'successor-within-spending-height-minus-100') {
    if (
      successor.creationHeight < current.creationHeight
      || successor.creationHeight > transaction.inclusionHeight
      || successor.creationHeight < transaction.inclusionHeight - 100
    ) {
      throw new Error('historical DUP successor creation height violates the validity profile');
    }
  }
}

function lineageBox(box: NormalizedBox): HistoricalDupLineageBoxV4 {
  return deepFreeze({
    boxIdHex: box.boxIdHex,
    transactionIdHex: box.transactionIdHex,
    outputIndex: box.outputIndex,
    creationHeight: box.creationHeight,
    inclusionHeight: box.inclusionHeight,
    valueNanoErg: box.valueNanoErg.toString(),
    ergoTreeHex: box.ergoTreeHex,
    singletonTokenIdHex: box.tokenIdHex,
    registers: box.registers,
    spentTransactionIdHex: box.spentTransactionIdHex,
  });
}

function indexedBoxAgreement(box: NormalizedBox): Readonly<
  HistoricalDupLineageBoxV4 & {
    readonly spendingContext: Readonly<Record<string, string>> | null;
  }
> {
  return {
    ...lineageBox(box),
    spendingContext: box.spendingContext,
  };
}

function compareBoxAgreement(
  left: Readonly<{ readonly boxIdHex: string }>,
  right: Readonly<{ readonly boxIdHex: string }>,
): number {
  return left.boxIdHex.localeCompare(right.boxIdHex);
}

function withAvlDigest(registerHex: string, digestHex: string): string {
  const register = variableHex(registerHex, 'historical DUP input R5');
  const digest = fixedHex(digestHex, 33, 'historical DUP successor digest');
  if (register.length !== 76 || !register.startsWith('64')) {
    throw new Error('historical DUP input R5 must be a canonical AvlTree register');
  }
  return `${register.slice(0, 2)}${digest}${register.slice(68)}`;
}

function normalizeIndexedBox(
  value: unknown,
  index: number,
  instance: LegacyInstance,
  descriptor: HistoricalDupFamilyDescriptorV4,
): NormalizedBox {
  const raw = record(value, `indexed historical DUP box ${index}`);
  const spentTransactionIdHex = raw.spentTransactionId === null || raw.spentTransactionId === undefined
    ? null
    : fixedHex(raw.spentTransactionId, 32, `indexed historical DUP box ${index} spend`);
  const spendingContext = spentTransactionIdHex === null
    ? null
    : normalizeContext(
      record(raw.spendingProof, `indexed historical DUP box ${index} spending proof`).extension,
      `indexed historical DUP box ${index} context`,
    );
  if (spentTransactionIdHex === null && raw.spendingProof !== null && raw.spendingProof !== undefined) {
    throw new Error('unspent historical DUP box must not expose spending proof data');
  }
  return {
    ...normalizeBoxPayload(raw, instance, descriptor, `indexed historical DUP box ${index}`),
    raw,
    inclusionHeight: nonnegativeSafeInteger(
      raw.inclusionHeight,
      `indexed historical DUP box ${index} inclusion height`,
    ),
    spentTransactionIdHex,
    spendingContext,
  };
}

function normalizeCurrentBox(
  value: unknown,
  instance: LegacyInstance,
  descriptor: HistoricalDupFamilyDescriptorV4,
  label: string,
): NormalizedBox {
  const raw = record(value, label);
  if (
    (raw.spentTransactionId !== null && raw.spentTransactionId !== undefined)
    || (raw.spendingProof !== null && raw.spendingProof !== undefined)
  ) {
    throw new Error(`${label} must be unspent`);
  }
  return {
    ...normalizeBoxPayload(raw, instance, descriptor, label),
    raw,
    inclusionHeight: nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`),
    spentTransactionIdHex: null,
    spendingContext: null,
  };
}

function normalizeBoxPayload(
  raw: Record<string, any>,
  instance: LegacyInstance,
  descriptor: HistoricalDupFamilyDescriptorV4,
  label: string,
): Omit<NormalizedBox, 'raw' | 'inclusionHeight' | 'spentTransactionIdHex' | 'spendingContext'> {
  const ergoTreeHex = variableHex(raw.ergoTree, `${label} ErgoTree`);
  if (ergoTreeHex !== instance.ergoTreeHex) throw new Error(`${label} uses the wrong ErgoTree`);
  const assets = normalizeAssets(raw.assets, `${label} assets`);
  if (
    assets.length !== 1
    || assets[0].tokenIdHex !== instance.singletonTokenIdHex
    || assets[0].amount !== 1n
  ) {
    throw new Error(`${label} must preserve the exact profiled singleton NFT at amount one`);
  }
  const registersRaw = record(raw.additionalRegisters, `${label} registers`);
  exactKeys(
    registersRaw,
    descriptor.r6Codec === 'absent' ? ['R4', 'R5'] : ['R4', 'R5', 'R6'],
    `${label} registers`,
  );
  const registers: Readonly<HistoricalDupRegistersV4> = descriptor.r6Codec === 'absent'
    ? deepFreeze({
      R4: variableHex(registersRaw.R4, `${label} R4`),
      R5: variableHex(registersRaw.R5, `${label} R5`),
    })
    : deepFreeze({
      R4: variableHex(registersRaw.R4, `${label} R4`),
      R5: variableHex(registersRaw.R5, `${label} R5`),
      R6: variableHex(registersRaw.R6, `${label} R6`),
    });
  decodeHistoricalR4(registers.R4, descriptor, `${label} R4`);
  decodeAvlRegister(registers.R5, `${label} R5`, descriptor);
  validateR6(registers.R6, descriptor, `${label} R6`);
  return {
    boxIdHex: fixedHex(raw.boxId, 32, `${label} ID`),
    transactionIdHex: fixedHex(raw.transactionId, 32, `${label} transaction ID`),
    outputIndex: nonnegativeSafeInteger(raw.index, `${label} output index`),
    creationHeight: nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`),
    valueNanoErg: positiveBigInt(raw.value, `${label} value`),
    ergoTreeHex,
    tokenIdHex: assets[0].tokenIdHex,
    registers,
  };
}

function classifyAddressBox(
  value: unknown,
  index: number,
  ergoTreeHex: string,
  profiledTokenIds: ReadonlySet<string>,
  view: 'indexed' | 'current',
): { raw: Record<string, any>; tokenIdHex: string } {
  const raw = record(value, `${view} historical DUP address box ${index}`);
  if (variableHex(raw.ergoTree, `${view} historical DUP address box ${index} ErgoTree`) !== ergoTreeHex) {
    throw new Error(`${view} historical DUP address box uses the wrong ErgoTree`);
  }
  const assets = normalizeAssets(raw.assets, `${view} historical DUP address box ${index} assets`);
  if (assets.length !== 1 || assets[0].amount !== 1n) {
    throw new Error(`${view} historical DUP address box is not an exact singleton`);
  }
  if (!profiledTokenIds.has(assets[0].tokenIdHex)) {
    throw new Error(`${view} historical DUP address box uses an unprofiled singleton alias`);
  }
  return { raw, tokenIdHex: assets[0].tokenIdHex };
}

function orderLineage(boxes: readonly NormalizedBox[]): readonly NormalizedBox[] {
  const byId = new Map<string, NormalizedBox>();
  const byCreationTransaction = new Map<string, NormalizedBox>();
  for (const box of boxes) {
    if (byId.has(box.boxIdHex)) throw new Error(`duplicate historical DUP box ${box.boxIdHex}`);
    if (byCreationTransaction.has(box.transactionIdHex)) {
      throw new Error('historical DUP transaction creates multiple profiled singleton successors');
    }
    byId.set(box.boxIdHex, box);
    byCreationTransaction.set(box.transactionIdHex, box);
  }
  const tips = boxes.filter(box => box.spentTransactionIdHex === null);
  if (tips.length !== 1) {
    throw new Error(`historical DUP lineage must have exactly one tip, got ${tips.length}`);
  }
  const predecessorCount = new Map<string, number>();
  for (const box of boxes) {
    if (box.spentTransactionIdHex === null) continue;
    const successor = byCreationTransaction.get(box.spentTransactionIdHex);
    if (!successor) throw new Error('historical DUP lineage successor is missing');
    predecessorCount.set(successor.boxIdHex, (predecessorCount.get(successor.boxIdHex) ?? 0) + 1);
  }
  const roots = boxes.filter(box => (predecessorCount.get(box.boxIdHex) ?? 0) === 0);
  if (roots.length !== 1) {
    throw new Error(`historical DUP lineage must have exactly one root, got ${roots.length}`);
  }
  const ordered: NormalizedBox[] = [];
  const seen = new Set<string>();
  let cursor: NormalizedBox | undefined = roots[0];
  while (cursor !== undefined) {
    if (seen.has(cursor.boxIdHex)) throw new Error('historical DUP lineage contains a cycle');
    seen.add(cursor.boxIdHex);
    ordered.push(cursor);
    cursor = cursor.spentTransactionIdHex === null
      ? undefined
      : byCreationTransaction.get(cursor.spentTransactionIdHex);
  }
  if (ordered.length !== boxes.length || ordered.at(-1)?.boxIdHex !== tips[0].boxIdHex) {
    throw new Error('historical DUP lineage is disconnected or forked');
  }
  return ordered;
}

function normalizeTransaction(
  value: unknown,
  expectedIdHex: string,
  label: string,
): NormalizedTransaction {
  if (value === null) throw new Error(`${label} is unavailable`);
  const raw = record(value, label);
  const idHex = fixedHex(raw.id, 32, `${label} ID`);
  if (idHex !== expectedIdHex) throw new Error(`${label} ID mismatch`);
  if (!Array.isArray(raw.inputs) || !Array.isArray(raw.dataInputs) || !Array.isArray(raw.outputs)) {
    throw new Error(`${label} must expose input, data-input, and output arrays`);
  }
  return {
    idHex,
    blockIdHex: fixedHex(raw.blockId, 32, `${label} block ID`),
    inclusionHeight: nonnegativeSafeInteger(raw.inclusionHeight, `${label} inclusion height`),
    inputs: raw.inputs,
    dataInputs: raw.dataInputs,
    outputs: raw.outputs,
  };
}

async function validateSpendingHeader(
  source: AuthenticatedV2VaultChainSource,
  transaction: NormalizedTransaction,
): Promise<void> {
  const raw = await source.getBlockHeaderById(transaction.blockIdHex);
  if (raw === null) throw new Error('historical DUP spending block header is unavailable');
  const header = normalizeHeader(raw, 'historical DUP spending block header');
  if (header.idHex !== transaction.blockIdHex || header.height !== transaction.inclusionHeight) {
    throw new Error('historical DUP spending transaction and block header disagree');
  }
}

function assertOutputMatches(
  value: unknown,
  expected: NormalizedBox,
  expectedIndex: number,
  instance: LegacyInstance,
  descriptor: HistoricalDupFamilyDescriptorV4,
  label: string,
): void {
  const raw = record(value, label);
  const actual = normalizeCurrentBox(raw, instance, descriptor, label);
  if (actual.outputIndex !== expectedIndex) throw new Error(`${label} is at the wrong index`);
  assertBoxPayloadEqual(expected, actual, label);
}

function assertBoxPayloadEqual(left: NormalizedBox, right: NormalizedBox, label: string): void {
  if (
    left.boxIdHex !== right.boxIdHex
    || left.transactionIdHex !== right.transactionIdHex
    || left.outputIndex !== right.outputIndex
    || left.creationHeight !== right.creationHeight
    || left.valueNanoErg !== right.valueNanoErg
    || left.ergoTreeHex !== right.ergoTreeHex
    || left.tokenIdHex !== right.tokenIdHex
    || canonicalJson(left.registers) !== canonicalJson(right.registers)
  ) {
    throw new Error(`${label} does not match the indexed singleton`);
  }
}

async function validateCanonicalBinary(
  jsonValue: unknown,
  binaryValue: unknown,
  expected: NormalizedBox,
): Promise<string> {
  if (binaryValue === null) throw new Error('historical DUP tip canonical binary is unavailable');
  const binary = record(binaryValue, 'historical DUP tip binary response');
  const sigmaSerializedHex = boundedVariableHex(
    binary.bytes,
    'historical DUP tip binary bytes',
    MAX_CANONICAL_BOX_BYTES,
  );
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(jsonValue));
  } catch (error: any) {
    throw new Error(`historical DUP tip is not a canonical EIP-12 box: ${error?.message ?? String(error)}`);
  }
  try {
    const serialized = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (serialized !== sigmaSerializedHex) {
      throw new Error('historical DUP JSON and canonical binary observations disagree');
    }
    if (fixedHex(parsed.box_id().to_str(), 32, 'historical DUP canonical box ID') !== expected.boxIdHex) {
      throw new Error('historical DUP canonical binary has the wrong box ID');
    }
  } finally {
    parsed.free?.();
  }
  return sigmaSerializedHex;
}

function decodeHistoricalPooledReserveBurnLeaf(encodedLeafHex: string) {
  const leafHex = fixedHex(
    encodedLeafHex,
    205,
    'historical pooled-reserve V4 burn leaf',
  );
  const bytes = Buffer.from(leafHex, 'hex');
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: bytes.subarray(1, 33).toString('hex'),
    sidechainBlockHashHex: bytes.subarray(33, 65).toString('hex'),
    burnIdHex: bytes.subarray(65, 97).toString('hex'),
    sidechainTxHashHex: bytes.subarray(97, 129).toString('hex'),
    eventIndex: bytes.readUInt32BE(129),
    recipientErgoTreeHashHex: bytes.subarray(133, 165).toString('hex'),
    amountNanoErg: bytes.readBigUInt64BE(165).toString(),
    assetIdHex: bytes.subarray(173, 205).toString('hex'),
  });
  if (leaf.encodedLeafHex !== leafHex) {
    throw new Error('historical pooled-reserve V4 burn leaf is not canonical V1');
  }
  return leaf;
}

function decodeHistoricalR4(
  registerHex: string,
  descriptor: HistoricalDupFamilyDescriptorV4,
  label: string,
): bigint | string {
  if (descriptor.counterRule === 'one-per-spending-transaction') {
    return decodeCanonicalLongRegister(registerHex, label);
  }
  const profileIdHex = fixedHex(decodeCollByteRegister(registerHex, label), 32, label);
  if (/^0+$/.test(profileIdHex)) {
    throw new Error(`${label} pooled-reserve V4 lineage profile must be nonzero`);
  }
  return profileIdHex;
}

function validateR6(
  registerHex: string | undefined,
  descriptor: HistoricalDupFamilyDescriptorV4,
  label: string,
): void {
  if (descriptor.r6Codec === 'absent') {
    if (registerHex !== undefined) {
      throw new Error(`${label} must be absent for the pooled-reserve V4 family`);
    }
    return;
  }
  if (registerHex === undefined) throw new Error(`${label} is required`);
  if (descriptor.r6Codec === 'canonical-dlog-sigmaprop') {
    decodeCanonicalDlogSigmaPropRegister(registerHex, label);
    return;
  }
  fixedHex(decodeCollByteRegister(registerHex, label), 32, label);
}

function decodeAvlRegister(
  registerHex: string,
  label: string,
  descriptor: HistoricalDupFamilyDescriptorV4,
): string {
  const clean = variableHex(registerHex, label);
  if (clean.length !== 76 || !clean.startsWith('64')) {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  if (clean.slice(70, 72) !== '20' || clean.slice(72) !== '0101') {
    throw new Error(`${label} must use 32-byte keys and one-byte values`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) throw new Error(`${label} must permit inserts`);
  if (descriptor.contextGrammar.kind === 'burn-leaf-proof-bundle' && flags !== 0x01) {
    throw new Error(`${label} pooled-reserve V4 AVL policy must be insert-only`);
  }
  return clean.slice(2, 68);
}

async function captureSnapshot(
  source: AuthenticatedV2VaultChainSource,
  label: string,
): Promise<HistoricalDupSnapshotV4> {
  const progress = record(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeSafeInteger(progress.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(progress.fullHeight, `${label} full height`);
  if (indexedHeight !== fullHeight) throw new Error(`${label} extra index is not synchronized`);
  const bestHeader = normalizeHeader(await source.getBestHeader(), `${label} best header`);
  if (bestHeader.height !== fullHeight) throw new Error(`${label} best header does not identify full height`);
  return deepFreeze({ indexedHeight, fullHeight, bestHeader });
}

function normalizeHeader(value: unknown, label: string): HistoricalDupSnapshotV4['bestHeader'] {
  const raw = record(value, label);
  return deepFreeze({
    idHex: fixedHex(raw.id, 32, `${label} ID`),
    parentIdHex: fixedHex(raw.parentId, 32, `${label} parent ID`),
    height: nonnegativeSafeInteger(raw.height, `${label} height`),
    extensionRootHex: fixedHex(
      raw.extensionRoot ?? raw.extensionHash,
      32,
      `${label} extension root`,
    ),
  });
}

function assertSnapshot(left: HistoricalDupSnapshotV4, right: HistoricalDupSnapshotV4): void {
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new Error('historical DUP source snapshot changed during reconstruction');
  }
}

async function readNetwork(source: AuthenticatedV2VaultChainSource, label: string): Promise<string> {
  const info = record(await source.getInfo(), `${label} node info`);
  const value = info.network ?? info.networkType;
  if (typeof value !== 'string') throw new Error(`${label} node network is missing`);
  const network = value.trim().toLowerCase();
  if (network !== 'mainnet' && network !== 'testnet') {
    throw new Error(`${label} node network must be mainnet or testnet`);
  }
  return network;
}

function normalizeContext(value: unknown, label: string): Readonly<Record<string, string>> {
  const raw = record(value, label);
  if (Object.keys(raw).length > MAX_CONTEXT_EXTENSION_VARIABLES) {
    throw new Error(
      `${label} exceeds ${MAX_CONTEXT_EXTENSION_VARIABLES} variables`,
    );
  }
  let totalBytes = 0;
  const entries = Object.entries(raw)
    .map(([key, entry]) => {
      if (!/^(?:0|[1-9][0-9]{0,2})$/.test(key) || Number(key) > 255) {
        throw new Error(`${label} contains invalid Var(${key})`);
      }
      const encoded = boundedVariableHex(
        entry,
        `${label} Var(${key})`,
        MAX_CONTEXT_VALUE_BYTES + 16,
      );
      totalBytes += encoded.length / 2;
      if (totalBytes > MAX_CONTEXT_EXTENSION_TOTAL_BYTES) {
        throw new Error(
          `${label} exceeds ${MAX_CONTEXT_EXTENSION_TOTAL_BYTES} aggregate bytes`,
        );
      }
      return [key, encoded] as const;
    })
    .sort(([left], [right]) => Number(left) - Number(right));
  return deepFreeze(Object.fromEntries(entries));
}

function normalizeAssets(
  value: unknown,
  label: string,
): readonly { readonly tokenIdHex: string; readonly amount: bigint }[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const assets = value.map((entry, index) => {
    const raw = record(entry, `${label} item ${index}`);
    return {
      tokenIdHex: fixedHex(raw.tokenId, 32, `${label} item ${index} token ID`),
      amount: positiveBigInt(raw.amount, `${label} item ${index} amount`),
    };
  });
  if (new Set(assets.map(asset => asset.tokenIdHex)).size !== assets.length) {
    throw new Error(`${label} contains duplicate token IDs`);
  }
  return assets;
}

function assertExactProfileRoute(profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>, value: unknown): LegacyRoute {
  const match = profile.routes.find(route => route === value);
  if (match === undefined) throw new Error('historical DUP route is not the exact object from the process-provenant profile');
  return match;
}

function assertExactProfileInstance(route: LegacyRoute, value: unknown): LegacyInstance {
  const match = route.instances.find(instance => instance === value);
  if (match === undefined) throw new Error('historical DUP instance is not the exact object from the process-provenant profile');
  return match;
}

function descriptorFor(routeId: string, sourceSurface: string): HistoricalDupFamilyDescriptorV4 {
  const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(candidate => candidate.routeId === routeId);
  if (descriptor === undefined || descriptor.sourceSurface !== sourceSurface) {
    throw new Error('profile route is not a supported historical DUP family');
  }
  return descriptor;
}

function exactProfileTokensAtAddress(route: LegacyRoute, address: string): ReadonlySet<string> {
  const tokens = route.instances
    .filter(instance => instance.address === address)
    .map(instance => instance.singletonTokenIdHex);
  if (tokens.some(token => token === null)) {
    throw new Error('every historical DUP generation at one address requires an exact singleton identity');
  }
  return new Set(tokens as string[]);
}

function assertDescriptorRegistryMatchesStaticCutoverRegistry(): void {
  const requirements = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .filter(requirement => requirement.layer === 'ergo' && requirement.routeClass === 'duplicate-prevention');
  if (requirements.length !== HISTORICAL_DUP_FAMILIES_V4.length) {
    throw new Error('historical DUP descriptor table differs from the static cutover registry');
  }
  for (const descriptor of HISTORICAL_DUP_FAMILIES_V4) {
    const requirement = requirements.find(candidate => candidate.routeId === descriptor.routeId);
    if (requirement === undefined || requirement.sourceSurface !== descriptor.sourceSurface) {
      throw new Error(`historical DUP descriptor ${descriptor.routeId} differs from the static cutover registry`);
    }
  }
}

function assertBudgetHooks(source: AuthenticatedV2VaultChainSource, label: string): void {
  if (
    Boolean(source?.beginAuthenticatedTrackerReconstruction)
    !== Boolean(source?.endAuthenticatedTrackerReconstruction)
  ) {
    throw new Error(`${label} reconstruction budget hooks must be paired`);
  }
}

function exactDataObject(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  exactKeys(value as Record<string, unknown>, expected, label);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right));
  const wanted = [...expected].sort((left, right) => left.localeCompare(right));
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function requireContextKeys(
  value: Readonly<Record<string, string>>,
  required: readonly string[],
  label: string,
): void {
  const missing = required.filter(key => !Object.hasOwn(value, key));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required Var(${missing.join('), Var(')})`);
  }
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function normalizedBoxId(value: unknown): string | null {
  try {
    return fixedHex(record(value, 'transaction input').boxId, 32, 'transaction input box ID');
  } catch {
    return null;
  }
}

function sourceId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} identity must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} identity is invalid`);
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = variableHex(value, label);
  if (clean.length !== bytes * 2) throw new Error(`${label} must be ${bytes} bytes`);
  return clean;
}

function exactHistoricalFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const clean = fixedHex(value, bytes, label);
  if (value !== clean) throw new Error(`${label} must be canonical lowercase hex`);
  return clean;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be nonempty even-length hex`);
  }
  return clean.toLowerCase();
}

function exactHistoricalVariableHex(value: unknown, label: string): string {
  const clean = variableHex(value, label);
  if (value !== clean) throw new Error(`${label} must be canonical lowercase hex`);
  return clean;
}

function boundedVariableHex(value: unknown, label: string, maxBytes: number): string {
  const clean = variableHex(value, label);
  if (clean.length / 2 > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return clean;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || Number(number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(number);
}

function positiveBigInt(value: unknown, label: string): bigint {
  try {
    const parsed = BigInt(value as any);
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be a positive integer`);
  }
}

function canonicalNonnegativeBigIntString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative integer string`);
  }
  return value;
}

function serializedNonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer number`);
  }
  return Number(value);
}

function canonicalPositiveBigIntString(value: unknown, label: string): string {
  const canonical = canonicalNonnegativeBigIntString(value, label);
  if (canonical === '0') throw new Error(`${label} must be positive`);
  return canonical;
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Utf8(value: string): string {
  return sha256Hex(Buffer.from(value, 'utf8'));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}
