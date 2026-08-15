import { describe, it, expect } from 'vitest';
import { mergeDeployedState } from './deploy-state-merge.js';

describe('mergeDeployedState', () => {
  it('preserves solidity section when overwriting Ergo fields', () => {
    const existing = {
      network: 'testnet',
      deployedAt: '2026-05-09T00:00:00Z',
      sideChainState: { nftId: 'old_scs_nft', boxId: 'old_box', txId: 'old_tx' },
      solidity: {
        sergAddress: '0xABCD1234',
        bridgeAddress: '0xDEADBEEF',
        deployTxHash: '0x1111',
      },
      someOtherField: 'should_be_preserved',
    };

    const ergoFields = {
      network: 'testnet',
      deployedAt: '2026-05-10T12:00:00Z',
      sideChainState: { nftId: 'new_scs_nft', boxId: 'new_box', txId: 'new_tx' },
      doubleUnlockPrevention: { nftId: 'new_dup_nft' },
      relayer: { address: '3Wx17...', publicKey: '02b7b6...' },
    };

    const merged = mergeDeployedState(existing, ergoFields);

    // Ergo fields are updated
    expect(merged.sideChainState.nftId).toBe('new_scs_nft');
    expect(merged.doubleUnlockPrevention.nftId).toBe('new_dup_nft');
    expect(merged.deployedAt).toBe('2026-05-10T12:00:00Z');
    expect(merged.relayer.address).toBe('3Wx17...');

    // Non-Ergo fields are preserved
    expect(merged.solidity).toEqual({
      sergAddress: '0xABCD1234',
      bridgeAddress: '0xDEADBEEF',
      deployTxHash: '0x1111',
    });
    expect(merged.someOtherField).toBe('should_be_preserved');
  });

  it('works with empty existing state', () => {
    const ergoFields = {
      network: 'testnet',
      sideChainState: { nftId: 'nft1' },
    };

    const merged = mergeDeployedState({}, ergoFields);
    expect(merged.network).toBe('testnet');
    expect(merged.sideChainState.nftId).toBe('nft1');
  });

  it('preserves historical aggregate deployment fields without reactivating deployment', () => {
    const existing = {
      network: 'testnet',
      sideChainState: { nftId: 'old' },
      doubleUnlockPreventionAggregateBatch: { nftId: 'batch_dup_nft' },
      mainChainAggregateUnlockBatch: { address: 'batch_unlock_addr' },
      batchDeployedAt: '2026-05-09T10:00:00Z',
      solidity: { sergAddress: '0x1234' },
    };

    const ergoFields = {
      network: 'testnet',
      deployedAt: '2026-05-10T12:00:00Z',
      sideChainState: { nftId: 'new_scs' },
    };

    const merged = mergeDeployedState(existing, ergoFields);

    // Batch fields preserved
    expect(merged.doubleUnlockPreventionAggregateBatch.nftId).toBe('batch_dup_nft');
    expect(merged.mainChainAggregateUnlockBatch.address).toBe('batch_unlock_addr');
    expect(merged.batchDeployedAt).toBe('2026-05-09T10:00:00Z');
    // Solidity preserved
    expect(merged.solidity.sergAddress).toBe('0x1234');
    // Ergo field updated
    expect(merged.sideChainState.nftId).toBe('new_scs');
  });

  it('does not copy unknown ergo fields beyond the whitelist', () => {
    const existing = { solidity: { addr: '0x1' } };
    const ergoFields = {
      network: 'testnet',
      randomGarbage: 'should_not_appear',
    };

    const merged = mergeDeployedState(existing, ergoFields);
    expect(merged.network).toBe('testnet');
    expect(merged.randomGarbage).toBeUndefined();
    expect(merged.solidity.addr).toBe('0x1');
  });
});
