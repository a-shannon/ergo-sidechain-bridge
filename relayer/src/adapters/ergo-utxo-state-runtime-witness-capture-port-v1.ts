import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

import {
  assertNoDuplicateJsonKeys,
} from '../ergo-settlement-core/strict-json.js';
import {
  computeErgoHeaderId,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
  type ErgoHeaderIdentityFields,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance,
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
  type ErgoUtxoStateRuntimeWitnessCaptureV1,
} from '../relayer-core/ergo-utxo-state-runtime-witness-capture-v1.js';
import {
  decodeErgoScorexTransactionRuntimeWitnessV1,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from '../ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import { snapshotJsonData } from './json-data-snapshot.js';

const MAX_PROOF_BYTES = 16 * 1024;
const MAX_NODE_RESPONSE_BYTES = 64 * 1024;
const NODE_REQUEST_TIMEOUT_MS = 30_000;
const PORTS = new WeakSet<object>();
const NODE_CAPTURES = new WeakSet<object>();
const CREDENTIAL_QUERY_PARAMETERS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'auth_token',
  'authorization',
  'client_secret',
  'id_token',
  'key',
  'password',
  'refresh_token',
  'secret',
  'token',
]);

export interface ErgoUtxoStateRuntimeWitnessCapturePortV1 {
  readCurrentTipHeaderBytes(): Promise<unknown>;
  readBoxesBinaryProof(boxIdsHex: readonly string[]): Promise<unknown>;
}

export function createErgoUtxoStateRuntimeWitnessCapturePortV1(input: {
  readonly nodeUrl: string;
}): Readonly<ErgoUtxoStateRuntimeWitnessCapturePortV1> {
  const raw = exactDataObject(input, ['nodeUrl'], 'Ergo UTXO proof node port input');
  const endpoint = rootReadOnlyNodeEndpoint(raw.nodeUrl, 'Ergo UTXO proof node URL');
  const client = axios.create({
    baseURL: endpoint,
    headers: {
      'Accept-Encoding': 'identity',
      'Content-Type': 'application/json',
    },
    timeout: NODE_REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: MAX_NODE_RESPONSE_BYTES,
    maxBodyLength: MAX_NODE_RESPONSE_BYTES,
  });
  const port = Object.freeze({
    async readCurrentTipHeaderBytes(): Promise<Buffer> {
      return normalizeErgoNodeHeaderBytes(await readBestHeader(client));
    },
    async readBoxesBinaryProof(boxIdsHex: readonly string[]): Promise<Buffer> {
      const boxIds = exactBoxIdPair(boxIdsHex);
      return proofBytes(await readBoxesBinaryProof(client, boxIds));
    },
  });
  PORTS.add(port);
  return port;
}

export async function captureErgoUtxoStateRuntimeWitnessFromNodeV1(input: {
  readonly port: Readonly<ErgoUtxoStateRuntimeWitnessCapturePortV1>;
  readonly targetHeaderBytes: Uint8Array;
  readonly transactionWitnessBytes: Uint8Array;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
}): Promise<Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1>> {
  const raw = exactDataObject(input, [
    'port',
    'targetHeaderBytes',
    'transactionWitnessBytes',
    'expectedTransactionProfile',
  ], 'Ergo UTXO proof node capture input');
  const port = raw.port;
  assertErgoUtxoStateRuntimeWitnessCapturePortV1Provenance(port);
  const targetHeaderBytes = exactBytes(raw.targetHeaderBytes, 'target header');
  const transactionWitnessBytes = exactBytes(
    raw.transactionWitnessBytes,
    'transaction runtime witness',
  );
  const expectedTransactionProfile = snapshotJsonData(
    raw.expectedTransactionProfile,
    'expected transaction runtime profile',
  ) as ErgoScorexTransactionRuntimeParserProfileV1;
  const transaction = deriveCaptureLookupKeys(
    targetHeaderBytes,
    transactionWitnessBytes,
    expectedTransactionProfile,
  );
  const currentTipBeforeHeaderBytes = exactBytes(
    await port.readCurrentTipHeaderBytes(),
    'current tip before UTXO proof',
  );
  if (!currentTipBeforeHeaderBytes.equals(targetHeaderBytes)) {
    throw new Error('current Ergo tip does not equal the exact target header before UTXO proof');
  }
  const boxesBinaryProofBytes = exactBytes(
    await port.readBoxesBinaryProof(transaction),
    'Ergo boxes binary proof',
  );
  const currentTipAfterHeaderBytes = exactBytes(
    await port.readCurrentTipHeaderBytes(),
    'current tip after UTXO proof',
  );
  const capture = composeErgoUtxoStateRuntimeWitnessCaptureV1({
    targetHeaderBytes,
    transactionWitnessBytes,
    expectedTransactionProfile,
    currentTipBeforeHeaderBytes,
    boxesBinaryProofBytes,
    currentTipAfterHeaderBytes,
  });
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance(capture);
  NODE_CAPTURES.add(capture);
  return capture;
}

