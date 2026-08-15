import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

import type { FrontierBridgeEventRootInput } from './frontier-bridge-event-root.js';
import {
  assertNativeFrontierCheckpointJoinProvenance,
  buildNativeFrontierCheckpointJoinCandidate,
  joinPinnedLocalNativeCheckpointToFrontierBurns,
  validateNativeFrontierCheckpointIdentity,
} from './native-frontier-checkpoint-join.js';
import {
  buildNativeVerifiedBridgeCheckpoint,
  verifyNativeFinalizedBridgeCheckpoint,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import type {
  PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
} from './pinned-local-native-verifier-build.js';

interface NativeVector {
  trustedAnchorDigestHex: string;
  request: NativeFinalizedBridgeCheckpointRequest;
  expected: NativeFinalizedBridgeCheckpointVerificationPayload;
}

interface FrontierVector {
  input: FrontierBridgeEventRootInput;
  expected: {
    burnCount: number;
    burnIdHexes: string[];
    bridgeEventRootHex: string;
  };
}

const EXPECTED_CHECKPOINT_COMMITMENT_HEX =
  '4a9e7f4c04fb2094fa76ff6ecbbd02164f8e14d8b6a90cbae2ac02d7d22ffb93';
const EXPECTED_EXTENSION_VALUE_HEX =
  'af06acdab6c0a84382ba80bd42c1e80d9f8494cacd8954ca1226f00522c8976e' +
  EXPECTED_CHECKPOINT_COMMITMENT_HEX;

const directory = dirname(fileURLToPath(import.meta.url));
const vectorsDirectory = resolve(directory, '..', 'test-vectors');
const nativeVector = JSON.parse(readFileSync(
  resolve(vectorsDirectory, 'native-finalized-bridge-checkpoint-v2.json'),
  'utf8',
)) as NativeVector;
const frontierVector = JSON.parse(readFileSync(
  resolve(vectorsDirectory, 'frontier-bridge-event-root-v1.json'),
  'utf8',
)) as FrontierVector;
const executableSha256Hex = `0x${createHash('sha256')
  .update(readFileSync(process.execPath))
  .digest('hex')}`;

let checkpoint: NativeVerifiedBridgeCheckpoint;

beforeAll(async () => {
  const encoded = Buffer.from(JSON.stringify(nativeVector.expected), 'utf8').toString('base64');
  const script = `
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  JSON.parse(Buffer.concat(chunks).toString('utf8'));
  process.stdout.write(Buffer.from('${encoded}', 'base64'));
});`;
  const executableArgs = ['-e', script, '--'];
  const verification = await verifyNativeFinalizedBridgeCheckpoint({
    executablePath: process.execPath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
      executableSha256Hex,
      [...executableArgs, '--trusted-anchor-digest', nativeVector.trustedAnchorDigestHex],
    ),
    executableArgs,
    trustedAnchorDigestHex: nativeVector.trustedAnchorDigestHex,
    request: nativeVector.request,
  });
  checkpoint = buildNativeVerifiedBridgeCheckpoint(verification);
});

function candidate(frontier: FrontierBridgeEventRootInput = frontierVector.input) {
  return buildNativeFrontierCheckpointJoinCandidate({
    checkpoint,
    frontier,
    targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
  });
}

describe('native Frontier checkpoint join', () => {
  it('builds a non-admissible conformance candidate with frozen cross-language literals', () => {
    const result = candidate();

    expect(result.bridgeEventRootHex).toBe(frontierVector.expected.bridgeEventRootHex);
    expect(result.burnLeafCount).toBe(frontierVector.expected.burnCount);
    expect(result.targetBurnProof.leaf.burnIdHex).toBe(frontierVector.expected.burnIdHexes[0]);
    expect(result.targetBurnProof.bridgeEventRootHex).toBe(result.bridgeEventRootHex);
    expect(result.extensionKeyHex).toBe('0401');
    expect(result.checkpointCommitmentHex).toBe(EXPECTED_CHECKPOINT_COMMITMENT_HEX);
    expect(result.extensionValueHex).toBe(EXPECTED_EXTENSION_VALUE_HEX);
    expect(result.boundary).toEqual({
      nativeVerifierOutputValidated: true,
      pinnedLocalSourceBuildVerified: false,
      completeBuildToolClosureVerified: false,
      dependencyCacheContentAttested: false,
      independentBuildAttestationVerified: false,
      localConformanceOnly: true,
      verificationScope: 'generic-self-pinned-local-conformance',
      nativeFinalityVerified: false,
      runtimeStateProofVerified: false,
      frontierBurnExtractionVerified: true,
      targetBurnInclusionVerified: true,
      ergoExtensionCandidateDerived: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      admissionEligible: false,
      committeeBypassPrevented: false,
      gate5Closed: false,
    });
    expect(() => assertNativeFrontierCheckpointJoinProvenance(result))
      .toThrow(/join provenance/i);
  });

  it('rejects an auto-pinned executable result from the source-bound join', () => {
    expect(() => joinPinnedLocalNativeCheckpointToFrontierBurns({
      checkpoint: checkpoint as PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
      frontier: frontierVector.input,
      targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
    })).toThrow(/pinned-local-source native checkpoint provenance/i);
  });

  it('rejects a different sidechain before deriving a candidate', () => {
    const frontier = structuredClone(frontierVector.input);
    frontier.sidechainIdHex = '44'.repeat(32);
    expect(() => candidate(frontier)).toThrow(/sidechain ID does not match/i);
  });

  it('rejects a different execution block before deriving a candidate', () => {
    const frontier = structuredClone(frontierVector.input);
    frontier.executionBlockHashHex = '44'.repeat(32);
    expect(() => candidate(frontier)).toThrow(/execution block hash does not match/i);
  });

  it('rejects receipt drift that changes the canonical burn root', () => {
    const frontier = structuredClone(frontierVector.input);
    frontier.receipts[0].transactionHash = `0x${'44'.repeat(32)}`;
    expect(() => candidate(frontier)).toThrow(/event root does not match/i);
  });

  it('isolates burn-count drift while every other commitment field remains fixed', () => {
    const native = checkpoint.checkpointCommitment.checkpoint;
    expect(() => validateNativeFrontierCheckpointIdentity({
      checkpoint: {
        sidechainIdHex: native.sidechainIdHex,
        executionBlockHashHex: native.executionBlockHashHex,
        bridgeEventRootHex: native.bridgeEventRootHex,
        burnLeafCount: native.burnLeafCount,
      },
      frontier: {
        sidechainIdHex: native.sidechainIdHex,
        executionBlockHashHex: native.executionBlockHashHex,
        bridgeEventRootHex: native.bridgeEventRootHex,
        burnLeafCount: native.burnLeafCount + 1,
      },
    })).toThrow(/burn leaf count does not match/i);
  });

  it('rejects a target burn absent from the finalized root', () => {
    expect(() => buildNativeFrontierCheckpointJoinCandidate({
      checkpoint,
      frontier: frontierVector.input,
      targetBurnIdHex: 'ff'.repeat(32),
    })).toThrow(/not present/i);
  });

  it('does not accept a cloned generic checkpoint as verifier provenance', () => {
    expect(() => buildNativeFrontierCheckpointJoinCandidate({
      checkpoint: structuredClone(checkpoint),
      frontier: frontierVector.input,
      targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
    })).toThrow(/checkpoint provenance/i);
  });
});
