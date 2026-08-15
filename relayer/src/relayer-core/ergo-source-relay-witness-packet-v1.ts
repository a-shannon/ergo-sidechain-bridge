import {
  normalizeErgoAutolykosV2RelayWitnessV1,
  replayErgoAutolykosV2RelayWitnessV1,
  type ErgoAutolykosV2RelayWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  selectHeavierErgoAutolykosV2Branch,
} from '../ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';

export const ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_SCHEMA =
  'e2s.ergo-source-relay-witness-packet.v1' as const;
export const ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-relay-witness-packet:v1' as const;

const MAX_BLOCK_JSON_BYTES = 8 * 1024 * 1024;
const MAX_TRANSACTION_JSON_BYTES = 2 * 1024 * 1024;
const MAX_BOX_JSON_BYTES = 256 * 1024;
export const ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES =
  20 * 1024 * 1024;
export const ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS = 100_000;

export type ErgoSourceRelayBoxReadRoleV1 =
  | 'source_before'
  | 'vault_before'
  | 'source_after'
  | 'vault_after';

export interface ErgoSourceRelayBoxReadWitnessV1 {
  readonly sequence: number;
  readonly role: ErgoSourceRelayBoxReadRoleV1;
  readonly boxIdHex: string;
  readonly box: unknown | null;
}

export interface ErgoSourceRelayCommittedVaultRouteV1 {
  readonly routeProfileId: 'committed-vault-v3';
  readonly sourceNetworkIdHex: string;
  readonly assetProfileId: string;
  readonly sourceLockErgoTreeHex: string;
  readonly vaultErgoTreeHex: string;
}

export interface ErgoSourceRelayWitnessPacketV1 {
  readonly schema: typeof ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_SCHEMA;
  readonly relayIdHex: string;
  readonly generation: number;
  readonly previousPacketDigestHex: string | null;
  readonly consensusWitness: Readonly<ErgoAutolykosV2RelayWitnessV1>;
  readonly commitmentTransactionIdHex: string;
  readonly block: unknown;
  readonly signedCommitmentTransaction: unknown;
  readonly refundableSourceBox: unknown;
  readonly route: Readonly<ErgoSourceRelayCommittedVaultRouteV1>;
  readonly currentStateReads:
    readonly Readonly<ErgoSourceRelayBoxReadWitnessV1>[];
  readonly packetDigestHex: string;
}

export interface BuildErgoSourceRelayWitnessPacketV1Input {
  readonly relayIdHex: string;
  readonly generation: number;
  readonly previousPacketDigestHex: string | null;
  readonly consensusWitness: Readonly<ErgoAutolykosV2RelayWitnessV1>;
  readonly commitmentTransactionIdHex: string;
  readonly block: unknown;
  readonly signedCommitmentTransaction: unknown;
  readonly refundableSourceBox: unknown;
  readonly route: ErgoSourceRelayCommittedVaultRouteV1;
  readonly currentStateReads:
    readonly Readonly<ErgoSourceRelayBoxReadWitnessV1>[];
}

export type StoreErgoSourceRelayWitnessPacketV1Result =
  | 'stored'
  | 'deduplicated'
  | 'conflict'
  | 'unavailable';

export interface ErgoSourceRelayWitnessPacketStoreV1 {
  append(
    packet: Readonly<ErgoSourceRelayWitnessPacketV1>,
  ): StoreErgoSourceRelayWitnessPacketV1Result;
  readLatest(relayIdHex: string): Readonly<{
    status: 'available';
    packet: Readonly<ErgoSourceRelayWitnessPacketV1> | null;
  }> | Readonly<{
    status: 'unavailable';
  }>;
}

export function buildErgoSourceRelayWitnessPacketV1(
  input: BuildErgoSourceRelayWitnessPacketV1Input,
): Readonly<ErgoSourceRelayWitnessPacketV1> {
  const raw = exactDataObject(input, [
    'relayIdHex',
    'generation',
    'previousPacketDigestHex',
    'consensusWitness',
    'commitmentTransactionIdHex',
    'block',
    'signedCommitmentTransaction',
    'refundableSourceBox',
    'route',
    'currentStateReads',
  ], 'Ergo source relay witness packet input');
  const body = normalizePacketBody(raw);
  return normalizeErgoSourceRelayWitnessPacketV1({
    ...body,
    packetDigestHex: sha256CanonicalJson(
      body,
      ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_DIGEST_DOMAIN,
    ),
  });
}

