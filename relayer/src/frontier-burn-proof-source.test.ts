import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  assertFrontierReturnedReceiptBurnSetAgreementProvenance,
  collectFrontierBurnProofForPegOut,
  collectFrontierReturnedReceiptBurnSetFromDistinctSources,
  type FrontierBurnProofProvider,
} from './frontier-burn-proof-source.js';
import { FRONTIER_PEG_OUT_TOPIC } from './frontier-bridge-event-root.js';
import type { ParsedPegOut } from './sidechain-client.js';
import { verifyTrustlessBurnInclusionProof } from './trustless-burn-proof.js';

const SIDECHAIN_ID = '11'.repeat(32);
const BLOCK_HASH = '22'.repeat(32);
const REORG_HASH = '23'.repeat(32);
const BRIDGE = `0x${'aa'.repeat(20)}`;
const OTHER_CONTRACT = `0x${'bb'.repeat(20)}`;
const USER_A = `0x${'01'.repeat(20)}`;
const USER_B = `0x${'02'.repeat(20)}`;
const TX_A = '31'.repeat(32);
const TX_B = '32'.repeat(32);
const KEY_A = `02${'41'.repeat(32)}`;
const KEY_B = `03${'42'.repeat(32)}`;
const TREE_A = `0008cd${KEY_A}`;
const TREE_B = `0008cd${KEY_B}`;
const BLOCK_NUMBER = 1234;

function uint256Word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function pegOutData(amount: bigint, recipientHex: string): string {
  const recipient = recipientHex.replace(/^0x/, '');
  const padded = recipient.padEnd(Math.ceil(recipient.length / 64) * 64, '0');
  return `0x${uint256Word(amount)}${uint256Word(64n)}${uint256Word(BigInt(recipient.length / 2))}${padded}`;
}

function pegOutLog(input: {
  logIndex: number;
  user: string;
  amount: bigint;
  recipient: string;
  address?: string;
}) {
  return {
    address: input.address ?? BRIDGE,
    topics: [FRONTIER_PEG_OUT_TOPIC, `0x${input.user.slice(2).padStart(64, '0')}`],
    data: pegOutData(input.amount, input.recipient),
    logIndex: `0x${input.logIndex.toString(16)}`,
    blockHash: `0x${BLOCK_HASH}`,
    blockNumber: `0x${BLOCK_NUMBER.toString(16)}`,
  };
}

function canonicalReceipts() {
  return [
    {
      status: '0x1',
      transactionIndex: '0x0',
      transactionHash: `0x${TX_A}`,
      blockHash: `0x${BLOCK_HASH}`,
      blockNumber: `0x${BLOCK_NUMBER.toString(16)}`,
      logs: [
        pegOutLog({
          logIndex: 0,
          user: USER_A,
          amount: 9_000_000n,
          recipient: KEY_A,
          address: OTHER_CONTRACT,
        }),
        pegOutLog({
          logIndex: 1,
          user: USER_A,
          amount: 1_000_000n,
          recipient: KEY_A,
        }),
      ],
    },
    {
      status: '0x1',
      transactionIndex: '0x1',
      transactionHash: `0x${TX_B}`,
      blockHash: `0x${BLOCK_HASH}`,
      blockNumber: BLOCK_NUMBER,
      logs: [pegOutLog({
        logIndex: 2,
        user: USER_B,
        amount: 2_000_000n,
        recipient: TREE_B,
      })],
    },
  ];
}

function pegOut(overrides: Partial<ParsedPegOut> = {}): ParsedPegOut {
  return {
    user: USER_B.toUpperCase().replace('0X', '0x'),
    amount: 2_000_000n,
    ergoRecipientAddress: TREE_B.toUpperCase(),
    sidechainTxHash: `0x${TX_B.toUpperCase()}`,
    sidechainBlockNumber: BLOCK_NUMBER,
    sidechainBlockHash: `0x${BLOCK_HASH.toUpperCase()}`,
    sidechainLogIndex: 2,
    ...overrides,
  };
}

function providerFixture(options: {
  beforeHash?: string;
  afterHash?: string;
  receipts?: unknown;
  rpcError?: Error;
} = {}): { provider: FrontierBurnProofProvider; calls: Array<{ method: string; params?: unknown[] }> } {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  let blockCalls = 0;
  const provider: FrontierBurnProofProvider = {
    async getBlock(number) {
      calls.push({ method: 'getBlock', params: [number] });
      blockCalls += 1;
      return {
        number: BLOCK_NUMBER,
        hash: `0x${blockCalls === 1
          ? (options.beforeHash ?? BLOCK_HASH)
          : (options.afterHash ?? options.beforeHash ?? BLOCK_HASH)}`,
      };
    },
    async getBlockReceipts(blockNumber) {
      calls.push({ method: 'getBlockReceipts', params: [blockNumber] });
      if (options.rpcError) throw options.rpcError;
      return options.receipts ?? canonicalReceipts();
    },
  };
  return { provider, calls };
}