export function assertErgoUtxoStateRuntimeWitnessCapturePortV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoUtxoStateRuntimeWitnessCapturePortV1> {
  if (typeof value !== 'object' || value === null || !PORTS.has(value)) {
    throw new Error('Ergo UTXO proof capture port was not created by the static adapter');
  }
}

export function assertErgoUtxoStateRuntimeWitnessNodeCaptureV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1> {
  if (typeof value !== 'object' || value === null || !NODE_CAPTURES.has(value)) {
    throw new Error('Ergo UTXO proof capture lacks static node-adapter provenance');
  }
}

export function normalizeErgoNodeHeaderBytes(value: unknown): Buffer {
  const header = record(snapshotJsonData(value, 'Ergo best header'), 'Ergo best header');
  const claimedHeaderIdHex = fixedHex(
    header.id ?? header.headerId,
    32,
    'Ergo best header ID',
  );
  if (
    header.id !== undefined
    && header.headerId !== undefined
    && fixedHex(header.id, 32, 'Ergo best header id')
      !== fixedHex(header.headerId, 32, 'Ergo best header headerId')
  ) {
    throw new Error('Ergo best header ID aliases disagree');
  }
  const version = boundedInteger(header.version, 1, 4, 'Ergo best header version');
  const pow = record(header.powSolutions, 'Ergo best header PoW solution');
  const identity: ErgoHeaderIdentityFields = {
    version,
    parentId: fixedHexBytes(header.parentId, 32, 'Ergo best header parent ID'),
    adProofsRoot: fixedHexBytes(
      header.adProofsRoot,
      32,
      'Ergo best header AD proofs root',
    ),
    stateRoot: fixedHexBytes(header.stateRoot, 33, 'Ergo best header state root'),
    transactionsRoot: fixedHexBytes(
      header.transactionsRoot,
      32,
      'Ergo best header transactions root',
    ),
    timestamp: BigInt(nonnegativeSafeInteger(
      header.timestamp,
      'Ergo best header timestamp',
    )),
    nBits: unsigned32(header.nBits, 'Ergo best header nBits'),
    height: unsigned32(header.height, 'Ergo best header height'),
    extensionHash: fixedHexBytes(
      header.extensionHash,
      32,
      'Ergo best header extension hash',
    ),
    votes: fixedHexBytes(header.votes, 3, 'Ergo best header votes'),
    unparsedBytes: header.unparsedBytes === undefined || header.unparsedBytes === null
      ? Buffer.alloc(0)
      : variableHexBytes(header.unparsedBytes, 'Ergo best header unparsed bytes'),
    powSolution: {
      publicKey: fixedHexBytes(pow.pk, 33, 'Ergo best header PoW public key'),
      nonce: fixedHexBytes(pow.n, 8, 'Ergo best header PoW nonce'),
      ...(version === 1
        ? {
          oneTimePublicKey: fixedHexBytes(
            pow.w,
            33,
            'Ergo best header PoW one-time public key',
          ),
          distance: nonnegativeBigInteger(
            pow.d,
            'Ergo best header PoW distance',
          ),
        }
        : {}),
    },
  };
  const canonical = serializeErgoHeaderIdentity(identity);
  if (computeErgoHeaderId(identity).toString('hex') !== claimedHeaderIdHex) {
    throw new Error('Ergo best header claimed ID does not match its canonical bytes');
  }
  return canonical;
}

