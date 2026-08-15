import { createHash } from 'node:crypto';

import {
  assertAuthenticatedV2ReadOnlyReconstructionProvenance,
  type AuthenticatedV2ReadOnlyReconstruction,
} from './authenticated-v2-cache-recovery.js';
import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import { EMPTY_AVL_DIGEST } from './ergo-encoding.js';
import {
  assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet,
  type ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet,
} from './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance,
  validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type ValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import {
  HISTORICAL_DUP_FAMILIES_V4,
  HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
  assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance,
  type HistoricalDupDeclaredKeyIntentV4,
  type HistoricalDupObservedKeySemanticsV4,
  type ValidityApplicationPooledReserveHistoricalDupLineageV4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-ergo-legacy-inventory.v4' as const;
export const
VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS =
  'blocking_non_authorizing_inventory' as const;

const INVENTORY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4';
const ROUTE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_INVENTORY_V4';
const INSTANCE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INSTANCE_INVENTORY_V4';
const ADDITIONAL_REGISTERS_DIGEST_DOMAIN =
  'E2S_ERGO_LEGACY_INVENTORY_ADDITIONAL_REGISTERS_V4';
const MAX_BOXES_PER_INSTANCE = 4_096;
const MAX_ERGO_TREE_BYTES = 32 * 1024;
const MAX_REGISTER_BYTES = 32 * 1024;
const MAX_SERIALIZED_BOX_BYTES = 1024 * 1024;
const AUTHENTICATED_V2_TRACKER_ROUTE_ID =
  'ergo-spvtracker-authenticated';
const AUTHENTICATED_V2_DUP_ROUTE_ID =
  'ergo-double-unlock-prevention-authenticated';
const AUTHENTICATED_V2_VAULT_ROUTE_ID =
  'ergo-main-chain-aggregate-unlock-authenticated';
const packets = new WeakSet<object>();

export type ErgoLegacyRouteInventoryClassificationV4 =
  | 'funded'
  | 'drained'
  | 'never-funded'
  | 'unresolved';

export type ErgoLegacyRouteInventoryBlockerV4 =
  | 'primary-observation-failed'
  | 'witness-observation-failed'
  | 'source-disagreement'
  | 'current-funds-present'
  | 'authenticated-v2-reconstruction-missing'
  | 'authenticated-v2-profile-mismatch'
  | 'authenticated-v2-root-provenance-unresolved'
  | 'authenticated-v2-replay-import-missing'
  | 'historical-dup-lineage-missing'
  | 'historical-dup-event-mapping-required'
  | 'historical-dup-source-admission-required'
  | 'historical-dup-inventory-unresolved'
  | 'historical-dup-drained-reconciliation-required'
  | 'singleton-identity-required'
  | 'retirement-evidence-required';

export interface BuildValidityApplicationPooledReserveErgoLegacyInventoryV4Input {
  readonly profile: Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
  readonly primarySource: AuthenticatedV2VaultChainSource;
  readonly witnessSource: AuthenticatedV2VaultChainSource;
  readonly authenticatedV2:
    | Readonly<AuthenticatedV2ReadOnlyReconstruction>
    | null;
  readonly replayImport:
    | Readonly<
      ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
    >
    | null;
  readonly historicalDupLineages: readonly Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4
  >[];
  readonly observedAt?: () => Date;
}

export type ErgoHistoricalDuplicatePreventionStatusV4 =
  | 'missing'
  | 'inventory-unresolved'
  | 'inventory-drained'
  | 'never-funded'
  | 'opaque-lineage-zero-keys'
  | 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required'
  | 'opaque-event-id-intent-mapping-and-source-admission-required'
  | 'authenticated-v2-lineage-and-replay-import-agree';

export interface ErgoHistoricalDuplicatePreventionCoverageV4 {
  readonly routeId: string;
  readonly sourceSurface: string;
  readonly instanceId: string;
  readonly address: string;
  readonly singletonTokenIdHex: string | null;
  readonly genesisBoxIdHex: string | null;
  readonly inventoryClassification: ErgoLegacyRouteInventoryClassificationV4;
  readonly status: ErgoHistoricalDuplicatePreventionStatusV4;
  readonly declaredKeyIntent: HistoricalDupDeclaredKeyIntentV4;
  readonly observedKeySemantics: HistoricalDupObservedKeySemanticsV4;
  readonly packetDigestHex: string | null;
  readonly observationDigestHex: string | null;
  readonly rawKeyCount: number;
  readonly tipBoxIdHex: string | null;
  readonly exactInventoryJoinEstablished: boolean;
  readonly canonicalEventMappingEstablished: boolean;
  readonly sourceAdmissionEvidenceJoined: boolean;
  readonly canonicalSourceFinalityEstablished: false;
  readonly replayGenesisEligible: false;
  readonly fundsAuthorityEstablished: false;
  readonly blockerCodes: readonly ErgoLegacyRouteInventoryBlockerV4[];
}

export interface ErgoLegacyInventoryBoxV4 {
  readonly boxIdHex: string;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly creationHeight: number;
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly assets: readonly {
    readonly tokenIdHex: string;
    readonly amount: string;
  }[];
  readonly additionalRegistersDigestHex: string;
  readonly spentTransactionIdHex: string | null;
  readonly sigmaSerializedSha256Hex: string;
  readonly currentUtxoBinaryMatched: boolean;
}

export interface ErgoLegacyRouteInstanceInventoryV4 {
  readonly instanceId: string;
  readonly address: string;
  readonly ergoTreeHex: string;
  readonly ergoTreeSha256Hex: string;
  readonly singletonTokenIdHex: string | null;
  readonly genesisBoxIdHex: string | null;
  readonly classification: ErgoLegacyRouteInventoryClassificationV4;
  readonly indexedHistoryBoxCount: number;
  readonly currentUtxoCount: number;
  readonly currentValueNanoErg: string;
  readonly indexedBoxes: readonly ErgoLegacyInventoryBoxV4[];
  readonly currentBoxIdsHex: readonly string[];
  readonly blockerCodes: readonly ErgoLegacyRouteInventoryBlockerV4[];
  readonly inventoryEvidenceDigestHex: string;
}

export interface ErgoLegacyRouteInventoryV4 {
  readonly routeId: string;
  readonly sourceSurface: string;
  readonly requiredDisposition: string;
  readonly classification: ErgoLegacyRouteInventoryClassificationV4;
  readonly instances: readonly ErgoLegacyRouteInstanceInventoryV4[];
  readonly blockerCodes: readonly ErgoLegacyRouteInventoryBlockerV4[];
  readonly inventoryEvidenceDigestHex: string;
  readonly retirementEvidenceDigestHex: null;
  readonly retirementDeclarationEligible: false;
}

export interface ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS;
  readonly packetDigestHex: string;
  readonly profile: {
    readonly profileDigestHex: string;
    readonly requirementsDigestHex: string;
    readonly networkId: string;
    readonly instanceInventoryExhaustive: false;
    readonly profileApproved: false;
  };
  readonly observation: {
    readonly observedAt: string;
    readonly sourceIdDigestsHex: readonly [string, string];
    readonly stableSnapshot: ErgoLegacyInventorySnapshotV4;
    readonly exactSourceAgreementRequired: true;
    readonly sourceOperationalIndependenceAuthenticated: false;
    readonly canonicalConsensusProven: false;
  };
  readonly routes: readonly ErgoLegacyRouteInventoryV4[];
  readonly historicalDuplicatePrevention: readonly ErgoHistoricalDuplicatePreventionCoverageV4[];
  readonly authenticatedV2: {
    readonly reconstructionSupplied: boolean;
    readonly reconstructionDigests: {
      readonly tracker: string;
      readonly duplicatePrevention: string;
      readonly vault: string;
    } | null;
    readonly currentInputs: {
      readonly trackerBoxIdHex: string;
      readonly duplicatePreventionBoxIdHex: string;
      readonly vaultBoxIdsHex: readonly string[];
    } | null;
    readonly replayImportPacketDigestHex: string | null;
    readonly canonicalReplayKeyCount: number;
    readonly allHistoricalReplayLineagesImported: false;
  };
  readonly summary: {
    readonly routeCount: number;
    readonly instanceCount: number;
    readonly fundedRouteCount: number;
    readonly drainedRouteCount: number;
    readonly neverFundedRouteCount: number;
    readonly unresolvedRouteCount: number;
    readonly routesWithObservationBlockers: number;
    readonly duplicatePreventionInstanceCount: number;
    readonly historicalLineagePacketCount: number;
    readonly historicalLineageMissingCount: number;
    readonly historicalLineageJoinedCount: number;
    readonly historicalFundedLineageReplayedCount: number;
    readonly historicalNeverFundedInstanceConfirmedCount: number;
    readonly historicalLineagesAwaitingSourceEvidenceCount: number;
    readonly routesRetired: 0;
  };
  readonly authority: {
    readonly instanceProfileApproved: false;
    readonly instanceInventoryExhaustive: false;
    readonly legacyRouteInventoryAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface ErgoLegacyInventorySnapshotV4 {
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly bestHeader: {
    readonly idHex: string;
    readonly parentIdHex: string;
    readonly height: number;
    readonly extensionRootHex: string;
  };
}

interface InstanceSourceObservation {
  readonly classification: Exclude<
    ErgoLegacyRouteInventoryClassificationV4,
    'unresolved'
  >;
  readonly indexedBoxes: readonly ErgoLegacyInventoryBoxV4[];
  readonly currentBoxIdsHex: readonly string[];
  readonly currentValueNanoErg: string;
}

class InstanceObservationError extends Error {
  constructor(readonly code:
    | 'query-failed'
    | 'invalid-observation'
    | 'singleton-identity-required') {
    super(code);
    this.name = 'InstanceObservationError';
  }
}

function hasExactSingletonToken(
  box: ErgoLegacyInventoryBoxV4,
  singletonTokenIdHex: string,
): boolean {
  return box.assets.some(asset =>
    asset.tokenIdHex === singletonTokenIdHex
    && asset.amount === '1'
  );
}

function routeUsesSingletonIdentity(
  routeClass: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['routeClass'],
): boolean {
  return routeClass === 'sidechain-state'
    || routeClass === 'tracker'
    || routeClass === 'duplicate-prevention';
}

export async function buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
  input: BuildValidityApplicationPooledReserveErgoLegacyInventoryV4Input,
): Promise<Readonly<
  ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet
>> {
  assertExactDataObject(input, [
    'profile',
    'primarySource',
    'witnessSource',
    'authenticatedV2',
    'replayImport',
    'historicalDupLineages',
    ...(Object.hasOwn(input, 'observedAt') ? ['observedAt'] : []),
  ], 'pooled-reserve V4 Ergo legacy inventory input');
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(
    input.profile,
  );
  if (input.primarySource === input.witnessSource) {
    throw new Error('Ergo legacy inventory requires distinct source instances');
  }
  const primarySourceId = normalizedSourceId(
    input.primarySource.observationSourceId,
    'primary Ergo legacy inventory source ID',
  );
  const witnessSourceId = normalizedSourceId(
    input.witnessSource.observationSourceId,
    'witness Ergo legacy inventory source ID',
  );
  if (primarySourceId === witnessSourceId) {
    throw new Error('Ergo legacy inventory requires distinct source identities');
  }
  const sources = [input.primarySource, input.witnessSource] as const;
  assertBudgetHooks(sources);
  const expectedNetwork = input.profile.network.networkId === 'ergo-mainnet'
    ? 'mainnet'
    : 'testnet';
  const started = [false, false];
  let snapshot: ErgoLegacyInventorySnapshotV4;
  let routes: ErgoLegacyRouteInventoryV4[];
  try {
    for (const [index, source] of sources.entries()) {
      source.beginAuthenticatedTrackerReconstruction?.();
      started[index] = Boolean(source.beginAuthenticatedTrackerReconstruction);
    }
    const [primaryNetworkBefore, witnessNetworkBefore] = await Promise.all([
      readNetwork(input.primarySource, 'primary pre-inventory'),
      readNetwork(input.witnessSource, 'witness pre-inventory'),
    ]);
    if (
      primaryNetworkBefore !== expectedNetwork
      || witnessNetworkBefore !== expectedNetwork
    ) {
      throw new Error('Ergo legacy inventory sources do not match the profile network');
    }
    const [primarySnapshotBefore, witnessSnapshotBefore] = await Promise.all([
      captureSnapshot(input.primarySource, 'primary pre-inventory'),
      captureSnapshot(input.witnessSource, 'witness pre-inventory'),
    ]);
    if (
      canonicalJson(primarySnapshotBefore)
      !== canonicalJson(witnessSnapshotBefore)
    ) {
      throw new Error('Ergo legacy inventory sources disagree on the starting snapshot');
    }
    snapshot = primarySnapshotBefore;
    routes = [];
    for (const route of input.profile.routes) {
      const instances: ErgoLegacyRouteInstanceInventoryV4[] = [];
      for (const instance of route.instances) {
        instances.push(await observeInstancePair(
          instance,
          route.routeClass,
          input.primarySource,
          input.witnessSource,
          snapshot.fullHeight,
        ));
      }
      const classification = combineClassifications(
        instances.map(instance => instance.classification),
      );
      const blockerCodes = sortedUnique([
        ...instances.flatMap(instance => instance.blockerCodes),
        ...(classification === 'funded'
          ? ['current-funds-present' as const]
          : []),
        'retirement-evidence-required' as const,
      ]);
      const binding = {
        routeId: route.routeId,
        sourceSurface: route.sourceSurface,
        requiredDisposition: route.requiredDisposition,
        classification,
        instances: [...instances].sort((left, right) =>
          left.instanceId.localeCompare(right.instanceId)
        ),
        blockerCodes,
        retirementEvidenceDigestHex: null,
        retirementDeclarationEligible: false as const,
      };
      routes.push({
        ...binding,
        inventoryEvidenceDigestHex: sha256CanonicalJson(
          binding,
          ROUTE_DIGEST_DOMAIN,
        ),
      });
    }
    assertNoCrossRouteBoxAssignment(routes);

    const [primarySnapshotAfter, witnessSnapshotAfter] = await Promise.all([
      captureSnapshot(input.primarySource, 'primary post-inventory'),
      captureSnapshot(input.witnessSource, 'witness post-inventory'),
    ]);
    const [primaryNetworkAfter, witnessNetworkAfter] = await Promise.all([
      readNetwork(input.primarySource, 'primary post-inventory'),
      readNetwork(input.witnessSource, 'witness post-inventory'),
    ]);
    if (
      canonicalJson(primarySnapshotAfter) !== canonicalJson(snapshot)
      || canonicalJson(witnessSnapshotAfter) !== canonicalJson(snapshot)
      || primaryNetworkAfter !== expectedNetwork
      || witnessNetworkAfter !== expectedNetwork
    ) {
      throw new Error('Ergo legacy inventory source view changed during observation');
    }
  } finally {
    const endErrors: unknown[] = [];
    for (let index = sources.length - 1; index >= 0; index -= 1) {
      if (!started[index]) continue;
      try {
        sources[index].endAuthenticatedTrackerReconstruction!();
      } catch (error) {
        endErrors.push(error);
      }
    }
    if (endErrors.length > 0) throw endErrors[0];
  }

  const authenticatedV2 = bindAuthenticatedV2(
    input.profile,
    routes,
    snapshot,
    [primarySourceId, witnessSourceId],
    input.authenticatedV2,
    input.replayImport,
  );
  routes = applyAuthenticatedV2Blockers(
    routes,
    authenticatedV2.routeBlockers,
  );
  const historicalDuplicatePrevention = bindHistoricalDuplicatePrevention(
    input.profile,
    routes,
    snapshot,
    [sha256Utf8(primarySourceId), sha256Utf8(witnessSourceId)].sort() as [string, string],
    input.historicalDupLineages,
    input.authenticatedV2,
    input.replayImport,
  );
  routes = applyHistoricalDupBlockers(
    routes,
    historicalDuplicatePrevention.routeBlockers,
  );
  const observedAtValue = (input.observedAt ?? (() => new Date()))();
  if (
    !(observedAtValue instanceof Date)
    || Number.isNaN(observedAtValue.getTime())
  ) {
    throw new Error('Ergo legacy inventory clock must return a valid Date');
  }
  const summary = summarize(routes, historicalDuplicatePrevention.coverage);
  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA,
    version: 4 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS,
    profile: {
      profileDigestHex: input.profile.profileDigestHex,
      requirementsDigestHex: input.profile.requirementsDigestHex,
      networkId: input.profile.network.networkId,
      instanceInventoryExhaustive: false as const,
      profileApproved: false as const,
    },
    observation: {
      observedAt: observedAtValue.toISOString(),
      sourceIdDigestsHex: [
        sha256Utf8(primarySourceId),
        sha256Utf8(witnessSourceId),
      ].sort() as [string, string],
      stableSnapshot: snapshot,
      exactSourceAgreementRequired: true as const,
      sourceOperationalIndependenceAuthenticated: false as const,
      canonicalConsensusProven: false as const,
    },
    routes,
    historicalDuplicatePrevention: historicalDuplicatePrevention.coverage,
    authenticatedV2: authenticatedV2.packetBinding,
    summary,
    authority: {
      instanceProfileApproved: false as const,
      instanceInventoryExhaustive: false as const,
      legacyRouteInventoryAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const packet = deepFreeze({
    ...binding,
    packetDigestHex: sha256CanonicalJson(binding, INVENTORY_DIGEST_DOMAIN),
  });
  packets.add(packet);
  return packet;
}

export function assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve V4 Ergo legacy inventory was not built in this process',
    );
  }
}

