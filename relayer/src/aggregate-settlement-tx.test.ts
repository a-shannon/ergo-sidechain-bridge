import { readFileSync } from 'fs';
import { join } from 'path';
import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPlan,
  buildBatchSettlementPlan,
  buildTrustlessSingleLeafAggregateUnlockExtension,
} from './aggregate-settlement-builder.js';
import {
  buildSingleClaimAggregateSettlementTx,
  buildTrustlessSingleLeafAggregateSettlementTx,
  buildBatchAggregateSettlementTx,
  deriveAggregateBurnEventRoot,
  type BoxLike,
} from './aggregate-settlement-tx.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  EMPTY_AVL_DIGEST,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-helpers.js';
import {
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import { deriveTrustlessBurnIdHex, encodeTrustlessBurnLeaf } from './trustless-burn-proof.js';
import type { TrustlessBurnProofVectorFile } from './trustless-burn-proof-vector.js';

const sidechainIdHex = '11'.repeat(32);
const recipientTreeHex = '0008cd02' + '44'.repeat(32);
const relayerPk = '02' + '99'.repeat(32);
const committee = encodeSigmaPropRegister(relayerPk);

function recipientTreeHashHex(ergoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(ergoTreeHex, 'hex'), undefined, 32)).toString('hex');
}

function entry(n: number, bridgeEventRootHex: string): SpvTrackerEntry {
  return {
    sidechainIdHex,
    sidechainHeight: BigInt(1000 + n),
    sidechainHeaderHashHex: n.toString(16).padStart(2, '0').repeat(32),
    bridgeEventRootHex,
    ergoAnchorHeight: 330000 + n,
  };
}

function box(
  boxId: string,
  ergoTree: string,
  registers: Record<string, string>,
  tokenId?: string,
  value = 2_100_000,
): BoxLike {
  return {
    boxId,
    value,
    ergoTree,
    assets: tokenId ? [{ tokenId, amount: 1 }] : [],
    additionalRegisters: registers,
    creationHeight: 330100,
  };
}

function vaultRegisters(sourceBoxId: string, amount: number): Record<string, string> {
  return {
    R4: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(amount),
    R7: encodeCollByteRegister(Buffer.from(recipientTreeHex, 'hex')),
  };
}

