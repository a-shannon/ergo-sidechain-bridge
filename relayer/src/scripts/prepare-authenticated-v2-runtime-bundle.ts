import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareAuthenticatedV2RuntimeBundle } from '../authenticated-v2-runtime-bundle.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const relayerRoot = resolve(scriptDirectory, '..', '..');
const bridgeRoot = resolve(relayerRoot, '..');

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('authenticated V2 runtime bundle preparation accepts no arguments');
  }
  const result = await prepareAuthenticatedV2RuntimeBundle(bridgeRoot);
  console.log(JSON.stringify({
    status: 'PASS',
    ...result,
    signingPerformed: false,
    submissionPerformed: false,
    broadcastPerformed: false,
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'runtime bundle preparation failed');
    process.exitCode = 1;
  });
}
