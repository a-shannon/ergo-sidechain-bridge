import { ethers } from 'ethers';
import { describe, expect, it, vi } from 'vitest';

import {
  assertAuthenticatedSettlementStableSidechainViewProvenance,
  assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance,
  createAuthenticatedSettlementSidechainObservationSourcePair,
  destroyAuthenticatedSettlementSidechainObservationSourcePair,
  observeMatchingAuthenticatedSettlementStableSidechainViews,
  observeAuthenticatedSettlementStableSidechainView,
} from './authenticated-settlement-sidechain-view.js';
import type { ParsedPegOut } from './sidechain-client.js';
import { startStableSidechainJsonRpcFixture } from './stable-sidechain-json-rpc.test-helper.js';

const bridgeAddress = '0x00000000000000000000000000000000000000b1';
const user = '0x0000000000000000000000000000000000000001';
const sidechainIdHex = '99'.repeat(32);
const txHash = '11'.repeat(32);
const blockHash = '22'.repeat(32);
const replacementBlockHash = '33'.repeat(32);
const tipHash = '66'.repeat(32);
const replacementTipHash = '77'.repeat(32);
const burnId = '0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76';
const recipient = '0008cd02' + '44'.repeat(32);
const bridgeInterface = new ethers.Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

const pegOut: ParsedPegOut = {
  user,
  amount: 10_000_000n,
  ergoRecipientAddress: recipient,
  sidechainTxHash: txHash,
  sidechainBlockNumber: 1234,
  sidechainBlockHash: blockHash,
  sidechainLogIndex: 7,
};
const candidate = {
  candidateId: '55'.repeat(32),
  burnId,
  burnTxHash: txHash,
  sidechainId: sidechainIdHex,
  sidechainHeight: 1234n,
  sidechainBlockHash: blockHash,
  sidechainLogIndex: 7,
};

function receipt() {
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegOut')!,
    [user, 10_000_000n, `0x${recipient}`],
  );
  return {
    status: 1,
    hash: `0x${txHash}`,
    blockNumber: 1234,
    blockHash: `0x${blockHash}`,
    logs: [{
      address: bridgeAddress,
      topics: [...encoded.topics],
      data: encoded.data,
      transactionHash: `0x${txHash}`,
      blockNumber: 1234,
      blockHash: `0x${blockHash}`,
      logIndex: 7,
    }],
  };
}

function source(input: {
  heights?: number[];
  receipt?: unknown;
  canonicalBlockHash?: string;
  tipHashes?: string[];
} = {}) {
  const heights = [...(input.heights ?? [1243, 1243])];
  const tipHashes = [...(input.tipHashes ?? [tipHash, tipHash])];
  return {
    getBlockNumber: vi.fn(async () => heights.shift() ?? 1243),
    getTransactionReceipt: vi.fn(async () =>
      Object.prototype.hasOwnProperty.call(input, 'receipt') ? input.receipt : receipt()),
    getBlock: vi.fn(async (blockNumber: number) => ({
      hash: blockNumber === pegOut.sidechainBlockNumber
        ? input.canonicalBlockHash ?? `0x${blockHash}`
        : `0x${tipHashes.shift() ?? tipHash}`,
    })),
  };
}

