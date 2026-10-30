import { createHash } from 'node:crypto';
import { HDNodeWallet, Interface, Transaction, Wallet } from 'ethers';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { canonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  assertFrontierLabApplicationOwnerClaimV1, bindFrontierLabApplicationOwnerRequestV1,
  claimFrontierLabApplicationOwnerRequestV1, createFrontierLabApplicationOwnerV1,
  disposeFrontierLabApplicationOwnerV1, signFrontierLabApplicationCallsOnceV1,
  type FrontierLabApplicationOwnerV1,
} from '../../adapters/frontier-lab-application-owner-v1.js';
import {
  decodePegInSourceIntentV2Hex, derivePegInSourceIntentIdV2Hex, encodePegInSourceIntentV2Hex,
} from '../../peg-in-causal-admission-v2.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from '../../validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX as REFERENCE,
} from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';
import {
  buildFrontierLabApplicationTransactionPlanV1, inspectFrontierLabApplicationSignedTransactionsV1,
} from '../../substrate-federated-isolated-devnet-frontier-application-transactions-v1.js';

// Upstream packet/proof provenance is scoped here; owner custody and signing are real.
const provenance = vi.hoisted(() => ({
  packets: { 2: new WeakSet<object>(), 3: new WeakSet<object>() }, proofs: new WeakSet<object>(),
}));
vi.mock('../../substrate-federated-isolated-devnet-packet-producer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance: (value: object) => {
    if (!provenance.packets[2].has(value)) throw new Error('PacketV2 lacks process provenance');
  },
  assertSubstrateFederatedIsolatedDevnetPacketV3Provenance: (value: object) => {
    if (!provenance.packets[3].has(value)) throw new Error('PacketV3 lacks process provenance');
  },
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance: (value: object) => {
    if (!provenance.proofs.has(value)) throw new Error('proof lacks process provenance');
  },
}));
import {
  signFrontierLabProofBoundApplicationV1, signFrontierLabProofBoundApplicationV2,
} from './frontier-lab-proof-bound-application-signing-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPacketV2, SubstrateFederatedIsolatedDevnetPacketV3,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';

const owners: Readonly<FrontierLabApplicationOwnerV1>[] = [];
const recipient = Wallet.createRandom().signingKey.compressedPublicKey;
const abi = new Interface(['function mintSERG(address,uint256,bytes32)', 'function approve(address,uint256)', 'function pegOut(uint256,bytes)']);
const reference = decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(REFERENCE);
const originalIntent = decodePegInSourceIntentV2Hex(reference.sourceIntentHex);
afterEach(() => {
  vi.restoreAllMocks();
  for (const owner of owners.splice(0)) disposeFrontierLabApplicationOwnerV1(owner);
});

async function fixture(tokenAddress: string | null = originalIntent.tokenAddressHex, packetVersion: 2 | 3 = 2) {
  const owner = await createFrontierLabApplicationOwnerV1(originalIntent.bridgeAddressHex);
  owners.push(owner);
  const request = Buffer.from(`${canonicalJson({
    schema: 'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1', version: 1,
    sourceTarget: {
      expectedChainId: '42', bridgeAddress: originalIntent.bridgeAddressHex,
      ...(tokenAddress === null ? {} : { tokenAddress }), bridgeOwnerAddress: owner.ownerAddressHex,
      signedLegacyOwnerMintTransactionHex: owner.signedLegacyOwnerMintTransactionHex,
    },
  })}\n`);
  const requestSha256Hex = createHash('sha256').update(request).digest('hex');
  bindFrontierLabApplicationOwnerRequestV1(owner, request, requestSha256Hex);
  claimFrontierLabApplicationOwnerRequestV1(requestSha256Hex);
  const intent = { ...originalIntent, recipientAddressHex: owner.ownerAddressHex, amountNanoErg: '15000000' };
  const input = {
    mintReservationStatementHex: encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
      ...reference, successorReserveLiabilityNanoErg: '15000000',
      sourceIntentHex: encodePegInSourceIntentV2Hex(intent), sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(intent),
    }),
    ergoRecipientPublicKeyHex: recipient,
  };
  const plan = buildFrontierLabApplicationTransactionPlanV1(input);
  const packet = { receipt: { version: packetVersion, receiptDigestHex: '11'.repeat(32), targetDescriptorDigestHex: '22'.repeat(32) } };
  const proof = {
    packetReceiptDigestHex: packet.receipt.receiptDigestHex,
    targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
    sourceProofReceiptDigestHex: '33'.repeat(32),
    sourceProof: {
      receiptDigestHex: '33'.repeat(32), targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
      request: { statementHex: input.mintReservationStatementHex },
      mintReservationStatementIdHex: plan.mintReservationStatementIdHex, mintIdentityHex: plan.mintIdentityHex,
    },
  };
  provenance.packets[packetVersion].add(packet);
  provenance.proofs.add(proof);
  return { owner, requestSha256Hex, packet, proof, input, plan };
}

