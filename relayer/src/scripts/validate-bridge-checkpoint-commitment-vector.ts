import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  BRIDGE_CHECKPOINT_DOMAIN,
  BRIDGE_EXTENSION_KEY_HEX,
  GRANDPA_AUTHORITY_SET_DOMAIN,
  GRANDPA_JUSTIFICATION_DOMAIN,
  buildBridgeCheckpointFromBurnsV1,
  deriveGrandpaAuthoritySetHashHex,
  deriveGrandpaJustificationHashHex,
} from '../bridge-checkpoint-commitment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorPath = resolve(__dirname, '../../test-vectors/bridge-checkpoint-commitment-v1.json');
const vector = JSON.parse(readFileSync(vectorPath, 'utf8'));

if (vector.schema !== 'e2s.bridge-checkpoint-commitment.vector.v1') {
  throw new Error('unexpected bridge checkpoint vector schema');
}
if (
  vector.claimBoundary?.syntheticAuthoritySet !== true ||
  vector.claimBoundary?.syntheticJustification !== true ||
  vector.claimBoundary?.authoritySetAuthenticated !== false ||
  vector.claimBoundary?.grandpaJustificationVerified !== false ||
  vector.claimBoundary?.executionConsensusMappingVerified !== false ||
  vector.claimBoundary?.sidechainFinalityVerified !== false ||
  vector.claimBoundary?.onChainAcceptanceVerified !== false ||
  vector.claimBoundary?.gate5Closed !== false
) {
  throw new Error('bridge checkpoint vector claim boundary is missing or unsafe');
}
if (
  vector.domains?.checkpoint !== BRIDGE_CHECKPOINT_DOMAIN ||
  vector.domains?.grandpaAuthoritySet !== GRANDPA_AUTHORITY_SET_DOMAIN ||
  vector.domains?.grandpaJustification !== GRANDPA_JUSTIFICATION_DOMAIN
) {
  throw new Error('bridge checkpoint vector domain binding drift');
}

const finalityAuthoritySetHashHex = deriveGrandpaAuthoritySetHashHex(
  Buffer.from(vector.input.grandpaAuthoritySetHashInputHex, 'hex'),
);
const finalityProofHashHex = deriveGrandpaJustificationHashHex(
  Buffer.from(vector.input.grandpaJustificationHashInputHex, 'hex'),
);
const built = buildBridgeCheckpointFromBurnsV1({
  version: vector.input.version,
  hashAlgorithmId: vector.input.hashAlgorithmId,
  finalityRuleId: vector.input.finalityRuleId,
  flags: vector.input.flags,
  sidechainIdHex: vector.input.sidechainIdHex,
  sidechainHeight: vector.input.sidechainHeight,
  sidechainConsensusBlockHashHex: vector.input.sidechainConsensusBlockHashHex,
  executionBlockHashHex: vector.input.executionBlockHashHex,
  finalityAuthoritySetId: vector.input.finalityAuthoritySetId,
  finalityAuthoritySetHashHex,
  finalityProofHashHex,
  burnLeavesInCanonicalOrder: vector.input.burnLeavesInCanonicalOrder,
});

const expectedBindings: Array<[string, unknown, unknown]> = [
  [
    'finalityAuthoritySetHashHex',
    finalityAuthoritySetHashHex,
    vector.expected.finalityAuthoritySetHashHex,
  ],
  ['finalityProofHashHex', finalityProofHashHex, vector.expected.finalityProofHashHex],
  ['bridgeEventRootHex', built.checkpoint.bridgeEventRootHex, vector.expected.bridgeEventRootHex],
  ['burnLeafCount', built.checkpoint.burnLeafCount, vector.expected.burnLeafCount],
  ['encodedCheckpointHex', built.encodedCheckpointHex, vector.expected.encodedCheckpointHex],
  ['checkpointCommitmentHex', built.checkpointCommitmentHex, vector.expected.checkpointCommitmentHex],
  ['extensionKeyHex', built.extensionKeyHex, BRIDGE_EXTENSION_KEY_HEX],
  ['extensionKeyHex expected', built.extensionKeyHex, vector.expected.extensionKeyHex],
  ['extensionValueHex', built.extensionValueHex, vector.expected.extensionValueHex],
];
for (const [label, actual, expected] of expectedBindings) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${String(expected)}, got ${String(actual)}`);
  }
}

console.log('# Bridge Checkpoint Commitment V1');
console.log('');
console.log('| Field | Value |');
console.log('|---|---|');
console.log('| Result | PASS |');
console.log(`| Burn leaves | ${built.checkpoint.burnLeafCount} |`);
console.log(`| Checkpoint bytes | ${built.encodedCheckpointHex.length / 2} |`);
console.log(`| Extension key | ${built.extensionKeyHex} |`);
console.log(`| Extension value bytes | ${built.extensionValueHex.length / 2} |`);
console.log('| Authority set authenticated | no |');
console.log('| GRANDPA justification verified | no |');
console.log('| Execution/consensus mapping verified | no |');
console.log('| Sidechain finality verified | no |');
console.log('| On-chain acceptance verified | no |');
console.log('| Gate 5 closed | no |');
