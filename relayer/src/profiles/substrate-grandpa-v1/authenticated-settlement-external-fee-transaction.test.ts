import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import type { BoxLike } from '../../ergo-settlement-core/settlement-transaction.js';
import { sha256CanonicalJson } from '../../ergo-settlement-core/strict-json.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityCommitmentV1,
} from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  buildAuthenticatedSettlementPlan,
} from './authenticated-settlement-plan.js';
import {
  assertAuthenticatedSettlementExternalFeePlanProvenance,
  buildAuthenticatedSettlementExternalFeePlan,
  type AuthenticatedSettlementExternalFeePlan,
} from './authenticated-settlement-external-fee-plan.js';
import {
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_DIGEST_DOMAIN,
  assertAuthenticatedSettlementExternalFeePacketForExecution,
  assertAuthenticatedSettlementExternalFeePacketIntegrity,
  assertAuthenticatedSettlementExternalFeePacketProvenance,
  buildAuthenticatedSettlementExternalFeePacket,
  type AuthenticatedSettlementExternalFeePacket,
  type BuildAuthenticatedSettlementExternalFeePacketInput,
} from './authenticated-settlement-external-fee-transaction.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-settlement-policy.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
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
const RECIPIENT_HASH_HEX = Buffer.from(
  blakejs.blake2b(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'), undefined, 32),
).toString('hex');
const FINALITY_ATTESTOR_METADATA = encodeSigmaPropRegister(
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
);
const BRIDGE_COMMITTEE_METADATA = encodeSigmaPropRegister(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);

function box(
  boxId: string,
  ergoTree: string,
  value: number | string | bigint,
  registers: Record<string, string> = {},
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
    finalityProofDigestHex: buildAggregateFinalityCommitmentV1(proof).proofDigestHex,
  });
}

function fixture(vaultValue: bigint = 5_000_000n) {
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
  const planInput = {
    spvHistory: [{
      key: trackerKeyHex,
      value: canonicalTrackerValue(leaf.leafHashHex),
    }],
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
        source: 'trustless-burn-leaf' as const,
        duplicatePreventionKeyHex: burnIdHex,
        bridgeEventRootHex: leaf.leafHashHex,
        recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
        amountNanoErg: amount,
        trustlessBurnProof: [],
      },
    },
  };
  const plan = buildAuthenticatedSettlementExternalFeePlan(planInput);
  const oldPlan = buildAuthenticatedSettlementPlan(planInput);
  const contractIdentities = {
    spvTrackerAuthenticated: {
      nftId: 'aa'.repeat(32),
      ergoTreeHex: '1001',
    },
    doubleUnlockPreventionAuthenticatedExternalFee: {
      nftId: 'bb'.repeat(32),
      ergoTreeHex: '1102',
    },
    mainChainAggregateUnlockAuthenticatedExternalFee: {
      ergoTreeHex: '1103',
    },
  };
  const trackerBox = box('10'.repeat(32), '1001', 1_000_000, {
    R4: encodeLongRegister(1),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
    R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
    R7: encodeLongRegister(SIDECHAIN_HEIGHT),
    R8: encodeIntRegister(900_001),
    R9: FINALITY_ATTESTOR_METADATA,
  }, contractIdentities.spvTrackerAuthenticated.nftId);
  const duplicatePreventionBox = box('20'.repeat(32), '1102', 1_000_000, {
    R4: encodeLongRegister(3),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: BRIDGE_COMMITTEE_METADATA,
  }, contractIdentities.doubleUnlockPreventionAuthenticatedExternalFee.nftId);
  const vaultBox = box('30'.repeat(32), '1103', vaultValue, {
    R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(vaultValue),
    R7: encodeCollByteRegister(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex')),
  });
  const externalFeeBox = box('40'.repeat(32), '0008cd02' + '55'.repeat(32), MINER_FEE);
  const buildInput: BuildAuthenticatedSettlementExternalFeePacketInput = {
    contractIdentities,
    plan,
    trackerBox,
    duplicatePreventionBox,
    vaultBox,
    externalFeeBox,
    recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
    creationHeight: 900_020,
  };
  return { amount, buildInput, oldPlan, plan };
}

function mutablePacket(
  packet: AuthenticatedSettlementExternalFeePacket,
): AuthenticatedSettlementExternalFeePacket {
  return structuredClone(packet);
}

function refreshPacketDigest(
  packet: AuthenticatedSettlementExternalFeePacket,
): void {
  const { packetDigestHex: _digest, ...withoutDigest } = packet;
  packet.packetDigestHex = sha256CanonicalJson(
    jsonSafe(withoutDigest),
    AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_DIGEST_DOMAIN,
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { 'e2s:bigint': value.toString() };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, jsonSafe(nested)]),
    );
  }
  return value;
}

