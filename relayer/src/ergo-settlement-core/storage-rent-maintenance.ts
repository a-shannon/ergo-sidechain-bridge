export const ERGO_STORAGE_PERIOD_BLOCKS = 1_051_200;
export const LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE =
  'substrate-grandpa-legacy-spv-tracker-v1';
export const LEGACY_SPV_TRACKER_SOURCE_SHA256_HEX =
  '4de02406ebc8605a3503244ee4496b24db77d6d142df5caab9a241f410e9653c';
export const LEGACY_SPV_TRACKER_ERGO_TREE_SHA256_HEX =
  '7948a84f9d6492c5cd3a066d8588c2ba20450b3ba456ba1ad6138a2566ac7b77';

export const LEGACY_SPV_TRACKER_MINER_FEE_NANOERG = 1_100_000n;
export const LEGACY_SPV_TRACKER_MIN_CHANGE_NANOERG = 1_000_000n;
export const LEGACY_SPV_TRACKER_MINER_FEE_TREE_HEX =
  '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304';

const WATCH_AGE_BLOCKS = Math.floor(ERGO_STORAGE_PERIOD_BLOCKS * 0.75);
const REFRESH_DUE_AGE_BLOCKS = Math.floor(ERGO_STORAGE_PERIOD_BLOCKS * 0.9);
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export type StorageRentRefreshMode =
  | 'neutral-successor'
  | 'semantic-transition-only'
  | 'value-transition-only';

export interface StorageRentSurface {
  surfaceId: string;
  contractFile: string;
  profile: 'active-compatibility' | 'candidate' | 'preactivation';
  refreshMode: StorageRentRefreshMode;
  neutralMaintenanceEligible: boolean;
  reason: string;
}

