export type LegacyRouteRetirementDispositionV4 =
  | 'disable-authority'
  | 'application-bind-or-remove'
  | 'freeze-authority'
  | 'freeze-and-drain'
  | 'freeze-after-replay-import'
  | 'prove-never-funded-and-disable'
  | 'remove-runtime-capability';

export interface LegacyRouteRetirementRequirementV4 {
  readonly routeId: string;
  readonly layer: 'frontier' | 'ergo' | 'relayer';
  readonly routeClass:
    | 'owner-mint'
    | 'authority-mutation'
    | 'fee-withdrawal'
    | 'state-update'
    | 'pause-control'
    | 'bridge-burn'
    | 'bridge-withdrawal'
    | 'commitment-producer'
    | 'source-lock'
    | 'sidechain-state'
    | 'settlement-vault'
    | 'tracker'
    | 'duplicate-prevention'
    | 'runtime-entrypoint';
  readonly sourceSurface: string;
  readonly historicalAuthority:
    | 'owner-key'
    | 'token-owner-key'
    | 'root-origin'
    | 'selected-bridge-address'
    | 'permissionless-caller'
    | 'committee'
    | 'committee-or-depositor-timeout'
    | 'r9-and-anchor-miner'
    | 'reserved-validity-proof'
    | 'local-runtime-capability';
  readonly requiredDisposition: LegacyRouteRetirementDispositionV4;
}

export const
VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4:
  readonly LegacyRouteRetirementRequirementV4[] = deepFreeze([
    route(
      'frontier-ergo-bridge-owner-mint-v1',
      'frontier',
      'owner-mint',
      'solidity/ErgoBridge.sol::mintSERG',
      'owner-key',
      'disable-authority',
    ),
    route(
      'frontier-serg-owner-mint-v1',
      'frontier',
      'owner-mint',
      'solidity/SERG.sol::mint',
      'token-owner-key',
      'disable-authority',
    ),
    route(
      'frontier-ergo-bridge-fee-withdrawal-v1',
      'frontier',
      'fee-withdrawal',
      'solidity/ErgoBridge.sol::withdrawFees',
      'owner-key',
      'disable-authority',
    ),
    route(
      'frontier-ergo-bridge-state-update-v1',
      'frontier',
      'state-update',
      'solidity/ErgoBridge.sol::updateErgoState(uint256,bytes32)',
      'owner-key',
      'disable-authority',
    ),
    route(
      'frontier-ergo-bridge-emergency-pause-v1',
      'frontier',
      'pause-control',
      'solidity/ErgoBridge.sol::emergencyPause(string)',
      'owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-ergo-bridge-unpause-v1',
      'frontier',
      'pause-control',
      'solidity/ErgoBridge.sol::unpause()',
      'owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-ergo-bridge-peg-out-v1',
      'frontier',
      'bridge-withdrawal',
      'solidity/ErgoBridge.sol::pegOut(uint256,bytes)',
      'permissionless-caller',
      'application-bind-or-remove',
    ),
    route(
      'frontier-serg-bridge-burn-v1',
      'frontier',
      'bridge-burn',
      'solidity/SERG.sol::bridgeBurn(address,uint256)',
      'token-owner-key',
      'application-bind-or-remove',
    ),
    route(
      'frontier-ergo-bridge-renounce-ownership-v1',
      'frontier',
      'authority-mutation',
      'solidity/ErgoBridge.sol::renounceOwnership()',
      'owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-ergo-bridge-transfer-ownership-v1',
      'frontier',
      'authority-mutation',
      'solidity/ErgoBridge.sol::transferOwnership(address)',
      'owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-serg-renounce-ownership-v1',
      'frontier',
      'authority-mutation',
      'solidity/SERG.sol::renounceOwnership()',
      'token-owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-serg-transfer-ownership-v1',
      'frontier',
      'authority-mutation',
      'solidity/SERG.sol::transferOwnership(address)',
      'token-owner-key',
      'freeze-authority',
    ),
    route(
      'frontier-root-bridge-address-mutation-v1',
      'frontier',
      'authority-mutation',
      'sources/frontier/0001-bridge-runtime-commitment.patch::set_bridge_address',
      'root-origin',
      'freeze-authority',
    ),
    route(
      'frontier-v1-bridge-event-producer-v1',
      'frontier',
      'commitment-producer',
      'sources/frontier/0001-bridge-runtime-commitment.patch::produce_commitment',
      'selected-bridge-address',
      'application-bind-or-remove',
    ),
    ...[
      'MainChainLock.es',
      'MainChainLockCausalV2.es',
      'MainChainLockCausalLineageV3.es',
      'MainChainLockPooledReserveV4.es',
    ].map(sourceSurface =>
      route(
        `ergo-${routeSlug(sourceSurface)}`,
        'ergo',
        'source-lock',
        `contracts/${sourceSurface}`,
        sourceSurface === 'MainChainLockPooledReserveV4.es'
          ? 'reserved-validity-proof'
          : 'committee-or-depositor-timeout',
        sourceSurface === 'MainChainLock.es'
          ? 'freeze-and-drain'
          : 'prove-never-funded-and-disable',
      )
    ),
    route(
      'ergo-side-chain-state-v1',
      'ergo',
      'sidechain-state',
      'contracts/SideChainState.es',
      'committee',
      'disable-authority',
    ),
    ...[
      'MainChainUnlock.es',
      'MainChainAggregateUnlock.es',
      'MainChainAggregateUnlockBatch.es',
      'MainChainAggregateUnlockTrustless.es',
      'MainChainAggregateUnlockAuthenticated.es',
      'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
      'MainChainCausalVaultV2.es',
      'MainChainCausalVaultValidityV1.es',
      'MainChainCausalVaultValidityApplicationV2.es',
      'MainChainPooledReserveValidityApplicationV4.es',
    ].map(sourceSurface =>
      route(
        `ergo-${routeSlug(sourceSurface)}`,
        'ergo',
        'settlement-vault',
        `contracts/${sourceSurface}`,
        sourceSurface.includes('Validity')
          ? 'reserved-validity-proof'
          : sourceSurface.includes('Authenticated')
              || sourceSurface.includes('Causal')
            ? 'r9-and-anchor-miner'
            : 'committee',
        sourceSurface.includes('Validity')
          ? 'prove-never-funded-and-disable'
          : 'freeze-and-drain',
      )
    ),
    ...[
      'SPVTracker.es',
      'SPVTrackerAuthenticated.es',
      'SPVTrackerValidityV1.es',
      'SPVTrackerValidityApplicationV2.es',
      'SPVTrackerValidityApplicationLineageV3.es',
      'SPVTrackerValidityApplicationPooledReserveV4.es',
      'SPVTrackerPooledReserveBurnV4.es',
      'SPVTrackerPooledReserveBurnV5.es',
    ].map(sourceSurface =>
      route(
        `ergo-${routeSlug(sourceSurface)}`,
        'ergo',
        'tracker',
        `contracts/${sourceSurface}`,
        isReservedValiditySurface(sourceSurface)
          ? 'reserved-validity-proof'
          : sourceSurface === 'SPVTrackerAuthenticated.es'
            ? 'r9-and-anchor-miner'
            : 'committee',
        isReservedValiditySurface(sourceSurface)
          ? 'prove-never-funded-and-disable'
          : 'freeze-and-drain',
      )
    ),
    ...[
      'DoubleUnlockPrevention.es',
      'DoubleUnlockPreventionAggregate.es',
      'DoubleUnlockPreventionAggregateBatch.es',
      'DoubleUnlockPreventionAuthenticated.es',
      'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
      'DoubleUnlockPreventionCausalV2.es',
      'DoubleUnlockPreventionValidityV1.es',
      'DoubleUnlockPreventionValidityApplicationV2.es',
      'DoubleUnlockPreventionPooledReserveV4.es',
    ].map(sourceSurface =>
      route(
        `ergo-${routeSlug(sourceSurface)}`,
        'ergo',
        'duplicate-prevention',
        `contracts/${sourceSurface}`,
        isReservedValiditySurface(sourceSurface)
          ? 'reserved-validity-proof'
          : sourceSurface.includes('Authenticated')
              || sourceSurface.includes('Causal')
            ? 'r9-and-anchor-miner'
            : 'committee',
        sourceSurface.includes('Authenticated')
            || sourceSurface.includes('Causal')
          ? 'freeze-after-replay-import'
          : isReservedValiditySurface(sourceSurface)
            ? 'prove-never-funded-and-disable'
            : 'freeze-and-drain',
      )
    ),
    route(
      'relayer-owner-mint-entrypoint-v1',
      'relayer',
      'runtime-entrypoint',
      'relayer/src/peg-in-transition.ts::legacy owner-mint execution is retired',
      'local-runtime-capability',
      'remove-runtime-capability',
    ),
    route(
      'relayer-legacy-settlement-entrypoint-v1',
      'relayer',
      'runtime-entrypoint',
      'relayer/src/aggregate-settlement-service.ts::legacy aggregate submission',
      'local-runtime-capability',
      'remove-runtime-capability',
    ),
    route(
      'relayer-side-chain-state-updater-v1',
      'relayer',
      'runtime-entrypoint',
      'relayer/src/sidechain-state-updater.ts::SideChainStateUpdater',
      'local-runtime-capability',
      'remove-runtime-capability',
    ),
  ]);

