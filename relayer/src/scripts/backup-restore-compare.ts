import {
  compareBackupRestoreSnapshots,
  readBackupRestoreSnapshotTarget,
} from '../backup-restore-snapshot.js';

const [preBackupTarget, restoredTarget] = process.argv.slice(2);

if (!preBackupTarget || !restoredTarget) {
  console.error('Usage: npm run backup:compare -- <pre-backup-snapshot.json> <restored-snapshot.json>');
  process.exit(1);
}

const preBackup = readBackupRestoreSnapshotTarget(preBackupTarget);
const restored = readBackupRestoreSnapshotTarget(restoredTarget);
let blocked = false;

for (const target of [preBackup, restored]) {
  if (target.errors.length > 0) {
    console.log(`${target.label}: snapshot target BLOCKED: ${target.errors.length} structural issue(s).`);
    for (const error of target.errors) console.log(`- ${error}`);
    blocked = true;
  }
}

if (!blocked && preBackup.snapshot && restored.snapshot) {
  const comparison = compareBackupRestoreSnapshots(preBackup.snapshot, restored.snapshot, {
    preBackupLabel: preBackup.label,
    restoredLabel: restored.label,
  });
  console.log(JSON.stringify(comparison, null, 2));
  blocked = comparison.status === 'BLOCKED';
}

if (blocked) {
  process.exitCode = 1;
}