it('keeps explicit signing entry points typed to PacketV2 and PacketV3 respectively', () => {
  expectTypeOf<Parameters<typeof signFrontierLabProofBoundApplicationV1>[2]>()
    .toEqualTypeOf<Readonly<SubstrateFederatedIsolatedDevnetPacketV2>>();
  expectTypeOf<Parameters<typeof signFrontierLabProofBoundApplicationV2>[2]>()
    .toEqualTypeOf<Readonly<SubstrateFederatedIsolatedDevnetPacketV3>>();
});

describe.each([
  { version: 1, packetVersion: 2 as const, sign: signFrontierLabProofBoundApplicationV1 },
  { version: 2, packetVersion: 3 as const, sign: signFrontierLabProofBoundApplicationV2 },
])('proof-bound LAB application signing V$version / PacketV$packetVersion', ({ packetVersion, sign }) => {
  const compositionFixture = () => fixture(originalIntent.tokenAddressHex, packetVersion);
  it('rejects concurrent composition without disposing the first signing attempt', async () => {
    const f = await compositionFixture();
    const attempt = () => sign(
      f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient,
    );
    const first = attempt().then(signed => ({ signed }), error => ({ error }));
    await expect(attempt()).rejects.toThrow(/already consumed/);
    const outcome = await first;
    expect(outcome).toHaveProperty('signed');
    if ('signed' in outcome) {
      expect(() => inspectFrontierLabApplicationSignedTransactionsV1(f.input, outcome.signed)).not.toThrow();
    }
  });

  it('signs the real canonical triplet once and returns only independently inspectable bytes', async () => {
    const f = await compositionFixture();
    const signed = await sign(
      f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient,
    );
    const inspected = inspectFrontierLabApplicationSignedTransactionsV1(f.input, signed);
    expect(inspected.plan).toEqual(f.plan);
    expect(Object.keys(signed).sort()).toEqual(['approval', 'mint', 'pegOut']);
    expect(Object.isFrozen(signed)).toBe(true);
    for (const role of ['mint', 'approval', 'pegOut'] as const) {
      expect(Transaction.from(signed[role]).from?.toLowerCase()).toBe(f.owner.ownerAddressHex);
    }
    expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
    await expect(sign(f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient))
      .rejects.toThrow(/live process custody/);
  });

  it.each(['packet-clone', 'proof-clone', 'packet', 'target', 'inner-target', 'receipt', 'statement-id', 'mint-id', 'statement', 'recipient', 'owner'] as const)(
    'rejects %s mismatch before signing and disposes the claimed owner', async fault => {
      const f = await compositionFixture();
      if (fault === 'packet-clone') f.packet = { ...f.packet };
      if (fault === 'proof-clone') f.proof = { ...f.proof };
      if (fault === 'packet') f.proof.packetReceiptDigestHex = 'ff'.repeat(32);
      if (fault === 'target') f.proof.targetDescriptorDigestHex = 'ff'.repeat(32);
      if (fault === 'inner-target') f.proof.sourceProof.targetDescriptorDigestHex = 'ff'.repeat(32);
      if (fault === 'receipt') f.proof.sourceProofReceiptDigestHex = 'ff'.repeat(32);
      if (fault === 'statement-id') f.proof.sourceProof.mintReservationStatementIdHex = `0x${'ff'.repeat(32)}`;
      if (fault === 'mint-id') f.proof.sourceProof.mintIdentityHex = `0x${'ff'.repeat(32)}`;
      if (fault === 'statement') f.proof.sourceProof.request.statementHex = '0x01';
      if (fault === 'owner') {
        const other = await compositionFixture();
        f.proof.sourceProof.request = other.proof.sourceProof.request;
        f.proof.sourceProof.mintReservationStatementIdHex = other.proof.sourceProof.mintReservationStatementIdHex;
        f.proof.sourceProof.mintIdentityHex = other.proof.sourceProof.mintIdentityHex;
      }
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(sign(
        f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, fault === 'recipient' ? '0x01' : recipient,
      )).rejects.toThrow();
      expect(signer).not.toHaveBeenCalled();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
    },
  );

  it('rejects a genuinely registered packet of the other version without fallback', async () => {
    const otherVersion = packetVersion === 2 ? 3 : 2;
    const f = await fixture(originalIntent.tokenAddressHex, otherVersion);
    expect(provenance.packets[otherVersion].has(f.packet)).toBe(true);
    expect(provenance.packets[packetVersion].has(f.packet)).toBe(false);
    const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
    await expect(sign(f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient))
      .rejects.toThrow(`PacketV${packetVersion} lacks process provenance`);
    expect(signer).not.toHaveBeenCalled();
    expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex))
      .toThrow(/live process custody/);
  });

  it.each([1, 2, 3])('settles a concurrent failed composition at signing call %s without retry or partial bytes', async failureAt => {
    const f = await compositionFixture();
    const original = HDNodeWallet.prototype.signTransaction;
    let count = 0;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const signingStarted = new Promise<void>(resolve => { started = resolve; });
    const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
      if (++count === failureAt) {
        started();
        await gate;
        throw new Error('synthetic composition signing failure');
      }
      return original.call(this, tx);
    });
    const attempt = () => sign(f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient);
    const first = attempt().then(signed => ({ signed }), error => ({ error }));
    try {
      await signingStarted;
      await expect(attempt()).rejects.toThrow(/already consumed/);
      const otherSign = packetVersion === 2 ? signFrontierLabProofBoundApplicationV2 : signFrontierLabProofBoundApplicationV1;
      await expect(otherSign(f.owner, f.requestSha256Hex, f.packet as never, f.proof as never, recipient))
        .rejects.toThrow(/already consumed/);
      expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).not.toThrow();
    } finally {
      release();
      await first;
    }
    const outcome = await first;
    expect(outcome).not.toHaveProperty('signed');
    expect(outcome).toHaveProperty('error', new Error('synthetic composition signing failure'));
    expect(signer).toHaveBeenCalledTimes(failureAt);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
    await expect(attempt()).rejects.toThrow(/live process custody/);
    expect(signer).toHaveBeenCalledTimes(failureAt);
  });
});

