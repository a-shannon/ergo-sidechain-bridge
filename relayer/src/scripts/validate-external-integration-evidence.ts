import { validateExternalIntegrationEvidence } from '../external-integration-evidence.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run integration:validate -- <completed-external-integration-review.md> [...]',
  'This command validates completed External Integration Review Markdown for Gate 8 fresh-review, clean-checkout, negative-review, and public integration-readiness evidence.',
  'Boundary: checked Gate 8 evidence still requires release:gate -- --integration-evidence <completed-external-integration-review.md> against the same completed artifact.',
  'Release-gate use requires an integration validation target, command-specific integration command output evidence, and Release gate structural issues = 0.',
  'A standalone PASS does not authorize public claims, production-ready wording, mainnet deployment wording, private-maintainer-context claims, or broadcast enablement.',
  'Public institutional-reference or testnet production-candidate wording requires release:gate PASS with all required evidence rows, Structural issues = 0, and bounded integration claims.',
  'Required Gate 8 markers: Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews; Private maintainer context used = no; Release notes updated = yes.',
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
  const result = validateExternalIntegrationEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
