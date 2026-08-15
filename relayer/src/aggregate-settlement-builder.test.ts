import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPlan,
  buildBatchSettlementPlan,
  buildTrustlessSingleLeafAggregateUnlockExtension,
  BATCH_UNLOCK_MAX_CLAIMS,
  packClaimCore,
  TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES,
} from './aggregate-settlement-builder.js';
import { encodeCollByteRegister } from './ergo-helpers.js';
import {
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';

const sidechainIdHex = '11'.repeat(32);
const sidechainLogIndex = 7;
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

function entry(n: number): SpvTrackerEntry {
  return {
    sidechainIdHex,
    sidechainHeight: BigInt(1000 + n),
    sidechainHeaderHashHex: n.toString(16).padStart(2, '0').repeat(32),
    bridgeEventRootHex: (0xa0 + n).toString(16).repeat(32),
    ergoAnchorHeight: 330000 + n,
  };
}

const recipientTreeHex = '0008cd02' + '44'.repeat(32);

function blake2b256HexFromHex(hex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(hex, 'hex'), undefined, 32)).toString('hex');
}

function trustlessBurnRootForProof(
  leafHashHex: string,
  proof: TrustlessBurnMerkleProofStep[],
): string {
  const nodeDomain = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');
  let current = Buffer.from(leafHashHex, 'hex');
  for (const step of proof) {
    const sibling = Buffer.from(step.hashHex, 'hex');
    current = Buffer.from(blakejs.blake2b(
      Buffer.concat(step.side === 'left'
        ? [nodeDomain, sibling, current]
        : [nodeDomain, current, sibling]),
      undefined,
      32,
    ));
  }
  return current.toString('hex');
}

function syntheticTrustlessBurnProof(length: number): TrustlessBurnMerkleProofStep[] {
  return Array.from({ length }, (_, index) => ({
    side: index % 2 === 0 ? 'right' : 'left',
    hashHex: (0xa0 + (index % 16)).toString(16).repeat(32),
  }));
}

function claimFor(entryValue: SpvTrackerEntry, txByte: string) {
  return {
    pegOut: {
      user: '0x0000000000000000000000000000000000000001',
      amount: 10_000_000n,
      ergoRecipientAddress: '02' + '44'.repeat(32),
      sidechainTxHash: txByte.repeat(32),
      sidechainBlockNumber: Number(entryValue.sidechainHeight),
      sidechainLogIndex,
    },
    trackerIdentity: {
      sidechainIdHex: entryValue.sidechainIdHex,
      sidechainHeight: entryValue.sidechainHeight,
      sidechainHeaderHashHex: entryValue.sidechainHeaderHashHex,
    },
  };
}

