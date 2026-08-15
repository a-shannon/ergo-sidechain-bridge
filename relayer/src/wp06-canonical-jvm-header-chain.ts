import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export const WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX =
  '8fa7379546dab11f551defddecab4ca1454e390bf710f85a6ce7e322a6c5743d';
export const WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX =
  '0a3c4231573c5578c6dc0dbf81b43cb14e4d7c6a6bb9758bfa8fa43b95b06048';
export const WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE =
  'wp06-jvm-canonical-synthetic-header-context';

const VECTOR_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../test-vectors/wp06-canonical-jvm-header-chain-v1.json',
);
const OLDEST_HEIGHT = 99_990;
const TRACKER_TIP_HEIGHT = 99_999;
const NEWEST_HEIGHT = 100_004;
const ANCHOR_HEIGHT = 99_995;
const HEADER_VERSION = 2;
const HEADER_N_BITS = 72_286_528;
const HEADER_DIFFICULTY = '1325481984';
const HEADER_SIZE = 219;
const HEADER_INTERVAL_MS = 120_000;
const HEADER_BASE_TIMESTAMP = 1_700_000_000_000;
const HEADER_MINER_PK =
  '0288114b0586efea9f86e4587f2071bc1c85fb77e15eba96b2769733e0daf57903';
const HEADER_W =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const HEADER_NONCE = '000100000580a91b';
const HEADER_VOTES = '000000';

export interface Wp06CanonicalJvmHeaderRecord {
  raw: Readonly<Record<string, unknown>>;
  id: string;
  parentId: string;
  height: number;
  extensionRootHex: string;
  jvmHeaderJson: string;
  jvmHeaderJsonSha256Hex: string;
}

export interface Wp06CanonicalJvmHeaderWindow {
  currentHeight: number;
  anchorContextIndex: number;
  anchorHeader: Wp06CanonicalJvmHeaderRecord;
  headers: readonly Wp06CanonicalJvmHeaderRecord[];
  vectorFileSha256Hex: typeof WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX;
  provenance: typeof WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE;
}

export interface Wp06CanonicalJvmHeaderVector {
  fileSha256Hex: typeof WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX;
  anchorIdHex: string;
  anchorHeight: typeof ANCHOR_HEIGHT;
  anchorExtensionRootHex: typeof WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX;
  headersOldestToNewest: readonly Wp06CanonicalJvmHeaderRecord[];
  trackerAdmission: Wp06CanonicalJvmHeaderWindow;
  settlement: Wp06CanonicalJvmHeaderWindow;
  boundaries: {
    deterministicSyntheticHeaders: true;
    minedHeaderEvidence: false;
    nodeStatefulAcceptance: false;
    broadcastPerformed: false;
  };
}

type WindowName = 'trackerAdmission' | 'settlement';

const VECTORS = new WeakSet<object>();
const WINDOWS = new WeakSet<object>();

export function loadWp06CanonicalJvmHeaderVector(): Wp06CanonicalJvmHeaderVector {
  const bytes = readFileSync(VECTOR_PATH);
  const fileSha256Hex = sha256(bytes);
  if (fileSha256Hex !== WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX) {
    throw new Error('WP-06 canonical JVM header vector file SHA-256 mismatch');
  }
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  assertWp06CanonicalJvmHeaderVectorStructure(parsed);
  const rawVector = parsed as Record<string, any>;
  const rawChain = rawVector.chain as Record<string, any>;
  const entries = rawChain.headers as Array<Record<string, unknown>>;
  const anchorIdHex = fixedHex(rawChain.anchorIdHex, 32, 'canonical JVM anchor ID');
  const records = entries.map(entry => buildCanonicalRecord(entry, anchorIdHex));
  const byHeight = new Map(records.map(record => [record.height, record]));
  const trackerAdmission = buildWindow(
    rawVector.windows.trackerAdmission,
    byHeight,
    fileSha256Hex,
  );
  const settlement = buildWindow(
    rawVector.windows.settlement,
    byHeight,
    fileSha256Hex,
  );
  if (trackerAdmission.anchorHeader !== settlement.anchorHeader) {
    throw new Error('WP-06 canonical JVM windows must share one exact anchor object');
  }
  const vector: Wp06CanonicalJvmHeaderVector = deepFreeze({
    fileSha256Hex: WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX,
    anchorIdHex,
    anchorHeight: ANCHOR_HEIGHT as typeof ANCHOR_HEIGHT,
    anchorExtensionRootHex: WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX,
    headersOldestToNewest: records,
    trackerAdmission,
    settlement,
    boundaries: {
      deterministicSyntheticHeaders: true as const,
      minedHeaderEvidence: false as const,
      nodeStatefulAcceptance: false as const,
      broadcastPerformed: false as const,
    },
  });
  VECTORS.add(vector);
  return vector;
}

