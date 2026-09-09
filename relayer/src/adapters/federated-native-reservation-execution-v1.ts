import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import blakejs from 'blakejs';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const ATTEMPT_FILE = 'native-reservation-attempt.json';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;
const attempts = new WeakMap<object, {
  directory: string; bytes: string; submitted: boolean; accepted: boolean; sealed: boolean; blockHash?: string;
}>();

export interface FederatedNativeReservationAttemptV1 {
  readonly genesisHashHex: string;
  readonly extrinsicHashHex: string;
  readonly signedExtrinsicHex: string;
}

/** An exclusive durable hold, never authorization to submit or mint. No restart replay. */
export function reserveFederatedNativeReservationAttemptV1(
  directory: string, candidate: Readonly<FederatedNativeReservationAttemptV1>,
): Readonly<FederatedNativeReservationAttemptV1> {
  exact(candidate, ['genesisHashHex', 'extrinsicHashHex', 'signedExtrinsicHex']);
  const { genesisHashHex, extrinsicHashHex, signedExtrinsicHex } = candidate;
  hash(genesisHashHex); hash(extrinsicHashHex);
  if (typeof signedExtrinsicHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,70000}$/.test(signedExtrinsicHex)
    || `0x${Buffer.from(blakejs.blake2b(Buffer.from(signedExtrinsicHex.slice(2), 'hex'), undefined, 32)).toString('hex')}` !== extrinsicHashHex) {
    throw new Error('native reservation attempt has different extrinsic bytes');
  }
  if (typeof directory !== 'string' || !isAbsolute(directory) || !lstatSync(directory).isDirectory()
    || lstatSync(directory).isSymbolicLink() || resolve(realpathSync(directory)) !== resolve(directory)) {
    throw new Error('native reservation requires a direct existing attempt directory');
  }
  const attempt = Object.freeze({ genesisHashHex, extrinsicHashHex, signedExtrinsicHex });
  const bytes = JSON.stringify({ schema: 'e2s.fed-native-reservation-attempt.v1', status: 'reserved', ...attempt });
  const fd = openSync(join(directory, ATTEMPT_FILE), 'wx');
  try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  attempts.set(attempt, { directory, bytes, submitted: false, accepted: false, sealed: false });
  assertAttempt(attempt);
  return attempt;
}

/** The app revalidates custody and explicitly authorizes this exact one-shot transport. */
export async function submitFederatedNativeReservationV1(
  attempt: Readonly<FederatedNativeReservationAttemptV1>, authorize: () => void,
): Promise<void> {
  const state = assertAttempt(attempt);
  if (state.submitted || typeof authorize !== 'function') throw new Error('native reservation submission is consumed or unauthorized');
  state.submitted = true;
  authorize();
  assertAttempt(attempt);
  if (await rpc(PRIMARY, 'author_submitExtrinsic', [attempt.signedExtrinsicHex]) !== attempt.extrinsicHashHex) {
    throw new Error('native reservation submission did not return the exact extrinsic hash; attempt remains held');
  }
  state.accepted = true;
}

/** Seal only the submitted reservation on the owned genesis parent; no GRANDPA finalization. */
export async function sealFederatedNativeReservationV1(
  attempt: Readonly<FederatedNativeReservationAttemptV1>, authorize: () => void,
): Promise<string> {
  const state = assertAttempt(attempt);
  if (!state.accepted || state.sealed || typeof authorize !== 'function') throw new Error('native reservation sealing is not available');
  state.sealed = true;
  for (const url of [PRIMARY, WITNESS]) {
    authorize();
    if (await rpc(url, 'chain_getBlockHash', [0]) !== attempt.genesisHashHex
      || record(await rpc(url, 'chain_getHeader', [])).number !== '0x0') {
      throw new Error('native reservation parent changed before sealing');
    }
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pool) || pool.length > 1 || (url === PRIMARY && pool.length !== 1)
      || pool.some(value => value !== attempt.signedExtrinsicHex)) throw new Error('native reservation pool is not exclusive');
  }
  authorize(); assertAttempt(attempt);
  const result = record(await rpc(PRIMARY, 'engine_createBlock', [false, false, attempt.genesisHashHex]));
  hash(result.hash);
  if (result.hash === attempt.genesisHashHex) throw new Error('native reservation seal returned its parent');
  state.blockHash = result.hash;
  return result.hash as string;
}

