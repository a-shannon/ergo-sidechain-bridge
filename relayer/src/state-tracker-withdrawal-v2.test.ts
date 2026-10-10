import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  StateTracker,
  type ErgoOperationalTransactionAttempt,
  type ReserveErgoOperationalTransactionAttemptInput,
} from './state-tracker.js';
import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  DUP_HEARTBEAT_OPERATION_PROFILE,
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as ADMISSION,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE as TRACKER_FEE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE as WITHDRAWAL_FEE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE as WITHDRAWAL,
  type ErgoOperationalTransactionProfile,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';

const hex = (value: number): string => value.toString(16).padStart(64, '0');
const TABLE = 'ergo_operational_transaction_attempts';
const INDEX = 'ergo_operational_active_singleton_profile';
const OTHER_PROFILES = [
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE, SCS_ORACLE_UPDATE_OPERATION_PROFILE,
  DUP_HEARTBEAT_OPERATION_PROFILE, DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  TRACKER_FEE, WITHDRAWAL_FEE, ADMISSION,
] as const;

function input(
  operationProfile: ErgoOperationalTransactionProfile = WITHDRAWAL,
  offset = 0,
  patch: Partial<ReserveErgoOperationalTransactionAttemptInput> = {},
): ReserveErgoOperationalTransactionAttemptInput {
  const noIdentity = operationProfile === PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
    || operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE
    || operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE;
  return {
    operationProfile, expectedTxId: hex(offset + 1), sourceBoxId: hex(offset + 2),
    inputBoxIds: [hex(offset + 2), hex(offset + 3), hex(offset + 4)],
    attemptedAtHeight: 100, reconciliationIdentityDigestHex: noIdentity ? null : hex(5),
    targetSidechainHeight: operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE ? 80 : null,
    targetSidechainBlockHashHex: operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE ? hex(6) : null,
    heartbeatKeyHex: operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE ? hex(7) : null,
    bindingDigestHex: hex(8), signedTransactionDigestHex: hex(9),
    checkResponseDigestHex: hex(10), revalidationDigestHex: hex(11), authorizationDigestHex: hex(12),
    ...patch,
  };
}

function fixture(run: (journal: {
  state: () => StateTracker;
  restart: () => void;
  second: () => StateTracker;
  db: <T>(action: (db: Database.Database) => T) => T;
}) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-withdrawal-v2-test-'));
  const path = join(dir, 'synthetic.sqlite');
  let state = new StateTracker(path);
  try {
    run({
      state: () => state,
      restart: () => { state.close(); state = new StateTracker(path); },
      second: () => new StateTracker(path),
      db: action => {
        const db = new Database(path);
        try { return action(db); } finally { db.close(); }
      },
    });
  } finally {
    state.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

const readers = (state: StateTracker) => [
  () => state.getErgoOperationalTransactionAttempts(WITHDRAWAL),
  () => state.getActiveErgoOperationalTransactionAttempts(WITHDRAWAL),
  () => state.getReconcilableErgoOperationalTransactionAttempts(WITHDRAWAL),
  () => state.getConfirmedErgoOperationalTransactionAttempts(WITHDRAWAL),
  () => state.getQuarantinedErgoOperationalTransactionAttempts(WITHDRAWAL),
];
function schema(db: Database.Database, name: string): string {
  return (db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as { sql: string }).sql;
}
function snapshot(db: Database.Database) {
  return { table: schema(db, TABLE), index: schema(db, INDEX), rows: db.prepare(`SELECT * FROM ${TABLE}`).all() };
}
function transition(state: StateTracker, prior: ErgoOperationalTransactionAttempt, status: string): void {
  if (status === 'accepted' || status === 'ambiguous') state.finalizeErgoOperationalTransactionAttempt({
    expectedTxId: prior.expectedTxId, durableAttemptDigestHex: prior.durableAttemptDigestHex,
    disposition: status, submittedTxId: status === 'accepted' ? prior.expectedTxId : null,
    responseDigestHex: status === 'accepted' ? hex(15) : null,
  });
  if (status === 'confirmed') state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: prior.expectedTxId, confirmationHeight: 103, confirmationHeaderId: hex(16),
  });
  if (status === 'abandoned') state.abandonErgoOperationalTransactionAttempt(prior.expectedTxId, 'synthetic absence');
  if (status === 'quarantined') state.quarantineErgoOperationalTransactionAttempt(prior.expectedTxId, 'synthetic rollback');
  if (status === 'rejected') state.rejectErgoOperationalTransactionAttempt({
    expectedTxId: prior.expectedTxId, durableAttemptDigestHex: prior.durableAttemptDigestHex, responseDigestHex: hex(17),
  });
}