describe('aggregate settlement planner', () => {
  it('rejects claim amounts outside the positive Ergo Long domain', () => {
    const accepted = entry(1);
    for (const amount of [0n, 1n << 63n]) {
      const claim = claimFor(accepted, '55');
      claim.pegOut.amount = amount;
      expect(() => buildAggregateSettlementPlan({
        spvHistory: [toSpvTrackerHistoryEntry(accepted)],
        dupHistoryKeys: [],
        claims: [claim],
      })).toThrow(/positive signed Long/);
    }
  });

  it('plans one SPV ingest plus one claim using the current single-key DUP extension', () => {
    const newEntry = entry(1);
    const plan = buildAggregateSettlementPlan({
      spvHistory: [],
      dupHistoryKeys: [],
      ingests: [newEntry],
      claims: [claimFor(newEntry, '55')],
    });

    expect(plan.trackerIngests).toHaveLength(1);
    expect(plan.claims).toHaveLength(1);
    expect(plan.claims[0].trackerTree).toBe('output');
    expect(plan.dupV1Extension).not.toBeNull();
    expect(plan.requiresBatchedDupContract).toBe(false);
    expect(plan.contractCompatibility).toBe('legacy-aggregate-v1');
    expect(plan.claims[0].duplicatePreventionKeyHex).toBe('55'.repeat(32));
    expect(plan.claims[0].settlementIdentity.source).toBe('legacy-aggregate-root');
    expect(plan.claims[0].settlementIdentity.bridgeEventRootHex).toBe(newEntry.bridgeEventRootHex);
    expect(plan.trackerOutputDigestHex).toHaveLength(66);
    expect(plan.dupOutputDigestHex).toHaveLength(66);
  });

  it('plans a candidate-only trustless settlement identity without changing the legacy default path', () => {
    const accepted = entry(1);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: accepted.bridgeEventRootHex,
          recipientErgoTreeHashHex: '77'.repeat(32),
          amountNanoErg: 10_000_000n,
        },
      }],
    });

    expect(plan.contractCompatibility).toBe('candidate-only-trustless-v2-required');
    expect(plan.claims[0].burnTxIdHex).toBe(burnIdHex);
    expect(plan.claims[0].duplicatePreventionKeyHex).toBe(burnIdHex);
    expect(plan.claims[0].settlementIdentity.source).toBe('trustless-burn-leaf');
    expect(plan.claims[0].settlementIdentity.bridgeEventRootHex).toBe(accepted.bridgeEventRootHex);
    expect(plan.warnings).toContain(
      'Trustless settlement identity is candidate-only until aggregate settlement contracts verify bridge-native burn leaves.',
    );
  });

  it('builds the V2 trustless single-leaf aggregate unlock extension without enabling signing or broadcast', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_000n,
    });
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: leaf.leafHashHex,
    };

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: leaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
        },
      }],
    });

    const extension = buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    });

    expect(plan.contractCompatibility).toBe('candidate-only-trustless-v2-required');
    expect(Object.keys(extension).sort((a, b) => Number(a) - Number(b))).toEqual([
      '0',
      '1',
      '2',
      '3',
    ]);
    const dupLookupProof = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex');
    const dupInsertProof = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex');
    const expectedProofBundle = Buffer.concat([
      Buffer.from('00000000000003e9', 'hex'),
      Buffer.from('0000000000000000', 'hex'),
      Buffer.from(dupLookupProof.length.toString(16).padStart(16, '0'), 'hex'),
      dupLookupProof,
      dupInsertProof,
    ]);
    expect(extension['2']).toBe(encodeCollByteRegister(Buffer.from(leaf.encodedLeafHex, 'hex')));
    expect(extension['3']).toBe(encodeCollByteRegister(expectedProofBundle));
  });

  it('builds the V2 trustless compact aggregate unlock extension with a one-node burn proof', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const siblingBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '56'.repeat(32),
      eventIndex: sidechainLogIndex + 1,
    });
    const proof = buildTrustlessBurnInclusionProof([
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex: siblingBurnIdHex,
        sidechainTxHashHex: '56'.repeat(32),
        eventIndex: sidechainLogIndex + 1,
        recipientErgoTreeHashHex,
        amountNanoErg: 10_000_001n,
      },
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex,
        sidechainTxHashHex: '55'.repeat(32),
        eventIndex: sidechainLogIndex,
        recipientErgoTreeHashHex,
        amountNanoErg: 10_000_000n,
      },
    ], burnIdHex);
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: proof.bridgeEventRootHex,
    };

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: proof.bridgeEventRootHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
          trustlessBurnProof: proof.proof,
        },
      }],
    });

    const extension = buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    });

    const dupLookupProof = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex');
    const dupInsertProof = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex');
    const expectedProofBundle = Buffer.concat([
      Buffer.from('00000000000003e9', 'hex'),
      Buffer.from('0000000000000001', 'hex'),
      Buffer.from(dupLookupProof.length.toString(16).padStart(16, '0'), 'hex'),
      Buffer.from('00', 'hex'),
      Buffer.from(proof.proof[0].hashHex, 'hex'),
      dupLookupProof,
      dupInsertProof,
    ]);
    expect(proof.proof).toEqual([{ side: 'left', hashHex: expect.any(String) }]);
    expect(extension['2']).toBe(encodeCollByteRegister(Buffer.from(proof.leaf.encodedLeafHex, 'hex')));
    expect(extension['3']).toBe(encodeCollByteRegister(expectedProofBundle));
  });

  it('encodes a multi-node trustless burn proof bundle for V2 source-boundary assembly', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const targetBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const siblingABurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '52'.repeat(32),
      eventIndex: sidechainLogIndex - 2,
    });
    const siblingBBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '53'.repeat(32),
      eventIndex: sidechainLogIndex - 1,
    });
    const siblingCBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '56'.repeat(32),
      eventIndex: sidechainLogIndex + 1,
    });
    const proof = buildTrustlessBurnInclusionProof([
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex: siblingABurnIdHex,
        sidechainTxHashHex: '52'.repeat(32),
        eventIndex: sidechainLogIndex - 2,
        recipientErgoTreeHashHex,
        amountNanoErg: 9_999_998n,
      },
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex: siblingBBurnIdHex,
        sidechainTxHashHex: '53'.repeat(32),
        eventIndex: sidechainLogIndex - 1,
        recipientErgoTreeHashHex,
        amountNanoErg: 9_999_999n,
      },
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex: targetBurnIdHex,
        sidechainTxHashHex: '55'.repeat(32),
        eventIndex: sidechainLogIndex,
        recipientErgoTreeHashHex,
        amountNanoErg: 10_000_000n,
      },
      {
        sidechainIdHex,
        sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
        burnIdHex: siblingCBurnIdHex,
        sidechainTxHashHex: '56'.repeat(32),
        eventIndex: sidechainLogIndex + 1,
        recipientErgoTreeHashHex,
        amountNanoErg: 10_000_001n,
      },
    ], targetBurnIdHex);
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: proof.bridgeEventRootHex,
    };

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: targetBurnIdHex,
          bridgeEventRootHex: proof.bridgeEventRootHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
          trustlessBurnProof: proof.proof,
        },
      }],
    });

    const extension = buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    });

    const dupLookupProof = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex');
    const dupInsertProof = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex');
    const encodedProofNodes = Buffer.concat(proof.proof.map(step => Buffer.concat([
      Buffer.from(step.side === 'left' ? '00' : '01', 'hex'),
      Buffer.from(step.hashHex, 'hex'),
    ])));
    const expectedProofBundle = Buffer.concat([
      Buffer.from('00000000000003e9', 'hex'),
      Buffer.from('0000000000000002', 'hex'),
      Buffer.from(dupLookupProof.length.toString(16).padStart(16, '0'), 'hex'),
      encodedProofNodes,
      dupLookupProof,
      dupInsertProof,
    ]);

    expect(proof.proof).toHaveLength(2);
    expect(extension['2']).toBe(encodeCollByteRegister(Buffer.from(proof.leaf.encodedLeafHex, 'hex')));
    expect(extension['3']).toBe(encodeCollByteRegister(expectedProofBundle));
  });

  it('encodes proof bundles up to the trustless contract proof-node cap', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const targetBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex: targetBurnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_000n,
    });
    const proof = syntheticTrustlessBurnProof(TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES);
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: trustlessBurnRootForProof(leaf.leafHashHex, proof),
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: targetBurnIdHex,
          bridgeEventRootHex: accepted.bridgeEventRootHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
          trustlessBurnProof: proof,
        },
      }],
    });

    const extension = buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    });

    const dupLookupProof = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex');
    const dupInsertProof = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex');
    const encodedProofNodes = Buffer.concat(proof.map(step => Buffer.concat([
      Buffer.from(step.side === 'left' ? '00' : '01', 'hex'),
      Buffer.from(step.hashHex, 'hex'),
    ])));
    const expectedProofBundle = Buffer.concat([
      Buffer.from('00000000000003e9', 'hex'),
      Buffer.from(TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES.toString(16).padStart(16, '0'), 'hex'),
      Buffer.from(dupLookupProof.length.toString(16).padStart(16, '0'), 'hex'),
      encodedProofNodes,
      dupLookupProof,
      dupInsertProof,
    ]);

    expect(extension['3']).toBe(encodeCollByteRegister(expectedProofBundle));
  });

  it('rejects proof bundles deeper than the trustless contract proof-node cap', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const targetBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex: targetBurnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_000n,
    });
    const proof = syntheticTrustlessBurnProof(TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES + 1);
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: trustlessBurnRootForProof(leaf.leafHashHex, proof),
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: targetBurnIdHex,
          bridgeEventRootHex: accepted.bridgeEventRootHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
          trustlessBurnProof: proof,
        },
      }],
    });

    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    })).toThrow(
      `trustless compact unlock proof node count 15 exceeds contract cap ${TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES}`,
    );
  });

  it('rejects root-drift trustless candidates before V2 extension encoding', () => {
    const accepted = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: accepted.bridgeEventRootHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
        },
      }],
    });

    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    })).toThrow('trustless compact unlock extension proof must resolve to bridgeEventRootHex');
  });

  it('rejects recipient, amount, and asset-lane drift before V2 extension encoding', () => {
    const acceptedBase = entry(1);
    const recipientErgoTreeHashHex = blake2b256HexFromHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_000n,
    });
    const accepted = {
      ...acceptedBase,
      bridgeEventRootHex: leaf.leafHashHex,
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: leaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
        },
      }],
    });

    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: '0008cd02' + '45'.repeat(32),
      insertProofHex: plan.dupProofs.insert_proof_hex,
    })).toThrow('trustless single-leaf unlock extension recipientErgoTreeHashHex must match recipientErgoTreeHex');

    const amountDriftLeaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_001n,
    });
    const amountDriftPlan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry({
        ...acceptedBase,
        bridgeEventRootHex: amountDriftLeaf.leafHashHex,
      })],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(acceptedBase, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: amountDriftLeaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_001n,
        },
      }],
    });
    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: amountDriftPlan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: amountDriftPlan.dupProofs.insert_proof_hex,
    })).toThrow('trustless single-leaf unlock extension amountNanoErg must match peg-out amount');

    const amountOverflow = 0x8000_0000_0000_0000n;
    const overflowClaim = {
      ...plan.claims[0],
      claim: {
        ...plan.claims[0].claim,
        pegOut: { ...plan.claims[0].claim.pegOut, amount: amountOverflow },
      },
      settlementIdentity: {
        ...plan.claims[0].settlementIdentity,
        amountNanoErg: amountOverflow,
      },
    };
    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: overflowClaim,
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    })).toThrow('trustless single-leaf unlock extension amountNanoErg must fit a positive signed Long');

    const assetIdHex = '99'.repeat(32);
    const assetLeaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: acceptedBase.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 10_000_000n,
      assetIdHex,
    });
    const assetPlan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry({
        ...acceptedBase,
        bridgeEventRootHex: assetLeaf.leafHashHex,
      })],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(acceptedBase, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: assetLeaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: 10_000_000n,
          assetIdHex,
        },
      }],
    });
    expect(() => buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: assetPlan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: assetPlan.dupProofs.insert_proof_hex,
    })).toThrow('trustless single-leaf unlock extension currently supports only the ERG asset lane');
  });

  it('rejects trustless settlement candidates whose root or DUP key drift from the proof identity', () => {
    const accepted = entry(1);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: '55'.repeat(32),
      eventIndex: sidechainLogIndex,
    });

    expect(() => buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: 'c6'.repeat(32),
        },
      }],
    })).toThrow('settlement bridgeEventRootHex must match SPV tracker bridgeEventRootHex');

    expect(() => buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: '55'.repeat(32),
          bridgeEventRootHex: accepted.bridgeEventRootHex,
        },
      }],
    })).toThrow('trustless settlement candidate duplicatePreventionKeyHex must match derived burnIdHex');
  });

  it('requires trustless settlement candidates to expose a bounded sidechain log index', () => {
    const accepted = entry(1);
    const claim = claimFor(accepted, '55');
    delete (claim.pegOut as any).sidechainLogIndex;

    expect(() => buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claim,
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: 'b5'.repeat(32),
          bridgeEventRootHex: accepted.bridgeEventRootHex,
        },
      }],
    })).toThrow('trustless settlement candidate requires sidechainLogIndex to derive burnIdHex');

    expect(() => buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        ...claimFor(accepted, '55'),
        pegOut: {
          ...claimFor(accepted, '55').pegOut,
          sidechainLogIndex: 0x1_0000_0000,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: 'b5'.repeat(32),
          bridgeEventRootHex: accepted.bridgeEventRootHex,
        },
      }],
    })).toThrow('trustless settlement candidate sidechainLogIndex must fit uint32');
  });

  it('flags multi-claim plans as requiring the batched DUP contract shape', () => {
    const first = entry(1);
    const second = entry(2);
    const spvHistory = [
      toSpvTrackerHistoryEntry(first),
      toSpvTrackerHistoryEntry(second),
    ];

    const plan = buildAggregateSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims: [
        claimFor(first, '55'),
        claimFor(second, '66'),
      ],
    });

    expect(plan.trackerIngests).toHaveLength(0);
    expect(plan.claims).toHaveLength(2);
    expect(plan.claims.every(claim => claim.trackerTree === 'input')).toBe(true);
    expect(plan.dupV1Extension).toBeNull();
    expect(plan.requiresBatchedDupContract).toBe(true);
    expect(plan.warnings.some(warning => warning.includes('batched DUP'))).toBe(true);
  });
});

