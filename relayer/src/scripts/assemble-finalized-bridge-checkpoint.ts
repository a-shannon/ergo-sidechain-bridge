import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  assembleFinalizedBridgeCheckpointCandidate,
  createObservationBundleProvider,
  type FinalizedBridgeCheckpointObservationBundle,
} from '../finalized-bridge-checkpoint.js';

interface FinalizedCheckpointVector {
  schema: string;
  claimBoundary: {
    syntheticObservation: boolean;
    grandpaJustificationVerified: boolean;
    authoritySetAuthenticated: boolean;
    runtimeStateProofVerified: boolean;
    sidechainFinalityVerified: boolean;
    ergoAnchorAuthenticated: boolean;
    onChainAcceptanceProven: boolean;
    gate5Closed: boolean;
  };
  input: {
    targetNativeBlockHashHex: string;
    grandpaJustificationScaleHex: string;
  };
  observation: FinalizedBridgeCheckpointObservationBundle;
  expected: {
    finalityAuthoritySetHashHex: string;
    finalityProofHashHex: string;
    encodedCheckpointHex: string;
    checkpointCommitmentHex: string;
    extensionKeyHex: string;
    extensionValueHex: string;
  };
}

if (process.argv.slice(2).length > 0) {
  throw new Error('this command accepts no runtime or endpoint arguments');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorPath = resolve(__dirname, '../../test-vectors/finalized-bridge-checkpoint-v1.json');
const vector = JSON.parse(readFileSync(vectorPath, 'utf8')) as FinalizedCheckpointVector;

if (vector.schema !== 'e2s.finalized-bridge-checkpoint-candidate.vector.v1') {
  throw new Error('unexpected finalized bridge checkpoint vector schema');
}
if (
  vector.claimBoundary?.syntheticObservation !== true ||
  vector.claimBoundary?.grandpaJustificationVerified !== false ||
  vector.claimBoundary?.authoritySetAuthenticated !== false ||
  vector.claimBoundary?.runtimeStateProofVerified !== false ||
  vector.claimBoundary?.sidechainFinalityVerified !== false ||
  vector.claimBoundary?.ergoAnchorAuthenticated !== false ||
  vector.claimBoundary?.onChainAcceptanceProven !== false ||
  vector.claimBoundary?.gate5Closed !== false
) {
  throw new Error('finalized checkpoint vector claim boundary is missing or unsafe');
}

const candidate = await assembleFinalizedBridgeCheckpointCandidate({
  ...vector.input,
  provider: createObservationBundleProvider(vector.observation),
});

assertEqual(
  'finalityAuthoritySetHashHex',
  candidate.checkpointCommitment.checkpoint.finalityAuthoritySetHashHex,
  vector.expected.finalityAuthoritySetHashHex,
);
assertEqual(
  'finalityProofHashHex',
  candidate.checkpointCommitment.checkpoint.finalityProofHashHex,
  vector.expected.finalityProofHashHex,
);
assertEqual(
  'encodedCheckpointHex',
  candidate.checkpointCommitment.encodedCheckpointHex,
  vector.expected.encodedCheckpointHex,
);
assertEqual(
  'checkpointCommitmentHex',
  candidate.checkpointCommitment.checkpointCommitmentHex,
  vector.expected.checkpointCommitmentHex,
);
assertEqual(
  'extensionKeyHex',
  candidate.checkpointCommitment.extensionKeyHex,
  vector.expected.extensionKeyHex,
);
assertEqual(
  'extensionValueHex',
  candidate.checkpointCommitment.extensionValueHex,
  vector.expected.extensionValueHex,
);

console.log('Finalized bridge checkpoint candidate: PASS');
console.log('Mode: checked-in offline synthetic observation vector only.');
console.log(`Native block: ${candidate.target.nativeBlockHashHex}`);
console.log(`Execution block: ${candidate.target.executionBlockHashHex}`);
console.log(`Checkpoint commitment: ${candidate.checkpointCommitment.checkpointCommitmentHex}`);
console.log(`0x0401 candidate: ${candidate.checkpointCommitment.extensionValueHex}`);
console.log(
  'Boundary: this candidate does not verify GRANDPA finality, runtime-state inclusion, authority transitions, or an Ergo anchor and does not close Gate 5.',
);

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${String(expected)}, got ${String(actual)}`);
  }
}
