/**
 * Process-local structural eligibility for the distinct V6 settlement lineage.
 * This module can reject an unsafe cutover, but it cannot authorize one.
 */

import { getDupTreeDigest } from './avl-bridge.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
  type LegacyRouteRetirementRequirementV6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LOCAL_PREDICATE_CLOSURE_V6,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V6_SCHEMA,
  assertValidityApplicationPooledReserveProvisioningV6Provenance,
  type ValidityApplicationPooledReserveProvisioningV6Plan,
} from './validity-application-pooled-reserve-provisioning-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance,
  type TestnetCutoverReviewReplayLineageV4,
  type TestnetCutoverReviewRouteV4,
  type ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-cutover-eligibility.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS =
  'blocked_non_authorizing_precondition' as const;

const CANDIDATE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6';
const STATIC_ROUTE_SET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_ROUTE_SET';
const PENDING_V5_INVENTORY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_PENDING_V5_INVENTORY';
const PENDING_V5_SANITIZED_INVENTORY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_PENDING_V5_SANITIZED_INVENTORY';
const PENDING_V5_RETIREMENT_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_PENDING_V5_RETIREMENT';
const candidates = new WeakSet<object>();

type ContractRole = 'tracker' | 'duplicatePrevention' | 'sourceLock' | 'pooledReserve';

export interface BuildValidityApplicationPooledReserveCutoverEligibilityV6Input {
  readonly cutoverReview: Readonly<
    ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
  >;
  readonly provisioningPlan: Readonly<
    ValidityApplicationPooledReserveProvisioningV6Plan
  >;
}