/** Exact paired local inclusion/state observation. Not finality or mint authority. */
export async function observeFederatedNativeReservationInclusionV1(input: Readonly<{
  attempt: Readonly<FederatedNativeReservationAttemptV1>;
  blockHashHex: string;
  expectedStorage: Readonly<Record<string, string | null>>;
  operatorStorageKeyHex: string;
  originalOperatorAccountHex: string;
}>, assertCurrent: () => void) {
  exact(input, ['attempt', 'blockHashHex', 'expectedStorage', 'operatorStorageKeyHex', 'originalOperatorAccountHex']);
  const { attempt, blockHashHex, operatorStorageKeyHex, originalOperatorAccountHex } = input;
  const state = assertAttempt(attempt);
  if (!state.sealed || state.blockHash !== blockHashHex || typeof assertCurrent !== 'function') throw new Error('native reservation was not sealed');
  hash(blockHashHex);
  const storage = captureStorage(input.expectedStorage);
  if (typeof operatorStorageKeyHex !== 'string' || !/^0x[0-9a-f]{136}$/.test(operatorStorageKeyHex)
    || typeof originalOperatorAccountHex !== 'string' || !/^0x[0-9a-f]{160}$/.test(originalOperatorAccountHex)) {
    throw new Error('native reservation operator state is malformed');
  }
  const original = Buffer.from(originalOperatorAccountHex.slice(2), 'hex');
  if (original.readUInt32LE(0) !== 0) throw new Error('native reservation original nonce must be zero');
  let agreed: string | undefined;
  let agreedAccount: string | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    // Only witness propagation may lag. No resubmission or second sealing attempt.
    for (let probe = 0; ; probe++) {
      assertCurrent(); assertAttempt(attempt);
      const found = await rpc(url, 'chain_getBlockHash', [1]);
      if (found === blockHashHex) break;
      if (url !== WITNESS || found !== null || probe === 19) throw new Error('native reservation inclusion block is absent or divergent');
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    const block = record(record(await rpc(url, 'chain_getBlock', [blockHashHex])).block);
    const header = record(block.header);
    exact(header, ['parentHash', 'number', 'stateRoot', 'extrinsicsRoot', 'digest']);
    hash(header.parentHash); hash(header.stateRoot); hash(header.extrinsicsRoot);
    exact(header.digest, ['logs']);
    const logs = record(header.digest).logs;
    if (!Array.isArray(logs) || logs.length > 32 || logs.some(value => typeof value !== 'string'
      || !/^0x(?:[0-9a-f]{2}){1,16384}$/.test(value))
      || header.number !== '0x1' || header.parentHash !== attempt.genesisHashHex) {
      throw new Error('native reservation header differs from the selected first block');
    }
    const extrinsics = block.extrinsics;
    if (!Array.isArray(extrinsics) || extrinsics.length !== 2 || extrinsics[1] !== attempt.signedExtrinsicHex
      || !isTimestampInherent(extrinsics[0])) throw new Error('native reservation block does not contain the exact exclusive call');
    const encoded = canonicalJson({ header, extrinsics });
    if (agreed !== undefined && agreed !== encoded) throw new Error('native reservation nodes disagree on block contents');
    agreed = encoded;
    for (const [key, value] of Object.entries(storage)) {
      assertCurrent();
      if (await rpc(url, 'state_getStorage', [key, blockHashHex]) !== value) throw new Error('native reservation state differs from the original proof');
    }
    const accountHex = await rpc(url, 'state_getStorage', [operatorStorageKeyHex, blockHashHex]);
    if (typeof accountHex !== 'string' || !/^0x[0-9a-f]{160}$/.test(accountHex)) throw new Error('native reservation operator account is absent');
    const account = Buffer.from(accountHex.slice(2), 'hex');
    const free = (bytes: Buffer) => bytes.readBigUInt64LE(16) + (bytes.readBigUInt64LE(24) << 64n);
    if (account.readUInt32LE(0) !== 1 || !account.subarray(4, 16).equals(original.subarray(4, 16))
      || !account.subarray(32).equals(original.subarray(32)) || free(account) === 0n || free(account) > free(original)) {
      throw new Error('native reservation operator nonce or funding differs after inclusion');
    }
    if (agreedAccount !== undefined && agreedAccount !== accountHex) throw new Error('native reservation operator state disagrees');
    agreedAccount = accountHex;
  }
  for (const url of [PRIMARY, WITNESS]) {
    assertCurrent(); assertAttempt(attempt);
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pool) || pool.length !== 0 || await rpc(url, 'chain_getBlockHash', [0]) !== attempt.genesisHashHex
      || await rpc(url, 'chain_getBlockHash', [1]) !== blockHashHex
      || await rpc(url, 'chain_getBlockHash', []) !== blockHashHex) throw new Error('native reservation target changed during inclusion observation');
  }
  assertCurrent(); assertAttempt(attempt);
  return Object.freeze({ blockHashHex, blockHeight: 1 as const, extrinsicIndex: 1 as const,
    extrinsicHashHex: attempt.extrinsicHashHex, sourceFinalityEstablished: false as const, mintAuthorized: false as const });
}