export function getWp06CanonicalJvmHeaderWindow(
  vector: Wp06CanonicalJvmHeaderVector,
  name: WindowName,
): Wp06CanonicalJvmHeaderWindow {
  assertWp06CanonicalJvmHeaderVectorProvenance(vector);
  const window = vector[name];
  assertWp06CanonicalJvmHeaderWindowProvenance(window);
  return window;
}

export function assertWp06CanonicalJvmHeaderVectorProvenance(
  value: unknown,
): asserts value is Wp06CanonicalJvmHeaderVector {
  if (
    typeof value !== 'object'
    || value === null
    || !VECTORS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error('WP-06 canonical JVM header vector provenance is missing');
  }
}

export function assertWp06CanonicalJvmHeaderWindowProvenance(
  value: unknown,
): asserts value is Wp06CanonicalJvmHeaderWindow {
  if (
    typeof value !== 'object'
    || value === null
    || !WINDOWS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error('WP-06 canonical JVM header window provenance is missing');
  }
}

export function assertWp06CanonicalJvmFixtureHeaderBinding(
  window: Wp06CanonicalJvmHeaderWindow,
  fixture: {
    headers: ReadonlyArray<{ expectedIdHex: string; headerJson: string }>;
  },
): void {
  assertWp06CanonicalJvmHeaderWindowProvenance(window);
  if (fixture.headers.length !== window.headers.length) {
    throw new Error('WP-06 JVM fixture header count differs from the canonical window');
  }
  window.headers.forEach((header, index) => {
    requireExact(
      fixedHex(fixture.headers[index]?.expectedIdHex, 32, `JVM fixture header ${index} ID`),
      header.id,
      `WP-06 JVM fixture header ${index} expected ID`,
    );
    requireExact(
      fixture.headers[index]?.headerJson,
      header.jvmHeaderJson,
      `WP-06 JVM fixture header ${index} JSON`,
    );
  });
}

