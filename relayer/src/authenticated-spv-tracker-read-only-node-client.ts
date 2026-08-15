import axios, { type AxiosInstance } from 'axios';

import {
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES,
  type AuthenticatedSpvTrackerChainSource,
} from './authenticated-spv-tracker-reconstruction.js';
import { parseNodeJsonPreservingPowDistance } from './ergo-node-json.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';

export const AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE = 16;
export const AUTHENTICATED_TRACKER_MAX_LINEAGE_BYTES = 64 * 1024 * 1024;
export const AUTHENTICATED_TRACKER_INDEX_PAGINATION_DEADLINE_MS = 120_000;
export const AUTHENTICATED_TRACKER_RECONSTRUCTION_MAX_RESPONSE_BYTES = 128 * 1024 * 1024;
export const AUTHENTICATED_TRACKER_RECONSTRUCTION_MAX_REQUESTS =
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES * 12 + 16;
export const AUTHENTICATED_TRACKER_RECONSTRUCTION_DEADLINE_MS = 120_000;
const AUTHENTICATED_TRACKER_NODE_REQUEST_TIMEOUT_MS = 30_000;
const AUTHENTICATED_TRACKER_NODE_MAX_ADDRESS_PAGE_SIZE = 500;
const AUTHENTICATED_TRACKER_NODE_MAX_ERGO_TREE_BYTES = 16 * 1024;
const AUTHENTICATED_TRACKER_ALLOWED_NODE_NETWORKS = new Set([
  'local',
  'development',
  'devnet',
  'testnet',
]);
const AUTHENTICATED_TRACKER_NODE_MAX_INDEX_PAGES = Math.ceil(
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES / AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE,
);

export interface AuthenticatedSpvTrackerNodeSource extends AuthenticatedSpvTrackerChainSource {
  getInfo(): Promise<unknown>;
  getBlockByHeaderId?(headerId: string): Promise<unknown | null>;
  getBoxBinaryByIdOrNull?(boxId: string): Promise<unknown | null>;
}

export interface AuthenticatedSpvTrackerReadOnlyNodeClientOptions {
  now?: () => number;
  paginationDeadlineMs?: number;
  maxLineageBytes?: number;
  reconstructionDeadlineMs?: number;
  maxReconstructionBytes?: number;
  maxReconstructionRequests?: number;
}

interface ReconstructionBudget {
  readonly deadline: number;
  remainingBytes: number;
  remainingRequests: number;
}

interface RawJsonRequestOptions {
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  acceptNotFound?: boolean;
}

