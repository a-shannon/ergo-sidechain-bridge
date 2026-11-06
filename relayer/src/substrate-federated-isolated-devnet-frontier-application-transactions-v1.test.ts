import { beforeAll, describe, expect, it } from 'vitest';
import {
  Interface, Transaction, Wallet, decodeRlp, encodeRlp, toBeHex,
  type TransactionRequest,
} from 'ethers';

import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  buildFrontierLabApplicationTransactionPlanV1,
  inspectFrontierLabApplicationSignedTransactionsV1,
  type FrontierLabApplicationTransactionInputV1,
} from './substrate-federated-isolated-devnet-frontier-application-transactions-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2 as BASE_SUDO,
} from './substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const ROLES = ['mint', 'approval', 'pegOut'] as const;
const owner = Wallet.createRandom();
const other = Wallet.createRandom();
const destination = Wallet.createRandom().signingKey.compressedPublicKey;
const abi = new Interface([
  'function mintSERG(address,uint256,bytes32)',
  'function approve(address,uint256)',
  'function pegOut(uint256,bytes)',
]);
const reference = decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
);
const intent: PegInSourceIntentV2 = {
  ...decodePegInSourceIntentV2Hex(reference.sourceIntentHex),
  amountNanoErg: '15000000',
  recipientAddressHex: owner.address.toLowerCase(),
};
function inputWithIntent(changes: Partial<PegInSourceIntentV2> = {}) {
  const next = { ...intent, ...changes };
  return {
    mintReservationStatementHex:
      encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
        ...reference,
        successorReserveLiabilityNanoErg: '15000000',
        sourceIntentHex: encodePegInSourceIntentV2Hex(next),
        sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(next),
      }),
    ergoRecipientPublicKeyHex: destination,
  };
}
const input = inputWithIntent();
const plan = buildFrontierLabApplicationTransactionPlanV1(input);
let signed: Record<typeof ROLES[number], string>;
beforeAll(async () => {
  signed = {
    mint: await owner.signTransaction(plan.transactions.mint),
    approval: await owner.signTransaction(plan.transactions.approval),
    pegOut: await owner.signTransaction(plan.transactions.pegOut),
  };
});

