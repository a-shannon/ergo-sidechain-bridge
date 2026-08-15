import { validateCleanCheckoutEvidence } from '../clean-checkout-evidence.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run ci:validate -- <completed-clean-checkout-evidence.md> [...]',
  'This command validates completed Clean Checkout Evidence Markdown for Gate 1 final-branch reproducibility evidence.',
  'Boundary: checked Gate 1 evidence still requires release:gate -- --clean-checkout-evidence <completed-clean-checkout-evidence.md> against the same completed artifact.',
  'Release-gate use requires a clean checkout validation target, command-specific completed clean-checkout output evidence, completed Gate 1 release-note update evidence, completed Gate 1 checklist update evidence, and Release gate structural issues = 0.',
  'A standalone PASS does not close the release gate or authorize release/publication claims.',
  'Production-ready claims remain blocked; testnet production-candidate wording requires release:gate PASS and all required evidence rows.',
  'Required Gate 1 markers: Clean checkout CI green = yes; Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Release gate structural issues = 0; Release notes updated = yes.',
  'This command is evidence validation only; it does not install dependencies, sign, submit, publish, push, broadcast, or open runtime databases.',
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
  const result = validateCleanCheckoutEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