export function validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
  value: unknown,
  expectedRouteProfile: unknown,
): Readonly<ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet> {
  const routeProfile =
    validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      expectedRouteProfile,
    );
  const packet = assertExactDataObject(value, [
    'schema',
    'version',
    'status',
    'packetDigestHex',
    'profile',
    'observation',
    'routes',
    'historicalDuplicatePrevention',
    'authenticatedV2',
    'summary',
    'authority',
  ], 'serialized pooled-reserve V4 Ergo legacy inventory');
  if (
    packet.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA
    || packet.version !== 4
    || packet.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS
  ) {
    throw new Error('serialized Ergo legacy inventory identity is invalid');
  }

  const profile = assertExactDataObject(packet.profile, [
    'profileDigestHex',
    'requirementsDigestHex',
    'networkId',
    'instanceInventoryExhaustive',
    'profileApproved',
  ], 'serialized Ergo legacy inventory profile');
  exactFixedHex(profile.profileDigestHex, 32, 'serialized inventory profile digest');
  exactFixedHex(
    profile.requirementsDigestHex,
    32,
    'serialized inventory requirements digest',
  );
  if (
    typeof profile.networkId !== 'string'
    || profile.networkId.length === 0
    || profile.instanceInventoryExhaustive !== false
    || profile.profileApproved !== false
  ) {
    throw new Error('serialized Ergo legacy inventory profile boundary is invalid');
  }
  if (
    profile.profileDigestHex !== routeProfile.profileDigestHex
    || profile.requirementsDigestHex !== routeProfile.requirementsDigestHex
    || profile.networkId !== routeProfile.network.networkId
  ) {
    throw new Error('serialized Ergo legacy inventory differs from its canonical route profile');
  }

  const observation = assertExactDataObject(packet.observation, [
    'observedAt',
    'sourceIdDigestsHex',
    'stableSnapshot',
    'exactSourceAgreementRequired',
    'sourceOperationalIndependenceAuthenticated',
    'canonicalConsensusProven',
  ], 'serialized Ergo legacy inventory observation');
  if (
    typeof observation.observedAt !== 'string'
    || new Date(observation.observedAt).toISOString() !== observation.observedAt
    || observation.exactSourceAgreementRequired !== true
    || observation.sourceOperationalIndependenceAuthenticated !== false
    || observation.canonicalConsensusProven !== false
  ) {
    throw new Error('serialized Ergo legacy inventory observation boundary is invalid');
  }
  validateSourceDigestPair(
    observation.sourceIdDigestsHex,
    'serialized Ergo legacy inventory source digests',
  );
  validateInventorySnapshot(
    observation.stableSnapshot,
    'serialized Ergo legacy inventory snapshot',
  );

  if (!Array.isArray(packet.routes)) {
    throw new Error('serialized Ergo legacy inventory routes must be an array');
  }
  const routes = packet.routes.map((route, index) =>
    validateSerializedInventoryRoute(route, index)
  );
  assertUnique(routes.map(route => route.routeId), 'serialized inventory route');
  assertNoCrossRouteBoxAssignment(routes);
  assertSerializedInventoryMatchesRouteProfile(routes, routeProfile);

  if (!Array.isArray(packet.historicalDuplicatePrevention)) {
    throw new Error('serialized historical DUP coverage must be an array');
  }
  const historicalDuplicatePrevention = packet.historicalDuplicatePrevention.map(
    (coverage, index) => validateSerializedHistoricalDupCoverage(coverage, index),
  );
  assertUnique(
    historicalDuplicatePrevention.map(entry => `${entry.routeId}/${entry.instanceId}`),
    'serialized historical DUP coverage',
  );
  const routesById = new Map(routes.map(route => [route.routeId, route]));
  for (const coverage of historicalDuplicatePrevention) {
    const route = routesById.get(coverage.routeId);
    const instance = route?.instances.find(candidate =>
      candidate.instanceId === coverage.instanceId
    );
    if (
      route === undefined
      || instance === undefined
      || route.sourceSurface !== coverage.sourceSurface
      || instance.address !== coverage.address
      || instance.singletonTokenIdHex !== coverage.singletonTokenIdHex
      || instance.genesisBoxIdHex !== coverage.genesisBoxIdHex
      || instance.classification !== coverage.inventoryClassification
    ) {
      throw new Error('serialized historical DUP coverage differs from route inventory');
    }
  }

  const authenticatedV2 = validateSerializedAuthenticatedV2Binding(
    packet.authenticatedV2,
  );
  validateSerializedRouteBlockerDerivation(
    routes,
    historicalDuplicatePrevention,
    authenticatedV2,
  );
  const expectedSummary = summarize(routes, historicalDuplicatePrevention);
  const summary = assertExactDataObject(
    packet.summary,
    Object.keys(expectedSummary),
    'serialized Ergo legacy inventory summary',
  );
  if (canonicalJson(summary) !== canonicalJson(expectedSummary)) {
    throw new Error('serialized Ergo legacy inventory summary is invalid');
  }

  const expectedAuthority = {
    instanceProfileApproved: false,
    instanceInventoryExhaustive: false,
    legacyRouteInventoryAuthenticated: false,
    legacyRoutesRetired: false,
    profileActivated: false,
    mintAuthorized: false,
    payoutAuthorized: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  } as const;
  const authority = assertExactDataObject(
    packet.authority,
    Object.keys(expectedAuthority),
    'serialized Ergo legacy inventory authority',
  );
  if (canonicalJson(authority) !== canonicalJson(expectedAuthority)) {
    throw new Error('serialized Ergo legacy inventory authority boundary is invalid');
  }

  const packetDigestHex = exactFixedHex(
    packet.packetDigestHex,
    32,
    'serialized Ergo legacy inventory packet digest',
  );
  const binding = { ...packet };
  delete binding.packetDigestHex;
  if (sha256CanonicalJson(binding, INVENTORY_DIGEST_DOMAIN) !== packetDigestHex) {
    throw new Error('serialized Ergo legacy inventory packet digest is invalid');
  }
  return value as Readonly<
    ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet
  >;
}

