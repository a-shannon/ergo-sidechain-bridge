import {
  createPegOutBackingInventoryPersistence,
} from '../../adapters/peg-out-backing-inventory-state.js';
import {
  assertFrontierBackingReadAgreementProvenance,
  type FrontierBackingReadAgreementSnapshot,
  type FrontierBackingReadAgreementSources,
} from '../../adapters/frontier-backing-read-agreement.js';
import {
  deriveTrustlessBurnIdHex,
} from '../../ergo-settlement-core/trustless-burn-id.js';
import {
  reconcileCompletePegOutBackingInventory,
  type CompletePegOutBackingInventoryEntry,
  type CompletePegOutBackingInventoryResult,
} from '../../relayer-core/peg-out-backing-inventory.js';

export const SUBSTRATE_FEDERATED_DATABASE_LOSS_RECOVERY_V1_SCHEMA =
  'e2s.substrate-federated-database-loss-recovery.v1' as const;

export interface SubstrateFederatedDatabaseLossInventoryObservationV1 {
  readonly scanFromHeight: 0;
  readonly pinnedHeight: number;
  readonly pinnedBlockHashHex: string;
  readonly entries: readonly CompletePegOutBackingInventoryEntry[];
}

export interface SubstrateFederatedDatabaseLossRecoveryCycleV1 {
  readonly sidechainFinalizedNativeHeight: number;
  readonly sidechainFinalizedNativeBlockHashHex: string;
  readonly sidechainFinalizedExecutionBlockHashHex: string;
}

interface PersistedReconstructedBurnV1 {
  readonly burn_id: string | null;
  readonly sidechain_id: string | null;
  readonly sidechain_burn_tx_hash: string;
  readonly sidechain_block_hash: string | null;
  readonly sidechain_log_index: number | null;
  readonly sidechain_burn_height: number;
  readonly amount_nanoerg: string;
  readonly ergo_recipient_address: string;
  readonly user: string | null;
  readonly status: string;
}

export interface SubstrateFederatedDatabaseLossRecoveryStateV1 {
  runPegOutBackingInventoryTransaction<T>(operation: () => T): T;
  getPegOutByBurnId(burnIdHex: string): unknown;
  insertPegOut(
    sidechainTransactionHashHex: string,
    ergoRecipientAddress: string,
    amountNanoErg: bigint,
    sidechainBurnHeight: number,
    metadata: Readonly<{
      user: string;
      sidechainId: string;
      sidechainBlockHash: string;
      sidechainLogIndex: number;
    }>,
  ): void;
  getPegInCircuitBreakerState(): Readonly<{
    open: boolean;
    continuityRecoveryRequired: boolean;
  }>;
  getSettlementAuthorityInventoryCounts(): Readonly<{
    pegInEvents: number;
    pegInMintTransportAttempts: number;
    aggregateSettlementAttempts: number;
    authenticatedSettlementCandidates: number;
    authenticatedSettlementExecutionReservations: number;
    authenticatedSettlementSubmissionAttempts: number;
    ergoOperationalTransactionAttempts: number;
    pendingDupHeartbeats: number;
  }>;
}

export interface SubstrateFederatedDatabaseLossRecoveryV1Result {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DATABASE_LOSS_RECOVERY_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'reconstructed_non_authorizing';
  readonly inventory: Readonly<CompletePegOutBackingInventoryResult>;
  readonly boundary: {
    readonly executionCyclePinMatched: true;
    readonly nativeExecutionCorrespondenceAuthenticated: false;
    readonly databaseContinuityRecoveryRequired: true;
    readonly fundsReleaseHoldOpen: true;
    readonly completeBurnInventoryReconstructed: true;
    readonly pegInLifecycleRestored: false;
    readonly settlementCandidateRestored: false;
    readonly checkStateRestored: false;
    readonly executionReservationRestored: false;
    readonly aggregateSettlementAttemptRestored: false;
    readonly submissionAttemptRestored: false;
    readonly localRecordAuthoritative: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly transportAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export function projectSubstrateFederatedDatabaseLossInventoryObservationV1(
  input: Readonly<{
    sources: FrontierBackingReadAgreementSources;
    snapshot: unknown;
  }>,
): Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1> {
  assertFrontierBackingReadAgreementProvenance(
    input.sources,
    input.snapshot,
  );
  const snapshot: Readonly<FrontierBackingReadAgreementSnapshot> =
    input.snapshot;
  const sidechainIdHex = fixedHex(
    snapshot.sidechainIdHex,
    'database-loss inventory sidechain ID',
  );
  const pinnedHeight = nonnegativeSafeInteger(
    snapshot.pinnedHeight,
    'database-loss inventory pinned height',
  );
  const pinnedBlockHashHex = fixedHex(
    snapshot.pinnedBlockHashHex,
    'database-loss inventory pinned block hash',
  );
  const entries = snapshot.pegOuts.map(pegOut => {
    const sidechainBurnHeight = nonnegativeSafeInteger(
      pegOut.sidechainBlockNumber,
      'database-loss inventory burn height',
    );
    const sidechainBlockHashHex = fixedHex(
      pegOut.sidechainBlockHash,
      'database-loss inventory burn block hash',
    );
    if (sidechainBurnHeight > pinnedHeight) {
      throw new Error(
        'database-loss inventory burn height exceeds the pinned height',
      );
    }
    if (
      sidechainBurnHeight === pinnedHeight
      && sidechainBlockHashHex !== pinnedBlockHashHex
    ) {
      throw new Error(
        'database-loss inventory burn at the pin does not match the pinned block',
      );
    }
    const sidechainTransactionHashHex = fixedHex(
      pegOut.sidechainTxHash,
      'database-loss inventory burn transaction hash',
    );
    const sidechainLogIndex = nonnegativeSafeInteger(
      pegOut.sidechainLogIndex,
      'database-loss inventory burn log index',
    );
    return Object.freeze({
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: sidechainTransactionHashHex,
        eventIndex: sidechainLogIndex,
      }),
      sidechainIdHex,
      sidechainTransactionHashHex,
      sidechainBlockHashHex,
      sidechainLogIndex,
      sidechainBurnHeight,
      amountNanoErg: pegOut.amount,
      ergoRecipientAddress: pegOut.ergoRecipientAddress,
      user: pegOut.user,
    });
  });

