import { createHash } from 'node:crypto';
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { StateTracker } from './state-tracker.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as TRACKER_PROFILE }
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  exportSubstrateFederatedTwoCycleSqliteEvidenceV1,
  type TwoCycleSqliteEvidenceExportInputV1,
} from './substrate-federated-two-cycle-recovery-export-v1.js';

const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);

function operationalAttempt(offset: number) {
  return {
    operationProfile: TRACKER_PROFILE, expectedTxId: hex(offset + 1),
    sourceBoxId: hex(offset + 2), inputBoxIds: [hex(offset + 2), hex(offset + 3)],
    attemptedAtHeight: 100 + offset, targetSidechainHeight: null,
    targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: hex(offset + 4), bindingDigestHex: hex(offset + 5),
    signedTransactionDigestHex: hex(offset + 6), checkResponseDigestHex: hex(offset + 7),
    revalidationDigestHex: hex(offset + 8), authorizationDigestHex: hex(offset + 9),
  };
}

function confirmedTrackerAttempt(
  tracker: StateTracker, offset: number, transportDisposition: 'accepted' | 'ambiguous' = 'accepted',
) {
  const reserved = tracker.reserveErgoOperationalTransactionAttempt(operationalAttempt(offset));
  tracker.finalizeErgoOperationalTransactionAttempt({ expectedTxId: reserved.expectedTxId,
    durableAttemptDigestHex: reserved.durableAttemptDigestHex, disposition: transportDisposition,
    submittedTxId: transportDisposition === 'accepted' ? reserved.expectedTxId : null,
    responseDigestHex: transportDisposition === 'accepted' ? hex(offset + 10) : null });
  const confirmationHeight = 103 + offset;
  const confirmationHeaderIdHex = hex(offset + 11);
  tracker.confirmErgoOperationalTransactionAttempt({ expectedTxId: reserved.expectedTxId,
    confirmationHeight, confirmationHeaderId: confirmationHeaderIdHex });
  return Object.freeze({ expectedTxId: reserved.expectedTxId,
    durableAttemptDigestHex: reserved.durableAttemptDigestHex,
    authorizationDigestHex: reserved.authorizationDigestHex,
    transportDisposition,
    confirmationHeight, confirmationHeaderIdHex });
}

function fixture(secondTransportDisposition: 'accepted' | 'ambiguous' = 'accepted') {
  const root = mkdtempSync(join(tmpdir(), 'fed-sqlite-export-'));
  const sourceRoot = join(root, 'source');
  mkdirSync(sourceRoot);
  const sourceDatabasePath = join(sourceRoot, 'state.sqlite');
  const tracker = new StateTracker(sourceDatabasePath);
  const first = confirmedTrackerAttempt(tracker, 0);
  const second = confirmedTrackerAttempt(tracker, 32, secondTransportDisposition);
  tracker.updateSyncState({ ergoHeight: 100, sidechainHeight: 25,
    stateBoxId: hex(70), preventionBoxId: hex(71) });
  const expectedSyncState = tracker.getSyncState();
  tracker.close();
  const input: TwoCycleSqliteEvidenceExportInputV1 = {
    sourceRoot, sourceDatabasePath, destinationDirectory: join(root, 'export'),
    expectedSyncState, expectedAttempts: [first, second], assertSourceQuiescent: vi.fn(),
  };
  return { root, input };
}