assertStaticLegacyRouteRequirements(
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
);

function route(
  routeId: string,
  layer: LegacyRouteRetirementRequirementV4['layer'],
  routeClass: LegacyRouteRetirementRequirementV4['routeClass'],
  sourceSurface: string,
  historicalAuthority:
    LegacyRouteRetirementRequirementV4['historicalAuthority'],
  requiredDisposition: LegacyRouteRetirementDispositionV4,
): LegacyRouteRetirementRequirementV4 {
  return {
    routeId,
    layer,
    routeClass,
    sourceSurface,
    historicalAuthority,
    requiredDisposition,
  };
}

function assertStaticLegacyRouteRequirements(
  requirements: readonly LegacyRouteRetirementRequirementV4[],
): void {
  if (requirements.length === 0) {
    throw new Error('pooled-reserve V4 legacy route requirements are empty');
  }
  const routeIds = requirements.map(requirement =>
    nonemptyAscii(requirement.routeId, 'legacy route requirement ID')
  );
  if (new Set(routeIds).size !== routeIds.length) {
    throw new Error(
      'pooled-reserve V4 legacy route requirements contain duplicate IDs',
    );
  }
  for (const requirement of requirements) {
    nonemptyAscii(
      requirement.sourceSurface,
      `legacy route ${requirement.routeId} source surface`,
    );
  }
}

function routeSlug(sourceSurface: string): string {
  return sourceSurface
    .replace(/\.es$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function isReservedValiditySurface(sourceSurface: string): boolean {
  return sourceSurface.includes('Validity')
    || sourceSurface.includes('PooledReserve');
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
