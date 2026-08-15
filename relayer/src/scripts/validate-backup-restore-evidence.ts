import { validateBackupRestoreEvidence } from '../backup-restore-evidence.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run backup:validate -- <completed-backup-restore-evidence.md> [...]',
  'This command validates completed Backup Restore Evidence Markdown for Gate 3 SQLite/AVL backup-restore evidence.',
  'Boundary: checked Gate 3 backup-restore evidence still requires release:gate -- --backup-restore-evidence <completed-backup-restore-evidence.md> against the same completed artifact.',
  'A standalone PASS does not close the release gate or authorize release/publication claims.',
  'Release-gate use requires a backup-restore validation target, command-specific completed backup-restore command output evidence, and Release gate structural issues = 0.',
  'Required backup-restore markers: Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; Release notes updated: yes; Pending Evidence Register updated: yes.',
  'This command is evidence validation only; it does not sign, submit, publish, push, broadcast, or open runtime databases.',
];

if (targets.includes('--help') || targets.includes('-h')) {
  console.log(usage.join('\n'));
  process.exit(0);
}

if (targets.length === 0) {
  console.error(usage.join('\n'));
  process.exit(1);
}

let blocked = false;

for (const target of targets) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    console.log(`${label}: evidence target BLOCKED: ${errors.length} structural issue(s).`);
    for (const error of errors) console.log(`- ${error}`);
    blocked = true;
    continue;
  }
  const result = validateBackupRestoreEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
