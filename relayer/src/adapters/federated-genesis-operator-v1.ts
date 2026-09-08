import { randomBytes } from 'node:crypto';
import { Wallet, type HDNodeWallet } from 'ethers';
import blakejs from 'blakejs';

const SYSTEM_ACCOUNT_PREFIX = '26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9';
const NATIVE_ENDOWMENT = 100_000_000_000_000_000_000n;

export interface FederatedGenesisOperatorV1 {
  readonly addressHex: string;
  readonly launchDomainHex: string;
  readonly nativeFunding: Readonly<{
    amountUnits: string;
    storageKeyHex: string;
    accountInfoScaleHex: string;
  }>;
}

const owners = new WeakMap<object, HDNodeWallet>();

/** Fresh local custody only. Creation never signs or connects to a provider. */
export function createFederatedGenesisOperatorV1(): Readonly<FederatedGenesisOperatorV1> {
  const wallet = Wallet.createRandom();
  const addressHex = wallet.address.toLowerCase().slice(2);
  // Pinned FED runtime: AccountId20, Blake2_128Concat, AccountInfo<u32,
  // AccountData<u128>>. SDK bbc435c genesis gives one provider and NEW_LOGIC.
  const account = Buffer.alloc(80);
  account.writeUInt32LE(1, 8);
  account.writeBigUInt64LE(NATIVE_ENDOWMENT & ((1n << 64n) - 1n), 16);
  account.writeBigUInt64LE(NATIVE_ENDOWMENT >> 64n, 24);
  account[79] = 0x80;
  const keyHash = Buffer.from(blakejs.blake2b(Buffer.from(addressHex, 'hex'), undefined, 16)).toString('hex');
  const owner = Object.freeze({ addressHex, launchDomainHex: randomBytes(32).toString('hex'),
    nativeFunding: Object.freeze({ amountUnits: NATIVE_ENDOWMENT.toString(),
      storageKeyHex: `0x${SYSTEM_ACCOUNT_PREFIX}${keyHash}${addressHex}`,
      accountInfoScaleHex: `0x${account.toString('hex')}` }) });
  owners.set(owner, wallet);
  return owner;
}

export function assertFederatedGenesisOperatorV1(owner: Readonly<FederatedGenesisOperatorV1>): void {
  const wallet = owners.get(owner);
  if (!wallet || wallet.address.toLowerCase().slice(2) !== owner.addressHex) {
    throw new Error('FED operator custody is absent, copied or disposed');
  }
}

export function disposeFederatedGenesisOperatorV1(owner: Readonly<FederatedGenesisOperatorV1>): void {
  owners.delete(owner);
}