function assertSerializedInventoryMatchesRouteProfile(
  routes: readonly ErgoLegacyRouteInventoryV4[],
  routeProfile: Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >,
): void {
  const inventoryProjection = routes.map(route => ({
    routeId: route.routeId,
    sourceSurface: route.sourceSurface,
    requiredDisposition: route.requiredDisposition,
    instances: route.instances.map(instance => ({
      instanceId: instance.instanceId,
      address: instance.address,
      ergoTreeHex: instance.ergoTreeHex,
      ergoTreeSha256Hex: instance.ergoTreeSha256Hex,
      singletonTokenIdHex: instance.singletonTokenIdHex,
      genesisBoxIdHex: instance.genesisBoxIdHex,
    })),
  }));
  const profileProjection = routeProfile.routes.map(route => ({
    routeId: route.routeId,
    sourceSurface: route.sourceSurface,
    requiredDisposition: route.requiredDisposition,
    instances: route.instances.map(instance => ({
      instanceId: instance.instanceId,
      address: instance.address,
      ergoTreeHex: instance.ergoTreeHex,
      ergoTreeSha256Hex: instance.ergoTreeSha256Hex,
      singletonTokenIdHex: instance.singletonTokenIdHex,
      genesisBoxIdHex: instance.genesisBoxIdHex,
    })),
  }));
  if (canonicalJson(inventoryProjection) !== canonicalJson(profileProjection)) {
    throw new Error('serialized Ergo legacy inventory route identities differ from its canonical route profile');
  }
}

function validateSerializedInventoryRoute(
  value: unknown,
  routeIndex: number,
): ErgoLegacyRouteInventoryV4 {
  const label = `serialized Ergo legacy inventory route ${routeIndex}`;
  const route = assertExactDataObject(value, [
    'routeId',
    'sourceSurface',
    'requiredDisposition',
    'classification',
    'instances',
    'blockerCodes',
    'inventoryEvidenceDigestHex',
    'retirementEvidenceDigestHex',
    'retirementDeclarationEligible',
  ], label);
  requireNonemptyString(route.routeId, `${label} ID`);
  requireNonemptyString(route.sourceSurface, `${label} source surface`);
  requireNonemptyString(route.requiredDisposition, `${label} disposition`);
  assertInventoryClassification(route.classification, `${label} classification`);
  if (!Array.isArray(route.instances)) {
    throw new Error(`${label} instances must be an array`);
  }
  const instances = route.instances.map((instance, index) =>
    validateSerializedInventoryInstance(instance, routeIndex, index)
  );
  assertUnique(instances.map(instance => instance.instanceId), `${label} instance`);
  if (route.classification !== combineClassifications(
    instances.map(instance => instance.classification),
  )) {
    throw new Error(`${label} classification differs from its instances`);
  }
  validateBlockerCodes(route.blockerCodes, `${label} blockers`);
  const routeBlockers = route.blockerCodes as readonly ErgoLegacyRouteInventoryBlockerV4[];
  const mandatoryBlockers = sortedUnique([
    ...instances.flatMap(instance => instance.blockerCodes),
    ...(route.classification === 'funded'
      ? ['current-funds-present' as const]
      : []),
    'retirement-evidence-required' as const,
  ]);
  if (mandatoryBlockers.some(blocker => !routeBlockers.includes(blocker))) {
    throw new Error(`${label} omits a blocker derived from its inventory`);
  }
  if (
    route.classification !== 'funded'
    && routeBlockers.includes('current-funds-present')
  ) {
    throw new Error(`${label} has a current-funds blocker without current funds`);
  }
  if (
    route.retirementEvidenceDigestHex !== null
    || route.retirementDeclarationEligible !== false
  ) {
    throw new Error(`${label} must remain unretired`);
  }
  const digest = exactFixedHex(
    route.inventoryEvidenceDigestHex,
    32,
    `${label} evidence digest`,
  );
  const binding = { ...route };
  delete binding.inventoryEvidenceDigestHex;
  if (sha256CanonicalJson(binding, ROUTE_DIGEST_DOMAIN) !== digest) {
    throw new Error(`${label} evidence digest is invalid`);
  }
  return value as ErgoLegacyRouteInventoryV4;
}

function validateSerializedInventoryInstance(
  value: unknown,
  routeIndex: number,
  instanceIndex: number,
): ErgoLegacyRouteInstanceInventoryV4 {
  const label = `serialized Ergo legacy inventory route ${routeIndex} instance ${instanceIndex}`;
  const instance = assertExactDataObject(value, [
    'instanceId',
    'address',
    'ergoTreeHex',
    'ergoTreeSha256Hex',
    'singletonTokenIdHex',
    'genesisBoxIdHex',
    'classification',
    'indexedHistoryBoxCount',
    'currentUtxoCount',
    'currentValueNanoErg',
    'indexedBoxes',
    'currentBoxIdsHex',
    'blockerCodes',
    'inventoryEvidenceDigestHex',
  ], label);
  requireNonemptyString(instance.instanceId, `${label} ID`);
  requireNonemptyString(instance.address, `${label} address`);
  const ergoTreeHex = exactVariableHex(
    instance.ergoTreeHex,
    MAX_ERGO_TREE_BYTES,
    `${label} ErgoTree`,
  );
  const ergoTreeSha256Hex = exactFixedHex(
    instance.ergoTreeSha256Hex,
    32,
    `${label} ErgoTree digest`,
  );
  if (sha256Bytes(Buffer.from(ergoTreeHex, 'hex')) !== ergoTreeSha256Hex) {
    throw new Error(`${label} ErgoTree digest is invalid`);
  }
  validateNullableFixedHex(instance.singletonTokenIdHex, 32, `${label} singleton token ID`);
  validateNullableFixedHex(instance.genesisBoxIdHex, 32, `${label} genesis box ID`);
  assertInventoryClassification(instance.classification, `${label} classification`);
  const indexedHistoryBoxCount = nonnegativeSafeInteger(
    instance.indexedHistoryBoxCount,
    `${label} indexed-history count`,
  );
  const currentUtxoCount = nonnegativeSafeInteger(
    instance.currentUtxoCount,
    `${label} current UTXO count`,
  );
  const currentValueNanoErg = nonnegativeBigIntString(
    instance.currentValueNanoErg,
    `${label} current value`,
  );
  if (!Array.isArray(instance.indexedBoxes) || !Array.isArray(instance.currentBoxIdsHex)) {
    throw new Error(`${label} box fields must be arrays`);
  }
  const indexedBoxes = instance.indexedBoxes.map((box, index) =>
    validateSerializedInventoryBox(box, label, index, ergoTreeHex)
  );
  const currentBoxIdsHex = instance.currentBoxIdsHex.map((boxId, index) =>
    exactFixedHex(boxId, 32, `${label} current box ID ${index}`)
  );
  assertSortedUnique(
    indexedBoxes.map(box => box.boxIdHex),
    `${label} indexed box IDs`,
  );
  assertSortedUnique(currentBoxIdsHex, `${label} current box IDs`);
  if (
    indexedHistoryBoxCount !== indexedBoxes.length
    || currentUtxoCount !== currentBoxIdsHex.length
  ) {
    throw new Error(`${label} box counts are invalid`);
  }
  const indexedById = new Map(indexedBoxes.map(box => [box.boxIdHex, box]));
  const expectedCurrentIds = indexedBoxes
    .filter(box => box.spentTransactionIdHex === null)
    .map(box => box.boxIdHex)
    .sort();
  if (canonicalJson(currentBoxIdsHex) !== canonicalJson(expectedCurrentIds)) {
    throw new Error(`${label} current UTXO set differs from indexed lineage`);
  }
  const expectedCurrentValue = currentBoxIdsHex.reduce(
    (sum, boxId) => sum + BigInt(indexedById.get(boxId)!.valueNanoErg),
    0n,
  ).toString();
  if (currentValueNanoErg !== expectedCurrentValue) {
    throw new Error(`${label} current value differs from its current UTXOs`);
  }
  const expectedClassification = currentBoxIdsHex.length > 0
    ? 'funded'
    : indexedBoxes.length > 0
      ? 'drained'
      : 'never-funded';
  if (
    instance.classification === 'unresolved'
      ? indexedBoxes.length !== 0 || currentBoxIdsHex.length !== 0
      : instance.classification !== expectedClassification
  ) {
    throw new Error(`${label} classification is inconsistent`);
  }
  validateBlockerCodes(instance.blockerCodes, `${label} blockers`);
  const instanceBlockers = instance.blockerCodes as readonly ErgoLegacyRouteInventoryBlockerV4[];
  const observationBlockers = new Set<ErgoLegacyRouteInventoryBlockerV4>([
    'primary-observation-failed',
    'witness-observation-failed',
    'source-disagreement',
    'singleton-identity-required',
  ]);
  if (instanceBlockers.some(blocker => !observationBlockers.has(blocker))) {
    throw new Error(`${label} contains a non-instance blocker`);
  }
  if (instance.classification === 'unresolved') {
    if (instanceBlockers.length === 0) {
      throw new Error(`${label} unresolved classification requires an observation blocker`);
    }
    if (
      instanceBlockers.includes('source-disagreement')
      && instanceBlockers.length !== 1
    ) {
      throw new Error(`${label} source disagreement cannot be combined with source failures`);
    }
    if (
      instanceBlockers.includes('singleton-identity-required')
      && !instanceBlockers.includes('primary-observation-failed')
      && !instanceBlockers.includes('witness-observation-failed')
    ) {
      throw new Error(`${label} singleton blocker requires a source observation failure`);
    }
  } else if (instanceBlockers.length !== 0) {
    throw new Error(`${label} resolved classification cannot retain observation blockers`);
  }
  const digest = exactFixedHex(
    instance.inventoryEvidenceDigestHex,
    32,
    `${label} evidence digest`,
  );
  const binding = { ...instance };
  delete binding.inventoryEvidenceDigestHex;
  if (sha256CanonicalJson(binding, INSTANCE_DIGEST_DOMAIN) !== digest) {
    throw new Error(`${label} evidence digest is invalid`);
  }
  return value as ErgoLegacyRouteInstanceInventoryV4;
}

