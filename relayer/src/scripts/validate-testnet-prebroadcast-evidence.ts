import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { readLinkedAggregateSettlementEvidenceJsonRecords } from '../testnet-prebroadcast-linked-json.js';
import {
  validateTestnetPreBroadcastEvidence,
} from '../testnet-prebroadcast-evidence.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run prebroadcast:validate -- <completed-testnet-prebroadcast-evidence.md> [...]',
  'This command validates completed Testnet Pre-Broadcast Evidence Markdown for Gate 3 dry-run preparation packages.',
  'Release-gate use requires a prebroadcast validation target, command-specific completed prebroadcast command output evidence, and Release gate structural issues = 0.',
  'Boundary: a standalone PASS does not close Gate 3, authorize live broadcast, or support release/publication claim escalation.',
  'Required scope markers: Gate 3 closure claimed: no; Testnet production-candidate claim allowed: no; Mainnet production-ready claim allowed: no.',
  'Required no-broadcast markers: BRIDGE_BROADCAST_ENABLED state at start/end must be false or unset, and broadcast policy must prove disabled or refused.',
  'Required publication markers: Production-ready claim allowed by this package: no; Testnet production-candidate claim allowed by this package: no.',
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

  const result = validateTestnetPreBroadcastEvidence(markdown, {
    linkedAggregateSettlementEvidenceJsonRecords: readLinkedAggregateSettlementEvidenceJsonRecords(
      target,
      markdown,
    ),
  });
  console.log(`${label}: ${result.message}`);
  for (const error of result.errors) console.log(`- ${error}`);
  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
