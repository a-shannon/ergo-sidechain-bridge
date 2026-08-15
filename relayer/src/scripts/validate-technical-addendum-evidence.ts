import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { validateTechnicalAddendumEvidence } from '../technical-addendum-evidence.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run addendum:validate -- <completed-technical-addendum-evidence.md> [...]',
  'This command validates completed Technical Addendum Evidence Markdown for Gate 2 architecture-manual and testnet claim-boundary evidence.',
  'Boundary: checked Gate 2 evidence still requires release:gate -- --technical-addendum-evidence <completed-technical-addendum-evidence.md> against the same completed artifact.',
  'Release-gate use requires a technical addendum validation target, completed artifact evidence, and concrete release:gate PASS output with Structural issues = 0.',
  'A standalone PASS does not authorize public claims, production-ready wording, mainnet deployment wording, or unscoped broadcast enablement.',
  'Testnet production-candidate wording requires release:gate PASS with all required evidence rows, Structural issues = 0, and bounded signer/broadcast claims.',
  'Required Gate 2 markers: Manual use status = candidate claim support; Release supported = production deployment candidate; Release gate status = pass; Production-ready claim allowed = no; Mainnet deployment claim allowed = no; Testnet production-candidate claim allowed = yes-after-release-gate-pass; Release notes updated = yes.',
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

  const result = validateTechnicalAddendumEvidence(markdown);
  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
