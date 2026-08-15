/**
 * Process-local structural eligibility for the distinct V5 settlement lineage.
 * This module can reject an unsafe cutover, but it cannot authorize one.
 */

import { getDupTreeDigest } from './avl-bridge.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA,
  assertValidityApplicationPooledReserveProvisioningV5Provenance,
  type ValidityApplicationPooledReserveProvisioningV5Plan,
} from './validity-application-pooled-reserve-provisioning-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance,
  type TestnetCutoverReviewReplayLineageV4,
  type TestnetCutoverReviewRouteV4,
  type ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-cutover-eligibility.v5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_STATUS =
  'blocked_non_authorizing_precondition' as const;

const CANDIDATE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5';
const STATIC_ROUTE_SET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_ROUTE_SET';
const candidates = new WeakSet<object>();

type ContractRole = 'tracker' | 'duplicatePrevention' | 'sourceLock' | 'pooledReserve';

export interface BuildValidityApplicationPooledReserveCutoverEligibilityV5Input {
  readonly cutoverReview: Readonly<
    ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
  >;
  readonly provisioningPlan: Readonly<
    ValidityApplicationPooledReserveProvisioningV5Plan
  >;
}

export interface ValidityApplicationPooledReserveCutoverEligibilityV5Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_SCHEMA;
  readonly version: 5;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_STATUS;
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
  readonly targetV5: Readonly<{
    readonly provisioningPlanDigestHex: string;
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
    readonly instanceCount: number;
    readonly drainedInstanceCount: number;
    readonly neverFundedInstanceCount: number;
    readonly routes: readonly Readonly<{
      readonly routeId: string;
      readonly layer: LegacyRouteRetirementRequirementV4['layer'];
      readonly routeClass: LegacyRouteRetirementRequirementV4['routeClass'];
      readonly requiredDisposition:
        LegacyRouteRetirementRequirementV4['requiredDisposition'];
      readonly inventorySource: TestnetCutoverReviewRouteV4['inventory']['source'];
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
    readonly exactPerRouteInventoryBound: true;
    readonly fundedAndUnresolvedInstancesRejected: true;
    readonly everyDupInstanceHasOneReplayLineage: true;
    readonly nonemptyReplayLineagesMappedAndAdmitted: true;
    readonly globalReplayPacketMatched: true;
    readonly retainedV4RuntimeIdentityMatched: true;
    readonly distinctV5TargetLineageMatched: true;
    readonly exactV5ContractFamilyMatched: true;
    readonly exactV5ProvisioningPlanMatched: true;
    readonly exactV5TransactionIdentitiesBound: true;
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

export function buildValidityApplicationPooledReserveCutoverEligibilityV5(
  input: BuildValidityApplicationPooledReserveCutoverEligibilityV5Input,
): Readonly<ValidityApplicationPooledReserveCutoverEligibilityV5Candidate> {
  assertExactKeys(input, [
    'cutoverReview',
    'provisioningPlan',
  ], 'pooled-reserve V5 cutover-eligibility input');
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
    input.cutoverReview,
  );
  assertValidityApplicationPooledReserveProvisioningV5Provenance(
    input.provisioningPlan,
  );

  const review = input.cutoverReview;
  const provisioning = input.provisioningPlan;
  assertReviewRemainsNonAuthorizing(review);
  assertProvisioningRemainsNonAuthorizing(provisioning);

  const routeInventory = buildRouteInventory(review.routes);
  const replay = buildReplayInventory(review, routeInventory.routes);
  const sourceV4 = bindSourceV4(review, provisioning);
  const targetV5 = bindTargetV5(provisioning, sourceV4);
  const blockers = sortedUniqueStrings([
    ...review.blockers,
    'target-network-identity-is-not-authenticated',
    'inventory-exhaustiveness-is-not-authenticated',
    'legacy-route-retirement-evidence-is-not-authenticated',
    'legacy-routes-are-not-retired',
    'v5-singleton-lineage-is-not-established',
    'v5-reserve-lineage-is-not-established',
    'v5-profile-is-not-activated',
    'v5-target-node-acceptance-is-not-established',
    'v5-confirmation-is-not-established',
    'v5-protected-input-burn-attribution-is-not-single-valued',
    'v5-funds-authority-is-not-established',
  ], 'V5 cutover-eligibility blocker');

  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_SCHEMA,
    version: 5 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_STATUS,
    sourceV4,
    targetV5,
    routeInventory,
    replay,
    blockers,
    checks: {
      sameProcessInputsVerified: true as const,
      exactStaticRouteSetMatched: true as const,
      exactPerRouteInventoryBound: true as const,
      fundedAndUnresolvedInstancesRejected: true as const,
      everyDupInstanceHasOneReplayLineage: true as const,
      nonemptyReplayLineagesMappedAndAdmitted: true as const,
      globalReplayPacketMatched: true as const,
      retainedV4RuntimeIdentityMatched: true as const,
      distinctV5TargetLineageMatched: true as const,
      exactV5ContractFamilyMatched: true as const,
      exactV5ProvisioningPlanMatched: true as const,
      exactV5TransactionIdentitiesBound: true as const,
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

export function assertValidityApplicationPooledReserveCutoverEligibilityV5Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveCutoverEligibilityV5Candidate
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve V5 cutover-eligibility candidate was not built in this process',
    );
  }
}