describe('one-use scoped LAB signer adapter', () => {
  it.each(['type', 'chainId', 'nonce', 'gasPrice', 'gasLimit', 'value', 'to', 'extra', 'accessor', 'calldata-tail', 'mint-recipient', 'mint-amount', 'approval-spender', 'approval-amount', 'pegout-amount', 'pegout-key', 'digest'] as const)(
    'rejects isolated %s drift without signing', async fault => {
      const f = await fixture();
      const calls = structuredClone(f.plan.transactions) as {
        [Role in keyof typeof f.plan.transactions]: { -readonly [Field in keyof typeof f.plan.transactions[Role]]: typeof f.plan.transactions[Role][Field] };
      };
      const tx = calls.mint as unknown as Record<string, unknown>;
      if (fault === 'type' || fault === 'chainId' || fault === 'nonce') tx[fault] = 2;
      if (fault === 'gasPrice' || fault === 'gasLimit' || fault === 'value') tx[fault] = '1';
      if (fault === 'to') tx.to = f.owner.ownerAddressHex;
      if (fault === 'extra') tx.from = f.owner.ownerAddressHex;
      if (fault === 'accessor') Object.defineProperty(tx, 'data', { get: () => f.plan.transactions.mint.data, enumerable: true });
      if (fault === 'calldata-tail') tx.data = String(tx.data) + '00';
      if (fault === 'mint-recipient') tx.data = abi.encodeFunctionData('mintSERG', [originalIntent.bridgeAddressHex, 15_000_000n, f.plan.mintIdentityHex]);
      if (fault === 'mint-amount') tx.data = abi.encodeFunctionData('mintSERG', [f.owner.ownerAddressHex, 1n, f.plan.mintIdentityHex]);
      if (fault === 'approval-spender') calls.approval.data = abi.encodeFunctionData('approve', [f.owner.ownerAddressHex, 15_000_000n]);
      if (fault === 'approval-amount') calls.approval.data = abi.encodeFunctionData('approve', [originalIntent.bridgeAddressHex, 1n]);
      if (fault === 'pegout-amount') calls.pegOut.data = abi.encodeFunctionData('pegOut', [1n, recipient]);
      if (fault === 'pegout-key') calls.pegOut.data = abi.encodeFunctionData('pegOut', [15_000_000n, '0x02' + 'ff'.repeat(32)]);
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(signFrontierLabApplicationCallsOnceV1(f.owner, fault === 'digest' ? 'ff'.repeat(32) : f.requestSha256Hex, calls))
        .rejects.toThrow();
      expect(signer).not.toHaveBeenCalled();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
    },
  );

  it('rejects a concurrent second signer without interrupting the first triplet', async () => {
    const f = await fixture();
    const first = signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions);
    await expect(signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions))
      .rejects.toThrow(/already consumed/);
    const signed = await first;
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(f.input, signed)).not.toThrow();
  });

  it.each([null, 'not-an-address', `0x${'00'.repeat(20)}`, originalIntent.bridgeAddressHex])(
    'rejects an absent or invalid request token %s before signing', async token => {
      const f = await fixture(token);
      const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
      await expect(signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions))
        .rejects.toThrow(/token is not bound/);
      expect(signer).not.toHaveBeenCalled();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
    },
  );

  it('rejects a valid but different request token before signing', async () => {
    const f = await fixture('0x' + 'ab'.repeat(20));
    const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction');
    await expect(signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions))
      .rejects.toThrow(/call policy changed/);
    expect(signer).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('disposes custody and returns no partial triplet when signing call %s fails', async failureAt => {
    const f = await fixture();
    const original = HDNodeWallet.prototype.signTransaction;
    let count = 0;
    const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
      if (++count === failureAt) throw new Error('synthetic signing failure');
      return original.call(this, tx);
    });
    await expect(signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions))
      .rejects.toThrow('synthetic signing failure');
    expect(signer).toHaveBeenCalledTimes(failureAt);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(f.owner, f.requestSha256Hex)).toThrow(/live process custody/);
  });

  it.each([1, 2, 3])('does not return a partial triplet when custody is disposed during signing call %s', async disposeAt => {
    const f = await fixture();
    const original = HDNodeWallet.prototype.signTransaction;
    let count = 0;
    const signer = vi.spyOn(HDNodeWallet.prototype, 'signTransaction').mockImplementation(async function (this: HDNodeWallet, tx) {
      const signed = await original.call(this, tx);
      if (++count === disposeAt) disposeFrontierLabApplicationOwnerV1(f.owner);
      return signed;
    });
    await expect(signFrontierLabApplicationCallsOnceV1(f.owner, f.requestSha256Hex, f.plan.transactions))
      .rejects.toThrow(/live process custody/);
    expect(signer).toHaveBeenCalledTimes(disposeAt);
  });
});