describe('aggregate settlement tx assembly', () => {
  it('keeps the legacy aggregate root distinct from the trustless burn bridgeEventRoot', () => {
    const vector = JSON.parse(
      readFileSync(join(process.cwd(), 'test-vectors', 'trustless-burn-proof-v1.json'), 'utf8'),
    ) as TrustlessBurnProofVectorFile;
    const legacyRoot = deriveAggregateBurnEventRoot(
      '55'.repeat(32),
      '0008cd02' + '77'.repeat(32),
      1_000_000n,
    );

    expect(vector.compat?.liveAggregateSettlementStillUsesLegacyRoot).toBe(true);
    expect(legacyRoot).toBe(vector.compat?.legacyAggregateRootHex);
    expect(vector.expected.bridgeEventRootHex).not.toBe(legacyRoot);
  });

  it('builds a single-claim no-ingest aggregate payout tx', () => {
    const burnTxIdHex = '55'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = entry(1, bridgeEventRootHex);

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    const deployed = {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregate: {
        nftId: 'bb'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'dup-address',
        ergoTreeHex: '1002',
      },
      mainChainAggregateUnlock: {
        address: 'unlock-address',
        ergoTreeHex: '1003',
      },
    };

    const trackerBox = box('10'.repeat(32), '1001', {
      R4: encodeLongRegister(0),
      R5: '64' + plan.trackerInputDigestHex + '07200124',
      R6: committee,
      R7: encodeLongRegister(Number(accepted.sidechainHeight)),
    }, deployed.spvTracker.nftId, 1_000_000);

    const dupBox = box('20'.repeat(32), '1002', {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);

    const unlockBox = box('30'.repeat(32), '1003', {}, '00'.repeat(32), 2_100_000);

    const tx = buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox: dupBox,
      unlockBox,
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(tx.inputs).toHaveLength(3);
    expect(tx.inputs[0].extension).toEqual({});
    expect(tx.inputs[1].extension).toEqual(plan.dupV1Extension);
    expect(tx.inputs[2].extension['0']).toBeTruthy();
    expect(tx.outputs[0].assets[0].tokenId).toBe(deployed.spvTracker.nftId);
    expect(tx.outputs[1].assets[0].tokenId).toBe(deployed.doubleUnlockPreventionAggregate.nftId);
    expect(tx.outputs[2].ergoTree).toBe(recipientTreeHex);
    expect(tx.outputs[2].value).toBe(Number(amount));
  });

  it('rejects candidate-only trustless settlement plans before legacy TX assembly', () => {
    const burnTxIdHex = '55'.repeat(32);
    const sidechainLogIndex = 7;
    const amount = 1_000_000n;
    const trustlessRoot = 'a7'.repeat(32);
    const accepted = entry(1, trustlessRoot);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: burnTxIdHex,
      eventIndex: sidechainLogIndex,
    });
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
          sidechainLogIndex,
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: trustlessRoot,
          recipientErgoTreeHashHex: '77'.repeat(32),
          amountNanoErg: amount,
        },
      }],
    });
    const deployed = {
      spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv-address', ergoTreeHex: '1001' },
      doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '02'.repeat(32), address: 'dup-address', ergoTreeHex: '1002' },
      mainChainAggregateUnlock: { address: 'unlock-address', ergoTreeHex: '1003' },
    };

    expect(() => buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: box('10'.repeat(32), '1001', {
        R4: encodeLongRegister(0),
        R5: '64' + plan.trackerInputDigestHex + '07200124',
        R6: committee,
        R7: encodeLongRegister(Number(accepted.sidechainHeight)),
      }, deployed.spvTracker.nftId, 1_000_000),
      aggregateDupBox: box('20'.repeat(32), '1002', {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: committee,
      }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000),
      unlockBox: box('30'.repeat(32), '1003', {}, '00'.repeat(32), 2_100_000),
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    })).toThrow('aggregate TX assembly requires legacy-aggregate-v1 plan; trustless settlement candidates need V2 contracts');
  });

  it('builds a V2 trustless single-leaf unsigned aggregate payout tx', () => {
    const burnTxIdHex = '55'.repeat(32);
    const sidechainLogIndex = 7;
    const amount = 1_000_000n;
    const recipientErgoTreeHashHex = recipientTreeHashHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: burnTxIdHex,
      eventIndex: sidechainLogIndex,
    });
    const base = entry(1, '00'.repeat(32));
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: base.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: burnTxIdHex,
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: amount,
    });
    const accepted = entry(1, leaf.leafHashHex);
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
          sidechainLogIndex,
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: leaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: amount,
        },
      }],
    });
    expect(plan.contractCompatibility).toBe('candidate-only-trustless-v2-required');

    const deployed = {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregate: {
        nftId: 'bb'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'dup-address',
        ergoTreeHex: '1002',
      },
      mainChainAggregateUnlockTrustless: {
        address: 'trustless-unlock-address',
        ergoTreeHex: '1023',
      },
    };

    const trackerBox = box('10'.repeat(32), '1001', {
      R4: encodeLongRegister(0),
      R5: '64' + plan.trackerInputDigestHex + '07200124',
      R6: committee,
      R7: encodeLongRegister(Number(accepted.sidechainHeight)),
    }, deployed.spvTracker.nftId, 1_000_000);
    const dupBox = box('20'.repeat(32), '1002', {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);
    const unlockBox = box(
      '30'.repeat(32),
      '1023',
      vaultRegisters('31'.repeat(32), 3_100_000),
      undefined,
      3_100_000,
    );

    const tx = buildTrustlessSingleLeafAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox: dupBox,
      unlockBox,
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(tx.inputs).toHaveLength(3);
    expect(tx.inputs[0].extension).toEqual({});
    expect(tx.inputs[1].extension).toEqual(plan.dupV1Extension);
    expect(tx.inputs[2].extension).toEqual(buildTrustlessSingleLeafAggregateUnlockExtension({
      claim: plan.claims[0],
      recipientErgoTreeHex: recipientTreeHex,
      insertProofHex: plan.dupProofs.insert_proof_hex,
    }));
    expect(Object.keys(tx.inputs[2].extension)).toEqual(['0', '1', '2', '3']);
    expect(tx.outputs).toHaveLength(5);
    expect(tx.outputs[0].assets[0].tokenId).toBe(deployed.spvTracker.nftId);
    expect(tx.outputs[1].assets[0].tokenId).toBe(deployed.doubleUnlockPreventionAggregate.nftId);
    expect(tx.outputs[2]).toMatchObject({ value: Number(amount), ergoTree: recipientTreeHex });
    expect(tx.outputs[3]).toMatchObject({
      value: 1_000_000,
      ergoTree: deployed.mainChainAggregateUnlockTrustless.ergoTreeHex,
      additionalRegisters: unlockBox.additionalRegisters,
    });
    expect(tx.outputs[4]).toMatchObject({ value: MINER_FEE, ergoTree: MINER_FEE_TREE });
    const inputTotal = Number(trackerBox.value) + Number(dupBox.value) + Number(unlockBox.value);
    const outputTotal = tx.outputs.reduce((sum, output) => sum + output.value, 0);
    expect(outputTotal).toBe(inputTotal);
  });

  it('rejects legacy aggregate plans before V2 trustless TX assembly', () => {
    const burnTxIdHex = '55'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = entry(1, bridgeEventRootHex);
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    expect(() => buildTrustlessSingleLeafAggregateSettlementTx({
      deployed: {
        spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv-address', ergoTreeHex: '1001' },
        doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '02'.repeat(32), address: 'dup-address', ergoTreeHex: '1002' },
        mainChainAggregateUnlockTrustless: { address: 'trustless-unlock-address', ergoTreeHex: '1023' },
      },
      plan,
      trackerBox: {} as BoxLike,
      aggregateDupBox: {} as BoxLike,
      unlockBox: {} as BoxLike,
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    })).toThrow('trustless single-leaf aggregate TX assembly requires candidate-only-trustless-v2-required plan');
  });

  it('builds a single-claim same-transaction ingest aggregate payout tx', () => {
    const burnTxIdHex = '66'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const newEntry = entry(2, bridgeEventRootHex);
    const deployed = {
      spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv', ergoTreeHex: '1001' },
      doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1002' },
      mainChainAggregateUnlock: { address: 'unlock', ergoTreeHex: '1003' },
    };

    const plan = buildAggregateSettlementPlan({
      spvHistory: [],
      dupHistoryKeys: [],
      ingests: [newEntry],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(newEntry.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: newEntry.sidechainHeight,
          sidechainHeaderHashHex: newEntry.sidechainHeaderHashHex,
        },
      }],
    });

    const tx = buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: box('10'.repeat(32), '1001', {
        R4: encodeLongRegister(0),
        R6: committee,
        R7: encodeLongRegister(0),
      }, deployed.spvTracker.nftId),
      aggregateDupBox: box('20'.repeat(32), '1002', {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: committee,
      }, deployed.doubleUnlockPreventionAggregate.nftId),
      unlockBox: box('30'.repeat(32), '1003', {}, '00'.repeat(32)),
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(plan.claims[0].trackerTree).toBe('output');
    expect(tx.inputs[0].extension).toEqual(plan.trackerIngests[0].trackerExtension);
    expect(tx.inputs[2].extension['7']).toBe(encodeIntRegister(1));
    expect(tx.outputs[0].additionalRegisters.R5).toContain(plan.trackerOutputDigestHex);
    expect(tx.outputs[0].additionalRegisters.R7).toBe(encodeLongRegister(Number(newEntry.sidechainHeight)));
    expect(tx.outputs[2]).toMatchObject({
      value: Number(amount),
      ergoTree: recipientTreeHex,
    });
  });

  it('marks already-ingested claims with tracker input selector', () => {
    const burnTxIdHex = '77'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = entry(3, bridgeEventRootHex);
    const deployed = {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregate: {
        nftId: 'bb'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'dup-address',
        ergoTreeHex: '1002',
      },
      mainChainAggregateUnlock: {
        address: 'unlock-address',
        ergoTreeHex: '1003',
      },
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    const tx = buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: box('10'.repeat(32), '1001', {
        R4: encodeLongRegister(0),
        R5: '64' + plan.trackerInputDigestHex + '07200124',
        R6: committee,
        R7: encodeLongRegister(Number(accepted.sidechainHeight)),
      }, deployed.spvTracker.nftId),
      aggregateDupBox: box('20'.repeat(32), '1002', {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: committee,
      }, deployed.doubleUnlockPreventionAggregate.nftId),
      unlockBox: box('30'.repeat(32), '1003', {}, '00'.repeat(32)),
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(plan.claims[0].trackerTree).toBe('input');
    expect(tx.inputs[0].extension).toEqual({});
    expect(tx.inputs[2].extension['7']).toBe(encodeIntRegister(0));
  });

  it('adds dust unlock change to miner fee to keep aggregate tx balanced', () => {
    const burnTxIdHex = '88'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = entry(4, bridgeEventRootHex);
    const deployed = {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregate: {
        nftId: 'bb'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'dup-address',
        ergoTreeHex: '1002',
      },
      mainChainAggregateUnlock: {
        address: 'unlock-address',
        ergoTreeHex: '1003',
      },
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    const trackerBox = box('10'.repeat(32), '1001', {
      R4: encodeLongRegister(0),
      R5: '64' + plan.trackerInputDigestHex + '07200124',
      R6: committee,
      R7: encodeLongRegister(Number(accepted.sidechainHeight)),
    }, deployed.spvTracker.nftId, 1_000_000);
    const dupBox = box('20'.repeat(32), '1002', {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);
    const dust = 999_999;
    const unlockBox = box(
      '30'.repeat(32),
      '1003',
      {},
      '00'.repeat(32),
      Number(amount) + MINER_FEE + dust,
    );

    const tx = buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox: dupBox,
      unlockBox,
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(tx.outputs.some(output => output.ergoTree === deployed.mainChainAggregateUnlock.ergoTreeHex)).toBe(false);
    expect(tx.outputs.at(-1)).toMatchObject({
      value: MINER_FEE + dust,
      ergoTree: MINER_FEE_TREE,
    });

    const inputTotal = Number(trackerBox.value) + Number(dupBox.value) + Number(unlockBox.value);
    const outputTotal = tx.outputs.reduce((sum, output) => sum + Number(output.value), 0);
    expect(outputTotal).toBe(inputTotal);
  });

  it('rejects aggregate payout amounts outside JavaScript safe integer range', () => {
    const burnTxIdHex = '99'.repeat(32);
    const amount = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = entry(5, bridgeEventRootHex);
    const deployed = {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregate: {
        nftId: 'bb'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'dup-address',
        ergoTreeHex: '1002',
      },
      mainChainAggregateUnlock: {
        address: 'unlock-address',
        ergoTreeHex: '1003',
      },
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    expect(() => buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: box('10'.repeat(32), '1001', {
        R4: encodeLongRegister(0),
        R5: '64' + plan.trackerInputDigestHex + '07200124',
        R6: committee,
        R7: encodeLongRegister(Number(accepted.sidechainHeight)),
      }, deployed.spvTracker.nftId, 1_000_000),
      aggregateDupBox: box('20'.repeat(32), '1002', {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: committee,
      }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000),
      unlockBox: {
        ...box('30'.repeat(32), '1003', {}, '00'.repeat(32), 2_100_000),
        value: BigInt(Number.MAX_SAFE_INTEGER) + 2n,
      },
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    })).toThrow(/payout amount is outside JavaScript safe integer range/);
  });
});