export function assertWp06CanonicalJvmHeaderVectorStructure(value: unknown): void {
  const vector = requiredRecord(value, 'canonical JVM header vector');
  requireExact(vector.schemaVersion, 1, 'canonical JVM vector schema version');
  requireExact(vector.kind, 'wp06-canonical-jvm-header-chain-v1', 'canonical JVM vector kind');
  const generator = requiredRecord(vector.generator, 'canonical JVM vector generator');
  requireExact(generator.sigmaStateVersion, '6.0.2', 'canonical JVM sigma-state version');
  requireExact(generator.scalaVersion, '2.12.20', 'canonical JVM Scala version');
  requireExact(
    generator.decoder,
    'org.ergoplatform.sdk.JsonCodecs.headerDecoder',
    'canonical JVM decoder',
  );
  requireExact(generator.identity, 'sigma.Header.id', 'canonical JVM identity derivation');
  requireExact(generator.generationOrder, 'oldest-to-newest', 'canonical JVM generation order');
  requireExact(
    generator.fieldProfile,
    'authenticated-v2-deterministic-header-v1',
    'canonical JVM field profile',
  );

  const chain = requiredRecord(vector.chain, 'canonical JVM chain');
  requireExact(chain.oldestHeight, OLDEST_HEIGHT, 'canonical JVM oldest height');
  requireExact(chain.newestHeight, NEWEST_HEIGHT, 'canonical JVM newest height');
  requireExact(chain.anchorHeight, ANCHOR_HEIGHT, 'canonical JVM anchor height');
  const oldestParentIdHex = fixedHex(
    chain.oldestParentIdHex,
    32,
    'canonical JVM oldest parent ID',
  );
  requireExact(
    oldestParentIdHex,
    fixtureHash('authenticated-v2-vm-header-id-11'),
    'canonical JVM oldest parent ID',
  );
  const anchorIdHex = fixedHex(chain.anchorIdHex, 32, 'canonical JVM anchor ID');
  requireExact(
    fixedHex(chain.anchorExtensionRootHex, 32, 'canonical JVM anchor extension root'),
    WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX,
    'canonical JVM anchor extension root',
  );
  assertParameters(requiredRecord(chain.parameters, 'canonical JVM parameters'));

  if (!Array.isArray(chain.headers) || chain.headers.length !== 15) {
    throw new Error('canonical JVM chain must contain exactly 15 headers');
  }
  let expectedParentId = oldestParentIdHex;
  let observedAnchor: Record<string, unknown> | undefined;
  for (let index = 0; index < chain.headers.length; index += 1) {
    const entry = requiredRecord(chain.headers[index], `canonical JVM header ${index}`);
    const expectedHeight = OLDEST_HEIGHT + index;
    requireExact(entry.height, expectedHeight, `canonical JVM header ${index} height`);
    const idHex = fixedHex(entry.idHex, 32, `canonical JVM header ${index} ID`);
    const parentIdHex = fixedHex(
      entry.parentIdHex,
      32,
      `canonical JVM header ${index} parent ID`,
    );
    requireExact(
      parentIdHex,
      expectedParentId,
      `canonical JVM header ${index} parent link`,
    );
    const extensionRootHex = fixedHex(
      entry.extensionRootHex,
      32,
      `canonical JVM header ${index} extension root`,
    );
    if (expectedHeight === ANCHOR_HEIGHT) {
      requireExact(
        extensionRootHex,
        WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX,
        'canonical JVM anchor extension root',
      );
    }
    const rebuilt = buildRawHeader({
      height: expectedHeight,
      id: idHex,
      parentId: parentIdHex,
      extensionRootHex,
      anchorIdHex,
    });
    requireExact(
      fixedHex(
        entry.jvmHeaderJsonSha256Hex,
        32,
        `canonical JVM header ${index} JVM JSON digest`,
      ),
      sha256(Buffer.from(rebuilt.jvmHeaderJson, 'utf8')),
      `canonical JVM header ${index} JVM JSON digest`,
    );
    if (expectedHeight === ANCHOR_HEIGHT) observedAnchor = entry;
    expectedParentId = idHex;
  }
  if (!observedAnchor) throw new Error('canonical JVM chain is missing its anchor');
  requireExact(observedAnchor.idHex, anchorIdHex, 'canonical JVM anchor ID');
  requireExact(
    observedAnchor.extensionRootHex,
    WP06_CANONICAL_JVM_ANCHOR_EXTENSION_ROOT_HEX,
    'canonical JVM anchor extension root',
  );

  const windows = requiredRecord(vector.windows, 'canonical JVM windows');
  assertWindowStructure(
    windows.trackerAdmission,
    'tracker admission',
    100_000,
    4,
    Array.from({ length: 10 }, (_, index) => TRACKER_TIP_HEIGHT - index),
    chain.headers,
    anchorIdHex,
  );
  assertWindowStructure(
    windows.settlement,
    'settlement',
    100_005,
    9,
    Array.from({ length: 10 }, (_, index) => NEWEST_HEIGHT - index),
    chain.headers,
    anchorIdHex,
  );

  const boundaries = requiredRecord(vector.boundaries, 'canonical JVM boundaries');
  requireExact(
    boundaries.deterministicSyntheticHeaders,
    true,
    'canonical JVM synthetic-header boundary',
  );
  requireExact(boundaries.minedHeaderEvidence, false, 'canonical JVM mined-header boundary');
  requireExact(
    boundaries.nodeStatefulAcceptance,
    false,
    'canonical JVM node-acceptance boundary',
  );
  requireExact(boundaries.broadcastPerformed, false, 'canonical JVM broadcast boundary');
}

