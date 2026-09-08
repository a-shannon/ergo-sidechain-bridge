import { HDNodeWallet, Wallet } from 'ethers';
import blakejs from 'blakejs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1,
  disposeFederatedGenesisOperatorV1,
} from './federated-genesis-operator-v1.js';

afterEach(() => vi.restoreAllMocks());

describe('FED genesis operator custody', () => {
  it('creates distinct public handles without signing or connecting', () => {
    const sign = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
    const connect = vi.spyOn(HDNodeWallet.prototype, 'connect');
    const first = createFederatedGenesisOperatorV1();
    const second = createFederatedGenesisOperatorV1();
    try {
      expect(Object.keys(first)).toEqual(['addressHex', 'launchDomainHex', 'nativeFunding']);
      expect(Object.isFrozen(first)).toBe(true);
      expect(first.addressHex).toMatch(/^[0-9a-f]{40}$/);
      expect(second.addressHex).not.toBe(first.addressHex);
      expect(first.launchDomainHex).toMatch(/^[0-9a-f]{64}$/);
      expect(second.launchDomainHex).not.toBe(first.launchDomainHex);
      expect(Object.isFrozen(first.nativeFunding)).toBe(true);
      expect(first.nativeFunding.amountUnits).toBe('100000000000000000000');
      const keyHash = Buffer.from(blakejs.blake2b(Buffer.from(first.addressHex, 'hex'), undefined, 16)).toString('hex');
      expect(first.nativeFunding.storageKeyHex).toBe(
        `0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9${keyHash}${first.addressHex}`);
      const account = Buffer.from(first.nativeFunding.accountInfoScaleHex.slice(2), 'hex');
      expect(account).toHaveLength(80);
      expect(account.subarray(0, 16).toString('hex')).toBe('00000000000000000100000000000000');
      expect(account.readBigUInt64LE(16) + (account.readBigUInt64LE(24) << 64n)).toBe(100_000_000_000_000_000_000n);
      expect(account.subarray(32, 79)).toEqual(Buffer.alloc(47)); expect(account[79]).toBe(0x80);
      expect(() => assertFederatedGenesisOperatorV1(first)).not.toThrow();
      expect(() => assertFederatedGenesisOperatorV1(second)).not.toThrow();
      expect(sign).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    } finally {
      disposeFederatedGenesisOperatorV1(first);
      disposeFederatedGenesisOperatorV1(second);
    }
  });

  it('matches the observed configuration-only AccountId20 storage-key vector', () => {
    expect(Buffer.from(blakejs.blake2b(Buffer.from('31'.repeat(20), 'hex'), undefined, 16)).toString('hex'))
      .toBe('3be271a34c4abbcea083f1c9fe3fdb24');
  });

  it('rejects a copied or disposed handle without affecting other custody', () => {
    const first = createFederatedGenesisOperatorV1();
    const second = createFederatedGenesisOperatorV1();
    try {
      expect(() => assertFederatedGenesisOperatorV1({ ...first })).toThrow(/absent, copied or disposed/);
      disposeFederatedGenesisOperatorV1(first);
      disposeFederatedGenesisOperatorV1(first);
      expect(() => assertFederatedGenesisOperatorV1(first)).toThrow(/absent, copied or disposed/);
      expect(() => assertFederatedGenesisOperatorV1(second)).not.toThrow();
    } finally { disposeFederatedGenesisOperatorV1(second); }
  });

  it('propagates creation failure without returning a public handle', () => {
    vi.spyOn(Wallet, 'createRandom').mockImplementation(() => { throw new Error('entropy unavailable'); });
    expect(createFederatedGenesisOperatorV1).toThrow('entropy unavailable');
  });
});
