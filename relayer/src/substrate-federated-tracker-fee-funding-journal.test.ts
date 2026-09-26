import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE as FEE_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as ADMISSION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  StateTracker,
  type ErgoOperationalTransactionAttemptStatus,
  type ReserveErgoOperationalTransactionAttemptInput,
} from './state-tracker.js';

describe.each([FEE_PROFILE, ADMISSION_PROFILE])('isolated tracker journal %s', PROFILE => {
const hex = (byte: string): string => byte.repeat(32);
const TX_ID = hex('11');
const SOURCE_ID = hex('12');
const OTHER_INPUT_ID = hex('13');
const IDENTITY = hex('14');
const HEADER_ID = hex('15');
const TABLE = 'ergo_operational_transaction_attempts';
const INDEX = 'ergo_operational_active_singleton_profile';
let root: string;
let dbPath: string;
let state: StateTracker;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'e2s-tracker-fee-journal-'));
  dbPath = join(root, 'state.sqlite');
  state = new StateTracker(dbPath);
});

afterEach(() => {
  state.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function restart(): void {
  state.close();
  state = new StateTracker(dbPath);
}

function withDb<T>(run: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function input(
  patch: Partial<ReserveErgoOperationalTransactionAttemptInput> = {},
): ReserveErgoOperationalTransactionAttemptInput {
  return {
    operationProfile: PROFILE,
    expectedTxId: TX_ID,
    sourceBoxId: SOURCE_ID,
    inputBoxIds: [SOURCE_ID, OTHER_INPUT_ID],
    attemptedAtHeight: 100,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: IDENTITY,
    bindingDigestHex: hex('21'),
    signedTransactionDigestHex: hex('22'),
    checkResponseDigestHex: hex('23'),
    revalidationDigestHex: hex('24'),
    authorizationDigestHex: hex('25'),
    ...patch,
  };
}

function replacement(
  patch: Partial<ReserveErgoOperationalTransactionAttemptInput> = {},
): ReserveErgoOperationalTransactionAttemptInput {
  return input({
    expectedTxId: hex('31'),
    sourceBoxId: hex('32'),
    inputBoxIds: [hex('32'), hex('33')],
    ...patch,
  });
}

function finalizeInput(disposition: 'accepted' | 'ambiguous' = 'accepted') {
  return {
    expectedTxId: TX_ID,
    durableAttemptDigestHex: state.getErgoOperationalTransactionAttempt(TX_ID)!.durableAttemptDigestHex,
    disposition,
    submittedTxId: disposition === 'accepted' ? TX_ID : null,
    responseDigestHex: disposition === 'accepted' ? hex('26') : null,
  };
}

function confirm() {
  return state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: TX_ID,
    confirmationHeight: 103,
    confirmationHeaderId: HEADER_ID,
  });
}

function advance(status: ErgoOperationalTransactionAttemptStatus): void {
  if (status === 'accepted' || status === 'ambiguous') {
    state.finalizeErgoOperationalTransactionAttempt(finalizeInput(status));
  } else if (status === 'confirmed') {
    confirm();
  } else if (status === 'abandoned') {
    state.abandonErgoOperationalTransactionAttempt(TX_ID, 'synthetic unavailable source');
  } else if (status === 'quarantined') {
    state.quarantineErgoOperationalTransactionAttempt(TX_ID, 'synthetic rollback');
  }
}

describe('tracker fee funding StateTracker journal', () => {
  it.each(['pending', 'accepted', 'ambiguous'] as const)(
    'preserves %s across restart and excludes a second active attempt on another connection', status => {
      const reserved = state.reserveErgoOperationalTransactionAttempt(input());
      advance(status);
      const exact = state.getErgoOperationalTransactionAttempt(TX_ID);
      restart();
      expect(state.getErgoOperationalTransactionAttempts(PROFILE)).toEqual([exact]);
      expect(exact).toMatchObject({
        status, reconciliationIdentityDigestHex: IDENTITY,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        fundsReleaseAuthorityEpochHex: null,
        targetSidechainHeight: null, targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
      });
      const second = new StateTracker(dbPath);
      try {
        expect(() => second.reserveErgoOperationalTransactionAttempt(replacement()))
          .toThrow(/must be reconciled before replacement/);
        expect(second.getActiveErgoOperationalTransactionAttempts(PROFILE)).toEqual([exact]);
      } finally {
        second.close();
      }
      expect(() => state.reserveErgoOperationalTransactionAttempt(input()))
        .toThrow(/already exists; reconcile/);
      confirm();
      expect(state.getActiveErgoOperationalTransactionAttempts(PROFILE)).toEqual([]);
    },
  );

  it.each([
    { reconciliationIdentityDigestHex: undefined },
    { reconciliationIdentityDigestHex: null },
    { reconciliationIdentityDigestHex: 'not-hex' },
    { reconciliationIdentityDigestHex: 'ab'.repeat(31) },
    { reconciliationIdentityDigestHex: 'ab'.repeat(33) },
    { targetSidechainHeight: 1 },
    { targetSidechainBlockHashHex: hex('41') },
    { heartbeatKeyHex: hex('42') },
  ])('rejects one invalid profile field without a reservation: %j', patch => {
    expect(() => state.reserveErgoOperationalTransactionAttempt(input(patch)))
      .toThrow(/reconciliation identity digest|invalid route context/);
    expect(state.getErgoOperationalTransactionAttempts(PROFILE)).toEqual([]);
  });

  it('binds the exact reconciliation identity into the durable digest', () => {
    const original = state.reserveErgoOperationalTransactionAttempt(input());
    const other = new StateTracker(join(root, 'other.sqlite'));
    try {
      const different = other.reserveErgoOperationalTransactionAttempt(input({
        reconciliationIdentityDigestHex: hex('51'),
      }));
      expect(different.durableAttemptDigestHex).not.toBe(original.durableAttemptDigestHex);
      expect(different.reconciliationIdentityDigestHex).toBe(hex('51'));
    } finally {
      other.close();
    }
    restart();
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(original);
  });

  it.each([
    { durableAttemptDigestHex: hex('51') },
    { expectedTxId: hex('52') },
    { submittedTxId: hex('53') },
    { responseDigestHex: null },
    { disposition: 'ambiguous' as const },
  ])('refuses independent finalization drift and preserves pending bytes: %j', patch => {
    const reserved = state.reserveErgoOperationalTransactionAttempt(input());
    expect(() => state.finalizeErgoOperationalTransactionAttempt({ ...finalizeInput(), ...patch }))
      .toThrow(/cannot be finalized|inconsistent|requires a response digest/);
    restart();
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(reserved);
  });

  it.each(['accepted', 'ambiguous'] as const)('finalizes %s only once', disposition => {
    state.reserveErgoOperationalTransactionAttempt(input());
    const finalization = finalizeInput(disposition);
    const { attempt, journalDigestHex } = state.finalizeErgoOperationalTransactionAttempt(finalization);
    expect(journalDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(() => state.finalizeErgoOperationalTransactionAttempt(finalization))
      .toThrow(/cannot be finalized/);
    restart();
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(attempt);
  });

  it.each([
    'pending', 'accepted', 'ambiguous', 'confirmed', 'abandoned', 'quarantined',
  ] as const)('never reuses a journaled input after %s, in either input position', status => {
    state.reserveErgoOperationalTransactionAttempt(input());
    advance(status);
    restart();
    for (const oldInput of [SOURCE_ID, OTHER_INPUT_ID]) {
      for (const patch of [
        { sourceBoxId: oldInput, inputBoxIds: [oldInput, hex('33')] },
        { inputBoxIds: [hex('32'), oldInput] },
      ]) {
        expect(() => state.reserveErgoOperationalTransactionAttempt(replacement(patch)))
          .toThrow(/must be reconciled before replacement|previously journaled tracker (fee funding|V2 admission) box/);
      }
    }
    expect(state.getErgoOperationalTransactionAttempts(PROFILE)).toHaveLength(1);
    if (['confirmed', 'abandoned', 'quarantined'].includes(status)) {
      expect(state.reserveErgoOperationalTransactionAttempt(replacement()).status).toBe('pending');
      expect(state.getErgoOperationalTransactionAttempts(PROFILE)).toHaveLength(2);
    }
  });

  it.each([
    { confirmationHeight: 104 },
    { confirmationHeaderId: hex('51') },
  ])('does not overwrite a confirmation by implicit re-confirmation: %j', patch => {
    state.reserveErgoOperationalTransactionAttempt(input());
    const confirmed = confirm();
    expect(() => state.confirmErgoOperationalTransactionAttempt({
      expectedTxId: TX_ID, confirmationHeight: 103, confirmationHeaderId: HEADER_ID, ...patch,
    })).toThrow(/confirmation conflicts/);
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(confirmed);
  });

  it('supports explicit rebind but refuses rollback reopening and quarantine reversal', () => {
    state.reserveErgoOperationalTransactionAttempt(input());
    state.finalizeErgoOperationalTransactionAttempt(finalizeInput('ambiguous'));
    const confirmed = confirm();
    expect(confirm()).toEqual(confirmed);
    const rebound = state.rebindConfirmedErgoOperationalTransactionAttempt({
      expectedTxId: TX_ID, confirmationHeight: 104, confirmationHeaderId: hex('52'),
    });
    expect(rebound).toMatchObject({
      status: 'confirmed', confirmationHeight: 104, confirmationHeaderId: hex('52'),
      reconciliationIdentityDigestHex: IDENTITY, durableAttemptDigestHex: confirmed.durableAttemptDigestHex,
    });
    restart();
    expect(state.getConfirmedErgoOperationalTransactionAttempts(PROFILE)).toEqual([rebound]);
    expect(() => state.reopenConfirmedErgoOperationalTransactionAttempt(TX_ID))
      .toThrow(/cannot be reopened; quarantine on rollback/);
    expect(() => state.abandonErgoOperationalTransactionAttempt(TX_ID, 'rollback'))
      .toThrow(/cannot be abandoned/);
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(rebound);
    const quarantined = state.quarantineErgoOperationalTransactionAttempt(TX_ID, 'lost canonical inclusion');
    expect(state.quarantineErgoOperationalTransactionAttempt(TX_ID, 'lost canonical inclusion'))
      .toEqual(quarantined);
    restart();
    expect(state.getQuarantinedErgoOperationalTransactionAttempts(PROFILE)).toEqual([quarantined]);
    expect(state.getReconcilableErgoOperationalTransactionAttempts(PROFILE)).toEqual([]);
    expect(() => confirm()).toThrow(/cannot be confirmed/);
    expect(() => state.rebindConfirmedErgoOperationalTransactionAttempt({
      expectedTxId: TX_ID, confirmationHeight: 105, confirmationHeaderId: hex('53'),
    })).toThrow(/only a confirmed/);
    expect(() => state.quarantineErgoOperationalTransactionAttempt(TX_ID, 'changed reason'))
      .toThrow(/quarantine conflicts/);
    expect(() => state.reserveErgoOperationalTransactionAttempt(replacement({
      inputBoxIds: [hex('32'), SOURCE_ID],
    }))).toThrow(/previously journaled tracker (fee funding|V2 admission) box/);
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(quarantined);
  });

  it('rolls back an inserted reservation when the durable read-back fails', () => {
    withDb(db => db.exec(`
      CREATE TRIGGER synthetic_bad_readback AFTER INSERT ON ${TABLE}
      BEGIN UPDATE ${TABLE} SET binding_digest = 'invalid' WHERE expected_tx_id = NEW.expected_tx_id; END;
    `));
    expect(() => state.reserveErgoOperationalTransactionAttempt(input())).toThrow(/binding digest/);
    expect(withDb(db => db.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get())).toEqual({ n: 0 });
    withDb(db => db.exec('DROP TRIGGER synthetic_bad_readback'));
    restart();
    expect(state.reserveErgoOperationalTransactionAttempt(input()).status).toBe('pending');
  });

  it.each([
    DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    ...(PROFILE === ADMISSION_PROFILE ? [FEE_PROFILE] : [ADMISSION_PROFILE]),
  ])('does not reuse another profile or change its singleton scope: %s', operationProfile => {
    state.reserveErgoOperationalTransactionAttempt(input());
    const other = state.reserveErgoOperationalTransactionAttempt(replacement({ operationProfile }));
    expect(state.getActiveErgoOperationalTransactionAttempts(PROFILE)).toHaveLength(1);
    expect(state.getActiveErgoOperationalTransactionAttempts(operationProfile)).toEqual([other]);
  });

  it('does not let the new profile relax committed-vault reconciliation context', () => {
    expect(() => state.reserveErgoOperationalTransactionAttempt(input({
      operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    }))).toThrow(/only local devnet operational profiles/);
  });
});

describe('tracker fee funding SQLite schema compatibility', () => {
  function schemaSql(db: Database.Database, name: string): string {
    return (db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as { sql: string }).sql;
  }

  it('fails closed for an old table and index without migrating or erasing its history', () => {
    withDb(db => {
      const quotedProfile = `'${PROFILE}'`;
      const removeListEntry = (sql: string): string => sql.replace(`,\n  ${quotedProfile}`, '')
        .replace(`,\n    ${quotedProfile}`, '');
      const tableSql = removeListEntry(schemaSql(db, TABLE)).replace(
        `OR (\n  operation_profile = ${quotedProfile}\n  AND target_sidechain_height IS NULL\n  AND target_sidechain_block_hash IS NULL\n  AND heartbeat_key_hex IS NULL\n  AND reconciliation_identity_digest IS NOT NULL\n)`, '',
      );
      const indexSql = removeListEntry(schemaSql(db, INDEX));
      expect(tableSql).not.toContain(PROFILE);
      expect(indexSql).not.toContain(PROFILE);
      db.exec(`DROP TABLE ${TABLE}; ${tableSql}; ${indexSql};`);
    });
    const prior = state.reserveErgoOperationalTransactionAttempt(input({
      operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
    }));
    const before = withDb(db => ({ table: schemaSql(db, TABLE), index: schemaSql(db, INDEX) }));
    restart();
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(prior);
    expect(() => state.reserveErgoOperationalTransactionAttempt(replacement()))
      .toThrow(/schema is unsupported; a fresh LAB database is required/);
    for (const read of [
      () => state.getErgoOperationalTransactionAttempts(PROFILE),
      () => state.getActiveErgoOperationalTransactionAttempts(PROFILE),
      () => state.getReconcilableErgoOperationalTransactionAttempts(PROFILE),
      () => state.getConfirmedErgoOperationalTransactionAttempts(PROFILE),
      () => state.getQuarantinedErgoOperationalTransactionAttempts(PROFILE),
    ]) {
      expect(read).toThrow(/schema is unsupported/);
    }
    expect(withDb(db => ({ table: schemaSql(db, TABLE), index: schemaSql(db, INDEX) }))).toEqual(before);
    expect(state.getErgoOperationalTransactionAttempts(DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE))
      .toEqual([prior]);
    if (PROFILE === ADMISSION_PROFILE) {
      const fee = state.reserveErgoOperationalTransactionAttempt(replacement({ operationProfile: FEE_PROFILE }));
      restart();
      expect(state.getErgoOperationalTransactionAttempts(FEE_PROFILE)).toEqual([fee]);
      expect(() => state.getErgoOperationalTransactionAttempts(ADMISSION_PROFILE)).toThrow(/schema is unsupported/);
    }
  });

  it.each([
    ['table profile allowlist', 'table', (sql: string) => sql.replace(`,\n  '${PROFILE}'`, '')],
    ['table route context', 'table', (sql: string) => sql.replace(
      `operation_profile = '${PROFILE}'\n  AND target_sidechain_height IS NULL`,
      `operation_profile = '${PROFILE}'\n  AND target_sidechain_height IS NOT NULL`,
    )],
    ['index profile allowlist', 'index', (sql: string) => sql.replace(`,\n    '${PROFILE}'`, '')],
    ['index active statuses', 'index', (sql: string) => sql.replace("'pending', 'accepted', 'ambiguous'", "'pending', 'accepted'")],
    ['index uniqueness', 'index', (sql: string) => sql.replace('CREATE UNIQUE INDEX', 'CREATE INDEX')],
    ['index key', 'index', (sql: string) => sql.replace('(operation_profile)', '(source_box_id)')],
  ] as const)('rejects isolated schema drift in %s after restart', (_name, kind, mutate) => {
    withDb(db => {
      const name = kind === 'table' ? TABLE : INDEX;
      const original = schemaSql(db, name);
      const changed = mutate(original);
      expect(changed).not.toBe(original);
      db.exec(`DROP ${kind} ${name}; ${changed};`);
    });
    restart();
    expect(() => state.reserveErgoOperationalTransactionAttempt(input())).toThrow(/schema is unsupported/);
    expect(() => state.getErgoOperationalTransactionAttempts(PROFILE)).toThrow(/schema is unsupported/);
    expect(withDb(db => db.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get())).toEqual({ n: 0 });
  });

  it.each([
    ['target_sidechain_height', 1],
    ['target_sidechain_block_hash', hex('61')],
    ['heartbeat_key_hex', hex('62')],
    ['reconciliation_identity_digest', null],
  ] as const)('enforces the fee profile SQL constraint for %s', (column, value) => {
    const reserved = state.reserveErgoOperationalTransactionAttempt(input());
    expect(() => withDb(db => db.prepare(`UPDATE ${TABLE} SET ${column} = ? WHERE expected_tx_id = ?`)
      .run(value, TX_ID))).toThrow(/CHECK constraint failed/);
    expect(state.getErgoOperationalTransactionAttempt(TX_ID)).toEqual(reserved);
  });

  it('enforces the singleton in SQLite even when the reservation API is bypassed', () => {
    state.reserveErgoOperationalTransactionAttempt(input());
    expect(() => withDb(db => {
      const row = db.prepare(`SELECT * FROM ${TABLE}`).get() as Record<string, string | number | null>;
      const changed = {
        ...row, expected_tx_id: hex('71'), source_box_id: hex('72'),
        input_box_ids_json: JSON.stringify([hex('72')]), durable_attempt_digest: hex('73'),
      };
      const columns = Object.keys(changed);
      db.prepare(`INSERT INTO ${TABLE} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
        .run(...Object.values(changed));
    })).toThrow(/UNIQUE constraint failed: ergo_operational_transaction_attempts.operation_profile/);
    expect(state.getErgoOperationalTransactionAttempts(PROFILE)).toHaveLength(1);
  });
});
});