function validateSerializedInventoryBox(
  value: unknown,
  parentLabel: string,
  boxIndex: number,
  expectedErgoTreeHex: string,
): ErgoLegacyInventoryBoxV4 {
  const label = `${parentLabel} indexed box ${boxIndex}`;
  const box = assertExactDataObject(value, [
    'boxIdHex',
    'transactionIdHex',
    'outputIndex',
    'creationHeight',
    'valueNanoErg',
    'ergoTreeHex',
    'assets',
    'additionalRegistersDigestHex',
    'spentTransactionIdHex',
    'sigmaSerializedSha256Hex',
    'currentUtxoBinaryMatched',
  ], label);
  exactFixedHex(box.boxIdHex, 32, `${label} ID`);
  exactFixedHex(box.transactionIdHex, 32, `${label} transaction ID`);
  nonnegativeSafeInteger(box.outputIndex, `${label} output index`);
  nonnegativeSafeInteger(box.creationHeight, `${label} creation height`);
  nonnegativeBigIntString(box.valueNanoErg, `${label} value`);
  if (
    exactVariableHex(box.ergoTreeHex, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`)
      !== expectedErgoTreeHex
  ) {
    throw new Error(`${label} uses another ErgoTree`);
  }
  if (!Array.isArray(box.assets)) throw new Error(`${label} assets must be an array`);
  const tokenIds: string[] = [];
  for (const [index, assetValue] of box.assets.entries()) {
    const asset = assertExactDataObject(
      assetValue,
      ['tokenIdHex', 'amount'],
      `${label} asset ${index}`,
    );
    tokenIds.push(exactFixedHex(asset.tokenIdHex, 32, `${label} asset ${index} token ID`));
    if (nonnegativeBigIntString(asset.amount, `${label} asset ${index} amount`) === '0') {
      throw new Error(`${label} asset ${index} amount must be positive`);
    }
  }
  assertUnique(tokenIds, `${label} asset`);
  exactFixedHex(
    box.additionalRegistersDigestHex,
    32,
    `${label} additional-register digest`,
  );
  validateNullableFixedHex(box.spentTransactionIdHex, 32, `${label} spent transaction ID`);
  exactFixedHex(
    box.sigmaSerializedSha256Hex,
    32,
    `${label} serialized-box digest`,
  );
  if (typeof box.currentUtxoBinaryMatched !== 'boolean') {
    throw new Error(`${label} current-binary flag must be boolean`);
  }
  if (
    box.spentTransactionIdHex === null
      ? box.currentUtxoBinaryMatched !== true
      : box.currentUtxoBinaryMatched !== false
  ) {
    throw new Error(`${label} current-binary flag differs from spent status`);
  }
  return value as ErgoLegacyInventoryBoxV4;
}

function validateSerializedHistoricalDupCoverage(
  value: unknown,
  index: number,
): ErgoHistoricalDuplicatePreventionCoverageV4 {
  const label = `serialized historical DUP coverage ${index}`;
  const coverage = assertExactDataObject(value, [
    'routeId',
    'sourceSurface',
    'instanceId',
    'address',
    'singletonTokenIdHex',
    'genesisBoxIdHex',
    'inventoryClassification',
    'status',
    'declaredKeyIntent',
    'observedKeySemantics',
    'packetDigestHex',
    'observationDigestHex',
    'rawKeyCount',
    'tipBoxIdHex',
    'exactInventoryJoinEstablished',
    'canonicalEventMappingEstablished',
    'sourceAdmissionEvidenceJoined',
    'canonicalSourceFinalityEstablished',
    'replayGenesisEligible',
    'fundsAuthorityEstablished',
    'blockerCodes',
  ], label);
  requireNonemptyString(coverage.routeId, `${label} route ID`);
  requireNonemptyString(coverage.sourceSurface, `${label} source surface`);
  requireNonemptyString(coverage.instanceId, `${label} instance ID`);
  requireNonemptyString(coverage.address, `${label} address`);
  validateNullableFixedHex(coverage.singletonTokenIdHex, 32, `${label} singleton token ID`);
  validateNullableFixedHex(coverage.genesisBoxIdHex, 32, `${label} genesis box ID`);
  assertInventoryClassification(
    coverage.inventoryClassification,
    `${label} inventory classification`,
  );
  if (!HISTORICAL_DUP_COVERAGE_STATUSES.has(String(coverage.status))) {
    throw new Error(`${label} status is invalid`);
  }
  if (
    coverage.declaredKeyIntent !== 'sidechain-burn-transaction-hash'
    && coverage.declaredKeyIntent !== 'event-level-burn-id'
  ) {
    throw new Error(`${label} declared key intent is invalid`);
  }
  if (coverage.observedKeySemantics !== HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4) {
    throw new Error(`${label} observed key semantics are invalid`);
  }
  validateNullableFixedHex(coverage.packetDigestHex, 32, `${label} packet digest`);
  validateNullableFixedHex(coverage.observationDigestHex, 32, `${label} observation digest`);
  nonnegativeSafeInteger(coverage.rawKeyCount, `${label} raw-key count`);
  validateNullableFixedHex(coverage.tipBoxIdHex, 32, `${label} tip box ID`);
  if (
    typeof coverage.exactInventoryJoinEstablished !== 'boolean'
    || typeof coverage.canonicalEventMappingEstablished !== 'boolean'
    || typeof coverage.sourceAdmissionEvidenceJoined !== 'boolean'
    || coverage.canonicalSourceFinalityEstablished !== false
    || coverage.replayGenesisEligible !== false
    || coverage.fundsAuthorityEstablished !== false
    || (coverage.packetDigestHex === null) !== (coverage.observationDigestHex === null)
    || coverage.exactInventoryJoinEstablished !== (coverage.packetDigestHex !== null)
  ) {
    throw new Error(`${label} authority or packet boundary is invalid`);
  }
  validateBlockerCodes(coverage.blockerCodes, `${label} blockers`);
  const packetSupplied = coverage.packetDigestHex !== null;
  let expectedStatus: ErgoHistoricalDuplicatePreventionStatusV4;
  let expectedBlockers: readonly ErgoLegacyRouteInventoryBlockerV4[];
  if (!packetSupplied) {
    expectedStatus = coverage.inventoryClassification === 'unresolved'
      ? 'inventory-unresolved'
      : coverage.inventoryClassification === 'drained'
        ? 'inventory-drained'
        : 'missing';
    expectedBlockers = sortedUnique([
      'historical-dup-lineage-missing' as const,
      ...(coverage.inventoryClassification === 'unresolved'
        ? ['historical-dup-inventory-unresolved' as const]
        : []),
      ...(coverage.inventoryClassification === 'drained'
        ? ['historical-dup-drained-reconciliation-required' as const]
        : []),
    ]);
    if (
      coverage.rawKeyCount !== 0
      || coverage.tipBoxIdHex !== null
      || coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    ) {
      throw new Error(`${label} missing packet cannot carry lineage or admission facts`);
    }
  } else if (coverage.inventoryClassification === 'never-funded') {
    expectedStatus = 'never-funded';
    expectedBlockers = [];
    if (
      coverage.rawKeyCount !== 0
      || coverage.tipBoxIdHex !== null
      || coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    ) {
      throw new Error(`${label} never-funded lineage cannot carry replay or admission facts`);
    }
  } else if (coverage.rawKeyCount === 0) {
    expectedStatus = 'opaque-lineage-zero-keys';
    expectedBlockers = [];
    if (
      coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    ) {
      throw new Error(`${label} zero-key lineage cannot claim event mapping or admission`);
    }
  } else if (
    coverage.canonicalEventMappingEstablished
    && coverage.sourceAdmissionEvidenceJoined
  ) {
    expectedStatus = 'authenticated-v2-lineage-and-replay-import-agree';
    expectedBlockers = [];
  } else {
    if (
      coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    ) {
      throw new Error(`${label} event mapping and source admission must be established together`);
    }
    expectedStatus = coverage.declaredKeyIntent
      === 'sidechain-burn-transaction-hash'
      ? 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required'
      : 'opaque-event-id-intent-mapping-and-source-admission-required';
    expectedBlockers = [
      'historical-dup-event-mapping-required',
      'historical-dup-source-admission-required',
    ];
  }
  if (
    coverage.status !== expectedStatus
    || canonicalJson(coverage.blockerCodes) !== canonicalJson(expectedBlockers)
  ) {
    throw new Error(`${label} status or blockers differ from its serialized facts`);
  }
  return value as ErgoHistoricalDuplicatePreventionCoverageV4;
}

function validateSerializedAuthenticatedV2Binding(
  value: unknown,
): ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet['authenticatedV2'] {
  const binding = assertExactDataObject(value, [
    'reconstructionSupplied',
    'reconstructionDigests',
    'currentInputs',
    'replayImportPacketDigestHex',
    'canonicalReplayKeyCount',
    'allHistoricalReplayLineagesImported',
  ], 'serialized authenticated V2 inventory binding');
  if (
    typeof binding.reconstructionSupplied !== 'boolean'
    || binding.allHistoricalReplayLineagesImported !== false
  ) {
    throw new Error('serialized authenticated V2 inventory boundary is invalid');
  }
  if (binding.reconstructionDigests !== null) {
    const digests = assertExactDataObject(binding.reconstructionDigests, [
      'tracker',
      'duplicatePrevention',
      'vault',
    ], 'serialized authenticated V2 reconstruction digests');
    exactFixedHex(digests.tracker, 32, 'serialized authenticated V2 tracker digest');
    exactFixedHex(
      digests.duplicatePrevention,
      32,
      'serialized authenticated V2 DUP digest',
    );
    exactFixedHex(digests.vault, 32, 'serialized authenticated V2 vault digest');
  }
  if (binding.currentInputs !== null) {
    const inputs = assertExactDataObject(binding.currentInputs, [
      'trackerBoxIdHex',
      'duplicatePreventionBoxIdHex',
      'vaultBoxIdsHex',
    ], 'serialized authenticated V2 current inputs');
    exactFixedHex(inputs.trackerBoxIdHex, 32, 'serialized authenticated V2 tracker box ID');
    exactFixedHex(
      inputs.duplicatePreventionBoxIdHex,
      32,
      'serialized authenticated V2 DUP box ID',
    );
    if (!Array.isArray(inputs.vaultBoxIdsHex)) {
      throw new Error('serialized authenticated V2 vault box IDs must be an array');
    }
    assertSortedUnique(inputs.vaultBoxIdsHex.map((boxId, index) =>
      exactFixedHex(boxId, 32, `serialized authenticated V2 vault box ID ${index}`)
    ), 'serialized authenticated V2 vault box IDs');
  }
  validateNullableFixedHex(
    binding.replayImportPacketDigestHex,
    32,
    'serialized authenticated V2 replay-import packet digest',
  );
  nonnegativeSafeInteger(
    binding.canonicalReplayKeyCount,
    'serialized authenticated V2 canonical replay-key count',
  );
  if (
    binding.reconstructionSupplied
      !== (binding.reconstructionDigests !== null && binding.currentInputs !== null)
  ) {
    throw new Error('serialized authenticated V2 reconstruction binding is inconsistent');
  }
  return value as ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet[
    'authenticatedV2'
  ];
}

function validateSerializedRouteBlockerDerivation(
  routes: readonly ErgoLegacyRouteInventoryV4[],
  coverage: readonly ErgoHistoricalDuplicatePreventionCoverageV4[],
  authenticatedV2: ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet[
    'authenticatedV2'
  ],
): void {
  const historicalByRoute = new Map<string, ErgoLegacyRouteInventoryBlockerV4[]>();
  for (const entry of coverage) {
    historicalByRoute.set(entry.routeId, [
      ...(historicalByRoute.get(entry.routeId) ?? []),
      ...entry.blockerCodes,
    ]);
    if (
      entry.canonicalEventMappingEstablished
      && (
        entry.routeId !== AUTHENTICATED_V2_DUP_ROUTE_ID
        || !authenticatedV2.reconstructionSupplied
        || authenticatedV2.replayImportPacketDigestHex === null
      )
    ) {
      throw new Error('serialized historical DUP admission lacks authenticated V2 replay-import binding');
    }
  }
  const authenticatedRouteIds = new Set([
    AUTHENTICATED_V2_TRACKER_ROUTE_ID,
    AUTHENTICATED_V2_DUP_ROUTE_ID,
    AUTHENTICATED_V2_VAULT_ROUTE_ID,
  ]);
  for (const route of routes) {
    const required = sortedUnique([
      ...route.instances.flatMap(instance => instance.blockerCodes),
      ...(route.classification === 'funded'
        ? ['current-funds-present' as const]
        : []),
      'retirement-evidence-required' as const,
      ...(historicalByRoute.get(route.routeId) ?? []),
      ...(!authenticatedV2.reconstructionSupplied
        && authenticatedRouteIds.has(route.routeId)
        ? ['authenticated-v2-reconstruction-missing' as const]
        : []),
    ]);
    const actual = route.blockerCodes;
    if (required.some(blocker => !actual.includes(blocker))) {
      throw new Error(`serialized inventory route ${route.routeId} omits a derived blocker`);
    }
    if (!authenticatedV2.reconstructionSupplied) {
      if (canonicalJson(actual) !== canonicalJson(required)) {
        throw new Error(`serialized inventory route ${route.routeId} has blockers not derived by the absent authenticated V2 reconstruction`);
      }
      continue;
    }
    const allowed = new Set<ErgoLegacyRouteInventoryBlockerV4>(required);
    if (route.routeId === AUTHENTICATED_V2_VAULT_ROUTE_ID) {
      allowed.add('authenticated-v2-root-provenance-unresolved');
    }
    if (
      route.routeId === AUTHENTICATED_V2_DUP_ROUTE_ID
      && authenticatedV2.replayImportPacketDigestHex === null
    ) {
      allowed.add('authenticated-v2-replay-import-missing');
    }
    if (actual.some(blocker => !allowed.has(blocker))) {
      throw new Error(`serialized inventory route ${route.routeId} contains a blocker not derived from its packet`);
    }
  }
}

const HISTORICAL_DUP_COVERAGE_STATUSES = new Set<string>([
  'missing',
  'inventory-unresolved',
  'inventory-drained',
  'never-funded',
  'opaque-lineage-zero-keys',
  'opaque-transaction-hash-intent-event-mapping-and-source-admission-required',
  'opaque-event-id-intent-mapping-and-source-admission-required',
  'authenticated-v2-lineage-and-replay-import-agree',
]);

const INVENTORY_BLOCKER_CODES = new Set<string>([
  'primary-observation-failed',
  'witness-observation-failed',
  'source-disagreement',
  'current-funds-present',
  'authenticated-v2-reconstruction-missing',
  'authenticated-v2-profile-mismatch',
  'authenticated-v2-root-provenance-unresolved',
  'authenticated-v2-replay-import-missing',
  'historical-dup-lineage-missing',
  'historical-dup-event-mapping-required',
  'historical-dup-source-admission-required',
  'historical-dup-inventory-unresolved',
  'historical-dup-drained-reconciliation-required',
  'singleton-identity-required',
  'retirement-evidence-required',
]);

function validateInventorySnapshot(value: unknown, label: string): void {
  const snapshot = assertExactDataObject(value, [
    'indexedHeight',
    'fullHeight',
    'bestHeader',
  ], label);
  const indexedHeight = nonnegativeSafeInteger(snapshot.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(snapshot.fullHeight, `${label} full height`);
  const header = assertExactDataObject(snapshot.bestHeader, [
    'idHex',
    'parentIdHex',
    'height',
    'extensionRootHex',
  ], `${label} best header`);
  exactFixedHex(header.idHex, 32, `${label} best-header ID`);
  exactFixedHex(header.parentIdHex, 32, `${label} best-header parent ID`);
  exactFixedHex(header.extensionRootHex, 32, `${label} extension root`);
  const headerHeight = nonnegativeSafeInteger(header.height, `${label} best-header height`);
  if (indexedHeight > fullHeight || headerHeight !== fullHeight) {
    throw new Error(`${label} heights are inconsistent`);
  }
}

function validateSourceDigestPair(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must contain two digests`);
  }
  const digests = value.map((digest, index) =>
    exactFixedHex(digest, 32, `${label} ${index}`)
  );
  assertSortedUnique(digests, label);
}

