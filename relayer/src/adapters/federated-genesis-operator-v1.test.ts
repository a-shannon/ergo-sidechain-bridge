import { HDNodeWallet, Wallet, SigningKey, Interface, Transaction, keccak256, recoverAddress } from 'ethers';
import blakejs from 'blakejs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1,
  disposeFederatedGenesisOperatorV1, signFederatedGenesisReservationV1, signFederatedGenesisMintV1,
} from './federated-genesis-operator-v1.js';

afterEach(() => vi.restoreAllMocks());

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
      expect(tx.gasPrice).toBe(1000000000n); expect(tx.gasLimit).toBe(5000000n);
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

  it.each(['failure', 'disposal', 'nonce', 'chain', 'signer', 'concurrent'])('contains %s during Ethereum signing', async fault => {
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
