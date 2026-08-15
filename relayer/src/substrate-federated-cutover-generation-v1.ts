import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedTrackerContractV1Identity,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';
import type {
  LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
  type LegacyRouteRetirementRequirementV6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance,
  validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
  type TestnetCutoverReviewRouteV4,
  type ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

export const SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_SCHEMA =
  'e2s.substrate-federated-cutover-generation.v1' as const;
export const SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_STATUS =
  'blocked_non_authorizing_generation' as const;
export const SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_LABEL =
  'substrate-federated-ergo-testnet-v1' as const;

const MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_GENERATION_MANIFEST_V1';
const GENERATION_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_GENERATION_ID_V1';
const STATIC_ROUTE_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_GENERATION_ROUTE_SET_V1';
const PENDING_ROUTE_INVENTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_PENDING_ROUTE_INVENTORY_V1';
const PENDING_ROUTE_RETIREMENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_PENDING_ROUTE_RETIREMENT_V1';
const GENESIS_PAYLOAD_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_GENESIS_PAYLOAD_V1';
const GENESIS_PAYLOAD_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CUTOVER_GENESIS_PAYLOAD_SET_V1';
const GENESIS_SINGLETON_VALUE_NANOERG = '10000000' as const;
const manifests = new WeakSet<object>();

type ContractRole = 'tracker' | 'duplicatePrevention' | 'sourceLock' | 'pooledReserve';

export interface BuildSubstrateFederatedCutoverGenerationV1Input {
  readonly familyIdentity: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly trackerContract: Readonly<SubstrateFederatedTrackerContractV1Identity>;
  readonly cutoverReview: Readonly<
    ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
  >;
  readonly historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >;
}

interface TargetContractArtifactV1 {
  readonly contractIdHex: string;
  readonly templateSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
}

interface TargetGenesisPayloadV1 {
  readonly role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
  readonly valueNanoErg: typeof GENESIS_SINGLETON_VALUE_NANOERG;
  readonly ergoTreeHex: string;
  readonly assets: readonly Readonly<{
    readonly tokenId: string;
    readonly amount: '1';
  }>[];
  readonly additionalRegisters: Readonly<Record<string, string>>;
  readonly payloadDigestHex: string;
}

interface LegacyRouteGenerationRequirementV1 {
  readonly routeId: string;
  readonly layer: LegacyRouteRetirementRequirementV4['layer'];
  readonly routeClass: LegacyRouteRetirementRequirementV4['routeClass'];
  readonly sourceSurface: string;
  readonly historicalAuthority:
    LegacyRouteRetirementRequirementV4['historicalAuthority'];
  readonly requiredDisposition:
    LegacyRouteRetirementRequirementV4['requiredDisposition'];
  readonly introducedBy: LegacyRouteRetirementRequirementV6['introducedBy'];
  readonly contractIdHex: string | null;
  readonly inventorySource:
    | TestnetCutoverReviewRouteV4['inventory']['source']
    | 'pending-authenticated-inventory';
  readonly inventoryBindingDigestHex: string;
  readonly sanitizedInventoryBindingDigestHex: string;
  readonly retirementEvidenceDigestHex: string;
  readonly instanceIds: readonly string[];
  readonly drainedInstanceCount: number;
  readonly neverFundedInstanceCount: number;
  readonly blockerCodes: readonly string[];
  readonly retirementEvidenceAuthenticated: false;
  readonly routeRetired: false;
}

export interface SubstrateFederatedCutoverGenerationV1Manifest {
  readonly schema: typeof SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: typeof SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_STATUS;
  readonly manifestDigestHex: string;
  readonly generation: Readonly<{
    readonly label: typeof SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_LABEL;
    readonly generationIdHex: string;
    readonly settlementNetworkId: 'ergo-testnet';
    readonly sourceNetworkScope: 'public-testnet';
    readonly trustModel: 'federated_non_trustless';
  }>;
  readonly sourceReview: Readonly<{
    readonly cutoverReviewProfileDigestHex: string;
    readonly compatibilityInventoryPacketDigestHex: string;
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly sourceLineageProfileIdHex: string;
    readonly sourceRuntimeProfileIdHex: string;
    readonly sourceChainId: string;
    readonly sourceContractIds: Readonly<Record<ContractRole, string>>;
  }>;
  readonly target: Readonly<{
    readonly compilerBatchSha256Hex: string;
    readonly profile: Readonly<{
      readonly familyIdHex: string;
      readonly encodedProfileHex: string;
      readonly settlementProfileIdHex: string;
    }>;
    readonly sourceRuntime: Readonly<{
      readonly sourceNetworkIdHex: string;
      readonly sidechainIdHex: string;
      readonly bridgeAddressHex: string;
      readonly tokenAddressHex: string;
      readonly bridgeRuntimeCodeSha256Hex: string;
      readonly bridgeRuntimeCodeBytes: number;
      readonly tokenRuntimeCodeSha256Hex: string;
      readonly tokenRuntimeCodeBytes: number;
      readonly sourceRuntimeCodeSha256Hex: string;
      readonly sourceRuntimeCodeBytes: number;
      readonly runtimeProfileIdHex: string;
    }>;
    readonly federation: Readonly<{
      readonly federationProfileIdHex: string;
      readonly federationEpoch: string;
      readonly sourceAttestationKeySetDigestHex: string;
      readonly sourceAttestationThreshold: number;
      readonly ergoAdmissionKeySetDigestHex: string;
      readonly ergoAdmissionThreshold: number;
      readonly ergoAdmissionPublicKeysHex: readonly string[];
    }>;
    readonly lineages: Readonly<{
      readonly tracker: Readonly<TargetContractArtifactV1 & {
        readonly singletonTokenIdHex: string;
        readonly genesisInputBoxIdHex: string;
        readonly sigmaStateCommit: string;
      }>;
      readonly duplicatePrevention: Readonly<TargetContractArtifactV1 & {
        readonly singletonTokenIdHex: string;
        readonly genesisInputBoxIdHex: string;
      }>;
      readonly sourceLock: Readonly<TargetContractArtifactV1>;
      readonly pooledReserve: Readonly<TargetContractArtifactV1 & {
        readonly singletonTokenIdHex: string;
        readonly genesisInputBoxIdHex: string;
      }>;
    }>;
    readonly genesisPayloads: Readonly<{
      readonly schema: 'e2s.substrate-federated-cutover-genesis-payloads.v1';
      readonly version: 1;
      readonly payloadSetDigestHex: string;
      readonly importedReplayDigestHex: string;
      readonly emptyTrackerDigestHex: string;
      readonly emptyDepositDigestHex: string;
      readonly tracker: Readonly<TargetGenesisPayloadV1>;
      readonly duplicatePrevention: Readonly<TargetGenesisPayloadV1>;
      readonly pooledReserve: Readonly<TargetGenesisPayloadV1>;
      readonly creationHeightsBoundAtMaterialization: false;
      readonly outputIdsBoundAtMaterialization: false;
    }>;
  }>;
  readonly globalReplay: Readonly<{
    readonly sourcePacketDigestHex: string;
    readonly cutoverObservationReportDigestHex: string;
    readonly sourceLineageProfileIdHex: string;
    readonly lineageSetDigestHex: string;
    readonly canonicalBurnIdsHex: readonly string[];
    readonly canonicalBurnIdCount: number;
    readonly duplicatePreventionDigestHex: string;
    readonly sourceRegisters: Readonly<{
      readonly R4: string;
      readonly R5: string;
    }>;
    readonly contributions: readonly Readonly<{
      readonly kind: 'empty-observed-lineage' | 'authenticated-v2-replay-import';
      readonly routeId: string;
      readonly sourceSurface: string;
      readonly instanceId: string;
      readonly lineagePacketDigestHex: string;
      readonly lineageClassification: 'never-funded' | 'raw-reconstructed';
      readonly rawReplayKeyCount: number;
      readonly eventMapping:
        | 'not-required-empty-lineage'
        | 'event-complete-mapping-bound';
      readonly sourceAdmission:
        | 'not-required-empty-lineage'
        | 'source-admission-bound';
      readonly replayImportPacketDigestHex: string | null;
      readonly canonicalBurnIdsHex: readonly string[];
      readonly canonicalBurnIdsDigestHex: string;
    }>[];
  }>;
  readonly legacyRoutes: Readonly<{
    readonly exactStaticRouteSetDigestHex: string;
    readonly boundRouteSetDigestHex: string;
    readonly routeCount: number;
    readonly historicalAuthorityCounts: Readonly<{
      readonly ownerKey: number;
      readonly committee: number;
      readonly singleR9: number;
      readonly rootOrSelectedProducer: number;
      readonly permissionless: number;
      readonly reservedValidity: number;
      readonly localRuntimeCapability: number;
    }>;
    readonly routes: readonly Readonly<LegacyRouteGenerationRequirementV1>[];
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessFamilyCompilerIdentityVerified: true;
    readonly exactTrackerContractIdentityVerified: true;
    readonly sameProcessCutoverReviewVerified: true;
    readonly sameProcessHistoricalReplayVerified: true;
    readonly exactSourceRuntimeIdentityMatched: true;
    readonly exactStaticLegacyRouteSetMatched: true;
    readonly globalReplayLineageMatched: true;
    readonly targetContractIdentitiesBound: true;
    readonly targetGenesisPayloadsBound: true;
    readonly targetContractsDisjointFromReviewedApplicationAndV5: true;
    readonly callerRetirementClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly targetNetworkIdentityAuthenticated: false;
    readonly inventoryExhaustivenessAuthenticated: false;
    readonly retirementEvidenceAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly trackerLineageEstablished: false;
    readonly duplicatePreventionLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
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

export interface ValidateSubstrateFederatedCutoverGenerationV1Input
  extends BuildSubstrateFederatedCutoverGenerationV1Input {
  readonly manifest: unknown;
}

export interface ValidatedSubstrateFederatedCutoverGenerationV1 {
  readonly manifest: Readonly<SubstrateFederatedCutoverGenerationV1Manifest>;
  readonly validation: Readonly<{
    readonly exactSourceInputsReplayed: true;
    readonly canonicalManifestMatched: true;
    readonly callerAuthorityClaimsAccepted: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
  }>;
}

export function buildSubstrateFederatedCutoverGenerationV1(
  input: BuildSubstrateFederatedCutoverGenerationV1Input,
): Readonly<SubstrateFederatedCutoverGenerationV1Manifest> {
  exactRecord(input, [
    'familyIdentity',
    'trackerContract',
    'cutoverReview',
    'historicalReplayGenesis',
  ], 'substrate federated cutover-generation input');
  assertSubstrateFederatedSettlementFamilyV1Identity(input.familyIdentity);
  assertSubstrateFederatedTrackerContractV1Identity(input.trackerContract);
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
    input.cutoverReview,
  );
  const review =
    validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
      input.cutoverReview,
    ).profile;
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
    input.historicalReplayGenesis,
  );
  assertNonAuthorizingSources(
    input.familyIdentity,
    input.trackerContract,
    review,
    input.historicalReplayGenesis,
  );

  const sourceReview = buildSourceReview(review);
  const globalReplay = buildGlobalReplay(
    input.historicalReplayGenesis,
    review,
  );
  const target = buildTarget(
    input.familyIdentity,
    input.trackerContract,
    review,
    globalReplay.duplicatePreventionDigestHex,
  );
  const legacyRoutes = buildLegacyRoutes(review.routes);
  assertKnownTargetContractsAreDisjoint(
    sourceReview,
    target,
    legacyRoutes.routes,
  );
  const generationIdHex = sha256CanonicalJson({
    label: SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_LABEL,
    sourceReviewProfileDigestHex: sourceReview.cutoverReviewProfileDigestHex,
    historicalReplayGenesisPacketDigestHex:
      globalReplay.sourcePacketDigestHex,
    familyIdHex: target.profile.familyIdHex,
    trackerContractIdHex: target.lineages.tracker.contractIdHex,
    duplicatePreventionContractIdHex:
      target.lineages.duplicatePrevention.contractIdHex,
    pooledReserveContractIdHex: target.lineages.pooledReserve.contractIdHex,
    targetGenesisPayloadSetDigestHex:
      target.genesisPayloads.payloadSetDigestHex,
    exactStaticRouteSetDigestHex: legacyRoutes.exactStaticRouteSetDigestHex,
  }, GENERATION_ID_DOMAIN);
  const blockers = sortedUniqueStrings([...new Set([
    ...review.blockers,
    ...legacyRoutes.routes.flatMap(route => route.blockerCodes),
    'target-network-identity-is-not-authenticated',
    'legacy-inventory-exhaustiveness-is-not-authenticated',
    'legacy-route-retirement-evidence-is-not-authenticated',
    'legacy-routes-are-not-retired',
    'federated-tracker-lineage-is-not-established',
    'federated-duplicate-prevention-lineage-is-not-established',
    'federated-reserve-lineage-is-not-established',
    'federated-genesis-creation-heights-are-not-bound',
    'federated-genesis-output-identities-are-not-bound',
    'federated-profile-is-not-activated',
    'federated-target-node-acceptance-is-not-established',
    'federated-confirmation-is-not-established',
    'federated-funds-authority-is-not-established',
  ])], 'federated cutover-generation blocker');
  const binding = {
    schema: SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_SCHEMA,
    version: 1 as const,
    status: SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_STATUS,
    generation: {
      label: SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_LABEL,
      generationIdHex,
      settlementNetworkId: 'ergo-testnet' as const,
      sourceNetworkScope: 'public-testnet' as const,
      trustModel: 'federated_non_trustless' as const,
    },
    sourceReview,
    target,
    globalReplay,
    legacyRoutes,
    blockers,
    checks: {
      sameProcessFamilyCompilerIdentityVerified: true as const,
      exactTrackerContractIdentityVerified: true as const,
      sameProcessCutoverReviewVerified: true as const,
      sameProcessHistoricalReplayVerified: true as const,
      exactSourceRuntimeIdentityMatched: true as const,
      exactStaticLegacyRouteSetMatched: true as const,
      globalReplayLineageMatched: true as const,
      targetContractIdentitiesBound: true as const,
      targetGenesisPayloadsBound: true as const,
      targetContractsDisjointFromReviewedApplicationAndV5: true as const,
      callerRetirementClaimsAccepted: false as const,
    },
    boundaries: falseBoundaries(),
  };
  const manifest = deepFreeze({
    ...binding,
    manifestDigestHex: sha256CanonicalJson(binding, MANIFEST_DIGEST_DOMAIN),
  });
  manifests.add(manifest);
  return manifest;
}

