import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import {
  buildAuthenticatedSettlementPlan,
  buildTrustlessSingleLeafAggregateUnlockExtension,
  type AggregateSettlementClaim,
} from './aggregate-settlement-builder.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  buildAuthenticatedSpvTrackerGetProof,
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './trustless-burn-proof.js';

const SIDECHAIN_ID_HEX = '11'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '22'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const SIDECHAIN_TX_HASH_HEX = '33'.repeat(32);
const SIDECHAIN_LOG_INDEX = 7;
const RECIPIENT_ERGO_TREE_HEX = `0008cd02${'44'.repeat(32)}`;
const RECIPIENT_ERGO_TREE_HASH_HEX = Buffer.from(
  blakejs.blake2b(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'), undefined, 32),
).toString('hex');

function canonicalTrackerValue(bridgeEventRootHex: string): string {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    sidechainConsensusBlockHashHex: '21'.repeat(32),
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    bridgeEventRootHex,
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '23'.repeat(32),
    finalityProofHashHex: '24'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '25'.repeat(32),
    finalityHorizonHeight: SIDECHAIN_HEIGHT,
    finalityHorizonHashHex: '26'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '27'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('authenticated-settlement-builder-proof', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '66'.repeat(32),
    anchorHeaderHeight: 900_000,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

function fixture() {
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: SIDECHAIN_LOG_INDEX,
  });
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    burnIdHex,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: SIDECHAIN_LOG_INDEX,
    recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH_HEX,
    amountNanoErg: 10_000_000n,
  });
  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const trackerValueHex = canonicalTrackerValue(leaf.leafHashHex);
  const claim: AggregateSettlementClaim = {
    pegOut: {
      user: '0x0000000000000000000000000000000000000001',
      amount: 10_000_000n,
      ergoRecipientAddress: `02${'44'.repeat(32)}`,
      sidechainTxHash: SIDECHAIN_TX_HASH_HEX,
      sidechainBlockNumber: Number(SIDECHAIN_HEIGHT),
      sidechainLogIndex: SIDECHAIN_LOG_INDEX,
    },
    trackerIdentity: {
      sidechainIdHex: SIDECHAIN_ID_HEX,
      sidechainHeight: SIDECHAIN_HEIGHT,
      sidechainHeaderHashHex: EXECUTION_BLOCK_HASH_HEX,
    },
    settlementIdentity: {
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: burnIdHex,
      bridgeEventRootHex: leaf.leafHashHex,
      recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH_HEX,
      amountNanoErg: 10_000_000n,
      trustlessBurnProof: [],
    },
  };
  return {
    burnIdHex,
    claim,
    leaf,
    trackerHistory: [{ key: trackerKeyHex, value: trackerValueHex }],
    trackerKeyHex,
    trackerValueHex,
  };
}

describe('authenticated V2 settlement builder', () => {
  it('builds a pure single-claim data-input plan and retains the full proof-bound tracker value', () => {
    const f = fixture();
    const expectedDup = insertLockRecord([], f.burnIdHex);
    const membership = buildAuthenticatedSpvTrackerGetProof(f.trackerHistory, {
      sidechainIdHex: SIDECHAIN_ID_HEX,
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    });
    const plan = buildAuthenticatedSettlementPlan({
      spvHistory: f.trackerHistory,
      dupHistoryKeys: [],
      claim: f.claim,
    });

    expect(plan.contractCompatibility).toBe('authenticated-v2');
    expect(plan.trackerInputDigestHex).toBe(plan.trackerOutputDigestHex);
    expect(plan.trackerIngests).toEqual([]);
    expect(plan.claims[0].trackerTree).toBe('data-input');
    expect(plan.claims[0].trackerKeyHex).toBe(f.trackerKeyHex);
    expect(plan.claims[0].trackerProofHex).toBe(membership.getProofHex);
    expect(plan.claims[0].trackerValueHex).toBe(f.trackerValueHex);
    expect(Buffer.from(plan.claims[0].trackerValueHex, 'hex')).toHaveLength(264);
    expect(plan.claims[0].bridgeEventRootHex).toBe(f.leaf.leafHashHex);
    expect(plan.claims[0].trackerCheckpointCommitmentHex)
      .toBe(plan.claims[0].trackerValueHex.slice(64, 128));
    expect(plan.claims[0].trackerAnchorHeaderIdHex).toBe('66'.repeat(32));
    expect(plan.claims[0].ergoAnchorHeight).toBe(900_000);
    expect(plan.claims[0].duplicatePreventionKeyHex).toBe(f.burnIdHex);
    expect(plan.claims[0].dupLookupProofHex).toBe(expectedDup.lookup_proof_hex);
    expect(plan.dupInputDigestHex).toBe(getDupTreeDigest([]));
    expect(plan.dupInputDigestHex).not.toBe(plan.dupOutputDigestHex);
    expect(plan.dupProofs.insert_proof_hex).toBe(expectedDup.insert_proof_hex);

    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    })).not.toThrow();
  });

  it('rejects a burn proof that does not resolve to the authenticated event root', () => {
    const f = fixture();
    const claim = {
      ...f.claim,
      settlementIdentity: {
        ...f.claim.settlementIdentity!,
        trustlessBurnProof: [{ side: 'right' as const, hashHex: '77'.repeat(32) }],
      },
    };
    expect(() => buildAuthenticatedSettlementPlan({
      spvHistory: f.trackerHistory,
      dupHistoryKeys: [],
      claim,
    })).toThrow('burn proof must resolve to bridgeEventRootHex');
  });

  it('rejects history that does not contain the V2 key derived from the execution hash', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementPlan({
      spvHistory: [{ key: '88'.repeat(32), value: f.trackerValueHex }],
      dupHistoryKeys: [],
      claim: f.claim,
    })).toThrow('does not contain the derived V2 key');
  });

  it('rejects a burn ID that is already present in DUP history', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementPlan({
      spvHistory: f.trackerHistory,
      dupHistoryKeys: [f.burnIdHex],
      claim: f.claim,
    })).toThrow('burnId is already present in DUP history');
  });

  it('rejects settlement value drift from the authenticated proof-bound tracker value', () => {
    const f = fixture();
    const claim = {
      ...f.claim,
      settlementIdentity: {
        ...f.claim.settlementIdentity!,
        bridgeEventRootHex: '99'.repeat(32),
      },
    };
    expect(() => buildAuthenticatedSettlementPlan({
      spvHistory: f.trackerHistory,
      dupHistoryKeys: [],
      claim,
    })).toThrow('must match authenticated SPV tracker bridgeEventRootHex');
  });

  it('rejects amounts that ErgoScript would decode outside a positive signed Long', () => {
    const f = fixture();
    const amount = 0x8000_0000_0000_0000n;
    const claim = {
      ...f.claim,
      pegOut: { ...f.claim.pegOut, amount },
      settlementIdentity: { ...f.claim.settlementIdentity!, amountNanoErg: amount },
    };
    expect(() => buildAuthenticatedSettlementPlan({
      spvHistory: f.trackerHistory,
      dupHistoryKeys: [],
      claim,
    })).toThrow('must fit a positive signed Long');
  });
});