export function normalizeErgoSourceRelayWitnessPacketV1(
  value: unknown,
): Readonly<ErgoSourceRelayWitnessPacketV1> {
  const raw = exactDataObject(value, [
    'schema',
    'relayIdHex',
    'generation',
    'previousPacketDigestHex',
    'consensusWitness',
    'commitmentTransactionIdHex',
    'block',
    'signedCommitmentTransaction',
    'refundableSourceBox',
    'route',
    'currentStateReads',
    'packetDigestHex',
  ], 'Ergo source relay witness packet');
  const body = normalizePacketBody(raw);
  const packetDigestHex = fixedHex(
    raw.packetDigestHex,
    32,
    'Ergo source relay witness packet digest',
  );
  const expectedDigestHex = sha256CanonicalJson(
    body,
    ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_DIGEST_DOMAIN,
  );
  if (packetDigestHex !== expectedDigestHex) {
    throw new Error('Ergo source relay witness packet digest mismatch');
  }
  const packet = deepFreeze({ ...body, packetDigestHex });
  if (
    Buffer.byteLength(canonicalJson(packet), 'utf8')
    > ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES
  ) {
    throw new Error(
      'Ergo source relay witness packet exceeds '
      + `${ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES} bytes`,
    );
  }
  return packet;
}

export function assertErgoSourceRelayWitnessPacketTransitionV1(
  previousValue: Readonly<ErgoSourceRelayWitnessPacketV1>,
  nextValue: Readonly<ErgoSourceRelayWitnessPacketV1>,
): void {
  const previous = normalizeErgoSourceRelayWitnessPacketV1(previousValue);
  const next = normalizeErgoSourceRelayWitnessPacketV1(nextValue);
  if (
    next.relayIdHex !== previous.relayIdHex
    || next.generation !== previous.generation + 1
    || next.previousPacketDigestHex !== previous.packetDigestHex
  ) {
    throw new Error('Ergo source relay packet transition lineage is invalid');
  }
  const immutableBindings: readonly Readonly<{
    label: string;
    previous: unknown;
    next: unknown;
  }>[] = [
    {
      label: 'profile',
      previous: previous.consensusWitness.profile,
      next: next.consensusWitness.profile,
    },
    {
      label: 'checkpoint',
      previous: previous.consensusWitness.checkpoint,
      next: next.consensusWitness.checkpoint,
    },
    {
      label: 'route',
      previous: previous.route,
      next: next.route,
    },
    {
      label: 'commitment transaction ID',
      previous: previous.commitmentTransactionIdHex,
      next: next.commitmentTransactionIdHex,
    },
    {
      label: 'signed commitment transaction',
      previous: previous.signedCommitmentTransaction,
      next: next.signedCommitmentTransaction,
    },
    {
      label: 'refundable source box',
      previous: previous.refundableSourceBox,
      next: next.refundableSourceBox,
    },
  ];
  for (const binding of immutableBindings) {
    if (canonicalJson(binding.previous) !== canonicalJson(binding.next)) {
      throw new Error(
        `Ergo source relay packet ${binding.label} changed across generations`,
      );
    }
  }

  const previousSelection = selectedBranchIdentity(previous.consensusWitness);
  const nextSelection = selectedBranchIdentity(next.consensusWitness);
  if (nextSelection.cumulativeWork < previousSelection.cumulativeWork) {
    throw new Error('Ergo source relay selected work regressed');
  }
  if (
    nextSelection.cumulativeWork === previousSelection.cumulativeWork
    && nextSelection.tipHeaderIdHex !== previousSelection.tipHeaderIdHex
  ) {
    throw new Error(
      'Ergo source relay selected tip changed without strictly greater work',
    );
  }
}

function normalizePacketBody(value: Record<string, unknown>): Omit<
  ErgoSourceRelayWitnessPacketV1,
  'packetDigestHex'