export interface ValidityApplicationPooledReserveCutoverEligibilityV6Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_SCHEMA;
  readonly version: 6;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS;
  readonly candidateDigestHex: string;
  readonly sourceV4: Readonly<{
    readonly cutoverReviewProfileDigestHex: string;
    readonly ergoCutoverObservationReportDigestHex: string;
    readonly compatibilityInventoryPacketDigestHex: string;
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly lineageProfileIdHex: string;
    readonly runtimeProfileIdHex: string;
    readonly applicationBindingDigestHex: string;
    readonly sourceAdmissionPolicyIdHex: string;
    readonly sourceProofSystemIdHex: string;
    readonly sourceProofProfileIdHex: string;
    readonly contractIds: Readonly<Record<ContractRole, string>>;
    readonly routeProfileDigestHex: string;
    readonly routeRequirementsDigestHex: string;
    readonly replayLineageSetDigestHex: string;
    readonly duplicatePreventionDigestHex: string;
    readonly plannedCanonicalBurnIdCount: number;
  }>;
  readonly targetV6: Readonly<{
    readonly provisioningPlanDigestHex: string;
    readonly localPredicateClosure:
      ValidityApplicationPooledReserveProvisioningV6Plan['localPredicateClosure'];
    readonly targetNetwork: Readonly<{
      readonly ergoNetworkId: 'ergo-testnet';
      readonly ergoAddressNetworkPrefix: 16;
      readonly p2sAddressHeader: 19;
      readonly ergoGenesisBlockIdHex: string;
      readonly sourceNetworkIdHex: string;
      readonly sidechainIdHex: string;
      readonly settlementProfileIdHex: string;
    }>;
    readonly lineageProfileIdHex: string;
    readonly sourceRuntimeLineageProfileIdHex: string;
    readonly sourceRuntimeProfileIdHex: string;
    readonly burnBindingDigestHex: string;
    readonly finalityPolicy: Readonly<{
      readonly policyIdHex: string;
      readonly proofSystemIdHex: string;
      readonly proofProfileIdHex: string;
      readonly approvedTrustAnchorDigestHex: string;
    }>;
    readonly contractIds: Readonly<Record<ContractRole, string>>;
    readonly contractArtifacts: Readonly<Record<ContractRole, Readonly<{
      readonly templateSha256Hex: string;
      readonly resolvedSourceSha256Hex: string;
      readonly propositionSha256Hex: string;
    }>>>;
    readonly genesis: Readonly<{
      readonly trackerInputBoxIdHex: string;
      readonly trackerNftIdHex: string;
      readonly duplicatePreventionInputBoxIdHex: string;
      readonly duplicatePreventionNftIdHex: string;
      readonly pooledReserveInputBoxIdHex: string;
      readonly pooledReserveNftIdHex: string;
    }>;
    readonly replayCutoverPacketDigestHex: string;
    readonly duplicatePreventionBoxIdHex: string;
    readonly transactionIdentities: Readonly<{
      readonly trackerIssuanceTxIdHex: string;
      readonly trackerBoxIdHex: string;
      readonly duplicatePreventionIssuanceTxIdHex: string;
      readonly duplicatePreventionBoxIdHex: string;
      readonly pooledReserveIssuanceTxIdHex: string;
      readonly pooledReserveBoxIdHex: string;
    }>;
  }>;
  readonly routeInventory: Readonly<{
    readonly exactStaticRouteSetDigestHex: string;
    readonly routeCount: number;
    readonly observedV4RouteCount: number;
    readonly pendingIntegratedV5RouteCount: number;
    readonly instanceCount: number;
    readonly drainedInstanceCount: number;
    readonly neverFundedInstanceCount: number;
    readonly routes: readonly Readonly<{
      readonly routeId: string;
      readonly layer: LegacyRouteRetirementRequirementV4['layer'];
      readonly routeClass: LegacyRouteRetirementRequirementV4['routeClass'];
      readonly sourceSurface: string;
      readonly historicalAuthority:
        LegacyRouteRetirementRequirementV4['historicalAuthority'];
      readonly requiredDisposition:
        LegacyRouteRetirementRequirementV4['requiredDisposition'];
      readonly contractIdHex: string | null;
      readonly requirementSource:
        | 'v4-cutover-review'
        | 'v5-static-retirement-requirement';
      readonly inventorySource:
        | TestnetCutoverReviewRouteV4['inventory']['source']
        | 'pending-authenticated-v5-inventory';
      readonly inventoryBindingDigestHex: string;
      readonly sanitizedInventoryBindingDigestHex: string;
      readonly retirementEvidenceDigestHex: string;
      readonly instanceIds: readonly string[];
      readonly drainedInstanceCount: number;
      readonly neverFundedInstanceCount: number;
      readonly retirementEvidenceAuthenticated: false;
      readonly routeRetired: false;
    }>[];
  }>;
  readonly replay: Readonly<{
    readonly historicalLineageCount: number;
    readonly emptyLineageCount: number;
    readonly mappedLineageCount: number;
    readonly plannedCanonicalBurnIdCount: number;
    readonly lineages: readonly Readonly<{
      readonly routeId: string;
      readonly instanceId: string;
      readonly lineagePacketDigestHex: string;
      readonly rawReplayKeyCount: number;
      readonly canonicalBurnIdCount: number;
      readonly canonicalBurnIdsDigestHex: string;
      readonly replayImportPacketDigestHex: string | null;
    }>[];
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessInputsVerified: true;
    readonly exactStaticRouteSetMatched: true;
    readonly exactObservedV4RouteInventoryBound: true;
    readonly observedFundedAndUnresolvedInstancesRejected: true;
    readonly integratedV5RetirementRequirementsIncluded: true;
    readonly integratedV5InventoryAuthenticationPending: true;
    readonly everyDupInstanceHasOneReplayLineage: true;
    readonly nonemptyReplayLineagesMappedAndAdmitted: true;
    readonly globalReplayPacketMatched: true;
    readonly retainedV4RuntimeIdentityMatched: true;
    readonly distinctV6TargetLineageMatched: true;
    readonly exactV6ContractFamilyMatched: true;
    readonly exactV6ProvisioningPlanMatched: true;
    readonly exactV6LocalPredicateClosureIdentityBound: true;
    readonly exactV6TransactionIdentitiesBound: true;
    readonly callerRetirementClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly targetNetworkIdentityAuthenticated: false;
    readonly inventoryExhaustivenessAuthenticated: false;
    readonly retirementEvidenceAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly singletonLineageEstablished: false;
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

export function buildValidityApplicationPooledReserveCutoverEligibilityV6(
  input: BuildValidityApplicationPooledReserveCutoverEligibilityV6Input,
): Readonly<ValidityApplicationPooledReserveCutoverEligibilityV6Candidate> {
  assertExactKeys(input, [
    'cutoverReview',
    'provisioningPlan',
  ], 'pooled-reserve V6 cutover-eligibility input');
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
    input.cutoverReview,
  );
  assertValidityApplicationPooledReserveProvisioningV6Provenance(
    input.provisioningPlan,
  );

  const review = input.cutoverReview;
  const provisioning = input.provisioningPlan;
  assertReviewRemainsNonAuthorizing(review);
  assertProvisioningRemainsNonAuthorizing(provisioning);

  const routeInventory = buildRouteInventory(review.routes);
  const replay = buildReplayInventory(review, routeInventory.routes);
  const sourceV4 = bindSourceV4(review, provisioning);
  const targetV6 = bindTargetV6(provisioning, sourceV4);
  const blockers = sortedUniqueStrings([
    ...review.blockers,
    'target-network-identity-is-not-authenticated',
    'inventory-exhaustiveness-is-not-authenticated',
    'integrated-v5-route-inventory-and-retirement-evidence-is-not-authenticated',
    'legacy-route-retirement-evidence-is-not-authenticated',
    'legacy-routes-are-not-retired',
    'v6-singleton-lineage-is-not-established',
    'v6-reserve-lineage-is-not-established',
    'v6-profile-is-not-activated',
    'v6-target-node-acceptance-is-not-established',
    'v6-confirmation-is-not-established',
    'v6-funds-authority-is-not-established',
  ], 'V6 cutover-eligibility blocker');

  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_SCHEMA,
    version: 6 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS,
    sourceV4,
    targetV6,
    routeInventory,
    replay,
    blockers,
    checks: {
      sameProcessInputsVerified: true as const,
      exactStaticRouteSetMatched: true as const,
      exactObservedV4RouteInventoryBound: true as const,
      observedFundedAndUnresolvedInstancesRejected: true as const,
      integratedV5RetirementRequirementsIncluded: true as const,
      integratedV5InventoryAuthenticationPending: true as const,
      everyDupInstanceHasOneReplayLineage: true as const,
      nonemptyReplayLineagesMappedAndAdmitted: true as const,
      globalReplayPacketMatched: true as const,
      retainedV4RuntimeIdentityMatched: true as const,
      distinctV6TargetLineageMatched: true as const,
      exactV6ContractFamilyMatched: true as const,
      exactV6ProvisioningPlanMatched: true as const,
      exactV6LocalPredicateClosureIdentityBound: true as const,
      exactV6TransactionIdentitiesBound: true as const,
      callerRetirementClaimsAccepted: false as const,
    },
    boundaries: {
      targetNetworkIdentityAuthenticated: false as const,
      inventoryExhaustivenessAuthenticated: false as const,
      retirementEvidenceAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      singletonLineageEstablished: false as const,
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
    },
  };
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: sha256CanonicalJson(binding, CANDIDATE_DIGEST_DOMAIN),
  });
  candidates.add(candidate);
  return candidate;
}

