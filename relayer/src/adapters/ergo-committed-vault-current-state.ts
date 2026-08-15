import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { snapshotJsonData } from './json-data-snapshot.js';

export const ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_SCHEMA =
  'e2s.ergo-committed-vault-current-state.v1' as const;
export const ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_STATUS =
  'point_in_time_non_authorizing_observation' as const;
export const ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-committed-vault-current-state:v1' as const;

const PORTS = new WeakSet<object>();
const OBSERVATIONS = new WeakSet<object>();
let ergoWasmPromise: Promise<any> | undefined;

export interface ErgoCanonicalEip12Asset {
  readonly tokenId: string;
  readonly amount: string;
}

export interface ErgoCanonicalEip12Box {
  readonly boxId: string;
  readonly value: string;
  readonly ergoTree: string;
  readonly assets: readonly Readonly<ErgoCanonicalEip12Asset>[];
  readonly additionalRegisters: Readonly<Record<string, string>>;
  readonly creationHeight: number;
  readonly transactionId: string;
  readonly index: number;
}

export interface ErgoCommittedVaultBoxBackend {
  getBoxByIdOrNull(boxIdHex: string): Promise<unknown | null>;
}

export interface ErgoCommittedVaultCurrentStatePortV1 {
  readonly sourceNetworkIdHex: string;
  readonly readBoxByIdOrNull: (boxIdHex: string) => Promise<unknown | null>;
}

export interface ErgoCommittedVaultCurrentStateObservationV1 {
  readonly schema: typeof ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_SCHEMA;
  readonly status: typeof ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_STATUS;
  readonly sourceNetworkIdHex: string;
  readonly sourceBoxIdHex: string;
  readonly vaultBoxIdHex: string;
  readonly currentVaultBox: Readonly<ErgoCanonicalEip12Box>;
  readonly checks: Readonly<{
    sourceAbsentBeforeVaultRead: true;
    sourceAbsentAfterVaultRead: true;
    vaultPresentBeforeSourceRecheck: true;
    vaultPresentAfterSourceRecheck: true;
    vaultCanonicalBytesStableAcrossReads: true;
  }>;
  readonly authority: Readonly<{
    sourceRpcCanonicalConsensusEstablished: false;
    independentSourceControlEstablished: false;
    historicalOrderingEstablished: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
  }>;
  readonly observationDigestHex: string;
}

export function createErgoCommittedVaultCurrentStatePortV1(input: {
  readonly sourceNetworkIdHex: string;
  readonly backend: ErgoCommittedVaultBoxBackend;
}): Readonly<ErgoCommittedVaultCurrentStatePortV1> {
  const snapshot = exactDataObject(input, [
    'sourceNetworkIdHex',
    'backend',
  ], 'Ergo committed-vault current-state port input');
  const sourceNetworkIdHex = fixedHex(
    snapshot.sourceNetworkIdHex,
    32,
    'Ergo source network ID',
  );
  const backend = snapshot.backend;
  if (typeof backend !== 'object' || backend === null) {
    throw new Error('Ergo current-state backend must be an object');
  }
  const readBox = dataMethod(
    backend,
    'getBoxByIdOrNull',
    'Ergo current-state backend',
  );
  const port = Object.freeze({
    sourceNetworkIdHex,
    readBoxByIdOrNull: (boxIdHex: string) => Promise.resolve(
      Reflect.apply(readBox, backend, [
        fixedHex(boxIdHex, 32, 'Ergo current-state box ID'),
      ]),
    ),
  });
  PORTS.add(port);
  return port;
}

export async function observeErgoCommittedVaultCurrentStateV1(input: {
  readonly port: Readonly<ErgoCommittedVaultCurrentStatePortV1>;
  readonly sourceBoxIdHex: string;
  readonly vaultBoxIdHex: string;
}): Promise<Readonly<ErgoCommittedVaultCurrentStateObservationV1>> {
  const snapshot = exactDataObject(input, [
    'port',
    'sourceBoxIdHex',
    'vaultBoxIdHex',
  ], 'Ergo committed-vault current-state observation input');
  const port = snapshot.port;
  assertErgoCommittedVaultCurrentStatePortV1Provenance(port);
  const sourceBoxIdHex = fixedHex(
    snapshot.sourceBoxIdHex,
    32,
    'Ergo refundable source box ID',
  );
  const vaultBoxIdHex = fixedHex(
    snapshot.vaultBoxIdHex,
    32,
    'Ergo committed vault box ID',
  );

  const sourceBefore = await readCanonicalBox(
    port,
    sourceBoxIdHex,
    'refundable source before vault read',
  );
  const vaultBefore = await readCanonicalBox(
    port,
    vaultBoxIdHex,
    'committed vault before source recheck',
  );
  const sourceAfter = await readCanonicalBox(
    port,
    sourceBoxIdHex,
    'refundable source after vault read',
  );
  const vaultAfter = await readCanonicalBox(
    port,
    vaultBoxIdHex,
    'committed vault after source recheck',
  );
  if (sourceBefore !== null || sourceAfter !== null) {
    throw new Error('refundable source is present during the fresh transition observation');
  }
  if (vaultBefore === null || vaultAfter === null) {
    throw new Error('committed vault is absent during the fresh transition observation');
  }
  const beforeJson = canonicalJson(vaultBefore);
  if (beforeJson !== canonicalJson(vaultAfter)) {
    throw new Error('committed vault changed during the fresh transition observation');
  }
  if (vaultBefore.boxId !== vaultBoxIdHex) {
    throw new Error('fresh committed vault response uses another box ID');
  }

  const body = {
    schema: ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_SCHEMA,
    status: ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_STATUS,
    sourceNetworkIdHex: port.sourceNetworkIdHex,
    sourceBoxIdHex,
    vaultBoxIdHex,
    currentVaultBox: vaultBefore,
    checks: {
      sourceAbsentBeforeVaultRead: true as const,
      sourceAbsentAfterVaultRead: true as const,
      vaultPresentBeforeSourceRecheck: true as const,
      vaultPresentAfterSourceRecheck: true as const,
      vaultCanonicalBytesStableAcrossReads: true as const,
    },
    authority: {
      sourceRpcCanonicalConsensusEstablished: false as const,
      independentSourceControlEstablished: false as const,
      historicalOrderingEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
    },
  };
  const observation = deepFreeze({
    ...body,
    observationDigestHex: sha256CanonicalJson(
      body,
      ERGO_COMMITTED_VAULT_CURRENT_STATE_V1_DIGEST_DOMAIN,
    ),
  });
  OBSERVATIONS.add(observation);
  return observation;
}

