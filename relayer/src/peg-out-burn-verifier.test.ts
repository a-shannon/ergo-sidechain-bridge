import { ethers } from 'ethers';
import { describe, expect, it } from 'vitest';

import type { ParsedPegOut } from './sidechain-client.js';
import {
  buildTrustlessBurnLeafInputFromVerifiedPegOutBurn,
  classifyPegOutBurnForSettlement,
  extractVerifiedPegOutBurnsFromReceipt,
  verifyPegOutBurnReceipt,
  type PegOutBurnReceiptLike,
} from './peg-out-burn-verifier.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import { encodeTrustlessBurnLeaf } from './trustless-burn-proof.js';

const bridgeAddress = '0x00000000000000000000000000000000000000b1';
const user = '0x0000000000000000000000000000000000000001';
const txHash = '11'.repeat(32);
const blockHash = '22'.repeat(32);
const sidechainIdHex = '99'.repeat(32);
const derivedBurnId = '0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76';
const recipientErgoTreeHashHex = 'aa'.repeat(32);
const recipient = '0008cd02' + '44'.repeat(32);
const bridgeInterface = new ethers.Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

function pegOut(overrides: Partial<ParsedPegOut> = {}): ParsedPegOut {
  return {
    user,
    amount: 10_000_000n,
    ergoRecipientAddress: recipient,
    sidechainTxHash: txHash,
    sidechainBlockNumber: 1234,
    sidechainBlockHash: blockHash,
    sidechainLogIndex: 7,
    ...overrides,
  };
}

function pegOutLog(overrides: Record<string, any> = {}) {
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegOut')!,
    [overrides.user ?? user, overrides.amount ?? 10_000_000n, overrides.recipient ?? `0x${recipient}`],
  );
  return {
    address: overrides.address ?? bridgeAddress,
    topics: overrides.topics ?? [...encoded.topics],
    data: overrides.data ?? encoded.data,
    transactionHash: overrides.transactionHash ?? `0x${txHash}`,
    blockNumber: overrides.blockNumber ?? 1234,
    blockHash: overrides.blockHash ?? `0x${blockHash}`,
    logIndex: overrides.logIndex ?? 7,
  };
}

function receipt(overrides: Partial<PegOutBurnReceiptLike> = {}): PegOutBurnReceiptLike {
  return {
    status: 1,
    hash: `0x${txHash}`,
    blockNumber: 1234,
    blockHash: `0x${blockHash}`,
    logs: [pegOutLog()],
    ...overrides,
  };
}

