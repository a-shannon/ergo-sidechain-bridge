import { describe, expect, it } from 'vitest';

import {
  BRIDGE_EXTENSION_KEY_HEX,
  buildBridgeCheckpointCommitmentV1,
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import { decodeCollByteRegister } from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-extension-membership.js';
import {
  AUTHENTICATED_SPV_TRACKER_DOMAIN,
  AUTHENTICATED_SPV_TRACKER_FLAGS,
  AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES,
  AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
  buildAuthenticatedSpvAdmission,
  decodeAuthenticatedSpvProofBundle,
  decodeAuthenticatedSpvTrackerValue,
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvProofBundle,
  replayAuthenticatedSpvAdmission,
} from './spv-tracker-authenticated.js';

const SIDECHAIN_ID = '11'.repeat(32);
const COMMITTEE_REGISTER = `08cd02${'99'.repeat(32)}`;

function finalityCommitmentFor(checkpoint: {
  encodedCheckpointHex: string;
  checkpointCommitmentHex: string;
}) {
  const finalityStatement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '88'.repeat(32),
    finalityHorizonHeight: 1_024,
    finalityHorizonHashHex: '99'.repeat(32),
  });
  const aggregateFinalityProof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: 'aa'.repeat(32),
    encodedStatement: finalityStatement.encodedStatementHex,
    payload: Buffer.from('authenticated-spv-tracker-test-proof', 'ascii'),
  });
  return {
    aggregateFinalityCommitment: buildAggregateFinalityCommitmentV1(
      aggregateFinalityProof,
    ),
    aggregateFinalityProof,
    finalityStatement,
  };
}

function fixture() {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: 1_024,
    sidechainConsensusBlockHashHex: '22'.repeat(32),
    executionBlockHashHex: '33'.repeat(32),
    bridgeEventRootHex: '44'.repeat(32),
    burnLeafCount: 3,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '55'.repeat(32),
    finalityProofHashHex: '66'.repeat(32),
  });
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.alloc(33, 0x70) },
    {
      key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
      value: Buffer.from(checkpoint.extensionValueHex, 'hex'),
    },
    { key: Buffer.from('0402', 'hex'), value: Buffer.alloc(32, 0x71) },
  ], Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'));
  const {
    aggregateFinalityCommitment,
    aggregateFinalityProof,
    finalityStatement,
  } = finalityCommitmentFor(checkpoint);

  return {
    aggregateFinalityCommitment,
    aggregateFinalityProof,
    checkpoint,
    finalityStatement,
    membership,
    input: {
      encodedCheckpointHex: checkpoint.encodedCheckpointHex,
      aggregateFinalityCommitmentHex:
        aggregateFinalityCommitment.encodedCommitmentHex,
      extensionProofHex: membership.proof.toString('hex'),
      anchorHeader: {
        idHex: '77'.repeat(32),
        height: 899_999,
        extensionRootHex: membership.root.toString('hex'),
        contextIndex: 2,
      },
      approvedSidechainIdHex: SIDECHAIN_ID,
      history: [],
      currentCounter: 9,
      currentLatestSidechainHeight: 1_023,
      currentStampHeight: 900_001,
      currentErgoHeight: 900_002,
      finalityAttestorSigmaPropRegisterHex: COMMITTEE_REGISTER,
    },
  };
}