function assertInventoryClassification(value: unknown, label: string): asserts value is ErgoLegacyRouteInventoryClassificationV4 {
  if (
    value !== 'funded'
    && value !== 'drained'
    && value !== 'never-funded'
    && value !== 'unresolved'
  ) {
    throw new Error(`${label} is invalid`);
  }
}

function validateBlockerCodes(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some(code =>
    typeof code !== 'string' || !INVENTORY_BLOCKER_CODES.has(code)
  )) {
    throw new Error(`${label} are invalid`);
  }
  assertSortedUnique(value as string[], label);
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty canonical string`);
  }
  return value;
}

function exactFixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = fixedHex(value, bytes, label);
  if (value !== normalized) throw new Error(`${label} must be canonical lowercase hex`);
  return normalized;
}

function exactVariableHex(value: unknown, maxBytes: number, label: string): string {
  const normalized = variableHex(value, maxBytes, label);
  if (value !== normalized) throw new Error(`${label} must be canonical lowercase hex`);
  return normalized;
}

function validateNullableFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): void {
  if (value !== null) exactFixedHex(value, bytes, label);
}

function nonnegativeBigIntString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative integer string`);
  }
  return value;
}

function assertSortedUnique(values: readonly string[], label: string): void {
  if (
    new Set(values).size !== values.length
    || values.some((value, index) => index > 0 && values[index - 1]!.localeCompare(value) >= 0)
  ) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

async function observeInstancePair(
  instance: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['instances'][number],
  routeClass: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['routeClass'],
  primarySource: AuthenticatedV2VaultChainSource,
  witnessSource: AuthenticatedV2VaultChainSource,
  snapshotHeight: number,
): Promise<ErgoLegacyRouteInstanceInventoryV4> {
  const [primary, witness] = await Promise.allSettled([
    observeInstance(instance, routeClass, primarySource, snapshotHeight),
    observeInstance(instance, routeClass, witnessSource, snapshotHeight),
  ]);
  const blockers: ErgoLegacyRouteInventoryBlockerV4[] = [];
  if (primary.status === 'rejected') {
    blockers.push('primary-observation-failed');
    if (
      primary.reason instanceof InstanceObservationError
      && primary.reason.code === 'singleton-identity-required'
    ) {
      blockers.push('singleton-identity-required');
    }
  }
  if (witness.status === 'rejected') {
    blockers.push('witness-observation-failed');
    if (
      witness.reason instanceof InstanceObservationError
      && witness.reason.code === 'singleton-identity-required'
    ) {
      blockers.push('singleton-identity-required');
    }
  }
  if (blockers.length > 0) {
    return unresolvedInstance(instance, blockers);
  }
  if (primary.status !== 'fulfilled' || witness.status !== 'fulfilled') {
    throw new Error('Ergo legacy instance observation result is inconsistent');
  }
  if (canonicalJson(primary.value) !== canonicalJson(witness.value)) {
    return unresolvedInstance(instance, ['source-disagreement']);
  }
  const binding = {
    instanceId: instance.instanceId,
    address: instance.address,
    ergoTreeHex: instance.ergoTreeHex,
    ergoTreeSha256Hex: instance.ergoTreeSha256Hex,
    singletonTokenIdHex: instance.singletonTokenIdHex,
    genesisBoxIdHex: instance.genesisBoxIdHex,
    classification: primary.value.classification,
    indexedHistoryBoxCount: primary.value.indexedBoxes.length,
    currentUtxoCount: primary.value.currentBoxIdsHex.length,
    currentValueNanoErg: primary.value.currentValueNanoErg,
    indexedBoxes: primary.value.indexedBoxes,
    currentBoxIdsHex: primary.value.currentBoxIdsHex,
    blockerCodes: [] as readonly ErgoLegacyRouteInventoryBlockerV4[],
  };
  return deepFreeze({
    ...binding,
    inventoryEvidenceDigestHex: sha256CanonicalJson(
      binding,
      INSTANCE_DIGEST_DOMAIN,
    ),
  });
}

async function observeInstance(
  instance: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['instances'][number],
  routeClass: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['routeClass'],
  source: AuthenticatedV2VaultChainSource,
  snapshotHeight: number,
): Promise<InstanceSourceObservation> {
  let indexedRaw: unknown[];
  let currentRaw: unknown[];
  try {
    [indexedRaw, currentRaw] = await Promise.all([
      source.getIndexedBoxesByAddress(instance.address),
      source.getUnspentBoxesByAddress(instance.address),
    ]);
  } catch {
    throw new InstanceObservationError('query-failed');
  }
  if (
    !Array.isArray(indexedRaw)
    || !Array.isArray(currentRaw)
    || indexedRaw.length > MAX_BOXES_PER_INSTANCE
    || currentRaw.length > MAX_BOXES_PER_INSTANCE
  ) {
    throw new InstanceObservationError('invalid-observation');
  }
  let indexedBoxes: ErgoLegacyInventoryBoxV4[];
  let currentBoxes: ErgoLegacyInventoryBoxV4[];
  try {
    indexedBoxes = await Promise.all(indexedRaw.map((value, index) =>
      normalizeBox(
        value,
        instance.ergoTreeHex,
        snapshotHeight,
        true,
        null,
        `indexed instance ${instance.instanceId} box ${index}`,
      )
    ));
    currentBoxes = await Promise.all(currentRaw.map(async (value, index) => {
      const raw = record(
        value,
        `current instance ${instance.instanceId} box ${index}`,
      );
      const boxIdHex = fixedHex(
        raw.boxId,
        32,
        `current instance ${instance.instanceId} box ${index} ID`,
      );
      const binary = await source.getBoxBinaryByIdOrNull(boxIdHex);
      if (binary === null) {
        throw new Error('current box canonical binary is unavailable');
      }
      return normalizeBox(
        raw,
        instance.ergoTreeHex,
        snapshotHeight,
        false,
        binary,
        `current instance ${instance.instanceId} box ${index}`,
      );
    }));
  } catch {
    throw new InstanceObservationError('invalid-observation');
  }
  if (instance.singletonTokenIdHex !== null) {
    indexedBoxes = indexedBoxes.filter(box =>
      hasExactSingletonToken(box, instance.singletonTokenIdHex!)
    );
    currentBoxes = currentBoxes.filter(box =>
      hasExactSingletonToken(box, instance.singletonTokenIdHex!)
    );
  } else if (
    routeUsesSingletonIdentity(routeClass)
    && (indexedBoxes.length > 0 || currentBoxes.length > 0)
  ) {
    throw new InstanceObservationError('singleton-identity-required');
  }
  indexedBoxes.sort((left, right) => left.boxIdHex.localeCompare(right.boxIdHex));
  currentBoxes.sort((left, right) => left.boxIdHex.localeCompare(right.boxIdHex));
  assertUnique(
    indexedBoxes.map(box => box.boxIdHex),
    `indexed instance ${instance.instanceId} box`,
  );
  assertUnique(
    currentBoxes.map(box => box.boxIdHex),
    `current instance ${instance.instanceId} box`,
  );
  const indexedById = new Map(
    indexedBoxes.map(box => [box.boxIdHex, box] as const),
  );
  const expectedCurrentIds = indexedBoxes
    .filter(box => box.spentTransactionIdHex === null)
    .map(box => box.boxIdHex)
    .sort();
  const currentBoxIdsHex = currentBoxes.map(box => box.boxIdHex);
  if (canonicalJson(expectedCurrentIds) !== canonicalJson(currentBoxIdsHex)) {
    throw new InstanceObservationError('invalid-observation');
  }
  for (const current of currentBoxes) {
    const indexed = indexedById.get(current.boxIdHex);
    if (
      indexed === undefined
      || canonicalJson({
        ...indexed,
        spentTransactionIdHex: null,
        currentUtxoBinaryMatched: true,
      }) !== canonicalJson(current)
    ) {
      throw new InstanceObservationError('invalid-observation');
    }
    indexedById.set(current.boxIdHex, current);
  }
  const currentValueNanoErg = currentBoxes
    .reduce((sum, box) => sum + BigInt(box.valueNanoErg), 0n)
    .toString();
  return deepFreeze({
    classification: currentBoxes.length > 0
      ? 'funded' as const
      : indexedBoxes.length > 0
        ? 'drained' as const
        : 'never-funded' as const,
    indexedBoxes: [...indexedById.values()].sort((left, right) =>
      left.boxIdHex.localeCompare(right.boxIdHex)
    ),
    currentBoxIdsHex,
    currentValueNanoErg,
  });
}

async function normalizeBox(
  value: unknown,
  expectedErgoTreeHex: string,
  snapshotHeight: number,
  indexed: boolean,
  binaryValue: unknown | null,
  label: string,
): Promise<ErgoLegacyInventoryBoxV4> {
  const raw = record(value, label);
  const boxIdHex = fixedHex(raw.boxId, 32, `${label} box ID`);
  const transactionIdHex = fixedHex(
    raw.transactionId,
    32,
    `${label} transaction ID`,
  );
  const outputIndex = nonnegativeSafeInteger(raw.index, `${label} output index`);
  const creationHeight = nonnegativeSafeInteger(
    raw.creationHeight,
    `${label} creation height`,
  );
  if (creationHeight > snapshotHeight) {
    throw new Error(`${label} was created after the stable snapshot`);
  }
  const valueNanoErg = positiveBigInt(raw.value, `${label} value`).toString();
  const ergoTreeHex = variableHex(
    raw.ergoTree,
    MAX_ERGO_TREE_BYTES,
    `${label} ErgoTree`,
  );
  if (ergoTreeHex !== expectedErgoTreeHex) {
    throw new Error(`${label} uses another ErgoTree`);
  }
  const assets = normalizeAssets(raw.assets, `${label} assets`);
  const additionalRegisters = normalizeRegisters(
    raw.additionalRegisters,
    `${label} additional registers`,
  );
  if (indexed && !Object.hasOwn(raw, 'spentTransactionId')) {
    throw new Error(`${label} lacks indexed spend state`);
  }
  const spentTransactionIdHex =
    raw.spentTransactionId === null || raw.spentTransactionId === undefined
      ? null
      : fixedHex(raw.spentTransactionId, 32, `${label} spending transaction ID`);
  if (!indexed && spentTransactionIdHex !== null) {
    throw new Error(`${label} is returned as current but is marked spent`);
  }

  const eip12 = {
    boxId: boxIdHex,
    value: valueNanoErg,
    ergoTree: ergoTreeHex,
    assets: assets.map(asset => ({
      tokenId: asset.tokenIdHex,
      amount: asset.amount,
    })),
    additionalRegisters,
    creationHeight,
    transactionId: transactionIdHex,
    index: outputIndex,
  };
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(eip12));
  } catch (error: any) {
    throw new Error(`${label} is not a canonical EIP-12 box: ${error?.message ?? String(error)}`);
  }
  let sigmaSerializedHex: string;
  try {
    sigmaSerializedHex = Buffer.from(
      parsed.sigma_serialize_bytes(),
    ).toString('hex');
    if (sigmaSerializedHex.length > MAX_SERIALIZED_BOX_BYTES * 2) {
      throw new Error(`${label} canonical binary exceeds the size bound`);
    }
    const canonical = record(parsed.to_js_eip12(), `${label} canonical box`);
    if (fixedHex(canonical.boxId, 32, `${label} canonical box ID`) !== boxIdHex) {
      throw new Error(`${label} box ID is not derived from its canonical payload`);
    }
  } finally {
    parsed.free?.();
  }
  let currentUtxoBinaryMatched = false;
  if (binaryValue !== null) {
    const binary = record(binaryValue, `${label} canonical binary response`);
    const observedHex = variableHex(
      binary.bytes,
      MAX_SERIALIZED_BOX_BYTES,
      `${label} canonical binary`,
    );
    if (observedHex !== sigmaSerializedHex) {
      throw new Error(`${label} JSON and canonical binary disagree`);
    }
    currentUtxoBinaryMatched = true;
  }
  return deepFreeze({
    boxIdHex,
    transactionIdHex,
    outputIndex,
    creationHeight,
    valueNanoErg,
    ergoTreeHex,
    assets,
    additionalRegistersDigestHex: sha256CanonicalJson(
      additionalRegisters,
      ADDITIONAL_REGISTERS_DIGEST_DOMAIN,
    ),
    spentTransactionIdHex,
    sigmaSerializedSha256Hex: sha256Bytes(
      Buffer.from(sigmaSerializedHex, 'hex'),
    ),
    currentUtxoBinaryMatched,
  });
}