describe('authenticated external-fee settlement transaction', () => {
  it('builds a partial transition whose vault delta equals only the payout', () => {
    const f = fixture();
    const packet = buildAuthenticatedSettlementExternalFeePacket(f.buildInput);

    expect(() => assertAuthenticatedSettlementExternalFeePlanProvenance(f.plan))
      .not.toThrow();
    expect(() => assertAuthenticatedSettlementExternalFeePacketProvenance(packet))
      .not.toThrow();
    expect(() => assertAuthenticatedSettlementExternalFeePacketForExecution(packet))
      .toThrow(/non-authorizing.*replay cutover/);
    expect(packet.contractCompatibility).toBe('authenticated-external-fee-v1');
    expect(packet.plan.proofSemantics).toBe('authenticated-v2-frozen');
    expect(packet.boundaries).toEqual({
      reviewedContractRegistryBound: false,
      liveInputBoxesRevalidated: false,
      externalFeeSpendabilityEstablished: false,
      contractCompiledAndVmAccepted: false,
      targetNodeAccepted: false,
      replayCutoverEstablished: false,
      legacyRoutesDisabled: false,
      finalityAuthorityReplaced: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(packet.unsignedTx.inputs.map(input => input.boxId)).toEqual([
      f.buildInput.duplicatePreventionBox.boxId,
      f.buildInput.vaultBox.boxId,
      f.buildInput.externalFeeBox.boxId,
    ]);
    expect(packet.unsignedTx.dataInputs).toEqual([{
      boxId: f.buildInput.trackerBox.boxId,
    }]);
    expect(packet.unsignedTx.outputs.map(output => output.value)).toEqual([
      '1000000',
      f.amount.toString(),
      '3000000',
      String(MINER_FEE),
    ]);
    expect(packet.unsignedTx.outputs[2]).toMatchObject({
      ergoTree:
        f.buildInput.contractIdentities
          .mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex,
      additionalRegisters: f.buildInput.vaultBox.additionalRegisters,
    });
    expect(packet.unsignedTx.outputs.at(-1)).toEqual({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 900_020,
    });
    expect(packet.inputBindings.externalFee).toMatchObject({
      boxId: f.buildInput.externalFeeBox.boxId,
      valueNanoErg: String(MINER_FEE),
      ergoTreeHex: f.buildInput.externalFeeBox.ergoTree,
      assets: [],
    });
    expect(packet.valueBinding).toEqual({
      payoutNanoErg: f.amount.toString(),
      vaultInputNanoErg: '5000000',
      vaultSuccessorNanoErg: '3000000',
      minerFeeNanoErg: String(MINER_FEE),
    });
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(packet))
      .not.toThrow();
  });

  it('builds a terminal transition without a vault successor', () => {
    const f = fixture(2_000_000n);
    const packet = buildAuthenticatedSettlementExternalFeePacket(f.buildInput);

    expect(packet.valueBinding.vaultSuccessorNanoErg).toBe('0');
    expect(packet.unsignedTx.outputs).toHaveLength(3);
    expect(packet.unsignedTx.outputs.map(output => output.ergoTree)).toEqual([
      f.buildInput.contractIdentities
        .doubleUnlockPreventionAuthenticatedExternalFee.ergoTreeHex,
      RECIPIENT_ERGO_TREE_HEX,
      MINER_FEE_TREE,
    ]);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(packet))
      .not.toThrow();
  });

  it('rejects absent, inexact, token-bearing, protected, or reused fee inputs', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: undefined as unknown as BoxLike,
    })).toThrow(/externalFeeBox is required/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: { ...f.buildInput.externalFeeBox, value: MINER_FEE - 1 },
    })).toThrow(/must equal the selected miner fee/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: { ...f.buildInput.externalFeeBox, value: MINER_FEE + 1 },
    })).toThrow(/must equal the selected miner fee/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: {
        ...f.buildInput.externalFeeBox,
        assets: [{ tokenId: '99'.repeat(32), amount: 1 }],
      },
    })).toThrow(/pure ERG with no tokens/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: {
        ...f.buildInput.externalFeeBox,
        ergoTree: f.buildInput.vaultBox.ergoTree,
      },
    })).toThrow(/protected bridge contract ErgoTree/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      externalFeeBox: {
        ...f.buildInput.externalFeeBox,
        boxId: f.buildInput.vaultBox.boxId,
      },
    })).toThrow(/boxes must be distinct/);
  });

  it('enforces the selected miner-fee range with no fee change', () => {
    const f = fixture();
    for (const minerFee of [1_000_000, 2_100_000]) {
      const packet = buildAuthenticatedSettlementExternalFeePacket({
        ...f.buildInput,
        minerFee,
        externalFeeBox: { ...f.buildInput.externalFeeBox, value: minerFee },
      });
      expect(packet.unsignedTx.outputs.at(-1)?.value).toBe(String(minerFee));
      expect(packet.unsignedTx.outputs.at(-1)?.ergoTree).toBe(MINER_FEE_TREE);
    }
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      minerFee: 999_999,
      externalFeeBox: { ...f.buildInput.externalFeeBox, value: 999_999 },
    })).toThrow(/miner fee must be between/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      minerFee: 2_100_001,
      externalFeeBox: { ...f.buildInput.externalFeeBox, value: 2_100_001 },
    })).toThrow(/miner fee must be between/);
  });

  it('rejects a positive dust residual or insufficient vault', () => {
    expect(() => buildAuthenticatedSettlementExternalFeePacket(
      fixture(2_999_999n).buildInput,
    )).toThrow(/residual .* below minimum box value/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket(
      fixture(1_999_999n).buildInput,
    )).toThrow(/does not cover payout/);
  });

  it('rejects the old authenticated-v2 plan compatibility', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      plan: f.oldPlan as unknown as AuthenticatedSettlementExternalFeePlan,
    })).toThrow(/versioned external-fee plan/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      plan: structuredClone(f.plan),
    })).toThrow(/plan was not built in this process/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      verified: true,
    } as BuildAuthenticatedSettlementExternalFeePacketInput))
      .toThrow(/must contain required keys/);
  });

  it('rejects ambiguous or caller-extended contract identities', () => {
    const f = fixture();
    const identities = f.buildInput.contractIdentities;

    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      contractIdentities: {
        ...identities,
        spvTrackerAuthenticated: {
          ...identities.spvTrackerAuthenticated,
          nftId:
            identities
              .doubleUnlockPreventionAuthenticatedExternalFee.nftId,
        },
      },
    })).toThrow(/NFT identities must be distinct and nonzero/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      contractIdentities: {
        ...identities,
        spvTrackerAuthenticated: {
          ...identities.spvTrackerAuthenticated,
          nftId: '00'.repeat(32),
        },
      },
    })).toThrow(/NFT identities must be distinct and nonzero/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      contractIdentities: {
        ...identities,
        mainChainAggregateUnlockAuthenticatedExternalFee: {
          ergoTreeHex:
            identities
              .doubleUnlockPreventionAuthenticatedExternalFee.ergoTreeHex,
        },
      },
    })).toThrow(/contract ErgoTrees must be distinct/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      contractIdentities: {
        ...identities,
        mainChainAggregateUnlockAuthenticatedExternalFee: {
          ergoTreeHex: MINER_FEE_TREE,
        },
      },
    })).toThrow(/must not equal the miner-fee tree/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      contractIdentities: {
        ...identities,
        spvTrackerAuthenticated: {
          ...identities.spvTrackerAuthenticated,
          verified: true,
        },
      } as typeof identities,
    })).toThrow(/tracker contract identity must contain required keys/);
  });

  it('detects fee reordering and exact fee binding drift', () => {
    const f = fixture();
    const packet = buildAuthenticatedSettlementExternalFeePacket(f.buildInput);

    const reordered = mutablePacket(packet);
    [
      reordered.unsignedTx.inputs[1],
      reordered.unsignedTx.inputs[2],
    ] = [
      reordered.unsignedTx.inputs[2],
      reordered.unsignedTx.inputs[1],
    ];
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(reordered))
      .toThrow(/input order or binding changed/);

    const valueDrift = mutablePacket(packet);
    valueDrift.inputBindings.externalFee.valueNanoErg = String(MINER_FEE + 1);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(valueDrift))
      .toThrow(/must equal the selected miner fee/);

    const treeDrift = mutablePacket(packet);
    treeDrift.inputBindings.externalFee.ergoTreeHex = '1004';
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(treeDrift))
      .toThrow(/packet digest does not match/);

    const assetDrift = mutablePacket(packet);
    assetDrift.inputBindings.externalFee.assets.push({
      tokenId: '99'.repeat(32),
      amount: '1',
    });
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(assetDrift))
      .toThrow(/pure ERG with no tokens/);
  });

  it('reconstructs extensions, outputs, heights, and non-authorizing boundaries', () => {
    const f = fixture();
    const packet = buildAuthenticatedSettlementExternalFeePacket(f.buildInput);

    const recipientDrift = mutablePacket(packet);
    recipientDrift.unsignedTx.outputs[1].ergoTree =
      `0008cd02${'45'.repeat(32)}`;
    refreshPacketDigest(recipientDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(recipientDrift))
      .toThrow(/recipientErgoTreeHashHex must match/);

    const dupSuccessorDrift = mutablePacket(packet);
    dupSuccessorDrift.unsignedTx.outputs[0].additionalRegisters.R4 =
      encodeLongRegister(99);
    refreshPacketDigest(dupSuccessorDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(dupSuccessorDrift))
      .toThrow(/deterministic outputs changed/);

    const vaultSuccessorDrift = mutablePacket(packet);
    vaultSuccessorDrift.unsignedTx.outputs[2].additionalRegisters.R4 =
      encodeCollByteRegister(Buffer.from('32'.repeat(32), 'hex'));
    refreshPacketDigest(vaultSuccessorDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(vaultSuccessorDrift))
      .toThrow(/deterministic outputs changed/);

    const dupExtensionDrift = mutablePacket(packet);
    dupExtensionDrift.unsignedTx.inputs[0].extension['1'] =
      encodeCollByteRegister(Buffer.from('99'.repeat(32), 'hex'));
    refreshPacketDigest(dupExtensionDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(dupExtensionDrift))
      .toThrow(/DUP input extension changed/);

    const vaultExtensionDrift = mutablePacket(packet);
    vaultExtensionDrift.unsignedTx.inputs[1].extension['0'] =
      encodeCollByteRegister(Buffer.from('99'.repeat(32), 'hex'));
    refreshPacketDigest(vaultExtensionDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(vaultExtensionDrift))
      .toThrow(/vault input extension changed/);

    const feeExtensionDrift = mutablePacket(packet);
    feeExtensionDrift.unsignedTx.inputs[2].extension['0'] = '0101';
    refreshPacketDigest(feeExtensionDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(feeExtensionDrift))
      .toThrow(/fee input extension changed/);

    const heightDrift = mutablePacket(packet);
    heightDrift.unsignedTx.outputs[1].creationHeight += 1;
    refreshPacketDigest(heightDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(heightDrift))
      .toThrow(/creation heights diverged/);

    const boundaryDrift = mutablePacket(packet);
    (boundaryDrift.boundaries as { targetNodeAccepted: boolean })
      .targetNodeAccepted = true;
    refreshPacketDigest(boundaryDrift);
    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(boundaryDrift))
      .toThrow(/boundaries must remain non-authorizing/);
  });

  it('keeps structural diagnosis separate from executable provenance', () => {
    const f = fixture();
    const packet = buildAuthenticatedSettlementExternalFeePacket(f.buildInput);
    const cloned = mutablePacket(packet);

    expect(() => assertAuthenticatedSettlementExternalFeePacketIntegrity(cloned))
      .not.toThrow();
    expect(() => assertAuthenticatedSettlementExternalFeePacketProvenance(cloned))
      .toThrow(/packet was not built in this process/);
    expect(() => assertAuthenticatedSettlementExternalFeePacketForExecution(cloned))
      .toThrow(/packet was not built in this process/);
  });

  it('rejects zero creation heights for inputs and successors', () => {
    const f = fixture();
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      creationHeight: 0,
    })).toThrow(/creationHeight must be a positive safe integer/);
    expect(() => buildAuthenticatedSettlementExternalFeePacket({
      ...f.buildInput,
      vaultBox: {
        ...f.buildInput.vaultBox,
        creationHeight: 0,
      },
    })).toThrow(/vaultBox creationHeight must be a positive safe integer/);
  });

  it('is deterministic, detached from caller inputs, and deeply immutable', () => {
    const firstFixture = fixture();
    const secondFixture = fixture();
    const first = buildAuthenticatedSettlementExternalFeePacket(firstFixture.buildInput);
    const second = buildAuthenticatedSettlementExternalFeePacket(secondFixture.buildInput);

    expect(first).toEqual(second);
    expect(first.packetDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.plan.claims[0].claim)).toBe(true);
    expect(Object.isFrozen(first.unsignedTx.inputs)).toBe(true);
    expect(Object.isFrozen(first.inputBindings.externalFee.assets)).toBe(true);

    firstFixture.buildInput.externalFeeBox.value = 2_100_000;
    firstFixture.buildInput.externalFeeBox.ergoTree = '1004';
    expect(first.inputBindings.externalFee.valueNanoErg).toBe(String(MINER_FEE));
    expect(first.inputBindings.externalFee.ergoTreeHex)
      .not.toBe(firstFixture.buildInput.externalFeeBox.ergoTree);
    expect(() => {
      first.unsignedTx.inputs.reverse();
    }).toThrow();
  });
});