describe('authenticated SPV tracker V2 admission', () => {
  it('binds a frozen checkpoint to 0x0401, an Ergo header, and an append-only AVL insert', () => {
    const {
      aggregateFinalityCommitment,
      aggregateFinalityProof,
      checkpoint,
      finalityStatement,
      input,
    } = fixture();
    const plan = buildAuthenticatedSpvAdmission(input);
    const decoded = decodeAuthenticatedSpvTrackerValue(plan.trackerValueHex);
    const bundle = Buffer.from(plan.proofBundleHex, 'hex');

    expect(AUTHENTICATED_SPV_TRACKER_DOMAIN).toBe('E2S_SPV_V2');
    expect(AUTHENTICATED_SPV_TRACKER_FLAGS).toBe(0x01);
    expect(Buffer.from(plan.trackerValueHex, 'hex')).toHaveLength(
      AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
    );
    expect(plan.trackerKeyHex).toBe(deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: checkpoint.checkpoint.sidechainIdHex,
      sidechainHeight: checkpoint.checkpoint.sidechainHeight,
      executionBlockHashHex: checkpoint.checkpoint.executionBlockHashHex,
    }));
    expect(decoded).toEqual({
      bridgeEventRootHex: checkpoint.checkpoint.bridgeEventRootHex,
      checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
      anchorHeaderIdHex: input.anchorHeader.idHex,
      anchorHeaderHeight: input.anchorHeader.height,
      finalityProofSystemId: aggregateFinalityProof.proofSystemId,
      finalityStatementDigestHex: finalityStatement.statementDigestHex,
      finalityProgramIdHex: finalityStatement.programIdHex,
      finalityVerifierProfileIdHex: aggregateFinalityProof.verifierProfileIdHex,
      finalityProofPayloadDigestHex: aggregateFinalityProof.payloadDigestHex,
      finalityProofDigestHex: aggregateFinalityProof.proofDigestHex,
    });
    expect(bundle.readBigUInt64BE(0)).toBe(BigInt(input.extensionProofHex.length / 2));
    expect(bundle.subarray(8, 8 + input.extensionProofHex.length / 2).toString('hex'))
      .toBe(input.extensionProofHex);
    expect(plan.avlInsertProofHex.length).toBeGreaterThan(0);
    expect(plan.successorDigestHex).not.toBe(plan.inputDigestHex);
    expect(plan.contextExtension).toEqual(expect.objectContaining({
      '0': expect.stringMatching(/^0e/),
      '1': expect.stringMatching(/^0e/),
      '2': expect.stringMatching(/^0e/),
      '3': '0404',
    }));
    expect(decodeCollByteRegister(plan.contextExtension['0']))
      .toBe(aggregateFinalityCommitment.encodedCommitmentHex);
    expect(plan.inputRegisters.R6).toBe(plan.successorRegisters.R6);
    expect(plan.inputRegisters.R9).toBe(plan.successorRegisters.R9);
    expect(plan.inputRegisters.R5).not.toBe(plan.successorRegisters.R5);
    expect(plan.trustBoundary).toBe('proof-bound-attestor-authorized-finality');
  });

  it('round-trips only canonical, fully consumed admission proof bundles', () => {
    const { input } = fixture();
    const plan = buildAuthenticatedSpvAdmission(input);
    expect(decodeAuthenticatedSpvProofBundle(plan.proofBundleHex)).toEqual({
      extensionProofHex: plan.extensionProofHex,
      avlInsertProofHex: plan.avlInsertProofHex,
    });

    const truncated = Buffer.from(plan.proofBundleHex, 'hex');
    truncated.writeBigUInt64BE(BigInt(truncated.length), 0);
    expect(() => decodeAuthenticatedSpvProofBundle(truncated.toString('hex')))
      .toThrow(/extension proof length/i);
    const withoutAvlProof = plan.proofBundleHex.slice(
      0,
      (8 + plan.extensionProofHex.length / 2) * 2,
    );
    expect(() => decodeAuthenticatedSpvProofBundle(withoutAvlProof))
      .toThrow(/AVL insert proof|extension proof/i);
    expect(() => decodeAuthenticatedSpvProofBundle(
      '00'.repeat(AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES + 1),
    )).toThrow(/proof bundle exceeds.*bound/i);
  });

  it('replays the exact observed AVL insert proof from the current digest', () => {
    const { input } = fixture();
    const generated = buildAuthenticatedSpvAdmission(input);
    const { history: _history, ...baseInput } = input;
    const replayed = replayAuthenticatedSpvAdmission({
      ...baseInput,
      currentDigestHex: generated.inputDigestHex,
      avlInsertProofHex: generated.avlInsertProofHex,
    });

    expect(replayed).toEqual(generated);

    const wrongDigest = Buffer.from(generated.inputDigestHex, 'hex');
    wrongDigest[0] ^= 1;
    expect(() => replayAuthenticatedSpvAdmission({
      ...baseInput,
      currentDigestHex: wrongDigest.toString('hex'),
      avlInsertProofHex: generated.avlInsertProofHex,
    })).toThrow();

    const wrongProof = Buffer.from(generated.avlInsertProofHex, 'hex');
    wrongProof[Math.floor(wrongProof.length / 2)] ^= 1;
    expect(() => replayAuthenticatedSpvAdmission({
      ...baseInput,
      currentDigestHex: generated.inputDigestHex,
      avlInsertProofHex: wrongProof.toString('hex'),
    })).toThrow();

    expect(() => replayAuthenticatedSpvAdmission({
      ...baseInput,
      currentDigestHex: generated.inputDigestHex,
      avlInsertProofHex: generated.avlInsertProofHex.slice(0, -2),
    })).toThrow();
  });

  it('supports signed-Long sidechain heights beyond the JavaScript safe integer range', () => {
    const height = 9_007_199_254_740_993n;
    expect(deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainHeight: height,
      executionBlockHashHex: '33'.repeat(32),
    })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a checkpoint or proof that does not match the authenticated extension root', () => {
    const { input } = fixture();
    const changedCheckpoint = Buffer.from(input.encodedCheckpointHex, 'hex');
    changedCheckpoint[107] ^= 0x01;
    const changedCheckpointHex = changedCheckpoint.toString('hex');
    const changedCommitment = finalityCommitmentFor({
      encodedCheckpointHex: changedCheckpointHex,
      checkpointCommitmentHex: deriveBridgeCheckpointCommitmentHex(changedCheckpointHex),
    });
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      encodedCheckpointHex: changedCheckpointHex,
      aggregateFinalityCommitmentHex:
        changedCommitment.aggregateFinalityCommitment.encodedCommitmentHex,
    })).toThrow('not a member');

    const wrongProof = Buffer.from(input.extensionProofHex, 'hex');
    wrongProof[10] ^= 0x01;
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      extensionProofHex: wrongProof.toString('hex'),
    })).toThrow('not a member');
  });

  it('rejects a canonical finality commitment whose embedded checkpoint differs', () => {
    const { checkpoint, input } = fixture();
    const otherCheckpoint = buildBridgeCheckpointCommitmentV1({
      ...checkpoint.checkpoint,
      sidechainConsensusBlockHashHex: 'ab'.repeat(32),
    });
    const otherFinality = finalityCommitmentFor(otherCheckpoint);

    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      aggregateFinalityCommitmentHex:
        otherFinality.aggregateFinalityCommitment.encodedCommitmentHex,
    })).toThrow(/commitment checkpoint.*admission checkpoint/i);
  });

  it('rejects wrong-chain, rollback, excessive burn count, future anchor, and stale stamp inputs', () => {
    const { checkpoint, input } = fixture();
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      approvedSidechainIdHex: 'aa'.repeat(32),
    })).toThrow('does not match the tracker allowlist');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      currentLatestSidechainHeight: 1_024,
    })).toThrow('must advance');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      anchorHeader: { ...input.anchorHeader, height: input.currentErgoHeight + 1 },
    })).toThrow('cannot be newer');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      currentStampHeight: input.currentErgoHeight,
    })).toThrow('must advance the tracker stamp');

    const excessive = buildBridgeCheckpointCommitmentV1({
      ...checkpoint.checkpoint,
      burnLeafCount: 257,
    });
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      encodedCheckpointHex: excessive.encodedCheckpointHex,
      aggregateFinalityCommitmentHex:
        finalityCommitmentFor(excessive).aggregateFinalityCommitment.encodedCommitmentHex,
    })).toThrow('burnLeafCount must not exceed 256');
  });

  it('rejects out-of-window headers and malformed or noncanonical extension proofs', () => {
    const { input } = fixture();
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      anchorHeader: { ...input.anchorHeader, contextIndex: 10 },
    })).toThrow('contextIndex must be between 0 and 9');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      currentErgoHeight: input.currentErgoHeight + 1,
    })).toThrow('contextIndex + 1 must equal currentErgoHeight - anchorHeader.height');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      extensionProofHex: input.extensionProofHex.slice(0, -2),
    })).toThrow('length must be divisible by 33');

    const noncanonical = Buffer.alloc(33, 0);
    noncanonical[0] = 2;
    noncanonical[1] = 1;
    expect(() => encodeAuthenticatedSpvProofBundle(
      noncanonical.toString('hex'),
      '01',
    )).toThrow('empty-node padding must be zero');
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      extensionProofHex: noncanonical.toString('hex'),
    })).toThrow('empty-node padding must be zero');
  });

  it('rejects duplicate admission and counter overflow before producing a transaction plan', () => {
    const { input } = fixture();
    const first = buildAuthenticatedSpvAdmission(input);
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      history: [{ key: first.trackerKeyHex, value: first.trackerValueHex }],
    })).toThrow();
    expect(() => buildAuthenticatedSpvAdmission({
      ...input,
      currentCounter: 0x7fff_ffff_ffff_ffffn,
    })).toThrow('cannot advance');
  });
});
