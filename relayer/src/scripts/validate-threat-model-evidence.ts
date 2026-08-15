import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { validateThreatModelEvidence } from '../threat-model-evidence.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run threat-model:validate -- <security-evidence-matrix.md> [...]',
  'This command validates completed Threat model and evidence matrix Markdown for release-gate evidence.',
  'Boundary: checked threat-model evidence still requires release:gate -- --threat-model-evidence <security-evidence-matrix.md> against the same completed artifact.',
  'A standalone PASS does not close the release gate or authorize release/publication claims.',
  'Release-decision use requires Matrix Classification fields, a validated target binding, and command-specific completed threat-model command output evidence.',
  'Required threat-model markers: npm run threat-model:validate; validated target; command-specific completed threat-model command output evidence; Matrix Classification; Release gate structural issues = 0; Production-ready claim allowed = no.',
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
    console.log(`${label}: threat-model evidence target BLOCKED: ${errors.length} structural issue(s).`);
    for (const error of errors) console.log(`- ${error}`);
    blocked = true;
    continue;
  }

  const result = validateThreatModelEvidence(markdown);
  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
