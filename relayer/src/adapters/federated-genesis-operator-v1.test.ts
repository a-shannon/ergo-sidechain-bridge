import { readFileSync } from 'node:fs';
import { HDNodeWallet, Wallet, SigningKey, Interface, Transaction, keccak256, recoverAddress } from 'ethers';
import blakejs from 'blakejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1,
  disposeFederatedGenesisOperatorV1, signFederatedGenesisReservationV1, signFederatedGenesisMintV1,
  signFederatedGenesisApproveV1, signFederatedGenesisBurnV1,
  signFederatedGenesisContinuationReservationV1, signFederatedGenesisContinuationMintV1,
  signFederatedGenesisContinuationApproveV1, signFederatedGenesisContinuationBurnV1,
} from './federated-genesis-operator-v1.js';
import { assertFederatedNativeContinuationParentV1, assertFederatedNativeContinuationStepParentV1,
  type FederatedNativeContinuationParentV1, type FederatedNativeContinuationStepParentV1 }
  from './federated-native-reservation-execution-v1.js';
import { encodeFederatedNativeMintExtrinsicV1Hex } from '../federated-native-mint-runtime-state-v1.js';
import { deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4 }
  from '../validity-application-pooled-reserve-mint-reservation-v4.js';

vi.mock('./federated-native-reservation-execution-v1.js', () => ({
  assertFederatedNativeContinuationParentV1: vi.fn(),
  assertFederatedNativeContinuationStepParentV1: vi.fn(),
}));

const authenticatedContinuationParents = new WeakSet<object>();
const authenticatedContinuationStepParents = new WeakSet<object>();
beforeEach(() => vi.mocked(assertFederatedNativeContinuationParentV1).mockReset().mockImplementation(parent => {
  if (parent === null || typeof parent !== 'object' || !authenticatedContinuationParents.has(parent)) {
    throw new Error('FED continuation parent is not authenticated');
  }
}));
beforeEach(() => vi.mocked(assertFederatedNativeContinuationStepParentV1).mockReset().mockImplementation(parent => {
  if (parent === null || typeof parent !== 'object' || !authenticatedContinuationStepParents.has(parent)) {
    throw new Error('FED continuation step parent is not authenticated');
  }
}));
afterEach(() => vi.restoreAllMocks());

