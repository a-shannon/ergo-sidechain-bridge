import { Interface } from 'ethers';
import { describe, expect, it } from 'vitest';

import { getSidechainBackingSourceIdentityConfig } from '../config.js';
import {
  assertFrontierBackingReadAgreementCaptureOrder,
  assertFrontierBackingReadAgreementNodeIdentityBinding,
  assertFrontierBackingReadAgreementProvenance,
  assertFrontierBackingReadAgreementSourcesSealed,
  createFrontierBackingReadAgreementSources,
  observeFrontierBackingReadAgreement,
  revalidateFrontierBackingReadAgreementPin,
  sealFrontierBackingReadAgreementSources,
  type FrontierBackingPegOutLike,
  type FrontierBackingReadClient,
} from './frontier-backing-read-agreement.js';

const BRIDGE = `0x${'11'.repeat(20)}`;
const USER = `0x${'22'.repeat(20)}`;
const SERG = `0x${'23'.repeat(20)}`;
const SERG_OWNER = `0x${'24'.repeat(20)}`;
const SIDECHAIN_ID = '33'.repeat(32);
const CHAIN_ID = '31337';
const BRIDGE_CODE_HASH = '34'.repeat(32);
const SERG_CODE_HASH = '35'.repeat(32);
const TRANSACTION_HASH = '44'.repeat(32);
const BURN_BLOCK_HASH = '55'.repeat(32);
const PIN_BLOCK_HASH = '66'.repeat(32);
const REPLACEMENT_PIN_BLOCK_HASH = '77'.repeat(32);
const RECIPIENT = `02${'88'.repeat(32)}`;
const PINNED_HEIGHT = 2_001;
const BURN_HEIGHT = 123;
const LOG_INDEX = 7;
const AMOUNT = 25_000_000n;
const SUPPLY = 5_000_000_000n;
const PEG_OUT_INTERFACE = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

interface FakeOptions {
  readonly supply?: bigint;
  readonly omitEvent?: boolean;
  readonly receiptAmount?: bigint;
  readonly pinHashes?: readonly string[];
  readonly tipHeights?: readonly number[];
  readonly duplicateEvent?: boolean;
  readonly runtimeIdentity?: Readonly<{
    chainId?: string;
    bridgeCodeHashHex?: string;
    sergAddress?: string;
    sergCodeHashHex?: string;
    sergOwnerAddress?: string;
  }>;
}

class FakeFrontierBackingClient implements FrontierBackingReadClient {
  readonly scanCalls: Array<readonly [number, number]> = [];
  private pinReadCount = 0;
  private tipReadCount = 0;
  private readonly event: FrontierBackingPegOutLike;
  private readonly receipt: Record<string, unknown>;

  constructor(private readonly options: FakeOptions = {}) {
    const encoded = PEG_OUT_INTERFACE.encodeEventLog(
      PEG_OUT_INTERFACE.getEvent('PegOut')!,
      [USER, options.receiptAmount ?? AMOUNT, `0x${RECIPIENT}`],
    );
    this.event = Object.freeze({
      user: USER,
      amount: AMOUNT,
      ergoRecipientAddress: `0x${RECIPIENT}`,
      sidechainTxHash: `0x${TRANSACTION_HASH}`,
      sidechainBlockNumber: BURN_HEIGHT,
      sidechainBlockHash: `0x${BURN_BLOCK_HASH}`,
      sidechainLogIndex: LOG_INDEX,
    });
    this.receipt = Object.freeze({
      status: 1,
      hash: `0x${TRANSACTION_HASH}`,
      blockNumber: BURN_HEIGHT,
      blockHash: `0x${BURN_BLOCK_HASH}`,
      logs: Object.freeze([Object.freeze({
        address: BRIDGE,
        topics: Object.freeze(encoded.topics),
        data: encoded.data,
        transactionHash: `0x${TRANSACTION_HASH}`,
        blockNumber: BURN_HEIGHT,
        blockHash: `0x${BURN_BLOCK_HASH}`,
        index: LOG_INDEX,
      })]),
    });
  }

  async getCurrentBlockNumber(): Promise<number> {
    const heights = this.options.tipHeights ?? [PINNED_HEIGHT];
    const height = heights[Math.min(this.tipReadCount, heights.length - 1)];
    this.tipReadCount += 1;
    return height;
  }

