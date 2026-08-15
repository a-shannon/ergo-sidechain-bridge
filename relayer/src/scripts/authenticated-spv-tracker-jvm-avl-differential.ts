import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX,
  AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_SCHEMA,
  buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus,
  compareAuthenticatedSpvTrackerJvmAvlDifferential,
} from '../authenticated-spv-tracker-jvm-avl-differential.js';
import {
  runAuthenticatedSpvTrackerJvmAvlConformance,
} from '../authenticated-v2-source-tree-conformance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--json') || args.filter(arg => arg === '--json').length > 1) {
    throw new Error('Usage: authenticated-spv-tracker-jvm-avl-differential [--json]');
  }
  const corpus = buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus({ bridgeRoot: BRIDGE_ROOT });
  const report = await runAuthenticatedSpvTrackerJvmAvlConformance({
    bridgeRoot: BRIDGE_ROOT,
    fixture: corpus.fixture,
  });
  const rows = compareAuthenticatedSpvTrackerJvmAvlDifferential(corpus, report);
  const reviewedDifferences = rows.filter(row => row.jvm !== row.wasm);
  const machineResult = {
    schema: AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_SCHEMA,
    rows,
    wasmIdentity: {
      lockSha256Hex: corpus.wasmIdentity.lockSha256Hex,
      wasmGlueSha256Hex: corpus.wasmIdentity.wasmGlueSha256Hex,
      wasmArtifactSha256Hex: corpus.wasmIdentity.wasmArtifactSha256Hex,
    },
    jvmIdentity: {
      verifierArtifactSha256Hex: report.verifierArtifactSha256Hex,
      runtimeClasspathSha256Hex: report.runtimeClasspathSha256Hex,
    },
    reviewedDifferences: reviewedDifferences.map(row => row.caseId),
    boundaries: corpus.fixture.boundaries,
  };
  if (args.includes('--json')) {
    process.stdout.write(
      `${AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX}${JSON.stringify(machineResult)}\n`,
    );
    return;
  }
  console.log(`Observed JVM outcome classes: ${report.cases.map(
    entry => `${entry.caseId}=${entry.outcome}`,
  ).join(', ')}`);
  for (const row of rows) {
    console.log(
      `${row.caseId}\twasm=${row.wasm}\tjvm=${row.jvm}`
      + `\tjvm-outcome=${row.jvmOutcome}\texpected-jvm=${row.expectedJvm}`
      + `\texact-digest-parity=${row.exactAcceptedDigestParity ?? 'not-applicable'}`,
    );
  }
  console.log('Authenticated SPV tracker JVM AVL differential: PASS');
  console.log(`Cases: ${rows.length}`);
  console.log(`WASM source/runtime lock SHA-256: ${corpus.wasmIdentity.lockSha256Hex}`);
  console.log(`WASM JS glue SHA-256: ${corpus.wasmIdentity.wasmGlueSha256Hex}`);
  console.log(`WASM artifact SHA-256: ${corpus.wasmIdentity.wasmArtifactSha256Hex}`);
  console.log(`JVM verifier artifact SHA-256: ${report.verifierArtifactSha256Hex}`);
  console.log(`JVM runtime classpath SHA-256: ${report.runtimeClasspathSha256Hex}`);
  console.log(`Reviewed WASM/JVM differences: ${reviewedDifferences.map(row => row.caseId).join(', ') || 'none'}`);
  console.log('Node stateful acceptance: not performed');
  console.log('Signing/submission/broadcast: not performed');
  console.log('Gate 5: open');
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
