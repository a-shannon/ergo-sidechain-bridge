import { createBackupRestoreSnapshot } from '../backup-restore-snapshot.js';

const dbPath = process.argv[2] ?? './bridge-state.sqlite';

try {
  const snapshot = createBackupRestoreSnapshot(dbPath);
  console.log(JSON.stringify(snapshot, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