function buildCanonicalRecord(
  entryInput: Record<string, unknown>,
  anchorIdHex: string,
): Wp06CanonicalJvmHeaderRecord {
  const entry = requiredRecord(entryInput, 'canonical JVM header entry');
  const height = safeInteger(entry.height, 'canonical JVM header height');
  const id = fixedHex(entry.idHex, 32, 'canonical JVM header ID');
  const parentId = fixedHex(entry.parentIdHex, 32, 'canonical JVM header parent ID');
  const extensionRootHex = fixedHex(
    entry.extensionRootHex,
    32,
    'canonical JVM header extension root',
  );
  const rebuilt = buildRawHeader({
    height,
    id,
    parentId,
    extensionRootHex,
    anchorIdHex,
  });
  return deepFreeze({
    raw: rebuilt.raw,
    id,
    parentId,
    height,
    extensionRootHex,
    jvmHeaderJson: rebuilt.jvmHeaderJson,
    jvmHeaderJsonSha256Hex: fixedHex(
      entry.jvmHeaderJsonSha256Hex,
      32,
      'canonical JVM header JSON digest',
    ),
  });
}

function buildWindow(
  windowInput: unknown,
  recordsByHeight: Map<number, Wp06CanonicalJvmHeaderRecord>,
  fileSha256Hex: typeof WP06_CANONICAL_JVM_HEADER_VECTOR_SHA256_HEX,
): Wp06CanonicalJvmHeaderWindow {
  const window = requiredRecord(windowInput, 'canonical JVM header window');
  if (!Array.isArray(window.headerHeightsTipToOldest)) {
    throw new Error('canonical JVM header window heights must be an array');
  }
  const headers = window.headerHeightsTipToOldest.map((height, index) => {
    const record = recordsByHeight.get(safeInteger(height, `canonical JVM window height ${index}`));
    if (!record) throw new Error(`canonical JVM window header ${index} is absent from the chain`);
    return record;
  });
  const anchorContextIndex = safeInteger(
    window.anchorContextIndex,
    'canonical JVM window anchor index',
  );
  const anchorHeader = headers[anchorContextIndex];
  if (!anchorHeader) throw new Error('canonical JVM window anchor is missing');
  const capability = deepFreeze({
    currentHeight: safeInteger(window.currentHeight, 'canonical JVM window current height'),
    anchorContextIndex,
    anchorHeader,
    headers,
    vectorFileSha256Hex: fileSha256Hex,
    provenance: WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE as
      typeof WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
  });
  WINDOWS.add(capability);
  return capability;
}

function buildRawHeader(input: {
  height: number;
  id: string;
  parentId: string;
  extensionRootHex: string;
  anchorIdHex: string;
}): { raw: Record<string, unknown>; jvmHeaderJson: string } {
  const legacyIndex = TRACKER_TIP_HEIGHT - input.height;
  const isContinuation = input.height > TRACKER_TIP_HEIGHT;
  const anchorId = fixedHex(input.anchorIdHex, 32, 'canonical JVM anchor ID');
  const suffix = isContinuation ? `${anchorId}-${input.height}` : String(legacyIndex);
  const prefix = isContinuation ? 'authenticated-v2-vm-continuation-' : 'authenticated-v2-vm-';
  const timestamp = isContinuation
    ? HEADER_BASE_TIMESTAMP + (input.height - TRACKER_TIP_HEIGHT) * HEADER_INTERVAL_MS
    : HEADER_BASE_TIMESTAMP - legacyIndex * HEADER_INTERVAL_MS;
  const stateRoot = `00${fixtureHash(`${prefix}state-root-${suffix}`)}`;
  const adProofsRoot = fixtureHash(`${prefix}ad-proofs-root-${suffix}`);
  const transactionsRoot = fixtureHash(`${prefix}transactions-root-${suffix}`);
  const jvmHeaderJson = JSON.stringify({
    version: HEADER_VERSION,
    parentId: input.parentId,
    adProofsRoot,
    stateRoot: {
      digest: stateRoot,
      treeFlags: 7,
      keyLength: 32,
      valueLength: null,
    },
    transactionsRoot,
    timestamp,
    nBits: HEADER_N_BITS,
    height: input.height,
    extensionRoot: input.extensionRootHex,
    minerPk: HEADER_MINER_PK,
    powOnetimePk: HEADER_W,
    powNonce: HEADER_NONCE,
    powDistance: 0,
    votes: HEADER_VOTES,
  });
  return {
    jvmHeaderJson,
    raw: {
      extensionId: fixtureHash(`${prefix}extension-id-${suffix}`),
      difficulty: HEADER_DIFFICULTY,
      votes: HEADER_VOTES,
      timestamp,
      size: HEADER_SIZE,
      stateRoot,
      height: input.height,
      nBits: HEADER_N_BITS,
      version: HEADER_VERSION,
      id: input.id,
      adProofsRoot,
      transactionsRoot,
      extensionHash: input.extensionRootHex,
      powSolutions: {
        pk: HEADER_MINER_PK,
        w: HEADER_W,
        n: HEADER_NONCE,
        d: 0,
      },
      adProofsId: fixtureHash(`${prefix}ad-proofs-id-${suffix}`),
      transactionsId: fixtureHash(`${prefix}transactions-id-${suffix}`),
      parentId: input.parentId,
    },
  };
}