function bindAuthenticatedV2(
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routes: readonly ErgoLegacyRouteInventoryV4[],
  snapshot: ErgoLegacyInventorySnapshotV4,
  sourceIds: readonly [string, string],
  reconstruction: Readonly<AuthenticatedV2ReadOnlyReconstruction> | null,
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  > | null,
): {
  readonly packetBinding:
    ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet[
      'authenticatedV2'
    ];
  readonly routeBlockers: ReadonlyMap<
    string,
    readonly ErgoLegacyRouteInventoryBlockerV4[]
  >;
} {
  const routeBlockers = new Map<
    string,
    ErgoLegacyRouteInventoryBlockerV4[]
  >();
  const trackedRouteIds = [
    AUTHENTICATED_V2_TRACKER_ROUTE_ID,
    AUTHENTICATED_V2_DUP_ROUTE_ID,
    AUTHENTICATED_V2_VAULT_ROUTE_ID,
  ] as const;
  if (reconstruction === null) {
    if (replayImport !== null) {
      throw new Error('authenticated V2 replay import requires its read-only reconstruction');
    }
    for (const routeId of trackedRouteIds) {
      routeBlockers.set(routeId, [
        'authenticated-v2-reconstruction-missing',
      ]);
    }
    return {
      packetBinding: {
        reconstructionSupplied: false,
        reconstructionDigests: null,
        currentInputs: null,
        replayImportPacketDigestHex: null,
        canonicalReplayKeyCount: 0,
        allHistoricalReplayLineagesImported: false,
      },
      routeBlockers,
    };
  }
  assertAuthenticatedV2ReadOnlyReconstructionProvenance(reconstruction);
  assertAuthenticatedV2Bindings(
    profile,
    routes,
    snapshot,
    sourceIds,
    reconstruction,
  );
  if (reconstruction.vault.unresolvedRootProvenanceBoxIdsHex.length > 0) {
    routeBlockers.set(
      AUTHENTICATED_V2_VAULT_ROUTE_ID,
      ['authenticated-v2-root-provenance-unresolved'],
    );
  }
  let replayImportPacketDigestHex: string | null = null;
  let canonicalReplayKeyCount = 0;
  if (replayImport === null) {
    if (reconstruction.duplicatePrevention.historyKeys.length > 0) {
      routeBlockers.set(
        AUTHENTICATED_V2_DUP_ROUTE_ID,
        [...sortedUnique([
          ...(routeBlockers.get(
            AUTHENTICATED_V2_DUP_ROUTE_ID,
          ) ?? []),
          'authenticated-v2-replay-import-missing',
        ])],
      );
    }
  } else {
    assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
      replayImport,
    );
    if (
      replayImport.source.authenticatedV2ReconstructionDigestHex
        !== reconstruction.duplicatePrevention.observationDigestHex
      || replayImport.source.authenticatedV2DuplicatePreventionNftIdHex
        !== reconstruction.duplicatePrevention.duplicatePreventionNftIdHex
      || replayImport.source.authenticatedV2DuplicatePreventionErgoTreeHex
        !== reconstruction.duplicatePrevention.duplicatePreventionErgoTreeHex
      || replayImport.source.authenticatedV2GenesisBoxIdHex
        !== reconstruction.duplicatePrevention.genesisBoxIdHex
      || replayImport.source.authenticatedV2TipBoxIdHex
        !== reconstruction.duplicatePrevention.tipBoxIdHex
      || replayImport.source.authenticatedV2TipDigestHex
        !== reconstruction.duplicatePrevention.tipDigestHex
      || replayImport.imports.length
        !== reconstruction.duplicatePrevention.historyKeys.length
    ) {
      throw new Error('authenticated V2 replay import differs from the read-only reconstruction');
    }
    replayImportPacketDigestHex = replayImport.packetDigestHex;
    canonicalReplayKeyCount = replayImport.imports.length;
  }
  return {
    packetBinding: {
      reconstructionSupplied: true,
      reconstructionDigests: {
        tracker: reconstruction.reconstructionDigests.tracker,
        duplicatePrevention:
          reconstruction.reconstructionDigests.duplicatePrevention,
        vault: reconstruction.reconstructionDigests.vault,
      },
      currentInputs: {
        trackerBoxIdHex: reconstruction.tracker.tipBoxId,
        duplicatePreventionBoxIdHex:
          reconstruction.duplicatePrevention.tipBoxIdHex,
        vaultBoxIdsHex: [
          ...reconstruction.vault.currentUnspentBoxIdsHex,
        ].sort(),
      },
      replayImportPacketDigestHex,
      canonicalReplayKeyCount,
      allHistoricalReplayLineagesImported: false,
    },
    routeBlockers,
  };
}

function bindHistoricalDuplicatePrevention(
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routes: readonly ErgoLegacyRouteInventoryV4[],
  snapshot: ErgoLegacyInventorySnapshotV4,
  sourceIdDigestsHex: readonly [string, string],
  supplied: readonly Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4
  >[],
  authenticatedV2: Readonly<AuthenticatedV2ReadOnlyReconstruction> | null,
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  > | null,
): {
  readonly coverage: readonly ErgoHistoricalDuplicatePreventionCoverageV4[];
  readonly routeBlockers: ReadonlyMap<
    string,
    readonly ErgoLegacyRouteInventoryBlockerV4[]
  >;
} {
  if (!Array.isArray(supplied)) {
    throw new Error('historical DUP lineages must be an array');
  }
  const profiled = profile.routes
    .filter(route => route.routeClass === 'duplicate-prevention')
    .flatMap(route => route.instances.map(instance => ({ route, instance })))
    .sort((left, right) =>
      `${left.route.routeId}/${left.instance.instanceId}`.localeCompare(
        `${right.route.routeId}/${right.instance.instanceId}`,
      )
    );
  const expectedByKey = new Map(profiled.map(entry => [
    historicalDupKey(entry.route.routeId, entry.instance.instanceId),
    entry,
  ] as const));
  const packetByKey = new Map<
    string,
    Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>
  >();
  for (const packet of supplied) {
    assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance(packet);
    const key = historicalDupKey(packet.routeId, packet.instanceId);
    const expected = expectedByKey.get(key);
    if (expected === undefined) {
      throw new Error(`historical DUP lineage ${key} is not an exact profiled instance`);
    }
    if (packetByKey.has(key)) {
      throw new Error(`historical DUP lineage ${key} is duplicated`);
    }
    assertHistoricalDupPacketBinding(
      packet,
      profile,
      expected.route,
      expected.instance,
      snapshot,
      sourceIdDigestsHex,
    );
    packetByKey.set(key, packet);
  }

  const inventoryByRoute = new Map(routes.map(route => [route.routeId, route]));
  const routeBlockers = new Map<
    string,
    readonly ErgoLegacyRouteInventoryBlockerV4[]
  >();
  const coverage = profiled.map(({ route, instance }) => {
    const inventory = inventoryByRoute.get(route.routeId)?.instances.find(
      candidate => candidate.instanceId === instance.instanceId,
    );
    if (inventory === undefined) {
      throw new Error(`historical DUP inventory lacks ${route.routeId}/${instance.instanceId}`);
    }
    const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(
      candidate => candidate.routeId === route.routeId,
    );
    if (descriptor === undefined || descriptor.sourceSurface !== route.sourceSurface) {
      throw new Error(`historical DUP route ${route.routeId} has no exact family descriptor`);
    }
    const packet = packetByKey.get(
      historicalDupKey(route.routeId, instance.instanceId),
    ) ?? null;
    if (packet === null) {
      const blockerCodes: ErgoLegacyRouteInventoryBlockerV4[] = [
        'historical-dup-lineage-missing',
      ];
      let status: ErgoHistoricalDuplicatePreventionStatusV4 = 'missing';
      if (inventory.classification === 'unresolved') {
        status = 'inventory-unresolved';
        blockerCodes.push('historical-dup-inventory-unresolved');
      } else if (inventory.classification === 'drained') {
        status = 'inventory-drained';
        blockerCodes.push('historical-dup-drained-reconciliation-required');
      }
      addRouteBlockers(routeBlockers, route.routeId, blockerCodes);
      return historicalDupCoverage({
        route,
        instance,
        inventory,
        status,
        declaredKeyIntent: descriptor.declaredKeyIntent,
        observedKeySemantics: descriptor.observedKeySemantics,
        packet: null,
        blockerCodes,
        canonicalEventMappingEstablished: false,
        sourceAdmissionEvidenceJoined: false,
      });
    }
    if (
      inventory.classification === 'unresolved'
      || inventory.classification === 'drained'
    ) {
      throw new Error(
        `historical DUP lineage cannot promote ${inventory.classification} inventory ${route.routeId}/${instance.instanceId}`,
      );
    }
    assertHistoricalDupLineageMatchesInventory(packet, inventory);

    let status: ErgoHistoricalDuplicatePreventionStatusV4;
    let canonicalEventMappingEstablished = false;
    let sourceAdmissionEvidenceJoined = false;
    const blockerCodes: ErgoLegacyRouteInventoryBlockerV4[] = [];
    if (packet.classification === 'never-funded') {
      status = 'never-funded';
    } else if (packet.rawInsertedKeysHex.length === 0) {
      status = 'opaque-lineage-zero-keys';
    } else if (
      authenticatedV2 !== null
      && replayImport !== null
      && isExactAuthenticatedV2DupLineage(packet, authenticatedV2)
    ) {
      assertAuthenticatedV2HistoricalDupAgreement(
        packet,
        authenticatedV2,
        replayImport,
      );
      status = 'authenticated-v2-lineage-and-replay-import-agree';
      canonicalEventMappingEstablished = true;
      sourceAdmissionEvidenceJoined = true;
    } else if (
      packet.descriptor.declaredKeyIntent
        === 'sidechain-burn-transaction-hash'
    ) {
      status = 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required';
      blockerCodes.push(
        'historical-dup-event-mapping-required',
        'historical-dup-source-admission-required',
      );
    } else {
      status = 'opaque-event-id-intent-mapping-and-source-admission-required';
      blockerCodes.push(
        'historical-dup-event-mapping-required',
        'historical-dup-source-admission-required',
      );
    }
    addRouteBlockers(routeBlockers, route.routeId, blockerCodes);
    return historicalDupCoverage({
      route,
      instance,
      inventory,
      status,
      declaredKeyIntent: packet.descriptor.declaredKeyIntent,
      observedKeySemantics: packet.descriptor.observedKeySemantics,
      packet,
      blockerCodes,
      canonicalEventMappingEstablished,
      sourceAdmissionEvidenceJoined,
    });
  });
  return {
    coverage: deepFreeze(coverage),
    routeBlockers,
  };
}