export function assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve V6 cutover-eligibility candidate was not built in this process',
    );
  }
}

function buildRouteInventory(
  routes: readonly TestnetCutoverReviewRouteV4[],
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate['routeInventory'] {
  const expected = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const expectedV4 = expected.filter(
    requirement => requirement.introducedBy === 'v4-cutover-review',
  );
  const actual = uniqueMap(routes, route => route.routeId, 'cutover review route');
  if (
    actual.size !== expectedV4.length
    || expectedV4.some(requirement => !actual.has(requirement.routeId))
  ) {
    throw new Error('cutover eligibility requires the exact observed V4 legacy route set');
  }

  let instanceCount = 0;
  let drainedInstanceCount = 0;
  let neverFundedInstanceCount = 0;
  const boundRoutes = expected.map(requirement => {
    if (requirement.introducedBy === 'v5-integrated-settlement') {
      return pendingIntegratedV5Route(requirement);
    }
    const route = actual.get(requirement.routeId)!;
    assertRouteMatchesRequirement(route, requirement);
    if (
      route.retirement.evidenceAuthenticated !== false
      || route.retirement.routeRetired !== false
    ) {
      throw new Error(
        `cutover eligibility does not accept retirement claims for ${route.routeId}`,
      );
    }
    const instanceIds = new Set<string>();
    let drained = 0;
    let neverFunded = 0;
    for (const instance of route.inventory.instances) {
      if (instanceIds.has(instance.instanceId)) {
        throw new Error(`legacy route ${route.routeId} repeats an instance ID`);
      }
      instanceIds.add(instance.instanceId);
      if (
        instance.inventoryClassification === 'funded'
        || instance.inventoryClassification === 'unresolved'
      ) {
        throw new Error(
          `legacy route ${route.routeId} instance ${instance.instanceId} is ${instance.inventoryClassification}`,
        );
      }
      if (instance.inventoryClassification === 'drained') drained += 1;
      if (instance.inventoryClassification === 'never-funded') neverFunded += 1;
    }
    instanceCount += instanceIds.size;
    drainedInstanceCount += drained;
    neverFundedInstanceCount += neverFunded;
    const inventoryBindingDigestHex = fixedHex(
      route.inventory.bindingDigestHex,
      32,
      `${route.routeId} inventory binding digest`,
    );
    if (
      fixedHex(
        route.declaration.inventoryEvidenceDigestHex,
        32,
        `${route.routeId} declared inventory digest`,
      ) !== inventoryBindingDigestHex
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
    return deepFreeze({
      routeId: route.routeId,
      layer: route.layer,
      routeClass: route.routeClass,
      sourceSurface: route.sourceSurface,
      historicalAuthority: route.historicalAuthority,
      requiredDisposition: route.requiredDisposition,
      contractIdHex: null,
      requirementSource: 'v4-cutover-review' as const,
      inventorySource: route.inventory.source,
      inventoryBindingDigestHex,
      sanitizedInventoryBindingDigestHex: fixedHex(
        route.inventory.sanitizedBindingDigestHex,
        32,
        `${route.routeId} sanitized inventory digest`,
      ),
      retirementEvidenceDigestHex,
      instanceIds: [...instanceIds].sort(compareCodeUnits),
      drainedInstanceCount: drained,
      neverFundedInstanceCount: neverFunded,
      retirementEvidenceAuthenticated: false as const,
      routeRetired: false as const,
    });
  });
  return deepFreeze({
    exactStaticRouteSetDigestHex: sha256CanonicalJson(
      expected,
      STATIC_ROUTE_SET_DIGEST_DOMAIN,
    ),
    routeCount: boundRoutes.length,
    observedV4RouteCount: expectedV4.length,
    pendingIntegratedV5RouteCount: expected.length - expectedV4.length,
    instanceCount,
    drainedInstanceCount,
    neverFundedInstanceCount,
    routes: boundRoutes,
  });
}

function pendingIntegratedV5Route(
  requirement: LegacyRouteRetirementRequirementV6,
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
  'routeInventory'
]['routes'][number] {
  if (
    requirement.introducedBy !== 'v5-integrated-settlement'
    || requirement.contractIdHex === null
  ) {
    throw new Error('pending integrated V5 route must bind one exact V5 contract');
  }
  const pendingBinding = deepFreeze({
    routeId: requirement.routeId,
    layer: requirement.layer,
    routeClass: requirement.routeClass,
    sourceSurface: requirement.sourceSurface,
    historicalAuthority: requirement.historicalAuthority,
    requiredDisposition: requirement.requiredDisposition,
    contractIdHex: fixedHex(
      requirement.contractIdHex,
      32,
      `${requirement.routeId} contract ID`,
    ),
    requirementSource: 'v5-static-retirement-requirement' as const,
    inventorySource: 'pending-authenticated-v5-inventory' as const,
  });
  return deepFreeze({
    ...pendingBinding,
    inventoryBindingDigestHex: sha256CanonicalJson(
      pendingBinding,
      PENDING_V5_INVENTORY_DIGEST_DOMAIN,
    ),
    sanitizedInventoryBindingDigestHex: sha256CanonicalJson(
      pendingBinding,
      PENDING_V5_SANITIZED_INVENTORY_DIGEST_DOMAIN,
    ),
    retirementEvidenceDigestHex: sha256CanonicalJson({
      ...pendingBinding,
      requiredEvidence: 'authenticated-never-funded-and-disabled',
    }, PENDING_V5_RETIREMENT_DIGEST_DOMAIN),
    instanceIds: deepFreeze([] as string[]),
    drainedInstanceCount: 0,
    neverFundedInstanceCount: 0,
    retirementEvidenceAuthenticated: false as const,
    routeRetired: false as const,
  });
}

function buildReplayInventory(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  routes: ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
    'routeInventory'
  ]['routes'],
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate['replay'] {
  const expectedKeys = routes
    .filter(route => route.routeClass === 'duplicate-prevention')
    .flatMap(route => route.instanceIds.map(instanceId =>
      lineageKey(route.routeId, instanceId)
    ))
    .sort(compareCodeUnits);
  const actual = uniqueMap(
    review.replay.lineages,
    lineage => lineageKey(lineage.routeId, lineage.instanceId),
    'cutover review replay lineage',
  );
  if (
    actual.size !== expectedKeys.length
    || expectedKeys.some(key => !actual.has(key))
  ) {
    throw new Error(
      'cutover eligibility requires exactly one replay lineage per DUP instance',
    );
  }
  if (
    review.replay.historicalLineageCount !== expectedKeys.length
    || review.replay.allObservedLineagesComposed !== true
    || review.replay.inventoryExhaustivenessAuthenticated !== false
  ) {
    throw new Error('cutover review replay summary is not a blocked exact composition');
  }

  let emptyLineageCount = 0;
  let mappedLineageCount = 0;
  let plannedCanonicalBurnIdCount = 0;
  const lineages = expectedKeys.map(key => {
    const lineage = actual.get(key)!;
    assertReplayLineageBoundary(lineage, key);
    const empty = lineage.rawReplayKeyCount === 0;
    if (empty) emptyLineageCount += 1;
    else mappedLineageCount += 1;
    plannedCanonicalBurnIdCount += lineage.canonicalBurnIdCount;
    return deepFreeze({
      routeId: lineage.routeId,
      instanceId: lineage.instanceId,
      lineagePacketDigestHex: fixedHex(
        lineage.lineagePacketDigestHex,
        32,
        `${key} lineage packet digest`,
      ),
      rawReplayKeyCount: nonnegativeInteger(
        lineage.rawReplayKeyCount,
        `${key} raw replay-key count`,
      ),
      canonicalBurnIdCount: nonnegativeInteger(
        lineage.canonicalBurnIdCount,
        `${key} canonical burn-ID count`,
      ),
      canonicalBurnIdsDigestHex: fixedHex(
        lineage.canonicalBurnIdsDigestHex,
        32,
        `${key} canonical burn-ID digest`,
      ),
      replayImportPacketDigestHex: lineage.replayImportPacketDigestHex === null
        ? null
        : fixedHex(
          lineage.replayImportPacketDigestHex,
          32,
          `${key} replay-import packet digest`,
        ),
    });
  });
  if (
    plannedCanonicalBurnIdCount
      !== nonnegativeInteger(
        review.replay.importedCanonicalBurnIdCount,
        'review imported canonical burn-ID count',
      )
  ) {
    throw new Error('cutover review replay lineage totals do not match');
  }
  return deepFreeze({
    historicalLineageCount: lineages.length,
    emptyLineageCount,
    mappedLineageCount,
    plannedCanonicalBurnIdCount,
    lineages,
  });
}

function bindSourceV4(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV6Plan>,
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate['sourceV4'] {
  const historicalReplayGenesisPacketDigestHex = fixedHex(
    review.components.historicalReplayGenesisPacketDigestHex,
    32,
    'review historical replay-genesis packet digest',
  );
  const ergoCutoverObservationReportDigestHex = fixedHex(
    review.components.ergoCutoverObservationReportDigestHex,
    32,
    'review Ergo cutover observation digest',
  );
  const lineageProfileIdHex = fixedHex(
    review.application.lineageProfileIdHex,
    32,
    'review V4 lineage profile ID',
  );
  const duplicatePreventionDigestHex = fixedHex(
    review.replay.duplicatePreventionGenesisDigestHex,
    33,
    'review global duplicate-prevention digest',
  );
  const canonicalBurnIdsHex = normalizeCanonicalBurnIds(
    provisioning.lineage.plannedCanonicalBurnIdsHex,
  );
  const recomputedReplayDigestHex = getDupTreeDigest([
    ...canonicalBurnIdsHex,
  ]);
  if (
    historicalReplayGenesisPacketDigestHex !== fixedHex(
      provisioning.lineage.historicalReplayGenesisPacketDigestHex,
      32,
      'V6 provisioning historical replay-genesis digest',
    )
    || ergoCutoverObservationReportDigestHex !== fixedHex(
      provisioning.lineage.cutoverObservationReportDigestHex,
      32,
      'V6 provisioning cutover-observation digest',
    )
    || lineageProfileIdHex !== fixedHex(
      provisioning.profile.sourceRuntimeLineageProfileIdHex,
      32,
      'V6 provisioning source lineage profile ID',
    )
    || duplicatePreventionDigestHex !== fixedHex(
      provisioning.lineage.plannedReplayDigestHex,
      33,
      'V6 provisioning planned duplicate-prevention digest',
    )
    || review.replay.importedCanonicalBurnIdCount
      !== provisioning.lineage.plannedCanonicalBurnIdCount
    || canonicalBurnIdsHex.length
      !== provisioning.lineage.plannedCanonicalBurnIdCount
    || recomputedReplayDigestHex !== duplicatePreventionDigestHex
  ) {
    throw new Error('V6 provisioning does not bind the exact V4 review and replay state');
  }
  return deepFreeze({
    cutoverReviewProfileDigestHex: fixedHex(
      review.profileDigestHex,
      32,
      'V4 cutover review-profile digest',
    ),
    ergoCutoverObservationReportDigestHex,
    compatibilityInventoryPacketDigestHex: fixedHex(
      review.components.compatibilityInventoryPacketDigestHex,
      32,
      'compatibility inventory packet digest',
    ),
    historicalReplayGenesisPacketDigestHex,
    lineageProfileIdHex,
    runtimeProfileIdHex: fixedHex(
      review.application.runtimeProfileIdHex,
      32,
      'V4 runtime profile ID',
    ),
    applicationBindingDigestHex: fixedHex(
      review.application.applicationBindingDigestHex,
      32,
      'V4 application-binding digest',
    ),
    sourceAdmissionPolicyIdHex: fixedHex(
      review.application.sourceAdmissionPolicyIdHex,
      32,
      'V4 source-admission policy ID',
    ),
    sourceProofSystemIdHex: fixedHex(
      review.application.sourceProofSystemIdHex,
      32,
      'V4 source proof-system ID',
    ),
    sourceProofProfileIdHex: fixedHex(
      review.application.sourceProofProfileIdHex,
      32,
      'V4 source proof-profile ID',
    ),
    contractIds: normalizeContractIds(review.application.contractIds, 'V4'),
    routeProfileDigestHex: fixedHex(
      review.replay.routeProfileDigestHex,
      32,
      'V4 route-profile digest',
    ),
    routeRequirementsDigestHex: fixedHex(
      review.replay.routeRequirementsDigestHex,
      32,
      'V4 route-requirements digest',
    ),
    replayLineageSetDigestHex: fixedHex(
      review.replay.lineageSetDigestHex,
      32,
      'V4 replay-lineage set digest',
    ),
    duplicatePreventionDigestHex,
    plannedCanonicalBurnIdCount: review.replay.importedCanonicalBurnIdCount,
  });
}

function normalizeCanonicalBurnIds(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('V6 provisioning canonical burn IDs must be an array');
  }
  const normalized = value.map((burnIdHex, index) => fixedHex(
    burnIdHex,
    32,
    `V6 provisioning canonical burn ID ${index}`,
  ));
  if (normalized.some((burnIdHex, index) =>
    index > 0 && normalized[index - 1]! >= burnIdHex
  )) {
    throw new Error(
      'V6 provisioning canonical burn IDs must be strictly sorted and unique',
    );
  }
  return deepFreeze(normalized);
}

function bindTargetV6(
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV6Plan>,
  sourceV4: ValidityApplicationPooledReserveCutoverEligibilityV6Candidate['sourceV4'],
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate['targetV6'] {
  const lineageProfileIdHex = fixedHex(
    provisioning.profile.targetLineageProfileIdHex,
    32,
    'provisioned V6 target lineage profile ID',
  );
  const sourceRuntimeLineageProfileIdHex = fixedHex(
    provisioning.profile.sourceRuntimeLineageProfileIdHex,
    32,
    'provisioned V6 source runtime lineage profile ID',
  );
  const { contractIds: targetContractIds, contractArtifacts } =
    bindProvisionedContractFamily(provisioning.contracts);
  if (
    sourceRuntimeLineageProfileIdHex !== sourceV4.lineageProfileIdHex
    || fixedHex(
      provisioning.profile.sourceRuntimeProfileIdHex,
      32,
      'provisioned V6 retained source runtime profile ID',
    ) !== sourceV4.runtimeProfileIdHex
    || fixedHex(
      provisioning.profile.proofSystemIdHex,
      32,
      'provisioned V6 proof-system ID',
    ) !== sourceV4.sourceProofSystemIdHex
  ) {
    throw new Error('V6 provisioning does not retain the exact V4 runtime identity');
  }
  if (lineageProfileIdHex === sourceRuntimeLineageProfileIdHex) {
    throw new Error('V6 target settlement lineage must remain distinct from V4');
  }
  const sourceContractIdSet = new Set(Object.values(sourceV4.contractIds));
  const targetContractIdSet = new Set(Object.values(targetContractIds));
  if (sourceContractIdSet.size !== 4 || targetContractIdSet.size !== 4) {
    throw new Error('V4 and V6 contract families must each contain four distinct identities');
  }
  for (const role of Object.keys(targetContractIds) as ContractRole[]) {
    if (sourceContractIdSet.has(targetContractIds[role])) {
      throw new Error(`V6 target ${role} contract must be disjoint from V4`);
    }
  }
  const genesis = deepFreeze({
    trackerInputBoxIdHex: fixedHex(
      provisioning.lineage.trackerGenesisInputBoxIdHex,
      32,
      'provisioned V6 tracker genesis input ID',
    ),
    trackerNftIdHex: fixedHex(
      provisioning.lineage.trackerNftIdHex,
      32,
      'provisioned V6 tracker NFT ID',
    ),
    duplicatePreventionInputBoxIdHex: fixedHex(
      provisioning.lineage.duplicatePreventionGenesisInputBoxIdHex,
      32,
      'provisioned V6 DUP genesis input ID',
    ),
    duplicatePreventionNftIdHex: fixedHex(
      provisioning.lineage.duplicatePreventionNftIdHex,
      32,
      'provisioned V6 DUP NFT ID',
    ),
    pooledReserveInputBoxIdHex: fixedHex(
      provisioning.lineage.pooledReserveGenesisInputBoxIdHex,
      32,
      'provisioned V6 reserve genesis input ID',
    ),
    pooledReserveNftIdHex: fixedHex(
      provisioning.lineage.pooledReserveNftIdHex,
      32,
      'provisioned V6 reserve NFT ID',
    ),
  });
  const transactionIdentities = bindProvisionedTransactionIdentities(
    provisioning,
    genesis,
  );
  const localPredicateClosure = bindLocalPredicateClosure(
    provisioning.localPredicateClosure,
  );
  const targetNetwork = bindProvisionedTargetNetwork(provisioning.targetNetwork);
  return deepFreeze({
    provisioningPlanDigestHex: fixedHex(
      provisioning.planDigestHex,
      32,
      'V6 provisioning plan digest',
    ),
    localPredicateClosure,
    targetNetwork,
    lineageProfileIdHex,
    sourceRuntimeLineageProfileIdHex,
    sourceRuntimeProfileIdHex: sourceV4.runtimeProfileIdHex,
    burnBindingDigestHex: fixedHex(
      provisioning.profile.burnBindingDigestHex,
      32,
      'provisioned V6 burn-binding digest',
    ),
    finalityPolicy: {
      policyIdHex: fixedHex(
        provisioning.profile.finalityPolicyIdHex,
        32,
        'provisioned V6 finality-policy ID',
      ),
      proofSystemIdHex: fixedHex(
        provisioning.profile.proofSystemIdHex,
        32,
        'provisioned V6 proof-system ID',
      ),
      proofProfileIdHex: fixedHex(
        provisioning.profile.proofProfileIdHex,
        32,
        'provisioned V6 proof-profile ID',
      ),
      approvedTrustAnchorDigestHex: fixedHex(
        provisioning.profile.approvedTrustAnchorDigestHex,
        32,
        'provisioned V6 approved trust-anchor digest',
      ),
    },
    contractIds: targetContractIds,
    contractArtifacts,
    genesis,
    replayCutoverPacketDigestHex: fixedHex(
      provisioning.lineage.replayCutoverPacketDigestHex,
      32,
      'V6 replay-cutover packet digest',
    ),
    duplicatePreventionBoxIdHex:
      transactionIdentities.duplicatePreventionBoxIdHex,
    transactionIdentities,
  });
}

function bindLocalPredicateClosure(
  value: ValidityApplicationPooledReserveProvisioningV6Plan[
    'localPredicateClosure'
  ],
): ValidityApplicationPooledReserveProvisioningV6Plan[
  'localPredicateClosure'
] {
  const expected =
    VALIDITY_APPLICATION_POOLED_RESERVE_LOCAL_PREDICATE_CLOSURE_V6;
  assertExactKeys(value, [
    'schema',
    'sigmaStateCommit',
    'acceptanceSpecSha256Hex',
    'acceptanceFixtureSha256Hex',
    'prooflessTransactionIdHex',
    'prooflessTransactionBytes',
    'protectedInputAcceptanceCount',
    'isolatedNegativeCaseCount',
    'replayedByThisPlan',
    'targetNodeAcceptanceEstablished',
  ], 'V6 local predicate closure');
  const normalized = {
    schema: value.schema,
    sigmaStateCommit: fixedHex(
      value.sigmaStateCommit,
      20,
      'V6 local predicate closure SigmaState commit',
    ),
    acceptanceSpecSha256Hex: fixedHex(
      value.acceptanceSpecSha256Hex,
      32,
      'V6 local predicate closure acceptance-spec digest',
    ),
    acceptanceFixtureSha256Hex: fixedHex(
      value.acceptanceFixtureSha256Hex,
      32,
      'V6 local predicate closure acceptance-fixture digest',
    ),
    prooflessTransactionIdHex: fixedHex(
      value.prooflessTransactionIdHex,
      32,
      'V6 local predicate closure proofless transaction ID',
    ),
    prooflessTransactionBytes: nonnegativeInteger(
      value.prooflessTransactionBytes,
      'V6 local predicate closure proofless transaction bytes',
    ),
    protectedInputAcceptanceCount: nonnegativeInteger(
      value.protectedInputAcceptanceCount,
      'V6 local predicate closure protected-input acceptance count',
    ),
    isolatedNegativeCaseCount: nonnegativeInteger(
      value.isolatedNegativeCaseCount,
      'V6 local predicate closure isolated negative-case count',
    ),
    replayedByThisPlan: value.replayedByThisPlan,
    targetNodeAcceptanceEstablished: value.targetNodeAcceptanceEstablished,
  };
  if (
    Object.entries(expected).some(([key, expectedValue]) =>
      normalized[key as keyof typeof normalized] !== expectedValue
    )
  ) {
    throw new Error(
      'V6 local predicate closure does not match the exact reviewed identity',
    );
  }
  return deepFreeze(normalized) as typeof expected;
}

function bindProvisionedTargetNetwork(
  value: ValidityApplicationPooledReserveProvisioningV6Plan['targetNetwork'],
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
  'targetV6'
]['targetNetwork'] {
  if (
    value.ergoNetworkId !== 'ergo-testnet'
    || value.ergoAddressNetworkPrefix !== 16
    || value.p2sAddressHeader !== 19
  ) {
    throw new Error('V6 provisioning target network is not the exact Ergo testnet profile');
  }
  return deepFreeze({
    ergoNetworkId: 'ergo-testnet' as const,
    ergoAddressNetworkPrefix: 16 as const,
    p2sAddressHeader: 19 as const,
    ergoGenesisBlockIdHex: fixedHex(
      value.ergoGenesisBlockIdHex,
      32,
      'V6 provisioning Ergo genesis block ID',
    ),
    sourceNetworkIdHex: fixedHex(
      value.sourceNetworkIdHex,
      32,
      'V6 provisioning source network ID',
    ),
    sidechainIdHex: fixedHex(
      value.sidechainIdHex,
      32,
      'V6 provisioning sidechain ID',
    ),
    settlementProfileIdHex: fixedHex(
      value.settlementProfileIdHex,
      32,
      'V6 provisioning settlement profile ID',
    ),
  });
}

function bindProvisionedContractFamily(
  value: ValidityApplicationPooledReserveProvisioningV6Plan['contracts'],
): Readonly<{
  contractIds: Readonly<Record<ContractRole, string>>;
  contractArtifacts: ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
    'targetV6'
  ]['contractArtifacts'];
}> {
  const bind = (role: ContractRole) => ({
    templateSha256Hex: fixedHex(
      value[role].templateSha256Hex,
      32,
      `provisioned V6 ${role} template digest`,
    ),
    resolvedSourceSha256Hex: fixedHex(
      value[role].resolvedSourceSha256Hex,
      32,
      `provisioned V6 ${role} resolved-source digest`,
    ),
    propositionSha256Hex: fixedHex(
      value[role].propositionSha256Hex,
      32,
      `provisioned V6 ${role} proposition digest`,
    ),
    contractIdHex: fixedHex(
      value[role].contractIdHex,
      32,
      `provisioned V6 ${role} contract ID`,
    ),
  });
  const tracker = bind('tracker');
  const duplicatePrevention = bind('duplicatePrevention');
  const sourceLock = bind('sourceLock');
  const pooledReserve = bind('pooledReserve');
  return deepFreeze({
    contractIds: {
      tracker: tracker.contractIdHex,
      duplicatePrevention: duplicatePrevention.contractIdHex,
      sourceLock: sourceLock.contractIdHex,
      pooledReserve: pooledReserve.contractIdHex,
    },
    contractArtifacts: {
      tracker: {
        templateSha256Hex: tracker.templateSha256Hex,
        resolvedSourceSha256Hex: tracker.resolvedSourceSha256Hex,
        propositionSha256Hex: tracker.propositionSha256Hex,
      },
      duplicatePrevention: {
        templateSha256Hex: duplicatePrevention.templateSha256Hex,
        resolvedSourceSha256Hex: duplicatePrevention.resolvedSourceSha256Hex,
        propositionSha256Hex: duplicatePrevention.propositionSha256Hex,
      },
      sourceLock: {
        templateSha256Hex: sourceLock.templateSha256Hex,
        resolvedSourceSha256Hex: sourceLock.resolvedSourceSha256Hex,
        propositionSha256Hex: sourceLock.propositionSha256Hex,
      },
      pooledReserve: {
        templateSha256Hex: pooledReserve.templateSha256Hex,
        resolvedSourceSha256Hex: pooledReserve.resolvedSourceSha256Hex,
        propositionSha256Hex: pooledReserve.propositionSha256Hex,
      },
    },
  });
}

function bindProvisionedTransactionIdentities(
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV6Plan>,
  genesis: ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
    'targetV6'
  ]['genesis'],
): ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
  'targetV6'
]['transactionIdentities'] {
  const bind = (
    transaction: ValidityApplicationPooledReserveProvisioningV6Plan[
      'transactions'
    ][keyof ValidityApplicationPooledReserveProvisioningV6Plan['transactions']],
    box: ValidityApplicationPooledReserveProvisioningV6Plan[
      'boxes'
    ][keyof ValidityApplicationPooledReserveProvisioningV6Plan['boxes']],
    expectedInputBoxIdHex: string,
    label: string,
  ): Readonly<{ txIdHex: string; boxIdHex: string }> => {
    if (
      transaction.eip12Tx.inputs.length !== 1
      || transaction.outputs.length === 0
      || fixedHex(
        transaction.eip12Tx.inputs[0]?.boxId,
        32,
        `${label} input box ID`,
      ) !== expectedInputBoxIdHex
    ) {
      throw new Error(`${label} does not consume its designated genesis input`);
    }
    const boxIdHex = fixedHex(box.boxId, 32, `${label} output box ID`);
    if (
      fixedHex(
        transaction.outputs[0]?.boxId,
        32,
        `${label} materialized output box ID`,
      ) !== boxIdHex
    ) {
      throw new Error(`${label} does not bind its predicted singleton box`);
    }
    return deepFreeze({
      txIdHex: fixedHex(transaction.txId, 32, `${label} transaction ID`),
      boxIdHex,
    });
  };
  const tracker = bind(
    provisioning.transactions.trackerIssuance,
    provisioning.boxes.tracker,
    genesis.trackerInputBoxIdHex,
    'V6 tracker issuance',
  );
  const duplicatePrevention = bind(
    provisioning.transactions.duplicatePreventionIssuance,
    provisioning.boxes.duplicatePrevention,
    genesis.duplicatePreventionInputBoxIdHex,
    'V6 duplicate-prevention issuance',
  );
  const pooledReserve = bind(
    provisioning.transactions.pooledReserveIssuance,
    provisioning.boxes.pooledReserve,
    genesis.pooledReserveInputBoxIdHex,
    'V6 pooled-reserve issuance',
  );
  if (
    new Set([
      tracker.txIdHex,
      duplicatePrevention.txIdHex,
      pooledReserve.txIdHex,
    ]).size !== 3
    || new Set([
      tracker.boxIdHex,
      duplicatePrevention.boxIdHex,
      pooledReserve.boxIdHex,
    ]).size !== 3
  ) {
    throw new Error('V6 provisioning transaction and singleton identities must be pairwise distinct');
  }
  return deepFreeze({
    trackerIssuanceTxIdHex: tracker.txIdHex,
    trackerBoxIdHex: tracker.boxIdHex,
    duplicatePreventionIssuanceTxIdHex: duplicatePrevention.txIdHex,
    duplicatePreventionBoxIdHex: duplicatePrevention.boxIdHex,
    pooledReserveIssuanceTxIdHex: pooledReserve.txIdHex,
    pooledReserveBoxIdHex: pooledReserve.boxIdHex,
  });
}