function buildRouteInventory(
  routes: readonly TestnetCutoverReviewRouteV4[],
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate['routeInventory'] {
  const expected = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const actual = uniqueMap(routes, route => route.routeId, 'cutover review route');
  if (
    actual.size !== expected.length
    || expected.some(requirement => !actual.has(requirement.routeId))
  ) {
    throw new Error('cutover eligibility requires the exact static legacy route set');
  }

  let instanceCount = 0;
  let drainedInstanceCount = 0;
  let neverFundedInstanceCount = 0;
  const boundRoutes = expected.map(requirement => {
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
      requiredDisposition: route.requiredDisposition,
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
    instanceCount,
    drainedInstanceCount,
    neverFundedInstanceCount,
    routes: boundRoutes,
  });
}

function buildReplayInventory(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  routes: ValidityApplicationPooledReserveCutoverEligibilityV5Candidate[
    'routeInventory'
  ]['routes'],
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate['replay'] {
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
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate['sourceV4'] {
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
      'V5 provisioning historical replay-genesis digest',
    )
    || ergoCutoverObservationReportDigestHex !== fixedHex(
      provisioning.lineage.cutoverObservationReportDigestHex,
      32,
      'V5 provisioning cutover-observation digest',
    )
    || lineageProfileIdHex !== fixedHex(
      provisioning.profile.sourceRuntimeLineageProfileIdHex,
      32,
      'V5 provisioning source lineage profile ID',
    )
    || duplicatePreventionDigestHex !== fixedHex(
      provisioning.lineage.plannedReplayDigestHex,
      33,
      'V5 provisioning planned duplicate-prevention digest',
    )
    || review.replay.importedCanonicalBurnIdCount
      !== provisioning.lineage.plannedCanonicalBurnIdCount
    || canonicalBurnIdsHex.length
      !== provisioning.lineage.plannedCanonicalBurnIdCount
    || recomputedReplayDigestHex !== duplicatePreventionDigestHex
  ) {
    throw new Error('V5 provisioning does not bind the exact V4 review and replay state');
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
    throw new Error('V5 provisioning canonical burn IDs must be an array');
  }
  const normalized = value.map((burnIdHex, index) => fixedHex(
    burnIdHex,
    32,
    `V5 provisioning canonical burn ID ${index}`,
  ));
  if (normalized.some((burnIdHex, index) =>
    index > 0 && normalized[index - 1]! >= burnIdHex
  )) {
    throw new Error(
      'V5 provisioning canonical burn IDs must be strictly sorted and unique',
    );
  }
  return deepFreeze(normalized);
}

function bindTargetV5(
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
  sourceV4: ValidityApplicationPooledReserveCutoverEligibilityV5Candidate['sourceV4'],
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate['targetV5'] {
  const lineageProfileIdHex = fixedHex(
    provisioning.profile.targetLineageProfileIdHex,
    32,
    'provisioned V5 target lineage profile ID',
  );
  const sourceRuntimeLineageProfileIdHex = fixedHex(
    provisioning.profile.sourceRuntimeLineageProfileIdHex,
    32,
    'provisioned V5 source runtime lineage profile ID',
  );
  const { contractIds: targetContractIds, contractArtifacts } =
    bindProvisionedContractFamily(provisioning.contracts);
  if (
    sourceRuntimeLineageProfileIdHex !== sourceV4.lineageProfileIdHex
    || fixedHex(
      provisioning.profile.sourceRuntimeProfileIdHex,
      32,
      'provisioned V5 retained source runtime profile ID',
    ) !== sourceV4.runtimeProfileIdHex
    || fixedHex(
      provisioning.profile.proofSystemIdHex,
      32,
      'provisioned V5 proof-system ID',
    ) !== sourceV4.sourceProofSystemIdHex
  ) {
    throw new Error('V5 provisioning does not retain the exact V4 runtime identity');
  }
  if (lineageProfileIdHex === sourceRuntimeLineageProfileIdHex) {
    throw new Error('V5 target settlement lineage must remain distinct from V4');
  }
  const sourceContractIdSet = new Set(Object.values(sourceV4.contractIds));
  const targetContractIdSet = new Set(Object.values(targetContractIds));
  if (sourceContractIdSet.size !== 4 || targetContractIdSet.size !== 4) {
    throw new Error('V4 and V5 contract families must each contain four distinct identities');
  }
  for (const role of Object.keys(targetContractIds) as ContractRole[]) {
    if (sourceContractIdSet.has(targetContractIds[role])) {
      throw new Error(`V5 target ${role} contract must be disjoint from V4`);
    }
  }
  const genesis = deepFreeze({
    trackerInputBoxIdHex: fixedHex(
      provisioning.lineage.trackerGenesisInputBoxIdHex,
      32,
      'provisioned V5 tracker genesis input ID',
    ),
    trackerNftIdHex: fixedHex(
      provisioning.lineage.trackerNftIdHex,
      32,
      'provisioned V5 tracker NFT ID',
    ),
    duplicatePreventionInputBoxIdHex: fixedHex(
      provisioning.lineage.duplicatePreventionGenesisInputBoxIdHex,
      32,
      'provisioned V5 DUP genesis input ID',
    ),
    duplicatePreventionNftIdHex: fixedHex(
      provisioning.lineage.duplicatePreventionNftIdHex,
      32,
      'provisioned V5 DUP NFT ID',
    ),
    pooledReserveInputBoxIdHex: fixedHex(
      provisioning.lineage.pooledReserveGenesisInputBoxIdHex,
      32,
      'provisioned V5 reserve genesis input ID',
    ),
    pooledReserveNftIdHex: fixedHex(
      provisioning.lineage.pooledReserveNftIdHex,
      32,
      'provisioned V5 reserve NFT ID',
    ),
  });
  const transactionIdentities = bindProvisionedTransactionIdentities(
    provisioning,
    genesis,
  );
  const targetNetwork = bindProvisionedTargetNetwork(provisioning.targetNetwork);
  return deepFreeze({
    provisioningPlanDigestHex: fixedHex(
      provisioning.planDigestHex,
      32,
      'V5 provisioning plan digest',
    ),
    targetNetwork,
    lineageProfileIdHex,
    sourceRuntimeLineageProfileIdHex,
    sourceRuntimeProfileIdHex: sourceV4.runtimeProfileIdHex,
    burnBindingDigestHex: fixedHex(
      provisioning.profile.burnBindingDigestHex,
      32,
      'provisioned V5 burn-binding digest',
    ),
    finalityPolicy: {
      policyIdHex: fixedHex(
        provisioning.profile.finalityPolicyIdHex,
        32,
        'provisioned V5 finality-policy ID',
      ),
      proofSystemIdHex: fixedHex(
        provisioning.profile.proofSystemIdHex,
        32,
        'provisioned V5 proof-system ID',
      ),
      proofProfileIdHex: fixedHex(
        provisioning.profile.proofProfileIdHex,
        32,
        'provisioned V5 proof-profile ID',
      ),
      approvedTrustAnchorDigestHex: fixedHex(
        provisioning.profile.approvedTrustAnchorDigestHex,
        32,
        'provisioned V5 approved trust-anchor digest',
      ),
    },
    contractIds: targetContractIds,
    contractArtifacts,
    genesis,
    replayCutoverPacketDigestHex: fixedHex(
      provisioning.lineage.replayCutoverPacketDigestHex,
      32,
      'V5 replay-cutover packet digest',
    ),
    duplicatePreventionBoxIdHex:
      transactionIdentities.duplicatePreventionBoxIdHex,
    transactionIdentities,
  });
}

function bindProvisionedTargetNetwork(
  value: ValidityApplicationPooledReserveProvisioningV5Plan['targetNetwork'],
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate[
  'targetV5'
]['targetNetwork'] {
  if (
    value.ergoNetworkId !== 'ergo-testnet'
    || value.ergoAddressNetworkPrefix !== 16
    || value.p2sAddressHeader !== 19
  ) {
    throw new Error('V5 provisioning target network is not the exact Ergo testnet profile');
  }
  return deepFreeze({
    ergoNetworkId: 'ergo-testnet' as const,
    ergoAddressNetworkPrefix: 16 as const,
    p2sAddressHeader: 19 as const,
    ergoGenesisBlockIdHex: fixedHex(
      value.ergoGenesisBlockIdHex,
      32,
      'V5 provisioning Ergo genesis block ID',
    ),
    sourceNetworkIdHex: fixedHex(
      value.sourceNetworkIdHex,
      32,
      'V5 provisioning source network ID',
    ),
    sidechainIdHex: fixedHex(
      value.sidechainIdHex,
      32,
      'V5 provisioning sidechain ID',
    ),
    settlementProfileIdHex: fixedHex(
      value.settlementProfileIdHex,
      32,
      'V5 provisioning settlement profile ID',
    ),
  });
}

function bindProvisionedContractFamily(
  value: ValidityApplicationPooledReserveProvisioningV5Plan['contracts'],
): Readonly<{
  contractIds: Readonly<Record<ContractRole, string>>;
  contractArtifacts: ValidityApplicationPooledReserveCutoverEligibilityV5Candidate[
    'targetV5'
  ]['contractArtifacts'];
}> {
  const bind = (role: ContractRole) => ({
    templateSha256Hex: fixedHex(
      value[role].templateSha256Hex,
      32,
      `provisioned V5 ${role} template digest`,
    ),
    resolvedSourceSha256Hex: fixedHex(
      value[role].resolvedSourceSha256Hex,
      32,
      `provisioned V5 ${role} resolved-source digest`,
    ),
    propositionSha256Hex: fixedHex(
      value[role].propositionSha256Hex,
      32,
      `provisioned V5 ${role} proposition digest`,
    ),
    contractIdHex: fixedHex(
      value[role].contractIdHex,
      32,
      `provisioned V5 ${role} contract ID`,
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
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
  genesis: ValidityApplicationPooledReserveCutoverEligibilityV5Candidate[
    'targetV5'
  ]['genesis'],
): ValidityApplicationPooledReserveCutoverEligibilityV5Candidate[
  'targetV5'
]['transactionIdentities'] {
  const bind = (
    transaction: ValidityApplicationPooledReserveProvisioningV5Plan[
      'transactions'
    ][keyof ValidityApplicationPooledReserveProvisioningV5Plan['transactions']],
    box: ValidityApplicationPooledReserveProvisioningV5Plan[
      'boxes'
    ][keyof ValidityApplicationPooledReserveProvisioningV5Plan['boxes']],
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
    'V5 tracker issuance',
  );
  const duplicatePrevention = bind(
    provisioning.transactions.duplicatePreventionIssuance,
    provisioning.boxes.duplicatePrevention,
    genesis.duplicatePreventionInputBoxIdHex,
    'V5 duplicate-prevention issuance',
  );
  const pooledReserve = bind(
    provisioning.transactions.pooledReserveIssuance,
    provisioning.boxes.pooledReserve,
    genesis.pooledReserveInputBoxIdHex,
    'V5 pooled-reserve issuance',
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
    throw new Error('V5 provisioning transaction and singleton identities must be pairwise distinct');
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
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
): void {
  if (
    provisioning.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA
    || provisioning.version !== 5
    || provisioning.stages.construction !== 'unsigned-plan-complete'
    || provisioning.stages.jvmCheck !== 'not-performed'
    || provisioning.stages.signing !== 'not-authorized'
    || provisioning.stages.submission !== 'not-authorized'
    || provisioning.stages.broadcastAuthorization !== 'not-granted'
    || provisioning.stages.confirmation !== 'not-established'
  ) {
    throw new Error('V5 provisioning is not the exact unsigned non-authorizing plan');
  }
  assertAllTrue(provisioning.invariants, 'V5 provisioning invariants');
  assertAllFalse(provisioning.boundaries, 'V5 provisioning boundaries');
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