describe('authenticated settlement stable sidechain view', () => {
  it('constructs an opaque production pair from validated distinct RPC URLs', async () => {
    const primary = await startStableSidechainJsonRpcFixture(source());
    const witness = await startStableSidechainJsonRpcFixture(source());
    const sources = createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    try {
      expect(sources.sourceIdsHex).toHaveLength(2);
      expect(new Set(sources.sourceIdsHex).size).toBe(2);
      expect(Object.isFrozen(sources)).toBe(true);
      expect(sources).not.toHaveProperty('primarySource');
      expect(sources).not.toHaveProperty('witnessSource');
    } finally {
      destroyAuthenticatedSettlementSidechainObservationSourcePair(sources);
      await Promise.all([primary.close(), witness.close()]);
    }

    expect(() => createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: 'https://SAME.sidechain.example',
      witnessRpcUrl: 'https://same.sidechain.example/',
    })).toThrow(/distinct RPC origins/i);
    expect(() => createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: 'https://operator:credential@primary.sidechain.example/rpc',
      witnessRpcUrl: 'https://witness.sidechain.example/rpc',
    })).toThrow(/must not contain credentials/i);
    expect(() => createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: 'https://primary.sidechain.example/rpc?token=value',
      witnessRpcUrl: 'https://witness.sidechain.example/rpc',
    })).toThrow(/query parameters/i);
  });

  it('binds the exact finalized burn under one stable post-check view', async () => {
    const stableSource = source();
    const view = await observeAuthenticatedSettlementStableSidechainView({
      source: stableSource,
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    });

    expect(view).toEqual(expect.objectContaining({
      candidateId: candidate.candidateId,
      burnIdHex: burnId,
      sidechainTxHashHex: txHash,
      sidechainHeight: 1234n,
      executionBlockHashHex: blockHash,
      eventIndex: 7,
      amountNanoErg: 10_000_000n,
      recipientErgoTreeHex: recipient,
      observedTipHeight: 1243n,
      observedTipHashHex: tipHash,
      confirmations: 10n,
      requiredConfirmations: 10n,
    }));
    expect(stableSource.getTransactionReceipt).toHaveBeenCalledWith(`0x${txHash}`);
    expect(() => assertAuthenticatedSettlementStableSidechainViewProvenance(view))
      .not.toThrow();
    expect(() => assertAuthenticatedSettlementStableSidechainViewProvenance(
      structuredClone(view),
    )).toThrow(/provenance is missing/i);
  });

  it('binds two matching stable views to one opaque distinct-origin source pair', async () => {
    const primary = await startStableSidechainJsonRpcFixture(source());
    const witness = await startStableSidechainJsonRpcFixture(source());
    const sources = createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    try {
      const matching = await observeMatchingAuthenticatedSettlementStableSidechainViews({
        sources,
        bridgeAddress,
        sidechainIdHex,
        requiredConfirmations: 10,
        candidate: candidate as any,
        pegOut,
      });

      expect(matching.consensus).toEqual(expect.objectContaining({
        view: matching.primaryView,
        sourceCount: 2,
        sourceIdsHex: expect.arrayContaining([...sources.sourceIdsHex]),
      }));
      expect(matching.witnessView.viewDigestHex).toBe(matching.primaryView.viewDigestHex);
      expect(() => assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance(
        matching.consensus,
      )).not.toThrow();
      expect(() => assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance(
        structuredClone(matching.consensus),
      )).toThrow(/provenance is missing/i);
    } finally {
      destroyAuthenticatedSettlementSidechainObservationSourcePair(sources);
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('rejects equivalent origins, cloned pairs, closed pairs, and disagreeing RPC views', async () => {
    expect(() => createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: 'https://SAME.sidechain.example',
      witnessRpcUrl: 'https://same.sidechain.example/',
    })).toThrow(/distinct RPC origins/i);

    const primary = await startStableSidechainJsonRpcFixture(source());
    const witness = await startStableSidechainJsonRpcFixture(source());
    const sources = createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    try {
      await expect(observeMatchingAuthenticatedSettlementStableSidechainViews({
        sources: { ...sources } as any,
        bridgeAddress,
        sidechainIdHex,
        requiredConfirmations: 10,
        candidate: candidate as any,
        pegOut,
      })).rejects.toThrow(/source-pair provenance is missing/i);
      destroyAuthenticatedSettlementSidechainObservationSourcePair(sources);
      await expect(observeMatchingAuthenticatedSettlementStableSidechainViews({
        sources,
        bridgeAddress,
        sidechainIdHex,
        requiredConfirmations: 10,
        candidate: candidate as any,
        pegOut,
      })).rejects.toThrow(/source pair is closed/i);
    } finally {
      destroyAuthenticatedSettlementSidechainObservationSourcePair(sources);
      await Promise.all([primary.close(), witness.close()]);
    }

    const disagreeingPrimary = await startStableSidechainJsonRpcFixture(source());
    const disagreeingWitness = await startStableSidechainJsonRpcFixture(
      source({ heights: [1244, 1244] }),
    );
    const disagreeingSources = createAuthenticatedSettlementSidechainObservationSourcePair({
      primaryRpcUrl: disagreeingPrimary.rpcUrl,
      witnessRpcUrl: disagreeingWitness.rpcUrl,
    });
    try {
      await expect(observeMatchingAuthenticatedSettlementStableSidechainViews({
        sources: disagreeingSources,
        bridgeAddress,
        sidechainIdHex,
        requiredConfirmations: 10,
        candidate: candidate as any,
        pegOut,
      })).rejects.toThrow(/sources disagree/i);
    } finally {
      destroyAuthenticatedSettlementSidechainObservationSourcePair(disagreeingSources);
      await Promise.all([disagreeingPrimary.close(), disagreeingWitness.close()]);
    }
  });

  it('rejects moving, missing, replaced, or under-confirmed burn observations', async () => {
    await expect(observeAuthenticatedSettlementStableSidechainView({
      source: source({ heights: [1243, 1244] }),
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    })).rejects.toThrow(/canonical view changed/i);

    await expect(observeAuthenticatedSettlementStableSidechainView({
      source: source({ tipHashes: [tipHash, replacementTipHash] }),
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    })).rejects.toThrow(/canonical tip changed at the same height/i);

    await expect(observeAuthenticatedSettlementStableSidechainView({
      source: source({ receipt: null }),
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    })).rejects.toThrow(/receipt is unavailable/i);

    await expect(observeAuthenticatedSettlementStableSidechainView({
      source: source({ canonicalBlockHash: `0x${replacementBlockHash}` }),
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    })).rejects.toThrow(/not confirmed.*block hash/i);

    await expect(observeAuthenticatedSettlementStableSidechainView({
      source: source({ heights: [1235, 1235] }),
      bridgeAddress,
      sidechainIdHex,
      requiredConfirmations: 10,
      candidate: candidate as any,
      pegOut,
    })).rejects.toThrow(/not confirmed.*requires 10/i);
  });
});
