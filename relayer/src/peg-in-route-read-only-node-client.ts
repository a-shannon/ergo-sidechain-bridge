import type { AxiosResponse } from 'axios';

import {
  AuthenticatedV2VaultReadOnlyNodeClient,
  type AuthenticatedV2VaultReadOnlyNodeClientOptions,
} from './authenticated-v2-vault-read-only-node-client.js';
import { parseStrictJson } from './strict-json.js';

export const PEG_IN_ROUTE_MAX_COMPILE_SOURCE_BYTES = 512 * 1024;
export const PEG_IN_ROUTE_MAX_COMPILE_RESPONSE_BYTES = 4 * 1024;
export const PEG_IN_ROUTE_COMPILE_TIMEOUT_MS = 30_000;

export interface PegInRouteReadOnlyNodeClientOptions
  extends AuthenticatedV2VaultReadOnlyNodeClientOptions {
  maxCompileSourceBytes?: number;
  maxCompileResponseBytes?: number;
}

/**
 * Credential-free route observer. POST is limited to address-index reads and
 * deterministic P2S compilation; this class has no wallet, check, signing,
 * submission, or broadcast capability.
 */
export class PegInRouteReadOnlyNodeClient extends AuthenticatedV2VaultReadOnlyNodeClient {
  private readonly maxCompileSourceBytes: number;
  private readonly maxCompileResponseBytes: number;

  constructor(nodeUrl: string, options: PegInRouteReadOnlyNodeClientOptions = {}) {
    super(nodeUrl, options);
    this.maxCompileSourceBytes = positiveSafeInteger(
      options.maxCompileSourceBytes ?? PEG_IN_ROUTE_MAX_COMPILE_SOURCE_BYTES,
      'P2S compile source byte bound',
    );
    this.maxCompileResponseBytes = positiveSafeInteger(
      options.maxCompileResponseBytes ?? PEG_IN_ROUTE_MAX_COMPILE_RESPONSE_BYTES,
      'P2S compile response byte bound',
    );
  }

  async compileP2sAddress(sourceValue: unknown): Promise<string> {
    if (typeof sourceValue !== 'string' || sourceValue.length === 0 || sourceValue.includes('\0')) {
      throw new Error('P2S compile source must be non-empty text without NUL bytes');
    }
    const sourceBytes = Buffer.byteLength(sourceValue, 'utf8');
    if (sourceBytes > this.maxCompileSourceBytes) {
      throw new Error(`P2S compile source exceeds the ${this.maxCompileSourceBytes}-byte bound`);
    }
    const timeout = this.consumeReconstructionRequest(PEG_IN_ROUTE_COMPILE_TIMEOUT_MS);
    const controller = new AbortController();
    const wallClockTimer = setTimeout(() => controller.abort(), timeout);
    let response: AxiosResponse<ArrayBuffer>;
    try {
      response = await this.client.post<ArrayBuffer>(
        '/script/p2sAddress',
        { source: sourceValue, treeVersion: 0 },
        {
          timeout,
          signal: controller.signal,
          responseType: 'arraybuffer',
          decompress: false,
          transformResponse: [(value: unknown) => value],
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('P2S compilation exceeded its wall-clock deadline');
      }
      throw error;
    } finally {
      clearTimeout(wallClockTimer);
    }

    const rawBody = rawResponseBody(response.data);
    if (rawBody.length > this.maxCompileResponseBytes) {
      throw new Error(
        `P2S compile response exceeds the ${this.maxCompileResponseBytes}-byte bound`,
      );
    }
    this.consumeReconstructionBytes(rawBody.length);
    const contentEncoding = response.headers?.['content-encoding'];
    if (
      contentEncoding !== undefined
      && String(contentEncoding).trim().toLowerCase() !== 'identity'
    ) {
      throw new Error('P2S compile response must use identity content encoding');
    }
    const status = response.status ?? 200;
    if (status < 200 || status >= 300) {
      throw new Error(`P2S compilation failed with HTTP status ${status}`);
    }
    const rawText = rawBody.toString('utf8');
    if (!Buffer.from(rawText, 'utf8').equals(rawBody)) {
      throw new Error('P2S compile response must use canonical UTF-8');
    }
    const parsed = parseStrictJson(rawText, 'P2S compile response');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('P2S compile response must be an object');
    }
    const record = parsed as Record<string, unknown>;
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['address'])) {
      throw new Error('P2S compile response fields must be exactly address');
    }
    return normalizedAddress(record.address, 'P2S compile response address');
  }
}

function normalizedAddress(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > 256
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical base58 string`);
  }
  return value;
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
  throw new Error('P2S compile response body must be raw bytes');
}