export const STORAGE_RENT_SURFACE_INVENTORY = Object.freeze([
  surface(
    'side-chain-state-v1',
    'SideChainState.es',
    'active-compatibility',
    'semantic-transition-only',
    'a successor must advance sidechain height and state metadata',
  ),
  surface(
    LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
    'SPVTracker.es',
    'active-compatibility',
    'neutral-successor',
    'the no-ingest branch preserves R5 and R7 while advancing only R4 and R8',
  ),
  surface(
    'substrate-grandpa-authenticated-spv-tracker-v2',
    'SPVTrackerAuthenticated.es',
    'candidate',
    'semantic-transition-only',
    'every accepted successor binds an authenticated checkpoint transition',
  ),
  surface(
    'validity-spv-tracker-v1',
    'SPVTrackerValidityV1.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds a validity-proof transition',
  ),
  surface(
    'validity-application-spv-tracker-v2',
    'SPVTrackerValidityApplicationV2.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds an application validity-proof transition',
  ),
  surface(
    'validity-application-lineage-spv-tracker-v3',
    'SPVTrackerValidityApplicationLineageV3.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds an application proof and lineage transition',
  ),
  surface(
    'validity-application-pooled-reserve-spv-tracker-v4',
    'SPVTrackerValidityApplicationPooledReserveV4.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds an application proof and pooled-reserve transition',
  ),
  surface(
    'pooled-reserve-burn-spv-tracker-v4',
    'SPVTrackerPooledReserveBurnV4.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds a pooled-reserve burn-proof transition',
  ),
  surface(
    'pooled-reserve-burn-spv-tracker-v5',
    'SPVTrackerPooledReserveBurnV5.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds a versioned pooled-reserve burn-proof transition',
  ),
  surface(
    'pooled-reserve-burn-settlement-spv-tracker-v5',
    'SPVTrackerPooledReserveBurnSettlementV5.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds the integrated V5 burn-settlement proof transition',
  ),
  surface(
    'pooled-reserve-burn-settlement-spv-tracker-v6',
    'SPVTrackerPooledReserveBurnSettlementV6.es',
    'preactivation',
    'semantic-transition-only',
    'every successor binds the V6 lineage and retained V5 burn-settlement proof transition',
  ),
  surface(
    'substrate-federated-spv-tracker-v1',
    'SPVTrackerSubstrateFederatedV1.es',
    'candidate',
    'semantic-transition-only',
    'every successor binds a federation-authorized checkpoint and tracker transition',
  ),
  surface(
    'double-unlock-prevention-v1',
    'DoubleUnlockPrevention.es',
    'active-compatibility',
    'semantic-transition-only',
    'every ordinary spend inserts a replay key into the AVL tree',
  ),
  surface(
    'double-unlock-prevention-aggregate-v1',
    'DoubleUnlockPreventionAggregate.es',
    'active-compatibility',
    'semantic-transition-only',
    'every ordinary spend inserts an aggregate replay key',
  ),
  surface(
    'double-unlock-prevention-aggregate-batch-v1',
    'DoubleUnlockPreventionAggregateBatch.es',
    'candidate',
    'semantic-transition-only',
    'every ordinary spend inserts one or more aggregate replay keys',
  ),
  surface(
    'double-unlock-prevention-authenticated-v2',
    'DoubleUnlockPreventionAuthenticated.es',
    'candidate',
    'semantic-transition-only',
    'every ordinary spend binds an authenticated settlement replay insertion',
  ),
  surface(
    'double-unlock-prevention-authenticated-external-fee-v1',
    'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
    'candidate',
    'semantic-transition-only',
    'every ordinary spend binds an authenticated replay insertion',
  ),
  surface(
    'double-unlock-prevention-causal-v2',
    'DoubleUnlockPreventionCausalV2.es',
    'candidate',
    'semantic-transition-only',
    'every ordinary spend binds a causal settlement replay insertion',
  ),
  surface(
    'double-unlock-prevention-validity-v1',
    'DoubleUnlockPreventionValidityV1.es',
    'preactivation',
    'semantic-transition-only',
    'every ordinary spend binds a validity-settlement replay insertion',
  ),
  surface(
    'double-unlock-prevention-validity-application-v2',
    'DoubleUnlockPreventionValidityApplicationV2.es',
    'preactivation',
    'semantic-transition-only',
    'every ordinary spend binds an application-validity replay insertion',
  ),
  surface(
    'double-unlock-prevention-pooled-reserve-v4',
    'DoubleUnlockPreventionPooledReserveV4.es',
    'preactivation',
    'semantic-transition-only',
    'every ordinary spend binds a pooled-reserve replay insertion',
  ),
  surface(
    'double-unlock-prevention-pooled-reserve-v5',
    'DoubleUnlockPreventionPooledReserveV5.es',
    'preactivation',
    'semantic-transition-only',
    'every ordinary spend binds the V5 replay insertion and successor lineage',
  ),
  surface(
    'double-unlock-prevention-pooled-reserve-v6',
    'DoubleUnlockPreventionPooledReserveV6.es',
    'preactivation',
    'semantic-transition-only',
    'every ordinary spend binds the V6 burn proof and replay insertion',
  ),
  surface(
    'double-unlock-prevention-substrate-federated-v1',
    'DoubleUnlockPreventionSubstrateFederatedV1.es',
    'candidate',
    'semantic-transition-only',
    'every ordinary spend binds the federated burn proof and replay insertion',
  ),
  surface(
    'main-chain-lock-v1',
    'MainChainLock.es',
    'active-compatibility',
    'value-transition-only',
    'ordinary spends are deposit commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-lock-causal-v2',
    'MainChainLockCausalV2.es',
    'candidate',
    'value-transition-only',
    'ordinary spends are causal commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-lock-causal-lineage-v3',
    'MainChainLockCausalLineageV3.es',
    'candidate',
    'value-transition-only',
    'ordinary spends are lineage-bound commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-lock-pooled-reserve-v4',
    'MainChainLockPooledReserveV4.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends are pooled-reserve commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-lock-pooled-reserve-v5',
    'MainChainLockPooledReserveV5.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends are V5 pooled-reserve commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-lock-pooled-reserve-v6',
    'MainChainLockPooledReserveV6.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends are V6 pooled-reserve commitment or depositor refund transitions',
  ),
  surface(
    'main-chain-unlock-v1',
    'MainChainUnlock.es',
    'active-compatibility',
    'value-transition-only',
    'ordinary spends release or return settlement value',
  ),
  surface(
    'main-chain-aggregate-unlock-v1',
    'MainChainAggregateUnlock.es',
    'active-compatibility',
    'value-transition-only',
    'ordinary spends execute aggregate settlement value release',
  ),
  surface(
    'main-chain-aggregate-unlock-trustless-candidate-v1',
    'MainChainAggregateUnlockTrustless.es',
    'candidate',
    'value-transition-only',
    'ordinary spends execute a proof-bound settlement value release',
  ),
  surface(
    'main-chain-aggregate-unlock-authenticated-v2',
    'MainChainAggregateUnlockAuthenticated.es',
    'candidate',
    'value-transition-only',
    'ordinary spends execute an authenticated settlement value release',
  ),
  surface(
    'main-chain-aggregate-unlock-authenticated-external-fee-v1',
    'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
    'candidate',
    'value-transition-only',
    'ordinary spends execute an authenticated settlement value release',
  ),
  surface(
    'main-chain-aggregate-unlock-batch-v1',
    'MainChainAggregateUnlockBatch.es',
    'candidate',
    'value-transition-only',
    'ordinary spends execute one or more settlement value releases',
  ),
  surface(
    'main-chain-causal-vault-v2',
    'MainChainCausalVaultV2.es',
    'candidate',
    'value-transition-only',
    'ordinary spends change settlement liabilities through a causal payout',
  ),
  surface(
    'main-chain-causal-vault-validity-v1',
    'MainChainCausalVaultValidityV1.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends change settlement liabilities through a validity payout',
  ),
  surface(
    'main-chain-causal-vault-validity-application-v2',
    'MainChainCausalVaultValidityApplicationV2.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends change liabilities through an application-validity payout',
  ),
  surface(
    'main-chain-pooled-reserve-validity-application-v4',
    'MainChainPooledReserveValidityApplicationV4.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends change reserve value through a deposit or payout transition',
  ),
  surface(
    'main-chain-pooled-reserve-validity-application-v5',
    'MainChainPooledReserveValidityApplicationV5.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends change V5 reserve value through a deposit or payout transition',
  ),
  surface(
    'main-chain-pooled-reserve-validity-application-v6',
    'MainChainPooledReserveValidityApplicationV6.es',
    'preactivation',
    'value-transition-only',
    'ordinary spends change V6 reserve value through a deposit or payout transition',
  ),
] as const);

