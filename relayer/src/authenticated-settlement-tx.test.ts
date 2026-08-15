import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import { buildAuthenticatedSettlementPlan } from './aggregate-settlement-builder.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  buildAuthenticatedSettlementTx,
  buildCausalAuthenticatedSettlementTx,
  type BoxLike,
} from './aggregate-settlement-tx.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE,
  MINER_FEE_TREE,
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
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './trustless-burn-proof.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';

const SIDECHAIN_ID_HEX = '11'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '22'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const SIDECHAIN_TX_HASH_HEX = '33'.repeat(32);
const SIDECHAIN_LOG_INDEX = 7;
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
const CAUSAL_SOURCE_NETWORK_ID_HEX = '88'.repeat(32);
const CAUSAL_ADMISSION_PROFILE_ID_HEX = '99'.repeat(32);

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
    payload: Buffer.from('authenticated-settlement-tx-proof', 'ascii'),
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

function box(
  boxId: string,
  ergoTree: string,
  value: number | string | bigint,
  registers: Record<string, string>,
  tokenId?: string,
): BoxLike {
  return {
    boxId,
    value,
    ergoTree,
    assets: tokenId ? [{ tokenId, amount: 1 }] : [],
    additionalRegisters: registers,
    creationHeight: 900_000,
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
  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const trackerValueHex = canonicalTrackerValue(leaf.leafHashHex);
  const plan = buildAuthenticatedSettlementPlan({
    spvHistory: [{ key: trackerKeyHex, value: trackerValueHex }],
    dupHistoryKeys: [],
    claim: {
      pegOut: {
        user: '0x0000000000000000000000000000000000000001',
        amount,
        ergoRecipientAddress: RECIPIENT_ERGO_TREE_HEX,
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
        recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
        amountNanoErg: amount,
        trustlessBurnProof: [],
      },
    },
  });
  const deployed = {
    spvTrackerAuthenticated: {
      nftId: 'aa'.repeat(32),
      boxId: '01'.repeat(32),
      address: 'tracker-v2',
      ergoTreeHex: '1001',
    },
    doubleUnlockPreventionAuthenticated: {
      nftId: 'bb'.repeat(32),
      boxId: '02'.repeat(32),
      address: 'dup-v2',
      ergoTreeHex: '1002',
    },
    mainChainAggregateUnlockAuthenticated: {
      address: 'unlock-v2',
      ergoTreeHex: '1003',
    },
  };
  const trackerBox = box('10'.repeat(32), '1001', 1_000_000, {
    R4: encodeLongRegister(1),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
    R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
    R7: encodeLongRegister(SIDECHAIN_HEIGHT),
    R8: encodeIntRegister(900_001),
    R9: FINALITY_ATTESTOR_METADATA,
  }, deployed.spvTrackerAuthenticated.nftId);
  const duplicatePreventionBox = box('20'.repeat(32), '1002', 1_000_000, {
    R4: encodeLongRegister(3),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: BRIDGE_COMMITTEE_METADATA,
  }, deployed.doubleUnlockPreventionAuthenticated.nftId);
  const unlockBox = box('30'.repeat(32), '1003', 3_100_000, {
    R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(3_100_000),
    R7: encodeCollByteRegister(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex')),
  });
  return { amount, deployed, duplicatePreventionBox, plan, trackerBox, unlockBox };
}

function causalFixture(vaultValue?: number | string | bigint) {
  const base = fixture();
  const causalVaultValue = vaultValue ?? base.unlockBox.value;
  const causalDupNftId = 'cc'.repeat(32);
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: CAUSAL_SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    bridgeAddressHex: '12'.repeat(20),
    tokenAddressHex: '13'.repeat(20),
    settlementProfileIdHex: '14'.repeat(32),
    admissionProfileIdHex: CAUSAL_ADMISSION_PROFILE_ID_HEX,
    sourceAssetIdHex: '00'.repeat(32),
    amountNanoErg: causalVaultValue,
    recipientAddressHex: '15'.repeat(20),
  }).slice(2);
  const unlockBox = box('32'.repeat(32), '1004', causalVaultValue, {
    R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
    R5: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
  });
  const duplicatePreventionBox = box('21'.repeat(32), '1005', 1_000_000, {
    ...base.duplicatePreventionBox.additionalRegisters,
  }, causalDupNftId);
  return {
    ...base,
    duplicatePreventionBox,
    sourceIntentHex,
    unlockBox,
    deployed: {
      spvTrackerAuthenticated: base.deployed.spvTrackerAuthenticated,
      doubleUnlockPreventionCausalV2: {
        nftId: causalDupNftId,
        boxId: '03'.repeat(32),
        address: 'causal-dup-v2',
        ergoTreeHex: '1005',
      },
      mainChainCausalVaultV2: {
        address: 'causal-vault-v2',
        ergoTreeHex: '1004',
      },
    },
  };
}

