import blakejs from 'blakejs';
import { describe, expect, it, vi } from 'vitest';

import {
  AggregateSettlementService,
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance,
  prepareAuthenticatedSettlementUnsignedTxPure,
} from './aggregate-settlement-service.js';
import {
  prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-candidate.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-helpers.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './trustless-burn-proof.js';

const SIDECHAIN_ID_HEX = '11'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '22'.repeat(32);
const SIDECHAIN_TX_HASH_HEX = '33'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const SIDECHAIN_LOG_INDEX = 7;
const ANCHOR_HEIGHT = 330_000;
const RECIPIENT_ERGO_TREE_HEX = `0008cd02${'44'.repeat(32)}`;
const RECIPIENT_HASH_HEX = Buffer.from(
  blakejs.blake2b(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'), undefined, 32),
).toString('hex');
const FINALITY_ATTESTOR_METADATA = encodeSigmaPropRegister(
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
);
const BRIDGE_COMMITTEE_METADATA = encodeSigmaPropRegister(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);

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
    payload: Buffer.from('authenticated-settlement-service-proof', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '66'.repeat(32),
    anchorHeaderHeight: ANCHOR_HEIGHT,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

function box(
  boxId: string,
  ergoTree: string,
  value: number,
  registers: Record<string, string>,
  tokenId?: string,
): BoxLike {
  return {
    boxId,
    value,
    ergoTree,
    assets: tokenId ? [{ tokenId, amount: 1 }] : [],
    additionalRegisters: registers,
    creationHeight: ANCHOR_HEIGHT,
    transactionId: boxId,
    index: 0,
  };
}

function fixture() {
  const amount = 1_000_000n;
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
    recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
    amountNanoErg: amount,
  });
  const trackerIdentity = {
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  };
  const trackerHistory = [{
    key: deriveAuthenticatedSpvTrackerKey(trackerIdentity),
    value: canonicalTrackerValue(leaf.leafHashHex),
  }];
  const deployed = {
    network: 'testnet',
    deployedAt: new Date(0).toISOString(),
    sideChainState: { nftId: '01'.repeat(32), boxId: '01'.repeat(32), address: 'scs', ergoTreeHex: '1000' },
    doubleUnlockPrevention: { nftId: '02'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1001' },
    spvTrackerAuthenticated: {
      nftId: 'aa'.repeat(32),
      boxId: '03'.repeat(32),
      address: 'spv-authenticated',
      ergoTreeHex: '1002',
    },
    doubleUnlockPreventionAuthenticated: {
      nftId: 'bb'.repeat(32),
      boxId: '04'.repeat(32),
      address: 'dup-authenticated',
      ergoTreeHex: '1003',
    },
    mainChainAggregateUnlockAuthenticated: {
      address: 'unlock-authenticated',
      ergoTreeHex: '1004',
    },
    mainChainLock: { address: 'lock', ergoTreeHex: '1005' },
    mainChainUnlock: { address: 'unlock', ergoTreeHex: '1006' },
    relayer: { address: 'relayer', publicKey: `02${'88'.repeat(32)}` },
  };
  const trackerBox = box('10'.repeat(32), deployed.spvTrackerAuthenticated.ergoTreeHex, 1_000_000, {
    R4: encodeLongRegister(1),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(getAuthenticatedSpvTrackerDigest(trackerHistory)),
    R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
    R7: encodeLongRegister(SIDECHAIN_HEIGHT),
    R8: encodeIntRegister(ANCHOR_HEIGHT + 1),
    R9: FINALITY_ATTESTOR_METADATA,
  }, deployed.spvTrackerAuthenticated.nftId);
  const authenticatedDupBox = box(
    '20'.repeat(32),
    deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
    1_000_000,
    {
      R4: encodeLongRegister(3),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: BRIDGE_COMMITTEE_METADATA,
    },
    deployed.doubleUnlockPreventionAuthenticated.nftId,
  );
  const unlockBox = box('30'.repeat(32), deployed.mainChainAggregateUnlockAuthenticated.ergoTreeHex, 3_100_000, {
    R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(3_100_000),
    R7: encodeCollByteRegister(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex')),
  });
  const pegOut = {
    user: '0x0000000000000000000000000000000000000001',
    amount,
    ergoRecipientAddress: RECIPIENT_ERGO_TREE_HEX,
    sidechainTxHash: SIDECHAIN_TX_HASH_HEX,
    sidechainBlockNumber: Number(SIDECHAIN_HEIGHT),
    sidechainLogIndex: SIDECHAIN_LOG_INDEX,
  };
  const settlementIdentity = {
    source: 'trustless-burn-leaf' as const,
    duplicatePreventionKeyHex: burnIdHex,
    bridgeEventRootHex: leaf.leafHashHex,
    recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
    amountNanoErg: amount,
    trustlessBurnProof: [],
  };
  return {
    amount,
    authenticatedDupBox,
    deployed,
    pegOut,
    settlementIdentity,
    trackerBox,
    trackerHistory,
    trackerIdentity,
    unlockBox,
  };
}

function serviceFixture(status: 'confirmed' | 'reverted' | 'unknown' = 'confirmed') {
  const f = fixture();
  const updatePegOutStatus = vi.fn();
  const markPegOutBurnRevertedAndInvalidateCandidates = vi.fn();
  const signAndSubmit = vi.fn(async () => {
    throw new Error('authenticated unsigned preparation must not sign or submit');
  });
  const service = new AggregateSettlementService({
    ergo: {
      addressToTree: async () => { throw new Error('raw recipient tree must not use address conversion'); },
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === f.deployed.spvTrackerAuthenticated.nftId) return f.trackerBox;
        if (tokenId === f.deployed.doubleUnlockPreventionAuthenticated.nftId) return f.authenticatedDupBox;
        throw new Error(`unexpected singleton token ${tokenId}`);
      },
      getCurrentHeight: async () => ANCHOR_HEIGHT + 20,
      getTransaction: async () => null,
      getUnspentBoxesByAddress: async () => [f.unlockBox],
    },
    state: {
      getAllAvlKeys: () => { throw new Error('legacy DUP history must not feed authenticated V2'); },
      getAuthenticatedV2DupHistory: () => [],
      getAuthenticatedSpvTrackerHistory: () => f.trackerHistory,
      markPegOutBurnRevertedAndInvalidateCandidates,
      updatePegOutStatus,
    },
    deployed: f.deployed,
    verifySidechainBurn: async () => status,
    signAndSubmit,
  } as any);
  return {
    ...f,
    service,
    signAndSubmit,
    markPegOutBurnRevertedAndInvalidateCandidates,
    updatePegOutStatus,
  };
}

describe('authenticated V2 settlement service activation', () => {
  it('keeps profile preparation canonical while EIP-12 materialization and provenance stay outside', () => {
    const f = fixture();
    const input = {
      contractIdentities: {
        tracker: {
          nftId: f.deployed.spvTrackerAuthenticated.nftId,
          ergoTreeHex: f.deployed.spvTrackerAuthenticated.ergoTreeHex,
        },
        duplicatePrevention: {
          nftId: f.deployed.doubleUnlockPreventionAuthenticated.nftId,
          ergoTreeHex: f.deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
        },
        vault: {
          ergoTreeHex: f.deployed.mainChainAggregateUnlockAuthenticated.ergoTreeHex,
        },
      },
      trackerBox: f.trackerBox,
      authenticatedDupBox: f.authenticatedDupBox,
      unlockBox: f.unlockBox,
      trackerHistory: f.trackerHistory,
      dupHistoryKeys: [],
      pegOut: f.pegOut,
      trackerIdentity: f.trackerIdentity,
      settlementIdentity: f.settlementIdentity,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: ANCHOR_HEIGHT + 20,
    };
    const profilePrepared =
      prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx(input);
    const compatibilityPrepared = prepareAuthenticatedSettlementUnsignedTxPure(input);

    expect(profilePrepared.plan).toEqual(compatibilityPrepared.plan);
    expect(profilePrepared.unsignedTx).toEqual(compatibilityPrepared.unsignedTx);
    expect('eip12Tx' in profilePrepared).toBe(false);
    expect('contextExtensionGuard' in profilePrepared).toBe(false);
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(
      profilePrepared,
    )).toThrow(/transaction provenance/i);
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(
      compatibilityPrepared,
    )).toThrow(/transaction provenance/i);
  });

  it('prepares the exact two-input transaction without signing, checking, or broadcasting', async () => {
    const f = serviceFixture();
    const prepared = await f.service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: f.pegOut,
      trackerIdentity: f.trackerIdentity,
      settlementIdentity: f.settlementIdentity,
      creationHeight: ANCHOR_HEIGHT + 20,
    });

    expect(prepared.plan.contractCompatibility).toBe('authenticated-v2');
    expect(prepared.plan.claims[0].trackerTree).toBe('data-input');
    expect(prepared.eip12Tx.inputs).toHaveLength(2);
    expect(prepared.eip12Tx.inputs[0].boxId).toBe(f.authenticatedDupBox.boxId);
    expect(prepared.eip12Tx.inputs[1].boxId).toBe(f.unlockBox.boxId);
    expect(prepared.eip12Tx.dataInputs).toEqual([f.trackerBox]);
    expect(prepared.eip12Tx.outputs[0].assets[0].tokenId).toBe(
      f.deployed.doubleUnlockPreventionAuthenticated.nftId,
    );
    expect(prepared.eip12Tx.outputs[1]).toMatchObject({
      value: Number(f.amount),
      ergoTree: RECIPIENT_ERGO_TREE_HEX,
    });
    expect(prepared.contextExtensionGuard).toMatchObject({
      status: 'pass',
      signingPermitted: false,
      broadcastPermitted: false,
    });
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(
      prepared,
    )).not.toThrow();
    expect(() => assertPreparedAuthenticatedSettlementUnsignedTxProvenance(
      structuredClone(prepared),
    )).toThrow(/transaction provenance/i);
    expect(f.signAndSubmit).not.toHaveBeenCalled();
    expect(f.updatePegOutStatus).not.toHaveBeenCalled();
  });

  it('marks a disappeared burn reverted and refuses to select any Ergo box', async () => {
    const f = serviceFixture('reverted');
    await expect(f.service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: f.pegOut,
      trackerIdentity: f.trackerIdentity,
      settlementIdentity: f.settlementIdentity,
    })).rejects.toThrow('requires a freshly confirmed sidechain burn');
    expect(f.markPegOutBurnRevertedAndInvalidateCandidates).toHaveBeenCalledWith(
      {
        burnTxHash: SIDECHAIN_TX_HASH_HEX,
        sidechainLogIndex: 7,
      },
      'fresh sidechain burn verification invalidated the settlement candidate',
    );
    expect(f.updatePegOutStatus).not.toHaveBeenCalled();
    expect(f.signAndSubmit).not.toHaveBeenCalled();
  });

  it('refuses unknown burn status and insufficient Ergo anchor depth', async () => {
    const unknown = serviceFixture('unknown');
    await expect(unknown.service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: unknown.pegOut,
      trackerIdentity: unknown.trackerIdentity,
      settlementIdentity: unknown.settlementIdentity,
    })).rejects.toThrow('requires a freshly confirmed sidechain burn');
    expect(unknown.updatePegOutStatus).not.toHaveBeenCalled();

    const shallow = serviceFixture();
    await expect(shallow.service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: shallow.pegOut,
      trackerIdentity: shallow.trackerIdentity,
      settlementIdentity: shallow.settlementIdentity,
      creationHeight: ANCHOR_HEIGHT + 9,
    })).rejects.toThrow('requires 10 Ergo confirmations');
  });

  it('rejects tracker singleton drift from the separately reconstructed V2 history', async () => {
    const f = serviceFixture();
    f.trackerBox.additionalRegisters!.R5 = encodeAuthenticatedSpvTrackerAvlRegister('99'.repeat(33));
    await expect(f.service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: f.pegOut,
      trackerIdentity: f.trackerIdentity,
      settlementIdentity: f.settlementIdentity,
      creationHeight: ANCHOR_HEIGHT + 20,
    })).rejects.toThrow('tracker box R5 does not match the plan input digest');
    expect(f.signAndSubmit).not.toHaveBeenCalled();
  });
});
