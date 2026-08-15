import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  assembleFinalizedBridgeCheckpointCandidate,
  createObservationBundleProvider,
  type FinalizedBridgeCheckpointObservationBundle,
  type FinalizedBridgeCheckpointProvider,
} from './finalized-bridge-checkpoint.js';
import {
  MAX_BRIDGE_COMMITMENT_PROOF_NODES,
  MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
} from './substrate-finality-provider.js';

interface FinalizedCheckpointVector {
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

const VECTOR = JSON.parse(readFileSync(
  join(process.cwd(), 'test-vectors', 'finalized-bridge-checkpoint-v1.json'),
  'utf8',
)) as FinalizedCheckpointVector;

function observation(): FinalizedBridgeCheckpointObservationBundle {
  return structuredClone(VECTOR.observation);
}

async function assemble(
  provider: FinalizedBridgeCheckpointProvider = createObservationBundleProvider(observation()),
  input: FinalizedCheckpointVector['input'] = VECTOR.input,
) {
  return assembleFinalizedBridgeCheckpointCandidate({ ...input, provider });
}

describe('finalized bridge checkpoint candidate assembly', () => {
  it('reproduces the frozen V1 checkpoint from one hash-bound observation bundle', async () => {
    const result = await assemble();

    expect(result.status).toBe('CANDIDATE');
    expect(result.target).toEqual({
      nativeBlockHashHex: VECTOR.input.targetNativeBlockHashHex,
      nativeHeight: '1024',
      nativeStateRootHex: VECTOR.observation.targetHeader.stateRootHex,
      executionBlockHashHex: VECTOR.observation.runtimeCommitment.executionBlockHashHex,
    });
    expect(result.checkpointCommitment).toMatchObject({
      encodedCheckpointHex: VECTOR.expected.encodedCheckpointHex,
      checkpointCommitmentHex: VECTOR.expected.checkpointCommitmentHex,
      extensionKeyHex: VECTOR.expected.extensionKeyHex,
      extensionValueHex: VECTOR.expected.extensionValueHex,
    });
    expect(result.checkpointCommitment.checkpoint).toMatchObject({
      finalityAuthoritySetHashHex: VECTOR.expected.finalityAuthoritySetHashHex,
      finalityProofHashHex: VECTOR.expected.finalityProofHashHex,
    });
    expect(result.grandpaInputs).toMatchObject({ authorityCount: 2, authoritySetId: '7' });
    expect(result.runtimeStateReadProof).toMatchObject({
      storageKeysHex: VECTOR.observation.runtimeStateReadProof?.storageKeysHex,
      storageValueScaleHex: VECTOR.observation.runtimeStateReadProof?.storageValueScaleHex,
      proofNodesHex: ['01020304', 'aabbccdd'],
    });
  });

  it('scopes every block-dependent provider read to the exact target hash', async () => {
    const target = VECTOR.input.targetNativeBlockHashHex;
    const base = createObservationBundleProvider(observation());
    const calls: Array<[string, string]> = [];
    const provider: FinalizedBridgeCheckpointProvider = {
      ...base,
      getHeader: async hash => {
        calls.push(['header', hash]);
        return base.getHeader(hash);
      },
      getBridgeCommitmentAt: async hash => {
        calls.push(['runtime', hash]);
        return base.getBridgeCommitmentAt(hash);
      },
      getGrandpaAuthoritySetAt: async hash => {
        calls.push(['authorities', hash]);
        return base.getGrandpaAuthoritySetAt(hash);
      },
      getRuntimeStateReadProofAt: async hash => {
        calls.push(['read-proof', hash]);
        return base.getRuntimeStateReadProofAt!(hash);
      },
    };

    await assemble(provider);

    expect(calls).toContainEqual(['runtime', target]);
    expect(calls).toContainEqual(['authorities', target]);
    expect(calls).toContainEqual(['read-proof', target]);
    expect(calls.filter(([kind]) => kind !== 'header').every(([, hash]) => hash === target)).toBe(true);
  });

  it('rejects targets above the observed finalized head or off the canonical chain', async () => {
    const above = observation();
    above.finalizedHeadHeader.number = '1023';
    await expect(assemble(createObservationBundleProvider(above))).rejects.toThrow(
      /exceeds the observed finalized-head height/,
    );

    const nonCanonical = observation();
    nonCanonical.canonicalTargetHashHex = '99'.repeat(32);
    await expect(assemble(createObservationBundleProvider(nonCanonical))).rejects.toThrow(
      /not canonical/,
    );
  });

  it('rejects runtime identity, height, version, hash aliasing, and burn-count drift', async () => {
    const cases: Array<{
      mutate: (value: FinalizedBridgeCheckpointObservationBundle) => void;
      error: RegExp;
    }> = [
      {
        mutate: value => { value.runtimeCommitment.sidechainIdHex = '99'.repeat(32); },
        error: /sidechain ID does not match/,
      },
      {
        mutate: value => { value.runtimeCommitment.sidechainHeight = '1025'; },
        error: /height does not match/,
      },
      {
        mutate: value => { value.runtimeCommitment.formatVersion = 2; },
        error: /format version/,
      },
      {
        mutate: value => {
          value.runtimeCommitment.executionBlockHashHex = VECTOR.input.targetNativeBlockHashHex;
        },
        error: /must remain distinct/,
      },
      {
        mutate: value => { value.runtimeCommitment.burnLeafCount = 0; },
        error: /between 1 and 256/,
      },
      {
        mutate: value => { value.runtimeCommitment.burnLeafCount = 257; },
        error: /between 1 and 256/,
      },
    ];

    for (const testCase of cases) {
      const value = observation();
      testCase.mutate(value);
      await expect(assemble(createObservationBundleProvider(value))).rejects.toThrow(testCase.error);
    }
  });

  it('rejects provider responses whose runtime, authority, proof, or header binding drifts', async () => {
    const cases: Array<{
      mutate: (value: FinalizedBridgeCheckpointObservationBundle) => void;
      error: RegExp;
    }> = [
      {
        mutate: value => { value.targetHeader.hashHex = '90'.repeat(32); },
        error: /response is not bound|requested header/,
      },
      {
        mutate: value => { value.runtimeCommitment.atNativeBlockHashHex = '91'.repeat(32); },
        error: /runtime commitment is not bound/,
      },
      {
        mutate: value => { value.grandpaAuthoritySet.atNativeBlockHashHex = '92'.repeat(32); },
        error: /authority set is not bound/,
      },
      {
        mutate: value => { value.runtimeStateReadProof!.atNativeBlockHashHex = '93'.repeat(32); },
        error: /read proof is not bound/,
      },
    ];

    for (const testCase of cases) {
      const value = observation();
      testCase.mutate(value);
      await expect(assemble(createObservationBundleProvider(value))).rejects.toThrow(testCase.error);
    }
  });

  it('rejects empty justification bytes and malformed runtime proof nodes', async () => {
    await expect(assemble(undefined, {
      ...VECTOR.input,
      grandpaJustificationScaleHex: '',
    })).rejects.toThrow(/non-empty whole hex bytes/);

    const emptyProof = observation();
    emptyProof.runtimeStateReadProof!.proofNodesHex = [];
    await expect(assemble(createObservationBundleProvider(emptyProof))).rejects.toThrow(
      /at least one proof node/,
    );

    const wrongKey = observation();
    wrongKey.runtimeStateReadProof!.storageKeysHex = ['ab'.repeat(32)];
    await expect(assemble(createObservationBundleProvider(wrongKey))).rejects.toThrow(
      /CurrentCommitment/,
    );

    const duplicateKeys = observation();
    duplicateKeys.runtimeStateReadProof!.storageKeysHex.push(
      duplicateKeys.runtimeStateReadProof!.storageKeysHex[0],
    );
    await expect(assemble(createObservationBundleProvider(duplicateKeys))).rejects.toThrow(
      /exactly one storage key/,
    );

    const wrongValue = observation();
    wrongValue.runtimeStateReadProof!.storageValueScaleHex =
      `${wrongValue.runtimeStateReadProof!.storageValueScaleHex.slice(0, -2)}04`;
    await expect(assemble(createObservationBundleProvider(wrongValue))).rejects.toThrow(
      /does not match/,
    );

    const duplicateNodes = observation();
    duplicateNodes.runtimeStateReadProof!.proofNodesHex = ['0102', '0102'];
    await expect(assemble(createObservationBundleProvider(duplicateNodes))).rejects.toThrow(
      /duplicate/,
    );

    const tooManyNodes = observation();
    tooManyNodes.runtimeStateReadProof!.proofNodesHex = Array.from(
      { length: MAX_BRIDGE_COMMITMENT_PROOF_NODES + 1 },
      () => '01',
    );
    await expect(assemble(createObservationBundleProvider(tooManyNodes))).rejects.toThrow(/nodes/);

    const oversizedNode = observation();
    oversizedNode.runtimeStateReadProof!.proofNodesHex = [
      '00'.repeat(MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES + 1),
    ];
    await expect(assemble(createObservationBundleProvider(oversizedNode))).rejects.toThrow(
      /exceeds/,
    );
  });

  it('preserves every proof and release claim as false', async () => {
    const boundary = (await assemble()).boundary;

    expect(boundary).toEqual({
      readOnly: true,
      candidateOnly: true,
      nodeObservationsCryptographicallyVerified: false,
      grandpaJustificationVerified: false,
      authoritySetAuthenticated: false,
      authorityTransitionsVerified: false,
      runtimeStateProofVerified: false,
      executionConsensusMappingVerified: false,
      sidechainFinalityVerified: false,
      ergoAnchorAuthenticated: false,
      onChainAcceptanceProven: false,
      transactionBroadcastOrMutation: false,
      gate5Closed: false,
    });
  });

  it('runs the checked-in offline vector CLI without RPC, signing, or mutation', () => {
    const cli = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/scripts/assemble-finalized-bridge-checkpoint.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe('');
    expect(cli.stdout).toContain('Finalized bridge checkpoint candidate: PASS');
    expect(cli.stdout).toContain(VECTOR.expected.checkpointCommitmentHex);
    expect(cli.stdout).toContain('does not verify GRANDPA finality');
    expect(cli.stdout).toContain('does not close Gate 5');
  });
});
