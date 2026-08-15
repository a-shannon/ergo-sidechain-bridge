import Database from 'better-sqlite3';
import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';

import { getDupTreeDigest } from './avl-bridge.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { getSpvTrackerDigest, type SpvTrackerHistoryEntry } from './spv-tracker.js';
import type { PegOutStatus } from './state-tracker.js';

const PEG_OUT_STATUSES: PegOutStatus[] = [
  'detected',
  'confirmed',
  'phase1_created',
  'aggregate_submitted',
  'batch_submitted',
  'phase2_unlocked',
  'burn_reverted',
  'failed',
];

const PENDING_RECONCILIATION_STATUSES = new Set<PegOutStatus>([
  'detected',
  'confirmed',
  'phase1_created',
  'aggregate_submitted',
  'batch_submitted',
]);

const REQUIRED_TABLES = [
  'peg_out_events',
  'avl_tree_history',
  'spv_tracker_history',
  'pending_dup_heartbeats',
];

export interface BackupRestoreSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  databaseLabel: string;
  mode: 'readonly';
  localOnly: true;
  stateConsistencyValues: {
    pegOutStatusCounts: string;
    pendingReconciliationRows: string;
    dupAvlHistoryCount: string;
    dupRebuiltDigest: string;
    spvTrackerHistoryCount: string;
    spvRebuiltDigest: string;
    persistedAnchorHeights: string;
    pendingDupHeartbeats: string;
    runtimeArtifactHygiene: string;
  };
  evidenceRows: Array<{
    check: string;
    value: string;
    evidenceHint: string;
  }>;
  notes: string[];
}

export interface BackupRestoreSnapshotComparisonRow {
  check: string;
  preBackupValue: string;
  restoredValue: string;
  status: 'linked' | 'blocker';
  evidenceHint: string;
}

export interface BackupRestoreSnapshotComparison {
  schemaVersion: 1;
  status: 'PASS' | 'BLOCKED';
  comparedAt: string;
  snapshotSchemaVersions: {
    preBackup: unknown;
    restored: unknown;
  };
  preBackupLabel: string;
  restoredLabel: string;
  rows: BackupRestoreSnapshotComparisonRow[];
  errors: string[];
  notes: string[];
  message: string;
}

export interface BackupRestoreSnapshotTargetRead {
  errors: string[];
  label: string;
  snapshot: BackupRestoreSnapshot | null;
}

interface CountRow {
  status: string;
  count: number;
}

interface KeyRow {
  key_hex: string;
}

interface SpvHistoryRow {
  key_hex: string;
  value_hex: string;
}

interface AnchorRow {
  ergo_anchor_height: number;
}

type SnapshotValueKey = keyof BackupRestoreSnapshot['stateConsistencyValues'];

const SNAPSHOT_COMPARISON_ROWS: Array<{ check: string; key: SnapshotValueKey }> = [
  { check: 'Peg-out status counts', key: 'pegOutStatusCounts' },
  { check: 'Pending reconciliation rows', key: 'pendingReconciliationRows' },
  { check: 'DUP AVL history count', key: 'dupAvlHistoryCount' },
  { check: 'DUP rebuilt digest', key: 'dupRebuiltDigest' },
  { check: 'SPV tracker history count', key: 'spvTrackerHistoryCount' },
  { check: 'SPV rebuilt digest', key: 'spvRebuiltDigest' },
  { check: 'Persisted anchor heights', key: 'persistedAnchorHeights' },
  { check: 'Pending DUP heartbeats', key: 'pendingDupHeartbeats' },
  { check: 'Runtime artifact hygiene', key: 'runtimeArtifactHygiene' },
];

const BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION = 1;
const BACKUP_RESTORE_COMPARISON_SCHEMA_VERSION = 1;
const blockedSnapshotTargetLabel = '<blocked snapshot target>';
const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const avlDigestPattern = /^(?:0x)?[a-f0-9]{66}$/i;
const blockedSnapshotRuntimeDirectories = new Set(['.runtime-backups', '.devnet-backups']);
const snapshotStateValueFormats: Record<SnapshotValueKey, { pattern: RegExp; message: string }> = {
  pegOutStatusCounts: {
    pattern: /^[A-Za-z][A-Za-z0-9_-]*=\d+(?:\s*,\s*[A-Za-z][A-Za-z0-9_-]*=\d+)*$/,
    message: 'must use status=count pairs',
  },
  pendingReconciliationRows: {
    pattern: /^\d+$/,
    message: 'must be a numeric row count',
  },
  dupAvlHistoryCount: {
    pattern: /^\d+$/,
    message: 'must be a numeric history count',
  },
  dupRebuiltDigest: {
    pattern: avlDigestPattern,
    message: 'must be a 33-byte AVL digest',
  },
  spvTrackerHistoryCount: {
    pattern: /^\d+$/,
    message: 'must be a numeric history count',
  },
  spvRebuiltDigest: {
    pattern: avlDigestPattern,
    message: 'must be a 33-byte AVL digest',
  },
  persistedAnchorHeights: {
    pattern: /^(?:none|\d+(?:\s*,\s*\d+)*)$/i,
    message: 'must be numeric anchor heights or none',
  },
  pendingDupHeartbeats: {
    pattern: /^\d+$/,
    message: 'must be a numeric heartbeat count',
  },
  runtimeArtifactHygiene: {
    pattern: /\b(clean|ignored|not staged|no staged|none)\b/i,
    message: 'must state clean, ignored, none, or not staged artifact hygiene',
  },
};

export function createBackupRestoreSnapshot(dbPath: string): BackupRestoreSnapshot {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    ensureRequiredTables(db);

    const pegOutStatusCounts = formatPegOutStatusCounts(readPegOutStatusCounts(db));
    const pendingReconciliationRows = String(countPendingReconciliationRows(readPegOutStatusCounts(db)));
    const dupKeys = readDupKeys(db);
    const spvHistory = readSpvHistory(db);
    const persistedAnchorHeights = readPersistedAnchorHeights(db);
    const pendingDupHeartbeats = countRows(db, 'pending_dup_heartbeats');
    const stateConsistencyValues = {
      pegOutStatusCounts,
      pendingReconciliationRows,
      dupAvlHistoryCount: String(dupKeys.length),
      dupRebuiltDigest: getDupTreeDigest(dupKeys),
      spvTrackerHistoryCount: String(spvHistory.length),
      spvRebuiltDigest: getSpvTrackerDigest(spvHistory),
      persistedAnchorHeights: persistedAnchorHeights.length === 0 ? 'none' : persistedAnchorHeights.join(','),
      pendingDupHeartbeats: String(pendingDupHeartbeats),
      runtimeArtifactHygiene: 'snapshot read-only; confirm git status clean or backups ignored',
    };

    return {
      schemaVersion: BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      databaseLabel: basename(dbPath),
      mode: 'readonly',
      localOnly: true,
      stateConsistencyValues,
      evidenceRows: [
        row('Peg-out status counts', stateConsistencyValues.pegOutStatusCounts),
        row('Pending reconciliation rows', stateConsistencyValues.pendingReconciliationRows),
        row('DUP AVL history count', stateConsistencyValues.dupAvlHistoryCount),
        row('DUP rebuilt digest', stateConsistencyValues.dupRebuiltDigest),
        row('SPV tracker history count', stateConsistencyValues.spvTrackerHistoryCount),
        row('SPV rebuilt digest', stateConsistencyValues.spvRebuiltDigest),
        row('Persisted anchor heights', stateConsistencyValues.persistedAnchorHeights),
        row('Pending DUP heartbeats', stateConsistencyValues.pendingDupHeartbeats),
        row('Runtime artifact hygiene', stateConsistencyValues.runtimeArtifactHygiene),
      ],
      notes: [
        'Snapshot is local SQLite evidence only; it does not compare rebuilt DUP or SPV tracker digests with current on-chain singleton boxes.',
        'Use the same command before backup and after isolated restore, then copy matching values into the evidence template.',
        'Keep the JSON artifact out of git when it contains environment-specific runtime state.',
      ],
    };
  } finally {
    db.close();
  }
}

