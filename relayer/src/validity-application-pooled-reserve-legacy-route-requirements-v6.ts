import {
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS,
} from './validity-application-pooled-reserve-burn-family-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';

export interface LegacyRouteRetirementRequirementV6
  extends LegacyRouteRetirementRequirementV4 {
  readonly introducedBy:
    | 'v4-cutover-review'
    | 'v5-integrated-settlement';
  readonly contractIdHex: string | null;
}

export const
VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6:
  readonly LegacyRouteRetirementRequirementV6[] = deepFreeze([
    integratedV5Route(
      'ergo-main-chain-lock-pooled-reserve-v5',
      'source-lock',
      'contracts/MainChainLockPooledReserveV5.es',
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS.sourceLock,
    ),
    integratedV5Route(
      'ergo-main-chain-pooled-reserve-validity-application-v5',
      'settlement-vault',
      'contracts/MainChainPooledReserveValidityApplicationV5.es',
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS.pooledReserve,
    ),
    integratedV5Route(
      'ergo-spvtracker-pooled-reserve-burn-settlement-v5',
      'tracker',
      'contracts/SPVTrackerPooledReserveBurnSettlementV5.es',
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS.tracker,
    ),
    integratedV5Route(
      'ergo-double-unlock-prevention-pooled-reserve-v5',
      'duplicate-prevention',
      'contracts/DoubleUnlockPreventionPooledReserveV5.es',
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS
        .duplicatePrevention,
    ),
  ]);

export const
VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6:
  readonly LegacyRouteRetirementRequirementV6[] = deepFreeze([
    ...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.map(
      requirement => ({
        ...requirement,
        introducedBy: 'v4-cutover-review' as const,
        contractIdHex: null,
      }),
    ),
    ...VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6,
  ]);

assertStaticLegacyRouteRequirementsV6(
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
);

function integratedV5Route(
  routeId: string,
  routeClass: LegacyRouteRetirementRequirementV4['routeClass'],
  sourceSurface: string,
  contractIdHex: string,
): LegacyRouteRetirementRequirementV6 {
  return {
    routeId,
    layer: 'ergo',
    routeClass,
    sourceSurface,
    historicalAuthority: 'reserved-validity-proof',
    requiredDisposition: 'prove-never-funded-and-disable',
    introducedBy: 'v5-integrated-settlement',
    contractIdHex,
  };
}

function assertStaticLegacyRouteRequirementsV6(
  requirements: readonly LegacyRouteRetirementRequirementV6[],
): void {
  const expectedLength =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.length + 4;
  if (requirements.length !== expectedLength) {
    throw new Error('pooled-reserve V6 legacy route requirement count drifted');
  }
  const routeIds = requirements.map(requirement => requirement.routeId);
  if (new Set(routeIds).size !== routeIds.length) {
    throw new Error('pooled-reserve V6 legacy route requirements contain duplicate IDs');
  }
  const integratedV5 = requirements.filter(
    requirement => requirement.introducedBy === 'v5-integrated-settlement',
  );
  if (
    integratedV5.length !== 4
    || integratedV5.some(requirement =>
      requirement.layer !== 'ergo'
      || requirement.historicalAuthority !== 'reserved-validity-proof'
      || requirement.requiredDisposition !== 'prove-never-funded-and-disable'
      || requirement.contractIdHex === null
      || !/^[0-9a-f]{64}$/.test(requirement.contractIdHex)
      || /^0+$/.test(requirement.contractIdHex)
    )
    || new Set(integratedV5.map(requirement => requirement.contractIdHex)).size
      !== integratedV5.length
  ) {
    throw new Error('pooled-reserve V6 integrated V5 requirements are invalid');
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as object)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