function collect(
  provider: FrontierBurnProofProvider,
  persistedPegOut: ParsedPegOut = pegOut(),
) {
  return collectFrontierBurnProofForPegOut({
    provider,
    pegOut: persistedPegOut,
    sidechainIdHex: SIDECHAIN_ID,
    bridgeAddress: BRIDGE,
    maxBurns: 10,
  });
}

describe('collectFrontierBurnProofForPegOut', () => {
  it('builds and verifies the exact proof from a canonical multi-burn block', async () => {
    const { provider, calls } = providerFixture();

    const result = await collect(provider);

    expect(calls).toEqual([
      { method: 'getBlock', params: [BLOCK_NUMBER] },
      { method: 'getBlockReceipts', params: [BLOCK_NUMBER] },
      { method: 'getBlock', params: [BLOCK_NUMBER] },
    ]);
    expect(result.proof).toMatchObject({
      leafIndex: 1,
      leafCount: 2,
      leaf: {
        sidechainBlockHashHex: BLOCK_HASH,
        sidechainTxHashHex: TX_B,
        eventIndex: 2,
        recipientErgoTreeHashHex: result.settlementIdentity.recipientErgoTreeHashHex,
        amountNanoErg: '2000000',
      },
    });
    expect(result.proof.proof).toHaveLength(1);
    expect(verifyTrustlessBurnInclusionProof({
      leaf: result.proof.leaf,
      bridgeEventRootHex: result.proof.bridgeEventRootHex,
      proof: result.proof.proof,
    })).toBe(true);
    expect(result.settlementIdentity).toEqual({
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: result.proof.leaf.burnIdHex,
      bridgeEventRootHex: result.proof.bridgeEventRootHex,
      recipientErgoTreeHashHex: result.proof.leaf.recipientErgoTreeHashHex,
      amountNanoErg: '2000000',
      assetIdHex: result.proof.leaf.assetIdHex,
      trustlessBurnProof: result.proof.proof,
    });
  });

  it.each([
    ['transaction hash', { sidechainTxHash: `0x${TX_A}` }],
    ['global log index', { sidechainLogIndex: 1 }],
    ['user', { user: USER_A }],
    ['amount', { amount: 2_000_001n }],
    ['recipient', { ergoRecipientAddress: TREE_A }],
    ['block number', { sidechainBlockNumber: BLOCK_NUMBER + 1 }],
  ] satisfies Array<[string, Partial<ParsedPegOut>]>)('rejects a persisted target %s mismatch', async (_label, override) => {
    const { provider } = providerFixture();

    await expect(collect(provider, pegOut(override))).rejects.toThrow(/persisted peg-out|target/i);
  });

  it.each([
    ['block hash', { blockHash: `0x${REORG_HASH}` }],
    ['block number', { blockNumber: `0x${(BLOCK_NUMBER + 1).toString(16)}` }],
  ])('rejects a receipt %s mismatch', async (_label, override) => {
    const receipts = canonicalReceipts().map(receipt => ({ ...receipt, ...override }));
    const { provider } = providerFixture({ receipts });

    await expect(collect(provider)).rejects.toThrow(/receipt.*block/i);
  });

  it('rejects a reorg already visible in the first canonical block fetch', async () => {
    const { provider } = providerFixture({ beforeHash: REORG_HASH });

    await expect(collect(provider)).rejects.toThrow(/persisted peg-out.*block hash/i);
  });

  it('rejects hash drift between the before and after canonical block fetches', async () => {
    const { provider } = providerFixture({ afterHash: REORG_HASH });

    await expect(collect(provider)).rejects.toThrow(/hash drift|reorg/i);
  });

  it('propagates unsupported receipt RPC errors for caller retry handling', async () => {
    const unsupported = new Error('Method not found: eth_getBlockReceipts');
    const { provider } = providerFixture({ rpcError: unsupported });

    await expect(collect(provider)).rejects.toBe(unsupported);
  });

  it('selects one burn by global log index when an EVM transaction emits multiple PegOut events', async () => {
    const receipts = [{
      status: '0x1',
      transactionIndex: '0x0',
      transactionHash: `0x${TX_B}`,
      blockHash: `0x${BLOCK_HASH}`,
      blockNumber: `0x${BLOCK_NUMBER.toString(16)}`,
      logs: [
        pegOutLog({
          logIndex: 0,
          user: USER_A,
          amount: 1_000_000n,
          recipient: KEY_A,
        }),
        pegOutLog({
          logIndex: 1,
          user: USER_B,
          amount: 2_000_000n,
          recipient: TREE_B,
        }),
      ],
    }];
    const { provider } = providerFixture({ receipts });

    const result = await collect(provider, pegOut({
      sidechainLogIndex: 1,
      sidechainTxHash: `0x${TX_B}`,
      user: USER_B,
      amount: 2_000_000n,
      ergoRecipientAddress: TREE_B,
    }));

    expect(result.proof).toMatchObject({
      leafCount: 2,
      leafIndex: 1,
      leaf: {
        sidechainTxHashHex: TX_B,
        eventIndex: 1,
        amountNanoErg: '2000000',
      },
    });
    expect(verifyTrustlessBurnInclusionProof({
      leaf: result.proof.leaf,
      bridgeEventRootHex: result.proof.bridgeEventRootHex,
      proof: result.proof.proof,
    })).toBe(true);
  });

  it('binds the returned receipt-derived burn set across two distinct read-only sources', async () => {
    const primary = providerFixture();
    const witness = providerFixture();

    const agreement =
      await collectFrontierReturnedReceiptBurnSetFromDistinctSources({
      primary: {
        provider: primary.provider,
        sourceIdHex: '61'.repeat(32),
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockNumber: BLOCK_NUMBER,
        executionBlockHashHex: BLOCK_HASH,
        bridgeAddress: BRIDGE,
        maxBurns: 10,
      },
      witness: {
        provider: witness.provider,
        sourceIdHex: '62'.repeat(32),
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockNumber: BLOCK_NUMBER,
        executionBlockHashHex: BLOCK_HASH,
        bridgeAddress: BRIDGE,
        maxBurns: 10,
      },
    });

    expect(agreement.view).toMatchObject({
      sidechainIdHex: SIDECHAIN_ID,
      executionBlockNumber: BLOCK_NUMBER,
      executionBlockHashHex: BLOCK_HASH,
      bridgeAddress: BRIDGE,
      burnLeafCount: 2,
    });
    expect(agreement.view.burns.map(burn => ({
      sidechainTxHashHex: burn.sidechainTxHashHex,
      eventIndex: burn.eventIndex,
      amountNanoErg: burn.amountNanoErg,
    }))).toEqual([
      {
        sidechainTxHashHex: TX_A,
        eventIndex: 1,
        amountNanoErg: '1000000',
      },
      {
        sidechainTxHashHex: TX_B,
        eventIndex: 2,
        amountNanoErg: '2000000',
      },
    ]);
    expect(agreement.sources.sourceIdsHex)
      .toEqual(['61'.repeat(32), '62'.repeat(32)]);
    expect(agreement.boundary).toEqual({
      distinctSourceInstancesVerified: true,
      exactReturnedBurnSetAgreementVerified: true,
      receiptArrayCompletenessAuthenticated: false,
      operationalIndependenceEstablished: false,
      sourceConsensusEstablished: false,
      sidechainFinalityEstablished: false,
      mintAuthorized: false,
      payoutAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(() =>
      assertFrontierReturnedReceiptBurnSetAgreementProvenance(agreement)
    ).not.toThrow();
    expect(() =>
      assertFrontierReturnedReceiptBurnSetAgreementProvenance(
        structuredClone(agreement),
      )
    ).toThrow(/provenance/i);
  });

  it('rejects same-source and divergent returned burn-set observations', async () => {
    const primary = providerFixture();
    const divergentReceipts = canonicalReceipts();
    divergentReceipts[1].logs[0] = pegOutLog({
      logIndex: 2,
      user: USER_B,
      amount: 2_000_001n,
      recipient: TREE_B,
    });
    const witness = providerFixture({ receipts: divergentReceipts });
    const common = {
      sidechainIdHex: SIDECHAIN_ID,
      executionBlockNumber: BLOCK_NUMBER,
      executionBlockHashHex: BLOCK_HASH,
      bridgeAddress: BRIDGE,
      maxBurns: 10,
    };

    await expect(
      collectFrontierReturnedReceiptBurnSetFromDistinctSources({
        primary: {
          provider: primary.provider,
          sourceIdHex: '63'.repeat(32),
          ...common,
        },
        witness: {
          provider: primary.provider,
          sourceIdHex: '64'.repeat(32),
          ...common,
        },
      }),
    ).rejects.toThrow(/distinct source/i);

    await expect(
      collectFrontierReturnedReceiptBurnSetFromDistinctSources({
        primary: {
          provider: primary.provider,
          sourceIdHex: '63'.repeat(32),
          ...common,
        },
        witness: {
          provider: witness.provider,
          sourceIdHex: '63'.repeat(32),
          ...common,
        },
      }),
    ).rejects.toThrow(/distinct source/i);

    await expect(
      collectFrontierReturnedReceiptBurnSetFromDistinctSources({
        primary: {
          provider: primary.provider,
          sourceIdHex: '63'.repeat(32),
          ...common,
        },
        witness: {
          provider: witness.provider,
          sourceIdHex: '64'.repeat(32),
          ...common,
        },
      }),
    ).rejects.toThrow(/disagree/i);
  });

  it('has no signing, submission, or broadcast surface', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'frontier-burn-proof-source.ts'), 'utf8');

    expect(source).not.toMatch(
      /signAndSubmit|sendTransaction|submitTransaction|broadcastTransaction|fleet-signer/,
    );
    expect(source).toContain('provider.getBlockReceipts(blockNumber)');
    expect(source).not.toMatch(/provider\.send\(/);
  });
});
