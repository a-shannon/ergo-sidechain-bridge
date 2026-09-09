import { decodeRlp, encodeRlp } from 'ethers';

export const FEDERATED_NATIVE_MINT_CONSUMED_V4_BYTES = 173;
export const MAX_FEDERATED_LEGACY_ETHEREUM_RAW_V1_BYTES = 64 * 1024;

export interface FederatedNativeMintConsumedV4 {
  readonly profileIdHex: string;
  readonly statementIdHex: string;
  readonly mintIdentityHex: string;
  readonly consumedAtNativeHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
  readonly transactionHashHex: string;
  readonly eventIndex: string | number | bigint;
}

const HASH_FIELDS = [
  'profileIdHex', 'statementIdHex', 'mintIdentityHex',
  'executionBlockHashHex', 'transactionHashHex',
] as const;
const FIELDS = [...HASH_FIELDS, 'consumedAtNativeHeight', 'eventIndex'] as const;
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Exact V4 storage struct, not an observation or execution authorization. */
export function encodeFederatedNativeMintConsumedV4ScaleHex(
  input: Readonly<FederatedNativeMintConsumedV4>,
): string {
  if (input === null || typeof input !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('consumed V4 requires an exact own-data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== FIELDS.length || FIELDS.some(field => {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, field)?.value;
    return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
  })) {
    throw new Error('consumed V4 requires exact enumerable own-data fields');
  }
  const hashes = HASH_FIELDS.map(field => {
    const value: unknown = descriptors[field].value;
    if (typeof value !== 'string' || value.length !== 66 || !/^0x[0-9a-f]{64}$/.test(value)) {
      throw new Error(`${field} must be a lowercase 0x-prefixed 32-byte value`);
    }
    const bytes = Buffer.from(value.slice(2), 'hex');
    if (bytes.every(byte => byte === 0)) throw new Error(`${field} must not be zero`);
    return bytes;
  });
  const height = canonicalUint(descriptors.consumedAtNativeHeight.value, 64, 'consumedAtNativeHeight');
  const index = canonicalUint(descriptors.eventIndex.value, 32, 'eventIndex');
  // ConsumedPooledReserveMintReservationV4, 0001 patch:50708; SCALE fields in declaration order.
  return hex(Buffer.concat([
    Buffer.from([4]), ...hashes.slice(0, 3), littleEndian(height, 8),
    ...hashes.slice(3), littleEndian(index, 4),
  ]));
}

/** Encode bounded canonical signed legacy wire bytes; does not check mint policy or admission. */
export function encodeFederatedNativeMintExtrinsicV1Hex(
  signedTransactionHex: string,
): string {
  if (typeof signedTransactionHex !== 'string' || signedTransactionHex.length % 2 !== 0
    || signedTransactionHex.length > 2 + MAX_FEDERATED_LEGACY_ETHEREUM_RAW_V1_BYTES * 2
    || !/^0x(?:[0-9a-f]{2})+$/.test(signedTransactionHex)) {
    throw new Error('legacy transaction must be bounded lowercase 0x-prefixed bytes');
  }
  let decoded: ReturnType<typeof decodeRlp>;
  try {
    decoded = decodeRlp(signedTransactionHex);
  } catch {
    throw new Error('legacy transaction must be canonical RLP');
  }
  if (!Array.isArray(decoded) || decoded.length !== 9
    || decoded.some(field => typeof field !== 'string')) {
    throw new Error('signed legacy transaction requires exactly nine RLP byte fields');
  }
  if (encodeRlp(decoded) !== signedTransactionHex) {
    throw new Error('legacy transaction must be canonical RLP');
  }
  const fields = decoded as string[];
  const nonce = rlpUint(fields[0], 32, 'nonce');
  const gasPrice = rlpUint(fields[1], 32, 'gasPrice');
  const gasLimit = rlpUint(fields[2], 32, 'gasLimit');
  const action = Buffer.from(fields[3].slice(2), 'hex');
  if (action.length !== 0 && action.length !== 20) {
    throw new Error('legacy transaction action must be Create or a 20-byte Call');
  }
  const value = rlpUint(fields[4], 32, 'value');
  const data = Buffer.from(fields[5].slice(2), 'hex');
  const v = rlpUint(fields[6], 8, 'v');
  const r = rlpUint(fields[7], 32, 'r');
  const s = rlpUint(fields[8], 32, 's');
  // ethereum@3be0d8fd, transaction/legacy.rs: TransactionSignature::new and Encode.
  // This is the crate's signature-format check, not recovery or a low-s admission check.
  if (v !== 27n && v !== 28n && v <= 36n) throw new Error('legacy transaction v is invalid');
  if (r === 0n || r >= SECP256K1_ORDER) throw new Error('legacy transaction r is invalid');
  if (s === 0n || s >= SECP256K1_ORDER) throw new Error('legacy transaction s is invalid');

  // SDK bbc435c7 new_bare uses v5. Runtime pallet/call = 7/0; TransactionV2::Legacy = 0.
  // LegacyTransaction: U256 LE fields, Call(0,H160)/Create(1), Vec input, (u64 LE,H256,H256).
  const body = Buffer.concat([
    Buffer.from([5, 7, 0, 0]),
    littleEndian(nonce, 32), littleEndian(gasPrice, 32), littleEndian(gasLimit, 32),
    action.length === 0 ? Buffer.from([1]) : Buffer.concat([Buffer.from([0]), action]),
    littleEndian(value, 32), compactLength(data.length), data, littleEndian(v, 8),
    Buffer.from(r.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(s.toString(16).padStart(64, '0'), 'hex'),
  ]);
  return hex(Buffer.concat([compactLength(body.length), body]));
}

function canonicalUint(value: unknown, bits: 32 | 64, label: string): bigint {
  if ((typeof value !== 'bigint' && typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'number' && (!Number.isSafeInteger(value) || Object.is(value, -0)))
    || (typeof value === 'string' && (value.length > 20 || value.trim() !== value
      || !/^(?:0|[1-9][0-9]*)$/.test(value)))) {
    throw new Error(`${label} must be a canonical uint${bits}`);
  }
  const result = BigInt(value);
  if (result < 0n || result >= (1n << BigInt(bits))) {
    throw new Error(`${label} must be a canonical uint${bits}`);
  }
  return result;
}

function rlpUint(value: string, maxBytes: number, label: string): bigint {
  if (value.length > 2 + maxBytes * 2 || value.startsWith('0x00')) {
    throw new Error(`legacy transaction ${label} must be a canonical uint${maxBytes * 8}`);
  }
  return value === '0x' ? 0n : BigInt(value);
}

function littleEndian(value: bigint, bytes: number): Buffer {
  return Buffer.from(value.toString(16).padStart(bytes * 2, '0'), 'hex').reverse();
}

function compactLength(value: number): Buffer {
  // Both lengths are bounded by the raw-byte limit plus fixed SCALE overhead, below 2^30.
  if (value < 64) return Buffer.from([value * 4]);
  if (value < 16384) return littleEndian(BigInt(value * 4 + 1), 2);
  return littleEndian(BigInt(value * 4 + 2), 4);
}

function hex(bytes: Buffer): string {
  return `0x${bytes.toString('hex')}`;
}
