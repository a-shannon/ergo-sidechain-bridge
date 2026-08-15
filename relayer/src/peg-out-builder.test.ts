import { describe, expect, it, vi } from 'vitest';

import { PegOutBuilder } from './peg-out-builder.js';
import type { ParsedPegOut } from './sidechain-client.js';

const deployed = {
  mainChainLock: {
    address: 'main-chain-lock',
    ergoTreeHex: '1000',
  },
  mainChainUnlock: {
    address: 'main-chain-unlock',
    ergoTreeHex: '1000',
  },
  sideChainState: {
    nftId: 'aa'.repeat(32),
  },
  doubleUnlockPrevention: {
    nftId: 'bb'.repeat(32),
    ergoTreeHex: '1000',
  },
} as any;

const basePegOut: ParsedPegOut = {
  user: '0x0000000000000000000000000000000000000001',
  amount: 1_000_000n,
  ergoRecipientAddress: '02' + '44'.repeat(32),
  sidechainTxHash: '11'.repeat(32),
  sidechainBlockNumber: 100,
};

describe('PegOutBuilder legacy MCU containment', () => {
  it('blocks legacy Phase 1 before reading boxes or signing', async () => {
    const ergo = {
      getCurrentHeight: vi.fn(),
      getUnspentBoxesByAddress: vi.fn(),
      findSingletonBox: vi.fn(),
    };
    const builder = new PegOutBuilder(ergo as any, {} as any, deployed);

    await expect(builder.buildPhase1(basePegOut)).rejects.toThrow(
      'legacy Phase 1 MCU creation',
    );
    expect(ergo.getCurrentHeight).not.toHaveBeenCalled();
    expect(ergo.getUnspentBoxesByAddress).not.toHaveBeenCalled();
    expect(ergo.findSingletonBox).not.toHaveBeenCalled();
  });

  it('blocks legacy Phase 2 before reading SCS or MCU boxes', async () => {
    const ergo = {
      getCurrentHeight: vi.fn(),
      getUnspentBoxesByAddress: vi.fn(),
      findSingletonBox: vi.fn(),
    };
    const builder = new PegOutBuilder(ergo as any, {} as any, deployed);

    await expect(builder.buildPhase2('phase1-tx', 100)).rejects.toThrow(
      'legacy Phase 2 MCU spend',
    );
    expect(ergo.getCurrentHeight).not.toHaveBeenCalled();
    expect(ergo.getUnspentBoxesByAddress).not.toHaveBeenCalled();
    expect(ergo.findSingletonBox).not.toHaveBeenCalled();
  });
});
