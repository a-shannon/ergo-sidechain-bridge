/**
 * Inactive registration candidate for the target-specific federated profile.
 * It binds setup lineages, replay history, and every legacy-route blocker but
 * exposes no runtime registration, checking, signing, or transport capability.
 */

import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { snapshotStrictData } from './strict-data-snapshot.js';
import {
  assertSubstrateFederatedCutoverGenerationV1Provenance,
  type SubstrateFederatedCutoverGenerationV1Manifest,
} from './substrate-federated-cutover-generation-v1.js';
import {
  assertSubstrateFederatedGenesisSetupCheckRequestV1ProcessProvenance,
  type SubstrateFederatedGenesisSetupCheckIssuanceV1,
  type SubstrateFederatedGenesisSetupCheckRequestV1,
} from './substrate-federated-genesis-setup-check-request-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
  type LegacyRouteRetirementRequirementV6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';

export const SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1_SCHEMA =
  'e2s.substrate-federated-inactive-registration-candidate.v1' as const;

const REQUIREMENT_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_REQUIREMENT_SET_V1';
const REGISTRATION_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_ID_V1';
const CANDIDATE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1';
const EXPECTED_LEGACY_ROUTE_COUNT = 53;
const candidates = new WeakSet<object>();

type SetupRole = SubstrateFederatedGenesisSetupCheckIssuanceV1['role'];
type LegacyRoute = SubstrateFederatedCutoverGenerationV1Manifest[
  'legacyRoutes'
]['routes'][number];

interface LegacyRouteIdentityV1 {
  readonly routeId: string;
  readonly layer: LegacyRouteRetirementRequirementV6['layer'];
  readonly routeClass: LegacyRouteRetirementRequirementV6['routeClass'];
  readonly sourceSurface: string;
  readonly historicalAuthority:
    LegacyRouteRetirementRequirementV6['historicalAuthority'];
  readonly requiredDisposition:
    LegacyRouteRetirementRequirementV6['requiredDisposition'];
  readonly introducedBy: LegacyRouteRetirementRequirementV6['introducedBy'];
  readonly contractIdHex: string | null;
}

export interface SubstrateFederatedInactiveRegistrationCandidateV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'inactive_blocked_registration_candidate';
  readonly candidateDigestHex: string;
  readonly registrationCandidateIdHex: string;
  readonly sourceBindings: Readonly<{
    readonly setupCheckRequestDigestHex: string;
    readonly provisioningPlanDigestHex: string;
    readonly targetGenerationCandidateIdHex: string;
    readonly targetProfileDigestHex: string;
    readonly cutoverGenerationManifestDigestHex: string;
    readonly semanticBaselineGenerationIdHex: string;
    readonly semanticBaselineFamilyIdHex: string;
    readonly exactStaticRouteSetDigestHex: string;
    readonly boundRouteSetDigestHex: string;
  }>;
  readonly target: SubstrateFederatedGenesisSetupCheckRequestV1['target'];
  readonly profile: SubstrateFederatedGenesisSetupCheckRequestV1['profile'];
  readonly predictedLineages: readonly Readonly<{
    readonly ordinal: 0 | 1 | 2;
    readonly role: SetupRole;
    readonly genesisInputBoxIdHex: string;
    readonly singletonTokenIdHex: string;
    readonly unsignedTransactionIdHex: string;
    readonly unsignedTransactionBodyDigestHex: string;
    readonly materializedTransactionDigestHex: string;
    readonly predictedStateOutputBoxIdHex: string;
    readonly stateOutputIndex: 0;
    readonly creationHeight: number;
  }>[];
  readonly globalReplay: SubstrateFederatedCutoverGenerationV1Manifest[
    'globalReplay'
  ];
  readonly retirement: Readonly<{
    readonly requirementSetDigestHex: string;
    readonly routeCount: 53;
    readonly unresolvedRouteCount: 53;
    readonly historicalAuthorityCounts:
      SubstrateFederatedCutoverGenerationV1Manifest[
        'legacyRoutes'
      ]['historicalAuthorityCounts'];
    readonly routes: readonly LegacyRoute[];
    readonly blockerCodes: readonly string[];
    readonly allRetirementEvidenceAuthenticated: false;
    readonly allLegacyRoutesRetired: false;
  }>;
  readonly registration: Readonly<{
    readonly status: 'inactive_blocked';
    readonly activeRegistrySelection: null;
    readonly runtimeSelectable: false;
    readonly activationConsumerExported: false;
  }>;
  readonly checks: Readonly<{
    readonly sameProcessSetupCheckRequestVerified: true;
    readonly sameProcessGenerationManifestVerified: true;
    readonly exact53RouteRequirementSetMatched: true;
    readonly importedReplayLineageBound: true;
    readonly allThreePredictedSingletonLineagesBound: true;
    readonly unresolvedBlockersPreserved: true;
    readonly identicalInventoryAndRetirementDigestRejected: true;
    readonly retirementEvidenceSemanticIndependenceEstablished: false;
    readonly callerRetirementClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly targetProfileApprovalAuthenticated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signedSetupAcceptanceEstablished: false;
    readonly canonicalLineagesEstablished: false;
    readonly inventoryExhaustivenessAuthenticated: false;
    readonly retirementEvidenceAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly globalReplayImportEstablished: false;
    readonly profileRegistered: false;
    readonly profileActivated: false;
    readonly runtimeSelectionEnabled: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export function buildSubstrateFederatedInactiveRegistrationCandidateV1(
  setupCheckRequest:
    Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>,
  generationManifest:
    Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): Readonly<SubstrateFederatedInactiveRegistrationCandidateV1> {
  const candidate = deriveCandidate(setupCheckRequest, generationManifest);
  candidates.add(candidate);
  return candidate;
}

export function validateSubstrateFederatedInactiveRegistrationCandidateV1(
  value: unknown,
  setupCheckRequest:
    Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>,
  generationManifest:
    Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): Readonly<SubstrateFederatedInactiveRegistrationCandidateV1> {
  const candidate = snapshotStrictData(
    value,
    'federated inactive registration candidate',
  );
  const expected = deriveCandidate(setupCheckRequest, generationManifest);
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error(
      'federated inactive registration candidate does not match its exact inputs',
    );
  }
  return expected;
}