async function readBestHeader(client: AxiosInstance): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NODE_REQUEST_TIMEOUT_MS);
  let response: AxiosResponse<ArrayBuffer>;
  try {
    response = await client.get<ArrayBuffer>(
      '/blocks/lastHeaders/1',
      fixedRequestConfig(controller),
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Ergo UTXO proof header request exceeded its deadline');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const data = boundedNodeJson(response);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Ergo best-header response must contain exactly one header');
  }
  return data[0];
}

async function readBoxesBinaryProof(
  client: AxiosInstance,
  boxIdsHex: readonly [string, string],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NODE_REQUEST_TIMEOUT_MS);
  let response: AxiosResponse<ArrayBuffer>;
  try {
    response = await client.post<ArrayBuffer>(
      '/utxo/getBoxesBinaryProof',
      boxIdsHex,
      fixedRequestConfig(controller),
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Ergo UTXO proof request exceeded its deadline');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return boundedNodeJson(response);
}

function fixedRequestConfig(controller: AbortController): AxiosRequestConfig {
  return {
    timeout: NODE_REQUEST_TIMEOUT_MS,
    signal: controller.signal,
    responseType: 'arraybuffer',
    decompress: false,
    transformResponse: [(value: unknown) => value],
  };
}

function boundedNodeJson(response: AxiosResponse<ArrayBuffer>): unknown {
  const rawBody = rawResponseBody(response.data);
  if (rawBody.length > MAX_NODE_RESPONSE_BYTES) {
    throw new Error('Ergo UTXO proof node response exceeds its byte bound');
  }
  const contentEncoding = response.headers?.['content-encoding'];
  if (
    contentEncoding !== undefined
    && String(contentEncoding).trim().toLowerCase() !== 'identity'
  ) {
    throw new Error('Ergo UTXO proof node response must use identity encoding');
  }
  const status = response.status ?? 200;
  if (status < 200 || status >= 300) {
    throw new Error(`Ergo UTXO proof node request failed with HTTP status ${status}`);
  }
  const rawText = rawBody.toString('utf8');
  if (!Buffer.from(rawText, 'utf8').equals(rawBody)) {
    throw new Error('Ergo UTXO proof node response must use canonical UTF-8');
  }
  return parseNodeJsonPreservingPowDistance(rawText);
}

function parseNodeJsonPreservingPowDistance(source: string): unknown {
  if (source.length === 0 || source.includes('\0')) {
    throw new Error('Ergo UTXO proof node JSON must be nonempty and contain no NUL');
  }
  type ParseWithSource = (
    text: string,
    reviver: (this: unknown, key: string, value: unknown, context: { source?: string }) => unknown,
  ) => unknown;
  try {
    assertNoDuplicateJsonKeys(source);
    return (JSON.parse as ParseWithSource)(source, (key, value, context) => {
      if (key !== 'd' || typeof value !== 'number') return value;
      const lexical = context?.source ?? '';
      if (!/^(?:0|[1-9][0-9]*)$/.test(lexical)) {
        throw new Error('node PoW distance must be a canonical non-negative decimal integer');
      }
      return lexical;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`Ergo UTXO proof node JSON is invalid or loses PoW precision: ${detail}`);
  }
}

function rawResponseBody(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error('Ergo UTXO proof node response body must be raw bytes');
}

function proofBytes(value: unknown): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) {
    throw new Error('Ergo boxes binary proof must be canonical lowercase hexadecimal');
  }
  const proof = Buffer.from(value, 'hex');
  if (proof.length === 0 || proof.length > MAX_PROOF_BYTES) {
    throw new Error('Ergo boxes binary proof length is outside its bound');
  }
  return proof;
}

