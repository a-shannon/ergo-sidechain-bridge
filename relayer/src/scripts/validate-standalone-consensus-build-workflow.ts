import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectStandaloneConsensusBuildWorkflow } from '../standalone-consensus-build-workflow.js';

function main(): void {
  if (process.argv.length > 2) throw new Error('standalone consensus workflow validation accepts no arguments');
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = path.resolve(scriptDirectory, '..', '..', '..');
  const report = inspectStandaloneConsensusBuildWorkflow({ bridgeRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'standalone consensus workflow validation failed');
  process.exitCode = 1;
}
