import type {
  CompletePegOutBackingInventoryEntry,
  PegOutBackingInventoryPersistencePort,
} from '../relayer-core/peg-out-backing-inventory.js';

interface PegOutBackingInventoryState {
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
}

export function createPegOutBackingInventoryPersistence(
  state: PegOutBackingInventoryState,
): PegOutBackingInventoryPersistencePort {
  return Object.freeze({
    persistAndRevalidateAll<T>(
      entries: readonly CompletePegOutBackingInventoryEntry[],
      validate: (results: readonly unknown[]) => T,
    ): T {
      return state.runPegOutBackingInventoryTransaction(() =>
        validate(entries.map(entry => persistAndRevalidate(state, entry))));
    },
  });
}

function persistAndRevalidate(
  state: PegOutBackingInventoryState,
  entry: CompletePegOutBackingInventoryEntry,
): 'inserted' | 'revalidated' {
  const existing = state.getPegOutByBurnId(entry.burnIdHex) as
    | PersistedPegOutBackingInventoryRow
    | undefined;
  if (existing?.status === 'burn_reverted') {
    assertExactReincludedBurn(existing, entry);
    return 'revalidated';
  }
  state.insertPegOut(
    entry.sidechainTransactionHashHex,
    entry.ergoRecipientAddress,
    entry.amountNanoErg,
    entry.sidechainBurnHeight,
    {
      user: entry.user,
      sidechainId: entry.sidechainIdHex,
      sidechainBlockHash: entry.sidechainBlockHashHex,
      sidechainLogIndex: entry.sidechainLogIndex,
    },
  );
  return existing ? 'revalidated' : 'inserted';
}

function assertExactReincludedBurn(
  existing: PersistedPegOutBackingInventoryRow,
  entry: CompletePegOutBackingInventoryEntry,
): void {
  const matches = normalizeHex(existing.burn_id) === entry.burnIdHex
    && normalizeHex(existing.sidechain_id) === entry.sidechainIdHex
    && normalizeHex(existing.sidechain_burn_tx_hash)
      === entry.sidechainTransactionHashHex
    && existing.sidechain_log_index === entry.sidechainLogIndex
    && existing.ergo_recipient_address === entry.ergoRecipientAddress
    && existing.amount_nanoerg === entry.amountNanoErg.toString()
    && (
      existing.user === null
      || existing.user.toLowerCase() === entry.user.toLowerCase()
    );
  if (!matches) {
    throw new Error(
      'burn-reverted peg-out replacement conflicts with persisted event semantics',
    );
  }
}

interface PersistedPegOutBackingInventoryRow {
  readonly burn_id: string | null;
  readonly sidechain_id: string | null;
  readonly sidechain_burn_tx_hash: string;
  readonly sidechain_log_index: number | null;
  readonly ergo_recipient_address: string;
  readonly amount_nanoerg: string;
  readonly user: string | null;
  readonly status: string;
}

function normalizeHex(value: string | null): string | null {
  if (value === null) return null;
  return value.replace(/^0x/i, '').toLowerCase();
}
