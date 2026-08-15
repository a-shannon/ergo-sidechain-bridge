import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  buildBridgeCheckpointCommitmentV1,
} from './profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityCommitmentV1,
} from './profiles/substrate-grandpa-v1/bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './profiles/substrate-grandpa-v1/bridge-finality-proof.js';
import {
  buildAuthenticatedSettlementExternalFeePlan,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-external-fee-plan.js';
import {
  buildAuthenticatedSettlementExternalFeePacket,
  type AuthenticatedSettlementExternalFeePacket,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-external-fee-transaction.js';
import {
  assertAuthenticatedSettlementExternalFeeVmCandidateDigest,
  assertAuthenticatedSettlementExternalFeeVmCandidateProvenance,
  buildAuthenticatedSettlementExternalFeeVmCandidate,
} from './authenticated-settlement-external-fee-vm-candidate.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE,
} from './profiles/substrate-grandpa-v1/ergo-settlement-policy.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
} from './profiles/substrate-grandpa-v1/spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './profiles/substrate-grandpa-v1/trustless-burn-proof.js';

const SIDECHAIN_ID_HEX = '11'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '22'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const SIDECHAIN_TX_HASH_HEX = '33'.repeat(32);
const SIDECHAIN_LOG_INDEX = 7;
const TRACKER_NFT_ID = 'aa'.repeat(32);
const DUP_NFT_ID = 'bb'.repeat(32);
const TRACKER_TREE = '10010100d17300';
const DUP_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const VAULT_TREE =
  '0008cd02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5';
const RECIPIENT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const FEE_TREE =
  '0008cd02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const RECIPIENT_HASH_HEX = Buffer.from(
  blakejs.blake2b(Buffer.from(RECIPIENT_TREE, 'hex'), undefined, 32),
).toString('hex');
const FINALITY_ATTESTOR_METADATA = encodeSigmaPropRegister(
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
);
const BRIDGE_COMMITTEE_METADATA = encodeSigmaPropRegister(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);

describe('authenticated external-fee VM candidate', () => {
  it('binds exact EIP-12 boxes and proofless bytes for a partial payout', async () => {
    const fixture = await buildFixture(5_000_000n);
    const candidate = await buildAuthenticatedSettlementExternalFeeVmCandidate({
      packet: fixture.packet,
      currentErgoHeight: 900_020,
      ...fixture.boxes,
    });

    expect(() => assertAuthenticatedSettlementExternalFeeVmCandidateProvenance(
      candidate,
    )).not.toThrow();
    expect(() => assertAuthenticatedSettlementExternalFeeVmCandidateDigest(
      candidate,
    )).not.toThrow();
    expect(candidate.transaction.eip12UnsignedTransaction.inputs).toHaveLength(3);
    expect(candidate.transaction.eip12UnsignedTransaction.dataInputs)
      .toHaveLength(1);
    expect(candidate.transaction.eip12UnsignedTransaction.outputs)
      .toHaveLength(4);
    expect(candidate.transaction.prooflessTransactionIdHex)
      .toBe(candidate.transaction.unsignedTransactionIdHex);
    expect(candidate.transaction.prooflessTransactionHex)
      .toHaveLength(candidate.transaction.prooflessTransactionBytes * 2);
    expect(candidate.transaction.contextExtensions.map(entry => entry.keys))
      .toEqual([[0, 1, 2], [0, 1, 2, 3], []]);
    expect(candidate.boxes.inputs.map(box => box.boxId)).toEqual([
      fixture.boxes.duplicatePreventionBox.boxId,
      fixture.boxes.vaultBox.boxId,
      fixture.boxes.externalFeeBox.boxId,
    ]);
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
  });

  it('materializes the distinct terminal topology without a vault successor', async () => {
    const fixture = await buildFixture(2_000_000n);
    const candidate = await buildAuthenticatedSettlementExternalFeeVmCandidate({
      packet: fixture.packet,
      currentErgoHeight: 900_020,
      ...fixture.boxes,
    });

    expect(candidate.transaction.eip12UnsignedTransaction.outputs)
      .toHaveLength(3);
    expect(candidate.transaction.eip12UnsignedTransaction.outputs.map(
      output => String(output.value),
    )).toEqual(['1000000', '2000000', '1100000']);
  });

  it('rejects any full-box drift before producing JVM evidence', async () => {
    const fixture = await buildFixture(5_000_000n);
    const wrongVault = await syntheticBox({
      value: 5_000_001n,
      ergoTree: VAULT_TREE,
      additionalRegisters:
        fixture.boxes.vaultBox.additionalRegisters,
      transactionByte: 0x35,
      creationHeight: 900_000,
    });

    await expect(buildAuthenticatedSettlementExternalFeeVmCandidate({
      packet: fixture.packet,
      currentErgoHeight: 900_020,
      ...fixture.boxes,
      vaultBox: wrongVault,
    })).rejects.toThrow(/does not match the packet binding/);
  });

  it('keeps cloned packets and cloned candidates outside process authority', async () => {
    const fixture = await buildFixture(5_000_000n);
    await expect(buildAuthenticatedSettlementExternalFeeVmCandidate({
      packet: structuredClone(fixture.packet),
      currentErgoHeight: 900_020,
      ...fixture.boxes,
    })).rejects.toThrow(/was not built in this process/);

    const candidate = await buildAuthenticatedSettlementExternalFeeVmCandidate({
      packet: fixture.packet,
      currentErgoHeight: 900_020,
      ...fixture.boxes,
    });
    const cloned = structuredClone(candidate);
    expect(() => assertAuthenticatedSettlementExternalFeeVmCandidateProvenance(
      cloned,
    )).toThrow(/was not materialized in this process/);
    cloned.transaction.prooflessTransactionHex =
      `00${cloned.transaction.prooflessTransactionHex.slice(2)}`;
    expect(() => assertAuthenticatedSettlementExternalFeeVmCandidateDigest(
      cloned,
    )).toThrow(/digest does not match/);
  });
});