export function compareBackupRestoreSnapshots(
  preBackup: BackupRestoreSnapshot,
  restored: BackupRestoreSnapshot,
  labels: { preBackupLabel?: string; restoredLabel?: string } = {},
): BackupRestoreSnapshotComparison {
  const preBackupLabel = labels.preBackupLabel ?? preBackup.databaseLabel;
  const restoredLabel = labels.restoredLabel ?? restored.databaseLabel;
  const rows = SNAPSHOT_COMPARISON_ROWS.map(({ check, key }) => {
    const preBackupValue = preBackup.stateConsistencyValues[key];
    const restoredValue = restored.stateConsistencyValues[key];
    return {
      check,
      preBackupValue,
      restoredValue,
      status: preBackupValue === restoredValue ? 'linked' as const : 'blocker' as const,
      evidenceHint: 'Copy this comparison row into the matching Backup Restore Evidence state row.',
    };
  });
  const errors = [
    ...validateSnapshotComparisonMetadata(preBackup, restored, preBackupLabel, restoredLabel),
    ...rows
      .filter(row => row.status === 'blocker')
      .map(row => `${row.check}: restored value does not match pre-backup value`),
  ];

  return {
    schemaVersion: BACKUP_RESTORE_COMPARISON_SCHEMA_VERSION,
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    comparedAt: new Date().toISOString(),
    snapshotSchemaVersions: {
      preBackup: readSnapshotSchemaVersion(preBackup),
      restored: readSnapshotSchemaVersion(restored),
    },
    preBackupLabel,
    restoredLabel,
    rows,
    errors,
    notes: [
      'Comparison covers local SQLite snapshot values only.',
      'Pre-backup and restored snapshot targets must be distinct artifacts.',
      'The restored snapshot must be generated after the pre-backup snapshot.',
      'DUP and SPV tracker singleton digest comparisons against current on-chain boxes remain separate evidence.',
      'A BLOCKED row must be classified before restarting the daemon or linking Gate 3 evidence.',
    ],
    message: errors.length === 0
      ? `Backup-restore snapshot comparison PASS: ${rows.length} local state rows match.`
      : `Backup-restore snapshot comparison BLOCKED: ${errors.length} comparison issue(s).`,
  };
}

function readSnapshotSchemaVersion(snapshot: BackupRestoreSnapshot): unknown {
  return (snapshot as { schemaVersion?: unknown }).schemaVersion;
}

export function validateBackupRestoreSnapshotTargetPath(target: string): string[] {
  const label = formatBackupRestoreSnapshotTargetLabel(target);
  const normalized = normalizeBackupRestoreSnapshotTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized);
  const isLocalFileUrlPath = isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) && !isLocalAbsolutePath && !isLocalFileUrlPath;
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const hasEnvironmentTargetBinding = hasEvidenceEnvironmentTarget(normalized);
  const hasRuntimeDatabaseTargetBinding = hasEvidenceRuntimeDatabaseTargetBinding(normalized);
  const hasLocalOnlyTargetBinding = hasEvidenceLocalOnlyTarget(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);
  const isRuntimeBackupDirectoryPath = hasBlockedSnapshotRuntimeDirectory(normalized);
  const errors: string[] = [];

  if (extension !== '.json') {
    errors.push(`${label}: snapshot compare only accepts JSON snapshot files`);
  }
  if (isLocalAbsolutePath) {
    errors.push(`${label}: refusing to read local absolute snapshot paths`);
  }
  if (isLocalFileUrlPath) {
    errors.push(`${label}: refusing to read local file URLs as snapshots`);
  }
  if (isUriSchemeTarget) {
    errors.push(`${label}: refusing to read URI snapshot targets`);
  }
  if (escapesBridgeRootPath) {
    errors.push(`${label}: refusing to read snapshot paths outside the bridge repository`);
  }
  if (isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetBinding) {
    errors.push(`${label}: refusing to read environment files as snapshots`);
  }
  if (hasRuntimeDatabaseTargetBinding) {
    errors.push(`${label}: refusing to read secret-bearing or runtime-state paths as snapshots`);
  }
  if (hasLocalOnlyTargetBinding) {
    errors.push(`${label}: refusing to read local-only snapshot target references`);
  }
  if (isRuntimeDatabasePath) {
    errors.push(`${label}: refusing to read runtime database files as snapshots`);
  }
  if (isRuntimeBackupDirectoryPath) {
    errors.push(`${label}: refusing to read runtime backup directories as snapshots`);
  }
  if (hasEvidenceSecretOrRuntimeName(normalized)) {
    errors.push(`${label}: refusing to read secret-bearing or runtime-state paths as snapshots`);
  }

  return errors;
}

export function formatBackupRestoreSnapshotTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = normalizeBackupRestoreSnapshotTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) &&
    !isLocalAbsoluteTarget(normalized) &&
    !isLocalFileUrl(normalized);
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const hasEnvironmentTargetBinding = hasEvidenceEnvironmentTarget(normalized);
  const hasRuntimeDatabaseTargetBinding = hasEvidenceRuntimeDatabaseTargetBinding(normalized);
  const hasLocalOnlyTargetBinding = hasEvidenceLocalOnlyTarget(normalized);
  const isSensitiveName =
    hasEnvironmentTargetBinding ||
    hasRuntimeDatabaseTargetBinding ||
    hasLocalOnlyTargetBinding ||
    isEvidenceEnvironmentFileName(name) ||
    hasEvidenceSecretOrRuntimeName(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);
  const isRuntimeBackupDirectoryPath = hasBlockedSnapshotRuntimeDirectory(normalized);

  if (isSensitiveName) return blockedSnapshotTargetLabel;
  if (isRuntimeBackupDirectoryPath) return blockedSnapshotTargetLabel;
  if (isUriSchemeTarget) return blockedSnapshotTargetLabel;
  if (escapesBridgeRootPath) return blockedSnapshotTargetLabel;
  if (isLocalAbsolutePath) return blockedSnapshotTargetLabel;
  if (isRuntimeDatabasePath) return name;
  return trimmedTarget;
}

function normalizeBackupRestoreSnapshotTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function hasEvidenceEnvironmentTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate => {
    const name = basename(candidate);
    return isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetSegment(candidate);
  });
}

function hasEvidenceRuntimeDatabaseTargetBinding(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(hasRuntimeDatabaseTargetSegment);
}

function hasEvidenceRuntimeDatabasePathTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isEvidenceRuntimeDatabaseTarget);
}

function hasEvidenceLocalOnlyTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    hasEvidenceLocalOnlyInspectionReference(candidate),
  );
}

function hasEvidenceSecretOrRuntimeName(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    isEvidenceSecretOrRuntimeName(candidate, { includeDeployedState: true }),
  );
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

export function readBackupRestoreSnapshotTarget(target: string): BackupRestoreSnapshotTargetRead {
  const trimmedTarget = target.trim();
  const label = formatBackupRestoreSnapshotTargetLabel(target);
  const errors = validateBackupRestoreSnapshotTargetPath(target);
  if (errors.length > 0) return { errors, label, snapshot: null };

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const snapshotPath = realpathSync(resolve(process.cwd(), trimmedTarget));
    if (!isInsidePath(snapshotPath, bridgeRoot)) {
      const resolvedLabel = formatResolvedBackupRestoreSnapshotTargetLabel(target);
      return {
        errors: [`${resolvedLabel}: refusing to read snapshot paths outside the bridge repository`],
        label: resolvedLabel,
        snapshot: null,
      };
    }

    const parsed = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const shapeErrors = validateSnapshotShape(parsed, label);
    if (shapeErrors.length > 0) return { errors: shapeErrors, label, snapshot: null };

    return { errors: [], label, snapshot: parsed as BackupRestoreSnapshot };
  } catch {
    const resolvedLabel = formatResolvedBackupRestoreSnapshotTargetLabel(target);
    return { errors: [`${resolvedLabel}: snapshot file could not be read`], label: resolvedLabel, snapshot: null };
  }
}

function formatResolvedBackupRestoreSnapshotTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  const label = formatBackupRestoreSnapshotTargetLabel(target);
  if (label === blockedSnapshotTargetLabel) {
    return label;
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const resolvedTarget = resolve(process.cwd(), trimmedTarget);
    if (!isInsidePath(resolvedTarget, bridgeRoot)) {
      return blockedSnapshotTargetLabel;
    }
    const snapshotPath = realpathSync(resolvedTarget);
    return isInsidePath(snapshotPath, bridgeRoot) ? label : blockedSnapshotTargetLabel;
  } catch {
    try {
      const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
      const resolvedTarget = resolve(process.cwd(), trimmedTarget);
      if (!isInsidePath(resolvedTarget, bridgeRoot)) {
        return blockedSnapshotTargetLabel;
      }
      const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
      return isInsidePath(nearestExistingAncestor, bridgeRoot) ? label : blockedSnapshotTargetLabel;
    } catch {
      return label;
    }
  }
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = target;
  while (true) {
    try {
      return realpathSync(cursor);
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new Error(`No existing ancestor for ${target}`);
      }
      cursor = parent;
    }
  }
}