async function withFixture(
  action: (f: ReturnType<typeof fixture>) => void | Promise<void>,
  secondTransportDisposition: 'accepted' | 'ambiguous' = 'accepted',
) {
  const f = fixture(secondTransportDisposition);
  try { await action(f); } finally {
    rmSync(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

describe('two-cycle SQLite evidence export', () => {
  it('awaits a real backup and publishes only the validated database and manifest', async () => {
    await withFixture(async ({ input }) => {
      const manifest = await exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input);
      expect(readdirSync(input.destinationDirectory).sort()).toEqual(['manifest.json', 'state.sqlite']);
      expect(manifest.fundsExecutionAuthorityRows).toBe(0);
      expect(manifest.circuitBreakerOpen).toBe(true);
      expect(manifest.trackerAdmissionAttempts).toHaveLength(2);
      const bytes = readFileSync(join(input.destinationDirectory, 'state.sqlite'));
      expect(manifest.database.sha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(JSON.parse(readFileSync(join(input.destinationDirectory, 'manifest.json'), 'utf8'))).toEqual(manifest);
      const readonly = new StateTracker(join(input.destinationDirectory, 'state.sqlite'), { readOnly: true });
      try {
        expect(readonly.getPegInCircuitBreakerState().open).toBe(true);
        expect(() => readonly.updateSyncState({ ergoHeight: 101 })).toThrow();
      } finally { readonly.close(); }
      expect(input.assertSourceQuiescent).toHaveBeenCalledTimes(2);
    });
  });

  it('backs up committed WAL pages while a quiescent reader retains the WAL', async () => {
    await withFixture(async ({ input }) => {
      const reader = new Database(input.sourceDatabasePath, { readonly: true });
      reader.exec('BEGIN');
      reader.prepare('SELECT * FROM sync_state').all();
      const writer = new Database(input.sourceDatabasePath);
      writer.exec('CREATE TABLE retained_wal_marker(value TEXT); INSERT INTO retained_wal_marker VALUES (\'cycle-two\')');
      writer.close();
      expect(existsSync(`${input.sourceDatabasePath}-wal`)).toBe(true);
      try {
        await exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input);
        const copied = new Database(join(input.destinationDirectory, 'state.sqlite'), { readonly: true });
        try { expect(copied.prepare('SELECT value FROM retained_wal_marker').pluck().get()).toBe('cycle-two'); }
        finally { copied.close(); }
      } finally { reader.exec('ROLLBACK'); reader.close(); }
    });
  });

  it('preserves historical inventories without interpreting them as live funds authority', async () => {
    await withFixture(async ({ input }) => {
      const tracker = new StateTracker(input.sourceDatabasePath);
      tracker.insertPegIn(hex(90), 'fixture', 1n, 1);
      tracker.close();
      const manifest = await exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input);
      expect(manifest.historicalInventory.pegInEvents).toBe(1);
    });
  });

  it('preserves a confirmed ambiguous transport without inventing an accepted submission', async () => {
    await withFixture(async ({ input }) => {
      const manifest = await exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input);
      expect(manifest.trackerAdmissionAttempts[1].transportDisposition).toBe('ambiguous');
      const exported = new StateTracker(join(input.destinationDirectory, 'state.sqlite'),
        { readOnly: true });
      try {
        const attempt = exported.getErgoOperationalTransactionAttempt(
          input.expectedAttempts[1].expectedTxId,
        );
        expect(attempt?.status).toBe('confirmed');
        expect(attempt?.submissionDisposition).toBe('ambiguous');
        expect(attempt?.submittedTxId).toBeNull();
      } finally { exported.close(); }
    }, 'ambiguous');
  });

  const cases: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ['source quiescence failure', ({ input }) => { Object.assign(input, { assertSourceQuiescent: () => { throw new Error('writer live'); } }); }],
    ['funds lock', ({ input }) => { writeFileSync(`${input.sourceDatabasePath}.funds-execution.lock`, 'held'); }],
    ['live persisted authority', ({ input }) => {
      const tracker = new StateTracker(input.sourceDatabasePath);
      tracker.acquireFundsExecutionAuthority();
      // Simulate a retained row without a lock; close must not clear the injected row.
      tracker.releaseFundsExecutionAuthority();
      tracker.close();
      const db = new Database(input.sourceDatabasePath);
      db.prepare('INSERT INTO funds_execution_authority(id,schema,epoch_hex,owner_digest_hex) VALUES (1,?,?,?)')
        .run('e2s.funds-execution-authority.v1', hex(98), hex(99));
      db.close();
    }],
    ['sync mismatch', ({ input }) => { Object.assign(input, { expectedSyncState: { ...input.expectedSyncState, latestErgoHeight: 101 } }); }],
    ['second-cycle identity mismatch', ({ input }) => { Object.assign(input, { expectedAttempts: [input.expectedAttempts[0], { ...input.expectedAttempts[1], confirmationHeaderIdHex: hex(100) }] }); }],
    ['durable attempt mismatch', ({ input }) => { Object.assign(input, { expectedAttempts: [{ ...input.expectedAttempts[0], durableAttemptDigestHex: hex(100) }, input.expectedAttempts[1]] }); }],
    ['confirmation height mismatch', ({ input }) => { Object.assign(input, { expectedAttempts: [input.expectedAttempts[0], { ...input.expectedAttempts[1], confirmationHeight: 999 }] }); }],
    ['authorization mismatch', ({ input }) => { Object.assign(input, { expectedAttempts: [{ ...input.expectedAttempts[0], authorizationDigestHex: hex(100) }, input.expectedAttempts[1]] }); }],
    ['transport mismatch', ({ input }) => { Object.assign(input, { expectedAttempts: [{ ...input.expectedAttempts[0], transportDisposition: 'ambiguous' }, input.expectedAttempts[1]] }); }],
    ['persisted binding changed without recomputing durable digest', ({ input }) => {
      const db = new Database(input.sourceDatabasePath);
      try {
        db.prepare('UPDATE ergo_operational_transaction_attempts SET binding_digest = ? WHERE expected_tx_id = ?')
          .run(hex(100), input.expectedAttempts[0].expectedTxId);
      } finally { db.close(); }
    }],
    ['repeated tracker attempt identity', ({ input }) => { Object.assign(input, { expectedAttempts: [input.expectedAttempts[0], input.expectedAttempts[0]] }); }],
    ['corrupt source', ({ input }) => { writeFileSync(input.sourceDatabasePath, 'truncated'); }],
    ['byte bound', ({ input }) => { Object.assign(input, { maxDatabaseBytes: 1 }); }],
    ['source path escape', ({ root, input }) => { Object.assign(input, { sourceRoot: join(root, 'other') }); mkdirSync(input.sourceRoot); }],
    ['destination inside source', ({ input }) => { Object.assign(input, { destinationDirectory: join(input.sourceRoot, 'export') }); }],
    ['preexisting destination', ({ input }) => { mkdirSync(input.destinationDirectory); }],
    ['source hardlink', ({ root, input }) => { linkSync(input.sourceDatabasePath, join(root, 'alias.sqlite')); }],
    ['source junction', ({ root, input }) => { const alias = join(root, 'alias'); symlinkSync(input.sourceRoot, alias, 'junction'); Object.assign(input, { sourceDatabasePath: join(alias, 'state.sqlite') }); }],
    ['source continuity hardlink', ({ root, input }) => { linkSync(`${input.sourceDatabasePath}.funds-release-hold`, join(root, 'hold-alias')); }],
  ];
  it.each(cases)('rejects %s without publishing', async (_name, mutate) => {
    await withFixture(async f => {
      mutate(f);
      await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(f.input)).rejects.toThrow();
      if (_name !== 'preexisting destination') expect(existsSync(f.input.destinationDirectory)).toBe(false);
    });
  });

  it('rejects source drift after backup', async () => {
    await withFixture(async ({ input }) => {
      let calls = 0;
      Object.assign(input, { assertSourceQuiescent: () => {
        if (++calls === 2) {
          const db = new Database(input.sourceDatabasePath);
          db.exec('CREATE TABLE drift(value TEXT)');
          db.close();
        }
      } });
      await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input)).rejects.toThrow(/drift/);
      expect(existsSync(input.destinationDirectory)).toBe(false);
    });
  });

  it('rejects an extra confirmed tracker admission beyond the two expected cycles', async () => {
    await withFixture(async ({ input }) => {
      const tracker = new StateTracker(input.sourceDatabasePath);
      try { confirmedTrackerAttempt(tracker, 64); } finally { tracker.close(); }
      await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input))
        .rejects.toThrow(/attempt count differs/);
      expect(existsSync(input.destinationDirectory)).toBe(false);
    });
  });

  it('rejects a formerly confirmed tracker admission after quarantine', async () => {
    await withFixture(async ({ input }) => {
      const tracker = new StateTracker(input.sourceDatabasePath);
      try {
        tracker.quarantineErgoOperationalTransactionAttempt(
          input.expectedAttempts[1].expectedTxId, 'synthetic canonical rollback',
        );
      } finally { tracker.close(); }
      await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input))
        .rejects.toThrow(/attempt identity mismatch/);
      expect(existsSync(input.destinationDirectory)).toBe(false);
    });
  });

  it('does not publish when backup rejects', async () => {
    await withFixture(async ({ input }) => {
      const backup = vi.spyOn(Database.prototype, 'backup').mockRejectedValueOnce(new Error('backup failed'));
      try {
        await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input)).rejects.toThrow('backup failed');
        expect(existsSync(input.destinationDirectory)).toBe(false);
      } finally { backup.mockRestore(); }
    });
  });

  it.each(['truncated', 'changed-identity', 'sidecar', 'extra-file'] as const)(
    'rejects a %s backup result without a manifest or final directory', async fault => {
      await withFixture(async ({ root, input }) => {
        const original = Database.prototype.backup;
        const backup = vi.spyOn(Database.prototype, 'backup').mockImplementationOnce(async function (
          this: Database.Database, target: string, options?: Database.BackupOptions,
        ) {
          const result = await original.call(this, target, options);
          if (fault === 'truncated') writeFileSync(target, 'partial');
          if (fault === 'changed-identity') {
            const db = new Database(target);
            db.exec('UPDATE sync_state SET latest_ergo_height = 101');
            db.close();
          }
          if (fault === 'sidecar') writeFileSync(`${target}.funds-release-continuity`, 'unexpected');
          if (fault === 'extra-file') writeFileSync(join(target, '..', 'private-key'), 'sentinel');
          return result;
        });
        try {
          await expect(exportSubstrateFederatedTwoCycleSqliteEvidenceV1(input)).rejects.toThrow();
          expect(existsSync(input.destinationDirectory)).toBe(false);
          for (const name of readdirSync(root).filter(name => name.startsWith('.export.partial-'))) {
            expect(existsSync(join(root, name, 'manifest.json'))).toBe(false);
          }
        } finally { backup.mockRestore(); }
      });
    },
  );
});
