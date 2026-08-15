import { createHash } from 'node:crypto';

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  ERGO_READ_QUORUM_OBSERVATION_SCHEMA,
  type ErgoReadQuorumFailureCode,
  type ErgoReadQuorumObservation,
} from '../relayer-core/ergo-read-quorum-supervisor.js';
import { snapshotJsonData } from './json-data-snapshot.js';

export const ERGO_READ_QUORUM_ADDRESS_BOX_SNAPSHOT_SCHEMA =
  'e2s.ergo-read-quorum-address-box-snapshot.v1' as const;

const ADDRESS_BOX_PAGE_SIZE = 128;
const MAX_ADDRESS_BOX_COUNT = 8_192;
const MAX_ADDRESS_BOX_CANONICAL_BYTES = 16 * 1024 * 1024;

export interface ErgoReadQuorumClient {
  getCurrentHeight(signal?: AbortSignal): Promise<number>;
  getBlockHeaderHash(height: number, signal?: AbortSignal): Promise<string>;
  getUnspentBoxesByAddressPage?(
    address: string,
    input: Readonly<{
      offset: number;
      limit: number;
      sortDirection: 'asc' | 'desc';
    }>,
    signal?: AbortSignal,
  ): Promise<unknown[]>;
  getStorageRentParameters?(signal?: AbortSignal): Promise<{
    fullHeight: number;
    parameterHeight: number;
    storageFeeFactorNanoErgPerByte: number;
  }>;
}

export interface ErgoReadQuorumSourcePair {
  readonly sourceIdsHex: readonly [string, string];
}

export interface ErgoReadQuorumClock {
  now(): number;
}

export interface ErgoStorageRentParameterObservation {
  readonly expectedTipHeight: number;
  readonly expectedTipHeaderIdHex: string;
  readonly expectedTipObservationDigestHex: string;
  readonly parameterHeight: number;
  readonly storageFeeFactorNanoErgPerByte: number;
  readonly parameterSourceId: string;
}

export interface ErgoReadQuorumAddressBoxSnapshot {
  readonly schema: typeof ERGO_READ_QUORUM_ADDRESS_BOX_SNAPSHOT_SCHEMA;
  readonly sourceIdsHex: readonly [string, string];
  readonly expectedTipHeight: number;
  readonly expectedTipHeaderIdHex: string;
  readonly expectedTipObservationDigestHex: string;
  readonly address: string;
  readonly observedBoxCount: number;
  readonly boxSetDigestHex: string;
  readonly boxes: readonly unknown[];
}

interface ErgoReadQuorumTipBinding {
  readonly height: number;
  readonly headerIdHex: string;
  readonly observationDigestHex: string;
}

export class ErgoReadQuorumAdapterError extends Error {
  public readonly code: ErgoReadQuorumFailureCode;

  public constructor(code: ErgoReadQuorumFailureCode) {
    super(`Ergo read-quorum observation failed: ${code}`);
    this.name = 'ErgoReadQuorumAdapterError';
    this.code = code;
  }
}

interface SourceBinding {
  readonly client: ErgoReadQuorumClient;
  readonly origin: string;
  readonly sourceIdHex: string;
}

interface PairBinding {
  readonly primary: SourceBinding;
  readonly witness: SourceBinding;
  readonly maxProbeDurationMs: number;
}

interface StableTip {
  readonly height: number;
  readonly headerIdHex: string;
}

interface StableAddressBoxSet {
  readonly boxes: readonly unknown[];
  readonly canonicalBoxesDigestHex: string;
}

const PAIR_BINDINGS = new WeakMap<object, PairBinding>();
const OBSERVATION_PAIRS = new WeakMap<object, ErgoReadQuorumSourcePair>();
const QUORUM_OBSERVATIONS = new WeakSet<object>();
const ADDRESS_BOX_SNAPSHOT_BINDINGS = new WeakMap<object, Readonly<{
  pair: ErgoReadQuorumSourcePair;
  observation: ErgoReadQuorumObservation;
}>>();