describe('peg-out burn verifier', () => {
  it('extracts a verified PegOut burn from a successful receipt and deployed bridge log', () => {
    const result = extractVerifiedPegOutBurnsFromReceipt(receipt(), { bridgeAddress });

    expect(result.errors).toEqual([]);
    expect(result.reverted).toBe(false);
    expect(result.burns).toEqual([{
      user: user.toLowerCase(),
      amount: 10_000_000n,
      ergoRecipientAddress: recipient,
      sidechainTxHash: txHash,
      sidechainBlockNumber: 1234,
      sidechainBlockHash: blockHash,
      sidechainLogIndex: 7,
      bridgeAddress: bridgeAddress.toLowerCase(),
      burnId: `${txHash}:7`,
      sidechainEventId: `${txHash}:7`,
    }]);
  });

  it('derives a trustless 32-byte burn ID when sidechain identity is supplied', () => {
    const result = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      sidechainIdHex,
    });

    expect(result.errors).toEqual([]);
    expect(result.burns[0].burnId).toBe(derivedBurnId);
    expect(result.burns[0].sidechainEventId).toBe(`${txHash}:7`);
  });

  it('verifies a stored peg-out row against the receipt/log/event binding', () => {
    const result = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      sidechainIdHex,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.burn?.burnId).toBe(derivedBurnId);
    expect(result.burn?.sidechainEventId).toBe(`${txHash}:7`);
  });

  it('binds sidechain finality evidence when the burn has enough confirmations', () => {
    const result = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      sidechainIdHex,
      currentSidechainHeight: 1243,
      requiredSidechainConfirmations: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.burn).toMatchObject({
      sidechainBlockNumber: 1234,
      sidechainConfirmations: 10,
      requiredSidechainConfirmations: 10,
    });
  });

  it('rejects unfinalized sidechain burns before trustless proof leaf construction', () => {
    const result = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      sidechainIdHex,
      currentSidechainHeight: 1235,
      requiredSidechainConfirmations: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('burn receipt has 2 sidechain confirmation(s), requires 10');
    expect(result.burn?.sidechainConfirmations).toBe(2);
    expect(result.burn?.requiredSidechainConfirmations).toBe(10);
  });

  it('fails closed when sidechain finality policy is incomplete or incoherent', () => {
    const missingRequired = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      currentSidechainHeight: 1243,
    });
    const missingHeight = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      requiredSidechainConfirmations: 10,
    });
    const zeroRequired = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      currentSidechainHeight: 1243,
      requiredSidechainConfirmations: 0,
    });
    const futureReceipt = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      currentSidechainHeight: 1233,
      requiredSidechainConfirmations: 1,
    });

    expect(missingRequired.errors).toContain(
      'required sidechain confirmations is required when current sidechain height is supplied',
    );
    expect(missingHeight.errors).toContain(
      'current sidechain height is required when required sidechain confirmations is supplied',
    );
    expect(zeroRequired.errors).toContain('required sidechain confirmations must be at least 1');
    expect(futureReceipt.errors).toContain(
      'current sidechain height must be greater than or equal to burn receipt block number',
    );
  });

  it('builds a canonical trustless burn leaf input from a verified PegOut burn', () => {
    const result = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      sidechainIdHex,
    });

    const leaf = buildTrustlessBurnLeafInputFromVerifiedPegOutBurn({
      burn: result.burns[0],
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex,
      recipientErgoTreeHashHex,
    });
    const canonicalLeaf = encodeTrustlessBurnLeaf(leaf);

    expect(leaf).toEqual({
      sidechainIdHex,
      sidechainBlockHashHex: blockHash,
      burnIdHex: derivedBurnId,
      sidechainTxHashHex: txHash,
      eventIndex: 7,
      recipientErgoTreeHashHex,
      amountNanoErg: '10000000',
      assetIdHex: '00'.repeat(32),
    });
    expect(canonicalLeaf.burnIdHex).toBe(derivedBurnId);
  });

  it('rejects verified PegOut burn leaf conversion when trustless identity inputs drift', () => {
    const result = extractVerifiedPegOutBurnsFromReceipt(receipt(), {
      bridgeAddress,
      sidechainIdHex,
    });
    const legacyBurn = { ...result.burns[0], burnId: `${txHash}:7` };

    expect(() => buildTrustlessBurnLeafInputFromVerifiedPegOutBurn({
      burn: legacyBurn,
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex,
      recipientErgoTreeHashHex,
    })).toThrow('verified burnId must match derived trustless burn ID');
    expect(() => buildTrustlessBurnLeafInputFromVerifiedPegOutBurn({
      burn: result.burns[0],
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex: '88'.repeat(32),
      recipientErgoTreeHashHex,
    })).toThrow('verified burnId must match derived trustless burn ID');
    expect(() => buildTrustlessBurnLeafInputFromVerifiedPegOutBurn({
      burn: result.burns[0],
      assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
      sidechainIdHex,
      recipientErgoTreeHashHex: 'aa',
    })).toThrow('recipientErgoTreeHash must be 32 bytes');
  });

  it('rejects missing and reverted receipts fail-closed', () => {
    const missing = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: null,
      bridgeAddress,
    });
    const reverted = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ status: 0 }),
      bridgeAddress,
    });

    expect(missing.ok).toBe(false);
    expect(missing.missing).toBe(true);
    expect(missing.errors).toContain('burn receipt not found');
    expect(reverted.ok).toBe(false);
    expect(reverted.reverted).toBe(true);
    expect(reverted.errors).toContain('burn receipt status is not successful');
  });

  it('rejects wrong bridge address, wrong topic, unparseable ABI, and multiple burns', () => {
    const wrongBridge = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ logs: [pegOutLog({ address: '0x00000000000000000000000000000000000000c2' })] }),
      bridgeAddress,
    });
    const wrongTopic = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ logs: [pegOutLog({ topics: ['0x' + '99'.repeat(32)] })] }),
      bridgeAddress,
    });
    const malformed = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ logs: [pegOutLog({ data: '0x1234' })] }),
      bridgeAddress,
    });
    const ambiguous = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ logs: [pegOutLog(), pegOutLog({ logIndex: 8 })] }),
      bridgeAddress,
    });

    expect(wrongBridge.ok).toBe(false);
    expect(wrongBridge.errors).toContain('burn receipt does not contain a verified PegOut burn');
    expect(wrongTopic.ok).toBe(false);
    expect(wrongTopic.errors).toContain('burn receipt does not contain a verified PegOut burn');
    expect(malformed.ok).toBe(false);
    expect(malformed.errors).toContain('burn receipt contains an unparseable PegOut log');
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.errors).toContain('burn receipt contains multiple verified PegOut burns; burnId/logIndex is required');
  });

  it('rejects receipt/log coherence mismatches and canonical block hash mismatches', () => {
    const result = extractVerifiedPegOutBurnsFromReceipt(
      receipt({
        logs: [pegOutLog({
          transactionHash: '0x' + '33'.repeat(32),
          blockNumber: 1235,
          blockHash: '0x' + '44'.repeat(32),
        })],
      }),
      { bridgeAddress, canonicalBlockHash: '55'.repeat(32) },
    );

    expect(result.errors).toContain('burn receipt block hash does not match canonical sidechain block');
    expect(result.errors).toContain('burn log transaction hash does not match receipt');
    expect(result.errors).toContain('burn log block number does not match receipt');
    expect(result.errors).toContain('burn log block hash does not match receipt');
  });

  it('rejects amount and recipient values that cannot be safely bound into the Ergo settlement root', () => {
    const invalidAmount = extractVerifiedPegOutBurnsFromReceipt(
      receipt({ logs: [pegOutLog({ amount: 9_999_999n })] }),
      { bridgeAddress },
    );
    const tooLargeAmount = extractVerifiedPegOutBurnsFromReceipt(
      receipt({ logs: [pegOutLog({ amount: 1n << 64n })] }),
      { bridgeAddress },
    );
    const invalidRecipient = extractVerifiedPegOutBurnsFromReceipt(
      receipt({ logs: [pegOutLog({ recipient: '0x0008cd04' + '44'.repeat(32) })] }),
      { bridgeAddress },
    );
    const compressedKey = extractVerifiedPegOutBurnsFromReceipt(
      receipt({ logs: [pegOutLog({ recipient: '0x03' + '55'.repeat(32) })] }),
      { bridgeAddress },
    );

    expect(invalidAmount.errors).toContain('PegOut amount is below the minimum peg-out amount');
    expect(tooLargeAmount.errors).toContain('PegOut amount exceeds the Ergo u64 encoding limit');
    expect(invalidRecipient.errors).toContain('PegOut recipient must be a 33-byte compressed key or 36-byte P2PK ErgoTree');
    expect(compressedKey.errors).toEqual([]);
    expect(compressedKey.burns[0].ergoRecipientAddress).toBe('03' + '55'.repeat(32));
  });

  it('rejects stored row mismatches for amount, recipient, user, block hash, and log index', () => {
    const result = verifyPegOutBurnReceipt({
      pegOut: pegOut({
        user: '0x0000000000000000000000000000000000000002',
        amount: 11_000_000n,
        ergoRecipientAddress: '0008cd02' + '55'.repeat(32),
        sidechainBlockHash: '66'.repeat(32),
        sidechainLogIndex: 8,
      }),
      receipt: receipt(),
      bridgeAddress,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('PegOut amount does not match peg-out row');
    expect(result.errors).toContain('PegOut recipient does not match peg-out row');
    expect(result.errors).toContain('PegOut user does not match peg-out row');
    expect(result.errors).toContain('PegOut block hash does not match peg-out row');
    expect(result.errors).toContain('PegOut log index does not match peg-out row');
  });

  it('classifies canonical burn loss as terminal while operational uncertainty remains retryable', () => {
    const confirmed = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      canonicalBlockHash: blockHash,
      currentSidechainHeight: 1243,
      requiredSidechainConfirmations: 10,
    });
    const unfinalized = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      canonicalBlockHash: blockHash,
      currentSidechainHeight: 1235,
      requiredSidechainConfirmations: 10,
    });
    const replacedBlock = verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt(),
      bridgeAddress,
      canonicalBlockHash: '77'.repeat(32),
      currentSidechainHeight: 1243,
      requiredSidechainConfirmations: 10,
    });

    expect(classifyPegOutBurnForSettlement(confirmed)).toBe('confirmed');
    expect(classifyPegOutBurnForSettlement(unfinalized)).toBe('unknown');
    expect(classifyPegOutBurnForSettlement(replacedBlock)).toBe('reverted');
    expect(classifyPegOutBurnForSettlement(verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: null,
      bridgeAddress,
    }))).toBe('reverted');
    expect(classifyPegOutBurnForSettlement(verifyPegOutBurnReceipt({
      pegOut: pegOut(),
      receipt: receipt({ status: 0 }),
      bridgeAddress,
    }))).toBe('reverted');
  });
});