export function assertErgoCommittedVaultCurrentStatePortV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoCommittedVaultCurrentStatePortV1> {
  if (typeof value !== 'object' || value === null || !PORTS.has(value)) {
    throw new Error('Ergo current-state port was not created by the static adapter');
  }
}

export function assertErgoCommittedVaultCurrentStateObservationV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoCommittedVaultCurrentStateObservationV1> {
  if (typeof value !== 'object' || value === null || !OBSERVATIONS.has(value)) {
    throw new Error('Ergo current-state observation was not produced by the static adapter');
  }
}

export async function normalizeErgoEip12BoxSnapshot(
  value: unknown,
  label: string,
): Promise<Readonly<ErgoCanonicalEip12Box>> {
  const snapshot = snapshotJsonData(value, label);
  const claimedBoxIdHex = fixedHex(
    record(snapshot, label).boxId,
    32,
    `${label} box ID`,
  );
  const wasm = await getErgoWasm();
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(snapshot));
    const canonical = normalizeCanonicalBox(parsed.to_js_eip12(), label);
    if (canonical.boxId !== claimedBoxIdHex) {
      throw new Error(`${label} box ID does not match its serialized contents`);
    }
    return deepFreeze(canonical);
  } catch (error) {
    throw new Error(
      `${label} is not a valid EIP-12 box: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    parsed?.free?.();
  }
}

async function readCanonicalBox(
  port: Readonly<ErgoCommittedVaultCurrentStatePortV1>,
  boxIdHex: string,
  label: string,
): Promise<Readonly<ErgoCanonicalEip12Box> | null> {
  const raw = await port.readBoxByIdOrNull(boxIdHex);
  if (raw === null) return null;
  if (raw === undefined) {
    throw new Error(`${label} returned undefined instead of a box or null`);
  }
  return normalizeErgoEip12BoxSnapshot(raw, label);
}

async function getErgoWasm(): Promise<any> {
  if (!ergoWasmPromise) {
    ergoWasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return ergoWasmPromise;
}

function normalizeCanonicalBox(
  value: unknown,
  label: string,
): ErgoCanonicalEip12Box {
  const box = record(value, `${label} canonical box`);
  const rawAssets = array(box.assets, `${label} assets`);
  const assets = rawAssets.map((value, index) => {
    const asset = record(value, `${label} asset ${index}`);
    return {
      tokenId: fixedHex(asset.tokenId, 32, `${label} asset ${index} token ID`),
      amount: positiveCanonicalInteger(
        asset.amount,
        `${label} asset ${index} amount`,
      ),
    };
  });
  const rawRegisters = record(box.additionalRegisters, `${label} registers`);
  const additionalRegisters: Record<string, string> = {};
  for (const key of Object.keys(rawRegisters).sort()) {
    if (!/^R[4-9]$/.test(key)) {
      throw new Error(`${label} register ${key} is unsupported`);
    }
    additionalRegisters[key] = variableHex(
      rawRegisters[key],
      `${label} register ${key}`,
    );
  }
  return {
    boxId: fixedHex(box.boxId, 32, `${label} box ID`),
    value: positiveCanonicalInteger(box.value, `${label} value`),
    ergoTree: variableHex(box.ergoTree, `${label} ErgoTree`),
    assets,
    additionalRegisters,
    creationHeight: nonnegativeSafeInteger(
      box.creationHeight,
      `${label} creation height`,
    ),
    transactionId: fixedHex(
      box.transactionId,
      32,
      `${label} transaction ID`,
    ),
    index: nonnegativeSafeInteger(box.index, `${label} output index`),
  };
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function positiveCanonicalInteger(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive integer string`);
  }
  if (BigInt(value) > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit a positive signed 64-bit integer`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function dataMethod(
  value: object,
  name: string,
  label: string,
): (...args: unknown[]) => unknown {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor !== undefined) {
      if (!('value' in descriptor) || typeof descriptor.value !== 'function') {
        throw new Error(`${label}.${name} must be a data method`);
      }
      return descriptor.value as (...args: unknown[]) => unknown;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error(`${label}.${name} is missing`);
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
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  return clean.toLowerCase();
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
