import { createHash } from 'crypto';

import blakejs from 'blakejs';

import {
  normalizeErgoNodeHeaderBytes,
} from './adapters/ergo-utxo-state-runtime-witness-capture-port-v1.js';
import {
  parseErgoAutolykosV2HeaderIdentity,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';

export const BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE =
  'eip0045-validity-tracker-canonical-synthetic-header-context';
export const BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE =
  'eip0045-validity-tracker-observed-header-context';

const HEADER_COUNT = 10;
const HEADER_VERSION = 2;
const HEADER_N_BITS = 72_286_528;
const HEADER_DIFFICULTY = '1325481984';
const HEADER_DECLARED_SIZE = 219;
const HEADER_INTERVAL_MS = 120_000;
const HEADER_BASE_TIMESTAMP = 1_700_000_000_000;
const HEADER_MINER_PK =
  '0288114b0586efea9f86e4587f2071bc1c85fb77e15eba96b2769733e0daf57903';
const HEADER_W =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const HEADER_NONCE = '000100000580a91b';
const HEADER_VOTES = '000000';

export interface BridgeValidityTrackerCanonicalHeaderV1 {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly id: string;
  readonly parentId: string;
  readonly height: number;
  readonly extensionRootHex: string;
  readonly jvmHeaderJson: string;
  readonly serializedHex: string;
}

export interface BridgeValidityTrackerCanonicalHeaderContextV1 {
  readonly currentHeight: number;
  readonly anchorHeader: BridgeValidityTrackerCanonicalHeaderV1;
  readonly anchorContextIndex: number;
  readonly headers: readonly BridgeValidityTrackerCanonicalHeaderV1[];
  readonly provenance:
    typeof BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE;
}

export interface BridgeValidityTrackerObservedHeaderContextV1 {
  readonly currentHeight: number;
  readonly anchorHeader: BridgeValidityTrackerCanonicalHeaderV1;
  readonly anchorContextIndex: number;
  readonly headers: readonly BridgeValidityTrackerCanonicalHeaderV1[];
  readonly provenance:
    typeof BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE;
}

const CONTEXTS = new WeakSet<object>();
const OBSERVED_CONTEXTS = new WeakSet<object>();

export function buildBridgeValidityTrackerCanonicalHeaderContextV1(
  wasm: any,
  input: {
    readonly currentHeight: number;
    readonly anchorContextIndex: number;
    readonly anchorExtensionRootHex: string;
  },
): BridgeValidityTrackerCanonicalHeaderContextV1 {
  const currentHeight = safeInteger(input.currentHeight, 'current height');
  if (currentHeight < HEADER_COUNT + 1) {
    throw new Error(
      `canonical synthetic current height must be at least ${HEADER_COUNT + 1}`,
    );
  }
  const anchorContextIndex = safeInteger(
    input.anchorContextIndex,
    'anchor context index',
  );
  if (anchorContextIndex >= HEADER_COUNT) {
    throw new Error(
      `anchor context index must be between 0 and ${HEADER_COUNT - 1}`,
    );
  }
  const anchorExtensionRootHex = fixedHex(
    input.anchorExtensionRootHex,
    32,
    'anchor extension root',
  );
  const anchorHeight = currentHeight - anchorContextIndex - 1;
  let parentId = fixtureHash(
    `eip0045-validity-tracker-oldest-parent-v1:${currentHeight}`,
  );
  const oldestHeight = currentHeight - HEADER_COUNT;
  const oldestToNewest: BridgeValidityTrackerCanonicalHeaderV1[] = [];

  for (let height = oldestHeight; height < currentHeight; height += 1) {
    const extensionRootHex = height === anchorHeight
      ? anchorExtensionRootHex
      : fixtureHash(
        `eip0045-validity-tracker-extension-root-v1:${currentHeight}:${height}`,
      );
    const rawWithoutId = buildRawHeader({
      currentHeight,
      height,
      parentId,
      extensionRootHex,
    });
    const serialized = serializeCanonicalErgoHeaderV2(rawWithoutId);
    const identity = parseErgoAutolykosV2HeaderIdentity(serialized);
    const id = blake2b256Hex(serialized);
    const raw = deepFreeze({
      ...rawWithoutId,
      id,
    });
    const jvmHeaderJson = canonicalJvmHeaderJson(identity);
    const record = deepFreeze({
      raw,
      id,
      parentId,
      height,
      extensionRootHex,
      jvmHeaderJson,
      serializedHex: serialized.toString('hex'),
    });
    assertSigmaRustHeaderIdentity(wasm, record, oldestToNewest.length);
    oldestToNewest.push(record);
    parentId = id;
  }

  const headers = Object.freeze([...oldestToNewest].reverse());
  headers.forEach((header, index) => {
    if (header.height !== currentHeight - index - 1) {
      throw new Error(`canonical synthetic header ${index} height mismatch`);
    }
    if (
      index + 1 < headers.length
      && header.parentId !== headers[index + 1].id
    ) {
      throw new Error(`canonical synthetic header ${index} parent mismatch`);
    }
  });
  const anchorHeader = headers[anchorContextIndex];
  if (
    anchorHeader.height !== anchorHeight
    || anchorHeader.extensionRootHex !== anchorExtensionRootHex
  ) {
    throw new Error('canonical synthetic anchor binding mismatch');
  }

  const context: BridgeValidityTrackerCanonicalHeaderContextV1 = deepFreeze({
    currentHeight,
    anchorHeader,
    anchorContextIndex,
    headers,
    provenance:
      BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
  });
  CONTEXTS.add(context);
  return context;
}

export function assertBridgeValidityTrackerCanonicalHeaderContextV1(
  value: unknown,
): asserts value is BridgeValidityTrackerCanonicalHeaderContextV1 {
  if (
    typeof value !== 'object'
    || value === null
    || !CONTEXTS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error(
      'validity tracker canonical synthetic header context provenance is missing',
    );
  }
  const context = value as BridgeValidityTrackerCanonicalHeaderContextV1;
  if (
    context.headers.length !== HEADER_COUNT
    || context.anchorContextIndex < 0
    || context.anchorContextIndex >= context.headers.length
    || context.anchorHeader !== context.headers[context.anchorContextIndex]
  ) {
    throw new Error(
      'validity tracker canonical synthetic header context shape mismatch',
    );
  }
  context.headers.forEach((header, index) => {
    const serialized = serializeCanonicalErgoHeaderV2(header.raw);
    if (
      serialized.toString('hex') !== header.serializedHex
      || blake2b256Hex(serialized) !== header.id
    ) {
      throw new Error(
        `validity tracker canonical synthetic header ${index} identity mismatch`,
      );
    }
    if (
      index + 1 < context.headers.length
      && header.parentId !== context.headers[index + 1]?.id
    ) {
      throw new Error(
        `validity tracker canonical synthetic header ${index} parent mismatch`,
      );
    }
  });
}

export function buildBridgeValidityTrackerObservedHeaderContextV1(
  wasm: any,
  input: {
    readonly rawHeaders: readonly Readonly<Record<string, unknown>>[];
    readonly anchorContextIndex: number;
    readonly expectedAnchorHeaderIdHex: string;
    readonly expectedAnchorExtensionRootHex: string;
  },
): BridgeValidityTrackerObservedHeaderContextV1 {
  if (input.rawHeaders.length !== HEADER_COUNT) {
    throw new Error(
      `observed header context must contain exactly ${HEADER_COUNT} headers`,
    );
  }
  const anchorContextIndex = safeInteger(
    input.anchorContextIndex,
    'observed anchor context index',
  );
  if (anchorContextIndex >= HEADER_COUNT) {
    throw new Error(
      `observed anchor context index must be between 0 and ${HEADER_COUNT - 1}`,
    );
  }
  const expectedAnchorHeaderIdHex = fixedHex(
    input.expectedAnchorHeaderIdHex,
    32,
    'observed anchor header ID',
  );
  const expectedAnchorExtensionRootHex = fixedHex(
    input.expectedAnchorExtensionRootHex,
    32,
    'observed anchor extension root',
  );
  const headers = Object.freeze(input.rawHeaders.map((rawInput, index) => {
    const raw = deepFreeze(structuredClone(rawInput));
    const { identity, serialized } = canonicalObservedErgoHeader(raw);
    const id = blake2b256Hex(serialized);
    const claimedId = fixedHex(
      raw.id ?? raw.headerId,
      32,
      `observed header ${index} claimed ID`,
    );
    if (claimedId !== id) {
      throw new Error(`observed header ${index} ID is not canonical`);
    }
    const record: BridgeValidityTrackerCanonicalHeaderV1 = deepFreeze({
      raw,
      id,
      parentId: Buffer.from(identity.parentId).toString('hex'),
      height: identity.height,
      extensionRootHex: Buffer.from(identity.extensionHash).toString('hex'),
      jvmHeaderJson: canonicalJvmHeaderJson(identity),
      serializedHex: serialized.toString('hex'),
    });
    assertSigmaRustHeaderIdentity(wasm, record, index, 'observed');
    return record;
  }));
  const currentHeight = headers[0]!.height + 1;
  headers.forEach((header, index) => {
    if (header.height !== currentHeight - index - 1) {
      throw new Error(`observed header ${index} height is not contiguous`);
    }
    if (
      index + 1 < headers.length
      && header.parentId !== headers[index + 1]!.id
    ) {
      throw new Error(`observed header ${index} parent lineage is broken`);
    }
  });
  const anchorHeader = headers[anchorContextIndex]!;
  if (
    anchorHeader.id !== expectedAnchorHeaderIdHex
    || anchorHeader.extensionRootHex !== expectedAnchorExtensionRootHex
  ) {
    throw new Error('observed anchor header binding mismatch');
  }
  const context: BridgeValidityTrackerObservedHeaderContextV1 = deepFreeze({
    currentHeight,
    anchorHeader,
    anchorContextIndex,
    headers,
    provenance: BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
  });
  OBSERVED_CONTEXTS.add(context);
  return context;
}

export function assertBridgeValidityTrackerObservedHeaderContextV1(
  value: unknown,
): asserts value is BridgeValidityTrackerObservedHeaderContextV1 {
  if (
    typeof value !== 'object'
    || value === null
    || !OBSERVED_CONTEXTS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error(
      'validity tracker observed header context provenance is missing',
    );
  }
  const context = value as BridgeValidityTrackerObservedHeaderContextV1;
  if (
    context.provenance
      !== BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE
    || context.headers.length !== HEADER_COUNT
    || context.currentHeight !== context.headers[0]!.height + 1
    || context.anchorContextIndex < 0
    || context.anchorContextIndex >= context.headers.length
    || context.anchorHeader !== context.headers[context.anchorContextIndex]
  ) {
    throw new Error('validity tracker observed header context shape mismatch');
  }
  context.headers.forEach((header, index) => {
    const { identity, serialized } = canonicalObservedErgoHeader(header.raw);
    if (
      header.height !== context.currentHeight - index - 1
      || serialized.toString('hex') !== header.serializedHex
      || blake2b256Hex(serialized) !== header.id
      || Buffer.from(identity.parentId).toString('hex') !== header.parentId
      || Buffer.from(identity.extensionHash).toString('hex')
        !== header.extensionRootHex
      || canonicalJvmHeaderJson(identity) !== header.jvmHeaderJson
      || (
        index + 1 < context.headers.length
        && header.parentId !== context.headers[index + 1]!.id
      )
    ) {
      throw new Error(
        `validity tracker observed header ${index} identity mismatch`,
      );
    }
  });
}

function canonicalObservedErgoHeader(
  rawInput: Readonly<Record<string, unknown>>,
): Readonly<{
  readonly identity: ErgoHeaderIdentityFields;
  readonly serialized: Buffer;
}> {
  const serialized = normalizeErgoNodeHeaderBytes(rawInput);
  const identity = parseErgoAutolykosV2HeaderIdentity(serialized);
  const raw = requiredRecord(rawInput, 'observed Ergo header');
  const extensionRootHex = Buffer.from(identity.extensionHash).toString('hex');
  if (
    raw.extensionRoot !== undefined
    && fixedHex(raw.extensionRoot, 32, 'observed header extensionRoot alias')
      !== extensionRootHex
  ) {
    throw new Error('observed header extension root aliases disagree');
  }
  const pow = requiredRecord(raw.powSolutions, 'observed header PoW solution');
  // V2 commits only pk and n. Freshly mined headers may retain the miner's
  // in-memory w/d aliases, while serialized-and-reloaded headers expose the
  // protocol placeholders. Validate the aliases but canonicalize JVM input.
  if (pow.w !== undefined) {
    fixedHex(pow.w, 33, 'observed Autolykos V2 one-time key');
  }
  if (pow.d !== undefined) {
    decimalInteger(pow.d, 'observed Autolykos V2 distance');
  }
  return Object.freeze({ identity, serialized });
}

export function serializeCanonicalErgoHeaderV2(
  rawInput: Readonly<Record<string, unknown>>,
): Buffer {
  const raw = requiredRecord(rawInput, 'canonical Ergo header');
  if (safeInteger(raw.version, 'header version') !== HEADER_VERSION) {
    throw new Error('canonical Ergo header version must be 2');
  }
  const pow = requiredRecord(raw.powSolutions, 'header PoW solution');
  if (decimalInteger(pow.d, 'header PoW distance') !== '0') {
    throw new Error('canonical Ergo v2 header PoW distance must be zero');
  }
  fixedHex(pow.w, 33, 'header PoW one-time key');
  const timestamp = unsignedSafeInteger(raw.timestamp, 'header timestamp');
  const height = unsignedSafeInteger(raw.height, 'header height');
  const unparsed = Buffer.alloc(0);
  const serialized = Buffer.concat([
    Buffer.from([HEADER_VERSION]),
    hexBytes(raw.parentId, 32, 'header parent ID'),
    hexBytes(raw.adProofsRoot, 32, 'header AD proofs root'),
    hexBytes(raw.transactionsRoot, 32, 'header transactions root'),
    hexBytes(raw.stateRoot, 33, 'header state root'),
    unsignedVlq(timestamp),
    hexBytes(
      raw.extensionRoot ?? raw.extensionHash,
      32,
      'header extension root',
    ),
    uint32Be(unsignedSafeInteger(raw.nBits, 'header nBits'), 'header nBits'),
    unsignedVlq(height),
    hexBytes(raw.votes, 3, 'header votes'),
    Buffer.from([unparsed.length]),
    hexBytes(pow.pk, 33, 'header miner public key'),
    hexBytes(pow.n, 8, 'header PoW nonce'),
  ]);
  if (serialized.length < 200 || serialized.length > 256) {
    throw new Error(
      'canonical Ergo v2 header serialized length is outside the bounded profile',
    );
  }
  return serialized;
}

function buildRawHeader(input: {
  readonly currentHeight: number;
  readonly height: number;
  readonly parentId: string;
  readonly extensionRootHex: string;
}): Record<string, unknown> {
  const label = `${input.currentHeight}:${input.height}`;
  return {
    extensionId: fixtureHash(
      `eip0045-validity-tracker-extension-id-v1:${label}`,
    ),
    difficulty: HEADER_DIFFICULTY,
    votes: HEADER_VOTES,
    timestamp:
      HEADER_BASE_TIMESTAMP
      + (input.height - (input.currentHeight - HEADER_COUNT))
      * HEADER_INTERVAL_MS,
    size: HEADER_DECLARED_SIZE,
    stateRoot: `00${fixtureHash(
      `eip0045-validity-tracker-state-root-v1:${label}`,
    )}`,
    height: input.height,
    nBits: HEADER_N_BITS,
    version: HEADER_VERSION,
    adProofsRoot: fixtureHash(
      `eip0045-validity-tracker-ad-proofs-root-v1:${label}`,
    ),
    transactionsRoot: fixtureHash(
      `eip0045-validity-tracker-transactions-root-v1:${label}`,
    ),
    extensionHash: input.extensionRootHex,
    powSolutions: {
      pk: HEADER_MINER_PK,
      w: HEADER_W,
      n: HEADER_NONCE,
      d: 0,
    },
    adProofsId: fixtureHash(
      `eip0045-validity-tracker-ad-proofs-id-v1:${label}`,
    ),
    transactionsId: fixtureHash(
      `eip0045-validity-tracker-transactions-id-v1:${label}`,
    ),
    parentId: input.parentId,
  };
}

function canonicalJvmHeaderJson(identity: ErgoHeaderIdentityFields): string {
  return JSON.stringify({
    version: identity.version,
    parentId: Buffer.from(identity.parentId).toString('hex'),
    adProofsRoot: Buffer.from(identity.adProofsRoot).toString('hex'),
    stateRoot: {
      digest: Buffer.from(identity.stateRoot).toString('hex'),
      treeFlags: 7,
      keyLength: 32,
      valueLength: null,
    },
    transactionsRoot: Buffer.from(identity.transactionsRoot).toString('hex'),
    timestamp: unsignedSafeInteger(
      Number(identity.timestamp),
      'JVM header timestamp',
    ),
    nBits: identity.nBits,
    height: identity.height,
    extensionRoot: Buffer.from(identity.extensionHash).toString('hex'),
    minerPk: Buffer.from(identity.powSolution.publicKey).toString('hex'),
    powOnetimePk: HEADER_W,
    powNonce: Buffer.from(identity.powSolution.nonce).toString('hex'),
    powDistance: 0,
    votes: Buffer.from(identity.votes).toString('hex'),
  });
}

function assertSigmaRustHeaderIdentity(
  wasm: any,
  record: BridgeValidityTrackerCanonicalHeaderV1,
  index: number,
  source: 'synthetic' | 'observed' = 'synthetic',
): void {
  let header: any;
  let id: any;
  let expectedId: any;
  try {
    header = wasm.BlockHeader.from_json(JSON.stringify(record.raw));
    id = header.id();
    expectedId = wasm.BlockId.from_str(record.id);
    if (!id.equals(expectedId)) {
      throw new Error(
        `sigma-rust changed canonical ${source} header ${index} identity`,
      );
    }
  } finally {
    expectedId?.free?.();
    id?.free?.();
    header?.free?.();
  }
}

function unsignedVlq(value: number): Buffer {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  while (true) {
    if ((remaining & ~0x7fn) === 0n) {
      bytes.push(Number(remaining));
      return Buffer.from(bytes);
    }
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
}

function uint32Be(value: number, label: string): Buffer {
  if (value > 0xffff_ffff) {
    throw new Error(`${label} exceeds unsigned 32-bit range`);
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function hexBytes(
  value: unknown,
  bytes: number,
  label: string,
): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be hex`);
  }
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-fA-F]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return normalized.toLowerCase();
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return parsed;
}

function unsignedSafeInteger(value: unknown, label: string): number {
  return safeInteger(value, label);
}

function decimalInteger(value: unknown, label: string): string {
  const text = typeof value === 'bigint'
    ? value.toString()
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string' && /^[0-9]+$/.test(value)
        ? value
        : undefined;
  if (text === undefined) {
    throw new Error(`${label} must be a nonnegative decimal integer`);
  }
  return BigInt(text).toString();
}

function fixtureHash(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function blake2b256Hex(bytes: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex');
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, any> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