  async getBlock(blockNumber: number) {
    if (blockNumber === BURN_HEIGHT) {
      return { number: blockNumber, hash: `0x${BURN_BLOCK_HASH}` };
    }
    if (blockNumber !== PINNED_HEIGHT) return null;
    const hashes = this.options.pinHashes ?? [PIN_BLOCK_HASH];
    const hash = hashes[Math.min(this.pinReadCount, hashes.length - 1)];
    this.pinReadCount += 1;
    return { number: blockNumber, hash: `0x${hash}` };
  }

  async scanForPegOuts(fromBlock: number, toBlock: number) {
    this.scanCalls.push([fromBlock, toBlock]);
    if (
      this.options.omitEvent
      || BURN_HEIGHT < fromBlock
      || BURN_HEIGHT > toBlock
    ) {
      return [];
    }
    return this.options.duplicateEvent
      ? [this.event, this.event]
      : [this.event];
  }

  async getTransactionReceipt(transactionHash: string): Promise<unknown> {
    return transactionHash.toLowerCase() === `0x${TRANSACTION_HASH}`
      ? this.receipt
      : null;
  }

  async getTotalSERGSupplyAtBlockHash(blockHashHex: string): Promise<bigint> {
    if (blockHashHex !== PIN_BLOCK_HASH) throw new Error('unexpected supply pin');
    return this.options.supply ?? SUPPLY;
  }

  async getRuntimeIdentityAtBlockHash(blockHashHex: string) {
    if (blockHashHex !== PIN_BLOCK_HASH) {
      throw new Error('unexpected runtime identity pin');
    }
    return {
      chainId: this.options.runtimeIdentity?.chainId ?? CHAIN_ID,
      bridgeCodeHashHex:
        this.options.runtimeIdentity?.bridgeCodeHashHex ?? BRIDGE_CODE_HASH,
      sergAddress: this.options.runtimeIdentity?.sergAddress ?? SERG,
      sergCodeHashHex:
        this.options.runtimeIdentity?.sergCodeHashHex ?? SERG_CODE_HASH,
      sergOwnerAddress:
        this.options.runtimeIdentity?.sergOwnerAddress ?? SERG_OWNER,
    };
  }
}

function sources(
  primary: FrontierBackingReadClient,
  witness: FrontierBackingReadClient,
) {
  return createFrontierBackingReadAgreementSources({
    primaryClient: primary,
    primaryRpcUrl: 'http://127.0.0.1:9945',
    primaryNodeIdentityDigestHex: '10'.repeat(32),
    primaryAdministrationIdentityDigestHex: '20'.repeat(32),
    witnessClient: witness,
    witnessRpcUrl: 'http://127.0.0.1:9946',
    witnessNodeIdentityDigestHex: '30'.repeat(32),
    witnessAdministrationIdentityDigestHex: '40'.repeat(32),
    expectedChainId: CHAIN_ID,
    expectedBridgeAddress: BRIDGE,
    expectedBridgeCodeHashHex: BRIDGE_CODE_HASH,
    expectedSergAddress: SERG,
    expectedSergCodeHashHex: SERG_CODE_HASH,
  });
}

