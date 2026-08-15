/**
 * Pure helpers for devnet session safety reporting.
 *
 * Extracted so they can be unit-tested without triggering process.exit()
 * or filesystem/git side effects.
 */

export interface FileStatus {
  label: string;
  exists: boolean;
  dirty: boolean;
  size: number | null;
}

/**
 * Format the safety report as plain ASCII.
 * Pure function - no I/O, no process.exit().
 *
 * @param statuses   Runtime file inspection results
 * @param bridgeRoot Absolute path to bridge root (for operator instructions)
 * @param timestamp  Optional fixed timestamp for deterministic output in tests
 */
export function formatSafetyReport(
  statuses: FileStatus[],
  bridgeRoot: string,
  timestamp?: string,
): string {
  const lines: string[] = [];
  const SEP = '='.repeat(70);
  const THIN = '-'.repeat(70);
  const ts = timestamp ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const BACKUP_DIR = '.devnet-backups';

  lines.push(SEP);
  lines.push('  Devnet Session Safety Check');
  lines.push(SEP);
  lines.push('');
  lines.push('  Runtime files that will change during a patched devnet run:');
  lines.push('  Neither should be staged/committed after a devnet session.');
  lines.push('');

  for (const s of statuses) {
    const existStr = s.exists ? `exists (${s.size} bytes)` : 'does not exist';
    const dirtyStr = s.dirty ? ' [DIRTY - uncommitted changes]' : ' [clean]';
    lines.push(`  ${s.label}: ${existStr}${dirtyStr}`);
  }

  // -- Backup commands --
  lines.push('');
  lines.push(THIN);
  lines.push('  Suggested backup commands (run BEFORE devnet session):');
  lines.push(THIN);
  lines.push(`  # Run from bridge root: ${bridgeRoot}`);
  lines.push(`  New-Item -ItemType Directory -Force "${BACKUP_DIR}" | Out-Null`);

  for (const s of statuses) {
    if (s.exists) {
      const bakName = backupName(s.label, ts);
      lines.push(`  Copy-Item -LiteralPath "${s.label}" -Destination "${BACKUP_DIR}\\${bakName}"`);
    } else {
      lines.push(`  # ${s.label}: does not exist yet, no backup needed`);
    }
  }

  // -- Restore commands --
  lines.push('');
  lines.push(THIN);
  lines.push('  Restore commands (run AFTER devnet session):');
  lines.push(THIN);
  lines.push(`  # Run from bridge root: ${bridgeRoot}`);

  for (const s of statuses) {
    if (s.exists) {
      const bakName = backupName(s.label, ts);
      lines.push(`  Copy-Item -LiteralPath "${BACKUP_DIR}\\${bakName}" -Destination "${s.label}" -Force`);
    } else {
      lines.push(`  # ${s.label}: delete if created during run, or leave for next session`);
    }
  }

  // -- Post-session verification --
  lines.push('');
  lines.push(THIN);
  lines.push('  Post-session verification:');
  lines.push(THIN);
  lines.push('  git status --short -- contracts/deployed_state.json relayer/bridge-state.sqlite');
  lines.push('');
  lines.push('  # Only if intentionally discarding devnet changes and no backup is needed:');
  lines.push('  # git restore contracts/deployed_state.json');
  lines.push('');

  // Final verdict
  const anyDirty = statuses.some(s => s.dirty);
  if (anyDirty) {
    lines.push('  WARN: Some runtime files already have uncommitted changes.');
    lines.push('  Back them up before starting a devnet session to avoid losing testnet state.');
  } else {
    lines.push('  OK: Runtime files are clean. Safe to start a devnet session.');
  }

  lines.push('');
  return lines.join('\n');
}

/** Derive a backup filename from a bridge-root-relative label. */
function backupName(label: string, ts: string): string {
  // contracts/deployed_state.json -> deployed_state.2026-05-09T16-00-00.json.bak
  const parts = label.split('/');
  const filename = parts[parts.length - 1];
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx > 0) {
    const base = filename.slice(0, dotIdx);
    const ext = filename.slice(dotIdx);
    return `${base}.${ts}${ext}.bak`;
  }
  return `${filename}.${ts}.bak`;
}