function assertHistoricalDupPacketBinding(
  packet: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>,
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  route: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number],
  instance: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number]['instances'][number],
  snapshot: ErgoLegacyInventorySnapshotV4,
  sourceIdDigestsHex: readonly [string, string],
): void {
  const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(
    candidate => candidate.routeId === route.routeId,
  );
  if (
    descriptor === undefined
    || packet.profileDigestHex !== profile.profileDigestHex
    || packet.requirementsDigestHex !== profile.requirementsDigestHex
    || packet.networkId !== profile.network.networkId
    || packet.routeId !== route.routeId
    || packet.sourceSurface !== route.sourceSurface
    || packet.instanceId !== instance.instanceId
    || packet.address !== instance.address
    || packet.ergoTreeHex !== instance.ergoTreeHex
    || packet.singletonTokenIdHex !== instance.singletonTokenIdHex
    || packet.genesisBoxIdHex !== instance.genesisBoxIdHex
    || packet.descriptor.routeId !== route.routeId
    || packet.descriptor.sourceSurface !== route.sourceSurface
    || canonicalJson(packet.descriptor) !== canonicalJson(descriptor)
  ) {
    throw new Error('historical DUP lineage differs from its exact profile binding');
  }
  if (canonicalJson(packet.stableSnapshot) !== canonicalJson(snapshot)) {
    throw new Error('historical DUP lineage uses another inventory snapshot');
  }
  const observedSourceIds = [...packet.sourceIdDigestsHex].sort();
  if (canonicalJson(observedSourceIds) !== canonicalJson([...sourceIdDigestsHex])) {
    throw new Error('historical DUP lineage uses another inventory source pair');
  }
}

function assertHistoricalDupLineageMatchesInventory(
  packet: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>,
  inventory: ErgoLegacyRouteInstanceInventoryV4,
): void {
  if (packet.classification === 'never-funded') {
    if (
      inventory.classification !== 'never-funded'
      || inventory.indexedBoxes.length !== 0
      || inventory.currentBoxIdsHex.length !== 0
      || packet.genesisObservedBoxIdHex !== null
      || packet.tipBoxIdHex !== null
      || packet.tipSigmaSerializedHex !== null
      || packet.tipSigmaSerializedSha256Hex !== null
      || packet.lineageBoxes.length !== 0
      || packet.transitions.length !== 0
      || packet.rawInsertedKeysHex.length !== 0
      || packet.tipCounter !== '0'
      || packet.tipDigestHex !== EMPTY_AVL_DIGEST
    ) {
      throw new Error('never-funded historical DUP lineage differs from inventory');
    }
    return;
  }
  if (inventory.classification !== 'funded') {
    throw new Error('reconstructed historical DUP lineage requires funded inventory');
  }
  if (
    packet.genesisObservedBoxIdHex !== packet.genesisBoxIdHex
    || packet.lineageBoxes.length !== inventory.indexedBoxes.length
    || canonicalJson(packet.lineageBoxes.map(box => box.boxIdHex).sort())
      !== canonicalJson(inventory.indexedBoxes.map(box => box.boxIdHex).sort())
    || packet.tipBoxIdHex === null
    || packet.tipSigmaSerializedSha256Hex === null
    || inventory.currentBoxIdsHex.length !== 1
    || inventory.currentBoxIdsHex[0] !== packet.tipBoxIdHex
  ) {
    throw new Error('historical DUP lineage shape differs from inventory');
  }
  const inventoryById = new Map(inventory.indexedBoxes.map(box => [box.boxIdHex, box]));
  for (const lineageBox of packet.lineageBoxes) {
    const observed = inventoryById.get(lineageBox.boxIdHex);
    if (
      observed === undefined
      || observed.transactionIdHex !== lineageBox.transactionIdHex
      || observed.outputIndex !== lineageBox.outputIndex
      || observed.creationHeight !== lineageBox.creationHeight
      || observed.valueNanoErg !== lineageBox.valueNanoErg
      || observed.ergoTreeHex !== lineageBox.ergoTreeHex
      || canonicalJson(observed.assets) !== canonicalJson([{
        tokenIdHex: lineageBox.singletonTokenIdHex,
        amount: '1',
      }])
      || observed.additionalRegistersDigestHex !== sha256CanonicalJson(
        lineageBox.registers,
        ADDITIONAL_REGISTERS_DIGEST_DOMAIN,
      )
      || observed.spentTransactionIdHex !== lineageBox.spentTransactionIdHex
    ) {
      throw new Error(`historical DUP lineage box ${lineageBox.boxIdHex} differs from inventory`);
    }
  }
  const tip = inventoryById.get(packet.tipBoxIdHex);
  if (
    tip === undefined
    || tip.spentTransactionIdHex !== null
    || !tip.currentUtxoBinaryMatched
    || tip.sigmaSerializedSha256Hex !== packet.tipSigmaSerializedSha256Hex
  ) {
    throw new Error('historical DUP lineage tip differs from the exact current binary');
  }
}

function isExactAuthenticatedV2DupLineage(
  packet: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>,
  reconstruction: Readonly<AuthenticatedV2ReadOnlyReconstruction>,
): boolean {
  return packet.routeId === AUTHENTICATED_V2_DUP_ROUTE_ID
    && packet.singletonTokenIdHex
      === reconstruction.duplicatePrevention.duplicatePreventionNftIdHex
    && packet.ergoTreeHex
      === reconstruction.duplicatePrevention.duplicatePreventionErgoTreeHex
    && packet.genesisBoxIdHex
      === reconstruction.duplicatePrevention.genesisBoxIdHex;
}

function assertAuthenticatedV2HistoricalDupAgreement(
  packet: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>,
  reconstruction: Readonly<AuthenticatedV2ReadOnlyReconstruction>,
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  >,
): void {
  const duplicatePrevention = reconstruction.duplicatePrevention;
  const importedKeys = replayImport.imports
    .map(entry => entry.canonicalBurnIdHex)
    .sort();
  if (
    packet.tipBoxIdHex !== duplicatePrevention.tipBoxIdHex
    || packet.tipDigestHex !== duplicatePrevention.tipDigestHex
    || packet.tipCounter !== duplicatePrevention.tipCounter
    || canonicalJson(packet.rawInsertedKeysHex)
      !== canonicalJson(duplicatePrevention.historyKeys)
    || replayImport.source.authenticatedV2TipBoxIdHex !== packet.tipBoxIdHex
    || replayImport.source.authenticatedV2TipDigestHex !== packet.tipDigestHex
    || replayImport.source.authenticatedV2TipCounter !== packet.tipCounter
    || canonicalJson(importedKeys)
      !== canonicalJson([...packet.rawInsertedKeysHex].sort())
  ) {
    throw new Error('authenticated V2 historical DUP lineage, reconstruction, and replay import disagree');
  }
}

function historicalDupCoverage(input: Readonly<{
  route: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number];
  instance: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number]['instances'][number];
  inventory: ErgoLegacyRouteInstanceInventoryV4;
  status: ErgoHistoricalDuplicatePreventionStatusV4;
  declaredKeyIntent: HistoricalDupDeclaredKeyIntentV4;
  observedKeySemantics: HistoricalDupObservedKeySemanticsV4;
  packet: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4> | null;
  blockerCodes: readonly ErgoLegacyRouteInventoryBlockerV4[];
  canonicalEventMappingEstablished: boolean;
  sourceAdmissionEvidenceJoined: boolean;
}>): ErgoHistoricalDuplicatePreventionCoverageV4 {
  return deepFreeze({
    routeId: input.route.routeId,
    sourceSurface: input.route.sourceSurface,
    instanceId: input.instance.instanceId,
    address: input.instance.address,
    singletonTokenIdHex: input.instance.singletonTokenIdHex,
    genesisBoxIdHex: input.instance.genesisBoxIdHex,
    inventoryClassification: input.inventory.classification,
    status: input.status,
    declaredKeyIntent: input.declaredKeyIntent,
    observedKeySemantics: input.observedKeySemantics,
    packetDigestHex: input.packet?.packetDigestHex ?? null,
    observationDigestHex: input.packet?.observationDigestHex ?? null,
    rawKeyCount: input.packet?.rawInsertedKeysHex.length ?? 0,
    tipBoxIdHex: input.packet?.tipBoxIdHex ?? null,
    exactInventoryJoinEstablished: input.packet !== null,
    canonicalEventMappingEstablished: input.canonicalEventMappingEstablished,
    sourceAdmissionEvidenceJoined: input.sourceAdmissionEvidenceJoined,
    canonicalSourceFinalityEstablished: false as const,
    replayGenesisEligible: false as const,
    fundsAuthorityEstablished: false as const,
    blockerCodes: sortedUnique(input.blockerCodes),
  });
}

function historicalDupKey(routeId: string, instanceId: string): string {
  return `${routeId}/${instanceId}`;
}

function addRouteBlockers(
  blockers: Map<string, readonly ErgoLegacyRouteInventoryBlockerV4[]>,
  routeId: string,
  additions: readonly ErgoLegacyRouteInventoryBlockerV4[],
): void {
  if (additions.length === 0) return;
  blockers.set(routeId, sortedUnique([
    ...(blockers.get(routeId) ?? []),
    ...additions,
  ]));
}

function assertAuthenticatedV2Bindings(
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routes: readonly ErgoLegacyRouteInventoryV4[],
  snapshot: ErgoLegacyInventorySnapshotV4,
  sourceIds: readonly [string, string],
  reconstruction: Readonly<AuthenticatedV2ReadOnlyReconstruction>,
): void {
  if (
    canonicalJson(reconstruction.observedTip)
      !== canonicalJson(snapshot.bestHeader)
    || reconstruction.duplicatePrevention.indexedHeight
      !== snapshot.indexedHeight
    || reconstruction.duplicatePrevention.fullHeight !== snapshot.fullHeight
  ) {
    throw new Error('authenticated V2 reconstruction uses another Ergo snapshot');
  }
  const expectedSourceIds = [...sourceIds].sort();
  const observedSourceIds = [
    reconstruction.vault.sources.primary,
    reconstruction.vault.sources.witness,
  ].map(value => normalizedSourceId(value, 'authenticated V2 source ID')).sort();
  if (canonicalJson(expectedSourceIds) !== canonicalJson(observedSourceIds)) {
    throw new Error('authenticated V2 reconstruction uses another source pair');
  }
  const trackerInstance = exactSingletonInstance(
    profile,
    AUTHENTICATED_V2_TRACKER_ROUTE_ID,
    reconstruction.tracker.trackerNftIdHex,
    reconstruction.tracker.genesisBoxId,
  );
  const duplicatePreventionInstance = exactSingletonInstance(
    profile,
    AUTHENTICATED_V2_DUP_ROUTE_ID,
    reconstruction.duplicatePrevention.duplicatePreventionNftIdHex,
    reconstruction.duplicatePrevention.genesisBoxIdHex,
    reconstruction.duplicatePrevention.duplicatePreventionErgoTreeHex,
  );
  const vaultInstance = exactRouteInstance(
    profile,
    AUTHENTICATED_V2_VAULT_ROUTE_ID,
    reconstruction.vault.vaultAddress,
    reconstruction.vault.vaultErgoTreeHex,
  );
  if (
    trackerInstance.singletonTokenIdHex
      !== reconstruction.tracker.trackerNftIdHex
    || trackerInstance.genesisBoxIdHex
      !== reconstruction.tracker.genesisBoxId
    || duplicatePreventionInstance.singletonTokenIdHex
      !== reconstruction.duplicatePrevention.duplicatePreventionNftIdHex
    || duplicatePreventionInstance.genesisBoxIdHex
      !== reconstruction.duplicatePrevention.genesisBoxIdHex
    || duplicatePreventionInstance.ergoTreeHex
      !== reconstruction.duplicatePrevention.duplicatePreventionErgoTreeHex
  ) {
    throw new Error('authenticated V2 reconstruction differs from the exact route profile');
  }
  const routeById = new Map(routes.map(route => [route.routeId, route]));
  assertRouteContainsCurrentBox(
    routeById,
    AUTHENTICATED_V2_TRACKER_ROUTE_ID,
    trackerInstance.instanceId,
    reconstruction.tracker.tipBoxId,
    trackerInstance.singletonTokenIdHex!,
  );
  assertRouteContainsCurrentBox(
    routeById,
    AUTHENTICATED_V2_DUP_ROUTE_ID,
    duplicatePreventionInstance.instanceId,
    reconstruction.duplicatePrevention.tipBoxIdHex,
    duplicatePreventionInstance.singletonTokenIdHex!,
  );
  const vaultRoute = routeById.get(
    AUTHENTICATED_V2_VAULT_ROUTE_ID,
  );
  const vaultInventory = vaultRoute?.instances.find(
    instance => instance.instanceId === vaultInstance.instanceId,
  );
  if (
    vaultInventory === undefined
    || canonicalJson(vaultInventory.currentBoxIdsHex)
      !== canonicalJson(
        [...reconstruction.vault.currentUnspentBoxIdsHex].sort(),
      )
  ) {
    throw new Error('authenticated V2 vault reconstruction differs from the route inventory');
  }
}

