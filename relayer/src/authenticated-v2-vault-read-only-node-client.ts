import type { AxiosResponse } from 'axios';

import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
  type AuthenticatedSpvTrackerReadOnlyNodeClientOptions,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  AUTHENTICATED_V2_VAULT_MAX_BOXES,
  type AuthenticatedV2VaultChainSource,
} from './authenticated-v2-vault-reconstruction.js';
import { parseNodeJsonPreservingPowDistance } from './ergo-node-json.js';

export const AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE = 16;
export const AUTHENTICATED_V2_VAULT_MAX_ADDRESS_BYTES = 64 * 1024 * 1024;
export const AUTHENTICATED_V2_VAULT_ADDRESS_DEADLINE_MS = 120_000;
export const AUTHENTICATED_V2_VAULT_MAX_ADDRESS_LENGTH = 16_384;

const NODE_REQUEST_TIMEOUT_MS = 30_000;
const MAX_ADDRESS_PAGES = Math.ceil(
  AUTHENTICATED_V2_VAULT_MAX_BOXES / AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE,
);

export interface AuthenticatedV2VaultReadOnlyNodeClientOptions
  extends AuthenticatedSpvTrackerReadOnlyNodeClientOptions {
  maxAddressBytes?: number;
  addressDeadlineMs?: number;
}

/**
 * Credential-free read adapter for the indexed settlement-vault surfaces.
 * The indexed node exposes address scans as POST requests, but this adapter
 * has no check, wallet, signing, submission, or broadcast capability.
 */
export class AuthenticatedV2VaultReadOnlyNodeClient
  extends AuthenticatedSpvTrackerReadOnlyNodeClient
  implements AuthenticatedV2VaultChainSource {
  private readonly maxAddressBytes: number;
  private readonly addressDeadlineMs: number;

  constructor(
    nodeUrl: string,
    options: AuthenticatedV2VaultReadOnlyNodeClientOptions = {},
  ) {
    super(nodeUrl, options);
    this.maxAddressBytes = positiveSafeInteger(
      options.maxAddressBytes ?? AUTHENTICATED_V2_VAULT_MAX_ADDRESS_BYTES,
      'vault address-index byte bound',
    );
    this.addressDeadlineMs = positiveSafeInteger(
      options.addressDeadlineMs ?? AUTHENTICATED_V2_VAULT_ADDRESS_DEADLINE_MS,
      'vault address-index deadline',
    );
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    return this.getAddressBoxes('/blockchain/box/byAddress', address, 'indexed vault history');
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    return this.getAddressBoxes(
      '/blockchain/box/unspent/byAddress',
      address,
      'current vault UTXO set',
    );
  }

  private async getAddressBoxes(
    path: string,
    addressValue: unknown,
    label: string,
  ): Promise<unknown[]> {
    const address = normalizedAddress(addressValue, `${label} address`);
    const boxes: unknown[] = [];
    let expectedTotal: number | null = null;
    let offset = 0;
    let pageCount = 0;
    let accumulatedBytes = 0;
    const deadline = this.now() + this.addressDeadlineMs;
    if (!Number.isSafeInteger(deadline)) {
      throw new Error(`${label} deadline exceeds the safe integer range`);
    }

    for (;;) {
      if (pageCount >= MAX_ADDRESS_PAGES) {
        throw new Error(`${label} exceeds the bounded page count`);
      }
      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) throw new Error(`${label} exceeded its aggregate deadline`);
      const { data, rawBytes } = await this.postRawJson(path, JSON.stringify(address), {
        offset,
        limit: AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE,
        sortDirection: 'asc',
        includeUnconfirmed: false,
        excludeMempoolSpent: false,
      }, Math.min(NODE_REQUEST_TIMEOUT_MS, remainingMs));
      pageCount += 1;
      if (this.now() > deadline) throw new Error(`${label} exceeded its aggregate deadline`);
      if (rawBytes > this.maxAddressBytes - accumulatedBytes) {
        throw new Error(`${label} exceeds the ${this.maxAddressBytes}-byte bound`);
      }
      accumulatedBytes += rawBytes;

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`${label} response must be a paginated object`);
      }
      if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(['items', 'total'])) {
        throw new Error(`${label} response fields do not match the canonical schema`);
      }
      if (!Array.isArray(data.items)) throw new Error(`${label} response must contain items`);
      const total = nonnegativeSafeInteger(data.total, `${label} total`);
      if (total > AUTHENTICATED_V2_VAULT_MAX_BOXES) {
        throw new Error(
          `${label} total ${total} exceeds the ${AUTHENTICATED_V2_VAULT_MAX_BOXES}-box bound`,
        );
      }
      if (expectedTotal === null) expectedTotal = total;
      if (expectedTotal !== total) {
        throw new Error(`${label} total changed from ${expectedTotal} to ${total}`);
      }
      const expectedItems = Math.min(
        AUTHENTICATED_V2_VAULT_ADDRESS_PAGE_SIZE,
        total - boxes.length,
      );
      if (data.items.length !== expectedItems) {
        throw new Error(
          `${label} page at offset ${offset} must contain exactly ${expectedItems} items`,
        );
      }
      boxes.push(...data.items);
      if (boxes.length > total) throw new Error(`${label} returned more than total ${total}`);
      if (boxes.length === total) return boxes;
      offset += data.items.length;
    }
  }

  private async postRawJson(
    path: string,
    body: string,
    params: Record<string, string | number | boolean>,
    requestedTimeout: number,
  ): Promise<{ data: any; rawBytes: number }> {
    const timeout = this.consumeReconstructionRequest(requestedTimeout);
    const controller = new AbortController();
    const wallClockTimer = setTimeout(() => controller.abort(), timeout);
    let response: AxiosResponse<ArrayBuffer>;
    try {
      response = await this.client.post<ArrayBuffer>(path, body, {
        params,
        timeout,
        signal: controller.signal,
        responseType: 'arraybuffer',
        decompress: false,
        transformResponse: [(value: unknown) => value],
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          'vault address-index request exceeded its wall-clock or reconstruction deadline',
        );
      }
      throw error;
    } finally {
      clearTimeout(wallClockTimer);
    }

    const rawBody = rawResponseBody(response.data);
    const rawBytes = rawBody.length;
    this.consumeReconstructionBytes(rawBytes);
    const contentEncoding = response.headers?.['content-encoding'];
    if (
      contentEncoding !== undefined
      && String(contentEncoding).trim().toLowerCase() !== 'identity'
    ) {
      throw new Error('Ergo node response must use identity content encoding');
    }
    const status = response.status ?? 200;
    if (status < 200 || status >= 300) {
      throw new Error(`Ergo node request failed with HTTP status ${status}`);
    }
    const rawText = rawBody.toString('utf8');
    if (!Buffer.from(rawText, 'utf8').equals(rawBody)) {
      throw new Error('Ergo node response body must use canonical UTF-8');
    }
    return { data: parseNodeJsonPreservingPowDistance(rawText), rawBytes };
  }
}

export function createBoundedAuthenticatedV2VaultReadOnlySource(
  nodeUrl: string,
): AuthenticatedV2VaultChainSource {
  return new AuthenticatedV2VaultReadOnlyNodeClient(nodeUrl);
}

function normalizedAddress(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > AUTHENTICATED_V2_VAULT_MAX_ADDRESS_LENGTH
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical base58 string`);
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
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error('Ergo node response body must be raw bytes');
}
