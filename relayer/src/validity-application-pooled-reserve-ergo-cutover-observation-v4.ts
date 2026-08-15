import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS,
  buildValidityApplicationPooledReserveErgoLegacyInventoryV4,
  validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet,
  type ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet,
} from './validity-application-pooled-reserve-ergo-legacy-inventory-v4.js';
import {
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance,
  validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type ValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA,
  reconstructValidityApplicationPooledReserveHistoricalDupLineageV4,
  validateValidityApplicationPooledReserveHistoricalDupLineageV4,
  type ValidityApplicationPooledReserveHistoricalDupLineageV4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-ergo-cutover-observation.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_STATUS =
  'blocking_non_authorizing_observation' as const;

const REPORT_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4';
const REVIEW_BASIS_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_REVIEW_BASIS_V4';
const reports = new WeakSet<object>();

export interface ObserveValidityApplicationPooledReserveErgoCutoverV4Input {
  readonly profile: Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
  readonly expectedProfileDigestHex: string;
  readonly primarySource: AuthenticatedV2VaultChainSource;
  readonly witnessSource: AuthenticatedV2VaultChainSource;
  readonly observedAt?: () => Date;
}

export interface ValidityApplicationPooledReserveErgoCutoverObservationV4Report {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_STATUS;
  readonly reportDigestHex: string;
  readonly profile: Readonly<{
    readonly profileDigestHex: string;
    readonly requirementsDigestHex: string;
    readonly networkId: 'ergo-testnet';
    readonly sourceRevisionHex: string;
    readonly reviewBasisDigestHex: string;
    readonly profileReviewAuthenticated: false;
    readonly profileApproved: false;
  }>;
  readonly routeProfile: Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
  readonly observation: ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet[
    'observation'
  ];
  readonly historicalDupLineages: readonly Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4
  >[];
  readonly inventory: Readonly<
    ValidityApplicationPooledReserveErgoLegacyInventoryV4Packet
  >;
  readonly nextEvidence: readonly Readonly<{
    readonly routeId: string;
    readonly instanceId: string;
    readonly lineagePacketDigestHex: string;
    readonly rawKeyCount: number;
    readonly canonicalEventMappingRequired: true;
    readonly sourceAdmissionEvidenceRequired: true;
  }>[];
  readonly summary: Readonly<{
    readonly routeCount: number;
    readonly instanceCount: number;
    readonly historicalDupLineageCount: number;
    readonly reconstructedHistoricalDupLineageCount: number;
    readonly neverFundedHistoricalDupLineageCount: number;
    readonly rawHistoricalReplayKeyCount: number;
    readonly lineagesRequiringEventAndAdmissionEvidence: number;
    readonly inventoryBlockerCodes: readonly string[];
  }>;
  readonly boundaries: Readonly<{
    readonly explicitProfileDigestMatched: true;
    readonly nonMainnetOnly: true;
    readonly aggregateBudgetHooksApplied: true;
    readonly sourceAdapterBudgetEnforcementAuthenticated: false;
    readonly readOnlyObservationInterfaceOnly: true;
    readonly orchestratorLocalConfigurationLoaded: false;
    readonly orchestratorEnvironmentCredentialsLoaded: false;
    readonly orchestratorDeploymentStateLoaded: false;
    readonly orchestratorRuntimeDatabaseConsulted: false;
    readonly sourceAdapterProvenanceAuthenticated: false;
    readonly sourceOperationalIndependenceAuthenticated: false;
    readonly ergoConsensusAuthenticated: false;
    readonly transactionInclusionAuthenticated: false;
    readonly profileReviewAuthenticated: false;
    readonly deploymentLineageAuthenticated: false;
    readonly canonicalEventMappingsCompleted: false;
    readonly sourceAdmissionEvidenceCompleted: false;
    readonly publicationAuthorized: false;
    readonly replayGenesisEligible: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly transactionCheckPerformed: false;
    readonly mintAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export async function observeValidityApplicationPooledReserveErgoCutoverV4(
  input: ObserveValidityApplicationPooledReserveErgoCutoverV4Input,
): Promise<Readonly<
  ValidityApplicationPooledReserveErgoCutoverObservationV4Report
>> {
  const keys = [
    'profile',
    'expectedProfileDigestHex',
    'primarySource',
    'witnessSource',
    ...(Object.hasOwn(input, 'observedAt') ? ['observedAt'] : []),
  ];
  exactDataObject(input, keys, 'pooled-reserve V4 Ergo cutover observation input');
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(
    input.profile,
  );
  if (input.profile.network.networkId !== 'ergo-testnet') {
    throw new Error('Ergo cutover observation accepts only an explicit non-mainnet profile');
  }
  const expectedProfileDigestHex = lowercaseDigest(
    input.expectedProfileDigestHex,
    'expected Ergo cutover profile digest',
  );
  if (input.profile.profileDigestHex !== expectedProfileDigestHex) {
    throw new Error('Ergo cutover profile digest differs from the explicit expected digest');
  }
  if (input.primarySource === input.witnessSource) {
    throw new Error('Ergo cutover observation requires distinct source instances');
  }
  assertAggregateBudgetHooks(input.primarySource, 'primary source');
  assertAggregateBudgetHooks(input.witnessSource, 'witness source');

  const duplicatePreventionRoutes = input.profile.routes
    .filter(route => route.routeClass === 'duplicate-prevention');
  const duplicatePreventionInstances = duplicatePreventionRoutes
    .flatMap(route => route.instances.map(instance => ({ route, instance })));
  if (duplicatePreventionInstances.length === 0) {
    throw new Error('Ergo cutover profile must contain a non-inert DUP route set');
  }
  if (duplicatePreventionInstances.some(({ instance }) =>
    instance.singletonTokenIdHex === null || instance.genesisBoxIdHex === null
  )) {
    throw new Error('every Ergo cutover DUP instance requires exact singleton and genesis identities');
  }

  const primaryView = withoutBudgetHooks(input.primarySource);
  const witnessView = withoutBudgetHooks(input.witnessSource);
  let primaryStarted = false;
  let witnessStarted = false;
  let bodyFailed = false;
  try {
    input.primarySource.beginAuthenticatedTrackerReconstruction!();
    primaryStarted = true;
    input.witnessSource.beginAuthenticatedTrackerReconstruction!();
    witnessStarted = true;

    const historicalDupLineages: Readonly<
      ValidityApplicationPooledReserveHistoricalDupLineageV4
    >[] = [];
    for (const { route, instance } of duplicatePreventionInstances) {
      historicalDupLineages.push(
        await reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
          profile: input.profile,
          route,
          instance,
          primarySource: primaryView,
          witnessSource: witnessView,
        }),
      );
    }

    const inventory = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4({
      profile: input.profile,
      primarySource: primaryView,
      witnessSource: witnessView,
      authenticatedV2: null,
      replayImport: null,
      historicalDupLineages,
      ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
    });
    const nextEvidence = historicalDupLineages
      .filter(lineage => lineage.rawInsertedKeysHex.length > 0)
      .map(lineage => ({
        routeId: lineage.routeId,
        instanceId: lineage.instanceId,
        lineagePacketDigestHex: lineage.packetDigestHex,
        rawKeyCount: lineage.rawInsertedKeysHex.length,
        canonicalEventMappingRequired: true as const,
        sourceAdmissionEvidenceRequired: true as const,
      }));
    const inventoryBlockerCodes = [...new Set(
      inventory.routes.flatMap(route => route.blockerCodes),
    )].sort();
    const summary = {
      routeCount: inventory.summary.routeCount,
      instanceCount: inventory.summary.instanceCount,
      historicalDupLineageCount: historicalDupLineages.length,
      reconstructedHistoricalDupLineageCount: historicalDupLineages.filter(
        lineage => lineage.classification === 'raw-reconstructed',
      ).length,
      neverFundedHistoricalDupLineageCount: historicalDupLineages.filter(
        lineage => lineage.classification === 'never-funded',
      ).length,
      rawHistoricalReplayKeyCount: historicalDupLineages.reduce(
        (count, lineage) => count + lineage.rawInsertedKeysHex.length,
        0,
      ),
      lineagesRequiringEventAndAdmissionEvidence: nextEvidence.length,
      inventoryBlockerCodes,
    };
    const binding = {
      schema:
        VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_SCHEMA,
      version: 4 as const,
      status:
        VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_STATUS,
      profile: {
        profileDigestHex: input.profile.profileDigestHex,
        requirementsDigestHex: input.profile.requirementsDigestHex,
        networkId: 'ergo-testnet' as const,
        sourceRevisionHex: input.profile.reviewedSource.sourceRevisionHex,
        reviewBasisDigestHex: sha256CanonicalJson(
          input.profile.reviewedSource.basis,
          REVIEW_BASIS_DIGEST_DOMAIN,
        ),
        profileReviewAuthenticated: false as const,
        profileApproved: false as const,
      },
      routeProfile: input.profile,
      observation: inventory.observation,
      historicalDupLineages,
      inventory,
      nextEvidence,
      summary,
      boundaries: {
        explicitProfileDigestMatched: true as const,
        nonMainnetOnly: true as const,
        aggregateBudgetHooksApplied: true as const,
        sourceAdapterBudgetEnforcementAuthenticated: false as const,
        readOnlyObservationInterfaceOnly: true as const,
        orchestratorLocalConfigurationLoaded: false as const,
        orchestratorEnvironmentCredentialsLoaded: false as const,
        orchestratorDeploymentStateLoaded: false as const,
        orchestratorRuntimeDatabaseConsulted: false as const,
        sourceAdapterProvenanceAuthenticated: false as const,
        sourceOperationalIndependenceAuthenticated: false as const,
        ergoConsensusAuthenticated: false as const,
        transactionInclusionAuthenticated: false as const,
        profileReviewAuthenticated: false as const,
        deploymentLineageAuthenticated: false as const,
        canonicalEventMappingsCompleted: false as const,
        sourceAdmissionEvidenceCompleted: false as const,
        publicationAuthorized: false as const,
        replayGenesisEligible: false as const,
        legacyRoutesRetired: false as const,
        profileActivated: false as const,
        transactionCheckPerformed: false as const,
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
    const report = deepFreeze({
      ...binding,
      reportDigestHex: sha256CanonicalJson(binding, REPORT_DIGEST_DOMAIN),
    });
    reports.add(report);
    return report;
  } catch (error) {
    bodyFailed = true;
    throw error;
  } finally {
    const errors: unknown[] = [];
    if (witnessStarted) {
      try {
        input.witnessSource.endAuthenticatedTrackerReconstruction!();
      } catch (error) {
        errors.push(error);
      }
    }
    if (primaryStarted) {
      try {
        input.primarySource.endAuthenticatedTrackerReconstruction!();
      } catch (error) {
        errors.push(error);
      }
    }
    if (!bodyFailed && errors.length > 0) throw errors[0];
  }
}

export function assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveErgoCutoverObservationV4Report
> {
  if (value === null || typeof value !== 'object' || !reports.has(value)) {
    throw new Error('Ergo cutover observation was not built in this process');
  }
}

export function validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
  value: unknown,
): Readonly<ValidityApplicationPooledReserveErgoCutoverObservationV4Report> {
  const record = exactDataObject(value, [
    'schema',
    'version',
    'status',
    'reportDigestHex',
    'profile',
    'routeProfile',
    'observation',
    'historicalDupLineages',
    'inventory',
    'nextEvidence',
    'summary',
    'boundaries',
  ], 'Ergo cutover observation report');
  if (
    record.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_SCHEMA
    || record.version !== 4
    || record.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_CUTOVER_OBSERVATION_V4_STATUS
  ) {
    throw new Error('Ergo cutover observation report schema, version, or status is invalid');
  }
  const reportDigestHex = lowercaseDigest(
    record.reportDigestHex,
    'Ergo cutover observation report digest',
  );
  const binding = { ...record };
  delete binding.reportDigestHex;
  if (sha256CanonicalJson(binding, REPORT_DIGEST_DOMAIN) !== reportDigestHex) {
    throw new Error('Ergo cutover observation report digest does not match its content');
  }
  const profile = exactDataObject(record.profile, [
    'profileDigestHex',
    'requirementsDigestHex',
    'networkId',
    'sourceRevisionHex',
    'reviewBasisDigestHex',
    'profileReviewAuthenticated',
    'profileApproved',
  ], 'Ergo cutover observation profile binding');
  if (
    profile.networkId !== 'ergo-testnet'
    || profile.profileReviewAuthenticated !== false
    || profile.profileApproved !== false
  ) {
    throw new Error('Ergo cutover observation profile boundary is invalid');
  }
  lowercaseDigest(profile.profileDigestHex, 'Ergo cutover profile digest');
  lowercaseDigest(profile.requirementsDigestHex, 'Ergo cutover requirements digest');
  lowercaseDigest(profile.reviewBasisDigestHex, 'Ergo cutover review-basis digest');
  if (
    typeof profile.sourceRevisionHex !== 'string'
    || !/^[0-9a-f]{40}$/.test(profile.sourceRevisionHex)
    || /^0+$/.test(profile.sourceRevisionHex)
  ) {
    throw new Error('Ergo cutover source revision must be nonzero 20-byte lowercase hex');
  }
  const routeProfile =
    validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      record.routeProfile,
    );
  if (
    routeProfile.network.networkId !== 'ergo-testnet'
    || routeProfile.profileDigestHex !== profile.profileDigestHex
    || routeProfile.requirementsDigestHex !== profile.requirementsDigestHex
    || routeProfile.reviewedSource.sourceRevisionHex !== profile.sourceRevisionHex
    || sha256CanonicalJson(
      routeProfile.reviewedSource.basis,
      REVIEW_BASIS_DIGEST_DOMAIN,
    ) !== profile.reviewBasisDigestHex
  ) {
    throw new Error('Ergo cutover route profile differs from its report binding');
  }
  const inventory =
    validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
      record.inventory,
      routeProfile,
    );
  if (
    inventory.schema !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_SCHEMA
    || inventory.version !== 4
    || inventory.status !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS
    || !/^[0-9a-f]{64}$/.test(inventory.packetDigestHex)
    || inventory.profile.profileDigestHex !== profile.profileDigestHex
    || inventory.profile.requirementsDigestHex !== profile.requirementsDigestHex
    || inventory.profile.networkId !== profile.networkId
    || canonicalJson(inventory.observation) !== canonicalJson(record.observation)
  ) {
    throw new Error('Ergo cutover observation inventory differs from its report binding');
  }
  if (
    inventory.authenticatedV2.reconstructionSupplied
    || inventory.authenticatedV2.reconstructionDigests !== null
    || inventory.authenticatedV2.currentInputs !== null
    || inventory.authenticatedV2.replayImportPacketDigestHex !== null
    || inventory.authenticatedV2.canonicalReplayKeyCount !== 0
    || inventory.historicalDuplicatePrevention.some(coverage =>
      coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    )
  ) {
    throw new Error('Ergo cutover observation inventory contains evidence outside this observation boundary');
  }
  if (!Array.isArray(record.historicalDupLineages) || !Array.isArray(record.nextEvidence)) {
    throw new Error('Ergo cutover observation lineage and next-evidence fields must be arrays');
  }
  const lineages = record.historicalDupLineages.map((lineage, index) => {
    try {
      return validateValidityApplicationPooledReserveHistoricalDupLineageV4(
        lineage,
      );
    } catch (error) {
      throw new Error(
        `Ergo cutover historical DUP lineage ${index} is invalid`,
        { cause: error },
      );
    }
  });
  for (const lineage of lineages) {
    const route = routeProfile.routes.find(candidate =>
      candidate.routeId === lineage.routeId
    );
    const instance = route?.instances.find(candidate =>
      candidate.instanceId === lineage.instanceId
    );
    if (
      route?.routeClass !== 'duplicate-prevention'
      || instance === undefined
      || route.sourceSurface !== lineage.sourceSurface
      || instance.address !== lineage.address
      || instance.ergoTreeHex !== lineage.ergoTreeHex
      || instance.singletonTokenIdHex !== lineage.singletonTokenIdHex
      || instance.genesisBoxIdHex !== lineage.genesisBoxIdHex
      || lineage.schema
        !== VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_SCHEMA
      || lineage.version !== 4
      || !/^[0-9a-f]{64}$/.test(lineage.packetDigestHex)
      || lineage.profileDigestHex !== profile.profileDigestHex
      || lineage.requirementsDigestHex !== profile.requirementsDigestHex
      || lineage.networkId !== profile.networkId
      || canonicalJson(lineage.stableSnapshot)
        !== canonicalJson(inventory.observation.stableSnapshot)
      || canonicalJson([...lineage.sourceIdDigestsHex].sort())
        !== canonicalJson([...inventory.observation.sourceIdDigestsHex].sort())
    ) {
      throw new Error('Ergo cutover historical DUP lineage differs from the report boundary');
    }
  }
  const lineageKeys = lineages.map(lineage =>
    `${lineage.routeId}/${lineage.instanceId}/${lineage.packetDigestHex}`
  ).sort();
  const inventoryLineageKeys = inventory.historicalDuplicatePrevention.map(coverage =>
    `${coverage.routeId}/${coverage.instanceId}/${coverage.packetDigestHex ?? ''}`
  ).sort();
  if (canonicalJson(lineageKeys) !== canonicalJson(inventoryLineageKeys)) {
    throw new Error('Ergo cutover report lineages differ from the inventory join');
  }
  const inventoryCoverageByKey = new Map(
    inventory.historicalDuplicatePrevention.map(coverage => [
      `${coverage.routeId}/${coverage.instanceId}`,
      coverage,
    ]),
  );
  for (const lineage of lineages) {
    const coverage = inventoryCoverageByKey.get(
      `${lineage.routeId}/${lineage.instanceId}`,
    );
    const expectedStatus = lineage.classification === 'never-funded'
      ? 'never-funded'
      : lineage.rawInsertedKeysHex.length === 0
        ? 'opaque-lineage-zero-keys'
        : lineage.descriptor.declaredKeyIntent === 'sidechain-burn-transaction-hash'
          ? 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required'
          : 'opaque-event-id-intent-mapping-and-source-admission-required';
    if (
      coverage === undefined
      || coverage.sourceSurface !== lineage.sourceSurface
      || coverage.address !== lineage.address
      || coverage.singletonTokenIdHex !== lineage.singletonTokenIdHex
      || coverage.genesisBoxIdHex !== lineage.genesisBoxIdHex
      || coverage.status !== expectedStatus
      || coverage.declaredKeyIntent !== lineage.descriptor.declaredKeyIntent
      || coverage.observedKeySemantics !== lineage.descriptor.observedKeySemantics
      || coverage.packetDigestHex !== lineage.packetDigestHex
      || coverage.observationDigestHex !== lineage.observationDigestHex
      || coverage.rawKeyCount !== lineage.rawInsertedKeysHex.length
      || coverage.tipBoxIdHex !== lineage.tipBoxIdHex
      || coverage.exactInventoryJoinEstablished !== true
      || coverage.canonicalEventMappingEstablished
      || coverage.sourceAdmissionEvidenceJoined
    ) {
      throw new Error('Ergo cutover historical DUP lineage differs from its inventory coverage');
    }
  }
  const expectedNextEvidence = lineages
    .filter(lineage => lineage.rawInsertedKeysHex.length > 0)
    .map(lineage => ({
      routeId: lineage.routeId,
      instanceId: lineage.instanceId,
      lineagePacketDigestHex: lineage.packetDigestHex,
      rawKeyCount: lineage.rawInsertedKeysHex.length,
      canonicalEventMappingRequired: true,
      sourceAdmissionEvidenceRequired: true,
    }));
  if (canonicalJson(record.nextEvidence) !== canonicalJson(expectedNextEvidence)) {
    throw new Error('Ergo cutover next-evidence rows differ from the observed lineages');
  }
  const expectedSummary = {
    routeCount: inventory.summary.routeCount,
    instanceCount: inventory.summary.instanceCount,
    historicalDupLineageCount: lineages.length,
    reconstructedHistoricalDupLineageCount: lineages.filter(
      lineage => lineage.classification === 'raw-reconstructed',
    ).length,
    neverFundedHistoricalDupLineageCount: lineages.filter(
      lineage => lineage.classification === 'never-funded',
    ).length,
    rawHistoricalReplayKeyCount: lineages.reduce(
      (count, lineage) => count + lineage.rawInsertedKeysHex.length,
      0,
    ),
    lineagesRequiringEventAndAdmissionEvidence: expectedNextEvidence.length,
    inventoryBlockerCodes: [...new Set(
      inventory.routes.flatMap(route => route.blockerCodes),
    )].sort(),
  };
  const summary = exactDataObject(
    record.summary,
    Object.keys(expectedSummary),
    'Ergo cutover observation summary',
  );
  if (canonicalJson(summary) !== canonicalJson(expectedSummary)) {
    throw new Error('Ergo cutover observation summary differs from its packets');
  }
  const boundaries = exactDataObject(
    record.boundaries,
    Object.keys(EXPECTED_BOUNDARIES),
    'Ergo cutover observation boundaries',
  );
  if (canonicalJson(boundaries) !== canonicalJson(EXPECTED_BOUNDARIES)) {
    throw new Error('Ergo cutover observation authority boundaries are invalid');
  }
  return value as Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >;
}

