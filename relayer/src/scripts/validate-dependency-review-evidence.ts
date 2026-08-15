import { validateDependencyReviewEvidence } from '../dependency-review-evidence.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run dependency:validate -- <completed-dependency-review-evidence.md> [...]',
  'This command validates completed Dependency Review Evidence Markdown for Gate 4 signer and dependency review evidence.',
  'Boundary: checked Gate 4 evidence still requires release:gate -- --dependency-review-evidence <completed-dependency-review-evidence.md> against the same completed artifact.',
  'Release-gate use requires a dependency review validation target, command-specific completed dependency command output evidence, and Release gate structural issues = 0.',
  'A standalone PASS is not release authorization; fail-closed signer handling remains the default when upstream signer release validation is absent.',
  'Production-ready and testnet production-candidate claims remain blocked until upstream signer release is validated with JVM/node conformance evidence, Critical/high vulnerabilities open = 0, and Upstream signer blocker resolved = yes.',
  'This command is evidence validation only; it does not install, upgrade, sign, submit, publish, push, broadcast, or open runtime databases.',
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
  const result = validateDependencyReviewEvidence(markdown);

  console.log(`${label}: ${result.message}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