describe('fresh-owner LAB application transaction plan', () => {
  it('composes the actual V11 owner guard with three signed calls, without mocks', () => {
    assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
      bridgeAddressHex: intent.bridgeAddressHex,
      tokenAddressHex: intent.tokenAddressHex,
      bridgeOwnerAddressHex: owner.address.toLowerCase(),
      recipientAddressHex: owner.address.slice(2).toLowerCase(),
      removedBaseSudoAddressHex: BASE_SUDO,
    });
    expect(plan.ownerAddressHex).not.toBe(BASE_SUDO);
    expect(ROLES.map(role => plan.transactions[role].nonce)).toEqual([0, 1, 2]);
    const inspected = inspectFrontierLabApplicationSignedTransactionsV1(input, signed);
    for (const role of ROLES) {
      expect(inspected.transactionHashes[role]).toBe(Transaction.from(signed[role]).hash);
      expect(Object.isFrozen(inspected.plan.transactions[role])).toBe(true);
    }
    expect(new Set(Object.values(inspected.transactionHashes)).size).toBe(3);
    expect(Object.isFrozen(inspected)).toBe(true);
    expect(Object.isFrozen(inspected.transactionHashes)).toBe(true);
    expect(Object.isFrozen(inspected.plan)).toBe(true);
    expect(Object.isFrozen(inspected.plan.transactions)).toBe(true);
  });

  it('binds exact mint identity, raw amount, bounded allowance and Ergo destination', () => {
    expect(abi.decodeFunctionData('mintSERG', plan.transactions.mint.data).toArray())
      .toEqual([owner.address, 15_000_000n, reference.mintIdentityHex]);
    const approval = abi.decodeFunctionData('approve', plan.transactions.approval.data);
    expect(approval[0].toLowerCase()).toBe(intent.bridgeAddressHex);
    expect(approval[1]).toBe(15_000_000n);
    expect(abi.decodeFunctionData('pegOut', plan.transactions.pegOut.data).toArray())
      .toEqual([15_000_000n, destination]);
  });

  it('keeps the removed base Sudo outside the new plan domain', () => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1(
      inputWithIntent({ recipientAddressHex: BASE_SUDO }),
    )).toThrow(/must differ from the removed base Sudo/u);
  });

  it.each([
    ['bridge', { bridgeAddressHex: other.address.toLowerCase() }],
    ['token', { tokenAddressHex: other.address.toLowerCase() }],
    ['amount', { amountNanoErg: '14999999' }],
  ] as const)('rejects another %s profile', (_field, changes) => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1(inputWithIntent(changes)))
      .toThrow(/differs from the reviewed LAB profile/u);
  });

  it.each([
    intent.bridgeAddressHex, intent.tokenAddressHex,
  ])('rejects an owner colliding with an application identity: %s', recipientAddressHex => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1(
      inputWithIntent({ recipientAddressHex }),
    )).toThrow(/pairwise distinct/u);
  });

  it('rejects a zero recipient at canonical intent encoding', () => {
    expect(() => inputWithIntent({ recipientAddressHex: `0x${'00'.repeat(20)}` }))
      .toThrow(/recipient address must not be zero/u);
  });

  it.each([
    `0x04${'11'.repeat(32)}`, `0x02${'ff'.repeat(32)}`,
  ])('rejects a non-curve compressed destination', ergoRecipientPublicKeyHex => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1({
      ...input, ergoRecipientPublicKeyHex,
    })).toThrow(/compressed curve point/u);
  });

  it.each(['', '0x02', '0x' + '00'.repeat(34), destination.toUpperCase()])(
    'rejects noncanonical destination bytes', ergoRecipientPublicKeyHex => {
      expect(() => buildFrontierLabApplicationTransactionPlanV1({
        ...input, ergoRecipientPublicKeyHex,
      })).toThrow(/canonical lowercase hex/u);
    },
  );

  it('rejects extra input fields and accessors without invoking them', () => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1({
      ...input, chainId: 1,
    } as FrontierLabApplicationTransactionInputV1)).toThrow(/exact data fields/u);
    const getter = { ...input };
    Object.defineProperty(getter, 'mintReservationStatementHex', {
      get: () => { throw new Error('getter was invoked'); },
    });
    expect(() => buildFrontierLabApplicationTransactionPlanV1(getter))
      .toThrow(/exact data fields/u);
  });

  it('rejects noncanonical statement bytes before decoding', () => {
    expect(() => buildFrontierLabApplicationTransactionPlanV1({
      ...input, mintReservationStatementHex: `${input.mintReservationStatementHex}00`,
    })).toThrow(/canonical lowercase hex/u);
  });
});

describe.each(ROLES)('%s signed application consumer', role => {
  it.each([
    ['chain ID', { chainId: 43 }],
    ['chain ID', { chainId: 0 }],
    ['nonce', { nonce: plan.transactions[role].nonce + 1 }],
    ['gas price', { gasPrice: 999_999_999n }],
    ['gas limit', { gasLimit: 4_999_999n }],
    ['value', { value: 1n }],
    ['destination', { to: other.address }],
    ['destination', { to: null }],
    ['calldata', { data: '0x12345678' }],
    ['calldata', { data: `${plan.transactions[role].data}00` }],
    ['type', { type: 1, accessList: [] }],
  ] satisfies [string, TransactionRequest][])('rejects an isolated %s mutation', async (field, mutation) => {
    const changed = await owner.signTransaction({ ...plan.transactions[role], ...mutation });
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: changed,
    })).toThrow(new RegExp(`${role} application transaction ${field} changed`, 'u'));
  });

  it('rejects a valid signature from another owner with all call fields unchanged', async () => {
    const changed = await other.signTransaction(plan.transactions[role]);
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: changed,
    })).toThrow(/signer differs from the fresh owner/u);
  });

  it('rejects missing signature and altered signature scalar', () => {
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: Transaction.from(plan.transactions[role]).unsignedSerialized,
    })).toThrow(/canonical signed bytes/u);
    const fields = decodeRlp(signed[role]) as string[];
    fields[7] = '0x';
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: encodeRlp(fields),
    })).toThrow(/canonical signed bytes|signature is invalid/u);
  });

  it('rejects a high-s signature, even with its recovery parity flipped', () => {
    const order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    const fields = decodeRlp(signed[role]) as string[];
    fields[8] = toBeHex(order - BigInt(fields[8]!));
    fields[6] = toBeHex(BigInt(fields[6]!) === 119n ? 120n : 119n);
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: encodeRlp(fields),
    })).toThrow(/canonical signed bytes|signature is invalid/u);
  });

  it('rejects a nonminimal RLP zero-value alias of the same signed call', () => {
    const fields = decodeRlp(signed[role]) as string[];
    expect(fields[4]).toBe('0x');
    fields[4] = '0x00';
    const alias = encodeRlp(fields);
    const parsed = Transaction.from(alias);
    expect(parsed.value).toBe(0n);
    expect(parsed.from?.toLowerCase()).toBe(plan.ownerAddressHex);
    expect(parsed.serialized).toBe(signed[role]);
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: alias,
    })).toThrow(/canonical signed bytes/u);
  });
});

