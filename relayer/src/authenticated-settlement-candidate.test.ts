import { describe, expect, it } from 'vitest';

import {
  buildAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import { encodeAuthenticatedSpvTrackerValue } from './spv-tracker-authenticated.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

function canonicalTrackerValue(sidechainIdHex: string, executionBlockHashHex: string): string {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex,
    sidechainHeight: 1_024,
    sidechainConsensusBlockHashHex: '21'.repeat(32),
    executionBlockHashHex,
    bridgeEventRootHex: '23'.repeat(32),
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '24'.repeat(32),
    finalityProofHashHex: '25'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '26'.repeat(32),
    finalityHorizonHeight: 1_024,
    finalityHorizonHashHex: '27'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '28'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('authenticated-settlement-candidate-proof', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: checkpoint.checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '88'.repeat(32),
    anchorHeaderHeight: 330_000,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

function fixture() {
  const sidechainIdHex = '11'.repeat(32);
  const sidechainBlockHash = '22'.repeat(32);
  const trackerIdentity = {
    sidechainIdHex,
    sidechainHeight: 1_024n,
    executionBlockHashHex: sidechainBlockHash,
  };
  const pegOut = {
    user: `0x${'33'.repeat(20)}`,
    amount: 1_000_000n,
    ergoRecipientAddress: `0008cd02${'44'.repeat(32)}`,
    sidechainTxHash: '55'.repeat(32),
    sidechainBlockNumber: 1_024,
    sidechainBlockHash,
    sidechainLogIndex: 7,
  };
  const burnId = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex: pegOut.sidechainTxHash,
    eventIndex: pegOut.sidechainLogIndex,
  });
  const trackerValueHex = canonicalTrackerValue(sidechainIdHex, sidechainBlockHash);
  const prepared = {
    plan: {
      claims: [{
        duplicatePreventionKeyHex: burnId,
        trackerKeyHex: '66'.repeat(32),
        trackerValueHex,
        trackerAnchorHeaderIdHex: '88'.repeat(32),
        ergoAnchorHeight: 330_000,
      }],
      dupInputDigestHex: '99'.repeat(33),
    },
    eip12Tx: {
      inputs: [{ boxId: 'aa'.repeat(32), extension: { 0: '0e20' } }],
      dataInputs: [{ boxId: 'bb'.repeat(32) }],
      outputs: [{
        value: 1_000_000,
        ergoTree: pegOut.ergoRecipientAddress,
        creationHeight: 330_020,
      }],
    },
    trackerBox: { boxId: 'bb'.repeat(32) },
    authenticatedDupBox: { boxId: 'aa'.repeat(32) },
    unlockBox: { boxId: 'cc'.repeat(32) },
  } as any;
  return { burnId, pegOut, prepared, trackerIdentity };
}

describe('authenticated settlement candidate binding', () => {
  it('deterministically binds the burn, tracker, selected inputs, and exact unsigned transaction', () => {
    const input = {
      ...fixture(),
      observedSidechainTip: 1_100,
      observedErgoTip: 330_020,
    };
    const first = buildAuthenticatedSettlementCandidate(input);
    const second = buildAuthenticatedSettlementCandidate(input);
    expect(second).toEqual(first);
    expect(first).toEqual(expect.objectContaining({
      schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
      burnId: input.burnId,
      burnTxHash: input.pegOut.sidechainTxHash,
      sidechainId: input.trackerIdentity.sidechainIdHex,
      sidechainBlockHash: input.pegOut.sidechainBlockHash,
      trackerBoxId: input.prepared.trackerBox.boxId,
      dupInputBoxId: input.prepared.authenticatedDupBox.boxId,
      vaultBoxId: input.prepared.unlockBox.boxId,
      creationHeight: 330_020,
      observedSidechainTip: 1_100n,
      observedErgoTip: 330_020,
    }));
    expect(first.candidateId).toMatch(/^[0-9a-f]{64}$/);
    expect(first.unsignedTxDigest).toMatch(/^[0-9a-f]{64}$/);

    const changed = buildAuthenticatedSettlementCandidate({
      ...input,
      prepared: {
        ...input.prepared,
        eip12Tx: {
          ...input.prepared.eip12Tx,
          outputs: [{
            ...input.prepared.eip12Tx.outputs[0],
            value: 1_000_001,
          }],
        },
      },
    });
    expect(changed.unsignedTxDigest).not.toBe(first.unsignedTxDigest);
    expect(changed.candidateId).not.toBe(first.candidateId);
  });

  it('rejects absent or divergent canonical burn coordinates before journaling', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementCandidate({
      ...f,
      pegOut: { ...f.pegOut, sidechainBlockHash: undefined },
      observedSidechainTip: 1_100,
      observedErgoTip: 330_020,
    })).toThrow(/requires the canonical sidechain block hash/);
    expect(() => buildAuthenticatedSettlementCandidate({
      ...f,
      pegOut: { ...f.pegOut, sidechainBlockHash: 'dd'.repeat(32) },
      observedSidechainTip: 1_100,
      observedErgoTip: 330_020,
    })).toThrow(/do not match tracker identity/);
    expect(() => buildAuthenticatedSettlementCandidate({
      ...f,
      observedSidechainTip: 1_023,
      observedErgoTip: 330_020,
    })).toThrow(/tip precedes the candidate burn block/);
  });

  it.each([
    ['proof system ID', 103],
    ['statement digest', 104],
    ['program ID', 136],
    ['verifier profile ID', 168],
    ['proof payload digest', 200],
    ['aggregate proof digest', 232],
  ])('binds a changed tracker %s into a different candidate identity', (_label, offset) => {
    const input = {
      ...fixture(),
      observedSidechainTip: 1_100,
      observedErgoTip: 330_020,
    };
    const baseline = buildAuthenticatedSettlementCandidate(input);
    const changedValue = Buffer.from(input.prepared.plan.claims[0].trackerValueHex, 'hex');
    changedValue[offset] ^= 0x01;
    const changed = buildAuthenticatedSettlementCandidate({
      ...input,
      prepared: {
        ...input.prepared,
        plan: {
          ...input.prepared.plan,
          claims: [{
            ...input.prepared.plan.claims[0],
            trackerValueHex: changedValue.toString('hex'),
          }],
        },
      },
    });
    expect(changed.candidateId).not.toBe(baseline.candidateId);
  });
});