function assertAttempt(attempt: Readonly<FederatedNativeReservationAttemptV1>) {
  const state = attempts.get(attempt);
  if (!state) throw new Error('native reservation attempt is not original');
  const path = join(state.directory, ATTEMPT_FILE);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(state.bytes)
    || resolve(realpathSync(state.directory)) !== resolve(state.directory)
    || readFileSync(path, 'utf8') !== state.bytes) throw new Error('native reservation durable hold changed');
  return state;
}

function captureStorage(input: Readonly<Record<string, string | null>>) {
  const fields = Object.getOwnPropertyNames(record(input));
  exact(input, fields);
  if (fields.length < 7 || fields.length > 16 || fields.some(key => !/^0x(?:[0-9a-f]{2}){1,128}$/.test(key)
    || input[key] !== null && (typeof input[key] !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(input[key]!)))) {
    throw new Error('native reservation expected storage is malformed');
  }
  return Object.freeze(Object.fromEntries(fields.map(key => [key, input[key]])));
}

function exact(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length || fields.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('native reservation requires exact own-data fields');
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('native reservation RPC object required');
  return value as Record<string, unknown>;
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || /^0x0+$/.test(value)) throw new Error('native reservation hash is malformed');
}

function isTimestampInherent(value: unknown): boolean {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2}){5,16}$/.test(value)) return false;
  const bytes = Buffer.from(value.slice(2), 'hex');
  // Pinned runtime: short SCALE body, unsigned v4, Timestamp pallet 1 / set call 0.
  if (bytes[0] !== (bytes.length - 1) * 4 || bytes.subarray(1, 4).toString('hex') !== '040100') return false;
  const moment = bytes.subarray(4);
  const mode = moment[0]! & 3;
  const length = mode === 3 ? (moment[0]! >>> 2) + 4 : [1, 2, 4][mode]!;
  if (mode === 3) return length <= 8 && moment.length === length + 1 && moment[length] !== 0
    && (length > 4 || moment[4]! >= 0x40);
  if (moment.length !== length) return false;
  const number = mode === 0 ? moment[0]! >>> 2 : mode === 1 ? moment.readUInt16LE() >>> 2 : moment.readUInt32LE() >>> 2;
  return number >= [1, 64, 16384][mode]!;
}

async function rpc(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel(); throw new Error('native reservation RPC failed; attempt remains held');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('native reservation RPC exceeds byte limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  assertNoDuplicateJsonKeys(text);
  const payload = record(JSON.parse(text));
  exact(payload, ['jsonrpc', 'id', 'result']);
  if (payload.jsonrpc !== '2.0' || payload.id !== 1) throw new Error('native reservation RPC envelope mismatch');
  return payload.result;
}
