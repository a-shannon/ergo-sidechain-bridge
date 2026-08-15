import { validateTrustlessCandidateEvidenceJsonTarget } from '../aggregate-settlement-candidate-evidence-json.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run trustless:candidate:validate -- <trustless-candidate-evidence.json> [...]',
  'This command validates candidate-only trustless settlement evidence JSON; it does not sign, check, approve, submit, reconcile, broadcast, mutate runtime databases, or authorize claims.',
  'Boundary: validation PASS is not Gate 5 closure, not pre-broadcast evidence, not settlement readiness, and not claim authorization.',
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
  const result = validateTrustlessCandidateEvidenceJsonTarget(target);
  console.log(`${result.label}: ${result.message}`);
  for (const error of result.errors) console.log(`- ${error}`);
  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