export type StorageRentAgeRisk = 'fresh' | 'watch' | 'refresh_due' | 'rent_eligible';

export interface StorageRentProjectionInput {
  surfaceId: string;
  currentHeight: number;
  creationHeight: number;
  serializedSizeBytes: number;
  valueNanoErg: number | string | bigint;
  storageFeeFactorNanoErgPerByte: number | string | bigint;
  parameterObservedAtHeight: number;
  parameterSourceId: string;
}

export interface StorageRentProjection {
  surfaceId: string;
  contractFile: string;
  currentHeight: number;
  creationHeight: number;
  ageBlocks: number;
  rentEligibilityHeight: number;
  blocksUntilRentEligible: number;
  serializedSizeBytes: number;
  valueNanoErg: string;
  storageFeeFactorNanoErgPerByte: string;
  projectedStorageFeeNanoErg: string;
  retainedValueAfterRentNanoErg: string;
  feeCovered: boolean;
  parameterObservedAtHeight: number;
  parameterSourceId: string;
  ageRisk: StorageRentAgeRisk;
  neutralMaintenanceEligible: boolean;
  refreshMode: StorageRentRefreshMode;
}

export function serializedBoxSizeBytesFromHex(serializedBoxHex: string): number {
  const clean = serializedBoxHex.startsWith('0x')
    ? serializedBoxHex.slice(2)
    : serializedBoxHex;
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error('serialized box bytes must be non-empty even-length hex');
  }
  return clean.length / 2;
}

