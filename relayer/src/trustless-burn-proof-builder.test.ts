import { ethers } from 'ethers';
import { describe, expect, it } from 'vitest';

import { extractVerifiedPegOutBurnsFromReceipt, type PegOutBurnReceiptLike } from './peg-out-burn-verifier.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import { buildTrustlessBurnProofFromVerifiedPegOutBurns } from './trustless-burn-proof-builder.js';
import {
  deriveTrustlessBurnIdHex,
  validateTrustlessBurnInclusionProofEnvelope,
  verifyTrustlessBurnSettlementBinding,
} from './trustless-burn-proof.js';

const bridgeAddress = '0x00000000000000000000000000000000000000b1';
const user = '0x0000000000000000000000000000000000000001';
const sidechainIdHex = '99'.repeat(32);
const txHash = '11'.repeat(32);
const blockHash = '22'.repeat(32);
const recipientA = '0008cd02' + '44'.repeat(32);
const recipientB = '0008cd03' + '55'.repeat(32);
const recipientHashA = 'aa'.repeat(32);
const recipientHashB = 'bb'.repeat(32);
const bridgeInterface = new ethers.Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

function pegOutLog(index: number, recipient: string, amount: bigint) {
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegOut')!,
    [user, amount, `0x${recipient}`],
  );
  return {
    address: bridgeAddress,
    topics: [...encoded.topics],
    data: encoded.data,
    transactionHash: `0x${txHash}`,
    blockNumber: 1234,
    blockHash: `0x${blockHash}`,
    logIndex: index,
  };
}

function receipt(): PegOutBurnReceiptLike {
  return {
    status: 1,
    hash: `0x${txHash}`,
    blockNumber: 1234,
    blockHash: `0x${blockHash}`,
    logs: [
      pegOutLog(7, recipientA, 10_000_000n),
      pegOutLog(8, recipientB, 20_000_000n),
    ],
  };
}

describe('trustless burn proof builder', () => {
  it('builds a validated inclusion proof from verified PegOut burns', () => {
    const burns = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      sidechainIdHex,
    }).burns;
    const targetBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: txHash,
      eventIndex: 8,
    });

    const proof = buildTrustlessBurnProofFromVerifiedPegOutBurns({
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex,
      targetBurnIdHex,
      burns: [
        { burn: burns[0], recipientErgoTreeHashHex: recipientHashA },
        { burn: burns[1], recipientErgoTreeHashHex: recipientHashB },
      ],
    });
    const envelope = validateTrustlessBurnInclusionProofEnvelope(proof);
    const settlement = verifyTrustlessBurnSettlementBinding({
      leaf: proof.leaf,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      proof: proof.proof,
      duplicatePreventionKeyHex: targetBurnIdHex,
      recipientErgoTreeHashHex: recipientHashB,
      amountNanoErg: 20_000_000n,
    });

    expect(proof.leaf.burnIdHex).toBe(targetBurnIdHex);
    expect(proof.leafIndex).toBe(1);
    expect(proof.leafCount).toBe(2);
    expect(envelope.errors).toEqual([]);
    expect(envelope.ok).toBe(true);
    expect(settlement.errors).toEqual([]);
    expect(settlement.ok).toBe(true);
  });

  it('rejects legacy receipt burn IDs before building a trustless proof', () => {
    const legacyBurn = extractVerifiedPegOutBurnsFromReceipt(receipt(), { bridgeAddress }).burns[0];

    expect(() => buildTrustlessBurnProofFromVerifiedPegOutBurns({
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex,
      targetBurnIdHex: 'aa'.repeat(32),
      burns: [{ burn: legacyBurn, recipientErgoTreeHashHex: recipientHashA }],
    })).toThrow('verified burnId must match derived trustless burn ID');
  });

  it('rejects an unknown asset profile before constructing burn leaves', () => {
    expect(() => buildTrustlessBurnProofFromVerifiedPegOutBurns({
      assetProfileId: 'e2s.substrate-grandpa-v1.asset.token.v1',
      sidechainIdHex,
      targetBurnIdHex: 'aa'.repeat(32),
      burns: [],
    })).toThrow('unsupported Substrate/GRANDPA V1 asset profile');
  });
});