describe('Frontier backing read agreement', () => {
  it('binds exact paginated burn inventory, receipt semantics, supply, and pin', async () => {
    const primary = new FakeFrontierBackingClient();
    const witness = new FakeFrontierBackingClient();
    const pair = sources(primary, witness);

    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    assertFrontierBackingReadAgreementProvenance(pair, snapshot);
    expect(() => assertFrontierBackingReadAgreementNodeIdentityBinding(pair, {
      primaryNodeIdentityDigestHex: '10'.repeat(32),
      witnessNodeIdentityDigestHex: '30'.repeat(32),
    })).not.toThrow();
    expect(() => assertFrontierBackingReadAgreementNodeIdentityBinding(pair, {
      primaryNodeIdentityDigestHex: '11'.repeat(32),
      witnessNodeIdentityDigestHex: '30'.repeat(32),
    })).toThrow(/owned process identities/i);
    expect(() => assertFrontierBackingReadAgreementNodeIdentityBinding(pair, {
      primaryNodeIdentityDigestHex: '30'.repeat(32),
      witnessNodeIdentityDigestHex: '10'.repeat(32),
    })).toThrow(/owned process identities/i);
    expect(snapshot.scanFromHeight).toBe(0);
    expect(snapshot.scanPageSize).toBe(2_000);
    expect(snapshot.scanPageCount).toBe(2);
    expect(snapshot.readerTipFloorHeight).toBe(PINNED_HEIGHT);
    expect(snapshot.readerTipCeilingHeight).toBe(PINNED_HEIGHT);
    expect(snapshot.maxReaderTipLagBlocks).toBe(2);
    expect(snapshot.pinnedBlockHashHex).toBe(PIN_BLOCK_HASH);
    expect(snapshot.totalSupplyNanoErg).toBe(SUPPLY);
    expect(snapshot.observedPegOutCount).toBe(1);
    expect(snapshot.pegOuts[0]).toEqual({
      user: USER,
      amount: AMOUNT,
      ergoRecipientAddress: RECIPIENT,
      sidechainTxHash: TRANSACTION_HASH,
      sidechainBlockNumber: BURN_HEIGHT,
      sidechainBlockHash: BURN_BLOCK_HASH,
      sidechainLogIndex: LOG_INDEX,
    });
    expect(primary.scanCalls).toEqual([[0, 1_999], [2_000, 2_001]]);
    expect(witness.scanCalls).toEqual([[0, 1_999], [2_000, 2_001]]);
    await expect(
      revalidateFrontierBackingReadAgreementPin(pair, snapshot),
    ).resolves.toBeUndefined();
    expect(() => assertFrontierBackingReadAgreementProvenance(
      pair,
      { ...snapshot },
    )).toThrow(/provenance/i);
  });

  it('retains a private monotonic capture order for one source pair', async () => {
    const pair = sources(
      new FakeFrontierBackingClient(),
      new FakeFrontierBackingClient(),
    );
    const first = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });
    const second = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    expect(() => assertFrontierBackingReadAgreementCaptureOrder(
      pair,
      [first, second],
    )).not.toThrow();
    expect(() => assertFrontierBackingReadAgreementCaptureOrder(
      pair,
      [second, first],
    )).toThrow(/capture order/i);
    expect(() => assertFrontierBackingReadAgreementCaptureOrder(
      pair,
      [first, first],
    )).toThrow(/capture order/i);
  });

  it('retains snapshot provenance while sealing every later transport read', async () => {
    const primary = new FakeFrontierBackingClient();
    const witness = new FakeFrontierBackingClient();
    const pair = sources(primary, witness);
    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    sealFrontierBackingReadAgreementSources(pair);

    expect(() => assertFrontierBackingReadAgreementSourcesSealed(pair))
      .not.toThrow();
    expect(() => assertFrontierBackingReadAgreementProvenance(pair, snapshot))
      .not.toThrow();
    expect(() => assertFrontierBackingReadAgreementCaptureOrder(pair, [snapshot]))
      .not.toThrow();
    await expect(observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/sealed.*transport/i);
    await expect(
      revalidateFrontierBackingReadAgreementPin(pair, snapshot),
    ).rejects.toThrow(/sealed.*transport/i);
    expect(primary.scanCalls).toHaveLength(2);
    expect(witness.scanCalls).toHaveLength(2);
  });

  it('rejects a missing event or a same-pin supply disagreement', async () => {
    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient(),
        new FakeFrontierBackingClient({ omitEvent: true }),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/disagree/i);

    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient(),
        new FakeFrontierBackingClient({ supply: SUPPLY + 1n }),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/disagree/i);
  });

  it('rejects runtime-profile drift or reader-specific owner drift at the pin', async () => {
    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient(),
        new FakeFrontierBackingClient(),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: `0x${'12'.repeat(20)}`,
    })).rejects.toThrow(/reviewed runtime profile/i);

    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient(),
        new FakeFrontierBackingClient({
          runtimeIdentity: { chainId: '31338' },
        }),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/runtime identity/i);

    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient(),
        new FakeFrontierBackingClient({
          runtimeIdentity: { sergOwnerAddress: `0x${'25'.repeat(20)}` },
        }),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/disagree/i);
  });

  it('rejects receipt drift, duplicate scan events, and pin replacement', async () => {
    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient({ receiptAmount: AMOUNT + 1n }),
        new FakeFrontierBackingClient(),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/semantics disagree/i);

    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient({ duplicateEvent: true }),
        new FakeFrontierBackingClient(),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/event counts disagree/i);

    await expect(observeFrontierBackingReadAgreement({
      sources: sources(
        new FakeFrontierBackingClient({
          pinHashes: [PIN_BLOCK_HASH, REPLACEMENT_PIN_BLOCK_HASH],
        }),
        new FakeFrontierBackingClient(),
      ),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/changed during observation/i);
  });

  it('rejects a pin replacement after an initially valid agreement', async () => {
    const primary = new FakeFrontierBackingClient({
      pinHashes: [
        PIN_BLOCK_HASH,
        PIN_BLOCK_HASH,
        REPLACEMENT_PIN_BLOCK_HASH,
      ],
    });
    const pair = sources(primary, new FakeFrontierBackingClient());
    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    await expect(
      revalidateFrontierBackingReadAgreementPin(pair, snapshot),
    ).rejects.toThrow(/changed after observation/i);
  });

  it('rejects a stale primary tip and post-observation reader lag', async () => {
    const stalePrimary = new FakeFrontierBackingClient({
      tipHeights: [PINNED_HEIGHT - 3],
    });
    await expect(observeFrontierBackingReadAgreement({
      sources: sources(stalePrimary, new FakeFrontierBackingClient()),
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/tips exceed the allowed lag/i);
    expect(stalePrimary.scanCalls).toEqual([]);

    const primary = new FakeFrontierBackingClient();
    const witness = new FakeFrontierBackingClient({
      tipHeights: [
        PINNED_HEIGHT,
        PINNED_HEIGHT,
        PINNED_HEIGHT,
        PINNED_HEIGHT + 3,
      ],
    });
    const pair = sources(primary, witness);
    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });
    await expect(
      revalidateFrontierBackingReadAgreementPin(pair, snapshot),
    ).rejects.toThrow(/tips exceed the allowed lag/i);
  });

  it('rejects aliases across clients, origins, nodes, and administration', () => {
    const primary = new FakeFrontierBackingClient();
    const witness = new FakeFrontierBackingClient();
    const base = {
      primaryClient: primary,
      primaryRpcUrl: 'http://127.0.0.1:9945',
      primaryNodeIdentityDigestHex: '10'.repeat(32),
      primaryAdministrationIdentityDigestHex: '20'.repeat(32),
      witnessClient: witness,
      witnessRpcUrl: 'http://127.0.0.1:9946',
      witnessNodeIdentityDigestHex: '30'.repeat(32),
      witnessAdministrationIdentityDigestHex: '40'.repeat(32),
      expectedChainId: CHAIN_ID,
      expectedBridgeAddress: BRIDGE,
      expectedBridgeCodeHashHex: BRIDGE_CODE_HASH,
      expectedSergAddress: SERG,
      expectedSergCodeHashHex: SERG_CODE_HASH,
    };
    expect(() => createFrontierBackingReadAgreementSources({
      ...base,
      witnessClient: primary,
    })).toThrow(/distinct clients/i);
    expect(() => createFrontierBackingReadAgreementSources({
      ...base,
      witnessRpcUrl: 'http://127.0.0.1:9945/',
    })).toThrow(/distinct RPC origins/i);
    expect(() => createFrontierBackingReadAgreementSources({
      ...base,
      witnessNodeIdentityDigestHex: base.primaryNodeIdentityDigestHex,
    })).toThrow(/distinct node identities/i);
    expect(() => createFrontierBackingReadAgreementSources({
      ...base,
      witnessAdministrationIdentityDigestHex:
        base.primaryAdministrationIdentityDigestHex,
    })).toThrow(/distinct administration identities/i);
  });

  it('requires every configured source identity and stays disabled without a witness', () => {
    expect(getSidechainBackingSourceIdentityConfig({})).toBeNull();
    expect(() => getSidechainBackingSourceIdentityConfig({
      witnessRpcUrl: 'http://127.0.0.1:9946',
    })).toThrow(/requires pinned source identities/i);
    expect(getSidechainBackingSourceIdentityConfig({
      witnessRpcUrl: 'http://127.0.0.1:9946',
      primaryNodeIdentityDigestHex: '10'.repeat(32),
      primaryAdministrationIdentityDigestHex: '20'.repeat(32),
      witnessNodeIdentityDigestHex: '30'.repeat(32),
      witnessAdministrationIdentityDigestHex: '40'.repeat(32),
    })).toEqual({
      witnessRpcUrl: 'http://127.0.0.1:9946',
      primaryNodeIdentityDigestHex: '10'.repeat(32),
      primaryAdministrationIdentityDigestHex: '20'.repeat(32),
      witnessNodeIdentityDigestHex: '30'.repeat(32),
      witnessAdministrationIdentityDigestHex: '40'.repeat(32),
    });
  });
});