describe('authenticated V2 settlement transaction assembly', () => {
  it('builds an atomic payout with a read-only tracker and full DUP successor', () => {
    const f = fixture();
    const tx = buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    });

    expect(tx.inputs).toHaveLength(2);
    expect(tx.inputs[0]).toEqual({
      boxId: f.duplicatePreventionBox.boxId,
      extension: f.plan.dupV1Extension,
    });
    expect(Object.keys(tx.inputs[1].extension)).toEqual(['0', '1', '2', '3']);
    expect(tx.dataInputs).toEqual([{ boxId: f.trackerBox.boxId }]);
    expect(tx.outputs).toHaveLength(4);
    expect(tx.outputs[0]).toMatchObject({
      value: 1_000_000,
      ergoTree: f.deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
      assets: [{ tokenId: f.deployed.doubleUnlockPreventionAuthenticated.nftId, amount: 1 }],
    });
    expect(tx.outputs[0].additionalRegisters).toEqual({
      R4: encodeLongRegister(4),
      R5: encodeAvlTreeRegister(Buffer.from(f.plan.dupOutputDigestHex, 'hex'), 0x0b, 1),
      R6: BRIDGE_COMMITTEE_METADATA,
    });
    expect(tx.outputs[1]).toMatchObject({
      value: Number(f.amount),
      ergoTree: RECIPIENT_ERGO_TREE_HEX,
    });
    expect(tx.outputs[2]).toMatchObject({
      value: 1_000_000,
      ergoTree: f.deployed.mainChainAggregateUnlockAuthenticated.ergoTreeHex,
      additionalRegisters: f.unlockBox.additionalRegisters,
    });
    expect(tx.outputs[3]).toMatchObject({ value: MINER_FEE, ergoTree: MINER_FEE_TREE });

    const inputValue = Number(f.duplicatePreventionBox.value) + Number(f.unlockBox.value);
    const outputValue = tx.outputs.reduce((total, output) => total + output.value, 0);
    expect(outputValue).toBe(inputValue);
  });

  it('rejects tracker and DUP boxes that reuse one authority proposition', () => {
    const f = fixture();
    const duplicatePreventionBox = {
      ...f.duplicatePreventionBox,
      additionalRegisters: {
        ...f.duplicatePreventionBox.additionalRegisters,
        R6: f.trackerBox.additionalRegisters!.R9,
      },
    };

    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow(/distinct tracker finality-attestor and bridge-committee/i);
  });

  it('rejects noncanonical, wrongly typed, malformed, or missing authority registers', () => {
    const build = (trackerBox: BoxLike, duplicatePreventionBox: BoxLike) => {
      const f = fixture();
      return () => buildAuthenticatedSettlementTx({
        deployed: f.deployed,
        plan: f.plan,
        trackerBox,
        duplicatePreventionBox,
        unlockBox: f.unlockBox,
        recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
        creationHeight: 900_020,
      });
    };

    {
      const f = fixture();
      const trackerBox = structuredClone(f.trackerBox);
      trackerBox.additionalRegisters!.R9 = `${FINALITY_ATTESTOR_METADATA}00`;
      expect(build(trackerBox, f.duplicatePreventionBox))
        .toThrow(/fully consumed canonical proveDlog/i);
    }
    {
      const f = fixture();
      const duplicatePreventionBox = structuredClone(f.duplicatePreventionBox);
      duplicatePreventionBox.additionalRegisters!.R6 = encodeCollByteRegister(Buffer.from('01', 'hex'));
      expect(build(f.trackerBox, duplicatePreventionBox))
        .toThrow(/fully consumed canonical proveDlog/i);
    }
    {
      const f = fixture();
      const trackerBox = structuredClone(f.trackerBox);
      trackerBox.additionalRegisters!.R9 = `08cd04${'11'.repeat(32)}`;
      expect(build(trackerBox, f.duplicatePreventionBox))
        .toThrow(/compressed secp256k1/i);
    }
    {
      const f = fixture();
      const duplicatePreventionBox = structuredClone(f.duplicatePreventionBox);
      delete duplicatePreventionBox.additionalRegisters!.R6;
      expect(build(f.trackerBox, duplicatePreventionBox))
        .toThrow(/authenticated DUP box missing R6/i);
    }
  });

  it('rejects tracker state that is not the exact authenticated plan input', () => {
    const f = fixture();
    const trackerBox = {
      ...f.trackerBox,
      additionalRegisters: {
        ...f.trackerBox.additionalRegisters,
        R5: encodeAuthenticatedSpvTrackerAvlRegister('99'.repeat(33)),
      },
    };
    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow('tracker box R5 does not match');
  });

  it('rejects DUP state drift before assembling a transaction', () => {
    const f = fixture();
    const duplicatePreventionBox = {
      ...f.duplicatePreventionBox,
      additionalRegisters: {
        ...f.duplicatePreventionBox.additionalRegisters,
        R5: encodeAvlTreeRegister(Buffer.from('88'.repeat(33), 'hex'), 0x0b, 1),
      },
    };
    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow('DUP box R5 does not match');

    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: {
        ...f.duplicatePreventionBox,
        additionalRegisters: {
          ...f.duplicatePreventionBox.additionalRegisters,
          R5: encodeAvlTreeRegister(Buffer.from(f.plan.dupInputDigestHex, 'hex'), 0x02, 1),
        },
      },
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow('must permit append-only inserts');
  });

  it('rejects wrong-chain tracker metadata and wrong contract instances', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: {
        ...f.trackerBox,
        additionalRegisters: {
          ...f.trackerBox.additionalRegisters,
          R6: encodeCollByteRegister(Buffer.from('ff'.repeat(32), 'hex')),
        },
      },
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow('claim sidechain ID');

    expect(() => buildAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: { ...f.unlockBox, ergoTree: '10ff' },
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      creationHeight: 900_020,
    })).toThrow('vault ErgoTree does not match');
  });
});