> {
  if (value.schema !== undefined
    && value.schema !== ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_SCHEMA) {
    throw new Error('Ergo source relay witness packet schema is unsupported');
  }
  const relayIdHex = fixedHex(
    value.relayIdHex,
    32,
    'Ergo source relay ID',
  );
  const generation = positiveSafeInteger(
    value.generation,
    'Ergo source relay generation',
    ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS,
  );
  const previousPacketDigestHex = value.previousPacketDigestHex === null
    ? null
    : fixedHex(
      value.previousPacketDigestHex,
      32,
      'previous Ergo source relay packet digest',
    );
  if (
    (generation === 1 && previousPacketDigestHex !== null)
    || (generation > 1 && previousPacketDigestHex === null)
  ) {
    throw new Error('Ergo source relay packet lineage is incomplete');
  }
  const currentStateReads = normalizeCurrentStateReads(
    value.currentStateReads,
  );
  const sourceBoxIdHex = currentStateReads[0]!.boxIdHex;
  const vaultBoxIdHex = currentStateReads[1]!.boxIdHex;
  if (
    relayIdHex !== sourceBoxIdHex
    || currentStateReads[2]!.boxIdHex !== sourceBoxIdHex
    || currentStateReads[3]!.boxIdHex !== vaultBoxIdHex
    || sourceBoxIdHex === vaultBoxIdHex
  ) {
    throw new Error('Ergo source relay box-read identities are inconsistent');
  }
  return {
    schema: ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_SCHEMA,
    relayIdHex,
    generation,
    previousPacketDigestHex,
    consensusWitness:
      normalizeErgoAutolykosV2RelayWitnessV1(value.consensusWitness),
    commitmentTransactionIdHex: fixedHex(
      value.commitmentTransactionIdHex,
      32,
      'commitment transaction ID',
    ),
    block: boundedJsonSnapshot(
      value.block,
      MAX_BLOCK_JSON_BYTES,
      'Ergo source relay block',
    ),
    signedCommitmentTransaction: boundedJsonSnapshot(
      value.signedCommitmentTransaction,
      MAX_TRANSACTION_JSON_BYTES,
      'Ergo source relay signed transaction',
    ),
    refundableSourceBox: boundedJsonSnapshot(
      value.refundableSourceBox,
      MAX_BOX_JSON_BYTES,
      'Ergo source relay refundable box',
    ),
    route: normalizeRoute(value.route),
    currentStateReads,
  };
}

function normalizeCurrentStateReads(
  value: unknown,
): readonly Readonly<ErgoSourceRelayBoxReadWitnessV1>[] {
  const reads = denseArray(value, 4, 'Ergo source relay current-state reads');
  if (reads.length !== 4) {
    throw new Error('Ergo source relay current-state reads must contain four entries');
  }
  const roles: readonly ErgoSourceRelayBoxReadRoleV1[] = [
    'source_before',
    'vault_before',
    'source_after',
    'vault_after',
  ];
  return reads.map((read, index) => {
    const raw = exactDataObject(read, [
      'sequence',
      'role',
      'boxIdHex',
      'box',
    ], `Ergo source relay current-state read ${index}`);
    if (raw.sequence !== index || raw.role !== roles[index]) {
      throw new Error('Ergo source relay current-state reads are out of order');
    }
    return {
      sequence: index,
      role: roles[index]!,
      boxIdHex: fixedHex(
        raw.boxIdHex,
        32,
        `Ergo source relay current-state read ${index} box ID`,
      ),
      box: raw.box === null
        ? null
        : boundedJsonSnapshot(
          raw.box,
          MAX_BOX_JSON_BYTES,
          `Ergo source relay current-state read ${index} box`,
        ),
    };
  });
}

function normalizeRoute(value: unknown): ErgoSourceRelayCommittedVaultRouteV1 {
  const raw = exactDataObject(value, [
    'routeProfileId',
    'sourceNetworkIdHex',
    'assetProfileId',
    'sourceLockErgoTreeHex',
    'vaultErgoTreeHex',
  ], 'Ergo source relay route');
  if (raw.routeProfileId !== 'committed-vault-v3') {
    throw new Error('Ergo source relay route profile is unsupported');
  }
  if (
    typeof raw.assetProfileId !== 'string'
    || raw.assetProfileId.length === 0
    || raw.assetProfileId.length > 128
  ) {
    throw new Error('Ergo source relay asset profile ID is invalid');
  }
  return {
    routeProfileId: 'committed-vault-v3',
    sourceNetworkIdHex: fixedHex(
      raw.sourceNetworkIdHex,
      32,
      'Ergo source relay route network ID',
    ),
    assetProfileId: raw.assetProfileId,
    sourceLockErgoTreeHex: variableHex(
      raw.sourceLockErgoTreeHex,
      32 * 1024,
      'Ergo source relay source-lock ErgoTree',
    ),
    vaultErgoTreeHex: variableHex(
      raw.vaultErgoTreeHex,
      32 * 1024,
      'Ergo source relay vault ErgoTree',
    ),
  };
}

