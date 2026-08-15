import { validateOperatorReadinessEvidence } from '../operator-readiness-evidence.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run operator:validate -- <completed-operator-readiness-evidence.md> [...]',
  'This command validates completed Operator Readiness Evidence Markdown for Gate 6 runbook, recovery, stop-condition, and operator-ready claim evidence.',
  'Boundary: checked Gate 6 evidence still requires release:gate -- --operator-readiness-evidence <completed-operator-readiness-evidence.md> against the same completed artifact.',
  'Release-gate use requires an operator readiness validation target, command-specific operator command evidence, and Release gate structural issues = 0.',
  'A standalone PASS does not authorize public claims, production-ready wording, mainnet deployment wording, or broadcast enablement.',
  'Operator-ready or testnet production-candidate wording requires release:gate PASS with all required evidence rows, Structural issues = 0, and bounded operational claims.',
  'Required operator markers: Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0; Release notes updated = yes.',
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
  const result = validateOperatorReadinessEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