function assertRouteMatchesRequirement(
  route: TestnetCutoverReviewRouteV4,
  requirement: LegacyRouteRetirementRequirementV4,
): void {
  if (
    route.routeId !== requirement.routeId
    || route.layer !== requirement.layer
    || route.routeClass !== requirement.routeClass
    || route.sourceSurface !== requirement.sourceSurface
    || route.historicalAuthority !== requirement.historicalAuthority
    || route.requiredDisposition !== requirement.requiredDisposition
    || route.declaration.declaredStatus !== 'inactive-unverified'
    || route.inventory.source !== (
      requirement.layer === 'ergo'
        ? 'ergo-cutover-observation'
        : 'frontier-relayer-compatibility-inventory'
    )
  ) {
    throw new Error(`legacy route ${requirement.routeId} differs from its static requirement`);
  }
}

function assertReplayLineageBoundary(
  lineage: TestnetCutoverReviewReplayLineageV4,
  key: string,
): void {
  const rawCount = nonnegativeInteger(
    lineage.rawReplayKeyCount,
    `${key} raw replay-key count`,
  );
  const burnCount = nonnegativeInteger(
    lineage.canonicalBurnIdCount,
    `${key} canonical burn-ID count`,
  );
  const empty = rawCount === 0;
  if (
    empty
      ? lineage.lineageClassification !== 'never-funded'
        || lineage.contributionKind !== 'empty-observed-lineage'
        || lineage.eventMapping !== 'not-required-empty-lineage'
        || lineage.sourceAdmission !== 'not-required-empty-lineage'
        || lineage.replayImportPacketDigestHex !== null
        || burnCount !== 0
      : lineage.lineageClassification !== 'raw-reconstructed'
        || lineage.contributionKind !== 'authenticated-v2-replay-import'
        || lineage.eventMapping !== 'event-complete-mapping-bound'
        || lineage.sourceAdmission !== 'source-admission-bound'
        || lineage.replayImportPacketDigestHex === null
        || burnCount === 0
  ) {
    throw new Error(`historical replay lineage ${key} is nonempty and unmapped or inconsistent`);
  }
}