export function createErgoReadQuorumSources(input: Readonly<{
  primaryClient: ErgoReadQuorumClient;
  primaryNodeUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessClient: ErgoReadQuorumClient;
  witnessNodeUrl: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
  maxProbeDurationMs: number;
}>): ErgoReadQuorumSourcePair {
  assertClient(input.primaryClient);
  assertClient(input.witnessClient);
  if (input.primaryClient === input.witnessClient) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  const primaryOrigin = canonicalCredentialFreeOrigin(input.primaryNodeUrl);
  const witnessOrigin = canonicalCredentialFreeOrigin(input.witnessNodeUrl);
  if (primaryOrigin === witnessOrigin) throw new ErgoReadQuorumAdapterError('not_configured');

  const primaryNodeIdentityDigestHex = normalizeConfiguredHex32(
    input.primaryNodeIdentityDigestHex,
  );
  const witnessNodeIdentityDigestHex = normalizeConfiguredHex32(
    input.witnessNodeIdentityDigestHex,
  );
  if (primaryNodeIdentityDigestHex === witnessNodeIdentityDigestHex) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  const primaryAdministrationIdentityDigestHex = normalizeConfiguredHex32(
    input.primaryAdministrationIdentityDigestHex,
  );
  const witnessAdministrationIdentityDigestHex = normalizeConfiguredHex32(
    input.witnessAdministrationIdentityDigestHex,
  );
  if (primaryAdministrationIdentityDigestHex === witnessAdministrationIdentityDigestHex) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }

  const primary: SourceBinding = Object.freeze({
    client: input.primaryClient,
    origin: primaryOrigin,
    sourceIdHex: deriveSourceId({
      origin: primaryOrigin,
      nodeIdentityDigestHex: primaryNodeIdentityDigestHex,
      administrationIdentityDigestHex: primaryAdministrationIdentityDigestHex,
    }),
  });
  const witness: SourceBinding = Object.freeze({
    client: input.witnessClient,
    origin: witnessOrigin,
    sourceIdHex: deriveSourceId({
      origin: witnessOrigin,
      nodeIdentityDigestHex: witnessNodeIdentityDigestHex,
      administrationIdentityDigestHex: witnessAdministrationIdentityDigestHex,
    }),
  });
  if (primary.sourceIdHex === witness.sourceIdHex) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  if (!Number.isSafeInteger(input.maxProbeDurationMs) || input.maxProbeDurationMs <= 0) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  const sourceIdsHex = [primary.sourceIdHex, witness.sourceIdHex].sort() as [string, string];
  const pair = Object.freeze({
    sourceIdsHex: Object.freeze([sourceIdsHex[0], sourceIdsHex[1]]) as readonly [string, string],
  });
  PAIR_BINDINGS.set(pair, Object.freeze({
    primary,
    witness,
    maxProbeDurationMs: input.maxProbeDurationMs,
  }));
  return pair;
}

export async function observeErgoReadQuorumPair(
  pair: ErgoReadQuorumSourcePair,
  clock: ErgoReadQuorumClock,
): Promise<ErgoReadQuorumObservation> {
  const binding = PAIR_BINDINGS.get(pair);
  if (!binding) throw new ErgoReadQuorumAdapterError('not_configured');
  const startedAtMs = readClock(clock);
  let primary: StableTip;
  let witness: StableTip;
  try {
    [primary, witness] = await withProbeTimeout(
      signal => Promise.all([
        observeStableTip(binding.primary, signal),
        observeStableTip(binding.witness, signal),
      ]),
      binding.maxProbeDurationMs,
    );
  } catch (error) {
    throw classifyErgoReadQuorumAdapterError(error);
  }
  if (
    primary.height !== witness.height
    || primary.headerIdHex !== witness.headerIdHex
  ) {
    throw new ErgoReadQuorumAdapterError('source_disagreement');
  }
  const completedAtMs = readClock(clock);
  const observation = Object.freeze({
    schema: ERGO_READ_QUORUM_OBSERVATION_SCHEMA,
    sourceIdsHex: pair.sourceIdsHex,
    tipHeight: primary.height,
    tipHeaderIdHex: primary.headerIdHex,
    observationDigestHex: deriveObservationDigest({
      sourceIdsHex: pair.sourceIdsHex,
      tipHeight: primary.height,
      tipHeaderIdHex: primary.headerIdHex,
      startedAtMs,
      completedAtMs,
    }),
    startedAtMs,
    completedAtMs,
  });
  QUORUM_OBSERVATIONS.add(observation);
  OBSERVATION_PAIRS.set(observation, pair);
  return observation;
}