describe('batch aggregate settlement tx assembly', () => {
  function batchEntry(n: number, bridgeEventRootHex: string): SpvTrackerEntry {
    return {
      sidechainIdHex,
      sidechainHeight: BigInt(1000 + n),
      sidechainHeaderHashHex: n.toString(16).padStart(2, '0').repeat(32),
      bridgeEventRootHex,
      ergoAnchorHeight: 330000 + n,
    };
  }

  function batchDeployed() {
    return {
      spvTracker: {
        nftId: 'aa'.repeat(32),
        boxId: '01'.repeat(32),
        address: 'spv-address',
        ergoTreeHex: '1001',
      },
      doubleUnlockPreventionAggregateBatch: {
        nftId: 'cc'.repeat(32),
        boxId: '02'.repeat(32),
        address: 'batch-dup-address',
        ergoTreeHex: '1012',
      },
      mainChainAggregateUnlockBatch: {
        address: 'batch-unlock-address',
        ergoTreeHex: '1013',
      },
    };
  }

  it('rejects candidate-only trustless settlement plans before batch TX assembly', () => {
    const deployed = batchDeployed();
    const e1 = batchEntry(1, 'a1'.repeat(32));
    const e2 = batchEntry(2, 'a2'.repeat(32));
    const sidechainLogIndex1 = 7;
    const sidechainLogIndex2 = 8;
    const burnTxIdHex1 = '55'.repeat(32);
    const burnTxIdHex2 = '66'.repeat(32);
    const plan = buildBatchSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(e1), toSpvTrackerHistoryEntry(e2)],
      dupHistoryKeys: [],
      claims: [
        {
          pegOut: {
            user: '0x0000000000000000000000000000000000000001',
            amount: 1_000_000n,
            ergoRecipientAddress: recipientTreeHex,
            sidechainTxHash: burnTxIdHex1,
            sidechainBlockNumber: Number(e1.sidechainHeight),
            sidechainLogIndex: sidechainLogIndex1,
          },
          trackerIdentity: {
            sidechainIdHex,
            sidechainHeight: e1.sidechainHeight,
            sidechainHeaderHashHex: e1.sidechainHeaderHashHex,
          },
          settlementIdentity: {
            source: 'trustless-burn-leaf',
            duplicatePreventionKeyHex: deriveTrustlessBurnIdHex({
              sidechainIdHex,
              sidechainTxHashHex: burnTxIdHex1,
              eventIndex: sidechainLogIndex1,
            }),
            bridgeEventRootHex: e1.bridgeEventRootHex,
          },
        },
        {
          pegOut: {
            user: '0x0000000000000000000000000000000000000001',
            amount: 1_000_000n,
            ergoRecipientAddress: recipientTreeHex,
            sidechainTxHash: burnTxIdHex2,
            sidechainBlockNumber: Number(e2.sidechainHeight),
            sidechainLogIndex: sidechainLogIndex2,
          },
          trackerIdentity: {
            sidechainIdHex,
            sidechainHeight: e2.sidechainHeight,
            sidechainHeaderHashHex: e2.sidechainHeaderHashHex,
          },
          settlementIdentity: {
            source: 'trustless-burn-leaf',
            duplicatePreventionKeyHex: deriveTrustlessBurnIdHex({
              sidechainIdHex,
              sidechainTxHashHex: burnTxIdHex2,
              eventIndex: sidechainLogIndex2,
            }),
            bridgeEventRootHex: e2.bridgeEventRootHex,
          },
        },
      ],
      recipientErgoTreeHexes: [recipientTreeHex, recipientTreeHex],
    });

    expect(() => buildBatchAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: {} as BoxLike,
      aggregateDupBox: {} as BoxLike,
      unlockBox: {} as BoxLike,
      creationHeight: 330120,
    })).toThrow('aggregate TX assembly requires legacy-aggregate-v1 plan; trustless settlement candidates need V2 contracts');
  });

  it('assembles a 3-claim batch TX with correct input/output shape', () => {
    const deployed = batchDeployed();
    const claimCount = 3;
    const entries: SpvTrackerEntry[] = [];
    const claims: any[] = [];
    const recipientTrees: string[] = [];

    for (let i = 0; i < claimCount; i++) {
      const burnTxIdHex = (0x40 + i).toString(16).padStart(2, '0').repeat(32);
      const amount = 1_000_000n;
      const root = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
      const e = batchEntry(i + 1, root);
      entries.push(e);
      claims.push({
        pegOut: {
          user: '0x0000000000000000000000000000000000000001',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(e.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: e.sidechainHeight,
          sidechainHeaderHashHex: e.sidechainHeaderHashHex,
        },
      });
      recipientTrees.push(recipientTreeHex);
    }

    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: recipientTrees,
    });

    const trackerBox = box(
      '10'.repeat(32), '1001',
      {
        R4: encodeLongRegister(0),
        R5: '64' + plan.trackerInputDigestHex + '07200124',
        R6: committee,
        R7: encodeLongRegister(Number(entries[entries.length - 1].sidechainHeight)),
      },
      deployed.spvTracker.nftId, 1_000_000,
    );
    const dupBox = box(
      '20'.repeat(32), '1012',
      {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: committee,
      },
      deployed.doubleUnlockPreventionAggregateBatch.nftId, 1_000_000,
    );
    // Unlock box: enough for 3 * 1M + fee
    const unlockBox: BoxLike = {
      boxId: '30'.repeat(32),
      value: 3_000_000 + MINER_FEE + 500_000,
      ergoTree: '1013',
      assets: [],
      additionalRegisters: {},
      creationHeight: 330100,
    };

    const tx = buildBatchAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox: dupBox,
      unlockBox,
      creationHeight: 330120,
    });

    // 3 inputs: tracker, DUP, unlock
    expect(tx.inputs).toHaveLength(3);

    // Outputs: tracker(0) + DUP(1) + 3 payouts(2,3,4) + change(5) + fee(6)
    // or if change is dust: tracker(0) + DUP(1) + 3 payouts(2,3,4) + fee(5)
    const payoutOutputs = tx.outputs.filter(o => o.ergoTree === recipientTreeHex);
    expect(payoutOutputs).toHaveLength(3);
    expect(payoutOutputs.every(o => o.value === 1_000_000)).toBe(true);

    // Tracker and DUP successors preserve tokens
    expect(tx.outputs[0].assets[0].tokenId).toBe(deployed.spvTracker.nftId);
    expect(tx.outputs[1].assets[0].tokenId).toBe(deployed.doubleUnlockPreventionAggregateBatch.nftId);

    // Verify TX is balanced
    const inputTotal = Number(trackerBox.value) + Number(dupBox.value) + Number(unlockBox.value);
    const outputTotal = tx.outputs.reduce((sum, output) => sum + Number(output.value), 0);
    expect(outputTotal).toBe(inputTotal);

    // DUP input uses batch extension
    expect(tx.inputs[1].extension).toEqual(plan.batchDupExtension);

    // Unlock input uses batch unlock extension
    expect(tx.inputs[2].extension).toEqual(plan.batchUnlockExtension);
  });

  it('rejects batch TX when unlock box is underfunded for total payout', () => {
    const deployed = batchDeployed();
    const entries = [batchEntry(1, 'aa'.repeat(32)), batchEntry(2, 'bb'.repeat(32))];
    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const claims = entries.map((e, i) => ({
      pegOut: {
        user: '0x01',
        amount: 50_000_000n,
        ergoRecipientAddress: recipientTreeHex,
        sidechainTxHash: (0x70 + i).toString(16).padStart(2, '0').repeat(32),
        sidechainBlockNumber: Number(e.sidechainHeight),
      },
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: e.sidechainHeight,
        sidechainHeaderHashHex: e.sidechainHeaderHashHex,
      },
    }));

    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: [recipientTreeHex, recipientTreeHex],
    });

    const trackerBox = box('10'.repeat(32), '1001', {
      R4: encodeLongRegister(0),
      R5: '64' + plan.trackerInputDigestHex + '07200124',
      R6: committee,
      R7: encodeLongRegister(1001),
    }, deployed.spvTracker.nftId, 1_000_000);
    const dupBox = box('20'.repeat(32), '1012', {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregateBatch.nftId, 1_000_000);
    const unlockBox: BoxLike = {
      boxId: '30'.repeat(32),
      value: 10_000_000, // Not enough for 2 * 50M + fee
      ergoTree: '1013',
      assets: [],
      additionalRegisters: {},
      creationHeight: 330100,
    };

    expect(() => buildBatchAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox: dupBox,
      unlockBox,
      creationHeight: 330120,
    })).toThrow(/does not cover total payout/);
  });
});