describe('batch settlement planner', () => {
  it('bounds both batch plans and exported claim cores to positive Ergo Long amounts', () => {
    const e1 = entry(1);
    const e2 = entry(2);
    const invalidClaim = claimFor(e1, '55');
    invalidClaim.pegOut.amount = 1n << 63n;
    expect(() => buildBatchSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(e1), toSpvTrackerHistoryEntry(e2)],
      dupHistoryKeys: [],
      claims: [invalidClaim, claimFor(e2, '66')],
      recipientErgoTreeHexes: [recipientTreeHex, recipientTreeHex],
    })).toThrow(/positive signed Long/);

    expect(packClaimCore(
      '11'.repeat(32),
      '22'.repeat(32),
      ERGO_LONG_MAX,
      recipientTreeHex,
      0,
    )).toHaveLength(109);
    for (const amount of [0n, 1n << 63n]) {
      expect(() => packClaimCore(
        '11'.repeat(32),
        '22'.repeat(32),
        amount,
        recipientTreeHex,
        0,
      )).toThrow(/positive signed Long/);
    }
  });

  it('builds a 2-claim batch plan with claim cores and extensions', () => {
    const e1 = entry(1);
    const e2 = entry(2);
    const spvHistory = [toSpvTrackerHistoryEntry(e1), toSpvTrackerHistoryEntry(e2)];

    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims: [claimFor(e1, '55'), claimFor(e2, '66')],
      recipientErgoTreeHexes: [recipientTreeHex, recipientTreeHex],
    });

    expect(plan.claims).toHaveLength(2);
    expect(plan.claimCores).toHaveLength(2);
    expect(plan.claimCores[0]).toHaveLength(109);
    expect(plan.payoutAmounts).toEqual([10_000_000n, 10_000_000n]);
    expect(plan.batchDupExtension['0']).toBeTruthy(); // count
    expect(plan.batchDupExtension['1']).toBeTruthy(); // insert proof
    expect(plan.batchUnlockExtension['0']).toBeTruthy(); // count
    expect(plan.batchUnlockExtension['1']).toBeTruthy(); // insert proof
    expect(plan.requiresBatchedDupContract).toBe(true);
    expect(plan.dupV1Extension).toBeNull();
  });

  it('rejects single-claim input in batch mode', () => {
    const e1 = entry(1);
    const spvHistory = [toSpvTrackerHistoryEntry(e1)];

    expect(() => buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims: [claimFor(e1, '55')],
      recipientErgoTreeHexes: [recipientTreeHex],
    })).toThrow(/at least 2 claims/);
  });

  it('rejects more than 10 claims', () => {
    const entries = Array.from({ length: 11 }, (_, i) => entry(i + 1));
    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const claims = entries.map((e, i) => claimFor(e, (0x30 + i).toString(16).padStart(2, '0')));

    expect(() => buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: claims.map(() => recipientTreeHex),
    })).toThrow(/max is 10/);
  });

  it('hard cap constant equals 10', () => {
    expect(BATCH_UNLOCK_MAX_CLAIMS).toBe(10);
  });

  it('rejects duplicate burn IDs before proof generation', () => {
    const e1 = entry(1);
    const e2 = entry(2);
    const spvHistory = [toSpvTrackerHistoryEntry(e1), toSpvTrackerHistoryEntry(e2)];

    expect(() => buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims: [claimFor(e1, '55'), claimFor(e2, '55')], // duplicate burn TX ID
      recipientErgoTreeHexes: [recipientTreeHex, recipientTreeHex],
    })).toThrow(/Duplicate duplicate-prevention key/);
  });

  it('produces DUP batch extension Var layout matching contract: 0=count, 1=insertProof, 2..21=keys, 22..41=lookups', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry(i + 1));
    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const claims = entries.map((e, i) => claimFor(e, (0x50 + i).toString(16).padStart(2, '0')));

    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: claims.map(() => recipientTreeHex),
    });

    // Count and insert proof
    expect(plan.batchDupExtension['0']).toBeTruthy();
    expect(plan.batchDupExtension['1']).toBeTruthy();
    // Keys at 2..4
    for (let i = 0; i < 3; i++) {
      expect(plan.batchDupExtension[String(2 + i)]).toBeTruthy();
    }
    // Lookup proofs at 22..24
    for (let i = 0; i < 3; i++) {
      expect(plan.batchDupExtension[String(22 + i)]).toBeTruthy();
    }
    // Unused slots should not exist
    expect(plan.batchDupExtension['5']).toBeUndefined();
    expect(plan.batchDupExtension['25']).toBeUndefined();
  });

  it('produces unlock batch extension Var layout matching contract: 0=count, 1=insertProof, 2..11=cores, 12..21=trackerProofs, 22..31=lookups', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry(i + 1));
    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const claims = entries.map((e, i) => claimFor(e, (0x60 + i).toString(16).padStart(2, '0')));

    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: claims.map(() => recipientTreeHex),
    });

    // Count and insert proof
    expect(plan.batchUnlockExtension['0']).toBeTruthy();
    expect(plan.batchUnlockExtension['1']).toBeTruthy();
    // Claim cores at 2..4
    for (let i = 0; i < 3; i++) {
      expect(plan.batchUnlockExtension[String(2 + i)]).toBeTruthy();
    }
    // Tracker proofs at 12..14
    for (let i = 0; i < 3; i++) {
      expect(plan.batchUnlockExtension[String(12 + i)]).toBeTruthy();
    }
    // DUP lookup proofs at 22..24
    for (let i = 0; i < 3; i++) {
      expect(plan.batchUnlockExtension[String(22 + i)]).toBeTruthy();
    }
    // Unused slots
    expect(plan.batchUnlockExtension['5']).toBeUndefined();
    expect(plan.batchUnlockExtension['15']).toBeUndefined();
    expect(plan.batchUnlockExtension['25']).toBeUndefined();
  });
});