function exactSingletonInstance(
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routeId: string,
  singletonTokenIdHex: string,
  genesisBoxIdHex: string,
  ergoTreeHex?: string,
) {
  const route = profile.routes.find(candidate => candidate.routeId === routeId);
  const matches = route?.instances.filter(
    instance =>
      instance.singletonTokenIdHex === singletonTokenIdHex
      && instance.genesisBoxIdHex === genesisBoxIdHex
      && (ergoTreeHex === undefined || instance.ergoTreeHex === ergoTreeHex),
  ) ?? [];
  if (matches.length !== 1) {
    throw new Error(`authenticated V2 route ${routeId} has no unique exact singleton instance`);
  }
  return matches[0]!;
}

function exactRouteInstance(
  profile: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routeId: string,
  address: string,
  ergoTreeHex: string,
) {
  const route = profile.routes.find(candidate => candidate.routeId === routeId);
  const matches = route?.instances.filter(
    instance =>
      instance.address === address
      && instance.ergoTreeHex === ergoTreeHex,
  ) ?? [];
  if (matches.length !== 1) {
    throw new Error(`authenticated V2 route ${routeId} has no exact profiled instance`);
  }
  return matches[0]!;
}

function assertRouteContainsCurrentBox(
  routeById: ReadonlyMap<string, ErgoLegacyRouteInventoryV4>,
  routeId: string,
  instanceId: string,
  boxIdHex: string,
  singletonTokenIdHex: string,
): void {
  const inventory = routeById.get(routeId)?.instances.find(
    instance => instance.instanceId === instanceId,
  );
  const box = inventory?.indexedBoxes.find(
    candidate =>
      candidate.boxIdHex === boxIdHex
      && candidate.currentUtxoBinaryMatched,
  );
  if (
    box === undefined
    || !box.assets.some(
      asset =>
        asset.tokenIdHex === singletonTokenIdHex
        && asset.amount === '1',
    )
  ) {
    throw new Error(`authenticated V2 route ${routeId} tip is absent from the route inventory`);
  }
}

function applyAuthenticatedV2Blockers(
  routes: readonly ErgoLegacyRouteInventoryV4[],
  blockers: ReadonlyMap<
    string,
    readonly ErgoLegacyRouteInventoryBlockerV4[]
  >,
): ErgoLegacyRouteInventoryV4[] {
  return routes.map(route => {
    const additions = blockers.get(route.routeId);
    if (additions === undefined || additions.length === 0) return route;
    const blockerCodes = sortedUnique([...route.blockerCodes, ...additions]);
    const binding = {
      routeId: route.routeId,
      sourceSurface: route.sourceSurface,
      requiredDisposition: route.requiredDisposition,
      classification: route.classification,
      instances: route.instances,
      blockerCodes,
      retirementEvidenceDigestHex: null,
      retirementDeclarationEligible: false as const,
    };
    return deepFreeze({
      ...binding,
      inventoryEvidenceDigestHex: sha256CanonicalJson(
        binding,
        ROUTE_DIGEST_DOMAIN,
      ),
    });
  });
}

function applyHistoricalDupBlockers(
  routes: readonly ErgoLegacyRouteInventoryV4[],
  blockers: ReadonlyMap<
    string,
    readonly ErgoLegacyRouteInventoryBlockerV4[]
  >,
): ErgoLegacyRouteInventoryV4[] {
  return applyAuthenticatedV2Blockers(routes, blockers);
}

function unresolvedInstance(
  instance: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['instances'][number],
  blockerCodes: readonly ErgoLegacyRouteInventoryBlockerV4[],
): ErgoLegacyRouteInstanceInventoryV4 {
  const binding = {
    instanceId: instance.instanceId,
    address: instance.address,
    ergoTreeHex: instance.ergoTreeHex,
    ergoTreeSha256Hex: instance.ergoTreeSha256Hex,
    singletonTokenIdHex: instance.singletonTokenIdHex,
    genesisBoxIdHex: instance.genesisBoxIdHex,
    classification: 'unresolved' as const,
    indexedHistoryBoxCount: 0,
    currentUtxoCount: 0,
    currentValueNanoErg: '0',
    indexedBoxes: [] as readonly ErgoLegacyInventoryBoxV4[],
    currentBoxIdsHex: [] as readonly string[],
    blockerCodes: sortedUnique(blockerCodes),
  };
  return deepFreeze({
    ...binding,
    inventoryEvidenceDigestHex: sha256CanonicalJson(
      binding,
      INSTANCE_DIGEST_DOMAIN,
    ),
  });
}

function combineClassifications(
  values: readonly ErgoLegacyRouteInventoryClassificationV4[],
): ErgoLegacyRouteInventoryClassificationV4 {
  if (values.includes('unresolved')) return 'unresolved';
  if (values.includes('funded')) return 'funded';
  if (values.includes('drained')) return 'drained';
  return 'never-funded';
}

function summarize(
  routes: readonly ErgoLegacyRouteInventoryV4[],
  historicalDuplicatePrevention:
    readonly ErgoHistoricalDuplicatePreventionCoverageV4[],
): ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet['summary'] {
  return {
    routeCount: routes.length,
    instanceCount: routes.reduce(
      (sum, route) => sum + route.instances.length,
      0,
    ),
    fundedRouteCount: routes.filter(
      route => route.classification === 'funded',
    ).length,
    drainedRouteCount: routes.filter(
      route => route.classification === 'drained',
    ).length,
    neverFundedRouteCount: routes.filter(
      route => route.classification === 'never-funded',
    ).length,
    unresolvedRouteCount: routes.filter(
      route => route.classification === 'unresolved',
    ).length,
    routesWithObservationBlockers: routes.filter(route =>
      route.blockerCodes.some(code => code !== 'retirement-evidence-required')
    ).length,
    duplicatePreventionInstanceCount: historicalDuplicatePrevention.length,
    historicalLineagePacketCount: historicalDuplicatePrevention.filter(
      entry => entry.packetDigestHex !== null,
    ).length,
    historicalLineageMissingCount: historicalDuplicatePrevention.filter(
      entry => entry.packetDigestHex === null,
    ).length,
    historicalLineageJoinedCount: historicalDuplicatePrevention.filter(
      entry => entry.exactInventoryJoinEstablished,
    ).length,
    historicalFundedLineageReplayedCount:
      historicalDuplicatePrevention.filter(entry =>
        entry.exactInventoryJoinEstablished
        && entry.inventoryClassification === 'funded'
      ).length,
    historicalNeverFundedInstanceConfirmedCount:
      historicalDuplicatePrevention.filter(entry =>
        entry.status === 'never-funded'
      ).length,
    historicalLineagesAwaitingSourceEvidenceCount:
      historicalDuplicatePrevention.filter(entry =>
        entry.status
          === 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required'
        || entry.status
          === 'opaque-event-id-intent-mapping-and-source-admission-required'
      ).length,
    routesRetired: 0,
  };
}

function assertNoCrossRouteBoxAssignment(
  routes: readonly ErgoLegacyRouteInventoryV4[],
): void {
  const assigned = new Map<string, string>();
  for (const route of routes) {
    for (const instance of route.instances) {
      for (const box of instance.indexedBoxes) {
        const assignment = `${route.routeId}/${instance.instanceId}`;
        const prior = assigned.get(box.boxIdHex);
        if (prior !== undefined && prior !== assignment) {
          throw new Error(
            `Ergo legacy box ${box.boxIdHex} is assigned to both ${prior} and ${assignment}`,
          );
        }
        assigned.set(box.boxIdHex, assignment);
      }
    }
  }
}

function assertBudgetHooks(
  sources: readonly AuthenticatedV2VaultChainSource[],
): void {
  for (const [index, source] of sources.entries()) {
    if (
      Boolean(source.beginAuthenticatedTrackerReconstruction)
      !== Boolean(source.endAuthenticatedTrackerReconstruction)
    ) {
      throw new Error(
        `Ergo legacy inventory source ${index} budget hooks must be paired`,
      );
    }
  }
}

async function captureSnapshot(
  source: AuthenticatedV2VaultChainSource,
  label: string,
): Promise<ErgoLegacyInventorySnapshotV4> {
  const progress = record(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeSafeInteger(
    progress.indexedHeight,
    `${label} indexed height`,
  );
  const fullHeight = nonnegativeSafeInteger(
    progress.fullHeight,
    `${label} full height`,
  );
  if (indexedHeight !== fullHeight) {
    throw new Error(`${label} extra index is not synchronized`);
  }
  const header = record(await source.getBestHeader(), `${label} best header`);
  const bestHeader = {
    idHex: fixedHex(header.id, 32, `${label} header ID`),
    parentIdHex: fixedHex(header.parentId, 32, `${label} parent ID`),
    height: nonnegativeSafeInteger(header.height, `${label} header height`),
    extensionRootHex: fixedHex(
      header.extensionRoot ?? header.extensionHash,
      32,
      `${label} extension root`,
    ),
  };
  if (bestHeader.height !== fullHeight) {
    throw new Error(`${label} best header does not identify full height`);
  }
  return deepFreeze({ indexedHeight, fullHeight, bestHeader });
}

async function readNetwork(
  source: AuthenticatedV2VaultChainSource,
  label: string,
): Promise<string> {
  const info = record(await source.getInfo(), `${label} node info`);
  const value = info.network ?? info.networkType;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} network is missing`);
  }
  return value.trim().toLowerCase();
}

function normalizeAssets(
  value: unknown,
  label: string,
): readonly { readonly tokenIdHex: string; readonly amount: string }[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set<string>();
  return deepFreeze(value.map((entry, index) => {
    const raw = record(entry, `${label} ${index}`);
    const tokenIdHex = fixedHex(
      raw.tokenId,
      32,
      `${label} ${index} token ID`,
    );
    if (seen.has(tokenIdHex)) {
      throw new Error(`${label} contains duplicate token ${tokenIdHex}`);
    }
    seen.add(tokenIdHex);
    return {
      tokenIdHex,
      amount: positiveBigInt(
        raw.amount,
        `${label} ${index} amount`,
      ).toString(),
    };
  }));
}

function normalizeRegisters(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  const raw = record(value, label);
  const names = Object.keys(raw).sort();
  if (names.some(name => !/^R[4-9]$/.test(name))) {
    throw new Error(`${label} contains an unsupported register`);
  }
  return deepFreeze(Object.fromEntries(names.map(name => [
    name,
    variableHex(raw[name], MAX_REGISTER_BYTES, `${label} ${name}`),
  ])));
}

function normalizedSourceId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > 2_048
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function variableHex(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be even-length hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length % 2 !== 0
    || normalized.length > maxBytes * 2
    || !/^[0-9a-f]*$/.test(normalized)
  ) {
    throw new Error(`${label} must be at most ${maxBytes} bytes of hex`);
  }
  return normalized;
}

function positiveBigInt(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value as string | number | bigint);
  } catch {
    throw new Error(`${label} must be a positive integer`);
  }
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  return value as Record<string, unknown>;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} identities must be unique`);
  }
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort();
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
