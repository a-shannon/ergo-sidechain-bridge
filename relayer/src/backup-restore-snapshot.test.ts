import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  type BackupRestoreSnapshot,
  compareBackupRestoreSnapshots,
  createBackupRestoreSnapshot,
  readBackupRestoreSnapshotTarget,
  validateBackupRestoreSnapshotTargetPath,
} from './backup-restore-snapshot.js';
import { getDupTreeDigest } from './avl-bridge.js';
import { getSpvTrackerDigest } from './spv-tracker.js';
import { StateTracker, type SpvTrackerHistoryEntry } from './state-tracker.js';

describe('backup-restore snapshot', () => {
  it('summarizes SQLite recovery state without mutating the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-test-'));
    const dbPath = join(dir, 'state.sqlite');
    const dupKeys = ['a1'.repeat(32), 'b2'.repeat(32)];
    const spvEntry: SpvTrackerHistoryEntry = {
      keyHex: 'c3'.repeat(32),
      valueHex: 'd4'.repeat(36),
      sidechainHeight: 42n,
      sidechainHeaderHash: 'e5'.repeat(32),
      bridgeEventRoot: 'f6'.repeat(32),
      ergoAnchorHeight: 54321,
    };

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('11'.repeat(32), '02' + '33'.repeat(32), 1_000_000n, 100);
      tracker.insertPegOut('22'.repeat(32), '02' + '44'.repeat(32), 2_000_000n, 101);
      tracker.updatePegOutStatus('22'.repeat(32), 'batch_submitted', {
        phase1BoxId: '55'.repeat(32),
        pendingAvlKey: '22'.repeat(32),
      });
      tracker.setPersistedAnchorHeight('22'.repeat(32), spvEntry.ergoAnchorHeight);
      for (const key of dupKeys) tracker.insertAvlKey(key);
      tracker.insertSpvTrackerEntry(spvEntry);
      tracker.recordPendingDupHeartbeat('66'.repeat(32), '77'.repeat(32));
      tracker.close();

      const snapshot = createBackupRestoreSnapshot(dbPath);

      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.mode).toBe('readonly');
      expect(snapshot.localOnly).toBe(true);
      expect(snapshot.databaseLabel).toBe('state.sqlite');
      expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(snapshot.stateConsistencyValues.pegOutStatusCounts).toBe(
        'detected=1,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=1,phase2_unlocked=0,burn_reverted=0,failed=0',
      );
      expect(snapshot.stateConsistencyValues.pendingReconciliationRows).toBe('2');
      expect(snapshot.stateConsistencyValues.dupAvlHistoryCount).toBe('2');
      expect(snapshot.stateConsistencyValues.dupRebuiltDigest).toBe(getDupTreeDigest(dupKeys));
      expect(snapshot.stateConsistencyValues.spvTrackerHistoryCount).toBe('1');
      expect(snapshot.stateConsistencyValues.spvRebuiltDigest).toBe(getSpvTrackerDigest([
        { key: spvEntry.keyHex, value: spvEntry.valueHex },
      ]));
      expect(snapshot.stateConsistencyValues.persistedAnchorHeights).toBe('54321');
      expect(snapshot.stateConsistencyValues.pendingDupHeartbeats).toBe('1');
      expect(snapshot.stateConsistencyValues.runtimeArtifactHygiene).toContain('snapshot read-only');
      expect(snapshot.evidenceRows.map(row => row.check)).toEqual([
        'Peg-out status counts',
        'Pending reconciliation rows',
        'DUP AVL history count',
        'DUP rebuilt digest',
        'SPV tracker history count',
        'SPV rebuilt digest',
        'Persisted anchor heights',
        'Pending DUP heartbeats',
        'Runtime artifact hygiene',
      ]);
      expect(snapshot.notes.join('\n')).toContain(
        'does not compare rebuilt DUP or SPV tracker digests with current on-chain singleton boxes',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails loudly when the target is not a migrated bridge state database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-missing-'));
    const dbPath = join(dir, 'empty.sqlite');

    try {
      new Database(dbPath).close();

      expect(() => createBackupRestoreSnapshot(dbPath)).toThrow(/missing required table/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('compares matching pre-backup and restored snapshots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-compare-'));
    const dbPath = join(dir, 'state.sqlite');

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('aa'.repeat(32), '02' + '11'.repeat(32), 1_000_000n, 99);
      tracker.insertAvlKey('bb'.repeat(32));
      tracker.close();

      const preBackup = createBackupRestoreSnapshot(dbPath);
      const restored = withGeneratedAt(
        createBackupRestoreSnapshot(dbPath),
        after(preBackup.generatedAt),
      );
      const comparison = compareBackupRestoreSnapshots(preBackup, restored, {
        preBackupLabel: 'pre.json',
        restoredLabel: 'restored.json',
      });

      expect(comparison.schemaVersion).toBe(1);
      expect(comparison.snapshotSchemaVersions).toEqual({
        preBackup: 1,
        restored: 1,
      });
      expect(comparison.status).toBe('PASS');
      expect(comparison.message).toContain('9 local state rows match');
      expect(comparison.preBackupLabel).toBe('pre.json');
      expect(comparison.restoredLabel).toBe('restored.json');
      expect(comparison.rows.every(row => row.status === 'linked')).toBe(true);
      expect(comparison.notes.join('\n')).toContain('DUP and SPV tracker singleton digest comparisons');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks comparisons that reuse the same snapshot target for both sides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-same-target-'));
    const dbPath = join(dir, 'state.sqlite');

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('aa'.repeat(32), '02' + '11'.repeat(32), 1_000_000n, 99);
      tracker.close();

      const snapshot = createBackupRestoreSnapshot(dbPath);
      const restored = withGeneratedAt(snapshot, after(snapshot.generatedAt));
      const comparison = compareBackupRestoreSnapshots(snapshot, restored, {
        preBackupLabel: '../evidence/recovery/snapshot.json',
        restoredLabel: '../evidence/recovery/snapshot.json',
      });

      expect(comparison.status).toBe('BLOCKED');
      expect(comparison.errors).toContain(
        'Snapshot targets: pre-backup and restored snapshot targets must be distinct',
      );
      expect(comparison.rows.every(row => row.status === 'linked')).toBe(true);
      expect(comparison.message).toContain('1 comparison issue');
      expect(comparison.notes.join('\n')).toContain('must be distinct artifacts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks cloned snapshots with identical generation timestamps under distinct labels', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-clone-'));
    const dbPath = join(dir, 'state.sqlite');

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('aa'.repeat(32), '02' + '11'.repeat(32), 1_000_000n, 99);
      tracker.close();

      const preBackup = createBackupRestoreSnapshot(dbPath);
      const clonedRestored = { ...preBackup };
      const comparison = compareBackupRestoreSnapshots(preBackup, clonedRestored, {
        preBackupLabel: '../evidence/recovery/pre-backup.json',
        restoredLabel: '../evidence/recovery/restored.json',
      });

      expect(comparison.status).toBe('BLOCKED');
      expect(comparison.errors).toContain(
        'Snapshot timestamps: restored snapshot must be generated after pre-backup snapshot',
      );
      expect(comparison.rows.every(row => row.status === 'linked')).toBe(true);
      expect(comparison.notes.join('\n')).toContain('generated after the pre-backup snapshot');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks snapshot comparisons with unsupported snapshot schema versions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-schema-'));
    const dbPath = join(dir, 'state.sqlite');

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('aa'.repeat(32), '02' + '11'.repeat(32), 1_000_000n, 99);
      tracker.close();

      const preBackup = createBackupRestoreSnapshot(dbPath);
      const restored = {
        ...withGeneratedAt(createBackupRestoreSnapshot(dbPath), after(preBackup.generatedAt)),
        schemaVersion: 2,
      } as unknown as BackupRestoreSnapshot;

      const comparison = compareBackupRestoreSnapshots(preBackup, restored);

      expect(comparison.status).toBe('BLOCKED');
      expect(comparison.snapshotSchemaVersions).toEqual({
        preBackup: 1,
        restored: 2,
      });
      expect(comparison.errors).toContain('Snapshot schema: restored snapshot schemaVersion must be 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks snapshot comparisons when restored local state diverges', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-diverge-'));
    const dbPath = join(dir, 'state.sqlite');

    try {
      const tracker = new StateTracker(dbPath);
      tracker.insertPegOut('aa'.repeat(32), '02' + '11'.repeat(32), 1_000_000n, 99);
      tracker.insertAvlKey('bb'.repeat(32));
      tracker.close();
      const preBackup = createBackupRestoreSnapshot(dbPath);

      const restoredTracker = new StateTracker(dbPath);
      restoredTracker.insertAvlKey('cc'.repeat(32));
      restoredTracker.close();
      const restored = withGeneratedAt(
        createBackupRestoreSnapshot(dbPath),
        after(preBackup.generatedAt),
      );

      const comparison = compareBackupRestoreSnapshots(preBackup, restored);

      expect(comparison.status).toBe('BLOCKED');
      expect(comparison.errors).toContain('DUP AVL history count: restored value does not match pre-backup value');
      expect(comparison.errors).toContain('DUP rebuilt digest: restored value does not match pre-backup value');
      expect(comparison.rows.find(row => row.check === 'DUP AVL history count')).toMatchObject({
        preBackupValue: '1',
        restoredValue: '2',
        status: 'blocker',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('guards snapshot comparison targets from secret-bearing and runtime paths', () => {
    expect(validateBackupRestoreSnapshotTargetPath('../evidence/recovery/pre.json')).toEqual([]);
    expect(validateBackupRestoreSnapshotTargetPath('snapshot.md')).toContain(
      'snapshot.md: snapshot compare only accepts JSON snapshot files',
    );
    expect(validateBackupRestoreSnapshotTargetPath('.env')).toContain(
      '<blocked snapshot target>: refusing to read environment files as snapshots',
    );
    const paddedUriTarget = '  https://example.invalid/evidence/pre.json?token=secret  ';
    const paddedUriResult = readBackupRestoreSnapshotTarget(paddedUriTarget);
    const serializedPaddedUriResult = JSON.stringify(paddedUriResult);

    expect(validateBackupRestoreSnapshotTargetPath(paddedUriTarget), paddedUriTarget).toContain(
      '<blocked snapshot target>: refusing to read URI snapshot targets',
    );
    expect(paddedUriResult.label, paddedUriTarget).toBe('<blocked snapshot target>');
    expect(serializedPaddedUriResult, paddedUriTarget).not.toContain('token=secret');
    expect(serializedPaddedUriResult, paddedUriTarget).not.toContain('example.invalid');

    for (const target of [
      '../operator/signing-key-snapshot.json',
      '../operator/api-key-snapshot.json',
      '../operator/seed-phrase-snapshot.json',
      '../runtime/deployed_state.json',
      'evidence/sourceTarget=(runtime/bridge-state.sqlite)/pre-backup.json',
      'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/pre-backup.json',
    ]) {
      const result = readBackupRestoreSnapshotTarget(target);
      const serialized = JSON.stringify(result);

      expect(validateBackupRestoreSnapshotTargetPath(target), target).toContain(
        '<blocked snapshot target>: refusing to read secret-bearing or runtime-state paths as snapshots',
      );
      expect(result.label, target).toBe('<blocked snapshot target>');
      expect(serialized, target).not.toContain(target);
    }
    for (const environmentBindingTarget of [
      'evidence/sourceTarget=(.env)/pre-backup.json',
      'evidence/sourceTarget=%28.env%29/pre-backup.json',
    ]) {
      const environmentBinding = readBackupRestoreSnapshotTarget(environmentBindingTarget);
      expect(validateBackupRestoreSnapshotTargetPath(environmentBindingTarget), environmentBindingTarget).toContain(
        '<blocked snapshot target>: refusing to read environment files as snapshots',
      );
      expect(environmentBinding.label, environmentBindingTarget).toBe('<blocked snapshot target>');
      expect(JSON.stringify(environmentBinding), environmentBindingTarget).not.toContain(environmentBindingTarget);
    }
    for (const localOnlyBindingTarget of [
      'evidence/sourceTarget=%2Ftmp%2Fpre-backup.json',
      'evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fpre-backup.json',
    ]) {
      const localOnlyBinding = readBackupRestoreSnapshotTarget(localOnlyBindingTarget);
      expect(validateBackupRestoreSnapshotTargetPath(localOnlyBindingTarget), localOnlyBindingTarget).toContain(
        '<blocked snapshot target>: refusing to read local-only snapshot target references',
      );
      expect(localOnlyBinding.label, localOnlyBindingTarget).toBe('<blocked snapshot target>');
      expect(JSON.stringify(localOnlyBinding), localOnlyBindingTarget).not.toContain(localOnlyBindingTarget);
    }
    expect(validateBackupRestoreSnapshotTargetPath('../../outside.json')).toContain(
      '<blocked snapshot target>: refusing to read snapshot paths outside the bridge repository',
    );
    expect(validateBackupRestoreSnapshotTargetPath('bridge-state.sqlite')).toContain(
      'bridge-state.sqlite: refusing to read runtime database files as snapshots',
    );
    expect(validateBackupRestoreSnapshotTargetPath('.runtime-backups/pre-backup-snapshot.json')).toContain(
      '<blocked snapshot target>: refusing to read runtime backup directories as snapshots',
    );
    expect(validateBackupRestoreSnapshotTargetPath('../.devnet-backups/restored-snapshot.json')).toContain(
      '<blocked snapshot target>: refusing to read runtime backup directories as snapshots',
    );
  });

  it('redacts local absolute snapshot targets without echoing target filenames', () => {
    const localSnapshotTarget = ['', 'absolute', 'backup-restore-snapshot.json'].join('/');

    const errors = validateBackupRestoreSnapshotTargetPath(localSnapshotTarget);
    const result = readBackupRestoreSnapshotTarget(localSnapshotTarget);
    const serialized = JSON.stringify(result);

    expect(errors).toContain('<blocked snapshot target>: refusing to read local absolute snapshot paths');
    expect(result.snapshot).toBeNull();
    expect(result.label).toBe('<blocked snapshot target>');
    expect(result.errors).toContain('<blocked snapshot target>: refusing to read local absolute snapshot paths');
    expect(serialized).toContain('<blocked snapshot target>');
    expect(serialized).not.toContain('backup-restore-snapshot.json');
  });

  it('redacts snapshot labels when a repository-local path resolves outside the bridge', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-backup-snapshot-read-'));
    const external = mkdtempSync(join(tmpdir(), 'bridge-backup-snapshot-external-'));
    const target = relative(process.cwd(), join(dir, 'link-out', 'snapshot.json')).replace(/\\/g, '/');

    try {
      writeFileSync(join(external, 'snapshot.json'), '{}', 'utf8');
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const result = readBackupRestoreSnapshotTarget(target);
      const serialized = JSON.stringify(result);

      expect(result.snapshot).toBeNull();
      expect(result.label).toBe('<blocked snapshot target>');
      expect(result.errors).toContain(
        '<blocked snapshot target>: refusing to read snapshot paths outside the bridge repository',
      );
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('snapshot.json');
      expect(serialized).not.toContain(external);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks forged snapshot JSON that lacks tool metadata or measured value formats', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-backup-snapshot-shape-'));
    const snapshotPath = join(dir, 'forged.json');
    const target = relative(process.cwd(), snapshotPath).replace(/\\/g, '/');

    try {
      writeFileSync(snapshotPath, JSON.stringify({
        generatedAt: '2026-05-14T00:00:00.000Z',
        mode: 'readonly',
        localOnly: true,
        stateConsistencyValues: {
          pegOutStatusCounts: 'reviewed',
          pendingReconciliationRows: '0',
          dupAvlHistoryCount: '2',
          dupRebuiltDigest: 'not-a-digest',
          spvTrackerHistoryCount: '1',
          spvRebuiltDigest: '0x' + 'b'.repeat(66),
          persistedAnchorHeights: 'none',
          pendingDupHeartbeats: '0',
          runtimeArtifactHygiene: 'clean',
        },
      }), 'utf8');

      const result = readBackupRestoreSnapshotTarget(target);

      expect(result.snapshot).toBeNull();
      expect(result.errors).toContain(`${target}: snapshot databaseLabel must be a non-empty string`);
      expect(result.errors).toContain(`${target}: snapshot schemaVersion must be 1`);
      expect(result.errors).toContain(`${target}: snapshot evidenceRows must be an array`);
      expect(result.errors).toContain(`${target}: snapshot notes must be an array`);
      expect(result.errors).toContain(
        `${target}: snapshot stateConsistencyValues.pegOutStatusCounts must use status=count pairs`,
      );
      expect(result.errors).toContain(
        `${target}: snapshot stateConsistencyValues.dupRebuiltDigest must be a 33-byte AVL digest`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks forged snapshot JSON with missing or mismatched evidence rows', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-backup-snapshot-rows-'));
    const snapshotPath = join(dir, 'forged.json');
    const target = relative(process.cwd(), snapshotPath).replace(/\\/g, '/');

    try {
      writeFileSync(snapshotPath, JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-05-14T00:00:00.000Z',
        databaseLabel: 'state.sqlite',
        mode: 'readonly',
        localOnly: true,
        stateConsistencyValues: {
          pegOutStatusCounts: 'detected=0,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=0,phase2_unlocked=0,burn_reverted=0,failed=0',
          pendingReconciliationRows: '0',
          dupAvlHistoryCount: '1',
          dupRebuiltDigest: '0x' + 'a'.repeat(66),
          spvTrackerHistoryCount: '1',
          spvRebuiltDigest: '0x' + 'b'.repeat(66),
          persistedAnchorHeights: 'none',
          pendingDupHeartbeats: '0',
          runtimeArtifactHygiene: 'clean',
        },
        evidenceRows: [
          {
            check: 'Peg-out status counts',
            value: 'detected=0,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=0,phase2_unlocked=0,burn_reverted=0,failed=0',
            evidenceHint: 'forged row',
          },
          {
            check: 'DUP rebuilt digest',
            value: '0x' + 'c'.repeat(66),
            evidenceHint: 'forged row',
          },
        ],
        notes: ['forged snapshot'],
      }), 'utf8');

      const result = readBackupRestoreSnapshotTarget(target);

      expect(result.snapshot).toBeNull();
      expect(result.errors).toContain(
        `${target}: snapshot evidenceRows is missing required check Pending reconciliation rows`,
      );
      expect(result.errors).toContain(
        `${target}: snapshot evidenceRows.DUP rebuilt digest value must match stateConsistencyValues.dupRebuiltDigest`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function withGeneratedAt(snapshot: BackupRestoreSnapshot, generatedAt: string): BackupRestoreSnapshot {
  return { ...snapshot, generatedAt };
}

function after(generatedAt: string): string {
  return new Date(Date.parse(generatedAt) + 1).toISOString();
}