function ensureRequiredTables(db: Database.Database): void {
  const existing = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => (row as { name: string }).name),
  );
  const missing = REQUIRED_TABLES.filter(table => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`SQLite state is missing required table(s): ${missing.join(', ')}`);
  }
}

function readPegOutStatusCounts(db: Database.Database): Map<PegOutStatus, number> {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM peg_out_events
    GROUP BY status
  `).all() as CountRow[];
  const counts = new Map<PegOutStatus, number>();
  for (const status of PEG_OUT_STATUSES) counts.set(status, 0);
  for (const row of rows) {
    if (PEG_OUT_STATUSES.includes(row.status as PegOutStatus)) {
      counts.set(row.status as PegOutStatus, row.count);
    }
  }
  return counts;
}

function formatPegOutStatusCounts(counts: Map<PegOutStatus, number>): string {
  return PEG_OUT_STATUSES.map(status => `${status}=${counts.get(status) ?? 0}`).join(',');
}

function countPendingReconciliationRows(counts: Map<PegOutStatus, number>): number {
  let total = 0;
  for (const [status, count] of counts) {
    if (PENDING_RECONCILIATION_STATUSES.has(status)) total += count;
  }
  return total;
}

function readDupKeys(db: Database.Database): string[] {
  return (db.prepare(`
    SELECT key_hex
    FROM avl_tree_history
    ORDER BY id ASC
  `).all() as KeyRow[]).map(row => row.key_hex);
}

function readSpvHistory(db: Database.Database): SpvTrackerHistoryEntry[] {
  return (db.prepare(`
    SELECT key_hex, value_hex
    FROM spv_tracker_history
    ORDER BY id ASC
  `).all() as SpvHistoryRow[]).map(row => ({
    key: row.key_hex,
    value: row.value_hex,
  }));
}

function readPersistedAnchorHeights(db: Database.Database): number[] {
  return (db.prepare(`
    SELECT DISTINCT ergo_anchor_height
    FROM peg_out_events
    WHERE ergo_anchor_height IS NOT NULL
    ORDER BY ergo_anchor_height ASC
  `).all() as AnchorRow[]).map(row => row.ergo_anchor_height);
}

function countRows(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number };
  return row.count;
}

function row(check: string, value: string): { check: string; value: string; evidenceHint: string } {
  return {
    check,
    value,
    evidenceHint: 'Link this npm run backup:snapshot JSON artifact in the matching evidence row.',
  };
}

function validateSnapshotShape(value: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') {
    return [`${label}: snapshot JSON must be an object`];
  }

  const snapshot = value as Partial<BackupRestoreSnapshot>;
  if (typeof snapshot.generatedAt !== 'string' || parseSnapshotGeneratedAt(snapshot.generatedAt) === null) {
    errors.push(`${label}: snapshot generatedAt must be an ISO instant`);
  }
  if (typeof snapshot.databaseLabel !== 'string' || snapshot.databaseLabel.trim().length === 0) {
    errors.push(`${label}: snapshot databaseLabel must be a non-empty string`);
  }
  if (snapshot.schemaVersion !== BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`${label}: snapshot schemaVersion must be ${BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (snapshot.mode !== 'readonly') errors.push(`${label}: snapshot mode must be readonly`);
  if (snapshot.localOnly !== true) errors.push(`${label}: snapshot localOnly must be true`);
  if (!Array.isArray(snapshot.evidenceRows)) errors.push(`${label}: snapshot evidenceRows must be an array`);
  if (!Array.isArray(snapshot.notes)) errors.push(`${label}: snapshot notes must be an array`);
  if (!snapshot.stateConsistencyValues || typeof snapshot.stateConsistencyValues !== 'object') {
    errors.push(`${label}: snapshot stateConsistencyValues is required`);
    return errors;
  }

  for (const { key } of SNAPSHOT_COMPARISON_ROWS) {
    const stateValue = snapshot.stateConsistencyValues[key];
    if (typeof stateValue !== 'string') {
      errors.push(`${label}: snapshot stateConsistencyValues.${key} must be a string`);
      continue;
    }
    const format = snapshotStateValueFormats[key];
    if (!format.pattern.test(stateValue.trim())) {
      errors.push(`${label}: snapshot stateConsistencyValues.${key} ${format.message}`);
    }
  }

  if (Array.isArray(snapshot.evidenceRows)) {
    errors.push(...validateSnapshotEvidenceRows(snapshot, label));
  }

  return errors;
}

function validateSnapshotEvidenceRows(snapshot: Partial<BackupRestoreSnapshot>, label: string): string[] {
  const errors: string[] = [];
  const evidenceRows = snapshot.evidenceRows ?? [];
  const stateValues = snapshot.stateConsistencyValues as BackupRestoreSnapshot['stateConsistencyValues'];
  const byCheck = new Map<string, unknown>();

  for (const row of evidenceRows) {
    if (!row || typeof row !== 'object') {
      errors.push(`${label}: snapshot evidenceRows entries must be objects`);
      continue;
    }
    const candidate = row as Partial<BackupRestoreSnapshot['evidenceRows'][number]>;
    if (typeof candidate.check !== 'string' || candidate.check.trim().length === 0) {
      errors.push(`${label}: snapshot evidenceRows entries must include a non-empty check`);
      continue;
    }
    if (byCheck.has(candidate.check)) {
      errors.push(`${label}: snapshot evidenceRows.${candidate.check}: duplicate check`);
    }
    byCheck.set(candidate.check, candidate);
  }

  for (const { check, key } of SNAPSHOT_COMPARISON_ROWS) {
    const row = byCheck.get(check);
    if (!row) {
      errors.push(`${label}: snapshot evidenceRows is missing required check ${check}`);
      continue;
    }

    const candidate = row as Partial<BackupRestoreSnapshot['evidenceRows'][number]>;
    if (typeof candidate.value !== 'string') {
      errors.push(`${label}: snapshot evidenceRows.${check} value must be a string`);
    } else if (candidate.value !== stateValues[key]) {
      errors.push(`${label}: snapshot evidenceRows.${check} value must match stateConsistencyValues.${key}`);
    }
    if (typeof candidate.evidenceHint !== 'string' || candidate.evidenceHint.trim().length === 0) {
      errors.push(`${label}: snapshot evidenceRows.${check} evidenceHint must be a non-empty string`);
    }
  }

  return errors;
}

function validateSnapshotComparisonMetadata(
  preBackup: BackupRestoreSnapshot,
  restored: BackupRestoreSnapshot,
  preBackupLabel: string,
  restoredLabel: string,
): string[] {
  const errors: string[] = [];
  if (preBackupLabel.trim() === restoredLabel.trim()) {
    errors.push('Snapshot targets: pre-backup and restored snapshot targets must be distinct');
  }
  if (preBackup.schemaVersion !== BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`Snapshot schema: pre-backup snapshot schemaVersion must be ${BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (restored.schemaVersion !== BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`Snapshot schema: restored snapshot schemaVersion must be ${BACKUP_RESTORE_SNAPSHOT_SCHEMA_VERSION}`);
  }

  const preBackupGeneratedAt = parseSnapshotGeneratedAt(preBackup.generatedAt);
  const restoredGeneratedAt = parseSnapshotGeneratedAt(restored.generatedAt);
  if (preBackupGeneratedAt === null) {
    errors.push('Snapshot timestamps: pre-backup generatedAt must be an ISO instant');
  }
  if (restoredGeneratedAt === null) {
    errors.push('Snapshot timestamps: restored generatedAt must be an ISO instant');
  }
  if (
    preBackupGeneratedAt !== null &&
    restoredGeneratedAt !== null &&
    restoredGeneratedAt <= preBackupGeneratedAt
  ) {
    errors.push('Snapshot timestamps: restored snapshot must be generated after pre-backup snapshot');
  }

  return errors;
}

function parseSnapshotGeneratedAt(value: string): number | null {
  if (!isoInstantPattern.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function isLocalFileUrl(normalized: string): boolean {
  return /^file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function hasBlockedSnapshotRuntimeDirectory(normalized: string): boolean {
  return normalized.split('/').some(part => blockedSnapshotRuntimeDirectories.has(part));
}

function escapesBridgeRoot(normalized: string): boolean {
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized) || hasUriSchemeTarget(normalized)) {
    return false;
  }

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    if (part === '..') {
      depthFromRelayer -= 1;
    } else {
      depthFromRelayer += 1;
    }

    if (depthFromRelayer < -1) {
      return true;
    }
  }

  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