const EXPECTED_BOUNDARIES = {
  explicitProfileDigestMatched: true,
  nonMainnetOnly: true,
  aggregateBudgetHooksApplied: true,
  sourceAdapterBudgetEnforcementAuthenticated: false,
  readOnlyObservationInterfaceOnly: true,
  orchestratorLocalConfigurationLoaded: false,
  orchestratorEnvironmentCredentialsLoaded: false,
  orchestratorDeploymentStateLoaded: false,
  orchestratorRuntimeDatabaseConsulted: false,
  sourceAdapterProvenanceAuthenticated: false,
  sourceOperationalIndependenceAuthenticated: false,
  ergoConsensusAuthenticated: false,
  transactionInclusionAuthenticated: false,
  profileReviewAuthenticated: false,
  deploymentLineageAuthenticated: false,
  canonicalEventMappingsCompleted: false,
  sourceAdmissionEvidenceCompleted: false,
  publicationAuthorized: false,
  replayGenesisEligible: false,
  legacyRoutesRetired: false,
  profileActivated: false,
  transactionCheckPerformed: false,
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

function withoutBudgetHooks(
  source: AuthenticatedV2VaultChainSource,
): AuthenticatedV2VaultChainSource {
  return {
    observationSourceId: source.observationSourceId,
    getInfo: source.getInfo.bind(source),
    getIndexedHeight: source.getIndexedHeight.bind(source),
    getBestHeader: source.getBestHeader.bind(source),
    getIndexedBoxesByTokenId: source.getIndexedBoxesByTokenId.bind(source),
    getIndexedBoxesByAddress: source.getIndexedBoxesByAddress.bind(source),
    getUnspentBoxesByAddress: source.getUnspentBoxesByAddress.bind(source),
    getTransaction: source.getTransaction.bind(source),
    getBlockHeaderById: source.getBlockHeaderById.bind(source),
    getBoxByIdOrNull: source.getBoxByIdOrNull.bind(source),
    getBoxBinaryByIdOrNull: source.getBoxBinaryByIdOrNull.bind(source),
  };
}

function assertAggregateBudgetHooks(
  source: AuthenticatedV2VaultChainSource,
  label: string,
): asserts source is AuthenticatedV2VaultChainSource & Required<Pick<
  AuthenticatedV2VaultChainSource,
  'beginAuthenticatedTrackerReconstruction' | 'endAuthenticatedTrackerReconstruction'
>> {
  if (
    typeof source?.beginAuthenticatedTrackerReconstruction !== 'function'
    || typeof source?.endAuthenticatedTrackerReconstruction !== 'function'
  ) {
    throw new Error(`${label} must expose paired aggregate observation budget hooks`);
  }
}

function lowercaseDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 32 bytes of lowercase hex`);
  }
  return value;
}

function exactDataObject(
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

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