describe('signed application binding', () => {
  const alteredCalls = [
    ['mint recipient', 'mint', 'mintSERG', [other.address, 15_000_000n, reference.mintIdentityHex]],
    ['mint amount', 'mint', 'mintSERG', [owner.address, 14_999_999n, reference.mintIdentityHex]],
    ['mint identity', 'mint', 'mintSERG', [owner.address, 15_000_000n, `0x${'12'.repeat(32)}`]],
    ['approval spender', 'approval', 'approve', [other.address, 15_000_000n]],
    ['approval amount', 'approval', 'approve', [intent.bridgeAddressHex, 15_000_001n]],
    ['burn amount', 'pegOut', 'pegOut', [14_999_999n, destination]],
    ['Ergo recipient', 'pegOut', 'pegOut', [15_000_000n, other.signingKey.compressedPublicKey]],
  ] as const;
  it.each(alteredCalls)('rejects a correctly signed altered %s', async (_label, role, method, args) => {
    const changed = await owner.signTransaction({
      ...plan.transactions[role], data: abi.encodeFunctionData(method, args),
    });
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, [role]: changed,
    })).toThrow(/calldata changed/u);
  });

  it('rebuilds mint identity from a different canonical deposit instead of trusting a supplied plan', () => {
    const statement = decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      input.mintReservationStatementHex,
    );
    const changed = { ...statement, sourceLockBoxIdHex: `0x${'14'.repeat(32)}` };
    const mintIdentityHex = deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex: changed.lineageProfileIdHex,
      sourceLockBoxIdHex: changed.sourceLockBoxIdHex,
      depositCommitmentHex: changed.depositCommitmentHex,
    });
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1({
      ...input,
      mintReservationStatementHex: encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
        ...changed, mintIdentityHex,
      }),
    }, signed)).toThrow(/mint application transaction calldata changed/u);
  });

  it('rejects a coordinated replacement owner and signatures against the original input', async () => {
    const replacement = buildFrontierLabApplicationTransactionPlanV1(
      inputWithIntent({ recipientAddressHex: other.address.toLowerCase() }),
    );
    const replaced = {
      mint: await other.signTransaction(replacement.transactions.mint),
      approval: await other.signTransaction(replacement.transactions.approval),
      pegOut: await other.signTransaction(replacement.transactions.pegOut),
    };
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, replaced))
      .toThrow(/mint application transaction calldata changed/u);
  });

  it('rejects omitted, extra or swapped transaction roles', () => {
    const { approval: _approval, ...partial } = signed;
    for (const value of [partial, { ...signed, transfer: signed.mint }]) {
      expect(() => inspectFrontierLabApplicationSignedTransactionsV1(
        input, value as typeof signed,
      )).toThrow(/exact data fields/u);
    }
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, {
      ...signed, approval: signed.pegOut, pegOut: signed.approval,
    })).toThrow(/approval application transaction nonce changed/u);
  });

  it.each(['0x', '0xgg', '0x' + 'ff'.repeat(1025)])('bounds signed bytes before parsing', mint => {
    expect(() => inspectFrontierLabApplicationSignedTransactionsV1(input, { ...signed, mint }))
      .toThrow(/canonical lowercase hex/u);
  });
});