describe('withdrawal V2 operational storage', () => {
  it.each([
    { inputBoxIds: [hex(2), hex(3)] },
    { inputBoxIds: [hex(2), hex(3), hex(4), hex(5)] },
    { inputBoxIds: [hex(2), hex(2), hex(4)] },
    { inputBoxIds: [hex(2), hex(3), hex(2)] },
    { inputBoxIds: [hex(2), hex(3), hex(3)] },
    { sourceBoxId: hex(3) },
    { reconciliationIdentityDigestHex: null },
    { reconciliationIdentityDigestHex: undefined },
    { reconciliationIdentityDigestHex: 'not-hex' },
    { reconciliationIdentityDigestHex: hex(5).slice(2) },
    { targetSidechainHeight: 1 },
    { targetSidechainBlockHashHex: hex(6) },
    { heartbeatKeyHex: hex(7) },
  ])('rejects isolated input, identity or context drift %j without recording an attempt', patch => {
    fixture(j => {
      expect(() => j.state().reserveErgoOperationalTransactionAttempt(input(WITHDRAWAL, 0, patch)))
        .toThrow(/exactly three input IDs|must be unique|first input|reconciliation identity digest|invalid route context/);
      expect(j.state().getErgoOperationalTransactionAttempts(WITHDRAWAL)).toEqual([]);
    });
  });

  it.each(['pending', 'accepted', 'ambiguous'] as const)(
    'retains exact %s identity after restart without restoring funds or retry authority', status => {
      fixture(j => {
        const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
        transition(j.state(), prior, status);
        const exact = j.state().getErgoOperationalTransactionAttempt(prior.expectedTxId);
        j.restart();
        expect(j.state().getActiveErgoOperationalTransactionAttempts(WITHDRAWAL)).toEqual([exact]);
        expect(j.state().getReconcilableErgoOperationalTransactionAttempts(WITHDRAWAL)).toEqual([exact]);
        expect(exact).toMatchObject({
          inputBoxIds: input().inputBoxIds, sourceBoxId: input().sourceBoxId,
          reconciliationIdentityDigestHex: hex(5), fundsReleaseAuthorityEpochHex: null,
        });
        expect(() => j.state().assertFundsReleaseAuthorized(undefined, prior.authorizationDigestHex)).toThrow();
        const second = j.second();
        try {
          expect(() => second.reserveErgoOperationalTransactionAttempt(input())).toThrow(/already exists; reconcile/);
          expect(() => second.reserveErgoOperationalTransactionAttempt(input(WITHDRAWAL, 100)))
            .toThrow(/must be reconciled before replacement/);
        } finally { second.close(); }
        if (status === 'ambiguous') {
          expect(() => j.state().finalizeErgoOperationalTransactionAttempt({
            expectedTxId: prior.expectedTxId, durableAttemptDigestHex: prior.durableAttemptDigestHex,
            disposition: 'accepted', submittedTxId: prior.expectedTxId, responseDigestHex: hex(15),
          })).toThrow(/cannot be finalized/);
        }
        expect(j.state().getErgoOperationalTransactionAttempt(prior.expectedTxId)).toEqual(exact);
      });
    },
  );

  it.each([
    { reconciliationIdentityDigestHex: hex(20) },
    { inputBoxIds: [hex(2), hex(21), hex(4)] },
    { inputBoxIds: [hex(2), hex(3), hex(22)] },
    { sourceBoxId: hex(23), inputBoxIds: [hex(23), hex(3), hex(4)] },
    { operationProfile: WITHDRAWAL_FEE },
  ])('binds each exact durable identity %j and refuses its digest on another attempt', patch => {
    fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
      fixture(other => {
        const changed = other.state().reserveErgoOperationalTransactionAttempt(input(WITHDRAWAL, 0, patch));
        expect(changed.durableAttemptDigestHex).not.toBe(prior.durableAttemptDigestHex);
        expect(() => j.state().finalizeErgoOperationalTransactionAttempt({
          expectedTxId: prior.expectedTxId, durableAttemptDigestHex: changed.durableAttemptDigestHex,
          disposition: 'accepted', submittedTxId: prior.expectedTxId, responseDigestHex: hex(15),
        })).toThrow(/cannot be finalized/);
      });
    });
  });

  it.each([0, 1, 2])('holds withdrawal input position %i in either direction, including non-source overlaps', position => {
    for (const reverse of [false, true]) fixture(j => {
      const priorProfile = reverse ? WITHDRAWAL_FEE : WITHDRAWAL;
      const nextProfile = reverse ? WITHDRAWAL : WITHDRAWAL_FEE;
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input(priorProfile));
      const next = input(nextProfile, 100);
      const ids = [...next.inputBoxIds];
      ids[position] = prior.inputBoxIds[position];
      expect(() => j.state().reserveErgoOperationalTransactionAttempt({
        ...next, sourceBoxId: ids[0], inputBoxIds: ids,
      })).toThrow(/previously journaled .* box/);
      expect(j.state().reserveErgoOperationalTransactionAttempt(next).status).toBe('pending');
    });
  });

  it.each(OTHER_PROFILES)('holds inputs against operational profile %s in both directions', otherProfile => {
    for (const reverse of [false, true]) fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input(reverse ? otherProfile : WITHDRAWAL));
      const next = input(reverse ? WITHDRAWAL : otherProfile, 100);
      expect(() => j.state().reserveErgoOperationalTransactionAttempt({
        ...next, inputBoxIds: [next.sourceBoxId, prior.inputBoxIds[2], hex(104)],
      })).toThrow(/previously journaled .* box/);
      expect(j.state().reserveErgoOperationalTransactionAttempt(next).status).toBe('pending');
    });
  });

  it.each(['pending', 'accepted', 'ambiguous', 'confirmed', 'abandoned', 'quarantined', 'rejected'])(
    'retains %s historical input holds in both directions after restart', status => {
      for (const reverse of [false, true]) fixture(j => {
        const prior = j.state().reserveErgoOperationalTransactionAttempt(input(reverse ? ADMISSION : WITHDRAWAL));
        transition(j.state(), prior, status);
        j.restart();
        const next = input(reverse ? WITHDRAWAL : ADMISSION, 100);
        expect(() => j.state().reserveErgoOperationalTransactionAttempt({
          ...next, inputBoxIds: [next.sourceBoxId, hex(103), prior.inputBoxIds[1]],
        })).toThrow(/previously journaled .* box/);
        expect(j.state().reserveErgoOperationalTransactionAttempt(next).status).toBe('pending');
      });
    },
  );

  it('keeps confirmed withdrawal non-reopenable and quarantined history non-retryable', () => {
    fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
      transition(j.state(), prior, 'confirmed');
      expect(() => j.state().reopenConfirmedErgoOperationalTransactionAttempt(prior.expectedTxId))
        .toThrow(/cannot be reopened; quarantine on rollback/);
      const quarantined = j.state().quarantineErgoOperationalTransactionAttempt(prior.expectedTxId, 'synthetic rollback');
      j.restart();
      expect(j.state().getQuarantinedErgoOperationalTransactionAttempts(WITHDRAWAL)).toEqual([quarantined]);
      expect(() => j.state().reserveErgoOperationalTransactionAttempt(input(WITHDRAWAL, 100, {
        inputBoxIds: [hex(102), hex(103), prior.inputBoxIds[2]],
      }))).toThrow(/previously journaled withdrawal V2 box/);
      expect(() => j.state().confirmErgoOperationalTransactionAttempt({
        expectedTxId: prior.expectedTxId, confirmationHeight: 104, confirmationHeaderId: hex(18),
      })).toThrow(/cannot be confirmed/);
    });
  });

  it.each([
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3)])],
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3), hex(4), hex(5)])],
    ['input_box_ids_json', JSON.stringify([hex(2), hex(2), hex(4)])],
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3), hex(2)])],
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3), hex(3)])],
    ['input_box_ids_json', JSON.stringify([hex(2), null, hex(4)])],
    ['source_box_id', hex(3)], ['reconciliation_identity_digest', null],
    ['target_sidechain_height', 1], ['target_sidechain_block_hash', hex(6)], ['heartbeat_key_hex', hex(7)],
  ] as const)('enforces SQL withdrawal shape independently: %s = %s', (column, value) => {
    fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
      expect(() => j.db(db => db.prepare(`UPDATE ${TABLE} SET ${column} = ?`).run(value)))
        .toThrow(/CHECK constraint failed/);
      expect(j.state().getErgoOperationalTransactionAttempt(prior.expectedTxId)).toEqual(prior);
    });
  });

  it.each([
    ['profile', 'table', (sql: string) => sql.replace(`,\n  '${WITHDRAWAL}'`, '')],
    ['context', 'table', (sql: string) => sql.replace(
      `operation_profile = '${WITHDRAWAL}'\n  AND target_sidechain_height IS NULL`,
      `operation_profile = '${WITHDRAWAL}'\n  AND target_sidechain_height IS NOT NULL`,
    )],
    ['cardinality', 'table', (sql: string) => sql.replace('json_array_length(input_box_ids_json) = 3', 'json_array_length(input_box_ids_json) = 2')],
    ['index profile', 'index', (sql: string) => sql.replace(`,\n    '${WITHDRAWAL}'`, '')],
    ['index statuses', 'index', (sql: string) => sql.replace("'pending', 'accepted', 'ambiguous'", "'pending', 'accepted'")],
    ['index uniqueness', 'index', (sql: string) => sql.replace('CREATE UNIQUE INDEX', 'CREATE INDEX')],
  ] as const)('fails closed on isolated %s schema drift after restart', (_name, kind, mutate) => {
    fixture(j => {
      j.db(db => {
        const name = kind === 'table' ? TABLE : INDEX;
        const before = schema(db, name);
        const changed = mutate(before);
        expect(changed).not.toBe(before);
        db.exec(`DROP ${kind} ${name}; ${changed};`);
      });
      j.restart();
      const before = j.db(snapshot);
      expect(() => j.state().reserveErgoOperationalTransactionAttempt(input())).toThrow(/schema is unsupported/);
      for (const read of readers(j.state())) expect(read).toThrow(/schema is unsupported/);
      expect(j.db(snapshot)).toEqual(before);
    });
  });

  it.each([
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3)]), /exactly three input IDs/],
    ['input_box_ids_json', JSON.stringify([hex(2), hex(3), hex(3)]), /must be unique/],
    ['source_box_id', hex(3), /first input/],
    ['reconciliation_identity_digest', 'not-hex', /reconciliation identity digest/],
    ['target_sidechain_height', 1, /invalid route context/],
    ['operation_profile', 'e2s.substrate-federated-local-devnet-withdrawal-operation.v3', /unknown Ergo operational/],
  ] as const)('rejects corrupt persisted %s independently of SQL checks', (column, value, error) => {
    fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
      j.db(db => {
        db.pragma('ignore_check_constraints = ON');
        db.prepare(`UPDATE ${TABLE} SET ${column} = ?`).run(value);
      });
      j.restart();
      expect(() => j.state().getErgoOperationalTransactionAttempt(prior.expectedTxId)).toThrow(error);
    });
  });

  it('enforces the withdrawal singleton independently of reservation preflight', () => {
    fixture(j => {
      j.state().reserveErgoOperationalTransactionAttempt(input());
      expect(() => j.db(db => {
        const row = db.prepare(`SELECT * FROM ${TABLE}`).get() as Record<string, string | number | null>;
        const changed = {
          ...row, expected_tx_id: hex(101), source_box_id: hex(102),
          input_box_ids_json: JSON.stringify([hex(102), hex(103), hex(104)]), durable_attempt_digest: hex(105),
        };
        db.prepare(`INSERT INTO ${TABLE} (${Object.keys(changed).join(',')}) VALUES (${Object.keys(changed).map(() => '?').join(',')})`)
          .run(...Object.values(changed));
      })).toThrow(/UNIQUE constraint failed: ergo_operational_transaction_attempts.operation_profile/);
    });
  });

  it('rejects exact row lookup on unsupported index shape without rewriting the row', () => {
    fixture(j => {
      const prior = j.state().reserveErgoOperationalTransactionAttempt(input());
      j.db(db => {
        const index = schema(db, INDEX).replace("'pending', 'accepted', 'ambiguous'", "'pending', 'accepted'");
        db.exec(`DROP INDEX ${INDEX}; ${index};`);
      });
      const before = j.db(snapshot);
      j.restart();
      expect(() => j.state().getErgoOperationalTransactionAttempt(prior.expectedTxId)).toThrow(/schema is unsupported/);
      expect(j.db(snapshot)).toEqual(before);
    });
  });

  it.each([
    { omitted: [] }, { omitted: [WITHDRAWAL_FEE] },
    { omitted: [ADMISSION] }, { omitted: [WITHDRAWAL_FEE, ADMISSION] },
  ])(
    'preserves per-profile old schema compatibility without migrating withdrawal: $omitted', ({ omitted }) => {
      fixture(j => {
        const absent: readonly ErgoOperationalTransactionProfile[] = [WITHDRAWAL, ...omitted];
        j.db(db => {
          let table = schema(db, TABLE);
          let index = schema(db, INDEX);
          for (const profile of absent) {
            table = table.replace(`,\n  '${profile}'`, '');
            const contextStart = table.indexOf(`OR (\n  operation_profile = '${profile}'\n`);
            expect(contextStart).toBeGreaterThan(-1);
            const contextEnd = table.indexOf('\n)', contextStart) + 2;
            table = table.slice(0, contextStart) + table.slice(contextEnd);
            index = index.replace(`,\n    '${profile}'`, '');
            expect(table).not.toContain(profile);
          }
          db.exec(`DROP TABLE ${TABLE}; ${table}; ${index};`);
        });
        const supported = OTHER_PROFILES.filter(profile => !absent.includes(profile)
          && !(profile === WITHDRAWAL_FEE && absent.includes(ADMISSION)));
        const prior = supported.map((profile, i) => j.state().reserveErgoOperationalTransactionAttempt(input(profile, i * 100)));
        const before = j.db(snapshot);
        j.restart();
        for (const row of prior) expect(j.state().getErgoOperationalTransactionAttempt(row.expectedTxId)).toEqual(row);
        for (const profile of [TRACKER_FEE, WITHDRAWAL_FEE, ADMISSION].filter(profile => !supported.includes(profile))) {
          expect(() => j.state().reserveErgoOperationalTransactionAttempt(input(profile, 1500)))
            .toThrow(/schema is unsupported/);
        }
        for (const read of readers(j.state())) expect(read).toThrow(/schema is unsupported/);
        expect(() => j.state().reserveErgoOperationalTransactionAttempt(input(WITHDRAWAL, 2000)))
          .toThrow(/schema is unsupported; a fresh LAB database is required/);
        expect(j.db(snapshot)).toEqual(before);
      });
    },
  );
});