function deriveCaptureLookupKeys(
  targetHeaderBytes: Buffer,
  transactionWitnessBytes: Buffer,
  expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1,
): readonly [string, string] {
  const target = parseErgoAutolykosV2HeaderIdentity(targetHeaderBytes);
  if (!serializeErgoHeaderIdentity(target).equals(targetHeaderBytes)) {
    throw new Error('target header bytes are not canonical');
  }
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    transactionWitnessBytes,
    expectedTransactionProfile,
  );
  if (
    transaction.blockVersion !== target.version
    || transaction.targetTransactionsRootHex
      !== Buffer.from(target.transactionsRoot).toString('hex')
  ) {
    throw new Error('transaction runtime witness does not match the target header');
  }
  return Object.freeze([
    transaction.vault.boxIdHex,
    transaction.source.boxIdHex,
  ]);
}

function exactBoxIdPair(value: readonly string[]): readonly [string, string] {
  if (!Array.isArray(value)) throw new Error('Ergo proof keys must be an array');
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as
    Record<PropertyKey, PropertyDescriptor>;
  if (descriptors.length?.value !== 2) {
    throw new Error('Ergo proof keys must contain exactly vault then source');
  }
  const allowed = new Set<PropertyKey>(['0', '1', 'length']);
  if (Reflect.ownKeys(value).some(key => !allowed.has(key))) {
    throw new Error('Ergo proof keys contain unsupported properties');
  }
  const pair = [0, 1].map(index => {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`Ergo proof key ${index} must be a data property`);
    }
    return fixedHex(descriptor.value, 32, `Ergo proof key ${index}`);
  }) as [string, string];
  if (pair[0] === pair[1]) throw new Error('Ergo proof keys must be distinct');
  return Object.freeze(pair);
}

function rootReadOnlyNodeEndpoint(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (!new Set(['http:', 'https:']).has(parsed.protocol)) {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (parsed.username || parsed.password || hasCredentialQueryParameter(parsed.searchParams)) {
    throw new Error(`${label} must not include credentials or credential query parameters`);
  }
  const searchable = `${parsed.hostname}/${parsed.pathname}/${parsed.search}`.toLowerCase();
  if (/(?:^|[-_.\/?&=])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.\/?&=]|$)/i.test(searchable)) {
    throw new Error(`${label} must cite a concrete read-only endpoint`);
  }
  if ((parsed.pathname !== '' && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error(`${label} must identify a root origin without path, query, or fragment`);
  }
  return parsed.origin;
}

function hasCredentialQueryParameter(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    const normalized = key.trim().toLowerCase().replace(/[-.]/g, '_');
    if (CREDENTIAL_QUERY_PARAMETERS.has(normalized)) return true;
  }
  return false;
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbolKeys = Object.getOwnPropertySymbols(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors).sort();
  const expectedKeys = [...fields].sort();
  if (
    symbolKeys.length !== 0
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${fields.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  return Buffer.from(value);
}

function fixedHexBytes(value: unknown, bytes: number, label: string): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes}-byte hexadecimal`);
  }
  return normalized.toLowerCase();
}

function variableHexBytes(value: unknown, label: string): Buffer {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error(`${label} must be even-length hexadecimal`);
  }
  return Buffer.from(normalized, 'hex');
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} is outside its supported range`);
  }
  return Number(value);
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function unsigned32(value: unknown, label: string): number {
  return boundedInteger(value, 0, 0xffff_ffff, label);
}

function nonnegativeBigInteger(value: unknown, label: string): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} must be a canonical non-negative integer`);
}