function assertReviewRemainsNonAuthorizing(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
): void {
  if (
    review.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA
    || review.version !== 4
    || review.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS
    || review.scope.settlementNetworkId !== 'ergo-testnet'
    || review.scope.sourceNetworkScope !== 'public-testnet'
    || review.scope.sourceOriginIdentifiersIncluded !== false
    || review.scope.rawObservationObjectsIncluded !== false
    || review.activation.parentAuthenticated !== false
    || review.activation.profileActivated !== false
  ) {
    throw new Error('V4 cutover review is not the exact blocked public-testnet profile');
  }
  assertAllTrue(review.checks.builderAssertions, 'V4 review builder checks');
  assertAllFalse(review.checks.serializedBoundary, 'V4 review serialized boundary');
  assertAllFalse(review.authority, 'V4 cutover review authority');
}

function assertProvisioningRemainsNonAuthorizing(
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV6Plan>,
): void {
  if (
    provisioning.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V6_SCHEMA
    || provisioning.version !== 6
    || provisioning.stages.construction !== 'unsigned-plan-complete'
    || provisioning.stages.jvmCheck !== 'not-performed'
    || provisioning.stages.signing !== 'not-authorized'
    || provisioning.stages.submission !== 'not-authorized'
    || provisioning.stages.broadcastAuthorization !== 'not-granted'
    || provisioning.stages.confirmation !== 'not-established'
  ) {
    throw new Error('V6 provisioning is not the exact unsigned non-authorizing plan');
  }
  assertAllTrue(provisioning.invariants, 'V6 provisioning invariants');
  assertAllFalse(provisioning.boundaries, 'V6 provisioning boundaries');
}