export class AuthenticatedSpvTrackerReadOnlyNodeClient
implements AuthenticatedSpvTrackerNodeSource {
  readonly observationSourceId: string;
  protected readonly client: AxiosInstance;
  protected readonly now: () => number;
  private readonly paginationDeadlineMs: number;
  private readonly maxLineageBytes: number;
  private readonly reconstructionDeadlineMs: number;
  private readonly maxReconstructionBytes: number;
  private readonly maxReconstructionRequests: number;
  private reconstructionBudget: ReconstructionBudget | null = null;
  private readonly transactionCache = new Map<string, Promise<unknown | null>>();
  private readonly headerCache = new Map<string, Promise<unknown | null>>();
  private readonly blockCache = new Map<string, Promise<unknown | null>>();

  constructor(
    nodeUrl: string,
    options: AuthenticatedSpvTrackerReadOnlyNodeClientOptions = {},
  ) {
    const endpoint = normalizeRootReadOnlyNodeEndpoint(nodeUrl, 'Ergo node URL');
    this.observationSourceId = endpoint;
    this.now = options.now ?? Date.now;
    this.paginationDeadlineMs = positiveSafeInteger(
      options.paginationDeadlineMs ?? AUTHENTICATED_TRACKER_INDEX_PAGINATION_DEADLINE_MS,
      'indexed token pagination deadline',
    );
    this.maxLineageBytes = positiveSafeInteger(
      options.maxLineageBytes ?? AUTHENTICATED_TRACKER_MAX_LINEAGE_BYTES,
      'indexed token lineage byte bound',
    );
    this.reconstructionDeadlineMs = positiveSafeInteger(
      options.reconstructionDeadlineMs ?? AUTHENTICATED_TRACKER_RECONSTRUCTION_DEADLINE_MS,
      'tracker reconstruction deadline',
    );
    this.maxReconstructionBytes = positiveSafeInteger(
      options.maxReconstructionBytes ?? AUTHENTICATED_TRACKER_RECONSTRUCTION_MAX_RESPONSE_BYTES,
      'tracker reconstruction response byte bound',
    );
    this.maxReconstructionRequests = positiveSafeInteger(
      options.maxReconstructionRequests ?? AUTHENTICATED_TRACKER_RECONSTRUCTION_MAX_REQUESTS,
      'tracker reconstruction request bound',
    );
    this.client = axios.create({
      baseURL: endpoint,
      headers: {
        'Accept-Encoding': 'identity',
        'Content-Type': 'application/json',
      },
      timeout: AUTHENTICATED_TRACKER_NODE_REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      proxy: false,
      maxContentLength: AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES,
    });
  }

  async getInfo(): Promise<unknown> {
    return (await this.getRawJson('/info')).data;
  }

  async getAddressForErgoTree(ergoTreeValue: string): Promise<string> {
    const ergoTreeHex = canonicalVariableHex(
      ergoTreeValue,
      AUTHENTICATED_TRACKER_NODE_MAX_ERGO_TREE_BYTES,
      'ErgoTree',
    );
    const { data } = await this.getRawJson(
      `/utils/ergoTreeToAddress/${ergoTreeHex}`,
    );
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('ErgoTree-address response must be an object');
    }
    return canonicalAddress(
      (data as Record<string, unknown>).address,
      'ErgoTree-address response',
    );
  }

  async getUnspentBoxesByAddressPage(
    addressValue: string,
    page: Readonly<{ offset: number; limit: number }>,
  ): Promise<unknown[]> {
    const address = canonicalAddress(addressValue, 'Ergo address');
    const offset = nonnegativeSafeInteger(page.offset, 'unspent-box page offset');
    const limit = positiveSafeInteger(page.limit, 'unspent-box page limit');
    if (limit > AUTHENTICATED_TRACKER_NODE_MAX_ADDRESS_PAGE_SIZE) {
      throw new Error(
        `unspent-box page limit must not exceed `
        + `${AUTHENTICATED_TRACKER_NODE_MAX_ADDRESS_PAGE_SIZE}`,
      );
    }
    const { data } = await this.getRawJson(
      `/blockchain/box/unspent/byAddress/${encodeURIComponent(address)}`,
      {
        params: {
          offset,
          limit,
          sortDirection: 'asc',
          includeUnconfirmed: false,
          excludeMempoolSpent: true,
        },
      },
    );
    if (!Array.isArray(data)) {
      throw new Error('unspent-box page response must be an array');
    }
    if (data.length > limit) {
      throw new Error('unspent-box page response exceeds the requested limit');
    }
    return data;
  }

  async getIndexedHeight(): Promise<unknown> {
    return (await this.getRawJson('/blockchain/indexedHeight')).data;
  }

  async getBestHeader(): Promise<unknown> {
    const { data } = await this.getRawJson('/blocks/lastHeaders/1');
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error('best-header response must contain exactly one header');
    }
    return data[0];
  }

  async getBlockHeaderIdsAtHeight(heightValue: number): Promise<string[]> {
    const height = nonnegativeSafeInteger(heightValue, 'header height');
    const { data } = await this.getRawJson(`/blocks/at/${height}`);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('header-at-height response must contain at least one header id');
    }
    const ids = data.map((entry, index) => fixedHex(entry, 32, `header id ${index}`));
    if (new Set(ids).size !== ids.length) {
      throw new Error('header-at-height response must not contain duplicate ids');
    }
    return ids;
  }

  async getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]> {
    const normalizedTokenId = fixedHex(tokenId, 32, 'tracker NFT id');
    const boxes: unknown[] = [];
    let expectedTotal: number | null = null;
    let offset = 0;
    let accumulatedBytes = 0;
    let pageCount = 0;
    const deadline = this.now() + this.paginationDeadlineMs;
    for (;;) {
      if (pageCount >= AUTHENTICATED_TRACKER_NODE_MAX_INDEX_PAGES) {
        throw new Error('indexed token pagination exceeds the bounded page count');
      }
      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) {
        throw new Error('indexed token pagination exceeded its aggregate deadline');
      }
      const { data, rawBytes: pageBytes } = await this.getRawJson(
        `/blockchain/box/byTokenId/${normalizedTokenId}`,
        {
          params: {
            offset,
            limit: AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE,
          },
          timeout: Math.min(AUTHENTICATED_TRACKER_NODE_REQUEST_TIMEOUT_MS, remainingMs),
        },
      );
      pageCount += 1;
      if (this.now() > deadline) {
        throw new Error('indexed token pagination exceeded its aggregate deadline');
      }
      if (pageBytes > this.maxLineageBytes - accumulatedBytes) {
        throw new Error(
          `indexed token lineage exceeds the ${this.maxLineageBytes}-byte bound`,
        );
      }
      accumulatedBytes += pageBytes;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('indexed token response must be an object');
      }
      if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(['items', 'total'])) {
        throw new Error('indexed token response fields do not match the canonical schema');
      }
      if (!Array.isArray(data.items)) {
        throw new Error('indexed token response must contain an items array');
      }
      const total = nonnegativeSafeInteger(data.total, 'indexed token response total');
      if (total > AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES) {
        throw new Error(
          `indexed token response total ${total} exceeds the `
          + `${AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES}-box bound`,
        );
      }
      if (expectedTotal === null) expectedTotal = total;
      if (expectedTotal !== total) {
        throw new Error(`indexed token response total changed from ${expectedTotal} to ${total}`);
      }
      const expectedPageItems = Math.min(
        AUTHENTICATED_TRACKER_NODE_INDEX_PAGE_SIZE,
        total - boxes.length,
      );
      if (data.items.length !== expectedPageItems) {
        throw new Error(
          `indexed token page at offset ${offset} must contain exactly `
          + `${expectedPageItems} items`,
        );
      }
      boxes.push(...data.items);
      if (boxes.length > total) {
        throw new Error(`indexed token response returned more than total ${total}`);
      }
      if (boxes.length === total) return boxes;
      offset += data.items.length;
    }
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    const normalized = fixedHex(txId, 32, 'transaction id');
    return this.cachedLookup(
      this.transactionCache,
      normalized,
      () => this.getOrNull(`/blockchain/transaction/byId/${normalized}`),
    );
  }

  async getBlockHeaderById(headerId: string): Promise<unknown | null> {
    const normalized = fixedHex(headerId, 32, 'header id');
    return this.cachedLookup(
      this.headerCache,
      normalized,
      () => this.getOrNull(`/blocks/${normalized}/header`),
    );
  }

  async getBlockByHeaderId(headerId: string): Promise<unknown | null> {
    const normalized = fixedHex(headerId, 32, 'header id');
    return this.cachedLookup(
      this.blockCache,
      normalized,
      () => this.getOrNull(`/blocks/${normalized}`),
    );
  }

  async getBoxByIdOrNull(boxId: string): Promise<unknown | null> {
    return this.getOrNull(`/utxo/byId/${fixedHex(boxId, 32, 'box id')}`);
  }

  async getBoxBinaryByIdOrNull(boxId: string): Promise<unknown | null> {
    return this.getOrNull(`/utxo/byIdBinary/${fixedHex(boxId, 32, 'box id')}`);
  }

  private async getOrNull(path: string): Promise<unknown | null> {
    return (await this.getRawJson(path, { acceptNotFound: true })).data;
  }

  beginAuthenticatedTrackerReconstruction(): void {
    if (this.reconstructionBudget !== null) {
      throw new Error('authenticated tracker reconstruction budget is already active');
    }
    const startedAt = this.now();
    if (!Number.isSafeInteger(startedAt)) {
      throw new Error('tracker reconstruction clock must return a safe integer');
    }
    const deadline = startedAt + this.reconstructionDeadlineMs;
    if (!Number.isSafeInteger(deadline)) {
      throw new Error('tracker reconstruction deadline exceeds the safe integer range');
    }
    this.reconstructionBudget = {
      deadline,
      remainingBytes: this.maxReconstructionBytes,
      remainingRequests: this.maxReconstructionRequests,
    };
    this.transactionCache.clear();
    this.headerCache.clear();
    this.blockCache.clear();
  }

  endAuthenticatedTrackerReconstruction(): void {
    this.reconstructionBudget = null;
    this.transactionCache.clear();
    this.headerCache.clear();
    this.blockCache.clear();
  }

  private async getRawJson(
    path: string,
    options: RawJsonRequestOptions = {},
  ): Promise<{ data: any; rawBytes: number }> {
    const requestedTimeout = options.timeout === undefined
      ? AUTHENTICATED_TRACKER_NODE_REQUEST_TIMEOUT_MS
      : positiveSafeInteger(options.timeout, 'Ergo node request timeout');
    const timeout = this.consumeReconstructionRequest(requestedTimeout);
    const { acceptNotFound = false, ...requestOptions } = options;
    const controller = new AbortController();
    const wallClockTimer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await this.client.get<ArrayBuffer>(path, {
        ...requestOptions,
        timeout,
        signal: controller.signal,
        responseType: 'arraybuffer',
        decompress: false,
        transformResponse: [(value: unknown) => value],
        ...(acceptNotFound
          ? { validateStatus: status => (status >= 200 && status < 300) || status === 404 }
          : {}),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(this.reconstructionBudget === null
          ? 'Ergo node request exceeded its wall-clock deadline'
          : 'authenticated tracker reconstruction exceeded its wall-clock request or aggregate deadline');
      }
      throw error;
    } finally {
      clearTimeout(wallClockTimer);
    }
    const rawBody = rawResponseBody(response.data);
    const rawBytes = rawBody.length;
    if (rawBytes > AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES) {
      throw new Error('Ergo node response exceeds the per-response byte bound');
    }
    this.consumeReconstructionBytes(rawBytes);
    const contentEncoding = response.headers?.['content-encoding'];
    if (
      contentEncoding !== undefined
      && String(contentEncoding).trim().toLowerCase() !== 'identity'
    ) {
      throw new Error('Ergo node response must use identity content encoding');
    }
    const status = response.status ?? 200;
    if (status === 404 && acceptNotFound) return { data: null, rawBytes };
    if (status < 200 || status >= 300) {
      throw new Error(`Ergo node request failed with HTTP status ${status}`);
    }
    const rawText = rawBody.toString('utf8');
    if (!Buffer.from(rawText, 'utf8').equals(rawBody)) {
      throw new Error('Ergo node response body must use canonical UTF-8');
    }
    const data = parseNodeJsonPreservingPowDistance(rawText);
    return { data, rawBytes };
  }

  protected consumeReconstructionRequest(requestedTimeout: number): number {
    const budget = this.reconstructionBudget;
    if (budget === null) return requestedTimeout;
    const remainingMs = budget.deadline - this.now();
    if (remainingMs <= 0) {
      throw new Error('authenticated tracker reconstruction exceeded its aggregate deadline');
    }
    if (budget.remainingRequests < 1) {
      throw new Error('authenticated tracker reconstruction exceeded its aggregate request bound');
    }
    budget.remainingRequests -= 1;
    return Math.min(requestedTimeout, remainingMs);
  }

  protected consumeReconstructionBytes(rawBytes: number): void {
    const budget = this.reconstructionBudget;
    if (budget === null) return;
    if (this.now() > budget.deadline) {
      throw new Error('authenticated tracker reconstruction exceeded its aggregate deadline');
    }
    if (rawBytes > budget.remainingBytes) {
      throw new Error(
        `authenticated tracker reconstruction exceeds the ${this.maxReconstructionBytes}-byte bound`,
      );
    }
    budget.remainingBytes -= rawBytes;
  }

  private cachedLookup(
    cache: Map<string, Promise<unknown | null>>,
    key: string,
    load: () => Promise<unknown | null>,
  ): Promise<unknown | null> {
    if (this.reconstructionBudget === null) return load();
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = load();
    cache.set(key, pending);
    return pending;
  }
}