export async function observeErgoStorageRentParameters(
  pair: ErgoReadQuorumSourcePair,
  expectedTipObservation: ErgoReadQuorumObservation,
): Promise<ErgoStorageRentParameterObservation> {
  const binding = PAIR_BINDINGS.get(pair);
  if (!binding) throw new ErgoReadQuorumAdapterError('not_configured');
  assertErgoReadQuorumObservationProvenance(pair, expectedTipObservation);
  const expectedTip = normalizeTipBinding(expectedTipObservation);
  let primary: ErgoStorageRentParameterObservation;
  let witness: ErgoStorageRentParameterObservation;
  try {
    [primary, witness] = await withProbeTimeout(
      signal => Promise.all([
        observeStorageRentParameters(binding.primary, expectedTip, signal),
        observeStorageRentParameters(binding.witness, expectedTip, signal),
      ]),
      binding.maxProbeDurationMs,
    );
  } catch (error) {
    throw classifyErgoReadQuorumAdapterError(error);
  }
  if (
    primary.parameterHeight !== witness.parameterHeight
    || primary.storageFeeFactorNanoErgPerByte !== witness.storageFeeFactorNanoErgPerByte
  ) {
    throw new ErgoReadQuorumAdapterError('source_disagreement');
  }
  return Object.freeze({
    expectedTipHeight: expectedTip.height,
    expectedTipHeaderIdHex: expectedTip.headerIdHex,
    expectedTipObservationDigestHex: expectedTip.observationDigestHex,
    parameterHeight: primary.parameterHeight,
    storageFeeFactorNanoErgPerByte: primary.storageFeeFactorNanoErgPerByte,
    parameterSourceId: deriveStorageRentParameterSourceId({
      sourceIdsHex: pair.sourceIdsHex,
      expectedTip,
      parameterHeight: primary.parameterHeight,
      storageFeeFactorNanoErgPerByte: primary.storageFeeFactorNanoErgPerByte,
    }),
  });
}

export async function observeErgoReadQuorumAddressBoxes(
  pair: ErgoReadQuorumSourcePair,
  expectedTipObservation: ErgoReadQuorumObservation,
  address: string,
): Promise<Readonly<ErgoReadQuorumAddressBoxSnapshot>> {
  const binding = PAIR_BINDINGS.get(pair);
  if (!binding) throw new ErgoReadQuorumAdapterError('not_configured');
  assertErgoReadQuorumObservationProvenance(pair, expectedTipObservation);
  const expectedTip = normalizeTipBinding(expectedTipObservation);
  const normalizedAddress = normalizeAddress(address);
  if (
    typeof binding.primary.client.getUnspentBoxesByAddressPage !== 'function'
    || typeof binding.witness.client.getUnspentBoxesByAddressPage !== 'function'
  ) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }

  let primary: StableAddressBoxSet;
  let witness: StableAddressBoxSet;
  try {
    [primary, witness] = await withProbeTimeout(
      signal => Promise.all([
        observeStableAddressBoxSet(
          binding.primary,
          expectedTip,
          normalizedAddress,
          signal,
        ),
        observeStableAddressBoxSet(
          binding.witness,
          expectedTip,
          normalizedAddress,
          signal,
        ),
      ]),
      binding.maxProbeDurationMs,
    );
  } catch (error) {
    throw classifyErgoReadQuorumAdapterError(error);
  }
  if (primary.canonicalBoxesDigestHex !== witness.canonicalBoxesDigestHex) {
    throw new ErgoReadQuorumAdapterError('source_disagreement');
  }

  const boxSetDigestHex = deriveAddressBoxSetDigest({
    sourceIdsHex: pair.sourceIdsHex,
    expectedTip,
    address: normalizedAddress,
    canonicalBoxesDigestHex: primary.canonicalBoxesDigestHex,
  });
  const snapshot = Object.freeze({
    schema: ERGO_READ_QUORUM_ADDRESS_BOX_SNAPSHOT_SCHEMA,
    sourceIdsHex: pair.sourceIdsHex,
    expectedTipHeight: expectedTip.height,
    expectedTipHeaderIdHex: expectedTip.headerIdHex,
    expectedTipObservationDigestHex: expectedTip.observationDigestHex,
    address: normalizedAddress,
    observedBoxCount: primary.boxes.length,
    boxSetDigestHex,
    boxes: primary.boxes,
  });
  ADDRESS_BOX_SNAPSHOT_BINDINGS.set(snapshot, Object.freeze({
    pair,
    observation: expectedTipObservation,
  }));
  return snapshot;
}

