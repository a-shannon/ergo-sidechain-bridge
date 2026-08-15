import { deriveTrustlessBurnIdHex } from '../ergo-settlement-core/trustless-burn-id.js';

export interface CompletePegOutBackingInventoryEntry {
  readonly burnIdHex: string;
  readonly sidechainIdHex: string;
  readonly sidechainTransactionHashHex: string;
  readonly sidechainBlockHashHex: string;
  readonly sidechainLogIndex: number;
  readonly sidechainBurnHeight: number;
  readonly amountNanoErg: bigint;
  readonly ergoRecipientAddress: string;
  readonly user: string;
}

export interface PegOutBackingInventoryPersistencePort {
  persistAndRevalidateAll<T>(
    entries: readonly CompletePegOutBackingInventoryEntry[],
    validate: (results: readonly unknown[]) => T,
  ): T;
}

export interface CompletePegOutBackingInventoryResult {
  readonly scanFromHeight: 0;
  readonly pinnedHeight: number;
  readonly pinnedBlockHashHex: string;
  readonly entries: readonly CompletePegOutBackingInventoryEntry[];
  readonly observedCount: number;
  readonly insertedBurnIds: readonly string[];
}

export interface CompleteSidechainBackingSnapshot {
  readonly pinnedHeight: number;
  readonly pinnedBlockHashHex: string;
  readonly totalSupplyNanoErg: bigint;
  readonly inventory: CompletePegOutBackingInventoryResult;
}

const COMPLETE_INVENTORIES = new WeakSet<object>();
const COMPLETE_BACKING_SNAPSHOTS = new WeakSet<object>();

/**
 * Persist every entry from a complete external inventory. The caller owns
 * inventory completeness; the persistence adapter cannot scope the input by a
 * local cursor or silently skip an existing identity.
 */
export function reconcileCompletePegOutBackingInventory(input: Readonly<{
  entries: readonly CompletePegOutBackingInventoryEntry[];
  persistence: PegOutBackingInventoryPersistencePort;
  scanFromHeight: number;
  pinnedHeight: number;
  pinnedBlockHashHex: string;
}>): CompletePegOutBackingInventoryResult {
  if (input.scanFromHeight !== 0) {
    throw new Error('complete peg-out inventory must start at height 0');
  }
  assertNonnegativeSafeInteger(input.pinnedHeight, 'complete inventory pinned height');
  assertHex32(input.pinnedBlockHashHex, 'complete inventory pinned block hash');

  const seenBurnIds = new Set<string>();
  const entries: CompletePegOutBackingInventoryEntry[] = [];
  for (const entry of input.entries) {
    assertInventoryEntry(entry, input.pinnedHeight, input.pinnedBlockHashHex);
    if (seenBurnIds.has(entry.burnIdHex)) {
      throw new Error(`complete peg-out inventory contains duplicate burn ID ${entry.burnIdHex}`);
    }
    seenBurnIds.add(entry.burnIdHex);
    entries.push(Object.freeze({ ...entry }));
  }
  const insertedBurnIds = input.persistence.persistAndRevalidateAll(
    entries,
    persistenceResults => {
      if (persistenceResults.length !== entries.length) {
        throw new Error(
          'complete peg-out inventory persistence result count mismatch',
        );
      }
      const inserted: string[] = [];
      for (const [index, persistenceResult] of persistenceResults.entries()) {
        if (
          persistenceResult !== 'inserted'
          && persistenceResult !== 'revalidated'
        ) {
          throw new Error(
            'complete peg-out inventory persistence returned an unknown result',
          );
        }
        if (persistenceResult === 'inserted') {
          inserted.push(entries[index].burnIdHex);
        }
      }
      return inserted;
    },
  );
  const result = Object.freeze({
    scanFromHeight: 0 as const,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: input.pinnedBlockHashHex,
    entries: Object.freeze(entries),
    observedCount: entries.length,
    insertedBurnIds: Object.freeze(insertedBurnIds),
  });
  COMPLETE_INVENTORIES.add(result);
  return result;
}