export function validateSubstrateFederatedCutoverGenerationV1(
  input: ValidateSubstrateFederatedCutoverGenerationV1Input,
): Readonly<ValidatedSubstrateFederatedCutoverGenerationV1> {
  exactRecord(input, [
    'familyIdentity',
    'trackerContract',
    'cutoverReview',
    'historicalReplayGenesis',
    'manifest',
  ], 'substrate federated cutover-generation validation input');
  if (input.manifest === null || typeof input.manifest !== 'object') {
    throw new Error('federated cutover-generation manifest must be an object');
  }
  const expected = buildSubstrateFederatedCutoverGenerationV1({
    familyIdentity: input.familyIdentity,
    trackerContract: input.trackerContract,
    cutoverReview: input.cutoverReview,
    historicalReplayGenesis: input.historicalReplayGenesis,
  });
  if (canonicalJson(input.manifest) !== canonicalJson(expected)) {
    throw new Error(
      'federated cutover-generation manifest differs from its exact source inputs',
    );
  }
  return deepFreeze({
    manifest: expected,
    validation: {
      exactSourceInputsReplayed: true as const,
      canonicalManifestMatched: true as const,
      callerAuthorityClaimsAccepted: false as const,
      targetNodeAcceptanceEstablished: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
}

export function assertSubstrateFederatedCutoverGenerationV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedCutoverGenerationV1Manifest> {
  if (value === null || typeof value !== 'object' || !manifests.has(value)) {
    throw new Error(
      'federated cutover-generation manifest was not built in this process',
    );
  }
}

function buildSourceReview(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
): SubstrateFederatedCutoverGenerationV1Manifest['sourceReview'] {
  return deepFreeze({
    cutoverReviewProfileDigestHex: fixedHex(
      review.profileDigestHex,
      32,
      'cutover review-profile digest',
    ),
    compatibilityInventoryPacketDigestHex: fixedHex(
      review.components.compatibilityInventoryPacketDigestHex,
      32,
      'compatibility inventory packet digest',
    ),
    historicalReplayGenesisPacketDigestHex: fixedHex(
      review.components.historicalReplayGenesisPacketDigestHex,
      32,
      'review historical replay-genesis packet digest',
    ),
    sourceLineageProfileIdHex: fixedHex(
      review.application.lineageProfileIdHex,
      32,
      'source V4 lineage profile ID',
    ),
    sourceRuntimeProfileIdHex: fixedHex(
      review.application.runtimeProfileIdHex,
      32,
      'source runtime profile ID',
    ),
    sourceChainId: canonicalUint64(review.scope.sourceChainId, 'source chain ID'),
    sourceContractIds: normalizeContractIds(review.application.contractIds),
  });
}

function buildTarget(
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  tracker: Readonly<SubstrateFederatedTrackerContractV1Identity>,
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  importedReplayDigestHex: string,
): SubstrateFederatedCutoverGenerationV1Manifest['target'] {
  const decoded = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  const exactPairs: readonly (readonly [unknown, unknown, string])[] = [
    [decoded.trackerContractIdHex, tracker.contractIdHex, 'tracker contract ID'],
    [decoded.trackerTemplateSourceSha256Hex, tracker.templateSourceSha256Hex,
      'tracker template digest'],
    [decoded.trackerNftIdHex, tracker.trackerNftIdHex, 'tracker NFT ID'],
    [decoded.sourceNetworkIdHex, tracker.application.sourceNetworkIdHex,
      'source network ID'],
    [decoded.sidechainIdHex, tracker.application.sidechainIdHex, 'sidechain ID'],
    [decoded.bridgeAddressHex, tracker.application.bridgeAddressHex,
      'bridge address'],
    [decoded.tokenAddressHex, tracker.application.tokenAddressHex, 'token address'],
    [decoded.runtimeProfileIdHex, tracker.application.runtimeProfileIdHex,
      'runtime profile ID'],
    [decoded.settlementProfileIdHex, tracker.application.settlementProfileIdHex,
      'settlement profile ID'],
    [decoded.federationProfileIdHex, tracker.federationProfileIdHex,
      'federation profile ID'],
    [decoded.sourceAttestationKeySetDigestHex,
      tracker.sourceAttestationKeySetDigestHex, 'source key-set digest'],
    [decoded.sourceAttestationThreshold, tracker.sourceAttestationThreshold,
      'source threshold'],
    [decoded.ergoAdmissionKeySetDigestHex, tracker.ergoAdmissionKeySetDigestHex,
      'Ergo admission key-set digest'],
    [decoded.ergoAdmissionThreshold, tracker.ergoAdmissionThreshold,
      'Ergo admission threshold'],
    [decoded.federationEpoch, tracker.federationEpoch, 'federation epoch'],
  ];
  for (const [left, right, label] of exactPairs) {
    if (left !== right) {
      throw new Error(`federated cutover target ${label} differs across family and tracker`);
    }
  }
  const reviewPairs: readonly (readonly [unknown, unknown, string])[] = [
    [addressHex(review.deployment.bridgeAddress, 'review bridge address'),
      tracker.application.bridgeAddressHex, 'bridge address'],
    [addressHex(review.deployment.tokenAddress, 'review token address'),
      tracker.application.tokenAddressHex, 'token address'],
    [review.deployment.bridgeRuntimeCodeSha256Hex,
      tracker.application.bridgeRuntimeCodeSha256Hex, 'bridge runtime digest'],
    [review.deployment.bridgeRuntimeCodeBytes,
      tracker.application.bridgeRuntimeCodeBytes, 'bridge runtime length'],
    [review.deployment.tokenRuntimeCodeSha256Hex,
      tracker.application.tokenRuntimeCodeSha256Hex, 'token runtime digest'],
    [review.deployment.tokenRuntimeCodeBytes,
      tracker.application.tokenRuntimeCodeBytes, 'token runtime length'],
    [review.application.runtimeProfileIdHex,
      tracker.application.runtimeProfileIdHex, 'runtime profile ID'],
  ];
  for (const [left, right, label] of reviewPairs) {
    if (left !== right) {
      throw new Error(`federated cutover target ${label} differs from the source review`);
    }
  }
  const duplicatePrevention = contractArtifact(
    family.contracts.duplicatePrevention,
    SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.duplicatePrevention,
    'duplicate-prevention',
  );
  const sourceLock = contractArtifact(
    family.contracts.sourceLock,
    SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.sourceLock,
    'source-lock',
  );
  const pooledReserve = contractArtifact(
    family.contracts.pooledReserve,
    SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.pooledReserve,
    'pooled-reserve',
  );
  const singletonIds = [
    tracker.trackerNftIdHex,
    family.profile.duplicatePreventionNftIdHex,
    family.profile.pooledReserveNftIdHex,
  ].map((value, index) => fixedHex(value, 32, `target singleton ID ${index}`));
  if (new Set(singletonIds).size !== singletonIds.length) {
    throw new Error('federated cutover target singleton lineages must be distinct');
  }
  const lineages = deepFreeze({
    tracker: {
      contractIdHex: fixedHex(tracker.contractIdHex, 32, 'tracker contract ID'),
      templateSha256Hex: fixedHex(
        tracker.templateSourceSha256Hex,
        32,
        'tracker template digest',
      ),
      resolvedSourceSha256Hex: fixedHex(
        tracker.resolvedSourceSha256Hex,
        32,
        'tracker resolved-source digest',
      ),
      propositionBytes: positiveInteger(
        tracker.propositionBytes,
        'tracker proposition length',
      ),
      propositionSha256Hex: fixedHex(
        tracker.propositionSha256Hex,
        32,
        'tracker proposition digest',
      ),
      propositionHex: variableHex(
        tracker.propositionHex,
        'tracker proposition bytes',
      ),
      singletonTokenIdHex: singletonIds[0]!,
      genesisInputBoxIdHex: singletonIds[0]!,
      sigmaStateCommit: commitHex(
        tracker.sigmaStateCommit,
        'tracker SigmaState commit',
      ),
    },
    duplicatePrevention: {
      ...duplicatePrevention,
      singletonTokenIdHex: singletonIds[1]!,
      genesisInputBoxIdHex: singletonIds[1]!,
    },
    sourceLock,
    pooledReserve: {
      ...pooledReserve,
      singletonTokenIdHex: singletonIds[2]!,
      genesisInputBoxIdHex: singletonIds[2]!,
    },
  });
  const genesisPayloads = buildTargetGenesisPayloads(
    family,
    tracker,
    lineages,
    importedReplayDigestHex,
  );
  return deepFreeze({
    compilerBatchSha256Hex: fixedHex(
      family.compilerBatchSha256Hex,
      32,
      'federated family compiler-batch digest',
    ),
    profile: {
      familyIdHex: fixedHex(family.profile.familyIdHex, 32, 'federated family ID'),
      encodedProfileHex: variableHex(
        family.profile.encodedProfileHex,
        'federated encoded family profile',
      ),
      settlementProfileIdHex: fixedHex(
        decoded.settlementProfileIdHex,
        32,
        'federated settlement profile ID',
      ),
    },
    sourceRuntime: {
      sourceNetworkIdHex: fixedHex(
        tracker.application.sourceNetworkIdHex,
        32,
        'federated source network ID',
      ),
      sidechainIdHex: fixedHex(
        tracker.application.sidechainIdHex,
        32,
        'federated sidechain ID',
      ),
      bridgeAddressHex: fixedHex(
        tracker.application.bridgeAddressHex,
        20,
        'federated bridge address',
      ),
      tokenAddressHex: fixedHex(
        tracker.application.tokenAddressHex,
        20,
        'federated token address',
      ),
      bridgeRuntimeCodeSha256Hex: fixedHex(
        tracker.application.bridgeRuntimeCodeSha256Hex,
        32,
        'federated bridge runtime digest',
      ),
      bridgeRuntimeCodeBytes: positiveInteger(
        tracker.application.bridgeRuntimeCodeBytes,
        'federated bridge runtime length',
      ),
      tokenRuntimeCodeSha256Hex: fixedHex(
        tracker.application.tokenRuntimeCodeSha256Hex,
        32,
        'federated token runtime digest',
      ),
      tokenRuntimeCodeBytes: positiveInteger(
        tracker.application.tokenRuntimeCodeBytes,
        'federated token runtime length',
      ),
      sourceRuntimeCodeSha256Hex: fixedHex(
        tracker.application.sourceRuntimeCodeSha256Hex,
        32,
        'federated source runtime digest',
      ),
      sourceRuntimeCodeBytes: positiveInteger(
        tracker.application.sourceRuntimeCodeBytes,
        'federated source runtime length',
      ),
      runtimeProfileIdHex: fixedHex(
        tracker.application.runtimeProfileIdHex,
        32,
        'federated runtime profile ID',
      ),
    },
    federation: {
      federationProfileIdHex: fixedHex(
        tracker.federationProfileIdHex,
        32,
        'federation profile ID',
      ),
      federationEpoch: canonicalUint64(
        tracker.federationEpoch,
        'federation epoch',
      ),
      sourceAttestationKeySetDigestHex: fixedHex(
        tracker.sourceAttestationKeySetDigestHex,
        32,
        'source-attestation key-set digest',
      ),
      sourceAttestationThreshold: positiveInteger(
        tracker.sourceAttestationThreshold,
        'source-attestation threshold',
      ),
      ergoAdmissionKeySetDigestHex: fixedHex(
        tracker.ergoAdmissionKeySetDigestHex,
        32,
        'Ergo-admission key-set digest',
      ),
      ergoAdmissionThreshold: positiveInteger(
        tracker.ergoAdmissionThreshold,
        'Ergo-admission threshold',
      ),
      ergoAdmissionPublicKeysHex: deepFreeze(
        tracker.ergoAdmissionPublicKeysHex.map((key, index) =>
          fixedHex(key, 33, `Ergo-admission public key ${index}`)
        ),
      ),
    },
    lineages,
    genesisPayloads,
  });
}

function buildTargetGenesisPayloads(
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  tracker: Readonly<SubstrateFederatedTrackerContractV1Identity>,
  lineages: SubstrateFederatedCutoverGenerationV1Manifest['target']['lineages'],
  importedReplayDigestHex: string,
): SubstrateFederatedCutoverGenerationV1Manifest['target']['genesisPayloads'] {
  const familyIdHex = fixedHex(
    family.profile.familyIdHex,
    32,
    'federated genesis family ID',
  );
  const replayDigestHex = fixedHex(
    importedReplayDigestHex,
    33,
    'federated genesis replay digest',
  );
  const emptyTrackerDigestHex = fixedHex(
    getSubstrateFederatedTrackerDigestV1Hex([]),
    33,
    'federated empty tracker digest',
  );
  const emptyDepositDigestHex = fixedHex(
    getPooledReserveEmptyDigest(),
    33,
    'federated empty deposit digest',
  );
  const trackerPayload = targetGenesisPayload(
    'tracker',
    lineages.tracker.propositionHex,
    lineages.tracker.singletonTokenIdHex,
    {
      R4: encodeCollByteRegister(Buffer.from(
        fixedHex(tracker.federationProfileIdHex, 32, 'tracker federation profile ID'),
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyTrackerDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        370,
      ),
      R6: encodeCollByteRegister(Buffer.from(
        fixedHex(tracker.application.sidechainIdHex, 32, 'tracker sidechain ID'),
        'hex',
      )),
      R7: encodeLongRegister(0n),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(
        fixedHex(
          tracker.ergoAdmissionKeySetDigestHex,
          32,
          'tracker Ergo-admission key-set digest',
        ),
        'hex',
      )),
    },
  );
  const duplicatePreventionPayload = targetGenesisPayload(
    'duplicate-prevention',
    lineages.duplicatePrevention.propositionHex,
    lineages.duplicatePrevention.singletonTokenIdHex,
    {
      R4: encodeCollByteRegister(Buffer.from(familyIdHex, 'hex')),
      R5: encodeAvlTreeRegister(
        Buffer.from(replayDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    },
  );
  const pooledReservePayload = targetGenesisPayload(
    'pooled-reserve',
    lineages.pooledReserve.propositionHex,
    lineages.pooledReserve.singletonTokenIdHex,
    {
      R4: encodeCollByteRegister(Buffer.from(familyIdHex, 'hex')),
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyDepositDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(0n),
    },
  );
  const payloads = {
    tracker: trackerPayload,
    duplicatePrevention: duplicatePreventionPayload,
    pooledReserve: pooledReservePayload,
  };
  return deepFreeze({
    schema: 'e2s.substrate-federated-cutover-genesis-payloads.v1' as const,
    version: 1 as const,
    payloadSetDigestHex: sha256CanonicalJson(
      payloads,
      GENESIS_PAYLOAD_SET_DIGEST_DOMAIN,
    ),
    importedReplayDigestHex: replayDigestHex,
    emptyTrackerDigestHex,
    emptyDepositDigestHex,
    ...payloads,
    creationHeightsBoundAtMaterialization: false as const,
    outputIdsBoundAtMaterialization: false as const,
  });
}

function targetGenesisPayload(
  role: TargetGenesisPayloadV1['role'],
  ergoTreeHex: string,
  singletonTokenIdHex: string,
  additionalRegisters: Readonly<Record<string, string>>,
): Readonly<TargetGenesisPayloadV1> {
  const binding = deepFreeze({
    role,
    valueNanoErg: GENESIS_SINGLETON_VALUE_NANOERG,
    ergoTreeHex: variableHex(ergoTreeHex, `${role} genesis ErgoTree`),
    assets: [{
      tokenId: fixedHex(singletonTokenIdHex, 32, `${role} genesis singleton ID`),
      amount: '1' as const,
    }],
    additionalRegisters: deepFreeze({ ...additionalRegisters }),
  });
  return deepFreeze({
    ...binding,
    payloadDigestHex: sha256CanonicalJson(
      binding,
      `${GENESIS_PAYLOAD_DIGEST_DOMAIN}_${role.toUpperCase()}`,
    ),
  });
}

function buildGlobalReplay(
  historical: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >,
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
): SubstrateFederatedCutoverGenerationV1Manifest['globalReplay'] {
  const sourcePacketDigestHex = fixedHex(
    historical.packetDigestHex,
    32,
    'historical replay packet digest',
  );
  if (
    sourcePacketDigestHex
      !== fixedHex(
        review.components.historicalReplayGenesisPacketDigestHex,
        32,
        'review historical replay packet digest',
      )
  ) {
    throw new Error('federated cutover replay packet differs from the cutover review');
  }
  const sourceLineageProfileIdHex = prefixedFixedHex(
    historical.lineage.lineageProfileIdHex,
    32,
    'historical replay source lineage profile ID',
  );
  if (
    sourceLineageProfileIdHex
      !== fixedHex(
        review.application.lineageProfileIdHex,
        32,
        'review source lineage profile ID',
      )
  ) {
    throw new Error('federated cutover replay lineage differs from the cutover review');
  }
  if (
    fixedHex(
      historical.observation.cutoverObservationReportDigestHex,
      32,
      'historical cutover-observation digest',
    ) !== fixedHex(
      review.components.ergoCutoverObservationReportDigestHex,
      32,
      'review cutover-observation digest',
    )
  ) {
    throw new Error('federated cutover replay observation differs from the cutover review');
  }
  if (
    fixedHex(
      historical.observation.routeProfileDigestHex,
      32,
      'historical route-profile digest',
    ) !== fixedHex(
      review.replay.routeProfileDigestHex,
      32,
      'review route-profile digest',
    )
    || fixedHex(
      historical.observation.requirementsDigestHex,
      32,
      'historical route-requirements digest',
    ) !== fixedHex(
      review.replay.routeRequirementsDigestHex,
      32,
      'review route-requirements digest',
    )
    || historical.observation.networkId !== 'ergo-testnet'
  ) {
    throw new Error('federated cutover replay route profile differs from the review');
  }
  const canonicalBurnIdsHex = normalizeStrictHexSet(
    historical.duplicatePreventionGenesis.canonicalBurnIdsHex,
    32,
    'historical canonical burn ID',
  );
  const duplicatePreventionDigestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'recomputed global replay digest',
  );
  const sourceRegisters = deepFreeze({
    R4: encodeCollByteRegister(Buffer.from(sourceLineageProfileIdHex, 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(duplicatePreventionDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      1,
    ),
  });
  if (
    duplicatePreventionDigestHex
      !== fixedHex(
        historical.duplicatePreventionGenesis.digestHex,
        33,
        'historical replay duplicate-prevention digest',
      )
    || duplicatePreventionDigestHex
      !== fixedHex(
        review.replay.duplicatePreventionGenesisDigestHex,
        33,
        'review duplicate-prevention digest',
      )
    || sourceRegisters.R4 !== historical.duplicatePreventionGenesis.registers.R4
    || sourceRegisters.R5 !== historical.duplicatePreventionGenesis.registers.R5
  ) {
    throw new Error('federated cutover replay digest or registers drifted');
  }
  const reviewedLineages = uniqueMap(
    review.replay.lineages,
    lineage => lineageKey(lineage.routeId, lineage.instanceId),
    'review replay lineage',
  );
  const contributions = historical.contributions.map(contribution => {
    const key = lineageKey(contribution.routeId, contribution.instanceId);
    const reviewed = reviewedLineages.get(key);
    if (reviewed === undefined) {
      throw new Error(`historical replay contribution ${key} is absent from the review`);
    }
    const canonical = normalizeStrictHexSet(
      contribution.canonicalBurnIdsHex,
      32,
      `${key} canonical burn ID`,
    );
    if (
      reviewed.lineagePacketDigestHex !== contribution.lineagePacketDigestHex
      || reviewed.lineageClassification !== contribution.lineageClassification
      || reviewed.rawReplayKeyCount !== contribution.rawReplayKeyCount
      || reviewed.contributionKind !== contribution.kind
      || reviewed.replayImportPacketDigestHex
        !== contribution.replayImportPacketDigestHex
      || reviewed.canonicalBurnIdCount !== canonical.length
    ) {
      throw new Error(`historical replay contribution ${key} differs from the review`);
    }
    const empty = contribution.kind === 'empty-observed-lineage';
    if (
      reviewed.eventMapping
        !== (empty
          ? 'not-required-empty-lineage'
          : 'event-complete-mapping-bound')
      || reviewed.sourceAdmission
        !== (empty ? 'not-required-empty-lineage' : 'source-admission-bound')
    ) {
      throw new Error(`historical replay contribution ${key} has invalid admission semantics`);
    }
    reviewedLineages.delete(key);
    return deepFreeze({
      kind: contribution.kind,
      routeId: nonemptyAscii(contribution.routeId, `${key} route ID`),
      sourceSurface: nonemptyAscii(
        contribution.sourceSurface,
        `${key} source surface`,
      ),
      instanceId: nonemptyAscii(contribution.instanceId, `${key} instance ID`),
      lineagePacketDigestHex: fixedHex(
        contribution.lineagePacketDigestHex,
        32,
        `${key} lineage packet digest`,
      ),
      lineageClassification: contribution.lineageClassification,
      rawReplayKeyCount: nonnegativeInteger(
        contribution.rawReplayKeyCount,
        `${key} raw replay-key count`,
      ),
      eventMapping: reviewed.eventMapping,
      sourceAdmission: reviewed.sourceAdmission,
      replayImportPacketDigestHex:
        contribution.replayImportPacketDigestHex === null
          ? null
          : fixedHex(
            contribution.replayImportPacketDigestHex,
            32,
            `${key} replay-import packet digest`,
          ),
      canonicalBurnIdsHex: canonical,
      canonicalBurnIdsDigestHex: fixedHex(
        reviewed.canonicalBurnIdsDigestHex,
        32,
        `${key} canonical burn-set digest`,
      ),
    });
  }).sort((left, right) => compareCodeUnits(
    lineageKey(left.routeId, left.instanceId),
    lineageKey(right.routeId, right.instanceId),
  ));
  if (reviewedLineages.size !== 0) {
    throw new Error('cutover review contains replay lineages absent from the global packet');
  }
  const composedBurnIds = contributions.flatMap(
    contribution => contribution.canonicalBurnIdsHex,
  ).sort(compareCodeUnits);
  if (canonicalJson(composedBurnIds) !== canonicalJson(canonicalBurnIdsHex)) {
    throw new Error('historical replay contributions do not compose the global burn set');
  }
  if (
    review.replay.historicalLineageCount !== contributions.length
    || review.replay.importedCanonicalBurnIdCount !== canonicalBurnIdsHex.length
    || review.replay.allObservedLineagesComposed !== true
    || review.replay.inventoryExhaustivenessAuthenticated !== false
  ) {
    throw new Error('cutover review replay summary is not the blocked global composition');
  }
  return deepFreeze({
    sourcePacketDigestHex,
    cutoverObservationReportDigestHex: fixedHex(
      historical.observation.cutoverObservationReportDigestHex,
      32,
      'historical cutover-observation digest',
    ),
    sourceLineageProfileIdHex,
    lineageSetDigestHex: fixedHex(
      review.replay.lineageSetDigestHex,
      32,
      'review replay-lineage set digest',
    ),
    canonicalBurnIdsHex,
    canonicalBurnIdCount: canonicalBurnIdsHex.length,
    duplicatePreventionDigestHex,
    sourceRegisters,
    contributions,
  });
}

function buildLegacyRoutes(
  reviewRoutes: readonly TestnetCutoverReviewRouteV4[],
): SubstrateFederatedCutoverGenerationV1Manifest['legacyRoutes'] {
  const expected = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const expectedV4 = expected.filter(
    requirement => requirement.introducedBy === 'v4-cutover-review',
  );
  const actual = uniqueMap(
    reviewRoutes,
    route => route.routeId,
    'cutover review route',
  );
  if (
    actual.size !== expectedV4.length
    || expectedV4.some(requirement => !actual.has(requirement.routeId))
  ) {
    throw new Error('federated cutover requires the exact V4 legacy route set');
  }
  const routes = expected.map(requirement => {
    if (requirement.introducedBy === 'v5-integrated-settlement') {
      return pendingRoute(requirement);
    }
    const route = actual.get(requirement.routeId)!;
    assertRouteRequirement(route, requirement);
    if (
      route.retirement.evidenceAuthenticated !== false
      || route.retirement.routeRetired !== false
      || route.declaration.declaredStatus !== 'inactive-unverified'
    ) {
      throw new Error(`federated cutover does not accept retirement claims for ${route.routeId}`);
    }
    const inventoryBindingDigestHex = fixedHex(
      route.inventory.bindingDigestHex,
      32,
      `${route.routeId} inventory digest`,
    );
    if (
      inventoryBindingDigestHex
        !== fixedHex(
          route.declaration.inventoryEvidenceDigestHex,
          32,
          `${route.routeId} declared inventory digest`,
        )
    ) {
      throw new Error(`legacy route ${route.routeId} declaration does not bind its inventory`);
    }
    const retirementEvidenceDigestHex = fixedHex(
      route.declaration.retirementEvidenceDigestHex,
      32,
      `${route.routeId} retirement-evidence digest`,
    );
    if (retirementEvidenceDigestHex === inventoryBindingDigestHex) {
      throw new Error(`legacy route ${route.routeId} reuses inventory as retirement evidence`);
    }
    const instanceIds = new Set<string>();
    let drainedInstanceCount = 0;
    let neverFundedInstanceCount = 0;
    for (const instance of route.inventory.instances) {
      const instanceId = nonemptyAscii(
        instance.instanceId,
        `${route.routeId} instance ID`,
      );
      if (instanceIds.has(instanceId)) {
        throw new Error(`legacy route ${route.routeId} repeats instance ${instanceId}`);
      }
      instanceIds.add(instanceId);
      if (
        instance.inventoryClassification === 'funded'
        || instance.inventoryClassification === 'unresolved'
      ) {
        throw new Error(
          `legacy route ${route.routeId} instance ${instanceId} is ${instance.inventoryClassification}`,
        );
      }
      if (instance.inventoryClassification === 'drained') drainedInstanceCount += 1;
      if (instance.inventoryClassification === 'never-funded') {
        neverFundedInstanceCount += 1;
      }
    }
    return deepFreeze({
      routeId: route.routeId,
      layer: route.layer,
      routeClass: route.routeClass,
      sourceSurface: route.sourceSurface,
      historicalAuthority: route.historicalAuthority,
      requiredDisposition: route.requiredDisposition,
      introducedBy: requirement.introducedBy,
      contractIdHex: null,
      inventorySource: route.inventory.source,
      inventoryBindingDigestHex,
      sanitizedInventoryBindingDigestHex: fixedHex(
        route.inventory.sanitizedBindingDigestHex,
        32,
        `${route.routeId} sanitized inventory digest`,
      ),
      retirementEvidenceDigestHex,
      instanceIds: deepFreeze([...instanceIds].sort(compareCodeUnits)),
      drainedInstanceCount,
      neverFundedInstanceCount,
      blockerCodes: sortedUniqueStrings(
        route.inventory.blockerCodes,
        `${route.routeId} inventory blocker`,
      ),
      retirementEvidenceAuthenticated: false as const,
      routeRetired: false as const,
    });
  });
  const historicalAuthorityCounts = deepFreeze({
    ownerKey: routes.filter(route =>
      route.historicalAuthority === 'owner-key'
      || route.historicalAuthority === 'token-owner-key'
    ).length,
    committee: routes.filter(route =>
      route.historicalAuthority === 'committee'
      || route.historicalAuthority === 'committee-or-depositor-timeout'
    ).length,
    singleR9: routes.filter(
      route => route.historicalAuthority === 'r9-and-anchor-miner',
    ).length,
    rootOrSelectedProducer: routes.filter(route =>
      route.historicalAuthority === 'root-origin'
      || route.historicalAuthority === 'selected-bridge-address'
    ).length,
    permissionless: routes.filter(
      route => route.historicalAuthority === 'permissionless-caller',
    ).length,
    reservedValidity: routes.filter(
      route => route.historicalAuthority === 'reserved-validity-proof',
    ).length,
    localRuntimeCapability: routes.filter(
      route => route.historicalAuthority === 'local-runtime-capability',
    ).length,
  });
  if (
    historicalAuthorityCounts.ownerKey === 0
    || historicalAuthorityCounts.committee === 0
    || historicalAuthorityCounts.singleR9 === 0
    || Object.values(historicalAuthorityCounts).reduce(
      (sum, count) => sum + count,
      0,
    ) !== routes.length
  ) {
    throw new Error('federated cutover legacy authority coverage is incomplete');
  }
  return deepFreeze({
    exactStaticRouteSetDigestHex: sha256CanonicalJson(
      expected,
      STATIC_ROUTE_SET_DIGEST_DOMAIN,
    ),
    boundRouteSetDigestHex: sha256CanonicalJson(
      routes,
      `${STATIC_ROUTE_SET_DIGEST_DOMAIN}_BOUND`,
    ),
    routeCount: routes.length,
    historicalAuthorityCounts,
    routes,
  });
}

function pendingRoute(
  requirement: LegacyRouteRetirementRequirementV6,
): Readonly<LegacyRouteGenerationRequirementV1> {
  if (
    requirement.introducedBy !== 'v5-integrated-settlement'
    || requirement.contractIdHex === null
  ) {
    throw new Error('pending federated cutover route must bind one V5 contract');
  }
  const binding = {
    routeId: requirement.routeId,
    layer: requirement.layer,
    routeClass: requirement.routeClass,
    sourceSurface: requirement.sourceSurface,
    historicalAuthority: requirement.historicalAuthority,
    requiredDisposition: requirement.requiredDisposition,
    introducedBy: requirement.introducedBy,
    contractIdHex: fixedHex(
      requirement.contractIdHex,
      32,
      `${requirement.routeId} contract ID`,
    ),
    inventorySource: 'pending-authenticated-inventory' as const,
  };
  return deepFreeze({
    ...binding,
    inventoryBindingDigestHex: sha256CanonicalJson(
      binding,
      PENDING_ROUTE_INVENTORY_DIGEST_DOMAIN,
    ),
    sanitizedInventoryBindingDigestHex: sha256CanonicalJson(
      { ...binding, localObservationIdentifiersIncluded: false },
      PENDING_ROUTE_INVENTORY_DIGEST_DOMAIN,
    ),
    retirementEvidenceDigestHex: sha256CanonicalJson(
      { ...binding, requiredEvidence: 'authenticated-never-funded-and-disabled' },
      PENDING_ROUTE_RETIREMENT_DIGEST_DOMAIN,
    ),
    instanceIds: deepFreeze([] as string[]),
    drainedInstanceCount: 0,
    neverFundedInstanceCount: 0,
    blockerCodes: deepFreeze([
      'authenticated-integrated-v5-inventory-is-not-supplied',
      'integrated-v5-route-retirement-is-not-authenticated',
    ]),
    retirementEvidenceAuthenticated: false as const,
    routeRetired: false as const,
  });
}

function assertKnownTargetContractsAreDisjoint(
  source: SubstrateFederatedCutoverGenerationV1Manifest['sourceReview'],
  target: SubstrateFederatedCutoverGenerationV1Manifest['target'],
  routes: readonly LegacyRouteGenerationRequirementV1[],
): void {
  const sourceIds = new Set(Object.values(source.sourceContractIds));
  for (const route of routes) {
    if (route.contractIdHex !== null) sourceIds.add(route.contractIdHex);
  }
  const targetIds = [
    target.lineages.tracker.contractIdHex,
    target.lineages.duplicatePrevention.contractIdHex,
    target.lineages.sourceLock.contractIdHex,
    target.lineages.pooledReserve.contractIdHex,
  ];
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error('federated cutover target contracts must be distinct');
  }
  if (targetIds.some(contractIdHex => sourceIds.has(contractIdHex))) {
    throw new Error(
      'federated cutover target contract overlaps the reviewed application or integrated V5 route',
    );
  }
  if (target.profile.familyIdHex === source.sourceLineageProfileIdHex) {
    throw new Error('federated cutover target lineage must differ from V4');
  }
}

function assertNonAuthorizingSources(
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  tracker: Readonly<SubstrateFederatedTrackerContractV1Identity>,
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  historical: Readonly<ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet>,
): void {
  if (
    review.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS
    || review.scope.settlementNetworkId !== 'ergo-testnet'
    || review.scope.sourceNetworkScope !== 'public-testnet'
    || review.scope.sourceOriginIdentifiersIncluded !== false
    || review.scope.rawObservationObjectsIncluded !== false
    || Object.values(review.authority).some(value => value !== false)
    || Object.values(family.boundaries).some(value => value !== false)
    || tracker.sourceSignaturesVerifiedOnChain !== false
    || tracker.jvmReductionAccepted !== false
    || tracker.profileActivated !== false
    || tracker.signingPerformed !== false
    || tracker.submissionPerformed !== false
    || tracker.broadcastPerformed !== false
    || tracker.fundsAuthorityEstablished !== false
    || tracker.gate5Closed !== false
    || tracker.trustlessStatusEstablished !== false
    || historical.boundaries.profileInstanceInventoryExhaustiveAuthenticated !== false
    || historical.boundaries.legacyRoutesRetired !== false
    || historical.boundaries.profileActivated !== false
    || historical.boundaries.targetNodeAcceptanceEstablished !== false
    || historical.boundaries.nodeCheckPerformed !== false
    || historical.boundaries.signingAuthorityEstablished !== false
    || historical.boundaries.submissionAuthorityEstablished !== false
    || historical.boundaries.broadcastAuthorityEstablished !== false
    || historical.boundaries.fundsAuthorityEstablished !== false
    || historical.boundaries.gate5Closed !== false
    || historical.boundaries.trustlessStatusEstablished !== false
    || historical.boundaries.productionReadinessEstablished !== false
  ) {
    throw new Error('federated cutover generation requires non-authorizing source artifacts');
  }
}

function contractArtifact(
  contract: SubstrateFederatedSettlementFamilyV1Identity['contracts'][
    'duplicatePrevention'
  ],
  expectedContractIdHex: string,
  label: string,
): Readonly<TargetContractArtifactV1> {
  if (contract.receipt.contractIdHex !== expectedContractIdHex) {
    throw new Error(`${label} contract ID differs from the federated family`);
  }
  return deepFreeze({
    contractIdHex: fixedHex(contract.receipt.contractIdHex, 32, `${label} contract ID`),
    templateSha256Hex: fixedHex(
      contract.templateSha256Hex,
      32,
      `${label} template digest`,
    ),
    resolvedSourceSha256Hex: fixedHex(
      contract.resolvedSourceSha256Hex,
      32,
      `${label} resolved-source digest`,
    ),
    propositionBytes: positiveInteger(
      contract.receipt.propositionBytes,
      `${label} proposition length`,
    ),
    propositionSha256Hex: fixedHex(
      contract.receipt.propositionSha256Hex,
      32,
      `${label} proposition digest`,
    ),
    propositionHex: variableHex(
      contract.receipt.propositionHex,
      `${label} proposition bytes`,
    ),
  });
}

function assertRouteRequirement(
  route: TestnetCutoverReviewRouteV4,
  requirement: LegacyRouteRetirementRequirementV6,
): void {
  const exact = [
    'routeId',
    'layer',
    'routeClass',
    'sourceSurface',
    'historicalAuthority',
    'requiredDisposition',
  ] as const;
  if (exact.some(key => route[key] !== requirement[key])) {
    throw new Error(`legacy route ${requirement.routeId} differs from its requirement`);
  }
}

function normalizeContractIds(
  value: Readonly<Record<ContractRole, string>>,
): Readonly<Record<ContractRole, string>> {
  exactRecord(value, [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'source contract IDs');
  const normalized = deepFreeze({
    tracker: fixedHex(value.tracker, 32, 'source tracker contract ID'),
    duplicatePrevention: fixedHex(
      value.duplicatePrevention,
      32,
      'source duplicate-prevention contract ID',
    ),
    sourceLock: fixedHex(value.sourceLock, 32, 'source-lock contract ID'),
    pooledReserve: fixedHex(
      value.pooledReserve,
      32,
      'source pooled-reserve contract ID',
    ),
  });
  if (new Set(Object.values(normalized)).size !== 4) {
    throw new Error('source cutover-review contracts must be distinct');
  }
  return normalized;
}

function falseBoundaries(): SubstrateFederatedCutoverGenerationV1Manifest['boundaries'] {
  return deepFreeze({
    targetNetworkIdentityAuthenticated: false as const,
    inventoryExhaustivenessAuthenticated: false as const,
    retirementEvidenceAuthenticated: false as const,
    legacyRoutesRetired: false as const,
    trackerLineageEstablished: false as const,
    duplicatePreventionLineageEstablished: false as const,
    reserveLineageEstablished: false as const,
    profileActivated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    nodeCheckPerformed: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    confirmationEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function uniqueMap<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): Map<string, T> {
  if (!Array.isArray(values)) throw new Error(`${label}s must be an array`);
  const map = new Map<string, T>();
  for (const value of values) {
    const key = nonemptyAscii(keyOf(value), `${label} key`);
    if (map.has(key)) throw new Error(`${label} ${key} is duplicated`);
    map.set(key, value);
  }
  return map;
}

function normalizeStrictHexSet(
  values: readonly string[],
  bytes: number,
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label}s must be an array`);
  const normalized = values.map((value, index) =>
    fixedHex(value, bytes, `${label} ${index}`)
  );
  if (normalized.some((value, index) => index > 0 && normalized[index - 1]! >= value)) {
    throw new Error(`${label}s must be strictly sorted and unique`);
  }
  return deepFreeze(normalized);
}

function sortedUniqueStrings(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label}s must be an array`);
  const normalized = values.map(value => nonemptyAscii(value, label))
    .sort(compareCodeUnits);
  if (normalized.some((value, index) => index > 0 && normalized[index - 1] === value)) {
    throw new Error(`${label}s contain duplicates`);
  }
  return deepFreeze(normalized);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
    || /^0+$/.test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} nonzero lowercase hex bytes`);
  }
  return value;
}

function prefixedFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must use a lowercase 0x prefix`);
  }
  return fixedHex(value.slice(2), bytes, label);
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase whole-byte hex`);
  }
  return value;
}

function addressHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  return fixedHex(normalized, 20, label);
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function commitHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be one lowercase 40-hex commit`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function nonemptyAscii(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !Buffer.from(value, 'utf8').equals(Buffer.from(value, 'ascii'))
  ) {
    throw new Error(`${label} must be non-empty ASCII`);
  }
  return value;
}

function lineageKey(routeId: string, instanceId: string): string {
  return `${nonemptyAscii(routeId, 'replay route ID')}\u0000${
    nonemptyAscii(instanceId, 'replay instance ID')
  }`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as object)) deepFreeze(child, seen);
  return Object.freeze(value);
}