export function assertErgoReadQuorumAddressBoxSnapshotProvenance(
  pair: ErgoReadQuorumSourcePair,
  expectedTipObservation: ErgoReadQuorumObservation,
  snapshot: unknown,
): asserts snapshot is Readonly<ErgoReadQuorumAddressBoxSnapshot> {
  const provenance = snapshot && typeof snapshot === 'object'
    ? ADDRESS_BOX_SNAPSHOT_BINDINGS.get(snapshot)
    : undefined;
  if (
    provenance?.pair !== pair
    || provenance.observation !== expectedTipObservation
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  assertErgoReadQuorumObservationProvenance(pair, expectedTipObservation);
  const candidate = snapshot as ErgoReadQuorumAddressBoxSnapshot;
  const expectedTip = normalizeTipBinding(expectedTipObservation);
  if (
    candidate.schema !== ERGO_READ_QUORUM_ADDRESS_BOX_SNAPSHOT_SCHEMA
    || candidate.sourceIdsHex !== pair.sourceIdsHex
    || candidate.expectedTipHeight !== expectedTip.height
    || candidate.expectedTipHeaderIdHex !== expectedTip.headerIdHex
    || candidate.expectedTipObservationDigestHex !== expectedTip.observationDigestHex
    || candidate.observedBoxCount !== candidate.boxes.length
    || !isHex32(candidate.boxSetDigestHex)
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  const canonicalBoxesDigestHex = deriveCanonicalAddressBoxSetDigest(candidate.boxes);
  if (candidate.boxSetDigestHex !== deriveAddressBoxSetDigest({
    sourceIdsHex: pair.sourceIdsHex,
    expectedTip,
    address: normalizeAddress(candidate.address),
    canonicalBoxesDigestHex,
  })) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
}

export function assertErgoReadQuorumObservationProvenance(
  pair: ErgoReadQuorumSourcePair,
  observation: unknown,
): asserts observation is ErgoReadQuorumObservation {
  const binding = PAIR_BINDINGS.get(pair);
  if (
    !binding
    || !observation
    || typeof observation !== 'object'
    || !QUORUM_OBSERVATIONS.has(observation)
    || OBSERVATION_PAIRS.get(observation) !== pair
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  const candidate = observation as ErgoReadQuorumObservation;
  if (
    candidate.schema !== ERGO_READ_QUORUM_OBSERVATION_SCHEMA
    || candidate.sourceIdsHex.length !== 2
    || candidate.sourceIdsHex[0] !== pair.sourceIdsHex[0]
    || candidate.sourceIdsHex[1] !== pair.sourceIdsHex[1]
    || !Number.isSafeInteger(candidate.tipHeight)
    || candidate.tipHeight < 0
    || !isHex32(candidate.tipHeaderIdHex)
    || !isHex32(candidate.observationDigestHex)
    || !Number.isSafeInteger(candidate.startedAtMs)
    || !Number.isSafeInteger(candidate.completedAtMs)
    || candidate.startedAtMs < 0
    || candidate.completedAtMs < candidate.startedAtMs
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  const expectedDigest = deriveObservationDigest({
    sourceIdsHex: pair.sourceIdsHex,
    tipHeight: candidate.tipHeight,
    tipHeaderIdHex: candidate.tipHeaderIdHex,
    startedAtMs: candidate.startedAtMs,
    completedAtMs: candidate.completedAtMs,
  });
  if (candidate.observationDigestHex !== expectedDigest) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
}

export function classifyErgoReadQuorumAdapterError(error: unknown): ErgoReadQuorumAdapterError {
  if (error instanceof ErgoReadQuorumAdapterError) return error;
  return new ErgoReadQuorumAdapterError('unexpected_failure');
}

async function observeStableTip(
  source: SourceBinding,
  signal: AbortSignal,
): Promise<StableTip> {
  let heightBefore: number;
  let headerBefore: string;
  let heightAfter: number;
  let headerAfter: string;
  try {
    heightBefore = normalizeHeight(await source.client.getCurrentHeight(signal));
    headerBefore = normalizeHex32(
      await source.client.getBlockHeaderHash(heightBefore, signal),
    );
    heightAfter = normalizeHeight(await source.client.getCurrentHeight(signal));
    headerAfter = normalizeHex32(
      await source.client.getBlockHeaderHash(heightAfter, signal),
    );
  } catch (error) {
    if (error instanceof ErgoReadQuorumAdapterError) throw error;
    throw new ErgoReadQuorumAdapterError('source_unavailable');
  }
  if (heightBefore !== heightAfter || headerBefore !== headerAfter) {
    throw new ErgoReadQuorumAdapterError('source_unstable');
  }
  return Object.freeze({ height: heightAfter, headerIdHex: headerAfter });
}

async function observeStableAddressBoxSet(
  source: SourceBinding,
  expectedTip: ErgoReadQuorumTipBinding,
  address: string,
  signal: AbortSignal,
): Promise<StableAddressBoxSet> {
  const readPage = source.client.getUnspentBoxesByAddressPage;
  if (typeof readPage !== 'function') {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  let heightBefore: number;
  let headerBefore: string;
  let firstRawBoxes: unknown[];
  let heightBetween: number;
  let headerBetween: string;
  let secondRawBoxes: unknown[];
  let heightAfter: number;
  let headerAfter: string;
  try {
    heightBefore = normalizeHeight(await source.client.getCurrentHeight(signal));
    headerBefore = normalizeHex32(
      await source.client.getBlockHeaderHash(expectedTip.height, signal),
    );
    firstRawBoxes = await readCompleteAddressBoxSet(
      readPage.bind(source.client),
      address,
      signal,
    );
    heightBetween = normalizeHeight(await source.client.getCurrentHeight(signal));
    headerBetween = normalizeHex32(
      await source.client.getBlockHeaderHash(expectedTip.height, signal),
    );
    secondRawBoxes = await readCompleteAddressBoxSet(
      readPage.bind(source.client),
      address,
      signal,
    );
    heightAfter = normalizeHeight(await source.client.getCurrentHeight(signal));
    headerAfter = normalizeHex32(
      await source.client.getBlockHeaderHash(expectedTip.height, signal),
    );
  } catch (error) {
    if (error instanceof ErgoReadQuorumAdapterError) throw error;
    throw new ErgoReadQuorumAdapterError('source_unavailable');
  }
  if (
    heightBefore !== expectedTip.height
    || heightBetween !== expectedTip.height
    || heightAfter !== expectedTip.height
    || headerBefore !== expectedTip.headerIdHex
    || headerBetween !== expectedTip.headerIdHex
    || headerAfter !== expectedTip.headerIdHex
  ) {
    throw new ErgoReadQuorumAdapterError('source_unstable');
  }

  let boxes: readonly unknown[];
  let canonicalBoxesDigestHex: string;
  try {
    boxes = sortAddressBoxes(firstRawBoxes);
    const secondBoxes = sortAddressBoxes(secondRawBoxes);
    canonicalBoxesDigestHex = deriveCanonicalAddressBoxSetDigest(boxes);
    if (
      canonicalBoxesDigestHex
      !== deriveCanonicalAddressBoxSetDigest(secondBoxes)
    ) {
      throw new ErgoReadQuorumAdapterError('source_unstable');
    }
  } catch (error) {
    if (error instanceof ErgoReadQuorumAdapterError) throw error;
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return Object.freeze({ boxes, canonicalBoxesDigestHex });
}

async function readCompleteAddressBoxSet(
  readPage: NonNullable<ErgoReadQuorumClient['getUnspentBoxesByAddressPage']>,
  address: string,
  signal: AbortSignal,
): Promise<unknown[]> {
  const boxes: unknown[] = [];
  let canonicalBytes = 2;
  for (let offset = 0; ; offset += ADDRESS_BOX_PAGE_SIZE) {
    const page = await readPage(address, {
      offset,
      limit: ADDRESS_BOX_PAGE_SIZE,
      sortDirection: 'asc',
    }, signal);
    if (!Array.isArray(page) || page.length > ADDRESS_BOX_PAGE_SIZE) {
      throw new ErgoReadQuorumAdapterError('invalid_response');
    }
    if (boxes.length + page.length > MAX_ADDRESS_BOX_COUNT) {
      throw new ErgoReadQuorumAdapterError('invalid_response');
    }
    const pageSnapshot = snapshotJsonData(
      page,
      `Ergo read-quorum address box page at offset ${offset}`,
    );
    if (!Array.isArray(pageSnapshot)) {
      throw new ErgoReadQuorumAdapterError('invalid_response');
    }
    for (const rawBox of pageSnapshot) {
      const box = freezeJsonData(rawBox);
      canonicalBytes += Buffer.byteLength(canonicalJson(box), 'utf8');
      if (boxes.length > 0) canonicalBytes += 1;
      if (canonicalBytes > MAX_ADDRESS_BOX_CANONICAL_BYTES) {
        throw new ErgoReadQuorumAdapterError('invalid_response');
      }
      boxes.push(box);
    }
    if (page.length < ADDRESS_BOX_PAGE_SIZE) return boxes;
  }
}

function sortAddressBoxes(rawBoxes: readonly unknown[]): readonly unknown[] {
  const boxes = [...rawBoxes];
  boxes.sort((left, right) => addressBoxId(left).localeCompare(addressBoxId(right)));
  const seen = new Set<string>();
  for (const box of boxes) {
    const boxId = addressBoxId(box);
    if (seen.has(boxId)) {
      throw new ErgoReadQuorumAdapterError('invalid_response');
    }
    seen.add(boxId);
  }
  return Object.freeze(boxes);
}

function deriveCanonicalAddressBoxSetDigest(boxes: readonly unknown[]): string {
  return createHash('sha256')
    .update('e2s.ergo-read-quorum-canonical-address-box-set.v1\0', 'ascii')
    .update(canonicalJson(boxes), 'utf8')
    .digest('hex');
}

function addressBoxId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  const boxId = (value as Record<string, unknown>).boxId;
  if (typeof boxId !== 'string') {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  const normalized = boxId.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return normalized;
}

function freezeJsonData(value: unknown): unknown {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJsonData(child);
    Object.freeze(value);
  }
  return value;
}

async function observeStorageRentParameters(
  source: SourceBinding,
  expectedTip: ErgoReadQuorumTipBinding,
  signal: AbortSignal,
): Promise<ErgoStorageRentParameterObservation> {
  if (typeof source.client.getStorageRentParameters !== 'function') {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  let headerBefore: string;
  let observed: Awaited<ReturnType<NonNullable<ErgoReadQuorumClient['getStorageRentParameters']>>>;
  let headerAfter: string;
  try {
    headerBefore = normalizeHex32(
      await source.client.getBlockHeaderHash(expectedTip.height, signal),
    );
    observed = await source.client.getStorageRentParameters(signal);
    headerAfter = normalizeHex32(
      await source.client.getBlockHeaderHash(expectedTip.height, signal),
    );
  } catch (error) {
    if (error instanceof ErgoReadQuorumAdapterError) throw error;
    throw new ErgoReadQuorumAdapterError('source_unavailable');
  }
  const fullHeight = normalizeHeight(observed?.fullHeight);
  const parameterHeight = normalizeHeight(observed?.parameterHeight);
  const storageFeeFactorNanoErgPerByte = normalizePositiveInteger(
    observed?.storageFeeFactorNanoErgPerByte,
  );
  if (
    fullHeight !== expectedTip.height
    || headerBefore !== expectedTip.headerIdHex
    || headerAfter !== expectedTip.headerIdHex
    || parameterHeight > fullHeight
  ) {
    throw new ErgoReadQuorumAdapterError('source_unstable');
  }
  return Object.freeze({
    expectedTipHeight: expectedTip.height,
    expectedTipHeaderIdHex: expectedTip.headerIdHex,
    expectedTipObservationDigestHex: expectedTip.observationDigestHex,
    parameterHeight,
    storageFeeFactorNanoErgPerByte,
    parameterSourceId: source.sourceIdHex,
  });
}

function normalizeTipBinding(
  input: ErgoReadQuorumObservation,
): ErgoReadQuorumTipBinding {
  if (!input || typeof input !== 'object') {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return Object.freeze({
    height: normalizeHeight(input.tipHeight),
    headerIdHex: normalizeHex32(input.tipHeaderIdHex),
    observationDigestHex: normalizeHex32(input.observationDigestHex),
  });
}

function assertClient(value: unknown): asserts value is ErgoReadQuorumClient {
  if (
    !value
    || typeof value !== 'object'
    || typeof (value as ErgoReadQuorumClient).getCurrentHeight !== 'function'
    || typeof (value as ErgoReadQuorumClient).getBlockHeaderHash !== 'function'
  ) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
}

function canonicalCredentialFreeOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new ErgoReadQuorumAdapterError('not_configured');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  return parsed.origin.toLowerCase();
}

function normalizeHeight(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return Number(value);
}

function normalizePositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return Number(value);
}

function normalizeHex32(value: unknown): string {
  if (!isHex32(value)) throw new ErgoReadQuorumAdapterError('invalid_response');
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function normalizeConfiguredHex32(value: unknown): string {
  if (!isHex32(value)) throw new ErgoReadQuorumAdapterError('not_configured');
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function normalizeAddress(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1_024
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ErgoReadQuorumAdapterError('not_configured');
  }
  return value;
}

function isHex32(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value.trim().replace(/^0x/i, ''));
}

function readClock(clock: ErgoReadQuorumClock): number {
  const now = clock?.now?.();
  if (!Number.isSafeInteger(now) || Number(now) < 0) {
    throw new ErgoReadQuorumAdapterError('unexpected_failure');
  }
  return Number(now);
}

async function withProbeTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        controller.abort();
        reject(new ErgoReadQuorumAdapterError('probe_stale'));
      },
      timeoutMs,
    );
    operation(controller.signal).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        controller.abort();
        reject(error);
      },
    );
  });
}