export function projectStorageRent(
  input: StorageRentProjectionInput,
): StorageRentProjection {
  const surface = requireSurface(input.surfaceId);
  const currentHeight = nonnegativeHeight(input.currentHeight, 'current height');
  const creationHeight = nonnegativeHeight(input.creationHeight, 'creation height');
  if (creationHeight > currentHeight) {
    throw new Error('creation height must not be above current height');
  }
  const serializedSizeBytes = positiveSafeInteger(
    input.serializedSizeBytes,
    'serialized box size',
  );
  const value = nonnegativeErgoLong(input.valueNanoErg, 'box value');
  const factor = positiveErgoLong(
    input.storageFeeFactorNanoErgPerByte,
    'storage fee factor',
  );
  const parameterObservedAtHeight = nonnegativeHeight(
    input.parameterObservedAtHeight,
    'storage fee factor observation height',
  );
  if (parameterObservedAtHeight > currentHeight) {
    throw new Error('storage fee factor observation height must not be in the future');
  }
  const parameterSourceId = opaqueSourceId(input.parameterSourceId);

  const ageBlocks = currentHeight - creationHeight;
  const rentEligibilityHeight = creationHeight + ERGO_STORAGE_PERIOD_BLOCKS;
  if (!Number.isSafeInteger(rentEligibilityHeight)) {
    throw new Error('rent eligibility height exceeds the JavaScript safe integer range');
  }
  const blocksUntilRentEligible = Math.max(0, rentEligibilityHeight - currentHeight);
  const projectedFee = factor * BigInt(serializedSizeBytes);
  const retainedValue = value - projectedFee;
  const feeCovered = retainedValue > 0n;

  return Object.freeze({
    surfaceId: surface.surfaceId,
    contractFile: surface.contractFile,
    currentHeight,
    creationHeight,
    ageBlocks,
    rentEligibilityHeight,
    blocksUntilRentEligible,
    serializedSizeBytes,
    valueNanoErg: value.toString(),
    storageFeeFactorNanoErgPerByte: factor.toString(),
    projectedStorageFeeNanoErg: projectedFee.toString(),
    retainedValueAfterRentNanoErg: (retainedValue > 0n ? retainedValue : 0n).toString(),
    feeCovered,
    parameterObservedAtHeight,
    parameterSourceId,
    ageRisk: storageRentAgeRisk(ageBlocks, feeCovered),
    neutralMaintenanceEligible: surface.neutralMaintenanceEligible,
    refreshMode: surface.refreshMode,
  });
}

function surface(
  surfaceId: string,
  contractFile: string,
  profile: StorageRentSurface['profile'],
  refreshMode: StorageRentRefreshMode,
  reason: string,
): StorageRentSurface {
  return Object.freeze({
    surfaceId,
    contractFile,
    profile,
    refreshMode,
    neutralMaintenanceEligible: refreshMode === 'neutral-successor',
    reason,
  });
}

function requireSurface(surfaceId: string): StorageRentSurface {
  const found = STORAGE_RENT_SURFACE_INVENTORY.find(
    surfaceEntry => surfaceEntry.surfaceId === surfaceId,
  );
  if (!found) throw new Error(`unknown storage-rent surface: ${surfaceId}`);
  return found;
}

function storageRentAgeRisk(ageBlocks: number, feeCovered: boolean): StorageRentAgeRisk {
  if (ageBlocks >= ERGO_STORAGE_PERIOD_BLOCKS) return 'rent_eligible';
  if (!feeCovered || ageBlocks >= REFRESH_DUE_AGE_BLOCKS) return 'refresh_due';
  if (ageBlocks >= WATCH_AGE_BLOCKS) return 'watch';
  return 'fresh';
}

function nonnegativeHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeErgoLong(value: number | string | bigint, label: string): bigint {
  let parsed: bigint;
  try {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error();
    }
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a nonnegative Ergo Long`);
  }
  if (parsed < 0n || parsed > ERGO_LONG_MAX) {
    throw new Error(`${label} must be a nonnegative Ergo Long`);
  }
  return parsed;
}

function positiveErgoLong(value: number | string | bigint, label: string): bigint {
  const parsed = nonnegativeErgoLong(value, label);
  if (parsed === 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function opaqueSourceId(value: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 128
    || !/^[a-z0-9][a-z0-9._:-]*$/.test(value)
  ) {
    throw new Error('storage fee factor source ID must be a bounded opaque identifier');
  }
  return value;
}
