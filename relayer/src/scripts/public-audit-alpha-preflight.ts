import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectPublicAuditAlphaPreflight } from '../public-audit-alpha.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(scriptDirectory, '..', '..', '..');

function main(): void {
  if (process.argv.length > 2) {
    throw new Error('public audit alpha preflight accepts no arguments');
  }
  const report = inspectPublicAuditAlphaPreflight({ bridgeRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'public audit alpha preflight failed');
    process.exitCode = 1;
  }
}