describe('causal authenticated settlement transaction assembly', () => {
  function build(overrides: Record<string, unknown> = {}) {
    const f = causalFixture();
    return buildCausalAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      expectedSourceNetworkIdHex: CAUSAL_SOURCE_NETWORK_ID_HEX,
      expectedAdmissionProfileIdHex: CAUSAL_ADMISSION_PROFILE_ID_HEX,
      creationHeight: 900_020,
      ...overrides,
    });
  }

  it('preserves only the source intent and consumed source box ID on partial settlement', () => {
    const f = causalFixture();
    const tx = build();

    expect(tx.inputs).toHaveLength(2);
    expect(tx.dataInputs).toEqual([{ boxId: f.trackerBox.boxId }]);
    expect(tx.outputs).toHaveLength(4);
    expect(tx.outputs[2]).toMatchObject({
      value: '1000000',
      ergoTree: f.deployed.mainChainCausalVaultV2.ergoTreeHex,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(f.sourceIntentHex, 'hex')),
        R5: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
      },
    });
    expect(Object.keys(tx.outputs[2].additionalRegisters)).toEqual(['R4', 'R5']);
  });

  it('fails closed on active-profile, source identity, amount, or register drift', () => {
    const f = causalFixture();
    expect(() => build({ expectedSourceNetworkIdHex: 'ff'.repeat(32) }))
      .toThrow(/source network/);
    expect(() => build({ expectedAdmissionProfileIdHex: 'fe'.repeat(32) }))
      .toThrow(/admission profile/);

    const zeroSource = structuredClone(f.unlockBox);
    zeroSource.additionalRegisters!.R5 = encodeCollByteRegister(Buffer.alloc(32));
    expect(() => build({ unlockBox: zeroSource })).toThrow(/source box ID must be nonzero/);

    const inflated = { ...f.unlockBox, value: Number(f.unlockBox.value) + 1 };
    expect(() => build({ unlockBox: inflated })).toThrow(/no greater than source intent amount/);

    const wrongSidechain = structuredClone(f.unlockBox);
    const wrongSidechainIntent = Buffer.from(f.sourceIntentHex, 'hex');
    wrongSidechainIntent[33] ^= 1;
    wrongSidechain.additionalRegisters!.R4 = encodeCollByteRegister(wrongSidechainIntent);
    expect(() => build({ unlockBox: wrongSidechain })).toThrow(/sidechain/);

    const nonErgAsset = structuredClone(f.unlockBox);
    const nonErgIntent = Buffer.from(f.sourceIntentHex, 'hex');
    nonErgIntent[169] = 1;
    nonErgAsset.additionalRegisters!.R4 = encodeCollByteRegister(nonErgIntent);
    expect(() => build({ unlockBox: nonErgAsset })).toThrow(/native ERG zero asset ID/);

    const missingIntent = structuredClone(f.unlockBox);
    delete missingIntent.additionalRegisters!.R4;
    expect(() => build({ unlockBox: missingIntent })).toThrow(/missing R4/);
  });

  it('preserves exact causal-vault balances above the JavaScript safe-integer range', () => {
    const vaultValue = '9007199254740993';
    const f = causalFixture(vaultValue);
    const tx = buildCausalAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      expectedSourceNetworkIdHex: CAUSAL_SOURCE_NETWORK_ID_HEX,
      expectedAdmissionProfileIdHex: CAUSAL_ADMISSION_PROFILE_ID_HEX,
      creationHeight: 900_020,
    });

    expect(tx.outputs[0].value).toBe('1000000');
    expect(tx.outputs[1].value).toBe('1000000');
    expect(tx.outputs[2].value).toBe(
      (BigInt(vaultValue) - 1_000_000n - BigInt(MINER_FEE)).toString(),
    );
    expect(tx.outputs[3].value).toBe(String(MINER_FEE));
  });

  it('rejects dust absorption that would exceed the on-chain miner-fee cap', () => {
    const f = causalFixture(3_200_000);
    expect(() => buildCausalAuthenticatedSettlementTx({
      deployed: f.deployed,
      plan: f.plan,
      trackerBox: f.trackerBox,
      duplicatePreventionBox: f.duplicatePreventionBox,
      unlockBox: f.unlockBox,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      expectedSourceNetworkIdHex: CAUSAL_SOURCE_NETWORK_ID_HEX,
      expectedAdmissionProfileIdHex: CAUSAL_ADMISSION_PROFILE_ID_HEX,
      creationHeight: 900_020,
      minerFee: 2_100_000,
    })).toThrow(/effective miner fee exceeds/);
  });
});
