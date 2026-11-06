import { Interface, SigningKey, Transaction } from 'ethers';

import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
} from './substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const application = new Interface([
  'function mintSERG(address recipient,uint256 amount,bytes32 mintIdentity)',
  'function approve(address spender,uint256 amount)',
  'function pegOut(uint256 amount,bytes recipientPublicKey)',
]);
const ROLES = ['mint', 'approval', 'pegOut'] as const;
type Role = typeof ROLES[number];

export interface FrontierLabApplicationTransactionInputV1 {
  readonly mintReservationStatementHex: string;
  readonly ergoRecipientPublicKeyHex: string;
}

export interface FrontierLabApplicationTransactionV1 {
  readonly type: 0;
  readonly chainId: 42;
  readonly nonce: number;
  readonly gasPrice: '1000000000';
  readonly gasLimit: '5000000';
  readonly value: '0';
  readonly to: string;
  readonly data: string;
}

export interface FrontierLabApplicationTransactionPlanV1 {
  readonly ownerAddressHex: string;
  readonly mintReservationStatementIdHex: string;
  readonly mintIdentityHex: string;
  readonly transactions: Readonly<Record<Role, Readonly<FrontierLabApplicationTransactionV1>>>;
}

/**
 * Plans calls for a fresh, funded LAB owner with nonce zero. The runner must
 * establish that prestate with signed setup transactions, not storage edits.
 * These calls neither authenticate the source statement nor authorize execution.
 */
export function buildFrontierLabApplicationTransactionPlanV1(
  input: Readonly<FrontierLabApplicationTransactionInputV1>,
): Readonly<FrontierLabApplicationTransactionPlanV1> {
  exactDataFields(input, [
    'mintReservationStatementHex', 'ergoRecipientPublicKeyHex',
  ], 'application transaction input');
  canonicalHex(input.mintReservationStatementHex, 603, 603, 'mint statement');
  canonicalHex(input.ergoRecipientPublicKeyHex, 33, 33, 'Ergo recipient key');
  try {
    if (SigningKey.computePublicKey(input.ergoRecipientPublicKeyHex, true)
      !== input.ergoRecipientPublicKeyHex) {
      throw new Error('noncanonical key');
    }
  } catch {
    throw new Error('application Ergo recipient key must be a compressed curve point');
  }
  const statement = decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
    input.mintReservationStatementHex,
  );
  const intent = decodePegInSourceIntentV2Hex(statement.sourceIntentHex);
  if (intent.bridgeAddressHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1
    || intent.tokenAddressHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1
    || intent.amountNanoErg.toString() !== '15000000') {
    throw new Error('application transaction intent differs from the reviewed LAB profile');
  }
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
    bridgeAddressHex: intent.bridgeAddressHex,
    tokenAddressHex: intent.tokenAddressHex,
    bridgeOwnerAddressHex: intent.recipientAddressHex,
    recipientAddressHex: intent.recipientAddressHex.slice(2),
    removedBaseSudoAddressHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
  });
  const call = (nonce: number, to: string, name: string, args: readonly unknown[]) =>
    Object.freeze({
      type: 0 as const,
      chainId: 42 as const,
      nonce,
      gasPrice: '1000000000' as const,
      gasLimit: '5000000' as const,
      value: '0' as const,
      to,
      data: application.encodeFunctionData(name, args),
    });
  return Object.freeze({
    ownerAddressHex: intent.recipientAddressHex,
    mintReservationStatementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(statement),
    mintIdentityHex: statement.mintIdentityHex,
    transactions: Object.freeze({
      mint: call(0, intent.bridgeAddressHex, 'mintSERG', [
        intent.recipientAddressHex, intent.amountNanoErg, statement.mintIdentityHex,
      ]),
      approval: call(1, intent.tokenAddressHex, 'approve', [
        intent.bridgeAddressHex, intent.amountNanoErg,
      ]),
      pegOut: call(2, intent.bridgeAddressHex, 'pegOut', [
        intent.amountNanoErg, input.ergoRecipientPublicKeyHex,
      ]),
    }),
  });
}

/**
 * Checks signed bytes against a plan rebuilt from the expected input. The
 * result is a byte/signature check, not a source-proof or execution receipt.
 * A consumer still needs the exact proof, request, runtime and custody binding.
 */
export function inspectFrontierLabApplicationSignedTransactionsV1(
  input: Readonly<FrontierLabApplicationTransactionInputV1>,
  signedTransactions: Readonly<Record<Role, string>>,
): Readonly<{
  plan: Readonly<FrontierLabApplicationTransactionPlanV1>;
  transactionHashes: Readonly<Record<Role, string>>;
}> {
  const plan = buildFrontierLabApplicationTransactionPlanV1(input);
  exactDataFields(signedTransactions, ROLES, 'signed application transactions');
  const hashes = {} as Record<Role, string>;
  for (const role of ROLES) {
    const bytes = signedTransactions[role];
    canonicalHex(bytes, 1, 1024, `${role} transaction`);
    const expected = plan.transactions[role];
    let transaction: Transaction;
    try {
      transaction = Transaction.from(bytes);
      if (transaction.signature === null || !transaction.signature.isValid()
        || transaction.serialized !== bytes) {
        throw new Error('noncanonical or unsigned transaction');
      }
    } catch {
      throw new Error(`${role} application transaction must be canonical signed bytes`);
    }
    if (transaction.type !== expected.type) {
      throw new Error(`${role} application transaction type changed`);
    }
    if (transaction.chainId !== BigInt(expected.chainId)
      || transaction.signature.networkV === null) {
      throw new Error(`${role} application transaction chain ID changed`);
    }
    if (transaction.nonce !== expected.nonce) {
      throw new Error(`${role} application transaction nonce changed`);
    }
    if (transaction.gasPrice !== BigInt(expected.gasPrice)) {
      throw new Error(`${role} application transaction gas price changed`);
    }
    if (transaction.gasLimit !== BigInt(expected.gasLimit)) {
      throw new Error(`${role} application transaction gas limit changed`);
    }
    if (transaction.value !== 0n) {
      throw new Error(`${role} application transaction value changed`);
    }
    if (transaction.to?.toLowerCase() !== expected.to) {
      throw new Error(`${role} application transaction destination changed`);
    }
    if (transaction.data !== expected.data) {
      throw new Error(`${role} application transaction calldata changed`);
    }
    let signer: string | null;
    try {
      signer = transaction.from?.toLowerCase() ?? null;
    } catch {
      throw new Error(`${role} application transaction signature is invalid`);
    }
    if (signer !== plan.ownerAddressHex) {
      throw new Error(`${role} application transaction signer differs from the fresh owner`);
    }
    hashes[role] = transaction.hash!;
  }
  return Object.freeze({ plan, transactionHashes: Object.freeze(hashes) });
}

function canonicalHex(value: unknown, minimum: number, maximum: number, label: string): void {
  if (typeof value !== 'string' || value.length < 2 + minimum * 2
    || value.length > 2 + maximum * 2 || !/^0x(?:[0-9a-f]{2})+$/u.test(value)) {
    throw new Error(`${label} must be bounded canonical lowercase hex`);
  }
}

function exactDataFields(value: unknown, fields: readonly string[], label: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some(field => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      return descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable;
    })) {
    throw new Error(`${label} must contain only its exact data fields`);
  }
}