  return deepFreeze({
    scanFromHeight: 0 as const,
    pinnedHeight,
    pinnedBlockHashHex,
    entries,
  });
}

export async function reconstructSubstrateFederatedDatabaseLossStateV1(
  input: Readonly<{
    cycle: Readonly<SubstrateFederatedDatabaseLossRecoveryCycleV1>;
    state: SubstrateFederatedDatabaseLossRecoveryStateV1;
    collectCompleteBurnInventory: () => Promise<
      Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1>
    >;
  }>,
): Promise<Readonly<SubstrateFederatedDatabaseLossRecoveryV1Result>> {
  assertNonAuthorizingReplacement(input.state);

  const observation = await input.collectCompleteBurnInventory();
  const finalizedNativeHeight = nonnegativeSafeInteger(
    input.cycle.sidechainFinalizedNativeHeight,
    'database-loss finalized native height',
  );
  fixedHex(
    input.cycle.sidechainFinalizedNativeBlockHashHex,
    'database-loss finalized native block hash',
  );
  const finalizedExecutionBlockHashHex = fixedHex(
    input.cycle.sidechainFinalizedExecutionBlockHashHex,
    'database-loss finalized execution block hash',
  );
  const pinnedBlockHashHex = fixedHex(
    observation.pinnedBlockHashHex,
    'database-loss inventory pinned block hash',
  );
  if (
    observation.scanFromHeight !== 0
    || observation.pinnedHeight !== finalizedNativeHeight
    || pinnedBlockHashHex !== finalizedExecutionBlockHashHex
  ) {
    throw new Error(
      'database-loss burn inventory is not bound to the scheduling cycle',
    );
  }

  const inventory = reconcileCompletePegOutBackingInventory({
    entries: observation.entries,
    persistence: createPegOutBackingInventoryPersistence(input.state),
    scanFromHeight: observation.scanFromHeight,
    pinnedHeight: observation.pinnedHeight,
    pinnedBlockHashHex,
  });
  for (const entry of inventory.entries) {
    assertExactReconstructedBurn(
      input.state.getPegOutByBurnId(entry.burnIdHex),
      entry,
    );
  }
  assertNonAuthorizingReplacement(input.state);

  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_DATABASE_LOSS_RECOVERY_V1_SCHEMA,
    version: 1 as const,
    status: 'reconstructed_non_authorizing' as const,
    inventory,
    boundary: {
      executionCyclePinMatched: true as const,
      nativeExecutionCorrespondenceAuthenticated: false as const,
      databaseContinuityRecoveryRequired: true as const,
      fundsReleaseHoldOpen: true as const,
      completeBurnInventoryReconstructed: true as const,
      pegInLifecycleRestored: false as const,
      settlementCandidateRestored: false as const,
      checkStateRestored: false as const,
      executionReservationRestored: false as const,
      aggregateSettlementAttemptRestored: false as const,
      submissionAttemptRestored: false as const,
      localRecordAuthoritative: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      transportAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
}

function assertNonAuthorizingReplacement(
  state: SubstrateFederatedDatabaseLossRecoveryStateV1,
): void {
  const hold = state.getPegInCircuitBreakerState();
  if (!hold.open || !hold.continuityRecoveryRequired) {
    throw new Error(
      'database-loss replacement must retain the continuity recovery hold',
    );
  }
  const authority = state.getSettlementAuthorityInventoryCounts();
  if (Object.values(authority).some(count => count !== 0)) {
    throw new Error(
      'database-loss reconstruction cannot restore lifecycle or execution authority',
    );
  }
}

function assertExactReconstructedBurn(
  value: unknown,
  expected: Readonly<CompletePegOutBackingInventoryEntry>,
): void {
  const actual = value as PersistedReconstructedBurnV1 | undefined;
  if (
    actual === undefined
    || normalizeNullableHex(actual.burn_id) !== expected.burnIdHex
    || normalizeNullableHex(actual.sidechain_id) !== expected.sidechainIdHex
    || normalizeHex(actual.sidechain_burn_tx_hash)
      !== expected.sidechainTransactionHashHex
    || normalizeNullableHex(actual.sidechain_block_hash)
      !== expected.sidechainBlockHashHex
    || actual.sidechain_log_index !== expected.sidechainLogIndex
    || actual.sidechain_burn_height !== expected.sidechainBurnHeight
    || actual.amount_nanoerg !== expected.amountNanoErg.toString()
    || actual.ergo_recipient_address !== expected.ergoRecipientAddress
    || actual.user !== expected.user
    || actual.status !== 'detected'
  ) {
    throw new Error(
      `database-loss reconstructed burn ${expected.burnIdHex} differs from the complete inventory`,
    );
  }
}

function fixedHex(value: string, label: string): string {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
  }
  return normalized;
}

function nonnegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeNullableHex(value: string | null): string | null {
  return value === null ? null : normalizeHex(value);
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/i, '').toLowerCase();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
