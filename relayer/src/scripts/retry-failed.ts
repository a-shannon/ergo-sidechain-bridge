/**
 * Retry failed peg-ins by returning them to the detected queue.
 *
 * Failed peg-outs are intentionally excluded. Their legacy status does not
 * prove whether settlement transport started, so they require external
 * reconstruction before any lifecycle change.
 *
 * Usage:
 *   npx tsx src/scripts/retry-failed.ts
 *   npx tsx src/scripts/retry-failed.ts --peg-in
 */

import Database from 'better-sqlite3';

const mode = process.argv[2];

if (mode === '--peg-out') {
  throw new Error(
    'Failed peg-outs are legacy-unclassified liabilities and cannot be reset without external settlement reconstruction',
  );
}
if (mode !== undefined && mode !== '--peg-in') {
  throw new Error(`Unsupported retry mode ${mode}`);
}

const db = new Database('./bridge-state.sqlite');
const result = db.prepare(
  "UPDATE peg_in_events SET status = 'detected', updated_at = datetime('now') WHERE status = 'failed'",
).run();

console.log(`Reset ${result.changes} failed peg-in event(s) to 'detected'`);
db.close();
console.log('Done. The daemon will reprocess the peg-in queue on its next cycle.');
