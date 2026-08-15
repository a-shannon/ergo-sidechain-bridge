/**
 * Ergo Node Helpers & Sigma Encoding for Sidechain Bridge
 *
 * Node configuration and API access remain in this module. Side-effect-free
 * Sigma encoders live in ergo-encoding.ts so offline builders can import them
 * without reading node configuration or secret-bearing environment values.
 */

import axios from "axios";
import { parseNodeJsonPreservingPowDistance } from './ergo-node-json.js';

export {
  decodeAvlTreeRegisterDigest,
  decodeCollByteRegister,
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  ensureSizeBit,
  MINER_FEE,
  MINER_FEE_TREE,
  vlq,
} from './ergo-encoding.js';

// ======== CONFIGURATION ========
export const NODE = process.env.ERGO_NODE || "http://127.0.0.1:9052";
export const API_KEY = process.env.ERGO_API_KEY || "hello";

const headers = { api_key: API_KEY, "Content-Type": "application/json" };
const LAST_HEADERS_PATH = /^\/blocks\/lastHeaders\/[1-9][0-9]*$/;

function nodeGetOptions(path: string, base: Record<string, unknown>): Record<string, unknown> {
  if (!LAST_HEADERS_PATH.test(path)) return base;
  return {
    ...base,
    responseType: 'text',
    transformResponse: [(value: unknown) => value],
  };
}

function decodeNodeGetResponse(path: string, value: unknown): unknown {
  if (!LAST_HEADERS_PATH.test(path)) return value;
  if (typeof value !== 'string') {
    throw new Error('node lastHeaders response must remain raw JSON until exact parsing');
  }
  return parseNodeJsonPreservingPowDistance(value);
}

// ======== NODE API ========
export async function nget(path: string): Promise<any> {
  try {
    const r = await axios.get(
      `${NODE}${path}`,
      nodeGetOptions(path, { headers: { api_key: API_KEY } }),
    );
    return decodeNodeGetResponse(path, r.data);
  } catch (e: any) {
    const detail = e.response?.data?.detail || e.response?.data || e.message;
    const msg = typeof detail === 'string' ? detail.substring(0, 200) : JSON.stringify(detail).substring(0, 200);
    console.error(`  [node] ERROR GET ${path}: ${msg}`);
    return null;
  }
}

export async function ngetDirect(path: string, nodeOrigin: string = NODE): Promise<any> {
  try {
    const r = await axios.get(`${nodeOrigin}${path}`, nodeGetOptions(path, {
      maxRedirects: 0,
      proxy: false,
      timeout: 30_000,
    }));
    return decodeNodeGetResponse(path, r.data);
  } catch (e: any) {
    const detail = e.response?.data?.detail || e.response?.data || e.message;
    const msg = typeof detail === 'string' ? detail.substring(0, 200) : JSON.stringify(detail).substring(0, 200);
    console.error(`  [node] ERROR DIRECT GET ${path}: ${msg}`);
    return null;
  }
}

export async function npost(path: string, data: any): Promise<any> {
  assertNonBroadcastNodePostPath(path);
  return await npostDirect(path, data, NODE);
}

export function assertNonBroadcastNodePostPath(path: string): void {
  const normalizedPath = path.split(/[?#]/u, 1)[0].replace(/\/+$/u, '') || '/';
  if (normalizedPath === '/transactions') {
    throw new Error(
      'generic node POST helper cannot submit transactions; use an explicitly reviewed transport capability',
    );
  }
}

export async function npostDirect(path: string, data: any, nodeOrigin: string = NODE): Promise<any> {
  try {
    const r = await axios.post(`${nodeOrigin}${path}`, data, {
      headers,
      maxRedirects: 0,
      proxy: false,
      timeout: 30_000,
    });
    return r.data;
  } catch (e: any) {
    const status = e.response?.status || 'no-response';
    const detail = e.response?.data?.detail || e.response?.data || e.message;
    const msg = typeof detail === 'string' ? detail.substring(0, 500) : JSON.stringify(detail).substring(0, 500);
    console.error(`  [node] ERROR POST ${path} (HTTP ${status}): ${msg}`);
    return null;
  }
}

export async function ncheck(
  path: string,
  data: any,
  nodeOrigin: string = NODE,
  options: Readonly<{ redactResponseBodyOnError?: boolean }> = {},
): Promise<any> {
  try {
    const r = await axios.post(`${nodeOrigin}${path}`, data, {
      headers: { "Content-Type": "application/json" },
      maxRedirects: 0,
      proxy: false,
      timeout: 30_000,
    });
    return r.data;
  } catch (e: any) {
    const status = e.response?.status || 'no-response';
    const detail = options.redactResponseBodyOnError
      ? '<redacted>'
      : e.response?.data?.detail || e.response?.data || e.message;
    const msg = typeof detail === 'string'
      ? detail.substring(0, 500)
      : JSON.stringify(detail).substring(0, 500);
    console.error(`  [node] ERROR CHECK ${path} (HTTP ${status}): ${msg}`);
    return null;
  }
}

export async function getHeight(): Promise<number> {
  const info = await nget("/info");
  return info?.fullHeight || 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a TX to be confirmed and return a matching output box ID.
 */
export async function waitForBox(
  txId: string,
  predicate: (out: any) => boolean,
  label: string,
  timeoutSec = 300
): Promise<string | null> {
  for (let attempt = 0; attempt < timeoutSec / 15; attempt++) {
    await sleep(15000);
    try {
      const td = await nget(`/blockchain/transaction/byId/${txId}`);
      if (td && td.numConfirmations >= 1) {
        for (const out of td.outputs || []) {
          if (predicate(out)) return out.boxId;
        }
      }
    } catch {}
    console.log(`   Waiting ${label}... (${(attempt + 1) * 15}s)`);
  }
  return null;
}

// ======== UTXO MAPPING ========

/**
 * UTXO Mapper: Coerce node API box fields to Fleet SDK EIP-12 format.
 *
 * The Ergo node API returns box values as strings ("51100000") and token
 * amounts as strings. local WASM signing needs these as
 * BigInt/Number for correct box serialization and boxId computation.
 * Without this mapping, the box is re-serialized with wrong types,
 * computes a different hash, and throws "boxId mismatch".
 *
 * MUST be applied to ALL input boxes before passing to local WASM signer.
 * This is the canonical mapper — all signing paths MUST use it.
 */
export function ensureEip12Box(box: any): any {
  return {
    ...box,
    value: typeof box.value === 'string' ? BigInt(box.value) : box.value,
    assets: (box.assets || []).map((a: any) => ({
      tokenId: a.tokenId,
      amount: typeof a.amount === 'string' ? BigInt(a.amount) : a.amount,
    })),
  };
}