function deriveSourceId(input: Readonly<{
  origin: string;
  nodeIdentityDigestHex: string;
  administrationIdentityDigestHex: string;
}>): string {
  return createHash('sha256')
    .update('e2s.ergo-read-quorum-source.v1\0', 'ascii')
    .update(input.origin, 'utf8')
    .update('\0', 'ascii')
    .update(input.nodeIdentityDigestHex, 'ascii')
    .update('\0', 'ascii')
    .update(input.administrationIdentityDigestHex, 'ascii')
    .digest('hex');
}

function deriveObservationDigest(input: Readonly<{
  sourceIdsHex: readonly [string, string];
  tipHeight: number;
  tipHeaderIdHex: string;
  startedAtMs: number;
  completedAtMs: number;
}>): string {
  return createHash('sha256')
    .update('e2s.ergo-read-quorum-observation.v1\0', 'ascii')
    .update(input.sourceIdsHex[0], 'ascii')
    .update('\0', 'ascii')
    .update(input.sourceIdsHex[1], 'ascii')
    .update('\0', 'ascii')
    .update(String(input.tipHeight), 'ascii')
    .update('\0', 'ascii')
    .update(input.tipHeaderIdHex, 'ascii')
    .update('\0', 'ascii')
    .update(String(input.startedAtMs), 'ascii')
    .update('\0', 'ascii')
    .update(String(input.completedAtMs), 'ascii')
    .digest('hex');
}