describe('FED native post-mint withdrawal signing', () => {
  const BRIDGE = `0x${'33'.repeat(20)}`, TOKEN = `0x${'44'.repeat(20)}`;
  const ERGO = `0x0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`;
  const abi = new Interface(['function approve(address,uint256)', 'function pegOut(uint256,bytes)']);
  const input = (phase: 'approve' | 'burn') => ({ nonce: phase === 'approve' ? 2 : 3,
    parentNativeHeight: phase === 'approve' ? 2 : 3, bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN,
    grossAmountNanoErg: '20000000', recipientErgoTreeHex: ERGO });
  async function minted() {
    const owner = createFederatedGenesisOperatorV1();
    signFederatedGenesisReservationV1(owner, { genesisHashHex: `0x${'62'.repeat(32)}`, nonce: 0,
      statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` });
    await signFederatedGenesisMintV1(owner, { nonce: 1, bridgeAddressHex: BRIDGE,
      recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: '20000000', mintIdentityHex: `0x${'64'.repeat(32)}` });
    return owner;
  }

  it('signs bounded native approve and burn calls without network access or a funds-authority claim', async () => {
    const owner = await minted();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const connect = vi.spyOn(HDNodeWallet.prototype, 'connect');
    try {
      for (const phase of ['approve', 'burn'] as const) {
        const result = await (phase === 'approve' ? signFederatedGenesisApproveV1 : signFederatedGenesisBurnV1)(owner, input(phase));
        const tx = Transaction.from(result.signedTransactionHex);
        expect(tx.hash).toBe(result.transactionHashHex);
        expect(tx.from?.toLowerCase()).toBe(`0x${owner.addressHex}`);
        expect(tx.chainId).toBe(4242n); expect(tx.type).toBe(0); expect(tx.value).toBe(0n);
        expect(tx.nonce).toBe(phase === 'approve' ? 2 : 3);
        expect(tx.to?.toLowerCase()).toBe(phase === 'approve' ? TOKEN : BRIDGE);
        expect(tx.gasPrice).toBe(phase === 'approve' ? 1265625000n : 1423828125n);
        expect(tx.gasLimit).toBe(5000000n);
        expect(tx.data).toBe(phase === 'approve'
          ? abi.encodeFunctionData('approve', [BRIDGE, '20000000'])
          : abi.encodeFunctionData('pegOut', ['20000000', ERGO]));
        const extrinsic = Buffer.from(encodeFederatedNativeMintExtrinsicV1Hex(result.signedTransactionHex).slice(2), 'hex');
        // Both calls use the two-byte SCALE compact length followed by the bare v5 Ethereum call.
        expect(extrinsic.readUInt16LE(0)).toBe((extrinsic.length - 2) * 4 + 1);
        expect(extrinsic.subarray(2, 6).toString('hex')).toBe('05070000');
        expect(extrinsic.readBigUInt64LE(6)).toBe(BigInt(tx.nonce));
        expect(extrinsic.readBigUInt64LE(38)).toBe(tx.gasPrice);
        expect(extrinsic.readBigUInt64LE(70)).toBe(tx.gasLimit);
        expect(extrinsic.subarray(102, 123).toString('hex')).toBe(`00${tx.to!.slice(2).toLowerCase()}`);
        expect(Object.isFrozen(result)).toBe(true);
      }
      expect(fetch).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
      assertFederatedGenesisOperatorV1(owner);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  for (const phase of ['approve', 'burn'] as const) {
    const sign = phase === 'approve' ? signFederatedGenesisApproveV1 : signFederatedGenesisBurnV1;
    it.each(['copy', 'disposed', 'null', 'prototype', 'extra', 'symbol', 'accessor', 'missing',
      'nonce', 'parent', 'bridge', 'token zero', 'token alias', 'token owner', 'token uppercase',
      'amount below minimum', 'amount above mint', 'amount noncanonical', 'amount numeric',
      'recipient raw key', 'recipient uppercase', 'recipient invalid point'])
      (`${phase} rejects %s before signing`, async fault => {
        const owner = await minted();
        try {
          if (phase === 'burn') await signFederatedGenesisApproveV1(owner, input('approve'));
          const next: any = input(phase);
          if (fault === 'disposed') disposeFederatedGenesisOperatorV1(owner);
          if (fault === 'prototype') Object.setPrototypeOf(next, { unrelated: true });
          if (fault === 'extra') next.value = 1;
          if (fault === 'symbol') next[Symbol('field')] = true;
          if (fault === 'accessor') Object.defineProperty(next, 'nonce', { enumerable: true, get() { throw new Error('getter executed'); } });
          if (fault === 'missing') delete next.tokenAddressHex;
          if (fault === 'nonce') next.nonce++;
          if (fault === 'parent') next.parentNativeHeight++;
          if (fault === 'bridge') next.bridgeAddressHex = `0x${'55'.repeat(20)}`;
          if (fault === 'token zero') next.tokenAddressHex = `0x${'00'.repeat(20)}`;
          if (fault === 'token alias') next.tokenAddressHex = BRIDGE;
          if (fault === 'token owner') next.tokenAddressHex = `0x${owner.addressHex}`;
          if (fault === 'token uppercase') next.tokenAddressHex = `0x${'AB'.repeat(20)}`;
          if (fault === 'amount below minimum') next.grossAmountNanoErg = '14999999';
          if (fault === 'amount above mint') next.grossAmountNanoErg = '20000001';
          if (fault === 'amount noncanonical') next.grossAmountNanoErg = '020000000';
          if (fault === 'amount numeric') next.grossAmountNanoErg = 20000000;
          if (fault === 'recipient raw key') next.recipientErgoTreeHex = `0x${ERGO.slice(8)}`;
          if (fault === 'recipient uppercase') next.recipientErgoTreeHex = ERGO.toUpperCase();
          if (fault === 'recipient invalid point') next.recipientErgoTreeHex = `0x0008cd02${'ff'.repeat(32)}`;
          const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
          await expect(sign(fault === 'copy' ? { ...owner } : owner, fault === 'null' ? null as never : next))
            .rejects.toThrow(/custody|own-data|scope|curve point/);
          expect(signer).not.toHaveBeenCalled();
        } finally { disposeFederatedGenesisOperatorV1(owner); }
      });

    it.each(['failure', 'disposed while signing', 'chain', 'nonce', 'target', 'data', 'value', 'type',
      'gas price below', 'gas price above', 'gas limit', 'different signer'])
      (`${phase} revokes custody on %s`, async fault => {
        const owner = await minted();
        try {
          if (phase === 'burn') await signFederatedGenesisApproveV1(owner, input('approve'));
          const original = HDNodeWallet.prototype.signTransaction;
          const other = Wallet.createRandom();
          vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
            if (fault === 'failure') throw new Error('synthetic signing failure');
            if (fault === 'disposed while signing') disposeFederatedGenesisOperatorV1(owner);
            return original.call(fault === 'different signer' ? other : this, { ...tx,
              ...(fault === 'chain' ? { chainId: 42 } : {}),
              ...(fault === 'nonce' ? { nonce: Number(tx.nonce) + 1 } : {}),
              ...(fault === 'target' ? { to: `0x${'55'.repeat(20)}` } : {}),
              ...(fault === 'data' ? { data: '0x' } : {}), ...(fault === 'value' ? { value: 1n } : {}),
              ...(fault === 'type' ? { type: 1 } : {}),
              ...(fault === 'gas price below' ? { gasPrice: BigInt(tx.gasPrice!) - 1n } : {}),
              ...(fault === 'gas price above' ? { gasPrice: BigInt(tx.gasPrice!) + 1n } : {}),
              ...(fault === 'gas limit' ? { gasLimit: 5000001n } : {}) });
          });
          await expect(sign(owner, input(phase))).rejects.toThrow(/failure|custody|exact transaction/);
          expect(() => assertFederatedGenesisOperatorV1(owner)).toThrow(/custody/);
          await expect(sign(owner, input(phase))).rejects.toThrow(/custody/);
        } finally { disposeFederatedGenesisOperatorV1(owner); }
      });

    it(`${phase} snapshots inputs and excludes concurrent or repeated use`, async () => {
      const owner = await minted();
      try {
        if (phase === 'burn') await signFederatedGenesisApproveV1(owner, input('approve'));
        const next = input(phase), original = HDNodeWallet.prototype.signTransaction;
        let release!: () => void;
        const wait = new Promise<void>(resolve => { release = resolve; });
        vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
          await wait; return original.call(this, tx);
        });
        const pending = sign(owner, next);
        next.grossAmountNanoErg = '15000000'; next.recipientErgoTreeHex = '0x';
        try {
          await expect(sign(owner, input(phase))).rejects.toThrow(/unused/);
          if (phase === 'approve') await expect(signFederatedGenesisBurnV1(owner, input('burn'))).rejects.toThrow(/predecessor/);
        } finally { release(); }
        const result = await pending;
        expect(Transaction.from(result.signedTransactionHex).data).toBe(phase === 'approve'
          ? abi.encodeFunctionData('approve', [BRIDGE, '20000000'])
          : abi.encodeFunctionData('pegOut', ['20000000', ERGO]));
        await expect(sign(owner, input(phase))).rejects.toThrow(/unused/);
        assertFederatedGenesisOperatorV1(owner);
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

    it.each(['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor', 'get'] as const)
      (`${phase} rechecks its slot after a reentrant %s trap`, async trap => {
        const owner = await minted();
        try {
          if (phase === 'burn') await signFederatedGenesisApproveV1(owner, input('approve'));
          let entered = false, nested: Promise<unknown> | undefined;
          const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
          const reenter = () => {
            if (entered) return;
            entered = true;
            nested = sign(owner, { ...input(phase), ...(phase === 'approve' ? { grossAmountNanoErg: '15000000' } : {}) });
          };
          const wrapped = new Proxy(input(phase), {
            [trap]: (...args: any[]) => { reenter(); return (Reflect[trap] as Function)(...args); },
          });
          const outcome = await sign(owner, wrapped).then(() => 'signed', error => String(error));
          await nested;
          expect(entered).toBe(true);
          expect(outcome).toMatch(/unused/);
          expect(signer).toHaveBeenCalledTimes(1);
          assertFederatedGenesisOperatorV1(owner);
        } finally { disposeFederatedGenesisOperatorV1(owner); }
      });
  }

  it.each(['token', 'amount', 'recipient'])('rejects valid %s drift between approval and burn', async fault => {
    const owner = await minted();
    try {
      await signFederatedGenesisApproveV1(owner, input('approve'));
      const next = input('burn');
      if (fault === 'token') next.tokenAddressHex = `0x${'55'.repeat(20)}`;
      if (fault === 'amount') next.grossAmountNanoErg = '15000000';
      if (fault === 'recipient') next.recipientErgoTreeHex = ERGO.replace('0008cd02', '0008cd03');
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(signFederatedGenesisBurnV1(owner, next)).rejects.toThrow(/retained approval/);
      expect(signer).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it('does not confuse an in-progress mint signature with a completed predecessor', async () => {
    const owner = createFederatedGenesisOperatorV1();
    try {
      await expect(signFederatedGenesisApproveV1(owner, input('approve'))).rejects.toThrow(/predecessor/);
      signFederatedGenesisReservationV1(owner, { genesisHashHex: `0x${'62'.repeat(32)}`, nonce: 0,
        statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` });
      const original = HDNodeWallet.prototype.signTransaction;
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
        await wait; return original.call(this, tx);
      });
      const pending = signFederatedGenesisMintV1(owner, { nonce: 1, bridgeAddressHex: BRIDGE,
        recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: '20000000', mintIdentityHex: `0x${'64'.repeat(32)}` });
      try { await expect(signFederatedGenesisApproveV1(owner, input('approve'))).rejects.toThrow(/predecessor/); }
      finally { release(); }
      await pending;
      await expect(signFederatedGenesisBurnV1(owner, input('burn'))).rejects.toThrow(/predecessor/);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['reservation', 'mint'] as const)('preserves one-shot %s signing across input reentrancy', async phase => {
    const owner = createFederatedGenesisOperatorV1();
    try {
      const native = { genesisHashHex: `0x${'62'.repeat(32)}`, nonce: 0,
        statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` };
      const mint = { nonce: 1, bridgeAddressHex: BRIDGE, recipientAddressHex: `0x${owner.addressHex}`,
        amountNanoErg: '20000000', mintIdentityHex: `0x${'64'.repeat(32)}` };
      if (phase === 'mint') signFederatedGenesisReservationV1(owner, native);
      const signer = phase === 'mint' ? vi.spyOn(HDNodeWallet.prototype, 'signTransaction') : vi.spyOn(SigningKey.prototype, 'sign');
      let entered = false, nested: unknown;
      const invoke = (value: any) => phase === 'mint'
        ? signFederatedGenesisMintV1(owner, value) : signFederatedGenesisReservationV1(owner, value);
      const plain = phase === 'mint' ? mint : native;
      const wrapped = new Proxy(plain, { getPrototypeOf(target) {
        if (!entered) { entered = true; nested = invoke(plain); }
        return Reflect.getPrototypeOf(target);
      } });
      let rejected = '';
      try { await invoke(wrapped); } catch (error) { rejected = String(error); }
      await nested;
      expect(rejected).toMatch(/unused|consumed/);
      expect(signer).toHaveBeenCalledTimes(1);
      assertFederatedGenesisOperatorV1(owner);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });
});

describe('FED parent-reservation mint signing', () => {
  const native = { genesisHashHex: `0x${'62'.repeat(32)}`, nonce: 0,
    statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` };
  const abi = new Interface(['function mintSERG(address,uint256,bytes32)']);
  const mint = (owner: ReturnType<typeof createFederatedGenesisOperatorV1>) => ({ nonce: 1,
    bridgeAddressHex: `0x${'33'.repeat(20)}`, recipientAddressHex: `0x${owner.addressHex}`,
    amountNanoErg: '15000000', mintIdentityHex: `0x${'64'.repeat(32)}` });

  it('signs one exact chain-4242 nonce-one call and retains custody for the next lifecycle consumer', async () => {
    const owner = createFederatedGenesisOperatorV1();
    try {
      signFederatedGenesisReservationV1(owner, native);
      const input = mint(owner), result = await signFederatedGenesisMintV1(owner, input);
      const tx = Transaction.from(result.signedTransactionHex);
      expect(tx.hash).toBe(result.transactionHashHex);
      expect(tx.from?.toLowerCase()).toBe(input.recipientAddressHex);
      expect(tx.chainId).toBe(4242n); expect(tx.nonce).toBe(1); expect(tx.type).toBe(0);
      expect(tx.to?.toLowerCase()).toBe(input.bridgeAddressHex); expect(tx.value).toBe(0n);
      expect(tx.gasPrice).toBe(1125000000n); expect(tx.gasLimit).toBe(5000000n);
      expect(tx.gasPrice! * tx.gasLimit).toBe(5_625_000_000_000_000n);
      expect(tx.data).toBe(abi.encodeFunctionData('mintSERG', [input.recipientAddressHex, input.amountNanoErg, input.mintIdentityHex]));
      assertFederatedGenesisOperatorV1(owner);
      await expect(signFederatedGenesisMintV1(owner, input)).rejects.toThrow(/unused/);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['before reservation', 'copy', 'disposed', 'null', 'accessor', 'extra', 'symbol', 'missing',
    'nonce zero', 'nonce two', 'recipient', 'bridge zero', 'bridge alias', 'amount zero', 'amount leading zero',
    'amount overflow', 'mint zero', 'mint uppercase'])('rejects %s before Ethereum signing', async fault => {
    const owner = createFederatedGenesisOperatorV1();
    try {
      if (fault !== 'before reservation') signFederatedGenesisReservationV1(owner, native);
      const input: any = mint(owner);
      if (fault === 'disposed') disposeFederatedGenesisOperatorV1(owner);
      if (fault === 'accessor') Object.defineProperty(input, 'nonce', { enumerable: true, get() { throw new Error('getter executed'); } });
      if (fault === 'extra') input.chainId = 42;
      if (fault === 'symbol') input[Symbol('extra')] = true;
      if (fault === 'missing') delete input.mintIdentityHex;
      if (fault === 'nonce zero') input.nonce = 0;
      if (fault === 'nonce two') input.nonce = 2;
      if (fault === 'recipient') input.recipientAddressHex = `0x${'55'.repeat(20)}`;
      if (fault === 'bridge zero') input.bridgeAddressHex = `0x${'00'.repeat(20)}`;
      if (fault === 'bridge alias') input.bridgeAddressHex = input.recipientAddressHex;
      if (fault === 'amount zero') input.amountNanoErg = '0';
      if (fault === 'amount leading zero') input.amountNanoErg = '015000000';
      if (fault === 'amount overflow') input.amountNanoErg = '9223372036854775808';
      if (fault === 'mint zero') input.mintIdentityHex = `0x${'00'.repeat(32)}`;
      if (fault === 'mint uppercase') input.mintIdentityHex = `0x${'AB'.repeat(32)}`;
      const sign = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(signFederatedGenesisMintV1(fault === 'copy' ? { ...owner } : owner, fault === 'null' ? null as never : input))
        .rejects.toThrow(/custody|unused|own-data|scope/);
      expect(sign).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['failure', 'disposal', 'nonce', 'chain', 'signer', 'gas below cap', 'gas above cap', 'concurrent'])('contains %s during Ethereum signing', async fault => {
    const owner = createFederatedGenesisOperatorV1();
    signFederatedGenesisReservationV1(owner, native);
    const original = HDNodeWallet.prototype.signTransaction;
    const other = Wallet.createRandom();
    let concurrent: Promise<unknown> | undefined;
    vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
      if (fault === 'failure') throw new Error('synthetic signer failure');
      if (fault === 'disposal') disposeFederatedGenesisOperatorV1(owner);
      if (fault === 'concurrent') concurrent = expect(signFederatedGenesisMintV1(owner, mint(owner))).rejects.toThrow(/unused/);
      return original.call(fault === 'signer' ? other : this, { ...tx,
        ...(fault === 'gas below cap' ? { gasPrice: 1_000_000_000n } : {}),
        ...(fault === 'gas above cap' ? { gasPrice: 1_125_000_001n } : {}),
        ...(fault === 'nonce' ? { nonce: 0 } : {}), ...(fault === 'chain' ? { chainId: 42 } : {}) });
    });
    try {
      if (fault === 'concurrent') { await signFederatedGenesisMintV1(owner, mint(owner)); await concurrent; assertFederatedGenesisOperatorV1(owner); }
      else { await expect(signFederatedGenesisMintV1(owner, mint(owner))).rejects.toThrow(/failure|custody|exact transaction/);
        expect(() => assertFederatedGenesisOperatorV1(owner)).toThrow(/custody/); }
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });
});

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

describe('FED native reservation signing', () => {
  const input = { genesisHashHex: `0x${'62'.repeat(32)}`, nonce: 0,
    statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: `0x04${'53'.repeat(622)}` };

  it('matches the pinned SDK public ECDSA primitive golden byte for byte', () => {
    // Public fixture: polkadot-sdk bbc435c, primitives/core/src/ecdsa.rs,
    // test_vector_should_work. This is a primitive differential, not node acceptance.
    const fixtureKey = new SigningKey('0x9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const signature = fixtureKey.sign(blakejs.blake2b(new Uint8Array(), undefined, 32));
    expect(`${signature.r.slice(2)}${signature.s.slice(2)}0${signature.yParity}`).toBe(
      '3dde91174bd9359027be59a428b8146513df80a2a3c7eda2194f64de04a69ab97'
      + 'b753169e94db6ffd50921a2668a48b94ca11e3d32c1ff19cfe88890aa7e8f3c00');
    expect(fixtureKey.publicKey).toBe('0x04'
      + '8db55b05db86c0b1786ca49f095d76344c9e6056b2f02701a7e7f3c20aabfd913'
      + 'ebbe148dd17c56551a52952371071a6c604b3f3abe8f2c8fa742158ea6dd7d4');
  });

  // Separate literal oracle from pinned SDK SignedPayload/UncheckedExtrinsic and
  // Frontier EthereumSignature. These component bytes are not a valid burn proof.
  it.each([[0, '00'], [63, 'fc'], [64, '0101'], [16383, 'fdff'],
    [16384, '02000100'], [0x40000000, '0300000040'], [0xffffffff, '03ffffffff']] as const)
    ('matches the complete pinned v4 extrinsic layout at nonce %i', (nonce, nonceHex) => {
      const wallet = HDNodeWallet.fromSeed(new Uint8Array(32).fill(17));
      vi.spyOn(Wallet, 'createRandom').mockReturnValue(wallet);
      const owner = createFederatedGenesisOperatorV1();
      const fetch = vi.spyOn(globalThis, 'fetch');
      const connect = vi.spyOn(HDNodeWallet.prototype, 'connect');
      try {
        const result = signFederatedGenesisReservationV1(owner, { ...input, nonce });
        const call = `0c066d09${input.statementHex.slice(2)}${input.sourceProofEnvelopeScaleHex.slice(2)}`;
        const extra = `00${nonceHex}00`;
        const payload = Buffer.from(`${call}${extra}0100000001000000${'62'.repeat(64)}`, 'hex');
        const digest = keccak256(blakejs.blake2b(payload, undefined, 32));
        const signature = wallet.signingKey.sign(digest);
        const signatureHex = `${signature.r.slice(2)}${signature.s.slice(2)}0${signature.yParity}`;
        const body = `84${owner.addressHex}${signatureHex}${extra}${call}`;
        const size = Buffer.alloc(2); size.writeUInt16LE((body.length / 2) * 4 + 1);
        const expected = `0x${size.toString('hex')}${body}`;
        expect(result.callScaleHex).toBe(`0x${call}`);
        expect(result.signedExtrinsicHex).toBe(expected);
        expect(result.signingDigestHex).toBe(digest);
        expect(result.signingDigestHex).not.toBe(keccak256(payload));
        expect(result.extrinsicHashHex).toBe(
          `0x${Buffer.from(blakejs.blake2b(Buffer.from(expected.slice(2), 'hex'), undefined, 32)).toString('hex')}`);
        expect(result.signerAddressHex).toBe(owner.addressHex);
        expect(recoverAddress(digest, signature).toLowerCase()).toBe(`0x${owner.addressHex}`);
        expect(Object.isFrozen(result)).toBe(true);
        expect(fetch).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
        expect(() => signFederatedGenesisReservationV1(owner, { ...input, nonce: nonce ^ 1 })).toThrow(/consumed/);
        assertFederatedGenesisOperatorV1(owner);
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it.each(['copy', 'disposed', 'null', 'symbol', 'extra', 'accessor', 'missing', 'negative nonce', 'fractional nonce',
    'unsafe nonce', 'overflow nonce', 'noncanonical genesis', 'zero genesis', 'short statement', 'long statement',
    'uppercase statement', 'empty proof', 'odd proof', 'oversize proof'])
    ('rejects %s before signing', fault => {
      const owner = createFederatedGenesisOperatorV1();
      const sign = vi.spyOn(SigningKey.prototype, 'sign');
      const changed: any = { ...input };
      if (fault === 'symbol') changed[Symbol('extra')] = true;
      if (fault === 'extra') changed.call = 'override';
      if (fault === 'accessor') Object.defineProperty(changed, 'nonce', { get() { throw new Error('getter executed'); } });
      if (fault === 'missing') delete changed.nonce;
      if (fault === 'negative nonce') changed.nonce = -1;
      if (fault === 'fractional nonce') changed.nonce = 0.5;
      if (fault === 'unsafe nonce') changed.nonce = Number.MAX_SAFE_INTEGER + 1;
      if (fault === 'overflow nonce') changed.nonce = 0x100000000;
      if (fault === 'noncanonical genesis') changed.genesisHashHex = '62'.repeat(32);
      if (fault === 'zero genesis') changed.genesisHashHex = `0x${'00'.repeat(32)}`;
      if (fault === 'short statement') changed.statementHex = input.statementHex.slice(0, -2);
      if (fault === 'long statement') changed.statementHex += '00';
      if (fault === 'uppercase statement') changed.statementHex = `0x04${'AB'.repeat(602)}`;
      if (fault === 'empty proof') changed.sourceProofEnvelopeScaleHex = '0x';
      if (fault === 'odd proof') changed.sourceProofEnvelopeScaleHex = '0x001';
      if (fault === 'oversize proof') changed.sourceProofEnvelopeScaleHex = `0x${'01'.repeat(65537)}`;
      if (fault === 'disposed') disposeFederatedGenesisOperatorV1(owner);
      try {
        expect(() => signFederatedGenesisReservationV1(fault === 'copy' ? { ...owner } : owner,
          fault === 'null' ? null as never : changed)).toThrow(/custody|own-data|canonical/);
        expect(sign).not.toHaveBeenCalled();
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it.each(['failure', 'other signer', 'disposal'])('revokes custody on signing %s', fault => {
    const owner = createFederatedGenesisOperatorV1();
    const other = HDNodeWallet.fromSeed(new Uint8Array(32).fill(23));
    const original = SigningKey.prototype.sign;
    vi.spyOn(SigningKey.prototype, 'sign').mockImplementation(function (this: SigningKey, digest) {
      if (fault === 'failure') throw new Error('synthetic signing failure');
      if (fault === 'disposal') disposeFederatedGenesisOperatorV1(owner);
      return original.call(fault === 'other signer' ? other.signingKey : this, digest);
    });
    expect(() => signFederatedGenesisReservationV1(owner, input)).toThrow(/failure|different signer|custody/);
    expect(() => assertFederatedGenesisOperatorV1(owner)).toThrow(/custody/);
  });
});

describe('FED first continuation reservation signing', () => {
  type MutableContinuationParent = {
    -readonly [Key in keyof FederatedNativeContinuationParentV1]: FederatedNativeContinuationParentV1[Key];
  };
  const GENESIS = `0x${'62'.repeat(32)}`;
  const BRIDGE = `0x${'33'.repeat(20)}`, TOKEN = `0x${'44'.repeat(20)}`;
  const ERGO = `0x0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`;
  const vector = JSON.parse(readFileSync(new URL(
    '../../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json', import.meta.url), 'utf8')) as {
      statement: ValidityApplicationPooledReserveMintReservationStatementV4;
      expected: { statementHex: string };
    };
  const FIRST_MINT_ID = vector.statement.mintIdentityHex;
  const nextLockBoxIdHex = `0x${'73'.repeat(32)}`;
  const continuationStatement = Object.freeze({ ...vector.statement, sourceLockBoxIdHex: nextLockBoxIdHex,
    mintIdentityHex: deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex: vector.statement.lineageProfileIdHex, sourceLockBoxIdHex: nextLockBoxIdHex,
      depositCommitmentHex: vector.statement.depositCommitmentHex,
    }) });
  const continuationStatementHex = encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(continuationStatement);
  const proof = `0x04${'53'.repeat(622)}`;

  async function originalBurn() {
    const owner = createFederatedGenesisOperatorV1();
    try {
      signFederatedGenesisReservationV1(owner, { genesisHashHex: GENESIS, nonce: 0,
        statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: proof });
      await signFederatedGenesisMintV1(owner, { nonce: 1, bridgeAddressHex: BRIDGE,
        recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: '20000000', mintIdentityHex: FIRST_MINT_ID });
      const withdrawal = { bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN,
        grossAmountNanoErg: '20000000', recipientErgoTreeHex: ERGO };
      await signFederatedGenesisApproveV1(owner, { nonce: 2, parentNativeHeight: 2, ...withdrawal });
      const burn = await signFederatedGenesisBurnV1(owner, { nonce: 3, parentNativeHeight: 3, ...withdrawal });
      return { owner, burn };
    } catch (error) { disposeFederatedGenesisOperatorV1(owner); throw error; }
  }

  function parent(owner: ReturnType<typeof createFederatedGenesisOperatorV1>, burnHash: string,
    changed: Partial<MutableContinuationParent> = {}): Readonly<FederatedNativeContinuationParentV1> {
    const result = Object.freeze({ genesisHashHex: GENESIS, blockHashHex: `0x${'71'.repeat(32)}`,
      ethereumBlockHashHex: `0x${'72'.repeat(32)}`, blockHeight: 4, nonce: 4,
      operatorAddressHex: `0x${owner.addressHex}`, previousMintIdentityHex: FIRST_MINT_ID,
      previousBurnTransactionHashHex: burnHash, operatorStorageKeyHex: owner.nativeFunding.storageKeyHex,
      operatorAccountInfoHex: `0x${'00'.repeat(80)}`, expectedStorage: Object.freeze({}), ...changed });
    authenticatedContinuationParents.add(result);
    return result;
  }

  const input = (parentValue: Readonly<FederatedNativeContinuationParentV1>, statementHex = continuationStatementHex) => ({
    parent: parentValue, statementHex, sourceProofEnvelopeScaleHex: proof,
  });

  it('signs nonce four from the authenticated original-burn parent and permanently consumes the continuation slot', async () => {
    const { owner, burn } = await originalBurn();
    const approved = parent(owner, burn.transactionHashHex);
    try {
      const result = signFederatedGenesisContinuationReservationV1(owner, input(approved));
      expect(result.genesisHashHex).toBe(GENESIS); expect(result.nonce).toBe(4);
      expect(result.signerAddressHex).toBe(owner.addressHex);
      expect(result.callScaleHex).toContain(continuationStatementHex.slice(2));
      expect(Object.isFrozen(result)).toBe(true);
      expect(assertFederatedNativeContinuationParentV1).toHaveBeenCalledTimes(5);
      expect(() => signFederatedGenesisContinuationReservationV1(owner, input(approved))).toThrow(/consumed/);
      expect(() => signFederatedGenesisReservationV1(owner, { genesisHashHex: GENESIS, nonce: 4,
        statementHex: vector.expected.statementHex, sourceProofEnvelopeScaleHex: proof })).toThrow(/consumed/);
      assertFederatedGenesisOperatorV1(owner);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['genesis', 'mint', 'burn hash', 'nonce', 'height', 'operator'] as const)
    ('rejects authenticated %s drift from the retained original operation before signing', async fault => {
      const { owner, burn } = await originalBurn();
      const changed: Partial<MutableContinuationParent> = {};
      if (fault === 'genesis') changed.genesisHashHex = `0x${'63'.repeat(32)}`;
      if (fault === 'mint') changed.previousMintIdentityHex = `0x${'65'.repeat(32)}`;
      if (fault === 'burn hash') changed.previousBurnTransactionHashHex = `0x${'66'.repeat(32)}`;
      if (fault === 'nonce') changed.nonce = 5;
      if (fault === 'height') changed.blockHeight = 5;
      if (fault === 'operator') changed.operatorAddressHex = `0x${'67'.repeat(20)}`;
      const sign = vi.spyOn(SigningKey.prototype, 'sign');
      try {
        expect(() => signFederatedGenesisContinuationReservationV1(owner,
          input(parent(owner, burn.transactionHashHex, changed)))).toThrow(/retained original operation/);
        expect(sign).not.toHaveBeenCalled();
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it.each(['copied parent', 'copied owner', 'disposed owner'] as const)('rejects %s before signing', async fault => {
    const { owner, burn } = await originalBurn();
    const approved = parent(owner, burn.transactionHashHex);
    if (fault === 'disposed owner') disposeFederatedGenesisOperatorV1(owner);
    const sign = vi.spyOn(SigningKey.prototype, 'sign');
    try {
      expect(() => signFederatedGenesisContinuationReservationV1(
        fault === 'copied owner' ? { ...owner } : owner,
        input(fault === 'copied parent' ? { ...approved } : approved))).toThrow(/authenticated|custody/);
      expect(sign).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['null input', 'extra field', 'accessor field'] as const)('rejects %s without inspecting parent authority', async fault => {
    const { owner, burn } = await originalBurn();
    const candidate: any = input(parent(owner, burn.transactionHashHex));
    if (fault === 'extra field') candidate.nonce = 4;
    if (fault === 'accessor field') Object.defineProperty(candidate, 'parent', { enumerable: true, get() { throw new Error('getter executed'); } });
    vi.mocked(assertFederatedNativeContinuationParentV1).mockClear();
    const sign = vi.spyOn(SigningKey.prototype, 'sign');
    try {
      expect(() => signFederatedGenesisContinuationReservationV1(owner,
        fault === 'null input' ? null as never : candidate)).toThrow(/own-data/);
      expect(assertFederatedNativeContinuationParentV1).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it('rejects a duplicate mint identity before signing', async () => {
    const { owner, burn } = await originalBurn();
    const sign = vi.spyOn(SigningKey.prototype, 'sign');
    try {
      expect(() => signFederatedGenesisContinuationReservationV1(owner,
        input(parent(owner, burn.transactionHashHex), vector.expected.statementHex))).toThrow(/fresh nonzero mint identity/);
      expect(sign).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it('disposes custody when authenticated parent authority fails immediately after signing', async () => {
    const { owner, burn } = await originalBurn();
    const approved = parent(owner, burn.transactionHashHex);
    let assertions = 0;
    vi.mocked(assertFederatedNativeContinuationParentV1).mockImplementation(value => {
      if (!authenticatedContinuationParents.has(value)) throw new Error('not authenticated');
      assertions++;
      if (assertions === 4) throw new Error('parent authority changed after signing');
    });
    const sign = vi.spyOn(SigningKey.prototype, 'sign');
    expect(() => signFederatedGenesisContinuationReservationV1(owner, input(approved)))
      .toThrow(/authority changed/);
    expect(sign).toHaveBeenCalledOnce();
    expect(() => assertFederatedGenesisOperatorV1(owner)).toThrow(/custody/);
  });
});

describe('FED retained continuation mint, approval and burn signing', () => {
  type MutableStepParent = {
    -readonly [Key in keyof FederatedNativeContinuationStepParentV1]: FederatedNativeContinuationStepParentV1[Key];
  };
  const GENESIS = `0x${'62'.repeat(32)}`;
  const BRIDGE = `0x${'33'.repeat(20)}`, TOKEN = `0x${'44'.repeat(20)}`;
  const ERGO = `0x0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`;
  const vector = JSON.parse(readFileSync(new URL(
    '../../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json', import.meta.url), 'utf8')) as {
      statement: ValidityApplicationPooledReserveMintReservationStatementV4;
      expected: { statementHex: string };
    };
  const FIRST_MINT_ID = vector.statement.mintIdentityHex;
  const nextLockBoxIdHex = `0x${'83'.repeat(32)}`;
  const secondStatement = Object.freeze({ ...vector.statement, sourceLockBoxIdHex: nextLockBoxIdHex,
    mintIdentityHex: deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex: vector.statement.lineageProfileIdHex, sourceLockBoxIdHex: nextLockBoxIdHex,
      depositCommitmentHex: vector.statement.depositCommitmentHex,
    }) });
  const SECOND_MINT_ID = secondStatement.mintIdentityHex;
  const secondStatementHex = encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(secondStatement);
  const proof = `0x04${'53'.repeat(622)}`;
  const abi = new Interface(['function mintSERG(address,uint256,bytes32)',
    'function approve(address,uint256)', 'function pegOut(uint256,bytes)']);

  async function retained(firstAmount = '30000000', firstGross = '20000000') {
    const owner = createFederatedGenesisOperatorV1();
    try {
      signFederatedGenesisReservationV1(owner, { genesisHashHex: GENESIS, nonce: 0,
        statementHex: `0x04${'37'.repeat(602)}`, sourceProofEnvelopeScaleHex: proof });
      await signFederatedGenesisMintV1(owner, { nonce: 1, bridgeAddressHex: BRIDGE,
        recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: firstAmount, mintIdentityHex: FIRST_MINT_ID });
      const withdrawal = { bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN,
        grossAmountNanoErg: firstGross, recipientErgoTreeHex: ERGO };
      await signFederatedGenesisApproveV1(owner, { nonce: 2, parentNativeHeight: 2, ...withdrawal });
      const burn = await signFederatedGenesisBurnV1(owner, { nonce: 3, parentNativeHeight: 3, ...withdrawal });
      const originalParent = Object.freeze({ genesisHashHex: GENESIS, blockHashHex: `0x${'71'.repeat(32)}`,
        ethereumBlockHashHex: `0x${'72'.repeat(32)}`, blockHeight: 4, nonce: 4,
        operatorAddressHex: `0x${owner.addressHex}`, previousMintIdentityHex: FIRST_MINT_ID,
        previousBurnTransactionHashHex: burn.transactionHashHex, operatorStorageKeyHex: owner.nativeFunding.storageKeyHex,
        operatorAccountInfoHex: `0x${'00'.repeat(80)}`, expectedStorage: Object.freeze({}) });
      authenticatedContinuationParents.add(originalParent);
      const reservation = signFederatedGenesisContinuationReservationV1(owner, {
        parent: originalParent, statementHex: secondStatementHex, sourceProofEnvelopeScaleHex: proof,
      });
      return { owner, reservation };
    } catch (error) { disposeFederatedGenesisOperatorV1(owner); throw error; }
  }

  function step(owner: ReturnType<typeof createFederatedGenesisOperatorV1>, reservationHash: string,
    phase: 'mint' | 'approve' | 'burn', previousTransactionHashHex: string | null,
    changed: Partial<MutableStepParent> = {}): Readonly<FederatedNativeContinuationStepParentV1> {
    const nonce = phase === 'mint' ? 5 : phase === 'approve' ? 6 : 7;
    const result = Object.freeze({ phase, genesisHashHex: GENESIS,
      parentNativeBlockHashHex: `0x${nonce.toString(16).padStart(2, '0').repeat(32)}`,
      parentEthereumBlockHashHex: `0x${(nonce + 16).toString(16).padStart(2, '0').repeat(32)}`,
      parentNativeHeight: nonce, nonce, reservationExtrinsicHashHex: reservationHash,
      mintIdentityHex: SECOND_MINT_ID, recipientAddressHex: `0x${owner.addressHex}`,
      bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN, amountNanoErg: '20000000',
      gasPriceWei: phase === 'mint' ? '1802032472' : phase === 'approve' ? '2027286531' : '2280697348',
      previousTransactionHashHex, grossAmountNanoErg: phase === 'mint' ? null : '30000000',
      recipientErgoTreeHex: phase === 'mint' ? null : ERGO, ...changed });
    authenticatedContinuationStepParents.add(result);
    return result;
  }

  it('signs the exact second mint, cumulative approval and burn chain under retained custody', async () => {
    const { owner, reservation } = await retained();
    const fetch = vi.spyOn(globalThis, 'fetch'), connect = vi.spyOn(HDNodeWallet.prototype, 'connect');
    try {
      const mintParent = step(owner, reservation.extrinsicHashHex, 'mint', null);
      const mint = await signFederatedGenesisContinuationMintV1(owner, mintParent);
      const approvalParent = step(owner, reservation.extrinsicHashHex, 'approve', mint.transactionHashHex);
      const approval = await signFederatedGenesisContinuationApproveV1(owner, approvalParent);
      const burnParent = step(owner, reservation.extrinsicHashHex, 'burn', approval.transactionHashHex);
      const burn = await signFederatedGenesisContinuationBurnV1(owner, burnParent);
      for (const [result, nonce, gasPrice, target, data] of [
        [mint, 5, 1802032472n, BRIDGE, abi.encodeFunctionData('mintSERG', [`0x${owner.addressHex}`, '20000000', SECOND_MINT_ID])],
        [approval, 6, 2027286531n, TOKEN, abi.encodeFunctionData('approve', [BRIDGE, '30000000'])],
        [burn, 7, 2280697348n, BRIDGE, abi.encodeFunctionData('pegOut', ['30000000', ERGO])],
      ] as const) {
        const tx = Transaction.from(result.signedTransactionHex);
        expect(tx.hash).toBe(result.transactionHashHex); expect(result.nonce).toBe(nonce);
        expect(tx.from?.toLowerCase()).toBe(`0x${owner.addressHex}`);
        expect(tx.type).toBe(0); expect(tx.chainId).toBe(4242n); expect(tx.nonce).toBe(nonce);
        expect(tx.to?.toLowerCase()).toBe(target); expect(tx.data).toBe(data);
        expect(tx.gasPrice).toBe(gasPrice); expect(tx.gasLimit).toBe(5000000n); expect(tx.value).toBe(0n);
        expect(Object.isFrozen(result)).toBe(true);
      }
      expect(fetch).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
      assertFederatedGenesisOperatorV1(owner);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['phase', 'height', 'nonce', 'gas price', 'genesis', 'reservation', 'identity',
    'recipient', 'bridge', 'token', 'amount', 'native block', 'ethereum block'] as const)
    ('rejects mint %s drift before Ethereum signing', async fault => {
      const { owner, reservation } = await retained();
      const changed: Partial<MutableStepParent> = {};
      if (fault === 'phase') changed.phase = 'approve';
      if (fault === 'height') changed.parentNativeHeight = 6;
      if (fault === 'nonce') changed.nonce = 6;
      if (fault === 'gas price') changed.gasPriceWei = '1802032471';
      if (fault === 'genesis') changed.genesisHashHex = `0x${'63'.repeat(32)}`;
      if (fault === 'reservation') changed.reservationExtrinsicHashHex = `0x${'64'.repeat(32)}`;
      if (fault === 'identity') changed.mintIdentityHex = FIRST_MINT_ID;
      if (fault === 'recipient') changed.recipientAddressHex = `0x${'55'.repeat(20)}`;
      if (fault === 'bridge') changed.bridgeAddressHex = `0x${'55'.repeat(20)}`;
      if (fault === 'token') changed.tokenAddressHex = `0x${'55'.repeat(20)}`;
      if (fault === 'amount') changed.amountNanoErg = '9223372036854775808';
      if (fault === 'native block') changed.parentNativeBlockHashHex = `0x${'00'.repeat(32)}`;
      if (fault === 'ethereum block') changed.parentEthereumBlockHashHex = `0x${'00'.repeat(32)}`;
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      try {
        await expect(signFederatedGenesisContinuationMintV1(owner,
          step(owner, reservation.extrinsicHashHex, 'mint', null, changed))).rejects.toThrow(/scope|parent/);
        expect(signer).not.toHaveBeenCalled();
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it.each(['mint previous hash', 'mint gross', 'mint recipient', 'approval previous hash',
    'approval amount', 'approval gross below minimum', 'approval gross above balance',
    'approval recipient', 'burn previous hash', 'burn gross', 'burn recipient'] as const)
    ('rejects %s drift at its exact predecessor join', async fault => {
      const { owner, reservation } = await retained();
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      try {
        if (fault.startsWith('mint')) {
          const changed: Partial<MutableStepParent> = {};
          if (fault === 'mint previous hash') changed.previousTransactionHashHex = `0x${'91'.repeat(32)}`;
          if (fault === 'mint gross') changed.grossAmountNanoErg = '30000000';
          if (fault === 'mint recipient') changed.recipientErgoTreeHex = ERGO;
          await expect(signFederatedGenesisContinuationMintV1(owner,
            step(owner, reservation.extrinsicHashHex, 'mint', null, changed))).rejects.toThrow(/parent/);
        } else {
          const mint = await signFederatedGenesisContinuationMintV1(owner,
            step(owner, reservation.extrinsicHashHex, 'mint', null));
          if (fault.startsWith('approval')) {
            const changed: Partial<MutableStepParent> = {};
            if (fault === 'approval previous hash') changed.previousTransactionHashHex = `0x${'91'.repeat(32)}`;
            if (fault === 'approval amount') changed.amountNanoErg = '20000001';
            if (fault === 'approval gross below minimum') changed.grossAmountNanoErg = '14999999';
            if (fault === 'approval gross above balance') changed.grossAmountNanoErg = '30000001';
            if (fault === 'approval recipient') changed.recipientErgoTreeHex = `0x0008cd02${'ff'.repeat(32)}`;
            signer.mockClear();
            await expect(signFederatedGenesisContinuationApproveV1(owner,
              step(owner, reservation.extrinsicHashHex, 'approve', mint.transactionHashHex, changed)))
              .rejects.toThrow(/balance scope|curve point/);
          } else {
            const approval = await signFederatedGenesisContinuationApproveV1(owner,
              step(owner, reservation.extrinsicHashHex, 'approve', mint.transactionHashHex));
            const changed: Partial<MutableStepParent> = {};
            if (fault === 'burn previous hash') changed.previousTransactionHashHex = mint.transactionHashHex;
            if (fault === 'burn gross') changed.grossAmountNanoErg = '29999999';
            if (fault === 'burn recipient') changed.recipientErgoTreeHex = `0x0008cd03${ERGO.slice(10)}`;
            signer.mockClear();
            await expect(signFederatedGenesisContinuationBurnV1(owner,
              step(owner, reservation.extrinsicHashHex, 'burn', approval.transactionHashHex, changed)))
              .rejects.toThrow(/balance scope|approval scope/);
          }
        }
        expect(signer).not.toHaveBeenCalled();
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it('rejects gross above signed i64 even when the accumulated token balance covers it', async () => {
    const maximum = '9223372036854775807';
    const { owner, reservation } = await retained(maximum, '15000000');
    try {
      const mint = await signFederatedGenesisContinuationMintV1(owner,
        step(owner, reservation.extrinsicHashHex, 'mint', null, { amountNanoErg: maximum }));
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(signFederatedGenesisContinuationApproveV1(owner,
        step(owner, reservation.extrinsicHashHex, 'approve', mint.transactionHashHex,
          { amountNanoErg: maximum, grossAmountNanoErg: '9223372036854775808' })))
        .rejects.toThrow(/accumulated balance scope/);
      expect(signer).not.toHaveBeenCalled();
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['copied parent', 'copied owner', 'disposed owner', 'extra field', 'accessor field'] as const)
    ('rejects %s before signing', async fault => {
      const { owner, reservation } = await retained();
      const parent: any = { ...step(owner, reservation.extrinsicHashHex, 'mint', null) };
      if (fault !== 'copied parent') authenticatedContinuationStepParents.add(parent);
      if (fault === 'extra field') parent.extra = true;
      if (fault === 'accessor field') Object.defineProperty(parent, 'nonce', { enumerable: true, get() { throw new Error('getter executed'); } });
      if (fault === 'disposed owner') disposeFederatedGenesisOperatorV1(owner);
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      try {
        await expect(signFederatedGenesisContinuationMintV1(
          fault === 'copied owner' ? { ...owner } : owner, parent)).rejects.toThrow(/custody|authenticated|own-data/);
        expect(signer).not.toHaveBeenCalled();
      } finally { disposeFederatedGenesisOperatorV1(owner); }
    });

  it('claims before awaiting the signer and rejects simultaneous or repeated use', async () => {
    const { owner, reservation } = await retained();
    const parent = step(owner, reservation.extrinsicHashHex, 'mint', null);
    const original = HDNodeWallet.prototype.signTransaction;
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
      await wait; return original.call(this, tx);
    });
    try {
      const pending = signFederatedGenesisContinuationMintV1(owner, parent);
      await expect(signFederatedGenesisContinuationMintV1(owner, parent)).rejects.toThrow(/unused/);
      release(); await pending;
      await expect(signFederatedGenesisContinuationMintV1(owner, parent)).rejects.toThrow(/unused/);
      assertFederatedGenesisOperatorV1(owner);
    } finally { release(); disposeFederatedGenesisOperatorV1(owner); }
  });

  it.each(['signer failure', 'async disposal', 'changed parent', 'capability loss', 'wrong output'] as const)
    ('revokes custody on %s after claiming the step', async fault => {
      const { owner, reservation } = await retained();
      const parent: MutableStepParent = { ...step(owner, reservation.extrinsicHashHex, 'mint', null) };
      authenticatedContinuationStepParents.add(parent);
      const original = HDNodeWallet.prototype.signTransaction;
      vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
        if (fault === 'signer failure') throw new Error('synthetic signer failure');
        if (fault === 'async disposal') disposeFederatedGenesisOperatorV1(owner);
        if (fault === 'changed parent') parent.gasPriceWei = '1802032471';
        if (fault === 'capability loss') authenticatedContinuationStepParents.delete(parent);
        return original.call(this, fault === 'wrong output' ? { ...tx, nonce: 4 } : tx);
      });
      await expect(signFederatedGenesisContinuationMintV1(owner, parent)).rejects.toThrow(/failure|custody|changed|authenticated|exact transaction/);
      expect(() => assertFederatedGenesisOperatorV1(owner)).toThrow(/custody/);
    });

  it('keeps every legacy slot one-shot after the retained continuation chain', async () => {
    const { owner, reservation } = await retained();
    try {
      const mint = await signFederatedGenesisContinuationMintV1(owner,
        step(owner, reservation.extrinsicHashHex, 'mint', null));
      const approval = await signFederatedGenesisContinuationApproveV1(owner,
        step(owner, reservation.extrinsicHashHex, 'approve', mint.transactionHashHex));
      await signFederatedGenesisContinuationBurnV1(owner,
        step(owner, reservation.extrinsicHashHex, 'burn', approval.transactionHashHex));
      await expect(signFederatedGenesisMintV1(owner, { nonce: 1, bridgeAddressHex: BRIDGE,
        recipientAddressHex: `0x${owner.addressHex}`, amountNanoErg: '1', mintIdentityHex: FIRST_MINT_ID }))
        .rejects.toThrow(/unused/);
      await expect(signFederatedGenesisApproveV1(owner, { nonce: 2, parentNativeHeight: 2,
        bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN, grossAmountNanoErg: '20000000', recipientErgoTreeHex: ERGO }))
        .rejects.toThrow(/unused/);
      await expect(signFederatedGenesisBurnV1(owner, { nonce: 3, parentNativeHeight: 3,
        bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN, grossAmountNanoErg: '20000000', recipientErgoTreeHex: ERGO }))
        .rejects.toThrow(/unused/);
      expect(() => signFederatedGenesisContinuationReservationV1(owner, {} as never)).toThrow(/consumed/);
      assertFederatedGenesisOperatorV1(owner);
    } finally { disposeFederatedGenesisOperatorV1(owner); }
  });
});