async function buildFixture(vaultValue: bigint): Promise<{
  packet: AuthenticatedSettlementExternalFeePacket;
  boxes: {
    duplicatePreventionBox: Awaited<ReturnType<typeof syntheticBox>>;
    vaultBox: Awaited<ReturnType<typeof syntheticBox>>;
    externalFeeBox: Awaited<ReturnType<typeof syntheticBox>>;
    trackerDataInput: Awaited<ReturnType<typeof syntheticBox>>;
  };
}> {
  const amount = 2_000_000n;
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
  const plan = buildAuthenticatedSettlementExternalFeePlan({
    spvHistory: [{
      key: trackerKeyHex,
      value: canonicalTrackerValue(leaf.leafHashHex),
    }],
    dupHistoryKeys: [],
    claim: {
      pegOut: {
        user: '0x0000000000000000000000000000000000000001',
        amount,
        ergoRecipientAddress: RECIPIENT_TREE,
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
  const trackerDataInput = await syntheticBox({
    value: 1_000_000n,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: '1' }],
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
      R7: encodeLongRegister(SIDECHAIN_HEIGHT),
      R8: encodeIntRegister(900_001),
      R9: FINALITY_ATTESTOR_METADATA,
    },
    transactionByte: 0x10,
    creationHeight: 900_000,
  });
  const duplicatePreventionBox = await syntheticBox({
    value: 1_000_000n,
    ergoTree: DUP_TREE,
    assets: [{ tokenId: DUP_NFT_ID, amount: '1' }],
    additionalRegisters: {
      R4: encodeLongRegister(3),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: BRIDGE_COMMITTEE_METADATA,
    },
    transactionByte: 0x20,
    creationHeight: 900_000,
  });
  const vaultRegisters = {
    R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(vaultValue),
    R7: encodeCollByteRegister(Buffer.from(RECIPIENT_TREE, 'hex')),
  };
  const vaultBox = await syntheticBox({
    value: vaultValue,
    ergoTree: VAULT_TREE,
    additionalRegisters: vaultRegisters,
    transactionByte: 0x30,
    creationHeight: 900_000,
  });
  const externalFeeBox = await syntheticBox({
    value: BigInt(MINER_FEE),
    ergoTree: FEE_TREE,
    additionalRegisters: {},
    transactionByte: 0x40,
    creationHeight: 900_000,
  });
  const packet = buildAuthenticatedSettlementExternalFeePacket({
    contractIdentities: {
      spvTrackerAuthenticated: {
        nftId: TRACKER_NFT_ID,
        ergoTreeHex: TRACKER_TREE,
      },
      doubleUnlockPreventionAuthenticatedExternalFee: {
        nftId: DUP_NFT_ID,
        ergoTreeHex: DUP_TREE,
      },
      mainChainAggregateUnlockAuthenticatedExternalFee: {
        ergoTreeHex: VAULT_TREE,
      },
    },
    plan,
    trackerBox: trackerDataInput,
    duplicatePreventionBox,
    vaultBox,
    externalFeeBox,
    recipientErgoTreeHex: RECIPIENT_TREE,
    creationHeight: 900_020,
  });
  return {
    packet,
    boxes: {
      duplicatePreventionBox,
      vaultBox,
      externalFeeBox,
      trackerDataInput,
    },
  };
}

async function syntheticBox(input: {
  value: bigint;
  ergoTree: string;
  assets?: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  transactionByte: number;
  creationHeight: number;
}) {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const boxes = wasm.ErgoBoxes.from_boxes_json([{
    value: input.value.toString(),
    ergoTree: input.ergoTree,
    assets: input.assets ?? [],
    additionalRegisters: input.additionalRegisters,
    transactionId:
      input.transactionByte.toString(16).padStart(2, '0').repeat(32),
    index: 0,
    creationHeight: input.creationHeight,
  }]);
  try {
    const box = boxes.get(0);
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
    }
  } finally {
    boxes.free?.();
  }
}

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
    payload: Buffer.from('external-fee-settlement-proof', 'ascii'),
  });
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '66'.repeat(32),
    anchorHeaderHeight: 900_000,
    finalityProofSystemId: proof.proofSystemId,
    finalityStatementDigestHex: proof.statementDigestHex,
    finalityProgramIdHex: proof.statement.programIdHex,
    finalityVerifierProfileIdHex: proof.verifierProfileIdHex,
    finalityProofPayloadDigestHex: proof.payloadDigestHex,
    finalityProofDigestHex:
      buildAggregateFinalityCommitmentV1(proof).proofDigestHex,
  });
}