export function assertSubstrateFederatedInactiveRegistrationCandidateV1Provenance(
  value: unknown,
  setupCheckRequest:
    Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>,
  generationManifest:
    Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): asserts value is Readonly<SubstrateFederatedInactiveRegistrationCandidateV1> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'federated inactive registration candidate was not built in this process',
    );
  }
  validateSubstrateFederatedInactiveRegistrationCandidateV1(
    value,
    setupCheckRequest,
    generationManifest,
  );
}

function deriveCandidate(
  setupCheckRequest:
    Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>,
  generationManifest:
    Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): Readonly<SubstrateFederatedInactiveRegistrationCandidateV1> {
  assertSubstrateFederatedGenesisSetupCheckRequestV1ProcessProvenance(
    setupCheckRequest,
  );
  assertSubstrateFederatedCutoverGenerationV1Provenance(generationManifest);
  assertSourceJoin(setupCheckRequest, generationManifest);

  const expectedRequirements = orderedStaticRequirements();
  const routes = orderedAndVerifiedRoutes(
    generationManifest.legacyRoutes.routes,
    expectedRequirements,
  );
  const requirementSetDigestHex = sha256CanonicalJson(
    expectedRequirements,
    REQUIREMENT_SET_DIGEST_DOMAIN,
  );
  const predictedLineages = deepFreeze(
    setupCheckRequest.orderedIssuances.map(issuance => ({ ...issuance })),
  );
  assertPredictedLineages(predictedLineages);
  const globalReplay = copyGlobalReplay(generationManifest.globalReplay);
  const blockerCodes = sortedUnique([
    ...generationManifest.blockers,
    ...routes.flatMap(route => route.blockerCodes),
  ]);
  if (blockerCodes.length === 0) {
    throw new Error('federated inactive registration has no preserved blockers');
  }

  const registrationIdentity = deepFreeze({
    setupCheckRequestDigestHex: setupCheckRequest.requestDigestHex,
    cutoverGenerationManifestDigestHex: generationManifest.manifestDigestHex,
    targetGenerationCandidateIdHex:
      setupCheckRequest.sourceBindings.targetGenerationCandidateIdHex,
    targetProfileDigestHex:
      setupCheckRequest.sourceBindings.targetProfileDigestHex,
    familyIdHex: setupCheckRequest.profile.familyIdHex,
    semanticBaselineFamilyIdHex: generationManifest.target.profile.familyIdHex,
    federationProfileIdHex: setupCheckRequest.profile.federationProfileIdHex,
    settlementProfileIdHex: setupCheckRequest.profile.settlementProfileIdHex,
    predictedLineages,
    globalReplayLineageSetDigestHex: globalReplay.lineageSetDigestHex,
    globalReplayDuplicatePreventionDigestHex:
      globalReplay.duplicatePreventionDigestHex,
    requirementSetDigestHex,
    boundRouteSetDigestHex:
      generationManifest.legacyRoutes.boundRouteSetDigestHex,
    blockerCodes,
  });
  const registrationCandidateIdHex = sha256CanonicalJson(
    registrationIdentity,
    REGISTRATION_ID_DOMAIN,
  );
  const binding = deepFreeze({
    schema: SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1_SCHEMA,
    version: 1 as const,
    status: 'inactive_blocked_registration_candidate' as const,
    registrationCandidateIdHex,
    sourceBindings: {
      setupCheckRequestDigestHex: setupCheckRequest.requestDigestHex,
      provisioningPlanDigestHex:
        setupCheckRequest.sourceBindings.provisioningPlanDigestHex,
      targetGenerationCandidateIdHex:
        setupCheckRequest.sourceBindings.targetGenerationCandidateIdHex,
      targetProfileDigestHex:
        setupCheckRequest.sourceBindings.targetProfileDigestHex,
      cutoverGenerationManifestDigestHex: generationManifest.manifestDigestHex,
      semanticBaselineGenerationIdHex:
        generationManifest.generation.generationIdHex,
      semanticBaselineFamilyIdHex:
        generationManifest.target.profile.familyIdHex,
      exactStaticRouteSetDigestHex:
        generationManifest.legacyRoutes.exactStaticRouteSetDigestHex,
      boundRouteSetDigestHex:
        generationManifest.legacyRoutes.boundRouteSetDigestHex,
    },
    target: { ...setupCheckRequest.target },
    profile: { ...setupCheckRequest.profile },
    predictedLineages,
    globalReplay,
    retirement: {
      requirementSetDigestHex,
      routeCount: EXPECTED_LEGACY_ROUTE_COUNT as 53,
      unresolvedRouteCount: EXPECTED_LEGACY_ROUTE_COUNT as 53,
      historicalAuthorityCounts: {
        ...generationManifest.legacyRoutes.historicalAuthorityCounts,
      },
      routes,
      blockerCodes,
      allRetirementEvidenceAuthenticated: false as const,
      allLegacyRoutesRetired: false as const,
    },
    registration: {
      status: 'inactive_blocked' as const,
      activeRegistrySelection: null,
      runtimeSelectable: false as const,
      activationConsumerExported: false as const,
    },
    checks: {
      sameProcessSetupCheckRequestVerified: true as const,
      sameProcessGenerationManifestVerified: true as const,
      exact53RouteRequirementSetMatched: true as const,
      importedReplayLineageBound: true as const,
      allThreePredictedSingletonLineagesBound: true as const,
      unresolvedBlockersPreserved: true as const,
      identicalInventoryAndRetirementDigestRejected: true as const,
      retirementEvidenceSemanticIndependenceEstablished: false as const,
      callerRetirementClaimsAccepted: false as const,
    },
    boundaries: falseBoundaries(),
  });
  return deepFreeze({
    ...binding,
    candidateDigestHex: sha256CanonicalJson(binding, CANDIDATE_DIGEST_DOMAIN),
  });
}