function deriveAddressBoxSetDigest(input: Readonly<{
  sourceIdsHex: readonly [string, string];
  expectedTip: ErgoReadQuorumTipBinding;
  address: string;
  canonicalBoxesDigestHex: string;
}>): string {
  return createHash('sha256')
    .update('e2s.ergo-read-quorum-address-box-set.v1\0', 'ascii')
    .update(input.sourceIdsHex[0], 'ascii')
    .update('\0', 'ascii')
    .update(input.sourceIdsHex[1], 'ascii')
    .update('\0', 'ascii')
    .update(String(input.expectedTip.height), 'ascii')
    .update('\0', 'ascii')
    .update(input.expectedTip.headerIdHex, 'ascii')
    .update('\0', 'ascii')
    .update(input.expectedTip.observationDigestHex, 'ascii')
    .update('\0', 'ascii')
    .update(input.address, 'utf8')
    .update('\0', 'ascii')
    .update(input.canonicalBoxesDigestHex, 'ascii')
    .digest('hex');
}

function deriveStorageRentParameterSourceId(input: Readonly<{
  sourceIdsHex: readonly [string, string];
  expectedTip: ErgoReadQuorumTipBinding;
  parameterHeight: number;
  storageFeeFactorNanoErgPerByte: number;
}>): string {
  return createHash('sha256')
    .update('e2s.ergo-storage-rent-parameter-sources.v2\0', 'ascii')
    .update(input.sourceIdsHex[0], 'ascii')
    .update('\0', 'ascii')
    .update(input.sourceIdsHex[1], 'ascii')
    .update('\0', 'ascii')
    .update(String(input.expectedTip.height), 'ascii')
    .update('\0', 'ascii')
    .update(input.expectedTip.headerIdHex, 'ascii')
    .update('\0', 'ascii')
    .update(input.expectedTip.observationDigestHex, 'ascii')
    .update('\0', 'ascii')
    .update(String(input.parameterHeight), 'ascii')
    .update('\0', 'ascii')
    .update(String(input.storageFeeFactorNanoErgPerByte), 'ascii')
    .digest('hex');
}
