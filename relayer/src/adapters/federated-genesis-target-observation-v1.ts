import { createHash } from 'node:crypto';
import { assertNoDuplicateJsonKeys } from '../ergo-settlement-core/strict-json.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const SUDO_KEY = '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;
const PROFILE_KEY = '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde';
const ENFORCEMENT_KEY = '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1';

/** Read-only height-zero preflight. Process custody is checked by the app caller. */
export async function observeFederatedGenesisReservationTargetV1(input: Readonly<{
  expectedStorage: Readonly<Record<string, string>>;
  expectedGenesisHashHex: string;
  sourceRuntimeCodeSha256Hex: string;
  sourceRuntimeCodeBytes: number;
  runtimeProfileScaleHex: string;
  operatorStorageKeyHex: string;
  operatorAccountInfoHex: string;
}>): Promise<Readonly<{ genesisHashHex: string; nonce: number }>> {
  const fields = ['expectedStorage', 'expectedGenesisHashHex', 'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes', 'runtimeProfileScaleHex', 'operatorStorageKeyHex', 'operatorAccountInfoHex'];
  if (input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertyNames(input).length !== fields.length || Object.getOwnPropertySymbols(input).length !== 0
    || fields.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('FED reservation observation requires exact own-data fields');
  const { expectedGenesisHashHex, sourceRuntimeCodeSha256Hex, sourceRuntimeCodeBytes,
    runtimeProfileScaleHex, operatorStorageKeyHex, operatorAccountInfoHex } = input;
  const expected = captureStorage(input.expectedStorage);
  const codeHex = expected['0x3a636f6465'];
  if ([expectedGenesisHashHex, sourceRuntimeCodeSha256Hex, runtimeProfileScaleHex, operatorStorageKeyHex,
    operatorAccountInfoHex].some(value => typeof value !== 'string')
    || !/^0x[0-9a-f]{64}$/.test(expectedGenesisHashHex) || /^0x0+$/.test(expectedGenesisHashHex)
    || !/^[0-9a-f]{64}$/.test(sourceRuntimeCodeSha256Hex)
    || !Number.isSafeInteger(sourceRuntimeCodeBytes) || sourceRuntimeCodeBytes < 8 || sourceRuntimeCodeBytes > 16 * 1024 * 1024
    || typeof codeHex !== 'string' || codeHex.length !== 2 + sourceRuntimeCodeBytes * 2
    || createHash('sha256').update(Buffer.from(codeHex.slice(2), 'hex')).digest('hex') !== sourceRuntimeCodeSha256Hex
    || !/^0x[0-9a-f]{698}$/.test(runtimeProfileScaleHex) || expected[PROFILE_KEY] !== runtimeProfileScaleHex
    || expected[ENFORCEMENT_KEY] !== '0x01'
    || !/^0x[0-9a-f]{136}$/.test(operatorStorageKeyHex)
    || !/^0x[0-9a-f]{160}$/.test(operatorAccountInfoHex) || expected[operatorStorageKeyHex] !== operatorAccountInfoHex) {
    throw new Error('FED reservation storage differs from compiled runtime, profile or funded operator');
  }
  const account = Buffer.from(operatorAccountInfoHex.slice(2), 'hex');
  const nonce = account.readUInt32LE(0);
  if (nonce !== 0 || account.readBigUInt64LE(16) + account.readBigUInt64LE(24) === 0n) {
    throw new Error('FED reservation requires the unused funded genesis account');
  }
  const genesisHashHex = await observeFederatedGenesisTargetsV1(expected);
  if (genesisHashHex !== expectedGenesisHashHex) throw new Error('FED reservation genesis differs from selected target');
  // The first node may advance while the second is read. Recheck both after storage comparison.
  for (const url of [PRIMARY, WITNESS]) {
    const pending = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pending) || pending.length !== 0
      || await rpc(url, 'chain_getBlockHash', [0]) !== genesisHashHex
      || record(await rpc(url, 'chain_getHeader', [])).number !== '0x0') {
      throw new Error('FED reservation target changed before signing');
    }
  }
  return Object.freeze({ genesisHashHex, nonce });
}

/** Observations of the two fixed local targets; never a mint authorization. */
export async function observeFederatedGenesisTargetsV1(expected: Readonly<Record<string, string>>): Promise<string> {
  const captured = captureStorage(expected);
  const primary = await observeGenesis(PRIMARY, captured);
  const witness = await observeGenesis(WITNESS, captured);
  if (primary !== witness) throw new Error('FED nodes disagree on genesis');
  return primary;
}

function captureStorage(expected: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  if (expected === null || typeof expected !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(expected))) {
    throw new Error('FED expected storage requires bounded exact data fields');
  }
  const descriptors = Object.getOwnPropertyDescriptors(expected);
  const keys = Object.getOwnPropertyNames(descriptors);
  if (keys.length < 4 || keys.length > 256 || Object.getOwnPropertySymbols(descriptors).length !== 0
    || keys.includes(SUDO_KEY) || keys.some(key => !/^0x(?:[0-9a-f]{2})+$/.test(key)
      || !descriptors[key]?.enumerable || !('value' in descriptors[key]!)
      || typeof descriptors[key]!.value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(descriptors[key]!.value))) {
    throw new Error('FED expected storage requires bounded exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value as string])));
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