export function createBoundedAuthenticatedSpvTrackerReadOnlySource(
  nodeUrl: string,
): AuthenticatedSpvTrackerNodeSource {
  return new AuthenticatedSpvTrackerReadOnlyNodeClient(nodeUrl);
}

export function normalizeRootReadOnlyNodeEndpoint(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const errors = validateReadOnlyNodeUrl(value, label);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const parsed = new URL(value);
  if ((parsed.pathname !== '' && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error(`${label} must identify a root origin without path, query, or fragment`);
  }
  return parsed.origin;
}

export async function readMatchingAuthenticatedSpvTrackerNodeNetwork(
  primarySource: AuthenticatedSpvTrackerNodeSource,
  witnessSource: AuthenticatedSpvTrackerNodeSource,
  expectedNetworkValue: unknown,
): Promise<string> {
  const expectedNetwork = normalizeAuthenticatedSpvTrackerNodeNetwork(
    expectedNetworkValue,
    'expected Ergo node',
  );
  const [primaryNetwork, witnessNetwork] = await Promise.all([
    readAuthenticatedSpvTrackerNodeNetwork(primarySource, 'primary'),
    readAuthenticatedSpvTrackerNodeNetwork(witnessSource, 'witness'),
  ]);
  if (primaryNetwork !== witnessNetwork) {
    throw new Error('primary and witness Ergo nodes must report the same non-mainnet network');
  }
  if (primaryNetwork !== expectedNetwork) {
    throw new Error(
      `expected Ergo node network ${expectedNetwork} does not match the observed network`,
    );
  }
  return primaryNetwork;
}

export function normalizeAuthenticatedSpvTrackerNodeNetwork(
  value: unknown,
  label: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} network must be a non-empty string`);
  }
  const network = value.trim().toLowerCase();
  if (!AUTHENTICATED_TRACKER_ALLOWED_NODE_NETWORKS.has(network)) {
    throw new Error(`${label} network must be explicitly non-mainnet`);
  }
  return network;
}

async function readAuthenticatedSpvTrackerNodeNetwork(
  source: AuthenticatedSpvTrackerNodeSource,
  label: string,
): Promise<string> {
  const info = await source.getInfo();
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    throw new Error(`${label} Ergo node info must be an object`);
  }
  const record = info as Record<string, unknown>;
  return normalizeAuthenticatedSpvTrackerNodeNetwork(
    record.network ?? record.networkType,
    `${label} Ergo node`,
  );
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return value;
}

function canonicalVariableHex(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || value.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function canonicalAddress(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1_024
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} must contain one canonical address`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function rawResponseBody(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
  }
  // Test doubles may return text even though the real Axios adapter is pinned to arraybuffer.
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error('Ergo node response body must be raw bytes');
}
