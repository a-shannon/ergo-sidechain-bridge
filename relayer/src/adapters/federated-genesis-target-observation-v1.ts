import { assertNoDuplicateJsonKeys } from '../ergo-settlement-core/strict-json.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const SUDO_KEY = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;

/** Observations of the two fixed local targets; never a mint authorization. */
export async function observeFederatedGenesisTargetsV1(expected: Readonly<Record<string, string>>): Promise<string> {
  const descriptors = Object.getOwnPropertyDescriptors(expected);
  const keys = Object.getOwnPropertyNames(descriptors);
  if (keys.length < 4 || keys.length > 256 || Object.getOwnPropertySymbols(descriptors).length !== 0
    || keys.includes(SUDO_KEY) || keys.some(key => !/^0x(?:[0-9a-f]{2})+$/.test(key)
      || !descriptors[key]?.enumerable || !('value' in descriptors[key]!)
      || typeof descriptors[key]!.value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(descriptors[key]!.value))) {
    throw new Error('FED expected storage requires bounded exact data fields');
  }
  const captured = Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value as string])));
  const primary = await observeGenesis(PRIMARY, captured);
  const witness = await observeGenesis(WITNESS, captured);
  if (primary !== witness) throw new Error('FED nodes disagree on genesis');
  return primary;
}

async function observeGenesis(url: string, expected: Readonly<Record<string, string>>): Promise<string> {
  const genesis = await rpc(url, 'chain_getBlockHash', [0]);
  if (typeof genesis !== 'string' || !/^0x[0-9a-f]{64}$/.test(genesis)) throw new Error('FED genesis hash is malformed');
  if (record(await rpc(url, 'chain_getHeader', [])).number !== '0x0'
    || record(await rpc(url, 'chain_getHeader', [genesis])).number !== '0x0') {
    throw new Error('FED target is no longer at genesis');
  }
  for (const [key, value] of [...Object.entries(expected), [SUDO_KEY, null]]) {
    if (await rpc(url, 'state_getStorage', [key, genesis]) !== value) throw new Error('FED running storage differs from selected genesis');
  }
  const pending = await rpc(url, 'author_pendingExtrinsics', []);
  if (!Array.isArray(pending) || pending.length !== 0) throw new Error('FED genesis pool is not empty');
  if (await rpc(url, 'chain_getBlockHash', [0]) !== genesis
    || record(await rpc(url, 'chain_getHeader', [])).number !== '0x0') {
    throw new Error('FED genesis changed during observation');
  }
  return genesis;
}

async function rpc(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error('FED read-only RPC failed');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('FED RPC response exceeds byte limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  assertNoDuplicateJsonKeys(text);
  const payload = record(JSON.parse(text));
  if (Object.keys(payload).length !== 3 || !['jsonrpc', 'id', 'result'].every(key => Object.hasOwn(payload, key))) {
    throw new Error('FED RPC requires exact data fields');
  }
  if (payload.jsonrpc !== '2.0' || payload.id !== 1) throw new Error('FED RPC envelope mismatch');
  return payload.result;
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('FED object required');
  return value as Record<string, unknown>;
}