function assertParameters(parameters: Record<string, unknown>): void {
  const expected: Record<string, unknown> = {
    version: HEADER_VERSION,
    nBits: HEADER_N_BITS,
    difficulty: HEADER_DIFFICULTY,
    size: HEADER_SIZE,
    intervalMillis: HEADER_INTERVAL_MS,
    trackerTipTimestamp: HEADER_BASE_TIMESTAMP,
    minerPkHex: HEADER_MINER_PK,
    powOnetimePkHex: HEADER_W,
    powNonceHex: HEADER_NONCE,
    powDistance: 0,
    votesHex: HEADER_VOTES,
  };
  for (const [name, value] of Object.entries(expected)) {
    requireExact(parameters[name], value, `canonical JVM parameter ${name}`);
  }
}

function assertWindowStructure(
  windowInput: unknown,
  label: string,
  currentHeight: number,
  anchorContextIndex: number,
  expectedHeights: number[],
  entriesInput: unknown[],
  anchorIdHex: string,
): void {
  const window = requiredRecord(windowInput, `canonical JVM ${label} window`);
  requireExact(window.currentHeight, currentHeight, `canonical JVM ${label} current height`);
  requireExact(
    window.anchorContextIndex,
    anchorContextIndex,
    `canonical JVM ${label} anchor index`,
  );
  if (
    !Array.isArray(window.headerHeightsTipToOldest)
    || !Array.isArray(window.headerIdsHexTipToOldest)
    || window.headerHeightsTipToOldest.length !== 10
    || window.headerIdsHexTipToOldest.length !== 10
  ) {
    throw new Error(`canonical JVM ${label} window must contain exactly 10 headers`);
  }
  const entries = entriesInput.map((entry, index) => (
    requiredRecord(entry, `canonical JVM chain header ${index}`)
  ));
  const byHeight = new Map(entries.map(entry => [Number(entry.height), entry]));
  expectedHeights.forEach((height, index) => {
    requireExact(
      window.headerHeightsTipToOldest[index],
      height,
      `canonical JVM ${label} header ${index} height`,
    );
    const entry = byHeight.get(height);
    if (!entry) throw new Error(`canonical JVM ${label} header ${index} is absent`);
    requireExact(
      fixedHex(window.headerIdsHexTipToOldest[index], 32, `${label} header ID`),
      entry.idHex,
      `canonical JVM ${label} header ${index} ID`,
    );
  });
  requireExact(
    window.headerIdsHexTipToOldest[anchorContextIndex],
    anchorIdHex,
    `canonical JVM ${label} anchor ID`,
  );
}

function requiredRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function requireExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return normalized.toLowerCase();
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function fixtureHash(label: string): string {
  return sha256(Buffer.from(label, 'utf8'));
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
