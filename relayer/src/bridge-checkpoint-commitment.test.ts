import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  BRIDGE_CHECKPOINT_ENCODED_BYTES,
  BRIDGE_EXTENSION_VALUE_BYTES,
  buildBridgeCheckpointCommitmentV1,
  buildBridgeCheckpointFromBurnsV1,
  decodeBridgeCheckpointV1,
  decodeBridgeExtensionValueV1,
  deriveGrandpaAuthoritySetHashHex,
  deriveGrandpaJustificationHashHex,
  verifyBridgeExtensionBindingV1,
  type BridgeCheckpointV1Input,
} from './bridge-checkpoint-commitment.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-checkpoint-commitment-v1.json', import.meta.url),
  'utf8',
));

function buildGoldenCheckpoint() {
  const finalityAuthoritySetHashHex = deriveGrandpaAuthoritySetHashHex(
    Buffer.from(vector.input.grandpaAuthoritySetHashInputHex, 'hex'),
  );
  const finalityProofHashHex = deriveGrandpaJustificationHashHex(
    Buffer.from(vector.input.grandpaJustificationHashInputHex, 'hex'),
  );
  return buildBridgeCheckpointFromBurnsV1({
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
}

describe('bridge checkpoint commitment V1', () => {
  it('reproduces the canonical burn root, checkpoint, and 0x0401 golden vector', () => {
    const built = buildGoldenCheckpoint();

    expect(built.checkpoint.sidechainConsensusBlockHashHex)
      .toBe(vector.input.sidechainConsensusBlockHashHex);
    expect(built.checkpoint.executionBlockHashHex).toBe(vector.input.executionBlockHashHex);
    expect(built.checkpoint.sidechainConsensusBlockHashHex)
      .not.toBe(built.checkpoint.executionBlockHashHex);
    expect(built.checkpoint.finalityAuthoritySetHashHex)
      .toBe(vector.expected.finalityAuthoritySetHashHex);
    expect(built.checkpoint.finalityProofHashHex).toBe(vector.expected.finalityProofHashHex);
    expect(built.checkpoint.bridgeEventRootHex).toBe(vector.expected.bridgeEventRootHex);
    expect(built.checkpoint.burnLeafCount).toBe(vector.expected.burnLeafCount);
    expect(built.encodedCheckpointHex).toBe(vector.expected.encodedCheckpointHex);
    expect(built.checkpointCommitmentHex).toBe(vector.expected.checkpointCommitmentHex);
    expect(built.extensionKeyHex).toBe(vector.expected.extensionKeyHex);
    expect(built.extensionValueHex).toBe(vector.expected.extensionValueHex);
    expect(Buffer.from(built.encodedCheckpointHex, 'hex')).toHaveLength(BRIDGE_CHECKPOINT_ENCODED_BYTES);
    expect(Buffer.from(built.extensionValueHex, 'hex')).toHaveLength(BRIDGE_EXTENSION_VALUE_BYTES);
    expect(decodeBridgeCheckpointV1(built.encodedCheckpointHex)).toEqual(built.checkpoint);
    expect(decodeBridgeExtensionValueV1(built.extensionValueHex)).toEqual({
      bridgeEventRootHex: built.checkpoint.bridgeEventRootHex,
      checkpointCommitmentHex: built.checkpointCommitmentHex,
    });
    expect(verifyBridgeExtensionBindingV1(built.checkpoint, built.extensionValueHex)).toBe(true);
  });

  it('binds consensus, execution, burn, and finality identities independently', () => {
    const built = buildGoldenCheckpoint();
    const base = built.checkpoint;
    const mutations: BridgeCheckpointV1Input[] = [
      { ...base, sidechainIdHex: '10'.repeat(32) },
      { ...base, sidechainHeight: '1025' },
      { ...base, sidechainConsensusBlockHashHex: '23'.repeat(32) },
      { ...base, executionBlockHashHex: '24'.repeat(32) },
      { ...base, bridgeEventRootHex: '25'.repeat(32) },
      { ...base, burnLeafCount: 4 },
      { ...base, finalityAuthoritySetId: '8' },
      { ...base, finalityAuthoritySetHashHex: '26'.repeat(32) },
      { ...base, finalityProofHashHex: '25'.repeat(32) },
    ];

    for (const mutation of mutations) {
      const changed = buildBridgeCheckpointCommitmentV1(mutation);
      expect(changed.checkpointCommitmentHex).not.toBe(built.checkpointCommitmentHex);
      expect(verifyBridgeExtensionBindingV1(mutation, built.extensionValueHex)).toBe(false);
    }
  });

  it('rejects cross-sidechain, cross-block, empty, and unsupported checkpoint inputs', () => {
    const input = vector.input;
    const finalityAuthoritySetHashHex = vector.expected.finalityAuthoritySetHashHex;
    const finalityProofHashHex = vector.expected.finalityProofHashHex;
    const base = {
      version: input.version,
      hashAlgorithmId: input.hashAlgorithmId,
      finalityRuleId: input.finalityRuleId,
      flags: input.flags,
      sidechainIdHex: input.sidechainIdHex,
      sidechainHeight: input.sidechainHeight,
      sidechainConsensusBlockHashHex: input.sidechainConsensusBlockHashHex,
      executionBlockHashHex: input.executionBlockHashHex,
      finalityAuthoritySetId: input.finalityAuthoritySetId,
      finalityAuthoritySetHashHex,
      finalityProofHashHex,
    };

    expect(() => buildBridgeCheckpointFromBurnsV1({
      ...base,
      burnLeavesInCanonicalOrder: [],
    })).toThrow('at least one successful canonical burn');
    expect(() => buildBridgeCheckpointFromBurnsV1({
      ...base,
      burnLeavesInCanonicalOrder: [
        {
          ...input.burnLeavesInCanonicalOrder[0],
          sidechainIdHex: '12'.repeat(32),
          burnIdHex: deriveTrustlessBurnIdHex({
            sidechainIdHex: '12'.repeat(32),
            sidechainTxHashHex: input.burnLeavesInCanonicalOrder[0].sidechainTxHashHex,
            eventIndex: input.burnLeavesInCanonicalOrder[0].eventIndex,
          }),
        },
      ],
    })).toThrow('checkpoint sidechainId');
    expect(() => buildBridgeCheckpointFromBurnsV1({
      ...base,
      burnLeavesInCanonicalOrder: [
        { ...input.burnLeavesInCanonicalOrder[0], sidechainBlockHashHex: '23'.repeat(32) },
      ],
    })).toThrow('checkpoint executionBlockHash');

    const checkpoint = buildGoldenCheckpoint().checkpoint;
    expect(() => buildBridgeCheckpointCommitmentV1({ ...checkpoint, version: 2 }))
      .toThrow('unsupported bridge checkpoint version');
    expect(() => buildBridgeCheckpointCommitmentV1({ ...checkpoint, hashAlgorithmId: 2 }))
      .toThrow('unsupported bridge checkpoint hash algorithm');
    expect(() => buildBridgeCheckpointCommitmentV1({ ...checkpoint, finalityRuleId: 2 }))
      .toThrow('unsupported bridge checkpoint finality rule');
    expect(() => buildBridgeCheckpointCommitmentV1({ ...checkpoint, flags: 1 }))
      .toThrow('unsupported bridge checkpoint flags');
    expect(() => buildBridgeCheckpointCommitmentV1({ ...checkpoint, burnLeafCount: 0 }))
      .toThrow('burnLeafCount greater than zero');
    expect(() => buildBridgeCheckpointCommitmentV1({
      ...checkpoint,
      finalityAuthoritySetHashHex: '00',
    })).toThrow('finalityAuthoritySetHash must be 32 bytes');
    expect(() => decodeBridgeCheckpointV1(Buffer.alloc(BRIDGE_CHECKPOINT_ENCODED_BYTES - 1)))
      .toThrow(`must be ${BRIDGE_CHECKPOINT_ENCODED_BYTES} bytes`);
  });

  it('rejects legacy raw-root extension values and detects either V1 half drifting', () => {
    const built = buildGoldenCheckpoint();
    expect(() => decodeBridgeExtensionValueV1(built.checkpoint.bridgeEventRootHex))
      .toThrow('must be 64 bytes');

    const wrongRoot = '00'.repeat(32) + built.checkpointCommitmentHex;
    const wrongCheckpoint = built.checkpoint.bridgeEventRootHex + '00'.repeat(32);
    expect(verifyBridgeExtensionBindingV1(built.checkpoint, wrongRoot)).toBe(false);
    expect(verifyBridgeExtensionBindingV1(built.checkpoint, wrongCheckpoint)).toBe(false);
  });

  it('domain-separates non-empty GRANDPA authority-set and justification bytes', () => {
    const authoritySetBytes = Buffer.from(vector.input.grandpaAuthoritySetHashInputHex, 'hex');
    expect(authoritySetBytes).toHaveLength(81);
    expect(authoritySetBytes[0]).toBe(8);
    expect(() => deriveGrandpaAuthoritySetHashHex(Buffer.alloc(0))).toThrow('must be non-empty');
    expect(() => deriveGrandpaJustificationHashHex(Buffer.alloc(0))).toThrow('must be non-empty');
    expect(deriveGrandpaAuthoritySetHashHex(authoritySetBytes))
      .toBe(vector.expected.finalityAuthoritySetHashHex);
    expect(deriveGrandpaAuthoritySetHashHex(authoritySetBytes))
      .not.toBe(deriveGrandpaJustificationHashHex(authoritySetBytes));
    expect(deriveGrandpaJustificationHashHex(
      Buffer.from(vector.input.grandpaJustificationHashInputHex, 'hex'),
    )).toBe(vector.expected.finalityProofHashHex);
  });
});