function normalizeContractIds(
  value: Readonly<Record<ContractRole, string>>,
  label: string,
): Readonly<Record<ContractRole, string>> {
  return deepFreeze({
    tracker: fixedHex(value.tracker, 32, `${label} tracker contract ID`),
    duplicatePrevention: fixedHex(
      value.duplicatePrevention,
      32,
      `${label} duplicate-prevention contract ID`,
    ),
    sourceLock: fixedHex(value.sourceLock, 32, `${label} source-lock contract ID`),
    pooledReserve: fixedHex(
      value.pooledReserve,
      32,
      `${label} pooled-reserve contract ID`,
    ),
  });
}

function uniqueMap<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): Map<string, T> {
  if (!Array.isArray(values)) throw new Error(`${label} set must be an array`);
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) throw new Error(`${label} ${key} is duplicated`);
    result.set(key, value);
  }
  return result;
}

function lineageKey(routeId: string, instanceId: string): string {
  return `${routeId}\u0000${instanceId}`;
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function assertAllTrue(value: object, label: string): void {
  if (Object.values(value).some(entry => entry !== true)) {
    throw new Error(`${label} must remain true`);
  }
}

function assertAllFalse(value: object, label: string): void {
  if (Object.values(value).some(entry => entry !== false)) {
    throw new Error(`${label} must remain false`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^(?:0x)?[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return value.startsWith('0x') ? value.slice(2) : value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function sortedUniqueStrings(values: readonly string[], label: string): readonly string[] {
  const normalized = values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} ${index} must be non-empty text`);
    }
    return value;
  }).sort(compareCodeUnits);
  return deepFreeze(normalized.filter((value, index) =>
    index === 0 || normalized[index - 1] !== value
  ));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