export function assertCompletePegOutBackingInventoryProvenance(
  value: CompletePegOutBackingInventoryResult,
): void {
  if (!value || typeof value !== 'object' || !COMPLETE_INVENTORIES.has(value)) {
    throw new Error('complete peg-out backing inventory provenance is missing');
  }
}

/** Bind the supply and complete inventory produced at one stable sidechain pin. */
export function createCompleteSidechainBackingSnapshot(input: Readonly<{
  inventory: CompletePegOutBackingInventoryResult;
  totalSupplyNanoErg: bigint;
}>): Readonly<CompleteSidechainBackingSnapshot> {
  assertCompletePegOutBackingInventoryProvenance(input.inventory);
  if (input.totalSupplyNanoErg < 0n) {
    throw new Error('complete sidechain backing supply must be non-negative');
  }
  const snapshot = Object.freeze({
    pinnedHeight: input.inventory.pinnedHeight,
    pinnedBlockHashHex: input.inventory.pinnedBlockHashHex,
    totalSupplyNanoErg: input.totalSupplyNanoErg,
    inventory: input.inventory,
  });
  COMPLETE_BACKING_SNAPSHOTS.add(snapshot);
  return snapshot;
}

export function assertCompleteSidechainBackingSnapshotProvenance(
  value: CompleteSidechainBackingSnapshot,
): void {
  if (
    !value
    || typeof value !== 'object'
    || !COMPLETE_BACKING_SNAPSHOTS.has(value)
  ) {
    throw new Error('complete sidechain backing snapshot provenance is missing');
  }
  assertCompletePegOutBackingInventoryProvenance(value.inventory);
  if (
    value.pinnedHeight !== value.inventory.pinnedHeight
    || value.pinnedBlockHashHex !== value.inventory.pinnedBlockHashHex
  ) {
    throw new Error('complete sidechain backing snapshot pin does not match its inventory');
  }
}

function assertInventoryEntry(
  entry: CompletePegOutBackingInventoryEntry,
  pinnedHeight: number,
  pinnedBlockHashHex: string,
): void {
  assertHex32(entry.burnIdHex, 'complete inventory burn ID');
  assertHex32(entry.sidechainIdHex, 'complete inventory sidechain ID');
  assertHex32(
    entry.sidechainTransactionHashHex,
    'complete inventory sidechain transaction hash',
  );
  assertHex32(entry.sidechainBlockHashHex, 'complete inventory block hash');
  assertNonnegativeSafeInteger(
    entry.sidechainLogIndex,
    'complete inventory log index',
  );
  assertNonnegativeSafeInteger(
    entry.sidechainBurnHeight,
    'complete inventory burn height',
  );
  const derivedBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: entry.sidechainIdHex,
    sidechainTxHashHex: entry.sidechainTransactionHashHex,
    eventIndex: entry.sidechainLogIndex,
  });
  if (entry.burnIdHex !== derivedBurnIdHex) {
    throw new Error('complete inventory burn ID does not match its sidechain event identity');
  }
  if (entry.sidechainBurnHeight > pinnedHeight) {
    throw new Error('complete inventory burn height exceeds the pinned height');
  }
  if (
    entry.sidechainBurnHeight === pinnedHeight
    && entry.sidechainBlockHashHex !== pinnedBlockHashHex
  ) {
    throw new Error('complete inventory event at the pin does not match the pinned block');
  }
  if (entry.amountNanoErg <= 0n) {
    throw new Error('complete inventory amount must be positive');
  }
  if (
    typeof entry.ergoRecipientAddress !== 'string'
    || entry.ergoRecipientAddress.length === 0
  ) {
    throw new Error('complete inventory recipient must be non-empty');
  }
  if (typeof entry.user !== 'string' || entry.user.length === 0) {
    throw new Error('complete inventory source user must be non-empty');
  }
}

function assertHex32(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hex`);
  }
}

function assertNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}
