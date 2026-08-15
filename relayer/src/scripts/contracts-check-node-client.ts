import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { Address, type ErgoTree } from 'ergo-lib-wasm-nodejs';

import { validateReadOnlyNodeUrl } from '../read-only-node-url.js';
import { parseStrictJson } from '../strict-json.js';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INFO_RESPONSE_BYTES = 64 * 1024;
const MAX_COMPILE_SOURCE_BYTES = 512 * 1024;
const MAX_COMPILE_RESPONSE_BYTES = 16 * 1024;
const MAX_COMPILED_ADDRESS_LENGTH = 8 * 1024;

export interface ContractCompilerClient {
  getInfo(): Promise<{ fullHeight: number }>;
  compileContract(
    source: string,
    treeVersion?: number,
  ): Promise<{ address: string; ergoTreeHex: string }>;
}

/** Credential-free compiler client for contracts:check only. */
export function createContractsCheckNodeClient(
  nodeUrl: string,
): ContractCompilerClient {
  const nodeUrlErrors = validateReadOnlyNodeUrl(nodeUrl, 'Ergo compiler node URL');
  let parsedNodeUrl: URL | undefined;
  try {
    parsedNodeUrl = new URL(nodeUrl);
  } catch {
    // The shared validator supplies the public parse error below.
  }
  if (
    nodeUrl.length === 0
    || nodeUrlErrors.length > 0
    || !parsedNodeUrl
    || parsedNodeUrl.username.length > 0
    || parsedNodeUrl.password.length > 0
    || parsedNodeUrl.search.length > 0
    || parsedNodeUrl.hash.length > 0
    || parsedNodeUrl.pathname !== '/'
  ) {
    throw new Error(
      nodeUrlErrors.join('; ')
        || 'Ergo compiler node URL must be a credential-free HTTP(S) origin',
    );
  }
  const client = axios.create({
    baseURL: parsedNodeUrl.origin,
    headers: { 'Content-Type': 'application/json' },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    decompress: false,
    maxContentLength: MAX_INFO_RESPONSE_BYTES,
    maxBodyLength: MAX_COMPILE_SOURCE_BYTES,
    validateStatus: () => true,
  });
  return Object.freeze({
    async getInfo() {
      const info = await requestJson(
        client,
        '/info',
        'GET',
        undefined,
        MAX_INFO_RESPONSE_BYTES,
      );
      if (
        info === null
        || typeof info !== 'object'
        || Array.isArray(info)
        || !Number.isSafeInteger((info as Record<string, unknown>).fullHeight)
        || Number((info as Record<string, unknown>).fullHeight) < 0
      ) {
        throw new Error('Ergo compiler node info lacks a valid fullHeight');
      }
      return { fullHeight: Number((info as Record<string, unknown>).fullHeight) };
    },

    async compileContract(source: string, treeVersion = 0) {
      if (treeVersion !== 0) {
        throw new Error('contracts:check supports only ErgoTree version 0');
      }
      if (
        typeof source !== 'string'
        || source.length === 0
        || source.includes('\0')
        || Buffer.byteLength(source, 'utf8') > MAX_COMPILE_SOURCE_BYTES
      ) {
        throw new Error('contracts:check source is invalid or exceeds its byte bound');
      }
      const response = await requestJson(
        client,
        '/script/p2sAddress',
        'POST',
        { source, treeVersion },
        MAX_COMPILE_RESPONSE_BYTES,
      );
      if (
        response === null
        || typeof response !== 'object'
        || Array.isArray(response)
        || JSON.stringify(Object.keys(response).sort())
          !== JSON.stringify(['address'])
      ) {
        throw new Error('P2S compile response fields must be exactly address');
      }
      const addressValue = normalizedAddress(
        (response as Record<string, unknown>).address,
      );
      let address: Address | undefined;
      let tree: ErgoTree | undefined;
      try {
        address = Address.from_base58(addressValue);
        tree = address.to_ergo_tree();
        return {
          address: addressValue,
          ergoTreeHex: tree.to_base16_bytes().toLowerCase(),
        };
      } catch {
        throw new Error('Ergo compiler node returned an invalid P2S address');
      } finally {
        tree?.free();
        address?.free();
      }
    },
  });
}

async function requestJson(
  client: AxiosInstance,
  path: string,
  method: 'GET' | 'POST',
  data: unknown,
  maxResponseBytes: number,
): Promise<unknown> {
  const response: AxiosResponse<ArrayBuffer> = await client.request({
    url: path,
    method,
    data,
    responseType: 'arraybuffer',
    transformResponse: [(value: unknown) => value],
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Ergo compiler node returned HTTP ${response.status}`);
  }
  const contentEncoding = response.headers?.['content-encoding'];
  if (
    contentEncoding !== undefined
    && String(contentEncoding).trim().toLowerCase() !== 'identity'
  ) {
    throw new Error('Ergo compiler node response must use identity encoding');
  }
  const raw = rawResponseBody(response.data);
  if (raw.length === 0 || raw.length > maxResponseBytes) {
    throw new Error(
      `Ergo compiler node response exceeds the ${maxResponseBytes}-byte bound`,
    );
  }
  const text = raw.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(raw)) {
    throw new Error('Ergo compiler node response must use canonical UTF-8');
  }
  return parseStrictJson(text, 'Ergo compiler node response');
}

function normalizedAddress(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > MAX_COMPILED_ADDRESS_LENGTH
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error('P2S compile response address must be canonical base58');
  }
  return value;
}

function rawResponseBody(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
  }
  throw new Error('Ergo compiler node response must be raw bytes');
}