function assertSourceJoin(
  request: Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>,
  manifest: Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): void {
  if (
    request.status !== 'non_executable_unsigned_setup_check_request'
    || request.sourceBindings.cutoverGenerationManifestDigestHex
      !== manifest.manifestDigestHex
    || request.sourceBindings.semanticBaselineGenerationIdHex
      !== manifest.generation.generationIdHex
    || request.profile.settlementProfileIdHex
      !== manifest.target.profile.settlementProfileIdHex
    || request.profile.federationProfileIdHex
      !== manifest.target.federation.federationProfileIdHex
    || request.profile.sourceNetworkIdHex
      !== manifest.target.sourceRuntime.sourceNetworkIdHex
    || request.profile.sidechainIdHex
      !== manifest.target.sourceRuntime.sidechainIdHex
    || request.profile.runtimeProfileIdHex
      !== manifest.target.sourceRuntime.runtimeProfileIdHex
    || request.target.network !== 'testnet'
    || manifest.generation.settlementNetworkId !== 'ergo-testnet'
    || manifest.generation.sourceNetworkScope !== 'public-testnet'
  ) {
    throw new Error(
      'federated inactive registration request and generation manifest differ',
    );
  }
  if (
    Object.values(request.boundaries).some(value => value !== false)
    || Object.values(manifest.boundaries).some(value => value !== false)
  ) {
    throw new Error(
      'federated inactive registration requires non-authorizing source artifacts',
    );
  }
}

function orderedStaticRequirements(): readonly Readonly<LegacyRouteIdentityV1>[] {
  const requirements = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6
    .map(requirement => routeIdentity(requirement))
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  if (
    requirements.length !== EXPECTED_LEGACY_ROUTE_COUNT
    || new Set(requirements.map(requirement => requirement.routeId)).size
      !== EXPECTED_LEGACY_ROUTE_COUNT
  ) {
    throw new Error('federated inactive registration route requirements drifted');
  }
  return deepFreeze(requirements);
}

