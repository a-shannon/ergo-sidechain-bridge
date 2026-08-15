import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { validateGoNoGoJsonReport } from '../patched-devnet-go-no-go.js';

const targets = process.argv.slice(2);
const usage = [
  'Usage: npm run demo:patched-devnet:go-no-go:validate -- <go-no-go-report.json> [...]',
  'This command validates safe patched-devnet go/no-go prerequisite JSON reports.',
  'Required report boundary: schemaVersion=2, secretEnvInspection=disabled, nodeConfigInspection=disabled, runtimeStateInspection=skipped, no .env loading, no signing, no broadcast, no DB writes, and no deployment.',
  'Boundary: validation PASS is not Gate 3 closure, not live execution approval, not broadcast authorization, and not a release claim.',
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
  const { errors, label, json } = readEvidenceJsonTarget(target, '--go-no-go-json');
  if (errors.length > 0) {
    console.log(`${label}: BLOCKED go/no-go prerequisite report`);
    for (const error of errors) console.log(`- ${error}`);
    blocked = true;
    continue;
  }

  const result = validateGoNoGoJsonReport(json);
  console.log(`${label}: ${result.message}`);
  for (const error of result.errors) console.log(`- ${error}`);
  if (result.status === 'BLOCKED') blocked = true;
}

if (blocked) {
  process.exitCode = 1;
}