function boundedJsonSnapshot(
  value: unknown,
  maximumBytes: number,
  label: string,
): unknown {
  const snapshot = snapshotJsonData(value, label);
  if (Buffer.byteLength(canonicalJson(snapshot), 'utf8') > maximumBytes) {
    throw new Error(`${label} exceeds ${maximumBytes} bytes`);
  }
  return snapshot;
}

function snapshotJsonData(
  value: unknown,
  label: string,
  state: { nodes: number } = { nodes: 0 },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > 250_000) {
    throw new Error(`${label} exceeds the JSON node bound`);
  }
  if (depth > 64) throw new Error(`${label} exceeds the JSON depth bound`);
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} numbers must be safe integers`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} must contain only JSON data`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || Number(lengthDescriptor.value) < 0
      || Number(lengthDescriptor.value) > 100_000
    ) {
      throw new Error(`${label} array length is invalid`);
    }
    const length = Number(lengthDescriptor.value);
    const allowed = new Set<PropertyKey>(['length']);
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      allowed.add(key);
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || !('value' in descriptor)
        || descriptor.enumerable !== true
      ) {
        throw new Error(`${label}[${index}] must be a dense data property`);
      }
      snapshot.push(snapshotJsonData(
        descriptor.value,
        `${label}[${index}]`,
        state,
        depth + 1,
      ));
    }
    if (ownKeys(descriptors).some(key => !allowed.has(key))) {
      throw new Error(`${label} array must not contain extra properties`);
    }
    return snapshot;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must contain only plain objects`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      throw new Error(`${label} must not contain symbol properties`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    Object.defineProperty(snapshot, key, {
      value: snapshotJsonData(
        descriptor.value,
        `${label}.${key}`,
        state,
        depth + 1,
      ),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot;
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, length: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > length) {
    throw new Error(`${label} must contain at most ${length} items`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(['length']);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowed.add(key);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}[${index}] must be a dense data property`);
    }
    result.push(descriptor.value);
  }
  if (ownKeys(descriptors).some(key => !allowed.has(key))) {
    throw new Error(`${label} must not contain extra properties`);
  }
  return result;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length !== bytes * 2 || !/^[0-9a-f]+$/.test(clean)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of lowercase hex`);
  }
  return clean;
}

function variableHex(
  value: unknown,
  maximumBytes: number,
  label: string,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length === 0
    || clean.length % 2 !== 0
    || clean.length / 2 > maximumBytes
    || !/^[0-9a-f]+$/.test(clean)
  ) {
    throw new Error(`${label} must be nonempty lowercase bounded hex`);
  }
  return clean;
}

function positiveSafeInteger(
  value: unknown,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > maximum
  ) {
    throw new Error(
      `${label} must be a positive safe integer no greater than ${maximum}`,
    );
  }
  return value;
}

function selectedBranchIdentity(
  witness: Readonly<ErgoAutolykosV2RelayWitnessV1>,
): Readonly<{
  cumulativeWork: bigint;
  tipHeaderIdHex: string;
}> {
  const replayed = replayErgoAutolykosV2RelayWitnessV1(witness);
  let selected = replayed.currentBranch;
  for (const candidate of replayed.competingBranches) {
    selected = selectHeavierErgoAutolykosV2Branch(selected, candidate);
  }
  const tip = selected.headers.at(-1);
  if (tip === undefined) {
    throw new Error('Ergo source relay selected branch has no suffix tip');
  }
  return {
    cumulativeWork: selected.cumulativeWork,
    tipHeaderIdHex: tip.headerId.toString('hex'),
  };
}

function ownKeys(value: object): PropertyKey[] {
  return [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