function orderedAndVerifiedRoutes(
  manifestRoutes: readonly LegacyRoute[],
  expectedRequirements: readonly Readonly<LegacyRouteIdentityV1>[],
): readonly LegacyRoute[] {
  const routes = manifestRoutes
    .map(route => copyRoute(route))
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  if (
    routes.length !== EXPECTED_LEGACY_ROUTE_COUNT
    || routes.length !== expectedRequirements.length
  ) {
    throw new Error('federated inactive registration requires exactly 53 routes');
  }
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index]!;
    const expected = expectedRequirements[index]!;
    if (canonicalJson(routeIdentity(route)) !== canonicalJson(expected)) {
      throw new Error(`federated inactive registration route ${route.routeId} drifted`);
    }
    if (route.retirementEvidenceAuthenticated || route.routeRetired) {
      throw new Error(
        `federated inactive registration rejects retirement claim for ${route.routeId}`,
      );
    }
    if (
      route.retirementEvidenceDigestHex === route.inventoryBindingDigestHex
      || route.retirementEvidenceDigestHex
        === route.sanitizedInventoryBindingDigestHex
    ) {
      throw new Error(
        `federated inactive registration route ${route.routeId} reuses an inventory digest as retirement evidence`,
      );
    }
  }
  return deepFreeze(routes);
}

function routeIdentity(
  route: LegacyRouteRetirementRequirementV6 | LegacyRoute,
): LegacyRouteIdentityV1 {
  return {
    routeId: route.routeId,
    layer: route.layer,
    routeClass: route.routeClass,
    sourceSurface: route.sourceSurface,
    historicalAuthority: route.historicalAuthority,
    requiredDisposition: route.requiredDisposition,
    introducedBy: route.introducedBy,
    contractIdHex: route.contractIdHex,
  };
}

function copyRoute(route: LegacyRoute): LegacyRoute {
  return deepFreeze({
    ...route,
    instanceIds: [...route.instanceIds],
    blockerCodes: [...route.blockerCodes],
  });
}

function copyGlobalReplay(
  replay: SubstrateFederatedCutoverGenerationV1Manifest['globalReplay'],
): SubstrateFederatedCutoverGenerationV1Manifest['globalReplay'] {
  return deepFreeze({
    ...replay,
    canonicalBurnIdsHex: [...replay.canonicalBurnIdsHex],
    sourceRegisters: { ...replay.sourceRegisters },
    contributions: replay.contributions.map(contribution => ({
      ...contribution,
      canonicalBurnIdsHex: [...contribution.canonicalBurnIdsHex],
    })),
  });
}

function assertPredictedLineages(
  lineages: readonly Readonly<SubstrateFederatedGenesisSetupCheckIssuanceV1>[],
): void {
  const roles: readonly SetupRole[] = [
    'tracker',
    'duplicatePrevention',
    'pooledReserve',
  ];
  if (
    lineages.length !== 3
    || lineages.some((lineage, index) =>
      lineage.ordinal !== index
      || lineage.role !== roles[index]
      || lineage.genesisInputBoxIdHex !== lineage.singletonTokenIdHex
    )
    || new Set(lineages.map(lineage => lineage.singletonTokenIdHex)).size !== 3
    || new Set(lineages.map(lineage => lineage.unsignedTransactionIdHex)).size !== 3
    || new Set(lineages.map(lineage => lineage.predictedStateOutputBoxIdHex)).size
      !== 3
  ) {
    throw new Error(
      'federated inactive registration requires three distinct predicted lineages',
    );
  }
}

function sortedUnique(values: readonly string[]): readonly string[] {
  if (values.some(value => value.length === 0 || !/^[\x20-\x7e]+$/.test(value))) {
    throw new Error('federated inactive registration blocker is invalid');
  }
  return deepFreeze([...new Set(values)].sort(compareCodeUnits));
}

function falseBoundaries(): SubstrateFederatedInactiveRegistrationCandidateV1[
  'boundaries'
] {
  return Object.freeze({
    targetProfileApprovalAuthenticated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signedSetupAcceptanceEstablished: false as const,
    canonicalLineagesEstablished: false as const,
    inventoryExhaustivenessAuthenticated: false as const,
    retirementEvidenceAuthenticated: false as const,
    legacyRoutesRetired: false as const,
    globalReplayImportEstablished: false as const,
    profileRegistered: false as const,
    profileActivated: false as const,
    runtimeSelectionEnabled: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
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
