import { randomBytes } from 'node:crypto';
import { Wallet, keccak256, recoverAddress, type HDNodeWallet } from 'ethers';
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
const reservationSigners = new WeakSet<object>();

export interface FederatedGenesisReservationInputV1 {
  readonly genesisHashHex: string;
  readonly nonce: number;
  readonly statementHex: string;
  readonly sourceProofEnvelopeScaleHex: string;
}

/** Pinned AccountId20/EthereumSignature runtime only. No RPC or transport. */
export function signFederatedGenesisReservationV1(
  owner: Readonly<FederatedGenesisOperatorV1>,
  input: Readonly<FederatedGenesisReservationInputV1>,
) {
  assertFederatedGenesisOperatorV1(owner);
  if (reservationSigners.has(owner)) throw new Error('FED native reservation signing is already consumed');
  const keys = ['genesisHashHex', 'nonce', 'statementHex', 'sourceProofEnvelopeScaleHex'];
  if (input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== keys.length || keys.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('FED native reservation requires exact own-data fields');
  const { genesisHashHex, nonce, statementHex, sourceProofEnvelopeScaleHex } = input;
  if (typeof genesisHashHex !== 'string' || !/^0x[0-9a-f]{64}$/.test(genesisHashHex)
    || genesisHashHex === `0x${'00'.repeat(32)}`
    || !Number.isSafeInteger(nonce) || nonce < 0 || nonce > 0xffffffff
    || typeof statementHex !== 'string' || !/^0x[0-9a-f]{1206}$/.test(statementHex)
    || typeof sourceProofEnvelopeScaleHex !== 'string'
    || !/^0x(?:[0-9a-f]{2}){1,65536}$/.test(sourceProofEnvelopeScaleHex)) {
    throw new Error('FED native reservation has invalid canonical bytes or nonce');
  }
  const statement = Buffer.from(statementHex.slice(2), 'hex');
  const proof = Buffer.from(sourceProofEnvelopeScaleHex.slice(2), 'hex');
  // Pallet 12 / call 6: Vec<u8> statement, followed by the already SCALE-encoded proof struct.
  const call = Buffer.concat([Buffer.from([12, 6]), compact(statement.length), statement, proof]);
  // Immortal era, compact u32 nonce, zero tip. The proof itself has bounded expiry.
  const extra = Buffer.concat([Buffer.from([0]), compact(nonce), Buffer.from([0])]);
  const genesis = Buffer.from(genesisHashHex.slice(2), 'hex');
  const payload = Buffer.concat([call, extra, Buffer.from('0100000001000000', 'hex'), genesis, genesis]);
  // SDK SignedPayload hashes payloads >256 bytes before EthereumSignature hashes with Keccak.
  const signingDigestHex = keccak256(blakejs.blake2b(payload, undefined, 32));
  reservationSigners.add(owner);
  try {
    const signature = owners.get(owner)!.signingKey.sign(signingDigestHex);
    if (recoverAddress(signingDigestHex, signature).toLowerCase().slice(2) !== owner.addressHex) {
      throw new Error('FED native reservation signature has a different signer');
    }
    const signatureBytes = Buffer.concat([Buffer.from(signature.r.slice(2), 'hex'),
      Buffer.from(signature.s.slice(2), 'hex'), Buffer.from([signature.yParity])]);
    const body = Buffer.concat([Buffer.from([0x84]), Buffer.from(owner.addressHex, 'hex'),
      signatureBytes, extra, call]);
    const extrinsic = Buffer.concat([compact(body.length), body]);
    assertFederatedGenesisOperatorV1(owner);
    return Object.freeze({ genesisHashHex, nonce, signerAddressHex: owner.addressHex,
      callScaleHex: `0x${call.toString('hex')}`, signingDigestHex,
      signedExtrinsicHex: `0x${extrinsic.toString('hex')}`,
      extrinsicHashHex: `0x${Buffer.from(blakejs.blake2b(extrinsic, undefined, 32)).toString('hex')}` });
  } catch (error) {
    disposeFederatedGenesisOperatorV1(owner);
    throw error;
  }
}

function compact(value: number): Buffer {
  if (value < 64) return Buffer.from([value * 4]);
  if (value < 16384) { const result = Buffer.alloc(2); result.writeUInt16LE(value * 4 + 1); return result; }
  if (value < 0x40000000) { const result = Buffer.alloc(4); result.writeUInt32LE(value * 4 + 2); return result; }
  const result = Buffer.alloc(5); result[0] = 3; result.writeUInt32LE(value, 1); return result;
}

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
